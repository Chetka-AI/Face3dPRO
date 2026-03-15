import * as THREE from 'three';
import { Point2D, Point3D, Angles, Expression, Quality, SpatialMetrics } from '../types';
import { LM, FACE_OVAL_IDX } from './constants';

export function pip(px: number, py: number, poly: Point2D[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function delaunay(pts: Point2D[]) {
  const n = pts.length; if (n < 3) return [];
  let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
  pts.forEach(p => { if (p.x < mnX) mnX = p.x; if (p.x > mxX) mxX = p.x; if (p.y < mnY) mnY = p.y; if (p.y > mxY) mxY = p.y; });
  const dx = (mxX - mnX) * 10, dy = (mxY - mnY) * 10, mx = (mnX + mxX) / 2, my = (mnY + mxY) / 2;
  const all = [...pts, { x: mx - dx, y: my - dy }, { x: mx, y: my + dy }, { x: mx + dx, y: my - dy }];
  let tris = [{ a: n, b: n + 1, c: n + 2 }];

  function inCircum(t: any, px: number, py: number) {
    const ax = all[t.a].x - px, ay = all[t.a].y - py;
    const bx = all[t.b].x - px, by = all[t.b].y - py;
    const cx = all[t.c].x - px, cy = all[t.c].y - py;
    return (ax * ax + ay * ay) * (bx * cy - by * cx) - (bx * bx + by * by) * (ax * cy - ay * cx) + (cx * cx + cy * cy) * (ax * by - ay * bx) > 0;
  }

  for (let pi = 0; pi < n; pi++) {
    const px = all[pi].x, py = all[pi].y;
    const bad: any[] = [], good: any[] = [];
    for (const t of tris) (inCircum(t, px, py) ? bad : good).push(t);
    const ec: Record<string, number> = {};
    for (const t of bad) for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
      const k = Math.min(a, b) + ',' + Math.max(a, b); ec[k] = (ec[k] || 0) + 1;
    }
    tris = good;
    for (const [k, v] of Object.entries(ec)) if (v === 1) {
      const [a, b] = k.split(',').map(Number); tris.push({ a: pi, b: a, c: b });
    }
  }

  const ovalPoly = FACE_OVAL_IDX.map(i => pts[i]);
  const ovalCX = ovalPoly.reduce((s, p) => s + p.x, 0) / ovalPoly.length;
  const ovalCY = ovalPoly.reduce((s, p) => s + p.y, 0) / ovalPoly.length;
  const expandedOval = ovalPoly.map(p => ({
    x: ovalCX + (p.x - ovalCX) * 1.04,
    y: ovalCY + (p.y - ovalCY) * 1.04
  }));

  return tris
    .filter(t => t.a < n && t.b < n && t.c < n)
    .filter(t => {
      const cx = (pts[t.a].x + pts[t.b].x + pts[t.c].x) / 3;
      const cy = (pts[t.a].y + pts[t.b].y + pts[t.c].y) / 3;
      return pip(cx, cy, expandedOval);
    })
    .map(t => [t.a, t.b, t.c]);
}

export function normalizeFace(rawPts: THREE.Vector3[]): Point3D[] {
  const o = rawPts[LM.CENTER].clone();
  let vX = new THREE.Vector3().subVectors(rawPts[LM.RIGHT], rawPts[LM.LEFT]).normalize();
  let vYr = new THREE.Vector3().subVectors(rawPts[LM.TOP], rawPts[LM.BOTTOM]);
  vYr.addScaledVector(vX, -vX.dot(vYr));
  const vY = vYr.normalize(), vZ = new THREE.Vector3().crossVectors(vX, vY).normalize();
  vX.crossVectors(vY, vZ).normalize();
  const s = (rawPts[LM.L_EYE_IN].distanceTo(rawPts[LM.R_EYE_IN])) || 1;
  const sc = 100 / s;
  return rawPts.map(p => { const r = new THREE.Vector3().subVectors(p, o); return { x: +(r.dot(vX) * sc).toFixed(4), y: +(r.dot(vY) * sc).toFixed(4), z: +(r.dot(vZ) * sc).toFixed(4) }; });
}

export function computeAngles(p: THREE.Vector3[], kpByName?: Record<string, THREE.Vector3>): Angles {
  const g = (name: string, idx: number) => (kpByName && kpByName[name]) || p[idx] || new THREE.Vector3();
  const nT = g('noseTip', 4), lE = g('leftEyeOuter', 130), rE = g('rightEyeOuter', 359), lM = g('leftMouth', 61), rM = g('rightMouth', 291);
  const dL = Math.abs(nT.x - lE.x), dR = Math.abs(nT.x - rE.x), eS = Math.abs(rE.x - lE.x);
  const yaw = Math.asin(Math.max(-1, Math.min(1, eS > 1 ? (dR - dL) / eS : 0))) * 180 / Math.PI;
  const eY = (lE.y + rE.y) / 2, mY = (lM.y + rM.y) / 2, dE = nT.y - eY, dM = mY - nT.y, dn = dE + dM;
  const pitch = Math.asin(Math.max(-1, Math.min(1, dn > 1 ? (dM - dE) / dn : 0))) * 180 / Math.PI * 0.5;
  const roll = Math.atan2(rE.y - lE.y, rE.x - lE.x) * 180 / Math.PI;
  return { yaw, pitch, roll };
}

export function computeExpr(p: THREE.Vector3[]): Expression | null {
  const d = (a: number, b: number) => p[a].distanceTo(p[b]), eD = d(LM.L_EYE_IN, LM.R_EYE_IN);
  if (eD < 1) return null;
  return {
    mouthOpen: Math.min(1, d(LM.MOUTH_TOP, LM.MOUTH_BOT) / eD * 3),
    mouthWide: Math.min(1, Math.abs(d(LM.MOUTH_L, LM.MOUTH_R) / d(LM.L_EYE_OUT, LM.R_EYE_OUT) - 0.7) * 3),
    leftEye: Math.min(1, d(LM.L_EYE_TOP, LM.L_EYE_BOT) / (eD * .5)),
    rightEye: Math.min(1, d(LM.R_EYE_TOP, LM.R_EYE_BOT) / (eD * .5)),
    browRaise: Math.min(1, Math.max(0, (d(LM.BROW_L, LM.L_EYE_TOP) + d(LM.BROW_R, LM.R_EYE_TOP)) / (eD * .5) - .5) * 3),
    overall: 0
  };
}

export function exprTotal(e: Expression) { return e.mouthOpen * .4 + e.mouthWide * .2 + Math.abs(e.leftEye - .5) * .15 + Math.abs(e.rightEye - .5) * .15 + e.browRaise * .1; }

export function computeSharpness(cv: HTMLCanvasElement) {
  try {
    const ctx = cv.getContext('2d'), w = Math.min(cv.width, 200), h = Math.min(cv.height, 200);
    if (!ctx) return 50;
    const d = ctx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * .299 + d[i * 4 + 1] * .587 + d[i * 4 + 2] * .114;
    let v = 0, c = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const l = -g[(y - 1) * w + x] - g[(y + 1) * w + x] - g[y * w + x - 1] - g[y * w + x + 1] + 4 * g[y * w + x]; v += l * l; c++; }
    return c > 0 ? Math.sqrt(v / c) : 0;
  } catch (e) { return 50; }
}

