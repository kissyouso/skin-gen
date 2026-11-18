import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Canvas, loadImage } from "skia-canvas";
import { detectSlim, normalizeSkin, type Skin } from "./scene.ts";

export interface LoadedSkin { skin: Skin; slim: boolean; origem: string }

async function decode(buf: Buffer): Promise<Skin> {
  const img = await loadImage(buf);
  const canvas = new Canvas(img.width, img.height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, img.width, img.height);
  return normalizeSkin(new Uint8ClampedArray(id.data), img.width, img.height);
}

async function baixar(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "gerador-imagens" } });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

interface InfoMojang { slim: boolean | null; url: string | null }

async function infoMojang(nick: string): Promise<InfoMojang> {
  try {
    const p = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(nick)}`);
    if (!p.ok) return { slim: null, url: null };
    const { id } = (await p.json()) as { id: string };
    const s = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`);
    if (!s.ok) return { slim: null, url: null };
    const perfil = (await s.json()) as { properties?: { name: string; value: string }[] };
    const prop = perfil.properties?.find((x) => x.name === "textures");
    if (!prop) return { slim: null, url: null };
    const tex = JSON.parse(Buffer.from(prop.value, "base64").toString("utf8"));
    const model = tex?.textures?.SKIN?.metadata?.model as string | undefined;
    const url = tex?.textures?.SKIN?.url as string | undefined;
    return {
      slim: model === "slim" || model === "classic" ? model === "slim" : null,
      url: typeof url === "string" ? url : null,
    };
  } catch {
    return { slim: null, url: null };
  }
}

export async function carregarSkin(nick: string, pastaSkins: string): Promise<LoadedSkin> {
  const alvo = nick.toLowerCase();

  if (existsSync(pastaSkins)) {
    const achado = readdirSync(pastaSkins).find((f) => {
      const n = f.toLowerCase();
      return n === `${alvo}.png` || n === `${alvo}.slim.png` || n === `${alvo}.classic.png`;
    });
    if (achado) {
      const n = achado.toLowerCase();
      const forcar = n.endsWith(".slim.png") ? true : n.endsWith(".classic.png") ? false : null;
      const skin = await decode(readFileSync(join(pastaSkins, achado)));
      return { skin, slim: forcar ?? detectSlim(skin), origem: `arquivo local skins/${achado}` };
    }
  }

  const info = await infoMojang(nick);

  for (const url of [`https://vzge.me/skin/${encodeURIComponent(nick)}`, `https://vzge.me/skin/${encodeURIComponent(nick)}.png`]) {
    const b = await baixar(url);
    if (b) {
      try {
        const skin = await decode(b);
        return { skin, slim: info.slim ?? detectSlim(skin), origem: "vzge.me" };
      } catch { /* tenta o proximo */ }
    }
  }

  if (info.url) {
    const buf = await baixar(info.url);
    if (buf) {
      const skin = await decode(buf);
      return { skin, slim: info.slim ?? detectSlim(skin), origem: "Mojang" };
    }
  }

  const buf = await baixar(`https://minotar.net/skin/${encodeURIComponent(nick)}.png`);
  if (buf) {
    const skin = await decode(buf);
    return { skin, slim: info.slim ?? detectSlim(skin), origem: "minotar (fallback)" };
  }

  throw new Error(
    `Nao consegui baixar a skin de "${nick}". Verifique a internet ou coloque o arquivo em skins/${nick}.png`
  );
}
