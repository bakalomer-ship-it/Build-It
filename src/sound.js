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
  // rope creaking under load while the klaf is being pulled up
  creak(load = 0.5) {
    const c = ac(); if (!c) return;
    const dur = 0.16 + Math.random() * 0.1;
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = 140 + Math.random() * 60 + load * 80;
    o.frequency.setValueAtTime(f0, c.currentTime);
    o.frequency.linearRampToValueAtTime(f0 * (0.75 + Math.random() * 0.15), c.currentTime + dur);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + load * 500; bp.Q.value = 6;
    const g = c.createGain();
    // a stuttering envelope sounds like fibres slipping, not a tone
    const t = c.currentTime, v = 0.05 + load * 0.08;
    g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 5; k++) { g.gain.linearRampToValueAtTime(v * (0.5 + Math.random() * 0.5), t + dur * (k + 0.3) / 5); g.gain.linearRampToValueAtTime(v * 0.15, t + dur * (k + 1) / 5); }
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    o.connect(bp).connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
  },
  crash() { noise(0.5, 500, 0.5); tone(70, 0.6, 0.4, 'sine', 0.5); setTimeout(() => noise(0.3, 900, 0.3), 250); },
};

// short vibration on phones that support it (Android browsers; iOS ignores it)
export function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* not allowed here */ }
}
