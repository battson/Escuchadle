/* Escuchadle Argento - logica del juego.
   Depende de: config.js (YT_API_KEY), dia.js (DIA) y catalogo.js (CANCIONES).
   Se apoya, si cargó, en nube.js (window.Nube + eventos "nube:dia" y
   "nube:estado"). Todo lo que toca la nube va con guarda: si Firebase
   no está, el juego funciona igual con lo que dice js/dia.js. */

/* ---------- estado ---------- */
const SEG=[1,2,4,7,11,16], MAX=6;
/* Dirección pública del juego: va en el texto que se copia para compartir.
   Si algún día cambia el dominio, se toca solo acá. */
const SITIO="https://battson.github.io/Escuchadle/";
let modo="diario", actual=null, intentos=[], paso=0, terminado=false, audio=null, timer=null, raf=null;
let diaPartida=0;   /* el día que corresponde a la partida en pantalla */

const $=s=>document.querySelector(s);
const vinilo=$("#vinilo"), barra=$("#barra"), desbloq=$("#desbloq"), progreso=$("#progreso"),
      tActual=$("#tActual"), tTotal=$("#tTotal"), btnPlay=$("#btnPlay"), estado=$("#estado"), cont=$("#intentos"),
      input=$("#busqueda"), lista=$("#lista"), btnSaltar=$("#btnSaltar"), btnEnviar=$("#btnEnviar"),
      zonaJuego=$("#zonaJuego"), zonaCerrada=$("#zonaCerrada"), contPistas=$("#pistas"),
      pauta=$("#pauta");

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
  if(id==="modalPanel"){try{sessionStorage.removeItem("ea_panel")}catch{}}
  if(!document.querySelector(".modal:not([hidden])")) document.documentElement.style.overflow="";
}
function modalAbierto(){return document.querySelector(".modal:not([hidden])")}
document.querySelectorAll("[data-cerrar]").forEach(b=>b.onclick=()=>cerrarModal(b.dataset.cerrar));
document.querySelectorAll(".modal").forEach(m=>{
  m.addEventListener("mousedown",e=>{if(e.target===m) cerrarModal(m.id)});   /* clic en el fondo */
});
$("#btnAyuda").onclick=()=>abrirModal("modalAyuda");

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
    refrescarPanel();
  }
},8000);

/* La nube manda: cuando llega una configuración distinta, se rehace la
   partida igual que cuando se cambiaba dia.js, pero al instante. */
window.addEventListener("nube:dia",e=>{
  const antes=dia();
  diaNube=e.detail; store.set(CLAVE_NUBE,diaNube);
  const ahora=dia();
  const cambio=["modo","cancion","salto","reinicio"].some(k=>antes[k]!==ahora[k]);
  if(cambio&&modo==="diario") nuevaPartida(); else refrescarPanel();
});
window.addEventListener("nube:estado",e=>{textoNube=e.detail.texto; refrescarPanel()});

