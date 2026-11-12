import type { SQLiteDatabase } from 'expo-sqlite';

import type { Capsule } from '../../domain/capsules/capsuleDomain';
import { createId } from '../../domain/shared/id';
import { nowUtcIso } from '../../domain/shared/dateUtils';
import type { StandaloneCapsule } from '../../domain/types';
import * as loopItemsRepository from '../../database/repositories/loopItemsRepository';
import * as standaloneCapsulesRepository from '../../database/repositories/standaloneCapsulesRepository';
import { loopService } from '../loops/loopService';

export function listLooseCapsules(db: SQLiteDatabase): Promise<Capsule[]> {
  return loopItemsRepository.listLooseCapsules(db);
}

export function listCompletedLooseCapsules(
  db: SQLiteDatabase
): Promise<Capsule[]> {
  return loopItemsRepository.listCompletedLooseCapsules(db);
}

export function listStandaloneCapsules(
  db: SQLiteDatabase,
  done: boolean
): Promise<StandaloneCapsule[]> {
  return standaloneCapsulesRepository.listStandaloneCapsules(db, done);
}

export async function createStandaloneCapsule(
  db: SQLiteDatabase,
  text: string
): Promise<StandaloneCapsule> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('A capsule needs a title.');
  }
  const now = nowUtcIso();
  const capsule: StandaloneCapsule = {
    id: createId(),
    text: trimmed,
    done: false,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };
  await standaloneCapsulesRepository.createStandaloneCapsule(db, capsule);
  return capsule;
}

export async function setStandaloneCapsuleDone(
  db: SQLiteDatabase,
  capsule: StandaloneCapsule,
  done: boolean
): Promise<void> {
  await standaloneCapsulesRepository.setStandaloneCapsuleDone(
    db,
    capsule.id,
    done
  );
}

export async function setCapsuleDone(
  db: SQLiteDatabase,
  capsule: Capsule,
  done: boolean
): Promise<void> {
  await loopService.setLoopItemDone(db, capsule.loop.id, capsule.item.id, done);
}
