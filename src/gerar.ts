import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Canvas, type CanvasRenderingContext2D } from "skia-canvas";
import { FontRender, defaultFontPath } from "../lib/minecraft-font-renderer/src/index.ts";
import { buildScene, type Poly } from "./scene.ts";
import { POSES } from "./poses.ts";
import { carregarSkin } from "./skin.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA_SKINS = join(RAIZ, "skins");
const PASTA_SAIDA = join(RAIZ, "saida");

type Pose = "CRUZADOS" | "SOLTOS" | "CINTURA";

const POSES_MENU: { id: Pose; nome: string; placa: string }[] = [
  { id: "CRUZADOS", nome: "Braços cruzados", placa: "rgba(0,0,0,0.63)" },
  { id: "SOLTOS", nome: "Braços soltos", placa: "rgba(0,0,0,0.25)" },
  { id: "CINTURA", nome: "Mãos na cintura", placa: "rgba(0,0,0,0.25)" },
];

// cor do nick = ultima cor (&0-&f) usada no prefixo, sem negrito
function corDoPrefixo(prefixo: string): string {
  let cor = "&f";
  for (let i = 0; i < prefixo.length - 1; i++) {
    if ((prefixo[i] === "&" || prefixo[i] === "§") && /[0-9a-fA-F]/.test(prefixo[i + 1]!)) cor = "&" + prefixo[i + 1]!.toLowerCase();
  }
  return cor;
}