/* ---------- elección de canción ---------- */
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
function ordenDiario(){const r=rng(20260101),a=CANCIONES.map(c=>c.id);for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function diaHoy(){const d=new Date();return Math.floor((d.getTime()-d.getTimezoneOffset()*6e4)/864e5)}
function cancionDelDia(){
  const d=dia();
  if(d.modo==="manual"&&d.cancion){
    const c=CANCIONES.find(x=>x.label===d.cancion);
    if(c) return c;      /* si el label ya no existe, se cae al automático */
  }
  const o=ordenDiario(), n=o.length;
  return CANCIONES[o[(((diaHoy()+d.salto)%n)+n)%n]];   /* módulo siempre positivo */
}
function elegir(){
  return modo==="diario"?cancionDelDia():CANCIONES[Math.floor(Math.random()*CANCIONES.length)];
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
  if(cerrado){detener(); cerrarModal("modalResultado")}
  return cerrado;
}

async function nuevaPartida(){
  detener(); cerrarModal("modalResultado");
  if(aplicarCierre()){estado.textContent="";refrescarPanel();return}

  /* Una partida sin terminar de un día anterior se da por perdida:
     cuenta como jugada, corta la racha y no se puede retomar. */
  const dejada=store.get(CLAVE_PARTIDA,null);
  if(dejada&&dejada.dia!==diaHoy()&&!dejada.terminado){
    stats.jugadas++; stats.racha=0; store.set("ea_stats",stats);
    borrarPartida();
  }

  actual=elegir(); intentos=[]; paso=0; terminado=false; audio=null; diaPartida=diaHoy();
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
  if(terminado) mostrarResultado(intentos.some(i=>i.tipo==="bien"),$("#modalPanel").hidden);

  try{
    const r=await resolver(actual);
    await ytListo; yt.cueVideoById(r.yt); audio=r.yt;
    btnPlay.disabled=false;
    estado.textContent=terminado?"Ahora podés escuchar la canción completa."
      :(modo==="diario"?"Canción del día. ¡Suerte!":"Modo libre.");
  }catch(e){
    estado.textContent=e.message.startsWith("Falta")?e.message:"No encontré el video de esta canción. Probá otra.";
    btnSaltar.disabled=true;
  }
  refrescarPanel();
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
function reproducir(){
  if(!audio||!yt) return;
  if(sonando){detener();return}
  if(terminado){const d=duracion(); limite=d||600; fijarEscala(d||16)}
  else {limite=SEG[paso]; fijarEscala(16)}
  sonando=true;
  yt.seekTo(0,true); yt.playVideo();
  vinilo.classList.add("gira"); btnPlay.textContent="■ Parar"; estado.textContent="Cargando…";
}
function onYtEstado(e){
  if(e.data===YT.PlayerState.PLAYING&&sonando){
    estado.textContent="";
    /* Recién ahora YouTube sabe cuánto dura: si es la canción entera,
       se corrige la escala con el dato real. */
    if(terminado){const d=duracion(); if(d&&Math.abs(d-limite)>1){limite=d; fijarEscala(d)}}
    clearTimeout(timer); timer=setTimeout(detener,limite*1000);
    const t0=performance.now();
    const tick=()=>{const t=Math.min((performance.now()-t0)/1000,limite);
      progreso.style.width=(Math.min(t,escala)/escala*100)+"%"; tActual.textContent=reloj(t);
      raf=requestAnimationFrame(tick)};
    cancelAnimationFrame(raf); tick();
  }
  if(e.data===YT.PlayerState.ENDED) detener();
}
function detener(){
  clearTimeout(timer); cancelAnimationFrame(raf); sonando=false;
  if(yt&&yt.pauseVideo) yt.pauseVideo();
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
  if(c.id===actual.id) registrar("bien",c.label);
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
  refrescarPanel();
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
    aviso.textContent="Sin conexión con la nube. Tu resultado quedó guardado: probá de nuevo en un rato.";
    return;
  }
  btn.disabled=true; btn.textContent="Enviando…";
  window.Nube.guardarResultado(aFila(u)).then(id=>{
    const h2=store.get("ea_resultados",[]);
    if(h2.length){h2[h2.length-1].subido=true; h2[h2.length-1].idNube=id; store.set("ea_resultados",h2)}
    filasRanking=null;               /* la tabla que teníamos quedó vieja */
    estadoEnvio(); refrescarPanel();
  }).catch(e=>{
    btn.disabled=false; btn.textContent="Enviar al ranking";
    aviso.textContent="No se pudo enviar: "+e.message;
  });
}
$("#btnEnviarRanking").onclick=enviarAlRanking;
$("#nombre").addEventListener("input",e=>{
  nombre=e.target.value.trim();
  store.set("ea_nombre",nombre);
  estadoEnvio(); refrescarPanel();
});

/* ---------- tabla de ranking ----------
   Tres vistas, y las tres se dibujan igual: la ventana del trofeo y el
   panel lateral comparten el mismo HTML y la misma vista elegida.

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
/* De la fecha ISO al mismo número de día que usa el juego. */
function diaDeFecha(iso){
  const d=new Date(iso);
  return Number.isFinite(d.getTime())?Math.floor((d.getTime()-d.getTimezoneOffset()*6e4)/864e5):null;
}
const esHabil=iso=>{const d=new Date(iso).getDay(); return d>=1&&d<=5};
const conNombre=r=>String(r.nombre||"").trim().length>0;

function tiraDe(marcas){
  const m={salto:"⬛",mal:"🟥",artista:"🟨",bien:"🟩"};
  const c=(Array.isArray(marcas)?marcas:[]).map(x=>m[x]||"⬜");
  while(c.length<MAX) c.push("⬜");
  return c.slice(0,MAX).join("");
}

/* ---------- traer los datos ----------
   Dos consultas: las últimas partidas para "hoy" y el histórico, y
   todo lo jugado desde el lunes para la semanal. La segunda va por
   rango de fechas porque una semana movida puede pasarse del tope. */
function traerRanking(forzar){
  if(filasRanking&&!forzar) return pintarRanking();
  if(!hayNube()){escribirTablas("Sin conexión con la nube.","");return}
  escribirTablas("Cargando…","");
  Promise.all([
    window.Nube.listarResultados(TOPE),
    window.Nube.listarDesde(lunesDeEstaSemana().toISOString(),TOPE)
  ]).then(([todo,semana])=>{
    filasRanking=todo; filasSemana=semana; pintarRanking();
  }).catch(e=>escribirTablas(e.message,""));
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
  if(v==="hoy"){
    if(!filasRanking) return {txt:"Cargando…",html:""};
    /* Primero los que acertaron, de menos intentos a más; entre iguales
       gana el que llegó antes. Los que no la sacaron van al final. */
    const hoy=filasRanking.filter(r=>diaDeFecha(r.fecha)===diaHoy()&&conNombre(r)).sort((a,b)=>{
      const ga=a.intentos>0, gb=b.intentos>0;
      if(ga!==gb) return ga?-1:1;
      if(ga&&a.intentos!==b.intentos) return a.intentos-b.intentos;
      return String(a.fecha).localeCompare(String(b.fecha));
    });
    return {
      txt:hoy.length?`${plural(hoy.length,"partida jugada","partidas jugadas")} hoy.`
                    :"Todavía no jugó nadie. Estrenala vos.",
      html:hoy.map((r,i)=>
        `<div class="fila"><span class="pos">${i+1}</span>`+
        `<div class="quien"><div class="nom">${escapar(r.nombre)}</div>`+
        `<div class="tira">${tiraDe(r.marcas)}</div></div>`+
        `<span class="marca ${r.intentos>0?"ok":"no"}">${r.intentos>0?r.intentos+"/6":"X/6"}`+
        `<small>${puntosDe(r.intentos)} pts</small></span></div>`
      ).join("")
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
  [["#latSemana","semana"],["#latHoy","hoy"],["#latTodo","todo"]]
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
/* Desde el resultado o el cartel del finde: la ventana estorba, se cierra. */
function mostrarLateral(){cerrarModal("modalResultado"); verLateral(true)}

$("#btnTabla").onclick=()=>verLateral();
$("#lateralLengueta").onclick=()=>verLateral();
$("#btnVerTabla").onclick=mostrarLateral;
$("#btnFindeTabla").onclick=mostrarLateral;
$("#latActualizar").onclick=()=>traerRanking(true);
$("#latSemana").onclick=()=>verVista("semana");
$("#latHoy").onclick=()=>verVista("hoy");
$("#latTodo").onclick=()=>verVista("todo");

/* ---------- sugerencias ---------- */
const sugNombre=$("#sugNombre"), sugMensaje=$("#sugMensaje"),
      btnSugEnviar=$("#btnSugEnviar"), sugAviso=$("#sugAviso");

function abrirSugerir(){
  sugAviso.textContent=""; sugMensaje.value="";
  sugNombre.value=nombre; $("#sugFirmado").checked=true;
  btnSugEnviar.textContent="Enviar";
  refrescarSug(); abrirModal("modalSugerir");
  setTimeout(()=>sugMensaje.focus(),60);
}
function refrescarSug(){
  const anon=$("#sugAnonimo").checked;
  sugNombre.disabled=anon;
  sugNombre.placeholder=anon?"Va como anónimo":"Tu nombre";
  const hay=sugMensaje.value.trim().length>1;
  btnSugEnviar.disabled=!hay||(!anon&&!sugNombre.value.trim());
  if(!hay) sugAviso.textContent="Escribí un mensaje.";
  else if(!anon&&!sugNombre.value.trim()) sugAviso.textContent="Poné tu nombre, o elegí anónimo.";
  else sugAviso.textContent=`Quedan ${600-sugMensaje.value.length} caracteres.`;
}
function enviarSugerencia(){
  if(btnSugEnviar.disabled) return;
  const anon=$("#sugAnonimo").checked;
  if(!hayNube()){sugAviso.textContent="Sin conexión con la nube. Probá de nuevo en un rato.";return}
  btnSugEnviar.disabled=true; btnSugEnviar.textContent="Enviando…";
  window.Nube.guardarSugerencia({
    fecha:new Date().toISOString(),
    nombre:anon?"":sugNombre.value.trim(),
    mensaje:sugMensaje.value.trim()
  }).then(()=>{
    btnSugEnviar.textContent="¡Gracias!";
    sugAviso.textContent="Tu mensaje llegó.";
    setTimeout(()=>cerrarModal("modalSugerir"),1200);
  }).catch(e=>{
    btnSugEnviar.disabled=false; btnSugEnviar.textContent="Enviar";
    sugAviso.textContent="No se pudo enviar: "+e.message;
  });
}
$("#btnSugerir").onclick=abrirSugerir;
$("#btnFindeSugerir").onclick=abrirSugerir;
$("#btnSugEnviar").onclick=enviarSugerencia;
sugMensaje.addEventListener("input",refrescarSug);
sugNombre.addEventListener("input",refrescarSug);
$("#sugFirmado").onchange=refrescarSug;
$("#sugAnonimo").onchange=refrescarSug;

/* ---------- panel: sugerencias recibidas ---------- */
const sugLista=$("#sugLista"), estadoSug=$("#estadoSug");
function cargarSugerencias(){
  if(!hayNube()){estadoSug.textContent="Sin conexión con la nube.";return}
  estadoSug.textContent="Cargando…";
  window.Nube.listarSugerencias(100).then(ss=>{
    estadoSug.textContent=ss.length?`${plural(ss.length,"mensaje","mensajes")}.`:"Todavía no hay mensajes.";
    sugLista.innerHTML=ss.map(x=>{
      const cuando=(x.fecha||"").slice(0,10).split("-").reverse().join("/");
      return `<div class="vf"><span class="id">${escapar(cuando)}</span>`+
             `<div><div class="pedido">${escapar(x.nombre)||"<i>anónimo</i>"}</div>`+
             `<div class="hallado">${escapar(x.mensaje)}</div></div>`+
             `<button data-sug="${escapar(x.id)}" title="Borrar este mensaje">✕</button></div>`;
    }).join("");
  }).catch(e=>{estadoSug.textContent=e.message});
}
$("#btnSugActualizar").onclick=cargarSugerencias;
sugLista.addEventListener("click",e=>{
  const b=e.target.closest("[data-sug]"); if(!b) return;
  b.disabled=true;
  window.Nube.borrarSugerencia(b.dataset.sug)
    .then(()=>{b.closest(".vf").remove(); estadoSug.textContent="Mensaje borrado."})
    .catch(err=>{b.disabled=false; estadoSug.textContent=err.message});
});

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
  $("#modoDiario").classList.toggle("activo",m==="diario");
  $("#modoLibre").classList.toggle("activo",m==="libre");
  $("#badgeLibre").hidden=m!=="libre";
  nuevaPartida();
}
$("#modoDiario").onclick=()=>setModo("diario"); $("#modoLibre").onclick=()=>setModo("libre");
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){const m=modalAbierto(); if(m) cerrarModal(m.id); return}
  const escribiendo=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if(e.code==="Space"&&!escribiendo&&!modalAbierto()){e.preventDefault();reproducir()}
});

