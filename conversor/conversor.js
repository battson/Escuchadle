/* =========================================================
   Conversor de clips — Escuchadle Argento.

   100% en el navegador, sin servidor: no hay PHP ni yt-dlp/ffmpeg.
   No se descarga nada de YouTube (bajar el audio directo del CDN de
   Google es imposible desde el navegador: las URLs vienen firmadas y
   el propio servidor bloquea el fetch por CORS). En cambio:

     1. Se reproduce la canción con el reproductor OFICIAL embebido de
        YouTube (la misma IFrame API que usa el juego), arrancando en
        el segundo `ini`.
     2. Se graba el audio de ESTA PESTAÑA con getDisplayMedia +
        MediaRecorder mientras suena (por eso tarda lo mismo que dura
        el clip: no hay forma de acelerarlo).
     3. El resultado (.webm/opus) se guarda con la File System Access
        API directo en la carpeta que elijas, o se descarga si el
        navegador no la soporta.

   Solo anda en Chrome/Edge: Firefox y Safari no tienen ni
   getDisplayMedia con audio de pestaña ni File System Access API.

   El catálogo se carga solo, igual que el juego: primero intenta la
   nube (Firestore, mismo documento escuchadle/catalogo) y si no hay
   conexión cae al respaldo js/catalogo.js.

   Los clips se guardan como "Artista - Título.webm".
   ========================================================= */

const CLIP_DURATION = 20; // segundos grabados por clip
const CLIP_FORMAT = 'webm';

const tabla = document.querySelector('#tabla tbody');
const resumen = document.getElementById('resumen');
const estadoCatalogo = document.getElementById('estadoCatalogo');
const btnLote = document.getElementById('btnLote');
const progreso = document.getElementById('progreso');
const btnCarpeta = document.getElementById('btnCarpeta');
const estadoCarpeta = document.getElementById('estadoCarpeta');
const btnCaptura = document.getElementById('btnCaptura');
const estadoCaptura = document.getElementById('estadoCaptura');
document.getElementById('notaDuracion').textContent = CLIP_DURATION;

let player = null;
let onEstadoCambio = null;
let audioStream = null;
let dirHandle = null;

const CARACTERES_INVALIDOS = new RegExp('[' + ['/', '\\\\', ':', '\\*', '\\?', '"', '<', '>', '\\|'].join('') + ']', 'g');

function nombreClip(artista, titulo) {
  const base = (artista || '') + ' - ' + (titulo || '');
  return base.replace(CARACTERES_INVALIDOS, '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------- reproductor de YouTube ---------- */

function cargarYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve();
    const previo = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (previo) previo(); resolve(); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => reject(new Error('No se pudo cargar la API de YouTube.'));
    document.head.appendChild(tag);
  });
}

