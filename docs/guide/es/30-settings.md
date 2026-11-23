# Todos los ajustes

Cada sección de la configuración y lo que contiene, en el orden en que la app las muestra, con un enlace a cada una y a la parte de esta guía que la explica. Úsala para encontrar dónde se ajusta algo; los temas explican cómo usarlo.

## Cómo está organizada la configuración

Abre **Configuración** desde la barra de iconos. En una computadora, la configuración tiene una columna a la izquierda, como la de la Biblioteca, con todas las secciones en una lista bajo tres encabezados: **App** (la app en sí), **Agentes** (los agentes y lo que leen) y **Capacidades** (lo que la app añade a cada agente: la búsqueda, el navegador, la memoria y lo demás). Haz clic en una sección y ocupa la página, bajo su título. **Ocultar barra lateral** (Ctrl+B) oculta la columna, y **Mostrar barra lateral**, al principio del título, la vuelve a mostrar. En un teléfono, la configuración muestra todas las secciones en una lista; toca una para abrirla, y la flecha de arriba para volver.

No hace falta saber dónde está una opción: escribe lo que buscas en el cuadro de búsqueda (Ctrl+K, ⌘K en una Mac), por ejemplo "modo oscuro" o "notificaciones", y elígelo. La app abre la sección correcta y señala la opción. También puedes pedirle a cualquier agente que cambie un ajuste por ti ([Deja que los agentes manejen la app por ti](/guide/ask-agents)).

## App

### General

[Configuración → General](/settings?s=general): tema y qué hace Enter mientras un agente trabaja. Más en [Aspecto, idioma y actualizaciones](/guide/app).

- [**Apariencia**](/settings?s=general&find=Appearance): Oscuro, claro o siguiendo tu dispositivo; o un tema propio.
- [**Nuevo tema**](/settings?s=general&find=New%20theme): Crea un tema propio a partir de cualquiera de ellos.
- [**Importar**](/settings?s=general&find=Import): Agregar un tema que alguien compartió.
- [**Idioma**](/settings?s=general&find=Language): El idioma en que se muestra la app y en que escriben los agentes.
- [**Movimiento**](/settings?s=general&find=Motion): Cuánto se mueve la app: completo, tranquilo (nada se desliza ni se desvanece al abrir una página o una ventana) o ninguno.
- [**Tamaño del texto**](/settings?s=general&find=Text%20size): Tamaño de los mensajes, las páginas de Ayuda y el cuadro donde escribes en este dispositivo: predeterminado, grande o más grande.
- [**Enviar mientras un agente trabaja**](/settings?s=general&find=Sending%20while%20an%20agent%20works): Enter se une al turno en curso, o espera a que termine.
- [**Sugerencias en la terminal**](/settings?s=general&find=Terminal%20suggestions): Sugerencias grises tras el cursor en las terminales.
- [**Reanudar tras los límites de uso**](/settings?s=general&find=Resume%20after%20usage%20limits): Continúa una sesión un minuto después de que se restablece el límite de un plan.
- [**Eliminar sesiones inactivas**](/settings?s=general&find=Delete%20inactive%20sessions): Elimina las sesiones que nadie usó en un año, o el tiempo que elijas; hasta entonces se conservan todas las conversaciones.
- [**Limitar cada sesión**](/settings?s=general&find=Limit%20each%20session): La mayor cantidad de memoria y procesadores que pueden usar los programas de una sesión.
- [**Iniciar cuando arranque esta computadora**](/settings?s=general&find=Start%20when%20this%20computer%20starts): Inicia la app cuando se enciende la computadora.
- [**Mantener la computadora activa**](/settings?s=general&find=Keep%20the%20computer%20awake): En las apps de escritorio, la computadora no se suspende sola mientras los agentes trabajan ni antes de las tareas programadas.
- [**Actualizar automáticamente**](/settings?s=general&find=Update%20automatically): Instala versiones nuevas por sí sola: las apps de escritorio en cuanto salen, con un minuto de aviso; una copia desde git cuando llevas un tiempo sin usarla.
- [**Hacer el recorrido**](/settings?s=general&find=Take%20the%20tour): Ver qué hace cada parte de la app.
- [**Consejos**](/settings?s=general&find=Tips): Señala una parte de la app la primera vez que llegas a ella, después del recorrido de bienvenida.
- [**Ideas para empezar**](/settings?s=general&find=Starter%20ideas): Ejemplos, tus apps y una automatización bajo el cuadro de mensaje vacío de la página de inicio.
- [**Comprobar ahora**](/settings?s=general&find=Check%20now): Buscar ahora una versión más reciente.

### Notificaciones

[Configuración → Notificaciones](/settings?s=notifications): cuando una sesión termina, falla o necesita tu respuesta. Más en [Bandeja de entrada y notificaciones](/guide/inbox).

- [**Notificar a este dispositivo**](/settings?s=notifications&find=Notify%20this%20device): Un aviso cuando una sesión termina, falla o necesita tu respuesta, incluso con la app cerrada.
- [**Sonido**](/settings?s=notifications&find=Sound): Un breve sonido con cada aviso mientras la app está abierta.
- [**Enviar una prueba**](/settings?s=notifications&find=Send%20a%20test): Enviar un aviso a este dispositivo ahora.

