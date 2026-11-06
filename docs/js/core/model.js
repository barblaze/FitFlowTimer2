import { buildSegments } from './planner.js';

export const Mode = Object.freeze({
  TABATA: 'TABATA',
  EMOM: 'EMOM',
  AMRAP: 'AMRAP',
  CUSTOM: 'CUSTOM',
});

export const PhaseType = Object.freeze({
  PREPARATION: 'PREPARATION',
  WORK: 'WORK',
  REST: 'REST',
  REST_BETWEEN_CYCLES: 'REST_BETWEEN_CYCLES',
});

export function segment(type, durationSeconds, cycle, totalCycles, round, totalRounds) {
  return {
    type,
    durationSeconds: Math.max(0, Math.floor(Number(durationSeconds) || 0)),
    cycle, totalCycles, round, totalRounds,
  };
}

export function normalizeConfig(c = {}) {
  const mode = Mode[c.mode] ? c.mode : Mode.TABATA;
  return {
    mode,
    prepSeconds: clampInt(c.prepSeconds, 0, 36000, 10),
    workSeconds: clampInt(c.workSeconds, 0, 86400, 20),
    restSeconds: clampInt(c.restSeconds, 0, 36000, 10),
    rounds: clampInt(c.rounds, 1, 999, 8),
    cycles: clampInt(c.cycles, 1, 999, 1),
    restBetweenCyclesSeconds: clampInt(c.restBetweenCyclesSeconds, 0, 36000, 0),
    announceHalfway: !!c.announceHalfway,
  };
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export function preset(mode) {
  switch (mode) {
    case Mode.TABATA:
      return normalizeConfig({ mode, prepSeconds: 10, workSeconds: 20, restSeconds: 10, rounds: 8, cycles: 1, restBetweenCyclesSeconds: 0, announceHalfway: true });
    case Mode.EMOM:
      return normalizeConfig({ mode, prepSeconds: 10, workSeconds: 60, restSeconds: 0, rounds: 10, cycles: 1, restBetweenCyclesSeconds: 0, announceHalfway: true });
    case Mode.AMRAP:
      return normalizeConfig({ mode, prepSeconds: 10, workSeconds: 300, restSeconds: 0, rounds: 1, cycles: 1, restBetweenCyclesSeconds: 0, announceHalfway: true });
    case Mode.CUSTOM:
    default:
      return normalizeConfig({ mode: Mode.CUSTOM, announceHalfway: true });
  }
}

export function totalSeconds(config) {
  return buildSegments(config).reduce((a, s) => a + s.durationSeconds, 0);
}
