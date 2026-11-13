// Headless check of the physics: node tools/simtest.mjs
import { KlafSim } from '../src/klafSim.js';
import { SLOTS, JOINTS, GUYS, STAKE_JOINTS } from '../src/level1.js';

function build({ skip = [], stakes = true, guys = 4, lengths = {} } = {}) {
  const poles = {}; for (const s of SLOTS) poles[s.id] = { length: lengths[s.id] ?? s.length };
  const joints = {}; for (const j of JOINTS) if (!skip.includes(j.id)) joints[j.id] = j.correct;
  const guyTop = {}; GUYS.slice(0, guys).forEach(g => guyTop[g.id] = true);
  return { poles, joints, stakes: stakes ? { BL: 1, BR: 1 } : {}, guyTop };
}

function run(name, b, { pullSpeed = 20, anchor = true, push = true } = {}) {
  const sim = new KlafSim(b);
  const dt = 1 / 60; let t = 0; let fell = null; let tg = 0;
  const log = [];
  // raise
  while (t < 25) {
    const ang = sim.angle();
    if (tg < 90) { tg += pullSpeed * dt; sim.pullTo(tg); }
    sim.step(dt, { wobble: true }); t += dt;
    if (sim.baseSlid() > 0.4) { fell = 'base slid'; break; }
    if (sim.rack() > 0.5) { fell = 'racked'; break; }
    if (sim.brokenGrip()) { fell = 'grip ' + sim.brokenGrip().tag; }
    if (t > 3 && ang > 88 && Math.abs(sim.angle() - 90) < 2 && log.length === 0) log.push('upright at ' + t.toFixed(1));
    if (log.length && t > parseFloat(log[0].split(' ')[2]) + 4) break;
    if (sim.angle() > 140 || (t > 2 && sim.topCentre()[1] < 0.5 && ang > 20)) { fell = fell || 'fell'; break; }
  }
  const raised = !fell && sim.angle() > 80;
  let res = { name, raised, fell, t: t.toFixed(1), ang: sim.angle().toFixed(1), rack: sim.rack().toFixed(2), slid: sim.baseSlid().toFixed(2) };
  if (raised && anchor) {
    for (const g in sim.guys) sim.tieGuy(g);
    for (const sj of STAKE_JOINTS) sim.tieStakeJoint(sj);
    sim.letGo();
    let t2 = 0, failed = null;
    while (t2 < 9) {
      let p = null;
      if (push && t2 > 1 && t2 < 3) p = [140, 0, 0];
      if (push && t2 > 4 && t2 < 6) p = [-140, 0, 0];
      if (push && t2 > 6.5 && t2 < 7.5) p = [0, 0, 100];
      sim.step(dt, { push: p }); t2 += dt;
      if (sim.rack() > 0.4 || sim.topCentre()[1] < 1.6) { failed = 'collapsed at ' + t2.toFixed(1) + ' rack ' + sim.rack().toFixed(2); break; }
    }
    res.push = failed || 'stood (rack ' + sim.rack().toFixed(3) + ')';
  }
  console.log(JSON.stringify(res));
}

run('full', build());
run('missing J7 (diag B lower)', build({ skip: ['J7'] }));
run('no diag B', build({ skip: ['J7', 'J8', 'J9'] }));
run('no diag A', build({ skip: ['J5', 'J6', 'J9'] }));
run('no X', build({ skip: ['J5', 'J6', 'J7', 'J8', 'J9'] }));
run('no centre', build({ skip: ['J9'] }));
run('no stakes', build({ stakes: false }));
run('fast pull', build(), { pullSpeed: 80 });
run('2 guys only', build({ guys: 2 }));
run('missing corner J3', build({ skip: ['J3'] }));
