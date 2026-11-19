# Documentos, imágenes, videos y voz

Los agentes de Hydor leen PDF, Word, Excel, PowerPoint y otros documentos, crean documentos nuevos para ti y te los entregan como tarjetas que puedes abrir o descargar. También pueden crear imágenes, dibujos, gráficos y videos cortos, buscar fotos gratuitas, modificar tus imágenes y videos (recortar, extraer el fondo, borrar, cortar), y crear canciones, locuciones y sonidos, con modelos y herramientas de imagen, video y audio de esta computadora. Además, puedes guardar lo que creen en los archivos de un proyecto. Y puedes hablar en lugar de escribir, hacer que te lean las respuestas en voz alta o hablar con la app con las manos libres mientras caminas.

![Un agente que leyó un informe y creó un resumen de una página en Word y una hoja de cálculo con un gráfico](images/documents-voice.webp)

## Dale un documento a un agente para que lo lea

Todos los agentes que ejecuta la app pueden leer documentos: Claude Code, Codex, Custom y los agentes que hablan ACP y admiten servidores MCP. No necesitas convertir nada antes. Dale el documento de una de estas maneras:

1. **Adjúntalo a tu mensaje**: el clip (**Adjuntar archivos**) en el cuadro de mensaje, o arrastra el archivo al cuadro, o pégalo. Las imágenes llegan al modelo como imágenes; cualquier otro archivo se guarda en la computadora que ejecuta Hydor, y su ruta se añade a tu mensaje para que el agente pueda abrirlo. Un mensaje admite hasta 25 MB de archivos.
2. **Indica un archivo de esta computadora**: “Resume ~/Documents/lease.pdf”. Una ruta que no empieza por `/` ni por `~` parte de la carpeta de la sesión.
3. **Guarda los documentos en un proyecto o en el conocimiento compartido**, para que las sesiones puedan buscarlos y citar la página: consulta [Proyectos y conocimiento](/guide/projects).

Mientras el agente lee, su trabajo muestra **Leyendo lease.pdf** y luego **Leído lease.pdf**. En una pantalla más ancha, la línea también indica qué es el documento (el tipo, sus páginas, hojas o diapositivas) y qué líneas se leyeron. Haz clic en la línea para ver el texto que recibió el agente, y en **Abrir lease.pdf** para ver el archivo en sí.

Un documento largo se lee por partes, unas 1.200 líneas cada vez, y al agente se le avisa cuando hay más. A los agentes se les indica que traten lo que dice un documento como información, no como instrucciones. Nada de lo que hay en un documento se ejecuta: las macros nunca se ejecutan, y solo se conservan los enlaces web y de correo.

Custom también lee PDF, documentos de Office e imágenes con su lectura de archivos habitual: consulta [Custom, el agente propio de la app](/guide/custom).

## Qué pueden leer los agentes en un documento

### PDF

