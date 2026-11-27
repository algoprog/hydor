# Investigación profunda, segundas opiniones y varios agentes

Cuando un solo agente no es suficiente, la app puede poner a varios a trabajar: una investigación profunda que envía investigadores tras cada parte de una pregunta y devuelve un informe con citas, subagentes que se encargan de partes de una tarea, un enjambre que ataca un problema difícil desde varios ángulos a la vez, y una campaña que hace un gran cambio en muchas partes. También puedes pedir que el modelo de otra empresa revise el trabajo de un turno, enviar un mismo prompt a varios modelos y quedarte con la mejor respuesta, y fijar un tope a lo que una sesión puede gastar para que nada de esto se te escape de las manos.

![Investigación profunda en la página de inicio: investigadores a la vez, rondas, búsquedas en total e informe](images/research.webp)

## Ejecutar una investigación profunda

Una investigación profunda sirve para preguntas que necesitan muchas fuentes: comparar opciones, comprobar una afirmación, hacer un panorama de un tema, averiguar qué se sabe sobre algo. El agente con el que empiezas la dirige. Planifica las búsquedas, envía investigadores tras cada parte de la pregunta, profundiza en lo que ellos dejan abierto, hace que las afirmaciones clave se comprueben con dos fuentes y entrega un informe con todas las fuentes citadas.

### Activarla

1. En la página de inicio, abre **Opciones** (el chip a la derecha de la fila bajo el cuadro de mensaje) y elige **Investigación**.
2. Elige **Investigación profunda** («Busca ampliamente, comprueba las fuentes y las cita»). Su configuración aparece debajo.
3. Ajusta los números y el tipo de informe que quieres (véase más abajo).
4. Escribe tu pregunta en el cuadro de mensaje y pulsa **Inicio**.

La fila Investigación ahora dice «Profunda · 60 búsquedas» (tu presupuesto de búsquedas), y el chip de Opciones la nombra («Investigación profunda»). Elige **Desactivado** («Un agente responde y busca según lo necesite») para volver a un solo agente.

En un teléfono, Opciones se abre como una hoja desde la parte inferior de la pantalla, e Investigación se abre encima.

Una investigación profunda y un enjambre (o una campaña) funcionan con un equipo de subagentes de Hydor, así que solo puedes tener uno u otro: activar uno desactiva el otro.

La primera vez que eliges **Investigación profunda**, un diálogo llamado «Antes de usar la investigación profunda» explica qué hace, para qué vale la pena, para qué no vale la pena y cuánto cuesta. Pulsa **Usar la investigación profunda** para continuar, o **Cancelar** para dejar todo como estaba. Se muestra una sola vez para ti, en todos tus dispositivos, dondequiera que la elijas (la página de inicio, las opciones de una tarea programada o el diálogo de una sesión) y estén activados los consejos o no; pedirle a un agente que vuelva a mostrar los consejos también lo trae de vuelta.

No tienes que decidirlo en la página de inicio. En una sesión que ya está en marcha, abre su menú (⋯) → **Configuración de la sesión** → **Investigación profunda**; su indicación dice «Desactivado», o el número de búsquedas («60 búsquedas»). El diálogo tiene **Desactivado** e **Investigación profunda** con la misma configuración de arriba (**Investigadores a la vez**, **Rondas**, **Búsquedas en total**, **El informe**); pulsa **Guardar** cuando termines, o **Cancelar**. El cambio se aplica desde tu siguiente mensaje: el agente de la sesión (Claude Code o Codex) se reinicia con las nuevas instrucciones y herramientas antes de ese mensaje, y la conversación continúa donde estaba. Activar una investigación profunda desactiva un enjambre, y al revés. El chip del cuadro de mensaje junto al **+** (sus **Opciones**) tiene la misma fila **Investigación profunda**, debajo de **Permisos**.

La opción no aparece en una sesión confidencial, ni en una sesión que otra sesión empezó (un miembro de un enjambre, un investigador, un subagente).

Una tarea programada puede ejecutar una investigación profunda cada vez que se ejecuta: su editor tiene la misma configuración de **Investigación** ([Tareas programadas](/guide/tasks)).

### Su configuración

- **Investigadores a la vez** (de 1 a 8; 4 al empezar): cuántos investigadores buscan a la vez en cada ronda, que es lo amplia que resulta cada ronda.
- **Rondas** (de 1 a 5; 2 al empezar): cuántas rondas de investigación se hacen, cada una tras lo que la anterior dejó abierto. Después de ellas viene una ronda de comprobación.
- **Búsquedas en total** (de 10 a 500, de 10 en 10; 60 al empezar): las búsquedas web que puede usar toda la investigación, las del responsable y las de los investigadores juntas.
- **El informe**: **Página** o **Word**.

Este navegador recuerda los números para tu próxima investigación profunda. El modo en sí no se conserva: cada sesión nueva empieza con Investigación desactivada, porque una investigación profunda cuesta varias veces lo que una sola respuesta.

### Qué ocurre, paso a paso

1. **Plan.** El responsable averigua qué pregunta realmente la pregunta y qué abarca una respuesta completa. La divide en subpreguntas y escribe unas cuantas búsquedas para cada una, con redacciones variadas, en otros idiomas cuando ayuda, y dirigidas a las fuentes que lo resuelven (datos oficiales, artículos, documentos primarios, prensa de confianza). Si algo crucial no está claro, te pregunta una sola vez, brevemente; si no, expone sus suposiciones y continúa.
2. **Primera ronda.** Inicia hasta tu número de investigadores, uno por subpregunta. Cada investigador es un subagente de Hydor con un encargo propio: la pregunta completa, su parte, las búsquedas desde las que empezar, aproximadamente cuántas búsquedas le corresponden y qué debe informar. Luego el responsable espera; el informe de cada investigador le llega como un mensaje.
3. **Más rondas.** El responsable lee los informes y envía nuevos investigadores tras las lagunas, las contradicciones y las afirmaciones que se apoyan en una sola fuente. Se salta una ronda cuando no queda nada importante abierto. Después de cada ronda te dice en una línea qué se encontró y qué viene a continuación.
4. **Comprobar.** Enumera las afirmaciones en las que se apoya la respuesta. Cada una necesita dos fuentes independientes, o se marca como apoyada en una sola, o como disputada. Un investigador (o el propio responsable) abre las páginas citadas para confirmar que cada afirmación y cifra clave está realmente ahí; lo que falla se corrige o se descarta.
5. **Informe.** Escribe el informe: un título claro, primero la respuesta en pocas frases, luego secciones, una cita numerada tras cada afirmación y las fuentes al final (título, sitio, fecha y enlace). Indica qué es incierto o discutido y por qué, y te da un breve resumen en la conversación.

