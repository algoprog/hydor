# Tareas programadas

Una tarea programada es trabajo de un agente que empieza solo: a una hora del día, cada pocos minutos u horas, una sola vez, cuando otro servicio llama a su webhook, cuando cambia algo que vigilas, cuando llega un correo nuevo o un registro nuevo en una app conectada, o un tiempo fijo antes de cada evento de tu calendario. Úsala para un resumen matutino, un recordatorio, un precio o una página que quieras tener vigilada, un informe semanal, cada factura nueva que llega por correo, una primera respuesta a cada cliente potencial nuevo, un resumen antes de cada llamada con un cliente, una revisión de cada pull request nuevo o un vistazo a cada ejecución fallida de CI, y el resultado te llega sin que tengas que empezar una sesión.

![Configuración → Tareas programadas: trabajo que empieza solo](images/tasks.webp)

## Qué es una tarea programada

Una tarea programada es una instrucción con un disparador. Cada vez que se activa el disparador, la app inicia una ejecución: una nueva sesión con el agente, el modelo y la carpeta de la tarea, cuyo primer mensaje es la instrucción de la tarea (o, si lo prefieres, la instrucción se envía a una sesión que ya tengas). El agente trabaja como en cualquier sesión. Al final dice en una línea cómo le fue, y el historial de la tarea guarda esa línea, el costo y un enlace a la sesión.

Una tarea puede empezar:

- **A una hora**: una hora del día en los días de la semana que elijas, o mediante una expresión cron.
- **Repetición**: cada cierto número de minutos (como mínimo 5) u horas.
- **Una vez**: en una fecha y hora concretas.
- **Ver**: cuando un vigilante detecta un cambio en un feed, una página web, un valor en JSON, una carpeta o la salida de un comando, un correo nuevo en una de tus cuentas de correo, o algo nuevo en una app conectada (una operación, un archivo, un ticket, un pago), o un tiempo fijo antes de cada evento de un calendario conectado. Un vigilante revisa sin usar un modelo, así que sus comprobaciones no gastan tokens; el agente solo se activa cuando algo ha cambiado.
- **Webhook**: cuando otro servicio (GitHub, Gitea, un formulario, un script tuyo) llama a la dirección propia de la tarea.

