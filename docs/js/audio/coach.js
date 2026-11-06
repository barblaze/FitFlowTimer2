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

const EXTS = ['.ogg', '.mp3', '.m4a']; // prefer ogg (Mozilla), fallbacks for compatibility
const styleFolders = { TRAINER: 'entrenador', FLAITE: 'flaite', NORMAL: 'normal', MEMES: 'memes' };

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
  setVolume(v) { this.volume = Math.max(0, Math.min(1, Number(v) || 0)); }
  setEnabled(v) { this.enabled = !!v; if (!v) this.stopAll(); }

  async unlock() {
    if (this._unlocked) return true;
    try {
      const a = new Audio();
      a.muted = true;
      a.src = 'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA'; // tiny silent-ish stub; play may still fail, fine
      await a.play().catch(() => {});
      a.pause();
      this._unlocked = true;
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
    this.enqueueNames(folder, CANDIDATES.SessionStarting, true);
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
    const ok = await this._playItem(item);
    if (!ok) {
      this.current = null;
      this._drain();
    }
  }

  async _playItem(item) {
    // Try candidates in order; Audio.canPlayType not definitive for ogg path resolution here, so attempt load/play.
    for (const name of item.names) {
      for (const ext of EXTS) {
        const url = BASE + encodeURIComponent(item.folder) + '/' + encodeURIComponent(name + ext);
        const played = await this._tryUrl(url);
        if (played) return true;
      }
    }
    return false;
  }

  _tryUrl(url) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; cleanup(); resolve(v); };
      const a = new Audio();
      a.preload = 'auto';
      const vol = this.volume <= 0 ? 1.0 : this.volume;
      a.volume = Math.max(0, Math.min(1, vol));
      const cleanup = () => {
        a.onended = a.onerror = a.onabort = a.onstalled = null;
      };
      a.onended = () => { if (this.current && this.current.urlAudio === a) this.current = null; done(true); this._drain(); };
      a.onerror = () => done(false);
      a.onabort = () => done(false);
      // Attach so we can check identity; also store on item
      if (this.current) this.current.urlAudio = a;
      a.src = url;
      a.play().then(() => {
        // playing; onended will resolve true
      }).catch(() => done(false));
      // Safety timeout in case load hangs on missing asset with odd server behavior
      setTimeout(() => { if (!settled) { try { a.pause(); } catch {} done(false); } }, 12000);
    });
  }

  stopAll() {
    this.queue = [];
    try {
      if (this.current && this.current.urlAudio) { this.current.urlAudio.pause(); this.current.urlAudio.src = ''; }
    } catch {}
    this.current = null;
  }

  // Called after resume from background: don't replay queued stale items.
  clearQueueKeepCurrent() {
    this.queue = [];
  }
}
