# Ingeniería: CI, incidencias, dependencias e incidentes

Los agentes pueden cuidar un código base mientras tú haces otra cosa: investigar una ejecución de CI fallida, clasificar cada incidencia nueva, mantener las dependencias al día y responder a una alerta, cada uno como una tarea programada creada a partir de un formulario breve. **Encontrar qué lo rompió**, en Git, hace que un agente encuentre el commit que rompió algo, y una **Campaña** divide un cambio grande en partes que varios agentes hacen a la vez, cada una en su propio worktree.

![Configuración → Tareas programadas: los ejemplos de Ingeniería](images/engineering.webp)

## Cómo funcionan las tareas de ingeniería

Las cuatro tareas son ejemplos en [Configuración → Tareas programadas](/settings?s=tasks) (**Configuración → Agentes → Tareas programadas**), en **Empezar desde un ejemplo** (pulsa **Mostrar todos los ejemplos** para verlos), junto a [**Revisar pull requests nuevos**](/settings?s=tasks&find=Review%20new%20pull%20requests). Cada una abre un formulario breve; rellénalo, elige quién la ejecuta en **Se ejecuta por** y selecciona **Crear tarea** (o **Más opciones…** para el formulario completo de la tarea). Consulta [Tareas programadas](/guide/tasks) para ver todo lo que puede hacer una tarea.

Lo que tienen en común:

- **Una carpeta del repositorio**: la copia del repositorio en esta computadora desde la que trabaja el agente. Lo lee y hace cualquier cambio en un nuevo worktree (una copia aparte en su propia rama), de modo que tu copia y su rama se quedan como están.
- **Una habilidad cada una**: el agente sigue un método escrito, una habilidad integrada que puedes leer y cambiar en [Configuración → Habilidades](/settings?s=skills): **ci-doctor**, **issue-triage**, **dependency-upgrades** e **incident-response**.
- **Lo que puede hacer**: interruptores del formulario, como **Abrir un pull request en borrador con una corrección**. De lo que dejes desactivado, el agente te dice en cambio lo que habría hecho. Ninguna de ellas hace nunca push a la rama por defecto, ni force-push, ni fusiona.
- **Webhooks**: Doctor de CI, Clasificación de incidencias y el respondedor de incidentes se inician cuando un servicio llama a la dirección propia de la tarea. Una vez creada la tarea, su fila en la lista muestra la dirección con un botón para copiarla y, debajo, dónde pegarla en ese servicio («En el repositorio de GitHub: Settings → Webhooks → Add webhook…»). El formulario dice lo mismo antes de crearla. Un filtro en cada una deja que solo empiece una ejecución lo que corresponde (una ejecución fallida, una incidencia recién abierta, una alerta que no sea un aviso de «resuelto»); las demás se responden y no inician nada. **Ejecutar ahora** en el menú de una tarea (o **Ejecución de prueba** en su formulario) funciona sin una llamada, para probarla: Doctor de CI toma la última ejecución fallida, Clasificación de incidencias las incidencias del último día que no tienen etiquetas, y el respondedor de incidentes comprueba cómo está el servicio.
- **Acceso**: el agente trabaja con GitHub mediante el comando gh cuando ha iniciado sesión en esta computadora, y si no, mediante una clave de tu bóveda o una app conectada (GitHub, GitLab, Buildkite, CircleCI, Sentry, Grafana, Datadog, Better Stack: consulta [Apps conectadas, claves y herramientas](/guide/connections)). Cuando necesita una clave que no tiene, te la pide.
- **Cada ejecución** informa de cómo fue en una línea, en su notificación y en el historial de la tarea, y guarda notas para la siguiente ejecución (las pruebas inestables que vio, las actualizaciones que dejó pendientes, los incidentes hasta ahora). Una ejecución que necesita tu aprobación la espera, en su sesión y en la [bandeja de entrada](/guide/inbox). Puede que nadie esté mirando cuando se inicia una ejecución, así que para estas tareas elige, en **Más opciones…** → **Permisos**, un modo que deje avanzar los pasos rutinarios y pregunte por los arriesgados (**Auto**); si no, la ejecución te espera en su primer comando.

