/* Escuchadle Argento — panel de administración (2.0)
   Página aparte de la del juego, mismo origen y misma contraseña.
   Depende de los mismos respaldos y el mismo módulo de nube que el
   juego: ../js/catalogo.js (CANCIONES) y ../js/nube.js (window.Nube +
   eventos "nube:catalogo"/"nube:estado"). El juego es solo modo libre,
   sin ranking: el panel administra el catálogo y los clips. */

const $=s=>document.querySelector(s);
const bancoEl=id=>document.getElementById(id);
const store={
  get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}},
  del(k){try{localStorage.removeItem(k)}catch{}}
};
const escapar=t=>String(t==null?"":t)
  .replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const plural=(n,s,p)=>`${n} ${n===1?s:p}`;
const hayNube=()=>!!(window.Nube&&window.Nube.disponible);


function avisar(btn,texto,original){btn.textContent=texto; setTimeout(()=>btn.textContent=original,1500)}
function alPortapapeles(txt,btn,original){
  if(!navigator.clipboard) return avisar(btn,"No se pudo",original);
  navigator.clipboard.writeText(txt).then(()=>avisar(btn,"¡Copiado!",original),()=>avisar(btn,"No se pudo",original));
}

let seccionActual="catalogo";

/* ---------- clave ----------
   Una tranquera, no una cerradura: viaja en el JavaScript y cualquiera
   que abra el código la ve. Lo que protege la base son las reglas de
   Firestore. Misma clave y misma sessionStorage que usaba el panel
   embebido, así que una sesión ya abierta en la web del juego también
   vale acá. */
const CLAVE_PANEL="159357";
function entrar(){
  if($("#claveEntrada").value.trim()!==CLAVE_PANEL){
    $("#claveAviso").textContent="No es esa.";
    $("#claveEntrada").select();
    return;
  }
  try{sessionStorage.setItem("ea_admin","1")}catch{}
  mostrarPanel();
}
$("#btnClave").onclick=entrar;
$("#claveEntrada").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();entrar()}});
function mostrarPanel(){
  $("#claveCard").hidden=true;
  $("#panel").hidden=false;
  irASeccion(seccionActual);
  refrescarPanel();
}

/* ---------- navegación por secciones ----------
   Columna de secciones a la izquierda, contenido a la derecha. En
   pantallas angostas la columna sale de la fila y se convierte en un
   cajón que se abre con el botón de las tres rayas. */