### Usar en tu teléfono

[Configuración → Usar en tu teléfono](/settings?s=phone): abre la app en tu propio teléfono, de forma privada con Tailscale, y recibe allí sus notificaciones. Más en [Teléfonos, otras máquinas y compartir](/guide/devices).

- [**Servir en mis dispositivos**](/settings?s=phone&find=Serve%20it%20on%20my%20devices): Publica la app por HTTPS solo para los dispositivos con sesión iniciada en tu cuenta de Tailscale, nunca en internet público.
- [**Tailscale en esta computadora**](/settings?s=phone&find=Tailscale%20on%20this%20computer): Si Tailscale está instalado y con la sesión iniciada aquí, y el nombre de esta computadora en tu tailnet.
- [**Ábrela en tu teléfono**](/settings?s=phone&find=Open%20it%20on%20your%20phone): Un código QR con la dirección de la app para la cámara de tu teléfono, y los pasos en el teléfono.
- [**Dejar de servir**](/settings?s=phone&find=Stop%20serving): Quita la app de tu tailnet, deshaciendo exactamente lo que hizo Servir en mis dispositivos.
- [**Añadir a pantalla de inicio**](/settings?s=phone&find=Add%20to%20Home%20Screen): En el teléfono: Hydor con su propio icono, a pantalla completa; las notificaciones del iPhone lo necesitan.

### Apps de chat

[Configuración → Apps de chat](/settings?s=chat): habla con tus agentes desde Telegram, Discord o Slack: empieza sesiones, envía fotos, archivos y mensajes de voz, recibe sus respuestas y responde a lo que te pregunten. Más en [Teléfonos, otras máquinas y compartir](/guide/devices).

- [**Telegram**](/settings?s=chat&find=Telegram): Un bot de Telegram propio, creado con @BotFather, con el que hablan tus chats.
- [**Discord**](/settings?s=chat&find=Discord): Un bot de Discord propio, creado en el Developer Portal, con el que hablan tus chats.
- [**Slack**](/settings?s=chat&find=Slack): Una app de Slack propia, creada desde un manifiesto, con la que hablan tus chats.
- [**Vincular un chat**](/settings?s=chat&find=Link%20a%20chat): Permite que un chat de Telegram, Discord o Slack use tus agentes, con un código que sirve una sola vez.
- [**Añadir el bot a un servidor**](/settings?s=chat&find=Add%20the%20bot%20to%20a%20server): El enlace que añade tu bot de Discord a un servidor tuyo, con los permisos que necesita.
- [**Copiar manifiesto**](/settings?s=chat&find=Copy%20manifest): El manifiesto de la app de Slack, con Socket Mode y los permisos que necesita, para pegarlo al crear la app.
- [**Las sesiones nuevas usan**](/settings?s=chat&find=New%20sessions%20use): El agente con el que empieza un mensaje de un chat cuando el chat no está en ninguna sesión.
- [**Las sesiones nuevas como**](/settings?s=chat&find=New%20sessions%20as): Uno de tus agentes con el que empieza una nueva sesión desde un chat; /as en el chat elige otro.
- [**Avisos de todas las sesiones**](/settings?s=chat&find=Notices%20from%20every%20session): Los avisos de todas las sesiones en tus chats, no solo los de las sesiones que empezó un chat.

### Contraseña

[Configuración → Contraseña](/settings?s=security): la contraseña de esta app y el cierre de sesión. Más en [Aspecto, idioma y actualizaciones](/guide/app).

- [**Cambiar contraseña**](/settings?s=security&find=Change%20password): Al cambiarla se cierra la sesión en todos los demás navegadores.
- [**Cerrar sesión en este navegador**](/settings?s=security&find=Sign%20out%20of%20this%20browser): Necesitas la contraseña para volver.

### Firmas

[Configuración → Firmas](/settings?s=signatures): tu firma y tus iniciales, dibujadas una vez y guardadas cifradas, para los documentos que firmes. Más en [Páginas, documentos e imágenes](/guide/library).

- [**Nueva firma**](/settings?s=signatures&find=New%20signature): Dibuja, escribe o sube tu firma o tus iniciales.

### Control de código fuente

[Configuración → Control de código fuente](/settings?s=scm): cuentas de GitHub y Gitea para abrir pull requests. Más en [Teléfonos, otras máquinas y compartir](/guide/devices).

- [**Añadir una cuenta**](/settings?s=scm&find=Add%20an%20account): Una cuenta con la que abrir pull requests.

### Conectar otros agentes

[Configuración → Conectar otros agentes](/settings?s=connect): permite que agentes de otros lugares inicien y dirijan sesiones aquí, mediante el servidor MCP de esta app. Más en [Teléfonos, otras máquinas y compartir](/guide/devices).