## Doctor de CI

Una ejecución fallida en **GitHub Actions**, **GitLab CI**, **Buildkite** o **CircleCI** despierta a un agente. Lee los registros de los trabajos fallidos y encuentra el primer error real, mira las ejecuciones recientes del mismo trabajo para distinguir un fallo inestable de uno real, lo reproduce en un worktree, actúa según lo que hayas permitido y lo resume en unas pocas líneas.

### Configúralo

1. En [Configuración → Tareas programadas](/settings?s=tasks), selecciona [**Doctor de CI**](/settings?s=tasks&find=CI%20doctor) en **Empezar desde un ejemplo** (**Mostrar todos los ejemplos**).
2. Elige la **Carpeta del repositorio** y el **CI**: **GitHub Actions**, **GitLab CI**, **Buildkite** o **CircleCI**.
3. Elige lo que puede hacer:
   - **Volver a ejecutar los trabajos que parecen inestables** (activado al principio): una vez, cuando las pruebas indican que falló la ejecución y no el código (un tiempo de espera agotado, una descarga fallida, una prueba conocida por fallar a veces).
   - **Abrir un pull request en borrador con una corrección** (activado): para un fallo real, la corrección más pequeña en su propia rama, con la prueba fallida ejecutada, como borrador para que lo revises.
   - **Comentar el commit o el pull request** (desactivado): un comentario breve con la causa y la corrección o el siguiente paso.
4. Selecciona **Crear tarea**. La tarea lleva el nombre de su CI, como «Doctor de CI · GitHub Actions».
5. Copia su dirección de su fila en el CI, como indica la línea bajo la dirección:
   - **GitHub Actions**: **Settings → Webhooks → Add webhook** del repositorio; la dirección como Payload URL, application/json, y solo **Workflow runs** entre los eventos individuales.
   - **GitLab CI**: **Settings → Webhooks → Add new webhook** del proyecto, solo con **Pipeline events**.
   - **Buildkite**: **Settings → Notification Services**, **Añadir** en Webhook, con el evento build.finished.
   - **CircleCI**: **Project Settings → Webhooks → Add Webhook** del proyecto, con **Workflow Completed**.

Solo una ejecución fallida la inicia (en GitHub, una ejecución de workflow cuya conclusión es failure; en GitLab, Buildkite y CircleCI, una cuyo estado es failed). Cada ejecución recibe lo esencial de la ejecución fallida (el workflow, su dirección, la rama, el commit y su mensaje, el pull request), y su informe de una línea dice si es inestable o real, la causa y lo que hizo: «Inestable: un tiempo de espera del registro en npm ci; la volví a ejecutar», o «Real: el analizador de fechas falla en los años bisiestos; pull request en borrador #42».

## Clasificación de incidencias

Cada incidencia abierta en GitHub (o Gitea) despierta a un agente que la clasifica: lee la incidencia y la guía de contribución del proyecto, la etiqueta con etiquetas que tiene el repositorio, busca el mismo problema entre las incidencias abiertas y cerradas hace poco con varias formulaciones (diciendo qué tan seguro está), pide a quien la reportó, en un comentario amable, lo que le falta al reporte (la versión, los pasos, los registros) y, cuando la corrección es pequeña y clara, la prueba en un worktree y abre un pull request en borrador que hace referencia a la incidencia.

1. Selecciona [**Clasificación de incidencias**](/settings?s=tasks&find=Issue%20triage) en **Empezar desde un ejemplo** (**Mostrar todos los ejemplos**).
2. Elige la **Carpeta del repositorio** y lo que puede hacer: **Etiquetarla**, **Comentarlo** y **Probar los fáciles como pull requests en borrador** (todo activado al principio).
3. Selecciona **Crear tarea** y copia su dirección en **Settings → Webhooks → Add webhook** del repositorio en GitHub, solo con **Issues** entre los eventos individuales (en Gitea: Issues events).

