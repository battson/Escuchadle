/* Escuchadle Argento - logica del juego.
   Depende de: config.js (YT_API_KEY), dia.js (DIA) y catalogo.js (CANCIONES).
   Se apoya, si cargó, en nube.js (window.Nube + eventos "nube:dia" y
   "nube:estado"). Todo lo que toca la nube va con guarda: si Firebase
   no está, el juego funciona igual con lo que dice js/dia.js. */

/* ---------- estado ---------- */
const SEG=[1,2,4,7,11,16], MAX=6;
let modo="diario", actual=null, intentos=[], paso=0, terminado=false, audio=null, timer=null, raf=null;

const $=s=>document.querySelector(s);
const vinilo=$("#vinilo"), barra=$("#barra"), desbloq=$("#desbloq"), progreso=$("#progreso"),
      tActual=$("#tActual"), btnPlay=$("#btnPlay"), estado=$("#estado"), cont=$("#intentos"),
      input=$("#busqueda"), lista=$("#lista"), btnSaltar=$("#btnSaltar"), btnEnviar=$("#btnEnviar"),
      zonaJuego=$("#zonaJuego"), zonaCerrada=$("#zonaCerrada"), contPistas=$("#pistas");

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
  if(id==="modalPanel"){try{sessionStorage.removeItem("ea_panel")}catch{}}
  if(!document.querySelector(".modal:not([hidden])")) document.documentElement.style.overflow="";
}
function modalAbierto(){return document.querySelector(".modal:not([hidden])")}
document.querySelectorAll("[data-cerrar]").forEach(b=>b.onclick=()=>cerrarModal(b.dataset.cerrar));
document.querySelectorAll(".modal").forEach(m=>{
  m.addEventListener("mousedown",e=>{if(e.target===m) cerrarModal(m.id)});   /* clic en el fondo */
});
$("#btnAyuda").onclick=()=>abrirModal("modalAyuda");

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
   Cada intento fallido o salteado destapa una pista más. */
const PALABRAS=t=>t.split(/\s+/).filter(Boolean);
const LETRAS=t=>[...t].filter(ch=>/\p{L}/u.test(ch)).length;
const velar=t=>PALABRAS(t).map(p=>[...p].map((ch,i)=>i===0?ch:(/\p{L}/u.test(ch)?"\u2022":ch)).join("")).join(" ");