- [**Nuevo token**](/settings?s=connect&find=New%20token): Un token para que un agente de otro lugar inicie y dirija sesiones aquí.
- [**Qué pueden hacer**](/settings?s=connect&find=What%20they%20can%20do): Las herramientas que recibe un agente con un token.

### Máquinas

[Configuración → Máquinas](/settings?s=machines): otras máquinas con Hydor, para usar desde aquí, y el acceso a esta. Más en [Teléfonos, otras máquinas y compartir](/guide/devices).

- [**Añadir una máquina**](/settings?s=machines&find=Add%20a%20machine): Otra máquina con Hydor, para usar desde aquí.
- [**Acceso desde otras máquinas**](/settings?s=machines&find=Access%20from%20other%20machines): Tokens que usan otras máquinas para conectarse a esta.

## Agentes

### Cuentas

[Configuración → Cuentas](/settings?s=accounts): los inicios de sesión de Claude Code, Codex, Grok Build y Antigravity CLI que usan todas las sesiones. Más en [Agentes, cuentas y modelos](/guide/agents-models).

- [**Cuentas**](/settings?s=accounts&find=Accounts): Los inicios de sesión de Claude Code, Codex, Grok Build y Antigravity CLI que usan las sesiones, y más que puedes añadir.
- [**Cambiar de cuenta en un límite**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit): Una sesión que se queda sin uso continúa con otra cuenta.
- [**Usar crédito de API en un límite**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit): Cuando todas las cuentas de Claude Code llegan a su límite, las sesiones siguen con cargo a una clave de API de Anthropic.
- [**Programas de agentes**](/settings?s=accounts&find=Agent%20programs): Qué programas de agentes están instalados, entre ellos Grok Build, e instalación de los demás.
- [**Actualizar automáticamente**](/settings?s=accounts&find=Update%20automatically): Mantiene Claude Code, Codex y los demás programas de agentes en su versión más reciente.

### Más agentes

[Configuración → Más agentes](/settings?s=agents): Gemini CLI, Antigravity CLI, Grok Build, OpenCode, Goose y otros agentes que usan ACP. Más en [Agentes, cuentas y modelos](/guide/agents-models).

- [**Tus agentes**](/settings?s=agents&find=Your%20agents): Agentes que aparecen junto a Claude Code y Codex.
- [**Añadir uno propio**](/settings?s=agents&find=Add%20your%20own): Cualquier agente que hable ACP, mediante su comando.
- [**Agentes que hablan ACP**](/settings?s=agents&find=Agents%20that%20speak%20ACP): Gemini CLI, Antigravity CLI, OpenCode, Qwen Code, Goose y Grok Build, listos para añadir.

### Modelos

[Configuración → Modelos](/settings?s=models): modelos para Custom, el agente propio de la app: tus planes de Claude y ChatGPT mediante Claude Code y Codex, modelos en esta computadora, y OpenRouter u otros proveedores en la nube. Más en [Agentes, cuentas y modelos](/guide/agents-models).

- [**Modelo auxiliar**](/settings?s=models&find=Helper%20model): El modelo para trabajos pequeños junto a las sesiones.
- [**Niveles**](/settings?s=models&find=Tiers): El modelo que significan Rápido, Estándar, Mejor y Máximo para cada programa: una sesión dirige con Mejor o Máximo, y sus subagentes usan Estándar y Rápido.
- [**Liderar con subagentes**](/settings?s=models&find=Lead%20with%20subagents): El agente principal de una sesión planifica, entrega partes claras a subagentes en niveles más económicos y revisa su trabajo.
- [**Máximo para problemas difíciles**](/settings?s=models&find=Max%20for%20hard%20problems): Un agente principal en Automático puede subir él mismo a Máximo cuando un problema resulta más difícil de lo que Mejor puede manejar.
- [**Tus suscripciones**](/settings?s=models&find=Your%20subscriptions): Los modelos de tus planes de Claude y ChatGPT, que Custom puede usar mediante Claude Code y Codex.
- [**En esta máquina**](/settings?s=models&find=On%20this%20machine): Modelos instalados aquí y sus descargas.
- [**Añadir un modelo de Hugging Face**](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face): Los sugeridos para esta computadora, o busca, mira cómo funcionaría cada uno aquí e instálalo.
- [**OpenRouter**](/settings?s=models&find=OpenRouter): Modelos a través de OpenRouter, con tu clave.
- [**Entornos de ejecución y endpoints**](/settings?s=models&find=Runtimes%20and%20endpoints): Ollama, vLLM y otros endpoints compatibles con OpenAI.
- [**Token de Hugging Face**](/settings?s=models&find=Hugging%20Face%20token): Solo para modelos restringidos o privados.

### Pautas de los agentes

[Configuración → Pautas de los agentes](/settings?s=guidelines): lo que siguen todos los agentes: en cada sesión, en un proyecto o en una sesión. Más en [Pautas de los agentes](/guide/guidelines).

