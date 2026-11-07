import test from 'node:test';
import assert from 'node:assert/strict';

import { CoachVoice, extensionsForFolder, canPlayOggNative, needsOggDecoder } from '../docs/js/audio/coach.js';

class FakeAudio {
  static instances = [];

  constructor() {
    this.src = '';
    this.muted = false;
    this.volume = 1;
    this.preload = '';
    this.paused = true;
    this.onended = null;
    this.onerror = null;
    this.onabort = null;
    this.onstalled = null;
    this.onplaying = null;
    FakeAudio.instances.push(this);
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  removeAttribute(name) {
    if (name === 'src') this.src = '';
  }

  load() {}
}

globalThis.Audio = FakeAudio;

test('coach: memes usa mp3 primero y los demas estilos usan ogg', () => {
  assert.deepEqual(extensionsForFolder('memes'), ['.mp3', '.ogg']);
  assert.deepEqual(extensionsForFolder('entrenador'), ['.ogg']);
  assert.deepEqual(extensionsForFolder('flaite'), ['.ogg']);
  assert.deepEqual(extensionsForFolder('normal'), ['.ogg']);
});

test('coach: usa stb-vorbis solo cuando Ogg no es nativo', () => {
  try {
    globalThis.document = { createElement: () => ({ canPlayType: () => '' }) };
    assert.equal(canPlayOggNative(), false);
    assert.equal(needsOggDecoder('https://example.test/work_started.ogg'), true);
    assert.equal(needsOggDecoder('https://example.test/work_started.mp3'), false);

    globalThis.document = { createElement: () => ({ canPlayType: () => 'probably' }) };
    assert.equal(canPlayOggNative(), true);
    assert.equal(needsOggDecoder('https://example.test/work_started.ogg'), false);
  } finally {
    delete globalThis.document;
  }
});

test('coach: iOS usa el decoder aunque canPlayType sea ambiguo', () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 },
      configurable: true,
      enumerable: true,
    });
    globalThis.document = { createElement: () => ({ canPlayType: () => 'maybe' }) };
    assert.equal(needsOggDecoder('https://example.test/work_started.ogg'), true);
  } finally {
    delete globalThis.document;
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
  }
});

test('coach: unlock usa un Ogg real muteado', async () => {
  FakeAudio.instances.length = 0;
  const coach = new CoachVoice();
  await coach.unlock();
  const audio = FakeAudio.instances.at(-1);
  assert.ok(audio);
  assert.match(audio.src, /\/entrenador\/work_started\.ogg$/);
  assert.equal(audio.muted, true);
  assert.equal(audio.paused, false);
});

test('coach: setVolume actualiza el audio actual y silencia en 0', () => {
  const coach = new CoachVoice();
  const audio = new FakeAudio();
  coach.current = { urlAudio: audio };

  coach.setVolume(0.25);
  assert.equal(audio.volume, 0.25);
  assert.equal(audio.muted, false);

  coach.setVolume(0);
  assert.equal(audio.volume, 0);
  assert.equal(audio.muted, true);
});

test('coach: playTest detiene la voz anterior y usa la extension del estilo', () => {
  FakeAudio.instances.length = 0;
  const coach = new CoachVoice();
  const previous = new FakeAudio();
  coach.current = { urlAudio: previous };

  coach.playTest('MEMES');
  const audio = FakeAudio.instances.at(-1);

  assert.equal(previous.paused, true);
  assert.ok(audio);
  assert.match(audio.src, /\/memes\/work_started\.mp3$/);
  coach.stopAll();
});
