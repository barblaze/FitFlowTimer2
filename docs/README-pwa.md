# FitFlow Timer PWA (navegadores)

PWA estatica servible desde `docs/` (GitHub Pages).

## Activar GitHub Pages
1. Repo → **Settings → Pages**
2. **Source**: Deploy from a branch
3. Branch: `main`, folder: `/docs`
4. Guardar. URL: `https://barblaze.github.io/FitFlowTimer2/`

## Instalacion y actualizaciones
- Chrome, Edge y Samsung Internet en Android instalan la PWA con el manifest y el
  service worker. Firefox Android permite “Anadir a pantalla de inicio” y usar la app
  offline, aunque no muestra el banner de instalacion de Chromium.
- El service worker usa red primero para la navegacion y `stale-while-revalidate`
  para JS/CSS, de modo que los cambios llegan en la siguiente carga.
- La cache `fitflow-pwa-v7` precarga el shell, los iconos, los audios del entrenador y
  el decodificador `stb-vorbis`, asi que la app arranca offline y la voz tambien
  funciona sin red, incluido iOS.
- El registro usa `updateViaCache: 'none'` para detectar antes las actualizaciones del
  service worker.

## Uso en navegadores
- Objetivo soportado: **Chrome/Edge/Samsung Android, Firefox Android e iOS/Safari**.
- Abrir la URL y pulsar “Empezar entrenamiento” para desbloquear el audio.
- La voz del entrenador usa los `.ogg` de `assets/coach/`, que Chrome y Firefox
  reproducen de forma nativa en Android. En iOS/Safari se decodifican con
  `stb-vorbis` (WASM) y se reproducen por Web Audio. El estilo Memes usa su
  `work_started.mp3` y `session_finished.ogg`.
- Si falta un clip para un evento/estilo, ese evento queda en silencio (sin mezclar
  estilos).

## Limitaciones web
- En segundo plano/pantalla bloqueada el navegador puede suspender timers y audio. Al
  volver, el tiempo se recalcula por marcas de tiempo (sin reproducir rafagas de avisos).
- En iOS/Safari la primera reproduccion de cada clip Ogg decodifica WASM y puede tardar
  unos cientos de milisegundos; despues queda en cache en memoria. El decodificador y
  los audios se precargan para uso offline.
- Vibracion solo si `navigator.vibrate` esta disponible; en caso contrario la opcion
  se oculta.
- “Mantener pantalla encendida” usa Screen Wake Lock API cuando esta disponible
  (contexto seguro). Si el navegador no la soporta, la opcion se oculta.

## Checklist manual (Android e iOS)
- Chrome: instalar, abrir offline, probar voz Ogg, pitidos, volumen y silencio.
- Firefox: “Anadir a pantalla de inicio”, abrir offline y probar la voz Ogg.
- iOS/Safari: probar voz Ogg tras la primera carga, comprobar que el decodificador
  quedo cacheado y repetir la prueba offline.
- Bloquear la pantalla o cambiar de app durante un entrenamiento y volver: el tiempo
  debe corregirse sin reproducir avisos atrasados.
- Probar estilo Memes (MP3/Ogg) y Entrenador/Flaite/Normal (Ogg).
- Rotar el dispositivo y comprobar que el anillo y los controles siguen visibles.

## Verificacion local
```bash
cd docs
python3 -m http.server 4173
# abrir http://127.0.0.1:4173/
```

## Tests
```bash
npm run test:pwa
```

## Creditos

Decoder Ogg para iOS: [`stb-vorbis`](https://github.com/spessasus/stb-vorbis)
v0.0.7, Apache-2.0. Licencia en `js/vendor/stb-vorbis.LICENSE`.
