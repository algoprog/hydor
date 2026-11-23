# Sessões

Uma sessão é uma conversa com um agente, em uma pasta: você diz o que quer, o agente trabalha, e você acompanha, aprova o que ele quer fazer e o orienta. Este tópico reúne tudo sobre sessões: a página inicial e suas opções, o que você vê enquanto um agente trabalha, como enviar mensagens a ele no meio de uma resposta e tudo o que há no menu de uma sessão, de bifurcar e objetivos a worktrees e compartilhamento.

![Uma sessão em andamento: os passos e as respostas do agente, e um cartão pedindo para executar um comando](images/sessions.webp)

## Começar uma sessão

**Nova sessão** no alto da barra lateral abre a página inicial. Escreva o que você quer que seja feito na caixa de mensagem, confira a fileira de opções abaixo dela e pressione Enter (ou **Início**; no celular, a seta redonda). A página da sessão abre na hora, com a sua mensagem e o agente trabalhando nela (**Em andamento**). Se a sessão não conseguir começar, a página dela explica o motivo, e **Voltar à página inicial** devolve a sua mensagem (e o que você anexou) à caixa.

Se a conexão cair antes de o app responder (o celular entrou em repouso ou a rede mudou), a página mostra **Reconectando…** e, assim que puder, pergunta ao app o que aconteceu com a sua mensagem: a sessão abre se tiver começado, e uma sessão nunca começa duas vezes. Se o app continuar inacessível por cerca de um minuto, a página mostra **Não foi possível acessar o app**; **Tentar de novo** pergunta mais uma vez.

Pouco depois de a sessão começar, ela recebe um título: poucas palavras sobre o que você pediu (“Fim de semana em Lisboa”, “Corrigir os testes do checkout”), que o modelo auxiliar ([Configurações → Agentes → Modelos](/settings?s=models&find=Helper%20model)) escreve em segundo plano, sem que nada apareça na conversa. A barra lateral, o cabeçalho da sessão e a caixa de busca mostram o título (na barra lateral, as palavras dele entram uma após a outra no lugar das da sua mensagem), e o Claude Code e o Codex também o recebem, para as listas deles. Até ele chegar, e quando o modelo auxiliar não consegue responder, o começo da sua mensagem ocupa o lugar. Um título que você dá à sessão com **Renomear** nunca é substituído. A barra lateral lista a sessão desde o momento em que você a envia, no alto de **Ativas** (**Iniciando**).

A fileira abaixo da caixa de mensagem tem **Executa em**, **Modelo**, **Pasta** (ou **Projeto**), **Agente** e, no final, **Opções**. No celular, cada uma delas abre como uma folha na parte de baixo da tela.

### Escolher o agente e o modelo

**Executa em** lista todos os programas que você pode usar, lado a lado:

- **Claude Code**: o agente da Anthropic, com um plano Claude ou uma chave de API.
- **Codex**: o agente da OpenAI, com um plano ChatGPT ou uma chave de API.
- **Custom**: o agente próprio do app, para qualquer modelo: do OpenRouter, do Ollama ou do vLLM. Veja [Custom, o agente próprio do app](/guide/custom).
- Qualquer outro agente que você tenha adicionado e que fale ACP (Gemini CLI, OpenCode, Qwen Code, Goose…), com o comando dele abaixo do nome.

Na parte de baixo, **Modelos do Custom** abre [Configurações → Modelos](/settings?s=models) e **Adicionar ou gerenciar agentes** abre [Configurações → Mais agentes](/settings?s=agents). Veja [Agentes, contas e modelos](/guide/agents-models).