- El texto de cada página, con la misma disposición que en la página.
- Funciona mejor con el programa pdftotext (en poppler-utils). Sin él, la app descarga pdf.js una vez (unos 35 MB, para lo cual se necesita internet esa primera vez), y la disposición es solo aproximada.
- Las páginas escaneadas no tienen texto, y al agente se le indica cuáles son (“Las páginas 3, 5–7 no tienen texto”). Con la habilidad **pdf**, entonces mira esas páginas como imágenes y las lee por sí mismo, o ejecuta OCR en ellas cuando tesseract está instalado.
- Un PDF protegido con contraseña no se puede leer. Dale la contraseña al agente y la habilidad **pdf** crea una copia desbloqueada. Uno que se abre sin contraseña pero limita los cambios (muchos formularios oficiales) se lee como cualquier otro.
- **Formularios**: el agente enumera los campos de formulario de un PDF, cada uno con las palabras impresas a su lado (que indican para qué sirve un campo llamado “f1_02”), y mira sus páginas como imágenes con los campos numerados y una regla en puntos.
- **Tus resaltados y notas**: lo que resaltaste en el lector de Archivos, página por página, con tus notas e imágenes de las figuras y ecuaciones que elegiste ([Lee y resalta un PDF](/guide/files-git#read-and-highlight-a-pdf)), para resumirlos o contrastarlos con el artículo. Si se lo pides, también resalta palabras por ti, y luego se ven en el lector.

### Word, Excel y PowerPoint

- **Word** (.docx, y sus variantes con macros y plantillas): títulos, párrafos, listas numeradas y con viñetas, tablas, enlaces, cuadros de texto, imágenes por su descripción, notas al pie, notas finales y comentarios.
- **Excel** (.xlsx, y sus variantes con macros y plantillas): cada hoja como una tabla con sus números de fila y letras de columna, los números más o menos con su formato (fechas, porcentajes, dinero) y hasta 40 de las fórmulas de cada hoja. Las hojas ocultas se marcan. De cada hoja se entregan las primeras 2.000 filas y 60 columnas, y se avisa al agente cuando hay más; para obtener una hoja más grande completa, la habilidad **spreadsheets** la carga de otra manera.
- **PowerPoint** (.pptx, y sus variantes con macros, plantillas y presentaciones): el título de cada diapositiva, el texto, las tablas, las imágenes (por su descripción), los gráficos (su título y series) y las notas del orador. Las diapositivas ocultas se marcan. Hasta 1.000 diapositivas.

### OpenDocument, EPUB, CSV y RTF

- **OpenDocument** (los .odt, .ods y .odp propios de LibreOffice, sus plantillas y .odg): texto con títulos, listas, tablas, enlaces y notas al pie; hojas tal como se muestran; diapositivas con sus títulos, texto y notas.
- Libros **EPUB**: los capítulos en orden de lectura, con títulos, listas, tablas y citas.
- Tablas **CSV** y **TSV**, y texto **RTF**.

### Archivos antiguos de Office, archivos protegidos y archivos muy grandes

- Los archivos .doc, .xls y .ppt antiguos se leen mediante LibreOffice, que primero los convierte al formato actual. Sin LibreOffice no se pueden leer, y se le indica al agente que te pida el archivo guardado como .docx, .xlsx o .pptx, o que se instale LibreOffice.
- Los archivos de Word, Excel y PowerPoint protegidos con contraseña no se pueden leer.
- Se leen archivos de hasta 300 MB. Un documento entrega hasta unos 1.000.000 de caracteres de texto (unos 250.000 tokens); a partir de ahí se corta, y se avisa al agente.

## Pide a un agente que cree un documento

La app incluye cuatro habilidades de documentos que todos los agentes pueden cargar: **word-documents**, **spreadsheets**, **presentations** y **pdf**. Las encuentras en [Configuración → Habilidades](/settings?s=skills&find=Built%20in), en **Documentos** (consulta [Habilidades](/guide/skills)). No tienes que elegirlas: pide lo que quieras con tus palabras (“Haz un currículum de una página a partir de mis notas como documento de Word”, “Pon estos gastos en una hoja de cálculo con totales mensuales y un gráfico”, “Haz 8 diapositivas para mi charla sobre las abejas”, “Une estos tres PDF”), y el agente carga la habilidad adecuada cuando la tarea lo requiere.

Cada habilidad funciona de la misma manera:

1. El agente planifica primero el documento: su esquema, hojas o diapositivas.
2. Escribe el archivo con un breve script en la carpeta de la sesión.
3. Revisa el resultado como imágenes de páginas, comprueba si hay texto que se sale de la página, tablas que no caben y diapositivas sobrecargadas, y corrige lo que esté mal.
4. Te entrega el archivo como una tarjeta debajo de su respuesta, con un breve pie de texto (consulta [Abre o descarga los archivos que creó un agente](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Cuando modifica un archivo tuyo, guarda el resultado con un nombre nuevo, a menos que le pidas que sobrescriba el tuyo.

### Documentos de Word

Informes, cartas, currículums, memorandos, contratos, formularios, folletos y notas, para abrir en Word, Google Docs o Pages.

- Estructura real: títulos (que funcionan en el panel de navegación de Word y con lectores de pantalla), listas con viñetas y numeradas, tablas con fila de encabezado, imágenes y saltos de página.
- Una tabla de contenido (Word la completa al abrir el archivo), números de página (“Página 1 de 3”), enlaces y celdas de tabla sombreadas.
- A4 o US Letter, y fuentes que se ven igual en cualquier computadora (Calibri, Arial, Cambria, Times New Roman).
- Tus propios documentos modificados en el mismo archivo, conservando sus estilos, encabezados y diseño; texto reemplazado sin perder su formato; comentarios añadidos.
- Firmado con tu firma guardada: en lugar de {{signature}}, justo después de palabras como “Firma:”, en una celda de tabla o al final, una vez que lo permitas en una tarjeta ([Firmas](/guide/library#signatures)).
- También un PDF del documento, mediante LibreOffice.

### Hojas de cálculo

Presupuestos, seguimientos, calendarios, facturas y tablas de datos (.xlsx).

- Tus números como valores y los resultados como fórmulas, para que puedas cambiar un número y ver cómo cambia el resto.
- Formatos de número para dinero, porcentajes y fechas; una fila de encabezado en negrita que se mantiene a la vista; anchos de columna; filtros en las listas.
- Gráficos de barras, líneas y circulares junto a los datos.
- Una comprobación de cada fórmula. Con LibreOffice instalado, la comprobación calcula las fórmulas y enumera los errores (#REF!, #DIV/0!, #NAME?), que el agente corrige después.
- Tus propios libros modificados, conservando sus fórmulas, estilos y la mayor parte de su diseño (las tablas dinámicas no se conservan, y los gráficos solo cuando el agente los vuelve a crear). Un archivo CSV en su lugar, cuando lo pides.

### Presentaciones

Presentaciones para inversores, charlas, clases y resúmenes (.pptx), para mostrar en PowerPoint, Keynote o Presentaciones de Google.

- Diapositivas 16:9 limpias con un mismo aspecto en todas y el color de tu marca: una diapositiva de título, viñetas con niveles, dos columnas, imágenes ajustadas a la diapositiva, tablas, gráficos (de columnas, barras, líneas, circulares, apilados), diapositivas de sección y notas del orador para lo que vas a decir.
- Una idea por diapositiva, con títulos que dicen lo esencial (“Las ventas crecieron un 12 %”), normalmente de 6 a 12 diapositivas para una charla.
- Imágenes tuyas, de la web o creadas con un modelo de imágenes (consulta [Deja que los agentes creen imágenes](/guide/documents-voice#let-agents-make-images)).
- Una presentación nueva sobre tu propia plantilla, o tu presentación modificada, conservando su tema y diseños.
- Un PDF de las diapositivas, mediante LibreOffice.

### PDF

Informes, facturas, certificados, folletos, cartas y formularios.

- Sobre todo texto, o algo que querrás editar: el agente crea un documento de Word y luego un PDF a partir de él con LibreOffice.
- Con una disposición exacta (facturas, certificados, entradas, formularios): dibuja el PDF directamente.
- Diapositivas u hoja de cálculo como PDF: se crean con su habilidad y luego se convierten en PDF.
- **Rellenar un formulario**: sus campos por nombre (texto, marcas, opciones, en griego, chino o cualquier escritura), de modo que cualquier visor los muestre y aún se puedan cambiar allí; o, para un formulario que solo son líneas y casillas impresas, las palabras escritas en la página junto a las palabras impresas (“Fecha de nacimiento:”) y marcas en sus casillas; en uno escaneado, que no tiene palabras que encontrar, donde el agente ve los espacios en blanco en una imagen de la página. El agente te pregunta lo que no sabe, y mira las páginas antes y después. Un formulario con firma digital sigue siendo válido cuando solo se rellenan sus campos. Los formularios XFA (Adobe LiveCycle) solo se rellenan en las apps de Adobe: el agente lo indica, y aun así puede escribir en sus páginas.
- **Escribir en las páginas**: palabras, marcas y cruces, imágenes, recuadros blancos sobre lo que hay (solo ocultan las palabras a la vista: las palabras siguen en el archivo, así que esto no es una redacción de censura), contornos y líneas, y resaltados y comentarios propios del PDF, que otros visores enumeran y pueden quitar.
- **Cambiar páginas**: girarlas, eliminarlas, moverlas, insertar páginas en blanco, unir PDF, extraer algunas páginas a un archivo propio o dividir uno en varios. Un archivo cambiado así no puede conservar una firma digital, y el agente lo indica.
- Lo que escribe el agente va en una copia junto al archivo (“nombre (filled).pdf”), a menos que pidas que se cambie el archivo en sí; entonces su versión anterior va a la Papelera. También puedes rellenar y firmar un PDF tú mismo: [Rellena y firma un PDF](/guide/files-git#fill-in-and-sign-a-pdf).
- Palabras grandes y tenues como BORRADOR en cada página, y una copia sin su contraseña (tú das la contraseña), con la habilidad **pdf**.
- Firmado con tu firma guardada, junto a unas palabras de una página o en un lugar que te muestra antes, una vez que lo permitas en una tarjeta; se añade al PDF sin cambiar lo que había ([Firmas](/guide/library#signatures)).
- Archivos de Office convertidos en PDF.

### Qué necesita la computadora

Esto se refiere a la computadora que ejecuta Hydor, no al dispositivo desde el que la usas.

- **Python 3**, con su módulo venv: necesario para crear documentos. La primera vez, las habilidades instalan algunas bibliotecas de Python para archivos de Office y PDF en una carpeta privada de la app (unos 30 MB, una sola vez, desde internet); no se instala nada en todo el sistema. Si falta Python, el agente te indica el único comando que debes ejecutar (en Debian o Ubuntu `sudo apt install python3 python3-venv`; en un Mac `brew install python`).
- **LibreOffice** (opcional): vistas previas como páginas con su diseño en el visor de archivos, lectura de archivos .doc, .xls y .ppt antiguos, agentes que miran documentos de Office como páginas, comprobación de fórmulas y PDF a partir de archivos de Office. En Debian o Ubuntu: `sudo apt install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui`; en un Mac: `brew install --cask libreoffice`.
- **poppler-utils** (opcional): la mejor lectura de PDF, e imágenes de las páginas de PDF para los agentes y para **Rellenar y firmar**. Sin él, la app las dibuja con lo que tiene la computadora (la forma propia de un Mac o de Windows de dibujar PDF), o con el navegador de **Configuración → Navegador**. En Debian o Ubuntu: `sudo apt install poppler-utils`; en un Mac: `brew install poppler`.
- **tesseract** (opcional): OCR para PDF escaneados.

Sin LibreOffice ni poppler-utils, los agentes vuelven a leer sus archivos como texto para comprobarlos y mantienen un diseño sencillo.

## Abrir o descargar los archivos que creó un agente

Cuando un agente ha creado archivos para ti (un documento, una hoja de cálculo, diapositivas, un PDF, imágenes, un archivo comprimido), te los entrega como tarjetas debajo de su respuesta, hasta 12 a la vez. Cada tarjeta tiene:

- un icono según el tipo, en su color (azul para Word, verde para Excel, naranja para PowerPoint, rojo para PDF), o una imagen pequeña si es una imagen;
- el nombre del archivo, qué es y su tamaño (“Documento de Word · 24 KB”);
- la descripción del agente (“El presupuesto, una hoja por trimestre”);
- **Abrir**, un botón de descarga y **Más** (⋯).

**Abrir** muestra el archivo en el visor de archivos, en una ventana sobre la conversación, que se queda donde estaba (en un teléfono la ventana sube desde la parte inferior de la pantalla). **Abrir en Archivos**, en la parte superior de la ventana, lleva el archivo a la página Archivos; la cruz, o Escape, cierra la ventana. Encima del archivo aparece su ruta, como en la página Archivos ([Abrir y editar un archivo](/guide/files-git#open-and-edit-a-file)); una carpeta de esa ruta se abre en la misma ventana, con el archivo seleccionado (antes pregunta por los cambios sin guardar), y **‹** en la parte superior de la ventana vuelve al archivo. El botón de descarga guarda el archivo en tu dispositivo.

**Más** (⋯), en una tarjeta y en la parte superior de la ventana, tiene **Empezar una sesión con él** (la página de inicio, con el archivo en su cuadro de mensaje), **Añadir a un proyecto** (lo copia en la carpeta de un proyecto), **Guardar una copia** (un cuaderno de Jupyter, una presentación de PowerPoint, un documento de Word o Markdown, una hoja de cálculo o un archivo LaTeX: una copia guardada como un documento propio, en su editor, en los archivos del proyecto que elijas cuando tienes proyectos, o en los de la primera sesión), **Mostrar en Archivos** (en una tarjeta), **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio; consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)) y **Copiar ruta**. Consulta [Empezar una sesión con archivos](/guide/files-git#start-a-session-with-files) y [Añadir archivos a un proyecto](/guide/files-git#add-files-to-a-project).

Un archivo eliminado o movido después aparece como **Ya no está**. Si un agente nombra un archivo que no existe, ves “Could not show the files” con el motivo, y al agente se le indica que lo corrija.

### Documentos que creó o cambió, y nombres de archivo en su respuesta

Debajo de la respuesta de un agente, los documentos que creó o cambió en ese turno aparecen siempre como tarjetas, los haya entregado o no: archivos PDF, Word, Excel, PowerPoint y OpenDocument, tablas CSV y TSV, LaTeX, cuadernos de Jupyter, EPUB y Markdown. Son los que escribieron sus ediciones y los que crearon sus comandos en la carpeta de la sesión mientras se ejecutaba el turno (los que el turno nombra, o que están junto a un archivo que cambió: las demás sesiones que trabajan en la misma carpeta no añaden los suyos).

- Cada tarjeta dice **Nueva** o **Actualizada**, con su tipo y tamaño, y tiene **Abrir**, un botón de descarga y **⋯**, como las tarjetas anteriores.
- Los documentos terminados (un PDF, un archivo de Word…) van antes que sus fuentes (LaTeX, Markdown, tablas). Se muestran los primeros cuatro; **Mostrar N documentos más** muestra el resto y **Mostrar menos** los vuelve a plegar.
- Un archivo que el agente entregó conserva su propia tarjeta y su descripción, y no se muestra dos veces. Un archivo que ya no está se omite. Las imágenes, el código y los archivos de datos no se muestran de esta manera (un agente sigue entregando las imágenes).

Los nombres de archivo y las rutas en una respuesta son enlaces. Un nombre o ruta en código (`report.tex`, `docs/report.pdf`, `src/app.ts:42`, que se abre en esa línea), una ruta absoluta o con `~/` en el texto y un enlace a un archivo abren el archivo en la ventana sobre la conversación, igual que el **Abrir** de una tarjeta. Un nombre solo abre el archivo de la conversación con ese nombre; una ruta que no empieza desde la raíz parte de la carpeta de la sesión.

## Previsualizar un documento en el visor de archivos

El visor de archivos muestra documentos desde una tarjeta, desde la página Archivos o desde un enlace en una respuesta (consulta [Sistema: archivos, Git, Terminal y vista previa](/guide/files-git)).

- Los **PDF** se muestran tal cual, en el visor de PDF del propio navegador, con **Rellenar y firmar** para rellenarlos y firmarlos ([Rellenar y firmar un PDF](/guide/files-git#fill-in-and-sign-a-pdf)).
- Los archivos de **PowerPoint** (.pptx, y sus variantes con macros, de presentación y de plantilla) se abren en **Diapositivas**: “Sus diapositivas, como las dibuja la app”. Cada diapositiva se muestra tal como se ve, igual que una presentación guardada (con sus imágenes, formas, tablas, gráficos, fondo y pie de página en su sitio), una debajo de otra con su número y sus notas del orador, también en un teléfono. Si la presentación usa una fuente que esta computadora no tiene, se sustituye por otra; cuando esa necesita más espacio, las palabras de un cuadro se reducen un poco para que quepan, de modo que no se corte ninguna. **Texto** (“Sus palabras y notas del orador”) muestra las palabras de las diapositivas, y **Páginas** las muestra maquetadas por LibreOffice cuando está instalado. Si no se pueden dibujar las diapositivas, el visor se abre en **Texto** y explica por qué.
- Los archivos de **Word, Excel, PowerPoint, OpenDocument, EPUB y RTF** (también los antiguos .doc, .xls y .ppt) se muestran como vista previa. Cuando LibreOffice está instalado, un interruptor en la parte superior ofrece dos vistas:
  - **Páginas**: “Tal como las maqueta LibreOffice”, cada página como se imprimiría. La primera vez tarda un momento (“Laying out the pages…”); después las páginas se abren al instante hasta que el archivo cambia.
  - **Texto**: “Su texto, hojas y diapositivas”, tal como los lee la app. Un documento de texto se muestra como una hoja de papel; un libro de cálculo como una cuadrícula con letras de columna, números de fila y una pestaña para cada hoja en la parte inferior (las hojas ocultas se marcan con un ojo tachado); las diapositivas como tarjetas, cada una con su número y sus notas del orador debajo. Las imágenes se muestran como un recuadro con su descripción. Una línea en la parte superior avisa cuando se omitió algo (“Shows the first 1000 rows”).
- Sin LibreOffice solo existe la vista **Texto**. Los libros EPUB siempre se abren en ella.
- En un teléfono la vista previa se abre en **Texto** (un archivo de PowerPoint en **Diapositivas**), que se desplaza y se amplía mejor en una pantalla pequeña; el interruptor muestra las páginas.

Si LibreOffice no puede maquetar un archivo, el visor lo indica y su texto sigue disponible en **Texto**. Un archivo sin vista previa dice “No preview for this file”: descárgalo para abrirlo en tu dispositivo. El botón de descarga del visor siempre está disponible.

## Permitir que los agentes creen imágenes

Pídele una imagen a cualquier agente (“haz un logotipo para mi panadería”, “convierte esta foto en una acuarela”) y la crea con un modelo de imagen a través de OpenRouter, la guarda en la carpeta de la sesión y la muestra con su respuesta. Configúralo en **[Configuración → Capacidades → Imágenes, video y audio](/settings?s=images)** (en un teléfono: Configuración y luego **Imágenes, video y audio**).

- **[Creación de imágenes](/settings?s=images&find=Making%20images)**: el interruptor **Permitir que los agentes creen imágenes**, junto al título del grupo, da a todos los agentes sus herramientas para imágenes: crear imágenes, dibujos y gráficos, y quitar el fondo de una imagen o borrar una parte. Está activado salvo que lo desactives; si está desactivado, no se les ofrecen.
- **La clave de OpenRouter**: a los modelos de imagen, video y audio se accede a través de OpenRouter, y cada imagen, video o sonido se paga con tu clave de OpenRouter. Sin una clave, esta sección lo indica, con **Consigue una en openrouter.ai** y **Añadir la clave**, que abre [Configuración → Agentes → Modelos → OpenRouter](/settings?s=models&find=OpenRouter), donde se pone la clave (consulta [Agentes, cuentas y modelos](/guide/agents-models)). Un agente que la necesita te la pide en una tarjeta ([Cuando un agente necesita la clave de OpenRouter](#when-an-agent-needs-the-openrouter-key)).
- **[Para la mayoría de las imágenes (Mejor)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)**: el modelo que crea escenas, fotos, personas, texto dentro de una imagen y diagramas, y todos los cambios en una imagen. Muestra su nombre, con su creador, aproximadamente lo que cuesta una imagen (para una imagen de cerca de un megapíxel) y el mes en que OpenRouter lo incluyó en su lista (su id está en el (i)), con etiquetas: **Nueva** (incluido en los últimos 30 días), **Ediciones** (acepta imágenes para cambiar o seguir) y **También texto** (escribe texto junto con sus imágenes). Hasta que elijas uno, es la elección de la app (“The app’s choice, until you pick one”): el primero de una lista corta que OpenRouter sigue ofreciendo: Seedream 5.0 Pro y Flash de ByteDance, y luego modelos de imagen de Google Gemini, OpenAI y FLUX.
- **[Para imágenes sencillas (Rápido)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)**: un modelo más barato y rápido para iconos, fondos, texturas e imágenes sencillas, que se muestra de la misma manera. Hasta que elijas uno, es la elección de la app: el primero de una lista corta de modelos rápidos que OpenRouter sigue ofreciendo, primero Seedream 5.0 Flash de ByteDance, y luego modelos rápidos de Google, Recraft, FLUX y OpenAI (cuando OpenRouter no ofrece ninguno de ellos, el modelo Mejor también crea las imágenes sencillas).
- **[Herramientas de imagen en esta computadora](/settings?s=images&find=Picture%20tools%20on%20this%20computer)**: quitar el fondo de una imagen, borrar una parte y ampliarla en esta computadora en lugar de a través de OpenRouter: es gratis y tus imágenes se quedan aquí. **Configuración** las descarga una vez, la línea de debajo dice qué están haciendo, y **⋯ → Quitar** las elimina de esta computadora de nuevo (consulta [Las herramientas de imagen en esta computadora](/guide/library#the-picture-tools-on-this-computer)).

Para elegir el modelo Mejor o el Rápido:

1. Haz clic en **Cambio** junto a él: se abre una lista de los modelos de imagen de OpenRouter (**Modelo de imagen para la mayoría de las imágenes (Mejor)** o **Modelo de imagen para imágenes sencillas (Rápido)**).
2. Búscalo por nombre (“seedream”, “flux”, “gemini”) y ordénalo por **Sugeridos** (primero las sugerencias de la app), **Más reciente** o **Más barato**.
3. Haz clic en una fila para usar ese modelo. Una vez que hayas elegido uno, el menú **⋯** de la fila tiene **Dejar que la app elija**, que vuelve a la elección de la app.

Las listas vienen de OpenRouter y no necesitan clave; cuando no se puede acceder a ellas, la lista lo indica.

## Permitir que los agentes creen videos

Los agentes también pueden crear videos cortos (“diez segundos de olas al atardecer”, “haz que esta foto de mi perro corra por un campo”), con un modelo de video a través de OpenRouter, en la misma sección, **[Configuración → Capacidades → Imágenes, video y audio](/settings?s=images)**:

- **[Creación de videos](/settings?s=images&find=Making%20videos)**: el interruptor **Permitir que los agentes creen videos**, junto al título del grupo, da a todos los agentes la herramienta para ello. Está activado salvo que lo desactives.
- **[Modelo de video](/settings?s=images&find=Video%20model)**: el modelo que los crea, que se muestra con su creador, lo que cuesta un segundo de video (desde su resolución más baja sin sonido hasta la más alta con sonido, como “$0.03 to $0.08 a second”), las duraciones que crea (“4 to 8 s”), su resolución máxima (“up to 1080p”) y el mes en que OpenRouter lo incluyó en su lista, con etiquetas: **Sonido** (crea sonido junto con la imagen), **A partir de una imagen** (puede partir de una imagen que le des) y **Edita videos** (cambia un video que le des en lugar de crear uno a partir de palabras). Hasta que elijas uno, es la elección de la app: el primero de una lista corta de modelos con sonido que OpenRouter sigue ofreciendo: Seedance 2.5 de ByteDance, y luego otros más baratos y rápidos, como Google Veo 3.1 Lite. **Cambio** abre la lista para buscar (“seedance”, “veo”, “kling”) y ordenarla por **Sugeridos**, **Más reciente** o **Más barato**.

- **[Usar la tarjeta gráfica para videos](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** (en **Edición de videos**): **Automático** crea los videos que editas, y las ediciones de los agentes, en la tarjeta gráfica cuando hay una que funcione (NVIDIA, Intel, AMD o Apple): mucho más rápido, y el procesador queda libre. Se prueba la primera vez que se crea un video, y la línea de debajo dice lo que se encontró (“NVIDIA GeForce RTX 4090 · NVENC”); **Comprobar ahora** lo prueba de nuevo. Si la tarjeta falla en una edición, el procesador la rehace de inmediato. **Desactivado** los crea en el procesador.

Los videos cuestan mucho más que las imágenes: desde unos centavos hasta dólares por segundo, y un video de 8 segundos con sonido de un modelo de primer nivel puede costar varios dólares. Cada uno se paga con tu clave de OpenRouter, y ves su precio en un formulario antes de que se cree nada.

## Permitir que los agentes creen audio

Los agentes también pueden crear sonido: canciones y jingles (“un jingle de 30 segundos para mi podcast”), locuciones y narraciones con una voz que describas (“lee esta bienvenida con una voz cálida y lenta”) o con una voz copiada de una grabación que tengas, y efectos de sonido y ambientes (“lluvia sobre un techo de lámina”). Configúralo en la misma sección, **[Configuración → Capacidades → Imágenes, video y audio](/settings?s=images)**:

- **[Creación de audio](/settings?s=images&find=Making%20audio)**: el interruptor **Permitir que los agentes creen audio**, junto al título del grupo, da a todos los agentes la herramienta para ello. Está activado salvo que lo desactives.
- **[Modelo de música](/settings?s=images&find=Music%20model)**: el modelo que crea canciones y música, que se muestra con su creador, su precio (“$0.08 a song”), la duración máxima (“up to 3:00”) y el mes en que OpenRouter lo incluyó en su lista, con la etiqueta **Música**. Hasta que elijas uno, es la elección de la app: Lyria 3 Pro de Google, que crea canciones completas de hasta unos 3 minutos, con voz o sin ella; si no, Lyria 3 Clip, que crea fragmentos de 30 segundos.
- **[Modelo de voz y sonido](/settings?s=images&find=Voice%20and%20sound%20model)**: el modelo que habla y crea otros sonidos, que se muestra con su precio (“$0.0025 a second”, “$0.08 per 1,000 characters”, “about $0.014 a minute”), la duración máxima y cuántas voces tiene, con etiquetas: **También sonidos** (crea efectos de sonido y ambientes además de voces, a partir de una descripción), **Copia voces** (habla con una voz copiada de las grabaciones cortas que le des), **Conversaciones** (pone voz a varios hablantes, cada uno con su propia voz) y **Dirigido** (acepta indicaciones para la entrega: tono, ritmo, emoción). Hasta que elijas uno, es la elección de la app: Seed Audio 1.0 de ByteDance, que hace todo esto a partir de una descripción, hasta 2 minutos cada vez; si no, Gemini 3.8 Flash TTS de Google; si no, ElevenLabs v3.

**Cambio** abre la lista de cada modelo, para buscar (“lyria”; “seed”, “elevenlabs”, “gemini”) y ordenar por **Sugeridos**, **Más reciente** o **Más barato** (las voces, por aproximadamente lo que cuesta un minuto de habla); la fila de un modelo elegido tiene **⋯ → Dejar que la app elija** para volver a la elección de la app. Cuando el modelo de voz que elegiste solo lee palabras en voz alta, un efecto de sonido o una voz copiada se crea con la elección de la app que sí puede, y el formulario lo indica.

Los modelos de voz se venden sobre todo por carácter leído, Seed Audio por segundo de sonido que crea, y Lyria por canción. Cada uno se paga con tu clave de OpenRouter, y ves su precio en un formulario antes de que se cree nada.

## Revisa la configuración antes de crear nada

Antes de que un agente cree una imagen, un dibujo detallado, un video o un sonido, en la conversación aparece un formulario corto con los ajustes que admite ese modelo y lo que cuesta el resultado, rellenado con lo que pediste y con los valores predeterminados de la app:

- para una imagen: **Forma** (cuadrada, ancha, alta…, todas las que admita el modelo), **Resolución** (1K, 2K, 4K…), **Calidad**, **Cuántas imágenes** (para los modelos que crean varias a la vez) y **Fondo transparente** (para un logo o un icono);
- para un dibujo detallado (con el modelo vectorial de Recraft): su **Forma**;
- para un video: **Duración del video** (las duraciones que crea el modelo, o **Duración, en segundos**), **Forma**, **Resolución** y **Sonido**;
- para un sonido: en el caso de una canción, **Instrumental, sin cantar** y, con un modelo que crea canciones largas, **Duración, en segundos** (déjalo vacío para que la canción dure lo que necesite); en el caso de un efecto de sonido, su **Duración, en segundos** (Seed Audio se paga por segundo); en el caso de la voz hablada, la **Voz** (para un modelo con voces propias); y el **Archivo** (**MP3, más pequeño** o **WAV, sin comprimir**), cuando el modelo crea ambos.

Encima de los campos están el nombre del modelo, su precio (“unos $0,08 por imagen”, “de $0,03 a $0,08 por segundo, según la resolución y el sonido”, “$0,08 por canción”, “$0,0025 por segundo de sonido”; para un video o un sonido, lo que resulta con los ajustes mostrados) y lo que el agente va a pedir, completo y con sus propias palabras. Cambia lo que quieras y haz clic en **Crearla**; **Ahora no** cierra el formulario, y no se crea ni se gasta nada. El formulario muestra solo los ajustes que ofrece el modelo.

El formulario aparece una vez por modelo en cada sesión: las imágenes, los videos y los sonidos posteriores de esa sesión usan los ajustes que elegiste (en el caso de un sonido, su voz y su archivo), salvo que pidas otros (“ahora una alta”). Di “muéstrame los ajustes otra vez” para ver el formulario, o “adelante, elige por mí” para que el agente la cree sin él. Las tareas programadas y las ejecuciones de las apps crean las suyas sin formulario, con los valores predeterminados de la app, ya que no hay nadie para responder.

## Cuando un agente necesita la clave de OpenRouter

Las imágenes, los dibujos detallados, los videos, la música y las voces los crean modelos a través de OpenRouter, y se pagan con tu clave de OpenRouter. Cuando un agente va a crear uno y no hay ninguna clave configurada, primero aparece en la conversación una tarjeta, **Esto necesita una clave de OpenRouter**, que indica qué modelo lo crearía, cuánto cuesta aproximadamente y que pagas a OpenRouter por lo que se crea, con un campo para la clave:

- Pégala y haz clic en **Guardar la clave** (o pulsa Enter). OpenRouter la comprueba primero; va directamente a [Configuración → Agentes → Modelos → OpenRouter](/settings?s=models&find=OpenRouter), nunca a la conversación, y el agente continúa (con el formulario de ajustes, como siempre). Entonces la tarjeta dice “Tu clave de OpenRouter está guardada en Configuración → Modelos.”
- **Obtener una clave** abre la página de OpenRouter donde se crea una.
- **Omitir**: ese modelo no se ejecuta, no se crea ni se gasta nada, y el agente continúa sin él, de otra manera cuando no haga falta ninguna clave (un dibujo sencillo que él mismo escribe, las [herramientas de imágenes de esta computadora](/guide/library#the-picture-tools-on-this-computer)), o sin nada. La sesión no vuelve a preguntar durante seis horas.

La tarjeta espera hasta nueve minutos; después el agente continúa sin la clave, y se entera si la añades más tarde. Las tareas programadas y las ejecuciones de las apps no reciben tarjeta, ya que no hay nadie para responder: avisan de que falta la clave (“Las imágenes necesitan una clave de OpenRouter”, con **Añadir una clave de OpenRouter**). Las herramientas de IA de los editores piden la clave en su propio cuadro de diálogo ([Crear imágenes, dibujos, gráficos y videos con IA](/guide/library#make-pictures-drawings-plots-and-videos-with-ai)).

## Pide una imagen o que cambien una

Describe lo que quieres: el tema, el escenario, el estilo (una foto, una ilustración, una acuarela), los colores, la luz y las palabras que deban aparecer en ella. El agente también puede:

- **cambiar o combinar tus imágenes**: archivos de imagen de esta computadora (PNG, JPEG, WebP o GIF, de hasta 20 MB cada uno; la mayoría de los modelos admiten hasta 4, algunos más), en la carpeta de la sesión o por su ruta, o las imágenes que ya están en una presentación, un documento o una página que conservaste; di qué quieres cambiar. (Una imagen adjunta a un mensaje llega al modelo para que la vea; para que el modelo de imágenes trabaje a partir de ella, tiene que ser un archivo: súbela en la página Archivos.) Esto necesita un modelo con la etiqueta **Ediciones**; con otro, se le indica al agente que describa el cambio con palabras o que te pida elegir un modelo que edite imágenes;
- **usar el modelo Rápido o el Mejor**: el agente usa el Rápido para imágenes sencillas (un fondo, una textura, un icono) y el Mejor para escenas, fotos, palabras dentro de una imagen, diagramas y todos los cambios, o lo decide según lo que pidas; dilo para que use el otro (“uno rápido está bien”, “usa el modelo Mejor”);
- **hacer el fondo transparente** (un logo, un icono): un modelo que no pueda hacerlo se lo pasa a uno que sí, o, con las [herramientas de imágenes](/guide/library#the-picture-tools-on-this-computer) configuradas, la imagen se crea sobre un fondo liso y su fondo se quita en esta computadora;
- **usar otro modelo** para una imagen, cuando lo nombras (“créala con FLUX 2 Pro”), sin cambiar la Configuración.

Las imágenes se guardan en una carpeta **imágenes** dentro de la carpeta de la sesión, con un nombre basado en lo que muestran, y nunca sobre un archivo que ya exista.

En la conversación:

- Mientras el modelo trabaja, un marcador de posición con la forma pedida dice “Creando una imagen” con el tiempo transcurrido, y la descripción debajo.
- Después las imágenes aparecen con la respuesta, con la descripción y el nombre del modelo debajo, y **Conservar** (consulta [Conserva lo que creó un agente](#keep-what-an-agent-made)). Haz clic en una para verla en grande: haz clic otra vez para verla a tamaño completo, las flechas (o las teclas de flecha) recorren varias, **Abrir en una pestaña nueva** la abre sola, **Editar** la abre en el editor de imágenes (lo que guardes allí se conserva como una imagen nueva: [Edita imágenes y videos](/guide/library#edit-pictures-and-videos)) y Escape la cierra. Sobre cada imagen, **Mostrar en los archivos**, **Descargar** y **Más** (⋯: **Empezar una sesión con él**, **Añadir a un proyecto**, **Copiar ruta** y, en la app de escritorio, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**) aparecen al señalarla (en un teléfono siempre están visibles); con varias imágenes, también está **Conservar**.
- Si no hay ninguna clave de OpenRouter configurada, primero una tarjeta te pide una ([Cuando un agente necesita la clave de OpenRouter](#when-an-agent-needs-the-openrouter-key)); en una ejecución que nadie vigila (la de una tarea programada o una app) ves en su lugar “Las imágenes necesitan una clave de OpenRouter”, con **Añadir una clave de OpenRouter**. Cuando no se crea nada (omitiste la clave, cerraste el formulario o el modelo se negó), ves “Esta vez no hay imagen” con el motivo.

## Pide un dibujo o un gráfico

Algunas imágenes es mejor dibujarlas a partir de formas o calcularlas a partir de números que pintarlas con un modelo de imágenes:

- **Un dibujo** (un SVG: formas en lugar de píxeles, nítido a cualquier tamaño): un icono, un logo, un diagrama, un patrón que se repite, una forma o una ilustración plana, con los colores que indiques (los de una presentación o un documento, por ejemplo). Uno sencillo lo escribe Claude (o el [modelo auxiliar](/settings?s=models&find=Helper%20model) que hayas elegido), sin modelo de imágenes que pagar, en menos de un minuto; uno detallado (una ilustración, o cuando pides lo mejor) lo dibuja el modelo vectorial de Recraft a través de OpenRouter, por unos $0,08 el dibujo, después del formulario con su precio. Los scripts, los enlaces y todo lo que un dibujo cargaría desde otro sitio se eliminan de cada dibujo antes de conservarlo.
- **Un gráfico** de tus datos o de matemáticas, para lo que el gráfico de una diapositiva no puede dibujar: diagramas de dispersión, histogramas, diagramas de caja, barras de error, varios ejes o paneles, mapas de calor, funciones, ajustes y anotaciones en los puntos importantes. Claude (o el modelo auxiliar) lo escribe en Python con matplotlib, se ejecuta en esta computadora, y lo que falla vuelve a él para que lo corrija (hasta tres intentos); tarda unos treinta segundos y cuesta solo esa respuesta. Da los números en tu mensaje o como archivo (CSV, TSV o JSON, de hasta 20 MB), y indica la idea que debe transmitir (“muestra que la primavera se duplicó”). Llega como un dibujo (SVG; un PNG si hay muchísimos puntos), de 960 por 540 píxeles salvo que pidas otro tamaño, con su Python al lado, de modo que “ahora con escala logarítmica” modifica ese gráfico; para una presentación web también puede llegar como un gráfico que se mueve y responde al puntero. Necesita Python con matplotlib en la computadora donde se ejecuta la app: el de las herramientas de imágenes, una vez configuradas ([Las herramientas de imágenes de esta computadora](/guide/library#the-picture-tools-on-this-computer)), o uno que ya esté ahí.

Ambos se guardan en la carpeta **imágenes** dentro de la carpeta de la sesión y aparecen con la respuesta como las imágenes; mientras se crea uno, su marcador de posición dice “Creando un dibujo” o “Dibujando el gráfico”.

## Busca fotos gratuitas

Pide fotos en lugar de imágenes creadas por un modelo (“busca dos fotos de los tranvías de Lisboa para mi diapositiva de título”), y el agente busca fotos con licencia abierta, gratuitas para usar y modificar, también para uso comercial: el catálogo de Openverse (Flickr, Wikimedia Commons, museos y más), o la búsqueda propia de Wikimedia Commons cuando Openverse no puede responder. Guarda algunas de las mejores (4 si no indicas otra cantidad, 10 como máximo) en la carpeta **imágenes** de la sesión, con el crédito de cada una (su título, autor, licencia y enlace) en un archivo al lado, las mira antes de usar una y las acredita como lo exige su licencia: en las notas del orador de la diapositiva, o debajo de la imagen en un documento o una página, y, para las licencias distintas de CC0 y el dominio público, en un pequeño pie junto a la foto (“Foto: “Título” de Autor, CC BY 2.0”). Es gratis y tarda unos segundos; mientras busca, el marcador de posición dice “Buscando fotos gratuitas”.

## Recortar, borrar y editar

Los agentes también modifican tus imágenes y videos sin tener que volver a crearlos:

- **Quitar el fondo** de una imagen: su sujeto (una persona, un producto, un animal, un logotipo) sobre un fondo transparente, como PNG. En esta computadora, una vez configuradas las [herramientas de imágenes](/guide/library#the-picture-tools-on-this-computer), es gratis y privado, conserva los píxeles propios del sujeto y tarda unos segundos; si un recorte queda mal, un modelo de imágenes lo vuelve a hacer. Sin ellas, lo hace un modelo de imágenes a través de OpenRouter (entre 0,01 y 0,04 US$ aproximadamente), que dibuja de nuevo la imagen sin su fondo, así que algunos detalles pequeños pueden cambiar.
- **Borrar algo** de una imagen (una persona al fondo, un letrero, una marca de agua, una mancha, un cable): se quita y se rellena como continúa lo que lo rodea. El agente marca dónde está, o lo describe para que un modelo de imágenes lo encuentre. Las zonas pequeñas se borran en esta computadora sin costo; las grandes, las que cruzan toda la imagen y las que están entre cosas con mucho detalle, como las palabras, pasan a un modelo de imágenes (entre 0,01 y 0,04 US$ aproximadamente).
- **Agrandar una imagen**: el doble o el cuádruple por cada lado, con su detalle dibujado con nitidez en lugar de borroso (una foto pequeña para imprimir o para una diapositiva, una imagen antigua). Gratis y privado, en esta computadora una vez configuradas las [herramientas de imágenes](/guide/library#the-picture-tools-on-this-computer) (la primera vez descarga su modelo, de unos 5 MB); una imagen grande tarda uno o dos minutos.
- **Editar una imagen**: recortarla, girarla o voltearla, cambiar su tamaño, modificar su luz y sus colores (exposición, contraste, calidez y el resto, o curvas, niveles, el tono y la saturación de un color, balance de color, claridad, eliminación de neblina, reducción de ruido, grano, o todo a la vez con Mejora automática), aplicarle un filtro (**Vintage**, **Blanco y negro**…), escribir texto sobre ella, dibujar flechas y recuadros, y desenfocar o pixelar partes (un rostro, una matrícula, un nombre). Gratis, en esta computadora; una imagen JPEG, WebP o GIF, o el texto sobre una de ellas, necesita ffmpeg o las herramientas de imágenes allí.
- **Editar un video**: recortarlo, cortarle partes, ajustarlo a un formato (16:9, 9:16, cuadrado, 4:5), girarlo o reflejarlo, acelerarlo o ralentizarlo (o reproducirlo al revés, estabilizado), unir varios clips e imágenes con transiciones (disoluciones, fundidos a negro, cortinillas, desplazamientos), darle a una imagen un zoom lento, aplicarle color (exposición, calidez, contraste, un aspecto como cinematográfico o blanco y negro, una viñeta, grano), hacerle fundidos de entrada y de salida, quitarle el sonido o cambiarle el volumen, elegir qué canales se escuchan (un micrófono de solapa en un lado que se oye en ambos), silenciar partes del sonido, darle a la música una línea de volumen, ponerle encima un logotipo, una marca de agua o una pantalla verde, añadirle texto (títulos, subtítulos, o subtítulos creados a partir de lo que se dice, con un .srt al lado) y colocarle debajo música y una narración, con las voces limpiadas, la música bajada bajo el habla y el volumen general igualado; o crear un GIF a partir de él, o tomar un fotograma como imagen. Gratis, con ffmpeg en esta computadora (las herramientas de imágenes traen uno), en la tarjeta gráfica cuando hay una, mientras **Permitir que los agentes creen videos** esté activado.
- **Editar un sonido** (un archivo de sonido, el sonido de un video o un sonido que conservaste): conservar una parte, cortar partes o silenciarlas, acortar pausas largas, quitar muletillas (“eh”, “mm”: con reconocimiento de voz en esta computadora, consulta [Reconocimiento de voz en el servidor](#speech-recognition-on-the-server)), reproducirlo más rápido o más lento manteniendo su tono, cambiar su tono, subirle o bajarle el volumen o aplicarle un fundido, fijar su pico más alto o su volumen percibido (podcast, streaming, radiodifusión), reducir el ruido, cambiar su timbre (una voz más clara, un teléfono, una radio), comprimirlo o limitarlo, añadir eco o reverberación, invertirlo o convertirlo a mono, y mezclar otros sonidos encima en un punto concreto (música bajo una voz, un efecto de sonido). Gratis, con ffmpeg en esta computadora, mientras **Permitir que los agentes creen audio** esté activado.

Cada una funciona a partir de un archivo de la carpeta de la sesión, o de una imagen o un video que ya estén en una presentación, un documento o una página, y guarda lo que crea en la carpeta **imágenes** de la sesión (un video editado en **videos**, un sonido editado en **audio**), nunca sobre el original. También se puede editar una imagen o un sonido que conservaste, y volver a ponerlo en su lugar o al lado como uno nuevo, como hacen **Guardar** y **Guardar una copia** de los editores (“aviva la foto del puerto que conservé”, “haz que mi sonido ‘Entrevista’ tenga el volumen de un podcast”). Se muestra con la respuesta igual que una imagen creada por el agente, con un marcador que dice “Quitando el fondo”, “Borrando”, “Agrandando”, “Editando la imagen”, “Editando el video” o “Editando el sonido” mientras trabaja. En un recorte o un borrado, la respuesta indica de qué manera se hizo y por qué: si no queda bien, di “hazlo con IA” y el agente se lo pide al modelo de imágenes. Para hacerlo tú mismo, abre la imagen, el video o el sonido en su editor ([Editar imágenes y videos](/guide/library#edit-pictures-and-videos), [El editor de sonido](/guide/library#the-sound-editor)).

## Pedir un video

Describe la escena, qué se mueve y cómo, la cámara (“un acercamiento lento”, “sigue al ciclista”), el estilo y la luz, y cualquier sonido o palabras habladas. El agente también puede:

- **empezar a partir de una imagen**: un archivo de imagen que sea el primer fotograma del video (“dale vida a esta foto”) y, en algunos modelos, otro con el que termine, para los modelos con la etiqueta **A partir de una imagen**;
- **seguir imágenes**: hasta 4 imágenes de un personaje, un producto o un estilo que el video debe respetar, sin ser sus fotogramas;
- **modificar un video**: un archivo de video (MP4, WebM o MOV, de hasta 40 MB) para que lo edite, lo extienda o lo mejore un modelo con la etiqueta **Edita videos**.

Un video tarda desde menos de un minuto hasta varios. El agente lo espera, unos nueve minutos como máximo; cuando tarda más, la app sigue esperándolo y lo guarda cuando está listo, y el agente lo muestra cuando vuelve a comprobarlo. Esperar no cuesta nada más.

Los videos se guardan en una carpeta **videos** dentro de la carpeta de la sesión, con un nombre basado en lo que muestran.

En la conversación:

- Mientras el modelo trabaja, un marcador con la forma del video dice “Creando un video” con el tiempo transcurrido.
- Después el video aparece con la respuesta, listo para reproducirse (también a pantalla completa, desde sus controles), con la descripción y el nombre del modelo debajo, y **Conservar**. Encima, al pasar el cursor por él, aparecen **Editar** (el editor de video: lo que guardes se conserva), **Mostrar en los archivos**, **Descargar** y **Más** (⋯: lo mismo que bajo una imagen, con **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** en la app de escritorio).
- “Todavía se está creando” significa que el agente dejó de esperar antes de que el video estuviera listo: aparecerá cuando el agente vuelva a comprobarlo (pídeselo, si no lo hace). “Sin video esta vez” indica el motivo: cerraste el formulario, o el modelo lo rechazó (sus palabras explican por qué).

## Pedir música, una voz o un sonido

Dile al agente lo que quieres escuchar:

- **Música**: el género y el ánimo, los instrumentos, el tempo, la voz que canta y cómo lo hace (“una canción synth-pop animada de 2 minutos sobre las mañanas de lunes, con una mujer cantando y un estribillo pegadizo”). Da tu propia letra, o deja que el modelo la escriba; pide una pieza instrumental cuando no quieras canto. Lyria 3 Clip siempre crea 30 segundos; Lyria 3 Pro crea hasta unos 3 minutos, si lo pides. Una canción tarda uno o dos minutos.
- **Una narración**: las palabras que se dirán, exactamente, y cómo deben sonar (“lee esto con una voz tranquila y grave, despacio”). Con un modelo que tiene voces propias, eliges una en el formulario; Seed Audio crea la voz que describas. También funciona una conversación entre varios hablantes (“una introducción corta de podcast con dos presentadores”), con los modelos que los voceen.
- **Una voz copiada de una grabación**: dale al agente de 1 a 3 grabaciones de la voz, archivos de esta computadora (WAV, MP3, M4A, OGG o FLAC, de hasta 30 MB cada uno; se usan los primeros 30 segundos de cada una), para un modelo que **Copia voces** (Seed Audio). Usa solo una voz que puedas usar: la tuya, o una cuyo dueño haya dado su permiso. Con ffmpeg en la computadora sirve cualquiera de esos archivos; sin él, solo WAV y MP3.
- **Un efecto de sonido o un ambiente**: qué es, qué ocurre y cuándo (“lluvia fuerte sobre un techo de lámina, un trueno que se acerca al final, sin voces”), y cuánto dura.
- **Otro modelo** para un solo sonido, cuando lo nombras (“léelo con ElevenLabs v3”), sin cambiar la Configuración.

Los sonidos se guardan en una carpeta **audio** dentro de la carpeta de la sesión, con un nombre basado en lo que son, como MP3 (o WAV, cuando lo pides).

En la conversación:

- Mientras el modelo trabaja, una tarjeta dice “Creando música”, “Creando una narración” o “Creando un sonido”, con el tiempo transcurrido.
- Después el sonido aparece con la respuesta, en un reproductor: el botón redondo lo reproduce y lo pausa (solo suena un sonido a la vez), su forma es la barra para moverte por él (haz clic o arrastra), y luego están el tiempo y la velocidad (**1×**, **1.25×**, **1.5×**, **2×** o **0.75×**). Mientras el reproductor tiene el foco, Espacio o K lo reproduce y lo pausa, y ← → avanzan o retroceden 5 segundos. Su título viene del nombre del archivo, y junto a él están **Editar** (el [editor de sonido](/guide/library#the-sound-editor): lo que guardes se conserva), **Mostrar en los archivos**, **Descargar** y **Más** (⋯: lo mismo que bajo una imagen, con **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** en la app de escritorio). Debajo están las palabras a partir de las cuales se creó, el nombre del modelo y **Conservar** (consulta [Conservar lo que creó un agente](#keep-what-an-agent-made)); la **Letra** de una canción se abre debajo.
- Sin una clave de OpenRouter ves “El audio necesita una clave de OpenRouter”, con **Añadir una clave de OpenRouter**. “Sin sonido esta vez” indica el motivo: cerraste el formulario, o el modelo lo rechazó (sus palabras explican por qué).

El agente no puede oír lo que creó: conoce el sonido por lo que pidió. Si no suena bien, di qué cambiar y creará otro; o pide que lo editen (“haz un fundido en los últimos dos segundos del jingle”, “ponlo bajo mi narración en el 0:05”), el agente o tú en el editor de sonido.

## Imágenes en lo que crean los agentes

Cuando un agente crea o modifica diapositivas, un documento o una página para ti, las ilustra por sí mismo donde una imagen aporta algo (una diapositiva de título, una sección, una idea; no todas las diapositivas), con sus colores y su aspecto, como lo haría un diseñador: una imagen Rápido para un fondo, una textura o un icono, una Mejor para una escena, una foto o un diagrama, un dibujo para un icono, un logotipo o un diagrama que debe verse nítido, una gráfica para los números, fotos gratuitas de lugares y cosas reales, y sus imágenes recortadas, borradas o editadas para que encajen. Trabaja a partir de las imágenes que ya están en lo que tienes abierto además de los archivos y, si se lo pides, escribe una descripción para cada imagen de una presentación que no la tenga, para quienes no pueden verlas (lo hace el modelo que describe las imágenes que conservas). Lo que cuesta dinero se muestra con su precio en el formulario antes de crearse ([Revisar la configuración antes de crear nada](#check-the-settings-before-anything-is-made)); di “sin imágenes”, o “solo fotos gratuitas”, cuando lo quieras de otra manera.

Cuando pides por su nombre algo de un tipo conocido (una diapositiva FODA, una presentación para inversionistas, una carta de presentación, un resumen ejecutivo, un seguimiento de hábitos, una tabla de precios, un presupuesto), el agente primero lee cómo crea la app bien ese tipo de cosa: qué lleva, en qué orden, qué aspecto tiene y dónde ayudan las imágenes, igual que se crean los tipos de la galería ([Creado con IA a partir de un tipo](/guide/library#made-with-ai-from-a-kind)). Eso no cuesta nada.

En una [sesión confidencial](/guide/sessions#keep-a-session-confidential) nada de esto está disponible: su agente no crea, busca ni edita imágenes ni videos.

## Conservar lo que creó un agente

**Conservar**, bajo una imagen, un video o un sonido creado por un agente, guarda una copia en los archivos de un proyecto, donde un modelo escribe un título y una descripción (para un sonido, a partir de las palabras con que se creó, ya que ningún modelo puede oírlo; el modelo se elige en [Configuración → Capacidades → Imágenes, video y audio → Descripciones de lo que conservas](/settings?s=images&find=Captions%20for%20what%20you%20keep)), y donde permanece después de que se limpie la carpeta de la sesión. Cuando tienes proyectos, un menú breve pregunta adónde va (**Guardarla en**): primero el proyecto propio de la sesión, luego tus otros proyectos, y **Sin proyecto**, que la conserva con la conversación, donde la encuentra el cuadro de búsqueda (Ctrl+K). El botón pasa entonces a decir **Conservada** y la abre. Una imagen que conservaste aparece entre los archivos de su proyecto (los detalles del proyecto → **Archivos**, como un mosaico con su imagen), y en el editor, **Conservar** guarda una imagen editada como una nueva, mientras que **Guardar** la devuelve a donde estaba y **Guardar una copia** conserva otra a su lado.

## Dictar un mensaje

El micrófono del cuadro de mensaje (en la página de inicio y en cada sesión) convierte lo que dices en texto dentro de tu mensaje. Nada se envía solo: lo revisas y lo envías como de costumbre.

1. Haz clic o toca el micrófono.
2. Habla. Un panel sobre el cuadro de mensaje muestra el tiempo, las palabras escuchadas hasta ahora (o, cuando el servidor reconoce la voz, "Grabando…" con barras que siguen tu voz) y el idioma que escucha.
3. Haz clic en **Hecho**, o de nuevo en el micrófono. Las palabras se unen a lo que ya habías escrito (con el servidor, antes se muestra un momento "Convirtiendo tus palabras en texto…").

El chip de idioma del panel ("DE", "PT-BR") cambia el idioma mientras hablas; sigue en el nuevo. Cuando el servidor reconoce la voz, una grabación se detiene sola a los 10 minutos.

El micrófono aparece solo donde el dictado puede funcionar: cuando el navegador reconoce la voz por sí mismo (Chrome, Edge, Safari), o cuando lo hace el servidor (consulta [Reconocimiento de voz en el servidor](/guide/documents-voice#speech-recognition-on-the-server)). Cuando no puede iniciarse, te dice por qué y qué hacer:

- **El micrófono necesita una conexión segura**: los navegadores solo lo permiten en una dirección HTTPS, o en localhost en la propia computadora. Abre Hydor mediante una dirección HTTPS (consulta [Teléfonos, otras máquinas y uso compartido](/guide/devices)).
- **El micrófono está bloqueado para este sitio**: permítelo en la configuración de sitios del navegador (en un iPhone: **aA** en la barra de direcciones, luego **Configuración del sitio web → Micrófono**) y vuelve a intentarlo.
- **No se encontró ningún micrófono**, o **El micrófono está ocupado** (otra app lo está usando).
- **El reconocimiento de voz está desactivado aquí**: en un iPhone, activa el Dictado en Configuración → General → Teclado; o deja que el servidor reconozca la voz.
- **Este navegador no puede grabar**: usa una versión actual de Chrome, Edge, Firefox o Safari.

Cada una de estas notas tiene un botón **Configuración de voz**, que abre Configuración → Voz.

## Configurar la voz

Todo lo relacionado con la voz está en **[Configuración → Capacidades → Voz](/settings?s=voice)** (en un teléfono: Configuración y luego **Voz**). Tiene tres partes.

### Dictado

**[Dictado](/settings?s=voice&find=Dictation)** indica primero lo que puede hacer este navegador:

- Un navegador que reconoce la voz por sí mismo muestra tus palabras mientras hablas. Puede enviar tu voz a su fabricante para hacerlo (Chrome a Google, Safari a Apple). Para que tu voz se quede en tu máquina, activa whisper.cpp más abajo y elige el servidor.
- Un navegador que no puede reconocer la voz por sí mismo dicta a través del servidor, una vez que el reconocimiento de voz en el servidor está activado.

Después:

- **[Idioma que hablas](/settings?s=voice&find=Language%20you%20speak)**: **Igual que este navegador**, o uno de 56 idiomas y regiones. El dictado escucha en ese idioma, y el modo manos libres habla y escucha en él.
- **Reconocer con**: **Este navegador** (las palabras aparecen mientras hablas) o **El servidor** (privado con whisper.cpp; las palabras llegan cuando terminas). Solo aparece cuando ambos pueden hacerlo.

El idioma y **Reconocer con** se guardan en este navegador, así que cada uno de tus dispositivos tiene los suyos.

### Reconocimiento de voz en el servidor

**[Reconocimiento de voz en el servidor](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** es para los navegadores que no pueden reconocer la voz por sí mismos, o para mantener tu voz en tu máquina. Está desactivado hasta que lo actives, y antes no se descarga nada. Se configura una sola vez para toda la app, en todos los dispositivos. En **Dónde se ejecuta**, elige una de las tres opciones:

- **Desactivado**.
- **En esta máquina**: whisper.cpp se ejecuta en la computadora que ejecuta Hydor, en su GPU cuando tiene una que whisper.cpp pueda usar (la de un Mac o una GPU NVIDIA) y, si no, en su procesador, y tu voz se queda allí.
  - **Modelo**: **Diminuto** (74 MB; el más rápido, se equivoca en alguna palabra de vez en cuando), **Base** (141 MB; rápido y suficientemente bueno para la mayoría de los dictados, el predeterminado), **Pequeño** (465 MB; oye mejor, unos segundos por frase en una CPU) o **Media** (1,4 GB; oye mejor que ninguno, lento sin una CPU rápida).
  - **Idiomas**: **Cualquier idioma** (sigue el idioma que hablas) o **Solo en inglés** (algo más preciso en inglés).
  - **Activar · descargar …** indica cuánto se descarga: el modelo y, la primera vez, el propio whisper.cpp (cuando ya está todo, al elegir **En esta máquina** se activa al instante). Una barra muestra la descarga; **Cancelar** la detiene y desactiva el reconocimiento en el servidor. En Linux la app descarga un whisper.cpp ya compilado, que se ejecuta en el procesador; en un Mac, y donde el ya compilado no funciona, compila whisper.cpp en esta computadora, lo que requiere un compilador de C++ y CMake (en Debian o Ubuntu: `sudo apt install build-essential cmake`; en un Mac: `xcode-select --install`, y luego `brew install cmake`). En un Mac se compila para la GPU del Mac (Metal). Un whisper.cpp propio en la computadora (uno compilado para tu GPU, por ejemplo) se usa tal cual.
  - **Una GPU NVIDIA** en Linux: whisper.cpp no tiene una versión ya compilada para ella, así que, cuando el dictado funciona en el procesador, la app compila una para la GPU en segundo plano, con el kit de herramientas CUDA de NVIDIA (`nvcc`). Una barra muestra el avance (tarda de 5 a 20 minutos); mientras tanto el dictado funciona en el procesador, y después en la GPU. Sin el kit de herramientas, una nota lo indica, con **Comprobar de nuevo** para cuando lo hayas instalado; si la compilación falla, se muestra el motivo con **Reintentar**, y el dictado sigue en el procesador.
  - Cuando está listo: "Listo: whisper.cpp … con el modelo Base. Tu voz se queda aquí.", y debajo dónde se ejecuta, según lo que whisper.cpp dijo la última vez que se ejecutó (prueba un segundo de silencio en cuanto está listo): "Se ejecuta en la GPU: Apple M2 Pro (Metal)." o "Se ejecuta en el procesador de esta máquina." Si la GPU falla (por quedarse sin memoria, por ejemplo), esa grabación se hace en el procesador, la nota explica el motivo, y la GPU se vuelve a probar unos minutos después. **Probar** comprueba que responde y con qué rapidez. Si algo falló, se muestra el motivo con **Reintentar**.
  - Si eliges otro modelo mientras está activado, se descarga ese modelo.
- **Un servicio**: cualquier servicio con la dirección de voz a texto de OpenAI (`/audio/transcriptions`): el propio OpenAI, o un servidor de tu red (Speaches, LocalAI, el servidor de whisper.cpp, uno con GPU). Las grabaciones se le envían a él.
  - **Configuración** (luego **Editar**) en la fila del servicio abre un formulario: **Dirección** (como `https://api.openai.com/v1`), **Clave de API** (la mayoría de los servidores de tu red no necesitan ninguna) y **Modelo** (`whisper-1` a menos que indiques otro).
  - **Guardar y activar** (luego **Guardar**); **Probar** en su fila una vez activado; y **Quitar la clave** en su menú **⋯** una vez guardada una clave. Una vez guardado un servicio, al elegir de nuevo **Un servicio** se cambia a él al instante.

Un grupo, **En esta máquina**, con su tamaño total, enumera lo que whisper.cpp dejó en esta computadora: el propio whisper.cpp ("compilado aquí para Metal" o "para CUDA" cuando la app lo compiló para una GPU) y cada modelo con su tamaño, el que se usa marcado como "en uso". El menú **⋯** de un modelo tiene **Quitar** (quitar el que está en uso desactiva el reconocimiento en el servidor, después de que confirmes). **Quitar todo**, en el menú **⋯** del propio grupo, quita whisper.cpp y sus modelos; aparece mientras el reconocimiento en el servidor está desactivado o usa un servicio.

### Lectura en voz alta

**[Lectura en voz alta](/settings?s=voice&find=Read%20aloud)**: el altavoz de una respuesta te la lee, omitiendo su código. Cada navegador guarda su propia voz y velocidad (el (i) del grupo lo indica).

- **Voz**: **Automático** (la voz del navegador para el idioma que hablas), o cualquier voz que tenga este navegador, primero las de tu idioma. Cada una indica su idioma y "en línea" cuando necesita internet.
- **Velocidad**: de 0,5× a 2×.
- **Pruébalo**: **Reproducir una muestra** lee una frase con esa voz y velocidad.

Si el navegador no puede leer texto en voz alta, la sección lo indica.

## Escuchar una respuesta en voz alta

1. Apunta a una respuesta: aparece un altavoz en su esquina superior derecha, junto al botón de copiar.
2. Haz clic en él. Una barra sobre el cuadro de mensaje muestra **Leyendo en voz alta**, qué parte de cuántas, y las primeras palabras de la respuesta.
3. Pausa y reanuda la lectura desde la barra, o deténla allí o con el altavoz.

Lee la respuesta como palabras sencillas: el código se omite, los enlaces se leen por sus palabras, las direcciones web por su sitio y las tablas fila por fila. Empezar otra respuesta detiene la primera, y salir de la conversación detiene la lectura. El altavoz aparece cuando apuntas con el ratón; en un teléfono, el modo manos libres te lee las respuestas ("Léeme la respuesta").

## Hablar con la app con manos libres

El modo manos libres es para cuando no puedes mirar la pantalla, por ejemplo mientras caminas: hablas, la app lo hace y te dice lo que hizo, y luego vuelve a escuchar. Empieza sesiones, les pasa tus palabras, te dice cómo van, responde a sus aprobaciones y te lee sus resultados.

### Iniciarlo y terminarlo

- En una sesión, el botón de los auriculares del cuadro de mensaje (**Manos libres**, junto al micrófono) lo abre, siguiendo esa sesión.
- En la página de inicio, el mismo botón lo abre sin seguir ninguna sesión en particular.
- En el cuadro de búsqueda (Ctrl+K, ⌘K en un Mac), la acción **Hablar con manos libres** también lo abre.

Ocupa toda la pantalla, dice "Te escucho" y pide al dispositivo que mantenga la pantalla encendida mientras está abierto. Arriba ves la sesión que sigue (o "Habla con Hydor"). El gran botón redondo muestra lo que está haciendo: **Escuchando…**, **Trabajando en ello…**, **Hablando** o **En pausa: toca para escuchar**. Debajo ves lo que oyó, entre comillas, y su respuesta.

- Toca el botón redondo mientras habla para interrumpirlo; tócalo en otros momentos para pausar o seguir escuchando.
- Para terminarlo, di "Adiós" (o "Chao", "Eso es todo", "Deja de escuchar", "Terminar manos libres", "Salir"), o toca la cruz de la esquina superior derecha.

### Qué puedes decir

- **Empezar una sesión**: "Empieza una sesión para planear mi fin de semana en Creta". Empieza como lo haría la página de inicio: con el programa, el modelo, el esfuerzo, los permisos, el agente y el proyecto que elegiste allí por última vez, en una carpeta de tarea nueva (o en la carpeta que elegiste allí por última vez). Desde entonces sigue esa sesión.
- **Decirle algo a una sesión**: "Dile que use unidades métricas". Las palabras van a la sesión que sigue, como tu mensaje.
- **Preguntar cómo van las cosas**: "¿Cómo van mis sesiones?". Dice qué está trabajando, qué te necesita y qué pregunta, y qué terminó recientemente.
- **Escuchar el resultado**: "Léeme la respuesta". Dice la última respuesta de la sesión que sigue (o, cuando no sigue ninguna, de la sesión más activa o más reciente). Una respuesta larga llega como resumen, en tres a cinco frases; cuando la app se muestra en otro idioma distinto del inglés, toda respuesta llega como resumen en ese idioma.
- **Responder a una aprobación**: "Aprobar" o "Rechazar", cuando la sesión que sigue (o, cuando no sigue ninguna, cualquier sesión) espera un simple sí o no. Una pregunta, un plan o un formulario hay que responderlos en la pantalla, y te lo dice.
- **Detener el trabajo**: "Detente" detiene lo que está haciendo la sesión que sigue (no termina el modo manos libres).
- **Cambiar**: nombra otra sesión ("Hablemos del viaje a Creta") y sigue esa.
- Pregunta sobre la app, o sobre cualquier otra cosa: responde brevemente, o te pregunta cuando no está seguro.

### Lo que te dice por sí solo

- Cuando la sesión que sigue termina: "… ha terminado. Di “léelo” para escuchar la respuesta."
- Cuando cualquier sesión te necesita: "… te necesita: …", y luego "Di aprobar o rechazar" para un simple sí o no, o "Respóndelo en la pantalla". Después sigue esa sesión, así que "Aprobar" la responde.
- Cuando cualquier sesión se detiene con un error: "… se detuvo con un error."

Deja de escuchar para decir esto y luego vuelve a escuchar. Las sesiones de tus otras máquinas no se anuncian.

### Conviene saber

- El modelo auxiliar entiende lo que dices ([Configuración → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)). Si no se puede acceder a él, las palabras sencillas siguen funcionando: "estado", "aprobar" o "sí", "rechazar" o "no", "detente", "leer", "empezar …"; cualquier otra cosa va a la sesión que sigue, o empieza una sesión nueva cuando no sigue ninguna.
- Responde en el idioma en que se muestra la app (Configuración → General → Idioma), y escucha en el idioma que hablas (Configuración → Voz), y si no, en el idioma de la app.
- Habla con la voz y la velocidad de [Lectura en voz alta](/guide/documents-voice#read-aloud).
- Necesita un navegador que pueda leer en voz alta y una forma de escuchar: el reconocimiento de voz del propio navegador (Chrome, Edge, Safari), o el reconocimiento de voz en el servidor. Los auriculares aparecen solo donde puede funcionar. Con el servidor, cada cosa que dices termina tras un segundo y medio de silencio (medio minuto como máximo), y vuelve a escuchar tras 15 segundos de silencio.
- Si el micrófono no está permitido o no hay ninguno, lo dice una vez y se pone en pausa: permítelo en el navegador y luego toca para escuchar.

## Pide a un agente

- “Rellena el formulario ~/Downloads/visa-application.pdf con mis datos del perfil y pídeme el resto.”
- “Escribe la fecha de hoy y mi nombre en las líneas de ~/Documents/permission-slip.pdf, y marca Sí.”
- “Saca las páginas 3 a 5 de ~/Documents/contract.pdf y guárdalas en un archivo aparte.”
- “Activa el reconocimiento de voz en esta computadora, con el modelo Small.”
- “Usa mi servidor de voz en http://192.168.1.20:8000/v1 para el dictado, con el modelo whisper-large-v3.”
- “¿Qué modelos whisper hay en esta computadora y cuánto espacio ocupan? Quita los que no se usen.”
- “¿El dictado se ejecuta en mi GPU? Si no, ¿por qué?”
- “¿Qué modelos de imagen usan ahora los agentes para la mayoría de las imágenes y para las sencillas, y más o menos cuánto cuesta una imagen con cada uno?”
- “Cambia el modelo de imagen para la mayoría de las imágenes al más barato que pueda editar imágenes.”
- “Usa Recraft V4.1 Flash para las imágenes sencillas.”
- “Configura las herramientas de imagen en esta computadora.”
- “¿Las herramientas de imagen se ejecutan en la tarjeta gráfica de aquí? Si alguna se ejecuta en la CPU, ¿por qué?”
- “Haz un ícono plano de una bicicleta en #0f766e y #f59e0b, como un dibujo que se vea nítido a cualquier tamaño.”
- “Grafica ~/data/sales.csv como barras mensuales, 2025 frente a 2026, y señala el salto de primavera.”
- “Busca tres fotos gratuitas de los tranvías de Lisboa para mis diapositivas de viaje, con sus créditos.”
- “Quita el fondo de ~/Pictures/mug.jpg.”
- “Borra al hombre de la izquierda de beach.jpg; si queda borroso, haz que lo haga un modelo de imagen.”
- “Recorta ~/Pictures/team.jpg a 16:9, aumenta un poco el brillo y difumina los rostros del fondo.”
- “Recorta demo.mp4 a la parte entre 0:12 y 0:40, pon ‘Nuestra nueva app’ al principio y haz también un GIF.”
- “Quita los ‘eh’ y las pausas largas de interview.m4a, reduce el siseo de fondo y súbele el volumen hasta el de un pódcast.”
- “Evita que los agentes creen imágenes.”
- “¿Qué modelos de video generan sonido y cuánto cuesta un segundo con cada uno?”
- “Haz que los agentes usen Kling para los videos.”
- “Evita que los agentes creen videos.”
- “¿Qué modelo de música usan los agentes y cuánto cuesta una canción?”
- “Usa ElevenLabs v3 para las locuciones, con la voz George.”
- “Evita que los agentes creen audio.”