- [**Para todas las sesiones**](/settings?s=guidelines&find=For%20every%20session): Lo que sigue todo agente, en todas las sesiones.
- [**Para un proyecto**](/settings?s=guidelines&find=For%20a%20project): Pautas que siguen las sesiones de un proyecto.
- [**Para una sesión**](/settings?s=guidelines&find=For%20one%20session): Pautas de una sesión, desde la página de inicio o el menú de la sesión.
- [**Archivos de instrucciones**](/settings?s=guidelines&find=Instruction%20files): CLAUDE.md y AGENTS.md, que Claude Code y Codex leen por su cuenta.

### Servidores MCP

[Configuración → Servidores MCP](/settings?s=mcp): herramientas que los agentes pueden llamar. Más en [Apps conectadas, claves y herramientas](/guide/connections).

- [**Añadir servidor**](/settings?s=mcp&find=Add%20server): Un servidor de herramientas para Claude Code o Codex.
- [**Comprobar conexiones**](/settings?s=mcp&find=Check%20connections): Ver si cada servidor MCP responde.

### Habilidades

[Configuración → Habilidades](/settings?s=skills): métodos escritos que los agentes cargan cuando una tarea lo requiere: integrados, tuyos, de complementos y los propios de los agentes. Más en [Habilidades](/guide/skills).

- [**Nueva habilidad**](/settings?s=skills&find=New%20skill): Escribe una habilidad para todos los agentes, o solo para Claude Code o Codex.
- [**Integrado**](/settings?s=skills&find=Built%20in): Las habilidades que vienen con la app.
- [**Tuyos**](/settings?s=skills&find=Yours): Habilidades que escribiste, o que aprobaste cuando un agente las sugirió.
- [**De plugins**](/settings?s=skills&find=From%20plugins): Habilidades que traen tus plugins.
- [**Claude Code y Codex**](/settings?s=skills&find=Claude%20Code%20and%20Codex): Habilidades propias de los agentes, que solo ellos reciben.
- [**Sugerir habilidades que encajen**](/settings?s=skills&find=Suggest%20skills%20that%20fit): El agente de una sesión nueva se entera de qué habilidades encajan con su primer mensaje.
- [**Activar habilidades por palabras clave**](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords): Las palabras clave de un mensaje cargan habilidades por sí solas.
- [**Crear mi propia versión**](/settings?s=skills&find=Make%20my%20own%20version): Cambia una habilidad integrada: tu versión ocupa su lugar.

### Plugins

[Configuración → Plugins](/settings?s=plugins): complementos que aportan habilidades, herramientas e instrucciones a todos los agentes. Más en [Apps conectadas, claves y herramientas](/guide/connections).

- [**Tus plugins**](/settings?s=plugins&find=Your%20plugins): Los plugins que añadiste, activados o desactivados para todos los agentes.
- [**Vienen con la app**](/settings?s=plugins&find=Come%20with%20the%20app): Plugins que vienen con la app, listos para añadir.
- [**Crear un plugin**](/settings?s=plugins&find=Make%20a%20plugin): Reúne habilidades, herramientas, instrucciones y archivos propios en un plugin.
- [**Desde un enlace**](/settings?s=plugins&find=From%20a%20link): Agregar un plugin desde GitHub u otra dirección de Git.
- [**Desde un archivo .zip**](/settings?s=plugins&find=From%20a%20.zip%20file): Agregar un plugin que alguien empaquetó en un .zip.
- [**Empaquetar en un .zip**](/settings?s=plugins&find=Pack%20into%20a%20.zip): Un plugin como un solo archivo para compartir.
- [**Claude Code**](/settings?s=plugins&find=Claude%20Code): Los plugins y marketplaces propios de Claude Code.
- [**Codex**](/settings?s=plugins&find=Codex): Los plugins y marketplaces propios de Codex.

### Tareas programadas

[Configuración → Tareas programadas](/settings?s=tasks): trabajo de los agentes que empieza solo: con un horario, una vez o cuando llama un webhook. Más en [Tareas programadas](/guide/tasks).

