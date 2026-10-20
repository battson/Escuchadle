/* Escuchadle Argento - logica del juego.
   Solo modo libre: una canción al azar por partida, sin ranking ni puntos.
   Depende de: config.js (YT_API_KEY) y catalogo.js (CANCIONES, que es un
   respaldo: si la nube carga, manda lo publicado en escuchadle/catalogo
   vía nube.js, evento "nube:catalogo"). Si Firebase no está, el juego
   funciona igual con js/catalogo.js. */

/* ---------- estado ---------- */
const SEG=[1,2,4,7,11,16], MAX=6;
/* Dirección pública del juego: va en el texto que se copia para compartir.
   Si algún día cambia el dominio, se toca solo acá. */
const SITIO="https://battson.github.io/Escuchadle/";
let actual=null, intentos=[], paso=0, terminado=false, audio=null, timer=null, raf=null;

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

/* ---------- vista clásica (1.0) / 2.0 ----------
   Alterna qué hoja de estilos carga la página entera: la 2.0
   (glassmorphism) o la 1.0 guardada tal cual en css/clasico.css. El
   script inline del <head> ya la eligió antes de pintar según lo
   guardado; acá solo hace falta poder cambiarla. */
const HOJA_20="css/estilos.css?v=25", HOJA_CLASICA="css/clasico.css?v=1";
function vistaActual(){return document.documentElement.dataset.vista==="clasica"?"clasica":"2.0"}
$("#btnVista").onclick=()=>{
  const nuevo=vistaActual()==="clasica"?"2.0":"clasica";
  if(nuevo==="clasica") document.documentElement.dataset.vista="clasica";
  else delete document.documentElement.dataset.vista;
  $("#hojaEstilos").href=nuevo==="clasica"?HOJA_CLASICA:HOJA_20;
  try{localStorage.setItem("ea_vista",nuevo)}catch{}
  $("#btnVista").textContent=nuevo==="clasica"?"Vista 2.0":"Vista clásica";
};
$("#btnVista").textContent=vistaActual()==="clasica"?"Vista 2.0":"Vista clásica";

/* La primera vez que alguien abre el juego, las reglas se muestran solas.
   Después queda el "?" de la cabecera para volver a leerlas. */
if(!store.get("ea_ayuda_vista",false)){
  abrirModal("modalAyuda");
  store.set("ea_ayuda_vista",true);
}


/* ---------- catálogo en la nube ----------
   CANCIONES arranca con lo que trae js/catalogo.js (respaldo). Si hay un
   espejo guardado de la última vez que llegó la nube, se aplica ya; y
   cuando Firestore avisa, se reemplaza el array en el lugar, así todo lo
   que apunta a CANCIONES sigue valiendo. El sorteo y el buscador usan el
   catálogo entero. */
const CLAVE_CAT="ea_nube_catalogo";
let catNube=store.get(CLAVE_CAT,null);   /* {canciones, actualizado} */
let catSucio=false;                      /* hay cambios del panel sin publicar */

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

/* La partida en curso no se toca cuando llega el catálogo: la canción ya
   elegida sigue siendo la misma aunque el array se haya reemplazado. */
window.addEventListener("nube:catalogo",e=>{
  const cat=e.detail;
  if(!cat||cat.existe===false||catSucio) return;   /* no se pisan cambios sin publicar */
  aplicarCatalogo(cat);
  catNube={canciones:cat.canciones,actualizado:cat.actualizado};
  store.set(CLAVE_CAT,catNube);
});

/* ---------- elección de canción ----------
   Siempre al azar y entre todo el catálogo. */
function elegir(){return CANCIONES[Math.floor(Math.random()*CANCIONES.length)]}

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