function irASeccion(id){
  seccionActual=id;
  document.querySelectorAll("#panelNav [data-ir]").forEach(b=>b.classList.toggle("activo",b.dataset.ir===id));
  document.querySelectorAll("#panelCont .panel-sec").forEach(x=>{x.hidden=x.dataset.sec!==id});
  $("#panelCont").scrollTop=0;
  cajon(false);
  if(id==="catalogo") rellenarBancoSel(true); else bancoParar();
  if(id==="fusionar") fusRefrescarLista();
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

window.addEventListener("nube:estado",()=>refrescarPanel());

/* ---------- catálogo en la nube ----------
   Misma lógica que en el juego: CANCIONES arranca con js/catalogo.js
   (respaldo), se corrige con el espejo local si hay uno, y se
   reemplaza en el lugar cuando avisa Firestore. */
const CLAVE_CAT="ea_nube_catalogo";
let catNube=store.get(CLAVE_CAT,null);
let catEnNube=false;
let catSucio=false;
let textoCat="Esperando a la nube…";

function normalizarCatalogo(){
  CANCIONES.forEach((c,i)=>{c.id=i; c.label=`${c.a} — ${c.t}`; if(c.activa===undefined) c.activa=true});
}
function aplicarCatalogo(cat){
  CANCIONES.length=0;
  cat.canciones.forEach(c=>CANCIONES.push(Object.assign({},c)));
  normalizarCatalogo();
}
function guardarEspejoCatalogo(){
  const c={canciones:CANCIONES.map(x=>{
            const o={a:x.a,t:x.t,yt:x.yt||"",activa:x.activa!==false};
            if(x.g) o.g=x.g; if(x.ini) o.ini=x.ini; if(x.sonada) o.sonada=x.sonada;
            return o;}),
           actualizado:(catNube&&catNube.actualizado)||null,
           sucio:true};
  catNube=c; store.set(CLAVE_CAT,c);
}
const porLabel=l=>CANCIONES.find(x=>x.label===l);
if(catNube){aplicarCatalogo(catNube); catSucio=!!catNube.sucio}
else normalizarCatalogo();

window.addEventListener("nube:catalogo",e=>{
  const cat=e.detail;
  if(!cat||cat.existe===false){
    catEnNube=false;
    textoCat="El catálogo todavía no está en la nube: se usa js/catalogo.js.";
    refrescarPanel(); return;
  }
  catEnNube=true;
  if(catSucio){
    textoCat="La nube cambió mientras tanto: se conservan tus cambios sin publicar.";
  }else{
    aplicarCatalogo(cat);
    catNube={canciones:cat.canciones,actualizado:cat.actualizado};
    store.set(CLAVE_CAT,catNube);
    textoCat="Catálogo publicado en la nube.";
  }
  rellenarBancoSel(true); pintarSonadas(); refrescarPanel();
});

/* ---------- elección de canción ---------- */
function bolsa(){const a=CANCIONES.filter(c=>c.activa!==false); return a.length?a:CANCIONES}

/* Deja el panel al día con el estado real. */
function refrescarPanel(){
  refrescarCatalogoPanel();
}

/* ---------- catálogo: probar, corregir, agregar y dar de baja ----------
   Todo se edita sobre CANCIONES en memoria y queda "sin publicar" hasta
   tocar Publicar, que sube el documento entero a Firestore. */
function marcarSucio(){catSucio=true; guardarEspejoCatalogo(); refrescarCatalogoPanel(); if(catSolapa==="sonadas") pintarSonadas()}
const fechaCorta=n=>{const d=new Date(n*864e5);return `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}`};

/* iFrame de YouTube dedicado a probar canciones y a grabar sus clips. */
let bancoYt=null, bancoSonando=false, onClipEstadoCambio=null;
const bancoYtListo=new Promise(r=>{
  const orig=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{
    if(orig) orig();
    const div=bancoEl("bancoPlayer");
    if(!div){r();return}
    bancoYt=new YT.Player("bancoPlayer",{width:1,height:1,
      playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1},
      events:{onReady:()=>r(),onStateChange:e=>{
        if(e.data===YT.PlayerState.ENDED) bancoParar();
        if(onClipEstadoCambio) onClipEstadoCambio(e);
      }}
    });
  };
  if(window.YT&&YT.Player){window.onYouTubeIframeAPIReady();}
});
(function(){const s=document.createElement("script");s.src="https://www.youtube.com/iframe_api";document.head.appendChild(s)})();

function bancoParar(){
  bancoSonando=false;
  try{if(bancoYt&&bancoYt.stopVideo) bancoYt.stopVideo()}catch(err){}
  const b=bancoEl("bancoCompleta"); if(b) b.textContent="▶ Completa";
}

