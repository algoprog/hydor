# Apps conectadas, claves y herramientas

Conecta los servicios que usas (tu correo, Notion, GitHub, Stripe, una carpeta de esta computadora…) una sola vez, en **Apps conectadas** de la página Apps, y todos los agentes y apps podrán trabajar con ellos. Guarda las claves de API y los inicios de sesión en una bóveda cifrada que los agentes usan sin llegar a verlos, añade servidores de herramientas a Claude Code y Codex, y plugins a Claude Code. Úsalo cuando quieras que los agentes actúen en tus propias cuentas, llamen a un servicio con tu clave o tengan herramientas que no traen de serie.

![Apps → Apps conectadas: los servicios que conectaste, el mercado y tus claves](images/connections.webp)

## Qué son las conexiones, las claves y las herramientas

Los agentes pueden hacer más cuando les das herramientas. Hay tres lugares para hacerlo:

- **Apps conectadas** ([Apps → Apps conectadas](/apps/connected)): servicios de un mercado, conectados una sola vez para todos los agentes: Claude Code, Codex, Custom y los agentes que hablan ACP, y las apps que ejecutan. Cada cuenta conectada da sus herramientas a los agentes.
- **La bóveda** (la pestaña **Claves** de la misma página): claves de API, tokens y las contraseñas de los inicios de sesión. Una clave de API es una contraseña que te da un servicio para que los programas puedan usar tu cuenta. Los agentes las usan para llamar a un servicio, iniciar sesión en un sitio o ejecutar un programa, pero nunca las ven.
- **Servidores MCP y plugins** ([Configuración → Servidores MCP](/settings?s=mcp) y [Configuración → Plugins](/settings?s=plugins)): servidores de herramientas que configuras tú mismo, para Claude Code, Codex o Custom, y plugins que aportan habilidades y herramientas a todos los agentes (consulta [Plugins](/guide/plugins)).

MCP (el Model Context Protocol) es la forma común en que un servicio ofrece herramientas a los agentes. Una cuenta conectada es un servidor MCP que Hydor configura y en el que inicia sesión para todos los agentes. Los servidores MCP de Configuración → Agentes son los que configuras a mano, con un comando o una dirección.

## Abrir Apps conectadas

Abre **Apps** desde la barra de iconos y elige **Apps conectadas** en su columna (en un teléfono, su pestaña **Apps conectadas**), o ve a [Apps → Apps conectadas](/apps/connected). (Antes estaban en Configuración, como Conexiones: un enlace antiguo a ellas te trae aquí.) Bajo una línea que explica para qué sirven, con **Conectar un servicio**, hay tres pestañas:

- **Conectada**: las cuentas que conectaste y cómo está cada una. El número de la pestaña las cuenta; **Apps conectadas** en la columna (o su pestaña en un teléfono) también las cuenta.
- **Mercado**: todos los servicios que puedes conectar.
- **Claves**: la bóveda. El número de la pestaña cuenta tus claves.

La página se abre en **Conectada** cuando ya conectaste algo, y en **Mercado** cuando no; cada pestaña tiene su propia dirección (`/apps/connected?tab=market`, `?tab=keys`). En un teléfono las pestañas se desplazan hacia los lados, y los cuadros de diálogo suben desde la parte inferior de la pantalla.

## Buscar un servicio en el mercado

Abre [la pestaña Mercado](/apps/connected?tab=market).

- El cuadro de búsqueda ("Search … services: mail, Notion, invoices…") busca en nombres, descripciones, palabras clave y categorías. Cada palabra que escribas debe coincidir.
- Las categorías, cada una con el número de servicios que tiene, se muestran de una en una: **Todos los servicios** (**Todos** como chip), **Notas y documentos**, **Tareas y proyectos**, **Correo, chat y reuniones**, **Calendario y agenda**, **Archivos y almacenamiento**, **Diseño y multimedia**, **Herramientas para desarrolladores**, **Nube y alojamiento**, **Bases de datos y datos**, **Analítica y monitoreo**, **Ventas, marketing y soporte**, **Pagos y finanzas**, **Sitios web y tiendas**, **Búsqueda y la web**, **IA y automatización**, **Viajes y vida diaria** y **En esta computadora**. En una computadora son una lista junto a los servicios; en una pantalla más estrecha, chips bajo el cuadro de búsqueda que se desplazan hacia los lados.
- **Destacados**: una fila de tarjetas más grandes para servicios conocidos (Notion, Linear, GitHub, Figma, Stripe, Zapier…). Se muestra mientras no hayas buscado ni elegido una categoría; en una computadora, sus flechas la desplazan. Los servicios siguen bajo **Todos los servicios** (o la categoría elegida, o **Encontrados** cuando buscas), con cuántos hay. En un teléfono son las filas de una sola lista.

Cada tarjeta muestra el nombre del servicio, lo que un agente puede hacer con él y cómo se conecta:

- **Inicio de sesión en el navegador**: inicias sesión en tu cuenta en el navegador.
- **Clave de API**: pegas una clave que te da el servicio.
- **Sin inicio de sesión**: no hay nada que introducir.
- **Se ejecuta en esta computadora**: un programa que Hydor inicia aquí cuando un agente lo necesita.
- **Se ejecuta aquí, con una clave**: lo mismo, con una clave que tú le das.
- **Dirección y contraseña de app**: tu dirección de correo y una contraseña creada para programas de correo (Correo electrónico).

Una marca de verificación junto al nombre significa que alguien comprobó que el servidor del servicio responde como indica su ficha. **sin comprobar** significa que todavía nadie lo ha hecho. Los servicios que conectaste muestran **Conectada** (o **Iniciar sesión de nuevo**) donde los demás muestran **Conectar**.

Algunos de los que hay:

- **Notas, tareas y proyectos**: Notion, Craft, Linear, Asana, Atlassian (Jira y Confluence), ClickUp, monday.com, Todoist.
- **Correo, chat y calendarios**: Correo electrónico (cualquier cuenta de correo, con una contraseña de app), Gmail, Slack, Fireflies, Granola, Google Calendar, Calendly.
- **Archivos y diseño**: Google Drive, Dropbox, Box, Figma, Canva, Miro, Gamma, Cloudinary.
- **Herramientas para desarrolladores y alojamiento**: GitHub, GitLab, Sentry, CircleCI, Postman, Cloudflare, Vercel, Netlify, Railway, Context7, DeepWiki.
- **Datos y analítica**: Airtable, Supabase, Neon, PostgreSQL, MongoDB, SQLite, PostHog, Mixpanel, Amplitude, Datadog.
- **Negocios**: Stripe, PayPal, Plaid, Square, HubSpot, Intercom, Attio, Klaviyo, Webflow, Wix, WordPress.com.
- **Búsqueda y la web**: Exa, Perplexity, Tavily, Brave Search, Firecrawl, Wolfram, un navegador Playwright.
- **IA y vida diaria**: Hugging Face, Zapier, AllTrails, Kiwi.com, trivago, Strava.
- **En esta computadora**: Archivos de esta computadora (las carpetas que elijas), Git, Hora y un grafo de memoria.

