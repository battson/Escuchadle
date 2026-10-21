/* =========================================================
   Escuchadle Argento — capa de nube (Firestore).

   Qué hace:
     - escucha en vivo el catálogo de canciones y avisa al juego cada
       vez que cambia, sin recargar la página;
     - publica el catálogo cuando el panel lo toca;
     - guarda las sugerencias de los jugadores.

   Cómo habla con el resto del juego: por eventos en window, así
   juego.js no depende de que este archivo haya cargado.
     window "nube:catalogo" detail = {existe, canciones, hoy, actualizado}
     window "nube:estado"   detail = {ok, texto}
   Y al revés, juego.js llama a window.Nube.*, siempre con guarda:
   si este módulo no cargó, el juego sigue andando con js/catalogo.js.

   Este archivo es un módulo (type="module"), así que corre después
   de los scripts clásicos. El juego arranca con la última
   configuración conocida y se corrige solo cuando llega la nube.
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, onSnapshot, collection, addDoc, deleteDoc, getDocs,
  query, orderBy, limit, runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const CFG = window.NUBE_CONFIG || null;
const RUTAS = Object.assign({
  coleccionConfig: "escuchadle", documentoCatalogo: "catalogo",
  coleccionSugerencias: "sugerencias"
}, window.NUBE_RUTAS || {});

function avisar(tipo, detalle){
  window.dispatchEvent(new CustomEvent(tipo, {detail: detalle}));
}
function estado(ok, texto){
  Nube.conectada = ok;
  Nube.ultimoEstado = texto;
  avisar("nube:estado", {ok, texto});
}

/* Traduce los errores de Firestore a algo que se pueda leer en el panel. */
function motivo(e){
  const c = (e && e.code) || "";
  if(/permission-denied/.test(c)) return "Las reglas de Firestore rechazaron la operación.";
  if(/unavailable|deadline/.test(c)) return "Sin conexión con Firestore.";
  if(/not-found/.test(c))           return "No existe todavía la configuración en la nube.";
  return (e && e.message) || "Error desconocido.";
}

/* ---------- catálogo ----------
   Un documento único con el array entero de canciones. Cada canción:
   {a, t, yt, g, ini, activa, sonada}.
     activa   false = fuera del sorteo del admin (a mano o porque ya sonó)
     sonada   número de día en que sonó en el modo anterior; solo
              informativo (el juego es solo modo libre) */
function sanearCancion(c){
  c = c || {};
  const a = typeof c.a === "string" ? c.a.trim().slice(0,80) : "";
  const t = typeof c.t === "string" ? c.t.trim().slice(0,80) : "";
  if(!a || !t) return null;
  const x = {a, t};
  x.yt = typeof c.yt === "string" ? c.yt.trim().slice(0,20) : "";
  if(typeof c.g === "string" && c.g.trim()) x.g = c.g.trim().slice(0,40);
  if(Number.isFinite(+c.ini) && +c.ini > 0) x.ini = Math.min(600, +c.ini);
  x.activa = c.activa !== false;
  if(Number.isFinite(+c.sonada) && +c.sonada > 0) x.sonada = Math.trunc(+c.sonada);
  return x;
}
function sanearCatalogo(d){
  d = d || {};
  const lista = Array.isArray(d.canciones) ? d.canciones.slice(0,600) : [];
  const canciones = lista.map(sanearCancion).filter(Boolean);
  return {
    existe: true, canciones,
    actualizado: Number.isFinite(+d.actualizado) ? +d.actualizado : null
  };
}
/* Lo que se escribe: solo los campos con valor, sin undefined (Firestore
   los rechaza) y sin campos de trabajo del juego (id, label). */
function cancionADoc(c){
  const x = sanearCancion(c); if(!x) return null;
  const o = {a: x.a, t: x.t, yt: x.yt, activa: x.activa};
  if(x.g) o.g = x.g;
  if(x.ini) o.ini = x.ini;
  if(x.sonada) o.sonada = x.sonada;
  return o;
}

