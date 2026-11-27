# Experimentos

O Experimentos executa para você seus trabalhos de treinamento e avaliação. Um trabalho espera por uma GPU com memória livre suficiente em uma das suas máquinas (ou aguarda sua vez na fila de um cluster), é executado por conta própria e fica guardado como um registro: seu código, hiperparâmetros, ambiente, log e métricas, e o que o agente de plantão fez quando algo deu errado. Cada experimento (as execuções que você compara juntas) tem um título, uma descrição e uma categoria, e sua página mostra as execuções em uma tabela, suas métricas em gráficos e quais hiperparâmetros importam. Compare execuções ou crie uma tabela de resultados com testes de significância para o seu artigo. Os agentes também usam esse recurso: peça a qualquer agente para treinar algo em uma GPU livre, e ele inicia uma execução aqui.

![A página Experimentos: experimentos por categoria à esquerda e a aba Gráficos de um sweep: as curvas de suas seis execuções em gráficos compartilhados, cada execução com sua própria cor](images/experiments.webp)

## Abrir o Experimentos

Clique em **Experimentos** na barra de ícones, ou acesse [Experimentos](/experiments).

Na primeira vez que você abre a página, um tour curto, escrito para quem está começando com experimentos, mostra como ela funciona. Ele aparece enquanto as dicas estão ativadas, depois do tour de boas-vindas. Um cartão explica em palavras simples o que são um experimento e uma execução, e depois cada parte da página se ilumina, uma de cada vez, com um cartão próprio: **Nova execução**, a fila e as GPUs, seus experimentos por categoria, acompanhar uma execução ao vivo, comparar execuções e tabelas de resultados, e deixar um agente fazer o trabalho. Avance e volte com **Próxima** e **Voltar**; **Concluído** encerra o tour, e **Pular** ou Esc o fecha antes. **Me mostre como funciona** (o botão de bússola no canto superior direito da página) o inicia de novo a qualquer momento.

No computador, uma coluna à esquerda permanece ao lado de tudo o que você abre aqui:

- A linha da fila, no topo, diz o que está acontecendo ("2 em execução · 1 aguardando" ou "Nada em execução agora"). Abaixo dela, as GPUs deste computador como pequenos medidores: a memória que cada uma usa, na cor de destaque quando uma das suas execuções a ocupa (aponte para uma para ver o quanto está ocupada e qual execução a ocupa; clique nela para abrir essa execução). Quando você [limita as horas de GPU dos agentes](#what-agents-may-use-gpu-hours) e mais de quatro quintos do limite já foram usados, uma linha abaixo das GPUs avisa: "Agentes: 92 de 100 horas de GPU em sete dias".
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
- Abaixo da descrição, o que se descobriu: os achados registrados pelos seus agentes cuja evidência é uma das execuções do experimento, ou uma tabela de resultados delas, cada um em uma linha com **Confirmada**, **Refutada**, **Pouco claro** ou **Aberta**, como a [Memória](/guide/memory) do projeto os mostra, o que ele afirma e o que se aprendeu. Os três mais recentes aparecem; **mais N** mostra o restante, e um achado substituído por outro posterior não aparece. Um toque o abre na Memória do projeto dele. Quando há execuções concluídas e nenhum achado as cita, uma linha discreta diz “Nenhuma descoberta diz ainda o que este experimento mostrou”, com **Pedir a um agente que escreva**: a página inicial se abre com o pedido escrito e não enviado, na pasta da execução mais recente.
- Uma linha de contagens: "9 execuções + 6 tentativas anteriores · 1 em execução · 2 aguardando · 5 concluídos · 1 com falha · última execução há 2 h" (apenas o que for maior que zero). São contadas as execuções que aparecem; as [tentativas anteriores](#the-runs-table) e as execuções arquivadas, não.
- À direita, um menu ⋯, **Este experimento**: **Editar o título e a descrição** e **Escrever de novo** (veja [Títulos, descrições e categorias](#titles-descriptions-and-categories)), **Nova execução neste experimento**, **Novo sweep neste experimento**, **Criar uma tabela** (das suas execuções concluídas: veja [Tabelas de resultados para o seu artigo](#results-tables-for-your-paper)), **Comparar as 6 mais recentes**, **Marcar todas** (marca todas as execuções) e **Arquivar este experimento** (não enquanto execuções dele estiverem em andamento). Um experimento arquivado sai da coluna e da Visão geral, sem nada ser apagado: **Arquivados · 3**, uma linha discreta no fim da coluna (e da Visão geral, no celular), abre os arquivados, cada um com **Restaurar**. Uma execução iniciada em um experimento arquivado também o traz de volta. No celular, uma seta à esquerda do título volta à tela anterior.

Abaixo há três abas: **Execuções** (com a quantidade), **Gráficos** e **Hiperparâmetros** (quando o experimento tem duas ou mais execuções que diferem em um hiperparâmetro). A aba escolhida por último abre primeiro da próxima vez, neste dispositivo.

### A tabela de execuções

A aba **Execuções** lista as execuções do experimento em uma tabela, uma linha para cada: uma estrela, seu nome, seu status ("Executando 54%", "Concluído", "Com falha", "Aguardando uma GPU"; aponte para um status que está aguardando para ver o motivo), uma coluna para cada métrica (seu último valor; o melhor de cada coluna em negrito) e para cada hiperparâmetro, depois **Tempo de execução** e **Iniciada**. Quando as execuções do experimento estão em mais de um lugar, uma coluna **Onde** diz onde. As execuções em andamento vêm primeiro, depois as que aguardam, na ordem em que vão começar, depois as que terminaram, da mais recente para a mais antiga. Clique no nome de uma coluna para ordenar por ela (o primeiro clique em uma métrica coloca a melhor primeiro; clique de novo para inverter e uma terceira vez para voltar a essa ordem). A tabela rola para os lados, e a caixa de seleção e o nome de cada execução permanecem à vista.

- **Tentativas.** Uma execução que falhou, desapareceu ou foi parada e foi iniciada de novo (com **Executar de novo**, ou por um agente que informa qual execução ela substitui, ou simplesmente o mesmo comando, pasta, seed e configurações colocados na fila depois que ela terminou; onde elas gravam e de qual checkpoint continuam não contam) divide uma linha com a execução posterior: a mais recente, com uma etiqueta como **4.ª tentativa**. Toque na etiqueta para abrir abaixo dela as tentativas anteriores, cada uma com o status e o motivo do término em poucas palavras; toque de novo para recolhê-las. Executar de novo uma execução concluída é uma repetição, não uma tentativa: as duas mantêm suas linhas.
- **Estrelas.** Toque na estrela à esquerda de uma execução para marcar as que importam. As execuções com estrela vêm primeiro e são as primeiras nos gráficos. A página de uma execução tem a mesma estrela.
- **Notas.** Uma nota que você ou um agente escreveu sobre uma execução ("o bug do tokenizador ainda estava nesta") aparece como uma segunda linha sob o nome dela; a de um agente diz **Agente:** primeiro. Escreva ou altere a nota na [página da execução](#a-runs-page).

Acima da tabela:

- **Buscar uma execução** procura nos nomes, notas, comandos e tags das execuções (um resultado numa tentativa anterior abre a linha dela).
- **Filtrar**: por **Status** (**Todas as execuções**, **Em execução e aguardando**, **Concluído**, **Com falha ou perdidas**, **Interrompida**), quando as execuções estão em mais de um lugar **Onde**, e em **Mostrar**: **Com estrela**, **Tentativas anteriores também** (cada execução em sua própria linha, também nos gráficos e em Hiperparâmetros) e **Arquivadas** (as execuções deixadas de lado, cada uma com **Restaurar**). Enquanto uma busca ou um filtro está ativo, **× N exibidas** o limpa.
- **Colunas**: marque as métricas e os hiperparâmetros a exibir (uma caixa encontra um; um hiperparâmetro que difere entre as execuções mostra **Difere**). **Redefinir** volta às escolhidas pela página: as métricas que mais dizem sobre as execuções e os hiperparâmetros que diferem. Cada experimento mantém suas próprias colunas neste dispositivo.

Clique em uma linha para abrir a execução. Marque as caixas para comparar execuções ou agir sobre várias de uma vez (veja [Comparar execuções](#compare-runs)). A tabela mostra 50 linhas; **Mostrar mais N** exibe o restante.

Arquivar uma execução a retira da tabela, dos gráficos, das contagens e dos números da coluna, e não exclui nada: arquive pelo menu ⋯ da execução ou pela barra na parte de baixo. Uma linha arquivada leva junto as tentativas anteriores. Uma execução que não terminou não pode ser arquivada: pare-a primeiro. As tabelas de resultados que você já criou continuam contando as execuções que contavam, e uma nova tabela do experimento deixa de fora as execuções arquivadas.

### Gráficos

A aba **Gráficos** desenha, ao longo dos passos, cada métrica que as execuções imprimem, um gráfico para cada, com uma linha para cada execução. À esquerda (acima dos gráficos, no celular) ficam as execuções nos gráficos: **Nos gráficos** com a quantidade ("6 de 23"), depois todas as execuções do experimento, com um ponto colorido quando está exibida e um anel vazio quando não está. Clique em uma execução para exibi-la ou ocultá-la. Até 8 execuções aparecem ao mesmo tempo ("Até 8 execuções aparecem ao mesmo tempo: oculte uma primeiro"). Uma execução mantém sua cor enquanto está exibida, independentemente do que você oculte ou exiba, para que você possa acompanhar uma execução durante suas alterações; a mesma cor a marca na tabela de execuções. O menu ⋯ (**Quais execuções aparecem**) tem **Mostrar as 8 mais recentes**, **Mostrar as 8 melhores** (pela métrica principal do experimento), **Mostrar as execuções escolhidas** (as que você marcou na tabela) e **Ocultar todas**. No início, aparecem as execuções com estrela e depois as primeiras que têm curvas, 8 ao todo. Execuções arquivadas ficam de fora, aqui e em **Hiperparâmetros**, assim como as tentativas anteriores, a menos que **Filtrar** → **Tentativas anteriores também** esteja ligado. Cada experimento mantém sua escolha neste dispositivo.

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
2. Digite o **Comando**, como você faria na pasta dele: `python train.py --lr 3e-4`.
3. Escolha a **Pasta** em que ele é executado e **Onde executa**: **Este computador**, uma das suas outras máquinas ou um cluster (veja [Para onde vão as execuções](#where-runs-go)).
4. Defina as **GPUs** de que ela precisa (0 executa sem nenhuma) e **Memória livre de cada uma (GB)**. Se ficar vazio, ela espera por uma GPU que ninguém esteja usando. Se for preenchido, ela pode dividir uma GPU com outras execuções suas, quando a memória couber (consulte [Como a fila escolhe](#how-the-queue-chooses)).
5. Dê um **Nome** se quiser (caso contrário, o nome do script) e um **Experimento**: as execuções de um experimento são listadas, exibidas em gráficos e comparadas juntas (a caixa sugere os que você tem).
6. **Início** diz quando ela começa: **Quando uma GPU estiver livre** ou **Hoje à noite** (consulte [Execuções que esperam pela noite](#runs-that-wait-for-the-night)). Depois clique em **Início** (ou [teste antes](#try-it-first)).

**Mais opções** contém o restante:

- **Hiperparâmetros**: linhas nome=valor (`lr=3e-4`), guardadas com a execução, exibidas como colunas na tabela de execuções do seu experimento e comparadas em tabelas. Os hiperparâmetros no próprio comando são lidos automaticamente: `--name value`, `--name=value` e palavras `name=value` depois do programa (como o Hydra as recebe). Uma flag que só diz onde o comando grava ou de qual checkpoint ele continua (`--out outputs/a`, `--resume last.pt`) não é lida como hiperparâmetro. `{name}` no comando recebe o valor de um hiperparâmetro.
- **Seed** (`{seed}` no comando recebe o valor; `--seed` no comando também é lido), **Prioridade** (a maior vai primeiro) e **Limite de tempo (horas)** (ela é interrompida após esse tempo).
- **Para continuar após uma interrupção**: o comando que retoma a execução a partir do último checkpoint, como `python train.py --resume outputs/a/last.pt`, e, abaixo dele, **Avisar esta quantidade de segundos antes de uma interrupção** (30, a menos que você mude; de 5 a 600). Veja [Interromper e continuar](#stopping-and-carrying-on).
- **Uma GPU só para ela** (para uma execução que precisa de GPUs): nenhuma outra execução sua vai para as GPUs dela enquanto ela estiver rodando, por mais memória que peça. É útil quando você está medindo velocidade.
- **Arquivo de métricas**: um arquivo no qual a execução grava métricas como linhas JSON, além do que ela imprime. **Pontuações por exemplo**: um arquivo de pontuações por exemplo (veja [Tabelas de resultados para o seu artigo](#results-tables-for-your-paper)).
- **Avisar-me**: **Quando termina** e **Quando falha** (ambos ativados, a menos que você os desmarque) e **Quando uma métrica ultrapassa um valor** ("val_acc > 0.9").
- **Agente de plantão**: veja [O agente de plantão](#the-agent-on-call).
- Em um cluster SLURM: **Processadores**, **Memória (GB)** e **Partição**.

A nova execução é aberta, para que você a veja começar. Para adicionar uma execução a um experimento que você está vendo, use **Nova execução neste experimento** no menu ⋯ dele: **Experimento** já vem preenchido. Logo após a primeira execução de um experimento, o modelo auxiliar dá a ele um título, uma descrição e uma categoria (veja [Títulos, descrições e categorias](#titles-descriptions-and-categories)).

## Testar antes

Antes de uma execução longa, **Testar antes** (ao lado de **Início** em Nova execução, para um comando neste computador) executa o mesmo comando, na mesma pasta e com o mesmo ambiente, por 90 segundos e depois o interrompe. Em uma varredura, o teste usa a primeira combinação. Ele espera na fila por uma GPU, como a execução de verdade esperaria; **Parar** encerra o teste antes da hora, e fechar a janela também.

Depois, a janela informa em poucas linhas:

- se o comando funciona (um teste que falha mostra onde ocorreu o primeiro problema),
- quanta memória de GPU ele usou no máximo, e o que isso significa para **Memória livre de cada uma (GB)** (um décimo a mais, arredondado para cima até um número inteiro de GB),
- quanto tempo a execução completa deve levar, quando a saída informa até onde ela precisa ir (uma barra de progresso, ou “step 40/5000”); um teste que rodou até o fim levou mais ou menos o mesmo tempo que a execução completa.

**Usar estes** coloca nos campos essa memória e um limite de tempo (a estimativa mais um quarto).

Durante o teste, o comando encontra `HYDOR_TRY=1` e `HYDOR_TRY_SECONDS` no ambiente: um script que lê essas variáveis pode pular o que é demorado ou parar mais cedo (nesse caso, a execução completa demora mais que um teste que rodou até o fim). Um teste roda o comando real na pasta real, então grava os arquivos de saída e de checkpoint reais do comando. Um teste não é um resultado: ele fica fora das listas e tabelas dos experimentos e do aviso da manhã, e não notifica ninguém. A página dele continua disponível, com o log.

O que foi aprendido fica guardado: na próxima vez que você iniciar o mesmo comando na mesma pasta (os números no comando podem ser diferentes), **Memória livre de cada uma (GB)** mostra o máximo que ele usou da última vez, e um agente que o inicie é informado disso.

## Como a fila escolhe

- As tarefas seguem a ordem de prioridade e, depois, de antiguidade. Uma tarefa que precisa de GPUs fica com as que têm memória livre suficiente: primeiro uma vazia, depois a que tem mais espaço. Enquanto não houver GPUs livres o bastante, ela espera e diz o motivo: “Esperando 1 GPU com 20 GB livres: o máximo livre agora é 12 GB, na GPU 2; suas outras execuções ocupam a GPU 0”. Quando outro programa ocupa memória em uma GPU, o motivo diz qual é: “outro programa (ollama) ocupa 9 GB na GPU 2”. Uma tarefa menor que está atrás na fila pode começar antes, se aquilo de que ela precisa estiver livre.
- **Compartilhamento de GPU**: uma tarefa que informa de quanta memória precisa (**Memória livre de cada uma (GB)**) pode ir para uma GPU onde já estão outras execuções suas, desde que a memória caiba. O que conta é a memória da placa, menos o que está em uso ou o que essas execuções pediram (o que for maior, já que uma execução recém-iniciada ainda não ocupou sua memória), menos uma margem de 1 GB ou 5% da placa (o que for maior). Três execuções que precisam de 7 GB cada vão para uma placa de 24 GB, e a quarta espera. Uma tarefa que não informa de quanta memória precisa recebe uma GPU só para ela, e nenhuma outra se junta a ela; o mesmo vale para uma com **Uma GPU só para ela** ativada. Desative o compartilhamento em [Para onde vão as execuções](#where-runs-go) para que cada GPU receba uma execução por vez. Execuções em um cluster ou por SSH simples não compartilham GPU; uma execução enviada a outra das suas máquinas segue a configuração daquela máquina.
- **Uma espera longa**: uma tarefa que esperou 20 minutos por GPUs passa a ser a próxima. Até ela começar, nenhuma tarefa atrás dela ocupa uma GPU que ela poderia usar, a não ser que essa tarefa tenha um **Limite de tempo (horas)** que termine antes do primeiro momento em que as GPUs esperadas poderiam estar todas livres. As outras dizem “Esperando atrás de “big training”, que precisa de 4 GPUs e já esperou 2 h”. Uma tarefa com prioridade mais alta continua indo primeiro, e tarefas sem GPU não são retidas. Nada é reservado para uma tarefa quando outros programas deixam GPUs insuficientes para ela.
- **Previsão de início**: o motivo de uma tarefa em espera termina com um horário no seu próprio relógio, “Por volta de 14:20, quando “trainer” deve terminar”, calculado a partir do quanto avançaram as execuções que ocupam o que ela precisa (conforme elas mostram na saída) ou dos limites de tempo delas. Quando o horário vem de um limite de tempo, o texto diz isso, “Por volta das 14:20 no mais tardar, quando “trainer” atingir o limite de tempo”, pois a execução pode muito bem terminar antes. Quando elas não informam nenhum dos dois, o texto é “Não dá para saber quando: essas execuções não informam quanto falta”. O cálculo é refeito mais ou menos uma vez por minuto, e é uma estimativa: uma execução pode demorar mais.
- Depois de 6 horas de espera, você recebe um único aviso, como ““big training” está esperando há 6 horas por 4 GPUs”, que abre a execução (um só para uma varredura inteira).
- Tarefas sem GPU começam na hora, algumas de cada vez; a quantidade é definida em [Para onde vão as execuções](#where-runs-go) (no início, metade das threads do computador, de 1 a 16).
- Um trabalho que pede mais GPUs do que o computador tem, ou uma GPU em um computador sem GPUs NVIDIA, falha de imediato e informa isso.
- Uma execução vê apenas as suas próprias GPUs (CUDA_VISIBLE_DEVICES); uma sem GPU não vê nenhuma. Ela também recebe HYDOR_RUN (seu id), HYDOR_RUN_DIR (sua pasta), HYDOR_SEED e HYDOR_GRACE_SECONDS (os segundos que ela tem entre o aviso e a parada à força), e o Python imprime imediatamente (PYTHONUNBUFFERED), de modo que o log acompanha em tempo real.
- As execuções continuam no tmux (ou em segundo plano, onde não há tmux) quando o app reinicia ou é atualizado. Quando o app volta, ele as encontra de novo, lê o que imprimiram nesse meio-tempo e vê quais terminaram; uma cujo processo desapareceu é marcada como **Sumiu** (e, quando diz como continuar, é começada de novo: veja [Interromper e continuar](#stopping-and-carrying-on)).

## Execuções que esperam pela noite

Quando as suas GPUs também são usadas no seu próprio trabalho durante o dia, ou por serviços que precisam continuar rápidos, mande para a noite o que pode esperar (controles, varreduras mais amplas, ideias que vale a pena testar). Uma execução noturna só começa no horário noturno do computador em que ela roda, e só quando nenhuma outra execução sua está esperando ali pela mesma coisa (uma GPU, ou um lugar entre as execuções sem GPU): essas sempre vão primeiro, quaisquer que sejam as prioridades. Até lá, ela mostra **Esperando pela noite (a partir de 23:00)**, e a linha da fila conta essas execuções à parte.

- **O horário**: em [Para onde vão as execuções](#where-runs-go), **Noite das** um horário **às** outro, de 23:00 a 07:00, a menos que você mude (a noite pode atravessar a meia-noite). Vale o seu próprio fuso horário, como o seu navegador informou (se não informou, o relógio do próprio computador); uma execução enviada para outra das suas máquinas espera pela noite daquela máquina. Com o mesmo horário nos dois campos, não há noite, e as execuções noturnas esperam até você definir uma. Um cluster tem a própria fila, por isso não é possível enviar uma execução noturna para ele.
- **Quando a noite acabar**: **Deixar as execuções em andamento terminarem** (a opção inicial) ou **Interrompê-las e começá-las de novo na noite seguinte**. Uma execução interrompida recebe um aviso antes (veja [Interromper e continuar](#stopping-and-carrying-on)). A menos que informe como continuar, ela recomeça do início (o log que ela tinha é mantido na pasta dela) e, até lá, mostra “A noite acabou: a execução começa de novo hoje à noite”. Quando informa, ela continua do checkpoint na noite seguinte, com o mesmo código e mantendo as curvas, e mostra “Interrompida no fim da noite: continua do checkpoint hoje à noite”. Mudar o horário de modo que não seja mais noite também encerra a noite.
- **Como começar uma**: em “Nova execução”, para uma execução ou uma varredura, defina **Início** como **Hoje à noite**; o horário da noite aparece escrito ao lado. A caixa de diálogo sempre abre em **Quando uma GPU estiver livre**, inclusive com **Executar de novo**. Com **Hoje à noite** escolhido para uma pasta em Git neste computador, uma linha abaixo diz "Executa o código como está agora, mesmo que a pasta mude antes desta noite." (veja [O que uma execução registra](#what-a-run-records)), então você, ou um agente, pode continuar editando a pasta.
- **De manhã**: um único aviso, como “Noite passada: 5 execuções concluídas, 1 com falha, 2 ainda esperam por hoje à noite”, abre Experimentos com as execuções daquela noite em primeiro lugar. Uma execução noturna que termina durante a noite não envia um aviso próprio de “concluída” (uma falha é avisada como sempre, e uma sessão que pediu para saber continua sendo informada de como foi); uma que termina depois do aviso da manhã é avisada separadamente. Uma execução noturna retida no seu [limite de horas de GPU dos agentes](#what-agents-may-use-gpu-hours) é contada à parte ("3 aguardam você"). Não há aviso quando nenhuma execução noturna terminou nem está esperando.
- **Uma busca à noite**: o [Evoluir](#evolve-searching-for-a-better-version) iniciado com **Hoje à noite** trabalha só nesse horário. As pontuações dele não são contadas entre as execuções da noite: o aviso diz em uma frase própria quantas versões a mais ele testou e qual é a melhor (e quando só buscas trabalharam, abre a primeira delas).
- **Os agentes** também mandam execuções exploratórias para a noite; o cartão de aprovação deles diz quando a execução vai começar.

## Interromper e continuar

Uma execução interrompida pelo próprio app, porque atingiu o **Limite de tempo (horas)**, porque a noite acabou ou porque a parada antecipada de uma varredura considerou que ela estava perdendo, recebe um aviso antes. Ela recebe Ctrl-C (o sinal SIGINT, que o Python transforma em `KeyboardInterrupt`) e depois tem 30 segundos, ou o número definido em **Avisar esta quantidade de segundos antes de uma interrupção**, para salvar um checkpoint e sair. Uma execução que sai nesse prazo fica como **Interrompida**, com o mesmo motivo, qualquer que seja o código de saída. Uma que não sai é encerrada à força (TERM e, 10 segundos depois, KILL), e **O que aconteceu** informa isso. Um script lê esse número em `HYDOR_GRACE_SECONDS`. Quando você mesmo interrompe uma execução (ou um agente faz isso), ela recebe Ctrl-C e 10 segundos, como sempre, a menos que a execução tenha pedido uma quantidade de segundos: nesse caso, é esse o prazo dela. No Windows não há aviso: ela é encerrada na hora.

**Para continuar após uma interrupção** é o comando que retoma a execução a partir do último checkpoint, muitas vezes o mesmo comando com uma opção a mais. Os marcadores `{name}` são preenchidos como no comando. Com ele:

- Uma execução noturna interrompida no fim da noite continua do checkpoint na noite seguinte, em vez de recomeçar.
- Uma execução que **Sumiu** (o processo desapareceu sem código de saída: o computador reiniciou ou o tmux morreu) é iniciada de novo com esse comando, como uma nova execução que entra na fila como qualquer outra, mostrada como a próxima tentativa da mesma coisa. No máximo duas vezes seguidas; depois disso, ela continua como sumida e você é avisado. Isso funciona neste computador, nas suas outras máquinas e em máquinas com SSH simples.
- Uma execução que um cluster SLURM toma de volta (preempção) é enviada de novo da mesma forma, no máximo duas vezes.
- **Executar de novo** em uma execução que foi interrompida ou falhou oferece **Continuar de onde parou** ao lado de **Recomeçar** (a primeira opção vem marcada para uma execução interrompida; a segunda, para uma que falhou).

Uma execução que atingiu o limite de tempo não é iniciada de novo sozinha: **Executar de novo** oferece continuar.

Uma execução que continua, de qualquer uma dessas formas, executa **o mesmo código** da execução que ela continua, guardado como descrito em [O que uma execução registra](#what-a-run-records), mesmo que você tenha alterado a pasta desde então: um treinamento nunca muda de código entre checkpoints. Por isso, **Executar de novo** não pergunta nada sobre **Código** enquanto **Continuar de onde parou** está marcado. Quando não é possível restaurar esse código (era grande demais para ser guardado), a execução não continua, e o app avisa. (Uma execução em cluster, e uma fora do Git, executa o que estiver na pasta dela.) Para continuar de propósito com o código alterado, comece uma nova execução cujo comando seja o de retomada.

Uma execução que o app inicia de novo sozinho é mostrada como a próxima tentativa, conta como sendo do mesmo agente, ou sua, para o [limite de horas de GPU dos agentes](#what-agents-may-use-gpu-hours) (fica retida quando o limite é atingido, como qualquer execução desse agente ficaria), e uma que você tinha liberado para rodar além do limite continua liberada.

Uma nova execução tem uma pasta própria, então guarde os checkpoints em um lugar que não mude de uma execução para outra (a pasta do projeto, não `$HYDOR_RUN_DIR`), e faça o comando lidar com o caso de ainda não haver checkpoint. A página de uma execução informa qual comando foi executado (“Continuou a partir de um checkpoint”).

## O que os agentes podem usar: horas de GPU

As **Horas de GPU** de uma execução são as GPUs dela vezes as horas em que roda: 4 GPUs por 6 horas são 24. Uma execução sem GPU não conta nenhuma.

**Antes de uma execução começar**, o cartão com que um agente pede sua autorização diz o que ela pode usar:

- “At most 24 GPU hours (4 GPUs × 6 h)” quando a execução tem um limite de tempo (uma varredura: “At most 24 GPU hours (12 runs × 1 GPU × 2 h)”),
- senão, “About 3 GPU hours, going by its last run”, com base no tempo que levou a última execução concluída do mesmo comando na mesma pasta,
- senão, “No time limit: it runs until it ends”.

Um limite de tempo conta onde quer que a execução rode, inclusive num computador acessado por SSH simples.

**Um orçamento para um plano.** Em vez de um cartão para cada execução, um agente pode pedir de uma só vez as horas de GPU de que o plano precisa: “Permitir 36 horas de GPU de execuções?”, com o motivo e “This session's runs that stay within it start without asking you again.”, e **Permitir** ou **Não**. Nada começa com isso. Depois que você permite, as execuções daquela sessão começam sem cartão enquanto o que as execuções dela usaram desde então, mais os limites de tempo das que estão esperando ou rodando, mais o da nova, ficar dentro do orçamento. Com um orçamento, toda execução em GPU precisa de um limite de tempo. Uma execução que ultrapassaria o orçamento pede autorização no cartão comum, que também diz “This session's budget of 36 GPU hours has 4 left”. Um novo orçamento toma o lugar do antigo, e ele acaba quando a sessão é excluída. Uma busca ([Evoluir](#evolve-searching-for-a-better-version)) sempre pede autorização por si só.

**Um limite para todos os agentes.** Em [Para onde vão as execuções](/experiments?places=1), **Execuções dos agentes: no máximo N horas de GPU em sete dias** define o que as execuções dos agentes nas GPUs deste computador podem usar em quaisquer sete dias (vazio: sem limite, como no início). Ele vale também em sessões com acesso total. Execuções dos agentes são as iniciadas por uma sessão (incluindo o agente de uma tarefa agendada e o [agente de plantão](#the-agent-on-call)), pela etapa de um app, pela pontuação de um objetivo ou por uma evolução que um agente começou. As execuções que você mesmo inicia nunca são contadas nem retidas; execuções em um cluster ou em outra máquina não são contadas aqui (outra máquina tem seu próprio limite).

Quando o limite é atingido, uma nova execução de um agente em GPU é aceita, mas fica **retida**: ela diz **Espera por você**, com “Espera por você: os agentes usaram 100 de 100 horas de GPU nos últimos sete dias”, não começa e não segura nenhuma outra execução. Você recebe um aviso por dia, e o agente é informado, para que possa avisar você em vez de iniciar mais. Na página da execução:

- **Deixar executar** inicia aquela execução quando chegar a vez dela, além do limite.
- **Alterar o limite…** abre Para onde vão as execuções.

As execuções retidas começam sozinhas, as mais antigas primeiro, quando os sete dias voltam a ter folga, ou quando você aumenta ou esvazia o limite. A decisão de reter uma execução é tomada quando ela está prestes a começar, com base no que as execuções dos agentes usaram até ali: com 99 de 100 usadas, as execuções que encontrarem uma GPU livre podem começar, e as que ainda estiverem na fila depois que 100 for ultrapassado ficam retidas.

Uma nova pontuação ou busca de um agente é recusada enquanto o limite está atingido. Uma que já está em andamento também para no limite: as execuções que a pontuam (para uma busca iniciada por um agente, ou para um objetivo) são retidas como qualquer outra, e a busca espera pela pontuação. A página dela diz por quê, com as mesmas palavras e quantas ela já tentou, e **Deixar executar** ali permite que a busca inteira continue além do limite. Suas próprias pontuações e buscas nunca são retidas. Um objetivo não conta o tempo em que sua pontuação fica retida no tempo que ele dá a uma pontuação.

## O que uma execução registra

- **O código**: o commit e o branch do repositório Git da pasta dela e se havia alterações sem commit; se havia, um patch delas (sem arquivos binários, no máximo 2 MB) e quantos arquivos o Git não rastreia. Neste computador (e nas suas outras máquinas) tudo isso é lido **quando a execução entra na fila**, e é esse o código que ela executa, mesmo que a pasta mude enquanto espera (veja **O código que ela executa**, abaixo); a execução de um cluster, um teste e uma execução que pontua uma avaliação o leem ao começar. Neste computador, os arquivos citados no comando que o Git não rastreia ou ignora (um script sem commit, um pequeno arquivo de configurações) são copiados para a pasta da execução, em `untracked/`, para que você possa executá-la de novo mais tarde; o que o comando grava (os resultados de uma execução anterior) e os checkpoints dele (`--ckpt`, `--resume`) não são copiados. Arquivos seus fora da pasta da execução que o comando cita (por um caminho completo, um caminho com `..` ou `~`) também são copiados, para `untracked/outside/`, com seus nomes, e listados como o comando os escreveu: por exemplo, um script do seu checkout principal executado a partir de um worktree do Git. Não são copiados os que outro checkout ou worktree do mesmo repositório já tem em commit, sem alterações, no commit da execução, nem arquivos de sistema ou de pacotes (em `/usr`, `/opt`, `node_modules`, `site-packages`, programas de um ambiente virtual…), nem os dados do próprio app. Ao todo, no máximo 1 MB por arquivo e 5 MB por execução, e nunca um arquivo que pareça conter uma chave ou uma senha. O registro diz “Fora do git, guardados com a execução” e quais eram grandes demais para guardar.
- **O código que ela executa** (neste computador e nas suas outras máquinas, em um repositório Git; Linux e macOS): uma execução pode esperar horas por uma GPU, ou pela noite, enquanto a mesma pasta é editada para o próximo experimento. Por isso, quando uma execução entra na fila, o app também guarda os outros arquivos da pasta que o Git não rastreia (e não ignora) e que são código ou configurações (`.py`, `.sh`, `.bash`, `.yaml`, `.yml`, `.toml`, `.cfg`, `.ini`, `.conf`, `.jinja`, `.j2`, `.sql`, `.r`, `.jl`, `.lua`, `.js`, `.ts`, `.mjs`), dentro dos mesmos limites. Quando ela começa, o código da pasta é comparado com isso. Se for o mesmo: ela roda na própria pasta, como sempre. Se tiver mudado (um arquivo editado, excluído ou incluído em um commit com outro conteúdo; um arquivo novo desde então não conta): ela roda a partir de **uma cópia do código como estava ao entrar na fila**, feita na pasta da própria execução.
- **Código ou dados**, decidido para cada arquivo quando a execução entra na fila. **Dados** nunca são comparados e, em uma cópia, são um link para o seu próprio arquivo, então o que é escrito vai parar na sua pasta: tudo o que o Git não rastreia e não é código; o que o comando escreve (um redirecionamento como `> log.txt` ou `| tee`, e o valor de uma flag cujo nome começa com `-o`, `--out`, `--save`, `--log`, `--result`, `--dump`, `--report`, `--write`, `--pred`, `--export`, `--checkpoint` ou `--ckpt`; em uma pasta nomeada dessa forma, tudo menos os códigos-fonte de programas), os arquivos de métricas e de pontuações; e qualquer arquivo, rastreado ou não, terminado em `.csv`, `.tsv`, `.jsonl`, `.ndjson`, `.log`, `.out`, `.parquet`, `.feather`, `.pkl`, `.pickle`, `.pt`, `.pth`, `.ckpt`, `.safetensors`, `.npy`, `.npz`, `.h5`, `.hdf5`, `.db`, `.sqlite` ou `.sqlite3`. **Código** é o restante: os arquivos que o Git rastreia, os arquivos que o comando cita e outros arquivos não rastreados com terminação de código. Assim, uma varredura em que cada execução reescreve um arquivo de resultados roda no próprio lugar. Uma execução que reescreve código ou configurações rastreados (um `.json` rastreado, por exemplo) faz com que as execuções colocadas na fila depois usem uma cópia: grave os resultados em arquivos que o Git não rastreia ou ignora, ou indique-os com uma flag de saída.
- **Na cópia**, os caminhos no comando que citam a sua pasta levam à cópia (a página da execução então mostra o comando como **Executado como**); `$HYDOR_CODE_DIR` é a cópia e `$HYDOR_PROJECT_DIR` é a sua pasta (nos outros casos, os dois são a sua pasta). A cópia tem um histórico Git próprio que pega emprestado o do seu repositório, então `git rev-parse HEAD` nela retorna o commit da entrada na fila; nada muda no seu repositório. Quando a execução termina, o que ela criou na cópia (uma nova pasta `results`, um novo arquivo) é movido para o mesmo lugar na sua pasta, mas só onde não há nada: nada seu é sobrescrito. O que não pôde ser movido (já existe algo lá, a execução colocou um arquivo no lugar de um link ou alterou um arquivo do código) fica na cópia, e a página da execução lista esses itens; o restante da cópia é removido. Caches (`__pycache__`, `.pyc`) não são movidos. Se o código era grande demais para guardar (um patch com mais de 2 MB, ou código e configurações acima dos limites) e a pasta mudou, a execução não começa com um código que ninguém escolheu: ela falha com “O código mudou enquanto aguardava e era grande demais para ser guardado como estava na fila: execute de novo”. Arquivos de dados grandes e checkpoints são ligados por link, não guardados, e não contam. Um agente pode pedir, em vez disso, a pasta como estiver quando a execução começar (`code: "now"`); a execução então informa isso. Um agente que roda uma execução de novo depois que o código mudou precisa dizer qual dos dois quer, como **Executar de novo** pergunta: o código próprio da execução ou a pasta como está agora. Uma execução em um **cluster** não é afetada: o código dela é o que a pasta dela lá contiver quando começar.
- **Seu ambiente**: o computador; o Python com que o comando é executado e as versões de PyTorch, Transformers, JAX, TensorFlow e NumPy nele (lidas dos pacotes, nada é importado); com GPUs, as versões do CUDA e do driver e os nomes das GPUs.
- **Seus hiperparâmetros e seed**, seu **log**, seu **código de saída** e sua própria pasta nos dados do app (com o log, o patch, o código de saída e as métricas).
- **O que ela usou** (execuções neste computador): enquanto ela roda, a cada 10 segundos (a cada 30 depois de dez minutos), a memória de GPU que os próprios programas dela ocupam em cada uma das suas GPUs e o quanto essas GPUs estão ocupadas, além do processador e da memória usados pelos programas dela (no Linux). O registro guarda o máximo que ela usou e o que outros programas ocupavam nas GPUs dela no início e no fim.
- **Suas métricas**, lidas da saída dela conforme cresce: pares `key=value` (`loss=0.42`, como as barras de progresso do Lightning imprimem), um objeto JSON em uma linha (`{"step": 100, "loss": 0.42}`), dicts impressos do Python (como o Trainer do Hugging Face imprime), o “loss: 0.41 - accuracy: 0.87” do Keras e o arquivo de métricas. O passo vem de `step`, `global_step`, `iter` ou `epoch`. De cada métrica ela guarda o último valor, o melhor (quanto menor, melhor para perdas, erros, perplexidade e semelhantes, pelos nomes; quanto maior, melhor para as demais) e uma série para os gráficos. Uma métrica que ela imprime várias vezes é uma curva; um número que imprime uma vez é um valor (seus hiperparâmetros no início, seus resultados no fim). Ela guarda até 100 métricas: quando uma execução imprime mais, as curvas são mantidas antes dos números impressos uma vez.
- **Quanto já andou**, quando a saída informa: uma barra de progresso (a do tqdm, como o Trainer do Hugging Face desenha, ou uma chamada de treinamento ou de passos), “step 120/1000”, ou um total de passos que ela imprime (`total_steps`, `max_steps`, `num_training_steps`…) junto com seus passos.

## A página de uma execução

Clique em uma execução (em uma tabela, em um cartão ou no medidor de uma GPU). No computador, ela abre no lugar do experimento, com a coluna ainda à esquerda; em uma tela estreita, ocupa a tela toda, com uma seta para voltar. O caminho de volta é o link no canto superior esquerdo, com o nome do experimento da execução (**Visão geral** para uma execução sem experimento).

- Abaixo do nome: onde a execução está entre as tentativas (“A 4.ª tentativa: a 3.ª ficou sem memória”, com um link para essa anterior; em uma mais antiga, “Começou de novo como” com um link para a execução posterior), depois **Adicionar uma nota**, uma linha de no máximo 500 caracteres sobre a execução para quem a ler mais tarde, alterada ali mesmo com um toque (uma linha vazia a apaga).
- O cabeçalho: o nome da execução; uma estrela; **Parar** enquanto ela está em andamento ou em espera (“Parando” enquanto para); **Executar de novo**, que abre Nova execução já preenchido com os hiperparâmetros dela, para você alterar antes de começar (quando o código da pasta mudou desde então, também pergunta **Código**: **O código próprio**, já escolhido, ou **A pasta como está agora**; numa execução interrompida que diz como continuar, pergunta **Checkpoint**: **Continuar de onde parou** ou **Recomeçar**); e **Mais** (⋯): **Arquivar** ou **Restaurar** (depois que ela terminou), **Copiar o comando**, **Sua pasta em Arquivos**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para computador; consulte [Trabalhar com arquivos e pastas](/guide/files-git#work-with-files-and-folders)) e, depois que ela termina, **Excluir o registro** (veja abaixo). No celular, **Executar de novo** fica no menu ⋯.
- A linha de status: o status, com quanto tempo levou depois que terminou, o código de saída quando não é 0, onde é executada, suas GPUs e quando começou. Enquanto é executada e a saída informa quanto já andou: uma barra, os passos feitos do total (“9.120 de 10.878 · 84%”) e mais ou menos quanto falta, calculado pelo tempo que levou até agora. Uma execução que espera ou falhou diz por quê. Uma retida no [limite de horas de GPU dos agentes](#what-agents-may-use-gpu-hours) tem ali **Deixar executar** e **Alterar o limite…**.
- Três abas: **Visão geral**, **Gráficos** (com quantas curvas ela tem) e **Log**.

A **Visão geral** contém:

- **Onde deu errado pela primeira vez**, em primeiro lugar, para uma execução que falhou ou desapareceu, quando o log mostra isso: o primeiro traceback do Python (com a última linha) ou a primeira linha com um erro, algumas linhas ao redor e **Abrir o log na linha N**, que mostra o log a partir dali. A falta de memória só é apontada como motivo quando o log ou o computador diz isso: “A memória da GPU 2 acabou: tinha chegado a 21.8 de 24 GB, e outro programa ocupava 9.1 GB nela quando a execução começou”. Uma execução encerrada à força sem esse sinal diz “O processo foi encerrado (código de saída 137)”.
- **Como terminou**: as últimas linhas do log e **Abrir o log** (omitido quando são as mesmas linhas).
- **Métricas principais**: um bloco para cada uma de até seis métricas que dizem como ela se sai (nunca itens de controle, como a taxa de aprendizado ou a contagem de tokens), com o último valor, o melhor quando é diferente e uma curva pequena. Clique em um bloco para abrir a aba **Gráficos** naquela métrica.
- **Hiperparâmetros**: os que ela recebeu ou que foram lidos do comando (uma caixa encontra um quando há muitos).
- **Valores**: os números que ela imprimiu uma vez, por nome: seus hiperparâmetros no início, seus resultados no fim. **Todos os N** mostra mais de doze, com uma caixa para encontrar um.
- **Detalhes**: o experimento (com um link para ele), o status, quando começou e terminou, quanto tempo levou, onde é executada, as GPUs, o máximo que usou, a semente, a prioridade, a sessão que a iniciou e a execução da qual ela é uma nova execução.
- **Código**: o commit e o branch, **Ver as alterações** para o patch (ou “Nada mudou desde”; “Tudo com commit” quando a pasta tinha mudado enquanto ela esperava), quantos arquivos o Git não rastreia e os nomes daqueles usados pelo comando que foram guardados com a execução ou eram grandes demais para guardar. Quando a pasta tinha mudado entre a entrada na fila e o começo, uma frase diz qual código foi executado (“Executou o código como estava quando entrou na fila. A pasta tinha mudado desde então: train.py, config.yaml e mais 2.”) e, enquanto ela roda a partir de uma cópia, que o que grava em pastas novas aparece na sua pasta quando termina. **Abrir o código** (numa execução deste computador que já começou) mostra o código em **Arquivos**: enquanto uma execução roda a partir de uma cópia, essa cópia; senão, o código como foi guardado, montado nesse momento (ao lado do que restou da cópia dela, que fica como a execução a deixou, para você comparar as duas). Uma execução que deixou arquivos na cópia os lista, com onde estão.
- **Comando**: o comando e a pasta, com **Sua pasta em Arquivos**; numa execução a partir de uma cópia cujo comando ou variáveis foram apontados para a cópia, **Executado como** logo abaixo; o comando **Para continuar após uma interrupção** quando houver, e acima dele “Continuou a partir de um checkpoint” quando a execução fez isso. **Ambiente**: o computador, o Python, os pacotes e as GPUs.
- **O que aconteceu**: seus eventos, com os horários: quando esperou, começou e terminou, e o que o agente de plantão viu e fez, com **Abrir a sessão**.

**Gráficos** desenha as curvas da execução como a aba de um experimento faz (consulte [Gráficos](#charts)), só desta execução, e as lê de novo a cada poucos segundos enquanto ela está em andamento. Abaixo delas, **Sistema** mostra o que ela usou ao longo do tempo, em minutos desde o início: memória de GPU e uso de GPU para cada uma das GPUs, processador (100% é um núcleo, então quatro núcleos ocupados são 400%) e memória (recolhido no celular até você abrir). **Log** mostra a saída, com o mais recente embaixo. Enquanto ela está em andamento, **Acompanhar** mantém o mais recente à vista; role para cima para ler e o acompanhamento para. **Buscar no log** mostra somente as linhas que correspondem (“12 linhas correspondem”), e o acompanhamento fica pausado enquanto isso.

Uma execução que falhou, ou que desapareceu, tem **Perguntar o motivo a um agente** no topo (no menu ⋯ no celular): uma nova sessão na pasta da execução lê o registro e o log, diz a causa em duas frases e propõe a menor correção possível. Ela não altera nem inicia nada antes de você autorizar.

**Parar** envia Ctrl-C aos programas da execução e depois os interrompe com mais força se não tiverem terminado após 10 segundos, ou após os segundos que a execução pediu (veja [Interromper e continuar](#stopping-and-carrying-on)). Uma execução que só estava esperando sai da fila na hora.

**Excluir o registro** pergunta antes e diz o que será apagado: o registro da execução e o log, e os arquivos que ela gravou na própria pasta de execução (a que ela encontra como `$HYDOR_RUN_DIR`, como checkpoints e pontuações por exemplo; as cópias do código também vão embora, sem serem contadas, exceto o que a execução deixou numa delas; os links de uma cópia são removidos, nunca aquilo para onde apontam), com quantos são, o tamanho e os nomes de até três, o maior primeiro. O que ela gravou na pasta do projeto permanece. Quando esses arquivos passam de 100 MB, há também **Manter esses arquivos**: o registro é excluído mesmo assim, os arquivos são movidos para `kept-runs/` e o id da execução na pasta de dados do Hydor, ao lado da pasta de experimentos, e a janela diz para onde foram. Excluir a cópia de uma execução que outra das suas máquinas mantém remove somente a cópia, e uma execução de um cluster deixa no cluster o que gravou.

## O agente de plantão

Em **Mais opções** → **Agente de plantão**:

- **Desativada** (de início): o que dá errado continua sendo anotado na página da execução.
- **Avisar-me**: uma notificação quando acontece.
- **Um agente investiga**: um agente começa uma sessão na pasta da execução com o que aconteceu, o final do log, o registro da execução e **O que o agente pode fazer**, as suas regras para ele. Ele age dentro delas e depois conta em poucas linhas o que aconteceu e o que fez. A página da execução tem um link para a sessão dele.

Ele fica atento a (a tudo isso, a menos que você desmarque alguns): **NaN** (uma métrica que se torna NaN ou infinita, ou uma perda NaN no log), **Sem memória** (as mensagens do CUDA e `OutOfMemoryError`, ou o programa encerrado com código de saída 137 por causa da memória), **Uma paralisação** (nenhuma saída nova por 30 minutos, ou pelos minutos que você definir), **Uma falha** (um código de saída diferente de 0, ou um processo que morreu) e **Divergência** (uma perda maior que o dobro da melhor, em cinco leituras seguidas).

Se ficarem vazias, as regras são: “Read the log and the code. If a fix is clear and safe, run it again with experiment_run (from the last checkpoint if there is one), changing as little as possible. Never delete files or checkpoints. Then tell the user in a few lines what happened and what you did.” O agente é o que começou a execução (quando foi um agente); do contrário, o agente e o modelo que você escolheu por último na página inicial. Um agente investiga uma execução por vez, e no máximo três entram de plantão em uma hora: além disso, você é avisado.

## Notificações

Você é avisado quando uma execução é concluída ou falha (a menos que desmarque essas opções), quando uma métrica ultrapassa o valor que você definiu e pelo agente de plantão. Uma notificação abre a página da execução. Uma varredura avisa uma única vez, quando todas as execuções dela terminam, com a melhor configuração (a média das seeds) ou com o número que todas as execuções deram, quando deram o mesmo; o aviso abre o experimento da varredura na aba **Hiperparâmetros**. No máximo oito avisos sobre execuções chegam a cada dez minutos; além disso, um aviso diz quantos outros houve.

Sem o agente de plantão, você ainda é avisado, uma vez por execução, quando uma execução não imprime nada há 30 minutos ou a perda dela se torna NaN. Uma sessão que pediu para ser informada sobre a execução (report) é avisada imediatamente de um NaN, de uma paralisação ou de uma perda que está subindo, como **Experimentos · Uma execução precisa de atenção**.

Uma execução que um agente começou com “avise-me quando terminar” (report) também envia uma mensagem a essa sessão quando termina, para que o agente continue dali. Execuções de uma sessão que terminam perto umas das outras, ou enquanto o agente dela está trabalhando, são informadas em uma única mensagem, sob os nomes dos experimentos, com os números mais importantes. Execuções que diferem apenas na seed ocupam uma só linha, com a média e a dispersão de cada número entre elas, e uma seed que falhou ou foi interrompida é indicada nessa linha. O tempo que uma execução levou é informado quando foi de um minuto ou mais, ou quando ela falhou; depois de 20 linhas, a mensagem conta o que resta em cada experimento. A mensagem chega depois do turno do agente, quando ele está trabalhando, e uma execução que o agente já leu desde que ela terminou fica de fora; na conversa, ela aparece como uma única linha, **Experimentos · Execuções encerradas**, que se abre com um clique. É um aviso do próprio app, não uma mensagem sua, por isso nada da memória nem da wiki é acrescentado a ela (nem às mensagens de um objetivo).

## Títulos, descrições e categorias

Cada experimento tem um título (poucas palavras simples: o que é treinado ou avaliado, em quê e o que varia), uma descrição (de uma a três frases) e uma categoria (de uma a três palavras que dão nome à área ou à tarefa, como “Modelagem de linguagem”). Eles aparecem na página do experimento, na coluna e nos cartões da Visão geral, de modo que um nome como `e7-pretrain` vira uma linha que você entende, e a caixa de busca (Ctrl+K) e **Buscar um experimento** encontram um experimento por eles.

Quem os escreve:

- **O modelo auxiliar** ([Configurações → Agentes → Modelos](/settings?s=models&find=Helper%20model)) os escreve para um experimento que não tem nenhum, logo após a primeira execução (e, para seus experimentos mais antigos, pouco depois de o app abrir). Ele lê os nomes, comandos, hiperparâmetros e nomes de métricas de algumas das execuções. Quando ele os escreveu e o experimento cresceu até o dobro de execuções (pelo menos 4), ele os escreve de novo, no máximo uma vez a cada seis horas.
- **Um agente** que começa execuções dá ao experimento um título, uma descrição e uma categoria quando começa as primeiras execuções e de novo quando o que ele testa muda (a ferramenta experiment_describe).
- **Você**: **Editar o título e a descrição** no menu ⋯ do experimento abre uma janela com **Título**, **Descrição** e **Categoria** (ela sugere as categorias já em uso). **Escrever de novo** pede ao modelo auxiliar uma versão nova, que substitui o que está lá.

O que você ou um agente escreveu nunca é sobrescrito automaticamente; só **Escrever de novo** faz isso. As execuções de uma [sessão confidencial](/guide/sessions#keep-a-session-confidential) são lidas apenas por um modelo auxiliar que roda neste computador; sem nenhum, o experimento delas fica como está.

## Compare execuções

Marque a caixa de cada execução que você quer em uma tabela de execuções (a caixa no cabeçalho da tabela marca todas as execuções exibidas). Uma barra na parte de baixo diz “3 escolhidas” e oferece **Comparar** (para 2 execuções ou mais, até 8), **Marcar com estrela** (ou **Tirar estrela**), **Arquivar** (ou **Restaurar**), **Parar** (quando algumas estão em andamento ou aguardando; pergunta antes e diz quantas), **Excluir** (as terminadas, pela mesma janela do **Excluir o registro** de uma execução), **Criar uma tabela** e × para desmarcar todas. No celular, esses botões ficam em **Ações**, numa folha que sobe de baixo. As execuções que você marcou continuam marcadas enquanto você passa de um experimento a outro, assim você pode comparar execuções de experimentos diferentes. **Comparar** abre uma janela, “Comparar 3 execuções”, com:

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

Com duas pontuações ou mais, um gráfico mostra cada uma ao longo do tempo, com a variação entre sementes e a linha de base como uma linha tracejada. **Evoluir…**, no menu ⋯ da página, começa a busca por uma versão melhor ([Evoluir](#evolve-searching-for-a-better-version)) e, quando houver uma, **Evoluir** as lista entre o gráfico e as pontuações. **Pontuações** as lista, das mais recentes para as mais antigas: quando, onde (branch e commit, com “com mudanças sem commit” se for o caso), quem pediu, a pontuação e como ela se compara. O menu de uma pontuação abre as execuções dela, usa-a como linha de base (**Usar como linha de base**), interrompe-a ou a exclui. Excluir uma pontuação, ou a avaliação (**Excluir…** no menu ⋯ da página), também exclui as execuções dela e informa o que elas gravaram nas próprias pastas de execução, com **Manter esses arquivos** quando isso passa de 100 MB, como acontece ao excluir uma execução. Quando uma pontuação falha porque o comando não imprimiu o número, os nomes que ele imprimiu são mostrados: toque em um para usá-lo no lugar (a avaliação é lacrada de novo).

**Pontuar agora** pontua a pasta. Quando o repositório tem worktrees do git, aparece a pergunta “Pontuar o que está em qual pasta?”: a própria pasta ou uma das worktrees, identificada pela branch. Uma avaliação pode pontuar a própria pasta, uma pasta dentro dela ou uma worktree do mesmo repositório.

### Quando os arquivos lacrados mudam

Se um arquivo lacrado estiver diferente, um aviso âmbar diz qual, e as pontuações esperam até que ele volte ao que era:

- **Ver o que mudou**: cada arquivo marcado como Alterado, Ausente ou Arquivo novo, com o que mudou nele.
- **Restaurar**: grava as cópias lacradas por cima dos arquivos e diz o que não conseguiu restaurar e por quê (arquivos adicionados depois continuam lá).
- **Lacrar de novo…**: aceita os arquivos como estão agora. As pontuações anteriores deixam de ser comparadas com as novas (elas continuam lá, recolhidas em **Antes de ser lacrada de novo**), e a linha de base precisa ser medida de novo. Mudar o comando, o número ou os arquivos lacrados com **Editar…** também lacra de novo.

### O teste final

**Executar o teste final…** (no bloco dele ou no menu da página) diz como o seu trabalho se sai de verdade em dados nos quais nada foi ajustado. Cada olhada informa um pouco menos, então execute quando achar que terminou; a janela diz quantas vezes ele foi executado desde que foi lacrado. Quando há worktrees do git, ela também pergunta em qual ele vai ser executado (**Sobre o que está em**).

### O que os agentes podem fazer

Os agentes podem ler as avaliações, pedir a pontuação da própria pasta (o app executa o comando lacrado por conta própria; eles informam esse número, não um calculado por eles; se ainda não houver linha de base, a resposta também traz as últimas pontuações de outras pastas e branches, para que possam comparar sem executá-las de novo), propor uma nova avaliação (você vê cada parte dela em um cartão, e ela só é criada se você concordar) e restaurar arquivos lacrados. Eles não podem criar nem lacrar uma por conta própria, definir a linha de base, nem executar ou ler o teste final. Enquanto o seu [limite de horas de GPU dos agentes](#what-agents-may-use-gpu-hours) está atingido, as pontuações deles de uma avaliação que usa uma GPU são recusadas.

As execuções iniciadas na pasta de uma avaliação informam, na própria página, se os arquivos dela estavam como foram lacrados quando começaram, e uma tabela de execuções marca com um sinal âmbar aquelas em que não estavam. Uma execução que serviu para pontuar uma avaliação leva de volta a ela.

## Evoluir: a busca por uma versão melhor

O Evoluir testa muitas pequenas mudanças nos arquivos que você indicar, pontua cada uma com a avaliação e fica com a melhor. Os seus arquivos não são tocados: cada mudança é testada em uma cópia própria do app, feita a partir do seu último commit. Ele usa o [modelo auxiliar](/guide/agents-models#choose-the-helper-model) do app para escrever as mudanças, construindo cada uma sobre uma das melhores versões encontradas até então.

Vale a pena para um arquivo cuja qualidade a avaliação consegue medir bem: uma heurística, uma função de pontuação, um prompt, uma rotina lenta. Não vale quando a avaliação é fraca (poucos exemplos, um número fácil de manipular): a busca encontra os pontos fracos de tudo o que a pontua, então configure um [teste final](#the-final-test) com dados que a busca nunca vê.

### Como iniciar uma busca

Abra a página da avaliação, clique em ⋯ e em **Evoluir…**. A janela pergunta:

- **O que pode ser alterado?** Digite um arquivo e clique em **Adicionar**, ou toque nos que aparecem em **Sugeridos**: até 8 arquivos de texto que tenham commit e não tenham mudado desde então. Um arquivo protegido pela avaliação não pode ser alterado: você é avisado disso.
- **O que deve ser tentado?** (opcional): algumas linhas, como “Deixe o reranker mais rápido sem perder nDCG@10”.
- **Quantas tentativas**: 50, 100, 200 ou **Outros** para um número à sua escolha (de 10 a 2000).
- **Início**: **Quando uma GPU estiver livre** ou **Hoje à noite**: nesse caso ele trabalha só no seu horário da noite (veja [Execuções que esperam pela noite](#runs-that-wait-for-the-night)), por quantas noites precisar. De dia ele mostra **Esperando pela noite (a partir de 23:00)** e não pede nada ao modelo, **Parar depois de (horas)** conta só as noites, e o aviso da manhã diz até onde ele chegou.
- Em **Mais**: **Parar depois de (horas)**, **Quantas ao mesmo tempo** (de 1 a 4) e **Parar quando esta quantidade seguida não trouxer nada melhor** (40, a menos que você mude).

Clique em **Começar**. Primeiro ele pontua o seu ponto de partida, com todas as sementes da avaliação, e depois começa. Uma avaliação sem linha de base mostra **Medir a linha de base** no lugar de **Começar**.

### Como ler a página da busca

A linha dela em **Evoluir**, na página da avaliação, diz “Em execução · 37 de 200 testadas”, “Concluída · 0.035 melhor que o início” ou “Parada”; clique para abri-la. No topo estão a finalidade, o estado (como “Concluída: nenhuma nova melhor nas últimas 40”) e **Pausar** ou **Retomar**, **Parar** (não é possível retomar depois) e ⋯ com **Excluir…** (as tentativas, as pontuações delas e as cópias de trabalho são apagadas; uma branch que você adotou permanece; o app informa o que as execuções gravaram nas próprias pastas de execução, com **Manter esses arquivos** quando isso passa de 100 MB). Depois vêm três blocos:

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

Os agentes podem iniciar uma busca, com a sua aprovação em um cartão (que diz o máximo de horas de GPU que ela pode usar quando a avaliação tem limite de tempo), e acompanhar como ela vai. Eles não podem excluir nenhuma, nem iniciar ou retomar uma que usa uma GPU enquanto o seu [limite de horas de GPU dos agentes](#what-agents-may-use-gpu-hours) está atingido. Uma que já está em andamento espera no limite, sem o tempo dela contar: a página dela diz por quê e tem **Deixar executar**.

## Tabelas de resultados para o seu artigo

**Criar uma tabela** (a partir de execuções marcadas, do menu ⋯ de um experimento ou da aba **Hiperparâmetros** dele) mostra a tabela como você escolher:

- **Colunas**: as métricas. Clique em uma para adicionar ou remover, e na seta dela para alternar qual sentido é o melhor.
- **Linhas**: **Uma linha por experimento**; **Uma linha por comando**, que distingue execuções de scripts ou flags diferentes mesmo quando os hiperparâmetros são os mesmos (o seed é retirado de cada comando, assim como o que só diz onde ele grava ou de qual checkpoint continua, então os seeds de um comando formam uma só linha, nomeada pelo script, ou então pelas flags que mudam, ou então pelo começo do comando); ou uma linha por valor de um hiperparâmetro que muda entre as execuções (**Uma linha por valor de lr**).
- **Linha de base**: a linha contra a qual as outras são testadas (a primeira linha, a menos que você escolha outra).
- **Testar contra a linha de base**: **Escolher por mim** (pareado sobre os exemplos quando as execuções guardaram pontuações por exemplo; senão, pareado sobre os seeds quando as execuções das linhas compartilham os seeds; senão, teste t de Welch sobre os seeds), **Teste t de Welch sobre os seeds**, **Teste t pareado (por seed ou por exemplo)**, **Bootstrap pareado sobre os exemplos** ou **Sem teste**.
- **Legenda**.

Cada célula é a média ± o desvio padrão das execuções da linha (os seeds dela); o melhor de cada coluna fica em negrito; uma adaga (†) marca uma célula melhor que a linha de base com p < 0,05, após a correção de Holm por testar várias linhas, e uma adaga dupla (‡), uma pior. Quando os seeds quase não mudam um número (ele sai igual, ou quase, em todos os seeds) e as execuções não guardaram pontuações por exemplo, essa comparação não recebe marca: uma nota abaixo da tabela diz que um teste sobre seeds diz pouco, e que é melhor comparar por exemplo. Uma linha cujas pontuações por exemplo são iguais às da linha de base em todos os exemplos conta como igual, e uma nota abaixo da tabela diz isso (no Markdown que você copia, essas duas notas aparecem em letras pequenas abaixo da tabela; no LaTeX, em um comentário). Com uma linha por valor de um hiperparâmetro, as execuções que não o têm formam uma só linha, nomeada assim (**ranker not set**). Passe o mouse sobre uma célula para ver os valores de p dela. Uma linha abaixo da tabela diz qual teste foi feito e o que ficou de fora (execuções que ainda não terminaram ou que não chegaram a ser concluídas, ou sem essas métricas, citadas junto com o que informam no lugar). Notas ali também avisam quando as execuções das linhas não executaram todas o mesmo código e quando as execuções de uma linha citam checkpoints diferentes.

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
4. Para parar as execuções que não vão vencer, defina em **Interromper execuções antes em caso de** uma métrica e qual sentido é o melhor: uma execução cuja métrica em um passo esteja pior que a mediana das outras execuções nesse passo é parada (**Parada antes do fim**), depois que três outras já tiverem chegado a esse passo. Isso também funciona em um sweep enviado para outra das suas máquinas: este computador faz a avaliação enquanto acompanha as execuções lá.
5. Dê um nome ao seu **Experimento** e clique em **Começar N execuções**.

As execuções do sweep são um experimento como qualquer outro: a tabela de execuções dele tem uma coluna para cada hiperparâmetro, a aba **Gráficos** desenha as curvas e a aba **Hiperparâmetros** mostra como o sweep foi: a melhor execução (pela métrica que você escolher, o melhor ou o último valor de cada execução), quais hiperparâmetros mais importam e cada um contra a métrica. Dali, **Criar uma tabela** ou **Comparar as 6 melhores**. O aviso que diz que um sweep terminou abre essa aba.

## Para onde vão as execuções

**Mais** (⋯) no topo → [**Para onde vão as execuções**](/experiments?places=1):

- **Este computador**: as GPUs dele, **Trabalhos sem GPU: no máximo N ao mesmo tempo** (de início, metade das threads dele, de 1 a 16; um número que você definir permanece), **Execuções dividem uma GPU quando a memória delas cabe** (ativado, a menos que você desative; veja [Como a fila escolhe](#how-the-queue-chooses)), **Execuções dos agentes: no máximo N horas de GPU em sete dias** (vazio para não ter limite; veja [O que os agentes podem usar](#what-agents-may-use-gpu-hours)) e a noite dele: **Noite das** e **para**, além de **Quando a noite acabar** (veja [Execuções que esperam pela noite](#runs-that-wait-for-the-night)).
- **Outras máquinas**: as que estão conectadas em [Configurações → Máquinas](/settings?s=machines). Uma execução enviada a uma delas fica guardada e é monitorada lá: o agente de plantão e os avisos dela são dessa máquina (os avisos chegam até você aqui, como todos os dessa máquina), e esta página a acompanha. A lista aqui também mostra as execuções de todas as máquinas conectadas, marcadas com o lugar onde rodam; abrir uma delas a lê lá, e **Parar** a interrompe lá.
- **Clusters**: computadores que você acessa por SSH, onde não é preciso instalar nada.

### Adicionar um cluster

Clique em [**Adicionar um cluster**](/experiments?cluster=new) e informe:

- **Nome** e **Host SSH**: como você digitaria depois de `ssh`, uma entrada do seu `~/.ssh/config` ou `me@login.cluster.edu`. O servidor do app se conecta com as próprias chaves SSH e nunca pede senha, então ele precisa de uma chave lá que funcione sem senha (`ssh-copy-id`) e da chave de host do cluster já conhecida (conecte uma vez com `ssh` em um terminal).
- **SLURM** ou **SSH simples**.
- **Pasta lá para os logs das execuções** (`~/hydor-runs` para começar) e, no SLURM, a **Partição** e a **Conta**.
- **Linhas de configuração**, executadas antes de cada job lá: `module load cuda/12.1`, `source ~/venvs/ml/bin/activate`.

**Verificar** tenta `ssh host true` e depois `sinfo` (que lista as partições) no SLURM, ou `nvidia-smi` e tmux no SSH simples. **Adicionar** guarda o cluster; na lista, cada cluster tem **Verificar** e **Remover**.

Um job para um cluster é executado em uma pasta lá (o código já precisa estar lá: clone-o lá). No **SLURM**, o app escreve um script de lote com as necessidades do job (as GPUs como `--gres=gpu:N`, processadores, memória, as horas como `--time`, a partição e a conta), as suas linhas de configuração e o comando. Antes de enviar, o app consulta o cluster sobre a execução com `sbatch --test-only`. Um pedido que o cluster recusa (nenhum nó tem o que foi pedido, a partição não existe, mais tempo do que a partição permite, um problema na conta) falha na hora, com a explicação em linguagem simples e, depois dela, a linha do próprio cluster. Quando o pedido é aceito, a estimativa cautelosa do cluster sobre quando ele começaria aparece no status (“Na fila do cluster. A estimativa cautelosa do cluster para o início é segunda-feira, 02:15; muitas vezes começa bem antes”): em um cluster ocupado, essa estimativa pode errar por dias para um trabalho que começa em segundos, então não faça planos com base nela. Se o sbatch de um cluster não tiver `--test-only`, ou se o cluster levar mais de 20 segundos para responder, o trabalho é enviado sem essa consulta.

Enquanto o job espera, o status diz o motivo, no termo do SLURM e em palavras simples ("outros jobs vêm primeiro (Priority)"), e, assim que o squeue der uma previsão, por volta de quando ele espera começar, atualizada quando isso muda mais de dez minutos. O app o acompanha com squeue e sacct, copia o log para cá conforme ele cresce, lê junto as linhas novas do **Arquivo de métricas** (um arquivo que ainda não existe não é erro), traz de volta as pontuações por exemplo quando termina, e **Parar** o cancela com scancel (uma execução que pediu segundos de aviso recebe antes Ctrl-C, com `scancel --signal=INT --full`). Quando a execução termina mal, o status diz qual foi o caso e o que fazer: ela atingiu o limite de tempo do cluster (dê mais horas a ela, ou um jeito de continuar), o cluster a interrompeu por causa da memória (e quanto ela tinha pedido; alguns clusters deixam um trabalho passar do limite usando swap em disco em vez de interrompê-lo), o cluster tomou o lugar dela de volta (preempção) ou ela foi cancelada lá. O limite de tempo do próprio SLURM não dá o aviso do app.

No **SSH simples**, as GPUs são escolhidas lá como aqui (mas nunca divididas: uma das suas execuções por GPU), e a execução entra em um tmux lá. O app também aplica ali o **Limite de tempo (horas)**, com o aviso, enquanto o app estiver em execução, e lê o arquivo de métricas e as pontuações da mesma forma. Uma única conexão SSH por cluster é mantida aberta, então acompanhar as execuções custa pouco.

## No celular

Não há coluna: a Visão geral começa com a fila, as GPUs e **Buscar um experimento**, e lista as avaliações (quando você tem alguma) e os experimentos como cartões. Um experimento, uma avaliação e uma execução abrem no lugar dela, com uma seta para voltar. A tabela de execuções rola para os lados, mantendo à vista a caixa de seleção e o nome de cada execução; as execuções dos gráficos formam uma linha de etiquetas acima deles, e **Suavização** fica no menu **Opções do gráfico**. O log de uma execução quebra as linhas na largura da tela, e **Acompanhar** funciona como no computador. Nova execução, Comparar e as tabelas abrem a partir da parte de baixo da tela.

## Peça a um agente

- “Treine isto em uma GPU livre e me avise quando terminar.”
- “Execute estas seis avaliações, com 7 GB cada, para que dividam as GPUs.”
- “Planeje as três seeds destas quatro configurações, peça-me uma única vez as horas de GPU necessárias e depois execute-as.”
- “Por que a minha execução ainda está esperando, e quando ela vai começar?”
- “Rode estes três controles hoje à noite e me diga de manhã o que eles mostraram.”
- “Treine isto hoje à noite, salve um checkpoint quando a noite acabar e continue a partir dele na noite seguinte.”
- “Coloque o baseline na fila para hoje à noite e continue alterando o código para o próximo experimento.”
- “Execute o eval.py no cluster Unity com 2 GPUs por 4 horas.”
- “Varie a taxa de aprendizado entre 1e-4, 3e-4 e 1e-3 com as sementes 1, 2 e 3, e pare as execuções ruins mais cedo.”
- “Por que minha última execução falhou? Se a correção for clara, execute de novo.”
- “Anote na execução do baseline de ontem que o bug do tokenizador ainda estava nela.”
- “Leia as execuções do experimento lora e registre o que ele mostrou, com as execuções como evidência.”
- “Teste este comando de treino primeiro e me diga de quanta memória e tempo ele precisa.”
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