export function evalQuality(rawPts: THREE.Vector3[], cv: HTMLCanvasElement, angles: Angles, expr: Expression | null): Quality {
  const comp = rawPts.filter(p => Math.abs(p.z) > .01).length / 468;
  const mxA = Math.max(Math.abs(angles.yaw), Math.abs(angles.pitch), Math.abs(angles.roll) * .5);
  const aScore = Math.max(0, 1 - mxA / 45);
  const eD = rawPts[LM.L_EYE_IN].distanceTo(rawPts[LM.R_EYE_IN]);
  if (eD < 1) return { total: 0, comp: 0, aScore: 0, sharp: 0, symm: 0, eScore: 0 };
  const lC = rawPts[LM.L_EYE_IN].distanceTo(rawPts[LM.CHEEK_L]), rC = rawPts[LM.R_EYE_IN].distanceTo(rawPts[LM.CHEEK_R]);
  const symm = Math.max(0, 1 - Math.abs(lC - rC) / eD * 2);
  const sharp = Math.min(1, computeSharpness(cv) / 15);
  const eScore = expr ? Math.max(0, 1 - exprTotal(expr) * 2) : .5;
  return { total: Math.round(comp * 25 + aScore * 30 + symm * 20 + sharp * 15 + eScore * 10), comp, aScore, symm, sharp, eScore };
}

export function computeSpatialMetrics(rawPts: THREE.Vector3[]): SpatialMetrics | null {
  if (!rawPts || rawPts.length < 468) return null;

  const eyeDist = rawPts[LM.L_EYE_IN].distanceTo(rawPts[LM.R_EYE_IN]);
  if (eyeDist < 1e-5) return null;

  const zVals = rawPts.map(p => p.z);
  const zMin = Math.min(...zVals);
  const zMax = Math.max(...zVals);
  const zMean = zVals.reduce((s, z) => s + z, 0) / zVals.length;
  const zVar = zVals.reduce((s, z) => s + Math.pow(z - zMean, 2), 0) / zVals.length;
  const zStd = Math.sqrt(zVar);

  const nose = rawPts[LM.NOSE_TIP];
  const cheekL = rawPts[LM.CHEEK_L];
  const cheekR = rawPts[LM.CHEEK_R];
  const jawL = rawPts[LM.JAW_L];
  const jawR = rawPts[LM.JAW_R];
  const eyeL = rawPts[LM.L_EYE_IN];
  const eyeR = rawPts[LM.R_EYE_IN];
  const mouthMid = rawPts[LM.MOUTH_TOP].clone().add(rawPts[LM.MOUTH_BOT]).multiplyScalar(0.5);

  const faceNormal = new THREE.Vector3()
    .subVectors(eyeR, eyeL)
    .cross(new THREE.Vector3().subVectors(mouthMid, eyeL));
  const normalLen = faceNormal.length();
  const planeDeviation = normalLen > 1e-5
    ? Math.abs(faceNormal.dot(new THREE.Vector3().subVectors(nose, eyeL))) / normalLen / eyeDist
    : 0;

  const cheekMeanZ = (cheekL.z + cheekR.z) * 0.5;
  const noseProjection = Math.abs(nose.z - cheekMeanZ) / eyeDist;
  const eyeDepthDelta = Math.abs(eyeL.z - eyeR.z) / eyeDist;
  const jawWidthToDepth = jawL.distanceTo(jawR) / (Math.abs(zMax - zMin) + 1e-5);
  const perspectiveSkew = Math.abs(nose.distanceTo(cheekL) - nose.distanceTo(cheekR)) / eyeDist;

  return {
    depthSpread: zStd / eyeDist,
    noseProjection,
    facePlaneDeviation: planeDeviation,
    eyeDepthDelta,
    jawWidthToDepth,
    perspectiveSkew
  };
}