Solo una incidencia recién abierta inicia una ejecución. El agente nunca cierra, bloquea, transfiere ni elimina una incidencia (etiqueta un duplicado seguro y deja que un responsable la cierre), nunca asigna personas y respeta lo que permite el proyecto: un proyecto que rechaza pull requests hechos con IA no recibe ninguno. Un problema de seguridad reportado en público no se discute allí: el agente indica a quien lo reportó la vía privada del proyecto para reportarlo y te avisa de inmediato.

## Jardinero de dependencias

Una vez por semana el agente se ocupa de las dependencias del repositorio (npm, pnpm, yarn, pip, uv, poetry, cargo y go): cuáles están desactualizadas y cuáles tienen avisos de seguridad. Primero las correcciones de seguridad; después las actualizaciones de parche, menores y mayores, cada grupo por separado y sin mezclar nunca las mayores con el resto. Cada grupo se hace en su propio worktree, leyendo las notas de versión de lo que cambió para detectar cambios que rompan la compatibilidad y ejecutando las pruebas. Una actualización que rompe las pruebas se deja pendiente, con el motivo en las notas de la tarea para que no se proponga de nuevo cada semana.

1. Selecciona [**Jardinero de dependencias**](/settings?s=tasks&find=Dependency%20gardener) en **Empezar desde un ejemplo** (**Mostrar todos los ejemplos**).
2. Elige la **Carpeta del repositorio**, el día en **Activado** (lunes al principio) y la hora en **A las** (09:00).
3. **Pull requests abiertos** (activado): un pull request en borrador por cada grupo cuyas pruebas pasan, con lo más destacado, los avisos que corrige y a qué prestar atención. Si está desactivado, no sube nada e informa de cada grupo con los comandos que lo aplican.
4. Selecciona **Crear tarea**.

Una semana con todo al día y sin ningún aviso abierto transcurre en silencio.

## Primer respondedor de incidentes

Una alerta de **Sentry**, **Grafana**, **Datadog**, **Better Stack** u **Otro servicio** despierta a un agente. En pocos minutos te dice, con una notificación, qué pasa, desde cuándo y qué gravedad tiene. Después reúne en una sola línea de tiempo los errores, los registros, los despliegues recientes y los cambios desde la última versión buena, encuentra la causa probable con sus pruebas y propone el paso más seguro, normalmente una reversión. Nunca revierte, reinicia ni despliega nada sin tu sí: lo pregunta en una tarjeta en la sesión de la ejecución y, cuando nadie responde a tiempo, la ejecución informa de que te necesita, con el comando en espera. Cuando todo termine, pídele en la misma sesión el postmortem.

1. Selecciona [**Primer respondedor de incidentes**](/settings?s=tasks&find=Incident%20first%20responder) en **Empezar desde un ejemplo** (**Mostrar todos los ejemplos**).
2. Elige **La carpeta del repositorio del servicio** y de dónde **Las alertas vienen de**: **Sentry**, **Grafana**, **Datadog**, **Better Stack** u **Otro servicio**.
3. **Cómo revertir** (opcional): un comando que el agente puede ejecutar una vez que digas que sí, como `kubectl rollout undo deployment/web`. Si lo dejas vacío, te pregunta cómo.
4. Selecciona **Crear tarea** y luego apunta las alertas del servicio a su dirección, como indica su fila:
   - **Sentry**: **Settings → Developer Settings → Create New Integration → Internal Integration**, la dirección como Webhook URL y **Alert Rule Action** activado; después añade la integración a las acciones de tus reglas de alerta.
   - **Grafana**: **Alerting → Contact points → Add contact point**, la integración Webhook con la dirección; después envíale las alertas desde una política de notificación.
   - **Datadog**: **Integrations → Webhooks → New**, con la dirección y `"transition": "$ALERT_TRANSITION"` añadido a su payload; después menciona `@webhook-` y su nombre en los mensajes de tus monitores.
   - **Better Stack**: **Incidents → Integrations → Exporting data → Outgoing webhooks → Configure**, luego **Add** en Incident, solo con los eventos de incidente creado o reabierto.

Los avisos de que un problema está resuelto o recuperado no inician nada (los de Sentry, Grafana y Datadog, mediante el filtro); los que lleguen de todos modos se anotan en las notas de la tarea y no hacen ruido. Con una app conectada para el servicio de alertas, el agente lee los errores y los registros a través de ella.

