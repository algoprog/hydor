# Custom, el agente propio de la app

Custom es el agente propio de Hydor: ejecuta los modelos de tus planes de Claude y ChatGPT, y cualquier modelo que añadas, de OpenRouter, Ollama, vLLM u otro servidor compatible con OpenAI, con las mismas herramientas, habilidades y conexiones que Claude Code y Codex. Este tema explica qué puede hacer, sus modos de permisos y cómo comprueba los comandos, el Modo automático, el sandbox para comandos, los objetivos, cómo se las arregla con trabajos largos y modelos más débiles, y su configuración.

![Configuración → Modelos: el modelo auxiliar y los modelos en esta computadora](images/custom.webp)

## Qué es Custom y cuándo usarlo

Claude Code solo ejecuta los modelos de Anthropic, y Codex solo los de OpenAI. Custom también ejecuta los modelos de tus planes de Claude y ChatGPT, mediante los inicios de sesión de Claude Code y Codex en esta computadora, y cualquier modelo que configures en [Configuración → Agentes → Modelos](/settings?s=models): modelos abiertos en tu propia computadora, modelos baratos o gratuitos a través de OpenRouter, o un servidor propio. No hay nada que configurar para los modelos de tus planes: una vez que Claude Code ha iniciado sesión, el menú **Modelo** de Custom ofrece Claude Opus, Fable, Sonnet y Haiku, y una vez que Codex ha iniciado sesión con ChatGPT, los modelos que enumera tu plan de ChatGPT, todos bajo **Tus suscripciones**. Usan el consumo de tu plan, no una clave de API. Consulta [Agentes, cuentas y modelos](/guide/agents-models#where-customs-models-come-from) para saber de dónde salen los modelos de Custom y cómo añadir más.

Usa Custom cuando quieras:

- un modelo que nunca salga de tu computadora (Ollama o vLLM), o una sesión entera que tampoco salga: una [sesión confidencial](/guide/sessions#keep-a-session-confidential) siempre se ejecuta en Custom, y usa solo modelos de esta computadora o de tu propia red (nunca los modelos de tus planes, que se ejecutan en los servidores de Anthropic o de OpenAI);
- un modelo concreto, como DeepSeek, Qwen, GLM o Kimi;
- las herramientas y reglas propias de Custom con un modelo de tu plan de Claude o ChatGPT, o para reducir costos, o para seguir trabajando cuando se agota tu plan de Claude o ChatGPT (con un modelo de otro origen).

Sirve para cualquier cosa: investigación, redacción, documentos y tareas cotidianas. En un proyecto de código (una carpeta con un `package.json`, `Cargo.toml`, un repositorio git y similares) trabaja como un ingeniero cuidadoso: lee antes de cambiar, sigue las instrucciones del propio proyecto y ejecuta las pruebas y comprobaciones del proyecto antes de decir que ha terminado.

Custom lee los archivos `AGENTS.md` o `CLAUDE.md` del proyecto y sigue tus [Pautas de los agentes](/guide/guidelines), igual que los demás agentes.

## Empezar una sesión con Custom

1. En la página de inicio, haz clic en **Agente** y elige **Custom** (“Cualquier modelo: OpenRouter, Ollama, vLLM”).
2. Haz clic en **Modelo** y elige uno de tus modelos, o **Automático** cuando el menú lo ofrezca: los niveles de Custom se rellenan solos a partir de los modelos que tiene (primero los de tu plan de Claude, luego los de tu plan de ChatGPT y después los que añadiste que no están en esta computadora), y cuando su nivel Mejor nombra un modelo, una sesión en Automático empieza con él y dirige a los subagentes (consulta [Niveles: un modelo para cada tipo de trabajo](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Si la lista está vacía, añade primero un modelo: **Agente** → **Modelos para Custom**.
3. En **Opciones**, elige **Permisos** (consulta [Elige qué puede hacer Custom sin preguntar](#choose-what-custom-may-do-without-asking)). Custom no tiene ajuste de Esfuerzo.
4. Escribe la tarea y pulsa Enter.

Un modelo de esta computadora servido con vLLM se inicia la primera vez que una sesión lo usa; la sesión muestra “Starting … with vLLM (the first time takes a minute or two)…”.

Custom atiende un mensaje a la vez. Un mensaje que envías mientras trabaja espera en la cola sobre el cuadro de mensaje y sale cuando termina el turno.

Puedes cambiar de modelo durante una sesión desde el menú bajo el cuadro de mensaje. Custom usa el nuevo modelo desde su siguiente paso, incluso en mitad de un turno.

## Qué puede hacer Custom

- **Archivos**: leerlos (texto con números de línea, una parte de un archivo largo cada vez, el contenido de una carpeta), crearlos, reescribirlos y editarlos, listar carpetas y encontrar archivos por nombre o por lo que contienen. Antes de reescribir un archivo entero que no ha leído en esta sesión, se le pide que lo lea primero.
- **Documentos**: los archivos PDF, Word, Excel, PowerPoint, OpenDocument, RTF y EPUB se leen como texto.
- **Imágenes**: las imágenes que adjuntas, los archivos de imagen que abre y las imágenes de páginas web o herramientas. Un modelo que ve imágenes recibe la imagen; para uno que no, el modelo auxiliar la describe (consulta [Imágenes para modelos que no ven](#images-for-models-that-dont-see)).
- **Comandos**: ejecutan comandos de shell en la carpeta de la sesión, hasta dos minutos por defecto y diez como máximo. Los servidores, los observadores y otros comandos que siguen ejecutándose van en segundo plano: Custom lee su salida cuando lo necesita y puede detenerlos. También se detienen cuando Custom termina, y a su siguiente turno se le informa de cuáles siguen activos.
- **Páginas web**: obtiene una página como texto limpio con sus encabezados, enlaces, listas y tablas; los PDF y archivos de Office en línea se leen como texto. Solo accede a direcciones públicas; para esta computadora o su red usa un comando como `curl`.
- **Un plan**: para trabajos de varios pasos mantiene una lista de comprobación, que se muestra en la sesión, y va marcando los elementos.
- **Habilidades**: carga las habilidades que encajan con la tarea: las del proyecto, las tuyas (las carpetas de habilidades de Claude Code y de Codex) y las de la [biblioteca de habilidades](/guide/skills) de la app. Las conoce por grupo y nombre, y también puede buscar una según de qué trate el trabajo, con unas pocas palabras.
- **Servidores MCP**: servidores de herramientas que configuraste para Claude Code (para todas las carpetas y para esta carpeta), el `.mcp.json` del proyecto y los de Codex.
- **Las herramientas propias de la app**: búsqueda web, el navegador, la memoria, páginas, tus [conexiones](/guide/connections) y el resto, como las recibe cada agente aquí.

Cada paso aparece en la sesión con un nombre sencillo (“Read index.ts”, “Edit README.md”, “Fetch https://…”), con su diff o su salida a un clic de distancia.

## Elige qué puede hacer Custom sin preguntar

El ajuste **Permisos** (en **Opciones** en la página de inicio, o en el menú bajo el cuadro de mensaje de una sesión) decide lo que Custom hace por su cuenta. Mayús+Tab en el cuadro de mensaje pasa al siguiente modo.

- **Preguntar** (el predeterminado): pregunta antes de editar archivos y antes de ejecutar comandos. Los comandos que solo miran (`ls`, `cat`, `git status` y similares) se ejecutan libremente.
- **Aceptar ediciones**: edita archivos de la carpeta de la sesión libremente; pregunta antes de ejecutar comandos (salvo los que solo miran) y antes de cualquier cosa fuera de la carpeta.
- **Auto**: los pasos rutinarios siguen adelante; una comprobación rápida te consulta sobre los arriesgados. Consulta [Modo automático](#auto-mode).
- **Acceso total**: las herramientas y los comandos se ejecutan sin solicitudes de aprobación ni el [sandbox](#the-sandbox-for-commands) de comandos, incluidos los comandos de administrador y los cambios fuera de la carpeta. Usan los permisos de la cuenta de tu computadora: esto no concede un acceso de administrador que tu cuenta no tenga. Las sesiones confidenciales siguen manteniendo sus restricciones de red.
- **Plan**: solo lee y planifica. Custom no puede editar archivos ni ejecutar comandos, y solo usa herramientas que leen. Termina con un plan numerado. Para llevarlo a cabo, cambia a otro modo y dile que siga adelante.

Fuera de Acceso total, algunos comandos siempre preguntan: consulta [Comandos que siempre preguntan](#commands-that-always-ask).

## Aprobar o rechazar lo que Custom quiere hacer

Cuando Custom necesita tu visto bueno, aparece una tarjeta en la sesión (y en la [bandeja de entrada](/guide/inbox)). Su título dice qué hace el paso y por qué pregunta, por ejemplo “Edit /home/you/notes/plan.md — it changes files outside the session folder”. Para un comando, la tarjeta muestra el comando completo.

- **Permitir** deja que se ejecute este paso.
- **Always allow …** deja que se ejecute, y también pasos similares de ahora en adelante en esta sesión, sin preguntar. El botón dice qué cubre: “Always allow npm run build …”, “Allow all edits”, “Always allow reading in ~/data”, “Always allow changes in ~/site”.
- **Rechazar** detiene este paso. A Custom se le dice que lo rechazaste y que no lo intente de nuevo.

Cómo funciona **Always allow** con los comandos: Custom divide un comando en sus partes (en `&&`, `;`, `|` y así) y comprueba cada una. Una regla cubre el comando para el que se creó, por sus primeras palabras (`git status`, `npm run build`, `docker compose up`), de modo que nada puede colarse después de `&&`. Los comandos que solo miran nunca necesitan una regla.

**Always allow** no se ofrece cuando no puede ser seguro:

- para código dado directamente en el comando (como `python -c "…"`);
- para un archivo cuyo nombre no se puede conocer de antemano;
- para un comando que no se puede leer con seguridad;
- para comandos arriesgados, que preguntan cada vez.

## Comandos que siempre preguntan

Fuera de Acceso total, estos pasos te preguntan siempre, incluso en Auto, sea lo que sea lo que hayas permitido antes:

- ejecutar como administrador (`sudo` y similares);
- eliminar archivos fuera de la carpeta de la sesión, eliminar la propia carpeta de la sesión o eliminar archivos que no puede nombrar de antemano;
- canalizar una descarga directamente a un shell, o ejecutar una descarga de inmediato;
- escribir datos sin procesar en un disco, formatear o reparticionar un disco;
- apagar o reiniciar la computadora;
- cambiar tareas programadas (`crontab`);
- cambiar los permisos o propietarios de todo un árbol de carpetas;
- cambiar claves SSH, o la configuración y los archivos de inicio de tu carpeta personal (como `.bashrc` o `~/.config`), salvo que la sesión trabaje en esa carpeta.

## Archivos fuera de la carpeta y archivos con claves

En Preguntar, Aceptar ediciones y Plan, Custom pregunta antes de leer o cambiar archivos fuera de la carpeta de la sesión (la carpeta temporal no cuenta). **Always allow** entonces cubre esa carpeta, para leer o para cambiar.

Los archivos que contienen claves o contraseñas preguntan antes de leerse o cambiarse, también dentro de la carpeta: los archivos `.env` (no los de ejemplo), las claves privadas SSH y otras, `.netrc`, `.npmrc`, los archivos de credenciales, tus carpetas de la nube y de gestores de contraseñas, los inicios de sesión propios de los agentes y los datos propios de la app. Los cambios en la configuración y los hooks propios de git también preguntan. **Always allow** entonces cubre solo ese archivo.

En Modo automático, deciden sobre estos casos las reglas de Auto y su comprobación rápida. En Acceso total no preguntan.

## Modo automático

El Modo automático deja que el trabajo rutinario siga adelante sin detenerte, y pregunta por el resto. Elige **Auto** en **Permisos**.

Cada paso que preguntaría pasa por estas comprobaciones en orden:

1. **Reglas fijas** que no necesitan un modelo:
   - Siguen adelante: las ediciones dentro de la carpeta de la sesión; los archivos temporales nuevos en la carpeta temporal; los comandos que solo leen dentro de la carpeta; las pruebas, compilaciones, linters y comprobaciones de tipos del propio proyecto.
   - Te preguntan: sobrescribir un archivo fuera de la carpeta; cualquier cosa de la [lista de los que siempre preguntan](#commands-that-always-ask); hacer force-push con git; escribir, mover o eliminar archivos fuera de la carpeta; los comandos que llaman a un servicio de pago; las herramientas de una cuenta conectada o de un servidor MCP que envían o publican algo, o gastan dinero.
2. **Una comprobación rápida** para todo lo demás, a cargo del [modelo auxiliar](/guide/agents-models#choose-the-helper-model). Responde de una de tres maneras:
   - **permitir**: sirve claramente a lo que pediste, se queda en tu carpeta (o solo lee) y es fácil de deshacer;
   - **preguntar**: podría causar un daño duradero o llega más lejos (eliminar datos, instalar software para todo el sistema, cambiar configuraciones, usar contraseñas o claves, enviar o publicar algo, gastar dinero, o algo que no pediste);
   - **rechazar**: es claramente dañino o contrario a lo que quieres. El paso no se ejecuta; a Custom se le dice por qué y debe buscar otra manera.

La comprobación rápida solo ve tus propios mensajes de la sesión (el primero y los diez últimos), el objetivo si fijaste uno, la carpeta y el propio paso (en una edición, el comienzo del texto nuevo). Nunca ve lo que Custom leyó, así que una página web o un archivo no pueden convencerla de nada. Si la comprobación falla o tarda más de 45 segundos, decides tú. Dentro de un mismo turno, el mismo paso recibe la misma respuesta. En una [sesión confidencial](/guide/sessions#keep-a-session-confidential) la comprobación se queda en esta computadora: la hace el modelo auxiliar cuando se ejecuta aquí; si no, el propio modelo de la sesión.

En la sesión, un paso que Auto dejó pasar lleva una pequeña etiqueta **Auto**; pasa el cursor por encima para ver el motivo. Un paso que Auto detuvo muestra la etiqueta en rojo; pasa el cursor por encima para ver “Auto stopped this: …” y el motivo. Una tarjeta que Auto te envía empieza con “Auto:” y el motivo.

[Configuración → Capacidades → Custom](/settings?s=custom&find=Auto%20mode) tiene una fila **Modo automático** cuyo (i) describe el Modo automático con las mismas palabras; no hay nada que activar ahí.

## El entorno aislado para comandos

En el modo Automático, los comandos de Custom pueden ejecutarse en un entorno aislado: solo pueden cambiar archivos en la carpeta de la sesión y en carpetas temporales, y todo lo demás en la computadora es de solo lectura. Aun así, pueden usar la red. Cuando la sesión trabaja en un worktree de Git o en una subcarpeta de un repositorio, la carpeta propia del repositorio también permanece con permiso de escritura, para que Git pueda hacer commits. Las cachés de los gestores de paquetes se mueven a una carpeta temporal. Cómo se crea el entorno aislado depende de tu computadora:

- **Linux**: usa bubblewrap. Los comandos pueden cambiar archivos en la carpeta de la sesión, en la carpeta temporal (`/tmp`) y en la carpeta propia del repositorio.
- **Mac**: usa Seatbelt, el entorno aislado que incluye macOS. La regla es la misma: la carpeta de la sesión, las carpetas temporales y la carpeta propia del repositorio.
- **Windows**: los comandos se ejecutan con integridad baja, una protección que tiene Windows: pueden leerlo todo, pero solo cambian archivos en las carpetas marcadas para ello. La primera vez, Hydor marca la carpeta de la sesión (y la carpeta propia del repositorio) y la marca permanece. Los comandos reciben una carpeta temporal propia, en `AppData\LocalLow\Hydor`, para archivos temporales y cachés de paquetes. Tu carpeta personal, una unidad completa, Windows, Program Files y las carpetas de datos de las apps nunca se marcan: en una carpeta así los comandos se ejecutan sin el entorno aislado. El bash de Git no puede compartir su funcionamiento con tus ventanas de bash normales con integridad baja, así que la primera vez Hydor también hace una copia de los programas de Git para los comandos aislados, en `AppData\Local\Hydor\sandbox` (hecha de enlaces a los mismos archivos, por lo que no ocupa espacio cuando Git está en la misma unidad).

Cuando un comando choca con los límites del entorno aislado, a Custom se le informa de que se ejecutó en un entorno aislado, y o bien trabaja dentro de él o te dice qué hay que hacer en otro lugar.

Para activarlo o desactivarlo, abre [Configuración → Capacidades → Custom](/settings?s=custom&find=Sandbox%20for%20commands) y usa el interruptor junto a **Entorno aislado para comandos**. Está activado por defecto. Desactívalo si una herramienta debe escribir en otro lugar, por ejemplo para instalar algo para todo el sistema. El cambio se aplica a las sesiones en curso en unos 15 segundos.

Si el entorno aislado no puede ejecutarse, el interruptor aparece atenuado y la fila indica el motivo; entonces los comandos se ejecutan sin entorno aislado. En Linux eso significa que bubblewrap no está instalado o no puede ejecutarse (como en algunos contenedores). En un Mac significa que Seatbelt no pudo iniciarse. En Windows, la primera vez Hydor crea un pequeño asistente con .NET Framework, que viene con Windows, y además necesita Git para Windows (que los comandos necesitan de todos modos): la fila lo indica cuando falta alguno de los dos o cuando el asistente no puede iniciarse. En Preguntar y Aceptar ediciones, los comandos no usan el entorno aislado: allí, cada comando que hace algo más que mirar espera tu aprobación, o una regla que guardaste con **Permitir siempre**.

En una [sesión confidencial](/guide/sessions#keep-a-session-confidential) todos los comandos se ejecutan sin red, en cualquier modo y sea cual sea el valor de este interruptor, de modo que no pueden llegar a internet, a tus otras computadoras ni a los servidores de esta. Sus archivos se mantienen como los deja el modo. Esto funciona en Linux (bubblewrap) y en un Mac (Seatbelt). Windows no puede cortar la red de este modo, así que allí, y dondequiera que el entorno aislado no pueda ejecutarse, cada comando te pregunta antes, en cualquier modo, sin **Permitir siempre**. A Custom se le informa, y un comando que intenta usar la red se entera de por qué falló.

## Dar un objetivo a Custom

Custom tiene los mismos objetivos que cualquier otro agente: el propio bucle de la app lo dirige, ronda tras ronda, hasta que se cumplen las comprobaciones que aceptas. Abre el menú de la sesión (⋯) → **Establecer un objetivo**, o activa **Opciones** → **Gol** en la página de inicio, y el agente propone las comprobaciones para que las apruebes. En cada ronda la app ejecuta las comprobaciones por sí misma, conserva la ronda o la deshace (en un worktree), te pregunta qué camino seguir en los puntos de decisión, y se detiene cuando se cumplen todas las comprobaciones, cuando tú lo detienes o cuando se alcanza un límite. La historia completa, con las pantallas, está en [Dar un objetivo a la sesión](/guide/sessions#give-the-session-a-goal).

Lo que ahora es igual para todos los agentes: la tarjeta de acuerdo, las comprobaciones, la lista de rondas, las preguntas, tus reglas y **Tu decisión**, y el informe. Escribir `/goal` en una sesión de Custom ya no hace nada especial: es texto normal. Hay dos cosas propias de Custom:

- Una comprobación del **Revisor**, y la comprobación final, las juzga un modelo que no hizo nada del trabajo. En una [sesión confidencial](/guide/sessions#keep-a-session-confidential) es un modelo de esta computadora; si no hay uno, la comprobación no puede ejecutarse.
- Los comandos de comprobación se ejecutan como los propios comandos de Custom: en modo Automático con **Entorno aislado para comandos** activado, dentro del entorno aislado, limitados a la carpeta de la sesión; en sus otros modos, como se ejecutan sus propios comandos; en una sesión confidencial, siempre dentro del entorno aislado y sin red.
- Las rondas que recibe un objetivo nuevo salen de **Rondas antes de pausar un objetivo**, más abajo. Ahora vale para los objetivos de todos los agentes, no solo los de Custom.

Los objetivos que Custom tenía en marcha antes de esta versión no se conservan: establece uno nuevo.

Para cambiar cuántas rondas recibe un objetivo nuevo, abre [Configuración → Capacidades → Custom](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses) y elige **10**, **30** o **100** en la fila **Rondas antes de pausar un objetivo** del grupo **Objetivos**. Puedes fijar otro número en la tarjeta de acuerdo, y el agente puede proponer uno.

## Conversaciones largas y salidas largas

Cada modelo solo puede leer una cantidad limitada a la vez (su contexto). Custom mantiene cada conversación dentro de ese límite por sí mismo, así que no hay botón Compactar para las sesiones de Custom:

1. Cuando la conversación se acerca al límite (dejando espacio para la respuesta), Custom primero borra la salida antigua de las herramientas. La sesión anota: “Cleared old tool output to keep within the model's context.”
2. Si eso no basta, el modelo resume la parte anterior en notas a partir de las cuales continúa el trabajo (“Summarizing the earlier conversation to keep within the model's context…”). La siguiente vez, actualiza esas notas en lugar de empezar de nuevo. Tu plan y las habilidades en uso se conservan en ambos casos.

Si el servidor de un modelo dice que la conversación es demasiado larga, Custom averigua el límite real de ese modelo y condensa de inmediato. Solo las últimas imágenes acompañan a cada solicitud.

Lo que la memoria le dio a Custom al principio se mantiene igual mientras trabaja, de modo que el servidor del modelo pueda reutilizar lo que guardó de la conversación, lo que es más rápido y cuesta menos. Cada vez que condensa, vuelve a leer la memoria, para tu último mensaje (consulta [Con qué empieza un agente](/guide/memory#what-an-agent-starts-with)).

El anillo junto al cuadro de mensaje muestra qué tan lleno está el contexto del modelo, como porcentaje; apunta con el cursor para ver los tokens y a qué se destinan. En **Opciones** (la ficha bajo el cuadro de mensaje) la fila **Contexto** dice “42% en uso”, con una pequeña flecha: haz clic en ella para mostrar (u ocultar) el desglose, que al principio está plegado: **Instrucciones**, **Instrucciones del proyecto**, **Memoria**, **Funciones de la app**, **Habilidades**, **Herramientas** y **Conversación**, cada uno con sus tokens y una barra fina con su proporción. Una parte sin contenido se omite. Las cifras se estiman a partir del texto y se ajustan a lo que contó el servidor del modelo. Hacer clic en el anillo no hace nada en una sesión de Custom, ya que Custom condensa por sí mismo; las sesiones de Claude Code y Codex conservan su anillo y **Compactar** (consulta [Lee los medidores](/guide/sessions#read-the-meters-context-cache-and-speed)).

Las salidas largas tampoco llenan la conversación. Cuando un comando, una página o una herramienta devuelve más que una parte del contexto del modelo, Custom guarda todo en un archivo en la carpeta propia de la sesión. El modelo recibe el principio y el final (en un comando, sobre todo el final, donde aparecen los errores) y la ubicación del archivo, y lee el resto por partes o busca en él. Estos archivos se eliminan después de una semana.

## Lo que lee el modelo

Antes de tu mensaje, el modelo recibe, en este orden:

- Las reglas propias de Custom (cómo trabajar, el modo, la carpeta), las instrucciones del agente y tus Pautas de los agentes: **Instrucciones** en el desglose;
- las instrucciones del proyecto, su `AGENTS.md` o `CLAUDE.md`: **Instrucciones del proyecto**;
- lo que la [memoria](/guide/memory#what-an-agent-starts-with) tiene para tu solicitud: **Memoria**;
- lo que dicen las funciones de la app: cómo se ven las respuestas, mantener las claves y contraseñas fuera del chat, ordenar, y cómo usar al completo las herramientas que tiene (imágenes, apps, el navegador, documentos, etc.): **Funciones de la app**;
- sus habilidades (**Habilidades**), nombradas por grupo: las propias del proyecto, las tuyas, y luego los grupos de la Biblioteca, como Programación o Documentos. Custom puede cargar una por su nombre, o buscar una según en qué consiste el trabajo. Custom admite hasta 200 habilidades, y como máximo 40 de ellas son las del proyecto y las tuyas. Las habilidades que encajan con tu primer mensaje vienen con la descripción de para qué sirve cada una;
- sus herramientas, las que tiene al completo y una lista corta del resto: **Herramientas**.

Las instrucciones de una función sobre sus propias herramientas vienen con esas herramientas. Mientras una herramienta espera en la lista corta de herramientas de Custom, sus instrucciones también esperan; se añaden cuando el modelo la busca o la usa. Las reglas que valen sean cuales sean las herramientas en uso siempre se mantienen. Claude Code y Codex reciben todas las instrucciones de la app al principio, como antes.

Así, un primer mensaje a un modelo con un contexto pequeño es más corto que antes, y lo que ocupa cada parte está en el desglose bajo **Opciones**: consulta [Conversaciones largas y salidas largas](#long-conversations-and-long-output).

**La memoria se ajusta al contexto del modelo.** Un modelo con un contexto pequeño no podría hacer su trabajo si la memoria ocupara una cantidad fija, así que la parte de la memoria se reduce con la ventana (la fila **Memoria** del desglose muestra lo que ocupa):

- **Menos de 12.000 tokens**: un bloque pequeño, como máximo el 6% del contexto, con las primeras 120 palabras de tu perfil (indica que son solo el comienzo), como máximo tres notas y sin índice. La memoria no añade nada con tus mensajes ni cuando el modelo lee o cambia un archivo, y no da líneas de artículos de la wiki ni planes. Se le dice al modelo que puede buscar notas con la herramienta de memoria.
- **Hasta unos 33.000 tokens** (no a través de OpenRouter): un bloque de como máximo el 6% del contexto, las primeras 400 palabras de tu perfil, como máximo cinco notas, un índice corto, una línea de artículo de la wiki y una línea de plan, y como máximo una nota con un mensaje (600 caracteres) y una cuando se lee o se cambia un archivo (350).
- **Modelos más grandes**: todo lo que [la memoria da a un agente](/guide/memory#what-an-agent-starts-with), que es una parte pequeña de su contexto.

Como referencia, el bloque de la memoria llega a unos 1.700 caracteres para un modelo de 8.000 tokens, 3.800 para 32.000 y 7.300 para 200.000. Una sesión a la que solo se le dio el comienzo de tu perfil no puede reescribirlo: el modelo te dice qué añadir, o lo editas en [Configuración → Memoria](/settings?s=memory&find=Your%20profile). Las instrucciones de la wiki también se acortan: Custom siempre recibe un párrafo corto sobre la Memoria wiki, y cómo conservar fuentes, revisar la wiki y adoptar planes solo llega mientras se ofrecen las herramientas para ello. Después de que Custom condensa su conversación, el punto de control de la sesión (consulta [Puntos de control](/guide/wiki-memory#checkpoints)) se recorta al 8% del contexto, como máximo 16.000 caracteres, con indicación de dónde leer el resto.

## Cómo se las arregla Custom con los modelos más débiles

No todos los modelos manejan las herramientas tan bien como Claude o GPT. Custom detecta los fallos más comunes y devuelve al modelo al buen camino:

- **Repeticiones**: el mismo paso, sin que haya cambiado nada desde entonces, no se ejecuta una tercera vez (se le dice al modelo que use el resultado anterior); a la quinta vez, el turno se detiene.
- **Pasos fallidos**: tras cuatro pasos fallidos seguidos se le dice al modelo que se detenga y replantee; tras ocho, el turno se detiene.
- **Círculos**: los pasos que dan vueltas en un bucle reciben una nota para que pruebe algo distinto.
- **Trabajo sin terminar**: un modelo que dice “déjame…” sin hacerlo, o que se detiene con elementos de su plan aún abiertos, es devuelto al trabajo, una vez en cada caso. Tras cambiar código sin ejecutar las comprobaciones del proyecto, se le pide que las ejecute antes de terminar.
- **Longitud**: un turno tiene como máximo 200 pasos; al llegar a 150 se le dice al modelo que termine la parte más importante. Una respuesta cortada por el límite de longitud del modelo continúa en pasos más cortos.
- **Llamadas a herramientas rotas**: las llamadas escritas como texto se leen y se ejecutan, las llamadas con argumentos casi correctos se reparan, y un nombre de herramienta mal escrito se hace coincidir con el correcto o se responde con la lista de herramientas. Una respuesta que escribe sus llamadas como texto termina donde terminan sus llamadas: lo que un modelo escribe después de ellas (resultados imaginados, más llamadas encima de esas, la misma llamada otra vez) no se ejecuta ni se conserva, y de una misma respuesta se ejecutan como máximo seis llamadas.
- **Modelos sin llamadas a herramientas**: cuando el servidor de un modelo no admite herramientas, Custom las describe en las instrucciones y lee las llamadas del modelo a partir de lo que escribe.
- **Claude a través de Claude Code**: Anthropic solo permite que sus propios programas usen el inicio de sesión de un plan, así que un modelo Claude de tu plan responde a través del propio Claude Code, un paso a la vez. Las herramientas de Custom se describen en sus instrucciones y Claude escribe sus llamadas a herramientas como texto, igual que un modelo sin llamadas a herramientas, y cada paso reutiliza la caché del anterior. Claude Code no puede terminar una respuesta en sus llamadas a herramientas, así que Custom la termina allí por sí mismo y detiene el programa, antes de que Claude pueda escribir resultados imaginados. Los modelos de Codex son diferentes: se consultan directamente en tu plan de ChatGPT, con las herramientas de Custom como herramientas reales.
- **Contratiempos**: cuando la conexión se corta a mitad de una respuesta, o el servidor está ocupado, Custom espera y lo intenta de nuevo varias veces. Cuando la app se reinicia (por una actualización) mientras un paso espera a un modelo de tu plan, el paso se vuelve a solicitar una vez que la app está de vuelta; un turno que terminó por el reinicio lo indica, y un mensaje lo continúa.
- **Muchas herramientas**: cuando hay muchas (de servidores MCP y conexiones), el modelo ve una lista corta y busca la descripción completa de las que necesita; las instrucciones de una función sobre una herramienta vienen con ella, cuando el modelo la busca o la usa (consulta [Lo que lee el modelo](#what-the-model-reads)). Un modelo con un contexto corto (unos 32.000 tokens o menos, no a través de OpenRouter) recibe un conjunto más reducido: sin orientación sobre las UI de respuesta, una lista de herramientas solo por nombre y menos herramientas al completo (la que muestra una página de HTML también espera en la lista). También se le pide que dé pasos pequeños.
- **Cada familia de modelos** recibe los ajustes recomendados por su fabricante, el formato de edición con el que fue entrenada y un esfuerzo de razonamiento cuando lo tiene. Los pasos que solo leen se ejecutan al mismo tiempo, para ahorrar espera.

Cuando Custom detiene un turno por uno de estos motivos, la respuesta termina con “(Stopped: …)”.

## Imágenes para modelos que no ven

Un modelo que ve imágenes recibe tus imágenes directamente. Antes, las imágenes se reducen de tamaño si esta computadora tiene ffmpeg o ImageMagick.

Para un modelo que no ve imágenes, el modelo auxiliar describe cada imagen con palabras: qué muestra, dónde están las cosas y cualquier texto que contenga, copiado exactamente. Para esto hace falta un modelo auxiliar que vea imágenes: abre [Configuración → Agentes → Modelos](/settings?s=models&find=Helper%20model) y elige uno marcado como "ve imágenes" en el menú **Modelo** del grupo **Modelo auxiliar**. "Automático" no puede. Sin uno, Custom le avisa al modelo de que hay una imagen que no puede ver. En una sesión confidencial solo describe las imágenes un modelo auxiliar de esta computadora (un modelo de tus planes nunca lo hace).

## Bifurcaciones y Editar desde aquí

Las sesiones de Custom se pueden bifurcar, igual que las de Claude Code y Codex: menú de la sesión (⋯) → **Bifurcar**. También puedes cambiar un mensaje anterior tuyo con **Editar desde aquí**: la conversación continúa en una copia desde justo antes de ese mensaje, y esta se archiva. Marca **Restaurar los archivos como estaban antes de este mensaje** para deshacer los cambios en los archivos desde entonces. En Custom esto abarca los archivos que cambiaron sus propias ediciones; lo que cambiaron los comandos se queda como está.

Custom guarda cada conversación en el disco, así que continúa después de reiniciar la app.

## Cuánto cuesta Custom

- Modelos a través de OpenRouter: OpenRouter informa de lo que costó cada llamada, y el gasto de la sesión usa ese dato. A los modelos Claude se les pide mantener la conversación en su caché, como hacen los demás por su cuenta, de modo que cada paso la lee de nuevo por aproximadamente una décima parte del precio; y las herramientas que se ofrecen a Custom cambian como máximo una vez en una sesión (las herramientas para comandos que se ejecutan en segundo plano se quedan una vez que se ha ejecutado uno), para que esa caché se mantenga.
- Modelos de tu plan de Claude o ChatGPT (en **Tus suscripciones**): se usa el uso de tu plan, no dinero por token, así que una sesión muestra $0 en esos pasos. Una cuenta que llega a su límite de uso o que ha cerrado sesión pasa el paso a tu siguiente cuenta de ese programa (con **Cambiar de cuenta en un límite** activado).
- Modelos en esta computadora (Ollama, vLLM): nada.
- Otros endpoints: los tokens se calculan al mismo precio que los de los otros agentes (consulta [Uso, límites y costos](/guide/usage)).

La sesión muestra el costo de la API y los tokens de entrada, de caché y de salida encima del cuadro de mensajes, incluso sin un límite de gasto. Los cargos provienen de la respuesta de OpenRouter, o de su registro de generación si falta el cargo transmitido; sus precios de catálogo son la alternativa. No hace falta introducir precios manualmente.

Un [límite de gasto](/guide/usage#cap-what-a-session-spends) también funciona en las sesiones de Custom.

## Configuración → Capacidades → Custom

[Configuración → Capacidades → Custom](/settings?s=custom) (“Modo automático, un entorno aislado para comandos y cuánto duran los objetivos”) tiene tres filas:

- **Modo automático** (uno de los modos de Custom, junto a Preguntar, Aceptar ediciones, Acceso total y Planificar): su (i) explica qué deja pasar el modo automático, qué pregunta siempre y que el modelo auxiliar hace la comprobación. No hay nada que activar: eliges el modo automático en cada sesión en **Permisos**.
- **Entorno aislado para comandos** (en el modo automático, los comandos solo cambian archivos en la carpeta de la sesión y en /tmp en Linux, en las carpetas temporales en un Mac, o en una carpeta temporal propia en Windows; Acceso total se ejecuta sin este entorno aislado ni avisos de aprobación): un interruptor, activado por defecto. Aparece atenuado cuando el entorno aislado no puede ejecutarse aquí (bubblewrap en Linux, Seatbelt en un Mac, Git for Windows y .NET Framework en Windows), y la fila indica el motivo.
- **Rondas antes de pausar un objetivo**, en el grupo **Objetivos** (las rondas que recibe un objetivo nuevo de cualquier agente; puedes fijar otro número en la tarjeta de acuerdo del objetivo): **10**, **30** (el valor por defecto) o **100** rondas. Un objetivo que se queda sin rondas se detiene en su límite, y puedes darle más.

Los modelos de Custom están en [Configuración → Agentes → Modelos](/settings?s=models), y el modelo que hace las comprobaciones es allí el **Modelo auxiliar**.

## Pregunta a un agente

- "Desactiva el entorno aislado para los comandos del modo automático de Custom."
- "Da a los objetivos nuevos hasta 100 rondas."
- "Fija un objetivo en mi sesión de Custom 'Página de subida': que npm test pase y que funcionen las subidas de 2 GB, y pregúntame solo cuando te atasques."
- "¿Qué modelo auxiliar usa el modo automático y puede ver imágenes?"
- "¿Puede esta computadora ejecutar sin red los comandos de mis sesiones confidenciales?"
- "Añade Qwen3 Coder de OpenRouter para que pueda usarlo con Custom." (una vez configurada tu clave de OpenRouter)
- "Muestra mi uso y costos de OpenRouter sin introducir precios de modelos."
- "¿Por qué es tan largo mi primer mensaje a Custom para un modelo local?"
- "¿Qué tan lleno está el contexto de mi sesión de Custom y qué ocupa más?"
- "Ejecuta mi sesión de Custom con el Sonnet de mi plan de Claude en lugar de OpenRouter."
- "¿Qué modelo es Mejor para Custom y pueden mis sesiones de Custom empezar en Automático?"
