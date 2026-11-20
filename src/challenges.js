// Short challenges: a speed run, "fix the broken camp", and a challenge of the day.
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

// the challenge of the day turns through these, the same for everyone on a given day
const DAILY = [
  { kind: 'fix', level: 1 },
  { kind: 'speed', level: 1 },
  { kind: 'fix', level: 2 },
  { kind: 'speed', level: 3 },
];
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayNo = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
export function dailyChallenge(d = new Date()) {
  const n = dayNo(d);
  return { ...DAILY[n % DAILY.length], daily: today(d), seed: n * 7919 + 13 };
}

// a small seeded random, so the day's broken camp is the same for everyone
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
export const dailyDone = (d = today()) => mem.daily[d] || null;
// returns true when this is a new best
export function recordChallenge(ch, sec) {
  const k = keyOf(ch), old = mem.best[k];
  const better = old == null || sec < old;
  if (better) mem.best[k] = Math.round(sec);
  if (ch.daily && !mem.daily[ch.daily]) mem.daily[ch.daily] = { sec: Math.round(sec) };
  save();
  return better;
}
