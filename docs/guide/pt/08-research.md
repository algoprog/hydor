# Pesquisa aprofundada, segundas opiniões e vários agentes

Quando um agente trabalhando sozinho não basta, o app pode colocar vários na tarefa: uma pesquisa aprofundada que envia pesquisadores atrás de cada parte de uma pergunta e devolve um relatório com citações, subagentes que tiram partes de uma tarefa das mãos de um agente, um enxame que ataca um problema difícil de vários ângulos ao mesmo tempo, e uma campanha que faz uma grande mudança em muitas partes. Você também pode pedir que o modelo de outra empresa verifique o trabalho de um turno, enviar um prompt para vários modelos e ficar com a melhor resposta, e definir um limite de gastos para uma sessão, para que nada disso fuja do controle e consuma seu dinheiro.

![Pesquisa aprofundada na página inicial: pesquisadores por vez, rodadas, buscas no total e o relatório](images/research.webp)

## Executar uma pesquisa aprofundada

Uma pesquisa aprofundada serve para perguntas que precisam de muitas fontes: comparar opções, conferir uma afirmação, fazer um levantamento sobre um tema, descobrir o que se sabe sobre algo. O agente que você inicia a conduz. Ele planeja as buscas, envia pesquisadores atrás de cada parte da pergunta, aprofunda o que eles deixam em aberto, manda conferir as afirmações principais em duas fontes e entrega um relatório com todas as fontes citadas.

### Ativar

1. Na página inicial, abra **Opções** (o botão à direita da linha abaixo da caixa de mensagem) e escolha **Pesquisa**.
2. Escolha **Pesquisa aprofundada** (“Busca amplamente, confere as fontes e as cita”). As configurações dela aparecem logo abaixo.
3. Defina os números e o tipo de relatório que você quer (veja abaixo).
4. Digite sua pergunta na caixa de mensagem e pressione **Início**.

A linha Pesquisa agora mostra “Aprofundada · 60 buscas” (seu orçamento de buscas), e o botão Opções passa a exibir o nome dela (“Pesquisa aprofundada”). Escolha **Desativada** (“Um agente responde, buscando conforme precisar”) para voltar a um único agente.

No celular, Opções abre como uma folha na parte de baixo da tela, e Pesquisa abre por cima dela.

Uma pesquisa aprofundada e um enxame (ou uma campanha) funcionam, todos, por meio de uma equipe de subagentes do Hydor, então só é possível usar um ou outro: ativar um desativa o outro.

Na primeira vez que você escolhe **Pesquisa aprofundada**, uma janela chamada “Antes de usar a Pesquisa aprofundada” explica o que ela faz, para que vale a pena, para que não vale a pena e quanto custa. Pressione **Usar Pesquisa aprofundada** para continuar, ou **Cancelar** para deixar tudo como estava. Ela aparece uma só vez para você, em todos os dispositivos, onde quer que você a escolha (a página inicial, as opções de uma tarefa agendada ou a janela de uma sessão) e estando as dicas ativadas ou não; pedir a um agente que mostre as dicas de novo também a traz de volta.

Você não precisa decidir na página inicial. Em uma sessão que já está em andamento, abra o menu dela (⋯) → **Configurações da sessão** → **Pesquisa aprofundada**; a dica ali mostra “Desativada” ou o número de buscas (“60 buscas”). A janela tem **Desativada** e **Pesquisa aprofundada**, com as mesmas configurações descritas acima (**Pesquisadores por vez**, **Rodadas**, **Buscas no total**, **O relatório**); pressione **Salvar** quando terminar, ou **Cancelar**. A mudança vale a partir da sua próxima mensagem: o agente da sessão (Claude Code ou Codex) reinicia com as novas instruções e ferramentas antes dessa mensagem, e a conversa continua de onde estava. Ativar uma pesquisa aprofundada desativa um enxame, e vice-versa. O botão da caixa de mensagem ao lado do **+** (suas **Opções**) tem a mesma linha **Pesquisa aprofundada**, abaixo de **Permissões**.

Essa opção não existe em uma sessão confidencial, nem em uma sessão iniciada por outra sessão (um membro de enxame, um pesquisador, um subagente).

Uma tarefa agendada pode executar uma pesquisa aprofundada a cada execução: o editor dela tem a mesma configuração **Pesquisa** ([Tarefas agendadas](/guide/tasks)).

### Configurações

- **Pesquisadores por vez** (de 1 a 8; 4 para começar): quantos pesquisadores buscam ao mesmo tempo em cada rodada, ou seja, a amplitude de cada rodada.
- **Rodadas** (de 1 a 5; 2 para começar): quantas rodadas de pesquisa, cada uma indo atrás do que a anterior deixou em aberto. Uma rodada de verificação vem depois delas.
- **Buscas no total** (de 10 a 500, em passos de 10; 60 para começar): as buscas na web que a pesquisa inteira pode usar, somando as do líder e as dos pesquisadores.
- **O relatório**: **Página** ou **Word**.

Este navegador lembra os números para a sua próxima pesquisa aprofundada. O modo em si não é guardado: cada nova sessão começa com a Pesquisa desativada, porque uma pesquisa aprofundada custa várias vezes mais do que uma resposta comum.

### O que acontece, passo a passo

