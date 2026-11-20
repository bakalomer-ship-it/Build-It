// Short challenges: a speed run, "fix the broken camp", and a cube missing a top connection.
// Records stay on this device. The game itself (main.js) runs them.

export const SPEED = {
  // level number: medal times in seconds (gold, silver, bronze). Every lashing must be
  // tied (two stars or more) for the time to count: speed never beats accuracy.
  1: { medals: [180, 270, 360] },
  3: { medals: [240, 360, 480] },
};
export const FIX = {
  // level number: how many faults are hidden in the klafim, and medal times
  1: { faults: 3, medals: [60, 120, 180] },
  2: { faults: 5, medals: [150, 270, 400] },
};
export const FIX_PENALTY = 20; // seconds added for calling the מדריך while faults remain

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// the 2x2 cube that stands without one top connection: medal times from the start to a passed מסדר
export const CUBE_FIX = { medals: [150, 270, 420] };

// a small seeded random (a broken camp can be replayed from its seed)
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const medalOf = (sec, medals) => medals.findIndex(m => sec <= m); // 0 gold, 1 silver, 2 bronze, -1 none
export const MEDAL_HE = ['זהב', 'כסף', 'ארד'];
export const MEDAL_ICON = ['🥇', '🥈', '🥉'];

const KEY = 'buildit.challenges';
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.best) return d; } catch { /* none yet */ } return { best: {}, daily: {} }; }
let mem = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode: lasts this visit */ } }
export const keyOf = ch => `${ch.kind}${ch.level}`;
export const bestOf = ch => mem.best[keyOf(ch)] ?? null;
// returns true when this is a new best
export function recordChallenge(ch, sec) {
  const k = keyOf(ch), old = mem.best[k];
  const better = old == null || sec < old;
  if (better) mem.best[k] = Math.round(sec);
  save();
  return better;
}
