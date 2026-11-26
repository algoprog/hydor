# Jobs

Jobs muestra en un solo lugar el trabajo largo que tus sesiones ejecutan en segundo plano: compilaciones, entrenamientos, indexaciones, descargas y subagentes. De cada uno ves cuánto tiempo lleva ejecutándose, cuánto ha avanzado y aproximadamente cuánto le falta, qué está esperando para empezar y qué espera, y cómo terminaron los que ya acabaron. Desde ahí puedes leer la salida de un trabajo y detenerlo, y puedes pedirle a un agente que ejecute una cosa tras otra.

![La página Jobs: los trabajos en ejecución con su progreso y tiempo restante, los que esperan su turno y los que ya terminaron](images/jobs.webp)

## Qué muestra Jobs

Haz clic en **Jobs** en la barra de iconos, o ve a [Jobs](/jobs). En un teléfono está entre las herramientas, al final del panel lateral. Un número sobre su icono indica cuántos trabajos se están ejecutando.

Un trabajo es cualquiera de estos:

- una tarea en segundo plano de una de tus sesiones: un comando, un monitor (una vigilancia sobre un registro o un programa) o un subagente del propio programa del agente, como los de Claude Code. Las sesiones que ejecutas fuera de Hydor, en VS Code o en una terminal, también muestran las suyas;
- un trabajo que un agente inició como job (ver [Cómo los agentes ponen trabajo aquí](#how-agents-put-work-here));
- una ejecución de [Experimentos](/guide/experiments) que está en curso o esperando en su cola;
- un subagente de Hydor, es decir, una sesión que otra sesión inició para encargarse de parte de su trabajo, mientras está trabajando (ver [Subagentes](/guide/sessions#subagents)).

La línea de arriba lo resume, por ejemplo “3 en ejecución · 2 en cola · todo listo en aproximadamente 2 h 10 min”. La hora de finalización aparece solo cuando todos los trabajos tienen una estimación; los subagentes, que nunca la tienen, no cuentan. Debajo están las secciones **En ejecución**, **En cola**, **Servidores** y **Terminados**, cada una solo cuando tiene algo que mostrar. El número de la barra de iconos, la línea de arriba y la hora de finalización no cuentan los servidores. La página se actualiza sola.

Cada fila tiene un icono con un punto que indica su estado y el nombre del trabajo; pasa el cursor sobre el nombre para ver su comando. Debajo aparece qué es (**Comando**, **Monitor**, **Subagente de Claude Code**, **Subagente de Hydor**, **Ejecución de experimento**, **Trabajo** o **Servidor**), la sesión que lo inició y su proyecto, cada uno como enlace. A la derecha, **Salida** muestra lo que imprime, **Abrir** lleva a su ejecución o a su sesión, y **Detener** lo termina.

Cuando no hay nada en ejecución ni en espera, lees “Ahora no se ejecuta nada en segundo plano.”

## En ejecución

Un trabajo en ejecución indica cuánto tiempo lleva (“en ejecución desde hace 12 min 05 s”). Cuando el trabajo informa cuánto ha avanzado, hay una barra de progreso con un porcentaje, y a menudo al lado el recuento propio del trabajo, como “step 120/500”. La línea atenuada de abajo es lo último que imprimió.

### Tiempo restante

Cuando hay algo en que basarse, la fila dice “quedan unas 1 h y 12 min”. La app usa el primero de estos datos que tenga:

1. el tiempo restante que imprimió el propio trabajo, como hacen muchas barras de progreso;
2. la velocidad a la que ha avanzado su progreso hasta ahora;
3. la estimación que dio el agente al iniciar el trabajo;
4. cuánto tardó antes el mismo comando en la misma carpeta, cuando terminó bien en la última semana.

Pasa el cursor sobre el tiempo para ver cuál de ellos es. **(una suposición)** al lado significa que es aproximado: una sola lectura de progreso, la estimación del agente o una ejecución anterior. Cuando un trabajo ha tardado más de lo esperado, dice en cambio **supera su estimación**. Si no hay nada en que basarse, no se muestra ningún tiempo.

## En cola

Un trabajo en cola todavía no ha empezado. Su fila dice por qué:

- **Espera a** y los nombres de otros trabajos: empieza cuando todos ellos hayan terminado bien. Haz clic en un nombre para encontrar su fila. Los trabajos a los que otros esperan dicen **Después:** y quién sigue;
- **Siguiente en la cola** y el nombre de la cola, o su posición, como “3.º en la cola gpu”: una cola ejecuta un trabajo a la vez, en el orden en que llegaron, entre todas tus sesiones. El primero de la fila puede seguir esperando a otro trabajo, y los que están detrás también esperan;
- **Esperando una GPU libre** o **Esperando un espacio libre**: una ejecución de Experimentos espera a que haya lugar (ver [Cómo elige la cola](/guide/experiments#how-the-queue-chooses)).

Cuando los trabajos que van antes tienen estimaciones, también dice cuándo debería empezar, como “empieza en aproximadamente 40 min”.

**Detener** en un trabajo en cola significa que nunca empezará, y tampoco lo harán los trabajos que lo esperan. Si un trabajo al que otro espera falla o se detiene, el que espera tampoco empieza.

## Servidores

Algunos comandos nunca terminan por sí solos: un servidor de desarrollo, un servidor web o de API, un notebook o un servidor de modelos que una sesión dejó en ejecución en segundo plano. Jobs los reconoce por su comando y los muestra aparte en **Servidores**, con el tiempo que lleva cada uno y sin tiempo restante. Se ejecutan hasta que los detienes, con **Detener** como en cualquier otro comando. No se cuentan entre los trabajos en ejecución, y la vista **Cronología** no los dibuja. Cuando uno acaba, pasa a **Terminados**.

## Terminados

**Terminados** conserva lo que acabó en los últimos 7 días, de lo más reciente a lo más antiguo: los diez últimos, y **Mostrar todo** para el resto. Cada uno dice cómo terminó, cuándo y cuánto tardó:

- **Hecho**: terminó bien;
- **Fallido**, con su código de salida cuando lo hay (el número con el que termina un programa; cualquier valor distinto de 0 significa que algo salió mal);
- **Detenido**: tú o un agente lo detuvieron;
- **No llegó a empezar**, y el motivo, por ejemplo que falló un trabajo al que esperaba;
- **Terminado**: un trabajo que ya se estaba ejecutando cuando se agregó a Jobs ha acabado, y nadie vio si salió bien.

La × al final de una fila (**Quitar de esta lista**) saca uno, y **Borrar** los saca todos después de preguntar. Esto solo ordena la lista: tus sesiones y las ejecuciones de Experimentos se conservan.

## La vista de cronología

Cambia entre **Lista** y **Cronología** arriba a la derecha; la app recuerda tu elección en este navegador. La cronología dibuja una barra por cada trabajo en ejecución o en espera, a lo largo del reloj:

- **Ejecutado hasta ahora** es sólido, y **Estimado** es la parte rayada que sigue;
- los trabajos **En cola** aparecen con líneas discontinuas, donde deberían empezar;
- una barra con **Sin estimación** se desvanece;
- la línea marcada **Ahora** es el presente, y unas líneas finas unen un trabajo con los que lo esperan.

Un trabajo que supera su estimación se vuelve ámbar. Pasa el cursor sobre una barra para leer su estado y sus tiempos, y haz clic en ella para ver su salida, o para abrirlo cuando no tiene salida que mostrar. En una pantalla angosta, el gráfico se desplaza hacia los lados y los nombres se quedan fijos. Los trabajos terminados aparecen debajo.

## Salida y Detener

**Salida** abre un panel con el final de lo que ha impreso el trabajo, que se actualiza cada pocos segundos mientras se ejecuta; las líneas más nuevas se mantienen a la vista a menos que te desplaces hacia arriba. En un subagente muestra sus pasos. Algunos trabajos, como los subagentes de Hydor y las tareas en segundo plano de Codex, no tienen salida aquí: usa **Abrir**.

**Detener** pregunta primero y luego termina el trabajo: un job o un comando se detiene, una ejecución de Experimentos se detiene igual que desde su propia página, y la sesión de un subagente de Hydor se detiene. Lo que el trabajo haya hecho hasta ahora se conserva. El trabajo que se ejecuta en una sesión fuera de Hydor, y las tareas en segundo plano de Codex, no se pueden detener desde aquí, así que no tienen **Detener**.

## Cómo los agentes ponen trabajo aquí

No necesitas configurar nada. Una tarea en segundo plano que una sesión inicia aparece aquí por sí sola. Cada sesión que la app inicia también tiene un comando llamado `job`, y a los agentes se les indica que lo usen para trabajos largos (cualquier cosa de más de unos diez minutos), de modo que aparezcan aquí con un nombre, su progreso y su tiempo restante (ver [Cuatro comandos que tiene todo agente](/guide/agents#four-commands-every-agent-has)).

Di lo que quieres con palabras sencillas, y el agente hace el resto:

- **Uno tras otro**: “ejecuta la evaluación cuando termine la creación del índice”. El segundo trabajo espera al primero, y nunca empieza si el primero falla;
- **Uno a la vez**: “pon estos barridos en una cola”. Los trabajos con el mismo nombre de cola se turnan;
- **Cuánto debería tardar**: un agente puede dar su propia estimación, que se usa hasta que el progreso del trabajo diga algo más;
- **Trabajo que ya está en ejecución**: “muestra en Jobs el entrenamiento que iniciaste antes”. El agente lo agrega sin reiniciarlo (`job adopt`); esto no está disponible en Windows. Cuando acaba, dice **Terminado**, ya que nadie puede saber cómo salió.

Mientras un job que inició una sesión siga pendiente o en ejecución (uno que ejecutó con `job`, o una ejecución de Experimentos que inició), esa sesión no ha terminado: su punto sigue “respirando” en azul y su estado dice “Trabajando · 1 en segundo plano”, también después de que su agente se haya detenido. Su aviso de **Terminadas** llega solo cuando el job acaba. El botón Detener junto a su cuadro de mensaje deja estos jobs en marcha: detenlos aquí.

Si no se puede conectar con la app cuando un agente inicia un job, el comando se ejecuta de todos modos; simplemente no aparece aquí.

## Pídeselo a un agente

- “Ejecuta la evaluación como un job cuando termine la creación del índice.”
- “Muestra en Jobs el entrenamiento que iniciaste antes.”
- “Ejecuta estos tres barridos uno a la vez en una cola.”
- “¿Qué sigue en ejecución y cuándo va a terminar?”
- “Detén la descarga y mejor ejecuta las pruebas como un job.”
- “¿Por qué falló la última compilación? Revisa la salida de su job.”