1. **Planejar.** O líder identifica o que a pergunta realmente pede e o que uma resposta completa deve cobrir. Divide a pergunta em subperguntas e escreve algumas buscas para cada uma, com palavras variadas, em outros idiomas quando isso ajuda, e voltadas às fontes que resolvem a questão (dados oficiais, artigos, documentos primários, reportagens confiáveis). Se algo crucial não estiver claro, ele pergunta a você uma vez, de forma breve; caso contrário, declara suas suposições e segue em frente.
2. **Primeira rodada.** Ele inicia até o número de pesquisadores que você definiu, um por subpergunta. Cada pesquisador é um subagente do Hydor com uma orientação própria: a pergunta inteira, a parte dele, as buscas para começar, mais ou menos quantas buscas são a parte dele e o que relatar. Depois o líder espera; o relatório de cada pesquisador chega a ele como uma mensagem.
3. **Mais rodadas.** O líder lê os relatórios e envia novos pesquisadores atrás das lacunas, das contradições e das afirmações que se apoiam em uma única fonte. Ele pula uma rodada quando não sobra nada importante em aberto. Depois de cada rodada, conta a você em uma linha o que foi encontrado e o que vem a seguir.
4. **Verificar.** Ele lista as afirmações em que a resposta se apoia. Cada uma precisa de duas fontes independentes, ou é marcada como apoiada em uma só, ou como contestada. Um pesquisador (ou o próprio líder) abre as páginas citadas para confirmar que cada afirmação e número importante realmente está lá; o que não se confirma é corrigido ou descartado.
5. **Relatório.** Ele escreve o relatório: um título claro, primeiro a resposta em poucas frases, depois as seções, uma citação numerada após cada afirmação e as fontes no final (título, site, data e link). Diz o que é incerto ou contestado e por quê, e dá a você um breve resumo na conversa.

Os pesquisadores buscam com a busca na web do próprio app e leem as páginas com o leitor de páginas dele ([Busca e navegador](/guide/web)). Para que toda busca conte no orçamento, a busca na web embutida do Claude Code e do Codex fica desativada em uma pesquisa aprofundada. Quando o orçamento acaba, uma busca é recusada e o agente é instruído a escrever o relatório com o que já tem. Da mesma forma, depois que as rodadas que você definiu e a rodada de verificação terminam, o líder não pode iniciar mais pesquisadores.

### Acompanhar na sessão

Uma barra acima da caixa de mensagem da sessão do líder mostra o que a pesquisa está fazendo: **Pesquisa aprofundada** · “Planejando”, depois “Rodada 1 de 2 · 4 pesquisadores trabalhando”, “Lendo os relatórios” entre as rodadas, “Conferindo as fontes” enquanto os pesquisadores verificam as afirmações principais, “Escrevendo o relatório” e, no fim, “Relatório pronto” · e quanto do orçamento foi usado (“12 de 60 buscas”). Quando o relatório está pronto, **Abrir relatório**, à direita da barra, o abre: a página ou o documento Word. Aponte para a barra para ver as configurações da pesquisa e como será o relatório.

