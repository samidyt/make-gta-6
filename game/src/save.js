// save.js — localStorage saves for Solmar City.
// One clear job: persist the player's position, cash, health, missions and
// wanted level, and restore them on the next visit.
import { GAME } from './config.js';

export function hasSave() {
  try {
    return !!window.localStorage.getItem(GAME.saveKey);
  } catch {
    return false;
  }
}

export function saveGame(data) {
  try {
    window.localStorage.setItem(GAME.saveKey, JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      ...data,
    }));
    return true;
  } catch {
    return false; // storage off (private window): the game still plays
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(GAME.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(GAME.saveKey);
    return true;
  } catch {
    return false;
  }
}
