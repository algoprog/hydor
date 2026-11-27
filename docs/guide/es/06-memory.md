# Memoria

Los agentes de Hydor recuerdan lo importante de una sesión a la siguiente: datos sobre ti, sobre cada proyecto y en qué punto está una tarea, además de un perfil tuyo con el que todos los agentes empiezan. Este tema explica qué guardan y cuándo, tu perfil, con qué empieza un agente, cómo ver, corregir o deshacer lo que se guardó, y todo lo que hay en Configuración → Memoria, incluida la búsqueda por significado y la limpieza que se hace sola. Úsalo para que los agentes dejen de preguntar lo mismo dos veces y para saber siempre qué saben.

![Configuración → Memoria: lo que los agentes recuerdan sobre ti y tus proyectos](images/memory.webp)

## Qué recuerdan los agentes

La memoria tiene tres partes, que funcionan como una sola:

- **Notas de memoria**: datos breves con los que empieza cada agente, sobre ti, un proyecto o una sesión. La mayor parte de este tema trata de ellas.
- **Memoria wiki**: artículos más largos, con sus fuentes, que los agentes guardan para cada proyecto (y un conjunto compartido), escritos a partir de sus documentos, sus conversaciones y sus commits (consulta [Memoria wiki](/guide/wiki-memory)). Sin que lo pidas, los agentes reciben una línea por cada artículo relacionado con lo que preguntas, y los planes en curso del proyecto.
- **Documentos**: los archivos en sí, que los agentes buscan y citan, y que no reciben si no los pides. Se guardan en [Conocimiento compartido](/knowledge) y en la pestaña **Memoria** de cada proyecto, junto a sus notas y artículos wiki (el filtro **Documentos**; consulta [Proyectos y conocimiento](/guide/projects)).

