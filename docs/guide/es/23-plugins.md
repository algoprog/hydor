# Plugins

Un plugin ofrece a los agentes lo que necesitan para un tipo de trabajo, todo de una vez: habilidades, herramientas, unas pocas líneas de instrucciones, archivos propios y lo que haga falta instalar. Todos los agentes que inicia la app reciben los plugins que activas: Claude Code, Codex, Custom y los demás por igual. Este tema trata de los plugins que vienen con la app, de cómo añadir otros desde un enlace, un archivo o una carpeta, de cómo crear y compartir los tuyos, y de los plugins propios de Claude Code y Codex.

![Configuración → Plugins: tus plugins y los que vienen con la app](images/plugins.webp)

## Qué es un plugin

Un plugin es una carpeta que puede contener:

- **Habilidades**: métodos escritos que los agentes cargan cuando una tarea lo requiere. Se suman a la [biblioteca de habilidades](/guide/skills) mientras el plugin está activado.
- **Herramientas**: servidores de herramientas (servidores MCP) que dan nuevas capacidades a los agentes, como leer texto en imágenes o consultar una base de datos. Un servidor se ejecuta en esta computadora o es un servicio con una dirección.
- **Instrucciones**: unas pocas líneas que se añaden a las instrucciones propias de cada agente mientras el plugin está activado.
- **Archivos propios**: datos, plantillas, imágenes o scripts que usan sus habilidades y herramientas.
- **Lo que necesita**: otros plugins, paquetes de Python o Node, programas en esta computadora, archivos para descargar y claves de tu bóveda.

Los plugins usan el formato abierto Agent Plugins, que también leen otras herramientas (VS Code, Cursor, Codex, OpenHands…). Los plugins hechos para Claude Code también se pueden añadir aquí: sus habilidades y herramientas llegan a todos los agentes.

## Abrir la página de Plugins

Ve a **Configuración → Agentes → Plugins** ([ábrela](/settings?s=plugins)). En un teléfono, abre Configuración y toca **Plugins** dentro de Agentes.