Una tarea también puede ejecutar una de tus apps en lugar de una instrucción: cada vez que se activa su disparador, la app se ejecuta con las respuestas que hayas definido, y el historial de la tarea enlaza a esa ejecución (consulta [Ejecutar una app por sí sola](/guide/apps#run-an-app-by-itself)).

Las horas están en tu zona horaria, que la app toma de tu navegador. Una ejecución que no pudo empezar a su hora, porque la computadora estaba apagada o suspendida o la app no estaba abierta, se ejecuta en la siguiente oportunidad.

Tus tareas están en [Configuración → Tareas programadas](/settings?s=tasks) (**Configuración → Agentes → Tareas programadas**). El cuadro de búsqueda (Ctrl+K, ⌘K en Mac) también encuentra una tarea por su nombre y la abre ahí. Hay cinco maneras de crear una:

- **Nueva tarea** en Configuración, donde defines tú mismo cada parte.
- **Empezar desde un ejemplo**: un formulario breve para una tarea habitual.
- Pedírselo a un agente en cualquier conversación («recuérdame el viernes a las 9»): muestra una tarjeta que confirmas.
- **Convertir esto en una automatización** en el menú de una sesión: redacta una tarea a partir de una sesión que funcionó.
- **Añadir una programación** en **Ejecuciones** de una app: una tarea que ejecuta esa app.

Continuar una sesión por sí sola cuando se restablece el límite de uso de un plan es un interruptor aparte: [Configuración → General → Reanudar tras los límites de uso](/settings?s=general&find=Resume%20after%20usage%20limits) (consulta [Uso, límites y costos](/guide/usage)).

## Ver tus tareas programadas

[Configuración → Tareas programadas](/settings?s=tasks) tiene un grupo, **Tus tareas**, cuya línea indica tu zona horaria (su (i) añade que una ejecución que no pudo empezar, porque la computadora estaba apagada, se ejecuta en la siguiente oportunidad), y enumera tus tareas, de la más antigua a la más reciente. La lista se actualiza sola a medida que las ejecuciones empiezan y terminan. **Vista semanal**, junto a **Nueva tarea**, las muestra todas en un calendario (consulta [Ver la semana: qué se ejecutó y qué se ejecutará después](#see-the-week-what-ran-and-what-runs-next)). Cada fila muestra:

- Un icono del disparador (un calendario, un ojo para un vigilante, un signo de webhook), el nombre de la tarea y el icono de su agente.
- Cuándo se ejecuta y dónde, por ejemplo “Días laborables a las 09:00 · nueva sesión en reports · próxima en 14 h 20 min”, o “publica en una sesión”.
- Para un vigilante, su última revisión: “Revisó hace 5 min: 12 elementos, 2 nuevos” (en ámbar cuando la revisión falló).
- Cuando la tarea se pausó sola, el motivo, con “Actívala para intentarlo de nuevo.”
- Puntos para sus últimas ejecuciones (hasta seis, de la más antigua a la más reciente: verde si terminó, ámbar si terminó en parte o se bloqueó, rojo si falló o hubo un error, gris si no hubo nada nuevo) con **Historial** al lado; **Última ejecución hace 3 h** (en rojo, con el motivo, cuando la última ejecución no pudo empezar); y **Abrir**, que abre la sesión de la última ejecución.
- Para una tarea con webhook, su dirección con un botón de copiar y, si se creó a partir de un ejemplo, dónde pegarla en el servicio que la llama.

A la derecha de cada fila hay un interruptor que pausa la tarea o la activa, y el menú de la tarea (⋯): **Ejecutar ahora**, **Probar sin enviar**, **Editar**, **Historial**, **Duplicar**, **Nueva dirección** (solo para tareas con webhook) y **Eliminar**.

Una tarjeta de un tablero que se mantiene al día también aparece en la lista, como del tablero: “Shop · Sales by day: refresh”. Su fila tiene su interruptor, **Actualizar ahora** y **Abrir el tablero**, que abre la configuración de la tarjeta en el tablero: su pregunta, su programación y su nivel se cambian ahí, y **Dejar de actualizar** ahí (o quitar la tarjeta, o eliminar el tablero) la quita de esta lista ([Mantener las tarjetas al día](/guide/library#keep-cards-up-to-date)).

Si aún no hay tareas, la lista dice “Aún no hay tareas programadas: empieza desde un ejemplo más abajo, o pide a un agente que configure una”.

## Ver la semana: qué se ejecutó y qué se ejecutará después

Todo lo que se ejecuta solo está en un único lugar: [Agentes → Programaciones](/agents/schedules), el lugar **Programaciones** de la columna de la página de Agentes (una pestaña en la parte superior en un teléfono). **Vista semanal** en Configuración → Tareas programadas también la abre, y el cuadro de búsqueda también. Reúne tus tareas programadas, las programaciones de tus agentes, las programaciones de tus apps (también **Actualizar automáticamente**), las tarjetas de tablero que se mantienen al día, los vigilantes y los webhooks, para que puedas ver qué se ejecuta mañana, por qué varias empezaron a las 08:00 y cómo fue la semana pasada.

- **La semana**: siete días uno al lado de otro, de lunes a domingo, con las horas en el lateral y hoy marcado, con una línea en la hora actual. Cada ejecución que ocurrió es un bloque a su hora, coloreado según cómo fue: verde para **Hecho**, gris para **Nada nuevo**, ámbar para **Te necesita** (terminada en parte o bloqueada), rojo para **Fallido** (o un error). Las ejecuciones que aún están por venir se dibujan tenues, con un borde discontinuo y su nombre. Cuando empiezan más de tres a la vez, se muestran dos y un bloque **+2** (o más) enumera el resto.
- **La columna de cada día** indica lo que costaron sus ejecuciones y cuántas fallaron.
- **Cada pocos minutos, vigilantes y webhooks**: lo que se ejecuta más de ocho veces al día, los vigilantes y los webhooks aparecen como una banda por tarea sobre las horas, en lugar de un bloque por cada ejecución. Cada día tiene una barra con cómo fueron sus ejecuciones, cuántas se ejecutaron y **+48** (por ejemplo) para las que aún están por venir. Haz clic en la línea para plegarlas.
- **Haz clic en un bloque** para ver su tarjeta: cómo fue, cuándo, cuánto tardó y cuánto costó, qué la inició (cuando no fue su programación), el resumen de una línea del agente, **Abrir su sesión** (o **Abrir su ejecución**, en el caso de una app) y **Editar**. Una ejecución futura indica cuándo se ejecutará, con **Editar**. El día de una banda cuenta sus ejecuciones según cómo fueron, con **Abrir la más reciente** cuando tiene una sesión.
- **‹** y **›** van a la semana anterior o siguiente, y **Hoy** vuelve a la actual. **Semana** y **Mes**, arriba a la derecha, cambian a un mes: cada día con una barra de cómo fueron sus ejecuciones, cuántas se ejecutaron y fallaron, cuántas están por venir (y **+48 repeticiones** para lo que se ejecuta cada pocos minutos), y su costo. Haz clic en un día para abrir su semana.
- La línea sobre el calendario suma lo que se muestra: cuántas se ejecutaron, cuántas fallaron, cuánto costaron y cuántas están por venir, y luego qué significan los colores y tu zona horaria.
- **Los filtros** de la parte superior (**Todos**, **Tareas**, **Agentes**, **Apps**, **Tableros**, **Vigilantes**, **Webhooks**, **En pausa**, cada uno con su cantidad) muestran solo esos: en el calendario, en sus totales y en la lista.

Bajo el calendario, **Todo lo que se ejecuta solo** enumera cada elemento: primero lo que se ejecuta a continuación, luego los vigilantes y los webhooks, y después lo que está en pausa. Una fila muestra su nombre y de quién es (**Agente ·** y el agente, **App ·** y la app, **Tablero ·** y el tablero, o **Tarea**), cuándo se ejecuta y cuándo será la siguiente, por qué se pausó sola, puntos de sus últimas ejecuciones con **Última ejecución hace 3 h:** y cómo fue, el resumen del agente y **Abrir**. El interruptor la pausa o la activa. El lápiz la abre donde la cambias: la programación de un agente en la página del agente, la de una app en **Ejecuciones** de la app (o en **Configuración** de su página, para **Actualizar automáticamente**), las actualizaciones de una tarjeta de tablero en su tablero (su **Mantenerla al día…**: [Mantener las tarjetas al día](/guide/library#keep-cards-up-to-date)), cualquier otra tarea aquí en Configuración → Tareas programadas, con su formulario abierto.

Las horas están en tu zona horaria. En un teléfono, Programaciones muestra un día a la vez: **‹** y **›**, o un deslizamiento hacia los lados, van al día anterior o siguiente.

## Crear una tarea nueva

1. Abre [Configuración → Tareas programadas](/settings?s=tasks) y selecciona [**Nueva tarea**](/settings?s=tasks&find=New%20task), el botón junto al título de la página. Se abre el formulario **Nueva tarea programada**.
2. Escribe un nombre, elige el agente y la carpeta, y escribe el prompt.
3. En **Cuándo**, elige cuándo se ejecuta.
4. En **Cada ejecución**, elige adónde va cada ejecución y sus límites.
5. Si quieres, selecciona **Ejecución de prueba** para probarla una vez sin guardar (consulta [Probar una tarea con una ejecución de prueba](/guide/tasks#try-a-task-with-a-test-run)).
6. Selecciona **Crear tarea**.

**Crear tarea** y **Ejecución de prueba** esperan hasta que la tarea tenga un nombre y un prompt. Una tarea nueva está configurada para ejecutarse a las 09:00 en días laborables, con el agente que elegiste por última vez en la página de inicio, en la carpeta predeterminada de la app (normalmente tu carpeta de usuario).

### Nombre, agente y carpeta

- **Nombre** (el cuadro que dice "Nombre, p. ej. Resumen matutino de CI"): cómo aparece la tarea en la lista, en las notificaciones y en los títulos de las sesiones de sus ejecuciones (“Resumen matutino · 3 nov, 07:30”). Hasta 120 caracteres.
- La ficha del agente: quién la ejecuta. Claude Code, Codex, Custom u otro agente que hayas añadido (consulta [Agentes, cuentas y modelos](/guide/agents-models)). Al elegir otro agente se borran el modelo y el esfuerzo, y se aplican los permisos habituales de ese agente.
- La ficha de la carpeta: la carpeta en la que trabaja cada ejecución. Escribe una ruta o elige una y luego selecciona **Usar esta carpeta**. La carpeta debe existir.

### Modelo, esfuerzo, permisos y otras opciones

La fila de debajo tiene los selectores de la página de inicio:

- **Modelo** y **Esfuerzo**: el modelo y cuánto se esfuerza en pensar. **Automático** aparece primero en el menú **Modelo**, como en la página de inicio: las sesiones de la tarea empiezan en Mejor, y su agente principal puede pasar por sí mismo a Máximo cuando un problema resulta demasiado difícil (consulta [Niveles: un modelo para cada tipo de trabajo](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Se ofrece cuando [**Liderar con subagentes**](/settings?s=models&find=Lead%20with%20subagents) está activado y el programa tiene niveles (para Custom, cuando su nivel Mejor ya nombra un modelo), y no para una tarea confidencial. Una tarea nueva empieza en Automático dondequiera que se ofrezca; una tarea que guardaste antes conserva su modelo, y puedes cambiarlo aquí en cualquier momento. En una terminal, `hydor tasks new … --model auto` hace lo mismo (consulta [Hydor en una terminal](/guide/terminal)). Un modelo elegido por nombre se usa tal como se nombra. Si no se toca, se usan los valores predeterminados del agente.
- **Permisos**: lo que el agente puede hacer sin preguntarte. Una tarea nueva empieza en **Preguntar** para Claude Code, **Auto** para Codex y **Auto** para Custom (los pasos rutinarios siguen adelante, los arriesgados preguntan). Puede que nadie esté mirando cuando se hace una ejecución: una ejecución que necesita tu aprobación la espera, en su sesión y en la [Bandeja de entrada](/guide/inbox).
- **Agente**, **Memoria** (cuando la memoria está activada), **Límite de gasto**, **Enjambre** e **Investigación**: la sesión nueva de cada ejecución empieza con estos ajustes, igual que una sesión iniciada desde la página de inicio (consulta [Sesiones](/guide/sessions), [Agentes](/guide/agents) y [Memoria](/guide/memory)). Una tarea que se ejecuta como uno de tus agentes es una de las programaciones de ese agente: aparece en la página del agente, sus ejecuciones usan el nivel del agente y cuentan para su presupuesto mensual. Una ejecución que falla o se detiene con un error en el nivel del agente se vuelve a ejecutar un nivel más arriba, hasta Mejor, salvo que la opción **Subir de nivel cuando falla una comprobación** del agente esté desactivada. Un agente que piensa con un nivel sigue ejecutándose en su nivel, diga lo que diga el modelo de la tarea. Cuando el agente mantiene una conversación propia, cada ejecución publica en esa conversación en lugar de empezar una sesión nueva.

### El prompt

Lo que el agente debe hacer cada vez. Escríbelo como instrucciones completas: una ejecución empieza desde cero y no puede ver la conversación donde tuviste la idea. Puede tener hasta 50.000 caracteres.

El primer mensaje de cada ejecución lleva más que tu prompt: una línea con el nombre de la tarea, con qué frecuencia se ejecuta, por qué empezó esta ejecución y la hora actual; una petición de informar de cómo fue; y las notas de la tarea de ejecuciones anteriores. En la sesión de la ejecución, todo esto aparece como una sola línea, como “Tarea programada Resumen matutino · Días laborables a las 07:30”. Selecciónala para leer el prompt y, en “Añadido por la app para esta ejecución”, el resto.

### Cuándo se ejecuta

**Cuándo** tiene cinco opciones: **A una hora**, **Repetición**, **Una vez**, **Ver** y **Webhook**. Para las tres primeras, una línea debajo (“Siguiente: …”) muestra las próximas ejecuciones, hasta tres, en tu zona horaria.

- **A una hora**: una hora del día y los días de la semana (D L M X J V S). Selecciona un día para activarlo o desactivarlo; los siete días significan todos los días, y siempre queda al menos uno activado.
- **Expresión cron…** (bajo **A una hora**) convierte la hora y los días en una expresión cron, una forma estándar de escribir programaciones, que luego puedes modificar; **Mejor una hora del día** vuelve atrás. Tiene cinco campos: minuto, hora, día del mes, mes y día de la semana (0 o 7 es domingo), en tu zona horaria. `*/15 9-17 * * 1-5` se ejecuta cada 15 minutos de 09:00 a 17:45 en días laborables. También funcionan los nombres de meses y días (`jan`, `mon`) y los atajos `@hourly`, `@daily`, `@weekly`, `@monthly` y `@yearly`. Una expresión que no funciona se rechaza, con el motivo, al guardar.
- **Repetición**: “Cada [número] minutos” u “horas”. El intervalo más corto es de 5 minutos; una tarea repetitiva nueva se ejecuta cada hora. La primera ejecución llega un intervalo después de guardar.
- **Una vez**: una fecha y una hora (una hora a partir de ahora al principio). Después de una ejecución que salió bien (**Hecho** o **Nada nuevo**), la tarea se elimina, ya que no le queda nada por hacer. Después de una que falló o que te necesita, se desactiva sola y permanece en la lista, para que puedas ver por qué y volver a ejecutarla con **Ejecutar ahora**.
- **Ver**: consulta [Vigilar un cambio](/guide/tasks#watch-for-a-change).
- **Webhook**: consulta [Iniciar ejecuciones desde otro servicio con un webhook](/guide/tasks#start-runs-from-another-service-with-a-webhook).

En las apps de escritorio, la computadora no se suspende sola desde unos minutos antes de que toque una ejecución hasta que empieza, ni mientras trabaja (consulta [Mantener la computadora activa](/guide/app#keep-the-computer-awake)); las comprobaciones de un vigilante no la mantienen activa. Cerrar la tapa de una laptop sigue suspendiéndola, y una computadora que está suspendida a la hora de la tarea la ejecuta una vez que se reactiva. Para ejecuciones que deben producirse a cualquier hora, usa una computadora que permanezca encendida.

### Cada ejecución

- **Empieza una sesión nueva** (la opción predeterminada), o **Publica en:** una de tus sesiones recientes con el mismo agente (las 40 más recientes que no están archivadas). Publicar en una sesión mantiene todas las ejecuciones en una sola conversación, que usa su propio modelo y sus propios ajustes. Cuando el agente de esa sesión está ocupado, el mensaje de la ejecución espera en su cola hasta que termina el turno, y el costo de la ejecución cuenta solo su parte.
- **Se detiene al pasar de $**: un límite de gasto para cada ejecución, a precios de API. La sesión de la ejecución se detiene cuando ha gastado esa cantidad (se comprueba después de cada llamada al modelo). Vacío significa sin límite. Es el mismo límite que la ficha **Límite de gasto** de arriba y, como ella, se aplica a las sesiones nuevas.
- **Pausar tras [3] fallos seguidos**: la tarea se pausa sola después de esta cantidad de ejecuciones fallidas seguidas y te dice por qué. 0 significa que los fallos nunca la pausan; el máximo es 50.

La línea de debajo lo resume: “Una ejecución te cuenta cómo le fue; una sin nada que informar permanece en silencio, y los fallos siempre notifican.”

## Vigilar un cambio

Un vigilante es una comprobación económica que se ejecuta cada pocos minutos sin un modelo y activa al agente solo cuando algo cambió. Elige **Ver** en **Cuándo** y luego qué mirar:

- **Feed**: la **Dirección** de un feed RSS o Atom (la lista de publicaciones nuevas que publican muchos sitios, blogs y alojamientos de código). Cada elemento nuevo activa al agente, con su título, enlace, fecha y resumen (hasta 25 a la vez).
- **Página**: la **Dirección** de una página web, y cuenta **Qué parte**:
  - **Página completa**: cualquier cambio en su texto legible.
  - **Cerca de un texto**: solo las líneas con este texto, y la línea anterior y la posterior de cada una (para un precio, “Precio”).
  - **Selector**: la parte que elige un selector CSS sencillo (los nombres que una página web da a sus partes): una etiqueta, `#id`, `.class` o `[attribute=value]`, combinados o anidados, como `main .price`.

  La ejecución recibe las líneas que aparecieron y las que desaparecieron. El vigilante lee la página tal como la recibe el servidor, sin ejecutar los scripts de la página, así que usa **Probar** para comprobar que ve lo mismo que tú.
- **JSON**: la **Dirección** de una respuesta JSON (el formato de datos que dan las API de muchos servicios), **Valor en** una ruta como `data.price` o `data.items[0].price`, y **Activar cuando** cambia, es igual a, no es, es mayor que, es menor que o contiene un **Valor**. Los números se comparan como números. Una condición activa al agente cuando empieza a cumplirse, no en cada comprobación mientras se cumple.
- **Carpeta**: una **Carpeta** de esta computadora y, si quieres, **Solo archivos como** un patrón como `*.pdf` (`*` representa cualquier texto, `?` un carácter). Los archivos nuevos activan al agente, con sus nombres, tamaños y fechas. Los archivos ocultos y las subcarpetas se omiten.
- **Comando**: un **Comando** que se ejecuta con tu shell en la carpeta de la tarea en cada comprobación, durante un minuto como máximo, y si activar **Cuando cambia su salida** o **Cuando cambia su código de salida** (el número con el que termina un comando: 0 normalmente significa que funcionó). La ejecución recibe la salida y lo que cambió en ella.
- **Correo electrónico**: correo nuevo en una cuenta de correo que conectaste (consulta [Conectar tu correo](/guide/connections#connect-your-email)). Elige la **Cuenta** y la **Carpeta** (la bandeja de entrada, salvo que elijas otra), y, si quieres, solo el correo cuyo campo **El remitente contiene** o **El asunto contiene** un texto, o **Solo correo aún sin leer**. Cada correo nuevo inicia una ejecución propia, como máximo 10 por comprobación: quién lo envió y a quién, la fecha, el asunto y su texto, como datos externos, con sus archivos adjuntos guardados en la carpeta de la tarea, en email-attachments. Cuando llegan más de 10 entre dos comprobaciones, los 10 más recientes obtienen ejecuciones y la primera ejecución enumera los más antiguos en una línea. Un correo nunca inicia dos ejecuciones, ni siquiera después de reiniciar la app.
- **App conectada**: algo nuevo en una de las apps que conectaste (consulta [Apps conectadas](/guide/connections)), como un negocio o un contacto nuevo en un CRM, un archivo nuevo en una unidad en la nube, un ticket nuevo o un pago nuevo. Elige la **Cuenta** y luego la **Herramienta** a la que llama en cada comprobación: solo se ofrecen sus herramientas que miran (listar o buscar), nunca una que envíe, cambie, elimine o pague, y solo las que están activadas para ella. **Empezar desde** ofrece puntos de partida listos donde la app guarda ese tipo de cosas (**Archivos nuevos**, **Contactos nuevos**, **Negocios nuevos**, **Tickets nuevos**, **Pagos nuevos** y otros): cada uno elige una de las herramientas de la cuenta y rellena sus campos. Rellena los campos de la herramienta como quieras; en un campo, `{{now}}` representa la hora de cada comprobación y `{{now+2d}}` dos días después (también `{{today}}` y `{{tomorrow}}`). **Pruébalo** llama a la herramienta una vez y muestra lo que devolvió: dónde están los elementos en su respuesta (**Los elementos están en**), el campo que los distingue (**Se distinguen por**, como un id o una dirección), los primeros elementos y **Lo que respondió** completo. Elige otra lista u otro campo ahí si el que encontró no es el correcto. Cada elemento nuevo inicia entonces una ejecución propia, como máximo 10 por comprobación, con el elemento como datos externos; cuando llegan más a la vez, la primera ejecución nombra los demás en una línea. Un elemento nunca inicia dos ejecuciones, ni siquiera después de reiniciar la app. Pide a la herramienta lo más reciente primero, y suficientes elementos, donde sus campos lo permitan.
  - **Antes de cada evento**: para un calendario conectado, una ejecución a una hora fija antes de cada uno de sus eventos en lugar de una por cada elemento nuevo. **Iniciar una ejecución** **15 min**, **30 min** o **1 hora** antes de cada evento, o **La noche anterior** **A las** una hora que elijas, y, si quieres, solo los eventos cuyo **El título contiene** un texto, o **Solo eventos con otras personas**. Usa la herramienta que lista tus eventos, con campos desde `{{now}}` hasta `{{now+2d}}` o así, y elige el campo con el inicio de cada evento en **Hora de inicio en** después de **Pruébalo**. El vigilante lee los próximos eventos en cada comprobación y una vez más en el momento de cada evento. Un evento que se mueve obtiene su ejecución antes de su nueva hora; uno cancelado no obtiene ninguna.

Después:

- **Comprobar cada [número] minutos**: con qué frecuencia mira, de 1 minuto a una semana. Un vigilante nuevo mira cada 15 minutos.
- **Permitir direcciones de esta computadora o de su red** (feeds, páginas y JSON): desactivado salvo que lo marques, así que un vigilante solo llega a sitios públicos. Solo tú puedes permitirlo, aquí en el formulario; un vigilante que propone un agente nunca llega a tu propia red.
- **Probar**: muestra lo que el vigilante ve ahora, con una línea como “12 elementos (primera mirada)” y una muestra de lo que leyó, o lo que salió mal.

Cómo se comporta un vigilante:

- Su primera mirada después de guardar solo toma nota; los cambios posteriores activan al agente. Cambiar lo que vigila una tarea la reinicia desde cero.
- Lo que leyó llega al agente marcado como datos externos, para trabajar con ellos y nunca para seguirlos como instrucciones.
- Un cambio que llega mientras la ejecución del anterior sigue en marcha espera a la siguiente mirada. El correo nuevo, los elementos nuevos de una app conectada y los eventos del calendario son la excepción: cada uno inicia su propia ejecución.
- Cuando una mirada falla (el sitio está caído, el texto ya no está en la página, una app conectada cerró sesión o su respuesta cambió), la fila lo indica y no se inicia ninguna ejecución con lo que no pudo leer. Tras tantas miradas fallidas seguidas como permite **Pausar tras … fallos seguidos**, la tarea se pausa: “Pausada porque su comprobación falló 3 veces seguidas: …”.
- **Ejecutar ahora** en una tarea con vigilante ejecuta al agente con lo que el vigilante ve ahora, en lugar de con un cambio.

## Iniciar ejecuciones desde otro servicio con un webhook

Un webhook es una dirección a la que otro servicio llama cuando ocurre algo: GitHub cuando se abre un pull request, un formulario cuando alguien lo envía, un script tuyo. Elige **Webhook** en **Cuándo** y guarda la tarea para obtener su dirección (“Guarda la tarea para obtener su dirección; cada llamada a ella inicia una ejecución”). Aparece en la fila de la tarea, con un botón para copiarla. La dirección funciona sin iniciar sesión en la app, porque la parte secreta de la dirección es el permiso: mantenla privada y prefiere un modo de permisos que pregunte antes de hacer cambios. El servicio tiene que poder llegar a esta app en esa dirección.

Partes de la llamada pueden ir en la instrucción:

- `{{body.path.to.field}}`: un valor de lo que envió el servicio (JSON, un formulario o texto sin formato), como `{{body.pull_request.html_url}}`.
- `{{headers.name}}`: uno de los encabezados de la llamada. Los encabezados que llevan credenciales (Authorization, cookies, firmas, tokens) nunca se rellenan.
- `{{query.name}}`: un valor de la consulta de la dirección (la parte después de `?`).
- `{{body}}` para todo el cuerpo, `{{request}}` para el cuerpo, los encabezados y la consulta juntos.

Llegan al agente marcados como datos externos. **Ejecutar ahora** en una tarea con webhook envía su instrucción tal como está escrita, sin ninguna llamada que rellenar.

Las opciones bajo la dirección:

- **Secreto de firma (opcional)**: escribe uno o selecciona **Generar**, y entrega el mismo secreto al servicio. Las llamadas deberán llevar entonces una firma HMAC-SHA256 de su cuerpo hecha con él (un código que solo puede crear quien conoce el secreto), como la envían GitHub, Gitea y otros; el encabezado de token de GitLab también funciona. Las llamadas sin ella se rechazan.
- **Encabezado de la firma**: aparece cuando hay un secreto. Déjalo vacío para los habituales (X-Hub-Signature-256, X-Gitea-Signature, X-Signature-256…), o indica el que use tu servicio.
- **Filtro (opcional)**: **Ejecutar solo cuando** u **Omitir cuando** una ruta dentro de la llamada **es** un valor: `body.action` es `opened`, `headers.x-github-event` es `push`, `query.kind` es `daily`. Una ruta sin `body.`, `headers.` ni `query.` lee el cuerpo. Una llamada que el filtro deja fuera recibe respuesta y no inicia nada.

Qué hace la dirección con las llamadas:

- Un envío repetido con la misma Idempotency-Key o el mismo id de entrega (GitHub, Gitea y GitLab dan uno a cada envío) se ejecuta una sola vez. Los ids se recuerdan durante una semana.
- Una llamada que llega dentro de los cinco segundos posteriores a la última ejecución de la tarea se rechaza, así que una ráfaga de llamadas inicia una sola ejecución.
- Una tarea en pausa rechaza las llamadas. Una llamada puede pesar hasta 2 MB.
- La llamada se responde de inmediato, con un enlace a la sesión de la ejecución. Añade `?wait=60` a la dirección para esperar hasta 60 segundos la respuesta del agente en la respuesta (hasta 300); si la ejecución sigue en curso para entonces, se responde con un enlace a ella.

## Dar una nueva dirección a una tarea con webhook

Si la dirección se filtró, o un servicio debe dejar de llamarla: el menú de la tarea (⋯) → **Nueva dirección** y luego confirma **Nueva dirección** (“La dirección actual deja de funcionar. Actualiza los servicios que la llaman.”). Editar una tarea con webhook conserva su dirección; un duplicado recibe una propia.

## Empezar desde un ejemplo

Debajo de la lista, [**Empezar desde un ejemplo**](/settings?s=tasks&find=Start%20from%20an%20example) (“Un formulario corto para cada uno; cambia lo que quieras después”) contiene tareas ya preparadas en filas; las cuatro primeras se muestran y el resto queda detrás de **Mostrar todos los ejemplos** (**Mostrar menos ejemplos** los vuelve a plegar). Aquí están en tres grupos: **Del día a día**, **Ver** e **Ingeniería**. Selecciona uno para abrir su formulario corto, rellénalo, elige quién la ejecuta en **Se ejecuta por** y selecciona **Crear tarea**. **Más opciones…** abre en su lugar el formulario completo de la tarea con todo rellenado. Los campos marcados con (opcional) pueden quedar vacíos; los demás son necesarios. Los interruptores (como **Pull requests abiertos**) indican lo que el agente puede hacer: activados o desactivados, como prefieras.

**Del día a día**

- [**Resumen matutino**](/settings?s=tasks&find=Morning%20brief): el clima, las noticias de lo que sigues y tu día, cada mañana. Tú indicas la hora (07:30 para empezar), los días, la ciudad para el clima y los temas para las noticias; añade los eventos de hoy y el correo urgente cuando hay un calendario o una cuenta de correo conectados.
- [**Noticias sobre un tema**](/settings?s=tasks&find=News%20on%20a%20topic): lo que es realmente nuevo sobre un asunto, con fuentes, a la hora y los días que elijas (todos los días a las 09:00 para empezar); en silencio cuando no hay nada.
- [**Informe semanal de una carpeta**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): un día de la semana (viernes a las 16:00 para empezar), lo que cambió en una carpeta o repositorio en los últimos siete días y lo que parece sin terminar, con tres sugerencias para la semana siguiente. No modifica ningún archivo.
- [**Resumen de la bandeja de entrada**](/settings?s=tasks&find=Inbox%20digest): lo que llegó a tu correo desde la última ejecución, con los mensajes que te necesitan primero. Solo lee, y necesita una cuenta de correo conectada (consulta [Apps conectadas, claves y herramientas](/guide/connections)).
- [**Seguimiento de hábito**](/settings?s=tasks&find=Habit%20check-in): una pregunta amistosa sobre un hábito a la hora que elijas (todos los días a las 20:00 para empezar), llevando tu racha en las notas de la tarea.
- [**Recordatorio**](/settings?s=tasks&find=Reminder): un aviso a una hora fija en los días que elijas (días laborables a las 09:00 para empezar). Para un único recordatorio, consulta [Recordatorios](/guide/tasks#reminders).

**Ver**

- [**Vigilancia de precios**](/settings?s=tasks&find=Price%20watch): vigila la página de un producto cada 60 minutos (solo cerca de un texto como “Precio”, si indicas uno) y te avisa cuando el precio cambia, o cuando está en el objetivo que indiques o por debajo.
- [**Alerta de cambios en una página**](/settings?s=tasks&find=Page%20change%20alert): vigila una página, o la parte cercana a un texto, cada 30 minutos, y dice qué cambió y si importa; los cambios triviales se quedan en silencio.
- [**Nuevas versiones**](/settings?s=tasks&find=New%20releases): vigila las versiones publicadas de un repositorio de GitHub (propietario/nombre) cada 6 horas y resume lo nuevo y lo que podría romperse.
- [**Comprobación de sitio activo**](/settings?s=tasks&find=Site%20up%20check): comprueba una dirección cada 10 minutos. Cuando el sitio se cae, el agente averigua por qué (DNS, certificado, estado HTTP, tiempo de espera agotado); cuando vuelve, lo dice en una línea.
- [**Alerta de espacio en disco**](/settings?s=tasks&find=Disk%20space%20alert): comprueba un disco (`/` para empezar) cada 30 minutos. Cuando se llena más allá de un límite (90 %), el agente busca qué ocupa el espacio y sugiere qué limpiar, sin eliminar nada.
- [**Archivos nuevos en una carpeta**](/settings?s=tasks&find=New%20files%20in%20a%20folder): vigila una carpeta cada 15 minutos (solo archivos como `*.pdf`, si lo indicas) y hace lo que escribas en **Luego** con cada archivo nuevo, o te dice en una línea qué es cada uno.

**Ingeniería** (más en [Ingeniería](/guide/engineering))

- [**Revisar pull requests nuevos**](/settings?s=tasks&find=Review%20new%20pull%20requests): una tarea con webhook en la carpeta de un repositorio, a la que llama GitHub o Gitea por cada pull request nuevo (se ejecuta solo cuando la llamada dice `opened`). El agente revisa el cambio y sugiere correcciones, sin hacer push ni fusionar. Una vez guardada, copia su dirección en la configuración de webhooks del repositorio, como indica su fila (solo **Pull requests** entre los eventos individuales).
- [**Doctor de CI**](/settings?s=tasks&find=CI%20doctor): una ejecución fallida en GitHub Actions, GitLab CI, Buildkite o CircleCI despierta a un agente que lee los registros, distingue lo intermitente de lo real, la vuelve a ejecutar o abre un pull request en borrador con una corrección, según lo que permitas, y lo resume. Consulta [Doctor de CI](/guide/engineering#ci-doctor).
- [**Clasificación de incidencias**](/settings?s=tasks&find=Issue%20triage): cada incidencia nueva se etiqueta, se revisa por si es un duplicado, se responde con una petición amable de lo que le falta y, cuando la corrección es pequeña, se prueba como pull request en borrador. Consulta [Clasificación de incidencias](/guide/engineering#issue-triage).
- [**Jardinero de dependencias**](/settings?s=tasks&find=Dependency%20gardener): una vez por semana (lunes a las 09:00 para empezar), actualiza en worktrees con las pruebas ejecutadas, las correcciones de seguridad primero, un pull request por nivel de riesgo, o un informe. Consulta [Jardinero de dependencias](/guide/engineering#dependency-gardener).
- [**Primer respondedor de incidentes**](/settings?s=tasks&find=Incident%20first%20responder): una alerta de Sentry, Grafana, Datadog, Better Stack u otro servicio despierta a un agente que te avisa de inmediato, encuentra la causa probable y pregunta antes de cualquier reversión. Consulta [Primer respondedor de incidentes](/guide/engineering#incident-first-responder).

El formulario de un ejemplo con webhook indica, bajo sus campos, adónde irá su dirección; una vez creada la tarea, su fila dice lo mismo bajo la dirección.

## Probar una tarea con una ejecución de prueba

**Ejecución de prueba**, en el pie del formulario, ejecuta la tarea una vez ahora, tal como está en el formulario, sin guardarla. Se ejecuta como una ejecución real, en una sesión propia titulada “Prueba: <nombre> · <hora>”, y una franja en el formulario muestra **Ejecución de prueba** con cómo fue cuando termina, y **Abrir su sesión**. Una ejecución de prueba nunca cuenta para los fallos que pausan una tarea. Probar una tarea que estás editando lee sus notas y aparece en su historial como **Ejecución de prueba**; una tarea nueva todavía no tiene notas.

Para probar una tarea que envía, publica o elimina sin que salga nada, abre el menú junto a **Ejecución de prueba** (**Más formas de probar**) y elige **Probar sin enviar**, o elige **Probar sin enviar** en el menú (⋯) de una tarea guardada. Se ejecuta igual, pero cada llamada a una herramienta de una cuenta conectada que actúa hacia fuera (envía, publica, responde, invita, comparte, elimina o paga), y cada llamada a una herramienta en Preguntar antes, se guarda como “se habría enviado” y nunca se realiza. Se le informa al agente y continúa como si se hubiera hecho. Su franja, su ejecución en **Historial** y su sesión enumeran lo que **Se habría enviado**, y después no queda nada esperando en la Bandeja de salida. La lectura funciona como siempre. Consulta [Apps conectadas, claves y herramientas](/guide/connections#ask-first-calls-that-wait-for-your-ok).

## Ejecutar una tarea ahora

El menú de la tarea (⋯) → **Ejecutar ahora** inicia una ejecución de inmediato, esté la tarea activada o en pausa, y abre su sesión.

## Ver cómo fueron las ejecuciones

El menú de la tarea (⋯) → **Historial**, o **Historial** junto a los puntos, abre las ejecuciones de la tarea, de la más reciente a la más antigua (se muestran las últimas 50; la app guarda 100 por tarea). Cada ejecución muestra:

- Cómo fue: **En ejecución**, **Hecho**, **Hecho en parte**, **Bloqueado** (el agente te necesita: un acceso o una decisión), **Fallido**, **Nada nuevo** o **Error** (no pudo empezar, o su turno terminó con un error).
- Cuándo empezó, qué la inició (**Según un horario**, **Webhook**, **Observador**, **Ejecutar ahora**, **Volver a ejecutar**, **Ejecución de prueba** o **Probar sin enviar**), cuánto tardó y cuánto costó.
- En una prueba sin enviar, lo que **Se habría enviado**: cada llamada, con la cuenta, la herramienta y a quién habría ido.
- El resumen de una línea del agente. Selecciona uno largo para leer toda la última respuesta del agente.
- **Abrir su sesión** y **Ejecutar de nuevo con la misma entrada**, que ejecuta la tarea otra vez con lo que recibió esa ejecución: la misma llamada de webhook o el mismo cambio que vio un observador.

El resultado es lo que el agente informó al final. Cuando no informó nada, la app lo decide: **Error** si el turno terminó con uno, **Nada nuevo** si la respuesta empieza con [SILENT] o solo dice que no hay nada que informar, y **Hecho** en cualquier otro caso. En la sesión de la ejecución, el informe del agente aparece como un paso: “Informó hecho: …”.

## Notas que una tarea conserva entre ejecuciones

Bajo el historial está el bloc de notas de la tarea, **Notas que guardan sus ejecuciones**: lo que la siguiente ejecución debe saber, como lo que ya se informó, un total acumulado o dónde se quedó. Cada ejecución lo lee al empezar, y el agente le añade o lo reescribe. Selecciona **Editar** para cambiarlo tú, y luego **Guardar** (o **Cancelar**). Admite hasta 8.000 caracteres; pasado ese límite, se pierden las líneas más antiguas.

## Notificaciones de una tarea

Una ejecución te cuenta cómo fue con la notificación habitual de su sesión, titulada con el nombre de la sesión y con el resumen de una línea del agente. Sigue tu configuración de notificaciones (consulta [Bandeja de entrada y notificaciones](/guide/inbox)).

- Una ejecución sin nada que informar no envía nada.
- Una ejecución fallida, o que terminó con un error, siempre envía un aviso de fallo.
- Una ejecución bloqueada envía un aviso de que te necesita, que empieza con “Bloqueado:”.
- Una ejecución que no pudo empezar (su carpeta ya no existe, la sesión en la que publica fue eliminada) envía un aviso de fallo, “No se pudo iniciar: …”.
- Una tarea que se pausa sola envía un aviso que explica por qué.
- Una ejecución que pone fin a su tarea lo dice: “Su trabajo está hecho, así que su horario se eliminó.”
- Una ejecución que publica en una de tus conversaciones deja los avisos de esa conversación como están.

Un agente también puede enviarte una notificación mientras trabaja (su herramienta notify_user), para algo que no puede esperar al final de la ejecución; también puede cualquier agente, y el paso de una app.

## Pausar, activar, editar, duplicar o eliminar una tarea

- **Pausar o activar**: el interruptor en la fila de la tarea. Una tarea en pausa no se ejecuta ni vigila, y su webhook rechaza las llamadas. Volver a activar una tarea borra su cuenta de fallos y el motivo por el que se pausó.
- **Pausa automática**: tras el número establecido de fallos seguidos, la tarea se pausa y su fila dice por qué (“En pausa tras 3 ejecuciones fallidas seguidas. La última: …”).
- **Editar**: el menú de la tarea (⋯) → **Editar** abre el formulario como **Editar tarea**; selecciona **Guardar**.
- **Duplicar**: abre un formulario de tarea nueva con una copia llamada “<nombre> (copia)”, para cambiarla y guardarla.
- **Eliminar**: pregunta antes: “Deja de ejecutarse y su historial se elimina. Las sesiones que inició se conservan.”
- **Eliminación automática**: una tarea que ya no hace falta se elimina sola, aproximadamente un minuto después de que termine su última ejecución: una tarea de una sola vez tras una ejecución que salió bien, y una tarea cuya ejecución encontró su trabajo hecho, porque lo que esperaba o vigilaba ya ocurrió y su instrucción decía que se detuviera entonces (la notificación de la ejecución lo dice). Los horarios de un agente se eliminan junto con el agente.

## Deja que un agente configure una tarea

Pídelo en cualquier conversación, con tus propias palabras: “recuérdame el viernes a las 9 llamar al dentista”, “cada lunes por la mañana, resume las incidencias de la semana pasada”, “avísame cuando cambie esta página”. El agente propone la tarea y una tarjeta la muestra en la conversación. No se guarda nada hasta que respondas.

La tarjeta pregunta **¿Programar esta tarea?**, con el nombre de la tarea y **Esperándote**, y muestra:

- **Cuándo**: la programación en palabras, con las próximas ejecuciones en tu zona horaria. Para un vigilante, qué vigila y con qué frecuencia, con la dirección, el comando o la herramienta de una app conectada, y “Se ve bien después de confirmar, y el agente solo se activa cuando algo cambia.”
- **Hace**: el prompt (**Todo** abre uno largo).
- **Ejecuciones**: el agente, su modelo (**Automático** cuando la conversación lo usa) y dónde: una sesión nueva en una carpeta, o en esta conversación.

Después elige:

- **Programarla**: guarda la tarea y la activa.
- **Editar…**: abre el formulario de la tarea con todo rellenado, para cambiar cualquier parte antes; su botón también dice **Programarla**.
- **Ahora no**: la rechaza.

El agente recibe tu respuesta como un mensaje, incluidas las partes que hayas cambiado, así que no necesitas decírselo. La tarjeta se queda en la conversación con el resultado (“Programada”, “Próxima ejecución …”, un enlace a **Tareas programadas**) y lo muestra igual en tus otros dispositivos.

Si no pides otra cosa, la tarea se ejecuta con el agente, el modelo, los permisos y la carpeta de la conversación (una conversación en **Automático** crea una tarea que también empieza en Automático), y la sesión de cada ejecución empieza con la configuración de la conversación: su agente, su memoria, su límite de gasto, sus cuentas conectadas y su proyecto. Pide que las ejecuciones se publiquen aquí, y cada una se publicará en esta conversación en lugar de empezar una sesión nueva.

Los agentes también pueden cambiar, pausar, volver a activar o eliminar tus tareas, siempre con una tarjeta antes: **¿Cambiar esta tarea?** (las partes que cambian, con el valor antiguo tachado encima del nuevo), **¿Pausar esta tarea?**, **¿Volver a activar esta tarea?** o **¿Eliminar esta tarea?**, cada una con su propio sí y no (**Cambiarlo** o **Dejarla como está**, **Pausarla** o **Mantenerla en marcha**, **Activarla** o **Mantenerla en pausa**, **Eliminarla** o **Conservarla**). También pueden enumerar tus tareas con la próxima ejecución de cada una y cómo salió la última.

Los agentes eliminan una tarea que ya no hace falta en lugar de pausarla. Si una debe detenerse cuando ocurra algo (“hasta que salga la nueva versión”, “cuando haya llegado mi paquete”), lo indican en su prompt, y la ejecución que ve que eso ocurre termina la tarea.

Algunos límites mantienen esto bajo control:

- Una conversación puede tener hasta cinco propuestas esperando tu respuesta.
- Un agente no puede proponer una tarea nueva cuando ya tienes 100.
- Una ejecución programada no puede programar ni cambiar tareas; se le indica que sugiera una en su resumen. Solo puede terminar su propia tarea, cuando ya haya cumplido su trabajo.
- Un vigilante que propone un agente nunca llega a direcciones de tu propia computadora o red.

## Convierte una sesión en una tarea

Cuando una sesión hizo algo que quieres repetir: el menú de la sesión (⋯) → **Más** → **Convertir esto en una automatización**. El [modelo auxiliar](/settings?s=models&find=Helper%20model) lee la conversación y redacta una tarea: un prompt que puede volver a ejecutarse solo (sin los detalles puntuales de esta vez, con tus correcciones incorporadas) y un disparador adecuado. El agente, el modelo, el esfuerzo, los permisos, la carpeta y la configuración de la sesión vienen de la sesión (una sesión en **Automático** da una tarea que empieza en Automático); una sesión en un worktree se ejecuta en el repositorio del que procede.

El formulario se abre como **Nueva automatización desde esta sesión**, con una línea que explica por qué eligió ese disparador. Cambia lo que quieras, prueba con una ejecución de prueba y luego guarda; la tarea quedará en [Configuración → Tareas programadas](/settings?s=tasks). Una sesión sin mensajes tuyos no se puede convertir en una tarea.

## Recordatorios

Un recordatorio es una tarea cuya ejecución te avisa de algo a una hora fijada, como notificación y en su sesión. Hay tres maneras de crear uno:

- Pídeselo a un agente: “recuérdame mañana a las 8 sacar la basura”. Propone una tarea que se ejecuta una vez, y tú la confirmas en la tarjeta.
- Usa el ejemplo de [**Recordatorio**](/settings?s=tasks&find=Reminder) para uno que se repite los días que elijas.
- Crea una **Nueva tarea** con **Una vez** en **Cuándo**, y un prompt como “Recuérdame, en una línea amable, llamar al dentista.”

## En un teléfono

[Configuración → Tareas programadas](/settings?s=tasks) funciona igual en un teléfono, y [Programaciones](/agents/schedules) muestra un día a la vez. El formulario de la tarea, los formularios de los ejemplos y las confirmaciones (antes de **Eliminar** o **Nueva dirección**) se abren como hojas desde la parte inferior de la pantalla. Las opciones de **Cuándo** y los tipos de vigilante se desplazan de lado cuando no caben, y los ejemplos son una columna de filas. Para saber de tus tareas con la app cerrada, activa las notificaciones del teléfono (consulta [Bandeja de entrada y notificaciones](/guide/inbox)).

## Pídeselo a un agente

- “Cada día laborable a las 7:30, dame el tiempo en Atenas y las noticias de IA desde ayer.”
- “Recuérdame el viernes a las 9 llamar al dentista.”
- “Haz que mi resumen de la mañana se ejecute en Automático.”
- “Vigila esta página de producto y avísame cuando el precio baje de 99 €.”
- “Cada vez que llegue un correo con una factura de mi contador, guarda el PDF en ~/Invoices y añade una fila a mi hoja de cálculo de gastos.”
- “Empieza una tarea cuando entre un nuevo trato en HubSpot: investiga la empresa y redacta una primera respuesta para su contacto.”
- “Treinta minutos antes de cada llamada con un cliente en mi Google Calendar, ponme al día sobre con quién me reúno y de qué hablamos la última vez.”
- “¿Cuáles de mis tareas programadas fallaron esta semana y por qué?”
- “¿Qué de mis tableros se actualiza mañana por la mañana, y cuánto cuestan esas actualizaciones al mes?”
- “¿Qué se ejecuta solo mañana y a qué hora?”
- “¿Por qué tantas de mis tareas empezaron a las 08:00 del lunes? Distribúyelas.”
- “Pausa mi Resumen de la mañana”, o “Ejecuta ahora el informe semanal.”
- “Comprueba cada 30 minutos si ya entregaron mi paquete, avísame cuando lo hayan hecho y luego detente.”
- “¿Cuáles de mis tareas programadas ya no hacen falta? Elimínalas.”
- “Prueba mis recordatorios de facturas sin enviar nada y muéstrame los correos que habría enviado.”
- “Convierte esta conversación en una tarea que se ejecute cada lunes a las 9.”
- “Ejecuta mi app Reading list cada vez que este feed tenga una publicación nueva, con el enlace de la publicación.”
- “Configura un doctor de CI para ~/code/shop en GitHub Actions que pueda volver a ejecutar los trabajos inestables.”