/* ---------- panel reservado ----------
   Cinco toques sobre el título, con no más de 2 segundos entre uno y otro. */
let clics=0, relojClics=null;
$("#titulo").addEventListener("click",()=>{
  clearTimeout(relojClics);
  relojClics=setTimeout(()=>{clics=0},2000);
  if(++clics>=5){clics=0;clearTimeout(relojClics);pedirClave()}
});

/* Una tranquera, no una cerradura: la clave viaja en el JavaScript y
   cualquiera que abra el código la ve. Alcanza para que un curioso no
   entre de casualidad. Lo que protege la base son las reglas de
   Firestore. */
const CLAVE_PANEL="159357";
const admin=()=>{try{return sessionStorage.getItem("ea_admin")==="1"}catch{return false}};
function pedirClave(){
  if(admin()) return abrirPanel();
  $("#claveEntrada").value=""; $("#claveAviso").textContent="";
  abrirModal("modalClave");
  setTimeout(()=>$("#claveEntrada").focus(),60);
}
function probarClave(){
  if($("#claveEntrada").value.trim()===CLAVE_PANEL){
    try{sessionStorage.setItem("ea_admin","1")}catch{}
    cerrarModal("modalClave"); abrirPanel();
  }else{
    $("#claveAviso").textContent="No es esa.";
    $("#claveEntrada").select();
  }
}
$("#btnClave").onclick=probarClave;
$("#claveEntrada").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();probarClave()}});
function abrirPanel(){
  refrescarPanel();
  abrirModal("modalPanel");
  irASeccion(seccionActual);
  try{sessionStorage.setItem("ea_panel","1")}catch{}
}

