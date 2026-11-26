# Experimentos

O Experimentos executa para você seus trabalhos de treinamento e avaliação. Um trabalho espera por uma GPU com memória livre suficiente em uma das suas máquinas (ou aguarda sua vez na fila de um cluster), é executado por conta própria e fica guardado como um registro: seu código, hiperparâmetros, ambiente, log e métricas, e o que o agente de plantão fez quando algo deu errado. Cada experimento (as execuções que você compara juntas) tem um título, uma descrição e uma categoria, e sua página mostra as execuções em uma tabela, suas métricas em gráficos e quais hiperparâmetros importam. Compare execuções ou crie uma tabela de resultados com testes de significância para o seu artigo. Os agentes também usam esse recurso: peça a qualquer agente para treinar algo em uma GPU livre, e ele inicia uma execução aqui.

![A página Experimentos: experimentos por categoria à esquerda e a aba Gráficos de um sweep: as curvas de suas seis execuções em gráficos compartilhados, cada execução com sua própria cor](images/experiments.webp)

## Abrir o Experimentos

Clique em **Experimentos** na barra de ícones, ou acesse [Experimentos](/experiments).

Na primeira vez que você abre a página, um tour curto, escrito para quem está começando com experimentos, mostra como ela funciona. Ele aparece enquanto as dicas estão ativadas, depois do tour de boas-vindas. Um cartão explica em palavras simples o que são um experimento e uma execução, e depois cada parte da página se ilumina, uma de cada vez, com um cartão próprio: **Nova execução**, a fila e as GPUs, seus experimentos por categoria, acompanhar uma execução ao vivo, comparar execuções e tabelas de resultados, e deixar um agente fazer o trabalho. Avance e volte com **Próxima** e **Voltar**; **Concluído** encerra o tour, e **Pular** ou Esc o fecha antes. **Me mostre como funciona** (o botão de bússola no canto superior direito da página) o inicia de novo a qualquer momento.

No computador, uma coluna à esquerda permanece ao lado de tudo o que você abre aqui:

- A linha da fila, no topo, diz o que está acontecendo ("2 em execução · 1 aguardando" ou "Nada em execução agora"). Abaixo dela, as GPUs deste computador como pequenos medidores: a memória que cada uma usa, na cor de destaque quando uma das suas execuções a ocupa (aponte para uma para ver o quanto está ocupada e qual execução a ocupa; clique nela para abrir essa execução).
- **Buscar um experimento** filtra a lista pelo que você digitar: o título, a descrição, a categoria e o nome de um experimento, e os nomes e comandos das suas execuções. Um experimento que corresponde apenas por suas execuções informa quantas ("3 execuções correspondem").
- **Visão geral** leva você de volta à página descrita abaixo.
- **Avaliações**, quando você tem alguma, com as pontuações mais recentes ([Avaliações](#evaluations-keeping-score-the-same-way)).
- Depois, os experimentos, agrupados por categoria (um pequeno título para cada uma, com a categoria da execução mais recente primeiro; os experimentos sem categoria ficam em **Outros experimentos**, e não há títulos enquanto nenhum tiver categoria). Cada um mostra seu título e, abaixo, quantas execuções tem e quantas estão em andamento ("6 execuções · 1 em execução") ou quando foi sua última execução ("23 execuções · há 2 h"). Em uma categoria, o experimento com a execução mais recente vem primeiro. **Execuções sem experimento** é a última entrada, quando há essas execuções.

A **Visão geral** mostra:

- **Executando agora**, quando algo está em execução ou aguardando: um cartão para cada execução com seu status, nome, experimento, quanto já avançou ("54% · faltam cerca de 41 min"), sua métrica principal com uma pequena curva e suas GPUs. Uma execução aguardando diz o motivo. Clique em um cartão para abrir a execução. Quando mais de 12 estão em andamento, **Mostrar todas as N** exibe todas.
- **Experimentos**: um cartão para cada um, com sua categoria, título e descrição, quantas execuções tem, quantas estão em andamento e quando foi a última, e o melhor valor de sua métrica principal ("Melhor dev_bpb 1,599"). Clique em um para abri-lo.
- **Últimas execuções**: uma tabela com as 10 execuções mais recentes entre os seus experimentos. **Mostrar todas as N execuções** exibe todas, com **Buscar uma execução** acima.

Em uma tela estreita não há coluna: a própria Visão geral começa com a linha da fila, as GPUs e **Buscar um experimento**, e mostra os experimentos como cartões.

Sem nenhuma execução ainda, a página explica o que é o Experimentos, com **Nova execução**, ou "peça a qualquer agente: “treine isto em uma GPU livre e me avise quando terminar”".

## A página de um experimento

Clique em um experimento na coluna ou na Visão geral. No topo:

- Sua categoria e seu nome (o nome que suas execuções carregam, como você digitou em **Experimento**), depois seu título em letras grandes e sua descrição. Uma descrição com mais de três linhas tem **Mais**.
- Uma linha de contagens: "23 execuções · 1 em execução · 2 aguardando · 9 concluídas · 6 com falha · última execução há 2 h" (apenas o que for maior que zero).
- À direita, um menu ⋯, **Este experimento**: **Editar o título e a descrição** e **Escrever de novo** (veja [Títulos, descrições e categorias](#titles-descriptions-and-categories)), **Nova execução neste experimento**, **Novo sweep neste experimento**, **Criar uma tabela** (das suas execuções concluídas: veja [Tabelas de resultados para o seu artigo](#results-tables-for-your-paper)), **Comparar as 6 mais recentes** e **Marcar todas** (marca todas as execuções). No celular, uma seta à esquerda do título volta à tela anterior.

Abaixo há três abas: **Execuções** (com a quantidade), **Gráficos** e **Hiperparâmetros** (quando o experimento tem duas ou mais execuções que diferem em um hiperparâmetro). A aba escolhida por último abre primeiro da próxima vez, neste dispositivo.

### A tabela de execuções

A aba **Execuções** lista as execuções do experimento em uma tabela, uma linha para cada: seu nome, seu status ("Executando 54%", "Concluído", "Com falha", "Aguardando uma GPU"; aponte para um status que está aguardando para ver o motivo), uma coluna para cada métrica (seu último valor; o melhor de cada coluna em negrito) e para cada hiperparâmetro, depois **Tempo de execução** e **Iniciada**. Quando as execuções do experimento estão em mais de um lugar, uma coluna **Onde** diz onde. As execuções em andamento vêm primeiro, depois as que aguardam, na ordem em que vão começar, depois as que terminaram, da mais recente para a mais antiga. Clique no nome de uma coluna para ordenar por ela (o primeiro clique em uma métrica coloca a melhor primeiro; clique de novo para inverter e uma terceira vez para voltar a essa ordem). A tabela rola para os lados, e a caixa de seleção e o nome de cada execução permanecem à vista.

Acima da tabela:

- **Buscar uma execução** procura nos nomes, comandos e tags das execuções.
- **Filtrar**: por **Status** (**Todas as execuções**, **Em execução e aguardando**, **Concluído**, **Com falha ou perdidas**, **Interrompida**) e, quando as execuções estão em mais de um lugar, **Onde**. Enquanto uma busca ou um filtro está ativo, **× N exibidas** o limpa.
- **Colunas**: marque as métricas e os hiperparâmetros a exibir (uma caixa encontra um; um hiperparâmetro que difere entre as execuções mostra **Difere**). **Redefinir** volta às escolhidas pela página: as métricas que mais dizem sobre as execuções e os hiperparâmetros que diferem. Cada experimento mantém suas próprias colunas neste dispositivo.

Clique em uma linha para abrir a execução. Marque as caixas para comparar execuções (veja [Comparar execuções](#compare-runs)). A tabela mostra 50 linhas; **Mostrar mais N** exibe o restante.

### Gráficos

A aba **Gráficos** desenha, ao longo dos passos, cada métrica que as execuções imprimem, um gráfico para cada, com uma linha para cada execução. À esquerda (acima dos gráficos, no celular) ficam as execuções nos gráficos: **Nos gráficos** com a quantidade ("6 de 23"), depois todas as execuções do experimento, com um ponto colorido quando está exibida e um anel vazio quando não está. Clique em uma execução para exibi-la ou ocultá-la. Até 8 execuções aparecem ao mesmo tempo ("Até 8 execuções aparecem ao mesmo tempo: oculte uma primeiro"). Uma execução mantém sua cor enquanto está exibida, independentemente do que você oculte ou exiba, para que você possa acompanhar uma execução durante suas alterações; a mesma cor a marca na tabela de execuções. O menu ⋯ (**Quais execuções aparecem**) tem **Mostrar as 8 mais recentes**, **Mostrar as 8 melhores** (pela métrica principal do experimento), **Mostrar as execuções escolhidas** (as que você marcou na tabela) e **Ocultar todas**. No início, aparecem as 8 primeiras execuções que têm curvas. Cada experimento mantém sua escolha neste dispositivo.

Os gráficos são divididos em seções pelo início do nome de uma métrica: **dev** (ou val, validation, eval, test…), **train**, qualquer outro prefixo que duas ou mais métricas compartilhem antes de uma barra (`eval/…`), depois **Métricas** para as que dizem quão bem uma execução se sai e **Outros** para o restante (recolhida até você abri-la). Clique no nome de uma seção para recolhê-la ou abri-la. Acima dos gráficos:

- **Buscar uma métrica** mostra apenas os gráficos cujo nome tem o que você digitar, em todas as seções.
- **Suavização**: um controle deslizante de 0 (as curvas como estão) a 0,99, uma média móvel como o TensorBoard e o Weights & Biases a desenham; a curva original continua levemente ao fundo.
- **Opções do gráfico** (o botão de controles deslizantes): **Eixo X** (**Passo**, ou outra métrica que só cresce, como tokens ou tempo), **Escala logarítmica** e **Ignorar valores atípicos** (o intervalo de um gráfico segue a maioria dos valores em vez de um único pico). Elas ficam salvas neste dispositivo, para todos os gráficos.

Aponte para um gráfico para ler o valor de cada execução naquele passo. Com o mouse, arraste sobre um gráfico para ampliar; clique duas vezes nele (ou em **Redefinir zoom**) para voltar. Em uma tela sensível ao toque, um toque ou um arraste mostra os valores. **Maior**, no canto superior direito de um gráfico, abre-o em tamanho grande, com uma tabela do **Último**, **Melhor**, **Mín.** e **Máximo** de cada execução.

### Hiperparâmetros

A aba **Hiperparâmetros** mostra como os hiperparâmetros das execuções se relacionam com uma métrica, que é como você lê um sweep. Escolha a métrica (a principal no início) e se cada execução conta pelo seu valor **Último** ou **Melhor**; a página diz se menor ou maior é melhor para ela. Quando as execuções são um sweep, uma linha informa: "Um sweep de 12 execuções · todas as combinações · 9 concluídas · 2 em andamento · 1 interrompida antes · interrompido antes em dev_loss". Abaixo dela:

- Execução **Melhor**: "Melhor dev_bpb", seu valor, a execução e os valores dos hiperparâmetros que diferem. Clique nela para abrir a execução.
- **Coordenadas paralelas**: uma linha para cada execução ao longo dos hiperparâmetros (os que mais importam primeiro, até 8) e, por último, a métrica. Quanto mais forte a linha, melhor a execução se saiu. Aponte para uma linha para ver qual execução é; clique nela para abrir a execução.
- **Quais hiperparâmetros importam**: uma barra para cada hiperparâmetro que difere, a mais forte primeiro. Para um número, ρ (de −1 a 1) diz como sua ordem se relaciona com a da métrica: uma barra à esquerda do meio significa que um valor maior vai com uma métrica menor, e as palavras dizem "maior é melhor" ou "menor é melhor". Para outros valores (um nome, verdadeiro ou falso), η (de 0 a 1) diz o quanto os grupos diferem, com "melhor:" e o valor cujas execuções se saíram melhor em média. Abaixo, a partir de quantas execuções foi calculado. É uma correlação, não uma prova de causa: outros hiperparâmetros mudam ao mesmo tempo e, com poucas execuções, uma barra pode surgir por acaso. Um hiperparâmetro que é igual em todas as execuções, ou que menos de 3 execuções têm, fica de fora.
- **Cada hiperparâmetro contra** a métrica: um gráfico para cada, um ponto por execução, a melhor circulada (em escala logarítmica quando os valores abrangem muito, como as taxas de aprendizado).

No final, **Criar uma tabela** e **Comparar as 6 melhores**.

## Iniciar uma execução

1. Clique em [**Nova execução**](/experiments?new=1) no canto superior direito.
2. Digite o **Command**, como você faria na pasta dele: `python train.py --lr 3e-4`.
3. Escolha a **Pasta** em que ele é executado e **Onde executa**: **Este computador**, uma das suas outras máquinas ou um cluster (veja [Para onde vão as execuções](#where-runs-go)).
4. Defina as **GPUs** de que ele precisa (0 o executa sem uma) e **Memória livre de cada uma (GB)**. Se ficar vazio, ele espera por uma GPU que ninguém esteja usando.
5. Dê um **Nome** se quiser (caso contrário, o nome do script) e um **Experimento**: as execuções de um experimento são listadas, exibidas em gráficos e comparadas juntas (a caixa sugere os que você tem).
6. Em **Início**, você diz quando começa: **Quando uma GPU estiver livre** ou **Hoje à noite** (veja [Execuções que esperam pela noite](#runs-that-wait-for-the-night)). Depois, clique em **Início**.

**Mais opções** contém o restante:

- **Hiperparâmetros**: linhas nome=valor (`lr=3e-4`), guardadas com a execução, exibidas como colunas na tabela de execuções do seu experimento e comparadas em tabelas. Os hiperparâmetros no próprio comando são lidos automaticamente: `--name value`, `--name=value` e palavras `name=value` depois do programa (como o Hydra as recebe). `{name}` no comando recebe o valor de um hiperparâmetro.
- **Seed** (`{seed}` no comando recebe o valor; `--seed` no comando também é lido), **Prioridade** (a maior vai primeiro) e **Limite de tempo (horas)** (ela é interrompida após esse tempo).
- **Arquivo de métricas**: um arquivo no qual a execução grava métricas como linhas JSON, além do que ela imprime. **Pontuações por exemplo**: um arquivo de pontuações por exemplo (veja [Tabelas de resultados para o seu artigo](#results-tables-for-your-paper)).
- **Avisar-me**: **Quando termina** e **Quando falha** (ambos ativados, a menos que você os desmarque) e **Quando uma métrica ultrapassa um valor** ("val_acc > 0.9").
- **Agente de plantão**: veja [O agente de plantão](#the-agent-on-call).
- Em um cluster SLURM: **Processadores**, **Memória (GB)** e **Partição**.

A nova execução é aberta, para que você a veja começar. Para adicionar uma execução a um experimento que você está vendo, use **Nova execução neste experimento** no menu ⋯ dele: **Experimento** já vem preenchido. Logo após a primeira execução de um experimento, o modelo auxiliar dá a ele um título, uma descrição e uma categoria (veja [Títulos, descrições e categorias](#titles-descriptions-and-categories)).

## Como a fila escolhe

- Os trabalhos seguem a prioridade e, depois, a idade. Um trabalho que precisa de GPUs pega aquelas com pelo menos a memória livre que ele pede e que nenhuma outra execução sua ocupa, as mais livres primeiro. Até haver GPUs livres suficientes, ele espera e diz o motivo: "Aguardando 1 GPU com 20 GB livres: a mais livre agora tem 12 GB, na GPU 2; suas outras execuções ocupam a GPU 0". Um trabalho menor atrás dele pode começar primeiro, quando o que ele precisa está livre.
- Os trabalhos sem GPU começam de uma vez, alguns por vez; quantos é definido em [Para onde vão as execuções](#where-runs-go) (no início, um quarto das threads do computador, de 1 a 4).
- Um trabalho que pede mais GPUs do que o computador tem, ou uma GPU em um computador sem GPUs NVIDIA, falha de imediato e informa isso.
- Uma execução vê apenas as suas próprias GPUs (CUDA_VISIBLE_DEVICES); uma sem GPU não vê nenhuma. Ela também recebe HYDOR_RUN (seu id), HYDOR_RUN_DIR (sua pasta) e HYDOR_SEED, e o Python imprime imediatamente (PYTHONUNBUFFERED), de modo que o log acompanha em tempo real.
- As execuções continuam no tmux (ou em segundo plano, onde não há tmux) quando o app reinicia ou é atualizado. Quando o app volta, ele as encontra de novo, lê o que imprimiram nesse meio-tempo e vê quais terminaram; uma cujo processo desapareceu é marcada como **Sumiu**.

## Execuções que esperam pela noite

Quando as suas GPUs também são usadas no seu próprio trabalho durante o dia, ou por serviços que precisam continuar rápidos, mande para a noite o que pode esperar (controles, varreduras mais amplas, ideias que vale a pena testar). Uma execução noturna só começa no horário noturno do computador em que ela roda, e só quando nenhuma outra execução sua está esperando ali pela mesma coisa (uma GPU, ou um lugar entre as execuções sem GPU): essas sempre vão primeiro, quaisquer que sejam as prioridades. Até lá, ela mostra **Esperando pela noite (a partir de 23:00)**, e a linha da fila conta essas execuções à parte.

- **O horário**: em [Para onde vão as execuções](#where-runs-go), **Noite das** um horário **às** outro, de 23:00 a 07:00, a menos que você mude (a noite pode atravessar a meia-noite). Vale o seu próprio fuso horário, como o seu navegador informou (se não informou, o relógio do próprio computador); uma execução enviada para outra das suas máquinas espera pela noite daquela máquina. Com o mesmo horário nos dois campos, não há noite, e as execuções noturnas esperam até você definir uma. Um cluster tem a própria fila, por isso não é possível enviar uma execução noturna para ele.
- **Quando a noite acabar**: **Deixar as execuções em andamento terminarem** (a opção inicial) ou **Interrompê-las e começá-las de novo na noite seguinte**. Uma execução interrompida começa de novo do zero (o log que ela tinha fica guardado na pasta dela) e mostra “A noite acabou: a execução começa de novo hoje à noite” até lá. Mudar o horário de modo que deixe de ser noite também encerra a noite.
- **Como começar uma**: em “Nova execução”, para uma execução ou uma varredura, defina **Início** como **Hoje à noite**; o horário da noite aparece escrito ao lado. A caixa de diálogo sempre abre em **Quando uma GPU estiver livre**, inclusive com **Executar de novo**.
- **De manhã**: um único aviso, como “Noite passada: 5 execuções concluídas, 1 com falha, 2 ainda esperam por hoje à noite”, abre Experimentos com as execuções daquela noite em primeiro lugar. Uma execução noturna que termina durante a noite não envia um aviso próprio de “concluída” (uma falha é avisada como sempre, e uma sessão que pediu para saber continua sendo informada de como foi); uma que termina depois do aviso da manhã é avisada separadamente. Não há aviso quando nenhuma execução noturna terminou nem está esperando.
- **Os agentes** também mandam execuções exploratórias para a noite; o cartão de aprovação deles diz quando a execução vai começar.

## O que uma execução registra

- **O código**: ao começar, o commit e o branch do repositório Git da pasta dela e se havia alterações sem commit; se havia, um patch delas (sem arquivos binários, no máximo 2 MB) e quantos arquivos o Git não rastreia. Neste computador, os arquivos citados no comando que o Git não rastreia ou ignora (um script sem commit, um pequeno arquivo de configurações) são copiados para a pasta da execução, em `untracked/`, para que você possa executá-la de novo mais tarde. Arquivos seus fora da pasta da execução que o comando cita (por um caminho completo, um caminho com `..` ou `~`) também são copiados, para `untracked/outside/`, com seus nomes, e listados como o comando os escreveu: por exemplo, um script do seu checkout principal executado a partir de um worktree do Git. Não são copiados os que outro checkout ou worktree do mesmo repositório já tem em commit, sem alterações, no commit da execução, nem arquivos de sistema ou de pacotes (em `/usr`, `/opt`, `node_modules`, `site-packages`, programas de um ambiente virtual…), nem os dados do próprio app. Ao todo, no máximo 1 MB por arquivo e 5 MB por execução, e nunca um arquivo que pareça conter uma chave ou uma senha. O registro diz “Fora do git, guardados com a execução” e quais eram grandes demais para guardar.
- **Seu ambiente**: o computador; o Python com que o comando é executado e as versões de PyTorch, Transformers, JAX, TensorFlow e NumPy nele (lidas dos pacotes, nada é importado); com GPUs, as versões do CUDA e do driver e os nomes das GPUs.
- **Seus hiperparâmetros e seed**, seu **log**, seu **código de saída** e sua própria pasta nos dados do app (com o log, o patch, o código de saída e as métricas).
- **Suas métricas**, lidas da saída dela conforme cresce: pares `key=value` (`loss=0.42`, como as barras de progresso do Lightning imprimem), um objeto JSON em uma linha (`{"step": 100, "loss": 0.42}`), dicts impressos do Python (como o Trainer do Hugging Face imprime), o “loss: 0.41 - accuracy: 0.87” do Keras e o arquivo de métricas. O passo vem de `step`, `global_step`, `iter` ou `epoch`. De cada métrica ela guarda o último valor, o melhor (quanto menor, melhor para perdas, erros, perplexidade e semelhantes, pelos nomes; quanto maior, melhor para as demais) e uma série para os gráficos. Uma métrica que ela imprime várias vezes é uma curva; um número que imprime uma vez é um valor (seus hiperparâmetros no início, seus resultados no fim). Ela guarda até 100 métricas: quando uma execução imprime mais, as curvas são mantidas antes dos números impressos uma vez.
- **Quanto já andou**, quando a saída informa: uma barra de progresso (a do tqdm, como o Trainer do Hugging Face desenha, ou uma chamada de treinamento ou de passos), “step 120/1000”, ou um total de passos que ela imprime (`total_steps`, `max_steps`, `num_training_steps`…) junto com seus passos.

## A página de uma execução

Clique em uma execução (em uma tabela, em um cartão ou no medidor de uma GPU). No computador, ela abre no lugar do experimento, com a coluna ainda à esquerda; em uma tela estreita, ocupa a tela toda, com uma seta para voltar. O caminho de volta é o link no canto superior esquerdo, com o nome do experimento da execução (**Visão geral** para uma execução sem experimento).

- O cabeçalho: o nome da execução; **Parar** enquanto ela é executada ou espera (“Parando” enquanto isso acontece); **Executar de novo**, que abre Nova execução preenchida com seus hiperparâmetros, para você alterar antes de começar; e **Mais** (⋯): **Copiar o comando**, **Sua pasta em Arquivos**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para computador; veja [Trabalhe com arquivos e pastas](/guide/files-git#work-with-files-and-folders)) e, depois que ela terminou, **Excluir o registro** (o registro, o log, o patch e as métricas dela são apagados; os arquivos que o job criou na própria pasta ficam). No celular, **Executar de novo** fica no menu ⋯.
- A linha de status: o status, com quanto tempo levou depois que terminou, o código de saída quando não é 0, onde é executada, suas GPUs e quando começou. Enquanto é executada e a saída informa quanto já andou: uma barra, os passos feitos do total (“9.120 de 10.878 · 84%”) e mais ou menos quanto falta, calculado pelo tempo que levou até agora. Uma execução que espera ou falhou diz por quê.
- Três abas: **Visão geral**, **Gráficos** (com quantas curvas ela tem) e **Log**.

A **Visão geral** contém:

- **Como terminou**, primeiro, para uma execução que falhou ou sumiu: as últimas linhas do log e **Abrir o log**.
- **Métricas principais**: um bloco para cada uma de até seis métricas que dizem como ela se sai (nunca itens de controle, como a taxa de aprendizado ou a contagem de tokens), com o último valor, o melhor quando é diferente e uma curva pequena. Clique em um bloco para abrir a aba **Gráficos** naquela métrica.
- **Hiperparâmetros**: os que ela recebeu ou que foram lidos do comando (uma caixa encontra um quando há muitos).
- **Valores**: os números que ela imprimiu uma vez, por nome: seus hiperparâmetros no início, seus resultados no fim. **Todos os N** mostra mais de doze, com uma caixa para encontrar um.
- **Detalhes**: seu experimento (um link para ele), status, quando começou e terminou, quanto tempo levou, onde é executada, GPUs, seed, prioridade, a sessão que a começou e a execução da qual ela é uma nova execução.
- **Código**: o commit e o branch, **Ver as alterações** para o patch (ou “Nada mudou desde”), quantos arquivos o Git não rastreia e os nomes daqueles usados pelo comando que foram guardados com a execução ou eram grandes demais para guardar.
- **Command**: o comando e a pasta, com **Sua pasta em Arquivos**. **Ambiente**: o computador, o Python, os pacotes e as GPUs.
- **O que aconteceu**: seus eventos, com os horários: quando esperou, começou e terminou, e o que o agente de plantão viu e fez, com **Abrir a sessão**.

Os **Gráficos** desenham as curvas da execução como a aba de um experimento (veja [Gráficos](#charts)), só desta execução, e as leem de novo a cada poucos segundos enquanto ela é executada. O **Log** mostra a saída dela, com o mais recente embaixo. Enquanto ela é executada, **Acompanhar** mantém o mais recente à vista; role para cima para ler e ele deixa de acompanhar. **Buscar no log** mostra só as linhas que correspondem (“12 linhas correspondem”), e o acompanhamento fica em pausa enquanto isso.

**Parar** envia Ctrl-C aos programas da execução e depois os interrompe com mais força se não tiverem terminado após 10 segundos. Uma execução que só estava esperando sai da fila na hora.

## O agente de plantão

Em **Mais opções** → **Agente de plantão**:

- **Desativada** (de início): o que dá errado continua sendo anotado na página da execução.
- **Avisar-me**: uma notificação quando acontece.
- **Um agente investiga**: um agente começa uma sessão na pasta da execução com o que aconteceu, o final do log, o registro da execução e **O que o agente pode fazer**, as suas regras para ele. Ele age dentro delas e depois conta em poucas linhas o que aconteceu e o que fez. A página da execução tem um link para a sessão dele.

Ele fica de olho em (todos, a menos que você desmarque algum): **NaN** (uma métrica que vira NaN ou infinito, ou uma perda NaN no log), **Sem memória** (as mensagens do CUDA, `OutOfMemoryError`, ou o programa encerrado com código de saída 137), **Uma paralisação** (nenhuma saída nova por 30 minutos, ou os minutos que você definir), **Uma falha** (um código de saída diferente de 0, ou um processo que morreu) e **Divergência** (uma perda mais de duas vezes o seu melhor valor, cinco leituras seguidas).

Se ficarem vazias, as regras são: “Read the log and the code. If a fix is clear and safe, run it again with experiment_run (from the last checkpoint if there is one), changing as little as possible. Never delete files or checkpoints. Then tell the user in a few lines what happened and what you did.” O agente é o que começou a execução (quando foi um agente); do contrário, o agente e o modelo que você escolheu por último na página inicial. Um agente investiga uma execução por vez, e no máximo três entram de plantão em uma hora: além disso, você é avisado.

## Notificações

Você é avisado quando uma execução é concluída ou falha (a menos que desmarque essas opções), quando uma métrica ultrapassa o valor que você definiu e pelo agente de plantão. Uma notificação abre a página da execução. Uma varredura avisa uma única vez, quando todas as execuções dela terminam, com a melhor configuração (a média das seeds) ou com o número que todas as execuções deram, quando deram o mesmo; o aviso abre o experimento da varredura na aba **Hiperparâmetros**. No máximo oito avisos sobre execuções chegam a cada dez minutos; além disso, um aviso diz quantos outros houve.

Uma execução que um agente começou com “avise-me quando terminar” (report) também envia uma mensagem a essa sessão quando termina, para que o agente continue dali. Execuções de uma sessão que terminam perto umas das outras, ou enquanto o agente dela está trabalhando, são informadas em uma única mensagem, sob os nomes dos experimentos, com os números mais importantes. Execuções que diferem apenas na seed ocupam uma só linha, com a média e a dispersão de cada número entre elas, e uma seed que falhou ou foi interrompida é indicada nessa linha. O tempo que uma execução levou é informado quando foi de um minuto ou mais, ou quando ela falhou; depois de 20 linhas, a mensagem conta o que resta em cada experimento. A mensagem chega depois do turno do agente, quando ele está trabalhando, e uma execução que o agente já leu desde que ela terminou fica de fora; na conversa, ela aparece como uma única linha, **Experimentos · Execuções encerradas**, que se abre com um clique. É um aviso do próprio app, não uma mensagem sua, por isso nada da memória nem da wiki é acrescentado a ela (nem às mensagens de um objetivo).

## Títulos, descrições e categorias

Cada experimento tem um título (poucas palavras simples: o que é treinado ou avaliado, em quê e o que varia), uma descrição (de uma a três frases) e uma categoria (de uma a três palavras que dão nome à área ou à tarefa, como “Modelagem de linguagem”). Eles aparecem na página do experimento, na coluna e nos cartões da Visão geral, de modo que um nome como `e7-pretrain` vira uma linha que você entende, e a caixa de busca (Ctrl+K) e **Buscar um experimento** encontram um experimento por eles.

Quem os escreve:

- **O modelo auxiliar** ([Configurações → Agentes → Modelos](/settings?s=models&find=Helper%20model)) os escreve para um experimento que não tem nenhum, logo após a primeira execução (e, para seus experimentos mais antigos, pouco depois de o app abrir). Ele lê os nomes, comandos, hiperparâmetros e nomes de métricas de algumas das execuções. Quando ele os escreveu e o experimento cresceu até o dobro de execuções (pelo menos 4), ele os escreve de novo, no máximo uma vez a cada seis horas.
- **Um agente** que começa execuções dá ao experimento um título, uma descrição e uma categoria quando começa as primeiras execuções e de novo quando o que ele testa muda (a ferramenta experiment_describe).
- **Você**: **Editar o título e a descrição** no menu ⋯ do experimento abre uma janela com **Título**, **Descrição** e **Categoria** (ela sugere as categorias já em uso). **Escrever de novo** pede ao modelo auxiliar uma versão nova, que substitui o que está lá.

O que você ou um agente escreveu nunca é sobrescrito automaticamente; só **Escrever de novo** faz isso. As execuções de uma [sessão confidencial](/guide/sessions#keep-a-session-confidential) são lidas apenas por um modelo auxiliar que roda neste computador; sem nenhum, o experimento delas fica como está.

## Compare execuções

Marque a caixa de cada execução que você quer em uma tabela de execuções (a caixa no cabeçalho da tabela marca todas as execuções exibidas). Uma barra na parte de baixo diz “3 escolhidas” e oferece **Comparar** (para 2 execuções ou mais, até 8), **Criar uma tabela** e × para desmarcar todas. As execuções que você marcou continuam marcadas enquanto você passa de um experimento a outro, assim você pode comparar execuções de experimentos diferentes. **Comparar** abre uma janela, “Comparar 3 execuções”, com:

- As execuções, cada uma com a cor da sua linha.
- **Métricas**: toda métrica que qualquer uma delas tem, uma coluna para cada execução, com a melhor de cada linha em negrito. As primeiras 15 aparecem; **Todas as N** mostra o resto.
- **Hiperparâmetros**: o experimento, o comando, a pasta, onde foi executada, o commit, o seed e as GPUs, e cada hiperparâmetro, lado a lado. **Somente o que difere** (ativado de início) deixa de fora as linhas iguais em todas as execuções; uma diferença é marcada.
- **Gráficos**: as curvas das execuções, um gráfico para cada métrica, uma linha para cada execução.

O menu ⋯ de um experimento também tem **Comparar as 6 mais recentes**, e a aba **Hiperparâmetros** dele tem **Comparar as 6 melhores**.

Antes de contar com um ganho, **Tentar derrubar**, na parte de baixo dessa janela, faz um agente que não participou do trabalho tentar explicar o ganho de outra forma. Confira **O resultado a testar** (uma frase, preenchida a partir das execuções escolhidas: altere para dizer o que você quer dizer), escolha a **Linha de base** e quem faz o teste (**Executado por**) e clique em **Começar**. O agente procura outras explicações (seeds de sorte, uma linha de base sem ajuste, um vazamento, um bug de métrica), faz execuções de controle em um experimento próprio, em uma cópia do seu código e perguntando antes de usar muito tempo de GPU, não conserta nada e informa "Se confirma", "Se confirma em parte" ou "Não se confirma", com o que tentou (execuções em outras máquinas ficam de fora).

## Avaliações: pontuar sempre do mesmo jeito

Uma avaliação é a forma como um projeto marca pontos: um comando e um número, lacrados, para que cada execução e cada agente sejam pontuados do mesmo jeito. Os arquivos que formam o avaliador e os dados usados para pontuar ficam lacrados, nenhuma pontuação é dada enquanto estiverem diferentes, e toda pontuação é calculada pelo próprio app, a partir da execução que ele mesmo faz do comando lacrado. Assim, dois números podem ser comparados sem dúvida sobre como cada um foi obtido.

No computador, a coluna as lista em **Avaliações**, acima dos experimentos, cada uma com sua última pontuação e como ela se compara à linha de base (“0.431 · 0.019 melhor”), “Sem pontuação ainda”, “Pontuando…” enquanto uma pontuação está em andamento, “Evoluindo · 37 de 200” enquanto o [Evoluir](#evolve-searching-for-a-better-version) trabalha nela, ou “alterada” com uma marca âmbar quando os arquivos dela estão diferentes. No celular, elas aparecem como cartões no topo da Visão geral.

### Como criar uma

Clique em **Mais** (⋯) no topo e depois em [**Nova avaliação**](/experiments?new=evaluation). A janela tem quatro partes:

- **O que ela pontua**: o **Nome**, a **Pasta** (um projeto, geralmente um repositório git), o **Comando que pontua** (como `python eval.py --split dev --seed {seed}`: escreva `{seed}` onde entra o seed, para pontuar com vários seeds), **O número que conta** do jeito que o comando o imprime (`ndcg@10` para `ndcg@10=0.412`) e **Quanto maior, melhor** ou **Quanto menor, melhor**.
- **O que não pode mudar**: os arquivos e pastas que formam o avaliador e seus dados. Digite um e clique em **Adicionar**, ou toque nas **Sugestões a partir do seu comando**. Com `{seed}` no comando, **Sementes** define quais são (1, 2, 3, a menos que você mude).
- **Teste final** (opcional): um comando próprio e uma **Pasta reservada** fora do projeto, que só o teste final recebe: os agentes que trabalham no projeto não a veem ali. O comando a encontra como `$HYDOR_HELD_OUT`.
- **Onde executa**: as GPUs de que cada execução precisa, a memória livre delas e um limite de tempo. As execuções esperam na fila deste computador como quaisquer outras.

**Criar e lacrar** lacra os arquivos (pastas grandes demoram um pouco) e abre a página da avaliação. Não sabe o que preencher? **Configurar com um agente**, no topo da janela, começa um pedido naquela pasta: o agente lê como você treina e avalia e propõe a avaliação, que só é criada se você aceitar.

### A página da avaliação

Abaixo do nome aparecem o número, qual direção é melhor, os seeds e o comando (toque nele para ver inteiro), e depois “Lacrada em 24 de nov.: 4 arquivos, tudo como estava”. Em seguida vêm três blocos:

- **Linha de base**: a pontuação com a qual as outras são comparadas. No começo, aparece “Ainda não medida”: clique em **Medir a linha de base**. **Medir de novo** está no menu dela.
- **Última pontuação**: o número, a branch e como ela está em relação à linha de base (“0.019 melhor que a linha de base”; “Igual à linha de base, dentro do ruído” quando a diferença pode muito bem ser acaso), com a frequência com que o acaso sozinho daria essa diferença.
- **Teste final**: **Adicionar um**, **Executar o teste final…**, ou o número dele e quantas vezes foi executado desde que foi lacrado.

Com duas pontuações ou mais, um gráfico mostra cada uma ao longo do tempo, com a dispersão entre as sementes e a linha de base como uma linha tracejada. **Evoluir…**, no menu ⋯ da página, inicia a busca por uma versão melhor ([Evoluir](#evolve-searching-for-a-better-version)) e, quando já existe alguma, **Evoluir** as lista entre o gráfico e as pontuações. **Pontuações** as lista, da mais nova para a mais antiga: quando, onde (branch e commit, com “com alterações sem commit” se for o caso), quem pediu, a pontuação e como ela se compara. O menu de uma pontuação permite abrir suas execuções, usá-la como linha de base (**Usar como linha de base**), pará-la ou excluí-la. Quando uma pontuação falha porque o comando não imprimiu o número, aparecem os nomes que ele de fato imprimiu: toque em um para usá-lo no lugar (a avaliação é lacrada de novo).

**Pontuar agora** pontua a pasta. Quando o repositório tem worktrees do git, aparece a pergunta “Pontuar o que está em qual pasta?”: a própria pasta ou uma das worktrees, identificada pela branch. Uma avaliação pode pontuar a própria pasta, uma pasta dentro dela ou uma worktree do mesmo repositório.

### Quando os arquivos lacrados mudam

Se um arquivo lacrado estiver diferente, um aviso âmbar diz qual, e as pontuações esperam até que ele volte ao que era:

- **Ver o que mudou**: cada arquivo marcado como Alterado, Ausente ou Arquivo novo, com o que mudou nele.
- **Restaurar**: grava as cópias lacradas por cima dos arquivos e diz o que não conseguiu restaurar e por quê (arquivos adicionados depois continuam lá).
- **Lacrar de novo…**: aceita os arquivos como estão agora. As pontuações anteriores deixam de ser comparadas com as novas (elas continuam lá, recolhidas em **Antes de ser lacrada de novo**), e a linha de base precisa ser medida de novo. Mudar o comando, o número ou os arquivos lacrados com **Editar…** também lacra de novo.

### O teste final

**Executar o teste final…** (no bloco dele ou no menu da página) diz como o seu trabalho se sai de verdade em dados nos quais nada foi ajustado. Cada olhada informa um pouco menos, então execute quando achar que terminou; a janela diz quantas vezes ele foi executado desde que foi lacrado. Quando há worktrees do git, ela também pergunta em qual ele vai ser executado (**Sobre o que está em**).

### O que os agentes podem fazer

Os agentes podem ler as avaliações, pedir a pontuação da própria pasta (o app executa o comando lacrado por conta própria; eles informam esse número, não um calculado por eles; se ainda não houver linha de base, a resposta também traz as últimas pontuações de outras pastas e branches, para que possam comparar sem executá-las de novo), propor uma nova avaliação (você vê cada parte dela em um cartão, e ela só é criada se você concordar) e restaurar arquivos lacrados. Eles não podem criar nem lacrar uma por conta própria, definir a linha de base, nem executar ou ler o teste final.

As execuções iniciadas na pasta de uma avaliação informam, na própria página, se os arquivos dela estavam como foram lacrados quando começaram, e uma tabela de execuções marca com um sinal âmbar aquelas em que não estavam. Uma execução que serviu para pontuar uma avaliação leva de volta a ela.

## Evoluir: a busca por uma versão melhor

O Evoluir testa muitas pequenas mudanças nos arquivos que você indicar, pontua cada uma com a avaliação e fica com a melhor. Os seus arquivos não são tocados: cada mudança é testada em uma cópia própria do app, feita a partir do seu último commit. Ele usa o [modelo auxiliar](/guide/agents-models#choose-the-helper-model) do app para escrever as mudanças, construindo cada uma sobre uma das melhores versões encontradas até então.

Vale a pena para um arquivo cuja qualidade a avaliação consegue medir bem: uma heurística, uma função de pontuação, um prompt, uma rotina lenta. Não vale quando a avaliação é fraca (poucos exemplos, um número fácil de manipular): a busca encontra os pontos fracos de tudo o que a pontua, então configure um [teste final](#the-final-test) com dados que a busca nunca vê.

### Como iniciar uma busca

Abra a página da avaliação, clique em ⋯ e em **Evoluir…**. A janela pergunta:

- **O que pode ser alterado?** Digite um arquivo e clique em **Adicionar**, ou toque nos que aparecem em **Sugeridos**: até 8 arquivos de texto que tenham commit e não tenham mudado desde então. Um arquivo protegido pela avaliação não pode ser alterado: você é avisado disso.
- **O que deve ser tentado?** (opcional): algumas linhas, como “Deixe o reranker mais rápido sem perder nDCG@10”.
- **Quantas tentativas**: 50, 100, 200 ou **Outros** para um número à sua escolha (de 10 a 2000).
- Em **Mais**: **Parar depois de (horas)**, **Quantas ao mesmo tempo** (de 1 a 4) e **Parar quando esta quantidade seguida não trouxer nada melhor** (40, a menos que você mude).

Clique em **Começar**. Primeiro ele pontua o seu ponto de partida, com todas as sementes da avaliação, e depois começa. Uma avaliação sem linha de base mostra **Medir a linha de base** no lugar de **Começar**.

### Como ler a página da busca

A linha dela em **Evoluir**, na página da avaliação, diz “Em execução · 37 de 200 tentativas feitas”, “Concluído · 0.035 melhor que o ponto de partida” ou “Interrompida”; clique nela para abri-la. No topo estão a finalidade, o estado (como “Concluído: nada melhor nas últimas 40”) e **Pausar** ou **Retomar**, **Parar** (depois disso não dá para retomar) e ⋯ com **Excluir…** (as tentativas, as pontuações e as cópias de trabalho são apagadas; um branch que você adotou permanece). Em seguida há três quadros:

- **Ponto de partida**: a pontuação da sua versão.
- **Melhor até agora**: a melhor pontuação, quanto ela é melhor que o ponto de partida, uma linha sobre o que ela mudou e **Ver a mudança**.
- **Testadas**: quantas de quantas, quantas falharam e quantas vezes um modelo foi consultado.

Um gráfico mostra todas as tentativas em ordem: uma primeira pontuação rápida (**Só a primeira semente**) aparece mais clara que uma conferida com **Todas as sementes**, as tentativas que falharam são marcas na parte de baixo, **Melhor até agora** é uma linha em degraus e o **Ponto de partida** é uma linha tracejada. Clique em um ponto para abrir aquela tentativa.

**O que foi tentado** lista as tentativas, da mais nova para a mais antiga: o que cada uma mudou, a pontuação (ou por que falhou), como ela se compara ao ponto de partida, sobre qual versão foi **Construída sobre** e o **Modelo** que a escreveu (**Rápido** ou, de vez em quando, **Potente**). Cada tentativa recebe primeiro uma pontuação rápida, com uma semente; só a que supera a melhor da sua linha de trabalho é conferida com todas, e só essa pontuação completa pode torná-la a melhor. **Nova melhor** marca as que eram a melhor no momento em que foram pontuadas, e **Melhor**, a melhor atual. Abra uma tentativa para ver a mudança, arquivo por arquivo, e **Adotar esta**.

### Como adotar a melhor

**Adotar a melhor** (e **Adotar esta**) pede confirmação primeiro e depois cria um branch no seu repositório com aquela versão: os arquivos que estão em checkout não são tocados. A página guarda a indicação “Adotada como <branch>”, que abre o branch na [página do Git](/git). Adotar de novo acrescenta um commit ao mesmo branch.

O teste final não viu a versão que você adotou. Para conferi-la nele, mude sua pasta para o branch (ou crie um worktree git dele) e clique em **Executar o teste final…** na página da avaliação.

### Quanto custa

Cada tentativa executa a avaliação (uma semente e depois todas, quando ela é promissora) e consulta um modelo uma vez, ou duas quando a primeira resposta não pode ser usada. Com GPUs, essas execuções esperam na fila como qualquer outra. **Pausar** interrompe novas tentativas, e **Parar depois de (horas)** e o limite de tentativas seguidas sem nada melhor evitam que a busca continue à toa.

Os agentes podem iniciar uma busca, com a sua aprovação em um cartão, e acompanhar como ela vai. Eles não podem excluir nenhuma.

## Tabelas de resultados para o seu artigo

**Criar uma tabela** (a partir de execuções marcadas, do menu ⋯ de um experimento ou da aba **Hiperparâmetros** dele) mostra a tabela como você escolher:

- **Colunas**: as métricas. Clique em uma para adicionar ou remover, e na seta dela para alternar qual sentido é o melhor.
- **Linhas**: **Uma linha por experimento**, ou uma linha por valor de um hiperparâmetro que difere entre as execuções (**Uma linha por valor de lr**).
- **Linha de base**: a linha contra a qual as outras são testadas (a primeira linha, a menos que você escolha outra).
- **Testar contra a linha de base**: **Escolher por mim** (pareado sobre os exemplos quando as execuções guardaram pontuações por exemplo; senão, pareado sobre os seeds quando as execuções das linhas compartilham os seeds; senão, teste t de Welch sobre os seeds), **Teste t de Welch sobre os seeds**, **Teste t pareado (por seed ou por exemplo)**, **Bootstrap pareado sobre os exemplos** ou **Sem teste**.
- **Legenda**.

Cada célula é a média ± o desvio padrão das execuções da linha (os seeds dela); o melhor valor de cada coluna fica em negrito; uma adaga (†) marca uma célula melhor que a linha de base com p < 0,05, após a correção de Holm para o teste de várias linhas, e uma adaga dupla (‡), uma pior. Quando os seeds quase não mudam um número (ele sai igual, ou quase, em todos os seeds) e as execuções não guardaram pontuações por exemplo, essa comparação não recebe marca: uma nota abaixo da tabela diz que um teste sobre os seeds diz pouco, e que se deve comparar por exemplo. Uma linha cujas pontuações por exemplo são iguais às da linha de base em todos os exemplos conta como igual, e uma nota abaixo da tabela informa isso. Com uma linha por valor de um hiperparâmetro, as execuções que não o têm formam uma única linha, com um nome que indica isso (**ranker not set**). Passe o mouse sobre uma célula para ver os valores de p. Uma linha abaixo da tabela diz qual teste foi feito e o que ficou de fora (execuções que não terminaram ou que não têm essas métricas).

Depois:

- **Copiar LaTeX**: uma `table` com as linhas do booktabs (adicione `\usepackage{booktabs}` ao seu preâmbulo), o melhor em `\textbf`, `$\pm$`, adagas e adagas duplas, e uma legenda que diz como as células devem ser lidas.
- **Copiar Markdown** e **Baixar CSV** (a média, o desvio padrão, o número de execuções, os valores de p e o veredito de cada métrica: melhor que a linha de base, pior ou igual, o que significa que o teste não encontrou diferença).
- **Colocar em um documento LaTeX**: escolha um dos seus documentos LaTeX (guardados nos arquivos de um projeto, ou com a conversa dele) e depois um dos arquivos dele. A tabela vai antes de `\end{document}` (ou no fim de um arquivo sem ele), ou no lugar da tabela que ela fez ali antes, mantendo a sua própria legenda e o seu label. Ela é salva como uma nova versão do documento, como as suas próprias edições.

Uma tabela é guardada quando você a copia ou a coloca em um documento. O LaTeX dela leva uma linha `% hydor:table <id>` logo acima do tabular: mantenha-a ali, para que a verificação antes de você enviar possa recalcular os números a partir das execuções e dizer quais mudaram. **Tabelas de resultados**, no menu (⋯) no alto da página, lista as tabelas guardadas: abra uma para copiá-la ou colocá-la de novo, ou use **Recalcular** a partir das execuções como estão agora.

Para testes pareados sobre exemplos (consultas em recuperação de informação, frases em tradução), uma execução grava um arquivo com as pontuações por exemplo e o informa em **Pontuações por exemplo**: linhas JSON com um `id` (ou `qid`, `query`, `example`) e um número por métrica, como `{"id": "q12", "ndcg@10": 0.53}`, ou as linhas do trec_eval -q. O caminho pode ter marcadores `{name}`, como o comando (`{run}` é o id da execução), e pode começar com `$HYDOR_RUN_DIR/`, a pasta da própria execução; o arquivo fica guardado com a execução quando ela termina. Uma execução que grava `scores.jsonl` em `$HYDOR_RUN_DIR` não precisa nem informá-lo, de modo que as execuções de uma varredura guardam cada uma o seu.

## Sweeps

Um sweep é um comando com um marcador para cada hiperparâmetro, executado uma vez para cada combinação dos valores deles. Clique em **Mais** (⋯) no alto e depois em [**Novo sweep**](/experiments?new=sweep) (ou **Novo sweep neste experimento** no menu de um experimento, ou **Um sweep** em Nova execução):

1. Digite o comando com `{name}` onde vai o valor de cada hiperparâmetro: `python train.py --lr {lr} --batch {batch}`.
2. Em **Hiperparâmetros e seus valores**, dê a cada hiperparâmetro os seus valores: `lr` e `0.001, 0.0003, 0.0001`. **Adicionar um hiperparâmetro** para outro.
3. Escolha **Todas as combinações**, ou **Uma amostra aleatória** delas (**no máximo** N execuções).
4. Para interromper as execuções que não vão ganhar, defina **Interromper execuções antes em caso de** uma métrica e qual sentido é o melhor: uma execução cuja métrica em um passo é pior que a mediana das outras execuções naquele passo é interrompida (**Parada antes do fim**), quando outras três já chegaram a esse passo.
5. Dê um nome ao seu **Experimento** e clique em **Começar N execuções**.

As execuções do sweep são um experimento como qualquer outro: a tabela de execuções dele tem uma coluna para cada hiperparâmetro, a aba **Gráficos** desenha as curvas e a aba **Hiperparâmetros** mostra como o sweep foi: a melhor execução (pela métrica que você escolher, o melhor ou o último valor de cada execução), quais hiperparâmetros mais importam e cada um contra a métrica. Dali, **Criar uma tabela** ou **Comparar as 6 melhores**. O aviso que diz que um sweep terminou abre essa aba.

## Para onde vão as execuções

**Mais** (⋯) no topo → [**Para onde vão as execuções**](/experiments?places=1):

- **Este computador**: as GPUs dele, **Trabalhos sem GPU: no máximo N ao mesmo tempo** e a noite dele: **Noite das** e **às**, e **Quando a noite acabar** (veja [Execuções que esperam pela noite](#runs-that-wait-for-the-night)).
- **Outras máquinas**: as que estão conectadas em [Configurações → Máquinas](/settings?s=machines). Uma execução enviada a uma delas fica guardada e é monitorada lá: o agente de plantão e os avisos dela são dessa máquina (os avisos chegam até você aqui, como todos os dessa máquina), e esta página a acompanha. A lista aqui também mostra as execuções de todas as máquinas conectadas, marcadas com o lugar onde rodam; abrir uma delas a lê lá, e **Parar** a interrompe lá.
- **Clusters**: computadores que você acessa por SSH, onde não é preciso instalar nada.

### Adicionar um cluster

Clique em [**Adicionar um cluster**](/experiments?cluster=new) e informe:

- **Nome** e **Host SSH**: como você digitaria depois de `ssh`, uma entrada do seu `~/.ssh/config` ou `me@login.cluster.edu`. O servidor do app se conecta com as próprias chaves SSH e nunca pede senha, então ele precisa de uma chave lá que funcione sem senha (`ssh-copy-id`) e da chave de host do cluster já conhecida (conecte uma vez com `ssh` em um terminal).
- **SLURM** ou **SSH simples**.
- **Pasta lá para os logs das execuções** (`~/hydor-runs` para começar) e, no SLURM, a **Partição** e a **Conta**.
- **Linhas de configuração**, executadas antes de cada job lá: `module load cuda/12.1`, `source ~/venvs/ml/bin/activate`.

**Verificar** tenta `ssh host true` e depois `sinfo` (que lista as partições) no SLURM, ou `nvidia-smi` e tmux no SSH simples. **Adicionar** guarda o cluster; na lista, cada cluster tem **Verificar** e **Remover**.

Um job para um cluster roda em uma pasta lá (o código já precisa estar lá: clone-o lá). No **SLURM**, o app escreve um script de lote com as necessidades do job (as GPUs como `--gres=gpu:N`, processadores, memória, as horas como `--time`, a partição e a conta), suas linhas de configuração e o comando, e o envia com sbatch. Enquanto ele espera, o status explica o motivo, com a palavra do SLURM e em linguagem simples (“outros jobs vêm primeiro (Priority)”). O app o acompanha com squeue e sacct, copia o log dele para cá conforme cresce, e **Parar** o cancela com scancel. No **SSH simples**, as GPUs são escolhidas lá como aqui, e a execução vai para o tmux de lá. Uma conexão SSH por cluster é mantida aberta, então acompanhar execuções custa pouco.

## No celular

Não há coluna: a Visão geral começa com a fila, as GPUs e **Buscar um experimento**, e lista as avaliações (quando você tem alguma) e os experimentos como cartões. Um experimento, uma avaliação e uma execução abrem no lugar dela, com uma seta para voltar. A tabela de execuções rola para os lados, mantendo à vista a caixa de seleção e o nome de cada execução; as execuções dos gráficos formam uma linha de etiquetas acima deles, e **Suavização** fica no menu **Opções do gráfico**. O log de uma execução quebra as linhas na largura da tela, e **Acompanhar** funciona como no computador. Nova execução, Comparar e as tabelas abrem a partir da parte de baixo da tela.

## Peça a um agente

- “Treine isto em uma GPU livre e me avise quando terminar.”
- “Rode estes três controles hoje à noite e me diga de manhã o que eles mostraram.”
- “Execute o eval.py no cluster Unity com 2 GPUs por 4 horas.”
- “Varie a taxa de aprendizado entre 1e-4, 3e-4 e 1e-3 com as sementes 1, 2 e 3, e pare as execuções ruins mais cedo.”
- “Por que minha última execução falhou? Se a correção for clara, execute de novo.”
- “Coloque um agente de plantão neste treinamento: se faltar memória, reduza o tamanho do lote pela metade e retome a partir do último checkpoint.”
- “Faça uma tabela em LaTeX dos experimentos lora: acurácia e F1 em comparação com o baseline, com significância, e coloque no meu artigo.”
- “Quais das minhas execuções desta semana tiveram a melhor perda de validação, e quais eram os hiperparâmetros dela?”
- “Tente derrubar o resultado de que a nova perda supera a linha de base em ndcg@10.”
- “Dê títulos e descrições mais claros aos meus experimentos e organize-os em categorias.”
- “Na minha varredura de taxa de aprendizado, quais hiperparâmetros mais importam para a perda no conjunto de desenvolvimento?”
- “Mostre as curvas das 5 melhores execuções do experimento lora.”
- “Configure uma avaliação para este repositório.”
- “Pontue a minha branch em relação à linha de base.”
- “Por que a minha avaliação diz que há arquivos alterados?”
- “Evolua a função de pontuação em rank.py usando minha avaliação, com 100 tentativas.”
- “Como está indo a evolução?”