function pistasDe(c){
  const p=[];
  if(c.g) p.push({et:"Género",v:c.g});
  p.push({et:"Artista",v:velar(c.a),velado:true});
  p.push({et:"Título",v:`${PALABRAS(c.t).length} palabras · ${LETRAS(c.t)} letras`});
  p.push({et:"Artista",v:c.a});
  p.push({et:"Título",v:velar(c.t),velado:true});
  return p;
}
function pintarPistas(){
  if(!actual||paso===0){contPistas.hidden=true;contPistas.innerHTML="";return}
  const p=pistasDe(actual).slice(0,paso);
  if(!p.length){contPistas.hidden=true;return}
  contPistas.hidden=false;
  contPistas.innerHTML=p.map(x=>
    `<div class="pista"><span class="et">${x.et}</span><span class="vl${x.velado?" velado":""}">${x.v}</span></div>`
  ).join("");
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

async function nuevaPartida(){
  detener(); cerrarModal("modalResultado");
  actual=elegir(); intentos=[]; paso=0; terminado=false; audio=null;
  zonaJuego.style.display="flex"; zonaCerrada.hidden=true;
  input.value=""; btnEnviar.disabled=true; btnPlay.disabled=true; btnSaltar.disabled=false;
  estado.textContent="Cargando canción…";

  /* ¿Hay algo guardado de hoy que siga valiendo? */
  const g=modo==="diario"?partidaGuardada():null;
  if(sirve(g)){
    intentos=g.intentos; paso=g.paso||0; terminado=!!g.terminado;
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

/* ---------- reproducción ---------- */
let sonando=false, limite=0;
function reproducir(){
  if(!audio||!yt) return;
  if(sonando){detener();return}
  limite=terminado?600:SEG[paso]; sonando=true;
  yt.seekTo(0,true); yt.playVideo();
  vinilo.classList.add("gira"); btnPlay.textContent="■ Parar"; estado.textContent="Cargando…";
}
function onYtEstado(e){
  if(e.data===YT.PlayerState.PLAYING&&sonando){
    estado.textContent="";
    clearTimeout(timer); timer=setTimeout(detener,limite*1000);
    const t0=performance.now();
    const tick=()=>{const t=Math.min((performance.now()-t0)/1000,limite);
      progreso.style.width=(Math.min(t,16)/16*100)+"%"; tActual.textContent="0:"+String(Math.floor(t)).padStart(2,"0");
      raf=requestAnimationFrame(tick)};
    cancelAnimationFrame(raf); tick();
  }
  if(e.data===YT.PlayerState.ENDED) detener();
}
function detener(){
  clearTimeout(timer); cancelAnimationFrame(raf); sonando=false;
  if(yt&&yt.pauseVideo) yt.pauseVideo();
  vinilo.classList.remove("gira"); btnPlay.textContent="▶ Escuchar";
  progreso.style.width="0"; tActual.textContent="0:00";
}

/* ---------- pintar ---------- */
function pintar(){
  desbloq.style.width=(SEG[Math.min(paso,MAX-1)]/16*100)+"%";
  cont.innerHTML="";
  for(let i=0;i<MAX;i++){
    const it=intentos[i], d=document.createElement("div");
    d.className="intento"+(it?" "+it.tipo:"");
    d.innerHTML=`<span class="ic"></span><span>${it?it.texto:""}</span>`;
    cont.appendChild(d);
  }
  btnSaltar.textContent=paso<MAX-1?`Saltar (+${SEG[paso+1]-SEG[paso]}s)`:"Saltar";
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
  estado.textContent="Ahora podés escuchar la canción completa.";
  btnPlay.disabled=!audio;
  if(abrir) abrirModal("modalResultado");
}
function emojis(){
  const m={salto:"⬛",mal:"🟥",artista:"🟨",bien:"🟩"};
  let s=intentos.map(i=>m[i.tipo]).join(""); while(s.length<MAX*2) s+="⬜"; return s;
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
  h.push({dia:diaHoy(),fecha:new Date().toISOString(),nombre,
          cancion:actual.label,gano,intentos:gano?intentos.length:null,
          marcas:intentos.map(i=>i.tipo),subido:false});
  store.set("ea_resultados",h.slice(-200));
  subirUltimo();
}

/* Manda el último archivado y lo marca. Si falla, queda pendiente y se
   puede reintentar desde el panel: no se pierde nada. */
function subirUltimo(){
  const h=store.get("ea_resultados",[]), u=h[h.length-1];
  if(!u||u.subido||!hayNube()) return;
  window.Nube.guardarResultado(aFila(u)).then(id=>{
    const h2=store.get("ea_resultados",[]);
    if(h2.length){h2[h2.length-1].subido=true; h2[h2.length-1].idNube=id; store.set("ea_resultados",h2)}
    refrescarPanel();
  }).catch(()=>refrescarPanel());
}

/* Si escribe el nombre después de terminar, se lo ponemos al último resultado. */
let relojNombre=null;
function renombrarUltimo(){
  const h=store.get("ea_resultados",[]);
  if(!h.length||!terminado||modo!=="diario") return;
  const u=h[h.length-1];
  if(u.dia!==diaHoy()) return;
  u.nombre=nombre; store.set("ea_resultados",h);
  clearTimeout(relojNombre);
  relojNombre=setTimeout(sincronizarNombre,1200);   /* espera a que termine de tipear */
}

/* Las reglas no dejan modificar un resultado ya subido, solo crear y
   borrar. Renombrar es entonces: subir el nuevo y borrar el viejo. */
function sincronizarNombre(){
  const h=store.get("ea_resultados",[]), u=h[h.length-1];
  if(!u||!hayNube()) return;
  if(!u.subido) return subirUltimo();
  if(!u.idNube) return;
  const viejo=u.idNube;
  window.Nube.guardarResultado(aFila(u)).then(id=>{
    const h2=store.get("ea_resultados",[]);
    if(h2.length){h2[h2.length-1].idNube=id; store.set("ea_resultados",h2)}
    return window.Nube.borrarResultado(viejo);
  }).then(()=>refrescarPanel()).catch(()=>{});
}
$("#nombre").addEventListener("input",e=>{
  nombre=e.target.value.trim();
  store.set("ea_nombre",nombre);
  renombrarUltimo();
  refrescarPanel();
});

/* ---------- copiar y compartir ---------- */
function textoResultado(){
  const gano=intentos.some(i=>i.tipo==="bien");
  const quien=nombre?` — ${nombre}`:"";
  return `Escuchadle Argento ${modo==="diario"?"#"+diaHoy():"(libre)"}${quien}\n🔉${emojis()}\n${gano?intentos.length:"X"}/6`;
}
function avisar(btn,texto,original){
  btn.textContent=texto; setTimeout(()=>btn.textContent=original,1500);
}
function alPortapapeles(txt,btn,original){
  if(!navigator.clipboard) return avisar(btn,"No se pudo",original);
  navigator.clipboard.writeText(txt).then(()=>avisar(btn,"¡Copiado!",original),()=>avisar(btn,"No se pudo",original));
}
$("#btnCopiar").onclick=()=>alPortapapeles(textoResultado(),$("#btnCopiar"),"Copiar resultado");
$("#btnCompartir").onclick=()=>{
  const txt=textoResultado();
  if(navigator.share) navigator.share({title:"Escuchadle Argento",text:txt}).catch(()=>{});
  else alPortapapeles(txt,$("#btnCompartir"),"Compartir");
};
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
  if(++clics>=5){clics=0;clearTimeout(relojClics);abrirPanel()}
});
function abrirPanel(){
  refrescarPanel();
  cargarRanking();
  abrirModal("modalPanel");
  try{sessionStorage.setItem("ea_panel","1")}catch{}
}

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
try{if(sessionStorage.getItem("ea_panel")) abrirPanel()}catch{}

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