/* ---------- panel: navegación por secciones ----------
   Columna de secciones a la izquierda, contenido a la derecha. En
   pantallas angostas la columna sale de la fila y se convierte en un
   cajón que se abre con el botón de las tres rayas. */
let seccionActual="dia";
function irASeccion(id){
  seccionActual=id;
  document.querySelectorAll("#panelNav [data-ir]").forEach(b=>b.classList.toggle("activo",b.dataset.ir===id));
  document.querySelectorAll("#panelCont .panel-sec").forEach(x=>{x.hidden=x.dataset.sec!==id});
  $("#panelCont").scrollTop=0;
  cajon(false);
  if(id==="ranking") cargarRanking();
  if(id==="sugerencias") cargarSugerencias();
}
function cajon(abrir){
  $("#panelNav").classList.toggle("abierto",abrir);
  $("#panelVelo").hidden=!abrir;
  $("#panelMenu").setAttribute("aria-expanded",String(abrir));
}
$("#panelNav").addEventListener("click",e=>{
  const b=e.target.closest("[data-ir]"); if(b) irASeccion(b.dataset.ir);
});
$("#panelMenu").onclick=()=>cajon($("#panelVelo").hidden);
$("#panelVelo").onclick=()=>cajon(false);

/* ---------- panel: interruptores de prueba ---------- */
$("#swFinde").onchange=e=>{local.saltearFinde=e.target.checked; guardarLocal(); nuevaPartida()};

