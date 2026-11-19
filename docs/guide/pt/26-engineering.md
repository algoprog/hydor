# Engenharia: CI, issues, dependências e incidentes

Agentes podem cuidar de um código enquanto você faz outra coisa: investigar uma execução de CI que falhou, triar cada nova issue, manter as dependências em dia e responder a um alerta, cada um como uma tarefa agendada criada a partir de um formulário curto. A opção **Encontrar o que quebrou** do Git faz um agente achar o commit que quebrou algo, e uma **Campanha** divide uma mudança grande em partes que vários agentes fazem ao mesmo tempo, cada um em um worktree próprio.

![Configurações → Tarefas agendadas: os exemplos de Engenharia](images/engineering.webp)

## Como as tarefas de engenharia funcionam

As quatro tarefas são exemplos em [Configurações → Tarefas agendadas](/settings?s=tasks) (**Configurações → Agentes → Tarefas agendadas**), em **Começar de um exemplo** (clique em **Mostrar todos os exemplos** para vê-los), ao lado de [**Revisar novos pull requests**](/settings?s=tasks&find=Review%20new%20pull%20requests). Cada uma abre um formulário curto; preencha-o, escolha quem a executa em **Executada por** e selecione **Criar tarefa** (ou **Mais opções…** para o formulário completo da tarefa). Veja [Tarefas agendadas](/guide/tasks) para tudo o que uma tarefa pode fazer.

O que elas têm em comum:

- **Uma pasta de repositório**: a cópia do repositório neste computador a partir da qual o agente trabalha. Ele a lê e faz qualquer mudança em um novo worktree (uma cópia separada em um branch próprio), de modo que a sua cópia e o branch dela continuam como estão.
- **Uma habilidade para cada**: o agente segue um método escrito, uma habilidade integrada que você pode ler e alterar em [Configurações → Habilidades](/settings?s=skills): **ci-doctor**, **issue-triage**, **dependency-upgrades** e **incident-response**.
- **O que ela pode fazer**: opções no formulário, como **Abrir um pull request em rascunho com uma correção**. Para o que você deixar desativado, o agente conta o que teria feito. Nenhuma delas faz push no branch padrão, force push ou merge.
- **Webhooks**: o Doutor de CI, a Triagem de issues e o primeiro socorro a incidentes começam quando um serviço chama o endereço próprio da tarefa. Depois que a tarefa é criada, a linha dela na lista mostra o endereço com um botão de copiar e, abaixo, onde colá-lo nesse serviço (“No repositório no GitHub: Configurações → Webhooks → Add webhook…”). O formulário diz o mesmo antes de você criar. Um filtro em cada uma deixa começar uma execução só o que é pertinente (uma execução que falhou, uma issue recém-aberta, um alerta que não seja um aviso de “resolvido”); os demais são respondidos e não iniciam nada. **Executar agora** no menu de uma tarefa (ou **Execução de teste** no formulário dela) funciona sem uma chamada, para você experimentar: o Doutor de CI pega a última execução que falhou, a Triagem de issues pega as issues do último dia que não têm rótulos, e o primeiro socorro a incidentes verifica como o serviço está.
- **Acesso**: o agente trabalha com o GitHub pelo comando gh quando você está conectado a ele neste computador e, caso contrário, por uma chave no seu Cofre ou por um app conectado (GitHub, GitLab, Buildkite, CircleCI, Sentry, Grafana, Datadog, Better Stack: veja [Apps conectados, chaves e ferramentas](/guide/connections)). Quando precisa de uma chave que não tem, ele pede a você.
- **A cada execução**, ela relata como foi em uma linha, na notificação e no histórico da tarefa, e guarda notas para a próxima execução (os testes instáveis que viu, as atualizações que segurou, os incidentes até agora). Uma execução que precisa da sua aprovação espera por ela, na sessão e na [caixa de entrada](/guide/inbox). Pode não haver ninguém olhando quando uma execução começa; por isso, nessas tarefas escolha, em **Mais opções…** → **Permissões**, um modo que deixa os passos de rotina seguirem e pergunta sobre os arriscados (**Automático**), ou a execução ficará esperando você no primeiro comando.

