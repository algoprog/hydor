# Habilidades

Las habilidades son métodos escritos que los agentes cargan cuando una tarea lo requiere: cómo investigar una pregunta, localizar un error, planificar un proyecto, crear un documento de Word o ordenar todo después de una tarea. Todas las habilidades que pueden usar los agentes están en una sola página, [Configuración → Agentes → Habilidades](/settings?s=skills): las que vienen con la app, las tuyas, las que traen tus plugins, las propias de Claude Code y de Codex, y las de tus proyectos. Sus interruptores valen para todas las sesiones; un proyecto puede activar o desactivar cualquier habilidad al revés para sus propias sesiones. Este tema las explica todas, además de las habilidades que los agentes aprenden con tu aprobación y las palabras clave que activan una habilidad para Custom.

![Configuración → Agentes → Habilidades: todas las habilidades que pueden usar los agentes, agrupadas según su finalidad](images/skills.webp)

## Qué es una habilidad

Una habilidad es una guía breve que un agente sigue para un tipo de trabajo. Cada una es una carpeta con un archivo llamado SKILL.md: un nombre, una línea sobre cuándo usarla, y después los pasos, las comprobaciones y los errores que hay que evitar. Algunas habilidades también traen archivos propios: ejemplos, plantillas o pequeños scripts que usan los pasos.

Los agentes no leen todas las habilidades todo el tiempo. Al empezar una sesión, un agente ve solo el nombre de cada habilidad y su línea de "cuándo usarla". Cuando una tarea encaja con alguna, la carga y la sigue. Un saludo, una pregunta rápida o un cambio pequeño y claro no necesitan ninguna.

## De dónde vienen las habilidades

La página Habilidades muestra habilidades de cinco orígenes, cada uno indicado en su fila:

- **Integrado**: las habilidades que vienen con la app (más de sesenta). Se actualizan con la app.
- **Tuyos**: habilidades que escribiste en esta página, que aprobaste cuando un agente te las sugirió, que copiaste de otros agentes de esta computadora (consulta [Trae contenido de otros asistentes](/guide/memory#bring-in-from-other-assistants)), o que pusiste tú mismo en tu carpeta de habilidades.
- **De plugins**: las habilidades de los [plugins](/guide/plugins) que activaste. Van y vienen con su plugin.
- **Claude Code y Codex**: las habilidades propias de esos agentes, en sus propias carpetas. Solo las recibe ese agente.
- **En proyectos**: las habilidades propias de un proyecto, que solo reciben sus sesiones. Las cambias en la pestaña **Habilidades** del proyecto: consulta [Dale a un proyecto habilidades propias](/guide/projects#give-a-project-skills-of-its-own).

Las tres primeras forman la biblioteca de habilidades, que reciben todos los agentes que inicia la app. Un agente también puede nombrar habilidades que prefiere: cuando una de ellas encaja con la tarea, la carga antes de empezar. Consulta [Agentes](/guide/agents).

## Qué agentes reciben qué habilidades

Cada sesión que inicia la app recibe la biblioteca de habilidades:

- **Claude Code** la recibe como un plugin llamado "hydor", así que sus habilidades aparecen con ese nombre delante: hydor:research, hydor:writing, etc.
- **Codex** la recibe como una carpeta adicional de habilidades.
- **Custom**, el agente propio de la app, recibe sus habilidades por nombre, en grupos, y también puede buscar una según el tipo de trabajo. Consulta [Custom](/guide/custom).
- **Otros agentes** (Gemini CLI, OpenCode y los demás) reciben la lista de habilidades, cada una con el archivo que deben leer cuando una encaja.

Las sesiones iniciadas fuera de la app, en una terminal o en VS Code, no ven la biblioteca. No se escribe nada de ella en la configuración de tu Claude Code ni de tu Codex.

Una sesión en un proyecto recibe las habilidades propias del proyecto junto con las de la biblioteca, cada una según cómo la configure el proyecto (consulta [Activa o desactiva una habilidad para este proyecto](/guide/projects#turn-a-skill-on-or-off-for-this-project)). Una habilidad del proyecto con el mismo nombre que una de la biblioteca ocupa su lugar en las sesiones de ese proyecto.

Tus propias habilidades tienen prioridad sobre las integradas: una tuya con el nombre de una habilidad integrada ocupa su lugar. Una habilidad de un plugin con un nombre que la biblioteca ya tiene se deja fuera, y la página de su plugin indica qué habilidad reciben los agentes en su lugar.

Custom lee habilidades de varias carpetas, en este orden: las habilidades propias del proyecto (en sus carpetas `.claude/skills` y `.agents/skills`), las propias de Claude Code y de Codex en tu carpeta personal, y después la biblioteca. Cuando dos habilidades comparten nombre, gana la primera que se encuentra. Así, una habilidad que escribas para Claude Code o para Codex llega también a Custom. Custom admite hasta 200 habilidades, de las cuales como máximo 40 son del proyecto y tuyas; sus instrucciones las nombran por grupo (las propias del proyecto, las tuyas y luego los grupos de la biblioteca, como Programación o Documentos) en lugar de listar cada una.

## Ve cuándo un agente usa una habilidad

Cuando un agente carga una habilidad, aparece una pequeña etiqueta en la conversación: **Usando habilidad research**, con un indicador de carga mientras el agente la lee. Esto funciona igual para Claude Code, Codex y Custom.

Haz clic en la etiqueta para leer la habilidad: qué dice, cuándo se aplica y su historial. Si la habilidad no forma parte de la biblioteca de la app, la ventana lo indica: viene de la carpeta de habilidades propia del agente, o de la del proyecto. En un proyecto, la etiqueta abre la habilidad propia del proyecto cuando es la que usó el agente: la insignia de la ventana muestra el nombre del proyecto, y **Las habilidades del proyecto** abre su pestaña Habilidades.

Cuando tus propias palabras activaron una habilidad en una sesión de Custom, la etiqueta indica cuáles: "activada por “research” en tu mensaje". Consulta [Activa habilidades por palabras clave](#bring-skills-in-by-keywords).

Cada vez que un agente carga una habilidad cuenta como un uso. La fila de una habilidad de la biblioteca muestra cuántas veces se usó y cuándo fue la última.

## Abre la página Habilidades

Ve a **Configuración → Agentes → Habilidades** ([ábrela](/settings?s=skills)). En un teléfono, abre Configuración y luego toca **Habilidades** en Agentes.

De arriba abajo, la página tiene:

- junto al título de la página, **Nueva habilidad** y el menú **⋯**: **Sugerir habilidades que encajen**, **Activar habilidades por palabras clave**, **Tu carpeta de habilidades** (la abre en Archivos), **Consigue más con plugins** (abre [Configuración → Plugins](/settings?s=plugins)) y **Cómo reciben habilidades los agentes**;
- un grupo con las habilidades que sugirieron los agentes, cuando las hay (consulta [Aprueba, edita o descarta una habilidad propuesta](#approve-edit-or-dismiss-a-proposed-skill)); su (i) indica que no se guarda nada hasta que lo apruebes;
- un cuadro de búsqueda y una fila de filtros: **Todos**, **Integrado**, **Tuyos**, **De plugins**, **Claude Code y Codex** y **En proyectos**. Solo aparecen los que tienen habilidades;
- las habilidades, en grupos según su finalidad (el título de cada grupo indica cuántas contiene, y un grupo largo muestra las primeras ocho con **Mostrar todo**): **Formas de trabajar**, **Escritura**, **Documentos**, **Investigación y web**, **Planificación y decisiones**, **Datos y números**, **Diseño e imágenes**, **Programación**, **Modelos de IA** y **Esta app**; después **Las propias de Claude Code**, **Las propias de Codex** y un grupo por cada proyecto con habilidades propias;
- al final, tus habilidades que quitaste, para recuperarlas.

Cada habilidad es una fila: su nombre (haz clic para abrirla), para qué sirve en una línea, su interruptor y una (i) que indica de dónde viene y cuántas veces se usó. Las habilidades propias de Claude Code y de Codex se listan tal como las tiene cada carpeta: las tuyas y las que vienen con los agentes. Las de la carpeta de un proyecto (en su `.claude/skills`) están en la pestaña **Habilidades** de ese proyecto.

## Encuentra una habilidad

Escribe en el cuadro de búsqueda: busca en los nombres de las habilidades, en para qué sirven y en el nombre de su plugin o proyecto. Pulsa Esc, o la cruz, para borrarlo. Elige un filtro para ver solo habilidades de un tipo.

También puedes encontrar una habilidad desde el cuadro de búsqueda de la app (Ctrl+K, ⌘K en Mac): escribe su nombre o para qué sirve. Las habilidades aparecen en **Habilidades**, y al elegir una se abre esta página en ella.

## Activa o desactiva una habilidad

Cada habilidad de la biblioteca y de Claude Code y Codex tiene un interruptor al final de su fila. Una habilidad desactivada se queda donde está, pero los agentes ya no la reciben; su nombre se ve en gris y una insignia dice **Desactivado**. Vuelve a activarla con el mismo interruptor. También puedes cambiarlo en su ventana.

- Una habilidad de la biblioteca (integrada, tuya o de un plugin) que desactivas se deja fuera para todos los agentes, en todos los proyectos que no la activen por su cuenta.
- Claude Code guarda su propia elección en su configuración, por el nombre de la habilidad; Codex la guarda en su propia configuración.

Los interruptores de aquí valen para todas las sesiones. Un proyecto puede activar o desactivar cualquier habilidad al revés para sus propias sesiones, en su pestaña **Habilidades**: consulta [Activa o desactiva una habilidad para este proyecto](/guide/projects#turn-a-skill-on-or-off-for-this-project). Entonces la fila de la habilidad aquí lo indica: "Desactivada en Tesis" o "Activada en 2 proyectos".

Las habilidades propias de un proyecto no tienen interruptor aquí: cámbialas en la pestaña **Habilidades** del proyecto.

## Lee una habilidad y su historial

Haz clic en el nombre de una habilidad, o en una etiqueta **Usando habilidad** en una conversación. Se abre una ventana con:

- de dónde viene, su grupo y cuántas veces la usaron los agentes;
- su interruptor: **Los agentes la reciben** o **Desactivada: los agentes no la reciben**;
- los proyectos que la activan o desactivan al revés para sus sesiones, cada uno con **Activado** o **Desactivado**: haz clic en uno para abrir su pestaña Habilidades;
- cuándo usarla y sus palabras clave, si las tiene ("Custom la activa cuando dices" y las palabras);
- las instrucciones, tal como las leen los agentes;
- **Historial**, cuando tiene cambios: cada cambio, del más reciente al más antiguo, **Guardado**, **Cambiada**, **Quitado** o **Recuperada**, hace cuánto tiempo y cuántas líneas se añadieron y quitaron. Haz clic en un cambio para verlo línea por línea;
- al final, dónde está su archivo: haz clic para mostrarlo en Archivos; en la app de escritorio, un botón junto a él (**Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**) lo muestra en el administrador de archivos del sistema.

Los botones del final dependen de la habilidad:

- Integrada: **Crear mi propia versión** (consulta [Cambia una habilidad integrada](#change-a-built-in-skill)).
- Tuya: **Cambio** y **Quitar**.
- De un plugin: **Su plugin** (abre el plugin) y **Crear mi propia versión**.
- De Claude Code o de Codex: **Cambio** (o **Abrir**, para las habilidades que no puedes eliminar), que abre su SKILL.md en un editor, y **Eliminar**.
- De un proyecto: **Las habilidades del proyecto**.

En un teléfono la ventana se abre como una hoja desde la parte inferior de la pantalla. **Cerrar** la cierra.

## Las habilidades integradas

La app incluye estas habilidades, en los grupos en que las muestra la página. Abre cualquiera para leerla completa.

**Formas de trabajar**

- **clarify-first**: para una petición grande o abierta (un sitio web, un viaje, una reforma, una charla, un plan de negocio). Primero el agente lee lo que ya existe, hace una pregunta a la vez y explica por qué, repite lo que entendió, ofrece dos o tres maneras de hacerlo y escribe un resumen breve para que lo apruebes antes de construir nada.
- **clean-up**: al final de una tarea. El agente enumera lo que fue creando por el camino, elimina lo que ya no hace falta (archivos temporales, datos de prueba, carpetas temporales, ramas fusionadas o abandonadas, worktrees, procesos que él mismo inició), nunca elimina lo que no creó, pregunta antes de tocar algo grande o compartido, y dice en una línea qué eliminó y qué dejó. Mientras **Limpiar después de una tarea** esté activado en [Configuración → Tus agentes](/settings?s=assistants&find=Clean%20up%20after%20a%20task) (lo está, salvo que lo desactives), a todos los agentes se les indica que lo hagan al final de una tarea.
- **decisions-log**: para trabajo sin que estés presente (un objetivo, una tarea programada, “no me esperes”). El agente resuelve por su cuenta las dudas normales, anota cada decisión con el motivo y lo que costaría si fuera un error, y sigue adelante. Solo se detiene antes de pasos que no se pueden deshacer (enviar, pagar, eliminar, publicar), de cualquier cosa que toque contraseñas o accesos, o de lo que quede fuera del trabajo; su mensaje final enumera todas las decisiones que tomó.
- **evidence-before-done**: antes de que el agente diga que algo está hecho, corregido, guardado, enviado o que es verdad. Nombra la comprobación que lo demostraría, la ejecuta, lee el resultado e informa de la afirmación junto con su evidencia, o dice con claridad qué no pudo comprobar.
- **troubleshooting**: para cualquier cosa que no funciona como debería (un error, un dispositivo, una red doméstica, una fórmula, una receta). El agente provoca el problema a propósito, reúne datos, prueba una idea a la vez, corrige la causa y demuestra que quedó resuelto.

**Escritura**

- **writing**: para cualquier cosa que otras personas vayan a leer (un informe, un artículo, una carta, un discurso). El agente define quién lo lee y para qué, hace un esquema antes de redactar y edita en pasadas separadas.
- **summaries**: para un resumen, una respuesta o una reflexión de unas pocas frases, como un artículo resumido para una clase. El agente se ciñe a la extensión pedida, dice qué muestra la fuente y por qué, y la relaciona con el curso a través de un caso de la propia fuente en lugar de con definiciones.
- **creative-writing**: cuentos, novelas, memorias, poemas y guiones: encontrar la historia, planificar, redactar sin atascarse, salir de los bloqueos, revisar en orden, recibir comentarios y publicar (cartas de presentación a editoriales, sinopsis, agentes literarios, autopublicación y las trampas que hay que evitar), siempre conservando la voz propia del autor.
- **email**: ordena una bandeja de entrada (qué necesita respuesta, qué puede esperar, qué archivar) y escribe los correos que requieren cuidado: respuestas, recordatorios, disculpas, rechazos o negativas, con la extensión y el tono adecuados.
- **plain-language**: reescribe un texto existente para que se lea con claridad y de forma humana, sin jerga, relleno ni frases rígidas que suenen a IA, con el nivel de lectura adecuado y conservando lo que dice.
- **translation**: traduce documentos, mensajes, páginas, textos de apps y subtítulos con fidelidad y naturalidad, con un glosario de términos y nombres, números y fechas según el lugar al que se dirige, y una revisión del resultado.
- **social-media**: planifica y escribe publicaciones para cada plataforma (LinkedIn, X, Instagram, Mastodon, Bluesky…), adapta un mismo mensaje a varias y mantiene un calendario de contenidos.
- **seo**: lograr que un sitio web, una tienda o un blog se encuentren en los buscadores y en las respuestas de IA: una revisión de sus páginas, títulos y descripciones, indexación, datos estructurados y rastreadores de IA, y una medición honesta, sin prometer posiciones.
- **release-notes**: escribe notas de versión y entradas de registro de cambios a partir de commits y pull requests, pensadas para quienes las leen, y elige el número de la próxima versión.

**Documentos**

- **pdf**: crea PDF (informes, facturas, certificados, folletos, formularios), los une, los divide, los gira, los rellena o les pone sellos, convierte archivos de Office en PDF y lee PDF, incluidas las páginas escaneadas.
- **presentations**: crea o modifica diapositivas (.pptx) con un mismo aspecto en todas, gráficos, tablas y notas del orador, las revisa como imágenes antes de entregarlas y lee archivos .pptx, .ppt y .odp.
- **spreadsheets**: crea o modifica libros de cálculo (.xlsx) con fórmulas, formatos de número y gráficos, revisa las fórmulas en busca de errores y lee archivos .xlsx, .xls, .ods y .csv.
- **word-documents**: crea o modifica documentos de Word (.docx) con títulos, listas y tablas de verdad, revisa las páginas antes de entregarlas y lee archivos .docx, .doc y .odt.

**Investigación y web**

- **research**: planifica las búsquedas que necesita una pregunta, busca primero de forma amplia y luego más acotada (artículos, patentes, noticias, documentos oficiales), contrasta cada afirmación clave con dos fuentes independientes o con una fuente primaria, y responde con citas, indicando lo que no pudo confirmar.
- **spin-check**: si un anuncio, una publicación viral, una propuesta comercial o una afirmación es verdadera, engañosa o una estafa: afirmación por afirmación, cada una contrastada con la fuente que puede resolverla, con los trucos de persuasión señalados y un veredicto para cada una.
- **papers**: trabaja a fondo con artículos académicos: quién cita uno, un texto completo legal, lectura y resumen, una tabla que compara estudios, valoración de la calidad de un estudio y cómo citarlo correctamente.
- **peer-review**: revisa un artículo (tu borrador antes de enviarlo, o uno que te pidieron revisar) en el formulario y con las puntuaciones propios de la conferencia o revista, comprobando una por una las debilidades que hunden los artículos, y responde a las revisiones: una refutación o una respuesta a los revisores, punto por punto dentro del límite, sin prometer nunca resultados que no tiene.
- **reproduce-paper**: reproduce los resultados de un artículo: la cifra exacta que hay que igualar, su código y su configuración, un entorno limpio, los datos y los checkpoints, una ejecución pequeña antes de la real (las largas, en [Experimentos](/guide/experiments)), las cifras comparadas en igualdad de condiciones y cada cambio anotado en un informe.
- **break-the-result**: comprueba un resultado antes de darlo por bueno, como una mejora respecto a una línea base. El agente enuncia la afirmación con exactitud, enumera qué más podría explicarla (semillas afortunadas, una comparación desigual, una filtración de datos, un error en la métrica, una mejora en solo unos pocos ejemplos), ejecuta controles en Experimentos, no repara nada y dice si se sostiene, se sostiene en parte o no se sostiene. **Intentar refutarlo**, donde comparas ejecuciones en Experimentos, la pone en marcha.
- **lean-proofs**: demuestra con el verificador de demostraciones Lean (consulta [Demostraciones: verificarlas con Lean](/guide/researchers#proofs-checking-them-with-lean)). Primero el enunciado se escribe en Lean, se prueba con valores pequeños cuando es posible, se te explica en matemáticas corrientes con cada diferencia respecto a lo que pediste y se acuerda contigo antes de demostrar nada (cuando ya dijiste cómo debe ser, el agente lo compara con eso, continúa y te avisa de cualquier diferencia). Del enunciado acordado se anota el pin y la demostración se comprueba contra él; se demuestra en pasos pequeños verificados, sin dejar huecos ni añadir supuestos nuevos, y el veredicto se informa tal cual y se guarda como hallazgo en un proyecto que guarde hallazgos. Para una cadena de lemas, el agente lleva un tablero, con cada enunciado acordado primero.
- **explore-conjecture**: averigua si una suposición o un patrón en matemáticas merece tu tiempo: lo enuncia con exactitud, busca primero un contraejemplo, en aritmética exacta, calcula los casos pequeños, consulta los números (sucesiones de números enteros en la OEIS), comprueba si ya se ha hecho y dice si es falso, conocido o, hasta donde puede saber, abierto (consulta [Demostraciones: comprobarlas con Lean](/guide/researchers#proofs-checking-them-with-lean)).
- **proof-check**: comprueba una demostración escrita en palabras (de un artículo, de un estudiante o del propio agente): cada paso queda justificado o marcado como un hueco, se buscan los fallos habituales, se prueban casos pequeños y se da un veredicto: es válida, es válida una vez que se rellenen estos huecos, o falla en este paso.
- **figures-for-papers**: deja los gráficos de un artículo listos para imprimir: tan anchos como la columna de la plantilla de la conferencia o revista, con la tipografía del artículo, en colores que las personas daltónicas distinguen, como PDF vectoriales con las fuentes incrustadas (ninguna Type 3), todo con un único archivo de estilo.
- **blocked-pages**: cuando una página no carga o no se puede leer (un error, un muro de pago, un muro de cookies o una verificación contra bots, una página que necesita JavaScript), prueba por orden las otras vías para llegar a su contenido, y nunca se salta lo que no tienes derecho a ver.
- **web-scraping**: recopila datos estructurados de sitios web (listados, tablas, precios, un catálogo) en CSV o JSON, con cortesía y de forma fiable, y los comprueba.
- **maps-and-places**: lugares sin servicios de mapas de pago: las coordenadas de una dirección, qué hay cerca, distancias, rutas y tiempos de viaje, zonas horarias, horarios de apertura y un mapa dentro de una página.
- **watch-and-alert**: vigila algo durante días o semanas (un precio, un producto que vuelve a estar disponible, noticias sobre una empresa, una página que cambia, una versión nueva) con una tarea programada, y te avisa solo cuando importa.

**Planificación y decisiones**

- **decision-brief**: te ayuda a elegir: las opciones (entre ellas no hacer nada, cuando es una opción real), qué importa y cuánto, los pros y contras y los riesgos, y una recomendación clara, en una sola página.
- **project-plan**: planifica un proyecto de cualquier tipo (un evento, una mudanza, un lanzamiento, una reforma): hitos, tareas con responsables y fechas, qué depende de qué, riesgos y un cronograma que se mantiene al día.
- **meetings**: si hace falta reunirse siquiera, una agenda escrita como preguntas, a quién invitar, cómo dirigirla, reuniones individuales y el seguimiento, y cómo prepararte para una reunión que dirige otra persona.
- **weekly-review**: un reinicio semanal: qué está abierto y prometido, qué se estancó, y las prioridades y el tiempo de la semana siguiente.
- **brainstorming**: muchas ideas con métodos con nombre (inversión, restricciones, analogías, la peor idea…), y después ordenarlas y elegir unas pocas para probar.
- **study-coach**: aprender una materia o una habilidad: lo que ya sabes, un plan, explicaciones a tu nivel, preguntas de práctica y tarjetas de estudio a las que volver.
- **job-interviews**: prepararte para una entrevista de trabajo: lo que necesita el puesto, un banco de ejemplos verdaderos, entrevistas de práctica con una pregunta a la vez y comentarios sinceros, preguntas difíciles y un repaso de cómo salió una; también para quienes entrevistan.
- **solo-business**: un negocio propio (trabajo independiente, un servicio, un producto, un negocio complementario): lo que necesitas de él, una oferta probada con clientes que pagan antes de construir mucho, precios que remuneren tu tiempo, y cuándo cambiar de rumbo o parar.

**Datos y números**

- **data-analysis**: responde preguntas a partir de datos (un CSV, una hoja de Excel, una exportación): los revisa y los limpia, hace los cálculos de una manera que se puede comprobar, y dice en qué se apoya la respuesta.
- **dashboards**: el gráfico adecuado para la pregunta, y paneles a los que volver como una página guardada, con sus datos guardados u obtenidos en vivo.
- **notebooks**: cuadernos de Jupyter que se leen bien y se pueden volver a ejecutar: una celda de texto antes de cada sección, celdas pequeñas, un entorno donde ejecutarlos (creado junto al cuaderno cuando ninguno sirve), una ejecución completa desde el principio antes de entregarlo, y una tarjeta que lo abre en la página de cuadernos de la app.
- **financial-model**: los números de un negocio en una hoja de cálculo (ingresos, costos, flujo de caja, punto de equilibrio, escenarios), con los supuestos en una hoja aparte y fórmulas que se pueden seguir.
- **sql-and-databases**: SQL correcto y seguro, cambios de esquema y migraciones seguros con datos en producción, índices, y una copia de seguridad antes de cualquier cosa arriesgada.

**Diseño e imágenes**

- **image-prompts**: crear imágenes (y videos cortos) con los modelos de imágenes de la app: qué describir, tamaños, texto dentro de las imágenes, mantener igual un personaje o un estilo a lo largo de varias imágenes, y editar una.
- **diagrams**: diagramas de flujo, líneas de tiempo, organigramas, mapas mentales y diagramas de arquitectura que la gente pueda leer, mostrados en la conversación o guardados como una página.
- **infographics**: explicaciones visuales de una página (una infografía, un póster que compara opciones, un gráfico de un proceso o de una línea de tiempo): primero el mensaje y los datos con fuentes, la estructura que mejor les va, un estilo, y después la exportación real revisada al tamaño en que la verá la gente.
- **ui-mockups**: antes de construir una pantalla o una página, dos o tres maquetas rápidas y claramente distintas, mostradas en la conversación para comparar y elegir.
- **brand-kit**: una marca para un negocio pequeño, un club o un proyecto: a quién se dirige, su voz, colores con el contraste comprobado, fuentes gratuitas, ideas de logotipo, y una ficha y un manual de marca, puestos en práctica en perfiles y tarjetas.
- **youtube-thumbnails**: una miniatura y un título que hacen una sola promesa honesta: tres ideas distintas, legibles incluso en tamaño diminuto, con vista previa junto a otros videos, y probadas con Test & Compare de YouTube.

**Programación**

- **debugging-code**: la causa raíz de un error: primero una prueba que falla, el seguimiento de la pila, acotar el problema (registros, un depurador, git bisect), la corrección y una prueba que evita que vuelva a pasar.
- **test-first**: pruebas antes que el código, para comportamientos nuevos y correcciones de errores, al nivel adecuado, con qué simular y qué no.
- **code-review**: revisar un cambio, o el propio trabajo del agente antes de entregarlo: primero la corrección, luego la seguridad, las pruebas y la claridad, cada hallazgo con dónde está, por qué y una solución.
- **refactoring**: cambiar la estructura del código sin cambiar lo que hace, en pasos pequeños y con las pruebas pasando.
- **codebase-tour**: orientarse en un código desconocido: cómo compilarlo, ejecutarlo y probarlo, sus partes y dónde está cada cosa, con un resumen breve y un diagrama.
- **git-rescue**: salir de apuros con Git de forma segura: deshacer commits, encontrar trabajo perdido, resolver conflictos, un secreto subido por error en un commit, siempre con una copia de seguridad antes.
- **github**: pull requests, revisiones, comprobaciones y sus registros, issues y versiones en GitHub, con el comando gh o con su API.
- **api-requests**: llamar y depurar API web: inicios de sesión con tus claves guardadas, respuestas de error, páginas de resultados, límites de uso y reintentos.
- **frontend-polish**: lograr que una página web se vea y se sienta terminada: diseño de la página, espaciado, tipografía, color y contraste, todos los estados, teléfonos, el teclado, comprobado con capturas de pantalla reales.
- **web-accessibility**: sitios web y apps web que todas las personas puedan usar (el teclado, lectores de pantalla, zoom, contraste, subtítulos, formularios y cuadros de diálogo), comprobados con herramientas y a mano, e informados con honestidad.
- **web-app-qa**: probar una app web como un usuario exigente, en el navegador, y redactar los errores encontrados con los pasos y las evidencias.
- **docker**: Dockerfiles y archivos compose, construir y depurar contenedores, y limpiar con cuidado.
- **servers**: cuidar de un servidor o de otra computadora por SSH (actualizaciones, un servicio que falla, un disco lleno, usuarios y claves, el cortafuegos, copias de seguridad), siempre con una vía para volver a entrar antes de tocar el acceso, una máquina primero y una comprobación después de cada cambio.
- **security-check**: una revisión práctica de seguridad: secretos, inyecciones, quién puede hacer qué, paquetes desactualizados, cada problema informado según su gravedad.
- **performance**: hacer el software más rápido midiendo primero, encontrando el mayor costo, corrigiéndolo y midiendo de nuevo.
- **mcp-servers**: crear un servidor MCP para que los agentes tengan herramientas nuevas, diseñar bien sus herramientas, probarlo y añadirlo a un agente.
- **ci-doctor**: una ejecución de CI fallida (GitHub Actions, GitLab CI, Buildkite, CircleCI): el primer error real en los registros, inestable o real según la evidencia, reproducido en un worktree, y luego vuelto a ejecutar una vez, corregido en un pull request en borrador o informado, según lo permitido.
- **issue-triage**: un issue nuevo etiquetado con las propias etiquetas del proyecto, duplicados encontrados con varias formulaciones (y con qué grado de seguridad), una petición amable de lo que le falta al informe, y una pequeña corrección probada en un pull request en borrador.
- **dependency-upgrades**: qué está desactualizado y qué dependencias tienen avisos de seguridad, actualizadas por nivel de riesgo (correcciones de seguridad, parches, versiones menores, las mayores aparte) en worktrees, con las pruebas ejecutadas y las notas de versión leídas, un pull request por grupo.
- **incident-response**: una alerta o una caída: te avisan de inmediato, luego una cronología de errores, despliegues y cambios, la causa probable con su evidencia, una reversión propuesta y consultada antes, y un análisis posterior sin culpas después.
- **git-bisect**: encontrar el commit que rompió algo con un script de comprobación y git bisect run en un worktree propio, y por qué lo rompió (consulta [Encuentra qué lo rompió](/guide/engineering#find-what-broke-it)).

**Modelos de IA**

- **hugging-face**: publicar y usar modelos y conjuntos de datos en el Hugging Face Hub: subidas, fichas de modelos y de conjuntos de datos, repositorios restringidos, comprobación de una subida.
- **fine-tuning**: si vale la pena el ajuste fino de un modelo de lenguaje y cómo hacerlo: los datos de entrenamiento, LoRA y QLoRA, parámetros, la memoria que necesita y una evaluación honesta.
- **model-evaluation**: evaluar modelos de forma justa: los conjuntos de prueba y las medidas adecuados, benchmarks, un modelo como juez con cautela, y qué tan seguros son los resultados.
- **local-models**: ejecutar modelos abiertos en tu propia computadora: qué modelo y qué tamaño caben, la memoria que necesitan, la cuantización, y Ollama, llama.cpp o vLLM.

**Esta app**

- **everyday-help**: para “¿qué puedes hacer por mí?”: una conversación breve sobre tus días, una pregunta a la vez, luego una o dos ideas que encajan con lo que la app realmente hace, y una cosa pequeña ya configurada si dices que sí.
- **app-builder**: para crear o modificar una de tus apps. El agente define qué entra y qué sale, elige el paso más barato para cada parte, le da a la app ejemplos con comprobaciones y los prueba antes de entregarla, indicando lo que cuesta una ejecución.
- **skill-authoring**: escribir una buena habilidad: cuándo vale la pena hacer una, la línea que indica cuándo usarla, su estructura y sus comprobaciones, y cómo mejorarla después de usarla.
- **plugin-authoring**: crear, empaquetar y compartir un plugin (consulta [Plugins](/guide/plugins)): qué lleva dentro, su formato, cómo comprobarlo y cómo añadirlo.

Las habilidades de documentos (pdf, presentations, spreadsheets, word-documents) crean archivos con pequeños scripts de Python. Necesitan Python 3 en esta computadora. La primera vez que hace falta una, las bibliotecas que usan se descargan en una carpeta privada dentro de la carpeta de datos de la app (unos 30 MB, una sola vez); no se instala nada para todo el sistema. Si falta Python, el agente te dice el comando que lo instala. Para ver las páginas como imágenes antes de entregar un archivo, usan LibreOffice y Poppler cuando esta computadora los tiene. Consulta [Documentos, imágenes, videos y voz](/guide/documents-voice).

Las habilidades integradas no se pueden quitar, pero puedes desactivar cualquiera de ellas o modificarla: tu versión ocupa su lugar.

## Escribir una habilidad propia

1. Haz clic en **Nueva habilidad** ([ábrela](/settings?s=skills&find=New%20skill)).
2. Escribe un **Nombre**: corto, con guiones. “Revisión de facturas” se guarda como revision-de-facturas.
3. En **Cuándo usarla**, escribe una línea, como “Úsala al revisar la factura de un proveedor antes de pagarla”. Los agentes ven esta línea en cada sesión y leen el resto solo cuando encaja.
4. En **Instrucciones**, escribe el método: los pasos en orden, las comprobaciones, los errores que se deben evitar. Markdown funciona.
5. Opcionalmente, elige su **Grupo** y las **Palabras que la activan**: palabras de una solicitud que incorporan la habilidad por sí solas al turno de Custom, separadas por comas (consulta [Activar habilidades por palabras clave](#bring-skills-in-by-keywords)).
6. En **Quién la recibe**, deja **Todos los agentes**, o elige **Claude Code** o **Codex** para una habilidad que solo reciba ese agente.
7. Haz clic en **Agregar habilidad**.

Una habilidad para todos los agentes se guarda en tu carpeta de habilidades (dentro de la carpeta de datos de la app, `~/.hydor/skills` a menos que tu instalación guarde sus datos en otro lugar) y aparece en **Tuyos**. Una habilidad de Claude Code va en `~/.claude/skills` y una de Codex en `~/.agents/skills`, que cada uno lee en todas las carpetas. Si ya existe una habilidad con ese nombre, la app lo indica y no guarda nada. Una habilidad solo para un proyecto se escribe en la pestaña **Habilidades** de ese proyecto: consulta [Dar habilidades propias a un proyecto](/guide/projects#give-a-project-skills-of-its-own).

Para cambiar una de las tuyas, ábrela y haz clic en **Cambio**: los mismos campos, que se guardan con **Guardar**. Cada cambio se conserva en su historial. También puedes poner habilidades en tu carpeta de habilidades tú mismo: una carpeta por habilidad, con nombre en minúsculas, dígitos y guiones, y su SKILL.md dentro. Aparecen en **Tuyos**.

## Cambiar una habilidad integrada

Abre la habilidad y haz clic en **Crear mi propia versión**. Se abren los mismos campos con su texto; cambia lo que quieras y haz clic en **Guardar**. Tu versión empieza como una copia de toda la carpeta de la habilidad integrada (con sus ejemplos y scripts), con tu cambio hecho.

A partir de entonces, los agentes usan tu versión en lugar de la integrada, incluso después de que la app actualice la habilidad integrada. Aparece en **Tuyos** como “Tu versión de una habilidad integrada”. Para volver a la habilidad integrada, quita tu versión (consulta [Quitar una habilidad y recuperarla](#remove-a-skill-and-bring-it-back)).

Cuando apruebas una mejora de un agente a una habilidad integrada, se guarda como tu versión de la misma manera: la tarjeta lo indica antes de que apruebes.

## Quitar una habilidad y recuperarla

1. Abre una de tus habilidades y haz clic en **Quitar**.
2. Confirma con **Quitar**.

Los agentes dejan de recibirla. Si era tu versión de una habilidad integrada, los agentes vuelven a la integrada. El texto permanece en el historial de la habilidad, así que puedes recuperarla: tus habilidades quitadas aparecen en la parte inferior de la página, después de **Quitada:**. Haz clic en un nombre ahí (pasa el cursor por encima para ver cuándo se quitó) y la habilidad vuelve tal como estaba.

Las habilidades propias de Claude Code y Codex: **Eliminar** en su ventana borra de disco la carpeta de la habilidad, con todos los archivos que contiene, después de que confirmes. Está pensado para tus propias habilidades y, en la pestaña Habilidades de un proyecto, para Claude Code también las de la carpeta del proyecto. Las habilidades integradas, de administrador y de plugins de esos agentes no se pueden eliminar: desactívalas. Una habilidad eliminada no se puede recuperar desde la app.

## Aprobar, editar o descartar una habilidad propuesta

Después de una tarea que requirió mucho esfuerzo, un agente puede proponer conservar su método como una habilidad: una solución encontrada tras varios intentos, un flujo de trabajo que tuviste que explicar, un proceso cuyos pasos es fácil hacer mal. También puede proponer una mejora a una habilidad que siguió, cuando encontró un paso que faltaba, era incorrecto o poco claro. A los agentes se les indica que no propongan datos puntuales, tus datos personales ni nada secreto.

No se guarda nada hasta que lo apruebes. Mientras tanto, el agente sigue con su trabajo, y tu respuesta le llega como un mensaje.

### Qué muestra la tarjeta

La propuesta aparece como una tarjeta en la conversación, fuera de los pasos plegados, mientras el agente continúa. En la parte superior pregunta **¿Conservar esto como habilidad?**, **¿Mejorar esta habilidad?** o **¿Mejorar esta habilidad integrada?**, con el nombre de la habilidad y una insignia: **Esperándote**, **Guardado**, **Descartada** o **Reemplazada**.

Debajo:

- **Por qué**: qué pasó en esta tarea que hace que valga la pena conservarla, en palabras del agente.
- **Cuándo se aplica**: la línea que los agentes leen para decidir cuándo usarla. En una mejora que la cambia, la línea anterior aparece tachada.
- Sus palabras clave para Custom, si tiene: “Custom la activa cuando dices” y las palabras.
- Advertencias, si las hay (consulta [Advertencias en la tarjeta](#warnings-on-the-card)).
- El texto, con un selector entre **Texto** (para una habilidad nueva) o **Cambios** (para una mejora, línea por línea) y **Habilidad** (la guía tal como se lee), y cuántas líneas añade y quita.
- En un proyecto, **Conservarla para**: **Todas las sesiones** o el nombre del proyecto (consulta [Habilidades que los agentes proponen en un proyecto](/guide/projects#skills-agents-propose-in-a-project)).

### Aprobarla

Haz clic en **Aprobar**. La habilidad se guarda en tu biblioteca, y la tarjeta indica que está en tu biblioteca de habilidades: todos los agentes pueden usarla. Un enlace **Tus habilidades** te lleva a [Configuración → Habilidades](/settings?s=skills).

Si eliges el nombre del proyecto en **Conservarla para**, se guarda en las habilidades del proyecto: la tarjeta indica que está en ellas, y **Las habilidades del proyecto** te lleva allí.

Custom tiene la habilidad desde su siguiente turno; Claude Code y Codex, desde sus siguientes sesiones.

### Editarla primero

1. Haz clic en **Editar…**. Se abre una ventana con toda la habilidad como texto.
2. Cambia lo que quieras. Las líneas de la parte superior (entre las líneas `---`) contienen su nombre, que debe permanecer, y la línea sobre cuándo usarla. Todo lo que está debajo es la guía que siguen los agentes.
3. Haz clic en **Guardar y aprobar**.

La tarjeta indica entonces que la editaste antes de guardar y muestra la versión guardada. La app revisa el texto editado igual que revisa el del agente: necesita una línea sobre cuándo usarla, pasos reales y ningún secreto.

### Descartarla

1. Haz clic en **Descartar…**.
2. Opcionalmente, dile al agente por qué en el cuadro que se abre.
3. Haz clic en **Descartar** (o en **Cancelar** para volver).

No se guarda nada. El agente se entera de que la descartaste, con tu nota, y se le indica que no la proponga de nuevo a menos que se lo pidas.

### Advertencias en la tarjeta

Las habilidades son archivos que todos los agentes leen, así que la app revisa cada propuesta antes de que la veas:

- **Un secreto la detiene.** Una propuesta con algo que parezca una contraseña, una clave o un token (una clave de API, una clave privada, una contraseña escrita o dentro de una dirección) nunca te llega como tarjeta. Se le indica al agente que lo quite y que diga en su lugar dónde se guarda el secreto.
- **Se señala el texto que intenta dirigir a los agentes.** La tarjeta muestra **Revisa estas líneas antes de aprobar**, con el número de línea y el texto, cuando una línea que añade la propuesta: les dice a los agentes que ignoren sus instrucciones, intenta reemplazar quién es el agente, les dice que te oculten algo, intenta eludir las aprobaciones, envía claves o archivos privados a algún lugar, ejecuta un script directamente desde internet, cambia la configuración del agente o archivos de inicio, elimina o sobrescribe mucho más allá de un proyecto, oculta instrucciones en un comentario HTML, o tiene caracteres que no puedes ver.

Aprobar una propuesta con advertencias pide confirmación una vez más: **¿Guardarla con estas advertencias?** Haz clic en **Guardarla** solo si las líneas señaladas son lo que quieres que los agentes sigan.

### Responder desde Configuración o la bandeja de entrada

Una propuesta espera en tres lugares, y una respuesta en cualquiera de ellos se muestra en todos, en todos los dispositivos:

- la tarjeta en su conversación;
- el grupo en la parte superior de [Configuración → Habilidades](/settings?s=skills), “Un agente sugiere una habilidad” (o cuántas sugiere). Cada fila dice **Nueva habilidad:** o **Cambiar a** y el nombre, hace cuánto, de qué conversación viene (haz clic para abrirla) y “tiene advertencias” cuando las tiene. **Revisar** abre la misma tarjeta en una ventana;
- la [bandeja de entrada](/inbox), como “Sugiere una nueva habilidad: …” o “Sugiere un cambio a la habilidad …”. **Abrir** te lleva a su conversación, donde está la tarjeta. Consulta [Bandeja de entrada y notificaciones](/guide/inbox).

### Límites

- Una propuesta admite como máximo 20.000 caracteres. Las guías más largas se rechazan y se le pide al agente que conserve los pasos principales.
- Una habilidad nueva necesita un nombre que no esté en uso. El nombre son palabras cortas en minúsculas con guiones, como release-notes.
- Como máximo cinco propuestas de una misma conversación esperan tu respuesta a la vez.
- Cuando el agente propone la misma habilidad de nuevo antes de que respondas, la propuesta más reciente ocupa el lugar de la anterior, que muestra **Reemplazada**.
- Si se guardó una habilidad con ese nombre, o la habilidad cambió, después de hacer la propuesta, la aprobación falla con un mensaje. Descártala y vuelve a pedírsela al agente.
- Los agentes solo pueden mejorar las habilidades de la biblioteca de la app y las propias de un proyecto. Las habilidades propias de Claude Code y Codex no se cambian de esta manera: cámbialas en [Configuración → Habilidades](/settings?s=skills).
- Las propuestas respondidas permanecen en sus tarjetas en conversaciones antiguas durante medio año.

## Habilidades que encajan con una nueva sesión

Cuando una sesión empieza con un mensaje, su agente también se entera de qué habilidades encajan con ese mensaje, si alguna encaja claramente: hasta tres, cada una con su finalidad y con cómo ese agente carga una (Claude Code con su herramienta Skill, Codex y otros agentes leyendo su SKILL.md, Custom con su herramienta de habilidades, que también puede encontrar una habilidad por el tipo de trabajo, en pocas palabras). El agente carga la que encaja antes de empezar, o continúa cuando ninguna encaja. Se entera de esto una sola vez, con tu primer mensaje, no con cada mensaje (Custom, en las instrucciones con las que trabaja).

Las habilidades se encuentran de la misma manera en que la memoria encuentra notas (consulta [Con qué empieza un agente](/guide/memory#what-an-agent-starts-with)): por sus palabras, donde el nombre de una habilidad cuenta más, luego sus palabras clave y su finalidad; y, con la búsqueda por significado activada en [Configuración → Memoria](/settings?s=memory&find=Search%20by%20meaning), por lo que significan, de modo que una solicitud con otras palabras, o en otro idioma, aun así encuentra su habilidad. Solo cuentan las coincidencias claras: por palabras, al menos dos de las tuyas y muy por delante del resto; por significado, solo la habilidad más cercana, cuando se parece lo suficiente. Las palabras comunes de una solicitud, como “ayuda”, “necesito” o “después”, no cuentan para una coincidencia. La charla trivial, las respuestas cortas y las solicitudes a las que no encaja ninguna habilidad no reciben ninguna.

Está en el menú **⋯** de [Configuración → Habilidades](/settings?s=skills&find=Suggest%20skills%20that%20fit): **Sugerir habilidades que encajen**, marcada mientras está activada. Está activada a menos que la desactives. No se aplica en una sesión que continúa, ni en las ejecuciones de una app.

## Activar habilidades por palabras clave

Algunos modelos rara vez cargan una habilidad por sí solos. Para ellos, Custom puede incorporar una habilidad cuando tu mensaje usa sus palabras clave: el texto de la habilidad llega junto con tu mensaje, y el agente lo sigue donde encaja.

Está en el menú **⋯** de [Configuración → Habilidades](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords): **Activar habilidades por palabras clave**, marcada mientras está activada. Está activada a menos que la desactives. Solo afecta a Custom; Claude Code y Codex cargan las habilidades por sí mismos. Con la opción desactivada, Custom sigue viendo su lista de habilidades y carga una cuando una tarea encaja.

Cuando las palabras clave activan una habilidad, aparece una etiqueta en la conversación debajo de tu mensaje: **Usando la habilidad research**, “activada por “research” en tu mensaje”. Haz clic en ella para leer la habilidad.

### Cómo coinciden las palabras clave

- Una palabra clave coincide con palabras completas, en mayúsculas o minúsculas: “research” no coincide con “researchers”.
- Una palabra clave que termina en * también coincide con palabras más largas: “renovat*” coincide con renovate y renovation; “debug*” coincide con debugging.
- Los mensajes de menos de cuatro palabras no activan nada, así que “ok, sigue” nunca carga una habilidad.
- Se activan como máximo dos habilidades a la vez: van primero las que tienen más palabras clave en tu mensaje.
- Una habilidad activada permanece durante ese mensaje y los dos siguientes, de modo que un proceso como preguntar primero o investigar pueda ejecutarse a lo largo de varios turnos. Las habilidades de un mensaje más reciente ocupan el lugar de las anteriores.
- Una habilidad larga se recorta para ajustarse a lo que el modelo admite; se le indica al agente que cargue el resto por su cuenta.

Las habilidades integradas con palabras clave son app-builder (“make a template”, “make an app”, “automate”…), clarify-first (“plan a trip”, “business plan”, “renovat*”…), clean-up (“clean up after”, “leftover files”…), decisions-log (“while I'm away”, “overnight”…), evidence-before-done (“double-check”, “verify”…), research (“research”, “find sources”, “literature review”…), troubleshooting (“not working”, “keeps crashing”, “debug*”…) y writing (“draft a”, “proofread”, “cover letter”…). La mayoría de las demás también tienen algunas, y las habilidades de documentos no tienen ninguna: Custom las carga cuando una tarea encaja. Ves las palabras clave de una habilidad cuando la abres.

### Dar palabras clave a una habilidad

Las palabras clave de una habilidad son una lista en las líneas de la parte superior de su SKILL.md, por ejemplo `triggers: [weekly report, status update, standup]`. Un agente puede proponer hasta 12 palabras clave con una habilidad nueva, cada una de 3 a 40 caracteres. Custom también reconoce las palabras clave de las habilidades de tus carpetas y las de un proyecto, ya que también las lee.

## Habilidades propias de Claude Code y Codex

Claude Code y Codex también leen habilidades de carpetas propias: las tuyas, que leen en todas las carpetas, y las de un proyecto, que leen solo allí. Aparecen en la página Habilidades bajo **Claude Code's own** y **Codex's own** (el filtro **Claude Code y Codex** muestra solo esas). Cada fila indica de dónde viene la habilidad:

- **esta carpeta**: las habilidades propias de la carpeta de un proyecto, en la pestaña Habilidades de ese proyecto.
- **this repository**: habilidades de Codex que vienen con el repositorio.
- **todas las carpetas**: tus propias habilidades, para todas las carpetas.
- **un plugin**: habilidades que vienen con uno de los plugins del propio agente (consulta [Plugins propios de Claude Code y Codex](/guide/plugins#claude-codes-and-codexs-own-plugins)).
- **integrada**: habilidades que vienen con Codex.
- **definida por un administrador**: habilidades que un administrador configuró para Codex.

Para Claude Code, Configuración → Habilidades muestra tus habilidades (en `~/.claude/skills`); para Codex, lo que el propio Codex informa para todas las carpetas. La pestaña **Habilidades** de un proyecto muestra también las de la carpeta del proyecto, con interruptores solo para ese proyecto. Cuando no se pudieron leer algunas (Codex no responde, un archivo de habilidad que no puede leer), una línea debajo de la lista lo indica.

Escribe una con **Nueva habilidad**, eligiendo **Claude Code** o **Codex** en **Quién la recibe** (consulta [Escribir una habilidad propia](#write-a-skill-of-your-own)). Ábrela para leerla; **Cambio** abre su SKILL.md en un editor: cámbialo, haz clic en **Guardar** y luego en **Hecho**. **Abrir la carpeta en Archivos** muestra la carpeta de la habilidad, con los demás archivos que contenga.

## Pregunta a un agente

- “¿Qué habilidades de la Biblioteca han usado los agentes y con qué frecuencia?”
- “Muéstrame las propuestas de habilidades que están esperando mi revisión y qué cambiaría cada una.”
- “Desactiva la habilidad de correo para todos los agentes.”
- “Escribe una habilidad para todos los agentes sobre cómo revisamos las facturas, a partir de estos tres ejemplos.”
- “Crea mi propia versión de la habilidad de investigación que siempre cite los números de página.”
- “Quita mi habilidad invoice-checks”, o “Recupera la habilidad que quité ayer.”
- “Copia las habilidades que creé en otros agentes a mis propias habilidades, y primero enuméralas.”
- “Desactiva para Custom la incorporación de habilidades por palabras clave.”
- “Deja de sugerir habilidades al inicio de las nuevas sesiones.”
- “En mi proyecto Shop website, desactiva la habilidad de despliegue de Claude Code y activa la habilidad de docker solo allí.”