- [**Nueva tarea**](/settings?s=tasks&find=New%20task): Trabajo de agentes que empieza solo.
- [**Vista semanal**](/settings?s=tasks&find=Week%20view): Todo lo que se ejecuta solo, en una semana: lo que se ejecutó y lo que se ejecutará.
- [**Empezar desde un ejemplo**](/settings?s=tasks&find=Start%20from%20an%20example): Tareas programadas listas para usar.
- [**Resumen matutino**](/settings?s=tasks&find=Morning%20brief): Una tarea programada lista para usar.
- [**Noticias sobre un tema**](/settings?s=tasks&find=News%20on%20a%20topic): Una tarea programada lista para usar.
- [**Vigilancia de precios**](/settings?s=tasks&find=Price%20watch): Una tarea programada lista para usar.
- [**Alerta de cambios en una página**](/settings?s=tasks&find=Page%20change%20alert): Una tarea programada lista para usar.
- [**Informe semanal de una carpeta**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): Una tarea programada lista para usar.
- [**Resumen de la bandeja de entrada**](/settings?s=tasks&find=Inbox%20digest): Una tarea programada lista para usar.
- [**Seguimiento de hábito**](/settings?s=tasks&find=Habit%20check-in): Una tarea programada lista para usar.
- [**Nuevas versiones**](/settings?s=tasks&find=New%20releases): Una tarea programada lista para usar.
- [**Comprobación de sitio activo**](/settings?s=tasks&find=Site%20up%20check): Una tarea programada lista para usar.
- [**Alerta de espacio en disco**](/settings?s=tasks&find=Disk%20space%20alert): Una tarea programada lista para usar.
- [**Revisar pull requests nuevos**](/settings?s=tasks&find=Review%20new%20pull%20requests): Una tarea programada lista para usar.
- [**Doctor de CI**](/settings?s=tasks&find=CI%20doctor): Una tarea programada lista para usar.
- [**Clasificación de incidencias**](/settings?s=tasks&find=Issue%20triage): Una tarea programada lista para usar.
- [**Jardinero de dependencias**](/settings?s=tasks&find=Dependency%20gardener): Una tarea programada lista para usar.
- [**Primer respondedor de incidentes**](/settings?s=tasks&find=Incident%20first%20responder): Una tarea programada lista para usar.
- [**Archivos nuevos en una carpeta**](/settings?s=tasks&find=New%20files%20in%20a%20folder): Una tarea programada lista para usar.
- [**Recordatorio**](/settings?s=tasks&find=Reminder): Una tarea programada lista para usar.

## Capacidades

### Búsqueda

[Configuración → Búsqueda](/settings?s=search): cómo buscan los agentes en la web: Naget Search y otros proveedores. Más en [Búsqueda y navegador](/guide/web).

- [**Proveedores**](/settings?s=search&find=Providers): Qué proveedores de búsqueda usan los agentes y en qué orden.
- [**Naget Search**](/settings?s=search&find=Naget%20Search): La búsqueda web propia de la app.
- [**SearXNG**](/settings?s=search&find=SearXNG): Un motor de búsqueda que ejecutas tú mismo.
- [**Brave Search**](/settings?s=search&find=Brave%20Search): Búsqueda web con una clave de Brave.
- [**DuckDuckGo**](/settings?s=search&find=DuckDuckGo): Búsqueda web sin clave.
- [**Resultados por búsqueda**](/settings?s=search&find=Results%20per%20search): Cuántos resultados da una búsqueda.

### Navegador

[Configuración → Navegador](/settings?s=browser): un navegador web que usan los agentes y que puedes ver y controlar. Más en [Búsqueda y navegador](/guide/web).

- [**Un navegador para agentes**](/settings?s=browser&find=A%20browser%20for%20agents): Los agentes abren sitios, hacen clic, escriben y leen páginas.
- [**Chromium**](/settings?s=browser&find=Chromium): Qué Chromium usa el navegador.
- [**Mostrar una ventana**](/settings?s=browser&find=Show%20a%20window): Ejecutar el navegador en una ventana que puedas ver.
- [**Mantener las páginas fuera de esta máquina y de su red**](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network): Los sitios de esta computadora y de su red quedan fuera de alcance.
- [**Capturas de pantalla para modelos que ven imágenes**](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images): Los modelos que ven imágenes reciben capturas de pantalla de la página.
- [**Sitios**](/settings?s=browser&find=Sites): Solo estos sitios, o nunca estos.
- [**Perfiles**](/settings?s=browser&find=Profiles): Inicios de sesión separados para el navegador.
- [**Preguntar antes de enviar en sitios con sesión iniciada**](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites): Antes de que un agente envíe, publique, elimine o transfiera algo en un sitio donde ha iniciado sesión.
- [**Marcadores**](/settings?s=browser&find=Bookmarks): Los tuyos, junto con los de los otros navegadores de esta computadora.
- [**Extensiones**](/settings?s=browser&find=Extensions): Extensiones de Chrome, en la app de escritorio.
- [**Configuración del navegador**](/settings?s=browser&find=Browser%20settings): Home page, search engine, search shortcuts, page zoom, spell checking, translation, dark pages, ad blocker with its filter lists, languages and sites where ads are allowed, history and clearing what it kept.

### Uso de la computadora

[Configuración → Uso de la computadora](/settings?s=computer): los agentes ven tu pantalla y usan el ratón y el teclado, en la app de escritorio. Más en [Búsqueda y navegador](/guide/web).

- [**Uso de la computadora**](/settings?s=computer&find=Computer%20use): Los agentes ven la pantalla y usan el ratón y el teclado, en cualquier app (en los sitios web se limitan al navegador). Cada sesión te pregunta antes.
- [**Accesibilidad**](/settings?s=computer&find=Accessibility): Permiso de macOS para que Hydor use el mouse y el teclado.
- [**Grabación de pantalla**](/settings?s=computer&find=Screen%20Recording): Permiso de macOS para que Hydor vea la pantalla.

### Memoria

[Configuración → Memoria](/settings?s=memory): lo que los agentes recuerdan sobre ti, tus proyectos y cada sesión, y cuándo se escribió. Más en [Memoria](/guide/memory).

