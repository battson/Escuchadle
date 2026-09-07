# Conversor de clips — Escuchadle

Herramienta local que genera un clip corto (20s, mp3) de cada canción del
catálogo, cortando desde el segundo `ini` (silencio inicial a saltar), con
`yt-dlp` + `ffmpeg` contra el ID de YouTube de cada canción.

El catálogo se carga solo: primero intenta la nube (el mismo documento
Firestore `escuchadle/catalogo` que usa el juego) y, si no hay conexión, cae
al respaldo `js/catalogo.js`. Ya no hace falta pegarlo ni subirlo a mano.

Cada clip se guarda como **`Artista - Título.mp3`** (antes se guardaba por
ID de YouTube).

## Por qué esto no vive en GitHub Pages

Escuchadle es un sitio estático (se sube tal cual a GitHub Pages), que **no
ejecuta PHP** y no puede correr binarios como `yt-dlp` o `ffmpeg`. Este
conversor necesita siempre un servidor con PHP real corriendo por detrás —
tu PC, o cualquier hosting con PHP habilitado — nunca la URL pública del
juego.

## Requisitos

- PHP 8+ con `proc_open()` habilitado (no debe estar en `disable_functions`).
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) — usar una versión reciente
  (2026.08+); versiones viejas devuelven error 403 de YouTube.
- `ffmpeg` instalado y accesible (yt-dlp lo usa para cortar y convertir a
  mp3).
- Opcional: un runtime de JavaScript para yt-dlp (`deno` o `node`). Sin
  esto, YouTube puede devolver 403 en algunos videos porque yt-dlp no logra
  resolver el desafío JS que exige antes de entregar la URL del audio.
- Permisos de escritura en `conversor/clips/`.

Las rutas de los binarios se configuran en `config.php` (`YTDLP_BIN`,
`FFMPEG_BIN`, `DENO_BIN`). Si están en el PATH del sistema, alcanza con el
nombre (`'yt-dlp'`, `'ffmpeg'`); si no, poné la ruta completa.

## Uso

1. Levantar un servidor PHP **desde la raíz del repositorio** (no desde esta
   carpeta, porque el conversor carga `../js/nube-config.js` y
   `../js/catalogo.js`):
   ```bash
   php -S localhost:8899
   ```
2. Abrir `http://localhost:8899/conversor/`.
3. La tabla muestra cada canción del catálogo con su estado
   (Generado / Pendiente / Sin ID de YouTube).
   - Botón individual: genera o regenera el clip de esa canción.
   - "Generar todos los pendientes": procesa en secuencia las que faltan.
4. Los clips quedan en `conversor/clips/<Artista> - <Título>.mp3`.

## Notas técnicas

- El corte usa `yt-dlp --download-sections "*ini-fin"`, que solo descarga
  el tramo necesario del video (no baja la canción completa).
- `generate.php` arma el comando de yt-dlp como array y lo ejecuta con
  `proc_open()`, no con `exec()`. En Windows, `exec()` pasa el comando por
  `cmd.exe`, y `escapeshellarg()` ahí reemplaza cualquier `%` por un
  espacio (para evitar expansión de variables de entorno) — eso rompe la
  plantilla `%(ext)s` que yt-dlp necesita para nombrar su propia salida.
  `proc_open()` con el comando como array invoca el binario directo, sin
  pasar por ningún shell.
- El nombre del clip se arma en `generate.php` (función `nombre_clip`) y en
  `conversor.js` (función `nombreClip`): ambas tienen que sanear el string
  exactamente igual, porque el cliente arma la URL del audio con ese mismo
  nombre sin volver a preguntarle al servidor.
- Los clips generados con la versión anterior de esta herramienta (nombrados
  por ID de YouTube) no se reconocen con este esquema nuevo: hay que
  regenerarlos.
- Cambiar la duración del clip o el formato de salida: `CLIP_DURATION` /
  `CLIP_FORMAT` en `config.php` **y** las mismas constantes al principio de
  `conversor.js` (tienen que coincidir).

## Si el servidor final es Linux

- Instalar `yt-dlp` y `ffmpeg` vía el gestor de paquetes o pip
  (`pip install -U yt-dlp`) y dejar `YTDLP_BIN`/`FFMPEG_BIN` en
  `config.php` apuntando a esas rutas (o solo el nombre si quedan en el
  PATH).
- Node.js suele estar disponible en hosting Linux y sirve como runtime JS
  alternativo a deno: `--js-runtimes node:/ruta/a/node` (yt-dlp soporta
  varios runtimes). Ajustar `DENO_BIN` en `config.php` o dejarlo vacío
  (`''`) si yt-dlp ya encuentra uno solo.