Arriba hay tres pestañas: **Todos los agentes** (los plugins de esta app, para todos los agentes), **Claude Code** y **Codex** (los plugins propios de cada agente: consulta [los plugins propios de Claude Code y Codex](#claude-codes-and-codexs-own-plugins)).

En **Todos los agentes**:

- un cuadro de búsqueda y el botón **Añadir** junto al título de la sección, con **Crear un plugin**, **Crear uno con un agente**, **Desde un enlace**, **Desde un archivo .zip** y **Desde una carpeta**;
- mientras se añade o se configura un plugin, sus pasos, a medida que ocurren;
- **Tus plugins**: los que has añadido, cada uno con su interruptor y un menú **⋯** (**Detalles**, y **Cambiarlo** para uno que creaste o que usas desde una carpeta); el (i) junto al título indica que estos funcionan con todos los agentes. Un plugin que creaste muestra **Tuyos**, y uno que añadiste desde un enlace, un archivo o la carpeta de otra persona muestra **Agregados por ti**;
- **Vienen con la app**: los plugins integrados que aún no se han añadido, cada uno con **Añadir**.

Cada plugin muestra su nombre y versión, para qué sirve, lo que ofrece ("1 habilidad · 1 servidor de herramientas") y cualquier cosa que le impida funcionar del todo: falló la configuración, falta un programa que necesita o no hay una clave guardada. Haz clic en el nombre de un plugin (o en **⋯ → Detalles**) para abrirlo.

También puedes encontrar plugins desde el cuadro de búsqueda (Ctrl+K, ⌘K en Mac): aparecen en **Plugins**.

## Añadir un plugin que viene con la app

1. En **Vienen con la app**, haz clic en **Añadir** en su fila, o ábrelo y haz clic en **Añadir**.
2. Sus pasos aparecen en la parte superior de la página: primero se añade y luego se configura (sus paquetes y descargas). Queda activado en cuanto está listo.

Un plugin que necesita otros plugins los trae consigo: se añaden primero, y la página del plugin indica cuáles antes de que lo añadas.

## Los plugins que vienen con la app

- **Audio y video**: convierte, recorta, une, comprime e inspecciona audio y video, extrae el sonido, iguala el volumen de un pódcast, acorta las pausas largas, corta una grabación a partir de una lista de las partes que se conservan, crea clips verticales, GIF y miniaturas, añade subtítulos y descarga contenido multimedia al que tengas derecho. Necesita ffmpeg en esta computadora (su página explica cómo conseguirlo) e instala yt-dlp en su propio entorno.
- **Libros electrónicos**: lee los detalles, el contenido y el texto de un EPUB, crea un EPUB válido con portada y tabla de contenido a partir de un manuscrito en Markdown o HTML, y lo comprueba o repara antes de enviarlo a Kindle, Apple Books o Kobo. Instala en su propio entorno los paquetes de Python que necesita; con EPUBCheck en esta computadora también ejecuta la comprobación que usan las tiendas, y con pandoc acepta también archivos de Word.
- **Documentación de bibliotecas**: documentación actual y ejemplos de código para bibliotecas y frameworks de programación, del servicio de Context7, para que los agentes escriban código para la versión que usas. No se instala nada; las consultas se envían a Context7.
- **Grabaciones de reuniones**: a partir de la grabación de una reunión, una llamada o una entrevista, genera notas: un resumen, decisiones, tareas pendientes con responsables y fechas, preguntas abiertas y un correo de seguimiento, cada uno con el momento en que se dijo. Trae consigo **Voz a texto**.
- **Python para datos**: un Python propio con pandas, NumPy, SciPy, Matplotlib, openpyxl y PyArrow, para analizar tablas y crear gráficos sin instalar nada en tu propio Python.
- **Voz a texto**: grabaciones, notas de voz y videos se convierten en texto y subtítulos en esta computadora, con Whisper, en unos 100 idiomas: en una tarjeta gráfica NVIDIA si hay una (su configuración añade entonces las bibliotecas CUDA de NVIDIA, unos 1,3 GB) y, si no, en la CPU; también en la CPU cuando la tarjeta falla, indicando el motivo. Un Mac transcribe en su CPU: este Whisper no es compatible con la GPU de Apple. Trae consigo **Audio y video**; sus modelos se descargan una sola vez, la primera vez que se usa cada uno.
- **Bases de datos SQLite**: herramientas para examinar bases de datos SQLite, consultarlas de forma segura, modificarlas de una sola vez y mover datos desde y hacia archivos CSV. Solo necesita Python 3.
- **Texto de imágenes**: lee el texto en imágenes, fotos de documentos, capturas de pantalla, recibos y PDF escaneados, en esta computadora: en su tarjeta gráfica si hay una (una tarjeta NVIDIA, para la cual su configuración añade la versión de GPU de ONNX Runtime con las bibliotecas CUDA de NVIDIA, unos 2 GB; o la de un Mac, mediante Core ML) y, si no, en la CPU; también en la CPU cuando la tarjeta falla, indicando el motivo.

## Abrir un plugin

Haz clic en un plugin. Su ventana muestra:

- de dónde viene (**Viene con la app**, un enlace, un archivo, **Hecho aquí** o una carpeta), su autor, licencia y sitio web;
- su interruptor, una vez añadido: **Activado para todos los agentes** o **Desactivado**;
- para qué sirve;
- **Lo que ofrece a los agentes**: sus habilidades (con cuándo se usa cada una), sus servidores de herramientas (qué ejecuta cada uno o dónde está) y sus instrucciones; y qué agentes lo reciben;
- **Lo que necesita**, cada elemento con una marca de verificación o una cruz: otros plugins, paquetes de Python y Node, archivos para descargar, programas en esta computadora (con cómo conseguir uno que falte) y claves (con **Añadirlo** para una que aún no está guardada);
- sus archivos propios, los problemas de su carpeta si los hay, y **Acerca de**: su propia descripción;
- para un plugin que añadiste, su carpeta y su carpeta de datos.

Un plugin que añadiste tiene un menú **⋯** en la parte inferior: **Cambiarlo** (para plugins que creaste o que usas desde una carpeta), **Obtener la última versión** (para uno que viene de un enlace), **Configurarlo de nuevo**, **Empaquetar en un .zip**, **Mostrar su carpeta**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio; consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)) y **Quitar**.

## Lo que necesita un plugin y su configuración

Cuando un plugin necesita paquetes o descargas, al añadirlo se configuran en una carpeta de datos propia, nunca para toda la computadora:

- Los paquetes de Python van a un entorno de Python propio (creado con uv cuando esta computadora lo tiene y, si no, con las herramientas del propio Python). En una computadora con GPU NVIDIA, un plugin puede añadir los paquetes que necesita para ejecutarse allí, como las bibliotecas CUDA de NVIDIA; si no se pueden instalar, funciona en la CPU.
- Los paquetes de Node van a una carpeta propia, instalados sin ejecutar sus scripts de instalación.
- Los archivos se descargan en su carpeta de datos y se comprueban con su huella digital cuando el plugin la proporciona.

A los agentes se les indica dónde están su Python, sus paquetes y sus archivos, y sus servidores de herramientas los encuentran primero. Las herramientas de un plugin llegan a los agentes solo cuando termina su configuración.

