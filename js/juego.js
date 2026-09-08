/* Escuchadle Argento - logica del juego.
   Depende de: config.js (YT_API_KEY), dia.js (DIA) y catalogo.js (CANCIONES).
   Tanto DIA como CANCIONES son respaldos: si la nube carga, lo que manda
   es lo publicado en Firestore (escuchadle/dia y escuchadle/catalogo).
   Se apoya, si cargó, en nube.js (window.Nube + eventos "nube:dia" y
   "nube:estado"). Todo lo que toca la nube va con guarda: si Firebase
   no está, el juego funciona igual con lo que dice js/dia.js. */

/* ---------- estado ---------- */
const SEG=[1,2,4,7,11,16], MAX=6;
/* Dirección pública del juego: va en el texto que se copia para compartir.
   Si algún día cambia el dominio, se toca solo acá. */
const SITIO="https://battson.github.io/Escuchadle/";
/* ?modo=libre en la URL sirve para entrar directo en modo libre desde
   un link del panel de administración, que ya no comparte JS con esta
   página. */
let modo=new URLSearchParams(location.search).get("modo")==="libre"?"libre":"diario";
let actual=null, intentos=[], paso=0, terminado=false, audio=null, timer=null, raf=null;
let diaPartida=0;   /* el día que corresponde a la partida en pantalla */

const $=s=>document.querySelector(s);
const vinilo=$("#vinilo"), barra=$("#barra"), desbloq=$("#desbloq"), progreso=$("#progreso"),
      tActual=$("#tActual"), tTotal=$("#tTotal"), btnPlay=$("#btnPlay"), estado=$("#estado"), cont=$("#intentos"),
      input=$("#busqueda"), lista=$("#lista"), btnSaltar=$("#btnSaltar"), btnEnviar=$("#btnEnviar"),
      zonaJuego=$("#zonaJuego"), zonaCerrada=$("#zonaCerrada"), contPistas=$("#pistas"),
      pauta=$("#pauta"), clipEl=$("#clipAudio");

/* ticks de la barra */
SEG.slice(0,-1).forEach(s=>{const t=document.createElement("div");t.className="tick";t.style.left=(s/16*100)+"%";barra.appendChild(t);});

/* ---------- persistencia suave (si el navegador la permite) ---------- */
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}},
  del(k){try{localStorage.removeItem(k)}catch{}}
};
let stats=store.get("ea_stats",{jugadas:0,ganadas:0,racha:0});
let nombre=store.get("ea_nombre","");

/* Preferencias de prueba: valen solo en este navegador y no se publican
   a nadie. Se encienden desde el panel de administración. */
const local=Object.assign({saltearFinde:false},store.get("ea_local",{}));
const guardarLocal=()=>store.set("ea_local",local);

/* ---------- fin de semana ----------
   Sábados y domingos el juego cierra. Manda el reloj de la máquina del
   jugador, que es lo que corresponde a un juego entre conocidos. El
   panel de administración, en cambio, abre los siete días. */
const esFinde=()=>[0,6].includes(new Date().getDay());
const cerradoHoy=()=>esFinde()&&!local.saltearFinde;

/* ---------- ventanas ---------- */
let capa=20;
function abrirModal(id){
  const m=$("#"+id); if(!m) return;
  m.style.zIndex=++capa;   /* la última que se abre queda arriba */
  m.hidden=false;
  document.documentElement.style.overflow="hidden";
}
function cerrarModal(id){
  const m=$("#"+id); if(!m) return;
  m.hidden=true;
  if(!document.querySelector(".modal:not([hidden])")) document.documentElement.style.overflow="";
}
function modalAbierto(){return document.querySelector(".modal:not([hidden])")}

/* Arma el HTML de un estado de error con ilustración.
   modo "block": ícono arriba, texto abajo (sin conexión, ranking vacío).
   modo "inline": ícono a la izquierda, texto a la derecha (fallo del reproductor). */
function htmlError(txt,svg,modo="block"){
  return `<div class="estado-error${modo==="inline"?" compact":""}"><img src="imgs/${svg}" alt="">`+
         `<span class="est-txt">${txt}</span></div>`;
}


/* Acordeones de la ayuda: uno abierto por vez. Los navegadores nuevos
   lo hacen solos con el atributo name="ayuda" de los <details>; esto es
   para los que todavía no lo entienden. */
document.querySelectorAll("#modalAyuda details.ayuda-bloque").forEach(d=>{
  d.addEventListener("toggle",()=>{
    if(!d.open) return;
    document.querySelectorAll("#modalAyuda details.ayuda-bloque[open]").forEach(o=>{if(o!==d) o.open=false});
  });
});
document.querySelectorAll("[data-cerrar]").forEach(b=>b.onclick=()=>cerrarModal(b.dataset.cerrar));
document.querySelectorAll(".modal").forEach(m=>{
  m.addEventListener("mousedown",e=>{if(e.target===m) cerrarModal(m.id)});   /* clic en el fondo */
});
$("#btnAyuda").onclick=()=>abrirModal("modalAyuda");

/* ---------- modo claro/oscuro ----------
   Oscuro es el predeterminado (ver el script inline del <head>, que ya
   dejó aplicado data-tema si el navegador tenía guardado "claro"); acá
   solo hace falta alternarlo y guardar el que quede. */
function temaActual(){return document.documentElement.dataset.tema==="claro"?"claro":"oscuro"}
$("#btnTema").onclick=()=>{
  const nuevo=temaActual()==="claro"?"oscuro":"claro";
  if(nuevo==="claro") document.documentElement.dataset.tema="claro";
  else delete document.documentElement.dataset.tema;
  try{localStorage.setItem("ea_tema",nuevo)}catch{}
  pintarBtnTema();
};

/* ---------- vista clásica (1.0) / 2.0 ----------
   Alterna qué hoja de estilos carga la página entera: la 2.0
   (glassmorphism) o la 1.0 guardada tal cual en css/clasico.css. El
   script inline del <head> ya la eligió antes de pintar según lo
   guardado; acá solo hace falta poder cambiarla. La clásica no tiene
   modo claro/oscuro, así que ese botón se esconde mientras esté puesta. */
