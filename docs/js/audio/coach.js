// Coach voice playback with queue. Firefox/Chrome use Ogg natively; iOS falls back to stb-vorbis.
import { getAudioContext, unlockAudio } from './beep.js';

const BASE = new URL('../../assets/coach/', import.meta.url).href;
const OGG_PROBE = 'audio/ogg; codecs="vorbis"';
const DECODE_FETCH_TIMEOUT_MS = 12000;

const CANDIDATES = {
  SessionStarting: ['session_starting'],
  WorkStarted: ['work_started'],
  HalfTime: ['halftime', 'half_time'],
  WorkFinished: ['work_finished', 'round_finished'],
  RestStarted: ['rest_started'],
  CycleFinished: ['cycle_finished'],
  SessionFinished: ['session_finished', 'session_finish'],
};

const EXTS_DEFAULT = ['.ogg'];
const EXTS_MEMES = ['.mp3', '.ogg'];
const styleFolders = { TRAINER: 'entrenador', FLAITE: 'flaite', NORMAL: 'normal', MEMES: 'memes' };

export function extensionsForFolder(folder) {
  return folder === 'memes' ? EXTS_MEMES : EXTS_DEFAULT;
}

export function canPlayOggNative() {
  if (typeof document === 'undefined') return true;
  try {
    return !!document.createElement('audio').canPlayType(OGG_PROBE);
  } catch {
    return false;
  }
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '');
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function needsOggDecoder(url) {
  return /\.ogg(?:$|\?)/i.test(String(url)) && (isIOS() || !canPlayOggNative());
}

export class CoachVoice {
  constructor() {
    this.queue = [];
    this.current = null;
    this.style = 'TRAINER';
    this.volume = 1.0;
    this.enabled = true;
    this._unlocked = false;
    this._decodeCache = new Map();
  }