Cada pesquisador tem uma linha no cartão único que os pesquisadores compartilham na conversa do líder (“4 pesquisadores”) e aparece sob o líder na barra lateral, como qualquer [subagente do Hydor](/guide/research#follow-subagents). O que cada um devolve aparece como uma linha, “Resposta de” e o título dele, com o início do que encontrou: clique na linha para ler. Abra um pesquisador para vê-lo trabalhando: a barra dele diz “Pesquisando para” e o título do líder, com **Líder** para voltar.

### O relatório

- **Página**: o relatório é salvo como uma página que fica com você. Ele aparece na conversa e é guardado nos arquivos do projeto da sessão (os detalhes dele → **Arquivos**), ou fica com a conversa quando a sessão não tem projeto ([Páginas, documentos e imagens](/guide/library)).
- **Word**: o relatório é um documento Word (.docx) na pasta da sessão, feito com a habilidade **word-documents** do app, e aparece como um cartão de arquivo que você pode abrir ou baixar ([Documentos, imagens, vídeos e voz](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Uma pesquisa aprofundada executa muitos agentes ao mesmo tempo. Defina um limite de gastos no mesmo menu Opções antes de começar: ele cobre o líder e todos os pesquisadores ([Definir um limite de gastos para uma sessão](/guide/research#put-a-spending-cap-on-a-session)).

## Deixar um agente passar trabalho a subagentes

Qualquer agente pode passar uma parte independente do seu trabalho a um subagente, que trabalha nela ao mesmo tempo e depois informa o resultado. Há dois tipos, e o app diz qual é qual. Um **subagente do Hydor** é uma sessão própria que o Hydor inicia, com qualquer agente e modelo: ele tem uma linha no card de subagentes da conversa, aparece sob a sessão principal na barra lateral, tem custo próprio e uma parte própria do limite de gastos, você pode abri-lo e conversar com ele, e a resposta dele volta para a sessão principal como uma mensagem. Um **subagente do Claude Code** é aquele que o Claude Code executa dentro da sessão para uma parte curta do trabalho (com o Codex, um "subagente do Codex"): ele aparece como um subagente do Hydor, com uma linha no card da conversa, uma linha na barra lateral e na bandeja acima da caixa de mensagem, e uma página própria que você pode abrir e ler, mas você não pode conversar com ele, o que ele gasta conta como gasto da própria sessão e ele não tem parte de um limite de gastos. Na bandeja e na linha dele, cada um indica qual é ("Subagente do Hydor · Claude Code · Sonnet 5.5" ou "Subagente do Claude Code · Explore · Sonnet 5.5"), e, ao apontar para ele, aparece quem o executa ([Subagentes](/guide/sessions#subagents)). O restante desta seção trata dos subagentes do Hydor.

Não há nada para ativar: peça em palavras simples ("peça a três subagentes que pesquisem um fornecedor cada um", "deixe o Codex escrever os testes enquanto você faz a documentação") ou deixe o agente decidir quando um trabalho se divide bem. O agente principal de uma sessão já é orientado a trabalhar assim por conta própria: ele fica com o planejamento e a verificação e passa partes bem definidas a subagentes em níveis mais baratos, para o trabalho custar menos (veja [Níveis: um modelo para cada tipo de trabalho](/guide/agents-models#tiers-a-model-for-each-kind-of-job); **Liderar com subagentes** nessa seção desativa isso).

Para cada subagente do Hydor, o agente escolhe:

- **O agente e o modelo**: Custom com qualquer um dos seus modelos (em [Configurações → Modelos](/settings?s=models)), Claude Code, Codex ou outro agente que você adicionou (Gemini CLI, OpenCode…). Por padrão, um subagente do Hydor executa o mesmo agente da sessão que o iniciou. Um modelo mais barato ou local serve para trabalho em grande volume; o Claude Code ou o Codex serve para uma parte difícil.
- **Um nível** para a sua parte: **Rápido** para um trabalho pequeno e bem claro, **Padrão** para uma tarefa clara de tamanho médio (o que um subagente do Hydor recebe quando nenhum é pedido), **Melhor** para uma parte difícil que se sustenta sozinha; o modelo do nível para aquele programa vem de [Configurações → Modelos → Níveis](/settings?s=models&find=Tiers). Um subagente do Hydor nunca raciocina com um nível acima do da sua sessão principal, e um agente seu pode limitar os níveis dos seus subagentes a algo mais baixo.
- **Um dos seus agentes**, pelo nome, em vez de um subagente comum: ele trabalha com as próprias instruções, ferramentas e nível (veja [Agentes que passam trabalho a outros agentes](/guide/agents#agents-that-hand-work-to-other-agents)). Um agente que mantém uma conversa própria recebe o trabalho na sua Caixa de entrada, e a resposta dele volta quando ele chegar a isso.
- **A pasta**: a da sessão principal, a menos que ele indique outra.
- **Um worktree**, se ele quiser: uma cópia separada do repositório git da pasta em um novo branch, para que as alterações do subagente não se misturem com as de mais ninguém.
- **Um título curto**, que é o nome que você vê.

Um subagente do Hydor não vê nada da conversa da sessão principal, então o agente escreve para ele um briefing com tudo de que precisa. Ninguém o acompanha enquanto ele trabalha: ele decide sozinho as questões pequenas, diz o que decidiu e só para para perguntar quando não consegue continuar.

### Como as respostas voltam

Quando o turno de um subagente do Hydor termina, a resposta dele volta para a sessão principal como uma mensagem, que a desperta. Se a sessão principal estiver ocupada, a mensagem espera na fila até o turno dela terminar.

Na conversa da sessão principal, a resposta aparece como uma linha: "Resposta de", o título do subagente e o início do que ele escreveu. Clique na linha para ler a resposta (o resumo dela, quando era longa) e depois em **Abrir a sessão** ou **Ler a resposta inteira** para ir até o subagente. Um subagente interrompido antes de terminar aparece como "… foi interrompido", e um que falhou aparece como "… parou com um erro". Um que atingiu um limite de uso e continua aparece como "… continua após um limite de uso", com a forma como continua.

Um subagente do Claude Code ou do Codex que trabalhou em segundo plano volta da mesma forma: uma linha, "Resposta de" e o título dele (ou "… foi interrompido", "… parou com um erro"), com o início do que escreveu; clique nela para ler a resposta e depois em **Abrir a sessão** para ir até ele. A resposta de um subagente do Codex é buscada na conversa dele quando você abre a linha ("Carregando a resposta"). Uma resposta que chegou enquanto a sessão principal ainda trabalhava aparece no lugar, entre as etapas anteriores e posteriores a ela.

- Uma resposta com mais de cerca de 4.000 caracteres chega como um resumo curto escrito pelo modelo auxiliar ([Agentes, contas e modelos](/guide/agents-models)); a sessão principal ainda pode lê-la inteira.
- Se um subagente do Hydor parar com um erro ou for interrompido antes de terminar, a sessão principal também é informada.
- Se um limite de uso interromper o turno de um subagente do Hydor e ele continuar (com outra conta, com crédito de API ou sozinho quando o limite for renovado), a sessão principal é informada disso em vez de um erro, para não começar o trabalho de novo: a resposta do subagente chega quando ele terminar. Só um que permanece parado é relatado como erro. Mais em [Use todas as suas contas: troque ao atingir um limite](/guide/agents-models#use-all-your-accounts-switch-at-a-limit).
- Um subagente do Hydor iniciado em Rápido ou Padrão cuja resposta não passe em uma verificação rápida (o modelo auxiliar lê o briefing e a resposta), ou que pare com um erro, é executado de novo um nível acima, até Melhor e nunca acima do mais alto que a sessão que o lidera permitir; a sessão principal é informada de que isso aconteceu e por quê. Só a resposta ao briefing é verificada, não as respostas posteriores a mensagens. Um agente seu pode desativar isso (**Subir de nível quando uma verificação falhar**). A sessão principal também pode subir um subagente de nível por conta própria quando considerar o resultado dele insuficiente.
- A sessão principal pode consultar seus subagentes do Hydor a qualquer momento (o que cada um está fazendo, seu agente e modelo, o que gastou, o início da última resposta) e enviar mais trabalho a qualquer um deles.
- As respostas de turnos que terminaram enquanto o app estava parado são repassadas quando ele iniciar de novo.

Você pode abrir um subagente do Hydor e conversar com ele como em qualquer outra sessão. O que ele responder no fim de um turno também volta para a sessão principal.

### Acompanhar os subagentes

- **Na conversa da sessão principal**: os subagentes iniciados em um turno aparecem juntos em um card sob esse turno, os do Hydor em um card e os do próprio programa em outro. A linha de cima diz quantos são e de que tipo, com o que todos têm em comum ("3 subagentes do Hydor · Claude Code · Sonnet 5.5", "6 subagentes do Claude Code · Sonnet 5.5", "4 pesquisadores" em uma pesquisa profunda), e como estão ("5 trabalhando · 1 concluído", também "1 precisa de você", "1 interrompido", "1 com falha"); clique nela para recolher ou expandir o card. Ele fica aberto enquanto algum deles trabalha ou precisa de você, e se recolhe nessa linha quando todos terminam. Abaixo dela, cada subagente tem uma linha: um ponto na cor do seu estado (azul enquanto trabalha, âmbar quando precisa de você, verde concluído, cinza interrompido, vermelho com falha), o título, em tela larga o que ele tem que os outros não têm (o tipo ou modelo, o agente seu com o qual ele trabalha, o nível) e como está (há quanto tempo trabalha, "Precisa de você", "há 3 min" quando terminou, "Interrompido", "Falhou"). A linha de um subagente do Hydor também mostra o que ele gastou, e, ao apontar para um que subiu de nível, aparece "Subiu de" seu primeiro nível e o motivo; um subagente do Claude Code ou do Codex não tem custo próprio. Clique em uma linha para abrir o subagente. Enquanto outros ainda trabalham, os concluídos se recolhem em uma linha só ("4 concluídos: " e seus títulos; clique nela para vê-los), os que falharam continuam como linhas próprias e, com mais de seis trabalhando, cinco aparecem, com **Mostrar mais 3**. Um turno que iniciou apenas um subagente o mostra como um card de uma linha com o tipo dele ("Subagente do Claude Code · Explore · Sonnet 5.5"). Para interromper um, aponte para a linha dele (ou chegue até ela com Tab) e **Parar** aparece no lugar do tempo (em uma tela de toque há sempre um pequeno botão de parar): um subagente do Hydor para na hora, um subagente do Claude Code pergunta antes ("Parar este subagente?"), e um subagente do Codex não pode ser interrompido individualmente por aqui. O menu **⋯** do card tem **Parar 5 subagentes** (com a quantidade que pode ser interrompida), que interrompe todos sem perguntar.
- **Na barra lateral**: os subagentes ficam sob a sessão principal, recolhidos em uma linha como "3 subagentes · 1 precisa de você · 2 trabalhando", ou "5 subagentes · 1 trabalhando" quando há subagentes do próprio programa entre eles. Clique na linha para expandi-los (a linha de um subagente de programa não tem menu ⋯); ela continua aberta enquanto você estiver em um deles. No celular, onde a barra lateral é uma gaveta, tocar na linha a expande sem fechar a gaveta.
- **No subagente**: uma barra acima da caixa de mensagem diz "Subagente de" e o título da sessão principal ("as respostas dele voltam para lá"), com **Abrir sessão principal**. A página de um subagente do Claude Code ou do Codex é somente leitura: ela mostra a tarefa que ele recebeu, as etapas e a resposta, ao vivo enquanto ele trabalha, com uma barra que diz "Subagente do Claude Code de" e o título da sessão principal no lugar de uma caixa de mensagem, com **Abrir sessão principal**, e sem **Retomar** nem menu da sessão. Enquanto um subagente do Claude Code trabalha, **Parar** no cabeçalho dele o interrompe, perguntando antes. Enviar uma mensagem a ele, retomá-lo, bifurcá-lo, transferi-lo ou excluí-lo é recusado: o programa dele o executa dentro da sessão da sessão principal, então converse com a sessão principal.

Um subagente do Hydor que precisa da sua aprovação ou de uma resposta espera por você como qualquer sessão e aparece na Caixa de entrada ([Caixa de entrada e notificações](/guide/inbox)).

### O que os subagentes do Hydor podem e não podem fazer

- **Um nível.** Um subagente do Hydor não pode iniciar subagentes do Hydor próprios: ele faz a parte dele sozinho e diz o que mais é necessário.
- **Nunca permissões mais livres.** Um subagente do Hydor nunca recebe permissões mais livres do que as da sessão que o iniciou. Quando ele executa outro entre Claude Code, Codex e Custom, recebe as permissões mais livres desse agente que não sejam mais livres do que as da sessão principal; os outros agentes (Gemini CLI e semelhantes) começam com o padrão deles.
- **Uma parte do limite.** Se a sessão principal tem um limite de gastos, cada novo subagente do Hydor recebe uma parte do que resta dele, e o limite da sessão principal cobre todos eles ([Limites para subagentes](/guide/research#caps-for-subagents)).
- **A mesma conta.** Um subagente do Hydor que executa o mesmo agente da sessão principal (Claude Code ou Codex) usa a conta dela.
- **Poucos de cada vez.** Apenas certo número de subagentes do Hydor de uma sessão trabalha ao mesmo tempo; o agente espera um terminar antes de iniciar outro.

### Definir quantos trabalham ao mesmo tempo

Em [Configurações → Recursos → Subagentes](/settings?s=children), defina **Trabalhando ao mesmo tempo, por sessão** com − e + (no grupo **Subagentes**; o (i) dele lista os limites que valem para os subagentes do Hydor) ([ir até lá](/settings?s=children&find=Working%20at%20once%2C%20per%20session)): de 1 a 12, com 4 de início. Ele conta os subagentes do Hydor de cada sessão separadamente, não os do app inteiro. Uma pesquisa profunda usa os próprios **Pesquisadores por vez**, e um enxame, o seu **Tamanho do enxame**.

## Pôr um enxame em um problema difícil

Um enxame coloca uma equipe de agentes em um único problema. Um agente líder divide o problema em ângulos de ataque realmente diferentes (métodos, premissas ou formas de enxergá-lo diferentes) e inicia um membro para cada um. Os membros publicam o que tentam e encontram em um painel compartilhado, leem as publicações uns dos outros e trocam mensagens entre si; o líder orienta, inicia mais membros conforme outros terminam e manda verificar a resposta antes de entregá-la a você.

Ele serve para problemas difíceis com muitos caminhos possíveis: uma demonstração, um bug teimoso, uma pergunta para a qual ninguém tem um caminho claro. Custa várias vezes o que um único agente custa.

### Começar um enxame

1. Na página inicial, abra **Opções** e escolha **Enxame**.
2. Escolha **Enxame** ("Até 5 agentes ao mesmo tempo, cada um com seu próprio ângulo"; o número é o tamanho do enxame).
3. Digite a tarefa e pressione **Início**.

A linha Enxame mostra "Ativada · 5 ao mesmo tempo", e o chip de Opções o indica. **Tamanho do enxame**, no fim desse menu, leva você à configuração correspondente. Assim como na pesquisa aprofundada, o modo não é mantido para a sua próxima sessão, e só um dos dois pode estar ativado. Um limite de gastos definido no mesmo menu Opções cobre o líder e todos os membros. O editor de uma tarefa agendada tem a mesma configuração **Enxame**, para um enxame a cada execução.

Na primeira vez que você escolher **Enxame** (ou **Campanha**), uma caixa de diálogo chamada "Antes de usar o Enxame" explica o que ele faz, para que vale a pena, para que não vale a pena e quanto custa. Pressione **Usar o Enxame** para continuar, ou **Cancelar** para deixá-lo desativado. Ela aparece uma vez para cada modo, para você, em todos os dispositivos, com as dicas ativadas ou não; pedir a um agente que mostre as dicas de novo também a traz de volta.

Você também pode ativar ou desativar um enxame, ou mudá-lo para uma campanha, dentro de uma sessão: abra o menu dela (⋯) → **Configurações da sessão** → **Enxame** (a dica dele mostra **Desativada**, **Ativada** ou **Campanha**) e escolha **Desativada**, **Enxame** ou **Campanha**. A mudança vale a partir da sua próxima mensagem: o agente da sessão (Claude Code ou Codex) reinicia com as novas instruções e ferramentas antes dessa mensagem, e a conversa continua. Ativar um enxame desativa uma pesquisa aprofundada, e vice-versa. A entrada não aparece em uma sessão confidencial, nem em uma sessão iniciada por outra sessão (um membro, um pesquisador, um subagente). O chip da caixa de mensagem ao lado do **+** (suas **Opções**) tem a mesma linha **Enxame**, abaixo de **Permissões**.

### Como um enxame funciona

1. O líder descobre o que a tarefa pede e como é uma resposta verificada, e escolhe até o tamanho do seu enxame em ângulos diferentes (para uma demonstração: um argumento direto, contradição, indução, casos pequenos e uma busca por computador, resultados conhecidos).
2. Ele inicia um membro por ângulo. Cada membro é um subagente do Hydor com uma descrição: o problema inteiro, seu ângulo, o que conta como concluído e como verificar, com o ângulo como título. Os membros usam o mesmo modelo e o mesmo esforço do líder, a menos que o líder escolha outros.
3. Os membros publicam no painel conforme avançam: **Progresso** (o que tentaram e onde estão), **Descoberta** (um resultado que os outros podem usar agora), **Pergunta** (algo que precisam que seja respondido) e **Nota**. Eles leem o painel a cada poucos passos, constroem a partir das descobertas uns dos outros, pulam o que alguém já descartou e respondem às perguntas feitas a eles.
4. O líder fica sabendo do painel em lotes: uma descoberta, uma pergunta ou uma mensagem para o líder chega a ele em cerca de um minuto; só progresso, a cada poucos minutos. Ele repassa as descobertas úteis, redireciona para um novo ângulo um membro que está travado ou repetindo outro, pede a um membro que verifique o resultado de outro e inicia membros para ideias que ninguém tentou conforme outros terminam.
5. Antes de concluir, o líder manda verificar a resposta de forma independente: por outro membro, por um cálculo ou por sua própria verificação cuidadosa.
6. Quando o problema é resolvido ou os ângulos se esgotam, ele para os membros que ainda estão trabalhando e entrega a resposta: o resultado, como foi encontrado e verificado, e quais ângulos falharam e por quê.

Um membro que termina seu ângulo envia seu relatório ao líder. Uma mensagem para um membro que não está trabalhando o acorda.

**Um enxame com um objetivo**: uma sessão que lidera um enxame pode ter um objetivo que o app verifica. Cada rodada passa a ser o trabalho do enxame inteiro, e o app, não o líder, decide quando está pronto. Veja [Um objetivo para um enxame](/guide/sessions#a-goal-for-a-swarm).

### Acompanhar: a barra e o painel

A sessão do líder tem uma barra acima da caixa de mensagem: **Enxame** · "escolhendo seus ângulos" no início, depois algo como "3 trabalhando · 2 concluídos · 14 publicações", e **Painel**. A sessão de cada membro também tem uma barra: "No enxame de" e o título do líder ("suas publicações e seu relatório vão para lá"), com **Painel** e **Líder**. Na barra lateral, os membros ficam sob o líder, reunidos em uma linha como "5 membros do enxame · 3 trabalhando".

**Painel** abre o painel do enxame (a partir da parte de baixo da tela em um celular):

- **Membros**: quantos estão trabalhando e quantos podem trabalhar ao mesmo tempo, depois cada membro com o que está fazendo agora, ou "Terminou sua vez", "Parado" ou "Parado com erro". Clique em um membro para abrir a sessão dele; **Abrir o líder** vai para o líder. Antes de o líder escolher seus ângulos, a lista diz que nenhum foi iniciado ainda.
- **Publicações**: tudo o que foi publicado, das mais recentes para as mais antigas. Cada publicação mostra quem a escreveu (Líder, ou o título do membro), para quem era quando foi para um único membro ou para o líder, seu tipo (Progresso, Descoberta, Pergunta, Nota) e há quanto tempo. Alterne entre **Todos**, **Descobertas** e **Perguntas**. As novas publicações aparecem conforme chegam.

### Parar membros

**Parar tudo** no painel (disponível enquanto há membros trabalhando) para todos os membros que ainda estão trabalhando. Os membros parados mantêm o que fizeram, e novas publicações não os acordam mais. O líder é avisado de que você os parou e ainda pode dar mais trabalho a algum deles. O próprio líder para os membros quando o problema é resolvido.

### Definir o tamanho do enxame

Em [Configurações → Recursos → Subagentes](/settings?s=children), **Tamanho do enxame** (no grupo **Enxame**; [ir para lá](/settings?s=children&find=Swarm%20size)) define quantos membros de um mesmo enxame ou campanha trabalham ao mesmo tempo: de 1 a 16, sendo 5 o padrão inicial. Cada membro custa cerca do mesmo que um agente; o líder inicia mais conforme outros terminam.

## Fazer uma grande mudança com uma campanha

Uma campanha é o outro tipo de enxame, para uma grande mudança em uma base de código em vez de um problema difícil: uma migração, uma atualização de framework, uma renomeação em todo lugar. Escolha-a no mesmo lugar, **Opções** → **Enxame** → **Campanha** ("Uma grande mudança em partes, cada uma em uma worktree"), em uma pasta que seja um repositório git. A linha Enxame passa então a mostrar "Campanha · 5 ao mesmo tempo". Em uma sessão que já está em andamento, o menu dela (⋯) → **Configurações da sessão** → **Enxame** → **Campanha** faz o mesmo a partir da sua próxima mensagem.

O líder divide a mudança em partes (pacotes, módulos, pastas) e as publica como seu plano. Um membro faz cada parte em um branch próprio em uma nova worktree, no máximo o tamanho do seu enxame ao mesmo tempo, executa suas verificações e publica a parte como concluída ou com falha; uma parte com falha ganha mais uma tentativa. O líder faz o merge das partes concluídas uma de cada vez, com as verificações executadas após cada uma (ou abre um pull request para cada uma, se você pediu isso), e relata o que mudou e o que falhou. A barra dele mostra "Campanha · 12 de 40 partes concluídas · 2 com falha", e o painel dele mostra as partes e como cada uma está, ao lado das publicações. Veja [Campanhas: uma grande mudança em muitas partes](/guide/engineering#campaigns-a-big-change-in-many-parts).

## Obter uma segunda opinião sobre uma vez

Uma segunda opinião faz um modelo de outra empresa verificar o que um agente fez em uma vez, em comparação com o que você pediu: os arquivos que ele alterou, os comandos que executou e sua resposta. O revisor procura o que está faltando (pedido mas não feito, ou declarado mas não feito), errado (bugs, fatos ou números errados, um pedido mal interpretado), arriscado (mudanças que podem quebrar algo, perder dados ou vazar segredos) e extra (mudanças que ninguém pediu e que atrapalham). Ele trata a resposta do agente como afirmações a verificar, não como evidência.

### Pedir uma

1. Abra o menu da sessão (⋯) e escolha **Segunda opinião**.
2. Em **Quem verifica**, escolha o revisor. O sugerido vem primeiro.
3. Em **Qual vez**, escolha a vez a verificar. A última vez concluída já vem escolhida; até 12 recentes são listadas, cada uma com a hora em que ocorreu e quantos arquivos alterou.
4. Pressione **Perguntar** (o botão traz o nome do revisor: **Perguntar ao Codex**, por exemplo).

Um cartão aparece logo abaixo dessa vez e é preenchido quando o revisor responde, em geral em um ou dois minutos. Uma vez que ainda está em execução não pode ser verificada até terminar. Em um celular, a caixa de diálogo abre a partir da parte de baixo da tela.

### Quem pode verificar o trabalho

Apenas um modelo de uma empresa diferente da do modelo que fez o trabalho, para que ninguém verifique o próprio trabalho:

- Uma sessão do **Claude Code**, ou qualquer sessão que use um modelo da Anthropic, pode ser verificada pelo **Codex** (por meio do programa Codex) ou por um dos modelos do Custom que não seja da Anthropic.
- Uma sessão do **Codex**, ou qualquer sessão que use um modelo da OpenAI, pode ser verificada pelo **Claude** (Sonnet, por meio do Claude Code) ou por um dos modelos do Custom que não seja da OpenAI.
- Qualquer outra sessão (Custom ou outro agente com o modelo de outro fabricante) pode ser verificada pelo Claude, pelo Codex ou por um dos modelos do Custom de um fabricante diferente do do modelo da sessão.

Os modelos do Custom são os que você adicionou em [Configurações → Modelos](/settings?s=models). O revisor apenas lê: o Claude e o Codex podem abrir arquivos na pasta da sessão para verificar algo específico, mas não alteram nada. Além da vez em si, o revisor vê a sua primeira mensagem na sessão e a sua mensagem anterior a essa vez, para contexto. Quando as mudanças são grandes demais para serem mostradas por inteiro, parte delas fica de fora, e o cartão avisa isso.

### O que o cartão mostra

O título do cartão traz **Segunda opinião** e o nome do revisor, depois:

- Enquanto trabalha: "Verificando o trabalho" e quanto tempo levou, com uma linha dizendo o que o revisor está lendo.
- Quando termina: as descobertas por gravidade ("1 crítica · 2 importantes"), **Parece bom** (com a contagem de pontos leves, se houver) ou **Sem veredito claro** quando a resposta não pôde ser lida como descobertas.
- Se falhou: **Sem resposta**, com o motivo (o programa do revisor não está instalado aqui, não deu resposta em 8 minutos, ou o app reiniciou nesse meio-tempo) e **Tentar de novo**.

Clique no título para abrir ou recolher o cartão. Dentro estão o resumo do revisor e suas descobertas, das piores para as menos graves. Cada descoberta tem:

- sua gravidade: **Crítico** (errado, quebrado ou inseguro como está), **Importante** (corrija antes de confiar no trabalho) ou **Leve** (vale uma olhada, pode deixar como está);
- um título curto, e o arquivo e a linha a que se refere (clique nele para abrir o arquivo ali);
- o que está errado, por que isso importa e como corrigir.

Quando há descobertas mais graves, as leves ficam recolhidas em **Mostrar N leves** (**Ocultar as menores** as recolhe de novo). O × dispensa o cartão.

### Enviar seus pontos ao agente

- O botão de enviar ao lado de uma descoberta (um avião de papel: **Enviar ao agente**) a coloca na caixa de mensagem, pronta para enviar ou editar.
- **Enviar todas ao agente** coloca todas as descobertas mostradas na caixa de mensagem de uma só vez.
- Enquanto o agente está trabalhando, **Enfileirar todas** (ou **Enfileirar**) as adiciona à fila da sessão, para irem ao agente quando a vez dele terminar.

A mensagem cita o revisor, lista cada ponto com sua gravidade e arquivo, e pede ao agente que confira cada um com o trabalho que fez, corrija o que se sustentar e diga quais deixa de lado e por quê.

## Comparar modelos na arena

A arena de modelos envia o mesmo prompt para dois ou três modelos ao mesmo tempo, para você comparar as respostas lado a lado e manter a melhor. Cada resposta que você mantém conta para uma avaliação que mostra quais modelos vencem nas suas próprias tarefas.

### Começar uma disputa

1. Na página inicial, escolha o agente e o modelo como de costume: esse é o primeiro modelo da disputa.
2. Abra **Opções** → **Arena** e escolha **Comparar modelos** ("O mesmo prompt para mais modelos, lado a lado").
3. Em "Além do modelo que você escolheu, pergunte também a (até 2)", marque mais um ou dois modelos. A lista oferece alguns modelos de cada um entre Claude Code, Codex e Custom, além dos outros agentes que você adicionou; quando ela é longa, um campo **Encontrar um modelo** ajuda a filtrar.
4. Digite o prompt e pressione **Início**.

A linha da Arena mostra "+1 modelo" ou "+2 modelos", e o chip de Opções a nomeia. Este navegador lembra suas últimas escolhas, mas a arena não fica ativada na sua próxima sessão.

Na primeira vez que você escolher **Comparar modelos**, uma caixa de diálogo chamada "Antes de usar a Arena" explica o que ela faz, para que vale a pena, para que não vale a pena e quanto custa; pressione **Usar a Arena** para continuar, ou **Cancelar**. Ela aparece uma só vez para você, em todos os dispositivos, com as dicas ativadas ou não. Ao contrário de uma pesquisa profunda ou de um enxame, a arena é uma escolha só da página inicial: ela envia sua primeira mensagem para os outros modelos, então não pode ser adicionada a uma sessão que já está em andamento.

Cada modelo trabalha em uma sessão própria, com o mesmo prompt, os mesmos anexos, a mesma pasta e as mesmas configurações da sessão (agente, memória, limite de gastos), e com o esforço e as permissões habituais do seu agente. Em um repositório git, ative **Novo worktree** no menu de pastas para que cada modelo receba a própria cópia do código, em vez de todos alterarem uma única pasta. Se um modelo não conseguir iniciar, o app avisa e a disputa continua sem ele.

### Comparar as respostas e manter a melhor

Cada sessão de uma disputa tem uma barra acima da caixa de mensagem: **Arena** · "o mesmo prompt foi para outros modelos", com **Comparar as respostas**. Isso abre a página de comparação: o prompt no topo e uma coluna por modelo com a resposta mais recente, preenchida conforme chega. As colunas ficam lado a lado em telas largas e uma embaixo da outra no celular.

- **Manter esta** (depois que o modelo responder) mantém a resposta dele. A sessão dele vence a disputa, e as outras sessões são arquivadas: saem da sua lista de sessões, mas continuam lá para abrir. As colunas passam a mostrar **Mantida** e **Arquivada**.
- **Abrir** leva à sessão de um modelo. Na sessão mantida, aparece **Continuar aqui**, para seguir a conversa com o vencedor.
- **Quais modelos vencem** (**Painel** no celular) abre Uso → Arena.

### Ver quais modelos vencem

[Uso → Arena](/arena) (na caixa de busca, Ctrl+K, aparece como "Arena de modelos") mostra **Quais modelos vencem nas suas tarefas**: cada modelo com sua **Avaliação**, quantas vezes foi **Mantida** entre as disputas de que participou e sua **Taxa de vitórias** (não exibida no celular). A avaliação é uma pontuação Elo, do tipo usado para classificar jogadores de xadrez, começando em 1.000: em cada disputa que você decidiu, a resposta que você manteve venceu cada uma das outras.

Abaixo, **Disputas** lista suas disputas mais recentes (até 100): o prompt, os modelos e quando ocorreu, marcadas com o vencedor, ou com **Abrir** em uma disputa que você ainda não decidiu. Clique em uma para comparar as respostas.

## Definir um limite de gastos em uma sessão

Um limite de gastos é o máximo que uma sessão pode gastar, a preços de API: o que os tokens dela custariam pela API, qualquer que seja o plano que você realmente paga. Quando a sessão chega a esse valor, o agente para até você aumentar o limite. É um bom complemento para tudo que executa muitos agentes: uma pesquisa profunda, um enxame, subagentes, uma disputa na arena.

### O que conta

- As chamadas de modelo da própria sessão, incluindo os subagentes do próprio agente (subagentes do Claude Code, por exemplo).
- Os subagentes do Hydor que ela iniciou: o limite dela cobre esses também.
- Modelos neste computador (por Ollama ou vLLM) não custam nada.
- Tokens sem preço conhecido não podem ser contados. A caixa de diálogo do limite avisa quando a sessão pode ter gasto mais por esse motivo.

Veja [Uso, limites e custos](/guide/usage) para saber quanto as sessões custam no total.

### Definir um limite ao começar

Na página inicial, abra **Opções** → **Limite de gastos**. Digite um valor em dólares e pressione **Definir** (ou Enter), ou escolha US$ 1,00, US$ 5,00, US$ 10,00 ou US$ 25,00. **Sem limite** remove o limite. O chip de Opções então mostra o limite ("limite de US$ 5,00").

Ao contrário de uma pesquisa profunda, de um enxame ou da arena, o limite que você escolhe permanece: suas próximas sessões começam com ele, em qualquer dispositivo, até você alterá-lo.

### Definir ou alterar o limite de uma sessão

Abra o menu da sessão (⋯) → **Configurações da sessão** → **Limite de gastos** (o limite atual aparece ao lado). A caixa de diálogo mostra **Gasto até agora**, dividido entre esta sessão e seus subagentes do Hydor, quando ela tem algum ("Esta sessão US$ 1,20, seus subagentes do Hydor US$ 0,80"; a caixa de diálogo acrescenta "Os subagentes que ela inicia também contam."), e, para um subagente do Hydor, quanto do limite da sessão principal já foi gasto. Digite um valor em **Limite** ou escolha US$ 1,00, US$ 5,00, US$ 10,00 ou US$ 25,00 e pressione **Definir o limite** (ou **Variação**). **Remover o limite** o retira.

Um limite pode ir de US$ 0,01 a US$ 100.000. Se ele não for maior do que a sessão já gastou, a caixa de diálogo avisa que a sessão continua parada. No celular, a caixa de diálogo abre a partir da parte de baixo da tela.

### A barra acima da caixa de mensagem

Enquanto uma sessão tem um limite, uma barra acima da caixa de mensagem mostra quanto já foi gasto dele ("US$ 1,20 de US$ 5,00"), com uma linha que vai se preenchendo: âmbar a partir de 80%, vermelha no limite, onde aparece **Limite atingido**. Quando subagentes do Hydor gastaram parte dele, aparece também "com subagentes" (em telas mais largas); aponte para os valores para ver a divisão. **Variação** (ou **Aumentar**, depois que o limite é atingido) abre a caixa de diálogo do limite.

### O que acontece no limite

O limite é verificado depois de cada chamada de modelo, então um turno para logo após a chamada que o atinge (o total pode terminar um pouco acima do limite):

- O agente para, e uma nota sob o turno diz "Parou no limite de gastos" com quanto foi gasto do limite, e **Aumentar o limite…**. Um aviso informa o nome da sessão que parou.
- Os subagentes do Hydor dela que estão em execução também param. A nota deles diz que a sessão que os iniciou atingiu o limite de gastos, com **Abrir** para ir até lá.
- Novas mensagens ficam esperando. Uma mensagem que você envia não é enviada: um aviso diz que o limite foi atingido, e seu texto volta para a caixa de mensagem. As mensagens na fila ficam retidas ("A fila está em espera") até você aumentar ou remover o limite.

### Aumentar ou remover o limite

Clique em **Aumentar** na barra ou em **Aumentar o limite…** na nota (ou use o menu da sessão), depois defina um limite acima do que a sessão gastou, ou remova-o. As mensagens retidas na fila então são enviadas. Um subagente do Hydor parado pelo limite da sessão principal volta a aceitar mensagens quando o limite da principal é aumentado.

### Limites para subagentes

Cada novo subagente do Hydor recebe um limite próprio: uma parte igual do que resta do limite da sessão principal, reservada para ela e para todos os subagentes do Hydor que podem trabalhar ao mesmo tempo. O limite da sessão principal ainda cobre todos eles, então, quando é atingido, todos param. Quando não resta nada dele, o agente não pode iniciar mais subagentes do Hydor e é orientado a terminar com o que tem.

### Limites em tarefas agendadas e apps

- **Tarefas agendadas**: o editor de uma tarefa ([Configurações → Tarefas agendadas](/settings?s=tasks), **Nova tarefa**, ou o menu de uma tarefa → **Editar**) tem o **Limite de gastos** da página inicial na sua linha de configurações, e **Para acima de US$** em **A cada execução** define o mesmo limite; deixe vazio para não ter limite. A sessão de cada execução para nele. Isso vale para execuções que iniciam uma nova sessão; uma execução que publica em uma sessão existente funciona dentro do limite próprio dessa sessão. Uma tarefa que um agente configura para você a partir de uma conversa inicia cada execução com as configurações dessa conversa, inclusive o limite. Veja [Tarefas agendadas](/guide/tasks).
- **Apps**: os **Limites** de um app incluem **Gasto máximo de uma execução (US$)**. Veja [Apps](/guide/apps).

## Peça a um agente

- "Comece uma pesquisa profunda sobre bombas de calor para uma casa dos anos 1930, com 6 pesquisadores por vez, um relatório em Word e um limite de US$ 10."
- "Em que ponto está a pesquisa profunda na minha sessão 'Comparativo de carregadores de carros elétricos'?"
- "Na minha sessão 'Comparativo de carregadores de carros elétricos', ative a pesquisa profunda com 6 pesquisadores e um relatório em Word, a partir da minha próxima mensagem."
- "Mude minha sessão 'Testes instáveis' para um enxame e volte para um só agente quando eu disser."
- "Defina um limite de gastos de US$ 5 nesta sessão e me diga quanto ela já gastou."
- "Deixe até 6 subagentes trabalharem ao mesmo tempo por sessão e coloque os enxames com 8 agentes."
- "Quais destes subagentes o Hydor iniciou e quais o Claude Code iniciou?"
- "Peça uma segunda opinião sobre o último turno da minha sessão 'Refatoração de cobrança' e me diga o que ela encontrou."
- "Quais modelos vencem na minha arena? Na disputa mais recente, mantenha a resposta do Claude Code."