const OTRO_GENERO="__otro__";
function generosDelCatalogo(){
  return [...new Set(CANCIONES.map(c=>c.g).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
}
function estadoCancion(c){
  if(!c) return "";
  if(c.activa===false) return c.sonada?`⏸ sonó el ${fechaCorta(c.sonada)}`:"⏸ desactivada";
  return c.sonada?`sonó el ${fechaCorta(c.sonada)} · reactivada`:"";
}
function rellenarBancoSel(mantener){
  const sel=bancoEl("bancoSel"); if(!sel) return;
  const antes=mantener?sel.value:"-1";
  sel.innerHTML='<option value="-1">➕ Agregar canción nueva…</option>'+
    CANCIONES.map((c,i)=>{
      const marca=c.activa===false?" ⏸":"";
      return `<option value="${i}">${c.label}${c.yt?"":" ⚠"}${marca}</option>`;
    }).join("");
  const gen=bancoEl("bancoGenero");
  gen.innerHTML=generosDelCatalogo().map(g=>`<option value="${g}">${g}</option>`).join("")+
    `<option value="${OTRO_GENERO}">Otro género…</option>`;
  sel.value=(+antes>=0&&+antes<CANCIONES.length)?antes:"-1";
  bancoSelCambiar();
}
function bancoSeleccionada(){
  const sel=bancoEl("bancoSel"); if(!sel) return null;
  const i=+sel.value; return i>=0?CANCIONES[i]:null;
}
function bancoSelCambiar(){
  const c=bancoSeleccionada();
  bancoParar();
  bancoEl("bancoArtista").value=c?c.a:"";
  bancoEl("bancoTitulo").value=c?c.t:"";
  bancoEl("bancoId").value=c?(c.yt||""):"";
  bancoEl("bancoIni").value=c?(c.ini||0):0;
  const gen=bancoEl("bancoGenero"), otro=bancoEl("bancoGeneroOtro");
  if(c&&c.g&&[...gen.options].some(o=>o.value===c.g)) gen.value=c.g;
  else gen.selectedIndex=0;
  otro.hidden=true; otro.value="";
  bancoEl("bancoAcciones").hidden=!c;
  if(c){
    bancoEl("bancoActivar").textContent=c.activa===false?"Activar":"Desactivar";
    bancoEl("bancoEstadoCancion").textContent=estadoCancion(c)||"En el sorteo.";
  }
  bancoEl("bancoAviso").textContent=c?"":"Completá los campos y guardá para sumarla al catálogo.";
  clipRefrescarEstado();
}
function bancoGenero(){
  const gen=bancoEl("bancoGenero"), otro=bancoEl("bancoGeneroOtro");
  if(gen.value===OTRO_GENERO) return otro.value.trim();
  return gen.value;
}
function bancoIdLimpio(){
  return bancoEl("bancoId").value.trim().replace(/.*[?&]v=([^&]+).*/,"$1").replace(/.*youtu\.be\/([^?&]+).*/,"$1").trim();
}
async function bancoEscuchar(){
  const id=bancoIdLimpio();
  if(!id){bancoEl("bancoAviso").textContent="Pegá un ID o URL de YouTube primero.";return}
  const ini=parseFloat(bancoEl("bancoIni").value)||0;
  bancoParar();
  bancoEl("bancoAviso").textContent="Cargando…";
  await bancoYtListo;
  bancoYt.loadVideoById({videoId:id,startSeconds:ini});
  setTimeout(()=>{try{bancoYt.stopVideo()}catch(err){}bancoEl("bancoAviso").textContent="";},1200);
}
async function bancoCompleta(){
  if(bancoSonando){bancoParar();return}
  const id=bancoIdLimpio();
  if(!id){bancoEl("bancoAviso").textContent="Pegá un ID o URL de YouTube primero.";return}
  const ini=parseFloat(bancoEl("bancoIni").value)||0;
  bancoEl("bancoAviso").textContent="Cargando…";
  await bancoYtListo;
  bancoSonando=true;
  bancoEl("bancoCompleta").textContent="■ Parar";
  bancoYt.loadVideoById({videoId:id,startSeconds:ini});
  setTimeout(()=>{if(bancoSonando) bancoEl("bancoAviso").textContent="Sonando la canción completa…"},800);
}
function bancoGuardar(){
  const sel=bancoEl("bancoSel");
  const i=+sel.value;
  const a=bancoEl("bancoArtista").value.trim();
  const t=bancoEl("bancoTitulo").value.trim();
  const g=bancoGenero();
  const id=bancoIdLimpio();
  const ini=parseFloat(bancoEl("bancoIni").value)||0;
  const aviso=bancoEl("bancoAviso");
  if(!a||!t){aviso.textContent="Faltan el artista o la canción.";return}
  if(!id){aviso.textContent="El ID no puede estar vacío.";return}

  let quedarEn, msg;
  if(i<0){
    if(CANCIONES.some(c=>c.a===a&&c.t===t)){aviso.textContent="Esa canción ya está en el catálogo.";return}
    const c={a,t,yt:id,activa:true}; if(g) c.g=g; if(ini) c.ini=ini;
    CANCIONES.push(c); normalizarCatalogo();
    quedarEn=c.id;
    msg=`✓ Agregada: ${c.label}. Entra al sorteo cuando publiques.`;
  }else{
    const c=CANCIONES[i]; quedarEn=i;
    if(CANCIONES.some(x=>x!==c&&x.a===a&&x.t===t)){aviso.textContent="Ya hay otra canción con ese artista y título.";return}
    const labelViejo=c.label;
    c.a=a; c.t=t; c.yt=id; if(g) c.g=g; else delete c.g; if(ini) c.ini=ini; else delete c.ini;
    normalizarCatalogo();
    msg=`✓ Guardado: ${c.label}. Se publica con el botón Publicar.`;
  }
  marcarSucio();
  rellenarBancoSel(false);
  sel.value=String(quedarEn); bancoSelCambiar();
  aviso.textContent=msg;
}
function bancoActivar(){
  const c=bancoSeleccionada(); if(!c) return;
  c.activa=c.activa===false;
  marcarSucio(); rellenarBancoSel(true);
  bancoEl("bancoAviso").textContent=c.activa?`✓ ${c.label} vuelve al sorteo al publicar.`:`✓ ${c.label} queda fuera del sorteo al publicar.`;
}
function bancoBorrar(){
  const c=bancoSeleccionada(); if(!c) return;
  if(!confirm(`¿Borrar "${c.label}" del catálogo? Se publica al tocar Publicar.`)) return;
  CANCIONES.splice(c.id,1); normalizarCatalogo();
  marcarSucio(); rellenarBancoSel(false);
  bancoEl("bancoAviso").textContent=`✓ Borrada: ${c.label}.`;
}
/* ---------- pestaña "Ya sonaron" ---------- */
let catSolapa="editar";
function catVerSolapa(v){
  catSolapa=v;
  bancoEl("catSolEditar").classList.toggle("activo",v==="editar");
  bancoEl("catSolSonadas").classList.toggle("activo",v==="sonadas");
  bancoEl("catTabEditar").hidden=v!=="editar";
  bancoEl("catTabSonadas").hidden=v!=="sonadas";
  if(v==="sonadas"){bancoParar(); pintarSonadas()}
}
function pintarSonadas(){
  const est=bancoEl("sonadasEstado"), lista=bancoEl("sonadasLista"); if(!est) return;
  const filas=CANCIONES.filter(c=>c.sonada&&c.activa===false).sort((a,b)=>b.sonada-a.sonada);
  const reactivadas=CANCIONES.filter(c=>c.sonada&&c.activa!==false).length;
  est.textContent=filas.length
    ? `${plural(filas.length,"canción","canciones")} fuera del sorteo`+(reactivadas?` · ${reactivadas} ya reactivadas.`:".")
    : reactivadas?"Todas las que sonaron ya están de vuelta en el sorteo.":"Todavía no sonó ninguna desde que el catálogo vive en la nube.";
  lista.innerHTML=filas.map(c=>
    `<div class="vf apagada"><span class="id">${fechaCorta(c.sonada)}</span>`+
    `<div><div class="pedido">${escapar(c.label)}</div>`+
    `<div class="estado">Fuera del sorteo</div></div>`+
    `<button data-sonada="${c.id}" title="Volver al sorteo">Activar</button></div>`
  ).join("");
}
bancoEl("sonadasLista")?.addEventListener("click",e=>{
  const b=e.target.closest("[data-sonada]"); if(!b) return;
  const c=CANCIONES[+b.dataset.sonada]; if(!c) return;
  c.activa=true;
  marcarSucio(); pintarSonadas(); rellenarBancoSel(true); rellenarSelCancion();
});
bancoEl("catSolEditar")?.addEventListener("click",()=>catVerSolapa("editar"));
bancoEl("catSolSonadas")?.addEventListener("click",()=>catVerSolapa("sonadas"));

function reactivarSonadas(){
  const n=CANCIONES.filter(c=>c.activa===false&&c.sonada).length;
  if(!n){bancoEl("bancoAviso").textContent="No hay canciones desactivadas por haber sonado.";return}
  if(!confirm(`¿Volver a poner en el sorteo las ${n} canciones que ya sonaron?`)) return;
  CANCIONES.forEach(c=>{if(c.activa===false&&c.sonada) c.activa=true});
  marcarSucio(); rellenarBancoSel(true); pintarSonadas();
  bancoEl("bancoAviso").textContent=`✓ ${plural(n,"canción reactivada","canciones reactivadas")}. Se publica con el botón Publicar.`;
}
function publicarCatalogo(){
  const btn=bancoEl("btnPublicarCat");
  if(!hayNube()){textoCat="Sin conexión con la nube: no se puede publicar.";refrescarCatalogoPanel();return}
  bancoParar();
  btn.disabled=true; textoCat="Publicando…"; refrescarCatalogoPanel();
  window.Nube.publicarCatalogo(CANCIONES).then(cat=>{
    catSucio=false; catEnNube=true;
    catNube={canciones:cat.canciones,actualizado:cat.actualizado};
    store.set(CLAVE_CAT,catNube);
    textoCat="Catálogo publicado para todos.";
    rellenarBancoSel(true); pintarSonadas(); refrescarPanel();
  }).catch(e=>{
    textoCat="No se pudo publicar: "+e.message;
    refrescarCatalogoPanel();
  });
}
function textoCatalogo(){
  return "const CANCIONES = [\n"+CANCIONES.map(c=>
    `  {a:${JSON.stringify(c.a)}, t:${JSON.stringify(c.t)}`+
    `${c.yt?`, yt:${JSON.stringify(c.yt)}`:""}${c.ini?`, ini:${JSON.stringify(c.ini)}`:""}${c.g?`, g:${JSON.stringify(c.g)}`:""}`+
    `${c.activa===false?", activa:false":""}${c.sonada?`, sonada:${c.sonada}`:""}},`
  ).join("\n")+"\n];";
}
function refrescarCatalogoPanel(){
  const est=bancoEl("catEstado"), pub=bancoEl("catPublicarEstado"), btn=bancoEl("btnPublicarCat");
  if(!est) return;
  const total=CANCIONES.length, activas=bolsa().length, apagadas=CANCIONES.filter(c=>c.activa===false).length,
        sonadas=CANCIONES.filter(c=>c.activa===false&&c.sonada).length;
  const pocas=activas<5&&total>=5?" · ¡quedan pocas en el sorteo!":"";
  est.textContent=`${plural(total,"canción","canciones")} · ${activas} en el sorteo · ${apagadas} desactivadas`+
    (sonadas?` (${sonadas} por haber sonado)`:"")+pocas;
  pub.textContent=!catSucio?textoCat
    :/^(No se pudo|Publicando|Sin conexión)/.test(textoCat)?`Hay cambios sin publicar. ${textoCat}`
    :"Hay cambios sin publicar: tocá Publicar para que lleguen a todos.";
  pub.className=catSucio?"sin-publicar":"";
  btn.disabled=!hayNube()||(!catSucio&&catEnNube);
  btn.textContent=catEnNube?"Publicar":"Publicar por primera vez";
}
bancoEl("bancoSel")?.addEventListener("change",bancoSelCambiar);
bancoEl("bancoGenero")?.addEventListener("change",()=>{
  const otro=bancoEl("bancoGeneroOtro");
  otro.hidden=bancoEl("bancoGenero").value!==OTRO_GENERO;
  if(!otro.hidden) otro.focus();
});
bancoEl("bancoEscuchar")?.addEventListener("click",bancoEscuchar);
bancoEl("bancoCompleta")?.addEventListener("click",bancoCompleta);
bancoEl("bancoGuardar")?.addEventListener("click",bancoGuardar);
bancoEl("bancoActivar")?.addEventListener("click",bancoActivar);
bancoEl("bancoBorrar")?.addEventListener("click",bancoBorrar);
bancoEl("btnReactivar")?.addEventListener("click",reactivarSonadas);
bancoEl("btnPublicarCat")?.addEventListener("click",publicarCatalogo);
bancoEl("bancoId")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();bancoEscuchar()}});
$("#btnCopiarCat")?.addEventListener("click",()=>alPortapapeles(textoCatalogo(),$("#btnCopiarCat"),"Copiar respaldo"));

