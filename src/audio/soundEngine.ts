// Procedural Web Audio Synthesizer & Dynamic Upbeat Background Music Sequencer
// 100% Procedural Web Audio API (Zero external MP3/WAV dependencies)

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private musicEnabled: boolean = true;
  private coinStreak: number = 0;
  private lastCoinTime: number = 0;

  // Dynamic Background Music Sequencer State
  private musicTimerId: number | null = null;
  private musicStep: number = 0;
  private musicPaceFactor: number = 1.0; // 1.0 = normal run, >1.3 = high speed, 0.75 = menu ambiance
  private isInRunMusic: boolean = false;

  constructor() {
    try {
      const savedMute = localStorage.getItem('relic_strider_muted');
      if (savedMute === 'true') this.muted = true;
      const savedMusic = localStorage.getItem('relic_strider_music');
      if (savedMusic === 'false') this.musicEnabled = false;
    } catch {
      // ignore storage errors
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isMusicEnabled(): boolean {
    return this.musicEnabled && !this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('relic_strider_muted', String(this.muted));
    } catch {
      // ignore
    }
    if (this.muted) {
      this.stopMusic();
    } else if (this.musicEnabled) {
      this.startMusic(this.isInRunMusic);
    }
    return this.muted;
  }

  public toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    try {
      localStorage.setItem('relic_strider_music', String(this.musicEnabled));
    } catch {
      // ignore
    }
    if (!this.musicEnabled) {
      this.stopMusic();
    } else if (!this.muted) {
      this.startMusic(this.isInRunMusic);
    }
    return this.musicEnabled;
  }

  /**
   * Adjusts dynamic music tempo and brightness based on player speed and game state.
   */
  public setMusicDynamics(speedKmh: number, inActiveRun: boolean): void {
    this.isInRunMusic = inActiveRun;
    // Normalize 75 km/h -> 1.0, 140 km/h -> 1.38
    const normalized = Math.max(0.85, Math.min(1.42, speedKmh / 78));
    this.musicPaceFactor = inActiveRun ? normalized : 0.8;
  }

  public startMusic(inActiveRun = true): void {
    this.isInRunMusic = inActiveRun;
    if (this.muted || !this.musicEnabled) return;
    if (this.musicTimerId !== null) return;

    // Ensure AudioContext is initialized on user gesture
    this.getContext();

    const scheduleNextStep = () => {
      if (this.muted || !this.musicEnabled) {
        this.musicTimerId = null;
        return;
      }

      this.playSequencerStep(this.musicStep);
      this.musicStep = (this.musicStep + 1) % 16;

      // Base 124 BPM sixteenth-note = ~121ms; scales faster as runner accelerates
      const stepDurationMs = Math.round(122 / this.musicPaceFactor);
      this.musicTimerId = window.setTimeout(scheduleNextStep, stepDurationMs);
    };

    scheduleNextStep();
  }

  public stopMusic(): void {
    if (this.musicTimerId !== null) {
      clearTimeout(this.musicTimerId);
      this.musicTimerId = null;
    }
  }

  private playSequencerStep(step: number): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // D Dorian / Minor Pentatonic Solar-Runner Scale (Hz)
    // Bassline pattern (D2, D2, F2, G2, A2, C3, A2, G2)
    const bassNotes = [
      73.42, 73.42, 146.83, 73.42, 87.31, 87.31, 98.0, 110.0,
      73.42, 73.42, 146.83, 73.42, 130.81, 110.0, 98.0, 87.31,
    ];

    // Upbeat arpeggio lead pattern
    const arpNotes = [
      293.66, 349.23, 440.0, 587.33, 523.25, 440.0, 349.23, 440.0,
      293.66, 392.0, 440.0, 659.25, 587.33, 523.25, 440.0, 392.0,
    ];

    const volScale = this.isInRunMusic ? 1.0 : 0.45;

    // 1. Driving Synth Bass on every step (accented on downbeats)
    const bassFreq = bassNotes[step % bassNotes.length];
    const bassOsc = ctx.createOscillator();
    const bassFilter = ctx.createBiquadFilter();
    const bassGain = ctx.createGain();

    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(bassFreq, now);

    bassFilter.type = 'lowpass';
    const cutoff =
      (step % 4 === 0 ? 780 : 460) * Math.min(1.4, this.musicPaceFactor);
    bassFilter.frequency.setValueAtTime(cutoff, now);
    bassFilter.frequency.exponentialRampToValueAtTime(140, now + 0.11);

    const bassAmp = (step % 4 === 0 ? 0.055 : 0.032) * volScale;
    bassGain.gain.setValueAtTime(bassAmp, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.115);

    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(ctx.destination);
    bassOsc.start(now);
    bassOsc.stop(now + 0.12);

    // 2. Melodic Solar Pluck Arpeggio (active during run or every even step in menu)
    if (this.isInRunMusic || step % 2 === 0) {
      const arpFreq = arpNotes[step % arpNotes.length];
      const arpOsc = ctx.createOscillator();
      const arpGain = ctx.createGain();

      arpOsc.type = 'triangle';
      arpOsc.frequency.setValueAtTime(arpFreq, now);

      const arpAmp = (step % 4 === 2 ? 0.036 : 0.022) * volScale;
      arpGain.gain.setValueAtTime(arpAmp, now);
      arpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      arpOsc.connect(arpGain);
      arpGain.connect(ctx.destination);
      arpOsc.start(now);
      arpOsc.stop(now + 0.115);
    }

    // 3. Upbeat Electronic Kick on steps 0, 4, 8, 12
    if (this.isInRunMusic && step % 4 === 0) {
      const kickOsc = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(125, now);
      kickOsc.frequency.exponentialRampToValueAtTime(36, now + 0.09);

      kickGain.gain.setValueAtTime(0.09, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

      kickOsc.connect(kickGain);
      kickGain.connect(ctx.destination);
      kickOsc.start(now);
      kickOsc.stop(now + 0.1);
    }

    // 4. Crisp Off-Beat Hi-Hat / Shaker on steps 2, 6, 10, 14
    if (this.isInRunMusic && step % 4 === 2) {
      const hatOsc = ctx.createOscillator();
      const hatFilter = ctx.createBiquadFilter();
      const hatGain = ctx.createGain();

      hatOsc.type = 'square';
      hatOsc.frequency.setValueAtTime(6400, now);
      hatFilter.type = 'highpass';
      hatFilter.frequency.setValueAtTime(5000, now);

      hatGain.gain.setValueAtTime(0.016, now);
      hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

      hatOsc.connect(hatFilter);
      hatFilter.connect(hatGain);
      hatGain.connect(ctx.destination);
      hatOsc.start(now);
      hatOsc.stop(now + 0.05);
    }
  }

  public playLaneSwitch(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(460, now + 0.075);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playJump(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Dual-layer thruster jump sound
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc2.type = 'sine';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(590, now + 0.16);
    osc2.frequency.setValueAtTime(285, now);
    osc2.frequency.exponentialRampToValueAtTime(880, now + 0.16);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.18);
    osc2.stop(now + 0.18);
  }

  public playSlide(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(105, now + 0.15);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.15);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playCoinPickup(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (now - this.lastCoinTime < 0.45) {
      this.coinStreak = Math.min(this.coinStreak + 1, 10);
    } else {
      this.coinStreak = 0;
    }
    this.lastCoinTime = now;

    const baseFreq = 587.33 * Math.pow(1.059463, this.coinStreak); // D5 ascending pitch
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc2.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.setValueAtTime(baseFreq * 1.25, now + 0.045);
    osc2.frequency.setValueAtTime(baseFreq * 1.5, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.17);
    osc2.stop(now + 0.17);
  }

  public playDash(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.11);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.25);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playBarrierShatter(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sub-bass punch
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(38, now + 0.24);
    subGain.gain.setValueAtTime(0.28, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.25);

    // Stone crumble noise burst
    const bufferSize = Math.floor(ctx.sampleRate * 0.22);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1100, now);
    filter.Q.setValueAtTime(1.4, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.22, now);
    nGain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
  }

  public playPowerUp(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [440, 554.37, 659.25, 880];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const start = now + idx * 0.05;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    });
  }

  public playTutorialStepSuccess(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5 - E5 - G5 chime

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.06;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.13, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  }

  public playShieldBreak(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(680, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.3);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  }

  public playObstacleHit(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Heavy stone crunch impact + low metallic thud
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(160, now);
    sub.frequency.exponentialRampToValueAtTime(32, now + 0.28);
    subGain.gain.setValueAtTime(0.32, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.3);

    const bufferSize = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.28));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.24, now);
    nGain.gain.exponentialRampToValueAtTime(0.005, now + 0.18);
    noise.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
  }

  public playGameOver(): void {
    this.playObstacleHit();
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [330, 293.66, 246.94, 164.81];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      const start = now + 0.08 + idx * 0.09;
      osc.frequency.setValueAtTime(freq, start);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, start);

      gain.gain.setValueAtTime(0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  public playRankOvertake(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const start = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.1, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }
}

export const soundEngine = new SoundEngine();
