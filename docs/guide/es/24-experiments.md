# Experimentos

Experimentos ejecuta por ti tus trabajos de entrenamiento y evaluación. Un trabajo espera una GPU con suficiente memoria libre en una de tus máquinas (o espera su turno en la cola de un clúster), se ejecuta por su cuenta y se conserva como registro: su código, hiperparámetros, entorno, log y métricas, y lo que hizo el agente de guardia cuando algo salió mal. Cada experimento (las ejecuciones que comparas juntas) tiene un título, una descripción y una categoría, y su página muestra las ejecuciones como una tabla, sus métricas como gráficos y qué hiperparámetros importan. Compara ejecuciones o crea una tabla de resultados con pruebas de significancia para tu artículo. Los agentes también lo usan: pide a cualquier agente que entrene algo en una GPU libre y empezará una ejecución aquí.

![La página de Experimentos: experimentos por categoría a la izquierda, y la pestaña Gráficos de un barrido: las curvas de sus seis ejecuciones en gráficos compartidos, cada ejecución con su propio color](images/experiments.webp)

## Abrir Experimentos

Haz clic en **Experimentos** en la barra de iconos, o ve a [Experimentos](/experiments).

La primera vez que abres la página, un recorrido corto pensado para quien empieza con los experimentos te la enseña. Aparece mientras los consejos están activados, después del recorrido de bienvenida. Una tarjeta explica en palabras sencillas qué son un experimento y una ejecución, y luego cada parte de la página se ilumina por turno con su propia tarjeta: **Nueva ejecución**, la cola y las GPU, tus experimentos por categoría, seguir una ejecución en vivo, comparar ejecuciones y tablas de resultados, y dejar que un agente haga el trabajo. Avanza y retrocede con **Siguiente** y **Atrás**; **Hecho** lo termina, y **Omitir** o Esc lo cierra antes. **Muéstrame cómo funciona** (el botón de la brújula arriba a la derecha de la página) lo vuelve a empezar cuando quieras.

En una computadora, una columna a la izquierda permanece junto a todo lo que abras aquí:

- La línea de la cola de arriba dice qué está pasando ("2 en ejecución · 1 en espera", o "Nada en ejecución ahora"). Debajo, las GPU de esta computadora como pequeños medidores: la memoria que usa cada una, en el color de acento cuando una de tus ejecuciones la ocupa (apunta a una para ver qué tan ocupada está y qué ejecución la ocupa; haz clic para abrir esa ejecución). Cuando [limitas las horas de GPU de los agentes](#what-agents-may-use-gpu-hours) y se ha usado más de cuatro quintos del límite, una línea bajo las GPU lo dice: "Agentes: 92 de 100 horas de GPU en siete días".
- **Buscar un experimento** filtra la lista según lo que escribas: el título, la descripción, la categoría y el nombre de un experimento, y los nombres y comandos de sus ejecuciones. Si un experimento coincide solo por sus ejecuciones, indica cuántas ("3 ejecuciones coinciden").
- **Resumen** te lleva de vuelta a la página que se describe a continuación.
- **Evaluaciones**, cuando tienes alguna, con sus puntuaciones más recientes ([Evaluaciones](#evaluations-keeping-score-the-same-way)).
- Después, los experimentos, agrupados por categoría (un pequeño encabezado para cada una, con primero la categoría que tiene la ejecución más reciente; los experimentos sin categoría quedan bajo **Otros experimentos**, y no hay encabezados mientras ninguno tenga categoría). Cada uno muestra su título y, debajo, cuántas ejecuciones tiene y cuántas están en curso ("6 ejecuciones · 1 en ejecución"), o cuándo fue su última ejecución ("23 ejecuciones · hace 2 h"). Dentro de una categoría, va primero el experimento con la ejecución más reciente. **Ejecuciones sin experimento** es la última entrada, cuando existen esas ejecuciones.

El **Resumen** muestra:

- **En ejecución ahora**, cuando algo se ejecuta o espera: una tarjeta por cada ejecución con su estado, nombre, experimento, cuánto ha avanzado ("54% · faltan unos 41 min"), su métrica principal con una pequeña curva y sus GPU. Una ejecución en espera dice por qué. Haz clic en una tarjeta para abrir la ejecución. Cuando hay más de 12 en curso, **Mostrar las N** las muestra todas.
- **Experimentos**: una tarjeta por cada uno, con su categoría, título y descripción, cuántas ejecuciones tiene, cuántas están en curso y cuándo fue la última, y el mejor valor de su métrica principal ("Mejor dev_bpb 1,599"). Haz clic en una para abrirla.
- **Últimas ejecuciones**: una tabla con las 10 últimas ejecuciones de todos tus experimentos. **Mostrar las N ejecuciones** las muestra todas, con **Buscar una ejecución** encima.

En una pantalla estrecha no hay columna: el propio Resumen empieza con la línea de la cola, las GPU y **Buscar un experimento**, y muestra los experimentos como tarjetas.

Si aún no hay ejecuciones, la página explica qué es Experimentos, con **Nueva ejecución**, o “pide a cualquier agente: «entrena esto en una GPU libre y avísame cuando termine»”.

## La página de un experimento

Haz clic en un experimento en la columna o en el Resumen. Arriba:

- Su categoría y su nombre (el nombre que llevan sus ejecuciones, tal como lo escribiste en **Experimento**), luego su título en letras grandes y su descripción. Una descripción de más de tres líneas tiene **Más**.
- Debajo de la descripción, lo que se encontró: los hallazgos que registraron tus agentes cuya evidencia es una de las ejecuciones del experimento, o una tabla de resultados de ellas, cada uno en una línea con **Respaldado**, **Refutado**, **Poco claro** o **Abierto** tal como los muestra la [Memoria](/guide/memory) del proyecto, lo que afirma y lo que se aprendió. Se muestran los tres más recientes; **N más** muestra el resto, y no aparece el que un hallazgo posterior reemplazó. Al tocar uno, se abre en la Memoria de su proyecto. Cuando hay ejecuciones terminadas y ningún hallazgo las menciona, una línea discreta dice “Todavía ningún hallazgo dice qué mostró este experimento”, con **Pedir a un agente que lo escriba**: se abre la página de inicio con la petición escrita y sin enviar, en la carpeta de la ejecución más reciente.
- Una línea de recuentos: "9 ejecuciones + 6 intentos anteriores · 1 en ejecución · 2 en espera · 5 hechas · 1 con error · última ejecución hace 2 h" (solo lo que es mayor que cero). Se cuentan las ejecuciones que se muestran; los [intentos anteriores](#the-runs-table) y las ejecuciones archivadas, no.
- A la derecha, un menú ⋯, **Este experimento**: **Editar el título y la descripción** y **Escribirlos de nuevo** (consulta [Títulos, descripciones y categorías](#titles-descriptions-and-categories)), **Nueva ejecución en este experimento**, **Nuevo barrido en este experimento**, **Crear una tabla** (de sus ejecuciones terminadas: consulta [Tablas de resultados para tu artículo](#results-tables-for-your-paper)), **Comparar las últimas 6**, **Elegirlas todas** (marca todas las ejecuciones) y **Archivar este experimento** (no mientras haya ejecuciones suyas en marcha). Un experimento archivado sale de la columna y del Resumen, sin borrar nada: **Archivados · 3**, una línea discreta al final de la columna (y del Resumen, en un teléfono), los abre, cada uno con **Recuperar**. Una ejecución iniciada en un experimento archivado también lo recupera. En un teléfono, una flecha a la izquierda del título vuelve atrás.

Debajo hay tres pestañas: **Ejecuciones** (con cuántas), **Gráficos** e **Hiperparámetros** (cuando el experimento tiene dos ejecuciones o más que difieren en algún hiperparámetro). La pestaña que elegiste por última vez se abre primero la próxima vez, en este dispositivo.

### La tabla de ejecuciones

La pestaña **Ejecuciones** muestra las ejecuciones del experimento como una tabla, con una fila cada una: una estrella, su nombre, su estado ("En ejecución 54%", "Hecho", "Fallida", "Esperando una GPU"; apunta a un estado de espera para ver por qué), una columna por cada métrica (su último valor; el mejor de cada columna en negrita) y por cada hiperparámetro, luego **Tiempo de ejecución** e **Iniciada**. Cuando las ejecuciones del experimento están en más de un lugar, una columna **Dónde** indica dónde. Primero van las ejecuciones en curso, luego las que esperan, en el orden en que empezarán, y después las que terminaron, la más reciente primero. Haz clic en el nombre de una columna para ordenar por ella (el primer clic en una métrica pone primero la mejor; haz clic de nuevo para invertirlo, y una tercera vez para volver a ese orden). La tabla se desplaza hacia los lados, y la casilla y el nombre de cada ejecución siguen a la vista.

- **Intentos.** Una ejecución que falló, desapareció o se detuvo y se volvió a empezar (con **Ejecutar de nuevo**, o por un agente que indica qué ejecución reemplaza, o simplemente con exactamente el mismo comando, carpeta, semilla y configuración puestos en cola después de que terminara; dónde escriben y desde qué checkpoint siguen no cuenta) comparte una fila con la ejecución posterior: la más reciente, con una etiqueta como **4.º intento**. Toca la etiqueta para desplegar debajo los intentos anteriores, cada uno con su estado y, en pocas palabras, por qué terminó; vuelve a tocarla para plegarlos. Volver a ejecutar una ejecución que terminó bien es una repetición, no un intento: ambas conservan su fila.
- **Estrellas.** Toca la estrella a la izquierda de una ejecución para marcar las que cuentan. Las ejecuciones con estrella aparecen primero, y son las primeras en los gráficos. La página de una ejecución tiene la misma estrella.
- **Notas.** Una nota que tú o un agente escribió sobre una ejecución ("el error del tokenizador seguía en esta") aparece como una segunda línea bajo su nombre; la de un agente dice **Agente:** primero. Escríbela o cámbiala en [la página de la ejecución](#a-runs-page).

Encima de la tabla:

- **Buscar una ejecución** busca en los nombres, notas, comandos y etiquetas de las ejecuciones (una coincidencia en un intento anterior despliega su fila).
- **Filtrar**: por **Estado** (**Todas las ejecuciones**, **En ejecución y en espera**, **Hecho**, **Fallidas o perdidas**, **Detenidas**), cuando las ejecuciones están en más de un lugar **Dónde**, y bajo **Mostrar**: **Destacadas**, **También los intentos anteriores** (cada ejecución en su propia fila, también en los gráficos y en Hiperparámetros) y **Archivadas** (las ejecuciones apartadas, cada una con **Recuperar**). Mientras hay una búsqueda o un filtro activo, **× N mostradas** lo quita.
- **Columnas**: marca las métricas y los hiperparámetros que quieres mostrar (un cuadro de búsqueda encuentra uno; un hiperparámetro que difiere entre las ejecuciones dice **Difiere**). **Restablecer** vuelve a las que eligió la página: las métricas que más dicen sobre las ejecuciones y los hiperparámetros que difieren. Cada experimento conserva sus propias columnas en este dispositivo.

Haz clic en una fila para abrir la ejecución. Marca las casillas para comparar ejecuciones o actuar sobre varias a la vez (consulta [Comparar ejecuciones](#compare-runs)). La tabla muestra 50 filas; **Mostrar N más** muestra el resto.

Archivar una ejecución la quita de la tabla, los gráficos, los recuentos y las cifras de la columna, y no elimina nada: archívala desde el menú ⋯ de la ejecución o desde la barra inferior. Al archivar una fila, se archivan también sus intentos anteriores. Una ejecución que no ha terminado no se archiva: primero detenla. Las tablas de resultados que ya creaste siguen contando las ejecuciones que contaban, y una nueva del experimento deja fuera las ejecuciones archivadas.

### Gráficos

La pestaña **Gráficos** dibuja cada métrica que las ejecuciones imprimen a lo largo de los pasos, un gráfico por métrica, con una línea por ejecución. A la izquierda (encima de los gráficos, en un teléfono) están las ejecuciones en los gráficos: **En los gráficos** con cuántas ("6 de 23"), luego cada ejecución del experimento, con un punto de color cuando se muestra y un anillo vacío cuando no. Haz clic en una ejecución para mostrarla u ocultarla. Se muestran hasta 8 ejecuciones a la vez ("Se muestran hasta 8 ejecuciones a la vez: oculta una primero"). Una ejecución conserva su color mientras se muestra, sin importar qué otras ocultes o muestres, así puedes seguir una ejecución a través de tus cambios; el mismo color la identifica en la tabla de ejecuciones. El menú ⋯ (**Qué ejecuciones se muestran**) tiene **Mostrar las últimas 8**, **Mostrar las mejores 8** (según la métrica principal del experimento), **Mostrar las ejecuciones elegidas** (las que marcaste en la tabla) y **Ocultarlas todas**. Al principio se muestran las ejecuciones con estrella y después las primeras que tienen curvas, 8 en total. Las ejecuciones archivadas se dejan fuera, aquí y en **Hiperparámetros**, y también los intentos anteriores, salvo que **Filtrar** → **También los intentos anteriores** esté activado. Cada experimento conserva tu elección en este dispositivo.

Los gráficos se organizan en secciones según el comienzo del nombre de una métrica: **dev** (o val, validation, eval, test…), **train**, cualquier otro prefijo que compartan dos o más métricas antes de una barra (`eval/…`), luego **Métricas** para las que dicen qué tan bien lo hace una ejecución, y **Otros** para el resto (plegada hasta que la abras). Haz clic en el nombre de una sección para plegarla o abrirla. Encima de los gráficos:

- **Buscar una métrica** muestra solo los gráficos cuyo nombre contiene lo que escribas, en todas las secciones.
- **Suavizado**: un control deslizante de 0 (las curvas tal como son) a 0,99, un promedio móvil como lo dibujan TensorBoard y Weights & Biases; la curva original queda tenue detrás.
- **Opciones del gráfico** (el botón de controles deslizantes): **Eje X** (**Paso**, u otra métrica que solo crece, como los tokens o el tiempo), **Escala logarítmica** e **Ignorar valores atípicos** (el rango de un gráfico sigue a la mayoría de los valores en lugar de a un pico). Se conservan en este dispositivo, para todos los gráficos.

Apunta a un gráfico para leer el valor de cada ejecución en ese paso. Con un ratón, arrastra sobre un gráfico para acercar; haz doble clic en él (o en **Restablecer zoom**) para volver. En una pantalla táctil, un toque o un arrastre muestra los valores. **Más grande**, arriba a la derecha de un gráfico, lo abre en grande, con una tabla del **Último**, **Mejor**, **Mín.** y **Máximo** de cada ejecución.

### Hiperparámetros

La pestaña **Hiperparámetros** muestra cómo se relacionan los hiperparámetros de las ejecuciones con una métrica, que es como se lee un barrido. Elige la métrica (al principio, la principal) y si cada ejecución cuenta por su valor **Último** o **Mejor**; la página dice si para ella es mejor un valor más bajo o más alto. Cuando las ejecuciones son un barrido, una línea lo indica: "Un barrido de 12 ejecuciones · todas las combinaciones · 9 hechas · 2 en curso · 1 detenida antes de tiempo · detenida antes de tiempo en dev_loss". Debajo:

- Ejecución **Mejor**: "Mejor dev_bpb", su valor, la ejecución y los valores de los hiperparámetros que difieren. Haz clic en ella para abrir la ejecución.
- **Coordenadas paralelas**: una línea por cada ejecución a través de los hiperparámetros (los que más importan primero, hasta 8) y, al final, la métrica. Cuanto más fuerte es la línea, mejor le fue a la ejecución. Apunta a una línea para ver de qué ejecución se trata; haz clic en ella para abrir la ejecución.
- **Qué hiperparámetros importan**: una barra por cada hiperparámetro que difiere, la más fuerte primero. Para un número, ρ (de −1 a 1) indica cómo se relaciona su orden con el de la métrica: una barra a la izquierda del centro significa que un valor más alto va con una métrica más baja, y las palabras dicen "más alto es mejor" o "más bajo es mejor". Para otros valores (un nombre, verdadero o falso), η (de 0 a 1) indica cuánto difieren los grupos, con "mejor:" y el valor cuyas ejecuciones lo hicieron mejor en promedio. Debajo, a partir de cuántas ejecuciones se calculó. Es una correlación, no una prueba de causa: otros hiperparámetros cambian al mismo tiempo, y con pocas ejecuciones una barra puede aparecer por azar. Se omite un hiperparámetro que es igual en todas las ejecuciones o que tienen menos de 3 ejecuciones.
- **Cada hiperparámetro frente a** la métrica: un gráfico por cada uno, un punto por ejecución, con la mejor rodeada por un anillo (en escala logarítmica cuando los valores abarcan mucho, como las tasas de aprendizaje).

Al final, **Crear una tabla** y **Comparar las 6 mejores**.

## Empezar una ejecución

1. Haz clic en [**Nueva ejecución**](/experiments?new=1) arriba a la derecha.
2. Escribe el **Comando**, como lo harías en su carpeta: `python train.py --lr 3e-4`.
3. Elige la **Carpeta** en la que se ejecuta y **Dónde se ejecuta**: **Esta computadora**, una de tus otras máquinas o un clúster (consulta [Adónde van las ejecuciones](#where-runs-go)).
4. Indica las **GPUs** que necesita (con 0 se ejecuta sin ninguna) y la **Memoria libre de cada una (GB)**. Si la dejas vacía, espera una GPU que nadie use. Si la completas, puede compartir una GPU con otras ejecuciones tuyas cuando su memoria cabe (consulta [Cómo elige la cola](#how-the-queue-chooses)).
5. Ponle un **Nombre** si quieres (si no, el nombre de su script) y un **Experimento**: las ejecuciones de un experimento se listan, se grafican y se comparan juntas (el cuadro sugiere los que ya tienes).
6. **Inicio** indica cuándo arranca: **Cuando haya una GPU libre** o **Esta noche** (consulta [Ejecuciones que esperan a la noche](#runs-that-wait-for-the-night)). Después haz clic en **Inicio** (o [pruébalo primero](#try-it-first)).

**Más opciones** contiene el resto:

- **Hiperparámetros**: líneas nombre=valor (`lr=3e-4`), que se conservan con la ejecución, se muestran como columnas en la tabla de ejecuciones de su experimento y se comparan en tablas. Los hiperparámetros del propio comando se leen solos: `--name value`, `--name=value` y las palabras `name=value` después del programa (como las toma Hydra). Una opción que solo dice dónde escribe el comando o desde qué checkpoint sigue (`--out outputs/a`, `--resume last.pt`) no se lee como hiperparámetro. `{name}` en el comando toma el valor de un hiperparámetro.
- **Semilla** (`{seed}` en el comando la toma; también se lee `--seed` en el comando), **Prioridad** (la más alta va primero) y **Límite de tiempo (horas)** (se detiene después de ese tiempo).
- **Para continuar tras una parada**: el comando que sigue desde el último punto de control de la ejecución, como `python train.py --resume outputs/a/last.pt`, y debajo, **Avisarle estos segundos antes de una parada** (30 si no lo cambias, de 5 a 600). Consulta [Detener y continuar](#stopping-and-carrying-on).
- **Una GPU para ella sola** (para ejecuciones que necesitan GPU): ninguna otra ejecución tuya usa sus GPU mientras se ejecuta, pida la memoria que pida. Es útil cuando estás midiendo la velocidad.
- **Archivo de métricas**: un archivo en el que la ejecución escribe métricas como líneas JSON, además de lo que imprime. **Puntuaciones por ejemplo**: un archivo con puntuaciones por ejemplo (consulta [Tablas de resultados para tu artículo](#results-tables-for-your-paper)).
- **Avisarme**: **Cuando termina** y **Cuando falla** (ambos activados salvo que los desmarques), y **Cuando una métrica cruza un valor** ("val_acc > 0.9").
- **Agente de guardia**: consulta [El agente de guardia](#the-agent-on-call).
- En un clúster SLURM: **Procesadores**, **Memoria (GB)** y **Partición**.

La nueva ejecución se abre, para que puedas ver cómo empieza. Para añadir una ejecución a un experimento que estás viendo, usa **Nueva ejecución en este experimento** en su menú ⋯: **Experimento** ya viene rellenado. Poco después de la primera ejecución de un experimento, el modelo auxiliar le da un título, una descripción y una categoría (consulta [Títulos, descripciones y categorías](#titles-descriptions-and-categories)).

## Probarlo primero

Antes de una ejecución larga, **Probarlo primero** (junto a **Inicio** en una ejecución nueva, para un comando en esta computadora) ejecuta el mismo comando, en la misma carpeta y con el mismo entorno, durante 90 segundos y luego lo detiene. En un barrido, prueba la primera combinación. Espera su turno para una GPU igual que lo haría la ejecución real; **Detener** lo termina antes, y cerrar la ventana también.

Después, la ventana indica en pocas líneas:

- si funciona (una prueba que falla muestra dónde falló primero),
- cuánta memoria de GPU usó como máximo y qué significa eso para **Memoria libre de cada una (GB)** (un décimo más, redondeado hacia arriba a GB enteros),
- cuánto debería tardar la ejecución completa, cuando la salida indica hasta dónde tiene que llegar (una barra de progreso, o “step 40/5000”); una prueba que llegó hasta el final tardó más o menos lo mismo que la ejecución completa.

**Usar estos** pone en las casillas esa memoria y un límite de tiempo (la estimación más una cuarta parte).

Mientras se prueba, el comando encuentra `HYDOR_TRY=1` y `HYDOR_TRY_SECONDS` en su entorno: un script que las lea puede saltarse lo que tarda mucho o detenerse antes (en ese caso, la ejecución completa tarda más que una prueba que llegó hasta el final). Una prueba ejecuta el comando real en la carpeta real, así que escribe los archivos de salida y de checkpoint reales del comando. Una prueba no es un resultado: queda fuera de las listas y tablas de los experimentos y del aviso de la mañana, y no avisa a nadie. Su página sigue ahí, con su log.

Lo aprendido se recuerda: la próxima vez que inicies el mismo comando en la misma carpeta (sus números pueden ser distintos), **Memoria libre de cada una (GB)** muestra lo que usó como máximo la última vez, y se le informa al agente que lo inicie.

## Cómo elige la cola

- Los trabajos se ordenan por prioridad y luego por antigüedad. Un trabajo que necesita GPUs toma las que tienen suficiente memoria libre: primero una vacía y después la que tiene más espacio. Mientras no haya suficientes libres, espera y dice por qué: “Esperando 1 GPU con 20 GB libres: lo máximo libre ahora es 12 GB, en la GPU 2; tus otras ejecuciones ocupan la GPU 0”. Cuando otro programa ocupa memoria en una GPU, el motivo lo nombra: “otro programa (ollama) ocupa 9 GB en la GPU 2”. Un trabajo más pequeño que esté detrás puede empezar primero, cuando lo que necesita está libre.
- **Compartir una GPU**: un trabajo que indica cuánta memoria necesita (**Memoria libre de cada una (GB)**) puede ir a una GPU donde ya están otras ejecuciones tuyas, si la memoria alcanza. Lo que cuenta es la memoria de la tarjeta, menos la que está en uso o la que pidieron esas ejecuciones (lo que sea mayor, ya que una ejecución recién iniciada aún no ha ocupado su memoria), menos un margen de 1 GB o del 5 % de la tarjeta (lo que sea mayor). Tres ejecuciones que necesitan 7 GB cada una van en una tarjeta de 24 GB, y la cuarta espera. Un trabajo que no indica cuánta necesita recibe una GPU para él solo, y nada se le suma; lo mismo ocurre con uno que tiene activada la opción **Una GPU para ella sola**. Desactiva el uso compartido en [Dónde van las ejecuciones](#where-runs-go) para que cada GPU tenga una sola ejecución a la vez. Las ejecuciones en un clúster o por SSH simple no se comparten; una ejecución enviada a otra de tus máquinas sigue la configuración de esa máquina.
- **Una espera larga**: un trabajo que lleva 20 minutos esperando GPUs es el siguiente. Hasta que empiece, ningún trabajo que esté detrás toma una GPU que él podría usar, a menos que ese trabajo tenga un **Límite de tiempo (horas)** que termine antes del primer momento en que podrían estar libres todas las GPUs que él espera. Los demás dicen “Esperando detrás de “big training”, que necesita 4 GPU y lleva 2 h en espera”. Un trabajo con mayor prioridad sigue pasando primero, y los trabajos sin GPU no se retienen. No se reserva nada para un trabajo al que otros programas le dejan muy pocas GPUs.
- **Cuándo empieza, aproximadamente**: el motivo de un trabajo en espera termina con una hora según tu propio reloj, “Hacia 14:20, cuando debería terminar “trainer””, calculada a partir de cuánto han avanzado las ejecuciones que ocupan lo que necesita (según lo que imprimen) o de sus límites de tiempo. Cuando la hora la da un límite de tiempo, lo dice, “Hacia las 14:20 a más tardar, cuando “trainer” llegue a su límite de tiempo”, ya que la ejecución bien puede terminar antes. Cuando no indican ninguna de las dos cosas, dice “No se sabe cuándo: esas ejecuciones no indican cuánto les falta”. Se vuelve a calcular más o menos una vez por minuto y es una estimación: una ejecución puede tardar más.
- Tras 6 horas de espera, recibes un aviso, como ““big training” lleva 6 horas esperando 4 GPU”, que abre la ejecución (uno para todo un barrido).
- Los trabajos sin GPU empiezan de inmediato, unos pocos a la vez; cuántos se define en [Dónde van las ejecuciones](#where-runs-go) (al principio, la mitad de los hilos de la computadora, entre 1 y 16).
- Un trabajo que pide más GPU de las que tiene la computadora, o una en una computadora sin GPU NVIDIA, falla de inmediato y lo dice.
- Una ejecución ve solo sus propias GPU (CUDA_VISIBLE_DEVICES); una sin GPU no ve ninguna. También recibe HYDOR_RUN (su id), HYDOR_RUN_DIR (su carpeta), HYDOR_SEED y HYDOR_GRACE_SECONDS (los segundos que tiene entre el aviso y la parada forzosa), y Python imprime de inmediato (PYTHONUNBUFFERED), así que su log avanza a medida que ocurre.
- Las ejecuciones siguen en tmux (o en segundo plano, donde no hay tmux) cuando la app se reinicia o se actualiza. Cuando la app vuelve, las encuentra de nuevo, lee lo que imprimieron mientras tanto y ve cuáles terminaron; una cuyo proceso desapareció se marca como **Desapareció** (y, cuando indica cómo continuar, se vuelve a empezar: consulta [Detener y continuar](#stopping-and-carrying-on)).

## Ejecuciones que esperan a la noche

Cuando tus GPU también se usan de día para tu propio trabajo, o para servicios que deben seguir siendo rápidos, envía a la noche lo que pueda esperar (controles, barridos más amplios, ideas que vale la pena probar). Una ejecución nocturna solo empieza en las horas de noche de la computadora donde se ejecuta, y solo cuando ninguna otra de tus ejecuciones espera allí por lo mismo (una GPU, o un lugar entre las ejecuciones sin GPU): esas siempre van primero, sean cuales sean las prioridades. Hasta entonces dice **Espera a la noche (desde las 23:00)**, y la línea de la cola cuenta estas ejecuciones por separado.

- **Las horas**: en [Dónde van las ejecuciones](#where-runs-go), **Noche de** una hora **a** otra, de 23:00 a 07:00 si no las cambias (una noche puede pasar de la medianoche). Se toman en tu propia zona horaria, tal como la indicó tu navegador (si no, del reloj de esta computadora); una ejecución enviada a otra de tus máquinas espera la noche de esa máquina. Si pones la misma hora en ambos campos, no hay noche, y las ejecuciones nocturnas esperan hasta que definas una. Un clúster tiene su propia cola, así que no se le puede enviar una ejecución nocturna.
- **Cuando termina la noche**: **Dejar que terminen las que están en curso** (la opción inicial), o **Detenerlas y empezarlas de nuevo la noche siguiente**. A una ejecución que se va a detener se le avisa primero (consulta [Detener y continuar](#stopping-and-carrying-on)). A menos que indique cómo continuar, vuelve a empezar desde el principio (el registro que tenía se conserva en su carpeta) y hasta entonces muestra “La noche terminó: la ejecución empieza de nuevo esta noche”. Cuando sí lo indica, sigue desde su punto de control la noche siguiente, con el mismo código y conservando sus curvas, y muestra “Detenida al final de la noche: esta noche continúa desde su checkpoint”. Cambiar el horario de modo que ya no sea de noche también da por terminada la noche.
- **Cómo empezar una**: en Nueva ejecución, para una ejecución o un barrido, pon **Inicio** en **Esta noche**; las horas de la noche aparecen al lado. El cuadro de diálogo se abre siempre en **Cuando haya una GPU libre**, también con **Ejecutar de nuevo**. Con **Esta noche** elegido para una carpeta en Git de esta computadora, una línea debajo dice "Ejecuta el código como está ahora, aunque la carpeta cambie antes de esta noche." (consulta [Qué registra una ejecución](#what-a-run-records)), así que tú, o un agente, pueden seguir editando la carpeta.
- **Por la mañana**: un solo aviso, como “Anoche: 5 ejecuciones terminadas, fallidas: 1, 2 aún esperan a esta noche”, abre Experimentos con las ejecuciones de esa noche primero. Una ejecución nocturna que termina de noche no envía su propio aviso de “terminada” (un fallo se avisa como siempre, y una sesión que lo pidió igual se entera de cómo fue); una que termina después del aviso de la mañana se avisa por separado. Una ejecución nocturna retenida por tu [límite de horas de GPU de los agentes](#what-agents-may-use-gpu-hours) se cuenta aparte ("3 te esperan"). No hay aviso cuando ninguna ejecución nocturna terminó ni está esperando.
- **Una búsqueda de noche**: [Evolucionar](#evolve-searching-for-a-better-version) iniciado con **Esta noche** trabaja solo en estas horas. Sus puntuaciones no se cuentan entre las ejecuciones de la noche: el aviso dice en una frase propia cuántas versiones más probó y cuál es la mejor (y cuando solo trabajaron búsquedas, abre la primera de ellas).
- **Los agentes** también envían allí ejecuciones exploratorias; su tarjeta de aprobación dice cuándo empezará una ejecución.

## Detener y continuar

Cuando es la propia app la que detiene una ejecución, porque alcanzó su **Límite de tiempo (horas)**, terminó la noche o la parada anticipada de un barrido vio que iba perdiendo, primero le avisa. La ejecución recibe Ctrl-C (la señal SIGINT, que Python convierte en `KeyboardInterrupt`) y luego tiene 30 segundos, o el número indicado en **Avisarle estos segundos antes de una parada**, para guardar un punto de control y salir. Una ejecución que sale en ese tiempo queda como **Detenida** con ese mismo motivo, sea cual sea su código de salida; la que no lo hace se detiene a la fuerza (TERM, y KILL 10 segundos después), y **Qué pasó** lo indica. Un script puede leer ese número en `HYDOR_GRACE_SECONDS`. Cuando detienes una ejecución tú (o lo hace un agente), recibe Ctrl-C y 10 segundos como siempre, a menos que la ejecución haya pedido un número de segundos: en ese caso tiene esos. En Windows no hay aviso: se detiene de inmediato.

**Para continuar tras una parada** es el comando que sigue desde el último punto de control de la ejecución, a menudo el mismo comando con una opción añadida. Los marcadores `{name}` se rellenan igual que en el comando. Con él:

- Una ejecución nocturna detenida al terminar la noche sigue desde su punto de control la noche siguiente, en lugar de empezar de nuevo.
- Una ejecución que **Desapareció** (su proceso ya no está y no dejó código de salida: la computadora se reinició o tmux se cerró) se vuelve a iniciar con ese comando, como una ejecución nueva que espera su turno como cualquier otra, y aparece como el siguiente intento de lo mismo. Como máximo dos veces seguidas; después se queda como desaparecida y se te avisa. Esto funciona en esta computadora, en tus otras máquinas y en máquinas con SSH simple.
- Una ejecución que un clúster SLURM recupera (desalojada) se vuelve a enviar del mismo modo, como máximo dos veces.
- **Ejecutar de nuevo** en una ejecución detenida o fallida ofrece **Continuar desde donde se detuvo** junto a **Empezar de nuevo** (viene elegida la primera para una ejecución detenida y la segunda para una fallida).

Una ejecución que alcanzó su límite de tiempo no se vuelve a iniciar sola: **Ejecutar de nuevo** ofrece continuarla.

Una ejecución que continúa, de cualquiera de estas formas, ejecuta **el mismo código** que la ejecución a la que da continuidad, conservado como se explica en [Lo que registra una ejecución](#what-a-run-records), aunque hayas cambiado la carpeta desde entonces: un entrenamiento nunca cambia de código entre puntos de control. Por eso **Ejecutar de nuevo** no pregunta por **Código** mientras esté elegida la opción **Continuar desde donde se detuvo**. Cuando ese código no se puede restaurar (era demasiado grande para conservarlo), no continúa, y lo indica. (La ejecución de un clúster, y una fuera de Git, ejecuta lo que haya en su carpeta). Para continuar a propósito con el código cambiado, empieza una nueva ejecución cuyo comando sea el que reanuda.

La que la app vuelve a iniciar por sí sola aparece como el siguiente intento, cuenta como del mismo agente o como tuya para el [límite de horas de GPU de los agentes](#what-agents-may-use-gpu-hours) (queda retenida cuando se alcanza el límite, como cualquiera de las ejecuciones de ese agente), y la que habías dejado ejecutar por encima del límite sigue autorizada.

Una ejecución nueva tiene su propia carpeta, así que guarda los puntos de control en un lugar que no cambie entre ejecuciones (la carpeta del proyecto, no `$HYDOR_RUN_DIR`), y haz que el comando funcione aunque todavía no haya ningún punto de control. La página de una ejecución indica qué comando ejecutó (“Continuó desde un checkpoint”).

## Lo que pueden usar los agentes: horas de GPU

Las **Horas de GPU** de una ejecución son sus GPU multiplicadas por las horas que dura: 4 GPU durante 6 horas son 24. Una ejecución sin GPU no cuenta ninguna.

**Antes de que empiece una ejecución**, la tarjeta con la que un agente te pregunta dice lo que puede usar:

- “At most 24 GPU hours (4 GPUs × 6 h)” cuando la ejecución tiene un límite de tiempo (un barrido: “At most 24 GPU hours (12 runs × 1 GPU × 2 h)”),
- si no, “About 3 GPU hours, going by its last run”, según lo que tardó la última ejecución terminada del mismo comando en la misma carpeta,
- si no, “No time limit: it runs until it ends”.

Un límite de tiempo cuenta dondequiera que vaya la ejecución, incluida una computadora a la que se accede por SSH simple.

**Un presupuesto para un plan.** En lugar de una tarjeta por cada ejecución, un agente puede pedir una sola vez las horas de GPU que necesita su plan: “¿Permitir 36 horas de GPU de ejecuciones?”, con el motivo y “This session's runs that stay within it start without asking you again.”, y **Permitir** o **No**. Con esto no empieza nada. Una vez que lo permites, las ejecuciones de esa sesión empiezan sin tarjeta siempre que lo que han usado sus ejecuciones desde entonces, más los límites de tiempo de las que están en espera o en curso, más el de la nueva, no lo superen. Con un presupuesto, toda ejecución en una GPU necesita un límite de tiempo. Una ejecución que se pasaría pregunta con la tarjeta habitual, que además dice “This session's budget of 36 GPU hours has 4 left”. Un presupuesto nuevo reemplaza al anterior, y termina cuando se elimina la sesión. Una búsqueda ([Evolucionar](#evolve-searching-for-a-better-version)) siempre se pregunta por separado.

**Un límite para todos los agentes.** En [Dónde van las ejecuciones](/experiments?places=1), **Ejecuciones de los agentes: como máximo N horas de GPU en siete días** establece lo que las ejecuciones de los agentes en las GPU de esta computadora pueden usar en cualquier período de siete días (vacío: sin límite, como al principio). También se aplica en las sesiones con acceso total. Las ejecuciones de los agentes son las que empieza una sesión (incluidos el agente de una tarea programada y el [agente de guardia](#the-agent-on-call)), el paso de una app, la puntuación de un objetivo o una evolución que empezó un agente. Las ejecuciones que empiezas tú nunca se cuentan ni se retienen; las ejecuciones en un clúster o en otra máquina no se cuentan aquí (otra máquina tiene su propio límite).

Una vez alcanzado el límite, una nueva ejecución de un agente en una GPU se acepta pero queda **retenida**: dice **Espera por ti**, con “Espera por ti: los agentes han usado 100 de 100 horas de GPU en los últimos siete días”, no empieza y no retiene ninguna otra ejecución. Recibes un aviso al día, y se informa al agente, para que pueda decírtelo en lugar de empezar más. En la página de la ejecución:

- **Dejar que se ejecute** empieza esa ejecución cuando le llegue el turno, por encima del límite.
- **Cambiar el límite…** abre Dónde van las ejecuciones.

Las ejecuciones retenidas empiezan solas, de la más antigua a la más nueva, cuando los siete días vuelven a dejar margen, o cuando subes o vacías el límite. Si una ejecución queda retenida se decide justo cuando está por empezar, según lo que hayan usado para entonces las ejecuciones de los agentes: con 99 de 100 usadas, las ejecuciones que encuentren una GPU libre pueden empezar, y las que sigan en la cola una vez superadas las 100 quedan retenidas.

Una nueva puntuación o búsqueda de un agente se rechaza mientras el límite esté alcanzado. Una que ya está en marcha también se detiene en el límite: las ejecuciones que la puntúan (en una búsqueda que empezó un agente, o en un objetivo) se retienen como cualquier otra, y la búsqueda espera su puntuación. Su página dice por qué, con las mismas palabras, y cuántas ha probado, y **Dejar que se ejecute** allí permite que toda la búsqueda continúe por encima del límite. Tus propias puntuaciones y búsquedas nunca se retienen. Un objetivo no cuenta el tiempo que su puntuación está retenida como parte del tiempo que le da a una puntuación.

## Qué registra una ejecución

- **Su código**: el commit y la rama del repositorio Git de su carpeta y si había cambios sin confirmar; si los había, un parche con ellos (sin los archivos binarios, como máximo 2 MB), y cuántos archivos no rastrea Git. En esta computadora (y en tus otras máquinas) todo esto se lee **cuando la ejecución se pone en cola**, y ese es el código que ejecuta, aunque la carpeta cambie mientras espera (consulta **El código que ejecuta**, más abajo); una ejecución de un clúster, una prueba y una ejecución que puntúa una evaluación lo leen al empezar. En esta computadora, los archivos que su comando nombra y que Git no rastrea o ignora (un script que no has confirmado, un pequeño archivo de configuración) se copian en su carpeta, dentro de `untracked/`, para que puedas volver a ejecutarla más adelante; lo que escribe el comando (los resultados de una ejecución anterior) y sus checkpoints (`--ckpt`, `--resume`) no se copian. Los archivos tuyos que están fuera de la carpeta de la ejecución y que el comando nombra (con una ruta completa, o una ruta con `..` o `~`) también se copian, dentro de `untracked/outside/` con sus nombres, y se listan tal como el comando los escribió: por ejemplo, un script de tu copia de trabajo principal ejecutado desde un worktree de Git. No se copian los que otra copia de trabajo o worktree del mismo repositorio tiene confirmados sin cambios en el commit de la ejecución, ni los archivos del sistema o de paquetes (en `/usr`, `/opt`, `node_modules`, `site-packages`, los programas de un entorno virtual…), ni los datos de la propia app. En total, como máximo 1 MB por archivo y 5 MB por ejecución, y nunca uno que parezca contener una clave o una contraseña. Su registro dice “Fuera de git, conservados con la ejecución”, y cuáles eran demasiado grandes para conservarse.
- **El código que ejecuta** (en esta computadora y en tus otras máquinas, en un repositorio de Git; Linux y macOS): una ejecución puede esperar horas por una GPU, o hasta la noche, mientras se edita la misma carpeta para el siguiente experimento. Por eso, cuando una ejecución se pone en cola, la app guarda también los demás archivos de la carpeta que Git no rastrea (ni ignora) y que son código o configuración (`.py`, `.sh`, `.bash`, `.yaml`, `.yml`, `.toml`, `.cfg`, `.ini`, `.conf`, `.jinja`, `.j2`, `.sql`, `.r`, `.jl`, `.lua`, `.js`, `.ts`, `.mjs`), dentro de los mismos límites. Cuando empieza, el código de la carpeta se compara con eso. Si es el mismo: se ejecuta en su carpeta, como siempre. Si cambió (un archivo editado, eliminado o incluido en un commit con otro contenido; un archivo nuevo desde entonces no cuenta): se ejecuta desde **una copia del código tal como estaba al ponerse en cola**, hecha en la propia carpeta de la ejecución.
- **Código o datos**, algo que se decide para cada archivo cuando la ejecución se pone en cola. Los **Datos** nunca se comparan, y en una copia son un enlace a tu propio archivo, así que lo que se escribe termina en tu carpeta: todo lo que Git no rastrea y no es código; lo que el comando escribe (una redirección como `> log.txt` o `| tee`, y el valor de una opción cuyo nombre empieza con `-o`, `--out`, `--save`, `--log`, `--result`, `--dump`, `--report`, `--write`, `--pred`, `--export`, `--checkpoint` o `--ckpt`; en una carpeta nombrada de esa manera, todo menos el código fuente de programas), sus archivos de métricas y puntuaciones; y cualquier archivo, rastreado o no, que termine en `.csv`, `.tsv`, `.jsonl`, `.ndjson`, `.log`, `.out`, `.parquet`, `.feather`, `.pkl`, `.pickle`, `.pt`, `.pth`, `.ckpt`, `.safetensors`, `.npy`, `.npz`, `.h5`, `.hdf5`, `.db`, `.sqlite` o `.sqlite3`. El **Código** es el resto: los archivos que Git rastrea, los archivos que el comando nombra y otros archivos sin rastrear con una terminación de código. Así, un barrido en el que cada ejecución reescribe un archivo de resultados se ejecuta en su sitio. Una ejecución que reescribe código o configuración rastreados (un `.json` rastreado, por ejemplo) sí hace que las ejecuciones puestas en cola después usen una copia: escribe los resultados en archivos que Git no rastree o que ignore, o nómbralos con una opción de salida.
- **En la copia**, las rutas del comando que nombran tu carpeta llevan a la copia (la página de la ejecución muestra entonces el comando como **Ejecutada como**); `$HYDOR_CODE_DIR` es la copia y `$HYDOR_PROJECT_DIR` tu carpeta (en los demás casos, ambas son tu carpeta). La copia tiene su propio historial de Git que toma prestado el de tu repositorio, así que `git rev-parse HEAD` en ella da el commit que había al ponerse en cola; nada cambia en tu repositorio. Cuando la ejecución termina, lo que creó en la copia (una carpeta `results` nueva, un archivo nuevo) se mueve al mismo lugar en tu carpeta, pero solo donde no hay nada: nunca se sobrescribe nada tuyo. Lo que no se pudo mover (ya hay algo allí, la ejecución puso un archivo en lugar de un enlace, o cambió un archivo del código) se queda en la copia, y la página de la ejecución lo enumera; el resto de la copia se quita. Las cachés (`__pycache__`, `.pyc`) no se mueven. Si el código era demasiado grande para guardarlo (un parche de más de 2 MB, o código y configuración que superan los límites) y la carpeta cambió, la ejecución no empieza con un código que nadie eligió: falla con “Su código cambió mientras esperaba y era demasiado grande para conservarlo como estaba al ponerla en cola: ejecútala de nuevo”. Los archivos de datos grandes y los checkpoints se enlazan, no se guardan, y no cuentan. Un agente puede pedir en cambio la carpeta tal como esté cuando empiece la ejecución (`code: "now"`); la ejecución entonces lo indica. Un agente que vuelve a ejecutar una ejecución después de que el código haya cambiado tiene que decir cuál quiere, como pregunta **Ejecutar de nuevo**: el código propio de la ejecución o la carpeta tal como está ahora. Una ejecución en un **clúster** no se ve afectada: su código es el que tenga su carpeta allí cuando empieza.
- **Su entorno**: la computadora; el Python con el que se ejecuta el comando y las versiones de PyTorch, Transformers, JAX, TensorFlow y NumPy que hay en él (se leen de los paquetes, no se importa nada); con GPU, las versiones de CUDA y del controlador y los nombres de las GPU.
- **Sus hiperparámetros y su semilla**, su **log**, su **código de salida** y su propia carpeta en los datos de la app (su log, parche, código de salida y métricas).
- **Lo que usó** (ejecuciones en esta computadora): mientras se ejecuta, cada 10 segundos (cada 30 después de diez minutos), la memoria de GPU que ocupan sus propios programas en cada una de sus GPUs y lo ocupadas que están esas GPUs, además del procesador y la memoria de sus programas (en Linux). Su registro guarda lo máximo que usó, y lo que ocupaban otros programas en sus GPUs al empezar y al final.
- **Sus métricas**, leídas de su salida a medida que crece: pares `key=value` (`loss=0.42`, como los imprimen las barras de progreso de Lightning), un objeto JSON en una línea (`{"step": 100, "loss": 0.42}`), los diccionarios de Python impresos (como los imprime el Trainer de Hugging Face), el “loss: 0.41 - accuracy: 0.87” de Keras y el archivo de métricas. El paso se toma de `step`, `global_step`, `iter` o `epoch`. De cada métrica guarda el último valor, el mejor (menor es mejor para las pérdidas, los errores, la perplejidad y similares según sus nombres, mayor para las demás) y una serie para los gráficos. Una métrica que se imprime una y otra vez es una curva; un número que se imprime una sola vez es un valor (sus hiperparámetros al principio, sus resultados al final). Guarda hasta 100 métricas: cuando una ejecución imprime más, se conservan sus curvas antes que los números que imprimió una sola vez.
- **Cuánto lleva avanzado**, cuando su salida lo indica: una barra de progreso (la de tqdm, como la dibuja el Trainer de Hugging Face, o una llamada de entrenamiento o de pasos), “step 120/1000”, o un total de pasos que imprime (`total_steps`, `max_steps`, `num_training_steps`…) junto a sus pasos.

## La página de una ejecución

Haz clic en una ejecución (en una tabla, en una tarjeta o en el medidor de una GPU). En una computadora se abre en el lugar del experimento, con la columna todavía a la izquierda; en una pantalla estrecha ocupa toda la pantalla, con una flecha para volver. El camino de vuelta es el enlace de arriba a la izquierda, con el nombre del experimento de la ejecución (**Resumen** para una ejecución sin experimento).

- Debajo del nombre: el lugar que ocupa la ejecución entre los intentos (“El 4.º intento: el 3.º se quedó sin memoria”, con un enlace a ese; en uno anterior, “Se volvió a empezar como” con un enlace a la ejecución posterior), y luego **Añadir una nota**, una línea de 500 caracteres como máximo sobre la ejecución para quien la lea más adelante, que se cambia en el mismo lugar con un toque (si se deja vacía, se quita).
- El encabezado: el nombre de la ejecución; una estrella; **Detener** mientras se ejecuta o espera («Deteniendo» mientras lo hace); **Ejecutar de nuevo**, que abre Nueva ejecución con sus hiperparámetros ya completados, para que los cambies antes de empezarla (cuando el código de la carpeta ha cambiado desde entonces, también pide **Código**: **Su propio código**, elegido primero, o **La carpeta como está ahora**; en una ejecución interrumpida que indica cómo continuar, pide **Checkpoint**: **Continuar desde donde se detuvo** o **Empezar de nuevo**); y **Más** (⋯): **Archivar** o **Recuperar** (cuando ya terminó), **Copiar el comando**, **Su carpeta en Archivos**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio; consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)), y, cuando ya terminó, **Eliminar el registro** (ver más abajo). En un teléfono, **Ejecutar de nuevo** está en el menú ⋯.
- La línea de estado: su estado, con cuánto tardó una vez que ha terminado, su código de salida cuando no es 0, dónde se ejecuta, sus GPU y cuándo empezó. Mientras se ejecuta y su salida indica cuánto lleva avanzado: una barra, los pasos hechos del total (“9.120 de 10.878 · 84%”) y cuánto falta aproximadamente, calculado a partir de lo que ha tardado hasta ahora. Una ejecución que espera o que falló dice por qué. Una retenida por el [límite de horas de GPU de los agentes](#what-agents-may-use-gpu-hours) tiene ahí **Dejar que se ejecute** y **Cambiar el límite…**.
- Tres pestañas: **Resumen**, **Gráficos** (con cuántas curvas tiene) y **Log**.

**Resumen** contiene:

- **Dónde falló por primera vez**, en primer lugar, para una ejecución que falló o desapareció, cuando su registro lo muestra: el primer traceback de Python (con su última línea) o la primera línea con un error, unas líneas alrededor y **Abrir el registro en la línea N**, que muestra el registro desde ahí. La falta de memoria solo se da como motivo cuando el registro o la computadora lo indican: “Se quedó sin memoria en la GPU 2: había llegado a 21.8 de 24 GB, y otro programa ocupaba 9.1 GB allí cuando empezó”. Una ejecución terminada a la fuerza sin esa señal dice “Se forzó su cierre (código de salida 137)”.
- **Cómo terminó**: las últimas líneas de su registro y **Abrir el registro** (se omite cuando son las mismas líneas).
- **Métricas clave**: un icono para cada una de hasta seis métricas que indican qué tan bien funciona (nunca datos auxiliares como la tasa de aprendizaje o el número de tokens), con el último valor, el mejor cuando difiere y una pequeña curva. Haz clic en uno para abrir la pestaña **Gráficos** en esa métrica.
- **Hiperparámetros**: los que se le dieron o que se leyeron de su comando (un cuadro permite buscar uno cuando hay muchos).
- **Valores**: los números que imprimió una sola vez, por nombre: sus hiperparámetros al principio, sus resultados al final. **Todos N** muestra más de doce, con un cuadro para buscar uno.
- **Detalles**: su experimento (con un enlace a él), estado, cuándo empezó y terminó, cuánto tardó, dónde se ejecuta, GPU, el máximo que usó, semilla, prioridad, la sesión que la empezó y la ejecución de la que es una repetición.
- **Código**: el commit y la rama, **Ver los cambios** para el parche (o “No ha cambiado nada desde”; “Todo está en commits” cuando la carpeta había cambiado mientras esperaba), cuántos archivos no están bajo el control de Git y los nombres de los que usa el comando que se conservaron con la ejecución o eran demasiado grandes para conservarlos. Cuando la carpeta había cambiado entre la puesta en cola y el inicio, una frase dice qué código ejecutó (“Ejecutó el código tal como estaba cuando se puso en cola. Desde entonces, la carpeta había cambiado: train.py, config.yaml y 2 más.”), y mientras se ejecuta desde una copia, que lo que escriba en carpetas nuevas aparece en tu carpeta cuando termina. **Abrir su código** (en una ejecución de esta computadora que ya empezó) muestra el código en **Archivos**: mientras una ejecución va desde una copia, esa copia; si no, el código tal como se conservó, reunido en ese momento (junto a lo que quedó de su copia, que se deja como la dejó la ejecución, para que puedas comparar las dos). Una ejecución que dejó archivos en su copia los lista, con dónde están.
- **Comando**: el comando y la carpeta, con **Su carpeta en Archivos**; en una ejecución desde una copia cuyo comando o variables se dirigieron a la copia, **Ejecutada como** debajo; el comando **Para continuar tras una parada** cuando lo tiene, y encima “Continuó desde un checkpoint” cuando la ejecución lo hizo. **Entorno**: la computadora, Python, los paquetes y las GPU.
- **Qué pasó**: sus eventos, con sus horas: cuándo esperó, empezó y terminó, y lo que el agente de guardia vio e hizo, con **Abrir su sesión**.

**Gráficos** dibuja las curvas de la ejecución como lo hace la pestaña de un experimento (consulta [Gráficos](#charts)), solo para esta ejecución, y las vuelve a leer cada pocos segundos mientras se ejecuta. Debajo de ellas, **Sistema** muestra lo que usó a lo largo del tiempo, en minutos desde que empezó: memoria de GPU y uso de GPU para cada una de sus GPU, procesador (100% es un núcleo, así que cuatro núcleos ocupados son 400%) y memoria (plegado en un teléfono hasta que lo abras). **Log** muestra su salida, con lo más nuevo abajo. Mientras se ejecuta, **Seguir** mantiene a la vista lo más nuevo; desplázate hacia arriba para leer y deja de seguir. **Buscar en el registro** muestra solo las líneas que coinciden (“12 líneas coinciden”), y mientras tanto el seguimiento se pausa.

Una ejecución que falló, o que desapareció, tiene arriba **Preguntar por qué a un agente** (en el menú ⋯ en un teléfono): una nueva sesión en la carpeta de la ejecución lee su registro de datos y su log, dice la causa en dos frases y propone el arreglo más pequeño. No cambia ni empieza nada antes de que tú lo digas.

**Detener** envía Ctrl-C a los programas de la ejecución y, si no han terminado después de 10 segundos, o de los segundos que pidió la ejecución (consulta [Detener y continuar](#stopping-and-carrying-on)), los detiene a la fuerza. Una ejecución que solo esperaba se saca de la cola al instante.

**Eliminar el registro** pregunta primero y dice qué se va a borrar: el registro de la ejecución y su log, y los archivos que escribió en su propia carpeta de ejecución (la que encuentra como `$HYDOR_RUN_DIR`, como puntos de control y puntuaciones por ejemplo; las copias de su código también se van, sin contarse, salvo lo que la ejecución dejó en una; los enlaces de una copia se eliminan, nunca aquello a lo que apuntan), con cuántos son, su tamaño y los nombres de hasta tres, los más grandes primero. Lo que escribió en la carpeta del proyecto se queda. Cuando esos archivos superan los 100 MB, también aparece **Conservar esos archivos**: el registro se elimina de todos modos, los archivos se mueven a `kept-runs/` y el identificador de la ejecución en la carpeta de datos de Hydor, junto a su carpeta de experimentos, y la ventana dice a dónde fueron. Eliminar una copia de una ejecución que otra de tus máquinas conserva solo quita la copia, y una ejecución de un clúster deja en el clúster lo que escribió.

## El agente de guardia

En **Más opciones** → **Agente de guardia**:

- **Desactivado** (al principio): lo que sale mal se anota igualmente en la página de la ejecución.
- **Avisarme**: una notificación cuando ocurre.
- **Un agente lo investiga**: un agente empieza una sesión en la carpeta de la ejecución con lo que pasó, el final del log, el registro de la ejecución y **Qué puede hacer el agente**, tus reglas para él. Actúa dentro de ellas y luego te cuenta en pocas líneas qué pasó y qué hizo. La página de la ejecución enlaza con su sesión.

Vigila lo siguiente (todo, a menos que desmarques algo): **NaN** (una métrica que se vuelve NaN o infinita, o una pérdida NaN en el log), **Memoria agotada** (los mensajes de CUDA y `OutOfMemoryError`, o el programa terminado a la fuerza con código de salida 137 por memoria), **Un bloqueo** (sin salida nueva durante 30 minutos, o los minutos que definas), **Un fallo** (un código de salida distinto de 0, o un proceso que murió) y **Divergencia** (una pérdida de más del doble de su mejor valor, cinco lecturas seguidas).

Si se deja vacío, las reglas son: “Lee el log y el código. Si una solución es clara y segura, vuelve a ejecutarla con experiment_run (desde el último checkpoint si lo hay), cambiando lo menos posible. Nunca elimines archivos ni checkpoints. Luego cuéntale al usuario en pocas líneas qué pasó y qué hiciste.” El agente es el que inició la ejecución (cuando lo hizo un agente); si no, el agente y el modelo que elegiste por última vez en la página de inicio. Un solo agente investiga una ejecución a la vez, y como máximo tres entran de guardia en una hora: pasado ese límite, se te avisa a ti.

## Notificaciones

Recibes avisos cuando una ejecución termina o falla (a menos que los desmarques), cuando una métrica cruza el valor que definiste y de parte del agente de guardia. Una notificación abre la página de la ejecución. Un barrido te avisa una sola vez, cuando todas sus ejecuciones han terminado, con su mejor configuración (promediando sus semillas), o con el número que dieron todas sus ejecuciones cuando dieron el mismo; su aviso abre el experimento del barrido en su pestaña **Hiperparámetros**. En diez minutos llegan como máximo ocho avisos sobre ejecuciones; a partir de ahí, uno te dice cuántos más hubo.

Sin el agente de guardia igualmente se te avisa, una vez por ejecución, cuando una ejecución no ha impreso nada durante 30 minutos o su pérdida se ha vuelto NaN. Una sesión que pidió que le informaran sobre la ejecución (report) recibe de inmediato el aviso de un NaN, un bloqueo o una pérdida que sube, como **Experimentos · Una ejecución necesita revisión**.

Una ejecución que un agente empezó con “avísame cuando termine” (report) también envía un mensaje a esa sesión cuando termina, para que su agente pueda continuar desde allí. Las ejecuciones de una misma sesión que terminan con poca diferencia, o mientras su agente está trabajando, se comunican en un solo mensaje, bajo los nombres de sus experimentos, con los números más importantes. Las ejecuciones que solo difieren en la semilla ocupan una línea, con la media y la dispersión de cada número entre ellas, y se menciona allí si alguna semilla falló o se detuvo. Cuánto tardó una ejecución se indica cuando fue un minuto o más, o cuando falló; después de 20 líneas, el mensaje cuenta lo que queda en cada experimento. El mensaje llega después del turno del agente cuando está trabajando, y se omite una ejecución que el agente ya haya leído desde que terminó; en la conversación aparece como una sola fila, **Experimentos · Ejecuciones terminadas**, que se abre con un clic. Es un aviso de la propia app, no un mensaje tuyo, así que no se le añade nada de la memoria ni de la wiki (ni a los mensajes de un objetivo).

## Títulos, descripciones y categorías

Cada experimento tiene un título (unas pocas palabras sencillas: qué se entrena o se evalúa, con qué y qué se varía), una descripción (de una a tres frases) y una categoría (de una a tres palabras que nombran el área o la tarea, como “Modelado del lenguaje”). Se muestran en su página, en la columna y en las tarjetas de Resumen, de modo que un nombre como `e7-pretrain` se convierte en una línea que entiendes, y el cuadro de búsqueda (Ctrl+K) y **Buscar un experimento** encuentran un experimento por ellos.

Quién los escribe:

- **El modelo auxiliar** ([Configuración → Agentes → Modelos](/settings?s=models&find=Helper%20model)) los escribe para un experimento que no los tiene, poco después de su primera ejecución (y para tus experimentos más antiguos, un poco después de que arranca la app). Lee los nombres, comandos, hiperparámetros y nombres de métricas de algunas de sus ejecuciones. Cuando los escribió y el experimento ha crecido hasta el doble de sus ejecuciones (al menos 4), los escribe de nuevo, como máximo una vez cada seis horas.
- **Un agente** que inicia ejecuciones le da al experimento un título, una descripción y una categoría cuando inicia las primeras ejecuciones, y otra vez cuando cambia lo que prueba (la herramienta experiment_describe).
- **Tú**: **Editar el título y la descripción** en el menú ⋯ del experimento abre una ventana con **Título**, **Descripción** y **Categoría** (sugiere las categorías que ya están en uso). **Escribirlos de nuevo** le pide una versión nueva al modelo auxiliar, que reemplaza lo que hay.

Lo que escribiste tú o un agente nunca se sobrescribe automáticamente; solo lo hace **Escribirlos de nuevo**. Las ejecuciones de una [sesión confidencial](/guide/sessions#keep-a-session-confidential) las lee únicamente un modelo auxiliar que se ejecuta en esta computadora; si no hay ninguno, su experimento se queda como está.

## Comparar ejecuciones

Marca la casilla de cada ejecución que quieras en una tabla de ejecuciones (la casilla del encabezado de la tabla marca todas las que se muestran). Una barra en la parte inferior dice “3 elegidas” y ofrece **Comparar** (para 2 ejecuciones o más, hasta 8), **Marcar con estrella** (o **Quitar estrella**), **Archivar** (o **Recuperar**), **Detener** (cuando algunas se están ejecutando o esperan; pregunta primero y dice cuántas), **Eliminar** (las terminadas, con la misma ventana que **Eliminar el registro** de una ejecución), **Crear una tabla** y × para desmarcarlas todas. En un teléfono están detrás de **Acciones**, en una hoja desde abajo. Las ejecuciones que marcaste siguen marcadas mientras te mueves entre experimentos, así que puedes comparar ejecuciones de distintos experimentos. **Comparar** abre una ventana, “Comparar 3 ejecuciones”, con:

- Las ejecuciones, cada una con el color de su línea.
- **Métricas**: todas las métricas que tenga alguna de ellas, una columna para cada ejecución y lo mejor de cada fila en negrita. Se muestran las primeras 15; **Todas N** muestra el resto.
- **Hiperparámetros**: el experimento, el comando, la carpeta, dónde se ejecutó, el commit, la semilla y las GPU, y cada hiperparámetro, lado a lado. **Solo lo que difiere** (activado al principio) omite las filas que son iguales en todas las ejecuciones; una diferencia aparece marcada.
- **Gráficos**: las curvas de las ejecuciones, un gráfico para cada métrica, una línea para cada ejecución.

El menú ⋯ de un experimento también tiene **Comparar las últimas 6**, y su pestaña **Hiperparámetros** tiene **Comparar las 6 mejores**.

Antes de dar por buena una mejora, **Intentar refutarlo**, en la parte inferior de esa ventana, hace que un agente que no participó en el trabajo intente encontrarle otra explicación. Revisa **El resultado que se va a poner a prueba** (una frase, rellenada a partir de las ejecuciones elegidas: cámbiala para que diga lo que quieres decir), elige la **Línea base** y quién lo ejecuta (**La ejecuta**), y haz clic en **Empezar**. El agente busca otras explicaciones (semillas con suerte, una línea base sin ajustar, una filtración de datos, un error en una métrica), hace pruebas de control en un experimento aparte, sobre una copia de tu código y pidiendo permiso antes de usar mucho tiempo de GPU, no repara nada y responde “Se sostiene”, “Se sostiene en parte” o “No se sostiene” junto con lo que intentó (las ejecuciones en otras máquinas quedan fuera).

## Evaluaciones: puntuar siempre de la misma forma

Una evaluación es la manera en que un proyecto lleva la puntuación: un comando y un número, sellados, para que cada ejecución y cada agente se puntúen igual. Los archivos que forman el evaluador y los datos con los que se compara quedan sellados, no se da ninguna puntuación mientras difieran, y la app calcula cada puntuación a partir de su propia ejecución del comando sellado, así que puedes comparar dos números sin preguntarte cómo se obtuvo cada uno.

En una computadora, la columna las muestra bajo **Evaluaciones**, encima de los experimentos, cada una con su última puntuación y cómo queda frente a la línea base (“0.431 · 0.019 mejor”), “Todavía sin puntuación”, “Puntuando…” mientras se ejecuta una, “Evolucionando · 37 de 200” mientras [Evolucionar](#evolve-searching-for-a-better-version) trabaja en ella, o “cambiada” con una marca ámbar cuando sus archivos son distintos. En un teléfono son tarjetas en la parte superior de la vista general.

### Configurar una

Haz clic en **Más** (⋯), arriba, y luego en [**Nueva evaluación**](/experiments?new=evaluation). La ventana tiene cuatro partes:

- **Qué puntúa**: su **Nombre**, la **Carpeta** (un proyecto, normalmente un repositorio git), el **Comando que puntúa** (como `python eval.py --split dev --seed {seed}`: escribe `{seed}` donde va la semilla, para puntuar con varias semillas), **El número que cuenta** tal como lo imprime el comando (`ndcg@10` para `ndcg@10=0.412`), y **Más es mejor** o **Menos es mejor**.
- **Qué no debe cambiar**: los archivos y carpetas que forman el evaluador y sus datos. Escribe uno y haz clic en **Añadir**, o toca los que aparecen en **Sugerido a partir de tu comando**. Con `{seed}` en el comando, **Semillas** indica cuáles (1, 2, 3, a menos que las cambies).
- **Prueba final** (opcional): su propio comando y una **Carpeta reservada** fuera del proyecto, que solo recibe la prueba final: los agentes que trabajan en el proyecto no la ven allí. El comando la encuentra como `$HYDOR_HELD_OUT`.
- **Dónde se ejecuta**: las GPU que necesita cada ejecución, su memoria libre y un límite de tiempo. Sus ejecuciones esperan en la cola de esta computadora como cualquier otra.

**Crear y sellar** sella los archivos (las carpetas grandes tardan un rato) y abre la página de la evaluación. ¿No sabes bien qué poner? **Configurarla con un agente**, en la parte superior de la ventana, inicia una petición en esa carpeta: el agente lee cómo entrenas y evalúas y propone la evaluación, que solo se crea si dices que sí.

### La página de la evaluación

Debajo de su nombre están el número, qué sentido es mejor, las semillas y el comando (tócalo para verlo completo), y luego “Sellada el 24 nov: 4 archivos, todo como estaba”. Después hay tres recuadros:

- **Línea base**: la puntuación con la que se comparan las demás. Al principio dice “Aún sin medir”: haz clic en **Medir la línea base**. **Volver a medir** está en su menú.
- **Última puntuación**: su número, su rama y cómo queda frente a la línea base (“0.019 mejor que la línea base”; “Igual que la línea base, dentro del ruido” cuando la diferencia bien podría ser azar), con la frecuencia con la que el azar por sí solo daría esa diferencia.
- **Prueba final**: **Añadir uno**, **Ejecutar la prueba final…**, o su número y cuántas veces se ha ejecutado desde que se selló.

Con dos puntuaciones o más, un gráfico muestra cada una a lo largo del tiempo, con su dispersión entre semillas y la línea base como una línea discontinua. **Evolucionar…**, en el menú ⋯ de la página, inicia la búsqueda de una versión mejor ([Evolucionar](#evolve-searching-for-a-better-version)), y cuando ya hay alguna, **Evolucionar** las muestra entre el gráfico y las puntuaciones. **Puntuaciones** las muestra de la más nueva a la más antigua: cuándo, dónde (rama y commit, “con cambios sin commit” si los había), quién la pidió, la puntuación y cómo se compara. El menú de una puntuación abre sus ejecuciones, la usa como línea base (**Usar como línea base**), la detiene o la elimina. Al eliminar una puntuación, o la evaluación (**Eliminar…** en el menú ⋯ de la página), también se eliminan sus ejecuciones, y se indica lo que escribieron en sus propias carpetas de ejecución, con **Conservar esos archivos** cuando eso supera los 100 MB, como al eliminar una ejecución. Cuando una puntuación falló porque el comando no imprimió el número, se muestran los nombres que sí imprimió: toca uno para usarlo en su lugar (se vuelve a sellar).

**Puntuar ahora** puntúa la carpeta. Cuando el repositorio tiene worktrees de git, pregunta “¿Puntuar lo que hay en qué carpeta?”: la propia carpeta o uno de los worktrees, según su rama. Una evaluación puede puntuar su propia carpeta, una carpeta dentro de ella o un worktree de git del mismo repositorio.

### Cuando cambian los archivos sellados

Si un archivo sellado difiere, un aviso ámbar indica cuál, y las puntuaciones esperan hasta que vuelvan a estar como antes:

- **Ver qué cambió**: cada archivo marcado como Changed, Missing o New file, con lo que cambió en él.
- **Restaurarlos**: escribe las copias selladas encima y dice qué no pudo restaurar y por qué (los archivos añadidos después se quedan).
- **Volver a sellar…**: acepta los archivos tal como están ahora. Las puntuaciones anteriores ya no se comparan con las nuevas (se conservan, plegadas bajo **Antes de que se volviera a sellar**), y hay que medir de nuevo la línea base. Cambiar el comando, el número o los archivos sellados con **Editar…** también vuelve a sellar.

### La prueba final

**Ejecutar la prueba final…** (en su recuadro o en el menú de la página) dice qué tan bien funciona realmente tu trabajo con datos sobre los que no se ajustó nada. Cada vez que miras te dice un poco menos, así que ejecútala cuando creas que has terminado; la ventana indica cuántas veces se ha ejecutado desde que se selló. Cuando hay worktrees de git, también pregunta sobre cuál se ejecuta (**Sobre lo que hay en**).

### Lo que pueden hacer los agentes

Los agentes pueden leer las evaluaciones, pedir una puntuación de su carpeta (la app ejecuta ella misma el comando sellado; ellos informan ese número, no uno propio; si todavía no hay línea base, la respuesta también da las últimas puntuaciones de otras carpetas y ramas, para que puedan comparar sin volver a ejecutarlas), proponer una evaluación nueva (ves cada parte en una tarjeta y solo se crea si dices que sí) y restaurar los archivos sellados. No pueden crear ni sellar una por su cuenta, fijar la línea base, ni ejecutar o leer la prueba final. Mientras se haya alcanzado tu [límite de horas de GPU de los agentes](#what-agents-may-use-gpu-hours), sus puntuaciones de una evaluación que usa una GPU se rechazan.

Las ejecuciones iniciadas en la carpeta de una evaluación indican en su página si sus archivos estaban como al sellarse cuando empezaron, y la tabla de ejecuciones marca con un signo ámbar aquellas en las que no lo estaban. Una ejecución que sirvió para puntuar una evaluación lleva de vuelta a ella.

## Evolucionar: buscar una versión mejor

Evolucionar prueba muchos cambios pequeños en los archivos que indiques, puntúa cada uno con la evaluación y conserva el mejor. Tus propios archivos no se tocan: cada cambio se prueba en una copia propia de la app, creada a partir de tu último commit. Usa el [modelo auxiliar](/guide/agents-models#choose-the-helper-model) de la app para escribir los cambios, basando cada uno en una de las mejores versiones encontradas hasta el momento.

Vale la pena para un archivo cuya calidad la evaluación pueda medir bien: una heurística, una función de puntuación, un prompt, una rutina lenta. No la vale cuando la evaluación es débil (pocos ejemplos, un número fácil de manipular): una búsqueda encuentra los puntos débiles de aquello que la puntúa, así que define una [prueba final](#the-final-test) con datos que la búsqueda nunca vea.

### Empezar una

Abre la página de la evaluación, haz clic en ⋯ y en **Evolucionar…**. La ventana pregunta:

- **¿Qué puede cambiar?** Escribe un archivo y haz clic en **Añadir**, o toca los de **Sugeridos**: hasta 8 archivos de texto que estén en un commit y no tengan cambios desde entonces. Un archivo que la evaluación protege no se puede cambiar: se te avisa.
- **¿Qué debería probar?** (opcional): unas líneas, como “Haz que el reordenador sea más rápido sin perder nDCG@10”.
- **Cuántos intentos**: 50, 100, 200, u **Otros** para un número propio (de 10 a 2000).
- **Inicio**: **Cuando haya una GPU libre** o **Esta noche**: entonces trabaja solo en tus horas de noche (consulta [Ejecuciones que esperan a la noche](#runs-that-wait-for-the-night)), durante tantas noches como necesite. De día dice **Espera a la noche (desde las 23:00)** y no le pide nada al modelo, **Detener después de (horas)** cuenta solo las noches, y el aviso de la mañana dice hasta dónde llegó.
- En **Más**: **Detener después de (horas)**, **Cuántos a la vez** (de 1 a 4) y **Detener cuando esta cantidad de intentos seguidos no aporte nada mejor** (40 si no lo cambias).

Haz clic en **Empezar**. Primero puntúa tu punto de partida, con todas las semillas de la evaluación, y luego empieza. Una evaluación sin línea base muestra **Medir la línea base** en lugar de **Empezar**.

### Leer su página

Su fila en **Evolucionar**, en la página de la evaluación, dice “En ejecución · 37 de 200 probados”, “Terminada · 0.035 mejor que el inicio” o “Detenida”; haz clic en ella para abrirla. Arriba están su propósito, su estado (como “Terminada: ningún nuevo mejor en los últimos 40”) y **Pausar** o **Reanudar**, **Detener** (después no se puede reanudar) y ⋯ con **Eliminar…** (sus intentos, las puntuaciones de estos y las copias de trabajo desaparecen; una rama que hayas tomado se queda; indica lo que sus ejecuciones escribieron en sus propias carpetas de ejecución, con **Conservar esos archivos** cuando eso supera los 100 MB). A continuación hay tres recuadros:

- **Punto de partida**: la puntuación de tu versión.
- **Lo mejor hasta ahora**: la mejor puntuación, cuánto mejor que el punto de partida es, una línea sobre qué cambió y **Ver el cambio**.
- **Probados**: cuántos de cuántos, cuántos fallaron y cuántas veces se consultó a un modelo.

Un gráfico muestra todos los intentos en orden: una primera puntuación rápida (**Solo la primera semilla**) se ve más clara que una comprobada con **Todas las semillas**, los intentos fallidos son marcas en la parte inferior, **Lo mejor hasta ahora** es una línea escalonada y el **Punto de partida** una discontinua. Haz clic en un punto para abrir ese intento.

**Qué probó** los muestra, del más reciente al más antiguo: qué cambió cada uno, su puntuación (o por qué falló), cómo queda frente al punto de partida, en qué versión estaba **Basado en** y el **Modelo** que lo escribió (**Rápido**, o de vez en cuando **Potente**). Un intento recibe primero una puntuación rápida, con una semilla; solo el que supera al mejor de su línea de trabajo se comprueba con todas ellas, y solo esa puntuación completa puede convertirlo en el mejor. **Nuevo mejor** marca los que eran los mejores cuando se puntuaron, y **Mejor** el mejor de ahora. Abre un intento para ver su cambio, archivo por archivo, y **Tomar este**.

### Tomar el mejor

**Tomar el mejor** (y **Tomar este**) pregunta primero y luego crea una rama en tu repositorio con esa versión: los archivos que tienes en tu copia de trabajo no se tocan. La página conserva “Tomado como <branch>”, que la abre en la [página de Git](/git). Si vuelves a tomar una, se añade un commit a la misma rama.

La prueba final no ha visto la versión que tomaste. Para comprobarla allí, cambia tu carpeta a la rama (o crea un worktree de git de ella) y haz clic en **Ejecutar la prueba final…** en la página de la evaluación.

### Lo que cuesta

Cada intento ejecuta la evaluación (una semilla y, cuando es prometedor, todas) y consulta a un modelo una vez, o dos cuando su primera respuesta no se puede usar. Con GPU, sus ejecuciones esperan en la cola como cualquier otra. **Pausar** detiene los intentos nuevos, y **Detener después de (horas)** y el límite de intentos seguidos sin nada mejor evitan que siga sin sentido.

Los agentes pueden empezar una con tu sí en una tarjeta (que dice cuántas horas de GPU puede usar como máximo cuando la evaluación tiene un límite de tiempo) y leer cómo va. No pueden eliminarla, ni empezar o reanudar una que usa una GPU mientras se haya alcanzado tu [límite de horas de GPU de los agentes](#what-agents-may-use-gpu-hours). Una que ya está en marcha espera en el límite, sin contar su tiempo: su página dice por qué y tiene **Dejar que se ejecute**.

## Tablas de resultados para tu artículo

**Crear una tabla** (a partir de ejecuciones marcadas, del menú ⋯ de un experimento o de su pestaña **Hiperparámetros**) muestra la tabla como la eliges:

- **Columnas**: las métricas. Haz clic en una para añadirla o quitarla, y en su flecha para cambiar qué sentido es el mejor.
- **Filas**: **Una fila por experimento**; **Una fila por comando**, que distingue las ejecuciones de distintos scripts u opciones aunque sus hiperparámetros sean iguales (la semilla se quita de cada comando, y también lo que solo dice dónde escribe o desde qué checkpoint sigue, así que las semillas de un comando forman una sola fila, nombrada por su script; si no, por las opciones que cambian; y si no, por el comienzo del comando); o una fila por cada valor de un hiperparámetro que varíe entre las ejecuciones (**Una fila por valor de lr**).
- **Línea base**: la fila contra la que se prueban las demás (la primera fila, salvo que elijas otra).
- **Prueba frente a la referencia**: **Elegir por mí** (pareada sobre ejemplos cuando las ejecuciones guardaron puntuaciones por ejemplo; si no, pareada sobre semillas cuando las ejecuciones de las filas comparten sus semillas; si no, la prueba t de Welch sobre semillas), **Prueba t de Welch sobre semillas**, **Prueba t pareada (por semilla o por ejemplo)**, **Bootstrap pareado sobre ejemplos** o **Sin prueba**.
- **Leyenda**.

Cada celda es la media ± la desviación estándar de las ejecuciones de la fila (sus semillas); lo mejor de cada columna va en negrita; una daga (†) marca una celda que es mejor que la línea base con p < 0,05, tras la corrección de Holm por probar varias filas, y una doble daga (‡), una que es peor. Cuando las semillas apenas cambian un número (sale igual, o casi, con todas las semillas) y las ejecuciones no conservaron puntuaciones por ejemplo, esa comparación no lleva marca: una nota bajo la tabla dice que una prueba sobre semillas aporta poco y que conviene comparar por ejemplo. Una fila cuyas puntuaciones por ejemplo son las de la línea base en todos los ejemplos cuenta como igual, y una nota bajo la tabla lo indica (en el Markdown que copias, esas dos notas van en letra pequeña bajo la tabla; en el LaTeX, en un comentario). Con una fila por cada valor de un hiperparámetro, las ejecuciones que no lo tienen forman una sola fila, nombrada así (**ranker not set**). Pasa el cursor sobre una celda para ver sus valores p. Una línea bajo la tabla dice qué prueba se hizo y qué quedó fuera (ejecuciones que no han terminado o que no llegaron a completarse, o sin estas métricas, nombradas junto con lo que informan en su lugar). Las notas de ahí también dicen cuándo las ejecuciones de las filas no ejecutaron todas el mismo código, y cuándo las ejecuciones de una fila nombran distintos checkpoints.

Después:

- **Copiar LaTeX**: una `table` con las reglas de booktabs (añade `\usepackage{booktabs}` a tu preámbulo), lo mejor en `\textbf`, `$\pm$`, dagas y dobles dagas, y una leyenda que dice cómo se leen las celdas.
- **Copiar Markdown** y **Descargar CSV** (la media, la desviación estándar, el número de ejecuciones, los valores p y el veredicto de cada métrica: mejor que la línea base, peor o igual, lo que significa que la prueba no encontró diferencias).
- **Incluirla en un documento LaTeX**: elige uno de tus documentos LaTeX (guardado en los archivos de un proyecto o con su conversación) y luego uno de sus archivos. La tabla va antes de `\end{document}` (o al final de un archivo que no lo tenga), o en lugar de la tabla que se creó allí antes, conservando tu propia leyenda y etiqueta. Se guarda como una versión nueva del documento, igual que tus propias ediciones.

Una tabla se conserva cuando la copias o la incluyes en un documento. Su LaTeX lleva una línea `% hydor:table <id>` justo encima de su tabular: déjala ahí, para que la comprobación antes de enviar pueda volver a calcular los números a partir de las ejecuciones y decir cuáles cambiaron. **Tablas de resultados**, en el menú (⋯) de la parte superior de la página, enumera las tablas conservadas: abre una para copiarla o colocarla de nuevo, o **Volver a calcular** a partir de sus ejecuciones tal como están ahora.

Para pruebas pareadas sobre ejemplos (consultas en recuperación de información, oraciones en traducción), una ejecución escribe un archivo de puntuaciones por ejemplo y lo indica en **Puntuaciones por ejemplo**: líneas JSON con un `id` (o `qid`, `query`, `example`) y un número por métrica, como `{"id": "q12", "ndcg@10": 0.53}`, o las líneas de trec_eval -q. Puede tener marcadores `{name}`, como el comando (`{run}` es el id de la ejecución), y puede empezar por `$HYDOR_RUN_DIR/`, la carpeta propia de la ejecución; el archivo se conserva con la ejecución cuando termina. Una ejecución que escribe `scores.jsonl` en `$HYDOR_RUN_DIR` no necesita nombrarlo en absoluto, así que las ejecuciones de un barrido conservan cada una el suyo.

## Barridos

Un barrido es un comando con un marcador para cada hiperparámetro, ejecutado una vez por cada combinación de sus valores. Haz clic en **Más** (⋯) arriba y luego en [**Nuevo barrido**](/experiments?new=sweep) (o **Nuevo barrido en este experimento** en el menú de un experimento, o **Un barrido** en Nueva ejecución):

1. Escribe el comando con `{name}` donde va el valor de cada hiperparámetro: `python train.py --lr {lr} --batch {batch}`.
2. En **Hiperparámetros y sus valores**, da a cada hiperparámetro sus valores: `lr` y `0.001, 0.0003, 0.0001`. **Añadir un hiperparámetro** para otro más.
3. Elige **Todas las combinaciones**, o **Una muestra aleatoria** de ellas (**como máximo** N ejecuciones).
4. Para detener las ejecuciones que no van a ganar, configura **Detener ejecuciones antes por** una métrica y qué sentido es el mejor: una ejecución cuya métrica en un paso sea peor que la mediana de las demás ejecuciones en ese paso se detiene (**Detenida antes de tiempo**), una vez que otras tres hayan llegado a ese paso. También funciona con un barrido enviado a otra de tus máquinas: esta computadora lo evalúa mientras sigue las ejecuciones allí.
5. Dale un nombre a su **Experimento** y haz clic en **Empezar N ejecuciones**.

Las ejecuciones del barrido son un experimento como cualquier otro: su tabla de ejecuciones tiene una columna para cada hiperparámetro, su pestaña **Gráficos** dibuja las curvas y su pestaña **Hiperparámetros** muestra cómo fue el barrido: su mejor ejecución (según la métrica que elijas, el mejor valor o el último de cada ejecución), qué hiperparámetros importan más y cada uno frente a la métrica. Desde ahí, **Crear una tabla** o **Comparar las 6 mejores**. El aviso que dice que un barrido ha terminado abre esa pestaña.

## Dónde van las ejecuciones

**Más** (⋯) en la parte superior → [**Dónde van las ejecuciones**](/experiments?places=1):

- **Esta computadora**: sus GPU, **Trabajos sin GPU: como máximo N a la vez** (al principio, la mitad de sus hilos, de 1 a 16; un número que fijes se mantiene), **Las ejecuciones comparten una GPU cuando su memoria cabe** (activado salvo que lo desactives; consulta [Cómo elige la cola](#how-the-queue-chooses)), **Ejecuciones de los agentes: como máximo N horas de GPU en siete días** (vacío para no poner límite; consulta [Qué pueden usar los agentes](#what-agents-may-use-gpu-hours)) y su noche: **Noche de** y **para**, y **Cuando termina la noche** (consulta [Ejecuciones que esperan a la noche](#runs-that-wait-for-the-night)).
- **Otras máquinas**: las de [Configuración → Máquinas](/settings?s=machines) que están conectadas. Una ejecución enviada a una de ellas se conserva y se vigila allí: su agente de guardia y sus avisos son los de esa máquina (sus avisos te llegan aquí, como todos los de esa máquina), y esta página la sigue. La lista de aquí muestra también las ejecuciones de todas las máquinas conectadas, marcadas con el lugar donde se ejecutan; al abrir una se lee allí, y **Detener** la detiene allí.
- **Clústeres**: computadoras a las que accedes por SSH, donde no hace falta instalar nada.

### Añadir un clúster

Haz clic en [**Añadir un clúster**](/experiments?cluster=new) e indica:

- **Nombre** y **Host SSH**: tal como lo escribirías después de `ssh`, una entrada de tu `~/.ssh/config` o `me@login.cluster.edu`. El servidor de la app se conecta con sus propias claves SSH y nunca pide una contraseña, así que necesita una clave allí que funcione sin ella (`ssh-copy-id`), y que la clave de host del clúster sea conocida (conéctate una vez con `ssh` desde una terminal).
- **SLURM** o **SSH simple**.
- **Carpeta allí para los logs de las ejecuciones** (`~/hydor-runs` para empezar) y, para SLURM, su **Partición** y su **Cuenta**.
- **Líneas de preparación**, que se ejecutan antes de cada trabajo allí: `module load cuda/12.1`, `source ~/venvs/ml/bin/activate`.

**Comprobar** prueba `ssh host true`, y después `sinfo` (que lista las particiones) para SLURM, o `nvidia-smi` y tmux para SSH simple. **Añadir** lo guarda; en la lista, cada clúster tiene **Comprobar** y **Quitar**.

Un trabajo para un clúster se ejecuta en una carpeta de allí (el código ya debe estar: clónalo allí). En **SLURM**, la app escribe un script por lotes con lo que necesita el trabajo (sus GPU como `--gres=gpu:N`, procesadores, memoria, las horas como `--time`, la partición y la cuenta), tus líneas de preparación y el comando. Antes de enviarla, consulta al clúster sobre ella con `sbatch --test-only`. Una solicitud que el clúster rechaza (ningún nodo tiene lo que pide, no existe esa partición, pide más tiempo del que permite la partición, hay un problema con la cuenta) falla de inmediato, con la explicación en palabras sencillas y, después, la línea del propio clúster. Cuando se acepta, la estimación prudente del clúster sobre cuándo empezaría aparece en su estado (“En la cola del clúster. La estimación prudente del clúster para empezarla es el lunes a las 02:15; a menudo empieza mucho antes”): en un clúster muy ocupado esa estimación puede indicar días de más para un trabajo que empieza en segundos, así que no hagas planes con ella. Si un clúster tiene un sbatch sin `--test-only`, o tarda más de 20 segundos en responder, se le envía el trabajo sin esa consulta.

Mientras espera, su estado dice por qué, con la palabra de SLURM y en términos sencillos (“hay otros trabajos antes (Priority)”), y, en cuanto squeue da una, cuándo prevé empezar, actualizado cuando eso cambia más de diez minutos. La app lo sigue con squeue y sacct, copia aquí su log a medida que crece, lee con él las líneas nuevas de su **Archivo de métricas** (que el archivo aún no exista no es un error), trae de vuelta sus puntuaciones por ejemplo cuando termina, y **Detener** lo cancela con scancel (una ejecución que pidió segundos de aviso recibe antes Ctrl-C, con `scancel --signal=INT --full`). Cuando termina mal, el estado dice cuál fue el caso y qué hacer: alcanzó el límite de tiempo del clúster (dale más horas, o una forma de continuar), el clúster la detuvo por memoria (y cuánta había pedido; algunos clústeres permiten que un trabajo se pase usando el disco como memoria de intercambio en lugar de detenerlo), el clúster recuperó su lugar (desalojada) o se canceló allí. El límite de tiempo propio de SLURM no da ningún aviso de la app.

Con **SSH simple**, las GPU se eligen allí igual que aquí (pero nunca se comparten: una GPU por cada una de tus ejecuciones), y la ejecución va dentro de tmux allí. La app también aplica allí su **Límite de tiempo (horas)**, con el aviso, mientras la app esté en funcionamiento, y lee su archivo de métricas y sus puntuaciones del mismo modo. Se mantiene abierta una conexión SSH por clúster, así que seguir las ejecuciones cuesta poco.

## En un teléfono

No hay columna: la vista general empieza con la cola, las GPU y **Buscar un experimento**, y muestra las evaluaciones (cuando tienes algunas) y los experimentos como tarjetas. Un experimento, una evaluación y una ejecución se abren en su lugar, con una flecha para volver. Una tabla de ejecuciones se desplaza de lado, y la casilla y el nombre de cada ejecución siguen a la vista; las ejecuciones de los gráficos son una fila de etiquetas encima de ellos, y **Suavizado** está en el menú **Opciones del gráfico**. El log de una ejecución se ajusta al ancho de la pantalla, y **Seguir** funciona como en una computadora. Nueva ejecución, Comparar y las tablas se abren desde la parte inferior de la pantalla.

## Pide a un agente

- "Entrena esto en una GPU libre y avísame cuando termine."
- “Ejecuta estas seis evaluaciones, de 7 GB cada una, para que compartan las GPU.”
- “Planifica las tres semillas de estas cuatro configuraciones, pídeme una sola vez las horas de GPU que necesitan y después ejecútalas.”
- “¿Por qué mi ejecución sigue esperando y cuándo empezará?”
- “Ejecuta estos tres controles esta noche y cuéntame por la mañana qué mostraron.”
- “Entrena esto esta noche, guarda un punto de control cuando termine la noche y continúa desde él la noche siguiente.”
- “Pon en cola la línea base para esta noche y sigue cambiando el código para el siguiente experimento.”
- "Ejecuta eval.py en el clúster Unity con 2 GPU durante 4 horas."
- "Barre la tasa de aprendizaje con 1e-4, 3e-4 y 1e-3 con las semillas 1, 2 y 3, y detén pronto las ejecuciones malas."
- "¿Por qué falló mi última ejecución? Si la solución es clara, ejecútala de nuevo."
- “Anota en la ejecución de la línea base de ayer que el error del tokenizador todavía estaba presente.”
- “Lee las ejecuciones del experimento de lora y registra lo que demostró, con las ejecuciones como evidencia.”
- “Prueba primero este comando de entrenamiento y dime cuánta memoria y tiempo necesita.”
- "Pon un agente de guardia en este entrenamiento: si se queda sin memoria, reduce a la mitad el tamaño del lote y reanuda desde el último checkpoint."
- "Haz una tabla LaTeX de los experimentos lora: exactitud y F1 frente a la línea base, con significancia, y ponla en mi artículo."
- "¿Cuál de mis ejecuciones de esta semana tuvo la mejor pérdida de validación, y cuáles fueron sus hiperparámetros?"
- “Intenta refutar el resultado de que la nueva función de pérdida supera a la línea base en ndcg@10.”
- "Ponles títulos y descripciones más claros a mis experimentos y ordénalos en categorías."
- "En mi barrido de tasa de aprendizaje, ¿qué hiperparámetros importan más para la pérdida de desarrollo?"
- "Muéstrame las curvas de las 5 mejores ejecuciones del experimento lora."
- “Configura una evaluación para este repositorio.”
- “Puntúa mi rama frente a la línea base.”
- “¿Por qué mi evaluación dice que hay archivos cambiados?”
- “Haz evolucionar la función de puntuación de rank.py frente a mi evaluación, 100 intentos.”
- “¿Cómo va la evolución?”
