import { Point3D } from '../types';
import { LM } from './constants';

export function computeAsymmetry(pts: Point3D[]) {
  const pairs = [[LM.L_EYE_IN, LM.R_EYE_IN], [LM.L_EYE_OUT, LM.R_EYE_OUT], [LM.BROW_L, LM.BROW_R], [LM.CHEEK_L, LM.CHEEK_R], [LM.JAW_L, LM.JAW_R]];
  function d(a: number, b: number) { const dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, dz = pts[a].z - pts[b].z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  const ref = d(LM.L_EYE_IN, LM.R_EYE_IN) || 1;
  let tot = 0; pairs.forEach(([l, r]) => { const dL = d(l, LM.CENTER) / ref, dR = d(r, LM.CENTER) / ref; tot += Math.abs(dL - dR) / Math.max(dL, dR, .01); });
  return Math.min(1, tot / pairs.length);
}

export function computeHarmony(pts: Point3D[]) {
  const PHI = 1.618;
  function d(a: number, b: number) { const dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, dz = pts[a].z - pts[b].z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  const eD = d(LM.L_EYE_IN, LM.R_EYE_IN) || 1, fW = d(LM.LEFT, LM.RIGHT) || 1, fH = d(LM.TOP, LM.BOTTOM) || 1;
  const dev = (v: number, i: number) => 1 - Math.min(1, Math.abs(v - i) / i);
  const scores = { 'Proporcja twarzy': dev(fH / fW, PHI), 'Nos/Oczy': dev(d(LM.NOSE_L, LM.NOSE_R) / eD, PHI * .62), 'Usta/Oczy': dev(d(LM.MOUTH_L, LM.MOUTH_R) / eD, 1.0), 'Oczy/Twarz': dev(eD / fW, 0.46) };
  return { harmony: Object.values(scores).reduce((a, b) => a + b, 0) / 4, scores };
}

export function cosSim(a: number[], b: number[]) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na && nb) ? d / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

export function eucDist(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return Math.sqrt(s);
}

export function bioSim(pA: Point3D[], pB: Point3D[]) {
  function d(pts: Point3D[], a: number, b: number) { const dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, dz = pts[a].z - pts[b].z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  const pairs = [[LM.L_EYE_IN, LM.R_EYE_IN], [LM.L_EYE_OUT, LM.R_EYE_OUT], [LM.LEFT, LM.RIGHT], [LM.TOP, LM.BOTTOM], [LM.NOSE_L, LM.NOSE_R], [LM.MOUTH_L, LM.MOUTH_R], [LM.JAW_L, LM.JAW_R], [LM.BROW_L, LM.BROW_R]];
  const sA = d(pA, LM.L_EYE_IN, LM.R_EYE_IN), sB = d(pB, LM.L_EYE_IN, LM.R_EYE_IN);
  if (sA < .1 || sB < .1) return 0;
  let diff = 0; pairs.forEach(([a, b]) => { diff += Math.abs(d(pA, a, b) / sA - d(pB, a, b) / sB); });
  return Math.max(0, 1 - diff / pairs.length * 2);
}

export function extractBioVec(pts: Point3D[]) {
  function d(a: number, b: number) { const dx = pts[a].x - pts[b].x, dy = pts[a].y - pts[b].y, dz = pts[a].z - pts[b].z; return Math.sqrt(dx * dx + dy * dy + dz * dz); }
  const eD = d(LM.L_EYE_IN, LM.R_EYE_IN) || 1, fW = d(LM.LEFT, LM.RIGHT), fH = d(LM.TOP, LM.BOTTOM);
  const pairs = [[LM.L_EYE_IN, LM.R_EYE_IN], [LM.L_EYE_OUT, LM.R_EYE_OUT], [LM.LEFT, LM.RIGHT], [LM.TOP, LM.BOTTOM], [LM.NOSE_L, LM.NOSE_R], [LM.NOSE_BASE, LM.NOSE_TIP], [LM.MOUTH_L, LM.MOUTH_R], [LM.MOUTH_TOP, LM.MOUTH_BOT], [LM.JAW_L, LM.JAW_R], [LM.BROW_L, LM.BROW_R], [LM.L_EYE_TOP, LM.L_EYE_BOT], [LM.R_EYE_TOP, LM.R_EYE_BOT]];
  return [...pairs.map(([a, b]) => d(a, b) / eD), fW / fH, d(LM.NOSE_L, LM.NOSE_R) / eD, d(LM.MOUTH_L, LM.MOUTH_R) / eD, Math.abs(pts[LM.NOSE_TIP].z - pts[LM.CENTER].z) / eD];
}
