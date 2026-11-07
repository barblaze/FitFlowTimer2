import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSegments, PhaseType } from '../docs/js/core/planner.js';
import { TimerEngine } from '../docs/js/core/engine.js';
import { preset, totalSeconds } from '../docs/js/core/model.js';
import { loadConfig, loadSettings, saveConfig } from '../docs/js/store.js';

function makeEngine(config) {
  const clock = { now: 0 };
  const announcements = [];
  const engine = new TimerEngine(config, () => clock.now, (event) => announcements.push(event));
  return { clock, engine, announcements };
}

function countdowns(events) {
  return events.filter((event) => event.type === 'Countdown').map((event) => event.secondsLeft);
}

function advance(clock, engine, deltaMs) {
  clock.now += deltaMs;
  return engine.tick();
}

test('planner: tabata builds preparation, eight works and seven rests', () => {
  const config = preset('TABATA');
  const segments = buildSegments(config);
  assert.equal(segments.length, 16);
  assert.equal(segments[0].type, PhaseType.PREPARATION);
  assert.equal(segments[1].type, PhaseType.WORK);
  assert.equal(segments[2].type, PhaseType.REST);
  assert.equal(segments.at(-1).type, PhaseType.WORK);
  assert.equal(totalSeconds(config), 240);
});

test('countdown: last three seconds of preparation', () => {
  const { clock, engine } = makeEngine(preset('TABATA'));
  engine.start();
  assert.deepEqual(countdowns(engine.tick()), []);
  assert.deepEqual(countdowns(advance(clock, engine, 6000)), []);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [3]);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [2]);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [1]);
});

test('countdown: last three seconds of work', () => {
  const { clock, engine } = makeEngine({ ...preset('CUSTOM'), prepSeconds: 0, workSeconds: 20, restSeconds: 10, rounds: 1, cycles: 1 });
  engine.start();
  assert.deepEqual(countdowns(advance(clock, engine, 16000)), []);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [3]);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [2]);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [1]);
});

test('countdown: last three seconds of rest before the next round', () => {
  const { clock, engine } = makeEngine({ ...preset('CUSTOM'), prepSeconds: 0, workSeconds: 10, restSeconds: 10, rounds: 2, cycles: 1 });
  engine.start();
  assert.deepEqual(countdowns(advance(clock, engine, 10000)), []);
  assert.deepEqual(countdowns(advance(clock, engine, 6000)), []);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [3]);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [2]);
  assert.deepEqual(countdowns(advance(clock, engine, 1000)), [1]);
});

test('pause freezes the countdown and resume continues it', () => {
  const { clock, engine } = makeEngine(preset('TABATA'));
  engine.start();
  advance(clock, engine, 3000);
  engine.pause();
  assert.equal(engine.isRunning, false);
  clock.now += 10000;
  assert.equal(engine.remainingMs(), 7000);
  engine.resume();
  clock.now += 1000;
  assert.equal(engine.remainingMs(), 6000);
});

test('halfway fires once per work round', () => {
  const { clock, engine } = makeEngine({ ...preset('CUSTOM'), prepSeconds: 0, workSeconds: 40, restSeconds: 20, rounds: 2, cycles: 1 });
  engine.start();
  assert.equal(advance(clock, engine, 19000).some((event) => event.type === 'HalfTime'), false);
  assert.equal(advance(clock, engine, 1000).some((event) => event.type === 'HalfTime'), true);
  assert.equal(advance(clock, engine, 0).some((event) => event.type === 'HalfTime'), false);
  advance(clock, engine, 20000);
  advance(clock, engine, 20000);
  assert.equal(advance(clock, engine, 20000).some((event) => event.type === 'HalfTime'), true);
});

test('work is followed by rest and then the session finishes', () => {
  const { clock, engine } = makeEngine({ ...preset('CUSTOM'), prepSeconds: 0, workSeconds: 20, restSeconds: 10, rounds: 1, cycles: 1 });
  engine.start();
  const events = advance(clock, engine, 20000);
  assert.equal(events.some((event) => event.type === 'Finished'), true);
  assert.equal(engine.isFinished, true);
});

test('preparation does not announce a cycle finished for cycle 0', () => {
  const { clock, engine, announcements } = makeEngine({ ...preset('CUSTOM'), prepSeconds: 10, workSeconds: 10, restSeconds: 5, rounds: 2, cycles: 3, restBetweenCyclesSeconds: 30 });
  engine.start();
  for (let elapsed = 0; elapsed <= totalSeconds({ ...preset('CUSTOM'), prepSeconds: 10, workSeconds: 10, restSeconds: 5, rounds: 2, cycles: 3, restBetweenCyclesSeconds: 30 }) * 1000 + 1000; elapsed += 100) {
    advance(clock, engine, 100);
  }
  const cycles = announcements.filter((event) => event.type === 'CycleFinished').map((event) => event.cycle);
  assert.deepEqual(cycles, [1, 2]);
});

test('skipping preparation does not announce cycle 0', () => {
  const { engine, announcements } = makeEngine(preset('TABATA'));
  engine.start();
  engine.skip();
  assert.equal(announcements.some((event) => event.type === 'CycleFinished'), false);
  assert.equal(engine.currentSegment.type, PhaseType.WORK);
});

test('store migrates legacy config and settings keys', () => {
  const memory = new Map([
    ['config', JSON.stringify({ mode: 'EMOM', prepSeconds: 5 })],
    ['settings', JSON.stringify({ volume: 0.25, coachStyle: 'FLAITE' })],
  ]);
  globalThis.localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };

  const config = loadConfig();
  assert.equal(config.mode, 'EMOM');
  assert.equal(config.prepSeconds, 5);
  assert.equal(memory.has('fitflow.config'), true);
  assert.equal(memory.has('fitflow.profile_EMOM'), true);

  const settings = loadSettings();
  assert.equal(settings.volume, 0.25);
  assert.equal(settings.coachStyle, 'FLAITE');
  assert.equal(memory.has('fitflow.settings'), true);

  saveConfig({ ...config, rounds: 4 });
  assert.equal(memory.has('fitflow.profile_EMOM'), true);
});