## Doutor de CI

Uma execução que falhou no GitHub Actions, GitLab CI, Buildkite ou CircleCI acorda um agente. Ele lê os logs dos jobs que falharam e encontra o primeiro erro de verdade, olha as execuções recentes do mesmo job para distinguir uma falha instável de uma real, a reproduz em um worktree, age conforme você permitiu e resume tudo em poucas linhas.

### Configurar

1. Em [Configurações → Tarefas agendadas](/settings?s=tasks), selecione [**Doutor de CI**](/settings?s=tasks&find=CI%20doctor) em **Começar de um exemplo** (**Mostrar todos os exemplos**).
2. Escolha a **Pasta do repositório** e o **CI**: **GitHub Actions**, **GitLab CI**, **Buildkite** ou **CircleCI**.
3. Escolha o que ele pode fazer:
   - **Executar novamente jobs que parecem instáveis** (ativado de início): uma vez, quando as evidências indicam que a execução falhou, e não o código (um time-out, um download que falhou, um teste conhecido por ir e vir).
   - **Abrir um pull request em rascunho com uma correção** (ativado): para uma falha real, a menor correção possível em um branch próprio, com o teste que falhava executado, como rascunho para você dar uma olhada.
   - **Comentar no commit ou pull request** (desativado): um comentário curto com a causa e a correção ou o próximo passo.
4. Selecione **Criar tarefa**. A tarefa recebe o nome do seu CI, como “Doutor de CI · GitHub Actions”.
5. Copie o endereço dela, da linha da tarefa, para o CI, como diz a linha abaixo do endereço:
   - **GitHub Actions**: **Settings → Webhooks → Add webhook** do repositório; o endereço como Payload URL, application/json, e apenas **Workflow runs** entre os eventos individuais.
   - **GitLab CI**: **Settings → Webhooks → Add new webhook** do projeto, apenas com **Pipeline events**.
   - **Buildkite**: **Settings → Notification Services**, **Adicionar** em Webhook, com o evento build.finished.
   - **CircleCI**: **Project Settings → Webhooks → Add Webhook** do projeto, com **Workflow Completed**.

Só uma execução que falhou a inicia (no GitHub, uma execução de workflow cuja conclusão é failure; no GitLab, Buildkite e CircleCI, uma cujo status é failed). Cada execução recebe o essencial da execução que falhou (o workflow, o endereço dele, o branch, o commit e a mensagem dele, o pull request), e o relatório de uma linha diz se foi instável ou real, a causa e o que foi feito: “Instável: time-out do registry no npm ci; executei de novo”, ou “Real: o analisador de datas quebra em anos bissextos; pull request em rascunho #42”.

## Triagem de issues

Cada issue aberta no GitHub (ou Gitea) acorda um agente que a tria: ele lê a issue e o guia de contribuição do projeto, aplica rótulos que o repositório tem, procura o mesmo problema entre issues abertas e fechadas recentemente, com diferentes formulações (dizendo o quanto tem de certeza), pede ao autor, em um comentário gentil, o que falta no relato (a versão, os passos, os logs) e, quando a correção é pequena e clara, a testa em um worktree e abre um pull request em rascunho que faz referência à issue.

1. Selecione [**Triagem de issues**](/settings?s=tasks&find=Issue%20triage) em **Começar de um exemplo** (**Mostrar todos os exemplos**).
2. Escolha a **Pasta do repositório** e o que ele pode fazer: **Rotular**, **Comentar nele** e **Tentar os mais fáceis como pull requests em rascunho** (todos ativados de início).
3. Selecione **Criar tarefa** e depois copie o endereço dela em **Settings → Webhooks → Add webhook** do repositório no GitHub, apenas com **Issues** entre os eventos individuais (no Gitea: Issues events).

