# Jobs

A página Jobs mostra o trabalho longo que suas sessões executam em segundo plano, tudo em um só lugar e organizado por etiquetas que dizem que tipo de trabalho é cada item, como experimentos, coleta de dados ou builds: execuções de treinamento, indexação, downloads e subagentes. De cada um você vê há quanto tempo está em execução, até onde chegou e mais ou menos quanto tempo falta, o que está esperando para começar e pelo que espera, e como terminaram os que já acabaram. Você pode ler a saída de um job e pará-lo por ali, e pode pedir a um agente que execute uma coisa depois da outra.

![A página Jobs: quatro blocos que resumem tudo, um chip para cada etiqueta e os jobs em andamento agrupados por etiqueta, com o progresso e o tempo restante](images/jobs.webp)

## O que a página Jobs mostra

Clique em **Jobs** na barra de ícones ou vá para [Jobs](/jobs). No celular, ela fica entre as ferramentas na parte de baixo do menu lateral. Um número no ícone indica quantos jobs estão em execução.

Um job é qualquer um destes:

- uma tarefa em segundo plano de uma das suas sessões: um comando, um monitor (uma vigilância sobre um log ou um programa) ou um subagente do próprio programa do agente, como o do Claude Code. Sessões que você executa fora do Hydor, no VS Code ou em um terminal, também mostram as suas;
- trabalho que um agente começou como job (veja [Como os agentes colocam trabalho aqui](#how-agents-put-work-here));
- uma execução de [Experimentos](/guide/experiments) que está em andamento ou esperando na fila;
- um subagente do Hydor, uma sessão que outra sessão iniciou para parte do seu trabalho, enquanto ele trabalha (veja [Subagentes](/guide/sessions#subagents)).

Quatro blocos no topo resumem tudo:

- **Executando** e **Na fila**: quantos jobs estão em execução e quantos estão esperando;
- **Tudo concluído**: quando todo esse trabalho deve estar terminado, por exemplo “em cerca de 2 h 10 min”. Mostra um traço, a menos que todos os jobs tenham uma estimativa ainda por vir, deixando de fora os subagentes, que nunca têm uma;
- **Concluídos hoje**: quantos terminaram hoje. Ao lado, “1 falhou” ou quantos houver leva você até eles.

Abaixo dos blocos ficam um chip para cada [etiqueta](#tags), o menu de projetos (**Todos os projetos**, veja [Ver os jobs de um projeto](#see-one-projects-jobs)) e o campo **Filtrar trabalhos**. Digite no campo para ver apenas os jobs cujo nome, comando, sessão, projeto ou etiquetas contenham essas palavras; **Mostrar todos os trabalhos** traz tudo de volta quando nada corresponde. Mais abaixo estão **Em andamento**, **Servidores** e **Concluídas**, cada um presente quando tem algo para mostrar. Os blocos contam apenas o que a etiqueta, o projeto e o filtro deixam. Servidores em execução não entram na contagem dos blocos nem no número da barra de ícones. A página se atualiza sozinha.

Quando nada está em execução nem esperando, você lê “Nada está em execução em segundo plano agora.”

## Em andamento

**Em andamento** reúne os jobs que estão em execução e os que esperam, em um cartão para cada etiqueta; os jobs sem etiqueta ficam no último, **Sem etiqueta**. O topo de um cartão mostra a etiqueta, quantos de seus jobs estão em execução e esperando (como “3 em execução · 1 na fila”) e, quando cada um tem uma estimativa, quando devem terminar (“conclusão em cerca de 34 min”). Quando todo o trabalho de um cartão vem de uma única sessão, essa sessão e seu projeto também são nomeados ali, e as linhas deixam de mostrá-los. Clique no topo de um cartão para recolhê-lo ou abri-lo de novo; o app lembra disso neste navegador. Enquanto você filtra ou tem uma etiqueta escolhida, nada fica recolhido. Enquanto nenhum job tem etiqueta, os jobs são simplesmente listados, sem cartões por etiqueta.

Cada job é uma linha. O ícone diz de que tipo ele é (passe o mouse sobre ele para ler **Comando**, **Monitor**, **Subagente do Claude Code**, **Subagente do Hydor**, **Execução de experimento** ou **Vaga**), e o ponto no ícone indica o estado. Ao lado do nome ficam as outras etiquetas, se houver; passe o mouse sobre o nome para ver o comando. Abaixo dele aparecem a situação, a sessão que o iniciou e seu [projeto](#see-one-projects-jobs), cada um como link, e a última coisa que ele imprimiu.

Clique em uma linha para abrir [o painel do job](#a-jobs-panel-and-stop). O menu **⋯** dela tem **Detalhes e saída**, **Abrir sessão** (**Abrir execução** para uma execução de Experimentos), **Editar etiquetas…** e **Parar**.

## Executando

Um job em execução informa há quanto tempo está rodando (“em execução há 12 min 05 s”). Quando o job informa até onde chegou, há uma barra de progresso com uma porcentagem; passe o mouse sobre a barra para ver a contagem do próprio job, como “etapa 120/500”. Quando não há tempo restante para mostrar, essa contagem fica abaixo da barra.

### Tempo restante

Quando há algo em que se basear, a linha diz “faltam cerca de 1 h 12 min”. O app usa a primeira destas opções que tiver:

1. o tempo restante que o próprio job imprimiu, como fazem muitas barras de progresso;
2. a velocidade com que o progresso avançou até agora;
3. a estimativa que o agente deu ao iniciar o job;
4. quanto tempo o mesmo comando levou na mesma pasta antes, quando terminou bem na última semana.

Passe o mouse sobre o tempo para ver qual delas é; o painel do job também informa. **(um palpite)** ao lado significa que é uma estimativa aproximada: uma única leitura de progresso, a estimativa do agente ou uma execução anterior. Quando um job está rodando há mais tempo que o esperado, aparece **passou da estimativa** no lugar. Sem nada em que se basear, nenhum tempo é mostrado.

## Na fila

Um job na fila ainda não começou. Sua linha diz por quê:

- **Espera por** e os nomes de outros jobs: ele começa quando todos eles tiverem terminado bem. Clique em um nome para encontrar a linha dele. Os jobs pelos quais outros esperam mostram **Depois:** e quem vem em seguida;
- **Próximo na fila** e o nome da fila, ou a posição dele, como “3º na fila gpu”: uma fila executa um job de cada vez, na ordem em que chegaram, entre todas as suas sessões. O primeiro da fila ainda pode estar esperando outro job, e os que vêm atrás também esperam;
- **Esperando uma GPU livre** ou **Aguardando uma vaga livre**: uma execução de Experimentos espera por espaço (veja [Como a fila escolhe](/guide/experiments#how-the-queue-chooses)).

Quando os jobs à frente têm estimativas, também aparece quando ele deve começar, como “começa em cerca de 40 min”.

**Parar** em um job na fila significa que ele nunca começa, e os jobs que esperam por ele também não. Se um job pelo qual outro espera falhar ou for interrompido, o que espera também nunca começa.

## Servidores

Alguns comandos nunca terminam sozinhos: um servidor de desenvolvimento, um servidor web ou de API, um notebook ou um servidor de modelo que uma sessão deixou rodando em segundo plano. A página Jobs os reconhece pelo comando e os lista em **Servidores**, com há quanto tempo cada um está em execução e sem tempo restante. Eles rodam até você pará-los, com **Parar** como em qualquer outro comando. Não entram na contagem dos jobs em execução, e a visualização **Linha do tempo** os deixa de fora. Quando um termina, vai para **Concluídas**.

## Concluídas

**Concluídas** guarda o que terminou nos últimos 7 dias, do mais recente para o mais antigo, sob um título para cada dia: **Hoje**, **Ontem** e depois a data. Você vê os dez mais recentes, e **Mostrar tudo** traz o restante. Cada um diz como terminou, quando e quanto tempo levou:

- **Concluído**: terminou bem;
- **Falhou**, com o código de saída quando há um (o número com que um programa termina; qualquer um diferente de 0 indica que algo deu errado);
- **Interrompida**: você ou um agente a interrompeu;
- **Nunca começou**, e o motivo, como um job pelo qual ele esperava ter falhado;
- **Terminou**: um trabalho que já estava em execução quando foi adicionado à página Jobs terminou, e ninguém viu se deu certo.

Quando algo falhou, mude de **Todos** para **Falhou** para ver apenas esses. **Remover desta lista**, no menu **⋯** de uma linha, tira um item, e **Limpar** tira todos depois de perguntar, inclusive os que uma etiqueta, o menu de projetos ou o filtro escondem. Isso apenas organiza a lista: suas sessões e execuções de Experimentos permanecem.

## Etiquetas

Uma etiqueta diz que tipo de trabalho é um item, como `experiments` ou `data-collection`, para que você veja de relance o que está em execução e olhe um tipo de trabalho de cada vez. As etiquetas nunca nomeiam um projeto ou um assunto; suas sessões e projetos já aparecem ao lado de cada job. Um job tem até 3 etiquetas, em letras minúsculas com hifens entre as palavras: “Data collection” é guardada como `data-collection`. A primeira diz onde ele é listado.

Há nove tipos amplos de trabalho, e quase tudo se encaixa em um deles:

- `experiments`: treinamento, avaliação, varreduras de parâmetros e benchmarks;
- `data-collection`: rastreamento, extração de dados de páginas, downloads, consultas a serviços, rotulagem ou geração de dados;
- `data-processing`: limpeza, conversão, indexação e embedding de dados;
- `development`: escrever ou alterar código, documentos ou traduções, e revisá-los;
- `builds`: construção, compilação e empacotamento;
- `tests`: conjuntos de testes, verificações de tipos e linting;
- `deployment`: publicação, lançamento e execução de servidores;
- `analysis`: pesquisa, relatórios, gráficos e estatísticas;
- `maintenance`: backups, limpeza e atualizações.

Cada trabalho é etiquetado por conta própria: ele nunca herda a etiqueta da sessão, então o build, os testes e o download de uma mesma sessão ficam, cada um, sob o seu tipo. Você não precisa etiquetar nada por conta própria:

- o agente que inicia um job o etiqueta, e usa uma etiqueta que já esteja em uso sempre que o trabalho se encaixar, para que o mesmo tipo de trabalho fique sob um só nome. Diga qual etiqueta você quer e o agente a usa;
- uma execução de [Experimentos](/guide/experiments) é sempre etiquetada como `experiments`;
- qualquer outro trabalho sem etiqueta (os comandos em segundo plano de uma sessão, seus subagentes e servidores, um job iniciado sem etiqueta) é etiquetado pelo [modelo auxiliar](/settings?s=models&find=Helper%20model), que olha o nome, o tipo e o comando daquele trabalho e escolhe entre as mesmas etiquetas. Ele faz isso em segundo plano, então essa etiqueta pode aparecer um instante depois do trabalho. Ele nunca é consultado sobre uma [sessão confidencial](/guide/sessions#keep-a-session-confidential), e a variável de ambiente `HYDOR_JOBS_TAGGER=0` o desativa.

As etiquetas amplas têm cores próprias, as mesmas onde quer que apareçam.

### Alterar etiquetas

Você pode alterar as etiquetas de qualquer job, seja quem for que as tenha colocado. Escolha **Editar etiquetas…** no menu **⋯** do job, ou clique no lápis ao lado das etiquetas no painel dele. Digite as etiquetas separadas por vírgulas, ou clique nas que estão em **Etiquetas para escolher** (as etiquetas em uso, depois as amplas) e então em **Salvar**. A janela diz quem etiquetou o job até agora: “O agente que o iniciou o etiquetou.”, “Você o etiquetou.”, “O modelo auxiliar o etiquetou. Altere se estiver errado.” ou, para uma execução de Experimentos, “Execuções de Experimentos são etiquetadas como experiments.”

Salve com a caixa vazia para remover o que você definiu. O job fica então sem etiqueta própria, e o modelo auxiliar pode etiquetá-lo de novo, como descrito acima.

### Ver uma etiqueta

Clique no chip de uma etiqueta para ver apenas o trabalho listado sob ela: os blocos, **Em andamento**, **Servidores**, **Concluídas** e a linha do tempo acompanham. O número em um chip é quantos de seus jobs estão em execução ou esperando. Clique em **Todos** para ver tudo de novo; o chip **Sem etiqueta** mostra [o trabalho sem etiqueta](/jobs?untagged=1).

A etiqueta que você escolhe faz parte do endereço da página (ele termina em `?tag=` e o nome da etiqueta), então você pode salvá-lo nos favoritos ou enviá-lo para o seu celular. Um chip considera a primeira etiqueta de cada job; para encontrar um job por outra etiqueta dele, digite essa etiqueta em **Filtrar trabalhos**.

## Ver os jobs de um projeto

O menu de projetos fica ao lado de **Filtrar trabalhos**. Ele mostra **Todos os projetos**, ou o nome do projeto que você escolheu, com a sua marca. Abra-o para escolher:

- **Todos os projetos**: todos os jobs;
- um projeto que tenha jobs aqui; o número ao lado diz quantos deles estão em execução ou esperando;
- **Nenhum projeto**: os jobs que não pertencem a nenhum.

Os blocos, **Em andamento**, **Servidores**, **Concluídas** e a linha do tempo passam então a mostrar apenas esses jobs. Escolher um projeto leva você de volta ao chip **Todos**, e os chips e seus números cobrem apenas os jobs dele; clique em um para ver essa etiqueta dentro do projeto. Enquanto um projeto está escolhido, as linhas deixam o nome dele de fora. O menu aparece quando algum job pertence a um projeto.

O projeto que você escolhe também faz parte do endereço da página (`?project=` e o id dele, ou `?project=none`), então você pode salvá-lo nos favoritos. Os jobs de um [grupo](/guide/projects#bring-projects-together-in-a-group) incluem os dos projetos que ele reúne. Enquanto um projeto tem jobs em execução ou esperando, ou servidores deixados rodando, a própria página dele os mostra em [Visão geral](/guide/projects#overview).

Um job pertence ao projeto da sua sessão. Quando não há nenhum (a sessão dele está em nenhum projeto, ou ele não tem sessão, como um job que você iniciou do seu próprio terminal ou uma execução que você iniciou na página Experimentos), ele pertence ao projeto em cuja pasta está sendo executado. Quando a pasta de um projeto está dentro da de outro, o projeto interno fica com ele. Um grupo, e um projeto cuja pasta é a sua pasta pessoal ou um disco inteiro, nunca recebem jobs dessa forma. O painel de um job informa o seu **Projeto**.

## A visualização Linha do tempo

Alterne entre **Lista** e **Linha do tempo** no canto superior direito; o app lembra da sua escolha neste navegador. A linha do tempo desenha uma barra para cada job que está em execução ou esperando, ao longo do relógio, com um ponto da cor da etiqueta antes do nome. Os chips de etiquetas, o menu de projetos e **Filtrar trabalhos** a restringem como fazem com a lista:

- **Executado até agora** é sólido, e **Estimado** é a parte listrada além dele;
- Jobs **Na fila** são tracejados, no ponto em que devem começar;
- uma barra **Sem estimativa** vai se desvanecendo;
- a linha marcada **Agora** é o presente, e linhas finas ligam um job aos que esperam por ele.

Um job que passou da estimativa fica âmbar. Passe o mouse sobre uma barra para ler o estado e os horários, e clique nela para abrir o painel do job. Em uma tela estreita, o gráfico rola para os lados e os nomes ficam parados. Os jobs concluídos são listados abaixo dele.

## O painel de um trabalho e Parar

O painel abre sobre o lado direito da página (a tela inteira no celular). No topo ficam o nome do trabalho, o estado, as etiquetas, **Abrir sessão** (ou **Abrir execução**) e **Parar**. Abaixo está o que se sabe sobre ele, como sua sessão, projeto e pasta, quando começou, quanto tempo ainda falta e por que essa estimativa, o que ele está esperando e como terminou. Em seguida vem o comando do trabalho, com um botão que o copia.

**Saída** mostra o final do que o trabalho imprimiu, atualizado a cada poucos segundos enquanto ele é executado; as linhas mais recentes ficam à vista, a menos que você role para cima. Para um subagente, lista os passos dele. Alguns trabalhos, como os subagentes do Hydor e as tarefas em segundo plano do Codex, não têm saída aqui: use **Abrir sessão**.

**Parar** pergunta antes e depois encerra o trabalho: um trabalho ou um comando é interrompido, uma execução de Experimentos é parada como na própria página dela, e a sessão de um subagente do Hydor é interrompida. O que o trabalho já fez continua lá. O trabalho que roda em uma sessão fora do Hydor e as tarefas em segundo plano do Codex não podem ser paradas por aqui, por isso não têm **Parar**.

## Como os agentes colocam trabalho aqui

Você não precisa configurar nada. Uma tarefa em segundo plano iniciada por uma sessão aparece aqui sozinha. Toda sessão iniciada pelo app também tem um comando chamado `job`, e os agentes são instruídos a usá-lo para trabalhos longos (qualquer coisa acima de uns dez minutos), para que apareça aqui com um nome, uma etiqueta para o tipo de trabalho, o progresso e o tempo restante (veja [Quatro comandos que todo agente tem](/guide/agents#four-commands-every-agent-has)).

Diga o que você quer em palavras simples, e o agente faz o resto:

- **Um depois do outro**: "execute a avaliação depois que a construção do índice terminar". O segundo trabalho espera o primeiro e nunca começa se o primeiro falhar;
- **Um de cada vez**: "coloque essas varreduras em uma fila". Trabalhos com o mesmo nome de fila se revezam;
- **Quanto tempo deve levar**: um agente pode dar a própria estimativa, que é usada até o progresso do trabalho dizer mais;
- **Que tipo de trabalho é**: "marque a coleta como coleta-de-dados". Os agentes também podem listar as etiquetas em uso e as mais amplas ainda não usadas, e mudar as etiquetas de qualquer trabalho depois;
- **Trabalho que já está em execução**: "mostre em Trabalhos o treinamento que você iniciou antes". O agente o adiciona sem reiniciá-lo (`job adopt`); isso não está disponível no Windows. Quando ele acaba, aparece como **Terminou**, já que ninguém consegue saber como foi.

Enquanto um trabalho iniciado por uma sessão ainda espera ou é executado (um que ela executou com `job`, ou uma execução de Experimentos que ela iniciou), essa sessão não está concluída: o ponto dela continua pulsando em azul e o status mostra "Working · 1 in background", mesmo depois de o agente ter parado, e o aviso de **Concluídas** só chega quando o trabalho termina. O botão Parar ao lado da caixa de mensagem deixa esses trabalhos em execução: pare-os aqui.

Se o app não puder ser alcançado quando um agente inicia um trabalho, o comando é executado mesmo assim; ele só não aparece aqui.

## Peça a um agente

- "Execute a avaliação como um trabalho depois que a construção do índice terminar."
- "Marque a coleta como coleta-de-dados."
- "Mostre só os experimentos que estão em execução."
- "O que está em execução no meu projeto Tese?"
- "Mostre em Trabalhos o treinamento que você iniciou antes."
- "Execute estas três varreduras uma de cada vez, em uma fila."
- "O que ainda está em execução e quando vai terminar?"
- "Pare o download e execute os testes como um trabalho."
- "Por que a última build falhou? Veja a saída do trabalho dela."
