import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const docs = join(root, 'docs');
const swPath = join(docs, 'sw.js');
const sw = readFileSync(swPath, 'utf8');

function shellEntries() {
  const match = sw.match(/const SHELL = \[(.*?)\];/s);
  assert.ok(match, 'SHELL no encontrado en sw.js');
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

function pngSize(file) {
  const buffer = readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('sw: cache v7 y todos los assets del SHELL existen', () => {
  assert.match(sw, /const CACHE = 'fitflow-pwa-v7';/);
  const entries = shellEntries();
  assert.ok(entries.includes('./assets/coach/memes/work_started.mp3'));
  assert.ok(entries.includes('./assets/coach/memes/session_finished.ogg'));
  assert.ok(entries.includes('./js/vendor/stb-vorbis.js'));

  for (const entry of entries) {
    const file = entry === './' ? join(docs, 'index.html') : join(docs, entry.replace(/^\.\//, ''));
    assert.ok(existsSync(file), `Falta ${entry}`);
  }
});

test('sw: todos los audios del entrenador estan precargados', () => {
  const entries = new Set(shellEntries());
  const audioFiles = filesUnder(join(docs, 'assets', 'coach'))
    .map((file) => './' + relative(docs, file).split('\\').join('/'))
    .filter((file) => /\.(ogg|mp3)$/i.test(file));

  assert.equal(audioFiles.filter((file) => file.endsWith('.ogg')).length, 12);
  for (const file of audioFiles) {
    assert.ok(entries.has(file), `Audio sin precachear: ${file}`);
  }
});

test('manifest: campos requeridos, iconos existentes y tamanos correctos', () => {
  const manifest = JSON.parse(readFileSync(join(docs, 'manifest.webmanifest'), 'utf8'));

  assert.equal(manifest.name, 'FitFlow Timer');
  assert.equal(manifest.short_name, 'FitFlow');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));

  for (const icon of manifest.icons) {
    const file = join(docs, icon.src);
    assert.ok(existsSync(file), `Falta icono ${icon.src}`);
    const { width, height } = pngSize(file);
    assert.equal(`${width}x${height}`, icon.sizes);
  }
});

test('index: viewport, manifest, theme-color y fila de wake lock', () => {
  const html = readFileSync(join(docs, 'index.html'), 'utf8');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /id="rowWakeWrap"/);
});

test('coach: sin data URI de audio ni fallback m4a', () => {
  const coach = readFileSync(join(docs, 'js', 'audio', 'coach.js'), 'utf8');
  assert.ok(!coach.includes('data:audio'));
  assert.ok(!coach.includes('.m4a'));
});