Só uma issue recém-aberta inicia uma execução. O agente nunca fecha, bloqueia, transfere nem exclui uma issue (ele rotula uma duplicata certa e deixa um mantenedor fechá-la), nunca atribui pessoas e respeita o que o projeto permite: um projeto que recusa pull requests feitos com IA não recebe nenhum. Um problema de segurança relatado em público não é discutido ali: o agente indica ao autor a forma privada de relatar do projeto e avisa você na hora.

## Jardineiro de dependências

Uma vez por semana, o agente cuida das dependências do repositório (npm, pnpm, yarn, pip, uv, poetry, cargo e go): o que está desatualizado e quais têm avisos de segurança. As correções de segurança vêm primeiro; depois as atualizações patch, minor e major, cada grupo separado, e as major nunca misturadas com as demais. Cada grupo é feito em um worktree próprio, com as notas de versão do que mudou lidas à procura de mudanças incompatíveis e os testes executados. Uma atualização que quebra os testes é segurada, com o motivo nas notas da tarefa para que não seja proposta de novo toda semana.

1. Selecione [**Jardineiro de dependências**](/settings?s=tasks&find=Dependency%20gardener) em **Começar de um exemplo** (**Mostrar todos os exemplos**).
2. Escolha a **Pasta do repositório**, o dia em **Ativada** (segunda-feira de início) e a hora em **Às** (09:00).
3. **Pull requests abertos** (ativado): um pull request em rascunho por grupo cujos testes passam, com os destaques, os avisos de segurança que ele corrige e o que observar. Desativado, ele não envia nada e relata cada grupo com os comandos que o aplicam.
4. Selecione **Criar tarefa**.

Uma semana com tudo atualizado e nenhum aviso em aberto passa em silêncio.

## Primeiro socorro a incidentes

Um alerta do Sentry, Grafana, Datadog, Better Stack ou de outro serviço acorda um agente. Em poucos minutos ele diz o que está errado, desde quando e quão grave, com uma notificação. Depois coloca os erros, os logs, os deploys recentes e as mudanças desde a última versão boa em uma só linha do tempo, encontra a causa provável com as evidências e propõe o passo mais seguro, geralmente um rollback. Ele nunca faz rollback, reinicia nem faz deploy de nada sem o seu sim: pergunta em um cartão na sessão da execução e, quando ninguém responde a tempo, a execução relata que precisa de você, com o comando em espera. Quando tudo acabar, peça a ele o postmortem na mesma sessão.

1. Selecione [**Primeiro socorro a incidentes**](/settings?s=tasks&find=Incident%20first%20responder) em **Começar de um exemplo** (**Mostrar todos os exemplos**).
2. Escolha **A pasta do repositório do serviço** e **Os alertas vêm de**: **Sentry**, **Grafana**, **Datadog**, **Better Stack** ou **Outro serviço**.
3. **Como fazer rollback** (opcional): um comando que o agente pode executar depois que você disser sim, como `kubectl rollout undo deployment/web`. Se ficar vazio, ele pergunta a você como.
4. Selecione **Criar tarefa** e depois aponte os alertas do serviço para o endereço dela, como diz a linha da tarefa:
   - **Sentry**: **Settings → Developer Settings → Create New Integration → Internal Integration**, o endereço como Webhook URL e **Alert Rule Action** ativado; depois adicione a integração às ações das suas regras de alerta.
   - **Grafana**: **Alerting → Contact points → Add contact point**, a integração Webhook com o endereço; depois envie alertas a ela a partir de uma política de notificação.
   - **Datadog**: **Integrations → Webhooks → New**, com o endereço e `"transition": "$ALERT_TRANSITION"` adicionado ao payload; depois mencione `@webhook-` e o nome dele nas mensagens dos seus monitores.
   - **Better Stack**: **Incidents → Integrations → Exporting data → Outgoing webhooks → Configure**, depois **Adicionar** em Incident, apenas com os eventos de incidente criado ou reaberto.

Avisos de que um problema foi resolvido ou se recuperou não iniciam nada (os do Sentry, do Grafana e do Datadog, pelo filtro); os que passarem mesmo assim são anotados nas notas da tarefa e ficam em silêncio. Com um app conectado para o serviço de alertas, o agente lê os erros e os logs por ele.

