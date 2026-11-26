# Primeiros passos

Este tópico apresenta o Hydor: o que ele é, o que há na tela, como começar sua primeira sessão, como encontrar qualquer coisa com a caixa de pesquisa e como usar o app no celular. No final, reúne todos os atalhos de teclado em uma tabela.

![O app: a barra de ícones com as ferramentas e a barra lateral com suas sessões à esquerda, e a página inicial, onde você diz o que quer que seja feito](images/start.webp)

## O que é o Hydor

O Hydor executa agentes de IA no seu próprio computador, e você os usa de qualquer navegador, na sua mesa ou no celular. Um agente é um programa que trabalha em uma tarefa para você: ele lê e escreve arquivos, executa comandos, pesquisa na web e conta o que fez. Você pode usar o Claude Code e o Codex com suas próprias assinaturas, o Custom (o agente do próprio app, que funciona com qualquer modelo, inclusive modelos abertos no seu computador) e outros agentes, como o Gemini CLI ou o OpenCode. Cada conversa com um agente é uma **sessão**. As sessões continuam em execução quando você fecha a página, então você pode começar uma na sua mesa e respondê-la pelo celular. Muita gente o usa para programar, mas ele ajuda em qualquer coisa: pesquisa, redação, documentos, planejamento e tarefas do dia a dia.

## Conheça a tela