## Encontrar qué lo rompió

Cuando algo funcionaba en una versión anterior y ahora está roto, un agente puede encontrar el commit que lo rompió: prueba los commits intermedios con git bisect, dividiéndolos a la mitad cada vez (mil commits requieren unas diez pruebas), nombra el primero malo y explica qué de su cambio rompió las cosas y por qué.

1. En la [página de Git](/git), abre el repositorio y su **Historial**.
2. Abre el commit donde funcionó por última vez y elige **Encontrar qué lo rompió** en su menú ⋯, o selecciona el botón **Encontrar qué lo rompió** junto a **Buscar un commit** en la parte superior de la lista.
3. En el formulario **Encontrar qué lo rompió**:
   - **Funcionaba en**: el commit desde el que lo abriste (por su etiqueta si la tiene) o, si no, la última etiqueta. Escribe cualquier etiqueta, rama o commit; las últimas etiquetas se sugieren mientras escribes. Debajo aparece el commit que representa, con su mensaje y su antigüedad, o «Ningún commit o etiqueta con ese nombre».
   - **Roto en**: `HEAD` al principio (el último commit de la rama en la que estás).
   - **Qué está roto**: con tus propias palabras, con la mayor precisión posible («Exportar a PDF un documento con imágenes falla con “imagen demasiado grande”»).
   - **Cómo comprobarlo (opcional)**: un comando que falla mientras está roto, como `npm test -- export`. Sin uno, el agente escribe una comprobación propia.
   - **Se ejecuta por**: el agente, con el modelo y los permisos que usaste por última vez con él en la página de inicio.
4. Selecciona **Inicio**. Espera hasta que ambos extremos sean commits, no el mismo, y **Qué está roto** esté rellenado.

