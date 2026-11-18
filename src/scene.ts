// Renderizador 3D simples de skin do Minecraft -> lista de poligonos (um por pixel/texel).
// Sem dependencias: so matematica. O desenho em si e feito em gerar.ts com skia-canvas.

export type Vec = [number, number, number];
export type Rot = [number, number, number]; // graus [rx, ry, rz]

export interface Skin {
  data: Uint8ClampedArray | Uint8Array; // RGBA 64x64
  width: number;
  height: number;
}

export interface Pose {
  yaw: number;   // giro global do modelo (graus)
  pitch: number; // inclinacao global (camera olhando de cima = positivo)
  roll: number;
  head: Rot;
  body: Rot;
  rArm: Rot;
  lArm: Rot;
  rLeg: Rot;
  lLeg: Rot;
  rArmLow?: Rot; // antebraco (rotacao relativa ao cotovelo)
  lArmLow?: Rot;
  rArmOffset?: Vec;
  lArmOffset?: Vec;
}

export interface View {
  scale: number;  // pixels por unidade do modelo
  cx: number;     // posicao na tela do ponto "target"
  cy: number;
  dist: number;   // distancia da camera (perspectiva)
  target: Vec;    // ponto do modelo que fica em (cx, cy)
}

export interface Poly {
  pts: number[]; // x0,y0,x1,y1,x2,y2,x3,y3
  rgba: [number, number, number, number];
  depth: number;
}

const D2R = Math.PI / 180;

type Mat = number[][];

function rotMat(r: Rot): Mat {
  const [rx, ry, rz] = [r[0] * D2R, r[1] * D2R, r[2] * D2R];
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  const Rx: Mat = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]];
  const Ry: Mat = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const Rz: Mat = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]];
  return mul(Ry, mul(Rx, Rz));
}

function mul(a: Mat, b: Mat): Mat {
  const o: Mat = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      o[i]![j] = a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!;
  return o;
}

function transpose(m: Mat): Mat {
  return [[m[0]![0]!, m[1]![0]!, m[2]![0]!], [m[0]![1]!, m[1]![1]!, m[2]![1]!], [m[0]![2]!, m[1]![2]!, m[2]![2]!]];
}

function app(m: Mat, v: Vec): Vec {
  return [
    m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
    m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
    m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
  ];
}

const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

interface Link { pivot: Vec; rot: Rot }

interface Part {
  uv: [number, number];
  dims: Vec;                // w, h, d da caixa completa
  rows: [number, number];   // faixa de linhas (0..h) desta parte
  center: Vec;              // centro mundial desta faixa
  chain: Link[];            // transformacoes: primeiro a mais interna
  inflate: number;
  layer3d: boolean;
  owner: string;
  shellInflate: number;
  offset?: Vec;
}

interface Face {
  nU: number; nV: number;
  origin: Vec; du: Vec; dv: Vec; normal: Vec;
  uv: [number, number];
}

function facesOf(p: Part, inflate: number): Face[] {
  const [w, h, d] = p.dims;
  const [u, v] = p.uv;
  const [r0, r1] = p.rows;
  const n = r1 - r0;
  const ex = w + inflate * 2, ez = d + inflate * 2;
  const top = n / 2 + (r0 === 0 ? inflate : 0);
  const bot = -(n / 2 + (r1 === h ? inflate : 0));
  const ey = top - bot;
  const sx = ex / w, sy = ey / n, sz = ez / d;
  const faces: Face[] = [
    { nU: w, nV: n, origin: [-ex / 2, top, ez / 2], du: [sx, 0, 0], dv: [0, -sy, 0], normal: [0, 0, 1], uv: [u + d, v + d + r0] },
    { nU: w, nV: n, origin: [ex / 2, top, -ez / 2], du: [-sx, 0, 0], dv: [0, -sy, 0], normal: [0, 0, -1], uv: [u + 2 * d + w, v + d + r0] },
    { nU: d, nV: n, origin: [-ex / 2, top, -ez / 2], du: [0, 0, sz], dv: [0, -sy, 0], normal: [-1, 0, 0], uv: [u, v + d + r0] },
    { nU: d, nV: n, origin: [ex / 2, top, ez / 2], du: [0, 0, -sz], dv: [0, -sy, 0], normal: [1, 0, 0], uv: [u + d + w, v + d + r0] },
  ];
  if (r0 === 0)
    faces.push({ nU: w, nV: d, origin: [-ex / 2, top, -ez / 2], du: [sx, 0, 0], dv: [0, 0, sz], normal: [0, 1, 0], uv: [u + d, v] });
  if (r1 === h)
    faces.push({ nU: w, nV: d, origin: [-ex / 2, bot, ez / 2], du: [sx, 0, 0], dv: [0, 0, -sz], normal: [0, -1, 0], uv: [u + d + w, v] });
  return faces;
}

