import type { Pose, View } from "./scene.ts";

export interface PoseDef {
  width: number;
  height: number;
  pose: Pose;
  view: View;
  shadow: { dx: number; dy: number; alpha: number };
}

const zero: [number, number, number] = [0, 0, 0];

export const POSES: Record<string, PoseDef> = {
  // Bracos cruzados, cabeca virada e olhando pra baixo, camera bem perto
  CRUZADOS: {
    width: 1500,
    height: 1920,
    pose: {
      yaw: -8, pitch: -14, roll: 0,
      head: [-8, -24, 6],
      body: zero,
      rArm: [-78, 62, 0],
      lArm: [-68, -62, 0],
      rArmOffset: [0, -1, 0],
      lArmOffset: [0, -1, 4.5],
      rLeg: zero, lLeg: zero,
    },
    view: { scale: 56, cx: 700, cy: 1030, dist: 62, target: [0, 21, 0] },
    shadow: { dx: 40, dy: 40, alpha: 0.45 },
  },

  // Bracos soltos levemente abertos, cabeca virada
  SOLTOS: {
    width: 1920,
    height: 1920,
    pose: {
      yaw: -4, pitch: -16, roll: 0,
      head: [-8, -14, 4],
      body: zero,
      rArm: [0, 0, -16],
      lArm: [0, 0, 11],
      rLeg: zero, lLeg: zero,
    },
    view: { scale: 62, cx: 930, cy: 1090, dist: 70, target: [0, 20, 0] },
    shadow: { dx: 42, dy: 42, alpha: 0.45 },
  },

  // Maos na cintura
  CINTURA: {
    width: 1770,
    height: 1920,
    pose: {
      yaw: -6, pitch: -14, roll: 0,
      head: [-8, -16, 5],
      body: zero,
      rArm: [-10, 6, -52],
      rArmLow: [-18, 0, 88],
      lArm: [-10, -6, 52],
      lArmLow: [-18, 0, -88],
      rLeg: zero, lLeg: zero,
    },
    view: { scale: 58, cx: 870, cy: 1090, dist: 70, target: [0, 20, 0] },
    shadow: { dx: 40, dy: 40, alpha: 0.45 },
  },
};
