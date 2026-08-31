/* =========================================================
   Escuchadle Argento — catálogo de canciones

   Formato:  {a:"Artista", t:"Título", yt:"ID_DE_YOUTUBE", g:"Género"}

   El ID es lo que va después de watch?v= en la URL:
   https://www.youtube.com/watch?v=Zi_XLOBDo_Y  →  yt:"Zi_XLOBDo_Y"

   Los yt vacíos ("") hacen que el juego busque el video con la
   API. Con todos completos, la API no se usa nunca y no hay
   cuota que saturar.

   El campo g es el género: se usa como primera pista cuando el
   jugador falla un intento. Si lo omitís, esa pista se saltea.

   Mezcla actual: 28 rock · 16 cumbia · 6 cuarteto · 6 pop
   6 urbano · 2 clásicos = 64 canciones.
   ========================================================= */
const CANCIONES = [

  /* ---------- ROCK NACIONAL ---------- */
  {a:"Soda Stereo", t:"De Música Ligera", yt:"T_FkEw27XJ0", g:"Rock nacional"},
  {a:"Soda Stereo", t:"Persiana Americana", yt:"LalPz4lIZYk", g:"Rock nacional"},
  {a:"Soda Stereo", t:"En la Ciudad de la Furia", yt:"AVEDgT_lG60", g:"Rock nacional"},
  {a:"Charly García", t:"Demoliendo Hoteles", yt:"DeMCz0O7-FM", g:"Rock nacional"},
  {a:"Charly García", t:"Los Dinosaurios", yt:"BAuqozi64WQ", g:"Rock nacional"},
  {a:"Sui Generis", t:"Canción para mi Muerte", yt:"1Zjm0uh8oeA", g:"Rock nacional"},
  {a:"Serú Girán", t:"Seminare", yt:"JlV1pg7Wk_oo", g:"Rock nacional"},
  {a:"Fito Páez", t:"El Amor Después del Amor", yt:"knvgOdKPaMQ", g:"Rock nacional"},
  {a:"Fito Páez", t:"Mariposa Tecknicolor", yt:"CRBincBc_8k", g:"Rock nacional"},
  {a:"Fito Páez", t:"11 y 6", yt:"j6pCHLfo0KI", g:"Rock nacional"},
  {a:"Patricio Rey y sus Redonditos de Ricota", t:"Jijiji", yt:"CnJqYsSOgfg", g:"Rock nacional"},
  {a:"Patricio Rey y sus Redonditos de Ricota", t:"Un Poco de Amor Francés", yt:"WlFLpKaC4_c", g:"Rock nacional"},
  {a:"Los Fabulosos Cadillacs", t:"Matador", yt:"pjPA7CXutDw", g:"Rock nacional"},
  {a:"Los Fabulosos Cadillacs", t:"Vasos Vacíos", yt:"8Zdhan166z0", g:"Rock nacional"},
  {a:"Andrés Calamaro", t:"Flaca", yt:"UCF9oHXhDMU", g:"Rock nacional"},
  {a:"Andrés Calamaro", t:"Crímenes Perfectos", yt:"P01hVBLP0_g", g:"Rock nacional"},
  {a:"Gustavo Cerati", t:"Crimen", yt:"Fw0SyCmg7ps", g:"Rock nacional"},
  {a:"Gustavo Cerati", t:"Puente", yt:"eAO7CEcCD3s", g:"Rock nacional"},
  {a:"Babasónicos", t:"Irresponsables", yt:"gZV2Q9zH2eg", g:"Rock nacional"},
  {a:"Almendra", t:"Muchacha (Ojos de Papel)", yt:"lP7_qMRIXTg", g:"Rock nacional"},
  {a:"Luis Alberto Spinetta", t:"Seguir Viviendo Sin Tu Amor", yt:"y13ixMXCzzE", g:"Rock nacional"},
  {a:"Los Piojos", t:"El Farolito", yt:"Jf_Ach2THWs", g:"Rock nacional"},
  {a:"La Renga", t:"El Revelde", yt:"FTW5MdKw98", g:"Rock nacional"},
  {a:"Sumo", t:"La Rubia Tarada", yt:"QuaGBNkdTso", g:"Rock nacional"},
  {a:"Virus", t:"Imágenes Paganas", yt:"mCEbVR7VZxc", g:"Rock nacional"},
  {a:"Los Abuelos de la Nada", t:"Mil Horas", yt:"1To_Wz5RWi0", g:"Rock nacional"},
  {a:"Divididos", t:"¿Qué Ves?", yt:"CJkgBc2S5oY", g:"Rock nacional"},
  {a:"Enanitos Verdes", t:"Lamento Boliviano", yt:"hReAuaAuJOE", g:"Rock nacional"},

  /* ---------- CUMBIA ---------- */
  {a:"Gilda", t:"No Me Arrepiento de Este Amor", yt:"8iUkmnLc1ec", g:"Cumbia"},
  {a:"Gilda", t:"Fuiste", yt:"mm_SwD5PYvY", g:"Cumbia"},
  {a:"Gilda", t:"Corazón Valiente", yt:"yykYZhD4Wwc", g:"Cumbia"},
  {a:"Gilda", t:"Paisaje", yt:"BAuwMLmDrfA", g:"Cumbia"},
  {a:"Los Palmeras", t:"Olvídala", yt:"JSrHOZn_CCo", g:"Cumbia"},
  {a:"Los Palmeras", t:"Bombón Asesino", yt:"UeFC_9oGqWg", g:"Cumbia"},
  {a:"Los Palmeras", t:"Soy Sabalero", yt:"pGjWccgKUgk", g:"Cumbia"},
  {a:"Ráfaga", t:"Mentirosa", yt:"kagJCeQWVOM", g:"Cumbia"},
  {a:"Ráfaga", t:"Una Cerveza", yt:"by4EHmvME1c", g:"Cumbia"},
  {a:"Antonio Ríos", t:"Nunca Me Faltes", yt:"Du1UJyRwmts", g:"Cumbia"},
  {a:"Damas Gratis", t:"Laura se te Ve la Tanga", yt:"jKgCg4cAVcw", g:"Cumbia"},
  {a:"Damas Gratis", t:"Se Te Ve la Cola", yt:"", g:"Cumbia"},
  {a:"Karina", t:"Corazón Mentiroso", yt:"zU3W6RbOmgc", g:"Cumbia"},
  {a:"Los Wachiturros", t:"Tirate un Paso", yt:"gZKYxtDHymc", g:"Cumbia"},
  {a:"Amar Azul", t:"Ella Se Llamaba", yt:"GwGK8nDJ648", g:"Cumbia"},
  {a:"El Polaco", t:"Deja de Llorar", yt:"8TccD2wgBCc", g:"Cumbia"},

  /* ---------- CUARTETO ---------- */
  {a:"Rodrigo", t:"La Mano de Dios", yt:"vmVtgmgLPzw", g:"Cuarteto"},
  {a:"Rodrigo", t:"Soy Cordobés", yt:"EZaO0mgpy6I", g:"Cuarteto"},
  {a:"Rodrigo", t:"Lo Mejor del Amor", yt:"w3OuRpcJ5iY", g:"Cuarteto"},
  {a:"Rodrigo", t:"Ocho Cuarenta", yt:"_0Tc_c3KlFM", g:"Cuarteto"},
  {a:"La Mona Jiménez", t:"Quién Se Ha Tomado Todo el Vino", yt:"YjIhq5dJKQA", g:"Cuarteto"},
  {a:"La Mona Jiménez", t:"Beso a Beso", yt:"Xv2vXP7R-KI", g:"Cuarteto"},

  /* ---------- POP ---------- */
  {a:"Miranda!", t:"Don", yt:"8Dvy2E9lHT8", g:"Pop"},
  {a:"Miranda!", t:"Perfecta", yt:"a3hOeU7w59o", g:"Pop"},
  {a:"Tan Biónica", t:"Ella", yt:"gPfBKoKzf-8", g:"Pop"},
  {a:"Tan Biónica", t:"Ciudad Mágica", yt:"V419yO6FeIU", g:"Pop"},
  {a:"Airbag", t:"Cae el Sol", yt:"FIR-hrPXxzA", g:"Pop"},
  {a:"Los Auténticos Decadentes", t:"Loco (Tu Forma de Ser)", yt:"fgXDHQm5eq4", g:"Pop"},

  /* ---------- URBANO / TRAP (poquito) ---------- */
  {a:"Duki", t:"Goteo", yt:"FRthkpJ_NFo", g:"Urbano / trap"},
  {a:"Wos", t:"Canguro", yt:"l5QAOvBqT3c", g:"Urbano / trap"},
  {a:"Nicki Nicole", t:"Colocao", yt:"kh1sF-sbkbw", g:"Urbano / trap"},
  {a:"Trueno", t:"Dance Crip", yt:"JWRlTezTF2k", g:"Urbano / trap"},
  {a:"Milo J", t:"Rara Vez", yt:"aBSkvI0CkgU", g:"Urbano / trap"},
  {a:"María Becerra", t:"Automático", yt:"H0Gk2wGNtIk", g:"Urbano / trap"},

  /* ---------- CLÁSICOS ---------- */
  {a:"Sandro", t:"Rosa Rosa", yt:"NeGN_cs9yfE", g:"Clásico"},
  {a:"Palito Ortega", t:"La Felicidad", yt:"Z9As8OJ165w", g:"Clásico"},
];
CANCIONES.forEach((c,i)=>{c.id=i; c.label=`${c.a} — ${c.t}`;});