/* ---------- panel: canción del día ---------- */
const selCancion=$("#selCancion");
selCancion.innerHTML=CANCIONES.map(c=>`<option value="${c.label.replace(/"/g,"&quot;")}">${c.label}</option>`).join("");

/* Publica la configuración nueva. Se aplica acá en el acto para no
   quedar esperando a la red, y en paralelo sale para todos. Firestore
   guarda la escritura si en ese momento no hay señal y la manda sola
   cuando vuelve, así que no hace falta reintentar a mano. */
function ajustarDia(cambios){
  const d=Object.assign({},dia(),cambios);
  const cfg={modo:d.modo,
             cancion:d.modo==="manual"?d.cancion:"",
             salto:d.modo==="manual"?0:d.salto,
             reinicio:d.reinicio};
  diaNube=cfg; store.set(CLAVE_NUBE,cfg);
  if(hayNube()){
    textoNube="Publicando…";
    window.Nube.publicarDia(cfg)
      .then(()=>{textoNube="Publicado para todos.";refrescarPanel()})
      .catch(err=>{textoNube="No se pudo publicar: "+err.message;refrescarPanel()});
  }else{
    textoNube="Sin nube: el cambio quedó solo en esta computadora.";
  }
  if(modo==="diario") nuevaPartida(); else refrescarPanel();
}
$("#diaAuto").onclick=()=>ajustarDia({modo:"auto"});
/* Sortea un corrimiento nuevo hasta que hoy caiga otra canción. */
$("#btnSortear").onclick=()=>{
  const n=CANCIONES.length;
  if(n<2) return;
  const actualLabel=cancionDelDia().label;
  const base=dia().salto;
  let salto=base;
  for(let i=0;i<40&&(salto===base||nombreConSalto(salto)===actualLabel);i++)
    salto=Math.floor(Math.random()*n);
  ajustarDia({modo:"auto",salto});
};
function nombreConSalto(salto){
  const o=ordenDiario(), n=o.length;
  return CANCIONES[o[(((diaHoy()+salto)%n)+n)%n]].label;
}
$("#diaManual").onclick=()=>ajustarDia({modo:"manual",cancion:selCancion.value||CANCIONES[0].label});
selCancion.onchange=()=>ajustarDia({modo:"manual",cancion:selCancion.value});
$("#btnReiniciar").onclick=()=>{
  borrarPartida();
  ajustarDia({reinicio:dia().reinicio+1});
};
function textoDia(){
  const d=dia();
  return "const DIA = {\n"+
    `  modo: ${JSON.stringify(d.modo)},\n`+
    `  cancion: ${JSON.stringify(d.modo==="manual"?d.cancion:"")},\n`+
    `  salto: ${d.modo==="manual"?0:d.salto},\n`+
    `  reinicio: ${d.reinicio}\n};`;
}
$("#btnCopiarDia").onclick=()=>alPortapapeles(textoDia(),$("#btnCopiarDia"),"Copiar respaldo");

