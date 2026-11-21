# Búsqueda y navegador

Los agentes de la app pueden buscar en la web, leer páginas y usar un navegador real, sea cual sea su modelo. Este tema explica los proveedores de búsqueda que usan y cómo configurarlos, qué muestra una búsqueda y sus fuentes, y el navegador: verlo en vivo, tomar el control para iniciar sesión, resolver una verificación o pagar, y su configuración. También explica la página Navegador, un navegador propio en la app de escritorio (pestañas, pestañas privadas, una barra de direcciones inteligente, marcadores, historial, un bloqueador de anuncios, traducción, vista de lectura, extensiones), y cómo pasar una de sus páginas a un agente. En la app de escritorio (Mac, Windows, Linux), el navegador funciona dentro de la app, y los agentes también pueden usar la computadora en sí: su pantalla, el mouse y el teclado.

![Un agente que buscó en la web, leyó páginas y comparó lo que encontró en una tabla](images/web.webp)

## Cómo buscan los agentes en la web

Cada agente que ejecutas aquí (Claude Code, Codex, Custom y los agentes que usan ACP) recibe tres herramientas de la app: una búsqueda web, una forma de leer una página y una forma de encontrar imágenes y videos de cosas. Funcionan igual sea cual sea el modelo, así que un modelo pequeño en tu propia computadora busca tan bien como uno grande.

