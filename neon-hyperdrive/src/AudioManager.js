// Áudio procedural via Web Audio API.
// Qualquer efeito pode ser substituído por um arquivo: audio.loadSample('boost', 'sons/boost.ogg').
// Se existir um sample registrado com o mesmo nome, ele toca no lugar do sintetizador.

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

const MUSIC = {
  stepsPerBar: 16,
  bpm: 112,
  bars: [
    { root: 33, chord: [0, 3, 7, 10] },
    { root: 29, chord: [0, 4, 7, 11] },
    { root: 36, chord: [0, 4, 7, 9] },
    { root: 31, chord: [0, 4, 7, 10] },
  ],
  arp: [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2],
};

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.samples = new Map();
    this.engine = null;
    this.music = { playing: false, mode: 'menu', step: 0, nextTime: 0 };
    this.paused = false;
    this._lowEnergyTimer = 0;
    this._rechargeTimer = 0;

    this.synths = {
      confirm: () => {
        this._tone({ type: 'square', f0: 660, f1: 990, dur: 0.12, gain: 0.12 });
        this._tone({ type: 'square', f0: 1320, dur: 0.1, gain: 0.08, delay: 0.07 });
      },
      select: () => this._tone({ type: 'square', f0: 520, dur: 0.06, gain: 0.08 }),
      back: () => this._tone({ type: 'square', f0: 420, f1: 260, dur: 0.12, gain: 0.1 }),
      countdown: () => this._tone({ type: 'square', f0: 440, dur: 0.22, gain: 0.2 }),
      go: () => {
        this._tone({ type: 'square', f0: 880, dur: 0.55, gain: 0.22 });
        this._tone({ type: 'sawtooth', f0: 1760, dur: 0.4, gain: 0.07 });
      },
      boost: () => {
        this._noise({ dur: 0.7, gain: 0.3, f0: 500, f1: 4500, q: 1.2 });
        this._tone({ type: 'sawtooth', f0: 110, f1: 620, dur: 0.5, gain: 0.14 });
      },
      boostPad: () => {
        this._noise({ dur: 0.45, gain: 0.3, f0: 900, f1: 6000, q: 2 });
        this._tone({ type: 'square', f0: 330, f1: 1320, dur: 0.3, gain: 0.12 });
      },
      collision: ({ intensity = 0.5 } = {}) => {
        this._noise({ dur: 0.18 + intensity * 0.2, gain: 0.25 + intensity * 0.45, f0: 1400, f1: 180, q: 0.7, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 150, f1: 45, dur: 0.22, gain: 0.3 + intensity * 0.3 });
      },
      explosion: () => {
        this._noise({ dur: 1.1, gain: 0.7, f0: 2400, f1: 80, q: 0.6, type: 'lowpass' });
        this._tone({ type: 'sine', f0: 120, f1: 28, dur: 0.9, gain: 0.6 });
      },
      checkpoint: () => {
        this._tone({ type: 'triangle', f0: 880, dur: 0.1, gain: 0.2 });
        this._tone({ type: 'triangle', f0: 1320, dur: 0.16, gain: 0.2, delay: 0.09 });
      },
      recharge: () => this._tone({ type: 'sine', f0: 700 + Math.random() * 500, f1: 1500, dur: 0.14, gain: 0.1 }),
      lowEnergy: () => {
        this._tone({ type: 'square', f0: 980, dur: 0.09, gain: 0.13 });
        this._tone({ type: 'square', f0: 980, dur: 0.09, gain: 0.13, delay: 0.16 });
      },
      lap: () => [660, 880, 1100].forEach((f, i) => this._tone({ type: 'square', f0: f, dur: 0.14, gain: 0.14, delay: i * 0.09 })),
      finalLap: () => [880, 880, 1175].forEach((f, i) => this._tone({ type: 'square', f0: f, dur: 0.16, gain: 0.17, delay: i * 0.15 })),
      bestLap: () => [784, 988, 1175, 1568].forEach((f, i) => this._tone({ type: 'triangle', f0: f, dur: 0.2, gain: 0.2, delay: i * 0.08 })),
      finish: () => [523, 659, 784, 1047, 1319].forEach((f, i) => this._tone({ type: 'square', f0: f, dur: 0.3, gain: 0.16, delay: i * 0.12 })),
      respawn: () => this._tone({ type: 'sine', f0: 200, f1: 900, dur: 0.35, gain: 0.18 }),
      land: () => this._tone({ type: 'sine', f0: 110, f1: 50, dur: 0.14, gain: 0.3 }),
    };
  }

  // Deve ser chamado a partir de um gesto do usuário (clique ou tecla).
  unlock() {
    if (!this.ctx) this._init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 6;
      compressor.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.connect(compressor);
      this.sfxBus = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.engineBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.engineBus.connect(this.master);

      const length = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    } catch (err) {
      console.warn('Áudio indisponível:', err);
      this.ctx = null;
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    this.master.gain.setTargetAtTime(s.get('master'), t, 0.03);
    this.sfxBus.gain.setTargetAtTime(s.get('sfx'), t, 0.03);
    this.engineBus.gain.setTargetAtTime(this.paused ? 0 : s.get('sfx') * 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.get('music') * (this.paused ? 0.3 : 1), t, 0.05);
  }

  setPaused(paused) {
    this.paused = paused;
    this.applyVolumes();
  }

  async loadSample(name, url) {
    if (!this.ctx) this._init();
    if (!this.ctx) return false;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
      this.samples.set(name, buffer);
      return true;
    } catch (err) {
      console.warn(`Não foi possível carregar o som "${name}" (${url}):`, err);
      return false;
    }
  }

  play(name, options) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const sample = this.samples.get(name);
    if (sample) {
      const src = this.ctx.createBufferSource();
      src.buffer = sample;
      const gain = this.ctx.createGain();
      gain.gain.value = options?.volume ?? 1;
      src.connect(gain).connect(this.sfxBus);
      src.start();
      return;
    }
    this.synths[name]?.(options);
  }

  _tone({ type = 'sine', f0, f1 = f0, dur = 0.2, gain = 0.2, attack = 0.005, delay = 0, time = null, dest = this.sfxBus, cutoff = 0 }) {
    const ctx = this.ctx;
    const t0 = (time ?? ctx.currentTime) + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    if (cutoff > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      osc.connect(filter).connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(dest);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  _noise({ dur = 0.3, gain = 0.3, type = 'bandpass', f0 = 1000, f1 = f0, q = 1, delay = 0, time = null, dest = this.sfxBus }) {
    const ctx = this.ctx;
    const t0 = (time ?? ctx.currentTime) + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(dest);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.03);
  }

  // ---------- motor ----------

  startEngine() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 2;
    const body = ctx.createOscillator();
    body.type = 'sawtooth';
    const whineA = ctx.createOscillator();
    whineA.type = 'triangle';
    const whineB = ctx.createOscillator();
    whineB.type = 'sine';
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.2;
    body.connect(filter);
    whineA.connect(whineGain);
    whineB.connect(whineGain);
    whineGain.connect(filter);
    filter.connect(out).connect(this.engineBus);

    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter).connect(windGain).connect(this.engineBus);

    for (const node of [body, whineA, whineB, wind]) node.start();
    this.engine = { out, filter, body, whineA, whineB, whineGain, wind, windFilter, windGain };
  }

  updateEngine(speedRatio, throttle, boost) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const f = 48 + speedRatio * 120 + throttle * 12 + boost * 30;
    e.body.frequency.setTargetAtTime(f, t, 0.06);
    e.whineA.frequency.setTargetAtTime(f * 3, t, 0.06);
    e.whineB.frequency.setTargetAtTime(f * 3.03 + 2, t, 0.06);
    e.whineGain.gain.setTargetAtTime(0.15 + speedRatio * 0.35 + boost * 0.2, t, 0.1);
    e.filter.frequency.setTargetAtTime(350 + speedRatio * 2200 + throttle * 500 + boost * 900, t, 0.08);
    e.out.gain.setTargetAtTime(0.1 + throttle * 0.07 + speedRatio * 0.06, t, 0.1);
    e.windFilter.frequency.setTargetAtTime(500 + speedRatio * 1800, t, 0.1);
    e.windGain.gain.setTargetAtTime(speedRatio * speedRatio * 0.16 + boost * 0.1, t, 0.12);
  }

  stopEngine() {
    const e = this.engine;
    if (!e) return;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.out.gain.setTargetAtTime(0, t, 0.08);
    e.windGain.gain.setTargetAtTime(0, t, 0.08);
    for (const node of [e.body, e.whineA, e.whineB, e.wind]) node.stop(t + 0.5);
  }

  // ---------- alertas periódicos ----------

  tickLowEnergy(dt, active) {
    if (!active) {
      this._lowEnergyTimer = 0;
      return;
    }
    this._lowEnergyTimer -= dt;
    if (this._lowEnergyTimer <= 0) {
      this._lowEnergyTimer = 0.9;
      this.play('lowEnergy');
    }
  }

  tickRecharge(dt, active) {
    this._rechargeTimer -= dt;
    if (active && this._rechargeTimer <= 0) {
      this._rechargeTimer = 0.16;
      this.play('recharge');
    }
  }

  // ---------- trilha sonora procedural ----------

  startMusic(mode) {
    this.music.mode = mode;
    if (this.music.playing) return;
    this.music.playing = true;
    this.music.step = 0;
    this.music.nextTime = 0;
  }

  stopMusic() {
    this.music.playing = false;
  }

  update(dt) {
    const m = this.music;
    if (!this.ctx || this.ctx.state !== 'running' || !m.playing) return;
    const now = this.ctx.currentTime;
    const stepDur = 60 / MUSIC.bpm / 4;
    if (m.nextTime < now) m.nextTime = now + 0.05;
    while (m.nextTime < now + 0.18) {
      this._scheduleStep(m.step, m.nextTime, stepDur, m.mode === 'race');
      m.step++;
      m.nextTime += stepDur;
    }
  }

  _scheduleStep(step, time, stepDur, full) {
    const dest = this.musicBus;
    const inBar = step % MUSIC.stepsPerBar;
    const bar = MUSIC.bars[Math.floor(step / MUSIC.stepsPerBar) % MUSIC.bars.length];

    if (inBar % 2 === 0) {
      const octave = inBar % 8 === 6 ? 12 : 0;
      this._tone({ type: 'sawtooth', f0: midi(bar.root + octave), dur: stepDur * 1.7, gain: full ? 0.2 : 0.13, time, dest, cutoff: full ? 700 : 420 });
    }
    const note = bar.root + 24 + bar.chord[MUSIC.arp[inBar]];
    this._tone({ type: 'square', f0: midi(note), dur: stepDur * 0.9, gain: full ? 0.05 : 0.035, time, dest, cutoff: 2600 });

    if (!full) return;
    if (inBar % 4 === 0) this._tone({ type: 'sine', f0: 150, f1: 42, dur: 0.2, gain: 0.5, time, dest });
    if (inBar % 8 === 4) this._noise({ dur: 0.14, gain: 0.2, f0: 1900, q: 0.8, time, dest });
    if (inBar % 4 === 2) this._noise({ dur: 0.05, gain: 0.07, type: 'highpass', f0: 7000, time, dest });
  }
}