/* ---------- panel: partida y resultados ---------- */
$("#btnBorrarPartida").onclick=()=>{
  borrarPartida();
  if(modo==="diario") nuevaPartida(); else refrescarPanel();
};
$("#btnCopiarResultados").onclick=()=>
  alPortapapeles(JSON.stringify(store.get("ea_resultados",[]),null,2),$("#btnCopiarResultados"),"Copiar como JSON");

/* ---------- panel: ranking en la nube ----------
   La tabla no se muestra en el juego todavía: se mira y se corrige
   solo desde acá. */
const rankLista=$("#rankLista"), estadoRanking=$("#estadoRanking");

function cargarRanking(){
  if(!hayNube()){estadoRanking.textContent="Sin conexión con la nube.";return}
  estadoRanking.textContent="Cargando…";
  window.Nube.listarResultados(60).then(rs=>{
    estadoRanking.textContent=rs.length?`${rs.length} partida(s) en la nube.`:"La tabla está vacía.";
    rankLista.innerHTML=rs.map(r=>{
      const marca=r.intentos?`${r.intentos}/6`:"X/6";
      return `<div class="vf"><span class="id">${escapar((r.fecha||"").slice(0,10))}</span>`+
             `<div><div class="pedido">${escapar(r.nombre)||"(sin nombre)"} · ${marca}</div>`+
             `<div class="hallado">${escapar(r.cancion)}</div></div>`+
             `<button data-borrar="${escapar(r.id)}" title="Borrar esta fila">✕</button></div>`;
    }).join("");
  }).catch(e=>{estadoRanking.textContent=e.message});
}
$("#btnRanking").onclick=cargarRanking;