async function nuevaPartida(){
  detener(); cerrarModal("modalResultado");
  actual=elegir(); intentos=[]; paso=0; terminado=false; audio=null;
  zonaJuego.style.display="flex"; zonaCerrada.hidden=true;
  input.value=""; btnEnviar.disabled=true; btnPlay.disabled=true; btnSaltar.disabled=false;
  estado.textContent="Cargando canción…";
  pintar();

  try{
    const [r]=await Promise.all([resolver(actual),prepararClip(actual)]);
    await ytListo; yt.cueVideoById(r.yt); audio=r.yt;
    btnPlay.disabled=false;
    estado.textContent="¡Suerte!";
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
   segundos del intento actual. "play" y "pause" son acciones que el
   navegador siempre expone mientras haya un audio/video activo -pasarles
   setActionHandler(...,null) no los oculta, solo deshace un handler
   propio y el navegador vuelve a controlarlos él mismo-. Lo que sí evita
   el navegador es su manejo por defecto en cuanto le pasás una función
   real: acá se las deja sin efecto (no reanudan ni pausan nada), así el
   botón sigue visible en el widget pero no sirve para seguir escuchando
   fuera del límite del intento. Las demás acciones (seek, next, etc.) sí
   se pueden ocultar con null. Se llama una sola vez; algún navegador
   viejo puede no reconocer alguna acción, de ahí el try/catch. */
function desactivarControlesMediaSession(){
  if(!("mediaSession" in navigator)) return;
  ["play","pause","stop"].forEach(accion=>{
    try{navigator.mediaSession.setActionHandler(accion,()=>{})}catch{}
  });
  ["seekbackward","seekforward","seekto","previoustrack","nexttrack"].forEach(accion=>{
    try{navigator.mediaSession.setActionHandler(accion,null)}catch{}
  });
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
  vinilo.classList.add("gira"); btnPlay.classList.add("gira"); btnPlay.textContent="■"; btnPlay.setAttribute("aria-label","Parar"); estado.textContent="Cargando…";
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
  vinilo.classList.remove("gira"); btnPlay.classList.remove("gira"); btnPlay.textContent="▶"; btnPlay.setAttribute("aria-label","Escuchar");
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
  pintar(); detener();
}
function enviar(){
  const c=CANCIONES.find(x=>x.label===input.value.trim()); if(!c) return;
  input.value=""; btnEnviar.disabled=true; cerrarLista();
  if(c.label===actual.label) registrar("bien",c.label);
  else if(c.a===actual.a) registrar("artista",c.label);
  else registrar("mal",c.label);
}
function saltar(){registrar("salto","Salteado")}

/* Cierra la partida: estadísticas (solo se guardan en este navegador) y
   ventana de resultado. No hay ranking ni puntos. */
function finalizar(gano){
  terminado=true;
  stats.jugadas++; if(gano){stats.ganadas++;stats.racha++}else{stats.racha=0}
  store.set("ea_stats",stats);
  mostrarResultado(gano,true);
}

/* Solo dibuja: no toca estadísticas. */
function mostrarResultado(gano,abrir){
  detener(); pintar();
  zonaJuego.style.display="none"; zonaCerrada.hidden=false;
  const elogios=["¡A la primera!","¡Bien ahí!","¡Buena oreja!","¡Zafaste!","¡Justito!","¡De pedo!"];
  $("#resTitulo").textContent=gano?elogios[Math.min(intentos.length,6)-1]:"Te faltó...";
  $("#resCancion").textContent=actual.label;
  $("#resEmojis").textContent=emojis();
  $("#stJugadas").textContent=stats.jugadas; $("#stGanadas").textContent=stats.ganadas; $("#stRacha").textContent=stats.racha;
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

/* ---------- utilidades ---------- */
const escapar=t=>String(t==null?"":t)
  .replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));


/* ---------- copiar y compartir ---------- */
function textoResultado(){
  const gano=intentos.some(i=>i.tipo==="bien");
  return `Escuchadle Argento (libre)\n🔉${emojis()} ${gano?intentos.length:"X"}/6\n${SITIO}`;
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