Si la configuración falla, la fila del plugin lo indica; su ventana muestra el motivo, con **Reintentar**, y **Mostrar lo que imprimió** muestra la salida completa. Cuando cambian las necesidades de un plugin (por una actualización de la app o del plugin), se configura de nuevo: los integrados, por sí solos; los demás, cuando haces clic en **Configurarlo de nuevo**.

Los programas que necesita (como ffmpeg) no se instalan por ti: uno que falte se muestra con la forma de conseguirlo. Una clave que necesite viene de tu bóveda, por su nombre: añádela en [Apps → Apps conectadas → Claves](/apps/connected?tab=keys). Sus servidores de herramientas reciben la clave; los agentes nunca la ven.

## Activar o desactivar un plugin

Usa el interruptor en su fila o en su ventana. Si lo desactivas, los agentes dejan de recibir sus habilidades, herramientas e instrucciones desde su siguiente sesión; sigue añadido, con su configuración, para volver a activarlo.

- Desactivar un plugin que otros necesitan desactiva también esos otros: la app pregunta antes y los nombra.
- Activar un plugin activa los plugins que necesita.

## Añadir un plugin desde un enlace, un archivo o una carpeta

1. Haz clic en **Añadir** y luego en **Desde un enlace**, **Desde un archivo .zip** o **Desde una carpeta**.
2. Indica lo siguiente:
   - **Desde un enlace**: un repositorio de Git que contenga un plugin, como propietario/repositorio (para GitHub) o su dirección, o un enlace a la carpeta del plugin en GitHub. **Una rama, o una carpeta dentro del repositorio…** acepta una rama o etiqueta, y una carpeta.
   - **Desde un archivo .zip**: un plugin empaquetado en un .zip, de aquí o de otro lugar. Elígelo o suéltalo en el cuadro.
   - **Desde una carpeta**: una carpeta de esta computadora. El plugin se usa donde está: los cambios hechos en su carpeta llegan a las nuevas sesiones, lo que conviene a un plugin que estás creando.
3. Haz clic en **Verlo**. Verás lo que el plugin ofrece a los agentes y lo que necesita, qué plugins integrados trae consigo y cuáles necesita que la app no tenga (en ese caso no se puede añadir hasta que añadas esos).
4. Haz clic en **Añadir** (o en **Reemplazarla**, cuando ya hay aquí un plugin con su nombre; sus datos se conservan).

Sus pasos se muestran mientras se configura. No se puede añadir un plugin con el nombre de uno integrado: cámbiale el nombre en su plugin.json.

## Crear un plugin propio

1. Haz clic en **Añadir** y luego en **Crear un plugin**.
2. Ponle un **Nombre** y escribe para qué sirve, y haz clic en **Crearla**. Se añade, queda activado y se abre su editor.
3. Completa sus pestañas y haz clic en **Guardar**:
   - **Unos**: el nombre que ve la gente, su versión (súbela cuando compartas una nueva), para qué sirve, su grupo y su imagen.
   - **Habilidades**: **Escribir una habilidad** (su nombre, grupo, cuándo usarla y sus instrucciones), o **Copiar una tuya** de tus habilidades. Haz clic en una habilidad para cambiarla.
   - **Herramientas**: **Agregar un servidor de herramientas**: **Un programa de aquí** (el programa que se inicia, sus argumentos uno por línea y su entorno como líneas NOMBRE=valor), o **Una dirección** (la dirección de un servidor MCP y los encabezados). Usa `${PLUGIN_ROOT}` para la carpeta del plugin y `${PLUGIN_DATA}` para su carpeta de datos: los argumentos de un servidor pasan a ser `${PLUGIN_ROOT}/files/server.py`, por ejemplo.
   - **Necesita**: paquetes de Python, paquetes de Node, programas, claves, otros plugins y archivos para descargar, uno por línea.
   - **Archivos**: **Añadir archivos** coloca archivos en él (cada uno de hasta 50 MB, 200 MB en total); la papelera quita uno. Los archivos se añaden y se quitan al instante, sin **Guardar**.
   - **Instrucciones**: unas pocas líneas que recibe cada agente mientras el plugin está activado.

Al guardar se comprueba todo primero: una habilidad debe indicar cuándo usarla, el programa de un servidor de herramientas es un solo programa (no una línea de shell), etcétera; la app indica qué corregir. Cuando cambian sus paquetes, se configura de nuevo.

Los plugins que creas se guardan en la carpeta de datos de la app (plugins/mine). Para cambiar uno más adelante, ábrelo y elige **Cambiarlo** en su menú **⋯**.

