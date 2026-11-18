// Headless check of the carousel (station 4): node tools/carouseltest.mjs
import { KlafSim } from '../src/klafSim.js';
import { CubeSim } from '../src/cubeSim.js';
import { GUYS, STAKE_JOINTS, setPlan } from '../src/level1.js';
import { GATE_PLAN, BACK_PLAN, JOIN, SEAT, MAST_JOINTS, HANG_ROPES, CarouselSim, CAR, CAR_TUNING, PIVOT } from '../src/carousel.js';
import { LEVELS } from '../src/levels.js';

const LV = LEVELS.find(l => l.carousel);
const arg = process.argv[2] || 'all';
function klafBuild(plan, { skip = [] } = {}) {
  const poles = {}; for (const s of plan.slots) poles[s.id] = { length: s.length };
  const joints = {}; for (const j of plan.joints) if (!skip.includes(j.id)) joints[j.id] = j.correct;
  const all = o => Object.fromEntries(GUYS.map(g => [g.id, o]));
  return { poles, joints, stakes: { BL: 4, BR: 4 }, guyTop: all(true), anchors: all(3), guyTies: {}, stakeJoints: {}, guyOff: {} };
}
let bad = 0;
const expect = (name, got, want) => { if (got !== want) bad++; console.log(`${got === want ? 'ok  ' : 'BAD '} ${name}`); };

// ---- raising each 5 m klaf with its 6-person crew ----
function raise(name, cfg, b, pullSpeed = 12) {
  setPlan(cfg.plan.slots, cfg.plan.joints);
  const sim = new KlafSim(b, cfg);
  const dt = 1 / 60; let t = 0, tg = 0, fell = null, up = 0;
  while (t < 30) {
    if (tg < 90) { tg += pullSpeed * dt; sim.pullTo(tg); }
    sim.step(dt, { wobble: true }); t += dt;
    if (sim.baseSlid() > 0.4) { fell = 'slid'; break; }
    if (sim.rack() > 0.6) { fell = 'racked'; break; }
    if (sim.angle() > 122) { fell = 'over'; break; }
    if (Math.abs(sim.angle() - 90) < 8) { up += dt; if (up > 2) break; } else up = 0;
  }
  console.log(`   ${name}: angle ${sim.angle().toFixed(1)} rack ${sim.rack().toFixed(2)} t ${t.toFixed(1)} ${fell || ''}`);
  return !fell && up > 2;
}
if (arg === 'all' || arg === 'raise') {
  const [front, back] = LV.klafim;
  expect('gate klaf raises', raise('gate', front, klafBuild(GATE_PLAN)), true);
  expect('back klaf raises', raise('back', back, klafBuild(BACK_PLAN)), true);
}

