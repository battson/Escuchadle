/* =========================================================
   Escuchadle Argento — datos del proyecto de Firebase.

   Esto NO es un secreto. La configuración web de Firebase viaja
   en el navegador de cualquiera que abra el juego: es pública por
   diseño y va versionada en el repositorio sin problema.

   Lo que protege la base son las reglas de Firestore, no esta
   clave. Las reglas publicadas permiten:
     - leer y escribir SOLO el documento escuchadle/dia, y solo
       con los campos modo, cancion, salto, reinicio, actualizado;
     - crear, leer y borrar en resultados, sin poder modificar.
   Si alguna vez querés cerrar la escritura, el camino es Firebase
   Auth con un usuario administrador, no esconder esto.
   ========================================================= */
window.NUBE_CONFIG = {
  apiKey: "AIzaSyCCEy_4FQX5MdS5SfoZzr8ymYMYTgi4lkk",
  authDomain: "escuchadle-4cae6.firebaseapp.com",
  projectId: "escuchadle-4cae6",
  storageBucket: "escuchadle-4cae6.firebasestorage.app",
  messagingSenderId: "379218628804",
  appId: "1:379218628804:web:5d007216848013372ff991"
};

/* Dónde vive cada cosa dentro de Firestore. */
window.NUBE_RUTAS = {
  coleccionConfig: "escuchadle",
  documentoDia: "dia",
  coleccionResultados: "resultados"
};
