# Jobs

A página Jobs mostra o trabalho demorado que suas sessões executam em segundo plano, tudo em um só lugar e organizado por etiquetas que dizem do que cada item faz parte: compilações, treinamentos, indexação, downloads e subagentes. Para cada um, você vê há quanto tempo está em execução, até onde chegou e mais ou menos quanto falta, o que está esperando para começar e o que está esperando, e como terminaram os que já acabaram. Dali você pode ler a saída de um trabalho e pará-lo, e pode pedir a um agente que execute uma coisa depois da outra.

![A página Jobs: quatro quadros que resumem tudo, um botão para cada etiqueta e os trabalhos em andamento agrupados por etiqueta, com o progresso e o tempo restante](images/jobs.webp)

## O que a página Jobs mostra

Clique em **Jobs** na barra de ícones ou vá para [Jobs](/jobs). No celular, ela fica entre as ferramentas na parte de baixo do menu lateral. Um número no ícone diz quantos trabalhos estão em execução.

Um trabalho é qualquer um destes:

- uma tarefa em segundo plano de uma das suas sessões: um comando, um monitor (que acompanha um log ou um programa) ou um subagente do próprio programa do agente, como o Claude Code. As sessões que você executa fora do Hydor, no VS Code ou em um terminal, também mostram as delas;
- um trabalho que um agente começou como job (veja [Como os agentes colocam trabalhos aqui](#how-agents-put-work-here));
- uma execução de [Experimentos](/guide/experiments) que está em andamento ou esperando na fila dele;
- um subagente do Hydor, ou seja, uma sessão que outra sessão começou para fazer parte do trabalho dela, enquanto está trabalhando (veja [Subagentes](/guide/sessions#subagents)).

Quatro quadros no topo resumem tudo:

- **Executando** e **Na fila**: quantos trabalhos estão em execução e quantos estão esperando;
- **Tudo concluído**: quando todo esse trabalho deve estar pronto, como “em cerca de 2 h 10 min”. Aparece um traço, a não ser que todos os trabalhos tenham uma estimativa do que ainda falta, sem contar os subagentes, que nunca têm uma;
- **Concluídos hoje**: quantos terminaram hoje. Ao lado, “1 com falha”, ou quantos forem, leva você até eles.

Abaixo dos quadros há um botão para cada [etiqueta](#tags) e o campo **Filtrar trabalhos**. Digite no campo para ver só os trabalhos cujo nome, comando, sessão, projeto ou etiquetas tenham essas palavras; **Mostrar todos os trabalhos** traz tudo de volta quando nada corresponde. Mais abaixo ficam **Em andamento**, **Servidores** e **Concluídos**, cada um presente quando há algo para mostrar. Os quadros contam apenas o que a etiqueta e o filtro deixam visível. Os servidores em execução não entram na contagem dos quadros nem no número da barra de ícones. A página se atualiza sozinha.

Quando não há nada em execução nem esperando, você lê “Nada está sendo executado em segundo plano agora.”

## Em andamento

**Em andamento** reúne os trabalhos em execução e os que estão esperando, em um cartão para cada etiqueta; os trabalhos sem etiqueta ficam no último, **Sem etiqueta**. O topo de um cartão mostra a etiqueta, quantos dos trabalhos dela estão em execução e esperando (como “3 em execução · 1 na fila”) e, quando cada um deles tem uma estimativa, quando devem terminar (“termina em cerca de 34 min”). Quando todo o trabalho de um cartão vem de uma única sessão, essa sessão e o projeto dela também aparecem ali, e as linhas não os repetem. Clique no topo de um cartão para recolhê-lo ou abri-lo de novo; o app memoriza isso neste navegador. Enquanto você filtra ou tem uma etiqueta escolhida, nada fica recolhido. Enquanto nenhum trabalho tem etiqueta, os trabalhos são simplesmente listados, sem cartões por etiqueta.

Cada trabalho é uma linha. O ícone diz de que tipo ele é (passe o mouse sobre ele para ler **Comando**, **Monitor**, **Subagente do Claude Code**, **Subagente do Hydor**, **Execução de experimento** ou **Trabalho**), e o ponto no ícone indica o estado. Ao lado do nome ficam as outras etiquetas; passe o mouse sobre o nome para ver o comando. Abaixo aparecem a situação dele, a sessão que o começou e o projeto, cada um com um link, e a última coisa que ele imprimiu.

Clique em uma linha para abrir [o painel do trabalho](#a-jobs-panel-and-stop). O menu **⋯** dela tem **Detalhes e saída**, **Abrir sessão** (**Abrir execução** para uma execução de Experimentos), **Editar etiquetas…** e **Parar**.

## Executando

Um trabalho em execução diz há quanto tempo está rodando (“em execução há 12 min 05 s”). Quando o trabalho informa até onde chegou, há uma barra de progresso com uma porcentagem; passe o mouse sobre a barra para ver a contagem do próprio trabalho, como “step 120/500”. Quando não há tempo restante para mostrar, essa contagem aparece embaixo da barra.

### Tempo restante

Quando há algo em que se basear, a linha diz “faltam cerca de 1 h 12 min”. O app usa a primeira destas informações que tiver:

1. o tempo restante que o próprio trabalho imprimiu, como fazem muitas barras de progresso;
2. a velocidade com que o progresso avançou até agora;
3. a estimativa que o agente deu ao começar o trabalho;
4. quanto tempo o mesmo comando levou na mesma pasta antes, quando terminou bem na última semana.

Passe o mouse sobre o tempo para ver qual delas é; o painel do trabalho também informa. **(um palpite)** ao lado significa que é uma estimativa aproximada: uma única leitura de progresso, a estimativa do agente ou uma execução anterior. Quando um trabalho está rodando há mais tempo que o esperado, aparece **passou da estimativa**. Sem nada em que se basear, nenhum tempo é mostrado.

## Na fila

Um trabalho na fila ainda não começou. A linha dele diz por quê:

- **Espera por** e os nomes de outros trabalhos: ele começa quando todos eles terminarem bem. Clique em um nome para encontrar a linha dele. Os trabalhos pelos quais outros esperam mostram **Depois:** e quem vem em seguida;
- **Próximo na fila** e o nome da fila, ou a posição dele, como “3º na fila gpu”: uma fila executa um trabalho por vez, na ordem de chegada, considerando todas as suas sessões. O primeiro da fila ainda pode estar esperando por outro trabalho, e os que vêm atrás esperam também;
- **Esperando uma GPU livre** ou **Aguardando uma vaga livre**: uma execução de Experimentos está esperando espaço (veja [Como a fila escolhe](/guide/experiments#how-the-queue-chooses)).

Quando os trabalhos que estão na frente têm estimativas, a linha também diz quando ele deve começar, como “começa em cerca de 40 min”.

**Parar** em um trabalho na fila significa que ele nunca começa, nem os trabalhos que esperam por ele. Se um trabalho pelo qual outro espera falhar ou for parado, o que está esperando também nunca começa.

## Servidores

Alguns comandos nunca terminam sozinhos: um servidor de desenvolvimento, um servidor web ou de API, um servidor de notebooks ou de modelos que uma sessão deixou rodando em segundo plano. A página Jobs os reconhece pelo comando e os lista em **Servidores**, com o tempo que cada um está em execução e sem tempo restante. Eles rodam até você pará-los, com **Parar**, como em qualquer outro comando. Eles não entram na contagem dos trabalhos em execução, e a visualização **Linha do tempo** os deixa de fora. Quando um deles termina, vai para **Concluídos**.

## Concluídos

**Concluídos** guarda o que terminou nos últimos 7 dias, do mais recente ao mais antigo, com um título para cada dia: **Hoje**, **Ontem** e depois a data. Você vê os dez últimos, e **Mostrar tudo** traz o restante. Cada um diz como terminou, quando e quanto tempo levou:

- **Concluído**: terminou bem;
- **Falhou**, com o código de saída quando houver (o número com que um programa termina; qualquer valor diferente de 0 significa que algo deu errado);
- **Interrompido**: você ou um agente o parou;
- **Nunca começou**, e o motivo, como a falha de um trabalho pelo qual ele esperava;
- **Encerrado**: um trabalho que já estava em execução quando foi adicionado à página Jobs terminou, e ninguém viu se deu certo.

Quando algo falhar, mude de **Todos** para **Falhou** para ver só esses. **Remover desta lista**, no menu **⋯** de uma linha, tira um item, e **Limpar** tira todos depois de perguntar, inclusive os que uma etiqueta ou o filtro escondem. Isso só arruma a lista: suas sessões e execuções de Experimentos continuam existindo.

## Etiquetas

Uma etiqueta diz do que um trabalho faz parte, como `intent-data` ou `search-index`, para que você veja para que serve cada coisa em execução e acompanhe uma frente de trabalho por vez. Um trabalho tem até 3, em letras minúsculas com hifens entre as palavras: “Intent data” é salva como `intent-data`. A primeira define onde ele é listado.

Você não precisa etiquetar nada por conta própria:

- os agentes colocam etiquetas em cada trabalho que começam e usam uma que já existe sempre que o trabalho pertence a ela, para que uma mesma frente de trabalho fique sob um só nome. Diga o nome da etiqueta que você quer, e o agente a usa;
- um trabalho sem etiquetas próprias (os comandos em segundo plano de uma sessão, os subagentes dela e as execuções de Experimentos, um job começado sem etiqueta) recebe a etiqueta da sessão. Essa é a que você definiu para a sessão aqui; se não houver, a que os trabalhos dela na última semana mais têm; se não houver, uma que o [modelo auxiliar](/settings?s=models&find=Helper%20model) escolhe para a sessão, reaproveitando uma etiqueta já em uso quando alguma servir.

O modelo auxiliar escolhe em segundo plano, por isso uma etiqueta assim pode aparecer um instante depois do trabalho. Para escolher, ele lê o título da sessão, o projeto e os nomes de alguns dos trabalhos dela. Ele nunca é consultado sobre uma [sessão confidencial](/guide/sessions#keep-a-session-confidential).

### Mudar etiquetas

Escolha **Editar etiquetas…** no menu **⋯** de um trabalho ou clique no lápis ao lado das etiquetas no painel dele. Digite as etiquetas separadas por vírgulas, ou clique nas que estão em **Etiquetas em uso**, e depois em **Salvar**.

Para um trabalho que um agente começou como job, essas são as etiquetas do próprio job. Para os outros trabalhos, são as da sessão, de modo que todo o trabalho dessa sessão sem etiquetas próprias as recebe. Salve a caixa vazia para remover o que você definiu: a etiqueta volta a ser escolhida para você, como descrito acima. Um trabalho que não pertence a nenhuma sessão não pode receber etiquetas, a não ser que seja um job.

### Ver uma etiqueta

Clique no botão de uma etiqueta para ver só os trabalhos listados nela: os quadros, **Em andamento**, **Servidores**, **Concluídos** e a linha do tempo acompanham a escolha. O número em um botão indica quantos trabalhos dela estão em execução ou esperando. Clique em **Todos** para ver tudo de novo; o botão **Sem etiqueta** mostra [os trabalhos sem etiqueta](/jobs?untagged=1).

A etiqueta escolhida faz parte do endereço da página (ele termina em `?tag=` e o nome da etiqueta), então você pode salvá-lo nos favoritos ou enviá-lo para o celular. Cada botão considera a primeira etiqueta de cada trabalho; para encontrar um trabalho por outra etiqueta, digite-a em **Filtrar trabalhos**.

## A visualização Linha do tempo

Alterne entre **Lista** e **Linha do tempo** no canto superior direito; o app memoriza sua escolha neste navegador. A linha do tempo desenha uma barra para cada trabalho em execução ou esperando, ao longo do relógio, com um ponto na cor da etiqueta antes do nome. Os botões de etiqueta e **Filtrar trabalhos** reduzem o que aparece, assim como fazem na lista:

- **Executado até agora** é a parte sólida, e **Estimado** é a parte listrada depois dela;
- os trabalhos **Na fila** aparecem tracejados, no ponto em que devem começar;
- uma barra **Sem estimativa** vai se apagando;
- a linha marcada como **Agora** é o momento presente, e linhas finas ligam um trabalho aos que esperam por ele.

Um trabalho que passou da estimativa fica âmbar. Passe o mouse sobre uma barra para ler o estado e os horários, e clique nela para abrir o painel do trabalho. Em uma tela estreita, o gráfico rola para os lados e os nomes ficam no lugar. Os trabalhos concluídos são listados abaixo dele.

## O painel de um trabalho e o botão Parar

O painel abre sobre o lado direito da página (a tela inteira no celular). No topo ficam o nome do trabalho, o estado, as etiquetas, **Abrir sessão** (ou **Abrir execução**) e **Parar**. Abaixo está o que se sabe sobre ele, como a sessão, o projeto e a pasta, quando começou, quanto falta e por que essa estimativa, o que ele espera e como terminou. Depois vem o comando, com um botão para copiá-lo.

**Saída** mostra o final do que o trabalho imprimiu, atualizado a cada poucos segundos enquanto ele roda; as linhas mais novas continuam visíveis, a menos que você role para cima. Para um subagente, são listadas as etapas dele. Alguns trabalhos, como os subagentes do Hydor e as tarefas em segundo plano do Codex, não têm saída aqui: use **Abrir sessão**.

**Parar** pergunta antes e depois encerra o trabalho: um job ou um comando é parado, uma execução de Experimentos é parada como na própria página dela, e a sessão de um subagente do Hydor é parada. O que o trabalho fez até então é mantido. Trabalhos que rodam em uma sessão fora do Hydor e as tarefas em segundo plano do Codex não podem ser parados daqui, por isso não têm **Parar**.

## Como os agentes colocam trabalhos aqui

Você não precisa configurar nada. Uma tarefa em segundo plano que uma sessão começa aparece aqui sozinha. Toda sessão que o app começa também tem um comando chamado `job`, e os agentes são instruídos a usá-lo em trabalhos demorados (qualquer coisa acima de uns dez minutos), para que apareçam aqui com nome, etiqueta, progresso e tempo restante (veja [Quatro comandos que todo agente tem](/guide/agents#four-commands-every-agent-has)).

Diga o que você quer com palavras simples, e o agente faz o resto:

- **Um depois do outro**: “execute a avaliação depois que a criação do índice terminar”. O segundo trabalho espera o primeiro e nunca começa se o primeiro falhar;
- **Um de cada vez**: “coloque essas varreduras em uma fila”. Trabalhos com o mesmo nome de fila se revezam;
- **Quanto tempo deve levar**: um agente pode dar a própria estimativa, que é usada até o progresso do trabalho informar mais;
- **Do que faz parte**: “coloque a etiqueta search-index na criação do índice”. Os agentes também podem listar as etiquetas em uso e mudar depois as etiquetas de um trabalho;
- **Trabalho que já está em execução**: “mostre em Jobs o treinamento que você começou antes”. O agente o adiciona sem reiniciá-lo (`job adopt`); isso não está disponível no Windows. Quando ele acaba, aparece **Encerrado**, pois não há como saber como foi.

Enquanto um trabalho que uma sessão começou ainda está esperando ou em execução (um que ela executou com `job`, ou uma execução de Experimentos que ela começou), essa sessão não terminou: o ponto dela continua pulsando em azul e o status mostra “Trabalhando · 1 em segundo plano”, mesmo depois que o agente parou, e o aviso **Concluídas** só chega quando o trabalho termina. O botão Parar ao lado da caixa de mensagem deixa esses trabalhos rodando: pare-os aqui.

Se o app não puder ser acessado quando um agente começa um trabalho, o comando é executado mesmo assim; ele só não aparece aqui.

## Pedir a um agente

- “Execute a avaliação como um job depois que a criação do índice terminar.”
- “Marque a criação do índice com a etiqueta search-index.”
- “O que ainda está em execução para intent-data?”
- “Mostre em Jobs o treinamento que você começou mais cedo.”
- “Execute estas três varreduras uma de cada vez em uma fila.”
- “O que ainda está em execução, e quando vai terminar?”
- “Pare o download e execute os testes como um job.”
- “Por que a última compilação falhou? Verifique a saída do job dela.”
