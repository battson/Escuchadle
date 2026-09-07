# Conversor de clips — Escuchadle

Herramienta 100% en el navegador (HTML/CSS/JS, sin PHP ni servidor) que genera
un clip corto de cada canción del catálogo, para no depender de llamar a
YouTube en vivo.

El catálogo se carga solo: primero intenta la nube (el mismo documento
Firestore `escuchadle/catalogo` que usa el juego) y, si no hay conexión, cae
al respaldo `js/catalogo.js`.

Cada clip se guarda como **`Artista - Título.webm`**.

## Cómo genera el clip sin bajar nada de YouTube

Bajar el audio directo de YouTube (como hace `yt-dlp`) es imposible desde el
navegador: las URLs del audio vienen firmadas y expiran, y el propio servidor
de Google bloquea el `fetch()` de esas URLs por CORS. En cambio, esta
herramienta:

1. Reproduce la canción con el **reproductor oficial embebido de YouTube**
   (la misma IFrame API que usa el juego), arrancando en el segundo `ini`.
2. Graba el audio de **esta pestaña** con `getDisplayMedia` + `MediaRecorder`
   mientras suena — por eso cada clip tarda exactamente lo que dura (no es
   instantáneo: generar 60 canciones pendientes tarda ~20 minutos reales, a
   20s por canción).
3. Guarda el resultado con la **File System Access API**, directo en la
   carpeta que elijas (o lo descarga si el navegador no la soporta).

## Requisitos

- **Chrome o Edge.** Firefox y Safari no tienen `getDisplayMedia` con audio de
  pestaña ni File System Access API.
- Tocar **"Habilitar captura de audio"** una vez por sesión: el navegador va
  a pedir elegir qué compartir — elegí **"Esta pestaña"** y tildá
  **"Compartir audio de la pestaña"**. Sin ese tilde no hay audio y falla.
- Opcional pero recomendado: tocar **"Elegir carpeta de clips"** y apuntar a
  `conversor/clips/` de tu clon local del repo, así los archivos quedan
  guardados ahí directo. Si no la elegís (o tu navegador no soporta la API),
  cada clip se descarga a tu carpeta de Descargas y hay que moverlo a mano.
- El volumen de la pestaña tiene que estar audible (no muteado) mientras se
  graba: es literalmente lo que se está capturando.

## Uso

1. Abrí `conversor/index.html` desde cualquier servidor estático — funciona
   igual si lo abrís desde el sitio publicado en GitHub Pages, o corriendo
   algo simple en tu PC (`python3 -m http.server`, `npx serve`, etc.). **No
   funciona abierto como archivo suelto** (`file://`): tanto
   `getDisplayMedia` como File System Access API exigen un contexto seguro
   (HTTPS o un servidor local), que `file://` no cumple.
2. Tocá **"1. Elegir carpeta de clips"** y **"2. Habilitar captura de
   audio"**.
3. La tabla muestra cada canción con su estado (Generado / Pendiente / Sin ID
   de YouTube).
   - Botón individual: graba o regraba el clip de esa canción.
   - "Generar todos los pendientes": procesa en secuencia las que faltan
     (una atrás de la otra, en tiempo real).
4. Si elegiste carpeta, los clips quedan ahí como
   `<Artista> - <Título>.webm`. Para que el juego los sirva en producción,
   hay que commitear y pushear esos archivos igual que cualquier otro
   cambio del repo.

## Notas técnicas

- El nombre del clip se sanea con `nombreClip()` en `conversor.js`, sacando
  caracteres inválidos en un sistema de archivos (`/ \ : * ? " < > |`) y
  espacios repetidos.
- El paso 2 pide compartir video **y** audio porque así lo exige la API del
  navegador para compartir una pestaña; la pista de video se descarta al
  toque (`stop()`) y no se usa para nada, solo se graba audio.
- El formato de salida es el nativo de `MediaRecorder` (`webm`/`opus`), sin
  ninguna conversión: es lo que evita depender de una librería o de un
  backend. El `<audio>` de cualquier navegador moderno lo reproduce sin
  problema.
- Los clips generados con la versión anterior de esta herramienta (que usaba
  PHP + yt-dlp + ffmpeg, en `.mp3`) no se reconocen con este esquema nuevo:
  hay que regenerarlos.
- Cambiar la duración del clip: `CLIP_DURATION` al principio de
  `conversor.js`.