**Modelo** abre em **Automático**: a sessão começa no modelo do nível Melhor, o agente principal passa partes bem definidas a subagentes de níveis mais baratos, e ele pode passar para o modelo do nível Máximo quando um problema se mostra difícil demais (veja [Níveis: um modelo para cada tipo de trabalho](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Abaixo dele, o menu lista apenas os modelos do agente escolhido. O modelo padrão do agente é marcado com “padrão”. Versões mais antigas de um modelo ficam atrás de “2 modelos mais antigos”; uma lista longa tem um campo **Buscar modelos** (Enter escolhe o primeiro resultado). O Custom lista os modelos que você adicionou em Configurações → Modelos; outro agente ACP lista os modelos que ofereceu na última vez em que foi executado, e o botão só aparece depois que ele foi executado.

### Escolher uma pasta, um projeto ou uma nova pasta de tarefa

O botão **Pasta** diz onde o agente trabalha. O menu dele (“Projeto ou pasta para trabalhar”) tem um campo, **Procure um projeto ou pasta, ou digite um caminho**, sobre duas listas curtas, cada linha com o lugar onde fica:

- **Projetos**: seus projetos pelo nome, os cinco usados mais recentemente (e o escolhido), cada um com a sua pasta. Escolher um define a pasta como a do próprio projeto, o agente dele e as diretrizes dele para a sessão; o botão passa então a mostrar **Projeto** e o nome do projeto. Um grupo de projetos funciona do mesmo jeito, com todos os seus projetos. **Nova**, no fim do título, cria um projeto (sessões, arquivos e memória juntos) e o escolhe. Veja [Projetos e conhecimento](/guide/projects) e [Diretrizes dos agentes](/guide/guidelines).
- **Pastas**: a pasta em uso e as três últimas pastas que você escolheu, cada uma com a pasta em que fica. **Procurar**, no fim do título, lista as pastas da sua pasta pessoal.
- **Nova pasta de tarefa** (“uma nova em ~/Hydor”): uma pasta nova para esta tarefa, nomeada pelo dia e por algumas palavras da sua mensagem (como `2026-11-01-plan-trip-lisbon`), em `~/Hydor`, a menos que você defina outro lugar em [Pastas de tarefa](/settings?s=assistants&find=Task%20folders) (Configurações → Recursos → Seus agentes).

A pasta de um projeto é o próprio projeto: o menu a lista apenas como projeto, e uma sessão iniciada nela trabalha no projeto, mesmo que, na página inicial, você tenha escolhido a pasta em vez do projeto.

O menu abre acima ou abaixo do botão, onde houver mais espaço, e cabe sem rolagem: em uma janela pequena, mostra menos pastas, depois menos projetos, e uma linha como “mais 2” abaixo dos projetos traz de volta o restante.

Digite no campo para encontrar mais:

- Um nome encontra projetos correspondentes e pastas entre as que você usou há pouco, na pasta em uso e na sua pasta pessoal. A pasta de um projeto, encontrada pelo nome, aparece como o projeto.
- Um caminho (`~/code/`, ou `code/` a partir da sua pasta pessoal) lista as pastas que há ali, como **Procurar** faz. A seta no fim do campo sobe uma pasta; o X, ou Esc, volta às listas.
- ↑ ↓ e Enter escolhem. Tab, ou a seta no fim de uma linha, lista as pastas dentro dela.

Quando a pasta está em um repositório git (e você não escolheu uma nova pasta de tarefa), o menu termina com uma chave: **Novo worktree a partir de main** (ou do branch que estiver ativo), “Um novo branch, em uma cópia do” repositório. Com ela ativada, a sessão trabalha em uma cópia própria, em um novo branch; o botão mostra “· novo worktree”. Veja [Trabalhar em um worktree](#work-in-a-worktree).

Se uma sessão ganha uma nova pasta de tarefa por padrão depende do agente: a maioria começa em uma, a menos que você escolha uma pasta; o Programador trabalha na pasta que você escolher, e um agente de um projeto trabalha nesse projeto.

### Escolher um agente

**Agente** define como quem a sessão trabalha: **Geral** (até você escolher outro; em um projeto que tem um agente próprio, esse agente), **Pesquisador**, **Redator**, **Programador**, **Tutor**, **Planejador**, **Analista**, **Criador de apps**, ou um dos **Seus** (os que funcionam em qualquer lugar e os do projeto escolhido). Aponte para um para ler o que ele faz e qual programa e modelo usa. Escolher um também pode definir o programa, o modelo e as permissões que ele sugere (o modelo do nível dele, quando ele pensa com um) e ativar os apps conectados dele. **Criar ou alterar agentes** abre a [página Agentes](/agents). Veja [Agentes](/guide/agents).

### Opções: esforço, permissões e mais

**Opções** reúne o restante. O botão mostra “Opções” ou nomeia o que você definiu fora do usual, como “Esforço alto · Planejar · limite de US$ 5,00”. No computador, o menu termina com um lembrete: Shift+Tab na caixa de mensagem alterna as permissões.

- **Esforço**: o quanto o modelo pensa. **Padrão** usa o do próprio modelo, depois vêm os níveis que o modelo oferece: **Baixo** (raciocínio rápido e leve), **Médio** (equilibrado), **Alto** (raciocínio mais profundo), **Xhigh** (raciocínio extraprofundo), **Máximo** (raciocínio máximo) e, em alguns modelos, **Minimalista**, **Nenhum** ou **Ultra**. O Custom o oferece só para o modelo de um endpoint que raciocina (Baixo, Médio e Alto); outros agentes ACP o oferecem quando listam níveis, e modelos sem níveis não o têm.
- **Permissões**: o que o agente pode fazer sem perguntar a você antes. Cada agente tem os seus modos; veja [O que significa cada modo de permissão](#what-each-permissions-mode-means). Shift+Tab na caixa de mensagem passa para o próximo.
- **Conta**: só depois que você adicionar outra conta para o Claude Code ou o Codex em [Configurações → Agentes → Contas](/settings?s=accounts&find=Accounts). **Seu login** é a conta do próprio agente; escolha outra para executar esta sessão com ela. **Gerenciar contas** abre as Configurações.
- **Confidencial**, uma chave com um cadeado (“Apenas modelos neste computador. Nada sai dele.”): para um artigo que você está revisando, dados de pacientes ou o código de um cliente. **Executa em** passa a ser **Custom** e **Modelo** passa a ser o melhor modelo instalado aqui. Veja [Manter uma sessão confidencial](#keep-a-session-confidential).
- **Memória**: só enquanto a memória estiver ativada nas Configurações. **Ativada** usa e acrescenta o que os agentes lembram; **Desativada nesta sessão** começa do zero e não guarda nada dela. Veja [Memória](/guide/memory).
- **Limite de gastos**: o máximo que esta sessão pode gastar, a preços de API. Digite um valor e pressione **Definir**, ou escolha US$ 1, US$ 5, US$ 10 ou US$ 25; **Sem limite** o remove. A sessão para no limite até você aumentá-lo. Veja [Uso, limites e custos](/guide/usage).
- **Enxame**: **Desativada**; **Enxame**: um agente líder divide a tarefa em frentes de ataque e inicia um integrante para cada uma, com tantos trabalhando ao mesmo tempo quanto o **Tamanho do enxame** permitir ([Configurações → Recursos → Subagentes](/settings?s=children&find=Swarm%20size)). Os integrantes compartilham o que encontram em um painel e trocam mensagens entre si. Para problemas difíceis; custa várias vezes o que um agente custa. Ou **Campanha** (“Uma grande mudança em partes, cada uma em um worktree”): o líder divide uma grande mudança em partes, os integrantes fazem cada um uma parte em um branch próprio, com os testes dela, e o líder as junta; a pasta precisa ser um repositório git (veja [Campanhas](/guide/engineering#campaigns-a-big-change-in-many-parts)).
- **Pesquisa**: **Desativada**, ou **Pesquisa aprofundada**: o agente planeja as buscas, envia pesquisadores atrás de cada parte, confere as afirmações principais em duas fontes e entrega um relatório com citações. Defina **Pesquisadores por vez** (1 a 8), **Rodadas** (1 a 5), **Buscas no total** (10 a 500) e **O relatório** (**Página** ou **Word**).
- **Objetivo**: **Desativada** (“O agente trabalha até achar que terminou”), ou **Até terminar** (o botão Opções passa então a mostrar “Modo objetivo”) (“Ele trabalha rodada após rodada até que as verificações combinadas com você se cumpram”): a sua primeira mensagem é o objetivo, o agente primeiro descobre como verificá-lo e mostra a você, e nada começa antes de você concordar. Em **Quanto ele pergunta a você**, escolha com que frequência ele pergunta qual caminho seguir. Funciona com qualquer agente, custa muitas interações e para nos limites que você combinar (rodadas, dinheiro, tempo). Veja [Objetivos](/guide/goals).
- **Arena**: **Desativada**, ou **Comparar modelos**: a mesma mensagem também vai para um ou dois outros modelos que você marcar (um campo **Encontrar um modelo** ajuda em uma lista longa), cada um em uma sessão própria, na mesma pasta. Você compara as respostas e fica com a melhor; as outras são arquivadas. Em um repositório git, ative **Novo worktree** no menu de pastas para que cada modelo trabalhe em uma cópia própria.

O enxame (ou uma campanha) e a pesquisa aprofundada comandam subagentes do Hydor, então ativar um desativa o outro. O **objetivo** combina com um enxame (o líder dele tem o objetivo: [Um objetivo para um enxame](/guide/goals#a-goal-for-a-swarm)), mas não com uma campanha, a pesquisa aprofundada nem a arena: ativar o **objetivo** desativa essas, ativar uma delas desativa o objetivo, e uma sessão que lidera uma delas não pode ter um objetivo (o menu dela não tem **Definir um objetivo**). **Confidencial** desativa o enxame, a pesquisa aprofundada e a arena, e ativar um deles desativa Confidencial (um objetivo pode ser executado em uma sessão confidencial). O enxame, a pesquisa aprofundada, a arena e um objetivo não são mantidos para a próxima sessão, porque custam mais; os números da pesquisa e os modelos da arena que você escolheu ficam guardados neste navegador para quando você os ativar de novo. Veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research).

### O que significa cada modo de permissão

**Claude Code**

| Modo | O que o agente pode fazer |
| --- | --- |
| Perguntar (o padrão) | Pergunta antes de edições e comandos que não são permitidos nas configurações dele |
| Aceitar edições | Edita arquivos livremente, pergunta antes de outros comandos |
| Automático | Uma verificação de segurança aprova ações de rotina e pergunta a você sobre as arriscadas |
| Planejar | Só lê e planeja, depois propõe um plano para você aprovar |
| Bypass | Nunca pergunta (acesso total) |

**Codex**

| Modo | O que o agente pode fazer |
| --- | --- |
| Planejar | Conversa e planeja primeiro; pode fazer perguntas de esclarecimento a você |
| Somente leitura | Lê arquivos e responde; pergunta antes de alterar qualquer coisa |
| Automático (o padrão) | Edita arquivos e executa comandos na pasta dele; pergunta para ir além dela |
| Revisão automática | Como o Automático, mas um agente revisor responde aos pedidos de aprovação dele |
| Acesso total | Sem sandbox e sem aprovações |

Dentro do Docker, o sandbox do próprio Codex não consegue iniciar, então **Acesso total** é o padrão ali e o menu explica o motivo.

**Custom**

| Modo | O que o agente pode fazer |
| --- | --- |
| Perguntar (o padrão) | Pergunta antes de editar arquivos e antes de executar comandos; olhar ao redor é livre |
| Aceitar edições | Edita arquivos na pasta livremente, pergunta antes de executar comandos |
| Automático | Passos de rotina seguem em frente; uma verificação rápida pergunta a você sobre os arriscados |
| Acesso total | Executa ferramentas e comandos sem pedidos de aprovação nem o sandbox de comandos, com as permissões da conta do seu computador |
| Planejar | Só lê e planeja: sem edições, sem comandos |

Fora do Acesso total, o Custom pergunta a você antes de comandos arriscados. Em Perguntar, Aceitar edições e Planejar, ele também pergunta antes de ler ou alterar arquivos fora da pasta, ou arquivos que contêm chaves ou senhas; no Automático, a verificação rápida os avalia primeiro. Veja [Custom, o agente próprio do app](/guide/custom).

**Outros agentes ACP** oferecem os próprios modos, listados depois que o agente foi executado.

### Manter uma sessão confidencial

Alguns trabalhos não podem sair do seu computador: um artigo que lhe enviaram para revisar (a maioria das conferências e revistas proíbe entregar uma submissão a uma IA online), registros de pacientes ou de clientes, ou o código de uma empresa em que você trabalha sob contrato. Uma sessão confidencial é executada em um modelo neste computador, e nada dela é enviado a lugar nenhum.

1. Na página inicial, abra **Opções** e ative **Confidencial** (“Apenas modelos neste computador. Nada sai dele.”). O botão passa então a mostrar “Confidencial”.
2. **Executa em** passa a ser **Custom** e **Modelo** passa a ser o melhor modelo instalado aqui; enquanto ela estiver ativada, os menus oferecem apenas esses. Se ainda não houver nenhum, o menu avisa: [Configurações → Agentes → Modelos](/settings?s=models) instala com um clique os sugeridos para este computador.
3. Escreva o que você quer, anexe o artigo ou escolha a pasta dele e pressione Enter. Por exemplo: “Revise a submissão anexada como revisor do NeurIPS: resumo, pontos fortes, pontos fracos, perguntas para os autores e uma nota.”

Modelos neste computador são os do Ollama e do vLLM daqui, e endereços cujo destino é este computador ou a sua rede privada: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` a `172.31.…`, ou um nome terminado em `.local` (veja [Conectar o Ollama, o vLLM ou outro endpoint](/guide/agents-models#connect-ollama-vllm-or-another-endpoint)). Os modelos na nuvem do Ollama, cujos nomes terminam em “cloud”, são executados em ollama.com e não contam. A página inicial mantém a chave ativada nas próximas sessões até você desativá-la.

Uma sessão confidencial tem um cadeado ao lado do título, no cabeçalho e na barra lateral, e a caixa de mensagem dela tem uma borda verde discreta; uma linha acima da caixa explica o que isso significa até você fechá-la. Clique no cadeado para ver o que está ativado e o que não está.

- **Desativado**: busca na web e páginas da web, o navegador e a sua tela, apps conectados e as suas chaves, apps, publicação, tarefas agendadas, criar, encontrar ou editar imagens, desenhos, gráficos, vídeos ou sons, modelos em outros lugares (pesquisa aprofundada, enxame e arena; uma [segunda opinião](/guide/research) vem apenas de um modelo de outro fabricante neste computador), passar a conversa a outro agente, salvar qualquer coisa na memória e exportar uma página como arquivo (exporte você mesmo a partir da página).
- **Comandos sem rede**: os comandos do agente são executados sem acesso à rede, em todos os modos de permissão, de modo que nada pode ser baixado, instalado pela internet, enviado por push ou transmitido. Onde isso não for possível (Windows, alguns contêineres), cada comando pergunta a você antes, seja qual for o modo, e a nota do cadeado avisa.
- **Continua ativado**: os arquivos da pasta, documentos (lidos neste computador), as páginas, imagens e arquivos que você guardou, o conhecimento compartilhado, as suas notas de memória e o seu perfil (lidos, nunca acrescentados), os subagentes do Hydor, que também são confidenciais, e as UIs de resposta (sem imagens nem mapas da web).
- **Nada enviado para fora sobre ela**: o título vem do modelo auxiliar quando ele é executado neste computador, ou então das primeiras palavras da sua mensagem; as notificações dizem apenas “Uma sessão confidencial” e se ela terminou, precisa de você ou falhou; não há link somente de leitura, nem pull request a partir do menu dela, nem automação ou app criado a partir dela; agentes de outras sessões e agentes em outros lugares não podem lê-la; as respostas dela não mostram imagens da web, e as páginas que ela mostra não carregam nada de lugar nenhum (então um gráfico que precisa de uma biblioteca da web não será desenhado); o ditado funciona apenas com reconhecimento de voz neste computador ([Configurações → Recursos → Voz](/settings?s=voice)), e as respostas só são lidas em voz alta com uma voz do seu dispositivo.
- **Continua confidencial**: bifurcações e **Editar a partir daqui** também são confidenciais, e ela não pode ser desativada, para que o que foi dito fique onde está. Para um trabalho que pode sair do computador, comece uma nova sessão.

O que ela não pode prometer: o Hydor verifica onde fica o servidor de um modelo, não o que esse servidor faz, então um endpoint que você configurou na sua rede e que repassa pedidos a um serviço online é online do mesmo jeito. O que você copia da sessão, ou abre ou envia você mesmo de outro lugar (um link em uma resposta, uma página que ela criou aberta a partir dos arquivos do projeto, um push da página do Git), fica por sua conta vigiar, e o mesmo vale para o que você lê dela em outro dispositivo: as páginas do app chegam até ele como sempre (pelo seu túnel, se você usa um).

### Anexar arquivos, apontar arquivos, usar comandos

- **Anexar arquivos** (o **+** à esquerda da última fileira da caixa), solte arquivos sobre a caixa de mensagem ou cole imagens e arquivos nela. Uma mensagem leva até 25 MB de arquivos. As imagens (PNG, JPEG, GIF, WebP) vão ao modelo como imagens, até 8 por mensagem; os outros arquivos (até 20) são salvos neste computador e listados no fim da sua mensagem, para que o agente os abra. Remova um com o × dele antes de enviar. Os arquivos que você anexou esperam na caixa até você enviá-los, mesmo que você vá para outra página (recarregar a página os limpa).
- **Anexar uma captura de tela** (no mesmo menu **+**, em computadores; onde o navegador não consegue fazer uma, o **+** é um clipe que anexa arquivos): o navegador pergunta qual tela, janela ou aba, e uma imagem dela é anexada.
- **@**: digite @ e parte do nome de um arquivo para listar os arquivos correspondentes na pasta; ↑ ↓ para mover, Enter ou Tab para inseri-lo, Esc para fechar.
- **/**: bem no início da mensagem, / lista os comandos e as habilidades do agente (as do Claude Code), com o que cada um faz.
- O microfone (ditar a mensagem) e os fones de ouvido (modo de voz Mãos livres) ficam ao lado do botão de enviar quando o navegador ou este computador consegue reconhecer fala. Veja [Documentos, imagens, vídeos e voz](/guide/documents-voice).

### O que a página inicial lembra

A página inicial guarda as suas escolhas para cada lugar em que você trabalha: cada projeto, cada pasta e **Nova pasta de tarefa**, em todos os dispositivos. Um lugar guarda o seu **Executa em** (o programa), o **Modelo** de cada programa e, em **Opções**, o **Esforço** e as **Permissões**, o **Agente**, a **Memória**, o **Limite de gastos**, **Confidencial** e a chave **Novo worktree**. A conta (**Opções → Conta**) não é guardada por lugar: continua sendo a que você escolheu, em todos os lugares. Escolher um programa em um lugar traz de volta o que você usou por último com ele ali.

Um lugar guarda as suas escolhas depois que você muda uma delas ali ou começa uma sessão ali; apenas olhar para um lugar não guarda nada. Escolha um lugar no botão **Pasta** (um projeto, uma pasta ou **Nova pasta de tarefa**) e a caixa abre com as escolhas desse lugar, enquanto o que você escreveu e anexou continua nela. Começar a partir de um projeto (**Nova sessão** no cartão ou na página dele, ou o projeto na barra lateral) abre a página inicial com as escolhas desse projeto, e **Nova sessão nesta pasta** em uma pasta (em Arquivos ou na barra lateral) a abre com as escolhas dessa pasta. A página abre no último lugar que você escolheu.

Um lugar em que você ainda não escolheu nem começou nada abre com os padrões: o agente é **Geral**, ou o agente do próprio projeto quando o projeto tem um (e o que esse agente sugere vale, como quando você o escolhe: o programa, o modelo do nível dele e as permissões dele); o **Modelo** é **Automático** onde for oferecido, ou então o padrão do programa; **Esforço** e **Permissões** são os usuais do programa; a memória está ativada; não há limite de gastos; **Confidencial** e **Novo worktree** estão desativados. **Executa em** continua sendo o programa que você usou por último. O lugar que você tinha escolhido por último antes de isso ser adicionado mantém as escolhas que você tinha.

Um link para a página inicial pode preenchê-la, por exemplo `/?prompt=Summarize%20my%20notes&agent=codex`; podem ser acrescentados `model=`, `cwd=` (o caminho de uma pasta), `assistant=` (o id de um agente, como `app-builder`, que também escolhe o programa, o modelo e as permissões que ele sugere, a menos que o link nomeie um programa ou um modelo) e `confidential=1` (Confidencial ativado). Ele apenas preenche a caixa e as escolhas; nunca começa nada por conta própria. Caracteres invisíveis são removidos de uma mensagem vinda de um link, com um aviso.

O que você escreve na caixa fica esperando ali enquanto você vai para outras páginas: a mensagem, os arquivos que você anexa, as opções só desta tarefa (**Enxame**, **Pesquisa aprofundada**, **Arena**, **Diretrizes** desta sessão) e a pasta em que um link ou **Nova sessão de agente aqui** a abriu. A caixa se esvazia quando a sessão começa: enquanto o agente se prepara, a seta de **Início** continua subindo; depois a página inicial vira a sessão, com a caixa descendo para o lugar dela na parte de baixo e o que você escreveu subindo como a sua primeira mensagem. A mensagem e essas opções ficam guardadas neste navegador, então continuam lá depois de um recarregamento; os arquivos anexados, não.

## Acompanhar o trabalho em uma sessão

### O cabeçalho

No topo de uma sessão:

- o ícone do agente e o título (clique duas vezes nele para renomear), e um cadeado para uma [sessão confidencial](#keep-a-session-confidential);
- um status: **Em andamento**, **Precisa de você**, **Pronto**, **Iniciando**, **Criando memória**, **Parando**, ou “Open in VS Code” para uma sessão em execução em outro lugar; quando o agente deixa de estar em execução, mostra como o trabalho terminou: **Concluído** quando o último turno terminou (com “· 2 arquivos criados” ou “· 3 arquivos alterados” quando criou ou alterou arquivos), **Interrompida** quando você a interrompeu ou ela foi cortada antes de terminar, **Falhou** quando terminou com um erro. Aponte para o status para ver o que fazer em seguida;
- a pasta (clique nela para explorá-la em Arquivos), um selo de pull request, a conta quando a sessão roda como uma conta adicionada e, em telas mais largas, o branch do git e o modelo;
- um botão para o que você pode fazer agora: **Parar** enquanto um turno está em execução, **Retomar** quando o agente não está em execução (depois de **Interrompida** ou **Falhou**; mais discreto depois de **Concluído**, já que uma mensagem na caixa continua a sessão de qualquer forma), ou **Continuar aqui** para uma sessão do Claude Code aberta no VS Code ou em um terminal;
- **Detalhes** (mostrando as linhas adicionadas e removidas quando há arquivos alterados), que abre [o painel de detalhes](#the-details-panel-changes-commands-and-info);
- o menu da sessão (⋯): veja [Tudo o que há no menu da sessão](#everything-in-the-sessions-menu).

### Turnos, passos e respostas

A conversa se lê como um chat. Cada turno é a sua mensagem, o trabalho do agente e a resposta com que ele terminou:

- **Sua mensagem** aparece à direita, com as imagens e os arquivos anexados, assim que você a envia, antes mesmo de o agente recebê-la: o agente aparece trabalhando logo abaixo, e a caixa de mensagem fica livre para a próxima. Se ela não for enviada (sem conexão, limite de gastos atingido), ela sai da conversa e volta para a caixa de mensagem, com um aviso explicando o motivo. Uma mensagem longa fica recolhida nas primeiras linhas; **Mostrar mais** a abre.
- **O trabalho** fica sob uma linha que o resume: “Worked for 2m 10s · 3 commands”, “Thought”, “Stopped after 40s” ou “Failed after 5s”, com o que o turno custou à direita (“≈ $0,12”): clique nela para ver o [tempo e custo](/guide/sessions#a-turns-time-and-cost) do turno. Em um plano (Claude Code, Codex), esse valor é quanto os tokens custariam nos preços da API, não o que você paga; se o preço do modelo não for conhecido, os tokens aparecem no lugar. Enquanto o turno está em execução, a linha diz “Working · 1m 2s” (ou “Waiting for you”) e o resumo do trabalho cresce conforme as coisas acontecem; depois de turnos anteriores, ela acrescenta há quanto tempo a sessão trabalha no total, somando todos os turnos: “Working · 1m 2s (47m)”. Um turno concluído recolhe o trabalho; clique na linha para abri-lo.
- **O resumo do trabalho**: cada nota curta que o agente escreve entre os passos (o que encontrou, o que fará em seguida) inicia uma parte, e os passos dados depois entram nela. Uma parte concluída é uma linha com um visto: a nota em poucas palavras (“Run the checkout tests first to see what fails”, “Apply the discount first and round once”), quantos passos levou e as linhas que alterou. Clique nela para ver a nota inteira e cada passo. A parte em andamento mostra a nota do agente por completo e, abaixo dela, o passo que está sendo dado agora, como “Editing total.ts · 4 s”; clique nessa linha para ver os passos da parte até o momento. Os passos dados antes da primeira nota do agente formam uma parte com o nome do que fizeram (“Ran 3 commands, read 2 files”). Um turno longo mostra suas partes mais recentes; “Show 12 earlier parts” mostra o restante.
- Os **Passos** têm nomes em linguagem simples: “Run the tests”, “Read index.ts”, “Searched the web”, com o próprio comando em letra mais discreta. Clique em um para ver o que ele fez. O Claude Code executa por conta própria um comando, ou outro passo que altera coisas; os passos do próprio Hydor que o agente pediu depois dele, na mesma mensagem (buscas na web, leituras de páginas…), esperam até que ele termine. Um passo assim mostra **Aguardando** no lugar do relógio, discretamente, até realmente começar; então o relógio conta a partir desse momento, e um passo concluído mostra o tempo que de fato levou. A linha do resumo para o passo em andamento nomeia o passo que está realmente sendo executado.
- Os **Pensamentos** aparecem como “Thought for 12s” com o primeiro título; clique para lê-los.
- **A resposta** é o que o agente escreveu depois do último passo. As páginas que o agente mostrou ficam junto dela. Enquanto o agente trabalha, uma nota curta escrita depois do último passo aparece no resumo, como a parte em andamento; se o turno terminar ali, ela se torna a resposta.
- **Respostas entre passos**: o que o agente escreve entre os passos e que se lê como uma resposta (a resposta a uma mensagem que você enviou enquanto ele trabalhava, ou o que ele encontrou antes de seguir em frente, em vários parágrafos, uma lista ou uma tabela) também aparece como resposta, no seu lugar, sem ficar recolhida dentro do trabalho. O trabalho antes e depois dela fica sob uma linha própria, como “Worked for 20s · 2 commands”.
- **Arquivos alterados**: sob a resposta, um cartão lista cada arquivo que o turno alterou, com as linhas adicionadas e removidas. Clique em um arquivo para ver o diff; **Abrir arquivo** o abre. Mais de cinco ficam recolhidos em “Show 3 more files”.
- **Documentos criados**: sob a resposta, os documentos que o agente criou ou alterou no turno (PDF, Word, Excel, PowerPoint, LaTeX, notebooks, Markdown e mais) aparecem como cartões marcados como **Nova** ou **Atualizado**, tenha ele entregado ou não, e os nomes de arquivos e caminhos na resposta são links que abrem o arquivo em uma janela sobre a conversa ([Documentos que ele criou ou alterou](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply)). Em uma tela larga, quando o turno criou ou alterou só um, ele também abre ao lado da conversa.
- **Commits**: quando o agente fez commits no turno, um selo sob a resposta avisa: **Commit feito** · o título do commit, ou “3 commits” com os branches, e as linhas adicionadas e removidas. Clique nele (com vários, depois em um commit) para ler a mensagem completa, quem o fez e quando, seu hash (clique para copiar) e todos os arquivos que ele alterou, com o diff de cada um. **Abrir no Git** o abre no repositório da sessão na [página Git](/git). Um commit que o agente corrigiu ou removeu com rebase no mesmo turno fica de fora.

O agente também pode manter uma lista de verificação (**Planejar** ou **Afazeres**, com quantos itens estão concluídos), que vai sendo marcada conforme ele trabalha. As notas do app acompanham o turno a que se referem: o que a memória guardou, uma segunda opinião, um limite de gastos atingido, o cartão dos subagentes que um turno iniciou. As mensagens de outras sessões aparecem como “From …”, a resposta de um subagente (do Hydor, do Claude Code ou do Codex) como “Reply from …” (clique para ler a resposta), e a execução de uma tarefa agendada começa com uma linha com o nome da tarefa.

Linhas de dia (“Yesterday”, “Today”) separam os dias; uma conversa toda de hoje não tem nenhuma. As mensagens mais antigas são carregadas conforme você rola para cima, ou com **Mostrar mensagens anteriores**. As mensagens e respostas novas entram no fim da conversa, sem deixar espaço vazio abaixo delas. Quando uma resposta fica longa o bastante para preencher a tela, a visualização para na primeira linha e fica ali enquanto ela cresce, para que você leia uma resposta longa desde o começo; uma resposta curta simplesmente fica sob o que veio antes. Se você rolar para cima enquanto o agente trabalha, a visualização fica onde você está; **Mais recente** leva você de volta ao fim, e também aparece quando uma resposta continua abaixo da tela.

Sob cada resposta concluída estão **Copiar mensagem**, **Bifurcar a partir desta resposta** e **Ler em voz alta**. **Bifurcar a partir desta resposta** funciona em qualquer resposta do Claude Code e na última resposta de um turno concluído no Codex e no Custom, já que estes bifurcam um turno inteiro. Sob a última resposta de um turno em que o agente usou uma ferramenta ou mostrou um cartão, **Fazer isto de novo…** (as setas circulares) faz esse trabalho outra vez sem que você precise pedir de novo: **Transformar em app** cria o rascunho de um app a partir do turno, com suas correções feitas ao longo do caminho mantidas na tarefa dele e seus cartões como resposta ([A partir de uma sessão que deu certo](/guide/apps#make-your-own-app)), e **Executar a cada…** abre uma nova [tarefa agendada](/guide/tasks) com o que você pediu. Não está disponível em uma sessão confidencial. Sob cada mensagem sua, **Copiar mensagem**, **Editar a partir daqui** e a hora em que foi enviada são sempre exibidos, não só quando você passa o mouse.

### Tempo e custo de um turno

O custo à direita da linha de um turno concluído (“≈ $0,12”, ou os tokens quando o preço do modelo não é conhecido) abre **Tempo e custo**, para você ver por que um turno demorou ou custou muito:

- **Duração**: uma barra com o destino do tempo do turno, cada parte com sua fatia e duração: **O modelo** (ler o que recebeu, pensar e escrever), **Comandos**, **Leitura e edição de arquivos**, **A web**, **Outras etapas** (subagentes, ferramentas de apps conectados), **Aguardando você** (aprovações, perguntas e formulários, desde que cada cartão apareceu até você responder) e **O restante** (início e intervalos entre passos). Passos executados em paralelo contam uma só vez. Abaixo, “First reply or step after 3 s”: quão rápido o agente começou.
- **Tokens**: **Lido do zero**; **Gravado no cache** (lido do zero e guardado pelo provedor do modelo, para que o próximo pedido o leia por menos); **Lido do cache**, com sua parcela de tudo o que foi lido; e **Gerado** (respostas, pensamentos e passos).
- **Custo**: o custo do turno e, quando o preço do modelo é conhecido, o de cada tipo, com “The cache saved about $0.80.”. Em um plano (Claude Code e Codex, a menos que uma sessão use crédito de API), aparece “At API prices: on a plan you pay your plan's fee”. Se o preço do modelo não for conhecido, diz que o custo não é contabilizado.

Os turnos do Claude Code informam o tempo do próprio modelo e a primeira resposta; para outros agentes, a parte do modelo é o seu raciocínio. O custo e este painel aparecem em telas mais largas.

### Matemática, diagramas, figuras e imagens nas respostas

Os agentes escrevem as respostas para este app, não para um terminal, então uma resposta pode ter mais do que texto. Todo agente sabe fazer isso e usa estes recursos por conta própria quando deixam a resposta mais clara:

- **Formatação**: títulos, listas, tabelas, negrito e código, organizados para facilitar a leitura.
- **Matemática**: equações desenhadas como em um livro didático, dentro de uma frase ou isoladas em uma linha própria, e equações químicas (2H₂ + O₂ → 2H₂O). Números entre pares de cifrões (`$1$`, `$0$`) também são matemática; preços comuns, como $4,70, continuam sendo dinheiro.
- **Diagramas**: fluxogramas, diagramas de sequência e de estado, linhas do tempo, mapas mentais, gráficos de Gantt e de pizza, desenhados nas cores do app, claro ou escuro. A barra acima de um diagrama tem **Mostrar o código** (o que o agente escreveu; o mesmo botão mostra o diagrama de novo), **Salvar como imagem (SVG)**, **Tela cheia** e um botão que copia o código. Um diagrama que não pode ser desenhado mostra o código, com o motivo.
- **Figuras e pequenas ferramentas**: um gráfico, uma figura anotada, uma calculadora, uma simulação com controles deslizantes ou um quiz curto roda dentro da resposta, isolado do app e dos seus arquivos, como as páginas que os agentes mostram. Ele adota a aparência do app e cresce para caber (**Ver tudo** abre uma figura alta); sua barra tem **Mostrar o código** (**Mostrar** volta), **Salvar como arquivo** e **Tela cheia**. As escolhas que você clica nele vão para a sua caixa de mensagem. Enquanto a resposta ainda está sendo escrita, ele vai se montando no lugar (“Writing…” até ter algo para mostrar) e ganha vida quando está completo.
- **Imagens**: fotos da web (um lugar, um produto, uma planta, uma obra de arte) e imagens neste computador, ajustadas à resposta; clique em uma para vê-la em tamanho grande, onde **Editar** a abre no editor de imagens ([Editar imagens e vídeos](/guide/library#edit-pictures-and-videos)). As imagens da web passam pelo servidor deste app, então o site que as hospeda nunca vê o seu navegador. Uma que não puder ser carregada aparece como um link para ela.

Para receber texto simples, diga isso nas suas [Diretrizes dos agentes](/guide/guidelines) (“Responda em texto simples, sem diagramas nem imagens”) ou na sua mensagem. Você também pode pedir qualquer um desses recursos com palavras simples: “desenhe os passos como um fluxograma”, “mostre uma imagem disso”, “me dê um controle deslizante para testar outros valores”.

### UIs de resposta: cartões, gráficos e mapas nas respostas

Quando parte de uma resposta é algo para olhar, comparar, escolher, acompanhar, experimentar ou praticar, e não para ler, o agente a mostra em uma das UIs de resposta do app: quase 150 cartões, tabelas, gráficos, mapas, galerias, linhas do tempo e pequenas ferramentas prontos, preenchidos com o conteúdo da própria resposta. A maioria das respostas com mais de poucas linhas tem uma parte assim, então você os verá na maioria delas. Opções para comparar viram uma tabela com o melhor valor de cada linha marcado, uma receita vira um cartão cujas porções ajustam as quantidades, uma previsão mostra as próximas horas e dias, lugares viram um mapa com marcadores numerados, um quiz ou problemas de prática viram perguntas que você responde ali mesmo. Cada um se monta conforme a resposta chega, na aparência do app, claro ou escuro.

- **O que você pode fazer em uma delas**: ordenar e filtrar uma tabela, alternar um gráfico para ver seus números, marcar itens de uma lista, iniciar os temporizadores de uma receita, virar flashcards, associar pares ou preencher lacunas, responder às perguntas de um guia de solução de problemas, girar uma roleta para escolher por você, mover os controles deslizantes de uma calculadora ou do gráfico de uma função, reproduzir um vídeo. O que você marca ou responde continua lá quando você volta à conversa neste dispositivo (as respostas de prática também). Um botão que diz **Enviar** (**Enviar minha escolha**, **Enviar minha pontuação**, **Enviar meu resultado**, **Enviar** e semelhantes) envia na hora o que ele nomeia como a sua próxima mensagem, como se você a tivesse digitado e pressionado Enter: a opção que você escolheu, a pontuação do seu quiz, onde a roleta parou. **Enviado** ao lado indica que foi enviado. O que você está escrevendo continua na caixa de mensagem; quando a sessão não pode receber uma mensagem naquele momento (outra ainda está a caminho), as palavras vão para a caixa, para você enviar. Algumas vão além:
  - Os **Problemas de prática** que você responde com suas próprias palavras ou números são corrigidos na hora (um número dentro de uma tolerância, palavras sem se importar com maiúsculas; uma resposta certa cujo único deslize é um acento avisa isso). **Mostrar uma dica** dá as dicas uma de cada vez; a solução resolvida aparece depois de uma tentativa, ou quando todas as dicas foram mostradas. Você recebe uma pontuação, e **Enviar meus resultados** a envia ao agente. A sua resposta a uma pergunta aberta vai com **Enviar para correção**, para o agente corrigir.
  - **Código que você pode executar e alterar**: um playground executa JavaScript, Python ou uma pequena página web no próprio lugar, isolado do app, com a saída (e os gráficos do Python) abaixo. Nele há **Executar**, **Redefinir**, **Copiar** e **Enviar meu código** (ele vai para o agente dar uma olhada), e ele pode propor tarefas para você tentar. O Python é carregado da web na primeira vez, então não roda em uma [sessão confidencial](/guide/sessions#keep-a-session-confidential).
  - **Um passo a passo de código** explica o código como um tour guiado: passos numerados ao lado do código, cada um destacando as linhas que explica enquanto o resto fica esmaecido. Percorra-os com as setas (ou as teclas **←** e **→**), ou toque em uma linha para abrir o passo que a explica. **Perguntar sobre este passo** coloca uma pergunta sobre ele na sua caixa de mensagem.
  - **Um programa executado passo a passo** mostra em que ponto o programa está a cada passo: a linha em que está, suas variáveis (o que acabou de mudar é marcado), as chamadas em andamento e o que já foi impresso. Avance e volte, arraste o controle deslizante ou aperte o play. Quando ele pede que você preveja a saída antes, digite o seu palpite e clique em **Verificar**. **Perguntar sobre este passo** também funciona aqui.
  - **Um grafo de rede** mostra como as coisas se conectam (um mapa de conceitos, os personagens de um romance, o que depende de quê): toque em um nó para destacar suas ligações e ler a nota dele, arraste os nós, leia a legenda ou mude para a visualização **Lista**.
  - **Texto anotado** marca trechos em um texto: toque em um para ler a nota dele (uma correção, um comentário, um significado) e a mudança que ele sugere, ou **Perguntar sobre isto**. Filtre as notas por tipo, alterne entre **Original** e **Corrigido** e use **Copiar texto corrigido**, ou ouça o texto.
  - **Uma checagem de fatos** examina afirmações uma a uma, cada uma com seu veredito, o porquê, o grau de certeza do agente e as evidências a favor e contra, com fontes. A contagem de vereditos no alto filtra as afirmações quando você toca nela.
  - Os **Acompanhamentos** são de dois a cinco botões com as próximas perguntas ou passos ao fim de uma resposta: toque em um para enviá-lo como a sua próxima mensagem quando a caixa de mensagem estiver vazia, ou para acrescentá-lo ao que você está escrevendo. Um botão que você usou ganha um visto.
- **Imagens**: uma entrada sem imagem, ou cuja imagem não pode ser carregada, aparece sem ela, com o texto ocupando o espaço, para não sobrar uma caixa vazia.
- **Links**: tudo o que uma resposta cita e que você talvez queira abrir (um lugar, um produto, um artigo, um livro, um filme, um evento, uma página) leva à própria página, nas palavras do agente e nos cartões dele, para você nunca precisar procurar de novo. Em um cartão, um nome que é um link aparece sublinhado, com uma pequena ↗ depois, para você reconhecer que é um link também no celular: toque ou clique para abrir a página em uma nova aba (em um cartão em que você escolhe uma opção, a página abre sem escolher a opção). O endereço de um lugar abre no Google Maps, e uma tabela pode transformar uma coluna de nomes em links.
- **Números de uma planilha ou de um arquivo**: uma tabela, um gráfico, números-chave, um ranking, um histograma ou valores em um mapa podem ler seus números de uma das suas planilhas (veja [Planilhas](/guide/library#spreadsheets)), ou de um arquivo CSV, TSV, JSON ou JSONL na pasta da conversa ou na do projeto dela, em vez de guardá-los. Os agentes fazem isso quando os números estão lá, quando há mais do que algumas dezenas de linhas, ou para um cartão que você talvez queira guardar: o cartão soma, conta, agrupa, filtra e ordena por conta própria, então nada é digitado de novo, e ele mostra os números mais recentes a cada vez que é exibido (as linhas que você acrescentar depois também, a menos que ele nomeie um intervalo fixo de células). Uma linha abaixo dele diz de onde vieram (**Dados de** *Shop numbers · Sales*, um link que abre a planilha ou o arquivo), quando foram lidos e, quando mostra só uma parte, quanto (“1.000 de 12.400 exibidos”); **Ler de novo** os lê mais uma vez, e quando você salva a planilha o cartão se redesenha sozinho. Se a planilha, a aba, uma coluna ou o arquivo não existir mais, o cartão avisa em palavras simples, com **Tentar de novo**. Um cartão lê apenas arquivos nas pastas da sua conversa, não em outros lugares do seu computador, de até 50 MB (um arquivo JSON, 20 MB) e as primeiras 1.000.000 de linhas deles; uma planilha criada em uma [sessão confidencial](/guide/sessions#keep-a-session-confidential) só é lida por cartões dessa sessão.
- **Ao passar o mouse** (ou ao chegar nele pelo teclado), uma pequena barra no canto superior direito: **Mostrar os dados** mostra o que o agente escreveu (para um cartão que lê uma planilha ou um arquivo, de onde ele lê e o que mostra disso; **Mostrar** volta), **Copiar como texto** o copia como texto simples, e **Tela cheia** mostra o cartão sozinho sobre a página, tão largo quanto a sua janela (em um celular, a tela inteira), com rolagem quando é alto; **Esc**, **Fechar** ou um clique ao lado o trazem de volta. Em **Mais** (…): **Fixar em um painel** guarda uma cópia do cartão em um dos seus painéis, um que você escolher ou um **Novo painel…** que você nomear ali, para voltar a ele ao lado de outros cartões (veja [Painéis](/guide/library#boards)); **Salvar como imagem** salva um PNG do cartão como ele se vê, no tema em que você o vê e com o dobro do tamanho para continuar nítido, com o nome do título dele, e **Copiar como imagem** coloca a mesma imagem na área de transferência, para colar em uma mensagem ou em um documento (onde o seu navegador permitir que páginas façam isso). A Tela cheia tem os mesmos dois botões no alto. Um cartão com um mapa, um gráfico desenhado por uma biblioteca de gráficos, um player de vídeo ou a saída de um playground de código dentro dele não tem botões de imagem (ainda pode ser fixado): essas partes não podem ser desenhadas em uma imagem.
- **Quando os agentes as usam**: os agentes são instruídos a usar uma para cada parte de uma resposta que é algo para olhar, comparar, escolher, acompanhar, experimentar, praticar ou guardar, o que acontece na maior parte do tempo em uma resposta com mais de poucas linhas: opções para avaliar, coisas com imagens e detalhes (lugares, produtos, filmes, livros, pessoas, artigos, notícias), números, tempo e planos, coisas para fazer, coisas para aprender, textos para revisar, afirmações para verificar e próximos passos que você talvez queira dar. Eles preenchem as imagens e reproduzem um vídeo quando assistir ajuda mais do que uma foto. O que um cartão não consegue dizer (o raciocínio, o conselho, as ressalvas) fica nas palavras do agente. Conversa comum, uma resposta curta a uma pergunta curta e alterações de código continuam sendo texto. Cada resposta, a primeira e as seguintes, pode ter vários cartões, um para cada uma de suas partes (o roteiro de uma viagem, a previsão do tempo e uma lista de mala), então uma conversa reúne quantos as suas respostas precisarem; uma resposta posterior pode mostrar um de novo com os dados atualizados. O agente encontra os que servem com uma única busca: pelo nome, para os que já conhece, e com algumas palavras sobre o que cada outra parte mostra (por palavras e, quando a **Busca por significado** está ativada em [Configurações → Memória](/settings?s=memory), também por significado), então nunca recebe todos eles. Os [agentes integrados](/guide/agents#the-built-in-agents) se apoiam cada um nos que combinam com o seu trabalho.
- **Nos seus apps**: a resposta de um app também pode ser um cartão assim, preenchido pelo agente do app a cada execução (veja [A resposta](/guide/apps#the-answer)), e **Fazer isto de novo…** sob uma resposta que mostrou cartões cria um app cuja resposta são esses cartões.
- **Veja todas**: [UIs de resposta](/answers) mostra cada uma com um exemplo, por grupo: resumos, comparações, compras, lugares e viagens, comida, planos, trabalho e negócios, números e gráficos, dinheiro, aprendizado, ciência, mídia, pessoas e esportes, escrita e código. **Reproduzir durante o streaming** mostra uma chegando como chegaria em uma resposta.

Peça uma com palavras simples também: “compare em uma tabela”, “coloque em um mapa”, “me faça um quiz sobre isso”, “me dê problemas de prática sobre isto”, “marque no meu texto o que corrigir”. As suas [Diretrizes dos agentes](/guide/guidelines) (“Responda em texto simples, sem cartões nem gráficos”) ou a sua mensagem podem pedir texto simples.

### Abra um passo para ver sua saída

Clique em qualquer passo para abri-lo:

- um comando: o comando, a pasta em que foi executado, seu código de saída e quanto tempo levou, um botão de copiar e a saída dele (**Carregar saída completa** quando ela foi cortada);
- uma edição de arquivo: o diff (**Carregar o diff completo** quando ele foi cortado);
- uma leitura de arquivo: um link para o arquivo e o que foi lido;
- uma página da web: seu endereço e o que foi lido dela;
- uma tarefa dada a um subagente: **Tarefa atribuída** e o que voltou;
- qualquer outra coisa: o que o agente enviou e o que voltou.

Um passo pode ser marcado como **segundo plano** (continua em execução), **Automático** (o modo Auto do Custom decidiu, com o motivo ao passar o mouse), ou mostrar um código de saída em vermelho. As tarefas em segundo plano (um comando deixado em execução, um monitor, um fluxo de trabalho) são listadas em uma linha acima da caixa de mensagem, junto com os subagentes da sessão; abra uma tarefa para ver sua saída (Claude Code) e **Parar** a tarefa, o que pede confirmação antes; um subagente abre como uma sessão própria. Veja [Subagentes](/guide/sessions#subagents).

## Criar a memória de um projeto antes de o agente começar

Quando você começa uma sessão na página inicial em um projeto cuja [memória wiki](/guide/wiki-memory) ainda é nova (menos de 10 artigos, nenhuma criação a partir do histórico executada) e o projeto tem material para criar uma (conversas, mensagens de commit, documentos, notas, um README ou uma pasta docs/), a sessão pergunta primeiro. Um cartão sob a sua mensagem diz **Criar a memória de <project> primeiro?**, com o que seria lido e quanto tempo leva, antes de o agente começar. A sessão mostra **Precisa de você** (e você recebe a notificação) até você escolher:

- **Criar memória e começar**: a memória começa a ser criada, o cartão vira o andamento e a sessão mostra **Criando memória**. Sua mensagem fica esperando ("Enviada ao agente quando a memória estiver pronta") e vai para o agente assim que a parte mais importante estiver escrita: uma visão geral do projeto a partir dos arquivos, das notas e das conversas com mais conteúdo. O restante continua sendo criado em segundo plano, e os agentes o encontram conforme ele fica pronto. **Começar agora** envia sua mensagem na hora e deixa a criação continuar; **Parar a criação** a interrompe (o que já foi escrito fica) e inicia o agente. Você pode fechar o app: o agente começa sozinho. Se a criação falhar antes desse ponto, o cartão avisa, com **Tentar de novo** e **Começar mesmo assim**. Se o agente terminou antes de receber sua mensagem (travou, ou o computador reiniciou durante a espera) e não pode ser iniciado de novo, o cartão oferece **Começar em uma nova sessão**: uma nova sessão com as mesmas configurações recebe sua mensagem, assume o que você enviou nesse meio-tempo, e a sessão vazia é arquivada.
- **Começar sem memória**: o agente começa agora, e este projeto não pergunta de novo por uma semana.
- **Não perguntar para este projeto**: nunca mais pergunta para este projeto. **Criar a wiki a partir do histórico…** continua no menu **⋯** da aba **Memória** dos detalhes do projeto.

Tudo o que você enviar enquanto ela espera vai para o agente depois da sua primeira mensagem. Ela só pergunta quando você mesmo começa uma sessão na página inicial, nunca para execuções agendadas, apps, subagentes ou sessões que um agente inicia, e não para um projeto que já teve uma criação.

## Aprovar ou recusar o que o agente quer fazer

Quando o agente quer fazer algo que as permissões dele não deixam fazer sozinho, ele espera e pergunta com um cartão no fim da conversa: o que ele quer executar, uma alteração de arquivo com o diff, ou outra ferramenta e seus detalhes, com há quanto tempo está esperando. O ponto da sessão fica âmbar, a caixa de entrada conta o pedido, e você recebe uma notificação se as ativou. Você pode responder pelo cartão, pela [caixa de entrada](/guide/inbox) ou, para um simples sim ou não, pela própria notificação, onde o navegador mostra botões.

Os botões vêm do agente:

- **Claude Code**: **Permitir**, **Recusar** e, muitas vezes, uma regra como "Sempre permitir Bash npm test" ou "Permitir todas as edições nesta sessão".
- **Codex**: **Permitir**, **Permitir nesta sessão**, **Sempre permitir este comando**, **Recusar**, **Recusar e parar**; para alterações de arquivo, **Permitir edições nesta sessão**; para permissões mais amplas, **Permitir nesta vez** e **Permitir nesta sessão**.
- **Custom**: **Permitir**, **Sempre permitir** seguido exatamente do que isso cobre (apenas o comando que você aprovou, para que nada possa ir junto depois dele) e **Rejeitar**.
- Outros agentes: as opções que eles oferecem.

**Recusar** primeiro abre uma caixa, "Opcional: diga ao agente o que fazer em vez disso"; pressione **Recusar** de novo para enviar, com ou sem uma observação. (**Rejeitar** do Custom e **Recusar e parar** do Codex respondem na hora.)

Uma ferramenta de uma conta conectada que você definiu como **Perguntar antes** não pergunta na sessão: a chamada fica retida na Caixa de saída e o agente segue em frente. Uma linha na conversa diz **Aguarda sua aprovação na Caixa de saída** e, depois, se foi enviada ou descartada ([A Caixa de saída](/guide/inbox#the-outbox-calls-held-for-your-ok)).

No modo **Automático** do Claude Code, a verificação de segurança pode recusar um comando de vez em vez de perguntar. Um cartão acima da caixa de mensagem diz então "O Claude bloqueou um comando" e o motivo. **Aprovar e tentar de novo** muda a sessão para Perguntar e faz o agente executar o comando de novo, que volta para você como uma aprovação normal; **Dispensar** deixa como está.

## Responder a perguntas e aprovar planos

Quando o agente pergunta algo, um cartão com borda âmbar mostra as perguntas e suas opções:

- Escolha uma opção, ou várias quando estiver escrito "Escolha quantas quiser". **Outro — digite sua própria resposta** aceita suas próprias palavras.
- **Anexar arquivos** adiciona arquivos a uma resposta.
- As teclas de 1 a 9 escolhem uma opção da primeira pergunta ainda sem resposta.
- **Enviar resposta** a envia como sua próxima mensagem. Se a sessão parou enquanto perguntava, **Retomar e responder** a inicia de novo com sua resposta. Para uma sessão do Claude Code esperando no VS Code ou em um terminal, **Responder aqui** a encerra lá e a continua aqui com sua resposta; uma sessão do Codex nesses lugares precisa ser respondida lá.

Quando a pergunta chega como um cartão de aprovação, os botões são **Enviar respostas** e, para o Claude Code, **Pular**.

**Planos.** No modo **Planejar** do Claude Code, o agente lê e planeja, depois mostra o plano em um cartão: **Aprovar, aceitar edições automaticamente** (pode seguir, editando sem perguntar), **Aprovar, perguntar antes de editar** ou **Continuar planejando** (ele continua em Planejar; diga o que mudar). No modo Planejar do Codex, o Codex conversa e planeja primeiro e pode fazer perguntas para esclarecer. O modo Planejar do Custom termina com um plano numerado; troque as permissões (Shift+Tab) e responda para que ele seja executado.

## Preencher formulários que um serviço pede

Quando um serviço que você conectou precisa de algo de você no meio de uma tarefa (uma data, uma escolha, uma página para aprovar), o formulário dele aparece como um cartão, seja qual for o agente trabalhando: "O Linear pede que você preencha um formulário", "… pede que você abra uma página" ou "… pede para continuar". Preencha os campos e pressione **Enviar** (ou **Abrir**, que abre a página, ou **Permitir**), ou pressione **Recusar** ou **Agora não**. Os servidores de ferramentas do próprio Codex perguntam da mesma forma. Veja [Apps conectados, chaves e ferramentas](/guide/connections).

## Enviar mensagens ao agente enquanto ele trabalha

Você pode digitar enquanto um turno está em andamento. O que o Enter faz nesse caso é definido por **Enviar enquanto um agente trabalha** em [Configurações → App → Geral](/settings?s=general&find=Sending%20while%20an%20agent%20works), para cada navegador:

- **Entrar no turno** (o padrão): o Enter adiciona sua mensagem ao turno em andamento, e o agente a leva em conta imediatamente. Ctrl+Enter (⌘Enter no Mac) a coloca na fila.
- **Esperar**: o Enter coloca sua mensagem na fila, para sair quando o turno terminar. Ctrl+Enter a adiciona ao turno.

A caixa de mensagem diz qual é o caso: "Enviar uma mensagem de acompanhamento ao turno em andamento" ou "Colocar uma mensagem na fila para quando este turno terminar". Em uma tela de toque, o botão de enviar faz o que o Enter faria. O Custom recebe as mensagens de acompanhamento no próximo passo do modelo, depois que as ferramentas em execução terminam; **Enviar agora** faz o mesmo com uma mensagem na fila. Se sua sessão do Custom já estava em execução antes de uma atualização do app e ainda não pode receber mensagens de acompanhamento ao vivo, sua mensagem fica na fila até o turno terminar. Outros agentes ACP recebem uma mensagem por vez, então uma mensagem enviada enquanto eles trabalham sempre espera na fila. No Claude Code, uma mensagem que entrou enquanto o agente trabalhava mostra "enviada durante o trabalho" embaixo dela. A resposta do agente a ela aparece como uma resposta sob a sua mensagem, mesmo que o agente depois continue com o trabalho.

## Gerenciar a fila

As mensagens na fila esperam acima da caixa de mensagem, numeradas na ordem em que saem; uma que você coloca na fila aparece ali no momento em que você a envia. Uma sai cada vez que um turno termina, sozinha.

- Arraste uma mensagem pela alça para mudar a ordem.
- **Enviar agora** (a seta): a envia na hora, para o turno em andamento.
- **Editar** (o lápis): altere o texto, retire anexos ou adicione mais (**Anexar**, ou cole ou solte arquivos). Enter salva, Esc cancela.
- **Remover** (a lixeira): a tira da fila; os anexos dela são excluídos.
- Quando você para o agente, ou o app reinicia, a fila pausa: "A fila está pausada (o agente foi parado ou o servidor reiniciou)." **Retomar** deixa as mensagens saírem de novo conforme o agente fica livre. As mensagens que os agentes enviam entre si (as mensagens de uma sessão aos seus subagentes do Hydor e as respostas deles) não pausam por causa de uma reinicialização: se o agente que elas aguardam ainda está trabalhando, saem quando o turno dele termina. Um limite de gastos atingido também segura a fila; aumentar o limite a deixa seguir.

## Mudar o agente, o modelo, o esforço ou as permissões

A caixa de mensagem de uma sessão tem o **Agente** da página inicial e as três escolhas dele, **Modelo**, **Esforço** e **Permissões**, em um único chip ao lado do **+** (ele abre **Opções**, uma folha que sobe da parte de baixo no celular). Abaixo estão as demais opções da página inicial para esta sessão, na mesma ordem: **Conta** (outra conta assume a sessão a partir da sua próxima mensagem; aparece quando o agente tem mais de uma), **Confidencial** e **Arena** (mostradas como estão: ambas são escolhidas quando a sessão começa, e um clique explica como obter a outra), **Memória**, **Limite de gastos**, **Enxame**, **Pesquisa** e **Diretrizes** (as mesmas escolhas e caixas de diálogo das [Configurações da sessão](/guide/research#turn-it-on) no menu da sessão; Enxame e Pesquisa mudam a partir da sua próxima mensagem). O chip mostra o nome do agente e do modelo, e o esforço e as permissões quando não são os usuais; ele fica âmbar enquanto o agente pode fazer qualquer coisa sem perguntar (**Ignorar**, ou **Acesso total** do Codex). Outro agente vale a partir da sua próxima mensagem (veja [Trocar de agente em uma sessão](/guide/agents#switch-agents-in-a-session)). Uma mudança de modelo, esforço ou permissões vale na hora para o agente em execução e fica com a sessão. Shift+Tab passa para o próximo modo de permissão. O menu de modelos lista apenas os modelos deste agente; para levar a conversa para outro agente, use [Continuar em outro agente](#continue-in-another-agent).

## Citar parte de uma resposta

Selecione texto em uma resposta do agente, ou em uma das suas próprias mensagens: um botão **Orçamento** aparece acima dele (abaixo, em uma tela de toque). Ele coloca o texto na caixa de mensagem como uma citação, com o cursor depois dela, para você responder àquela parte ou retomar algo que disse antes.

## Buscar texto em uma sessão

Pressione Ctrl+F (⌘F) em uma sessão. **Buscar nesta sessão** procura nas suas mensagens e nas do agente, inclusive nas partes ainda não carregadas (não na saída de comandos). Digite duas letras ou mais; ela pula para a ocorrência mais recente e destaca as palavras, e diz "3 de 12". Enter vai para a ocorrência mais antiga, Shift+Enter para a mais recente (ou use as setas), e Esc fecha. Uma mensagem longa recolhida se abre no trecho encontrado. Uma mensagem escolhida na caixa de busca (Ctrl+K) abre a sessão dela com esta barra já preenchida.

## Mais sobre a caixa de mensagem

- ↑ em uma caixa vazia traz de volta suas mensagens anteriores nesta sessão, da mais nova para a mais antiga; ↓ avança de novo.
- O que você digita é guardado como rascunho de cada sessão neste navegador, então continua lá quando você voltar.
- Ctrl+S (⌘S) guarda o rascunho de lado e esvazia a caixa; Ctrl+S em uma caixa vazia o traz de volta.
- Uma colagem muito longa (32.000 caracteres ou mais) é anexada como um arquivo de texto em vez de encher a caixa.
- O texto de exemplo diz o que o envio fará: "Enviar mensagem ao Claude…", ou "Enviar mensagem para continuar…" quando o agente não está em execução: enviar o inicia de novo com a conversa inteira.

## O painel de detalhes: alterações, comandos e informações

**Detalhes** no cabeçalho abre um painel com três abas. Em uma tela larga, ele fica ao lado da conversa e continua aberto quando você passa de uma sessão para outra; em uma tela mais estreita, desliza sobre a página; no celular, só abre quando você pede.

- **Alterações**: todos os arquivos que a sessão alterou, os mais alterados primeiro, com as linhas adicionadas e removidas. Clique em um arquivo para ver o diff de cada edição; **Abrir** abre o arquivo.
- **Comandos**: todos os comandos de shell que o agente executou, os mais recentes primeiro, com os filtros **Todos**, **Falhou** e **Fundo**. Clique em um para ver a saída.
- **Info**: o agente, o status (como no cabeçalho: **Concluído**, **Interrompida**, **Falhou** ou o que ele faz agora), a pasta, o branch, o modelo e o esforço, quanto do contexto está em uso, quando começou e quando esteve ativa pela última vez, a atividade (prompts, turnos, chamadas de ferramentas, comandos), os tokens (de entrada, em cache, de saída), o custo da API (quanto o mesmo trabalho custaria pelos preços da API), a velocidade de saída, onde foi iniciada (Hydor, VS Code, um terminal, o app de desktop do Claude…) e, enquanto o agente dela está em execução, **Seus programas**: o que eles usam agora (CPU, memória e quantos), com os [limites](/guide/app#limit-each-session) sob os quais ela roda. Abaixo: as tarefas em segundo plano dela (abra uma para ver o que fez, ou **Parar** a tarefa) e **Continuar em um terminal**: o comando que retoma a sessão em um terminal e o id da sessão, cada um com um botão de copiar (Claude Code e Codex).

## Ler os medidores: contexto, cache e velocidade

Um pequeno anel com uma porcentagem ao lado do microfone vai enchendo conforme a conversa usa a janela de contexto do modelo; o restante fica no pé do menu do chip Opções:

- **Contexto**: o anel e a linha **Contexto** em Opções ("42% em uso"). Aponte para o anel para ver o número exato de tokens. Ele fica âmbar acima de 85%. Clique no anel, ou em **Compactar** em Opções, para compactar a conversa (não enquanto um turno está em execução). Em uma sessão do Custom, aponte para o anel para ver os tokens e uma divisão do que os consome, e a divisão fica sob a seta da linha **Contexto**; o Custom condensa sozinho, então não há **Compactar** e clicar no anel não faz nada (veja [Conversas longas e saídas longas](/guide/custom#long-conversations-and-long-output)).
- **cache 4m** (Claude Code): o cache do prompt mantém a conversa pronta por um tempo (5 minutos ou uma hora), então a próxima mensagem fica mais barata e mais rápida. Ele faz a contagem regressiva enquanto você não envia nada; uma mensagem antes disso o reutiliza e reinicia a contagem. **cache frio** significa que a próxima mensagem o recria.
- **85 tok/s**: a velocidade com que a última resposta foi escrita, em tokens por segundo.

## Parar uma rodada, parar o agente ou retomar

O botão Parar ao lado da caixa de mensagem tem um anel giratório enquanto o agente está iniciando ou trabalhando. O anel pausa quando o agente precisa de você e fica parado se o seu dispositivo pedir movimento reduzido. Depois que a rodada termina, o botão Parar continua ali, com o anel, enquanto houver tarefas em segundo plano ou subagentes iniciados pelo agente ainda em execução, como um subagente do Hydor, um subagente do Claude Code, um comando deixado em execução ou um monitor; o botão de enviar fica ao lado, e a caixa recebe suas mensagens normalmente. Aponte para Parar para ver o que ele interrompe: “Interrompe esta rodada, 2 subagentes e 1 tarefa em segundo plano” ou “Interrompe 2 subagentes”. Ele interrompe tudo isso de uma vez: a rodada, cada subagente em execução e cada tarefa em segundo plano em execução, além das que essas iniciaram por sua vez. Um subagente do Hydor interrompido dessa forma não envia relatório ao agente que o iniciou, e um relatório que já estava a caminho espera na fila pausada desse agente em vez de acordá-lo; pressione **Retomar** para liberar a fila.

- **Parar uma rodada**: pressione **Parar** no cabeçalho ou o botão de quadrado arredondado ao lado da caixa de mensagem, que também interrompe o que a sessão iniciou (veja acima). (Esc não interrompe: ele só fecha o que estiver aberto, como a barra de busca ou uma lista.) O agente para o que está fazendo; a rodada mostra “Interrompida após…”. A sessão mostra que parou no instante em que você pressiona **Parar**, mesmo que o agente leve alguns segundos para terminar (por exemplo, para encerrar um comando que estava executando); se o agente ainda estiver trabalhando 20 segundos depois, a sessão volta a mostrá-lo trabalhando. O agente continua pronto para a sua próxima mensagem, e a fila fica pausada até você retomá-la.
- **Parar o processo do agente**: o menu da sessão (⋯) → **Mais** → **Parar o processo do agente**, quando nenhuma rodada estiver em andamento. O programa do agente é encerrado; a sessão e o histórico permanecem, e ela mostra como terminou a última rodada (**Concluído**, **Interrompida** ou **Falhou**).
- **Retomar**: o botão **Retomar** do cabeçalho inicia o agente novamente com toda a conversa, ou basta enviar uma mensagem (“Mensagem para continuar…”): isso também o inicia de novo, tanto no Claude Code quanto no Codex e no Custom. Depois de **Concluído**, **Retomar** é um botão mais discreto, já que a sua próxima mensagem basta. Se a sessão recebeu uma gravação há poucos segundos, talvez pelo VS Code ou por um terminal, o app pergunta antes, pois dois programas gravando na mesma sessão podem danificar o histórico.
- Um agente deixado ocioso para sozinho após três horas (quando nada espera por você e nenhuma tarefa em segundo plano está em execução); sua próxima mensagem o inicia de novo.

## Dar um objetivo à sessão

Um objetivo mantém o agente trabalhando, rodada após rodada, até que as verificações combinadas se cumpram. Defina um pelo menu da sessão (⋯) → **Definir um objetivo**, ou comece uma sessão já com um objetivo em **Opções**, na página inicial. Como os objetivos funcionam, de combinar as verificações a conduzir um enquanto ele trabalha, está em [Objetivos](/guide/goals).

## Bifurcar uma sessão

Uma bifurcação é uma nova sessão que começa com esta conversa e depois tenta outra coisa; esta sessão continua como está.

1. Abra o menu da sessão (⋯) → **Bifurcar**, ou pressione **Bifurcar a partir desta resposta** abaixo de uma resposta (qualquer resposta do Claude Code; a última resposta de um turno concluído no Codex e no Custom) para manter a conversa somente até esse ponto.
2. Escreva o que a bifurcação deve fazer (“O que a bifurcação deve tentar em vez disso?”).
3. Pressione **Bifurcar** (ou Ctrl+Enter).

A bifurcação é aberta com o título “… · fork”, com o mesmo agente, modelo, esforço, permissões e conta. Uma linha no topo diz “Bifurcada de …” com **Abrir** (uma bifurcação do Codex mostra apenas o que veio depois; a conversa anterior está no original). As bifurcações funcionam para Claude Code, Codex e Custom, e não para uma sessão aberta em outro app. Uma resposta do Claude Code de antes de a conversa ser compactada também pode ser bifurcada: a bifurcação começa com a conversa inteira até essa resposta, como estava antes de ser compactada.

## Editar a partir daqui

Volte a uma das suas mensagens e diga outra coisa no lugar:

1. Pressione **Editar a partir daqui** abaixo da sua mensagem.
2. Altere o texto.
3. Marque **Restaurar os arquivos como estavam antes desta mensagem** se as alterações feitas pelo agente desde então também devem ser desfeitas.
4. Pressione **Enviar a partir daqui** (Enter) ou **Cancelar** (Esc).

A conversa continua em uma cópia até logo antes dessa mensagem, que assume o título desta sessão; esta sessão é arquivada. Restaurar os arquivos funciona para o Claude Code (a partir dos próprios checkpoints das mensagens enviadas por este app), para o Custom (os arquivos que as próprias edições dele alteraram; o que os comandos alteraram permanece) e para qualquer sessão em um worktree (um instantâneo é feito cada vez que você envia uma mensagem). As sessões do Codex só podem restaurar arquivos em um worktree. Pare o agente primeiro se um turno estiver em execução. A restauração dos arquivos é recusada enquanto o [objetivo](/guide/goals) da sessão está verificando os arquivos ou restaurando-os (“O objetivo desta sessão está verificando os arquivos agora: espere terminar ou pause o objetivo primeiro”); o próprio objetivo é encerrado quando a sessão é substituída. Editar a partir daqui funciona para Claude Code, Codex e Custom.

## Continuar em outro agente

Passe a conversa para outro agente e continue por lá:

1. Abra o menu da sessão (⋯) → **Continuar no Codex** (ou **Continuar no Claude Code**, ou **Continuar no Agente Custom** quando o Custom tiver um modelo).
2. Uma nota acima da caixa de mensagem diz que sua próxima mensagem vai para lá; as escolhas de modelo, esforço e permissões agora valem para o novo agente. Pressione × (“Ficar aqui”) para cancelar.
3. Escreva uma mensagem ou apenas envie para continuar.

Uma nova sessão é aberta na mesma pasta, com a conversa até agora: seu primeiro pedido, depois as mensagens mais recentes que couberem em cerca de 15.000 tokens, e os arquivos alterados. O novo agente é informado de onde a conversa inteira está guardada, para poder ler o que ficou de fora. A primeira mensagem dele mostra “Continuada do Claude Code”, com **Abrir essa sessão** e um botão que mostra as mensagens trazidas; a sessão antiga mostra “Esta conversa continuou no Codex” com **Abrir**. Isso funciona a partir de sessões do Claude Code e do Codex.

## Compactar a conversa

Compactar substitui o histórico até agora por um resumo, o que libera espaço no contexto do modelo para o que vem a seguir. Use o menu da sessão (⋯) → **Mais** → **Compactar a conversa**, ou clique no medidor de contexto na caixa de mensagem, e confirme com **Compactar**. Funciona para Claude Code e Codex, entre os turnos. O Custom condensa uma conversa longa por conta própria.

## Renomear, fixar, adiar, encerrar, arquivar ou excluir

A maioria destas opções está no menu da sessão (⋯) e no menu da linha dela na barra lateral: passe o mouse sobre a linha e clique em **⋯** no final, ou clique com o botão direito (no celular, toque no **⋯** dela).

- **Renomear**: digite um novo título (até 200 caracteres); Enter salva, Esc cancela. Clicar duas vezes no título no cabeçalho ou na barra lateral, ou F2 em uma linha selecionada, faz o mesmo.
- **Renomear pasta** (na barra lateral, para uma sessão que não está em um projeto): um nome seu para a pasta em que ela trabalha, que a barra lateral, as linhas das sessões e os menus de pastas mostram em todos os dispositivos; a pasta mantém o próprio nome no disco. Deixe vazio para usar o nome da própria pasta.
- **Fixar no topo** / **Desafixar**: as sessões fixadas ficam no grupo **Fixados**, na ordem em que você as arrastar. Você também pode arrastar uma sessão dos grupos abaixo (de um projeto ou de uma pasta, Hoje, Ontem…) para Fixados, ou para “Solte aqui para fixar” quando ainda não houver nada fixado.
- **Adiar**: oculta a sessão no grupo **Adiadas**, no fim da lista, até **Por uma hora**, **Por 3 horas**, **Hoje à noite** (enquanto forem antes das 17h), **Amanhã de manhã**, **Próxima semana** (segunda-feira de manhã) ou **Escolher data e hora**. Ela volta por conta própria, com um aviso, ou antes se precisar de você. **Reativar** a traz de volta agora.
- **Encerrar: por enquanto, concluída**: para trabalhos terminados. O agente para (a opção não aparece enquanto um turno está em execução) e a sessão conta como lida; o histórico e qualquer worktree permanecem. Para uma sessão em um worktree, a caixa de diálogo do worktree é aberta para você poder removê-lo.
- **Arquivo compactado** / **Desarquivar**: tira a sessão da lista; nada é excluído. As sessões arquivadas são encontradas na caixa de busca (Ctrl+K), marcadas como **Arquivada**; abra uma e escolha **Desarquivar** no menu dela.
- **Excluir sessão**: depois de você confirmar, o histórico da sessão é removido do disco, e por isso ela desaparece também da linha de comando do próprio agente e do VS Code. Isso não pode ser desfeito. **Excluir** no menu da linha dela na barra lateral faz o mesmo.

Até você excluí-la, o app guarda todas as sessões, mesmo quando o programa do próprio agente exclui a conversa (o Claude Code faz isso após 30 dias, a menos que seja configurado de outra forma): ela volta, listada e pronta para abrir. As sessões que ninguém usou por um ano são excluídas automaticamente, a menos que você as fixe ou mude isso em Configurações → Geral (veja [Excluir sessões inativas](/guide/app#delete-inactive-sessions)).

Fixar, desafixar, arquivar, desarquivar e adiar mostram um aviso com **Desfazer**, e Ctrl+Z desfaz essas ações em até 8 segundos.

## Compartilhar um link somente leitura

O menu da sessão (⋯) → **Compartilhar um link somente leitura** cria um link que qualquer pessoa pode abrir sem a sua senha (não para uma [sessão confidencial](#keep-a-session-confidential)). A pessoa vê a conversa enquanto ela acontece (mensagens, os passos pelo nome, alterações em arquivos e páginas que o agente mostrou), mas não a saída dos comandos nem o raciocínio do agente, e não pode digitar nem alterar nada. Escolha por quanto tempo ele funciona (**Um dia**, **Uma semana**, **Um mês**, **Até ser desativado**) e pressione **Criar um link**; o link aparece uma única vez. A mesma caixa de diálogo lista os links que estão funcionando agora, quantas vezes cada um foi aberto, e desativa qualquer um deles. Veja [Celulares, outras máquinas e compartilhamento](/guide/devices).

## Exportar uma conversa

O menu da sessão (⋯) → **Exportar** tira a conversa do chat:

- **Exportar como Markdown** baixa a conversa como um arquivo Markdown com o nome do título da sessão, para guardar, enviar ou abrir em qualquer app de notas.
- **Copiar como Markdown** coloca o mesmo texto na área de transferência, para colar em notas, em um e-mail ou em outro app.
- **Manter como documento** cria um documento com ela, guardado no projeto da sessão (aparece nos **Arquivos** do projeto; sem projeto, ele fica com esta conversa), para ler, editar, comentar, imprimir e exportar como Word ou PDF por lá. Uma mensagem avisa quando estiver pronto; **Abrir** leva você até ele.

O que entra: o título e a data, depois cada uma das suas mensagens e cada resposta do agente, em ordem, com os horários. Os passos de um turno ficam de fora, com uma linha como “Trabalhou por 2 min · 5 passos” no lugar. Os arquivos que o agente entregou são listados pelo nome. Os cartões de resposta viram texto que você pode ler, com tabelas como tabelas (uma comparação, uma tabela de dados, os números de um gráfico). Os diagramas permanecem como código Mermaid e as fórmulas matemáticas como LaTeX, do jeito que o agente escreveu. No documento, as imagens que você anexou às suas mensagens e as imagens que o agente entregou também estão incluídas.

Uma [sessão confidencial](#keep-a-session-confidential) também pode ser exportada, e o documento dela fica neste computador como o resto do trabalho dela: as imagens da web ficam como links em vez de serem baixadas. Em um terminal, `hydor sessions export` faz o mesmo ([Hydor em um terminal](/guide/terminal)).

## Trabalhar em um worktree

Um worktree é uma cópia separada dos arquivos de um repositório em um novo branch, para que um agente possa alterar coisas sem tocar na sua própria cópia, e vários agentes possam trabalhar em um mesmo repositório ao mesmo tempo.

- **Começar um**: na página inicial, abra **Pasta** e ative **Novo worktree a partir de …** (a pasta precisa estar em um repositório git). O app cria um branch chamado `agent/` mais algumas palavras da sua tarefa, a partir do branch em uso, e uma pasta para ele na pasta de dados do app. A opção fica salva para a próxima vez.
- **Instantâneos**: em um worktree, o app guarda um instantâneo dos arquivos cada vez que você envia uma mensagem, para que [Editar a partir daqui](#edit-from-here) possa restaurá-los.
- **Ver**: o menu da sessão (⋯) → **Pasta e código** → **Worktree: agent/…** mostra o branch e aquele de que ele veio, sua pasta, quantos commits ele está à frente ou atrás, e as alterações não commitadas, com **Revisar as alterações** e **Abrir no Git**.
- **Remover** quando o trabalho terminar: na mesma caixa de diálogo, **Remover worktree**. A pasta é removida; a sessão mantém o histórico. O branch permanece, então nada que foi commitado se perde, a menos que você marque **Excluir também o branch …** (um branch sem nada novo é excluído de qualquer forma). Com alterações não commitadas, marque **Descartar as … alterações não commitadas** primeiro. O agente para se estava em execução, e bifurcações ou edições que compartilham o worktree também o perdem.

## Abrir um pull request

A partir do branch de uma sessão, o menu da sessão (⋯) → **Pasta e código** → **Abrir um pull request** abre um pull request no GitHub ou no Gitea. **Escrever para mim** redige o título e a descrição a partir dos commits e do diff; uma caixa pode fazer o commit das alterações pendentes antes; **Rascunho** o marca como rascunho; o push do branch é feito quando você pressiona **Abrir pull request**. Você precisa de uma conta em [Configurações → Controle de versão](/settings?s=scm). **Vincular um pull request que já existe…** vincula um aberto em outro lugar.

Depois de vinculado, o estado e as verificações dele aparecem como um selo na barra lateral e no cabeçalho, e são atualizados a cada poucos minutos, com um aviso quando ele é mesclado ou suas verificações terminam. O mesmo item de menu, agora **Pull request #12**, tem **Abrir no GitHub** (ou Gitea), **Revisar as alterações**, **Verificar agora** e **Desvincular**. **Revisar as alterações** no submenu percorre o que o branch altera, arquivo por arquivo. Veja [Sistema: arquivos, Git, Terminal e Preview](/guide/files-git).

## Quando um limite de uso interrompe uma sessão

Quando um plano do Claude Code ou do Codex fica sem uso, um banner acima da caixa de mensagem diz de quem foi o limite atingido, qual limite e quando ele é renovado: “Você atingiu o limite de uso do Claude Code” com uma conta desse agente, “Todas as suas contas do Claude Code atingiram o limite de uso” quando você tem várias e nenhuma tem mais uso disponível, ou a conta pelo nome (“Trabalho atingiu o limite de uso”) quando outra ainda tem algum.

Quando outra conta desse agente ainda tem uso disponível, você não vê banner enquanto **Trocar de conta no limite** estiver ativado: a sessão passa para essa conta e continua (as novas sessões começam por lá). Com a opção desativada, o banner cita essa conta e oferece **Ativar**.

- **Retomar na renovação** continua a sessão automaticamente um minuto depois de o limite ser renovado, com a mensagem “Continue de onde parou.” O banner então diz quando, com **Cancelar**.
- **Usar uma renovação**: quando sua conta tem renovações de limite disponíveis, o banner diz quantas, e esta opção usa uma agora.
- [Retomar após limites de uso](/settings?s=general&find=Resume%20after%20usage%20limits) em Configurações → App → Geral faz isso para toda sessão que um limite interrompe. Com a opção ativada, você não vê aviso na sessão: uma linha acima da caixa de mensagem diz de quem foi o limite atingido (como o banner), qual limite e quando ela continua (“Todas as suas contas do Claude Code atingiram o limite de uso”, depois “Sessão atual (5 h) · Continua automaticamente em 3 h 15 min.”), com **Usar uma renovação** quando você tiver uma, e **Cancelar**. Uma sessão que você mesmo parou com **Parar** não continua automaticamente.

O horário acompanha o limite: se a renovação mudar, ou o uso voltar antes, a sessão continua nesse momento. Veja [Uso, limites e custos](/guide/usage).

## Sessões em execução no VS Code ou em um terminal

Toda sessão do Claude Code e do Codex neste computador aparece na lista, inclusive as que você executa no VS Code, em um terminal ou no app desktop do Claude. Enquanto elas rodam por lá, a lista mostra “Trabalhando no VS Code”, “Precisa de você no terminal” ou “Abrir no VS Code” (um ponto cinza), e você pode acompanhar enquanto elas trabalham. Se uma estiver esperando por você lá, o app avisa apenas se ela ainda estiver esperando um minuto depois.

- **Assumir uma sessão do Claude Code**: pressione **Continuar aqui** no cabeçalho dela, ou simplesmente envie uma mensagem (“Abrir no VS Code — enviar move a sessão para cá”). O app pergunta antes: ele encerra a sessão naquele app, interrompendo o que ela está fazendo, e a retoma aqui com todo o histórico. Aquele app a mostra como encerrada; você pode reabri-la por lá depois.
- **As sessões do Codex** abertas em outro lugar são somente leitura aqui, porque um único processo do Codex lá atende todas as suas conversas. Continue por lá, ou feche por lá e depois retome aqui.
- Bifurcar não está disponível enquanto uma sessão está aberta em outro app.

## Subagentes

Um agente pode passar partes de um trabalho para subagentes e receber os resultados de volta. Há dois tipos, e o app diz qual é qual:

- Um **subagente do Hydor** é uma sessão própria que o Hydor começa, com qualquer agente e modelo. Ele tem uma linha no cartão de subagentes na conversa da sessão principal, aparece abaixo dela na barra lateral, e você pode abri-lo e conversar com ele. Tem custo próprio e uma parte própria do limite de gastos da sessão principal, e a resposta dele volta para a sessão principal como uma mensagem.
- Um **subagente do Claude Code** (no Codex, um "subagente do Codex": o nome do programa da própria sessão) é um subagente que esse programa executa dentro da sessão durante uma parte curta do trabalho. Ele aparece e abre como um subagente do Hydor: uma linha em um cartão na conversa, uma linha na barra lateral e na bandeja, e uma página própria com toda a conversa dele. Mas você não pode conversar com ele (quem o comanda pode), o que ele gasta conta como gasto de quem o comanda, e ele não tem parte de um limite de gastos.

Na barra lateral, os subagentes ficam recolhidos sob a sessão principal enquanto trabalham ou esperam por você, os do Hydor e os do próprio programa juntos, em uma só linha ("3 subagentes · 1 precisa de você", "2 subagentes"); clique na linha para ver uma linha para cada um. Um subagente que terminou sai da barra lateral, a menos que você esteja olhando para ele, e a linha continua aberta enquanto você olha para um deles. Os membros de um enxame aparecem como "membros do enxame", os de uma campanha como "membros da campanha". Na conversa da sessão principal, os subagentes que uma rodada começou aparecem juntos em um cartão abaixo dessa rodada: os subagentes do Hydor em um cartão, os do próprio programa (do Claude Code ou do Codex) em outro. A linha de cima diz quantos são e de que tipo, com o que todos têm em comum ("6 subagentes do Claude Code · Sonnet 5.5", "3 subagentes do Hydor · Claude Code · Sonnet 5.5", "4 pesquisadores" em uma pesquisa aprofundada), e como andam ("5 trabalhando · 1 concluído", também "1 precisa de você", "1 parado", "1 com falha"). Clique nessa linha para recolher ou expandir o cartão: ele fica aberto enquanto algum deles trabalha ou precisa de você, e se recolhe nessa única linha quando todos terminam.

Abaixo dela, cada subagente tem uma linha: um ponto na cor do estado (azul enquanto trabalha, pulsando suavemente; âmbar quando precisa de você; verde quando concluído; cinza quando parado; vermelho quando falhou), o título, em tela larga o que ele tem que os outros não têm (o tipo ou modelo, o agente seu com o qual ele trabalha, o nível), e como anda: há quanto tempo trabalha até agora, "Precisa de você", quando terminou ("há 3 min"), "Parado" ou "Com falha". A linha de um subagente do Hydor também mostra quanto ele custou, e ao apontar para um que subiu de nível aparece "Subiu de nível a partir de" seu primeiro nível e o motivo. Clique em uma linha para abrir o subagente. Enquanto outros ainda trabalham, os que terminaram se recolhem em uma só linha, como "4 concluídos: " e seus títulos: clique nela para vê-los. Os que falharam continuam como linhas próprias. Com mais de seis em atividade, cinco aparecem, com **Mostrar mais 3**.

Uma rodada que começou apenas um subagente o mostra como um cartão de uma linha: o ícone com um ponto de estado, o título, o que ele é ("Subagente do Claude Code · Explore · Sonnet 5.5" ou "Subagente do Hydor · Claude Code · Sonnet 5.5", com o agente com o qual ele trabalha e o nível quando tem), e como anda.

Para parar um, aponte para a linha dele (ou chegue nela com Tab) e **Parar** aparece no lugar do tempo; em tela de toque, um pequeno botão de parar fica sempre visível. Um subagente do Claude Code pergunta antes ("Parar este subagente?"), um subagente do Hydor para na hora, e um subagente do Codex não pode ser parado individualmente por aqui. O menu **⋯** do cartão tem **Parar 5 subagentes** (com quantos podem ser parados), que para todos sem perguntar. A chamada que começou um subagente continua como uma etapa no trabalho recolhido da rodada.

Quando um subagente que trabalhou em segundo plano volta, a conversa da sessão principal mostra uma linha: "Resposta de" e o título dele, ou "… foi parado", ou "… parou com um erro", com o início do que ele escreveu. Clique nela para ler a resposta e em **Abrir a sessão** para ir até ele. A resposta de um subagente do Codex é buscada na conversa dele quando você abre a linha. Uma resposta que chegou enquanto a sessão principal ainda trabalhava aparece no lugar, entre as etapas anteriores e as seguintes.

Dentro de um subagente do Hydor, uma barra acima da caixa de mensagem diz "Subagente de" e o título da sessão principal ("as respostas dele voltam para lá"), com **Abrir sessão principal**. Um subagente do Claude Code ou do Codex também abre como uma sessão, somente leitura: mostra a tarefa que recebeu, as etapas e a resposta, ao vivo enquanto trabalha, sem caixa de mensagem e sem **Retomar** nem menu da sessão. No lugar da caixa de mensagem, uma barra diz "Subagente do Claude Code de" e o título da sessão principal ("as respostas dele voltam para lá"), com **Abrir sessão principal**. Enquanto um subagente do Claude Code trabalha, **Parar** no cabeçalho dele o interrompe, perguntando antes. Enviar uma mensagem a ele, retomá-lo, bifurcá-lo, transferi-lo ou excluí-lo é recusado: o programa o executa dentro da sessão da sessão principal, então converse com a sessão principal.

Uma sessão principal cuja própria rodada acabou enquanto seus subagentes ainda trabalham não está concluída: o ponto dela continua pulsando em azul, o anel no botão Parar da caixa de mensagem continua girando, o status dela diz "Trabalhando · 2 subagentes em execução", ela não mostra a marca "Concluída" e continua em Ativas, e você ainda pode enviar uma mensagem a ela. Isso vale para uma sessão do Claude Code e para uma sessão do Codex. Um subagente do Hydor também conta como em execução enquanto subagentes ou tarefas em segundo plano que ele começou (um comando, um monitor) ainda rodam depois de a própria rodada dele ter acabado, então a sessão principal aparece como trabalhando, não como concluída. Um limite de gastos na sessão principal cobre os subagentes do Hydor dela, e o que um subagente do Claude Code ou do Codex gasta já é gasto da própria sessão principal. Veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research).

Acima da caixa de mensagem, uma linha resume tudo o que a sessão começou: seus subagentes e suas tarefas em segundo plano (comandos, monitores, fluxos de trabalho). Ela diz "2 subagentes e 1 tarefa em segundo plano em execução", com "1 precisa de você" em âmbar quando um subagente do Hydor espera por você, ou "3 subagentes · 2 tarefas em segundo plano · tudo concluído" quando nada está em execução, e ela vem recolhida toda vez que você abre a sessão. Clique nela para listar cada um: o que precisa de você no topo, depois o que está em execução, depois o que terminou, do mais recente para o mais antigo, com rolagem interna depois de cerca de cinco. Todas as linhas têm o mesmo formato: um ícone com um ponto de estado, o título, o que é ("Subagente do Hydor · Claude Code · Sonnet 5.5", "Subagente do Claude Code · Explore · Haiku 5.5", "Comando", "Monitor", "Fluxo de trabalho"), como anda ("Trabalhando · 2m 10s", "Precisa de você", "Concluído · há 3 min", "Parado", "Com falha"), o custo de um subagente do Hydor (um subagente do programa não mostra nenhum: o gasto dele é da sessão principal), **Abrir** e um botão de parar (um quadrado dentro de um círculo) enquanto ele está em execução. Aponte para o que ele é para ver quem o executa: "O Hydor o começou como uma sessão própria: abra-a para acompanhá-lo ou conversar com ele" ou "O Claude Code o executa dentro desta sessão: abra-o para acompanhá-lo". **Abrir** leva você à sessão de um subagente do Hydor ou de um subagente do Claude Code ou do Codex; um comando, um monitor ou um fluxo de trabalho abre em um painel sobre a direita da página (a tela inteira no celular), com o título, o tipo e o estado, **Parar** enquanto está em execução e, abaixo, a saída. Ele é atualizado a cada dois segundos e acompanha as linhas mais recentes, a menos que você role para cima. O botão de parar de um subagente diz "Parar este subagente", o de uma tarefa, "Parar esta tarefa". **Parar tudo**, à direita da linha, para tudo o que está em execução, como o botão Parar ao lado da caixa. Os membros de um enxame ou de uma campanha não são listados aqui: o painel deles os mostra. As tarefas que terminaram continuam listadas até o programa do agente parar; uma sessão aberta no VS Code ou em um terminal lista as tarefas dela, mas não pode pará-las.

Quantos subagentes do Hydor uma sessão executa ao mesmo tempo é definido em [Configurações → Recursos → Subagentes](/settings?s=children): essas configurações valem para subagentes do Hydor, porque os subagentes do Claude Code e do Codex rodam dentro da sessão deles. Com [Liderar com subagentes](/settings?s=models&find=Lead%20with%20subagents) ativado em Configurações → Modelos → Níveis, o agente principal de uma sessão planeja, passa partes claras para subagentes em níveis mais baratos e confere o trabalho deles.

## Tudo no menu da sessão

O botão ⋯ no canto superior direito de uma sessão abre o menu dela. Alguns itens só aparecem quando se aplicam; o menu de uma [sessão confidencial](#keep-a-session-confidential) não tem **Compartilhar um link somente leitura**, **Abrir um pull request**, **Abrir um navegador**, **Contas conectadas**, **Transformar em automação** nem **Salvar como app**, e a memória dela fica desativada.

- **Renomear**: edite o título no próprio lugar.
- **Fixar no topo** / **Desafixar**.
- **Adiar** (um submenu de horários), ou **Cancelar o adiamento (volta às …)** enquanto ela está adiada.
- **Encerrar: por enquanto, concluída**: para o agente e marca a sessão como lida (não enquanto uma rodada está em andamento).
- **Bifurcar**: uma nova sessão a partir desta conversa (Claude Code, Codex, Custom).
- **Continuar no Codex**, **Continuar no Claude Code**, **Continuar no Custom Agent**: leva a conversa para outro agente (a partir do Claude Code e do Codex).
- **Definir um objetivo**: o agente e você combinam as verificações, e ele trabalha rodada após rodada até que elas sejam atendidas; todos os agentes; enquanto nenhum objetivo estiver definido. Veja [Objetivos](/guide/goals).
- **Segunda opinião**: o modelo de outra empresa confere o trabalho de uma rodada em relação ao que você pediu, e as conclusões dele aparecem abaixo dessa rodada. Veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research).
- **Compartilhar um link somente leitura**.
- **Exportar** (um submenu): **Exportar como Markdown**, **Copiar como Markdown** e **Manter como documento**. Veja [Exporte uma conversa](#export-a-conversation).
- **Pasta e código** (um submenu, para sessões com uma pasta):
  - **Revisar as alterações**: o que o branch altera, arquivo por arquivo.
  - **Abrir um pull request**, ou **Pull request #12** quando já existe um.
  - **Worktree: agent/…**: a janela da worktree (sessões em uma worktree).
  - **Explorar a pasta**: abre Arquivos na pasta da sessão.
  - **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta**: no app para computador, a pasta da sessão selecionada no gerenciador de arquivos do sistema (veja [Trabalhe com arquivos e pastas](/guide/files-git#work-with-files-and-folders)).
  - **Abrir um terminal aqui**: um novo terminal na pasta (no painel inferior no computador, na página Terminal no celular).
- **Configurações da sessão** (um submenu):
  - **Memória**, com **Ativada** ou **Desativada** ao lado: ativa ou desativa a memória nesta sessão ("Desativada para todos" quando a memória está desativada nas Configurações). Veja [Memória](/guide/memory).
  - **Limite de gastos**, com o limite ao lado: defina, altere ou aumente. Veja [Uso, limites e custos](/guide/usage).
  - **Contas conectadas**: ative ou desative cada conta conectada somente nesta sessão. Veja [Apps conectados, chaves e ferramentas](/guide/connections).
  - **Enxame**, com **Desativada**, **Ativada** ou **Campanha** ao lado: abre uma janela para ativar ou desativar um enxame ou uma campanha a partir da sua próxima mensagem. Veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research#set-a-swarm-on-a-hard-problem).
  - **Pesquisa aprofundada**, com **Desativada** ou o número de buscas ao lado: abre uma janela para ativar, desativar ou alterar uma pesquisa aprofundada a partir da sua próxima mensagem. Veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research#turn-it-on). (Enxame e Pesquisa aprofundada não aparecem em uma sessão confidencial, nem em uma sessão que outra sessão começou.)
  - **Agente**, com o nome dele ao lado: abre a página do agente (sessões com um agente). A caixa de mensagem o troca.
- **Mais** (um submenu):
  - **Abrir um navegador** / **Mostrar o navegador**: o navegador dos agentes nesta sessão, que você pode acompanhar e assumir. Veja [Busca e navegador](/guide/web).
  - **Transformar em automação**: o modelo auxiliar lê a sessão e redige uma tarefa agendada a partir dela; altere o que quiser, teste com uma execução de teste e salve. Veja [Tarefas agendadas](/guide/tasks).
  - **Salvar como app**: começa um novo app a partir desta sessão. Veja [Apps](/guide/apps).
  - **Compactar a conversa** (Claude Code e Codex).
  - **Copiar o comando de retomada da CLI**: o comando para continuar esta sessão em um terminal.
  - **Parar o processo do agente** (enquanto o agente está em execução e nenhuma rodada está em andamento).
- **Arquivo compactado** / **Desarquivar**.
- **Excluir sessão**: remove o histórico dela do disco, depois de você confirmar.

## Pergunte a um agente

- "Comece uma sessão do Claude Code em ~/code/blog em um novo worktree que adicione um feed RSS, com um limite de gastos de US$ 5."
- "Quais sessões terminaram desde esta manhã? Conclua as que estão prontas e arquive as da semana passada."
- "Por que esta sessão diz Falhou, e o que devo enviar para tentar de novo?"
- "Quanto custou a última vez que esta sessão respondeu, e quanto disso foi o cache?"
- "Adie a sessão sobre os formulários de imposto até segunda-feira às 9h."
- "Coloque no meu painel Loja o gráfico de vendas e os números principais que você acabou de me mostrar."
- "Faça um fork da sessão de notas de versão e tente uma versão mais curta."
- "Mude a sessão “Limpeza de dados” para Aceitar edições e envie: continue com o próximo arquivo."
- "Envie esta correção para minha sessão Custom em andamento; se for anterior à atualização, coloque na fila até o fim da vez."
- "O que significa o anel giratório no botão Parar?"
- "Pare tudo o que esta sessão iniciou: seus subagentes e suas tarefas em segundo plano."
- "O que mostra a linha acima da caixa de mensagem com subagentes e tarefas em segundo plano?"
- "Quais destes subagentes o Hydor iniciou, e quais o Claude Code iniciou?"
- "Abra o subagente do Claude Code que escreveu os testes."
- "Explique como funciona uma bomba de calor, com um diagrama do ciclo e uma imagem de uma."
- "Compare os três leitores de e-book em uma tabela e escolha um para mim."
- "Guarde nossa conversa sobre bicicletas elétricas como um documento no meu projeto Tese."
- "Mostre em um mapa os melhores lugares de lámen perto da estação Shibuya."
- "Me faça um quiz sobre a Revolução Francesa: cinco perguntas."
- "Me dê exercícios de prática sobre como resolver equações do segundo grau, com dicas."
- "Marque no meu ensaio o que corrigir e me dê a versão corrigida."
- "Verifique os fatos destas cinco afirmações do artigo."
- "Quero testar este trecho de Python e alterá-lo."
- "Quais dos meus modelos podem executar uma sessão confidencial, e qual deles ela usaria?"
- "Comece uma sessão confidencial em ~/reviews/4711 que revise o artigo que está lá para a ICLR."
- "Por que minha sessão confidencial não consegue pesquisar na web, e o que ainda funciona nela?"
- "Mostre por que os pesos de atenção somam 1, com as equações e um exemplo numérico."
- "Faça um gráfico da aba Vendas da minha planilha Números da loja por mês, uma linha por região, e mantenha-o atualizado."
- "Por que minha nova sessão perguntou se devia criar primeiro a memória do projeto, e o que acontece se eu escolher Começar agora?"