const HOJA_20="css/estilos.css?v=25", HOJA_CLASICA="css/clasico.css?v=1";
function vistaActual(){return document.documentElement.dataset.vista==="clasica"?"clasica":"2.0"}
function pintarBtnTema(){
  const claro=temaActual()==="claro", esClasica=vistaActual()==="clasica";
  $("#btnTema").hidden=esClasica;
  const etiqueta=claro?"Cambiar a modo oscuro":"Cambiar a modo claro";
  $("#btnTema").textContent=claro?"☀":"🌙";
  $("#btnTema").title=etiqueta;
  $("#btnTema").setAttribute("aria-label",etiqueta);
}
$("#btnVista").onclick=()=>{
  const nuevo=vistaActual()==="clasica"?"2.0":"clasica";
  if(nuevo==="clasica") document.documentElement.dataset.vista="clasica";
  else delete document.documentElement.dataset.vista;
  $("#hojaEstilos").href=nuevo==="clasica"?HOJA_CLASICA:HOJA_20;
  try{localStorage.setItem("ea_vista",nuevo)}catch{}
  $("#btnVista").textContent=nuevo==="clasica"?"Vista 2.0":"Vista clásica";
  pintarBtnTema();
};
$("#btnVista").textContent=vistaActual()==="clasica"?"Vista 2.0":"Vista clásica";
pintarBtnTema();

/* La primera vez que alguien abre el juego, las reglas se muestran solas.
   Después queda el "?" de la cabecera para volver a leerlas. */
if(!store.get("ea_ayuda_vista",false)){
  abrirModal("modalAyuda");
  store.set("ea_ayuda_vista",true);
}

/* ---------- configuración del día ----------
   La fuente de verdad ahora es Firestore: lo que se toca en el panel se
   publica y le llega a todo el mundo en el acto, sin recargar y sin
   subir nada al repositorio. js/dia.js quedó como respaldo para el caso
   de que la nube no cargue.

   Precedencia, de menor a mayor:
     PREDETERMINADO  <  js/dia.js  <  lo último que dijo la nube        */
const PREDETERMINADO={modo:"auto",cancion:"",salto:0,reinicio:0};
const DIA_BASE=(typeof DIA==="object"&&DIA)?DIA:PREDETERMINADO;

const CLAVE_NUBE="ea_nube_dia";
/* Espejo de lo último que llegó de la nube. Sirve para arrancar con la
   canción correcta sin esperar a que Firebase termine de cargar. */
let diaNube=store.get(CLAVE_NUBE,null);
let textoNube="Conectando con la nube…";

/* Los ajustes locales de la versión anterior ya no corresponden: si
   quedaran, le taparían a este navegador lo que se publica para todos. */
store.del("ea_dia");

function dia(){
  const d=Object.assign({},PREDETERMINADO,DIA_BASE,diaNube||{});
  d.salto=Number(d.salto)||0;
  d.reinicio=Number(d.reinicio)||0;
  return d;
}

/* Si a los ocho segundos el módulo no apareció, es que no cargó. */
setTimeout(()=>{
  if(!window.Nube||!window.Nube.disponible){
    textoNube="No cargó Firebase. El juego anda con el respaldo de js/dia.js.";
  }
},8000);

/* La nube manda: cuando llega una configuración distinta, se rehace la
   partida igual que cuando se cambiaba dia.js, pero al instante. */
window.addEventListener("nube:dia",e=>{
  const antes=dia();
  diaNube=e.detail; store.set(CLAVE_NUBE,diaNube);
  const ahora=dia();
  const cambio=["modo","cancion","salto","reinicio"].some(k=>antes[k]!==ahora[k]);
  if(cambio&&modo==="diario") nuevaPartida();
});
window.addEventListener("nube:estado",e=>{textoNube=e.detail.texto});

/* ---------- catálogo en la nube ----------
   CANCIONES arranca con lo que trae js/catalogo.js (respaldo). Si hay un
   espejo guardado de la última vez que llegó la nube, se aplica ya; y
   cuando Firestore avisa, se reemplaza el array en el lugar, así todo lo
   que apunta a CANCIONES sigue valiendo.

   Cada canción lleva:
     activa   false = fuera del sorteo (a mano, o porque ya sonó)
     sonada   día (número, como diaHoy()) en que fue canción del día
   El buscador y el modo libre usan el catálogo entero: desactivar una
   canción la saca del sorteo, no de las respuestas posibles.

   catNube.hoy = {dia, cancion} es el pin del día: la canción fijada para
   todos. La fija el primero que entra en el día (ver nuevaPartida) y a la
   vez se desactiva, así no se repite hasta que se la reactive desde el
   panel. Como el pin manda, publicar cambios de catálogo en medio del
   día no le cambia la canción a nadie. */
const CLAVE_CAT="ea_nube_catalogo";
let catNube=store.get(CLAVE_CAT,null);   /* {canciones, hoy, actualizado} */
let catEnNube=false;                     /* la nube confirmó que el documento existe */
let catSucio=false;                      /* hay cambios del panel sin publicar */
let textoCat="Esperando a la nube…";     /* estado para el panel */

function normalizarCatalogo(){
  CANCIONES.forEach((c,i)=>{
    c.id=i; c.label=`${c.a} — ${c.t}`;
    if(c.activa===undefined) c.activa=true;
    delete c.nueva;
  });
}
function aplicarCatalogo(cat){
  CANCIONES.length=0;
  cat.canciones.forEach(c=>CANCIONES.push(Object.assign({},c)));
  normalizarCatalogo();
}
/* El espejo local se arma desde CANCIONES: es lo que hay que recordar. */
function guardarEspejoCatalogo(){
  const c={canciones:CANCIONES.map(x=>{
            const o={a:x.a,t:x.t,yt:x.yt||"",activa:x.activa!==false};
            if(x.g) o.g=x.g; if(x.ini) o.ini=x.ini; if(x.sonada) o.sonada=x.sonada;
            return o;}),
           hoy:(catNube&&catNube.hoy)||null,
           actualizado:(catNube&&catNube.actualizado)||null,
           sucio:true};   /* al recargar, los cambios siguen sin publicar */
  catNube=c; store.set(CLAVE_CAT,c);
}
const porLabel=l=>CANCIONES.find(x=>x.label===l);
/* Marca la canción del día como sonada y la saca del sorteo. Si ya
   tenía la fecha anotada, no se la vuelve a apagar: puede ser que el
   panel la haya reactivado a propósito. */
function marcarSonada(label,d){
  const c=porLabel(label); if(!c||c.sonada===d) return;
  c.activa=false; c.sonada=d;
}
function tomarHoy(cat){   /* copia el pin de la nube y su marca en el catálogo local */
  if(!cat) return;
  catNube=catNube||{canciones:[],hoy:null,actualizado:null};
  catNube.hoy=cat.hoy||null; catNube.actualizado=cat.actualizado||null;
  if(cat.hoy&&cat.hoy.dia===diaHoy()) marcarSonada(cat.hoy.cancion,cat.hoy.dia);
  store.set(CLAVE_CAT,catNube);
}

/* Migración del banco viejo (localStorage): las canciones nuevas que
   hubieran quedado sin publicar se suman al catálogo y quedan marcadas
   para publicar. Las correcciones por índice solo valen sobre el
   respaldo, antes de que exista el catálogo en la nube. */
