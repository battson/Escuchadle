<?php
declare(strict_types=1);

require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function responder(bool $ok, array $extra = []): void
{
    echo json_encode(array_merge(['ok' => $ok], $extra), JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Arma el nombre de archivo "Artista - Título" a partir de los datos del
 * catálogo, sacando caracteres inválidos en un sistema de archivos y
 * espacios repetidos. Debe dar el mismo resultado que nombreClip() en
 * conversor.js, para que el cliente sepa qué archivo buscar.
 */
function nombre_clip(string $artista, string $titulo): string
{
    $base = trim($artista) . ' - ' . trim($titulo);
    $base = preg_replace('/[\/\\\\:*?"<>|\x00-\x1F]/', '', $base) ?? '';
    $base = preg_replace('/\s+/', ' ', $base) ?? '';
    return trim($base);
}

$yt      = $_GET['yt'] ?? '';
$ini     = $_GET['ini'] ?? '0';
$artista = (string) ($_GET['artista'] ?? '');
$titulo  = (string) ($_GET['titulo'] ?? '');

// El ID de YouTube es siempre 11 caracteres alfanuméricos (+ - y _).
// Validar estricto evita cualquier inyección de comandos.
if (!preg_match('/^[A-Za-z0-9_-]{6,20}$/', $yt)) {
    responder(false, ['error' => 'ID de YouTube inválido.']);
}

// nombre_clip() siempre pega " - " entre los dos campos, así que un
// $nombreBase vacío no alcanza para detectar que falta alguno: hay que
// validar cada campo por separado antes de armar el nombre.
if (trim($artista) === '' || trim($titulo) === '') {
    responder(false, ['error' => 'Falta artista o título para nombrar el clip.']);
}

$nombreBase = nombre_clip($artista, $titulo);
if ($nombreBase === '') {
    responder(false, ['error' => 'Falta artista o título para nombrar el clip.']);
}
// Evita nombres kilométricos en sistemas de archivos con límites (255 bytes
// típico), dejando margen para la extensión.
if (strlen($nombreBase) > 150) {
    $nombreBase = rtrim(substr($nombreBase, 0, 150));
}

if (!is_numeric($ini) || (float) $ini < 0) {
    $ini = 0;
}
$ini = (int) $ini;
$fin = $ini + CLIP_DURATION;

$archivo = $nombreBase . '.' . CLIP_FORMAT;
$destino = CLIPS_DIR . '/' . $archivo;
$tmpPrefix = CLIPS_DIR . '/.tmp_' . $yt;

// Limpieza de intentos previos fallidos.
foreach (glob($tmpPrefix . '*') as $f) {
    @unlink($f);
}

$url = 'https://www.youtube.com/watch?v=' . $yt;

// yt-dlp descarga solo el tramo [ini, fin) del audio (--download-sections)
// y lo convierte directo a mp3, sin bajar la canción entera.
//
// Se arma el comando como array y se ejecuta con proc_open() en vez de
// exec()/shell_exec(): en Windows, exec() pasa el comando por cmd.exe, y
// escapeshellarg() ahí reemplaza cualquier "%" por un espacio (para evitar
// expansión de variables de entorno) — eso rompe la plantilla "%(ext)s" que
// yt-dlp necesita para su propia salida. proc_open() con array invoca el
// binario directo, sin pasar por el shell, así que no hay ese problema.
$args = [YTDLP_BIN, '-f', 'bestaudio', '-x', '--audio-format', CLIP_FORMAT];
$args[] = '--ffmpeg-location';
$args[] = dirname(FFMPEG_BIN);
if (defined('DENO_BIN') && DENO_BIN !== '') {
    $args[] = '--js-runtimes';
    $args[] = 'deno:' . DENO_BIN;
}
$args[] = '--force-keyframes-at-cuts';
$args[] = '--download-sections';
$args[] = sprintf('*%d-%d', $ini, $fin);
$args[] = '-o';
$args[] = $tmpPrefix . '.%(ext)s';
$args[] = '--';
$args[] = $url;

$descriptores = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
$proceso = proc_open($args, $descriptores, $pipes);

if (!is_resource($proceso)) {
    responder(false, ['error' => 'No se pudo iniciar yt-dlp.']);
}

$salidaTexto = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
$codigo = proc_close($proceso);

// yt-dlp deja el archivo como .tmp_ID.mp3 (ya con el postproceso aplicado).
$generado = $tmpPrefix . '.' . CLIP_FORMAT;

if ($codigo !== 0 || !file_exists($generado)) {
    $lineas = preg_split('/\r\n|\r|\n/', trim($salidaTexto));
    responder(false, [
        'error' => 'Falló yt-dlp/ffmpeg al generar el clip.',
        'detalle' => implode("\n", array_slice($lineas, -15)),
    ]);
}

if (!rename($generado, $destino)) {
    responder(false, ['error' => 'No se pudo mover el clip a la carpeta final.']);
}

responder(true, [
    'yt' => $yt,
    'archivo' => $archivo,
    'ini' => $ini,
    'duracion' => CLIP_DURATION,
]);
