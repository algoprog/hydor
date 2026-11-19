# Uso, límites y costos

Claude Code, Codex y Grok Build funcionan con planes que tienen límites de uso, y cada llamada a un modelo tiene un precio. Este tema muestra dónde ver cuánto has usado de cada plan y cuándo se restablece, qué pasa al llegar a un límite (y cómo hacer que las sesiones continúen solas), qué hicieron los agentes con el tiempo y cómo la app estima los costos, incluidos los precios que estableces tú.

![Uso: cuánto has usado de cada plan y cuándo se restablece](images/usage.webp)

## Abrir la página Uso

Abre **Uso** en la barra de iconos (en un teléfono, abre primero la barra lateral). Una barra delgada bajo el icono de Uso muestra de un vistazo cuánto queda en todas tus suscripciones de pago de Claude Code, Codex y Grok Build, contando cada una según el límite al que está más cerca; si solo tienes suscripciones gratuitas, cuenta esas, y si no tienes ninguna, no se muestra. Se pone roja cuando no queda nada. Pasa el cursor por encima para ver cuánto le queda a cada suscripción.

La [página Uso](/usage) tiene tres pestañas:

- **Límites** (`/usage`): cuánto queda de cada plan y cuándo se restablece.
- **Actividad** (`/stats`): líneas modificadas, tokens y sesiones con el tiempo.
- **Arena** (`/arena`): qué modelos ganan en tus propias tareas.

La app lee tu uso cuando abres la página, y cada cinco minutos mientras la app está abierta; en la pestaña **Límites**, **Actualizar** lo vuelve a leer ahora mismo. El uso de Grok Build se lee de su agente con unos minutos de diferencia, y **Actualizar** también lo lee de inmediato.

## Leer los límites de un plan

La pestaña **Límites** tiene una tarjeta para Claude Code, una para Codex, una para Grok Build (una vez que lo has añadido en [Configuración → Agentes → Más agentes](/settings?s=agents)) y una por cada cuenta que añadiste en [Configuración → Agentes → Cuentas](/settings?s=accounts). En una pantalla ancha se colocan de dos en dos por fila; en un teléfono, una debajo de otra.

Cada tarjeta muestra el correo y el plan de la cuenta, hace cuánto se leyeron los números y una fila por límite (una ventana de tiempo con un tope de uso):

- Claude Code: **Current session (5 h)**, **Weekly · all models** y límites semanales para un solo modelo, como **Weekly · Sonnet only**.
- Codex: **5-hour window**, **Semanal** o ventanas de otras duraciones. Cuando Codex tiene varios límites, cada fila empieza con el nombre del límite.
- Grok Build: **Semanal**, con cuándo se restablece. La tarjeta también indica el plan (SuperGrok, SuperGrok Plus o SuperGrok Heavy). El inicio de sesión propio de Grok tiene su tarjeta, y cada cuenta de Grok que añadiste tiene la suya.

Cada fila indica el porcentaje usado, una barra, el porcentaje restante y cuándo se restablece («se restablece en 2 h 15 min»; pasa el cursor para ver la hora exacta). Aparece un signo de advertencia al llegar al 90 % o más.

Según el plan, la tarjeta también muestra:

- **Uso adicional** (Claude): si el uso de pago más allá de los límites del plan está activado y cuánto se ha gastado de su límite mensual.
- **Créditos** (Codex, Grok Build): tu saldo de créditos, o «Ilimitado».
- **Pago por uso** (Grok Build): cuando el plan lo tiene, lo que gastaste en él este mes frente a su tope («$12.00 de $50.00 este mes»).
- **Restablecimientos de límite**: restablecimientos que puedes usar ahora (consulta [Usar un restablecimiento de límite](#use-a-limit-reset)).
- **Esta semana por superficie** (Claude): cómo se reparte el uso de esta semana entre los lugares donde usas Claude.
- **Tokens por día** (Codex): un gráfico de los últimos 30 días, con tu total acumulado. Un token es un fragmento de una palabra; los modelos cuentan en tokens lo que leen y lo que escriben.

Cuando algo falla, la tarjeta lo indica:

- «No has iniciado sesión» con **Inicia sesión en Configuración** (para Grok Build: «Inicia sesión para ver el uso del plan de Grok.»);
- en un plan administrado por un equipo, la tarjeta de Grok Build dice «Tu equipo administra los límites de uso.», ya que no tiene límites propios que mostrar;
- «No se informan límites de uso para este plan»;
- un error con **Revisa el inicio de sesión en Configuración**;
- «Se muestran los últimos números conocidos: …» cuando la última lectura falló.

## Qué pasa cuando llegas a un límite

Cuando se agota el uso de un plan, el turno del agente se detiene. En Grok Build eso significa su límite semanal, su límite de créditos o su tope de gasto de pago por uso; un límite de frecuencia breve (una ráfaga de solicitudes) no cuenta como tal y pasa solo. Un aviso indica de quién es el límite que se alcanzó, cuál es y cuándo se restablece: «Has alcanzado el límite de uso de Claude Code» (o de Codex o Grok Build) cuando hay una sola cuenta de ese agente, «Todas tus cuentas de Claude Code han alcanzado su límite de uso» cuando tienes varias y ninguna tiene uso disponible, o la cuenta por su nombre («Work ha alcanzado su límite de uso») cuando otra aún tiene. Se muestra:

- en la página de inicio, sobre el cuadro de mensaje, para el agente (y la cuenta) que elegiste;
- en una sesión, sobre el cuadro de mensaje;
- en la tarjeta de ese plan en la página Uso.

El aviso ofrece lo que puedes hacer:

- **Reanudar al restablecer** (en una sesión, mientras **Reanudar tras los límites de uso** está desactivado): la sesión continúa sola un minuto después de que se restablece el límite, con el mensaje «Continúa donde lo dejaste.». Entonces el aviso dice «Esta sesión continúa sola cuando se restablezca», con **Cancelar**.
- **Usar un restablecimiento**, cuando la cuenta tiene un restablecimiento de límite que puedes usar ahora («2 restablecimientos disponibles»).

Cuando el uso ya volvió pero una sesión aún debe continuar, el aviso dice «Continúa sola en …», con **Cancelar**.

## Continuar las sesiones automáticamente tras un límite

Para que cada sesión que llegue a un límite continúe sola, abre [Configuración → App → General](/settings?s=general&find=Resume%20after%20usage%20limits) y activa **Reanudar tras los límites de uso** (cuando un turno se detiene porque se agotó el uso de un plan, la sesión continúa sola un minuto después de que se restablece el límite). Está desactivado hasta que lo actives. Funciona aunque no haya ningún navegador abierto. Con esta opción activada, una sesión no muestra ninguna advertencia cuando un límite la detiene: una línea sobre el cuadro de mensaje indica de quién es el límite que se alcanzó (como hace el aviso), cuál es y «Continúa sola en …», con **Usar un restablecimiento** cuando la cuenta tiene uno, y **Cancelar**.

Cómo funciona el momento de la reanudación, con el interruptor o con **Reanudar al restablecer**:

- La sesión debe continuar un minuto después de que se restablece el límite, según lo último que informó el proveedor. La app lee el uso de vez en cuando mientras una sesión espera, con más frecuencia a medida que se acerca el restablecimiento, y cambia la hora si el proveedor mueve el restablecimiento.
- Si el límite se levanta antes (usaste un restablecimiento o iniciaste sesión con otra cuenta), la sesión continúa de inmediato. Si continuó antes de tiempo en los últimos 15 minutos y volvió a alcanzar el límite, espera al restablecimiento.
- Solo se continúa un turno que el límite detuvo de verdad, no uno que terminó justo cuando el uso del plan llegó al 100 %. Una continuación planificada se descarta cuando la sesión sigue sin ella: envías un mensaje o pulsas **Detener**, o un turno se completa con normalidad. Un turno que el agente inicia por su cuenta mientras espera (cuando una tarea en segundo plano o un subagente propio se detiene en el mismo límite) no la descarta. Una sesión que detuviste con **Detener** nunca continúa sola, aunque el error del límite haya llegado primero, hasta que le envíes un mensaje.
- **Cancelar** en el aviso detiene una continuación planificada.

Con más de una cuenta para el agente (Claude Code, Codex o Grok Build), [**Cambiar de cuenta en un límite**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) continúa la sesión de inmediato con otra cuenta, y solo espera cuando todas las cuentas están en su límite (consulta [Agentes, cuentas y modelos](/guide/agents-models#use-all-your-accounts-switch-at-a-limit)). En Claude Code, [**Usar crédito de API en un límite**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit) puede continuarla entonces, con cargo a una clave de API de Anthropic que guardaste, en lugar de esperar (consulta [Usar crédito de API cuando todas las cuentas están en su límite](/guide/agents-models#use-api-credit-when-every-account-is-at-its-limit)).

## Usar un restablecimiento de límite

Algunos planes ofrecen restablecimientos de límite: créditos de restablecimiento de Codex y concesiones de restablecimiento de Claude (Grok Build no tiene). Usar uno borra ahora los límites de uso del plan en lugar de esperar a que se restablezcan.

Cada tarjeta los enumera en **Restablecimientos de límite**, con cuántos tienes. Cada restablecimiento muestra su nombre (y cuántos usos le quedan), «Caduca en …» (en color de advertencia cuando falta menos de un día) o «No caduca», y notas como «Funciona cuando alcanzas un límite» o «Aún no se puede usar». Un restablecimiento que otro límite retiene indica cuál y cuándo se levanta: «Bloqueado mientras se agote tu límite semanal (se podrá usar en …)». Algunos restablecimientos de Claude solo borran una parte de tu asignación, por lo que no se pueden usar mientras tu límite semanal esté agotado; pasan a ser utilizables cuando este se restablece. La app revisa los restablecimientos de una cuenta de Claude cada diez minutos aproximadamente, porque Anthropic rechaza las consultas más frecuentes, y entre una revisión y otra muestra la última lista que leyó, incluso después de reiniciar la app. Por eso un restablecimiento puede tardar unos minutos en aparecer como utilizable. El que usas desaparece de la lista de inmediato.

1. Haz clic en **Usar** junto a un restablecimiento, o en **Usar un restablecimiento** en un aviso de límite (toma el primer restablecimiento de la lista que funciona ahora).
2. Lee la confirmación. Indica qué restablecimiento usa, cuándo caduca y cuántos quedarán. Si no estás en un límite, te lo advierte («Ahora mismo no estás en un límite»).
3. Haz clic en **Usar restablecimiento**.

La app indica cómo fue, por ejemplo «Se restablecieron los límites de uso de Codex.», «Claude no está en un límite de uso ahora mismo, así que no se restableció nada.», «Los restablecimientos están en enfriamiento. Inténtalo más tarde.» o «Ese restablecimiento ya se usó.». Si funciona, una sesión que esperaba el límite continúa de inmediato.

Los restablecimientos de Claude requieren Claude Code con sesión iniciada con una suscripción de Claude (no con facturación de API).

## Ver qué hicieron los agentes con el tiempo

La pestaña **Actividad** (`/stats`) cuenta lo que hicieron los agentes, a partir de las sesiones que la app conoce en esta computadora.

Arriba:

- **Diario**, **Semanal**, **Mensual** o **Anual**: el periodo que cuentan los números, y una barra por día, semana, mes o año en los gráficos. La página recuerda tu elección.
- **Todos**, o un agente: **Claude**, **Codex**, **Custom** y cualquier otro agente que haya hecho algo aquí (Gemini CLI, OpenCode…).
- La etiqueta de un modelo, cuando elegiste un solo modelo en **Por modelo** más abajo: la página cuenta entonces solo ese modelo. Haz clic en la etiqueta (su **✕**) para ver todos los modelos otra vez.
- **Gráficos** o **Tabla**.

La línea junto a ellos indica el rango que cubren los gráficos y la tabla (los últimos 30 días, las últimas 26 semanas, los últimos 12 meses o desde que empieza tu historial, o todos los años) y tu zona horaria. Los días, las semanas y los meses siguen tu zona horaria, y la semana empieza en lunes.

Debajo está el periodo hasta ahora, **Hoy**, **Esta semana**, **Este mes** o **Este año**, con sus fechas. Los recuadros muestran sus totales:

- **Líneas añadidas** y **Líneas eliminadas**
- **Tokens de entrada** (lo que leyeron los modelos: nuevos y en caché) y **Tokens de salida** (lo que escribieron)
- **Velocidad de salida**: tokens por segundo, mientras se escribían las respuestas
- **Costo de API (est.)**: lo que costarían los mismos tokens a través de la API
- **Mensajes** (con el número de turnos), **Sesiones**, **Comandos** (con el número de llamadas a herramientas) y **Ediciones de archivos**

La pequeña flecha de un recuadro compara con el periodo anterior, hasta el mismo punto: un miércoles a las 15:00, esta semana con la anterior desde el lunes hasta el miércoles a las 15:00; hoy con ayer hasta la misma hora. La línea junto al nombre del periodo lo indica («en comparación con la semana pasada hasta el mismo día y hora»). Es neutral: más no es mejor ni peor.

**Gráficos** muestra las líneas modificadas (las añadidas hacia arriba, las eliminadas hacia abajo), los tokens de entrada (nuevos y en caché), los tokens de salida, la velocidad de salida y gráficos pequeños de mensajes, sesiones, comandos y ediciones de archivos, con una barra por día, semana, mes o año en el rango; la última barra es el periodo hasta ahora. **Tabla** enumera los mismos números por periodo, del más reciente al más antiguo, con el total de todo el rango.

Más abajo, en ambas vistas, otra vez el periodo hasta ahora, tal como lo cuentan los recuadros:

- **Por agente**: cada agente por su nombre (Claude Code, Codex, Custom, Gemini CLI y los demás que hicieron algo), con sesiones, mensajes, líneas, entrada y salida.
- **Proyectos principales**: las carpetas con más líneas modificadas.
- **Por modelo**: las sesiones, los mensajes, la entrada, la entrada en caché, la salida y el costo de API de cada modelo, tanto de los modelos de Custom (OpenRouter, Ollama, vLLM…) como de los de Claude y Codex. Haz clic en un modelo para ver toda la página solo con él. Un modelo sin precio conocido muestra **establecer un precio** en su lugar. Pasa el cursor sobre un modelo para ver su precio por millón de tokens y de dónde viene («tu precio» o «tabla de precios públicos»).

En un teléfono los recuadros se colocan de dos en dos y se omiten algunas columnas de la tabla.

La página de inicio resume el día en una línea bajo el cuadro de mensaje en cuanto los agentes hicieron algo hoy: «Hoy · 7 sesiones · 12 ediciones de archivos · $0.84», omitiendo la parte que sea cero. El dinero es el **Costo de API (est.)** del día: en un plan (Claude Code, Codex) pagas en cambio la cuota de tu plan, como indica su texto al pasar el cursor. Pasa el cursor sobre la línea para ver las líneas añadidas y eliminadas, los tokens de entrada y salida, y los mensajes; haz clic en ella para abrir Actividad.

## Cómo se estiman los costos

Los planes de Claude y ChatGPT son de tarifa fija, así que la app muestra lo que costaría el mismo trabajo a precios de API (precios de pago por uso). Esto te indica cuánto provecho sacas de un plan y cuánto costaría un modelo a través de la API. La misma estimación aparece en la línea de cada turno terminado de una sesión ("≈ $0.12", con sus partes en **Tiempo y costo**) y en la línea **Hoy** de la página de inicio; si usas un plan, ambas lo indican al pasar el cursor por encima.

- Los precios provienen de una tabla pública de precios (la de LiteLLM), que la app descarga como máximo una vez al día y conserva para cuando no hay conexión.
- Los precios que establezcas tú prevalecen sobre los de la tabla.
- Los tokens de cada sesión se calculan con el precio de su modelo; una sesión que cambió de modelo se calcula con el último que usó.
- La entrada en caché (texto que el modelo ya leyó antes, servido desde su caché) se calcula al precio en caché, o al precio de entrada cuando no hay uno.
- Los modelos sin precio conocido (un nombre de familia solo, como "opus", o un modelo que la tabla no incluye) no suman nada en los totales y muestran **establecer un precio** en **Por modelo**.

Los modelos de OpenRouter usan precios obtenidos automáticamente de OpenRouter, incluidos los precios de entrada en caché. No necesitas introducirlos. Si OpenRouter no tiene un precio disponible, **Por modelo** muestra un guion en lugar de pedirte que establezcas uno.

Los límites de gasto usan los mismos precios, pero toman la cifra propia del agente cuando este la informa: el costo de Claude Code, o lo que OpenRouter indica que costó cada llamada de Custom. Un modelo que se ejecuta en esta computadora no cuesta nada aquí.

## Establecer tu propio precio para un modelo

1. En la pestaña **Actividad**, haz clic en **Precios de los modelos** en la parte superior de **Por modelo**, o en **establecer un precio** junto a un modelo.
2. El cuadro de diálogo **Precios de los modelos** muestra los modelos a la vista y los que ya hayas puesto precio antes. Cada uno tiene **Entrada**, **En caché** y **Salida**, en dólares por millón de tokens. Los campos vacíos usan el precio de la tabla pública, que aparece en gris.
3. Escribe tus precios. Se necesitan tanto la entrada como la salida; el precio en caché es opcional (si no lo pones, cuesta el precio de entrada).
4. Para poner precio a un modelo que no aparece en la lista, escribe su ID en **Otro ID de modelo** y haz clic en **Añadir**.
5. Haz clic en **Guardar precios**.

El icono de papelera de una fila (**Usar el precio de la tabla**) borra tu precio para ese modelo. Para que un modelo de esta computadora cuente como gratuito, ponle 0 en entrada y salida.

## Cada sesión se conserva

La app conserva cada sesión y sus cifras, sin importar lo que haga el programa propio del agente. Claude Code elimina sus conversaciones a los 30 días salvo que se le indique otra cosa, así que la app le indica que las conserve (en cada cuenta de Claude Code cuya configuración no especifique cuánto tiempo), y además guarda su propio enlace a cada archivo de conversación de Claude Code y Codex: una conversación que el programa del agente (o cualquier persona) elimine vuelve, aparece en la lista y se puede abrir como antes. El enlace es el mismo archivo con un segundo nombre, por lo que no ocupa espacio adicional en el disco.

Lo que se elimina es lo que nadie usa: las sesiones inactivas durante un año se eliminan, a menos que lo cambies en [Configuración → General → Eliminar sesiones inactivas](/settings?s=general&find=Delete%20inactive%20sessions) (consulta [Eliminar sesiones inactivas](/guide/app#delete-inactive-sessions)). Sus cifras permanecen en **Actividad**.

Las conversaciones que Claude Code eliminó antes de esto, cuando la app no las conservaba, no pueden volver; el historial de **Actividad** comienza donde la app las contó por primera vez.

## Limitar lo que gasta una sesión

Un límite de gasto detiene una sesión cuando ha gastado una cantidad determinada a precios de API, sea cual sea el plan con el que pagues. Los subagentes que inicie también cuentan.

- Para una sesión nueva: en la página de inicio, **Opciones** → **Límite de gasto**. Elige $1, $5, $10 o $25, o escribe una cantidad y haz clic en **Fijar**. **Sin tope** lo quita.
- Para una sesión en curso: el menú de la sesión (⋯) → **Configuración de la sesión** → **Límite de gasto**. El cuadro de diálogo muestra lo que ha gastado hasta ahora. Escribe un límite (desde $0.01) y haz clic en **Fijar el límite** o **Cambio**; **Quitar el límite** lo elimina.

Mientras hay un límite fijado, una barra sobre el cuadro de mensajes muestra "$1.20 de $5.00", con **Cambio**. Cuando se alcanza el límite, el agente se detiene justo después de la llamada al modelo que lo alcanzó, una nota bajo el turno dice "Detenido en el límite de gasto", y los mensajes nuevos esperan hasta que subas el límite (**Subir el límite…**) o lo quites. Consulta [Sesiones](/guide/sessions) para más información.

## La pestaña Arena

La pestaña **Arena** (`/arena`) muestra qué modelos ganan en tus propias tareas. En la página de inicio, **Opciones** → **Arena** envía tu instrucción también a uno o dos modelos más; tú te quedas con la mejor respuesta. La pestaña clasifica los modelos según una puntuación (una puntuación Elo, que empieza en 1000) sobre los duelos que hayas decidido, con la frecuencia con que se conservó cada uno y su porcentaje de victorias, y lista los duelos recientes, decididos o aún abiertos. Consulta [Investigación profunda, segundas opiniones y varios agentes](/guide/research).

## ¿Puedo reiniciar las cifras?

No hay un botón para borrar **Actividad**. Eliminar tú mismo una sesión (su menú → **Eliminar sesión**) también quita sus cifras de **Actividad**; las sesiones eliminadas por inactividad conservan las suyas. Los límites de la pestaña Límites son los propios de tus planes: se reinician según el calendario del proveedor, o con un [reinicio de límite](#use-a-limit-reset).

## Pregunta a un agente

- "¿Cuánto me queda de mi plan de Claude esta semana y cuándo se reinicia?"
- "¿Cuánto me queda de mi plan de Grok esta semana?"
- "Activa la reanudación de sesiones después de los límites de uso."
- "Continúa mi sesión 'Refactorizar autenticación' cuando se reinicie el límite de Codex."
- "¿Cuánto habría costado el trabajo del mes pasado a precios de API, por modelo?"
- "¿Cómo va esta semana en comparación con la anterior hasta ahora?"
- "¿Por qué la línea Hoy de mi página de inicio muestra $3.10 si estoy en un plan?"
- "Cuenta mis modelos de Ollama como gratuitos en las estimaciones de costo."
- "¿Cuánto hizo Custom este mes y con qué modelos?"
- "Elimina las sesiones después de dos años de inactividad en lugar de uno."
- "Muéstrame mi uso y costos de OpenRouter sin introducir precios de modelos."