## Encontrar o que quebrou

Quando algo funcionava em uma versão anterior e agora está quebrado, um agente pode achar o commit que o quebrou: ele testa os commits intermediários com git bisect, dividindo-os ao meio a cada vez (mil commits levam cerca de dez tentativas), aponta o primeiro ruim e explica o que na mudança dele quebrou as coisas e por quê.

1. Na [página do Git](/git), abra o repositório e o **Histórico** dele.
2. Abra o commit em que funcionava pela última vez e escolha **Encontrar o que quebrou** no menu ⋯ dele, ou selecione o botão **Encontrar o que quebrou** ao lado de **Encontrar um commit** no topo da lista.
3. No formulário **Encontrar o que quebrou**:
   - **Funcionava em**: o commit a partir do qual você o abriu (pela tag dele, quando houver), ou então a tag mais recente. Digite qualquer tag, branch ou commit; as tags mais recentes são sugeridas enquanto você digita. Abaixo aparece o commit que ele representa, com a mensagem e a idade, ou “Nenhum commit ou tag com esse nome”.
   - **Quebrou em**: `HEAD` de início (o último commit do branch em que você está).
   - **O que está quebrado**: com as suas palavras, o mais preciso possível (“Exportar um documento com imagens para PDF falha com ‘imagem grande demais’”).
   - **Como verificar (opcional)**: um comando que falha enquanto está quebrado, como `npm test -- export`. Sem ele, o agente escreve uma verificação própria.
   - **Executada por**: o agente, com o modelo e as permissões que você usou por último com ele na tela inicial.
4. Selecione **Início**. Ele espera até que as duas pontas sejam commits, não o mesmo, e **O que está quebrado** esteja preenchido.

