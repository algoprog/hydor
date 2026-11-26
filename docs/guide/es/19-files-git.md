# Archivos, Git, Terminal y Vista previa

**Archivos**, **Git** y **Sistema** en la barra de iconos son tu puerta de entrada a esta computadora: explora, busca, abre y edita sus archivos, añádelos a proyectos y a nuevas sesiones, busca dentro de ellos, ejecuta cuadernos de Jupyter, haz commit y push con Git, abre pull requests y revisa lo que cambia una rama. Aquí también están las terminales, las vistas previas de las apps web que se ejecutan en ella, las capturas de pantalla de antes y después de los cambios de un agente y una vista en vivo de cómo va la computadora (**Monitor**), para que puedas comprobar y terminar el trabajo de un agente sin salir de la app.

![La página de Git: los cambios de un repositorio junto al diff de un archivo, el cuadro del commit y Sincronizar](images/files-git.webp)

## Abrir Sistema

Haz clic en **Sistema** en la barra de iconos, o ve a [Sistema](/system). Una fila de pestañas bajo el título te lleva a cada parte, y cada una tiene su propia dirección:

- **Resumen** ([abrir](/system)): la computadora de un vistazo y lo que contienen ahora sus herramientas (consulta [El resumen](#the-overview)).
- **Terminal** ([abrir](/terminal)): shells de esta computadora (consulta [Usar la terminal](#use-the-terminal)).
- **Vista previa** ([abrir](/preview)): las apps web que se ejecutan aquí (consulta [Ver un servidor de desarrollo con Vista previa](#look-at-a-dev-server-with-preview)). Solo aparece en las páginas de esta misma máquina, no mientras miras otra máquina.
- **Monitor** ([abrir](/system/monitor)): lo ocupada que está la computadora (consulta [Vigilar esta computadora en Monitor](#watch-this-computer-in-monitor)).

En un teléfono el título indica la parte en la que estás (**Sistema / Monitor**): tócalo para ver todas las partes de Sistema, cuatro por fila, y toca una para ir a ella. Los botones propios de una pestaña (como el de actualizar en Vista previa) están a la derecha del título.

**Archivos** y **Git** no están dentro de Sistema: cada uno tiene su propio icono en la barra de iconos (en un teléfono, entre las herramientas del panel de la barra lateral). Haz clic en él, o ve a [Archivos](/files) (consulta [Abrir la página de Archivos](#open-the-files-page)) o a [Git](/git) (consulta [Ver tus repositorios en la página de Git](#see-your-repositories-on-the-git-page)). Experimentos también tiene su propio icono (consulta [Experimentos](/guide/experiments)).

## El resumen

**Resumen** muestra, arriba, el nombre de la computadora, su sistema y cuánto tiempo lleva encendida, con cuatro medidores: **Procesador**, **Memoria**, **Disco** (el disco principal, con su espacio libre) y **Gráficos** (cuando tiene tarjetas gráficas NVIDIA). Un medidor se pone rojo cuando se acerca a lleno. Haz clic en ellos para abrir **Monitor**.

Debajo hay una tarjeta por cada herramienta; su título, o **Abrir**, abre su pestaña:

- **Terminal**: las shells en ejecución, y **Nueva** para abrir otra.
- **Vista previa**: las apps web que se ejecutan aquí, cada una con su puerto. Haz clic en una para verla.

## Abrir la página de Archivos

Haz clic en **Archivos** en la barra de iconos, o ve a [Archivos](/files). En una computadora la página tiene dos partes:

- A la izquierda, los **lugares**: los archivos que abriste hace poco, tu carpeta personal, las carpetas que fijaste, las carpetas de tus proyectos, las carpetas en las que han trabajado las sesiones y la papelera (consulta [Lugares](/guide/files-git#places)).
- A la derecha, la carpeta en la que estás, con lo que contiene (consulta [Explorar una carpeta](/guide/files-git#browse-a-folder)). Los archivos que abres también se muestran ahí, cada uno en una pestaña: la primera pestaña vuelve a la carpeta.

En una ventana pequeña, los lugares se pliegan en un botón a la derecha del título: indica la carpeta en la que estás y, al hacer clic en él, muestra la lista de lugares.

En un teléfono la carpeta ocupa toda la pantalla. Su nombre, arriba a la derecha, abre los lugares desde la parte inferior de la pantalla; **‹** con el nombre de **La carpeta superior**, bajo el título, sube una carpeta, y el botón Atrás del teléfono vuelve a la carpeta en la que estabas antes. Un archivo se abre en una página propia, con **Atrás**.

Otras formas de llegar:

- Haz clic en la carpeta que aparece bajo el título de una sesión, o usa el menú de la sesión (⋯) → **Carpeta y código** → **Explorar la carpeta**: Archivos se abre en esa carpeta.
- Un archivo que un agente cambió o te entregó, o un enlace a un archivo en su respuesta, se abre en una ventana sobre la conversación, para que no pierdas tu sitio. **Abrir en Archivos** lo lleva a la página de Archivos; **Pantalla completa** (el icono de las flechas) hace que la ventana llene toda la app, y **Salir de pantalla completa** la devuelve a su tamaño (el siguiente archivo se abre como dejaste el último, en este navegador); ✕ o Esc la cierra (si lo cambiaste sin guardar, antes pregunta “¿Descartar tus cambios?”). La ruta del archivo aparece encima, como en la página de Archivos; una carpeta de esa ruta se abre en la misma ventana, con el archivo seleccionado allí (antes pregunta por los cambios sin guardar), y **‹** en la parte superior de la ventana vuelve al archivo. Consulta [Documentos que creó o cambió](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply).
- La pestaña **Archivos** de un proyecto muestra las carpetas propias del proyecto (consulta [Proyectos y conocimiento](/guide/projects)).

## Lugares

- **Ir a una carpeta**: busca una carpeta por su nombre, o escribe su ruta (`~/code/shop`); los proyectos y las carpetas fijadas aparecen primero. Tab, o la flecha al final de una fila, muestra las carpetas que hay dentro de una.
- **Archivos recientes**: los archivos que abriste hace poco en este navegador, el último primero, cada uno con su carpeta. Los que ya no existen lo indican; **Limpiar los que ya no están** los quita de la lista.
- **Carpeta personal**: tu propia carpeta, donde están tus archivos. La carpeta en la que empiezan las nuevas sesiones aparece debajo cuando no es tu carpeta personal.
- **Fijadas**: las carpetas que fijaste, las mismas en todos los dispositivos. Para fijar una, usa su menú o el ⋯ de la carpeta → **Fijar en Lugares**; para dejar de fijarla, apunta a ella y haz clic en ✕, o usa **Dejar de fijar en Lugares**.
- **Proyectos**: la carpeta propia de cada proyecto.
- **Sesiones con trabajo en**: las carpetas en las que han trabajado las sesiones hace poco.
- **Papelera**: lo que eliminaste (consulta [Eliminar y recuperar](/guide/files-git#delete-and-put-back)).

En una computadora, suelta archivos o filas sobre una carpeta de los lugares para ponerlos allí.

## Explorar una carpeta

La barra sobre la carpeta contiene, desde la izquierda:

- **La carpeta superior** (la flecha hacia arriba).
- La ruta de la carpeta, por pasos: una casa para tu carpeta personal, luego **code › shop**; una carpeta fuera de tu carpeta personal parte de **Computadora** (`/`). Haz clic en un paso para ir allí, o suelta filas sobre él para moverlas allí. Una ruta larga pliega su parte central en **…**, que muestra las carpetas intermedias. El último paso, o la flecha pequeña junto a él, abre **Ir a una carpeta**.
- **Buscar en** *la carpeta*: reduce la lista a los nombres que contienen lo que escribes, mientras escribes. Intro, o la línea **Buscar todo en … “…”, también dentro de los archivos** al principio de la lista, busca en todas las carpetas que hay debajo de esta, nombres de archivos y lo que hay dentro de ellos (consulta [Buscar archivos](/guide/files-git#search-files)).
- **Subir**: sube archivos a la carpeta en la que estás (consulta [Subir archivos y carpetas](#upload-files-and-folders)). Su flecha (**Más formas de subir**) tiene **Subir archivos** y **Subir una carpeta**.
- **Nueva**: **Nueva carpeta**, **Nuevo archivo**, **Nuevo cuaderno**, **Subir archivos** y **Subir una carpeta**. En la pestaña **Archivos** de un proyecto también crea lo que crea la app, dentro del proyecto (consulta [Archivos](/guide/projects#files)).
- **Como lista** o **Como mosaicos, con imágenes**: el cambio entre las dos formas de mostrar una carpeta. Las carpetas se muestran al principio como mosaicos, hasta que eliges tú la lista; el navegador recuerda tu elección.
- **Más** (⋯): **Ordenar por** (**Nombre**, **Fecha de modificación**, **Tamaño** o **Tipo**, y **Al revés**), **Mostrar archivos ocultos**, **Fijar en Lugares**, **Nueva sesión en esta carpeta**, **Abrir una terminal aquí**, **Copiar ruta**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio; consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)), **Descargar como .zip** y **Actualizar**.

Los **mosaicos** son la forma en que se muestran las carpetas al principio. Cada mosaico tiene arriba una imagen del archivo (4:3), una pequeña insignia con su tipo para documentos y similares (PDF, Word, Sheet, CSV, Slides, Notebook, LaTeX, HTML, Markdown, JSON, E-book, Archive, SVG, GIF, Video, Audio), su nombre y cuándo cambió (“Changed 2 h ago”), y un ⋯ que aparece al apuntar a él. Una carpeta es un mosaico de carpeta. La imagen es:

- para imágenes, la imagen misma; para vídeos, un fotograma;
- para PDF, la primera página; para archivos de Word, PowerPoint, Excel y OpenDocument, su primera página, diapositiva o celdas (o la imagen que lleva el archivo);
- para archivos HTML y cuadernos de Jupyter, cómo se ven al abrirlos;
- para archivos de texto, Markdown, código, CSV y JSON, sus primeras líneas en un mosaico parecido a una hoja de papel;
- para cualquier otro, el icono de su tipo.

La app dibuja estas imágenes en esta computadora con lo que tiene: ffmpeg para vídeos e imágenes, poppler para PDF, su propio navegador para documentos y páginas, y Quick Look en un Mac. Un archivo que no puede dibujar (un tipo que no conoce, sin herramienta para él aquí, un archivo demasiado grande o uno que falló) muestra el icono de su tipo, o sus primeras líneas. Las imágenes se guardan 30 días en la carpeta de datos de la app, así que una carpeta a la que vuelves las muestra al instante; un archivo que cambió recibe una nueva.

**La lista** pone las carpetas primero. En ella, las imágenes muestran una pequeña miniatura en lugar de su icono. De cada elemento muestra su nombre, cuándo cambió (“just now”, “5 min ago”, la hora si es de hoy, “Yesterday” o la fecha) y su tamaño. Haz clic en el título de una columna para ordenar por ella, y otra vez para invertir el orden. En una ventana estrecha la barra guarda el campo detrás de un botón de búsqueda, y **Como lista** y **Como mosaicos, con imágenes** pasan a **Más**; las columnas de fecha y tamaño ceden su espacio a los nombres.

- Haz clic en una carpeta para entrar en ella, o en su flecha para abrirla en el mismo sitio, como en un árbol; la carpeta recuerda cuáles de sus carpetas estaban abiertas.
- Haz clic en un archivo para abrirlo.
- La línea de abajo cuenta las carpetas y los archivos y suma su tamaño.
- La lista se actualiza cada 5 segundos mientras la miras, así que los archivos que crean los agentes aparecen solos.

En un teléfono cada fila muestra el tamaño y la fecha bajo el nombre; el botón de búsqueda abre el campo, **Más** contiene también **Como lista**, **Como mosaicos, con imágenes** y **Elegir varios**, y el botón **+** de abajo a la derecha añade una carpeta, un archivo o sube archivos.

Cada carpeta tiene una dirección propia, así que el botón Atrás del navegador vuelve a la carpeta en la que estabas. La carpeta que se muestra es también la que otras partes de la app entienden como “la carpeta abierta en Archivos”. Se guarda en este navegador, por separado para cada máquina que uses (consulta [Otras máquinas](/guide/devices#use-other-machines-from-one-app)).

### Qué significan las letras junto a los archivos

Dentro de un repositorio git (una carpeta cuyo historial guarda git), los archivos con cambios desde el último commit llevan una letra y un color:

- **M**: modificado.
- **A**: nuevo, y ya añadido a git.
- **U**: nuevo, y todavía no está en git.
- **D**: eliminado.
- **R**: renombrado.
- **C**: un conflicto por resolver.
- **•** en una carpeta: algo dentro de ella cambió.

## Trabajar con archivos y carpetas

Cada fila tiene un menú. Apunta a la fila y haz clic en **Más** (⋯) al final de ella, o haz clic derecho; en un teléfono, toca su ⋯. Contiene:

- **Abrir**.
- **Editar la imagen** o **Editar el video** (una imagen o un video): se abre en el editor de imágenes o de video, donde **Guardar** sobrescribe el archivo (su versión anterior va a la Papelera) y **Guardar una copia** pone “nombre (edited)” junto a él (consulta [Editar imágenes y videos](/guide/library#edit-pictures-and-videos)).
- **Empezar una sesión con él** (un archivo; consulta [Empezar una sesión con archivos](/guide/files-git#start-a-session-with-files)), o **Nueva sesión en esta carpeta** (una carpeta: la página de inicio, con esa carpeta elegida).
- **Añadir a un proyecto** (consulta [Añadir archivos a un proyecto](/guide/files-git#add-files-to-a-project)).
- **Fijar en Lugares** o **Dejar de fijar en Lugares** (una carpeta).
- **Cambiar nombre** (F2), **Duplicar**, **Mover a** y **Copiar en**.
- **Abrir una terminal aquí** (una carpeta): una nueva shell en esa carpeta, en el panel inferior en una computadora o en la página Terminal en un teléfono.
- **Copiar ruta**: la ruta completa, para pegarla donde quieras.
- **Mostrar en Finder** (Mac), **Mostrar en el Explorador de archivos** (Windows) o **Mostrar en la carpeta** (Linux): en la app de escritorio, para un archivo o una carpeta de esta computadora, abre el administrador de archivos del propio sistema con el elemento seleccionado. Su nombre indica cuál tiene tu sistema. No está en la app web ni para los archivos de otra máquina.
- **Descargar**, o **Descargar como .zip** para una carpeta.
- **Eliminar** (la tecla Supr).

### Elegir varios

Para actuar sobre varios elementos a la vez, elígelos:

- En una computadora, haz clic en la casilla al inicio de una fila (aparece al apuntar a la fila), Ctrl+clic (⌘+clic en un Mac) para añadir uno, Mayús+clic para elegir todo desde el último elegido, o pulsa Ctrl+A para elegir todo.
- En un teléfono, mantén pulsada una fila y luego toca las demás; o **Más** → **Elegir varios**.

La barra indica entonces cuántos hay elegidos, con **Empezar una sesión**, **Añadir a un proyecto**, **Mover a**, **Eliminar** y **Más** (⋯) para el resto del menú: **Copiar en**, **Copiar rutas**, **Descargar como .zip** y así sucesivamente. ✕ (o Esc) deja de elegirlos todos.

### Usar el teclado

Con la lista en uso (haz clic en ella primero), en una computadora:

| Teclas | Qué hacen |
| --- | --- |
| ↑ ↓ | Pasar a la fila de arriba o de abajo (con Mayús se va eligiendo) |
| → ← | Abrir o cerrar una carpeta en su lugar; en mosaicos, el mosaico contiguo |
| Enter | Abrir |
| Espacio | Elegir o dejar de elegir |
| Retroceso | La carpeta superior |
| Supr | Eliminar |
| F2 | Cambiar nombre |
| Ctrl+A | Elegir todo |
| Esc | Deja de elegir todo y luego vacía el campo |

Al escribir una letra, empieza **Buscar en** con ella.

### Crear un archivo o una carpeta

1. Haz clic en **Nueva** → **Nueva carpeta**, **Nuevo archivo** o **Nuevo cuaderno** (en un teléfono, el botón **+**).
2. Escribe el nombre en el campo que aparece en la lista y pulsa Enter. Esc cancela.

Un archivo nuevo está vacío y se abre en el editor de inmediato. Un cuaderno nuevo se llama `Untitled.ipynb` (`Untitled 2.ipynb` si ese ya existe) hasta que escribas otro nombre; empieza con una celda de código vacía y se abre como cuaderno. Un archivo nuevo cuyo nombre termina en `.ipynb` también empieza como un cuaderno vacío. Si el nombre ya existe, la app lo indica y no crea nada.

### Cambiar el nombre o mover

- **Cambiar nombre** convierte el nombre en un campo. Enter conserva el nombre nuevo, Esc lo deja como estaba.
- **Mover a** muestra primero tus proyectos y carpetas fijadas, luego las carpetas usadas recientemente, con un campo para buscar cualquier carpeta por nombre o escribir su ruta. Elige una y el archivo o la carpeta se mueve allí. Un mensaje indica adónde fue, con **Deshacer**.
- En una computadora, arrastra filas sobre una carpeta (en la lista, un paso de la ruta o entre los lugares) para moverlas allí; los archivos elegidos juntos se mueven juntos. Mantén pulsada Alt (Option en un Mac) al soltar para copiar en lugar de mover.

Una carpeta no puede ir dentro de sí misma, y mover no reemplaza nada: si el destino ya tiene algo con ese nombre, el movimiento se detiene.

### Duplicar y copiar

- **Duplicar** crea una copia junto al original, con “copy” después del nombre (`report copy.pdf`, luego `report copy 2.pdf`).
- **Copiar en** copia en otra carpeta, elegida como en **Mover a**. Si el nombre ya existe allí, la copia se nombra de la misma manera. **Mostrar** en el mensaje abre esa carpeta.

### Eliminar y devolver

**Eliminar** mueve el archivo, o la carpeta con todo lo que contiene, a la papelera de inmediato, y un mensaje lo indica con **Deshacer**. No se pierde nada hasta que vacíes la papelera.

**Papelera**, entre los lugares, muestra lo que eliminaste, lo más reciente primero: cada elemento con el lugar donde estaba, cuándo se eliminó y su tamaño.

- **Devolver** lo regresa a donde estaba. Si otra cosa ocupó su lugar desde entonces, vuelve junto a ella con “copy” después de su nombre. Lo eliminado antes de que la app guardara su procedencia pide una carpeta en su lugar.
- Su **Más** (⋯) tiene **Ponerlo en otra carpeta** y **Eliminar para siempre**.
- **Vaciar la papelera** elimina todo lo que contiene para siempre, una vez que lo confirmes.

La papelera es una carpeta dentro de la carpeta de datos de la app (por ejemplo `~/.hydor/trash`); su página indica dónde está. Tu carpeta de inicio y la carpeta superior (`/`) no se pueden eliminar. Algo que esté en otro disco distinto al de la carpeta de datos de la app no puede ir a la papelera: la app pregunta primero “¿Eliminar … para siempre?”.

### Descargar

Un archivo se descarga tal cual. Una carpeta, o varios elementos elegidos juntos, se descargan como un solo archivo .zip, que se crea durante la descarga. Un .zip omite las carpetas `.git` y `node_modules`, y admite hasta 4 GB y 65.000 archivos.

## Añadir archivos a un proyecto

Un proyecto guarda sus archivos en su carpeta, y puede trabajar con otras carpetas tuyas donde estén (consulta [Proyectos y conocimiento](/guide/projects)). Para añadir a uno:

1. Abre el menú de un archivo o una carpeta (o elige varios) y haz clic en **Añadir a un proyecto**.
2. Elige el proyecto, o **Nuevo proyecto** para crear uno primero para ellos.

Un archivo se copia en la parte superior de la carpeta del proyecto, o en una carpeta que elijas dentro de ella. Una carpeta no se copia: se suma a las carpetas con las que trabaja el proyecto, donde está. Un mensaje indica lo que se añadió, con **Mostrar**, que abre la pestaña **Archivos** del proyecto. Lo que ya está en el proyecto se queda como está.

**Añadir a un proyecto** también está en el **Más** (⋯) de un archivo en el editor, en la ventana en la que se abre un archivo sobre una sesión, en las tarjetas de archivos que un agente te entregó y en las imágenes que creó un agente.

Las sesiones que empieces en el proyecto encuentran entonces los archivos allí: a cada una se le indica qué contiene la carpeta del proyecto y con qué otras carpetas trabaja.

**Elige una carpeta dentro del proyecto.** Un clic en un proyecto pone la cosa en la parte superior de su carpeta. Un proyecto cuya carpeta tiene carpetas muestra además un botón de carpeta al final de su fila (**Elegir una carpeta dentro**). Ese botón enumera las carpetas: haz clic en una para poner la cosa allí, o en su › (**Mostrar las carpetas que contiene**) para entrar. La primera fila, **Nivel principal de** *el proyecto* (**Esta carpeta** cuando ya estás dentro de una), elige la carpeta en la que estás, y la fila de arriba vuelve atrás. La misma elección está en **Conservar** (su menú **Guardarla en**), **Guardar una copia**, **Mover a un proyecto** y **Mover a otro proyecto**, el menú **Guardar** (▾) del Navegador y el proyecto de la ventana **Nueva**. Elegir una carpeta del proyecto en el que ya está algo mueve allí su archivo. El mensaje nombra entonces la carpeta ("Se agregó notes.pdf a drafts", "Movido a drafts").

## Lo que conservas también son archivos

Lo que tú o un agente conserváis en un proyecto (consulta [Guardar una página](/guide/library#keep-a-page)) tiene además un archivo propio en la carpeta del proyecto, con el nombre de su título. Así aparece en **Archivos**, en Finder o el Explorador de archivos y para los agentes que trabajan en esa carpeta. Hydor vuelve a escribir el archivo después de cada guardado, tuyo o de un agente.

- Un documento es un archivo de Word (.docx), una hoja de cálculo un archivo de Excel (.xlsx), un cuaderno un archivo .ipynb y un diagrama un archivo de draw.io (.drawio).
- Las diapositivas hechas para la web, el tipo habitual, son una página web (.html); las hechas compatibles con PowerPoint son un archivo de PowerPoint (.pptx).
- Una página, un diseño o una página web guardada es un archivo .html.
- Un documento LaTeX es un archivo .tex o, cuando tiene imágenes u otros archivos, una carpeta con su nombre.
- Una imagen, un video o un sonido es un archivo de su propio tipo.

Esto incluye lo que los agentes guardan en las sesiones de un proyecto. Los tableros no tienen archivo, porque sus tarjetas están vivas, y nada de lo que conservó una sesión marcada como **Confidencial** va a la carpeta. Lo que conservaste en un proyecto antes de que Hydor hiciera esto recibe su archivo poco después de que Hydor arranque. Un agente puede nombrar la carpeta de dentro del proyecto a la que va un archivo, y uno que trabaja en una de esas carpetas guarda allí. A los agentes se les indica que cambien lo conservado con las herramientas que lo guardan, en lugar de editar su archivo.

**Abrir uno.** En **Archivos** y en la pestaña **Archivos** de un proyecto, el archivo lleva una etiqueta que dice qué es (**Documento**, **Diapositivas**, **Imagen**…). Un clic lo abre en el editor de Hydor, o en la página propia de la imagen, el video o el sonido, con sus versiones, comentarios y formas de compartir. Su menú ⋯ es el de un archivo (consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)); lo que pertenece a la cosa en sí, como compartirla, exportarla o moverla a **Sin proyecto**, está en la página que se abre. Un documento LaTeX que es una carpeta lleva la etiqueta **LaTeX**: un clic abre la carpeta, y su main.tex abre allí el documento en el editor de Hydor.

**Cambios hechos fuera de Hydor.** Cuando tú, otro programa (como Word) o el script de un agente cambiáis el archivo, el cambio vuelve como una versión nueva, que las versiones de la cosa muestran como **cambiado en su archivo**. Una imagen, un video o un sonido conserva la que era entre sus **Versiones anteriores**.

- Si mientras tanto también la cambiaste en Hydor, se conservan las dos como versiones, y la de Hydor sigue siendo la actual.
- Antes de que Hydor escriba encima de un archivo cambiado fuera, una copia suya va a la Papelera.
- Un archivo que Hydor no puede volver a leer (el .html de unas diapositivas hechas para la web, o un archivo dañado), o el archivo de una página bloqueada, se conserva al lado como "*nombre* (changed outside Hydor)", y se escribe un archivo nuevo.
- Un archivo borrado fuera de Hydor se vuelve a escribir en el siguiente cambio de la cosa. Cambiarle el nombre o moverlo fuera de Hydor cuenta como borrarlo: el archivo que moviste queda como un archivo normal.

**Cambiar nombre, mover y eliminar.** El vínculo sigue al archivo:

- Cambia el nombre del archivo o muévelo en los **Archivos** de Hydor y sigue vinculado. Cuando cambia el título de la cosa, Hydor cambia también el nombre del archivo, salvo que se lo hayas cambiado tú. Una terminación nueva (de .docx a .txt, por ejemplo) lo convierte en un archivo normal, y la cosa recibe otro en su siguiente cambio.
- Mueve el archivo a la carpeta de otro proyecto y la cosa pasa a ese proyecto. Sácalo de las carpetas de todos los proyectos y la cosa sale de su proyecto.
- Elimina el archivo en **Archivos** y la cosa sale de su proyecto. La cosa en sí se queda, y el cuadro de búsqueda la encuentra.
- Si eliminas la cosa en Hydor, o la mueves a **Sin proyecto**, su archivo va a la Papelera. Si la mueves a otro proyecto, su archivo pasa a la carpeta de ese proyecto.
- Si eliminas el proyecto, los archivos se quedan donde están, como archivos normales.

**Una imagen que ya tenías.** Cuando conservas una imagen, un video o un sonido a partir de un archivo que ya está en la carpeta del proyecto, ese archivo se usa como suyo, sin copia. Hydor nunca lo mueve ni lo manda a la Papelera. Lo que editas en Hydor se guarda en él, y sus versiones anteriores se conservan como las de cualquier imagen.

## Empezar una sesión con archivos

Para que una sesión nueva empiece con algunos archivos:

1. Abre el menú de un archivo (o elige varios) y haz clic en **Empezar una sesión con él** (o **Empezar una sesión**, en la barra de lo elegido).
2. Se abre la página de inicio con ellos en el cuadro de mensaje, cada uno marcado como “en esta computadora”. Quita uno con su ✕, añade archivos de tu dispositivo con el clip, y elige el agente y la carpeta como de costumbre.
3. Escribe qué hacer con ellos y pulsa **Inicio**.

No se sube nada: el mensaje nombra cada archivo por su ruta, así que el agente lo abre donde está, y las imágenes (PNG, JPEG, GIF y WebP de hasta 5 MB) también van al modelo para que las vea. Con un mensaje pueden ir hasta 20 archivos.

Para una carpeta, **Nueva sesión en esta carpeta** abre la página de inicio con la sesión configurada para trabajar en ella.

**Empezar una sesión con él** también está en el **Más** (⋯) de un archivo en el editor, en la ventana en la que se abre un archivo sobre una sesión, en las tarjetas de archivos que un agente te entregó y en las imágenes que creó un agente.

## Subir archivos y carpetas

- **Subir** en la barra sube archivos a la carpeta en la que estás; su flecha (**Más formas de subir**), y **Nueva**, tienen **Subir archivos** y **Subir una carpeta**. En un teléfono, el botón **+** → **Subir archivos** elige archivos o fotos del teléfono.
- En una computadora, arrastra archivos o carpetas completas desde tu escritorio a la carpeta, a una carpeta dentro de ella o a un lugar (“Suelta los archivos aquí para subirlos”). Las carpetas vacías también se incluyen.

Las subidas aparecen en el panel **Subidas** abajo a la derecha: cuánto se ha subido, archivo por archivo. **Cancelar** detiene una, y ✕ quita una terminada del panel. Los archivos grandes se suben en partes de 32 MB.

Antes de enviar nada, la app comprueba si hay archivos con los mismos nombres en esa carpeta. Si existen algunos, el panel los lista (“3 ya existen”) con tres opciones:

- **Reemplazar**: los sube sobre los existentes.
- **Omitir los existentes**: sube solo los nuevos.
- **Cancelar**: no sube nada.

## Abrir y editar un archivo

Haz clic en un archivo de la carpeta. Se abre en el editor, en una pestaña propia. La primera pestaña vuelve a la carpeta (o a la búsqueda, a los archivos recientes o a la papelera) desde la que lo abriste. Los últimos 12 archivos que abriste quedan como pestañas: haz clic en una para volver a ella y ciérrala con su ✕ o con un clic central. **Archivos recientes**, entre los lugares, muestra los que abriste hace poco.

Encima del archivo aparece su ruta: una casa para tu carpeta de inicio (o **Computadora**, para un archivo fuera de ella), luego las carpetas y después el nombre del archivo. Cada carpeta lleva a esa carpeta en la página Archivos, con el siguiente paso de la ruta seleccionado allí; "…" muestra las carpetas intermedias cuando la ruta es larga (**Las carpetas intermedias**); el nombre del archivo lo muestra en su carpeta, seleccionado (**Mostrar en su carpeta**). En un teléfono, la línea de la carpeta bajo el nombre del archivo abre **Ir a una carpeta**: todas las carpetas de la ruta y luego **Mostrar en su carpeta**. La misma ruta aparece encima de los archivos de los editores de [archivos Word, Excel, CSV y LaTeX](#edit-word-excel-csv-and-latex-files).

El editor numera las líneas, colorea el texto según el lenguaje del archivo, empareja los paréntesis y, en una computadora, pliega bloques y sugiere autocompletados mientras escribes. La tecla Tab sangra el texto.

Para guardar, haz clic en **Guardar** (se ilumina cuando cambias algo) o pulsa Ctrl+S (⌘S en un Mac). Un punto junto al nombre del archivo indica que hay cambios sin guardar. La app los conserva mientras está abierta: ve a la pestaña de otro archivo y vuelve, y el archivo estará como lo dejaste, con su historial de deshacer, el cursor y su posición. Un punto en la pestaña del archivo indica que tiene cambios sin guardar, y al cerrar una pestaña así (con su ✕ o con un clic central), o al salir del archivo con **Atrás** en un teléfono, se pregunta **¿Guardar los cambios?**: **Guardar**, **No guardar** o **Cancelar**. Si recargas o cierras la página, se pierde lo que no guardaste, y el navegador pregunta antes. Un archivo cuyas líneas terminan al estilo de Windows (CRLF) se guarda del mismo modo, sin convertirlo al otro.

### Las herramientas del editor

En una computadora, la barra encima del archivo muestra su ruta y estos botones:

- **Vista previa** (archivos Markdown): el archivo tal como se lee, con títulos, tablas, sus propias imágenes (desde junto al archivo) y enlaces a otros archivos. Haz clic de nuevo para editar. Los archivos Markdown se abren primero en vista previa.
- **Mostrar como página** (archivos HTML): ejecuta la página en un marco aislado de la app, capaz de cargar los archivos que están junto a ella. Los archivos HTML se abren primero como página. El enlace de la página dura una hora; después, abre el archivo de nuevo.
- **Cambios desde el último commit**: las diferencias del archivo respecto a su último commit, con las líneas añadidas en verde y las eliminadas en rojo. Dice "Sin cambios" cuando el archivo coincide con su último commit o no está en un repositorio de git. Ir a **Vista previa** o a **Cambios** y volver deja el texto como estaba, con su historial de deshacer, el cursor y su posición.
- **Ajuste de línea**: ajusta las líneas largas en lugar de desplazarse hacia los lados. La elección se recuerda.
- **Preguntar**: pide a un agente que cambie el archivo, o que responda sobre él ([más abajo](#ask-an-agent-about-the-file)).
- **Terminal en esta carpeta**: una nueva shell en la carpeta del archivo.
- **Descargar**.
- **Más** (⋯): **Buscar**, **Reemplazar**, **Ir a la línea**, **Preguntar sobre la selección** y **Atajos de teclado**, luego **Empezar una sesión con él**, **Añadir a un proyecto**, **Mostrar en su carpeta**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio) y **Copiar ruta**.
- **Guardar**.

Para buscar texto en el archivo, pulsa Ctrl+F (⌘F en un Mac) mientras el cursor está en él: se abre una barra de búsqueda en la parte superior, con reemplazo (Ctrl+H, o ⌘⌥F en un Mac). Ctrl+G (⌘⌥G en un Mac) va a una línea.

Haz clic derecho en el texto (o pulsa la tecla de menú o Shift+F10 para abrir el menú en el cursor) para ver **Cortar**, **Copiar**, **Pegar**, **Seleccionar todo**, **Buscar**, **Reemplazar**, **Ir a la línea** y **Preguntar sobre la selección**, que abre [Preguntar](#ask-an-agent-about-the-file) con las líneas que seleccionaste citadas en él. **Más** → **Atajos de teclado** muestra todas las teclas.

La franja bajo el texto muestra dónde está el cursor (**Ln 12, Col 5**, con cuántos caracteres están seleccionados; haz clic en ella para ir a una línea), el lenguaje del archivo, su sangría (**Espacios: 2**, **Espacios: 4**, **Pestañas**: se lee del archivo; haz clic para elegir otra para lo que escribas a continuación), **LF** o **CRLF** (cómo terminan las líneas del archivo; haz clic para guardarlo con la otra) y **Ajustar** o **Sin ajuste** (haz clic para cambiar).

En un teléfono, la barra muestra **Atrás**, el nombre del archivo sobre su carpeta, **Vista previa** o **Mostrar como página**, **Preguntar a un agente** (✨), **Guardar** (cuando cambias algo) y **Más** (⋯), que contiene **Buscar**, **Ir a la línea**, **Preguntar sobre la selección**, **Ajuste de línea**, **Cambios desde el último commit**, **Terminal en esta carpeta**, **Descargar**, **Empezar una sesión con él**, **Añadir a un proyecto**, **Mostrar en su carpeta**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio) y **Copiar ruta**. Los teléfonos ajustan las líneas largas a menos que desactives **Ajuste de línea**.

### Preguntar a un agente sobre el archivo

Haz clic en **Preguntar** en la barra del editor (✨ en un teléfono) y di qué debe cambiar (“Busca y corrige los errores”, “Añade un resumen al principio”), o haz una pregunta sobre el archivo. El panel se abre junto al archivo (encima de él en una pantalla estrecha), con ejemplos para empezar, y muestra el agente y el modelo que elegiste la última vez en la página de inicio.

- Los cambios sin guardar se guardan primero, para que el agente trabaje sobre ellos.
- El agente empieza en la carpeta del archivo, sabe a qué archivo te refieres y cambia ese archivo él mismo. Ves llegar cada cambio al editor en cuanto se escribe, con las líneas modificadas resaltadas un momento y sin perder tu posición en el archivo.
- La conversación continúa en el panel: escribe de nuevo para pedir más. **Una nueva petición** empieza de cero, y **Abrir como sesión** la abre completa; también aparece en tus sesiones. En un teléfono, **Ver el archivo** pliega el panel para ver el archivo, y la barra de abajo lo vuelve a mostrar.
- El panel permanece abierto mientras cambias entre las pestañas de los archivos, cada una con su propia conversación. Funciona igual en los editores de Word, Excel, CSV y LaTeX, y en los cuadernos, donde el agente cambia celdas y conserva las salidas de las demás. En un PDF, el agente lo lee y responde, y puedes preguntar sobre un pasaje, una ecuación o una figura que hayas seleccionado en él ([Preguntar sobre una parte de un PDF](#ask-about-a-part-of-a-pdf)). Como al [preguntar desde un editor](/guide/library#change-it-by-asking-an-agent), el modelo recordado del agente y sus permisos se quedan como estaban.

### Cuando el archivo cambia mientras lo tienes abierto

Los agentes y las terminales cambian archivos todo el tiempo. Cada pocos segundos (cada segundo mientras un agente trabaja) el editor revisa el archivo:

- Si no tienes nada sin guardar, incorpora la nueva versión por sí mismo, donde estás leyendo: solo cambian las líneas modificadas, resaltadas un momento.
- Si tienes cambios tuyos sin guardar, una barra dice “El archivo cambió en el disco desde que lo abriste.” Elige **Recargar (descartar lo mío)** para tomar la nueva versión, o **Sobrescribir con lo mío** para guardar la tuya encima.

Guardar nunca escribe sobre una versión más reciente sin esta pregunta.

### Archivos que el editor no edita

- Archivos de más de 10 MB: “El archivo es demasiado grande para editarlo aquí”. Descárgalo, o ábrelo en una terminal. (Los cuadernos pueden llegar a 40 MB.)
- Archivos binarios (cualquiera que no sea texto): “Archivo binario”. Descárgalo para abrirlo en tu dispositivo.
- Los archivos Word, Excel, CSV y LaTeX se abren en editores propios (la siguiente sección); las imágenes, los PDF, los videos, el audio y otros documentos de Office se muestran como vistas previas (la sección posterior).

## Edita archivos Word, Excel, CSV y LaTeX

Estos archivos se abren en los editores propios de la app (el [editor de documentos](/guide/library#documents) y los de su familia), y al guardar se escribe el mismo archivo de nuevo, en su propio formato:

- Los **documentos Word** (.docx) se abren en el editor de documentos, como en Word o Google Docs, sobre una hoja de su tamaño de papel.
- Los **archivos Excel** (.xlsx), **CSV** y **TSV** se abren en el editor de hojas de cálculo, con sus hojas y fórmulas que funcionan (y, en un archivo Excel, sus filtros, formato condicional, listas desplegables y casillas, celdas combinadas, notas y gráficos).
- Los **archivos LaTeX** (.tex) se abren en el editor de LaTeX, con el código fuente junto a sus páginas compuestas. Los archivos que lee el documento (capítulos que incorpora con `\input`, su bibliografía) se abren con él, y se compone junto con el resto de su carpeta (sus imágenes, estilos y datos), que TeX lee pero nunca cambia. Un capítulo abre el documento al que pertenece (el que nombra con `% !TEX root = …` o como el de un subarchivo; si no, el de su carpeta, o de una o dos carpetas más arriba, que lo lea), con el capítulo abierto y los archivos del documento en el [árbol de archivos](/guide/library#the-files-tree): los archivos que lee, en sus carpetas y, en gris, lo que TeX toma de la carpeta tal como está (sus imágenes, estilos y clases, datos), para consultarlos; cámbialos en Archivos. En una pantalla estrecha, **Archivos** sobre el código fuente abre el árbol. Los comentarios funcionan como en los [documentos LaTeX](/guide/library#latex-documents): un archivo guarda solo su texto, así que la app guarda sus comentarios aparte, según la ruta del archivo, y se guardan con **Guardar**; lo acompañan cuando renombras o mueves el archivo (o su carpeta) aquí, y un agente al que [le preguntas sobre el archivo](#ask-an-agent-about-the-file) los lee, responde y resuelve, y sus respuestas se ven a medida que llegan. **Resolver con IA**, en un comentario o en la parte superior de **Comentarios**, los envía de inmediato a ese agente ([Resolver comentarios con IA](/guide/library#resolve-comments-with-ai)). **Comparar versiones** es para los documentos LaTeX que conserva la app (creados con **Nueva** → **LaTeX**, o por un agente), no para un archivo .tex de una carpeta.

Cámbialo como en [el editor de documentos](/guide/library#documents), luego haz clic en **Guardar** en la barra de abajo, o pulsa Ctrl+S (⌘S en un Mac); **Descartar** vuelve al archivo como estaba. La barra de arriba tiene la ruta del archivo, **Preguntar** ([preguntar a un agente](#ask-an-agent-about-the-file)), **Descargar** y **Más** (⋯): **Editar como texto** (archivos CSV, TSV y LaTeX) o **Mostrar como vista previa** (archivos Word y Excel) muestra el archivo como antes, con un botón en la barra para volver al editor, y lo de la página Archivos: **Empezar una sesión con él**, **Añadir a un proyecto**, **Mostrar en su carpeta**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio) y **Copiar ruta**. Un archivo abierto en una línea, desde una búsqueda, se abre como texto.

Qué conserva el guardado del archivo:

- **CSV y TSV**: las filas y celdas que no cambiaste conservan su texto exactamente como estaba, y el archivo conserva su separador, sus comillas y sus finales de línea. Un archivo CSV contiene los valores de una sola hoja: si añadiste fórmulas, hojas o formato, el primer guardado pregunta antes, y las fórmulas se guardan como los valores que dan.
- **LaTeX**: solo se escriben los archivos que cambiaste, cada uno con sus propios finales de línea. Un archivo que añades en el editor va a la carpeta; uno que eliminas va a la [Papelera](#delete-and-put-back).
- Los archivos **Word y Excel** se escriben de nuevo a partir de lo que contiene el editor: los comentarios, los cambios con control de cambios, las ecuaciones, la tabla de contenido, el encabezado y el pie de página de un archivo Word se conservan, y en un archivo Excel, sus filtros, formato condicional, listas desplegables y casillas, celdas combinadas, notas, comentarios y gráficos. Cuando un archivo tiene algo que el editor no conserva (las notas al pie, los gráficos o un encabezado con una imagen o una tabla en un archivo Word; las imágenes, formas, tablas dinámicas, tablas con formato, hipervínculos, rangos con nombre, macros o filas agrupadas en un archivo Excel), una barra encima lo indica: “Al guardar se reemplaza el archivo sin lo que este editor no conserva”, y qué es. El primer guardado pregunta antes de reemplazar el archivo, y **Guardar como copia**, en esa barra, escribe tus cambios en un archivo nuevo junto al original (“informe (editado).docx”). La primera vez que guardas un archivo Word o Excel, el archivo tal como estaba va a la [Papelera](#delete-and-put-back), donde **Devolver** lo trae de vuelta junto al nuevo.
- Un archivo demasiado largo para el editor muestra su comienzo, solo para leer: **Editar como texto** o **Mostrar como vista previa** muestra todo.

Cuando un agente o una terminal cambia el archivo mientras está abierto, el editor toma la nueva versión si no cambiaste nada, o pregunta, como hace el editor de texto: **Recargar (descartar lo mío)** o **Sobrescribir con lo mío**.

Los archivos de PowerPoint, los archivos de Office más antiguos (.doc, .xls, .ppt), los archivos OpenDocument, RTF y EPUB se muestran como vista previa, como explica la siguiente sección.

## Ver imágenes, PDF, documentos y páginas web

El visor de archivos muestra los archivos tal como se ven:

- **Imágenes** (PNG, JPEG, GIF, WebP, SVG, ICO, BMP, AVIF): se muestran completas, sobre un fondo de cuadros donde son transparentes. **Editar** en la parte superior abre una en el editor de imágenes ([Editar imágenes y videos](/guide/library#edit-pictures-and-videos)).
- **PDF**: en el visor de PDF de tu navegador, con **Resaltar** en la parte superior para leerlos en el lector propio de la app, resaltarlos y guardar notas junto a ellos (consulta [Leer y resaltar un PDF](#read-and-highlight-a-pdf)), y **Rellenar y firmar** para rellenarlos y firmarlos (consulta [Rellenar y firmar un PDF](#fill-in-and-sign-a-pdf)). Un PDF que ya resaltaste se abre en el lector.
- **Video** (MP4, WebM, MOV y M4V; MKV y OGV donde tu navegador los reproduce): en el reproductor propio de la app (consulta [Ver un video](#watch-a-video) más abajo); **Editar** en la parte superior abre uno MP4, MOV, M4V o WebM en el editor de video. **Audio** (MP3, WAV, OGG) se reproduce en el mismo lugar.
- **Documentos de Office**: PowerPoint (.pptx, .ppt), archivos más antiguos de Word y Excel (.doc, .xls y similares), OpenDocument (.odt, .ods, .odp), RTF y EPUB; y archivos de Word (.docx) y Excel (.xlsx) desde **Más** (⋯) → **Mostrar como vista previa** en sus editores. Un interruptor en la parte superior elige la vista:
  - **Diapositivas** (archivos de PowerPoint: .pptx y sus variantes con macros, de presentación y de plantilla): cada diapositiva tal como se ve, dibujada como la dibuja el editor de diapositivas, con sus imágenes, formas, tablas, gráficos y fondo en su sitio, su número encima y sus notas del orador debajo. Si esta computadora no tiene una fuente que usa la presentación, el texto de los cuadros que necesitan más espacio del que tienen se hace un poco más pequeño, para que no se corte nada.
  - **Páginas**: el documento tal como lo maqueta LibreOffice, página por página (“Laying out the pages…” la primera vez). Esta vista solo está disponible cuando LibreOffice está instalado en esta computadora, y no para los libros EPUB.
  - **Texto**: su texto, hojas y diapositivas tal como los lee la app.

  Un archivo de PowerPoint se abre en **Diapositivas**, también en un teléfono. Los demás documentos se abren en **Páginas** cuando LibreOffice está instalado, pero los teléfonos empiezan en **Texto**, que se desplaza y se amplía mejor ahí. Si no se pueden dibujar las diapositivas de una presentación, se abre en **Texto** y explica por qué. Si no se puede leer un documento, dice “No preview for this file”: descárgalo en su lugar.
- **Markdown** y **HTML**: consulta **Vista previa** y **Mostrar como página** arriba.

**Descargar** siempre está en la barra.

### Ver un video

Un video se abre en el reproductor propio de la app, que llena el visor:

- **Reproducir y pausar**: el botón redondo del centro, el botón de abajo a la izquierda, un clic en la imagen o la barra espaciadora (K también funciona). Un doble clic en la imagen pasa a pantalla completa.
- **Moverte por el video**: arrastra por la barra de abajo, o haz clic en un punto de ella; si dejas el puntero sobre la barra, muestra el tiempo en ese punto, y su parte más clara es lo que ya se cargó. ← y → avanzan o retroceden 5 segundos, J y L 10 segundos, Inicio y Fin van al principio y al final, de 0 a 9 saltan a esa décima parte del video, y , y . avanzan o retroceden un fotograma mientras está en pausa.
- **Sonido**: el altavoz silencia y activa el sonido (M). En una computadora, deja el puntero sobre el altavoz para ver un control deslizante de volumen; ↑ y ↓ también cambian el volumen.
- **Velocidad**: el botón **1×** permite elegir de 0,5× a 2× (**Normal** es 1×).
- **Repetir** lo reproduce de nuevo desde el principio cada vez que termina, **Imagen en imagen** lo mantiene reproduciéndose en una ventana pequeña sobre todo lo demás (donde tu navegador lo permite), **Descargar** guarda el archivo y **Pantalla completa** (F) llena la pantalla; el mismo botón, o Esc, vuelve atrás.
- Los controles se desvanecen mientras se reproduce y vuelven cuando mueves el puntero. El reproductor recuerda tu volumen y velocidad para el siguiente video.
- **En un teléfono**: toca la imagen para mostrar u ocultar los controles, y toca dos veces su lado izquierdo o derecho para retroceder o avanzar 10 segundos. En un iPhone, la pantalla completa usa el reproductor de video del propio teléfono.
- Un video que tu navegador no puede reproducir (los archivos MKV y AVI suelen usar códecs que los navegadores no admiten) dice “This video can’t play here”, con **Descargar** para verlo en una app de video.

## Rellenar y firmar un PDF

Abre un PDF y pulsa **Rellenar y firmar** en la parte superior (en un teléfono, el lápiz junto a su nombre). Sus páginas se muestran como papel, con los campos de su formulario encima en azul claro:

- **Campos**: escribe en un cuadro de texto, marca una casilla, elige un botón de opción, la opción de un menú desplegable o las opciones de una lista. Un campo que el formulario bloquea (de solo lectura, o bloqueado por una firma digital que ya está en el archivo) no se puede cambiar.
- **Un clic en una página** coloca ahí lo que tiene la barra de herramientas: **Texto** (un cuadro para escribir, el habitual), **Marca de verificación**, **Cruz** o **Fecha** (la fecha de hoy, que puedes cambiar). Haz clic en un espacio en blanco tras otro: cada clic empieza el siguiente. Así se rellena un formulario que son solo líneas y cuadros impresos, o uno escaneado.
- **Firma** coloca en la página una de tus firmas guardadas con un solo toque, o una que dibujes, escribas o subas ahí (marca **Guardarla para después** para guardarla; consulta [Firmas](/guide/library#signatures)). El propio campo de firma de un formulario dice **Firma aquí**: tócalo y la firma entra en su cuadro.
- **Mover y cambiar el tamaño**: arrastra una marca, una cruz o una firma para moverla, y su esquina azul para cambiarle el tamaño. Un cuadro de texto se mueve con el asa de su izquierda, y **A−** y **A+** sobre él hacen sus palabras más pequeñas o más grandes. La papelera sobre cada uno, o Supr, lo quita.
- **Zoom**: pellizca en un teléfono o una tableta; en una computadora, Ctrl con la rueda del ratón, o Ctrl+= y Ctrl+−. **Ajustar al ancho** (o Ctrl+0) vuelve atrás.

**Guardar** escribe una copia junto al archivo, “nombre (filled).pdf”, y la abre. La flecha junto a él tiene **Guardar una copia al lado** y **Reemplazar el archivo**, cuya versión anterior va a la [Papelera](#delete-and-put-back). **Cerrar** sale sin guardar, preguntando antes si cambiaste algo.

Los campos guardan tus valores como campos propios del formulario, así que cualquier visor de PDF los muestra y aún se pueden cambiar allí, con fuentes que contienen tus palabras (también griego y chino). Lo que colocaste se dibuja sobre las páginas. Los bytes propios del archivo se quedan como estaban, con los cambios a continuación, de modo que:

- un PDF **firmado digitalmente** sigue siendo válido cuando solo rellenas sus campos. El texto, las marcas o una firma colocados en sus páginas aparecen en otros visores como un cambio hecho después de la firma;
- un PDF **protegido** por su propietario (se abre sin contraseña pero limita los cambios) se rellena solo hasta donde lo permite. Uno que necesita contraseña para abrirse no se puede rellenar aquí.

Lo que no puede hacer:

- **Formularios XFA** (hechos con Adobe LiveCycle Designer, a menudo por gobiernos): sus campos solo se rellenan en Adobe Acrobat o Reader. Aun así, puedes escribir y firmar en sus páginas.
- **Los formularios escaneados** no tienen campos ni palabras que encontrar: tu texto y tus marcas van donde haces clic.
- Una firma dibujada es una imagen de tu firma, no una firma digital que demuestre quién firmó.
- Nada de esto elimina palabras de un PDF de forma definitiva. Los cuadros blancos, que los agentes pueden poner sobre las palabras, las ocultan solo a la vista: las palabras siguen en el archivo.

Los agentes también rellenan, escriben y modifican PDF, con sus propias herramientas: consulta [Documentos, imágenes, videos y voz](/guide/documents-voice#pdfs).

## Leer y resaltar un PDF

Abre un PDF y pulsa **Resaltar** en la parte superior (en un teléfono, el marcador junto a su nombre). Sus páginas se muestran como papel, dibujadas por la app, con sus palabras encima para seleccionarlas como en cualquier lector. Un PDF que ya resaltaste se abre así por sí solo, para que tus notas estén ahí cuando vuelvas; **Cerrar** regresa al visor propio de tu navegador.

- **Resaltar palabras**: selecciónalas con el ratón, o en un teléfono mantén pulsada una palabra y arrastra los tiradores. Aparece una barra pequeña: uno de sus cuatro colores (amarillo, verde, azul o rosa) las resalta, **Nota** las resalta y abre una nota para escribir, **Preguntar** pregunta a un agente sobre ellas ([más abajo](#ask-about-a-part-of-a-pdf)) y **Copiar** las copia, con una palabra partida al final de una línea vuelta a unir. Una selección pasa de una columna de un artículo a la siguiente, tal como lo lees.
- **Resaltar una figura o una ecuación**: pulsa **Seleccionar un área** y arrastra un cuadro a su alrededor; en una computadora, mantén pulsada Alt y arrastra, sin el botón. Aparece la misma barra para esa parte de la página, que se guarda como una imagen de ella (**Copiar** copia la imagen, o sus palabras cuando el navegador no deja copiar imágenes desde una página).
- **Cambiar un resaltado**: haz clic en él para ver su barra, para elegir otro color, **Editar nota**, **Preguntar**, **Copiar** o eliminarlo (la papelera, o Supr; **Deshacer** en el mensaje que aparece después lo recupera). Si dejas el puntero sobre un resaltado, muestra su nota, y un puntito marca los que tienen una. Resaltar de nuevo las mismas palabras cambia su color.
- **Zoom**: pellizca en un teléfono o una tableta; en una computadora, Ctrl con la rueda del ratón, o Ctrl+= y Ctrl+−. **Ajustar al ancho** (o Ctrl+0) vuelve atrás. Los resaltados se mantienen sobre sus palabras con cualquier tamaño.

Una página que es solo una imagen (un escaneo) no tiene palabras que seleccionar: resalta sus partes con **Seleccionar un área**. Las palabras que van hacia arriba o hacia abajo en una página (una página girada de lado) tampoco se pueden seleccionar. Los resaltados que otras apps guardaron en un PDF se muestran en sus páginas, pero no en **Notas**.

### Tus notas

**Notas** enumera tus resaltados junto a las páginas (como una hoja desde abajo en un teléfono), página por página: las palabras de cada uno o la imagen de su área, su nota, que escribes o cambias ahí mismo, y su color. Haz clic en uno para ir a él en su página; la papelera lo elimina, y ✨ pregunta a un agente sobre él.

La app guarda tus resaltados y notas junto al archivo, según su ruta: el PDF en sí no cambia. Te acompañan cuando cambias el nombre o mueves el archivo (o su carpeta) aquí, y un archivo movido de otra manera (en una terminal, por un agente) encuentra sus notas de nuevo por su contenido cuando lo abres. Cuando el archivo en sí cambia (un artículo que volviste a maquetar), cada resaltado se vuelve a encontrar por sus palabras, también en otra página; uno cuyas palabras ya no están en él se queda donde estaba, marcado con “The file changed, and these words are not in it now”.

**Más** (⋯) en Notas tiene:

- **Guardar en un proyecto**: tus resaltados y notas pasan al [conocimiento](/guide/projects#memory) de un proyecto como un documento con el nombre del artículo (“Sparse Retrieval with Learned Term Weights (notes).md”, por ejemplo): el título del artículo, y luego las palabras de cada resaltado (una línea para un área) y tu nota, página por página, para que las sesiones del proyecto los encuentren cuando busquen en sus documentos. El proyecto cuya carpeta contiene el PDF va primero. El documento sigue todos los cambios que haces en las notas; **Open the project's knowledge** lo muestra ahí, y **Dejar de guardarlas ahí** lo quita.
- **Guardar en el PDF**: escribe los resaltados en el archivo como propios, cada nota como comentario de su resaltado, para que otras apps de PDF los muestren. **Guardar una copia al lado** escribe “nombre (highlighted).pdf”, que también conserva tus notas; **Reemplazar el archivo** escribe sobre él, y su versión anterior va a la [Papelera](#delete-and-put-back). Si guardas de nuevo, se incluyen tal como están en ese momento, en lugar de los guardados antes. Un archivo cuyo propietario prohíbe los comentarios, o uno certificado contra ellos, no puede admitirlos: se quedan junto a él.
- **Copiar todo**: las notas como texto, para pegarlas en otro sitio.

### Preguntar sobre una parte de un PDF

**Preguntar** en la barra abre [Preguntar a un agente](#ask-an-agent-about-the-file) junto al PDF (encima de él en una pantalla estrecha) con lo que elegiste: las palabras, o una imagen del área, y su página. Elige un ejemplo (“Explica este pasaje”, “¿Qué dice esta ecuación?”, “¿Cómo se compara esto con mi enfoque?”, “Resume esta sección”) o escribe tu propia pregunta; el agente también puede leer todo el PDF. Mientras hay una conversación sobre el archivo en curso, **Preguntar** pone la parte en su cuadro de mensaje, para que preguntes sobre ella a continuación. Los agentes también leen tus resaltados y notas de un PDF cuando se lo pides (“resume mis resaltados de este artículo”).

## Buscar un archivo por nombre

Pulsa Ctrl+P (⌘P en un Mac) en cualquier página. “Go to file in …” busca por nombre en la carpeta abierta en Archivos: escribe unas letras del nombre en orden (`invq3` encuentra `invoices/q3-report.xlsx`). Los archivos cuyo propio nombre contiene lo que escribiste van primero. Muévete con ↑ y ↓, abre con Enter o con un clic. Muestra hasta 60 archivos, incluidos los ocultos.

El cuadro de búsqueda (Ctrl+K, ⌘K en un Mac) también encuentra archivos por nombre, en la misma carpeta, en cuanto escribes dos letras.

## Buscar archivos

Una sola búsqueda encuentra archivos por su nombre y por el texto que contienen, en cualquier lugar dentro de una carpeta. Escribe en el campo **Buscar en** de una carpeta y pulsa Enter, o ve a [Buscar en archivos](/search).

1. Escribe lo que quieres buscar en "Search names and the text inside files". Los resultados aparecen mientras escribes.
2. Debajo del campo, **En** indica dónde se busca: al principio, la carpeta de la que vienes. Haz clic para buscar en otro lugar: la carpeta de un proyecto, una carpeta fijada, una en la que trabajaron sesiones, tu **Carpeta personal**, o cualquier carpeta que encuentres por su nombre o cuya ruta escribas.
3. Si quieres, acota la búsqueda:
   - **Todo tipo de archivos** elige el tipo: **Texto y notas**, **Código**, **Datos y configuración**, **Páginas web** o **Cuadernos**. También puedes escribir nombres como estos en el mismo menú, separados por comas (`*.md, *.py`); un `!` delante excluye esos (`!dist/**`).
   - **También archivos ocultos** busca en archivos y carpetas cuyos nombres empiezan con un punto.
   - En el campo, **Coincidir mayúsculas y minúsculas** hace coincidir las mayúsculas exactamente (sin esta opción, una búsqueda en minúsculas ignora la distinción, y una que lleva una mayúscula sí la respeta), y **Expresión regular** interpreta lo que escribes como un patrón (`colou?r`) en lugar de texto sin más.

Los resultados vienen en dos partes:

- **Archivos con ese nombre**: hasta 30 archivos cuyos nombres contienen lo que escribiste, cada uno con su carpeta.
- **Dentro de los archivos**: las líneas que coinciden, agrupadas por archivo, cada archivo con su número de coincidencias. Haz clic en una línea para abrir el archivo en esa línea, o en el nombre de un archivo para abrirlo.

El menú **Más** (⋯) de cada resultado tiene **Mostrar en su carpeta**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio), **Empezar una sesión con él**, **Añadir a un proyecto** y el resto del menú de un archivo.

La búsqueda queda en la dirección de la página, así que Atrás y una recarga la conservan. Omite los archivos que el `.gitignore` de la carpeta deja fuera y los archivos de más de 4 MB. Se detiene en 50 coincidencias por archivo y 1.000 en total, o pasados 15 segundos, y muestra las primeras 30 líneas coincidentes de cada archivo. Los PDF, Word y otros documentos se encuentran por su nombre, no por el texto que contienen; para que los agentes busquen dentro de ellos, agrégalos al [conocimiento](/guide/projects#shared-knowledge-documents-every-session-can-search).

## Ejecutar un cuaderno de Jupyter

Un cuaderno (`.ipynb`) se abre como cuaderno: sus celdas, cada una con su salida. La barra superior contiene el botón del kernel, **Ejecutar todas las celdas**, **Interrumpir (I, I)**, **Reiniciar el kernel (0, 0)**, **Borrar todas las salidas**, **Ver el archivo del cuaderno (JSON)**, **Descargar**, **Preguntar** (consulta [Preguntar a un agente sobre el archivo](#ask-an-agent-about-the-file)) y **Guardar**. En un teléfono, las menos usadas están en **Más**: **Reiniciar el kernel**, **Reiniciar y ejecutar todo**, **Borrar todas las salidas**, **Ver el archivo (JSON)** y **Descargar**.

Crea uno con **Nueva** → **Nuevo cuaderno** en una carpeta (consulta [Crear un archivo o una carpeta](/guide/files-git#make-a-file-or-folder)), o pídele uno a un agente: escribe el cuaderno, lo ejecuta desde el principio para que estén sus salidas, prepara un entorno donde ejecutarlo si ninguno sirve, y te lo entrega como una tarjeta que lo abre aquí.

### Elegir dónde se ejecuta el código

El botón del kernel (un punto y un nombre, o "No kernel") abre **Ejecutar este cuaderno con**: los entornos de Python de esta computadora. Lista los entornos virtuales llamados `.venv`, `venv` o `env` en la carpeta del cuaderno o en las carpetas superiores, los entornos de conda, el Python del sistema y los kernels de Jupyter registrados aquí (también de otros lenguajes). Cada uno muestra su versión, y el que el cuaderno pide (o un entorno virtual junto a él) aparece marcado como **sugerido**.

- Un entorno marcado con "needs ipykernel" tiene un botón **Instalar**: ejecuta `pip install ipykernel` en ese entorno, después de que lo confirmes, y no cambia nada más en él.
- Al ejecutar una celda sin kernel, se inicia uno en el entorno sugerido. Si eso falla, se abre la lista para que elijas otro.
- Con un kernel en marcha, el menú del botón muestra su estado (Starting, Idle, Running, Restarting o Stopped), cuándo se inició, y **Interrumpir**, **Reiniciar** y **Apagar**. Elegir otro entorno pregunta antes, porque se pierden las variables del kernel en marcha.

Los kernels siguen funcionando después de cerrar el cuaderno y de reiniciar la app: ábrelo de nuevo y estarán las salidas de lo que se ejecutó mientras tanto. Apaga uno desde su menú, o desde la página [Sistema](/system), donde aparecen los kernels en ejecución.

### Escribir y ejecutar celdas

Una celda es de **Código**, **Texto** (Markdown) o **Sin formato**. Haz clic en una celda de código para editarla, o doble clic en una celda de texto. Mientras una celda se ejecuta muestra `[*]` y un temporizador; después, su número de ejecución, `[3]`.

- Apunta a una celda de código y un botón de ejecutar ocupa el lugar de su número ("Run (Shift+Enter)": ejecuta la celda y pasa a la siguiente; mientras la celda se ejecuta, interrumpe el kernel). Sus herramientas aparecen en la esquina: **Editar** (celdas de texto), el tipo de celda, **Subir**, **Bajar**, **Agregar una celda abajo**, **Eliminar la celda** y **Más para esta celda** (⋯, el menú de la celda, más abajo). En un teléfono, toca una celda: sus herramientas aparecen encima, **Ejecutar** incluido.
- En una computadora, al apuntar entre dos celdas aparecen **+ Code** y **+ Text**. Los mismos dos botones están debajo de la última celda.
- **El menú de la celda**: haz clic derecho en una celda (o en su ⋯ de la esquina, que es como se abre en un teléfono). Tiene **Ejecutar esta celda**, **Ejecutar todas las de arriba**, **Ejecutar esta y las de abajo** y **Ejecutar todas las de abajo** (solo las celdas de código se ejecutan), **Cortar**, **Copiar**, **Pegar abajo**, **Pegar arriba**, **Duplicar**, **Dividir en el cursor** (mientras editas la celda, con el cursor donde debe dividirse), **Combinar con la celda siguiente**, **Agregar una celda arriba** y **debajo**, **Subir** y **abajo**, **Tipo de celda**, **Borrar la salida**, **Plegar la salida** o **Mostrar la salida**, y **Eliminar la celda**, cada una con su tecla. Las celdas cortadas, copiadas y duplicadas conservan sus salidas; un pegado puede hacerse en otro cuaderno mientras la app está abierta. Dividir o combinar borra las salidas de las celdas que crea.
- **Varias celdas a la vez**: Shift+↑ / Shift+↓ (o Shift+clic) selecciona las celdas entre donde empezaste y donde estás, mostradas con un tinte; el menú, **Copiar**, **Cortar**, **Duplicar**, **Fusionar** y luego D, D actúan sobre todas ellas. Esc las suelta.
- **Plegar una salida**: las flechas pequeñas junto al número de una celda (o **Plegar la salida** en su menú) ocultan su salida tras "Output hidden"; haz clic ahí para mostrarla de nuevo. Se guarda en el archivo del cuaderno (como hace Jupyter), así que sigue plegada cuando lo abres otra vez.
- Cuando el código pide una entrada (el `input()` de Python), aparece un campo bajo la celda: "Type, then Enter". Las contraseñas permanecen ocultas.
- Mientras editas código, Tab después de un nombre pide sugerencias de autocompletado al kernel en marcha.

Las salidas muestran texto, errores en color, imágenes y gráficos, tablas, HTML (en un marco aislado), Markdown y fórmulas. "Interactive widgets do not run here", y tampoco se ejecuta la salida en JavaScript. Las barras de progreso se muestran como quedaron por última vez, y el texto que una celda imprime poco a poco se muestra como un solo bloque, como en Jupyter.

### Teclas

Mientras editas una celda:

- Shift+Enter: la ejecuta y pasa a la siguiente celda (una nueva después de la última).
- Ctrl+Enter (⌘Enter en un Mac): la ejecuta y te quedas en ella.
- Alt+Enter: la ejecuta y agrega una celda debajo.
- Ctrl+Shift+Enter: la ejecuta junto con las celdas de debajo.
- Ctrl+Shift+- (⌘⇧-): divide la celda en el cursor.
- Esc: deja de editar.

Cuando no se está editando ninguna celda:

- Enter: edita la celda seleccionada. ↑ / ↓ (o K / J): te mueves entre celdas. Shift+↑ / ↓: seleccionas varias.
- A / B: agrega una celda arriba / abajo. D, D: elimina la celda (o las celdas seleccionadas). Z: recupera las últimas celdas eliminadas; púlsala otra vez para las anteriores.
- C / X: copia / corta la celda (o las celdas seleccionadas). V / Shift+V: pega abajo / arriba. Shift+M: combina la celda con la siguiente (o las celdas seleccionadas juntas). Ctrl+Shift+Enter: ejecuta esta celda y las de debajo.
- M, Y, R: convierte la celda en Texto, Código o Sin formato.
- I, I: interrumpe el kernel. 0, 0: lo reinicia.

**Más** (⋯) en la barra sobre el cuaderno tiene **Ejecutar todas las celdas**, **Ejecutar todas las de arriba**, **Ejecutar esta y las de abajo** y **Ejecutar todas las de abajo** (estas tres últimas para la celda seleccionada), **Reiniciar el kernel**, **Reiniciar y ejecutar todo**, **Borrar todas las salidas**, **Contorno** y **Atajos de teclado**. **Contorno** muestra los encabezados de las celdas de texto (las líneas que empiezan con #) en una lista junto a las celdas (una hoja en un teléfono): haz clic en uno para ir a su celda. **Atajos de teclado** enumera todas las teclas. Una celda que se ejecuta mientras el kernel aún se está iniciando lo espera, y se ejecuta cuando está listo.

Ctrl+S (⌘S en un Mac) guarda. Como con otros archivos, si el cuaderno cambia en el disco mientras tienes cambios sin guardar, una barra ofrece **Recargar (descartar lo mío)** o **Sobrescribir con lo mío**. **Ver el archivo del cuaderno (JSON)** muestra el archivo como texto en el editor; **Abrir como cuaderno** vuelve atrás.

## Ver tus repositorios en la página de Git

Haz clic en **Git** en la barra de iconos, o ve a [Git](/git). A la izquierda se enumeran tus repositorios de git, empezando por los usados más recientemente: aquellos en los que trabajaron tus sesiones (la carpeta de una sesión, o un archivo que una sesión editó; los lugares desechables como `/tmp` se omiten) y los que agregaste tú. Cuando hay más de seis, un campo en la parte superior encuentra uno por su nombre.

La primera vez que abres la página de Git, un recorrido corto pensado para quien empieza con Git te la enseña. Aparece mientras los consejos están activados, después del recorrido de bienvenida. Una tarjeta explica en palabras sencillas qué es Git (puntos de guardado de una carpeta: commits, en un repositorio) y luego cada parte de la página se ilumina por turno con su propia tarjeta: tus repositorios, **Cambios**, **Commit**, guardar una copia en línea (**Push** y **Pull**), **Historial**, **Ramas** y que puedes simplemente pedírselo a un agente. Avanza y retrocede con **Siguiente** y **Atrás**; **Hecho** lo termina, y **Omitir** o Esc lo cierra antes. **Muéstrame cómo funciona** (el botón de la brújula arriba a la derecha de la página) lo vuelve a empezar cuando quieras.

Cada repositorio muestra su nombre y su rama, y pequeñas marcas cuando hay algo que hacer:

- **● 3**: tres archivos cambiados y aún sin commit.
- **↑ 2**: dos commits para enviar con push. **↓ 1**: un commit para traer con pull.
- **Haciendo merge** o **Haciendo rebase**: un merge se detuvo por archivos en conflicto (consulta [Cuando un merge se detiene por conflictos](/guide/files-git#when-a-merge-stops-on-conflicts)).
- A la derecha, hace cuánto se hizo el último commit.

En la parte superior de la página, **Traer los datos del remoto de cada repositorio** (la nube) pregunta a cada remoto qué hay de nuevo, y **Actualizar** vuelve a leer la lista.

Haz clic en un repositorio para abrirlo junto a la lista. En su parte superior: su nombre y su carpeta, la rama en la que estás, una línea sobre su situación respecto al remoto, **Sincronizar** y un menú ⋯. Debajo, cuatro pestañas: **Cambios**, **Historial**, **Ramas** y **Stashes**. En una computadora, al entrar en la página se abre el último repositorio que usaste. En una ventana pequeña la lista se pliega en el título de la página (haz clic en el nombre del repositorio para elegir otro); en un teléfono la lista es una página aparte, y un repositorio se abre encima con una flecha para volver.

### Añadir un repositorio

**Añadir** en la parte superior de la página tiene dos opciones:

- **Agregar una carpeta de esta computadora**: escribe o elige la carpeta de un proyecto y haz clic en **Añadir**. Una carpeta dentro de un repositorio añade ese repositorio. Una carpeta que git aún no gestiona puede iniciar su propio repositorio: **Iniciar un repositorio aquí** (el `git init` de git).
- **Clonar desde un enlace**: pega la dirección de un repositorio en GitHub, GitLab u otro servidor git (`https://…`, `ssh://…` o `git@host:owner/project`). **Dónde se guarda** sugiere una carpeta propia (en `~/code` si tienes una); no debe existir todavía, o debe estar vacía. **Clonar** muestra cuánto lleva; puedes cerrar el diálogo y sigue. El repositorio se abre cuando termina.

Lo que añades permanece en la lista hasta que lo quites: ⋯ → **Quitar de la lista**. Su carpeta se queda como está.

## Sincronizar con el remoto

El remoto es donde se comparte el repositorio, como GitHub. La línea bajo la rama indica cómo está la tuya: "2 to push · 1 to pull · fetched 5m ago", **Al día**, **Aún no está en el remoto** o **Sin remoto**.

**Sincronizar** hace lo necesario con un clic: pregunta al remoto qué hay de nuevo, trae esos commits y luego envía los tuyos. Sus flechas muestran cuántos van en cada sentido (**Sincronizar ↑2 ↓1**). Una rama que el remoto aún no tiene muestra **Publicar rama** en su lugar: la pone allí y mantiene las dos al mismo ritmo a partir de entonces.

Cuando tu rama y la del remoto han avanzado ambas, Sincronizar no cambia nada todavía y pregunta cómo juntarlas:

- **Poner mis commits encima**: tus commits van después de los del remoto, como si los hubieras hecho más tarde, de modo que el historial queda en una línea recta (git lo llama rebase).
- **Fusionar**: un commit de merge une las dos líneas; cada commit queda como estaba.

Después Sincronizar envía los tuyos. Si ambos lados cambiaron las mismas líneas, se detiene para que las resuelvas (consulta [Cuando un merge se detiene por conflictos](/guide/files-git#when-a-merge-stops-on-conflicts)). Si tus cambios sin commit tocan archivos que cambiaron en el remoto, lo avisa: haz commit de ellos o ponlos aparte en un stash primero.

El menú ⋯ tiene los pasos uno a uno, y el resto:

- **Fetch** pregunta al remoto qué hay de nuevo sin cambiar nada aquí. **Pull** lo trae (cuando ambos lados avanzaron, hace la misma pregunta). **Push** envía tus commits.
- **Abrir una terminal aquí**, **Mostrar en Archivos**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio) y **Copiar ruta**.
- **Remotos**: los remotos del repositorio y sus direcciones. Un repositorio sin ninguno dice **Sin remoto · Add one**: pega una dirección y haz clic en **Añadir remoto** (se llama origin), luego en **Publicar rama**.
- **Enviar etiquetas**, cuando el repositorio tiene etiquetas.

Cuando algo no sale bien, un cuadro rojo dice qué pasó, con palabras sencillas cuando puede, con **Lo que dijo git** para el mensaje propio de git. El git de la app nunca pide una contraseña: el push y el pull usan las claves SSH de esta computadora o las credenciales de git guardadas, y lo avisan cuando estas no funcionan sin preguntar.

## Confirmar cambios

**Cambios** muestra todos los archivos modificados desde el último commit, con las letras que usa la página Archivos (consulta [Qué significan las letras junto a los archivos](/guide/files-git#what-the-letters-beside-files-mean)), su nombre en negrita seguido de su carpeta, y las líneas añadidas y eliminadas. Haz clic en un archivo para ver sus cambios junto a la lista (en un teléfono, en una página aparte). Donde hay espacio, **Unificada** y **Lado a lado** muestran las líneas antiguas y nuevas una debajo de la otra o una junto a la otra.

No hay un paso de preparación (staging) aparte: cada archivo tiene una casilla que lo incluye en el próximo commit (todos al principio), y la casilla de la parte superior los marca o desmarca todos (“3 de 4 en el commit”).

- **Descartar esta parte**, en la parte superior de cada fragmento de los cambios de un archivo, devuelve solo esas líneas a como estaban en el último commit (después de una pregunta).
- El menú ⋯ de un archivo: **Abrir el archivo**, **Mostrar en Archivos**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio), **Descartar los cambios** (para un archivo nuevo, **Eliminar el archivo nuevo**; ambas preguntan antes y no se pueden deshacer), e **Ignorarlo** (un archivo nuevo) o **Dejar de rastrear e ignorar** (un archivo que git conserva: el siguiente commit lo saca del repositorio, y sigue en esta computadora). Ambas lo añaden a `.gitignore`.
- El icono de caja en la parte superior de la lista pone todos los cambios aparte en un stash (consulta [Poner cambios aparte con un stash](/guide/files-git#put-changes-aside-with-a-stash)).

Para hacer un commit, en la parte inferior de la lista:

1. Escribe un resumen del cambio y, si lo necesita, una descripción. O haz clic en **Escribir mensaje**: un modelo lee los cambios que marcaste y redacta ambos, con el estilo de los últimos commits del repositorio (Claude cuando Claude Code tiene la sesión iniciada, Codex en caso contrario).
2. Haz clic en **Commit**, o en **Commit y push** para enviarlo al remoto de inmediato (esto publica la rama si el remoto aún no la tiene). Ctrl+Enter también hace el commit.

Solo entran los archivos marcados, aunque otros se hayan preparado en otro lugar.

**Enmendar el último commit** aparece mientras ningún remoto tenga todavía el último commit: márcalo para modificar ese commit en lugar de crear uno nuevo. Su mensaje se rellena para que lo edites, los archivos que marques se suman a él, y los botones pasan a ser **Enmendar** y **Enmendar y hacer push**.

Cuando todo está confirmado, Cambios dice **Nada que confirmar** y muestra el último commit: haz clic en él para abrirlo en Historial.

## Cuando un merge se detiene por conflictos

Cuando ambos lados cambiaron las mismas líneas (una sincronización que trae commits, fusionar una rama, revertir un commit), git se detiene a medias, y el repositorio lo indica sobre sus pestañas: “Merging origin/main into main stopped: 1 file clashes”. Los archivos en conflicto aparecen ahí y están marcados con **C** en Cambios; haz clic en uno para verlo.

En cada uno de esos archivos, git ha puesto ambas versiones entre marcadores: `<<<<<<<` y la tuya, `=======`, luego la de ellos hasta `>>>>>>>`. Abre el archivo, conserva lo que deba quedarse y elimina los marcadores. Un archivo aparece como resuelto, con una marca de verificación, cuando ya no quedan marcadores. Después:

- **Pedir a un agente que los resuelva** abre la página de inicio con un prompt para este repositorio: un agente resuelve los archivos, comprueba que sigan funcionando y te dice lo que eligió. No empieza nada hasta que lo envíes.
- **Continuar**, una vez resueltos todos los archivos, termina lo que se había detenido (el commit del merge, o el resto de tus commits puestos encima).
- **Detener el merge** (o **Dejar de ponerlos encima**, **Detener la reversión**) lo devuelve todo a como estaba antes de empezar, después de una pregunta. Lo que cambiaste para resolver los archivos se pierde.

Hasta entonces, la sincronización y el cuadro de commit esperan: Continuar hace el commit.

## Explorar el historial

**Historial** muestra los commits, del más reciente al más antiguo, con un gráfico a la izquierda de cómo se separan y se unen las ramas: cada línea es una rama y cada punto un commit; un anillo es un commit que el remoto aún no tiene. Las etiquetas muestran las ramas (las tuyas con contorno), las ramas del remoto (con una nube) y las etiquetas de cada commit, luego su mensaje, quién lo hizo y cuándo.

- **Esta rama** muestra el historial que llevó a la rama en la que estás; **Todas las ramas** muestra el de todas, también las del remoto.
- **Buscar un commit** encuentra commits por palabras de su mensaje, el nombre o la dirección de su autor, o su hash.
- **Encontrar qué lo rompió**, el botón junto a él, hace que un agente encuentre el commit que rompió algo (consulta [Encontrar qué lo rompió](#find-what-broke-it)).
- **Cargar más**, al final, muestra commits más antiguos.

Haz clic en un commit para abrirlo junto a la lista (en un teléfono, en una página aparte): su mensaje completo, autor, fecha y hash (haz clic en el hash para copiarlo), las ramas y etiquetas que tiene, y los archivos que cambió, cada uno con su diff al abrirlo. Un merge indica qué commits unió.

- **Explicar** abre la página de inicio con un prompt que pide a un agente que explique el commit en palabras sencillas.
- **Deshacer este commit** aparece en el último commit mientras ningún remoto lo tenga: el commit desaparece y lo que cambió vuelve a Cambios, listo para confirmarse de nuevo.
- El menú ⋯ también tiene **Copiar hash**, **Encontrar qué lo rompió** (desde este commit, como el punto donde funcionaba por última vez), **Nueva rama desde aquí** (una rama que empieza en este commit; cambias a ella), **Etiquetar este commit** (un nombre como `v1.2.0` y, si quieres, un mensaje; **Enviar etiquetas** en el menú ⋯ del repositorio envía las etiquetas al remoto) y **Revertir este commit**: un nuevo commit que deshace lo que cambió este, después de una pregunta. El commit en sí permanece en el historial.

### Encontrar qué lo rompió

Cuando algo funcionaba en una versión anterior y ahora está roto, abre el commit donde funcionó por última vez y elige **Encontrar qué lo rompió** en su menú ⋯, o selecciona el botón **Encontrar qué lo rompió** junto a **Buscar un commit**. Su formulario pide:

- **Funcionaba en**: ese commit (por su etiqueta cuando la tiene), o si no la última etiqueta; sirve cualquier etiqueta, rama o commit, y el commit que representa aparece debajo.
- **Roto en**: `HEAD` para empezar.
- **Qué está roto**, en tus palabras, y **Cómo comprobarlo (opcional)**: un comando que falla mientras está roto.
- **Se ejecuta por**: el agente que lo hace.

**Inicio** abre una nueva sesión en un worktree del repositorio, de modo que tu propia copia queda como está. Su agente escribe una comprobación, la prueba en ambos extremos, ejecuta git bisect para encontrar el primer commit donde se rompió, y explica qué de ese commit lo rompió y por qué, con una corrección que sugerir. Consulta [Encontrar qué lo rompió](/guide/engineering#find-what-broke-it).

## Trabajar con ramas

Haz clic en el nombre de la rama bajo el del repositorio para cambiar: las ramas de aquí van primero, de la más reciente a la más antigua, con ↑↓ respecto a su rama en el remoto, y después las que están **Solo en el remoto**. Escribe para buscar una; un nombre que todavía no es una rama ofrece **Nueva rama “…” desde aquí**. Si hay cambios sin confirmar, la app pregunta antes: se vienen contigo, y si chocan con esa rama, git lo rechaza y no cambia nada. Una rama que solo está en el remoto se convierte en una rama local que la rastrea.

**Ramas** muestra primero la rama en la que estás, luego las demás, cada una con su último commit y marcas: **fusionada** (su trabajo ya está en tu rama), **solo aquí** (no está en el remoto), **ya no está en el remoto**, y ↑↓ respecto a su rama en el remoto. **Nueva rama** crea una desde donde estás y cambia a ella. Cada rama tiene **Cambiar** y un menú ⋯:

- **Merge into** *tu rama*: su trabajo se une al tuyo. Si ambas cambiaron las mismas líneas, el merge se detiene para que las resuelvas.
- **Comparar con** *tu rama*: los commits que tiene cada una y que le faltan a la otra. Haz clic en uno para abrirlo.
- **Publicar** pone en el remoto una rama que solo está aquí.
- **Cambiar nombre**: su rama en el remoto conserva el nombre.
- **Eliminar**: una rama fusionada desaparece al instante, pues no se pierde nada. Si no está fusionada, la pregunta enumera los commits que ninguna otra rama tiene, y **Eliminar de todos modos** la elimina con ellos.

Plegadas bajo **Solo en el remoto** están las ramas del remoto que no existen aquí: **Cambiar a** crea una aquí que la rastrea, y cambia a ella.

## Poner cambios aparte con un stash

Un stash pone aparte tus cambios sin confirmar, para que puedas trabajar en otra cosa y recuperarlos después. **Hacer stash de los cambios** (en la pestaña **Stashes**, o el icono de caja en la parte superior de Cambios) pregunta qué son los cambios y si quieres **Incluir también los archivos nuevos**; los archivos vuelven entonces a como estaban en el último commit.

**Stashes** los enumera con su mensaje, la rama en la que se hicieron, cuándo y cuántos archivos. Haz clic en uno para ver lo que contiene, archivo por archivo:

- **Aplicar y quitar** recupera los cambios y quita el stash de la lista.
- **Postularse** los recupera y conserva el stash.
- La papelera lo descarta, después de una pregunta. Esto no se puede deshacer.

Si los cambios chocan con lo que contienen ahora los archivos, los archivos en conflicto se marcan con **C** en Cambios: resuélvelos como después de un merge y haz commit.

## Abrir un pull request desde una sesión

Un pull request pide a las personas que cuidan un repositorio que incorporen los cambios de una rama. Puedes abrir uno en GitHub o Gitea directamente desde la sesión que hizo los cambios.

Lo que necesita:

- Una cuenta de GitHub o Gitea en [Configuración → App → Source control](/settings?s=scm) para el servidor donde está el repositorio (consulta [Añadir una cuenta de GitHub o Gitea](/guide/devices#add-a-github-or-gitea-account)).
- Que la carpeta de la sesión esté en un repositorio git con un remoto, en una rama propia. Una sesión que trabaja en la rama principal no puede abrir uno: empieza la sesión en un worktree (una copia separada del repositorio en una rama nueva), o cambia antes a una rama nueva.

Para abrir uno:

1. En el menú de la sesión (⋯), elige **Carpeta y código** → **Abrir un pull request**.
2. El cuadro de diálogo muestra la rama y adónde va (`my-branch → main on owner/repo`), cuántos commits y archivos contiene, y si la rama ya está enviada (“the branch is pushed when you open it” si no).
3. Si hay cambios sin confirmar, marca **Commit the … uncommitted changes first, with the title as the message** para incluirlos. Si no, se quedan fuera. (Viene marcada cuando la rama aún no tiene commits.)
4. Escribe un título y una descripción (Markdown), o haz clic en **Escríbelo por mí**: un modelo lee los commits, los cambios y la tarea que se le dio a la sesión, y escribe ambos. Necesita al menos un commit.
5. Marca **Borrador** para abrirlo como borrador. (Gitea marca un borrador con “WIP:” antes del título.)
6. Haz clic en **Abrir pull request**. La app hace push de la rama, abre el pull request, lo vincula a la sesión y lo abre en una pestaña nueva.

Si la rama ya tiene un pull request abierto, el cuadro de diálogo lo indica y ofrece **Vincularlo a esta sesión**. Para vincular cualquier otro, haz clic en **Vincular un pull request que ya existe…**, pega su dirección y haz clic en **Enlace**.

### Seguir un pull request

Una vez vinculado, el número del pull request aparece junto a la sesión en la barra lateral y en el encabezado de la sesión, con un icono de su estado (abierto, borrador, fusionado o cerrado) y un punto para sus comprobaciones (las pruebas que el servidor ejecuta sobre él: en curso, superadas o fallidas). La app lo revisa cada pocos minutos y te avisa cuando se fusiona o terminan sus comprobaciones.

Haz clic en el número del encabezado (o en **Pull request #12** en el menú de la sesión → **Carpeta y código**) para ver su cuadro de diálogo:

- **Open on GitHub** (o Gitea).
- **Revisar los cambios**: la página de revisión, más abajo.
- **Comprobar ahora**: consulta su estado y sus comprobaciones de inmediato.
- **Desvincular**: lo quita de la sesión (el pull request en sí permanece).

## Revisar qué cambia una rama

La página de revisión muestra todo lo que cambia la rama de una sesión desde que salió de su rama base, confirmado o no, incluidos los archivos nuevos. Ábrela desde el menú de la sesión (⋯) → **Carpeta y código** → **Revisar los cambios**, desde el cuadro de diálogo de un pull request, o desde el de un worktree (**Revisar sus cambios**).

En la parte superior: “Review:” y el título de la sesión, la rama y su base, cuántos archivos y cuántos están “not committed”, un enlace al pull request si lo hay, y **Sesión** para volver.

Cada archivo modificado muestra su letra de estado (A añadido, M modificado, D eliminado, R renombrado), su ruta, una etiqueta “not committed” cuando corresponde, las líneas añadidas y eliminadas, y sus cambios debajo.

- Marca **Visto** en un archivo que ya leíste: se pliega y cuenta para “… of … viewed”. La marca dura hasta que el archivo cambia de nuevo, y se guarda en este navegador.
- En una pantalla ancha, una lista de los archivos queda a la izquierda con una barra de progreso: haz clic en un archivo para ir a él.
- **Guíame**: un modelo lee los cambios y escribe un breve resumen, un orden fácil de seguir (primero la idea central, luego lo que la usa, y al final las pruebas y la documentación) y una nota en cada archivo sobre qué cambió y qué mirar con atención. Después, **Orden guiado** y **Por ruta** alternan entre ese orden y los archivos por nombre. La guía se guarda para exactamente estos cambios, así que estará ahí la próxima vez hasta que la rama cambie.
- **Volver a cargar** lee los cambios de nuevo.

Los archivos nuevos que git aún no rastrea se muestran cuando son archivos de texto pequeños. Los archivos binarios dicen “A binary file: no text changes to show.”

## Usar la terminal

Haz clic en **Sistema** y luego en **Terminal**, o ve a [Terminal](/terminal): shells reales en esta computadora. Si no hay ninguna abierta, se inicia una en tu carpeta de inicio.

- Cada terminal es una pestaña, con el nombre de su carpeta y del programa que se ejecuta en ella. **Nueva terminal** (+) abre otra, también en tu carpeta de inicio.
- Haz doble clic en una pestaña para cambiarle el nombre.
- ✕ cierra una terminal. Si todavía hay un programa ejecutándose en ella, la app te pregunta antes, porque al cerrarla se termina el shell y todo lo que ejecuta.
- Los enlaces que aparecen en la salida se abren en una pestaña nueva.

Las terminales se ejecutan en el servidor tmux privado de la propia app, así que siguen funcionando cuando sales de la página, la recargas o cierras el navegador, y también tras reiniciar la app: vuelve y las encontrarás como las dejaste.

Para abrir una en otra carpeta, empieza desde allí: en la página Archivos, el menú de una carpeta o **Más** (⋯) para la carpeta en la que estás (**Abrir una terminal aquí**), el editor (**Terminal en esta carpeta**), un repositorio en la página Git (**Abrir una terminal aquí**) y el menú de la sesión → **Carpeta y código** → **Abrir una terminal aquí**.

### El panel de la terminal

En una computadora, `` Ctrl+` `` (también en Mac) muestra u oculta un panel de terminal en la parte inferior de cualquier página, con las mismas terminales que la página Terminal. Arrastra su borde superior para hacerlo más alto o más bajo, y haz clic en **Ocultar panel** para cerrarlo. La opción **Mostrar u ocultar el panel de la terminal** del cuadro de búsqueda hace lo mismo. Las terminales abiertas desde otras páginas aparecen en este panel.

### Sugerencias en gris

Mientras un shell espera un comando, lo más probable que continúe lo que estás escribiendo aparece en gris después del cursor:

- → o Fin lo acepta todo; Ctrl+→ (o Alt+→) acepta la palabra siguiente.
- Las sugerencias provienen de comandos que escribiste antes (primero los ejecutados en la misma carpeta, y los recientes y frecuentes antes que los antiguos), del historial de tu propio shell y de comandos que los agentes ejecutaron hace poco.

Ctrl+Espacio (también en Mac), o **Sugerencias** en la barra de pestañas, abre una lista con más opciones:

- comandos anteriores que empiezan con lo que escribiste;
- lo que encaja con la palabra que estás escribiendo: comandos y ramas de git, los scripts del proyecto (`npm run …`), destinos de make, hosts SSH, carpetas y archivos;
- cuando has escrito unas pocas letras, **Escribir un comando para "…"**, más abajo.

↑ y ↓ eligen, Intro o un clic coloca el comando en la línea, y Esc cierra la lista. Nada se ejecuta nunca solo: siempre eres tú quien pulsa Intro en el shell.

Las sugerencias funcionan solo en el prompt de un shell, no dentro de un programa como un editor o Python. Los comandos que empiezan con un espacio, y los que parecen contener una contraseña o una clave, no se recuerdan. Desactiva el texto gris en [Configuración → App → General → Sugerencias de la terminal](/settings?s=general&find=Terminal%20suggestions); la lista de Ctrl+Espacio funciona en ambos casos.

### Pedir un comando con palabras

Escribe lo que quieres con palabras sencillas en el prompt, por ejemplo `encuentra los archivos más grandes aquí`, pulsa Ctrl+Espacio y elige **Escribir un comando para "encuentra los archivos más grandes aquí"**. Un modelo (Claude cuando Claude Code tiene la sesión iniciada, Codex en caso contrario) escribe hasta tres comandos adecuados para tu shell y tu carpeta, cada uno con una breve nota sobre lo que hace. Elige uno para colocarlo en la línea, léelo y pulsa Intro tú mismo para ejecutarlo.

### En un teléfono

La página Terminal añade una fila de teclas que los teléfonos no tienen: **Ctrl** y **Alt** (se aplican a la siguiente tecla que escribas), **Sugerencias**, ^C, ^D, ^Z, ^L, ^R, Esc, Tab, las flechas, `|`, `/`, `-`, `~`, Inicio y Fin. En un teléfono no hay panel inferior: las terminales abiertas desde otras páginas se abren en la página Terminal.

## Ver un servidor de desarrollo con Vista previa

Cuando tú o un agente ejecutan aquí el servidor de desarrollo de una app web (`npm run dev`, un servidor de Python), Vista previa lo muestra, en esta computadora o en cualquier otro dispositivo que llegue a la app. Haz clic en **Sistema** y luego en **Vista previa**, o ve a [Vista previa](/preview).

A la izquierda, **Apps web** enumera los servidores de esta computadora que responden con una página web: cada uno con el nombre de su proyecto (el de su paquete o, si no, el de su carpeta), su puerto, el título de la página, qué lo sirve cuando la app puede saberlo (Vite, Next.js, Python…) y su carpeta. **Otros servidores**, plegado, enumera el resto: API, bases de datos y similares. **Otro puerto** abre uno que no aparece en la lista. La lista se actualiza cada 5 segundos; el botón de actualizar la lee al instante.

Haz clic en una app web para mostrarla a la derecha. En una computadora, la primera se muestra de inmediato; en un teléfono ocupa toda la pantalla, con **Todos los servidores** para volver. Encima de ella:

- **Atrás**, **Adelante** y **Volver a cargar**, y la barra de direcciones con el puerto y la ruta de la página. Sigue los enlaces en los que haces clic dentro de la app; escribe otra ruta y pulsa Intro para ir a ella.
- **Computadora**, **Tablet** y **Teléfono**: la app con el ancho de esa pantalla (el de un teléfono es de 390 píxeles), reducida para que quepa.
- **Más** (⋯): **Abrir en una pestaña propia**, **Preguntar a un agente sobre esta pantalla** (la página de inicio se abre con una imagen de la pantalla adjunta, configurada para trabajar en la carpeta de la app, y “Sobre esta pantalla de …” para que lo completes), **Guardar una imagen**, y **Mostrar como imagen** o **Mostrar en vivo**.

### En vivo o como imágenes

Vista previa muestra un servidor de desarrollo en vivo a través del puerto de vista previa de la app (8791, salvo que tu instalación use otro), que mantiene el servidor de desarrollo separado de la app: tu inicio de sesión nunca llega a él, y la recarga en caliente funciona. Un navegador previsualiza un servidor a la vez: al mostrar otro, el puerto de vista previa pasa a ese.

Cuando tu navegador no puede llegar al puerto de vista previa (por ejemplo, si accedes a la app a través de un túnel o un proxy con un solo nombre de host), la página se abre en cambio en un navegador de esta computadora, con el tamaño que elegiste, y se transmite en vivo a Vista previa: haz clic, escribe, desplázate y pega en ella como en cualquier página, y la recarga en caliente también se ve ahí. En un teléfono, toca y arrastra; **Escribir** debajo de la página abre el teclado, junto con teclas que los teléfonos no tienen (Tab, Intro, Esc, las flechas). La página llega solo a ese servidor de desarrollo, no a los demás servidores de esta computadora. Si vuelves a Vista previa, la encuentras donde la dejaste; tras 15 minutos sin que nadie la mire se cierra, y se vuelve a abrir cuando regresas. **Guardar una imagen** y **Preguntar a un agente sobre esta pantalla** toman la página tal como está en pantalla.

Para tener la propia página en tu navegador en lugar de transmitida:

- en la misma red, o mediante una VPN como Tailscale o WireGuard, abre la app en la dirección propia de esta computadora: el puerto funciona directamente;
- detrás de un túnel o un proxy, dale al puerto de vista previa un nombre de host propio (preview.example.com → localhost:8791) e inicia la app con `PREVIEW_ORIGIN` configurado con él.

**Mostrar como imagen** en **Más** (⋯) muestra en su lugar imágenes fijas tomadas en esta computadora; **Volver a cargar** toma entonces una nueva. La transmisión y las imágenes necesitan un Chromium en esta computadora: el que usa el navegador ([Configuración → Capacidades → Navegador](/settings?s=browser) puede descargar uno). “Las vistas previas están desactivadas” significa que la app se inició con `PREVIEW_PORT=0`. Vista previa está disponible solo para la máquina en la que abriste la app, no para otras máquinas a las que cambies.

## Revisar los cambios de un agente en una app web

Cuando un agente cambia el aspecto o el funcionamiento de una app web (un sitio o una app con servidor de desarrollo, o archivos HTML), te muestra capturas de pantalla para revisar: antes de su primer cambio, una imagen de cada pantalla que va a cambiar, y cuando termina, las mismas pantallas otra vez. Primero inicia el servidor de desarrollo de la app si no se está ejecutando.

Un agente que tiene capturas de pantalla como archivos (las tomó con un script, en otro navegador, o se las dieron) las muestra de la misma manera, en una tarjeta en lugar de imágenes pegadas en su respuesta. Eso no necesita Chromium en esta computadora, y también funciona en una [sesión confidencial](/guide/sessions#keep-a-session-confidential).

- Las capturas de una misma respuesta se muestran juntas, en una tarjeta de imágenes pequeñas, una por cada pantalla. El agente puede agrupar las pantallas bajo títulos propios (“Añadir un servidor”, “Configuración”). Una tarjeta **Antes** muestra las pantallas como estaban; en una tarjeta **Antes y después**, el par de una pantalla se marca como **Antes → después**, con su antes y su después divididos por la mitad.
- Las demás versiones de una pantalla forman parte de su imagen, no son más imágenes: un icono de teléfono marca una pantalla que el agente capturó también con el tamaño de un teléfono, y un icono de sol y luna una que capturó también en el tema oscuro y en el claro (cuando solo algunas pantallas tienen ambos). Cuando una respuesta tiene más pantallas de las que caben en una fila, la tarjeta muestra la primera fila con **Mostrar todo** debajo (**Mostrar menos** las vuelve a plegar).
- Haz clic en una imagen para revisarla: en una pantalla ancha se abre junto a la conversación, como las páginas; en una ventana más estrecha o en un teléfono, sobre la app. Las flechas de su parte superior van a las demás pantallas de la respuesta. Si el agente escribió una nota sobre la pantalla, aparece arriba.
- Los botones de computadora y teléfono alternan entre los tamaños, y los de luna y sol entre el tema oscuro y el claro, cuando el agente tomó ambos. **Verlas en grande** abre las imágenes sobre la app.
- Cuando el agente dio una imagen de antes para una pantalla, su antes y su después se muestran uno sobre otro: arrastra el control deslizante (o pulsa ← y →) para pasar de uno a otro, o elige **Lado a lado**.
- **Todo bien** y **Cambiar algo** colocan en el cuadro de mensaje una línea sobre la pantalla, para que la completes y la envíes.
- En una pantalla ancha, el después de una pantalla se abre junto a la conversación por sí solo cuando llega.
- Una imagen de después sin una de antes se muestra sola, con “No hay imagen de antes para comparar”; al agente se le indica que la próxima vez tome primero la de antes.

También puedes pedir una captura de pantalla en cualquier momento: “muéstrame la página de configuración en un teléfono”, o “en el tema oscuro” (un sitio que sigue el modo claro u oscuro de tu computadora se muestra en el que indiques, y en el claro en caso contrario). Una página que un agente hizo para la conversación o guardó en un proyecto (una maqueta, un informe) se captura tal como la muestra la app, en el tema oscuro salvo que se pida el claro, para que el agente vea lo que no se leería bien antes que tú. Las imágenes que la app toma de una app web las toma en esta computadora un Chromium ([Configuración → Capacidades → Navegador](/settings?s=browser)); las que un agente muestra desde archivos se copian en la app. En ambos casos se guardan con su sesión, así que siguen ahí después de que el agente ordena sus propios archivos: desaparecen cuando se elimina la sesión, y las más antiguas se eliminan primero al pasar de 500 MB en total.

## Vigilar esta computadora en Monitor

Haz clic en **Sistema** y luego en **Monitor**, o ve a [Monitor](/system/monitor). Arriba: el nombre de la computadora, su procesador, cuántos hilos tiene, cuánto tiempo lleva encendida y su sistema operativo.

Los recuadros de arriba muestran, con un pequeño gráfico de los últimos dos minutos:

- **CPU**: qué tan ocupado está el procesador, y los promedios de carga.
- **Memoria**: cuánta se usa, de cuánta.
- **GPU × n** (cuando hay GPU de NVIDIA): uso promedio y memoria gráfica usada.
- **Red**: datos que entran y salen por segundo.
- **E/S de disco**: datos leídos y escritos por segundo.

Más abajo, con más detalle:

- **CPU**: un gráfico, la carga de cada núcleo y la temperatura cuando se conoce.
- **Memoria**: un gráfico, la RAM usada con caché y búferes, el swap y cuánta hay disponible.
- Una tarjeta por cada **GPU**: uso, memoria gráfica, consumo frente a su límite, temperatura, ventilador, estado de rendimiento y velocidad de reloj (en un teléfono, sin su gráfico).
- **Red**: descarga y subida, y cada conexión de red.
- **Almacenamiento**: lecturas y escrituras, y cada disco con su espacio libre, sistema de archivos y qué tan lleno está.
- **Sensores**: temperaturas, en rojo a partir de 85 °C.
- **Kernels de cuadernos** (mientras haya alguno en ejecución): cada uno con su entorno, estado, memoria, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio) para su cuaderno, y **Apagar**.
- **Sesiones** (mientras haya alguna en ejecución, en Linux y en Mac): los programas de cada sesión activa (los de su agente, los comandos que ejecuta, los servidores que inició), primero los que más memoria usan, con cuántos hay, su CPU y su memoria. A la derecha, los límites bajo los que se ejecutan las sesiones: haz clic en ellos para cambiarlos ([Limitar cada sesión](/guide/app#limit-each-session)). Haz clic en una sesión para abrirla.
- **Procesos**: los 12 programas más activos por **CPU** o **Memoria** (o **GPU**, para los que usan una), con ID de proceso, usuario, CPU y memoria. Apunta a una fila para ver su comando completo.

Toma una lectura cada 2 segundos mientras la página está abierta y conserva los últimos 10 minutos.

## Pregunta a un agente

- "En el archivo que tengo abierto, añade un comentario sobre cada función que diga qué hace."
- "Copia los PDF de ~/Downloads de esta semana en mi proyecto Impuestos 2026."
- "Mueve el seguimiento de lecturas de mi proyecto Tesis a su carpeta notes."
- "Rellena ~/Downloads/rental-application.pdf con mis datos, y pídeme lo que no sepas."
- "Resume mis resaltados de ~/Papers/sparse-retrieval.pdf, página por página, con mis notas."
- "¿Cuáles de mis notas sobre el artículo que tengo abierto contradicen lo que dice el artículo?"
- "Guarda mis notas sobre ~/Papers/attention.pdf en mi proyecto Tesis."
- "Resalta en verde cada frase de ~/Papers/sparse-retrieval.pdf que enuncie un resultado, con una nota que diga de qué experimento proviene."
- "Une los PDF de ~/Documents/Scans en un solo archivo, con la portada primero, y endereza las páginas que están de lado."
- "¿Qué archivos de ~/code/shop mencionan el pago, y qué hace cada uno con él?"
- "Añade una columna a ~/Documents/people.csv con la parte que representa cada persona del total."
- "Crea un cuaderno en ~/code/ml que entrene un pequeño clasificador de imágenes, ejecútalo y prepara un entorno en el que yo pueda ejecutarlo."
- "Abre un pull request para la rama de esta sesión, con un título y una descripción escritos a partir de los commits."
- "Vincula https://github.com/acme/site/pull/42 con esta sesión."
- "¿Ya pasaron las comprobaciones del pull request de esta sesión?"
- "Escribe una guía de lectura de lo que cambia esta rama."
- "Resuelve los conflictos de fusión en ~/code/shop-api: conserva lo que quiso decir cada lado y luego dime qué elegiste."
- "¿Qué cambió esta semana en ~/code/shop-api? Resume los commits en palabras sencillas."
- "La búsqueda se volvió lenta después de v2.3 en ~/code/shop-api: encuentra el commit que la hizo lenta."
- "¿Qué servidores de desarrollo se están ejecutando ahora mismo en esta computadora?"
- "Haz más grande el botón de la página de pago y muéstrame el antes y el después en un teléfono, en el tema oscuro."
- "Ejecuta las pruebas de Playwright que toman capturas de cada página y muéstramelas bajo un título para cada parte de la app, con las del teléfono junto a las de la computadora."
- "¿Qué está usando más memoria en esta computadora?"