- [**Memoria**](/settings?s=memory&find=Memory): Los agentes empiezan con lo que guardaron sesiones anteriores y guardan notas cuando se lo pides.
- [**Memoria wiki**](/settings?s=memory&find=Wiki%20memory): Artículos que los agentes guardan de cada proyecto, a partir de sus documentos y su trabajo: activado en todos los proyectos salvo que su propia configuración diga otra cosa.
- [**Aprender de documentos nuevos**](/settings?s=memory&find=Learn%20from%20new%20documents): Los documentos nuevos y modificados añaden notas de memoria y actualizan la wiki, con el modelo auxiliar.
- [**Máximo de documentos que leer en la wiki**](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki): Con más documentos que esto, la wiki de un proyecto lee los fijados, los más usados y los más recientes: los agentes buscan en todos.
- [**Carpeta de la wiki**](/settings?s=memory&find=Wiki%20folder): Dónde se guarda la wiki compartida, y las wikis de los proyectos salvo que se indique abajo.
- [**Wikis de proyectos**](/settings?s=memory&find=Project%20wikis): Dónde se guarda la wiki de cada proyecto: en la carpeta wiki o en la carpeta de cada proyecto.
- [**Carpeta dentro de cada proyecto**](/settings?s=memory&find=Folder%20inside%20each%20project): Dónde dentro de su carpeta guarda cada proyecto su wiki.
- [**Excluir de Git**](/settings?s=memory&find=Leave%20it%20out%20of%20Git): Agrega la carpeta wiki del proyecto a su .gitignore, solo en repositorios de Git.
- [**Búsqueda por significado**](/settings?s=memory&find=Search%20by%20meaning): Encuentra notas, y cualquier cosa de esta búsqueda, por su significado.
- [**Notas con las que empieza cada agente**](/settings?s=memory&find=Notes%20each%20agent%20starts%20with): Además de tu perfil: como máximo esta cantidad de notas que tienen que ver con lo que preguntas, y los títulos del resto.
- [**Ordenar automáticamente**](/settings?s=memory&find=Tidy%20up%20automatically): Cerca de una vez al día, tras algo nuevo: une notas que dicen lo mismo, resume las relacionadas y les pone título.
- [**Aprender de las conversaciones**](/settings?s=memory&find=Learn%20from%20conversations): Con la puesta en orden: corrige las notas que las conversaciones muestran erróneas, comprueba las no comprobadas y conserva unas pocas cosas nuevas.
- [**Ordenar ahora**](/settings?s=memory&find=Tidy%20up%20now): Ordena la memoria de inmediato.
- [**Tu perfil**](/settings?s=memory&find=Your%20profile): Lo que cada agente sabe de ti al empezar una sesión; los agentes lo mantienen al día.
- [**Longitud del perfil**](/settings?s=memory&find=Profile%20length): El máximo de palabras que puede tener tu perfil; si es más largo, el modelo auxiliar lo acorta.
- [**Notas**](/settings?s=memory&find=Notes): Todas las notas guardadas, por lugar.
- [**Añadir una nota**](/settings?s=memory&find=Add%20a%20note): Escribe una nota para que los agentes la recuerden, sobre ti o sobre un proyecto.
- [**Notas eliminadas**](/settings?s=memory&find=Deleted%20notes): Notas eliminadas en los últimos 30 días, para restaurarlas.
- [**Traer…**](/settings?s=memory&find=Bring%20in%E2%80%A6): Notas de lo que otros asistentes saben de ti y las habilidades que creaste en ellos: Claude Code, Codex, otros agentes, o una exportación de ChatGPT o Claude.
- [**Exportar**](/settings?s=memory&find=Export): Todas las notas en Markdown para leerlas, o en JSON con sus historiales.
- [**Borrar todo…**](/settings?s=memory&find=Clear%20all%E2%80%A6): Elimina todas las notas y su historial.

### Subagentes

[Configuración → Subagentes](/settings?s=children): agentes que pasan partes de un trabajo a subagentes, y enjambres para problemas difíciles. Más en [Investigación profunda, segundas opiniones y varios agentes](/guide/research).

- [**Trabajando a la vez, por sesión**](/settings?s=children&find=Working%20at%20once%2C%20per%20session): Cuántos subagentes de Hydor ejecuta una sesión a la vez.
- [**Tamaño del enjambre**](/settings?s=children&find=Swarm%20size): Cuántos agentes de un enjambre o campaña trabajan a la vez.

### Objetivos

[Configuración → Objetivos](/settings?s=goals): los valores con los que empieza un objetivo nuevo: sus rondas, cuánto te pregunta y cuándo sigue con su propia elección. Más en [Objetivos](/guide/goals).

- [**Rondas que puede ejecutar un objetivo**](/settings?s=goals&find=Rounds%20a%20goal%20may%20run): Cuántas rondas tiene un objetivo nuevo antes de detenerse en su límite, a menos que el agente proponga menos o tú lo cambies al aceptar.
- [**Cuánto te pregunta un objetivo**](/settings?s=goals&find=How%20much%20a%20goal%20asks%20you): Si un objetivo nuevo trabaja por su cuenta, pregunta en los puntos de decisión o pregunta en cada ronda.
- [**Sigue con su propia elección después de**](/settings?s=goals&find=Goes%20on%20with%20its%20own%20pick%20after): Cuánto espera un objetivo nuevo tu respuesta a una pregunta antes de seguir con su propia elección; con 0 espera tu respuesta.

