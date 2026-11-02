/**
 * Tiny synthesized sound effects using the Web Audio API — no audio files,
 * so nothing to license or download. Every sound is a few oscillators or a
 * burst of noise with a short envelope.
 */

type SoundName = 'hit' | 'heavyHit' | 'shoot' | 'fire' | 'frost' | 'heal' | 'death' | 'heroDown' | 'cast' | 'interrupt' | 'smash' | 'levelUp' | 'wave' | 'click' | 'gate';

const MUTE_KEY = 'fightwithfriends.muted';

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayed = new Map<SoundName, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* ignore */
    }
  }

  /** Browsers only allow audio after a user gesture; call this from a tap. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    return this.muted;
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    // Don't stack the same sound more than ~20 times a second.
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.05) return;
    this.lastPlayed.set(name, now);
    switch (name) {
      case 'hit':
        this.noise(now, 0.06, 900, 0.25);
        this.tone(now, 'square', 160, 90, 0.05, 0.08);
        break;
      case 'heavyHit':
        this.noise(now, 0.14, 500, 0.45);
        this.tone(now, 'sawtooth', 120, 50, 0.12, 0.25);
        break;
      case 'shoot':
        this.tone(now, 'triangle', 900, 500, 0.07, 0.08);
        break;
      case 'fire':
        this.noise(now, 0.25, 1400, 0.3);
        this.tone(now, 'sawtooth', 300, 120, 0.22, 0.12);
        break;
      case 'frost':
        this.tone(now, 'sine', 1400, 1900, 0.12, 0.12);
        this.tone(now + 0.03, 'sine', 2100, 2600, 0.1, 0.06);
        break;
      case 'heal':
        this.tone(now, 'sine', 660, 660, 0.18, 0.12);
        this.tone(now + 0.07, 'sine', 990, 990, 0.2, 0.1);
        break;
      case 'death':
        this.tone(now, 'square', 300, 60, 0.18, 0.12);
        this.noise(now, 0.1, 700, 0.15);
        break;
      case 'heroDown':
        this.tone(now, 'triangle', 440, 110, 0.6, 0.25);
        break;
      case 'cast':
        this.tone(now, 'sine', 220, 440, 0.3, 0.08);
        break;
      case 'interrupt':
        this.tone(now, 'square', 1200, 300, 0.12, 0.15);
        this.noise(now, 0.05, 2500, 0.2);
        break;
      case 'smash':
        this.noise(now, 0.3, 300, 0.6);
        this.tone(now, 'sawtooth', 90, 35, 0.3, 0.4);
        break;
      case 'levelUp':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(now + i * 0.09, 'triangle', f, f, 0.18, 0.18));
        break;
      case 'wave':
        this.tone(now, 'sawtooth', 196, 196, 0.25, 0.12);
        this.tone(now + 0.18, 'sawtooth', 262, 262, 0.35, 0.12);
        break;
      case 'click':
        this.tone(now, 'square', 700, 700, 0.03, 0.06);
        break;
      case 'gate':
        this.noise(now, 0.18, 250, 0.4);
        this.tone(now, 'square', 80, 60, 0.15, 0.2);
        break;
    }
  }

  private tone(at: number, type: OscillatorType, from: number, to: number, duration: number, volume: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(this.master!);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private noise(at: number, duration: number, cutoff: number, volume: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    src.connect(filter).connect(gain).connect(this.master!);
    src.start(at);
    src.stop(at + duration + 0.02);
  }
}

export const sound = new Sound();
