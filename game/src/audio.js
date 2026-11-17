// audio.js — tiny WebAudio synth for Solmar City.
// One clear job: oscillator-only bleeps (shoot, pickup, siren, punch, mission).
// No audio files, no network. Created lazily on the first user gesture.

let ctx = null;
let sirenNodes = null;
let unlocked = false; // true only after a user gesture called unlockAudio()

function ensure() {
  if (!unlocked) return null;
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  } catch { ctx = null; }
  return ctx;
}

export function unlockAudio() {
  unlocked = true;
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

function tone(freq, dur, type, vol, slideTo) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'square';
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol || 0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, vol) {
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol || 0.2, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(gain).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  shoot() { noiseBurst(0.12, 0.25); tone(180, 0.1, 'sawtooth', 0.1, 60); },
  punch() { noiseBurst(0.08, 0.18); tone(120, 0.08, 'sine', 0.2, 70); },
  pickup() { tone(660, 0.09, 'sine', 0.15); setTimeout(() => tone(990, 0.14, 'sine', 0.15), 90); },
  cash() { tone(880, 0.08, 'triangle', 0.15); setTimeout(() => tone(1320, 0.12, 'triangle', 0.15), 80); },
  mission() { tone(523, 0.12, 'triangle', 0.16); setTimeout(() => tone(784, 0.18, 'triangle', 0.16), 120); },
  fail() { tone(220, 0.25, 'sawtooth', 0.12, 110); },
  crash() { noiseBurst(0.25, 0.3); tone(90, 0.2, 'sine', 0.25, 40); },
  phone() { tone(1150, 0.09, 'sine', 0.12); setTimeout(() => tone(1150, 0.09, 'sine', 0.12), 160); },
  horn() { tone(370, 0.18, 'square', 0.08); },
  jump() { tone(300, 0.12, 'sine', 0.08, 520); },
  engineStart() { tone(60, 0.4, 'sawtooth', 0.1, 120); },
};

// Two-tone police siren loop while wanted > 0. Start/stop are cheap and idempotent.
export function setSiren(on) {
  if (on && !sirenNodes) {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(700, c.currentTime);
    gain.gain.setValueAtTime(0.045, c.currentTime);
    osc.connect(gain).connect(c.destination);
    osc.start();
    const lfo = c.createOscillator();
    lfo.frequency.setValueAtTime(0.7, c.currentTime);
    const lfoGain = c.createGain();
    lfoGain.gain.setValueAtTime(220, c.currentTime);
    lfo.connect(lfoGain).connect(osc.frequency);
    lfo.start();
    sirenNodes = { osc, lfo, gain };
  } else if (!on && sirenNodes) {
    try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
    sirenNodes = null;
  }
}