### Imágenes, video y audio

[Configuración → Imágenes, video y audio](/settings?s=images): imágenes, videos, música y voces que los agentes crean para ti mediante OpenRouter, y quién escribe sus pies de imagen. Más en [Documentos, imágenes, videos y voz](/guide/documents-voice).

- [**Creación de imágenes**](/settings?s=images&find=Making%20images): Permitir que los agentes creen imágenes.
- [**Para la mayoría de las imágenes (Mejor)**](/settings?s=images&find=For%20most%20pictures%20%28Best%29): El modelo que hace la mayoría de las imágenes y cada cambio en una.
- [**Para imágenes sencillas (Rápido)**](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29): Un modelo más económico y rápido para íconos, fondos, texturas e imágenes sencillas.
- [**Herramientas de imágenes en esta computadora**](/settings?s=images&find=Picture%20tools%20on%20this%20computer): Quita el fondo de una imagen, borra una parte o agrándala, aquí mismo: gratis, y tus imágenes se quedan en esta computadora.
- [**Creación de videos**](/settings?s=images&find=Making%20videos): Permitir que los agentes creen videos.
- [**Modelo de video**](/settings?s=images&find=Video%20model): El modelo que hace videos.
- [**Usar la tarjeta gráfica para los videos**](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos): Editar videos con la tarjeta gráfica cuando hay una: más rápido y con el procesador libre.
- [**Creación de audio**](/settings?s=images&find=Making%20audio): Permitir que los agentes creen audio.
- [**Modelo de música**](/settings?s=images&find=Music%20model): El modelo que hace música.
- [**Modelo de voz y sonido**](/settings?s=images&find=Voice%20and%20sound%20model): El modelo que hace voces y sonidos.
- [**Descripciones de lo que guardas**](/settings?s=images&find=Captions%20for%20what%20you%20keep): El modelo que escribe los títulos y descripciones de las imágenes, videos y audios que guardas.

### Voz

[Configuración → Voz](/settings?s=voice): dicta mensajes y escucha las respuestas en voz alta. Más en [Documentos, imágenes, videos y voz](/guide/documents-voice).

- [**Dictado**](/settings?s=voice&find=Dictation): Dictar un mensaje en vez de escribirlo.
- [**Idioma que hablas**](/settings?s=voice&find=Language%20you%20speak): El idioma que escucha el dictado.
- [**Reconocimiento de voz en el servidor**](/settings?s=voice&find=Speech%20recognition%20on%20the%20server): Reconocer voz en esta computadora o con un servicio.
- [**Leer en voz alta**](/settings?s=voice&find=Read%20aloud): Leer las respuestas en voz alta.

### Sugerencias de palabras

[Configuración → Sugerencias de palabras](/settings?s=suggest): el resto de la palabra que escribes en gris, y la palabra siguiente, de un modelo pequeño que aprende de lo que escribes. Más en [Documentos, imágenes, videos y voz](/guide/documents-voice).

