# Pautas de los agentes

Las Pautas de los agentes son lo que quieres que sigan todos los agentes de aquí: cómo te gusta trabajar, qué hacer siempre o nunca, cómo hablarte. Un solo texto sirve para todos los agentes (Claude Code, Codex, Custom y los agentes que hablan ACP), y puedes escribirlo para todas las sesiones, para un proyecto o para una sesión.

![Configuración → Pautas de los agentes: lo que sigue cada sesión y las pautas de cada proyecto](images/guidelines.webp)

## Qué son las pautas

Las pautas son palabras sencillas que la app entrega al agente cuando empieza una sesión, antes de tu primer mensaje: “Responde en lenguaje sencillo y explica cualquier jerga”, “Pregunta antes de eliminar algo”, “Guarda lo que crees en ~/Work”, “Escribe con ortografía británica”. El agente las sigue durante toda la sesión.

No necesitas saber cómo lee cada agente sus instrucciones. Claude Code y Codex tienen cada uno sus propios archivos para esto (CLAUDE.md y AGENTS.md), y otros agentes tienen sus propias formas; la app entrega tus pautas a cada uno por su cuenta, así que un solo texto basta para todos.

Lo que pides en la conversación siempre tiene prioridad: si tus pautas dicen “respuestas cortas” y pides un informe detallado, recibes el informe.

## Los tres niveles

Las pautas tienen tres niveles, del más general al más específico:

1. **Para todas las sesiones**: todos los agentes, en todas las sesiones. Se configura en [Configuración → Agentes → Pautas de los agentes](/settings?s=guidelines).
2. **Para un proyecto**: todas las sesiones de ese [proyecto](/guide/projects). Se configura en los detalles del proyecto (su pestaña **Configuración**), en el campo **Pautas de los agentes**.
3. **Para una sesión**: solo esa sesión. Se configura en la página de inicio (**Opciones → Pautas**) antes de empezarla, o más tarde desde el menú de la sesión (⋯) → **Configuración de la sesión → Pautas**.

Un agente recibe todos los niveles que se aplican a su sesión, en ese orden. Cuando dos se contradicen, gana el más específico: las pautas de una sesión sobre las de su proyecto, y las de un proyecto sobre las de todas las sesiones. (El (i) junto a **Para una sesión** en Configuración dice lo mismo.)

## Escribir pautas para todas las sesiones

1. Abre [Configuración → Agentes → Pautas de los agentes](/settings?s=guidelines).
2. En **Para todas las sesiones**, escribe lo que todos los agentes deben saber sobre ti y cómo trabajas.
3. Haz clic en **Guardar**.

Debajo del cuadro, **Empezar desde…** ofrece algunas formas ya preparadas para que los agentes te hablen (**Lenguaje sencillo, respuestas cortas, explica la jerga**, **Cercano y animado: soy nuevo en esto**, **Breve y técnico**). Al elegir una, se añade como una línea (“Cómo hablarme: …”), que puedes cambiar antes de guardar. **Guardar** permanece atenuado hasta que cambies algo; **Deshacer cambios** recupera lo que estaba guardado.

Cada nivel admite hasta 20.000 caracteres. Mantenlas breves cuando puedas: todas las sesiones leen todo, y unas pocas líneas claras funcionan mejor que páginas enteras.

## Dar pautas a un proyecto

Cada proyecto tiene sus propias pautas, para el trabajo que guardas en él: para quién es, el estilo en que escribir, las reglas del proyecto.

1. En la barra lateral de sesiones, haz clic en el nombre del proyecto (se abre **Detalles del proyecto**) y abre la pestaña **Configuración**.
2. Escribe en el campo **Pautas de los agentes: lo que sigue cada agente en él**.
3. Guarda el proyecto.

También puedes escribirlas al crear un proyecto: en la ventana **Nuevo proyecto**, haz clic en **Más opciones** y escribe en **Pautas de los agentes**. **Configuración → Agentes → Pautas de los agentes → Para un proyecto** muestra todos los proyectos que tienen pautas, con la primera línea de cada uno (**Mostrar todo** cuando hay muchos); haz clic en uno para abrir ese proyecto.

En un grupo (un proyecto que reúne varios proyectos), sus sesiones siguen las pautas propias del grupo y leen lo que pide cada proyecto del grupo como parte del trabajo con ese proyecto.

## Pautas para una sesión