export function detectSlim(skin: Skin): boolean {
  if (skin.width < 64 || skin.height < 64) return false;
  const a = (x: number, y: number) => skin.data[(y * skin.width + x) * 4 + 3]!;
  let temTextura = false;
  for (let y = 20; y < 32; y++)
    for (let x = 44; x <= 46; x++) if (a(x, y) !== 0) temTextura = true;
  if (!temTextura) return false;
  let r = true, l = true;
  for (let y = 20; y < 32; y++) if (a(47, y) !== 0) r = false;
  for (let y = 52; y < 64; y++) if (a(39, y) !== 0) l = false;
  return r || l;
}

// Converte skin antiga 64x32 para 64x64.
export function normalizeSkin(data: Uint8ClampedArray | Uint8Array, w: number, h: number): Skin {
  if (w === 64 && h === 64) return { data, width: 64, height: 64 };
  const out = new Uint8ClampedArray(64 * 64 * 4);
  const sw = w, sh = Math.min(h, 32);
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < Math.min(w, 64); x++)
      for (let c = 0; c < 4; c++) out[(y * 64 + x) * 4 + c] = data[(y * sw + x) * 4 + c]!;

  const copyFlip = (sx: number, sy: number, dx: number, dy: number, fw: number, fh: number) => {
    for (let y = 0; y < fh; y++)
      for (let x = 0; x < fw; x++)
        for (let c = 0; c < 4; c++)
          out[((dy + y) * 64 + (dx + fw - 1 - x)) * 4 + c] = out[((sy + y) * 64 + (sx + x)) * 4 + c]!;
  };
  // caixa 4x12x4: origem u,v -> destino
  const mirrorBox = (su: number, sv: number, du: number, dv: number) => {
    const w4 = 4, h12 = 12, d4 = 4;
    // top / base
    copyFlip(su + d4, sv, du + d4, dv, w4, d4);
    copyFlip(su + d4 + w4, sv, du + d4 + w4, dv, w4, d4);
    // lados (direito <-> esquerdo trocados), frente e costas
    copyFlip(su, sv + d4, du + d4 + w4, dv + d4, d4, h12);
    copyFlip(su + d4 + w4, sv + d4, du, dv + d4, d4, h12);
    copyFlip(su + d4, sv + d4, du + d4, dv + d4, w4, h12);
    copyFlip(su + 2 * d4 + w4, sv + d4, du + 2 * d4 + w4, dv + d4, w4, h12);
  };
  mirrorBox(0, 16, 16, 48);  // perna
  mirrorBox(40, 16, 32, 48); // braco
  return { data: out, width: 64, height: 64 };
}