rankLista.addEventListener("click",e=>{
  const b=e.target.closest("[data-borrar]"); if(!b) return;
  b.disabled=true;
  window.Nube.borrarResultado(b.dataset.borrar)
    .then(()=>{b.closest(".vf").remove(); estadoRanking.textContent="Fila borrada."})
    .catch(err=>{b.disabled=false; estadoRanking.textContent=err.message});
});

$("#btnVaciarRanking").onclick=()=>{
  if(!hayNube()) return;
  if(!confirm("¿Borrar todos los resultados de la nube? No se pueden recuperar.")) return;
  estadoRanking.textContent="Borrando…";
  window.Nube.vaciarResultados().then(n=>{
    rankLista.innerHTML="";
    estadoRanking.textContent=`Tabla vaciada (${n} fila(s)).`;
  }).catch(e=>{estadoRanking.textContent=e.message});
};

/* Sube las partidas que quedaron guardadas en este navegador y todavía
   no llegaron a la nube: las de antes de todo esto, y las que fallaron. */
async function subirPendientes(){
  const btn=$("#btnSubirPendientes");
  if(!hayNube()) return avisar(btn,"Sin nube","Subir pendientes");
  const h=store.get("ea_resultados",[]);
  if(!h.some(r=>!r.subido)) return avisar(btn,"No hay","Subir pendientes");
  btn.disabled=true; btn.textContent="Subiendo…";
  let n=0, error="";
  for(const r of h){
    if(r.subido) continue;
    try{ r.idNube=await window.Nube.guardarResultado(aFila(r)); r.subido=true; n++; }
    catch(e){ error=e.message; break; }
  }
  store.set("ea_resultados",h);
  btn.disabled=false; btn.textContent="Subir pendientes";
  estadoRanking.textContent=error?`Subí ${n} y se cortó: ${error}`:`${n} partida(s) subida(s).`;
  refrescarPanel(); cargarRanking();
}
$("#btnSubirPendientes").onclick=subirPendientes;

/* Deja el panel al día con el estado real del juego. */
function refrescarPanel(){
  const d=dia();
  $("#swFinde").checked=!!local.saltearFinde;
  $("#diaAuto").checked=d.modo==="auto";
  $("#diaManual").checked=d.modo==="manual";
  selCancion.disabled=d.modo!=="manual";
  $("#btnSortear").disabled=d.modo!=="auto";
  if(d.modo==="manual"&&d.cancion) selCancion.value=d.cancion;
  else if(actual&&modo==="diario") selCancion.value=actual.label;
  $("#estadoNube").textContent=textoNube;
  $("#estadoNube").className="nube-estado"+(hayNube()?" ok":"");
  $("#estadoDia").textContent=
    `salto ${d.salto} · reinicio ${d.reinicio} · hoy: ${cancionDelDia().label}`;
  $("#vistaDia").textContent=textoDia();

  const g=partidaGuardada();
  $("#estadoPartida").textContent=!g?"No hay partida guardada de hoy."
    :!sirve(g)?"Hay un guardado viejo que ya no aplica."
    :g.terminado?`Hoy ya jugaste: ${g.intentos.some(i=>i.tipo==="bien")?g.intentos.length+"/6":"X/6"}.`
    :`Partida en curso: ${g.paso} de 6.`;

  const h=store.get("ea_resultados",[]);
  const pend=h.filter(r=>!r.subido).length;
  $("#estadoResultados").textContent=h.length
    ? `${h.length} partida(s) archivada(s) acá${nombre?` como "${nombre}"`:" sin nombre"}` +
      (pend?` · ${pend} sin subir a la nube.`:" · todas subidas.")
    : "Todavía no hay partidas archivadas.";
}