### Antes de empezar

1. En la página de inicio, abre **Opciones** (junto al cuadro de mensaje).
2. Haz clic en **Pautas**. Se abre un cuadro de diálogo en **Esta sesión**.
3. Escribe lo que solo esta sesión debe seguir y haz clic en **Guardar**. El chip de Opciones muestra entonces **Para esta sesión**.

El mismo cuadro de diálogo muestra las pautas del proyecto (cuando elegiste un proyecto) y las de todas las sesiones, cada una en su propia pestaña, para que veas todo lo que seguirá el agente y puedas cambiarlo también. Un punto en una pestaña significa que ese nivel tiene pautas.

### En una sesión en curso

1. Abre el menú de la sesión (⋯) → **Configuración de la sesión → Pautas**.
2. Cambia **Esta sesión** (o las del proyecto, o las de todas las sesiones) y haz clic en **Guardar**.

Un cambio surte efecto desde tu siguiente mensaje. Claude Code y Codex leen sus instrucciones cuando empiezan, así que cuando envías tu siguiente mensaje la app vuelve a iniciar el agente en silencio con las nuevas pautas; la conversación continúa donde estaba. Esto espera mientras el agente está en medio de un turno, trabaja hacia un objetivo o tiene trabajo ejecutándose en segundo plano: ocurre cuando queda libre. Custom las lee antes de cada turno de todos modos. Otros agentes (Gemini CLI, OpenCode y el resto) toman las pautas cambiadas desde su siguiente sesión.

## Qué hace buenas a unas pautas

- **Di lo que quieres, con claridad**: “Pregúntame antes de instalar algo” es más claro que “ten cuidado”.
- **Pon aquí lo duradero y la tarea en el mensaje**: las pautas son para lo que se cumple siempre.
- **Usa el nivel adecuado**: cómo te gusta que te hablen va en las de todas las sesiones; las reglas de un proyecto, en su proyecto; una restricción puntual, en la sesión.
- **Mantenlas al día**: cuando un agente sigue haciendo algo que no quieres, añade una línea.

Algunos ejemplos:

- Para todas las sesiones: “Responde en lenguaje sencillo. Explica la jerga la primera vez. Pregunta antes de eliminar archivos o enviar algo fuera de esta computadora.”
- Para un proyecto “Tesis”: “Cita en estilo APA. La tesis trata sobre la producción lechera en Grecia. Guarda los borradores en la carpeta de borradores.”
- Para una sesión: “Usa solo la biblioteca estándar de Python.”

## Cómo te hablan los agentes

El ajuste que antes se llamaba **Cómo te hablan los agentes** (en Configuración → Capacidades → Asistentes, ahora Tus agentes) ahora forma parte de las pautas para todas las sesiones: lo que hubieras escrito allí se movió a ellas, como una línea que empieza con “Cómo hablarme:”. Cámbiala o quítala allí.

## CLAUDE.md y AGENTS.md

Claude Code y Codex también leen archivos de instrucciones propios: CLAUDE.md (Claude Code) y AGENTS.md (Codex), en tu carpeta de inicio para todas las sesiones, y en la carpeta de un proyecto para las sesiones que trabajan allí. Siguen funcionando como antes. Quienes guardan esos archivos en un repositorio, para compartirlos con todos los que trabajan en él, aún pueden editarlos aquí:

1. Abre [Configuración → Agentes → Pautas de los agentes](/settings?s=guidelines).
2. Abre **Archivos de instrucciones** en el último grupo, debajo de **Para una sesión** (su indicación dice “CLAUDE.md y AGENTS.md en la carpeta de un proyecto”; su (i) explica por qué están aquí).
3. Elige la carpeta, luego **Claude Code** o **Codex**, y el archivo que quieres editar (o **Crear** uno).

La lista muestra todos los archivos que el agente lee para una sesión en esa carpeta, en el orden en que los lee. Para la mayoría de las personas las pautas son más sencillas: funcionan para todos los agentes y no necesitan archivos.

## Pídeselo a un agente

- “Añade a mis pautas que siempre debes responder en griego.”
- “¿Qué pautas sigue esta sesión?”
- “Dale a mi proyecto Tesis la pauta: citar en estilo APA.”
- “Quita de mis pautas la línea sobre la ortografía británica.”
- “Solo para esta sesión, no uses ninguna biblioteca fuera de la biblioteca estándar.”