Los investigadores buscan con la búsqueda web de la propia app y leen las páginas con su lector de páginas ([Búsqueda y navegador](/guide/web)). Para que cada búsqueda cuente contra el presupuesto, la búsqueda web integrada de Claude Code y de Codex se desactiva en una investigación profunda. Cuando se agota el presupuesto, se rechaza una búsqueda y se le dice al agente que escriba su informe con lo que tiene. Del mismo modo, una vez terminadas las rondas que fijaste y la ronda de comprobación, el responsable no puede iniciar más investigadores.

### Seguirla en la sesión

Una barra sobre el cuadro de mensaje de la sesión del responsable muestra lo que hace la investigación: **Investigación profunda** · «Planificando», luego «Ronda 1 de 2 · 4 investigadores trabajando», «Leyendo los informes» entre rondas, «Comprobando las fuentes» mientras los investigadores comprueban las afirmaciones clave, «Escribiendo el informe», y al final «Informe listo» · y cuánto del presupuesto se ha usado («12 de 60 búsquedas»). Cuando el informe está listo, **Abrir informe** a la derecha de la barra lo abre: la página o el documento de Word. Apunta con el cursor a la barra para ver la configuración de la investigación y cómo será el informe.

Cada investigador tiene una línea en la tarjeta única que los investigadores comparten en la conversación del responsable («4 investigadores») y aparece bajo el responsable en la barra lateral, como cualquier [subagente de Hydor](/guide/research#follow-subagents). Lo que cada uno informa aparece como una línea, «Respuesta de» y su título, con el comienzo de lo que encontró: haz clic en la línea para leerlo. Abre un investigador para verlo trabajar: su barra dice «Investigando para» y el título del responsable, con **Responsable** para volver.

### El informe

- **Página**: el informe se guarda como una página que conservas. Aparece en la conversación y se guarda en los archivos del proyecto de la sesión (sus detalles → **Archivos**), o se queda con la conversación cuando la sesión no tiene proyecto ([Páginas, documentos e imágenes](/guide/library)).
- **Word**: el informe es un documento de Word (.docx) en la carpeta de la sesión, hecho con la habilidad **word-documents** de la app, y aparece como una tarjeta de archivo que puedes abrir o descargar ([Documentos, imágenes, videos y voz](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Una investigación profunda ejecuta muchos agentes a la vez. Fija un límite de gasto en el mismo menú Opciones antes de empezar: cubre al responsable y a todos sus investigadores ([Poner un límite de gasto a una sesión](/guide/research#put-a-spending-cap-on-a-session)).

## Deja que un agente delegue trabajo a subagentes

Cualquier agente puede delegar una parte autónoma de su trabajo a un subagente, que la realiza al mismo tiempo y luego informa. En las sesiones que Hydor ejecuta, todo subagente es un **subagente de Hydor**: una sesión propia que Hydor inicia, con cualquier agente y modelo. Tiene una línea en la tarjeta de subagentes de la conversación, aparece bajo su sesión principal en la barra lateral, tiene su propio costo y su propia parte del límite de gasto, puedes abrirlo y hablar con él, y su respuesta llega a la sesión principal como un mensaje. Allí los programas de los agentes no pueden iniciar subagentes propios: Hydor desactiva la herramienta Agent de Claude Code, sus workflows y sus agentes en la nube, y los subagentes de Codex, para que cada parte de un trabajo se muestre, cueste y se detenga de la misma manera, y a los demás agentes se les indica que usen los de Hydor. Un **subagente de Claude Code** (o un “subagente de Codex”) se sigue mostrando cuando lo inició una sesión que se ejecuta en VS Code o en una terminal, o una anterior: tiene una línea en la tarjeta y una página propia que puedes leer, pero no puedes hablar con él, y lo que gasta cuenta como gasto de la propia sesión ([Subagentes](/guide/sessions#subagents)).

No hay nada que activar: pídelo con palabras sencillas ("haz que tres subagentes investiguen cada uno a un proveedor", "deja que Codex escriba las pruebas mientras tú haces la documentación"), o deja que el agente decida cuándo un trabajo se divide bien. A el agente principal de una sesión se le indica que trabaje así por sí mismo: se queda con la planificación y la revisión, y delega partes claras a subagentes en niveles más baratos, de modo que el trabajo cuesta menos (consulta [Niveles: un modelo para cada tipo de trabajo](/guide/agents-models#tiers-a-model-for-each-kind-of-job); **Liderar con subagentes** lo desactiva).

Para cada subagente de Hydor, el agente elige:

- **El agente y el modelo**: Custom con cualquiera de sus modelos (desde [Configuración → Modelos](/settings?s=models)), Claude Code, Codex u otro agente que hayas añadido (Gemini CLI, OpenCode…). De forma predeterminada, un subagente de Hydor ejecuta el mismo agente que la sesión que lo inició. Un modelo más barato o local sirve para el trabajo en volumen; Claude Code o Codex sirven para una parte difícil. A un agente solo se le ofrecen los programas en los que has iniciado sesión. Si pide un Claude Code o Codex en el que no has iniciado sesión (por su nombre, o como uno de tus agentes que se ejecuta en él), se le dice eso, y que Custom funciona, en lugar de recibir otro programa sin aviso.
- **Un nivel** para su parte: **Rápido** para un trabajo pequeño y muy claro, **Estándar** para una tarea clara de tamaño medio (lo que recibe un subagente de Hydor cuando no se pide ninguno), **Mejor** para una parte difícil que se sostiene por sí sola; el modelo del nivel para ese programa viene de [Configuración → Modelos → Niveles](/settings?s=models&find=Tiers). Un subagente de Hydor nunca piensa con un nivel superior al de su sesión principal, y un agente tuyo puede limitar los niveles de sus subagentes a uno más bajo.
- **Uno de tus agentes**, por nombre, en lugar de un subagente simple: trabaja con sus propias instrucciones, herramientas y nivel (consulta [Agentes que delegan trabajo a otros agentes](/guide/agents#agents-that-hand-work-to-other-agents)). Un agente que mantiene su propia conversación recibe el trabajo en su bandeja de entrada, y su respuesta llega cuando le toca.
- **La carpeta**: la de la sesión principal, a menos que indique otra.
- **Un worktree** si lo quiere: una copia separada del repositorio git de la carpeta en una rama nueva, para que los cambios del subagente no se mezclen con los de nadie más.
- **Un título breve**, que es el nombre que ves.

Un subagente de Hydor no ve nada de la conversación de la sesión principal, así que el agente le escribe un encargo con todo lo que necesita. Nadie lo vigila mientras trabaja: decide por sí mismo las cuestiones pequeñas, indica lo que decidió y se detiene a preguntar solo cuando no puede continuar.

### Cómo llegan las respuestas

Cuando termina el turno de un subagente de Hydor, su respuesta vuelve a la sesión principal como un mensaje, que la despierta. Si la sesión principal está ocupada, el mensaje espera en su cola hasta que termine su turno.

En la conversación de la sesión principal, la respuesta se muestra como una línea: "Respuesta de", el título del subagente y el comienzo de lo que escribió. Haz clic en la línea para leer la respuesta (su resumen, si era larga) y después en **Abrir su sesión** o **Leer la respuesta completa** para ir al subagente. Un subagente detenido antes de terminar aparece como "… fue detenido", y uno que falló como "… se detuvo con un error". Uno que alcanzó un límite de uso y continúa aparece como "… continúa tras un límite de uso", con la forma en que continúa.

Un subagente de Claude Code o de Codex que trabajó en segundo plano vuelve de la misma manera: una línea, "Respuesta de" y su título (o "… fue detenido", "… se detuvo con un error"), con el comienzo de lo que escribió; haz clic para leer la respuesta y después en **Abrir su sesión** para ir a ella. La respuesta de un subagente de Codex se obtiene de su propia conversación cuando abres la línea ("Cargando su respuesta"). Una respuesta que llegó mientras la sesión principal aún trabajaba se muestra en su lugar, entre los pasos anteriores y posteriores.

- Una respuesta de más de unos 4.000 caracteres llega como un resumen breve escrito por el modelo auxiliar ([Agentes, cuentas y modelos](/guide/agents-models)); la sesión principal todavía puede leerla completa.
- Si un subagente de Hydor se detiene con un error, o se detiene antes de terminar, también se le informa a la sesión principal.
- Si un límite de uso detiene el turno de un subagente de Hydor y este continúa (con otra cuenta, con crédito de API o por sí solo cuando el límite se restablece), se le informa a la sesión principal de eso en lugar de un error, para que no vuelva a empezar el trabajo: la respuesta del subagente llega cuando termina. Solo se informa como error de uno que permanece detenido. Más en [Aprovecha todas tus cuentas: cambia al llegar a un límite](/guide/agents-models#use-all-your-accounts-switch-at-a-limit).
- Un subagente de Hydor iniciado en Rápido o Estándar cuya respuesta no pasa una comprobación rápida (el modelo auxiliar lee su encargo y su respuesta), o que se detiene con un error, se ejecuta de nuevo un nivel más arriba, hasta Mejor y nunca por encima del más alto que permita su líder; se le informa a la sesión principal de que ocurrió y por qué. Solo se comprueba la respuesta a su encargo, no sus respuestas posteriores a mensajes. Un agente tuyo puede desactivarlo (**Subir de nivel cuando falla una comprobación**). La sesión principal también puede subir de nivel a un subagente por sí misma cuando considera que su resultado no es suficientemente bueno.
- La sesión principal puede consultar a sus subagentes de Hydor en cualquier momento (qué hace cada uno, su agente y modelo, lo que ha gastado, el comienzo de su última respuesta) y enviarle más trabajo a alguno.
- Las respuestas de turnos que terminaron mientras la app estaba detenida se entregan cuando vuelve a iniciarse.

Puedes abrir un subagente de Hydor y hablar con él como con cualquier otra sesión. Lo que responda al final de un turno también vuelve a la sesión principal.

### Seguir a los subagentes

- **En la conversación de la sesión principal**: los subagentes que inició un turno se muestran juntos en una tarjeta bajo ese turno, los de Hydor en una tarjeta y los propios del programa en otra. Su línea superior indica cuántos hay y de qué tipo, con lo que todos comparten ("3 subagentes de Hydor · Claude Code · Sonnet 5.5", "6 subagentes de Claude Code · Sonnet 5.5", "4 investigadores" en una investigación profunda), y cómo van ("5 trabajando · 1 terminado", también "1 te necesita", "1 detenido", "1 fallido"); haz clic para plegar o desplegar la tarjeta. Está abierta mientras alguno trabaja o te necesita, y se pliega a esa línea cuando todos han terminado. Debajo, cada subagente tiene una línea: un punto del color de su estado (azul mientras trabaja, ámbar cuando te necesita, verde terminado, gris detenido, rojo fallido), su título, en una pantalla ancha lo que tiene que los demás no (su tipo o modelo, el agente tuyo con el que trabaja, su nivel), y cómo va (cuánto ha trabajado, "Te necesita", "Hace 3 min" cuando terminó, "Detenido", "Fallido"). La línea de un subagente de Hydor también muestra lo que ha gastado, y al pasar el cursor por uno que subió de nivel aparece "Subió de nivel desde" su primer nivel y por qué; un subagente de Claude Code o de Codex no tiene un costo propio. Haz clic en una línea para abrir el subagente. Mientras otros siguen trabajando, los terminados se pliegan en una sola línea ("4 terminados: " y sus títulos; haz clic para verlos), los fallidos permanecen como líneas propias, y cuando hay más de seis trabajando se muestran cinco, con **Mostrar 3 más**. Un turno que inició un solo subagente lo muestra como una tarjeta de una línea con su tipo ("Subagente de Claude Code · Explore · Sonnet 5.5"). Para detener uno, pasa el cursor por su línea (o llega a ella con Tab) y **Detener** aparece en lugar de su tiempo (en una pantalla táctil siempre hay un pequeño botón de detener): un subagente de Hydor se detiene de inmediato, uno de Claude Code pregunta primero ("¿Detener este subagente?"), y uno de Codex no se puede detener individualmente desde aquí. El menú **⋯** de la tarjeta tiene **Detener 5 subagentes** (con cuántos se pueden detener), que los detiene a todos sin preguntar.
- **En la barra lateral**: los subagentes aparecen bajo su sesión principal, plegados en una sola línea como "3 subagentes · 1 te necesita · 2 trabajando", o "5 subagentes · 1 trabajando" si hay entre ellos alguno propio de un programa. Haz clic en la línea para desplegarlos (la fila de un subagente de programa no tiene menú ⋯); permanece abierta mientras estás en uno de ellos. En un teléfono, donde la barra lateral es un panel deslizable, tocar la línea la despliega sin cerrar el panel.
- **En el subagente**: una barra sobre el cuadro de mensaje dice "Subagente de" y el título de la sesión principal ("sus respuestas vuelven allí"), con **Abrir la sesión principal**. La página de un subagente de Claude Code o de Codex es de solo lectura: muestra la tarea que se le dio, sus pasos y su respuesta, en vivo mientras trabaja, con una barra que dice "Subagente de Claude Code de" y el título de la sesión principal en lugar de un cuadro de mensaje, con **Abrir la sesión principal**, y sin **Reanudar** ni menú de sesión. Mientras un subagente de Claude Code trabaja, **Detener** en su encabezado lo detiene, preguntando primero. Enviarle un mensaje, reanudarlo, bifurcarlo, traspasarlo o eliminarlo se rechaza: su programa lo ejecuta dentro de la sesión principal, así que habla con la sesión principal.

Un subagente de Hydor que necesita tu aprobación o una respuesta espera por ti como cualquier sesión, y aparece en la Bandeja de entrada ([Bandeja de entrada y notificaciones](/guide/inbox)).

### Qué pueden y qué no pueden hacer los subagentes de Hydor

- **Un solo nivel.** Un subagente de Hydor no puede iniciar subagentes de Hydor propios: hace la parte él mismo e indica qué más se necesita.
- **Nunca permisos más amplios.** Un subagente de Hydor nunca recibe permisos más amplios que la sesión que lo inició. Cuando ejecuta otro de Claude Code, Codex y Custom, recibe los permisos más amplios de ese agente que no sean más amplios que los de la sesión principal; otros agentes (Gemini CLI y similares) empiezan con los suyos predeterminados.
- **Una parte del límite.** Si la sesión principal tiene un límite de gasto, cada nuevo subagente de Hydor recibe una parte de lo que queda, y el límite de la sesión principal los cubre a todos ([Límites para subagentes](/guide/research#caps-for-subagents)).
- **La misma cuenta.** Un subagente de Hydor que ejecuta el mismo agente que su sesión principal (Claude Code o Codex) usa la cuenta de la sesión principal.
- **Unos pocos a la vez.** Solo cierto número de subagentes de Hydor de una sesión trabajan a la vez; el agente espera a que uno termine antes de iniciar otro.

### Define cuántos trabajan a la vez

En [Configuración → Capacidades → Subagentes](/settings?s=children), define **Trabajando a la vez, por sesión** con − y + (en el grupo **Subagentes**; su (i) enumera los límites que rigen para los subagentes de Hydor) ([ir allí](/settings?s=children&find=Working%20at%20once%2C%20per%20session)): de 1 a 12, con 4 al empezar. Cuenta los subagentes de Hydor de cada sesión por separado, no los de toda la app. Una investigación profunda usa en su lugar sus propios **Investigadores a la vez**, y un enjambre su **Tamaño del enjambre**.

## Poner un enjambre a trabajar en un problema difícil

Un enjambre pone a un equipo de agentes a trabajar en un mismo problema. Un agente responsable lo divide en ángulos de ataque realmente distintos (métodos, supuestos o formas de verlo diferentes) y pone en marcha a un miembro para cada uno. Los miembros publican en un tablero compartido lo que prueban y encuentran, leen las publicaciones de los demás y se envían mensajes entre ellos; el responsable los dirige, inicia más miembros a medida que otros terminan y hace que se compruebe la respuesta antes de dártela.

Está pensado para problemas difíciles con muchos caminos posibles: una demostración, un error persistente, una pregunta para la que nadie tiene una vía de entrada clara. Cuesta varias veces lo que cuesta un solo agente.

### Empezar un enjambre

1. En la página de inicio, abre **Opciones** y elige **Enjambre**.
2. Elige **Enjambre** («Hasta 5 agentes a la vez, cada uno desde su propio ángulo»; el número es el tamaño de tu enjambre).
3. Escribe la tarea y pulsa **Inicio**.

La fila Enjambre muestra «Activado · 5 a la vez», y el chip de Opciones lo nombra. **Tamaño del enjambre**, al final de ese menú, te lleva a su ajuste. Igual que con una investigación profunda, el modo no se conserva para tu siguiente sesión, y solo puede estar activado uno de los dos. Un límite de gasto establecido en el mismo menú Opciones cubre al responsable y a todos los miembros. El editor de una tarea programada tiene el mismo ajuste de **Enjambre**, para usar un enjambre en cada ejecución.

La primera vez que eliges **Enjambre** (o **Campaña**), aparece un cuadro de diálogo llamado «Antes de usar Enjambre» que explica qué hace, para qué merece la pena, para qué no merece la pena y cuánto cuesta. Pulsa **Usar Enjambre** para continuar o **Cancelar** para dejarlo desactivado. Se muestra una vez por cada modo, para ti, en todos tus dispositivos, tengas o no los consejos activados; si le pides a un agente que vuelva a mostrar los consejos, también reaparece.

También puedes activar o desactivar un enjambre, o cambiarlo a una campaña, dentro de una sesión: abre su menú (⋯) → **Configuración de la sesión** → **Enjambre** (su indicación dice **Desactivado**, **Activado** o **Campaña**) y elige **Desactivado**, **Enjambre** o **Campaña**. El cambio surte efecto a partir de tu siguiente mensaje: el agente de la sesión (Claude Code o Codex) se reinicia con las nuevas instrucciones y herramientas antes de ese mensaje, y la conversación continúa. Activar un enjambre desactiva una investigación profunda, y viceversa. La opción no aparece en una sesión confidencial, ni en una sesión iniciada por otra sesión (un miembro, un investigador, un subagente). El chip del cuadro de mensaje junto al **+** (sus **Opciones**) tiene la misma fila de **Enjambre**, debajo de **Permisos**.

### Cómo funciona un enjambre

1. El responsable averigua qué pide la tarea y cómo es una respuesta comprobada, y elige hasta el tamaño de tu enjambre en ángulos distintos (para una demostración: un argumento directo, contradicción, inducción, casos pequeños y una búsqueda por computadora, resultados conocidos).
2. Inicia un miembro por ángulo. Cada miembro es un subagente de Hydor con un encargo: el problema completo, su ángulo, qué cuenta como terminado y cómo comprobarlo, con el ángulo como título. Los miembros usan el mismo modelo y esfuerzo que el responsable, salvo que este elija otros.
3. Los miembros publican en el tablero a medida que avanzan: **Progreso** (qué han probado y en qué punto están), **Hallazgo** (un resultado que los demás pueden usar ya), **Pregunta** (algo que necesitan que les respondan) y **Nota**. Leen el tablero cada pocos pasos, se apoyan en los hallazgos de los demás, omiten lo que alguien ya ha descartado y responden las preguntas que se les hacen.
4. El responsable se entera del tablero por lotes: un hallazgo, una pregunta o un mensaje para el responsable le llega en aproximadamente un minuto; el progreso por sí solo, cada pocos minutos. Transmite los hallazgos útiles, reorienta hacia un nuevo ángulo a un miembro que está atascado o que repite a otro, pide a un miembro que compruebe el resultado de otro y pone en marcha miembros para ideas que nadie ha probado a medida que otros terminan.
5. Antes de concluir, el responsable hace que la respuesta se compruebe de forma independiente: por otro miembro, mediante un cálculo o con su propia comprobación cuidadosa.
6. Cuando el problema está resuelto o los ángulos se agotan, detiene a los miembros que siguen trabajando y te da la respuesta: el resultado, cómo se encontró y se comprobó, y qué ángulos fallaron y por qué.

Un miembro que termina su ángulo envía su informe al responsable. Un mensaje para un miembro que no está trabajando lo despierta.

**Un enjambre con un objetivo**: una sesión que dirige un enjambre puede tener un objetivo que la app comprueba. Cada ronda es entonces el trabajo de todo el enjambre, y la app, no el responsable, decide cuándo está hecho. Consulta [Un objetivo para un enjambre](/guide/goals#a-goal-for-a-swarm).

### Seguimiento: la barra y el tablero

La sesión del responsable tiene una barra sobre el cuadro de mensaje: **Enjambre** · «eligiendo sus ángulos» al principio, y luego algo como «3 trabajando · 2 terminados · 14 publicaciones», y **Tablero**. La sesión de cada miembro también tiene una barra: «En el enjambre de» y el título del responsable («sus publicaciones e informe van allí»), con **Tablero** y **Responsable**. En la barra lateral los miembros aparecen bajo el responsable, agrupados en una línea como «5 miembros del enjambre · 3 trabajando».

**Tablero** abre el tablero del enjambre (desde la parte inferior de la pantalla en un teléfono):

- **Miembros**: cuántos están trabajando y cuántos pueden trabajar a la vez, y luego cada miembro con lo que está haciendo ahora, o «Terminó su turno», «Detenido» o «Detenido con un error». Haz clic en un miembro para abrir su sesión; **Abrir el líder** lleva al responsable. Antes de que el responsable haya elegido sus ángulos, la lista dice que aún no ha empezado ninguno.
- **Publicaciones**: todo lo publicado, lo más reciente primero. Cada publicación muestra quién la escribió (Responsable, o el título del miembro), para quién era cuando fue dirigida a un solo miembro o al responsable, su tipo (Progreso, Hallazgo, Pregunta, Nota) y hace cuánto. Cambia entre **Todos**, **Hallazgos** y **Preguntas**. Las publicaciones nuevas aparecen según llegan.

### Detener miembros

**Detener todo** en el tablero (aparece mientras hay miembros trabajando) detiene a todos los miembros que siguen trabajando. Los miembros detenidos conservan lo que hicieron, y las nuevas publicaciones ya no los despiertan. Al responsable se le avisa de que los detuviste, y aún puede encargar más trabajo a alguno de ellos. El responsable detiene a los miembros por su cuenta cuando el problema está resuelto.

### Ajustar el tamaño del enjambre

En [Configuración → Capacidades → Subagentes](/settings?s=children), **Tamaño del enjambre** (en el grupo **Enjambre**; [ir allí](/settings?s=children&find=Swarm%20size)) establece cuántos miembros de un mismo enjambre o campaña trabajan a la vez: de 1 a 16, con 5 al principio. Cada miembro cuesta aproximadamente lo que un agente; el responsable inicia más a medida que otros terminan.

## Hacer un gran cambio con una campaña

Una campaña es el otro tipo de enjambre, pensado para un gran cambio en toda una base de código en lugar de un problema difícil: una migración, una actualización de framework, un cambio de nombre en todas partes. Elígela en el mismo lugar, **Opciones** → **Enjambre** → **Campaña** («Un gran cambio en partes, cada una en un worktree»), en una carpeta que sea un repositorio git. La fila Enjambre muestra entonces «Campaña · 5 a la vez». En una sesión que ya está en marcha, su menú (⋯) → **Configuración de la sesión** → **Enjambre** → **Campaña** hace lo mismo a partir de tu siguiente mensaje.

El responsable divide el cambio en partes (paquetes, módulos, carpetas) y las publica como su plan. Un miembro hace cada parte en una rama propia en un nuevo worktree, como máximo tantos a la vez como el tamaño de tu enjambre, ejecuta sus comprobaciones y publica la parte como terminada o fallida; una parte fallida tiene un intento más. El responsable fusiona las partes terminadas una a una, ejecutando las comprobaciones después de cada una (o abre un pull request por cada una, si lo pediste), e informa de qué cambió y qué falló. Su barra muestra «Campaña · 12 de 40 partes terminadas · 2 fallidas», y su tablero muestra las partes y cómo va cada una junto a las publicaciones. Consulta [Campañas: un gran cambio en muchas partes](/guide/engineering#campaigns-a-big-change-in-many-parts).

## Pedir una segunda opinión sobre un turno

Una segunda opinión hace que un modelo de otra empresa compruebe lo que un agente hizo en un turno frente a lo que pediste: los archivos que cambió, los comandos que ejecutó y su respuesta. El revisor busca lo que falta (pedido pero no hecho, o dicho pero no hecho), lo que está mal (errores, datos o cifras incorrectos, una petición mal entendida), lo que es arriesgado (cambios que podrían romper algo, perder datos o filtrar secretos) y lo que sobra (cambios que nadie pidió y que estorban). Trata la respuesta del agente como afirmaciones que hay que comprobar, no como pruebas.

### Pedir una

1. Abre el menú de la sesión (⋯) y elige **Segunda opinión**.
2. En **Quién lo revisa**, elige al revisor. El sugerido aparece primero.
3. En **Qué turno**, elige el turno que se va a comprobar. El último turno terminado viene elegido; se listan hasta 12 recientes, cada uno con cuándo fue y cuántos archivos cambió.
4. Pulsa **Preguntar** (el botón nombra al revisor: **Preguntar a Codex**, por ejemplo).

Una tarjeta aparece de inmediato bajo ese turno y se completa cuando responde el revisor, normalmente en uno o dos minutos. Un turno que aún se está ejecutando no se puede comprobar hasta que termine. En un teléfono, el cuadro de diálogo se abre desde la parte inferior de la pantalla.

### Quién puede comprobar el trabajo

Solo un modelo de una empresa distinta a la del modelo que hizo el trabajo, de modo que nadie revise lo suyo:

- Una sesión de **Claude Code**, o cualquier sesión que use un modelo de Anthropic, puede ser comprobada por **Codex** (mediante el programa Codex) o por uno de los modelos de Custom que no sea de Anthropic.
- Una sesión de **Codex**, o cualquier sesión que use un modelo de OpenAI, puede ser comprobada por **Claude** (Sonnet, mediante Claude Code) o por uno de los modelos de Custom que no sea de OpenAI.
- Cualquier otra sesión (Custom u otro agente con un modelo de otro fabricante) puede ser comprobada por Claude, Codex o uno de los modelos de Custom de un fabricante distinto al del modelo de la sesión.

Claude y Codex solo se ofrecen cuando has iniciado sesión en ellos (y lo mismo ocurre con los modelos de sus planes). Sin el otro programa, el revisor sugerido es uno de tus modelos de Custom de otro fabricante: uno que nombre el nivel **Mejor**, **Máximo** o **Estándar** de Custom, cuando lo hay. Si tampoco tienes un modelo de otro fabricante, agrega uno en [Configuración → Modelos](/settings?s=models).

Los modelos de Custom son los que añadiste en [Configuración → Modelos](/settings?s=models). El revisor solo lee: Claude y Codex pueden abrir archivos de la carpeta de la sesión para comprobar algo concreto, pero no cambian nada. Además del turno en sí, el revisor ve tu primer mensaje de la sesión y tu mensaje anterior a ese turno, como contexto. Cuando los cambios son demasiado grandes para mostrarlos completos, se omite una parte, y la tarjeta lo indica.

### Qué muestra la tarjeta

El encabezado de la tarjeta dice **Segunda opinión** y el nombre del revisor, y luego:

- Mientras trabaja: «Comprobando el trabajo» y cuánto ha tardado, con una línea que indica qué está leyendo el revisor.
- Cuando termina: los hallazgos por gravedad («1 crítico · 2 importantes»), **Todo bien** (con el número de puntos menores, si los hay), o **Sin veredicto claro** cuando la respuesta no se pudo interpretar como hallazgos.
- Si falló: **Sin respuesta**, con el motivo (el programa del revisor no está instalado aquí, no dio respuesta en 8 minutos, o la app se reinició mientras tanto) y **Reintentar**.

Haz clic en el encabezado para abrir o plegar la tarjeta. Dentro están el resumen del revisor y sus hallazgos, los peores primero. Cada hallazgo tiene:

- su gravedad: **Crítico** (incorrecto, roto o inseguro tal como está), **Importante** (corrígelo antes de fiarte del trabajo) o **Menor** (merece un vistazo, se puede dejar);
- un título breve, y el archivo y la línea a los que se refiere (haz clic para abrir el archivo en ese punto);
- qué está mal, por qué importa y cómo corregirlo.

Cuando hay hallazgos peores, los menores se pliegan bajo **Mostrar N menores** (**Ocultar las menores** los vuelve a plegar). La × descarta la tarjeta.

### Enviar sus puntos al agente

- El botón de enviar junto a un hallazgo (un avión de papel: **Enviar al agente**) lo pone en el cuadro de mensaje, listo para enviar o editar.
- **Enviar todo al agente** pone todos los hallazgos mostrados en el cuadro de mensaje de una vez.
- Mientras el agente está trabajando, **Poner todo en cola** (o **Poner en cola**) los añade a la cola de la sesión, para que le lleguen al agente cuando termine su turno.

El mensaje nombra al revisor, enumera cada punto con su gravedad y su archivo, y pide al agente que compruebe cada uno frente a su trabajo, corrija lo que se sostenga y diga cuáles deja y por qué.

## Comparar modelos en la arena

La arena de modelos envía el mismo mensaje a dos o tres modelos a la vez, para que puedas comparar sus respuestas lado a lado y conservar la mejor. No se ofrece un Claude Code o un Codex en el que no hayas iniciado sesión. Cada respuesta que conservas cuenta para una valoración que muestra qué modelos ganan en tus propias tareas.

### Empezar un enfrentamiento

1. En la página de inicio, elige el agente y el modelo como de costumbre: ese es el primer modelo del enfrentamiento.
2. Abre **Opciones** → **Arena** y elige **Comparar modelos** (“El mismo mensaje a más modelos, lado a lado”).
3. En “Junto al modelo que elegiste, pregunta también a (hasta 2)”, marca uno o dos modelos más. La lista ofrece algunos modelos de Claude Code, Codex y Custom, además de los otros agentes que añadiste; cuando es larga, un campo **Buscar un modelo** la filtra.
4. Escribe el mensaje y pulsa **Inicio**.

La fila de Arena indica “+1 modelo” o “+2 modelos”, y el chip de Opciones la nombra. Este navegador recuerda tus últimas elecciones, pero la arena no se mantiene activada para tu próxima sesión.

La primera vez que eliges **Comparar modelos**, aparece un cuadro de diálogo llamado “Antes de usar Arena” que explica qué hace, para qué vale la pena, para qué no vale la pena y cuánto cuesta; pulsa **Usar Arena** para continuar, o **Cancelar**. Se muestra una sola vez para ti, en todos tus dispositivos, tengas los consejos activados o no. A diferencia de una investigación profunda o de un enjambre, la arena es una opción solo de la página de inicio: envía tu primer mensaje a los otros modelos, así que no se puede añadir a una sesión que ya está en marcha.

Cada modelo trabaja en una sesión propia, con el mismo mensaje, los mismos archivos adjuntos, la misma carpeta y la misma configuración de la sesión (agente, memoria, límite de gasto), y con el esfuerzo y los permisos habituales de su agente. En un repositorio git, activa **Nuevo worktree** en el menú de la carpeta para que cada modelo tenga su propia copia del código en lugar de que todos modifiquen una sola carpeta. Si un modelo no puede arrancar, la app lo indica y el enfrentamiento continúa sin él.

### Comparar las respuestas y conservar la mejor

Cada sesión de un enfrentamiento tiene una barra sobre el cuadro de mensaje: **Arena** · “el mismo mensaje se envió a otros modelos”, con **Comparar las respuestas**. Eso abre la página de comparación: el mensaje arriba y una columna por modelo con su respuesta más reciente, que se va completando a medida que llega. Las columnas se colocan lado a lado en una pantalla ancha y una debajo de otra en un teléfono.

- **Conservar esta** (cuando ese modelo ya ha respondido) conserva su respuesta. Su sesión gana el enfrentamiento y las otras sesiones se archivan: salen de tu lista de sesiones, pero siguen ahí para abrirlas. Las columnas pasan entonces a decir **Conservada** y **Archivada**.
- **Abrir** va a la sesión de un modelo. En la conservada dice **Continuar aquí**, para seguir la conversación con la ganadora.
- **Qué modelos ganan** (**Tablero** en un teléfono) abre Uso → Arena.

### Ver qué modelos ganan

[Uso → Arena](/arena) (en el cuadro de búsqueda, Ctrl+K, es “Arena de modelos”) muestra **Qué modelos ganan en tus tareas**: cada modelo con su **Valoración**, cuántas veces fue **Conservada** de los enfrentamientos que jugó, y su **Porcentaje de victorias** (no se muestra en un teléfono). La valoración es una puntuación Elo, del tipo que se usa para clasificar a los jugadores de ajedrez, que empieza en 1000: en cada enfrentamiento que decidiste, la respuesta que conservaste venció a cada una de las demás.

Debajo, **Enfrentamientos** enumera tus últimos enfrentamientos (hasta 100): el mensaje, los modelos y cuándo, marcados con el ganador, o **Abrir** en un enfrentamiento que no has decidido. Haz clic en uno para comparar sus respuestas.

## Poner un límite de gasto a una sesión

Un límite de gasto es lo máximo que puede gastar una sesión, a precios de la API: lo que costarían sus tokens a través de la API, sea cual sea el plan con el que pagas realmente. Cuando lo alcanza, el agente se detiene hasta que subas el límite. Es un buen complemento para cualquier cosa que ejecute muchos agentes: una investigación profunda, un enjambre, subagentes, un enfrentamiento de la arena.

### Qué se cuenta

- Las llamadas a modelos de la propia sesión, incluidos los subagentes propios de su agente (los subagentes de Claude Code, por ejemplo).
- Los subagentes de Hydor que inició: su límite también los cubre.
- Los modelos de esta computadora (mediante Ollama o vLLM) no cuestan nada.
- Los tokens sin precio conocido no se pueden contar. El cuadro de diálogo del límite lo indica cuando la sesión puede haber gastado más por ese motivo.

Consulta [Uso, límites y costos](/guide/usage) para saber cuánto cuestan las sesiones en conjunto.

### Fijar un límite al empezar

En la página de inicio, abre **Opciones** → **Límite de gasto**. Escribe una cantidad en dólares y pulsa **Fijar** (o Intro), o elige $1.00, $5.00, $10.00 o $25.00. **Sin tope** lo quita. El chip de Opciones nombra entonces el límite (“Límite de $5.00”).

A diferencia de una investigación profunda, un enjambre o la arena, el límite que eliges se mantiene: tus próximas sesiones empiezan con él, en cualquier dispositivo, hasta que lo cambies.

### Fijar o cambiar el límite de una sesión

Abre el menú de la sesión (⋯) → **Configuración de la sesión** → **Límite de gasto** (el límite actual aparece a su lado). El cuadro de diálogo muestra **Gastado hasta ahora**, dividido entre esta sesión y sus subagentes de Hydor cuando los tiene (“Esta sesión $1.20, sus subagentes de Hydor $0.80”; el cuadro añade “Los subagentes que inicia también cuentan.”) y, para un subagente de Hydor, cuánto del límite de su sesión principal se ha gastado. Escribe una cantidad en **Límite** o elige $1.00, $5.00, $10.00 o $25.00, y luego pulsa **Fijar el límite** (o **Cambio**). **Quitar el límite** lo elimina.

Un límite puede ir de $0.01 a $100,000. Si no es mayor que lo que la sesión ya ha gastado, el cuadro de diálogo avisa de que la sesión seguirá detenida. En un teléfono, el cuadro de diálogo se abre desde la parte inferior de la pantalla.

### La barra sobre el cuadro de mensaje

Mientras una sesión tiene un límite, una barra sobre su cuadro de mensaje muestra lo que ha gastado de él (“$1.20 de $5.00”) con una línea que se va llenando: ámbar a partir del 80 %, roja al llegar al límite, donde dice **Límite alcanzado**. Cuando los subagentes de Hydor han gastado una parte, añade “con subagentes” (en una pantalla más ancha); apunta a las cantidades para ver el desglose. **Cambio** (o **Subir**, una vez alcanzado) abre el cuadro de diálogo del límite.

### Qué pasa al llegar al límite

El límite se comprueba después de cada llamada al modelo, así que un turno se detiene justo después de la llamada que lo alcanza (el total puede acabar un poco por encima del límite):

- El agente se detiene, y una nota bajo el turno dice “Detenida en el límite de gasto” con lo gastado del límite, y **Subir el límite…**. Un aviso nombra la sesión que se detuvo.
- Sus subagentes de Hydor que se están ejecutando también se detienen. Su nota dice que la sesión que los inició alcanzó su límite de gasto, con **Abrir** para ir allí.
- Los mensajes nuevos esperan. Un mensaje que envías no se envía: un aviso dice que se alcanzó el límite, y tu texto vuelve al cuadro de mensaje. Los mensajes de la cola quedan retenidos (“La cola está en pausa”) hasta que subas o quites el límite.

### Subir o quitar el límite

Haz clic en **Subir** en la barra o en **Subir el límite…** en la nota (o usa el menú de la sesión), y luego fija un límite por encima de lo que ha gastado la sesión, o quítalo. Los mensajes retenidos en su cola se envían entonces. Un subagente de Hydor detenido por el límite de su sesión principal vuelve a aceptar mensajes cuando se sube el límite de la principal.

### Límites para subagentes

Cada nuevo subagente de Hydor recibe un límite propio: una parte igual de lo que queda del límite de la sesión principal, reservada para la principal y para todos los subagentes de Hydor que puedan trabajar a la vez. El límite de la principal sigue cubriéndolos a todos, así que cuando se alcanza, todos se detienen. Cuando no queda nada, el agente no puede iniciar más subagentes de Hydor y se le indica que termine con lo que tiene.

### Límites en tareas programadas y apps

- **Tareas programadas**: el editor de una tarea ([Configuración → Tareas programadas](/settings?s=tasks), **Nueva tarea**, o el menú de una tarea → **Editar**) tiene el **Límite de gasto** de la página de inicio en su fila de ajustes, y **Se detiene al pasar de $** bajo **Cada ejecución** fija el mismo límite; déjalo vacío para no tener límite. La sesión de cada ejecución se detiene al alcanzarlo. Se aplica a las ejecuciones que inician una sesión nueva; una ejecución que publica en una sesión existente trabaja dentro del límite propio de esa sesión. Una tarea que un agente prepara para ti desde una conversación inicia cada ejecución con los ajustes de esa conversación, incluido su límite. Consulta [Tareas programadas](/guide/tasks).
- **Apps**: los **Límites** de una app incluyen **Lo máximo que puede gastar una ejecución (US$)**. Consulta [Apps](/guide/apps).

## Pregunta a un agente

- “Inicia una investigación profunda sobre bombas de calor para una casa de los años 30, con 6 investigadores a la vez, un informe en Word y un límite de $10.”
- “¿Cómo va la investigación profunda de mi sesión ‘Cargadores de VE comparados’?”
- “En mi sesión ‘Cargadores de VE comparados’, activa la investigación profunda con 6 investigadores y un informe en Word, a partir de mi próximo mensaje.”
- “Cambia mi sesión ‘Pruebas inestables’ a un enjambre, y vuelve a un solo agente cuando te lo diga.”
- “Pon un límite de gasto de $5 a esta sesión y dime cuánto ha gastado hasta ahora.”
- “Permite hasta 6 subagentes trabajando a la vez por sesión, y haz que los enjambres sean de 8 agentes.”
- “¿Cuáles de estos subagentes inició Hydor y cuáles Claude Code?”
- “Consigue una segunda opinión sobre el último turno de mi sesión ‘Refactorización de facturación’ y dime qué encontró.”
- “¿Qué modelos ganan en mi arena? En el último enfrentamiento, conserva la respuesta de Claude Code.”
