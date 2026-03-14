import Dexie, { Table } from 'dexie';
import { Character, ScanHistory, MasterModel } from './types';

export class FaceEngineDB extends Dexie {
  characters!: Table<Character, number>;
  history!: Table<ScanHistory, number>;
  masters!: Table<MasterModel, number>;

  constructor() {
    super('FaceEngine_v5');
    this.version(5).stores({
      characters: '++id,name',
      history: '++id,charId,quality,yaw,pitch,roll,date',
      masters: 'charId'
    });
  }
}

export const db = new FaceEngineDB();
