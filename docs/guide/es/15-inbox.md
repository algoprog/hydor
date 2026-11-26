# Bandeja de entrada y notificaciones

Los agentes trabajan por su cuenta, pero de vez en cuando te necesitan: una aprobación, una respuesta, un formulario, una clave o tu visto bueno antes de que algo salga. Este tema trata de la bandeja de entrada, que reúne en un solo lugar todo lo que espera tu respuesta de todas las sesiones y máquinas; de su Bandeja de salida, con las llamadas en espera de tu visto bueno; y de las notificaciones que te avisan cuando una sesión termina, falla o te necesita, en la app, en tu computadora o en un teléfono con la app cerrada.

![La bandeja de entrada: lo que espera tu respuesta, de todas las sesiones](images/inbox.webp)

## Abrir la bandeja de entrada

La bandeja de entrada es el icono **Bandeja de entrada** de la barra de iconos, con el icono de bandeja, justo debajo de **Experimentos** y con **Búsqueda** debajo de ella (se quedan ahí cuando arrastras los demás iconos). Un número en su esquina indica cuántas cosas esperan tu respuesta. En un teléfono, abre primero la barra lateral con **Menú** (≡): el botón está en la parte superior del panel. También puedes escribir "bandeja de entrada" en el cuadro de búsqueda (Ctrl+K, ⌘K en una Mac). [Abrir la bandeja de entrada](/inbox).

Su encabezado indica cuántas cosas esperan tu respuesta ("3 esperan tu respuesta"). Las más recientes están arriba. La lista se actualiza sola cuando las sesiones empiezan o dejan de esperar, y se vuelve a comprobar cada pocos segundos mientras la miras.

Cuando no hay nada pendiente, dice "No hay nada esperando tu respuesta".

