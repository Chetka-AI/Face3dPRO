export interface Point3D {
  x: number;
  y: number;
  z: number;
  name?: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Character {
  id?: number;
  name: string;
}

export interface ScanHistory {
  id?: number;
  charId: number;
  quality: number;
  yaw: number;
  pitch: number;
  roll: number;
  exprScore: number;
  date: number;
  points: Point3D[];
}

export interface MasterModel {
  charId: number;
  points: Point3D[];
  scanCount: number;
  date: number;
}

export interface Angles {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface Expression {
  mouthOpen: number;
  mouthWide: number;
  leftEye: number;
  rightEye: number;
  browRaise: number;
  overall: number;
}

export interface Quality {
  total: number;
  comp: number;
  aScore: number;
  symm: number;
  sharp: number;
  eScore: number;
}

export interface ScanData {
  points: Point3D[];
  quality: Quality;
  angles: Angles;
  expr: Expression | null;
  charId: number;
}
