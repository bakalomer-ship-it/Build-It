// Headless check of the cube (level 2) and the 2×4 base (level 3): node tools/cubetest.mjs
import { CubeSim } from '../src/cubeSim.js';
import { SLOTS, JOINTS, GUYS, STAKE_JOINTS } from '../src/level1.js';
import { LEVELS, CUBE_LEVEL } from '../src/levels.js';

function klafBuild() {
  const poles = {}; for (const s of SLOTS) poles[s.id] = { length: s.length };
  const joints = {}; for (const j of JOINTS) joints[j.id] = j.correct;
  const all = o => Object.fromEntries(GUYS.map(g => [g.id, o]));
  return { poles, joints, stakes: { BL: 4, BR: 4 }, guyTop: all(true), anchors: all(3), guyTies: all('guy'),
    stakeJoints: Object.fromEntries(STAKE_JOINTS.map(s => [s.id, 'parallel'])), guyOff: {} };
}
function run(name, { skipSlots = [], skipJoints = [], innerOff = true, outerOff = false, unbrace = false } = {}, LV = CUBE_LEVEL) {
  const cube = LV.cube;
  const poles = {}; for (const s of cube.slots) if (!skipSlots.some(k => k.endsWith('$') ? s.id === k.slice(0, -1) : s.id.includes(k))) poles[s.id] = { length: s.length };
  const joints = {}; for (const j of cube.joints) if (!skipJoints.some(k => j.id.includes(k))) joints[j.id] = j.correct;
  const ks = LV.klafim.map(cfg => ({ cfg, build: klafBuild() }));
  ks.forEach((k, i) => { for (const g of GUYS) {
    const inner = k.cfg.inner === 'both' || Math.sign(g.side) === k.cfg.inner;
    if ((innerOff && inner) || (outerOff && !inner)) k.build.guyOff[g.id] = true;
  } });
  const sim = new CubeSim(ks, cube, { poles, joints });
  const dt = 1 / 60; let t = 0, fail = null, maxSway = 0;
  sim.letGo();
  // with the outer guy lines, then without any (a braced cube stands by itself)
  const pushes = [[1.5, 3, [140, 0, 0]], [3.5, 5, [0, 0, 140]], [5.5, 7, [0, 0, -140]],
    [10, 11.5, [140, 0, 0]], [12, 13.5, [-140, 0, 0]], [14, 15.5, [0, 0, 140]], [16, 17.5, [0, 0, -140]]];
  while (t < 19) {
    if (t >= 8 && !sim.released) { sim.releaseAllGuys(); sim.released = true; if (unbrace) sim.unbrace(); }
    let p = null; for (const [a, b, f] of pushes) if (t > a && t < b) p = f;
    sim.step(dt, { push: p }); t += dt;
    maxSway = Math.max(maxSway, sim.sway());
    if (sim.rack() > 0.42 || sim.lowestTop() < 1.4 || sim.sway() > 0.25) { fail = 'collapsed at ' + t.toFixed(1); break; }
  }
  console.log(JSON.stringify({ name: (LV.number === 3 ? 'base: ' : '') + name, fail, maxSway: maxSway.toFixed(3), rack: sim.rack().toFixed(3), top: sim.lowestTop().toFixed(2) }));
}
run('full cube, inner guys off');
run('full cube, inner guys still on', { innerOff: false });
run('no spatial X, inner off', { skipSlots: ['dA', 'dB'] });
run('no spatial X, inner on', { skipSlots: ['dA', 'dB'], innerOff: false });
run('X on one side only', { skipSlots: ['dAR', 'dBR'] });
run('half X each side', { skipSlots: ['dB'] });
run('no side poles at all', { skipSlots: ['bot', 'top', 'dA', 'dB'] });
run('missing X centre lashings', { skipJoints: ['j9'] });
run('one X lashing missing on a leg', { skipJoints: ['j6L'] });
run('no top side poles', { skipSlots: ['top'] });

// level 3: two cubes in a row on three klafim (the middle one shared)
const L3 = LEVELS[1];
run('full', {}, L3);
run('full, inner guys still on', { innerOff: false }, L3);
run('no X in the back cube', { skipSlots: ['dAR2', 'dBR2', 'dAL2', 'dBL2'] }, L3);
run('no X on the right side of the front cube', { skipSlots: ['C.dAR$', 'C.dBR$'] }, L3);
run('one X lashing missing in the back cube', { skipJoints: ['j6L2'] }, L3);
run('no X on either side of the front cube', { skipSlots: ['C.dAR$', 'C.dBR$', 'C.dAL$', 'C.dBL$'] }, L3);
run('no spatial X at all', { skipSlots: ['dA', 'dB'] }, L3);

// built against the plan: the Xs work loose in the check, and it must fall
run('full cube, Xs loose (an X missing elsewhere)', { unbrace: true });
run('full, Xs loose (an X missing elsewhere)', { unbrace: true }, L3);
