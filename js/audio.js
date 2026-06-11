/* Musa's Star Adventure — sound effects + music, all generated with WebAudio */
const AudioSys = (() => {
  let ctx = null;
  let musicOn = true;
  let musicTimer = null;
  let musicStep = 0;
  let musicGain = null;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type = 'square', vol = 0.15, slideTo = null, delay = 0) {
    const c = ensure();
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sfx = {
    jump()   { tone(330, 0.18, 'square', 0.10, 620); },
    coin()   { tone(900, 0.07, 'square', 0.10); tone(1350, 0.16, 'square', 0.10, null, 0.07); },
    star()   { [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.16, null, i * 0.09)); },
    stomp()  { tone(220, 0.12, 'square', 0.14, 90); },
    hurt()   { tone(280, 0.3, 'sawtooth', 0.10, 110); },
    bounce() { tone(180, 0.25, 'sine', 0.20, 700); },
    check()  { tone(620, 0.12, 'triangle', 0.14); tone(930, 0.2, 'triangle', 0.14, null, 0.12); },
    flag()   { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.12, null, i * 0.13)); },
    win()    { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, null, i * 0.16)); },
    click()  { tone(500, 0.06, 'square', 0.08); },
  };

  // Cheerful little loop in C major pentatonic. 8th notes at ~132 BPM.
  const MELODY = [
    523, 0, 659, 0, 784, 659, 523, 0,
    587, 0, 659, 0, 523, 0, 392, 0,
    523, 0, 659, 0, 880, 784, 659, 0,
    784, 659, 587, 0, 523, 0, 0, 0,
  ];
  const BASS = [
    131, 0, 0, 0, 196, 0, 0, 0,
    147, 0, 0, 0, 196, 0, 0, 0,
    131, 0, 0, 0, 220, 0, 0, 0,
    196, 0, 0, 0, 131, 0, 0, 0,
  ];

  function musicTick() {
    if (!ctx || !musicOn) return;
    const stepDur = 0.227; // ~132 BPM eighth notes
    const m = MELODY[musicStep % MELODY.length];
    const b = BASS[musicStep % BASS.length];
    if (m) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = m;
      g.gain.setValueAtTime(0.30, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stepDur * 0.9);
      o.connect(g).connect(musicGain);
      o.start(); o.stop(ctx.currentTime + stepDur);
    }
    if (b) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = b;
      g.gain.setValueAtTime(0.55, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stepDur * 1.7);
      o.connect(g).connect(musicGain);
      o.start(); o.stop(ctx.currentTime + stepDur * 1.8);
    }
    musicStep++;
  }

  function startMusic() {
    if (!musicOn || musicTimer) return;
    ensure();
    musicStep = 0;
    musicTimer = setInterval(musicTick, 227);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }
  function toggleMusic() {
    musicOn = !musicOn;
    if (musicOn) startMusic(); else stopMusic();
    return musicOn;
  }

  return { ensure, sfx, startMusic, stopMusic, toggleMusic, get musicOn() { return musicOn; } };
})();