/* ---------- carpeta de clips (2.0) ----------
   Compartida entre "Generar clip" (acá abajo) y la pestaña Fusionar
   clips: se elige una sola vez y sirve para las dos cosas. */
const CARACTERES_INVALIDOS_CLIP=/[/\\:*?"<>|]/g;
function nombreClip(a,t){
  return ((a||"")+" - "+(t||"")).replace(CARACTERES_INVALIDOS_CLIP,"").replace(/\s+/g," ").trim();
}
let dirHandle=null, audioStream=null;

async function elegirCarpetaClips(){
  if(!window.showDirectoryPicker) return {ok:false,motivo:"no-soportado"};
  try{
    dirHandle=await window.showDirectoryPicker({id:"escuchadle-clips",mode:"readwrite"});
    if((await dirHandle.queryPermission({mode:"readwrite"}))!=="granted"){
      const permiso=await dirHandle.requestPermission({mode:"readwrite"});
      if(permiso!=="granted"){dirHandle=null;return {ok:false,motivo:"sin-permiso"}}
    }
    return {ok:true};
  }catch(e){
    if(e.name==="AbortError") return {ok:false,motivo:"cancelado"};
    throw e;
  }
}
async function guardarBlobClip(nombreArchivo,blob){
  if(dirHandle){
    try{
      const fh=await dirHandle.getFileHandle(nombreArchivo,{create:true});
      const w=await fh.createWritable(); await w.write(blob); await w.close();
      return "carpeta";
    }catch(e){
      console.warn("No se pudo escribir en la carpeta elegida, se descarga en su lugar:",e);
      dirHandle=null;
    }
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=nombreArchivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
  return "descarga";
}

/* ---------- generar clip de 20s ---------- */
const CLIP_DURATION=20;
function esperar(ms){return new Promise(r=>setTimeout(r,ms))}
function elegirMimeType(){
  const cand=["audio/webm;codecs=opus","audio/webm"];
  return cand.find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||"";
}
async function habilitarCapturaClip(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia)
    throw new Error("Tu navegador no soporta capturar audio de pestaña (usá Chrome o Edge).");
  const captura=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,preferCurrentTab:true,selfBrowserSurface:"include"});
  const pista=captura.getAudioTracks()[0];
  if(!pista){captura.getTracks().forEach(t=>t.stop()); throw new Error('Compartiste sin audio: repetí y tildá "Compartir audio de la pestaña".')}
  captura.getVideoTracks().forEach(t=>t.stop());
  pista.addEventListener("ended",()=>{
    audioStream=null;
    const est=bancoEl("clipEstadoCaptura");
    est.textContent="Se cortó la captura: volvé a habilitarla."; est.className="tabla-estado";
  });
  audioStream=new MediaStream([pista]);
}
async function grabarClipDeYt(yt,ini){
  if(!audioStream) throw new Error("Primero habilitá la captura de audio (paso 2).");
  await bancoYtListo;
  await new Promise((resolve,reject)=>{
    let listo=false;
    const limite=setTimeout(()=>{if(!listo){onClipEstadoCambio=null; reject(new Error("YouTube no empezó a reproducir a tiempo."))}},8000);
    onClipEstadoCambio=e=>{
      if(e.data===YT.PlayerState.PLAYING&&!listo){listo=true; clearTimeout(limite); onClipEstadoCambio=null; resolve()}
    };
    bancoYt.loadVideoById({videoId:yt,startSeconds:ini});
  });
  await esperar(300);
  const mimeType=elegirMimeType();
  const rec=mimeType?new MediaRecorder(audioStream,{mimeType}):new MediaRecorder(audioStream);
  const chunks=[];
  rec.ondataavailable=e=>{if(e.data.size) chunks.push(e.data)};
  const detenido=new Promise(r=>{rec.onstop=r});
  rec.start();
  await esperar(CLIP_DURATION*1000);
  rec.stop();
  await detenido;
  try{bancoYt.pauseVideo()}catch{}
  return new Blob(chunks,{type:"audio/webm"});
}
async function clipExiste(nombre){
  try{
    const r=await fetch(`../conversor/clips/${encodeURIComponent(nombre)}.webm`,{method:"HEAD",cache:"no-store"});
    return r.ok;
  }catch{return false}
}
async function clipRefrescarEstado(){
  const c=bancoSeleccionada(), est=bancoEl("clipEstado");
  if(!est) return;
  if(!c){est.textContent="";return}
  const nombre=nombreClip(c.a,c.t);
  est.textContent=(await clipExiste(nombre))?"Ya hay un clip generado (grabar de nuevo lo reemplaza).":"Todavía no tiene clip.";
}
bancoEl("clipCarpeta")?.addEventListener("click",async()=>{
  const est=bancoEl("clipEstadoCarpeta");
  try{
    const r=await elegirCarpetaClips();
    if(r.ok){est.textContent="Carpeta lista: los clips se guardan ahí directo.";est.className="tabla-estado ok"}
    else if(r.motivo==="no-soportado"){est.textContent="Tu navegador no soporta esto: se van a descargar.";est.className="tabla-estado"}
    else if(r.motivo==="sin-permiso"){est.textContent="No diste permiso de escritura: se van a descargar.";est.className="tabla-estado"}
    else if(r.motivo!=="cancelado"){est.textContent="No se pudo elegir la carpeta.";est.className="tabla-estado"}
  }catch(e){est.textContent="Error: "+e.message;est.className="tabla-estado"}
  fusRefrescarLista();
});
bancoEl("clipCaptura")?.addEventListener("click",async()=>{
  const est=bancoEl("clipEstadoCaptura");
  try{await habilitarCapturaClip(); est.textContent="Captura de audio lista.";est.className="tabla-estado ok"}
  catch(e){est.textContent="Error: "+e.message;est.className="tabla-estado"}
});
bancoEl("clipGrabar")?.addEventListener("click",async()=>{
  const c=bancoSeleccionada(), est=bancoEl("clipEstado"), btn=bancoEl("clipGrabar");
  if(!c){est.textContent="Primero guardá la canción (Artista y Título completos).";return}
  const nombre=nombreClip(c.a,c.t);
  if(!nombre){est.textContent="Faltan artista y título.";return}
  const id=bancoIdLimpio();
  if(!id){est.textContent="Pegá el ID de YouTube primero.";return}
  const ini=parseFloat(bancoEl("bancoIni").value)||0;
  btn.disabled=true; est.textContent=`Grabando ${CLIP_DURATION}s…`;
  try{
    const blob=await grabarClipDeYt(id,ini);
    const destino=await guardarBlobClip(nombre+".webm",blob);
    est.textContent=destino==="carpeta"?`✓ Guardado como "${nombre}.webm".`:`✓ Descargado como "${nombre}.webm" (moverlo a mano a conversor/clips/).`;
  }catch(e){
    est.textContent="Error: "+e.message;
  }finally{
    btn.disabled=false;
  }
});

