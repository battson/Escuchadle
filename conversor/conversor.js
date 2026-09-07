/* =========================================================
   Conversor de clips — Escuchadle Argento.

   Panel local (no vive en GitHub Pages: ver README.md de esta carpeta)
   que corta un fragmento corto de cada canción del catálogo con
   yt-dlp + ffmpeg, a través de generate.php.

   El catálogo se carga solo, igual que el juego: primero intenta la
   nube (Firestore, mismo documento escuchadle/catalogo) y si no hay
   conexión cae al respaldo js/catalogo.js.

   Los clips se guardan como "Artista - Título.mp3": nombreClip() acá
   tiene que dar exactamente el mismo resultado que nombre_clip() en
   generate.php, porque el cliente arma la URL del audio con eso.
   ========================================================= */

// Deben coincidir con config.php.
const CLIP_DURATION = 20;
const CLIP_FORMAT = 'mp3';

const tabla = document.querySelector('#tabla tbody');
const resumen = document.getElementById('resumen');
const estadoCatalogo = document.getElementById('estadoCatalogo');
const btnLote = document.getElementById('btnLote');
const progreso = document.getElementById('progreso');
document.getElementById('notaDuracion').textContent = CLIP_DURATION;

const CARACTERES_INVALIDOS = new RegExp('[' + ['/', '\\\\', ':', '\\*', '\\?', '"', '<', '>', '\\|'].join('') + ']', 'g');

function nombreClip(artista, titulo) {
  const base = (artista || '') + ' - ' + (titulo || '');
  return base.replace(CARACTERES_INVALIDOS, '').replace(/\s+/g, ' ').trim();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

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
  const { yt, ini, artista, titulo, nombre } = fila.dataset;
  const estado = fila.querySelector('.estado');
  const celdaAudio = fila.querySelector('.celda-audio');
  const boton = fila.querySelector('button.gen');

  estado.textContent = 'Generando…';
  estado.className = 'estado pend';
  boton.disabled = true;

  try {
    const params = new URLSearchParams({ yt, ini, artista, titulo });
    const resp = await fetch(`generate.php?${params}`);
    const datos = await resp.json();

    if (datos.ok) {
      estado.textContent = 'Generado';
      estado.className = 'estado ok';
      celdaAudio.innerHTML = audioHTML(nombre, true);
      boton.textContent = 'Regenerar';
    } else {
      estado.textContent = 'Error';
      estado.className = 'estado err';
      estado.title = datos.detalle || datos.error || '';
      console.error('Error generando', nombre, datos);
    }
  } catch (e) {
    estado.textContent = 'Error de red';
    estado.className = 'estado err';
    estado.title = 'No se pudo llamar a generate.php. ¿Está corriendo el servidor PHP local? Ver README.md.';
    console.error(e);
  } finally {
    boton.disabled = false;
  }
}

async function iniciar() {
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
