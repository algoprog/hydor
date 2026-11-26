# Jobs

Jobs muestra el trabajo largo que tus sesiones ejecutan en segundo plano, todo en un solo lugar y ordenado por etiquetas que indican de qué tipo es cada trabajo, como experimentos, recopilación de datos o compilaciones: ejecuciones de entrenamiento, indexación, descargas y subagentes. De cada uno ves cuánto tiempo lleva en ejecución, cuánto ha avanzado y más o menos cuánto le falta, qué está esperando para empezar y a qué espera, y cómo terminaron los que ya acabaron. Puedes leer la salida de un trabajo y detenerlo desde ahí, y puedes pedirle a un agente que ejecute una cosa después de otra.

![La página Jobs: cuatro mosaicos que lo resumen, un chip por cada etiqueta y los trabajos en marcha agrupados por etiqueta con su progreso y el tiempo restante](images/jobs.webp)

## Qué muestra Jobs

Haz clic en **Jobs** en la barra de iconos, o ve a [Jobs](/jobs). En un teléfono está entre las herramientas, en la parte inferior del panel lateral. Un número en su icono indica cuántos trabajos se están ejecutando.

Un trabajo es cualquiera de estos:

- una tarea en segundo plano de una de tus sesiones: un comando, un monitor (una vigilancia sobre un registro o un programa) o un subagente del programa propio del agente, como el de Claude Code. Las sesiones que ejecutas fuera de Hydor, en VS Code o en una terminal, también muestran las suyas;
- trabajo que un agente inició como un trabajo (consulta [Cómo ponen los agentes el trabajo aquí](#how-agents-put-work-here));
- una ejecución de [Experimentos](/guide/experiments) que está en marcha o esperando en su cola;
- un subagente de Hydor, una sesión que otra sesión inició para una parte de su trabajo, mientras trabaja (consulta [Subagentes](/guide/sessions#subagents)).

Cuatro mosaicos en la parte superior lo resumen:

- **En ejecución** y **En cola**: cuántos trabajos se ejecutan y cuántos esperan;
- **Todo terminado**: cuándo debería haber terminado todo ese trabajo, por ejemplo “en unas 2 h 10 min”. Muestra un guion a menos que todos los trabajos tengan una estimación pendiente, sin contar los subagentes, que nunca la tienen;
- **Terminados hoy**: cuántos terminaron hoy. Junto a él, “1 fallido” o los que haya te lleva a ellos.

Debajo de los mosaicos hay un chip por cada [etiqueta](#tags), el menú de proyectos (**Todos los proyectos**, consulta [Ver los trabajos de un proyecto](#see-one-projects-jobs)) y el campo **Filtrar trabajos**. Escribe en el campo para ver solo los trabajos cuyo nombre, comando, sesión, proyecto o etiquetas contengan esas palabras; **Mostrar todos los trabajos** lo devuelve todo cuando nada coincide. Más abajo están **En marcha**, **Servidores** y **Terminadas**, cada uno presente cuando tiene algo que mostrar. Los mosaicos cuentan solo lo que dejan la etiqueta, el proyecto y el filtro. Los servidores en ejecución no se cuentan en los mosaicos ni en el número de la barra de iconos. La página se actualiza sola.

Cuando nada se ejecuta ni espera, lees “Nada se ejecuta ahora en segundo plano.”

## En marcha

**En marcha** contiene los trabajos que se ejecutan y los que esperan, en una tarjeta por cada etiqueta; los trabajos sin etiqueta están en la última, **Sin etiqueta**. La parte superior de una tarjeta muestra la etiqueta, cuántos de sus trabajos se ejecutan y cuántos esperan (como “3 en ejecución · 1 en cola”) y, cuando cada uno tiene una estimación, cuándo deberían terminar (“listo en unos 34 min”). Cuando todo el trabajo de una tarjeta proviene de una sola sesión, esa sesión y su proyecto también se nombran ahí, y sus filas los omiten. Haz clic en la parte superior de una tarjeta para plegarla o abrirla de nuevo; la app lo recuerda en este navegador. Mientras filtras o tienes una etiqueta elegida, nada está plegado. Mientras ningún trabajo tiene etiqueta, los trabajos simplemente se listan, sin tarjetas por etiqueta.

Cada trabajo es una fila. Su icono indica de qué tipo es (apunta a él para leer **Comando**, **Monitor**, **Subagente de Claude Code**, **Subagente de Hydor**, **Ejecución de experimento** o **Empleo**), y el punto del icono indica su estado. Junto al nombre aparecen las demás etiquetas; apunta al nombre para ver su comando. Debajo están cómo va, la sesión que lo inició y su [proyecto](#see-one-projects-jobs), cada uno un enlace, y lo último que imprimió.

Haz clic en una fila para abrir [el panel del trabajo](#a-jobs-panel-and-stop). Su menú **⋯** tiene **Detalles y salida**, **Abrir sesión** (**Abrir ejecución** para una ejecución de Experimentos), **Editar etiquetas…** y **Detener**.

## En ejecución

Un trabajo en ejecución indica cuánto tiempo lleva (“en ejecución desde hace 12 min 05 s”). Cuando el trabajo informa de cuánto ha avanzado, hay una barra de progreso con un porcentaje; apunta a la barra para ver el recuento propio del trabajo, como “paso 120/500”. Cuando no hay tiempo restante que mostrar, ese recuento aparece bajo la barra.

### Tiempo restante

Cuando hay algo en lo que basarse, la fila dice “faltan unas 1 h 12 min”. La app toma lo primero que tenga de esta lista:

1. el tiempo restante que el propio trabajo imprimió, como hacen muchas barras de progreso;
2. la rapidez con la que ha avanzado su progreso hasta ahora;
3. la estimación que dio el agente cuando inició el trabajo;
4. cuánto tardó antes el mismo comando en la misma carpeta, cuando terminó bien en la última semana.

Apunta al tiempo para ver cuál es; el panel del trabajo también lo indica. **(una suposición)** junto a él significa que es aproximado: una sola lectura de progreso, la estimación del agente o una ejecución anterior. Cuando un trabajo ha durado más de lo esperado, dice **supera su estimación** en su lugar. Sin nada en lo que basarse, no se muestra ningún tiempo.

## En cola

Un trabajo en cola aún no ha empezado. Su fila indica por qué:

- **Espera a** y los nombres de otros trabajos: empieza cuando todos ellos hayan terminado bien. Haz clic en un nombre para encontrar su fila. Los trabajos que otros esperan dicen **Después:** y quién sigue;
- **Siguiente en la cola** y el nombre de la cola, o su lugar, como “3.º en la cola gpu”: una cola ejecuta un trabajo a la vez, en el orden en que llegaron, entre todas tus sesiones. El primero de la fila aún puede estar esperando a otro trabajo, y los que van detrás también esperan;
- **Esperando una GPU libre** o **Esperando un espacio libre**: una ejecución de Experimentos espera a que haya sitio (consulta [Cómo elige la cola](/guide/experiments#how-the-queue-chooses)).

Cuando los trabajos que van delante tienen estimaciones, también indica cuándo debería empezar, como “empieza en unos 40 min”.

**Detener** en un trabajo en cola significa que nunca empieza, ni tampoco los trabajos que lo esperan. Si un trabajo que otro espera falla o se detiene, el que espera tampoco empieza nunca.

## Servidores

Algunos comandos nunca terminan por sí solos: un servidor de desarrollo, un servidor web o de API, un cuaderno o un servidor de modelos que una sesión dejó ejecutándose en segundo plano. Jobs los distingue por su comando y los lista bajo **Servidores**, con cuánto tiempo lleva cada uno en ejecución y sin tiempo restante. Se ejecutan hasta que los detienes, con **Detener** como en cualquier otro comando. No se cuentan entre los trabajos que se ejecutan, y la vista **Cronología** los omite. Cuando uno termina pasa a **Terminadas**.

## Terminadas

**Terminadas** conserva lo que terminó en los últimos 7 días, lo más reciente primero, bajo un encabezado por cada día: **Hoy**, **Ayer** y luego la fecha. Ves los diez últimos, y **Mostrar todo** trae el resto. Cada uno indica cómo terminó, cuándo y cuánto tardó:

- **Hecho**: terminó bien;
- **Fallido**, con su código de salida cuando lo hay (el número con el que termina un programa; cualquier valor distinto de 0 significa que algo salió mal);
- **Detenidas**: tú o un agente lo detuvieron;
- **No llegó a empezar**, y el motivo, como que un trabajo al que esperaba falló;
- **Terminó**: el trabajo que ya estaba en ejecución cuando se añadió a Jobs ha terminado, y nadie vio si salió bien.

Cuando algo falló, cambia de **Todos** a **Fallido** para ver solo esos. **Quitar de esta lista**, en el menú **⋯** de una fila, saca uno, y **Borrar** los saca todos tras preguntar, incluso los que oculta una etiqueta, el menú de proyectos o el filtro. Esto solo ordena la lista: tus sesiones y ejecuciones de Experimentos se conservan.

## Etiquetas

Una etiqueta indica de qué tipo es un trabajo, como `experiments` o `data-collection`, para que veas de un vistazo qué se está ejecutando y puedas mirar un tipo de trabajo a la vez. Las etiquetas nunca nombran un proyecto ni un tema; tus sesiones y proyectos ya se muestran junto a cada trabajo. Un trabajo tiene hasta 3 etiquetas, en minúsculas y con guiones entre palabras: “Data collection” se guarda como `data-collection`. La primera indica dónde se lista.

Hay nueve tipos amplios de trabajo, y casi todo encaja en uno de ellos:

- `experiments`: entrenamiento, evaluación, barridos y pruebas de rendimiento;
- `data-collection`: rastreo, extracción, descarga, consulta de servicios, etiquetado o generación de datos;
- `data-processing`: limpieza, conversión, indexación y vectorización de datos;
- `development`: escribir o cambiar código, documentos o traducciones, y revisarlos;
- `builds`: construir, compilar y empaquetar;
- `tests`: conjuntos de pruebas, comprobaciones de tipos y linting;
- `deployment`: publicar, lanzar y ejecutar servidores;
- `analysis`: investigación, informes, gráficos y estadísticas;
- `maintenance`: copias de seguridad, limpieza y actualizaciones.

Cada trabajo se etiqueta por separado: nunca toma la etiqueta de su sesión, así que la compilación, las pruebas y la descarga de una sesión quedan cada una bajo su propio tipo. No tienes que etiquetar nada tú:

- el agente que inicia un trabajo lo etiqueta, y usa una etiqueta que ya esté en uso siempre que el trabajo encaje en ella, de modo que el mismo tipo de trabajo quede bajo un solo nombre. Indica qué etiqueta quieres y el agente la usa;
- una ejecución de [Experimentos](/guide/experiments) siempre se etiqueta `experiments`;
- cualquier otro trabajo sin etiqueta (los comandos en segundo plano de una sesión, sus subagentes y servidores, un trabajo iniciado sin etiqueta) lo etiqueta el [modelo auxiliar](/settings?s=models&find=Helper%20model), que mira el nombre, el tipo y el comando de ese trabajo y elige entre las mismas etiquetas. Lo hace en segundo plano, así que esa etiqueta puede aparecer un momento después que el trabajo. Nunca se le consulta sobre una [sesión confidencial](/guide/sessions#keep-a-session-confidential), y la variable de entorno `HYDOR_JOBS_TAGGER=0` lo desactiva.

Las etiquetas amplias tienen colores propios, los mismos dondequiera que se muestren.

### Cambiar etiquetas

Puedes cambiar las etiquetas de cualquier trabajo, sin importar quién lo etiquetó. Elige **Editar etiquetas…** en el menú **⋯** del trabajo, o haz clic en el lápiz junto a las etiquetas en su panel. Escribe las etiquetas separadas por comas, o haz clic en algunas de **Etiquetas para elegir** (las etiquetas en uso, y luego las amplias), y después en **Guardar**. El cuadro de diálogo indica quién ha etiquetado el trabajo hasta ahora: “Lo etiquetó el agente que lo inició.”, “Lo etiquetaste tú.”, “Lo etiquetó el modelo auxiliar. Cámbiala si es incorrecta.” o, para una ejecución de Experimentos, “Las ejecuciones de Experimentos se etiquetan experiments.”

Guarda un cuadro vacío para quitar lo que estableciste. Entonces el trabajo no tiene etiqueta propia, y el modelo auxiliar puede volver a etiquetarlo, como se explicó antes.

### Ver una etiqueta

Haz clic en el chip de una etiqueta para ver solo el trabajo que aparece bajo ella: los mosaicos, **En marcha**, **Servidores**, **Terminadas** y la cronología la siguen. El número de un chip es cuántos de sus trabajos se ejecutan o esperan. Haz clic en **Todos** para volver a verlo todo; el chip **Sin etiqueta** muestra [el trabajo sin etiqueta](/jobs?untagged=1).

La etiqueta que eliges forma parte de la dirección de la página (termina en `?tag=` y el nombre de la etiqueta), así que puedes guardarla como marcador o enviarla a tu teléfono. Un chip se rige por la primera etiqueta de cada trabajo; para encontrar un trabajo por otra de sus etiquetas, escribe esa etiqueta en **Filtrar trabajos**.

## Ver los trabajos de un proyecto

El menú de proyectos está junto a **Filtrar trabajos**. Dice **Todos los proyectos**, o el nombre del proyecto que elegiste, con su marca. Ábrelo para elegir:

- **Todos los proyectos**: todos los trabajos;
- un proyecto que tiene trabajos aquí; el número junto a él indica cuántos se ejecutan o esperan;
- **Sin proyecto**: los trabajos que no pertenecen a ninguno.

Los mosaicos, **En marcha**, **Servidores**, **Terminadas** y la cronología muestran entonces solo esos trabajos. Al elegir un proyecto vuelves al chip **Todos**, y los chips y sus números abarcan solo sus trabajos; haz clic en uno para ver esa etiqueta dentro del proyecto. Mientras hay un proyecto elegido, las filas omiten su nombre. El menú aparece cuando algún trabajo pertenece a un proyecto.

El proyecto que eliges también forma parte de la dirección de la página (`?project=` y su id, o `?project=none`), así que puedes guardarla como marcador. Los trabajos de un [grupo](/guide/projects#bring-projects-together-in-a-group) incluyen los de los proyectos que reúne. Mientras un proyecto tiene trabajos en ejecución o en espera, o servidores que quedaron en marcha, su propia página los muestra en [Resumen](/guide/projects#overview).

Un trabajo pertenece al proyecto de su sesión. Cuando no hay ninguno (su sesión no está en ningún proyecto, o no tiene sesión, como un trabajo que iniciaste desde tu propia terminal o una ejecución que iniciaste en la página de Experimentos), pertenece al proyecto en cuya carpeta se ejecuta. Cuando la carpeta de un proyecto está dentro de la de otro, se lo queda el proyecto interior. Un grupo, y un proyecto cuya carpeta es tu carpeta personal o un disco entero, nunca reciben trabajos de esta manera. El panel de un trabajo nombra su **Proyecto**.

## La vista Cronología

Cambia entre **Lista** y **Cronología** en la parte superior derecha; la app recuerda tu elección en este navegador. La cronología dibuja una barra por cada trabajo que se ejecuta o espera, a lo largo del reloj, con un punto del color de su etiqueta antes de su nombre. Los chips de etiquetas, el menú de proyectos y **Filtrar trabajos** la acotan igual que la lista:

- **Ejecutado hasta ahora** es sólido, y **Estimado** es la parte rayada que va más allá;
- los trabajos **En cola** van con línea discontinua, donde deberían empezar;
- una barra **Sin estimación** se desvanece;
- la línea marcada **Ahora** es el presente, y unas líneas finas unen un trabajo con los que lo esperan.

Un trabajo que supera su estimación se vuelve ámbar. Apunta a una barra para leer su estado y sus tiempos, y haz clic en ella para abrir el panel del trabajo. En una pantalla estrecha el gráfico se desplaza hacia los lados y los nombres se quedan fijos. Los trabajos terminados se listan debajo.

## El panel de un trabajo y Detener

El panel se abre sobre el lado derecho de la página (en un teléfono ocupa toda la pantalla). Arriba están el nombre del trabajo, su estado, sus etiquetas, **Abrir sesión** (o **Abrir ejecución**) y **Detener**. Debajo está lo que se sabe de él, como su sesión, su proyecto y su carpeta, cuándo empezó, cuánto tiempo le queda y por qué se calcula así, qué está esperando y cómo terminó. Después viene su comando, con un botón que lo copia.

**Salida** muestra el final de lo que el trabajo ha impreso, y se actualiza cada pocos segundos mientras se ejecuta; las líneas más recientes se mantienen a la vista, salvo que te desplaces hacia arriba. En un subagente muestra sus pasos. Algunos trabajos, como los subagentes de Hydor y las tareas en segundo plano de Codex, no tienen salida aquí: usa **Abrir sesión**.

**Detener** pregunta primero y luego termina el trabajo: un trabajo o un comando se detiene, una ejecución de Experimentos se detiene como en su propia página, y la sesión de un subagente de Hydor se detiene. Lo que el trabajo ha hecho hasta ese momento se conserva. El trabajo que se ejecuta en una sesión fuera de Hydor y las tareas en segundo plano de Codex no se pueden detener desde aquí, así que no tienen **Detener**.

## Cómo ponen los agentes el trabajo aquí

No necesitas configurar nada. Una tarea en segundo plano que inicia una sesión aparece aquí por sí sola. Además, cada sesión que inicia la app tiene un comando llamado `job`, y a los agentes se les indica que lo usen para el trabajo largo (cualquier cosa de más de unos diez minutos), de modo que aparezca aquí con un nombre, una etiqueta para su tipo de trabajo, su progreso y su tiempo restante (consulta [Cuatro comandos que todo agente tiene](/guide/agents#four-commands-every-agent-has)).

Di lo que quieres con tus propias palabras, y el agente se encarga del resto:

- **Uno tras otro**: “ejecuta la evaluación cuando termine la construcción del índice”. El segundo trabajo espera al primero, y nunca empieza si el primero falla;
- **Uno a la vez**: “pon estos barridos en una cola”. Los trabajos con el mismo nombre de cola se turnan;
- **Cuánto debería tardar**: un agente puede dar su propia estimación, que se usa hasta que el progreso del trabajo diga algo más;
- **Qué tipo de trabajo es**: “etiqueta el rastreo como data-collection”. Los agentes también pueden listar las etiquetas en uso y las generales que aún no se usan, y cambiar después las etiquetas de cualquier trabajo;
- **Trabajo que ya se está ejecutando**: “muestra en Trabajos el entrenamiento que iniciaste antes”. El agente lo añade sin reiniciarlo (`job adopt`); esto no está disponible en Windows. Cuando termina, dice **Terminó**, porque nadie puede saber cómo le fue.

Mientras un trabajo que inició una sesión sigue esperando o ejecutándose (uno que ejecutó con `job`, o una ejecución de Experimentos que inició), esa sesión no ha terminado: su punto sigue “respirando” en azul y su estado dice “Working · 1 in background”, también después de que su agente se haya detenido, y su aviso de **Terminadas** llega solo cuando el trabajo termina. El botón Detener junto a su cuadro de mensaje deja estos trabajos en ejecución: deténlos aquí.

Si no se puede acceder a la app cuando un agente inicia un trabajo, el comando se ejecuta de todos modos; simplemente no aparece aquí.

## Pregunta a un agente

- “Ejecuta la evaluación como un trabajo cuando termine la construcción del índice.”
- “Etiqueta el rastreo como data-collection.”
- “Muéstrame solo los experimentos que se están ejecutando.”
- “¿Qué se está ejecutando en mi proyecto Tesis?”
- “Muestra en Trabajos el entrenamiento que iniciaste antes.”
- “Ejecuta estos tres barridos uno a la vez en una cola.”
- “¿Qué sigue ejecutándose y cuándo terminará?”
- “Detén la descarga y ejecuta las pruebas como un trabajo.”
- “¿Por qué falló la última compilación? Revisa la salida de su trabajo.”
