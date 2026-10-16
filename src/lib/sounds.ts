/*
 * Tiny synthesized UI sounds in the spirit of a game console menu.
 * No audio files: everything is generated with the Web Audio API.
 */
type Sound = 'tick' | 'select' | 'back' | 'success' | 'error' | 'pop' | 'toggle';

let ctx: AudioContext | null = null;
let enabled = true;
let lastTick = 0;
let lastPlayed = 0;

/** True if a sound played very recently (so a generic click sound would double up). */
export const playedRecently = (ms = 120) => performance.now() - lastPlayed < ms;

try {
  enabled = localStorage.getItem('fge-sound') !== 'off';
} catch {
  /* storage blocked */
}

export const soundsEnabled = () => enabled;
export function setSoundsEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem('fge-sound', on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (!enabled) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(ac: AudioContext, freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine', endFreq?: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function play(sound: Sound) {
  const ac = audio();
  if (!ac) return;
  lastPlayed = performance.now();
  const t = ac.currentTime + 0.005;
  switch (sound) {
    case 'tick': {
      const nowMs = performance.now();
      if (nowMs - lastTick < 60) return;
      lastTick = nowMs;
      tone(ac, 2200, t, 0.03, 0.025, 'triangle');
      break;
    }
    case 'select':
      tone(ac, 1320, t, 0.05, 0.06, 'square');
      tone(ac, 1760, t + 0.035, 0.07, 0.04, 'sine');
      break;
    case 'back':
      tone(ac, 900, t, 0.08, 0.05, 'triangle', 600);
      break;
    case 'toggle':
      tone(ac, 1500, t, 0.04, 0.05, 'triangle');
      break;
    case 'pop':
      tone(ac, 600, t, 0.09, 0.06, 'sine', 1200);
      break;
    case 'success':
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(ac, f, t + i * 0.07, 0.16, 0.05, 'square'));
      break;
    case 'error':
      tone(ac, 220, t, 0.12, 0.06, 'square');
      tone(ac, 196, t + 0.12, 0.16, 0.06, 'square');
      break;
  }
}
