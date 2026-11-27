# Proyectos y conocimiento

Un proyecto mantiene reunido un trabajo: sus sesiones, una carpeta para sus archivos (y otras carpetas tuyas con las que trabaja), lo que los agentes recuerdan sobre él (notas, una wiki y documentos propios), las pautas que sigue cada agente en él, habilidades propias, el agente con el que empiezan sus sesiones y agentes propios. El Conocimiento compartido guarda los documentos y las carpetas que añades una sola vez para que todas las sesiones puedan buscar en ellos y citar el archivo y la página que leyeron. Este tema explica la página Proyectos, cómo abrir los detalles de un proyecto, cómo crear y usar proyectos y grupos de proyectos, cómo dar a un proyecto habilidades propias, cómo compartir un proyecto con otras personas, y cómo añadir, buscar y gestionar los documentos en los que buscan los agentes.

![La página propia de un proyecto: sus sesiones, sus archivos más recientes y lo que recibe cada sesión en él, bajo sus pestañas](images/projects.webp)

## Qué es un proyecto

Un proyecto es un trabajo con todo lo que le pertenece, como Proyectos en ChatGPT o Claude. Una declaración de impuestos, una tesis, un jardín, un sitio web: cada uno puede ser un proyecto. En la página de inicio eliges un proyecto por su nombre en lugar de una carpeta, y cada sesión que empieces en él:

- **trabaja en la carpeta del proyecto**. Al agente se le dice que esa carpeta contiene los archivos del proyecto y que guarde allí lo que cree para él, y con tu primer mensaje recibe lo que hay en ella ahora (primero lo último que cambió). También trabaja con las otras carpetas con las que trabaja el proyecto, donde estén: Claude Code trabaja en ellas como en su propia carpeta, y a los demás agentes se les dice dónde están;
- **sigue las pautas del proyecto**: lo que todo agente del proyecto debe saber, como para quién es el trabajo, cómo trabajar y qué tener en cuenta (consulta [Pautas de los agentes](/guide/guidelines));
- **recibe las habilidades propias del proyecto** junto con tu biblioteca de habilidades: métodos escritos sobre cómo se hace su trabajo, que los agentes cargan cuando una tarea lo requiere (consulta [Dar a un proyecto habilidades propias](#give-a-project-skills-of-its-own));
- **empieza como el agente del proyecto**, cuando el proyecto tiene uno (consulta [Agentes](/guide/agents));
- **recuerda lo que aprendieron las sesiones anteriores del proyecto**: los agentes guardan notas sobre un proyecto según su carpeta, así que las sesiones de un proyecto las comparten (consulta [Memoria](/guide/memory));
- **busca en los documentos propios del proyecto**, y también en el conocimiento compartido, salvo que el proyecto lo desactive (consulta [Qué sesiones buscan en qué conocimiento](#which-sessions-search-which-knowledge)).

Las sesiones pertenecen a un proyecto según dónde trabajan. Toda sesión que trabaja en la carpeta del proyecto, o en una carpeta dentro de ella, está en el proyecto, sin importar dónde se empezó: en Hydor, en Claude Code o en Codex. Cuando la carpeta de un proyecto está dentro de la de otro, la sesión pasa al proyecto interior. Una sesión en un worktree cuenta para la carpeta a partir de la cual se creó el worktree, y un proyecto cuya carpeta es tu carpeta personal recibe solo las sesiones de la propia carpeta personal. Así, crear un proyecto para una carpeta en la que ya trabajas incorpora de inmediato sus sesiones anteriores (la barra lateral las muestra bajo el proyecto, no como un grupo de carpeta), y una sesión que Hydor empieza en la carpeta de un proyecto (desde la página de inicio, una tarea programada, una app o la API) empieza dentro del proyecto, con sus pautas, habilidades y conocimiento desde el primer turno.

Un proyecto también puede reunir otros proyectos. Eso es un **grupo**: consulta [Reunir proyectos en un grupo](#bring-projects-together-in-a-group).

## Abrir los detalles de un proyecto

Dónde se muestran los detalles de un proyecto depende de dónde estés. En la sección **Proyectos** (la página Proyectos o la página de un proyecto) son la propia página del proyecto, en lugar de la lista. Desde cualquier otro lugar (una sesión, Configuración…) se abren en una ventana sobre la página en la que estás, que queda detrás, atenuada. Hay varias maneras de entrar:

- **Desde la página Proyectos**: haz clic en la tarjeta de un proyecto (consulta [Encontrar todos tus proyectos](#find-all-your-projects)). Se abre la página del proyecto.
- **Desde la barra lateral**: en la lista de sesiones, haz clic en el nombre del proyecto en su encabezado (en un teléfono, abre primero la barra lateral, que es un panel deslizante, y toca el nombre; el panel se cierra y los detalles ocupan la pantalla). Su menú ⋯ también tiene **Detalles del proyecto**, como primer elemento. La flecha pequeña junto al nombre pliega o despliega las sesiones del proyecto.
- **Desde el cuadro de búsqueda**: escribe el nombre del proyecto en el cuadro de búsqueda (Ctrl+K, o ⌘K en una Mac) y elígelo. En la sección Proyectos se abre su página; en otros lugares, la ventana. Un proyecto que todavía no tiene sesiones no tiene encabezado en la barra lateral, así que esta opción y la página Proyectos son las maneras de llegar a él (un proyecto que acabas de crear se abre solo).
- **Desde un enlace**: un enlace a un proyecto en una notificación o en la respuesta de un agente, seguido desde otra página, también abre la ventana sobre ella.
- **Por su dirección**: al escribir o recargar `/projects/<id>`, con una pestaña a continuación si quieres, se abre la página del proyecto.

La página y la ventana muestran lo mismo:

- **El encabezado**, con el color del proyecto: en la página del proyecto, una flecha arriba a la izquierda (**Todos los proyectos**); luego su marca y su nombre, y debajo de ellos de qué trata (su carpeta cuando no tiene descripción; un grupo dice “Reúne” y los nombres de sus proyectos). A la derecha, **Nueva sesión** empieza una sesión en el proyecto (en un teléfono, el lápiz) y **Más** (⋯) tiene el menú del proyecto (consulta [El menú del proyecto](#the-projects-menu)). La ventana también tiene ✕, que la cierra.
- **Sus pestañas**: **Resumen**, **Archivos**, **Memoria**, **Habilidades**, **Agentes** y **Configuración** (consulta [Los detalles de un proyecto](#a-projects-details)).

**En la página del proyecto**, la flecha vuelve a la página Proyectos, y lo mismo hace el botón Atrás del navegador; no hay ✕. La pestaña en la que estás figura en la dirección de la página (`/projects/<id>/files`, `/projects/<id>/memory`…), así que al recargar o usar un enlace se conserva. También figura una carpeta que abras en la pestaña **Archivos**, y Atrás sale de ella. Allí, un enlace a otro proyecto (uno que un grupo reúne) abre la página de ese proyecto. Al eliminar el proyecto vuelves a la página Proyectos.

**La ventana** se cierra con ✕, con Esc o con un clic en la página atenuada fuera de ella. Ir a otra página también la cierra: por ejemplo, al abrir un documento desde la pestaña **Archivos** o al seguir un enlace. En un teléfono, la ventana ocupa toda la pantalla. Esc cierra primero un menú o un cuadro de diálogo que esté sobre la ventana, y después la ventana.

## Encontrar todos tus proyectos

**Proyectos** en la barra de iconos (justo antes de **Archivos**; en un teléfono, en la cuadrícula de herramientas del panel de la barra lateral) abre la página Proyectos, o ve a [/projects](/projects). Muestra cada proyecto como una tarjeta, en todo el ancho de la página, sin columna junto a la barra de iconos. El título indica cuántos hay.

- **Nuevo proyecto** crea uno (consulta [Crear un proyecto](#make-a-project)). Su ▾ tiene **Nuevo proyecto** y **Nuevo grupo de proyectos…**, que necesita dos proyectos que reunir (consulta [Crear un grupo](#make-a-group)).
- **Buscar un proyecto** filtra las tarjetas mientras escribes, por nombre, descripción y carpeta.
- El botón de al lado las ordena: **Actividad reciente** (primero el proyecto que trabajó más recientemente, el orden habitual), **Nombre** o **Más sesiones**. Este navegador recuerda tu elección.

Cada tarjeta muestra:

- una banda del color del proyecto con su marca, y chips: **Grupo** para un grupo, y **De Claude Code** o **De Codex** para un proyecto que Hydor encontró (consulta [Proyectos encontrados en Claude Code y Codex](#projects-found-in-claude-code-and-codex));
- su nombre, de qué trata (un grupo dice “Reúne” y los nombres de sus proyectos) y su carpeta;
- lo que contiene: sus sesiones, documentos, habilidades y archivos guardados, y “Compartido con 2 personas” una vez que lo compartes;
- “2 trabajando” mientras sus sesiones están en marcha, y un punto cuando una sesión terminó desde la última vez que miraste;
- cuándo trabajó por última vez, y pequeñas barras con los mensajes de sus últimas cuatro semanas.

Pasa el cursor sobre una tarjeta (en una pantalla táctil están siempre visibles) y **Nueva sesión** empieza una sesión en el proyecto, y **Más** (⋯) tiene el menú del proyecto: **Abrir su carpeta en Archivos**, en la app de escritorio **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**, **Solo sus sesiones en la barra lateral**, **Compartir con otras personas** y **Eliminar el proyecto** (consulta [El menú del proyecto](#the-projects-menu)). Haz clic en cualquier otra parte de una tarjeta para abrir la página propia del proyecto, con una flecha para volver a todos los proyectos (consulta [Abrir los detalles de un proyecto](#open-a-projects-details)). Suelta archivos de tu computadora sobre una tarjeta para ponerlos en la carpeta del proyecto.

Bajo las tarjetas, **Carpetas en las que trabajas** lista las carpetas en las que tus sesiones trabajaron últimamente y que aún no tiene ningún proyecto (consulta [Carpetas en las que trabajas, aún sin proyecto](#folders-you-work-in-not-in-a-project-yet)). **Crear un proyecto** en una abre la ventana **Nuevo proyecto** con esa carpeta elegida; ✕ (**No es un proyecto: dejar de sugerirlo**) la quita de la lista para siempre. La lista se omite mientras buscas.

Sin proyectos todavía, la página explica qué es un proyecto y ofrece **Nuevo proyecto**. Una búsqueda sin coincidencias lo dice.

## Crear un proyecto

1. En la página Proyectos, haz clic en **Nuevo proyecto** (consulta [Encontrar todos tus proyectos](#find-all-your-projects)). O haz clic en el **+** al final del encabezado **Proyectos** de la barra lateral (aparece cuando apuntas al encabezado, y siempre está visible en una pantalla táctil) y elige **Nuevo proyecto…**. El botón de filtro de la barra lateral (**Filtrar y agrupar sesiones**) también tiene **Nuevo proyecto…**, y también lo tiene el menú de carpetas de la página de inicio, junto a su encabezado **Proyectos** (consulta [Empezar una sesión en un proyecto](#start-a-session-in-a-project)). El encabezado de una carpeta en la barra lateral tiene **Convertir en proyecto**, y también cada carpeta bajo **Carpetas en las que trabajas** en la página Proyectos (consulta [Carpetas en las que trabajas, aún sin proyecto](#folders-you-work-in-not-in-a-project-yet)).
2. Rellena la ventana:
   - **Nombre**: cómo llamas al proyecto, como “Impuestos 2026”, “El jardín” o “Tesis”. Hasta 60 caracteres. Es el único campo obligatorio. El cuadrado junto a él es la marca del proyecto, en el color que tendrá: haz clic para elegir otro de los ocho colores (ámbar, azul, verde, rosa, violeta, turquesa, naranja, pizarra). Si no eliges ninguno, los proyectos toman los colores por turnos.
   - **Dónde van sus archivos**: elige una de dos opciones.
     - **En una carpeta nueva** (la opción habitual): la app crea para el proyecto una carpeta propia, con su nombre.
     - **En una carpeta que ya tengo**: un proyecto o una carpeta de documentos de esta computadora, que se queda donde está. Debajo, **Usados hace poco, en ningún proyecto aún** muestra carpetas en las que tus sesiones trabajaron hace poco, para elegirlas con un toque; o haz clic en **Elegir una carpeta…** y búscala por nombre o escribe su ruta. Si eliges una con el nombre aún vacío, el nombre de la carpeta pasa a ser el del proyecto. **Cambio** elige otra.
3. Opcionalmente, haz clic en **Más opciones** para el resto (un punto junto a él significa que hay algo rellenado):
   - **De qué trata**: una línea que se muestra bajo el nombre. Hasta 300 caracteres.
   - **Pautas de los agentes**: lo que todo agente del proyecto debe seguir, como para quién es el trabajo, cómo trabajar y qué tener en cuenta: “Importes en EUR. Soy autónomo en Grecia.” Hasta 20.000 caracteres. Consulta [Pautas de los agentes](/guide/guidelines).
   - **Otras carpetas que usa**: más carpetas tuyas con las que trabajan sus agentes, donde estén; no se copia nada. **Añadir una carpeta** añade una, hasta 12; ✕ deja fuera una otra vez.
4. Deja activado **Un agente para él** para que se cree un agente para el proyecto (consulta [Agentes](#agents)), o desactívalo.
5. Haz clic en **Crear el proyecto**, o pulsa Intro en el campo del nombre.

Una carpeta nueva va dentro de una carpeta **Projects**, donde van las carpetas de tarea: “Impuestos 2026” recibe `~/Hydor/Projects/taxes-2026`, a menos que hayas movido las carpetas de tarea a otro lugar (consulta [Mover las carpetas de tarea](/guide/agents#move-task-folders)). Si ese nombre ya está ocupado, añade `-2`, `-3`, etc. Si lo creas desde la página Proyectos, se abre la página del nuevo proyecto. Si lo creas desde la barra lateral, sus detalles se abren en una ventana sobre la página en la que estás. Si lo creas desde la página de inicio, el nuevo proyecto queda elegido para la sesión que vas a empezar.

Después se configuran dos cosas más en la pestaña **Configuración** del proyecto: el agente con el que empiezan sus sesiones y los proyectos que reúne. Sus notas, su wiki y sus documentos están en su pestaña **Memoria**; sus habilidades, en su pestaña **Habilidades**, y más carpetas, en su pestaña **Archivos** (consulta [Los detalles de un proyecto](#a-projects-details)).

### Un proyecto para una carpeta que ya tienes

En la ventana **Nuevo proyecto**, elige **En una carpeta que ya tengo** en **Dónde van sus archivos** y luego la carpeta: el proyecto trabaja en ella y no se crea una carpeta nueva. Un agente también puede hacerlo: “Crea un proyecto llamado Tienda para ~/code/shop”. La carpeta propia de un proyecto no se puede cambiar una vez creado el proyecto, pero las carpetas con las que trabaja sí: consulta [Archivos](#files). Las sesiones que ya trabajaban en esa carpeta se unen al proyecto de inmediato. Si Hydor ya creó un proyecto con esa carpeta (consulta [Proyectos encontrados en Claude Code y Codex](#projects-found-in-claude-code-and-codex)), crear tú un proyecto para ella hace que ese proyecto pase a ser tuyo tal como lo creas ahora, con tu nombre, color, descripción y pautas. Es el mismo proyecto con sus sesiones, y ya no indica dónde se encontró.

### Proyectos encontrados en Claude Code y Codex

Hydor muestra las sesiones que tuviste en Claude Code y Codex fuera de Hydor: en una terminal, en VS Code, en la app de escritorio de Claude o en la app de Codex (consulta [La lista de sesiones](/guide/start#the-session-list)). Las carpetas en las que trabajas con ellos ahora se convierten solas en proyectos de Hydor, de modo que tu trabajo allí te espera como un proyecto, con sus sesiones.

- **Cuándo una carpeta se convierte en proyecto**: cuando al menos dos sesiones que empezaste tú en Claude Code o Codex trabajaron en ella, en una terminal, en VS Code, en la app de escritorio de Claude o en la app de Codex. No cuentan las sesiones que ejecutó un script u otro programa (como `codex exec` o el Agent SDK), las sesiones que un agente empezó para parte de su trabajo (subagentes) ni las sesiones propias de Hydor. Una sesión en una subcarpeta de un repositorio de Git cuenta para todo el repositorio.
- **Los proyectos propios de Codex**: los proyectos que tienes en la app de Codex, incluidas las carpetas que guarda para tus proyectos de ChatGPT, se convierten en proyectos cuando una sesión trabajó en una de sus carpetas. El proyecto toma el nombre que Codex le da, su primera carpeta como carpeta propia del proyecto y sus otras carpetas como las carpetas con las que trabaja el proyecto.
- **Lo que se deja fuera**: tu carpeta personal; las carpetas ocultas (salvo las carpetas de los proyectos propios de Codex); las carpetas temporales; las carpetas que la app crea para sí misma (carpetas de tareas, ejecuciones de apps, worktrees y sus datos); las carpetas que marcaste como **No es un proyecto**; y las carpetas que un proyecto ya tiene: su carpeta propia, una con la que trabaja o una carpeta dentro de ellas.
- **Cuándo**: una vez que Hydor ha leído tus sesiones después de iniciarse, y luego en cerca de un minuto tras las nuevas sesiones que haya allí.
- **Su nombre**: el nombre que diste a la carpeta en la barra lateral (**Cambiar nombre**); si no, el nombre del proyecto de Codex; si no, el nombre de la propia carpeta. Si un proyecto ya tiene ese nombre, delante se pone el nombre de la carpeta superior (“client/app”), y después un número.
- **En la barra lateral**: su grupo es el grupo del proyecto, con su marca y su nombre y, después del nombre, las marcas de los programas en los que se encontró. Pasa el puntero sobre el nombre, o abre el **⋯** del encabezado, para ver de dónde vinieron sus sesiones (**Iniciada fuera de Hydor**), igual que en el grupo de una carpeta. Sus detalles se abren como los de cualquier proyecto (consulta [Abrir los detalles de un proyecto](#open-a-projects-details)); no indican dónde se encontró el proyecto.
- **Un proyecto como cualquier otro**: su carpeta propia es la carpeta donde se ejecutaron esas sesiones, y no se mueve ni se copia nada. Tiene documentos, habilidades, pautas, un agente, archivos y uso compartido como cualquier proyecto, y puedes cambiarle el nombre, describirlo o eliminarlo. Las habilidades propias de Claude Code en el `.claude/skills` de la carpeta aparecen en su pestaña **Habilidades** como antes, y los agentes siguen leyendo como antes el CLAUDE.md o AGENTS.md de la propia carpeta.
- **Si lo eliminas**, Hydor no lo vuelve a crear, y aún puedes crear tú un proyecto para esa carpeta (consulta [Eliminar un proyecto](#delete-a-project)).

Para ver qué proyectos llegaron así, busca las marcas de programa después del nombre de un proyecto en la barra lateral, o pregunta a un agente.

### Carpetas en las que trabajas, aún sin proyecto

Una carpeta en la que trabajan dos o más de tus sesiones, y que ningún proyecto tiene aún, tiene un grupo propio en la barra lateral, bajo **Proyectos**, con el nombre de su carpeta. Apunta a su encabezado y abre su **⋯** para encontrar **Convertir en proyecto**: se abre la ventana **Nuevo proyecto** con esa carpeta elegida y su nombre rellenado. El mismo menú tiene **Cambiar nombre**, **Usar el nombre de la carpeta** (una vez que le hayas cambiado el nombre) y **Abrir en Archivos**.

Cuando creas un proyecto para una carpeta tú mismo (o desde la ventana **Nuevo proyecto**), las carpetas en las que tus sesiones trabajaron hace poco, en los últimos 90 días, o en las que cambiaron archivos mientras trabajaban en otro sitio, y que ningún proyecto tiene aún, aparecen en **Usados hace poco, en ningún proyecto aún**, de modo que un toque elige una (consulta [Crear un proyecto](#make-a-project)). La página Proyectos lista las mismas carpetas bajo sus tarjetas, como **Carpetas en las que trabajas**, cada una con **Crear un proyecto** (consulta [Encontrar todos tus proyectos](#find-all-your-projects)). Las más usadas y las más recientes van primero. Una carpeta dentro de un proyecto guardado en Git cuenta como todo el proyecto.

Las carpetas en las que trabajas con Claude Code y Codex se convierten solas en proyectos, así que estas son en su mayoría carpetas en las que trabajaste desde Hydor. Tu carpeta personal, las carpetas ocultas, las temporales y las carpetas que la app crea para sí misma (carpetas de tareas, ejecuciones de apps, worktrees) nunca se sugieren. Cuando un proyecto tiene una carpeta, ya sea la suya propia o una de las carpetas con las que trabaja, la carpeta deja de aparecer aquí. Para evitar que Hydor cree por sí solo un proyecto a partir de una carpeta, pídeselo a un agente: mantiene una lista de carpetas que no son proyectos, y eliminar un proyecto añade su carpeta a ella (consulta [Eliminar un proyecto](#delete-a-project)).

## Empezar una sesión en un proyecto

Hay dos maneras:

- **Desde el proyecto**: haz clic en el lápiz al final de su encabezado en la barra lateral, o en **Nueva sesión** en la parte superior de sus detalles (en un teléfono, en el lápiz). La página de inicio se abre con el proyecto elegido y con lo que elegiste en él antes; si todavía no has elegido nada allí, con su agente, cuando tiene uno.
- **Desde la página de inicio**: abre el chip de carpeta en la fila bajo el cuadro de mensaje. Su menú tiene dos listas cortas: **Proyectos**, los cinco con trabajo más reciente (y el elegido, si no está entre ellos), cada uno con su marca, su nombre y su carpeta; después **Carpetas**, la carpeta en uso y las que usaste últimamente; y luego **Nueva carpeta de tarea**. **Nueva**, junto al encabezado **Proyectos**, crea un proyecto y lo elige. Escribe parte de un nombre en el campo de la parte superior para encontrar cualquier proyecto o cualquier carpeta. La carpeta propia de un proyecto nunca aparece como una carpeta: si la encuentras por su nombre o su ruta, o la elegiste antes en la página de inicio como carpeta, es el proyecto, y la sesión trabaja en el proyecto.

Cuando eliges un proyecto, el chip muestra su marca y su nombre en lugar de una carpeta, y la sesión trabajará en la carpeta del proyecto. En un proyecto donde todavía no has elegido nada, el chip **Agente** muestra el agente propio del proyecto cuando lo tiene, con el programa, el modelo y los permisos que ese agente sugiere, y si no, **General**; en uno donde ya has elegido, muestra lo que elegiste allí. Todavía puedes cambiar cualquiera de ellos antes de empezar. Después escribe tu mensaje y haz clic en **Inicio**.

Cada proyecto conserva sus propias elecciones en la página de inicio: su programa, modelo, esfuerzo, permisos, agente, memoria, límite de gasto, **Confidencial** y **Nuevo worktree** (consulta [Qué recuerda la página de inicio](/guide/sessions#what-the-start-page-remembers)). La página de inicio recuerda el proyecto para tu próxima sesión, en cualquier dispositivo que uses. Para volver a trabajar fuera de él, elige una carpeta o **Nueva carpeta de tarea** en el mismo menú. Si se elimina un proyecto que habías elegido, la página de inicio conserva su carpeta, pero ya no el proyecto.

En un teléfono, el menú se abre como una hoja desde la parte inferior de la pantalla, con el título “Proyecto o carpeta donde trabajar”, y el teclado espera hasta que toques el campo.

Cuando la carpeta del proyecto es un repositorio de Git, el final del menú ofrece **Nuevo worktree**, como para cualquier carpeta de un repositorio: la sesión trabaja entonces en una rama propia, en una copia separada del repositorio (consulta [Sesiones](/guide/sessions)). Las sesiones que empiezas por voz en modo manos libres empiezan en el último lugar elegido en la página de inicio, con sus elecciones (consulta [Documentos, imágenes, videos y voz](/guide/documents-voice)).

## Los detalles de un proyecto

Ábrelos como se describe en [Abrir los detalles de un proyecto](#open-a-projects-details). Sus pestañas son **Resumen**, **Archivos**, **Memoria**, **Investigación** (solo en un proyecto que tiene investigación: ver más abajo), **Habilidades**, **Agentes** y **Configuración**. **Memoria** y **Habilidades** tienen un contador, excepto en el teléfono, donde las pestañas no muestran contadores. En el teléfono (o en una ventana estrecha), las pestañas que no caben están en **Más**, al final de la fila: tócalo para ver un menú con ellas. Mientras una de ellas está abierta, su nombre aparece ahí en lugar de **Más**. Cada pestaña se muestra al instante.

### El menú del proyecto

**Más** (⋯), en el encabezado, tiene:

- **Abrir su carpeta en Archivos**: la carpeta del proyecto en la página Archivos.
- **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**: en la app de escritorio, la carpeta del proyecto seleccionada en el administrador de archivos del sistema (consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)).
- **Solo sus sesiones en la barra lateral**: la lista de sesiones muestra solo las sesiones del proyecto, igual que el filtro de la propia barra lateral (consulta [Mostrar en la barra lateral las sesiones de un solo proyecto](#show-one-projects-sessions-in-the-sidebar)). Vuelve a elegirla para ver todas las sesiones.
- **Compartir con otras personas**: invita a alguien (un asesor, un estudiante) a ver el proyecto y comentar sus documentos en un enlace propio (consulta [Compartir un proyecto con otras personas](#share-a-project-with-people)).
- **Eliminar el proyecto** (consulta [Eliminar un proyecto](#delete-a-project)).

### Resumen

El proyecto de un vistazo, en tarjetas:

- **Jobs**, arriba del todo, solo mientras el proyecto tiene [trabajos](/guide/jobs) en ejecución o en espera, o servidores que quedaron en ejecución: hasta seis (tres en un teléfono), con su avance, el tiempo que falta y lo que esperan. Haz clic en uno para ver su panel, con sus detalles y su salida; su menú ⋯ tiene **Detalles y salida**, **Abrir sesión** (**Abrir ejecución** para una ejecución de Experimentos), **Editar etiquetas…** y **Detener**. **Todos los trabajos** (**Todos** y su número, cuando hay más de los que muestra la tarjeta) abre Jobs solo con los de este proyecto (consulta [Ver los trabajos de un proyecto](/guide/jobs#see-one-projects-jobs)). La tarjeta de un grupo incluye también los trabajos de sus proyectos.
- **Sesiones**: las sesiones del proyecto (empezadas en él, o que trabajan en su carpeta, en Hydor, Claude Code o Codex), primero la que estuvo en funcionamiento más recientemente, cada una con el icono de su agente, su título, lo que está haciendo mientras se ejecuta (**Funcionando**, **Te necesita**, **Listo**; no en un teléfono) y hace cuánto estuvo en funcionamiento. Haz clic en una para abrirla. Si hay más de seis, **Todos** muestra el resto. Si aún no hay ninguna, indica que una nueva trabajará en la carpeta del proyecto, con sus pautas, documentos y habilidades, y tiene **Nueva sesión**.
- **Archivos**: los archivos más recientes del proyecto, hasta seis, como mosaicos con sus imágenes: lo que se guardó en el proyecto (páginas, documentos, presentaciones, imágenes…) y los archivos de la parte superior de su carpeta, primero el último que cambió (el archivo propio de algo conservado que está allí se muestra una sola vez, como ese elemento). Haz clic en uno para abrirlo. **Todos los archivos** abre la pestaña **Archivos**. La tarjeta solo aparece mientras el proyecto tiene archivos.
- **Compartido con** (al lado de ellas, debajo en un teléfono), una vez que compartes el proyecto con alguien: cada persona, con sus iniciales y lo último que hizo (“Comentó en “Capítulo 3” · hace 2 h”, “Aún no lo ha abierto”). Haz clic en una, o en **Compartir**, para ver y cambiar con quién está compartido (consulta [Compartir un proyecto con otras personas](#share-a-project-with-people)).
- **Todas las sesiones de aquí** (al lado de ellas, debajo en un teléfono): lo que recibe cada sesión del proyecto. **Carpeta** (su carpeta y cuántas más usa: haz clic para ir a la pestaña **Archivos**), **Pautas** (el inicio de sus pautas: haz clic para ir a **Configuración**), **Memoria** (lo que recuerda, en una línea: “12 notas · 8 artículos · 5 documentos”, con los artículos solo mientras su memoria wiki está activada; haz clic para ir a la pestaña **Memoria**), **Habilidades** (cuántas tiene propias) y **Empieza como** (su agente).
- **Los proyectos que reúne**, para un grupo: cada uno de sus proyectos, con cuántas sesiones tiene. Haz clic en uno para abrirlo.

### Archivos

Los archivos del proyecto: lo que se guardó en él, su carpeta y las otras carpetas con las que trabaja. La pestaña muestra una carpeta como lo hace la [página Archivos](/guide/files-git#browse-a-folder): abrir, elegir varios, arrastrar y el menú de cada mosaico o fila. Un archivo se abre en una ventana sobre la página.

- Sobre la carpeta, un chip para cada una: la carpeta propia del proyecto, con el nombre del proyecto, y cada carpeta con la que trabaja, con su nombre. Haz clic en uno para mostrarla.
- **Adjuntar una carpeta** añade una carpeta tuya para que el proyecto trabaje con ella, donde está: búscala por nombre o escribe su ruta. No se copia nada. Hasta 12.
- ✕ en el chip de una carpeta la deja fuera del proyecto; la carpeta en sí no cambia. El mensaje tiene **Deshacer**.
- **Abrir en Archivos** abre la carpeta en la página Archivos. En la app de escritorio, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en el menú del proyecto) la muestra en el administrador de archivos del sistema.

**Mosaicos y lista.** Los archivos se muestran como mosaicos con imágenes, a menos que elijas **Como lista** tú mismo (el interruptor al final de la barra recuerda tu elección en este navegador). Cada mosaico tiene una imagen arriba, una pequeña insignia con su tipo para documentos y similares (PDF, Word, Sheet, Slides, Notebook…), su nombre y cuándo cambió (“Cambiado hace 2 h”); su ⋯ aparece al señalarlo. La imagen es la propia imagen en el caso de las imágenes, un fotograma en el de los videos, la primera página en el de los PDF, la primera página, diapositiva o celdas en el de los archivos de Word, PowerPoint, Excel y OpenDocument, cómo se abre en el de las páginas web y los cuadernos, y las primeras líneas en el de los archivos de texto, Markdown, código, CSV y JSON. Cualquier otro muestra el icono de su tipo. La lista muestra las imágenes como pequeñas miniaturas en lugar de iconos (consulta [Explorar una carpeta](/guide/files-git#browse-a-folder)).

**Lo que guarda el proyecto.** Cada cosa conservada en el proyecto es además un archivo propio en la carpeta del proyecto, con el nombre de su título: las páginas, diseños, presentaciones, documentos, hojas de cálculo, documentos LaTeX, cuadernos y diagramas que hicieron los agentes y tú guardaste, las páginas web guardadas, y las imágenes, videos y sonidos que guardaste. Aparece en la cuadrícula entre los demás archivos, en la carpeta donde está su archivo, con una etiqueta que dice qué es, y un clic lo abre en su propio editor o visor (consulta [Lo que conservas también son archivos](/guide/files-git#kept-things-are-files-too)). Los tableros, cuyas tarjetas están vivas, y todo lo que no tiene archivo propio aparecen en la parte superior de la carpeta propia del proyecto (no en sus subcarpetas ni en las carpetas con las que trabaja), después de las carpetas y antes de los archivos, primero lo más nuevo: cada uno muestra su imagen y su tipo sobre ella, y su menú ⋯ tiene lo que le corresponde, como **Editar**, **Cambiar nombre**, **Compartir con otras personas**, **Mover a otro proyecto**, **Duplicar** y **Eliminar**. El campo **Find in** de arriba los filtra junto con los archivos. Lo que guardas en una sesión sin proyecto se queda con esa conversación (consulta [Guardar una página](/guide/library#keep-a-page)).

**Añadir archivos.**

- **Subir** en la barra sube archivos a la carpeta que se muestra, tal cual; su flecha (**Más formas de subir**) tiene **Subir archivos** y **Subir una carpeta**, que trae la carpeta con sus archivos. Un archivo de Word, de hoja de cálculo o de LaTeX se abre en los editores propios de la app, como en la página Archivos.
- Suelta archivos o carpetas de tu computadora en cualquier parte de la pestaña: mientras están encima aparece “Suelta para añadir a “Tesis””. En un teléfono, el **+** redondo de la parte inferior (**Añadir a esta carpeta**) tiene los mismos elementos.
- **Nueva** tiene **Nueva carpeta**, **Nuevo archivo** y **Nuevo cuaderno**, **Subir archivos** y **Subir una carpeta**, y debajo las cosas que crea la app: **Documento**, **Diapositivas**, **Hoja de cálculo**, **Página**, **Diseño**, **LaTeX**, **Diagrama**, **Tablero** e **Imagen**. Cada una abre el cuadro de diálogo Nueva para ese tipo, con este proyecto elegido (consulta [Crear una página](/guide/library#make-a-page)). Con una carpeta de dentro de la carpeta del proyecto abierta, lo nuevo se crea en esa carpeta.

Para añadir archivos desde otro lugar de la app, usa **Añadir a un proyecto** en la página Archivos, en la ventana de un archivo o en las tarjetas de archivos de un agente: un archivo se copia en la carpeta del proyecto (o en una carpeta que elijas dentro de ella) y una carpeta se une a las que usa (consulta [Añadir archivos a un proyecto](/guide/files-git#add-files-to-a-project)).

### Memoria

Lo que recuerda el proyecto, en una sola lista: sus notas, los artículos de su wiki, sus documentos y sus hallazgos. Un cuadro de búsqueda arriba busca en todos a la vez, **Añadir** incorpora una nota, archivos o una carpeta para mantener al día, y las etiquetas **Todos**, **Notas**, **Wiki**, **Documentos** y **Hallazgos** acotan la lista. Haz clic en una fila para abrirla a la derecha (en el teléfono ocupa el lugar de la lista). Un enlace a una etiqueta abre el proyecto en ella, y también lo hacen las direcciones de las antiguas pestañas Knowledge y LLM Wiki.

- **Notas**: las notas de memoria que los agentes guardaron sobre el proyecto, como las muestra [Configuración → Memoria](/settings?s=memory), con el perfil del proyecto primero. Son los datos breves con los que empieza cada sesión del proyecto (consulta [Memoria](/guide/memory)).
- **Wiki**: los artículos y las fuentes de la memoria wiki del proyecto, para leer. Los agentes la escriben; tú la lees aquí. El menú **⋯** tiene sus tareas y **Actualizaciones de la wiki…** (consulta [Memoria wiki](/guide/wiki-memory#a-projects-memory-tab)).
- **Documentos**: los documentos propios del proyecto, en los que solo buscan sus sesiones, y las carpetas que mantiene actualizadas. Consulta [Dar documentos propios a un proyecto](#give-a-project-documents-of-its-own). Los documentos nuevos y modificados también actualizan las notas y la wiki del proyecto mientras la Memoria wiki y **Aprender de documentos nuevos** están activadas (consulta [Aprender de documentos nuevos](/guide/wiki-memory#learn-from-new-documents)). Si un proyecto tiene más documentos de los que lee su wiki (100 al principio), la wiki lee los fijados, los que más usaron los agentes y los más recientes, hasta ese número, y el chip lo indica: “Su wiki lee 100 de sus 240 documentos: los fijados, los más usados y los más recientes. Los agentes buscan en todos.” Haz clic en un documento y activa **Leer en la memoria wiki** para fijarlo (consulta [Cuando un proyecto tiene demasiados documentos](/guide/wiki-memory#when-a-project-has-too-many-documents)).
- **Hallazgos**: lo que el proyecto probó y qué resultó, incluidos los callejones sin salida, cada uno con su veredicto y sus pruebas (consulta [Hallazgos](/guide/memory#findings-what-was-tried-and-what-came-of-it)).

### Investigación

Un proyecto que tiene investigación tiene esta pestaña, después de **Memoria**, en cuanto hay algo (las pruebas de un comando no cuentan): ejecuciones de [Experimentos](/guide/experiments) empezadas en su carpeta o dentro de ella, un [hallazgo](/guide/memory#findings-what-was-tried-and-what-came-of-it) del proyecto o una [evaluación](/guide/experiments#evaluations-keeping-score-the-same-way) en su carpeta (una evolución pertenece a su evaluación). Es un informe matutino con lo que hicieron tus agentes y lo que te necesita, de arriba abajo. Se actualiza solo mientras lo miras, cuando cambian las ejecuciones y cada medio minuto.

- **Esperándote**: tarjetas, como máximo tres, y luego **N más**; cuando no hay nada, “No hay nada esperándote.”. Primero va lo que frena las ejecuciones (las ejecuciones retenidas por tu límite de horas de GPU de los agentes, y después los archivos sellados que difieren) y después el resto, de lo más nuevo a lo más antiguo.
  - **Ejecuciones retenidas por tu [límite de horas de GPU de los agentes](/guide/experiments#what-agents-may-use-gpu-hours)**: “3 ejecuciones esperan: los agentes han usado las 100 horas de GPU que permites en siete días”, con **Dejar que se ejecuten** (esas ejecuciones, por encima del límite) y **Cambiar el límite…**. Una búsqueda retenida en ese límite tiene su propia tarjeta, con **Dejar que se ejecute** (la búsqueda completa) y **Abrir**.
  - Una pregunta, aprobación o formulario que planteó un agente del proyecto: la pregunta, cuándo se hizo y en qué sesión. Una pregunta con pocas opciones de respuesta única las muestra como botones que la responden al instante; **Responder en la sesión** abre la sesión para todo lo demás.
  - Un objetivo que te espera (sus comprobaciones por acordar, algo que solo tú puedes dar, una pausa, una pregunta): **Responder en la sesión** o **Abrir la sesión**.
  - **Los archivos sellados de una evaluación difieren**: cuántos archivos, con **Ver qué cambió** (la lista de cambios de la propia evaluación, donde puedes restaurarlos o sellar de nuevo).
  - **Medir la línea base de una evaluación** que no tiene ninguna: **Medir la línea base** pone sus ejecuciones en cola, como en la página de la evaluación; **Abrir** muestra la evaluación.
  - **¿Ejecutar la prueba final?** cuando un objetivo alcanzó su puntuación y la prueba final de la evaluación no se ha ejecutado desde entonces: **Ejecutar la prueba final…** pregunta, como hace la página de la evaluación, antes de que empiece nada; **Todavía no** oculta la tarjeta hasta que la evaluación tenga una nueva mejor puntuación. Los agentes nunca ejecutan la prueba final ni ven sus cifras.
  - **Una búsqueda que la app puso en pausa** (una evolución, con su motivo): **Reanudar** la continúa, **Abrir** muestra la búsqueda.
- **Desde la última vez que miraste**, con cuándo fue eso a la derecha; en la primera visita, **Los últimos siete días**. De lo más nuevo a lo más antiguo, seis líneas y luego **Mostrar N más**, bajo los nombres de los días cuando abarca más de un día. Los hallazgos registrados desde entonces (con su veredicto como en Memoria; haz clic en uno para leerlo allí), las ejecuciones que terminaron desde entonces (una línea por cada experimento, con su título como nombre cuando lo tiene; y una más, con **Ver las ejecuciones**, cuando varias fallaron por el mismo motivo: “4 ejecuciones se quedaron sin memoria con lotes de 4096, la misma configuración cada vez”), las búsquedas que probaron más versiones, las rondas que terminó un objetivo y una nueva mejor puntuación. Una ejecución fallida que se volvió a empezar con un intento que después terminó no necesita que la mires: la línea de su experimento dice “2 fallaron y se volvieron a empezar” y no está entre los fallos. Las ejecuciones archivadas se dejan fuera aquí y en el resto de la pestaña. Lo nuevo queda marcado durante esta visita; tu próxima visita parte desde ahora.
- **En qué punto está**, para cada evaluación del proyecto (las etiquetas permiten pasar de una a otra, primero la puntuada más recientemente): cómo está su mejor resultado respecto a la línea base, con las palabras de la propia evaluación, y si se ejecutó la prueba final; después, un gráfico de todas las puntuaciones a lo largo del tiempo: un punto por cada puntuación, la mejor hasta el momento como una línea escalonada, la línea base discontinua, las puntuaciones fallidas como pequeñas marcas rojas abajo, y cada escalón con el nombre de lo que se midió (el título del commit, o si no la rama; en el teléfono solo el mejor actual). Haz clic en un punto para ver esa puntuación. Un escalón solo lleva nombre cuando hay espacio para él, y un nombre largo se corta. Debajo: **Mejor**, **Línea base**, **Puntuaciones** y **Hallazgos** (haz clic para abrirlos en Memoria). Un proyecto sin evaluación muestra “Este proyecto todavía no tiene forma de llevar la puntuación”, con **Nueva evaluación…** (el editor de evaluaciones, para esta carpeta) y **Pedir a un agente que prepare una** (una nueva sesión en el proyecto con la petición escrita, sin enviar).
- **En ejecución y en espera**, con un enlace a **Experimentos**: las ejecuciones del proyecto que están en marcha (cuánto han avanzado y cuánto falta aproximadamente, cuando la app lo sabe) y las que esperan (una GPU, un espacio libre, la cola del clúster o la noche; “empieza hacia 14:20” cuando la app puede saberlo), y las búsquedas y los objetivos en marcha. Cuando hay más de cuatro líneas, se agrupan en recuentos como “9 ejecuciones esperan una GPU”.
- **Esta semana**: las horas de GPU de las ejecuciones del proyecto en los últimos siete días (GPU por horas de ejecución), y lo que cuestan los modelos de sus sesiones a precios de API, con cuántas sesiones. Cuando [limitas las horas de GPU de los agentes](/guide/experiments#what-agents-may-use-gpu-hours), las horas que se muestran son, en cambio, lo que han usado de ese límite todas las ejecuciones de los agentes en esta computadora (“61 de 100 h de GPU”), con una barra fina.

### Habilidades

Todas las habilidades que reciben las sesiones del proyecto: las propias, las de tu biblioteca de habilidades y las propias de Claude Code y Codex, cada una con un interruptor solo para este proyecto. Consulta [Dar habilidades propias a un proyecto](#give-a-project-skills-of-its-own).

### Agentes

Los agentes que trabajan solo en este proyecto, como un equipo: de cada uno, qué lo pone en marcha (**Tú lo pides** y sus programaciones con cuándo se ejecutan la próxima vez) y, debajo, los agentes a los que encarga trabajo, unidos por líneas. Haz clic en un agente para verlo junto al tablero: dónde trabaja, con qué piensa, qué puede hacer, quién se lo pide y cuánto gastó este mes, con **Empezar una sesión** (en este proyecto) y **Abrir** (su página). Debajo del tablero, **Also offered here, from Everywhere** lista los agentes que trabajan en todas partes. **Nuevo agente aquí** crea uno que trabaja en este proyecto (consulta [Agentes](/guide/agents)).

Un proyecto puede tener un agente hecho para él, con **Un agente para él** al crear el proyecto, o **Crear uno para este proyecto** en esta pestaña mientras no tiene ninguno:

- Cuando el proyecto dice suficiente sobre sí mismo (de qué trata y sus pautas, o un README o notas del agente en su carpeta), el modelo auxiliar redacta un agente adaptado a él, a partir de la plantilla de su tipo.
- Cuando dice poco, el agente es la plantilla de su tipo, según lo que contiene su carpeta o las palabras con que se lo describió: un ingeniero para software, un desarrollador web para un sitio web, un investigador de ML para experimentos de aprendizaje automático, un analista para datos, un redactor de artículos para un artículo en LaTeX, un investigador para artículos e informes que leer, un redactor para documentos, un diseñador para imágenes y videos, o un presentador para diapositivas.
- Sin nada en qué basarse, es el agente de proyecto predeterminado.

Lleva el nombre del proyecto (“Ingeniero de Tienda”), trabaja solo en el proyecto y en su carpeta y, a menos que el proyecto indique otro agente, las sesiones del proyecto empiezan con él. Cámbialo como cualquier agente tuyo. Cuando creas un proyecto desde la página de inicio, su chip **Agente** cambia a este agente en cuanto está listo, a menos que mientras tanto hayas elegido otro agente.

### Configuración

Todo lo relativo al proyecto en sí, en seis partes, cada una con una línea sobre para qué sirve:

- **El proyecto**: su **Nombre** (junto a su marca, en el color elegido), **De qué trata** y **Su color**.
- **Lo que sigue cada agente del proyecto**: sus **Pautas de los agentes**, como cuando lo creaste.
- **Cómo empiezan sus sesiones**: en **Sus sesiones empiezan como**, una opción para tocar: **El agente elegido en la página de inicio** (la predeterminada: la página de inicio mantiene el agente que elegiste en el proyecto, General hasta que elijas otro), o uno de tus agentes, integrado o propio. Un proyecto donde aún no has elegido nada se abre entonces en la página de inicio con ese agente.
- **Memoria wiki**: si el proyecto mantiene una wiki de artículos a partir de sus documentos y su trabajo: **Como en Configuración (Activado)** (o **(Desactivado)**, según el valor predeterminado actual), **Activado** o **Desactivado**. Se guarda al instante. [Configuración → Memoria](/settings?s=memory&find=Wiki%20memory) tiene el valor predeterminado para todos los proyectos (consulta [Memoria wiki](/guide/wiki-memory#turn-it-on-or-off)). Debajo, **Más documentos para leer en su wiki** es **Como en Configuración (100)** o **Un número propio**: en un proyecto con más documentos que ese número, su wiki lee solo esa cantidad (los fijados, los más usados y los más recientes), y los agentes buscan en todos (consulta [Cuando un proyecto tiene demasiados documentos](/guide/wiki-memory#when-a-project-has-too-many-documents)).
- **Se puede buscar desde otros proyectos**: un interruptor, activado de forma predeterminada, que se muestra para un proyecto, no para un grupo. Activado, los agentes de tus otros proyectos pueden encontrar y leer las notas, la wiki, los documentos y las conversaciones de este proyecto cuando los buscan (nunca los modifican); desactivado, el proyecto se queda para sí mismo y no pueden. Sus propias sesiones no se ven afectadas y aún pueden consultar tus otros proyectos. Se guarda al instante (consulta [Buscar más allá de un proyecto](/guide/memory#search-beyond-one-project)).
- **Los proyectos que reúne**: elige aquí proyectos para convertir este proyecto en un grupo (consulta [Reunir proyectos en un grupo](#bring-projects-together-in-a-group)).

Cuando cambias algo, una barra dice **Cambios sin guardar**, con **Deshacer cambios** y **Guardar**; permanece a la vista mientras te desplazas. Al final, **Eliminar el proyecto** indica qué se conserva, con su botón.

## Dale a un proyecto habilidades propias

Las habilidades son métodos escritos que los agentes cargan cuando una tarea lo requiere (consulta [Habilidades](/guide/skills)). Tu biblioteca de habilidades llega a todas las sesiones; un proyecto también puede tener habilidades propias, que solo reciben sus sesiones: cómo se hace su trabajo, paso a paso. Por ejemplo, "Citar en APA 7 y comprobar cada DOI" para una tesis, o "ingredientes en gramos, luego pasos numerados" para un recetario familiar. También puede activar o desactivar cualquier habilidad para sus propias sesiones. Ambas cosas están en la pestaña **Habilidades** del proyecto.

La pestaña muestra todas las habilidades que reciben las sesiones del proyecto, en grupos como en [Configuración → Habilidades](/settings?s=skills), con un cuadro de búsqueda, **Nueva habilidad**, el menú **⋯** y filtros: **Todos**, **Propio**, **Integrado**, **Tuyos**, **De plugins**, **Claude Code y Codex** y **Cambiada aquí**. Las habilidades propias del proyecto van primero, en **Propio**; si aún no hay ninguna, ese grupo explica para qué sirven, con **Nueva habilidad**.

**Nueva habilidad** abre una ventana con tres campos y luego **Añadir la habilidad**:

- **Nombre**: palabras en minúsculas separadas por guiones, como `citation-style`. Los espacios y las mayúsculas se convierten así al salir del campo. Los agentes conocen la habilidad por este nombre.
- **Cuándo usarla**: una línea, como "Úsala al citar una fuente en la tesis". Los agentes la ven en todas las sesiones del proyecto y leen el resto de la habilidad solo cuando una tarea encaja.
- **La habilidad**: los pasos en orden, las comprobaciones y los errores que se deben evitar, en Markdown.

Para cambiar una habilidad de tu biblioteca solo para este proyecto, ábrela en la pestaña y haz clic en **Cambiar para este proyecto**: se copia en el proyecto con sus otros archivos (ejemplos, scripts) y se abre la ventana para modificarla. La de la biblioteca se queda como está para todas las demás sesiones.

Una habilidad necesita un nombre de 2 a 64 caracteres, una línea sobre cuándo usarla de al menos 10 caracteres y pasos de más de unas pocas palabras; la habilidad completa admite como máximo 20.000 caracteres. Se rechaza una habilidad que parezca contener una contraseña, una clave o un token: indica mejor dónde se guarda el secreto.

### Activar o desactivar una habilidad para este proyecto

Cada habilidad de la pestaña tiene un interruptor al final de su fila: las de tu biblioteca (integradas, tuyas y de tus plugins), las propias del proyecto y las propias de Claude Code y Codex. Un interruptor aquí vale solo para las sesiones de este proyecto; los interruptores de [Configuración → Habilidades](/settings?s=skills) valen para todas las demás sesiones.

- Una habilidad con el interruptor en sentido contrario al de Configuración dice **Activada aquí** o **Desactivada aquí**, y el filtro **Cambiada aquí** muestra solo esas. Una habilidad desactivada en Configuración aparece como **Desactivado**: actívala para tenerla solo en este proyecto.
- En su ventana, una habilidad cambiada aquí indica qué tiene Configuración para las demás sesiones, y **Seguir Configuración** vuelve a eso. Volver a cambiar el interruptor a mano hace lo mismo.
- En el menú **⋯**, **Activar todas las habilidades** y **Desactivar todas las habilidades** activan o desactivan todas las habilidades que la pestaña muestra para este proyecto, después de que confirmes, y **Seguir la configuración predeterminada de todas las habilidades** devuelve cada habilidad a lo que indica Configuración, también tras confirmar. **Cambiar la configuración predeterminada de habilidades para todos los proyectos** abre Configuración → Habilidades. Activar o desactivar todas abarca cada habilidad de la pestaña, incluidas las que los filtros ocultan; las habilidades que se añadan después siguen su ajuste habitual, y las sesiones que ya están en marcha conservan el suyo hasta que vuelvan a empezar. Si no se pudieron leer las habilidades propias de Codex, la confirmación lo indica y se quedan como están.

Una sesión nueva del proyecto recibe los interruptores tal como están cuando empieza; una que ya está en marcha conserva lo que tenía al empezar, aunque Custom sigue un cambio desde su siguiente turno. Las habilidades propias de Claude Code y Codex se activan o desactivan para las sesiones del proyecto sin cambiar la configuración propia de esos agentes. En Configuración → Habilidades, una habilidad que un proyecto cambia en sentido contrario lo indica en su fila ("Desactivada en Tesis").

### La lista de habilidades de un proyecto

Cada habilidad propia del proyecto aparece como una fila: su nombre, cuándo usarla y cuántas veces la usaron los agentes del proyecto (y de los grupos que lo reúnen). Una habilidad con el nombre de una de tu biblioteca de habilidades tiene la insignia **En lugar de la de la biblioteca**: las sesiones del proyecto reciben esta en vez de la de la biblioteca.

- Haz clic en ella para leer la habilidad y su **Historial** de cambios. **Cambio**, al final de esa ventana, edita su nombre, cuándo usarla y su texto: un nombre nuevo conserva sus otros archivos, su historial y su interruptor.
- **Quitar**, en la misma ventana, la quita después de que confirmes. Las sesiones del proyecto dejan de verla, o vuelven a la habilidad de la biblioteca con ese nombre. Las habilidades quitadas aparecen bajo la lista, después de **Quitada:**: haz clic en una para recuperarla tal como estaba.

En un grupo, las habilidades propias de cada proyecto que reúne van a continuación, bajo el nombre de ese proyecto: las sesiones del grupo también las reciben. Cámbialas en los detalles de ese proyecto. Las habilidades propias de Claude Code y Codex se muestran para la carpeta del proyecto: las tuyas y las de esa carpeta (las de Claude Code, en su `.claude/skills`).

### Cómo las reciben los agentes

Cada sesión de Claude Code, Codex y Custom que empieza en el proyecto recibe sus habilidades junto con tu biblioteca de habilidades, tal como el proyecto las activa o desactiva: Claude Code, en el mismo plugin llamado "hydor" (hydor:citation-style); Codex, en la misma carpeta adicional de habilidades; Custom, en su lista de habilidades. Además, al agente se le dice cuáles son las habilidades propias del proyecto y que use una cuando encaje con la tarea. Custom recibe una habilidad que añadas o cambies desde su siguiente turno; Claude Code y Codex, desde su siguiente sesión.

Las habilidades se guardan en la carpeta de datos de la app, no en la carpeta del proyecto, así que tus archivos se quedan como están. Las sesiones de un grupo también reciben las habilidades de los proyectos que reúne (consulta [Qué reciben las sesiones de un grupo](#what-sessions-in-a-group-get)).

### Habilidades que los agentes proponen en un proyecto

Tras una tarea que requirió un esfuerzo real, un agente puede proponer conservar su método como habilidad, o mejorar una que siguió, y tú la apruebas, la editas o la descartas (consulta [Aprobar, editar o descartar una habilidad propuesta](/guide/skills#approve-edit-or-dismiss-a-proposed-skill)). Cuando la sesión está en un proyecto, la tarjeta pregunta dónde conservarla, en **Conservarla para**:

- **Todas las sesiones**: en tu biblioteca de habilidades, como fuera de un proyecto;
- el nombre del proyecto: solo en las habilidades del proyecto. Si es una mejora de una habilidad de la biblioteca, el proyecto recibe su propia versión con el cambio, y la de la biblioteca se queda como estaba.

El agente sugiere una de las dos; tú eliges antes de aprobar. Una mejora de una habilidad propia del proyecto no tiene opción: sigue siendo del proyecto.

## Cambiar un proyecto

Abre los detalles del proyecto, ve a su pestaña **Configuración**, cambia lo que quieras y haz clic en **Guardar**. Las sesiones que empieces en el proyecto a partir de entonces recibirán el nuevo nombre, la descripción y las pautas. Un agente nuevo lo aplica la próxima vez que elijas el proyecto en la página de inicio, o cuando hagas clic en **Nueva sesión** en sus detalles. La carpeta del proyecto no cambia: no se puede mover a otra carpeta.

## Eliminar un proyecto

1. Abre los detalles del proyecto y haz clic en **Más** (⋯) en la parte superior, o ve a su pestaña **Configuración**.
2. Haz clic en **Eliminar el proyecto**.
3. La app pregunta "¿Eliminar el proyecto *nombre*?" Haz clic en **Eliminar**. Si es un proyecto que Hydor encontró, añade "Hydor lo encontró en las sesiones de Claude Code y no lo volverá a crear." (o de Codex, o de Claude Code y Codex).

Eliminar un proyecto conserva todo lo que había en él:

- **Su carpeta** y los archivos que contiene se quedan donde están, igual que las carpetas con las que trabajó.
- **Su carpeta pasa a la lista No es un proyecto**: Hydor no volverá a sugerirla ni a convertirla en proyecto por sí solo. Aun así, puedes crear tú mismo un proyecto para ella (**Nuevo proyecto** → **En una carpeta que ya tengo**).
- **Sus sesiones** se quedan y ya no pertenecen a un proyecto.
- **Lo que conservó** (páginas, diseños, documentos, imágenes…) se queda, sin proyecto: con la conversación que lo creó, y el cuadro de búsqueda (Ctrl+K) lo sigue encontrando. Su propia página tiene **Mover a un proyecto** para ponerlo en otro. Los archivos que tenían en la carpeta del proyecto se quedan allí como archivos normales.
- **Sus documentos** pasan al Conocimiento compartido, así que todas las sesiones pueden buscarlos a partir de entonces. Para mantenerlos aparte, mueve su base de conocimiento a otro proyecto (consulta [Renombrar, mover, volver a leer o eliminar una base de conocimiento](#rename-move-read-again-or-delete-a-knowledge-base)).
- **Sus habilidades** pasan a tu biblioteca de habilidades, así que todas las sesiones las reciben a partir de entonces. Una que tenga el nombre de una habilidad que la biblioteca ya tiene toma el nombre del proyecto después del suyo: la `research` del proyecto Tesis se convierte en `research-thesis`.
- **Lo que recuerdan los agentes** sobre su carpeta se conserva: las notas pertenecen a la carpeta, no al proyecto.
- Sale de cualquier grupo en el que estuviera. Un grupo que se queda sin ninguno de sus proyectos pasa a ser un proyecto normal.

## Reunir proyectos en un grupo

Un grupo es un proyecto que reúne varios proyectos, para un trabajo que los abarca: por ejemplo, "Todo para la tesis", que reúne "Tesis" y "Notas de lectura". Tiene todo lo que tiene un proyecto: un nombre, una carpeta propia, pautas, documentos, habilidades y un agente. Sus sesiones también trabajan con cada proyecto que reúne.

### Qué reciben las sesiones de un grupo

- **Las carpetas de los proyectos**: Claude Code puede trabajar en cada una como en su propia carpeta; a los demás agentes se les dice dónde está cada una. Lo que crea una sesión va a la carpeta propia del grupo, a menos que indiques otra cosa.
- **Las pautas de los proyectos**: después de las del propio grupo, el nombre de cada proyecto, de qué trata, su carpeta y sus pautas.
- **Los documentos de los proyectos**: se buscan junto con los documentos propios del grupo y el Conocimiento compartido (a menos que el grupo desactive el Conocimiento compartido). Al agente se le dice de qué proyecto viene cada base de conocimiento.
- **Las habilidades de los proyectos**, junto con las propias del grupo y tu biblioteca de habilidades. Cuando dos tienen el mismo nombre, va primero la propia del grupo y después la del proyecto que se reunió primero.
- **La Memoria** viene de la carpeta propia del grupo. Las notas que los agentes guardaron en cada proyecto se quedan con ese proyecto.

### Crear un grupo

1. En la página Proyectos, abre el ▾ junto a **Nuevo proyecto** y elige **Nuevo grupo de proyectos…** (necesita dos proyectos). O, en la barra lateral, haz clic en el **+** al final del encabezado **Proyectos** y elige **Nuevo grupo de proyectos…**. Necesitas al menos un proyecto que reunir.
2. En **Nuevo grupo de proyectos**, ponle un **Nombre**, como "Trabajo" o "Todo para la tesis".
3. En **Los proyectos que reúne**, toca cada proyecto que quieras incluir; vuelve a tocarlo para quitarlo. Elige al menos uno.
4. Si quieres, rellena **De qué trata** y las **Pautas de los agentes**, y elige un color.
5. Haz clic en **Crear el grupo**. Como un proyecto, recibe una carpeta propia para lo que se cree en él, y se abren sus detalles.

También puedes convertir un proyecto existente en un grupo: en su pestaña **Configuración**, elige proyectos en **Los proyectos que reúne** y haz clic en **Guardar**. Los proyectos de un grupo se cambian del mismo modo. Si quitas todos, vuelve a ser un proyecto normal.

La pestaña **Memoria** de un grupo, bajo su chip **Documentos**, también muestra **También se busca en:** cada uno de los proyectos que reúne, con cuántos documentos tiene. Haz clic en uno para abrir los documentos de ese proyecto. Su pestaña **Habilidades** muestra **También las habilidades de los proyectos que reúne** de la misma manera.

### Límites

- Un grupo reúne proyectos normales, no otros grupos: los grupos tienen un solo nivel. Un proyecto que está en un grupo no puede reunir otros proyectos; en su pestaña Configuración se indica en qué grupo está.
- Un proyecto puede estar en varios grupos.
- Un grupo reúne como máximo 12 proyectos. Cuando ya hay 12 elegidos, no se pueden tocar los demás.

## Mostrar en la barra lateral solo las sesiones de un proyecto

La barra lateral le da a cada proyecto su propio grupo, bajo su nombre y su marca, con sus sesiones más recientes; el lápiz al final del encabezado del grupo empieza una nueva sesión en el proyecto. Consulta [La lista de sesiones](/guide/start#the-session-list). Un proyecto puede tener allí carpetas propias para ordenar sus sesiones: su menú **⋯** → **Nueva carpeta**, y aparecen bajo su encabezado antes de sus demás sesiones. Consulta [Ordenar las sesiones en carpetas](/guide/start#sort-sessions-into-folders). Al eliminar un proyecto se quitan sus carpetas; sus sesiones se conservan.

Para mostrar solo las sesiones de un proyecto:

1. En la parte superior de la barra lateral, haz clic en el botón de filtro (**Filtrar y agrupar sesiones**).
2. En **Proyecto**, el menú muestra **Todos los proyectos** y hasta ocho de tus proyectos (encima están **Agente** y **Se ejecuta en**; **Nuevo proyecto…** y **Agrupar por carpeta o proyecto** están debajo). Elige un proyecto.

La lista de sesiones muestra entonces solo las sesiones de ese proyecto, por día, el botón de filtro se colorea mientras hay un filtro activo, y bajo **Nueva sesión** aparece un chip con el nombre del proyecto: haz clic en su × para volver a ver todas las sesiones. También puedes elegir **Todos los proyectos**. Los demás filtros funcionan a la vez: elige un agente en **Agente** (o un programa en **Se ejecuta en**) para mostrar solo sus sesiones en el proyecto. Si se elimina el proyecto, la lista vuelve a mostrar todas las sesiones.

En los detalles del proyecto, **Más** (⋯) → **Solo sus sesiones en la barra lateral** hace lo mismo, con una marca mientras está activo; vuelve a elegirlo para ver todas las sesiones.

En un teléfono, abre primero la barra lateral (un cajón).

## Compartir un proyecto con otras personas

Puedes invitar a otras personas a un proyecto, como un asesor y los estudiantes que trabajan contigo, cada una con su propio enlace. Sin tu contraseña, ven los documentos del proyecto, sus sesiones y, cuando los tiene, sus ejecuciones y su lista de lectura. Comentan sus documentos con su propio nombre y, si tú lo permites, también cambian sus documentos. Nunca llegan a tus agentes, tus archivos, tu configuración ni tus otros proyectos. Para compartir una sola cosa (un documento, una página, una imagen, un video…), consulta [Compartir con otras personas](/guide/library#share-with-people).

### Invitar a alguien

1. Abre los detalles del proyecto y haz clic en **Más** (⋯) en la parte superior, y luego en **Compartir con otras personas**.
2. En **Invitar a alguien**, escribe **Su nombre**. Sus comentarios y cambios aparecerán con ese nombre.
3. Elige qué pueden hacer:
   - **Ver y comentar**: leen todo lo que el proyecto comparte y comentan sus documentos, documentos LaTeX, diapositivas, hojas de cálculo y páginas.
   - **Editar documentos**: además, cambian sus documentos, hojas de cálculo, diapositivas, páginas y diseños, en los editores propios de la app (las palabras, las imágenes y la disposición de una página, nunca su código), y sus documentos LaTeX donde esta computadora los compila en un entorno aislado (consulta [Lo que nunca se comparte](#what-is-never-shared)).
4. Elige durante cuánto tiempo funciona el enlace: **Una semana**, **Un mes** o **Hasta que lo detengas**.
5. Haz clic en **Crear su enlace**. Cópialo con el botón de copiar y envíaselo, o haz clic en el botón del código QR para mostrarlo como código QR que pueden escanear con la cámara del teléfono. El enlace se muestra solo ahora: la app guarda únicamente una huella de él, así que no puede volver a mostrarlo. Siempre puedes crearles uno nuevo.

Un agente también puede crear un enlace, con tu aprobación cada vez: “Comparte mi proyecto Tesis con María para que pueda comentar, durante un mes.”

### Lo que ven

Su enlace abre el proyecto por sí solo, con el aspecto de la app, sin nada más tuyo alrededor:

- Arriba, la marca del proyecto, su nombre y de qué trata. A la derecha, su propio nombre: su menú indica qué pueden hacer y hasta cuándo, y quién lo compartió con ellos, y tiene **Idioma** (English, Deutsch, 中文, Ελληνικά) y **Tema** (**Claro**, **Oscuro** o **Como este dispositivo**) para su navegador.
- **Documentos**: las páginas, documentos, presentaciones, hojas de cálculo, documentos LaTeX y cuadernos del proyecto, cada uno con su imagen. Uno se abre para leerse como lo muestra su propia dirección (un documento LaTeX compilado en páginas, con su código fuente a un clic), con **Descargar** para sus archivos: un PDF, un documento de Word, el proyecto LaTeX, etc. Con **Editar documentos**, los documentos, hojas de cálculo, diapositivas, páginas y diseños se abren en su editor.
- **Sesiones**: las sesiones del proyecto, tal como las muestra un [enlace de solo lectura](/guide/devices#share-a-session-with-a-read-only-link): la conversación, los pasos por su nombre, los cambios en archivos y las páginas que mostró el agente, y se actualiza mientras un agente trabaja. Nunca muestra la salida de comandos, el razonamiento del agente ni lo que se le dio a un paso. Una sesión confidencial nunca se muestra.
- **Ejecuciones**, cuando el proyecto tiene experimentos: el nombre de cada ejecución, cómo le fue y cuándo, sus métricas y su configuración. Nunca su comando, su carpeta, su registro ni la máquina en que se ejecutó.
- **Lista de lectura**, cuando tu app de lista de lectura tiene artículos para el proyecto: el título de cada artículo (un enlace a él), sus autores, medio de publicación y año, si está leído y sus etiquetas. Nunca tus notas sobre él ni sus archivos.

La página se actualiza sola cada minuto mientras está abierta. Los agentes que trabajan en el proyecto saben con quién está compartido y que esas personas leen sus sesiones, así que mantienen fuera de ellas claves, contraseñas y datos privados.

### Comentarios con su nombre

En un documento, un documento LaTeX, unas diapositivas, una hoja de cálculo o una página, **Comentarios** (al lado, o encima en un teléfono) muestra sus comentarios y respuestas, cada uno bajo el nombre de quien lo escribió: los de ellos como **Tú**, los de un agente como **Agente**, y los tuyos con tu nombre. Al final del cuadro de Compartir, **Ven tus comentarios como** indica ese nombre (“Owner” hasta que lo cambies); **Cambio** establece otro.

Para comentar, hacen clic en **Añadir un comentario** y luego pegan las palabras a las que se refiere, copiadas del documento, o las omiten para comentar todo el documento; en las diapositivas eligen la diapositiva, y en una hoja de cálculo la hoja y la celda (como B4). Pueden responder a cualquier comentario y resolverlo o reabrirlo, pero solo modificar o eliminar los suyos. Con **Editar documentos**, comentan en el propio editor, como tú.

En tu propio editor, sus comentarios aparecen con su nombre, y los agentes los leen y los responden como responden los tuyos: “Responde a los comentarios de María en el capítulo 3.” A los agentes se les indica que tomen sus comentarios solo como peticiones sobre el documento, y que no hagan nada más de lo que alguien les pida (ejecutar un comando, abrir un archivo, escribir a alguien) a menos que tú lo pidas. Cuando alguien comenta o responde, recibes un aviso (“María comentó: …”) y una línea en tu [bandeja de entrada](/inbox) (“María comentó en “Tesis, capítulo 3””), que permanece hasta que tú o un agente respondan, o hasta que se resuelva el comentario.

Cada comentario se guarda como una nueva versión del documento; varios seguidos se conservan como una sola versión. Si guardas el documento en su editor mientras llegaban comentarios, se conservan, sobre las palabras a las que se referían.

### Cambios con su nombre

Con **Editar documentos**, lo que guardan es una nueva versión del documento, con su nombre en la lista de **Versiones**, y a los agentes se les indica quién lo cambió por última vez. No pueden cambiar quién escribió los comentarios de otras personas, ni eliminarlos. Si el documento cambió desde que lo abrieron, se les pregunta antes de guardar el suyo encima (la otra versión queda entre sus versiones).

### Cambiar o dejar de compartir

En el cuadro de Compartir, **Compartido con** muestra a cada persona, con lo que puede hacer, hasta cuándo y lo último que hizo. Su menú **Más** (⋯) tiene:

- **Ver y comentar** o **Editar documentos**: lo que pueden hacer, desde su próximo clic.
- **Durante una semana desde ahora**, **Durante un mes desde ahora** o **Hasta que lo detengas**.
- **Crear un enlace nuevo**: su enlace deja de funcionar de inmediato; envíales el nuevo. Siguen siendo la misma persona y sus comentarios siguen siendo suyos.
- **Dejar de compartir**: su enlace deja de funcionar de inmediato. Lo que escribieron permanece, con su nombre.

Un enlace que caducó, se detuvo o se volvió a crear lo indica al abrirse (“This link has expired”, “This link was turned off”), y pueden pedirte uno nuevo.

### Lo que nunca se comparte

- **Tus agentes**: no pueden empezar ni dirigir una sesión, ni preguntarle nada a un agente. Leen sesiones y comentan documentos.
- **Tus archivos**: ni la carpeta del proyecto ni ninguna carpeta tuya. Solo lo que el proyecto guarda (sus páginas, documentos, imágenes y similares), y sus sesiones como enlaces de solo lectura lo muestran.
- **Tu configuración, tus otros proyectos** y todo lo demás en la app. El enlace de un grupo muestra lo propio del grupo, no lo de los proyectos que reúne.
- **Ejecutar cualquier cosa**: una página HTML (una app pequeña, un seguimiento) se muestra con sus datos tal cual, y lo que cambia no se guarda; con **Editar documentos** cambian sus palabras, imágenes y disposición, nunca su código (sus scripts y lo que se ejecuta al hacer clic); un cuaderno muestra sus celdas y resultados y nunca se ejecuta. Los documentos LaTeX se cambian mediante un enlace solo donde TeX se ejecuta aislado con bubblewrap (Linux); en otros casos las personas los leen y comentan.

Cada enlace es un código aleatorio largo que abre un proyecto para una persona. Un código que no abre nada cuenta como una contraseña incorrecta desde donde llegó: después de diez en una hora, esa dirección no puede abrir enlaces ni iniciar sesión durante una hora (consulta [Acceder a la app desde otro dispositivo](/guide/devices#reach-the-app-from-another-device)).

## Conocimiento compartido: documentos que toda sesión puede buscar

Los agentes pueden buscar en documentos que agregas una sola vez: contratos, manuales, notas, artículos, una carpeta entera. Encuentran pasajes por sus palabras o por su significado, y citan el archivo y la página que leyeron. Los documentos se guardan en **bases de conocimiento**: colecciones con nombre de archivos que soltaste y carpetas de esta computadora.

- **Conocimiento compartido** ([la página de Conocimiento compartido](/knowledge)): toda sesión lo busca, también en un proyecto, a menos que el proyecto lo desactive.
- **El conocimiento propio de un proyecto**, en su pestaña **Memoria** (la etiqueta **Documentos**): solo lo buscan las sesiones de ese proyecto, y las de un grupo que incluya el proyecto.

Conocimiento compartido es una página propia, sin columna de proyectos al lado. Para abrirla, haz clic en **Conocimiento compartido** en el texto de la parte superior de [Configuración → Memoria](/settings?s=memory), o escribe “conocimiento compartido” en el cuadro de búsqueda (Ctrl+K).

## Agregar documentos

Si aún no hay conocimiento compartido, la página dice “Add your documents once” sobre un cuadro grande donde soltar documentos. Suelta ahí archivos o una carpeta, y se crea para ellos una base de conocimiento llamada “My documents”. **Mejor empezar con una carpeta de esta computadora** crea una base “My documents” vacía, a la que luego agregas una carpeta.

Cada base de conocimiento tiene su propio cuadro para soltar y su propio botón **Agregar una carpeta de esta computadora**. Para empezar otra base, haz clic en **Nueva base de conocimiento** en la parte superior de la página (**Nueva** en un teléfono). Las bases separadas mantienen las cosas aparte, y un agente puede buscar en una base por su nombre, pero una basta para empezar.

### Soltar o elegir archivos

Arrastra documentos o una carpeta al cuadro de una base de conocimiento (“Drop documents or a folder here”), o haz clic en **elige archivos**, o en **carpeta** para elegir una carpeta entera. Los archivos se copian en la carpeta de datos de la app y se leen en cuanto entran, así que los cambios posteriores en tus originales no llegan a la base. Un pequeño panel muestra la subida. Si ya hay en la base un archivo con el mismo nombre, el panel pregunta si quieres **Reemplazar**lo, **Omitir los existentes** o **Cancelar**.

Los archivos vienen del dispositivo que estás usando. En un teléfono, **elige archivos** abre el selector de archivos del teléfono; elegir una carpeta entera solo se ofrece en una computadora.

### Agregar una carpeta de esta computadora

1. En una base de conocimiento, haz clic en **Agregar una carpeta de esta computadora**.
2. En el menú que se abre (“A folder to read, and keep up to date”), escribe el nombre de una carpeta para encontrarla entre las que usaste hace poco y las de tu carpeta personal, o escribe su ruta, como `~/Documents/Manuals`. Elígela.

La carpeta se lee donde está: no se copia nada. Aparece como una etiqueta en la base, y la base se mantiene al día con ella. Un minuto después de que arranca la app, y cada hora a partir de entonces, la app lee lo nuevo o modificado en la carpeta y descarta lo que se eliminó; tras un arranque, también reintenta los documentos que no se pudieron leer, que una versión más reciente podría leer. Para leerla de inmediato, elige **Leer de nuevo ahora** en el menú de la base.

“Esta computadora” es aquella en la que se ejecuta Hydor, que puede no ser el dispositivo que tienes delante.

Para dejar de leer una carpeta, haz clic en la × de su etiqueta. Sus documentos salen de la base; la carpeta y sus archivos quedan intactos.

### Qué se puede leer

- **Documentos**: PDF, Word, Excel, PowerPoint, OpenDocument, EPUB, CSV y RTF; también archivos antiguos .doc, .xls y .ppt cuando LibreOffice está instalado en esta computadora.
- **Texto**: texto sin formato y Markdown, páginas web (su texto, sin el marcado), y archivos de código y datos como JSON, YAML, Python o JavaScript.

Quedan fuera: las imágenes; los archivos y carpetas cuyo nombre empieza con un punto (los ocultos); y las carpetas que crean las herramientas, como `node_modules`, `.git`, `dist`, `build`, `target` y `venv`. De una carpeta se leen hasta 20.000 archivos y 12 niveles de profundidad. De un archivo de texto de más de 4 MB, como un registro o un archivo de datos grande, se leen los primeros 4 MB, y su último pasaje indica dónde se cortó. No se leen los documentos de más de 300 MB. Un PDF escaneado sin capa de texto no tiene texto que buscar.

Cada documento se corta en pasajes de hasta unos 1.400 caracteres, y cada uno conserva la página, diapositiva, hoja o encabezado de donde vino, para que los agentes puedan citarlo.

## Ver qué contiene una base de conocimiento

Cada base de conocimiento es una tarjeta. Bajo su nombre, una línea cuenta lo que contiene: sus documentos y pasajes, cuánto está listo para buscarse por significado (cuando está activado: “ready to search by meaning”, o un porcentaje mientras se prepara, que sube a medida que avanza), y hace cuánto se leyó por última vez (“read 25m ago”). Mientras se lee, la línea empieza con “Reading 12 of 40…”.

Mientras la búsqueda por significado está activada pero no puede preparar ahora los pasajes, una línea sobre las bases de conocimiento explica por qué, y los agentes encuentran pasajes por sus palabras hasta entonces:

- **Search by meaning is setting itself up on this computer**, con lo que está haciendo (instalar PyTorch, por ejemplo): una sola vez, la primera vez.
- **Search by meaning is starting**: carga su modelo (lo descarga, la primera vez).
- **Search by meaning is waiting for memory**, con cuánta hay libre y cuánta necesita. Reintenta cada pocos minutos; cerrar algunos programas ayuda.
- **Search by meaning stopped**, con el motivo. Haz clic en **Reintentar** cuando lo hayas resuelto (instalado Python, por ejemplo), o inténtalo de nuevo en [Configuración → Memoria](/settings?s=memory&find=Search%20by%20meaning).

- **Mostrar los documentos** muestra todos los documentos: su nombre o ruta, luego cuántos pasajes tiene y su tamaño. Una chincheta marca un documento que fijaste para la memoria wiki y, mientras la memoria wiki está activada, el menú **Más** de su fila tiene **Leer en la memoria wiki** (fijarlo) o **No leer en la memoria wiki** (consulta [Cuando un proyecto tiene demasiados documentos](/guide/wiki-memory#when-a-project-has-too-many-documents)). **sin texto** marca un documento sin nada que leer, y **no se pudo leer** uno que falló; apunta a él para ver el motivo. Haz clic en un documento para abrirlo. **Ocultar los documentos** pliega la lista.
- Cuando algunos documentos no se pudieron leer, una línea roja indica cuántos, con los primeros y el motivo de cada uno.
- Un archivo que soltaste se puede quitar con la × al final de su fila (en una computadora, aparece al apuntar a la fila). Esto elimina la copia de la base. Un documento de una carpeta de esta computadora no tiene ×: quítalo de la propia carpeta, o deja de leer la carpeta.

## Cambiar el nombre, mover, leer de nuevo o eliminar una base de conocimiento

El botón ⋯ (**Más**) en la parte superior derecha de una base de conocimiento abre su menú:

- **Leer de nuevo ahora**: vuelve a leer sus archivos y carpetas al instante, por si acabas de añadir archivos o una carpeta cambió, y reintenta los documentos que no se pudieron leer.
- **Cambiar nombre**: abre **Renombrar la base de conocimiento**. Escribe el nuevo nombre (hasta 60 caracteres) y haz clic en **Guardar**.
- **Mover a**: **Conocimiento compartido**, o uno de tus proyectos; una marca indica dónde está ahora la base. En un proyecto, solo las sesiones de ese proyecto la buscan; en el conocimiento compartido, la buscan todas las sesiones. Esta opción aparece cuando ya tienes proyectos.
- **Eliminar**: pregunta “¿Eliminar *nombre*?”. Se eliminan sus fragmentos, y con ellos los archivos que arrastraste a la base; las carpetas de esta computadora se quedan como están. Haz clic en **Eliminar** para continuar.

## Dar documentos propios a un proyecto

Abre los detalles del proyecto, ve a su pestaña **Memoria** y elige el chip **Documentos**.

- Añade documentos con **Añadir** → **Archivos…**, o suelta archivos o una carpeta en cualquier parte de la pestaña: se crea una base de conocimiento con el nombre del proyecto para ellos, y los documentos se incorporan a la lista. **Añadir** → **Una carpeta para mantener actualizada…** (o **Añadir una carpeta** debajo del chip) lee una carpeta de esta computadora donde está, como en [Añadir una carpeta en esta computadora](#add-a-folder-on-this-computer); una × junto a una carpeta deja de leerla, tras pedir confirmación. Si aún no hay documentos, el chip es una zona para soltar archivos, con **Añadir una carpeta para mantener actualizada** debajo.
- Cada documento es una fila (“Documento · 12 pasajes · 2,1 MB · leído ayer”). Haz clic en ella para ver de dónde viene, su formato, tamaño y pasajes, cuándo se leyó, **Abrir**, **Quitar** (para un archivo que añadiste: esto elimina la copia que Hydor guardó) y **Leer en la memoria wiki**. **Volver a leer los documentos**, en el menú **⋯**, vuelve a leer los archivos y carpetas de inmediato.
- El cuadro de búsqueda sobre la lista busca en los documentos junto con las notas y la wiki del proyecto (consulta [Probar una búsqueda tú mismo](#try-a-search-yourself)).
- Que las sesiones del proyecto busquen también en el conocimiento compartido es un interruptor en su pestaña **Configuración**, **Buscar también en el conocimiento compartido**, activado a menos que lo desactives: si está desactivado, solo buscan en los documentos propios del proyecto (y, en un grupo, en los de sus proyectos). La línea que hay debajo indica cuántos documentos compartidos hay, con un enlace a **Conocimiento compartido**.

Una base de conocimiento se puede mover a un proyecto desde su menú en la página de Conocimiento compartido (**Mover a**), y de vuelta. El índice de búsqueda propio de la wiki, una base llamada “Project wiki”, no aparece entre los documentos de un proyecto.

## Cómo buscan los agentes en tus documentos

Cuando hay al menos una base de conocimiento, los agentes reciben herramientas para buscar en los documentos que su sesión puede consultar, para leer más de un documento alrededor de un fragmento y para listar lo que contienen las bases de conocimiento. Claude Code, Codex, Custom y los agentes que usan ACP y admiten servidores MCP (servidores de herramientas) las reciben todas.

Al empezar una sesión, se le indica al agente en qué bases de conocimiento puede buscar y cuántos documentos tiene cada una; en un proyecto, también si cada una es del propio proyecto, compartida o de un proyecto que su grupo incorpora. Se le indica que busque primero ahí, antes que en la web o en la memoria, cuando una pregunta pueda responderse con ellas; que responda a partir de lo que dicen los fragmentos; que cite cada fragmento que use con su archivo y su página o parte, y su ruta; y que lo diga cuando los documentos no respondan a la pregunta.

En la conversación, una búsqueda aparece como un paso: **Se buscó en tus documentos**, lo que buscó y cuántos fragmentos encontró, o “no se encontró nada”. Haz clic en él para ver los fragmentos, cada uno con su archivo, página y base de conocimiento. Haz clic en un fragmento para abrir el archivo.

### Por palabras, por significado o el texto exacto

Los agentes buscan de tres maneras:

- **Por palabras**: fragmentos que contienen las palabras de la pregunta, primero las mejores coincidencias. Siempre disponible.
- **Por significado**: fragmentos que significan lo que pregunta la consulta, aunque estén en otras palabras o en otro idioma. Para esto se necesita **Búsqueda por significado**, que está activada a menos que la desactives en [Configuración → Memoria](/settings?s=memory&find=Search%20by%20meaning). Se ejecuta en esta computadora y, mientras está activada, cada base se prepara para ella en segundo plano (consulta [Memoria](/guide/memory#search-by-meaning)). Mientras está desactivada, la página de Conocimiento compartido y la pestaña Conocimiento de cada proyecto indican dónde activarla, y los agentes encuentran fragmentos por sus palabras.
- **El texto exacto**: una frase entre comillas (“plazo de preaviso”) o un patrón entre barras (una expresión regular, como `/INV-\d+/`), que se encuentra como lo haría el comando grep: para nombres, números y códigos. Estos fragmentos llegan en el orden en que aparecen en los documentos.

Un agente busca por palabras y por significado a la vez, a menos que pida solo una de las dos, y una pregunta entre comillas o entre barras se busca de forma exacta. Recibe 8 fragmentos cada vez, a menos que pida más (hasta 25), y puede buscar en una sola base de conocimiento por su nombre.

### Prueba una búsqueda tú mismo

En la página de Conocimiento compartido, encima de las bases de conocimiento, un campo dice “Prueba una búsqueda, como los agentes: una pregunta, o “palabras exactas” entre comillas”. Escribe y pulsa Intro. Se devuelven hasta 10 pasajes, cada uno con su archivo y página, su base de conocimiento y cómo se encontró: **por palabras**, **por significado**, o ambos, o **por texto exacto** para el texto exacto. Haz clic en uno para abrir el archivo.

En la página de Conocimiento compartido, este campo busca lo que busca una sesión fuera de cualquier proyecto. En un proyecto, el cuadro de búsqueda de su pestaña **Memoria** busca en las notas, la wiki y los documentos del proyecto a la vez, y nunca en el conocimiento compartido.

## Qué sesiones buscan en qué conocimiento

| Una sesión… | busca en |
|---|---|
| fuera de cualquier proyecto | el conocimiento compartido |
| en un proyecto | los documentos propios del proyecto y el conocimiento compartido, salvo que el proyecto lo desactive |
| en un grupo | los documentos propios del grupo, los documentos de cada proyecto que reúne y el conocimiento compartido, salvo que el grupo lo desactive |
| iniciada por otra sesión (un subagente de Hydor) | lo que busca la sesión que la inició |

Las herramientas de conocimiento nunca muestran los documentos de otro proyecto, ni siquiera cuando un agente pide un archivo por su ruta. Una base de conocimiento cuyo proyecto se eliminó pasa a ser compartida.

## Pídeselo a un agente

- “Crea un proyecto llamado Impuestos 2026 para mis recibos y mi declaración de impuestos. Sus sesiones deben empezar como el Investigador, y todos los agentes del proyecto deben saber que los importes están en EUR.”
- “Crea un proyecto llamado Tienda para mi código en ~/code/shop.”
- “¿Qué guarda mi proyecto Tesis en sus archivos? Mueve a él el seguimiento de lecturas.”
- “Guarda este informe en mi proyecto Tesis, en su carpeta reports.”
- “¿En qué carpetas he estado trabajando que todavía no están en un proyecto? Crea proyectos para las dos que más uso.”
- “¿Cuáles de mis proyectos vienen de Claude Code o de Codex?”
- “Abre la página Proyectos y ordena mis proyectos por más sesiones.”
- “¿Cuál de mis proyectos lleva un mes sin ninguna sesión?”
- “¿Qué necesita mi atención en mi proyecto Recuperador denso?”
- “¿Qué pasó en mi proyecto Recuperador denso desde la última vez que lo miré?”
- “No crees un proyecto para ~/code/scratch por separado.”
- “Copia ~/Downloads/contract.pdf en mi proyecto Impuestos 2026, y haz que trabaje también con ~/Documents/Receipts.”
- “Agrupa mis proyectos Tesis y Notas de lectura en uno llamado Todo para la tesis.”
- “Dale una habilidad a mi proyecto Tesis: citar en APA 7 y comprobar que cada DOI funcione antes de que entregue un capítulo.”
- “Copia la habilidad de redacción en mi proyecto Jardín y cámbiala ahí para que use palabras sencillas para niños.”
- “En mi proyecto Sitio web de la tienda, activa la habilidad de docker y desactiva la habilidad deploy de Claude Code, solo para ese proyecto.”
- “Añade la carpeta ~/Documents/Manuals a mi conocimiento compartido.”
- “Haz privado mi proyecto Impuestos 2026: los demás proyectos no deben poder buscar en él.”
- “Mueve la base de conocimiento Contratos al proyecto Impuestos 2026 y haz que ese proyecto deje de buscar en el conocimiento compartido.”
- “¿Qué bases de conocimiento tengo y qué documentos no se pudieron leer?”
- “Comparte mi proyecto Tesis con María para que pueda comentar, durante un mes, y con Nikos para que pueda editar los documentos.”
- “¿Con quién está compartido mi proyecto Tesis y qué hizo cada uno por última vez?”
- “Responde a los comentarios de María sobre el Capítulo 3 y luego resuelve los que ya atendiste.”
- “Deja de compartir mi proyecto Tesis con Nikos.”
