# Deja que los agentes manejen la app por ti

Cada agente de aquí conoce esta guía y puede manejar la app por ti. Pregúntale cómo funciona algo y responderá a partir de la guía, con un enlace al lugar indicado. Pídele que cambie una configuración o que prepare algo (un proyecto, un agente, una tarea programada) y lo hará, después de que lo confirmes en una tarjeta. Cuando necesite datos tuyos, te mostrará un formulario para rellenar.

![Un agente cambiando una configuración por ti: la tarjeta muestra el cambio antes de hacerlo](images/ask-agents.webp)

## Pregunta cómo se hace algo

En cualquier sesión, con cualquier agente, pregunta sobre la app como se lo preguntarías a una persona: "¿Cómo comparto esta sesión con un colega?", "¿Dónde activo las notificaciones en mi teléfono?", "¿Qué hace el modo Auto?". El agente busca la respuesta en esta guía, así que describe la app tal como es ahora, y sus enlaces abren el lugar que menciona.

También puedes leer la guía por tu cuenta: **Ayuda** en la barra de iconos, o búscala en el cuadro de búsqueda (Ctrl+K, ⌘K en una Mac), donde sus secciones aparecen bajo **Guía**. En Ayuda, una pregunta escrita en el cuadro de arriba va a un agente cuando pulsas Enter, y la respuesta aparece junto a la guía (consulta [Obtener ayuda](/guide/start#get-help)).

## Pide a un agente que cambie una configuración o que prepare algo

Los agentes pueden hacer en la app lo que tú podrías hacer en sus páginas. Algunos ejemplos de lo que puedes pedir:

- "Activa la búsqueda por significado."
- "Crea un proyecto llamado Tesis para mi disertación, con el agente Investigador."
- "Cada día laborable a las 8, dame un resumen de noticias sobre energías renovables."
- "Añade a mis pautas que las respuestas deben ser breves."
- "Usa Brave Search antes que DuckDuckGo."
- "Elimina las notas de memoria sobre mi antiguo trabajo."
- "¿Qué apps tengo? Ejecuta el planificador de viajes para un fin de semana largo en Lisboa."
- "Cambia este dispositivo al tema claro."
- "Usa Opus en esta sesión y piensa con más esfuerzo." "Sal del modo plan y adelante."

El agente primero lee cómo están las cosas ahora y luego te pide que confirmes el cambio en una tarjeta de la conversación. Leer nunca pide confirmación: un agente siempre puede mirar tu configuración, tus proyectos, tus tareas y el resto para responderte.

## Pide a un agente que haga lo que hace un editor

Los agentes cambian lo que guardas como lo harías en sus editores: escriben presentaciones, documentos, hojas de cálculo, documentos LaTeX, cuadernos y diagramas, y hacen de una sola vez lo que un editor hace con un clic sobre el conjunto de uno de ellos:

- **Diapositivas**: animar todas las diapositivas (**Sutil**, **Animado** o **Llamativo**, o quitar todas las animaciones), corregir lo que encuentre **Revisar la accesibilidad**, describir las imágenes que no tienen descripción, hacer la presentación compatible con PowerPoint o devolverla al formato web, darle un tema ya hecho o uno tuyo, poner las diapositivas en formato ancho o estándar, traer diapositivas de otra presentación y actualizar los gráficos creados a partir de una hoja de cálculo.
- **Documentos**: aceptar o rechazar los cambios sugeridos, cambiar la configuración de la página y poner un encabezado, un pie de página y números de página.
- **Hojas de cálculo**: ordenar una tabla, quitar sus filas duplicadas, rellenar hacia abajo o hacia la derecha, borrar celdas, recortar espacios, dividir palabras en columnas, resumir una tabla en una hoja nueva (como hace **Datos → Resumir por**), insertar o quitar filas y columnas, y cambiar el nombre, copiar, mover o eliminar hojas; las fórmulas se ajustan, como en el editor.
- **Documentos LaTeX**: cambiar el nombre o mover archivos, imágenes y carpetas, y las líneas que los nombran se actualizan.
- **Cuadernos**: borrar las salidas.
- **Diagramas**: reorganizar una página (o todas) como un diagrama de flujo hacia abajo o a lo ancho, un árbol, un mapa mental, anillos, un círculo o una cuadrícula, y dar a todas las formas un mismo aspecto, a sus textos una misma fuente, o a todo el diagrama el aspecto de un dibujo a mano.
- **Cualquiera de ellos**: una copia guardada como nueva, u otro tipo de archivo creado a partir de él (**Convertir en**).

Cada uno guarda una versión nueva (la anterior queda entre las versiones), el editor abierto sobre él lo muestra al instante, y tus propios cambios y comentarios se conservan. Son gratis e instantáneos, salvo describir imágenes, que lo hace un modelo. El agente junto a una página ([Cambiar algo pidiéndoselo a un agente](/guide/library#change-it-by-asking-an-agent)) los conoce todos y sabe exactamente lo que elegiste. Por ejemplo:

- "Anima todas las diapositivas de mi 'Plan de lanzamiento', en modo animado, y corrige lo que encuentre la revisión de accesibilidad."
- "Haz mis diapositivas de 'Plan de lanzamiento' compatibles con PowerPoint."
- "Acepta las sugerencias de María en el documento 'Presupuesto' y rechaza el resto."
- "En mi hoja de cálculo 'Ventas', ordena la tabla por ingresos, de mayor a menor, y quita las filas duplicadas."
- "En mi tesis en LaTeX, mueve las imágenes de figures/ a img/."
- "Organiza mi diagrama 'Flujo de pago' de izquierda a derecha y haz que todas las formas sean azules."

## La tarjeta: confirmar un cambio

Antes de que un agente cambie algo, aparece una tarjeta en la conversación (y en tu [bandeja de entrada](/inbox), con una notificación si no estás cerca). Indica:

- **En qué consiste el cambio**, en palabras del agente: "Crear el proyecto “Tesis”".
- **Lo que cambia**, campo por campo: una configuración como está ahora y como quedará ("**Resultados**: 10 → 20"), o con qué se creará algo nuevo.
- **La llamada en sí**, en letra pequeña (por ejemplo `PUT /api/search/settings`), para que veas exactamente lo que va a pasar, diga lo que diga el agente.

Después eliges:

- **Permitir** hace el cambio.
- **Permitir en esta sesión** lo hace, y deja que esta sesión haga más cambios del mismo tipo cotidiano sin volver a preguntar. Los cambios que preguntan siempre (abajo) siguen preguntando.
- **No** (o **Rechazar**) no cambia nada. Puedes explicar por qué, o qué hacer en su lugar, y el agente lo lee.

Algunos cambios preguntan siempre, incluso después de **Permitir en esta sesión**: eliminar cualquier cosa, empezar una sesión o la ejecución de una tarea programada, enviar un mensaje a otra sesión, añadir un servidor MCP, añadir, activar o cambiar un plugin, cambiar lo que los agentes pueden hacer en Custom o en el navegador, añadir una máquina o una cuenta, descargar un modelo, configurar en esta computadora las herramientas de imágenes, actualizar la app. En una eliminación, el botón dice **Eliminar**.

Una tarjeta espera unos nueve minutos. Si no respondes en ese tiempo, desaparece y el agente te pregunta en su respuesta.

## Cuando un agente necesita datos: formularios

Cuando un agente necesita varias cosas de ti, puede mostrar un formulario en la conversación en lugar de una lista de preguntas: las fechas y el presupuesto de un viaje, el nombre y los campos de una app nueva. Rellénalo y haz clic en el botón (**Enviar**, o como lo haya llamado el agente); **Ahora no** lo cierra, y el agente sigue sin él o te pregunta con palabras.

Un formulario espera todo el tiempo que necesites. Si no has respondido en unos nueve minutos, el agente termina su turno ahí y el formulario queda en la conversación, incluso si el agente se detiene o la app se reinicia. Cuando lo rellenas, tus respuestas llegan al agente como tu siguiente mensaje ("Mis respuestas a …"), y él continúa desde ahí; si no consiguen llegar, el formulario queda para que lo envíes de nuevo. Un formulario más alto que la pantalla se abre por arriba, con **Último** para ir al final.

Una tarjeta de cambio también puede llevar un formulario: "Crear un proyecto" puede mostrar el nombre, la descripción y las pautas que el agente supuso, para que las corrijas antes de hacer clic en **Guardar**.

## Lo que los agentes no pueden hacer en la app

Algunas cosas siguen siendo tuyas. Si un agente lo intenta, se le indica dónde lo haces tú:

- tu contraseña y el inicio y cierre de sesión ([Configuración → Contraseña](/settings?s=security), [Cuentas](/settings?s=accounts));
- los valores de las claves y de los inicios de sesión: un agente los pide con una tarjeta donde los escribes en la bóveda, y nunca los ve ([Apps conectadas, claves y herramientas](/guide/connections)); la clave de OpenRouter tiene su propia tarjeta, que la pone directamente en Configuración → Modelos ([Cuando un agente necesita la clave de OpenRouter](/guide/documents-voice#when-an-agent-needs-the-openrouter-key));
- crear tokens de acceso para otras máquinas o agentes, y las claves de API de una app;
- responder tarjetas de aprobación, propias o de otra sesión, y decidir sobre las tarjetas que te preguntan (una habilidad propuesta, una tarea programada, una publicación);
- archivos, comandos, terminales y git a través de la app: los agentes usan sus propias herramientas para eso, que te preguntan según los permisos de la sesión;
- las herramientas de IA propias de los editores y los editores de imágenes y de video: los agentes crean, buscan, cambian y editan imágenes, dibujos, gráficos y videos con herramientas propias, que guardan lo que hacen en la carpeta de la sesión ([Documentos, imágenes, videos y voz](/guide/documents-voice)), y narran diapositivas con una locución de las notas de cada diapositiva.

## Permisos y tarjetas

Lo que permiten los permisos de una sesión decide cuánto preguntan las tarjetas:

- **Plan** (y **Solo lectura** de Codex): el agente puede leer la configuración de la app y responder preguntas, pero no cambia nada. Te dice lo que cambiaría. Hay una excepción: la configuración de su propia sesión. Pídele que salga del modo Plan, que use otro modelo o que piense con más esfuerzo, y te lo pregunta en una tarjeta.
- **Preguntar**, **Aceptar ediciones**, **Auto** y similares: los cambios preguntan en una tarjeta, como se explicó antes.
- **Omitir** (Claude Code) y **Acceso total** (Codex): sin tarjetas; el agente hace los cambios que pides. Aun así se muestra un formulario cuando el agente necesita datos.
- **Acceso total** de Custom: sin tarjetas de aprobación, incluso para los cambios que normalmente preguntan siempre. Aun así se muestra un formulario cuando se necesitan datos.

Sean cuales sean los permisos, un cambio en los permisos de una sesión o en su límite de gasto te pregunta siempre en una tarjeta, sin **Permitir en esta sesión**: "Cambiar esta sesión a Omitir", "Subir el límite a 20 $". Puedes pedirlo tanto en la app como en la terminal; la terminal muestra la misma tarjeta, y **y** o **n** la responde.

## Configuración guardada en cada dispositivo

Unas pocas configuraciones pertenecen a cada dispositivo y no a la app: el tema, el idioma, el sonido de las notificaciones, lo que hace Enter mientras un agente trabaja, las sugerencias de la terminal y si se muestra la barra lateral. Un agente puede cambiarlas en el dispositivo desde el que le hablas (las páginas que muestran esa sesión), sin tarjeta: "Cambia al tema oscuro", "Usa el tema Sage", "Muestra la app en griego". Tus otros dispositivos conservan los suyos.

## Pregunta a un agente

- "¿Cómo recibo notificaciones en mi teléfono?"
- "Crea un proyecto para mis proyectos de jardín y dale esta pauta: vivimos en un clima frío."
- "Desactiva las capturas de pantalla del navegador."
- "Muéstrame qué tareas programadas tengo y desactiva el seguimiento de precios."
- "Cambia este dispositivo al tema claro."
- "Cambia esta sesión a Sonnet con poco esfuerzo."
