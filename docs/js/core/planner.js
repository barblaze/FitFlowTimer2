export const PhaseType = Object.freeze({
  PREPARATION: 'PREPARATION',
  WORK: 'WORK',
  REST: 'REST',
  REST_BETWEEN_CYCLES: 'REST_BETWEEN_CYCLES',
});

export function buildSegments(config) {
  const cycles = Math.max(1, Math.floor(config.cycles || 1));
  const rounds = Math.max(1, Math.floor(config.rounds || 1));
  const list = [];
  const prep = Math.max(0, Math.floor(config.prepSeconds || 0));
  if (prep > 0) {
    list.push({ type: PhaseType.PREPARATION, durationSeconds: prep, cycle: 0, totalCycles: cycles, round: 0, totalRounds: rounds });
  }
  for (let c = 1; c <= cycles; c++) {
    for (let r = 1; r <= rounds; r++) {
      list.push({ type: PhaseType.WORK, durationSeconds: Math.max(0, Math.floor(config.workSeconds || 0)), cycle: c, totalCycles: cycles, round: r, totalRounds: rounds });
      const rest = Math.max(0, Math.floor(config.restSeconds || 0));
      if (r < rounds && rest > 0) {
        list.push({ type: PhaseType.REST, durationSeconds: rest, cycle: c, totalCycles: cycles, round: r, totalRounds: rounds });
      }
    }
    const restCycles = Math.max(0, Math.floor(config.restBetweenCyclesSeconds || 0));
    if (c < cycles && restCycles > 0) {
      list.push({ type: PhaseType.REST_BETWEEN_CYCLES, durationSeconds: restCycles, cycle: c, totalCycles: cycles, round: rounds, totalRounds: rounds });
    }
  }
  return list;
}