- Una búsqueda va a los proveedores de **Configuración → Capacidades → Búsqueda**, en su orden. Responde el primero que está activado. Cuando no puede (necesita una clave, se agotó su cuota, no hay acceso a él o pide demostrar que la búsqueda no viene de un bot), responde el siguiente. La respuesta le indica al agente qué proveedor respondió.
- Un agente puede pedir hasta 100 resultados y limitar una búsqueda a algunos sitios (o excluir sitios), a fechas, a idiomas, a PDF o a las páginas de inicio propias de los sitios (la página de una persona, un sitio web oficial). Naget Search también puede limitarse a tipos de páginas, como artículos científicos, preprints, artículos biomédicos, patentes de EE. UU., informes de empresas, noticias, documentación o debates. Cuando un proveedor no puede respetar un filtro, se le avisa al agente. Cuando un agente no define ningún filtro por sí mismo pero las palabras de su búsqueda indican alguno (“informes sobre el clima en nasa.gov del último mes”, “artículos sobre generación aumentada por recuperación desde 2024”), el modelo auxiliar los interpreta primero (consulta [Elegir el modelo auxiliar](/guide/agents-models#choose-the-helper-model)), y Naget Search busca las palabras restantes con esos filtros. Eso ocurre solo con las búsquedas cuyas palabras parecen indicar un filtro, unas pocas a la vez, y en unos 8 segundos. Cuando el modelo auxiliar no puede responder a tiempo, o fallan dos lecturas seguidas (la lectura se pausa entonces durante 10 minutos), la búsqueda se hace tal como la escribió el agente, igual que con SearXNG, Brave Search y DuckDuckGo, y cuando el agente define algún filtro por sí mismo. Si los filtros que interpreta no encuentran nada, Naget Search busca las palabras tal como están escritas.
- Naget Search también puede traer, para cada resultado, las frases de su página que responden a la búsqueda en lugar de un fragmento simple. Es más lento, así que los agentes lo piden cuando necesitan datos de las páginas. También funciona sin clave.
- Para una lista de cosas que mostrar (juegos, películas, lugares, platos, productos, equipos), un agente puede encontrar una imagen de cada una: la imagen de su propio artículo de Wikipedia (la portada de un juego, la foto de un lugar, el escudo de un equipo) o, si no, la que muestran sus páginas al compartirse; y, cuando se le pide, un video de YouTube cuyo título la nombre (un tráiler, una receta, los mejores momentos). Solo cuenta lo que nombra claramente la cosa, así que algunas vuelven sin imagen. Las apps lo usan para mostrar imágenes y videos en sus respuestas (consulta [Apps](/guide/apps)).
- A los agentes se les indica que citen las páginas que usan: un número entre corchetes después de lo que respalda cada página, y una lista solo de esas páginas al final de la respuesta. La app las muestra como enlaces y tarjetas (consulta [Ver las fuentes bajo una respuesta](/guide/web#see-the-sources-under-a-reply)). Los agentes tratan lo que dicen los resultados y las páginas como información, nunca como instrucciones.

Un proveedor que falló descansa un tiempo (hasta que vuelva su cuota, por ejemplo), para que las búsquedas siguientes no esperen por él. La misma búsqueda repetida en menos de 10 minutos recibe los resultados anteriores, sin volver a buscar.

Claude Code y Codex también tienen herramientas web propias. Cuando una respuesta cita las páginas que encontraron, estas se muestran del mismo modo.

## Elegir tus proveedores de búsqueda

Abre [Configuración → Capacidades → Búsqueda](/settings?s=search). En un teléfono, Configuración es una lista: toca **Búsqueda** en Capacidades.

En [Proveedores](/settings?s=search&find=Providers) (“Se prueban desde arriba: responde el primero que está activado”), cada proveedor tiene una fila:

- su nombre, con **Predeterminado** en el primero que está activado, y una advertencia como **Necesita una clave** o **Necesita la dirección de tu instancia** cuando no puede responder tal como está configurado;
- una línea sobre qué es; el (i) junto a su nombre añade a qué puede limitar una búsqueda, como “Hasta 100 resultados · categorías · fechas · páginas de inicio · las partes de las páginas que responden”;
- una pista de su clave guardada, si tiene una (como “sk-ab…12cd”: nunca la clave en sí);
- su último error, en rojo, con hace cuánto ocurrió;
- un interruptor a la derecha que lo activa o desactiva, y un menú **⋯** con **Añadir una clave** (o **Cambiar la clave**), **Establecer la dirección** (o **Cambiar la dirección**), **Probar**, **Establecer como predeterminado** (en un proveedor que está activado pero no es el primero), y **Subir** y **Bajar** para cambiar su lugar en el orden.

El (i) junto a **Proveedores** dice que los agentes pueden buscar en la web y leer páginas sea cual sea su modelo, y que los resultados de búsqueda y las páginas son datos externos, que los agentes usan como información, nunca como instrucciones.

**Establecer como predeterminado** mueve el proveedor al principio de la lista. De fábrica el orden es Naget Search, SearXNG, Brave Search, DuckDuckGo. Naget Search y DuckDuckGo vienen activados; SearXNG y Brave Search vienen desactivados, hasta que les des lo que necesitan.

### Naget Search

[Naget Search](/settings?s=search&find=Naget%20Search) es el predeterminado: el índice propio de Naget de la web, artículos, patentes e informes. No necesita clave: las búsquedas sin ella usan una cuota gratuita diaria. Una vez que ha respondido, su fila muestra **Cuota gratuita restante hoy** (cuántas de la cuota del día), una barra y cuándo vuelven a estar disponibles. Cuando se agota la cuota, la fila lo indica y responde el siguiente proveedor hasta que vuelva.

Una clave de naget.com da más búsquedas; con una, la fila muestra **Créditos restantes** en su lugar. Una clave también permite que Naget Search elija las partes de una página que responden a una pregunta cuando los agentes leen páginas (consulta [Leer páginas completas, o solo las partes que responden a una pregunta](/guide/web#read-whole-pages-or-only-the-parts-that-answer-a-question)); sin ella, la app las elige por sus palabras. Las frases que responden a una búsqueda vienen en sus resultados sin clave. Si la fila dice “Naget Search necesita una clave por ahora”, se están rechazando las búsquedas sin clave; hasta que añadas una, responde el siguiente proveedor.

Su formulario también tiene una **Dirección**: https://naget.com a menos que establezcas otra. Déjala como está salvo que te hayan dado otra dirección.

### SearXNG

[SearXNG](/settings?s=search&find=SearXNG) es un motor de búsqueda que ejecutas tú mismo, que consulta muchos motores de búsqueda a la vez y no guarda ningún registro sobre ti. No necesita clave, solo la dirección de tu instancia: abre su menú **⋯**, elige **Establecer la dirección**, escríbela (como https://searx.example.org) y pulsa **Guardar**. Al darle una dirección se activa. Trae hasta 100 resultados.

### Brave Search

[Brave Search](/settings?s=search&find=Brave%20Search) busca en el índice independiente de Brave, mediante su API de búsqueda. Necesita una clave; Brave tiene un plan gratuito. **⋯ → Añadir una clave** abre un formulario con un enlace, **Consigue una en api-dashboard.search.brave.com**. Al añadir una clave se activa. Trae hasta 100 resultados.

### DuckDuckGo

[DuckDuckGo](/settings?s=search&find=DuckDuckGo) no necesita clave y está activado desde el principio, al final de la lista como último recurso. Trae unos 10 resultados por página (30 como máximo) y puede pedir demostrar que la búsqueda no viene de un bot; entonces responde el siguiente proveedor, si hay alguno.

### Añadir o cambiar una clave o una dirección

1. En la fila del proveedor, abre el menú **⋯** y elige **Añadir una clave** (o **Cambiar la clave**, **Establecer la dirección**, **Cambiar la dirección**).
2. Pega la clave en **Clave** (se muestra como puntos), o escribe la **Dirección**. En Naget Search la clave aparece marcada como “opcional, para más búsquedas”.
3. Pulsa **Guardar**. **Cancelar** cierra el formulario y deja todo como estaba.

Al darle a un proveedor la clave o la dirección que necesita, se activa. Las claves se quedan en el servidor: la página solo muestra una pista de ellas. Para quitar una clave guardada, abre el formulario y pulsa **Quitar la clave guardada**.

### Probar un proveedor

Abre el menú **⋯** de una fila y elige **Probar**. La app ejecuta una búsqueda pequeña solo con ese proveedor, sin recurrir al siguiente, y con lo que escribiste en su formulario incluso antes de guardarlo. Verás “Funciona:”, el número de resultados y cuánto tardó, con los tres primeros resultados como enlaces, o el motivo del fallo. Probar un proveedor tal como está guardado también borra su error anterior en cuanto vuelve a funcionar.

### Resultados por búsqueda

[Resultados por búsqueda](/settings?s=search&find=Results%20per%20search) define cuántos resultados trae una búsqueda cuando el agente no pide un número: **10**, **20** (el predeterminado), **50** o **100**. Los agentes aún pueden pedir más, hasta 100, para búsquedas más profundas, como encontrar artículos. Más resultados implican más lectura para un agente.

Una nota al final de la página enlaza a cómo un desarrollador puede añadir otro proveedor.

### Cuando ningún proveedor puede responder

Si todos los proveedores activados fallan, o los desactivaste todos, se le indica al agente por qué falló cada uno. Claude Code y Codex entonces buscan con su propia búsqueda web integrada (WebSearch de Claude Code, la búsqueda web de Codex), para esa búsqueda y el resto de la tarea, y citan sus páginas como de costumbre: solo te hablan de Configuración → Búsqueda si su propia búsqueda también falla. Otros agentes, como Custom, no tienen búsqueda web propia: se les pide que te digan que en Configuración → Búsqueda puedes añadir una clave o activar otro proveedor. En una [investigación profunda](/guide/research) la búsqueda web propia de los agentes está desactivada, para que cada búsqueda cuente contra su presupuesto: también allí se te dice qué corregir.

## Ver lo que encontró una búsqueda

Los pasos de un agente se pliegan en una línea entre sus mensajes, como “Buscó 4 veces” (las búsquedas web y las páginas leídas cuentan como búsquedas ahí). Ábrela para ver cada paso. Una búsqueda dice “Buscó en la web “e-bikes por menos de 2.000 euros””, con el proveedor que respondió y el número de resultados a la derecha (en un teléfono, solo el número). Mientras se ejecuta dice “Buscando en la web”, con un temporizador; una que falló dice “Falló la búsqueda web”.

Haz clic en una búsqueda para abrirla:

- los filtros que usó (un sitio, fechas, una categoría…) como pequeñas etiquetas, también los interpretados de las palabras de la búsqueda, con una nota que nombra las palabras que se buscaron, y “las partes que responden” cuando el agente pidió las frases que responden;
- notas, como un proveedor que no pudo responder y cuál lo hizo en su lugar, o un filtro que el proveedor no pudo respetar;
- los resultados, numerados como los vio el agente: el título (un enlace), el sitio, la fecha, una etiqueta del tipo de página (Artículo, arXiv, PubMed, Patente, Informe SEC, Docs…), una etiqueta PDF, y el fragmento o las frases que responden a la búsqueda. Cada uno tiene un botón de abrir (↗).

Se muestran los primeros 8 resultados; **Mostrar los N resultados** muestra el resto.

## Ver las fuentes bajo una respuesta

Cuando un agente cita las páginas que usó, su respuesta las muestra en dos lugares, en lugar de una lista numerada al final:

- **En el texto**: donde cita una página, un pequeño chip con el icono y el nombre del sitio, como **ign**. Un chip que representa varias páginas indica cuántas más (**ign +1**). En una computadora, coloca el puntero sobre un chip para ver sus páginas, con sus títulos y sitios; haz clic para abrir su página (una de varias desde la tarjeta). En un teléfono, tócalo para verlas y luego toca una para abrirla.
- **Bajo la respuesta**: una línea de **Fuentes** con los iconos de los primeros sitios y cuántas páginas cita la respuesta. Haz clic para abrir una tarjeta por cada página: su título, su sitio y un enlace.

Solo se muestran las páginas que cita la respuesta, según los números que les dio el agente, no todas las búsquedas que hizo: lo que buscó y leyó está en sus pasos (abre **Trabajó durante…** encima de la respuesta). **Copiar mensaje** (bajo la respuesta) la copia tal como la escribió el agente, con su lista de fuentes; al leerla en voz alta se omiten los números y la lista. El icono de un sitio se toma del propio sitio la primera vez que se muestra, y se conserva; un sitio sin icono muestra su primera letra.

## Leer páginas completas, o solo las partes que responden a una pregunta

Cuando los fragmentos no bastan, un agente lee la página. Puede leerla completa: una página larga llega en partes de unas 3.000 palabras, y el agente pide la siguiente parte cuando la necesita. O le hace una pregunta a la página y recibe solo las partes que la responden, que es mucho más corto.

- Con Naget Search activado y su clave añadida, Naget Search elige las frases de la página que responden a la pregunta. El paso indica cuántas palabras de la página se conservaron. A diferencia de las frases que responden a una búsqueda, esto necesita la clave.
- De lo contrario, la app elige los párrafos que comparten más palabras con la pregunta, y le dice al agente que lea la página completa si no contienen la respuesta.

Los PDF también se leen como texto. Solo se pueden leer así las páginas web públicas: las direcciones de esta computadora o de su red no se pueden leer (el [navegador](/guide/web#the-browser-agents-use) puede abrirlas una vez que lo permitas). Una página se descarga una vez y se conserva durante 10 minutos, así que su siguiente parte llega de inmediato.

En la conversación, una lectura aparece como “Leyó” y el título de la página, con la pregunta que se le hizo en pantallas más anchas. Haz clic para ver la dirección, qué parte fue (“parte 1 de 3”) o “las partes que responden” a la pregunta, y el texto que recibió el agente.

## El navegador que usan los agentes

Algunos sitios necesitan clics, formularios, inicios de sesión o scripts, y una simple lectura no basta para pasarlos. Para esos casos, los agentes tienen un navegador aparte del tuyo: no tiene ninguna de las sesiones iniciadas del Chrome, Edge, Firefox o Safari que usas. Puedes verlo en vivo y tomar el control en cualquier momento. Qué navegador es depende de dónde se ejecute la app:

- **En la app de escritorio** (Mac, Windows, Linux) es el navegador propio de la app, basado en Chromium (el navegador de código abierto en el que se basa Chrome) y que se ejecuta dentro de la app. No hay que instalar nada, y la app lo elige a menos que escojas otro (consulta [Chromium](/guide/web#chromium)). Sus páginas se dibujan rápido en la ventana de la app, haces clic en una para usarla, y sigue funcionando con la ventana cerrada.
- **En cualquier otro lugar** (la app en Docker o en un servidor, y un teléfono o cualquier página web que la esté viendo) es un Chromium real que la app inicia en la computadora donde se ejecuta, y que ves como una imagen en vivo.

Con el navegador activado, cada agente puede:

- abrir una página, en la pestaña en la que está o en una nueva, con los scripts de la página en ejecución;
- ver la página como un esquema: su texto, con enlaces, botones y campos numerados;
- hacer clic, doble clic, señalar, escribir en un campo (reemplazando lo que contiene, o añadiendo al contenido, y pulsando Enter), elegir de una lista, desplazarse, pulsar teclas, volver atrás y esperar: hasta 10 pasos a la vez, deteniéndose antes si la página cambia;
- iniciar sesión con un inicio de sesión que guardaste en la bóveda: escribe la contraseña (u otra clave) en la página por su nombre, sin verla, y solo en una página de los hosts que permitiste para ella (consulta [Guardar claves en la bóveda](/guide/connections#keep-keys-in-the-vault));
- mirar una captura de pantalla con los números dibujados, cuando su modelo ve imágenes y las capturas están activadas;
- buscar texto en la página, leer su texto por partes, o pedir al modelo auxiliar que responda una pregunta a partir de una página larga (consulta [Agentes, cuentas y modelos](/guide/agents-models));
- listar, cambiar y cerrar pestañas;
- adjuntar archivos de la carpeta de la sesión al campo de subida de una página (nada de ningún otro lugar);
- entregarte el navegador.

Algunas cosas son siempre tuyas, o esperan tu aprobación:

- **Inicios de sesión sin una sesión guardada, verificaciones y todo lo que el agente no tenga claro.** A los agentes se les indica que te los pasen en lugar de intentarlos, incluidos un captcha (una verificación de que eres una persona) y un código que te envían a ti. Cuando una tarea necesitará iniciar sesión de nuevo sin ti, como una tarea programada, el agente puede pedir las credenciales en una tarjeta para guardarlas en la bóveda.
- **Pagar y hacer pedidos.** Un agente nunca pulsa un botón que pague o haga un pedido (Pagar, Comprar ahora, Realizar pedido, Suscribirse ahora, Donar, Reservar ahora, el botón de envío de un formulario con campos de tarjeta…). Se detiene, y se te pide que lo termines tú.
- **Botones que envían, publican, eliminan o transfieren, en un sitio donde el navegador tiene la sesión iniciada.** Antes de que un agente pulse uno, se te pide que lo permitas (consulta [Botones que envían, publican o eliminan](/guide/web#buttons-that-send-post-or-delete)). Puedes desactivarlo en Configuración.
- **Lo que escribes.** Los valores de contraseñas, números de tarjeta, códigos de seguridad y códigos de un solo uso nunca se muestran al agente, ni tampoco nada de lo que escribiste mientras tú manejabas. Las partes de las direcciones que parecen contraseñas también se le ocultan. Un campo que el agente rellenó desde la bóveda muestra puntos, y el agente solo sabe que se rellenó.
- **Preguntas emergentes** que plantea una página (consulta [Responder las preguntas emergentes de una página](/guide/web#answer-a-pages-pop-up-questions)).

Cada sesión tiene un navegador propio. Sin perfil, empieza nuevo, sin sesión iniciada en ningún sitio, y no conserva nada al cerrarse. Con un perfil, tiene la sesión iniciada dondequiera que la tenga el perfil (consulta [Mantener inicios de sesión con perfiles](/guide/web#keep-sign-ins-with-profiles)). Tu propio navegador, en la página Navegador, es otro distinto que los agentes nunca usan, a menos que les entregues una página de él (consulta [Entregar una página a un agente](/guide/web#hand-a-page-to-an-agent)).

## Ver el navegador en vivo

Mientras el navegador de una sesión está abierto, un panel aparece justo encima del cuadro de mensaje. Muestra el título de la página (o “Página en blanco”) y, debajo, lo que hace el agente (“Haciendo clic en “Iniciar sesión””, “Escribiendo en “Buscar””), el perfil que usa y cuántas pestañas hay abiertas. Dice “Te está esperando” cuando algo espera por ti, y “Estás al mando: el agente espera” mientras lo usas.

En una computadora:

- Plegado, el panel muestra a la izquierda una pequeña imagen en vivo de la página. Haz clic en ella, en el título o en la flecha (**Mostrar la vista en vivo**) para desplegar la vista en vivo; **Ocultar la vista en vivo** la pliega de nuevo.
- **Pantalla completa** muestra el navegador sobre toda la app; **Salir de pantalla completa** te devuelve.
- **Tomar el control** te permite usar el navegador tú mismo (consulta más abajo), y **Opciones del navegador** (⋯) abre su menú.

En un teléfono, toca el panel para abrir el navegador en pantalla completa; la × lo cierra.

En la app de escritorio, la vista en vivo es la propia página, dibujada por la app y actualizada tan rápido como cambia la página, así que desplazarte y escribir se siente como en cualquier navegador. En otros lugares es una imagen de la página, enviada varias veces por segundo mientras miras; dice “Conectando con el navegador…” hasta que llega la primera.

### Ver hacia dónde apunta el agente

El navegador se ejecuta fuera de la vista, así que la vista en vivo dibuja por ti el puntero del agente: una flecha grande del color de la app, con un halo suave y una etiqueta **Agente** a su lado.

- Antes de que el agente haga clic, escriba o se desplace, su puntero se desliza desde donde estaba hasta ese lugar, en cerca de un tercio de segundo, para que tu vista pueda seguirlo. Mientras miras, el agente lo espera; cuando nadie mira el navegador, no espera.
- Donde hace clic, se expande un anillo (dos si es doble clic). El campo en el que escribe, o la lista de la que elige, recibe un contorno por un momento. Un desplazamiento muestra su dirección con flechas junto al puntero, y las teclas que pulsa (Enter, Tab, Ctrl+A) aparecen junto a la etiqueta.
- El puntero se queda donde el agente actuó por última vez. En la pequeña imagen del panel plegado, aparece como una flecha pequeña.
- Mientras manejas tú, el puntero del agente desaparece de la vista en vivo: el tuyo es el único. Vuelve cuando devuelves el navegador.

Cada paso que el agente da en el navegador también aparece en la conversación, entre sus otros pasos, como una línea (“Abrió github.com”, “Hizo clic en [12] botón "Iniciar sesión"”, “Te preguntó: Inicia sesión en GitHub”) con una pequeña imagen de la página a continuación. Haz clic en la línea para ver la imagen más grande y la respuesta completa del agente. En la imagen más grande, un anillo marca dónde hizo clic el paso y un contorno discontinuo el campo en el que escribió, numerado cuando el paso hizo varias cosas. La app guarda las imágenes de los últimos 400 pasos de cada sesión; las de las sesiones sin actividad durante un mes se eliminan.

## Tomar el control para iniciar sesión, resolver una verificación o pagar

Cuando un agente te necesita en el navegador, te enteras en varios lugares a la vez:

- una línea en la parte superior del panel del navegador, con sus botones;
- una tarjeta en la conversación, como “Te necesita en el navegador: Inicia sesión en GitHub”, con **Mostrar** (**Abrir** en un teléfono);
- una notificación, como cuando una sesión necesita tu respuesta, y una entrada en la [bandeja de entrada](/inbox) (consulta [Bandeja de entrada y notificaciones](/guide/inbox)).

En una computadora, la vista en vivo se despliega sola para un inicio de sesión, un pago o una pregunta emergente, y se pliega de nuevo cuando eso queda resuelto (a menos que la hayas abierto tú).

### En una computadora

1. Pulsa **Tomar el control** en la línea (o en el panel). El panel dice “Estás al mando: el agente espera”, y la vista en vivo recibe un contorno de color.
2. Usa la página como en cualquier navegador: haz clic, desplázate con la rueda, escribe. Haz clic primero en la página; a partir de ahí tus teclas van a la página (los atajos de la propia app esperan), y lo que pegues entra como texto. En la app de escritorio, basta con hacer clic o escribir en la página para tomar el control: el panel cambia solo a “Estás al mando: el agente espera”, y mientras maneja el agente, una línea bajo la dirección dice “Haz clic en la página para usarla tú”.
3. Mientras manejas, una barra sobre la página tiene **Atrás**, **Volver a cargar** y la dirección: escribe una dirección y pulsa Enter para ir allí.
4. Cuando termines, pulsa **Hecho** en la línea. La app avisa al agente de que terminaste, con la página que muestra ahora el navegador, y el agente continúa.

### En un teléfono

1. Toca **Tomar el control**. El navegador se abre en pantalla completa, y la página se adapta a la pantalla de tu teléfono mientras manejas. La barra con **Atrás**, **Volver a cargar** y la dirección está encima.
2. Toca para hacer clic, arrastra para desplazarte. **Escribir** abre el teclado de tu teléfono; la fila a su lado tiene Tab, Enter, Esc, ⌫ y las teclas de flecha.
3. Toca **Hecho** cuando termines. La página vuelve a su tamaño habitual, y el agente continúa.

### Pagar y hacer pedidos

Cuando el agente llega a un botón que pagaría o haría un pedido, se detiene: “Se detuvo antes de pagar o hacer un pedido: Realizar pedido en shop.example.com. Eso te toca a ti.” Toma el control, revisa el pedido, paga tú mismo y pulsa **Hecho**. Pulsa **Ahora no** si no sigues adelante. En ambos casos, el agente se entera de cuál elegiste.

### Otras respuestas, y tomar el control por tu cuenta

- **No puede** le dice al agente que no pudiste hacer lo que pidió.
- Puedes tomar el control en cualquier momento, no solo cuando se te pida: pulsa **Tomar el control** en el panel. El agente espera; si intenta usar el navegador mientras tanto, se le dice que lo tienes tú y que se enterará cuando termines. Pulsa **Devolver** para devolver el navegador; si el agente lo estaba esperando, recibe un mensaje con la página que muestra el navegador.

Los mensajes que la app envía al agente por ti aparecen en la conversación. Si el agente está en medio de un turno, esperan hasta que termine.

## Botones que envían, publican o eliminan

En un sitio donde el navegador tiene la sesión iniciada, un agente pregunta antes de pulsar un botón que envía, publica, comparte, responde, elimina, quita, transfiere o retira algo. Eso aplica a un navegador que usa un perfil (consulta [Mantener inicios de sesión con perfiles](/guide/web#keep-sign-ins-with-profiles)) y a una página que entregaste a un agente (consulta [Entregar una página a un agente](/guide/web#hand-a-page-to-an-agent)). Un navegador que empieza nuevo, sin sesión iniciada en ningún sitio, no tiene nada que proteger y no pregunta. Pagar y hacer pedidos siguen siendo solo cosa tuya (consulta más arriba).

El agente reconoce estos botones por sus palabras, en inglés, alemán, griego, chino, francés y español: Enviar, Publicar, Eliminar, Transferir y similares, y un simple “Confirmar” o “Sí” cuando la página trata de alguna de esas acciones (una ventana emergente que pregunta “¿Eliminar esta publicación?”). “Iniciar sesión”, “Siguiente”, “Guardar borrador”, “Cancelar”, un botón de búsqueda y el envío de un código a ti mismo (Reenviar código) no se detienen.

Cuando llega a uno, se detiene, termina su turno y espera. Ves “Quiere pulsar “Eliminar” en mail.example.com” en los mismos lugares que otras preguntas (la línea del panel del navegador y una tarjeta en la conversación), con **No permitir** y **Permitir**. La vista en vivo no se abre sola.

- **Permitir** le dice al agente que ya puede pulsar el botón. Deja pasar una pulsación de un botón con las mismas palabras, en ese sitio, durante los dos minutos siguientes; después el agente vuelve a preguntar.
- **No permitir** le dice al agente que no lo pulse. Continúa sin hacerlo, o te cuenta lo que no pudo hacer. La tarjeta pasa entonces a decir “Permitido” o “No permitido”.

Está activado al principio. Para desactivarlo, consulta [Preguntar antes de enviar en sitios con sesión iniciada](/guide/web#ask-before-sending-on-signed-in-sites).

## Responder las preguntas emergentes de una página

Cuando una página abre una ventana emergente (una alerta, una pregunta de sí o no, una solicitud de texto, o “¿Salir de esta página?”), aparece sobre la vista en vivo: el sitio, “dice” (o “pregunta si quieres salir”) y el mensaje. Solo tú la respondes: **OK** o **Cancelar** (con un campo de texto para una solicitud), o **Salir** o **Alojamiento**. Si el paso del agente la abrió, recibes una notificación, y el agente se entera de cómo respondiste.

## Dejar que una sesión abra un sitio en esta computadora o en tu red

Con [Mantener las páginas fuera de esta máquina y su red](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) activado (como está al principio), las páginas no pueden acceder a esta computadora ni a otros dispositivos de su red. Cuando un agente quiere abrir una, por ejemplo un sitio web que estás construyendo y que se ejecuta en esta computadora (un servidor de desarrollo), pregunta primero: “Quiere abrir localhost:3000, en esta máquina o su red”, con **No permitir** y **Permitir en esta sesión**. Al permitirlo, el navegador de esta sesión puede abrir esa dirección a partir de entonces, y se le dice al agente que la abra de nuevo.

Una dirección de esta computadora o de su red que escribes tú mismo mientras manejas se permite para la sesión de la misma manera. **Sitios de esta sesión**, en el menú del navegador, lista lo que permitiste en “Permitido en esta máquina o su red”; la × junto a uno lo quita. Hydor mismo nunca se puede abrir desde el navegador.

## El menú del navegador

**Opciones del navegador** (⋯) en el panel abre un menú:

- **Pestañas**, cuando hay más de una abierta: elige una para mostrarla. Cuando una página abre un enlace en una pestaña nueva, el agente continúa allí.
- **Guardado en la carpeta de la sesión**: los últimos archivos que descargó el navegador; elige uno para abrirlo.
- **Perfil (cambiar de perfil reinicia el navegador)**: **Nuevo, sin inicios de sesión**, o uno de tus perfiles. Aparece cuando has creado un perfil. Al elegir otro, el navegador se cierra; se abre con el nuevo perfil la próxima vez que se use.
- **Sitios de esta sesión**: sitios que el navegador de esta sesión solo puede visitar (**Solo estos sitios**, cualquier sitio si está vacío) y sitios que nunca visita (**Nunca estos sitios**), uno por línea. Se suman a las listas de Configuración → Navegador. Pulsa **Guardar** para conservarlos.
- **Cerrar el navegador**.

## Abrir el navegador tú mismo

Puedes abrir el navegador de una sesión antes que el agente, por ejemplo para iniciar sesión en un sitio antes de pedirle que trabaje allí. Abre el menú de la sesión (⋯) → **Más** → **Abrir un navegador**. El panel aparece sobre el cuadro de mensajes: pulsa **Tomar el control** y úsalo. Cuando el navegador ya está abierto, esa misma opción dice **Mostrar el navegador**. Si el navegador está desactivado en Configuración, se te avisa. Para un navegador propio, no vinculado a una sesión, consulta [Tu propio navegador](/guide/web#your-own-browser).

## Descargas y subidas

Los archivos que descarga una página se guardan en la carpeta de la sesión, dentro de una carpeta llamada downloads, y se le avisa al agente dónde quedaron. El menú del navegador muestra las últimas en **Guardado en la carpeta de la sesión**.

Un agente solo puede adjuntar archivos al campo de subida de una página desde la carpeta de la sesión. Para que suba otro archivo, copia primero el archivo en esa carpeta (consulta [Sistema: archivos, Git, Terminal y vista previa](/guide/files-git)).

## Cuándo se cierra el navegador

El navegador de una sesión se cierra solo:

- cuando nadie lo ha usado ni mirado en 15 minutos, o en dos horas si está esperándote o lo estás manejando tú;
- cuando se cierra su última pestaña;
- cuando el agente de la sesión deja de ejecutarse, o se elimina la sesión;
- cuando eliges otro perfil para él, o eliminas el perfil que usa.

Todo lo que aún estaba esperándote termina con él. El agente vuelve a abrir el navegador cuando lo necesite de nuevo.

En la app de escritorio, el navegador de un agente no necesita la ventana de la app: sigue funcionando mientras la ventana está cerrada u oculta, siempre que la app esté en ejecución (se queda en la barra de menús, el área de notificaciones o la bandeja del sistema). Abre la ventana y sus páginas estarán ahí para verlas.

## Tu propio navegador

La página **Navegador** es un navegador propio dentro de la app de escritorio (Mac, Windows, Linux), junto al que usan los agentes: abre **Navegador** en la barra de iconos, o ve a [Navegador](/browser). Es exclusivo de la app de escritorio: la app web en un navegador y un teléfono no tienen el botón **Navegador**, y la dirección [Navegador](/browser) lo indica allí. Los navegadores de los agentes funcionan en todas partes, y puedes verlos en sus sesiones.

Tiene una barra en la parte superior con un cuadro que busca, abre, y pregunta a un agente o le indica qué hacer con la página; una columna con tus pestañas, con los sitios que fijaste y los agentes que están trabajando, a la izquierda de la página; y, a la derecha, una columna, tan ancha como la arrastres, para preguntar a un agente sobre la página o indicarle qué hacer en ella, para la conversación de un agente y para el historial, las descargas, los marcadores, las extensiones y la configuración. Tiene atrás, adelante y volver a cargar, marcadores, historial, extensiones de Chrome, un bloqueador de anuncios y rastreadores que también oculta los avisos de cookies, búsqueda en la página, zoom, impresión y descargas. También tiene [pestañas privadas](/guide/web#private-tabs) que lo olvidan todo al cerrarlas, [traducción de una página](/guide/web#translate-a-page) a tu idioma, [vista de lectura](/guide/web#reader-view) para artículos, [páginas oscuras](/guide/web#dark-pages), [capturas de pantalla y guardado de una página como PDF](/guide/web#screenshots-and-pdfs), y sitios que no pueden reproducir sonido por sí solos. Al señalar un enlace, una cajita en la parte inferior izquierda de la página muestra a dónde lleva (en la inferior derecha mientras el ratón está ahí), como en Chrome. Sus pestañas son páginas reales dentro de la ventana de la app, con la velocidad y las teclas de cualquier navegador, y se conectan directamente a los sitios, como en cualquier navegador. Un menú o diálogo de la app que se abre sobre la página la quita un momento (se muestra una imagen de ella hasta que se cierra). Conserva tus inicios de sesión entre visitas, en un perfil propio que ningún agente puede elegir, y se abre de nuevo con las pestañas que tenías (hasta 30; las pestañas en blanco y las privadas quedan fuera). Tus pestañas también pueden abrir direcciones de esta computadora y de su red (un sitio web que estás creando, por ejemplo). Si el navegador no puede iniciarse, la página explica por qué, con **Reintentar** y **Configuración del navegador**, que abre [Configuración → Navegador](/settings?s=browser).

### La barra y el cuadro

Una barra recorre la parte superior de la página. A su izquierda, sobre la columna de pestañas, están el logotipo de la app, **Nueva pestaña** (+) y **Ocultar pestañas** (equivale a Ctrl+B), que pliega la columna de pestañas hasta que **Mostrar pestañas** la devuelve. El resto de la barra es para la página en la que estás:

- **Atrás**, **Adelante**, **Volver a cargar** e **Inicio** están a la izquierda del cuadro. Mientras una página se carga, Volver a cargar pasa a ser **Detener**. **Inicio** abre tu página de inicio en la pestaña en la que estás, como **Nueva pestaña** lo hace en una nueva.
- El cuadro del centro es la barra de direcciones. En reposo muestra la dirección de la página como su sitio, con el resto de la dirección en un color más claro, y el recordatorio **Ctrl+L**. Haz clic en él, o pulsa Ctrl+L, y muestra la dirección completa para que la cambies. Lo que escribes ahí se conserva mientras estás en otra app; un clic en la página vuelve a poner la dirección. Escribe una dirección, con o sin https:// (`example.com`, `localhost:3000`, `192.168.1.5`, una dirección `file://`), y pulsa **Enter** para abrirla. Todo lo demás que escribas se busca con tu motor de búsqueda (Google al principio; consulta [Configuración del navegador](/guide/web#browser-settings)), y un atajo como `yt` y un espacio antes de tus palabras busca en ese sitio (consulta [Sugerencias](/guide/web#suggestions)). **Alt+Enter**, o Ctrl+Enter (⌘+Enter en Mac), la abre en una pestaña nueva (privada, si estás en una pestaña privada). Lo que ofrece mientras escribes está en [Sugerencias](/guide/web#suggestions). Su candado está a la izquierda (en una pestaña privada aparece primero una etiqueta morada **Privado**: consulta [Pestañas privadas](/guide/web#private-tabs)). A la derecha hay un botón que traduce la página cuando está en un idioma distinto al tuyo (consulta [Traducir una página](/guide/web#translate-a-page)), un botón con forma de libro para la vista de lectura cuando la página tiene un artículo, con **Aa** a su lado mientras está activada (consulta [Vista de lectura](/guide/web#reader-view)), y su estrella.
- La estrella al final del cuadro añade la página a la barra de marcadores; si está rellena, la página está en marcadores, y al pulsarla de nuevo se quita el marcador. Los sitios de la barra se muestran como mosaicos en la parte superior de la columna de pestañas.
- **Guardar** conserva una copia legible de la página en un proyecto, tal como la muestra una vista de lectura: el texto del artículo con sus imágenes y videos, sin los menús, anuncios, comentarios ni scripts del sitio. Una nota dice “Guardado en” y el nombre del proyecto (“Guardado en los archivos de Tesis”), con **Abrir**: la copia es una página web entre los archivos del proyecto, en su pestaña **Archivos** (consulta [Archivos](/guide/projects#files)). La **▾** junto a Guardar (**Elige un proyecto donde guardar**) muestra los lugares posibles: **Sin proyecto** y cada uno de tus proyectos. El lugar que usa Guardar aparece marcado en ese menú: el que elegiste la última vez en esta computadora (**Sin proyecto** al principio). Sin proyecto, la nota dice “Guardado. Elige un proyecto junto a Guardar para conservar copias en sus archivos.”: la copia queda sin proyecto, y el cuadro de búsqueda (Ctrl+K) la encuentra. Tus listas (marcadores, páginas para leer más tarde, descargas, historial y destacados) son paneles de esta página, en el **Menú** (⋯) (consulta [La columna junto a la página](/guide/web#the-column-beside-the-page)).
- **Preguntar** abre la columna junto a la página, donde preguntas a un agente sobre ella o eliges **Hacer** para que un agente trabaje en ella (consulta [Preguntar junto a la página](/guide/web#ask-beside-the-page)); aparece iluminado mientras esa columna está abierta.
- Los botones de las extensiones que fijaste vienen después, luego **Extensiones** (la pieza de rompecabezas), que muestra todas las extensiones activadas y, cuando la pestaña abierta es una página de la Chrome Web Store de una extensión, **Añadir a Hydor** (consulta [Extensiones de Chrome](/guide/web#chrome-extensions)).
- **Menú** (⋯) tiene **Nueva pestaña privada** (consulta [Pestañas privadas](/guide/web#private-tabs)), luego lo que haces con la página: **Buscar en la página**, **Traducir página…** (**Mostrar original** mientras la página está traducida; consulta [Traducir una página](/guide/web#translate-a-page)), **Vista de lectura** y **Páginas oscuras** (con una marca mientras están activadas; consulta [Vista de lectura](/guide/web#reader-view) y [Páginas oscuras](/guide/web#dark-pages)), y **Zoom**, con − y + y el zoom como porcentaje entre ellos (consulta [Zoom, impresión y pantalla completa](/guide/web#zoom-print-and-full-screen)). Luego **Imprimir…** y **Captura de pantalla o PDF**, que muestra **Captura de pantalla de lo que ves**, **Captura de pantalla de toda la página** y **Guardar como PDF…** en el lugar del menú (su primera línea, **Captura de pantalla o PDF**, vuelve atrás; consulta [Capturas de pantalla y PDF](/guide/web#screenshots-and-pdfs)). Luego tus listas: **Historial**, **Descargas**, **Marcadores**, **Leer más tarde** (con cuántas páginas esperan; consulta [Leer más tarde](/guide/web#read-later)) y **Destacados** (con cuántos tiene la página). Por último, el navegador en sí: **Extensiones**, **Permisos de sitios**, **Configuración** y **Atajos de teclado**. Las listas y estas se abren en la columna a la derecha de la página (consulta [La columna junto a la página](/guide/web#the-column-beside-the-page)). El menú permanece abierto mientras pulsas el − y el + del zoom. En una pestaña privada, **Preguntar** aparece atenuado: los agentes nunca reciben una pestaña privada.

Un enlace a `/browser?url=https://example.com` abre la página Navegador con esa dirección en una pestaña nueva, y [/browser?private=1](/browser?private=1) abre una pestaña privada nueva (añade `&url=https://example.com` para abrir esa dirección en ella).

### Sugerencias

Mientras escribes en la barra de direcciones, una lista debajo ofrece, con las palabras que escribiste en negrita:

- tus pestañas abiertas (“Cambiar a la pestaña”: elige una para ir a ella en lugar de abrir la página otra vez; tus pestañas privadas están entre ellas mientras están abiertas, y no se conserva nada de ellas después),
- tus marcadores y las páginas de tu historial que coinciden con las palabras en sus títulos y direcciones, primero las que visitas a menudo y hace poco (las direcciones que escribiste tú mismo cuentan más, y un marcador cuenta como veinte visitas). Cuando hay marcadores que coinciden con las palabras que escribiste, al menos dos de ellos están siempre entre las páginas ofrecidas, en lugar de las últimas páginas de tu historial, de modo que un historial grande, como uno importado de otro navegador, nunca los oculte,
- con la [Búsqueda por significado](/settings?s=memory&find=Search%20by%20meaning) activada, marcadores y páginas de tu historial que tratan de lo que escribiste aunque sus títulos y direcciones no contengan sus palabras, después de los que sí las contienen (se muestran sin palabras en negrita). El modelo que las encuentra se ejecuta en esta computadora, a partir de un vector hecho con el título y la dirección de cada página (sin su cadena de consulta) y guardado en la base de datos de la app aparte de todo lo demás; desaparece cuando desaparece la página,
- cuando lo que escribiste empieza con uno de tus atajos de búsqueda y un espacio (`yt lofi`), antes que nada una fila que busca en ese sitio las palabras que siguen (“Buscar “lofi” en YouTube”), lo que hace **Enter** (consulta [Configuración del navegador](/guide/web#browser-settings)),
- lo que escribiste, como búsqueda (“Buscar en Google”) o, cuando parece una dirección, como esa dirección; con un atajo delante, esta fila sigue buscando todas tus palabras con tu motor de búsqueda,
- las sugerencias del propio motor de búsqueda, cuando [Sugerencias de búsqueda](/guide/web#browser-settings) está activado,
- debajo de ellas, cuando la pestaña abierta es una página web (y no una pestaña privada, que los agentes nunca reciben), **Preguntar sobre esta página: “…”**, que abre Preguntar junto a la página con lo que escribiste como pregunta. Mientras **Hacer** está elegido en Preguntar, la fila dice **Hacerlo en esta página: “…”**, y le da a un agente lo que escribiste para que lo haga allí (consulta [Hacerlo en la página](/guide/web#do-it-on-the-page)),
- por último, **Preguntar a un agente: “…”**, que empieza una sesión con lo que escribiste como primer mensaje, con el agente y el modelo que usó por última vez la página de inicio, y te lleva a ella.

La lista muestra tantas como caben en la pantalla, con al menos dos de tus páginas y dos sugerencias del motor entre ellas cuando hay tantas. Cuando hay que recortar la lista para que quepa en una ventana baja, las páginas de tu historial se quitan antes que tus marcadores y pestañas abiertas. Las teclas de flecha se mueven por ella y **Enter** abre la marcada (lo que escribiste, si no hay ninguna); **Alt+Enter**, o Ctrl+Enter (⌘+Enter en Mac), la abre en una pestaña nueva (privada, si estás en una pestaña privada). La barra de direcciones también autocompleta en el sitio: cuando algo que visitaste empieza con lo que escribiste, el resto aparece seleccionado después del cursor (encontrado por las palabras que escribiste, nunca por significado), y **Tab** o **→** lo acepta. Borrar lo que escribiste desactiva el autocompletado. **Shift+Delete** sobre una sugerencia del historial olvida esa página, y **Esc** cierra la lista.

### La columna de pestañas

La columna a la izquierda de la página muestra, de arriba abajo (**Hide tabs**, o Ctrl+B, la oculta):

- **Pinned sites**: los elementos de tu barra de marcadores como mosaicos, cinco por fila y dos filas como máximo (un mosaico **…** muestra el resto). Haz clic en uno para abrirlo en la pestaña abierta; Ctrl+clic (⌘+clic en una Mac) o un clic con el botón central lo abre en una pestaña nueva. Una carpeta abre una lista con lo que contiene. Haz clic derecho en un mosaico para ver **Abrir**, **Abrir en una pestaña nueva**, **Editar** (**Cambiar nombre** en una carpeta) y **Eliminar**. Si no hay nada en la barra de marcadores, no hay mosaicos; la estrella pone la página ahí (consulta [Marcadores](/guide/web#bookmarks)).
- **Agentes trabajando**, mientras un agente tiene un navegador abierto: una fila por cada uno, con su icono y un punto (azul mientras trabaja, ámbar cuando espera por ti o cuando tú tienes el control), el título de la sesión y lo que está haciendo. Haz clic en una para verla (consulta [Agentes trabajando](/guide/web#agents-at-work)). Su flecha pliega la lista.
- **Privado**, mientras tengas pestañas privadas abiertas: una sección morada con una máscara y cuántas hay, y una fila por cada pestaña privada (una fila con tinte y una máscara pequeña en su icono). Haz clic en su etiqueta para plegar la sección; **Cerrar pestañas privadas** (×, cuando apuntas a la etiqueta) las cierra todas, y **Nueva pestaña privada** al final abre otra (consulta [Pestañas privadas](/guide/web#private-tabs)). Las pestañas privadas no están en ningún grupo y no se pueden arrastrar a uno.
- **Pestañas**: una fila por cada pestaña, con su icono, título, **⋯** y **×** (en la pestaña abierta y en la que señalas con el cursor). Un título demasiado largo para la columna se desvanece al final y se desplaza para mostrar el resto mientras apuntas a su fila. La pestaña abierta es la fila marcada; haz clic en una fila para mostrar esa pestaña, y un clic con el botón central la cierra. Haz clic derecho en una fila, o pulsa su **⋯**, para ver el menú de la pestaña (consulta [Grupos de pestañas y el menú de pestañas](/guide/web#tab-groups-and-the-tab-menu)). Las pestañas que pones en un grupo quedan bajo el encabezado del grupo, y el botón de destellos al final de la etiqueta **Pestañas** agrupa tus pestañas con IA. Una pestaña que reproduce sonido muestra un altavoz: haz clic en él para silenciar la pestaña, y otra vez para volver a oírla. Una pestaña silenciada conserva su altavoz. **Nueva pestaña** al final abre tu página de inicio. Al cerrar la última pestaña queda una en blanco.
- **Leer más tarde**, bajo las pestañas: las páginas que has dejado aparte (consulta [Leer más tarde](/guide/web#read-later)), las más recientes primero, cada una con su icono y título, y el número de páginas pendientes. Está plegada mientras no haya nada pendiente; su flecha la abre. Haz clic en una fila para abrir esa página en una pestaña nueva. Apunta a una fila para ver **Marcar como leída** (sale de la lista) y **Quitar**. **Mostrar leídas** al final recupera las páginas que ya has leído (**Ocultar leídas** las vuelve a guardar).

### Grupos de pestañas y el menú de pestañas

Haz clic derecho en una pestaña (o pulsa el **⋯** en una fila a la que apuntas, o la tecla de menú en una fila que tengas enfocada) para ver su menú:

- **Cerrar pestaña**, **Cerrar otras pestañas** y **Cerrar pestañas de abajo** (las pestañas que están debajo de ella en la columna, tal como aparecen en la lista). Tu navegador siempre mantiene una pestaña abierta.
- **Duplicar** abre la misma dirección en una pestaña nueva a su lado, en el mismo grupo, y la muestra (la copia de una pestaña privada es privada). **Volver a cargar** recarga esa pestaña, no solo la que tienes abierta.
- **Copiar dirección**, **Copiar como enlace Markdown**, que copia un enlace a la página en Markdown, con su título como texto, para un documento o un mensaje (una nota dice “Copied a Markdown link”), y **Marcador** (**Quitar el marcador** cuando ya está en marcadores), que pone la página en la barra de marcadores.
- **Añadir al grupo**, que muestra tus grupos (el grupo en el que está la pestaña aparece marcado) y **Nuevo grupo…**, que crea un grupo con la pestaña y abre su nombre para que lo escribas; y **Quitar del grupo**. El menú de una pestaña privada no tiene ninguna de las dos: las pestañas privadas no se pueden agrupar.

Un grupo reúne pestañas que van juntas. Tiene un nombre, uno de siete colores (gris, azul, verde, ámbar, naranja, rojo o morado) y está abierto o plegado. En la columna es un encabezado con su color, su nombre (“Unnamed group” hasta que le des uno) y cuántas pestañas tiene; sus pestañas quedan debajo, con una línea de su color a lo largo del costado, y las pestañas que no están en ningún grupo van después de los grupos. Haz clic en el encabezado para plegar el grupo o abrirlo de nuevo; un grupo plegado oculta sus pestañas, salvo la que tienes abierta. Haz doble clic en el nombre (o pulsa F2) para cambiarlo. Puedes arrastrar una pestaña a un grupo para meterla en él, y a las pestañas sin grupo para sacarla. Haz clic derecho en el encabezado, o pulsa su **⋯**, para ver el menú del grupo:

- **Cambiar nombre** y **Color**.
- **Nueva pestaña en el grupo** abre tu página de inicio en una pestaña nueva dentro de él.
- **Desagrupar** deshace el grupo y deja sus pestañas donde están.
- **Cerrar grupo** cierra el grupo y todas sus pestañas.

Un grupo sin pestañas desaparece. Los grupos se guardan con tus pestañas, así que vuelven con ellas cuando el navegador se abre de nuevo. En un teléfono las pestañas son una lista en la barra, sin grupos.

### Agrupar mis pestañas con IA

Cuando tienes muchas pestañas abiertas, el botón de destellos al final de la etiqueta **Pestañas** (**Agrupar mis pestañas con IA**; aparece cuando apuntas a la etiqueta) ordena según su propósito las pestañas que no están en ningún grupo. Necesita al menos tres; las pestañas que ya están en un grupo se quedan donde están, y las pestañas privadas quedan fuera: nunca se cuentan, nunca se agrupan y nunca se envían a ninguna parte.

**Qué se envía y a qué modelo.** Solo cuando pulsas el botón, el título y la dirección de cada una de esas pestañas (hasta 60) van al modelo auxiliar de la app, el que escribe los títulos de las sesiones y las notas de memoria ([Configuración → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)). En Automático, ese modelo es Claude Haiku a través de Claude Code, y si no Codex, ambos en línea; un modelo propio en esta computadora las mantiene aquí. Una dirección se envía sin lo que haya después de un **?** o un **#**, y la dirección de un archivo solo como su nombre. El texto y las imágenes de las páginas nunca se envían, y no se envía nada en ningún otro momento. Si un título es privado, no pulses el botón (o pon un modelo en esta computadora como modelo auxiliar).

El modelo responde con grupos de pestañas, cada uno con un nombre corto y un color, y la app los crea al instante. Un mensaje indica cuántos grupos creó, con **Deshacer**, que deja los grupos como estaban. Si ninguna pestaña va con otra, lo indica y no cambia nada. Los agentes nunca ven tus pestañas, y la app no les permite usar esta función.

### La columna junto a la página

A la derecha de la página hay una columna, que solo se muestra cuando hay algo en ella, con una de estas cosas a la vez: **Preguntar** sobre la página, o pedirle a un agente que haga algo en ella (consulta [Preguntar junto a la página](/guide/web#ask-beside-the-page)); la conversación de un agente, mientras ves su pestaña (consulta [Agentes trabajando](/guide/web#agents-at-work)); o el panel de **Historial**, **Descargas**, **Marcadores**, **Leer más tarde**, **Importar marcadores e historial**, **Destacados**, **Extensiones**, **Permisos de sitios**, **Configuración** o **Atajos de teclado**. Cada uno tiene una **×** para cerrarlo, y elegir otro lo reemplaza. No se superpone nada a la página: se vuelve más estrecha para hacer espacio, y vuelve a ensancharse cuando la columna se cierra. Las direcciones [Historial](/browser?panel=history), [Descargas](/browser?panel=downloads), [Marcadores](/browser?panel=bookmarks), [Leer más tarde](/browser?panel=later), [Importar marcadores e historial](/browser?panel=import), [Destacados](/browser?panel=highlights), [Extensiones](/browser?panel=extensions), [Permisos de sitios](/browser?panel=permissions), [Configuración](/browser?panel=settings) y [Atajos de teclado](/browser?panel=shortcuts) abren la página Navegador con ese panel.

Arrastra el borde izquierdo de la columna para ensancharla o estrecharla (o enfoca el borde y pulsa **←** o **→**); un doble clic restablece su ancho habitual, 400 px. Es un único ancho para todo lo que muestra la columna, se guarda en este dispositivo, nunca es menor de 340 px y siempre deja a la página al menos 360 px. En una ventana estrecha las pestañas son una lista en la barra, y la columna es una hoja sobre la página, con un ancho propio.

### Preguntar junto a la página

**Preguntar** en la barra (o **Ask about this page: “…”** en la lista del cuadro, o **Ask an agent about** en el menú del clic derecho) abre la columna para la pestaña en la que estás. En la parte superior hay un interruptor, **Preguntar** o **Hacer**; el que elijas se guarda en este dispositivo.

Con **Preguntar**, escribe lo que quieres saber, o pulsa **Resumir**, **Puntos clave** o **Explícalo de forma sencilla**, y luego **Preguntar** (**Ctrl+Enter**, ⌘+Enter en una Mac). La línea bajo el cuadro indica qué agente y qué modelo responden: los que usó por última vez la página de inicio. Una nueva sesión empieza con una copia de la página tal como está ahora (consulta [Preguntar sobre esta página](/guide/web#ask-about-this-page)), y su conversación llena la columna, así que puedes seguir preguntando ahí. Su nota termina con “Pick Do to have an agent work in the page.”

Con **Hacer**, escribe lo que un agente debe hacer en esta página (“rellena el formulario con mis datos”) y pulsa **Hazlo** (**Ctrl+Enter**, ⌘+Enter en una Mac). La línea del agente bajo el cuadro es un botón que elige **Claude Code** o **Custom** (los únicos dos que se pueden limitar a una sola pestaña; el que tuvo la página de inicio por última vez, Claude Code al principio), con el modelo que la página de inicio tuvo por última vez para él. La nota indica qué recibe el agente: una pestaña propia, con tus sesiones iniciadas en este sitio y solo el navegador, y que pregunta antes de enviar, publicar, eliminar o pagar (consulta [Hazlo en la página](/guide/web#do-it-on-the-page)). Una vez que empieza, la pestaña del agente se muestra en lugar de la página y su conversación llena la columna, como en [Agentes trabajando](/guide/web#agents-at-work).

En ambos casos, las palabras que seleccionaste en la página y enviaste con **Ask an agent about** aparecen sobre el cuadro y acompañan tu solicitud (hasta 4.000 caracteres de ellas); lo mismo ocurre con una imagen enviada con **Preguntar sobre esta imagen** (consulta [Menú del clic derecho](/guide/web#right-click-menu)), que también aparece sobre el cuadro, con preguntas rápidas como **Describe esta imagen** en Preguntar.

Cada pestaña tiene su propia conversación: cambia de pestaña y la columna muestra la de esa pestaña. **Abrir como sesión** te lleva a ella entre tus sesiones. **Nueva pregunta** (**Nueva solicitud** después de un Hacer) olvida aquí la conversación de esta pestaña (la sesión se conserva) para que puedas preguntar de nuevo. Después de un Hacer, vuelve a tus pestañas y Preguntar en esa pestaña muestra la conversación con **Verlo trabajar**, que muestra de nuevo la pestaña del agente en lugar de la página. Funciona en páginas de sitios web (Preguntar también en archivos). La fila de la página en la barra de direcciones sigue al interruptor (consulta [Sugerencias](/guide/web#suggestions)).

### Atajos de teclado

En la página Navegador, también desde dentro de una página, con Ctrl en Windows y Linux y ⌘ en una Mac:

- **Ctrl+T** abre una pestaña nueva, y **Ctrl+W** cierra la abierta.
- **Ctrl+Shift+T** vuelve a abrir la última pestaña que cerraste; púlsalo de nuevo para la anterior (las pestañas privadas no están en esa lista).
- **Ctrl+Shift+N** abre una nueva pestaña privada (**⇧⌘N** en una Mac).
- **Ctrl+Tab** va a la pestaña siguiente y **Ctrl+Shift+Tab** a la anterior. **Ctrl+1** a **Ctrl+8** van a esa pestaña, y **Ctrl+9** a la última.
- **Ctrl+L** va a la barra de direcciones.
- **Ctrl+R** (también **F5**) vuelve a cargar.
- **Alt+←** y **Alt+→** retroceden y avanzan (también **⌘[** y **⌘]** en una Mac).
- **Ctrl+F** abre la búsqueda en la página, y **Esc** la cierra.
- **Ctrl+D** guarda la página en marcadores.
- **Ctrl+H** abre el historial, y **Ctrl+J** las descargas.
- **Ctrl+B** oculta la columna de pestañas y la vuelve a mostrar. Arrastra su borde para ensancharla o estrecharla: conserva el ancho que comparten todas las columnas de la app.
- **Ctrl+P** imprime la página.
- **Menú** (⋯) → **Atajos de teclado** muestra estas teclas en la columna a la derecha de la página, por grupos: pestañas, la página, la barra de direcciones, tus listas y agentes ([Atajos de teclado](/browser?panel=shortcuts)).
- **Ctrl+Shift+Delete** abre la configuración en **Borrar datos de navegación**.
- **Ctrl** con **+**, **−** y **0** acerca, aleja y vuelve al 100 % (consulta [Zoom, impresión y pantalla completa](/guide/web#zoom-print-and-full-screen)).

### Buscar en una página

**Ctrl+F**, o **Buscar en la página** en el menú, abre una barra bajo la barra de direcciones. Escribe, y la primera coincidencia se encuentra y se desplaza a la vista cuando haces una pausa. **Enter** va a la coincidencia siguiente y **Shift+Enter** a la anterior (las flechas también), y la barra indica en qué coincidencia estás (“3 of 12”, “1000+” a partir de mil) o “No matches”. No distingue mayúsculas y minúsculas, a menos que pulses **Coincidir mayúsculas y minúsculas**, y vuelve al principio al llegar al final. **Esc**, o **×**, cierra la barra y borra lo encontrado.

### Zoom, impresión y pantalla completa

- **Zoom**: **Ctrl** con **+** acerca y **−** aleja, en los pasos que usa Chrome (del 25 % al 500 %). Ctrl y la rueda del ratón también hacen zoom, y también **−** y **+** en la fila **Zoom** de **Menú** (⋯), que se mantiene abierta mientras los pulsas. **Ctrl+0**, el porcentaje de esa fila o el indicador de abajo devuelven el zoom al **Zoom de página** de la [Configuración del navegador](/guide/web#browser-settings) (100 % al principio). Un sitio al que le aplicas zoom tú mismo conserva su zoom mientras la app se ejecuta. Un zoom distinto del zoom de página aparece como un indicador al final de la barra de direcciones, como “125%”: haz clic en él para volver (su título dice “Back to 100 %”, o tu zoom de página).
- **Imprimir**: **Ctrl+P**, o **Imprimir…** en el menú o en el menú del clic derecho, abre el diálogo de impresión de tu computadora para la página, con sus fondos.
- **Pantalla completa**: cuando un video o una página pide ocupar toda la pantalla, la ventana de la app pasa a pantalla completa y la página la llena. La salida propia de la página (Esc) devuelve la ventana a su estado anterior.

### Capturas de pantalla y PDF

**Menú** (⋯) → **Captura de pantalla o PDF** tiene tres opciones que guardan como archivo la página en la que estás, ya sea una página web o un archivo que se muestra en la pestaña:

- **Captura de pantalla de lo que ves**: una imagen de la parte de la página que se muestra en la pestaña.
- **Captura de pantalla de toda la página**: una imagen de la página de arriba abajo, sin importar cuánto se desplace (hasta 16.384 píxeles de alto; cuando no se puede hacer, obtienes lo que ves).
- **Guardar como PDF…**: la página como PDF, con sus fondos, como si la imprimieras.

Una captura de pantalla es un PNG. Se guarda en tu carpeta de Descargas, con el título de la página como nombre, seguido de la fecha y la hora (“Example 2026-11-18 at 14.30.05.png”), y también se copia al portapapeles, para que puedas pegarla directamente en un mensaje o en un documento. Aparece un aviso que dice “Captura guardada en Descargas y copiada”, con **Mostrar en la carpeta**. Un PDF se guarda en Descargas, con el título de la página como nombre, y aparece un aviso “Guardado como PDF en Descargas” con **Mostrar en la carpeta**. Si el nombre ya existe, se le añade un número y nunca se sobrescribe nada. También funcionan en una pestaña privada.

### Menú del clic derecho

Un clic derecho en una página abre un menú con lo que se puede hacer donde hiciste clic, con el aspecto y el idioma propios de la app, como sus otros menús (**Esc** o un clic fuera lo cierra):

- En un campo de texto: sugerencias de ortografía para una palabra mal escrita, con **Añadir al diccionario**; después **Deshacer**, **Rehacer**, **Cortar**, **Copiar**, **Pegar** y **Seleccionar todo**.
- En un enlace: **Abrir enlace en una pestaña nueva**, **Abrir enlace en una pestaña privada** (consulta [Pestañas privadas](/guide/web#private-tabs)), **Abrir enlace en tu navegador predeterminado**, **Copiar dirección del enlace** y **Leer enlace más tarde** (consulta [Leer más tarde](/guide/web#read-later)).
- En una imagen: **Abrir imagen en una pestaña nueva**, **Guardar imagen como…** (en tu carpeta de Descargas), **Guardar imagen en** *el proyecto que usa Guardar* (solo **Guardar imagen** mientras no haya un proyecto elegido), **Preguntar sobre esta imagen**, **Copiar imagen** y **Copiar dirección de la imagen**.
- En un video: **Reproducir** o **Pausar**, **Silenciar** o **Dejar de silenciar**, **Repetir** y **Mostrar controles** (con una marca mientras están activados), **Imagen en imagen** (con una marca mientras se muestra), **Abrir video en una pestaña nueva**, **Guardar video como…** (en tu carpeta de Descargas) y **Copiar dirección del video**. Un sonido tiene lo mismo, como **Abrir audio en una pestaña nueva**, **Guardar audio como…** y **Copiar dirección del audio**, sin imagen en imagen. Una opción solo aparece cuando ese video o sonido puede hacerlo.
- Con texto seleccionado: **Copiar**, **Búsqueda** con tu motor de búsqueda para ese texto (se abre en una pestaña nueva) y **Preguntar a un agente sobre** el texto, que abre **Preguntar** junto a la página con las palabras seleccionadas (hasta 4.000 caracteres) y la dirección de la página listas para acompañar tu pregunta (consulta [Preguntar junto a la página](/guide/web#ask-beside-the-page)), **Traducir “…”**, que muestra las palabras traducidas a tu idioma en un cuadro (consulta [Traducir una página](/guide/web#translate-a-page)), y **Resaltar**, que marca las palabras en la página y las conserva (consulta [Destacados](/guide/web#highlights)).
- En un resaltado tuyo: **Quitar resaltado**.
- En la página misma, lejos de un campo o de un texto seleccionado: **Atrás**, **Adelante** y **Volver a cargar**, y **Traducir al alemán** (el idioma al que traduces; **Mostrar original** mientras la página está traducida).
- Siempre: **Añadir esta página a marcadores**, **Leer esta página más tarde** (en una página web), **Imprimir…** e **Inspeccionar**, que abre las herramientas de desarrollo de la página.

En una pestaña privada el menú no tiene **Abrir enlace en una pestaña privada**, **Abrir enlace en una pestaña nueva** y las demás opciones “en una pestaña nueva” abren una pestaña privada, y no aparece ninguna de las opciones de **Preguntar** (**Preguntar a un agente sobre**, **Preguntar sobre esta imagen**), porque los agentes nunca tienen acceso a una pestaña privada.

**Guardar imagen en** *un proyecto* lee la imagen con los inicios de sesión de la propia pestaña, así que una imagen protegida por una cuenta funciona, y la conserva en el proyecto elegido junto a **Guardar** (en sus **Archivos**, con la página como lugar de origen), o sin proyecto. Un aviso dice “Guardada en los archivos de Thesis” (o “Imagen guardada”), con **Abrir** (o “Esa imagen ya está guardada” cuando ya la habías guardado antes). Conserva imágenes PNG, JPEG, WebP, GIF y AVIF de hasta 50 MB; un mapa de bits o un icono se convierte en PNG, y otros tipos, como SVG, se rechazan. La imagen necesita una dirección http, https, data o blob. Los agentes pueden leer lo que guarda un proyecto, así que guarda una imagen allí solo cuando no te importe. **Preguntar sobre esta imagen** lee la imagen del mismo modo y abre **Preguntar** junto a la página con ella lista para acompañar tu pregunta, junto con una copia de la página.

Los elementos propios de una extensión nunca se muestran (consulta [Qué puede no funcionar](/guide/web#what-may-not-work)).

### Pestañas privadas

Una pestaña privada es una pestaña que olvida. Abre una con **Ctrl+Shift+N** (**⇧⌘N** en una Mac), **Menú** (⋯) → **Nueva pestaña privada**, **Nueva pestaña privada** al final de la sección **Privado** en la columna de pestañas, o [/browser?private=1](/browser?private=1) (añade `&url=https://example.com` para abrir esa dirección en ella). En un enlace, clic derecho → **Abrir enlace en una pestaña privada**; en una pestaña privada esa opción no aparece, y **Abrir enlace en una pestaña nueva** abre una pestaña privada (igual que las demás opciones “en una pestaña nueva”, **Búsqueda** para las palabras seleccionadas y **Alt+Enter** en la barra de direcciones).

Una pestaña privada se ve así:

- Su fila está en la sección morada **Privado** de la columna de pestañas, que indica cuántas hay. **Cerrar pestañas privadas** (la × al final de la etiqueta) las cierra todas.
- Una etiqueta morada **Privado** está al principio de la barra de direcciones. Púlsala para ver qué es y qué conserva una pestaña privada, con **Cerrar pestañas privadas**.

Lo que una pestaña privada mantiene aparte y lo que olvida:

- **Los inicios de sesión, las cookies, los datos de los sitios y los archivos en caché** se guardan en memoria, aparte de tus otras pestañas: un sitio en el que iniciaste sesión en una pestaña normal no te reconoce en una privada, y al revés. Todo se olvida cuando se cierra la última pestaña privada o cuando se cierra la app.
- **Sus páginas no se conservan** en tu [historial](/guide/web#history), en la lista **Cerradas recientemente** (**Ctrl+Shift+T** las omite), ni entre las pestañas que se vuelven a abrir la próxima vez que inicies el navegador. Las pestañas que cierras desaparecen para siempre.
- **Las extensiones no se ejecutan en ella.** El bloqueador de anuncios y el ocultado de avisos de cookies funcionan como en cualquier pestaña.
- **Los permisos** que pide un sitio (cámara, ubicación y similares) se piden de nuevo cada vez, y tu respuesta se olvida cuando se cierra la pestaña. Un sitio que bloqueaste en tus pestañas normales sigue bloqueado.
- **Las descargas se guardan** en tu carpeta de Descargas, pero no se añaden a la lista de descargas que encuentra el cuadro de búsqueda (Ctrl+K).
- Lo que pides expresamente sí se conserva: los **marcadores**, **Leer más tarde**, los **destacados** y **Guardar** (en un proyecto). Todo esto permanece después de que la pestaña privada desaparezca, y muestra la página, así que pídelo solo cuando no te importe.
- **Traduciendo** funciona en una pestaña privada como en cualquier pestaña, así que las palabras de la página van al modelo auxiliar (consulta [Traducir una página](/guide/web#translate-a-page)); deja sin traducir una página privada si eso te importa.
- Una pestaña privada no se puede poner en un grupo, y **Agrupar mis pestañas con IA** nunca la cuenta ni la envía.
- **Los agentes nunca tienen acceso a una pestaña privada.** **Preguntar** aparece atenuado, la fila **Preguntar sobre esta página** (o **Hacerlo en esta página**) de la barra de direcciones y las opciones **Preguntar a un agente sobre** y **Preguntar sobre esta imagen** del menú del clic derecho no aparecen, y el servidor se niega a copiar su página para un agente (consulta [Entregar una página a un agente](/guide/web#hand-a-page-to-an-agent)).

Si cierras la última pestaña normal mientras hay pestañas privadas abiertas, quedan solo las privadas; de lo contrario, el navegador siempre mantiene una pestaña abierta. Las pestañas privadas se refieren al registro de esta computadora: los sitios que visitas, tu proveedor de internet y tu red todavía pueden ver adónde vas, y un sitio en el que inicias sesión sabe quién eres.

### Traducir una página

Cuando una página está en un idioma distinto del que lees, aparece un botón de traducir (un pequeño icono de **Idiomas**) a la derecha de la barra de direcciones. Se ilumina mientras la página está traducida y parpadea mientras la traducción está en curso. Púlsalo:

- Indica en qué idioma se detectó la página (“Detectado: alemán”), algo que la app calcula en esta computadora a partir de las palabras de la página y de su propia etiqueta de idioma.
- **Traducir a** es el idioma al que se traduce. Al principio es el idioma de la app; elegir otro lo conserva como tu elección (también es **Traducir a** en la [Configuración del navegador](/guide/web#browser-settings)), y una página que ya está traducida se vuelve a traducir a ese idioma.
- **Traducir** empieza. Mientras trabaja, la línea de debajo dice “Traduciendo… 12 de 40 partes”, y el botón pasa a ser **Mostrar original**, que devuelve todas las palabras de la página a como estaban. Cuando termina, la línea indica de qué idioma se tradujo y con qué modelo. Si no pudo, la línea dice por qué y el botón dice **Reintentar**.
- **Traducir siempre alemán** (para el idioma detectado) traduce las páginas en ese idioma en cuanto se cargan, de ahí en adelante. **Nunca traducir alemán** hace que el botón deje de mostrarse para ese idioma. **Nunca traducir example.com** (el sitio de la página) hace lo mismo para ese sitio, sea cual sea su idioma.
- **Configuración de traducción** abre la [Configuración del navegador](/guide/web#browser-settings) en **Traducción**.

Primero se traduce lo que está en pantalla, luego el resto de la página y después lo que llegue más tarde, al desplazarte o cuando la página cambia por sí sola, de modo que siga en tu idioma. El diseño de la página, los enlaces y las imágenes se quedan como están: solo cambian sus palabras, en el mismo lugar. Los campos de texto, el código y las partes que un sitio marca como no traducibles no se tocan. Una página muy larga se traduce hasta unos 150.000 caracteres más allá de lo que está en pantalla.

También puedes usar **Menú** (⋯) → **Traducir página…** (**Mostrar original** mientras está traducida), que abre el mismo cuadro debajo del menú cuando no se muestra el botón, por ejemplo en una página que ya está en tu idioma. Haz clic derecho en la página, lejos de un enlace, una imagen o palabras seleccionadas, y elige **Traducir al alemán** (el idioma al que traduces) o, mientras está traducida, **Mostrar original**. Selecciona algunas palabras, haz clic derecho y elige **Traducir “…”** para traducir solo esas (hasta 5.000 caracteres): un cuadro de **Traducción** las muestra junto con su traducción, una opción **Traducir a** para probar otro idioma, y **Copiar**.

Los nombres de los idiomas, en el botón y en las listas, están en el idioma de la app, con el nombre propio de cada idioma al lado.

**Qué se envía y a qué modelo.** Traducir envía las palabras de la página, por partes, al modelo auxiliar de la app, el que escribe los títulos de las sesiones y las notas de memoria ([Configuración → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)); las palabras que seleccionas para traducir también van allí. En Automático eso es Claude Haiku a través de Claude Code, o si no Codex, ambos en línea; un modelo propio en esta computadora mantiene las palabras aquí. Las imágenes y los inicios de sesión nunca se envían. Ocurre cuando pulsas **Traducir** o las opciones del menú y, para un idioma que configuraste en **Traducir siempre**, por sí solo cuando se carga cada página: si una página contiene palabras que quieres mantener en privado, no la traduzcas (o pon un modelo en esta computadora como auxiliar). Los agentes nunca ven nada de esto, y se les rechazan sus rutas.

Una página traducida también se muestra traducida en la [vista de lectura](/guide/web#reader-view).

### Vista de lectura

En una página que tiene un artículo, como una noticia, una entrada de blog o una receta, aparece un botón con forma de libro (**Vista de lectura**) a la derecha de la barra de direcciones. Púlsalo y el artículo se muestra solo sobre la página, en una columna limpia: el sitio, el título, el autor, cuánto tarda en leerse (“5 min de lectura”) y la fecha, y luego el texto con sus imágenes, sin los menús, los anuncios ni los comentarios del sitio. Vuelve a pulsar el botón (**Salir de la vista de lectura**) para regresar a la página, o elige **Menú** (⋯) → **Vista de lectura**, que tiene una marca mientras está activada. Abrir un enlace dentro de ella la cierra, igual que ir a cualquier otra página. Una página sin artículo que mostrar no tiene botón (y la opción del menú aparece atenuada; si resulta que una página no tiene ninguno, un aviso dice “Esta página no tiene ningún artículo para mostrar en la vista de lectura”).

Mientras la vista de lectura está activada, **Aa** (**Estilo de la vista de lectura**) abre cómo se ve el artículo:

- **Tamaño del texto**, con **Texto más pequeño** y **Texto más grande**: de 14 a 28 (19 al principio).
- **Colores**: **Auto** (sigue el aspecto claro u oscuro de la app), **Oscuro**, **Claro** o **Sepia**.
- **Fuente**: **Serif** o **Sans**.

Un cambio se ve al instante y se conserva para todos los artículos. Las teclas de flecha, **Page Down** y **Espacio** desplazan el artículo. Nada sale de la pestaña para crearlo: la página se lee donde está, y no interviene ningún agente ni modelo.

### Páginas oscuras

**Menú** (⋯) → **Páginas oscuras** (con una marca mientras está activado), o **Páginas oscuras** en la [Configuración del navegador](/guide/web#browser-settings), muestra las páginas web en oscuro. Un sitio que tiene un aspecto oscuro propio lo usa, como cuando tu computadora está en modo oscuro; una página que no lo tiene se oscurece con el modo oscuro automático del propio navegador, de modo que sus fondos claros se vuelven oscuros y su texto claro. Está desactivado al principio, se aplica a todas las pestañas a la vez y no afecta a los navegadores de los agentes.

Algunas páginas se ven raras en oscuro (imágenes, gráficos, colores que tenían significado). Para mostrar un sitio tal cual, haz clic en su candado y desactiva **Páginas oscuras en este sitio** (el interruptor está ahí mientras Páginas oscuras está activado). Esos sitios aparecen en **Sitios mostrados tal cual** en la configuración del navegador, donde la × junto a uno vuelve a mostrar ese sitio en oscuro.

### Leer más tarde

Deja una página a un lado para cuando tengas tiempo: abre **Menú** (⋯) → **Leer más tarde** y pulsa **Añadir esta página** arriba del panel, o haz clic derecho en la página y elige **Leer esta página más tarde**, o en un enlace y elige **Leer enlace más tarde**. Un aviso dice "Added to Read later"; una página que ya está en la lista vuelve a quedar en espera, al principio. Mientras la página en la que estás espera en la lista, el botón del panel dice **En tu lista**. Solo se pueden dejar a un lado páginas web (http y https).

La lista aparece en dos lugares: en la columna de pestañas, como **Leer más tarde** (consulta [La columna de pestañas](/guide/web#the-tab-column)), y en un panel propio en la columna junto a la página: **Menú** (⋯) → **Leer más tarde** (el menú dice cuántas páginas esperan), o ve a [Leer más tarde](/browser?panel=later). Bajo su título, el panel tiene un cuadro, **Buscar en tu lista de Leer más tarde**, que reduce la lista a las páginas cuyo título o dirección contienen tus palabras. Las más recientes primero, cada fila tiene el icono del sitio, el título de la página y, debajo, el sitio y cuándo la añadiste ("Added Today") o la marcaste como leída. Haz clic en una fila, o en **Abrir**, para abrir la página en una pestaña nueva. **Marcar como leída** la quita de la lista; **Mostrar leídas** (aparece cuando ya has leído alguna) devuelve las páginas que has leído, donde **Marcar como no leída** deja una en espera de nuevo, y **Ocultar leídas** las vuelve a guardar. **Quitar** la olvida. Si no hay nada apartado, el panel dice "Nothing set aside to read later".

Como tus marcadores, la lista es solo tuya: los agentes nunca la ven y se les rechazan las rutas que la sirven.

### Historial

Pulsa **Ctrl+H**, o **Menú** (⋯) → **Historial**, o ve a [Historial](/browser?panel=history). El panel enumera las páginas que visitaste en tu propio navegador, las más recientes primero, por día ("Today", "Yesterday" y luego la fecha), cada una con su hora, icono del sitio, título y dirección.

- El cuadro de búsqueda, **Buscar en tu historial**, encuentra páginas por las palabras de sus títulos y direcciones.
- Haz clic en una página para abrirla en la pestaña abierta, o Ctrl+clic (⌘+clic en una Mac) para abrirla en una pestaña nueva. La **×** junto a una la quita del historial. **Mostrar anteriores** carga más.
- **Cerradas recientemente** (cuando no estás buscando) enumera las pestañas que cerraste hace poco: haz clic en una para abrirla de nuevo. **Ctrl+Shift+T** abre la más reciente.
- **Borrar datos de navegación…** abre la configuración en esa parte.

Tu historial se queda en esta computadora, en la base de datos propia de la app, y solo lo alimenta tu propia navegación: páginas web y archivos, la página en la que termina cada pestaña, su título cuando se asienta. Las páginas de las [pestañas privadas](/guide/web#private-tabs) nunca se añaden, y una pestaña privada que cierras no aparece en **Cerradas recientemente**. Se guardan las últimas 20.000 páginas; las más antiguas se van primero. Los agentes nunca lo ven. Es de lo que se nutren las [sugerencias](/guide/web#suggestions) de la barra de direcciones.

Para traer el historial de tus otros navegadores, usa **Importar** al pie del panel (aparece cuando no estás buscando), igual que el panel de Marcadores. Enumera los navegadores de esta computadora que tienen historial, los mismos que para los [marcadores](/guide/web#bring-in-bookmarks), una fila por cada perfil cuando un navegador tiene varios, cada una con cuántas páginas entrarían ("8,931 pages"). Pulsa **Importar** y entran sus últimas 20.000 páginas: cada una conserva su título, cuándo la visitaste por última vez, con qué frecuencia, y con qué frecuencia escribiste su dirección, de modo que las [sugerencias](/guide/web#suggestions) de la barra de direcciones las ordenan como lo hacía ese navegador. Las páginas que ya tienes conservan la visita más reciente y los contadores más altos, así que importar otra vez no añade nada dos veces. Tu historial sigue guardando solo las últimas 20.000 páginas, y las más antiguas se van primero, y todo se queda en esta computadora: los agentes nunca lo ven. Un aviso dice "Brought in 8,931 pages" cuando termina (o "Your history has all of it already"), y el panel dice "No other browser with history was found on this computer." cuando no hay de dónde importar.

Un navegador que bloquea su historial mientras está abierto dice "Close Google Chrome, then try again: it locks its history while it is open"; ciérralo y pulsa **Importar** de nuevo. Firefox puede seguir abierto. Safari guarda su historial donde macOS lo protege, igual que sus marcadores: hasta que lo permitas, su fila dice "Hydor may not read Safari’s history: allow it in System Settings → Privacy & Security → Full Disk Access". Su fila muestra **Abrir Configuración del Sistema** en lugar de **Importar**: abre Configuración del Sistema → Privacidad y seguridad → Acceso total al disco, donde activas Hydor (añádelo con **+** si no aparece). Cuando vuelves a Hydor, vuelve a comprobarlo y aparecen el recuento de Safari e **Importar**. Si aun así no puede leer Safari, la fila añade "Allowed it? macOS may want Hydor reopened first: quit Hydor and open it again."

Los archivos que descarga tu navegador también se guardan en una lista: el nombre de cada uno, dónde se guardó y la dirección de la que vino, los últimos 5.000. **Borrar datos de navegación** con **Historial de navegación** marcado también borra esa lista, para el mismo intervalo de tiempo (los archivos se quedan donde se guardaron), y una página, marcador o descarga que se va se lleva con ello su lugar en la búsqueda por significado. El cuadro de búsqueda (Ctrl+K) encuentra tu historial, marcadores y descargas, por sus palabras y por de qué tratan, bajo **Navegador** en **Buscar en** (consulta [Busca en todo con Ctrl+K](/guide/start#search-everything-with-ctrlk)). Los agentes nunca ven nada de esto.

### Destacados

Marca palabras en una página y se quedan marcadas. Selecciona unas palabras, haz clic derecho y elige **Resaltar**: se marcan al instante, en un amarillo suave que se lee bien también en páginas oscuras, y se guardan. Cada vez que abres de nuevo esa página, las palabras se encuentran y se marcan, y otra vez un momento después en una página que construye su contenido después de cargar. Haz clic derecho dentro de un resaltado y elige **Quitar resaltado** para eliminarlo. Las palabras de la página no se cambian, solo se envuelven, así que copiar texto de una página da las mismas palabras.

- Una página es la misma página sea lo que sea lo que siga a su dirección: un `#fragment` o parámetros de seguimiento (`utm_…`, `fbclid` y similares) no importan, y `http`, `https` y `www.` cuentan como uno. Cada resaltado conserva sus palabras, un poco del texto anterior y posterior (para encontrar el lugar correcto cuando las mismas palabras aparecen dos veces), el título de la página, cuándo lo hiciste y, si añades una, una nota.
- Una página que tiene resaltados muestra una pequeña marca amarilla en el **Menú** (⋯), y **Menú** (⋯) → **Destacados** dice cuántos. Abre la columna junto a la página con los resaltados de esa página, o ve a [Destacados](/browser?panel=highlights). **Mostrar en la página** se desplaza hasta uno, **Copiar** copia sus palabras, **Añadir una nota** (o **Editar la nota**) escribe una nota que aparece cuando apuntas al resaltado en la página, y **Eliminar** lo quita. **Preguntar a un agente sobre esto** empieza una sesión con la dirección de la página y sus resaltados citados, con tus notas.
- Las palabras que ya no se encuentran (la página cambió) se quedan en la lista y simplemente no se marcan. Un resaltado admite hasta 5.000 caracteres y una página hasta 500 resaltados. Las palabras en un campo de texto y las partes ocultas de una página no se marcan. Tampoco las palabras de un marco dentro de la página (otra página mostrada en ella): ahí el menú no tiene **Resaltar**. Las palabras dentro de los componentes propios de una página se marcan como cualquier otra.

Tus resaltados se quedan en esta computadora, en la base de datos propia de la app, y los agentes nunca los ven: las rutas que los sirven rechazan a los agentes. Solo llegan a un agente cuando pulsas **Preguntar a un agente sobre esto**, y entonces solo van la dirección de esa página y sus resaltados.

### Configuración del navegador

**Menú** (⋯) → **Configuración**, o [Configuración → Navegador → Tu propia navegación → Configuración del navegador](/settings?s=browser&find=Browser%20settings), o [Configuración del navegador](/browser?panel=settings), abre un panel con:

- **Página de inicio**: la dirección web que abren el botón de Inicio y las pestañas nuevas (https://www.google.com/ al principio). **Usar la página actual** la fija a la página en la que estás.
- **Motor de búsqueda**: con qué busca la barra de direcciones: Google (al principio), DuckDuckGo, Bing, Brave, Ecosia, Startpage, o **Custom**, una dirección propia con %s donde van tus palabras, como `https://example.com/search?q=%s`.
- **Atajos de búsqueda**: escribe un atajo, un espacio y tus palabras en la barra de direcciones para buscar en ese sitio. Los habituales son `yt` (YouTube), `wiki` (Wikipedia), `gh` (GitHub), `scholar` (Google Scholar), `arxiv` (arXiv) y `hf` (Hugging Face). La × de uno lo quita. **Añadir un atajo** pide un **Atajo** (una palabra), un **Nombre** y una **Dirección, con %s donde van tus palabras**, y luego **Añadir** (o **Cancelar**); puede haber 50. **Restaurar los habituales** aparece cuando cambiaste la lista. En la barra de direcciones, `yt lofi` ofrece primero "Search YouTube for “lofi”", y **Enter** lo ejecuta; la fila de lo que escribiste ("Search Google") sigue buscando todas las palabras con tu motor.
- **Sugerencias de búsqueda** (activadas al principio): lo que escribes en la barra de direcciones se envía a tu motor de búsqueda mientras escribes, como en cualquier navegador, para que pueda sugerir búsquedas. Startpage y una dirección personalizada no dan ninguna. Desactívalas para que lo que escribes se quede en esta computadora; tus pestañas abiertas, marcadores e historial siguen apareciendo.
- **Bloquear anuncios y rastreadores** (activado al principio), consulta más abajo.
- **Ocultar avisos de cookies** (activado al principio; necesita **Bloquear anuncios y rastreadores** activado, y aparece atenuado sin él), consulta más abajo.
- **Traducción**, para [traducir páginas](/guide/web#translate-a-page):
  - **Traducir a**: el idioma al que se traducen las páginas. Es el idioma de la propia app hasta que eliges uno.
  - **Ofrecer traducir páginas en otros idiomas** (activado al principio): muestra el botón de traducir en la barra de direcciones en una página en otro idioma. Desactivado, el botón solo aparece en una página que ya está traducida; **Menú** (⋯) → **Traducir página…** sigue funcionando.
  - **Traducir siempre**: idiomas cuyas páginas se traducen en cuanto cargan. **Añadir un idioma** elige uno; la × de un idioma lo quita.
  - **No traducir nunca**: idiomas para los que nunca se muestra el botón. Un idioma está como máximo en una de estas dos listas.
  - **No traducir nunca estos sitios**: sitios para los que nunca se muestra el botón y que nunca se traducen solos ("No sites" hasta que añades uno con **No traducir nunca** en el cuadro de traducción); la × de un sitio lo quita.
  - Un aviso dice qué envía la traducción y a qué modelo.
- **Páginas**:
  - **Zoom de página** (100 % al principio; de 50 % a 200 %): qué tan grandes son las páginas, a menos que tú mismo apliques zoom a un sitio. Un sitio al que aplicas zoom tú mismo (Ctrl con + o −, Ctrl y la rueda, el **Zoom** del menú) conserva su zoom mientras la app se ejecuta; **Restablecer** (Ctrl+0, el porcentaje del menú, el chip de la barra de direcciones) lo devuelve al zoom de página (consulta [Zoom, impresión y pantalla completa](/guide/web#zoom-print-and-full-screen)).
  - **Revisar ortografía** (activado al principio): subraya las palabras mal escritas mientras escribes, con sugerencias en el menú del clic derecho.
  - **Páginas oscuras** (desactivado al principio): las páginas que no tienen un aspecto oscuro propio se muestran en colores oscuros (consulta [Páginas oscuras](/guide/web#dark-pages)).
  - **Sitios mostrados tal cual**: los sitios para los que desactivaste **Páginas oscuras en este sitio**, con una × para volver a mostrar uno en oscuro.
  - **Permitir que los sitios reproduzcan sonido por sí solos** (desactivado al principio): desactivado, el sonido de una página espera hasta que haces clic o escribes en ella, mientras que los videos sin sonido se reproducen igualmente; activado, una página puede iniciar su sonido de inmediato, como en los navegadores antiguos. Se aplica a las pestañas abiertas después de cambiarlo.
- **Borrar datos de navegación**: marca **Historial de navegación**, **Cookies y datos del sitio** (se cierra tu sesión en los sitios) y **Archivos en caché**, elige un intervalo de tiempo (**Última hora**, **Últimas 24 horas**, **Últimos 7 días** o **Todo el tiempo**) y pulsa **Borrar datos**. El intervalo de tiempo es solo para el historial (y la lista de descargas que se guarda con él): las cookies, los datos del sitio y los archivos en caché siempre se borran de todo el tiempo.

### Bloquear anuncios y rastreadores

Tu propio navegador bloquea anuncios y rastreadores, como lo hace un bloqueador de anuncios: impide que salgan las solicitudes de servidores conocidos de anuncios y de seguimiento, y oculta los huecos vacíos que quedan. Usa las listas de anuncios y rastreadores de Ghostery (EasyList, EasyPrivacy y otras), que la app descarga de GitHub cuando tu navegador arranca por primera vez y actualiza cada semana (cuando no puede, conserva las listas que tiene); con ellas no se envía nada sobre ti. No bloquea nada en los navegadores de los agentes, y funciona en las pestañas privadas. **Bloquear anuncios y rastreadores** en la [configuración del navegador](/guide/web#browser-settings) lo desactiva.

Con él activado, tus extensiones de Chrome siguen viendo las solicitudes de la página, pero una que bloquea o cambia solicitudes (un bloqueador de anuncios propio) no las bloquea; desactiva el bloqueador para dárselas a la página.

Para dejar que un sitio muestre sus anuncios, haz clic en el candado de la barra de direcciones y pulsa **Permitir anuncios en este sitio** (también sus subdominios); la página se vuelve a cargar. **Bloquear anuncios en este sitio** lo revierte.

**Ocultar avisos de cookies** (activado al principio, en la configuración del navegador, y solo mientras el bloqueador está activado) también oculta los avisos de cookies que muestran muchos sitios, con la lista de EasyList para ellos añadida a las listas anteriores. Oculta un aviso y no lo responde por ti, así que un sitio que espera tu respuesta puede retener parte de su contenido: permite los anuncios en ese sitio desde su candado para volver a ver su aviso.

### El candado

El candado al inicio de la barra de direcciones muestra si la conexión con el sitio es segura ("Not secure", con un candado abierto, para una página http). Haz clic en él para ver el sitio, si su conexión es segura, qué permitiste o bloqueaste para él (cada cosa con **Olvidar**, para que vuelva a preguntar) y, con el bloqueador activado, cuántos anuncios y rastreadores se bloquearon en esta página, con **Permitir anuncios en este sitio** o **Bloquear anuncios en este sitio**. En una página web también tiene:

- **Páginas oscuras en este sitio**, un interruptor que aparece mientras las [páginas oscuras](/guide/web#dark-pages) están activadas: desactívalo para mostrar este sitio tal cual.
- **Cookies y datos del sitio**, con **Eliminar**. Primero pregunta ("Delete the cookies and site data of example.com? You’ll be signed out of it."); al pulsar **Eliminar** se quitan las cookies y los datos almacenados de ese sitio, también de sus subdominios (para `mail.example.com`, los de example.com), de los inicios de sesión propios de esta pestaña (los de una pestaña privada son suyos), y se carga la página de nuevo. Un aviso dice qué se eliminó. Los archivos en caché se quedan: **Borrar datos de navegación** en la configuración del navegador los borra, y todo de todos los sitios.

### Descargas

Un archivo que descarga una página se guarda en la carpeta Descargas de la computadora donde se ejecuta la app, y aparece en **Menú** (⋯) → **Descargas** como "Descargando…", "Listo" o "Error", con su ruta. Una descarga hecha desde una pestaña privada se guarda del mismo modo y se muestra aquí, pero no se agrega a la lista que encuentra el cuadro de búsqueda (Ctrl+K). Haz clic en una descarga terminada para verla en su carpeta: la app de escritorio abre el administrador de archivos del sistema con el archivo seleccionado (**Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta**; consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)).

### Cuando un sitio pide un permiso

Cuando una página de tu propio navegador pide usar tu cámara, tu micrófono, tu ubicación, las notificaciones, tu portapapeles o algo similar, una barra sobre la página lo indica ("example.com quiere usar tu cámara") con **No permitir** y **Permitir**. Tu respuesta se recuerda para ese sitio, así que solo pregunta una vez; para ver lo que permitiste o bloqueaste, o para que vuelva a preguntar, abre el candado, o **Menú** (⋯) → **Permisos de sitios**, y pulsa **Olvidar** junto a una respuesta. Los navegadores de los agentes rechazan por sí mismos todas esas solicitudes, salvo las de llenar la pantalla y copiar a tu portapapeles. En una pestaña privada la barra pregunta cada vez: tu respuesta se olvida al cerrar la pestaña, y un permiso que diste en una pestaña normal no se traslada (un sitio que bloqueaste sigue bloqueado). La pregunta emergente de una página (una alerta, una pregunta de sí o no o un cuadro de texto) aparece sobre la página, igual que en el navegador de los agentes (consulta [Responder las preguntas emergentes de una página](/guide/web#answer-a-pages-pop-up-questions)).

## Marcadores

Los sitios de la barra de marcadores se fijan en la parte superior de la columna de pestañas en cuanto tienes un marcador en ella (en un teléfono no hay columna de pestañas; tus marcadores están en el menú). Haz clic en uno para abrirlo en la pestaña actual; Ctrl+clic (⌘+clic en una Mac) o un clic con el botón central lo abre en una pestaña nueva. Una carpeta abre una lista de lo que contiene, y diez recuadros es lo máximo que muestra (un recuadro **…** muestra el resto). Haz clic derecho en un recuadro para ver **Abrir**, **Abrir en una pestaña nueva**, **Editar** (**Cambiar nombre** en una carpeta) y **Eliminar**.

Para verlos todos, pulsa **Menú** (⋯) → **Marcadores**, o ve a [Marcadores](/browser?panel=bookmarks). El panel tiene dos lugares, **Barra de marcadores** y **Otros marcadores**, y las carpetas que contienen se abren y se cierran.

- **Buscar en tus marcadores** (el cuadro de la parte superior) encuentra un marcador por sus palabras (consulta [Buscar en tus marcadores](/guide/web#search-your-bookmarks)).
- **Nueva carpeta** (en la parte superior) agrega una carpeta a la barra y pide su nombre.
- **Organizar con IA** (el botón de destellos en la parte superior, junto a **Nueva carpeta**) ordena tus marcadores en carpetas por tema (consulta [Organizar con IA](/guide/web#organize-with-ai)).
- Señala una fila para ver **Subir**, **Bajar**, **Editar** (**Cambiar nombre** en una carpeta) y **Eliminar**. También puedes arrastrar una fila: sobre el centro de una carpeta para ponerla dentro, o entre filas para colocarla ahí. Una carpeta no puede meterse en sí misma. Al eliminar una carpeta, primero se te pregunta, y se elimina también lo que contiene.
- La dirección de un marcador empieza con http://, https://, file:// o chrome-extension://. Puedes guardar hasta 20.000.

### Buscar en tus marcadores

En la parte superior del panel, el cuadro **Buscar en tus marcadores** encuentra marcadores por cada palabra que escribas, en sus nombres y direcciones (no importan las mayúsculas ni los acentos), y carpetas por sus nombres. Mientras el cuadro tiene palabras, el panel muestra **Carpetas** (hasta 20) y **Marcadores** (hasta 200) en lugar de las carpetas, y cada marcador muestra su sitio y dónde está, como "Barra de marcadores › Imported from Chrome › Research".

- Haz clic en una carpeta para verla entre tus carpetas: la búsqueda se borra y la carpeta se abre.
- Haz clic en un marcador para abrirlo; Ctrl+clic (⌘+clic en una Mac) lo abre en una pestaña nueva.
- Señala un marcador para ver **Mostrar en la carpeta**, **Editar** y **Eliminar**.
- **Enter** abre el primer marcador encontrado, y **Esc** borra la búsqueda.

### Organizar con IA

Si tienes muchos marcadores, el botón de destellos **Organizar con IA** en la parte superior del panel, junto a **Nueva carpeta**, los ordena en carpetas por tema. También puedes buscar "Organizar marcadores con IA" en el cuadro de búsqueda (Ctrl+K), o ir a [Organizar con IA](/browser?panel=bookmarks&organize=1). Se abre **Organiza tus marcadores con IA**, donde eliges cómo:

- **Mantener mis carpetas** (elegida al principio): tus carpetas, y los marcadores que contienen, quedan como están. Los marcadores sueltos van a la carpeta que mejor les corresponda: una tuya o una nueva. Suelto significa que está en **Otros marcadores** mismo, o en una carpeta que solo reúne marcadores, como la "Imported from Chrome" de una importación y las carpetas "Otros marcadores" o "Marcadores del móvil" que hay dentro (el modelo auxiliar las distingue de tus propias carpetas, en cualquier idioma). Una carpeta de este tipo que quede vacía tras ordenar se quita (una que ya estaba vacía se conserva); ninguna otra carpeta se quita, se renombra ni se mueve. Las carpetas nuevas van al final de **Otros marcadores**, o dentro de una de tus carpetas.
- **Empezar de nuevo**: cada marcador pasa a carpetas nuevas por tema, en **Otros marcadores**, y tus carpetas anteriores se quitan. Las carpetas nuevas van primero en **Otros marcadores**, por nombre, con hasta un nivel de subcarpetas; una carpeta que conserve un marcador que el modelo no pudo ubicar se mantiene.

En ambos casos, los sitios fijados en tu barra de marcadores (los enlaces propios de la barra) se quedan donde están.

**Qué se envía y a qué modelo.** Solo cuando pulsas **Organizar**, los títulos y las direcciones de tus marcadores (sin lo que sigue a un **?** o **#**) y los nombres de tus carpetas se envían al modelo auxiliar de la app, el que escribe los títulos de las sesiones y las notas de memoria ([Configuración → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)). En Automático, es Claude Haiku mediante Claude Code; un modelo propio en esta computadora los mantiene aquí. No se envía nada en ningún otro momento. Si el título de un marcador es privado, no pulses este botón (o pon un modelo en esta computadora como modelo auxiliar).

Funciona en dos pasos: primero determina las carpetas y luego ordena los marcadores en ellas, de 150 en 150; unos cientos de marcadores tardan uno o dos minutos. Mientras trabaja, la parte superior del panel dice "Determinando las carpetas…", luego "Ordenando tus marcadores… 150 de 412" con una barra, y **Detener**, que no cambia nada. Cuando termina, dice lo que hizo, por ejemplo "Se ordenaron 412 marcadores en 14 carpetas nuevas. Se quitaron 3 carpetas vacías.", y las carpetas se muestran cerradas para que las nuevas se vean de un vistazo. **Deshacer** devuelve cada marcador a como estaba, siempre que no hayas cambiado tus marcadores desde entonces; la X cierra la nota. Si falla, no se cambia nada, y **Reintentar** lo abre de nuevo.

Los agentes no pueden organizar tus marcadores por ti: tu navegación es solo tuya. Pídeselo a uno y te dirá dónde está el botón.

### Traer marcadores

En **Importar** dentro del panel, la app lista los navegadores de esta computadora que tienen marcadores, cada uno con su cantidad: Chrome (y Chrome Beta), Chromium, Edge, Brave, Vivaldi, Opera, Firefox y, solo en una Mac, Arc y Safari. Un navegador con varios perfiles aparece una vez por cada uno, con el nombre del perfil. Pulsa **Importar** en uno y sus marcadores llegan a una carpeta nueva al final de la barra de marcadores, llamada "Imported from Chrome" ("Imported from Chrome (Work)" cuando el navegador tiene varios perfiles). Conserva las carpetas propias del navegador: lo que estaba primero en su barra de marcadores, luego sus otros marcadores, los del móvil y el menú de Firefox, como carpetas con los nombres que ese navegador les da. Los enlaces que no son páginas web, como los de javascript:, y las carpetas vacías se omiten. Firefox puede quedar abierto. En la app de escritorio, el recorrido de bienvenida también lo ofrece, en una página propia, **¿Traer tus marcadores y tu historial?**, cuando Hydor encuentra otros navegadores en esta computadora (consulta [Hacer el recorrido](/guide/app#take-the-tour)).

La primera vez que abres la página Navegador, cuando Hydor encuentra otros navegadores en esta computadora y aún no se te ha ofrecido la importación (la página del recorrido cuenta), una barra sobre la página pregunta "¿Traer tus marcadores y tu historial de Google Chrome y Firefox?", con los nombres de los navegadores que encontró. **No, gracias** la cierra, e **Importar…** abre el panel **Importar marcadores e historial** ([Importar marcadores e historial](/browser?panel=import)). La barra aparece solo en esa visita; el panel está disponible en cualquier momento en esa dirección, y el cuadro de búsqueda (Ctrl+K) lo encuentra. Los paneles **Marcadores** e **Historial** también tienen **Importar** al pie. Tiene una nota, "Los marcadores llegan a una carpeta nueva al final de la barra de marcadores, y el historial se suma al tuyo. Todo se queda en esta computadora.", luego los interruptores **Marcadores** e **Historial** (ambos activados) y una fila por cada navegador (y perfil) con cuántos marcadores y páginas de historial tiene, y **Importar**, que trae lo que está activado, igual que la página del recorrido. **Importado** aparece junto a lo que llegó, en ambos lugares. Si no se encuentra ninguno, dice "No se encontró ningún otro navegador en esta computadora."

Safari guarda sus marcadores donde macOS los protege. Hasta que lo permitas, su fila dice "Hydor no puede leer los marcadores de Safari: permítelo en Configuración del Sistema → Privacidad y seguridad → Acceso total al disco". Su fila muestra **Abrir Configuración del Sistema** en lugar de **Importar**: abre Configuración del Sistema → Privacidad y seguridad → Acceso total al disco, donde activas Hydor (agrégalo con **+** si no aparece). Cuando vuelves a Hydor, vuelve a comprobarlo, y se muestran la cantidad de Safari e **Importar**. Si aún no puede leer Safari, la fila añade "¿Lo permitiste? Puede que macOS necesite que reabras Hydor primero: cierra Hydor y ábrelo de nuevo."

Para traer un archivo en su lugar, pulsa **Desde un archivo** y elige un archivo de marcadores exportado desde cualquier navegador (un archivo .html, de hasta 20 MB). Llega a una carpeta llamada "Imported bookmarks".

### Sacar tus marcadores

**Exportar**, en **Importar**, guarda todos tus marcadores como `bookmarks.html`, que Chrome, Firefox y Safari pueden importar.

## Extensiones de Chrome

Tu propio navegador puede ejecutar extensiones de Chrome: un administrador de contraseñas, un modo oscuro, un traductor. Pulsa **Menú** (⋯) → **Extensiones**, o ve a [Extensiones](/browser?panel=extensions). Las extensiones se ejecutan en el navegador propio de la app de escritorio. En otros lugares, el panel las conserva y lo indica (“Las extensiones se ejecutan en el navegador propio de la app de escritorio. Se guardan aquí y se ejecutan allí.”). Una extensión se ejecuta con tus sesiones iniciadas y puede leer los sitios que pide, así que añade solo las que sean de confianza.

### Añadir una extensión

- **Desde Chrome Web Store**: pega el enlace de la extensión (una dirección de chromewebstore.google.com o chrome.google.com/webstore) o su id (32 letras de la a a la p) en **Desde Chrome Web Store**, y pulsa **Añadir**. O abre la página de la extensión en tu propio navegador y pulsa **Añadir a Hydor** en la barra superior. La app la descarga de Chrome Web Store (una solicitud a Google) y conserva su id de Web Store.
- **Desde una carpeta**: pulsa **Elegir una carpeta** (en la app de escritorio) o escribe la ruta de la carpeta (en otros lugares: una carpeta de la computadora donde se ejecuta la app), para una extensión sin empaquetar que tenga un manifest.json. Se usa donde está, sin copiarla, de modo que se ven los cambios de un desarrollador.
- **Desde tus otros navegadores**: las extensiones instaladas en Chrome, Edge, Brave y otros navegadores basados en Chromium de esta computadora aparecen en una lista, cada una con una casilla. Marca las que quieras y pulsa **Importar**. Las que ya están aquí dicen “Ya está aquí”, y las que están desactivadas en su navegador dicen “Desactivada allí”.

Las extensiones no se actualizan solas. Vuelve a añadir una desde Chrome Web Store para obtener su versión más reciente; reemplaza a la anterior.

### Desactivar una extensión o quitarla

Cada extensión del panel muestra su icono, su nombre y su versión, y un interruptor que la activa o la desactiva. **Quitar** la elimina (los archivos de una carpeta se conservan). **Opciones** abre su página de opciones en una pestaña.

Cuando una extensión tiene un botón en la barra de herramientas, aparece a la derecha de la barra de direcciones mientras está activada y fijada: haz clic en él para abrir su ventana emergente debajo del botón; una insignia en el botón, un número o unas pocas letras, muestra lo que informa la extensión. Las extensiones que no has fijado no tienen un botón propio y están en el botón **Extensiones** (la pieza de rompecabezas), después de las demás. Aparece mientras al menos una extensión esté activada.

- **Usar una extensión desde el menú**: pulsa **Extensiones** y haz clic en el nombre de una extensión para usarla, como harías con su botón. También aparece en la lista una extensión sin botón propio en la barra de herramientas: su nombre abre su página de opciones si la tiene.
- **Fijarla o dejar de fijarla**: el icono de fijar junto a una extensión en ese menú (**Fijar en la barra de herramientas**, o **Dejar de fijar de la barra de herramientas** cuando está fijada) muestra u oculta su botón en la barra de herramientas. El icono se ilumina mientras está fijada. Fijar solo cambia la barra de herramientas: la extensión sigue ejecutándose en ambos casos.
- **Más opciones para una extensión**: el **⋮** junto a ella tiene **Opciones** (cuando tiene una página de opciones), **Desactivar** y **Quitar**, que pregunta antes.
- **Administrar extensiones**, al pie del menú, abre el panel.
- **Haz clic derecho en un botón** de la barra de herramientas para ver un menú pequeño con su nombre, y luego **Opciones** (cuando tiene una página de opciones), **Dejar de fijar**, **Quitar** y **Administrar extensiones**.
- **Fijar en la barra de herramientas** también es un interruptor en el panel, debajo de cada extensión que está activada y tiene un botón.

Una extensión nueva empieza fijada. Las extensiones que importas desde Chrome conservan los fijados que tenían allí: las que tenías fijadas en Chrome están fijadas aquí, y las demás están en el menú **Extensiones**. Si haces clic en una extensión que no se está ejecutando en este navegador, la app lo indica (“… no se está ejecutando en este navegador”).

**También en los navegadores de los agentes** está desactivado al principio. Cuando se activa, la extensión también se ejecuta en los navegadores de los agentes que conservan sesiones iniciadas, los que usan un perfil (consulta [Conservar sesiones iniciadas con perfiles](/guide/web#keep-sign-ins-with-profiles)), y solo en esos. Los navegadores que empiezan desde cero nunca reciben extensiones. (En un servidor, Chromium o Chrome for Testing las cargan; Google Chrome ya no.)

### Qué puede no funcionar

El navegador de la app de escritorio tiene la mayor parte de lo que Chrome ofrece a las extensiones. Funcionan el contenido que una extensión añade a las páginas, las ventanas emergentes, las páginas de opciones, los ajustes guardados, los mensajes, las insignias, las notificaciones (se muestran como las del sistema) y las alarmas, y también lo que una extensión hace con tus pestañas: ve la pestaña en la que estás y la dirección y el título de las páginas que puede leer; abre pestañas (al frente, como en Chrome), cambia a ellas y las cierra, y detecta cuándo se cargan o cambian. Sus descargas se guardan como las tuyas, lee y establece las cookies de los sitios que puede usar, las páginas en segundo plano que crea para sí misma (fuera de pantalla) se ejecutan, y su panel lateral se abre debajo de su botón, igual que una ventana emergente. Lo que puede no funcionar: bloquear o modificar solicitudes (en lo que se basan muchos bloqueadores de anuncios), iniciar sesión con una cuenta, el historial y los marcadores del navegador, los grupos de pestañas, los atajos de teclado de una extensión y los elementos que una extensión añade al menú del clic derecho (se aceptan, pero nunca se muestran). La fila de la extensión indica cuáles pide, en una línea como “Algunas partes pueden no funcionar aquí: bloquear o modificar solicitudes, iniciar sesión con una cuenta”. Se guía por lo que la extensión pide, así que aun así puede funcionar bien.

## Entregar una página a un agente

Un agente nunca recibe tu propio navegador. Puedes darle una sola página de él, de dos maneras (una [pestaña privada](/guide/web#private-tabs) no se puede entregar: **Preguntar** aparece en gris allí, y la app rechaza la copia de su página): **Preguntar** le da una copia para leer, y **Hacer** le da una pestaña en la que trabajar. Ambas están en **Preguntar** en la barra, que abre la columna junto a la página con un interruptor, **Preguntar** o **Hacer** (consulta [Preguntar junto a la página](/guide/web#ask-beside-the-page)). Funcionan con una página de un sitio web. El cuadro de la barra hace ambas cosas con lo que escribes, según indica el interruptor: su fila **Preguntar sobre esta página: “…”** se convierte en **Hazlo en esta página: “…”** mientras está elegido **Hacer**.

### Preguntar sobre esta página

El agente recibe una copia de la página, un archivo con su título, su dirección, lo que tenías seleccionado en ella y su texto legible (hasta 200.000 caracteres), y empieza una nueva sesión con tu pregunta, con el agente y el modelo que usó por última vez la página de inicio. La respuesta aparece en la columna junto a la página, y **Abrir como sesión** te lleva a ella. El agente no puede tocar la página ni ver tus sesiones iniciadas: lee la copia. Deja que la página termine de cargarse primero, ya que la copia es lo que la pestaña muestra ahora.

### Hacerlo en la página

Con **Hacer** elegido en Preguntar, la columna pregunta “¿Qué debe hacer un agente en esta página?” y explica qué recibe el agente. Elige **Claude Code** o **Custom** con el botón del agente (solo estos dos pueden limitarse al navegador; la app rechaza los demás) y pulsa **Hazlo**. Las palabras que seleccionaste en la página con **Preguntar a un agente sobre** o una imagen de **Preguntar sobre esta imagen** se envían con la solicitud. El agente recibe:

- **Una pestaña propia**, en el navegador que conserva tus sesiones iniciadas, abierta en la dirección de tu página: tiene la sesión iniciada como tú en ese sitio. Tu propia pestaña se queda donde está.
- **Solo ese sitio**: no se le abrirán páginas de otros lugares. Para una página de esta computadora, es solo esa dirección.
- **Solo el navegador**: sin comandos, sin archivos, sin búsqueda web, sin otras apps, sin memoria y sin subagentes. Una sesión así no se puede continuar en otro agente, y una bifurcación de ella sigue limitada al navegador.
- **Una pausa antes de enviar**: pregunta, como se explicó antes, antes de pulsar un botón que envía, publica, elimina o transfiere algo, y se le indica que te pregunte cuando tenga dudas (consulta [Botones que envían, publican o eliminan](/guide/web#buttons-that-send-post-or-delete)). Pagar queda de tu lado, como siempre.

El primer mensaje del agente le dice que tu página está abierta en su navegador y que trabaja allí solo. El navegador debe estar activado en Configuración (**Un navegador para agentes**). Después de pulsar **Hazlo**, la pestaña del agente aparece en lugar de la página, con su conversación al lado (consulta [Agentes trabajando](/guide/web#agents-at-work)). De vuelta en tus pestañas, Preguntar para esa pestaña muestra la conversación, con **Verlo trabajar** (la pestaña del agente vuelve a mostrarse), **Abrir como sesión** y **Nueva solicitud**.

### Recuperar la página

En un navegador de agente que recibió tu página, el panel sobre su cuadro de mensaje dice “Tu pestaña de example.com” con **Recuperar**, y la barra también lo muestra mientras lo observas. Púlsalo para cerrar la pestaña del agente y abrir la página como una pestaña nueva tuya, al frente. Al agente se le dice “Recuperé la página: vuelve a ser mía”. Su navegador se cierra con su última pestaña, y por lo demás como se cierra el de cualquier sesión cuando la sesión termina (consulta [Cuando se cierra el navegador](/guide/web#when-the-browser-closes)).

## Agentes trabajando

Mientras un agente tiene un navegador abierto, la columna de pestañas lo enumera en **Agentes trabajando**, una fila por cada uno, con el título de la sesión y lo que está haciendo (“Haciendo clic en ‘Iniciar sesión’”, “Esperándote”, “Estás al control: el agente espera”). La lista se mantiene actualizada, y esta parte no aparece cuando ningún agente tiene un navegador abierto. Haz clic en una fila para ver ese navegador en lugar de la página:

- La página aparece con las preguntas del agente encima, como en [Tomar el control para iniciar sesión, resolver una verificación o pagar](/guide/web#take-over-to-log-in-solve-a-check-or-pay), y un anillo alrededor: ámbar mientras espera por ti, azul mientras tú tienes el control. El cuadro muestra un chip con el agente y el título de la sesión (su **×**, **Volver a tus pestañas**, te lleva de vuelta) y la dirección de la pestaña del agente.
- La barra tiene **Detener** mientras el agente trabaja, **Tomar el control** (o **Devolver**, cuando tú tienes el control), **Recuperar** para una página que le entregaste, y **Abrir la sesión**. En la app de escritorio, haz clic dentro de su página para usarla tú; el agente espera.
- La columna de la derecha muestra la conversación de la sesión, en vivo, con su cuadro de mensaje: míralo trabajar, respóndele o envíale un mensaje. **Abrir la sesión** y **×** están en la parte superior.

**Esc**, la **×** del chip, **Volver a tus pestañas** o un clic en una de tus pestañas te devuelve a tus propias pestañas; la columna de la derecha muestra lo que mostraba antes, o se cierra.

## Configurar el navegador

Abre [Configuración → Capacidades → Navegador](/settings?s=browser) («Un navegador web que usan los agentes, que puedes ver y controlar tú»).

### Un navegador para los agentes

[Un navegador para los agentes](/settings?s=browser&find=A%20browser%20for%20agents) es el interruptor junto al título de la sección. Activa o desactiva el navegador para todos los agentes. Se activa solo cuando se encuentra un Chromium, y no se puede activar hasta entonces. Cuando está desactivado, los agentes no reciben las herramientas del navegador. Además, cada agente tiene su propio interruptor **Usar un navegador**, en [Lo que puede usar](/guide/agents#what-it-may-use): un agente que lo tenga desactivado no recibe las herramientas del navegador, sea cual sea el ajuste de aquí.

### Chromium

[Chromium](/settings?s=browser&find=Chromium) muestra el que está en uso, con su versión, y dónde está en su (i). La app elige, en este orden: en la app de escritorio, **el navegador propio de la app de escritorio**; un Chrome o Chromium instalado en esta computadora; uno que ella misma descargó; y por último uno que instaló Playwright (una herramienta para probar navegadores). Cuando encuentra más de uno, un selector te permite elegir: **El mejor encontrado**, o uno en concreto.

El navegador propio de la app de escritorio no necesita descarga y no tiene una ruta que mostrar. Mientras es el que está en uso, la fila dice «Las páginas se muestran en la ventana de la app.», y **Descargar Chrome** y **Mostrar una ventana** no aparecen, porque ninguno tiene sentido para él. Elige otro Chromium y vuelven a aparecer. La página Navegador (tu propio navegador) usa el mismo motor.

Cuando no se encuentra ninguno, la fila lo indica y ofrece descargar Chrome for Testing (unos 170 MB) en la carpeta de datos de la app: pulsa **Descargar Chrome**; una barra muestra el progreso y, si falla, la fila explica por qué. El botón se mantiene mientras no exista una copia descargada, aunque se haya encontrado otro Chromium.

Si el sandbox de Chrome (el muro entre las páginas y el resto de la computadora) no puede ejecutarse en esta computadora, una nota lo indica. Las páginas siguen sin poder acceder a la red de esta máquina, pero limita los perfiles a los sitios que necesites.

### Mostrar una ventana

[Mostrar una ventana](/settings?s=browser&find=Show%20a%20window) está desactivado al principio: el navegador se ejecuta fuera de la vista y lo ves en la app. Si lo activas, además se abre una ventana en la pantalla de esta computadora. El headless shell de Playwright (un Chromium sin ventana) no puede mostrar una, así que con él el interruptor se queda desactivado. El cambio se aplica la próxima vez que se inicie el navegador. No aparece mientras se usa el navegador propio de la app de escritorio.

### Mantener las páginas fuera de esta máquina y su red

[Mantener las páginas fuera de esta máquina y su red](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) está activado al principio. Las páginas no pueden acceder a esta computadora ni a las direcciones privadas de su red (routers, impresoras, esta app), ya sea mediante una conexión directa o mediante el nombre de un sitio que luego lleve a una de esas direcciones: toda conexión pasa por un punto de control de la app. Una sesión todavía puede abrir su propio servidor de desarrollo una vez que lo permites (consulta [Permitir que una sesión abra un sitio en esta computadora o en tu red](/guide/web#let-a-session-open-a-site-on-this-computer-or-your-network)). Si lo desactivas, las páginas pueden acceder a tu red, pero Hydor en sí sigue fuera de su alcance.

### Capturas de pantalla para modelos que ven imágenes

[Capturas de pantalla para modelos que ven imágenes](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images) está activado al principio: los agentes cuyo modelo ve imágenes pueden mirar la página con recuadros numerados dibujados encima. Los modelos que solo leen texto siempre reciben la página como texto; con esto desactivado, todos los modelos la reciben así.

### Preguntar antes de enviar en sitios con sesión iniciada

[Preguntar antes de enviar en sitios con sesión iniciada](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites) está activado al principio. Antes de que un agente envíe, publique, elimine o transfiera algo en un sitio en el que ha iniciado sesión, se te pregunta (consulta [Botones que envían, publican o eliminan](/guide/web#buttons-that-send-post-or-delete)). Si lo desactivas, los agentes pulsan esos botones sin preguntar, en los sitios donde un perfil tiene la sesión iniciada y en una página que tú les hayas pasado. Los pagos se detienen en cualquier caso.

### Sitios: solo estos, nunca estos

En [Sitios](/settings?s=browser&find=Sites), dos listas se aplican al navegador de todas las sesiones, un sitio por línea, como example.com (sus subdominios también cuentan):

- **Solo estos sitios**: cuando tiene alguno, el navegador abre páginas únicamente en esos sitios. Vacía significa cualquier sitio.
- **Nunca estos sitios**: no se carga nada de estos sitios.

**Guardar sitios** aparece junto al título del grupo en cuanto los cambias: púlsalo. Puedes pegar direcciones completas: la app conserva solo el sitio («https://www.example.com/page» se convierte en example.com). Cada sesión puede añadir los suyos en el menú de su navegador (**Sitios de esta sesión**).

### Conservar los inicios de sesión con perfiles

Un perfil es una carpeta propia del navegador que conserva los inicios de sesión entre sesiones, de modo que los agentes pueden trabajar en sitios en los que has iniciado sesión sin que tu contraseña llegue nunca a ellos. Tu propio perfil de Chrome nunca se usa. En [Perfiles](/settings?s=browser&find=Profiles):

1. Pulsa **Nuevo perfil**, ponle un nombre (como Trabajo o Compras) y pulsa **Añadir**.
2. Se abre una ventana, «Iniciar sesión en sitios · Trabajo». Escribe un sitio en el que iniciar sesión, como github.com/login, y pulsa **Abrir**.
3. Haz clic y escribe en la página como en cualquier navegador (en un teléfono, **Teclado** abre tu teclado) e inicia sesión. Abre más sitios de la misma manera.
4. Cierra la ventana cuando termines. Los inicios de sesión se quedan en el perfil.

Para usarlo, abre el navegador de una sesión, luego **Opciones del navegador** (⋯) → elige el perfil en **Perfil**. Al elegirlo, el navegador se cierra; se vuelve a abrir, con la sesión iniciada, la próxima vez que lo abran el agente o tú, y el panel muestra el nombre del perfil. Las sesiones que usan el mismo perfil comparten sus inicios de sesión.

Cada perfil de la lista tiene **Iniciar sesión en sitios** (para iniciar sesión en más), y un menú **⋯** con **Cambiar nombre** y **Eliminar**, que también elimina sus inicios de sesión y todo lo que el navegador guardó para él, y cierra los navegadores que lo usan. Si aún no hay perfiles, la lista dice que el navegador de cada sesión empieza desde cero, sin sesión iniciada en ningún sitio.

### Tu propia navegación

En la app de escritorio, [Configuración → Navegador](/settings?s=browser) también tiene un grupo **Tu propia navegación** («La página Navegador: páginas que usas tú, a las que los agentes nunca acceden»), con tres filas que abren los paneles de la página Navegador: [Marcadores](/settings?s=browser&find=Bookmarks) («Los tuyos, con los de los otros navegadores de esta computadora»), [Extensiones](/settings?s=browser&find=Extensions) («Extensiones de Chrome, en la app de escritorio») y [Configuración del navegador](/settings?s=browser&find=Browser%20settings) («Página de inicio, buscador, traducción, páginas oscuras, bloqueador de anuncios, historial y borrado de lo que guardó»). En otros lugares el grupo no se muestra. Consulta [Marcadores](/guide/web#bookmarks), [Extensiones de Chrome](/guide/web#chrome-extensions) y [Configuración del navegador](/guide/web#browser-settings).

## Permitir que los agentes usen tu computadora

En la app de escritorio, en Mac, en Windows y en Linux, los agentes también pueden usar la propia computadora, como una persona frente a ella: ven su pantalla y usan su ratón y su teclado, en cualquier app (Notas o Calendario en una Mac, el Bloc de notas o Excel en Windows, Archivos en Linux, una app a la que el navegador no llega). Para los sitios web se limitan al navegador, que es más rápido y más seguro. El uso de la computadora está desactivado al principio. Además, cada agente tiene su propio interruptor **Usar la computadora**, en [Lo que puede usar](/guide/agents#what-it-may-use): un agente que lo tenga desactivado no puede usar la computadora, aunque **Uso de la computadora** esté activado.

### Activar el uso de la computadora

Abre [Configuración → Capacidades → Uso de la computadora](/settings?s=computer) («Los agentes ven tu pantalla y usan el ratón y el teclado, en la app de escritorio») y activa el interruptor [**Uso de la computadora**](/settings?s=computer&find=Computer%20use) junto al título de la sección. Después, según tu sistema:

- **En una Mac**, concede a Hydor los dos permisos de macOS. Junto a [**Accesibilidad**](/settings?s=computer&find=Accessibility), el permiso de macOS para usar el ratón y el teclado, pulsa **Permitir…**. macOS pregunta si Hydor puede controlar esta computadora y se abre su Configuración del Sistema en **Privacidad y seguridad → Accesibilidad**: activa **Hydor** allí. Junto a [**Grabación de pantalla**](/settings?s=computer&find=Screen%20Recording), el permiso de macOS para ver la pantalla, pulsa **Permitir…** y activa **Hydor** en **Grabación de pantalla** (**Grabación de pantalla y audio del sistema** en macOS 15). Si macOS pide cerrar y volver a abrir Hydor, hazlo: los agentes en ejecución continúan. Un permiso concedido por macOS muestra **Permitido** y se conserva cuando la app se actualiza. Si la Configuración del Sistema muestra **Hydor** activado pero Configuración sigue diciendo **Permitir…**, ese interruptor es de una versión anterior (antes de la 0.28.1, cada actualización volvía a necesitar los permisos): pulsa **Permitir…**, que lo borra, y activa **Hydor** otra vez.
- **En Windows** no hay nada que permitir. Los programas que se ejecutan como administrador quedan fuera del alcance del agente, y también la pantalla mientras está bloqueada.
- **En Linux** funciona en un escritorio X11 (Xorg) con Python 3, que casi todos los sistemas tienen. Un escritorio con Wayland, como GNOME y KDE en la mayoría de los sistemas actuales, no deja que ninguna app vea la pantalla ni use el ratón y el teclado de las demás: la sección lo indica, y también cómo iniciar sesión en una sesión X11 en su lugar (en Ubuntu, el engranaje de la pantalla de inicio de sesión → **Ubuntu on Xorg**).

Cuando algo impide que el uso de la computadora funcione en esta computadora, la sección dice qué, en un recuadro amarillo en la parte superior (con el interruptor desactivado, una nota indica que los agentes no pueden usar esta computadora). La sección está en Configuración en todas partes, pero solo la app de escritorio puede hacerlo: en otros lugares lo indica.

### Qué hacen los agentes en tu computadora

La primera vez que un agente de una sesión quiere usar la computadora, una tarjeta en la conversación pregunta: «¿Permitir que el agente use tu Mac?» («tu PC» en Windows, «tu computadora» en Linux), con **Permitir en esta sesión** y **Ahora no**. La sesión espera tu respuesta y recibes una notificación. Una vez permitido, el agente puede:

- mirar la pantalla (la pantalla principal, reducida; las otras pantallas no se muestran);
- hacer clic, doble clic, clic derecho, arrastrar, desplazarse y mover el puntero;
- escribir texto, en cualquier idioma, y pulsar teclas y atajos como ⌘C en una Mac o Ctrl+C en Windows y Linux;
- abrir una app por su nombre, como lo muestra el menú Inicio o el menú de aplicaciones.

Mientras un agente trabaja, un resplandor recorre los bordes de tu pantalla, en todas las pantallas, y una nota en la parte inferior dice «Un agente está usando tu Mac» (tu PC, tu computadora) y «Pulsa Esc para detener». Los clics lo atraviesan y nunca toma el teclado. Es solo para ti: las capturas de pantalla del agente nunca lo muestran (se oculta en el instante en que se toma una captura y vuelve después). En Linux necesita un escritorio que componga sus ventanas, como hacen GNOME, KDE, Xfce, Cinnamon y MATE; sin uno no hay resplandor, y el icono de la bandeja sigue indicando que un agente está trabajando.

### Ver adónde apunta el agente en tu pantalla

El agente mueve el puntero de tu propio ratón, que es pequeño y fácil de perder. Por eso, mientras trabaja, un anillo grande con un halo suave, en los colores del resplandor, rodea el puntero, con una etiqueta **Agente** a su lado:

- el puntero se desliza a cada lugar en un cuarto de segundo en lugar de saltar hasta allí, y el anillo lo acompaña, para que tu vista pueda seguirlo;
- donde hace clic, se extiende una onda (una discontinua para un clic derecho, dos para un doble clic), y mientras mantiene pulsado el botón (un arrastre), el anillo se estrecha y sigue el arrastre;
- las palabras que escribe y las teclas que pulsa (Ctrl+S, Enter) aparecen un momento junto a la etiqueta, y un desplazamiento muestra su dirección con flechas.

El anillo forma parte del resplandor: los clics lo atraviesan, nunca toma el teclado, las capturas de pantalla del agente nunca lo muestran y, en Linux, necesita un escritorio que componga sus ventanas.

Cada paso aparece en la conversación como una línea con una pequeña imagen de la pantalla después de él: haz clic en la imagen para verla en grande, y en la línea para ver la respuesta completa del agente. Al abrirla, la imagen marca dónde actuó el paso: un anillo donde hizo clic (dos para un doble clic, discontinuo para un clic derecho), una línea a lo largo de un arrastre, una flecha donde se desplazó, con números cuando el paso hizo varias cosas. La app conserva las imágenes de los últimos 200 pasos de cada sesión; las de las sesiones sin actividad durante un mes se eliminan.

A los agentes se les indica que miren antes de actuar, que usen el navegador para los sitios web y que nunca escriban contraseñas, números de tarjeta ni códigos, ni paguen, compren o envíen dinero: para eso se detienen y te piden que lo hagas tú. Una sola sesión usa la computadora a la vez.

### Detener a un agente que usa tu computadora

Mientras un agente usa la computadora, se muestran el resplandor y su nota, el icono de la app lo indica (en una Mac, «Agente usando tu Mac» a su lado en la barra de menús) y su sesión muestra «El agente está usando tu Mac» (tu PC, tu computadora) encima del cuadro de mensaje. Para detenerlo de inmediato:

- pulsa **Esc**, en cualquier app (en una Mac, **⌘⇧Esc** también funciona). Esc detiene al agente solo mientras hay uno trabajando, y que el propio agente pulse Escape, por ejemplo para cerrar un diálogo, no lo detiene;
- elige **Detener** en el menú del icono de la app: en la barra de menús en una Mac, el área de notificaciones en Windows, la bandeja del sistema en Linux;
- o pulsa **Detener** encima del cuadro de mensaje de la sesión, o en Configuración → Uso de la computadora.

Detenerlo termina lo que el agente está haciendo y retira el permiso de todas las sesiones: un agente que quiera usar de nuevo la computadora vuelve a preguntar en la tarjeta («Has detenido al agente que usaba tu Mac. ¿Dejar que continúe?»). Desactivar **Uso de la computadora** hace lo mismo.

## Pregunta a un agente

- “Activa SearXNG en https://searx.example.org, ponlo primero entre los proveedores de búsqueda y pruébalo.”
- “Desactiva DuckDuckGo para la búsqueda en la web.”
- “Da a los agentes 50 resultados de búsqueda por defecto.”
- “Impide que el navegador abra facebook.com o tiktok.com.”
- “Muestra el navegador en una ventana en esta computadora y desactiva sus capturas de pantalla.”
- “Crea un perfil de navegador llamado Compras.” (Iniciar sesión en sitios dentro de él te corresponde a ti, en Configuración → Navegador.)
- “Deja de preguntarme antes de que los agentes pulsen Enviar o Eliminar en sitios donde han iniciado sesión.” (está en Configuración → Navegador → Preguntar antes de enviar en sitios con sesión iniciada; para volver a activarlo, hazlo del mismo modo)
- “¿El navegador de mis agentes es el propio de la app de escritorio o es un Chromium?”
- “¿Cómo le doy a un agente la página que estoy viendo en la página Navegador?” (**Preguntar sobre esta página** le da una copia; **Hacer** en Preguntar le da una pestaña propia en la página)
- “Haz que un agente rellene por mí el formulario de esta página.” (**Preguntar** en la barra y luego **Hacer**; recibe una pestaña propia, con tu sesión iniciada en ese sitio, y pregunta antes de enviar)
- “¿Cómo busco en YouTube o en Wikipedia directamente desde la barra de direcciones?” (un atajo de búsqueda: escribe `yt` o `wiki`, un espacio y tus palabras; en **Configuración del navegador** → **Atajos de búsqueda** puedes añadir los tuyos)
- “Haz que las páginas web se vean más grandes por defecto y desactiva el corrector ortográfico.” (**Configuración del navegador** → **Páginas** → **Zoom de página** y **Revisar ortografía**)
- “Haz más ancha la columna junto a la página.” (arrastra su borde izquierdo; con un doble clic recupera su ancho original)
- “¿A qué teclas responde mi navegador?” (**Menú** → **Atajos de teclado**)
- “Añade example.org/reports a mi barra de marcadores, en una carpeta llamada Trabajo.”
- “¿Cómo cambio el buscador o la página de inicio de mi navegador?” (está en **Menú** → **Configuración** en la página Navegador: te corresponde a ti cambiarlo, los agentes no pueden)
- “¿Cómo permito los anuncios en un solo sitio de mi navegador?” (**Permitir anuncios en este sitio**, en el candado)
- “¿Cómo borro mi historial de navegación y las cookies?” (**Configuración del navegador** → **Borrar datos de navegación**; el intervalo de tiempo cuenta para el historial y para la lista de descargas que se guarda con él, y solo para eso)
- “¿Por qué la barra de direcciones me sugiere una página que visité y que no tiene ninguna de las palabras que escribí?” (con la búsqueda por significado activada, también ofrece páginas sobre lo que escribiste)
- “¿Cómo organizo mis pestañas en grupos y qué envía Agrupar mis pestañas con IA?” (clic derecho en una pestaña → **Añadir al grupo**; el botón de IA envía los títulos y las direcciones de las pestañas, sin lo que va después de un ? o #, al modelo auxiliar, solo cuando lo pulsas)
- “¿Cómo reabro una pestaña que cerré?” (**Ctrl+Shift+T**, o **Cerradas recientemente** en el historial)
- “¿Cómo resalto palabras en una página y las vuelvo a encontrar?” (selecciónalas, clic derecho, **Resaltar**; en **Menú** → **Destacados** están todas)
- “¿Mi navegador bloquea anuncios y de dónde salen sus listas?”
- “¿Qué conserva una pestaña privada y qué olvida?” (los inicios de sesión, las cookies y los datos de sitios se guardan aparte y se olvidan cuando se cierra la última pestaña privada; sus páginas no aparecen en el historial; las descargas, los marcadores y lo que guardas sí se conservan)
- “Traduce esta página al inglés y traduce siempre las páginas en japonés.” (el botón de traducir de la barra de direcciones; **Traducir siempre** está en **Configuración del navegador** → **Traducción**; las palabras de la página se envían al modelo auxiliar)
- “¿Cómo leo un artículo sin distracciones y con una letra más grande?” (el botón del libro en la barra de direcciones y luego **Aa**)
- “Muestra las páginas web en oscuro, salvo un sitio.” (**Menú** → **Páginas oscuras** y luego, en el candado de ese sitio, **Páginas oscuras en este sitio**)
- “¿Cómo guardo una página web completa como imagen o como PDF?” (**Menú** → **Captura de pantalla o PDF** → **Captura de pantalla de toda la página** o **Guardar como PDF…**; ambas van a Descargas)
- “¿Cómo ordeno mis marcadores en carpetas con IA y qué envía?” (**Organizar con IA** en el panel de Marcadores; los títulos y las direcciones de tus marcadores, sin lo que va después de un ? o #, y los nombres de tus carpetas se envían al modelo auxiliar, solo cuando pulsas **Organizar**; **Deshacer** los deja como estaban)
- “¿Cómo encuentro un marcador?” (**Buscar en tus marcadores**, en la parte superior del panel de Marcadores)
- “¿Cómo guardo una página para leerla más tarde y dónde encuentro la lista?” (**Menú** → **Leer más tarde** → **Añadir esta página**, o clic derecho → **Leer esta página más tarde**; la lista está en ese panel y bajo las pestañas)
- “Guarda esta página en mi proyecto Tesis.” (**Guardar**, con **Tesis** elegido en el **▾** que está al lado; la copia queda en los **Archivos** del proyecto)
- “Trae mis marcadores de Chrome y Firefox a la página Navegador.” (o: “¿Por qué no puedo importar mis marcadores de Safari?”)
- “Trae mi historial de Chrome a la página Navegador.” (o: “¿Por qué no puedo importar mi historial de Safari?”)
- “¿Qué extensiones de Chrome hay en mi navegador y cuáles de ellas funcionan también en los navegadores de los agentes?”
- “Añade a mi navegador la extensión de https://chromewebstore.google.com/detail/…” (la app te pregunta antes, cada vez)
- “Deja en la barra de herramientas solo mi administrador de contraseñas y las demás extensiones en el menú Extensiones.” (la chincheta junto a cada extensión, en el menú del botón **Extensiones**)
- “Rellena por mí el formulario de la tarjeta de la biblioteca en riverside.example.org; yo miraré.” (su puntero muestra en la vista en vivo dónde hace clic y dónde escribe)
- “Abre Notas en mi Mac y empieza una nota con la lista de la compra de hoy.”
- “Abre el Bloc de notas y escribe la lista de la compra de hoy.” (en Windows; el resplandor alrededor de la pantalla se ve mientras trabaja, su anillo muestra adónde apunta y Esc lo detiene)