(function(){
  const cambios=store.get("ea_banco",{}), nuevas=store.get("ea_banco_nuevas",[]);
  if(catNube){
    aplicarCatalogo(catNube);
    catSucio=!!catNube.sucio;
  }else{
    for(const k in cambios){
      const c=CANCIONES[+k]; if(!c) continue; const o=cambios[k];
      if(o.a) c.a=o.a; if(o.t) c.t=o.t; if(o.g) c.g=o.g; if(o.yt) c.yt=o.yt;
      if(o.ini) c.ini=o.ini; else delete c.ini;
    }
    if(Object.keys(cambios).length) catSucio=true;
  }
  normalizarCatalogo();
  (Array.isArray(nuevas)?nuevas:[]).forEach(n=>{
    if(!n||!n.a||!n.t||CANCIONES.some(c=>c.a===n.a&&c.t===n.t)) return;
    CANCIONES.push({a:n.a,t:n.t,yt:n.yt||"",g:n.g,ini:n.ini,activa:true}); catSucio=true;
  });
  normalizarCatalogo();
})();
const olvidarBancoViejo=()=>{store.del("ea_banco"); store.del("ea_banco_nuevas")};

window.addEventListener("nube:catalogo",e=>{
  const cat=e.detail;
  if(!cat||cat.existe===false){
    catEnNube=false;
    textoCat="El catálogo todavía no está en la nube: el juego usa js/catalogo.js.";
    return;
  }
  catEnNube=true;
  if(catSucio){
    /* No se pisan los cambios sin publicar; solo se toma el pin del día. */
    tomarHoy(cat);
    textoCat="La nube cambió mientras tanto: se tomó la canción del día.";
    if(modo==="diario"&&actual&&cancionDelDia().label!==actual.label){nuevaPartida();return}
  }else{
    const antes=actual?actual.label:null;
    aplicarCatalogo(cat);
    catNube={canciones:cat.canciones,hoy:cat.hoy,actualizado:cat.actualizado};
    store.set(CLAVE_CAT,catNube);
    textoCat="Catálogo publicado en la nube.";
    if(modo==="diario"&&antes&&cancionDelDia().label!==antes){nuevaPartida();return}
  }
  /* Recién ahora se sabe que el catálogo está en la nube: si hoy todavía
     no tiene canción fijada, se fija la que está sonando. */
  if(modo==="diario"&&actual) fijarHoyEnNube(actual.label,false);
});

/* ---------- elección de canción ---------- */
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
function diaHoy(){const d=new Date();return Math.floor((d.getTime()-d.getTimezoneOffset()*6e4)/864e5)}
/* Las que entran al sorteo. Si no queda ninguna activa, se sortea
   entre todas antes que dejar el juego sin canción. */
