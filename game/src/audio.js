// All sound is synthesized with WebAudio: no audio files, ever.
// The AudioContext is created only after a user gesture and every call is
// guarded, so headless screenshot runs (no gesture, maybe no audio device)
// stay silent and never crash.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = 0;
  let musicStep = 0;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol || 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch { /* audio is decoration; never break the game */ }
  }

  function noise(dur, vol, freq) {
    if (!ensure()) return;
    try {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch { /* ignore */ }
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    try {
      engineOsc = ctx.createOscillator();
      engineGain = ctx.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0.0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
    } catch { engineOsc = null; }
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    try {
      sirenOsc = ctx.createOscillator();
      sirenGain = ctx.createGain();
      sirenOsc.type = 'triangle';
      sirenGain.gain.value = 0.0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
    } catch { sirenOsc = null; }
  }

  // A slow two-chord bassline with a soft pad: Am7 to Fmaj7, very Coral Bay.
  const BASS = [55, 0, 55, 0, 65.4, 0, 49, 0, 43.65, 0, 43.65, 0, 55, 0, 49, 0];
  function musicTick(dt) {
    if (!ctx) return;
    musicTimer -= dt;
    if (musicTimer <= 0) {
      musicTimer = 0.24;
      const f = BASS[musicStep % BASS.length];
      musicStep += 1;
      if (f) tone(f * 2, 0.22, 'triangle', 0.10);
      if (musicStep % 16 === 0) { tone(220, 1.6, 'sine', 0.045); tone(261.6, 1.6, 'sine', 0.035); }
      if (musicStep % 16 === 8) { tone(174.6, 1.6, 'sine', 0.045); tone(220, 1.6, 'sine', 0.035); }
    }
  }

  return {
    unlock() { if (ensure()) { startEngine(); startSiren(); } },
    shot() { noise(0.14, 0.5, 900); tone(160, 0.1, 'square', 0.12, 60); },
    thud() { tone(90, 0.12, 'sine', 0.35, 45); noise(0.08, 0.2, 300); },
    crash() { noise(0.3, 0.45, 500); tone(70, 0.3, 'sawtooth', 0.2, 35); },
    pickup() { tone(880, 0.09, 'sine', 0.22); tone(1320, 0.14, 'sine', 0.2, 0, 0.07); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, 0, i * 0.11)); },
    fail() { tone(220, 0.4, 'sawtooth', 0.18, 110); },
    door() { tone(300, 0.07, 'square', 0.12, 180); },
    horn() { tone(370, 0.25, 'square', 0.16); tone(466, 0.25, 'square', 0.1); },
    update(dt, driving, rpm, sirenNear, time) {
      if (!ctx) return;
      try {
        if (engineGain) engineGain.gain.value = driving ? 0.05 + rpm * 0.05 : 0.0;
        if (engineOsc && driving) engineOsc.frequency.value = 50 + rpm * 95;
        if (sirenGain) sirenGain.gain.value = sirenNear ? 0.055 : 0.0;
        if (sirenOsc && sirenNear) sirenOsc.frequency.value = 660 + Math.sin(time * 5.2) * 190;
      } catch { /* ignore */ }
      musicTick(dt);
    },
  };
}
