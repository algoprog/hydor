# Apps

Una app es una tarea que ejecutas una y otra vez: rellenas un formulario corto, pulsas Ejecutar, y un agente hace el trabajo y te entrega el resultado, en una vista pensada para ello (páginas por las que puedes navegar y en las que puedes actuar, con mapas, gráficos, imágenes y videos) o como una tarjeta y tablas. Este tema cubre las apps listas para usar, cómo ejecutar una, las claves que necesita una app, cómo pedirle a un agente que ejecute una por ti en cualquier sesión, cómo crear la tuya (pasos, una vista, sus propios archivos, datos, memoria, una pantalla), cómo compartir una (una clave de API, otros agentes, una página pública, filas de un CSV) y cómo pasarla a otra persona como archivo. Los servicios a los que se conectan los agentes están junto a las apps: consulta [Apps conectadas, claves y herramientas](/guide/connections).

![Apps: las tuyas y las listas para usar, que vienen instaladas](images/apps.webp)

## Qué es una app

Una app es una pequeña herramienta para un trabajo concreto que te ayuda a ver y encontrar información: respondes unas cuantas preguntas, sus pasos buscan datos y los elaboran, y la respuesta aparece en una vista pensada para ello (mapas, gráficos, tablas, tarjetas). Puedes usarla de dos maneras: abrirla en la página Apps, o simplemente pedir lo que hace en cualquier sesión, y el agente la ejecuta por ti allí. Las apps son pequeñas a propósito: cada una responde bien a un tipo de pregunta, en lugar de ser un programa grande.

Una app contiene todo lo que necesita una tarea, salvo los detalles que cambian cada vez:

- **El formulario**: las preguntas que alguien responde antes de cada ejecución (“¿A dónde?”, “Cuántos días”).
- **La tarea**: lo que se le pide al agente, con las respuestas incluidas.
- **La respuesta**: los campos del resultado (un resumen, una lista, una tabla) que el agente rellena cuando termina. Una app sin campos de respuesta da en su lugar la respuesta del agente.
- **Quién lo hace**: el agente, su modelo, su modo y las herramientas que puede usar.

Cada vez que ejecutas una app, Hydor empieza una sesión con la tarea ya rellenada. El agente la trabaja de principio a fin sin detenerse a preguntarte: hace suposiciones razonables y dice cuáles fueron. Ese único recorrido se llama **ejecución**. Después puedes pedir cambios en el resultado, y el agente entrega uno actualizado.

Abre la página Apps desde el icono **Apps** de la barra de iconos, o ve a [/apps](/apps). En un teléfono la barra lateral es un cajón: ábrelo primero. También puedes encontrar cualquier app, tuya o lista para usar, escribiendo su nombre en el cuadro de búsqueda (Ctrl+K, ⌘K en una Mac).

## Cómo moverte por la página Apps

En una computadora la página tiene una columna junto a la barra de iconos, como Configuración: el logotipo de Hydor, **Nueva app** (su menú tiene **Descríbela a un agente**, **Empezar desde cero** e **Instalar desde un archivo**) y **Ocultar barra lateral** (Ctrl+B; **Mostrar barra lateral** la vuelve a mostrar), y debajo los lugares de la página, cada uno con cuántas apps contiene y el abierto marcado:

- **Todas las apps**: la página completa, como se describe más abajo.
- **Fijadas**, **Usadas recientemente** y **Tus propias apps**: cada una muestra solo esa parte. **Fijadas** y **Usadas recientemente** aparecen cuando tienen algo; **Tus propias apps** siempre está, con **Crear una app**.
- **Tipos**, una etiqueta sobre una fila por cada tipo de app con su número (**Investigación**, **Planificando**, **Compras**, **Trabajo**, **Escritura**, **Aprendizaje**, **Construir**, **Clima**, **Deportes**, **Comida**, **Diversión**, **Laboratorio** y así sucesivamente, cuando hay dos o más): las apps de ese tipo, las tuyas y las listas para usar.
- **Apps conectadas**, después de una línea: los servicios que puede usar cualquier agente, conectados una sola vez, con las claves que usan ([Abrir Apps conectadas](/guide/connections#open-connected-apps)). Su fila las cuenta.

El lugar está en la dirección (`/apps`, `/apps?place=pinned`, `/apps?place=recent`, `/apps?place=own`, `/apps?kind=Research`, `/apps/connected`), así que un enlace lo abre. En la parte superior de la página, una fila nombra el lugar a la izquierda (**Todas las apps**, **Fijadas**, **Investigación**, **Apps conectadas**) y tiene el cuadro de búsqueda a la derecha, con lo que ese lugar tiene a su lado: el orden de **Tus propias apps**, o **Últimas ejecuciones** de **Usadas recientemente**. Al elegir otro lugar se vacía el cuadro de búsqueda. En una ventana estrecha y en un teléfono no hay columna: la página lleva el título **Apps**, con dos pestañas, **Apps de agentes** y **Apps conectadas**, cada una con su número; **Nueva app** está en la parte superior de **Apps de agentes**; y los tipos son chips bajo la fila del título. **Todas las apps**, de arriba abajo (los demás lugares muestran solo su parte, bajo la misma fila):

- **Busca una app: el clima, recetas, un viaje…**: un cuadro que encuentra cualquier app mientras escribes, por su nombre, su tipo o lo que hace (cada palabra que escribas debe encajar en algún sitio, y un plural encuentra su singular: “recetas” encuentra una app de recetas), entre las tuyas, las listas para usar, las que desinstalaste y los bloques de construcción, con la mejor coincidencia primero. Intro abre la primera; Esc vacía el cuadro. Está a la derecha de la fila con el título de la página (**Todas las apps**, o el lugar que elegiste), y se queda arriba mientras la página se desplaza. En el lugar de un tipo busca entre las apps de ese tipo; en los demás, entre todas. Sin la columna, debajo, hay un chip por cada tipo de app con cuántas tiene (primero **Todos**, luego los tipos de las apps listas para usar), para mostrar un solo tipo.
- **Fijadas**: las apps que más usas, como mosaicos grandes en el orden en que las pusiste, cada una a un toque de abrirse. **Fijar arriba**, en el menú **Más** (⋯) de la tarjeta de una app o en el menú **Más** de su propia página, la pone aquí, y **Dejar de fijar** allí la quita. Arrastra un mosaico para moverlo (en un teléfono, mantenlo pulsado primero), o usa el menú **Más** (⋯) del mosaico: **Dejar de fijar**, **Mover a la izquierda** y **Mover a la derecha**. Hasta 12 apps; la app las conserva, así que todos los dispositivos muestran las mismas.
- **Usadas recientemente**: las apps que ejecutaste hace poco, cada una una sola vez, la más reciente primero (hasta 8): desde su formulario, desde su propia página o pantalla, o ejecutadas por un agente en un chat. Cada tarjeta dice qué se le pidió por última vez, cómo va esa ejecución y cuándo, con **Abrir el resultado** (una app con vista propia se abre en su página), **Responder** mientras espera una respuesta tuya, **Seguirla** mientras trabaja, o **Abrir la ejecución** cuando falló o se detuvo; y **Ejecutar de nuevo**, que abre su formulario rellenado con las mismas respuestas. **Últimas ejecuciones**, junto al título, despliega tus últimas ejecuciones (hasta seis) como una lista; antes de que hayas usado una app, son la parte, con ese nombre. Las ejecuciones de filas de un CSV y de páginas públicas se quedan fuera de esa lista, bajo su propia app, igual que las de una app que se abre en su propia página (Explore), que muestra allí la última. Hasta que fijes una, una línea te dice que fijes las que más usas desde su menú ⋯.
- **Empezar con**: antes de que hayas ejecutado ninguna app, cuatro apps listas para usar que la mayoría de la gente usa (**Perspectiva del clima**, **Planificador de viajes**, **Cocina con lo que tienes** y **Comparar productos**), cada una a un clic de su formulario, con una línea sobre qué son las apps y **Más información** ([Qué es una app](#what-an-app-is)).
- **Tus propias apps**: las que creaste o instalaste desde un archivo, con cuántas hay, y el mosaico **Crear una app**, que abre una nueva app (para describirla a un agente, empezar desde cero o instalar un archivo). A partir de cuatro apps tuyas, el botón junto al título las ordena por **Más usadas**, **De la A a la Z** o **Más reciente**; este dispositivo recuerda tu elección.
- **Apps listas para usar**: las que vienen con Hydor, instaladas, bajo sus tipos (**Investigación**, **Planificando**, **Compras**, **Clima**, **Deportes**, **Comida**, **Diversión** y el resto): ejecuta una, o hazla tuya para cambiarla.

Todas las tarjetas, también las tuyas, tienen el mismo tamaño: su icono, nombre y lo que hace, luego lo que pide (las preguntas de su formulario, o **Lista para ejecutar**), pequeñas marcas (apunta a una para ver su texto: su respuesta se abre en una vista propia, con mapas, gráficos y tablas; funciona en chats, así que puedes pedir lo que hace en cualquier sesión y el agente la ejecuta allí; necesita una clave que la app aún no tiene; **Pública** cuando su página pública está abierta), **No instalada** o **Bloque de construcción** donde corresponda, y cuándo se ejecutó por última vez. Su menú **Más** (⋯, arriba a la derecha; en una computadora aparece al apuntar a la tarjeta) tiene **Abrir**, **Fijar arriba** (o **Dejar de fijar**) y **Descargar como archivo**. Cuando nada coincide con lo que escribiste, la página dice “Ninguna app hace eso todavía”, con **Descríbela a un agente**, que inicia el Creador de apps con tus palabras.

Debajo:

- **Apps listas para instalar**: aparecen cuando desinstalas una app lista para usar. Cada tarjeta muestra su tipo, lo que hace y lo que obtienes de ella (las páginas de su vista, como las del Planificador de viajes: **Tu viaje**, **Día por día**, **Reservar con antelación** y **Presupuesto**), e **Instalar** (consulta [Instalar o desinstalar una app lista para usar](#install-or-uninstall-a-ready-made-app)).
- **Bloques de construcción** (plegados, con su número): apps pequeñas hechas para ser pasos de las tuyas (resumir una página, traducir, responder desde la web, clasificar por tipos, extraer los datos), con los bloques que hiciste tú; **Añadir un paso** los ofrece en los pasos de cada app.

El estado de una ejecución se muestra como una insignia: **Esperando** (en cola), **Iniciando**, **Funcionando**, **Te necesita** (espera una aprobación o una respuesta), **Hecho**, **Fallido** o **Detenidas**.

Suelta el archivo de una app (`.hydor-app` o `.json`) en cualquier parte de la página para instalarla: primero se abre la tarjeta que dice qué es (consulta [Compartir una app como archivo](#share-an-app-as-a-file)).

En un teléfono la página es una sola columna, sin los lugares (sus dos pestañas y los chips de tipos los sustituyen): las apps fijadas y las usadas recientemente son filas que se desplazan hacia los lados, igual que los chips de tipos, y las tarjetas se limitan a su nombre y lo que hacen.

## Usar una app ya hecha

Estas apps vienen con Hydor, ya instaladas: están entre **Tus apps** desde el principio, y los agentes pueden ejecutarlas por ti en tus sesiones (consulta [Pedir a un agente que ejecute una app por ti](#have-an-agent-run-an-app-for-you)). Cada una funciona por pasos: su página muestra **Cómo funciona**, y **Como grafo** (o **Hacerla mía**) las abre en el constructor. Cada una entrega su respuesta en una vista propia, con páginas para sus partes y botones que hacen cosas (consulta [Su vista](#its-view)). Sus pasos de agente se ejecutan con Claude Code, a menos que elijas otro agente en su página; sus pasos rápidos usan el modelo auxiliar (Configuración → Modelos). Las que tienen una pregunta del tipo “Déjame…” esperan a que intervengas a mitad de camino solo cuando la marcas y hay alguien para responder: al ejecutarlas desde su formulario, o cuando las ejecuta un agente en una de tus sesiones.

- **Informe de investigación profunda**: un informe con fuentes sobre cualquier pregunta, con búsqueda en la web, datos contrastados y cada afirmación citada. Tú indicas el tema, en qué centrarse, la profundidad y para quién es. Planifica las preguntas, las busca de tres en tres, ordena las fuentes, lee las mejores páginas lado a lado, vuelve a buscar donde una pregunta tiene pocas fuentes y redacta el informe con citas numeradas; **Déjame revisar primero las preguntas** hace que espere a que las conserves o las cambies. Su vista tiene **Resumen** (la pregunta, qué tan seguro está y los hallazgos clave, cada uno con **Profundizar**, que inicia un informe propio sobre ese hallazgo), **Informe completo** (con **Copiar el informe**) y **Fuentes**, que puedes mostrar por editorial.
- **Planificador de viajes**: un plan día por día comprobado con tus fechas (horarios de apertura, eventos, tiempos de traslado), con un presupuesto y lo que conviene reservar con antelación. Calcula las fechas y luego busca eventos y festivos, el clima (el pronóstico cuando el viaje es dentro de diez días o menos), qué ver y dónde alojarse, y cómo moverse, todo en paralelo, antes de planificar los días y sumar el presupuesto; **Déjame elegir antes de que planifique** hace que te pregunte dónde alojarte y qué no puede faltar. Su vista tiene **Tu viaje** (el viaje en cifras, el plan, los días de un vistazo y consejos; **Relajado**, **Equilibrado** o **Completo**, y **+ Un día más**, vuelven a planificarlo así), **Día por día** (una cronología donde marcas cada mañana, tarde y noche, con cada día encabezado por una imagen de su lugar principal y un mapa de la zona de cada día), una página para cada día (su imagen, con **Copiar el día** e **Investigación** sobre su zona), **Mapa** (la zona de cada día en un mapa, numerada y unida en orden), **Reservar con antelación** (una lista para ir marcando a medida que reservas) y **Presupuesto** (un gráfico y cada estimación).
- **Comparar productos**: precios actuales, reseñas independientes y problemas conocidos, sopesados según lo que te importa, con una recomendación clara. Cuando describes una necesidad en lugar de nombrar productos, primero encuentra las opciones (**Déjame elegir cuáles comparar**); luego investiga cada una, de tres en tres, las puntúa y las ordena según lo que te importa. Su vista tiene **La elegida** (el producto con su imagen, su precio y el porqué, y los otros que sopesó), **Lado a lado** (la puntuación de cada uno sobre 100 en un gráfico y, después, cada uno con su imagen, sus puntos fuertes y débiles, y la elegida marcada), una página para cada producto (con **Investigar qué tan bien se sostiene**) y **Ojo con**. Su respuesta nombra también **La elegida**, tal como la indica la comparación, para los programas.
- **Preguntas y respuestas sobre un documento**: respuestas a partir de un documento que adjuntas, cada una con el pasaje exacto y dónde está. Lee el documento, encuentra los pasajes para cada pregunta, responde de tres en tres con un resumen al lado, y pide a un agente que lo lea todo cuando una pregunta sigue sin respuesta. Su vista tiene **Respuestas** (cada una con su pasaje y dónde está; **Buscar una pregunta** las filtra, y **Preguntar más sobre este documento** la ejecuta de nuevo con preguntas nuevas y el mismo archivo) y **El documento**.
- **De las notas de la reunión a las acciones**: decisiones, acciones con responsables y fechas, preguntas abiertas y un correo de seguimiento, a partir de notas sin pulir o de una transcripción. Divide las notas, extrae lo que se decidió, calcula las fechas de entrega a partir de hoy y te pregunta quién asume las acciones que nadie asumió (**Pregúntame quién asume lo que nadie asumió**). Su vista tiene **Resumen** (quiénes vinieron, la reunión en cifras, el resumen y lo que se decidió), **Acciones** (marca cada una cuando esté hecha, o muestra las de una persona), **Correo de seguimiento** (con **Copiar el correo**) y **Aún abiertas**.
- **Carta de presentación**: una carta para un empleo concreto, basada en pruebas reales de tu trayectoria, con los vacíos señalados con honestidad. Lee la oferta, deduce lo que pide el puesto, investiga la empresa mientras empareja tus pruebas, escribe la carta y luego la revisa y la corrige hasta dos veces. Su vista tiene **La carta** (en una página propia, con **Copiar la carta**; **Cálido**, **Seguro** o **Formal**, y **Corto** o **Estándar**, la escriben de nuevo así), **Por qué encajas** (cada requisito junto a tu prueba) y **Vacíos para los que prepararse**, para ir marcando.
- **Plan de clase**: una clase cronometrada planificada a partir de sus objetivos, con actividades, comprobaciones de comprensión, apoyo y ampliación. Verifica los datos que enseña y reparte los minutos para que cuadren. Su vista tiene **Resumen** (los objetivos y los materiales que marcas a medida que los preparas), **Cronología** (la clase como una sola franja, con cada actividad tan ancha como sus minutos, y luego cada actividad), **Respaldo y verificaciones** y **Plan completo** (con **Copiar el plan**).
- **Resumen semanal de noticias**: la última semana en los temas que sigues, a partir de reportajes originales, con los duplicados fusionados y por qué importa cada noticia. Busca la semana de cada tema, de tres en tres, fusiona las noticias repetidas, lee las mejores y decide cuáles conservar. Su vista tiene **Noticias** (cada una con la imagen de su propia página; muestra las de un tema, marca cada una como leída o usa **Investigación** en una) y **El resumen** (con **Copiar el resumen**).
- **Explicar un contrato**: lo que dice un acuerdo, en palabras sencillas: términos clave, fechas, lo que es inusual y qué preguntar antes de firmar. Adjunta el archivo o pega el texto. Lo divide en cláusulas, lee las partes lado a lado y pide a un agente que revise de nuevo cualquier cosa seria. Su vista tiene **En breve** (qué dice, las señales de alerta en cifras y las preguntas que conviene hacer, con **Copiar las preguntas**), **Señales de alerta** (por gravedad, para mostrar un solo tipo), **Términos clave** y **Fechas**.
- **Crear una app web pequeña**: una app que funciona a partir de una descripción, en HTML, CSS y JavaScript sencillos que se abre desde un archivo, probada antes de entregártela. Planifica la app (**Déjame revisar el plan antes de crearla**), la crea, la prueba y la corrige hasta que pasen las pruebas, como máximo dos veces. Su vista tiene **Lo que se creó** (cómo abrirla, sus archivos y **Crearlo de nuevo con un cambio**) y **Próximos pasos**, para ir marcando.

Las apps para cosas de todos los días son más pequeñas y rápidas: obtienen datos reales de servicios gratuitos cuando los hay (Open-Meteo para el clima, TheSportsDB, TheMealDB para recetas, TVmaze, CheapShark, Open Library, Wikipedia, Wikidata, OpenStreetMap), un programa calcula lo que debe salir exacto, y un modelo rápido lee, elige y lo dice en palabras sencillas. Ninguna necesita una clave.

- **Perspectiva del clima**: los próximos días en cualquier lugar: máximas, mínimas y probabilidad de lluvia en gráficos, las próximas 48 horas, los mejores días para lo que planeas, qué ponerse y de qué estar pendiente. Indica un lugar (una ciudad, o una con su región, como “París, Texas”). Su vista tiene **Pronóstico** (el clima ahora, cada día como una casilla que abre sus horas, y los gráficos; **En °F** o **En °C**, y **Mirar 14 días adelante**, la ejecutan de nuevo así), **Próximas 48 horas** y **Qué ponerse** (con **Copiar el pronóstico**), **Mejores meses para ir** y un mapa del lugar.
- **La mejor época para ir**: el clima mes a mes en cualquier lugar, promediado de los últimos cinco años: temperaturas, días de lluvia y horas de sol en gráficos, con cada mes puntuado según lo que quieras hacer allí (turismo urbano, playa, senderismo, nieve, escapar del calor). Su vista tiene **Mes a mes** (una foto del lugar en la parte superior, los mejores meses, los doce meses coloreados según lo bien que encajan, los gráficos; **Ideal para** elige otro tipo de viaje), **Cuándo ir** (los mejores meses y por qué, los meses que conviene evitar, consejos) y **Los números**.
- **Seguimiento de equipo**: los próximos partidos de cualquier equipo, sus últimos resultados y su forma, en qué puesto está y las noticias de la semana. Su vista tiene **El equipo** (su escudo, su forma en letras de colores, el próximo partido con **Ver vista previa**), **Resultados** (goles a favor y en contra en un gráfico), **Calendario de partidos** (cada uno con **Vista previa**, que inicia una Previa del partido) y **Noticias**.
- **Previa del partido**: dos equipos antes de enfrentarse: su forma, sus últimos enfrentamientos, las noticias de los equipos y lo que esperan los expertos, con las probabilidades de cada resultado. Su vista tiene **Vista previa** (ambos escudos, el resultado probable, las probabilidades como una sola barra), **Forma y reuniones** (quién ganó sus últimos enfrentamientos, en un gráfico) y **Noticias del equipo** (con **Copiar la vista previa**) y **Seguir** al equipo.
- **Cocina con lo que tienes**: recetas para lo que hay en tu refrigerador: qué usa cada una de lo tuyo y qué te haría falta, con fotos, los pasos con sus tiempos y un video cuando lo hay. Indica tu dieta y cuánto tiempo tienes; la sal, el aceite y las especias cuentan como disponibles, salvo que digas lo contrario. Su vista tiene **Recetas** (**Algo más rápido** la ejecuta de nuevo), una página para cada receta (sus pasos como una sola franja de minutos, que marcas mientras cocinas, sus ingredientes marcados cuando los tienes, **Copiar los pasos**) y **Qué comprar**.
- **Plan de comidas y lista de compras**: cenas para una semana (hasta dos) elegidas según tu hogar, tu dieta y tus gustos, cada una con su receta y su foto, y una sola lista de compras para todas, con las cantidades sumadas, por pasillo. Su vista tiene **La semana** (**Planificar otra semana**), una página para cada cena (sus ingredientes, preparación y video), **Lista de compras** (muestra un pasillo, marca las cosas mientras compras, **Copiar la lista**) y **Consejos**.
- **Ideas de regalo**: regalos pensados para alguien dentro de tu presupuesto, objetos y experiencias, cada uno con el porqué de que le guste, su precio habitual y uno para comprar ya, con su precio y su tienda. Su vista tiene **Ideas** (cada una con una imagen del que conviene comprar, por tipo; **☆ Conservar** las que te gusten, **Más como este** la ejecuta de nuevo) y **Por precio** (los rangos de precio en un gráfico).
- **Qué ver**: películas y series elegidas según tu ánimo de esta noche, con dónde se ve cada una en tu país (primero en tus servicios), su duración, su tráiler y por qué encaja. Su vista tiene **Esta noche** (la elegida para esta noche y luego las demás; un ▶ en una imagen indica que tiene tráiler), una página para cada una (con su tráiler reproduciéndose ahí, con **Ya lo vi: elegir de nuevo**) y **Lado a lado**.
- **Buscador de juegos**: juegos elegidos según lo que te gusta y dónde juegas (Nintendo Switch 2 entre las opciones), ya disponibles, próximos a salir (con la fecha de cada uno) o ambos, cada uno con su imagen y su tráiler, por qué encaja y cuánto se tarda en terminarlo; para PC, el mejor precio de hoy y su mínimo histórico. Su vista tiene **Juegos** (un ▶ en una imagen indica que tiene tráiler, y un juego que aún no ha salido indica cuándo sale), una página para cada uno (con su tráiler reproduciéndose ahí, con su oferta y **Más como este**), **Precios** (actuales y mínimos, en un gráfico) y **Tiempo para terminar**.
- **Cuestionario sobre cualquier tema**: un cuestionario para jugar en su página, con datos tomados de Wikipedia: eliges una respuesta y te muestra si acertaste y por qué, con tu puntuación arriba; las respuestas se mezclan cada vez. Su vista tiene **Jugar el cuestionario** (**Empezar de nuevo**, **Una más difícil**, **Preguntas nuevas**), **Respuestas** y **Sobre el tema** (con **Copiar el cuestionario**).
- **Buscador de libros**: libros que probablemente te encantarán, a partir de los que ya te gustaron, cada uno comprobado en Open Library para ver su portada, sus páginas y su valoración. Su vista tiene **Tu estante** (una página para cada libro, con **Más como este**) y **Lista de lectura** (**Marcar como leído**).
- **Qué hay**: cosas que hacer en una ciudad los días que elijas (el próximo fin de semana si no indicas otra cosa): conciertos, mercados, exposiciones y planes en familia encontrados en la web, con el clima de cada día. Su vista tiene **Por día** (cada evento con la imagen de su propia página), **Mapa** (cada lugar numerado) y **Por tipo**; marca a lo que vas (**¿Vas?**) o usa **Copiar la lista**.
- **Plan de ahorro**: cómo alcanzar una meta de ahorro para una fecha: cuánto apartar cada mes con el interés incluido, el saldo creciendo en un gráfico y cuándo llegarías ahorrando un 20 % más o menos. Su vista tiene **El plan** (**Ahorrar 50 más al mes** o **Ahorrar 50 menos**, cuando indicaste una cantidad), **Mes a mes** (los hitos y cada mes) y **Consejos**.
- **Graficar mis datos**: una hoja de cálculo, un CSV o números que pegas, convertidos en hasta tres gráficos del tipo que mejor les va, con lo que muestran en unas pocas frases. Su vista tiene **Gráficos**, **Lo que muestran los datos** (cada hallazgo, para copiar) y **Los datos** (sus columnas resumidas, y **Hacer otra pregunta sobre estos datos**).
- **Un tema como línea de tiempo**: cualquier tema como una línea de tiempo, leída de Wikipedia: sus momentos clave con fechas (hasta treinta **A fondo**), sus épocas y la historia en resumen. Su vista tiene **La línea de tiempo** (muestra un solo hilo; **Hazme un cuestionario sobre esto** inicia un cuestionario sobre el tema) y **En un gráfico** (los momentos por año, los puntos de inflexión más grandes, y las épocas).
- **Explorar un lugar**: qué hay alrededor de cualquier lugar (una ciudad, un barrio o un monumento), en un mapa: primero los tipos de lugar que nombres en **Lo que te gusta** (parques para perros, cafés, parques infantiles…), de OpenStreetMap; luego los sitios más conocidos de Wikipedia y Wikidata, y después museos, parques y monumentos, con una imagen y una línea cada uno, con lo mejor para ti destacado y puesto en orden de recorrido a pie. Si no nombras nada, trabaja solo con los sitios de interés. Su vista tiene **El paseo** (las paradas numeradas y unidas en el mapa, cada una para marcar como vista; **El clima allí**) y **Todo lo que hay alrededor** (muestra un solo tipo).

Las apps para la investigación y el laboratorio te mantienen al día en tu campo, leen y comprueban artículos, y se ocupan de tus experimentos e informes. Varias se abren en su propia página y pueden actualizarse solas, como hace Explorar; el tema [Investigación](/guide/researchers) cuenta cómo encajan entre sí.

- **Radar de artículos**: cada mañana, los artículos nuevos de tu campo (los de arXiv, en las categorías, sobre los temas y de las personas que sigues, y los de OpenAlex sobre tus temas), ordenados según tus proyectos, temas y perfil, cada uno con lo que hace en una frase y por qué te importa. Se abre en su propia página y puede actualizarse cada día. Su vista tiene **Hoy** (los artículos bajo el proyecto o tema al que encaja cada uno, con **☆ Guardar**, **Citar**, **PDF**, **Profundizar** y **No es para mí**, que orientan las selecciones de los días siguientes) y **Artículos guardados** (con **Copiar todo como BibTeX** y **Agregar a la lista de lectura**). Consulta [Mantente al día en tu campo](/guide/researchers#keep-up-with-your-field).
- **Alertas de citas**: quién ha citado tus artículos desde la última vez que miró, con la frase que te cita (la mención de tu artículo marcada) y si se apoya en tu trabajo, lo compara, lo discute o lo menciona. Se abre en su propia página. Su vista tiene **Nueva** (las citas nuevas por artículo tuyo; muestra un solo tipo) y **Tus artículos** (cada uno con sus citas y cuántas son nuevas).
- **Vigilancia de modelos nuevos**: modelos nuevos de un tipo en Hugging Face (rerankers, embedders y más), comprobados según tus licencias, tamaño y descargas, con la ficha de cada uno resumida y, con tu comando de evaluación, cada uno ejecutado en Experimentos, que te avisa solo cuando alguno supera tu mejor resultado. Se abre en su propia página. Su vista tiene **Modelos** (en qué punto está cada uno, qué dice su ficha, su puntuación) y **Tu evaluación**.
- **Radar de fechas límite**: las fechas límite de tus congresos tomadas de las listas abiertas ccfddl y ai-deadlines, convertidas de AoE (o de la zona que indique su convocatoria) a la tuya, con recordatorios en los días que indiques (14, 3 y 1) en una sola notificación, y el límite de páginas y la plantilla de cada convocatoria enlazados. Se abre en su propia página. Su vista tiene **Cronología** (cada fecha límite con el tiempo que queda, **Copiar los plazos**, **Mostrar las pasadas**) y **Congresos**.
- **Trabajos relacionados al día**: una página por tema que crece a medida que aparecen artículos (los de arXiv y OpenAlex, y los artículos que citan tus artículos semilla), cada artículo resumido y con su relación indicada, agrupados en temas, con los nuevos marcados. Se abre en su propia página. Su vista tiene **Trabajos relacionados** (cada tema, agrupado por temas, con **Redactar los trabajos relacionados**, una sección en LaTeX con claves `\cite` escrita por un agente, **Exportar BibTeX** y **Sin relación** en un artículo) y **Nuevo esta vez**.
- **Buscador de huecos**: ideas de proyecto a partir de tus artículos cruzados con los de este mes en un área, cada una comprobada contra trabajos previos (**nueva**, **hecho en parte** o **ya hecha**, con el artículo más cercano) y dimensionada según la capacidad de cómputo que tienes, con su primer experimento. Su vista tiene **Ideas de investigación** (cada una con **Planificarlo**, que abre con ella la app Sprint de investigación, y **Profundizar**) y **Lo que cruzó**.
- **Lista de lectura**: tus artículos por proyecto, cada uno con su PDF, BibTeX, etiquetas, estado y notas, sincronizados con Zotero. Se abre en tus artículos: **+ Agregar** busca uno por su DOI, id de arXiv, enlace o título y lo rellena (uno que ya tienes se completa, no se agrega de nuevo); búscalos, muestra un solo estado, etiqueta o proyecto, y marca cada uno como **Por leer**, **Leyendo ahora** o **Lectura terminada**. La página de cada artículo tiene sus enlaces, notas y BibTeX, y **Reproducirlo**; **Por proyecto** cuenta los artículos de cada proyecto. **Más** tiene **Importar un .bib**, **Exportar un .bib** y **Sincronizar con Zotero** (te pide su clave la primera vez), y los artículos marcados forman una **Matriz de literatura**. Consulta [Lee y organiza artículos](/guide/researchers#read-and-organise-papers).
- **Matriz de literatura**: artículos leídos lado a lado en una hoja de cálculo: una fila para cada uno, una columna para cada cosa que comparas (tarea, datos, método, métricas, resultados y límites, salvo que lo cambies), cada celda con la página de la que procede. Indica los artículos uno por línea, o “mi lista de lectura” con una etiqueta, un proyecto o un estado. Lee de tres en tres y guarda la matriz como una hoja de cálculo en los archivos del proyecto que nombres. Su vista tiene **La matriz** (**Abrir la hoja de cálculo**, **Copiar como tabla**, los artículos que no pudo leer y por qué, y **Otra columna**), **Artículos** y **En todos los artículos**.
- **Reproducir un artículo**: el código de un artículo ejecutado para comprobar sus cifras: encuentra el código (en el artículo, o en GitHub y la web), crea un entorno limpio, obtiene los datos y los checkpoints, ejecuta primero una porción pequeña y luego la ejecución real (una larga en [Experimentos](/guide/experiments), esperando a que termine), dentro de los límites que indiques, y compara cada cifra con la del artículo. Su vista tiene **¿Se reprodujo?** (las cifras del artículo junto a las nuestras, **Abrir la carpeta**, **Reintentar**), **Lo que costó** e **Informe**.
- **Simulador de revisores**: tu borrador revisado con el formulario y las puntuaciones del propio congreso (ACL Rolling Review, SIGIR, NeurIPS, ICLR, ICML, KDD, CIKM, WSDM, TheWebConf o una revista), por hasta cinco revisores, cada uno desde un ángulo propio, con la metarrevisión de un area chair. Su vista tiene **Las revisiones**, **Metarrevisión** (con lo que podría hundirlo, lo más peligroso primero), **Líneas base y ablaciones** que los revisores pedirán, y **Antes de enviar** (una lista para ir marcando, y **Responde estas reseñas**, que inicia la Mesa de trabajo de la respuesta a revisores). Consulta [Revisa, responde y presenta tu artículo](/guide/researchers#review-answer-and-present-your-paper).
- **Mesa de trabajo de la respuesta a revisores**: los puntos de las revisiones agrupados entre revisores y clasificados (malinterpretado, necesita un experimento, necesita explicaciones, menor), con una respuesta redactada para cada uno dentro del límite del congreso, en el tono que elijas, con marcadores donde hace falta un resultado nuevo. Su vista tiene **Puntos planteados** (cada uno con su borrador, su longitud frente a su parte del total y **Copiar**), **Por hacer** (los experimentos y cambios para ir marcando) y **Réplica completa** (con **Copiar toda la réplica**).
- **Del artículo a la charla, el póster y el hilo**: a partir de tu artículo, lo que elijas entre: diapositivas cronometradas con sus figuras y ecuaciones reales y lo que hay que decir, un póster A0 (un documento LaTeX), un hilo para X y Bluesky y una publicación para LinkedIn, y una página del proyecto, guardados en los archivos del proyecto que nombres. Su vista tiene **Lo que se creó** (cada uno con **Abrir**), **La charla** (sus diapositivas como una sola franja de minutos) e **Hilo** (las publicaciones de cada plataforma para copiar).
- **Médico de figuras**: tus scripts de gráficos adaptados al artículo: el ancho de columna de la plantilla del congreso, la fuente del artículo, colores que los lectores daltónicos distinguen, PDF vectoriales con sus fuentes incrustadas (ninguna Type 3) y un archivo de estilo para todos, con los originales conservados al lado. Su vista tiene **Antes y después**, **Archivo de estilo** (con **Copiarlo**) y **Qué cambió**.
- **Banco de anotación**: tú y un modelo etiquetan la misma muestra de textos. Dale las etiquetas (hasta nueve), tus pautas y los textos: un archivo CSV o de líneas JSON, un conjunto de datos de Hugging Face por su nombre, o textos pegados; toma una muestra al azar y hace que el modelo auxiliar la etiquete con tus pautas. Su ejecución es donde etiquetas: **Etiquetado** (un texto cada vez, un botón grande y una tecla del 1 al 9 para cada etiqueta, con la etiqueta del modelo mostrada solo cuando ya has dado la tuya), **Desacuerdos** lado a lado, **Acuerdo** (con qué frecuencia coinciden, la κ de Cohen y la matriz de confusión) y **Exportar** (una descarga como CSV o líneas JSON, o **Publicar en Hugging Face** con la ficha del conjunto de datos). Consulta [Gestiona el trabajo de tu laboratorio](/guide/researchers#run-your-labs-work).
- **Sprint de investigación**: una pregunta de investigación llevada por un sprint sobre tu propio código: hipótesis, un plan y código en una rama propia (en un worktree que crea), ejecuciones en [Experimentos](/guide/experiments) dentro de tus horas de GPU, un cuaderno de análisis y un informe breve, esperando a que conserves las hipótesis y a que inicies las ejecuciones. Su vista tiene **El sprint** (cada hipótesis con su veredicto y sus pruebas), **Ejecuciones** (con una tabla de resultados frente a la línea base) e **Informe**.
- **Planificador de barridos**: un barrido de hiperparámetros de un script de entrenamiento dentro de un presupuesto de ejecuciones u horas de GPU: un agente lee los argumentos del script y propone las configuraciones y los valores (o toma los tuyos), Experimentos los ejecuta y detiene pronto las pruebas malas, y un programa calcula cuánto importó cada configuración. Su vista tiene **Resultados** (la mejor ejecución, lo que encontró, qué probar después), **Por configuración** (un gráfico para cada una) y **Todas las ejecuciones**.
- **Informe semanal de avances**: tu semana como una actualización para tu director, tu equipo o un jefe (lo que se hizo, resultados con sus cifras, problemas y bloqueos, el plan de la semana próxima, preguntas por hacer), a partir de tus sesiones (también las de VS Code y de terminal), commits, ejecuciones y lecturas. Se abre en su propia página con el de esta semana, con **Copiar como Markdown**, **Copiar como correo** y **Guardar como documento**, y las semanas anteriores debajo; con **Actualizar automáticamente** activado, llega uno nuevo cada viernes a las 16:00. Consulta [Informes: tu semana y tu cuaderno de laboratorio](/guide/researchers#reports-your-week-and-your-lab-notebook).
- **Cuaderno de laboratorio**: una entrada con fecha para cada día que trabajaste: qué se probó, qué se encontró y qué se decidió, y qué sigue abierto, con enlaces a las sesiones, commits, ejecuciones y archivos del día. Se abre en su propia página con las entradas, las más recientes primero, una búsqueda por palabras y por significado, y el enlace de cada entrada para citarla; con **Actualizar automáticamente** activado, escribe la entrada del día cada noche a las 21:00.

No puedes cambiar una app ya hecha. Para ajustar una, ábrela y pulsa **Hacerla mía** (en un teléfono, **Editar**): el constructor se abre con una copia que se convierte en tu propia app cuando la creas.

### Explorar

**Explorar** es una revista hecha para ti: artículos y noticias recientes sobre lo que trabajas y lo que te interesa. Ábrela desde **Explorar**, arriba a la derecha de la página de inicio, o desde la página de Apps. No tiene un formulario que rellenar cada vez: se abre en su propia página, en su última edición, y los agentes no la ejecutan en tus sesiones.

- **Cómo elige**: lee tu perfil, las notas que la Memoria guarda sobre ti y los títulos de tus últimas sesiones (dejando fuera las sesiones con la memoria desactivada, las sesiones que los agentes empiezan para partes de su trabajo y las ejecuciones de apps que nadie vigiló), y le pide al modelo auxiliar que elija unos seis temas que disfrutarías ahora: aproximadamente la mitad de tu trabajo y la otra mitad del resto de tu vida, nunca nada privado. Para cada uno, busca en sitios de noticias historias de las últimas dos semanas y busca lecturas largas (explicaciones, análisis, ensayos), lee las mejores páginas **lado a lado**, resume cada una y encuentra su imagen. De un sitio que no permite el acceso de programas se hace el resumen a partir de lo que la búsqueda mostró de él. Una edición tarda un minuto o dos.
- **Una edición**: su fecha y su titular de portada, una nota del editor, los temas (haz clic en uno para mostrar solo sus historias, **Todo** para ver todas), la historia de portada y después una sección **para cada uno** de los temas. Cada historia tiene su imagen, **Noticias** o **Lectura larga**, su fuente y fecha, lo que dice y por qué está en tu edición. Haz clic en su imagen o en su titular para leerla en su sitio: quedará marcada como **✓ Leído**, también en las ediciones posteriores. **Profundizar** inicia un informe de investigación a fondo sobre ella. Debajo de la edición, **Antes** muestra la lista de las anteriores, y cada una se abre tal como era.
- **Actualizar**, arriba, crea ahora una nueva edición. Mientras trabaja, una línea dice lo que está haciendo, con **Seguirla**, y la edición que tienes se mantiene hasta que la nueva esté lista. Antes de la primera, **Hacer la primera** hace lo mismo.
- **Configuración**, los controles deslizantes junto a **Actualizar**: **Actualizar automáticamente** (desactivado hasta que lo actives) deja lista una nueva edición cada mañana; debajo, elige los días (**Todos los días**, **Los días laborables** o **Una vez por semana el** día que quieras) y la hora (07:00 si no la cambias). Es una [tarea programada](/guide/tasks), así que Configuración → Tareas programadas también la muestra; si la desactivas, desaparece. Más abajo están **Sesiones recientes que leer** (cuántos títulos de tus últimas sesiones lee: 1.000 si no lo cambias, como máximo 1.000), **Cubrir también** (temas que siempre incluye, uno por línea) y **Dejar fuera** (temas o sitios que omitir, separados por comas). **Guardar** los conserva para todas las actualizaciones, incluidas las diarias.
- **Hacerla mía** y **Desinstalar** están en su menú **Más** (⋯).

Cada edición le hace al modelo auxiliar unas veinte preguntas rápidas y busca en la web una docena de veces; con Claude Code con la sesión iniciada, las preguntas salen de tu plan.

### Instalar o desinstalar una app lista para usar

Una app lista para usar que no utilizas puede irse: ábrela, luego **Más** (⋯) → **Desinstalar**, y confirma. Sale de **Tus apps**, los agentes dejan de ejecutarla en tus sesiones y queda esperando en **Apps listas para instalar** en la página de Apps. Sus ejecuciones se conservan.

Para recuperarla, haz clic en su tarjeta ahí. Una tarjeta muestra qué es antes de que cambie nada: qué hace, **Lo que te pregunta** (con las preguntas opcionales marcadas), **Lo que obtienes**, **Cómo funciona** en palabras sencillas y **Los agentes pueden usarla**, con un interruptor. **Instalar** la vuelve a poner entre tus apps y la abre. Su propia página dice “La desinstalaste”, también con **Instalar**.

## Ejecutar una app

1. Abre la app desde la página de Apps o desde el cuadro de búsqueda. Su página dice arriba qué hace, con **Tus respuestas** (su formulario) debajo, y junto a ellas (debajo en un teléfono) **Lo que obtienes** (las páginas en las que se abre su respuesta, o sus campos de respuesta), **En tus sesiones** (si los agentes pueden ejecutarla por ti: consulta [Pedir a un agente que ejecute una app por ti](#have-an-agent-run-an-app-for-you)), **Últimas ejecuciones** (cada una abre su ejecución) y, en una app con pasos, **Cómo funciona**: sus pasos en orden, cada uno con la forma en que se ejecuta (**para cada uno** de los elementos, varios **a la vez**, **lado a lado**), y **Como grafo**, que los abre en el creador.
2. Rellena el formulario. Las preguntas marcadas con un **\*** rojo son obligatorias.
3. La línea bajo el formulario dice quién la ejecuta, por ejemplo “Claude Code · Sonnet · high effort · Auto”. En una app lista para usar, **Cambio** muestra los selectores (consulta más abajo); en una tuya, cámbialo con **Editar**.
4. Pulsa **Ejecutar**. Se abre la página de la ejecución y sigue el trabajo en directo.

Si falta algo, la página dice “Rellena primero las preguntas marcadas” y nombra el problema bajo cada pregunta (“Obligatorio”, “Un número, por favor”, “Elegir un archivo”).

Un enlace puede rellenar el formulario por ti: la dirección de una app con `?in.`, el nombre de una pregunta, `=` y la respuesta abre su página con esa respuesta en el formulario, lista para cambiarla: no se ejecuta nada hasta que pulses **Ejecutar**. [Este](/apps/t/reproduce-paper?in.paper=2104.08663) abre Reproduce a paper con un artículo ya rellenado; más respuestas siguen con `&in.` (los archivos, nunca). Los agentes te dan enlaces así, y también los botones de las vistas (el **Reproducirlo** de un artículo en la Lista de lectura). Una app que se abre en una página propia se abre entonces en su formulario.

### Los tipos de preguntas

- **Texto corto** y **Texto largo**: una línea, o un cuadro que crece a medida que escribes.
- **Número**: números simples; “$1,250.50” se lee como 1250.5.
- **Fecha**: un selector de fecha.
- **Opción**: unas pocas opciones cortas se muestran como chips; si son más, como lista. Haz clic de nuevo en un chip elegido para borrar una opcional. Una opción que permite varias muestra chips que marcas, cada uno marcado con una marca de verificación; lo que marcas se guarda como una opción por línea.
- **Sí / no**: un interruptor.
- **Archivo**: un archivo que adjuntar.

Una pregunta puede tener una línea de ayuda debajo, un ejemplo de respuesta en el cuadro y un valor ya rellenado al principio.

### Elegir el agente, el modelo, el esfuerzo y el modo

En una app lista para usar, **Cambio** junto a la línea bajo el formulario muestra los selectores (y **Hecho** los oculta):

- El programa: Claude Code, Codex, Custom (el agente propio de Hydor para cualquier modelo) u otro agente que hayas añadido.
- **Modelo**: los modelos del agente.
- **Esfuerzo**: cuánto piensa el modelo, para los modelos que ofrecen niveles (no para Custom ni para los otros agentes añadidos).
- **Modo**: lo que el agente puede hacer sin preguntarte. Empieza en **Auto**, porque nadie vigila una ejecución. Un modo que pregunta antes de cada paso deja la ejecución esperándote.

Este navegador recuerda tu última elección para la próxima app lista para usar que ejecutes.

### Adjuntar archivos

Una pregunta de archivo muestra **Elegir un archivo**, o puedes soltar un archivo sobre ella (en una computadora). Cada archivo puede pesar hasta 25 MB. El archivo se guarda en la carpeta de la ejecución y el agente recibe su ruta, así que puede leer PDF, documentos de Word, hojas de cálculo y otros archivos como lee cualquier archivo. La **×** junto a un archivo elegido lo quita.

### Darle las claves que necesita

Algunas apps funcionan con un servicio que pide una clave: una clave de API o un token (un servicio del clima, un proveedor de mapas, una cuenta tuya en algún sitio). Una app nombra las claves que necesita, nunca sus valores: das cada una una sola vez y se guarda en tu bóveda ([Guardar claves en la bóveda](/guide/connections#keep-keys-in-the-vault)), donde los agentes la usan por su nombre sin verla.

- En la página de la app, **Una clave que necesita** (o **Claves que necesita**) bajo el formulario enumera cada una: qué es, su nombre en la bóveda, una línea sobre cómo obtenerla, un cuadro donde pegarla y **Obtener una**, que abre la página donde se consigue. Pulsa **Ejecutar**: la clave va primero a la bóveda y luego empieza la ejecución. Una clave que la bóveda ya tiene aparece como **Guardado**, con sus últimos caracteres y **Cambio**; una que la app puede prescindir de ella se marca como **opcional**.
- Cuando instalas una app desde un archivo, su tarjeta también pide sus claves: dalas entonces, o en su primera ejecución.
- Cuando un agente la ejecuta por ti en una sesión, su tarjeta ahí pide una clave que le falta; la clave va directamente a la bóveda, nunca a la conversación.
- Una clave que solo necesita una parte de una app (la clave de Zotero de la Lista de lectura, para **Sincronizar con Zotero**) no se pide en su formulario: su página la pide la primera vez que usas esa parte.

Una ejecución sin una clave que necesita no empieza: en su formulario se te pide (“Necesaria para ejecutarla”); desde la API, una programación o filas de un CSV, la ejecución se rechaza y dice qué clave añadir (en su página, o en **Apps → Apps conectadas → Claves** con ese nombre). Cuando una clave que guardaste todavía no puede ir a un sitio al que la app la envía, su fila lo dice, con **Permitirla**.

Algunas apps usan un modelo a través de OpenRouter (uno que dibuja imágenes, por ejemplo). Estas piden tu **Clave de API de OpenRouter** de la misma manera, con **Obtener una**: se guarda en [Configuración → Modelos](/settings?s=models) y no en la bóveda, para tus otras apps y también para Custom, y el modelo se añade solo a tus modelos la primera vez que la app se ejecuta. Un modelo que se ejecuta en Ollama, vLLM o un endpoint se configura a mano en Configuración → Modelos: hasta que se haga, una ejecución se rechaza y dice qué modelo y cómo.

### Dónde trabaja una ejecución

Cada ejecución obtiene una carpeta nueva propia, dentro de una carpeta `hydor-apps` en tu carpeta personal, con el nombre de la app y la hora. Una app puede nombrar una carpeta en su lugar (consulta [Quién lo hace](#who-does-it)); entonces todas las ejecuciones trabajan ahí.

La sesión de una ejecución que empiezas desde el formulario aparece en la lista de sesiones de la barra lateral como cualquier otra, con el título del nombre de la app y tus primeras respuestas. Las ejecuciones desde la API, otros agentes, una página pública o filas de un CSV se archivan, así que no aparecen en la lista y se muestran bajo su app.

## Pide a un agente que ejecute una app por ti

No tienes que abrir una app para usarla: pide lo que hace en cualquier sesión (“Planifica un viaje de 4 días a Lisboa en mayo para los dos”) y el agente la ejecuta ahí.

1. El agente encuentra la app que hace lo que pediste y le pasa lo que dijiste: el lugar, los días, quién va. Cuando tu mensaje pide con claridad lo que hace una de tus apps, al agente se le indica cuál es junto con tu mensaje, así que la ejecuta en lugar de hacer el trabajo él mismo. Si tienes muchas apps, las busca por lo que hacen (por palabras, y por significado cuando la búsqueda por significado está activada) y elige entre las veinte que mejor encajan.
2. Antes de que se ejecute una app, su tarjeta aparece en la conversación y pregunta primero, salvo que la app esté en tu lista de apps que se ejecutan sin preguntar (consulta más abajo). La tarjeta dice “An agent wants to run this app for you.” y muestra el icono y el nombre de la app, lo que hace, **Lo que hace** (sus pasos en orden, hasta seis, y luego “y 3 más”), **De tu mensaje:** y lo que tomó de tus palabras, **Última ejecución:** (cuánto tardó su última ejecución y cuánto costó) y **Sobre esta app**, que abre la página de la app. Cuando la app necesita algo que no dijiste, las preguntas pendientes también aparecen en la tarjeta: una clave que necesita y que aún no has dado se pide ahí, y va a tu bóveda, no a la conversación. Rellena las marcadas con un **\*** rojo y deja vacías las opcionales si no te importa. Si no pudo tomar una pregunta tal como la dijiste (“en mayo” para una fecha), debajo se muestran tus palabras. **Ejecutar** ejecuta la app una vez; **Ejecutar siempre** pone la app en tu lista y la ejecuta, de modo que su tarjeta ya no pregunte; **No ejecutar** cierra la tarjeta y no ejecuta nada: el agente hace el trabajo de otra manera o te pregunta. Mientras la tarjeta espera, la sesión muestra **Te necesita** y la bandeja de entrada la incluye. Una app de tu lista sigue mostrando su tarjeta cuando necesita detalles que faltaron en tu mensaje; ahí los botones son **Ejecutar** y **Ahora no**. La sesión de una tarea programada ejecuta las apps sin preguntar: tú configuraste la tarea y no hay nadie para responder.
3. La tarjeta de la app permanece en la conversación, debajo de la respuesta del agente, y sigue la ejecución: en qué punto está y los pasos que van pasando, y luego su respuesta tal como la muestra la app (su vista, con sus páginas y botones; **Respuesta simple** muestra la tarjeta y las tablas). Una pregunta que haga uno de sus pasos (una de “Déjame…”) también espera ahí. **Abrir** va a la página de la ejecución, y el nombre de la app lleva a la app.
4. Luego el agente cuenta en una o dos líneas qué resultó; la respuesta propia de la ejecución se queda en la página de la ejecución. Cuando la respuesta de la app no encaja con lo que pediste y el agente responde por su cuenta, quita la tarjeta de la app de la conversación, así recibes una sola respuesta, no dos; la ejecución se queda en las ejecuciones de la app. Una ejecución larga continúa después de que el agente deja de esperar: su tarjeta la sigue y, cuando termina, el agente recibe su respuesta (no se muestra ningún mensaje tuyo por eso) y responde, con la tarjeta moviéndose debajo de esa respuesta. Una respuesta más alta que la pantalla se muestra desde su inicio, con las palabras del agente sobre ella encima; el resto queda a un desplazamiento, y **Último** lleva al final.

Sus ejecuciones muestran **Desde una sesión** en las ejecuciones de la app.

La página de cada app tiene **En tus sesiones** junto a su formulario, con el interruptor **Los agentes pueden usarla** (tus propias apps lo tienen también en **API y uso compartido**). Si lo desactivas, los agentes ya no ejecutan esa app; vuelve a activarlo cuando quieras. Todas las apps empiezan con él activado. Los bloques de construcción y las apps hechas para usarse en su propia página (con una pantalla, o una vista de lo que guardan) lo indican ahí, y los agentes no las ejecutan. Cuando una app tuya hace lo mismo que una ya hecha, los agentes prefieren la tuya.

**Ejecutar sin preguntar** en [Configuración → Apps](/settings?s=apps&find=Run%20without%20asking) lista las apps que los agentes ejecutan sin preguntar antes: la **×** junto a una hace que los agentes vuelvan a preguntar, y **Agregar una app** agrega una antes de que se te haya preguntado.

A cada sesión se le informa de tus apps: las pocas que más ejecutas, con lo que hacen, y las demás solo por nombre, hasta 40 en total. Si tienes más, los agentes encuentran las otras cuando una petición lo requiere.

## Sigue una ejecución y lee su resultado

La página de la ejecución muestra el nombre de la app, las respuestas que recibió en una línea (“Lisboa · 2026-11-20 · 3”), de dónde vino (“Del formulario”, “Ejecución de prueba”, “Desde la API”, “Desde otro agente”, “Página pública”, “Fila 3”) y cuándo empezó. Cuando ha terminado, **Ejecutar de nuevo**, arriba, abre el formulario rellenado de la misma manera.

La tarjeta de estado de arriba indica en qué punto está:

- **Esperando su turno**, **Iniciando…** o **Funcionando** con el tiempo transcurrido. Mientras trabaja, ves sus últimos pasos (“Buscó en la web”, “Leyó una página”, “Actualizó el plan”) y el comienzo de lo último que dijo el agente.
- **Necesita tu aprobación en la sesión** o **Tiene una pregunta para ti en la sesión**: el agente te está esperando. Abre la sesión para responder; las aprobaciones también aparecen en [la bandeja de entrada](/inbox).
- **Terminada en** el tiempo que tardó, con lo que costó.
- **Detenidas**, o **No terminó** con el motivo.

Debajo viene el resultado. Una app con vista lo muestra ahí (consulta [Su vista](#its-view)); **Respuesta simple**, en la tarjeta de estado, lo muestra como la tarjeta simple y las tablas, y **Su vista** vuelve a la vista. Sin vista:

- Los campos de respuesta cortos (texto, números, fechas, enlaces, sí o no) van juntos en una tarjeta.
- El texto largo, las listas y las tablas tienen cada uno una tarjeta bajo su encabezado. El texto largo tiene un botón **Copiar**; las tablas tienen **Copiar** y **CSV** (una descarga), y una columna de imágenes las muestra pequeñas (un clic abre una en grande).
- Imágenes, videos, sonidos y archivos: las imágenes en una cuadrícula (un clic abre una en grande y las flechas pasan por las demás), los videos y sonidos para reproducir, y los demás archivos para descargar. Uno que esté en otro sitio (un video en YouTube, una página) se abre allí.
- En un teléfono, una tabla demasiado ancha para la pantalla se muestra como una tarjeta por cada fila.

La respuesta propia del agente viene después. Aparece abierta, bajo **Respuesta**, cuando la app no tiene campos de respuesta; si los tiene, aparece plegada bajo **La respuesta del agente**. **Lo que se preguntó** (plegado) lista las respuestas que recibió la ejecución.

Al agente se le recuerda una vez si termina sin entregar los campos de respuesta. Una ejecución que termina sin respuesta ni resultado cuenta como fallida (“El agente terminó sin una respuesta”).

Abajo, **Ejecutar de nuevo con estas respuestas** abre el formulario rellenado de la misma manera, listo para cambiar y ejecutar. Los archivos no se conservan: elígelos otra vez.

**Abrir la sesión** (en un teléfono, **Sesión**), arriba, abre la conversación completa de la ejecución.

### Su vista

La vista de una app está hecha para su respuesta: páginas que la muestran en elementos propios (tarjetas, líneas de tiempo, gráficos, listas para marcar) y botones que hacen cosas con ella.

- **Páginas**: las pestañas de su parte superior; la primera se abre primero. Algunas páginas se abren con un clic (un día de un viaje, un producto) y tienen una forma de volver en su parte superior.
- **Marcas y opciones**: lo que marcas (una reserva hecha, una acción realizada) se queda con la ejecución, en todos los dispositivos; los filtros y las selecciones (un tema, un responsable) duran mientras la página está abierta.
- **Botones que la ejecutan de nuevo**: **Relajado** o **+ Un día más** en un viaje, **Formal** en una carta, un cuadro de preguntas nuevas sobre el mismo documento. Cada uno pregunta primero, luego inicia una nueva ejecución con tus otras respuestas tal como estaban (también sus archivos) y la abre.
- **Botones que inician otra app**: **Investigación** en una noticia o en la zona de un viaje, **Profundizar** en un hallazgo: cada uno pregunta primero, luego inicia la ejecución de esa app y la abre.
- **Copiar**: una parte para pegar en otro lugar (un correo, una carta, las preguntas que hacer).
- **Mapas, gráficos, imágenes y videos**: un mapa de los lugares de su respuesta (arrástralo y haz zoom; un lugar muestra su nombre, y un clic en él puede abrir su página), un gráfico o un diagrama 3D (apunta a una barra o a un punto para leerlo, haz zoom, gira uno 3D), imágenes que se abren en grande (una entrada sin imagen, o cuya imagen no puede cargar, se muestra sin ella, y su texto ocupa el espacio), y videos y sonidos para reproducir, desde un archivo o desde YouTube o Vimeo. Los mapas, los gráficos y los dibujos propios de una vista cargan sus bibliotecas (y los mapas, el mapa mismo, desde OpenFreeMap, claro u oscuro según la app) desde la web, así que necesitan que este dispositivo tenga conexión.
- En una app tuya, una vista también puede pedirle un cambio a su agente (una app sin pasos), ejecutar uno de sus otros flujos o guardar un registro en lo que guarda.

Una vista se muestra en la página de la ejecución, en el **Resultado** de su sesión y en la página pública de la app, donde sus páginas y marcas funcionan pero nada llega a la app (no se puede ejecutar de nuevo, ni hay nuevas ejecuciones, ni se guarda nada).

## Pide cambios en el resultado

Una ejecución no es definitiva. Al pie de la página de la ejecución, un cuadro dice **Pide un cambio en el resultado…** (o **Pide un cambio…** cuando la app no tiene campos de respuesta).

1. Escribe qué cambiar: “Haz el día 2 menos cargado”, “Agrega una columna con los horarios de apertura”, “Más corto, y más cálido”.
2. Pulsa Enter o el botón de flecha. Shift+Enter inicia una nueva línea. En un teléfono, Enter inicia una nueva línea: toca la flecha para enviar.

El seguimiento va a la sesión de la ejecución. El agente hace el trabajo y entrega el resultado actualizado completo, que reemplaza al anterior en la página. Cada seguimiento aparece bajo **Seguimientos** con la respuesta del agente, y **Resultado actualizado** cuando el resultado cambió. La tarjeta de estado dice entonces **Actualizado en …**, o **Respondido en …** cuando el seguimiento solo necesitaba una respuesta (una pregunta, un agradecimiento).

Si envías un seguimiento mientras el agente aún está trabajando, espera con la nota “esperando su turno” y llega al agente cuando termina el turno actual. Un seguimiento puede tener hasta 20.000 caracteres.

Las ejecuciones desde una página pública no admiten seguimientos. Tampoco una ejecución cuya sesión se eliminó, ni una cuya sesión está abierta en otro programa (continúala allí).

## Trabaja con la sesión de una ejecución

Abierta desde la barra lateral, la sesión de una ejecución muestra primero el **Resultado**, la misma vista que la página de la ejecución, con un interruptor a **Conversación** arriba. (**Abrir la sesión** en la página de la ejecución va directo a la conversación.) El cuadro de mensaje de la sesión dice entonces **Pide un cambio en el resultado…**: todo lo que envíes ahí es un seguimiento, igual que en la página de la ejecución, y un borrador que empieces en un lugar pasa al otro.

En la vista **Resultado**, las tarjetas de aprobación del agente aparecen bajo el resultado, así que puedes aprobar o rechazar ahí. Cuando en cambio tiene una pregunta, una tarjeta dice **Tiene una pregunta para ti.** con **Responder**, que cambia a la conversación.

En la conversación, el momento en que el agente entrega su resultado aparece como **Resultado entregado**, con **Abrir el resultado**. Si lo que entregó no encajaba con los campos de respuesta, muestra **El resultado aún no encajaba en los campos de respuesta** y lo que estaba mal; el agente lo corrige y lo entrega de nuevo.

## Detén una ejecución o quítala

- **Detener** (arriba mientras una ejecución está en marcha): una ejecución que espera en la cola termina de inmediato; una que está funcionando se interrumpe y muestra **Detenidas**.
- Cuando una ejecución ha terminado, el botón de la papelera (**Quitar de la lista**) pregunta “¿Quitar esta ejecución?” y la saca de la lista de ejecuciones de la app. La sesión se queda: elimínala desde el menú de la sesión si quieres que desaparezca también.

## Ve todas las ejecuciones de una app

La página de tu propia app tiene cuatro pestañas: **Ejecutar**, **Ejecuciones**, **Para cada fila** y **API y uso compartido**. **Ejecuciones** muestra cuántas se ejecutaron hoy y lista todas, de la más reciente a la más antigua: las respuestas que recibió, de dónde vino, hace cuánto, su costo y su estado. **Mostrar ejecuciones anteriores** carga más, de 50 en 50.

Las apps ya hechas no tienen pestaña Ejecuciones: encuentra sus ejecuciones bajo **Últimas ejecuciones** en la página de Apps, o como sesiones en la barra lateral.

## Crea tu propia app

Hay cuatro formas de empezar:

- **Desde cero**: **Nueva app** → **Empezar desde cero** en la página Apps, el mosaico **Crear una app** debajo de tus propias apps, o ve a [/apps/new](/apps/new).
- **Describiéndola**: en la página Apps (o en la página Nueva app), escribe lo que debe hacer bajo **Describe una app y un agente la crea** y pulsa **Crearla**. Se empieza una sesión como **Creador de apps** ([Agentes](/guide/agents)), que crea la app, la prueba y te la entrega.
- **A partir de una app lista para usar**: ábrela y pulsa **Hacerla mía** (en un teléfono, **Editar**).
- **A partir de una sesión que salió bien**: en el menú de la sesión (⋯), elige **Más** → **Guardar como app**. La página dice “Redactando una app a partir de la sesión…” mientras el modelo auxiliar convierte la primera solicitud de la sesión en un formulario, una tarea y campos de respuesta, a partir de lo que pediste y de lo que respondió el agente. Las partes que cambiarían de un uso al siguiente se convierten en preguntas. El borrador conserva el programa, el modelo, el esfuerzo, el modo y el agente de la sesión. Cuando el agente llamó a herramientas que un paso puede llamar por sí solo (leyó una página, buscó en la web), el borrador también tiene pasos: esas llamadas como pasos de herramienta, con las respuestas del formulario donde corresponden, y después un paso de modelo o de agente para el resto. Los pasos que no cuadran se dejan fuera y se mantiene la tarea para un solo agente; revisa los pasos y pruébala antes de guardar. Si el modelo auxiliar no puede redactarla, obtienes la solicitud tal como era, en una sola pregunta **Solicitud**, con una nota que explica el motivo; el modelo auxiliar se define en [Configuración → Agentes → Modelos](/settings?s=models&find=Helper%20model).

También puedes pedirle a un agente, en cualquier sesión, que te haga una app (consulta [Pídeselo a un agente](#ask-an-agent)).

El creador se abre bajo el título **Nueva app**: arriba están su icono, su nombre y su descripción (haz clic en el nombre o en la descripción para cambiarlos), y después sus partes como pestañas: primero **Lo que hace**, luego **Forma**, **Respuesta**, **Diseño**, **Ejemplos** y **Configuración** (quién lo hace, sus herramientas, sus límites, lo que guarda, si es un bloque y, una vez guardada, su carpeta y sus versiones, cada una plegada en una línea que indica cómo está configurada hasta que la abres). Todas las pestañas tienen el mismo ancho; en una computadora las pestañas se quedan arriba al desplazarte, y en un teléfono se muestran en dos filas. En una pantalla ancha, **Forma** y **Respuesta** tienen al lado una **Vista previa** que cambia mientras escribes: el formulario tal como lo pregunta la página de la app, y una respuesta inventada tal como la muestra una ejecución. Rellénalas, pruébala con **Ejecución de prueba** y pulsa **Crear**. Se abre la página de la app, lista para ejecutarse.

### Nombre, descripción e icono

- Haz clic en el icono para elegir su color (11 colores) y su imagen (32 iconos).
- **Nombre** (obligatorio, hasta 60 caracteres), por ejemplo “Planificador de viajes”.
- Una descripción: qué hace, en una frase (hasta 300 caracteres).

La dirección de la app se obtiene de su nombre al crearla (“Trip planner” se convierte en `trip-planner`). Si la renombras más adelante, la dirección se mantiene, de modo que los enlaces, las claves y la herramienta que llaman otros agentes siguen funcionando.

### El formulario

Las preguntas que alguien responde antes de cada ejecución. **Añadir una pregunta** añade una fila con:

- La pregunta, tal como la lee la persona (“¿Adónde?”).
- Su tipo: **Texto corto**, **Texto largo**, **Número**, **Fecha**, **Opción**, **Sí / no** o **Archivo**.
- **Obligatorio**: la ejecución no puede empezar sin ella.
- Para **Opción**: las opciones, una por línea (si se deja vacío, ofrece Sí y No), y **Se pueden elegir varias**, que permite marcar más de una (la respuesta tiene entonces una opción por línea).
- **Texto de ayuda, ejemplo, valor predeterminado…** abre tres cuadros más: **Ayuda bajo la pregunta**, **Una respuesta de ejemplo** (se muestra en gris en el cuadro vacío) y **Rellenado al principio**.

El menú **⋯** de una pregunta tiene **Subir**, **Bajar** y **Quitar**. Debajo de cada pregunta ves su marcador, como `{{destination}}`: así es como la tarea se refiere a su respuesta, y el nombre que usan los programas para ella. El marcador de una pregunta nueva sigue su redacción hasta que la tarea lo usa. Una app puede tener hasta 30 preguntas.

### La tarea

Lo que se le pide al agente, con las respuestas ya incorporadas (hasta 30.000 caracteres; obligatoria). Escríbela como se lo pedirías tú mismo al agente, e indica cómo trabajar, no solo qué crear.

- **Lo que hace** muestra el trabajo de la app como **Una tarea** (este cuadro), una **Lista** de pasos o un **Grafo** de ellos; consulta [Apps con pasos](#apps-with-steps).
- Los chips de **Insertar** colocan el marcador de una pregunta donde está el cursor. Las preguntas que la tarea aún no usa aparecen resaltadas. **hoy**, **ahora** y **día de la semana** insertan la fecha, la fecha y la hora, y el día de la semana del lugar donde estás.
- `{{question}}` se reemplaza por su respuesta.
- El texto entre `{{#question}}` y `{{/question}}` solo se conserva cuando la pregunta tuvo respuesta (y no fue No). El texto entre `{{^question}}` y `{{/question}}` solo se conserva cuando se dejó vacía.
- **Vista previa**, al final de la fila de chips de **Insertar**, muestra la tarea con el valor predeterminado de cada pregunta, o su nombre entre corchetes, ya rellenado. **Editar** vuelve atrás.

Las advertencias bajo el cuadro te avisan cuando un marcador no corresponde a ninguna pregunta (se queda tal como está escrito) y cuando una pregunta obligatoria no se usa nunca en la tarea.

### La respuesta

Los campos que el agente rellena cuando termina. Se muestran como una tarjeta o una tabla, y los programas los reciben como JSON. Sin campos de respuesta, la respuesta del agente es la respuesta.

**Añadir un campo de respuesta** añade una fila con:

- Un encabezado (“Recomendación”).
- Su tipo: **Texto**, **Texto largo** (texto con formato), **Número**, **Sí / no**, **Fecha**, **Enlace**, **Lista**, **Tabla** o **Imágenes, videos o archivos**.
- **Obligatorio**: el agente debe rellenarlo.
- **Qué va aquí, para el agente (opcional)**: una pista para el agente.
- Para una **Tabla**: sus **Columnas**, cada una con un nombre y un tipo (**Texto**, **Número**, **Sí / no**, **Fecha**, **Enlace** o **Imagen**). **Añadir una columna** añade una; una tabla conserva al menos una.

El menú **⋯** de un campo de respuesta tiene **Subir**, **Bajar** y **Quitar**.

Un campo de **Imágenes, videos o archivos** (y una columna de **Imagen**) recibe lo que el agente encontró o creó: una dirección de la web, o un archivo de esta computadora (una foto de tu carpeta de imágenes, un gráfico que dibujó, una grabación), cada uno con un pie de foto. Hydor guarda una copia de un archivo de esta computadora, y de una imagen de la web (hasta 15 MB), para que se vea dondequiera que se muestre la respuesta; los videos de la web siguen siendo enlaces. Las ejecuciones de una página pública solo pueden apuntar a la web.

Hydor comprueba lo que entrega el agente: los números deben ser números, las fechas fechas reales y los enlaces direcciones web completas. Cuando algo no encaja, se le dice al agente qué corregir. Una app puede tener hasta 30 campos de respuesta, y una tabla hasta 16 columnas. Un campo de respuesta nuevo toma su nombre para los programas de su encabezado al guardar; después el nombre se mantiene, de modo que los programas que lo leen siguen funcionando.

### Ejemplos

Los ejemplos son respuestas con las que probar la app, y comprobaciones de lo que devuelve una ejecución, para que puedas probar un cambio y notar cuándo la app empeora. **Añadir un ejemplo** añade uno: ponle un nombre si quieres, rellena sus respuestas y usa **Añadir una comprobación** por cada cosa que da una buena ejecución. Una comprobación es una regla sobre los valores de la ejecución, igual que la regla de un paso: `{{answer.unread}} > 0`, `{{find.count}} = 3`, `{{reply}} contains Lisbon`. El botón **{ }** inserta un valor: las respuestas del formulario, lo que dieron los pasos, **Su respuesta** (`{{answer.field}}`) y **Su respuesta** (`{{reply}}`).

**Probarlos** ejecuta cada ejemplo como una ejecución de prueba, con la app tal como está en pantalla, guardada o no; el botón del matraz junto a uno prueba solo ese. Cada uno muestra cómo le fue en la última prueba: **Correcto**, cuántas comprobaciones fallaron o **No terminó**, con lo que tardó y lo que costó; un ejemplo abierto indica qué vio cada comprobación fallida (“answer.unread es 2”).

### Quién lo hace

La sección dice: “Las ejecuciones siguen adelante sin que nadie las vigile, así que elige un modo que no se detenga a preguntar (Auto, o uno que permita ediciones).”

- Los selectores de programa, **Modelo**, **Esfuerzo** y **Modo**, como en una app lista para usar. El modo empieza en **Auto**.
- **Agente**: **Ninguno**, o un agente con el que trabaja cada ejecución (Investigador, Redactor… o uno propio), con sus instrucciones, su nivel y su presupuesto. Consulta [Agentes](/guide/agents).
- **Carpeta**: **Una carpeta nueva para cada ejecución** de forma predeterminada. **Elige una** hace que cada ejecución trabaje en una carpeta que elijas (debe existir cuando empiece una ejecución); **Usar una nueva cada vez** vuelve atrás. Con una carpeta elegida, los archivos adjuntos se guardan en una carpeta de subidas aparte, en lugar de mezclarse con los tuyos.

### Herramientas

Lo que las ejecuciones pueden usar de las herramientas propias de Hydor: búsqueda web, el navegador, páginas, memoria y el resto. **Todos** está activado al principio. Desactívalo para ver una lista con el nombre de cada herramienta y lo que hace, y marca las que pueden usar las ejecuciones. Las herramientas de archivos y comandos del propio agente siguen su modo, no esta lista.

### Claves que necesita

**Claves que necesita** (en **Configuración**) enumera las claves que usan sus ejecuciones, por sus nombres en tu bóveda: cada una con lo que es, **Adónde puede ir (hosts)**, **Dónde conseguir una**, una línea sobre cómo, e interruptores para **Puede ejecutarse sin ella** y **Los comandos de esta computadora la usan**. **Añadir una clave que necesita** añade una. A sus ejecuciones se les indica el nombre de cada clave y cómo usarla; quien instala la app da los valores (consulta [Dale las claves que necesita](#give-it-the-keys-it-needs)), que nunca forman parte de la app ni de su archivo.

### Límites

- **Ejecuciones al día (desde cualquier lugar)**: el máximo de ejecuciones que esta app puede hacer en un día, contando las ejecuciones desde el formulario, la API, otros agentes, las filas de un CSV y la página pública, y las conversaciones en su pantalla, desde la medianoche. Pasado ese máximo, se rechaza una ejecución con “Esta app se ha ejecutado … veces hoy, su límite”. Vacío: sin límite.
- **Lo máximo que puede gastar una ejecución (US$)**: el límite de gasto de cada ejecución. La ejecución se detiene cuando lo alcanza. Vacío: sin límite. Consulta [Uso, límites y costos](/guide/usage).

### Prueba antes de guardar

**Ejecución de prueba** (en un teléfono, el botón del matraz) abre un diálogo con el formulario tal como está en pantalla, guardado o no. Rellénalo y pulsa **Ejecutar la prueba**: la ejecución se desarrolla en el diálogo. **Abrir la sesión** muestra su conversación, y **Probar de nuevo** vuelve al formulario. Las ejecuciones de prueba de una app guardada aparecen en su pestaña **Ejecuciones** como “Ejecución de prueba”. **Guardar como ejemplo** guarda las respuestas de una ejecución de prueba terminada como un ejemplo nuevo, al que dar comprobaciones en **Ejemplos**.

## Cambia, copia o elimina una app

En la página de tu app:

- **Editar** abre el creador, con el título **Editar** seguido del nombre de la app. Pulsa **Guardar** al terminar; hasta entonces, **Aún sin guardar** aparece a su lado. Los cambios se aplican a las próximas ejecuciones; las ejecuciones que ya están en marcha conservan la versión con la que empezaron.
- **Más** (⋯) → **Duplicar** crea una copia con “ copia” al final del nombre, en una dirección propia. Su pantalla viene incluida como una página independiente; su página pública empieza cerrada, y sus claves y los registros que guarda no se copian.
- **Más** (⋯) → **Eliminar** pregunta “¿Eliminar …?”: sus ejecuciones, claves y página pública se van con ella, y las ejecuciones que siguen en marcha se detienen. Las sesiones que empezó se quedan. Una app que instalaste desde un archivo dice **Desinstalar** en su lugar: se elimina por completo, de la misma manera, y para volver a tenerla tienes que instalar su archivo otra vez.

El menú **Más** (⋯) de una app lista para usar tiene **Desinstalar**, que la mantiene en **Apps listas para instalar** (consulta [Instala o desinstala una app lista para usar](#install-or-uninstall-a-ready-made-app)).

### Versiones

Cada guardado que cambia lo que hace una app es una versión: **Versiones**, cerca del final de su **Editar**, las enumera de la más nueva a la más antigua, cada una con lo que cambió (o lo que dijo el agente que hizo), quién la guardó (**Tú**, **Un agente**, **Su carpeta** o **Instalada**) y cuándo, y, en las versiones con las que se probaron sus ejemplos tal como estaban guardadas, cuántos pasaron y lo que tardó y costó una ejecución, para que puedas ver si un cambio la mejoró. **Recuperar** pone en pantalla una versión anterior, y **Guardar** la convierte otra vez en la versión más nueva. Mover sus pasos por el grafo, y sus pantallas (que tienen versiones propias), no crea una versión nueva. Cada ejecución conserva la versión que ejecutó.

### Trabaja en ella como archivos

**Su carpeta**, cerca del final del **Editar** de una app guardada, coloca la app en una carpeta de archivos (**Crear su carpeta**; de forma predeterminada en Hydor/Apps dentro de tu carpeta personal), para cambiarla en cualquier editor o con un agente de programación abierto en esa carpeta. app.json es la app (lo que pregunta, hace y devuelve), instructions/ contiene las instrucciones de cada paso en Markdown, steps/ cada paso de código como la función que ejecuta, screens/ sus pantallas, y graph.json dónde están sus pasos; .naget/ tiene un esquema de app.json y los tipos de un paso de código, para que tu editor los complete y los compruebe. Cada cambio que guardas allí llega aquí como una versión de **Su carpeta**, y la app abierta en su **Editar** cambia con él (o dice **Cambió en su carpeta mientras lo cambiabas aquí.**); un error allí se avisa aquí y no cambia nada. Un guardado aquí vuelve a escribir la carpeta, y **Dejar de mantenerla sincronizada** deja los archivos donde están. Sus datos se quedan aquí, no en la carpeta. En la app de escritorio, un botón junto a la ruta de la carpeta la muestra en el administrador de archivos del sistema (**Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**).

En la computadora donde se ejecuta Hydor, la línea de comandos hace lo mismo, en su carpeta: `node dist/server/cli.js app new "Reading list"` crea una app y su carpeta, `app folder <app>` crea la de una app, `app dev <app>` prueba sus ejemplos cada vez que guardas un cambio allí, `app try <app>` la prueba una vez (y falla cuando falla una comprobación), y `app export` y `app import` la llevan a otra computadora como un solo archivo, indicando lo que hará allí antes de instalarse. `app help` las enumera; usan una clave propia, que **Configuración → Máquinas** enumera como “This computer’s command line”.

## Llamar a una app desde tus propios programas

Los scripts, los atajos y otros programas pueden ejecutar tu app con una clave y recibir su respuesta. Abre tu app → **API y uso compartido** → **API**.

1. Pulsa **Nueva clave**, indica qué la usará (para distinguir las claves) y pulsa **Crear la clave**.
2. Copia la clave de inmediato: "Tu nueva clave. Cópiala ahora: no se vuelve a mostrar."

Una clave abre solo esta app, nada más en Hydor. La lista muestra el nombre de cada clave, sus primeros y últimos caracteres, y cuándo se usó por última vez. **Revocar** termina una clave: los programas que la usan dejan de funcionar de inmediato.

La pestaña muestra una llamada de ejemplo con la dirección de tu app y respuestas de muestra. Para una app tuya llamada Trip planner, se ve más o menos así:

```bash
curl -X POST https://your-address/api/apps/trip-planner/run \
  -H "Authorization: Bearer napp_…" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"destination": "Lisbon", "start": "2026-11-20", "days": 4}, "wait": 300}'
```

- Envía las respuestas del formulario dentro de `inputs`, con los nombres de sus marcadores. Para una pregunta de archivo, indica la ruta de un archivo en esta computadora, o envía el archivo en `files` con su `name` y su contenido en base64 como `data`.
- `wait` es cuántos segundos esperar la respuesta, como máximo 900.
- La respuesta incluye el `status` de la ejecución, `result` (los campos de respuesta), `reply` (las últimas palabras del agente) y `session` (un enlace a ella), además de `error` y `costUsd` cuando los hay.
- Se puede consultar una ejecución que sigue en curso en `GET …/run/<run>?wait=60`.
- Detrás de un proxy que corta las solicitudes largas (el de Cloudflare se detiene a los 100 segundos), espera menos y vuelve a preguntar.

Una clave puede hacer hasta 30 llamadas por minuto, y se aplica el límite diario de la app. Hay más sobre la API propia de Hydor en [La API de la app](/guide/api).

## Dejar que otros agentes ejecuten una app como herramienta

Claude Code, Cursor u otro agente conectado al servidor MCP de Hydor (una forma estándar de que los agentes accedan a herramientas) pueden ejecutar tu app como una herramienta. En **API y uso compartido** → **Otros agentes**, el interruptor **Ofrecer a otros agentes** la ofrece como una herramienta con el nombre de su dirección, como `app_trip_planner`. Está activado en las apps nuevas. El agente rellena el formulario como entrada de la herramienta y espera la respuesta; una ejecución larga devuelve su id, que el agente consulta con una segunda herramienta, `app_run_status`. La dirección y los tokens que necesitan esos agentes están en [Configuración → App → Connect other agents](/settings?s=connect).

## Abrir una página pública que cualquiera pueda usar

Una página pública permite que cualquiera con el enlace rellene el formulario y vea la respuesta, sin iniciar sesión y sin acceso a nada más de aquí. Está en **API y uso compartido** → **Página pública**.

Las ejecuciones públicas siempre usan Custom, así que primero añade un modelo para Custom en [Configuración → Agents → Models](/settings?s=models). Después:

1. Activa el interruptor. El estado cambia de **Cerrada** a **Abierta a cualquiera con el enlace**, y se elige para ella el primer modelo de Custom (puedes cambiarlo más abajo).
2. Copia el enlace (la dirección de Hydor seguida de `/a/` y la dirección de la app), o **Abrir** la página.
3. Configura el resto:
   - **Modelo (uno de los de Custom)**: el modelo que usan las ejecuciones públicas.
   - **Buscar y leer en la web**: activado al principio. Desactivado, el agente responde con lo que sabe.
   - **Ejecuciones por visitante, por hora** (5 al principio), **Ejecuciones públicas al día** (50) y **Máximo que pueden gastar al día** ($2). Una línea muestra las ejecuciones públicas y el gasto de hoy.

Lo que reciben los visitantes: el nombre, el icono, la descripción y el formulario de la app, su ejecución mientras avanza y sus propias ejecuciones anteriores (las últimas 10, distinguidas por una cookie en su navegador). Nunca ven la tarea, la configuración, las ejecuciones de otras personas, la sesión ni el costo, y los errores les llegan con palabras generales. Los archivos que adjunten pueden pesar hasta 3 MB, y sus respuestas se mantienen más cortas que las tuyas. El pie de la página les recuerda que las respuestas pueden ser incorrectas.

Lo que pueden hacer las ejecuciones públicas: Custom con el modelo elegido, sin comandos y sin archivos, con la memoria y las conexiones desactivadas, en una carpeta temporal que se elimina cuando termina la ejecución. Solo pueden entregar los campos de respuesta y, cuando lo permites, buscar en la web y leer páginas públicas. Un archivo adjunto llega al agente como texto. El gasto de cada ejecución está limitado por lo que queda del presupuesto del día.

Para mantener la calma: se ejecutan a la vez como máximo 3 ejecuciones públicas de una misma app (8 entre todas las apps), un visitante espera a que termine su última ejecución antes de empezar otra, y una misma dirección puede hacer como máximo 60 ejecuciones por hora entre todas las páginas. Las ejecuciones públicas cuentan para el límite diario de la app y no admiten seguimientos. Desactiva el interruptor para cerrar la página; los visitantes verán entonces "Esta página no está abierta".

## Ejecutar una app una vez por cada fila de un CSV

Ejecuta tu app sobre una lista completa de una sola vez: una ejecución por cada fila de una hoja de cálculo guardada como CSV. Abre tu app → **Para cada fila**. (Una app ya hecha necesita antes **Hacerla mía**.)

1. **Elegir un archivo CSV**, o suéltalo sobre el recuadro. La primera línea da nombre a las columnas. Sirven comas, punto y coma y tabulaciones, hasta 500 filas.
2. En **Qué columna responde cada pregunta**, cada pregunta recibe una columna (la app la adivina por el nombre) o **Lo mismo para todas las filas…** con un solo valor. Las preguntas obligatorias necesitan una columna o un valor.
3. Revisa **Las primeras filas, tal como las recibirá el formulario**.
4. Lee la estimación del costo (consulta [Cuánto cuesta una ejecución](#what-a-run-costs)) y elige cuántas se ejecutan **A la vez**: 1, 2, 3, 4 o 6 (2 al principio).
5. Pulsa **Ejecutar** y el número de filas.

Una pregunta de archivo toma su celda como texto: una ruta en esta computadora o una dirección web. Una fila cuyos valores no encajan con el formulario falla de inmediato, con el motivo en la tabla, para que sepas qué corregir. Si las filas llevaran a la app más allá de su límite diario, Hydor lo rechaza antes de empezar.

Mientras se ejecutan las filas, se va llenando una tabla: el número de fila, las dos primeras preguntas, el estado, hasta cuatro campos de respuesta (o la respuesta), y un enlace a cada ejecución. Encima: cuántas están hechas, cuántas no terminaron, el costo hasta ahora y cuántas se ejecutan a la vez, con una barra de progreso.

- **Detener** termina las filas que aún esperan e interrumpe las que están en ejecución.
- **CSV** descarga los resultados: las respuestas de cada fila, cada campo de respuesta, su estado, cualquier error, su costo y un enlace a su sesión. Las celdas que una hoja de cálculo trataría como fórmula empiezan con un apóstrofo.
- La **×** cierra la tabla.

Las filas continúan si Hydor se reinicia. **Tablas anteriores** muestra tus ejecuciones de filas anteriores (las últimas 30) con su progreso y si están **En ejecución**, **Detenidas** o **Terminadas**; haz clic en una para abrir su tabla de nuevo.

## Ejecutar una app por sí sola

Una app puede ejecutarse por sí sola: a una hora del día, cada cierto tiempo, una vez, cuando otro servicio llama a un webhook, o cuando un vigilante detecta un cambio (una fuente, una página, un valor, una carpeta). Cada vez, se ejecuta con las respuestas que hayas definido, como si fuera desde su formulario, y la ejecución se une a las demás en **Ejecuciones**.

- **Para configurarla**: abre la app y luego **Ejecuciones** → **Cuando se ejecuta sola** → **Añadir una programación**. Ponle un nombre, rellena las respuestas que recibe cada ejecución y elige cuándo se ejecuta, como en cualquier [tarea programada](/guide/tasks#when-it-runs). **Ejecución de prueba** la prueba una vez sin guardar.
- **Respuestas desde fuera**: las respuestas de un webhook pueden tomar partes de la llamada (`{{body.title}}`, `{{headers.name}}`, `{{query.name}}`), y las de un vigilante, `{{change}}`, lo que vio cambiar. La ejecución los toma como datos, nunca como instrucciones.
- Cada ejecución te avisa con lo que devolvió, o con el motivo por el que no terminó, y el aviso abre la ejecución. Su fila en **Cuando se ejecuta sola** la pausa, la ejecuta ahora, muestra su historial o la quita; la tarea también está en [Configuración → Tareas programadas](/settings?s=tasks).
- **Una app que se abre en su propia página** ([Explorar](#explore), el Informe semanal de avances, el Cuaderno de laboratorio) la tiene más a mano: en su **Configuración**, los controles deslizantes en la parte superior de su página, **Actualizar automáticamente** la ejecuta con las respuestas guardadas allí, **Todos los días**, **Los días laborables** o **Una vez por semana el** día que elijas, a la hora que elijas. Una app ya hecha puede empezar en días propios: el Informe semanal de avances los viernes a las 16:00, el Cuaderno de laboratorio cada noche a las 21:00.

## Cuánto cuesta una ejecución

El costo de cada ejecución se muestra en su página cuando termina, y en la lista de **Ejecuciones**. Es la cifra que informa el agente, o su uso calculado a tarifas de API (para Custom, estimado a partir de lo que leyó y escribió); los modelos que se ejecutan en esta computadora cuestan $0.

Antes de ejecutar un CSV, Hydor estima todo el lote: "Unos $… por … filas", a partir del costo mediano de las últimas ejecuciones terminadas de la app (hasta 30). Con un tope por ejecución, suma lo máximo que podrían gastar las filas. Cuando la app nunca ha terminado una ejecución, dice "Ejecuta la app una vez para ver cuánto cuesta una ejecución."

Para mantener los costos bajo control, define **Lo máximo que puede gastar una ejecución (US$)** y **Ejecuciones al día (desde cualquier lugar)** en los **Límites** de la app y, para una página pública, su presupuesto diario. Consulta [Uso, límites y costos](/guide/usage) para ver lo que gastan todas las sesiones.

## Apps con pasos

Una app también puede hacer su trabajo en **pasos**: un agente hace una parte, una pregunta rápida a un modelo resuelve algo, una herramienta obtiene una página, una regla decide por qué camino seguir, los mismos pasos se aplican a cada elemento de una lista. Cada paso entrega lo que encontró al siguiente, y la ejecución devuelve al final los campos de respuesta. Los pasos hacen que una app sea más barata, más rápida y más segura que un solo agente que lo hace todo, y le permiten hacer más: guardar datos entre ejecuciones, llamar a tus otras apps, ejecutar partes en paralelo.

Creas una app con pasos en su **Editar**, o pidiéndoselo a un agente. En **Editar**, **Lo que hace** muestra su trabajo como **Una tarea**, una **Lista** de pasos o un **Grafo** de ellos (en una computadora, donde se abre en el grafo hasta que eliges la lista). En una app que es una sola tarea, **Lista** o **Grafo** convierte la tarea en un primer paso, un agente que la hace, y **Una tarea** vuelve a convertir en tarea un agente solo. **Añadir un paso** te deja elegir un tipo; un paso se abre con su configuración cuando haces clic en él, y su menú **⋯** lo mueve, lo copia o lo quita. Los pasos dentro de un **Decidir**, un **Repetir** o un **Al mismo tiempo** aparecen debajo, cada lista con su propio **Añadir un paso**. El botón **{ }** de un cuadro de texto (**Poner un valor**) inserta un valor: una respuesta del formulario, lo que dio un paso anterior (`{{find.records}}`), o uno integrado: **Hoy** (`{{today}}`), **Ahora** (`{{now}}`, la fecha y la hora), **El día de la semana** (`{{weekday}}`) y **La zona horaria** (`{{timezone}}`), todos según donde estés, y **Lo que inició la ejecución** (`{{run.source}}`: web para su formulario, api, task, screen, batch para una fila…) y **La ejecución** (`{{run.id}}`). **De dónde viene su respuesta** indica qué valor llena cada campo de respuesta (si lo dejas vacío: el último paso que dio uno con su nombre). Lo que hay que arreglar aparece debajo de su paso a medida que avanzas, y **Ejecución de prueba** prueba lo que hay en pantalla. **Grafo** los muestra como nodos y cables: los grises marcan el orden (los caminos de un Decidir y las ramas en paralelo, los pasos de un Repetir dentro de un marco, lo que se ejecuta cuando un paso falla, en rojo), los de colores marcan qué paso usa qué valores.

También puedes construir en el grafo (en una computadora; un teléfono conserva la lista). Muestra toda la ejecución: **El formulario** arriba, con **Integrado** a su lado cuando los pasos usan los valores integrados, los pasos debajo, y **La respuesta** al final; los cables discontinuos van del formulario y de los valores integrados a los pasos que los usan, y de los pasos que dan la respuesta a esta. Un clic en **El formulario** o en **La respuesta** abre su pestaña. Un clic en el nodo de un paso abre su configuración junto al grafo, con **Más** (⋯) para moverlo, copiarlo o quitarlo; el **+** de un cable pone ahí un paso nuevo, y **Añadir un paso** empieza un camino vacío. Arrastra el punto a la derecha de un nodo hasta otro paso para poner uno de sus valores en ese paso (sus instrucciones, la entrada de una herramienta, una regla…), o suéltalo en un espacio vacío para crear un paso nuevo que lo use. Arrastra los nodos para colocarlos (los pasos dentro de un Decidir o un Repetir se mueven con él), haz doble clic en el cable de un valor para doblarlo ahí (arrastra el doblez, o haz doble clic en él para quitarlo), y **Ordenar: distribuirlo todo de nuevo** los coloca automáticamente; con Mayús + clic en varios, usa **Agruparlos, con una nota**. Arrastra el fondo para desplazarte, Ctrl y la rueda para acercar o alejar, y **Pantalla completa** le da toda la ventana.

**Pruébalo**, entre los botones del grafo, ejecuta la app tal como está en pantalla como una ejecución de prueba, allí mismo en el grafo: cada paso se ilumina cuando se ejecuta y cuando termina, y los cables que llegan a los pasos ejecutados se iluminan con ellos; apunta al cable de un valor para ver qué llevaba, y la configuración de un paso empieza con cómo le fue **En la última prueba**. En la configuración de un paso, **Pausar una prueba antes de este paso** detiene una prueba justo ahí hasta que pulses **Continuar** (o **Un paso**, que vuelve a pausar antes del siguiente), y el copo de nieve (**Inmovilizar**) hace que una prueba dé lo que el paso dio en la última, de modo que los pasos posteriores a uno costoso se puedan probar una y otra vez sin costo.

**Contraer en un bloque**, entre los botones del grafo cuando hay pasos seleccionados (Mayús + clic en varios que se siguen), los convierte en una app propia, un bloque, que un paso **Llamar a una app** ejecuta en su lugar: lo que usaban del exterior (las respuestas del formulario, los valores de los pasos anteriores) pasa a ser su formulario, que la llamada rellena, y lo que los pasos posteriores usaban de ellos pasa a ser su respuesta. Otras apps también pueden llamar al bloque, y un cambio en él es un cambio para todas. Los pasos que guardan datos se quedan en la app, ya que un bloque guarda sus propios datos, y las listas y las tablas llegan a un bloque como texto.

O pídeselo a un agente: “Crea una app que lea cada enlace que le dé, lo resuma con un modelo rápido y lo guarde en una lista de lectura”. El agente escribe los pasos, los revisa y los prueba, y después puedes cambiarlos en **Editar**. Los agentes tienen herramientas propias para esto, en cualquier sesión: leen tus apps, guardan una (revisada antes, con sus errores explicados en palabras; una app completa, algunas partes o un solo paso), prueban sus ejemplos y esperan a ver cómo les fue, le dan una pantalla, y leen los registros que guarda o añaden algunos (cambiarlos o quitarlos te corresponde a ti, en su pantalla, o se te pide antes); antes de entregar una app, te dicen cuánto cuesta una ejecución.

En la conversación, cada app que el agente guarda aparece como una tarjeta, y en una pantalla ancha la app se abre junto a la conversación mientras se construye (**Abrir al lado** en la tarjeta la abre de nuevo, **Abrir su página** abre su propia página). Lo que cambies y guardes allí le llega al agente con tu siguiente mensaje, así que construye sobre tu versión: un agente que guarda después de que tú cambiaste algo lee primero tu versión. Cuando el agente guarda mientras tienes cambios tuyos en pantalla, una nota ofrece **Cargarla** o **Conservar lo mío**. En el menú **⋯** de los pasos de allí, **Preguntar al agente sobre esto** empieza un mensaje sobre ese paso en el cuadro de mensajes de la conversación.

Los tipos de pasos:

- **Preguntar a un agente**: una sesión trabaja en su parte con sus herramientas y entrega lo que encontró. Cada uno tiene una sesión propia, que puedes abrir desde la página de la ejecución.
- **Pedir a un modelo**: una respuesta rápida de un modelo, sin herramientas: clasificar, extraer, resumir. Cuesta poco, y nada si usa un modelo de esta computadora.
- **Usar una herramienta**: una de las herramientas propias de Hydor con entradas fijas: buscar en la web, leer una página, encontrar una imagen (y un video) de cada elemento de una lista, llamar a una dirección con una clave guardada, leer un documento, crear una imagen, enviarte una notificación, leer lo que Hydor sabe de ti, ordenar cosas según lo que te importa, o guardar lo que creó (diapositivas, un documento, una hoja de cálculo, un documento LaTeX o una página, en los archivos del proyecto que indique). Para artículos: encontrar y leer uno (desde una copia abierta, con su registro y su BibTeX), mantener una lista de lectura y sincronizarla con Zotero. Las imágenes encontradas así van en la columna de imágenes de una respuesta, y los videos (enlaces de YouTube o Vimeo) se reproducen en el elemento de video de una vista.
- **Decidir**: un camino u otro, según una regla (“el precio es menor que 100”) o una pregunta en palabras que responde el modelo auxiliar.
- **Repetir**: sus pasos una vez por cada elemento de una lista (de a pocos a la vez, si quieres), o de nuevo hasta que algo se cumpla.
- **Al mismo tiempo**: ramas que se ejecutan en paralelo; el flujo continúa cuando todas han terminado.
- **Llamar a una app**: otra de tus apps, como un solo paso. Debajo de los tipos, **Añadir un paso** ofrece bloques: apps hechas para ser pasos de otras, las tuyas (las marcadas como **Un bloque**, bajo los campos de respuesta de una app, y las que crea Contraer en un bloque) y las ya hechas (**Resumir una página**, **Traducir**, **Responder desde la web**, **Clasificar por tipos** y **Extraer los datos**, cada una pasa a ser tuya al incorporarla). Un bloque entra como una llamada con su formulario por rellenar; las preguntas que el formulario de la propia app tiene con el mismo nombre ya vienen rellenadas; un cambio en un bloque es un cambio para todas las apps que lo llaman.
- **Guardar datos**: añadir, buscar, cambiar o quitar los registros que guarda la app (ver más abajo).
- **Preguntar a una persona**: la ejecución espera tu respuesta, sí o no o un formulario breve: un aviso abre la ejecución, donde una tarjeta la pregunta, y la Bandeja de entrada la lista. Espera una semana a menos que fijes otro límite, y después falla. Las preguntas de **Opción** de su formulario pueden ofrecer lo que la ejecución encontró: escribe solo un valor de un paso anterior como opción, como `{{find.items}}`, y cuando el paso pregunte, la tarjeta ofrecerá cada elemento de esa lista (o cada línea de un texto) como una opción, de modo que una ejecución pueda preguntar cuál de las cosas que encontró investigar. Con **Se pueden elegir varias** marcas todas las que quieras, y `{{step.field}}` son las marcadas, una por línea. Las demás palabras de la pregunta, su texto de ayuda y sus opciones también se rellenan con valores, y una opción que se quede sin nada que ofrecer se convierte en un cuadro de texto normal.
- **Ejecutar código**: un programa tuyo, en JavaScript, TypeScript o Python, recibe los valores que le des y devuelve los valores del paso (**Lo que da** les pone nombre, para los pasos que siguen). Se ejecuta en un entorno aislado: sin red, y sin ningún archivo de esta computadora salvo los paquetes que instala la app. Solo se comunica con el exterior mediante `ctx`, y cada llamada es un paso de la ejecución: `ctx.model` pregunta a un modelo, `ctx.agent` a un agente, `ctx.tool` usa una de las herramientas de la app, `ctx.ask` espera tu respuesta, `ctx.data` guarda registros y `ctx.app` ejecuta otra app. Así, todo un flujo puede ser un solo programa, con sus propios condicionales y bucles; sus llamadas aparecen en la página de la ejecución como pasos, y cuando la ejecución se reanuda tras un reinicio, el programa se ejecuta de nuevo y las llamadas que hizo antes dan lo que dieron entonces, sin ejecutarse otra vez. Un archivo de app con pasos de código lo indica en su tarjeta de instalación.
- **Calcular un valor**: un valor a partir de otro, al instante y sin costo: el primer o el último elemento de una lista, cuántos hay, una suma, el promedio, el menor o el mayor (de un campo de cada uno), un campo de cada uno, los elementos unidos en un texto, sin repeticiones, ordenados por un campo, como número, o una fecha unos días después. Da `{{id.value}}`, y en el grafo aparece como una pequeña píldora.

Un paso puede ejecutarse solo cuando se cumpla una regla, y decir qué pasa cuando falla: otros pasos en su lugar, continuar sin él o (para un paso de herramienta, modelo, código, datos o app) **Un agente hace su trabajo**: un agente recibe lo que se le dio al paso y por qué falló, entrega los valores que usan los pasos posteriores, y la ejecución continúa. La página de la ejecución dice entonces **Un agente hizo su trabajo** junto al paso, con el motivo del fallo.

Mientras una ejecución trabaja, su página lista los pasos a medida que avanzan. Cuando termina, **Pasos** muestra cada uno con cómo le fue, cuánto tardó y cuánto costó; el botón de sesión abre la conversación de un paso de agente. Una ejecución con pasos no admite mensajes de seguimiento: cambia las respuestas y ejecútala de nuevo.

Cuando una ejecución con pasos ha terminado, cada uno de sus pasos tiene **Ejecutar de nuevo desde aquí** (↺): una ejecución nueva con las mismas respuestas, en la que los pasos anteriores a ese dan lo que dieron esta vez (marcados como **De la última ejecución**, sin costo) y el resto se ejecuta como está la app ahora. Una **Ejecución de prueba** en **Editar** también lo tiene, con lo que hay en pantalla: cambia un paso posterior y pruébalo de nuevo sin ejecutar los primeros.

### Consolidarla

Sobre los pasos en **Editar**, las últimas ejecuciones de una app te dicen dos cosas. Un paso que falló y tuvo que resolver un agente indica en cuántas ejecuciones ocurrió eso y por qué falló la última vez; **Pedir a un agente que lo arregle** se lo pide al agente que está al lado (cuando la app está abierta junto a una conversación) o empieza una sesión con el **Creador de apps**. Un paso de agente que hizo lo mismo en cada una de sus últimas ejecuciones (por ejemplo, leyó la página que se le dio y luego respondió) ofrece **Consolidarla**: pasos fijos que podrían hacerlo por menos, un paso de herramienta por cada llamada que hizo el agente, con los valores con los que las hizo, y luego un paso de modelo con sus instrucciones y lo que dieron las herramientas. **Probarlos con sus ejemplos** (o **Probarlos**, con las respuestas de esas ejecuciones, cuando no tiene ejemplos) los ejecuta primero y muestra lo que tarda y cuesta una ejecución con su agente y con los pasos; **Usar estos pasos** los pone en su lugar en pantalla, y **Guardar** los conserva. Los pasos de herramienta que crea hacen que un agente resuelva su trabajo si fallan, así que una ejecución que antes funcionaba sigue funcionando.

Los agentes que crean una app ven lo mismo, con los pasos para probar.

### Lo que guarda una app

Una app puede guardar datos entre sus ejecuciones: listas de registros, como los enlaces de una lista de lectura o los clientes de un pequeño CRM. Sus pasos los añaden, los buscan y los cambian, y también sus agentes, con una herramienta propia. Una lista puede indicar qué contiene cada registro (un título, una puntuación, una fecha…), y entonces la app comprueba lo que entra. En **Editar**, **Lo que guarda** las lista: **Añadir una lista**, y luego ponle un nombre y, si quieres, los campos que contienen sus registros (sin campos, entra cualquier registro).

Las apps ya hechas también guardan registros: la [Lista de lectura](/guide/researchers#reading-list) guarda tus artículos, que su página muestra y cambia, y que otras apps leen (la Matriz de literatura toma “mi lista de lectura”).

Los pasos y los agentes también pueden buscar en los registros a partir de una pregunta, igual que se buscan tus bases de conocimiento: por sus palabras, y por su significado cuando la [Búsqueda por significado](/settings?s=memory&find=Search%20by%20meaning) está activada, primero los mejores. Un paso también puede buscar en tus bases de conocimiento y en las notas de la memoria, con las herramientas knowledge_search y recall.

Lo que guarda una app permanece con ella hasta que eliminas la app. Las ejecuciones desde su página pública nunca llegan a ello. Las apps ya hechas también guardan registros: el Banco de anotación sus conjuntos de textos con tus etiquetas, el Cuaderno de laboratorio sus entradas; lo suyo permanece mientras desinstalas la app y vuelve con ella.

### Una app que recuerda

Una app puede recordar entre sus ejecuciones: sus agentes guardan lo que las ejecuciones posteriores deben saber (una preferencia que mostraste, una fuente que funciona, un error que evitar) en una memoria propia de la app, y cada ejecución empieza con ella. [Configuración → Memoria](/settings?s=memory) la lista como un proyecto, con el nombre de la app. Actívala con **Recuerda entre ejecuciones**, bajo **Lo que guarda** en su **Editar**.

### Lo que una app necesita en esta computadora

Una app puede necesitar cosas en esta computadora: paquetes de Node o de Python que usan sus agentes, y comandos como ffmpeg. Los paquetes se instalan en la carpeta propia de la app, nunca para toda la computadora, en cuanto instalas o cambias la app, y su primera ejecución espera a que terminen. En la página de la app, una línea indica mientras se instalan o cuando no se pudieron instalar, con **Mostrar la salida** e **Instalar de nuevo**. Un comando que usa y que esta computadora no tiene también se nombra allí: instala ese tú mismo.

## Diseñar cómo se ve

La vista de una app es cómo se ve su respuesta: páginas (pestañas y páginas que abre un clic), elementos hechos para su respuesta (una tarjeta de día, un producto con sus puntos fuertes y débiles) y eventos, que dicen qué hace un clic. Sin vista, su respuesta se muestra como una tarjeta sencilla y tablas.

En el **Editar** de una app, la pestaña **Diseño** muestra su vista con la respuesta de su última ejecución; **Respuesta inventada** muestra una con su misma forma, y debajo se enumera lo que hay que corregir en ella. En la vista previa, un clic va a páginas y marca elementos; lo que llega a la app (preguntar a su agente, ejecutarla de nuevo) funciona en la página de una ejecución.

- **Pedir a un agente que lo diseñe** (cuando la app está guardada): empieza una sesión con el **Creador de apps** y un mensaje sobre ella o, si tienes la app abierta junto a una conversación, el mensaje va a ese agente. Escribe la vista, la prueba con una ejecución y corrige lo que no encaja.
- **Empezar desde su respuesta**: una página con un bloque por cada campo de la respuesta, para cambiarla desde ahí.
- **Pedir a un agente que lo cambie**: igual que arriba, para una vista que ya existe.
- **Cambiarlo como código**: la vista como JSON, con sus páginas, elementos (HTML con valores como `{{result.days}}`, y CSS) y eventos, tal como los describe el tema de la API de la guía ([Apps: vistas](/guide/api#apps-views)); la vista previa sigue lo que escribes.
- **Quitar su vista**: su respuesta vuelve a mostrarse como una tarjeta sencilla cuando guardas.

Los eventos de una vista pueden ir a una página (con el elemento en el que se hizo clic), marcar algo o fijar un filtro (se guarda con la ejecución cuando así se indica), copiar, abrir una dirección, pedir un cambio al agente de la ejecución (en una app sin pasos), ejecutar otro de sus flujos, ejecutarla de nuevo con algunas respuestas cambiadas, empezar otra app, y añadir, cambiar o quitar un registro que guarda. Las páginas marcadas como página propia de la app se muestran ahí en lugar de su formulario, con lo que guarda y su última ejecución. Una página así tiene **Actualizar** en la parte superior, que ejecuta la app ahora, y **Configuración** a su lado: las respuestas de su formulario, guardadas para esas ejecuciones, y **Actualizar automáticamente** (todos los días, en días laborables o una vez a la semana, a la hora que elijas), como en [Explorar](#explore). Una app cuya página es un lugar para trabajar con lo que guarda (la Lista de lectura) no tiene ninguno de los dos: su página muestra sus registros de inmediato y sus botones ejecutan su formulario. Una vista es parte de la app: tiene versiones junto con ella, viaja en su archivo y sus elementos son archivos propios en su carpeta (ui/).

Además de sus propios elementos, una vista tiene elementos integrados: texto, listas para marcar, tablas y gráficos de barras, y estos para contenido multimedia:

- **Imágenes**: una, o varias lado a lado, cada una con su pie de foto.
- **Videos**: un archivo, que se reproduce en la vista, o un enlace a YouTube o Vimeo, que muestra su fotograma y se reproduce sobre la página al hacer clic.
- **Sonidos**: una grabación o una canción para reproducir.
- **Mapas**: los lugares de su respuesta, a partir de su latitud y longitud, numerados y unidos en orden cuando la vista lo indica.
- **Gráficos**: de líneas, de barras (también apiladas), de áreas, de dispersión, circulares, histogramas, de cajas y mapas de calor, y en 3D puntos, líneas y superficies, dibujados con Plotly.

Una vista también puede tener **widgets**: elementos dibujados por un script propio (una escena 3D, un juego, un gráfico de una biblioteca que elijas), que cargan desde la web (jsDelivr) las bibliotecas que nombran, cada una en una versión exacta. Todo lo que hay en una vista se dibuja en el mismo entorno aislado que las páginas: no puede acceder a esta computadora, a tu inicio de sesión ni a tus otras apps, solo hacer lo que sus eventos permiten.

**Sus propios archivos**, en la pestaña **Diseño**, contiene imágenes, videos, sonidos y datos que vienen con la app: **Añadir archivos** los añade (hasta 100 MB cada uno y 150 MB en total), una imagen se abre en grande, y el botón de copiar da el nombre con el que una vista la muestra (`asset:tram.jpg`, en un bloque de imagen, video o sonido, o en el `src` de una plantilla). Viajan en su archivo. La vista previa rellena la vista con su última ejecución, o con una respuesta inventada cuyas imágenes y videos son sus propios archivos.

## Darle una pantalla a una app

Una app puede tener una pantalla propia: una página en lugar de su formulario, que la ejecuta y muestra lo que guarda. Una lista de lectura puede mostrar sus enlaces en una tabla donde buscas y ordenas, un pequeño CRM sus clientes con un botón que redacta un seguimiento, un registro de seguimiento un recuento de lo anotado. La pantalla funciona en vivo: lo que envías en su formulario ejecuta la app, su respuesta se muestra cuando está lista y sus tablas cambian a medida que sus pasos y agentes cambian los registros.

- **Para darle una**: abre tu app y después **Más** (⋯) → **Darle una pantalla**. La pantalla se compone de sus partes: su formulario, su respuesta, una tabla por cada lista que guarda (con una conversación con su agente debajo) y sus ejecuciones anteriores. Su página se abre entonces en la pantalla.
- **Para cambiarla**: **Más** (⋯) → **Editar la pantalla** la abre en el editor de páginas, donde la cambias como cualquier página ([Cambiar una página tú mismo](/guide/library#change-a-page-yourself)): mueve y da estilo a sus partes, o pídeselo al agente. **Añadir** tiene una pestaña **App** con las partes propias de la app: **Su formulario**, **Su respuesta**, **Sus ejecuciones**, **Una conversación con su agente**, un formulario y un botón por cada uno de sus otros flujos, y una tabla y un recuento por cada lista que guarda.
- **O pídeselo a un agente**: “Dale a mi Lista de lectura una pantalla con los enlaces sin leer arriba y un botón que haga el resumen de esta semana”. Los agentes escriben pantallas con las mismas partes y pueden darle a una app más flujos para que los botones de una pantalla los inicien.

**Conversar con su agente.** La conversación de una pantalla (**Preguntar a su agente**, en una pantalla hecha con sus partes) es un chat con el agente propio de la app, con su modelo y sus herramientas: escribe un mensaje y pulsa **Enviar** (o Intro), y responde ahí. Puede buscar y cambiar lo que guarda la app, y ejecutar los flujos de la app por ti y esperar lo que den, así que “añade Piranesi, ya lo leí” o “¿cuáles de estos no he leído?” funcionan sin más. Cuando vuelves, está la última conversación; **Nueva conversación** empieza otra y **Conversaciones anteriores** abre una que tuviste antes. Las conversaciones se guardan con la app, aparte de sus ejecuciones.

Una pantalla es una página propia de la app: no está entre los archivos de ningún proyecto, desaparece cuando eliminas la app y viaja en el archivo de la app. Para ejecutar la app desde su formulario con respuestas anteriores, usa **Ejecutar de nuevo con estas respuestas** en la página de una ejecución.

## Compartir una app como archivo

Una app puede viajar como un solo archivo, para guardarla o instalarla en otro Hydor.

- **Para descargar una**: abre la app y después **Más** (⋯) → **Descargar como archivo**, o usa **Más** (⋯) en su tarjeta de la página Apps. Las apps ya preparadas se descargan igual. El archivo (`.hydor-app`) contiene todo lo que hace y necesita, sus propios archivos (imágenes, videos, datos) y las apps a las que llaman sus pasos. Cuando guarda datos, **Incluir los registros que guarda** también los incluye. Su carpeta, sus claves y su página pública se quedan aquí: las claves que necesita viajan solo por su nombre y se piden donde se instala.
- **Para instalar una**: pulsa **Nueva app** en la página Apps, luego **Instalar desde un archivo**, y elige un archivo `.hydor-app`, `.zip` o `.json` (hasta 160 MB); o suelta el archivo en la página Apps. Antes de crear nada, una tarjeta muestra qué es, en palabras sencillas: su nombre y lo que hace, **Lo que te pregunta** (con las preguntas opcionales marcadas), **Lo que obtienes**, **Cómo funciona**, **Los agentes pueden usarla**, con un interruptor para impedir que los agentes la ejecuten, y **Una clave que necesita** (o **Claves que necesita**), para dar ahora o en su primera ejecución. **Lo que usa aquí** (plegado, y abierto por sí solo cuando algo necesita revisión) enumera quién hace el trabajo, sus pasos, sus propios archivos, los scripts de su vista y las bibliotecas que cargan, sus pantallas, las herramientas que puede usar, los modelos que usa, las apps que vienen con ella, lo que instala y los comandos que usa, lo que guarda, si recuerda y sus límites. Cada modelo se muestra como configurado aquí, aquí con otro nombre, a través de OpenRouter (se añade a tus modelos en su primera ejecución y su clave se pide junto con las claves de la app) o no configurado aquí: para esos, elige uno de tus modelos como sustituto o deja el predeterminado del agente. Pulsa **Instalar**.

Algunas cosas cambian al entrar, y la tarjeta indica cuáles: una carpeta en la que trabajaba en otro lugar se deja fuera (cada ejecución recibe una propia), un modo que permite todos los pasos sin preguntar empieza como **Auto**, y se descarta un agente que esta computadora no tiene. Una app que viene con ella y es igual a una que ya tienes se reutiliza; si no, se instala junto a la tuya. Su página pública empieza cerrada y no tiene claves de API.

El archivo de una app ya preparada indica de qué app se trata: donde desinstalaste esa app, instalar el archivo la recupera (**Instalada de nuevo**); donde la tienes, el archivo se instala como una copia tuya, para cambiarla como quieras.

## Pídeselo a un agente

Los agentes de Hydor pueden crear y ejecutar apps por ti a través de su API, con tu visto bueno en una tarjeta. Por ejemplo:

- “Crea una app llamada Informe semanal que pida un proyecto y un rango de fechas, y responda con un resumen y una tabla de lo que cambió”.
- “Convierte esta sesión en una app que pueda ejecutar de nuevo”.
- “Fija el Planificador de viajes y mi Informe semanal arriba en la página Apps, con el informe primero”.
- “¿Qué apps usé últimamente y cómo salieron sus últimas ejecuciones?”
- “Ejecuta de nuevo mi Control de precios con las mismas respuestas de la última vez”.
- “Planifica un viaje de 4 días a Lisboa en mayo para los dos”. (el Planificador de viajes se ejecuta aquí y pide lo que necesita)
- “¿Qué tiempo hará esta semana en Zermatt? ¿Y qué puedo cocinar con huevos, espinacas y papas?” (el Pronóstico del tiempo y Cocinar con lo que tienes se ejecutan aquí, y cada uno muestra su respuesta en su vista)
- “Hazme un cuestionario sobre el Imperio romano, diez preguntas difíciles”.
- “Busca parques para perros y cafeterías cerca de Alexanderplatz, en Berlín”. (la app Explorar un lugar se ejecuta aquí y pregunta antes, salvo que esté en tu lista)
- “Ejecuta mi Planificador de viajes sin preguntarme cada vez”. (el agente la pone en **Ejecutar sin preguntar**, igual que **Ejecutar siempre** en su tarjeta)
- “Ejecuta la app Planificador de viajes para Lisboa, cuatro días desde el 20 de noviembre, y muéstrame el resultado cuando termine”.
- “Ejecuta mi app Investigación de empresas para cada una de estas 20 empresas y dame la tabla”.
- “Ejecuta mi Planificador de viajes todos los viernes a las 18:00 para Lisboa, tres días”.
- “Abre una página pública para mi app Carta de presentación, con un máximo de $1 al día”.
- “Detén todas las ejecuciones de mi app Control de precios y revoca sus claves de API”.
- “Desinstala la app Resumen semanal de noticias e impide que los agentes ejecuten mi app Control de precios en las sesiones”.
- “Crea una app con pasos que lea cada enlace que le envíe, lo resuma con un modelo rápido y lo guarde en una lista de lectura”.
- “Añade un paso a mi app Vigilancia de la competencia que me avise solo cuando algo haya cambiado”.
- “En mi app Explorador de compras, después de encontrar los productos, pregúntame cuáles comparar como opciones que pueda marcar, y compara solo esos”.
- “Instala la app de reading-list.hydor-app de mi carpeta Descargas”.
- “Crea una app que resuma el tiempo de una ciudad con OpenWeather. Necesita mi clave de API de OpenWeather”.
- “Añade un mapa de las paradas y un gráfico de lo que cuesta cada día a la vista de mi app Escapada urbana”.
- “Añade las fotos de ~/Pictures/Lisbon a mi app Escapada urbana y muéstralas en su primera página”.
- “Dale a la vista de mi app Informe semanal un gráfico 3D de las cifras, como un widget con three.js”.
- “Dale a mi Lista de lectura una pantalla con los enlaces sin leer arriba y un botón que haga el resumen de esta semana”.
- “Diseña una vista para mi app Informe semanal: una página con el resumen y las cifras arriba, y otra página que muestre cada cambio como una tarjeta que pueda marcar”.
- “En la vista de mi app Control de precios, añade un botón en cada tienda que la ejecute de nuevo solo para esa tienda”.
- “Afianza mi app Resumen de enlaces y pruébala primero con sus ejemplos”.
- “Haz que el paso Buscar su título de mi app Resumen de enlaces pase su trabajo a un agente cuando falle”.
- “Haz que Explorar prepare una edición nueva cada mañana a las 6:30, siempre con la Fórmula 1 incluida”.
