# Documentos, imágenes, videos y voz

Los agentes de Hydor leen PDF, Word, Excel, PowerPoint y otros documentos, crean documentos nuevos para ti y te los entregan como tarjetas que puedes abrir o descargar. También pueden crear imágenes, dibujos, gráficos y videos cortos, buscar fotos gratuitas, modificar tus imágenes y videos (recortar, extraer el fondo, borrar, acortar) y crear canciones, locuciones y sonidos, con modelos y herramientas de imagen, video y audio en esta computadora, y puedes guardar lo que creen en los archivos de un proyecto. Además, puedes hablar en lugar de escribir, hacer que las respuestas se lean en voz alta o hablar con la app en modo manos libres mientras caminas.

![Un agente que leyó un informe y creó un resumen de una página en Word y una hoja de cálculo con un gráfico](images/documents-voice.webp)

## Dale un documento a un agente para que lo lea

Todos los agentes que ejecuta la app pueden leer documentos: Claude Code, Codex, Custom y los agentes que hablan ACP y aceptan servidores MCP. No necesitas convertir nada antes. Entrégale el documento de una de estas formas:

1. **Adjúntalo a tu mensaje**: el clip (**Adjuntar archivos**) en el cuadro de mensaje, o arrastra el archivo al cuadro, o pégalo. Las imágenes llegan al modelo como imágenes; cualquier otro archivo se guarda en la computadora que ejecuta Hydor, y su ruta se agrega a tu mensaje para que el agente pueda abrirlo. Un mensaje admite hasta 25 MB de archivos.
2. **Indica un archivo de esta computadora**: “Resume ~/Documents/lease.pdf”. Una ruta que no empieza con `/` ni con `~` parte de la carpeta de la sesión.
3. **Guarda los documentos en un proyecto o en el conocimiento compartido**, para que las sesiones puedan buscar en ellos y citar la página: consulta [Proyectos y conocimiento](/guide/projects).

Mientras el agente lee, su trabajo muestra **Reading lease.pdf** y luego **Read lease.pdf**. En una pantalla más ancha, la línea también indica qué es el documento (el tipo, sus páginas, hojas o diapositivas) y qué líneas se leyeron. Haz clic en la línea para ver el texto que recibió el agente, y en **Open lease.pdf** para ver el archivo en sí.

Un documento largo se lee por partes, de unas 1.200 líneas cada vez, y se le avisa al agente cuando hay más. A los agentes se les indica que traten lo que dice un documento como información, no como instrucciones. Nada de lo que hay en un documento se ejecuta: las macros nunca se ejecutan y solo se conservan los enlaces web y de correo.

Custom también lee PDF, documentos de Office e imágenes con su lectura de archivos habitual: consulta [Custom, el agente propio de la app](/guide/custom).

## Qué pueden leer los agentes en un documento

### PDF

