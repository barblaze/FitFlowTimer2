// Coach voice playback with queue. Firefox uses .ogg; fallback order supports others.
const BASE = new URL('../../assets/coach/', import.meta.url).href;

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

export class CoachVoice {
  constructor() {
    this.queue = [];
    this.current = null;
    this.style = 'TRAINER';
    this.volume = 1.0;
    this.enabled = true;
    this._unlocked = false;
  }

  setStyle(style) { this.style = styleFolders[style] ? style : 'TRAINER'; }
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0));
    const a = this.current && this.current.urlAudio;
    if (a) {
      a.volume = this.volume;
      a.muted = this.volume <= 0;
    }
  }
  setEnabled(v) { this.enabled = !!v; if (!v) this.stopAll(); }

  async unlock() {
    if (this._unlocked) return true;
    this._unlocked = true;
    try {
      const a = new Audio();
      a.muted = true;
      a.preload = 'auto';
      a.src = BASE + 'entrenador/work_started.ogg';
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
    // Try candidates in order; Audio.canPlayType not definitive for ogg path resolution here, so attempt load/play.
    for (const name of item.names) {
      for (const ext of extensionsForFolder(item.folder)) {
        if (this.current !== item) return false;
        const url = BASE + encodeURIComponent(item.folder) + '/' + encodeURIComponent(name + ext);
        const played = await this._tryUrl(url);
        if (this.current !== item) return false;
        if (played) return true;
      }
    }
    return false;
  }

  _tryUrl(url) {
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
        if (this.current && this.current.urlAudio === a) this.current.urlAudio = null;
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
      if (this.current) this.current.urlAudio = a;
      loadTimer = setTimeout(() => done(false), 6000);
      if (loadTimer && typeof loadTimer.unref === 'function') loadTimer.unref();
      a.src = url;
      a.play().catch(() => done(false));
    });
  }

  stopAll() {
    this.queue = [];
    try {
      const a = this.current && this.current.urlAudio;
      if (a) {
        this.current.urlAudio = null;
        a.pause();
        a.removeAttribute('src');
        a.load();
      }
    } catch {}
    this.current = null;
  }

  // Called after resume from background: don't replay queued stale items.
  clearQueueKeepCurrent() {
    this.queue = [];
  }
}