export function buildScene(skin: Skin, slim: boolean, pose: Pose, view: View): Poly[] {
  const aw = slim ? 3 : 4;
  const ax = slim ? 5.5 : 6;
  const Z: Rot = [0, 0, 0];

  const parts: Part[] = [];
  // adiciona camada base + camada externa 3D (cada pixel vira um bloquinho)
  const addBoth = (
    owner: string,
    uv: [number, number], ovUv: [number, number], dims: Vec, rows: [number, number],
    center: Vec, chain: Link[], ovInflate: number, offset?: Vec
  ) => {
    const base: Part = { uv, dims, rows, center, chain, inflate: 0, layer3d: false, owner, shellInflate: ovInflate };
    const ov: Part = { uv: ovUv, dims, rows, center, chain, inflate: ovInflate, layer3d: true, owner, shellInflate: ovInflate };
    if (offset) { base.offset = offset; ov.offset = offset; }
    parts.push(base, ov);
  };

  const OV = 0.16;
  const OV_HEAD = 0.22;
  const arm = (owner: string, side: -1 | 1, uv: [number, number], ovUv: [number, number], up: Rot, low: Rot, offset?: Vec) => {
    const sx = side * ax;
    const shoulder: Vec = [sx, 22, 0];
    const elbow: Vec = [sx, 18, 0];
    // cima: linhas 0..6 (y 24..18). antebraco: linhas 4..12 (y 20..12): sobe 2 unidades
    // alem do cotovelo pra tapar o vao quando o braco dobra.
    addBoth(owner, uv, ovUv, [aw, 12, 4], [0, 6], [sx, 21, 0], [{ pivot: shoulder, rot: up }], OV, offset);
    addBoth(owner, uv, ovUv, [aw, 12, 4], [4, 12], [sx, 16, 0],
      [{ pivot: elbow, rot: low }, { pivot: shoulder, rot: up }], OV, offset);
  };

  addBoth('head', [0, 0], [32, 0], [8, 8, 8], [0, 8], [0, 28, 0], [{ pivot: [0, 24, 0], rot: pose.head }], OV_HEAD);
  addBoth('body', [16, 16], [16, 32], [8, 12, 4], [0, 12], [0, 18, 0], [{ pivot: [0, 18, 0], rot: pose.body }], OV);
  arm('rArm', -1, [40, 16], [40, 32], pose.rArm, pose.rArmLow ?? Z, pose.rArmOffset);
  arm('lArm', 1, [32, 48], [48, 48], pose.lArm, pose.lArmLow ?? Z, pose.lArmOffset);
  addBoth('rLeg', [0, 16], [0, 32], [4, 12, 4], [0, 12], [-2, 6, 0], [{ pivot: [-2, 12, 0], rot: pose.rLeg }], OV);
  addBoth('lLeg', [16, 48], [0, 48], [4, 12, 4], [0, 12], [2, 6, 0], [{ pivot: [2, 12, 0], rot: pose.lLeg }], OV);

  const Rg = rotMat([pose.pitch, pose.yaw, pose.roll]);
  // Iluminacao no estilo das imagens de referencia: frente 100% clara, lado direito e baixo bem escuros.
  const shadeOf = (n: Vec) =>
    Math.max(0.2, 1 - 0.75 * Math.max(0, n[0]) - 0.9 * Math.max(0, -n[1]) - 0.15 * Math.max(0, n[1]) - 0.1 * Math.max(0, -n[0]));

  // Sombra projetada (ex.: cabeca sobre o colarinho). Luz vinda de cima/frente/esquerda.
  const SOMBRA = 0.6;
  const Lcam = norm([-0.15, 0.45, 0.9]);
  const Lm = app(transpose(Rg), Lcam);
  interface Occ { owner: string; center: Vec; chain: Link[]; mats: Mat[]; off: Vec; lo: Vec; hi: Vec }
  const occs: Occ[] = parts.filter((p) => !p.layer3d).map((p) => {
    const [w, h, d] = p.dims; const [r0, r1] = p.rows; const n = r1 - r0; const e = p.shellInflate;
    return {
      owner: p.owner, center: p.center, chain: p.chain, mats: p.chain.map((l) => rotMat(l.rot)), off: p.offset ?? [0, 0, 0],
      lo: [-(w / 2 + e), -(n / 2 + (r1 === h ? e : 0)), -(d / 2 + e)] as Vec,
      hi: [w / 2 + e, n / 2 + (r0 === 0 ? e : 0), d / 2 + e] as Vec,
    };
  });
  const emSombra = (P: Vec, owner: string): boolean => {
    for (const o of occs) {
      if (o.owner === owner) continue;
      let p = sub(P, o.off);
      let dir: Vec = Lm;
      for (let c = o.chain.length - 1; c >= 0; c--) {
        const piv = o.chain[c]!.pivot;
        const Rt = transpose(o.mats[c]!);
        p = add(piv, app(Rt, sub(p, piv)));
        dir = app(Rt, dir);
      }
      p = sub(p, o.center);
      let t0 = 0.03, t1 = 1e9, ok = true;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(dir[k]!) < 1e-9) { if (p[k]! < o.lo[k]! || p[k]! > o.hi[k]!) { ok = false; break; } continue; }
        let a = (o.lo[k]! - p[k]!) / dir[k]!, b = (o.hi[k]! - p[k]!) / dir[k]!;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  };
  const camPos: Vec = [0, 0, view.dist];
  const polys: Poly[] = [];

  const project = (p: Vec): [number, number, number] => {
    const q = app(Rg, sub(p, view.target));
    const k = view.dist / Math.max(1, view.dist - q[2]);
    return [view.cx + q[0] * k * view.scale, view.cy - q[1] * k * view.scale, q[2]];
  };

  for (const part of parts) {
    const mats = part.chain.map((l) => rotMat(l.rot));
    const off: Vec = part.offset ?? [0, 0, 0];
    const toWorld = (local: Vec): Vec => {
      let p = add(part.center, local);
      for (let c = 0; c < part.chain.length; c++) {
        const piv = part.chain[c]!.pivot;
        p = add(piv, app(mats[c]!, sub(p, piv)));
      }
      return add(p, off);
    };
    const rotN = (n: Vec): Vec => {
      let q = n;
      for (const m of mats) q = app(m, q);
      return app(Rg, q);
    };

    const outer = facesOf(part, part.inflate);
    const base = part.layer3d ? facesOf({ ...part, inflate: 0 }, 0) : outer;

    for (let fi = 0; fi < outer.length; fi++) {
      const f = outer[fi]!;
      const fb = base[fi]!;
      const nW = rotN(f.normal);
      const cl: Vec = [
        f.origin[0] + (f.du[0] * f.nU + f.dv[0] * f.nV) / 2,
        f.origin[1] + (f.du[1] * f.nU + f.dv[1] * f.nV) / 2,
        f.origin[2] + (f.du[2] * f.nU + f.dv[2] * f.nV) / 2,
      ];
      const cProj = app(Rg, sub(toWorld(cl), view.target));
      const frente = dot(nW, sub(camPos, cProj)) > 0;
      if (!frente && !part.layer3d) continue;

      const shadeFace = shadeOf(nW);
      const duN = norm(f.du), dvN = norm(f.dv);

      const corner = (ff: Face, ci: number, cj: number): Vec => [
        ff.origin[0] + ff.du[0] * ci + ff.dv[0] * cj,
        ff.origin[1] + ff.du[1] * ci + ff.dv[1] * cj,
        ff.origin[2] + ff.du[2] * ci + ff.dv[2] * cj,
      ];
      const alphaAt = (i: number, j: number) =>
        skin.data[((f.uv[1] + j) * skin.width + f.uv[0] + i) * 4 + 3]!;

      for (let j = 0; j < f.nV; j++) {
        for (let i = 0; i < f.nU; i++) {
          const o = ((f.uv[1] + j) * skin.width + f.uv[0] + i) * 4;
          const a = skin.data[o + 3]!;
          if (a === 0) continue;
          const R0 = skin.data[o]!, G0 = skin.data[o + 1]!, B0 = skin.data[o + 2]!;

          if (frente) {
            const sf = emSombra(toWorld(corner(f, i + 0.5, j + 0.5)), part.owner) ? shadeFace * SOMBRA : shadeFace;
            const a0 = project(toWorld(corner(f, i, j)));
            const a1 = project(toWorld(corner(f, i + 1, j)));
            const a2 = project(toWorld(corner(f, i + 1, j + 1)));
            const a3 = project(toWorld(corner(f, i, j + 1)));
            polys.push({
              pts: [a0[0], a0[1], a1[0], a1[1], a2[0], a2[1], a3[0], a3[1]],
              rgba: [Math.round(R0 * sf), Math.round(G0 * sf), Math.round(B0 * sf), a],
              depth: (a0[2] + a1[2] + a2[2] + a3[2]) / 4,
            });
          }

          if (part.layer3d) {
            // paredes laterais onde o vizinho e transparente (da a espessura 3D)
            const lados: [number, number, number, number, number, number, Vec][] = [
              // vizinho, aresta (c1i,c1j)->(c2i,c2j), normal no plano
              [i - 1, j, i, j, i, j + 1, [-duN[0], -duN[1], -duN[2]]],
              [i + 1, j, i + 1, j, i + 1, j + 1, duN],
              [i, j - 1, i, j, i + 1, j, [-dvN[0], -dvN[1], -dvN[2]]],
              [i, j + 1, i, j + 1, i + 1, j + 1, dvN],
            ];
            for (const [ni, nj, c1i, c1j, c2i, c2j, nl] of lados) {
              if (ni >= 0 && nj >= 0 && ni < f.nU && nj < f.nV && alphaAt(ni, nj) !== 0) continue;
              const nw = rotN(nl);
              const o1 = toWorld(corner(f, c1i, c1j));
              const o2 = toWorld(corner(f, c2i, c2j));
              const i1 = toWorld(corner(fb, c1i, c1j));
              const i2 = toWorld(corner(fb, c2i, c2j));
              const mid = app(Rg, sub([(o1[0] + o2[0]) / 2, (o1[1] + o2[1]) / 2, (o1[2] + o2[2]) / 2], view.target));
              if (dot(nw, sub(camPos, mid)) <= 0) continue;
              const sh = shadeOf(nw) * (emSombra(add(o1, [0, 0, 0]), part.owner) ? SOMBRA : 1);
              const p0 = project(o1), p1 = project(o2), p2 = project(i2), p3 = project(i1);
              polys.push({
                pts: [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]],
                rgba: [Math.round(R0 * sh), Math.round(G0 * sh), Math.round(B0 * sh), a],
                depth: (p0[2] + p1[2] + p2[2] + p3[2]) / 4,
              });
            }
          }
        }
      }
    }
  }

  polys.sort((a, b) => a.depth - b.depth); // de tras pra frente
  return polys;
}

function dot(a: Vec, b: Vec): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a: Vec): Vec { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
