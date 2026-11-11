import type { SQLiteDatabase } from 'expo-sqlite';

import type { Capsule } from '../../domain/capsules/capsuleDomain';
import * as loopItemsRepository from '../../database/repositories/loopItemsRepository';
import { loopService } from '../loops/loopService';

export function listLooseCapsules(db: SQLiteDatabase): Promise<Capsule[]> {
  return loopItemsRepository.listLooseCapsules(db);
}

export async function setCapsuleDone(
  db: SQLiteDatabase,
  capsule: Capsule,
  done: boolean
): Promise<void> {
  await loopService.setLoopItemDone(db, capsule.loop.id, capsule.item.id, done);
}
