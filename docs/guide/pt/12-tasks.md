# Tarefas agendadas

Uma tarefa agendada é um trabalho de agente que começa sozinho: em um horário do dia, a cada alguns minutos ou horas, uma vez, quando outro serviço chama o webhook dela, quando algo que você acompanha muda, quando chega um novo e-mail ou um novo registro em um app conectado, ou um tempo definido antes de cada evento da sua agenda. Use uma para um resumo da manhã, um lembrete, um preço ou uma página para ficar de olho, um relatório semanal, cada nova fatura que chega por e-mail, uma primeira resposta a cada novo lead, um resumo antes de cada ligação com um cliente, uma revisão de cada novo pull request ou uma olhada em cada execução de CI que falhou, e o resultado chega até você sem que precise começar uma sessão.

![Configurações → Tarefas agendadas: trabalho que começa sozinho](images/tasks.webp)

## O que é uma tarefa agendada

Uma tarefa agendada é um prompt com um gatilho. Cada vez que o gatilho dispara, o app começa uma execução: uma nova sessão com o agente, o modelo e a pasta da tarefa, cuja primeira mensagem é o prompt da tarefa (ou, se você preferir, o prompt vai para uma sessão que você já tem). O agente trabalha como em qualquer sessão. No fim, ele diz em uma linha como foi, e o histórico da tarefa guarda essa linha, o custo e um link para a sessão.

Uma tarefa pode começar:

- **Em um horário**: um horário do dia nos dias da semana que você escolher, ou por uma expressão cron.
- **Repetindo**: a cada tantos minutos (no mínimo 5) ou horas.
- **Uma vez**: em uma data e hora.
- **Acompanhar**: quando um observador vê uma mudança em um feed, em uma página da web, em um valor em JSON, em uma pasta ou na saída de um comando, um novo e-mail em uma das suas contas de e-mail, ou algo novo em um app conectado (um negócio, um arquivo, um ticket, um pagamento), ou um tempo definido antes de cada evento de uma agenda conectada. Um observador olha sem usar um modelo, então suas verificações não gastam tokens; o agente só acorda quando algo mudou.
- **Webhook**: quando outro serviço (GitHub, Gitea, um formulário, um script seu) chama o endereço próprio da tarefa.

