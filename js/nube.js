/* =========================================================
   Escuchadle Argento — capa de nube (Firestore).

   Qué hace:
     - escucha en vivo el documento con la configuración del día y
       avisa al juego cada vez que cambia, sin recargar la página;
     - publica esa configuración cuando el panel la toca;
     - archiva los resultados de las partidas y deja borrarlos.

   Cómo habla con el resto del juego: por eventos en window, así
   juego.js no depende de que este archivo haya cargado.
     window "nube:dia"      detail = {modo, cancion, salto, reinicio}
     window "nube:catalogo" detail = {existe, canciones, hoy, actualizado}
     window "nube:estado"   detail = {ok, texto}
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
  query, where, orderBy, limit, writeBatch, runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const CFG = window.NUBE_CONFIG || null;
const RUTAS = Object.assign({
  coleccionConfig: "escuchadle", documentoDia: "dia", documentoCatalogo: "catalogo",
  coleccionResultados: "resultados", coleccionSugerencias: "sugerencias"
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

/* ---------- catálogo ----------
   Un documento único con el array entero de canciones más el pin del
   día. Cada canción: {a, t, yt, g, ini, activa, sonada}.
     activa   false = fuera del sorteo (a mano o porque ya sonó)
     sonada   número de día (como diaHoy() del juego) en que fue la
              canción del día; solo informativo
   hoy: {dia, cancion} es la canción fijada para ese día. La fija el
   primer jugador que entra (ver fijarHoy) y desde ahí todos la ven
   igual, aunque el catálogo cambie durante el día. */
const etiqueta = c => `${c.a} — ${c.t}`;
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
  const h = d.hoy && typeof d.hoy === "object" ? d.hoy : null;
  const hoy = h && Number.isFinite(+h.dia) && typeof h.cancion === "string" && h.cancion
    ? {dia: Math.trunc(+h.dia), cancion: h.cancion.slice(0,200)} : null;
  return {
    existe: true, canciones, hoy,
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
  publicarDia(){ return Promise.reject(new Error("La nube no está lista.")); },
  publicarCatalogo(){ return Promise.reject(new Error("La nube no está lista.")); },
  fijarHoy(){ return Promise.reject(new Error("La nube no está lista.")); },
  guardarSugerencia(){ return Promise.reject(new Error("La nube no está lista.")); },
  listarSugerencias(){ return Promise.reject(new Error("La nube no está lista.")); },
  borrarSugerencia(){ return Promise.reject(new Error("La nube no está lista.")); },
  listarDesde(){ return Promise.reject(new Error("La nube no está lista.")); },
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
    const refCatalogo = doc(db, RUTAS.coleccionConfig, RUTAS.documentoCatalogo);
    const refResultados = collection(db, RUTAS.coleccionResultados);
    const refSugerencias = collection(db, RUTAS.coleccionSugerencias);

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

    /* El catálogo también se escucha en vivo. Si el documento no existe
       todavía (primera vez), se avisa igual: el juego sigue con
       js/catalogo.js y el panel ofrece publicarlo. */
    onSnapshot(refCatalogo, snap => {
      if(!snap.exists()){ avisar("nube:catalogo", {existe: false}); return; }
      avisar("nube:catalogo", sanearCatalogo(snap.data()));
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

    /* ---------- catálogo ---------- */
    /* Reemplaza el documento entero. hoy puede venir null: entonces se
       conserva el pin que ya estuviera publicado (si es de hoy). */
    Nube.publicarCatalogo = (canciones, hoy) => {
      const lista = (Array.isArray(canciones) ? canciones : []).map(cancionADoc).filter(Boolean);
      if(!lista.length) return Promise.reject(new Error("El catálogo está vacío."));
      return runTransaction(db, async tx => {
        const snap = await tx.get(refCatalogo);
        const previo = snap.exists() ? sanearCatalogo(snap.data()).hoy : null;
        const pin = (hoy && Number.isFinite(+hoy.dia) && hoy.cancion)
          ? {dia: Math.trunc(+hoy.dia), cancion: String(hoy.cancion).slice(0,200)}
          : previo;
        const nuevo = {canciones: lista, actualizado: Date.now()};
        if(pin) nuevo.hoy = pin;
        tx.set(refCatalogo, nuevo);
        return sanearCatalogo(nuevo);
      }).catch(e => { throw new Error(motivo(e)); });
    };

    /* Fija la canción de un día y la marca como sonada (activa:false).
       Va en transacción para que dos jugadores que entran a la vez no se
       pisen: gana el primero y el segundo recibe lo que ya estaba. Con
       forzar (desde el panel) se reemplaza el pin del día y, si la
       canción que se destrona se había desactivado por ese mismo pin, se
       vuelve a activar: nadie llegó a jugarla entera.
       Las transacciones no corren sin conexión, así que un navegador sin
       señal nunca pisa el pin con datos viejos. Devuelve null si el
       catálogo todavía no está en la nube. */
    Nube.fijarHoy = ({dia, cancion, forzar = false}) => {
      dia = Math.trunc(+dia); cancion = String(cancion || "").slice(0,200);
      if(!Number.isFinite(dia) || !cancion) return Promise.reject(new Error("Faltan datos para fijar el día."));
      return runTransaction(db, async tx => {
        const snap = await tx.get(refCatalogo);
        if(!snap.exists()) return null;
        const cat = sanearCatalogo(snap.data());
        const previo = cat.hoy;
        if(previo && previo.dia === dia && (!forzar || previo.cancion === cancion)) return cat;
        const canciones = cat.canciones.map(c => {
          const x = Object.assign({}, c);
          if(forzar && previo && previo.dia === dia && etiqueta(x) === previo.cancion && x.sonada === dia){
            x.activa = true; delete x.sonada;
          }
          if(etiqueta(x) === cancion){ x.activa = false; x.sonada = dia; }
          return x;
        });
        const nuevo = {canciones: canciones.map(cancionADoc).filter(Boolean), hoy: {dia, cancion}, actualizado: Date.now()};
        tx.set(refCatalogo, nuevo);
        return sanearCatalogo(nuevo);
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

    /* Para la tabla semanal: todo lo jugado desde una fecha en adelante.
       El where y el orderBy van sobre el mismo campo, así que Firestore
       no pide índice compuesto. */
    Nube.listarDesde = (desdeISO, n = 500) =>
      getDocs(query(refResultados, where("fecha", ">=", String(desdeISO)),
                    orderBy("fecha","desc"), limit(n)))
        .then(qs => qs.docs.map(d => Object.assign({id: d.id}, d.data())))
        .catch(e => { throw new Error(motivo(e)); });

    Nube.borrarResultado = (id) =>
      deleteDoc(doc(db, RUTAS.coleccionResultados, id))
        .catch(e => { throw new Error(motivo(e)); });

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