function desenharPolys(ctx: CanvasRenderingContext2D, polys: Poly[], cor?: string) {
  for (const p of polys) {
    const [r, g, b, a] = p.rgba;
    const c = cor ?? `rgb(${r},${g},${b})`;
    ctx.beginPath();
    ctx.moveTo(p.pts[0]!, p.pts[1]!);
    ctx.lineTo(p.pts[2]!, p.pts[3]!);
    ctx.lineTo(p.pts[4]!, p.pts[5]!);
    ctx.lineTo(p.pts[6]!, p.pts[7]!);
    ctx.closePath();
    ctx.globalAlpha = cor ? 1 : a / 255;
    ctx.fillStyle = c;
    ctx.fill();
    if (cor || a === 255) {
      ctx.strokeStyle = c; // tampa as frestas entre os pixels
      ctx.lineWidth = 1.2;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function par(n: number): number {
  const v = Math.max(2, Math.round(n));
  return v % 2 === 0 ? v : v + 1;
}

// Renderiza texto Minecraft em um canvas proprio e devolve com o tamanho exato.
function renderizarTexto(font: FontRender, texto: string, alturaAlvo: number, larguraMax: number) {
  const ref = font.getTextSize(texto, { size: 2, hdFont: false });
  let size = par((alturaAlvo / Math.max(1, ref.height)) * 2);
  let medida = font.getTextSize(texto, { size, hdFont: false });
  while (medida.width > larguraMax && size > 2) {
    size -= 2;
    medida = font.getTextSize(texto, { size, hdFont: false });
  }
  const pad = 40;
  const w = Math.ceil(medida.width) + pad * 2;
  const h = Math.ceil(medida.height) + pad * 2;
  const canvas = new Canvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  font.fillText(ctx, texto, pad, pad, { size, hdFont: false, shadow: true });
  return { canvas, w, h, tw: Math.ceil(medida.width), th: Math.ceil(medida.height), pad };
}

function desenharPlaca(
  ctx: CanvasRenderingContext2D,
  font: FontRender,
  texto: string,
  cx: number,
  topo: number,
  altura: number,
  alturaTexto: number,
  larguraMax: number,
  corPlaca: string
) {
  const t = renderizarTexto(font, texto, alturaTexto, larguraMax - 160);
  const larguraPlaca = Math.min(larguraMax, t.tw + 160);
  const x = Math.round(cx - larguraPlaca / 2);
  ctx.fillStyle = corPlaca;
  ctx.fillRect(x, topo, larguraPlaca, altura);

  const tx = Math.round(cx - t.w / 2);
  const ty = Math.round(topo + altura / 2 - t.h / 2);

  // brilho suave atras do texto
  ctx.save();
  ctx.filter = "blur(14px)";
  ctx.globalAlpha = 0.65;
  ctx.drawImage(t.canvas, tx, ty);
  ctx.restore();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(t.canvas, tx, ty);
}

async function gerar(font: FontRender, pose: Pose, prefixo: string, nick: string, textoBaixo: string) {
  const def = POSES[pose]!;
  const placaCor = POSES_MENU.find((p) => p.id === pose)!.placa;
  const cor = corDoPrefixo(prefixo);
  const { skin, slim, origem } = await carregarSkin(nick, PASTA_SKINS);
  console.log(`  Skin: ${origem}${slim ? " (modelo slim)" : ""}`);

  const polys = buildScene(skin, slim, def.pose, def.view);

  const canvas = new Canvas(def.width, def.height);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // sombra (silhueta cinza deslocada)
  if (def.shadow.alpha > 0) {
    const sombra = new Canvas(def.width, def.height);
    const sctx = sombra.getContext("2d");
    desenharPolys(sctx, polys, "#000000");
    ctx.save();
    ctx.globalAlpha = def.shadow.alpha;
    ctx.drawImage(sombra, def.shadow.dx, def.shadow.dy);
    ctx.restore();
  }

  desenharPolys(ctx, polys);

  // nameplate: "<prefixo>&r&<cor> <nick>"  (nick sem negrito)
  const textoPlaca = `${prefixo}&r${cor} ${nick}`;
  desenharPlaca(ctx, font, textoPlaca, def.width / 2, 36, 196, 120, def.width - 40, placaCor);

  // texto de baixo (opcional)
  if (textoBaixo) {
    const t = renderizarTexto(font, `${cor}${textoBaixo}`, 190, def.width - 300);
    const larguraPlaca = Math.min(def.width - 200, t.tw + 160);
    const topo = def.height - 340;
    const x = Math.round(def.width / 2 - larguraPlaca / 2);
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, topo, larguraPlaca, 310);
    const tx = Math.round(def.width / 2 - t.w / 2), ty = Math.round(topo + 155 - t.h / 2);
    ctx.save();
    ctx.filter = "blur(14px)";
    ctx.globalAlpha = 0.6;
    ctx.drawImage(t.canvas, tx, ty);
    ctx.restore();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(t.canvas, tx, ty);
  }

  mkdirSync(PASTA_SAIDA, { recursive: true });
  const arquivo = join(PASTA_SAIDA, `${pose}_${nick}.png`);
  writeFileSync(arquivo, await canvas.toBuffer("png"));
  return arquivo;
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const font = new FontRender();
  await font.loadImages(defaultFontPath);

  console.log("==============================================");
  console.log("          GERADOR DE IMAGENS DE VIP");
  console.log("==============================================");
  console.log("Dica: Enter em branco repete o valor da vez anterior.\n");

  let ultimoPrefixo = "";
  let ultimaPose: Pose | null = null;

  for (;;) {
    // 1) prefixo
    const pf = (await rl.question(`Nome do VIP com cores (ex: &a&lVIP)${ultimoPrefixo ? ` [${ultimoPrefixo}]` : ""}: `)).trim();
    const prefixo = pf || ultimoPrefixo;
    if (!prefixo) { console.log("Digite o nome do VIP.\n"); continue; }

    // 2) pose
    console.log("\nPose:");
    POSES_MENU.forEach((p, i) => console.log(`  [${i + 1}] ${p.nome}`));
    const op = (await rl.question(`Escolha (1-3)${ultimaPose ? ` [${POSES_MENU.findIndex((p) => p.id === ultimaPose) + 1}]` : ""}: `)).trim();
    const pose: Pose | null = op === "" ? ultimaPose : (POSES_MENU[Number(op) - 1]?.id ?? null);
    if (!pose) { console.log("Opção inválida.\n"); continue; }

    // 3) nick
    const nick = (await rl.question("\nNickname: ")).trim();
    if (!/^[A-Za-z0-9_]{1,16}$/.test(nick)) { console.log("Nickname inválido (letras, números e _ até 16 caracteres).\n"); continue; }

    // 4) texto de baixo opcional
    const textoBaixo = (await rl.question("Texto embaixo (ex: 1 MÊS, Enter = nenhum): ")).trim().toUpperCase();

    ultimoPrefixo = prefixo;
    ultimaPose = pose;

    console.log("\nGerando...");
    try {
      const arq = await gerar(font, pose, prefixo, nick, textoBaixo);
      console.log(`Pronto! Salvo em: ${arq}\n`);
    } catch (e) {
      console.log(`Erro: ${(e as Error).message}\n`);
    }
    console.log("----------------------------------------------\n");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
