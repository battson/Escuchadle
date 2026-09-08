# Escuchadle Argento — beta (2.0 en construcción)

Copia de trabajo para armar la 2.0 sin tocar el sitio en producción
(`index.html` en la raíz). Se accede en `Escuchadle/beta` mientras se arma;
cuando esté lista se pasa al `index.html` real y esta carpeta se borra.

Arrancó como copia exacta de la raíz (`index.html`, `css/`, `js/`, `imgs/`) el
día que se creó. A partir de acá diverge: acá van los cambios de la 2.0
(fuente de audio en `conversor/clips/`, panel admin separado en
`Escuchadle/admin`, diseño nuevo, etc. — ver el issue de seguimiento en
GitHub).

**Ojo:** `js/nube-config.js` apunta al mismo proyecto de Firebase que
producción. Hasta que se decida lo contrario, cualquier prueba acá (fijar
canción del día, mandar resultados al ranking, etc.) **escribe en los datos
reales**. Para probar sin pisar nada, usar canciones/datos de prueba o pedir
un proyecto de Firebase aparte para la beta.

## Modo claro/oscuro

El botón de la luna/sol en la cabecera alterna entre los dos modos del
rediseño glassmorphism. Oscuro es el predeterminado; la elección queda en
`localStorage` (`ea_tema`) y la respeta también `admin/`, aunque ahí no hay
botón propio para cambiarla.

## `css/clasico.css`

Es el `css/estilos.css` de la raíz (la 1.0), copiado tal cual, sin ninguno de
los cambios del rediseño. No se usa todavía: queda guardado para más
adelante armar un botón "Vista clásica" que le permita a quien prefiera el
look original volver a él.