/* Mientras dure la pestaña el panel sigue abierto: no hay que golpear
   el título cinco veces después de cada recarga. */
try{if(sessionStorage.getItem("ea_panel")&&admin()) abrirPanel()}catch{}

/* ---------- verificación del catálogo ---------- */
const vLista=$("#verifLista"), vEstado=$("#verifEstado");
let resueltos={};
const PAUSA=600;   /* ms entre búsquedas: evita el 429 */
let corriendo=false;

async function verificar(){
  if(corriendo) return;
  if(!YT_API_KEY&&!CANCIONES.some(c=>c.yt)){vEstado.textContent="Sin clave de API ni IDs cargados.";return}
  corriendo=true; vLista.innerHTML="";
  $("#btnVerificar").textContent="Parar";
  let n=0, pendientes=0, cortado=null;

  for(const c of CANCIONES){
    if(!corriendo){cortado="Parado. Volvé a tocar Verificar para seguir donde quedó.";break}
    const fila=document.createElement("div"); fila.className="vf";
    fila.innerHTML=`<a href="#" data-p="${c.id}" title="Abrir en YouTube" style="color:var(--crema);text-decoration:none">▶</a><div><div class="pedido">${c.label}</div><div class="hallado">buscando…</div></div><span class="id"></span>`;
    vLista.appendChild(fila);
    const nuevo=!c.yt&&!cache[c.label];
    try{
      const r=await resolver(c); resueltos[c.id]=r;
      fila.classList.add(MALAS.test(r.titulo)?"dudoso":"ok");
      fila.querySelector(".hallado").textContent=`${r.canal} — ${r.titulo}`;
      fila.querySelector(".id").textContent=r.yt;
      const a=fila.querySelector("[data-p]");
      a.href="https://www.youtube.com/watch?v="+r.yt; a.target="_blank";
    }catch(e){
      fila.classList.add("error"); fila.querySelector(".hallado").textContent=e.message;
      if(e instanceof SinCuota){cortado="Cuota diaria agotada. Lo hecho quedó guardado; seguí mañana desde donde quedó.";break}
      pendientes++;
    }
    vEstado.textContent=`${++n}/${CANCIONES.length} revisadas`;
    if(nuevo) await dormir(PAUSA);   /* solo espera si consultó la API */
  }
  corriendo=false; $("#btnVerificar").textContent="Verificar";
  vEstado.textContent=cortado||`Listo: ${n}/${CANCIONES.length}${pendientes?` · ${pendientes} con problemas`:""}`;
}
$("#btnVerificar").onclick=()=>{corriendo?corriendo=false:verificar()};
$("#btnLimpiar").onclick=()=>{
  if(!confirm("¿Borrar los resultados guardados y volver a buscar todo?")) return;
  for(const k in cache) delete cache[k];
  guardarCache(); resueltos={}; vLista.innerHTML=""; vEstado.textContent="Caché borrada.";
};
$("#btnCatalogo").onclick=()=>{
  const txt="const CANCIONES = [\n"+CANCIONES.map(c=>{
    const id=c.yt||resueltos[c.id]?.yt;
    return `  {a:${JSON.stringify(c.a)}, t:${JSON.stringify(c.t)}${id?`, yt:${JSON.stringify(id)}`:""}${c.g?`, g:${JSON.stringify(c.g)}`:""}},`;
  }).join("\n")+"\n];";
  alPortapapeles(txt,$("#btnCatalogo"),"Copiar catálogo con IDs");
};

nuevaPartida();
