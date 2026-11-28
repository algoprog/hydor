# Teléfonos, otras máquinas y compartir

Hydor funciona desde cualquier navegador: en tu teléfono, en otra computadora y en varias máquinas que lo ejecutan cada una. Este tema trata de cómo usarlo en un teléfono (al que se accede de forma privada mediante Tailscale, configurado en unos pocos clics), cómo acceder a él de forma segura desde otros lugares, cómo trabajar con otras máquinas desde una sola app, cómo compartir una sesión con un enlace de solo lectura, cómo permitir que agentes de otros lugares empiecen y dirijan sesiones aquí, y cómo añadir las cuentas de GitHub o Gitea con las que se abren los pull requests.

![La app en un teléfono: una sesión que te necesita](images/devices.webp)

## Usar la app en un teléfono

La app en un teléfono es la misma app que en una computadora, con un diseño adaptado a una pantalla pequeña (una ventana estrecha en una computadora también recibe este diseño). Lo que cambia:

- **La barra lateral es un cajón.** Toca **Menú** (≡) en la parte superior izquierda de una página o sesión para abrirla. Ocupa toda la pantalla, con tus sesiones, la Bandeja de entrada y las herramientas; toca una sesión o una herramienta para ir a ella, o **Cerrar menú** (✕) para volver.
- **Los selectores se abren como hojas.** En la página de inicio, los menús del programa, el modelo, la carpeta, el agente y **Opciones** suben desde la parte inferior de la pantalla, sin tapar el teclado, con la página atenuada detrás; un ajuste dentro de **Opciones** se abre sobre su hoja. En una sesión, el chip del modelo del cuadro de mensaje (y su esfuerzo y permisos) abre una hoja de la misma manera. Los cuadros de diálogo también suben desde abajo.
- **Una cosa a la vez.** Configuración es una lista, con cada sección en su propia página. Archivos muestra una carpeta, con su nombre arriba (toca el nombre para ver los lugares, **‹** para ir a la carpeta superior), y luego un archivo en su propia página con **Atrás**. La página de Git muestra tus repositorios y luego abre uno con una flecha para volver.
- **Tacto en lugar de ratón.** En Archivos, el ⋯ de una fila abre su menú, y mantener pulsada una fila la selecciona, para actuar sobre varias a la vez. El editor ajusta las líneas largas. La página de Terminal añade una fila de teclas que los teléfonos no tienen (Ctrl, Alt, Esc, Tab, las flechas y más).

Para poder usar la app en tu teléfono, debe ser accesible desde fuera de esta computadora. [Configuración → App → Usar en tu teléfono](/settings?s=phone) lo hace en unos pocos clics, de forma privada, con Tailscale: consulta [Úsala en tu teléfono con Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale).

### Añadirla a la pantalla de inicio

Instalada en tu pantalla de inicio, la app se abre a pantalla completa con su propio icono, como cualquier otra app. Esto requiere que la app se sirva por HTTPS, como hace Usar en tu teléfono. Abierta en el teléfono, [Usar en tu teléfono](/settings?s=phone&find=Add%20to%20Home%20Screen) muestra los pasos para el teléfono que tienes en la mano en **En este teléfono → Añadir a pantalla de inicio**, con un botón **Instalar** donde el navegador lo ofrece.

- **iPhone o iPad**: abre la app en el navegador, toca **Compartir** y luego **Añadir a pantalla de inicio**. A partir de entonces, abre Hydor desde su nuevo icono.
- **Android**: abre la app en tu navegador y usa la opción de su menú para instalar la app o añadirla a la pantalla de inicio.

### Compartir a Hydor desde otras apps

Una vez instalada, Hydor aparece en la hoja de compartir de tu teléfono o computadora, como una app de mensajería. Comparte una foto, un PDF, una página web o unas líneas de texto desde cualquier otra app, elige **Hydor**, y la página de inicio se abre con lo que compartiste ya en su cuadro de mensaje: las palabras y el enlace como texto, los archivos como adjuntos. Añade unas palabras sobre qué hacer con ello, elige el agente si quieres, y envía.

