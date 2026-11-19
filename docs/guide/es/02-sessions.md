# Sesiones

Una sesión es una conversación con un agente, en una carpeta: tú dices lo que quieres, el agente trabaja y tú lo sigues, apruebas lo que quiere hacer y lo guías. Este tema cubre todo lo relacionado con las sesiones: la página de inicio y sus opciones, lo que ves mientras un agente trabaja, cómo enviarle mensajes a mitad de un turno y todo lo que hay en el menú de una sesión, desde bifurcar y los objetivos hasta los worktrees y Compartir.

![Una sesión en marcha: los pasos y las respuestas del agente, y una tarjeta que pide ejecutar un comando](images/sessions.webp)

## Empezar una sesión

**Nueva sesión**, en la parte superior de la barra lateral, abre la página de inicio. Escribe lo que quieres que se haga en el cuadro de mensaje, revisa la fila de opciones que hay debajo y pulsa Intro (o **Inicio**; en un teléfono, la flecha redonda). La página de la sesión se abre al instante, con tu mensaje y el agente trabajando en él (**Funcionando**). Si la sesión no puede empezar, su página explica por qué, y **Volver a la página de inicio** devuelve al cuadro tu mensaje (y lo que adjuntaste).

Si la conexión se corta antes de que la app responda (tu teléfono se durmió o la red cambió), la página muestra **Reconectando…** y, en cuanto puede, le pregunta a la app qué pasó con tu mensaje: la sesión se abre si llegó a empezar, y una sesión nunca empieza dos veces. Si la app sigue sin responder durante aproximadamente un minuto, la página dice **No se pudo acceder a la app**; **Reintentar** vuelve a preguntar una vez más.

Un momento después de empezar, la sesión recibe su título: unas pocas palabras que resumen lo que pediste (“Viaje de fin de semana a Lisboa”, “Arreglar las pruebas del pago”), que el modelo auxiliar ([Configuración → Agentes → Modelos](/settings?s=models&find=Helper%20model)) escribe en segundo plano, sin que aparezca nada en la conversación. La barra lateral, el encabezado de la sesión y el cuadro de búsqueda lo muestran (en la barra lateral, sus palabras van apareciendo una tras otra en lugar de las de tu mensaje), y Claude Code y Codex también lo reciben, para sus propias listas. Hasta que llega, y cuando el modelo auxiliar no puede responder, el comienzo de tu mensaje ocupa su lugar. Un título que le pongas tú mismo a la sesión con **Cambiar nombre** nunca se reemplaza. La barra lateral muestra la sesión desde el momento en que la envías, al principio de **Activas** (**Iniciando**).

La fila que hay debajo del cuadro de mensaje contiene **Se ejecuta en**, **Modelo**, **Carpeta** (o **Proyecto**), **Agente** y, al final, **Opciones**. En un teléfono, cada uno se abre como una hoja desde la parte inferior de la pantalla.

### Elegir el agente y su modelo

**Se ejecuta en** muestra todos los programas que puedes usar, uno junto a otro:

- **Claude Code**: el agente de Anthropic, con un plan de Claude o una clave de API.
- **Codex**: el agente de OpenAI, con un plan de ChatGPT o una clave de API.
- **Custom**: el agente propio de la app, para cualquier modelo: de OpenRouter, Ollama o vLLM. Consulta [Custom, el agente propio de la app](/guide/custom).
- Cualquier otro agente que hayas añadido y que hable ACP (Gemini CLI, OpenCode, Qwen Code, Goose…), con su comando bajo su nombre.

Al final, **Modelos para Custom** abre [Configuración → Modelos](/settings?s=models) y **Añadir o administrar agentes** abre [Configuración → Más agentes](/settings?s=agents). Consulta [Agentes, cuentas y modelos](/guide/agents-models).

