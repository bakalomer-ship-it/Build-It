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
// "find the missing connections" (Omer, 11-21): a structure stands, some connections are
// missing, and the player finds them from the structure file. Texts never say what or how
// many are missing. lv: the structure; pick: what is taken out; n: how many connections.
export const MISSING = {
  4: { lv: 'cube4', pick: 'high', n: [5, 7], he: 'עבודה בגובה: קובייה 4×4', sub: 'עולים עם רתמות ומשלימים למעלה', medals: [240, 420, 600] },
  21: { lv: 'base', pick: 'any', n: [4, 6], he: 'בסיס 2×4: חיבורים חסרים', sub: 'מוצאים לפי השרטוטים ומשלימים', medals: [180, 300, 480] },
  22: { lv: 'base', pick: 'x', he: 'בסיס 2×4: איקס שנעלם', sub: 'משהו חסר במבנה. מה?', medals: [200, 330, 520] },
  41: { lv: 'cube4', pick: 'mixed', n: [6, 8], he: 'קובייה 4×4: למטה ולמעלה', sub: 'קודם מהקרקע, אחר כך בגובה', medals: [300, 480, 720] },
  42: { lv: 'cube4', pick: 'pole', he: 'קובייה 4×4: סנדה שנעלמה', sub: 'מוצאים, מניחים וכופתים', medals: [260, 420, 660] },
  51: { lv: 'carframe', pick: 'mixed', n: [7, 9], he: 'מסגרת הקרוסלה 5×5', sub: 'מסגרת גדולה, חיבורים חסרים', medals: [360, 600, 900] },
};
export const cubeMedals = ch => (MISSING[ch.level] || CUBE_FIX).medals;

// a small seeded random (a broken camp can be replayed from its seed)
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export const medalOf = (sec, medals) => medals.findIndex(m => sec <= m); // 0 gold, 1 silver, 2 bronze, -1 none
export const MEDAL_HE = ['זהב', 'כסף', 'ארד'];
export const MEDAL_ICON = ['🥇', '🥈', '🥉'];

const KEY = 'buildit.challenges';
function load() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.best) return { stars: {}, ...d }; } catch { /* none yet */ } return { best: {}, daily: {}, stars: {} }; }
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
// stars per challenge (Omer 11-21: challenges give stars like the levels); the best is kept
export const starsOfChallenge = ch => mem.stars[keyOf(ch)] || 0;
export function recordStars(ch, n) { const k = keyOf(ch); if ((mem.stars[k] || 0) < n) { mem.stars[k] = n; save(); } }
export const challengeStars = () => Object.values(mem.stars).reduce((a, n) => a + n, 0);
