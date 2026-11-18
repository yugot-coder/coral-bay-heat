// Save / continue via localStorage, fully guarded: private windows and
// headless screenshot runs may have no usable storage, and the game must
// carry on regardless. Saves cash, mission progress, collectibles found
// and where the player was standing.
import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      cash: state.player.cash,
      missionIndex: state.mission.index,
      missionDone: state.mission.done,
      taken: state.collectibles.filter((c) => c.taken).map((c) => c.id),
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      packages: state.packagesFound,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable: progress simply lasts for this visit only.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}
