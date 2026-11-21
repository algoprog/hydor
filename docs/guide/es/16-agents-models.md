# Agentes, cuentas y modelos

Hydor ejecuta varios agentes de IA: Claude Code, Codex, Custom (el agente propio de la app, para cualquier modelo) y otros agentes que hablan ACP, como Gemini CLI, OpenCode, Qwen Code, Goose o Grok Build. Este tema explica en qué se diferencian, cómo se instalan sus programas y se mantienen al día, cómo iniciar sesión en ellos (también con más de una cuenta) y de dónde vienen los modelos de Custom: OpenRouter, Ollama, modelos de Hugging Face que se ejecutan en esta computadora o cualquier endpoint compatible con OpenAI.

![Elegir el agente en la página de inicio: Claude Code, Codex o Custom](images/agents-models.webp)

## ¿Qué agente debo usar?

Un agente es el programa que hace el trabajo en una sesión: lee tu mensaje, usa herramientas (archivos, comandos, la web) y responde. El modelo es la IA que hay detrás. Todos los agentes de aquí reciben la misma ayuda de la app (búsqueda web, el navegador, la memoria, las habilidades, tus conexiones), pero se diferencian en de dónde vienen sus modelos.

- **Claude Code** (Anthropic). Funciona con tu plan de Claude o cobra a una cuenta de la API de Anthropic. Sus modelos son los de Anthropic (Opus, Sonnet, Haiku). Tiene sus propios límites de uso, que muestra la [página de Uso](/usage).
- **Codex** (OpenAI). Funciona con tu plan de ChatGPT. Sus modelos son los de OpenAI. También tiene límites de uso, que se muestran en la página de Uso. Codex viene con la app.
- **Custom**, el agente propio de la app. Ejecuta los modelos de tus planes de Claude y ChatGPT (mediante los inicios de sesión de Claude Code y Codex) y cualquier modelo que añadas en [Configuración → Agentes → Modelos](/settings?s=models): modelos a través de OpenRouter, modelos en esta computadora (con Ollama o vLLM) o cualquier endpoint compatible con OpenAI. Úsalo para modelos abiertos, modelos más económicos o modelos que nunca salen de tu computadora. Consulta [Custom, el agente propio de la app](/guide/custom).
- **Agentes que hablan ACP**: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build (el agente de programación de xAI, con sus modelos Grok) y otros, o un comando propio. ACP (Agent Client Protocol) es una forma común en que una app habla con un programa de agente. Cada uno inicia sesión una sola vez en su propio programa y usa sus propios modelos.

Lo que puede hacer cada uno en la app:

- Objetivos (la app mantiene al agente trabajando, ronda tras ronda, hasta que se cumplen las comprobaciones que has acordado; consulta [Dar un objetivo a la sesión](/guide/sessions#give-the-session-a-goal)): todos los agentes, Claude Code, Codex, Custom y los demás agentes ACP. Un `/goal` escrito en un chat de Claude Code o de Codex es el objetivo, más simple, de ese programa. Bifurcaciones (una copia de la sesión desde una respuesta anterior): Claude Code, Codex y Custom. Los demás agentes ACP, no.
- **Continuar en…** (pasar la conversación a otro agente): desde Claude Code o Codex, al otro o a Custom.
- Esfuerzo (cuánto piensa el modelo): Claude Code, Codex y Grok Build, y cualquier otro agente ACP cuyos modelos lo ofrezcan.
- Más de una cuenta, límites de uso del plan y cambio de cuenta al llegar a un límite: Claude Code, Codex y Grok Build.
- Reinicios de límites y crédito de la API al llegar a un límite: solo Claude Code y Codex.

## Elegir el agente y el modelo de una nueva sesión

En la página de inicio (`/`), la fila bajo el cuadro de mensaje indica quién hace el trabajo.

1. Haz clic en **Se ejecuta en**. La lista muestra **Claude Code** («Anthropic · plan de Claude o clave de API»), **Codex** («OpenAI · plan de ChatGPT o clave de API») y **Custom** («Cualquier modelo: OpenRouter, Ollama, vLLM») y todos los agentes que añadiste en Configuración → Más agentes («Agente ACP · » y su comando). Al final, **Modelos para Custom** abre Configuración → Modelos y **Añadir o administrar agentes** abre Configuración → Más agentes.
2. Haz clic en **Modelo** y elige uno. **Automático**, arriba y elegido al principio, deja que los niveles decidan: Mejor, y Máximo si el problema resulta demasiado difícil (consulta [Niveles: un modelo para cada tipo de trabajo](#tiers-a-model-for-each-kind-of-job)). Debajo, la lista muestra solo los modelos propios de ese agente. El modelo predeterminado del agente aparece marcado como «predeterminado». Las versiones anteriores de un modelo esperan tras una línea como «2 modelos anteriores»; haz clic en ella para verlas. Cuando hay más de ocho modelos, arriba aparece un cuadro **Buscar modelos**: escribe unas letras y pulsa Intro para elegir la primera coincidencia. Si el agente no arrancó como la app le pidió para sus modelos, el menú lo indica, con las propias palabras del agente sobre el motivo, y **Reintentar** vuelve a pedirlos.
3. En **Opciones** encuentras **Esfuerzo** (para los agentes y modelos que lo tienen: Predeterminado, Bajo, Medio, Alto, etc.; para Grok Build, consulta [Esfuerzo en Grok Build](#effort-for-grok-build)) y **Permisos** (lo que el agente puede hacer sin preguntarte). Mayús+Tab en el cuadro de mensaje también cambia los permisos.

La página de inicio recuerda lo que elegiste para cada lugar donde trabajas (cada proyecto, cada carpeta y **Nueva carpeta de tarea**), en todos tus dispositivos: el modelo, el esfuerzo y los permisos de cada programa vuelven allí como los dejaste (consulta [Lo que recuerda la página de inicio](/guide/sessions#what-the-start-page-remembers)).

Un agente ACP distinto de Custom muestra sus opciones de **Modelo** y **Permisos** solo después de su primera sesión: enumeran lo que el agente ofreció la última vez que se ejecutó. Grok Build es la excepción: sus modelos, con los esfuerzos que admite cada uno, aparecen en cuanto se añade, porque la app se los pide a Grok.

Con **Opciones** → **Confidencial** activado, **Se ejecuta en** es **Custom** y **Modelo** enumera solo los modelos de esta computadora o de tu red privada, con el mejor de ellos elegido primero: consulta [Mantener confidencial una sesión](/guide/sessions#keep-a-session-confidential).

En un teléfono, cada uno de estos menús se abre como una hoja desde la parte inferior de la pantalla.

## Cambiar de modelo a mitad de una sesión

En una sesión, el modelo, el esfuerzo y los permisos están bajo el cuadro de mensaje. Forman un solo chip que se lee como «Opus 5.5 · Alto · Planificar»: haz clic en él para ver **Modelo**, **Esfuerzo** y **Permisos**.

Elige otro modelo y la sesión continúa con él:

- Claude Code cambia al instante.
- Codex usa el nuevo modelo a partir de su siguiente turno.
- Custom lo usa a partir de su siguiente paso, incluso a mitad de un turno.
- Otro agente ACP cambia si ofrece una elección de modelos.

El **Esfuerzo** de la sesión funciona igual. Elige uno y el agente en ejecución lo usa a partir de su siguiente turno. Si el modelo al que cambias no admite el esfuerzo que tenías, el selector muestra el valor predeterminado de ese modelo, y el modelo se ejecuta con ese.

El menú de modelos solo enumera los modelos del agente propio de la sesión; en una sesión confidencial, solo los de esta computadora o tu red privada. Para pasar una conversación a otro agente, usa el menú de la sesión (⋯) → **Continuar en Codex**, **Continuar en Claude Code** o **Continuar en Custom Agent** (desde sesiones de Claude Code y Codex; Custom aparece cuando ya tiene un modelo). Tu siguiente mensaje empieza entonces una nueva sesión de ese agente en la misma carpeta, con la conversación hasta ese momento. Una sesión detenida se reanuda con el último modelo que usó, a menos que elijas otro antes de enviar.

## Esfuerzo en Grok Build

Los modelos de Grok admiten un esfuerzo de razonamiento, la misma opción que te dan Claude Code y Codex:

- Grok 4.6 (y los modelos más nuevos que ofrezcan lo mismo): **xhigh**, **alto**, **medio** o **bajo**. **Alto** es el valor predeterminado.
- Grok 4.5: **alto**, **medio** o **bajo**.

En la página de inicio, elige **Grok Build** en **Se ejecuta en** y luego **Opciones** → **Esfuerzo**: enumera los esfuerzos del modelo que elegiste, con **Predeterminado**. Aparecen en cuanto se añade Grok Build, incluso antes de su primera sesión. Una sesión de Grok Build en ejecución cambia su esfuerzo en su propio selector de **Esfuerzo** (el chip bajo el cuadro de mensaje), y una ejecución de una [app](/guide/apps) también admite uno. Cuando cambias una sesión a un modelo que no admite el esfuerzo que tenías (xhigh en Grok 4.5), el selector muestra el valor predeterminado de ese modelo, y con ese se ejecuta el modelo.

No es solo para Grok: cualquier otro agente que hable ACP y cuyos modelos ofrezcan esfuerzos recibe la misma opción de **Esfuerzo**.

## Niveles: un modelo para cada tipo de trabajo

Los agentes eligen modelos por nivel en lugar de por nombre: **Rápido** para trabajos pequeños y muy claros cuyo resultado se puede comprobar, **Estándar** para tareas claras de tamaño medio, **Mejor** para el agente principal de una sesión, que planifica, lidera a los subagentes y comprueba su trabajo, y **Máximo** para los problemas más difíciles. La mayor parte de un trabajo son partes claras que un modelo más económico hace bien, así que una sesión cuesta menos de este modo sin que el resultado empeore: el modelo más fuerte de la sala sigue planificando el trabajo y comprobándolo.

En la página de inicio, **Modelo** se abre en **Automático**: la sesión empieza en Mejor (el mismo **Automático** inicia las sesiones de una [tarea programada](/guide/tasks#model-effort-permissions-and-other-options), y una [app](/guide/apps) puede pensar con un nivel en lugar de con un modelo por nombre). Su agente principal entrega las partes claras a subagentes en Estándar y Rápido, y puede pasarse a Máximo cuando un problema resulta más difícil de lo que Mejor puede manejar (una corrección que ha fallado dos veces, una causa que no encuentra, una demostración); una línea en la conversación lo dice, con el motivo. Una petición no se envía a Máximo solo por su redacción: Mejor resuelve la mayor parte de lo que parece difícil, por menos. Elige en cambio un modelo por nombre y la sesión piensa con ese; sus subagentes siguen recibiendo niveles. Un agente tuyo puede pensar con un solo nivel (consulta [Con qué piensa un agente: los niveles](/guide/agents#what-an-agent-thinks-with-tiers)).

[Configuración → Agentes → Modelos → Niveles](/settings?s=models&find=Tiers) indica qué significa cada nivel para cada programa: una fila por nivel, con un interruptor junto al título del grupo para elegir el programa (**Claude Code**, **Codex** o **Custom**), y en cada fila un modelo y, para Claude Code y Codex, un esfuerzo. El (i) de un nivel da más información. Al principio, para Claude Code, Rápido es Haiku, Estándar es Sonnet, Mejor es Opus y Máximo es el Fable más reciente; para Codex, Rápido es Luna, Estándar es Terra, Mejor es Sol y Máximo es Astra (en un plan sin alguno de ellos, el más cercano que ofrezca, con más esfuerzo para el nivel superior donde dos comparten modelo); los niveles de Custom se rellenan solos: un nivel que dejas sin tocar toma el modelo más reciente de su tipo entre los modelos que tiene Custom. De tu plan de Claude, eso es Haiku para Rápido, Sonnet para Estándar, Opus para Mejor y el Fable más reciente para Máximo; si no, de tu plan de ChatGPT, Luna, Terra, Sol y Astra; si no, de los modelos que añadiste que no están en esta computadora (OpenRouter, un endpoint) cuyos nombres indiquen una de esas familias. Un modelo de esta computadora nunca se elige por ti, porque su nombre no dice qué tan potente es, y un modelo pequeño (Haiku, Luna) nunca pasa a ser Mejor: con solo modelos pequeños o locales, los niveles quedan vacíos hasta que elijas, y una sesión de Custom conserva entonces el modelo que eligió. Cuando Mejor nombra un modelo, la página de inicio ofrece **Automático** para Custom, y sus sesiones lideran subagentes (subagentes de Hydor, ya que Custom no tiene una herramienta Agent propia). En la pestaña **Custom** puedes nombrar cualquiera de sus modelos para un nivel (consulta [De dónde vienen los modelos de Custom](#where-customs-models-come-from)). Un nivel que dejas sin tocar sigue el modelo más reciente de su tipo en su programa. **Volver a los valores predeterminados**, en el menú **⋯** junto al título, los restablece, incluidas las elecciones de Custom.

Dos interruptores del grupo **Niveles en las sesiones**, bajo los niveles, indican cómo los usan las sesiones:

- **Liderar con subagentes** (activado al principio): al agente principal de una sesión se le indica que planifique, entregue las partes claras a subagentes en niveles más económicos y compruebe su trabajo, y un subagente pedido sin nivel recibe Estándar. Desactivado, los agentes trabajan solos a menos que decidan otra cosa, y la página de inicio y el formulario de tareas no tienen Automático.
- **Máximo para problemas difíciles** (activado al principio): un agente principal en Automático puede pasarse a Máximo cuando un problema resulta demasiado difícil para Mejor. Desactivado, las sesiones en Automático se quedan en Mejor.

## Los programas de agentes se instalan y se actualizan solos

Claude Code, Codex, Gemini CLI, Grok Build y los demás son programas de esta computadora. No tienes que instalarlos a mano.

Abre [Configuración → Agentes → Cuentas](/settings?s=accounts&find=Agent%20programs) y mira el grupo **Programas de agentes**. Enumera Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build (una vez que lo hayas añadido) y los agentes que necesitan un adaptador ACP, cada uno con la versión que ejecutan las sesiones y de dónde viene:

- **instalación propia**: lo instalaste tú (para Grok Build, también con el instalador propio de xAI, que lo coloca en `~/.grok/bin`).
- **instalado por la app**: la app lo instaló en su propia carpeta.
- **viene con la app**: Codex se incluye con la app.
- **No está aquí: se instala solo la primera vez que se usa**: falta. Haz clic en **Instalar** para obtenerlo ahora.

Una fila también dice «… is out» cuando hay una versión más nueva. La fila de Codex añade «yours in the terminal: …» cuando tienes además un Codex propio: las sesiones ejecutan el de la app, y una terminal ejecuta el tuyo.

Un programa que falta también se instala solo la primera vez que hace falta: Claude Code cuando inicias sesión en él o empiezas una sesión de Claude Code, un agente ACP cuando lo añades en Configuración → Agentes → Más agentes o empiezas una sesión con él. La app los instala con npm en su propia carpeta, así que no necesitas derechos de administrador.

Goose, Kimi CLI y algunos otros agentes no están en esta lista: instálalos tú (Configuración → Agentes → Más agentes muestra dónde conseguirlos). Un agente que necesita un adaptador ACP se instala en dos partes, el adaptador y el agente en sí; la lista muestra una sola fila para ambos.

## Mantén actualizados los programas de agentes

Con [**Actualizar automáticamente**](/settings?s=accounts&find=Update%20automatically) activado, la última fila de **Programas de agentes** (está activado a menos que lo desactives), la app actualiza cada programa de agente a su versión más reciente una vez al día. La primera ejecución llega unos diez minutos después de que la app arranca.

- Las copias que instaló la app se actualizan con npm, en su propia carpeta. Codex cambia a una copia más reciente que la que venía con la app.
- Tus propias instalaciones se actualizan con su propio actualizador: `claude update` para Claude Code, `codex update` para Codex (el que ejecuta tu terminal), `opencode upgrade` para OpenCode, `grok update` para Grok Build.
- Gemini CLI, Qwen Code, Auggie, Grok Build o un agente con un adaptador ACP que instalaste con `npm install -g` se actualizan con npm, cuando tu usuario puede escribir en esa carpeta. Todo lo que se instaló de otra manera queda para que lo actualices tú, de la misma forma en que lo instalaste.
- Claude Code sigue su propia línea de versiones: la estable cuando su configuración dice `"autoUpdatesChannel": "stable"`, y si no, la más reciente.
- Si desactivaste las actualizaciones propias de Claude Code con `DISABLE_AUTOUPDATER=1` (la imagen de Docker lo hace), la app tampoco actualiza por su cuenta tu Claude Code. **Actualizar ahora** sí lo hace.

La app solo conserva una versión nueva cuando funciona tal como la usan las sesiones. Claude Code debe responder al empezar una sesión y mostrar sus modelos, Codex debe iniciar su servidor de la app y mostrar sus modelos, y los demás deben iniciarse y decir su versión. Nada de esto necesita iniciar sesión ni consume nada de tu plan. Cada uno tiene un minuto para responder, y solo cuenta el tiempo en que la computadora está activa, así que una Mac que se suspende en medio de la comprobación no gasta el minuto. Uno que tarda en responder la primera vez (una Mac revisa un programa nuevo antes de ejecutarlo por primera vez) se vuelve a iniciar con dos minutos más, y solo falla si tampoco responde entonces. Una versión que falla se deshace:

- Una copia que instaló la app, o una tuya que actualizó con npm, vuelve a la versión anterior.
- En tu propio Claude Code, las sesiones siguen ejecutando la versión anterior, que el instalador de Claude Code conserva junto a la nueva. El comando `claude` en una terminal se queda en la nueva. La fila dice "… did not work here".
- Una versión que falló no se vuelve a probar por sí sola, pero sí la siguiente, y **Actualizar ahora** la prueba otra vez.

Debajo de esa fila, aparece cuándo revisó la app por última vez, por ejemplo "Up to date · checked 2h ago", con **Comprobar ahora** para volver a revisar. Cuando hay versiones más nuevas, lo indica, con **Actualizar ahora** para instalarlas todas a la vez (no hay un botón por programa); mientras trabaja, muestra qué programa está actualizando. Las líneas de abajo dicen qué cambió en la última actualización, por ejemplo "Claude Code 2.1.308 → 2.1.316", o por qué no se pudo instalar una versión.

Las sesiones que están en marcha siguen con la versión con la que empezaron; las sesiones nuevas usan la nueva. Con **Actualizar automáticamente** desactivado, la app sigue revisando una vez al día y muestra lo que hay disponible, pero no instala nada hasta que hagas clic en **Actualizar ahora**.

## Inicia sesión en Claude Code, Codex y Grok Build

Claude Code y Codex necesitan que inicies sesión antes de poder funcionar, y Grok Build también una vez que lo has añadido (consulta [Añade Gemini CLI, OpenCode y otros agentes ACP](#add-gemini-cli-opencode-and-other-acp-agents)). Abre [Configuración → Agentes → Cuentas](/settings?s=accounts) (en un teléfono, Configuración es una lista de secciones: toca **Cuentas** en Agentes; el título de la parte superior te lleva de vuelta). El grupo **Cuentas** (su (i) dice que son los inicios de sesión de Claude Code, Codex y Grok Build que usan tus sesiones, y que puedes añadir otra suscripción, una de trabajo y una personal por ejemplo, y elegir una al empezar una sesión) muestra primero el inicio de sesión propio de cada agente y luego las cuentas que añadiste para él. El inicio de sesión propio de Grok Build también tiene una fila ahí, **Grok Build**, que aparece una vez que lo añades. Cada una muestra una marca verde con el correo, el plan y el método de inicio de sesión, o una cruz roja con "Not signed in" o lo que salió mal.

Para iniciar sesión:

1. Haz clic en **Iniciar sesión** junto al agente.
2. Elige cómo:
   - Claude Code: **Suscripción de Claude** (tu plan de Claude) o **Consola (facturación de API)** (una cuenta de la API de Anthropic).
   - Codex: **Código del dispositivo** o **Redirección del navegador**.
   - Grok Build: no hay nada que elegir, siempre inicia sesión con un código.
3. Haz clic en **Obtener enlace de inicio de sesión**.
4. Sigue los pasos que muestra el cuadro de diálogo:
   - Claude Code: abre el enlace (**Abrir la página de inicio de sesión**), aprueba el acceso en tu navegador y pega el código que muestra la página en **Pega el código de la página**; luego haz clic en **Terminar el inicio de sesión**.
   - Codex, Código del dispositivo: abre el enlace en cualquier dispositivo, inicia sesión en ChatGPT e introduce el código de un solo uso que muestra el cuadro de diálogo. El cuadro de diálogo se da cuenta solo cuando terminas.
   - Codex, Redirección del navegador: después de iniciar sesión, tu navegador intenta abrir una página "localhost" y falla. Copia la dirección de esa página, pégala en **Pega la dirección localhost de tu navegador** y haz clic en **Terminar el inicio de sesión**.
   - Grok Build: recibes un enlace y un código de un solo uso. Abre el enlace en cualquier dispositivo, inicia sesión con tu cuenta de Grok y confirma el código (**2. Confirma este código**). No hay nada que pegar de vuelta: el cuadro de diálogo se da cuenta solo cuando terminas.

Cuando funciona, ves "Claude Code is signed in" (o Codex, o Grok Build). Si falla, el cuadro de diálogo dice por qué; haz clic en **Reintentar**.

Una vez que has iniciado sesión, el botón dice **Cambiar de cuenta**: inicia el mismo proceso para otra cuenta (para Grok Build, un código nuevo). **Cerrar sesión** está en el menú **⋯** de la fila: cierra la sesión del programa en esta computadora, para todas las terminales y editores que lo usan, después de que lo confirmes.

Si empiezas una sesión de Grok Build mientras no has iniciado sesión, la sesión se detiene con "Grok Build is not signed in: sign in with your Grok account in Settings → Agents → Accounts, then try again." Inicia sesión ahí y vuelve a enviar tu mensaje. Una clave de API de xAI en `XAI_API_KEY`, en el entorno de los agentes, funciona con Grok Build en lugar de una suscripción.

El recorrido de bienvenida (desde **Ayuda** en la barra de iconos) te pregunta qué agentes y modelos quieres usar y también te guía por estos inicios de sesión.

## Añade una segunda cuenta (de trabajo y personal)

Puedes iniciar sesión en más de una cuenta de Claude Code, Codex o Grok Build, por ejemplo un plan de trabajo y uno personal, y elegir una por sesión.

1. Abre [Configuración → Agentes → Cuentas](/settings?s=accounts&find=Accounts).
2. Haz clic en **Añadir una cuenta**, junto al título del grupo **Cuentas**.
3. Elige **Claude Code**, **Codex** o **Grok Build** (se ofrece una vez que Grok Build está configurado), escribe un nombre (hasta 40 caracteres, como "Trabajo" o "Personal") y haz clic en **Añadir e iniciar sesión**.
4. Se abre el cuadro de diálogo de inicio de sesión de la cuenta nueva. Inicia sesión como se describió antes.

Cada cuenta añadida inicia sesión por separado y conserva su propio historial de sesiones. Tu configuración, instrucciones, habilidades y complementos se comparten con el inicio de sesión principal del agente, así que los cambios se aplican a ambos. En Claude Code, una carpeta en la que confiaste con el inicio de sesión principal también es de confianza con una cuenta añadida, así que las reglas de permisos propias de la carpeta se aplican en sus sesiones. Dos cuentas del mismo agente no pueden tener el mismo nombre.

Una cuenta de Grok Build añadida tiene una carpeta propia con su inicio de sesión y el historial de sesiones propio de Grok. Comparte con tu inicio de sesión principal la configuración propia de la CLI de Grok: su configuración, reglas (`AGENTS.md`), habilidades, complementos e inicios de sesión de MCP.

Cada cuenta añadida tiene su propia fila, debajo del inicio de sesión propio del agente, con **Iniciar sesión** o **Cambiar de cuenta**; su menú **⋯** tiene **Cerrar sesión**, **Cambiar nombre** y **Quitar**:

- **Cambiar nombre** pide un nombre nuevo.
- **Cerrar sesión** hace que las sesiones que se ejecutan con esta cuenta dejen de funcionar hasta que vuelva a iniciar sesión.
- **Quitar** saca la cuenta de la app. Sus sesiones desaparecen de la lista, pero su historial se queda en el disco, a menos que también marques **Eliminar también su inicio de sesión y el historial de sus sesiones**. No puedes quitar una cuenta mientras haya sesiones ejecutándose con ella: deténlas primero.

La [página de Uso](/usage) muestra una tarjeta por cada cuenta añadida de Claude Code, Codex o Grok Build, con sus propios límites.

## Elige la cuenta con la que se ejecuta una sesión

Cuando el agente que elegiste tiene cuentas añadidas (para Grok Build, una vez que añadiste una), las **Opciones** de la página de inicio muestran una fila **Cuenta**. Haz clic en ella:

- **Tu inicio de sesión** es la cuenta propia del programa (la primera de ese agente en **Cuentas**; para Grok Build, "The Grok Build CLI's own account").
- Cada cuenta añadida aparece por su nombre.
- **Administrar cuentas** abre Configuración → Agentes → Cuentas.

La página de inicio recuerda tu elección para ese agente, igual en todos los lugares. Una sesión que se ejecuta con una cuenta añadida muestra el nombre de esa cuenta, con un icono de persona, en la parte superior de la sesión. Si esa cuenta alcanza un límite de uso, el aviso del límite sobre el cuadro de mensaje trata de esa cuenta. La cuenta se fija cuando empieza la sesión. Solo cambia por sí sola con **Cambiar de cuenta en un límite** (más abajo).

Para pasar una sesión a otra cuenta tú mismo, haz clic en el chip **Cuenta** de la propia sesión y elige una. Esto funciona para sesiones de Claude Code, Codex y Grok Build, y surte efecto desde tu siguiente mensaje. El historial de Grok de una sesión de Grok Build se mueve con ella; si Grok no puede reabrirlo con la otra cuenta, empieza de cero allí, con una nota.

## Usa todas tus cuentas: cambia en un límite

Con dos o más cuentas del mismo agente, la app puede usarlas todas: cuando una se queda sin uso, tu trabajo continúa con otra. Abre [Configuración → Agentes → Cuentas](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) y busca **Cambiar de cuenta en un límite**, en el grupo **En un límite de uso** dentro de **Cuentas**, que aparece en cuanto has añadido cualquier cuenta, incluida la de Grok Build (su (i) dice que cuando la cuenta de una sesión se queda sin uso, la sesión pasa a otra cuenta de ese agente con uso disponible y continúa, y que las sesiones nuevas se saltan una cuenta que está en su límite). Está activado desde el principio (desactívalo ahí si prefieres elegir tú la cuenta), y funciona aunque no haya ningún navegador abierto.

- Cuando un turno se detiene porque la cuenta de la sesión alcanzó su límite de uso, la app elige otra cuenta con sesión iniciada del mismo agente que todavía tenga uso (la menos usada), mueve la sesión allí con todo su historial y envía "… reached its usage limit, so this session now runs on …. Continue where you left off." Una nota breve en la parte inferior de la pantalla dice a qué cuenta se movió.
- Los subagentes que una sesión de Claude Code ejecuta en segundo plano también continúan. Los que siguen trabajando cuando llega el límite se detienen en su siguiente paso con su trabajo conservado, y la app los espera (dos minutos como máximo) antes de mover la sesión. El mensaje los nombra entonces, y el agente continúa cada uno donde se detuvo. Si solo los subagentes alcanzan un límite (uno solo para su modelo), la sesión se mueve cuando su turno ha terminado y ninguno de ellos sigue trabajando.
- Los subagentes de Hydor (las sesiones que un agente inicia para hacer parte de su trabajo) son sesiones propias, así que cada uno se mueve por sí solo cuando un límite detiene su turno. El agente que lo inició se entera de que continúa, no de que falló, y recibe su respuesta cuando termina.
- Cuentan tu inicio de sesión principal y cada cuenta añadida. Las cuentas de Claude Code toman el relevo de las de Claude Code, las de Codex de las de Codex, las de Grok Build de las de Grok Build.
- Una cuenta de Grok Build está en su límite cuando alcanza su límite semanal, su límite de crédito o su límite de gasto de pago por uso. La sesión pasa entonces a otra cuenta de Grok con sesión iniciada y con uso disponible (la menos usada) y continúa con "… reached its usage limit, so this session now runs on …". Un límite de frecuencia breve (una ráfaga de solicitudes) no mueve nada: pasa por sí solo. El aviso del límite sobre el cuadro de mensaje también se muestra en las sesiones de Grok.
- Un objetivo que dirige la app es de la app, así que sigue adelante en la cuenta nueva. Un objetivo escrito como `/goal` en Codex se mueve con la sesión y sigue adelante.
- Cuando todas las cuentas están en su límite, no se mueve nada (a menos que **Usar crédito de API en un límite** esté activado, más abajo, para Claude Code). Con **Reanudar tras los límites de uso** activado, la sesión continúa cuando se restablece la primera cuenta, con esa cuenta. Esto vale también para las sesiones de Grok Build. Más en [Uso, límites y costos](/guide/usage#continue-sessions-automatically-after-a-limit).
- Una sesión nueva que empieza con una cuenta que está en su límite empieza con una que tenga uso disponible, y un mensaje que envías a una sesión cuya cuenta está en su límite mueve primero la sesión, para que el mensaje no sea rechazado. Con tu mensaje, el agente se entera de que ahora se ejecuta con una cuenta con uso disponible, para que no espere el restablecimiento de la cuenta anterior, y de cuáles de sus subagentes pueden continuar.
- Las sesiones abiertas en VS Code o en una terminal se quedan con su cuenta.
- Los restablecimientos de límites (créditos de restablecimiento de Codex, concesiones de restablecimiento de Claude) y el crédito de API siguen siendo solo para Claude Code y Codex.
- Las preguntas rápidas de la propia app a Claude Code o Codex (el modelo auxiliar en **Automático**, los pasos rápidos de modelo de una app, las descripciones de pull request, las sugerencias de comandos) van de la misma forma a tu siguiente cuenta con sesión iniciada cuando una está en su límite o sin sesión iniciada. Cuando ni Claude Code ni Codex pueden responder, interviene uno de tus modelos Custom (consulta [Cuando una cuenta no tiene sesión iniciada](#when-an-account-is-signed-out)).

## Cuando una cuenta ha cerrado sesión

Una cuenta de Claude Code, Codex o Grok Build puede quedar sin sesión iniciada: su inicio de sesión terminó o fue revocado, y el programa dice "Not logged in · Please run /login" o "401 Unauthorized". La app lo resuelve por su cuenta cuando puede, y te pide que inicies sesión de nuevo solo cuando nada más puede hacer el trabajo.

- **Tus sesiones.** Cuando se rechaza el turno de una sesión porque su cuenta ha cerrado sesión, y [Cambiar de cuenta en un límite](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) está activado (lo está desde el principio), la sesión pasa, con todo su historial, a otra cuenta del mismo agente que tenga sesión iniciada y aún tenga uso disponible, y continúa. Una nota breve en la parte inferior de la pantalla dice "<sesión>: <cuenta> ha cerrado sesión, así que continúa en <otra cuenta>", y al agente se le dice "… ha cerrado sesión, así que esta sesión ahora se ejecuta en …. Continúa donde lo dejaste." Un mensaje que envíes a una sesión cuya cuenta se detectó sin sesión hace poco la mueve primero de la misma manera, para que el mensaje no sea rechazado.
- **Cuando una sesión no puede moverse.** Con **Cambiar de cuenta en un límite** desactivado, o cuando ninguna otra cuenta de ese agente tiene uso disponible, la sesión se detiene. Un aviso sobre su cuadro de mensaje dice "<cuenta> ha cerrado sesión" y "Esta sesión continúa cuando inicies sesión de nuevo.", con un botón **Iniciar sesión**. Una vez que has iniciado sesión de nuevo, aquí o en una terminal, la sesión continúa por sí sola, y al agente se le dice "Has iniciado sesión de nuevo. Continúa donde lo dejaste."
- **Trabajo en segundo plano.** Las tareas pequeñas del [modelo auxiliar](/settings?s=models&find=Helper%20model) en **Automático** (títulos de sesiones, notas de memoria, acortar [tu perfil](/guide/memory#your-profile), los pasos rápidos de modelo de una app, descripciones de pull request…) pasan de largo una cuenta sin sesión durante 15 minutos y luego la prueban de nuevo, de modo que se detecta un inicio de sesión que hagas en una terminal. Responde la siguiente cuenta con sesión iniciada, y luego Codex. Cuando ni Claude Code ni Codex pueden responder (sin sesión, en un límite o no instalados), se encarga uno de tus modelos **Custom**: el que nombra el nivel **Rápido** de Custom en [Configuración → Agentes → Modelos → Niveles](/settings?s=models&find=Tiers) (después **Estándar**, y para los trabajos grandes poco frecuentes **Mejor**, luego **Máximo**), o si no el modelo más barato que hayas añadido (un modelo en esta computadora cuenta como gratuito). Se prueban como máximo dos. Lo que cuesta cuenta como el uso de cualquier modelo Custom.
- **El aviso para iniciar sesión.** Solo cuando nada pudo hacer el trabajo y una cuenta había cerrado sesión, aparece una tarjeta en todas las páginas, abajo a la derecha (sobre el cuadro de mensaje en un teléfono). Su título es "Inicia sesión de nuevo en Claude Code" (o Codex, o Grok Build), debajo "<cuenta> ha cerrado sesión.", y por qué lo pide: "El trabajo en segundo plano lo necesita (acortar tu perfil), y ninguna otra cuenta ni modelo Custom pudo hacerlo." o, para una sesión que detuvo, "… continúa cuando inicies sesión." **Iniciar sesión** abre el mismo cuadro de inicio de sesión que [Configuración → Agentes → Cuentas](/settings?s=accounts). **Ahora no** oculta la tarjeta durante una hora; una sesión que se detiene por ello vuelve a mostrar la tarjeta, y el aviso en esa sesión permanece. Se muestran como máximo dos tarjetas a la vez, y después "+N más" te lleva a Configuración → Agentes → Cuentas. Una tarjeta desaparece cuando la cuenta vuelve a tener la sesión iniciada, desde la tarjeta, desde Configuración o en una terminal (la app lo detecta en su siguiente llamada que se complete). También desaparece cuando el trabajo en segundo plano vuelve a hacerse de otra manera (responde otra cuenta o un modelo Custom). Cuando Claude Code y Codex han cerrado sesión, solo se pregunta por Claude Code, que responde primero.

Tu perfil también lo muestra: cuando acortarlo falló porque una cuenta ha cerrado sesión, el motivo que aparece debajo lo dice ("Tu cuenta de Claude Code “Work” ha cerrado sesión, y ninguna otra cuenta ni modelo Custom pudo hacerlo: inicia sesión de nuevo (Configuración → Agentes → Cuentas).") y aparece la tarjeta.

## Usar crédito de la API cuando todas las cuentas están en su límite

Si tienes una clave de API de Anthropic (de [console.anthropic.com](https://console.anthropic.com) → API keys), tus sesiones de Claude Code pueden continuar con ella cuando todas las cuentas de Claude Code están en su límite de uso, en lugar de detenerse. Cuesta dinero: Anthropic factura la sesión a precios de API mientras se ejecute de este modo, y no la cubre tu suscripción.

1. Abre [Configuración → Agentes → Cuentas](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). En la fila de una cuenta de Claude Code en **Cuentas** (tu inicio de sesión principal, o uno que añadiste), haz clic en **⋯** y luego en **Añadir clave de API…**.
2. Pega la clave en **Clave de API de Anthropic** y haz clic en **Guardar clave**. La app la comprueba con Anthropic y la guarda cifrada en esta computadora. La fila muestra entonces una etiqueta **Crédito de la API**. **Cambiar clave de API…** la reemplaza y **Quitar clave de API** la elimina.
3. Activa **Usar crédito de API en un límite**, en el grupo **En un límite de uso** (su (i) dice que cuando todas las cuentas de Claude Code están en su límite de uso, las sesiones continúan facturadas a la clave de API de Anthropic de una cuenta en lugar de detenerse, y que está desactivado hasta que lo actives). Aparece cuando has iniciado sesión en Claude Code o has añadido una cuenta de Claude Code.

Qué ocurre entonces:

- Cuando la cuenta de una sesión de Claude Code llega a su límite de uso, la app prueba primero lo que hace **Cambiar de cuenta en un límite**: otra cuenta con uso disponible. Solo cuando ninguna tiene, y el ajuste está activado, la sesión continúa facturada a la clave de API.
- La sesión permanece en su propia cuenta, así que su historial no se mueve. Si esa cuenta no tiene clave, se usa la clave de otra cuenta de Claude Code.
- La sesión muestra una etiqueta **Crédito de la API** junto a su cuenta, arriba. Pasa el cursor por encima para ver el motivo.
- Cuando un plan vuelve a tener uso, la sesión vuelve a él al terminar su siguiente turno: a su propia cuenta, o a otra con uso disponible. No tienes que hacer nada.
- Si la app no puede leer el uso de una cuenta, nunca pasa tu trabajo a la facturación de la API.
- Codex no se ve afectado: no tiene crédito de API.

## Añadir Gemini CLI, OpenCode y otros agentes ACP

Abre [Configuración → Agentes → Más agentes](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Tus agentes** (aparecen junto a Claude Code y Codex cuando empiezas una sesión) lista primero Custom y después los agentes que añadiste. Cada uno muestra una marca de verificación cuando su programa está instalado aquí, o una cruz y "no instalado".
- **Agentes que hablan ACP** (instala uno, inicia sesión una vez en su propia CLI y luego añádelo aquí) lista los conocidos que aún no has añadido: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build y otros. Los instalados van primero. Una fila que dice "No instalado" indica cómo conseguirlo. La lista muestra los primeros que no están instalados; **Mostrar todo** muestra el resto.

Para añadir uno:

1. Haz clic en **Añadir** al final de su fila. El botón destaca cuando el programa ya está instalado.
2. Si la app sabe cómo instalarlo (Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build y los agentes que necesitan un adaptador ACP), lo instala ahora, en segundo plano. Goose, Kimi CLI y los demás los instalas tú, con el comando o la dirección de su fila.
3. Inicia sesión una vez en el programa del propio agente: abre la [Terminal](/terminal), ejecuta su comando (por ejemplo `gemini`) y sigue su inicio de sesión. Si te lo saltas, una sesión te avisa: "Gemini CLI is not signed in. Run gemini once in a terminal and sign in there, then try again."

El agente aparece ahora en la lista **Se ejecuta en** de la página de inicio.

Para cambiar un agente añadido, haz clic en **Editar**. Para quitarlo, abre su menú **⋯**, elige **Quitar** y confirma: sus sesiones siguen en la lista, pero para continuarlas hay que volver a configurar el agente. Custom viene integrado: su fila dice "Built in: models from OpenRouter, Ollama and vLLM, in Settings → Models" y tiene un botón **Modelos** en lugar de Editar y Quitar.

### Grok Build

**Grok Build** es el agente de programación de xAI (el programa `grok`). Haz clic en **Añadir** en su fila, y nada más: la app lo instala desde npm (`@xai-official/grok`) la primera vez que se necesita, o usa uno que ya esté aquí, incluido uno del instalador propio de xAI en `~/.grok/bin`. Después aparece en **Programas de agentes** y se mantiene actualizado junto con los demás. Hydor lo ejecuta por ACP, con las herramientas propias de la app, las tarjetas de aprobación y los modelos de Grok.

Inicia sesión de forma distinta a los otros agentes ACP: no en la Terminal, sino en [Configuración → Agentes → Cuentas](/settings?s=accounts), donde aparece una fila **Grok Build** en cuanto se añade (consulta [Iniciar sesión en Claude Code, Codex y Grok Build](#sign-claude-code-codex-and-grok-build-in)). Allí también puedes añadir más cuentas de Grok.

### Añadir un agente propio

Cualquier programa que hable ACP puede ejecutarse aquí.

1. Haz clic en **Añadir uno propio**, junto al título de **Tus agentes**.
2. Rellena:
   - **Nombre**: cómo se muestra en las listas, por ejemplo "Gemini CLI".
   - **Comando**: el programa que se inicia, por ejemplo `gemini`, o una ruta completa.
   - **Argumentos**: lo que lo inicia en modo ACP, por ejemplo `--experimental-acp`.
   - **Entorno (opcional, NOMBRE=valor por línea)**: ajustes que el programa necesita, como una variable de clave de API.
3. Haz clic en **Guardar**.

El comando debe iniciar el agente en modo ACP, comunicándose por su entrada y salida estándar.

### Agentes que configuras en su propio programa

Algunos agentes de la lista son programas que configuras tú, y varias cosas difieren respecto a los que la app instala por ti:

- Su fila en **Más agentes** muestra el comando o la dirección con la que instalarlos. La app no ejecuta un script de la web por ti: instálalo tú, en la [Terminal](/terminal) o como indique la fila.
- Inicia sesión una vez en el programa del propio agente, también en la Terminal (por ejemplo, ejecuta su comando y sigue su inicio de sesión, o elige allí su modelo). A partir de entonces la app lo inicia. Guarda sus propias sesiones y memoria en su propia carpeta, y sus tarjetas de aprobación son las que él ofrece.
- Uno de ellos se conecta a un gateway propio: configúralo antes, con el comando de configuración del propio agente, y mantén el gateway en funcionamiento.
- Cuando un agente no habla ACP por sí mismo, necesita un adaptador ACP. La app instala el adaptador junto con el agente, ambos con npm en su propia carpeta, sin ejecutar sus scripts de instalación. Un agente que instalaste tú se usa cuando está en el PATH.
- Un agente que no admite servidores MCP funciona solo con sus propias herramientas: las herramientas de la app (páginas, búsqueda…) no llegan hasta él, y la sesión lo indica al empezar. Aun así recibe las pautas de la app, las notas de memoria y las habilidades con el primer mensaje.

### Lo que los agentes ACP pueden y no pueden hacer aquí

La app abre una sesión en la carpeta que eliges, muestra los mensajes y pasos del agente, y te pregunta siempre que el agente pide permiso. Algunas cosas funcionan de forma distinta que en Claude Code y Codex:

- Admite un mensaje a la vez. Un mensaje que envíes mientras trabaja espera en la cola sobre el cuadro de mensaje y sale cuando termina el turno. (Custom funciona así también.)
- Un agente que no puede reabrir sesiones anteriores empieza de cero cuando continúas una antigua, sin la conversación previa. La sesión lo indica. Lo mismo ocurre cuando un agente podía reabrir una sesión antes pero ya no puede: continúa de cero, con una nota, en lugar de fallar.
- Las imágenes que adjuntas solo le llegan si acepta imágenes.
- Las bifurcaciones y los traspasos no están disponibles (Custom tiene bifurcaciones). Los objetivos sí: el bucle propio de la app los impulsa para todos los agentes.
- Las herramientas de la app (páginas, búsqueda, memoria…) llegan a un agente como un servidor MCP: por dirección cuando el agente lo acepta, y si no, mediante un pequeño programa que la app inicia para él. Un agente que no admite ninguna de ellas funciona solo con sus propias herramientas, pero aun así recibe las pautas, las notas de memoria y las habilidades.

## De dónde vienen los modelos de Custom

Custom ejecuta los modelos de tus planes de Claude y ChatGPT, modelos en esta computadora y modelos en la nube, con las mismas herramientas, habilidades y servidores MCP que los demás agentes. Elige Custom en la página de inicio y luego el modelo. Vienen de tres lugares:

- **Tus suscripciones**: los modelos de tus planes de Claude y ChatGPT, a través de las sesiones iniciadas de Claude Code y Codex en esta computadora. No hay nada que configurar: cuando Claude Code tiene la sesión iniciada, el menú **Modelo** de Custom ofrece Claude Opus, Fable, Sonnet y Haiku (siempre el más reciente de cada uno), y cuando Codex tiene la sesión iniciada con ChatGPT, ofrece los modelos que lista tu plan de ChatGPT (por ejemplo GPT-6 Luna). Un programa que se detecta con la sesión cerrada pierde sus modelos en el menú hasta que vuelvas a iniciar sesión, y Codex con la sesión iniciada mediante una clave de API en lugar de ChatGPT no presta ninguno. Usan el uso de tu plan, no una clave de API ni dinero por token, así que una sesión de Custom con uno de ellos muestra $0 en esos pasos. Se prueba cada cuenta del programa por turnos, como con otros trabajos puntuales: una cuenta que llegó a su límite de uso o que tiene la sesión cerrada pasa el paso a tu siguiente cuenta (con **Cambiar de cuenta en un límite** activado). Una [sesión confidencial](/guide/sessions#keep-a-session-confidential) nunca los usa, porque se ejecutan en los servidores de Anthropic o de OpenAI. Consulta [Custom](/guide/custom#what-custom-is-and-when-to-use-it) para ver cómo responden.
- **En esta computadora**: modelos instalados aquí (Ollama, vLLM) y endpoints de tu red.
- **En la nube**: OpenRouter, endpoints en otros lugares y los modelos en la nube de Ollama.

Puedes elegirlos en cualquier lugar donde se puedan elegir los modelos de Custom: la página de inicio, el menú de modelos de una sesión, los niveles de Custom, el modelo auxiliar, y el modelo de un agente o de una app.

[Configuración → Agentes → Modelos](/settings?s=models) tiene todo lo que necesitan los modelos de Custom. La página tiene siete partes, de arriba abajo:

- **Modelo auxiliar**: el modelo para los trabajos pequeños de la app.
- **Niveles**: un modelo para cada tipo de trabajo (consulta [Niveles: un modelo para cada tipo de trabajo](#tiers-a-model-for-each-kind-of-job)).
- **Tus suscripciones**: una fila para Claude Code y otra para Codex, con los modelos que presta a Custom. Una fila dice "Sesión cerrada: inicia sesión de nuevo para usar estos modelos" con un enlace a **Cuentas**, o "No instalado en esta computadora".
- **En esta máquina**: lo que tiene esta computadora y los modelos instalados aquí.
- **Añadir un modelo de Hugging Face**: busca, comprueba e instala modelos abiertos.
- **OpenRouter**: cientos de modelos con una sola clave, en tres grupos: tu clave, los modelos que añadiste y una búsqueda para añadir más.
- **Entornos de ejecución y endpoints**: Ollama, vLLM, otros servidores compatibles con OpenAI y un token de Hugging Face.

En el menú **Modelo** de Custom, los modelos se agrupan bajo **Tus suscripciones**, **En esta computadora** y **En la nube**, y cada fila indica por dónde llega: "Claude Code", "Codex", "OpenRouter", "Ollama", "vLLM" o el nombre de un endpoint. Pasa el cursor sobre un modelo para ver dónde se ejecuta y cuánto lee a la vez, por ejemplo "OpenRouter · 128K de contexto" o "vLLM, en esta máquina · 32K de contexto · se inicia al usarse". Las listas se actualizan solas cada minuto.

## Elegir el modelo auxiliar

El modelo auxiliar hace trabajos pequeños junto a tus sesiones, fuera de cualquier conversación:

- poner nombre a cada nueva sesión a partir de tu petición (su título en la barra lateral);
- comprobar los pasos en el modo Auto de Custom y juzgar las comprobaciones de un objetivo que un revisor debe encontrar verdaderas (un revisor es un modelo que no hizo nada del trabajo y, en una sesión confidencial, es un modelo en esta computadora);
- ordenar la memoria aproximadamente una vez al día, aprender de las conversaciones desde entonces y titular las notas del índice con el que empiezan los agentes;
- responder una pregunta sobre una página web que el navegador tiene abierta;
- leer los filtros (sitios, fechas, tipos de páginas, idiomas) que indican las palabras de una búsqueda web, antes de que Naget Search busque (consulta [Cómo buscan los agentes en la web](/guide/web#how-agents-search-the-web));
- describir imágenes para un modelo de Custom que no puede verlas;
- resumir una respuesta larga de un subagente de Hydor;
- redactar una app o una tarea programada a partir de una sesión;
- el modo de voz Manos libres.

Abre [Configuración → Agentes → Modelos](/settings?s=models&find=Helper%20model) y haz clic en el menú **Modelo** del grupo **Modelo auxiliar** (su (i) lista los trabajos pequeños):

- **Automático** (el valor predeterminado): Claude Haiku a través de Claude Code, o Codex cuando Claude Code no puede responder. Una cuenta que llegó a su límite de uso pasa primero la pregunta a tu siguiente cuenta con la sesión iniciada (con **Cambiar de cuenta en un límite** activado), y una cuenta con la sesión cerrada se omite. Cuando ninguno de los dos programas puede responder, lo hace uno de tus modelos de Custom (el que nombra el nivel **Rápido** de Custom, o si no el más barato que hayas añadido; los modelos de tus planes se omiten aquí, ya que pasan por los mismos dos programas), y solo cuando nada pudo hacerlo una tarjeta te pide iniciar sesión (consulta [Cuando una cuenta tiene la sesión cerrada](#when-an-account-is-signed-out)). Cuando nada responde, el error dice por qué en cada caso: "Has alcanzado tu límite semanal", un modelo que tu plan de Codex no ofrece…
- Cualquiera de los modelos de Custom, agrupados como en el menú **Modelo** de Custom (**Tus suscripciones**, **En esta computadora** y **En la nube**), con el medio por el que llega (Claude Code, Codex, OpenRouter, Ollama, vLLM o el nombre de un endpoint) y "Ve imágenes" para los que pueden ver. Un modelo de tu plan de Claude o ChatGPT también puede ser el auxiliar: responde a través de Claude Code o Codex con el uso de tu plan.

Automático no puede mirar imágenes. Si usas Custom con un modelo que no ve imágenes, elige un modelo auxiliar que sí las vea, o Custom no podrá describir tus imágenes.

## Ver qué puede ejecutar esta computadora

La sección **En esta máquina** de [Configuración → Agentes → Modelos](/settings?s=models&find=On%20this%20machine) empieza con un resumen de esta computadora:

- **Gráficos**: las tarjetas gráficas (GPU) y su memoria; en una Mac con Apple silicon, su chip ("Apple M3 Max", cuyos gráficos comparten la memoria de la computadora); o "Sin GPU" (los modelos se ejecutan entonces en el procesador).
- **Memoria y disco**: la memoria de la computadora, total y libre, y el espacio libre del disco con lo que ocupan los modelos instalados.
- **Se ejecuta con**: si **Ollama** y **vLLM** están instalados, con sus versiones, o un enlace para instalarlos.
- Con una tarjeta gráfica, qué tan grande es el modelo que cabe: "Caben unos 30B parámetros a 4 bits en una GPU" (en una Mac: "Caben unos 40B parámetros a 4 bits"). Los parámetros son una medida del tamaño de un modelo; 4 bits es una forma comprimida común que necesita aproximadamente la cuarta parte de la memoria.

Debajo:

- **Descargas en curso**, cada una con una barra de progreso, cuánto se ha hecho y si es para Ollama o vLLM. **Cancelar** detiene una. Una descarga fallida o cancelada muestra el motivo, con **Descartar**.
- **Modelos instalados** (los primeros, luego **Mostrar todo**), cada uno con su entorno de ejecución (Ollama o vLLM), tamaño, detalles (como su tamaño y compresión en los modelos de Ollama), "Ve imágenes" cuando puede, y si se está ejecutando.
  - Un modelo de vLLM tiene **Inicio** y **Detener**. Se inicia solo cuando una sesión lo usa por primera vez (el primer inicio tarda uno o dos minutos), en la tarjeta gráfica con más memoria libre (a 8 bits cuando no cabría en ella tal como es), o repartido entre 2, 4 u 8 de ellas cuando ninguna tarjeta tiene espacio suficiente ("ejecutándose en las GPU 1, 2"); en una Mac, en su Apple silicon. Sigue ejecutándose, incluso cuando la app se reinicia, hasta que hagas clic en **Detener**. Si no puede iniciarse, el motivo aparece debajo.
  - **Quitar**, en el menú **⋯** del modelo, elimina los archivos del modelo de esta computadora, después de que confirmes. Puedes instalarlo de nuevo más tarde.

Cuando aún no hay ninguno: "Todavía no hay modelos aquí: añade uno desde Hugging Face más abajo."

## Añadir un modelo de Hugging Face

Hugging Face es el sitio principal de modelos abiertos. El grupo [Añadir un modelo de Hugging Face](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) (sugeridos para esta computadora, o busca en todo el sitio) sugiere algunos, busca en él y te dice, antes de descargar nada, cómo se ejecutaría cada modelo en esta computadora.

### Sugeridos para esta computadora

Antes de buscar, el grupo lista los modelos que la app recomienda y que se ejecutan en esta computadora, según lo que tenga:

- **LFM3-VL 2B** (Liquid AI): pequeño y rápido, y lee imágenes. Se ejecuta en casi cualquier computadora.
- **Gemma 4 12B** (Google): un modelo versátil y capaz que lee imágenes, para una computadora con una buena tarjeta gráfica.
- **Flint** (Recursive): hecho para agentes de programación, para una Mac con Apple silicon y 32 GB o más.
- **GLM-5.3 Flash** (Z.ai): entre los modelos abiertos más potentes, para un servidor con varias tarjetas gráficas grandes.

Cada uno muestra si se ejecuta bien o lento aquí, cómo se ejecutaría ("vLLM a 8 bits, en la GPU 0", "vLLM, repartido entre 2 GPU", "vLLM, en Apple silicon"), su tamaño de descarga y **Instalar**. **Lo mejor aquí** marca el más potente que se ejecuta bien. Se ejecutan con vLLM de forma predeterminada; una computadora sin tarjeta gráfica NVIDIA ni Apple silicon recibe en su lugar la versión para Ollama del pequeño. Después aparece una advertencia cuando lo que los ejecuta aún no está configurado ("vLLM no está configurado", "Ollama no se está ejecutando"): consulta [Conectar Ollama, vLLM u otro endpoint](#connect-ollama-vllm-or-another-endpoint). La fila **2 más para computadoras más grandes** (o el número que sea) muestra los demás, con lo que necesita cada uno. El recorrido de bienvenida sugiere los mismos.

### Buscar y filtrar

1. Escribe en **Busca en Hugging Face o pega org/nombre**: un nombre como `qwen3`, o el nombre completo de un modelo (`org/name`) o su dirección de huggingface.co. Antes de escribir, sugiere algunos nombres, o **ver los más descargados**.
2. Reduce la lista con los filtros (puedes combinarlos):
   - **Se ejecuta bien aquí**: solo los modelos que se ejecutarían bien en esta computadora.
   - **GGUF · Ollama**: modelos en formato GGUF, que Ollama ejecuta.
   - **vLLM**: modelos en formato safetensors, que vLLM ejecuta en una tarjeta gráfica.
   - **Ve imágenes**: modelos que además leen imágenes.
3. Cambia el orden con el menú de la derecha: **Más descargados**, **Tendencias**, **Más gustados** o **Más reciente**.

Obtienes hasta 40 modelos, los primeros ocho al principio y **Mostrar todo** para el resto. Un modelo que escribiste completo aparece primero, aunque la búsqueda no lo liste, y pulsar Intro lo comprueba de inmediato.

Cada fila muestra el creador y el nombre, su formato (**GGUF** o **vLLM**), **Imágenes** si ve imágenes, **Restringido** si su creador te pide aceptar antes unos términos, su tamaño en parámetros, las descargas de los últimos 30 días, los me gusta y cuándo cambió por última vez.

### El primer veredicto

Debajo de cada modelo, una etiqueta de color da una primera estimación solo por su tamaño:

- **Se ejecuta bien con vLLM** o **Se ejecuta bien con Ollama**, con una velocidad aproximada ("unos 40 tokens/s"; un token es un trozo de palabra): cabe en la memoria de tu tarjeta gráfica.
- **En el procesador, lento** o **En el procesador, muy lento**: solo cabe en la memoria de la computadora, así que se ejecuta en el procesador. Solo Ollama puede hacerlo.
- **Demasiado grande para esta computadora**: no cabe, o la descarga no cabe en el disco.
- **A 4 bits con Ollama: se ejecuta bien…**: el modelo tal como está almacenado es demasiado grande, pero su versión comprimida a 4 bits se ejecutaría bien con Ollama.

Pasa el cursor sobre la etiqueta para ver los números que hay detrás.

### Comprobar antes de descargar

Haz clic en **Comprobar** en un modelo para ver exactamente cómo se ejecutaría aquí. El panel muestra su tamaño, cuánto lee a la vez (su contexto), si ve imágenes y luego:

- Para un modelo GGUF: "Se ejecuta con Ollama" y cada tamaño disponible (los archivos más pequeños sacrifican un poco de calidad a cambio de velocidad y memoria), del más pequeño al más grande. Cada línea da su veredicto, la memoria que necesita, aproximadamente qué tan rápido se ejecutaría y el tamaño de descarga, con un botón **Instalar**. Instalar aparece en gris mientras Ollama no se esté ejecutando aquí, o para un tamaño que es demasiado grande.
- Para un modelo de vLLM: "Se ejecuta con vLLM, que lo inicia en una GPU cuando lo usa una sesión", las mismas cifras, notas sobre qué tarjeta gráfica usaría y un botón **Descargar**. Si vLLM no está instalado, o tu vLLM aún no puede ejecutar este tipo de modelo, lo dice, y cuando existe una versión GGUF ofrece **comprobar** esa en su lugar.
- Para cualquier otra cosa: "No hay pesos que esta app pueda ejecutar (safetensors para vLLM, GGUF para Ollama)."

Las cifras suponen una conversación de hasta unos 32.000 tokens, la longitud que se da a un modelo en esta computadora. **Cerrar** pliega el panel.

### Instalar y qué pasa después

Haz clic en **Instalar** (Ollama) o **Descargar** (vLLM). La descarga aparece en **En esta máquina** con su progreso. Cuando termina, el modelo aparece en el menú **Modelo** de Custom. Una descarga de vLLM que se cortó continúa donde se detuvo cuando lo intentas de nuevo. Un modelo de vLLM demasiado grande para cualquier tarjeta gráfica se almacena a 8 bits (FP8) al iniciarse, lo que reduce a la mitad la memoria que ocupan sus pesos con poca pérdida (a partir de las tarjetas de la serie RTX 30 de NVIDIA y la A100); si aun así no cabe, se reparte entre varias tarjetas, si juntas tienen espacio.

### Modelos restringidos y privados

Algunos creadores piden que aceptes primero sus términos; sus modelos muestran **Restringido**. Acepta los términos en la página del modelo en huggingface.co y luego añade un token de Hugging Face (consulta [Token de Hugging Face](#hugging-face-token)). Los modelos privados también necesitan el token.

## Usar modelos a través de OpenRouter

OpenRouter (openrouter.ai) te da cientos de modelos de muchos fabricantes con una sola clave, que se paga por uso.

### Añade tu clave

1. Consigue una clave en openrouter.ai (el enlace de la sección lleva allí).
2. En [Configuración → Agentes → Modelos](/settings?s=models&find=OpenRouter), haz clic en **Añadir clave** en la fila **Tu clave de OpenRouter**, pégala en **Tu clave de OpenRouter: sk-or-…** en el diálogo y haz clic en **Guardar**.

Entonces la fila muestra **Conectado a OpenRouter** con el principio y el final de tu clave. **Quitar clave**, en su menú **⋯**, hace que se olvide la clave. La clave se queda en el servidor y no se vuelve a mostrar.

También puedes añadirla cuando se necesite por primera vez: un agente que va a crear una imagen, un dibujo, un video o un sonido sin tenerla te la pide en una tarjeta de la conversación ([Cuando un agente necesita la clave de OpenRouter](/guide/documents-voice#when-an-agent-needs-the-openrouter-key)), y las herramientas de IA de los editores te la piden en su diálogo. De cualquiera de las dos formas, se guarda aquí.

### Modelos sugeridos

Antes de buscar, **Sugeridos**, en el grupo **Añadir modelos de OpenRouter**, muestra cuatro modelos para Custom, cada uno con su motivo: **GPT-6 Luna** (rápido y barato), **Grok 4.7** (bueno, con menos rechazos), **GPT-6.1 Sol** (mejor) y **Claude Opus 5.5** (el mejor en general). **Añadir** pone uno en los selectores. Para imágenes, música, voces y videos, las opciones de la app son Seedream 5.0 Pro (y Flash, más rápido y barato), Lyria 3 Pro, Seed Audio 1.0 y Seedance 2.5: consulta [Configuración → Capacidades → Imágenes, video y audio](/settings?s=images).

### Buscar en el catálogo

En el mismo grupo, escribe en **Buscar en OpenRouter: deepseek, qwen, claude…**, o haz clic en uno de los nombres sugeridos, o en **ver los más nuevos**. Filtros:

- **Llamadas a herramientas**: modelos que llaman a herramientas de forma nativa, que es como mejor las usa Custom (**Mejor coincidencia** los pone primero).
- **Ve imágenes**
- **Razonamiento**: modelos que piensan antes de responder.
- **Libre**

El menú de la derecha ordena los resultados: **Mejor coincidencia** (mientras buscas por nombre), **Más reciente**, **Más barato** o **Contexto más largo**. Obtienes hasta 50 modelos, los ocho primeros al principio y **Mostrar todo** para el resto.

Cada modelo muestra su fabricante, su nombre y etiquetas: **Último** (siempre la versión más nueva del fabricante), **Nueva** (publicado en las últimas tres semanas), **Libre**, **Razonamiento**, **Imágenes** y **Sin herramientas nativas** (Custom entonces describe sus herramientas en las instrucciones y lee sus llamadas a partir de su texto). Debajo: cuánto lee de una vez ("128K context"), su respuesta más larga ("16K out"), su precio por millón de tokens de entrada y de salida, el mes en que se publicó, una descripción breve y su nombre en OpenRouter.

### Añadir modelos a los selectores

Haz clic en **Añadir** en un modelo. Su fila pasa a decir **Añadido**, y el modelo aparece en el grupo **Tus modelos de OpenRouter** ("In the model pickers") encima de la búsqueda y en el menú **Modelo** de Custom. Haz clic en la × de uno de ellos para quitarlo de los menús. Hasta que añadas al menos uno, OpenRouter no ofrece ningún modelo ("Add at least one model to use OpenRouter.").

## Conectar Ollama, vLLM u otro endpoint

El grupo **Entornos de ejecución y endpoints** conecta los programas que ejecutan modelos. Ábrelo en [Configuración → Agentes → Modelos](/settings?s=models&find=Runtimes%20and%20endpoints).

### Ollama

Ollama es un programa gratuito que ejecuta modelos en tu computadora, con la tarjeta gráfica o con el procesador. Su fila dice "running" con su versión, o "not running at this address" con un enlace **Instalar Ollama**. Su dirección es `http://127.0.0.1:11434` a menos que la cambies: escribe otra en el campo, y **Guardar** aparece a su lado. Todos los modelos de ese Ollama aparecen en la lista de modelos de Custom, incluidos los que descargaste fuera de la app.

### vLLM

vLLM es un servidor rápido para modelos en tarjetas gráficas NVIDIA, y la forma en que se ejecutan aquí por defecto los modelos de Hugging Face. Un modelo demasiado grande para una sola tarjeta se ejecuta en ella a 8 bits, o repartido entre 2, 4 u 8 tarjetas. En una Mac, vLLM se ejecuta en Apple silicon con su complemento Metal (vllm-metal). La app lo encuentra sola en el PATH o en un entorno conda o venv, y muestra su versión y dónde está. Si dice "not found (pip install vllm), or give its command", instálalo, o escribe la ruta completa de su comando `vllm` en el campo y haz clic en **Guardar** (aparece cuando escribes). Deja el campo vacío para que la app lo busque sola.

### Otros endpoints compatibles con OpenAI

Muchos programas y servicios responden igual que la API de OpenAI: LM Studio, el servidor de llama.cpp, otros proveedores. Para añadir uno:

1. Haz clic en **Añadir endpoint**, junto al título del grupo.
2. En el diálogo, escribe un **Nombre**, su dirección (como `http://localhost:1234/v1`) y una **Clave (opcional)**.
3. Haz clic en **Añadir**.

El endpoint aparece como una fila con su dirección y cuántos modelos ofrece. Sus modelos aparecen en la lista de Custom como "modelo (nombre)". La × lo quita. Si añades otro endpoint con el mismo nombre, reemplaza al primero.

Una [sesión confidencial](/guide/sessions#keep-a-session-confidential) puede usar un endpoint cuya dirección sea esta computadora o tu red privada: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, de `172.16.…` a `172.31.…`, o un nombre que termine en `.local`. Cualquier otra dirección cuenta como en línea, incluso si lleva a tu propio servidor: usa en su lugar su dirección privada. Lo mismo vale para la dirección de Ollama, y los modelos en la nube de Ollama (sus nombres terminan en "cloud") siempre cuentan como en línea.

### Token de Hugging Face

Un [token de Hugging Face](/settings?s=models&find=Hugging%20Face%20token) permite a la app descargar modelos restringidos o privados (la fila dice "Only for gated or private models"). Crea uno en la configuración de tu cuenta de Hugging Face, haz clic en **Añadir token**, pégalo en el diálogo (empieza por `hf_`) y haz clic en **Guardar**. Entonces la fila muestra su principio y su final, con **Quitar token** en su menú **⋯**.

## Pregunta a un agente

- "¿Qué programas de agentes están instalados aquí? Instala Gemini CLI."
- "¿Claude Code y Codex están actualizados? Actualízalos ahora."
- "Añade OpenCode a mis agentes."
- "Añade Grok Build a mis agentes e inicia su sesión con mi suscripción de Grok."
- "Añade una segunda cuenta de Grok para el trabajo y empieza mi próxima sesión con ella."
- "Empieza mi próxima sesión de Grok con esfuerzo xhigh."
- "¿Cuánto me queda esta semana de mi plan de Grok?"
- "Usa todas mis cuentas de Grok: cuando una llegue a su límite, sigue con otra."
- "Añade Gemini CLI y Goose a mis agentes y dime qué me falta por instalar."
- "Busca en Hugging Face un modelo que funcione bien en esta computadora y que vea imágenes, compruébalo e instala el mejor tamaño."
- "Añade a mis modelos el DeepSeek más nuevo de OpenRouter." (cuando ya tengas tu clave de OpenRouter)
- "Haz que el modelo auxiliar sea uno que vea imágenes."
- "Usa el Sonnet de mi plan de Claude en una sesión de Custom y muéstrame cuánto cuesta."
- "Detén el modelo de vLLM que se está ejecutando, para liberar la tarjeta gráfica."
- "Usa todas mis cuentas de Claude: cuando una llegue a su límite, sigue con otra."
- "Cuando se agoten todas mis cuentas de Claude, sigue con mi crédito de API."
- "¿Qué modelo usa cada nivel en Claude Code y Codex? Haz que Máximo signifique Opus en Claude Code."
- "¿Qué modelos usan los niveles de Custom y por qué Mejor está vacío?"
- "¿Por qué Hydor me pide iniciar sesión otra vez en Claude Code?"
- "Mi cuenta de Claude Code tiene la sesión cerrada: ¿qué sesiones mías la están esperando y pueden seguir con otra cuenta?"
