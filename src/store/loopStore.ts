import type { SQLiteDatabase } from 'expo-sqlite';
import { create } from 'zustand';

import type { Loop } from '../domain/types';
import { loopService } from '../features/loops/loopService';

type LoopStore = {
  activeLoop: Loop | null;
  elapsedSeconds: number;
  loading: boolean;
  setActiveLoop: (loop: Loop | null) => void;
  setElapsedSeconds: (seconds: number) => void;
  refresh: (db: SQLiteDatabase) => Promise<void>;
  clear: () => void;
};

/**
 * Display-only state derived from SQLite. Never treat this store as the
 * source of truth; call `refresh` on startup and on foreground.
 */
export const useLoopStore = create<LoopStore>((set) => ({
  activeLoop: null,
  elapsedSeconds: 0,
  loading: true,

  setActiveLoop: (activeLoop) => set({ activeLoop }),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),

  refresh: async (db) => {
    const activeLoop = await loopService.getActiveLoop(db);
    if (!activeLoop) {
      set({ activeLoop: null, elapsedSeconds: 0, loading: false });
      return;
    }
    const elapsedSeconds = await loopService.getElapsedSeconds(db, activeLoop.id);
    set({ activeLoop, elapsedSeconds, loading: false });
  },

  clear: () => set({ activeLoop: null, elapsedSeconds: 0, loading: false }),
}));
