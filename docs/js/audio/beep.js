let ctx = null;

export function getAudioContext() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

export async function unlockAudio() {
  const ac = getAudioContext();
  if (!ac) return false;
  try {
    if (ac.state === 'suspended') await ac.resume();
    // Prime with a silent buffer (important for some browsers / iOS-like policies)
    const b = ac.createBuffer(1, 1, ac.sampleRate);
    const s = ac.createBufferSource();
    s.buffer = b;
    s.connect(ac.destination);
    s.start(0);
    return ac.state === 'running';
  } catch {
    return false;
  }
}

export async function playTone({ freqHz = 880, durationMs = 120, volume = 0.8, when = 0 } = {}) {
  const ac = getAudioContext();
  if (!ac) return;
  try { if (ac.state === 'suspended') await ac.resume(); } catch {}
  const t0 = ac.currentTime + (when || 0);
  const dur = Math.max(0.01, (durationMs || 0) / 1000);
  const gain = ac.createGain();
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freqHz, t0);
  const v = Math.max(0, Math.min(1, Number(volume) || 0));
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(v, t0 + 0.01);
  gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export async function playSequence(tones, gapMs = 140, volume = 0.8) {
  const ac = getAudioContext();
  if (!ac) return;
  try { if (ac.state === 'suspended') await ac.resume(); } catch {}
  let offset = 0;
  for (let i = 0; i < tones.length; i++) {
    const [freqHz, durationMs] = tones[i];
    await playTone({ freqHz, durationMs, volume, when: offset });
    offset += (durationMs / 1000) + (gapMs / 1000);
  }
}

// Beep presets matching Android BeepPlayer/TimerService usage
export const Beeps = {
  countdown: (v) => playTone({ freqHz: 880, durationMs: 90, volume: v }),
  workStart: (v) => playTone({ freqHz: 1318, durationMs: 240, volume: v }),
  restStart: (v) => playTone({ freqHz: 660, durationMs: 150, volume: v }),
  halfway: (v) => playSequence([[987.77, 110], [1318.51, 160]], 45, v),
  finished: (v) => playSequence([[523, 200], [523, 200], [523, 200]], 150, v),
  test: (v) => playTone({ freqHz: 1318, durationMs: 240, volume: v }),
};
