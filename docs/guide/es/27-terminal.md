# Hydor en una terminal

El comando `hydor` hace en una terminal lo que haces en las páginas de la app: hablar con un agente y seguir su trabajo mientras ocurre, aprobar lo que pide y responder a sus preguntas, ejecutar una solicitud desde un script y recibir la respuesta, y encargarte de todo lo que guarda la app: tus sesiones, proyectos, agentes, memoria, habilidades, plugins, claves, tareas programadas, uso y todos los ajustes. Cuando solo una página puede hacerlo (dibujar una firma, los editores de diapositivas y de diagramas), el comando te da la dirección de la página. Usa el mismo Hydor que la app, así que una sesión empezada en la terminal aparece en la app, y una empezada en la app continúa en la terminal. Tu shell lo completa mientras escribes.

![El comando hydor: su cuadro de bienvenida y el menú que se abre al escribir una barra diagonal](images/terminal.webp)

## Obtener el comando

- **Instalado con el instalador** (`./install.sh`): el instalador enlaza `hydor` en `~/.local/bin` cuando esa carpeta está en tu PATH, y te lo indica. Si no, te dice dónde está el comando: `bin/hydor.mjs` en la carpeta de Hydor, que puedes ejecutar tal cual o enlazar donde guardes tus comandos.
- **Con Docker**: la imagen lo incluye. Ejecuta `docker exec -it hydor hydor` para hablar con un agente dentro del contenedor.
- **La app para Mac** lo pone en tu PATH por sí sola, cada vez que se inicia. Enlaza `hydor` en `~/.local/bin`, `~/bin`, `/usr/local/bin` o `/opt/homebrew/bin`, la primera de esas carpetas que esté en tu PATH y en la que tengas permiso de escritura. Cuando ninguna cumple, usa `~/.local/bin` y añade una línea, marcada como de Hydor, al archivo de inicio de tu shell (`~/.zprofile` para zsh) para que esa carpeta quede en tu PATH. Después abre una ventana nueva de Terminal. El comando ejecuta el Node.js propio de la app y, cuando la app está cerrada, `hydor` la abre. No hace nada desde la imagen de disco, ni antes de mover la app a **Aplicaciones**. Dentro de la app, `hydor update`, `hydor service install` y `hydor serve` solo avisan de que la app hace eso por sí misma.
- **Las apps de escritorio para Linux y Windows** hacen lo mismo en cada inicio, sin contraseña y sin preguntar. En **Linux** (el AppImage o el .deb) el comando es un pequeño archivo `hydor` en `~/.local/bin`, `~/bin` o `/usr/local/bin`, la primera de esas carpetas que esté en tu PATH y en la que tengas permiso de escritura. Cuando ninguna cumple, usa `~/.local/bin` y añade una línea, marcada como de Hydor, al archivo de inicio de tu shell. El `/usr/bin/hydor` propio del .deb abre la ventana de la app, así que el comando va antes que él en tu PATH. En **Windows** pone `hydor.cmd` en tu carpeta WindowsApps, que Windows ya recorre; si no, en `%LOCALAPPDATA%\Hydor\bin`, que añade a tu PATH. Después abre una terminal nueva (Windows Terminal, PowerShell o Símbolo del sistema). Como en Mac, el comando ejecuta el Node.js propio de la app, cuando la app está cerrada `hydor` la abre, y `hydor update`, `hydor service install` y `hydor serve` solo avisan de que la app hace eso por sí misma. Si ya hay otro `hydor` en tu PATH (el enlace que crea el instalador a una copia de git), la app no toca nada. Desde una copia de Hydor en otra computadora, aún puedes usar la de esa computadora: consulta [Usar el Hydor de otra computadora](#use-another-computers-hydor).

`hydor help` lista todo lo que hace, en grupos con una línea para cada comando; `hydor help <command>` da el uso de un comando, sus opciones y ejemplos, `hydor help options` lista todas las opciones y `hydor help <command> <verb>` las de un verbo. Los comandos de mantenimiento funcionan con el mismo nombre: `hydor service status`, `hydor setup-token`, `hydor update` y los demás (`node dist/server/cli.js …` también sigue funcionando). Si escribes mal un comando, una opción o un verbo, te responde “Did you mean …?”. Los errores se muestran en rojo.

Un mensaje que empieza con el nombre de un comando va entre comillas (`hydor "find the bug in login"`), o después de `hydor chat`, para que no se confunda con el comando.

No tienes que iniciar Hydor primero. Cuando nada responde en esta computadora, el comando lo inicia en segundo plano, dice **Starting Hydor…** y lo deja funcionando al terminar, para que tus sesiones continúen. `hydor status` indica qué Hydor usa, su versión, si se ejecuta como servicio y qué está funcionando. En una computadora con la app de escritorio, en cambio, se abre la app si está cerrada: el comando no inicia un servidor propio.

## Autocompletado con Tab en tu shell

Actívalo una sola vez:

```bash
hydor completion install
```

Lo configura para el shell que usas (bash, zsh o fish): escribe el script donde el shell lo busca y, para zsh y para bash sin bash-completion, añade una línea a tu `.zshrc` o `.bashrc`. Después abre una terminal nueva. Si lo ejecutas de nuevo, no cambia nada por segunda vez. `hydor completion bash` (o `zsh`, `fish`) imprime el script en su lugar, para que lo pongas donde quieras: `source <(hydor completion bash)`.

Entonces Tab completa lo que escribes: los comandos, sus verbos y opciones, y las cosas que reciben. Después de `hydor show ` o `hydor send `, lista las claves de tus sesiones, cada una con su título; después de `--model`, los modelos; después de `--as`, tus agentes; después de `--cwd`, carpetas; y del mismo modo proyectos, habilidades, plugins, ajustes, temas de la guía y más, tal como están en este Hydor. Si Hydor no responde rápido, el autocompletado ofrece lo que puede sin él y nunca bloquea tu shell.

## Hablar con un agente

En una carpeta, ejecuta `hydor`, o `hydor` seguido de tu mensaje (`hydor corrige la prueba que falla`). El primer mensaje empieza una sesión en esa carpeta.

El chat se abre con un panel de bienvenida, un recuadro con **HYDΩR** y su versión en el borde superior. Dentro aparecen la carpeta "en" su rama de git (si git no tiene ninguna que nombrar, no se muestra rama); luego el programa que te responderá (**Claude Code**, **Codex** o **Custom**), el modelo (**Automático** cuando el modelo se elige según la tarea, en un Hydor con niveles) y el modo de permisos, con un · entre ellos; el modo se muestra en rojo cuando el agente actúa sin preguntar, y en el color de acento para planificar; y una línea de pistas: `/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`. El recuadro mantiene un solo ancho sin importar el nombre de la carpeta.

Lo que ves se queda en el historial propio de la terminal, así que puedes desplazarte hacia atrás y copiar de él, también por SSH y en tmux:

- **Tus mensajes**, después de un `›`.
- **El texto del agente** a medida que llega, con sus encabezados, listas, citas, tablas, enlaces (la dirección va después de las palabras) y código (nunca se vuelve a ajustar, así que lo que copias se ejecuta).
- **Cada paso** en una línea: lo que leyó, buscó, editó (con las líneas añadidas y eliminadas), ejecutó (con el tiempo que tardó y, si falló, su código de salida, con la primera línea del error debajo).
- **Pensamientos** como una línea tenue, por ejemplo "Thought for 8 s". Empieza con `--thinking` para verlos completos, y con `-v` para ver las primeras líneas de la salida de cada paso.
- **Subagentes**: "Subagent started" cuando el agente entrega parte de su trabajo a un [subagente de Hydor](/guide/research#let-an-agent-hand-work-to-subagents), y "Subagent finished" (o "Subagent failed") cuando vuelve su respuesta. Claude Code también puede ejecutar subagentes propios en segundo plano y terminar su turno mientras trabajan: las líneas inferiores indican cuáles trabajan en segundo plano, "Finished in the background" aparece cuando termina cada uno, y el agente continúa por sí solo. Un comando que deja ejecutándose en segundo plano, como un servidor de desarrollo, no retiene nada. `/subagents` los lista todos con lo que hace cada uno (y lo que costó un subagente).
- **El final de cada turno**: cuánto tardó, cuánto costó, el modelo y cuántos subagentes trabajaron ("1 subagent", "3 subagents").

Abajo, unas pocas líneas cambian mientras el agente trabaja: el texto que aún se está escribiendo, el paso en curso, los subagentes que trabajan, un indicador de progreso en color con el tiempo transcurrido (un destello recorre "Working") y tu línea de entrada. Pulsa Esc o Ctrl+C para detener el turno.

### La línea de entrada

Tu entrada queda entre dos líneas finas, con una línea de estado debajo: la carpeta en su rama, el modelo y el modo, y el costo hasta ahora, con `/help` a la derecha.

- **Una sugerencia en gris** tomada de tus mensajes anteriores aparece después de lo que escribes. **→** la acepta, **Alt+→** acepta una palabra. **Configuración → App → General → Sugerencias en la terminal** la desactiva y la activa ([Configuración](/settings?s=general&find=Terminal%20suggestions)).
- **Ctrl+R** busca en tus mensajes anteriores: escribe algunas de sus palabras, muévete a una coincidencia con **↑** y **↓**, y **Enter** la pone en la línea sin enviarla, para que puedas cambiarla antes. **Esc** cancela.
- Un mensaje puede tener varias líneas, y lo que pegas entra completo.

### El menú de autocompletado

Un menú se abre bajo la línea mientras escribes y sigue cada tecla:

| Escribe | El menú muestra |
| --- | --- |
| `/` | Los comandos, cada uno con lo que hace: primero los propios del chat, luego los del programa (los comandos y habilidades de Claude Code, por ejemplo). |
| `/model `, `/mode `, `/effort `, `/agent `, `/subagents `, `/open ` | Los valores de ese comando: los modelos, modos, esfuerzos, tus agentes, los subagentes, dónde abrir. |
| `@` y unas pocas letras | Los archivos de la carpeta de la sesión, encontrados de forma flexible: `@clits` encuentra `src/cli.ts`. Termina con `/` para explorar esa carpeta. |

**↑** y **↓** se mueven, **Tab** completa la fila resaltada, y **Enter** la completa y la ejecuta (un comando que necesita un valor abre en cambio los valores de ese comando). **Esc** cierra el menú. La coincidencia es flexible, y las letras de un comando no tienen que estar juntas: `mdl` encuentra `/model`.

### Selectores

`/sessions`, `/resume`, `/model`, `/effort`, `/mode` y `/agent`, escritos sin valor, abren un selector: una lista con una fila resaltada. **↑** y **↓** se mueven, al escribir se acota la lista, **Enter** elige, **Esc** sale. Un dígito sigue eligiendo cuando la lista tiene nueve filas o menos. `hydor resume` sin clave abre el mismo selector con tus sesiones.

### Comandos de shell con `!`

Empieza una línea con `!` y el resto se ejecuta como un comando de shell en la carpeta de la sesión: `!git status`, `!npm test`. El chat cede la terminal mientras se ejecuta, así que los programas interactivos funcionan (`!vim notes.md`, `!htop`), y la recupera cuando termina. El indicador se pone amarillo mientras la línea empieza con `!`. El agente no ve el comando ni lo que imprimió; para mostrarle algo, dilo en un mensaje. Solo funciona con el Hydor de esta computadora.

### Responder lo que pide el agente

Cuando el agente necesita tu aprobación, la solicitud aparece con lo que trata (el comando, el cambio en un archivo, el plan) y sus opciones debajo:

- Pulsa **y** para la primera opción que lo permite, **n** para rechazarlo, o el **número** de cualquier opción (como "Always allow").
- Para rechazarlo y decirle al agente qué hacer en su lugar, escríbelo y pulsa Enter.

Una pregunta muestra sus opciones numeradas: pulsa un número para elegir una (varias, en una pregunta que admite varias, y luego Enter), o escribe tu propia respuesta y pulsa Enter. Esc la omite. Un formulario pide sus campos uno por uno: escribe cada respuesta y pulsa Enter, o pulsa Enter para conservar lo que muestra. Un archivo se pide por su ruta en esta computadora.

Algunas solicitudes necesitan la app: una sobre una firma, o una clave para una de tus apps. La terminal lo indica y da la dirección de la sesión en la app.

### Cuando el navegador del agente te espera

Lo que el navegador de un agente espera de ti aparece como una tarjeta en el chat, después de cualquier aprobación que esté antes, con las palabras que usa la app (consulta [El navegador que usan los agentes](/guide/web#the-browser-agents-use)):

- "Needs you in the browser: …", para un inicio de sesión, una verificación o cualquier cosa de la que el agente no esté seguro, con la dirección de la página debajo.
- "Stopped before paying or ordering: …. That is yours to do".
- "Wants to open localhost:3000, on this machine or its network".
- "Wants to press “Send” on mail.example.com", para un botón que envía, publica, elimina o transfiere en un sitio donde el navegador tiene la sesión iniciada (consulta [Botones que envían, publican o eliminan](/guide/web#buttons-that-send-post-or-delete)); la tarjeta añade que lo pulsa solo si lo permites.
- La pregunta emergente de una página: lo que dice el sitio (o si preguntas si salir), con su mensaje.

La tarjeta muestra sus teclas, y una pulsación la responde:

- Para una dirección o un botón: **y** lo permite (una dirección, durante esta sesión) y **n** no.
- Para un inicio de sesión, una verificación o un pago, que solo tú puedes hacer en la página: **o** abre en tu navegador la página de la sesión en la app, para que tomes el control allí, **d** indica que terminaste, y **n** indica que no puedes (o que ahora no, en un pago).
- Para una pregunta emergente: **y** es Aceptar (Salir, en "¿Salir de esta página?") y **n** es Cancelar (Quedarse). Una alerta solo tiene Aceptar. Para una pregunta de texto, escribe tu respuesta y pulsa Enter, o pulsa **y** para conservar lo que muestra, o **n** para cancelar.

La terminal no puede mostrar la página en sí, así que usa **o** para tomar el control. Cuando se responde, la tarjeta se reduce a una línea: "Done in the browser", "Skipped", "Allowed" o "Not allowed".

### Mientras trabaja

Tu línea de entrada sigue siendo tuya. Lo que hace Enter con un mensaje que envías mientras el agente trabaja lo define **Enviar mientras un agente trabaja** en [Configuración → App → General](/settings?s=general&find=Sending%20while%20an%20agent%20works): **Unirse al turno** (el valor predeterminado, como en la app) lo incorpora al turno en curso, y **Esperar** lo pone en cola, para que salga cuando termine el turno (aparece como **queued**). Sea cual sea el ajuste, dos comandos deciden por un mensaje:

- `/queue <mensaje>` siempre espera a que termine el turno.
- `/now <mensaje>` siempre se une al turno en curso.

Los dos ajustes del dispositivo, **Enviar mientras un agente trabaja** y **Sugerencias en la terminal**, son propios del chat: cámbialos aquí, con `hydor settings set general.sending-while-an-agent-works wait`, o pide al agente que cambie uno (consulta [Configuración](#settings)), y el chat lo sigue de inmediato.

### Teclas

- **Enter** envía. **Alt+Enter**, **Ctrl+J**, o una `\` al final de la línea antes de Enter, añade una línea. Lo que pegas entra completo, con sus saltos de línea.
- **↑** y **↓** recorren tus mensajes anteriores (se guardan los últimos 500); en un mensaje de varias líneas se mueven primero entre sus líneas. Con el menú abierto se mueven en él.
- **←**, **→**, **Inicio**, **Fin**, **Ctrl+A** y **Ctrl+E** mueven el cursor; **Alt+←** y **Alt+→** lo mueven de una palabra en una palabra; **Ctrl+W** elimina la palabra antes del cursor, **Ctrl+U** y **Ctrl+K** el resto de la línea antes y después de él.
- **Tab** abre el menú y acepta la fila resaltada. **Ctrl+R** busca en los mensajes anteriores.
- **Esc** cierra el menú o detiene el turno. **Ctrl+C** detiene el turno cuando hay uno en curso, borra la línea cuando hay texto, y en otro caso sale si lo pulsas dos veces. **Ctrl+D** en una línea vacía sale. **Ctrl+L** limpia la pantalla. **Ctrl+Z** suspende el chat (`fg` lo recupera).

`/keys` las lista en el chat. Cuando sales, la sesión continúa: la terminal te dice cómo volver a ella.

### Comandos

Escríbelos en la línea de entrada (`/` los lista):

- `/help`: los comandos, las teclas y algunas cosas más (`@`, `!`), en secciones: **Comandos**, **Claves**, **Also**. `/keys` lista solo las teclas.
- `/new` (y un mensaje): una nueva sesión en la misma carpeta.
- `/sessions` (o `/resume`): elige otra sesión para continuar.
- `/model`, `/effort`, `/mode`: cambian el modelo, cuánto piensa y lo que puede hacer sin preguntar. Sin un nombre, cada uno abre un selector.
- `/agent`: trabaja como uno de [tus agentes](/guide/agents), desde el siguiente mensaje.
- `/subagents`: los subagentes, también los de segundo plano, lo que hace cada uno (y lo que costó un subagente); `/subagents 2` muestra la conversación del segundo subagente.
- `/tiers`, `/usage`, `/cost`: qué modelo significa cada nivel, el uso y los límites de tus planes, y lo que cuestan esta sesión y sus subagentes.
- `/copy`: copia la última respuesta del agente al portapapeles, también por SSH y en tmux. `/clear` limpia la pantalla.
- `/queue` y `/now`: envían un mensaje para que espere o para que se una, según el ajuste ([Mientras trabaja](#while-it-works)).
- `/stop`, `/rename`, `/open`, `/quit`: detienen el turno y los subagentes en segundo plano, renombran la sesión, muestran su dirección en la app, salen.
- `/hydor <comando>`: ejecuta en el chat cualquier comando de las siguientes secciones ([Dentro del chat](#inside-the-chat)).

Cualquier otro `/comando` va al agente tal cual, para los comandos y habilidades propios del programa.

Los colores son de color verdadero donde la terminal lo admite. `NO_COLOR` y `--no-color` los desactivan, y también una tubería.

## Continuar una sesión

- `hydor -c` continúa la última sesión de la carpeta en la que estás.
- `hydor resume` abre un selector con tus últimas sesiones; `hydor resume 6f1e2a3b` continúa esa.

Primero se muestran los últimos turnos, cada uno con su trabajo resumido en una línea ("Ran 3 commands, read 4 files"); `hydor show` imprime todo.

## Elegir cómo empieza una sesión

Estas opciones van con `hydor`, `hydor run` y `hydor resume`:

- `--agent claude`, `codex`, `custom`, o el nombre de [otro programa de agente](/guide/agents-models): qué programa responde.
- `--model` (el nombre de un modelo, o `auto` para Automático), `--effort`, y `--mode ask`, `edits`, `plan` o `full` (o el nombre propio del programa para un modo).
- `--as Researcher`: empieza como uno de [tus agentes](/guide/agents).
- `--cwd` (una carpeta; la carpeta en la que estás si lo omites), `--worktree` (una rama y una carpeta propias), `--cap 2` (gastar como máximo $2), `--no-memory`, `--title`.

Lo que omitas viene de lo que eligió por última vez la página de inicio de la app, y luego de los valores predeterminados de la app.

## Una solicitud desde un script

`hydor run "…"` (o `hydor -p "…"`) empieza una sesión con tu mensaje, la sigue hasta que el trabajo termina, imprime la última respuesta del agente y finaliza. Terminado significa que el turno acabó, que ningún subagente sigue trabajando ni debe todavía su respuesta (incluidos los subagentes de Claude Code en segundo plano, ya sean del agente o de un subagente), y que no queda nada en la cola: un agente que termina su turno para esperar a sus subagentes se reactiva con las respuestas de ellos o cuando terminan, y la ejecución espera también ese turno. Un comando que se queda ejecutándose en segundo plano, como un servidor de desarrollo, no la retiene. Con `--timeout` o Ctrl+C, los subagentes en segundo plano se detienen junto con el turno. Si no pones nada después, lee el mensaje de lo que le llega por una canalización: `git diff | hydor run "revisa este cambio"`.

- En una terminal, unas líneas cortas al margen indican lo que ocurre (cada paso, los subagentes al empezar y al terminar); `-q` las desactiva.
- Como no hay nadie para responder, una aprobación o una pregunta detiene la ejecución, indica lo que se preguntó, y la sesión te espera en la app o con `hydor resume`. Lo que espera el navegador del agente hace lo mismo (un inicio de sesión, un pago, una dirección o un botón que hay que permitir, una pregunta en una ventana emergente), y la ejecución lo dice: "El navegador del agente: Quiere pulsar “Eliminar” en mail.example.com". Con `--mode full` (o `-y`) el agente no pregunta nada.
- `--json` imprime un objeto al final: `key`, `url`, `status`, `reply`, `model`, `costUsd` (con el de sus subagentes), `tokens`, `durationMs`, `turns`, `children` (de cada subagente de Hydor: `title`, `label`, `tier`, `costUsd`, `status`) y `error` si falló. `--stream-json` imprime una línea por cada cambio a medida que ocurre (`item`, `live`, `note`) y, como última línea, ese objeto.
- `--timeout 300` detiene el turno después de 300 segundos.

Termina con un código de salida que un script puede comprobar:

| Código | Qué ocurrió |
| --- | --- |
| 0 | Terminado |
| 1 | La sesión falló (un error, o el límite de uso del plan, que se nombra), o Hydor la rechazó |
| 2 | El comando no se usó correctamente |
| 3 | Necesita una respuesta tuya |
| 124 | Tardó más que `--timeout` |
| 130 | Pulsaste Ctrl+C (antes se detuvo el turno) |

## Todo lo que hace la app, desde la terminal

Cada parte de la app tiene su propio comando, con verbos para lo que hace su página. Si omites el verbo, lista: `hydor projects` equivale a `hydor projects list`. `hydor help` los muestra agrupados como abajo, y Tab completa los verbos, las opciones y las cosas que reciben.

Cómo funcionan todos:

- **Nombrar cosas**: donde un comando recibe un elemento (una sesión, un proyecto, un agente, una habilidad…), indica su id o el comienzo de este, o su nombre o título (con mayúsculas o minúsculas, si solo coincide uno). Si hay dos o más coincidencias, lista hasta cinco. En una terminal, si omites el nombre, el comando te ofrece una lista para elegir.
- **Cambiar cosas**: los campos son opciones (`--description`, `--name`). Un texto largo viene de `--file <path>`, de lo que envíes por una tubería con `-` o, en una terminal sin ninguna de las dos, de tu editor (`$VISUAL`, `$EDITOR`) abierto con el texto actual: si lo guardas sin cambios, no se cambia nada.
- **Quitar cosas** pregunta `Remove “name”? [y/N]`. `-y` (o `--yes`) responde que sí. Sin terminal y sin `-y`, se niega en lugar de adivinar.
- **`--json`** imprime lo que devuelve la API de la app, tal como lo devolvió, para scripts.
- **Códigos de salida**: 0 cuando termina, 1 cuando Hydor se negó o falló (dice por qué), 2 cuando el comando no se usó bien (dice qué escribir).
- **Hydor de otra computadora**: todos los comandos funcionan con `--server` y `--token`.
- **Solo una página puede hacerlo**: el comando lo dice y da la dirección de la página. `hydor open … --browser` la abre.

### Sesiones

| Comando | Qué hace |
| --- | --- |
| `hydor sessions` | Tus últimas sesiones, cada una con una marca: ● trabajando, ● te necesita, ✓ terminada, ✗ error. Sus verbos hacen lo que el menú de una sesión: `search`, `rename`, `archive` y `unarchive`, `pin` y `unpin`, `read`, `snooze`, `move` a un proyecto, `fork`, `goal`, `share` (un enlace de solo lectura), `changes` (los archivos que cambió), `commands` (los comandos que ejecutó), `queue` (los mensajes en espera, y `queue clear` y `queue remove`), `show`, `export` (la conversación como archivo Markdown, `-o -` para imprimirla, o `--library` para un documento en el proyecto de la sesión), `send`, `stop` y `delete`. |
| `hydor inbox` | Lo que espera por ti (aprobaciones, preguntas, una clave que pidió un agente, una habilidad por revisar): `list`, y `show` para un elemento, con el lugar donde responderlo. |
| `hydor outbox` | Llamadas retenidas a la espera de tu visto bueno (las herramientas de una cuenta conectada en Preguntar primero): `list`, `show` para una con su entrada, `send` (tal cual, o con `--set NAME=value` para cambiar un campo) y `drop`. |
| `hydor away` | Lo que pasó desde tu última visita, como lo muestra **Mientras estabas fuera** en la página de inicio: lo que espera por ti, las sesiones que terminaron o fallaron, lo que se ejecutó solo con su costo y lo que se ejecuta a continuación hoy. `hydor away seen` lo marca todo como visto. |

`hydor show 6f1e2a3b` es lo mismo que `hydor sessions show 6f1e2a3b`, y también `send` y `stop`: los atajos se mantienen.

```bash
hydor sessions search login          # sesiones sobre el inicio de sesión
hydor sessions rename 6f1e "Arreglar el error del inicio de sesión"
hydor sessions fork 6f1e "pruébalo con una caché en su lugar"
hydor sessions export 6f1e -o notes.md  # la conversación como Markdown
hydor inbox
hydor away                           # lo que pasó mientras estabas fuera
```

### Tu trabajo

| Comando | Qué hace |
| --- | --- |
| `hydor projects` | `list`, `show`, `new`, `rename`, `edit` (descripción, pautas, el agente con el que empieza, carpetas), `sessions`, `files` (los documentos que lee: `files add` y `files remove`) y `remove`. |
| `hydor tasks` | Tus [tareas programadas](/guide/tasks) y el resto del trabajo que empieza solo: `list`, `show`, `new` (cuándo se ejecuta: `--every 2h`, `--at 09:00 --days weekdays`, `--cron`, `--once`; o `--webhook`, `--watch-feed`, `--watch-page`, `--watch-folder`, o `--watch-account` con `--tool` para elementos nuevos en una app conectada, y `--before 30m` para un tiempo antes de cada evento de un calendario), `edit`, `pause`, `resume`, `run` (ahora, incluso en pausa), `runs` (las últimas ejecuciones, `--reply` para la última respuesta) y `remove`. Vigilar un comando o una dirección JSON se hace en la página. Las actualizaciones de una tarjeta de un tablero aparecen listadas como del tablero (“Tienda · Ventas por día: actualizar”): `pause`, `resume` y `run` funcionan con ellas, y `show` dice dónde cambiarlas, en el tablero. |
| `hydor apps` | Tus [apps](/guide/apps) y las ya preparadas: `list`, `show`, `run` (las respuestas del formulario como `field=value`, o JSON con `--input`; imprime la respuesta y lo que costó), `runs`, `run-show` (una ejecución) y `remove`. `hydor app …` (sin la s) crea apps como archivos: `new`, `folder`, `dev`, `try`, `export`, `import`. |
| `hydor files` (también `hydor library`) | Lo que los agentes hicieron para ti y lo que guardaste, como lo muestran los **Archivos** de los proyectos ([páginas, imágenes, videos y sitios](/guide/library)): `list` (`--kind`, `--project`), `search`, `show` (el texto de un documento, las tarjetas de un tablero o qué es el elemento), `export` (`--to pdf`, `docx`, `pptx`…, `-o file`), `open` (la dirección de su editor), `remove`, `refreshes` (qué se actualiza en tus tableros, cuándo y cuánto cuesta) y `refresh` (una tarjeta de un tablero, o todas, ahora). |
| `hydor experiments` | Ejecuciones de entrenamiento y evaluación: `list`, `show` y `stop`. Iniciar una ejecución les corresponde a los agentes y a la página. |

```bash
hydor projects new Tesis
hydor projects edit tesis --file guidelines.md
hydor tasks new --at 09:00 --days weekdays "Resume mis correos sin leer"
hydor apps run trip-planner destination=Lisbon days=5
hydor files export "Informe del T3" --to pdf -o q3.pdf
```

### Agentes y modelos

| Comando | Qué hace |
| --- | --- |
| `hydor models` y `hydor tiers` | Los modelos que ofrece cada programa, y qué modelo significa cada [nivel](/guide/agents-models#tiers-a-model-for-each-kind-of-job) (`hydor tiers set claude best opus --effort high`, `hydor tiers reset`; `hydor tiers team off` y `hydor tiers hard off` desactivan **Liderar con subagentes** y **Máximo para problemas difíciles**, y `on` los vuelve a activar). |
| `hydor usage` | El uso y los límites de cada plan, y cuándo se restablecen. |
| `hydor agents` | [Tus agentes](/guide/agents): `list`, `show`, `new`, `edit`, `results`, `export`, `install` y `remove` (los incluidos se pueden copiar, no cambiar). El destino de los resultados de un agente es `--results-to` en `new` y `edit`, una vez por cada lugar: `library` (la misma página, actualizada), `library:new`, `sheet` (una fila en una hoja de cálculo propia), `sheet:<spreadsheet>#<tab>`, `email:<addresses>`, `notify`, `file:<path>`, `webhook:<url>` o `none`. Sus campos de salida se definen en su página (`hydor open agents`); `results` lista lo que devolvió, una fila por cada resultado. `export` guarda uno como archivo `.hydor-agent` (`-o` para darle nombre) y dice qué se dejó fuera; `install <file>` dice qué trae y qué necesita un archivo, luego pregunta, y lo instala junto al tuyo del mismo nombre salvo que uses `--replace` (`--schedules` añade las programaciones que sugiere, en pausa). Consulta [Compartir un agente como archivo](/guide/agents#share-an-agent-as-a-file). |
| `hydor accounts` | Los inicios de sesión de Claude Code y Codex: `list`, `show` (una cuenta: quién tiene la sesión iniciada y el plan, si las sesiones nuevas empiezan con ella, su uso y sus límites, si hay una clave de API guardada (nunca la clave) y si una sesión cambia al llegar a un límite), `add <program> <name>` (otra cuenta, con la sesión iniciada de inmediato), `sign-in`, `sign-out`, `remove` y `use` (la cuenta con la que empiezan las sesiones nuevas). La clave de API para el crédito de API y los cambios al llegar a un límite de uso son opciones de configuración (`accounts.*`). |

```bash
hydor agents new Bookkeeper --tools read,edit --tier standard
hydor agents edit bookkeeper --results-to sheet --results-to email:sam@example.com
hydor agents export bookkeeper -o ~/Desktop/bookkeeper.hydor-agent
hydor agents install bookkeeper.hydor-agent --schedules
hydor tiers set claude best opus --effort high
hydor accounts add claude Trabajo
hydor accounts use trabajo
```

### Lo que los agentes saben y usan

| Comando | Qué hace |
| --- | --- |
| `hydor memory` | Lo que los agentes recuerdan sobre ti: `list`, `search`, `show`, `add`, `edit`, `forget` (se puede restaurar durante 30 días) y `restore`, y `profile` y `profile edit` para lo que todo agente lee primero. `--scope`, `--project` y `--session` indican de quién son las notas. |
| `hydor guidelines` | `show` y `edit` lo que todo agente sigue: para todas las sesiones, para un proyecto (`--project`) o para una sesión (`--session`). |
| `hydor skills` | Las habilidades que usan los agentes: `list`, `show`, `on`, `off`, `add` (desde un `SKILL.md` o una carpeta) y `remove`. `--agent claude` o `--agent codex` es para las habilidades propias de esos programas. |
| `hydor plugins` | Complementos con habilidades y herramientas: `list`, `show`, `on`, `off`, `add` (incluido, una dirección de Git, un .zip o una carpeta) y `remove`. Crear un plugin propio se explica en su página (`hydor open plugins`). |
| `hydor mcp` | Servidores de herramientas (MCP) para Claude Code y Codex: `list`, `show` (un servidor: su programa, alcance, comando o dirección, los nombres de sus variables de entorno y encabezados con los valores ocultos, si está activado o desactivado, y con `--tools` cuántas herramientas tiene), `status` (inicia cada uno y dice cuáles funcionan), `add`, `edit` y `remove`. |
| `hydor connections` | Las [apps conectadas](/guide/connections) (Notion, GitHub, Gmail…): `list`, `show`, `services` (lo que se puede conectar), `connect <service>` (una clave escrita de forma oculta, o un inicio de sesión en tu navegador que el comando espera) y `disconnect`. Qué herramientas de una conexión están activadas se define en su página. |
| `hydor keys` | La [bóveda](/guide/connections): `list` los nombres de tus claves y adónde puede ir cada una, `set <NAME>` y `remove <NAME>`. El valor se pide con lo que escribes oculto, o se lee de lo que envíes por una tubería; nunca se escribe como opción (tu shell lo guardaría) y nunca se imprime. |

```bash
hydor memory add Prefiero respuestas cortas
hydor memory forget 42
hydor skills off research
hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp
hydor keys set GITHUB_TOKEN --domain github.com
hydor guidelines edit --project tesis
hydor connections connect notion --browser
```

### Configuración

`hydor settings` llega a todas las opciones de [Configuración](/settings), en sus tres grupos (**App**, **Agentes**, **Capacidades**) y sus secciones. Cada opción tiene un id, como `general.resume-after-usage-limits`: su sección y luego sus palabras. Puedes nombrar una por ese id, por su sección y el comienzo de sus palabras (`general.resume`), o solo por sus palabras cuando únicamente coincide una; Tab las completa.

En una terminal, `hydor settings` solo abre un explorador: elige una sección y luego una opción. **↑** y **↓** y escribir las encuentran, **Enter** abre una sección o cambia una opción (un interruptor se activa o desactiva, una elección ofrece sus valores, un número o un texto se escribe, un botón pregunta primero) y **Esc** vuelve atrás. Con una tubería, lista todas las opciones. Para scripts y cambios rápidos:

| Comando | Qué hace |
| --- | --- |
| `hydor settings list [section]` | Todas las opciones con su valor, o las de una sección. |
| `hydor settings get <option>` | El valor de una opción y lo que admite. |
| `hydor settings set <option> <value>` | La cambia: un interruptor admite `on` u `off`, una elección uno de sus valores, un número un entero, una lista sus elementos separados por comas (`none` la vacía). Una clave o un token se pide de forma oculta, o se lee de lo que envíes por una tubería. Un texto largo viene de `--file` o de tu editor. |
| `hydor settings run <option>` | Pulsa un botón de la página (**Enviar una prueba**, **Comprobar ahora**…), preguntando antes cuando elimina o descarga algo. |
| `hydor settings open [section]` | La dirección de una sección o una opción en la app. |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

Lo que la app guarda en cada navegador (el tema, el idioma, el sonido de las notificaciones) no se puede cambiar desde aquí: una opción así lo dice y da la dirección de la página. Una opción que solo la página puede cambiar hace lo mismo. Las dos opciones de dispositivo que pertenecen a una terminal, **Enviar mientras un agente trabaja** y **Sugerencias en la terminal**, son propias del chat, y `hydor settings set` las cambia.

### Find, guide, open y api

- `hydor find rate limit` busca todo lo que busca el cuadro de búsqueda (**Ctrl+K**): páginas, configuración y sus opciones, sesiones, memoria, habilidades… `--in settings` busca solo ahí, `--urls` muestra la dirección de cada resultado debajo, y `--open 2` abre el segundo en tu navegador.
- `hydor guide` lista los temas de la guía; `hydor guide projects` lee uno en la terminal, y `hydor guide projects "what a project is"` una sección de él. `--sections` lista las secciones de un tema.
- `hydor open` imprime la dirección de la app; `hydor open published`, `hydor open settings memory`, `hydor open project thesis`, `hydor open guide projects` o `hydor open 6f1e2a3b` (una sesión) imprimen la de esa página. `--browser` la abre también en tu navegador. Así llegas a lo que solo hace una página: los editores de diapositivas, hojas de cálculo, imágenes y diagramas, una firma, los colores de un tema, iniciar sesión en un servicio.
- `hydor api GET /api/projects` llama a cualquier endpoint de la API de la app e imprime su JSON (`hydor api POST /api/projects -d '{"name":"Thesis"}'`; el cuerpo puede venir de `@file` o de `-`). Los endpoints están en el [tema de la API](/guide/api).

### Dentro del chat

`/hydor <command>` ejecuta cualquiera de los comandos anteriores sin salir de la conversación: `/hydor sessions`, `/hydor memory search docker`, `/hydor settings get general.resume-after-usage-limits`. Está en el menú `/` y en la parte **También** de `/help`. Después de `/hydor `, su menú lista las áreas, luego sus verbos, luego lo que recibe cada uno (tus proyectos, sesiones, configuración, carpetas… como los completa Tab en un shell) y sus opciones cuando escribes un `-`. Lo que imprime el comando se muestra sobre la línea de entrada, y un uso incorrecto o una respuesta que Hydor rechaza se muestra en rojo; el chat continúa. El comando pregunta como en un shell, pero dentro del chat: una pregunta (una eliminación) abre un selector cuya primera fila es **No**, una clave o un token se escribe en la línea de entrada, se muestra como puntos y nunca se guarda en tu historial, y a un editor que necesite se le entrega la terminal, como hace `!`. En el chat no hay entrada por tubería, así que da un texto largo con `--file <path>` (o déjalo fuera para escribirlo en el editor). Un comando que tiene su propio comando con barra (`models` tiene `/model`, `tiers` tiene `/tiers`, `usage` tiene `/usage`) o que es para un shell (`run`, `serve`) lo dice, e indica cuál usar.

## Cuidar esta instalación de Hydor

- `hydor status` indica si Hydor se está ejecutando, su versión y dirección, dónde están sus datos, si es un servicio y qué sesiones están trabajando o te necesitan (con las mismas marcas que `hydor sessions`).
- `hydor serve` ejecuta Hydor aquí, en primer plano, hasta que pulses Ctrl+C. `hydor service install` lo mantiene en marcha como servicio en segundo plano, `hydor update` descarga el código más reciente, lo compila y reinicia, y `hydor set-password`, `hydor setup-token` y `hydor access-token` hacen lo que su nombre indica. En la app para Mac, `hydor update`, `hydor service install` y `hydor serve` avisan de que la app se encarga de eso por sí sola.
- `hydor open` muestra la dirección de la app; con `--browser` la abre.
- `hydor machines phone` indica si Tailscale está instalado y con la sesión iniciada aquí, y la dirección en la que se sirve la app en tu tailnet, con un código QR para la cámara de tu teléfono. `hydor machines phone serve` publica la app para tus propios dispositivos (usa `--port 8443` cuando haya algo más en la dirección habitual) y `hydor machines phone stop` la deja de publicar, igual que [Configuración → App → Usar en tu teléfono](/settings?s=phone).

## Usar Hydor de otra computadora

Crea un token de acceso en esa computadora (en su [Configuración → App → Máquinas](/settings?s=machines&find=Access%20from%20other%20machines) → **Nuevo token**, o con `hydor access-token "my laptop"` allí), y luego indícalo junto con su dirección:

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

o define una sola vez `HYDOR_URL` y `HYDOR_TOKEN`. Las carpetas son las de esa computadora: una sesión empieza en su carpeta predeterminada, a menos que indiques `--cwd` con una carpeta de allí (una dirección de esta misma computadora, como `http://localhost:8790`, conserva la carpeta en la que estás). Los comandos con `!` solo funcionan con el Hydor de esta computadora. En esta computadora, el comando crea un token propio la primera vez, que [Configuración → App → Máquinas](/settings?s=machines&find=Access%20from%20other%20machines) muestra como “This computer's command line”. Para que este Hydor muestre las sesiones y las páginas de otra computadora, añádela como máquina: `hydor machines` lista las máquinas que usa este Hydor y si responden, `hydor machines add Lab --url https://lab.example.com` añade una (indica `--ssh <host>` en lugar de `--url` para llegar a ella por SSH; su token de acceso se escribe oculto, o viene de `--file -`), y `hydor machines remove lab` deja de usarla.

## Colores y canalizaciones

Los colores están activados en una terminal (color verdadero cuando está disponible) y desactivados cuando la salida va a un archivo o a otro programa, y también con `NO_COLOR` definido o con `--no-color`; `FORCE_COLOR` los activa. Cuando lo que escribes se canaliza como entrada (`echo "…" | hydor`), funciona como `hydor run`. Cuando solo se canaliza la salida, la conversación se imprime sin colores ni líneas cambiantes, y cada línea que escribes se envía. Las listas como `hydor sessions` imprimen entonces las mismas columnas, sin colores y sin recortar lo que es largo, para que los scripts puedan leerlas. En una terminal estrecha, una lista omite columnas enteras (primero una descripción, luego otras como una dirección o una antigüedad) en lugar de recortar los nombres y los títulos. Donde los símbolos no se pueden mostrar (la consola de Linux, una configuración regional que no es UTF-8 y la consola antigua de Windows), el comando dibuja con caracteres simples: `+-|` para el recuadro, `>` para el indicador, `*`, `+` y `x` para las marcas, y HYDOR para el logotipo. `HYDOR_ASCII=1` activa esto en cualquier lugar y `HYDOR_ASCII=0` lo desactiva. Lo que va a un archivo o a otro programa conserva sus símbolos, salvo que se defina `HYDOR_ASCII=1`.

## Pregunta a un agente

- “¿Cómo hablo con un agente desde mi terminal?”
- “Activa la autocompletación con Tab del comando hydor en mi shell.”
- “Dame un script que ejecute una revisión de mis cambios preparados con hydor run y haga fallar el commit cuando encuentre un error.”
- “¿Qué significa el código de salida 3 de hydor run?”
- “El navegador del agente quiere pulsar Enviar en un sitio: ¿qué pulso en la terminal?”
- “Mi hydor run se detuvo porque el navegador del agente espera un inicio de sesión: ¿cómo continúo?”
- “Configura el comando hydor en mi laptop para que use el Hydor de esta computadora.”
- “¿Qué comando de hydor lista mis tareas programadas y cómo desactivo una desde la terminal?”
- “¿Qué comando de hydor guarda la conversación de una sesión como un archivo Markdown?”
- “Haz que la terminal espere a que termine un turno antes de enviar mi mensaje.”
- “Desactiva las sugerencias grises en la terminal.”