La pestaña **Memoria** de un proyecto muestra las tres partes en una sola lista, con un cuadro de búsqueda sobre ellas (consulta [La pestaña Memoria de un proyecto](/guide/wiki-memory#a-projects-memory-tab)). Cuando se añade o cambia un documento, el modelo auxiliar lo lee, añade algunas notas a la memoria del proyecto y actualiza su wiki (consulta [Aprender de documentos nuevos](/guide/wiki-memory#learn-from-new-documents)).

Las notas de memoria son breves: cada una es una o dos frases, de 500 caracteres como máximo. Todos los agentes que ejecuta la app las comparten: Claude Code, Codex, Custom y los agentes que hablan ACP, como Gemini CLI. Las memorias propias de Claude Code y de Codex permanecen desactivadas en las sesiones que ejecuta la app, así que estas notas son la única memoria que todos comparten, y puedes ver y deshacer todo lo que guardan. Cada nota pertenece a uno de estos tres lugares:

- **Sobre ti**: datos y preferencias duraderos sobre ti (“Prefiere unidades métricas”, “Le gustan las respuestas cortas”, “Trabaja sobre todo en Python”). Todas las sesiones las reciben.
- **Un proyecto**: datos sobre un proyecto, como sus convenciones, los comandos que lo compilan y lo prueban, dónde está cada cosa y las decisiones tomadas. El proyecto es la carpeta en la que trabaja una sesión: la carpeta superior de su repositorio de Git, si está en uno, o la propia carpeta en caso contrario. Un worktree (una copia separada de un repositorio en su propia rama) comparte las notas de su repositorio principal, de modo que las sesiones de todas las ramas ven las mismas. Una sesión en tu carpeta personal no tiene notas de proyecto: solo recibe lo que es sobre ti y lo suyo.
- **Una sesión**: en qué punto está una tarea, para que esa sesión lo retome cuando continúe. Se eliminan cuando se elimina la sesión.

Una sesión ve y cambia solo tres conjuntos de notas: las que son sobre ti, las de su propio proyecto y las suyas. Un agente que trabaja en un proyecto nunca ve las notas de otro. Las sesiones de un [proyecto](/guide/projects) trabajan todas en la carpeta del proyecto, así que comparten sus notas de proyecto. Una tarea que recibe una carpeta nueva propia (consulta [Agentes](/guide/agents)) tiene esa carpeta como proyecto.

Las notas también están vinculadas al código del proyecto: una nota de proyecto que nombra archivos o carpetas queda vinculada a ellos en el repositorio de Git del proyecto, y al commit en el que se escribió, para que Hydor pueda saber cuándo el código ha cambiado respecto a lo que dice la nota (consulta [Limpieza automática](/guide/memory#tidy-up-automatically)).

Cuando un lugar acumula muchas notas, aparecen en él más tipos de entrada: **temas**, cada uno con el resumen de un grupo de notas relacionadas, y, en un proyecto, un **perfil**, un resumen breve que los agentes reciben siempre primero. La limpieza los escribe (consulta [Limpieza automática](/guide/memory#tidy-up-automatically)), junto con un título corto para cada nota y tema, para el índice con el que empiezan los agentes. Tu propio perfil es otra cosa: lo escribís tú y tus agentes (consulta [Tu perfil](/guide/memory#your-profile)).

La memoria funciona en las sesiones que ejecuta esta app, no en las que solo muestra, como una sesión abierta en una terminal o en VS Code.

## Cómo se escriben las notas

Los agentes guardan notas en dos casos: cuando lo pides (“Recuerda que soy vegetariano”, “Recuerda que el servidor de pruebas es test.example.com”), o cuando aprenden algo duradero que una sesión posterior no podría averiguar por sí misma: lo que quieres, una decisión y su motivo, una trampa, una regla aprendida a las malas. Nada se escribe solo después de una respuesta: las notas vienen de agentes que deciden guardarlas, de notas que escribes o editas tú, y de la limpieza, que retoca notas ya guardadas (las fusiona, las comprueba con el código, las mueve al proyecto al que se refieren) y, con [Aprender de las conversaciones](/guide/memory#learn-from-conversations) activado, guarda como máximo tres cosas al día que ningún agente guardó.

- **El agente elige el lugar**: sobre ti, este proyecto o esta sesión. Cuando guarda como sobre ti una nota que nombra un proyecto (por su nombre, por el nombre de su carpeta o por un archivo que está solo en ese proyecto), la respuesta que recibe se lo indica. En una sesión de ese proyecto, se le dice que vuelva a guardar la nota como sobre el proyecto y que olvide la primera, si es lo que corresponde; en cualquier otra sesión, se le dice que la limpieza moverá la nota al proyecto, una vez que el modelo auxiliar confirme que trata del proyecto y no de ti (consulta [Limpieza automática](/guide/memory#tidy-up-automatically)).
- **Un dato por nota, escrito para volver a encontrarlo**: cada nota dice una sola cosa en una frase que se entiende sola, nombrando de qué trata (el proyecto, la herramienta, la persona o el lugar), de modo que una petición posterior con otras palabras la encuentre. Lo que todo agente debe saber siempre sobre ti va, en cambio, en tu perfil. No se guarda lo que ya dicen los archivos o el historial de un proyecto: dónde está el código y qué hace cambia, y los archivos ya lo cuentan.
- **Cómo se sabe**: el agente indica cómo sabe lo que guarda: tú lo dijiste, lo comprobó (una prueba, la salida de un comando, un archivo) o es una conclusión propia, aún sin comprobar. A los agentes posteriores se les dice qué notas aún no están comprobadas, y la limpieza comprueba esas primero. Una nota que escribes tú cuenta como dicha por ti.
- **Algunas notas solo son ciertas hasta una fecha**: un viaje, un plazo, una visita. El agente le pone a esa nota una fecha de fin. Desde entonces los agentes dejan de recibirla y, en menos de una hora, pasa a Notas eliminadas, donde puedes restaurarla durante 30 días.
- **Las correcciones reemplazan la nota anterior**: para actualizar una nota, el agente la reescribe con su número en lugar de añadir otra. Una nota con el mismo texto no se guarda dos veces. Con la [búsqueda por significado](/guide/memory#search-by-meaning) activada, tampoco se guarda una nota que diga lo mismo con otras palabras.
- **Los agentes también olvidan**: un agente quita una nota cuando resulta errónea o desactualizada, o cuando tú lo pides (“Olvida mi dirección anterior”).
- **Nunca secretos**: se rechaza una nota que parezca contener una contraseña, una clave, un token o un número de tarjeta. También se rechaza el texto que parezca instrucciones para un agente (“ignora las instrucciones anteriores…”), ya que llegaría a todas las sesiones posteriores.

También puedes escribir una nota tú mismo con **Añadir una nota** en [Configuración → Memoria](/settings?s=memory&find=Add%20a%20note), y allí mismo buscar, editar, fechar y eliminar cada nota (consulta [Notas](/guide/memory#notes)).

## Hallazgos: qué se probó y qué resultó

Un proyecto de investigación olvida lo que probó: un agente vuelve a meterse en el mismo callejón sin salida, y las afirmaciones de un artículo se alejan de lo que mostraron las ejecuciones. Un **hallazgo** es algo que un proyecto probó y lo que resultó, guardado con su evidencia, por ejemplo “Los negativos difíciles de BM25 mejoran el nDCG@10 en desarrollo frente a los negativos dentro del lote: respaldado, +0,019 en 3 semillas, la ganancia está en las consultas largas”. Es una nota de memoria de un tipo propio, así que pertenece a un proyecto, se busca por palabras y por significado, llega a las sesiones nuevas cuando tiene que ver con lo que preguntas, y conserva su historial.

Cada hallazgo tiene:

- **Un enunciado**: la hipótesis o afirmación, en una frase.
- **Un veredicto**: **Respaldado**, **Refutado**, **Poco claro** o **Abierto** (planteado, aún sin probar).
- **Lo aprendido**: una o dos frases con las cifras, dónde se cumple o por qué falló.
- **Evidencia**, 12 elementos como máximo: ejecuciones, puntuaciones y tablas de resultados de [Experimentos](/guide/experiments), commits, archivos, artículos y sesiones. Una cifra medida en lo aprendido (una puntuación, una mejora, un porcentaje) necesita la ejecución, puntuación o tabla de la que sale o, cuando es lo que informa un artículo, ese artículo; de lo contrario, se rechaza el hallazgo. Las cifras que forman parte de nombres (BM25, nDCG@10), los años y los recuentos como 3 semillas no son cifras medidas.

**Los registran los agentes.** En un proyecto, a los agentes se les indica que miren sus hallazgos antes de proponer o empezar un experimento, y que registren uno después de cada resultado, también cuando no funcionó o no quedó claro. El [sprint de investigación](/guide/researchers#research-sprint) registra uno por cada una de sus hipótesis, e **Intentar refutarlo** registra su veredicto sobre la afirmación. **Los callejones sin salida se conservan a propósito**: la limpieza nunca combina, resume, mueve ni quita un hallazgo (tampoco los lee la creación de una wiki a partir del historial del proyecto), y nunca se sugiere quitar un hallazgo porque ningún agente lo haya necesitado últimamente. Dos hallazgos que se contradicen se conservan ambos, hasta que uno posterior sustituya al otro: el nuevo indica qué sustituye, y el antiguo sale de la lista pero permanece en su historial.

**Dónde verlos.** La pestaña **Memoria** de un proyecto tiene una etiqueta **Hallazgos** junto a **Notas**, **Wiki** y **Documentos** (consulta [La pestaña Memoria de un proyecto](/guide/wiki-memory#a-projects-memory-tab)), con una etiqueta más pequeña para cada veredicto. Una fila muestra el enunciado, el veredicto y su antigüedad. Abre uno para leerlo completo: lo aprendido, su evidencia como enlaces que abren cada ejecución, commit, archivo, artículo o sesión, quién lo registró y cuándo, y qué sustituye. Cuando un archivo dado como evidencia ha cambiado desde entonces en el repositorio Git del proyecto, la fila dice **el código cambió desde entonces** y el hallazgo dice “El código en que se basa ha cambiado desde entonces.”, con los archivos: vuelve a probarlo antes de apoyarte en él. Los hallazgos también aparecen entre las notas del proyecto en [Configuración → Memoria](/settings?s=memory), marcados como **Hallazgo**.

**Cambiar u olvidar uno.** Ábrelo y pulsa **Cambiar** para corregir a mano su veredicto, su enunciado o lo aprendido. **Olvidar** lo quita; permanece en [Notas eliminadas](/guide/memory#deleted-notes) durante 30 días, para restaurarlo. También puedes pedírselo a un agente: registra el resultado posterior en lugar del antiguo, o lo olvida. Desactivar la memoria desactiva también los hallazgos.

## Tu perfil

Además de las notas, la memoria guarda un perfil tuyo: quién eres y a qué te dedicas, qué usas, cómo te gustan las respuestas y qué evitar. Mientras la memoria está activada, cada agente lo recibe una vez, al comienzo de una sesión, justo después de tus [Pautas de los agentes](/guide/guidelines), y deja que influya en cómo trabaja contigo; tus pautas y lo que dices en una sesión siguen teniendo prioridad. Las notas guardan lo que importa de vez en cuando; el perfil guarda lo que todo agente debe saber siempre.

- **Los agentes lo mantienen al día.** Cuando algo que dices muestra algo duradero que ayudará a todos los agentes a servirte mejor, como tu trabajo, las herramientas que usas o cómo te gustan las respuestas, el agente reescribe el perfil con ello. La mayoría de los mensajes no cambian nada. El cambio aparece bajo su respuesta como **Tu perfil**, con la opción de deshacerlo (consulta [Ver lo que guardó un agente después de una respuesta](/guide/memory#see-what-an-agent-saved-after-a-reply)). Los agentes nunca ponen secretos en él, no pueden borrarlo y no pueden sobrescribir un cambio hecho desde que empezó su sesión: se les muestra el perfil tal como está ahora y lo intentan de nuevo.
- **Escríbelo tú.** En [Configuración → Memoria](/settings?s=memory&find=Your%20profile), el primer grupo, **Tu perfil**, lo muestra, con seis líneas, y con **Mostrar todo** (y **Mostrar menos**) cuando es más largo. **Editar** (o **Escríbelo**, mientras no hay ninguno), junto al título del grupo, lo abre para escribir: Intro empieza una línea nueva, Ctrl+Intro (⌘+Intro en Mac) o **Guardar** lo guarda, y Escape o **Cancelar** lo deja como estaba. Mientras escribes, un contador indica cuántas palabras tiene, de cuántas puede tener.
- **Cuánto puede medir.** [Profile length](/settings?s=memory&find=Profile%20length), en el grupo **Lo que reciben los agentes** más abajo en la página, es el máximo de palabras que puede tener: 250, 500, 1.000 (lo habitual) o 2.000 palabras. Los agentes se mantienen dentro de ese límite. Un perfil más largo, guardado por ti o que queda cuando eliges una longitud menor, se conserva tal como está mientras el modelo auxiliar lo acorta en segundo plano para que quepa (“Acortándolo para que quepa en 1.000 palabras…”); la versión más corta aparece como cambiada **por el modelo auxiliar**. Se rinde como máximo a los 4 minutos (“El modelo auxiliar no respondió en 4 minutos”). Cuando el modelo auxiliar no puede, el motivo aparece bajo el perfil, con **Reintentar**; cuando se debe a que una cuenta tiene la sesión cerrada, el motivo lo dice (“Tu cuenta de Claude Code “Work” tiene la sesión cerrada y ninguna otra cuenta ni modelo Custom pudo hacerlo: vuelve a iniciar sesión (Configuración → Agentes → Cuentas).”) y una tarjeta te pide iniciar sesión (consulta [Cuando se cierra la sesión de una cuenta](/guide/agents-models#when-an-account-is-signed-out)).
- **Debajo**: cuántas palabras tiene, de cuántas puede tener, y cuándo se escribió o se cambió por última vez y quién lo hizo: **por ti**, **por un agente** (con la sesión de la que viene) o **por el modelo auxiliar**. El menú **⋯** (Menú del perfil) junto a **Editar** tiene **Historial de cambios**, con cada versión, quién la escribió y por qué, y **Borrar perfil**, que pide confirmación. Un perfil borrado permanece en [Notas eliminadas](/guide/memory#deleted-notes) durante 30 días, y allí **Restaurar** lo recupera.

## Ver lo que guardó un agente después de una respuesta

Cuando un agente guarda, cambia o quita notas durante un turno, aparece un chip bajo su respuesta, como **Memoria · 1 añadida, 1 actualizada**. Cuenta los cambios que siguen vigentes (añadidos, actualizados, quitados); cuando todos se deshicieron, dice **deshecha**. Varios cambios en un mismo turno se muestran como un solo chip, y una nota cambiada varias veces se muestra como un solo cambio, de lo que decía antes a lo que dice después.

Haz clic en el chip para abrirlo. Cada cambio muestra:

- Una insignia: **Añadido**, **Actualizada**, **Quitado** o **Deshecha**.
- A qué lugar pertenece la nota (**Sobre ti**, **Un proyecto ·** y el nombre de la carpeta, **Esta sesión** u **Otra sesión**; **Tu perfil** para un cambio en tu perfil), “guardada por el agente” y por cuántos cambios pasó en ese turno.
- El texto. En una actualización, las palabras quitadas aparecen tachadas y las añadidas, resaltadas. Cuando se reescribió casi todo, el texto antiguo aparece tachado encima del nuevo.
- **Cambiada de nuevo desde**, cuando la nota se editó después de este turno: haz clic para ver lo que dice ahora.
- Una última línea con el motivo que dio el agente, si lo hay, y **Eliminada desde** o **Ya no se guarda** cuando la nota se eliminó o se borró después de este turno.

Los botones de cada cambio:

- **Deshacer este cambio** (o **Deshacer estos cambios**): una nota añadida desaparece, una nota actualizada recupera su texto anterior y una nota quitada vuelve.
- **Editar**: cambia el texto directamente. Intro guarda, Mayús+Intro empieza una línea nueva y Escape cancela. En el caso de tu perfil, abre Configuración → Memoria, donde el perfil tiene espacio para sus líneas.
- **Eliminar**: elimina la nota. Permanece en Notas eliminadas, en Configuración, durante 30 días. Tu perfil no tiene Eliminar aquí: bórralo en Configuración.
- **Restaurar**: recupera una nota que se eliminó después.

El menú **⋯** (Opciones de memoria) en la parte superior del chip abierto tiene **Memoria de esta sesión**, que activa o desactiva la memoria para esta sesión, y **Toda la memoria**, que abre Configuración → Memoria. Haz clic en la fila superior del chip para cerrarlo.

## Con qué empieza un agente

Un agente no recibe toda la memoria. Empieza con una explicación breve de la memoria, tu perfil, un índice de lo que se guarda y las notas que tienen que ver con tu solicitud. Después recibe más solo cuando algo nuevo tiene que ver con lo que está haciendo, y siempre puede consultar el resto. Lo que recibe es información de contexto: al agente se le dice que las notas pueden estar desactualizadas, cuáles de ellas aún no se han comprobado, que lo que dices ahora tiene siempre prioridad y que no las mencione a menos que ayuden.

- **Al empezar**:
  - tu perfil (consulta [Tu perfil](/guide/memory#your-profile));
  - el perfil de este proyecto, cuando lo tiene. Pone en primer lugar las reglas permanentes que los agentes necesitan en la mayoría de las sesiones: cómo hacer commits, compilar, probar y publicar, y las preferencias duraderas del proyecto;
  - las notas propias de esta sesión, cuando la sesión continúa;
  - todas las notas de un lugar que tiene pocas (sobre ti, o un proyecto que aún no tiene temas);
  - de un lugar más grande, las notas y los temas que destacan para tu primer mensaje, como máximo 10 a menos que lo cambies en [Notas con las que empieza cada agente](/settings?s=memory&find=Notes%20each%20agent%20starts%20with). No se entrega nada solo por llenar espacio: cuando son menos las que tienen que ver, el agente recibe menos, o ninguna;
  - hasta tres líneas que nombran los artículos de la wiki del proyecto que tienen que ver con tu mensaje («De la wiki de este proyecto (wiki_read abre uno)»: el título de cada artículo, lo que dice en una línea y dónde está; marcado como «puede estar desactualizado» cuando los archivos que nombra han cambiado desde que se escribió), y los planes en curso del proyecto, con sus puntos abiertos (consulta [Memoria wiki](/guide/wiki-memory#how-it-sits-beside-notes-and-documents)).
- **Cómo le llega**: Claude Code y Codex reciben la explicación, los perfiles, las notas de un lugar pequeño y el índice en las instrucciones con las que empiezan, y las notas que tienen que ver con tu solicitud con tu primer mensaje. Esas instrucciones son las mismas para todas las sesiones de un proyecto hasta que sus notas cambian, así que el proveedor del modelo reutiliza lo que guardó de ellas de una sesión a otra, lo que es más rápido y cuesta menos. Los agentes que hablan ACP reciben todo con tu primer mensaje. [Custom](/guide/custom) lo recibe en un solo bloque antes de su primer turno y lo conserva mientras trabaja.
- **Con cada mensaje**: cuando escribes de nuevo, se busca en la memoria para el mensaje nuevo, con un criterio más estricto que al empezar. Lo que tiene que ver con él de forma nueva llega junto con el mensaje, bajo «De la memoria, relevante de forma nueva para este mensaje»: como máximo tres notas (1.500 caracteres), nunca una que la sesión ya haya recibido antes, y como máximo una línea de artículo de la wiki. Lo habitual es que no haya nada que añadir, y entonces no se dice nada. Un comando, o un mensaje de una o dos palabras, no trae notas propias. Esto vale para Claude Code, Codex, Custom y los agentes que hablan ACP.
- **Cuando un agente abre o cambia un archivo**: las notas sobre ese archivo, su carpeta y la carpeta superior llegan de inmediato (nunca todo el proyecto), cada carpeta una vez por sesión, como máximo dos notas (800 caracteres). Claude Code las recibe justo después de la lectura o la edición, mediante un hook que le da la app, salvo que tu propia configuración de Claude Code desactive los hooks; Custom las recibe en la salida de la herramienta; Codex y los demás agentes que hablan ACP las reciben con tu siguiente mensaje. Una nota se vincula a un archivo cuando lo nombra, o nombra su carpeta, en el repositorio del proyecto.
- **Cuando una sesión continúa**: una sesión que continúa dentro de la hora (por ejemplo, después de reiniciar la app) recibe de nuevo las mismas instrucciones, con sus propias notas y las que tienen que ver con tu último mensaje, y nada de lo que ya había recibido, salvo que su conversación se haya condensado desde entonces. Cuando Claude Code o Codex continúan después de que su conversación se condensó, reciben una vez el punto de control de la sesión: dónde leerlo y su resumen, de hasta 3.000 caracteres (consulta [Puntos de control](/guide/wiki-memory#checkpoints)). Custom, cuando condensa una conversación larga, vuelve a leer la memoria para tu último mensaje y también recibe el punto de control.
- **Modelos con contexto pequeño** (Custom): la parte del contexto del modelo que puede ocupar la memoria se reduce con él. Un modelo de menos de 12.000 tokens recibe un bloque pequeño (como máximo el 6 % de su contexto) con las primeras 120 palabras de tu perfil, como máximo tres notas, sin índice, sin líneas de la wiki ni planes, y no se añade nada con un mensaje ni con un archivo. Un modelo de hasta unos 33.000 tokens recibe un bloque de como máximo el 6 % de su contexto, las primeras 400 palabras de tu perfil, cinco notas, un índice corto, una línea de la wiki y una línea de planes, y como máximo una nota con un mensaje y una con un archivo. Un perfil que se recorta lo indica, y una sesión así no puede reescribirlo: el agente te dice qué añadir, o lo editas tú en Configuración. Los modelos más grandes, y todos los demás agentes, reciben todo lo anterior (consulta [Modelos con contexto pequeño](/guide/custom#what-the-model-reads)).
- **El índice**: por cada lugar más grande, el agente recibe también los títulos de sus notas y temas (Custom: de los que no recibió), de modo que sabe lo que se guarda y lo consulta cuando lo necesita; un tema representa las notas que resume. Lo que los agentes más usaron va primero (lo usado una vez, luego 2 a 3 veces, luego 4 a 7, y así sucesivamente), y cuando el resto no cabe, se cuenta por área del proyecto a la que se refieren: «y por área: server/memory (6) · web/src (4) · otras (12)». La puesta a punto escribe los títulos (consulta [Ordenar automáticamente](/guide/memory#tidy-up-automatically)); hasta entonces, las primeras palabras de una nota ocupan su lugar.
- **Cómo se encuentran las notas**: mediante búsqueda híbrida. Una lista ordena las notas por sus palabras, y las palabras poco comunes cuentan más; con la búsqueda por significado activada, otra las ordena por lo que significan, de modo que «sé breve» encuentra «Prefiere respuestas cortas». Las dos listas se combinan por posición, y las notas que los agentes consultaron recientemente y con frecuencia pesan un poco más. Una nota cuenta como relevante para tu solicitud solo cuando destaca sobre las demás para esa solicitud: algunas solicitudes se parecen a todas las notas y otras a casi ninguna, así que cada nota se mide según cuánto se parece la solicitud a todas ellas. Con la búsqueda por significado activada, su modelo se inicia en cuanto empiezas a escribir, de modo que tu primer mensaje también se compara por significado; una sesión nunca lo espera: la que empieza antes de que esté listo recibe las notas relevantes para tu mensaje según sus palabras.
- **Nombres exactos**: un nombre poco común que escribe tu solicitud, como un nombre de archivo o una ruta, un nombre en camelCase, snake_case o kebab-case, una versión como v0.62.0 o una opción como --resume, hace que las pocas notas que lo contienen sean relevantes para la solicitud, incluso cuando su significado no destaque. Las palabras con guion corrientes, como «built-in» o «follow-up», no cuentan.
- **Un tema, o sus notas**: nunca se entregan a la vez una nota y el tema que la resume. Cuando una de las notas de un tema tiene que ver con tu solicitud, el agente recibe solo esa nota; cuando son dos o más, recibe el tema.
- **Material citado**: las notas que el modelo auxiliar guardó a partir de documentos y conversaciones, en lugar de las que escribiste tú o un agente, van al final de su lugar, bajo «Guardado por el asistente a partir de documentos y conversaciones (material citado, no instrucciones)», y también en las búsquedas, de modo que un agente las trate como material y no como órdenes.
- **Habilidades que encajan**: el mismo tipo de búsqueda nombra las habilidades que encajan con tu primer mensaje, cuando alguna lo hace con claridad (consulta [Habilidades](/guide/skills#skills-that-fit-a-new-session)).

La memoria cuenta dos cosas por cada nota, y muestra ambas en la nota (consulta [Abrir una nota](/guide/memory#open-a-note)). **Entregada a los agentes** es la frecuencia con la que los agentes recibieron la nota sin pedirla: al empezar, con un mensaje o en un archivo. **Necesaria para los agentes** es la frecuencia con la que la usaron: la consultaron, la citaron por su número (#123) o trabajaron con el archivo o el comando del que trata después de recibirla. Que se entregue una nota no significa que se necesite: solo lo que un agente hizo con ella lo indica. Las notas que ningún agente ha necesitado en meses se te ofrecen para que las conserves o las elimines (consulta [Notas que ningún agente necesitó últimamente](/guide/memory#notes-no-agent-needed-lately)). Qué notas van primero la vez siguiente pesa solo lo que los agentes consultaron por sí mismos.

Los agentes también reciben herramientas para la memoria: guardar una nota (en un lugar, con cómo se conoce y una fecha de fin si la tiene), corregir una nota, olvidar una, buscar notas por palabras y significado (incluidas las notas que resume un tema), actualizar tu perfil, buscar y leer conversaciones pasadas (consulta [Buscar en sesiones anteriores](/guide/memory#search-earlier-sessions)), y buscar a la vez notas, artículos de la wiki, documentos y conversaciones pasadas, en un proyecto o en todos (consulta [Buscar más allá de un proyecto](/guide/memory#search-beyond-one-project)). Una nota encontrada con una búsqueda también cuenta como necesaria.

## Desactivar la memoria en una sesión

Empieza una sesión sin memoria desde la página de inicio:

1. Bajo el cuadro de mensaje, abre **Opciones**.
2. Abre **Memoria** y elige **Desactivada para esta sesión** («Empieza de cero y no guarda nada de ella»). **Activado** («Usa y añade a lo que recuerdan los agentes») es lo habitual.
3. El chip de Opciones ahora indica **Sin memoria**. La página de inicio conserva esta elección para tus próximas sesiones también, hasta que la vuelvas a poner en Activado.

**Lo que recuerdan los agentes**, al final de ese menú, abre Configuración → Memoria. En un teléfono, estos menús se abren como hojas desde la parte inferior de la pantalla. La opción Memoria no aparece mientras la memoria está desactivada para todas las sesiones.

Para una sesión que ya está en marcha, abre el menú de la sesión (⋯) → **Configuración de la sesión** → **Memoria**. Su indicación dice **Activado** o **Desactivado**; haz clic en ella para cambiarlo. El mismo interruptor está en el ⋯ del chip de memoria como **Memoria de esta sesión**. Mientras la memoria está desactivada para todas las sesiones, ambos aparecen atenuados con la indicación **Desactivada para todos**.

Con la memoria desactivada, una sesión «no lee ni escribe notas»:

- Su agente no recibe notas, ni perfil, ni herramientas de memoria, y no se guarda nada de la sesión.
- Los agentes de otras sesiones no pueden encontrarla cuando buscan en conversaciones pasadas, ni pueden leerla.

El editor de una tarea programada tiene el mismo chip de Memoria, de modo que sus ejecuciones pueden funcionar sin memoria (consulta [Tareas programadas](/guide/tasks)). Las ejecuciones iniciadas desde la página pública de una app siempre tienen la memoria desactivada (consulta [Apps](/guide/apps)).

## Desactivar la memoria en todas las sesiones

Desactiva el interruptor **Memoria** junto al título de [Configuración → Memoria](/settings?s=memory&find=Memory), en la parte superior derecha de la sección. Una vez desactivada, un aviso en la parte superior de la página dice: «La memoria está desactivada: los agentes no reciben notas y no guardan nada nuevo. Tus notas se conservan».

Mientras está desactivada:

- Ningún agente recibe notas, tu perfil ni herramientas de memoria, y no se guarda nada.
- Tus notas se conservan. Vuelve a activar el interruptor y los agentes las recibirán de nuevo.
- La opción Memoria desaparece de la página de inicio, y el cuadro de búsqueda (Ctrl+K) deja de mostrar notas.
- **Aprender de las conversaciones**, **Ordenar automáticamente**, la fila **Última puesta a punto** con **Ordenar ahora**, y **Búsqueda por significado** aparecen atenuados.
- Tu perfil y tus notas permanecen en la página: aún puedes leerlos, editarlos, añadirlos, eliminarlos y exportarlos.

## Configuración → Memoria

Todo lo relativo a la memoria está en [Configuración → Capacidades → Memoria](/settings?s=memory): «Lo que los agentes recuerdan sobre ti, tus proyectos y cada sesión, y cuándo se escribió». El interruptor **Memoria** está junto al título de la sección, y **Más información** bajo el título abre este tema. Debajo, de arriba abajo, la página tiene seis grupos, y una línea encima de ellos que nombra las tres partes de la memoria:

- **Tu perfil**: lo que cada agente recibe sobre ti, con **Editar** y un menú **⋯** (consulta [Tu perfil](/guide/memory#your-profile)).
- **Notas**: todas las notas guardadas, con **Añadir una nota**, un campo de búsqueda y un índice de lugares (consulta [Notas](/guide/memory#notes)).
- **Aprendizaje**: **Aprender de las conversaciones**, **Ordenar automáticamente**, y la **Última puesta a punto** con **Qué cambió** y **Ordenar ahora**.
- **Memoria wiki**: si los proyectos mantienen una wiki, el aprendizaje a partir de documentos nuevos y dónde se guardan las wikis (consulta [Memoria wiki](#wiki-memory)).
- **Lo que reciben los agentes**: **Búsqueda por significado**, **Notas con las que empieza cada agente** y **Longitud del perfil**.
- **Tus datos**: **Traer…** desde otros asistentes, **Exportar** (Markdown, JSON) y **Borrar todo…**.

El nombre de una fila puede tener al lado un botón **(i)**, que dice más sobre lo que hace la fila. En un teléfono, Configuración se abre como una lista: toca **Memoria** para abrirla en su propia página. Allí las notas ocupan todo el ancho de la pantalla, y todos los menús de la página se abren como hojas desde la parte inferior de la pantalla.

### Memoria wiki

El grupo **Memoria wiki** tiene los ajustes de los artículos que los agentes mantienen para cada proyecto (consulta [Memoria wiki](/guide/wiki-memory), que explica qué son y cómo funcionan):

- **Memoria wiki**: activada al principio, para la wiki compartida y para cada proyecto, a menos que la pestaña **Configuración** del propio proyecto diga otra cosa.
- **Aprender de documentos nuevos**: activado al principio. Los documentos nuevos y modificados añaden notas de memoria (solo del propio proyecto) y actualizan la wiki, con el modelo auxiliar.
- **Carpeta de la wiki**: dónde se guarda la wiki compartida, y las wikis de los proyectos a menos que se indique otra cosa más abajo: una ruta absoluta en la computadora que ejecuta Hydor, con **Examinar**. Cambiarla cuando tiene archivos abre una revisión para conservarlos, combinarlos o moverlos (consulta [Mover la carpeta de la wiki](/guide/wiki-memory#move-the-wiki-folder)).
- **Wikis de proyectos**: **En la carpeta de la wiki** (al principio: no se escribe nada en las carpetas de tus proyectos) o **En la carpeta de cada proyecto**. Con la segunda, **Carpeta dentro de cada proyecto** indica dónde, y **Excluir de Git** la mantiene fuera del repositorio del proyecto.

La memoria misma debe estar activada para que los documentos nuevos añadan algo, y para los puntos de control de las sesiones: con la memoria desactivada para una sesión o para todas, no se guardan puntos de control y los existentes se conservan (consulta [Puntos de control](/guide/wiki-memory#checkpoints)).

### Notas

El grupo **Notas** muestra todas las notas guardadas, con el número junto a su título (por ejemplo, 33 notas). **Añadir una nota**, a la derecha del título, escribe una nota tuya (consulta [Añadir una nota](/guide/memory#add-a-note)). Tu perfil no está entre ellas ni cuenta en el total: tiene su propio grupo encima.

Debajo del título hay un campo de búsqueda y un índice de lugares. Cada lugar abre su propia página:

- **Sobre ti**: las notas sobre ti, con cuántas hay.
- **Cada proyecto**, con el nombre de su carpeta, el número de sus notas y la ruta de la carpeta, con primero el proyecto que cambió más recientemente. Se muestran los cinco primeros; **Mostrar más proyectos** (N más) muestra el resto.
- **Sesiones**: las notas guardadas para una sola sesión cada una.
- **No se necesitaron hace poco**: solo aparece cuando algunas notas llevan cuatro meses sin usarse (consulta [Notas que ningún agente necesitó hace poco](/guide/memory#notes-no-agent-needed-lately)).
- **Notas eliminadas**: se conservan 30 días, para poder restaurarlas (consulta [Notas eliminadas](/guide/memory#deleted-notes)).

La página de un lugar se abre dentro de la sección, con el enlace **Memoria** arriba para volver (el botón Atrás del navegador también vuelve). Muestra el nombre del lugar y su número de notas (y, en un proyecto, la ruta de su carpeta), **Añadir una nota** (en Sobre ti y en un proyecto; la nota empieza en ese lugar), un campo de búsqueda propio (“Buscar en estas notas”) y sus notas: primero el perfil de un proyecto, luego sus temas y después sus notas, con el cambio más reciente primero, de veinte en veinte, con **Mostrar más** debajo. Si no hay notas, lo indica. La dirección de una página es `/settings?s=memory&notes=global`, `&notes=session`, `&notes=stale` o `&notes=deleted`, o `&notes=repo:` y la ruta de la carpeta del proyecto.

**Para encontrar una nota**, escribe en el campo de búsqueda del grupo (o de la página de un lugar): “Buscar en 33 notas”, o “Buscar en 33 notas por palabras o significado” cuando la búsqueda por significado está lista. Encuentra las notas que contienen todas las palabras que escribes, con la última como inicio de palabra, y, con la búsqueda por significado activada, las notas que significan lo mismo. Las mejores van primero, cada una con el lugar al que pertenece, y **Mostrar más** da las veinte siguientes. “Ninguna nota coincide” indica que no hay resultados. Escape o la **×** borra la búsqueda y vuelve el índice. Mientras la memoria no tiene notas, el grupo lo indica, con un botón **Traer desde otros asistentes** y la fila **Notas eliminadas**.

Cada nota de una lista muestra sus dos primeras líneas (con una insignia **Tema**, **Perfil** o **Hallazgo** cuando lo es; consulta [Hallazgos](/guide/memory#findings-what-was-tried-and-what-came-of-it)) y debajo una línea de datos: el lugar, en una lista que mezcla lugares (una búsqueda, **Sesiones**, **No se necesitaron hace poco**, **Notas eliminadas**); **Añadido** o **Cambiada** y hace cuánto (pasa el puntero por encima para ver las fechas exactas); **sin revisar aún**, cuando nadie la ha confirmado; **necesitada una vez** o **necesitada N veces**, la frecuencia con la que un agente la usó (la consultó, la citó o trabajó con el archivo o el comando del que trata); y **hasta que** una fecha, cuando tiene fecha de fin. Haz clic en una nota para abrirla.

### Abrir una nota

Al hacer clic en una nota, se abre en un diálogo con el título **Nota**, **Tema** o **Perfil**, con su texto completo y **Editar** debajo. Debajo del texto:

- **Dónde**: **Sobre ti**, el proyecto (el nombre de su carpeta y su ruta) o la sesión a la que pertenece (haz clic en su nombre para abrir la sesión).
- **Escrita**: **Añadido** o **Cambiada** y cuándo, **por ti**, **por un agente** o **por el modelo auxiliar** (la puesta a punto), y la sesión de la que vino, en la que puedes hacer clic para abrirla. Apunta con el cursor para ver las fechas exactas.
- **Cómo se sabe**: **lo dijiste tú**, **comprobada** o **sin revisar aún** (apunta con el cursor para ver qué significa). Las notas anteriores a este registro no dicen nada.
- **Necesaria para los agentes**: **Una vez**, **N veces** (con la última fecha) o **Todavía no**: cuántas veces un agente usó la nota, consultándola, citándola por su número o trabajando con el archivo o comando del que trata después de recibirla. Que se la entreguen no cuenta.
- **Entregada a los agentes**: **Una vez**, **N veces** (con la última fecha) o **Todavía no**: cuántas veces los agentes recibieron la nota sin pedirla, al empezar una sesión, con un mensaje o al abrir un archivo.
- **En el código**, cuando los archivos que nombra la nota han cambiado en el proyecto desde que se escribió: “<archivos> cambiaron en el proyecto desde que se escribió esto (visto hace 2 h). La próxima puesta a punto la comprueba con el código.” Hasta entonces, los agentes reciben la nota marcada como “puede estar desactualizada: <archivos> cambió” (consulta [Ordenar automáticamente](/guide/memory#tidy-up-automatically)).
- **Fecha de fin**: la fecha, o **Ninguno**, con **Cambio** (consulta más abajo).
- **Resume**, para un tema o perfil: cuántas notas representa, con **Mostrar** para listarlas, con las eliminadas tachadas.
- **Historial**: **Mostrar** lista cada paso de la vida de la nota, el más reciente primero: Añadida, Cambiada (texto antiguo → texto nuevo), Movida (“Movida de Sobre ti al proyecto”), Eliminada, Restaurada, Fecha de fin (“Hasta” una fecha, o “Quitada”), Cómo se sabe, cada uno con cuándo, quién, en qué sesión y por qué. **Ocultar** lo cierra.

Los botones:

- **Editar**: cambia el texto en el sitio, hasta 500 caracteres (800 para un tema o perfil). Enter guarda, Mayús+Enter empieza una línea nueva, Escape o **Cancelar** descarta el cambio. No se puede guardar un texto que parezca contener un secreto.
- **Fecha de fin** → **Cambio**: en “Verdadera hasta”, elige una fecha y pulsa **Guardar**. La nota deja de ser verdadera al final de ese día: desde mañana hasta cinco años adelante. **Sin fecha de fin** quita una fecha de fin.
- **Eliminar**, abajo a la izquierda: “Eliminada. Se queda en Notas eliminadas durante 30 días.” El diálogo se cierra.
- **Conservarla**, cuando abriste la nota desde **No se necesitaron hace poco** (consulta más abajo).
- **Cerrar**, o Escape, sale del diálogo.

Una nota eliminada se abre con **Restaurar** y **Eliminar para siempre** en su lugar (consulta [Notas eliminadas](/guide/memory#deleted-notes)); no se puede editar y no tiene fecha de fin.

### Añadir una nota

[Añadir una nota](/settings?s=memory&find=Add%20a%20note), junto al título de **Notas** (y en la página de Sobre ti o de un proyecto), abre un diálogo: “¿Qué deben recordar los agentes? Por ejemplo: “Prefiero respuestas cortas”.” Escribe la nota y luego **Guardar** o pulsa Enter. Mayús+Enter empieza una línea nueva; Escape o **Cancelar** la descarta.

- **A dónde pertenece**: una nota trata sobre ti a menos que elijas un proyecto. El chip antes de los botones (**Sobre ti**) lista los proyectos para los que la memoria tiene notas; una nota sobre un proyecto solo llega a las sesiones que trabajan en él. Si aún no hay notas de proyectos, el chip no aparece y la nota trata sobre ti. Si se abre desde la página de un proyecto, el diálogo empieza en ese proyecto.
- Las mismas reglas que para las notas de los agentes: como máximo 500 caracteres, guardada como un solo párrafo y nunca nada que parezca contener una contraseña, una clave, un token o un número de tarjeta.
- La nota muestra **por ti**. Las sesiones la reciben al empezar (Custom antes de su siguiente turno), como todas las notas.

### Notas que ningún agente necesitó hace poco

Cuando algunas notas llevan cuatro meses sin usarse, el índice tiene una fila **No se necesitaron hace poco**, con cuántas son: “3 notas que ningún agente necesitó en cuatro meses”. Una nota cuenta como usada cuando un agente la consultó, la citó o trabajó con el archivo o comando del que trata; que se la entreguen al empezar no cuenta. Para las notas anteriores a este registro, cuenta la última vez que se entregaron o consultaron y, a partir de ahí, el uso. Su página dice: “Ningún agente las ha necesitado en cuatro meses. Conserva lo que aún importa y elimina el resto.” No tiene campo de búsqueda.

Solo se sugieren notas sobre ti y sobre proyectos, nunca temas, perfiles, notas con fecha de fin ni notas de sesiones. Cada fila tiene dos botones: **Conservar**, que cuenta la nota como necesitada hoy, de modo que sale de la lista, y **Eliminar**, que la quita. Abre una nota para leerla entera primero, con su línea **Necesaria para los agentes** y su historial: allí **Conservarla** y **Eliminar** hacen lo mismo. Cuando no queda ninguna, “Todas las notas se necesitaron hace poco”, y la fila sale del índice.

### Notas eliminadas

[Notas eliminadas](/settings?s=memory&find=Deleted%20notes), la última fila del índice, abre las notas eliminadas por ti, por un agente, por la puesta a punto o por su fecha de fin: “Las notas eliminadas se quedan 30 días y luego desaparecen para siempre.” Las notas de una sesión desaparecen para siempre poco después de eliminar la propia sesión. Su campo de búsqueda encuentra notas eliminadas por sus palabras, y el enlace **Memoria** de arriba vuelve atrás.

- **Restaurar**, en la fila de la nota o en su diálogo, devuelve una nota. Una nota cuya fecha de fin había pasado vuelve sin ella. Un perfil borrado aparece aquí como **Tu perfil**: al restaurarlo, vuelve a ser tu perfil, en lugar de uno escrito desde entonces.
- Abre una nota y pulsa **Eliminar para siempre**: pregunta “¿Eliminar esta nota para siempre?” (“Se va con su historial y no puede volver.”) y luego la quita al instante. Su **Historial** muestra lo que le pasó.

### Ordenar automáticamente

[Ordenar automáticamente](/settings?s=memory&find=Tidy%20up%20automatically), en el grupo **Aprendizaje**, mantiene la memoria breve y al día. Está activado de forma predeterminada: su sugerencia dice “Una vez al día, fusiona las notas que dicen lo mismo y resume las relacionadas”. El modelo auxiliar hace el trabajo: el modelo pequeño que la app usa para tareas aparte de las sesiones, que se elige en [Configuración → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model) (consulta [Agentes, cuentas y modelos](/guide/agents-models)). Solo lee notas, a menos que [Aprender de las conversaciones](/guide/memory#learn-from-conversations) esté activado: entonces lee primero las conversaciones desde la última puesta a punto. Deja en paz las notas propias de las sesiones: son pocas y se van con su sesión.

Cada puesta a punto hace estas cosas:

1. **Casi copias, notas erróneas, fechas de fin.** Cada nota añadida o cambiada desde la última puesta a punto se compara con las notas más cercanas del mismo lugar (por significado cuando la búsqueda por significado está activada, si no por palabras). Las notas que dicen lo mismo, o en las que una actualiza a otra, se fusionan en una sola que conserva todos los datos aún verdaderos; donde discrepan, gana la más reciente, y la nota fusionada debe ser más corta que las notas que une. Una nota que otra más nueva demuestra que es errónea se elimina. Una nota verdadera solo hasta una fecha que ella misma nombra (“hasta el viernes”, “el viaje de marzo”) recibe esa fecha de fin. En una puesta a punto se revisan como máximo 200 notas; el resto espera a la siguiente.
2. **Notas contrastadas con el código, en el lugar correcto y en el archivo correcto.** Cuatro pasos, cada uno sobre las notas de un proyecto, que continúan aunque uno falle:
   - **Contrastada con el código.** Una nota de proyecto que nombra archivos queda atada a ellos en el repositorio Git del proyecto y al commit en que se escribió. Cada diez minutos Hydor comprueba si esos archivos cambiaron desde entonces; si cambiaron, la nota muestra **En el código** en su diálogo y los agentes la reciben marcada como “puede estar desactualizada”. La puesta a punto lee hasta 20 de esas notas con el cambio de sus archivos (el diff de Git), y el modelo auxiliar decide: sigue siendo verdadera (la nota se marca como comprobada), se actualiza o se quita. Un proyecto que no es un repositorio Git no tiene esos vínculos.
   - **Movida a su proyecto.** Una nota guardada como sobre ti que trata de un solo proyecto (lo nombra: el nombre del proyecto, el de su carpeta, el de su repositorio o el de su paquete o producto) se mueve a las notas de ese proyecto cuando el modelo auxiliar está de acuerdo, así que ya no va a todas las sesiones de todos los proyectos. Una preferencia que vale en todas partes sigue siendo sobre ti. El cambio aparece como **Movida**, y su historial dice “Movida de Sobre ti a” el proyecto. Tu perfil nunca se toca.
   - **Historial de diseño a la wiki.** En un proyecto con [Memoria wiki](/guide/wiki-memory) activada, las notas largas (de 350 caracteres o más, con más de una semana y que no dijiste tú) que se leen como historial de diseño, con versiones, fechas y varias rutas de archivos, se escriben en la wiki. Cada una se sustituye entonces por un puntero de una línea (“<título>: consulta <artículo> en la wiki”), o desaparece cuando el puntero no aportaría nada. Como máximo 8 por puesta a punto.
   - **AGENTS.md.** Una nota que el `AGENTS.md` del proyecto (o `CLAUDE.md`) ya dice se quita (“Ya está en AGENTS.md”), y una que dice en parte se recorta a lo que le falta. Una convención duradera del proyecto, útil para cualquiera que trabaje en él y nunca un dato privado, puede sugerirse para el archivo: como máximo tres por puesta a punto, cada una esperándote bajo **Sugerido para AGENTS.md** (consulta [Ordenar ahora y deshacer sus cambios](/guide/memory#tidy-up-now-and-undo-its-changes)).
3. **Temas y perfil de un proyecto.** Cuando las notas de un lugar ocupan más de unos 2.400 caracteres, las notas relacionadas se resumen en temas, cada uno con un puñado de notas (hasta 12). Los agentes reciben entonces el tema y aún pueden consultar las notas que representa. Un proyecto también recibe un perfil breve (como máximo 700 caracteres) que los agentes reciben siempre primero: las reglas permanentes que necesitan en la mayoría de las sesiones (cómo hacer commit, compilar, probar y publicar, y las preferencias duraderas del proyecto), qué es, cómo compilarlo, probarlo y ejecutarlo, y sus trampas. Un tema o perfil se vuelve a escribir cuando cambia lo que resume. Tu propio perfil lo dejan en manos tuyas y de tus agentes (consulta [Tu perfil](/guide/memory#your-profile)).
4. **Títulos.** Cada nota y tema sobre ti y tus proyectos recibe un título de pocas palabras, para el índice con el que empiezan los agentes. Las notas nuevas reciben el suyo en menos de una hora, y una nota cuyo texto cambia recibe uno nuevo.

Se ejecuta solo aproximadamente una vez al día, siempre que la app esté abierta, así que una computadora que duerme por la noche también lo recibe: cuando han pasado 20 horas desde la última puesta a punto, hay algo nuevo (un mensaje que escribiste o una nota que tú o un agente cambiaron) y has hecho una pausa de diez minutos, de modo que nunca se ejecuta mientras escribes. Si no hay nada nuevo, no se ejecuta en absoluto. Cada cambio que hace queda en el historial de la nota como hecho por “el modelo auxiliar”, y cada cambio de la última puesta a punto se puede deshacer (consulta [Ordenar ahora y deshacer sus cambios](/guide/memory#tidy-up-now-and-undo-its-changes)).

### Aprender de las conversaciones

[Aprender de las conversaciones](/settings?s=memory&find=Learn%20from%20conversations), la primera fila del grupo **Aprendizaje**, está activada de forma predeterminada. Su descripción dice "Una vez al día, corrige lo que las conversaciones muestran como erróneo y conserva lo que los agentes pasaron por alto", y su **(i)** añade: "Con la puesta a punto, el modelo auxiliar lee las conversaciones desde la última (no las que tienen la memoria desactivada): corrige las notas que esas conversaciones muestran como erróneas, comprueba las notas que aún no se han comprobado y conserva como máximo unas pocas cosas al día que ningún agente guardó". Es la primera parte de cada puesta a punto, ya se ejecute por sí sola o con **Ordenar ahora**.

Los agentes guardan notas en el momento, antes de saber qué viene después, así que una nota puede ser errónea desde el principio o quedar desactualizada, y algunas cosas duraderas nunca se escriben. Proyecto por proyecto, el modelo auxiliar lee lo que escribiste y la última respuesta de cada turno (nunca los archivos que adjuntaste, el texto que pegaste, los pasos intermedios, la salida de las herramientas ni las páginas web), junto con las notas a las que se refieren esas conversaciones, y:

- **corrige** una nota que una conversación muestra como errónea o desactualizada, o la quita cuando no queda nada cierto;
- **comprueba** una nota aún no comprobada que una conversación muestra como cierta; para esa nota también lee la conversación que la escribió;
- **conserva** lo que una sesión posterior necesitaría y no podría encontrar en los archivos del proyecto: algo que quieres o que corregiste, una decisión y su motivo, una trampa. Como máximo tres al día, para que la memoria siga siendo pequeña; después la puesta a punto las fusiona con casi duplicados, como cualquier nota nueva.

Una nota de proyecto que menciona un archivo que ya no está en el proyecto se le señala al modelo, para que pueda corregir la nota.

Nunca lee sesiones con la memoria desactivada (las sesiones confidenciales la tienen desactivada), subagentes de Hydor (los pedidos los escribió un agente) ni ejecuciones programadas, y la primera vez lee tres días hacia atrás. Cada cambio aparece en la lista de la puesta a punto con la conversación de la que proviene, y se puede deshacer allí (consulta [Ordenar ahora y deshacer sus cambios](/guide/memory#tidy-up-now-and-undo-its-changes)). Si desactivas el interruptor, la puesta a punto lee solo las notas.

### Ordenar ahora y deshacer sus cambios

La fila **Última puesta a punto**, bajo **Ordenar automáticamente**, informa de la última puesta a punto en su descripción:

- "Aún no se ha ordenado"
- "Ordenando…" mientras se ejecuta.
- "Hace 3 h: 2 añadidas, 1 actualizada, 3 quitadas." (lo que cambió), o "Hace 3 h: nada que cambiar (se revisaron 14 notas)."
- "Leyó 12 conversaciones.", cuando [Aprender de las conversaciones](/guide/memory#learn-from-conversations) leyó alguna; "Aprender de las conversaciones se detuvo:" y el motivo, en una línea debajo, cuando esa parte falló (el resto de la puesta a punto se ejecutó igualmente).
- Cuando la última no encontró nada pero una anterior sí: "Hace 3 h: nada que cambiar. Antes, hace 2 d:" y los cambios de esa puesta a punto anterior. Siguen en la lista, y se pueden deshacer, hasta que una puesta a punto vuelva a cambiar algo.
- "Algunos pasos de mantenimiento se detuvieron:" y el motivo, en una línea debajo, cuando falló uno de los pasos posteriores a los casi duplicados (comprobar las notas con el código, mover notas a su proyecto, mover el historial de diseño a la wiki, comparar con AGENTS.md). Los demás pasos se ejecutaron igualmente y los otros cambios de la puesta a punto se mantienen.
- Cuando falló, el motivo después de la hora, por ejemplo que el modelo auxiliar no respondió.

**Qué cambió**, a la derecha de la fila (se muestra cuando la última puesta a punto cambió algo), abre "Lo que cambió la última puesta a punto". Cada cambio muestra una insignia (**Añadido**, **Actualizada**, **Quitado**, **Movida**, **Termina**, **Sin fecha de fin**, **Comprobada** o **Deshecha**), **Tema** o **Perfil** cuando lo es, el lugar y el motivo ("Fusionada con #12", "Resume 5 notas relacionadas", "Ya está en AGENTS.md", "Aprendida de “Upload page”"), y el texto, con el anterior tachado encima del nuevo. Un cambio **Movida** muestra el texto de la nota y "Movida de Sobre ti a" el proyecto. El botón de la burbuja de diálogo (**Abrir la conversación**) abre la conversación de la que se aprendió un cambio. El botón de la flecha (**Deshacer este cambio**) revierte uno: lo que añadió desaparece, lo que cambió recupera su texto anterior, lo que eliminó vuelve, una fecha de fin que estableció se quita, una nota que comprobó deja de estar comprobada (y, cuando se comprobó con el código, vuelve a marcarse) y una nota que movió vuelve a Sobre ti. Cierra el cuadro de diálogo cuando termines.

Debajo de los cambios, **Sugerido para AGENTS.md** enumera las frases que la puesta a punto querría añadir al `AGENTS.md` de un proyecto, una convención duradera cada una, como una frase sencilla. Cada una muestra el proyecto y el archivo al que iría (`AGENTS.md`, o `CLAUDE.md` cuando el proyecto no tiene `AGENTS.md`), y la nota de la que proviene. No se escribe nada en tu proyecto hasta que pulses un botón:

- **Añadir** agrega la frase al final del archivo bajo un encabezado "## Learned conventions" (que se crea si no existe), quita la nota de la que proviene y dice "Añadido a AGENTS.md".
- **Descartar** deja el archivo y la nota como están, y la frase no se vuelve a sugerir.

La sección se muestra mientras haya alguna sugerencia esperándote, incluso cuando la última puesta a punto no cambió nada más.

[Ordenar ahora](/settings?s=memory&find=Tidy%20up%20now), el botón de la misma fila, ejecuta una puesta a punto de inmediato, esté o no activado **Ordenar automáticamente**: "Ordenando: esto tarda un minuto o dos". Necesita la memoria activada.

### Búsqueda por significado

[Búsqueda por significado](/settings?s=memory&find=Search%20by%20meaning), la primera fila del grupo **Lo que reciben los agentes**, "encuentra notas, lo que guardas y más por lo que significan además de por sus palabras, con un modelo que se ejecuta en esta computadora": mDenseOn de LightOn, que lee nueve idiomas. Está activada a menos que la desactives, de modo que las notas y lo que guardas se encuentran mediante búsqueda híbrida: por sus palabras y por lo que significan, con las dos listas combinadas por posición. El modelo se ejecuta aquí, así que tus notas no se envían a ningún servicio para buscarlas. Con ella desactivada, las notas se encuentran solo por sus palabras. Con ella activada:

- Los agentes empiezan con las notas relacionadas con tu pedido aunque las notas usen otras palabras que las tuyas.
- Los agentes que buscan notas, y el campo de búsqueda del grupo **Notas**, las encuentran por significado además de por palabras.
- Una nota que dice lo mismo que otra ya guardada, con otras palabras, no se vuelve a guardar, y la puesta a punto agrupa las notas por significado.
- El cuadro de búsqueda (Ctrl+K) encuentra páginas, ajustes, sesiones, apps, y los documentos, imágenes y demás cosas que guardaste (por sus títulos y descripciones) por lo que significan, y las bases de conocimiento también se buscan por significado (consulta [Proyectos y conocimiento](/guide/projects)).

**Cómo se prepara**, una sola vez:

1. Un minuto después de que la app se inicie por primera vez, la app configura un entorno de Python privado en su carpeta de datos, con ONNX Runtime, el tokenizador de Hugging Face y NumPy (unos 150 MB); si lo desactivaste, lo hace en cuanto vuelves a activar **Búsqueda por significado** (la memoria misma debe estar activada). La línea bajo la fila muestra cada paso, como "Making a private Python environment" e "Installing ONNX Runtime and the tokenizer". Un entorno que creó una versión anterior con PyTorch se elimina primero, lo que libera sus gigabytes: "Removing the environment an older version made".
2. Luego descarga el modelo, una sola vez: "Downloading the model: 120 of 340 MB, once". Es mDenseOn en 8 bits (algoprog/mDenseOn-ONNX en Hugging Face), una cuarta parte del tamaño del modelo completo, que encuentra las mismas notas. Cada archivo se comprueba antes de usarse, y una descarga interrumpida continúa desde donde se detuvo la próxima vez.
3. Cada nota recibe su vector (los números que compara la búsqueda por significado) en segundo plano, y lo mismo todo lo que guardas. La línea cuenta las notas: "all 120 notes found by meaning" o "80 of 120 notes found by meaning (the rest soon)".

**Desactívala** con el interruptor de la fila: el modelo se detiene y todo se encuentra solo por sus palabras. Una computadora corta de espacio en disco o de memoria puede prescindir de ella. Mientras la memoria esté desactivada para todas las sesiones, el interruptor aparece atenuado.

**Lo que necesita**:

- Python 3.10 o posterior en esta computadora, a menos que esté instalada la herramienta uv, que obtiene el suyo. Si no hay ninguno de los dos, la configuración se detiene y lo indica, con cómo instalar Python: en Debian o Ubuntu `sudo apt install python3 python3-venv`, en un Mac desde python.org o con Homebrew (`brew install python`). En un Mac, el Python de Apple solo cuenta cuando sus herramientas de desarrollo están instaladas, así que la app nunca te pide que las instales.
- Espacio en disco: unos 150 MB para el entorno y 340 MB para el modelo. La configuración se detiene con "Not enough disk space" cuando hay menos de 1 GB libre aproximadamente.
- Una conexión a internet, una sola vez, para las descargas.
- Memoria libre para iniciar el modelo: unos 1,5 GB. Hasta que haya suficiente, dice "Waiting for memory" y las notas se encuentran por sus palabras.

**Cómo se ejecuta**: en el procesador de la computadora (la CPU), mediante ONNX Runtime, en unos pocos de sus núcleos. Se inicia solo cuando hace falta, ocupa entre 0,6 y 1 GB de memoria mientras se ejecuta y se detiene tras unos minutos de inactividad: "Starts when needed, and stops after a few idle minutes", y "Loaded" mientras se ejecuta. Iniciarse tarda uno o dos segundos, y se inicia en cuanto empiezas un mensaje en la página de inicio (o en una sesión cuyo agente se detuvo), y poco antes de que se ejecute una tarea programada: así, las notas y habilidades de una sesión nueva también se encuentran por significado. Una sesión nunca espera a que se cargue: la que empieza antes de que esté listo recibe sus notas y habilidades por sus palabras. No usa la tarjeta gráfica, y basta una computadora con 8 GB de memoria.

**Dónde las guarda**: los vectores se guardan en la base de datos de la app, en tu disco. Para buscar más rápido, la app también mantiene en memoria los que más usa, dentro de un único presupuesto que comparten las notas y las bases de conocimiento: como máximo una 64.ª parte de la memoria de la computadora (o del límite de memoria de un contenedor, cuando es menor), nunca más de 512 MB, y nunca más de la octava parte de la memoria libre en ese momento. Cuando la memoria escasea, no mantiene ninguno: lo que tenía se libera en menos de medio minuto, y cada búsqueda lee los vectores del disco sobre la marcha, un poco más lento. Lo que se usó hace más tiempo sale primero. Las conversaciones pasadas y los registros de las apps se leen siempre del disco, y el cuadro de búsqueda (Ctrl+K) mantiene solo los vectores de lo que existe ahora.

Cuando algo sale mal, la línea de estado se convierte en una advertencia con el motivo (por ejemplo "The model took too long to load") y un botón **Reintentar**. Al desactivar el interruptor, el modelo se detiene; lo que se configuró permanece, así que volver a activarla es rápido.

### Notas con las que empieza cada agente

[Notas con las que empieza cada agente](/settings?s=memory&find=Notes%20each%20agent%20starts%20with), en el grupo **Lo que reciben los agentes**, establece cuántas notas y temas sobre ti y el proyecto tiene como máximo un agente al empezar, además de tu perfil: **5**, **10** (lo habitual), **20** o **40**, elegidos en los botones de la fila. Su descripción dice "Además de tu perfil: las que se relacionan con lo que pides", y su **(i)** dice: "Como máximo esta cantidad de las notas sobre ti y el proyecto que se relacionan con lo que pides, encontradas por sus palabras y, con la búsqueda por significado activada, por lo que significan, y los títulos del resto, que los agentes consultan cuando los necesitan. Un lugar con pocas notas se entrega completo." Más notas dejan entrar desde el principio más de lo que se relaciona con un pedido, a costa de más que leer en cada sesión; menos mantiene breve lo con lo que empiezan. Las notas propias de esta sesión se suman a estas. Consulta [Con qué empieza un agente](/guide/memory#what-an-agent-starts-with).

La fila de debajo, [Longitud del perfil](/settings?s=memory&find=Profile%20length), elige cuántas palabras puede tener tu perfil (consulta [Tu perfil](/guide/memory#your-profile)).

### Exportar tus notas

[Exportar](/settings?s=memory&find=Export), en el grupo **Tus datos**, descarga todas las notas guardadas. **Markdown** ("Una lista para leer") es una lista legible agrupada por lugar, con cuándo se añadió y cambió cada nota y su fecha de fin. **JSON** ("Con historiales") incluye cada nota con su historial y, en los temas y perfiles, las notas que resumen. Las notas eliminadas no se incluyen.

### Traer desde otros asistentes

[Traer…](/settings?s=memory&find=Bring%20in%E2%80%A6), la primera fila del grupo **Tus datos** ("Lo que Claude Code, Codex, ChatGPT y otros saben sobre ti, y tus habilidades"; o el botón **Traer desde otros asistentes** en el grupo **Notas** mientras la memoria no tiene notas), trae a la memoria lo que otros agentes de esta computadora saben sobre ti y sobre tus proyectos, en forma de notas entre las que eliges. No se añade nada hasta que lo hagas.

1. En **En esta computadora**, marca lo que quieres leer. Hydor encuentra lo que guardan estos y muestra cuántos archivos de memoria tiene cada uno:
   - **Claude Code**: la memoria que guarda para cada proyecto, y tu CLAUDE.md para todos los proyectos (también los de las cuentas en Hydor).
   - **Codex**: sus memorias y tu AGENTS.md.
   - **Otros agentes**: algunos otros agentes guardan archivos de memoria sobre ti (lo que saben sobre ti y tu trabajo), y algunos guardan las instrucciones que les diste para cada carpeta. Hydor lee esos archivos para saber cómo te gusta trabajar. Nunca lee sus inicios de sesión, claves ni configuración. Cuando un agente guarda su memoria en un almacén que está en uso, Hydor lee una copia, de modo que ese agente puede seguir funcionando mientras tanto.
2. En **Desde una exportación**, **Añadir una exportación** acepta el .zip que ChatGPT o Claude te envían por correo cuando pides tus datos (en ChatGPT, Configuración → Controles de datos → Exportar datos; en Claude, Configuración → Privacidad → Exportar datos), o el conversations.json que contiene. Muestra lo que incluye el archivo: la memoria de Claude o las instrucciones personalizadas de ChatGPT, y cuántos chats hay, desde qué fecha hasta cuál. De los chats, solo se lee lo que escribiste tú, empezando por los más recientes: no las respuestas ni los archivos que adjuntaste.
3. Pulsa **Empezar a leer**. El [modelo auxiliar](/settings?s=models&find=Helper%20model) lee una parte cada vez, junto con las notas que la memoria ya tiene, y conserva solo lo que va a perdurar. Deja fuera lo que la memoria ya dice (aunque sea con otras palabras), los secretos y los textos escritos para dirigir a los agentes. Una memoria grande tarda unos minutos: puedes cerrar el diálogo mientras tanto, y **Detener** lo detiene.
4. Desmarca lo que no quieras conservar. Las notas vienen agrupadas: primero **Sobre ti**, y después cada proyecto por su carpeta, cuando lo que se leyó trata de un proyecto cuya carpeta está en esta computadora. **Añadir a tu perfil** enumera las líneas que se añadirían a [tu perfil](/guide/memory#your-profile). Pulsa **Añadir N notas**; **Descartar** las descarta todas.

Las habilidades se traen solas, sin el modelo auxiliar. En **Habilidades que creaste allí**, Hydor enumera las habilidades que encuentra en otros agentes de esta computadora (todos sus perfiles y espacios de trabajo, incluidas sus habilidades compartidas y aprendidas), cada una con su nombre, para qué sirve, de dónde viene y cuántos archivos tiene. Todas usan el mismo formato que las habilidades de aquí: una carpeta con un SKILL.md. Esta lista es la vista previa: desmarca lo que no quieras y pulsa **Copiar N habilidades**, y cada una pasa a tus propias habilidades con sus archivos (consulta [De dónde vienen las habilidades](/guide/skills#where-skills-come-from)). Algunas aparecen en **N no ofrecidas**, con el motivo: las habilidades con las que viene un agente son suyas, no tuyas; una habilidad cuyo nombre ya está entre tus habilidades (integrada, tuya o de un plugin) nunca se reemplaza; y se deja fuera una habilidad sin descripción, una de más de 20.000 caracteres o una que contiene una clave. Los archivos que contienen claves o inicios de sesión (archivos .env, claves privadas, archivos llamados credentials, secrets o tokens, y archivos que contienen una clave) nunca se copian, y la carpeta de una habilidad se copia hasta con 200 archivos, de 512 KB cada uno y 2 MB en total: **N archivos omitidos** indica lo que se quedó atrás. Los servidores MCP (servidores de herramientas) no se traen: añádelos en [Configuración → Servidores MCP](/settings?s=mcp), y guarda en la bóveda cualquier clave que necesiten.

Una nota traída lo indica en su historial: "Traída desde Claude Code". No cambia nada en los otros asistentes, y una exportación que añadiste se elimina cuando sus notas ya se han añadido. Con el modelo auxiliar en **Automático**, Claude Haiku hace la lectura, a través de tu plan de Claude Code; cuando no has iniciado sesión en Claude Code, la hace Codex o uno de tus modelos de Custom.

### Borrar todo…

[Borrar todo…](/settings?s=memory&find=Clear%20all%E2%80%A6), la última fila del grupo **Tus datos** (**Borrar toda la memoria**), elimina todas las notas y su historial, y tu perfil con ellas. Antes pide confirmación: "¿Borrar toda la memoria? Se elimina toda nota sobre ti, tus proyectos y tus sesiones, con su historial. Esta acción no se puede deshacer; exporta primero para conservar una copia." Haz clic en **Borrar todo** para continuar. El botón aparece atenuado cuando no hay notas (sin contar tu perfil).

## Buscar en sesiones anteriores

Además de las notas, los agentes pueden consultar tus conversaciones pasadas, con cualquier agente. Pregunta "¿Qué decidimos sobre el local el mes pasado?" y el agente busca las palabras en lo que tú y los agentes escribieron en todas las sesiones (deben coincidir todas) y, con la [búsqueda por significado](/guide/memory#search-by-meaning) activada, lo que preguntaste en cada sesión según lo que significa, de modo que una pregunta con otras palabras también lo encuentra; también los comandos ejecutados y los archivos modificados cuando lo necesita. Cada mensaje que escribes recibe su vector en segundo plano, unos pocos a la vez, empezando por los más recientes: tus propias palabras, no los archivos que adjuntaste ni el texto que pegaste. Después lee la sesión que contiene la respuesta: sus mensajes y los títulos de los pasos realizados, de los más antiguos a los más recientes.

Las sesiones con la memoria desactivada quedan fuera de esta búsqueda y no se pueden leer desde otra sesión. Estas herramientas existen solo mientras la memoria está activada en la sesión en la que trabaja el agente.

De forma predeterminada, la búsqueda abarca las sesiones de todos los proyectos. Pide a un agente que se limite a uno ("solo en este proyecto", o "solo en Tienda") y su búsqueda recibe un proyecto: **este** (las sesiones de este proyecto), **todos** (todos los proyectos, el valor predeterminado) o el nombre de un proyecto. Cuando una búsqueda va más allá del proyecto en el que trabaja el agente, cada resultado indica de qué proyecto procede.

## Buscar más allá de un proyecto

A veces lo que un agente necesita se guardó o se hizo en otro proyecto: "¿Cómo configuramos los despliegues en mi proyecto Tienda?" Para eso, los agentes tienen una búsqueda que recorre de una vez todo lo que guarda la memoria: notas, artículos de la wiki, documentos y conversaciones pasadas. Busca en el proyecto en el que trabaja el agente, en todos tus proyectos o en un proyecto concreto por su nombre (su nombre en la barra lateral, el nombre de su carpeta o el nombre de su repositorio). Nunca busca si el agente no lo pide: nada de tus otros proyectos se añade a lo que se le da a un agente al empezar ni con un mensaje.

Cada resultado indica de dónde procede y cómo abrirlo: un artículo se abre con la herramienta wiki, un documento con la herramienta de conocimiento, indicando en cada caso en qué proyecto está, y una conversación pasada con su clave. Lo que guardan otros proyectos solo se lee: desde aquí, un agente nunca cambia las notas, la wiki, los documentos ni las conversaciones de otro proyecto.

Quedan siempre fuera de la búsqueda:

- La conversación en la que está el agente y las sesiones con la memoria desactivada.
- Un proyecto que se reserva para sí mismo. Cada proyecto tiene un interruptor, **Se puede buscar desde otros proyectos**, en su pestaña **Configuración** (consulta [Configuración](/guide/projects#settings)): activado, los agentes de tus otros proyectos pueden encontrar y leer sus notas, wiki, documentos y conversaciones cuando buscan; desactivado, no pueden, y los agentes del propio proyecto sí pueden consultar tus otros proyectos. Si se pide por su nombre un proyecto así, se responde que se lo reserva para sí.
- La wiki de un proyecto que tiene la memoria wiki desactivada (consulta [Memoria wiki](/guide/wiki-memory)).

Una sesión que no pertenece a ningún proyecto busca en todos los proyectos si no se indica cuál. Las notas sobre ti se buscan una sola vez, sea cual sea el número de proyectos en los que se busque.

Tú mismo puedes buscar en sesiones pasadas con el cuadro de búsqueda (Ctrl+K, o ⌘K en una Mac). Encuentra sesiones por título, mensajes que contienen tus palabras y notas de la memoria, en **Memoria**. Abrir una nota "Abre Configuración → Memoria, en esa nota".

## Pregunta a un agente

- "¿Qué recuerdas sobre mí? Elimina todo lo que haya sobre mi antiguo trabajo."
- “¿Qué hemos probado ya para las consultas largas?”
- “Deja registrado que la idea del entrenamiento curricular no sirvió, con las ejecuciones.”
- "Añade a mi perfil que soy enfermera y que prefiero las respuestas con viñetas."
- "Muéstrame mi perfil y redúcelo a unas 300 palabras."
- "Empieza cada sesión con 20 notas en lugar de 10."
- "Mantén la búsqueda por significado en la CPU, para que la tarjeta gráfica quede libre."
- "Ordena la memoria ahora y luego dime qué fusionaste y qué moviste a un proyecto."
- "¿Qué notas están marcadas porque el código cambió? Compruébalas con el código."
- "¿Qué sugiere la limpieza para AGENTS.md? Muéstramelo y añade la primera sugerencia."
- "¿Qué notas se dieron a los agentes a menudo pero nunca hicieron falta?"
- "Esa nota sobre el comando de compilación trata del proyecto Hydor, no de mí: muévela allí."
- "Empieza cada sesión con menos notas: solo las 5 que tengan que ver con lo que te pida."
- "Desactiva la memoria wiki en el proyecto Impuestos 2026 y déjala activada en el resto."
- "Busca en todos mis proyectos cómo configuramos el flujo de publicación."
- "¿Cómo gestionamos los despliegues en mi proyecto Tienda? Busca en su wiki y en sus conversaciones."
- "¿Cuáles de mis conversaciones pasadas en este proyecto mencionan la plantilla de facturas? Deja fuera los demás proyectos."
- "¿Qué notas no ha necesitado ningún agente en meses? Elimina las del sitio web antiguo."
- "La nota sobre mi viaje a Lisboa solo es cierta hasta el 12 de mayo: ponle esa fecha de fin."
- "¿Qué notas sobre este proyecto aún no están comprobadas? Compruébalas con el código."
- "Deja de aprender de las conversaciones, pero mantén la limpieza."
- "Desactiva la memoria en la sesión llamada Declaración de impuestos."
- "Trae lo que Claude Code y Codex recuerdan sobre mí y muéstrame las notas antes de añadirlas."
- "Usaba otro agente antes: trae lo que sabe sobre mí y las habilidades que creé, y muéstrame primero la lista."
