# Experimentos

Experimentos ejecuta por ti tus trabajos de entrenamiento y evaluación. Un trabajo espera una GPU con suficiente memoria libre en una de tus máquinas (o espera su turno en la cola de un clúster), se ejecuta por su cuenta y se conserva como registro: su código, hiperparámetros, entorno, log y métricas, y lo que hizo el agente de guardia cuando algo salió mal. Cada experimento (las ejecuciones que comparas juntas) tiene un título, una descripción y una categoría, y su página muestra las ejecuciones como una tabla, sus métricas como gráficos y qué hiperparámetros importan. Compara ejecuciones o crea una tabla de resultados con pruebas de significancia para tu artículo. Los agentes también lo usan: pide a cualquier agente que entrene algo en una GPU libre y empezará una ejecución aquí.

![La página de Experimentos: experimentos por categoría a la izquierda, y la pestaña Gráficos de un barrido: las curvas de sus seis ejecuciones en gráficos compartidos, cada ejecución con su propio color](images/experiments.webp)

## Abrir Experimentos

Haz clic en **Experimentos** en la barra de iconos, o ve a [Experimentos](/experiments).

La primera vez que abres la página, un recorrido corto pensado para quien empieza con los experimentos te la enseña. Aparece mientras los consejos están activados, después del recorrido de bienvenida. Una tarjeta explica en palabras sencillas qué son un experimento y una ejecución, y luego cada parte de la página se ilumina por turno con su propia tarjeta: **Nueva ejecución**, la cola y las GPU, tus experimentos por categoría, seguir una ejecución en vivo, comparar ejecuciones y tablas de resultados, y dejar que un agente haga el trabajo. Avanza y retrocede con **Siguiente** y **Atrás**; **Hecho** lo termina, y **Omitir** o Esc lo cierra antes. **Muéstrame cómo funciona** (el botón de la brújula arriba a la derecha de la página) lo vuelve a empezar cuando quieras.

En una computadora, una columna a la izquierda permanece junto a todo lo que abras aquí:

- La línea de la cola de arriba dice qué está pasando ("2 en ejecución · 1 en espera", o "Nada en ejecución ahora"). Debajo, las GPU de esta computadora como pequeños medidores: la memoria que usa cada una, en el color de acento cuando una de tus ejecuciones la ocupa (apunta a una para ver qué tan ocupada está y qué ejecución la ocupa; haz clic para abrir esa ejecución).
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
- Una línea de recuentos: "23 ejecuciones · 1 en ejecución · 2 en espera · 9 hechas · 6 fallidas · última ejecución hace 2 h" (solo lo que es mayor que cero).
- A la derecha, un menú ⋯, **Este experimento**: **Editar el título y la descripción** y **Escribirlos de nuevo** (consulta [Títulos, descripciones y categorías](#titles-descriptions-and-categories)), **Nueva ejecución en este experimento**, **Nuevo barrido en este experimento**, **Crear una tabla** (de sus ejecuciones terminadas: consulta [Tablas de resultados para tu artículo](#results-tables-for-your-paper)), **Comparar las últimas 6** y **Elegirlas todas** (marca todas las ejecuciones). En un teléfono, una flecha a la izquierda del título vuelve atrás.

Debajo hay tres pestañas: **Ejecuciones** (con cuántas), **Gráficos** e **Hiperparámetros** (cuando el experimento tiene dos ejecuciones o más que difieren en algún hiperparámetro). La pestaña que elegiste por última vez se abre primero la próxima vez, en este dispositivo.

### La tabla de ejecuciones

La pestaña **Ejecuciones** muestra las ejecuciones del experimento como una tabla, con una fila cada una: su nombre, su estado ("En ejecución 54%", "Hecho", "Fallida", "Esperando una GPU"; apunta a un estado de espera para ver por qué), una columna por cada métrica (su último valor; el mejor de cada columna en negrita) y por cada hiperparámetro, luego **Tiempo de ejecución** e **Iniciada**. Cuando las ejecuciones del experimento están en más de un lugar, una columna **Dónde** indica dónde. Primero van las ejecuciones en curso, luego las que esperan, en el orden en que empezarán, y después las que terminaron, la más reciente primero. Haz clic en el nombre de una columna para ordenar por ella (el primer clic en una métrica pone primero la mejor; haz clic de nuevo para invertirlo, y una tercera vez para volver a ese orden). La tabla se desplaza hacia los lados, y la casilla y el nombre de cada ejecución siguen a la vista.

Encima de la tabla:

- **Buscar una ejecución** busca en los nombres, comandos y etiquetas de las ejecuciones.
- **Filtrar**: por **Estado** (**Todas las ejecuciones**, **En ejecución y en espera**, **Hecho**, **Fallidas o perdidas**, **Detenidas**) y, cuando las ejecuciones están en más de un lugar, **Dónde**. Mientras hay una búsqueda o un filtro activo, **× N mostradas** lo quita.
- **Columnas**: marca las métricas y los hiperparámetros que quieres mostrar (un cuadro de búsqueda encuentra uno; un hiperparámetro que difiere entre las ejecuciones dice **Difiere**). **Restablecer** vuelve a las que eligió la página: las métricas que más dicen sobre las ejecuciones y los hiperparámetros que difieren. Cada experimento conserva sus propias columnas en este dispositivo.

Haz clic en una fila para abrir la ejecución. Marca las casillas para comparar ejecuciones (consulta [Comparar ejecuciones](#compare-runs)). La tabla muestra 50 filas; **Mostrar N más** muestra el resto.

### Gráficos

La pestaña **Gráficos** dibuja cada métrica que las ejecuciones imprimen a lo largo de los pasos, un gráfico por métrica, con una línea por ejecución. A la izquierda (encima de los gráficos, en un teléfono) están las ejecuciones en los gráficos: **En los gráficos** con cuántas ("6 de 23"), luego cada ejecución del experimento, con un punto de color cuando se muestra y un anillo vacío cuando no. Haz clic en una ejecución para mostrarla u ocultarla. Se muestran hasta 8 ejecuciones a la vez ("Se muestran hasta 8 ejecuciones a la vez: oculta una primero"). Una ejecución conserva su color mientras se muestra, sin importar qué otras ocultes o muestres, así puedes seguir una ejecución a través de tus cambios; el mismo color la identifica en la tabla de ejecuciones. El menú ⋯ (**Qué ejecuciones se muestran**) tiene **Mostrar las últimas 8**, **Mostrar las mejores 8** (según la métrica principal del experimento), **Mostrar las ejecuciones elegidas** (las que marcaste en la tabla) y **Ocultarlas todas**. Al principio se muestran las primeras 8 ejecuciones que tienen curvas. Cada experimento conserva tu elección en este dispositivo.

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
4. Indica las **GPU** que necesita (0 la ejecuta sin una) y la **Memoria libre de cada una (GB)**. Si lo dejas vacío, espera una GPU que nadie use.
5. Ponle un **Nombre** si quieres (si no, el nombre de su script) y un **Experimento**: las ejecuciones de un experimento se listan, se grafican y se comparan juntas (el cuadro sugiere los que ya tienes).
6. Haz clic en **Inicio**.

**Más opciones** contiene el resto:

- **Hiperparámetros**: líneas nombre=valor (`lr=3e-4`), que se conservan con la ejecución, se muestran como columnas en la tabla de ejecuciones de su experimento y se comparan en tablas. Los hiperparámetros del propio comando se leen solos: `--name value`, `--name=value` y las palabras `name=value` después del programa (como las toma Hydra). `{name}` en el comando toma el valor de un hiperparámetro.
- **Semilla** (`{seed}` en el comando la toma; también se lee `--seed` en el comando), **Prioridad** (la más alta va primero) y **Límite de tiempo (horas)** (se detiene después de ese tiempo).
- **Archivo de métricas**: un archivo en el que la ejecución escribe métricas como líneas JSON, además de lo que imprime. **Puntuaciones por ejemplo**: un archivo con puntuaciones por ejemplo (consulta [Tablas de resultados para tu artículo](#results-tables-for-your-paper)).
- **Avisarme**: **Cuando termina** y **Cuando falla** (ambos activados salvo que los desmarques), y **Cuando una métrica cruza un valor** ("val_acc > 0.9").
- **Agente de guardia**: consulta [El agente de guardia](#the-agent-on-call).
- En un clúster SLURM: **Procesadores**, **Memoria (GB)** y **Partición**.

La nueva ejecución se abre, para que puedas ver cómo empieza. Para añadir una ejecución a un experimento que estás viendo, usa **Nueva ejecución en este experimento** en su menú ⋯: **Experimento** ya viene rellenado. Poco después de la primera ejecución de un experimento, el modelo auxiliar le da un título, una descripción y una categoría (consulta [Títulos, descripciones y categorías](#titles-descriptions-and-categories)).

## Cómo elige la cola

- Los trabajos van por prioridad y luego por antigüedad. Un trabajo que necesita GPU toma las que tienen al menos esa memoria libre y que ninguna otra ejecución tuya ocupa, primero las más libres. Hasta que haya suficientes libres, espera y dice por qué: "Esperando 1 GPU con 20 GB libres: lo máximo libre ahora es 12 GB, en la GPU 2; tus otras ejecuciones ocupan la GPU 0". Un trabajo más pequeño detrás puede empezar antes, cuando lo que necesita está libre.
- Los trabajos sin GPU empiezan de inmediato, unos pocos a la vez; cuántos se define en [Adónde van las ejecuciones](#where-runs-go) (al principio, una cuarta parte de los hilos de la computadora, de 1 a 4).
- Un trabajo que pide más GPU de las que tiene la computadora, o una en una computadora sin GPU NVIDIA, falla de inmediato y lo dice.
- Una ejecución ve solo sus propias GPU (CUDA_VISIBLE_DEVICES); una sin GPU no ve ninguna. También recibe HYDOR_RUN (su id), HYDOR_RUN_DIR (su carpeta) y HYDOR_SEED, y Python imprime de inmediato (PYTHONUNBUFFERED), así que su log avanza a medida que ocurre.
- Las ejecuciones siguen en tmux (o en segundo plano, donde no hay tmux) cuando la app se reinicia o se actualiza. Cuando la app vuelve, las encuentra de nuevo, lee lo que imprimieron mientras tanto y ve cuáles terminaron; una cuyo proceso desapareció se marca como **Desapareció**.

## Qué registra una ejecución

- **Su código**: al empezar, el commit y la rama del repositorio Git de su carpeta y si había cambios sin confirmar; si los había, un parche con ellos (sin los archivos binarios, de 2 MB como máximo), y cuántos archivos Git no rastrea.
- **Su entorno**: la computadora; el Python con el que se ejecuta el comando y las versiones de PyTorch, Transformers, JAX, TensorFlow y NumPy que hay en él (se leen de los paquetes, no se importa nada); con GPU, las versiones de CUDA y del controlador y los nombres de las GPU.
- **Sus hiperparámetros y su semilla**, su **log**, su **código de salida** y su propia carpeta en los datos de la app (su log, parche, código de salida y métricas).
- **Sus métricas**, leídas de su salida a medida que crece: pares `key=value` (`loss=0.42`, como los imprimen las barras de progreso de Lightning), un objeto JSON en una línea (`{"step": 100, "loss": 0.42}`), los diccionarios de Python impresos (como los imprime el Trainer de Hugging Face), el “loss: 0.41 - accuracy: 0.87” de Keras y el archivo de métricas. El paso se toma de `step`, `global_step`, `iter` o `epoch`. De cada métrica guarda el último valor, el mejor (menor es mejor para las pérdidas, los errores, la perplejidad y similares según sus nombres, mayor para las demás) y una serie para los gráficos. Una métrica que se imprime una y otra vez es una curva; un número que se imprime una sola vez es un valor (sus hiperparámetros al principio, sus resultados al final). Guarda hasta 100 métricas: cuando una ejecución imprime más, se conservan sus curvas antes que los números que imprimió una sola vez.
- **Cuánto lleva avanzado**, cuando su salida lo indica: una barra de progreso (la de tqdm, como la dibuja el Trainer de Hugging Face, o una llamada de entrenamiento o de pasos), “step 120/1000”, o un total de pasos que imprime (`total_steps`, `max_steps`, `num_training_steps`…) junto a sus pasos.

## La página de una ejecución

Haz clic en una ejecución (en una tabla, en una tarjeta o en el medidor de una GPU). En una computadora se abre en el lugar del experimento, con la columna todavía a la izquierda; en una pantalla estrecha ocupa toda la pantalla, con una flecha para volver. El camino de vuelta es el enlace de arriba a la izquierda, con el nombre del experimento de la ejecución (**Resumen** para una ejecución sin experimento).

- El encabezado: el nombre de la ejecución; **Detener** mientras se ejecuta o espera (“Deteniendo” mientras lo hace); **Ejecutar de nuevo**, que abre Nueva ejecución rellenada con sus hiperparámetros, para que los cambies antes de empezarla; y **Más** (⋯): **Copiar el comando**, **Su carpeta en Archivos**, **Mostrar en Finder**, **Mostrar en el Explorador de archivos** o **Mostrar en la carpeta** (en la app de escritorio; consulta [Trabajar con archivos y carpetas](/guide/files-git#work-with-files-and-folders)), y, una vez que ha terminado, **Eliminar el registro** (se van su registro, log, parche y métricas; los archivos que el trabajo creó en su propia carpeta se quedan). En un teléfono, **Ejecutar de nuevo** está en el menú ⋯.
- La línea de estado: su estado, con cuánto tardó una vez que ha terminado, su código de salida cuando no es 0, dónde se ejecuta, sus GPU y cuándo empezó. Mientras se ejecuta y su salida indica cuánto lleva avanzado: una barra, los pasos hechos del total (“9.120 de 10.878 · 84%”) y cuánto falta aproximadamente, calculado a partir de lo que ha tardado hasta ahora. Una ejecución que espera o que falló dice por qué.
- Tres pestañas: **Resumen**, **Gráficos** (con cuántas curvas tiene) y **Log**.

**Resumen** contiene:

- **Cómo terminó**, lo primero, para una ejecución que falló o se perdió: las últimas líneas de su log y **Abrir el registro**.
- **Métricas clave**: un icono para cada una de hasta seis métricas que indican qué tan bien funciona (nunca datos auxiliares como la tasa de aprendizaje o el número de tokens), con el último valor, el mejor cuando difiere y una pequeña curva. Haz clic en uno para abrir la pestaña **Gráficos** en esa métrica.
- **Hiperparámetros**: los que se le dieron o que se leyeron de su comando (un cuadro permite buscar uno cuando hay muchos).
- **Valores**: los números que imprimió una sola vez, por nombre: sus hiperparámetros al principio, sus resultados al final. **Todos N** muestra más de doce, con un cuadro para buscar uno.
- **Detalles**: su experimento (un enlace a él), estado, cuándo empezó y terminó, cuánto tardó, dónde se ejecuta, GPU, semilla, prioridad, la sesión que la inició y la ejecución de la que es una nueva ejecución.
- **Código**: el commit y la rama, **Ver los cambios** para el parche (o “Nada ha cambiado desde entonces”) y cuántos archivos Git no rastrea.
- **Comando**: el comando y la carpeta, con **Su carpeta en Archivos**. **Entorno**: la computadora, Python, los paquetes y las GPU.
- **Qué pasó**: sus eventos, con sus horas: cuándo esperó, empezó y terminó, y lo que el agente de guardia vio e hizo, con **Abrir su sesión**.

**Gráficos** dibuja las curvas de la ejecución como lo hace la pestaña de un experimento (consulta [Gráficos](#charts)), solo de esta ejecución, y las vuelve a leer cada pocos segundos mientras se ejecuta. **Log** muestra su salida, lo más reciente abajo. Mientras se ejecuta, **Seguir** mantiene a la vista lo más reciente; si te desplazas hacia arriba para leer, deja de seguir. **Buscar en el registro** muestra solo las líneas que coinciden (“12 líneas coinciden”), y el seguimiento se pausa mientras tanto.

**Detener** envía Ctrl-C a los programas de la ejecución y, si no han terminado después de 10 segundos, los detiene a la fuerza. Una ejecución que solo esperaba se saca de la cola al instante.

## El agente de guardia

En **Más opciones** → **Agente de guardia**:

- **Desactivado** (al principio): lo que sale mal se anota igualmente en la página de la ejecución.
- **Avisarme**: una notificación cuando ocurre.
- **Un agente lo investiga**: un agente empieza una sesión en la carpeta de la ejecución con lo que pasó, el final del log, el registro de la ejecución y **Qué puede hacer el agente**, tus reglas para él. Actúa dentro de ellas y luego te cuenta en pocas líneas qué pasó y qué hizo. La página de la ejecución enlaza con su sesión.

Vigila (todo, salvo que desmarques algo): **NaN** (una métrica que se vuelve NaN o infinita, o una pérdida NaN en el log), **Memoria agotada** (los mensajes de CUDA, `OutOfMemoryError`, o el programa terminado a la fuerza con código de salida 137), **Un bloqueo** (sin salida nueva durante 30 minutos, o los minutos que fijes), **Un fallo** (un código de salida distinto de 0, o un proceso que murió) y **Divergencia** (una pérdida más del doble de su mejor valor, cinco lecturas seguidas).

Si se deja vacío, las reglas son: “Lee el log y el código. Si una solución es clara y segura, vuelve a ejecutarla con experiment_run (desde el último checkpoint si lo hay), cambiando lo menos posible. Nunca elimines archivos ni checkpoints. Luego cuéntale al usuario en pocas líneas qué pasó y qué hiciste.” El agente es el que inició la ejecución (cuando lo hizo un agente); si no, el agente y el modelo que elegiste por última vez en la página de inicio. Un solo agente investiga una ejecución a la vez, y como máximo tres entran de guardia en una hora: pasado ese límite, se te avisa a ti.

## Notificaciones

Te enteras cuando una ejecución termina o falla (salvo que desmarques esas opciones), cuando una métrica cruza el valor que fijaste y por el agente de guardia. Una notificación abre la página de la ejecución. Un barrido avisa una sola vez, cuando todas sus ejecuciones han terminado, con su mejor ejecución; su aviso abre el experimento del barrido en su pestaña **Hiperparámetros**. Como máximo entran ocho avisos sobre ejecuciones en diez minutos; pasado eso, uno te dice cuántos más hubo.

Una ejecución que un agente inició con “avísame cuando termine” (report) también envía un mensaje a esa sesión cuando termina, para que su agente pueda continuar desde ahí.

## Títulos, descripciones y categorías

Cada experimento tiene un título (unas pocas palabras sencillas: qué se entrena o se evalúa, con qué y qué se varía), una descripción (de una a tres frases) y una categoría (de una a tres palabras que nombran el área o la tarea, como “Modelado del lenguaje”). Se muestran en su página, en la columna y en las tarjetas de Resumen, de modo que un nombre como `e7-pretrain` se convierte en una línea que entiendes, y el cuadro de búsqueda (Ctrl+K) y **Buscar un experimento** encuentran un experimento por ellos.

Quién los escribe:

- **El modelo auxiliar** ([Configuración → Agentes → Modelos](/settings?s=models&find=Helper%20model)) los escribe para un experimento que no los tiene, poco después de su primera ejecución (y para tus experimentos más antiguos, un poco después de que arranca la app). Lee los nombres, comandos, hiperparámetros y nombres de métricas de algunas de sus ejecuciones. Cuando los escribió y el experimento ha crecido hasta el doble de sus ejecuciones (al menos 4), los escribe de nuevo, como máximo una vez cada seis horas.
- **Un agente** que inicia ejecuciones le da al experimento un título, una descripción y una categoría cuando inicia las primeras ejecuciones, y otra vez cuando cambia lo que prueba (la herramienta experiment_describe).
- **Tú**: **Editar el título y la descripción** en el menú ⋯ del experimento abre una ventana con **Título**, **Descripción** y **Categoría** (sugiere las categorías que ya están en uso). **Escribirlos de nuevo** le pide una versión nueva al modelo auxiliar, que reemplaza lo que hay.

Lo que escribiste tú o un agente nunca se sobrescribe automáticamente; solo lo hace **Escribirlos de nuevo**. Las ejecuciones de una [sesión confidencial](/guide/sessions#keep-a-session-confidential) las lee únicamente un modelo auxiliar que se ejecuta en esta computadora; si no hay ninguno, su experimento se queda como está.

## Comparar ejecuciones

Marca la casilla de cada ejecución que quieras en una tabla de ejecuciones (la casilla del encabezado de la tabla marca todas las que se muestran). Una barra en la parte inferior dice “3 elegidas” y ofrece **Comparar** (para 2 ejecuciones o más, hasta 8), **Crear una tabla** y × para desmarcarlas todas. Las ejecuciones que marcaste siguen marcadas mientras te mueves entre experimentos, así que puedes comparar ejecuciones de distintos experimentos. **Comparar** abre una ventana, “Comparar 3 ejecuciones”, con:

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

Con dos puntuaciones o más, un gráfico muestra cada una a lo largo del tiempo, con su dispersión entre semillas y la línea base como línea discontinua. **Evolucionar…**, en el menú ⋯ de la página, empieza una búsqueda de una versión mejor ([Evolucionar](#evolve-searching-for-a-better-version)), y cuando ya hay alguna, **Evolucionar** las muestra entre el gráfico y las puntuaciones. **Puntuaciones** las muestra, de la más reciente a la más antigua: cuándo, dónde (rama y commit, “con cambios sin commit” si es así), quién la pidió, la puntuación y cómo se compara. El menú de una puntuación abre sus ejecuciones, la usa como línea base (**Usar como línea base**), la detiene o la elimina. Cuando una puntuación falla porque el comando no imprimió el número, se muestran los nombres que sí imprimió: toca uno para usarlo en su lugar (se vuelve a sellar).

**Puntuar ahora** puntúa la carpeta. Cuando el repositorio tiene worktrees de git, pregunta “¿Puntuar lo que hay en qué carpeta?”: la propia carpeta o uno de los worktrees, según su rama. Una evaluación puede puntuar su propia carpeta, una carpeta dentro de ella o un worktree de git del mismo repositorio.

### Cuando cambian los archivos sellados

Si un archivo sellado difiere, un aviso ámbar indica cuál, y las puntuaciones esperan hasta que vuelvan a estar como antes:

- **Ver qué cambió**: cada archivo marcado como Changed, Missing o New file, con lo que cambió en él.
- **Restaurarlos**: escribe las copias selladas encima y dice qué no pudo restaurar y por qué (los archivos añadidos después se quedan).
- **Volver a sellar…**: acepta los archivos tal como están ahora. Las puntuaciones anteriores ya no se comparan con las nuevas (se conservan, plegadas bajo **Antes de que se volviera a sellar**), y hay que medir de nuevo la línea base. Cambiar el comando, el número o los archivos sellados con **Editar…** también vuelve a sellar.

### La prueba final

**Ejecutar la prueba final…** (en su recuadro o en el menú de la página) dice qué tan bien funciona realmente tu trabajo con datos sobre los que no se ajustó nada. Cada vez que miras te dice un poco menos, así que ejecútala cuando creas que has terminado; la ventana indica cuántas veces se ha ejecutado desde que se selló. Cuando hay worktrees de git, también pregunta sobre cuál se ejecuta (**Sobre lo que hay en**).

### Lo que pueden hacer los agentes

Los agentes pueden leer las evaluaciones, pedir una puntuación de su carpeta (la app ejecuta ella misma el comando sellado; ellos informan ese número, no uno propio), proponer una evaluación nueva (ves cada parte en una tarjeta y solo se crea si dices que sí) y restaurar los archivos sellados. No pueden crear ni sellar una por su cuenta, fijar la línea base, ni ejecutar o leer la prueba final.

Las ejecuciones iniciadas en la carpeta de una evaluación indican en su página si sus archivos estaban como al sellarse cuando empezaron, y la tabla de ejecuciones marca con un signo ámbar aquellas en las que no lo estaban. Una ejecución que sirvió para puntuar una evaluación lleva de vuelta a ella.

## Evolucionar: buscar una versión mejor

Evolucionar prueba muchos cambios pequeños en los archivos que indiques, puntúa cada uno con la evaluación y conserva el mejor. Tus propios archivos no se tocan: cada cambio se prueba en una copia propia de la app, creada a partir de tu último commit. Usa el [modelo auxiliar](/guide/agents-models#choose-the-helper-model) de la app para escribir los cambios, basando cada uno en una de las mejores versiones encontradas hasta el momento.

Vale la pena para un archivo cuya calidad la evaluación pueda medir bien: una heurística, una función de puntuación, un prompt, una rutina lenta. No la vale cuando la evaluación es débil (pocos ejemplos, un número fácil de manipular): una búsqueda encuentra los puntos débiles de aquello que la puntúa, así que define una [prueba final](#the-final-test) con datos que la búsqueda nunca vea.

### Empezar una

Abre la página de la evaluación, haz clic en ⋯ y en **Evolucionar…**. La ventana pregunta:

- **¿Qué puede cambiar?** Escribe un archivo y haz clic en **Añadir**, o toca los de **Sugeridos**: hasta 8 archivos de texto que estén en un commit y no tengan cambios desde entonces. Un archivo que la evaluación protege no se puede cambiar: se te avisa.
- **¿Qué debería probar?** (opcional): unas líneas, como “Haz que el reordenador sea más rápido sin perder nDCG@10”.
- **Cuántos intentos**: 50, 100, 200, u **Otros** para un número propio (de 10 a 2000).
- En **Más**: **Detener después de (horas)**, **Cuántos a la vez** (de 1 a 4) y **Detener cuando esta cantidad de intentos seguidos no aporte nada mejor** (40 si no lo cambias).

Haz clic en **Empezar**. Primero puntúa tu punto de partida, con todas las semillas de la evaluación, y luego empieza. Una evaluación sin línea base muestra **Medir la línea base** en lugar de **Empezar**.

### Leer su página

Su fila bajo **Evolucionar** en la página de la evaluación dice “En ejecución · 37 de 200 probados”, “Hecho · 0.035 mejor que el punto de partida” o “Detenidas”; haz clic en ella para abrirla. En la parte superior están para qué sirve, su estado (como “Listo: ningún nuevo mejor en los últimos 40”) y **Pausar** o **Reanudar**, **Detener** (después no se puede reanudar) y ⋯ con **Eliminar…** (se van sus intentos, sus puntuaciones y sus copias de trabajo; una rama que hayas tomado se queda). Después vienen tres recuadros:

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

Los agentes pueden empezar una con tu sí en una tarjeta y leer cómo va. No pueden eliminarla.

## Tablas de resultados para tu artículo

**Crear una tabla** (a partir de ejecuciones marcadas, del menú ⋯ de un experimento o de su pestaña **Hiperparámetros**) muestra la tabla como la eliges:

- **Columnas**: las métricas. Haz clic en una para añadirla o quitarla, y en su flecha para cambiar qué sentido es el mejor.
- **Filas**: **Una fila por experimento**, o una fila por cada valor de un hiperparámetro que difiere entre las ejecuciones (**Una fila por valor de lr**).
- **Línea base**: la fila contra la que se prueban las demás (la primera fila, salvo que elijas otra).
- **Prueba frente a la referencia**: **Elegir por mí** (pareada sobre ejemplos cuando las ejecuciones guardaron puntuaciones por ejemplo; si no, pareada sobre semillas cuando las ejecuciones de las filas comparten sus semillas; si no, la prueba t de Welch sobre semillas), **Prueba t de Welch sobre semillas**, **Prueba t pareada (por semilla o por ejemplo)**, **Bootstrap pareado sobre ejemplos** o **Sin prueba**.
- **Leyenda**.

Cada celda es la media ± la desviación estándar sobre las ejecuciones de la fila (sus semillas); lo mejor de cada columna va en negrita; una daga (†) marca una celda que es mejor que la referencia con p < 0,05, tras la corrección de Holm por probar varias filas. Pasa el cursor sobre una celda para ver sus valores p. Una línea bajo la tabla dice qué prueba se hizo y qué se dejó fuera (ejecuciones que no han terminado o sin estas métricas).

Después:

- **Copiar LaTeX**: una `table` con las reglas de booktabs (añade `\usepackage{booktabs}` a tu preámbulo), lo mejor en `\textbf`, `$\pm$` y dagas, y una leyenda que dice cómo se leen las celdas.
- **Copiar Markdown** y **Descargar CSV** (la media de cada métrica, la desviación estándar, el número de ejecuciones y los valores p).
- **Incluirla en un documento LaTeX**: elige uno de tus documentos LaTeX (guardado en los archivos de un proyecto o con su conversación) y luego uno de sus archivos. La tabla va antes de `\end{document}` (o al final de un archivo que no lo tenga), o en lugar de la tabla que se creó allí antes, conservando tu propia leyenda y etiqueta. Se guarda como una versión nueva del documento, igual que tus propias ediciones.

Una tabla se conserva cuando la copias o la incluyes en un documento. Su LaTeX lleva una línea `% hydor:table <id>` justo encima de su tabular: déjala ahí, para que la comprobación antes de enviar pueda volver a calcular los números a partir de las ejecuciones y decir cuáles cambiaron. **Tablas de resultados**, en el menú (⋯) de la parte superior de la página, enumera las tablas conservadas: abre una para copiarla o colocarla de nuevo, o **Volver a calcular** a partir de sus ejecuciones tal como están ahora.

Para las pruebas pareadas sobre ejemplos (consultas en recuperación, frases en traducción), una ejecución escribe un archivo de puntuaciones por ejemplo y lo indica en **Puntuaciones por ejemplo**: líneas JSON con un `id` (o `qid`, `query`, `example`) y un número por métrica, como `{"id": "q12", "ndcg@10": 0.53}`, o las líneas de trec_eval -q. Puede tener marcadores `{name}`, como el comando; el archivo se conserva con la ejecución cuando esta termina.

## Barridos

Un barrido es un comando con un marcador para cada hiperparámetro, ejecutado una vez por cada combinación de sus valores. Haz clic en **Más** (⋯) arriba y luego en [**Nuevo barrido**](/experiments?new=sweep) (o **Nuevo barrido en este experimento** en el menú de un experimento, o **Un barrido** en Nueva ejecución):

1. Escribe el comando con `{name}` donde va el valor de cada hiperparámetro: `python train.py --lr {lr} --batch {batch}`.
2. En **Hiperparámetros y sus valores**, da a cada hiperparámetro sus valores: `lr` y `0.001, 0.0003, 0.0001`. **Añadir un hiperparámetro** para otro más.
3. Elige **Todas las combinaciones**, o **Una muestra aleatoria** de ellas (**como máximo** N ejecuciones).
4. Para detener las ejecuciones que no van a ganar, fija **Detener ejecuciones antes por** una métrica y qué sentido es el mejor: una ejecución cuya métrica en un paso es peor que la mediana de las demás ejecuciones en ese paso se detiene (**Detenida antes de tiempo**), una vez que otras tres han llegado a ese paso.
5. Dale un nombre a su **Experimento** y haz clic en **Empezar N ejecuciones**.

Las ejecuciones del barrido son un experimento como cualquier otro: su tabla de ejecuciones tiene una columna para cada hiperparámetro, su pestaña **Gráficos** dibuja las curvas y su pestaña **Hiperparámetros** muestra cómo fue el barrido: su mejor ejecución (según la métrica que elijas, el mejor valor o el último de cada ejecución), qué hiperparámetros importan más y cada uno frente a la métrica. Desde ahí, **Crear una tabla** o **Comparar las 6 mejores**. El aviso que dice que un barrido ha terminado abre esa pestaña.

## Dónde van las ejecuciones

**Más** (⋯) en la parte superior → [**Dónde van las ejecuciones**](/experiments?places=1):

- **Esta computadora**: sus GPU y **Trabajos sin GPU: como máximo N a la vez**.
- **Otras máquinas**: las de [Configuración → Máquinas](/settings?s=machines) que están conectadas. Una ejecución enviada a una de ellas se conserva y se vigila allí: su agente de guardia y sus avisos son los de esa máquina (sus avisos te llegan aquí, como todos los de esa máquina), y esta página la sigue. La lista de aquí muestra también las ejecuciones de todas las máquinas conectadas, marcadas con el lugar donde se ejecutan; al abrir una se lee allí, y **Detener** la detiene allí.
- **Clústeres**: computadoras a las que accedes por SSH, donde no hace falta instalar nada.

### Añadir un clúster

Haz clic en [**Añadir un clúster**](/experiments?cluster=new) e indica:

- **Nombre** y **Host SSH**: tal como lo escribirías después de `ssh`, una entrada de tu `~/.ssh/config` o `me@login.cluster.edu`. El servidor de la app se conecta con sus propias claves SSH y nunca pide una contraseña, así que necesita una clave allí que funcione sin ella (`ssh-copy-id`), y que la clave de host del clúster sea conocida (conéctate una vez con `ssh` desde una terminal).
- **SLURM** o **SSH simple**.
- **Carpeta allí para los logs de las ejecuciones** (`~/hydor-runs` para empezar) y, para SLURM, su **Partición** y su **Cuenta**.
- **Líneas de preparación**, que se ejecutan antes de cada trabajo allí: `module load cuda/12.1`, `source ~/venvs/ml/bin/activate`.

**Comprobar** prueba `ssh host true`, y después `sinfo` (que lista las particiones) para SLURM, o `nvidia-smi` y tmux para SSH simple. **Añadir** lo guarda; en la lista, cada clúster tiene **Comprobar** y **Quitar**.

Un trabajo para un clúster se ejecuta en una carpeta allí (el código ya debe estar allí: clónalo allí). En **SLURM**, la app escribe un script por lotes con lo que necesita el trabajo (sus GPU como `--gres=gpu:N`, procesadores, memoria, las horas como `--time`, la partición y la cuenta), tus líneas de preparación y el comando, y lo envía con sbatch. Mientras espera, su estado explica por qué, con la palabra de SLURM y con palabras sencillas («otros trabajos van primero (Priority)»). La app lo sigue con squeue y sacct, copia su log aquí a medida que crece, y **Detener** lo cancela con scancel. En **SSH simple**, las GPU se eligen allí como aquí, y la ejecución va a tmux allí. Se mantiene abierta una conexión SSH por clúster, así que seguir las ejecuciones cuesta poco.

## En un teléfono

No hay columna: la vista general empieza con la cola, las GPU y **Buscar un experimento**, y muestra las evaluaciones (cuando tienes algunas) y los experimentos como tarjetas. Un experimento, una evaluación y una ejecución se abren en su lugar, con una flecha para volver. Una tabla de ejecuciones se desplaza de lado, y la casilla y el nombre de cada ejecución siguen a la vista; las ejecuciones de los gráficos son una fila de etiquetas encima de ellos, y **Suavizado** está en el menú **Opciones del gráfico**. El log de una ejecución se ajusta al ancho de la pantalla, y **Seguir** funciona como en una computadora. New run, Compare y las tablas se abren desde la parte inferior de la pantalla.

## Pide a un agente

- "Entrena esto en una GPU libre y avísame cuando termine."
- "Ejecuta eval.py en el clúster Unity con 2 GPU durante 4 horas."
- "Barre la tasa de aprendizaje con 1e-4, 3e-4 y 1e-3 con las semillas 1, 2 y 3, y detén pronto las ejecuciones malas."
- "¿Por qué falló mi última ejecución? Si la solución es clara, ejecútala de nuevo."
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