Cuando ningún servicio coincide, la página dice **Ningún servicio coincide**. Puedes añadir el servicio tú mismo: consulta [Añadir un servicio al mercado](/guide/connections#add-a-service-to-the-marketplace). Los servicios nuevos llegan con las actualizaciones de la app.

## Conectar un servicio

1. Haz clic en la tarjeta del servicio. Un cuadro de diálogo muestra lo que hace, su categoría, cómo se conecta y **Comprobada** con una fecha (o **Dirección sin comprobar todavía**). **Sitio web** y **Documentación** enlazan al servicio. Un recuadro muestra dónde se ejecuta: la dirección del servidor o el comando que ejecuta aquí. También indica que todos los agentes reciben las herramientas del servicio con su nombre corto (las de Notion, bajo "notion"), y que puedes desactivarlo por sesión.
2. Lee la nota del recuadro amarillo, si hay una. Indica lo que debes saber antes, como "Needs uv (uvx) on this computer." o que un servicio necesita tu propio cliente de inicio de sesión.
3. Rellena lo que pide el cuadro de diálogo y haz clic en **Conectar**, o en **Sign in to** y el nombre del servicio.

Cuando se conecta, el servicio pasa a la pestaña **Conectada** y se prueba en segundo plano. Lo que pide el cuadro de diálogo depende del servicio.

### Servicios sin nada que introducir

Haz clic en **Conectar**. Algunos piden antes un ajuste. GitLab pide su dirección (gitlab.com, a menos que uses la tuya). Archivos de esta computadora pide las carpetas que puede usar, como rutas completas, una por línea; solo puede leer y modificar archivos dentro de ellas. SQLite pide el archivo de la base de datos. Los campos marcados como **opcional** pueden quedar vacíos. **Obtener una** junto a un campo enlaza a donde consigues ese valor.

### Servicios que usan una clave

Un servicio en internet tiene un campo **Clave**, con **Obtener una clave** que enlaza a la página donde se crea. Uno que se ejecuta aquí pide su clave en uno o más campos propios (un token, una cadena de conexión). Pega la clave y haz clic en **Conectar**.

La clave va a la bóveda, cifrada. Desde entonces solo ves sus últimos caracteres. GitHub, por ejemplo, usa un token de acceso personal de permisos granulares: una clave que puedes limitar a los repositorios y permisos que quieras que tengan los agentes.

### Servicios en los que inicias sesión en el navegador

1. Haz clic en **Sign in to** y el nombre del servicio.
2. En una computadora se abre una ventana pequeña. En un teléfono, la página de inicio de sesión del servicio se abre en la misma pestaña.
3. Inicia sesión y permite el acceso. Mientras lo haces, el cuadro de diálogo dice "Waiting for you to finish signing in…".
4. Cuando terminas, un aviso indica que la cuenta está conectada. En un teléfono vuelves a Apps → Apps conectadas.

Los tokens permanecen cifrados en esta computadora y se renuevan solos; los agentes nunca los ven. Un inicio de sesión debe completarse en 15 minutos; pasado ese tiempo, empieza de nuevo. Si rechazas el acceso, aparece "You did not allow access".

Algunos servicios solo permiten iniciar sesión mediante un cliente de inicio de sesión (una app OAuth) propio: Asana, Box, HubSpot, Slack y las apps de Google, por ejemplo. Su cuadro de diálogo abre **Tu propio ID de cliente (este servicio necesita uno)**, con lo que debes hacer. Otros inicios de sesión en el navegador ofrecen lo mismo como **Usa tu propio ID de cliente (opcional)**, que también se abre solo cuando resulta que un servicio no deja que las apps se registren por su cuenta.

1. Crea el cliente en los ajustes para desarrolladores del servicio.
2. Dale la dirección que aparece en **Dirección de retorno que debes darle** (tiene un botón para copiarla).
3. Pega su **ID de cliente** y su **Secreto de cliente** si lo tiene.
4. Haz clic en **Sign in to** y el nombre del servicio.

### Servicios que se ejecutan en esta computadora

Estos inician un programa aquí (con npx o uvx) para el agente de cada sesión. La primera prueba puede tardar si el programa tiene que descargarse antes. Una clave que necesite uno de estos servicios pasa de la bóveda a su entorno cuando se inicia. Nunca aparece en una línea de comandos, donde otros programas podrían leerla.

## Conectar tu correo

Los agentes pueden leer, buscar, ordenar, redactar borradores y enviar tu correo una vez que conectas tu cuenta de correo con su dirección y una contraseña de app. Funciona con Gmail, iCloud Mail, Fastmail, Yahoo, AOL, GMX, WEB.DE, Zoho, Posteo, mailbox.org, Proton Mail (mediante Proton Mail Bridge) y la mayoría de los correos de trabajo y de estudios.

1. Abre [la pestaña Mercado](/apps/connected?tab=market) y haz clic en **Correo electrónico** (en **Correo, chat y reuniones**, o busca "email").
2. Escribe tu **Dirección de correo**. Hydor encuentra tus servidores de correo por sí mismo. Para un proveedor que conoce, muestra cómo crear allí una contraseña de app, y **Cómo crear una** abre la página de ayuda del propio proveedor.
3. Crea una contraseña de app (ver más abajo) y pégala en **Contraseña de app**.
4. Si quieres, escribe **Tu nombre**, tal como lo verán las personas en los correos que envíes.
5. Haz clic en **Conectar**. Hydor inicia sesión para leer y enviar antes de guardar nada. Si falla, dice por qué: una contraseña o un nombre de usuario incorrectos, que tu proveedor quiere una contraseña de app y no la habitual, o que un servidor no respondió.

La contraseña de app se guarda cifrada en la bóveda de esta computadora; los agentes nunca la ven. Para conectar otra cuenta, abre **Correo electrónico** de nuevo y haz clic en **Añadir otra cuenta**.

### Crear una contraseña de app

Una contraseña de app es una contraseña aparte para programas de correo, creada en los ajustes de seguridad de tu cuenta, que se usa en lugar de la contraseña con la que inicias sesión en la web. La mayoría de los proveedores te piden activar antes la verificación en dos pasos.

- **Gmail**: activa la verificación en dos pasos en tu cuenta de Google y luego abre **Seguridad → Contraseñas de aplicaciones**. Las cuentas de trabajo y de estudios necesitan que su administrador lo permita.
- **iCloud Mail**: en account.apple.com, abre **Inicio de sesión y seguridad → Contraseñas específicas de apps**.
- **Fastmail**: **Configuración → Privacidad y seguridad → Administrar contraseñas de app**.
- **Yahoo** y **AOL**: **Seguridad de la cuenta → Generar contraseña de app**.
- **GMX**, **WEB.DE** y **Zoho**: activa antes IMAP en los ajustes del buzón.
- **Proton Mail**: instala Proton Mail Bridge e inicia sesión en él en esta computadora, y luego usa la contraseña que Bridge muestra para tu dirección.

### Cuando no se encuentran tus servidores

Para un proveedor que Hydor no conoce, lee los ajustes que tu proveedor publica para los programas de correo. Para encontrarlos, consulta el directorio público de proveedores de correo de Mozilla sobre tu dominio (nunca tu dirección completa). Cuando no hay ninguno, prueba imap. y smtp. delante de tu dominio y deja que el inicio de sesión los compruebe.

Si eso falla, abre **Servidores y nombre de usuario** y escribe los servidores de entrada (IMAP) y de salida (SMTP), sus puertos y su seguridad (**SSL/TLS** o **STARTTLS**), tal como los indican las páginas de ayuda de tu proveedor, y el nombre de usuario si no es tu dirección completa. Una conexión sin cifrado solo se permite hacia esta computadora (un puente como Proton Mail Bridge).

### Outlook.com y Microsoft 365

Las cuentas de Outlook.com, Hotmail y Live, y las cuentas de trabajo o de estudios en Microsoft 365, todavía no se pueden conectar de esta forma. Microsoft desactivó las contraseñas de app para ellas, así que necesitan un inicio de sesión de Microsoft, que Hydor aún no tiene. El cuadro de diálogo de Correo electrónico lo dice cuando escribes una dirección así.

### Tus cuentas de correo

En la pestaña **Conectada**, la fila de Correo electrónico enumera tus cuentas por dirección. **Probar** inicia sesión en cada una. **Cuentas** abre el cuadro de diálogo, donde cada cuenta tiene **Probar**, **Cambio** (una nueva contraseña de app, nombre o servidores) y **Quitar**: su contraseña de app se elimina aquí, y nada cambia en el buzón. Quitar la última cuenta desconecta Correo electrónico; **Desconectar** las quita todas.

### Qué pueden hacer los agentes con tu correo

Los agentes reciben estas herramientas bajo "email". Cada una usa la dirección de la cuenta cuando tienes más de una; sin ella, usan la primera.

- **list_folders**, **search_email** (por remitente, destinatario, asunto, palabras, fechas, no leídos, marcados o con adjuntos, de más reciente a más antiguo) y **read_email** (quién lo envió y a quién, su texto, y los nombres y tamaños de sus adjuntos). Leer no marca un correo como leído.
- **save_attachments** guarda los adjuntos de un correo en la carpeta de la sesión.
- **mark_email** marca correos como leídos o no leídos, marcados o no. **move_email** los mueve a otra carpeta, nunca a la papelera.
- **save_draft** pone un correo en tu carpeta de Borradores para que lo envíes tú. No se envía nada.
- **send_email** envía un correo de inmediato, como correo nuevo o como respuesta en su hilo, con archivos de la carpeta de la sesión adjuntos, y guarda una copia en Enviados.
- **delete_email** mueve correos a la papelera, o los elimina para siempre.

Para evitar que los agentes envíen o eliminen, desactiva **send_email** y **delete_email** en **Herramientas** (consulta [Desactivar una cuenta o algunas de sus herramientas](/guide/connections#turn-an-account-or-some-of-its-tools-off)). Lo que dice un correo llega a los agentes como datos externos, que se les indica que nunca sigan como instrucciones. Una tarea programada puede empezar con cada correo nuevo: consulta [Vigilar un cambio](/guide/tasks#watch-for-a-change).

## Comprobar que una cuenta conectada funciona

En la pestaña **Conectada**, cada cuenta indica cómo está:

- **Funcionando**, cuándo se comprobó por última vez, cuántas de sus herramientas están activadas ("12 de 14 herramientas activadas") y cuántas de ellas preguntan primero ("3 preguntan primero").
- **Sin probar todavía**.
- **Necesita iniciar sesión de nuevo**: su inicio de sesión terminó y no pudo renovarse.
- **No funciona**, con el motivo.

**Probar** se conecta al servicio como lo harán los agentes y enumera sus herramientas. Un aviso indica que la cuenta funciona y cuántas herramientas tiene, o qué salió mal: "Se rechazó la clave" o "Se rechazó el inicio de sesión: conéctala de nuevo" (la cuenta pasa entonces a **Necesita iniciar sesión de nuevo**). Las cuentas se prueban solas justo después de conectarlas.

## Desactivar una cuenta o algunas de sus herramientas

- **Todas las sesiones** (en un teléfono, solo el interruptor): cuando está activado, el agente de cada sesión recibe la cuenta, a menos que una sesión la desactive. Cuando está desactivado, ninguna sesión la recibe, a menos que esa sesión la active. Una cuenta recién conectada empieza activada.
- **Herramientas**: una vez que una prueba ha enumerado las herramientas de una cuenta, este botón las abre, cada una con lo que hace y tres opciones: **Activado** (los agentes la usan libremente), **Preguntar primero** (cada llamada espera en tu **Bandeja de salida** hasta que la envíes: consulta más abajo) y **Desactivado** (los agentes no la reciben). Las herramientas que envían, publican, responden, invitan, comparten, eliminan, quitan, pagan, transfieren o reembolsan están marcadas como **actúa fuera**. A un agente que intente usar una herramienta que desactivaste se le dice que está desactivada.

## Preguntar primero: llamadas que esperan tu aprobación

Una herramienta en **Preguntar primero** nunca se llama de inmediato. Cuando un agente la llama (Claude Code, Codex, Custom, otro agente, la ejecución de una tarea programada o una de tus apps), Hydor retiene la llamada. Al agente se le avisa enseguida de que la llamada espera tu aprobación, y sigue con el resto de su trabajo o termina su turno diciéndolo: no espera, y se le indica que no lo intente de otra manera. La llamada espera en la **Bandeja de salida**, en la parte superior de la [Bandeja de entrada](/inbox), como un borrador que puedes modificar antes de **Enviar** o **Eliminar** ([La Bandeja de salida](/guide/inbox#the-outbox-calls-held-for-your-ok)).

- Las cuentas que conectes a partir de ahora empiezan con todas las herramientas que **actúan fuera** en **Preguntar primero**, y las demás en **Activado**. Cambia cualquiera de ellas en **Herramientas**.
- Las cuentas que conectaste antes conservan sus herramientas como estaban, para que lo que ya las usa siga funcionando. Su tarjeta ofrece una línea, como **Preguntar primero en las 3 herramientas que envían, publican, eliminan o pagan**: haz clic en ella para poner todas en Preguntar primero de una vez. Aparece mientras haya herramientas así en Activado sin que lo hayas elegido.
- Preguntar primero es un ajuste tuyo para la cuenta, así que se mantiene en todas las sesiones y en todos los modos de permisos, incluido **Acceso total**. Los agentes no pueden cambiarlo sin preguntarte en una tarjeta, y no pueden enviar por sí mismos una llamada retenida. Cuando un agente también preguntaría antes de usar la herramienta (la tarjeta propia de Claude Code o de Custom), no lo hace: dices que sí una sola vez, en la Bandeja de salida.
- Que una herramienta actúe fuera se decide a partir de su nombre, su descripción y las pistas que da su servicio (como "solo lee" o "elimina"). Fíjate en las marcas y pon tú mismo en Preguntar primero cualquier otra herramienta.

Para probar una tarea programada sin que salga nada, usa **Probar sin enviar** ([Tareas programadas](/guide/tasks#try-a-task-with-a-test-run)).

## Cambiar una conexión o iniciar sesión de nuevo

- **Cambio** (para cuentas con una clave o ajustes) abre de nuevo el cuadro de diálogo con lo que introdujiste. Los ajustes conservan sus valores. Los campos de clave y secreto dicen "Guardada: déjalo vacío para conservarla": escribe una nueva para reemplazarla y luego haz clic en **Guardar**.
- **Iniciar sesión de nuevo** (para inicios de sesión en el navegador) inicia sesión desde cero. Cuando una cuenta muestra **Necesita iniciar sesión de nuevo**, los agentes dejan de recibirla hasta que lo hagas.

Si el marketplace cambia la dirección de un servicio o su forma de iniciar sesión después de que lo conectaste, la cuenta dice "El catálogo tiene una dirección o un inicio de sesión nuevos para este servicio. Sigue usando el anterior hasta que vuelvas a conectarlo." Tu clave o tu inicio de sesión nunca van a una dirección nueva hasta que vuelvas a conectar tú mismo.

## Desconectar una cuenta

Haz clic en **Desconectar** (un icono de enchufe desenchufado en un teléfono) y confirma. El inicio de sesión o la clave de la cuenta se eliminan aquí y los agentes dejan de recibir sus herramientas. En el caso de un inicio de sesión en el navegador, Hydor también avisa al servicio de que ya no se quieren los tokens, cuando el servicio ofrece una forma de hacerlo.

## Elegir las cuentas que usa una sesión

Cada sesión recibe las cuentas conectadas cuyo interruptor **Todas las sesiones** está activado. Para cambiarlo en una sola sesión:

1. Abre el menú de la sesión (⋯) → **Configuración de la sesión** → **Cuentas conectadas**.
2. Activa o desactiva cuentas para esta sesión. Cada una indica cómo está: "Activada, como en todas las sesiones", "Desactivada, como en todas las sesiones", "Activada solo aquí" o "Desactivada solo aquí".
3. Haz clic en **Hecho**.

Los servicios en internet siguen el cambio de inmediato. Los que se ejecutan en esta computadora lo siguen la próxima vez que se inicie el agente. Si todavía no hay nada conectado, el cuadro de diálogo ofrece **Abrir Apps conectadas**.

Un agente también puede activar cuentas para las sesiones que empiezan como él: consulta [Agentes](/guide/agents).

## Cómo usan los agentes las cuentas conectadas

- Todos los tipos de agente reciben una cuenta conectada de la misma manera: Claude Code, Codex, Custom y los agentes ACP reciben sus herramientas con el nombre corto del servicio.
- Al comenzar una sesión, se le dice al agente cuáles de tus cuentas están conectadas y que las use cuando una tarea las involucre. También puede enumerar lo que está conectado y qué claves están guardadas, solo por su nombre.
- Un agente solo recibe las cuentas que están activadas para su sesión y con la sesión iniciada. Los inicios de sesión se renuevan en segundo plano, incluso para cuentas que ninguna sesión está usando, de modo que las sesiones largas siguen funcionando.
- Las claves y los tokens nunca van a la configuración de un agente ni a su línea de comandos. Los valores de claves conocidos se enmascaran en todo lo que devuelven las herramientas del servicio.
- Una herramienta en Preguntar primero lo indica en su descripción, y se le dice al agente que una llamada a ella espera tu aprobación. Cuando envías o eliminas la llamada, la sesión muestra lo que pasó, y su agente lo sabe con tu siguiente mensaje.
- Una tarea programada puede empezar cuando aparece algo nuevo en una cuenta (un trato, un archivo, un ticket o un pago nuevos), o un tiempo fijado antes de cada evento de un calendario conectado. En cada comprobación, Hydor llama por sí mismo y sin un modelo a una de las herramientas de la cuenta que solo consulta, y nunca a una que envíe, cambie, elimine o pague (consulta [Vigilar un cambio](/guide/tasks#watch-for-a-change)).
- El cuadro de búsqueda (Ctrl+K, ⌘K en una Mac) también encuentra tus cuentas conectadas.

## Añadir un servicio al marketplace

Cualquiera puede añadir un servicio al marketplace, o corregir uno, con un pull request al repositorio de Hydor en GitHub. **Cómo añadir uno**, al final de la pestaña Marketplace, abre la guía correspondiente.

1. Escribe un pequeño archivo JSON para el servicio en la carpeta `catalog/` del repositorio, como lo describe la guía de allí. Contiene el nombre del servicio, una frase sencilla sobre lo que un agente puede hacer con él, su categoría, icono y color, página de inicio y documentación, su servidor (una dirección, o un comando que se ejecuta aquí) y cómo inicia sesión (nada, un inicio de sesión en el navegador o una clave), además de los campos que la gente rellena.
2. Usa el servidor MCP propio del servicio en su dirección documentada cuando exista. Se agradece un programa que se ejecute aquí cuando no haya tal servidor, o para cosas que solo uno local puede hacer, como los archivos de esta computadora.
3. No pongas claves ni tokens en el archivo. Cada persona introduce las suyas, en la bóveda.
4. Ejecuta la comprobación que describe la guía. Prueba el archivo contra las reglas y puede preguntar al servidor cómo responde.
5. Envía el pull request. Una vez que se fusione, el servicio llega al marketplace de todos con la siguiente actualización.

## Guardar claves en la bóveda

Abre [la pestaña Claves](/apps/connected?tab=keys). La bóveda guarda claves de API, tokens y las contraseñas de los inicios de sesión, que los agentes usan sin verlas. Se cifran en esta computadora y nunca se vuelven a mostrar, ni aquí ni a un agente: solo sus últimos caracteres.

Los agentes las usan mediante las herramientas propias de Hydor: su herramienta de solicitudes web, su navegador y los comandos de esta computadora donde lo permitas. La app pone la clave por sí misma, y solo donde tú lo permitas.

Cada clave de la lista muestra:

- su nombre y una pista enmascarada del valor (como "…f3a9");
- su nota;
- los hosts a los que se puede enviar, y **en comandos** cuando los comandos de esta computadora pueden usarla (**Aún no se permite ningún host** cuando no hay ninguna de las dos cosas);
- cuándo se usó por última vez ("sin usar todavía" hasta entonces), y cuándo se añadió o cambió su valor por última vez.

Si aún no hay claves, la pestaña dice que puedes añadir una aquí o dejar que un agente pida una.

Las apps también pueden necesitar claves (la de un servicio meteorológico, la de un proveedor de mapas): una app nombra las claves que necesita, y tú das cada una en su página, en la tarjeta que la instala o en su tarjeta dentro de una sesión ([Dale las claves que necesita](/guide/apps#give-it-the-keys-it-needs)). Se guardan aquí, con los nombres que da la app, con los hosts que indica, y la nota nombra la app.

### Añadir una clave

1. Haz clic en **Añadir una clave**.
2. **Nombre**: cómo la llaman los agentes, como WEATHER_API_KEY: mayúsculas, dígitos y guiones bajos, de 2 a 64 caracteres, empezando por una letra. Lo que escribes se convierte en un nombre así ("github token" pasa a ser GITHUB_TOKEN), y el campo lo indica.
3. **Valor**: pega la clave. Tiene que ser una sola línea, salvo que sea un bloque que empiece con -----BEGIN (un certificado o una clave privada).
4. **Hosts a los que se puede enviar**: las direcciones del servicio, separadas por comas, como api.example.com (hasta 20). La clave va solo a esos hosts y a sus subdominios, por https. Hasta que añadas uno, los agentes no pueden usar la clave.
5. **Los comandos de esta computadora pueden usarla** (desactivado al principio): actívalo para una clave que necesite un programa de aquí, como la contraseña de una base de datos o un token para git. Consulta [Comandos que usan una clave](/guide/connections#commands-that-use-a-key).
6. **Nota**: para qué sirve la clave. Los agentes ven esta nota.
7. **Cómo se envía** (opcional): por defecto la clave va en el header Authorization, después de "Bearer ". Puedes cambiar el **Header** (como X-Api-Key) y lo que va **Antes de la clave** (nada, para otros headers), o enviarla **O como parámetro de consulta** (como api_key).
8. Haz clic en **Guardar**.

Se rechaza un nombre que ya está en la bóveda: dale a esa clave un valor nuevo.

### Dar un valor nuevo a una clave

Haz clic en la flecha circular (**Valor nuevo**) junto a la clave, pega el valor nuevo en **Valor nuevo** y haz clic en **Reemplazarla**. Los hosts, la nota y cómo se envía se quedan como estaban.

### Cambiar adónde puede ir una clave

Haz clic en el lápiz (**Hosts, nota y cómo se envía**), cambia los hosts, si los comandos pueden usarla, la nota o cómo se envía, y haz clic en **Guardar**. El valor se mantiene.

### Eliminar una clave

Haz clic en la papelera (**Eliminar**) y confirma. Los agentes ya no pueden usar la clave, y su valor desaparece para siempre. La pregunta nombra antes las apps que la usan y las apps web que tienen un valor propio con ese nombre (el suyo se queda).

### Qué pueden y qué no pueden hacer los agentes con una clave

- Llamar a un servicio con ella por su nombre. La app pone la clave en la solicitud: donde está configurado que vaya, o donde el agente escribe su nombre entre dobles llaves (como {{GITHUB_TOKEN}}) en la dirección, en un header o en el cuerpo, o como nombre de usuario y contraseña de un inicio de sesión básico.
- Escribirla en la página de inicio de sesión de un sitio en su navegador, por su nombre: solo en un campo de una línea, en una página de uno de los hosts de la clave, por https (o en esta computadora). El campo muestra entonces puntos, y el agente solo ve que se rellenó desde la bóveda.
- Dársela a un comando de esta computadora, cuando activaste **Los comandos de esta computadora pueden usarla**, y solo una vez que permitas el comando (consulta [Comandos que usan una clave](/guide/connections#commands-that-use-a-key)).
- En la web, solo a los hosts que permitiste y sus subdominios, solo por https, y nunca a esta computadora ni a su red local. No se sigue una redirección a un host al que la clave no puede ir.
- Cambiar, para una llamada, en qué header o parámetro de consulta va la clave.
- Ver los nombres, hosts y notas de las claves. Nunca sus valores: las respuestas, las páginas y lo que imprimen los comandos vuelven con la clave enmascarada.

## Cuando un agente pide una clave

A los agentes se les indica que nunca te pidan escribir una contraseña, un token o una clave en el chat. Cuando una tarea necesita una clave que no está guardada, el agente muestra en cambio una tarjeta en la conversación: **El agente pide una clave**, con el nombre de la clave y por qué la necesita (a menudo, dónde conseguirla).

1. Pega la clave en el campo.
2. Revisa **Solo se envía a**: los hosts que sugirió el agente. Cámbialos si lo necesitas. Sin un host, los agentes no pueden usar la clave.
3. Haz clic en **Guardar en la bóveda**.

La clave va directamente a la bóveda cifrada, nunca a la conversación. La tarjeta se convierte en una nota que indica que la clave está guardada, y el agente recibe un mensaje de que está ahí (nunca cuál es), para que pueda continuar.

- **Ahora no** la rechaza. Se le dice al agente que prefieres no dársela por ahora, y que continúe sin ella o diga qué otra cosa serviría. Entonces la tarjeta indica que no la diste, con **Introducirla de todos modos** por si cambias de opinión.
- Mientras una tarjeta espera, también aparece en la [Bandeja de entrada](/guide/inbox) como “Pide una clave” con el nombre de la clave. **Abrir** te lleva a la sesión.
- Si ya existe en la bóveda una clave con ese nombre, se le dice al agente que la use, y la tarjeta solo indica que está en la bóveda. Cuando una clave guardada dejó de funcionar, el agente puede pedirla de nuevo: el campo indica entonces que reemplaza a la guardada.
- Cuando el agente necesita la clave en comandos de esta computadora, la tarjeta incluye también **Los comandos de esta computadora pueden usarla**, activado de entrada. Desactívalo si prefieres no hacerlo; el agente aún puede usar la clave en sus hosts. Para una clave que ya está guardada, la tarjeta dice **El agente pide usar una clave en comandos**: deja el campo vacío para conservar el valor y haz clic en **Guardar en la bóveda**.

### Un inicio de sesión en varios campos

Para iniciar sesión en un sitio o un servicio, un agente pide todo de una vez: **El agente pide iniciar sesión**, con un campo para cada parte, como un correo y una contraseña, o la dirección, el usuario y la contraseña de una base de datos. Las contraseñas y otros secretos se ocultan al escribir; el ojo los muestra.

1. Rellena los campos. Uno marcado como **opcional** puede quedar vacío.
2. Revisa **Solo se envía a**: los hosts para los que es el inicio de sesión.
3. Haz clic en **Guardar en la bóveda**.

Cada secreto va a la bóveda como una clave propia, con el nombre del inicio de sesión (una contraseña de Voltaro pasa a ser VOLTARO_PASSWORD). Un campo marcado con **El agente ve este** es un dato que no es secreto, como la dirección de un servidor: el agente recibe lo que escribas ahí, y no se guarda en la bóveda. Un campo que la bóveda ya tiene lo indica: déjalo vacío para conservar lo guardado. Una vez guardado, la tarjeta enumera las claves, y el agente puede iniciar sesión con ellas en su navegador, solo en esos hosts, sin verlas.

### Varias claves en una sola tarjeta, con cómo conseguirlas

Cuando una tarea necesita más de una clave, o el agente puede explicarte cómo conseguir una, las pone en una sola tarjeta: una pestaña para cada una (en el teléfono, una fila que se abre). Cada una dice quién da la clave y para qué hace falta, enumera en **How to get it** unos pasos cortos, enlaza la página del proveedor (se abre en una pestaña nueva) y tiene sus campos.

1. Sigue los pasos y pega cada valor en su campo. Se oculta mientras escribes; el ojo lo muestra. La línea bajo un campo dice cómo es un valor correcto, y avisa cuando lo que has pegado claramente no lo es (nunca te lo impide).
2. Haz clic en **Guardar** en esa pestaña, o en **Omitir por ahora** donde se ofrezca.
3. Sigue con la siguiente. Las marcas de las pestañas dicen qué está guardado, omitido o pendiente, y la esquina lleva la cuenta.

- Una clave que la bóveda ya tiene nunca se muestra: elige **Use the one saved on** (con la fecha) o **Reemplazar**.
- El agente se entera cuando están guardadas todas las necesarias, o cuando pulsas **Close without the rest**: de cada una, guardada, omitida o pendiente, y nada de su valor. También se entera de una opcional que añadas después.
- En una app que corre dentro de Hydor, los pagos solo admiten una clave de prueba (empieza por sk_test_): una clave real se rechaza allí.
- Para una app web, la tarjeta avisa de algo pegado que es claramente otra cosa (una clave publicable donde va la secreta).
- Un campo marcado **El agente ve este** llega al agente tal como lo escribes, como en la tarjeta de un inicio de sesión.

## Comandos que usan una clave

Algunos trabajos necesitan una contraseña o un token en un programa de esta computadora: subir cambios a GitHub con un token, leer una base de datos con su contraseña, un script que llama a un servicio. Para esto, los agentes tienen una herramienta que ejecuta un comando con claves de la bóveda en su entorno, cada una con su propio nombre. Lo que el comando imprime vuelve al agente con las claves enmascaradas.

- Solo las claves con **Los comandos de esta computadora pueden usarla** activado pueden pasar a un comando. Actívalo en el diálogo del lápiz de la clave, o en la tarjeta cuando un agente la pide.
- Antes de que se ejecute un comando así, una tarjeta lo muestra: **Ejecutar un comando con** los nombres de las claves, luego el comando, con para qué sirve. **Permitir** lo ejecuta una vez. **Permitir en esta sesión** hace que también los comandos posteriores de esta sesión con las mismas claves se ejecuten sin preguntar, hasta que la app se reinicie. **No** lo detiene, y puedes decirle al agente qué hacer en su lugar.
- Una sesión con acceso total ejecuta estos comandos sin preguntar, como hace con sus otros comandos. En modo Planificar no se ejecuta ninguno.
- Un comando puede hacer cualquier cosa que haga un programa, incluido enviar la clave a otro lugar: permite solo comandos que entiendas, y activa esto solo para claves que un programa de aquí necesite.
- Un comando se detiene después de dos minutos, a menos que el agente le dé más tiempo (hasta diez).

## Rellenar un formulario que pide un servicio

Algunos servicios necesitan algo de ti a mitad de una tarea: una fecha, una opción, un sí o un no, o una página que abrir. Sea cual sea el agente que trabaja, la solicitud aparece como una tarjeta en la sesión, junto a las aprobaciones del propio agente, y en la [Bandeja de entrada](/guide/inbox). El título de la tarjeta indica lo que quiere el servicio:

- **…te pide rellenar un formulario**: el mensaje del servicio y luego sus campos, como un formulario. Hay cuadros de texto, texto más largo, números, fechas, un interruptor para sí o no, y chips o una lista para elegir (chips de los que puedes elegir varios, cuando el servicio permite más de uno). Haz clic en **Enviar**. Los campos vacíos que necesita (“Necesario”) y los números que no son números se marcan antes de enviar nada. Una respuesta que el servicio no puede aceptar (demasiado larga, no es una dirección de correo, con muy pocas opciones elegidas) se rechaza indicando qué corregir, y la tarjeta permanece.
- **…te pide abrir una página**: un enlace. **Abrir** abre la página en una pestaña nueva (para aprobar algo o iniciar sesión allí) y le avisa al servicio de que lo hiciste.
- **…pide continuar**: un sí o un no sencillo. **Permitir** dice que sí.

**Rechazar** dice que no. **Ahora no** cancela esta vez. La tarjeta de un servicio espera hasta una hora; si el turno del agente termina antes, la solicitud se cancela. Los servidores MCP que configures para Codex preguntan con el mismo tipo de tarjeta.

## Configurar servidores MCP para Claude Code, Codex y Custom

Abre [Configuración → Agentes → Servidores MCP](/settings?s=mcp). Son servidores de herramientas que configuras tú, para herramientas que el marketplace no tiene o servidores que ejecutas tú. Los de Claude Code y Codex se guardan en su propia configuración; los de Custom los guarda Hydor, así que puedes añadirlos sin tener ninguno de los dos programas. Custom, el agente propio de la app, los usa todos (consulta [Custom](/guide/custom)). Las sesiones nuevas los cargan; las sesiones que ya están en marcha recogen los cambios cuando se reinician.

La página enumera los servidores en tres grupos, **Claude Code**, **Codex** y **Custom**, y **Añadir servidor** está junto al título de la página. Un grupo de Claude Code o de Codex que no está configurado y no tiene servidores no aparece. El chip **Carpeta** de arriba elige la carpeta cuyos servidores ves, ya que Claude Code puede tener servidores para una carpeta además de para todas. La (i) junto al nombre de cada grupo dice cuándo se aplican los cambios.

Cada servidor muestra:

- su nombre y su tipo: **Comando** (un programa que ejecuta esta máquina), o **HTTP** o **SSE** (un servidor en una dirección; SSE es el tipo más antiguo);
- en Claude Code, dónde se aplica: **Todas las carpetas**, **Esta carpeta, solo tú** o **Esta carpeta, compartido**;
- **Desactivado**, para un servidor de Codex desactivado en la configuración propia de Codex;
- en el grupo **Custom**, **De Claude Code**, **De Codex** o **De .mcp.json** para un servidor que Custom lee de ahí, y **Sesión iniciada** o **Iniciar sesión de nuevo** para uno que inicia sesión en el navegador;
- su comando o dirección, y los nombres de sus variables de entorno, encabezados o variable del token Bearer. Sus valores se quedan en el servidor y nunca se muestran;
- tras una comprobación, cómo está el servidor (una insignia al final de su fila).

### Añadir un servidor

Haz clic en [Añadir servidor](/settings?s=mcp&find=Add%20server). El diálogo **Añadir un servidor MCP** pregunta:

- **Añadir a**: Claude Code, Codex, Custom, o varios de ellos. Al principio son Claude Code y Codex si están configurados; si no, Custom. Un programa sin configurar no se puede elegir, y el diálogo explica por qué. Custom también usa los servidores de Claude Code y Codex, así que añade a Custom los que solo él deba tener, o cuando no tengas ninguno de los dos programas.
- **Nombre**: letras, dígitos, puntos, guiones o guiones bajos, hasta 64, empezando por una letra o un dígito. Los agentes muestran sus herramientas como el nombre, una barra y la herramienta.
- **Escribir**: **Comando**, **HTTP** o **SSE**. Codex no admite SSE, así que elegir SSE deja fuera a Codex.
- Para un comando:
  - **Comando**: la línea de comandos completa, como `npx -y @modelcontextprotocol/server-github`. Se ejecuta en esta máquina cuando empieza una sesión. Pon entre comillas los argumentos que contengan espacios. Un ~ al principio de un argumento significa tu carpeta de inicio.
  - **Entorno**: un CLAVE=valor por línea (se omiten las líneas que empiezan por #). Los valores pasan a los archivos de configuración de los agentes (para Custom, un archivo que Hydor guarda en este equipo) y nunca se vuelven a mostrar aquí.
- Para HTTP o SSE:
  - **URL**: la dirección del servidor, que empieza por http:// o https://.
  - **Encabezados** (para Claude Code y Custom): uno “Nombre: valor” por línea, para servidores que aceptan una clave de API. Los servidores que usan un inicio de sesión en el navegador (OAuth) no necesitan ninguno: inicia sesión desde la lista después de añadirlo.
  - **Variable del token Bearer** (para Codex, **opcional**): el nombre de una variable de entorno cuyo valor Codex envía como token Bearer.
- **Dónde lo usa Claude Code** (**Dónde se usa** cuando solo se elige Claude Code):
  - **Todas las carpetas**: todas las sesiones de Claude Code en esta máquina. Es el valor predeterminado.
  - **Esta carpeta**: solo las sesiones de la carpeta elegida arriba, guardado en tu propia configuración de Claude Code.
  - **.mcp.json compartido**: se guarda en un archivo .mcp.json de esa carpeta, de modo que todos los que trabajan en el repositorio lo reciben.

  Los servidores de Codex y de Custom siempre se aplican a todas las carpetas.

Haz clic en **Añadir servidor** en el diálogo. Hydor lo añade a Claude Code y Codex mediante el comando propio de cada programa, de modo que su configuración quede como la esperan, y guarda él mismo el de Custom. Si un agente lo rechaza, el diálogo indica que no añadió el servidor, con lo que dijo el agente. Corrige lo que esté mal y haz clic en **Añadir servidor** de nuevo: solo se reintenta con los agentes que fallaron. Un servidor con el mismo nombre que uno que Custom ya lee de Claude Code o Codex lo sustituye para Custom.

Para cambiar un servidor de Custom, abre su menú **⋯** y elige **Editar**. Las variables y los encabezados aparecen con valores vacíos: deja uno vacío para conservar el valor guardado, o borra su línea para quitarlo. Si cambias el comando, o el sitio de la dirección, vuelve a escribir los valores.

### Comprobar qué servidores se conectan

[Comprobar conexiones](/settings?s=mcp&find=Check%20connections), al final del título de un grupo, inicia todos los servidores como lo haría una sesión nueva y muestra cómo le fue a cada uno. En el grupo **Custom** comprueba todo lo que Custom carga, así que, tras una comprobación, ahí aparecen también los servidores que lee de Claude Code, Codex y el .mcp.json de la carpeta:

- **Conectada**, con su número de herramientas;
- **Requiere iniciar sesión**; en Custom, un servidor que pide iniciar sesión en el navegador (OAuth);
- **Iniciar sesión de nuevo**, en Custom, cuando un inicio de sesión terminó y no se pudo renovar;
- **Aún conectando**;
- **Fallido**, con el motivo (“El servidor no se inició o no respondió.” cuando no hay ninguno);
- **Desactivado**.

No se usa ningún modelo. Puede tardar hasta uno o dos minutos. En Claude Code, se ejecuta en la carpeta elegida arriba, de modo que cuentan los servidores propios de esa carpeta.

### Iniciar sesión en un servidor

Un servidor en una dirección que inicia sesión con OAuth necesita que inicies sesión una vez.

En **Claude Code** y **Codex**, haz clic en **Iniciar sesión** (se muestra cuando una comprobación dice que requiere iniciar sesión), o abre el menú **⋯** del servidor y elige **Iniciar sesión (OAuth) en una terminal**. Se abre una terminal en la app, que ejecuta el inicio de sesión propio del programa para ese servidor: sigue allí sus pasos.

En **Custom** (servidores HTTP, los suyos y los que lee de los programas), haz clic en **Iniciar sesión** y luego en **Iniciar sesión** en el diálogo: inicias sesión en la página del propio servicio, en una ventana pequeña (un teléfono se queda en su pestaña), como con las [cuentas conectadas](#services-you-sign-in-to-in-the-browser). La mayoría de los servidores dejan que Hydor se registre solo; cuando uno no lo permite, el diálogo pide un ID de cliente que creas en la configuración para desarrolladores del servicio, y muestra la dirección de retorno que debes darle. Los tokens se guardan cifrados en el almacén, se envían solo a ese servidor y se renuevan solos, así que Custom nunca los ve. **Iniciar sesión de nuevo** aparece solo cuando falla la renovación. **Cerrar sesión**, en el menú **⋯**, olvida el inicio de sesión.

### Quitar un servidor

Abre el menú **⋯** del servidor, elige **Quitar** y confirma con **Quitar**. El agente deja de cargarlo. Las sesiones que ya están en marcha lo conservan hasta que se reinicien. Al quitar un servidor de Custom también se olvida su inicio de sesión, si ningún otro servidor usa esa dirección.

## Añadir plugins a Claude Code

Claude Code tiene plugins propios: complementos que agrupan habilidades, comandos, agentes, hooks y servidores MCP, procedentes de marketplaces (catálogos de plugins, guardados en un repositorio de GitHub, en otro repositorio git o en una carpeta). Funcionan solo con Claude Code. Están en la pestaña **Claude Code** de [Configuración → Agentes → Plugins](/settings?s=plugins&find=Claude%20Code); los plugins propios de Codex están en su pestaña **Codex**. Los plugins para todos los agentes están en la pestaña **Todos los agentes**: consulta [Plugins](/guide/plugins).

### Plugins instalados

**Instalada** enumera los plugins de Claude Code en esta máquina. Las sesiones nuevas de Claude Code los cargan. Cada uno muestra su nombre, su marketplace, su versión y lo que hace.

- El interruptor desactiva o activa un plugin sin quitarlo.
- Su menú **⋯** tiene **Desinstalar**, una vez que confirmas. Las sesiones nuevas de Claude Code dejan de cargar sus habilidades, comandos y servidores.

### Buscar e instalar un plugin

**Examinar** enumera todos los plugins que puedes instalar desde tus marketplaces, los más instalados primero, con cuántas instalaciones tiene cada uno. **Buscar plugins** reduce la lista. Muestra 40 a la vez: **Mostrar más** añade 40 más.

Haz clic en **Instalar** y confirma. El plugin se instala para todas las sesiones de Claude Code. Los plugins pueden añadir hooks y servidores que ejecutan comandos en esta máquina, así que instala solo plugins en los que confíes.

Hydor le pide a Claude Code la lista de plugins como máximo cada 10 minutos, y de nuevo después de cada cambio. La primera vez puede tardar un poco.

### Marketplaces de plugins

**Marketplaces** enumera los catálogos desde los que Claude Code instala plugins.

- Para añadir uno, haz clic en **Añadir** en el título del grupo, escribe un owner/repo de GitHub, una URL de git o una carpeta en el diálogo, y haz clic en **Añadir**.
- Para quitar uno, haz clic en la papelera de su fila y confirma. Los plugins instalados desde él también se desinstalan.

## Pídeselo a un agente

Los agentes pueden hacer esto por ti, con tu visto bueno en una tarjeta. Nunca escriben el valor de una clave en la app: para una clave o un inicio de sesión, muestran la tarjeta donde lo introduces.

- “¿Qué cuentas están conectadas? Prueba Notion y dime si funciona.”
- “Busca los correos sin leer de esta semana de mi arrendador y resúmelos.”
- “Redacta una respuesta al último correo de Anna diciendo que puedo reunirme el jueves y guárdala en mis Borradores.”
- “Guarda en esta carpeta los archivos adjuntos de las facturas que recibí este mes.”
- “Conecta Context7 para que los agentes puedan consultar la documentación de bibliotecas.”
- “Desactiva Gmail para todas las sesiones, pero déjalo activado en esta.”
- “Muéstrame las herramientas de Notion y desactiva las que eliminan páginas.”
- “Pon las herramientas de Gmail que envían o eliminan en Preguntar primero, y deja el resto activadas.”
- “Añade un servidor MCP para Claude Code y Codex que ejecute npx -y @modelcontextprotocol/server-memory, y luego comprueba que se conecta.”
- “Añade a Custom el servidor MCP HTTP de https://mcp.example.com/mcp y dime cuándo tengo que pulsar Iniciar sesión.”
- “Muéstrame los plugins de Claude Code más instalados y luego instala el que yo elija.”
- “Inicia sesión en mi cuenta de Voltaro y descarga las facturas de este año en esta carpeta.” (La primera vez, pide el inicio de sesión en una tarjeta.)
- “Sube esta rama a GitHub con el token de la bóveda.”
- “Pídeme las claves que necesita mi tienda, todas en una tarjeta, y dime cómo conseguir cada una.”