function bolsa(){const a=CANCIONES.filter(c=>c.activa!==false); return a.length?a:CANCIONES}
function ordenDiario(){const r=rng(20260101),a=bolsa().map(c=>c.id);for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function sorteo(salto){const o=ordenDiario(), n=o.length; return CANCIONES[o[(((diaHoy()+salto)%n)+n)%n]]}   /* módulo siempre positivo */
function pinHoy(){const h=catNube&&catNube.hoy; return (h&&h.dia===diaHoy()&&h.cancion)?h:null}
function cancionDelDia(){
  const d=dia();
  if(d.modo==="manual"&&d.cancion){
    const c=porLabel(d.cancion);
    if(c) return c;      /* si el label ya no existe, se cae al automático */
  }
  const p=pinHoy();
  if(p){const c=porLabel(p.cancion); if(c) return c}
  return sorteo(d.salto);
}
function elegir(){
  return modo==="diario"?cancionDelDia():CANCIONES[Math.floor(Math.random()*CANCIONES.length)];
}
/* Deja fijada en la nube la canción de hoy. Sin forzar, es lo que hace
   cada jugador al entrar: si ya hay pin, no pasa nada. Con forzar es el
   panel cambiando la canción del día a propósito. Los fines de semana
   no se fija nada: no hay canción del día que gastar. */
function fijarHoyEnNube(label,forzar){
  if(!hayNube()||!catEnNube||esFinde()||!label) return;
  if(!forzar&&pinHoy()) return;
  const d=diaHoy();
  if(catNube){catNube.hoy={dia:d,cancion:label}; store.set(CLAVE_CAT,catNube)}   /* optimista */
  window.Nube.fijarHoy({dia:d,cancion:label,forzar:!!forzar}).catch(()=>{});
}

/* ---------- partida guardada ----------
   Solo se guarda el modo diario: si refrescás la página, la partida vuelve
   donde estaba, ganada o a medio jugar. Se archivan el label de la canción
   y el contador de reinicio; si cualquiera de los dos cambió, el guardado
   se descarta y se arranca de nuevo. */
const CLAVE_PARTIDA="ea_partida";
function guardarPartida(){
  if(modo!=="diario"||!actual) return;
  store.set(CLAVE_PARTIDA,{dia:diaHoy(),cancion:actual.label,reinicio:dia().reinicio,intentos,paso,terminado});
}
function partidaGuardada(){
  const g=store.get(CLAVE_PARTIDA,null);
  return g&&g.dia===diaHoy()&&Array.isArray(g.intentos)?g:null;
}
function sirve(g){return g&&g.cancion===actual.label&&(g.reinicio||0)===dia().reinicio}
function borrarPartida(){store.del(CLAVE_PARTIDA)}

/* ---------- pistas ----------
   Son tres y llegan sobre el final: una por intento durante los últimos
   tres. Con MAX=6, la primera se destapa recién al cuarto intento. Las
   que todavía no salieron se muestran con candado, así se ve de entrada
   cuántas hay y de qué van a hablar. */
const PISTAS=3;
const PALABRAS=t=>t.split(/\s+/).filter(Boolean).length;
const LETRAS=t=>[...t].filter(ch=>/\p{L}/u.test(ch)).length;
const plural=(n,s,p)=>`${n} ${n===1?s:p}`;
const medida=t=>`${plural(PALABRAS(t),"palabra","palabras")} · ${plural(LETRAS(t),"letra","letras")}`;

function pistasDe(c){
  return [
    {et:"Género",  v:c.g||"Sin clasificar"},
    {et:"Título",  v:medida(c.t)},
    {et:"Artista", v:medida(c.a)}
  ];
}
/* Cuántas van destapadas. Al terminar la partida se abren todas. */
function pistasAbiertas(){
  if(terminado) return PISTAS;
  return Math.max(0,Math.min(PISTAS,paso-(MAX-PISTAS)+1));
}
function pintarPistas(){
  if(!actual){contPistas.hidden=true;contPistas.innerHTML="";return}
  const abiertas=pistasAbiertas(), faltan=(MAX-PISTAS)-paso;
  const aviso=terminado?""
    :abiertas===0?` · la primera llega en ${plural(faltan,"intento","intentos")}`
    :abiertas<PISTAS?" · una más por intento":"";
  contPistas.hidden=false;
  contPistas.innerHTML=
    `<div class="pistas-cab">Pistas <span>${abiertas} de ${PISTAS}${aviso}</span></div>`+
    `<div class="pistas-fila">`+
    pistasDe(actual).map((x,i)=>i<abiertas
      ? `<div class="pista"><span class="et">${escapar(x.et)}</span><span class="vl">${escapar(x.v)}</span></div>`
      : `<div class="pista cerrada"><span class="et">${escapar(x.et)}</span><span class="vl" aria-label="Todavía bloqueada">🔒</span></div>`
    ).join("")+
    `</div>`;
}

/* ---------- YouTube: reproductor oficial + búsqueda opcional ---------- */
let yt=null, ytListo=new Promise(r=>{window.onYouTubeIframeAPIReady=()=>{
  yt=new YT.Player("ytplayer",{width:200,height:113,videoId:"",
    playerVars:{controls:0,disablekb:1,rel:0,iv_load_policy:3,modestbranding:1,playsinline:1,fs:0},
    events:{onReady:()=>r(),onStateChange:onYtEstado}});
}});
(function(){const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";document.head.appendChild(s)})();

/* ---------- clip local (2.0) ----------
   Mientras se juega, el fragmento sale de un .webm corto en
   conversor/clips/ (generado con el conversor), no del streaming en
   vivo de YouTube: menos dependencia de la red de Google mientras se
   arriesga el intento. YouTube sigue siendo la fuente de la canción
   entera al terminar la partida (el "reveal"), y también el respaldo
   durante la partida si todavía no existe el clip de esa canción.
   El archivo ya arranca en el segundo `ini` (así lo graba el
   conversor), así que acá no hace falta volver a saltarlo. */
let clipOk=false, modoAudio="yt";
const CARACTERES_INVALIDOS_CLIP=/[/\\:*?"<>|]/g;
function nombreClip(a,t){
  return ((a||"")+" - "+(t||"")).replace(CARACTERES_INVALIDOS_CLIP,"").replace(/\s+/g," ").trim();
}
function urlClip(c){return "conversor/clips/"+encodeURIComponent(nombreClip(c.a,c.t))+".webm"}
async function prepararClip(c){
  clipOk=false; clipEl.removeAttribute("src");
  try{
    const r=await fetch(urlClip(c),{method:"HEAD",cache:"no-store"});
    if(r.ok){clipEl.src=urlClip(c); clipOk=true}
  }catch{}
}

const MALAS=/en vivo|live|unplugged|acustic|acústic|remix|cover|karaoke|instrumental|tributo|homenaje|sinf[oó]nic|reacci[oó]n|letra|lyric|tutorial|8d|slowed|nightcore/i;
function puntuar(c,x){
  let p=0; const t=norm(x.snippet.title), ch=norm(x.snippet.channelTitle);
  if(t.includes(norm(c.t))) p+=40; if(t.includes(norm(c.a))||ch.includes(norm(c.a))) p+=30;
  if(/vevo|oficial|official|topic/i.test(x.snippet.channelTitle)) p+=15;
  if(/video oficial|official video|audio oficial|official audio|\(audio\)/i.test(x.snippet.title)) p+=10;
  if(MALAS.test(x.snippet.title)) p-=40;
  return p;
}
/* Devuelve {yt, titulo, canal} */
/* Errores que no tiene sentido reintentar: la cuota diaria se agotó. */
class SinCuota extends Error{}

const dormir=ms=>new Promise(r=>setTimeout(r,ms));

/* Caché local: lo ya resuelto no se vuelve a pedir a la API. */
const cache=store.get("ea_cache",{});
const guardarCache=()=>store.set("ea_cache",cache);

async function resolver(c){
  if(c.yt) return {yt:c.yt,titulo:c.label,canal:"ID fijado"};
  if(cache[c.label]) return cache[c.label];
  if(!YT_API_KEY) throw new Error("Falta ID de YouTube (yt) o clave de API");
  const q=encodeURIComponent(`${c.a} ${c.t}`);
  const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q=${q}&key=${YT_API_KEY}`;

  let espera=1200;
  for(let intento=1;intento<=4;intento++){
    const r=await fetch(url);
    if(r.status===429||r.status===503){          /* demasiado rápido: esperar y reintentar */
      if(intento===4) throw new Error("API saturada (429)");
      await dormir(espera); espera*=2; continue;
    }
    if(r.status===403){
      const d=await r.json().catch(()=>({}));
      const razon=d.error?.errors?.[0]?.reason||"";
      if(/quota/i.test(razon)) throw new SinCuota("Cuota diaria agotada");
      throw new Error("Clave rechazada (403)");
    }
    if(!r.ok) throw new Error("API "+r.status);
    const d=await r.json(); const items=d.items||[];
    if(!items.length) throw new Error("sin resultados");
    items.sort((x,y)=>puntuar(c,y)-puntuar(c,x));
    const m=items[0];
    const res={yt:m.id.videoId,titulo:m.snippet.title,canal:m.snippet.channelTitle};
    cache[c.label]=res; guardarCache();
    return res;
  }
}

/* Muestra el cartel de cerrado y esconde el juego, o al revés. */
function aplicarCierre(){
  const cerrado=cerradoHoy();
  document.body.classList.toggle("cerrado",cerrado);
  $("#finde").hidden=!cerrado;
  if(cerrado){detener(); cerrarModal("modalResultado"); pintarFinde()}
  return cerrado;
}

async function nuevaPartida(){
  detener(); cerrarModal("modalResultado");
  if(aplicarCierre()){estado.textContent="";return}

  /* Una partida sin terminar de un día anterior se da por perdida:
     cuenta como jugada, corta la racha y no se puede retomar. */
  const dejada=store.get(CLAVE_PARTIDA,null);
  if(dejada&&dejada.dia!==diaHoy()&&!dejada.terminado){
    stats.jugadas++; stats.racha=0; store.set("ea_stats",stats);
    borrarPartida();
  }

  actual=elegir(); intentos=[]; paso=0; terminado=false; audio=null; diaPartida=diaHoy();
  if(modo==="diario") fijarHoyEnNube(actual.label,false);
  zonaJuego.style.display="flex"; zonaCerrada.hidden=true;
  input.value=""; btnEnviar.disabled=true; btnPlay.disabled=true; btnSaltar.disabled=false;
  estado.textContent="Cargando canción…";

  /* ¿Hay algo guardado de hoy que siga valiendo? */
  const g=modo==="diario"?partidaGuardada():null;
  if(sirve(g)){
    intentos=g.intentos; paso=g.paso||0; terminado=!!g.terminado; diaPartida=g.dia;
  }else if(g){
    borrarPartida();   /* cambió la canción o hubo un reinicio: no aplica más */
  }

  pintar();
  if(terminado) mostrarResultado(intentos.some(i=>i.tipo==="bien"),true);

  try{
    const [r]=await Promise.all([resolver(actual),prepararClip(actual)]);
    await ytListo; yt.cueVideoById(r.yt); audio=r.yt;
    btnPlay.disabled=false;
    estado.textContent=terminado?"Ahora podés escuchar la canción completa."
      :(modo==="diario"?"Canción del día. ¡Suerte!":"Modo libre.");
  }catch(e){
    estado.innerHTML=e.message.startsWith("Falta")?e.message:htmlError("No encontré el video de esta canción. Probá otra.","alert.svg","inline");
    btnSaltar.disabled=true;
  }
}

/* ---------- reproducción ----------
   El reloj cuenta en minutos y segundos: mientras se juega nunca pasa
   de 0:16, pero al terminar suena el tema entero y ahí sí hace falta.
   La barra también cambia de escala: durante la partida mide 16
   segundos, y al terminar mide lo que dure la canción. */
let sonando=false, limite=0, escala=16;
const reloj=s=>{s=Math.max(0,Math.floor(s));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")};

/* Deja la barra y el rótulo de la derecha midiendo los segundos que
   correspondan. Al terminar se sacan las marcas de los tramos: ya no
   representan nada. */
function fijarEscala(seg){
  escala=Math.max(1,seg);
  tTotal.textContent=reloj(escala);
  barra.classList.toggle("entera",terminado);
}
function duracion(){
  const d=yt&&yt.getDuration?yt.getDuration():0;
  return Number.isFinite(d)&&d>0?d:0;
}
/* El iframe de YouTube publica su propio título/canal en los controles
   multimedia del sistema (SMTC en Windows, etc.), lo cual revela la
   canción antes de tiempo. No podemos tocar ese mediaSession porque el
   iframe es de otro origen, pero sí podemos publicar el nuestro con
   datos neutros: en varios navegadores (Edge/Chrome) la sesión del
   frame principal termina ganándole a la del iframe. */
function fijarMediaSessionNeutra(){
  if(!("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata=new MediaMetadata({
    title:"Escuchadle",artist:"Adiviná la canción",album:"escuchadle.com.ar"
  });
}
/* Los botones de play/pausa del widget del sistema (SMTC en Windows,
   notificación de Chrome, etc.) tocan el audio por fuera del juego: no
   pasan por reproducir()/detener() y por lo tanto ignoran el límite de
   segundos del intento actual. Marcarlos como no soportados hace que el
   navegador los oculte del widget, dejando solo el botón de la página
   -que sí respeta el límite- como forma de escuchar. Se llama una sola
   vez; algún navegador viejo puede no reconocer alguna acción, de ahí
   el try/catch por acción. */
function desactivarControlesMediaSession(){
  if(!("mediaSession" in navigator)) return;
  ["play","pause","stop","seekbackward","seekforward","seekto","previoustrack","nexttrack"]
    .forEach(accion=>{try{navigator.mediaSession.setActionHandler(accion,null)}catch{}});
}
desactivarControlesMediaSession();
function fijarEstadoMediaSession(valor){
  if(!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState=valor;
}
/* Arranca el cronómetro y la barra: lo llama quien primero confirme
   que el audio ya suena de verdad, sea el clip local o el iframe. */
function arrancarCronometro(){
  estado.textContent="";
  fijarMediaSessionNeutra(); fijarEstadoMediaSession("playing");
  if(modoAudio==="yt"&&terminado){
    /* Recién ahora YouTube sabe cuánto dura: si es la canción entera,
       se corrige la escala con el dato real. */
    const d=duracion(); if(d&&Math.abs(d-limite)>1){limite=d; fijarEscala(d)}
  }
  clearTimeout(timer); timer=setTimeout(detener,limite*1000);
  const t0=performance.now();
  const tick=()=>{const t=Math.min((performance.now()-t0)/1000,limite);
    progreso.style.width=(Math.min(t,escala)/escala*100)+"%"; tActual.textContent=reloj(t);
    raf=requestAnimationFrame(tick)};
  cancelAnimationFrame(raf); tick();
}
function reproducir(){
  if(!audio||!yt) return;
  if(sonando){detener();return}
  if(terminado){const d=duracion(); limite=d||600; fijarEscala(d||16)}
  else {limite=SEG[paso]; fijarEscala(16)}
  sonando=true;
  /* Durante la partida, si hay clip local generado, se usa ese: no
     depende del streaming en vivo de YouTube. Al terminar (o si el
     clip no existe todavía) suena YouTube, como siempre. */
  modoAudio=(!terminado&&clipOk)?"clip":"yt";
  vinilo.classList.add("gira"); btnPlay.textContent="■ Parar"; estado.textContent="Cargando…";
  if(modoAudio==="clip"){
    clipEl.currentTime=0;
    const p=clipEl.play();
    if(p&&p.catch) p.catch(()=>{clipOk=false;sonando=false;reproducir()});
  }else{
    const ini=actual?.ini||0;
    yt.seekTo(ini,true); yt.playVideo();
  }
}
clipEl.addEventListener("playing",()=>{if(sonando&&modoAudio==="clip") arrancarCronometro()});
clipEl.addEventListener("error",()=>{
  if(sonando&&modoAudio==="clip"){clipOk=false;sonando=false;reproducir()}
});
function onYtEstado(e){
  if(e.data===YT.PlayerState.PLAYING&&sonando&&modoAudio==="yt") arrancarCronometro();
  if(e.data===YT.PlayerState.ENDED&&modoAudio==="yt") detener();
}
function detener(){
  clearTimeout(timer); cancelAnimationFrame(raf); sonando=false;
  try{clipEl.pause()}catch{}
  if(yt&&yt.pauseVideo) yt.pauseVideo();
  fijarEstadoMediaSession("paused");
  vinilo.classList.remove("gira"); btnPlay.textContent="▶ Escuchar";
  progreso.style.width="0"; tActual.textContent=reloj(0);
}

/* ---------- pintar ---------- */
function pintar(){
  desbloq.style.width=(SEG[Math.min(paso,MAX-1)]/16*100)+"%";
  if(!sonando) fijarEscala(terminado?(duracion()||16):16);
  cont.innerHTML="";
  for(let i=0;i<MAX;i++){
    const it=intentos[i], d=document.createElement("div");
    d.className="intento"+(it?" "+it.tipo:"");
    d.innerHTML=`<span class="ic"></span><span>${it?it.texto:""}</span>`;
    cont.appendChild(d);
  }
  btnSaltar.textContent=paso<MAX-1?`Saltar (+${SEG[paso+1]-SEG[paso]}s)`:"Saltar";
  pauta.textContent=terminado
    ? "Partida terminada · ahora suena la canción entera."
    : `Intento ${paso+1} de ${MAX} · escuchás ${plural(SEG[Math.min(paso,MAX-1)],"segundo","segundos")}`;
  pintarPistas();
}

/* ---------- intentos ---------- */
function registrar(tipo,texto){
  intentos.push({tipo,texto});
  if(tipo==="bien") return finalizar(true);
  paso++;
  if(paso>=MAX) return finalizar(false);
  pintar(); detener(); guardarPartida();
}
function enviar(){
  const c=CANCIONES.find(x=>x.label===input.value.trim()); if(!c) return;
  input.value=""; btnEnviar.disabled=true; cerrarLista();
  if(c.label===actual.label) registrar("bien",c.label);
  else if(c.a===actual.a) registrar("artista",c.label);
  else registrar("mal",c.label);
}
function saltar(){registrar("salto","Salteado")}

/* Cierra la partida: estadísticas, guardado, archivo y ventana de resultado.
   Las estadísticas y el archivo cuentan solo el modo diario. */
function finalizar(gano){
  terminado=true;
  if(modo==="diario"){
    stats.jugadas++; if(gano){stats.ganadas++;stats.racha++}else{stats.racha=0}
    store.set("ea_stats",stats);
    archivar(gano);
  }
  guardarPartida();
  mostrarResultado(gano,true);
}

/* Solo dibuja: no toca estadísticas. Se usa también al restaurar una partida. */
function mostrarResultado(gano,abrir){
  detener(); pintar();
  zonaJuego.style.display="none"; zonaCerrada.hidden=false;
  const esDiario=modo==="diario";
  const elogios=["¡A la primera!","¡Bien ahí!","¡Buena oreja!","¡Zafaste!","¡Justito!","¡De pedo!"];
  $("#resTitulo").textContent=gano?elogios[Math.min(intentos.length,6)-1]:"Te faltó...";
  $("#resCancion").textContent=actual.label;
  $("#resEmojis").textContent=emojis();
  $("#stJugadas").textContent=stats.jugadas; $("#stGanadas").textContent=stats.ganadas; $("#stRacha").textContent=stats.racha;
  $("#btnOtra").hidden=esDiario;         /* en modo diario hay una sola por día */
  $("#notaManana").hidden=!esDiario;
  $("#nombre").value=nombre;
  estadoEnvio();
  estado.textContent="Ahora podés escuchar la canción completa.";
  btnPlay.disabled=!audio;
  if(abrir) abrirModal("modalResultado");
}
/* Un casillero por intento, siempre seis. Ojo: los emojis de color
   ocupan dos unidades en un string de JavaScript y el cuadrado blanco
   una sola, así que hay que rellenar contando elementos del array y no
   la longitud del texto. */
function emojis(){
  const m={salto:"⬛",mal:"🟥",artista:"🟨",bien:"🟩"};
  const c=intentos.map(i=>m[i.tipo]);
  while(c.length<MAX) c.push("⬜");
  return c.slice(0,MAX).join("");
}

/* ---------- nombre y resultados archivados ----------
   Cada partida terminada se archiva en el navegador y, si hay nube, se
   copia a Firestore para el ranking. El archivo local sigue existiendo:
   es lo que permite reintentar la subida si en el momento no había
   señal. Cada fila lleva "subido" para no mandarla dos veces. */
const escapar=t=>String(t==null?"":t)
  .replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* Los cinco campos que aceptan las reglas de Firestore, ni uno más.
   Una derrota viaja como intentos 0: en la tabla se lee X/6. */
const aFila=r=>({fecha:r.fecha,nombre:r.nombre||"",cancion:r.cancion,
                 intentos:r.gano?(r.intentos||0):0,marcas:r.marcas||[]});
const hayNube=()=>!!(window.Nube&&window.Nube.disponible);

function archivar(gano){
  const h=store.get("ea_resultados",[]);
  h.push({dia:diaPartida,fecha:new Date().toISOString(),nombre,
          cancion:actual.label,gano,intentos:gano?intentos.length:null,
          marcas:intentos.map(i=>i.tipo),subido:false});
  store.set("ea_resultados",h.slice(-200));
}

/* ---------- envío al ranking ----------
   Ya no sale nada solo: la partida se archiva acá y viaja recién cuando
   el jugador toca Enviar, con un nombre puesto. Si en ese momento no hay
   señal, queda pendiente y se puede reintentar. */
function ultimoResultado(){
  const h=store.get("ea_resultados",[]), u=h[h.length-1];
  return (u&&u.dia===diaPartida)?u:null;
}
function estadoEnvio(){
  const btn=$("#btnEnviarRanking"), aviso=$("#firmaAviso"),
        campo=$("#nombre"), firma=$("#nombre").closest(".firma");
  const u=modo==="diario"?ultimoResultado():null;
  btn.hidden=!u; firma.hidden=!u;
  if(!u){aviso.textContent="";return}
  if(u.subido){
    btn.disabled=true; btn.textContent="Enviado ✓"; campo.disabled=true;
    aviso.textContent=`Ya figurás en la tabla como "${u.nombre||"(sin nombre)"}".`;
    return;
  }
  campo.disabled=false;
  btn.disabled=!nombre; btn.textContent="Enviar al ranking";
  aviso.textContent=nombre?"Tocá Enviar para que tu resultado aparezca en la tabla."
                          :"Poné un nombre para poder enviar tu resultado.";
}
function enviarAlRanking(){
  const btn=$("#btnEnviarRanking"), aviso=$("#firmaAviso");
  const h=store.get("ea_resultados",[]), u=h[h.length-1];
  if(!u||u.dia!==diaPartida||u.subido||!nombre) return;
  u.nombre=nombre; store.set("ea_resultados",h);
  if(!hayNube()){
    aviso.innerHTML=htmlError("Sin conexión con la nube. Tu resultado quedó guardado: probá de nuevo en un rato.","no-signal.svg");
    return;
  }
  btn.disabled=true; btn.textContent="Enviando…";
  window.Nube.guardarResultado(aFila(u)).then(id=>{
    const h2=store.get("ea_resultados",[]);
    if(h2.length){h2[h2.length-1].subido=true; h2[h2.length-1].idNube=id; store.set("ea_resultados",h2)}
    filasRanking=null;               /* la tabla que teníamos quedó vieja */
    estadoEnvio();
  }).catch(e=>{
    btn.disabled=false; btn.textContent="Enviar al ranking";
    aviso.textContent="No se pudo enviar: "+e.message;
  });
}
$("#btnEnviarRanking").onclick=enviarAlRanking;
$("#nombre").addEventListener("input",e=>{
  nombre=e.target.value.trim();
  store.set("ea_nombre",nombre);
  estadoEnvio();
});

/* ---------- tabla de ranking ----------
   Dos vistas: la semana en curso y el acumulado de siempre.

   Puntaje: 6 puntos si la sacó al primer intento y uno menos por cada
   intento de más, hasta 1 punto en el sexto. Si no la sacó, cero.

   Sin nombre no se puntúa. No debería haber filas anónimas nuevas
   (el botón Enviar está apagado hasta que se escriba uno), pero si
   quedara alguna vieja, no entra en ninguna tabla. */
const TOPE=400;
const latTabla=$("#latTabla"), latEstado=$("#latEstado");
let vistaTabla="semana", filasRanking=null, filasSemana=null;

const puntosDe=n=>n>0?(MAX+1-n):0;

/* Lunes de esta semana, a las 00:00. La tabla semanal arranca ahí. */
function lunesDeEstaSemana(){
  const x=new Date(); x.setHours(0,0,0,0);
  x.setDate(x.getDate()-((x.getDay()+6)%7));   /* getDay: 0=domingo */
  return x;
}
function rotuloSemana(){
  const l=lunesDeEstaSemana(), v=new Date(l); v.setDate(v.getDate()+4);
  const d=x=>`${x.getDate()}/${x.getMonth()+1}`;
  return `Del ${d(l)} al ${d(v)}`;
}
const esHabil=iso=>{const d=new Date(iso).getDay(); return d>=1&&d<=5};
const conNombre=r=>String(r.nombre||"").trim().length>0;

/* ---------- traer los datos ----------
   Dos consultas: las últimas partidas para el histórico, y
   todo lo jugado desde el lunes para la semanal. La segunda va por
   rango de fechas porque una semana movida puede pasarse del tope. */
function traerRanking(forzar){
  if(filasRanking&&!forzar) return pintarRanking();
  if(!hayNube()){latEstado.innerHTML=htmlError("Sin conexión con la nube.","no-signal.svg"); latTabla.innerHTML="";return}
  escribirTablas("Cargando…","");
  Promise.all([
    window.Nube.listarResultados(TOPE),
    window.Nube.listarDesde(lunesDeEstaSemana().toISOString(),TOPE)
  ]).then(([todo,semana])=>{
    filasRanking=todo; filasSemana=semana; pintarRanking();
  }).catch(e=>{latEstado.innerHTML=htmlError(e.message,"no-signal.svg"); latTabla.innerHTML=""});
}
function escribirTablas(txt,html){
  latEstado.textContent=txt; latTabla.innerHTML=html;
}

/* ---------- armar cada vista ---------- */
function agrupar(filas){
  const por={};
  filas.filter(conNombre).forEach(r=>{
    const n=r.nombre.trim(), k=norm(n);
    const p=por[k]||(por[k]={nombre:n,jugadas:0,ganadas:0,puntos:0,suma:0});
    p.jugadas++; p.puntos+=puntosDe(r.intentos);
    if(r.intentos>0){p.ganadas++; p.suma+=r.intentos}
  });
  return Object.values(por).map(p=>Object.assign(p,{
    prom:p.ganadas?p.suma/p.ganadas:99,
    pct:p.jugadas?Math.round(p.ganadas/p.jugadas*100):0
  })).sort((a,b)=>b.puntos-a.puntos||b.ganadas-a.ganadas||a.prom-b.prom);
}
const filaGente=(p,i)=>
  `<div class="fila"><span class="pos">${i+1}</span>`+
  `<div class="quien"><div class="nom">${escapar(p.nombre)}</div>`+
  `<div class="detalle">${p.ganadas} de ${p.jugadas} · ${p.pct}%`+
  `${p.ganadas?` · promedio ${p.prom.toFixed(1)}`:""}</div></div>`+
  `<span class="marca ok">${p.puntos} <small>pts</small></span></div>`;

function armarTabla(v){
  if(v==="semana"){
    if(!filasSemana) return {txt:"Cargando…",html:""};
    const l=+lunesDeEstaSemana();
    const g=agrupar(filasSemana.filter(r=>+new Date(r.fecha)>=l&&esHabil(r.fecha)));
    return {
      txt:g.length?`${rotuloSemana()} · ${plural(g.length,"jugador","jugadores")}.`
                  :`${rotuloSemana()} · todavía no jugó nadie.`,
      html:g.map(filaGente).join("")
    };
  }
  if(!filasRanking) return {txt:"Cargando…",html:""};
  const g=agrupar(filasRanking);
  return {
    txt:g.length?`${plural(g.length,"jugador","jugadores")} · últimas ${TOPE} partidas.`
                :"Todavía no hay partidas en la tabla.",
    html:g.map(filaGente).join("")
  };
}

function pintarRanking(){
  const {txt,html}=armarTabla(vistaTabla);
  escribirTablas(txt,html);
  [["#latSemana","semana"],["#latTodo","todo"]]
    .forEach(([b,v])=>$(b).classList.toggle("activo",vistaTabla===v));
  $("#lateralSemana").textContent=rotuloSemana();
}
function verVista(v){vistaTabla=v; pintarRanking()}

/* ---------- el ranking, plegado al costado ----------
   Es la única tabla que hay: se encima sobre la página, no la
   corre, y arranca cerrada en cada carga. Se abre con la lengüeta
   del borde o con el trofeo de la cabecera, que hace de llave de
   luz: si está abierta, la cierra. */
function verLateral(mostrar){
  const lat=$("#lateral");
  const plegar = mostrar===undefined ? !lat.classList.contains("plegado") : !mostrar;
  lat.classList.toggle("plegado",plegar);
  $("#lateralLengueta").setAttribute("aria-expanded",String(!plegar));
  $("#btnTabla").setAttribute("aria-expanded",String(!plegar));
  if(!plegar) traerRanking(false);
}
/* Desde el resultado: la ventana estorba, se cierra. */
function mostrarLateral(){cerrarModal("modalResultado"); verLateral(true)}

/* ---------- la tabla del fin de semana ----------
   Debajo del cartel de cerrado va la semana que acaba de terminar,
   en solo lectura. El sábado y el domingo lunesDeEstaSemana() sigue
   apuntando al lunes de esa misma semana, así que se reutiliza la
   consulta y el armado de la vista semanal tal cual. Si la nube
   todavía no cargó, se vuelve a intentar cuando avise. */
let findePedido=false;
function pintarFinde(){
  const est=$("#findeEstado"), tab=$("#findeTabla");
  if(!est||!tab) return;
  if(!hayNube()){
    est.innerHTML=htmlError("Conectando con la nube…","no-signal.svg"); tab.innerHTML="";
    if(!findePedido){findePedido=true; window.addEventListener("nube:estado",()=>{if(cerradoHoy()) pintarFinde()},{once:true})}
    return;
  }
  est.textContent="Cargando…";
  window.Nube.listarDesde(lunesDeEstaSemana().toISOString(),TOPE).then(semana=>{
    filasSemana=semana;
    const {txt,html}=armarTabla("semana");
    est.textContent=txt; tab.innerHTML=html;
  }).catch(e=>{est.innerHTML=htmlError(e.message,"no-signal.svg"); tab.innerHTML=""});
}

/* ---------- 36: ganador de la semana pasada ----------
   Trae lo jugado desde el lunes anterior, se queda con lo que cayó
   dentro de esa semana (hábil), agrupa igual que la tabla y corona
   al primero. Si no hay datos o nadie sumó puntos, la leyenda no
   aparece. Espera a la nube si todavía no conectó. */
let ganadorPedido=false;
function mostrarGanador(){
  const el=$("#ganador");
  if(!el||el.textContent) return;
  if(!hayNube()){
    if(!ganadorPedido){ganadorPedido=true;
      window.addEventListener("nube:estado",e=>{if(e.detail.ok) mostrarGanador()},{once:true});}
    return;
  }
  const esteLunes=lunesDeEstaSemana();
  const lunesPasado=new Date(esteLunes); lunesPasado.setDate(lunesPasado.getDate()-7);
  window.Nube.listarDesde(lunesPasado.toISOString(),TOPE).then(filas=>{
    const g=agrupar(filas.filter(r=>{
      const f=+new Date(r.fecha);
      return f>=+lunesPasado&&f<+esteLunes&&esHabil(r.fecha);
    }));
    if(g.length&&g[0].puntos>0){
      /* Redacción neutra: gane quien gane, "por ganar la semana". El
         rango va del lunes al viernes de la semana que cerró, en dd-mm. */
      const viernesPasado=new Date(lunesPasado); viernesPasado.setDate(viernesPasado.getDate()+4);
      const ddmm=x=>`${String(x.getDate()).padStart(2,"0")}-${String(x.getMonth()+1).padStart(2,"0")}`;
      el.innerHTML=`Felicitaciones a <b>${escapar(g[0].nombre)}</b> por ganar la semana del ${ddmm(lunesPasado)} al ${ddmm(viernesPasado)}`;
      el.hidden=false;
    }
  }).catch(()=>{});
}
mostrarGanador();

$("#btnTabla").onclick=()=>verLateral();
$("#lateralLengueta").onclick=()=>verLateral();
$("#btnVerTabla").onclick=mostrarLateral;
$("#latActualizar").onclick=()=>traerRanking(true);
$("#latSemana").onclick=()=>verVista("semana");
$("#latTodo").onclick=()=>verVista("todo");

/* ---------- copiar y compartir ---------- */
/* La fecha sale del día de la partida, no del reloj del momento: si
   alguien copia su resultado pasada la medianoche, tiene que seguir
   diciendo el día que jugó. */
function fechaDeDia(n){
  const d=new Date(n*864e5);
  return [d.getUTCDate(),d.getUTCMonth()+1,d.getUTCFullYear()%100]
         .map(x=>String(x).padStart(2,"0")).join("/");
}
function textoResultado(){
  const gano=intentos.some(i=>i.tipo==="bien");
  const cuando=modo==="diario"?fechaDeDia(diaPartida):"(libre)";
  return `Escuchadle Argento ${cuando}\n🔉${emojis()} ${gano?intentos.length:"X"}/6\n${SITIO}`;
}
function avisar(btn,texto,original){
  btn.textContent=texto; setTimeout(()=>btn.textContent=original,1500);
}
function alPortapapeles(txt,btn,original){
  if(!navigator.clipboard) return avisar(btn,"No se pudo",original);
  navigator.clipboard.writeText(txt).then(()=>avisar(btn,"¡Copiado!",original),()=>avisar(btn,"No se pudo",original));
}
$("#btnCopiar").onclick=()=>alPortapapeles(textoResultado(),$("#btnCopiar"),"Copiar resultado");
$("#btnVerResultado").onclick=()=>abrirModal("modalResultado");

/* ---------- buscador ---------- */
let sel=-1, visibles=[];
const norm=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
function filtrar(){
  const q=norm(input.value.trim()); sel=-1;
  const usados=new Set(intentos.map(i=>i.texto));
  visibles=q.length<2?[]:CANCIONES.filter(c=>norm(c.label).includes(q)&&!usados.has(c.label)).slice(0,8);
  lista.innerHTML=visibles.map(c=>`<div role="option" data-id="${c.id}">${c.label}</div>`).join("");
  lista.classList.toggle("abierta",visibles.length>0);
  btnEnviar.disabled=!CANCIONES.some(c=>c.label===input.value.trim());
}
function elegirItem(id){input.value=CANCIONES[id].label;cerrarLista();btnEnviar.disabled=false;input.focus()}
function cerrarLista(){lista.classList.remove("abierta");lista.innerHTML="";visibles=[]}
lista.addEventListener("mousedown",e=>{const d=e.target.closest("[data-id]");if(d){e.preventDefault();elegirItem(+d.dataset.id)}});
input.addEventListener("input",filtrar);
input.addEventListener("blur",()=>setTimeout(cerrarLista,120));
input.addEventListener("keydown",e=>{
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();if(!visibles.length)return;
    sel=(sel+(e.key==="ArrowDown"?1:-1)+visibles.length)%visibles.length;
    [...lista.children].forEach((d,i)=>d.classList.toggle("sel",i===sel));}
  else if(e.key==="Enter"){e.preventDefault();if(sel>=0)elegirItem(visibles[sel].id);else if(!btnEnviar.disabled)enviar()}
  else if(e.key==="Escape"){e.stopPropagation();cerrarLista()}
});

/* ---------- eventos ---------- */
btnPlay.onclick=reproducir; btnSaltar.onclick=saltar; btnEnviar.onclick=enviar;
$("#btnOtra").onclick=()=>nuevaPartida();
function setModo(m){
  modo=m;
  $("#badgeLibre").hidden=m!=="libre";
  nuevaPartida();
}
$("#badgeLibre").hidden=modo!=="libre";
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){const m=modalAbierto(); if(m) cerrarModal(m.id); return}
  const escribiendo=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if(e.code==="Space"&&!escribiendo&&!modalAbierto()){e.preventDefault();reproducir()}
});


/* ---------- panel de administración ----------
   El panel vive aparte, en Escuchadle/admin (mismo origen, misma
   contraseña). Cinco toques sobre el título llevan para allá; no hay
   nada de eso embebido en esta página. */
let clics=0, relojClics=null;
$("#titulo").addEventListener("click",()=>{
  clearTimeout(relojClics);
  relojClics=setTimeout(()=>{clics=0},2000);
  if(++clics>=5){clics=0;clearTimeout(relojClics);window.open("admin/","_blank","noopener")}
});

nuevaPartida();