Se abre de inmediato una nueva sesión, en un nuevo worktree del repositorio, de modo que tu copia se queda como está. Su agente sigue la habilidad **git-bisect**: escribe un pequeño script de comprobación (termina con 0 cuando funciona, con 1 cuando está roto y con 125 para un commit que no puede probar, como uno que no compila), lo prueba primero en ambos extremos, ejecuta `git bisect run` con él, luego muestra el primer commit malo y la parte de su cambio que rompió las cosas, lo demuestra deshaciendo solo ese commit y sugiere una corrección. No cambia nada en tus ramas. Cuando termines, el menú de la sesión → **Dar por terminada: lista por ahora** ofrece quitar su worktree (consulta [Trabajar en un worktree](/guide/sessions#work-in-a-worktree)).

El cuadro de búsqueda (Ctrl+K) también encuentra **Encontrar qué lo rompió**: abre el formulario del último repositorio que usaste.

## Campañas: un gran cambio en muchas partes

Una campaña hace un gran cambio, en su mayoría mecánico, en todo un código base (pasar todos los paquetes a un nuevo logger, actualizar un framework, renombrar una API en todas partes) con varios agentes a la vez. Un agente responsable divide el cambio en partes (paquetes, módulos, carpetas), y cada miembro hace una parte en su propio worktree, con sus pruebas. Es el segundo tipo de [Enjambre](/guide/research#set-a-swarm-on-a-hard-problem): un único ajuste, **Tamaño del enjambre**, indica cuántos trabajan a la vez en ambos.

### Empezar una

1. En la página de inicio, elige la carpeta del repositorio. Una campaña necesita un repositorio git.
2. Abre **Opciones**, elige **Enjambre** y selecciona **Campaña** (“Un gran cambio en partes, cada una en un worktree”).
3. Describe el cambio y cómo se comprueba (“Pasar todos los paquetes de Jest a Vitest; npm test debe pasar en cada uno”) y pulsa **Inicio**.

La fila de Enjambre muestra “Campaña · 5 a la vez” (el tamaño de tu enjambre). Igual que con un enjambre, no se conserva para tu próxima sesión, y una investigación profunda y una campaña no pueden estar activas a la vez. Un límite de gasto establecido en el mismo menú cubre al responsable y a todos los miembros. El editor de una tarea programada tiene la misma opción.

### Cómo funciona

1. El responsable analiza el cambio y cómo se comprueba, y lo divide en partes que se puedan hacer y probar por separado. Publica el plan en el tablero: las partes, por nombre, en el orden en que se harán (primero el código compartido).
2. Inicia un miembro por cada parte, como máximo el tamaño de tu enjambre a la vez, y el siguiente a medida que otros terminan. Cada miembro trabaja en su propia rama, en un nuevo worktree creado a partir de la rama en la que está la carpeta del responsable.
3. Un miembro cambia solo su parte, ejecuta sus comprobaciones, hace commit en su rama y publica su parte como hecha (con la rama y las comprobaciones) o fallida (con lo que salió mal).
4. Una parte fallida tiene un intento más con lo aprendido. Si vuelve a fallar, queda como fallida.
5. El responsable fusiona las ramas terminadas en la rama en la que trabaja, una a una en un orden razonable, ejecutando las comprobaciones después de cada una, y elimina el worktree de cada parte fusionada. Si pides pull requests en tu mensaje, abre uno por parte en su lugar y no fusiona nada. Nunca hace push a la rama predeterminada.
6. Al final informa de lo que cambió, lo que falló y por qué, y lo que queda por hacer a mano.

Para mantener todo el cambio en una rama propia, activa también **Nuevo worktree** del menú de carpeta para el responsable: así los miembros crean sus ramas a partir de la rama del responsable, y las fusiones se hacen allí.

### Seguimiento: la barra y el tablero

La sesión del responsable tiene una barra sobre el cuadro de mensaje: **Campaña** · “planificando sus partes” al principio, luego “12 de 40 partes hechas · 2 fallidas · 3 en curso”, y **Tablero**. La sesión de cada miembro también tiene una barra: “En la campaña de” y el título del responsable, con **Tablero** y **Responsable**. En la barra lateral los miembros aparecen bajo el responsable, agrupados en una línea como “40 miembros de la campaña · 3 en curso”.

**Tablero** abre el **Tablero de la campaña** (desde la parte inferior de la pantalla en un teléfono):

- **Partes**: cuántas están hechas y cuántas han fallado, y luego cada parte en el orden del plan con su estado (**Esperando**, **Funcionando**, **Hecho**, **Fallido**, **Reintentando** o **Fallido 2 veces**) y la última noticia sobre ella, o lo que su miembro está haciendo ahora. Haz clic en una parte para abrir la sesión de su miembro. **Detener todo**, que aparece mientras hay miembros trabajando, detiene a todos los miembros que siguen en marcha.
- **Trabajando ahora**: los miembros en marcha, como máximo el tamaño de tu enjambre.
- **Publicaciones**, junto a las partes en una pantalla ancha: todo lo publicado, lo más reciente primero, cada una con su tipo (**Plan**, **Progreso**, **Hecho**, **Fallido**, **Hallazgo**, **Pregunta**, **Nota**) y la parte a la que se refiere.

Las publicaciones dirigidas a todos no despiertan a los miembros en una campaña (un miembro cuya parte está hecha sigue hecho); un mensaje a un miembro sí lo despierta.

## Pregunta a un agente

- “Configura un médico de CI para ~/code/shop en GitHub Actions: puede volver a ejecutar trabajos inestables, pero sin pull requests.”
- “¿Por qué falló la última ejecución de CI en main en acme/shop? ¿Era inestable?”
- “Clasifica las incidencias abiertas en acme/shop esta semana: ponles etiquetas y encuentra duplicados.”
- “Todos los lunes a las 9, ocúpate de las dependencias de ~/code/api y abre pull requests con lo que pase las pruebas.”
- “Configura un respondedor de incidentes para las alertas de Grafana de checkout, con reversión mediante kubectl rollout undo deployment/checkout.”
- “Escribe el postmortem de la caída de checkout de ayer.”
- “Funcionaba en v1.2.0: encuentra qué rompió la exportación a PDF en ~/code/docs.”
- “Empieza una campaña en ~/code/shop que pase todos los paquetes de Jest a Vitest, con un pull request por cada paquete.”