- [**Sugerencias de palabras**](/settings?s=suggest&find=Word%20suggestions): El resto de la palabra que escribes y la siguiente, en gris después del cursor, con modelos que se ejecutan en esta computadora; la primera vez descarga cerca de 1,2 GB.
- [**Mostrar en este navegador**](/settings?s=suggest&find=Show%20in%20this%20browser): Si este navegador muestra sugerencias de palabras (cada navegador guarda las suyas).
- [**Modelo de lenguaje**](/settings?s=suggest&find=Language%20model): Qwen3.5 junto al modelo pequeño: automáticamente cuando la computadora tiene memoria, siempre o nunca.
- [**Tamaño del modelo de lenguaje**](/settings?s=suggest&find=Language%20model%20size): El modelo de lenguaje en 8 bits (mejor) o en 4 bits (más pequeño, algo peor).
- [**Seguridad antes de mostrar**](/settings?s=suggest&find=How%20sure%20before%20showing): Qué tan segura debe ser una sugerencia para mostrarse: más sugerencias, o menos pero con más aciertos.
- [**Mostrar la palabra siguiente**](/settings?s=suggest&find=Show%20the%20next%20word): También la palabra siguiente, más tenue.
- [**Restablecer los números**](/settings?s=suggest&find=Reset%20the%20numbers): Vuelve a empezar desde cero el conteo de las pulsaciones ahorradas y de las sugerencias acertadas.
- [**En los cuadros de mensaje**](/settings?s=suggest&find=In%20message%20boxes): Sugerencias en el cuadro donde escribes un mensaje a un agente.
- [**En documentos**](/settings?s=suggest&find=In%20documents): Sugerencias mientras escribes en un documento.
- [**En notas**](/settings?s=suggest&find=In%20notes): Sugerencias en las notas.
- [**En otros cuadros de texto**](/settings?s=suggest&find=In%20other%20text%20boxes): Sugerencias en otros lugares donde escribes: seguimientos, la cola, un mensaje anterior, paneles de Preguntar.
- [**Palabras de lo que escribiste**](/settings?s=suggest&find=Words%20of%20what%20you%20typed): Cuántas de las palabras que escribiste antes del cursor lee.
- [**Palabras de la respuesta o del documento**](/settings?s=suggest&find=Words%20of%20the%20reply%20or%20document): Cuántas palabras de la última respuesta del agente, o del documento anterior al párrafo, lee.
- [**Elegir según el idioma**](/settings?s=suggest&find=Choose%20by%20language): Elige el modelo que funciona mejor para el idioma en el que escribes.
- [**Aprender de la conversación**](/settings?s=suggest&find=Learn%20from%20the%20conversation): Usa las palabras empleadas antes en la conversación mientras escribes un mensaje.
- [**Threads**](/settings?s=suggest&find=Threads): Hilos del procesador para las sugerencias (automático por defecto).
- [**Aprender de lo que escribo**](/settings?s=suggest&find=Learn%20from%20what%20I%20write): El modelo pequeño aprende de lo que escribes, en esta computadora y en segundo plano.
- [**Cuándo aprende**](/settings?s=suggest&find=When%20it%20learns): Cada noche, cada semana o solo cuando pulses Volver a entrenar ahora; espera a que lleves diez minutos sin escribir.
- [**De mis mensajes**](/settings?s=suggest&find=From%20my%20messages): Aprender de los mensajes que escribiste a los agentes.
- [**De las respuestas de los agentes**](/settings?s=suggest&find=From%20agents'%20replies): Aprender de lo que los agentes te respondieron.
- [**De mis notas**](/settings?s=suggest&find=From%20my%20notes): Aprender de las notas de memoria que escribiste.
- [**De mis documentos**](/settings?s=suggest&find=From%20my%20documents): Aprender de los documentos y páginas que escribiste.
- [**Peso de mis propias palabras**](/settings?s=suggest&find=Weight%20of%20my%20own%20words): Cuánto más pesan las palabras que escribiste frente al resto de lo que aprende.
- [**Hilos para el aprendizaje**](/settings?s=suggest&find=Threads%20for%20learning): Hilos del procesador para el aprendizaje (automático por defecto).
- [**Aprender con la tarjeta gráfica**](/settings?s=suggest&find=Learn%20on%20the%20graphics%20card): El aprendizaje se hace en una tarjeta gráfica NVIDIA o en un Mac con Apple silicon cuando hay una libre, muchas veces más rápido que en el procesador.
- [**Volver a entrenar ahora**](/settings?s=suggest&find=Retrain%20now): Aprende ahora, en segundo plano, de lo que escribiste desde la última vez.
- [**Olvidar lo aprendido**](/settings?s=suggest&find=Forget%20what%20it%20learned): Elimina el modelo que aprendió de ti; se vuelve a usar el que venía con la app.

### Tus agentes

[Configuración → Tus agentes](/settings?s=assistants): dónde van las carpetas de tareas y cómo limpiar después de una tarea; tus agentes están en la página Agentes. Más en [Agentes](/guide/agents).

- [**Tus agentes**](/settings?s=assistants&find=Your%20agents): Tus agentes están en la página Agentes.
- [**Limpiar después de una tarea**](/settings?s=assistants&find=Clean%20up%20after%20a%20task): Los agentes quitan lo que crearon por el camino y que ya no necesitan.
- [**Carpetas de tareas**](/settings?s=assistants&find=Task%20folders): Dónde van las carpetas de tareas nuevas, para las sesiones que empiezan sin carpeta.

### Apps

[Configuración → Apps](/settings?s=apps): lo que las apps saben sobre ti y cuáles se ejecutan sin preguntar. Más en [Apps](/guide/apps).

- [**Sobre ti**](/settings?s=apps&find=About%20you): Desde qué parten las preguntas de las apps, para que no pregunten cada vez.
- [**Ejecutar sin preguntar**](/settings?s=apps&find=Run%20without%20asking): Las apps que los agentes ejecutan por ti sin preguntar antes; quita una para que se vuelva a preguntar.

### Custom

[Configuración → Custom](/settings?s=custom): modo automático y un sandbox para comandos. Más en [Custom, el agente propio de la app](/guide/custom).

- [**Modo automático**](/settings?s=custom&find=Auto%20mode): Custom aprueba por sí mismo los pasos seguros.
- [**Entorno aislado para comandos**](/settings?s=custom&find=Sandbox%20for%20commands): Los comandos del modo Automático se ejecutan en un entorno aislado; Acceso total se ejecuta sin él.

## Preguntar a un agente

- "¿Dónde cambio lo que hace Enter mientras un agente trabaja?"
- "Activa el sonido de las notificaciones."
- "Muéstrame mis ajustes de búsqueda."
- "Pon como modelo auxiliar el más barato."
- "Desactiva la memoria para las sesiones nuevas."