const Nube = {
  disponible: false,     /* el módulo cargó y Firebase arrancó */
  conectada: false,      /* además, la última operación anduvo */
  ultimoEstado: "Conectando…",
  publicarCatalogo(){ return Promise.reject(new Error("La nube no está lista.")); },
  guardarSugerencia(){ return Promise.reject(new Error("La nube no está lista.")); },
  listarSugerencias(){ return Promise.reject(new Error("La nube no está lista.")); },
  borrarSugerencia(){ return Promise.reject(new Error("La nube no está lista.")); }
};
window.Nube = Nube;

if(!CFG || !CFG.projectId){
  estado(false, "Falta completar js/nube-config.js.");
} else {
  try {
    const app = initializeApp(CFG);

    /* Caché en disco: la última configuración sobrevive al cierre del
       navegador y las escrituras hechas sin señal se mandan solas al
       volver la conexión. Si el navegador no deja (modo privado, por
       ejemplo), se sigue con la caché en memoria y listo. */
    let db;
    try {
      db = initializeFirestore(app, {
        localCache: persistentLocalCache({tabManager: persistentSingleTabManager()})
      });
    } catch {
      db = getFirestore(app);
    }

    const refCatalogo = doc(db, RUTAS.coleccionConfig, RUTAS.documentoCatalogo);
    const refSugerencias = collection(db, RUTAS.coleccionSugerencias);

    Nube.disponible = true;

    /* ---------- escucha en vivo ---------- */
    /* El catálogo también se escucha en vivo. Si el documento no existe
       todavía (primera vez), se avisa igual: el juego sigue con
       js/catalogo.js y el panel ofrece publicarlo. */
    onSnapshot(refCatalogo, snap => {
      if(!snap.exists()){ avisar("nube:catalogo", {existe: false}); return; }
      avisar("nube:catalogo", sanearCatalogo(snap.data()));
    }, e => {
      estado(false, motivo(e));
    });

    /* ---------- catálogo ---------- */
    /* Reemplaza el documento entero. */
    Nube.publicarCatalogo = (canciones) => {
      const lista = (Array.isArray(canciones) ? canciones : []).map(cancionADoc).filter(Boolean);
      if(!lista.length) return Promise.reject(new Error("El catálogo está vacío."));
      return runTransaction(db, async tx => {
        const nuevo = {canciones: lista, actualizado: Date.now()};
        tx.set(refCatalogo, nuevo);
        return sanearCatalogo(nuevo);
      }).catch(e => { throw new Error(motivo(e)); });
    };

    /* ---------- sugerencias ----------
       Tres campos y nada más, igual que los resultados: las reglas
       rechazan cualquier otra cosa. El nombre vacío se lee como
       anónimo. */
    Nube.guardarSugerencia = (s) => {
      const fila = {
        fecha: String(s.fecha || new Date().toISOString()),
        nombre: String(s.nombre || "").slice(0,39),
        mensaje: String(s.mensaje || "").slice(0,600)
      };
      if(!fila.mensaje.trim()) return Promise.reject(new Error("El mensaje está vacío."));
      return addDoc(refSugerencias, fila)
        .then(ref => ref.id)
        .catch(e => { throw new Error(motivo(e)); });
    };

    Nube.listarSugerencias = (n = 100) =>
      getDocs(query(refSugerencias, orderBy("fecha","desc"), limit(n)))
        .then(qs => qs.docs.map(d => Object.assign({id: d.id}, d.data())))
        .catch(e => { throw new Error(motivo(e)); });

    Nube.borrarSugerencia = (id) =>
      deleteDoc(doc(db, RUTAS.coleccionSugerencias, id))
        .catch(e => { throw new Error(motivo(e)); });

  } catch(e) {
    estado(false, "No se pudo iniciar Firebase: " + motivo(e));
  }
}
