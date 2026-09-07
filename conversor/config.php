<?php
// Configuración de la herramienta de generación de clips.
// Ajustá estos valores según la PC/servidor donde se use.

// Rutas a los binarios. Si están en el PATH del sistema, dejar solo el
// nombre (ej. 'yt-dlp', 'ffmpeg'). Si no, poner la ruta completa.
define('YTDLP_BIN', 'yt-dlp');
define('FFMPEG_BIN', 'ffmpeg');

// yt-dlp necesita a veces un runtime de JavaScript (deno o node) para
// resolver los desafíos que YouTube exige antes de entregar la URL real
// del audio. Dejar en '' si yt-dlp ya lo encuentra solo en el PATH.
define('DENO_BIN', '');

// Duración del clip corto, en segundos.
// Si se cambia, también hay que cambiar CLIP_DURATION en conversor.js.
define('CLIP_DURATION', 20);

// Formato de audio de salida.
// Si se cambia, también hay que cambiar CLIP_FORMAT en conversor.js.
define('CLIP_FORMAT', 'mp3');

// Carpeta donde se guardan los clips generados (debe tener permisos de
// escritura). Los clips se nombran "Artista - Título.mp3".
define('CLIPS_DIR', __DIR__ . '/clips');

if (!is_dir(CLIPS_DIR)) {
    mkdir(CLIPS_DIR, 0775, true);
}
