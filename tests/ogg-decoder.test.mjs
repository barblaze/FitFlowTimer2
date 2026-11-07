import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

test('stb-vorbis: decodifica un Ogg mono/estereo a PCM Float32', async () => {
  const { StbVorbis } = await import('../docs/js/vendor/stb-vorbis.js');
  await StbVorbis.ready;

  const ogg = readFileSync(join(root, 'docs/assets/coach/entrenador/work_started.ogg'));
  const decoded = StbVorbis.decode(ogg);

  assert.ok(decoded.sampleRate > 0);
  assert.ok(decoded.channels.length >= 1 && decoded.channels.length <= 2);
  assert.ok(decoded.channels[0].length > 0);
  for (const channel of decoded.channels) {
    assert.equal(channel.constructor, Float32Array);
    assert.equal(channel.length, decoded.channels[0].length);
  }
});