- **Android**: funciona en Chrome, Edge y otros navegadores basados en Chromium, una vez instalada la app desde el menú del navegador (**Instalar app** o **Añadir a pantalla de inicio**).
- **Una computadora**: funciona en Chrome y Edge una vez instalada la app (el botón de instalar en la barra de direcciones, o el menú del navegador → **Instalar Hydor**), desde apps que comparten mediante la hoja de compartir del sistema.
- **iPhone y iPad**: Safari no permite que las apps web reciban contenido compartido. Envía una foto o un archivo a tus agentes desde una app de chat (consulta [Qué puede hacer un chat](/guide/devices#what-a-chat-can-do)). Para texto y enlaces, un atajo lo resuelve: en la app Atajos crea uno que aparezca en la hoja de compartir y acepte texto y URL, añade **Codificar URL** para su entrada, y luego **Abrir URL** con la dirección de tu app seguida de `/?prompt=` y el texto codificado (como `https://hydor.example.com/?prompt=` y el resultado). Abre la página de inicio en Safari con el texto en el cuadro.

Un contenido compartido requiere que hayas iniciado sesión en ese dispositivo: uno hecho sin sesión iniciada no llega a Hydor, y la página de inicio lo indica. Con cada contenido compartido pueden ir hasta 25 MB de archivos, como con el cuadro de mensaje, guardados donde el cuadro de mensaje guarda sus adjuntos.

### Recibir notificaciones en tu teléfono

Una notificación puede llegar a tu teléfono cuando una sesión termina, falla o necesita tu respuesta, incluso con la app cerrada.

1. En el teléfono, abre [Configuración → App → Notificaciones](/settings?s=notifications&find=Notify%20this%20device).
2. Activa **Notificar a este dispositivo** y permite las notificaciones cuando el navegador lo pida. Cada dispositivo lo activa por su cuenta.
3. **Enviar una prueba** comprueba que funciona (se muestra cuando la app no está a la vista).

Abierta en el teléfono, [Usar en tu teléfono](/settings?s=phone) tiene el mismo interruptor **Notificar a este dispositivo** en **En este teléfono**, después de **Añadir a pantalla de inicio**, y su **Enviar una prueba** va solo a ese teléfono.

En un iPhone o iPad, primero añade la app a tu pantalla de inicio y ábrela desde allí: de lo contrario, el navegador no puede recibirlas. Si las notificaciones están bloqueadas para el sitio, permítelas primero en la configuración del navegador. Una aprobación sencilla de sí o no llega con **Aprobar** y **Rechazar** en la propia notificación, donde el teléfono muestra botones. Más en [Bandeja de entrada y notificaciones](/guide/inbox).

## Habla con tus agentes desde Telegram, Discord y Slack

Desde un chat de Telegram, Discord o Slack, en cualquier teléfono o computadora, puedes empezar sesiones (también como uno de tus propios agentes), enviarles fotos, archivos y mensajes de voz, leer sus respuestas y responder a lo que los agentes preguntan. Cada uno funciona mediante un bot o app propios, configurados en [Configuración → App → Apps de chat](/settings?s=chat). Hydor se conecta hacia ellos (pide a Telegram los mensajes nuevos, y abre un WebSocket con el Gateway de Discord y con el Socket Mode de Slack), así que ninguno necesita que la app tenga una dirección en internet.

### Conectar un bot o una app

Abre [Apps de chat](/settings?s=chat) y pulsa la fila del que quieras en el grupo **Bots** (dice **Configuración** hasta que se conecta): sus pasos se abren debajo. Lo que pegues se guarda en la Bóveda, cifrado, y no vuelve a mostrarse en la app.

- **Telegram**: en Telegram, abre @BotFather, envía `/newbot` y dale al bot un nombre y un nombre de usuario. Pega el token que te responde, como `123456789:AA…`, en el cuadro de la fila de [Telegram](/settings?s=chat&find=Telegram), y pulsa **Conectar**.
- **Discord**: en el Developer Portal (discord.com/developers/applications) crea una **New Application**. En **Bot**, pulsa **Reset Token** y cópialo, y activa **Message Content Intent** para que el bot pueda leer lo que escribes. Pega el token en la fila de [Discord](/settings?s=chat&find=Discord) y pulsa **Conectar**. Luego añade el bot a un servidor tuyo con su fila **Añadir el bot a un servidor** (Discord solo te deja escribir a un bot con el que compartes un servidor, así que sirve un servidor pequeño propio). La invitación pide View Channels, Send Messages y Read Message History, y Hydor da a conocer sus comandos de barra.
- **Slack**: en api.slack.com/apps elige **Create New App → From a manifest**, escoge tu espacio de trabajo y pega el manifiesto que copia **Copiar manifiesto** (en los pasos de la fila de [Slack](/settings?s=chat&find=Slack), y en una fila propia una vez conectado): activa Socket Mode, se suscribe a los mensajes directos y a las menciones, añade el comando `/hydor` y pide los permisos del bot `app_mentions:read`, `chat:write`, `commands`, `files:read` (para los archivos que le envías), `im:history`, `reactions:write` y `users:read`. En **Basic Information → App-Level Tokens** genera un token con el permiso `connections:write` (empieza por `xapp-`); en **Install App** instala la app en tu espacio de trabajo y copia el Bot User OAuth Token (empieza por `xoxb-`). Pega ambos y pulsa **Conectar**.

Una vez conectado, la primera fila debajo muestra el nombre del bot y lo que está haciendo (“Listening for messages”, o lo que falla: el Message Content Intent de Discord desactivado, un permiso que le falta a la app de Slack). **Conectar** rechaza un token solo cuando el propio servicio lo rechaza: cuando Telegram, Discord o Slack tardan en responder o no se puede llegar a ellos en ese momento (como puede pasar en los primeros minutos de un bot nuevo), Hydor conserva el token, la fila dice **Conectando…** y el motivo, y el bot se conecta solo en cuanto el servicio responde. Un bot de Telegram recibe sus mensajes en un solo lugar, así que cuando otra copia de Hydor u otro programa usa el mismo bot, la fila lo indica. El menú **⋯** de la fila tiene **Cambiar token** (**Cambiar tokens** en Slack), que introduce otros (los chats de otro bot se vinculan de nuevo), y **Desconectar**, que lo quita de Hydor, y el bot o la app siguen siendo tuyos.

### Vincular un chat

Solo los chats que vincules pueden usar el bot: a cualquier otra persona que lo encuentre se le dice que es de alguien en particular.

1. Abre la fila y pulsa su fila [Vincular un chat](/settings?s=chat&find=Link%20a%20chat). Muestra un código que funciona una sola vez, durante diez minutos.
2. En Telegram, pulsa **Abrir en Telegram** y luego **Inicio** en el chat que se abre, o envía el código al bot. En Discord y Slack, envía el código al bot o a la app en un mensaje directo, o menciónalo con el código en un canal. El chat aparece en la fila con su nombre.

Un canal se vincula con la persona que envió el código: solo a ella se le escucha allí, y solo cuando menciona al bot. El botón de la papelera (**Desvincular**) junto a un chat le quita el uso de tus agentes.

### Qué puede hacer un chat

- **Enviar lo que quieres que se haga**: va a la sesión en la que está el chat, o empieza una nueva, en una carpeta de tarea propia como hace la página de inicio, con el agente establecido en la fila **Las sesiones nuevas usan** (**Claude Code**, **Codex** o **Custom**; hasta que elijas uno, el primero de Claude Code y Codex en el que hayas iniciado sesión; si no, Custom), como el agente tuyo de la fila **Las sesiones nuevas como** si elegiste uno. Lo que envíes mientras el agente trabaja espera en la cola de la sesión.
- **Fotos, archivos y mensajes de voz**: envíalos como se los enviarías a una persona, con un pie de foto si quieres: el pie va con ellos, y varios enviados a la vez (un álbum) llegan juntos. Cada uno se guarda en la carpeta de la sesión a la que va, con su propio nombre (las fotos y los mensajes de voz se nombran según cuándo llegaron, como `photo-2026-11-15-0930.jpg`), y llega al agente como lo hacen los adjuntos del cuadro de mensaje: las imágenes para verlas, los demás archivos para abrirlos. Un mensaje de voz llega al agente como palabras cuando el [Reconocimiento de voz en el servidor](/settings?s=voice&find=Speech%20recognition%20on%20the%20server) está activado en Configuración → Capacidades → Voz, y su grabación se queda en la carpeta; sin él, la grabación va como archivo de sonido, y el chat dice cómo activarlo. Telegram permite que los bots obtengan archivos de hasta 20 MB, y Hydor acepta archivos de hasta 25 MB de Discord y Slack: el chat avisa cuando uno es demasiado grande. Lo que contienen los archivos, y los mensajes reenviados de otra persona, llegan al agente marcados como datos externos, para trabajar con ellos, nunca como instrucciones. En Slack, los archivos necesitan el permiso `files:read`: una app creada con un manifiesto anterior necesita que se lo añadas en **OAuth & Permissions**, y luego instalarla de nuevo (el chat lo dice cuando un archivo no puede llegar).
- **Tus propios agentes**: `/as` y el nombre de un agente empieza una nueva sesión como uno de tus [agentes](/agents), como `/as Contable añade esto a octubre` con la foto de un recibo. `/as` y solo el nombre hace que la próxima sesión nueva del chat empiece como él, y `/agents` (o `/as` solo) los lista con un botón cada uno, los tuyos primero. Un agente que mantiene una conversación propia lleva el chat a esa conversación. Discord completa el nombre del agente mientras escribes `/as`; en Slack, escribe `/hydor as Contable …`. La fila [Las sesiones nuevas como](/settings?s=chat&find=New%20sessions%20as) hace que cada sesión nueva de esa app de chat empiece como uno de tus agentes.
- **La respuesta** vuelve cuando termina el turno del agente, con el formato de la app (el formato de Telegram; el Markdown de Discord, en mensajes de 2.000 caracteres; el mrkdwn de Slack en bloques), en hasta diez mensajes cuando es larga (el resto se queda en la sesión). Telegram y Discord muestran “escribiendo…” mientras trabaja; Slack pone un reloj de arena en tu mensaje. **Abrir en Hydor** abre la sesión en la app, cuando la app tiene una dirección en internet o se sirve en tu tailnet (consulta [Úsala en tu teléfono con Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale)).
- **Lo que pregunta un agente**: una pregunta sencilla de sí o no llega con botones que la responden; cualquier cosa más compleja (un formulario, un plan) llega con un enlace para responder en la app.
- **Comandos**: `/new` empieza una nueva sesión (`/new` y lo que debe hacer la empieza de inmediato), `/as` y `/agents` empiezan una como uno de tus agentes (arriba), `/sessions` lista las últimas para continuar con una, `/stop` detiene al agente, `/status` dice en qué sesión está el chat y qué está haciendo, y `/help` los lista. Telegram los muestra en su menú de comandos, y Discord como comandos de barra; en Slack van después de `/hydor` (`/hydor new`, y `/hydor` con otras palabras es un mensaje a la sesión); en Discord y Slack `!new`, `!as`, `!status` y los demás también funcionan escritos como mensaje.
- **Avisos**: con la fila **Avisos de todas las sesiones** activada, como lo está salvo que la desactives, cada sesión que termina, falla o te necesita lo dice en tus chats, no solo las que empezó un chat.

Los stickers, las encuestas y las ubicaciones no llegan a los agentes: el chat pide palabras, fotos, archivos o mensajes de voz en su lugar.

## Acceder a la app desde otro dispositivo

De fábrica, la app responde solo en la computadora donde se ejecuta (puerto 8790 de `127.0.0.1`). Cualquiera que pueda llegar a ella y conozca la contraseña puede ejecutar cualquier comando como tu usuario allí, así que trata el acceso a la app como el acceso por SSH a la computadora. Para usarla desde tu teléfono u otra computadora, pon HTTPS delante en lugar de abrir el puerto a la red. La forma más sencilla ya viene integrada: [Usar la app en tu teléfono con Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale), más abajo. HTTPS es también lo que los teléfonos necesitan para instalar la app y recibir notificaciones push.

### Usar la app en tu teléfono con Tailscale

Tailscale es una app gratuita que enlaza tus propios dispositivos en una red privada, llamada tailnet. [Configuración → App → Usar en tu teléfono](/settings?s=phone) publica Hydor en ella, en una dirección como `https://laptop.tail1234.ts.net`. Solo los teléfonos y las computadoras con la sesión iniciada en tu cuenta de Tailscale pueden abrir esa dirección, nunca internet público, y la app sigue pidiendo su contraseña. Nunca activa Tailscale Funnel, que haría pública la app.

1. Instala Tailscale en esta computadora e inicia sesión ([tailscale.com/download](https://tailscale.com/download)). La fila **Tailscale en esta computadora** de la sección indica cuándo está lista ("Signed in. This computer is laptop on you@example.com."). Hasta entonces indica qué falta (no instalado, no en ejecución, sin sesión iniciada, desactivado) con **Obtener Tailscale** o lo único que hay que hacer, y **Comprobar de nuevo**.
2. Pulsa [**Servir en mis dispositivos**](/settings?s=phone&find=Serve%20it%20on%20my%20devices). La fila **Dirección** muestra la dirección de la app, con **Copiar** y **Abrir**. La app acepta esa dirección por sí sola: no hay ningún archivo que editar.
3. Instala también Tailscale en tu teléfono, con la sesión iniciada en la misma cuenta.
4. Escanea el código QR que hay bajo [**Ábrela en tu teléfono**](/settings?s=phone&find=Open%20it%20on%20your%20phone) con la cámara del teléfono (o escribe la dirección) e inicia sesión con la contraseña de la app.
5. El teléfono se abre en **Usar en tu teléfono**, con **En este teléfono**: **Añadir a pantalla de inicio** (en un iPhone, en Safari: Compartir → **Añadir a pantalla de inicio**, que las notificaciones necesitan allí; en Android, **Instalar**, o el menú de Chrome → **Instalar app**), después **Notificar a este dispositivo** y **Enviar una prueba**, que envía una notificación solo a ese teléfono.

**Dejar de servir** quita la app de tu tailnet. Deshace exactamente lo que hizo **Servir en mis dispositivos**: la dirección que publicó y la dirección que añadió a las que la app acepta. Todo lo demás que sirvas con Tailscale se queda como estaba. Si ya habías servido la app con Tailscale a mano, la sección lo muestra ("Set up outside this page, with Tailscale itself"), y **Dejar de servir** también lo desactiva.

Mientras la app está servida, los enlaces que genera empiezan con esta dirección, así que también se abren en tu teléfono: el **Open in Hydor** de una sesión en una app de chat, y los enlaces que los agentes te dan a sesiones y a páginas guardadas. Si `ALLOWED_ORIGINS` indica una dirección propia (consulta [Otras formas de acceder](/guide/devices#other-ways-to-reach-it)), los enlaces siguen usando esa.

En una terminal, `hydor machines phone` dice lo mismo y dibuja el código QR; `hydor machines phone serve` y `hydor machines phone stop` hacen el resto (consulta [La terminal](/guide/terminal)).

### Cuando algo se interpone

La sección explica en una frase qué ocurrió, con lo único que hay que hacer:

- **Serve and HTTPS certificates aren't turned on in your tailnet yet.** Tailscale da un enlace que los activa: **Activarlas** lo abre (inicias sesión en Tailscale y confirmas una vez), y luego **Reintentar**.
- **On Linux, Tailscale lets only its operator change what it serves.** Ejecuta una vez el comando que se muestra en una terminal (`sudo tailscale set --operator=$USER`, con tu nombre de usuario), y luego **Reintentar**.
- **Something else is already published at the address.** Hydor nunca lo reemplaza: **Serve on port 8443** publica la app en `https://laptop.tail1234.ts.net:8443` en su lugar.
- **Funnel is on for this address.** Tailscale Funnel se activó a mano, así que cualquiera en internet puede llegar a ella: la sección lo indica, con el comando que lo desactiva.
- **HTTPS certificates are off in your tailnet.** **Activarlas** abre la configuración de DNS de Tailscale, donde activas MagicDNS y HTTPS Certificates.

### Otras formas de acceder

Si prefieres configurarlo tú mismo, cualquiera de estas opciones también funciona:

- **Tailscale a mano**: en esta computadora, `tailscale serve --bg 8790` sirve la app en `https://<machine>.<tailnet>.ts.net`, accesible solo desde tus propios dispositivos.
- **Cloudflare Tunnel**: apunta un túnel a `http://localhost:8790`. Cloudflare Access puede añadir un segundo inicio de sesión por delante.
- **Tu propio proxy inverso**, como Caddy, que envíe un nombre de host tuyo a `127.0.0.1:8790`.

Si el proxy cambia el encabezado `Host`, indica a la app la dirección en la que la gente la abre: `ALLOWED_ORIGINS=https://agents.example.com`. Los ajustes como este van en `~/.config/hydor.env` (un `NAME=value` por línea) para una app instalada como servicio, o en `.env` para Docker Compose; reinicia la app después.

Las vistas previas de servidores de desarrollo usan un puerto propio (8791); consulta [Ver un servidor de desarrollo con Preview](/guide/files-git#look-at-a-dev-server-with-preview).

### La contraseña protege todo

La contraseña protege todo. Un navegador permanece con la sesión iniciada durante 30 días después de iniciar sesión. Las contraseñas incorrectas se cuentan por la dirección de la que provienen, durante la última hora:

- Tras tres, la página de inicio de sesión muestra también una imagen con cinco caracteres que debes escribir en **Caracteres de la imagen**, para que un programa no pueda seguir adivinando. Escribirlos mal no cuesta nada, y **Nueva imagen** (la flecha redonda a su lado) trae otra.
- Tras diez, esa dirección no puede iniciar sesión durante una hora, ni siquiera con la contraseña correcta. La página indica cuánto tiempo queda.
- Tras diez desde cualquier lugar, todos reciben la imagen; tras sesenta, nadie puede iniciar sesión hasta que pase la hora.

Detrás de uno de los proxies anteriores, la dirección que se cuenta es la del propio visitante, tal como el proxy la transmite. Si te bloqueas, inicia sesión desde otra red (los datos móviles de un teléfono, por ejemplo), espera, o establece una contraseña nueva en la propia computadora, lo que levanta todas las pausas. Consulta [Cambiar tu contraseña](/guide/app#change-your-password).

## Usar otras máquinas desde una sola app

Si Hydor se ejecuta en más de una máquina (una computadora de escritorio, un servidor con GPU, una computadora en la nube), puedes usarlas todas desde una de ellas. Cada máquina conserva sus propias sesiones, archivos, terminales, inicios de sesión y configuración; la app que abres muestra una máquina a la vez, y la barra lateral permite cambiar entre ellas.

Esto se configura en [Configuración → App → Máquinas](/settings?s=machines). Su grupo **Máquinas** (con **Añadir una máquina** junto a su título) empieza con esta máquina ("This server", con su versión), seguida de las que añadiste, cada una con:

- un punto: verde cuando responde, gris mientras se conecta, rojo cuando no responde;
- cómo se llega a ella (`ssh gpu-box` o su dirección) y cómo está: "Online", "2 need you · 1 working", "Connecting…" o "Not reachable" (con el motivo);
- **Abrir** (sus páginas), y un menú **⋯** con **Editar** y **Quitar**. Una máquina que no responde tiene además un botón **Intentar de nuevo ahora**.

### Añadir una máquina

1. **En la otra máquina**, instala Hydor y crea un token de acceso para esta: en su propio [Configuración → App → Máquinas](/settings?s=machines&find=Access%20from%20other%20machines) → **Nuevo token**, o ejecutando `node dist/server/cli.js access-token "my laptop"` en su carpeta de Hydor. Copia el token (empieza con `acm_`).
2. **Aquí**, abre [Configuración → App → Máquinas](/settings?s=machines&find=Add%20a%20machine) y haz clic en **Añadir una máquina**.
3. Ponle un **Nombre** ("GPU box").
4. En **Cómo llegar a ella**, elige cómo llega esta máquina hasta allí:
   - **Por SSH**, lo más sencillo: el **Host SSH** (un nombre de tu `~/.ssh/config`, o `user@host`) y **Su puerto**, el puerto en el que Hydor escucha allí (8790). Esta máquina abre la conexión con sus propias claves SSH, que deben funcionar sin pedir una frase de contraseña. La otra máquina sigue escuchando solo en su propio `127.0.0.1`: no hace falta abrir nada allí.
   - **Por su dirección**, en una red privada, una VPN como Tailscale o WireGuard, o detrás de HTTPS: por ejemplo `http://100.64.0.5:8790`. La app de allí debe escuchar donde esta máquina llega a ella (su ajuste `HOST`).
5. Pega el **Token de acceso** y haz clic en **Conectar**.

La app comprueba que la máquina responde antes de guardarla. Si no responde, el cuadro de diálogo dice por qué ("Could not use GPU box: …") y no se añade nada.

### Cambiar entre máquinas

Una vez que has añadido una máquina, aparece una fila con el nombre de la máquina actual en la parte superior de la barra lateral, encima de **Nueva sesión**. Haz clic en ella para ver todas las máquinas con su estado y una marca en la que se muestra; elige una para pasar a sus páginas. **Añadir o cambiar máquinas** abre Configuración → Máquinas.

En las páginas de otra máquina la fila aparece resaltada, para que sepas dónde estás. La fila también dice qué ocurrió en las máquinas que no estás viendo, y en la tuya también cuando estás en las páginas de otra:

- Un número en una píldora de color de acento cuenta las sesiones de allí que terminaron desde la última vez que miraste esas máquinas. Apúntalo y dice “3 terminadas en otras máquinas”.
- Un punto naranja significa que hay sesiones allí esperándote.

“Desde la última vez que miraste” funciona por máquina. Mientras una página muestra una máquina, nada de lo que ocurre allí cuenta. Cuando la dejas, cuentan las sesiones que terminan allí después, hasta que vuelves a mirar: abriendo una de ellas, o simplemente cambiando a esa máquina.

En el menú cada máquina tiene una línea como “2 terminadas · 1 te necesita · 3 trabajando” (también la de tu propia máquina, mientras estás en otra). Debajo están las sesiones que terminaron allí, hasta tres, cada una con una marca de verificación, o una cruz si falló, y la hora. Haz clic en una para abrir esa sesión en su máquina. [Configuración → Máquinas](/settings?s=machines) muestra las mismas líneas.

Mientras una máquina se actualiza, su línea dice “Actualizando · 45%”, o el paso en el que va. Una máquina que se reinicia con la nueva versión dice “Reiniciando…”, con un punto naranja que parpadea, en lugar de “No disponible”, y vuelve por sí sola. Si una máquina no responde por otra causa, una página dice "… is not reachable" con **Reintentar**, un botón para volver a tu propia máquina y **Configuración → Máquinas**.

Cuando la barra lateral con la fila está oculta, el icono **Sesiones** de la barra de iconos lleva en su lugar un pequeño punto: de color de acento cuando algo terminó en otra máquina, naranja cuando algo te espera allí.

### Cuando una máquina tiene un Hydor más antiguo

La app que abres muestra las páginas de otra máquina en su propia versión, sea cual sea el Hydor que ejecute esa máquina. Una máquina con un Hydor más antiguo puede carecer de lo que sus páginas necesitan, y algunas pueden dejar de funcionar. Por eso, cuando eliges una máquina cuyo Hydor es más antiguo que el de esta app, primero aparece una página: "… has an older Hydor". Indica ambas versiones, que sus páginas se abren aquí en la versión de esta app, y que algunas pueden dejar de funcionar con una más antigua. Tiene tres botones:

- **Actualizar…** (con el nombre de la máquina) actualiza esa máquina desde aquí, igual que el botón **Actualizar ahora** de la fila de su versión en [Configuración → App → General](/settings?s=general&find=Check%20now) (consulta [Mantener la app actualizada](/guide/app#keep-the-app-up-to-date)): una copia instalada desde git, o la imagen de Docker, recibe la nueva versión, la compila y se reinicia; una app de escritorio descarga la nueva versión y se reinicia con ella. Tarda unos minutos, y los agentes que trabajan allí siguen con lo suyo. La página muestra cada paso ("Getting the new version", "Installing packages", "Building", "Restarting, this page reconnects by itself"), y, para una copia de git, cómo va: un porcentaje, una barra que se llena de agua y una línea como “Paso 2 de 3 · faltan unos 2 min” (en una app de escritorio, cuánto de la nueva versión se ha descargado, con una barra). Una máquina que aún usa un Hydor más antiguo no puede decir cómo va, así que la página lo estima a partir del paso en el que está y lo que ha tardado, y da un tiempo restante solo cuando puede; la fila de la máquina muestra el mismo “Actualizando · 45%” y abre las páginas de esa máquina por sí sola cuando vuelve a estar disponible. Una copia de git o de Docker anterior a la 0.78.0 no puede actualizarse sola más allá del historial reescrito de Hydor ("Not possible to fast-forward, aborting."): entonces la página lo indica, con el comando que hay que ejecutar una vez en esa máquina (consulta [Actualizar a mano una copia antigua](/guide/app#update-an-older-copy-by-hand)).
- **Abrir de todos modos** abre sus páginas tal como están. Esta pestaña del navegador no vuelve a preguntar por esa versión.
- **Abrir** seguido del nombre de tu propia máquina vuelve a tu propia máquina.

Cuando no se puede actualizar desde aquí, la página dice por qué: una app de escritorio que no puede reemplazarse donde está ("Move Hydor to your Applications folder to update it."), una copia sin un lugar desde el que actualizarse ("… has nowhere to update from by itself (it was not installed from git with an upstream): update Hydor there, or open it anyway."), una actualización que falló ("The update did not work: …"), una que debe reiniciarse primero ("It has the new version: restart Hydor on … to use it.") o una que ya es tan nueva como el lugar desde el que se actualiza.

Si una página de otra máquina no se dibuja, ves "This page stopped working" con lo que salió mal, **Volver a cargar** y **Abrir** tu propia máquina, en lugar de una ventana vacía. La barra lateral permanece, y pasar a otra página lo intenta de nuevo. En una máquina con un Hydor más antiguo la página ofrece **Actualizar…** como se explicó; en una máquina con un Hydor más reciente que esta app, indica que actualices esta app y luego abras de nuevo la máquina.

### Qué funciona entre máquinas

- **Todo lo que hay en las páginas de una máquina es de esa máquina**: sus sesiones, carpetas y archivos, Git, terminales, inicios de sesión de los agentes, modelos y configuración.
- **Algunas cosas vienen siempre de la máquina en la que abriste la app**: tu contraseña e inicio de sesión, la lista de máquinas, las notificaciones, los temas que creaste, y el recorrido de bienvenida y sus consejos.
- **Los avisos de todas las máquinas te llegan.** Un aviso de otra máquina la nombra, las notificaciones push llegan a través de tu propia máquina, y la [Bandeja de entrada](/guide/inbox) lista lo que te espera en todas las máquinas. El contador de la **Bandeja de entrada** de la barra de iconos las incluye. La fila de máquinas de la barra lateral también te dice cuáles de las otras máquinas tienen sesiones que terminaron desde la última vez que miraste allí (consulta [Cambiar entre máquinas](#switch-between-machines)).
- **Los proyectos pueden pasar de una máquina a otra**: copia uno a otra máquina, muévelo allí o mantenlo sincronizado con su copia, desde el menú ⋯ del proyecto → **Enviar a otra máquina…** (consulta [Enviar un proyecto a otra máquina](/guide/projects#send-a-project-to-another-machine)). Sus sesiones se quedan en la máquina en la que estaban.
- **Los enlaces de solo lectura** funcionan también para sesiones de otras máquinas (consulta [Compartir una sesión con un enlace de solo lectura](/guide/devices#share-a-session-with-a-read-only-link)).
- **No en otras máquinas**: Preview, que abre servidores de desarrollo solo de la máquina en la que abriste la app, y Conectar otros agentes, ya que el servidor de cada máquina se alcanza en su propia dirección.
- Tu navegador recuerda la carpeta de la página Archivos, los archivos abiertos y la terminal que usaste por última vez en cada máquina por separado.

### Cambiar o quitar una máquina

- **Editar** cambia el nombre, cómo se llega a ella o el token de acceso. Deja el token vacío para conservar el que tiene. Un cambio en cómo se llega a ella se comprueba de nuevo antes de guardarse.
- **Quitar** pregunta primero. Las sesiones de la máquina permanecen en esa máquina; esta app deja de mostrarlas.

### Dejar que otras máquinas usen esta

En el grupo **Acceso desde otras máquinas** (en las páginas de otra máquina: **Access to** esa máquina), creas los tokens que otras máquinas usan para llegar a esta. Otro Hydor con uno de estos tokens puede hacer todo lo que tú puedes hacer aquí, incluido ejecutar comandos, así que crea uno para cada máquina que se conecte.

1. Haz clic en **Nuevo token** junto al título del grupo.
2. Indica **¿Qué máquina lo usará?** ("My laptop") y haz clic en **Crear token**.
3. Copia el token y pégalo en Configuración → Máquinas de la otra máquina. Solo se muestra ahora.

Cada token muestra cuándo se creó y cuándo se usó por última vez. **Revocar**, en su menú **⋯** (tras una pregunta), corta el acceso de esa máquina de inmediato.

## Compartir una sesión con un enlace de solo lectura

Un enlace de solo lectura permite que alguien sin tu contraseña siga una sesión mientras ocurre. Abre el menú de la sesión (⋯) → **Compartir un enlace de solo lectura**. Para compartir en cambio un proyecto entero con alguien (sus documentos, sesiones, ejecuciones y lista de lectura, con comentarios bajo su nombre), consulta [Compartir un proyecto con otras personas](/guide/projects#share-a-project-with-people); para compartir un elemento guardado (un documento, una página, una imagen, un video…) para que lo comenten o editen, consulta [Compartir con otras personas](/guide/library#share-with-people).

1. En **Válido durante**, elige **Un día**, **Una semana**, **Un mes** o **Hasta que lo desactives**.
2. Haz clic en **Crear un enlace**.
3. Copia el enlace y envíalo. Se muestra una sola vez; puedes crear otro cuando quieras.

**Enlaces activos ahora** muestra los enlaces vigentes de la sesión, cada uno con la fecha en que se creó, cuándo termina (“sin fin” para los que duran hasta que se desactiven) y cuántas veces se abrió, y cuándo fue la última vez. **Desactivar** (la papelera) detiene un enlace al instante.

### Lo que ve la otra persona

El enlace abre solo la sesión, sin la barra lateral ni nada donde escribir. Muestra el título de la sesión, qué agente trabaja en ella, “solo lectura, compartido desde Hydor” y “trabajando ahora” mientras el agente trabaja. Debajo está la conversación: tus mensajes, las respuestas del agente, sus pasos por nombre (con las líneas que cada cambio de archivo añadió y quitó, y los cambios en sí a un clic de distancia) y las páginas que el agente mostró. Se actualiza sola, cada pocos segundos mientras el agente trabaja.

No ve la salida de los comandos, el razonamiento del agente, las imágenes que adjuntaste (solo que había algunas) ni nada más de la app, y no puede escribir ni cambiar nada. Un enlace que terminó o se desactivó dice “Este enlace ha caducado o se desactivó”.

## Conectar otros agentes a esta app

Los agentes que se ejecutan en otro lugar (Claude Code en tu portátil, Codex, Cursor o cualquier cliente que use MCP, el protocolo que los agentes usan para llamar a herramientas) pueden listar, leer, empezar y dirigir sesiones en esta máquina mediante el servidor MCP de la propia app. Cada uno necesita un token, que se crea en [Configuración → App → Conectar otros agentes](/settings?s=connect). Un agente con un token puede empezar y dirigir sesiones aquí, igual que tú.

1. Haz clic en [**Nuevo token**](/settings?s=connect&find=New%20token), junto al título del grupo **Tokens**.
2. En **Ponle el nombre del lugar al que va**, escribe algo como “Claude Code en mi portátil” y haz clic en **Crear token**.
3. Copia ahora lo que necesites (no se vuelve a mostrar):
   - **Token**, el token en sí.
   - **Claude Code**: un comando que añade el servidor, `claude mcp add --transport http hydor <address>/mcp --header "Authorization: Bearer <token>"`.
   - **Codex**: líneas para `~/.codex/config.toml`, con el token en la variable de entorno `HYDOR_TOKEN`.
   - **Otros clientes (JSON)**: la entrada habitual de un servidor MCP.

La dirección es la que tiene abierta tu navegador, así que un agente en otra máquina debe llegar a la app del mismo modo que tu navegador (consulta [Acceder a la app desde otro dispositivo](/guide/devices#reach-the-app-from-another-device)).

La lista **Tokens** muestra el nombre de cada token, cuándo se creó y cuándo se usó por última vez. Crea uno para cada agente o máquina, así podrás **Revocar** los tokens uno por uno (en el menú **⋯** de un token); al revocar uno, ese agente queda sin acceso al instante.

### Qué pueden hacer

La fila [**Qué pueden hacer**](/settings?s=connect&find=What%20they%20can%20do), debajo de los tokens, tiene una (i) que lista las herramientas que obtiene un agente con un token:

- **list_sessions** y **read_session**: encontrar una sesión y ponerse al día con ella (sus mensajes y sus pasos por nombre).
- **start_session**: una nueva sesión de Claude Code o Codex con un primer mensaje, en cualquier carpeta, opcionalmente en un worktree propio. Responde con un enlace que puedes abrir.
- **send_message**: dirigir una sesión. Si su agente está ocupado, el mensaje espera en la cola de la sesión hasta que termine el turno.
- **list_models**: los modelos que puede usar una nueva sesión.

Las apps que ofreces a otros agentes (el interruptor **Ofrecer a otros agentes** de la app, consulta [Apps](/guide/apps)) también aparecen como herramientas y ejecutan la app con los campos de su formulario.

Las sesiones empezadas en esta app no necesitan nada de esto. La sección solo aparece en la máquina donde abriste la app, no en las páginas de otras máquinas.

## Añadir una cuenta de GitHub o Gitea

Los pull requests se abren con una cuenta en [Configuración → App → Control de código fuente](/settings?s=scm). Cada cuenta cubre los repositorios de su servidor: GitHub, un servidor de GitHub Enterprise o un servidor de **Gitea**. El envío de cambios (push) usa la configuración de git de esta computadora (sus claves SSH o credenciales guardadas); la cuenta sirve para abrir el pull request y seguir sus comprobaciones.

1. Haz clic en [**Añadir una cuenta**](/settings?s=scm&find=Add%20an%20account), junto al título del grupo **Cuentas**. Se abre un cuadro de diálogo.
2. Elige **GitHub** o **Gitea**.
3. Para GitHub: si la CLI de GitHub de esta computadora tiene la sesión iniciada, **Usar su inicio de sesión** añade la cuenta con un clic y ya está. Si no, pega un **Token de acceso**: un token de granularidad fina con Pull requests (lectura y escritura), Contents (lectura) y Commit statuses (lectura) en tus repositorios (**Crear uno** abre la página en GitHub). Rellena **Dirección del servidor** solo para GitHub Enterprise.
4. Para Gitea: la **Dirección del servidor** (`https://gitea.example.com`) y un **Token de acceso** creado en Gitea en Settings → Applications → Generate token, con lectura y escritura de repositorios.
5. Haz clic en **Añadir**. La app comprueba el token preguntando al servidor a quién pertenece y luego lista la cuenta con ese nombre de usuario.

Una segunda cuenta del mismo servidor reemplaza a la primera. Cada cuenta es una fila con su nombre de usuario, el servidor y “mediante la CLI de GitHub” cuando corresponde. Su menú **⋯** tiene **Abrir el servidor** y **Quitar**, que pregunta antes: los pull requests ya vinculados a sesiones siguen vinculados, pero su estado deja de actualizarse.

Cómo se abren y se siguen los pull requests: [Abrir un pull request desde una sesión](/guide/files-git#open-a-pull-request-from-a-session).

## Pídeselo a un agente

- “Haz que esta app sea accesible desde mi teléfono con Tailscale.”
- “¿Cuál es la dirección de esta app en mi tailnet? ¿Hay algo que impida que mi teléfono la abra?”
- “Deja de servir la app en mi tailnet.”
- “Crea un enlace de solo lectura a esta sesión que sea válido durante una semana.”
- “Desactiva todos los enlaces para compartir de esta sesión.”
- “¿Cuáles de mis máquinas están sin conexión? Intenta reconectarlas.”
- “Cambia el nombre de la máquina llamada gpu-box a Studio GPU.”
- “¿Qué sesiones terminaron en mis otras máquinas mientras estaba fuera?”
- “Lista los tokens que otros agentes usan para acceder a esta app y revoca el llamado old laptop.”
- “Añade mi cuenta de GitHub usando el inicio de sesión de la CLI de GitHub.”
- “Envía a mis chats de Telegram, Discord y Slack los avisos de todas las sesiones, no solo de las que ellos empezaron.”
- “¿Qué chats están vinculados a esta app, en cada app de chat?”
- “Haz que las nuevas sesiones de mi chat de Discord usen Codex.”
- “Haz que las nuevas sesiones de mi chat de Telegram empiecen como mi agente Contador.”
- “Desconecta la app de Slack.”
