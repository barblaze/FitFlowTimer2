import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CoachVoice } from '../docs/js/audio/coach.js';

class FakeGain {
  constructor() {
    this.gain = { value: 1 };
    this.disconnected = false;
  }
  connect() {}
  disconnect() { this.disconnected = true; }
}

class FakeSource {
  constructor() {
    this.buffer = null;
    this.onended = null;
    this.disconnected = false;
  }
  connect() {}
  disconnect() { this.disconnected = true; }
  start() { setTimeout(() => this.onended && this.onended(), 0); }
  stop() { if (this.onended) this.onended(); }
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.destination = {};
    this.sources = [];
    this.gains = [];
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      copyToChannel(source, index) { data[index].set(source); },
      getChannelData(index) { return data[index]; },
    };
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createGain() {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  async resume() { this.state = 'running'; }
}

function waitFor(predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error('timeout'));
      }
    }, 10);
  });
}

test('coach: reproduce Ogg decodificado cuando el navegador no lo soporta', async () => {
  const originalDocument = globalThis.document;
  const originalAudioContext = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  let context;

  try {
    globalThis.document = { createElement: () => ({ canPlayType: () => '' }) };
    globalThis.AudioContext = function AudioContext() {
      context = new FakeAudioContext();
      return context;
    };
    globalThis.fetch = async (url) => {
      const data = readFileSync(fileURLToPath(url));
      return {
        ok: true,
        arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      };
    };

    const coach = new CoachVoice();
    coach.playTest('TRAINER');
    await waitFor(() => coach.current === null && coach.queue.length === 0);

    assert.ok(context);
    assert.equal(context.sources.length, 1);
    assert.equal(context.gains.length, 1);
    assert.equal(context.sources[0].buffer.numberOfChannels, 2);
    assert.equal(context.sources[0].buffer.sampleRate, 22050);
    assert.equal(context.sources[0].disconnected, true);
    assert.equal(context.gains[0].disconnected, true);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = originalAudioContext;
    if (originalFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = originalFetch;
  }
});
