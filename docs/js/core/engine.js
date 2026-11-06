import { buildSegments, PhaseType } from './planner.js';

export class TimerEngine {
  constructor(config, clock, announcer) {
    this.config = config;
    this.clock = clock || (() => Date.now());
    this.announcer = typeof announcer === 'function' ? announcer : () => {};
    this.segments = buildSegments(config);
    this.totalMs = this.segments.reduce((a, s) => a + (s.durationSeconds * 1000), 0);
    this.index = 0;
    this.isRunning = false;
    this.isFinished = false;
    this.segmentEndMs = 0;
    this.pausedRemainingMs = 0;
    this.lastWholeSecond = -1;
    this.halfwayFired = false;
  }

  get currentSegment() { return this.segments[this.index] || null; }

  start() {
    if (!this.segments.length) {
      this.isFinished = true;
      this.isRunning = false;
      return [];
    }
    this.index = 0;
    this.isFinished = false;
    this.isRunning = true;
    this.lastWholeSecond = -1;
    this.halfwayFired = false;
    this.segmentEndMs = this.clock() + (this.segments[0].durationSeconds * 1000);
    const first = this.segments[0];
    if (first.type === PhaseType.PREPARATION) {
      this.announcer({ type: 'SessionStarting', totalSeconds: Math.floor(this.totalMs / 1000) });
    } else if (first.type === PhaseType.WORK) {
      this.announcer({ type: 'WorkStarted', round: first.round, cycle: first.cycle });
    } else {
      this.announcer({ type: 'RestStarted', seconds: first.durationSeconds });
    }
    return [];
  }

  pause() {
    if (!this.isRunning || this.isFinished) return;
    this.pausedRemainingMs = Math.max(0, this.segmentEndMs - this.clock());
    this.isRunning = false;
  }

  resume() {
    if (this.isRunning || this.isFinished) return;
    this.segmentEndMs = this.clock() + this.pausedRemainingMs;
    this.isRunning = true;
  }

  stop() {
    this.isRunning = false;
    this.isFinished = true;
  }

  skip() {
    if (this.isFinished) return;
    if (this.index + 1 >= this.segments.length) {
      this.finish();
      return;
    }
    this.moveTo(this.index + 1, true);
  }

  remainingMs() {
    if (this.isFinished) return 0;
    if (!this.isRunning) return Math.max(0, this.pausedRemainingMs);
    return Math.max(0, this.segmentEndMs - this.clock());
  }

  progress() {
    const seg = this.currentSegment;
    if (!seg) return 1;
    const total = seg.durationSeconds * 1000;
    if (total <= 0) return 1;
    const done = 1 - (this.remainingMs() / total);
    return Math.max(0, Math.min(1, done));
  }

  elapsedMs() {
    let done = 0;
    for (let i = 0; i < this.index; i++) done += this.segments[i].durationSeconds * 1000;
    const seg = this.currentSegment;
    if (!seg) return this.totalMs;
    return done + (seg.durationSeconds * 1000 - this.remainingMs());
  }

  /** Call periodically (~100ms). Returns engine events produced now. */
  tick() {
    const events = [];
    if (!this.isRunning || this.isFinished) return events;
    let guard = 0;
    while (guard++ < 500) {
      if ((this.segmentEndMs - this.clock()) > 0) break;
      const finished = this.segments[this.index];
      if (!finished) break;
      if (finished.type === PhaseType.WORK) {
        this.announcer({ type: 'WorkFinished', round: finished.round });
      }
      if (this.index + 1 >= this.segments.length) {
        this.finish();
        events.push({ type: 'Finished' });
        return events;
      }
      this.moveTo(this.index + 1, false);
      events.push({ type: 'SegmentChanged', index: this.index, segment: this.segments[this.index] });
    }

    const seg = this.currentSegment;
    if (!seg) return events;
    const remaining = this.segmentEndMs - this.clock();
    const wholeSecond = Math.ceil(remaining / 1000);
    if (wholeSecond !== this.lastWholeSecond) {
      if (wholeSecond >= 1 && wholeSecond <= 3) events.push({ type: 'Countdown', secondsLeft: wholeSecond });
      this.lastWholeSecond = wholeSecond;
    }
    if (!this.halfwayFired && seg.type === PhaseType.WORK) {
      const halfMs = (seg.durationSeconds * 1000) / 2;
      if (remaining <= halfMs) {
        this.halfwayFired = true;
        events.push({ type: 'HalfTime', segment: seg });
        this.announcer({ type: 'HalfTime', round: seg.round, cycle: seg.cycle });
      }
    }
    return events;
  }

  moveTo(newIndex, fromNow) {
    const previous = this.segments[this.index];
    this.index = newIndex;
    const seg = this.segments[this.index];
    this.segmentEndMs = fromNow
      ? (this.clock() + (seg.durationSeconds * 1000))
      : (this.segmentEndMs + (seg.durationSeconds * 1000));
    this.lastWholeSecond = -1;
    this.halfwayFired = false;
    if (previous && seg.type === PhaseType.WORK && seg.cycle > previous.cycle) {
      this.announcer({ type: 'CycleFinished', cycle: previous.cycle });
    }
    if (seg.type === PhaseType.WORK) {
      this.announcer({ type: 'WorkStarted', round: seg.round, cycle: seg.cycle });
    } else if (seg.type === PhaseType.REST || seg.type === PhaseType.REST_BETWEEN_CYCLES) {
      this.announcer({ type: 'RestStarted', seconds: seg.durationSeconds });
    }
  }

  finish() {
    this.isRunning = false;
    this.isFinished = true;
    this.announcer({ type: 'SessionFinished', totalSeconds: Math.floor(this.totalMs / 1000) });
  }
}
