/* =========================================================
   Escuchadle Argento — capa de nube (Firestore).

   Qué hace:
     - escucha en vivo el documento con la configuración del día y
       avisa al juego cada vez que cambia, sin recargar la página;
     - publica esa configuración cuando el panel la toca;
     - archiva los resultados de las partidas y deja borrarlos.

   Cómo habla con el resto del juego: por eventos en window, así
   juego.js no depende de que este archivo haya cargado.
     window "nube:dia"     detail = {modo, cancion, salto, reinicio}
     window "nube:estado"  detail = {ok, texto}
   Y al revés, juego.js llama a window.Nube.*, siempre con guarda:
   si este módulo no cargó, el juego sigue andando con js/dia.js.

   Este archivo es un módulo (type="module"), así que corre después
   de los scripts clásicos. El juego arranca con la última
   configuración conocida y se corrige solo cuando llega la nube.
   ========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, onSnapshot, collection, addDoc, deleteDoc, getDocs,
  query, orderBy, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const CFG = window.NUBE_CONFIG || null;
const RUTAS = window.NUBE_RUTAS || {
  coleccionConfig: "escuchadle", documentoDia: "dia", coleccionResultados: "resultados"
};

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

/* Lo que llega de la nube no se cree a ciegas: se acota a lo esperable. */
function sanear(d){
  d = d || {};
  const modo = d.modo === "manual" ? "manual" : "auto";
  return {
    modo,
    cancion: typeof d.cancion === "string" ? d.cancion.slice(0,120) : "",
    salto: Number.isFinite(+d.salto) ? Math.trunc(+d.salto) : 0,
    reinicio: Number.isFinite(+d.reinicio) ? Math.trunc(+d.reinicio) : 0,
    actualizado: Number.isFinite(+d.actualizado) ? +d.actualizado : null
  };
}

const Nube = {
  disponible: false,     /* el módulo cargó y Firebase arrancó */
  conectada: false,      /* además, la última operación anduvo */
  ultimoEstado: "Conectando…",
  publicarDia(){ return Promise.reject(new Error("La nube no está lista.")); },
  guardarResultado(){ return Promise.reject(new Error("La nube no está lista.")); },
  listarResultados(){ return Promise.reject(new Error("La nube no está lista.")); },
  borrarResultado(){ return Promise.reject(new Error("La nube no está lista.")); },
  vaciarResultados(){ return Promise.reject(new Error("La nube no está lista.")); }
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

    const refDia = doc(db, RUTAS.coleccionConfig, RUTAS.documentoDia);
    const refResultados = collection(db, RUTAS.coleccionResultados);

    Nube.disponible = true;

    /* ---------- escucha en vivo ---------- */
    onSnapshot(refDia, snap => {
      if(!snap.exists()){
        estado(true, "Conectado. Todavía no hay configuración publicada.");
        return;
      }
      const desdeCache = snap.metadata.fromCache;
      estado(true, desdeCache ? "Conectado (mostrando lo último guardado)." : "Conectado.");
      avisar("nube:dia", sanear(snap.data()));
    }, e => {
      estado(false, motivo(e));
    });

    /* ---------- configuración del día ---------- */
    Nube.publicarDia = (d) => {
      const limpio = sanear(d);
      return setDoc(refDia, {
        modo: limpio.modo,
        cancion: limpio.modo === "manual" ? limpio.cancion : "",
        salto: limpio.modo === "manual" ? 0 : limpio.salto,
        reinicio: limpio.reinicio,
        actualizado: Date.now()
      }).catch(e => { throw new Error(motivo(e)); });
    };

    /* ---------- resultados ---------- */
    /* Los campos tienen que ser exactamente estos cinco: las reglas
       publicadas rechazan cualquier otra cosa. */
    Nube.guardarResultado = (r) => {
      const fila = {
        fecha: String(r.fecha || new Date().toISOString()),
        nombre: String(r.nombre || "").slice(0,39),
        cancion: String(r.cancion || "").slice(0,120),
        intentos: Math.max(0, Math.min(6, Math.trunc(+r.intentos || 0))),
        marcas: Array.isArray(r.marcas) ? r.marcas.slice(0,6).map(String) : []
      };
      return addDoc(refResultados, fila)
        .then(ref => ref.id)
        .catch(e => { throw new Error(motivo(e)); });
    };

    Nube.listarResultados = (n = 60) =>
      getDocs(query(refResultados, orderBy("fecha","desc"), limit(n)))
        .then(qs => qs.docs.map(d => Object.assign({id: d.id}, d.data())))
        .catch(e => { throw new Error(motivo(e)); });

    Nube.borrarResultado = (id) =>
      deleteDoc(doc(db, RUTAS.coleccionResultados, id))
        .catch(e => { throw new Error(motivo(e)); });

    /* Se borra de a tandas: un lote de Firestore aguanta 500 operaciones. */
    Nube.vaciarResultados = async () => {
      let borrados = 0;
      for(;;){
        const qs = await getDocs(query(refResultados, limit(400)));
        if(qs.empty) break;
        const lote = writeBatch(db);
        qs.docs.forEach(d => lote.delete(d.ref));
        await lote.commit();
        borrados += qs.size;
        if(qs.size < 400) break;
      }
      return borrados;
    };

  } catch(e) {
    estado(false, "No se pudo iniciar Firebase: " + motivo(e));
  }
}
