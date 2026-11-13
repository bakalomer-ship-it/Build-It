// Tiny synthesized sound effects (no audio files needed).
let ctx = null;
function ac() { return ctx; }
function noise(dur, filterFreq, gain, type = 'lowpass') {
  const c = ac(); if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
  const g = c.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination); src.start();
}
function tone(freq, dur, gain, type = 'sine', slide = 0) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, c.currentTime + dur);
  const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
}
export const sfx = {
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = null; }
  },
  hammer() { tone(110, 0.18, 0.5, 'sine', 0.5); noise(0.08, 1800, 0.35); },
  lash() { noise(0.12, 2600, 0.12, 'bandpass'); setTimeout(() => noise(0.12, 2300, 0.1, 'bandpass'), 110); setTimeout(() => noise(0.1, 2000, 0.08, 'bandpass'), 220); },
  thud() { tone(90, 0.15, 0.3, 'triangle', 0.6); },
  tick() { tone(1400, 0.03, 0.05, 'square'); },
  ok() { tone(660, 0.12, 0.12, 'triangle'); setTimeout(() => tone(990, 0.18, 0.12, 'triangle'), 110); },
  crash() { noise(0.5, 500, 0.5); tone(70, 0.6, 0.4, 'sine', 0.5); setTimeout(() => noise(0.3, 900, 0.3), 250); },
};
