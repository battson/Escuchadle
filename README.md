# Escuchadle Argento

Juego tipo *Heardle* con música argentina. Escuchás un fragmento cada vez más
largo (1 · 2 · 4 · 7 · 11 · 16 segundos) y tenés seis intentos para adivinar
la canción. Si acertás el artista pero no el tema, el intento queda en amarillo.

Sitio estático, sin dependencias ni build: se abre con doble clic o se sube
tal cual a GitHub Pages.

## Estructura

```
index.html          marcado
css/estilos.css     estilos
js/config.js        clave de la API (no se versiona)
js/config.example.js  plantilla de config.js
js/catalogo.js      lista de canciones
js/juego.js         lógica del juego
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
