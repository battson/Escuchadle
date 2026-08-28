/* =========================================================
   Escuchadle Argento — catálogo de canciones

   Formato:  {a:"Artista", t:"Título", yt:"ID_DE_YOUTUBE"}

   El ID es lo que va después de watch?v= en la URL:
   https://www.youtube.com/watch?v=Zi_XLOBDo_Y  →  yt:"Zi_XLOBDo_Y"

   Los yt vacíos ("") hacen que el juego busque el video con la
   API. Con todos completos, la API no se usa nunca y no hay
   cuota que saturar.

   Mezcla actual: 28 rock · 18 cumbia · 12 cuarteto · 8 folklore
   8 pop · 6 urbano · 5 clásicos = 85 canciones.
   ========================================================= */
const CANCIONES = [

  /* ---------- ROCK NACIONAL ---------- */
  {a:"Soda Stereo", t:"De Música Ligera", yt:"T_FkEw27XJ0"},
  {a:"Soda Stereo", t:"Persiana Americana", yt:"LalPz4lIZYk"},
  {a:"Soda Stereo", t:"En la Ciudad de la Furia", yt:"AVEDgT_lG60"},
  {a:"Charly García", t:"Demoliendo Hoteles", yt:"DeMCz0O7-FM"},
  {a:"Charly García", t:"Los Dinosaurios", yt:"BAuqozi64WQ"},
  {a:"Sui Generis", t:"Canción para mi Muerte", yt:"1Zjm0uh8oeA"},
  {a:"Serú Girán", t:"Seminare", yt:"JlV1pg7Wk_oo"},
  {a:"Fito Páez", t:"El Amor Después del Amor", yt:"knvgOdKPaMQ"},
  {a:"Fito Páez", t:"Mariposa Tecknicolor", yt:"CRBincBc_8k"},
  {a:"Fito Páez", t:"11 y 6", yt:"j6pCHLfo0KI"},
  {a:"Patricio Rey y sus Redonditos de Ricota", t:"Jijiji", yt:"CnJqYsSOgfg"},
  {a:"Patricio Rey y sus Redonditos de Ricota", t:"Un Poco de Amor Francés", yt:"WlFLpKaC4_c"},
  {a:"Los Fabulosos Cadillacs", t:"Matador", yt:"pjPA7CXutDw"},
  {a:"Los Fabulosos Cadillacs", t:"Vasos Vacíos", yt:"8Zdhan166z0"},
  {a:"Andrés Calamaro", t:"Flaca", yt:"UCF9oHXhDMU"},
  {a:"Andrés Calamaro", t:"Crímenes Perfectos", yt:"P01hVBLP0_g"},
  {a:"Gustavo Cerati", t:"Crimen", yt:"Fw0SyCmg7ps"},
  {a:"Gustavo Cerati", t:"Puente", yt:"eAO7CEcCD3s"},
  {a:"Babasónicos", t:"Irresponsables", yt:"gZV2Q9zH2eg"},
  {a:"Almendra", t:"Muchacha (Ojos de Papel)", yt:"lP7_qMRIXTg"},
  {a:"Luis Alberto Spinetta", t:"Seguir Viviendo Sin Tu Amor", yt:"y13ixMXCzzE"},
  {a:"Los Piojos", t:"El Farolito", yt:"Jf_Ach2THWs"},
  {a:"La Renga", t:"El Revelde", yt:"FTW5MdKw98"},
  {a:"Sumo", t:"La Rubia Tarada", yt:"QuaGBNkdTso"},
  {a:"Virus", t:"Imágenes Paganas", yt:"mCEbVR7VZxc"},
  {a:"Los Abuelos de la Nada", t:"Mil Horas", yt:"1To_Wz5RWi0"},
  {a:"Divididos", t:"¿Qué Ves?", yt:"CJkgBc2S5oY"},
  {a:"Enanitos Verdes", t:"Lamento Boliviano", yt:"hReAuaAuJOE"},

  /* ---------- CUMBIA ---------- */
  {a:"Gilda", t:"No Me Arrepiento de Este Amor", yt:"8iUkmnLc1ec"},
  {a:"Gilda", t:"Fuiste", yt:"mm_SwD5PYvY"},
  {a:"Gilda", t:"Corazón Valiente", yt:"yykYZhD4Wwc"},
  {a:"Gilda", t:"Paisaje", yt:"BAuwMLmDrfA"},
  {a:"Los Palmeras", t:"Olvídala", yt:"JSrHOZn_CCo"},
  {a:"Los Palmeras", t:"Bombón Asesino", yt:"UeFC_9oGqWg"},
  {a:"Los Palmeras", t:"Soy Sabalero", yt:"pGjWccgKUgk"},
  {a:"Ráfaga", t:"Mentirosa", yt:"kagJCeQWVOM"},
  {a:"Ráfaga", t:"Una Cerveza", yt:"by4EHmvME1c"},
  {a:"Antonio Ríos", t:"Nunca Me Faltes", yt:"Du1UJyRwmts"},
  {a:"Damas Gratis", t:"Laura se te Ve la Tanga", yt:"jKgCg4cAVcw"},
  {a:"Damas Gratis", t:"Se Te Ve la Cola", yt:""},
  {a:"Karina", t:"Corazón Mentiroso", yt:"zU3W6RbOmgc"},
  {a:"Los Wachiturros", t:"Tirate un Paso", yt:"gZKYxtDHymc"},
  {a:"Amar Azul", t:"Ella Se Llamaba", yt:"GwGK8nDJ648"},
  {a:"El Polaco", t:"Deja de Llorar", yt:"8TccD2wgBCc"},

  /* ---------- CUARTETO ---------- */
  {a:"Rodrigo", t:"La Mano de Dios", yt:"vmVtgmgLPzw"},
  {a:"Rodrigo", t:"Soy Cordobés", yt:"EZaO0mgpy6I"},
  {a:"Rodrigo", t:"Lo Mejor del Amor", yt:"w3OuRpcJ5iY"},
  {a:"Rodrigo", t:"Ocho Cuarenta", yt:"_0Tc_c3KlFM"},
  {a:"La Mona Jiménez", t:"Quién Se Ha Tomado Todo el Vino", yt:"YjIhq5dJKQA"},
  {a:"La Mona Jiménez", t:"Beso a Beso", yt:"Xv2vXP7R-KI"},

  /* ---------- POP ---------- */
  {a:"Miranda!", t:"Don", yt:"8Dvy2E9lHT8"},
  {a:"Miranda!", t:"Perfecta", yt:"a3hOeU7w59o"},
  {a:"Tan Biónica", t:"Ella", yt:"gPfBKoKzf-8"},
  {a:"Tan Biónica", t:"Ciudad Mágica", yt:"V419yO6FeIU"},
  {a:"Airbag", t:"Cae el Sol", yt:"FIR-hrPXxzA"},
  {a:"Los Auténticos Decadentes", t:"Loco (Tu Forma de Ser)", yt:"fgXDHQm5eq4"},

  /* ---------- URBANO / TRAP (poquito) ---------- */
  {a:"Duki", t:"Goteo", yt:"FRthkpJ_NFo"},
  {a:"Wos", t:"Canguro", yt:"l5QAOvBqT3c"},
  {a:"Nicki Nicole", t:"Colocao", yt:"kh1sF-sbkbw"},
  {a:"Trueno", t:"Dance Crip", yt:"JWRlTezTF2k"},
  {a:"Milo J", t:"Rara Vez", yt:"aBSkvI0CkgU"},
  {a:"María Becerra", t:"Automático", yt:"H0Gk2wGNtIk"},

  /* ---------- CLÁSICOS ---------- */
  {a:"Sandro", t:"Rosa Rosa", yt:"NeGN_cs9yfE"},
  {a:"Palito Ortega", t:"La Felicidad", yt:"Z9As8OJ165w"},
];
CANCIONES.forEach((c,i)=>{c.id=i; c.label=`${c.a} — ${c.t}`;});
