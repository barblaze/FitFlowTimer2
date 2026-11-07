# FitFlow Timer

Temporizador de intervalos **Tabata / EMOM / AMRAP** para Android. La APK se compila y
firma automaticamente en **GitHub Actions** (workflow `.github/workflows/build-apk.yml`).

## PWA (navegadores)

La misma app esta disponible como PWA en `docs/` y se publica con GitHub Pages:
**https://barblaze.github.io/FitFlowTimer2/**

- Compatible con Chrome, Edge y Samsung Internet en Android, y con Firefox Android.
- Instalable en Chromium Android; Firefox Android permite anadirla a la pantalla de inicio.
- Funciona offline con el shell y los audios del entrenador precargados.
- La voz del entrenador usa Ogg nativo en Chrome/Firefox Android; el estilo Memes usa MP3.
- Verificacion local: `cd docs && python3 -m http.server 4173`.
- iOS/Safari queda fuera de alcance: WebKit no reproduce Ogg nativamente y esta version no incluye decodificador.

## Funcionalidades

- Configurables: tiempo de preparacion, tiempo de trabajo, descanso entre rondas,
  numero de rondas, numero de ciclos y descanso entre ciclos.
- Presets: **Tabata** (10 / 20 / 10 x 8), **EMOM** (10 / 40 / 20 x 10, ronda de 60 s)
  y **AMRAP** (10 / 600 x 1), mas modo "A medida".
- **Pitido de cuenta atras en los ultimos 3 segundos** de la preparacion y de cada
  descanso entre rondas, con tonos diferenciados para inicio de trabajo y fin de sesion.
- **Compatible con la musica**: la app nunca pide foco de audio, por lo que Spotify,
  YouTube o cualquier otra app siguen sonando sin pausarse ni atenuarse.
  Ajuste de salida del pitido: `Media` (se mezcla) o `Sistema` (volumen independiente).
- **Rotacion a horizontal** opcional (ajuste de orientacion y boton en pantalla).
- El temporizador sigue funcionando **con la pantalla apagada** (servicio en primer plano
  + wakelock) y se calcula con `SystemClock.elapsedRealtime()`, por lo que no acumula deriva.
- **Avisos de voz del entrenador**: cada evento reproduce su propio archivo `.ogg`
  desde `app/src/main/assets/coach/<estilo>/`. Si el archivo no existe, el evento
  queda en silencio (nunca se reutiliza otro audio).

## Voces del entrenador

Los audios se guardan en `app/src/main/assets/coach/<estilo>/`, donde `<estilo>` es
`entrenador`, `flaite` o `normal`. Los nombres deben ser exactamente:

| Evento | Archivo |
| --- | --- |
| Inicio de la cuenta regresiva | `session_starting.ogg` |
| Inicio de trabajo | `work_started.ogg` |
| Mitad de ronda | `halftime.ogg` |
| Fin de trabajo | `work_finished.ogg` |
| Inicio de descanso | `rest_started.ogg` |
| Fin de ciclo | `cycle_finished.ogg` |
| Fin de sesion | `session_finished.ogg` (o `session_finish.ogg`) |

Si un archivo falta, ese aviso simplemente no suena. Los avisos que coinciden en el
tiempo se reproducen en orden, sin cortarse entre si.

## Estructura

- `core/` - modulo Kotlin/JVM puro (modelo, `PhasePlanner`, `TimerEngine`, voz) con
  tests JUnit 5. No depende del SDK de Android.
- `app/`  - modulo Android (activities, servicio en primer plano, audio, ajustes).

## Compilacion

```bash
./gradlew :core:test :app:assembleRelease
```

El modulo `:app` solo se incluye si hay SDK de Android disponible (`ANDROID_HOME` o
`local.properties`), de modo que los tests de `core` se pueden ejecutar en local sin
instalar el SDK.

La firma de la release usa los secrets del repositorio:
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` y `KEY_PASSWORD`.
Si no estan presentes, la APK se firma con la clave de depuracion.

## Modo Memes

Cuarto estilo de voz (`memes`). Sus audios van en `app/src/main/assets/coach/memes/` con
los mismos nombres de la tabla anterior (`.ogg` o `.mp3`), un archivo por evento.
No se aplica ganancia extra, asi que conviene que los audios vengan ya a un volumen
razonable (aprox. -14 LUFS).

## Los estilos nunca se mezclan

Cada estilo solo reproduce los archivos de **su propia carpeta**. Si eliges Entrenador y
falta `rest_started.ogg` en `coach/entrenador/`, ese aviso no suena, aunque exista en
`flaite`, `normal` o `memes`.
