# Jobs

Jobs muestra el trabajo largo que tus sesiones ejecutan en segundo plano, todo en un solo lugar y ordenado por etiquetas que indican de qué forma parte cada cosa: compilaciones, entrenamientos, indexaciones, descargas y subagentes. De cada uno ves cuánto tiempo lleva en ejecución, cuánto ha avanzado y más o menos cuánto le falta, qué está esperando para empezar y a qué espera, y cómo acabaron los que ya terminaron. Desde ahí puedes leer la salida de un trabajo y detenerlo, y puedes pedirle a un agente que ejecute una cosa después de otra.

![La página Jobs: cuatro recuadros que la resumen, un botón para cada etiqueta y los trabajos en marcha agrupados por etiqueta con su progreso y el tiempo restante](images/jobs.webp)

## Qué muestra Jobs

Haz clic en **Jobs** en la barra de iconos, o ve a [Jobs](/jobs). En un teléfono está entre las herramientas al final del panel lateral. Un número sobre su icono indica cuántos trabajos están en ejecución.

Un trabajo es cualquiera de estas cosas:

- una tarea en segundo plano de una de tus sesiones: un comando, un monitor (que vigila un registro o un programa) o un subagente del propio programa del agente, como el de Claude Code. Las sesiones que ejecutas fuera de Hydor, en VS Code o en una terminal, también muestran las suyas;
- trabajo que un agente empezó como trabajo (consulta [Cómo los agentes ponen trabajo aquí](#how-agents-put-work-here));
- una ejecución de [Experimentos](/guide/experiments) que está en marcha o esperando en su cola;
- un subagente de Hydor, es decir, una sesión que otra sesión empezó para una parte de su trabajo, mientras está trabajando (consulta [Subagentes](/guide/sessions#subagents)).

Cuatro recuadros en la parte superior lo resumen:

- **En ejecución** y **En cola**: cuántos trabajos se están ejecutando y cuántos esperan;
- **Todo terminado**: cuándo debería estar acabado todo ese trabajo, como “en unas 2 h 10 min”. Muestra un guion a menos que todos los trabajos tengan una estimación aún por cumplirse, sin contar los subagentes, que nunca la tienen;
- **Terminados hoy**: cuántos terminaron hoy. A su lado, “1 con error”, o los que haya, te lleva a ellos.

Debajo de los recuadros hay un botón para cada [etiqueta](#tags) y el campo **Filtrar trabajos**. Escribe en el campo para ver solo los trabajos cuyo nombre, comando, sesión, proyecto o etiquetas contengan esas palabras; **Mostrar todos los trabajos** vuelve a mostrar todo cuando nada coincide. Más abajo están **En marcha**, **Servidores** y **Terminados**, cada uno presente cuando tiene algo que mostrar. Los recuadros cuentan solo lo que dejan la etiqueta y el filtro. Los servidores en ejecución no se cuentan en los recuadros ni en el número de la barra de iconos. La página se actualiza sola.

Cuando no hay nada en ejecución ni en espera, lees “Ahora no se ejecuta nada en segundo plano.”

## En marcha

**En marcha** reúne los trabajos que se están ejecutando y los que esperan, en una tarjeta por cada etiqueta; los trabajos sin etiqueta están en la última, **Sin etiqueta**. La parte superior de una tarjeta muestra la etiqueta, cuántos de sus trabajos están en ejecución y en espera (como “3 en ejecución · 1 en cola”) y, cuando cada uno tiene una estimación, cuándo deberían estar listos (“termina en unos 34 min”). Cuando todo el trabajo de una tarjeta viene de una sola sesión, esa sesión y su proyecto también se nombran ahí, y sus filas los omiten. Haz clic en la parte superior de una tarjeta para plegarla o volver a abrirla; la app lo recuerda en este navegador. Mientras filtras o tienes una etiqueta elegida, no hay nada plegado. Mientras ningún trabajo tenga etiqueta, los trabajos simplemente aparecen en una lista, sin tarjetas por etiqueta.

Cada trabajo es una fila. Su icono indica de qué tipo es (pasa el cursor sobre él para leer **Comando**, **Monitor**, **Subagente de Claude Code**, **Subagente de Hydor**, **Ejecución de experimento** o **Trabajo**), y el punto sobre el icono, su estado. Junto al nombre están las demás etiquetas; pasa el cursor sobre el nombre para ver su comando. Debajo aparecen cómo va, la sesión que lo empezó y su proyecto, cada uno como enlace, y lo último que imprimió.

Haz clic en una fila para abrir [el panel del trabajo](#a-jobs-panel-and-stop). Su menú **⋯** tiene **Detalles y salida**, **Abrir sesión** (**Abrir ejecución** para una ejecución de Experimentos), **Editar etiquetas…** y **Detener**.

## En ejecución

Un trabajo en ejecución indica cuánto tiempo lleva (“en ejecución desde hace 12 min 05 s”). Cuando el trabajo informa cuánto ha avanzado, hay una barra de progreso con un porcentaje; pasa el cursor sobre la barra para ver la cuenta propia del trabajo, como “step 120/500”. Cuando no hay tiempo restante que mostrar, esa cuenta aparece debajo de la barra.

### Tiempo restante

Cuando hay algo en que basarse, la fila dice “quedan unas 1 h y 12 min”. La app usa el primero de estos datos que tenga:

1. el tiempo restante que imprimió el propio trabajo, como hacen muchas barras de progreso;
2. la velocidad a la que ha avanzado hasta ahora;
3. la estimación que dio el agente al empezar el trabajo;
4. cuánto tardó antes el mismo comando en la misma carpeta, cuando terminó bien en la última semana.

Pasa el cursor sobre el tiempo para ver de cuál se trata; el panel del trabajo también lo dice. **(una suposición)** a su lado significa que es aproximado: una sola lectura del progreso, la estimación del agente o una ejecución anterior. Cuando un trabajo ha tardado más de lo esperado, en cambio dice **supera su estimación**. Si no hay nada en que basarse, no se muestra ningún tiempo.

## En cola

Un trabajo en cola todavía no ha empezado. Su fila dice por qué:

- **Espera a** y los nombres de otros trabajos: empieza cuando todos hayan terminado bien. Haz clic en un nombre para encontrar su fila. Los trabajos a los que otros esperan dicen **Después:** y quién sigue;
- **Siguiente en la cola** y el nombre de la cola, o su lugar, como “3.º en la cola gpu”: una cola ejecuta un trabajo a la vez, en el orden en que llegaron, entre todas tus sesiones. El primero de la fila quizá aún esté esperando a otro trabajo, y los que están detrás también esperan;
- **Esperando una GPU libre** o **Esperando un espacio libre**: una ejecución de Experimentos espera a que haya lugar (consulta [Cómo elige la cola](/guide/experiments#how-the-queue-chooses)).

Cuando los trabajos que van delante tienen estimaciones, también dice cuándo debería empezar, como “empieza en aproximadamente 40 min”.

**Detener** en un trabajo en cola significa que nunca empezará, y tampoco los trabajos que lo esperan. Si un trabajo al que otro espera falla o se detiene, el que esperaba tampoco empieza nunca.

## Servidores

Algunos comandos nunca terminan por sí solos: un servidor de desarrollo, un servidor web o de API, un servidor de cuadernos o de modelos que una sesión dejó ejecutándose en segundo plano. Jobs los distingue por su comando y los lista en **Servidores**, con el tiempo que lleva cada uno y sin tiempo restante. Se ejecutan hasta que los detienes, con **Detener**, como cualquier otro comando. No se cuentan entre los trabajos en ejecución, y la vista **Cronología** los omite. Cuando uno termina, pasa a **Terminados**.

## Terminados

**Terminados** conserva lo que terminó en los últimos 7 días, lo más reciente primero, bajo un encabezado para cada día: **Hoy**, **Ayer** y luego la fecha. Ves los diez más recientes, y **Mostrar todo** muestra el resto. Cada uno dice cómo terminó, cuándo y cuánto tardó:

- **Completado**: terminó bien;
- **Fallido**, con su código de salida cuando lo hay (el número con el que termina un programa; cualquier cosa distinta de 0 significa que algo salió mal);
- **Detenido**: tú o un agente lo detuvieron;
- **No llegó a empezar**, y el motivo, por ejemplo que falló un trabajo al que esperaba;
- **Terminado**: un trabajo que ya estaba en ejecución cuando se agregó a Jobs ha terminado, y nadie vio si salió bien.

Cuando algo haya fallado, cambia de **Todos** a **Fallido** para ver solo esos. **Quitar de esta lista**, en el menú **⋯** de una fila, quita uno, y **Borrar** los quita todos después de preguntar, incluidos los que oculta una etiqueta o el filtro. Esto solo ordena la lista: tus sesiones y las ejecuciones de Experimentos se conservan.

## Etiquetas

Una etiqueta indica de qué forma parte un trabajo, como `intent-data` o `search-index`, para que puedas ver para qué sirve cada cosa en ejecución y mirar una línea de trabajo a la vez. Un trabajo tiene hasta 3, en minúsculas y con guiones entre las palabras: “Intent data” se guarda como `intent-data`. La primera determina dónde aparece en la lista.

No tienes que etiquetar nada por tu cuenta:

- los agentes etiquetan cada trabajo que empiezan, y usan una etiqueta ya existente siempre que el trabajo pertenezca a ella, para que una misma línea de trabajo quede bajo un solo nombre. Di qué etiqueta quieres y el agente la usará;
- el trabajo sin etiquetas propias (los comandos en segundo plano de una sesión, sus subagentes y ejecuciones de Experimentos, un trabajo empezado sin etiqueta) toma la etiqueta de su sesión. Esa es la que tú hayas puesto aquí a la sesión; si no, la que sus trabajos de la última semana tengan con más frecuencia; si no, una que el [modelo auxiliar](/settings?s=models&find=Helper%20model) elija para la sesión, reutilizando una etiqueta ya en uso cuando alguna encaje.

El modelo auxiliar elige en segundo plano, así que una etiqueta de este tipo puede aparecer un momento después que el trabajo. Para elegir, lee el título de la sesión, su proyecto y los nombres de algunos de sus trabajos. Nunca se le consulta sobre una [sesión confidencial](/guide/sessions#keep-a-session-confidential).

### Cambiar etiquetas

Elige **Editar etiquetas…** en el menú **⋯** de un trabajo, o haz clic en el lápiz junto a las etiquetas en su panel. Escribe las etiquetas separadas por comas, o haz clic en las que aparecen en **Etiquetas en uso**, y luego en **Guardar**.

En el trabajo que un agente empezó como trabajo, estas son las etiquetas propias de ese trabajo. En los demás casos son las de su sesión, así que todo el trabajo de esa sesión sin etiquetas propias las toma. Guarda el cuadro vacío para quitar lo que pusiste: entonces la etiqueta se vuelve a elegir por ti, como se explicó arriba. El trabajo que no pertenece a ninguna sesión no se puede etiquetar, salvo que sea un trabajo empezado como tal.

### Ver una etiqueta

Haz clic en el botón de una etiqueta para ver solo el trabajo que aparece bajo ella: los recuadros, **En marcha**, **Servidores**, **Terminados** y la cronología se ajustan a ella. El número en un botón indica cuántos de sus trabajos están en ejecución o en espera. Haz clic en **Todos** para volver a ver todo; el botón **Sin etiqueta** muestra [el trabajo sin etiqueta](/jobs?untagged=1).

La etiqueta que eliges forma parte de la dirección de la página (termina en `?tag=` y el nombre de la etiqueta), así que puedes guardarla en marcadores o enviarla a tu teléfono. Cada botón se guía por la primera etiqueta de cada trabajo; para encontrar un trabajo por otra de sus etiquetas, escribe esa etiqueta en **Filtrar trabajos**.

## La vista Cronología

Cambia entre **Lista** y **Cronología** arriba a la derecha; la app recuerda tu elección en este navegador. La cronología dibuja una barra por cada trabajo en ejecución o en espera, a lo largo del reloj, con un punto del color de su etiqueta antes del nombre. Los botones de etiquetas y **Filtrar trabajos** la acotan igual que a la lista:

- **Ejecutado hasta ahora** es sólido, y **Estimado** es la parte rayada que sigue;
- los trabajos **En cola** aparecen con línea discontinua, donde deberían empezar;
- una barra con **Sin estimación** se desvanece;
- la línea marcada como **Ahora** es el presente, y unas líneas finas unen un trabajo con los que lo esperan.

Un trabajo que supera su estimación se vuelve ámbar. Pasa el cursor sobre una barra para leer su estado y sus tiempos, y haz clic en ella para abrir el panel del trabajo. En una pantalla estrecha, el gráfico se desplaza hacia los lados y los nombres se quedan fijos. Los trabajos terminados aparecen en una lista debajo.

## El panel de un trabajo y Detener

El panel se abre sobre el lado derecho de la página (toda la pantalla en un teléfono). Arriba están el nombre del trabajo, su estado, sus etiquetas, **Abrir sesión** (o **Abrir ejecución**) y **Detener**. Debajo está lo que se sabe de él, como su sesión, proyecto y carpeta, cuándo empezó, cuánto le falta y en qué se basa esa estimación, a qué espera y cómo terminó. Luego viene su comando, con un botón para copiarlo.

**Salida** muestra el final de lo que el trabajo ha impreso, actualizado cada pocos segundos mientras se ejecuta; las líneas más nuevas se mantienen a la vista a menos que te desplaces hacia arriba. En el caso de un subagente, lista sus pasos. Algunos trabajos, como los subagentes de Hydor y las tareas en segundo plano de Codex, no tienen salida aquí: usa **Abrir sesión**.

**Detener** pregunta primero y luego pone fin al trabajo: un trabajo o un comando se detiene, una ejecución de Experimentos se detiene igual que desde su propia página, y la sesión de un subagente de Hydor se detiene. Lo que el trabajo haya hecho hasta entonces se conserva. El trabajo que se ejecuta en una sesión fuera de Hydor y las tareas en segundo plano de Codex no se pueden detener desde aquí, así que no tienen **Detener**.

## Cómo los agentes ponen trabajo aquí

No necesitas configurar nada. Una tarea en segundo plano que una sesión empieza aparece aquí por sí sola. Además, cada sesión que la app empieza tiene un comando llamado `job`, y los agentes tienen la indicación de usarlo para el trabajo largo (cualquier cosa de más de unos diez minutos), de modo que aparezca aquí con un nombre, una etiqueta, su progreso y su tiempo restante (consulta [Cuatro comandos que tiene todo agente](/guide/agents#four-commands-every-agent-has)).

Di lo que quieres con palabras sencillas, y el agente hace el resto:

- **Uno después de otro**: “ejecuta la evaluación cuando termine la creación del índice”. El segundo trabajo espera al primero, y nunca empieza si el primero falla;
- **Uno a la vez**: “pon estos barridos en una cola”. Los trabajos con el mismo nombre de cola se turnan;
- **Cuánto debería tardar**: un agente puede dar su propia estimación, que se usa hasta que el progreso del trabajo diga más;
- **De qué forma parte**: “etiqueta la creación del índice como search-index”. Los agentes también pueden listar las etiquetas en uso y cambiar después las etiquetas de un trabajo;
- **Trabajo que ya está en ejecución**: “muestra en Jobs el entrenamiento que empezaste antes”. El agente lo agrega sin reiniciarlo (`job adopt`); esto no está disponible en Windows. Cuando acaba, dice **Terminado**, ya que nadie puede saber cómo le fue.

Mientras un trabajo que una sesión empezó siga en espera o en ejecución (uno que ejecutó con `job`, o una ejecución de Experimentos que empezó), esa sesión no ha terminado: su punto sigue pulsando en azul y su estado dice “Trabajando · 1 en segundo plano”, incluso después de que su agente se haya detenido, y su aviso **Terminadas** llega solo cuando el trabajo acaba. El botón Detener junto a su cuadro de mensaje deja estos trabajos en ejecución: detenlos aquí.

Si no se puede acceder a la app cuando un agente empieza un trabajo, el comando se ejecuta de todos modos; simplemente no aparece aquí.

## Pídele a un agente

- “Ejecuta la evaluación como un trabajo cuando termine la creación del índice.”
- “Etiqueta la creación del índice como search-index.”
- “¿Qué sigue en ejecución para intent-data?”
- “Muestra en Jobs el entrenamiento que empezaste antes.”
- “Ejecuta estos tres barridos uno a la vez en una cola.”
- “¿Qué sigue en ejecución y cuándo terminará?”
- “Detén la descarga y ejecuta las pruebas como un trabajo.”
- “¿Por qué falló la última compilación? Revisa la salida de su trabajo.”