**Crear uno con un agente** abre una nueva sesión con el comienzo de una petición ("Ayúdame a crear un plugin para Hydor que…"): di qué debe hacer, y el agente lo escribe, lo comprueba y lo añade desde su carpeta con tu aprobación.

## Compartir un plugin

- **Como archivo**: abre el plugin y luego **⋯ → Empaquetar en un .zip** (o **Empaquetar en un .zip** en su editor). Cualquiera lo añade con **Añadir → Desde un archivo .zip**. Su configuración no se empaqueta: se vuelve a hacer donde se añade.
- **Como enlace**: coloca su carpeta en un repositorio de Git (por ejemplo, en GitHub). Cualquiera lo añade con **Añadir → Desde un enlace** y recibe tus nuevas versiones con **Obtener la última versión**.

Otras herramientas que leen el formato Agent Plugins también pueden usar sus habilidades y servidores de herramientas; las partes que solo lee esta app (lo que necesita, sus instrucciones) se guardan en su parte `com.naget.agent`, que ellas pasan por alto.

## Actualizar o quitar un plugin

- Los plugins integrados se actualizan con la app.
- Un plugin desde un enlace: **⋯ → Obtener la última versión** lo descarga de nuevo y lo configura si cambiaron sus necesidades.
- Un plugin desde un archivo .zip: añade el archivo más reciente; reemplaza al anterior.
- Un plugin desde una carpeta: los cambios en la carpeta llegan solos a las nuevas sesiones.

Para quitar uno: **⋯ → Quitar** y luego confirma. Los plugins que lo necesitan también se quitan (la app los nombra antes). Sus paquetes y descargas se eliminan. Un plugin que creaste aquí se elimina junto con su carpeta: empaquétalo primero en un .zip para conservar una copia. Un plugin usado desde una carpeta tuya permanece en su carpeta.

## Qué agentes reciben un plugin

Cada sesión que inicia la app recibe los plugins que están activados, configurados y cuyos plugins necesarios también están activados:

- sus **habilidades** a través de la biblioteca de habilidades, como las demás (consulta [Qué agentes reciben qué habilidades](/guide/skills#which-agents-get-which-skills)). Una habilidad con un nombre que la biblioteca ya tiene se deja fuera: la ventana de su plugin indica qué habilidad reciben los agentes en su lugar;
- sus **servidores de herramientas** como servidores MCP, iniciados en la carpeta del plugin con sus propios paquetes;
- sus **instrucciones**, con una línea sobre dónde están sus paquetes y archivos.

Un plugin puede ser solo para algunos agentes; su ventana indica cuáles. Las sesiones que ya están en marcha reciben los cambios de un plugin desde su siguiente inicio.

## Plugins propios de Claude Code y Codex

Claude Code y Codex tienen plugins propios, que vienen de sus marketplaces y que solo ellos usan. Cada uno tiene una pestaña en la página de Plugins:

- **Claude Code**: **Instalada** (cada plugin con su interruptor y **Desinstalar**), **Examinar** (busca en los marketplaces, primero los más instalados, **Instalar**) y **Marketplaces** (añade uno con propietario/repositorio, una dirección de Git o una carpeta; quita uno).
- **Codex**: **Agregados a Codex** (cada uno con **Quitar**), **Encontrar más** (busca en los marketplaces de Codex, **Añadir**) y **Marketplaces** (añade, **Actualizar** o quita uno).

Sus habilidades aparecen en la página de Habilidades, bajo las habilidades propias del agente. Para usar un plugin de Claude Code con todos los agentes, añádelo a los plugins de esta app con **Añadir → Desde un enlace**.

## Plugins y seguridad

Los servidores de herramientas de un plugin ejecutan programas en esta computadora como si fueras tú, y todos los agentes reciben sus instrucciones. Añade solo plugins de personas de confianza y revisa lo que un plugin ofrece y necesita antes de añadirlo: la app te lo muestra antes de instalar nada. Los plugins que vienen con la app están hechos y revisados junto con ella.

Las claves nunca van dentro de un plugin: un plugin indica los nombres de las claves que necesita, y sus servidores las obtienen de tu bóveda mientras se ejecutan.

## Pregunta a un agente

- “¿Qué plugins tengo y qué ofrece cada uno a los agentes?”
- “Añade el plugin Speech to text y transcribe ~/Recordings/standup.m4a.”
- “Desactiva el plugin Library docs.”
- “Crea un plugin con las tres habilidades de redacción de nuestro equipo y empaquétalo en un .zip.”
- “Añade el plugin que está en github.com/acme/agent-tools/tree/main/plugins/invoices.”
- “¿Por qué el plugin Text from pictures dice que su configuración falló?”