/* ---------- fusionar clips sueltos con el catálogo ---------- */
const fusLista=$("#fusLista"), fusEstado=$("#fusEstado");
function fusParsear(nombreSinExt){
  const partes=nombreSinExt.split(" - ");
  const a=partes.shift()||"";
  const t=partes.join(" - ")||"";
  return {a,t};
}
async function fusRefrescarLista(){
  if(!dirHandle){fusEstado.textContent="Elegí la carpeta para empezar.";fusLista.innerHTML="";return}
  fusEstado.textContent="Leyendo…";
  const archivos=[];
  try{
    for await (const [nombre,handle] of dirHandle.entries()){
      if(handle.kind==="file"&&/\.webm$/i.test(nombre)) archivos.push(nombre);
    }
  }catch(e){fusEstado.textContent="No se pudo leer la carpeta: "+e.message;return}
  archivos.sort((x,y)=>x.localeCompare(y,"es"));
  if(!archivos.length){fusEstado.textContent="No hay archivos .webm en esa carpeta.";fusLista.innerHTML="";return}
  const vinculados=archivos.filter(n=>CANCIONES.some(c=>nombreClip(c.a,c.t)+".webm"===n)).length;
  fusEstado.textContent=`${plural(archivos.length,"clip","clips")} · ${vinculados} vinculado(s) · ${archivos.length-vinculados} sin canción en el catálogo.`;
  fusLista.innerHTML=archivos.map((n,i)=>{
    const stem=n.replace(/\.webm$/i,"");
    const cancion=CANCIONES.find(c=>nombreClip(c.a,c.t)===stem);
    const {a,t}=fusParsear(stem);
    return `<div class="vf">`+
      `<span class="id">🎧</span>`+
      `<div><div class="pedido">${escapar(n)}</div>`+
      `<div class="hallado ${cancion?"ok":""}">${cancion?`✓ vinculado a ${escapar(cancion.label)}`:`Sin canción — ${escapar(a)} / ${escapar(t)}`}</div></div>`+
      (cancion?"":`<button data-fus="${i}" title="Cargar en el catálogo">Cargar</button>`)+
      `</div>`;
  }).join("");
  fusLista.querySelectorAll("[data-fus]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const stem=archivos[+btn.dataset.fus].replace(/\.webm$/i,"");
      const {a,t}=fusParsear(stem);
      irASeccion("catalogo"); catVerSolapa("editar");
      bancoEl("bancoSel").value="-1"; bancoSelCambiar();
      bancoEl("bancoArtista").value=a; bancoEl("bancoTitulo").value=t;
      bancoEl("bancoAviso").textContent="Completá el ID de YouTube y guardá para sumarla al catálogo.";
      bancoEl("bancoArtista").focus();
    });
  });
}
$("#fusCarpeta").addEventListener("click",async()=>{
  try{
    const r=await elegirCarpetaClips();
    if(r.ok) fusRefrescarLista();
    else if(r.motivo==="no-soportado") fusEstado.textContent="Tu navegador no soporta leer carpetas (usá Chrome o Edge).";
    else if(r.motivo!=="cancelado") fusEstado.textContent="No se pudo usar la carpeta.";
  }catch(e){fusEstado.textContent="Error: "+e.message}
});
$("#fusActualizar").onclick=()=>fusRefrescarLista();

/* Si ya había una sesión abierta, entra directo: va al final para que
   todo lo que usa el panel ya esté definido. */
(function(){
  let ok=false;
  try{ok=sessionStorage.getItem("ea_admin")==="1"}catch{}
  if(ok) mostrarPanel();
  else setTimeout(()=>$("#claveEntrada").focus(),60);
})();