**Modelo** se abre en **Automático**: la sesión empieza con el modelo del nivel Mejor, su agente principal entrega partes claras a subagentes de niveles más económicos, y puede pasarse al de Máximo cuando un problema resulta demasiado difícil (consulta [Niveles: un modelo para cada tipo de trabajo](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Debajo, el menú muestra solo los modelos propios del agente elegido. El modelo predeterminado del agente aparece marcado con “predeterminado”. Las versiones anteriores de un modelo esperan tras “2 modelos anteriores”; una lista larga tiene un campo **Buscar modelos** (Intro elige la primera coincidencia). Custom muestra los modelos que añadiste en Configuración → Modelos; otro agente ACP muestra los modelos que ofreció la última vez que se ejecutó, y el chip aparece una vez que se ha ejecutado.

### Elegir una carpeta, un proyecto o una carpeta de tarea nueva

El chip **Carpeta** indica dónde trabaja el agente. Su menú (“Proyecto o carpeta donde trabajar”) tiene un campo, **Busca un proyecto o una carpeta, o escribe una ruta**, sobre dos listas cortas, cada fila con su ubicación:

- **Proyectos**: tus proyectos por nombre, los cinco en los que trabajaste más recientemente (y el elegido), cada uno con su carpeta. Al elegir uno, la carpeta pasa a ser la del proyecto, junto con su agente y sus pautas para la sesión; el chip entonces dice **Proyecto** y muestra el nombre del proyecto. Un grupo de proyectos funciona igual, con todos sus proyectos. **Nueva**, al final del encabezado, crea un proyecto (sesiones, archivos y memoria juntos) y lo elige. Consulta [Proyectos y conocimiento](/guide/projects) y [Pautas de los agentes](/guide/guidelines).
- **Carpetas**: la carpeta en uso y las tres últimas carpetas que elegiste, cada una con la carpeta en la que está. **Examinar**, al final del encabezado, muestra las carpetas de tu carpeta personal.
- **Nueva carpeta de tarea** (“una nueva en ~/Hydor”): una carpeta nueva para esta tarea, con un nombre formado por el día y unas pocas palabras de tu mensaje (como `2026-11-01-plan-trip-lisbon`), en `~/Hydor` a menos que definas otro lugar en [Carpetas de tarea](/settings?s=assistants&find=Task%20folders) (Configuración → Capacidades → Tus agentes).

La carpeta propia de un proyecto es el proyecto: el menú la muestra solo como el proyecto, y una sesión iniciada en ella trabaja en el proyecto, incluso cuando en la página de inicio se había elegido la carpeta en lugar del proyecto.

El menú se abre encima o debajo del chip, donde haya más espacio, y cabe sin desplazarse: en una ventana pequeña muestra menos carpetas, luego menos proyectos, y una línea como “2 más” bajo los proyectos recupera el resto.

Escribe en el campo para encontrar más:

- Un nombre encuentra proyectos que coincidan, y carpetas entre las que usaste hace poco, en la carpeta en uso y en tu carpeta personal. La carpeta de un proyecto, encontrada por su nombre, se muestra como el proyecto.
- Una ruta (`~/code/`, o `code/` desde tu carpeta personal) muestra las carpetas que hay allí, igual que **Examinar**. La flecha al final del campo sube una carpeta; la cruz, o Escape, vuelve a las listas.
- ↑ ↓ e Intro eligen. Tab, o la flecha al final de una fila, muestra las carpetas que contiene.

Cuando la carpeta está en un repositorio git (y no has elegido una carpeta de tarea nueva), el menú termina con un interruptor: **Nuevo worktree** desde main (o la rama que esté activa), “Una rama nueva, en una copia del” repositorio. Con él activado, la sesión trabaja en una copia propia en una rama nueva; el chip dice “· nuevo worktree”. Consulta [Trabajar en un worktree](#work-in-a-worktree).

Que una sesión reciba por defecto una carpeta de tarea nueva depende del agente: la mayoría empieza en una a menos que elijas una carpeta; Programador trabaja en la carpeta que elijas, y un agente de un proyecto, en ese proyecto.

### Elegir un agente

**Agente** define como quién trabaja la sesión: **General** (hasta que elijas otro; en un proyecto que tiene un agente propio, ese agente), **Investigador**, **Redactor**, **Programador**, **Tutor**, **Planificador**, **Analista**, **Creador de apps**, o uno de los tuyos en **Tuyos** (los que funcionan en todas partes y los del proyecto elegido). Coloca el puntero sobre uno para leer qué hace y qué programa y modelo usa. Al elegir uno, también se pueden fijar el programa, el modelo y los permisos que sugiere (el modelo de su nivel, cuando piensa con uno), y activar sus cuentas conectadas. **Crear o cambiar agentes** abre la [página de Agentes](/agents). Consulta [Agentes](/guide/agents).

### Opciones: esfuerzo, permisos y más

**Opciones** contiene el resto. Su chip dice “Opciones”, o nombra lo que fijaste distinto de lo habitual, como “Esfuerzo alto · Planificar · tope de $5,00”. En una computadora, su menú termina con un recordatorio: Mayús+Tab en el cuadro de mensaje cambia los permisos.

- **Esfuerzo**: cuánto piensa el modelo. **Predeterminado** usa el propio del modelo, y después vienen los niveles que ofrece el modelo: **Bajo** (rápido, razonamiento ligero), **Media** (equilibrado), **Alto** (razonamiento más profundo), **Xhigh** (razonamiento extraprofundo), **Máximo** (razonamiento máximo) y, en algunos modelos, **Minimalista**, **Ninguno** o **Ultra**. No se ofrece para Custom ni otros agentes ACP, ni para modelos sin niveles.
- **Permisos**: lo que el agente puede hacer sin preguntarte antes. Cada agente tiene sus propios modos; consulta [Qué significa cada modo de permisos](#what-each-permissions-mode-means). Mayús+Tab en el cuadro de mensaje pasa al siguiente.
- **Cuenta**: solo cuando has añadido otra cuenta para Claude Code o Codex en [Configuración → Agentes → Cuentas](/settings?s=accounts&find=Accounts). **Tu inicio de sesión** es la cuenta propia del agente; elige otra para ejecutar esta sesión con ella. **Administrar cuentas** abre Configuración.
- **Confidencial**, un interruptor con un candado (“Solo modelos de esta computadora. Nada sale de ella.”): para un artículo que revisas, datos de pacientes o el código de un cliente. **Se ejecuta en** pasa a **Custom** y **Modelo** al mejor modelo instalado aquí. Consulta [Mantener una sesión confidencial](#keep-a-session-confidential).
- **Memoria**: solo mientras la memoria esté activada en Configuración. **Activado** usa y amplía lo que los agentes recuerdan; **Desactivada para esta sesión** empieza de cero y no conserva nada de ella. Consulta [Memoria](/guide/memory).
- **Límite de gasto**: lo máximo que puede gastar esta sesión, a precios de API. Escribe una cantidad y pulsa **Fijar**, o elige $1, $5, $10 o $25; **Sin tope** lo quita. La sesión se detiene al llegar al tope hasta que lo subas. Consulta [Uso, límites y costos](/guide/usage).
- **Enjambre**: **Desactivado**; **Enjambre**: un agente líder divide la tarea en líneas de ataque y pone en marcha un miembro para cada una, con tantos trabajando a la vez como permita **Tamaño del enjambre** ([Configuración → Capacidades → Subagentes](/settings?s=children&find=Swarm%20size)). Los miembros comparten lo que encuentran en un tablero y se envían mensajes entre sí. Para problemas difíciles; cuesta varias veces lo que cuesta un solo agente. O **Campaña** (“Un gran cambio en partes, cada una en un worktree”): el líder divide un gran cambio en partes, cada miembro hace una en una rama propia con sus pruebas, y el líder las fusiona; la carpeta debe ser un repositorio git (consulta [Campañas](/guide/engineering#campaigns-a-big-change-in-many-parts)).
- **Investigación**: **Desactivado**, o **Investigación profunda**: el agente planifica las búsquedas, envía investigadores tras cada parte, contrasta las afirmaciones clave con dos fuentes y entrega un informe con citas. Define **Investigadores a la vez** (de 1 a 8), **Rondas** (de 1 a 5), **Búsquedas en total** (de 10 a 500) y **El informe** (**Página** o **Word**).
- **Arena**: **Desactivado**, o **Comparar modelos**: el mismo mensaje también se envía a uno o dos modelos más que marques (un campo **Buscar un modelo** ayuda en una lista larga), cada uno en una sesión propia en la misma carpeta. Comparas las respuestas y te quedas con la mejor; las demás se archivan. En un repositorio git, activa **Nuevo worktree** en el menú de la carpeta para que cada modelo trabaje en su propia copia.

Enjambre (o una campaña) e investigación profunda dirigen ambos subagentes de Hydor, así que activar uno desactiva el otro. **Confidencial** desactiva Enjambre, la investigación profunda y la arena, y activar uno de ellos desactiva Confidencial. Enjambre, la investigación profunda y la arena no se conservan para la siguiente sesión, porque cuestan más; los números de investigación y los modelos de la arena que elegiste se conservan en este navegador para cuando vuelvas a activarlos. Consulta [Investigación profunda, segundas opiniones y varios agentes](/guide/research).

### Qué significa cada modo de permisos

**Claude Code**

| Modo | Qué puede hacer el agente |
| --- | --- |
| Preguntar (su modo predeterminado) | Pregunta antes de editar y de ejecutar comandos que no estén permitidos en su configuración |
| Aceptar ediciones | Edita archivos libremente, pregunta antes de otros comandos |
| Automático | Una comprobación de seguridad aprueba las acciones rutinarias y te consulta sobre las riesgosas |
| Planificar | Solo lee y planifica, y luego propone un plan para que lo apruebes |
| Bypass | Nunca pregunta (acceso total) |

**Codex**

| Modo | Qué puede hacer el agente |
| --- | --- |
| Planificar | Conversa y planifica primero; puede hacerte preguntas para aclarar |
| Solo lectura | Lee archivos y responde; pregunta antes de cambiar cualquier cosa |
| Automático (su modo predeterminado) | Edita archivos y ejecuta comandos en su carpeta; pregunta para ir más allá |
| Revisión automática | Como Automático, pero un agente revisor responde a sus solicitudes de aprobación |
| Acceso total | Sin sandbox y sin aprobaciones |

Dentro de Docker, el sandbox propio de Codex no puede iniciarse, así que **Acceso total** es el modo predeterminado allí y el menú explica por qué.

**Custom**

| Modo | Qué puede hacer el agente |
| --- | --- |
| Preguntar (su modo predeterminado) | Pregunta antes de editar archivos y antes de ejecutar comandos; mirar alrededor se ejecuta libremente |
| Aceptar ediciones | Edita archivos de la carpeta libremente, pregunta antes de ejecutar comandos |
| Automático | Los pasos rutinarios siguen adelante; una comprobación rápida te consulta sobre los riesgosos |
| Acceso total | Ejecuta herramientas y comandos sin avisos de aprobación ni el sandbox de comandos, con los permisos de la cuenta de tu computadora |
| Planificar | Solo lee y planifica: sin ediciones, sin comandos |

Fuera de Acceso total, Custom te pregunta antes de ejecutar comandos riesgosos. En Preguntar, Aceptar ediciones y Planificar también pregunta antes de leer o cambiar archivos fuera de la carpeta, o archivos que contienen claves o contraseñas; en Automático, la comprobación rápida los evalúa primero. Consulta [Custom, el agente propio de la app](/guide/custom).

**Otros agentes ACP** ofrecen sus propios modos, que se muestran una vez que el agente se ha ejecutado.

### Mantener una sesión confidencial

Algunos trabajos no deben salir de tu computadora: un artículo que te enviaron para revisar (la mayoría de las conferencias y revistas prohíben entregar un envío a una IA en línea), registros de pacientes o clientes, o el código de una empresa con la que trabajas bajo acuerdo. Una sesión confidencial se ejecuta en un modelo de esta computadora, y nada de ella se envía a ningún sitio.

1. En la página de inicio, abre **Opciones** y activa **Confidencial** (“Solo modelos de esta computadora. Nada sale de ella.”). Su chip entonces dice “Confidencial”.
2. **Se ejecuta en** pasa a **Custom** y **Modelo** al mejor modelo instalado aquí; mientras esté activado, sus menús ofrecen solo esos. Si aún no hay ninguno, lo indica: [Configuración → Agentes → Modelos](/settings?s=models) instala con un clic los sugeridos para esta computadora.
3. Escribe lo que quieres, adjunta el artículo o elige su carpeta, y pulsa Intro. Por ejemplo: “Revisa el envío adjunto como revisor de NeurIPS: resumen, puntos fuertes, puntos débiles, preguntas para los autores y una puntuación.”

Los modelos de esta computadora son los de Ollama y vLLM instalados aquí, y los endpoints cuya dirección es esta computadora o tu red privada: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, de `172.16.…` a `172.31.…`, o un nombre que termina en `.local` (consulta [Conectar Ollama, vLLM u otro endpoint](/guide/agents-models#connect-ollama-vllm-or-another-endpoint)). Los modelos en la nube de Ollama, cuyos nombres terminan en “cloud”, se ejecutan en ollama.com y no cuentan. La página de inicio mantiene el interruptor activado para tus próximas sesiones hasta que lo desactives.

Una sesión confidencial tiene un candado junto a su título, en su encabezado y en la barra lateral, y su cuadro de mensaje tiene un borde verde tranquilo; una línea sobre el cuadro explica qué significa hasta que la cierres. Haz clic en el candado para ver qué está activado y qué no.

- **Desactivado**: la búsqueda web y las páginas web, el navegador y tu pantalla, las apps conectadas y tus claves, las apps, la publicación, las tareas programadas, crear, buscar o editar imágenes, dibujos, gráficos, videos o sonido, los modelos de otros lugares (investigación profunda, enjambre y la arena; una [segunda opinión](/guide/research) solo puede venir de un modelo de otro fabricante en esta computadora), pasar la conversación a otro agente, guardar cualquier cosa en la memoria y exportar una página como archivo (expórtala tú mismo desde la página).
- **Comandos sin red**: los comandos del agente se ejecutan aislados de la red, en todos los modos de permisos, de modo que no se puede descargar, instalar desde internet, subir ni enviar nada. Donde esto no es posible (Windows, algunos contenedores), cada comando te pregunta antes, sea cual sea el modo, y la nota del candado lo indica.
- **Sigue activado**: los archivos de la carpeta, los documentos (leídos en esta computadora), las páginas, imágenes y archivos que guardaste, el conocimiento compartido, tus notas de memoria y tu perfil (se leen, nunca se amplían), los subagentes de Hydor, que también son confidenciales, y las UI de respuesta (sin imágenes ni mapas de la web).
- **No se envía nada al exterior sobre ella**: su título lo escribe el modelo auxiliar cuando se ejecuta en esta computadora y, si no, sale de las primeras palabras de tu mensaje; las notificaciones dicen solo “Una sesión confidencial” y si terminó, te necesita o falló; no hay enlace de solo lectura, ni pull request desde su menú, ni automatización ni app creada a partir de ella; los agentes de otras sesiones y los agentes de otros lugares no pueden leerla; sus respuestas no muestran imágenes de la web, y las páginas que muestra no cargan nada de ningún sitio (así que un gráfico que necesite una biblioteca de la web no se dibujará); el dictado funciona solo con reconocimiento de voz en esta computadora ([Configuración → Capacidades → Voz](/settings?s=voice)), y las respuestas se leen en voz alta solo con una voz de tu dispositivo.
- **Sigue siendo confidencial**: las bifurcaciones y **Editar desde aquí** también son confidenciales, y no se puede desactivar, de modo que lo que se dijo se queda donde está. Para un trabajo que pueda salir de la computadora, empieza una sesión nueva.

Lo que no puede prometer: Hydor comprueba dónde está el servidor de un modelo, no lo que hace ese servidor, así que un endpoint que configures en tu red y que reenvíe las solicitudes a un servicio en línea sigue estando en línea. Lo que copies de la sesión, o abras o envíes tú mismo desde otro lugar (un enlace en una respuesta, una página que creó abierta desde los archivos del proyecto, un push desde la página de Git), queda bajo tu responsabilidad, y también lo que leas de ella en otro dispositivo: las páginas de la app viajan hasta él como siempre (a través de tu túnel, si usas uno).

### Adjuntar archivos, señalar archivos, usar comandos

- **Adjuntar archivos** (el **+** a la izquierda de la fila inferior del cuadro), suelta archivos sobre el cuadro de mensaje, o pega imágenes y archivos en él. Un mensaje admite hasta 25 MB de archivos. Las imágenes (PNG, JPEG, GIF, WebP) llegan al modelo como imágenes, hasta 8 por mensaje; los demás archivos (hasta 20) se guardan en esta computadora y se enumeran al final de tu mensaje, para que el agente los abra. Quita uno con su × antes de enviar. Los archivos que has adjuntado esperan en el cuadro hasta que los envíes, incluso si vas a otra página (al recargar la página se borran).
- **Adjuntar una captura de pantalla** (en el mismo menú **+**, en computadoras; donde el navegador no puede hacer una, el **+** es un clip que adjunta archivos): tu navegador pregunta qué pantalla, ventana o pestaña, y se adjunta una imagen de ella.
- **@**: escribe @ y parte del nombre de un archivo para ver los archivos coincidentes de la carpeta; ↑ ↓ para moverte, Intro o Tab para insertarlo, Esc para cerrar.
- **/**: al comienzo del mensaje, / muestra los comandos y habilidades del agente (los de Claude Code), con lo que hace cada uno.
- El micrófono (dictar tu mensaje) y los auriculares (modo de voz de manos libres) están junto al botón de enviar cuando tu navegador o esta computadora pueden reconocer voz. Consulta [Documentos, imágenes, videos y voz](/guide/documents-voice).

### Qué recuerda la página de inicio

La página de inicio conserva tus elecciones para cada lugar en el que trabajas: cada proyecto, cada carpeta y **Nueva carpeta de tarea**, en todos tus dispositivos. Un lugar conserva su **Se ejecuta en** (el programa), el **Modelo** de cada programa y, en **Opciones**, su **Esfuerzo** y **Permisos**, el **Agente**, **Memoria**, el **Límite de gasto**, **Confidencial** y el interruptor **Nuevo worktree**. La cuenta (**Opciones → Cuenta**) no se conserva por lugar: sigue siendo la que elegiste, en todas partes. Al elegir un programa en un lugar, vuelve lo último que usaste con él allí.

Un lugar conserva sus elecciones cuando cambias una de ellas allí o empiezas una sesión allí; solo mirar un lugar no conserva nada. Elige un lugar en el chip **Carpeta** (un proyecto, una carpeta o **Nueva carpeta de tarea**) y el cuadro se abre con las elecciones de ese lugar, mientras lo que has escrito y adjuntado se queda en él. Empezar desde un proyecto (**Nueva sesión** en su tarjeta o página, o el proyecto en la barra lateral) abre la página de inicio con las elecciones de ese proyecto, y **Nueva sesión en esta carpeta** sobre una carpeta (en Archivos o en la barra lateral) la abre con las elecciones de esa carpeta. La página se abre en el último lugar que elegiste.

Un lugar donde aún no has elegido ni empezado nada se abre con los valores predeterminados: el agente es **General**, o el agente propio del proyecto cuando el proyecto tiene uno (y se aplica lo que ese agente sugiere, como cuando lo eliges: su programa, el modelo de su nivel y sus permisos); el **Modelo** es **Automático** donde se ofrece, y si no, el predeterminado del programa; **Esfuerzo** y **Permisos** son los habituales del programa; la memoria está activada; no hay límite de gasto; **Confidencial** y **Nuevo worktree** están desactivados. **Se ejecuta en** sigue siendo el programa que usaste por última vez. El lugar que habías elegido por última vez antes de que se añadiera esto conserva las elecciones que tenía.

Un enlace a la página de inicio puede rellenarla, por ejemplo `/?prompt=Summarize%20my%20notes&agent=codex`; se pueden añadir `model=`, `cwd=` (la ruta de una carpeta) y `confidential=1` (Confidencial activado). Solo rellena el cuadro y las opciones; nunca empieza nada por sí solo. Los caracteres invisibles se eliminan de un mensaje que llega por enlace, con un aviso.

Lo que escribes en el cuadro espera allí mientras vas a otras páginas: el mensaje, los archivos que adjuntas, las opciones solo para esta tarea (**Enjambre**, **Investigación profunda**, **Arena**, **Pautas** para esta sesión) y la carpeta en la que lo abrió un enlace o **Nueva sesión de agente aquí**. El cuadro se vacía cuando empieza la sesión: mientras el agente se pone en marcha, la flecha de **Inicio** sigue subiendo; luego la página de inicio se convierte en la sesión, el cuadro baja a su lugar en la parte inferior y lo que escribiste sube como tu primer mensaje. El mensaje y esas opciones se conservan en este navegador, así que siguen allí después de recargar; los archivos adjuntos no.

## Seguir el trabajo en una sesión

### El encabezado

En la parte superior de una sesión:

- el icono del agente y el título (haz doble clic en él para cambiarle el nombre), y un candado si es una [sesión confidencial](#keep-a-session-confidential);
- un estado: **Funcionando**, **Te necesita**, **Listo**, **Iniciando**, **Creando memoria**, **Deteniendo**, o "Open in VS Code" para una sesión que se ejecuta en otro lugar; cuando su agente ya no está en ejecución, cómo terminó el trabajo: **Hecho** cuando terminó su último turno (con "· 2 files made" o "· 3 files changed" cuando creó o modificó archivos), **Detenidas** cuando la detuviste tú o se interrumpió antes de terminar, **Fallido** cuando terminó con un error. Si te acercas con el cursor, te indica qué hacer a continuación;
- la carpeta (haz clic en ella para explorarla en Archivos), una insignia de pull request, la cuenta cuando se ejecuta con una cuenta añadida, y en pantallas más anchas la rama de git y el modelo;
- un botón para lo que puedes hacer ahora: **Detener** mientras se ejecuta un turno, **Reanudar** cuando el agente no está en ejecución (después de **Detenidas** o **Fallido**; más discreto después de **Hecho**, ya que un mensaje en el cuadro continúa la sesión de todos modos), o **Continuar aquí** para una sesión de Claude Code abierta en VS Code o en una terminal;
- **Detalles** (que muestra las líneas añadidas y eliminadas una vez que se modificaron archivos), que abre [el panel de detalles](#the-details-panel-changes-commands-and-info);
- el menú de la sesión (⋯): consulta [Todo lo que hay en el menú de la sesión](#everything-in-the-sessions-menu).

### Turnos, pasos y respuestas

La conversación se lee como un chat. Cada turno consta de tu mensaje, el trabajo del agente y la respuesta con la que termina:

- **Tu mensaje** aparece a la derecha, con sus imágenes y archivos adjuntos, en cuanto lo envías, antes de que el agente lo reciba: el agente aparece trabajando debajo y el cuadro de mensaje queda libre para el siguiente. Si no llega a enviarse (sin conexión, se alcanzó un límite de gasto), desaparece y vuelve al cuadro de mensaje, con un aviso que indica el motivo. Uno largo se pliega a sus primeras líneas; **Mostrar más** lo abre.
- **El trabajo** aparece bajo una línea que lo resume: "Worked for 2m 10s · 3 commands", "Thought", "Stopped after 40s" o "Failed after 5s", con lo que costó el turno a la derecha ("≈ $0.12"): haz clic en ella para ver el [tiempo y costo](/guide/sessions#a-turns-time-and-cost) del turno. En un plan (Claude Code, Codex) eso es lo que costarían sus tokens a precios de API, no lo que pagas; si no se conoce el precio del modelo, aparecen allí los tokens. Mientras el turno se ejecuta, la línea dice "Working · 1m 2s" (o "Waiting for you") y el esquema del trabajo crece a medida que avanza; después de turnos anteriores añade cuánto ha trabajado la sesión en total, todos sus turnos juntos: "Working · 1m 2s (47m)". Un turno terminado pliega su trabajo; haz clic en la línea para abrirlo.
- **El esquema del trabajo**: cada nota breve que el agente escribe entre sus pasos (lo que encontró, lo que hará a continuación) inicia una parte, y los pasos que da después van dentro de ella. Una parte terminada es una sola línea con una marca de verificación: la nota en pocas palabras ("Run the checkout tests first to see what fails", "Apply the discount first and round once"), cuántos pasos dio y las líneas que modificó. Haz clic en ella para ver la nota completa y cada paso. La parte en curso muestra la nota del agente completa y, debajo, el paso que se está dando ahora, como "Editing total.ts · 4 s"; haz clic en esa línea para ver los pasos de la parte hasta el momento. Los pasos dados antes de la primera nota del agente forman una parte con el nombre de lo que hicieron ("Ran 3 commands, read 2 files"). Un turno largo muestra sus últimas partes; **Show 12 earlier parts** muestra el resto.
- Los **Pasos** se nombran con palabras sencillas: "Run the tests", "Read index.ts", "Searched the web", con el comando en sí en un tipo de letra más discreto. Haz clic en uno para ver lo que hizo. Claude Code ejecuta por su cuenta un comando u otro paso que cambie cosas; los pasos propios de Hydor que el agente pidió después en el mismo mensaje (búsquedas en la web, lecturas de páginas…) esperan hasta que este termine. Un paso así muestra **Esperando** en lugar de su reloj, de forma discreta, hasta que realmente empieza; entonces su reloj cuenta desde ese momento, y un paso terminado muestra el tiempo que realmente tardó. La línea del esquema para el paso en curso nombra el paso que de verdad se está ejecutando.
- Los **pensamientos** aparecen como "Thought for 12s" con su primer encabezado; haz clic para leerlos.
- **La respuesta** es lo que el agente escribió después de su último paso. Las páginas que el agente mostró van con ella. Mientras el agente trabaja, una nota breve que escribe después de su último paso aparece en el esquema, como la parte en curso; si el turno termina ahí, se convierte en la respuesta.
- **Respuestas entre pasos**: lo que el agente escribe entre sus pasos y se lee como una respuesta (su contestación a un mensaje que enviaste mientras trabajaba, o lo que encontró antes de seguir, en varios párrafos, una lista o una tabla) también se muestra como respuesta, en su lugar, sin plegarse dentro del trabajo. El trabajo anterior y el posterior quedan cada uno bajo su propia línea, como "Worked for 20s · 2 commands".
- **Archivos modificados**: bajo la respuesta, una tarjeta enumera todos los archivos que cambió el turno, con las líneas añadidas y eliminadas. Haz clic en un archivo para ver su diff; **Abrir archivo** lo abre. Si son más de cinco, el resto se pliega tras "Show 3 more files".
- **Documentos creados**: bajo la respuesta, los documentos que el agente creó o modificó en el turno (PDF, Word, Excel, PowerPoint, LaTeX, cuadernos, Markdown y más) aparecen como tarjetas marcadas como **Nueva** o **Actualizada**, los haya entregado o no, y los nombres de archivo y las rutas en la respuesta son enlaces que abren el archivo en una ventana sobre la conversación ([Documentos que creó o modificó](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply)).
- **Commits**: cuando el agente hizo commits en el turno, un chip bajo la respuesta lo indica: **Commit hecho** · el título del commit, o "3 commits" con las ramas, y las líneas añadidas y eliminadas. Haz clic en él (si son varios, luego en un commit) para leer el mensaje completo, quién lo hizo y cuándo, su hash (haz clic para copiarlo) y cada archivo que cambió con su diff. **Abrir en Git** lo abre en el repositorio de la sesión en la [página de Git](/git). Un commit que el agente modificó o reubicó con rebase en el mismo turno no aparece.

El agente también puede llevar una lista de verificación (**Plan** o **Pendientes**, con cuántos están hechos), que se va marcando a medida que trabaja. Las notas de la app siguen al turno al que se refieren: lo que guardó la memoria, una segunda opinión, un límite de gasto alcanzado, la tarjeta de los subagentes que inició un turno. Los mensajes de otras sesiones aparecen como "From …", la respuesta de un subagente (de Hydor, de Claude Code o de Codex) como "Reply from …" (haz clic para leerla), y la ejecución de una tarea programada empieza con una línea que nombra la tarea.

Las líneas de día ("Yesterday", "Today") separan los días; una conversación toda de hoy no tiene ninguna. Los mensajes más antiguos se cargan al desplazarte hacia arriba, o con **Mostrar mensajes anteriores**. Los mensajes y respuestas nuevos entran al final de la conversación, sin dejar espacio vacío debajo. Cuando una respuesta es lo bastante larga para llenar la pantalla, la vista se detiene en su primera línea y se queda ahí mientras crece, de modo que leas una respuesta larga desde el principio; una corta simplemente queda debajo de lo anterior. Si te desplazas hacia arriba mientras el agente trabaja, la vista se queda donde estás; **Último** te lleva de vuelta al final, y también aparece cuando una respuesta sigue más abajo de la pantalla.

Bajo cada respuesta terminada están **Copiar mensaje**, **Bifurcar desde esta respuesta** y **Leer en voz alta**. **Bifurcar desde esta respuesta** funciona en cualquier respuesta de Claude Code, y en la última respuesta de un turno terminado para Codex y Custom, ya que estos bifurcan un turno completo. Bajo cada uno de tus mensajes, **Copiar mensaje**, **Editar desde aquí** y la hora a la que se envió se muestran siempre, no solo al pasar el cursor.

### Tiempo y costo de un turno

El costo a la derecha de la línea de un turno terminado ("≈ $0.12", o los tokens cuando no se conoce el precio del modelo) abre **Tiempo y costo**, para ver por qué un turno tardó mucho o costó mucho:

- **Duración**: una barra de adónde fue el tiempo del turno, cada parte con su proporción y duración: **El modelo** (leer lo que se le dio, pensar y escribir), **Comandos**, **Lectura y edición de archivos**, **La web**, **Otros pasos** (subagentes, herramientas de apps conectadas), **Esperándote** (aprobaciones, preguntas y formularios, desde que apareció cada tarjeta hasta que la respondiste) y **El resto** (el inicio y los intervalos entre pasos). Los pasos que se ejecutaron en paralelo cuentan una sola vez. Debajo, "First reply or step after 3 s": con qué rapidez empezó el agente.
- **Tokens**: **Leído de nuevo**; **Escrito en la caché** (leído de nuevo y conservado por el proveedor del modelo, para que la siguiente solicitud lo lea a menor costo); **Leído de la caché**, con su proporción de todo lo leído; y **Escrito** (respuestas, pensamientos y pasos).
- **Costo**: el costo del turno y, cuando se conoce el precio del modelo, el de cada tipo, con "The cache saved about $0.80.". En un plan (Claude Code y Codex, salvo que una sesión se ejecute con crédito de API) dice "At API prices: on a plan you pay your plan's fee". Si no se conoce el precio del modelo, dice que su costo no se cuenta.

Los turnos de Claude Code dan el tiempo propio del modelo y la primera respuesta; en otros agentes, la parte del modelo es su razonamiento. El costo y este panel se muestran en pantallas más anchas.

### Matemáticas, diagramas, figuras e imágenes en las respuestas

Los agentes escriben sus respuestas para esta app, no para una terminal, así que una respuesta puede contener más que texto. Todos los agentes saben hacerlo y usan estos recursos por sí mismos cuando aclaran una respuesta:

- **Formato**: encabezados, listas, tablas, negritas y código, dispuestos para que se lea bien.
- **Matemáticas**: ecuaciones dibujadas como en un libro de texto, dentro de una oración o aparte en una línea propia, y ecuaciones químicas (2H₂ + O₂ → 2H₂O). Los números entre signos de dólar emparejados (`$1$`, `$0$`) también son matemáticas; los precios normales como $4.70 siguen siendo dinero.
- **Diagramas**: diagramas de flujo, de secuencia y de estados, líneas de tiempo, mapas mentales, gráficos de Gantt y de sectores, dibujados con los colores de la app, en claro u oscuro. La barra sobre uno tiene **Mostrar el código** (lo que escribió el agente; el mismo botón vuelve a mostrar el diagrama), **Guardar como imagen (SVG)**, **Pantalla completa** y un botón que copia su código. Un diagrama que no se puede dibujar muestra su código, con el motivo.
- **Figuras y pequeñas herramientas**: un gráfico, una figura anotada, una calculadora, una simulación con controles deslizantes o un cuestionario corto se ejecutan dentro de la respuesta, aislados de la app y de tus archivos como las páginas que muestran los agentes. Toma el aspecto de la app y crece para ajustarse (**Ver todo** abre uno alto); su barra tiene **Mostrar el código** (**Mostrar** vuelve), **Guardar como archivo** y **Pantalla completa**. Las opciones que eliges en él van a tu cuadro de mensaje. Mientras la respuesta aún se está escribiendo, se va construyendo en su lugar ("Writing…" hasta que tenga algo que mostrar), y cobra vida cuando está completa.
- **Imágenes**: fotos de la web (un lugar, un producto, una planta, una obra de arte) e imágenes de esta computadora, ajustadas a la respuesta; haz clic en una para verla en grande, donde **Editar** la abre en el editor de imágenes ([Editar imágenes y videos](/guide/library#edit-pictures-and-videos)). Las imágenes de la web llegan a través del servidor de esta app, así que el sitio que las tiene nunca ve tu navegador. Una que no se puede cargar aparece como un enlace a ella.

Para obtener texto sin formato, dilo en tus [Pautas de los agentes](/guide/guidelines) ("Responde en texto sin formato, sin diagramas ni imágenes") o en tu mensaje. También puedes pedir cualquiera de estos recursos con palabras sencillas: "dibuja los pasos como un diagrama de flujo", "muéstrame una imagen de eso", "dame un control deslizante para probar otros valores".

### UI de respuesta: tarjetas, gráficos y mapas en las respuestas

Cuando una parte de una respuesta es algo para mirar, comparar, elegir, seguir, probar o practicar en lugar de leer, el agente la muestra en una de las UI de respuesta de la app: cerca de 150 tarjetas, tablas, gráficos, mapas, galerías, líneas de tiempo y pequeñas herramientas ya preparadas, rellenadas con el contenido de la propia respuesta. La mayoría de las respuestas de más de unas pocas líneas tienen una parte así, de modo que las verás en casi todas. Las opciones para comparar se convierten en una tabla con el mejor valor de cada fila marcado, una receta en una tarjeta cuyas raciones escalan sus cantidades, un pronóstico en las próximas horas y días, los lugares en un mapa con marcadores numerados, un cuestionario o problemas de práctica en preguntas que respondes en el mismo lugar. Cada una se va construyendo a medida que llega la respuesta, con el aspecto de la app, en claro u oscuro.

- **Lo que puedes hacer en una**: ordenar y filtrar una tabla, cambiar un gráfico a sus números, marcar una lista de verificación, iniciar los temporizadores de una receta, voltear tarjetas de estudio, unir pares o completar espacios en blanco, responder las preguntas de una guía de solución de problemas, girar una ruleta para que elija por ti, mover los controles deslizantes de una calculadora o de la gráfica de una función, reproducir un video. Lo que marcas o respondes sigue ahí cuando vuelves a la conversación en este dispositivo (las respuestas de práctica también). Un botón que dice **Enviar** (**Enviar mi elección**, **Enviar mi puntuación**, **Enviar mi resultado**, **Enviar** y similares) envía de inmediato lo que nombra como tu siguiente mensaje, como si lo hubieras escrito y pulsado Intro: la opción que elegiste, tu puntuación del cuestionario, dónde se detuvo la ruleta. **Enviado** junto a él indica que se envió. Lo que estés escribiendo se queda en el cuadro de mensaje; cuando la sesión no puede recibir un mensaje en ese momento (otro sigue en camino), las palabras pasan al cuadro para que las envíes tú. Algunas van más lejos:
  - Los **Problemas de práctica** que respondes con tus propias palabras o números se revisan al instante (un número dentro de una tolerancia, palabras sin tener en cuenta las mayúsculas; una respuesta correcta cuyo único error es una tilde lo indica). **Mostrar una pista** da las pistas una a una; la solución resuelta aparece después de un intento, o cuando ya se han mostrado todas las pistas. Obtienes una puntuación, y **Enviar mis resultados** se la envía al agente. Tu respuesta a una pregunta abierta se envía con **Enviar para revisar**, para que el agente la revise.
  - **Código que puedes ejecutar y modificar**: un área de pruebas ejecuta JavaScript, Python o una pequeña página web en el mismo lugar, aislada de la app, con su salida (y los gráficos de Python) debajo. Tiene **Ejecutar**, **Restablecer**, **Copiar** y **Enviar mi código** (va al agente para que lo revise), y puede plantear tareas para probar. Python se carga desde la web la primera vez, por lo que no se ejecuta en una [sesión confidencial](/guide/sessions#keep-a-session-confidential).
  - **Un grafo de red** muestra cómo se conectan las cosas (un mapa de conceptos, los personajes de una novela, qué depende de qué): toca un nodo para iluminar sus conexiones y leer su nota, arrastra los nodos, lee la leyenda o cambia a la vista de **Lista**.
  - El **Texto anotado** marca pasajes de un texto: toca uno para leer su nota (una corrección, un comentario, un significado) y el cambio que sugiere, o **Preguntar sobre esto**. Filtra las notas por tipo, alterna entre **Original** y **Corregido** y usa **Copiar texto corregido**, o escucha el texto.
  - **Una verificación de datos** repasa las afirmaciones una por una, cada una con su veredicto, el porqué, qué tan seguro está el agente y las pruebas a favor y en contra, con fuentes. El recuento de veredictos de arriba filtra las afirmaciones cuando lo tocas.
  - Los **Seguimientos** son de dos a cinco botones con las siguientes preguntas o pasos al final de una respuesta: toca uno para enviarlo como tu siguiente mensaje cuando tu cuadro de mensaje está vacío, o para añadirlo a lo que estás escribiendo. Un botón que usaste recibe una marca de verificación.
- **Imágenes**: una entrada sin imagen, o cuya imagen no se puede cargar, se muestra sin ella, y su texto ocupa el espacio, de modo que no queda ningún cuadro vacío.
- **Números de una hoja de cálculo o de un archivo**: una tabla, un gráfico, cifras clave, un ranking, un histograma o valores en un mapa pueden leer sus números de una de tus hojas de cálculo (consulta [Hojas de cálculo](/guide/library#spreadsheets)), o de un archivo CSV, TSV, JSON o JSONL en la carpeta de la conversación o en la de su proyecto, en lugar de contenerlos. Los agentes lo hacen cuando los números viven ahí, cuando hay más de unas pocas decenas de filas, o para una tarjeta que quizá quieras conservar: la tarjeta suma, cuenta, agrupa, filtra y ordena por sí misma, así que no se vuelve a escribir nada, y muestra los números más recientes cada vez que se muestra (las filas que añadas después también, salvo que nombre un rango fijo de celdas). Una línea debajo indica de dónde vienen (**Datos de** *Shop numbers · Sales*, un enlace que abre la hoja de cálculo o el archivo), cuándo se leyeron y, cuando muestra solo una parte, cuánto ("1,000 of 12,400 shown"); **Volver a leer** los lee otra vez, y cuando guardas la hoja de cálculo la tarjeta se redibuja sola. Si la hoja de cálculo, su pestaña, una columna o el archivo ya no existen, la tarjeta lo dice con palabras sencillas, con **Reintentar**. Una tarjeta lee solo archivos de las carpetas de su conversación, no de otros lugares de tu computadora, de hasta 50 MB (un archivo JSON, 20 MB) y sus primeras 1.000.000 de filas; una hoja de cálculo creada en una [sesión confidencial](/guide/sessions#keep-a-session-confidential) solo la leen las tarjetas de esa sesión.
- **Al pasar el cursor** (o al llegar con el teclado), una pequeña barra en su esquina superior derecha: **Mostrar los datos** muestra lo que escribió el agente (en una tarjeta que lee una hoja de cálculo o un archivo, de dónde lee y qué muestra de él; **Mostrar** vuelve), **Copiar como texto** lo copia como texto sin formato, y **Pantalla completa** muestra la tarjeta sola sobre la página, tan ancha como tu ventana (en un teléfono, toda la pantalla), con desplazamiento cuando es alta; **Esc**, **Cerrar** o un clic a un lado te devuelve. Bajo **Más** (…): **Fijar en un tablero** guarda una copia de la tarjeta en uno de tus tableros, uno que elijas o un **Nuevo tablero…** al que le pongas nombre ahí mismo, para volver a ella junto a otras tarjetas (consulta [Tableros](/guide/library#boards)); **Guardar como imagen** guarda un PNG de la tarjeta tal como se ve, con el tema en que la ves y al doble de su tamaño para que se mantenga nítida, con el nombre de su título, y **Copiar como imagen** pone la misma imagen en el portapapeles, para pegarla en un mensaje o un documento (donde tu navegador permita que las páginas lo hagan). La pantalla completa tiene esas mismas dos arriba. Una tarjeta con un mapa, un gráfico dibujado por una biblioteca de gráficos, un reproductor de video o la salida de un área de pruebas de código no tiene botones de imagen (aun así se puede fijar): esas partes no se pueden dibujar en una imagen.
- **Cuándo las usan los agentes**: se les indica que usen una para cada parte de una respuesta que sea algo para mirar, comparar, elegir, seguir, probar, practicar o conservar, lo que ocurre la mayoría de las veces en una respuesta de más de unas pocas líneas: opciones que sopesar, cosas con imágenes y detalles (lugares, productos, películas, libros, personas, artículos, noticias), números, tiempo y planes, cosas que hacer, cosas que aprender, textos que revisar, afirmaciones que verificar y próximos pasos que quizá quieras dar. Rellenan las imágenes y reproducen un video donde ver ayuda más que una foto. Lo que una tarjeta no puede decir (el razonamiento, el consejo, las salvedades) queda en las palabras del agente. La conversación normal, una respuesta corta a una pregunta corta y los cambios de código siguen siendo texto. Cada respuesta, la primera y todas las siguientes, puede contener varias, una por cada una de sus partes (el itinerario de un viaje, su clima y una lista de equipaje), así que una conversación reúne tantas como necesiten sus respuestas; una respuesta posterior puede mostrar una otra vez con sus datos actualizados. El agente encuentra las que encajan con una sola búsqueda: por nombre las que ya conoce, y con unas pocas palabras sobre lo que muestra cada otra parte (por palabras y, cuando **Búsqueda por significado** está activada en [Configuración → Memoria](/settings?s=memory), también por significado), así que nunca se le entregan todas. Los [agentes integrados](/guide/agents#the-built-in-agents) se apoyan cada uno en las que van con su trabajo.
- **Véanlas todas**: [UI de respuesta](/answers) muestra cada una con un ejemplo, por grupo: resúmenes, comparaciones, compras, lugares y viajes, comida, planes, trabajo y negocios, números y gráficos, dinero, aprendizaje, ciencia, medios, personas y deportes, escritura y código. **Reproducir mientras llega** muestra una llegando como lo haría en una respuesta.

Pídelas también con palabras sencillas: "compáralos en una tabla", "ponlos en un mapa", "hazme un cuestionario sobre esto", "dame problemas de práctica sobre esto", "marca en mi ensayo lo que hay que corregir". Tus [Pautas de los agentes](/guide/guidelines) ("Responde en texto sin formato, sin tarjetas ni gráficos") o tu mensaje pueden pedir texto sin formato.

### Abre un paso para ver su salida

Haz clic en cualquier paso para abrirlo:

- un comando: el comando, la carpeta en la que se ejecutó, su código de salida y cuánto tardó, un botón de copiar y su salida (**Cargar toda la salida** cuando se cortó);
- una edición de archivo: el diff (**Cargar el diff completo** cuando se cortó);
- una lectura de archivo: un enlace al archivo y lo que se leyó;
- una página web: su dirección y lo que se leyó de ella;
- una tarea asignada a un subagente: **Tarea asignada**, y lo que volvió;
- cualquier otra cosa: lo que envió el agente y lo que volvió.

Un paso puede marcarse como **en segundo plano** (sigue ejecutándose), **Auto** (el modo Auto de Custom decidió, con el motivo al pasar el cursor), o mostrar un código de salida en rojo. Las tareas en segundo plano (un comando que se dejó en ejecución, un monitor, un flujo de trabajo) aparecen en una línea sobre el cuadro de mensaje, junto con los subagentes de la sesión; abre una tarea para ver su salida (Claude Code) y **Detener**la, lo cual pide confirmación antes; un subagente se abre como una sesión propia. Consulta [Subagentes](/guide/sessions#subagents).

## Crear la memoria de un proyecto antes de que el agente empiece

Cuando empiezas una sesión en la página de inicio en un proyecto cuya [memoria wiki](/guide/wiki-memory) aún es nueva (menos de 10 artículos, sin ninguna ejecución de crear desde el historial) y el proyecto tiene material con el que crearla (conversaciones, mensajes de commit, documentos, notas, un README o una carpeta docs/), la sesión pregunta primero. Una tarjeta bajo tu mensaje dice **¿Crear primero la memoria de <proyecto>?**, con lo que leería y cuánto tarda aproximadamente antes de que el agente empiece. La sesión muestra **Te necesita** (y recibes la notificación) hasta que elijas:

- **Crear memoria y empezar**: la memoria empieza a crearse, la tarjeta se convierte en su progreso y la sesión muestra **Creando memoria**. Tu mensaje espera («Se enviará al agente cuando la memoria esté lista») y llega al agente en cuanto se escribe la parte más importante: una visión general del proyecto a partir de sus archivos, sus notas y las conversaciones con más contenido. El resto se sigue creando en segundo plano, y los agentes lo encuentran a medida que aparece. **Empezar ahora** envía tu mensaje de inmediato y deja que la creación continúe; **Detener la creación** la detiene (lo que ya se escribió se conserva) y arranca el agente. Puedes cerrar la app: el agente empieza por sí solo. Si la creación falla antes de ese punto, la tarjeta lo indica, con **Reintentar** y **Empezar de todos modos**. Si el agente terminó antes de recibir tu mensaje (se bloqueó, o la computadora se reinició durante la espera) y no se puede volver a arrancar, la tarjeta ofrece **Empezar en una nueva sesión**: una nueva sesión con la misma configuración recibe tu mensaje, asume lo que enviaste mientras tanto, y la vacía se archiva.
- **Empezar sin memoria**: el agente empieza ahora, y este proyecto no vuelve a preguntar durante una semana.
- **No preguntar por este proyecto**: no vuelve a preguntar nunca por este proyecto. **Crear desde el historial** sigue disponible en la pestaña **Memoria** de los detalles del proyecto.

Todo lo que envíes mientras espera llega al agente después de tu primer mensaje. Solo pregunta cuando empiezas tú mismo una sesión en la página de inicio, nunca para ejecuciones programadas, apps, subagentes ni sesiones que empieza un agente, y tampoco para un proyecto que ya tuvo una creación.

## Aprobar o rechazar lo que el agente quiere hacer

Cuando el agente quiere hacer algo que sus permisos no le dejan hacer solo, espera y pregunta con una tarjeta al final de la conversación: lo que quiere ejecutar, un cambio de archivo con su diff, u otra herramienta y sus detalles, con el tiempo que lleva esperando. El punto de la sesión se pone ámbar, la bandeja de entrada lo cuenta y recibes una notificación si las activaste. Puedes responder desde la tarjeta, desde la [Bandeja de entrada](/guide/inbox) o, para un simple sí o no, desde la propia notificación donde el navegador muestre botones.

Los botones dependen del agente:

- **Claude Code**: **Permitir**, **Rechazar**, y a menudo una regla como «Permitir siempre Bash npm test» o «Permitir todas las ediciones en esta sesión».
- **Codex**: **Permitir**, **Permitir en esta sesión**, **Permitir siempre este comando**, **Rechazar**, **Rechazar y detener**; para cambios de archivos **Permitir ediciones en esta sesión**; para permisos más amplios **Permitir en este turno** y **Permitir en esta sesión**.
- **Custom**: **Permitir**, **Permitir siempre** seguido de exactamente lo que cubre (solo el comando que aprobaste, para que nada pueda colarse después) y **Rechazar**.
- Otros agentes: las opciones que ofrezcan.

**Rechazar** primero abre un cuadro, «Opcional: dile al agente qué hacer en su lugar»; pulsa **Rechazar** otra vez para enviar, con nota o sin ella. (**Rechazar** de Custom y **Rechazar y detener** de Codex responden al instante.)

Una herramienta de una cuenta conectada que configuraste en **Preguntar primero** no pregunta en la sesión: la llamada queda retenida en la Bandeja de salida y el agente continúa. Una línea en la conversación dice **Espera tu visto bueno en la Bandeja de salida**, y después si se envió o se descartó ([La Bandeja de salida](/guide/inbox#the-outbox-calls-held-for-your-ok)).

En el modo **Auto** de Claude Code, la comprobación de seguridad puede rechazar un comando directamente en lugar de preguntar. Entonces una tarjeta sobre el cuadro de mensaje dice «Claude bloqueó un comando» y explica por qué. **Aprobar y reintentar** cambia la sesión a Preguntar y hace que el agente ejecute el comando de nuevo, de modo que vuelve a ti como una aprobación normal; **Descartar** lo deja como está.

## Responder preguntas y aprobar planes

Cuando el agente te pregunta algo, una tarjeta con borde ámbar muestra las preguntas y sus opciones:

- Elige una opción, o varias donde dice «Elige las que quieras». **Otra — escribe tu propia respuesta** admite tus propias palabras.
- **Adjuntar archivos** añade archivos a una respuesta.
- Las teclas del 1 al 9 eligen una opción de la primera pregunta que aún no has respondido.
- **Enviar respuesta** la envía como tu siguiente mensaje. Si la sesión se detuvo mientras preguntaba, **Reanudar y responder** la inicia de nuevo con tu respuesta. Para una sesión de Claude Code que espera en VS Code o en una terminal, **Responder aquí** la termina allí y la continúa aquí con tu respuesta; una sesión de Codex allí debe responderse allí.

Cuando la pregunta llega como una tarjeta de aprobación, sus botones son **Enviar respuestas** y, para Claude Code, **Omitir**.

**Planes.** En el modo **Plan** de Claude Code, el agente lee y planifica, y luego muestra su plan en una tarjeta: **Aprobar, aceptar ediciones automáticamente** (adelante, editando sin preguntar), **Aprobar, preguntar antes de editar** o **Seguir planificando** (se queda en Plan; dile qué cambiar). En el modo Plan de Codex, Codex conversa y planifica primero y puede hacerte preguntas aclaratorias. El modo Plan de Custom termina con un plan numerado; cambia los permisos (Shift+Tab) y responde para que se lleve a cabo.

## Rellenar los formularios que pide un servicio

Cuando un servicio que conectaste necesita algo de ti a mitad de una tarea (una fecha, una elección, una página que aprobar), su formulario aparece como una tarjeta, sea cual sea el agente que trabaje: «Linear te pide que rellenes un formulario», «… te pide que abras una página» o «… pide permiso para continuar». Rellena los campos y pulsa **Enviar** (o **Abrir**, que abre la página, o **Permitir**), o pulsa **Rechazar** o **Ahora no**. Los servidores de herramientas propios de Codex preguntan de la misma manera. Consulta [Apps conectadas, claves y herramientas](/guide/connections).

## Escribir al agente mientras trabaja

Puedes escribir mientras un turno está en marcha. Lo que hace Enter entonces lo define **Enviar mientras un agente trabaja** en [Configuración → App → General](/settings?s=general&find=Sending%20while%20an%20agent%20works), para cada navegador:

- **Unirse al turno** (el valor por defecto): Enter añade tu mensaje al turno en curso, de modo que el agente lo tiene en cuenta enseguida. Ctrl+Enter (⌘Enter en Mac) lo pone en la cola.
- **Esperar**: Enter pone tu mensaje en la cola, para que salga cuando termine el turno. Ctrl+Enter lo añade al turno.

El cuadro de mensaje indica cuál: «Enviar un seguimiento al turno en curso» o «Poner un mensaje en la cola para cuando termine este turno». En una pantalla táctil, el botón de enviar hace lo que haría Enter. Custom recoge los seguimientos en el siguiente paso del modelo, cuando terminan las herramientas en ejecución; **Enviar ahora** hace lo mismo con un mensaje en cola. Si tu sesión de Custom ya estaba en marcha antes de una actualización de la app y todavía no puede recibir seguimientos en vivo, tu mensaje se queda en la cola hasta que termine el turno. Otros agentes ACP aceptan un mensaje a la vez, así que un mensaje enviado mientras trabajan siempre espera en la cola. En Claude Code, un mensaje que entró mientras el agente trabajaba muestra «enviado mientras trabajaba» debajo. La respuesta del agente aparece como una respuesta bajo tu mensaje, incluso cuando el agente luego continúa con su trabajo.

## Gestionar la cola

Los mensajes en cola esperan sobre el cuadro de mensaje, numerados en el orden en que saldrán; el que pones en cola aparece ahí en cuanto lo envías. Sale uno cada vez que termina un turno, por sí solo.

- Arrastra un mensaje por su asa para cambiar el orden.
- **Enviar ahora** (la flecha): lo envía de inmediato, al turno en curso.
- **Editar** (el lápiz): cambia su texto, quita adjuntos o añade más (**Adjuntar**, o pega o suelta archivos). Enter guarda, Esc cancela.
- **Quitar** (la papelera): lo saca de la cola; sus adjuntos se eliminan.
- Cuando detienes al agente, o la app se reinicia, la cola se pausa: «La cola está en pausa (se detuvo el agente o se reinició el servidor)». **Reanudar** deja que los mensajes salgan de nuevo a medida que el agente queda libre. Un límite de gasto alcanzado también retiene la cola; al subir el límite continúa.

## Cambiar el agente, el modelo, el esfuerzo o los permisos

El cuadro de mensaje de una sesión tiene el **Agente** de la página de inicio y sus tres opciones **Modelo**, **Esfuerzo** y **Permisos**, en un solo chip junto al **+** (abre **Opciones**, una hoja que sube desde abajo en un teléfono). Debajo están el resto de las opciones de la página de inicio para esta sesión, en el mismo orden: **Cuenta** (otra cuenta se hace cargo de la sesión desde tu siguiente mensaje; se muestra cuando el agente tiene más de una), **Confidencial** y **Arena** (se muestran tal cual: ambas se eligen al empezar una sesión, y un clic explica cómo conseguir la otra), **Memoria**, **Límite de gasto**, **Enjambre**, **Investigación** y **Pautas** (las mismas opciones y diálogos que [Configuración de la sesión](/guide/research#turn-it-on) en el menú de la sesión; Enjambre e Investigación cambian desde tu siguiente mensaje). El chip indica el agente y el modelo, y el esfuerzo y los permisos cuando no son los habituales; se vuelve ámbar mientras el agente puede hacerlo todo sin preguntar (**Omitir**, o **Acceso total** de Codex). Otro agente se aplica desde tu siguiente mensaje (consulta [Cambiar de agente en una sesión](/guide/agents#switch-agents-in-a-session)). Un cambio de modelo, esfuerzo o permisos se aplica al agente en marcha de inmediato y se queda con la sesión. Shift+Tab pasa al siguiente modo de permisos. El menú de modelos muestra solo los modelos de este agente; para pasar la conversación a otro agente, usa [Continuar en otro agente](#continue-in-another-agent).

## Citar parte de una respuesta

Selecciona texto en una respuesta del agente, o en uno de tus propios mensajes: aparece un botón **Citar** encima (debajo en una pantalla táctil). Pone el texto en el cuadro de mensaje como una cita, con el cursor después, para que puedas responder a esa parte o recuperar algo que dijiste antes.

## Buscar texto en una sesión

Pulsa Ctrl+F (⌘F) en una sesión. **Buscar en esta sesión** recorre tus mensajes y los del agente, incluidas las partes que aún no se han cargado (no la salida de los comandos). Escribe dos letras o más; salta a la coincidencia más reciente, resalta las palabras y dice «3 de 12». Enter va a la coincidencia más antigua, Shift+Enter a la más reciente (o usa las flechas), y Esc lo cierra. Un mensaje largo plegado se abre en lo que se encontró. Un mensaje elegido en el cuadro de búsqueda (Ctrl+K) abre su sesión con esta barra ya rellenada.

## Más sobre el cuadro de mensaje

- ↑ en un cuadro vacío recupera tus mensajes anteriores de esta sesión, del más reciente al más antiguo; ↓ avanza de nuevo.
- Lo que escribes se guarda como borrador para cada sesión en este navegador, así que sigue ahí cuando vuelvas.
- Ctrl+S (⌘S) aparta el borrador y vacía el cuadro; Ctrl+S en un cuadro vacío lo recupera.
- Un pegado muy largo (32.000 caracteres o más) se adjunta como archivo de texto en lugar de llenar el cuadro.
- El texto de ayuda te dice lo que hará el envío: «Escribe a Claude…», o «Escribe para continuar…» cuando el agente no está en marcha: al enviar, lo inicia de nuevo con toda la conversación.

## El panel de detalles: cambios, comandos e información

**Detalles** en el encabezado abre un panel con tres pestañas. En una pantalla ancha queda junto a la conversación y sigue abierto mientras pasas de una sesión a otra; en una más estrecha se desliza sobre la página; en un teléfono solo se abre cuando lo pides.

- **Cambios**: cada archivo que la sesión cambió, primero los más modificados, con las líneas añadidas y quitadas. Haz clic en un archivo para ver el diff de cada edición; **Abrir** abre el archivo.
- **Comandos**: cada comando de shell que ejecutó el agente, del más reciente al más antiguo, con los filtros **Todos**, **Fallido** y **Fondo**. Haz clic en uno para ver su salida.
- **Información**: el agente, el estado (como en el encabezado: **Hecho**, **Detenidas**, **Fallido** o lo que hace ahora), la carpeta, la rama, el modelo y el esfuerzo, cuánto del contexto se usa, cuándo empezó y cuándo tuvo su última actividad, su actividad (prompts, turnos, llamadas a herramientas, comandos), los tokens (de entrada, en caché, de salida), el costo de la API (lo que costaría el mismo trabajo a precios de API), la velocidad de salida, dónde se empezó (Hydor, VS Code, una terminal, la app de escritorio de Claude…) y, mientras su agente está en marcha, **Sus programas**: lo que usan ahora (CPU, memoria y cuántos), con los [límites](/guide/app#limit-each-session) bajo los que se ejecuta. Más abajo: sus tareas en segundo plano (abre una para ver lo que hizo, o **Detener** la tarea) y **Continuar en una terminal**: el comando que reanuda la sesión en una terminal, y el id de la sesión, cada uno con un botón para copiar (Claude Code y Codex).

## Leer los indicadores: contexto, caché y velocidad

Un pequeño anillo con un porcentaje junto al micrófono se va llenando a medida que la conversación consume la ventana de contexto del modelo; el resto está al pie del menú del chip de Opciones:

- **Contexto**: el anillo y la fila **Contexto** en Opciones («42 % en uso»). Apunta al anillo para ver el número exacto de tokens. Se vuelve ámbar por encima del 85 %. Haz clic en el anillo, o en **Compactar** en Opciones, para compactar la conversación (no mientras un turno está en marcha). En una sesión de Custom, apunta al anillo para ver los tokens y un desglose de en qué se van, y el desglose está bajo la flecha de la fila **Contexto**; Custom condensa por sí solo, así que no hay **Compactar** y hacer clic en el anillo no hace nada (consulta [Conversaciones largas y salidas largas](/guide/custom#long-conversations-and-long-output)).
- **caché 4m** (Claude Code): la caché de prompts mantiene la conversación lista durante un tiempo (5 minutos o una hora), así que el siguiente mensaje es más barato y rápido. Cuenta hacia atrás mientras no envías nada; un mensaje antes de que acabe la reutiliza y reinicia la cuenta. **caché fría** significa que el siguiente mensaje la vuelve a crear.
- **85 tok/s**: lo rápido que se escribió la última respuesta, en tokens por segundo.

## Detener un turno, detener el agente o reanudar

El botón Detener junto al cuadro de mensaje tiene un anillo giratorio mientras el agente se está iniciando o está trabajando. El anillo se detiene cuando el agente te necesita, y se queda quieto si tu dispositivo pide reducir el movimiento. Cuando el turno termina, el botón Detener se queda, con su anillo, mientras sigan ejecutándose tareas en segundo plano o subagentes que el agente haya iniciado, como un subagente de Hydor, un subagente de Claude Code, un comando que se dejó en ejecución o un monitor; el botón de enviar está a su lado, y el cuadro recibe tus mensajes como siempre. Apunta a Detener para ver qué detiene: “Detiene este turno, 2 subagentes y 1 tarea en segundo plano”, o “Detiene 2 subagentes”. Detiene todo eso a la vez: el turno, cada subagente que se esté ejecutando, cada tarea en segundo plano que se esté ejecutando, y las que estos hayan iniciado a su vez. Un subagente de Hydor detenido de esta forma no informa a su agente principal, y un informe que ya estaba en camino espera en la cola en pausa del principal en lugar de despertarlo; pulsa **Reanudar** para dejar pasar la cola.

- **Detener un turno**: pulsa **Detener** en el encabezado, o el botón de cuadrado redondeado junto al cuadro de mensaje, que también detiene lo que la sesión inició (arriba). (Esc no lo detiene: solo cierra lo que está abierto, como la barra de búsqueda o una lista.) El agente deja de hacer lo que estaba haciendo; el turno muestra “Detenido tras…”. La sesión muestra que se detuvo en el momento en que pulsas **Detener**, incluso cuando el agente tarda unos segundos en terminar (por ejemplo, para finalizar un comando que estaba ejecutando); si 20 segundos después el agente sigue trabajando, la sesión lo muestra trabajando de nuevo. El agente queda listo para tu siguiente mensaje, y la cola se pausa hasta que la reanudes.
- **Detener el proceso del agente**: el menú de la sesión (⋯) → **Más** → **Detener el proceso del agente**, cuando no hay ningún turno en ejecución. El programa del agente termina; la sesión y su historial se conservan, y se muestra cómo terminó su último turno (**Hecho**, **Detenidas** o **Fallido**).
- **Reanudar**: el botón **Reanudar** del encabezado inicia de nuevo el agente con toda la conversación, o simplemente envía un mensaje (“Mensaje para continuar…”): eso también lo inicia de nuevo, tanto para Claude Code como para Codex y Custom. Después de **Hecho**, **Reanudar** es un botón más discreto, ya que basta con tu siguiente mensaje. Si se escribió en la sesión hace unos segundos, quizás desde VS Code o una terminal, la app pregunta primero, ya que dos programas que escriben en una misma sesión pueden dañar su historial.
- Un agente inactivo se detiene por sí solo después de tres horas (cuando nada te espera y no se ejecuta ninguna tarea en segundo plano); tu siguiente mensaje lo inicia de nuevo.

## Dar un objetivo a la sesión

Un objetivo mantiene al agente trabajando, turno tras turno, hasta que se cumpla una condición que tú establezcas. Abre el menú de la sesión (⋯) → **Establecer un objetivo**, o escribe `/goal` seguido de la condición en una sesión de Claude Code o Codex. Di cómo se ve “terminado”, por ejemplo “npm test pasa y la página de subida maneja archivos de 2 GB”, y luego pulsa **Empezar a trabajar en ello** (o Ctrl+Enter).

- **Claude Code** sigue trabajando; después de cada turno, una comprobación rápida decide si el objetivo ya se cumple.
- **Codex** sigue trabajando hasta que considera que el objetivo está cumplido.
- **Custom** sigue trabajando; después de cada turno, el modelo auxiliar comprueba las evidencias y le indica el siguiente paso. Se pausa cuando deja de avanzar, y ejecuta como máximo las rondas fijadas en [Configuración → Custom → Goals → Rounds before a goal pauses](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses).

Mientras hay un objetivo establecido, una barra sobre el cuadro de mensaje lo muestra y cómo va (trabajando en ello, en pausa, atascado: el agente te necesita, o detenido por un límite de uso o de tokens), cuántas veces se ha comprobado, el tiempo y los tokens gastados, y el motivo de la última comprobación. **Pausar** y **Reanudar** funcionan con Codex y Custom; **Borrar** deja de trabajar para alcanzarlo. Una marca de diana en la barra lateral muestra qué sesiones tienen un objetivo.

## Bifurcar una sesión

Una bifurcación es una sesión nueva que empieza con esta conversación y luego prueba algo distinto; esta sesión se queda como está.

1. Abre el menú de la sesión (⋯) → **Bifurcar**, o pulsa **Bifurcar desde esta respuesta** bajo una respuesta (cualquier respuesta de Claude Code; la última respuesta de un turno terminado en Codex y Custom) para conservar la conversación solo hasta ahí.
2. Escribe qué debe hacer la bifurcación (“¿Qué debería probar la bifurcación en su lugar?”).
3. Pulsa **Bifurcar** (o Ctrl+Enter).

La bifurcación se abre con el título “… · fork”, con el mismo agente, modelo, esfuerzo, permisos y cuenta. Una línea en la parte superior dice “Bifurcada desde …” con **Abrir** (una bifurcación de Codex muestra solo lo que vino después; la conversación anterior está en la original). Las bifurcaciones funcionan con Claude Code, Codex y Custom, y no con una sesión abierta en otra app. También se puede bifurcar una respuesta de Claude Code anterior a la compactación de la conversación: la bifurcación empieza con toda la conversación hasta esa respuesta, tal como estaba antes de compactarse.

## Editar desde aquí

Vuelve a uno de tus mensajes y di otra cosa en su lugar:

1. Pulsa **Editar desde aquí** bajo tu mensaje.
2. Cambia el texto.
3. Marca **Restaurar los archivos como estaban antes de este mensaje** si también se deben deshacer los cambios que el agente hizo desde entonces.
4. Pulsa **Enviar desde aquí** (Enter), o **Cancelar** (Esc).

La conversación continúa en una copia hasta justo antes de ese mensaje, que toma el título de esta sesión; esta sesión se archiva. Restaurar los archivos funciona con Claude Code (a partir de sus propios puntos de control de los mensajes enviados desde esta app), con Custom (los archivos que cambiaron sus propias ediciones; lo que cambiaron los comandos se queda), y con cualquier sesión en un worktree (se toma una instantánea cada vez que envías un mensaje). Las sesiones de Codex solo pueden restaurar archivos en un worktree. Detén primero al agente si hay un turno en ejecución. Editar desde aquí funciona con Claude Code, Codex y Custom.

## Continuar en otro agente

Pasa la conversación a otro agente y sigue allí:

1. Abre el menú de la sesión (⋯) → **Continuar en Codex** (o **Continuar en Claude Code**, o **Continuar en Custom Agent** cuando Custom ya tenga un modelo).
2. Una nota sobre el cuadro de mensaje dice que tu siguiente mensaje irá allí; las opciones de modelo, esfuerzo y permisos ahora se aplican al nuevo agente. Pulsa × (“Quedarme aquí”) para cancelar.
3. Escribe un mensaje, o simplemente envía para continuar.

Se abre una sesión nueva en la misma carpeta, con la conversación hasta ahora: tu primera petición, luego los mensajes más recientes que quepan en unos 15.000 tokens, y los archivos cambiados. Al nuevo agente se le dice dónde se guarda la conversación completa, para que pueda leer lo que se dejó fuera. Su primer mensaje muestra “Continuada desde Claude Code”, con **Abrir esa sesión** y un botón que muestra los mensajes trasladados; la sesión anterior muestra “Esta conversación continuó en Codex” con **Abrir**. Esto funciona desde sesiones de Claude Code y Codex.

## Compactar la conversación

Compactar reemplaza el historial hasta ahora por un resumen, lo que libera espacio en el contexto del modelo para lo que viene. Usa el menú de la sesión (⋯) → **Más** → **Compactar la conversación**, o haz clic en el medidor de contexto del cuadro de mensaje, y confirma con **Compactar**. Funciona con Claude Code y Codex, entre turnos. Custom condensa por sí solo una conversación larga.

## Cambiar nombre, fijar, posponer, dar por terminada, archivar o eliminar

La mayoría de estas opciones están en el menú de la sesión (⋯) y en el menú de su fila en la barra lateral: apunta a la fila y haz clic en **⋯** al final, o haz clic derecho sobre ella (en un teléfono, toca su **⋯**).

- **Cambiar nombre**: escribe un título nuevo (hasta 200 caracteres); Enter lo guarda, Esc cancela. Hacer doble clic en el título del encabezado o de la barra lateral, o F2 en una fila seleccionada, hace lo mismo.
- **Cambiar nombre de la carpeta** (en la barra lateral, para una sesión que no está en un proyecto): un nombre tuyo para la carpeta en la que trabaja, que la barra lateral, las filas de sesiones y los menús de carpetas muestran en todos los dispositivos; la carpeta conserva su propio nombre en el disco. Déjalo vacío para usar el de la carpeta.
- **Fijar arriba** / **Dejar de fijar**: las sesiones fijadas permanecen en el grupo **Fijadas**, en el orden en que las arrastres. También puedes arrastrar una sesión desde los grupos de abajo (los de un proyecto o una carpeta, Hoy, Ayer…) hasta Fijadas, o hasta “Suelta aquí para fijar” cuando todavía no hay nada fijado.
- **Posponer**: oculta la sesión en el grupo **Pospuestas**, al final, hasta **Durante una hora**, **Durante 3 horas**, **Esta tarde** (mientras sean antes de las 5 p. m.), **Mañana por la mañana**, **Semana siguiente** (lunes por la mañana) o **Elegir fecha y hora**. Vuelve por sí sola, con un aviso, o antes si te necesita. **Dejar de posponer** la devuelve ahora.
- **Dar por terminada: lista por ahora**: para el trabajo terminado. El agente se detiene (no se ofrece mientras hay un turno en ejecución) y la sesión cuenta como leída; su historial y cualquier worktree se conservan. Para una sesión en un worktree, se abre el diálogo del worktree para que puedas quitarlo.
- **Archivo comprimido** / **Desarchivar**: saca la sesión de la lista; no se elimina nada. Las sesiones archivadas se encuentran con el cuadro de búsqueda (Ctrl+K), marcadas como **Archivada**; abre una y elige **Desarchivar** en su menú.
- **Eliminar sesión**: tras confirmar, el historial de la sesión se borra del disco, así que desaparece también de la línea de comandos del propio agente y de VS Code. Esto no se puede deshacer. **Eliminar** en el menú de su fila en la barra lateral hace lo mismo.

Hasta que la elimines, la app conserva todas las sesiones, incluso cuando el programa del propio agente elimina su conversación (Claude Code lo hace tras 30 días salvo que se indique otra cosa): vuelve, aparece en la lista y se puede abrir. Las sesiones que nadie usó durante un año se eliminan solas, a menos que las fijes o cambies eso en Configuración → General (consulta [Eliminar sesiones inactivas](/guide/app#delete-inactive-sessions)).

Fijar, dejar de fijar, archivar, desarchivar y posponer muestran un aviso con **Deshacer**, y Ctrl+Z los deshace en un plazo de 8 segundos.

## Compartir un enlace de solo lectura

El menú de la sesión (⋯) → **Compartir un enlace de solo lectura** crea un enlace que cualquiera puede abrir sin tu contraseña (no para una [sesión confidencial](#keep-a-session-confidential)). Ven la conversación a medida que ocurre (mensajes, los pasos por su nombre, cambios en archivos y páginas que el agente mostró), no la salida de los comandos ni el razonamiento del agente, y no pueden escribir ni cambiar nada. Elige cuánto tiempo funciona (**Un día**, **Una semana**, **Un mes**, **Hasta que lo desactives**) y pulsa **Crear un enlace**; el enlace se muestra una sola vez. El mismo diálogo lista los enlaces que funcionan ahora, cuántas veces se abrió cada uno, y permite desactivar uno. Consulta [Teléfonos, otras máquinas y uso compartido](/guide/devices).

## Exportar una conversación

El menú de la sesión (⋯) → **Exportar** saca la conversación del chat:

- **Exportar como Markdown** la descarga como un archivo Markdown con el título de la sesión como nombre, para guardarla, enviarla o abrirla en cualquier app de notas.
- **Copiar como Markdown** pone el mismo texto en el portapapeles, para pegarlo en notas, un correo u otra app.
- **Guardar como documento** crea un documento con ella, guardado en el proyecto de la sesión (aparece en los **Archivos** del proyecto; sin proyecto se queda con esta conversación), para leerlo, editarlo, comentarlo, imprimirlo y exportarlo como Word o PDF allí. Un mensaje avisa cuando está listo; **Abrir** te lleva a él.

Qué incluye: el título y la fecha, luego cada uno de tus mensajes y cada una de las respuestas del agente, en orden, con sus horas. Los pasos de un turno se omiten, con una línea como “Trabajó 2 min · 5 pasos” en su lugar. Los archivos que el agente entregó aparecen listados por nombre. Las tarjetas de respuesta se convierten en texto legible, con las tablas como tablas (una comparación, una tabla de datos, los números de un gráfico). Los diagramas se quedan como su código Mermaid y las fórmulas como LaTeX, tal como las escribió el agente. En el documento también están las imágenes que adjuntaste a tus mensajes y las imágenes que el agente entregó.

Una [sesión confidencial](#keep-a-session-confidential) también se puede exportar, y su documento se queda en esta computadora como el resto de su trabajo: las imágenes de la web se dejan como enlaces en lugar de descargarse. Desde una terminal, `hydor sessions export` hace lo mismo ([Hydor en una terminal](/guide/terminal)).

## Trabajar en un worktree

Un worktree es una copia separada de los archivos de un repositorio en una rama nueva, de modo que un agente pueda cambiar cosas sin tocar tu propia copia, y varios agentes puedan trabajar a la vez en un mismo repositorio.

- **Crear uno**: en la página de inicio, abre **Carpeta** y activa **Nuevo worktree desde …** (la carpeta debe estar en un repositorio de Git). La app crea una rama llamada `agent/` más unas palabras de tu tarea, a partir de la rama activa, y una carpeta para ella en la carpeta de datos de la app. El interruptor se recuerda para la próxima vez.
- **Instantáneas**: en un worktree, la app guarda una instantánea de los archivos cada vez que envías un mensaje, para que [Editar desde aquí](#edit-from-here) pueda restaurarlos.
- **Verlo**: el menú de la sesión (⋯) → **Carpeta y código** → **Worktree: agent/…** muestra la rama y aquella de la que partió, su carpeta, cuántos commits lleva de adelanto o de retraso, y los cambios sin confirmar, con **Revisar sus cambios** y **Abrir en Git**.
- **Quitarlo** cuando el trabajo termine: en el mismo diálogo, **Quitar worktree**. La carpeta desaparece; la sesión conserva su historial. La rama se queda, así que no se pierde nada de lo confirmado, salvo que marques **Eliminar también la rama …** (una rama sin nada nuevo se elimina de todos modos). Si hay cambios sin confirmar, marca primero **Descartar los … cambios sin confirmar**. El agente se detiene si estaba en ejecución, y las bifurcaciones o ediciones que comparten el worktree también lo pierden.

## Abrir un pull request

Desde la rama de una sesión, el menú de la sesión (⋯) → **Carpeta y código** → **Abrir un pull request** abre un pull request en GitHub o Gitea. **Escríbelo por mí** redacta el título y la descripción a partir de los commits y del diff; una casilla puede confirmar antes los cambios sin confirmar; **Borrador** lo marca como borrador; la rama se sube cuando pulsas **Abrir pull request**. Necesitas una cuenta en [Configuración → Control de código fuente](/settings?s=scm). **Vincular un pull request que ya existe…** vincula uno abierto en otro lugar.

Una vez vinculado, su estado y sus comprobaciones se muestran como una insignia en la barra lateral y en el encabezado, y se actualizan cada pocos minutos, con un aviso cuando se fusiona o terminan sus comprobaciones. El mismo elemento del menú, ahora **Pull request #12**, tiene **Abrir en GitHub** (o Gitea), **Revisar los cambios**, **Comprobar ahora** y **Desvincular**. **Revisar los cambios** en el submenú recorre lo que cambia la rama, archivo por archivo. Consulta [Sistema: archivos, Git, Terminal y vista previa](/guide/files-git).

## Cuando un límite de uso detiene una sesión

Cuando un plan de Claude Code o Codex se queda sin uso, un banner sobre el cuadro de mensaje indica de quién es el límite alcanzado, qué límite es y cuándo se restablece: “You've hit the Claude Code usage limit” con una sola cuenta de ese agente, “All your Claude Code accounts have hit their usage limit” cuando tienes varias y ninguna tiene uso disponible, o la cuenta por su nombre (“Work has hit its usage limit”) cuando otra todavía tiene algo.

Cuando otra cuenta de ese agente aún tiene uso disponible, no ves ningún banner mientras **Cambiar de cuenta en un límite** esté activado: la sesión pasa a esa cuenta y continúa (las sesiones nuevas empiezan allí). Si está desactivado, el banner nombra esa cuenta y ofrece **Activar**.

- **Reanudar al restablecer** continúa la sesión por sí sola un minuto después de que se restablezca el límite, con el mensaje “Continue where you left off.” Después el banner indica cuándo, con **Cancelar**.
- **Usar un restablecimiento**: cuando tu cuenta tiene restablecimientos de límite, el banner indica cuántos, y esto usa uno ahora.
- [Reanudar tras los límites de uso](/settings?s=general&find=Resume%20after%20usage%20limits) en Configuración → App → General hace esto con todas las sesiones que detiene un límite. Con la opción activada, no ves ningún aviso en la sesión: una línea sobre el cuadro de mensaje indica de quién es el límite alcanzado (como hace el banner), qué límite es y cuándo continúa (“All your Claude Code accounts have hit their usage limit”, y luego “Current session (5 h) · Continues by itself in 3 h 15 min.”), con **Usar un restablecimiento** si tienes uno, y **Cancelar**. Una sesión que detuviste tú mismo con **Detener** no continúa por sí sola.

La hora sigue al límite: si el restablecimiento se mueve, o el uso vuelve antes, la sesión continúa en ese momento. Consulta [Uso, límites y costos](/guide/usage).

## Sesiones que se ejecutan en VS Code o en una terminal

Todas las sesiones de Claude Code y Codex de esta computadora aparecen en la lista, también las que ejecutas en VS Code, en una terminal o en la app de escritorio de Claude. Mientras se ejecutan allí, la lista muestra “Working in VS Code”, “Needs you in terminal” u “Open in VS Code” (un punto gris), y puedes ir leyendo mientras trabajan. Si una te espera allí, la app te avisa solo si sigue esperando un minuto después.

- **Tomar el control de una sesión de Claude Code**: pulsa **Continuar aquí** en su encabezado, o simplemente envía un mensaje (“Open in VS Code — sending moves it here”). La app pregunta primero: termina la sesión en esa app, deteniendo lo que esté haciendo, y la reanuda aquí con todo su historial. Esa app la muestra como terminada; puedes volver a abrirla allí más tarde.
- Las **sesiones de Codex** abiertas en otro lugar son de solo lectura aquí, porque un único proceso de Codex allí atiende todos sus hilos. Continúala allí, o ciérrala allí y luego reanúdala aquí.
- No se ofrece bifurcar mientras una sesión está abierta en otra app.

## Subagentes

Un agente puede encargar partes de un trabajo a subagentes y recibir sus resultados. Hay dos tipos, y la app indica cuál es:

- Un **subagente de Hydor** es una sesión propia que Hydor inicia, con cualquier agente y modelo. Tiene una línea en la tarjeta de subagentes de la conversación del padre, aparece bajo su padre en la barra lateral, y puedes abrirlo y hablar con él. Tiene su propio costo y su propia parte del límite de gasto del padre, y su respuesta vuelve al padre como un mensaje.
- Un **subagente de Claude Code** (con Codex, un “subagente de Codex”: el nombre del programa propio de la sesión) es uno que ese programa ejecuta dentro de la sesión durante una parte breve de su trabajo. Se muestra y se abre igual que un subagente de Hydor: una línea en una tarjeta de la conversación, una fila en la barra lateral y en la bandeja, y una página propia con toda su conversación. Pero no puedes hablar con él (su líder sí), lo que gasta cuenta como gasto del líder y no tiene parte de ningún límite de gasto.

En la barra lateral, los subagentes aparecen plegados bajo su padre mientras trabajan o esperan por ti, los de Hydor y los del propio programa juntos, en una sola línea (“3 subagents · 1 needs you”, “2 subagents”); haz clic en la línea para ver una fila por cada uno. Uno que ha terminado sale de la barra lateral, salvo que lo estés mirando, y la línea sigue abierta mientras miras alguno de ellos. Los miembros de un enjambre aparecen como “swarm members”, los de una campaña como “campaign members”. En la conversación del padre, los subagentes que inició un turno aparecen juntos en una tarjeta bajo ese turno: los subagentes de Hydor en una tarjeta, los del propio programa (de Claude Code o de Codex) en otra. Su línea superior indica cuántos hay y de qué tipo, con lo que todos comparten (“6 Claude Code subagents · Sonnet 5.5”, “3 Hydor subagents · Claude Code · Sonnet 5.5”, “4 researchers” en una investigación profunda), y cómo van (“5 working · 1 done”, también “1 needs you”, “1 stopped”, “1 failed”). Haz clic en esa línea para plegar o desplegar la tarjeta: está abierta mientras alguno trabaja o te necesita, y se pliega a esa única línea cuando todos han terminado.

Debajo, cada subagente tiene una línea: un punto del color de su estado (azul mientras trabaja, con un pulso suave; ámbar cuando te necesita; verde cuando terminó; gris cuando se detuvo; rojo cuando falló), su título, en una pantalla ancha lo que tiene que los demás no (su tipo o modelo, el agente tuyo como el que trabaja, su nivel), y cómo va: cuánto tiempo lleva trabajando, “Needs you”, cuándo terminó (“3 min ago”), “Stopped” o “Failed”. La línea de un subagente de Hydor muestra también lo que costó, y al apuntar a uno que subió de nivel aparece “Stepped up from” su primer nivel y por qué. Haz clic en una línea para abrir el subagente. Mientras otros siguen trabajando, los que terminaron se pliegan en una sola línea, como “4 finished: ” y sus títulos: haz clic en ella para verlos. Los que fallaron permanecen como líneas propias. Con más de seis en marcha, se muestran cinco, con **Show 3 more**.

Un turno que inició un solo subagente lo muestra como una tarjeta de una línea: su icono con un punto de estado, su título, qué es (“Claude Code subagent · Explore · Sonnet 5.5”, o “Hydor subagent · Claude Code · Sonnet 5.5”, con el agente como el que trabaja y su nivel cuando los tiene), y cómo va.

Para detener uno, apunta a su línea (o llega a ella con Tab) y **Detener** aparece en lugar de su tiempo; en una pantalla táctil siempre hay un pequeño botón de detener. Un subagente de Claude Code pregunta primero (“Stop this subagent?”), un subagente de Hydor se detiene de inmediato, y un subagente de Codex no se puede detener uno por uno desde aquí. El menú **⋯** de la tarjeta tiene **Stop 5 subagents** (con cuántos se pueden detener), que los detiene todos sin preguntar. La llamada que inició un subagente sigue siendo un paso en el trabajo plegado del turno.

Cuando vuelve un subagente que trabajó en segundo plano, la conversación del padre muestra una línea: “Reply from” y su título, o “… was stopped”, o “… stopped with an error”, con el comienzo de lo que escribió. Haz clic en ella para leer la respuesta, y **Abrir su sesión** para ir a ella. La respuesta de un subagente de Codex se obtiene de su propia conversación cuando abres la línea. Una respuesta que llegó mientras el padre aún trabajaba aparece en su lugar, entre los pasos anteriores y posteriores.

Dentro de un subagente de Hydor, una barra sobre el cuadro de mensaje dice “Subagent of” y el título del padre (“its replies go back there”), con **Abrir la sesión principal**. Un subagente de Claude Code o de Codex también se abre como una sesión, de solo lectura: muestra la tarea que recibió, sus pasos y su respuesta, en vivo mientras trabaja, sin cuadro de mensaje ni **Reanudar** ni menú de sesión. En lugar del cuadro de mensaje, una barra dice “Claude Code subagent of” y el título del padre (“its replies go back there”), con **Abrir la sesión principal**. Mientras un subagente de Claude Code trabaja, **Detener** en su encabezado lo detiene, preguntando primero. Enviarle un mensaje, reanudarlo, bifurcarlo, traspasarlo o eliminarlo se rechaza: su programa lo ejecuta dentro de la sesión de su padre, así que habla con el padre.

Un padre cuyo propio turno terminó mientras sus subagentes siguen en marcha no ha terminado: su punto sigue latiendo en azul, el anillo del botón Detener del cuadro de mensaje sigue girando, su estado dice “Working · 2 subagents running”, no muestra marca de “Done”, permanece en Active, y todavía puedes enviarle un mensaje. Esto vale para una sesión de Claude Code y para una de Codex. Un subagente de Hydor también cuenta como en ejecución mientras los subagentes o tareas en segundo plano que inició (un comando, un monitor) siguen en marcha después de que terminó su propio turno, así que su padre aparece como trabajando, no como terminado. Un límite de gasto en el padre cubre a sus subagentes de Hydor, y lo que gasta un subagente de Claude Code o de Codex ya es gasto del padre. Consulta [Investigación profunda, segundas opiniones y varios agentes](/guide/research).

Sobre el cuadro de mensaje, una línea resume todo lo que inició la sesión: sus subagentes y sus tareas en segundo plano (comandos, monitores, flujos de trabajo). Dice “2 subagents and 1 background task running”, con “1 needs you” en ámbar cuando un subagente de Hydor te espera, o “3 subagents · 2 background tasks · all done” cuando nada se ejecuta, y está plegada cada vez que abres la sesión. Haz clic en ella para listar cada uno: lo que te necesita arriba, luego lo que se ejecuta, luego lo que terminó, lo más reciente primero, con desplazamiento interno a partir de unos cinco. Todas las filas tienen el mismo aspecto: un icono con un punto de estado, el título, qué es (“Hydor subagent · Claude Code · Sonnet 5.5”, “Claude Code subagent · Explore · Haiku 5.5”, “Command”, “Monitor”, “Workflow”), cómo va (“Working · 2m 10s”, “Needs you”, “Done · 3 min ago”, “Stopped”, “Failed”), el costo de un subagente de Hydor (un subagente de programa no muestra ninguno: su gasto es el de su padre), **Abrir**, y un botón de detener (un cuadrado dentro de un círculo) mientras se ejecuta. Apunta a qué es para ver quién lo ejecuta: “Hydor started it as a session of its own: open it to watch it or talk to it”, o “Claude Code runs it inside this session: open it to watch it”. **Abrir** te lleva a la sesión de un subagente de Hydor o de un subagente de Claude Code o de Codex; un comando, un monitor o un flujo de trabajo se abre en un panel sobre la derecha de la página (toda la pantalla en un teléfono), con su título, tipo y estado, **Detener** mientras se ejecuta, y debajo su salida. Se actualiza cada dos segundos y se queda en las líneas más recientes, salvo que te desplaces hacia arriba. El botón de detener de un subagente dice “Stop this subagent”, el de una tarea “Stop this task”. **Detener todo**, a la derecha de la línea, detiene todo lo que se ejecuta, igual que el botón Detener junto al cuadro. Los miembros de un enjambre o de una campaña no aparecen aquí: su tablero los muestra. Las tareas que terminaron permanecen en la lista hasta que el programa del agente se detiene; una sesión abierta en VS Code o en una terminal lista sus tareas pero no puede detenerlas.

Cuántos subagentes de Hydor ejecuta una sesión a la vez se define en [Configuración → Capacidades → Subagentes](/settings?s=children): esos ajustes son para los subagentes de Hydor, porque los subagentes propios de Claude Code y de Codex se ejecutan dentro de su sesión. Con [Liderar con subagentes](/settings?s=models&find=Lead%20with%20subagents) activado en Configuración → Modelos → Niveles, el agente principal de una sesión planifica, entrega partes claras a subagentes de niveles más económicos y revisa su trabajo.

## Todo el menú de la sesión

El botón ⋯ en la parte superior derecha de una sesión abre su menú. Algunos elementos solo aparecen cuando corresponden; el menú de una [sesión confidencial](#keep-a-session-confidential) no tiene **Compartir un enlace de solo lectura**, **Abrir un pull request**, **Abrir un navegador**, **Cuentas conectadas**, **Convertir esto en una automatización** ni **Guardar como app**, y su memoria permanece desactivada.

- **Cambiar nombre**: edita el título directamente.
- **Fijar arriba** / **Dejar de fijar**.
- **Posponer** (un submenú de horarios), o **Dejar de posponer (de vuelta a las …)** mientras está pospuesta.
- **Dar por terminada: lista por ahora**: detiene al agente y marca la sesión como leída (no mientras se ejecuta un turno).
- **Bifurcar**: una nueva sesión a partir de esta conversación (Claude Code, Codex, Custom).
- **Continuar en Codex**, **Continuar en Claude Code**, **Continuar en Custom Agent**: lleva la conversación a otro agente (desde Claude Code y Codex).
- **Establecer un objetivo**: sigue trabajando hasta que se cumpla una condición (Claude Code, Codex, Custom; mientras no haya un objetivo establecido).
- **Segunda opinión**: el modelo de otra empresa revisa el trabajo de un turno según lo que pediste, y sus conclusiones aparecen bajo ese turno. Consulta [Investigación profunda, segundas opiniones y varios agentes](/guide/research).
- **Compartir un enlace de solo lectura**.
- **Exportar** (un submenú): **Exportar como Markdown**, **Copiar como Markdown** y **Guardar como documento**. Consulta [Exportar una conversación](#export-a-conversation).
- **Carpeta y código** (un submenú, para sesiones con una carpeta):
  - **Revisar los cambios**: lo que cambia la rama, archivo por archivo.
  - **Abrir un pull request**, o **Pull request #12** cuando ya hay uno.
  - **Worktree: agent/…**: el diálogo del worktree (sesiones en un worktree).
  - **Explorar la carpeta**: abre Archivos en la carpeta de la sesión.
  - **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**: en la app de escritorio, la carpeta de la sesión seleccionada en el administrador de archivos del sistema (consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)).
  - **Abrir una terminal aquí**: una nueva terminal en la carpeta (en el panel inferior en una computadora, en la página Terminal en un teléfono).
- **Configuración de la sesión** (un submenú):
  - **Memoria**, con **Activado** o **Desactivado** al lado: activa o desactiva la memoria para esta sesión (“Desactivada para todas” cuando la memoria está desactivada en Configuración). Consulta [Memoria](/guide/memory).
  - **Límite de gasto**, con el límite al lado: establécelo, cámbialo o auméntalo. Consulta [Uso, límites y costos](/guide/usage).
  - **Cuentas conectadas**: activa o desactiva cada cuenta conectada solo para esta sesión. Consulta [Apps conectadas, claves y herramientas](/guide/connections).
  - **Enjambre**, con **Desactivado**, **Activado** o **Campaña** al lado: abre un diálogo para activar o desactivar un enjambre o una campaña a partir de tu próximo mensaje. Consulta [Investigación profunda, segundas opiniones y varios agentes](/guide/research#set-a-swarm-on-a-hard-problem).
  - **Investigación profunda**, con **Desactivado** o el número de búsquedas al lado: abre un diálogo para activar, desactivar o cambiar una investigación profunda a partir de tu próximo mensaje. Consulta [Investigación profunda, segundas opiniones y varios agentes](/guide/research#turn-it-on). (Enjambre e Investigación profunda no aparecen en una sesión confidencial, ni en una sesión que inició otra sesión.)
  - **Agente**, con su nombre al lado: abre la página del agente (sesiones con un agente). El cuadro de mensaje lo cambia.
- **Más** (un submenú):
  - **Abrir un navegador** / **Mostrar el navegador**: el navegador de los agentes para esta sesión, que puedes observar y controlar. Consulta [Búsqueda y el navegador](/guide/web).
  - **Convertir esto en una automatización**: el modelo auxiliar lee la sesión y redacta a partir de ella una tarea programada; cambia lo que quieras, pruébala con una ejecución de prueba y luego guárdala. Consulta [Tareas programadas](/guide/tasks).
  - **Guardar como app**: empieza una nueva app a partir de esta sesión. Consulta [Apps](/guide/apps).
  - **Compactar la conversación** (Claude Code y Codex).
  - **Copiar el comando para reanudar en la CLI**: el comando para continuar esta sesión en una terminal.
  - **Detener el proceso del agente** (mientras el agente se ejecuta y no hay ningún turno en curso).
- **Archivo comprimido** / **Desarchivar**.
- **Eliminar sesión**: elimina su historial del disco, después de que lo confirmes.

## Pregunta a un agente

- “Empieza una sesión de Claude Code en ~/code/blog en un nuevo worktree que agregue un feed RSS, con un límite de gasto de $5.”
- “¿Qué sesiones terminaron desde esta mañana? Da por terminadas las que están listas y archiva las de la semana pasada.”
- “¿Por qué esta sesión dice Failed, y qué debo enviar para intentarlo de nuevo?”
- “¿Cuánto costó el último turno de esta sesión, y cuánto de eso fue la caché?”
- “Pospón la sesión sobre los formularios de impuestos hasta el lunes a las 9.”
- “Pon en mi tablero Shop el gráfico de ventas y las cifras clave que acabas de mostrarme.”
- “Dale a la sesión ‘Fix upload’ este objetivo: npm test pasa y funcionan las subidas de 2 GB.”
- “Bifurca la sesión de las notas de la versión y prueba una versión más corta.”
- “Cambia la sesión ‘Data cleanup’ a Accept edits y envía: continúa con el siguiente archivo.”
- “Envía esta corrección a mi sesión de Custom en ejecución; si es anterior a la actualización, ponla en cola hasta que termine el turno.”
- “¿Qué significa el anillo giratorio en Detener?”
- “Detén todo lo que inició esta sesión: sus subagentes y sus tareas en segundo plano.”
- “¿Qué muestra la línea sobre el cuadro de mensaje con subagentes y tareas en segundo plano?”
- “¿Cuáles de estos subagentes inició Hydor y cuáles Claude Code?”
- “Abre el subagente de Claude Code que escribió las pruebas.”
- “Explícame cómo funciona una bomba de calor, con un diagrama del ciclo y una imagen de una.”
- “Compara los tres lectores de libros electrónicos en una tabla y elige uno por mí.”
- “Guarda nuestra conversación sobre bicicletas eléctricas como un documento en mi proyecto Tesis.”
- “Muéstrame en un mapa los mejores lugares de ramen cerca de la estación de Shibuya.”
- “Hazme un cuestionario sobre la Revolución francesa: cinco preguntas.”
- “Dame problemas de práctica sobre cómo resolver ecuaciones cuadráticas, con pistas.”
- “Marca en mi ensayo lo que hay que corregir y dame la versión corregida.”
- “Verifica estas cinco afirmaciones del artículo.”
- “Déjame probar este fragmento de Python y modificarlo.”
- “¿Cuáles de mis modelos pueden ejecutar una sesión confidencial, y cuál usaría?”
- “Empieza una sesión confidencial en ~/reviews/4711 que revise el artículo que está ahí para ICLR.”
- “¿Por qué mi sesión confidencial no puede buscar en la web, y qué sí funciona en ella?”
- “Muéstrame por qué los pesos de atención suman 1, con las ecuaciones y un ejemplo numérico.”
- “Haz un gráfico de la pestaña Sales de mi hoja de cálculo Shop numbers por mes, una línea por región, y mantenlo actualizado.”
- “¿Por qué mi nueva sesión preguntó si construir primero la memoria del proyecto, y qué pasa si elijo Start now?”
