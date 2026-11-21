# Investigación: artículos, escritura y laboratorio

Hydor te ayuda con el trabajo que rodea a la investigación: mantenerte al día en tu campo, leer y organizar artículos, revisar un artículo antes de enviarlo, responder a las revisiones y presentar tu trabajo, además de los experimentos y los informes de tu laboratorio. Casi todo viene como apps listas para usar en **Investigación**, **Escritura**, **Laboratorio** y **Trabajo**, dentro de la página de [Apps](/apps), que los agentes también ejecutan por ti cuando se lo pides; las comprobaciones de un artículo están en el [editor de LaTeX](/guide/library), y tus ejecuciones de entrenamiento están en [Sistema → Experimentos](/guide/experiments). ¿Vas a revisar el envío de otra persona? Usa una [sesión confidencial](/guide/sessions#keep-a-session-confidential).

![Las apps para investigación en la página de Apps](images/researchers.webp)

## Mantente al día en tu campo

Seis apps ya preparadas te mantienen al día en tu campo: están en la página Apps, en **Investigación** (abre [Apps](/apps) y elige el chip **Investigación**). Cinco de ellas se abren en una página propia y pueden actualizarse solas cada día: **Radar de artículos**, **Alertas de citas**, **Vigilancia de modelos nuevos**, **Radar de fechas límite** y **Trabajos relacionados al día**. La sexta, **Buscador de huecos**, se ejecuta cuando se lo pides, con un formulario, y los agentes pueden ejecutarla por ti en cualquier sesión.

Leen servicios abiertos, con suavidad: arXiv, OpenAlex, Semantic Scholar, Hugging Face, y las listas de fechas límite ccfddl y ai-deadlines en GitHub. Hydor mismo mantiene separadas las llamadas a cada servicio (los tres segundos de arXiv, el segundo de Semantic Scholar) y vuelve a preguntar, unas cuantas veces, cuando uno está ocupado un momento; lo que aun así no se puede obtener aparece bajo la ejecución como una línea que puedes abrir (consulta [Cuando la web deja caído un paso](/guide/apps#when-the-web-lets-a-step-down)). Ninguno necesita una clave, pero dos ayudan: una **Clave de API de OpenAlex** (gratuita: sin ella, OpenAlex recibe como máximo dos consultas por actualización, de un presupuesto pequeño que comparte todo el que está en tu red) y una **Clave de API de Semantic Scholar** (gratuita si la pides: sin ella, Semantic Scholar suele estar ocupado y responde OpenAlex en su lugar, sin las frases que te citan). Introdúcelas en la configuración de la app, los controles deslizantes en la parte superior de su página, en **Claves que necesita**: van a tu bóveda, y solo a esos servicios.

Lo que guardas en [Sobre ti](/settings?s=apps&find=About%20you) (**Tus campos**, **Temas que sigues**, **Congresos y revistas que lees**, **Tú como autor** y **En qué puedes ejecutar cosas**) rellena por ti las preguntas de estas apps, así lo dices una sola vez: en un formulario aparece como una línea discreta con **Cambio**, y una app que se abre en su propia página parte de ahí para su configuración (consulta [Lo que las apps saben de ti](/guide/apps#what-apps-know-about-you)). Lo que defines en la página propia de una app se queda allí; en las demás apps, lo que Sobre ti no contempla (el foro de un formulario de revisión, el límite y el tono de una respuesta a revisores, las columnas de una matriz de literatura, un repositorio o una carpeta) parte de tu última respuesta. Donde las palabras son solo para ti, la app las escribe en tu idioma: la línea de **Radar de artículos** sobre cada artículo, el resumen de cada frase citante de **Alertas de citas**, los resúmenes de **Vigilancia de modelos nuevos**, las notas de **Radar de fechas límite** sobre cada convocatoria, las ideas de **Buscador de huecos**, la revista de [Explorar](/guide/apps#explore) y las entradas del **Cuaderno de laboratorio** (los tipos de cita, los veredictos, los tamaños, las búsquedas y los nombres de artículos y foros se quedan como están escritos, para que nada que los lea se rompa). Todo lo que va a otras personas o a un artículo se queda en el idioma del artículo: revisiones, respuestas a revisores, secciones de trabajos relacionados, matrices de literatura, diapositivas, pósteres, hilos, figuras y el informe semanal.

En la página propia de una app, **Actualizar** en la parte superior genera una nueva ahora, y los controles deslizantes contienen su configuración: **Actualizar cada día** (desactivado hasta que lo actives), la hora y sus preguntas. Bajo la página, **Antes** enumera las anteriores, y cada una se abre tal como era. Antes de la primera, la página solo pregunta lo que la app no puede hacer sin saber (tu nombre como autor, tus foros); **Hacer la primera** guarda tus respuestas como su configuración. Una vez que se actualiza cada día, Configuración → Tareas programadas también la enumera (consulta [Tareas programadas](/guide/tasks)).

### Radar de artículos

[Radar de artículos](/apps/t/paper-radar) te trae cada mañana los artículos nuevos de tu campo, ordenados según lo que trabajas, cada uno con una línea sobre lo que hace y por qué te importa.

- **Lo que lee**: los artículos nuevos de arXiv en las categorías que sigues (unos cientos como máximo, enviados en los últimos tres días, más después de una pausa), los de tus temas de cualquier campo y los de las personas que sigues; también los de OpenAlex sobre tus temas (revistas y actas). Un artículo que una actualización anterior ya mostró no vuelve nunca; uno que encontró pero quedó por debajo del corte puede volver otro día.
- **Cómo ordena**: según tus proyectos (sus nombres, descripciones y últimas sesiones), tus temas y tu perfil. Por significado, con el modelo de embeddings de tu computadora, cuando la [Búsqueda por significado](/settings?s=memory&find=Search%20by%20meaning) está activada; si no, por sus palabras. Los artículos que guardas inclinan la clasificación hacia ellos; los que descartas la alejan. Los artículos de las personas que sigues siempre van primero.
- **La página**: **Hoy**, los artículos del día bajo el proyecto o tema al que mejor encajan (elige uno arriba, o **Todos**). Cada tarjeta tiene dónde y cuándo salió, su título (un enlace a él), sus autores, lo que hace en una frase y por qué es para ti, con **☆ Guardar**, **Citar** (copia su BibTeX), **PDF**, **Profundizar** (un [informe de investigación profunda](/apps/t/deep-research) sobre él, de unos minutos) y **No es para mí** (se pliega, con **Deshacer**). **Artículos guardados** enumera lo que guardaste, lo más reciente primero, con **Copiar todo como BibTeX**, y para cada uno **Citar**, **Agregar a la lista de lectura**, **Profundizar** y **Quitarlo**.
- **Su configuración**: **Campos a seguir** (las categorías de arXiv, por nombre o código: Information Retrieval o cs.IR, Computation and Language o cs.CL; un campo que no es una categoría se toma como un tema; parten de **Tus campos** en Sobre ti), **Temas** (uno por línea; de **Temas que sigues**), **Personas a seguir** (una por línea, tal como sus artículos imprimen sus nombres) y **Cuántos artículos** (15 si no lo cambias, entre 5 y 40). Si lo dejas vacío, deduce los campos y los temas a partir de tu perfil y tus proyectos.

Una actualización hace al modelo auxiliar una o dos preguntas rápidas (qué significa cada artículo para ti) y tarda un minuto o dos.

### Alertas de citas

[Alertas de citas](/apps/t/citation-alerts) te dice quién ha citado tus artículos desde la última vez que miró, con la frase que te cita y si se apoya en tu trabajo, lo compara o lo discute.

- **La página**: **Nueva**, las citas nuevas por artículo tuyo: cómo te cita cada una (**builds on**, **compares with**, **disputes** o **mentions**, elegido a partir de la frase por el modelo auxiliar; muestra un tipo arriba), la frase con la mención de tu artículo marcada, una nota sobre lo que dice de tu trabajo, y el artículo que cita (un enlace), sus autores, dónde y cuándo, con **Copiar la frase**. **Tus artículos** enumera tus artículos con sus citas y cuántas son nuevas.
- **Cómo las encuentra**: te encuentra en Semantic Scholar (o en OpenAlex cuando está caído), mediante el id de Sobre ti si diste uno (un id de OpenAlex o un ORCID, que te encuentra con exactitud, mientras que un nombre puede dar con un homónimo), toma tus artículos que tienen citas (los más citados y los más recientes, treinta por actualización) y pregunta quién ha citado cada uno últimamente. Las citas que ha visto se conservan, así que cada actualización muestra solo lo nuevo; la primera vez, solo cuentan como nuevas las del último mes. Un artículo citante sin frase es uno que el servicio no ha leído completo. Cuando Semantic Scholar está demasiado ocupado para dar las frases, OpenAlex dice quién te citó, la página indica claramente sobre la lista que esta vez no se pudieron leer las frases y que se reintentará en la próxima actualización, y esas citas quedan pendientes de leer: la próxima actualización muestra cada una de nuevo con su frase en cuanto Semantic Scholar responda.
- **Su configuración**: **Tú, como autor** (tu nombre tal como lo imprimen tus artículos, o tu id de Semantic Scholar, dígitos, id de OpenAlex, A y dígitos, o ORCID; parte de **Tú como autor** en Sobre ti, y su id se usa mientras el nombre siga siendo tuyo) y **Solo estos artículos** (títulos, DOI o ids de arXiv, uno por línea; vacío: todos los tuyos). Una vez por semana es suficiente para la mayoría de las personas: activa **Actualizar cada día**, o pide a un agente que la haga semanal.

### Vigilancia de modelos nuevos

[Vigilancia de modelos nuevos](/apps/t/new-model-watch) vigila en Hugging Face los modelos nuevos de un tipo (rerankers, embedders y otros), los comprueba contra tus límites y ejecuta tu propia evaluación en cada uno, para que solo te enteres de los que superan tu mejor resultado.

- **Qué mira**: los modelos más recientes del tipo (con las palabras que des en sus nombres), una vez que tienen la antigüedad que indicaste (7 días si no lo cambias) y suficientes descargas para entonces; los ocho más descargados por actualización (el resto espera a la siguiente). Las copias de un modelo en otro formato (GGUF, ONNX, cuantizado) se dejan fuera a menos que tus palabras las pidan. Lee la página y la tarjeta de cada modelo para saber su licencia, su tamaño y qué es, y descarta los que tus licencias o tu límite de tamaño excluyen.
- **Tu evaluación**: da un comando con `{model}` donde va el nombre del modelo (`python eval.py --model {model}`), su carpeta, la puntuación que imprime (`ndcg@10`), si es mejor más alta o más baja, y tu mejor resultado hasta ahora. Cada modelo nuevo que vale la pena probar se ejecuta entonces en [Experimentos](/system/experiments) (grupo “New-model watch”, una GPU cada uno, en su cola), que te avisa cuando uno supera tu mejor resultado; la siguiente actualización lee la puntuación de cada ejecución. Sin un comando, solo enumera los modelos nuevos.
- **La página**: **Modelos**, cada uno con su situación (**nueva**, **evaluando**, **evaluado**, **supera** tu mejor resultado, **no ejecutado**, **omitido**, **demasiado nuevo**), lo que dice su tarjeta, su tamaño, licencia, descargas y me gusta, y su puntuación; los que superan tu mejor resultado van primero. **Tu evaluación** dice qué se ejecuta, con **Abrir Experimentos**.

### Radar de fechas límite

[Radar de fechas límite](/apps/t/deadline-radar) pone las fechas límite de tus foros en una sola cronología en tu zona horaria, te avisa antes de cada una y enlaza la convocatoria de artículos, su límite de páginas y su plantilla.

- **De dónde salen las fechas**: dos listas abiertas en GitHub, la de ccfddl y la de ai-deadlines, combinadas. Un foro que ninguna lista tiene se busca en la web: busca la próxima fecha límite del foro, lee la mejor página y hace que el modelo auxiliar anote la fecha, su zona horaria y el nombre y el año del congreso; esa fecha límite indica que se tomó de su sitio web, con un enlace a la página, para que puedas comprobarla allí. Solo un foro que la web tampoco da aparece en **Congresos** como no encontrado. Cada fecha límite se convierte de la zona horaria que da su convocatoria (la mayoría dice AoE, Anywhere on Earth, que es UTC−12) a la tuya, que la app toma de tu navegador.
- **La página**: **Cronología**, cada fecha límite próxima con su día y hora donde estás, qué se entrega, tal como lo da la convocatoria, dónde es el congreso, los enlaces a la página de **Convocatoria de artículos** (la encontrada, conservada de una actualización a otra, o si no el sitio del congreso) y a la **Plantilla** y su límite de páginas, y cuánto falta (según miras); el próximo plazo de resumen o de artículo de cada foro destaca. Muestra un foro arriba; **Copiar los plazos** los copia como líneas; **Mostrar los pasados** despliega los de los últimos meses. **Congresos** muestra cada foro completo, su categoría, su próxima fecha límite y su sitio, y los nombres que ninguna lista conoce.
- **Recordatorios**: cada actualización te envía una notificación con las fechas límite en los días que indicaste (14, 3 y 1 si no los cambias), cada recordatorio una sola vez, todos en una notificación. Activa **Actualizar cada día** para que lleguen a tiempo.
- **Su configuración**: **Tus sedes** (como las dices, separadas por comas: SIGIR, ACL, EMNLP, NeurIPS, The Web Conference, KDD…; parten de **Congresos y revistas que lees** en Sobre ti) y **Recordármelo** (días antes, separados por comas; vacío: sin recordatorios). Para encontrar el límite de páginas y la plantilla de cada convocatoria, busca la convocatoria una vez por congreso y la lee (el modelo auxiliar los anota).

### Trabajos relacionados al día

[Trabajos relacionados al día](/apps/t/living-related-work) mantiene una página para cada uno de tus temas que crece a medida que aparecen artículos: cada artículo resumido, con su relación indicada, agrupado en temas, y los nuevos marcados.

- **Cómo crece**: la primera vez, toma los mejores artículos de arXiv sobre cada tema y los últimos del año pasado, y los más citados de OpenAlex; después, lo que ha salido desde entonces. Los artículos que citan tus artículos semilla entran para todos los temas. El modelo auxiliar conserva los que una sección de trabajos relacionados debería citar, resume cada uno en una frase, dice cómo se relaciona (con el tema y con tus semillas) y lo coloca en un tema.
- **La página**: **Trabajos relacionados**, cada tema con sus artículos tema por tema, lo más reciente primero, y los que añadió la última actualización marcados como **Nueva** (elige un tema arriba). Cada artículo tiene su clave de cita, **BibTeX** (copia su entrada) y **Sin relación** (sale del tema para siempre). **Redactar los trabajos relacionados** hace que el modelo auxiliar escriba la sección del tema en LaTeX, un párrafo por tema, a partir de hasta unos 60.000 caracteres de tus artículos (los más recientes; dice cuántos dejó fuera), con claves `\cite` de tus artículos (una clave que no es de ninguno se elimina, y la página lo indica): se muestra con **Copiar el LaTeX** y **Copiar el .bib** cuando termina (unos minutos; continúa si te vas). **Exportar BibTeX** reúne todas las entradas del tema para copiarlas. **Nuevo esta vez** enumera lo que añadió la última actualización.
- **Su configuración**: **Temas** (uno por línea), **Artículos semilla** (títulos, ids de arXiv o DOI, uno por línea) y **Máximo de artículos por tema** (80 si no lo cambias).

### Buscador de huecos

[Buscador de huecos](/apps/t/gap-finder) cruza tus artículos con los de este mes en una zona para obtener ideas de proyecto, comprueba en cada una el trabajo previo y la dimensiona según el cómputo que tienes. Se ejecuta desde su formulario, o un agente la ejecuta por ti en una sesión.

- **Lo que das**: **Tus artículos** (tu nombre como autor, que trae tus artículos más recientes y más citados, o sus títulos o ids de arXiv, uno por línea; tu nombre parte de **Tú como autor** en Sobre ti, y el ORCID o el id de OpenAlex guardado con él te encuentra con exactitud mientras el nombre sea ese), **La zona** (con palabras, o una categoría de arXiv: conversational search, cs.IR; varias separadas por comas se buscan juntas; parte de **Tus campos**), **El cómputo que tienes** (una GPU de 24 GB si no dices otra cosa; parte de **En qué puedes ejecutar cosas**) y **Cuántas ideas** (5).
- **Lo que hace**: lee tus artículos y los del último mes en la zona, ordena los del mes según los tuyos y hace que el modelo auxiliar proponga ideas que los crucen. Para cada idea, de tres en tres, busca trabajo previo en arXiv y Semantic Scholar y hace que el modelo auxiliar lo juzgue: **nueva**, **hecho en parte** o **ya hecho**, con el artículo más cercano; el primer experimento que ejecutar, lo que requiere con tu cómputo, y si **cabe**, está **justo** o es **demasiado grande**.
- **La vista**: **Ideas de investigación**, las nuevas primero (muestra un veredicto arriba), cada una con lo que cruza, por qué su veredicto, el trabajo más cercano (un enlace), el primer experimento y su coste, y **Planificarlo** (abre la app Research sprint con la idea como pregunta), **Profundizar** (un informe de investigación profunda sobre el trabajo cercano) y **Copiar**. **Lo que cruzó** enumera tus artículos y los del mes que usó.

## Leer y organizar artículos

Tres apps listas para usar, en **Investigación** en [la página de Apps](/apps), te ayudan con los artículos que lees: la **Lista de lectura** los guarda, la **Matriz de literatura** compara varios en una hoja de cálculo, y **Reproducir un artículo** comprueba que los números de un artículo se sostienen ejecutando su código. Ábrelas ahí, o pide lo que hacen en cualquier sesión (“Agrega 1706.03762 a mi lista de lectura”), y el agente las ejecuta por ti ([Pide a un agente que ejecute una app por ti](/guide/apps#have-an-agent-run-an-app-for-you)).

Encuentran un artículo con cualquiera de estas formas: un DOI, un id de arXiv, un enlace (de arXiv, de un DOI, de la ACL Anthology, de OpenReview, de la página de una editorial o de un PDF), su título, o un PDF en esta computadora. Leen los artículos solo a partir de copias abiertas (arXiv, las copias abiertas que conoce OpenAlex, la página del propio artículo), nunca más allá de un muro de pago: un artículo sin copia abierta se lee a partir de su resumen, y la app lo indica.

### Lista de lectura

[La Lista de lectura](/apps/t/reading-list) se abre con tus artículos en lugar de un formulario: es un lugar para trabajar.

- **Agregar un artículo**: **+ Agregar**, luego **El artículo** (un DOI, un id de arXiv, un enlace o su título) y, si quieres, su **Proyecto**, sus **Etiquetas** (separadas por comas) y su **Estado**. **Añadirlo** lo busca y lo guarda con sus autores, año, publicación, resumen, enlaces a él y a un PDF abierto, y su entrada BibTeX. Un artículo que ya tienes no se agrega de nuevo (mismo DOI, id de arXiv o título): se completa lo que le faltaba, y tus notas, etiquetas y estado se quedan como estaban. Uno que no se encuentra se guarda con el título que diste y una entrada hecha a partir de él: revísalo.
- **Buscar tus artículos**: arriba se indica cuántos tienes por leer, cuántos estás leyendo y cuántos has leído (haz clic en uno para mostrar solo esos), y en cuántos proyectos. **Buscar en tus artículos** los encuentra por cualquiera de sus palabras, y **Todos**, **Por leer**, **Leyendo ahora** y **Lectura terminada** muestran un solo estado. Cada artículo muestra sus autores, publicación y año, su proyecto y etiquetas (haz clic en una para mostrar solo sus artículos; su **✕** los muestra todos de nuevo), y **Por leer**, **Leyendo ahora** y **Lectura terminada**, para cambiar en qué punto está: **Lectura terminada** anota el día.
- **La página de un artículo**: haz clic en su título. Tiene **Su página** y **El PDF** (o **Abrir el PDF**, si está en esta computadora), en qué punto está, su resumen, su proyecto y etiquetas (cada uno con **Guardar**), tus **Notas** (**Guardar las notas**), su BibTeX (**Copiar el BibTeX**) y **Quitar de la lista**. **Reproducirlo** abre [Reproducir un artículo](#reproduce-a-paper) con el artículo ya rellenado.
- **Por proyecto**: cada proyecto con cuántos artículos tiene y cuántos has leído; haz clic en uno para mostrar sus artículos. Pon el nombre de uno de tus [proyectos](/guide/projects) y sus artículos pasan a ese proyecto (lo siguen cuando le cambias el nombre), o usa el nombre que quieras.
- **Más** tiene **Importar un .bib** (pégalo, o indica la ruta de un archivo .bib en esta computadora, con un proyecto y etiquetas para los artículos que agrega: los que ya tienes se completan y los tuyos se conservan), **Exportar un .bib** (**Los mostrados**, tal como los muestran tu búsqueda y tus filtros, o **Todas**: un archivo para descargar, o **Copiarlo**) y **Sincronizar con Zotero** (más abajo).
- **Hacer una matriz de literatura**: marca artículos (la casilla a su izquierda), y aparece una barra que indica cuántos elegiste, con **Hacer una matriz de literatura**, que inicia la [Matriz de literatura](#literature-matrix) con ellos, y **Borrar**.

Cuando un agente agrega un artículo por ti, su tarjeta muestra **El artículo**: el artículo tal como lo tiene ahora la lista, si era nuevo, **Abrir tu lista de lectura** y su BibTeX para copiar.

### Mantenerla al día con Zotero

**Más** → **Sincronizar con Zotero** → **Sincronizar ahora** mantiene la lista y tu biblioteca de Zotero al día.

1. La primera vez, la página te pide tu **Clave de API de Zotero**: **Obtener una** abre la página de claves de Zotero, donde creas una que pueda leer tu biblioteca (y escribir en ella, para que los artículos también vayan allí). Pégala y pulsa **Guardar**: va a tu bóveda, solo para Zotero ([Guardar claves en la bóveda](/guide/connections#keep-keys-in-the-vault)). **ID de usuario de Zotero** puede quedar vacío: se obtiene a partir de la clave (para la biblioteca de un grupo, indica `groups/` y el número del grupo). Luego pulsa **Sincronizar ahora** otra vez.
2. Lo que hay en Zotero entra: se agregan los artículos nuevos y los que ya tienes se completan, emparejados por DOI, id de arXiv o título. Los datos de Zotero prevalecen donde difieren, y tu estado, tus notas y tu proyecto siguen siendo tuyos.
3. Los artículos que solo están aquí van a Zotero, como elementos nuevos.

Cada sincronización posterior a la primera mueve solo lo que cambió desde la anterior. Un artículo que eliminas en Zotero se queda aquí, sin vínculo, y nunca se vuelve a enviar. Una línea arriba de tus artículos indica cuándo se sincronizó por última vez y qué hizo (“12 nuevos desde Zotero, 3 enviados a él”), con **Sincronizar de nuevo**.

### Matriz de literatura

[La Matriz de literatura](/apps/t/literature-matrix) lee varios artículos lado a lado y rellena una hoja de cálculo: una fila por artículo, una columna por cada aspecto que comparas, y en cada celda lo que dice el artículo, con el lugar donde lo dice (su página o sección).

- **Los artículos**: uno por línea (treinta como máximo), cada uno un DOI, un id de arXiv, un enlace, un título o un PDF en esta computadora. O de tu lista de lectura: una línea como “mi lista de lectura, etiqueta: dense” (o un proyecto, o un estado: “mi lista de lectura, por leer”). **Hacer una matriz de literatura** en la Lista de lectura lo rellena con los artículos que elegiste.
- **Las columnas**: una por línea; **Tarea**, **Datos**, **Método**, **Métricas**, **Resultados** y **Límites** hasta que las cambies, y después las que usaste la última vez.
- **Proyecto**: el proyecto tuyo en el que se guarda su hoja de cálculo. Una línea “mi lista de lectura” sin nada más toma entonces los artículos de ese proyecto.

Lee tres artículos a la vez (el artículo completo a partir de una copia abierta, o su resumen cuando no hay ninguna), hace que un modelo rápido rellene cada fila, escribe lo que dicen los artículos en conjunto y guarda la matriz como una [hoja de cálculo](/guide/library#spreadsheets) en los archivos del proyecto, con una segunda hoja que enumera los artículos. Su vista tiene **La matriz** (cuántos leyó, **Abrir la hoja de cálculo**, **Copiar como tabla**, la matriz en sí, los artículos que no pudo leer y por qué, y **Otra columna**: ponle nombre a una, y **Hacerlo de nuevo con eso** la ejecuta otra vez con esa columna también), **Artículos** (cada uno con lo que hace en una frase, y a partir de qué se leyó) y **En todos los artículos** (en qué coinciden y en qué difieren y qué queda abierto, con **Copiarlo**).

### Artículos que respaldan una afirmación

Mientras escribes en el [editor de LaTeX](/guide/library#latex-documents), elige una frase que necesite una cita y selecciona **Insertar → Buscar una cita para esto**. El modelo auxiliar convierte la afirmación en búsquedas en OpenAlex y arXiv y lee los resúmenes de lo que encuentran; el cuadro de diálogo enumera los artículos que respaldan la afirmación, con fuerza o en parte, cada uno con el porqué en una línea, sus autores, año y publicación, y su resumen. **Citar** agrega el BibTeX del artículo a tu bibliografía (la entrada de doi.org o la propia de arXiv, bajo una clave que aún no exista) y pone el `\cite` después de la afirmación, y un segundo se une al primero; **Añadir** solo lo agrega. Solo se envían la afirmación y las palabras que la rodean, nunca el resto del artículo.

El mismo editor revisa tu artículo (**Herramientas → Revisar con IA**), reescribe las palabras que elijas manteniendo cada comando, fórmula, `\cite` y `\ref` (**Editar → Reescribir con IA**), escribe una ecuación, una tabla o un algoritmo que describas (Ctrl+K), lee uno a partir de una imagen, explica y corrige los errores de TeX, y ordena la bibliografía; consulta [Documentos LaTeX](/guide/library#latex-documents).

### Reproducir un artículo

[Reproducir un artículo](/apps/t/reproduce-paper) ejecuta el propio código de un artículo para ver si sus números se sostienen: encuentra el código, construye su entorno, obtiene sus datos y checkpoints, ejecuta su evaluación, compara los números con la tabla del artículo y dice lo que costó. **Límites** parte de los que diste la última vez, y lo que guardas en About you como **En qué puedes ejecutar cosas** también llega al agente, para que elija ejecuciones que quepan en tu máquina.

- **El artículo** (o **O súbelo**), **Su código** (un enlace o una carpeta en esta computadora; si lo dejas vacío, se busca), **Qué reproducir**, tal como lo nombra el artículo (“Tabla 2, la fila BM25 + monoT5 en MS MARCO dev”), **Límites** (el tiempo, el disco y las GPU que puede usar: “Como máximo 4 horas, 100 GB de disco y 1 GPU” hasta que lo cambies) y **Dónde trabajar** (una carpeta; una nueva para cada ejecución si se deja vacía).

Lee el artículo y busca en él su código; cuando el artículo no menciona ninguno, busca en GitHub y en la web a la vez y elige el repositorio más probable. Un modelo rápido determina la configuración exacta (los datos y la partición, el modelo y el checkpoint, los ajustes) y los números que hay que igualar, tal como están impresos. Después un agente hace el trabajo como indica la habilidad **reproduce-paper**: un entorno limpio como indica el repositorio (venv, conda o Docker), los datos y los checkpoints, una ejecución en una porción pequeña primero, luego la ejecución real, con cada cambio que hace anotado y su porqué, y un informe, `REPRODUCTION.md`, en la carpeta de trabajo. Una ejecución real que necesita una GPU u horas va a [Experimentos](/guide/experiments), que espera a que haya GPU libres y guarda el registro y el log de la ejecución: la app espera a que terminen sus ejecuciones sin mantener ocupada una sesión, y luego un agente lee sus números y termina el informe. Por último, cada número se coloca junto al del artículo: dentro de medio punto en una escala de 0 a 100 (0,005 en una escala de 0 a 1) cuenta como reproducido.

Su vista tiene **¿Se reprodujo?** (el veredicto, cuántos números se acercaron, las horas que tomó y las correcciones que hizo, su repositorio, **Abrir la carpeta**, sus ejecuciones en Experimentos, y **Reintentar** cuando no se reprodujo; luego los números del artículo junto a los nuestros con la diferencia, los cercanos en verde, y la configuración tal como la da el artículo), **Lo que costó** (cada paso con sus minutos, y cada cambio y corrección) y **Informe** (con **Copiar el informe**).

Ejecuta código en esta computadora y puede tardar horas: se mantiene dentro de tus límites, y cuando alguno se vaya a superar, se detiene e informa de lo que tiene. El código que no puede obtener, o los datos que no son públicos, los dice claramente.

**Resalta artículos mientras los lees.** Abre el PDF de un artículo en Archivos y pulsa **Resaltar**: selecciona un pasaje, o arrastra un recuadro alrededor de una ecuación o una figura, para resaltarlo en uno de cuatro colores y escribir una nota sobre él. **Preguntar** consulta a un agente solo sobre esa parte (“¿Qué dice esta ecuación?”), y **Notas** enumera todo lo que marcaste, página por página. **Guardar en un proyecto** pone tus resaltados y notas en el conocimiento de un proyecto como un documento con el nombre del artículo, mantenido al día, para que las sesiones del proyecto los encuentren; **Guardar en el PDF** los escribe en el archivo para otras apps. Consulta [Leer y resaltar un PDF](/guide/files-git#read-and-highlight-a-pdf).

## Comprobar un artículo antes de enviarlo

Antes de que un artículo salga, el editor de LaTeX lo comprueba como lo harían la secretaría de una sede y sus revisores: sus referencias, si te delata, sus páginas y fuentes, las partes que pide la sede y los números de sus tablas. Abre tu artículo (un documento LaTeX, entre los archivos de su proyecto: los detalles del proyecto → **Archivos**) y elige **Herramientas → Comprobar antes de enviar**.

1. Elige adónde va: **ACL Rolling Review** (un artículo largo o corto; **EMNLP** y **NAACL** reciben artículos a través de ella), **SIGIR** (completo o corto), **CIKM**, **WSDM**, **TheWebConf**, **KDD**, **NeurIPS**, **ICLR**, **ICML**, **AAAI**, **Una revista de IEEE**, **Una revista de ACM** u **Otros**, con un límite de páginas y una **Revisión anónima** propios. Una línea debajo dice qué pide la sede: su límite de páginas, qué no cuenta para él, si revisa de forma anónima y las partes que exige. Las sedes cambian sus reglas cada año, así que la línea también enlaza con la convocatoria. La comprobación recuerda la sede de cada artículo y, la primera vez, elige la que indica el estilo del propio artículo.
2. **Comprobar** compila el artículo, lee su PDF, busca sus referencias en línea y muestra lo que encuentra a medida que llega. Solo se envían los títulos, los DOI y los id de arXiv de las referencias, a Crossref, arXiv, OpenAlex, Semantic Scholar y DBLP; lo que dijeron los servicios se guarda unos días, y el que no respondió se nombra debajo de los resultados. OpenAlex y Semantic Scholar responden con más facilidad a los programas si tienes una clave gratuita propia: añádela en [Claves](/apps/connected?tab=keys) como OPENALEX_API_KEY (para api.openalex.org) o SEMANTIC_SCHOLAR_API_KEY (para api.semanticscholar.org), y la comprobación la usará.

Lo que encuentra se divide en cinco grupos, y cada hallazgo se marca como **Hay que corregir**, **Comprobar** o **Para tu información**:

- **Referencias**: claves citadas que no están en ninguna entrada de la bibliografía (o citadas con otras mayúsculas que las de su entrada), entradas que nunca se citan, el mismo artículo bajo dos claves y entradas sin lo que necesita su tipo (la revista de un artículo, las actas de una ponencia, un año). Cada entrada citada se busca por su DOI, su id de arXiv o, si no, su título, y se compara con lo que figura en los servicios: su título, sus autores, su año y dónde apareció. Para un preprint se busca una versión publicada, que los revisores esperan que cites. Un artículo que no se encuentra en ninguna parte se señala como posiblemente inexistente: compruébalo tú mismo, porque los servicios también pueden pasar cosas por alto.
- **Anonimato**, donde la revisión es anónima: tus nombres, cuando la plantilla está en su versión final (las de ACL, NeurIPS, ICML, ICLR y acmart tienen una versión anónima); notas **\thanks**; una sección de agradecimientos; enlaces que pueden nombrarte a ti o a tu laboratorio (tu propio repositorio, una página personal); “nuestro trabajo previo” junto a una cita; y los campos Author y Title del propio PDF.
- **Formato**: las páginas que cuentan para el límite (hasta donde empiezan las referencias, o las partes que la sede no cuenta, como las Limitations de ACL), las páginas de las referencias y las páginas en total donde la sede las limita; fuentes Type 3 y fuentes no incrustadas; cambios en los márgenes, las fuentes y el espaciado de la plantilla, y **\vspace** negativos (como pistas: algunos están permitidos); referencias y citas que aparecen como ??; marcas **TODO**, **XXX** y **\todo**; líneas que se salen mucho al margen; y los errores, cuando no se compila.
- **Partes obligatorias**: un resumen, y lo que pida la sede: la sección Limitations de ACL, el Paper Checklist de NeurIPS (y sus respuestas que aún están en **\answerTODO**), el Impact Statement de ICML, la declaración de uso de IA de ICLR, la declaración de GenAI de CIKM, los Index Terms de IEEE, los CCS concepts y las palabras clave de ACM.
- **Números**: consulta [Números que coinciden con tus ejecuciones](#numbers-that-match-your-runs).

El botón con el archivo y la línea de un hallazgo lo muestra en el código fuente. Donde un cambio es seguro, **Corregir** lo hace: la entrada tal como la listan los servicios, con la misma clave, para que tus citas se queden como están (**La entrada** la muestra antes), la versión publicada de un preprint, la plantilla cambiada a su versión anónima, los agradecimientos comentados, el campo Author del PDF vaciado, una nota **\todo** quitada, la negrita movida, una tabla actualizada. Una corrección es un cambio en el editor como cualquier otro: **Deshacer** lo revierte y **Guardar** lo conserva como una versión nueva. Donde ningún cambio es seguro, **Preguntar al agente** se lo pide al agente que está junto al editor, con el hallazgo en la petición; **Pedir al agente que los corrija** se lo pide para todos a la vez.

**Añadir como comentarios** pone los hallazgos abiertos sobre sus palabras como comentarios del documento (consulta [Documentos LaTeX](/guide/library#latex-documents)), de modo que tú, las personas con quienes compartes el artículo y los agentes los veáis cada uno donde corresponde; un agente al que se le pide responder a los comentarios los corrige y los resuelve. Vuelve a comprobar y te dice cuántos se han corregido desde la última comprobación, cuántos quedan y cuántos son nuevos; **Añadir como comentarios** resuelve entonces los comentarios de los corregidos.

Los agentes ejecutan la misma comprobación sobre un artículo que hayas guardado o un proyecto LaTeX tuyo: “revisa mi artículo para ACL antes de enviarlo”.

### Números que coinciden con tus ejecuciones

La comprobación lee todas las tablas del artículo, número por número:

- **Negrita en el mejor valor.** En cada columna, la negrita debe marcar el mejor valor. Qué sentido es mejor lo indica el encabezado de la columna: pérdida, error, latencia o perplejidad, más bajo; exactitud, F1, nDCG o BLEU, más alto; una flecha (↓ o ↑) lo dice sin rodeos. Donde el encabezado no lo dice, se toma como mejor el valor más alto, y el hallazgo lo indica. La negrita en el mejor de cada bloque de filas (entre dos líneas), los empates y las tablas con sus métricas en filas están bien. **Mover la negrita** la pone en el mejor valor.
- **Tablas hechas con Experimentos.** Una tabla que pones en el artículo desde [Experimentos](/system/experiments) (**Crear una tabla** y luego **Incluirla en un documento LaTeX**) tiene encima una línea `% hydor:table …`. La comprobación la recalcula a partir de sus ejecuciones tal como están ahora, y señala cada número que ha cambiado desde entonces, y las marcas de significancia que han aparecido o desaparecido. **Actualizar la tabla** pone la nueva.
- **Las demás tablas.** Sus números se buscan en las ejecuciones terminadas del proyecto del artículo (o de su carpeta), redondeados como los redondea la tabla, y como porcentajes. Cuántos se encontraron se dice para tu información, nunca como un problema: un número puede venir de otro artículo o de una ejecución hecha en otro lugar.

### El paquete de arXiv

**Exportar → Paquete de arXiv (.zip)**, en la parte superior de un documento LaTeX abierto (en un teléfono, **Más** (⋯) → **Descargar como**), crea un .zip del artículo guardado para subirlo a arXiv, que publica el código fuente tal como lo envías. Lo que hará aparece marcado:

- **Quitar los comentarios**, con seguridad: `\%` se queda, y también lo que TeX toma tal cual (texto verbatim, listings, **\verb**, las direcciones de **\url** y **\href**); los bloques `\begin{comment}` se van, y con **Quitar también los bloques \iffalse … \fi**, esos también.
- **Solo los archivos que usa el artículo**: las imágenes que muestra **\includegraphics**, los archivos que lee, sus propios estilos y clases.
- **Añadir el .bbl y dejar fuera el .bib**: la bibliografía tal como se compiló aquí, que es la que usa arXiv. Desmárcalo para enviar el .bib y dejar que arXiv ejecute BibTeX.
- **Incluir los archivos \input y \include en main.tex** y **Poner \pdfoutput=1 al principio** (la forma antigua de arXiv de pedir pdfLaTeX), cuando los marcas.

Los nombres con espacios reciben guiones, y el código fuente se ajusta. **Crear el paquete** compila el paquete tal como está, en el mismo entorno aislado que cualquier documento, para comprobar que se genera, y lo descarga. El cuadro de diálogo dice qué contiene, qué se dejó fuera o se renombró, cómo se compiló, su tamaño frente al límite de 50 MB de arXiv y qué procesador elegir en arXiv. Recuerda tus elecciones.

### Versión final, otra plantilla y tu artículo en las apps

**Herramientas → Tu artículo** tiene el resto:

- **Prepararlo para la versión final** le pide al agente que está junto al editor la versión final, escrita según las reglas de la sede: la versión final de la plantilla, los autores y sus afiliaciones de vuelta, los agradecimientos de vuelta, el bloque de copyright o de derechos, lo que añade la versión final y su límite de páginas. Dale los autores, sus afiliaciones y los agradecimientos si no están en el código fuente.
- **Pasar a otra plantilla** le pide al agente que pase el artículo a la plantilla de otra sede (o a LNCS de Springer, a la de Elsevier, a un artículo sencillo), como su versión para revisión o su versión final, conservando sus palabras, figuras, tablas y referencias.
- **Paquete de arXiv (.zip)**, como se explicó antes.
- **Revisarlo como lo harían los revisores**, **Responder a las revisiones** y **Crear una charla, un póster y un hilo** abren esas apps con tu artículo ya cargado (su PDF o, para la charla, la carpeta de sus fuentes): consulta [Revisar, responder y presentar tu artículo](#review-answer-and-present-your-paper).

Lo que aún no está guardado se guarda primero, de modo que cada una recibe el artículo tal como lo ves.

## Revisa, responde y presenta tu artículo

Cuatro apps listas para usar, en **Escritura** en [la página de Apps](/apps), te ayudan con tu propio artículo: el **Simulador de revisores** revisa tu borrador como lo harían los revisores de una sede, la **Mesa de trabajo de la respuesta a revisores** redacta tu respuesta a las reseñas que recibiste, **Del artículo a la charla, el póster y el hilo** crea con lo que lo presentas, y el **Médico de figuras** deja sus gráficos listos para imprimir. Las tres primeras leen tu artículo desde un PDF, un archivo .tex o la carpeta de un proyecto LaTeX en esta computadora, un enlace, o un documento LaTeX que guardaste (pega su dirección); **O súbelo** toma un PDF en su lugar.

### Simulador de revisores

[El Simulador de revisores](/apps/t/reviewer-simulator) revisa tu borrador antes que los revisores reales, con el formulario de revisión y las puntuaciones propios de la sede, y enumera lo que probablemente te pedirán, lo más peligroso primero.

- **Tu artículo**, **La sede** (**ACL Rolling Review**, **SIGIR**, **NeurIPS**, **ICLR**, **ICML**, **KDD**, **CIKM**, **WSDM**, **TheWebConf**, **Una revista** u **Otros**, cada una con su formulario de 2025), **Cuántos revisores** (de 1 a 5; 3 si no lo cambias) y **Algo en lo que centrarse**.

La sede que elegiste la última vez aparece de nuevo la próxima. Un artículo que no se puede leer (sin copia abierta, un PDF sin texto) detiene la ejecución de inmediato y lo indica, junto con cómo darlo de otra manera: su PDF con **O súbelo**, la ruta de su archivo .tex o de su carpeta LaTeX, o su id de arXiv o un enlace.

Reúne a los revisores, cada uno con un enfoque propio (en orden: el experto en el método, el experto en el área, un empirista escéptico, un lector cuidadoso de un campo vecino y un revisor de reproducibilidad), y cada uno rellena el formulario de la sede, en paralelo. Después un editor de área escribe la metarrevisión con el resultado probable, y las debilidades se ordenan según la probabilidad de que hundan el artículo. Las reseñas provienen de un modelo: encuentran puntos débiles antes que los revisores reales, y no son un pronóstico de la decisión.

Su vista tiene **Las revisiones** (la sede, el resultado probable, la puntuación general media y luego cada reseña: su revisor y enfoque, puntuaciones, resumen, puntos fuertes, debilidades y preguntas), **Metarrevisión** (con **Copiarlo** y **Copiar todas las reseñas**; luego **Lo que podría hundirlo, lo más peligroso primero**: cada debilidad con su porqué, su probabilidad y qué la corrige), **Líneas base y ablaciones** (lo que los revisores pedirán, por qué y el trabajo que supone) y **Antes de enviar** (una lista para ir marcando, y **Responde estas reseñas**, que inicia la Mesa de trabajo de la respuesta a revisores con ellas, para ensayar tu réplica).

### Mesa de trabajo de la respuesta a revisores

[La Mesa de trabajo de la respuesta a revisores](/apps/t/rebuttal-workbench) redacta tu respuesta a las reseñas que recibiste, punto por punto, dentro del límite de la sede.

- **Las revisiones** (pégalas todas, cada una bajo su revisor: “Reviewer 1”, “R2”, el “Reviewer xYz1” de OpenReview…), **Tu artículo** (o **O súbelo**; opcional, para que las respuestas remitan a sus secciones), **El límite** (tal como lo fija la sede: caracteres o palabras, por revisor, por punto o en total; “2.500 caracteres por revisor” hasta que lo cambies) y **Tono** (**Cortés y firme**, **Cordial y agradecido** o **Breve y directo**). El límite y el tono parten de los que indicaste la última vez.

Separa las reseñas por revisor, extrae los puntos de cada una en paralelo, fusiona el mismo punto planteado por varios revisores y los clasifica: mal leídos (tu artículo ya lo responde), necesitan un experimento, necesitan palabras (una aclaración, una justificación, una cita) o menores. Busca lo que dice tu artículo sobre cada uno, redacta cada respuesta dentro de la parte del límite que le corresponde y arma la réplica, contada frente al límite. Una respuesta que necesita un resultado nuevo deja [marcadores] para que los rellenes: nunca inventa resultados.

Su vista tiene **Puntos planteados** (la réplica en una línea; **Todos los puntos**, **Mal leídos**, **Necesitan un experimento**, **Necesitan palabras** y **Menor** muestran un solo tipo; cada punto con quién lo planteó, en sus palabras, su borrador de respuesta, su longitud frente a la parte que le toca, y **Copiar**), **Por hacer** (los experimentos que ejecutar y los cambios que hacer en el artículo, para ir marcando) y **Réplica completa** (la respuesta a cada revisor frente al límite, y **Copiar toda la réplica**).

### Del artículo a la charla, el póster y el hilo

[Del artículo a la charla, el póster y el hilo](/apps/t/paper-to-talk) crea con lo que presentas tu artículo: diapositivas con sus figuras y ecuaciones reales, cronometradas y con lo que hay que decir; un póster A0; publicaciones para X, Bluesky y LinkedIn; y una página del proyecto.

- **Tu artículo** (lo mejor es la carpeta de su proyecto LaTeX, por sus figuras; si viene de arXiv, se descarga su código fuente para obtenerlas), **La duración de la charla, en minutos** (15 si no lo cambias), **Público** (**Investigadores del campo**, **Investigadores de otros campos** o **Público general**), lo que se va a crear (**Diapositivas**, **Un póster A0**, **Un hilo (X, Bluesky, LinkedIn)** y **Una página del proyecto**) y **Proyecto** (el proyecto tuyo en el que se guarda lo que crea).

Un artículo que no se puede leer detiene la ejecución del mismo modo, indicando cómo darlo de otra manera. Planifica la charla (aproximadamente una diapositiva por minuto, una idea cada una, del problema a la conclusión), un programa reparte los minutos para que sumen la duración, y luego crea en paralelo lo que pediste: las diapositivas, que editas y presentas desde los archivos del proyecto ([Diapositivas](/guide/library#slides)), el póster como documento LaTeX ([Documentos LaTeX](/guide/library#latex-documents)), las publicaciones y la página del proyecto, lista para que la publiques ([Publicar una página](/guide/library#publish-a-page)).

Su vista tiene **Lo que se creó** (el mensaje de la charla y una frase de apertura, luego cada cosa creada, con **Abrir**), **La charla** (la charla como una sola tira, cada diapositiva tan ancha como sus minutos, y luego cada diapositiva: sus minutos, título, puntos, figura, ecuación y lo que hay que decir) e **Hilo** (**X**, **Bluesky** y **LinkedIn** muestran las publicaciones de cada uno, numeradas, cada una con **Copiar**, y **Copiar el hilo**; la única publicación de LinkedIn tiene **Copiar la publicación**).

### Médico de figuras

[El Médico de figuras](/apps/t/figure-doctor) deja los gráficos de tu artículo listos para imprimir: tan anchos como la columna, con la tipografía del artículo, en colores que los lectores daltónicos distingan, guardados como PDF vectoriales con sus fuentes incrustadas, todo con un solo archivo de estilo.

- **Tu código de gráficos** (un script, un cuaderno o una carpeta con ellos en esta computadora, hechos con matplotlib o seaborn), **La plantilla de la sede** (ella, **O el ancho en pulgadas** y **La tipografía del artículo** parten de tus últimas respuestas; **ACL, EMNLP, NAACL**, **ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)**, **IEEE**, **ICML**, **NeurIPS, ICLR**, **Springer LNCS** u **Otro (indica el ancho)**), **Ancho** (**Una columna** o **Ambas columnas**), **O el ancho en pulgadas** (para otra plantilla) y **La tipografía del artículo** (**Como la plantilla**, **Times New Roman**, **Computer Modern**, **Linux Libertine** o **Helvetica**).

Un programa determina el estilo (el ancho en pulgadas, la tipografía y sus tamaños, una paleta para lectores daltónicos), y un agente modifica tus scripts donde están, tras copiar cada uno a su lado (name.orig.py) y conservar una imagen de cada figura tal como era. Después cada script usa un único archivo de estilo, `paper.mplstyle`, a su lado; cada figura se guarda como PDF vectorial y se comprueban sus fuentes: todas incrustadas, ninguna de tipo 3, que muchas sedes rechazan. Ejecuta tus scripts, así que necesita lo que ellos necesitan en esta computadora (Python, matplotlib y sus datos).

Su vista tiene **Antes y después** (el tamaño, la tipografía y los colores que usó, luego cada figura como era y como es ahora, con **Abrir el PDF** y lo que cambió), **Archivo de estilo** (`paper.mplstyle`, con **Copiarlo** y cómo usarlo) y **Qué cambió** (cada cambio, y lo que encontró la comprobación de fuentes).

Los agentes de tus sesiones también conocen estos oficios, gracias a habilidades que vienen con Hydor (**peer-review**, **reproduce-paper** y **figures-for-papers**: consulta [Habilidades](/guide/skills)): pídele a uno que revise un artículo contigo, que responda a un revisor o que arregle una sola figura, y funciona del mismo modo.

## Ejecuta el trabajo de tu laboratorio

Tres apps listas para usar, en **Laboratorio** dentro de la página de [Apps](/apps), ayudan con el trabajo diario de un laboratorio: etiquetar datos y comprobar un modelo con tus etiquetas, probar una idea en tu propio código desde las hipótesis hasta un informe, y optimizar los ajustes de un modelo. El sprint y el barrido ejecutan sus trabajos en [Experimentos](/guide/experiments), así que necesitan que tenga una computadora (o un clúster) con GPU.

### Banco de anotación

**Banco de anotación** hace que tú y un modelo etiqueten la misma muestra de textos, para que veas dónde no coinciden y hasta qué punto se puede confiar en el modelo con el resto. Ábrelo desde **Apps** y rellena:

- **Las etiquetas**, separadas por comas: hasta nueve, una para cada tecla del 1 al 9. **Cómo etiquetar**: tus pautas, con tus propias palabras; el modelo etiqueta con ellas también.
- Los textos: **un archivo CSV o JSON lines**, **un conjunto de datos de Hugging Face** por su nombre (como stanfordnlp/imdb) o su dirección, con **Su división** cuando tiene varias (y su configuración antes de una barra, como plain_text/test), o textos pegados, uno por línea. **La columna con el texto** se encuentra sola (una llamada text, review o sentence; si no, la que tenga los textos más largos): indícala cuando la elección sea errónea.
- **Cuántos etiquetar**: se toman al azar, 100 si no lo cambias, como máximo 1.000.

Lee los textos (un conjunto de datos, a través del servidor de datasets de Hugging Face, unas cuantas páginas de filas de lugares al azar), toma la muestra en orden aleatorio y hace que el modelo auxiliar los etiquete de veinte en veinte, cada uno con una breve razón. La página de la ejecución es entonces donde trabajas:

- **Etiquetado**: un texto cada vez, con un botón grande para cada etiqueta. Pulsa uno, o su tecla (**1** a **9**): solo entonces aparece la etiqueta del modelo, en una línea sobre el texto siguiente (con su razón cuando no coincidís), de modo que nunca te influye. **Omitir por ahora** (**S**) manda un texto al final, **Cambio** (**Z**) deshace el último, y una nota (**N** para empezar una) se queda con su texto. La barra muestra cuánto llevas.
- **Desacuerdos**: cada texto que tú y el modelo etiquetasteis de forma distinta, con tu etiqueta y tus notas junto a la etiqueta y la razón del modelo. **Etiquetarlo de nuevo** lo devuelve a **Etiquetado**.
- **Acuerdo**: con qué frecuencia diste la misma etiqueta, el κ de Cohen (ese acuerdo más allá de lo que daría el azar por sí solo: 1 es perfecto, 0 no mejor que el azar, por encima de 0,6 sustancial) y lo que daría el azar por sí solo, y la matriz de confusión: tus etiquetas en vertical, las del modelo en horizontal.
- **Exportar**: **CSV** o **Líneas JSON** descarga los textos que etiquetaste, cada uno con tu etiqueta, la del modelo y su razón, y tus notas. **Publicar en Hugging Face** crea allí un conjunto de datos propio (privado a menos que elijas **Todos**), con los datos y una ficha que explica cómo se etiquetó, con tus pautas y cuánto coincidisteis tú y el modelo. Necesita un token de Hugging Face con permiso de escritura: la app funciona sin él en lo demás, así que la primera vez que publicas te lo avisa; añádelo bajo el formulario de la app (**Token de Hugging Face**, marcado como opcional) o en **Apps → Apps conectadas → Claves** como HF_TOKEN. **Quitar sus textos** elimina los textos y las etiquetas de un conjunto.

Cada conjunto es una ejecución propia y guarda sus textos y tus etiquetas como registros de la app: la página de la app muestra tus conjuntos entre sus últimas ejecuciones, y cada uno se abre donde lo dejaste.

### Sprint de investigación

**Sprint de investigación** lleva una pregunta de investigación a través de un sprint corto sobre tu propio código, y tú apruebas cada paso. Rellena **Tu pregunta de investigación**, **El repositorio** (un repositorio de Git en esta computadora; empieza por el último que diste), **Lo que debería saber** (la métrica que importa, la línea base y sus números, cómo entrenar y evaluar, qué no cambiar), **Horas de GPU que puede usar** (8 si no lo cambias, para todas sus ejecuciones juntas) y **Cuántas hipótesis** (de una a cinco). Lo que guardas en Sobre ti como **En qué puedes ejecutar cosas** llega al modelo que propone las hipótesis y al agente que planifica las ejecuciones, para que se ajusten a tu máquina. Después:

1. El modelo auxiliar propone hipótesis a partir de tu pregunta y del README del repositorio, cada una con lo que la apoyaría y lo que iría en su contra, y el experimento que la pone a prueba.
2. Con **Quiero aprobar cada paso** marcado (lo está a menos que lo desmarques), la ejecución te espera: consérvalas, o escribe las que quieras probar en su lugar, una por línea. La pregunta aparece en la página de la ejecución, en tu bandeja de entrada y como aviso.
3. Un agente crea un worktree del repositorio en una rama nueva (sprint/…), junto a tu copia de trabajo, que nunca modifica. Allí escribe el plan (SPRINT.md) y el código que necesitan las ejecuciones, hace commit de todo y enumera las ejecuciones: una línea base y una por cada hipótesis, con semillas. Las que superarían tus horas de GPU se dejan fuera, y se nombran.
4. Vuelve a esperarte, antes de gastar nada de tiempo de GPU: inicia las ejecuciones, o di que no, y el sprint se detiene ahí (el plan y el código se quedan en la rama).
5. Experimentos las ejecuta, etiquetadas con el sprint, y el sprint espera a que terminen todas.
6. Una tabla de resultados compara cada condición con la línea base, con su significación; un agente analiza las ejecuciones en un cuaderno de Jupyter, guardado en los archivos del proyecto, decide cada hipótesis (apoyada, no apoyada o poco clara, con su evidencia) y escribe un informe breve.

Su vista tiene **El sprint** (la pregunta, cómo fue, su rama, y cada hipótesis con su veredicto y su evidencia), **Ejecuciones** (la tabla de resultados, y cada ejecución con su métrica) e **Informe** (para leer y copiar, con **Abrir el cuaderno** y qué probar a continuación). Si se ejecuta desde la API o una programación, no hay nadie para aprobar, así que pasa directo hasta el final.

### Planificador de barridos

**Planificador de barridos** planifica un barrido de hiperparámetros de un script de entrenamiento dentro de un presupuesto, lo inicia, detiene antes de tiempo las pruebas malas y redacta lo que importó. Rellena **El script o comando**, **Su carpeta** (empieza por la última que diste; lo que guardas en Sobre ti como **En qué puedes ejecutar cosas** llega al agente que planifica el barrido), **La métrica** (tal como el script la imprime o la escribe: líneas metric=valor, o JSON) y **Qué dirección es mejor**, **Ajustes que optimizar** (uno por línea, con los valores a probar, como lr: 1e-4, 3e-4, 1e-3; déjalo vacío para que se deduzcan del script), el **Presupuesto** (ejecuciones u horas de GPU: “20 ejecuciones”, “10 horas de GPU”) y **Detener antes de tiempo las pruebas malas**.

- Un agente lee el script, sin ejecutarlo ni modificarlo: sus argumentos, cuánto dura una ejecución y cuándo se nota una mala ejecución. Propone los ajustes y los valores a probar (los tuyos, si los diste), y un programa los adapta al presupuesto: todas las combinaciones cuando caben, y si no, tantas muestras aleatorias como permita.
- Con **Quiero revisar el plan primero**, la ejecución te espera: inicia tal cual, o escribe cambios, un ajuste por línea (lr: 3e-4, 1e-3 para otros valores, drop dropout para dejar uno fuera).
- Experimentos ejecuta el barrido como un solo experimento; con **Detener antes de tiempo las pruebas malas**, una ejecución claramente peor que la mejor hasta el momento se detiene, para ahorrar su tiempo de GPU.
- Cuando las ejecuciones terminan, un programa encuentra la mejor ejecución y cuánto importó cada ajuste (la parte de la dispersión de la métrica entre ejecuciones que explican sus valores), y el modelo auxiliar dice qué significa eso y qué probar a continuación.

Su vista tiene **Resultados** (los ajustes y la métrica de la mejor ejecución, lo que encontró, qué probar a continuación, y una barra con el peso de cada ajuste), **Por configuración** (la métrica de cada valor de un ajuste, como cajas) y **Todas las ejecuciones**.

## Informes: tu semana y tu cuaderno de laboratorio

Dos apps listas para usar, en **Trabajo** dentro de la página de [Apps](/apps), redactan lo que hiciste a partir de lo que Hydor sabe de tu trabajo: tus sesiones (las de aquí, y las sesiones de Claude Code y Codex en VS Code o en una terminal que Hydor lee), tus commits en los repositorios de Git en los que trabajaron, tus ejecuciones de Experimentos, lo que creaste o guardaste y los artículos que marcaste como leídos en tu lista de lectura. Las sesiones con la memoria desactivada y las sesiones confidenciales quedan fuera, y también el trabajo de las sesiones que los agentes inician para partes de una tarea (cuenta como el de su sesión principal). Ambas se abren en una página propia y pueden actualizarse solas.

### Informe semanal de avances

**Informe semanal de avances** convierte tu semana en una actualización para tu director, tu equipo o un jefe: lo que se hizo, resultados con sus números, problemas y lo que te bloquea, el plan de la semana siguiente y preguntas que hacer. Se abre en su propia página con el informe de esta semana (los siete días hasta el día en que se escribe): su título y resumen, la semana en números, y luego **Hecho esta semana**, **Resultados**, **Problemas y bloqueos**, **Semana siguiente** y **Preguntas**.

- **Copiar como Markdown** y **Copiar como correo** (una línea de asunto, y luego una nota breve que empieza y termina como lo harías tú) lo ponen en tu portapapeles; **Guardar como documento** lo conserva como documento, para modificarlo y exportarlo como Word o PDF.
- **Actualizar** escribe ahora el informe de esta semana. **Antes**, debajo, enumera las semanas anteriores, a un clic cada una.
- **Configuración**, los controles deslizantes de arriba: **Actualizar automáticamente** (desactivado hasta que lo actives) escribe uno nuevo cada viernes a las 16:00; bajo el interruptor, elige otros días (**Todos los días**, **Los días laborables**, **Una vez a la semana el** día) y la hora. Es una [tarea programada](/guide/tasks), así que [Configuración → Tareas programadas](/settings?s=tasks) también la enumera. Debajo: **Para quién es** (tu director, tu equipo o un jefe: escribe para ellos), **Proyectos** (todos, o algunos, por nombre) y **Qué incluir** (“solo investigación, sin costos”).

### Cuaderno de laboratorio

**Cuaderno de laboratorio** guarda una entrada con fecha por cada día que trabajaste: lo que se probó, lo que se encontró y se decidió, y lo que sigue abierto, con enlaces a las sesiones, commits, ejecuciones, archivos y elementos guardados de ese día. Sus entradas son registros propios de la app, aparte de la [memoria](/guide/memory). Se abre en su propia página con ellas, de la más reciente a la más antigua:

- **Buscar en el cuaderno** encuentra entradas por sus palabras y por su significado (cuando la [Búsqueda por significado](/settings?s=memory&find=Search%20by%20meaning) está activada), las mejores primero; **Todas las entradas** las devuelve todas.
- **Copiar su enlace**, bajo cada entrada, copia la dirección de su propia página, que muestra la entrada tal como se escribió: para citarla en un artículo, un informe o una nota.
- **Actualizar** escribe ahora la entrada de hoy, y **Escribir un día anterior** un día que te saltaste. Un día escrito de nuevo ocupa el lugar de su entrada; un día en que no hiciste nada no tiene ninguna.
- **Configuración**: **Actualizar automáticamente** (desactivado hasta que lo actives) escribe la entrada del día cada tarde a las 21:00, en los días y a la hora que elijas; **Proyectos** la limita a algunos proyectos.
- **Tu idioma**: las entradas son tus propias notas, así que se escriben en el idioma en que usas Hydor. El informe semanal no: va a tu director o a tu equipo, y se queda en el idioma de tu trabajo.

## Pregúntale a un agente

- “Configura Paper radar para seguir cs.IR y cs.CL, con recuperación densa y predicción del rendimiento de consultas como temas, y haz que se actualice todos los días a las 7:30.”
- “¿Qué encontró Paper radar para mí hoy? ¿Qué artículos tienen relación con mi proyecto de Hydor?”
- “Activa Citation alerts para mis artículos (publico como Gerard Salton) y dime quién ha citado últimamente “A vector space model for automatic indexing”.”
- “Añade SIGIR, ACL y EMNLP a Deadline radar y recuérdame 21, 7 y 2 días antes de cada fecha límite.”
- “Vigila Hugging Face por si aparecen rerankers nuevos de menos de 1.000 millones de parámetros con licencia Apache o MIT, y ejecuta mi evaluación con cada uno: python eval.py --model {model} en ~/rerank-eval, ndcg@10, mi mejor resultado es 0,512.”
- “Empieza un related work vivo sobre recuperación dispersa aprendida, con SPLADE y ColBERT como punto de partida, y redacta su sección de trabajos relacionados.”
- “Busca lagunas entre mis artículos y los trabajos de este mes sobre búsqueda conversacional; tengo una GPU de 24 GB.”
- “Añade 2104.08663 y el artículo de ColBERT a mi lista de lectura, en el proyecto Dense retrieval.”
- “Importa ~/papers/refs.bib a mi lista de lectura, con la etiqueta survey.”
- “Sincroniza mi lista de lectura con Zotero.”
- “¿Qué artículos de mi lista de lectura me faltan por leer para el proyecto Dense retrieval?”
- “Haz una matriz de literatura con los artículos etiquetados como dense en mi lista de lectura, con una columna que indique si su código está publicado.”
- “Reproduce la Tabla 2 del artículo de BEIR, BM25 en SciFact, en una hora como máximo y sin GPU.”
- “Abre Reproduce a paper con los datos de 2104.08663 ya rellenados, pero no lo ejecutes todavía.”
- “Revisa mi borrador en ~/papers/draft como lo harían tres revisores de SIGIR y dime qué podría hundirlo.”
- “Aquí están mis reseñas de ARR: redacta una respuesta (rebuttal) de máximo 2.500 caracteres por revisor.”
- “Haz una charla de 12 minutos, un póster A0 y un hilo a partir de mi artículo en ~/papers/colbert, en el proyecto ColBERT.”
- “Arregla los gráficos de ~/papers/colbert/plots para un artículo de ACL, de una columna de ancho y en Times.”
- “Revisa mi artículo para ACL antes de enviarlo y corrige lo que se pueda de forma segura.”
- “¿Son reales todas las referencias de mi artículo en LaTeX, con los autores y años correctos? Corrige las que no lo sean.”
- “Fusiona las entradas duplicadas de la bibliografía de mi artículo y completa lo que sepan sus DOI.”
- “¿Se ha publicado desde entonces algún preprint citado en mi artículo? Cita las versiones publicadas.”
- “Haz anónimo mi artículo de NeurIPS para la revisión: nombres, enlaces, agradecimientos y los campos propios del PDF.”
- “¿Cumple mi artículo el límite de páginas de EMNLP? Si se pasa, condénsalo hasta que quepa.”
- “¿Siguen coincidiendo los números de mis tablas de resultados con mis ejecuciones?”
- “Mi artículo de SIGIR fue aceptado: prepáralo para la versión final (camera-ready).”
- “Pasa mi artículo a la plantilla de ICLR, como versión para revisión.”
- “Carga 200 textos de la parte de sentimiento de tweet_eval en Hugging Face en Annotation workbench, con las etiquetas positivo, negativo y neutro y estas pautas: …”
- “¿Qué tan bien coincido con el modelo en mi último conjunto de anotaciones? ¿Qué etiquetas confundimos más?”
- “Haz un sprint de investigación para ver si un currículo de consultas de cortas a largas ayuda al recuperador de ~/code/retriever, con 6 horas de GPU.”
- “Planifica un barrido de la tasa de aprendizaje y el tamaño de lote de ~/code/model/train.py en un máximo de 10 horas de GPU; cuanto menor sea val_loss, mejor.”
- “Activa mi informe semanal de progreso: para mi director de tesis, los viernes a las 15:00, solo del proyecto Retriever.”
- “¿Qué decidí la semana pasada sobre los negativos difíciles? Búscalo en mi cuaderno de laboratorio.”
- “Escribe la entrada de mi cuaderno de laboratorio del martes pasado.”
