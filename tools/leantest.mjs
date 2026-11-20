// Headless check of the raise's balance bar (fun.js): node tools/leantest.mjs
// A klaf built to the drawing must survive being raised while leaning as far as the
// bar goes (left, then right); a klaf with its X missing must rack under the same lean.
import { KlafSim } from '../src/klafSim.js';
import { SLOTS, JOINTS, GUYS } from '../src/level1.js';
import { BALANCE } from '../src/balance.js';

function build(skip = []) {
  const poles = {}; for (const s of SLOTS) poles[s.id] = { length: s.length };
  const joints = {}; for (const j of JOINTS) if (!skip.some(k => j.a === k || j.b === k)) joints[j.id] = j.correct;
  const guyTop = {}; GUYS.forEach(g => guyTop[g.id] = true);
  return { poles, joints, stakes: { BL: 4, BR: 4 }, guyTop };
}
function raise(b) {
  const sim = new KlafSim(b);
  const dt = 1 / 60; let t = 0, tg = 0, maxRack = 0;
  while (t < 14) {
    if (tg < 90) { tg += 18 * dt; sim.pullTo(tg); }
    // the bar swings fully from side to side every 2.4 s
    const lean = sim.angle() > 15 ? BALANCE.force * Math.sign(Math.sin(t * Math.PI / 1.2)) : 0;
    sim.step(dt, { wobble: true, lean }); t += dt;
    maxRack = Math.max(maxRack, sim.rack());
    if (sim.rack() > 0.42) return { racked: true, maxRack };
  }
  return { racked: false, maxRack, angle: sim.angle() };
}
const diag = SLOTS.filter(s => s.id.startsWith('diag')).map(s => s.id);
const good = raise(build());
const noX = raise(build(diag));
console.log('lean: klaf to the drawing', JSON.stringify(good));
console.log('lean: klaf without its X  ', JSON.stringify(noX));
// the slip lets a raised klaf back down
const sim = new KlafSim(build()); for (let i = 0; i < 300; i++) { sim.pullTo(Math.min(60, i * 0.3)); sim.step(1 / 60, {}); }
const a0 = sim.angle(); sim.slip(BALANCE.slip); for (let i = 0; i < 120; i++) sim.step(1 / 60, {});
console.log('slip: from', a0.toFixed(0), 'to', sim.angle().toFixed(0));
let fail = 0;
if (good.racked) { console.log('FAIL: a klaf built to the drawing racked under the lean'); fail++; }
if (!noX.racked) { console.log('FAIL: a klaf without its X stood the lean'); fail++; }
if (!(sim.angle() < a0 - 8)) { console.log('FAIL: slip did not let the klaf down'); fail++; }
process.exit(fail ? 1 : 0);
