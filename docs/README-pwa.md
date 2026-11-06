# FitFlow Timer PWA (Mozilla/Firefox)

PWA estática servible desde `docs/` (GitHub Pages).

## Activar GitHub Pages
1. Repo → **Settings → Pages**
2. **Source**: Deploy from a branch
3. Branch: `main`, folder: `/docs`
4. Guardar. URL esperada: `https://barblaze.github.io/FitFlowTimer2/`

## Uso en Mozilla/Firefox
- Abrir la URL, permitir audio al iniciar (gesto del botón “Empezar”).
- Donde el navegador lo soporte, se puede instalar como app (manifest + service worker).
- La voz del entrenador usa los `.ogg` de `assets/coach/` (compatibles con Firefox). Si falta un clip para un evento/estilo, ese evento queda en silencio (sin mezclar estilos).

## Limitaciones web
- En segundo plano/pantalla bloqueada el navegador puede suspender timers y audio. Al volver, el tiempo se recalcula por marcas de tiempo (sin reproducir ráfagas de avisos perdidos).
- Vibración solo si `navigator.vibrate` está disponible (funciona en Firefox Android; depende del dispositivo/gesto).
- “Mantener pantalla encendida” usa Screen Wake Lock API cuando está disponible (contexto seguro).

## Verificación local
```bash
cd docs
python3 -m http.server 4173
# abrir http://127.0.0.1:4173/
```
