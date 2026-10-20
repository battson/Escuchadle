# Modo competitivo (archivado)

El juego funciona solo en modo libre. Acá quedó aislado lo que usaba el modo
competitivo (canción del día, ranking, puntos, cierre de fin de semana):

- `dia.js`: configuración del día de respaldo (`DIA`).
- `ranking.svg`, `cartel.svg`: ilustraciones del ranking y del cartel de fin de semana.

Nada de esto se carga desde el sitio. El resto del código del modo competitivo
(ranking, panel lateral, pantalla de fin de semana, métodos de resultados y
ajustes de `nube.js`, estilos) se quitó y se puede recuperar del historial de
git (commits anteriores al PR que archivó el modo competitivo).
`firestore.rules` no se tocó: las colecciones `dia`, `resultados` y `ajustes`
siguen permitidas en la base.