- El texto de cada página, con la misma disposición que tiene en la página.
- Funciona mejor con el programa pdftotext (incluido en poppler-utils). Sin él, la app descarga pdf.js una sola vez (unos 35 MB, para lo que se necesita internet esa primera vez), y la disposición es solo aproximada.
- Las páginas escaneadas no tienen texto, y se le avisa al agente cuáles son (“Pages 3, 5–7 have no text”). Con la habilidad **pdf**, entonces mira esas páginas como imágenes y las lee por sí mismo, o les aplica OCR cuando tesseract está instalado.
- Un PDF protegido con contraseña no se puede leer. Dale la contraseña al agente y la habilidad **pdf** crea una copia desbloqueada. Uno que se abre sin contraseña pero limita los cambios (muchos formularios oficiales) se lee como cualquier otro.
- **Formularios**: el agente enumera los campos de formulario de un PDF, cada uno con las palabras impresas junto a él (que indican para qué sirve un campo llamado “f1_02”), y mira sus páginas como imágenes con los campos numerados y una regla en puntos.
- **Tus resaltados y notas**: lo que resaltaste en el lector de Archivos, página por página, con tus notas e imágenes de las figuras y ecuaciones que elegiste ([Leer y resaltar un PDF](/guide/files-git#read-and-highlight-a-pdf)), para resumirlos o compararlos con el artículo. Si se lo pides, también resalta palabras por ti, que luego se ven en el lector.

### Word, Excel y PowerPoint

- **Word** (.docx, y sus variantes con macros y plantillas): encabezados, párrafos, listas numeradas y con viñetas, tablas, enlaces, cuadros de texto, imágenes (por su descripción), notas al pie, notas finales y comentarios.
- **Excel** (.xlsx, y sus variantes con macros y plantillas): cada hoja como una tabla con sus números de fila y letras de columna, los números más o menos con su formato (fechas, porcentajes, dinero) y hasta 40 fórmulas de cada hoja. Las hojas ocultas se marcan. De cada hoja se entregan las primeras 2.000 filas y 60 columnas, y se le avisa al agente cuando hay más; para leer completa una hoja más grande, la habilidad **spreadsheets** la carga de otra manera.
- **PowerPoint** (.pptx, y sus variantes con macros, plantillas y presentaciones): el título de cada diapositiva, su texto, tablas, imágenes (por su descripción), gráficos (su título y series) y notas del orador. Las diapositivas ocultas se marcan. Hasta 1.000 diapositivas.

### OpenDocument, EPUB, CSV y RTF

- **OpenDocument** (los .odt, .ods y .odp propios de LibreOffice, sus plantillas y .odg): texto con encabezados, listas, tablas, enlaces y notas al pie; hojas tal como se muestran; diapositivas con sus títulos, texto y notas.
- Libros **EPUB**: los capítulos en orden de lectura, con encabezados, listas, tablas y citas.
- Tablas **CSV** y **TSV**, y texto **RTF**.

### Archivos de Office antiguos, protegidos y muy grandes

- Los archivos .doc, .xls y .ppt antiguos se leen a través de LibreOffice, que primero los convierte al formato actual. Sin LibreOffice no se pueden leer, y se le indica al agente que te pida el archivo guardado como .docx, .xlsx o .pptx, o que se instale LibreOffice.
- Los archivos de Word, Excel y PowerPoint protegidos con contraseña no se pueden leer.
- Se leen archivos de hasta 300 MB. De un documento se obtienen hasta unos 1.000.000 de caracteres de texto (unos 250.000 tokens); a partir de ahí se corta, y se le avisa al agente.

## Pídele a un agente que cree un documento

La app incluye cuatro habilidades de documentos que todos los agentes pueden cargar: **word-documents**, **spreadsheets**, **presentations** y **pdf**. Las encuentras en [Configuración → Habilidades](/settings?s=skills&find=Built%20in), en **Documentos** (consulta [Habilidades](/guide/skills)). No tienes que elegirlas: pídelo con tus propias palabras (“Haz un currículum de una página a partir de mis notas como documento de Word”, “Pon estos gastos en una hoja de cálculo con totales mensuales y un gráfico”, “Haz 8 diapositivas para mi charla sobre las abejas”, “Une estos tres PDF”), y el agente carga la habilidad adecuada cuando la tarea lo requiere.

Cada habilidad funciona de la misma manera:

1. El agente planifica primero el documento: su esquema, hojas o diapositivas.
2. Escribe el archivo con un breve script en la carpeta de la sesión.
3. Revisa el resultado como imágenes de páginas, comprueba que no haya texto que se salga de la página, tablas que no caben ni diapositivas sobrecargadas, y corrige lo que esté mal.
4. Te entrega el archivo como una tarjeta debajo de su respuesta, con un breve pie (consulta [Abrir o descargar los archivos que creó un agente](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Cuando modifica un archivo tuyo, guarda el resultado con un nombre nuevo, a menos que le pidas que sobrescriba el tuyo.

Lo que crean los agentes se queda en tu computadora: un archivo en la carpeta de la sesión, o una página, un documento, una presentación o una hoja de cálculo guardados en la app (en un proyecto, también un archivo en su carpeta). No lo ponen en un servicio externo (un artefacto de claude.ai, un canvas de ChatGPT, Google Docs) ni responden con un enlace a uno, a menos que tú lo pidas o la tarea lo necesite. Los artefactos de Claude Code y su conector Docs de claude.ai, y los artefactos de Codex, están desactivados en las sesiones que Hydor ejecuta.

### Documentos de Word

Informes, cartas, currículums, memorandos, contratos, formularios, folletos y notas, para abrir en Word, Google Docs o Pages.

- Estructura real: encabezados (que funcionan en el panel de navegación de Word y con lectores de pantalla), listas con viñetas y numeradas, tablas con fila de encabezado, imágenes y saltos de página.
- Una tabla de contenido (Word la completa al abrir el archivo), números de página (“Página 1 de 3”), enlaces y celdas de tabla sombreadas.
- A4 o US Letter, y fuentes que se ven igual en cualquier computadora (Calibri, Arial, Cambria, Times New Roman).
- Tus propios documentos modificados en el mismo archivo, conservando sus estilos, encabezados y diseño; texto reemplazado sin perder su formato; comentarios agregados.
- Firmados con tu firma guardada: en lugar de {{signature}}, justo después de palabras como “Firma:”, en la celda de una tabla o al final, una vez que lo permitas en una tarjeta ([Firmas](/guide/library#signatures)).
- También un PDF del documento, mediante LibreOffice.

### Hojas de cálculo

Presupuestos, seguimientos, calendarios, facturas y tablas de datos (.xlsx).

- Tus números como valores y los resultados como fórmulas, para que puedas cambiar un número y ver cómo se ajusta el resto.
- Formatos de número para dinero, porcentajes y fechas; una fila de encabezado en negrita que se mantiene visible; anchos de columna; filtros en las listas.
- Gráficos de barras, de líneas y circulares junto a los datos.
- Una comprobación de cada fórmula. Con LibreOffice instalado, la comprobación calcula las fórmulas y enumera los errores (#REF!, #DIV/0!, #NAME?), que el agente corrige después.
- Tus propios libros modificados, conservando sus fórmulas, estilos y la mayor parte de su diseño (las tablas dinámicas no se conservan, y los gráficos solo cuando el agente los vuelve a crear). Un archivo CSV en su lugar, cuando lo pides.

### Presentaciones

Presentaciones para inversores, charlas, clases y resúmenes (.pptx), para mostrar en PowerPoint, Keynote o Presentaciones de Google.

- Diapositivas limpias en 16:9 con un mismo aspecto en todas y el color de tu marca: una diapositiva de título, viñetas con niveles, dos columnas, imágenes ajustadas a la diapositiva, tablas, gráficos (de columnas, de barras, de líneas, circulares, apilados), diapositivas de sección y notas del orador para lo que vas a decir.
- Una idea por diapositiva, con títulos que expresan lo esencial (“Las ventas crecieron un 12 %”), normalmente de 6 a 12 diapositivas para una charla.
- Imágenes tuyas, de la web o creadas con un modelo de imágenes (consulta [Deja que los agentes creen imágenes](/guide/documents-voice#let-agents-make-images)).
- Una presentación nueva con tu propia plantilla, o tu presentación modificada, conservando su tema y sus diseños.
- Un PDF de las diapositivas, mediante LibreOffice.

### PDF

Informes, facturas, certificados, volantes, cartas y formularios.

- Sobre todo texto, o algo que querrás editar: el agente crea un documento de Word y luego un PDF a partir de él con LibreOffice.
- Con una disposición exacta (facturas, certificados, entradas, formularios): dibuja el PDF directamente.
- Diapositivas u hoja de cálculo como PDF: se crean con su habilidad y luego se convierten en PDF.
- **Rellenar un formulario**: sus campos por nombre (texto, casillas marcadas, opciones, en griego, chino o cualquier escritura), de modo que cualquier visor los muestre y todavía se puedan modificar allí; o, en un formulario que son solo líneas y recuadros impresos, las palabras escritas en la página junto a las palabras impresas (“Fecha de nacimiento:”) y marcas en sus casillas; en uno escaneado, que no tiene palabras que encontrar, donde el agente ve los espacios en blanco en una imagen de la página. El agente te pregunta lo que no sabe y revisa las páginas antes y después. Un formulario con firma digital sigue siendo válido cuando solo se rellenan sus campos. Los formularios XFA (Adobe LiveCycle) solo se rellenan en las apps de Adobe: el agente lo indica y aun así puede escribir sobre sus páginas.
- **Escribir en las páginas**: palabras, marcas y cruces, imágenes, recuadros blancos sobre lo que hay (solo ocultan las palabras a la vista: las palabras siguen en el archivo, así que no es una redacción de censura), contornos y líneas, y resaltados y comentarios propios del PDF, que otros visores enumeran y pueden quitar.
- **Modificar páginas**: girarlas, eliminarlas, moverlas, insertar páginas en blanco, unir PDF, extraer algunas páginas a un archivo propio o dividir uno en varios. Un archivo modificado de esta manera no puede conservar una firma digital, y el agente lo indica.
- Lo que escribe el agente va en una copia junto al archivo (“nombre (filled).pdf”), a menos que pidas que se modifique el archivo mismo; entonces su versión anterior va a la Papelera. También puedes rellenar y firmar un PDF tú mismo: [Rellenar y firmar un PDF](/guide/files-git#fill-in-and-sign-a-pdf).
- Palabras grandes y tenues como BORRADOR en todas las páginas, y una copia sin su contraseña (tú das la contraseña), con la habilidad **pdf**.
- Firmados con tu firma guardada, junto a unas palabras de una página o en un lugar que se te muestra antes, una vez que lo permitas en una tarjeta; se agrega al PDF sin cambiar lo que había en él ([Firmas](/guide/library#signatures)).
- Archivos de Office convertidos en PDF.

### Qué necesita la computadora

Esto se refiere a la computadora que ejecuta Hydor, no al dispositivo desde el que la usas.

- **Python 3**, con su módulo venv: necesario para crear documentos. La primera vez, las habilidades instalan unas pocas bibliotecas de Python para archivos de Office y PDF en una carpeta privada de la app (unos 30 MB, una sola vez, desde internet); no se instala nada en todo el sistema. Si falta Python, el agente te indica el único comando que debes ejecutar (en Debian o Ubuntu `sudo apt install python3 python3-venv`; en un Mac `brew install python`).
- **LibreOffice** (opcional): vistas previas como páginas con su diseño en el visor de archivos, lectura de archivos .doc, .xls y .ppt antiguos, agentes que ven los documentos de Office como páginas, comprobación de fórmulas y PDF a partir de archivos de Office. En Debian o Ubuntu: `sudo apt install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui`; en un Mac: `brew install --cask libreoffice`.
- **poppler-utils** (opcional): la mejor lectura de PDF, e imágenes de las páginas de un PDF para los agentes y para **Rellenar y firmar**. Sin él, la app las dibuja con lo que tenga la computadora (la forma propia de un Mac o de Windows de dibujar PDF), o con el navegador de **Configuración → Navegador**. En Debian o Ubuntu: `sudo apt install poppler-utils`; en un Mac: `brew install poppler`.
- **tesseract** (opcional): OCR para PDF escaneados.

Sin LibreOffice ni poppler-utils, los agentes vuelven a leer sus archivos como texto para comprobarlos y mantienen el diseño sencillo.

## Abrir o descargar los archivos que creó un agente

Cuando un agente crea archivos para ti (un documento, una hoja de cálculo, diapositivas, un PDF, imágenes, un archivo comprimido), te los entrega como tarjetas debajo de su respuesta, hasta 12 a la vez. Cada tarjeta tiene:

- un icono según el tipo, en su color (azul para Word, verde para Excel, naranja para PowerPoint, rojo para PDF), o una imagen pequeña si es una imagen;
- el nombre del archivo, qué es y su tamaño (“Documento de Word · 24 KB”);
- la descripción del agente (“El presupuesto, una hoja por trimestre”);
- **Abrir**, un botón de descarga y **Más** (⋯).

**Abrir** muestra el archivo en el visor de archivos, en una ventana sobre la conversación, que se queda donde estaba (en un teléfono la ventana sube desde la parte inferior de la pantalla). **Abrir en Archivos**, en la parte superior, lleva el archivo a la página Archivos; la cruz, o Escape, cierra la ventana. En una computadora, **Pantalla completa** (el icono de las flechas, a la izquierda de **Más**) hace que la ventana llene toda la app, como el panel junto a la conversación, y **Salir de pantalla completa**, en su lugar, la devuelve a su tamaño. El siguiente archivo se abre como dejaste el último, en pantalla completa o no; esto se guarda en este navegador. Encima del archivo aparece su ruta, como en la página Archivos ([Abrir y editar un archivo](/guide/files-git#open-and-edit-a-file)); una carpeta de esa ruta se abre en la misma ventana, con el archivo seleccionado allí (antes pregunta por los cambios sin guardar), y **‹**, en la parte superior de la ventana, vuelve al archivo. El botón de descarga guarda el archivo en tu dispositivo.

**Más** (⋯), en una tarjeta y en la parte superior de la ventana, tiene **Empezar una sesión con él** (la página de inicio, con el archivo en su cuadro de mensaje), **Añadir a un proyecto** (lo copia en la carpeta de un proyecto, o en una [carpeta que elijas dentro](/guide/files-git#add-files-to-a-project)), **Guardar una copia** (un cuaderno de Jupyter, una presentación de PowerPoint, un documento de Word o de Markdown, una hoja de cálculo o un archivo LaTeX: una copia guardada como documento propio, en su editor, en los archivos del proyecto que elijas cuando tienes proyectos, o en los de la primera sesión, o en una carpeta de dentro), **Mostrar en Archivos** (en una tarjeta), **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio; consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)) y **Copiar ruta**. Consulta [Empezar una sesión con archivos](/guide/files-git#start-a-session-with-files) y [Añadir archivos a un proyecto](/guide/files-git#add-files-to-a-project).

Un archivo eliminado o movido desde entonces aparece como **Ya no está**. Si un agente menciona un archivo que no existe, ves “No se pudieron mostrar los archivos” con el motivo, y al agente se le indica que lo corrija.

### Documentos que creó o cambió, y nombres de archivo en su respuesta

Debajo de la respuesta de un agente, los documentos que creó o cambió en ese turno aparecen siempre como tarjetas, los haya entregado o no: archivos PDF, Word, Excel, PowerPoint y OpenDocument, tablas CSV y TSV, LaTeX, cuadernos de Jupyter, EPUB y Markdown. Son los que escribieron sus ediciones y los que crearon sus comandos en la carpeta de la sesión mientras duraba el turno (los que el turno nombra, o que están junto a un archivo que cambió: los de otras sesiones que trabajan en la misma carpeta no se añaden).

- Cada tarjeta dice **Nueva** o **Actualizada**, con su tipo y tamaño, y tiene **Abrir**, un botón de descarga y **⋯**, igual que las tarjetas anteriores.
- Los documentos terminados (un PDF, un archivo de Word…) van antes que sus fuentes (LaTeX, Markdown, tablas). Se muestran los cuatro primeros; **Mostrar N documentos más** muestra el resto y **Mostrar menos** los vuelve a plegar.
- Un archivo que el agente entregó conserva su propia tarjeta y su descripción, y no se muestra dos veces. Un archivo que ya no está se omite. Las imágenes, el código y los archivos de datos no se muestran de este modo (un agente sigue entregando las imágenes).
- En una pantalla ancha, un documento también se muestra al lado de la conversación: el botón del panel en su tarjeta (**Abrir junto a la conversación**) lo abre ahí, y la tarjeta del que se muestra queda con un contorno. Cuando un turno crea o modifica un solo documento, se abre ahí solo ([Ver una página mientras se escribe](/guide/library#watch-a-page-as-it-is-written)). Uno abierto ahí, o en la ventana, muestra cada cambio que el agente le hace a medida que lo escribe.

Los nombres y rutas de archivo en una respuesta son enlaces. Un nombre o ruta en código (`report.tex`, `docs/report.pdf`, `src/app.ts:42`, que se abre en esa línea), una ruta absoluta o con `~/` en el texto y un enlace a un archivo abren el archivo en la ventana sobre la conversación, igual que el botón **Abrir** de una tarjeta. Un nombre solo abre el archivo de la conversación con ese nombre; una ruta que no empieza desde la raíz se toma desde la carpeta de la sesión.

## Ver una vista previa de un documento en el visor de archivos

El visor de archivos muestra documentos desde una tarjeta, desde la página Archivos o desde un enlace en una respuesta (consulta [Archivos, Git, Terminal y Vista previa](/guide/files-git)).

- Los **PDF** se muestran tal cual, en el visor de PDF del propio navegador, con **Rellenar y firmar** para rellenarlos y firmarlos ([Rellenar y firmar un PDF](/guide/files-git#fill-in-and-sign-a-pdf)).
- Los archivos de **PowerPoint** (.pptx, y sus variantes con macros, de presentación y de plantilla) se abren en **Diapositivas**: “Sus diapositivas, tal como las dibuja la app”. Cada diapositiva se muestra tal como se ve, igual que una presentación conservada (con sus imágenes, formas, tablas, gráficos, fondo y pie de página en su sitio), una debajo de otra con su número y sus notas del orador, también en un teléfono. Si la presentación usa una fuente que esta computadora no tiene, se sustituye por otra; cuando esa necesita más espacio, el texto de un cuadro se reduce un poco para que quepa y no se corte nada. **Texto** (“Sus palabras y notas del orador”) muestra las palabras de las diapositivas, y **Páginas** las muestra maquetadas por LibreOffice cuando está instalado. Si no se pueden dibujar las diapositivas, el visor se abre en **Texto** y explica el motivo.
- Los archivos de **Word, Excel, PowerPoint, OpenDocument, EPUB y RTF** (también los antiguos .doc, .xls y .ppt) se muestran como vista previa. Cuando LibreOffice está instalado, un interruptor en la parte superior ofrece dos vistas:
  - **Páginas**: “Tal como las maqueta LibreOffice”, cada página como se imprimiría. La primera vez tarda un momento (“Maquetando las páginas…”); después las páginas se abren al instante hasta que el archivo cambia.
  - **Texto**: “Su texto, hojas y diapositivas”, tal como los lee la app. Un documento de texto se muestra como una hoja de papel; un libro de cálculo como una cuadrícula con letras de columna, números de fila y una pestaña para cada hoja en la parte inferior (las hojas ocultas se marcan con un ojo tachado); las diapositivas como tarjetas, cada una con su número y sus notas del orador debajo. Las imágenes se muestran como un recuadro con su descripción. Una línea en la parte superior avisa cuando se ha omitido algo (“Muestra las primeras 1000 filas”).
- Sin LibreOffice solo existe la vista **Texto**. Los libros EPUB siempre se abren en ella.
- En un teléfono la vista previa se abre en **Texto** (un archivo de PowerPoint, en **Diapositivas**), que se desplaza y amplía mejor en una pantalla pequeña; el interruptor muestra las páginas.

Si LibreOffice no puede maquetar un archivo, el visor lo indica y su texto sigue disponible en **Texto**. Un archivo sin vista previa dice “No hay vista previa de este archivo”: descárgalo para abrirlo en tu dispositivo. El botón de descarga del visor siempre está disponible.

## Permitir que los agentes creen imágenes

Pídele a cualquier agente una imagen (“haz un logotipo para mi panadería”, “convierte esta foto en una acuarela”) y la crea con un modelo de imagen a través de OpenRouter, la guarda en la carpeta de la sesión y la muestra con su respuesta. Configúralo en **[Configuración → Capacidades → Imágenes, video y audio](/settings?s=images)** (en un teléfono: Configuración, y luego **Imágenes, video y audio**).

- **[Creación de imágenes](/settings?s=images&find=Making%20images)**: el interruptor **Permitir que los agentes creen imágenes**, junto al título del grupo, da a cada agente sus herramientas para imágenes: crear imágenes, dibujos y gráficos, y quitar el fondo de una imagen o borrar una parte. Está activado salvo que lo desactives; si está desactivado, no se les ofrecen a los agentes.
- **La clave de OpenRouter**: los modelos de imagen, video y audio se usan a través de OpenRouter, y cada imagen, video o sonido se paga con tu clave de OpenRouter. Sin una, esta sección lo indica, con **Consigue una en openrouter.ai** y **Añadir la clave**, que abre [Configuración → Agentes → Modelos → OpenRouter](/settings?s=models&find=OpenRouter), donde se coloca la clave (consulta [Agentes, cuentas y modelos](/guide/agents-models)). Un agente que la necesita te la pide en una tarjeta ([Cuando un agente necesita la clave de OpenRouter](#when-an-agent-needs-the-openrouter-key)).
- **[Para la mayoría de las imágenes (Mejor)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)**: el modelo que crea escenas, fotos, personas, palabras dentro de una imagen y diagramas, y todos los cambios en una imagen. Muestra su nombre, con su creador, aproximadamente cuánto cuesta una imagen (para una imagen de cerca de un megapíxel) y el mes en que OpenRouter lo incluyó en su lista (su id está en el (i)), con etiquetas: **Nueva** (incluido en los últimos 30 días), **Ediciones** (admite imágenes para cambiar o seguir) y **También texto** (escribe texto en sus imágenes). Hasta que elijas uno, es la elección de la app (“La elección de la app, hasta que elijas una”): el primero de una lista corta que OpenRouter sigue ofreciendo: Seedream 5.0 Pro y Flash de ByteDance, y luego modelos de imagen de Google Gemini, OpenAI y FLUX.
- **[Para imágenes sencillas (Rápido)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)**: un modelo más barato y rápido para iconos, fondos, texturas e imágenes sencillas, que se muestra del mismo modo. Hasta que elijas uno, es la elección de la app: el primero de una lista corta de modelos rápidos que OpenRouter sigue ofreciendo, con Seedream 5.0 Flash de ByteDance en primer lugar, y luego modelos rápidos de Google, Recraft, FLUX y OpenAI (cuando OpenRouter no ofrece ninguno de ellos, el modelo Mejor crea también las imágenes sencillas).
- **[Herramientas de imagen en esta computadora](/settings?s=images&find=Picture%20tools%20on%20this%20computer)**: quitar el fondo de una imagen, borrar una parte y agrandarla en esta computadora en lugar de a través de OpenRouter: es gratis, y tus imágenes se quedan aquí. **Configuración** las descarga una sola vez, la línea de debajo indica lo que están haciendo, y **⋯ → Quitar** las elimina de esta computadora de nuevo (consulta [Las herramientas de imagen en esta computadora](/guide/library#the-picture-tools-on-this-computer)).

Para elegir el modelo Mejor o el Rápido:

1. Haz clic en **Cambio** junto a él: se abre una lista de los modelos de imagen de OpenRouter (**Modelo de imagen para la mayoría de las imágenes (Mejor)** o **Modelo de imagen para imágenes sencillas (Rápido)**).
2. Búscalo por nombre (“seedream”, “flux”, “gemini”) y ordénalo por **Sugeridos** (primero las sugerencias de la app), **Más reciente** o **Más barato**.
3. Haz clic en una fila para usar ese modelo. Una vez que hayas elegido uno, el menú **⋯** de la fila tiene **Dejar que la app elija**, que vuelve a la elección de la app.

Las listas vienen de OpenRouter y no necesitan clave; cuando no se puede acceder a ellas, la lista lo indica.

## Permitir que los agentes creen videos

Los agentes también pueden crear videos cortos (“diez segundos de olas al atardecer”, “haz que esta foto de mi perro corra por un campo”), con un modelo de video a través de OpenRouter, en la misma sección, **[Configuración → Capacidades → Imágenes, video y audio](/settings?s=images)**:

- **[Creación de videos](/settings?s=images&find=Making%20videos)**: el interruptor **Permitir que los agentes creen videos**, junto al título del grupo, da a cada agente la herramienta para ello. Está activado salvo que lo desactives.
- **[Modelo de video](/settings?s=images&find=Video%20model)**: el modelo que los crea, que se muestra con su creador, lo que cuesta un segundo de video (desde su resolución más baja sin sonido hasta la más alta con sonido, como “$0,03 a $0,08 por segundo”), las duraciones que admite (“de 4 a 8 s”), su resolución más alta (“hasta 1080p”) y el mes en que OpenRouter lo incluyó en su lista, con etiquetas: **Sonido** (crea sonido junto con la imagen), **A partir de una imagen** (puede partir de una imagen que le des) y **Edita videos** (cambia un video que le das en lugar de crear uno a partir de palabras). Hasta que elijas uno, es la elección de la app: el primero de una lista corta de modelos con sonido que OpenRouter sigue ofreciendo: Seedance 2.5 de ByteDance, y luego otros más baratos y rápidos, como Google Veo 3.1 Lite. **Cambio** abre la lista para buscar (“seedance”, “veo”, “kling”) y ordenar por **Sugeridos**, **Más reciente** o **Más barato**.

- **[Usar la tarjeta gráfica para videos](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** (en **Edición de videos**): **Automático** crea los videos que editas, y las ediciones de los agentes, en la tarjeta gráfica cuando hay una que funcione (NVIDIA, Intel, AMD o Apple): es mucho más rápido y el procesador queda libre. Se prueba la primera vez que se crea un video, y la línea de debajo indica lo que se encontró (“NVIDIA GeForce RTX 4090 · NVENC”); **Comprobar ahora** lo prueba de nuevo. Si la tarjeta falla en una edición, el procesador la hace de nuevo de inmediato. **Desactivado** los crea con el procesador.

Los videos cuestan mucho más que las imágenes: desde unos centavos hasta dólares por segundo, y un video de 8 segundos con sonido de un modelo de primer nivel puede costar varios dólares. Cada uno se paga con tu clave de OpenRouter, y ves su precio en un formulario antes de que se cree nada.

## Permitir que los agentes creen audio

Los agentes también pueden crear sonido: canciones y jingles (“un jingle de 30 segundos para mi podcast”), locuciones y narraciones con una voz que describas (“lee esta bienvenida con una voz cálida y pausada”) o con una voz copiada de una grabación que tengas, y efectos de sonido y ambientes (“lluvia sobre un techo de lámina”). Configúralo en la misma sección, **[Configuración → Capacidades → Imágenes, video y audio](/settings?s=images)**:

- **[Creación de audio](/settings?s=images&find=Making%20audio)**: el interruptor **Permitir que los agentes creen audio**, junto al título del grupo, da a cada agente la herramienta para ello. Está activado salvo que lo desactives.
- **[Modelo de música](/settings?s=images&find=Music%20model)**: el modelo que crea canciones y música, que se muestra con su creador, su precio (“$0,08 por canción”), la duración máxima que crea (“hasta 3:00”) y el mes en que OpenRouter lo incluyó en su lista, con la etiqueta **Música**. Hasta que elijas uno, es la elección de la app: Lyria 3 Pro de Google, que crea canciones completas de hasta unos 3 minutos, con voz o sin ella; si no, Lyria 3 Clip, que crea fragmentos de 30 segundos.
- **[Modelo de voz y sonido](/settings?s=images&find=Voice%20and%20sound%20model)**: el modelo que habla y crea otros sonidos, que se muestra con su precio (“$0,0025 por segundo”, “$0,08 por cada 1.000 caracteres”, “unos $0,014 por minuto”), la duración máxima que crea y cuántas voces tiene, con etiquetas: **También sonidos** (crea efectos de sonido y ambientes además de voces, a partir de una descripción), **Copia voces** (habla con una voz copiada de grabaciones cortas que le des), **Conversaciones** (pone voz a varios hablantes, cada uno con su propia voz) y **Dirigido** (admite indicaciones para la interpretación: tono, ritmo, emoción). Hasta que elijas uno, es la elección de la app: Seed Audio 1.0 de ByteDance, que hace todo esto a partir de una descripción, hasta 2 minutos cada vez; si no, Gemini 3.8 Flash TTS de Google; si no, ElevenLabs v3.

**Cambio** abre la lista de cada modelo, para buscar (“lyria”; “seed”, “elevenlabs”, “gemini”) y ordenar por **Sugeridos**, **Más reciente** o **Más barato** (las voces, por lo que cuesta aproximadamente un minuto de habla); la fila de un modelo elegido tiene **⋯ → Dejar que la app elija** para volver a la elección de la app. Cuando el modelo de voz que elegiste solo lee palabras en voz alta, un efecto de sonido o una voz copiada se crea con la elección de la app que sí pueda, y el formulario lo indica.

Los modelos de voz se venden sobre todo por carácter leído, Seed Audio por segundo de sonido que crea y Lyria por canción. Cada uno se paga con tu clave de OpenRouter, y ves su precio en un formulario antes de que se cree nada.

## Comprueba la configuración antes de crear nada

Antes de que un agente cree una imagen, un dibujo detallado, un video o un sonido, aparece en la conversación un formulario corto con los ajustes que admite ese modelo y lo que cuesta el resultado, rellenado con lo que pediste y con los valores predeterminados de la app:

- para una imagen: **Forma** (cuadrada, ancha, alta…, todas las que admita el modelo), **Resolución** (1K, 2K, 4K…), **Calidad**, **Cuántas imágenes** (para los modelos que crean varias a la vez) y **Fondo transparente** (para un logotipo o un icono);
- para un dibujo detallado (con el modelo vectorial de Recraft): su **Forma**;
- para un video: **Duración del video** (las duraciones que crea el modelo, o **Duración, en segundos**), **Forma**, **Resolución** y **Sonido**;
- para un sonido: en el caso de una canción, **Instrumental, sin cantar** y, con un modelo que crea canciones largas, **Duración, en segundos** (déjalo vacío para que la canción dure lo que necesite); en el caso de un efecto de sonido, su **Duración, en segundos** (Seed Audio se paga por segundo); en el caso de la voz hablada, la **Voz** (para un modelo con voces propias); y el **Archivo** (**MP3, más pequeño** o **WAV, sin comprimir**), cuando el modelo crea ambos.

Encima de los campos aparecen el nombre del modelo, su precio (“unos 0,08 US$ por imagen”, “de 0,03 a 0,08 US$ por segundo, según la resolución y el sonido”, “0,08 US$ por canción”, “0,0025 US$ por segundo de sonido”; para un video o un sonido, lo que resulta con los ajustes mostrados) y lo que el agente va a pedir, completo y con sus propias palabras. Cambia lo que quieras y haz clic en **Crearla**; **Ahora no** cierra el formulario, y no se crea ni se gasta nada. El formulario muestra solo los ajustes que ofrece el modelo.

El formulario aparece una vez por modelo en cada sesión: las imágenes, los videos y los sonidos posteriores de esa sesión usan los ajustes que elegiste (en un sonido, su voz y su archivo), a menos que pidas otros (“ahora una alta”). Di “muéstrame los ajustes otra vez” para que aparezca el formulario, o “adelante, elige por mí” para que el agente la cree sin él. Las tareas programadas y las ejecuciones de las apps crean las suyas sin formulario, con los valores predeterminados de la app, ya que no hay nadie que responda.

## Cuando un agente necesita la clave de OpenRouter

Las imágenes, los dibujos detallados, los videos, la música y las voces los crean modelos a través de OpenRouter, y se pagan con tu clave de OpenRouter. Cuando un agente va a crear una de estas cosas y no hay ninguna clave configurada, primero aparece en la conversación una tarjeta, **Esto necesita una clave de OpenRouter**, que indica qué modelo la crearía, cuánto cuesta aproximadamente y que le pagas a OpenRouter por lo que se crea, con un campo para la clave:

- Pégala y haz clic en **Guardar la clave** (o pulsa Enter). OpenRouter la comprueba primero; va directamente a [Configuración → Agentes → Modelos → OpenRouter](/settings?s=models&find=OpenRouter), nunca a la conversación, y el agente continúa (con el formulario de ajustes, como siempre). Entonces la tarjeta dice “Tu clave de OpenRouter está guardada en Configuración → Modelos.”
- **Obtener una clave** abre la página de OpenRouter donde puedes crear una.
- **Omitir**: ese modelo no se ejecuta, no se crea ni se gasta nada, y el agente continúa sin él, de otra manera cuando no haga falta ninguna clave (un dibujo sencillo que él mismo escribe, las [herramientas de imágenes de esta computadora](/guide/library#the-picture-tools-on-this-computer)), o sin nada. La sesión no vuelve a preguntar durante seis horas.

La tarjeta espera hasta nueve minutos; después el agente continúa sin la clave y se entera de ella si la añades más tarde. Las tareas programadas y las ejecuciones de las apps no reciben ninguna tarjeta, ya que no hay nadie que responda: indican que falta la clave (“Las imágenes necesitan una clave de OpenRouter”, con **Añadir una clave de OpenRouter**). Las herramientas de IA propias de los editores piden la clave en su cuadro de diálogo ([Crear imágenes, dibujos, gráficos y videos con IA](/guide/library#make-pictures-drawings-plots-and-videos-with-ai)).

## Pide una imagen o que se cambie una

Describe lo que quieres: el tema, el entorno, el estilo (una foto, una ilustración, una acuarela), los colores, la luz y las palabras que deban aparecer en ella. El agente también puede:

- **cambiar o combinar tus imágenes**: archivos de imagen de esta computadora (PNG, JPEG, WebP o GIF, de hasta 20 MB cada uno; la mayoría de los modelos admiten hasta 4, algunos más), en la carpeta de la sesión o por su ruta, o las imágenes que ya están en una presentación, un documento o una página que conservaste; di qué cambiar. (Una imagen adjunta a un mensaje llega al modelo para que la mire; para que el modelo de imágenes trabaje a partir de ella, tiene que ser un archivo: súbela en la página Archivos.) Esto necesita un modelo con la etiqueta **Ediciones**; con otro, se le indica al agente que describa el cambio con palabras o que te pida elegir un modelo que edite imágenes;
- **usar el modelo Rápido o el Mejor**: el agente usa el Rápido para imágenes simples (un fondo, una textura, un icono) y el Mejor para escenas, fotos, palabras dentro de una imagen, diagramas y todos los cambios, o lo decide según lo que pidas; dilo para que use el otro (“una rápida está bien”, “usa el modelo Mejor”);
- **hacer transparente el fondo** (un logotipo, un icono): un modelo que no puede hacerlo se lo pasa a uno que sí, o, con las [herramientas de imágenes](/guide/library#the-picture-tools-on-this-computer) configuradas, la imagen se crea sobre un fondo liso y se le quita el fondo en esta computadora;
- **usar otro modelo** para una imagen, cuando lo nombras (“créala con FLUX 2 Pro”), sin cambiar la Configuración.

Las imágenes se guardan en una carpeta **imágenes** dentro de la carpeta de la sesión, con un nombre basado en lo que muestran, y nunca sobrescriben un archivo que ya exista.

En la conversación:

- Mientras el modelo trabaja, un marcador de posición con la forma pedida dice “Creando una imagen” junto con el tiempo transcurrido, y la descripción debajo.
- Después las imágenes aparecen con la respuesta, con la descripción y el nombre del modelo debajo, y **Conservar** (consulta [Conservar lo que ha creado un agente](#keep-what-an-agent-made)). Haz clic en una para verla en grande: haz clic otra vez para verla a tamaño completo, las flechas (o las teclas de flecha) permiten pasar de una a otra cuando hay varias, **Abrir en una pestaña nueva** la abre sola, **Editar** la abre en el editor de imágenes (lo que guardes allí se conserva como una imagen nueva: [Editar imágenes y videos](/guide/library#edit-pictures-and-videos)), y Escape la cierra. Sobre cada imagen, **Mostrar en los archivos**, **Descargar** y **Más** (⋯: **Empezar una sesión con él**, **Añadir a un proyecto**, **Copiar ruta** y, en la app de escritorio, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**) aparecen al señalarla (en un teléfono siempre están visibles); cuando hay varias imágenes, también está **Conservar**.
- Si no hay ninguna clave de OpenRouter configurada, primero una tarjeta te pide una ([Cuando un agente necesita la clave de OpenRouter](#when-an-agent-needs-the-openrouter-key)); en una ejecución que nadie vigila (la de una tarea programada o la de una app) verás en su lugar “Las imágenes necesitan una clave de OpenRouter”, con **Añadir una clave de OpenRouter**. Cuando no se crea nada (omitiste la clave, cerraste el formulario o el modelo se negó), verás “Ninguna imagen esta vez” con el motivo.

## Pide un dibujo o un gráfico

Algunas imágenes salen mejor dibujadas a partir de formas o calculadas a partir de números que pintadas por un modelo de imágenes:

- **Un dibujo** (un SVG: formas en lugar de píxeles, nítido a cualquier tamaño): un icono, un logotipo, un diagrama, un patrón que se repite, una forma o una ilustración plana, con los colores que indiques (los de una presentación o de un documento, por ejemplo). Uno sencillo lo escribe el [modelo auxiliar](/settings?s=models&find=Helper%20model) (en Automático, Claude cuando has iniciado sesión en Claude Code), sin ningún modelo de imágenes que pagar, en menos de un minuto; uno detallado (una ilustración, o cuando pides lo mejor) lo dibuja el modelo vectorial de Recraft a través de OpenRouter, por unos 0,08 US$ el dibujo, después del formulario con su precio. Los scripts, los enlaces y todo lo que un dibujo cargaría desde otro sitio se eliminan de cada dibujo antes de conservarlo.
- **Un gráfico** de tus datos o de matemáticas, para lo que el gráfico de una diapositiva no puede dibujar: diagramas de dispersión, histogramas, diagramas de caja, barras de error, varios ejes o paneles, mapas de calor, funciones, ajustes y notas sobre los puntos importantes. El modelo auxiliar lo escribe en Python con matplotlib, se ejecuta en esta computadora, y lo que sale mal vuelve a él para que lo corrija (hasta tres intentos); tarda alrededor de medio minuto y cuesta solo esa respuesta. Da los números en tu mensaje o como archivo (CSV, TSV o JSON, de hasta 20 MB), e indica la idea que debe transmitir (“muestra que la primavera se duplicó”). Llega como un dibujo (SVG; un PNG cuando hay muchísimos puntos), de 960 por 540 píxeles a menos que pidas otro tamaño, con su código Python al lado, de modo que “ahora con escala logarítmica” cambia ese gráfico; para una presentación web también puede llegar como un gráfico que se mueve y responde al puntero. Necesita Python con matplotlib en la computadora donde se ejecuta la app: el propio de las herramientas de imágenes una vez configuradas ([Las herramientas de imágenes de esta computadora](/guide/library#the-picture-tools-on-this-computer)), o uno que ya esté instalado.

Ambos se guardan en la carpeta **imágenes** dentro de la carpeta de la sesión y aparecen con la respuesta como las imágenes; mientras se crea uno, su marcador de posición dice “Creando un dibujo” o “Dibujando el gráfico”.

## Encuentra fotos gratuitas

Pide fotos en lugar de imágenes creadas por un modelo (“busca dos fotos de los tranvías de Lisboa para mi diapositiva de título”), y el agente busca fotos con licencia abierta, gratuitas para usar y modificar, también con fines comerciales: el catálogo de Openverse (Flickr, Wikimedia Commons, museos y más), o la búsqueda propia de Wikimedia Commons cuando Openverse no puede responder. Guarda unas cuantas de las mejores (4 si no indicas otra cantidad, 10 como máximo) en la carpeta **imágenes** de la sesión, con el crédito de cada una (su título, autor, licencia y enlace) en un archivo al lado, las mira antes de usar una, y las acredita como lo exige su licencia: en las notas del orador de la diapositiva, o debajo de la imagen en un documento o una página, y, para las licencias distintas de CC0 y el dominio público, en un pequeño pie junto a la foto (“Foto: “Título” de Autor, CC BY 2.0”). Es gratis y tarda unos segundos; mientras busca, el marcador de posición dice “Buscando fotos gratuitas”.

## Recortar, borrar y editar

Los agentes también modifican tus imágenes y videos sin necesidad de volver a crearlos:

- **Quitar el fondo** de una imagen: su sujeto (una persona, un producto, un animal, un logotipo) sobre un fondo transparente, como PNG. En esta computadora, una vez configuradas las [herramientas de imágenes](/guide/library#the-picture-tools-on-this-computer), es gratis y privado, conserva los píxeles originales del sujeto y tarda unos segundos; si un recorte queda mal, un modelo de imágenes lo vuelve a hacer. Sin ellas, lo hace un modelo de imágenes a través de OpenRouter (unos 0,01 a 0,04 $), que dibuja de nuevo la imagen sin su fondo, así que algunos detalles pueden cambiar.
- **Borrar algo** de una imagen (una persona al fondo, un letrero, una marca de agua, una mancha, un cable): se elimina y el hueco se rellena continuando lo que lo rodea. El agente marca dónde está, o lo describe para que un modelo de imágenes lo encuentre. Las zonas pequeñas se borran gratis en esta computadora; las grandes, las que cruzan la imagen y las que están entre cosas con mucho detalle, como texto, pasan a un modelo de imágenes (unos 0,01 a 0,04 $).
- **Agrandar una imagen**: el doble o el cuádruple de tamaño por cada lado, con el detalle dibujado con nitidez en lugar de borroso (una foto pequeña para imprimir o para una diapositiva, una imagen antigua). Gratis y privado, en esta computadora una vez configuradas las [herramientas de imágenes](/guide/library#the-picture-tools-on-this-computer) (la primera vez descarga su modelo, de unos 5 MB); una imagen grande tarda uno o dos minutos.
- **Editar una imagen**: recortarla, girarla o voltearla, cambiar su tamaño, modificar su luz y sus colores (exposición, contraste, calidez y demás, o curvas, niveles, el tono y la saturación de un color, balance de color, claridad, eliminación de neblina, reducción de ruido, grano, o todo a la vez con Mejora automática), aplicarle un filtro (**Vintage**, **Blanco y negro**…), escribir texto encima, dibujar flechas y recuadros, y difuminar o pixelar partes (un rostro, una placa de matrícula, un nombre). Gratis, en esta computadora; una imagen JPEG, WebP o GIF, o el texto sobre una, necesita ffmpeg o las herramientas de imágenes.
- **Editar un video**: recortarlo, cortarle partes, ajustarlo a una forma (16:9, 9:16, cuadrado, 4:5), girarlo o reflejarlo, acelerarlo o ralentizarlo (o reproducirlo al revés, estabilizado), unir varios clips e imágenes con transiciones (disoluciones, fundidos a negro, cortinillas, deslizamientos), aplicar a una imagen un zoom lento, colorearlo (exposición, calidez, contraste, un aspecto como cinematográfico o blanco y negro, una viñeta, grano), hacer que aparezca y desaparezca con un fundido, quitarle el sonido o cambiar su volumen, elegir qué canales se escuchan (un micrófono de solapa en un lado que se oye en ambos), silenciar partes del sonido, dar a la música una línea de volumen, poner encima un logotipo, una marca de agua o una pantalla verde, escribirle texto (títulos, subtítulos, o subtítulos generados a partir de lo que se dice, con un .srt al lado) y colocar debajo música y una narración, con las voces limpias, la música baja bajo el habla y el volumen general igualado; o crear un GIF a partir de él, o tomar un fotograma como imagen. Gratis, con ffmpeg en esta computadora (las herramientas de imágenes traen uno), en la tarjeta gráfica cuando hay una, mientras **Permitir que los agentes creen videos** esté activado.
- **Editar un sonido** (un archivo de sonido, el sonido de un video o un sonido que conservaste): quedarte con una parte, cortar partes o silenciarlas, acortar pausas largas, eliminar muletillas ("eh", "mm": con reconocimiento de voz en esta computadora, consulta [Reconocimiento de voz en el servidor](#speech-recognition-on-the-server)), reproducirlo más rápido o más lento manteniendo su tono, cambiar su tono, subir o bajar el volumen o aplicar un fundido, fijar su pico máximo o su volumen percibido (pódcast, streaming, transmisión), reducir el ruido, cambiar su timbre (una voz más clara, un teléfono, una radio), comprimirlo o limitarlo, añadir eco o reverberación, invertirlo o pasarlo a mono, y mezclar otros sonidos encima en un punto concreto (música bajo una voz, un efecto de sonido). Gratis, con ffmpeg en esta computadora, mientras **Permitir que los agentes creen audio** esté activado.

Cada una trabaja a partir de un archivo de la carpeta de la sesión, o de una imagen o un video que ya estén en una presentación, un documento o una página, y guarda lo que crea en la carpeta **imágenes** de la sesión (un video editado en **videos**, un sonido editado en **audio**), nunca sobre el original. Una imagen o un sonido que conservaste también se puede editar, y volver a ponerse en su lugar o junto a él como uno nuevo, tal como hacen **Guardar** y **Guardar una copia** de los editores («aclara la foto del puerto que conservé», «haz que mi sonido “Entrevista” suene tan fuerte como un pódcast»). Aparece con la respuesta igual que una imagen creada por el agente, con un marcador que dice “Quitando el fondo”, “Borrando”, “Agrandando”, “Editando la imagen”, “Editando el video” o “Editando el sonido” mientras trabaja. En un recorte o un borrado, la respuesta indica de qué manera se hizo y por qué: si no queda bien, di «hazlo con IA» y el agente se lo pedirá al modelo de imágenes. Para hacerlo tú mismo, abre la imagen, el video o el sonido en su editor ([Editar imágenes y videos](/guide/library#edit-pictures-and-videos), [El editor de sonido](/guide/library#the-sound-editor)).

## Pedir un video

Describe la escena, qué se mueve y cómo, la cámara («un acercamiento lento», «sigue al ciclista»), el estilo y la luz, y cualquier sonido o palabras que se digan. El agente también puede:

- **partir de una imagen**: un archivo de imagen que sea el primer fotograma del video («haz que esta foto cobre vida»), y en algunos modelos otro con el que termine, para los modelos con la etiqueta **A partir de una imagen**;
- **seguir imágenes**: hasta 4 imágenes de un personaje, un producto o un estilo que el video debe respetar, sin que sean sus fotogramas;
- **modificar un video**: un archivo de video (MP4, WebM o MOV, de hasta 40 MB) para que lo edite, lo alargue o lo mejore un modelo con la etiqueta **Edita videos**.

Un video tarda desde menos de un minuto hasta varios. El agente lo espera unos nueve minutos como máximo; cuando tarda más, la app sigue esperándolo y lo guarda cuando está listo, y el agente lo muestra cuando vuelve a comprobarlo. Esperar no cuesta nada más.

Los videos se guardan en una carpeta **videos** dentro de la carpeta de la sesión, con el nombre de lo que muestran.

En la conversación:

- Mientras el modelo trabaja, un marcador con la forma del video dice “Creando un video” junto con el tiempo transcurrido.
- Después el video aparece con la respuesta, listo para reproducirse (también a pantalla completa, desde sus controles), con la descripción y el nombre del modelo debajo, y **Conservar**. Encima, al pasar el cursor, aparecen **Editar** (el editor de video: lo que guardes se conserva), **Mostrar en los archivos**, **Descargar** y **Más** (⋯: lo mismo que debajo de una imagen, con **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** en la app de escritorio).
- “Todavía en proceso” significa que el agente dejó de esperar antes de que el video estuviera listo: aparecerá cuando el agente vuelva a comprobarlo (pídeselo, si no lo hace). “Ningún video esta vez” explica el motivo: cerraste el formulario, o el modelo lo rechazó (sus palabras dicen por qué).

## Pedir música, una voz o un sonido

Dile al agente lo que quieres escuchar:

- **Música**: el género y el ambiente, los instrumentos, el tempo, la voz que canta y cómo lo hace («una canción synth-pop animada de 2 minutos sobre las mañanas de lunes, con una mujer cantando y un estribillo pegadizo»). Da tu propia letra, o deja que el modelo la escriba; pide una versión instrumental cuando no quieras canto. Lyria 3 Clip siempre crea 30 segundos; Lyria 3 Pro crea hasta unos 3 minutos, según lo que pidas. Una canción tarda uno o dos minutos.
- **Una narración**: las palabras que se dirán, exactas, y cómo deben sonar («lee esto con voz calmada y grave, despacio»). Con un modelo que tiene voces propias, eliges una en el formulario; Seed Audio crea la voz que describas. También funciona una conversación entre varios hablantes («una breve introducción de pódcast con dos presentadores»), con modelos que les dan voz.
- **Una voz copiada de una grabación**: dale al agente de 1 a 3 grabaciones de la voz, archivos en esta computadora (WAV, MP3, M4A, OGG o FLAC, de hasta 30 MB cada uno; se usan los primeros 30 segundos de cada uno), para un modelo que **Copia voces** (Seed Audio). Usa solo una voz que puedas usar: la tuya, o una cuyo dueño haya dado su permiso. Con ffmpeg en la computadora sirve cualquiera de esos archivos; sin él, solo WAV y MP3.
- **Un efecto de sonido o ambiente**: qué es, qué ocurre y cuándo («lluvia fuerte sobre un techo de zinc, un trueno que se acerca al final, sin voces»), y cuánto dura.
- **Otro modelo** para un solo sonido, cuando lo nombras («léelo con ElevenLabs v3»), sin cambiar la Configuración.

Los sonidos se guardan en una carpeta **audio** dentro de la carpeta de la sesión, con el nombre de lo que son, como MP3 (o WAV, cuando lo pides).

En la conversación:

- Mientras el modelo trabaja, una tarjeta dice “Creando música”, “Creando una narración” o “Creando un sonido”, con el tiempo transcurrido.
- Después el sonido aparece con la respuesta, en un reproductor: el botón redondo lo reproduce y lo pausa (solo suena un sonido a la vez), su forma es la barra para desplazarte (haz clic o arrastra), y luego el tiempo y la velocidad (**1×**, **1.25×**, **1.5×**, **2×** o **0.75×**). Mientras el reproductor tiene el foco, Espacio o K reproduce y pausa, y ← → avanzan o retroceden 5 segundos. Su título viene del nombre del archivo, con **Editar** (el [editor de sonido](/guide/library#the-sound-editor): lo que guardes se conserva), **Mostrar en los archivos**, **Descargar** y **Más** (⋯: lo mismo que debajo de una imagen, con **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** en la app de escritorio) a su lado. Debajo están las palabras con las que se creó, el nombre del modelo y **Conservar** (consulta [Conservar lo que creó un agente](#keep-what-an-agent-made)); la **Letra** de una canción se abre debajo.
- Sin una clave de OpenRouter ves “El audio necesita una clave de OpenRouter”, con **Añadir una clave de OpenRouter**. “Ningún sonido esta vez” explica el motivo: cerraste el formulario, o el modelo lo rechazó (sus palabras dicen por qué).

El agente no puede oír lo que creó: conoce el sonido por lo que pidió. Si no suena bien, di qué cambiar y creará otro; o hazlo editar («aplica un fundido a los dos últimos segundos del jingle», «ponlo debajo de mi narración en 0:05»), por el agente o en el editor de sonido.

## Imágenes en lo que crean los agentes

Cuando un agente crea o modifica diapositivas, un documento o una página para ti, los ilustra por su cuenta donde una imagen aporta algo (una diapositiva de título, una sección, una idea; no todas las diapositivas), con sus colores y su estilo, como lo haría un diseñador: una imagen Rápida para un fondo, una textura o un icono, una Mejor para una escena, una foto o un diagrama, un dibujo para un icono, un logotipo o un diagrama que debe mantenerse nítido, un gráfico para los números, fotos gratuitas de lugares y cosas reales, y sus imágenes recortadas, borradas o editadas para que encajen. Trabaja tanto con las imágenes que ya están en lo que tienes abierto como con archivos y, si se lo pides, escribe una descripción para cada imagen de una presentación que no tenga ninguna, para quienes no pueden verlas (lo hace el modelo que describe las imágenes que conservas). Lo que cuesta dinero se muestra con su precio en el formulario antes de crearse ([Revisar la configuración antes de crear algo](#check-the-settings-before-anything-is-made)); di «sin imágenes», o «solo fotos gratuitas», cuando lo quieras de otra manera.

Cuando pides por su nombre un tipo de cosa conocido (una diapositiva FODA, una presentación para inversores, una carta de presentación, un resumen ejecutivo, un seguimiento de hábitos, una tabla de precios, un presupuesto), el agente primero lee cómo la app hace bien ese tipo: qué lleva, en qué orden, qué aspecto tiene y dónde ayudan las imágenes, tal como se crean los tipos de la galería ([Creado con IA a partir de un tipo](/guide/library#made-with-ai-from-a-kind)). Eso no cuesta nada.

En una [sesión confidencial](/guide/sessions#keep-a-session-confidential) nada de esto está disponible: su agente no crea, busca ni edita imágenes ni videos.

## Conservar lo que creó un agente

**Conservar**, debajo de una imagen, un video o un sonido creado por un agente, guarda una copia en los archivos de un proyecto, donde un modelo escribe un título y una descripción (para un sonido, a partir de las palabras con las que se creó, ya que ningún modelo puede oírlo; el modelo se elige en [Configuración → Capacidades → Imágenes, video y audio → Títulos de lo que conservas](/settings?s=images&find=Captions%20for%20what%20you%20keep)), y donde permanece después de que se limpie la carpeta de la sesión. Cuando tienes proyectos, un breve menú pregunta adónde va (**Guardarla en**): primero el proyecto propio de la sesión, luego tus otros proyectos, y **Sin proyecto**, que la conserva con la conversación, donde la encuentra el cuadro de búsqueda (Ctrl+K). Un proyecto cuya carpeta tiene carpetas te deja elegir una (**Elegir una carpeta dentro**). En un proyecto, lo que conservas es además un archivo en su carpeta; un archivo que ya estaba en esa carpeta se usa tal cual, sin copia (consulta [Lo que conservas también son archivos](/guide/files-git#kept-things-are-files-too)). El botón pasa entonces a decir **Conservada** y la abre. Una imagen que conservaste aparece entre los archivos de su proyecto (los detalles del proyecto → **Archivos**, como un mosaico con su imagen), y en el editor, **Conservar** guarda una imagen editada como una nueva, mientras que **Guardar** la devuelve a donde estaba y **Guardar una copia** conserva otra a su lado.

## Sugerencias de palabras mientras escribes

Mientras escribes, Hydor puede mostrar en gris, después del cursor, el resto de la palabra que estás escribiendo, y la palabra siguiente con un gris aún más tenue. Lo hace en el cuadro de mensaje, en documentos, en notas y en otros cuadros de texto, en el idioma en que escribas.

- **Tab** acepta la palabra en gris. Púlsala otra vez para aceptar la siguiente.
- **→** (la flecha derecha), con el cursor al final del texto, acepta las dos palabras a la vez.
- **Esc** las oculta hasta la próxima palabra. Si sigues escribiendo, desaparecen solas; si escribes las letras que muestran, se quedan, más cortas. Una sugerencia que llega mientras todavía estás escribiendo muestra lo que queda de ella, si las letras que escribiste entretanto coinciden con las suyas.
- En el cuadro de mensaje, un menú `@` o `/` abierto se queda con Tab y Esc, y **Shift+Tab** sigue cambiando el modo de permisos. Cuando no se muestra nada en gris, cada tecla hace lo de siempre.

Nada de lo que escribes sale de tu computadora: las predicciones las hacen modelos que se ejecutan en ella. Está activado desde el principio y se configura solo la primera vez que escribes.

### La primera vez y cómo desactivarlo

Las sugerencias de palabras vienen activadas, pero no se descarga nada hasta que las usas: la primera vez que escribes en un cuadro de mensaje o en un documento, instalan y descargan lo que necesitan, unos 1,2 GB en total: las bibliotecas de Python en las que funcionan (desde PyPI), llama.cpp (desde GitHub), el modelo de lenguaje y el modelo pequeño (desde Hugging Face). Hasta entonces, **[Configuración → Capacidades → Sugerencias de palabras](/settings?s=suggest)** dice **Aún no está configurado** bajo el interruptor; mientras se configuran, la línea de ahí indica cuánto falta, y después no se vuelve a descargar nada. Cuando una actualización de la app trae una versión nueva del modelo pequeño, solo se descargan los archivos que cambiaron y la copia anterior se elimina cuando ninguna copia de la app la ha usado durante una semana. Cuando dice **Listo: las sugerencias aparecen mientras escribes**, ya funcionan; la primera sugerencia tras una pausa larga tarda un poco más mientras se cargan los modelos, porque se liberan de nuevo tras un tiempo sin escribir. Todo se ejecuta en el procesador, así que no hace falta tarjeta gráfica.

Si prefieres no usarlas, desactiva ahí **[Sugerencias de palabras](/settings?s=suggest&find=Word%20suggestions)**: se detienen, y si las desactivas antes de la primera vez, no descargan nada en absoluto; lo que se descargó se conserva. Si la configuración falla (por ejemplo, sin conexión a internet), la línea dice por qué, y lo vuelven a intentar más tarde, esperando más tras cada fallo; si desactivas el interruptor y lo vuelves a activar, lo intenta de inmediato.

### Los dos modelos y la memoria que necesitan

Dos modelos trabajan juntos, ambos en tu computadora:

- **El modelo pequeño** es uno propio de la app, lo bastante pequeño para funcionar en cualquier computadora y entrenado con texto en 200 idiomas. También aprende de lo que escribes ([más abajo](#learn-from-what-you-write)).
- **El modelo de lenguaje** es Qwen3.5-0.8B, un modelo más grande que acierta más, sobre todo en documentos. Necesita una computadora con al menos 8 GB de memoria y 2,5 GB de ella libres en ese momento.

**[Modelo de lenguaje](/settings?s=suggest&find=Language%20model)** tiene tres opciones. **Automático** lo usa cuando la computadora tiene la memoria, y solo el modelo pequeño cuando no la tiene; la línea bajo el interruptor indica qué ocurre y por qué. **Activado** lo usa incluso entonces (puede ralentizar la computadora). **Desactivado** no lo usa nunca. Sin él, las sugerencias siguen funcionando, un poco peor. **[Tamaño del modelo de lenguaje](/settings?s=suggest&find=Language%20model%20size)** permite elegir **8-bit**, que acierta un poco más, o **4-bit**, que ocupa menos memoria y requiere una descarga menor (unos 560 MB en lugar de 830 MB).

Cambiar el tamaño descarga el otro archivo la primera vez. **[Elegir según el idioma](/settings?s=suggest&find=Choose%20by%20language)**, activado por defecto, permite que la app use el modelo que rinda mejor en el idioma en que te ve escribir.

### Dónde se muestra

En **Dónde**, dentro de la misma sección, cada lugar tiene su interruptor:

- **[En los cuadros de mensaje](/settings?s=suggest&find=In%20message%20boxes)**: donde escribes a un agente, en la página de inicio y en una conversación.
- **[En documentos](/settings?s=suggest&find=In%20documents)**: mientras escribes un documento. La opción “Sugerir mientras escribo” del menú **Ver** de los documentos, que le pregunta al modelo auxiliar cómo podría seguir una frase, espera mientras se muestra una sugerencia de palabra.
- **[En notas](/settings?s=suggest&find=In%20notes)**: notas de memoria y tu perfil.
- **[En otros cuadros de texto](/settings?s=suggest&find=In%20other%20text%20boxes)**: seguimientos, la cola, un prompt anterior que editas, los paneles de Preguntar y otros cuadros pequeños.

Estos ajustes se definen una sola vez para toda la app. **[Mostrar en este navegador](/settings?s=suggest&find=Show%20in%20this%20browser)** es la excepción: se guarda en cada navegador, así que puedes desactivar las palabras en gris en un dispositivo y mantenerlas en otro. Un agente también puede cambiarlo para los navegadores que muestran su sesión.

### Qué tan segura debe estar

Cada predicción tiene una probabilidad de ser correcta, y solo se muestra cuando esa probabilidad es lo bastante alta. **[Seguridad antes de mostrar](/settings?s=suggest&find=How%20sure%20before%20showing)** fija el umbral: **Más** (la opción predeterminada) muestra más predicciones, y más de ellas son erróneas; **Equilibrado** es el punto medio, con el objetivo de unas cuatro predicciones correctas de cada diez mostradas; **Más segura** muestra menos, y más de ellas son correctas. Un agente también puede subir el umbral aún más, para mostrar solo las más seguras. **[Mostrar la palabra siguiente](/settings?s=suggest&find=Show%20the%20next%20word)** desactiva la segunda palabra, más tenue, de modo que solo se muestre el resto de la palabra que estás escribiendo.

El umbral con el que empieza la app se midió con textos de otras personas, así que después se ajusta a los tuyos. Cada sugerencia, se muestre o no, se compara con la palabra que acabas escribiendo, y solo se guarda un recuento: qué tan seguro estaba el modelo y si acertó, nunca el texto. No se cuenta una palabra que dejas sin terminar, o que corriges con Backspace antes de que se mostrara la sugerencia. Cuando se han evaluado 400 sugerencias de un tipo (de los dos modelos juntos, del modelo de lenguaje solo o del modelo pequeño solo), ese tipo recibe un umbral propio, fijado para que la proporción de aciertos entre las mostradas sea la que elegiste, y nunca inferior a un tercio del umbral de la app ni superior a una vez y media ese umbral. Lo que escribiste hace poco cuenta más que lo que escribiste hace mucho. Debajo de la opción, una línea indica cuánto falta, **Aprendiendo de tu forma de escribir (120 de 400)**, y cuando termina, **El nivel de seguridad que se le exige está ajustado a tu forma de escribir (900 respuestas evaluadas).** El recuento vuelve a empezar cuando la app trae una versión nueva del modelo pequeño, cuando se crea el primer modelo a partir de lo que escribes y cuando [restableces las cifras](#how-much-it-helps).

### Qué lee

Para predecir, lee las palabras que escribiste antes del cursor y aquello a lo que estás respondiendo: la última respuesta del agente en un mensaje, o el texto que hay encima del párrafo en un documento.

- **[Palabras de lo que escribiste](/settings?s=suggest&find=Words%20of%20what%20you%20typed)**: cuántas de tus últimas palabras lee, de 20 a 200 (100 al principio). Cuantas más, más lento.
- **[Palabras de la respuesta o del documento](/settings?s=suggest&find=Words%20of%20the%20reply%20or%20document)**: cuántas palabras de la respuesta o del documento lee, de 0 a 200; con 0 no lee ninguna.
- **[Aprender de la conversación](/settings?s=suggest&find=Learn%20from%20the%20conversation)**: recoge las palabras y los nombres usados antes en la conversación mientras escribes un mensaje. Es independiente del aprendizaje descrito más abajo.
- **[Threads](/settings?s=suggest&find=Threads)**: cuántos hilos del procesador usan las sugerencias. **Automático** lo elige según los núcleos de la computadora.

### Aprender de lo que escribes

Por defecto, el modelo pequeño también aprende tus propias palabras: los nombres, los términos y la forma de escribir que usas, para que sus predicciones se ajusten a ti. Esto ocurre en tu computadora, y lo que escribiste nunca sale de ella. El modelo aprendido se guarda en la carpeta de datos de la app y no se comparte con nadie. Cada ejecución de aprendizaje empieza de nuevo desde el modelo pequeño que venía con la app y aprende de todo lo que has escrito (de su parte más reciente, si has escrito muchísimo), así que lo aprendido nunca se desvía de una ejecución a la siguiente. El modelo que aprendió de ti sugiere en los idiomas en los que escribes; en los demás idiomas lo hace el que venía con la app.

- **[Aprender de lo que escribo](/settings?s=suggest&find=Learn%20from%20what%20I%20write)** lo activa o lo desactiva.
- Aprende de las fuentes que dejes activadas: **[De mis mensajes](/settings?s=suggest&find=From%20my%20messages)** (lo que escribiste a los agentes, pero no en sesiones con la memoria desactivada ni en [sesiones confidenciales](/guide/sessions#keep-a-session-confidential), ni lo que las apps, las tareas programadas u otras sesiones escribieron por ti), **[De las respuestas de los agentes](/settings?s=suggest&find=From%20agents'%20replies)**, **[De mis notas](/settings?s=suggest&find=From%20my%20notes)** (las notas de memoria que escribiste tú) y **[De mis documentos](/settings?s=suggest&find=From%20my%20documents)** (las páginas y los documentos que escribiste). Desactiva las respuestas de los agentes, por ejemplo, para que sus predicciones sigan solo tu propio estilo.
- **[Peso de mis propias palabras](/settings?s=suggest&find=Weight%20of%20my%20own%20words)** indica cuánto más cuenta lo que escribiste tú que el resto, de 1 (igual) a 16; 4 al principio.
- **[Cuándo aprende](/settings?s=suggest&find=When%20it%20learns)**: **Cada noche** (aproximadamente una vez al día, cuando llevas diez minutos sin escribir y la computadora tiene la memoria), **Cada semana** o **Solo cuando lo pida**. Se ejecuta en segundo plano con la prioridad más baja, así que tu trabajo no se ralentiza, y retoma donde lo dejó si se apaga la computadora. Cada ejecución empieza desde el modelo pequeño que venía con la app y aprende de todo lo que has escrito, de su parte más reciente (más o menos los últimos tres millones de palabras, años de escritura), así que nunca se desvía; si no has escrito nada desde la última, la ejecución se omite, salvo cuando una actualización trae un modelo pequeño nuevo: la siguiente ejecución vuelve a aprender de él aunque no hayas escrito nada nuevo. En una computadora sin tarjeta gráfica una ejecución puede tardar horas. La primera vez que aprende en el procesador, la app también descarga la versión de PyTorch para el procesador (unos 200 MB) en su propia carpeta de Python, y el proceso espera a que termine; la línea bajo el interruptor lo indica. **[Hilos para el aprendizaje](/settings?s=suggest&find=Threads%20for%20learning)** limita el procesador que puede usar.
- **[Aprender con la tarjeta gráfica](/settings?s=suggest&find=Learn%20on%20the%20graphics%20card)** (activado de fábrica) deja que un proceso use la tarjeta gráfica de la computadora cuando hay una, muchas veces más rápido que el procesador: una tarjeta NVIDIA con al menos 4 GB libres y menos de la mitad ocupada, o un Mac con Apple silicon. Si tienes varias tarjetas, usa la que tenga más memoria libre y que ningún otro programa esté usando. Cuando un programa que ejecuta modelos, como vLLM u Ollama, está en todas las tarjetas, comparte una cuyo programa esté inactivo (menos de un 20 % ocupada, mirada tres veces con un segundo de separación) y deja 2 GB más libres junto a él; mientras esos programas trabajan, el proceso aprende en el procesador. La primera vez en una tarjeta NVIDIA, la app descarga PyTorch para ella, unos 2,5 GB, en su propia carpeta, y el proceso espera a que termine; la línea bajo el interruptor lo indica. Si la tarjeta no se puede preparar o falla en un proceso, ese proceso continúa de inmediato en el procesador y la tarjeta se deja en paz durante un día; el ajuste explica por qué. Desactívalo para aprender siempre en el procesador.
- **[Volver a entrenar ahora](/settings?s=suggest&find=Retrain%20now)** vuelve a aprender de inmediato de todo lo que has escrito, partiendo del modelo pequeño que venía con la app.
- **[Olvidar lo aprendido](/settings?s=suggest&find=Forget%20what%20it%20learned)** elimina el modelo creado con tus textos, después de que lo confirmes, y vuelve al que venía con la app. Vuelve a aprender en su próxima hora programada, a menos que hayas desactivado el aprendizaje.

La línea bajo el interruptor indica qué modelo pequeño se está usando, cuándo aprendió por última vez, cuánto lleva avanzado un proceso de aprendizaje y dónde aprende (**En la tarjeta gráfica: …** o **En el procesador**).

Mientras un proceso está en marcha, esa línea tiene **Pausar** y **Detener**. **Pausar** detiene el proceso donde está y conserva lo que ha aprendido hasta ahora; la línea dice entonces **En pausa al 45%**, con **Reanudar** y **Detener**, y nada lo vuelve a iniciar por sí solo, ni siquiera el calendario, hasta que pulses **Reanudar** (**Volver a entrenar ahora** hace lo mismo); esto vale también tras reiniciar la app. **Reanudar** continúa desde donde se detuvo, con los mismos textos que estaba leyendo. **Detener** pregunta antes, y luego descarta lo que este proceso aprendió hasta ahora (el modelo que usas ahora se queda), y el siguiente proceso espera su tiempo habitual. Desactivar el aprendizaje o usar **Olvidar lo aprendido** también termina un proceso en pausa.

### Cómo te ayuda

En **Cómo te está ayudando**, dentro de la misma sección, dos líneas muestran lo que han hecho por ti las sugerencias hasta ahora: las **pulsaciones ahorradas** (y qué parte de lo que escribes representan), y cuántas sugerencias fueron **acertadas** de las que se evaluaron, con cuántas aceptaste con Tab. Una sugerencia es correcta cuando la aceptaste (con Tab, o con → para dos palabras) o escribiste tú mismo la palabra gris completa; es errónea cuando escribiste otra cosa mientras se mostraba. Una que ocultaste con Esc, o que desapareció al hacer clic en otro sitio, enviar el mensaje o mover el cursor, no cuenta como ninguna de las dos. Cada Tab o → ahorra las letras que añade, menos la tecla que pulsaste.

**Mostrar los detalles** añade hoy, esta semana y el total desde que empezaron los números, y **[Restablecer los números](/settings?s=suggest&find=Reset%20the%20numbers)** los vuelve a poner en cero, después de que lo confirmes. Solo se guardan recuentos, nunca lo que escribiste. Al restablecerlas también vuelve a empezar el [ajuste de la seguridad necesaria](#how-sure-it-must-be).

## Dictar un mensaje

El micrófono del cuadro de mensaje (en la página de inicio y en cada sesión) convierte lo que dices en texto dentro de tu mensaje. No se envía nada por sí solo: lo revisas y lo envías como de costumbre.

1. Haz clic o toca el micrófono.
2. Habla. Un panel sobre el cuadro de mensaje muestra el tiempo, las palabras oídas hasta ahora (o, cuando el servidor reconoce la voz, “Grabando…” con barras que siguen tu voz) y el idioma que escucha.
3. Haz clic en **Hecho**, o en el micrófono otra vez. Las palabras se unen a lo que ya habías escrito (con el servidor, antes aparece un momento “Convirtiendo tus palabras en texto…”).

El selector de idioma del panel (“DE”, “PT-BR”) cambia el idioma mientras hablas; continúa en el nuevo. Cuando el servidor reconoce la voz, una grabación se detiene sola a los 10 minutos.

El micrófono solo aparece donde el dictado puede funcionar: cuando el navegador reconoce la voz por sí mismo (Chrome, Edge, Safari), o cuando lo hace el servidor (consulta [Reconocimiento de voz en el servidor](/guide/documents-voice#speech-recognition-on-the-server)). Cuando no puede iniciarse, dice por qué y qué hacer:

- **El micrófono necesita una conexión segura**: los navegadores lo permiten solo en una dirección HTTPS, o en localhost en la propia computadora. Abre Hydor a través de una dirección HTTPS (consulta [Teléfonos, otras máquinas y compartir](/guide/devices)).
- **El micrófono está bloqueado para este sitio**: permítelo en la configuración de sitios del navegador (en un iPhone: **aA** en la barra de direcciones, luego **Ajustes del sitio web → Micrófono**), y vuelve a intentarlo.
- **No se encontró ningún micrófono**, o **El micrófono está ocupado** (otra app lo usa).
- **El reconocimiento de voz está desactivado aquí**: en un iPhone, activa el dictado en Configuración → General → Teclado; o deja que el servidor reconozca la voz.
- **Este navegador no puede grabar**: usa una versión actual de Chrome, Edge, Firefox o Safari.

Cada una de estas notas tiene un botón **Configuración de voz**, que abre Configuración → Voz.

## Configurar la voz

Todo lo relacionado con la voz está en **[Configuración → Capacidades → Voz](/settings?s=voice)** (en un teléfono: Configuración y luego **Voz**). Tiene tres partes.

### Dictado

**[Dictado](/settings?s=voice&find=Dictation)** indica primero qué puede hacer este navegador:

- Un navegador que reconoce la voz por sí mismo muestra tus palabras mientras hablas. Puede que envíe tu voz a su fabricante para hacerlo (Chrome a Google, Safari a Apple). Para que tu voz se quede en tu máquina, activa whisper.cpp más abajo y elige el servidor.
- Un navegador que no puede reconocer la voz por sí mismo dicta a través del servidor, una vez que el reconocimiento de voz en el servidor está activado.

Después:

- **[Idioma que hablas](/settings?s=voice&find=Language%20you%20speak)**: **Igual que este navegador**, o uno de 56 idiomas y regiones. El dictado escucha en ese idioma, y el modo manos libres habla y escucha en él.
- **Reconocer con**: **Este navegador** (las palabras aparecen mientras hablas) o **El servidor** (privado con whisper.cpp; las palabras llegan cuando terminas). Solo aparece cuando ambos pueden hacerlo.

El idioma y **Reconocer con** se guardan en este navegador, así que cada uno de tus dispositivos tiene los suyos.

### Reconocimiento de voz en el servidor

**[Reconocimiento de voz en el servidor](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** sirve para los navegadores que no pueden reconocer la voz por sí mismos, o para que tu voz se quede en tu máquina. Está desactivado hasta que lo actives, y antes no se descarga nada. Se configura una sola vez para toda la app, en todos los dispositivos. En **Dónde se ejecuta**, elige una de las tres opciones:

- **Desactivado**.
- **En esta máquina**: whisper.cpp se ejecuta en la computadora que ejecuta Hydor, en su GPU cuando tiene una que whisper.cpp pueda usar (la de un Mac, o una GPU NVIDIA) y, si no, en su procesador, y tu voz se queda ahí.
  - **Modelo**: **Diminuto** (74 MB; el más rápido, de vez en cuando entiende mal una palabra), **Base** (141 MB; rápido y suficientemente bueno para la mayoría de los dictados, el predeterminado), **Pequeño** (465 MB; entiende mejor, unos segundos por frase en una CPU) o **Media** (1,4 GB; es el que mejor entiende, lento sin una CPU rápida).
  - **Idiomas**: **Cualquier idioma** (sigue el idioma que hablas) o **Solo en inglés** (algo más preciso en inglés).
  - **Activar · descargar …** indica cuánto se descarga: el modelo y, la primera vez, el propio whisper.cpp (cuando ya está todo, elegir **En esta máquina** lo activa al instante). Una barra muestra la descarga; **Cancelar** la detiene y desactiva el reconocimiento de voz en el servidor. En Linux la app descarga un whisper.cpp ya compilado, que se ejecuta en el procesador; en un Mac, y donde el ya compilado no funciona, compila whisper.cpp en esta computadora, lo cual necesita un compilador de C++ y CMake (en Debian o Ubuntu: `sudo apt install build-essential cmake`; en un Mac: `xcode-select --install` y luego `brew install cmake`). En un Mac se compila para la GPU del Mac (Metal). Un whisper.cpp tuyo que ya esté en la computadora (uno compilado para tu GPU, por ejemplo) se usa tal cual.
  - **Una GPU NVIDIA** en Linux: whisper.cpp no tiene una versión ya compilada para ella, así que, cuando el dictado ya funciona en el procesador, la app compila una para la GPU en segundo plano, con el kit de herramientas CUDA de NVIDIA (`nvcc`). Una barra muestra cuánto falta (tarda de 5 a 20 minutos); mientras tanto el dictado funciona en el procesador, y después en la GPU. Si falta el kit de herramientas, una nota lo indica, con **Comprobar de nuevo** para cuando lo hayas instalado; si la compilación falla, se muestra el motivo con **Reintentar**, y el dictado sigue en el procesador.
  - Cuando está listo: «Listo: whisper.cpp … con el modelo Base. Tu voz se queda aquí.», y debajo, en qué se ejecuta, según lo que dijo whisper.cpp la última vez que se ejecutó (prueba un segundo de silencio en cuanto está listo): «Se ejecuta en la GPU: Apple M2 Pro (Metal).» o «Se ejecuta en el procesador de esta máquina.». Si la GPU falla (por quedarse sin memoria, por ejemplo), esa grabación se hace en el procesador, la nota explica el motivo, y la GPU se vuelve a probar unos minutos después. **Probar** comprueba que responde y con qué rapidez. Si algo falló, se muestra el motivo con **Reintentar**.
  - Si eliges otro modelo mientras está activado, se descarga ese modelo.
- **Un servicio**: cualquier servicio con la dirección de voz a texto de OpenAI (`/audio/transcriptions`): el propio OpenAI, o un servidor de tu red (Speaches, LocalAI, el servidor de whisper.cpp, uno con GPU). Las grabaciones se le envían a él.
  - **Configuración** (luego **Editar**) en la fila del servicio abre un formulario: **Dirección** (como `https://api.openai.com/v1`), **Clave de API** (la mayoría de los servidores de tu red no necesitan ninguna) y **Modelo** (`whisper-1` salvo que indiques otro).
  - **Guardar y activar** (luego **Guardar**); **Probar** en su fila una vez activado; y **Quitar la clave** en su menú **⋯** una vez guardada una clave. Una vez guardado un servicio, elegir **Un servicio** de nuevo cambia a él al instante.

Un grupo, **En esta máquina**, con su tamaño total, enumera lo que whisper.cpp dejó en esta computadora: el propio whisper.cpp («compilado aquí para Metal» o «para CUDA» cuando la app lo compiló para una GPU) y cada modelo con su tamaño, el que se usa marcado como «en uso». El menú **⋯** de un modelo tiene **Quitar** (quitar el que está en uso desactiva el reconocimiento de voz en el servidor, tras confirmarlo). **Quitar todo**, en el menú **⋯** del propio grupo, quita whisper.cpp y sus modelos; aparece mientras el reconocimiento de voz en el servidor está desactivado o usa un servicio.

### Leer en voz alta

**[Leer en voz alta](/settings?s=voice&find=Read%20aloud)**: el altavoz de una respuesta te la lee, omitiendo su código. Cada navegador guarda su propia voz y velocidad (la (i) del grupo lo indica).

- **Voz**: **Automático** (la voz del navegador para el idioma que hablas), o cualquier voz que tenga este navegador, primero las de tu idioma. Cada una indica su idioma y «en línea» cuando necesita internet.
- **Velocidad**: de 0,5× a 2×.
- **Pruébalo**: **Reproducir una muestra** lee una frase con esa voz y velocidad.

Si el navegador no puede leer texto en voz alta, la sección lo indica.

## Escuchar una respuesta en voz alta

1. Apunta a una respuesta: arriba a la derecha aparece un altavoz, junto al botón de copiar.
2. Haz clic en él. Una barra sobre el cuadro de mensaje muestra **Leyendo en voz alta**, qué parte de cuántas y las primeras palabras de la respuesta.
3. Pausa y reanuda la lectura desde la barra, o deténla ahí o con el altavoz.

Lee la respuesta como palabras simples: el código se omite, los enlaces se leen por sus palabras, las direcciones web por su sitio y las tablas fila por fila. Empezar otra respuesta detiene la primera, y salir de la conversación detiene la lectura. El altavoz aparece cuando apuntas con un mouse; en un teléfono, el modo manos libres te lee las respuestas («Léeme la respuesta»).

## Hablar con la app con manos libres

El modo manos libres es para cuando no puedes mirar la pantalla, por ejemplo mientras caminas: hablas, la app lo hace y te dice lo que hizo, y luego vuelve a escuchar. Empieza sesiones, les pasa tus palabras, te dice cómo van, responde a sus aprobaciones y te lee sus resultados.

### Empezarlo y terminarlo

- En una sesión, el botón de los auriculares en el cuadro de mensaje (**Manos libres**, junto al micrófono) lo abre, siguiendo esa sesión.
- En la página de inicio, el mismo botón lo abre sin seguir ninguna sesión en particular.
- En el cuadro de búsqueda (Ctrl+K, ⌘K en un Mac), la acción **Hablar con manos libres** también lo abre.

Ocupa toda la pantalla, dice «Te escucho» y le pide al dispositivo que mantenga la pantalla encendida mientras está abierto. Arriba ves la sesión que sigue (o «Habla con Hydor»). El botón redondo grande muestra lo que está haciendo: **Escuchando…**, **Trabajando en ello…**, **Hablando** o **En pausa: toca para escuchar**. Debajo ves lo que oyó, entre comillas, y su respuesta.

- Toca el botón redondo mientras habla para interrumpirlo; tócalo en otros momentos para pausar o seguir escuchando.
- Para terminarlo, di «Adiós» (o «Chao», «Eso es todo», «Deja de escuchar», «Terminar manos libres», «Salir»), o toca la cruz de arriba a la derecha.

### Qué puedes decir

- **Empezar una sesión**: «Empieza una sesión para planear mi fin de semana en Creta». Se empieza como lo haría la página de inicio: con el programa, modelo, esfuerzo, permisos, agente y proyecto que elegiste allí por última vez, en una carpeta de tarea nueva (o en la carpeta que elegiste allí por última vez). A partir de ese momento sigue esa sesión.
- **Decirle algo a una sesión**: «Dile que use unidades métricas». Las palabras van a la sesión que sigue, como tu mensaje.
- **Preguntar cómo van las cosas**: «¿Cómo van mis sesiones?». Dice qué está trabajando, qué te necesita y qué pregunta, y qué terminó hace poco.
- **Escuchar el resultado**: «Léeme la respuesta». Dice la última respuesta de la sesión que sigue (o, cuando no sigue ninguna, de la más ocupada o la más reciente). Una respuesta larga llega como un resumen, en tres a cinco frases; cuando la app se muestra en otro idioma que no sea inglés, todas las respuestas llegan como un resumen en ese idioma.
- **Responder a una aprobación**: «Aprobar» o «Rechazar», cuando la sesión que sigue (o, cuando no sigue ninguna, cualquier sesión) espera un simple sí o no. Una pregunta, un plan o un formulario hay que responderlos en la pantalla, y te lo dice.
- **Detener el trabajo**: «Detener» detiene lo que está haciendo la sesión que sigue (no termina el modo manos libres).
- **Cambiar**: nombra otra sesión («Hablemos del viaje a Creta») y sigue esa.
- Pregunta sobre la app, o sobre cualquier otra cosa: responde brevemente, o te pregunta de vuelta cuando no está seguro.

### Lo que te dice por sí mismo

- Cuando la sesión que sigue termina: «… ha terminado. Di “léela” para escuchar la respuesta.»
- Cuando cualquier sesión te necesita: «… te necesita: …», y luego «Di aprobar o rechazar» para un simple sí o no, o «Respóndela en la pantalla». Después sigue esa sesión, así que «Aprobar» la responde.
- Cuando cualquier sesión se detiene con un error: «… se detuvo con un error.»

Deja de escuchar para decir esto, y luego vuelve a escuchar. Las sesiones de tus otras máquinas no se anuncian.

### Conviene saber

- El modelo auxiliar entiende lo que dices ([Configuración → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)). Si no se puede acceder a él, las palabras simples siguen funcionando: «estado», «aprobar» o «sí», «rechazar» o «no», «detener», «leer», «empezar …»; cualquier otra cosa va a la sesión que sigue, o empieza una sesión nueva cuando no sigue ninguna.
- Responde en el idioma en que se muestra la app (Configuración → General → Idioma), y escucha en el idioma que hablas (Configuración → Voz), y si no, en el de la app.
- Habla con la voz y la velocidad de [Leer en voz alta](/guide/documents-voice#read-aloud).
- Necesita un navegador que pueda leer en voz alta y una forma de escuchar: el reconocimiento de voz del propio navegador (Chrome, Edge, Safari) o el reconocimiento de voz en el servidor. Los auriculares solo aparecen donde puede funcionar. Con el servidor, cada cosa que dices termina tras un segundo y medio de silencio (como máximo, medio minuto), y vuelve a escuchar tras 15 segundos de silencio.
- Si el micrófono no está permitido o no hay ninguno, lo dice una vez y se pausa: permítelo en el navegador y luego toca para escuchar.

## Pídeselo a un agente

- «Rellena el formulario ~/Downloads/visa-application.pdf con mis datos de mi perfil, y pídeme el resto.»
- «Escribe la fecha de hoy y mi nombre en las líneas de ~/Documents/permission-slip.pdf, y marca Sí.»
- «Saca las páginas 3 a 5 de ~/Documents/contract.pdf a un archivo aparte.»
- «Configura ya las sugerencias de palabras, antes de que escriba, y avísame cuando estén listas.»
- «Haz que las sugerencias de palabras muestren solo aquellas de las que estés más seguro, y no la palabra siguiente.»
- «Haz que las sugerencias de palabras dejen de aprender de las respuestas de los agentes, y que aprendan solo cuando yo lo pida.»
- «Pon en pausa el aprendizaje de las sugerencias de palabras y reanúdalo esta noche.» / «Detén el aprendizaje que está en marcha.»
- «¿Las sugerencias de palabras aprenden con la tarjeta gráfica? Si no, ¿por qué?» / «Haz que las sugerencias de palabras aprendan solo con el procesador.»
- «¿Está funcionando el modelo de lenguaje de las sugerencias de palabras? Si no, ¿por qué?»
- «Desactiva las sugerencias de palabras solo en este navegador.»
- «¿Cuántas pulsaciones de teclas me han ahorrado las sugerencias de palabras?»
- “¿Las sugerencias de palabras ya ajustaron a mi forma de escribir lo seguras que deben estar?”
- «Activa el reconocimiento de voz en esta computadora, con el modelo Pequeño.»
- «Usa mi servidor de voz en http://192.168.1.20:8000/v1 para el dictado, con el modelo whisper-large-v3.»
- «¿Qué modelos whisper hay en esta computadora y cuánto espacio ocupan? Quita los que no se usen.»
- «¿El dictado se ejecuta en mi GPU? Si no, ¿por qué no?»
- «¿Qué modelos de imágenes usan ahora los agentes para la mayoría de las imágenes y para las sencillas, y cuánto cuesta aproximadamente una imagen con cada uno?»
- «Cambia el modelo de imágenes para la mayoría de las imágenes por el más barato que pueda editar imágenes.»
- «Usa Recraft V4.1 Flash para las imágenes sencillas.»
- «Configura las herramientas de imágenes en esta computadora.»
- «¿Las herramientas de imágenes se ejecutan en la tarjeta gráfica de aquí? Si alguna se ejecuta en la CPU, ¿por qué?»
- «Haz un ícono plano de una bicicleta en #0f766e y #f59e0b, como un dibujo que se mantenga nítido.»
- «Grafica ~/data/sales.csv como barras mensuales, 2025 frente a 2026, y señala el salto de la primavera.»
- «Busca tres fotos gratuitas de los tranvías de Lisboa para mis diapositivas de viaje, con sus créditos.»
- «Quita el fondo de ~/Pictures/mug.jpg.»
- «Borra al hombre de la izquierda de beach.jpg; si se ve borroso, haz que lo haga un modelo de imágenes.»
- «Recorta ~/Pictures/team.jpg a 16:9, hazla un poco más brillante y difumina los rostros del fondo.»
- «Recorta demo.mp4 a la parte de 0:12 a 0:40, pon “Nuestra nueva app” sobre su inicio y haz también un GIF.»
- «Quita las muletillas y las pausas largas de interview.m4a, reduce su siseo de fondo y súbele el volumen al nivel de un pódcast.»
- «Haz que los agentes dejen de crear imágenes.»
- «¿Qué modelos de video generan sonido y cuánto cuesta un segundo con cada uno?»
- «Haz que los agentes usen Kling para los videos.»
- «Haz que los agentes dejen de crear videos.»
- «¿Qué modelo de música usan los agentes y cuánto cuesta una canción?»
- «Usa ElevenLabs v3 para las locuciones, con la voz George.»
- «Haz que los agentes dejen de crear audio.»
