/* =========================================================
   Escuchadle Argento — configuración del día

   Este archivo SÍ se versiona: es lo único que ven todos los
   jugadores. El panel reservado arma su contenido y te lo copia
   al portapapeles; pegalo acá, subilo al repositorio y el cambio
   le llega a todo el mundo en la próxima carga.

   modo      "auto"   la canción sale de la fecha, como siempre
             "manual" la canción la elegís vos en cancion

   cancion   el label exacto del catálogo: "Artista — Título".
             Solo se usa cuando modo es "manual".

   salto     corrimiento dentro del orden automático. Con 0 el juego
             sortea como siempre; cambiándolo, hoy cae otra canción y
             la secuencia sigue desde ahí. Solo se usa en modo "auto".
             El panel tiene un botón que lo sortea por vos.

   reinicio  contador. Subilo en 1 y todos los que ya jugaron hoy
             pierden su partida guardada y arrancan de cero con la
             canción que esté configurada.
   ========================================================= */
const DIA = {
  modo: "auto",
  cancion: "",
  salto: 0,
  reinicio: 0
};