A tela tem três partes: a **barra de ícones**, uma faixa estreita de ferramentas na extrema esquerda; uma **coluna** ao lado dela em algumas páginas, a **barra lateral** com suas sessões na página inicial e dentro de uma sessão, ou a lista própria de Apps, Agentes, Ajuda ou Configurações; e a página em que você está (a página inicial, uma sessão, Configurações…). Em um computador, a barra de ícones está sempre presente. No celular não há barra de ícones: a barra lateral é uma gaveta que desliza para dentro e também reúne as ferramentas (veja [Use o app no celular](#use-the-app-on-a-phone)).

Em um computador, você pode deixar a coluna mais larga ou mais estreita, de 180 a 560 pixels: arraste a borda direita dela, ou clique na borda e pressione as setas para a esquerda e para a direita. A largura é a mesma para todas as colunas e fica salva neste navegador.

### A barra de ícones

A barra de ícones é uma coluna de ícones; aponte para um deles, ou vá até ele com Tab, e uma dica ao lado mostra o nome e, quando houver, o atalho. O ícone da página em que você está fica aceso, com uma barra na cor de destaque na borda da tela ao lado dele. De cima para baixo:

- **Sessões**: mostra suas sessões na barra lateral. Enquanto você está na página inicial ou em uma sessão, ela oculta ou mostra a barra lateral (o mesmo que Ctrl+B). Em qualquer outra página, ela mostra a barra lateral e leva você de volta à sessão que você abriu por último nesta janela, ou à página inicial quando não havia nenhuma. Enquanto a barra lateral está oculta, um pontinho nesse bloco indica que algo aconteceu em outra máquina (veja [Alternar entre máquinas](/guide/devices#switch-between-machines)).

Depois, as seções do app (o app para computador tem sete; o app web e o celular têm seis, sem o **Navegador**):

- **Navegador**: um navegador só seu, apenas no app para computador, com abas, abas privadas, uma barra de endereço inteligente, tradução de páginas, modo leitura, favoritos, histórico, um bloqueador de anúncios e extensões do Chrome, a partir do qual você pode passar uma página para um agente. Veja [Seu próprio navegador](/guide/web#your-own-browser).
- **Projetos**: cada projeto como um cartão, com o que ele guarda e quando trabalhou pela última vez; um clique em um cartão abre os detalhes do projeto. Veja [Encontre todos os seus projetos](/guide/projects#find-all-your-projects).
- **Arquivos**: os arquivos deste computador, para navegar, abrir e editar. Veja [Abrir a página Arquivos](/guide/files-git#open-the-files-page).
- **Agentes**: seus agentes, cada um com o que faz, onde e quando trabalha, com o que pensa e a quem pergunta, além dos que já vêm com o app. Veja [Agentes](/guide/agents).
- **Apps**: tarefas que você executa várias vezes: preencha um formulário e um agente faz o trabalho. Veja [Apps](/guide/apps).
- **Git**: seus repositórios, suas alterações, branches e histórico, com um tour curto na primeira vez que você abre a página. Veja [Ver seus repositórios na página Git](/guide/files-git#see-your-repositories-on-the-git-page).
- **Experimentos**: tarefas de treinamento e avaliação que esperam uma GPU livre, executam sozinhas e ficam guardadas como registros, com um tour curto na primeira vez que você abre a página. Veja [Experimentos](/guide/experiments).

Logo abaixo, sempre no mesmo lugar:

- **Caixa de entrada**: tudo o que está esperando por você, como aprovações, perguntas e formulários, de todas as sessões, tarefas agendadas e máquinas. Um número no canto indica quantas coisas esperam por você agora. Veja [Caixa de entrada e notificações](/guide/inbox).
- **Pesquisa**: abre a caixa de pesquisa (o mesmo que Ctrl+K).

Depois, após um espaço, as ferramentas:

- **Uso**: quanto dos limites de cada plano você usou e quando eles são renovados, com as abas **Atividade** e **Arena**; uma barra fina sob o ícone mostra quanto resta nas suas assinaturas pagas, ou nas gratuitas quando você não tem nenhuma paga, e fica vermelha quando não resta nada. Veja [Uso, limites e custos](/guide/usage).
- **Sistema**: este computador, com uma aba para cada uma de suas ferramentas: **Visão geral** (como ele está e o que as ferramentas dele guardam agora), **Terminal** (shells que continuam em execução quando você sai da página), **Prévia** (o servidor de desenvolvimento de um app web em execução aqui; apenas nas páginas desta própria máquina) e **Monitor** (processadores, placas de vídeo, memória, discos e os programas mais ativos, ao vivo). Veja [Arquivos, Git, Terminal e Prévia](/guide/files-git).
- **Configurações**: tudo o que o app pode configurar. Um ponto nele indica que há uma versão mais nova. Veja [Todas as configurações](/guide/settings).
- **Ajuda**: abre este guia, onde você também pode perguntar a um agente sobre o app. O tour de boas-vindas também começa por lá.

As seções vêm na ordem Navegador, Projetos, Arquivos, Agentes, Apps, Git, Experimentos, depois Caixa de entrada e Pesquisa, e as ferramentas abaixo delas na ordem Uso, Sistema, Configurações, Ajuda: essa é a ordem padrão. Para mudá-la, arraste um bloco para outro lugar dentro do seu próprio grupo (as seções, ou as ferramentas na parte de baixo); a Caixa de entrada e a Pesquisa ficam logo abaixo das seções. Um bloco que uma versão mais nova traz ocupa o lugar padrão dele na ordem que você definiu (Arquivos logo antes de Agentes, por exemplo), e não o fim da lista. Os blocos mantêm a ordem que você definiu em todos os dispositivos, em qualquer máquina que você olhar. Depois de movê-los, clique com o botão direito em um bloco e escolha **Voltar à ordem padrão** para colocar todos de volta. Em uma janela baixa demais para todos os blocos, a barra de ícones rola.

A barra lateral com suas sessões aparece apenas na página inicial, em uma sessão e na revisão dela. **Apps**, **Agentes**, **Ajuda** e **Configurações** têm uma coluna do mesmo tipo, com o logotipo, a lista própria (os lugares da página Apps e da página Agentes, os tópicos do guia, as seções das Configurações) e **Ocultar barra lateral**; a página **Navegador** mostra suas abas em uma coluna própria, e as outras páginas (Projetos, Caixa de entrada, Uso, Sistema…) usam toda a largura. **Ctrl+B** oculta ou mostra a coluna da página em que você está, e todas as colunas têm a mesma largura. Uma coluna que guarda mais do que cabe mostra sua barra de rolagem, e o rodapé dela esmaece enquanto há mais conteúdo abaixo. Enquanto a página se reconecta ao app, um ícone de Wi-Fi riscado aparece ao lado do logotipo no alto da coluna, ou no alto da barra de ícones quando nenhuma coluna está visível (ela está oculta, ou a página não tem uma).

### A barra lateral

A barra lateral é a coluna ao lado da barra de ícones. Ela contém:

- O logotipo **HYDΩR**, com o botão **Filtrar e agrupar sessões** e **Ocultar barra lateral** (Ctrl+B) no final. Enquanto a barra lateral está oculta, o botão no canto superior esquerdo da página a mostra de novo, e a barra de ícones continua lá. No celular, a gaveta tem aqui o logotipo, a caixa de entrada, o botão de filtro e **Fechar menu**.
- Um seletor de máquinas, só depois que você adicionar outras máquinas em [Configurações → Máquinas](/settings?s=machines). Ele mostra o nome da máquina que você está vendo e diz o que aconteceu nas outras: um número em uma pílula na cor de destaque para as sessões de lá que terminaram desde a sua última visita, e um ponto laranja quando há sessões lá que precisam de você. Veja [Celulares, outras máquinas e compartilhamento](/guide/devices).
- **Nova sessão** abre a [página inicial](#the-start-page).
- Para encontrar uma sessão, use a caixa de pesquisa: **Pesquisa** na barra de ícones (no celular, **Pesquisa** entre as ferramentas na parte de baixo da gaveta), ou Ctrl+K (⌘K em um Mac). Ela encontra sessões pelo título, pela pasta, pelo agente com que foram iniciadas (digite Tutor para encontrar as sessões iniciadas como Tutor; Geral fica de fora) e pelas palavras ditas nelas, inclusive sessões arquivadas, marcadas como **Arquivada** e listadas depois das outras (veja [Pesquise tudo com Ctrl+K](#search-everything-with-ctrlk)).
- O botão de filtro no cabeçalho (**Filtrar e agrupar sessões**) reduz a lista. O menu dele tem seções: **Agente** (**Todos os agentes** e, em seguida, os agentes com que suas sessões foram começadas, os mais usados primeiro, até oito, cada um com a quantidade de sessões; a seção aparece depois que alguma sessão for começada como um agente), **Executa em** (um seletor com **Qualquer**, **Claude Code** e **Codex**) e, quando você já tem projetos, **Projeto** (**Todos os projetos** e, em seguida, até oito dos seus projetos). **Novo projeto…** cria um projeto, e **Nova pasta…** (exibido enquanto a lista está agrupada) cria uma pasta para sessões (veja [Organizar sessões em pastas](#sort-sessions-into-folders)). Os filtros funcionam em conjunto, como as sessões de um agente em um projeto. O botão assume a cor de destaque enquanto há um filtro ativado, e uma etiqueta para cada filtro ativado aparece sob **Nova sessão**, com ícone e nome: o × dela volta a mostrar todas as sessões para aquele filtro. Uma lista filtrada sem nada mostra “No sessions match the filter.” e oferece **Mostrar todas as sessões**. A última linha, **Agrupar por pasta ou projeto**, ativa ou desativa os grupos dos seus projetos e pastas (veja [A lista de sessões](#the-session-list)). Veja [Encontrar as sessões de um agente](/guide/agents#find-an-agents-sessions) e [Projetos e conhecimento](/guide/projects).

### A lista de sessões

Abaixo de **Nova sessão** estão todas as sessões, em grupos:

- **Ativas**: todas as sessões com atividade nos últimos cinco minutos, aqui, no VS Code ou em um terminal, incluindo as que já terminaram. Após cinco minutos sem atividade, elas voltam ao grupo de costume, mesmo que o agente delas continue aberto. As sessões paradas por um limite de uso ficam aqui enquanto estiverem programadas para retomar automaticamente; cancelar essa retomada restaura a regra dos cinco minutos. As sessões cujos agentes em segundo plano, comandos ou monitores ainda estão em execução também ficam aqui, por mais quietas que estejam, até que eles terminem. Elas mantêm suas posições enquanto estão na lista; arraste uma para movê-la.
- **Fixados**: as sessões que você fixou, na ordem em que você as arrastar. Arraste uma sessão dos grupos abaixo até ele para fixá-la. Clique no título para recolher o grupo; enquanto ele estiver recolhido, ao arrastar uma sessão aparece uma caixa **Solte aqui para fixar** sob o título, na qual você a solta.
- **Pastas**: as pastas que você mesmo criou para sessões que não estão em nenhum projeto, se tiver criado alguma (veja [Organizar sessões em pastas](#sort-sessions-into-folders)). Fica acima de **Projetos**.
- **Projetos**: um grupo para cada um dos seus projetos que tem sessões, e para cada pasta sua em que duas ou mais sessões trabalham, com o nome dela; o usado por último vem primeiro, até você colocá-los em uma ordem própria: arraste um grupo pelo título para outro lugar entre eles (no celular, primeiro mantenha o título pressionado por um instante). Essa ordem é a mesma em todos os dispositivos, e um grupo que você nunca moveu (um projeto criado depois) vem primeiro. Cada um mostra suas cinco sessões mais recentes; **Mostrar mais 12** (ou quantas houver) lista as demais, e **Mostrar menos** volta ao que era. As pastas do próprio projeto (veja [Organizar sessões em pastas](#sort-sessions-into-folders)) vêm primeiro, abaixo do título dele.
- **Hoje**, **Ontem**, **Esta semana**, depois nomes de meses e anos: as demais, conforme a última atividade.
- **Adiadas**: no final, até chegar a hora delas.

Só as pastas que você escolheu têm um grupo. A pasta pessoal, a pasta padrão, as novas pastas de tarefa, as pastas em que os apps são executados e as pastas temporárias não têm, então as sessões delas vão por dia. Uma sessão em um worktree vai no grupo da pasta a partir da qual o worktree foi criado, e qualquer sessão que trabalhe na pasta de um projeto, ou em uma pasta dentro dela, vai no grupo do projeto, onde quer que tenha sido iniciada: no Hydor, no Claude Code ou no Codex. Uma pasta de um projeto do Codex aparece com o nome do projeto. As pastas que o app do Codex cria para os seus projetos do ChatGPT são nomeadas apenas por um id, então, a menos que o Codex saiba o nome do projeto, elas também ficam sem grupo, e as sessões delas mostram **Projeto do ChatGPT** como pasta. Dê um nome a uma delas com **Renomear pasta** no menu de uma das sessões dela, e ela ganha um grupo com esse nome. Duas pastas com o mesmo nome aparecem com tantas das pastas acima delas quantas forem necessárias para diferenciá-las (“client/app”, “server/app”).

Em **Pastas** e **Projetos**, a lista é uma árvore: todo título começa com uma seta (clique nela para recolher), as sessões de um projeto ou pasta ficam recuadas abaixo do título, ao longo de uma linha fina, e um título recolhido mostra na ponta direita quantas sessões contém. Os títulos **Ativas**, **Fixados**, **Pastas** e **Projetos** podem ser recolhidos: clique em um deles para esconder tudo o que está abaixo, e clique de novo para mostrar. Recolhidos, **Ativas** e **Fixados** mostram quantas sessões contêm, além de um ponto quando uma delas terminou desde a última vez que você olhou. A sessão que está aberta continua à vista abaixo do título, mesmo com a seção recolhida. Eles ficam como você os deixou neste computador, com exceção do estado de cada projeto ou pasta dentro de **Projetos**. O **+** no fim do título **Projetos** está sempre à vista: **Novo projeto…**, **Novo grupo de projetos…** (veja [Criar um projeto](/guide/projects#make-a-project)) e **Nova pasta…**.

Clique no título de uma pasta para recolhê-la em uma única linha, com o número de sessões que ela contém e um ponto quando uma delas terminou desde a última vez que você olhou; clique de novo para abri-la. O título de um projeto funciona de outro jeito: clique no nome para abrir os detalhes em uma janela (veja [Abrir os detalhes de um projeto](/guide/projects#open-a-projects-details)), e use a seta antes do nome para recolher as sessões. Cada grupo começa recolhido, mostrando o título e quantas sessões contém; abra os que quiser, e eles ficam como você os deixou. A sessão aberta continua à vista no grupo dela, recolhido ou não. O modo como você recolhe os grupos fica guardado neste navegador. Os botões no fim de um título (no computador, sobre a ponta do título quando você passa o mouse; em uma tela de toque, estão sempre lá) são a caneta, que começa uma nova sessão naquela pasta ou projeto, e o **⋯**, que abre o menu (um clique com o botão direito no título também abre): em um projeto, **Detalhes do projeto**, **Renomear** e **Nova pasta**; em uma pasta do seu computador, **Renomear**, **Usar o nome da própria pasta** (depois que você a tiver renomeado), **Transformar em projeto** e **Abrir em Arquivos**. Para renomear uma pasta, você também pode clicar duas vezes no nome: digite o novo e pressione Enter (Esc deixa como estava). Um projeto é renomeado pelo ⋯ → **Renomear** dele (ou com um clique com o botão direito no título). O novo nome de um projeto passa a valer em todo lugar; o de uma pasta é como o app a chama, na barra lateral, abaixo de cada sessão e nos menus de pastas, em todos os dispositivos (a pasta em si mantém o nome no disco). Apague o nome para que a pasta volte a usar o próprio.

As sessões que você teve no Claude Code ou no Codex fora do Hydor (no VS Code, em um terminal, no app de desktop do Claude ou no app do Codex) também aparecem na lista. As pastas em que você trabalha com eles viram projetos automaticamente (veja [Projetos encontrados no Claude Code e no Codex](/guide/projects#projects-found-in-claude-code-and-codex)), então o grupo delas é o do projeto, com a marca do Claude Code ou do Codex depois do nome (ou as duas). Uma pasta cujas sessões vieram de fora, mas que não é um projeto (ela tem uma sessão de fora, ou o Hydor a deixou de lado), mantém o grupo de pasta, como qualquer outra pasta. Uma pasta cuja primeira sessão foi iniciada fora do Hydor mostra de onde vieram as sessões dela: a marca do Claude Code ou do Codex depois do nome, ou as duas quando ela tem sessões de cada um. Aponte para o nome, ou abra o **⋯** do título, para ver os apps em que elas foram iniciadas, como **From Codex: VS Code, Terminal**, com o nome da conta quando estiverem em uma que você adicionou em [Configurações → Agentes → Contas](/settings?s=accounts&find=Accounts). A marca permanece quando você continua trabalhando ali a partir do Hydor: ela indica onde o trabalho da pasta começou.

Para listar as sessões só por dia, como antes, desmarque **Agrupar por pasta ou projeto** no menu do botão de filtro, ou procure **Agrupar sessões por pasta ou projeto** na caixa de busca; para voltar, faça o mesmo. Enquanto a lista mostra um único projeto, as sessões dele vão por dia.

As sessões arquivadas não aparecem na lista, mas a caixa de busca (Ctrl+K) ainda as encontra, marcadas como **Arquivada**. “Nenhuma sessão ainda.” aparece antes da sua primeira.

Cada linha mostra o ícone do agente com um ponto de status, o título da sessão e uma segunda linha. Enquanto o agente trabalha, a segunda linha diz o que ele está fazendo (“Working · 2m 10s”, com o tempo total trabalhado após turnos anteriores, “Working · 2m 10s (47m)”; “Needs you”, “Ready”, “Working · 1 in background”, “Open in VS Code”). Fora isso, ela mostra a pasta (“Home folder” para a sua), há quanto tempo a sessão esteve ativa e quantas linhas foram adicionadas e removidas. Uma sessão iniciada como um agente diferente do habitual (o agente próprio do projeto, para uma sessão em um projeto que tenha um, e Geral para todas as outras sessões) começa a segunda linha com o ícone e o nome desse agente: “Planejador · web-agent · 5d” quando parada, “Pesquisador · Working · 2m 10s” enquanto trabalha. O agente habitual, as sessões iniciadas fora do Hydor e um agente que você excluiu depois não são nomeados, então a maioria das linhas fica como antes: em um projeto cujo agente próprio é o Programador, as sessões do Programador não são nomeadas, mas uma sessão do Pesquisador é, e uma do Geral também. Em **Projetos**, onde o nome do grupo já indica a pasta, uma linha ocupa uma só linha: o título e depois há quanto tempo a sessão esteve ativa (após o branch de um worktree), ou o que o agente está fazendo enquanto trabalha ou precisa de você; uma sessão iniciada como um agente diferente do habitual mantém ali uma segunda linha, que o nomeia (“Planejador · 5d”). Pequenas marcas podem vir depois do título:

- um ponto na cor de destaque: a sessão terminou desde a última vez que você olhou (a segunda linha diz “Done · 5m ago”); abri-la a marca como lida em todos os dispositivos;
- um selo de pull request com o estado dela;
- um alvo: a sessão tem uma meta;
- um alfinete: ela está fixada (no grupo **Fixados**, que já indica isso, não aparece).

Enquanto o Custom trabalha ou inicia, o indicador de atividade dele usa a animação de carregamento do Hydor (água subindo e descendo no Ω) em vez de um ícone de agente giratório. As marcas de carregamento ficam centralizadas na vertical ao lado do texto.

O ponto de status indica como está uma sessão:

| Ponto | O que significa |
| --- | --- |
| Azul, pulsando | Trabalhando: um turno está em execução, ou tarefas em segundo plano estão |
| Âmbar | Precisa de você: uma aprovação, uma pergunta ou um formulário está esperando |
| Verde | Pronta: o agente está em execução e aguarda sua próxima mensagem |
| Cinza | Aberta no VS Code ou em um terminal, e parada lá |
| Sem ponto | Parada: o agente não está em execução; sua próxima mensagem o inicia de novo |

A aba do navegador mostra quantas sessões esperam por você, como em “(2) Hydor”.

Os subagentes, as sessões que um agente iniciou para partes do trabalho dele (subagentes do Hydor) e as que o programa dele executou dentro da sessão (os próprios do Claude Code e do Codex), ficam recolhidos sob ele enquanto trabalham ou esperam por você, com uma linha como “3 subagents · 1 needs you”; clique nela para vê-los. Quando um termina, ele sai da barra lateral, a menos que você o tenha aberto: ele continua no cartão de subagentes na conversa e na linha acima da caixa de mensagem. Veja [Subagentes](/guide/sessions#subagents).

Cada sessão tem um menu na lista: passe o mouse sobre a linha e clique em **⋯** no final, ou clique na linha com o botão direito (no celular, toque no **⋯** dela). O menu contém **Renomear**, **Renomear pasta** (para uma sessão que não está em um projeto), **Mover para pasta** (veja [Organizar sessões em pastas](#sort-sessions-into-folders)), **Fixar** (ou **Desafixar**), **Adiar**, **Resolver**, **Arquivar** e **Excluir**, que pede confirmação antes. Clique duas vezes em um título, ou pressione F2 em uma linha selecionada, para renomear. Tudo isso é explicado em [Renomear, fixar, adiar, resolver, arquivar ou excluir](/guide/sessions#rename-pin-snooze-settle-archive-or-delete).

### Organizar sessões em pastas

As pastas são suas, para organizar as sessões do jeito que você pensa nelas: “Viagens”, “Impostos”, “Para ler”. Elas existem apenas na barra lateral: nada muda no seu computador, e todos os dispositivos mostram as mesmas. Não confunda com as pastas do computador em que suas sessões trabalham, que ganham um grupo próprio em **Projetos**.

Uma pasta pode ser de dois tipos:

- **Fora de qualquer projeto**: aparece na seção **Pastas**, acima de **Projetos**, e recebe sessões que não estão em nenhum projeto.
- **Dentro de um projeto**: aparece abaixo do título desse projeto, antes das outras sessões dele, e recebe as sessões desse projeto.

Para criar uma:

- Clique no **+** do título **Pastas**, ou no **+** do título **Projetos** → **Nova pasta…**. Isso cria uma pasta fora de qualquer projeto.
- Para uma pasta dentro de um projeto, abra o menu **⋯** do projeto na barra lateral → **Nova pasta**.
- Abra o menu de uma sessão (⋯ ou clique com o botão direito) → **Mover para pasta** → **Nova pasta…**: a pasta é criada e a sessão vai para dentro dela (o botão diz **Criar e mover**). Em um projeto, ela é criada dentro desse projeto.
- O menu do botão de filtro (**Filtrar e agrupar sessões**) também tem **Nova pasta…**, enquanto a lista está agrupada.

Dê um nome a ela (até 60 caracteres; duas pastas no mesmo lugar não podem ter o mesmo nome) e pressione **Criar**.

Para colocar uma sessão em uma pasta, abra o menu dela → **Mover para pasta** e escolha a pasta; aquela em que a sessão está aparece marcada, e **Tirar da pasta** a retira de lá. Ou arraste a sessão até o título da pasta (no celular, primeiro mantenha a sessão pressionada por um instante para pegá-la). Uma sessão fica em no máximo uma pasta, e uma sessão de um projeto só pode ir para as pastas desse projeto.

O título de uma pasta a recolhe, como qualquer outro título; as pastas começam recolhidas e mostram quantas sessões contêm. As pastas são ordenadas pelo nome. Clique duas vezes no nome, ou abra o **⋯** dela → **Renomear**, para renomear uma pasta. **⋯** → **Excluir pasta** a exclui: as sessões dela não são excluídas, continuam na lista onde estavam (há um pedido de confirmação quando a pasta contém alguma). Excluir um projeto remove as pastas dele do mesmo modo; as sessões continuam.

Uma sessão que está trabalhando ou fixada continua aparecendo em **Ativas** ou **Fixados**, e depois volta para a pasta dela. As pastas só aparecem enquanto **Agrupar por pasta ou projeto** está ativado no menu do botão de filtro.

### A página inicial

**Nova sessão** abre a página inicial. Ela pergunta “What should we work on?”, diz “Ask for anything: research, documents, plans, code.” e tem uma caixa de mensagem grande com uma fileira de opções embaixo:

- **Executa em**: o programa que faz o trabalho (Claude Code, Codex, Custom ou outro agente que você adicionou).
- **Modelo**: o modelo desse agente.
- **Pasta**: onde o agente trabalha, ou um projeto, ou uma nova pasta criada para a tarefa.
- **Agente**: como a sessão trabalha (Geral, Pesquisador, Redator, Programador, Tutor, Planejador, Analista, Criador de apps, ou um dos seus; veja [Agentes](/guide/agents)).
- **Opções**: esforço, permissões, memória, um limite de gastos e mais. O chip mostra o nome de qualquer uma que você tenha definido diferente do habitual.

No computador, uma linha sob a caixa lembra: “Enter to start · Shift+Enter for a new line”. Quando o plano de um agente esgotou o uso, um aviso acima da caixa informa isso e quando ele será renovado.

Quando algo aconteceu desde a sua última visita, **Enquanto você estava fora** aparece sob a caixa em uma linha: o que terminou, o que espera por você, o que foi executado sozinho e o que será executado em seguida (veja [Enquanto você estava fora](#while-you-were-away)). Quando nada aconteceu, ela não aparece.

Enquanto a caixa está vazia, as **ideias para começar** ficam sob ela: três exemplos de pedidos, dois dos seus apps e uma automação.

- Clique em um exemplo para colocá-lo na caixa. Mude como quiser e depois envie: nada é enviado até que você envie. Onde diz “…”, entram as suas próprias palavras. Os exemplos mudam a cada dia e, em uma pasta com código, são sobre código.
- Clique em um app para abrir o formulário dele: os dois apps que você mais executa, ou **Relatório de pesquisa aprofundada** e **Planejador de viagens** até você executar alguns (veja [Apps](/guide/apps)).
- Clique na automação (“Every Monday at 8:00, send me …”) para colocá-la na caixa: complete e envie, e o agente a configura como uma [tarefa agendada](/guide/tasks).

As ideias somem assim que você digita. **Ocultar** as guarda para sempre, em todos os dispositivos; ative [Ideias para começar](/settings?s=general&find=Starter%20ideas) em Configurações → App → Geral para trazê-las de volta. No celular, elas são uma única fileira que você rola para o lado.

Abaixo delas, **Hoje** resume o dia em uma linha: “Today · 7 sessions · 12 file edits · $0.84”, omitindo a parte que for zero. O valor é quanto os tokens do dia custariam pelos preços da API, a mesma estimativa de **Custo da API (est.)** na página Atividade: em um plano (Claude Code, Codex), você paga a mensalidade do plano. Passe o mouse sobre a linha para ver as linhas alteradas, os tokens e os prompts; clique nela para abrir a página Atividade. No celular, **Recentes** lista as seis sessões mais recentes sob a caixa.

No canto superior direito, **Explorar** abre uma revista feita para você: artigos e notícias recentes sobre o que você faz e o que lhe interessa, escolhidos a partir do seu perfil e das suas sessões mais recentes (veja [Explorar](/guide/apps#explore)). Um ponto nele significa que há uma nova edição pronta que você ainda não abriu.

A página inicial guarda suas escolhas separadamente para cada projeto, cada pasta e **Nova pasta de tarefa**, de modo que um projeto pode abrir com seu próprio programa, modelo e agente (veja [O que a página inicial lembra](/guide/sessions#what-the-start-page-remembers)). Tudo na página inicial é explicado em [Começar uma sessão](/guide/sessions#start-a-session).

### Enquanto você estava fora

Ao voltar para o app, você vê em um só lugar o que aconteceu enquanto esteve fora, abaixo da caixa de mensagem da página inicial (acima das ideias para começar). Ela fica recolhida em uma linha, com o que mais importa primeiro, como "1 precisa de você · 1 falhou · 3 concluídas · próxima: Resumo da manhã às 07:30 · Desde ontem às 18:40", omitindo a parte que for zero. Clique na linha para abri-la, ou clique em uma de suas partes: **precisa de você**, **falhou** ou **concluídas** abre só esses itens (**Mostrar tudo** traz de volta o resto), **próxima** abre as tarefas agendadas, e o horário mostra tudo. No celular, a linha inteira é um único botão que a abre, e o horário fica no cabeçalho do bloco aberto.

Aberta, ela mostra até seis linhas, as mais importantes primeiro (**Mostrar … mais** lista o restante):

- **Precisa de você**: aprovações, perguntas, formulários, chamadas retidas na Caixa de saída e qualquer outra coisa esperando por você, como na [caixa de entrada](/guide/inbox). Uma aprovação, uma pergunta, um formulário ou uma chamada retida tem **Responder aqui**, que abre o próprio cartão da caixa de entrada sob a linha; clique em qualquer outra linha para ir até onde ela espera.
- **Concluído** e **Falhou**: sessões que terminaram desde a sua última visita e que você não abriu desde então, cada uma com o início da última resposta (ou o que deu errado) e os arquivos que ela criou. Clique em um arquivo para abri-lo em Arquivos, ou na linha para abrir a sessão. Uma sessão cujo turno terminou enquanto subagentes ou tarefas em segundo plano que ela iniciou ainda estão em execução não terminou: ela aparece aqui quando eles acabarem.
- **Executadas sozinhas**: execuções das suas [tarefas agendadas](/guide/tasks), das agendas dos seus agentes e dos seus apps (iniciadas pela página Apps, por um link, pela API ou por um app de chat), cada uma com o resultado (**Concluído**, **Falhou** ou **Nada novo**) e quanto custou. Clique em uma para abrir a sessão em que ela foi executada, ou a execução do app.
- **Próximas hoje**: as tarefas agendadas previstas para mais tarde hoje, abaixo das linhas.

Ela continua recolhida até você abri-la, mesmo quando algo precisa de você. Aberta ou recolhida, ela fica como você a deixou neste dispositivo. **Marcar tudo como visto** a limpa: o que ela lista passa a contar como visto, e as sessões nela como abertas, em todos os dispositivos (os pontos delas na barra lateral também somem). O que acontecer depois disso aparece de novo. Execuções que não encontraram nada novo, e o que será executado em seguida, nunca a fazem aparecer por conta própria.

Sua última visita é o fim da última vez em que o app ficou aberto, em primeiro plano e em uso por mais de um minuto, em qualquer um dos seus dispositivos: uma visita pelo celular conta também no computador. Recarregar a página, ou uma espiada de menos de um minuto, não a move, e uma janela deixada aberta enquanto você está longe do computador não conta. Abrir uma sessão a marca como vista, como antes. Até a sua primeira visita, ela olha um dia para trás. A página inicial de outra máquina (Configurações → Máquinas) mostra a dessa máquina; uma com uma versão mais antiga do Hydor não mostra nada.

Em um terminal, `hydor away` lista o mesmo e `hydor away seen` a limpa (veja [Hydor em um terminal](/guide/terminal)).

## Comece sua primeira sessão

1. Confirme que o agente pode trabalhar. O Claude Code e o Codex precisam que você esteja conectado: abra [Configurações → Agentes → Contas](/settings?s=accounts&find=Accounts), encontre o grupo **Contas**, pressione **Entrar** ao lado do agente e siga os passos (você abre um link, aprova e cola ou digita um código). O Custom precisa de um modelo: adicione um em [Configurações → Agentes → Modelos](/settings?s=models). O tour de boas-vindas faz isso com você na primeira vez. Veja [Agentes, contas e modelos](/guide/agents-models).
2. Pressione **Nova sessão** no topo da barra lateral. O app abre na página inicial também.
3. Pressione **Executa em** sob a caixa de mensagem e escolha o programa. **Modelo**, ao lado, escolhe o modelo dele; o marcado como "padrão" serve para começar.
4. Pressione **Pasta** e escolha onde o agente trabalha:
   - um projeto, em **Projetos**, para trabalhar na pasta desse projeto, com seus documentos e diretrizes;
   - uma das pastas que você usou por último, em **Pastas**, ou outra: **Procurar** nas suas pastas, ou digite o nome ou o caminho de uma pasta em **Procure um projeto ou pasta, ou digite um caminho**;
   - **Nova pasta de tarefa**, para uma pasta nova com o nome da sua tarefa (em `~/Hydor`, a menos que você mude isso em [Configurações → Recursos → Seus agentes](/settings?s=assistants&find=Task%20folders)).

   A maioria dos agentes começa em uma nova pasta de tarefa se você não escolher uma pasta; o Programador trabalha na pasta que você escolher.
5. Digite na caixa de mensagem o que você quer que seja feito: descreva uma tarefa ou faça uma pergunta. Adicione arquivos com o clipe de papel, ou solte-os na caixa. Arquivos que já estão neste computador podem vir da página Arquivos: **Começar uma sessão com ele** no menu de um arquivo (veja [Comece uma sessão com arquivos](/guide/files-git#start-a-session-with-files)).
6. Pressione Enter, ou **Início**. No celular, toque na seta redonda.

A sessão abre. Você vê os passos do agente enquanto ele trabalha, em palavras simples, e a resposta dele no final. Quando ele quer executar um comando ou alterar um arquivo que as permissões dele não permitem por conta própria, um cartão pede que você escolha **Permitir** ou **Recusar**. Digite na caixa de mensagem na parte de baixo para continuar a conversa. Suas escolhas na página inicial ficam para a próxima sessão, em todos os dispositivos.

Próximo: [Sessões](/guide/sessions) explica tudo o que você pode fazer em uma sessão.

## Pesquise tudo com Ctrl+K

A caixa de pesquisa encontra qualquer coisa no app enquanto você digita, como o Spotlight em um Mac. Abra-a com Ctrl+K (⌘K em um Mac) de qualquer página, exceto enquanto você digita em um editor de código ou em um terminal. O bloco **Pesquisa** na barra de ícones (no celular, **Pesquisa** entre as ferramentas na gaveta) também a abre. Pressione Ctrl+K de novo, ou Esc, para fechá-la.

### O que ela encontra

- **Ir para**: as páginas do Hydor, como Nova sessão, Caixa de entrada, Arquivos, Buscar em arquivos, Git, Experimentos, Terminal, Apps, Novo app, Projetos, Conhecimento compartilhado, Publicados, Prévia, Uso e limites, Arena de modelos, Atividade, Sistema e Configurações.
- **Ações**: Fazer o tour, O que o Hydor pode fazer, Conversar com mãos livres, Notas de versão, Alternar entre claro e escuro, Mostrar ou ocultar a barra lateral, Agrupar sessões por pasta ou projeto, Mostrar ou ocultar o painel do terminal.
- **Configurações**: todas as seções das Configurações e as opções nelas. Abrir uma abre a seção e aponta para a opção.
- **Temas**: os temas internos e os seus. Abrir um muda para ele.
- **Sessões**: por título, pasta, branch, primeira mensagem e o agente com que começaram (o Geral fica de fora, já que a maioria das sessões é dele), inclusive as arquivadas, marcadas como **Arquivada** e depois das outras. Abrir uma a abre. A prévia dela lista o **Agente**.
- **Nas mensagens**: mensagens que contêm as palavras que você digitou. Abrir uma abre a sessão nessas palavras, com a barra de busca pronta.
- **Memória**: suas notas de memória. Abrir uma abre Configurações → Memória nessa nota.
- **Projetos**: seus projetos, por nome e descrição. Abrir um abre os detalhes do projeto: na seção **Projetos**, a própria página dele; em qualquer outro lugar, uma janela sobre a página em que você está.
- **Apps**, **Tarefas agendadas**, **Agentes**, **Habilidades**, **Páginas**, **Imagens, vídeos e áudio** e **Conexões**: os seus e os prontos. Cada um abre onde ele fica.
- **Arquivos**: até cinco arquivos cujos nomes combinam, na pasta que a página Arquivos mostra (ou na pasta padrão do app).
- **Histórico**, **Favoritos** e **Downloads**: no app para computador, as páginas que você visitou no seu próprio [navegador](/guide/web#your-own-browser), seus favoritos e os arquivos que ele baixou. Eles combinam pelas palavras e, com a [Busca por significado](/settings?s=memory&find=Search%20by%20meaning) ativada, pelo assunto, mesmo quando as palavras são diferentes. Abrir uma página a abre em uma nova aba da página **Navegador**; abrir um download mostra o arquivo na pasta dele. Eles ficam neste computador, os agentes nunca os recebem, e a caixa não se lembra do que você digitou para encontrá-los.

### Escolha onde ela procura

**Buscar em**, no fim do campo, diz onde a caixa procura: **Em todos os lugares** até você escolher lugares. Clique nele para ver a lista: **Sessões**, **Mensagens** (as palavras ditas nas sessões), **Projetos**, **Arquivos mantidos** (as páginas, imagens, vídeos e sons que os agentes fizeram e você manteve), **Apps**, **Arquivos**, **Memória**, **Tarefas agendadas**, **Agentes**, **Habilidades**, **Conexões**, **Configurações** (com os temas), **Ir para e ações** (as páginas e ações do próprio app), **Guia** e, só no app para computador, **Navegador** (seu histórico, favoritos e downloads).

- Marque um ou mais, e a caixa procura só neles. O botão os nomeia ("Sessões, Arquivos mantidos", ou "3 lugares") na cor de destaque. Clique em um lugar de novo para tirá-lo, ou em **Em todos os lugares** para procurar em todos de novo.
- Sem nada digitado, ela lista o que os lugares escolhidos contêm, os que você mais usa primeiro: suas sessões, projetos e páginas recentes, as seções das Configurações, os tópicos do guia. Mensagens, notas de memória e arquivos esperam pelas suas palavras.
- O que você escolhe é mantido em todos os dispositivos até você mudar. Quando nada é encontrado, **Buscar em tudo** sob a mensagem procura em todos os lugares de novo.
- No celular, **Buscar em** é o ícone de filtro ao lado de **Cancelar** (ele nomeia os lugares quando você escolhe alguns), e a lista dele abre pela parte de baixo da tela.

### Como os resultados aparecem

- A **Melhor correspondência** vem primeiro. Depois, cada tipo tem seu próprio grupo de até quatro linhas; "Mais 3 em Sessões" mostra o restante.
- Imagens, vídeos, sons, páginas mantidas e arquivos aparecem com uma miniatura e seus detalhes: o que cada um é (uma imagem, um vídeo, um documento, slides, uma planilha, uma imagem PNG…), seu tamanho ou duração, onde está (algo mantido diz "Arquivos › nome do projeto", nos arquivos do projeto) e quando mudou pela última vez. A descrição de uma página vem em seguida.
- Em uma tela larga, uma prévia ao lado da lista diz mais sobre o resultado em que você está, e para onde abri-lo leva. Uma imagem ou uma página aparece maior ali (clique nela para abrir), e um vídeo ou um som toca ali mesmo.
- No celular, os resultados ocupam a tela, sem a prévia: cada linha diz o suficiente para distinguir os resultados e é grande o bastante para tocar.
- ↑ e ↓ movem, Enter abre. Esc limpa o que você digitou, e um segundo Esc fecha a caixa (com a lista de **Buscar em** aberta, o Esc fecha primeiro a lista).
- Sem nada digitado, ela lista **Sessões recentes** e **Sugestões**: os lugares que você mais usa (alguns úteis até ela conhecer você). Com lugares escolhidos em **Buscar em**, ela lista o que eles contêm.
- A linha de baixo diz **Palavras** ou **Palavras e significado**. Com a [Busca por significado](/settings?s=memory&find=Search%20by%20meaning) ativada (ela vem ativada, a menos que você a desative em Configurações → Recursos → Memória), os resultados também combinam com o que você quer dizer com outras palavras, e em outros idiomas.

### Ela aprende o que você usa

- O que você escolhe, com o que digitou. Digite as mesmas palavras de novo e esse resultado vem primeiro, na hora.
- Os lugares que você visita, seja como for que chegou a eles: páginas, seções das Configurações, sessões, apps, arquivos. Entre os resultados que combinam, os que você usa sobem, mais quanto melhor combinam com o que você digitou, e menos com o passar do tempo.
- O app guarda isso para você, então seu celular e seu computador aprendem juntos.

## Use o app no celular

Para acessar o app pelo celular, ele precisa de um endereço HTTPS. [Configurações → App → Usar no celular](/settings?s=phone) dá um a você em poucos cliques, de forma privada com o Tailscale: só os seus próprios dispositivos o acessam, e um código QR o abre no celular. Um túnel da Cloudflare ou o seu próprio proxy também funciona. Veja [Celulares, outras máquinas e compartilhamento](/guide/devices).

### Adicione à tela inicial

O app se instala como um app e abre em tela cheia:

- **iPhone ou iPad**: abra no Safari e depois Compartilhar → **Adicionar à Tela de Início**.
- **Android**: abra no Chrome e depois ⋮ → **Adicionar à tela inicial** (ou **Instalar app**).

Instalado no Android, ou com o Chrome ou o Edge em um computador, o Hydor também aparece na folha de compartilhamento: compartilhe uma foto, um arquivo ou um link de outro app com ele, e a página inicial abre com isso na caixa de mensagem. Veja [Compartilhe com o Hydor a partir de outros apps](/guide/devices#share-to-hydor-from-other-apps).

No iPhone ou iPad, as notificações só funcionam no app adicionado à tela inicial: abra-o por lá e depois ative [Notificar este dispositivo](/settings?s=notifications&find=Notify%20this%20device) em Configurações → App → Notificações. Veja [Caixa de entrada e notificações](/guide/inbox).

### A barra lateral é uma gaveta

- O botão **Menu** no canto superior esquerdo de cada página a abre. Ela ocupa a tela toda.
- As ferramentas, **Projetos** entre elas, ficam em uma grade na parte de baixo da gaveta.
- Tocar em uma sessão ou em uma ferramenta leva você até lá e fecha a gaveta. **Fechar menu** (o ×) também a fecha.
- Segure uma sessão por um instante para pegá-la e depois arraste (para reordenar as sessões ativas ou fixadas, ou para fixar uma).
- Segure uma ferramenta na parte de baixo por um instante para pegá-la e depois arraste-a para outro lugar entre elas.
- O **⋯** no fim de cada linha abre o menu da sessão: **Renomear**, **Renomear pasta**, **Fixar**, **Adiar**, **Resolver**, **Arquivo compactado** e **Excluir**, que pergunta antes.

### Os menus abrem como painéis

No celular, as opções sob a caixa de mensagem da página inicial (Executa em, Modelo, Pasta, Agente, Opções) abrem como painéis a partir da parte de baixo da tela, longe do teclado. O campo de busca do painel de pastas espera até você tocar nele, para que o teclado não cubra a lista.

### Digitar e enviar

- A página inicial lista suas seis sessões mais recentes sob a caixa de mensagem, como **Recentes**; **Todas as sessões** abre a gaveta.
- Enter começa uma nova linha. Toque na seta redonda para começar uma sessão ou enviar uma mensagem (com um teclado conectado, Ctrl+Enter ou ⌘Enter também envia).
- Em uma sessão, a caixa de mensagem mostra um chip com o modelo (e o esforço e as permissões quando não são os usuais). Ele abre um painel com **Modelo**, **Esforço**, **Permissões** e quanto do espaço da conversa está em uso, com **Compactar**.
- Para citar parte de uma resposta ou da sua própria mensagem, selecione-a: **Orçamento** aparece logo abaixo da seleção.
- **Detalhes** abre sobre a conversa, só quando você pede.
- A caixa de pesquisa ocupa a tela; **Cancelar** a fecha.
- O botão de captura de tela só existe em computadores.

## Atalhos de teclado

No Mac, use ⌘ onde esta tabela diz Ctrl, exceto em Ctrl+` e Ctrl+Space, que continuam Ctrl.

| Teclas | O que faz | Onde |
| --- | --- | --- |
| Ctrl+K | Abre ou fecha a caixa de busca | Em qualquer lugar, exceto ao digitar em um editor de código ou no terminal |
| Ctrl+B | Mostra ou oculta a coluna ao lado da barra de ícones: a barra lateral, ou a de Apps, de agentes, da Ajuda ou das Configurações (a barra de ícones permanece) | Em qualquer lugar no computador, exceto em um editor de código |
| Ctrl+` | Mostra ou oculta o painel do terminal na parte de baixo | No computador |
| Ctrl+P | Abertura rápida: vai até um arquivo por parte do nome, na pasta que a página Arquivos mostra | Em qualquer lugar |
| Ctrl+Z | Desfaz fixar, desafixar, arquivar, desarquivar ou adiar, em até 8 segundos | Fora dos campos de texto |
| Enter | Começa a sessão ou envia a mensagem | A página inicial e a caixa de mensagem (no celular: uma nova linha) |
| Shift+Enter | Uma nova linha | A caixa de mensagem |
| Ctrl+Enter | Enquanto o agente trabalha: o oposto de Enter (colocar na fila em vez de entrar na vez atual, ou o contrário). No celular: envia | A caixa de mensagem |
| Shift+Tab | Passa para o próximo modo de permissão | A caixa de mensagem, na página inicial ou em uma sessão |
| ↑ em uma caixa vazia | Traz de volta suas mensagens anteriores nesta sessão, uma a uma (↓ avança de novo) | A caixa de mensagem em uma sessão |
| Ctrl+S | Guarda o rascunho de lado; em uma caixa vazia, traz o rascunho de volta | A caixa de mensagem em uma sessão |
| @ | Lista os arquivos da pasta da sessão para você apontar um | A caixa de mensagem |
| / no início | Lista os comandos e as habilidades do agente (Claude Code) | A caixa de mensagem |
| ↑ ↓, Enter ou Tab, Esc | Percorrer, inserir ou fechar as listas de @ e /  | A caixa de mensagem |
| Ctrl+F | Procura texto nas mensagens desta sessão | Em uma sessão |
| Enter, Shift+Enter | Resultado anterior, resultado seguinte | A barra de busca |
| 1 a 9 | Escolhe uma opção da pergunta que o agente fez | Um cartão de pergunta, enquanto nenhum campo de texto estiver com o teclado |
| F2 | Renomeia a sessão selecionada | A lista de sessões da barra lateral |
| ↑ ↓, Enter, Esc | Mover, abrir, limpar e depois fechar | A caixa de busca |
| ↑ ↓, Enter, Tab | Mover, escolher, listar as pastas dentro | O menu de pastas na página inicial |
| Ctrl+S | Salva o arquivo | O editor de arquivos |
| Ctrl+Space, → | Lista sugestões de comandos; aceita a sugestão em cinza | Um terminal |

## Obter ajuda

**Ajuda** na barra de ícones (no menu lateral no celular) abre este guia. Em uma janela larga, ela tem uma coluna do mesmo tipo da barra lateral: o logotipo e **Ocultar barra lateral** em uma linha, depois **Início da Ajuda** e todos os tópicos, agrupados como a primeira página os agrupa, cada um com seu ícone e o tópico aberto marcado. A primeira página mostra então sua caixa, algumas perguntas que as pessoas costumam fazer e **O que o Hydor pode fazer** (abaixo). Em uma janela mais estreita ou no celular, os cartões da primeira página abrem os tópicos, e **Todos os tópicos** no alto de um tópico volta; em uma janela larga com a coluna oculta, os cartões também ficam na primeira página. Digite uma pergunta ou algumas palavras na caixa da primeira página:

- **Seções correspondentes** aparecem enquanto você digita; clique em uma para abri-la. A caixa de busca (Ctrl+K) também as encontra. Enquanto você digita, as perguntas e **O que o Hydor pode fazer** saem do caminho.
- **Pressione Enter** ou clique em **Perguntar**, e um agente responde em um painel ao lado do guia, com links para o lugar certo. Ele também pode alterar uma configuração ou configurar algo para você, depois que você confirmar a mudança em um cartão. A resposta é uma sessão comum, com o agente e o modelo que você escolheu por último na página inicial: pergunte mais no painel ou abra-a em uma página própria com a seta no alto do painel.

Abaixo da caixa, a primeira página tem **O que o Hydor pode fazer**, um cartão para cada coisa que as pessoas costumam deixar passar: **Trazer do ChatGPT ou do Claude**, **Apps**, **Crie seu próprio app**, **Cartões de resposta**, **Sugestões de palavras**, **Documentos, slides e planilhas**, **Pesquisa aprofundada**, **Trabalho que roda sozinho**, **Objetivos**, **Experimentos**, **No seu celular** e, nos apps para computador, **Um navegador próprio**. Cada um tem uma linha sobre o que faz e o que fazer primeiro: um pedido como “Planeje 4 dias em Lisboa em maio”, que vai para a caixa de mensagem da página inicial (nunca é enviado por você, para que possa alterá-lo antes), ou um botão que abre o lugar (**Abrir Trazer conteúdo**, **Criar um app**, **Abrir a configuração**, **Abrir Experimentos**, **Usar no celular**, **Abrir o navegador**). **Como funciona** abre a seção do guia sobre o assunto. A seção tem um endereço próprio, [Ajuda → O que o Hydor pode fazer](/guide#what-hydor-can-do), que a última página do tour e “O que o Hydor pode fazer” na caixa de busca abrem.

Em uma janela estreita ou no celular, **Perguntar a um agente** no canto superior direito abre o mesmo painel; o mesmo vale para "Perguntar a um agente sobre o app" na caixa de busca. Os tópicos ficam agrupados sob a caixa como cartões, ou na coluna em uma janela larga. Em um tópico, a caixa no canto superior direito encontra seções e também pergunta a um agente. Cada tópico abre suas seções uma de cada vez (**Abrir tudo** mostra todas) e termina com sugestões de perguntas para um agente: clique em uma para colocá-la na caixa do painel, altere-a se quiser e envie.

- O tour de boas-vindas mostra o app e configura os agentes que você quer usar. Comece com **Fazer o tour** no alto da Ajuda, em [Fazer ffazer o tour](/settings?s=general&find=Take%20the%20tour) em Configurações → App → Geral, ou digitando “tour” na caixa de busca. Todos têm uma etapa sobre o que outros assistentes sabem sobre você. Sem nada de outro agente neste computador, ela é **Vindo do ChatGPT ou do Claude?**: diz como pedir seus dados a eles (a exportação que eles enviam por e-mail, um .zip: no ChatGPT, Configurações → Controles de dados → Exportar dados; no Claude, Configurações → Privacidade → Exportar dados), e **Traga o que eles sabem** abre [Traga](/guide/memory#bring-in-from-other-assistants) sobre o tour, para ler esses dados em notas que você escolhe. Se o Hydor encontrar neste computador a pasta de outro agente que você usava antes (Claude Code, Codex ou outro), a etapa é **Vindo de outro agente?**: ela diz o que encontrou, menciona também a exportação, e o mesmo botão traz o que esse agente sabe sobre você e as habilidades que você criou. **Próxima** segue sem isso. Depois das etapas que mostram as ferramentas da barra lateral vem uma para **Apps**, com três pedidos para experimentar, e a última página tem **Veja o que o Hydor pode fazer**, que encerra o tour e abre [O que o Hydor pode fazer](/guide#what-hydor-can-do) na Ajuda. Em um app para computador, quando o Hydor encontra outros navegadores neste computador, segue-se mais uma etapa, **Trazer seus favoritos e seu histórico?**: ela lista cada navegador com quantos favoritos e páginas de histórico ele tem, e **Importar** ao lado de um traz o que estiver ativado, **Favoritos** e **Histórico** (veja [Traga favoritos](/guide/web#bring-in-bookmarks) e [Histórico](/guide/web#history)); **Próxima** segue sem importar. No Mac, enquanto o macOS impede o Hydor de ler o Safari, a linha dele tem **Abrir Ajustes do Sistema** no lugar de **Importar**; se o Hydor precisar ser reaberto depois que você permitir lá, o tour volta a esta etapa. Em um app para computador, mais uma etapa pergunta **Usar também no celular?**: **Configurar** encerra o tour em [Usar no celular](/settings?s=phone), e **Agora não** segue em frente. Depois dela, dicas apontam o resto do app, uma parte de cada vez, na primeira vez que você chega a cada uma (veja [Fazer o tour](/guide/app#take-the-tour)).
- **Notas da versão** (em Configurações → App → Geral, ou pela caixa de busca) dizem o que mudou em cada versão. Depois de uma atualização, uma nota de "Novidades" aparece uma vez.
- Os agentes do app também leem este guia: pergunte a qualquer sessão "como eu faço…" e ela pode responder ou fazer por você (veja [Deixe os agentes operarem o app por você](/guide/ask-agents)).

## Perguntar a um agente

- "Quais das minhas sessões estão esperando por mim agora, e o que cada uma precisa?"
- "Comece uma sessão do Codex em ~/code/shop que faça os testes do checkout passarem."
- "Encontre a sessão em que planejamos a viagem a Lisboa e fixe-a."
- "Por que uma sessão que espera a renovação do uso ainda está em Ativas?"
- "Liste minhas sessões na barra lateral por dia, sem os grupos de pastas."
- “Crie uma pasta chamada Viagens e coloque nela minhas sessões sobre Lisboa.”
- “Crie uma pasta chamada Revisões dentro do meu projeto Tese e coloque esta sessão nela.”
- "Na próxima vez que eu abrir a página inicial, deixe-a configurada com o Claude Code e o agente Pesquisador."
- "Oculte as ideias iniciais sob a caixa de mensagem na página inicial."
- "O que aconteceu enquanto eu estava fora? Algo falhou?"
- "Marque tudo em Enquanto você estava fora como visto."
- "Quanto minhas sessões de hoje custaram nos preços da API?"
- "Faça minha caixa de busca procurar só nas minhas sessões e páginas."
- "A caixa de busca consegue encontrar a página sobre hotéis em Lisboa que visitei no mês passado?" (no app de computador: seu histórico, favoritos e downloads, pelas palavras ou pelo assunto; os agentes não conseguem vê-los)
- "Coloque Configurações em primeiro lugar entre as ferramentas na parte de baixo da minha barra de ícones."
- "Coloque Projetos em primeiro lugar entre as seções da minha barra de ícones."
- "Coloque meu projeto Tese em primeiro lugar entre os grupos da minha barra lateral."
- "Quais dos meus projetos o Hydor criou a partir das minhas sessões do Claude Code e do Codex?"
- "O que há na minha caixa de entrada?"
- "Configure o app para eu poder usá-lo no celular."
