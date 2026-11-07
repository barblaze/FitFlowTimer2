import { Mode, preset, normalizeConfig } from './core/model.js';

export const CoachStyle = Object.freeze({
  TRAINER: { name: 'TRAINER', folder: 'entrenador', label: 'Entrenador' },
  FLAITE: { name: 'FLAITE', folder: 'flaite', label: 'Modo Flaite' },
  NORMAL: { name: 'NORMAL', folder: 'normal', label: 'Normal' },
  MEMES: { name: 'MEMES', folder: 'memes', label: 'Memes' },
});

export function defaultSettings() {
  return {
    soundEnabled: true,
    soundOutput: 'MEDIA',
    volume: 0.8,
    countdownBeeps: true,
    startTone: true,
    keepScreenOn: true,
    vibration: true,
    voiceEnabled: false,
    coachStyle: 'TRAINER',
    coachVoiceVolume: 1.0,
  };
}

const KEY_CONFIG = 'fitflow.config';
const KEY_SETTINGS = 'fitflow.settings';
const profileKey = (mode) => `fitflow.profile_${mode}`;
const legacyProfileKey = (mode) => `profile_${mode}`;

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function safeGetMigrated(key, legacyKey) {
  const value = safeGet(key);
  if (value !== null) return value;
  const legacy = safeGet(legacyKey);
  if (legacy !== null) safeSet(key, legacy);
  return legacy;
}

export function saveConfig(config) {
  const c = normalizeConfig(config);
  const raw = JSON.stringify(c);
  safeSet(KEY_CONFIG, raw);
  safeSet(profileKey(c.mode), raw);
  return c;
}

export function loadConfig() {
  const raw = safeGetMigrated(KEY_CONFIG, 'config');
  if (!raw) return normalizeConfig();
  try {
    const c = normalizeConfig(JSON.parse(raw));
    const profileRaw = safeGetMigrated(profileKey(c.mode), legacyProfileKey(c.mode));
    if (!profileRaw) safeSet(profileKey(c.mode), JSON.stringify(c));
    return c;
  } catch {
    return normalizeConfig();
  }
}

export function loadProfile(mode) {
  const m = Mode[mode] ? mode : Mode.TABATA;
  const raw = safeGetMigrated(profileKey(m), legacyProfileKey(m));
  if (!raw) return preset(m);
  try {
    return normalizeConfig({ ...JSON.parse(raw), mode: m });
  } catch {
    return preset(m);
  }
}

export function saveSettings(settings) {
  const s = normalizeSettings(settings);
  safeSet(KEY_SETTINGS, JSON.stringify(s));
  return s;
}

export function loadSettings() {
  const raw = safeGetMigrated(KEY_SETTINGS, 'settings');
  if (!raw) return defaultSettings();
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

function normalizeSettings(s = {}) {
  const d = defaultSettings();
  const style = CoachStyle[s.coachStyle] ? s.coachStyle : d.coachStyle;
  return {
    soundEnabled: bool(s.soundEnabled, d.soundEnabled),
    soundOutput: s.soundOutput === 'SYSTEM' ? 'SYSTEM' : 'MEDIA',
    volume: clamp01(s.volume, d.volume),
    countdownBeeps: bool(s.countdownBeeps, d.countdownBeeps),
    startTone: bool(s.startTone, d.startTone),
    keepScreenOn: bool(s.keepScreenOn, d.keepScreenOn),
    vibration: bool(s.vibration, d.vibration),
    voiceEnabled: bool(s.voiceEnabled, d.voiceEnabled),
    coachStyle: style,
    coachVoiceVolume: clamp01(s.coachVoiceVolume, d.coachVoiceVolume),
  };
}

function bool(v, fallback) { return typeof v === 'boolean' ? v : fallback; }
function clamp01(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