function crearPlayer() {
  return new Promise((resolve, reject) => {
    try {
      player = new YT.Player('ytplayer', {
        width: 220,
        height: 124,
        playerVars: { autoplay: 0, controls: 1, disablekb: 1, modestbranding: 1, rel: 0 },
        events: {
          onReady: () => resolve(),
          onError: e => console.warn('YouTube player error', e.data),
          onStateChange: e => { if (onEstadoCambio) onEstadoCambio(e); }
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

/* ---------- paso 1: carpeta de destino ---------- */

async function elegirCarpeta() {
  if (!window.showDirectoryPicker) return { ok: false, motivo: 'no-soportado' };
  try {
    dirHandle = await window.showDirectoryPicker({ id: 'escuchadle-clips' });
    return { ok: true };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, motivo: 'cancelado' };
    throw e;
  }
}

btnCarpeta.addEventListener('click', async () => {
  try {
    const r = await elegirCarpeta();
    if (r.ok) {
      estadoCarpeta.textContent = 'Carpeta lista: los clips se guardan ahí directo.';
      estadoCarpeta.className = 'estado-paso ok';
    } else if (r.motivo === 'no-soportado') {
      estadoCarpeta.textContent = 'Tu navegador no soporta esto: los clips se van a descargar a tu carpeta de Descargas.';
      estadoCarpeta.className = 'estado-paso aviso';
    } else {
      estadoCarpeta.textContent = 'Cancelado: los clips se van a descargar a tu carpeta de Descargas si generás igual.';
      estadoCarpeta.className = 'estado-paso aviso';
    }
  } catch (e) {
    estadoCarpeta.textContent = 'Error: ' + e.message;
    estadoCarpeta.className = 'estado-paso err';
  }
});

async function guardarBlob(nombreArchivo, blob) {
  if (dirHandle) {
    const fileHandle = await dirHandle.getFileHandle(nombreArchivo, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return 'carpeta';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'descarga';
}

/* ---------- paso 2: captura de audio de la pestaña ---------- */

async function habilitarCaptura() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('Tu navegador no soporta capturar audio de pestaña (usá Chrome o Edge).');
  }
  const captura = await navigator.mediaDevices.getDisplayMedia({
    video: true, audio: true, preferCurrentTab: true, selfBrowserSurface: 'include'
  });
  const pistaAudio = captura.getAudioTracks()[0];
  if (!pistaAudio) {
    captura.getTracks().forEach(t => t.stop());
    throw new Error('Compartiste sin audio: repetí y tildá "Compartir audio de la pestaña".');
  }
  captura.getVideoTracks().forEach(t => t.stop());
  pistaAudio.addEventListener('ended', () => {
    audioStream = null;
    estadoCaptura.textContent = 'Se cortó la captura: volvé a habilitarla.';
    estadoCaptura.className = 'estado-paso err';
  });
  audioStream = new MediaStream([pistaAudio]);
}

btnCaptura.addEventListener('click', async () => {
  try {
    await habilitarCaptura();
    estadoCaptura.textContent = 'Captura de audio lista.';
    estadoCaptura.className = 'estado-paso ok';
  } catch (e) {
    estadoCaptura.textContent = 'Error: ' + e.message;
    estadoCaptura.className = 'estado-paso err';
  }
});

function elegirMimeType() {
  const candidatos = ['audio/webm;codecs=opus', 'audio/webm'];
  return candidatos.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

/* ---------- grabar un clip ---------- */

async function grabarClip(yt, ini) {
  if (!audioStream) throw new Error('Primero tenés que habilitar la captura de audio (paso 2).');
  if (!player) throw new Error('El reproductor de YouTube todavía no está listo.');

  await new Promise((resolve, reject) => {
    let listo = false;
    const limite = setTimeout(() => {
      if (!listo) { onEstadoCambio = null; reject(new Error('YouTube no empezó a reproducir a tiempo.')); }
    }, 8000);
    onEstadoCambio = e => {
      if (e.data === YT.PlayerState.PLAYING && !listo) {
        listo = true;
        clearTimeout(limite);
        onEstadoCambio = null;
        resolve();
      }
    };
    player.loadVideoById({ videoId: yt, startSeconds: ini });
  });

  // Margen chico para que el audio ya esté sonando de lleno al arrancar a grabar.
  await esperar(300);

  const mimeType = elegirMimeType();
  const recorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const detenido = new Promise(resolve => { recorder.onstop = resolve; });

  recorder.start();
  await esperar(CLIP_DURATION * 1000);
  recorder.stop();
  await detenido;

  try { player.pauseVideo(); } catch { /* no importa si ya no había video cargado */ }

  return new Blob(chunks, { type: 'audio/webm' });
}

/* ---------- catálogo ---------- */

async function cargarCatalogoNube() {
  const cfg = window.NUBE_CONFIG;
  const rutas = Object.assign({ coleccionConfig: 'escuchadle', documentoCatalogo: 'catalogo' }, window.NUBE_RUTAS || {});
  if (!cfg || !cfg.projectId) throw new Error('Falta ../js/nube-config.js');

  // import() dinámico (no estático arriba del archivo): si el CDN de
  // Firebase no responde (sin señal, firewall), esto tiene que rechazar
  // acá adentro y caer al respaldo, no romper la carga de todo el módulo.
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js');
  const { getFirestore, initializeFirestore, persistentLocalCache, persistentSingleTabManager, doc, getDoc } =
    await import('https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js');

  const app = initializeApp(cfg);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) });
  } catch {
    db = getFirestore(app);
  }

  const snap = await getDoc(doc(db, rutas.coleccionConfig, rutas.documentoCatalogo));
  if (!snap.exists()) throw new Error('El catálogo todavía no está publicado en la nube.');
  const lista = Array.isArray(snap.data().canciones) ? snap.data().canciones : [];
  if (!lista.length) throw new Error('El catálogo de la nube está vacío.');
  return lista;
}

async function cargarCatalogoRespaldo() {
  const resp = await fetch('../js/catalogo.js');
  if (!resp.ok) throw new Error('No se pudo leer ../js/catalogo.js');
  const texto = await resp.text();
  // catalogo.js declara "const CANCIONES = [...]" como script clásico:
  // envolverlo en una función y devolver esa variable es la forma más
  // simple de reusarlo tal cual, sin tocar el archivo original.
  const lista = new Function(texto + '\nreturn CANCIONES;')();
  if (!Array.isArray(lista) || !lista.length) throw new Error('../js/catalogo.js no tiene canciones.');
  return lista;
}

async function cargarCatalogo() {
  try {
    const lista = await cargarCatalogoNube();
    estadoCatalogo.textContent = `Catálogo cargado desde la nube (${lista.length} canciones).`;
    return lista;
  } catch (e) {
    console.warn('No se pudo cargar el catálogo de la nube:', e);
    try {
      const lista = await cargarCatalogoRespaldo();
      estadoCatalogo.textContent = `Nube no disponible: usando el respaldo js/catalogo.js (${lista.length} canciones).`;
      estadoCatalogo.className = 'estado-catalogo aviso';
      return lista;
    } catch (e2) {
      estadoCatalogo.textContent = `No se pudo cargar ningún catálogo: ${e2.message}`;
      estadoCatalogo.className = 'estado-catalogo err';
      return [];
    }
  }
}

/* ---------- tabla ---------- */

async function existeClip(nombre) {
  try {
    const resp = await fetch(`clips/${encodeURIComponent(nombre)}.${CLIP_FORMAT}`, { method: 'HEAD', cache: 'no-store' });
    return resp.ok;
  } catch {
    return false;
  }
}

function audioHTML(nombre, cacheBust) {
  const src = `clips/${encodeURIComponent(nombre)}.${CLIP_FORMAT}${cacheBust ? `?t=${Date.now()}` : ''}`;
  return `<audio controls preload="none" src="${src}"></audio>`;
}

function filaHTML(c, nombre, generado) {
  const tr = document.createElement('tr');
  const sinYt = !c.yt;
  tr.dataset.yt = c.yt || '';
  tr.dataset.ini = c.ini || 0;
  tr.dataset.artista = c.a || '';
  tr.dataset.titulo = c.t || '';
  tr.dataset.nombre = nombre;

  const estadoTexto = sinYt ? 'Sin ID de YouTube' : (generado ? 'Generado' : 'Pendiente');
  const estadoClase = sinYt ? 'err' : (generado ? 'ok' : 'pend');

  tr.innerHTML = `
    <td>${escapeHtml(c.a || '')}</td>
    <td>${escapeHtml(c.t || '')}</td>
    <td>${escapeHtml(c.g || '')}</td>
    <td>${c.ini || 0}s</td>
    <td class="estado ${estadoClase}">${estadoTexto}</td>
    <td class="celda-audio">${generado ? audioHTML(nombre, false) : ''}</td>
    <td>${sinYt ? '' : `<button class="gen" type="button">${generado ? 'Regenerar' : 'Generar'}</button>`}</td>
  `;
  return tr;
}

async function generarClip(fila) {
  const { yt, ini, nombre } = fila.dataset;
  const estado = fila.querySelector('.estado');
  const celdaAudio = fila.querySelector('.celda-audio');
  const boton = fila.querySelector('button.gen');

  estado.textContent = `Grabando ${CLIP_DURATION}s…`;
  estado.className = 'estado pend';
  boton.disabled = true;

  try {
    const blob = await grabarClip(yt, Number(ini) || 0);
    const archivo = `${nombre}.${CLIP_FORMAT}`;
    const destino = await guardarBlob(archivo, blob);

    estado.textContent = 'Generado';
    estado.className = 'estado ok';
    if (destino === 'carpeta') {
      celdaAudio.innerHTML = audioHTML(nombre, true);
    } else {
      celdaAudio.textContent = 'Descargado ⤓';
      estado.title = 'Se descargó a tu carpeta de Descargas: movelo a mano a conversor/clips/.';
    }
    boton.textContent = 'Regenerar';
  } catch (e) {
    estado.textContent = 'Error';
    estado.className = 'estado err';
    estado.title = e.message;
    console.error('Error generando', nombre, e);
  } finally {
    boton.disabled = false;
  }
}

async function iniciar() {
  try {
    await cargarYouTubeAPI();
    await crearPlayer();
  } catch (e) {
    console.error(e);
    estadoCatalogo.textContent = 'No se pudo cargar el reproductor de YouTube: ' + e.message;
    estadoCatalogo.className = 'estado-catalogo err';
  }

  const canciones = await cargarCatalogo();
  const conYt = canciones.filter(c => c.yt);

  for (const c of conYt) {
    const nombre = nombreClip(c.a, c.t);
    const generado = nombre ? await existeClip(nombre) : false;
    tabla.appendChild(filaHTML(c, nombre, generado));
  }

  const pendientes = tabla.querySelectorAll('.estado.pend').length;
  resumen.textContent = `${canciones.length} canciones en el catálogo, ${conYt.length} con ID de YouTube, ${pendientes} pendientes de clip.`;

  tabla.querySelectorAll('button.gen').forEach(btn => {
    btn.addEventListener('click', () => generarClip(btn.closest('tr')));
  });

  btnLote.addEventListener('click', async () => {
    const filasPendientes = [...tabla.querySelectorAll('tr')]
      .filter(fila => fila.querySelector('.estado')?.classList.contains('pend'));

    btnLote.disabled = true;
    for (let i = 0; i < filasPendientes.length; i++) {
      progreso.textContent = `Procesando ${i + 1} / ${filasPendientes.length}…`;
      await generarClip(filasPendientes[i]);
    }
    progreso.textContent = filasPendientes.length ? `Listo: ${filasPendientes.length} clips procesados.` : 'No había pendientes.';
    btnLote.disabled = false;
  });
}

iniciar();
