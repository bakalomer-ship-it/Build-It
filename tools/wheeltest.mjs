// Headless check of the giant wheel (station 5): node tools/wheeltest.mjs [raise|frame|ride]
import { KlafSim } from '../src/klafSim.js';
import { CubeSim } from '../src/cubeSim.js';
import { GUYS, STAKE_JOINTS, setPlan } from '../src/level1.js';
import { TOWER_PLANS, WJOIN, WHEEL, GOND, SEAT_ROPES, WheelSim, WH, WH_TUNING, AXLE_Y, forkS } from '../src/wheel.js';
import { LEVELS } from '../src/levels.js';

const LV = LEVELS.find(l => l.wheel);
const arg = process.argv[2] || 'all';
let bad = 0;
const expect = (name, got, want) => { if (got !== want) bad++; console.log(`${got === want ? 'ok  ' : 'BAD '} ${name}`); };
function klafBuild(plan, { skip = [] } = {}) {
  const poles = {}; for (const s of plan.slots) poles[s.id] = { length: s.length };
  const joints = {}; for (const j of plan.joints) if (!skip.includes(j.id)) joints[j.id] = j.correct;
  const all = o => Object.fromEntries(GUYS.map(g => [g.id, o]));
  return { poles, joints, stakes: { BL: 4, BR: 4 }, guyTop: all(true), anchors: all(3), guyTies: {}, stakeJoints: {}, guyOff: {} };
}

// ---- raising each A-frame tower with its 6-person crew ----
function raise(name, cfg, b) {
  setPlan(cfg.plan.slots, cfg.plan.joints);
  const sim = new KlafSim(b, cfg);
  const dt = 1 / 60; let t = 0, tg = 0, fell = null, up = 0;
  while (t < 30) {
    if (tg < 90) { tg += 12 * dt; sim.pullTo(tg); }
    sim.step(dt, { wobble: true }); t += dt;
    if (sim.baseSlid() > 0.4) { fell = 'slid'; break; }
    if (sim.rack() > 0.42) { fell = 'racked'; break; }
    if (sim.angle() > 122) { fell = 'over'; break; }
    if (Math.abs(sim.angle() - 90) < 8) { up += dt; if (up > 2) break; } else up = 0;
  }
  console.log(`   ${name}: angle ${sim.angle().toFixed(1)} rack ${sim.rack().toFixed(2)} top ${sim.topCentre().map(v => v.toFixed(2)).join(',')} t ${t.toFixed(1)} ${fell || ''}`);
  return !fell && up > 2;
}
if (arg === 'all' || arg === 'raise') {
  expect('front tower raises', raise('front', LV.klafim[0], klafBuild(TOWER_PLANS[0])), true);
  expect('back tower raises', raise('back', LV.klafim[1], klafBuild(TOWER_PLANS[1])), true);
  expect('a tower without its fork lashing folds', raise('no fork', LV.klafim[0], klafBuild(TOWER_PLANS[0], { skip: ['Jf'] })), false);
}

// ---- the frame: both towers, the feet joined, inner guy lines down, the wheel's weight on the forks ----
function frame(name, { skipJoin = false, load = 0, axle = true } = {}) {
  setPlan(TOWER_PLANS[0].slots, TOWER_PLANS[0].joints);
  const ks = LV.klafim.map(cfg => {
    const b = klafBuild(cfg.plan);
    for (const g of GUYS) b.guyTies[g.id] = 'guy';
    for (const s of STAKE_JOINTS) b.stakeJoints[s.id] = 'parallel';
    for (const g of GUYS) if (Math.sign(g.side) === cfg.inner) b.guyOff[g.id] = true;
    return { cfg, build: b };
  });
  const poles = {}, joints = {};
  if (!skipJoin) { for (const s of WJOIN.slots) poles[s.id] = { length: s.length }; for (const j of WJOIN.joints) joints[j.id] = j.correct; }
  const sim = new CubeSim(ks, WJOIN, { poles, joints });
  const forks = sim.klafim.map(k => k.findParticle('legR', forkS(k.slotById('legR'))));
  if (axle) sim.world.add('rigid', forks[0], forks[1], { tag: 'axle' });
  const y0 = sim.pos(forks[0])[1];
  sim.letGo();
  const P = 140, pushes = [[1.5, 3, [P, 0, 0]], [3.5, 5, [0, 0, P]], [5.5, 7, [0, 0, -P]], [7.5, 9, [-P, 0, 0]]];
  let t = 0, fail = null, sway = 0, sag = 0;
  const dt = 1 / 60;
  while (t < 12) {
    let p = null; for (const [a, b, f] of pushes) if (t > a && t < b) p = f;
    for (const f of forks) sim.world.applyForce(f, [0, -load / 2, 0]);
    sim.step(dt, { push: p }); t += dt;
    sway = Math.max(sway, sim.sway()); sag = Math.max(sag, y0 - sim.pos(forks[0])[1]);
    if (sim.rack() > 0.42 || sim.lowestTop() < 0.7 * WJOIN.height || sim.sway() > 0.4 || sim.baseSlid() > 0.35) { fail = 'collapsed at ' + t.toFixed(1); break; }
  }
  console.log(`   ${name}: sway ${sway.toFixed(3)} fork sag ${sag.toFixed(3)} rack ${sim.rack().toFixed(3)} ${fail || ''}`);
  return !fail && sag < 0.2;
}
if (arg === 'all' || arg === 'frame') {
  expect('frame stands', frame('full'), true);
  expect('frame carries the wheel, seat and riders', frame('full + load', { load: 3000 }), true);
}

