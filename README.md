# Escuchadle Argento

Juego tipo *Heardle* con música argentina. Escuchás un fragmento cada vez más
largo (1 · 2 · 4 · 7 · 11 · 16 segundos) y tenés seis intentos para adivinar
la canción. Si acertás el artista pero no el tema, el intento queda en amarillo.

Sitio estático, sin dependencias ni build: se abre con doble clic o se sube
tal cual a GitHub Pages.

## Las pistas

Son tres y salen sobre el final, una por intento, durante los últimos tres:

| Intento | Pista |
|---|---|
| 4.º | género de la canción (campo `g` del catálogo) |
| 5.º | palabras y letras del **título** |
| 6.º | palabras y letras del **artista** |

Antes de que les toque se muestran con candado, para que el jugador sepa
cuántas hay y de qué van a hablar. Al terminar la partida se abren todas.
Las reglas completas están en la ventana de ayuda (el `?` de la cabecera),
que además se abre sola la primera vez que alguien entra.

## Estructura

```
index.html            marcado
css/estilos.css       estilos
js/config.js          clave de la API de YouTube (no se versiona)
js/config.example.js  plantilla de config.js
js/nube-config.js     datos del proyecto de Firebase (públicos, sí se versionan)
js/nube.js            conexión con Firestore (módulo)
js/dia.js             respaldo de la configuración del día
js/catalogo.js        lista de canciones
js/juego.js           lógica del juego
```

## Cómo correrlo

1. `cp js/config.example.js js/config.js`
2. Abrí `index.html` en el navegador.

Si alguna canción del catálogo no tiene su campo `yt`, el juego necesita una
clave de la YouTube Data API v3 para buscar el video. Una vez que todas las
canciones tienen su ID cargado, la clave deja de hacer falta.

### Clave de la API (gratis)

1. [console.cloud.google.com](https://console.cloud.google.com) → crear proyecto
2. APIs y servicios → habilitar **YouTube Data API v3**
3. Credenciales → crear clave de API
4. Pegala en `js/config.js`

La cuota gratuita alcanza para unas 100 búsquedas por día: suficiente para
verificar el catálogo entero de una sentada.

## La configuración del día

La canción del día vive en Firestore, en el documento `escuchadle/dia`. El
panel reservado (cinco toques en el título) la publica y el cambio le llega en
el acto a cualquiera que tenga el juego abierto: no hay que subir nada al
repositorio ni esperar a que caduque un caché.

```
modo       "auto" (sale de la fecha) o "manual" (una elegida a mano)
cancion    el label exacto del catálogo, solo en modo manual
salto      corrimiento del sorteo automático
reinicio   contador; al subir, todos pierden la partida guardada de hoy
```

`js/dia.js` quedó como red de seguridad: se usa solo si Firebase no llegó a
cargar. El botón *Copiar respaldo* del panel arma ese bloque con lo que esté
publicado; conviene pegarlo cada tanto para que no envejezca.

### Reglas de Firestore

La configuración de Firebase es pública por diseño: viaja en el navegador de
cualquiera que abra el juego. Lo que protege la base son las reglas, que
limitan qué documento se puede tocar y con qué campos. Están en la consola,
en Firestore → Reglas.

Si algún día conviene cerrar la escritura del todo, el camino es Firebase Auth
con un usuario administrador y una regla `request.auth.uid == "..."`, no
esconder la clave.

## Los resultados y el ranking

Cada partida terminada se archiva en el navegador (`ea_resultados`), pero **no
sube sola**: viaja a la colección `resultados` cuando el jugador escribe su
nombre y toca *Enviar al ranking* en la ventana de resultado. Sin nombre el
botón está apagado, y una vez enviada la fila el botón y el campo se bloquean
para que nadie se anote dos veces por la misma partida. Si en ese momento no
hay señal, el resultado queda pendiente y *Subir pendientes*, en el panel, lo
reintenta.

La tabla se ve desde el juego, con el 🏆 de la cabecera, y trae las últimas 200
partidas en dos vistas:

- **Hoy** — los que acertaron primero, de menos intentos a más; entre iguales
  gana el que llegó antes. Los que no la sacaron van al final.
- **Histórico** — acumulado por nombre (ganadas, jugadas, porcentaje y promedio
  de intentos). Los nombres se agrupan sin distinguir mayúsculas ni tildes.

El título de la canción **nunca** se muestra en esta tabla: sería regalarle la
respuesta a quien todavía está jugando. Para verlo está el bloque *Ranking en
la nube* del panel reservado, que sigue siendo la vista cruda para corregir.

Como no hay login, el nombre es a puro honor: nada impide que alguien se anote
con el nombre de otro. Para un juego entre conocidos alcanza; si algún día hace
falta, el camino es Firebase Auth.

## Cargar el catálogo

Con la clave puesta, abrí **Verificar catálogo** (link al pie de la página).
El juego recorre todas las canciones, muestra qué video eligió cada una y
permite abrirlo en YouTube para confirmar. Después, *Copiar catálogo con IDs*
te da el array completo ya fijado: pegalo sobre `CANCIONES` en `js/catalogo.js`.

Para agregar canciones, sumá una línea a ese array:

```js
{a:"Artista", t:"Título", yt:"ID_DE_YOUTUBE"}
```

El `yt` es lo que va después de `watch?v=` en la URL. Es opcional; sin él, el
juego busca el video solo.

## Publicar en GitHub Pages

Settings → Pages → Source: `main`, carpeta `/ (root)`. Como `js/config.js` está
en `.gitignore`, el sitio publicado funciona solo si todas las canciones ya
tienen su `yt` cargado. Si necesitás la búsqueda en producción, tendrás que
versionar la clave y restringirla por dominio (HTTP referrers) desde Google
Cloud.

## Nota legal

El audio se reproduce con el reproductor oficial embebido de YouTube. No se
descarga ni se aloja música. Si el sitio va a ser público, dejá el reproductor
visible: los términos de la API de YouTube no permiten ocultarlo.