Uma tarefa também pode executar um dos seus apps no lugar de um prompt: cada vez que o gatilho dispara, o app é executado com as respostas que você definiu, e o histórico da tarefa tem um link para essa execução (veja [Executar um app sozinho](/guide/apps#run-an-app-by-itself)).

Os horários seguem o seu fuso horário, que o app pega do seu navegador. Uma execução que não pôde começar na hora, porque o computador estava desligado ou em repouso ou porque o app não estava aberto, é executada na próxima oportunidade.

Suas tarefas ficam em [Configurações → Tarefas agendadas](/settings?s=tasks) (**Configurações → Agentes → Tarefas agendadas**). A caixa de busca (Ctrl+K, ⌘K no Mac) também encontra uma tarefa pelo nome e a abre ali. Há cinco maneiras de criar uma:

- **Nova tarefa** em Configurações, onde você define cada parte por conta própria.
- **Começar de um exemplo**: um formulário curto para uma tarefa comum.
- Pedir a um agente em qualquer conversa (“me lembre na sexta às 9”): ele mostra um cartão que você confirma.
- **Transformar em automação** no menu de uma sessão: cria o rascunho de uma tarefa a partir de uma sessão que deu certo.
- **Adicionar um agendamento** nas **Execuções** de um app: uma tarefa que executa esse app.

Continuar uma sessão sozinho quando o limite de uso de um plano é renovado é uma opção à parte: [Configurações → Geral → Retomar após os limites de uso](/settings?s=general&find=Resume%20after%20usage%20limits) (veja [Uso, limites e custos](/guide/usage)).

## Veja suas tarefas agendadas

[Configurações → Tarefas agendadas](/settings?s=tasks) tem um grupo, **Suas tarefas**, cuja linha indica o seu fuso horário (o (i) dela acrescenta que uma execução que não pôde começar, porque o computador estava desligado, é executada na próxima oportunidade), e lista suas tarefas, das mais antigas para as mais recentes. A lista é atualizada sozinha conforme as execuções começam e terminam. **Visão semanal**, ao lado de **Nova tarefa**, mostra todas elas em um calendário (veja [Veja a semana: o que rodou e o que roda em seguida](#see-the-week-what-ran-and-what-runs-next)). Cada linha mostra:

- Um ícone do gatilho (um calendário, um olho para um observador, um sinal de webhook), o nome da tarefa e o ícone do agente dela.
- Quando ela roda e onde, como “Dias úteis às 09:00 · nova sessão em reports · próxima em 14 h 20 min”, ou “publica em uma sessão”.
- Para um observador, a última verificação: “Verificou há 5m: 12 itens, 2 novos” (em âmbar quando a verificação falhou).
- Quando a tarefa se pausou sozinha, o motivo, com “Ative-a para tentar de novo.”
- Pontos para as últimas execuções (até seis, da mais antiga para a mais recente: verde para concluída, âmbar para parcial ou bloqueada, vermelho para falha ou erro, cinza para nada novo) com **Histórico** ao lado; **Última execução há 3h** (em vermelho, com o motivo, quando a última execução não pôde começar); e **Abrir**, que abre a sessão da última execução.
- Para uma tarefa de webhook, o endereço dela com um botão de copiar e, para uma criada a partir de um exemplo, onde colá-lo no serviço que a chama.

À direita de cada linha ficam um interruptor que pausa a tarefa ou a ativa e o menu da tarefa (⋯): **Executar agora**, **Testar sem enviar**, **Editar**, **Histórico**, **Duplicar**, **Novo endereço** (somente tarefas de webhook) e **Excluir**.

Um cartão de painel que se mantém atualizado também aparece na lista, como do painel: “Loja · Vendas por dia: atualização”. A linha dele tem o interruptor, **Atualizar agora** e **Abrir o painel**, que abre as configurações do cartão no painel: a pergunta, o agendamento e o nível dele são alterados ali, e **Parar de atualizar** ali (ou tirar o cartão, ou excluir o painel) o remove desta lista ([Mantenha os cartões atualizados](/guide/library#keep-cards-up-to-date)).

Sem nenhuma tarefa ainda, a lista diz “Nenhuma tarefa agendada ainda: comece de um exemplo abaixo, ou peça a um agente para configurar uma”.

## Veja a semana: o que rodou e o que roda em seguida

Tudo o que roda sozinho fica em um só lugar: [Agentes → Agendamentos](/agents/schedules), o lugar **Agendamentos** na coluna da página Agentes (uma aba no topo no celular). **Visão semanal** em Configurações → Tarefas agendadas também o abre, assim como a caixa de busca. Ele reúne suas tarefas agendadas, os agendamentos dos seus agentes, os agendamentos dos seus apps (inclusive **Atualizar automaticamente**), os cartões de painel que se mantêm atualizados, observadores e webhooks, para que você veja o que roda amanhã, por que várias começaram às 08:00 e como foi a semana passada.

- **A semana**: sete dias lado a lado, de segunda a domingo, com as horas na lateral e o dia de hoje marcado, com uma linha no horário atual. Cada execução que aconteceu é um bloco no seu horário, colorido conforme o resultado: verde para **Concluído**, cinza para **Nada novo**, âmbar para **Precisa de você** (parcial ou bloqueada), vermelho para **Falhou** (ou erro). As execuções que ainda virão aparecem esmaecidas, com borda tracejada e o nome. Quando mais de três começam ao mesmo tempo, duas aparecem e um bloco **+2** (ou mais) lista as demais.
- **A coluna de cada dia** informa quanto as execuções custaram e quantas falharam.
- **A cada poucos minutos, observadores e webhooks**: o que roda mais de oito vezes por dia, observadores e webhooks aparecem como uma faixa por tarefa acima das horas, e não como um bloco para cada execução. Cada dia tem uma barra de como foram as execuções, quantas rodaram e **+48** (por exemplo) para as que ainda virão. Clique na linha para recolhê-las.
- **Clique em um bloco** para ver o cartão dele: como foi, quando, quanto tempo levou e quanto custou, o que o iniciou (quando não foi o agendamento), o resumo de uma linha do agente, **Abrir a sessão** (ou **Abrir a execução**, no caso de um app) e **Editar**. Uma execução futura diz quando vai rodar, com **Editar**. O dia de uma faixa conta as execuções conforme o resultado, com **Abrir a mais recente** quando há uma sessão.
- **‹** e **›** vão para a semana anterior ou seguinte, e **Hoje** volta. **Semana** e **Mês**, no alto à direita, alternam para um mês: cada dia com uma barra de como foram as execuções, quantas rodaram e falharam, quantas ainda virão (e **+48 repetições** para o que roda a cada poucos minutos) e o custo. Clique em um dia para abrir a semana dele.
- A linha acima do calendário soma o que está sendo mostrado: quantas rodaram, quantas falharam, quanto custaram e quantas ainda virão, depois o significado das cores e o seu fuso horário.
- **Os filtros** no alto (**Todos**, **Tarefas**, **Agentes**, **Apps**, **Painéis**, **Observadores**, **Webhooks**, **Pausado**, cada um com a quantidade) mostram só esses itens: no calendário, nos totais e na lista.

Abaixo do calendário, **Tudo o que roda sozinho** lista cada um: primeiro o que roda em seguida, depois observadores e webhooks, depois o que está pausado. Uma linha mostra o nome e de quem é (**Agente ·** e o agente, **App ·** e o app, **Painel ·** e o painel, ou **Tarefa**), quando roda e quando será a próxima vez, por que se pausou sozinho, pontos das últimas execuções com **Última execução há 3h:** e como foi, o resumo do agente e **Abrir**. O interruptor o pausa ou o ativa. O lápis o abre onde você o altera: o agendamento de um agente na página do agente, o de um app nas **Execuções** do app (ou em **Configurações** da página dele, no caso de **Atualizar automaticamente**), as atualizações de um cartão de painel no painel dele (o **Manter atualizado…** dele: [Mantenha os cartões atualizados](/guide/library#keep-cards-up-to-date)), qualquer outra tarefa aqui em Configurações → Tarefas agendadas, com o formulário aberto.

Os horários seguem o seu fuso horário. No celular, Agendamentos mostra um dia por vez: **‹** e **›**, ou um deslize para o lado, vão para o dia anterior ou seguinte.

## Criar uma nova tarefa

1. Abra [Configurações → Tarefas agendadas](/settings?s=tasks) e selecione [**Nova tarefa**](/settings?s=tasks&find=New%20task), o botão ao lado do título da página. O formulário **Nova tarefa agendada** é aberto.
2. Digite um nome, escolha o agente e a pasta, e escreva o prompt.
3. Em **Quando**, escolha quando a tarefa é executada.
4. Em **A cada execução**, escolha para onde vai cada execução e quais são os limites.
5. Se quiser, selecione **Execução de teste** para testar uma vez sem salvar (veja [Testar uma tarefa com uma execução de teste](/guide/tasks#try-a-task-with-a-test-run)).
6. Selecione **Criar tarefa**.

**Criar tarefa** e **Execução de teste** só ficam disponíveis quando a tarefa tem um nome e um prompt. Uma nova tarefa vem configurada para ser executada às 09:00 nos dias úteis, com o agente que você escolheu por último na página inicial, na pasta padrão do app (geralmente sua pasta pessoal).

### Nome, agente e pasta

- **Nome** (o campo que diz "Nome, ex.: Resumo matinal do CI"): como a tarefa aparece na lista, nas notificações e nos títulos das sessões de suas execuções ("Resumo da manhã · 3 nov, 07:30"). No máximo 120 caracteres.
- O chip do agente: quem executa a tarefa. Claude Code, Codex, Custom ou outro agente que você adicionou (veja [Agentes, contas e modelos](/guide/agents-models)). Escolher outro agente limpa o modelo e o esforço e define as permissões habituais desse agente.
- O chip da pasta: a pasta em que cada execução trabalha. Digite um caminho ou escolha uma pasta e depois selecione **Usar esta pasta**. A pasta precisa existir.

### Modelo, esforço, permissões e outras opções

A linha abaixo tem os seletores da página inicial:

- **Modelo** e **Esforço**: o modelo e o quanto ele pensa. **Automático** vem primeiro no menu **Modelo**, como na página inicial: as sessões da tarefa começam no nível Melhor, e o agente principal delas pode subir sozinho para Máximo quando um problema se mostra difícil demais (veja [Níveis: um modelo para cada tipo de trabalho](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Ele é oferecido quando [**Liderar com subagentes**](/settings?s=models&find=Lead%20with%20subagents) está ativado e o programa tem níveis (no Custom, quando o nível Melhor já indica um modelo), e não para uma tarefa confidencial. Uma nova tarefa começa em Automático onde ele for oferecido; uma tarefa que você salvou antes mantém o modelo dela, e você pode mudá-lo aqui a qualquer momento. Em um terminal, `hydor tasks new … --model auto` faz o mesmo (veja [Hydor em um terminal](/guide/terminal)). Um modelo escolhido pelo nome é usado como foi indicado. Em outros casos, valem os padrões do agente.
- **Permissões**: o que o agente pode fazer sem perguntar a você. Uma nova tarefa começa em **Perguntar** para o Claude Code, **Automático** para o Codex e **Automático** para o Custom (as etapas de rotina seguem em frente, as arriscadas pedem confirmação). Pode ser que ninguém esteja olhando quando uma execução acontece: uma execução que precisa da sua aprovação espera por ela, na própria sessão e na [Caixa de entrada](/guide/inbox).
- **Agente**, **Memória** (quando a memória está ativada), **Limite de gastos**, **Enxame** e **Pesquisa**: a nova sessão de cada execução começa com essas opções, como uma sessão iniciada pela página inicial (veja [Sessões](/guide/sessions), [Agentes](/guide/agents) e [Memória](/guide/memory)). Uma tarefa que é executada como um dos seus agentes é um dos agendamentos desse agente: ela aparece na página do agente, suas execuções usam o nível do agente e contam para o orçamento mensal dele. Uma execução que falha ou termina com erro no nível do agente é executada de novo um nível acima, até Melhor, a menos que a opção **Subir de nível quando uma verificação falhar** do agente esteja desativada. Um agente que pensa com um nível continua sendo executado no nível dele, seja qual for o modelo da tarefa. Quando o agente mantém uma conversa própria, cada execução publica nessa conversa em vez de iniciar uma nova sessão.

### O prompt

O que o agente deve fazer a cada vez. Escreva como instruções completas: uma execução começa do zero e não enxerga a conversa em que você teve a ideia. Pode ter até 50.000 caracteres.

A primeira mensagem de cada execução traz mais do que o seu prompt: uma linha com o nome da tarefa, a frequência com que ela é executada, o motivo de esta execução ter começado e a hora atual; um pedido para relatar como foi; e as notas da tarefa de execuções anteriores. Na sessão da execução, tudo isso aparece como uma única linha, como "Tarefa agendada Resumo da manhã · Dias úteis às 07:30". Selecione-a para ler o prompt e, em "Adicionado pelo app para esta execução", o restante.

### Quando a tarefa é executada

**Quando** tem cinco opções: **Em um horário**, **Repetindo**, **Uma vez**, **Acompanhar** e **Webhook**. Nas três primeiras, uma linha abaixo delas ("Próxima: …") lista as próximas execuções, até três, no seu fuso horário.

- **Em um horário**: um horário do dia e os dias da semana (D S T Q Q S S). Selecione um dia para ativá-lo ou desativá-lo; os sete dias significam todos os dias, e pelo menos um sempre fica ativado.
- **Expressão cron…** (em **Em um horário**) transforma o horário e os dias em uma expressão cron, uma forma padrão de escrever agendamentos, que você pode então alterar; **Um horário do dia** volta ao modo anterior. Ela tem cinco campos: minuto, hora, dia do mês, mês e dia da semana (0 ou 7 é domingo), no seu fuso horário. `*/15 9-17 * * 1-5` é executada a cada 15 minutos, das 09:00 às 17:45, nos dias úteis. Nomes de meses e dias (`jan`, `mon`) e os atalhos `@hourly`, `@daily`, `@weekly`, `@monthly` e `@yearly` também funcionam. Uma expressão que não funciona é recusada, com o motivo, ao salvar.
- **Repetindo**: "A cada [número] minutos" ou "horas". O intervalo mais curto é de 5 minutos; uma nova tarefa repetitiva é executada a cada hora. A primeira execução acontece um intervalo depois de você salvar.
- **Uma vez**: uma data e um horário (uma hora a partir de agora, para começar). Depois de uma execução que deu certo (**Concluído** ou **Nada novo**), a tarefa é excluída, já que não tem mais nada a fazer. Depois de uma que falhou ou que precisa de você, ela se desativa sozinha e continua na lista, para você ver o motivo e executá-la de novo com **Executar agora**.
- **Acompanhar**: veja [Acompanhar uma mudança](/guide/tasks#watch-for-a-change).
- **Webhook**: veja [Iniciar execuções a partir de outro serviço com um webhook](/guide/tasks#start-runs-from-another-service-with-a-webhook).

Nos apps para computador, o computador não entra em repouso sozinho de alguns minutos antes de uma execução prevista até ela começar, nem enquanto ela trabalha (veja [Manter o computador ativo](/guide/app#keep-the-computer-awake)); as verificações de um observador não o mantêm ativo. Fechar a tampa de um notebook ainda o coloca em repouso, e um computador que está em repouso na hora executa a tarefa quando acordar. Para execuções que precisam acontecer a qualquer hora, use um computador que fique sempre ligado.

### A cada execução

- **Inicia uma nova sessão** (o padrão), ou **Publica em:** uma das suas sessões recentes com o mesmo agente (as 40 mais recentes que não estejam arquivadas). Publicar em uma sessão mantém todas as execuções em uma só conversa, que usa o próprio modelo e as próprias configurações. Quando o agente dessa sessão está ocupado, a mensagem da execução espera na fila até o turno terminar, e o custo da execução conta apenas a parte dela.
- **Para acima de US$**: um limite de gastos para cada execução, a preços de API. A sessão da execução para assim que gastar esse valor (verificado após cada chamada ao modelo). Vazio significa sem limite. É o mesmo limite do chip **Limite de gastos** acima e, como ele, vale para novas sessões.
- **Pausar após [3] falhas seguidas**: a tarefa se pausa depois desse número de execuções com falha seguidas e avisa você o motivo. 0 significa que falhas nunca a pausam; o máximo é 50.

A linha abaixo resume: "Uma execução avisa como foi; uma sem nada a relatar fica em silêncio, e as falhas sempre notificam."

## Acompanhar uma mudança

Um observador é uma verificação barata que roda a cada poucos minutos sem um modelo e só acorda o agente quando algo mudou. Escolha **Acompanhar** em **Quando** e depois o que observar:

- **Feed**: o **Endereço** de um feed RSS ou Atom (a lista de novas publicações que muitos sites, blogs e hospedagens de código oferecem). Cada novo item acorda o agente, com título, link, data e resumo (até 25 por vez).
- **Página**: o **Endereço** de uma página da web, e **Qual parte** conta:
  - **Página inteira**: qualquer mudança no texto legível dela.
  - **Perto de um texto**: somente as linhas com esse texto, mais a linha anterior e a seguinte de cada uma (para um preço, "Preço").
  - **Seletor**: a parte que um seletor CSS simples escolhe (os nomes que uma página da web dá às suas partes): uma tag, `#id`, `.class` ou `[attribute=value]`, combinados ou aninhados, como `main .price`.

  A execução recebe as linhas que apareceram e as que sumiram. O observador lê a página como o servidor a recebe, sem executar os scripts dela, então use **Testar** para conferir se ele enxerga o que você enxerga.
- **JSON**: o **Endereço** de uma resposta JSON (o formato de dados que as APIs de muitos serviços fornecem), **Valor em** um caminho como `data.price` ou `data.items[0].price`, e **Acordar quando ele** mudar, for igual a, não for, estiver acima de, estiver abaixo de ou contiver um **Valor**. Números são comparados como números. Uma condição acorda o agente quando começa a valer, e não a cada verificação enquanto continua valendo.
- **Pasta**: uma **Pasta** neste computador e, se quiser, **Somente arquivos como** um padrão como `*.pdf` (`*` representa qualquer texto, `?` um caractere). Novos arquivos acordam o agente, com seus nomes, tamanhos e datas. Arquivos ocultos e subpastas ficam de fora.
- **Command**: um **Command** que é executado com o seu shell na pasta da tarefa a cada verificação, por no máximo um minuto, e se deve acordar **Quando a saída mudar** ou **Quando o código de saída mudar** (o número com que um comando termina: 0 geralmente significa que deu certo). A execução recebe a saída e o que mudou nela.
- **E-mail**: novos e-mails em uma conta de e-mail que você conectou (veja [Conectar seu e-mail](/guide/connections#connect-your-email)). Escolha a **Conta** e a **Pasta** (a Caixa de entrada, a menos que você escolha outra) e, se quiser, apenas e-mails em que **O remetente contém** ou **O assunto contém** certo texto, ou **Somente e-mails ainda não lidos**. Cada novo e-mail inicia uma execução própria, no máximo 10 por verificação: quem enviou e para quem, a data, o assunto e o texto, como dados externos, com os anexos salvos na pasta da tarefa em email-attachments. Quando chegam mais de 10 entre duas verificações, os 10 mais novos recebem execuções e a primeira execução lista os mais antigos em uma linha. Um e-mail nunca inicia duas execuções, nem depois de o app reiniciar.
- **App conectado**: algo novo em um dos apps que você conectou (veja [Apps conectados](/guide/connections)), como um novo negócio ou contato em um CRM, um novo arquivo em um drive na nuvem, um novo ticket ou um novo pagamento. Escolha a **Conta** e depois a **Ferramenta** que ele chama a cada verificação: só são oferecidas as ferramentas dele que consultam (listar ou buscar), nunca uma que envia, altera, exclui ou paga, e somente as que estão ativadas para ele. **Começar por** oferece pontos de partida prontos onde o app guarda esse tipo de coisa (**Novos arquivos**, **Novos contatos**, **Novos negócios**, **Novos tickets**, **Novos pagamentos** e outros): cada um escolhe uma das ferramentas da própria conta e preenche os campos dela. Preencha os campos da ferramenta como quiser; em um campo, `{{now}}` representa o horário de cada verificação e `{{now+2d}}` dois dias depois (`{{today}}` e `{{tomorrow}}` também). **Experimentar** chama a ferramenta uma vez e mostra o que voltou: onde estão os itens na resposta (**Os itens estão em**), o campo que os diferencia (**Diferenciado por**, como um id ou um endereço), os primeiros itens e **O que ele respondeu** por completo. Escolha outra lista ou outro campo ali se o que ele encontrou não estiver certo. Cada novo item inicia então uma execução própria, no máximo 10 por verificação, com o item como dados externos; quando chegam mais de uma vez, a primeira execução cita os outros em uma linha. Um item nunca inicia duas execuções, nem depois de o app reiniciar. Peça à ferramenta os mais recentes primeiro, e em quantidade suficiente, onde os campos dela permitirem.
  - **Antes de cada evento**: para uma agenda conectada, uma execução em um momento definido antes de cada evento, em vez de uma para cada novo item. **Iniciar uma execução** **15 min**, **30 min** ou **1 hora** antes de cada evento, ou **A noite anterior** **Às** um horário que você escolher, e, se quiser, apenas eventos em que **O título contém** um texto, ou **Somente eventos com outras pessoas**. Use a ferramenta que lista seus eventos, com campos de `{{now}}` a `{{now+2d}}` ou mais ou menos isso, e escolha o campo com o início de cada evento em **Horário de início em** depois de **Experimentar**. O observador lê os próximos eventos a cada verificação e mais uma vez no momento de cada evento. Um evento que muda de horário recebe a execução antes do novo horário; um cancelado não recebe nenhuma.

Depois:

- **Verificar a cada [número] minutos**: com que frequência ele olha, de 1 minuto a uma semana. Um novo observador olha a cada 15 minutos.
- **Permitir endereços neste computador ou em sua rede** (feeds, páginas e JSON): desativado, a menos que você marque, então um observador só alcança sites públicos. Só você pode permitir isso, aqui no formulário; um observador que um agente propõe nunca alcança a sua rede.
- **Testar**: mostra o que o observador enxerga agora, com uma linha como "12 itens (primeira olhada)" e uma amostra do que ele leu, ou o que deu errado.

Como um observador se comporta:

- A primeira olhada depois de você salvar apenas registra; as mudanças depois disso acordam o agente. Mudar o que uma tarefa observa a faz começar do zero.
- O que ele leu chega ao agente marcado como dados externos, para trabalhar com eles e nunca para seguir como instruções.
- Uma mudança que chega enquanto a execução da anterior ainda está em andamento espera a próxima olhada. Novos e-mails, novos itens de um app conectado e eventos da agenda são a exceção: cada um inicia a própria execução.
- Quando uma olhada falha (o site está fora do ar, o texto não está mais na página, um app conectado foi desconectado ou a resposta dele mudou), a linha avisa, e nenhuma execução começa com o que não pôde ser lido. Depois de tantas olhadas com falha seguidas quanto **Pausar após … falhas seguidas** permite, a tarefa é pausada: "Pausada depois de a verificação falhar 3 vezes seguidas: …".
- **Executar agora** em uma tarefa de observador executa o agente com o que o observador enxerga agora, em vez de com uma mudança.

## Iniciar execuções a partir de outro serviço com um webhook

Um webhook é um endereço que outro serviço chama quando algo acontece: o GitHub quando um pull request é aberto, um formulário quando alguém o envia, um script seu. Escolha **Webhook** em **Quando** e salve a tarefa para obter o endereço dela (“Salve a tarefa para obter o endereço; cada chamada a ele inicia uma execução”). Ele aparece na linha da tarefa, com um botão de copiar. O endereço funciona sem entrar no app, porque a parte secreta dele é a permissão: mantenha-o privado e prefira um modo de permissão que pergunte antes de fazer alterações. O serviço precisa conseguir acessar este app nesse endereço.

Partes da chamada podem ir para o prompt:

- `{{body.path.to.field}}`: um valor do que o serviço enviou (JSON, um formulário ou texto simples), como `{{body.pull_request.html_url}}`.
- `{{headers.name}}`: um dos cabeçalhos da chamada. Cabeçalhos que carregam credenciais (Authorization, cookies, assinaturas, tokens) nunca são preenchidos.
- `{{query.name}}`: um valor da query do endereço (a parte depois de `?`).
- `{{body}}` para todo o corpo, `{{request}}` para o corpo, os cabeçalhos e a query juntos.

Eles chegam ao agente marcados como dados externos. **Executar agora** em uma tarefa de webhook envia o prompt como foi escrito, sem nenhuma chamada para preenchê-lo.

As opções abaixo do endereço:

- **Segredo de assinatura (opcional)**: digite um ou selecione **Gerar**, e passe o mesmo segredo ao serviço. As chamadas então precisam trazer uma assinatura HMAC-SHA256 do corpo feita com ele (um código que só quem conhece o segredo consegue fazer), como GitHub, Gitea e outros enviam; o cabeçalho de token do GitLab também funciona. Chamadas sem ela são recusadas.
- **Cabeçalho da assinatura**: aparece quando há um segredo. Deixe vazio para os usuais (X-Hub-Signature-256, X-Gitea-Signature, X-Signature-256…), ou informe o que o seu serviço usa.
- **Filtro (opcional)**: **Executar somente quando** ou **Ignorar quando** um caminho dentro da chamada **for** um valor: `body.action` for `opened`, `headers.x-github-event` for `push`, `query.kind` for `daily`. Um caminho sem `body.`, `headers.` ou `query.` lê o corpo. Uma chamada que o filtro deixa de fora é respondida e não inicia nada.

O que o endereço faz com as chamadas:

- Uma entrega enviada de novo com o mesmo Idempotency-Key ou id de entrega (GitHub, Gitea e GitLab dão um a cada entrega) executa uma vez só. Os ids são lembrados por uma semana.
- Uma chamada feita até cinco segundos depois da última execução da tarefa é rejeitada, de modo que uma rajada de chamadas inicia uma única execução.
- Uma tarefa pausada recusa chamadas. Uma chamada pode ter até 2 MB.
- A chamada é respondida na hora, com um link para a sessão da execução. Adicione `?wait=60` ao endereço para esperar até 60 segundos pela resposta do agente (até 300); uma execução que ainda estiver em andamento até lá responde com um link para ela.

## Dar um novo endereço a uma tarefa de webhook

Se o endereço vazou, ou se um serviço deve parar de chamá-lo: menu da tarefa (⋯) → **Novo endereço**, depois confirme **Novo endereço** (“O endereço atual deixa de funcionar. Atualize os serviços que o chamam.”). Editar uma tarefa de webhook mantém o endereço dela; uma cópia recebe um endereço próprio.

## Começar de um exemplo

Abaixo da lista, [**Começar de um exemplo**](/settings?s=tasks&find=Start%20from%20an%20example) (“Um formulário curto para cada; mude o que quiser depois”) reúne tarefas prontas em linhas, com as quatro primeiras à vista e as demais atrás de **Mostrar todos os exemplos** (**Mostrar menos exemplos** as recolhe de novo). Aqui estão em três grupos: **Dia a dia**, **Acompanhar** e **Engenharia**. Selecione um para abrir o formulário curto, preencha-o, escolha quem o executa em **Executada por** e selecione **Criar tarefa**. **Mais opções…** abre o formulário completo da tarefa com tudo preenchido. Os campos marcados com (opcional) podem ficar vazios; os outros são necessários. As chaves de ativação (como **Pull requests abertos**) dizem o que o agente pode fazer: ligadas ou desligadas, como preferir.

**Dia a dia**

- [**Resumo da manhã**](/settings?s=tasks&find=Morning%20brief): a previsão do tempo, as notícias sobre o que você acompanha e o seu dia, toda manhã. Você informa o horário (07:30 de início), os dias, a cidade para a previsão do tempo e os assuntos para as notícias; ele acrescenta os eventos de hoje e os e-mails urgentes quando há uma agenda ou uma conta de e-mail conectada.
- [**Notícias sobre um assunto**](/settings?s=tasks&find=News%20on%20a%20topic): o que realmente há de novo sobre um assunto, com fontes, no horário e nos dias que você escolher (todos os dias às 09:00 de início); fica quieta quando não há nada.
- [**Relatório semanal de uma pasta**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): em um dia da semana (sexta-feira às 16:00 de início), o que mudou em uma pasta ou repositório nos últimos sete dias e o que parece inacabado, com três sugestões para a semana seguinte. Não altera nenhum arquivo.
- [**Resumo da caixa de entrada**](/settings?s=tasks&find=Inbox%20digest): o que chegou ao seu e-mail desde a última execução, com as mensagens que precisam de você primeiro. Ele só lê e precisa de uma conta de e-mail conectada (veja [Apps conectados, chaves e ferramentas](/guide/connections)).
- [**Check-in de hábito**](/settings?s=tasks&find=Habit%20check-in): uma pergunta amigável sobre um hábito no horário que você escolher (todos os dias às 20:00 de início), mantendo a sua sequência nas notas da tarefa.
- [**Lembrete**](/settings?s=tasks&find=Reminder): um lembrete em um horário definido nos dias que você escolher (dias úteis às 09:00 de início). Para um lembrete único, veja [Lembretes](/guide/tasks#reminders).

**Acompanhar**

- [**Monitor de preço**](/settings?s=tasks&find=Price%20watch): acompanha a página de um produto a cada 60 minutos (só perto de um texto como “Preço”, se você informar um) e avisa quando o preço muda, ou quando está igual ou abaixo da meta que você definir.
- [**Alerta de mudança de página**](/settings?s=tasks&find=Page%20change%20alert): acompanha uma página, ou a parte perto de um texto, a cada 30 minutos, e diz o que mudou e se isso importa; mudanças triviais passam em silêncio.
- [**Novos lançamentos**](/settings?s=tasks&find=New%20releases): acompanha os lançamentos de um repositório do GitHub (dono/nome) a cada 6 horas e resume o que há de novo e o que pode quebrar.
- [**Verificação de site no ar**](/settings?s=tasks&find=Site%20up%20check): verifica um endereço a cada 10 minutos. Quando o site cai, o agente descobre o motivo (DNS, certificado, status HTTP, tempo esgotado); quando ele volta, avisa em uma linha.
- [**Alerta de espaço em disco**](/settings?s=tasks&find=Disk%20space%20alert): verifica um disco (`/` de início) a cada 30 minutos. Quando ele passa de um limite (90%), o agente descobre o que ocupa o espaço e sugere o que limpar, sem excluir nada.
- [**Novos arquivos em uma pasta**](/settings?s=tasks&find=New%20files%20in%20a%20folder): acompanha uma pasta a cada 15 minutos (só arquivos como `*.pdf`, se você disser) e faz o que você escrever em **Depois** com cada arquivo novo, ou diz em uma linha o que cada um é.

**Engenharia** (mais em [Engenharia](/guide/engineering))

- [**Revisar novos pull requests**](/settings?s=tasks&find=Review%20new%20pull%20requests): uma tarefa de webhook em uma pasta de repositório que o GitHub ou o Gitea chama a cada novo pull request (ela só executa quando a chamada diz `opened`). O agente revisa a mudança e sugere correções, sem fazer push nem merge. Depois de salva, copie o endereço dela para as configurações de webhook do repositório, como diz a linha da tarefa (apenas **Pull requests** entre os eventos individuais).
- [**Doutor de CI**](/settings?s=tasks&find=CI%20doctor): uma execução com falha no GitHub Actions, GitLab CI, Buildkite ou CircleCI acorda um agente que lê os logs, distingue o instável do real, executa de novo ou abre um pull request em rascunho com uma correção, conforme você permitir, e faz um resumo. Veja [Doutor de CI](/guide/engineering#ci-doctor).
- [**Triagem de issues**](/settings?s=tasks&find=Issue%20triage): cada nova issue recebe uma etiqueta, é verificada quanto a duplicatas, é respondida com um pedido gentil pelo que falta e, quando a correção é pequena, é tentada em um pull request em rascunho. Veja [Triagem de issues](/guide/engineering#issue-triage).
- [**Jardineiro de dependências**](/settings?s=tasks&find=Dependency%20gardener): uma vez por semana (segundas-feiras às 09:00 de início), faz atualizações em worktrees com os testes executados, correções de segurança primeiro, um pull request por nível de risco, ou um relatório. Veja [Jardineiro de dependências](/guide/engineering#dependency-gardener).
- [**Primeiro socorro a incidentes**](/settings?s=tasks&find=Incident%20first%20responder): um alerta do Sentry, Grafana, Datadog, Better Stack ou de outro serviço acorda um agente que avisa você na hora, encontra a causa provável e pergunta antes de qualquer rollback. Veja [Primeiro socorro a incidentes](/guide/engineering#incident-first-responder).

O formulário de um exemplo de webhook diz, abaixo dos campos, para onde irá o endereço dele; depois que a tarefa é criada, a linha dela diz o mesmo abaixo do endereço.

## Experimentar uma tarefa com uma execução de teste

**Execução de teste**, no rodapé do formulário, executa a tarefa uma vez agora, do jeito que o formulário está, sem salvá-la. Ela roda como uma execução real, em uma sessão própria com o título “Teste: <nome> · <hora>”, e uma faixa no formulário mostra **Execução de teste** com o resultado quando termina, e **Abrir a sessão**. Uma execução de teste nunca conta para as falhas que pausam uma tarefa. Testar uma tarefa que você está editando lê as notas dela e aparece no histórico dela como **Execução de teste**; uma tarefa nova ainda não tem notas.

Para experimentar uma tarefa que envia, publica ou exclui sem que nada saia, abra o menu ao lado de **Execução de teste** (**Mais formas de testar**) e escolha **Testar sem enviar**, ou escolha **Testar sem enviar** no menu (⋯) de uma tarefa salva. Ela roda do mesmo jeito, mas toda chamada a uma ferramenta de uma conta conectada que age para fora (envia, publica, divulga, responde, convida, compartilha, exclui ou paga), e toda chamada a uma ferramenta em Perguntar antes, é registrada como “teria sido enviado” e nunca é feita. O agente é avisado disso e segue como se tivesse sido feita. A faixa dela, a execução dela em **Histórico** e a sessão dela listam o que **Teria sido enviado**, e nada fica esperando na Caixa de saída depois. Ler funciona como de costume. Veja [Apps conectados, chaves e ferramentas](/guide/connections#ask-first-calls-that-wait-for-your-ok).

## Executar uma tarefa agora

Menu da tarefa (⋯) → **Executar agora** inicia uma execução na hora, com a tarefa ligada ou pausada, e abre a sessão dela.

## Ver como foram as execuções

Menu da tarefa (⋯) → **Histórico**, ou **Histórico** ao lado dos pontos, abre as execuções da tarefa, da mais nova para a mais antiga (as últimas 50 aparecem; o app guarda 100 por tarefa). Cada execução mostra:

- Como foi: **Executando**, **Concluído**, **Parcialmente concluída**, **Bloqueada** (o agente precisa de você: um acesso ou uma decisão), **Falhou**, **Nada novo** ou **Erro** (não conseguiu começar, ou a vez dela parou com um erro).
- Quando começou, o que a iniciou (**Agendada**, **Webhook**, **Monitor**, **Executar agora**, **Executar de novo**, **Execução de teste** ou **Testar sem enviar**), quanto tempo levou e quanto custou.
- Para um teste sem enviar, o que **Teria sido enviado**: cada chamada, com a conta, a ferramenta e para quem teria ido.
- O resumo de uma linha do agente. Selecione um resumo longo para ler toda a última resposta do agente.
- **Abrir a sessão** e **Executar de novo com a mesma entrada**, que executa a tarefa outra vez com o que aquela execução recebeu: a mesma chamada de webhook, ou a mesma mudança que um monitor viu.

O resultado é o que o agente informou no fim. Quando ele não informou nada, o app decide: **Erro** se a vez parou com um erro, **Nada novo** se a resposta começa com [SILENT] ou só diz que não há nada a relatar, e **Concluído** nos demais casos. Na sessão da execução, o relatório do agente aparece como uma etapa: “Informou concluído: …”.

## Notas que uma tarefa guarda entre as execuções

Abaixo do histórico fica o bloco de notas da tarefa, **Notas guardadas pelas execuções**: o que a próxima execução deve saber, como o que já foi relatado, um total acumulado ou onde parou. Cada execução o lê no início, e o agente acrescenta algo a ele ou o reescreve. Selecione **Editar** para alterá-lo você mesmo, depois **Salvar** (ou **Cancelar**). Ele comporta até 8.000 caracteres; acima disso, as linhas mais antigas saem.

## Notificações de uma tarefa

Uma execução avisa como foi com a notificação habitual da sessão dela, com o nome da sessão como título e o resumo de uma linha do agente no texto. Ela segue as suas configurações de notificação (veja [Caixa de entrada e notificações](/guide/inbox)).

- Uma execução sem nada a relatar não envia nada.
- Uma execução que falhou, ou que terminou com um erro, sempre envia um aviso de falha.
- Uma execução bloqueada envia um aviso de que precisa de você, começando com “Bloqueada:”.
- Uma execução que não conseguiu começar (a pasta dela não existe mais, a sessão em que ela publica foi excluída) envia um aviso de falha, “Não foi possível começar: …”.
- Uma tarefa que se pausa sozinha envia um aviso dizendo o motivo.
- Uma execução que encerra a própria tarefa avisa: “O trabalho dela está concluído, então a agenda foi excluída.”
- Uma execução que publica em uma das suas conversas deixa os avisos dessa conversa como estão.

Um agente também pode enviar uma notificação enquanto trabalha (a ferramenta notify_user dele), para algo que não pode esperar o fim da execução; qualquer agente pode, e também a etapa de um app.

## Pausar, ligar, editar, duplicar ou excluir uma tarefa

- **Pausar ou ligar**: a chave de ativação na linha da tarefa. Uma tarefa pausada não executa nem acompanha, e o webhook dela recusa chamadas. Ligar a tarefa de novo zera a contagem de falhas e o motivo da pausa.
- **Pausa automática**: depois do número definido de falhas seguidas, a tarefa se pausa e a linha dela diz o motivo (“Pausada após 3 execuções com falha seguidas. A última: …”).
- **Editar**: menu da tarefa (⋯) → **Editar** abre o formulário como **Editar tarefa**; selecione **Salvar**.
- **Duplicar**: abre um formulário de nova tarefa com uma cópia chamada “<nome> (cópia)”, para você alterar e salvar.
- **Excluir**: pergunta antes: “Ela deixa de executar e o histórico dela some. As sessões que ela iniciou permanecem.”
- **Exclusão automática**: uma tarefa que não é mais necessária some sozinha, cerca de um minuto depois que a última execução dela termina: uma tarefa de uma vez só após uma execução que deu certo, e uma tarefa cuja execução constatou que o trabalho estava concluído, porque aquilo que ela esperava ou acompanhava aconteceu e o prompt dela mandava parar nesse caso (a notificação da execução avisa). As agendas de um agente são excluídas junto com o agente.

## Deixe um agente configurar uma tarefa

Peça em qualquer conversa, com suas próprias palavras: "me lembre na sexta às 9 de ligar para o dentista", "toda segunda de manhã, resuma os problemas da semana passada", "avise quando esta página mudar". O agente propõe a tarefa, e um cartão a mostra na conversa. Nada é salvo até você responder.

O cartão pergunta **Agendar esta tarefa?**, com o nome da tarefa e **Aguardando você**, e mostra:

- **Quando**: o agendamento em palavras, com as próximas execuções no seu fuso horário. Para um monitor, o que ele observa e com que frequência, com o endereço, o comando ou a ferramenta de um app conectado, e "Ele parece certo depois que você confirma, e o agente só acorda quando algo muda."
- **Faz**: o prompt (**Tudo** abre um prompt longo).
- **Execuções**: o agente, o modelo dele (**Automático** quando a conversa está nele) e onde: uma nova sessão em uma pasta ou nesta conversa.

Depois escolha:

- **Agendar**: salva a tarefa e a ativa.
- **Editar…**: abre o formulário da tarefa com tudo preenchido, para você alterar qualquer parte antes; o botão dele também diz **Agendar**.
- **Agora não**: recusa.

O agente recebe sua resposta como uma mensagem, incluindo as partes que você alterou, então você não precisa avisá-lo. O cartão permanece na conversa com o resultado ("Agendada", "Próxima execução …", um link para **Tarefas agendadas**) e mostra o mesmo nos seus outros dispositivos.

A menos que você peça outra coisa, a tarefa é executada com o agente, o modelo, as permissões e a pasta da conversa (uma conversa em **Automático** cria uma tarefa que também começa em Automático), e a sessão de cada execução começa com as configurações da conversa: o agente, a memória, o limite de gastos, as contas conectadas e o projeto. Peça que as execuções publiquem aqui, e cada uma será publicada nesta conversa em vez de começar uma nova sessão.

Os agentes também podem alterar, pausar, ativar de novo ou excluir suas tarefas, sempre com um cartão antes: **Alterar esta tarefa?** (as partes que mudam, com o valor antigo riscado acima do novo), **Pausar esta tarefa?**, **Ativar esta tarefa de novo?** ou **Excluir esta tarefa?**, cada um com seu próprio sim e não (**Alterar** ou **Manter como está**, **Pausar** ou **Manter em execução**, **Ativar** ou **Manter pausada**, **Excluir** ou **Manter**). Eles também podem listar suas tarefas com a próxima execução de cada uma e como foi a última.

Os agentes excluem uma tarefa que não é mais necessária em vez de pausá-la. Para uma tarefa que deve parar quando algo acontecer ("até a nova versão sair", "quando minha encomenda chegar"), eles dizem isso no prompt dela, e a execução que perceber o acontecimento encerra a tarefa.

Alguns limites mantêm tudo sob controle:

- Uma conversa pode ter até cinco propostas aguardando sua resposta.
- Um agente não pode propor uma nova tarefa quando você já tem 100.
- Uma execução agendada não pode agendar nem alterar tarefas; ela é instruída a sugerir uma no resumo. Ela só pode encerrar a própria tarefa, quando seu trabalho estiver concluído.
- Um monitor proposto por um agente nunca acessa endereços do seu próprio computador ou da sua rede.

## Transforme uma sessão em tarefa

Quando uma sessão fez algo que você quer repetir: menu da sessão (⋯) → **Mais** → **Transformar em automação**. O [modelo auxiliar](/settings?s=models&find=Helper%20model) lê a conversa e redige uma tarefa: um prompt que pode ser executado de novo sozinho (sem os detalhes pontuais desta vez, com suas correções incorporadas) e um gatilho adequado. O agente, o modelo, o esforço, as permissões, a pasta e as configurações da sessão vêm da própria sessão (uma sessão em **Automático** gera uma tarefa que começa em Automático); uma sessão em uma worktree é executada no repositório de onde veio.

O formulário abre como **Nova automação a partir desta sessão**, com uma linha explicando por que ele escolheu esse gatilho. Altere o que quiser, faça uma execução de teste e depois salve; a tarefa então fica em [Configurações → Tarefas agendadas](/settings?s=tasks). Uma sessão sem mensagens suas não pode ser transformada em tarefa.

## Lembretes

Um lembrete é uma tarefa cuja execução avisa você em um horário definido, como notificação e na própria sessão. Há três maneiras de criar um:

- Peça a um agente: "me lembre amanhã às 8 de levar o lixo para fora". Ele propõe uma tarefa que é executada uma vez, e você a confirma no cartão.
- Use o exemplo [**Lembrete**](/settings?s=tasks&find=Reminder) para um que se repete nos dias que você escolher.
- Crie uma **Nova tarefa** com **Uma vez** em **Quando** e um prompt como "Me lembre, em uma frase simpática, de ligar para o dentista."

## No celular

[Configurações → Tarefas agendadas](/settings?s=tasks) funciona do mesmo jeito no celular, e [Agendamentos](/agents/schedules) mostra um dia por vez. O formulário da tarefa, os formulários dos exemplos e as confirmações (antes de **Excluir** ou **Novo endereço**) abrem como painéis na parte de baixo da tela. As opções em **Quando** e os tipos de monitor rolam para os lados quando não cabem, e os exemplos aparecem em uma coluna de linhas. Para receber avisos das suas tarefas com o app fechado, ative as notificações no celular (veja [Caixa de entrada e notificações](/guide/inbox)).

## Peça a um agente

- "Todo dia útil às 7h30, me dê a previsão do tempo em Atenas e as notícias de IA desde ontem."
- "Me lembre na sexta às 9 de ligar para o dentista."
- "Faça meu resumo da manhã rodar em Automático."
- "Monitore esta página de produto e me avise quando o preço cair abaixo de €99."
- "Sempre que chegar um e-mail com uma nota fiscal do meu contador, salve o PDF em ~/Invoices e adicione uma linha na minha planilha de despesas."
- "Comece uma tarefa quando um novo negócio entrar no HubSpot: pesquise a empresa e redija uma primeira resposta para o contato."
- "Trinta minutos antes de cada reunião com cliente no meu Google Agenda, me explique com quem vou me encontrar e o que discutimos da última vez."
- "Quais das minhas tarefas agendadas falharam esta semana, e por quê?"
- "O que nos meus painéis é atualizado amanhã de manhã, e quanto essas atualizações custam por mês?"
- "O que é executado sozinho amanhã, e em que horário?"
- "Por que tantas das minhas tarefas começaram às 08:00 na segunda? Distribua melhor os horários."
- "Pause meu Resumo da manhã", ou "Execute o relatório semanal agora."
- "Verifique a cada 30 minutos se minha encomenda foi entregue, me avise quando for e depois pare."
- "Quais das minhas tarefas agendadas não são mais necessárias? Exclua-as."
- "Teste meus lembretes de notas fiscais sem enviar nada e mostre os e-mails que ele teria enviado."
- "Transforme esta conversa em uma tarefa que roda toda segunda às 9."
- "Execute meu app Reading list sempre que este feed tiver uma nova publicação, com o link da publicação."
- "Configure um CI doctor para ~/code/shop no GitHub Actions que possa executar de novo jobs instáveis."