// ---- the frame: two klafim joined into the cube, then the guy lines come down ----
function frame(name, { skipSlots = [], skipJoints = [], load = 0 } = {}) {
  setPlan(GATE_PLAN.slots, GATE_PLAN.joints);
  const ks = LV.klafim.map(cfg => {
    const b = klafBuild(cfg.plan);
    for (const g of GUYS) b.guyTies[g.id] = 'guy';
    for (const s of STAKE_JOINTS) b.stakeJoints[s.id] = 'parallel';
    for (const g of GUYS) if (cfg.inner === 'both' || Math.sign(g.side) === cfg.inner) b.guyOff[g.id] = true;
    return { cfg, build: b };
  });
  const poles = {}; for (const s of JOIN.slots) if (!skipSlots.some(k => s.id.includes(k))) poles[s.id] = { length: s.length };
  const joints = {}; for (const j of JOIN.joints) if (!skipJoints.some(k => j.id.includes(k))) joints[j.id] = j.correct;
  const sim = new CubeSim(ks, JOIN, { poles, joints });
  const xc = sim.findParticle('C.xAT', 0);
  const y0 = sim.pos(xc)[1];
  sim.letGo();
  const P = 140, pushes = [[1.5, 3, [P, 0, 0]], [3.5, 5, [0, 0, P]], [5.5, 7, [0, 0, -P]], [10, 11.5, [P, 0, 0]], [12, 13.5, [-P, 0, 0]], [14, 15.5, [0, 0, P]], [16, 17.5, [0, 0, -P]]];
  let t = 0, fail = null, sway = 0, sag = 0;
  const dt = 1 / 60;
  while (t < 22) {
    if (t >= 8 && !sim.released) { sim.releaseAllGuys(); sim.released = true; }
    let p = null; for (const [a, b, f] of pushes) if (t > a && t < b) p = f;
    if (load && t > 18) sim.world.applyForce(xc, [0, -load, 0]);
    sim.step(dt, { push: p }); t += dt;
    sway = Math.max(sway, sim.sway()); sag = Math.max(sag, y0 - sim.pos(xc)[1]);
    if (sim.rack() > 0.6 || sim.lowestTop() < 0.7 * CAR.legLength || sim.sway() > 0.4) { fail = 'collapsed at ' + t.toFixed(1); break; }
  }
  console.log(`   ${name}: sway ${sway.toFixed(3)} roof sag ${sag.toFixed(3)} rack ${sim.rack().toFixed(3)} ${fail || ''}`);
  return !fail && sag < 0.3;
}
if (arg === 'all' || arg === 'frame') {
  expect('full frame stands', frame('full'), true);
  expect('full frame carries the carousel at the roof', frame('full + load', { load: CAR_TUNING.frameShare * 3400 }), true);
  expect('no side Xs falls', frame('no side X', { skipSlots: ['dA', 'dB', 'uA', 'uB'] }), false);
}

// ---- the seat: riders get on, it spins, the מדריך pushes it sideways ----
function ride(name, { skipSeat = [], skipMast = [], skipRopes = [], mast = CAR.seat.mastLength } = {}) {
  const seat = { poles: {}, joints: {} };
  for (const s of SEAT.slots) seat.poles[s.id] = { length: s.length };
  for (const j of SEAT.joints) if (!skipSeat.includes(j.id)) seat.joints[j.id] = j.correct;
  const hang = { mast: { length: mast }, pivot: true, joints: {}, ropes: {} };
  for (const j of MAST_JOINTS) if (!skipMast.includes(j.id)) hang.joints[j.id] = 'square';
  for (const h of HANG_ROPES) if (!skipRopes.includes(h.id)) hang.ropes[h.id] = true;
  const sim = new CarouselSim(seat, hang);
  const dt = +(process.env.DT || 1 / 60); let t = 0, fail = null, sag = 0, swing = 0, load = 0;
  while (t < 16) {
    const riders = t < 1 ? 0 : Math.min(8, (t - 1) * 2);
    sim.step(dt, { riders, spin: t > 5 && t < 11, side: t > 12 && t < 13.5 ? [CAR_TUNING.sidePush, 0, 0] : null }); t += dt;
    sag = Math.max(sag, sim.sag()); swing = Math.max(swing, sim.swing()); load = Math.max(load, sim.pivotLoad());
    if (t > 0.5 && sag > CAR_TUNING.sagLimit) { fail = 'seat broke at ' + t.toFixed(1); break; }
    if (swing > CAR_TUNING.swingLimit) { fail = 'swung into the mast at ' + t.toFixed(1); break; }
  }
  console.log(`   ${name}: sag ${sag.toFixed(3)} swing ${swing.toFixed(3)} turns ${(sim.angle / 2 / Math.PI).toFixed(2)} spin ${sim.spin.toFixed(2)} tilt ${sim.mastTilt().toFixed(1)} ring ${load.toFixed(0)} N ${fail || ''}`);
  return !fail;
}
if (arg === 'all' || arg === 'ride') {
  expect('full carousel rides and spins', ride('full'), true);
  expect('a corner lashing missing breaks the seat', ride('no corner 2', { skipSeat: ['S.c2'] }), false);
  expect('a hanging rope missing: the seat sags', ride('no rope 3', { skipRopes: ['S.r3'] }), false);
  expect('the seat not lashed to the mast swings into it', ride('no mast lashings', { skipMast: ['S.k1', 'S.k2'] }), false);
}
console.log(bad ? `${bad} FAILED` : 'carousel: all as expected');
process.exit(bad ? 1 : 0);
