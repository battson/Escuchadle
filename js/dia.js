/* =========================================================
   Escuchadle Argento — configuración del día (RESPALDO)

   Desde que el juego usa Firestore, este archivo dejó de ser la
   fuente de verdad: lo que mandan son los datos de la nube, que
   el panel publica en el acto para todos los jugadores.

   Esto queda como red de seguridad. Se usa solo si Firebase no
   llegó a cargar (sin señal en la primera visita, o el CDN
   bloqueado). El panel tiene un botón, "Copiar respaldo", que
   arma este bloque con lo que esté publicado; conviene pegarlo
   acá de vez en cuando para que el respaldo no envejezca.

   modo      "auto"   la canción sale de la fecha, como siempre
             "manual" la canción la elegís vos en cancion

   cancion   el label exacto del catálogo: "Artista — Título".
             Solo se usa cuando modo es "manual".

   salto     corrimiento dentro del orden automático. Con 0 el juego
             sortea como siempre; cambiándolo, hoy cae otra canción y
             la secuencia sigue desde ahí. Solo se usa en modo "auto".
             El panel tiene un botón que lo sortea por vos.

   reinicio  contador. Cuando sube en 1, todos los que ya jugaron hoy
             pierden su partida guardada y arrancan de cero con la
             canción que esté configurada. El botón "Reiniciar para
             todos" del panel lo sube y lo publica.
   ========================================================= */
const DIA = {
  modo: "auto",
  cancion: "",
  salto: 0,
  reinicio: 0
};