La página de inicio también muestra lo que espera tu respuesta, primero en **Mientras estabas fuera**, debajo del cuadro de mensajes, con lo que terminó y lo que se ejecutó solo desde tu última visita (consulta [Mientras estabas fuera](/guide/start#while-you-were-away)).

## Qué aparece en la bandeja de entrada

Todo aquello por lo que un agente espera tu respuesta, de todas las sesiones de esta máquina, incluidas las sesiones que inician las tareas programadas y las apps, y de tus otras máquinas:

- **Aprobaciones**: un comando que el agente quiere ejecutar, un archivo que quiere cambiar, una herramienta que quiere usar.
- **Preguntas** que te hace el agente y **planes** a la espera de tu aprobación.
- **Formularios** que un servicio te pide rellenar a mitad de camino ("Notion te pide que rellenes un formulario"), o una página que te pide abrir.
- **Un navegador que te necesita**: "Te necesita en el navegador: …" (para iniciar sesión o superar una verificación), "Se detuvo antes de pagar o pedir: …" o "Quiere abrir …, en esta máquina o en su red".
- **Una clave que pidió un agente**: "Pide una clave: OPENWEATHER_KEY", con el motivo por el que la necesita.
- **Una habilidad que sugiere un agente**: "Sugiere una nueva habilidad: …" o "Sugiere un cambio en la habilidad …", con su motivo.
- **Una sesión que te espera en otro lugar**: "Te espera en VS Code" (o en una terminal), para las sesiones que se ejecutan fuera de la app.
- **Una pregunta de una app**: una ejecución de una de tus apps que espera en un paso **Preguntar a una persona**.
- **Un comentario de alguien con quien compartiste un proyecto o algo**: "María comentó en “Tesis, capítulo 3”", con lo que escribió, hasta que tú o un agente respondan o se resuelva. **Abrir** abre el documento, la imagen, el video o el sonido.
- **Llamadas en espera en la Bandeja de salida**: un agente llamó a una herramienta de una cuenta conectada que configuraste en Preguntar primero, como una que envía un correo. Aparecen primero, bajo **Bandeja de salida**.

Cada elemento indica en qué sesión espera (con el icono del agente) y cuánto tiempo lleva esperando.

## Responder aprobaciones, preguntas y formularios directamente en la bandeja de entrada

Las aprobaciones, las preguntas y los formularios aparecen como la misma tarjeta que ves en la sesión, así que puedes responderlos sin abrirla. Encima de cada tarjeta está el nombre de la sesión; haz clic en él para abrirla. La línea superior de la tarjeta indica qué se pregunta y cuánto tiempo lleva esperando.

- **Una aprobación** muestra lo que el agente quiere hacer: el comando, el cambio en un archivo (como un diff) o los datos de entrada de la herramienta. Haz clic en uno de sus botones: **Permitir**, una opción de "siempre" cuando el agente la ofrece (como **Permitir todas las ediciones en esta sesión** o **Permitir en esta sesión**), o **Rechazar**. Al hacer clic en **Rechazar…** se abre primero un cuadro, "Opcional: dile al agente qué hacer en su lugar"; escribe unas palabras al agente si quieres y luego haz clic en **Rechazar**.
- **Un plan** (de Claude Code) muestra el plan con **Aprobar, aceptar ediciones automáticamente**, **Aprobar, preguntar antes de editar** y **Seguir planificando**.
- **Una pregunta** muestra sus opciones: elige una (o varias, cuando se permite), o escribe la tuya en **Otra — escribe tu propia respuesta**; puedes adjuntar un archivo a una respuesta. Luego haz clic en **Enviar respuestas** u **Omitir**.
- **Un formulario de un servicio** muestra el mensaje del servicio y sus campos. Rellénalos y haz clic en **Enviar**, **Rechazar** o **Ahora no**. Un formulario sin nada que rellenar pide **Permitir** en lugar de **Enviar**. Cuando el servicio te pide abrir una página, **Abrir** la abre en una pestaña nueva.

Una vez respondido, el elemento sale de la bandeja de entrada y el agente continúa. Lo que significa cada opción se explica en [Aprobar o rechazar lo que el agente quiere hacer](/guide/sessions#approve-or-deny-what-the-agent-wants-to-do) y [Responder preguntas y aprobar planes](/guide/sessions#answer-questions-and-approve-plans).

## La Bandeja de salida: llamadas en espera de tu visto bueno

Cuando un agente llama a una herramienta de una cuenta conectada que configuraste en **Preguntar primero** ([Apps conectadas, claves y herramientas](/guide/connections#ask-first-calls-that-wait-for-your-ok)), la llamada no se realiza. Espera en la parte superior de la bandeja de entrada, bajo **Bandeja de salida**, una tarjeta por llamada, hasta que la envíes o la elimines. El agente no te esperó: se le avisó de inmediato de que la llamada espera tu visto bueno.

Cada tarjeta muestra:

- la cuenta y la herramienta ("Gmail · send_email") y cuánto tiempo lleva esperando;
- **En espera de tu visto bueno**, el icono del agente y la sesión de la que viene (haz clic en el nombre de la sesión para abrirla), y la tarea programada, cuando la llamada la hizo la ejecución de una tarea;
- lo que hace la herramienta, con las palabras del servicio;
- la llamada como un formulario que puedes modificar. Un correo muestra **Para**, **Cc**, **Asunto** y **Cuerpo**; un mensaje de chat, adónde va y su **Texto**; una publicación, su **Texto**. Otras herramientas muestran sus propios campos, con un * rojo en los que la herramienta necesita. Varias direcciones van en un solo campo, separadas por comas.

Después:

- **Enviar** realiza la llamada con lo que contiene ahora el formulario. Hydor la realiza por sí mismo, aunque el agente haya terminado hace mucho. La tarjeta sale de la bandeja de entrada y un aviso indica que se envió.
- **Eliminar** descarta la llamada: nunca se realiza.
- **Enviar todo**, encima de las tarjetas de una sesión cuando tiene más de una, las envía todas tal como están, en el orden en que quedaron en espera.

Si el servicio responde con un error, la tarjeta se queda, con **No se envió:** y el motivo, y **Enviar de nuevo**. Las llamadas en espera se conservan tras los reinicios y se guardan durante 30 días.

En la sesión, una línea marca dónde quedó en espera la llamada: **Espera tu visto bueno en la Bandeja de salida**, con **Abrir la Bandeja de salida**. Cuando decides, dice **Enviado con tu visto bueno**, con el comienzo de la respuesta del servicio, o **Descartado: no enviado**. Cuando vuelves a escribir en la sesión, su agente se entera de lo que pasó con sus llamadas.

Una llamada en espera te notifica igual que una aprobación, en la app, en tu computadora y en tu teléfono: "Espera tu visto bueno en la Bandeja de salida: …". Tócala para abrir la bandeja de entrada, donde puedes leer el borrador, modificarlo y enviarlo desde el teléfono.

## Abrir el resto donde espera

Los demás elementos se responden donde esperan. Cada uno tiene un icono, lo que se pregunta, una línea de detalle, la sesión y la hora, y **Abrir**, que te lleva allí:

- **Un navegador que te necesita** abre la sesión, donde su navegador aparece encima del cuadro de mensajes para que tomes el control ([Búsqueda y navegador](/guide/web)).
- **Una clave** o **un inicio de sesión** abre la sesión con la tarjeta donde la introduces ([Apps conectadas, claves y herramientas](/guide/connections)).
- **Una sugerencia de habilidad** abre la sesión con su tarjeta para aprobarla o rechazarla, o **Configuración → Biblioteca de habilidades** cuando esa sesión ya no existe ([Habilidades](/guide/skills)).
- **Una sesión que espera en VS Code o en una terminal** la abre aquí para que veas qué espera; respóndela en el programa en el que se ejecuta.
- **Una pregunta de una app** abre su ejecución, donde una tarjeta la plantea: **Sí** o **No**, o su formulario y **Enviar la respuesta** ([Apps](/guide/apps#apps-with-steps)).

## Cosas que esperan en tus otras máquinas

Si agregaste otras máquinas que ejecutan Hydor ([Usar otras máquinas desde una sola app](/guide/devices#use-other-machines-from-one-app)), la bandeja de entrada consulta a cada una que esté en línea y también muestra lo que espera allí. La lista se agrupa entonces por máquina, bajo el nombre de cada una; **se muestra ahora** marca la máquina que la app muestra en ese momento. Aquí mismo respondes las aprobaciones, preguntas y formularios de otra máquina, igual que los de esta.

Una máquina que no puede enviar su lista (una con una versión anterior, por ejemplo) aparece como una sola línea, "2 sesiones te esperan allí", con **Abrir** para ir a esa máquina.

## El número en el botón de la bandeja de entrada

Un pequeño número en la esquina del botón de la bandeja de entrada cuenta las sesiones que esperan tu aprobación o respuesta: en esta máquina y en tus otras máquinas que estén en línea. Pasado 99 muestra **99+**. Apunta al botón para leer "Bandeja de entrada: 3 esperan tu respuesta".

El número cuenta sesiones, no elementos, así que una sesión con dos aprobaciones cuenta una vez. Las llamadas en espera en la Bandeja de salida suman una cada una. Algunas cosas de la bandeja de entrada no suman: una clave pedida, un navegador que te necesita, una habilidad por revisar.

## El contador en la pestaña del navegador

Mientras haya sesiones de la máquina que muestra la app esperando tu aprobación o respuesta, el título de la pestaña del navegador empieza con su número: "(2) Hydor". Lo ves desde otras pestañas, sin volver a esta.

## Cómo te avisa la app

Cuando una sesión termina, falla o te necesita, la app te avisa de la forma que mejor encaje con el lugar donde estás:

- **La app está a la vista**: una pequeña tarjeta aparece deslizándose en la parte inferior de la pantalla (abajo a la derecha en una computadora). Muestra el icono del agente con un punto de color (verde si terminó, ámbar si te necesita, rojo si falló), el nombre de la sesión y el estado con el comienzo de la respuesta. Haz clic en ella para abrir la sesión, o en ✕ para cerrarla. Desaparece tras unos segundos, pero se queda mientras el puntero está sobre ella. Un aviso más reciente sobre la misma sesión sustituye a la tarjeta anterior.
- **La app está abierta en una pestaña que no estás mirando**: una notificación de tu sistema, una vez que activaste **Notificar a este dispositivo**.
- **La app está cerrada**, o el teléfono está en tu bolsillo: una notificación push, una vez que activaste **Notificar a este dispositivo** en ese dispositivo.
- **Una app de escritorio (Mac, Windows, Linux)**: la notificación propia de tu computadora (en una Mac, en el Centro de notificaciones), ya sea que la ventana de la app esté al frente, detrás de otras ventanas o cerrada (la app permanece en la barra de menús, el área de notificaciones o la bandeja del sistema), y también cuando la app se inició al iniciar sesión en la computadora sin abrir su ventana. Haz clic en ella para abrir esa sesión en la ventana de la app. Una más reciente sobre la misma sesión sustituye a la anterior. Las pequeñas tarjetas dentro de la ventana solo aparecen cuando tu sistema no está mostrando las notificaciones de la app. Mientras la ventana no está a la vista (cerrada, oculta, minimizada o detrás de otra app), el icono de la app también cuenta las sesiones con avisos nuevos, cada una una vez: un número en el icono del Dock en una Mac, en el botón de la barra de tareas en Windows (mientras la ventana está abierta: si está cerrada en el área de notificaciones, no hay botón en la barra de tareas) y en el lanzador en los escritorios Linux que muestran contadores (como el dock de Ubuntu y KDE). Se muestra incluso con No molestar o un Modo de concentración activado, y desaparece en cuanto traes la ventana al frente. En una Mac se muestra mientras Hydor puede poner una insignia en su icono: **Ajustes del Sistema → Notificaciones → Hydor → Insignia en el icono de la app** (activada por defecto una vez que permites las notificaciones de Hydor).

No recibes ningún aviso sobre la sesión que estás mirando en este momento. Una sesión ha terminado solo cuando nada de lo que inició sigue en ejecución: mientras sus tareas en segundo plano (un comando como un servidor de desarrollo, un monitor) o sus subagentes siguen trabajando, el aviso espera y llega cuando terminan. Una sesión que pospusiste y que te necesita vuelve de su pausa de inmediato. En modo Manos libres, la app también dice en voz alta cuándo termina o te necesita la sesión que sigue ([Documentos, imágenes, videos y voz](/guide/documents-voice)).

## Qué dice cada notificación

El título de una notificación es el nombre de la sesión (se acorta si es largo). El texto dice lo que pasó:

- **Terminadas**, y luego el comienzo de la última respuesta del agente. Llega después de un turno que duró al menos diez segundos, así que un intercambio rápido no genera avisos.
- Cuando la sesión te necesita, lo que necesita:
  - para una aprobación simple de sí o no, lo que el agente quiere hacer, con su primera línea (“Ejecutar un comando: npm test”);
  - en otro caso, “Necesita tu aprobación” o “Tiene una pregunta para ti”;
  - para su navegador, lo que el navegador necesita: “Te necesita en el navegador: …”, “Se detuvo antes de pagar: …”, “Pide abrir …” o “La página pregunta: …”;
  - para una sesión en VS Code o en una terminal, “Te espera en VS Code”, que se envía solo si sigue esperando un minuto después (es probable que estés justo ahí);
  - para una llamada retenida en la Bandeja de salida, “Espera tu visto bueno en la Bandeja de salida:”, la cuenta y la herramienta, y a quién va dirigida. Al tocarla se abre la bandeja de entrada.
- **Fallido**, y luego el error.

Una sesión que trabaja en un objetivo envía un aviso por cada cosa que te necesita o que le pone fin, en lugar de un “Terminadas” después de cada ronda ([Objetivos](/guide/goals)). Los avisos de “Terminadas” solo se retienen mientras el objetivo está en marcha, no mientras te espera a ti:

- “Las comprobaciones del objetivo están listas para ti”, cuando el agente ha propuesto las comprobaciones y espera tu **Inicio**, y “Una comprobación no se pudo ejecutar: …”, con cuál y por qué, cuando al pulsar **Inicio** se encontró una comprobación que no puede ejecutarse;
- la pregunta del agente, cuando pregunta por qué camino seguir; “El objetivo te necesita: …”, cuando está bloqueado por algo que solo tú puedes dar; y “El objetivo te necesita: ¿se cumple ‘…’?”, para una comprobación que solo tú puedes confirmar;
- “El objetivo espera: la cola de la sesión está en pausa: pulsa Reanudar ahí”, cuando hay mensajes esperando en una cola detenida;
- “Objetivo en pausa: …” con el motivo. Estas situaciones pausan con un aviso: no se pudo enviar su mensaje; no se pudieron guardar los archivos (antes de medir, antes de las comprobaciones de una ronda o antes de restaurarlos: “…así que la ronda 4 no se deshizo. Reanuda para comprobarla de nuevo.”); no terminó de restaurarse los archivos de una ronda (“No terminó de restaurarse los archivos de la ronda 4, así que puede que se hayan restaurado solo en parte. Todo lo que había en la carpeta está guardado: Conservar de todos modos… en la ronda 4 lo recupera. Reanudar continúa con los archivos tal como están.”); no se pudo comprobar una ronda porque la sesión siguió trabajando en la carpeta mientras se ejecutaban sus comprobaciones, tres veces seguidas (“La ronda 4 no se pudo comprobar: … Reanuda para comprobarla de nuevo.”); una comprobación que se cumplía ya no puede ejecutarse (“No se pudo ejecutar “Las pruebas pasan”: …”); no se pudo ejecutar la comprobación final (“No se pudo contactar con el revisor, así que la comprobación final no se ejecutó. Reanuda para intentarlo de nuevo.”); el agente se detuvo en el límite de uso de su plan y la app no lo continuará por sí sola; un reinicio de la app interrumpió el turno del agente por segunda vez; o la app se reinició justo cuando salía un mensaje del bucle y volver a enviarlo no funcionó (“El mensaje del bucle no llegó al agente…”). Una pausa que pulsas tú, una posterior a detener al agente (“Detuviste al agente.”) y una posterior a un turno fallido aparecen en la barra sin aviso;
- “Objetivo detenido en su límite: …”, con el límite (“Ejecutó sus 12 rondas”, “Gastó 10,00 US$ de sus 10,00 US$”);
- “Objetivo alcanzado: …”, con el objetivo;
- “No se estableció el objetivo: …”, cuando una sesión que empezaste con **Objetivo** no pudo tenerlo (un subagente de Hydor, el modo Planificar, ningún mensaje que tomar como objetivo).

La ejecución de una tarea programada dice cómo salió, en una línea que escribió el agente. Una ejecución sin nada nuevo que contar no avisa, una ejecución fallida siempre te avisa, una ejecución bloqueada dice “Bloqueada: …”, y una tarea pausada tras varios fallos seguidos lo indica ([Tareas programadas](/guide/tasks)).

Los avisos de tus otras máquinas llegan a través de esta, de modo que un solo dispositivo recibe los de todas: el texto de la notificación empieza con el nombre de la máquina, y la tarjeta en la app dice “en” esa máquina.

## Activar las notificaciones en este dispositivo

[Configuración → App → Notificaciones](/settings?s=notifications) tiene, en su grupo **Este dispositivo**, dos interruptores, que se ajustan en cada dispositivo (cada navegador) por separado, y una prueba:

- [**Notificar a este dispositivo**](/settings?s=notifications&find=Notify%20this%20device): una notificación cuando una sesión termina, falla o necesita tu respuesta, incluso con la app cerrada. Al activarlo, el navegador te pide permiso para mostrar notificaciones. Cada dispositivo lo activa por sí mismo: tu teléfono y tu computadora por separado. En una app de escritorio (Mac, Windows, Linux) siempre está activado: llegan como notificaciones de Mac, de Windows o de tu escritorio mientras la app está en ejecución, incluso con su ventana cerrada. En un Mac, macOS pregunta una vez si Hydor puede enviar notificaciones: permítelo, y usa **Ajustes del Sistema → Notificaciones → Hydor** para elegir cómo se muestran. Cuando el sistema no las muestra, la fila lo indica, y mientras tanto se muestran dentro de la app; su **(i)** dice dónde permitirlas (en Windows, **Configuración → Sistema → Notificaciones**). Activa el interruptor para permitirlas: se abre Ajustes del Sistema en las notificaciones de Hydor (en Windows, Configuración → Sistema → Notificaciones), y cuando vuelves a la app, una notificación de prueba muestra que funcionan.
- [**Sonido**](/settings?s=notifications&find=Sound): un breve timbre con cada aviso mientras la app está abierta, ascendente cuando una sesión termina y descendente cuando te necesita o falla. Está desactivado al principio; al activarlo suena el timbre una vez. En una app de escritorio el timbre suena solo con los avisos que la app muestra dentro de su ventana; las notificaciones del sistema hacen su propio sonido.
- [**Enviar una prueba**](/settings?s=notifications&find=Send%20a%20test) (la fila **Pruébalo**, que aparece cuando **Notificar a este dispositivo** está activado): envía una notificación a todos los dispositivos que activaron las notificaciones. Dice “Las notificaciones funcionan en este dispositivo.” y se muestra cuando la app no está a la vista, así que cambia a otra ventana para verla. Un mensaje te dice a cuántos dispositivos se envió, o “Ningún dispositivo la recibió.” En una app de escritorio, **Pruébalo** aparece desde el principio: **Enviar una prueba** muestra al instante una notificación en esta computadora, incluso con la app al frente. Si el sistema no la muestra, un mensaje dice “No se mostró. Permite las notificaciones de Hydor en la configuración del sistema.”

Para configurarlo en un teléfono:

1. Abre la app en el teléfono. Para esto tiene que servirse por HTTPS: [Configuración → App → Usar en tu teléfono](/settings?s=phone) lo hace de forma privada con Tailscale, y su código QR abre la app en el teléfono en los pasos siguientes ([Úsala en tu teléfono con Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale)).
2. En un iPhone o iPad, primero añade la app a tu pantalla de inicio (**Compartir** → **Añadir a pantalla de inicio**) y ábrela desde ahí. Hasta entonces la configuración lo indica y no se puede activar.
3. Abre **Configuración → App → Notificaciones** y activa **Notificar a este dispositivo**. Permite las notificaciones cuando el teléfono te lo pida.
4. Toca **Enviar una prueba** y luego sal de la app para ver cómo llega.

Si la configuración dice que las notificaciones están “Bloqueadas para este sitio en la configuración del navegador”, primero permítelas para la dirección de la app en la configuración del navegador y luego actívalas. Si dice “Este navegador no puede recibir notificaciones aquí”, el navegador no puede recibirlas en esta dirección, a menudo porque la app se abre por HTTP simple en lugar de HTTPS.

Si un día el interruptor aparece desactivado de nuevo, el servicio push del navegador descartó este dispositivo: vuelve a activarlo. Cuando un teléfono está apagado o sin conexión, una notificación lo espera hasta un día. Una notificación más reciente sobre la misma sesión sustituye a una anterior en el dispositivo.

Para dejar de recibirlas, desactiva **Notificar a este dispositivo** en ese dispositivo.

## Aprobar o rechazar desde la notificación

Cuando una sesión espera una aprobación simple de sí o no (un comando, un cambio de archivo o una herramienta; no una pregunta, un formulario o un plan), su notificación lleva dos botones con las palabras de la propia tarjeta, como **Permitir** y **Rechazar**, en los navegadores que muestran botones en las notificaciones.

- Toca uno para responder sin abrir la app. Una notificación discreta lo confirma, por ejemplo “Permitir: Ejecutar un comando”.
- Si la respuesta no puede enviarse (el navegador cerró la sesión o ya respondiste en otro lugar), se abre la sesión para que respondas ahí.
- Toca la notificación misma para abrir la sesión, en una ventana de la app que ya esté abierta cuando la haya.
- Las notificaciones de una app de escritorio no tienen botones: haz clic en una para abrir la sesión y responde ahí.
- Una llamada retenida en la Bandeja de salida tampoco tiene botones, para que leas primero lo que saldría: toca la notificación y envíala desde la bandeja de entrada.

Las aprobaciones de tus otras máquinas pueden responderse de la misma manera: la respuesta llega a esa máquina a través de esta.

## Pregunta a un agente

Los agentes pueden leer lo que está esperándote y enviar una notificación de prueba. No pueden responder por ti a las aprobaciones de otras sesiones. Algunas ideas para probar:

- “¿Qué está esperándome ahora mismo? Lo más urgente primero.”
- “¿Qué sesiones me piden una clave, y para qué?”
- “¿Qué hay esperando en mi Bandeja de salida? Léeme los correos antes de que los envíe.”
- “Resume lo que necesita de mí cada sesión que espera, en una línea cada una.”
- “Envía una notificación de prueba para comprobar que mi teléfono las recibe.”
