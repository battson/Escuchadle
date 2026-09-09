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

## La fuente del audio

Durante la partida, cada fragmento que se escucha (1·2·4·7·11·16s) se
reproduce desde un clip `.webm` guardado en `conversor/clips/`, no desde el
player de YouTube en vivo. Recién al terminar la partida (adivinada o
perdida) se muestra y reproduce la canción completa con el reproductor
oficial de YouTube, como "reveal" final. Esto saca la dependencia de
streaming del núcleo de la mecánica y la deja solo para ese momento.

Los clips se generan desde el panel de administración, sección **Catálogo**
(ver *El conversor de clips*).

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
index.html            marcado del juego
css/estilos.css       estilos (rediseño minimalista, 3.0)
css/clasico.css       estilos originales de la 1.0, para el botón "Vista clásica"
js/config.js          clave de la API de YouTube (no se versiona)
js/config.example.js  plantilla de config.js
js/nube-config.js     datos del proyecto de Firebase (públicos, sí se versionan)
js/nube.js            conexión con Firestore (módulo)
js/dia.js             respaldo de la configuración del día
js/catalogo.js        respaldo del catálogo de canciones
js/juego.js           lógica del juego
admin/                panel de administración, página aparte (ver más abajo)
conversor/             conversor de audio a clips locales, ver conversor/README.md
conversor/clips/       clips .webm que consume el juego durante la partida
firestore.rules       reglas de Firestore (fuente de verdad; se pegan en la consola)
```

Los diseños anteriores no están en esta rama: ver *Versiones anteriores*
más abajo.

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
panel la publica y el cambio le llega en el acto a cualquiera que tenga el
juego abierto: no hay que subir nada al repositorio ni esperar a que caduque
un caché.

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

Cubren cuatro cosas: los documentos `escuchadle/dia` y `escuchadle/catalogo`,
la colección `resultados` y la colección `sugerencias` (esta última ya no se
usa desde el panel, se dejó la regla por compatibilidad con datos viejos). En
las colecciones se puede crear y borrar pero no modificar, y cada campo se
valida por tipo y por largo. Como no hay login, el borrado queda abierto:
cualquiera que sepa manejar la consola podría borrar filas. Entre compañeros
de trabajo no es un problema; si algún día lo fuera, se cierra con Firebase
Auth.

## El catálogo en la nube

Las canciones viven en el documento `escuchadle/catalogo`, con este formato
por canción:

```
a        artista
t        título
yt       ID de YouTube
g        género (primera pista)
ini      segundos de silencio inicial a saltar (opcional)
activa   false = fuera del sorteo del día; sigue en el buscador
sonada   número de día en que fue canción del día (informativo)
```

Y además `hoy: {dia, cancion}`, el **pin del día**: la canción fijada para
todos. La fija el primer jugador que entra cada día hábil, en una transacción
(si dos entran a la vez, gana el primero y el segundo recibe la misma). Al
fijarla, esa canción queda `activa:false` con su `sonada`: **las canciones que
ya sonaron se desactivan solas** y no vuelven al sorteo hasta que se las
reactive desde el panel. Los fines de semana no se fija nada.

Como el pin manda, publicar cambios de catálogo en medio del día no le cambia
la canción a nadie: lo nuevo entra al sorteo desde el día siguiente. El sorteo
automático se hace entre las activas; si no quedara ninguna, se sortea entre
todas antes que dejar el juego sin canción.

El panel, sección **Catálogo**, permite probar (un segundo o la canción
completa), corregir, agregar, desactivar/activar y borrar canciones. Nada
llega a los jugadores hasta tocar **Publicar**, que sube el documento entero.
*Reactivar las que sonaron* devuelve al sorteo todo lo que ya salió, para
cuando la bolsa se achica. *Copiar respaldo* arma el bloque para
`js/catalogo.js`, que se usa solo si la nube no carga.

La primera vez, el documento no existe: el botón dice *Publicar por primera
vez* y sube lo que tenga `js/catalogo.js`.

## El conversor de clips

Integrado en la sección **Catálogo** del panel: graba 20 segundos del audio
de esa misma pestaña mientras suena la canción de arriba (con el ID y el
silencio inicial ya cargados) y lo guarda como `<Artista> - <Título>.webm` en
`conversor/clips/`. Solo anda en Chrome/Edge, y hay que guardar la canción
antes (con artista y título completos) para poder nombrar el clip. También
existe una versión standalone en `conversor/index.html` (ver
`conversor/README.md`) con un modo por lotes para generar de una varias
canciones pendientes.

La solapa **Fusionar clips**, dentro de Catálogo, lee la carpeta de clips y
cruza cada `.webm` contra el catálogo por nombre de archivo; para los que no
coinciden con ninguna canción ofrece cargar el artista/título adivinado del
nombre directo en el formulario de Catálogo → Editar.

## El ranking

Se puntúa por rapidez: **6 puntos** si la sacás al primer intento y uno menos
por cada intento de más, hasta **1 punto** en el sexto. Sin acertar, cero.

La tabla vive contra el borde derecho de la pantalla y **arranca visible en
cada carga**. El link *Ranking* de la cabecera hace de llave de luz: si está
abierta, la cierra, y viceversa (el color del link marca el estado). Va
encimada sobre la página (`position:fixed`), así que abrirla no mueve nada
del contenido. Tiene dos vistas:

- **Semana** — acumulado de puntos de lunes a viernes. Arranca de cero cada
  lunes a las 00. Las partidas de fin de semana (las del interruptor de
  administración) no cuentan.
- **Histórico** — acumulado de siempre, sin reinicio.

**Sin nombre no se puntúa.** Las filas anónimas no entran en ninguna vista.

Arriba de todo, en color `--sol`, va la leyenda de quien ganó la semana
anterior: *"Felicitaciones a X por ganar la semana del dd-mm al dd-mm"*, con el
lunes y el viernes de esa semana. Se completa sola con los datos de la nube;
si nadie sumó puntos, no aparece.

El título de la canción **nunca** se muestra en estas tablas: sería regalarle
la respuesta a quien todavía está jugando. Para verlo está el bloque *Ranking*
del panel, que sigue siendo la vista cruda para corregir.

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

## El panel de administración

Vive aparte, en `admin/` (mismo sitio, misma contraseña; hoy es `159357`,
escrita en `admin/js/admin.js`). **No es seguridad**: la clave viaja en el
navegador y cualquiera que abra el código la ve. Es una tranquera para que un
curioso no entre de casualidad. Lo que protege la base son las reglas de
Firestore.

Cinco toques en el título del juego abren `admin/` en una pestaña nueva. La
sesión queda abierta mientras dure esa pestaña. El panel está dividido en
secciones —Canción del día, Catálogo, Modo de juego, Ranking, Vista y
pruebas, Partida y resultados— con la lista a la izquierda y el contenido a
la derecha. En pantallas angostas esa lista se convierte en un cajón que se
abre con el botón ☰.

## Cargar canciones

Todo se hace desde el panel, sección **Catálogo** (ver *El catálogo en la
nube*). Pegás el ID o la URL de YouTube, escuchás, guardás y publicás. El
`yt` es lo que va después de `watch?v=` en la URL. Para que suene durante la
partida también hace falta generarle el clip (ver *El conversor de clips*).

## Vista clásica

El botón **"Vista clásica"** de la cabecera del juego alterna entre el
rediseño actual y `css/clasico.css` —el `css/estilos.css` de la 1.0, sin
tocar— usando `localStorage` (`ea_vista`). Por ahora solo existe en el
juego, no en `admin/`. No hay modo claro: el sitio es oscuro únicamente.

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

`imgs/` tiene que contener:

```
imgs/vinilo.svg      el disco del reproductor (gira con CSS) y el favicon
imgs/vinilo.png      respaldo del favicon para navegadores sin favicon SVG
imgs/ranking.svg     ícono del botón Ranking y de la cabecera del panel lateral
imgs/cartel.svg      cartel de "cerrado" de la pantalla de fin de semana
imgs/malvinas.svg    marca de agua fija abajo a la derecha
imgs/OpenGraph.jpg   tarjeta para compartir, 1200×630, menos de 300 KB
```

Las esquinas de cajas, campos y botones salen de la variable `--radio`
en `css/estilos.css` (hoy 5 px): se cambia en un solo lugar.

## Publicar en GitHub Pages

Settings → Pages → Source: `main`, carpeta `/ (root)`. Como `js/config.js` está
en `.gitignore`, el sitio publicado funciona solo si todas las canciones ya
tienen su `yt` cargado. Si necesitás la búsqueda en producción, tendrás que
versionar la clave y restringirla por dominio (HTTP referrers) desde Google
Cloud.

## Versiones anteriores

Los diseños previos a este quedan enteros en ramas de git, no en tags (el
token con el que se sube a veces no tiene permiso para pushear tags, así
que esta es la forma que efectivamente queda accesible en GitHub):

- `historico/1.0` — el diseño original: streaming en vivo de YouTube durante
  toda la partida, panel de administración embebido en el propio juego.
- `historico/2.0-glassmorphism` — el rediseño con vidrio esmerilado, vinilo
  girando y tarjeta central, previo al rediseño minimalista actual (3.0).

`git checkout historico/1.0` (o el nombre que corresponda) los trae de
vuelta enteros.

## Nota legal

El audio de la partida se recorta de clips propios guardados en
`conversor/clips/`; al terminar, la canción completa se reproduce con el
reproductor oficial embebido de YouTube. No se aloja música completa. Si el
sitio va a ser público, dejá el reproductor de YouTube visible en el reveal:
los términos de la API de YouTube no permiten ocultarlo.
