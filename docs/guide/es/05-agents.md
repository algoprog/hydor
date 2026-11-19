# Agentes

Un agente es el rol con el que trabaja una sesión: sus instrucciones, lo que puede usar, dónde y cuándo trabaja, el nivel de modelo con el que piensa, a qué otros agentes les encarga trabajo y cuánto puede gastar en un mes. Este tema abarca la página Agentes, los agentes que vienen con la app, cómo crear los tuyos diciendo qué deben hacer, cómo cambiar uno, dónde trabaja un agente, sus programaciones, los niveles, los agentes que encargan trabajo a otros agentes, un presupuesto mensual, las versiones de un agente y los ejemplos que lo comprueban, cómo empezar y cambiar sesiones con un agente, cómo compartir un agente como archivo, cómo importar los archivos de agentes de Claude Code, las carpetas de tareas que recibe una sesión cuando no eliges ninguna carpeta, y cómo hacer que los agentes limpien después de una tarea.

![La página Agentes: tus agentes, cada uno en una tarjeta con su estado, y los integrados debajo](images/agents.webp)

## Qué es un agente

Cuando empiezas una sesión, eliges un agente en la página de inicio, y más tarde puedes cambiar la sesión a otro desde su cuadro de mensaje. Sus instrucciones se añaden encima de las del propio programa, de modo que el mismo programa trabaja como un investigador cuidadoso en una sesión y como un tutor paciente en la siguiente. Un agente funciona con todos los programas: Claude Code, Codex, Custom (el agente propio de la app) y los agentes que usan ACP (Agent Client Protocol), como Gemini CLI u OpenCode.

Un agente puede tener:

- **Instrucciones**: quién es y cómo trabaja. Se le indica que trabaje así en todo momento, pero lo que pidas en la conversación tiene prioridad.
- **Dónde trabaja**: en todas partes, o solo en algunos de tus proyectos (consulta [Dónde trabaja un agente](#where-an-agent-works)).
- **Cuándo trabaja**: cuando tú u otro agente se lo piden, y según sus propias programaciones (consulta [Cuándo trabaja un agente: programaciones](#when-an-agent-works-schedules)).
- **Con qué piensa**: Automático, o un nivel (Rápido, Estándar, Mejor o Máximo) cuyo modelo defines una sola vez para cada programa (consulta [Con qué piensa un agente: niveles](#what-an-agent-thinks-with-tiers)).
- **Su equipo**: los otros agentes a los que puede encargar partes de su trabajo, y si otros agentes pueden encargarle trabajo a él (consulta [Agentes que encargan trabajo a otros agentes](#agents-that-hand-work-to-other-agents)).
- **Un presupuesto mensual**: lo que sus sesiones pueden gastar en un mes (consulta [Un presupuesto mensual](#a-monthly-budget)).
- **Lo que entrega**: los campos de cada resultado, comprobados, y adónde va cada uno: una página guardada, una fila de una hoja de cálculo, un correo a otras personas, una notificación, un archivo, un webhook (consulta [Lo que entrega un agente](#what-an-agent-hands-back)).
- **Una conversación propia**: puede mantener una conversación, con una bandeja de entrada para los mensajes tuyos y de otros agentes, donde también publican sus ejecuciones programadas (consulta [Un agente con una conversación propia](#an-agent-with-a-conversation-of-its-own)).
- **Qué puede usar**: leer archivos, crear y cambiar archivos, ejecutar comandos, usar la web, usar un navegador, usar la computadora (su pantalla, ratón y teclado, en las apps de escritorio con Computer use activado) y otras herramientas. Déjalas todas activadas, o desactiva algunas.
- **Habilidades preferidas**: habilidades que carga antes de empezar cuando encajan con la tarea (consulta [Habilidades](/guide/skills)).
- **Apps conectadas**: cuentas conectadas que se activan en sus sesiones (consulta [Apps conectadas, claves y herramientas](/guide/connections)).
- **Un programa, un modelo y un modo de permisos** sugeridos: se eligen con él en la página de inicio, y aún puedes cambiarlos antes de empezar.
- **Dónde empiezan sus sesiones** cuando no eliges ninguna carpeta: una carpeta de tarea nueva propia, o la carpeta que se muestra en la página de inicio.

Un agente es un rol que asume una sesión. El texto que todos los agentes deben seguir en todas las sesiones, en un proyecto o en una sesión, como la forma en que te gusta que te hablen, va mejor en las [Pautas de los agentes](/guide/guidelines). Antes de la versión 0.37.0, los agentes se llamaban asistentes; son lo mismo, con más posibilidades.

## La página Agentes

Abre **Agentes** en la barra de iconos, o ve a [/agents](/agents). En un teléfono la barra lateral es un cajón: ábrelo primero. [Configuración → Capacidades → Tus agentes](/settings?s=assistants&find=Your%20agents) tiene una fila **Tus agentes** que también abre esta página (indica cuántos agentes son tuyos); el resto de esa sección trata de las carpetas de tareas y la limpieza, más abajo.

- En una computadora la página tiene una columna junto a la barra de iconos, como Apps y Configuración: arriba están el logo, **Nueva** y **Ocultar barra lateral** (Ctrl+B, ⌘B en Mac), y debajo los lugares. **Nueva** abre un menú: **Nuevo agente** crea uno (consulta [Crear un agente](#make-an-agent)); **Instalar un agente desde un archivo** instala uno a partir de un archivo que alguien te dio (consulta [Compartir un agente como archivo](#share-an-agent-as-a-file)); **Importar archivos de agentes de Claude Code** trae los archivos de agentes de Claude Code (consulta [Importar los archivos de agentes de Claude Code](#import-claude-codes-agent-files)).
- Los lugares: **Todos los agentes** (los tuyos como tarjetas, y los integrados debajo mientras la columna está oculta, ya que la columna los lista), **Tus agentes** (solo los tuyos), **Te necesita** y **Con programación** (cada uno aparece mientras algunos de los tuyos cumplan la condición) y, bajo **Dónde trabajan**, **En todas partes** y cada proyecto que tiene agentes propios. Cada uno indica cuántos agentes contiene. Bajo **Integrado** hay una fila por cada agente que viene con la app, con su icono, y abre la página propia de ese agente. Tras una línea, **Programaciones** muestra todo lo que se ejecuta solo durante una semana: las programaciones de tus agentes junto con tus otras tareas programadas, las programaciones, los observadores y los webhooks de tus apps, cada ejecución coloreada según cómo salió, lo que se ejecuta a continuación, y una lista de todas con un interruptor para pausar cada una (consulta [Ver la semana: qué se ejecutó y qué se ejecutará](/guide/tasks#see-the-week-what-ran-and-what-runs-next)). El lugar abierto aparece marcado, y la dirección lo conserva (`/agents?place=mine`, `/agents/schedules`), de modo que un enlace lo abre.
- En la parte superior de la página, el nombre del lugar está a la izquierda y el cuadro de búsqueda a la derecha: **Buscar un agente** reduce las tarjetas, y los agentes integrados, a los que tienen en su nombre o en su línea lo que escribes.
- Tus agentes aparecen como tarjetas. Cada tarjeta tiene el nombre del agente, su línea, su estado (**Funcionando**, **Te necesita** cuando una de sus sesiones espera tu respuesta, **Presupuesto agotado** o **Inactivo**), los proyectos en los que trabaja (o **En todas partes**), su nivel, cuándo se ejecuta a continuación, cuántos mensajes esperan en su bandeja de entrada y lo que gastó este mes.
- En un teléfono y en una ventana estrecha no hay columna: la página conserva su título, con **Nuevo agente**, **Importar** e **Instalar** a la derecha, dos pestañas debajo (**Tus agentes** y **Programaciones**), y chips sobre las tarjetas que muestran **Todos**, **En todas partes**, cada proyecto que tiene agentes propios, **Con programación** y **Te necesita**. Los agentes que vienen con la app están bajo **Integrado**.

Haz clic en una tarjeta para abrir la página propia del agente, que conserva la columna a su lado con ese agente marcado (**Tus agentes** para uno tuyo):

- Su configuración en unas pocas frases, como “Trabaja en todas partes, cada día laborable a las 09:00, y piensa con Rápido.” Haz clic en cualquiera de las palabras subrayadas para cambiarlas ahí (consulta [Cambiar un agente](#change-an-agent)).
- **Empezar una sesión** abre la página de inicio con el agente elegido (y su proyecto, cuando trabaja en uno).
- **Toda la configuración** abre en una ventana todos los ajustes del agente (consulta [Toda la configuración](#all-settings)). **Duplicar** crea una copia para modificar; **Eliminar** elimina uno de los tuyos.
- **Más** (⋯): **Versiones**, para uno tuyo, lista cómo era antes de cada cambio, para compararlas y recuperarlas (consulta [Versiones: volver a una anterior](#versions-go-back-to-an-earlier-one)); **Descargar como archivo** lo guarda como un archivo para conservarlo o entregarlo (consulta [Compartir un agente como archivo](#share-an-agent-as-a-file)).
- **Ejemplos**, para uno tuyo: mensajes para probarlo y lo que debe cumplir su respuesta, con **Probar los ejemplos** (consulta [Ejemplos que lo comprueban](#examples-that-check-it)).
- **Programaciones** lista las tareas programadas que se ejecutan como él, con **Añadir una programación**.
- **Bandeja de entrada**, para un agente que mantiene una conversación propia: sus mensajes y sus respuestas, un cuadro para enviarle uno, y **Su conversación** (consulta [Un agente con una conversación propia](#an-agent-with-a-conversation-of-its-own)).
- **Lo que entregó**, para un agente con campos o destinos para sus resultados: una tabla con sus resultados, una fila por cada uno, con adónde fue cada uno (consulta [Lo que entrega un agente](#what-an-agent-hands-back)).
- **Este mes**: cuántas sesiones empezaron como él y cuánto gastaron, frente a su presupuesto cuando tiene uno; y sus **Sesiones recientes**, cada una abre su conversación, con **Mostrar las 23 en la barra lateral** a su lado (consulta [Encontrar las sesiones de un agente](#find-an-agents-sessions)).

## Los agentes integrados

La app incluye ocho agentes. Ninguno sugiere un programa, un modelo, un nivel ni un modo de permisos, así que conservan lo que elegiste en la página de inicio, y ninguno limita lo que puede usar ni gasta por su cuenta. Todos menos Programador empiezan una sesión sin carpeta en una carpeta de tarea nueva (consulta [Carpetas de tarea](#task-folders-where-a-task-without-a-folder-works)). No puedes cambiarlos ni eliminarlos, pero sí puedes duplicar uno y modificar la copia (consulta [Duplicar o eliminar un agente](#duplicate-or-delete-an-agent)).

Cada uno se apoya en las [UI de respuesta](/guide/sessions#answer-uis-cards-charts-and-maps-in-replies) que van con su trabajo (una verificación de datos, problemas de práctica que respondes en el mismo lugar, un itinerario con un mapa, cifras clave y gráficos), de modo que lo que se entiende mejor viendo que leyendo llega como algo que puedes mirar, comparar, marcar o probar.

### General

“Ayuda con cualquier cosa: preguntas, redacción, planes, archivos.” La página de inicio elige General hasta que elijas otro agente en ese lugar (el agente propio de un proyecto tiene prioridad). Está pensado para personas que quizá no sean programadoras.

- Averigua lo que quieres y lo hace. Hace una sola pregunta breve solo cuando la petición es poco clara de una forma que cambia el resultado, con las respuestas probables como botones para hacer clic cuando son pocas; si no, toma una decisión razonable y dice cuál tomó.
- Empieza por la respuesta, luego da el detalle que importa, con palabras sencillas, y explica cualquier término técnico que no pueda evitar.
- Hace que cada respuesta sea fácil de asimilar y de usar: lo que se entiende mejor viendo que leyendo (opciones lado a lado, lugares en un mapa, pasos para marcar, números en un gráfico, cosas con sus imágenes) llega como una UI de respuesta, con una imagen o un video cuando ver ayuda, y sus propias palabras llevan el razonamiento y los consejos.
- Busca en la web todo lo que sea actual o de lo que no esté seguro, lee los archivos que le indiques, y guarda el trabajo que querrás conservar como archivos en la carpeta de la sesión, o lo mantiene en los archivos del proyecto (sus detalles → **Archivos**) cuando es una página que volverás a usar, como un registro de seguimiento o una calculadora.
- Cuando una respuesta deja pasos siguientes naturales (profundizar, comparar, planificar, hacer algo con ella), termina con dos a cuatro de ellos como botones para tocar; no después de cada respuesta.
- Cuando creó o cambió archivos, termina diciendo cuáles y dónde están.

### Investigador

“Encuentra y verifica fuentes, y las cita.”

1. Reformula tu pregunta en una línea y divide una pregunta amplia en las pocas subpreguntas que necesitan respuesta.
2. Busca ampliamente antes de concluir: varias búsquedas en la web con distintas formulaciones, en las categorías de búsqueda que encajan (artículos, noticias, patentes, informes de empresas, conjuntos de datos), con más resultados cuando abarca un tema de forma amplia.
3. Lee las fuentes que importan en lugar de responder a partir de fragmentos, y prefiere las primarias y de autoridad: artículos y datos originales, sitios oficiales, expertos y medios reconocidos. Anota la fecha de cada fuente y dice qué tan actual es la respuesta cuando los hechos cambian con el tiempo.
4. Cuando las fuentes no coinciden, lo dice y las pondera por calidad y actualidad, y distingue lo que está establecido, lo que se discute y lo que se desconoce.
5. Cita mientras escribe: un marcador numerado después de cada afirmación, como [1], y las fuentes al final con título, autor o editor, fecha y enlace. Nunca inventa una fuente, una cita, un número ni un enlace, y lo dice cuando no pudo verificar algo.
6. Empieza por los hallazgos: la respuesta en una línea y los pocos puntos que importan, luego el detalle, y después lo que sigue siendo incierto.
7. Muestra lo que tiene una forma propia en lugar de enterrarlo en párrafos: afirmaciones contrastadas con la evidencia como una verificación de datos, opciones o estudios lado a lado, cómo se desarrolló algo en una línea de tiempo, las cifras clave, artículos que vale la pena leer, y cómo se conectan personas, ideas u organizaciones en un grafo de red.
8. Un informe largo también se guarda en los archivos del proyecto como un documento que puedes leer, comentar y exportar, o como un archivo Markdown en la carpeta de la sesión cuando quieres un archivo.

Para una pregunta grande que requiere muchas búsquedas, consulta la investigación profunda en [Investigación profunda, segundas opiniones y varios agentes](/guide/research).

### Redactor

“Redacta, edita y pule tus textos”: correos, cartas, publicaciones, ensayos, informes, relatos y discursos.

- Antes de un texto largo, se asegura de la audiencia, el propósito, el tono y la extensión. Pregunta brevemente cuando alguno no está claro y es importante (en un formulario cuando son varios); si no, expone sus suposiciones en una línea y escribe.
- Escribe con claridad y precisión: palabras concretas, la idea principal al principio, oraciones variadas, sin relleno ni clichés.
- Imita la voz que pides, o la tuya cuando compartes textos anteriores.
- Cuando edita tu texto, conserva tu significado y tu voz: corrige lo que está mal, ajusta lo que está flojo, deja lo que funciona. Muestra las ediciones para que puedas seguirlas: tu texto con cada cambio marcado y explicado cuando quieres comentarios, o lo que cambió entre las versiones cuando se trata de una reescritura, y después el texto limpio.
- Entrega piezas cortas listas para usar: un correo en versiones entre las que puedes alternar, abierto en tu app de correo con todo rellenado; publicaciones, cada una comprobada contra el límite de longitud de su plataforma; una referencia en el estilo que necesites.
- Cuando una elección importa (un asunto, un título, un comienzo, un nombre), ofrece de dos a cuatro opciones, cada una con una nota, para que elijas.
- Todo lo que supere unos pocos párrafos se guarda como un documento (en los archivos del proyecto), donde puedes editarlo, comentarlo y exportarlo, y lo avisa; crea un archivo en la carpeta de la sesión (Markdown, salvo que quieras otro formato) cuando pides un archivo.

### Programador

“Crea, corrige y explica software.” Programador es un ingeniero de software que trabaja en tu proyecto, así que, a diferencia de los demás agentes integrados, trabaja en la carpeta que eliges en la página de inicio, no en una carpeta de tarea nueva.

- Lee el código que rodea un cambio antes de hacerlo, y sigue las convenciones y las herramientas del proyecto.
- Limita los cambios a lo que pediste, y menciona otros problemas que nota en lugar de corregirlos sin que se lo pidas.
- Después de cambiar código, ejecuta las pruebas, la compilación o el linter del proyecto cuando los tiene, y corrige lo que falla.
- Si pareces nuevo en la programación, explica lo que hizo y cómo ejecutarlo, con palabras sencillas: comandos para que ejecutes, cada uno con un botón de copiar y lo que hace, y un fragmento que puedes probar en un área de pruebas.
- Cuando explica código en lugar de cambiarlo, muestra lo que tiene una forma propia en lugar de un muro de texto: un error con sus causas y soluciones probables, una ejecución de pruebas, los archivos de un proyecto como un árbol, un endpoint, enfoques para sopesar lado a lado, y un diagrama para un flujo o una arquitectura.
- Termina con un resumen breve: qué cambió, cómo lo comprobó y qué queda por hacer.

### Tutor

“Enseña paso a paso y comprueba que sigues el hilo.” El objetivo es que entiendas y puedas hacerlo por ti mismo, no solo que obtengas una respuesta.

- Si tu nivel o tu objetivo no están claros, primero hace una pregunta rápida, con las respuestas probables como botones para hacer clic (soy nuevo en el tema, conozco lo básico, estoy repasando para un examen).
- Enseña un paso a la vez, con palabras sencillas, con un ejemplo concreto para cada idea nueva, de lo simple a lo más difícil.
- Hace que cada paso sea algo para ver o probar, no solo para leer: un diagrama, una imagen, una tarjeta de fórmula, la gráfica de una función con controles deslizantes, un mapa de cómo se conectan las ideas, una explicación en la que puedes cambiar de profundidad, un ejemplo resuelto que se revela un paso a la vez, código que puedes ejecutar y cambiar, una pequeña simulación; las matemáticas dibujadas como en un libro de texto.
- Después de cada paso, comprueba con algo que respondes en el mismo lugar, y espera antes de seguir: un cuestionario breve, problemas de práctica que respondes con tus propias palabras o números (comprobados sobre la marcha, con pistas y la solución después de un intento), completar espacios en blanco, relacionar u ordenar elementos. Lee la puntuación y las respuestas que envías.
- Cuando respondes, dice qué estuvo bien, corrige con amabilidad y precisión lo que no, y se adapta: otra explicación o ejemplo cuando te atascas, un paso más difícil cuando vas adelantado.
- Con tareas o ejercicios, te guía con pistas y preguntas, y da la solución completa solo cuando la pides o sigues atascado después de intentarlo.
- Para un idioma, te da palabras para escuchar y practicar, formas verbales, conversaciones, y tus propias oraciones corregidas con cada error marcado y explicado.
- Cierra un tema con un breve repaso y tarjetas de estudio de lo que conviene recordar, y ofrece qué aprender a continuación como botones para tocar. Para un curso más largo, mantiene una hoja de ruta de los temas y de cuánto has avanzado.

### Planificador

“Planifica viajes, eventos y proyectos”, y también mudanzas y rutinas.

- Primero define lo que da forma al plan: el objetivo, las fechas y los plazos, el presupuesto, las personas involucradas y los límites estrictos. Pregunta por los pocos que faltan y que importan (en un formulario cuando son varios), y supone valores razonables para el resto, diciendo qué supuso.
- Comprueba en la web los datos de los que depende el plan (horarios de apertura, tiempos de viaje, precios, disponibilidad, normas, el clima), y avisa cuando algo no se pudo comprobar o puede cambiar.
- Concreta el plan: horas, lugares, costos y quién hace qué, margen para lo que se retrasa, y qué reservar o decidir primero.
- Muestra el plan para que puedas seguirlo de un vistazo, en las UI de respuesta hechas para planes: un viaje día por día con sus lugares en un mapa, el horario de un día, fechas en un calendario o una cuenta regresiva, un proyecto en fases o por semanas, lo que hay que reservar o empacar como una lista de verificación, el pronóstico, y los costos como un presupuesto con un total.
- Cuando una elección importa, da dos o tres opciones lado a lado con sus ventajas e inconvenientes (vuelos y alojamientos para un viaje).
- Guarda el plan en los archivos del proyecto, donde puedes cambiarlo: un documento, y una hoja de cálculo para presupuestos y calendarios con totales. Ofrece ajustarlo, con los cambios probables como botones para tocar. Crea archivos en la carpeta de la sesión en su lugar cuando pides archivos.

### Analista

“Da sentido a datos y hojas de cálculo, con gráficos”: hojas de cálculo, archivos CSV, exportaciones y números.

- Examina los datos antes de analizarlos (sus columnas, tamaño, tipos y huecos) e informa de problemas como valores faltantes, duplicados o formatos extraños antes de sacar conclusiones.
- Calcula con código (un script breve de Python o JavaScript, o una fórmula), nunca estimando a ojo, y guarda los scripts en la carpeta de la sesión para que el trabajo pueda repetirse.
- Responde primero la pregunta, con palabras sencillas y las cifras clave, y luego muestra cómo las obtuvo. Expone los supuestos y los límites, y no afirma causas que los datos no pueden mostrar.
- Muestra los resultados en las UI de respuesta hechas para números: las cifras clave, un gráfico (el más simple que encaje: barras para comparar, líneas para el tiempo), una tabla que puedes ordenar y filtrar, cómo se distribuyen los valores, partes de un todo, cómo cambió un total, flujos, valores en dos dimensiones como un mapa de calor, números en lugares de un mapa, y una calculadora cuando querrás probar otros valores. Una cifra que ninguna de ellas dibuja va en una figura interactiva en la respuesta, o en una página cuando son varias; los ejes y las unidades están rotulados, y se lee bien en un teléfono.
- Guarda los datos limpios y los resultados como archivos (CSV, o XLSX cuando lo pides) cuando querrás conservarlos. Una tabla que vas a consultar y modificar se guarda como una hoja de cálculo con sus fórmulas, y un panel de control al que volverás como una página.

### Creador de apps

“Crea tus propias apps: un formulario, pasos, datos y una pantalla” (consulta [Apps](/guide/apps)).

- Define qué entra, qué sale y cómo es una buena ejecución, pregunta solo lo que cambia el diseño, y dice qué supuso.
- Construye la app con herramientas propias, eligiendo el paso más barato para cada parte (una herramienta, una respuesta rápida de un modelo, una regla, código) y un agente donde hace falta criterio.
- Le da a la app de dos a cuatro ejemplos con comprobaciones, los prueba y corrige lo que falla antes de entregarla, diciendo cuánto cuesta una ejecución y cuánto tarda.
- Cuando cambias la app tú mismo, se basa en tu cambio.
- Usa la habilidad app-builder.

## Crear un agente

### Di qué debe hacer

1. En la [página Agentes](/agents), haz clic en **Nueva** en la parte superior de la columna y luego en **Nuevo agente** (en un teléfono, **Nuevo agente** en la parte superior de la página). Se abre la ventana **Nuevo agente** en dos pasos, que aparecen arriba como **1 Describir** y **2 Configuración**.
2. En “¿Qué debe hacer tu agente?”, dilo con tus propias palabras y, si quieres que trabaje por sí solo, indica cuándo: “Cada viernes por la tarde, escribe mi informe semanal de avances a partir de mis commits y mis notas, y déjame revisarlo antes de enviarlo.” En **O empieza desde una idea**, **Resumen de artículos**, **Informe semanal**, **Revisor de cambios** y **Traductor** ponen una frase en el cuadro cuando haces clic en uno, para que la cambies.
3. Haz clic en **Redactar mi agente** (o pulsa Ctrl+Enter, ⌘+Enter en una Mac). El modelo auxiliar (Configuración → Modelos → Modelo auxiliar) redacta el agente: su nombre, icono, línea, instrucciones, lo que puede usar, el nivel con el que piensa y una programación si la pediste. La ventana pasa a **Configuración**.
4. Lee el borrador y cambia lo que quieras (consulta [Toda la configuración](#all-settings)). **Atrás** vuelve a **Describir**: lo que escribiste se conserva, y si redactas de nuevo se reemplaza el borrador.
5. Haz clic en **Crear agente**. La app dice “*nombre* está listo” y abre su página; su programación, si la tiene, es una tarea programada que se ejecuta como él.

Si cierras la ventana (✕, Esc o un clic fuera de ella) después de haber escrito o cambiado algo, primero pregunta **¿Descartar este agente?**. La pestaña **Agentes** de un proyecto tiene **Nuevo agente aquí**, que crea uno que trabaja en ese proyecto y, mientras no tenga ninguno, **Crear uno para este proyecto**, que crea uno a partir de lo que el proyecto dice de sí mismo o de la plantilla para su tipo; un proyecto nuevo puede recibir uno al crearse (consulta [Proyectos](/guide/projects)).

### Configúralo tú mismo

**Configurarlo yo**, debajo del cuadro, omite el borrador y abre **Configuración** sin nada rellenado salvo el icono (consulta [Toda la configuración](#all-settings)). Puedes tener hasta 200 agentes propios.

### Toda la configuración

**Configuración** es el segundo paso de **Nuevo agente**, y lo que abre **Toda la configuración** en la página de un agente para ese agente, sin el paso **Describir**. En un teléfono la ventana ocupa toda la pantalla. Arriba están el icono (haz clic en él para elegir uno de 30: un telescopio, una pluma, un gorro de chef, un avión, una cartera, etc.) y el nombre, de hasta 60 caracteres, como “Contador” o “Agente de viajes”. Solo el nombre es obligatorio.

En una computadora, una columna a la izquierda enumera siete secciones, cada una con su valor actual debajo del nombre, de modo que todo el agente se ve de un vistazo; haz clic en una para ver su configuración al lado. Cuando una sección es más larga que la ventana, un botón **Más abajo** indica que hay más contenido. En un teléfono, **Configuración** enumera las secciones con el valor de cada una; toca una para abrirla, y **‹ Toda la configuración** vuelve atrás.

- **Unos**:
  - **Una línea sobre él**: hasta 160 caracteres, se muestra en su tarjeta y en el menú de la página de inicio, como “Mantiene en orden las cuentas del hogar”.
  - **Instrucciones**: quién es y cómo trabaja, hasta 20.000 caracteres. Las lee al comienzo de cada sesión. Escríbelas como las de los agentes integrados: “Eres el contador del usuario durante esta sesión”, y luego unas líneas sobre cómo trabaja (“Pide los estados de cuenta que necesites”, “Guarda los totales en una hoja de cálculo en la carpeta de trabajo”).
- **Dónde y cuándo**:
  - **Dónde trabaja**: **En todas partes**, o **Solo en algunos proyectos** con un interruptor para cada proyecto (consulta [Dónde trabaja un agente](#where-an-agent-works)).
  - **Cuándo trabaja**: para un agente nuevo, **Cuando se le pide**, **A una hora** (días y una hora) o **Cada…** (un intervalo), y **Cada ejecución empieza con**, el mensaje con el que empieza cada ejecución programada. Para un agente que ya tienes, aquí aparecen sus programaciones; las añades y cambias en su página, en **Programaciones** (consulta [Cuándo trabaja un agente: programaciones](#when-an-agent-works-schedules)).
  - **Mantiene una sola conversación, con una bandeja de entrada** (consulta [Un agente con una conversación propia](#an-agent-with-a-conversation-of-its-own)).
  - **Dónde empiezan sus sesiones**, cuando no hay ninguna carpeta elegida en la página de inicio:
    - **Una carpeta de tarea nueva** (la opción predeterminada): cada sesión recibe una carpeta nueva propia (consulta [Carpetas de tareas](#task-folders-where-a-task-without-a-folder-works)).
    - **La carpeta de la página de inicio**: las sesiones trabajan en la carpeta que se muestra allí, como hace Programador. Elige esta opción para los agentes que trabajan en un proyecto.
- **Modelo**:
  - **Piensa con**: **Automático**, **Rápido**, **Estándar**, **Mejor** o **Máximo**, cada uno con una línea sobre para qué sirve (consulta [Con qué piensa un agente: niveles](#what-an-agent-thinks-with-tiers)).
  - **Se ejecuta en**: el programa que sugiere, que se elige junto con él en la página de inicio.
    - **Cualquier agente** (la opción predeterminada) conserva el programa elegido en la página de inicio.
    - **Claude Code**, **Codex**, **Custom** (“Cualquier modelo”), o cualquier agente que hayas añadido en [Configuración → Agentes → Más agentes](/settings?s=agents).
    - Cuando eliges un programa, junto a él aparece un menú de modelos con los de ese programa (en los programas que ofrecen elección); si no lo tocas, se usa el modelo predeterminado del programa. Un nivel de los de arriba elige el modelo en su lugar.
  - **Modo de permisos**: cuándo te pregunta antes.
    - **Según lo elegido** (la opción predeterminada): conserva el modo elegido en la página de inicio.
    - **Preguntar**: pregunta antes de cambiar archivos y ejecutar comandos.
    - **Aceptar ediciones**: cambia archivos libremente y pregunta antes de ejecutar comandos.
    - **Acceso total**: nunca pregunta.
    - **Plan**: solo lee y planifica, hasta que lo apruebes.

    Claude Code, Codex y Custom tienen cada uno un modo equivalente a estos. Los demás agentes (Gemini CLI, OpenCode…) conservan los suyos.
  - **Subagentes que inicia**: **Cualquiera**, o nunca por encima de un nivel.
  - **Subir de nivel cuando falla una comprobación**: activado a menos que lo desactives.
- **Herramientas**: **Qué puede usar** (siete interruptores, todos activados en un agente nuevo, con **Activar todo** cuando algunos están desactivados; consulta más abajo), **Habilidades preferidas** (consulta más abajo) y **Apps conectadas**, que aparece cuando tienes cuentas conectadas (consulta más abajo).
- **Equipo**: **Otros agentes pueden delegarle trabajo**, y **Puede delegar trabajo en**, con un interruptor para cada otro agente (consulta [Agentes que delegan trabajo en otros agentes](#agents-that-hand-work-to-other-agents)).
- **Resultados**: lo que entrega: los campos de cada resultado y adónde va cada uno (consulta [Lo que entrega un agente](#what-an-agent-hands-back)).
- **Presupuesto**: **Sin límite**, o **Un límite mensual** en dólares; para un agente que ya tienes, indica cuánto gastó este mes (consulta [Un presupuesto mensual](#a-monthly-budget)).

**Crear agente** crea un agente nuevo. Para uno que ya tienes, **Guardar** conserva tus cambios (“*nombre* está guardado”) y **Cancelar** cierra la ventana sin guardar; si la cierras después de un cambio, pregunta **¿Descartar tus cambios?**.

### Qué puede usar

Cada interruptor abarca un tipo de herramienta:

- **Leer archivos**: abrir, listar y buscar archivos y carpetas.
- **Crear y cambiar archivos**: escribir archivos nuevos y editar los existentes.
- **Ejecutar comandos**: programas y scripts en esta computadora.
- **Usar la web**: buscar y leer páginas web.
- **Usar un navegador**: abrir sitios web, hacer clic y rellenar formularios en un navegador real.
- **Usar la computadora**: ver la pantalla y usar el mouse y el teclado en cualquier app (las apps de escritorio, con el uso de la computadora activado).
- **Otras herramientas**: servidores MCP (servidores de herramientas) y complementos configurados para los agentes.

Lo que ocurre con las que desactivas depende del programa:

- **Claude Code y Custom** tienen esas herramientas desactivadas. Con **Otras herramientas** desactivado, Claude Code solo recibe las herramientas propias de la app y tus cuentas conectadas, ninguno de los servidores MCP que configuraste tú.
- A **Codex** se le indica que no las use. Con **Usar la web** desactivado, también se desactiva su propia búsqueda web. Con **Ejecutar comandos** desactivado pero **Leer archivos** activado, a Codex se le indica que use su shell solo para leer y buscar archivos, ya que lee los archivos a través de la shell.
- **Claude Code, Codex y Custom** también tienen desactivadas las herramientas del navegador y de la computadora cuando **Usar un navegador** o **Usar la computadora** está desactivado.
- A los **demás agentes** se les indica que no las usen.

Las herramientas propias de la app (páginas, memoria y similares) siguen activadas, salvo las que dependen de un interruptor que desactivaste: con **Usar la web** desactivado, también desaparecen la búsqueda web y la lectura de páginas de la app; con **Usar un navegador** desactivado, desaparece su navegador; con **Usar la computadora** desactivado, desaparecen sus herramientas de pantalla, mouse y teclado; con **Leer archivos** desactivado, desaparece su lector de documentos. Las cuentas conectadas no son “otras herramientas”: las deciden las **Apps conectadas** que aparecen más abajo. Cuando una tarea necesita algo que el agente no puede usar, se le indica que lo diga en lugar de buscar una forma de evitarlo.

### Habilidades preferidas

En **Herramientas**, escribe el nombre de una habilidad y pulsa Enter (o una coma) para añadirla. El campo sugiere las habilidades propias de Claude Code y Codex, tal como las enumera [Configuración → Agentes → Habilidades](/settings?s=skills) para la carpeta abierta en Archivos; también puedes escribir el nombre de una habilidad de la biblioteca de habilidades, como research. Haz clic en la papelera junto a un nombre para quitarlo. Hasta 30. Cuando una de estas habilidades encaja con la tarea, el agente la carga antes de empezar y la sigue. Consulta [Habilidades](/guide/skills) para ver las habilidades que vienen con la app y cómo añadir más.

### Conexiones

**Apps conectadas**, en **Herramientas**, aparece solo cuando tienes cuentas conectadas (configuradas en [Apps → Apps conectadas](/apps/connected)). Cada una tiene un interruptor: activado significa que está activada en las sesiones de este agente. Una que ya está activada para todas las sesiones dice “Activada en todas las sesiones”. Si una cuenta que el agente menciona ya no está conectada, aparece con “No conectada” debajo de su nombre y un botón para quitarla. Consulta [Apps conectadas, claves y herramientas](/guide/connections).

## Cambiar un agente

En la página de un agente, su configuración se lee como frases: lo que hace, “Trabaja *en todas partes*, *cada día laborable a las 09:00*, y piensa con *Rápido*. Puede *leer archivos y usar la web*, y no pide ayuda a *otros agentes*. Entrega *su respuesta*. Gasta como máximo *$3* al mes.” Cada parte subrayada abre lo que la cambia, y el cambio se guarda al instante:

- **Dónde trabaja**: **En todas partes**, o un interruptor para cada proyecto.
- **Cuándo trabaja**: sus programaciones, cada una con su editor, **Añadir una programación** y **Mantiene una sola conversación, con una bandeja de entrada**.
- **Con qué piensa**: Automático o un nivel, **Subagentes que inicia, nunca por encima de** y **Subir de nivel cuando falla una comprobación**.
- **Qué puede usar**: los siete interruptores.
- **A quién pide ayuda**: un interruptor para cada otro agente y **Otros agentes pueden delegarle trabajo**.
- **Lo que entrega**: sus campos y adónde va cada resultado.
- **Su presupuesto mensual**: dólares al mes, o ninguno.

**Toda la configuración** tiene el resto (consulta [Toda la configuración](#all-settings)). Cada cambio se conserva como una versión, así que puedes volver atrás (consulta [Versiones: volver a una anterior](#versions-go-back-to-an-earlier-one)). Las sesiones que empieces a partir de entonces usan la nueva versión, y también las sesiones con él que ya están en marcha, a partir de tu próximo mensaje: Custom la lee antes de cada turno, y Claude Code y Codex empiezan de nuevo cuando quedan libres (la conversación continúa).

## Versiones: volver a una anterior

Cada guardado que cambia lo que es uno de tus agentes conserva una versión: un cambio en su página, en **Toda la configuración**, desde la línea de comandos, por un agente al que se lo pediste (a través de la API de la app), y el borrador o archivo que lo creó. Abre su página y luego **Más** (⋯) → **Versiones**:

- La lista muestra cada versión, la más reciente primero: **v1**, **v2**…, qué cambió en unas frases (“Ahora piensa con Mejor (antes era Rápido). Su presupuesto mensual ahora es de $5 (antes era de $3).”) o lo que dijo que hizo el agente que lo cambió, quién la guardó (**Tú**, **Un agente**, **Redactado**, **Instalada**, **Importado**) y cuándo; **Ahora** marca la actual. Una versión con la que se probaron sus ejemplos indica cuántos pasaron (“Ejemplos: 2 de 3 superados”), para que veas si un cambio lo mejoró.
- Haz clic en una para compararla con la anterior, o elige dos cualesquiera en **Comparar** … **con** …: qué cambió entre ellas, en frases, y sus **Instrucciones** una al lado de la otra, con las líneas eliminadas en rojo y las añadidas en verde.
- **Recuperar** convierte la versión elegida otra vez en la actual. Se guarda como una versión nueva que dice “Se recuperó la versión 3.”, de modo que la que tenía sigue en la lista, para poder volver a ella. Los agentes a los que delegaba trabajo y los proyectos que desde entonces ya no existen se omiten.

Un agente conserva sus últimas 50 versiones; se van cuando lo eliminas. Sus ejemplos no forman parte de una versión: al recuperar una versión antigua se conservan los ejemplos que tiene ahora. Un agente creado antes de que se conservaran versiones recibe como primera versión el estado en que estaba (“Antes de que se conservaran versiones”) en su primer cambio.

## Ejemplos que lo comprueban

Los ejemplos te permiten comprobar que uno de tus agentes sigue haciendo su trabajo después de cambiarlo, igual que los ejemplos de una app. Cada uno es un mensaje con el que probarlo y lo que debe cumplir su respuesta. En la página del agente, en **Ejemplos**:

1. **Añadir un ejemplo**: ponle un nombre si quieres, escribe **El mensaje con el que probarlo** como se lo escribirías al agente y añade una comprobación por cada cosa que hace una buena respuesta. Una comprobación es una frase sencilla, como “Nombra las dos pull requests” o “Dice claramente cuándo no encontró nada nuevo”, con la que el modelo auxiliar lee su respuesta; o una regla sobre lo que entregó, como la comprobación de una app: `{{reply}} contains Lisbon` o, para un agente que devuelve resultados, `{{result.count}} > 0` en uno de sus campos. **Guardar el ejemplo**. Un agente tiene hasta 10 ejemplos, cada uno con hasta 8 comprobaciones.
2. **Probar los ejemplos** (o el botón del matraz junto a uno, solo para ese) primero indica lo que hará y lo que costará: cuántas sesiones empieza como el agente y en qué nivel, cuánto costará aproximadamente (según lo que costaron sus últimas pruebas, o lo que costaron sus sesiones este mes; nada en que basarse antes de su primera prueba) y qué queda de su presupuesto mensual, al que cuentan las pruebas. Pulsa **Probarlos**.
3. Cada ejemplo se ejecuta en una sesión propia, iniciada como el agente en su nivel, en una carpeta vacía propia (se elimina cuando se guarda su resultado; su conversación se conserva) y fuera de tu lista de sesiones. No envía nada: lo que enviaría a través de tus apps conectadas se guarda como lo que habría enviado, y lo que devuelve no va a ninguna parte salvo a la prueba. Cuando termina, se leen sus comprobaciones. Un agente con campos que devolver también tiene que devolver un resultado.

Cada ejemplo muestra después cómo fue su última prueba: **Correcto**, cuántas comprobaciones fallaron, **No terminó** o **Esperándote** (su sesión te pregunta algo: ábrela), con cuándo fue y cuánto costó. Haz clic en uno para ver su mensaje, cada comprobación con lo que se vio (✓ o ✗), lo que devolvió, su respuesta y **Abrir su sesión**. Cuando cambias el agente después de la última prueba de sus ejemplos, la página lo indica con **Probarlos de nuevo**. Los ejemplos nunca se ejecutan solos.

## Dónde trabaja un agente

Un agente trabaja **En todas partes** a menos que elijas proyectos para él. Uno que trabaja en algunos proyectos:

- solo se ofrece ahí: el menú de agentes de la página de inicio lo muestra cuando se elige uno de sus proyectos, y otros agentes solo pueden delegarle trabajo en sesiones de sus proyectos;
- trabaja en la carpeta del proyecto cuando trabaja en un solo proyecto, con el conocimiento, la memoria, las pautas y las habilidades del proyecto;
- aparece en la pestaña **Agentes** de cada uno de sus proyectos (consulta [Proyectos](/guide/projects)).

Si eliges en la página de inicio un proyecto donde el agente elegido no trabaja, la página de inicio elige en su lugar el agente propio del proyecto o, si no lo hay, General.

## Cuándo trabaja un agente: programaciones

Un agente trabaja cuando empiezas una sesión como él, cuando otro agente le delega trabajo y según sus programaciones. Una programación es una tarea programada que se ejecuta como el agente: a una hora, cada cierto tiempo, una sola vez, cuando cambia una página o un feed, o cuando otro servicio llama a su webhook (consulta [Tareas programadas](/guide/tasks)).

- En la página del agente, **Añadir una programación** abre el editor de tareas con el agente elegido y una hora rellenada: ponle un nombre y el mensaje con el que empieza cada ejecución, y guarda.
- Haz clic en una programación de la lista para cambiarla, pausarla o ejecutarla ahora.
- Una programación redactada con un agente nuevo se crea con él.

Todas las programaciones están también en [Configuración → Agentes → Tareas programadas](/settings?s=tasks), junto con las demás; la opción **Agente** de una tarea es el agente como el que trabajan sus ejecuciones. El lugar [**Programaciones**](/agents/schedules) de la columna de la página Agentes (una pestaña en la parte superior en un teléfono) las muestra en una semana con todas las demás tareas: lo que se ejecutó, cómo fue y lo que se ejecutará a continuación, con **Agente ·** y el nombre del agente en cada una de su lista; su lápiz abre la página del agente.

## Con qué piensa un agente: niveles

Los niveles eligen un modelo según el trabajo en lugar de por su nombre:

- **Rápido**: el más económico, para trabajos pequeños y muy claros cuyo resultado se puede comprobar, como una edición concreta, extraer datos, ordenar, dar formato y resúmenes cortos.
- **Estándar**: tareas claras de tamaño medio: un cambio bien especificado, pruebas, investigación sobre una pregunta definida, un borrador a partir de un esquema.
- **Mejor**: el agente principal de una sesión. Averigua lo que se pide, planifica, dirige a los subagentes y comprueba su trabajo.
- **Máximo**: el más potente, para los problemas más difíciles: errores tercos, demostraciones, diseños con muchas restricciones.

Un agente con un nivel asignado empieza con el modelo de ese nivel para el programa en el que se ejecuta, salvo que se haya elegido un modelo para la sesión; si está en **Automático** (el valor predeterminado), usa el modelo elegido en el lugar donde empieza: la página de inicio, la tarea programada o el agente que le delega trabajo. En la página de inicio, esa elección puede ser también **Automático**: Mejor, subiendo a Máximo si el problema resulta demasiado difícil (consulta [Niveles: un modelo para cada tipo de trabajo](/guide/agents-models#tiers-a-model-for-each-kind-of-job)).

[Configuración → Agentes → Modelos → Niveles](/settings?s=models&find=Tiers) explica qué significa cada nivel, en una tabla con una columna por programa: para **Claude Code** un modelo (Haiku, Sonnet, Opus y el más reciente Fable para empezar) y un esfuerzo; para **Codex** un modelo y un esfuerzo (Luna, Terra, Sol y Astra para empezar; en un plan sin alguno de ellos, el más cercano que ofrezca, con más esfuerzo para el nivel superior cuando dos comparten modelo); para **Custom** uno de tus modelos Custom, o ninguno, lo que mantiene el modelo que eligió la sesión. Un nivel que no toques sigue el modelo más reciente de ese tipo de su programa. **Volver a los valores predeterminados** los restablece.

**Subagentes que inicia, nunca por encima de** limita los niveles de los subagentes de Hydor que inicia un agente: si se pide uno superior, el subagente recibe este. Un subagente tampoco piensa nunca con un nivel superior al de su líder. Un modelo indicado expresamente se usa tal como se indica.

**Subir de nivel cuando falla una comprobación** (activado salvo que lo desactives): un subagente de Hydor que el agente inicia en un nivel, cuya respuesta no supera una comprobación rápida (el modelo auxiliar lee su encargo y su respuesta) o que se detiene con un error, se ejecuta de nuevo un nivel más arriba, hasta Mejor y nunca por encima del más alto que permita el agente. Solo se comprueba su respuesta al encargo: una respuesta posterior, a un mensaje de su líder o tuyo, nunca hace repetir todo el trabajo. El líder recibe aviso de que lo hizo y por qué, y al nuevo subagente se le dice por qué el primero se quedó corto. Una ejecución programada del agente que falla en su nivel también se ejecuta de nuevo un nivel más arriba, hasta Mejor. Un líder también puede subir de nivel a un subagente por sí mismo cuando considera que el resultado no es suficientemente bueno.

## Agentes que delegan trabajo en otros agentes

Un agente puede delegar una parte de su trabajo en una sesión nueva que trabaja en ella a su lado: un subagente de Hydor (consulta [Investigación profunda, segundas opiniones y varios agentes](/guide/research)). Puede iniciar:

- **un subagente sencillo**, con un nivel para su parte: Rápido para un trabajo pequeño y muy claro, Estándar para una tarea clara de tamaño medio (lo que recibe un subagente cuando no se pide ninguno), Mejor para una parte difícil que se sostiene por sí sola;
- **uno de tus agentes**, por su nombre: trabaja con sus propias instrucciones, herramientas, conexiones, modo y nivel, y su respuesta vuelve al agente que lo pidió.

Quién puede delegar trabajo a quién:

- Una sesión que trabaja como un agente integrado (o ninguno) puede delegar trabajo a cualquiera de tus agentes que trabaje ahí.
- Un agente tuyo solo puede delegar trabajo a los agentes que figuran en su **Equipo**.
- Un agente con **Otros agentes pueden delegarle trabajo** desactivado no acepta trabajo de ninguno.
- Un agente indicado por su nombre trabaja solo en sus propios proyectos, y nunca con un modo de permisos más libre que el de la sesión que lo pidió.

En la conversación, los subagentes de Hydor que inició un turno se muestran juntos como una tarjeta bajo ese turno, con una línea para cada uno, con su título, el agente como el que trabaja (o “subagente de Hydor”), su nivel, programa y modelo, cómo va y lo que costó y, cuando subió de nivel, desde qué nivel y por qué (apunta a la línea con el cursor); haz clic en una línea para abrir su conversación. Consulta [Subagentes](/guide/sessions#subagents). La pestaña **Agentes** de un proyecto muestra qué agentes suyos delegan trabajo en cuáles.

Un agente que mantiene una conversación propia recibe el trabajo en su bandeja de entrada en lugar de en una sesión nueva, y su respuesta vuelve cuando llega a ello (consulta [Un agente con una conversación propia](#an-agent-with-a-conversation-of-its-own)).

## Un presupuesto mensual

El límite mensual de un agente (**Presupuesto** en **Toda la configuración**, o su frase en su página) limita lo que gastan sus sesiones en un mes (desde el día uno del mes, en la hora de esta computadora):

- Cada sesión iniciada como él recibe un límite de gasto igual a lo que queda del presupuesto (el menor, cuando la sesión tiene un límite propio).
- Lo que gastan sus subagentes sencillos cuenta para él; el trabajo de un agente indicado por su nombre cuenta para el presupuesto propio de ese agente.
- Cuando se agota el presupuesto, no se inicia ninguna sesión como él hasta el mes siguiente: una ejecución programada explica por qué no pudo empezar, y su tarjeta dice **Presupuesto agotado**.

Lo que gasta cada sesión se calcula como en [Uso y costos](/guide/usage). Déjalo en **Sin límite** para no tener ninguno.

## Lo que entrega un agente

Si no configuras nada, un agente entrega su respuesta en la conversación. Dale campos y destinos en **Resultados** (en **Toda la configuración**, o desde su frase "Entrega *su respuesta*"), y al final de cada tarea entregará un resultado con esos campos, revisado antes de que vaya a ningún sitio:

- **Campos de cada resultado**: un nombre y un tipo para cada uno (texto, texto largo, número, sí o no, fecha, enlace, lista o tabla con sus columnas), y si es obligatorio. El agente los rellena con su herramienta hand_back; un resultado que no encaja vuelve a él con lo que hay que corregir.
- **Adónde va cada resultado**, además de la conversación:
  - **Una página guardada**: **La misma página, actualizada** (la que reciben los agentes nuevos): su primera ejecución crea una página con el nombre del agente, en su proyecto cuando trabaja en uno, y cada ejecución posterior pone una versión nueva de esa página, de modo que siempre abres la última y las anteriores quedan en sus versiones. Una página a la que le cambies el nombre conserva su nombre. Elige **Una página nueva en cada ejecución** si prefieres una página propia cada vez, con el nombre del agente y el día (los agentes creados antes de esta opción siguen funcionando así).
  - **Una fila en una hoja de cálculo**: cada ejecución añade una fila a la misma hoja de cálculo: una columna **Fecha** con el momento en que se ejecutó y después una columna por cada campo, en el orden de los campos. Los números entran como números, las fechas como fechas y los enlaces como enlaces, así que los totales, las fórmulas y los gráficos funcionan con ellos; una lista o una tabla entra en una sola celda como texto legible ("leche; huevos"). Deja la hoja de cálculo como **Una nueva** y la primera ejecución creará una con el nombre del agente, o elige una de las tuyas y la pestaña donde va (si la pestaña no existe, se añade). Consulta [Una fila en una hoja de cálculo](#a-row-in-a-spreadsheet).
  - **Un correo**: el resultado como correo para las personas que indiques (una dirección o más), con un asunto (`{date}`, `{time}` y `{agent}` se rellenan; si lo dejas vacío, se usa el nombre del agente y el día), desde una de tus cuentas de correo conectadas (**De**; la primera si no eliges ninguna; consulta [Apps conectadas, claves y herramientas](/guide/connections#connect-your-email)). Se ve bien en cualquier programa de correo, con cada campo bajo su nombre y las tablas como tablas. Como las personas las eliges tú aquí mismo, se envía en cuanto cada resultado está listo, sin esperar en la Bandeja de salida.
  - **Una notificación**, con la primera línea del resultado;
  - **Un archivo en la carpeta donde trabaja**, como `reports/{date}.md`: `{date}`, `{time}` y `{agent}` se rellenan, un nombre que termina en `.json` recibe los campos como JSON y cualquier otro como Markdown, y una ruta nunca sale de la carpeta;
  - **Un webhook**: el resultado como JSON en un POST a una dirección https, firmado con una clave de la Bóveda cuando indicas una, solo para los hosts que esa clave tiene permitidos (consulta [Apps conectadas, claves y herramientas](/guide/connections)).

Lo que escribes en estos cuadros cuenta cuando sales del cuadro o pulsas Enter. La configuración muestra la página y la hoja de cálculo que creó su primera ejecución, con un enlace para abrirlas.

### Una fila en una hoja de cálculo

Las columnas se encuentran por sus encabezados en la primera fila de la tabla, así que la hoja de cálculo sigue siendo tuya para organizarla: mueve columnas, cámbiales el formato (una columna que formateas en euros sigue en euros) y añade columnas propias a su lado. Una fórmula en una columna propia (un total acumulado, por ejemplo) se extiende a cada fila nueva, como en la tabla de una hoja de cálculo, y un gráfico que lee las filas hasta ahora también incluye la nueva. Los totales debajo de la tabla estorban a las filas nuevas: ponlos en una columna aparte o en otra pestaña, sobre columnas completas (`=SUM(B:B)`). Cuando más adelante añades un campo al agente, recibe una columna nueva al final, y las anteriores se quedan donde están; un encabezado al que le cambies el nombre ya no coincide con su campo, que entonces recibe una columna nueva (ponle al campo el mismo nombre para mantenerlos juntos). La fila de cada ejecución es una versión nueva de la hoja de cálculo, como cualquier cambio, así que sus fórmulas, gráficos y comentarios se quedan como estaban.

### Su historial de resultados

La página del agente muestra **Lo que entregó** como una tabla: una fila por cada resultado, la más reciente primero, con el momento en que llegó, una columna por cada campo y adónde fue (**Fue a**: una marca por cada destino, en rojo donde no pudo llegar; apunta a una para ver qué pasó, haz clic en una página guardada para abrirla). Haz clic en una fila para ver el resultado completo, con cada campo íntegro, con **Abrir su sesión**. La tabla se desplaza, y **Mostrar anteriores** trae resultados más antiguos. Un agente conserva sus resultados durante un año, hasta 500 (un agente diario conserva un año entero; uno que se ejecuta cada hora, unas tres semanas); un campo demasiado largo para guardarse allí lo indica, y está completo en los destinos adonde fue. La página y la hoja de cálculo que rellena aparecen como enlaces sobre la tabla.

## Un agente con una conversación propia

La mayoría de los agentes empiezan una sesión nueva cada vez. Activa **Mantiene una sola conversación, con una bandeja de entrada** (en **Toda la configuración**, en **Dónde y cuándo**, o en la parte del "cuándo" de su frase), y el agente mantendrá en cambio una sola conversación propia, creada la primera vez que hace falta, en la carpeta de su proyecto cuando trabaja en un solo proyecto:

- Los mensajes para él esperan en su **Bandeja de entrada** y pasan a su conversación de uno en uno, cada uno cuando el anterior ya tiene su respuesta: lo que envías desde su página y lo que le pasan otros agentes.
- Sus ejecuciones programadas se publican en la misma conversación, esperando a que termine un turno en curso; cada una aparece en el historial de su programación, como cualquier ejecución.
- Cada respuesta vuelve a quien la envió: otro agente la recibe como un mensaje, y tú recibes una notificación por los tuyos.
- Recuerda lo que pasó antes, como cualquier conversación.
- Su presupuesto mensual se comprueba al entrar cada mensaje.

En su página, **Bandeja de entrada** lista los mensajes, cada uno con su estado (**Esperando su turno**, **Con él ahora**, **Respondida**, **Sin respuesta**) y su respuesta, con un cuadro para enviarle uno, y **Su conversación**, que la abre.

## Empezar una sesión como un agente

1. Abre la [página de inicio](/). Bajo el cuadro de mensaje, una fila muestra quién hace el trabajo: el programa, el modelo, la carpeta y el chip **Agente**, que nombra al agente elegido ahora.
2. Haz clic en **Agente**. En **Empezar como**, primero van los agentes integrados y después los tuyos en **Tuyos**: los que funcionan en todas partes y en el proyecto elegido.
   - En una computadora, los nombres están en una cuadrícula, de dos en dos por fila. Apunta a uno para ver su línea bajo la cuadrícula: su descripción y, cuando sugiere un programa, "Usa" seguido de ese programa y su modelo.
   - En un teléfono, el menú se abre como una hoja desde la parte inferior de la pantalla y lista cada agente con su línea.
3. Elige uno. Luego escribe tu tarea y pulsa Enter, o **Inicio**.

**Crear o cambiar agentes**, al final del menú, abre la [página de Agentes](/agents). **Empezar una sesión** en la página de un agente abre la página de inicio con ese agente elegido.

Lo que hace elegir un agente en la página de inicio:

- **Programa, modelo y permisos**: si el agente sugiere un programa, la página de inicio cambia a él, con el modelo de su nivel cuando piensa con uno, o si no el modelo del agente cuando indica alguno. Si tiene un modo de permisos, **Permisos** de la página de inicio (en **Opciones**) cambia al modo equivalente de ese programa. Aún puedes cambiar cualquiera de ellos antes de empezar.
- **Conexiones**: las cuentas conectadas que el agente activa quedan activadas para la nueva sesión.
- **Carpeta**: si no elegiste tú una carpeta, decide el agente. La mayoría de los agentes empiezan en **Nueva carpeta de tarea**; Programador, y los agentes configurados con "La carpeta de la página de inicio", usan la carpeta que se muestra. En un proyecto, elegir un agente nunca te saca de él. Cuando el agente cambia la carpeta, el cuadro muestra las elecciones guardadas para ese lugar, con el agente que elegiste.

La página de inicio guarda el agente de cada lugar (cada proyecto, cada carpeta y **Nueva carpeta de tarea**), en cualquier dispositivo que uses, junto con las demás elecciones de ese lugar. Un lugar donde aún no has elegido ninguno se abre con el agente propio del proyecto cuando el proyecto tiene uno, y si no con General. Un agente que ya no existe, o que no funciona en el proyecto elegido, también deja paso a ese valor predeterminado.

Elegir un proyecto en el menú de carpetas abre el cuadro con las elecciones de ese proyecto; en un proyecto donde aún no has elegido nada, eso incluye el agente con el que el proyecto empieza sus sesiones, cuando lo tiene (consulta [Proyectos](/guide/projects)).

## Cambiar de agente en una sesión

El cuadro de mensaje de una sesión muestra el agente con el que trabaja, y puedes cambiar a otro en cualquier momento: de **Investigador** a **Redactor** una vez reunidos los datos, por ejemplo.

1. Es la primera fila del chip bajo el cuadro de mensaje que abre **Opciones**, y ese chip lo nombra primero, como "Investigador · Opus 5.5".
2. Haz clic en él. En **Cambiar a**, elige otro: el mismo menú que en la página de inicio, una cuadrícula en una computadora y una hoja desde la parte inferior en un teléfono.
3. La app dice "El agente trabaja como *nombre* desde tu próximo mensaje".

Desde tu próximo mensaje, la sesión trabaja como el nuevo agente y la conversación continúa:

- Al programa se le avisa del cambio junto con tu mensaje (la conversación no lo muestra).
- **Claude Code y Codex** leen sus instrucciones al arrancar, así que cuando la sesión está libre, su programa arranca de nuevo antes de tu mensaje, con las instrucciones y los límites del nuevo agente; ese mensaje tarda un poco más. En mitad de un turno, o mientras trabaja hacia un objetivo o tiene trabajo en segundo plano, recibe las nuevas instrucciones con tu mensaje, y arranca de nuevo en un mensaje posterior, cuando esté libre.
- **Custom** lee sus instrucciones antes de cada turno. Los demás agentes (Gemini CLI, OpenCode…) reciben las instrucciones del nuevo agente con tu mensaje.
- Las cuentas conectadas que activa el nuevo agente quedan activadas en la sesión, en lugar de las del anterior; lo que activaste o desactivaste tú mismo para la sesión se mantiene. Si tiene un modo de permisos, la sesión cambia al modo equivalente, y a su modelo cuando sugiere el programa propio de la sesión. El programa en sí sigue siendo el mismo: para pasar la conversación a otro, consulta [Continuar en otro agente](/guide/sessions#continue-in-another-agent).

Una sesión empezada sin agente (en VS Code o en una terminal, o antes de que los agentes llegaran a la app) muestra ahí **Sin agente**: elige uno para dárselo. El menú de la sesión (⋯) → **Configuración de la sesión** → **Agente** también lo nombra; al hacer clic en él se abre la página del agente.

## Encontrar las sesiones de un agente

Una sesión empezada como un agente distinto del habitual lo indica en la barra lateral: la segunda línea de su fila empieza con el icono y el nombre del agente ("Planificador · web-agent · 5d", o "Investigador · Working · 2m 10s" mientras trabaja). El habitual es el agente propio del proyecto para una sesión en un proyecto que tiene uno (**Sus sesiones empiezan como**, en los detalles del proyecto), y General para todas las demás sesiones. Las sesiones empezadas fuera de Hydor y las de un agente que has eliminado desde entonces tampoco se nombran. El filtro y la búsqueda funcionan según el agente con el que empezó realmente cada sesión, incluido el habitual. Para ver solo las sesiones de un agente:

- Haz clic en el botón de filtro de la parte superior de la barra lateral (**Filtrar y agrupar sesiones**) y elige el agente en **Agente**. Lista los agentes con los que se empezaron tus sesiones, los más usados primero (hasta ocho), cada uno con cuántas sesiones tiene; **Todos los agentes** vuelve a mostrar todas las sesiones. La sección aparece cuando alguna sesión se empezó como un agente.
- O abre la página del agente y haz clic en **Mostrar las 23 en la barra lateral** junto a **Sesiones recientes** (dice **Mostrarlos en la barra lateral** cuando el agente tiene ocho sesiones o menos). Abre la página de inicio con la barra lateral mostrando solo las sesiones de ese agente, con los demás filtros quitados; en un teléfono se abre el menú.
- O escribe el nombre del agente en el cuadro de búsqueda (Ctrl+K): "Tutor" encuentra las sesiones empezadas como Tutor. General queda fuera de esto, ya que la mayoría de las sesiones lo son. La vista previa de una sesión ahí lista su **Agente**.

Mientras hay un filtro activo, un chip bajo **Nueva sesión** lo nombra, con su icono: haz clic en su × para volver a mostrar todas las sesiones. El filtro de agente funciona junto con los demás (**Se ejecuta en** y **Proyecto**), por ejemplo las sesiones de un agente en un proyecto. Si se elimina el agente, la lista vuelve a mostrar todas las sesiones. Consulta [La barra lateral](/guide/start#the-sidebar).

## Duplicar o eliminar un agente

En la página de un agente:

- **Duplicar** (en todos los agentes): abre la ventana en **Configuración** como un agente nuevo con todo rellenado y el nombre "*nombre* (copia)". Cambia lo que quieras y haz clic en **Crear agente**; se abre su página. Así creas tu propia versión de uno integrado.
- **Eliminar** (solo los tuyos): primero pregunta "¿Eliminar *nombre*?". Las sesiones empezadas como él siguen sin sus instrucciones; sus programaciones se quedan, como simples tareas programadas; los agentes que podían pasarle trabajo ya no lo listan. Los proyectos que empezaban sus sesiones como él quedan libres de él: sus sesiones vuelven a empezar como General (o el agente que elijas). Su historial de resultados se va con él; las páginas y hojas de cálculo que rellenó se quedan donde se guardaron.

El cuadro de búsqueda (Ctrl+K, ⌘K en una Mac) también encuentra agentes por nombre y descripción; al elegir uno se abre su página.

## Compartir un agente como archivo

Uno de tus agentes puede viajar como un solo archivo, para guardarlo o para dárselo a un colega, que lo instala en su Hydor.

- **Para descargar uno**: abre su página y luego **Más** (⋯) → **Descargar como archivo**. Los agentes integrados también se descargan, para instalarlos como propios. El archivo (`.hydor-agent`) contiene sus instrucciones, lo que puede usar, su nivel, programa y modelo, las habilidades preferidas, su modo de permisos, presupuesto y otros ajustes, los agentes a los que encarga trabajo (por nombre), lo que entrega y los tipos de lugar adonde van sus resultados, sus programaciones que se ejecutan por reloj (como sugerencias) y sus ejemplos. No lleva nada tuyo: los proyectos en los que trabaja, las cuentas conectadas que usa, la página y la hoja de cálculo adonde fueron sus resultados, a quién se envían sus resultados por correo y desde qué cuenta, y la dirección y la clave de su webhook se dejan fuera, y sus programaciones que se inician con una vigilancia, un webhook o una fecha se quedan aquí. El archivo enumera con palabras lo que se dejó fuera, para que lo configures de nuevo.
- **Para instalar uno**: en la [página de Agentes](/agents), abre **Nueva** y elige **Instalar un agente desde un archivo** (en un teléfono, pulsa **Instalar**), luego **Elegir un archivo** y selecciona un archivo `.hydor-agent` (o suéltalo ahí). Antes de guardar nada, una tarjeta lo muestra: su nombre y su línea, **Lo que trae** (sus instrucciones, lo que puede usar, su nivel, lo que entrega, sus ejemplos, sus programaciones sugeridas), **Lo que necesita de ti** (lo que se dejó fuera y los agentes a los que encarga trabajo que tú no tienes) y **Sus instrucciones** para leerlas. Un agente tuyo con el mismo nombre no se toca: el nuevo se instala a su lado como “Nombre (2)”, a menos que elijas **Reemplazar el mío**, que convierte el tuyo en este como una versión nueva (cómo era queda en sus **Versiones**, y tus ejemplos se conservan, después de los del archivo). **Añadir las programaciones que sugiere, en pausa** añade sus programaciones, desactivadas hasta que las actives. Pulsa **Instalar** y se abre su página.

Algunas cosas cambian al entrar, y la tarjeta lo indica: un agente que nunca preguntaba antes de actuar (**Acceso total**) empieza con **Aceptar ediciones**, un programa que no está configurado aquí cede su lugar al elegido en la página de inicio, y un archivo de un Hydor más nuevo trae lo que este conoce (actualiza Hydor para el resto). Un archivo que no es de un agente, o que está dañado, se rechaza indicando lo que falla; el archivo de una app se instala en cambio en la [página de Apps](/guide/apps#share-an-app-as-a-file), y los archivos de agentes de Claude Code entran con **Importar** (más abajo).

## Importar archivos de agentes de Claude Code

Claude Code puede guardar agentes propios como archivos Markdown en una carpeta `.claude/agents`: un encabezado corto con el nombre, la descripción, el modelo y las herramientas del agente, y sus instrucciones debajo. La app convierte estos archivos en agentes tuyos, de modo que todos los programas de aquí puedan funcionar así.

1. Abre la [página de Agentes](/agents), luego **Nueva** e **Importar archivos de agentes de Claude Code** (en un teléfono, haz clic en **Importar** en la parte superior).
2. **Importar agentes de Claude Code** muestra los archivos de agentes que encuentra: los tuyos en `~/.claude/agents` (marcados como **Tuyos**) y los de la carpeta `.claude/agents` de la carpeta abierta en [Archivos](/files) (marcados como **Esta carpeta**). Para ver los agentes propios de un proyecto, abre primero ese proyecto en Archivos.
3. Haz clic en **Importar** junto a un archivo. Su agente queda listo en la página de Agentes y en el menú de agentes de la página de inicio.
4. Para un archivo que esté en otro lugar, haz clic en **Elegir un archivo** (“O un archivo de agente de este dispositivo”) y selecciona el archivo `.md`.

El archivo debe ser Markdown (`.md`) y pesar como máximo 256 KB. Lo que la app toma de él:

| En el archivo del agente | En el agente |
|---|---|
| `name` (o el nombre del archivo si no hay) | **Nombre**: “code-reviewer” pasa a ser “Code reviewer” |
| `description` | **Una línea sobre él**: su primera frase, sin los ejemplos |
| `model` | **Se ejecuta en**: Claude Code con ese modelo (“inherit” mantiene el de la página de inicio) |
| `tools` | **Qué puede usar**, por tipo; un archivo sin línea de herramientas puede usarlo todo |
| `permissionMode` | **Modo de permisos**: default → Preguntar, acceptEdits → Aceptar ediciones, bypassPermissions → Acceso total, plan → Planificar |
| `skills` | **Habilidades preferidas** |
| El texto debajo del encabezado | **Instrucciones** |

El icono se elige a partir del nombre y la descripción del agente (un telescopio para investigar, una pluma para redactar, código para revisar y probar, etcétera). Los agentes importados trabajan en la carpeta de la página de inicio, igual que los agentes de Claude Code trabajan en un proyecto.

Un archivo ya importado muestra **Actualizar** en lugar de **Importar** en la lista. **Actualizar** vuelve a leer el archivo en el mismo agente: sus campos vuelven a ser los del archivo, y solo se conserva el icono que elegiste. Elegir un archivo de tu dispositivo siempre crea un agente nuevo.

## Carpetas de tareas: dónde trabaja una tarea sin carpeta

Muchas tareas no pertenecen a ninguna carpeta: un plan de viaje, una carta, una pregunta. Para esas, el chip de carpeta de la página de inicio muestra **Nueva carpeta de tarea**, y cuando pulsas **Inicio** la app crea una carpeta nueva para la sesión, con un nombre formado por el día y unas pocas palabras de tu mensaje, como `~/Hydor/2026-10-31-plan-trip-lisbon`. El agente guarda su trabajo ahí, y tú lo vuelves a encontrar en [Archivos](/files).

Cómo se forma el nombre:

- La fecha, en tu zona horaria.
- Hasta cinco palabras de tu mensaje, sin las palabras sueltas sin peso (el, la, por favor, ayuda, me…), los enlaces ni un `/comando` al principio, sin acentos y con un máximo de 40 caracteres. Si no queda ninguna palabra, es `task`.
- Si ese nombre ya existe, se añade `-2`, `-3` y así sucesivamente.

### Elegir una carpeta de tarea o una carpeta propia

Abre el chip de carpeta en la página de inicio:

- **Nueva carpeta de tarea** (“una nueva en ~/Hydor”) crea una carpeta nueva para cada sesión.
- Elige un proyecto, una carpeta que usaste hace poco o cualquier carpeta que encuentres con **Examinar** o escribiendo su nombre o ruta, y la sesión trabajará ahí en su lugar (consulta [Proyectos](/guide/projects) y [Sesiones](/guide/sessions)).

Mientras no elijas, decide el agente: los integrados distintos de Programador, y los tuyos configurados como “Una carpeta de tarea nueva”, usan una carpeta de tarea; Programador y los agentes configurados como “La carpeta de la página de inicio” usan la carpeta que se muestra, y un agente que trabaja en un solo proyecto usa ese proyecto. La página de inicio recuerda lo que elegiste. Elegir otro agente le devuelve la decisión a este, salvo que hayas elegido una carpeta desde que se abrió la página o estés en un proyecto. Cuando cambia la carpeta, el cuadro muestra las selecciones guardadas para ese lugar, con el agente que elegiste.

Las carpetas de tareas no saturan el menú de carpetas: las carpetas usadas hace poco que este enumera no las incluyen. Las sesiones que empiezan por voz en modo manos libres también reciben una carpeta de tarea, a menos que la página de inicio se haya configurado por última vez con una carpeta o un proyecto (consulta [Documentos, imágenes, videos y voz](/guide/documents-voice)).

### Mover las carpetas de tareas

1. En [Configuración → Capacidades → Tus agentes](/settings?s=assistants&find=Task%20folders), busca **Carpetas de tareas** en el grupo **Tareas** (su (i) explica que una sesión iniciada sin carpeta recibe aquí una nueva, con un nombre formado por el día y la tarea, y que Programador trabaja en cambio en la carpeta que elijas).
2. Haz clic en el nombre de la carpeta. En **Carpeta de trabajo**, escribe una ruta (sugiere carpetas mientras escribes, y carpetas que usaste hace poco) y haz clic en **Usar esta carpeta**. Indica una ruta completa, o una que empiece por `~` para tu carpeta personal.

Las nuevas carpetas de tareas irán ahí a partir de entonces; las carpetas ya creadas se quedan donde están. **Volver a ~/Hydor** aparece una vez que lo cambias, para volver a la opción predeterminada. La línea debajo muestra cómo se verán las nuevas. Los proyectos nuevos que reciben una carpeta propia la reciben también aquí, en una carpeta **Proyectos** dentro (consulta [Proyectos](/guide/projects)).

## Limpiar después de una tarea

[Configuración → Capacidades → Tus agentes](/settings?s=assistants&find=Clean%20up%20after%20a%20task) tiene un interruptor en el grupo **Tareas**: **Limpiar después de una tarea** (su (i) explica qué elimina el agente). Está activado salvo que lo desactives, y se aplica a todas las sesiones, sin importar con qué agente trabajen.

Con él activado, el último paso de un agente en una tarea es quitar lo que creó por el camino y ya no necesita:

- archivos de borrador y de prueba, carpetas y datos temporales, salidas de depuración y capturas de pantalla;
- ramas de git, worktrees (copias adicionales de un repositorio, cada una en su propia rama) y stashes que creó y que están fusionados o abandonados;
- procesos, servidores o contenedores que inició, a menos que quieras mantenerlos en ejecución.

Conserva lo que pediste y el trabajo que alguien aún debe revisar o fusionar (como una rama con commits sin fusionar), nunca elimina nada que no haya creado él, y te pregunta antes cuando algo es grande o poco claro (una descarga grande, cualquier cosa compartida). Nombra cada cosa que elimina en lugar de borrar por patrón, y dice en una línea qué eliminó y qué dejó. La habilidad de limpieza que viene con la app tiene el método (consulta [Habilidades](/guide/skills)).

Desactívalo y los agentes dejarán en su sitio lo que crearon. En ambos casos, los agentes siguen el cambio desde su próxima sesión (Custom, desde su próximo mensaje).

## Dónde más intervienen los agentes

- **Proyectos**: un proyecto puede indicar con qué agente empiezan sus sesiones (“Sus sesiones empiezan como”); elegir el proyecto en la página de inicio elige también ese agente. Su pestaña **Agentes** muestra los agentes que trabajan en él. Consulta [Proyectos](/guide/projects).
- **Apps**: una app puede nombrar un **Agente**, y sus ejecuciones empiezan como él (las ejecuciones desde una página pública no); cada paso de agente de una app puede nombrar uno. Consulta [Apps](/guide/apps).
- **Tareas programadas**: una tarea se ejecuta como el agente que indica su opción **Agente**; una tarea que un agente configura para ti desde una sesión se ejecuta como lo hace esa sesión. Consulta [Tareas programadas](/guide/tasks).
- **Voz en manos libres**: las sesiones que empiezas por voz empiezan en el lugar elegido por última vez en la página de inicio, con sus selecciones, como el agente elegido allí (si no, el agente propio del proyecto, si no, General).

## Pídeselo a un agente

- “Hazme un agente llamado Paper scout que encuentre artículos nuevos sobre mis temas de investigación todos los días laborables a las 8 y guarde los cinco mejores en una página, pensando con Rápido.”
- “Haz un agente llamado Bookkeeper que lleve las cuentas de mi hogar en una hoja de cálculo, que no pueda ejecutar comandos y que gaste como máximo 5 $ al mes.”
- “Que mi agente Release manager encargue trabajo a Translator y Test runner.”
- “Haz que mi agente Translator trabaje solo en el proyecto Hydor.”
- “Haz que Rápido signifique Haiku para Claude Code y mi modelo local Qwen para Custom.”
- “Desactiva Máximo para los problemas difíciles, de modo que las sesiones en Automático se queden en Mejor.”
- “Importa como agente mi archivo de agente de Claude Code ~/.claude/agents/code-reviewer.md.”
- “¿Qué agentes tengo, con qué piensa cada uno y cuánto gastaron este mes?”
- “Haz que mi Paper scout entregue una lista de artículos, cada uno con un título, un enlace y por qué importa, como una página guardada y una notificación.”
- “Haz que mi Bookkeeper añada cada viernes una fila a mi hoja de cálculo Presupuesto del hogar con el gasto de esta semana y sus partidas más grandes.”
- “Haz que mi agente Weekly report envíe su informe por correo a maria@example.com cada lunes, con el asunto Informe semanal {date}.”
- “¿Qué entregó mi Bookkeeper este mes y a cuánto ascendió en total?”
- “¿Cuáles de mis agentes se ejecutan solos mañana por la mañana, y a qué hora?”
- “Deja que mi Docs keeper mantenga una conversación propia, y envíale: actualiza la guía para la nueva página de Agentes.”
- “Cambia mi sesión sobre el viaje a Lisboa al agente Planificador.”
- “¿Qué cambió en mi Paper scout esta semana? Recupera la versión de antes del lunes si sus ejemplos funcionaban mejor entonces.”
- “Dale a mi agente Weekly report dos ejemplos, uno para una semana tranquila y otro para una ocupada, con lo que debe decir un buen informe, y pruébalos.”
- “Descarga mi agente Bookkeeper como archivo y dime qué tendré que configurar de nuevo en mi laptop.”
- “A partir de ahora, pon las nuevas carpetas de tareas en ~/Documents/Tasks.”