// ---- the ride: two riders get on, the crew turns it a full turn, the מדריך pushes the seat ----
function ride(name, { skip = [], ropes = [0, 1, 2, 3], seconds = 16 } = {}) {
  const b = { poles: {}, joints: {} };
  for (const s of [...WHEEL.slots, ...GOND.slots]) b.poles[s.id] = { length: s.length };
  for (const j of [...WHEEL.joints, ...GOND.joints]) if (!skip.includes(j.id)) b.joints[j.id] = j.correct;
  const hang = { seat: true, ropes: Object.fromEntries(ropes.map(k => [SEAT_ROPES[k].id, true])) };
  const sim = new WheelSim(b, hang);
  const dt = 1 / 60; let t = 0, fail = null, rack = 0, slip = 0, tilt = 0, bend = 0, drop = 0;
  while (t < seconds) {
    const riders = t < 1 ? 0 : Math.min(2, (t - 1));
    sim.step(dt, { riders, spin: t > 3 && t < 12, side: t > 13 && t < 14.5 ? [0, 0, WH_TUNING.sidePush] : null }); t += dt;
    rack = Math.max(rack, sim.rack()); slip = Math.max(slip, sim.slip()); tilt = Math.max(tilt, sim.seatTilt()); bend = Math.max(bend, sim.seatBend()); drop = Math.max(drop, sim.seatDrop());
    if (t > 0.5 && rack > WH_TUNING.rackLimit) { fail = 'wheel folded at ' + t.toFixed(1); break; }
    if (t > 0.5 && slip > WH_TUNING.slipLimit) { fail = 'slipped off the axle at ' + t.toFixed(1); break; }
    if (t > 0.5 && (tilt > WH_TUNING.seatTilt || drop > 0.3)) { fail = 'seat tipped at ' + t.toFixed(1); break; }
    if (t > 0.5 && bend > WH_TUNING.seatBend) { fail = 'seat broke at ' + t.toFixed(1); break; }
  }
  console.log(`   ${name}: rack ${rack.toFixed(3)} slip ${slip.toFixed(3)} tilt ${tilt.toFixed(3)} bend ${bend.toFixed(3)} drop ${drop.toFixed(3)} turns ${(sim.angle / 2 / Math.PI).toFixed(2)} spin ${sim.spin.toFixed(2)} mass ${sim.mass().toFixed(0)} kg ${fail || ''}`);
  return { ok: !fail, turns: sim.angle / 2 / Math.PI };
}
if (arg === 'all' || arg === 'ride') {
  const full = ride('full');
  expect('full wheel turns a whole turn with riders', full.ok && Math.abs(full.turns) >= 1, true);
  expect('no X in the front square: it folds', ride('no X front', { skip: ['W.e10', 'W.e11', 'W.e12', 'W.e13', 'W.x1'] }).ok, false);
  expect('the wheel not lashed to the axle slips off', ride('no axle lashings', { skip: ['W.a1', 'W.a2'] }).ok, false);
  expect('a hanging rope missing: the seat tips', ride('no rope 1', { ropes: [1, 2, 3] }).ok, false);
  expect('a seat corner not lashed: the seat breaks', ride('no seat corner', { skip: ['W.gc1', 'W.gd1'] }).ok, false);
}
console.log(bad ? `${bad} FAILED` : 'wheel: all as expected');
process.exit(bad ? 1 : 0);
