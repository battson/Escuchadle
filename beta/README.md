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
