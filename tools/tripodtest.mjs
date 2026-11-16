// Headless check of the tripod's inspection physics: npm test
import { TripodSim, TRI, TRI_TUNING, planFeet, startFeet, standing, BRACES, BRACE_JOINTS, TRI_STAKES, TRI_STAKE_JOINTS, fitsPlan } from '../src/tripod.js';

const all = (list, v) => Object.fromEntries(list.map(q => [q.id, v]));
function run(name, { feet = planFeet([0, 0]), lens = [4.5, 4.5, 4.5], braced = true, staked = true } = {}) {
  const sim = new TripodSim({
    feet, lens,
    braces: braced ? all(BRACES, { length: TRI.braceLength }) : {}, joints: braced ? all(BRACE_JOINTS, 'square') : {},
    stakes: staked ? all(TRI_STAKES, 4) : {}, stakeJoints: staked ? all(TRI_STAKE_JOINTS, 'parallel') : {},
  });
  const P = TRI_TUNING.push;
  const pushes = [[1, 3, [P, 0, 0]], [3.5, 5.5, [-P / 2, 0, P * 0.87]], [6, 8, [-P / 2, 0, -P * 0.87]]];
  let t = 0, worstSink = 0, worstSlide = 0;
  for (; t < 12; t += 1 / 60) {
    const p = pushes.find(q => t >= q[0] && t <= q[1]);
    sim.step(1 / 60, { push: p ? p[2] : null, load: t > 9 && t < 11.5 ? TRI_TUNING.load : 0 });
    worstSink = Math.max(worstSink, sim.sunk()); worstSlide = Math.max(worstSlide, sim.slid());
  }
  const stood = worstSink < 0.25 * sim.h0 && worstSlide < 0.35;
  console.log(`${stood ? 'STANDS' : 'FALLS '}  ${name}  sink ${worstSink.toFixed(2)} slide ${worstSlide.toFixed(2)} braced ${sim.braced.length}`);
  return stood;
}
const st = standing(planFeet([0, 0]), [4.5, 4.5, 4.5]);
console.log('plan: height', st.height.toFixed(2), 'apart', st.apart.map(d => d.toFixed(2)).join(' '), JSON.stringify(fitsPlan(st)));
const want = [
  [run('to the drawing: braces and stakes'), true],
  [run('braces, no stakes', { staked: false }), true],
  [run('stakes, no braces', { braced: false }), true],
  [run('no braces, no stakes', { braced: false, staked: false }), false],
  [run('narrow (feet 0.7 m apart), braced, no stakes', { feet: startFeet([0, 0], 0.4), staked: false }), false],
  [run('very wide (feet 5 m apart), no braces, no stakes', { feet: startFeet([0, 0], 2.9), braced: false, staked: false }), false],
];
const bad = want.filter(([got, w]) => got !== w).length;
console.log(bad ? `${bad} FAILED` : 'tripod: all as expected');
process.exit(bad ? 1 : 0);
