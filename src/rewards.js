// Rewards for a streak: days in a row on which the player finished a structure (with
// every lashing tied) or a challenge. Rope colours, a new look for the crew, and plaza
// items (in decor.js) open at the player's best streak, so a missed day never takes
// anything away. Stars are never spent (Omer); nothing here costs stars.
import { today } from './challenges.js';
import { setRopeColor, setCrewLook } from './scene.js';

export const ROPES = [
  { id: 'natural', he: 'חבל סיסל טבעי', hex: null, streak: 0 },
  { id: 'red', he: 'חבל אדום', hex: 0xc8452c, streak: 2 },
  { id: 'blue', he: 'חבל כחול', hex: 0x3a6fc4, streak: 3 },
  { id: 'green', he: 'חבל ירוק', hex: 0x4f9a3a, streak: 5 },
  { id: 'white', he: 'חבל לבן', hex: 0xf0ece0, streak: 7 },
];
export const LOOKS = [
  { id: 'green', he: 'כובעים ירוקים', cap: 0x3f7d2c, streak: 0 },
  { id: 'blue', he: 'כובעים כחולים', cap: 0x2f5fa8, streak: 3 },
  { id: 'maroon', he: 'כובעים בורדו ועניבות זהב', cap: 0x7a2433, scarf: 0xe0a93b, streak: 5 },
  { id: 'night', he: 'צוות לילה: כובעים שחורים', cap: 0x23241f, scarf: 0xf4f1e6, streak: 8 },
];

const KEY = 'buildit.streak';
function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d.count === 'number') return d; } catch { /* none yet */ }
  return { last: null, count: 0, best: 0, rope: 'natural', look: 'green' };
}
let mem = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* private mode */ } }
const dayBefore = d => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() - 1); return today(t); };

// the streak as it stands today (it lapses after a whole day without a finish)
export function streak() {
  if (!mem.last) return 0;
  const t = today();
  return mem.last === t || mem.last === dayBefore(t) ? mem.count : 0;
}
export const bestStreak = () => mem.best || 0;
export const playedToday = () => mem.last === today();
// a structure or a challenge finished today: returns what opened, if anything
export function recordDay() {
  const t = today();
  if (mem.last === t) return [];
  const before = bestStreak();
  mem.count = mem.last === dayBefore(t) ? mem.count + 1 : 1;
  mem.last = t;
  mem.best = Math.max(mem.best || 0, mem.count);
  save();
  return [...ROPES, ...LOOKS].filter(r => r.streak > before && r.streak <= mem.best);
}

export function apply() {
  const r = ROPES.find(q => q.id === mem.rope) || ROPES[0];
  const l = LOOKS.find(q => q.id === mem.look) || LOOKS[0];
  setRopeColor(r.hex);
  setCrewLook({ cap: l.cap, scarf: l.scarf ?? null });
}
export const chosen = () => ({ rope: mem.rope, look: mem.look });
export function choose(kind, id) { mem[kind] = id; save(); apply(); }
