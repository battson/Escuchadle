/* Escuchadle Argento - logica del juego.
   Depende de: config.js (YT_API_KEY) y catalogo.js (CANCIONES). */

/* ---------- estado ---------- */
const SEG=[1,2,4,7,11,16], MAX=6;
let modo="diario", actual=null, intentos=[], paso=0, terminado=false, audio=null, timer=null, raf=null;

const $=s=>document.querySelector(s);
const vinilo=$("#vinilo"), barra=$("#barra"), desbloq=$("#desbloq"), progreso=$("#progreso"),
      tActual=$("#tActual"), btnPlay=$("#btnPlay"), estado=$("#estado"), cont=$("#intentos"),
      input=$("#busqueda"), lista=$("#lista"), btnSaltar=$("#btnSaltar"), btnEnviar=$("#btnEnviar"),
      zonaJuego=$("#zonaJuego"), res=$("#resultado");

/* ticks de la barra */
SEG.slice(0,-1).forEach(s=>{const t=document.createElement("div");t.className="tick";t.style.left=(s/16*100)+"%";barra.appendChild(t);});

/* ---------- persistencia suave (si el navegador la permite) ---------- */
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}
};
let stats=store.get("ea_stats",{jugadas:0,ganadas:0,racha:0});

/* ---------- elección de canción ---------- */
function rng(seed){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}}
function ordenDiario(){const r=rng(20260101),a=CANCIONES.map(c=>c.id);for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function diaHoy(){const d=new Date();return Math.floor((d.getTime()-d.getTimezoneOffset()*6e4)/864e5)}
function elegir(){
  if(modo==="diario"){const o=ordenDiario();return CANCIONES[o[diaHoy()%o.length]]}
  return CANCIONES[Math.floor(Math.random()*CANCIONES.length)];
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
async function resolver(c){
  if(c.yt) return {yt:c.yt,titulo:c.label,canal:"ID fijado"};
  if(!YT_API_KEY) throw new Error("Falta ID de YouTube (yt) o clave de API");
  const q=encodeURIComponent(`${c.a} ${c.t}`);
  const r=await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q=${q}&key=${YT_API_KEY}`);
  if(!r.ok) throw new Error("API "+r.status);
  const d=await r.json(); const items=d.items||[];
  if(!items.length) throw new Error("sin resultados");
  items.sort((x,y)=>puntuar(c,y)-puntuar(c,x));
  const m=items[0];
  return {yt:m.id.videoId,titulo:m.snippet.title,canal:m.snippet.channelTitle};
}

async function nuevaPartida(){
  detener();
  actual=elegir(); intentos=[]; paso=0; terminado=false; audio=null;
  res.classList.remove("visible"); zonaJuego.style.display="flex";
  input.value=""; btnEnviar.disabled=true; btnPlay.disabled=true; btnSaltar.disabled=false;
  estado.textContent="Cargando canción…";
  pintar();
  try{
    const r=await resolver(actual);
    await ytListo; yt.cueVideoById(r.yt); audio=r.yt;
    btnPlay.disabled=false;
    estado.textContent=modo==="diario"?"Canción del día. ¡Suerte!":"Modo libre.";
  }catch(e){
    estado.textContent=e.message.startsWith("Falta")?e.message:"No encontré el video de esta canción. Probá otra.";
    btnSaltar.disabled=true;
  }
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
  if(c.id===actual.id) registrar("bien",c.label);
  else if(c.a===actual.a) registrar("artista",c.label);
  else registrar("mal",c.label);
}
function saltar(){registrar("salto","Salteado")}

function finalizar(gano){
  terminado=true; detener(); pintar();
  zonaJuego.style.display="none";
  stats.jugadas++; if(gano){stats.ganadas++;stats.racha++}else{stats.racha=0}
  store.set("ea_stats",stats);
  $("#resTitulo").textContent=gano?["¡A la primera!","¡Bien ahí!","¡Buena oreja!","¡Zafaste!","¡Justito!","¡De pedo!"][intentos.length-1]:"Te faltó...";
  $("#resCancion").textContent=actual.label;
  $("#resEmojis").textContent=emojis();
  $("#stJugadas").textContent=stats.jugadas; $("#stGanadas").textContent=stats.ganadas; $("#stRacha").textContent=stats.racha;
  res.classList.add("visible");
  estado.textContent="Ahora podés escuchar la canción completa.";
  btnPlay.disabled=false;
}
function emojis(){
  const m={salto:"⬛",mal:"🟥",artista:"🟨",bien:"🟩"};
  let s=intentos.map(i=>m[i.tipo]).join(""); while(s.length<MAX*2) s+="⬜"; return s;
}
function copiar(){
  const gano=intentos.some(i=>i.tipo==="bien");
  const txt=`Escuchadle Argento ${modo==="diario"?"#"+diaHoy():"(libre)"}\n🔉${emojis()}\n${gano?intentos.length:"X"}/6`;
  navigator.clipboard?.writeText(txt).then(()=>{$("#btnCopiar").textContent="¡Copiado!";setTimeout(()=>$("#btnCopiar").textContent="Copiar resultado",1500)});
}

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
  else if(e.key==="Escape")cerrarLista();
});

/* ---------- eventos ---------- */
btnPlay.onclick=reproducir; btnSaltar.onclick=saltar; btnEnviar.onclick=enviar;
$("#btnCopiar").onclick=copiar; $("#btnOtra").onclick=()=>{if(modo==="diario")setModo("libre");else nuevaPartida()};
function setModo(m){modo=m;$("#modoDiario").classList.toggle("activo",m==="diario");$("#modoLibre").classList.toggle("activo",m==="libre");nuevaPartida()}
$("#modoDiario").onclick=()=>setModo("diario"); $("#modoLibre").onclick=()=>setModo("libre");
document.addEventListener("keydown",e=>{if(e.code==="Space"&&document.activeElement!==input){e.preventDefault();reproducir()}});

/* ---------- verificación del catálogo ---------- */
const verif=$("#verif"), vLista=$("#verifLista"), vEstado=$("#verifEstado");
let resueltos={}, verificado=false;
$("#abrirVerif").onclick=e=>{e.preventDefault();verif.classList.add("visible");verif.scrollIntoView({behavior:"smooth"});if(!verificado)verificar()};
$("#cerrarVerif").onclick=()=>verif.classList.remove("visible");
async function verificar(){
  verificado=true; vLista.innerHTML=""; let n=0;
  if(!YT_API_KEY&&!CANCIONES.some(c=>c.yt)){vEstado.textContent="Sin clave de API ni IDs cargados.";return}
  for(const c of CANCIONES){
    const fila=document.createElement("div"); fila.className="vf";
    fila.innerHTML=`<a href="#" data-p="${c.id}" title="Abrir en YouTube" style="color:var(--crema);text-decoration:none">▶</a><div><div class="pedido">${c.label}</div><div class="hallado">buscando…</div></div><span class="id"></span>`;
    vLista.appendChild(fila);
    try{
      const r=await resolver(c); resueltos[c.id]=r;
      fila.classList.add(c.yt?"ok":MALAS.test(r.titulo)?"dudoso":"ok");
      fila.querySelector(".hallado").textContent=`${r.canal} — ${r.titulo}`;
      fila.querySelector(".id").textContent=r.yt;
      fila.querySelector("[data-p]").href="https://www.youtube.com/watch?v="+r.yt;
      fila.querySelector("[data-p]").target="_blank";
    }catch(e){
      fila.classList.add("error"); fila.querySelector(".hallado").textContent=e.message;
    }
    vEstado.textContent=`${++n}/${CANCIONES.length} revisadas`;
  }
}
$("#btnCatalogo").onclick=()=>{
  const txt="const CANCIONES = [\n"+CANCIONES.map(c=>{
    const id=c.yt||resueltos[c.id]?.yt;
    return `  {a:${JSON.stringify(c.a)}, t:${JSON.stringify(c.t)}${id?`, yt:${JSON.stringify(id)}`:""}},`;
  }).join("\n")+"\n];";
  navigator.clipboard?.writeText(txt).then(()=>{$("#btnCatalogo").textContent="¡Copiado!";setTimeout(()=>$("#btnCatalogo").textContent="Copiar catálogo con IDs",1500)});
};

nuevaPartida();
