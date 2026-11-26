# Jobs

Jobs mostra, em um só lugar, os trabalhos demorados que suas sessões executam em segundo plano: compilações, treinamentos, indexações, downloads e subagentes. Para cada um, você vê há quanto tempo está sendo executado, até onde chegou e mais ou menos quanto falta, o que está esperando para começar e pelo que espera, e como terminaram os que já acabaram. Dali você pode ler a saída de um trabalho e pará-lo, e pode pedir a um agente que execute uma coisa depois da outra.

![A página Jobs: os trabalhos em execução com o progresso e o tempo restante, os que esperam a vez e os que terminaram](images/jobs.webp)

## O que Jobs mostra

Clique em **Jobs** na barra de ícones ou vá para [Jobs](/jobs). No celular, fica entre as ferramentas na parte de baixo do menu lateral. Um número no ícone indica quantos trabalhos estão em execução.

Um trabalho é qualquer um destes:

- uma tarefa em segundo plano de uma das suas sessões: um comando, um monitor (uma vigilância sobre um log ou um programa) ou um subagente do próprio programa do agente, como o do Claude Code. As sessões que você executa fora do Hydor, no VS Code ou em um terminal, também mostram as delas;
- um trabalho que um agente iniciou como job (veja [Como os agentes colocam trabalhos aqui](#how-agents-put-work-here));
- uma execução de [Experimentos](/guide/experiments) que está em andamento ou esperando na fila;
- um subagente do Hydor, ou seja, uma sessão que outra sessão iniciou para cuidar de parte do trabalho dela, enquanto está trabalhando (veja [Subagentes](/guide/sessions#subagents)).

A linha no topo resume tudo, por exemplo “3 em execução · 2 na fila · tudo pronto em cerca de 2 h 10 min”. O horário de término só aparece quando todos os trabalhos têm uma estimativa; os subagentes, que nunca têm uma, não contam. Abaixo estão as seções **Executando**, **Na fila**, **Servidores** e **Concluídos**, cada uma presente quando tem algo para mostrar. O número na barra de ícones, a linha no topo e o horário de término não contam os servidores. A página se atualiza sozinha.

Cada linha tem um ícone com um ponto que indica o estado, e o nome do trabalho; passe o mouse sobre o nome para ver o comando. Embaixo dele aparecem o tipo (**Comando**, **Monitor**, **Subagente do Claude Code**, **Subagente do Hydor**, **Execução de experimento**, **Trabalho** ou **Servidor**), a sessão que o iniciou e o projeto dela, cada um com um link. À direita, **Saída** mostra o que ele imprime, **Abrir** leva à execução ou à sessão dele, e **Parar** o encerra.

Quando nada está em execução nem em espera, você lê “Nada está sendo executado em segundo plano agora.”

## Executando

Um trabalho em execução informa há quanto tempo está rodando (“em execução há 12 min 05 s”). Quando o trabalho informa até onde chegou, há uma barra de progresso com uma porcentagem e, muitas vezes, a contagem do próprio trabalho ao lado, como “step 120/500”. A linha esmaecida embaixo é a última coisa que ele imprimiu.

### Tempo restante

Quando há algo em que se basear, a linha diz “faltam cerca de 1 h 12 min”. O app usa a primeira destas informações que tiver:

1. o tempo restante que o próprio trabalho imprimiu, como fazem muitas barras de progresso;
2. a velocidade com que o progresso avançou até agora;
3. a estimativa que o agente deu ao iniciar o trabalho;
4. quanto tempo o mesmo comando levou antes, na mesma pasta, quando terminou bem na última semana.

Passe o mouse sobre o tempo para ver qual delas foi usada. **(um palpite)** ao lado significa que é uma estimativa aproximada: uma única leitura de progresso, a estimativa do agente ou uma execução anterior. Quando um trabalho já está rodando há mais tempo que o esperado, aparece **passou da estimativa** no lugar. Sem nada em que se basear, nenhum tempo é mostrado.

## Na fila

Um trabalho na fila ainda não começou. A linha dele diz o motivo:

- **Espera por** e os nomes de outros trabalhos: ele começa depois que todos terminarem bem. Clique em um nome para encontrar a linha dele. Os trabalhos pelos quais outros esperam mostram **Depois:** e quem vem a seguir;
- **Próximo na fila** e o nome da fila, ou a posição nela, como “3º na fila gpu”: uma fila executa um trabalho de cada vez, na ordem de chegada, considerando todas as suas sessões. O primeiro da fila pode ainda estar esperando outro trabalho, e os que vêm atrás dele esperam também;
- **Esperando uma GPU livre** ou **Aguardando uma vaga livre**: uma execução de Experimentos espera por espaço (veja [Como a fila escolhe](/guide/experiments#how-the-queue-chooses)).

Quando os trabalhos à frente têm estimativas, a linha também diz quando ele deve começar, como “começa em cerca de 40 min”.

**Parar** em um trabalho na fila significa que ele nunca começa, e os trabalhos que esperam por ele também não. Se um trabalho do qual outro depende falhar ou for interrompido, o que está esperando também nunca começa.

## Servidores

Alguns comandos nunca terminam sozinhos: um servidor de desenvolvimento, um servidor web ou de API, um notebook ou um servidor de modelos que uma sessão deixou rodando em segundo plano. Jobs os reconhece pelo comando e os lista à parte em **Servidores**, com há quanto tempo cada um está rodando e sem tempo restante. Eles rodam até você pará-los, com **Parar** como em qualquer outro comando. Não entram na contagem dos trabalhos em execução, e a visualização **Linha do tempo** não os desenha. Quando um deles termina, vai para **Concluídos**.

## Concluídos

**Concluídos** guarda o que terminou nos últimos 7 dias, do mais novo para o mais antigo: os dez mais recentes, e **Mostrar tudo** para os demais. Cada um diz como terminou, quando e quanto tempo levou:

- **Concluído**: terminou bem;
- **Falhou**, com o código de saída quando houver (o número com que um programa termina; qualquer valor diferente de 0 significa que algo deu errado);
- **Interrompido**: você ou um agente o parou;
- **Nunca começou**, e o motivo, por exemplo a falha de um trabalho pelo qual ele esperava;
- **Encerrado**: um trabalho que já estava em execução quando foi adicionado a Jobs chegou ao fim, e ninguém viu se deu certo.

O × no fim de uma linha (**Remover desta lista**) tira um item, e **Limpar** tira todos depois de pedir confirmação. Isso só organiza a lista: suas sessões e execuções de Experimentos continuam existindo.

## A visualização Linha do tempo

Alterne entre **Lista** e **Linha do tempo** no canto superior direito; o app lembra sua escolha neste navegador. A linha do tempo desenha uma barra para cada trabalho em execução ou em espera, ao longo das horas:

- **Executado até agora** é a parte preenchida, e **Estimado** é a parte listrada depois dela;
- os trabalhos **Na fila** aparecem tracejados, no ponto em que devem começar;
- uma barra **Sem estimativa** vai desaparecendo aos poucos;
- a linha marcada como **Agora** é o presente, e linhas finas ligam um trabalho aos que esperam por ele.

Um trabalho que passou da estimativa fica âmbar. Passe o mouse sobre uma barra para ler o estado e os horários, e clique nela para ver a saída, ou para abrir o trabalho quando não houver saída para mostrar. Em uma tela estreita, o gráfico rola para os lados e os nomes ficam no lugar. Os trabalhos concluídos aparecem listados embaixo dele.

## Saída e Parar

**Saída** abre um painel com o final do que o trabalho imprimiu, atualizado a cada poucos segundos enquanto ele roda; as linhas mais novas continuam visíveis, a menos que você role para cima. Para um subagente, o painel lista as etapas dele. Alguns trabalhos, como os subagentes do Hydor e as tarefas em segundo plano do Codex, não têm saída aqui: use **Abrir**.

**Parar** pede confirmação e depois encerra o trabalho: um job ou um comando para, uma execução de Experimentos é interrompida como na própria página dela, e a sessão de um subagente do Hydor é interrompida. O que o trabalho fez até ali permanece. Trabalhos executados em uma sessão fora do Hydor e as tarefas em segundo plano do Codex não podem ser parados daqui, por isso não têm **Parar**.

## Como os agentes colocam trabalhos aqui

Você não precisa configurar nada. Uma tarefa em segundo plano iniciada por uma sessão aparece aqui sozinha. Toda sessão que o app inicia também tem um comando chamado `job`, e os agentes são orientados a usá-lo em trabalhos demorados (qualquer coisa acima de uns dez minutos), para que apareçam aqui com nome, progresso e tempo restante (veja [Quatro comandos que todo agente tem](/guide/agents#four-commands-every-agent-has)).

Diga o que você quer em palavras simples, e o agente faz o resto:

- **Um depois do outro**: “execute a avaliação depois que a criação do índice terminar”. O segundo trabalho espera o primeiro e nunca começa se o primeiro falhar;
- **Um de cada vez**: “coloque essas varreduras em uma fila”. Trabalhos com o mesmo nome de fila se revezam;
- **Quanto tempo deve levar**: o agente pode dar a própria estimativa, que é usada até o progresso do trabalho informar mais;
- **Trabalho já em execução**: “mostre em Jobs o treinamento que você iniciou antes”. O agente o adiciona sem reiniciá-lo (`job adopt`); isso não está disponível no Windows. Quando termina, aparece **Encerrado**, já que ninguém tem como saber como foi.

Se o app não puder ser acessado quando um agente iniciar um job, o comando é executado mesmo assim; ele só não aparece aqui.

## Peça a um agente

- “Execute a avaliação como um job depois que a criação do índice terminar.”
- “Mostre em Jobs o treinamento que você iniciou antes.”
- “Execute estas três varreduras uma de cada vez, em uma fila.”
- “O que ainda está em execução e quando vai terminar?”
- “Pare o download e, em vez disso, execute os testes como um job.”
- “Por que a última compilação falhou? Verifique a saída do job dela.”
