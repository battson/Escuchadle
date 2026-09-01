# Escuchadle Argento

Juego tipo *Heardle* con música argentina. Escuchás un fragmento cada vez más
largo (1 · 2 · 4 · 7 · 11 · 16 segundos) y tenés seis intentos para adivinar
la canción. Si acertás el artista pero no el tema, el intento queda en amarillo.

Se juega **de lunes a viernes**: sábados y domingos el juego muestra un cartel
de cerrado en lugar del tablero. Manda el reloj de la máquina del jugador. Una
partida sin terminar que cruza la medianoche se da por perdida. El panel de
administración abre los siete días, y tiene un interruptor local para poder
jugar igual el fin de semana mientras se prueba.

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

Las reglas completas están versionadas en **`firestore.rules`**, en la raíz del
repositorio. Ese archivo es la fuente de verdad: si se toca algo en la consola,
conviene copiarlo de vuelta ahí para que no se pierda.

**Cuidado al pegarlas:** las reglas son un documento único. Lo que se publica
reemplaza todo lo anterior, así que hay que pegar el archivo entero y no un
bloque suelto, o las colecciones que queden afuera dejan de funcionar.

Cubren tres cosas: el documento `escuchadle/dia`, la colección `resultados` y
la colección `sugerencias`. En las dos colecciones se puede crear y borrar pero
no modificar, y cada campo se valida por tipo y por largo. Como no hay login,
el borrado queda abierto: cualquiera que sepa manejar la consola podría borrar
filas. Entre compañeros de trabajo no es un problema; si algún día lo fuera, se
cierra con Firebase Auth.


## El ranking

Se puntúa por rapidez: **6 puntos** si la sacás al primer intento y uno menos
por cada intento de más, hasta **1 punto** en el sexto. Sin acertar, cero.

La tabla vive plegada contra el borde derecho de la pantalla. Se despliega con
el botón *Ranking* de la cabecera —que hace de llave de luz: si está abierta,
la cierra— o
tocando la lengüeta vertical. **Arranca plegada en cada carga.** Va encimada
sobre la página (`position:fixed`), así que abrirla no mueve nada del
contenido. Tiene dos vistas:

- **Semana** — acumulado de puntos de lunes a viernes. Arranca de cero cada
  lunes a las 00. Las partidas de fin de semana (las del interruptor de
  administración) no cuentan.
- **Histórico** — acumulado de siempre, sin reinicio.

**Sin nombre no se puntúa.** Las filas anónimas no entran en ninguna vista.

El título de la canción **nunca** se muestra en estas tablas: sería regalarle
la respuesta a quien todavía está jugando. Para verlo está el bloque *Ranking*
del panel reservado, que sigue siendo la vista cruda para corregir.

## Los resultados y el envío

Cada partida terminada se archiva en el navegador (`ea_resultados`), pero **no
sube sola**: viaja a la colección `resultados` cuando el jugador escribe su
nombre y toca *Enviar al ranking* en la ventana de resultado. Sin nombre el
botón está apagado, y una vez enviada la fila el botón y el campo se bloquean
para que nadie se anote dos veces por la misma partida. Si en ese momento no
hay señal, el resultado queda pendiente y *Subir pendientes*, en el panel, lo
reintenta.

Los nombres se agrupan sin distinguir mayúsculas ni tildes: "Jony" y "jony" son
la misma persona.

Como no hay login, el nombre es a puro honor: nada impide que alguien se anote
con el nombre de otro. Para un juego entre conocidos alcanza; si algún día hace
falta, el camino es Firebase Auth.

## Comentarios y sugerencias

El botón *Dejar comentario* de la cabecera abre un formulario: nombre o
anónimo, y un mensaje de hasta 600 caracteres. Va a la colección `sugerencias` y se lee desde el panel, en la
sección del mismo nombre, donde también se borran de a uno.

## El panel de administración

Cinco toques en el título y pide contraseña; hoy es `159357`, escrita en
`js/juego.js`. **No es seguridad**: la clave viaja en el navegador y cualquiera
que abra el código la ve. Es una tranquera para que un curioso no entre de
casualidad. Lo que protege la base son las reglas de Firestore.

La sesión queda abierta mientras dure la pestaña. El panel está dividido en
secciones —Canción del día, Modo de juego, Ranking, Sugerencias, Vista y
pruebas, Catálogo, Partida y resultados— con la lista a la izquierda y el
contenido a la derecha. En pantallas angostas esa lista se convierte en un
cajón que se abre con el botón ☰.

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

## La tarjeta para compartir

El `<head>` lleva las etiquetas Open Graph que arman la vista previa cuando
alguien pega el link en WhatsApp, Instagram o Discord. La imagen es
`imgs/OpenGraph.jpg` (1200×630) y se declara con **URL absoluta**: con ruta
relativa ninguna de esas apps la encuentra.

WhatsApp y Facebook cachean esa tarjeta por mucho tiempo. Si cambiás la imagen,
subile el `?v=` del final de `og:image` y `twitter:image`, o van a seguir
mostrando la vieja. Para forzar una relectura sirve el Sharing Debugger de
Facebook (`developers.facebook.com/tools/debug/`), que además avisa si algo está
mal armado.

Y ojo con el nombre del archivo: GitHub Pages distingue mayúsculas, así que
`OpenGraph.jpg` tiene que llamarse exactamente así.

## Imágenes

`imgs/` tiene que contener, además del vinilo:

```
imgs/ranking.png     ícono del botón Ranking, se dibuja a 16 px
imgs/OpenGraph.jpg   tarjeta para compartir, 1200×630, menos de 300 KB
```

Si alguna vez cambiás la tarjeta, subile el `?v=` del `og:image` en el
`<head>`: WhatsApp y Facebook la guardan en caché por mucho tiempo y sin eso
siguen mostrando la vieja.

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