Uma nova sessão abre na hora, em um novo worktree do repositório, de modo que a sua cópia continua como está. O agente dela segue a habilidade **git-bisect**: escreve um pequeno script de verificação (ele sai com 0 quando funciona, 1 quando está quebrado, 125 para um commit que não consegue testar, como um que não compila), o testa primeiro nas duas pontas, executa `git bisect run` com ele, depois mostra o primeiro commit ruim e a parte da mudança dele que quebrou as coisas, comprova desfazendo só esse commit e sugere uma correção. Ele não altera nada nos seus branches. Quando você terminar, o menu da sessão → **Encerrar: por enquanto, concluída** oferece remover o worktree dela (veja [Trabalhar em um worktree](/guide/sessions#work-in-a-worktree)).

A caixa de busca (Ctrl+K) também encontra **Encontrar o que quebrou**: ela abre o formulário do último repositório que você usou.

## Campanhas: uma grande mudança em muitas partes

Uma campanha faz uma grande mudança, em grande parte mecânica, em toda uma base de código (migrar todos os pacotes para um novo logger, atualizar um framework, renomear uma API em todos os lugares) com vários agentes ao mesmo tempo. Um agente líder divide a mudança em partes (pacotes, módulos, pastas), e os membros fazem cada um uma parte em um worktree próprio, com os testes dela. É o segundo tipo de [Enxame](/guide/research#set-a-swarm-on-a-hard-problem): uma única configuração, **Tamanho do enxame**, define quantos trabalham ao mesmo tempo nos dois.

### Começar uma campanha

1. Na página inicial, escolha a pasta do repositório. Uma campanha precisa de um repositório git.
2. Abra **Opções**, escolha **Enxame** e selecione **Campanha** (“Uma grande mudança em partes, cada uma em um worktree”).
3. Diga qual é a mudança e como ela é verificada (“Migrar todos os pacotes do Jest para o Vitest; npm test deve passar em cada um”) e pressione **Início**.

A linha Enxame mostra “Campanha · 5 ao mesmo tempo” (o tamanho do seu enxame). Como acontece com um enxame, ela não é mantida na sua próxima sessão, e uma pesquisa profunda e uma campanha não podem estar ativas ao mesmo tempo. Um limite de gastos definido no mesmo menu vale para o líder e para todos os membros. O editor de uma tarefa agendada tem a mesma opção.

### Como funciona

1. O líder analisa a mudança e como ela é verificada, e a divide em partes que podem ser feitas e testadas cada uma por conta própria. Ele publica o plano no painel: as partes, pelo nome, na ordem em que devem ser feitas (primeiro o código compartilhado).
2. Ele inicia um membro para cada parte, no máximo o tamanho do seu enxame ao mesmo tempo, e o próximo conforme os outros terminam. Cada membro trabalha em um branch próprio, em um novo worktree criado a partir do branch em que está a pasta do líder.
3. Um membro altera apenas a sua parte, executa as verificações, faz commit no seu branch e publica a parte como concluída (com o branch e as verificações) ou como falha (com o que deu errado).
4. Uma parte que falha ganha mais uma tentativa, com o que foi aprendido. Se falhar de novo, continua como falha.
5. O líder faz o merge dos branches concluídos no branch em que ele trabalha, um de cada vez, em uma ordem sensata, executando as verificações após cada um, e remove o worktree de cada parte já incorporada. Peça pull requests na sua mensagem e ele abrirá um por parte, sem fazer nenhum merge. Ele nunca faz push para o branch padrão.
6. No final, ele relata o que mudou, o que falhou e por quê, e o que resta fazer manualmente.

Para manter toda a mudança em um branch próprio, ative também **Novo worktree** no menu de pastas para o líder: os membros passam então a criar seus branches a partir do branch do líder, e os merges chegam a ele.

### Acompanhar: a barra e o painel

A sessão do líder tem uma barra acima da caixa de mensagem: **Campanha** · “planejando suas partes” no início, depois “12 de 40 partes concluídas · 2 falharam · 3 em andamento”, e **Painel**. A sessão de cada membro também tem uma barra: “Na campanha de” e o título do líder, com **Painel** e **Líder**. Na barra lateral, os membros ficam sob o líder, reunidos em uma linha como “40 membros da campanha · 3 em andamento”.

**Painel** abre o **Painel da campanha** (a partir da parte de baixo da tela no celular):

- **Partes**: quantas estão concluídas e quantas falharam, depois cada parte na ordem do plano, com a situação dela (**Aguardando**, **Em andamento**, **Concluído**, **Falhou**, **Tentando de novo** ou **Falhou 2 vezes**) e a última novidade sobre ela, ou o que o membro responsável está fazendo agora. Clique em uma parte para abrir a sessão do membro dela. **Parar tudo**, disponível enquanto há membros trabalhando, interrompe todos os membros que ainda estão em andamento.
- **Trabalhando agora**: os membros em atividade, no máximo o tamanho do seu enxame.
- **Publicações**, ao lado das partes em uma tela larga: tudo o que foi publicado, das mais recentes para as mais antigas, cada uma com o seu tipo (**Planejar**, **Progresso**, **Concluído**, **Falhou**, **Descoberta**, **Pergunta**, **Nota**) e a parte a que se refere.

Publicações para todos não acordam os membros em uma campanha (um membro cuja parte está concluída continua concluído); uma mensagem para um único membro o acorda.

## Peça a um agente

- “Configure um médico de CI para ~/code/shop no GitHub Actions: ele pode executar de novo jobs instáveis, mas nada de pull requests.”
- “Por que a última execução de CI no main falhou em acme/shop? Foi instabilidade?”
- “Faça a triagem das issues abertas em acme/shop nesta semana: aplique rótulos e encontre duplicatas.”
- “Toda segunda-feira às 9h, cuide das dependências de ~/code/api e abra pull requests para o que passar nos testes.”
- “Configure um respondedor de incidentes para os alertas do Grafana do checkout, fazendo rollback com kubectl rollout undo deployment/checkout.”
- “Escreva o postmortem da queda do checkout de ontem.”
- “Funcionava na v1.2.0: descubra o que quebrou a exportação de PDF em ~/code/docs.”
- “Comece uma campanha em ~/code/shop que migre todos os pacotes do Jest para o Vitest, com um pull request para cada pacote.”