  setStyle(style) { this.style = styleFolders[style] ? style : 'TRAINER'; }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    const a = this.current && this.current.urlAudio;
    if (a) {
      a.volume = this.volume;
      a.muted = this.volume <= 0;
    }
    const gain = this.current && this.current.gain;
    if (gain) gain.gain.value = this.volume;
  }
  setEnabled(v) { this.enabled = !!v; if (!v) this.stopAll(); }

  async unlock() {
    if (this._unlocked) return true;
    this._unlocked = true;
    try { await unlockAudio(); } catch {}
    const warmUrl = BASE + 'entrenador/work_started.ogg';
    if (needsOggDecoder(warmUrl)) {
      import('../vendor/stb-vorbis.js').then(({ StbVorbis }) => StbVorbis.ready).catch(() => {});
      return true;
    }
    try {
      const a = new Audio();
      a.muted = true;
      a.preload = 'auto';
      a.src = warmUrl;
      a.play().catch(() => {});
      const timer = setTimeout(() => {
        try { a.pause(); a.removeAttribute('src'); a.load(); } catch {}
      }, 1500);
      if (timer && typeof timer.unref === 'function') timer.unref();
    } catch {}
    return true;
  }

  playEvent(eventType) {
    if (!this.enabled) return;
    const names = CANDIDATES[eventType];
    if (!names) return;
    const folder = styleFolders[this.style] || 'entrenador';
    this.enqueueNames(folder, names);
  }

  playTest(style) {
    const folder = styleFolders[style] || 'entrenador';
    this.stopAll();
    this.enqueueNames(folder, CANDIDATES.WorkStarted, true);
  }

  enqueueNames(folder, names, force) {
    const key = folder + ':' + names[0];
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.current;
    if (!force && last && last.key === key) return;
    this.queue.push({ folder, names, key });
    if (!this.current) this._drain();
  }

  async _drain() {
    if (this.current || !this.queue.length) return;
    const item = this.queue.shift();
    this.current = item;
    await this._playItem(item);
    if (this.current !== item) return;
    this.current = null;
    this._drain();
  }

  async _playItem(item) {
    for (const name of item.names) {
      for (const ext of extensionsForFolder(item.folder)) {
        if (this.current !== item) return false;
        const url = BASE + encodeURIComponent(item.folder) + '/' + encodeURIComponent(name + ext);
        const played = await this._tryUrl(url, item);
        if (this.current !== item) return false;
        if (played) return true;
      }
    }
    return false;
  }

  async _tryUrl(url, item) {
    if (this.current !== item) return false;
    if (needsOggDecoder(url)) return this._tryDecoded(url, item);
    const played = await this._tryNative(url, item);
    if (!played && /\.ogg(?:$|\?)/i.test(url) && this.current === item) return this._tryDecoded(url, item);
    return played;
  }

  _tryNative(url, item) {
    return new Promise((resolve) => {
      let settled = false;
      let loadTimer = null;
      const a = new Audio();
      const release = () => {
        try { a.pause(); a.removeAttribute('src'); a.load(); } catch {}
      };
      const cleanup = () => {
        if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
        a.onended = a.onerror = a.onabort = a.onstalled = a.onplaying = null;
      };
      const done = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (item && item.urlAudio === a) item.urlAudio = null;
        release();
        resolve(value);
      };
      a.preload = 'auto';
      a.volume = Math.max(0, Math.min(1, Number(this.volume)));
      a.muted = this.volume <= 0;
      a.onended = () => done(true);
      a.onerror = () => done(false);
      a.onabort = () => done(false);
      a.onplaying = () => {
        if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
      };
      if (item) item.urlAudio = a;
      loadTimer = setTimeout(() => done(false), 6000);
      if (loadTimer && typeof loadTimer.unref === 'function') loadTimer.unref();
      a.src = url;
      a.play().catch(() => done(false));
    });
  }

  _decodeBuffer(url) {
    if (this._decodeCache.has(url)) return this._decodeCache.get(url);
    const pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DECODE_FETCH_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(url, { cache: 'force-cache', signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`audio ${res.status}`);
      const data = await res.arrayBuffer();
      const { StbVorbis } = await import('../vendor/stb-vorbis.js');
      await StbVorbis.ready;
      const decoded = StbVorbis.decode(data);
      const ac = getAudioContext();
      if (!ac) throw new Error('no audio context');
      const buffer = ac.createBuffer(decoded.channels.length, decoded.channels[0].length, decoded.sampleRate);
      for (let i = 0; i < decoded.channels.length; i++) buffer.copyToChannel(decoded.channels[i], i);
      return buffer;
    })();
    this._decodeCache.set(url, pending);
    pending.catch(() => {
      if (this._decodeCache.get(url) === pending) this._decodeCache.delete(url);
    });
    return pending;
  }

  async _tryDecoded(url, item) {
    const ac = getAudioContext();
    if (!ac) return false;
    try { if (ac.state === 'suspended') await ac.resume(); } catch { return false; }

    let buffer;
    try { buffer = await this._decodeBuffer(url); } catch { return false; }
    if (this.current !== item) return false;

    return new Promise((resolve) => {
      let settled = false;
      const source = ac.createBufferSource();
      const gain = ac.createGain();
      source.buffer = buffer;
      gain.gain.value = this.volume;
      source.connect(gain);
      gain.connect(ac.destination);

      const done = (value) => {
        if (settled) return;
        settled = true;
        source.onended = null;
        try { source.disconnect(); gain.disconnect(); } catch {}
        if (item) {
          if (item.source === source) item.source = null;
          if (item.gain === gain) item.gain = null;
          if (item.decodedStop === done) item.decodedStop = null;
        }
        resolve(value);
      };

      source.onended = () => done(true);
      if (item) {
        item.source = source;
        item.gain = gain;
        item.urlAudio = null;
        item.decodedStop = done;
      }
      try { source.start(0); } catch { done(false); }
    });
  }

  stopAll() {
    this.queue = [];
    const item = this.current;
    this.current = null;
    if (!item) return;
    const source = item.source;
    try {
      if (item.urlAudio) {
        item.urlAudio.pause();
        item.urlAudio.removeAttribute('src');
        item.urlAudio.load();
      }
    } catch {}
    try { if (item.decodedStop) item.decodedStop(false); } catch {}
    try { if (source) source.stop(); } catch {}
    item.urlAudio = null;
    item.source = null;
    item.gain = null;
    item.decodedStop = null;
  }

  // Called after resume from background: don't replay queued stale items.
  clearQueueKeepCurrent() {
    this.queue = [];
  }
}
