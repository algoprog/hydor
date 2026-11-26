# Projetos e conhecimento

Um projeto mantém junto um trabalho inteiro: suas sessões, uma pasta para os arquivos dele (e outras pastas suas com as quais ele trabalha), o que os agentes lembram sobre ele (notas, uma wiki e documentos próprios), as diretrizes que todo agente nele segue, habilidades próprias, o agente com que suas sessões começam e agentes próprios. O Conhecimento compartilhado reúne os documentos e as pastas que você adiciona uma só vez para que todas as sessões possam pesquisá-los e citar o arquivo e a página que leram. Este tópico explica a página Projetos, como abrir os detalhes de um projeto, criar e usar projetos e grupos de projetos, dar habilidades próprias a um projeto, compartilhar um projeto com pessoas e adicionar, pesquisar e gerenciar os documentos que os agentes pesquisam.

![A página de um projeto: suas sessões, seus arquivos mais novos e o que toda sessão nele recebe, sob as abas](images/projects.webp)

## O que é um projeto

Um projeto é um trabalho com tudo o que pertence a ele, como os Projetos no ChatGPT ou no Claude. Uma declaração de imposto de renda, uma tese, um jardim, um site: cada um pode ser um projeto. Na página inicial, você escolhe um projeto pelo nome em vez de uma pasta, e toda sessão que você começa nele:

- **trabalha na pasta do projeto**. O agente é informado de que essa pasta guarda os arquivos do projeto e de que deve manter nela o que criar para o projeto, e, com a sua primeira mensagem, recebe o que há nela agora (os alterados mais recentemente primeiro). Ele também trabalha com as outras pastas com as quais o projeto trabalha, onde elas estão: o Claude Code trabalha nelas como na própria pasta, e os outros agentes são informados de onde elas ficam;
- **segue as diretrizes do projeto**: o que todo agente no projeto deve saber, como para quem é o trabalho, como trabalhar e o que ter em mente (veja [Diretrizes dos agentes](/guide/guidelines));
- **recebe as habilidades próprias do projeto**, junto com a sua biblioteca de habilidades: métodos escritos de como o trabalho dele é feito, que os agentes carregam quando uma tarefa pede (veja [Dê habilidades próprias a um projeto](#give-a-project-skills-of-its-own));
- **começa como o agente do projeto**, quando o projeto tem um (veja [Agentes](/guide/agents));
- **lembra o que as sessões anteriores no projeto aprenderam**: os agentes guardam notas sobre um projeto pela pasta dele, então as sessões de um projeto as compartilham (veja [Memória](/guide/memory));
- **pesquisa os documentos do próprio projeto**, e também o Conhecimento compartilhado, a menos que o projeto desative isso (veja [Quais sessões pesquisam qual conhecimento](#which-sessions-search-which-knowledge)).

As sessões pertencem a um projeto pelo lugar onde trabalham. Toda sessão que trabalha na pasta do projeto, ou em uma pasta dentro dela, está no projeto, onde quer que tenha sido iniciada: no Hydor, no Claude Code ou no Codex. Quando a pasta de um projeto está dentro da pasta de outro, o projeto interno fica com a sessão. Uma sessão em um worktree conta para a pasta de onde o worktree foi criado, e um projeto cuja pasta é a sua pasta pessoal recebe só as sessões da própria pasta pessoal. Assim, criar um projeto para uma pasta em que você já trabalha traz as sessões anteriores dela para o projeto na hora (a barra lateral as mostra sob o projeto, não como um grupo de pasta), e uma sessão que o Hydor inicia na pasta de um projeto (pela página inicial, por uma tarefa agendada, por um app ou pela API) começa no projeto, com as diretrizes, as habilidades e o conhecimento dele desde o primeiro turno.

Um projeto também pode reunir outros projetos. Isso é um **grupo**: veja [Reúna projetos em um grupo](#bring-projects-together-in-a-group).

## Abra os detalhes de um projeto

O lugar onde os detalhes de um projeto aparecem depende de onde você está. Na seção **Projetos** (a página Projetos ou a página de um projeto), eles são a própria página do projeto, no lugar da lista. De qualquer outro lugar (uma sessão, as Configurações…), eles abrem em uma janela sobre a página em que você está, que continua atrás, escurecida. Há várias maneiras de chegar lá:

- **Pela página Projetos**: clique no cartão de um projeto (veja [Encontre todos os seus projetos](#find-all-your-projects)). A página do projeto abre.
- **Pela barra lateral**: na lista de sessões, clique no nome do projeto no cabeçalho dele (no celular, abra primeiro a barra lateral, que é uma gaveta, e toque no nome; a gaveta se fecha e os detalhes ocupam a tela). O menu ⋯ dele também tem **Detalhes do projeto**, como primeiro item. A setinha ao lado do nome recolhe ou expande as sessões do projeto.
- **Pela caixa de pesquisa**: digite o nome do projeto na caixa de pesquisa (Ctrl+K, ou ⌘K no Mac) e escolha-o. Na seção Projetos, a página dele abre; em outros lugares, a janela. Um projeto ainda sem sessões não tem título na barra lateral, então esta opção e a página Projetos são os caminhos até ele (um projeto que você acabou de criar abre sozinho).
- **De um link**: um link para um projeto em uma notificação ou na resposta de um agente, aberto a partir de outra página, também abre a janela sobre ela.
- **Pelo endereço**: digitar ou recarregar `/projects/<id>`, com uma aba em seguida se quiser, abre a página do projeto.

A página e a janela mostram as mesmas coisas:

- **O cabeçalho**, na cor do projeto: na página do projeto, uma seta no canto superior esquerdo (**Todos os projetos**); depois, a marca e o nome dele e, abaixo, do que ele trata (a pasta, quando não há descrição; um grupo diz “Reúne” e os nomes dos projetos). À direita, **Nova sessão** começa uma sessão no projeto (no celular, a caneta) e **Mais** (⋯) tem o menu do projeto (veja [O menu do projeto](#the-projects-menu)). A janela também tem ✕, que a fecha.
- **As abas**: **Visão geral**, **Arquivos**, **Memória**, **Habilidades**, **Agentes** e **Configurações** (veja [Detalhes de um projeto](#a-projects-details)).

**Na página do projeto**, a seta volta para a página Projetos, assim como o Voltar do navegador; não há ✕. A aba em que você está faz parte do endereço da página (`/projects/<id>/files`, `/projects/<id>/memory`…), então recarregar a página ou usar um link a mantém. O mesmo vale para uma pasta que você abre na aba **Arquivos**, e o Voltar sai dela. Um link ali para outro projeto (um que um grupo reúne) abre a página desse projeto. Excluir o projeto leva você de volta à página Projetos.

**A janela** fecha com ✕, com Esc ou com um clique na página escurecida fora dela. Ir para outra página também a fecha: abrir um documento pela aba **Arquivos**, por exemplo, ou seguir um link. No celular, a janela ocupa a tela. Esc fecha primeiro um menu ou uma caixa de diálogo sobre a janela, e depois a janela.

## Encontre todos os seus projetos

**Projetos** na barra de ícones (logo antes de **Arquivos**; no celular, na grade de ferramentas da gaveta da barra lateral) abre a página Projetos, ou vá a [/projects](/projects). Ela lista cada projeto como um cartão, na largura toda da página, sem coluna ao lado da barra de ícones. O título mostra quantos há.

- **Novo projeto** cria um (veja [Crie um projeto](#make-a-project)). O ▾ dele tem **Novo projeto** e **Novo grupo de projetos…**, que precisa de dois projetos para reunir (veja [Crie um grupo](#make-a-group)).
- **Encontrar um projeto** filtra os cartões enquanto você digita, por nome, descrição e pasta.
- O botão ao lado os ordena: **Atividade recente** (primeiro o projeto que trabalhou mais recentemente, a ordem padrão), **Nome** ou **Mais sessões**. Este navegador guarda a sua escolha.

Cada cartão mostra:

- uma faixa na cor do projeto com a marca dele, e chips: **Grupo** para um grupo, e **Do Claude Code** ou **Do Codex** para um projeto que o Hydor encontrou (veja [Projetos encontrados no Claude Code e no Codex](#projects-found-in-claude-code-and-codex));
- o nome, do que ele trata (um grupo diz "Reúne" e os nomes dos seus projetos) e a pasta;
- o que ele guarda: as sessões, os documentos, as habilidades e os arquivos guardados, e "Compartilhado com 2 pessoas" depois que você o compartilha;
- "2 trabalhando" enquanto as sessões dele estão trabalhando, e um ponto quando uma sessão terminou desde a sua última visita;
- quando ele trabalhou pela última vez, e barrinhas com as mensagens das últimas quatro semanas.

Passe o ponteiro sobre um cartão (em uma tela sensível ao toque, eles estão sempre visíveis) e **Nova sessão** começa uma sessão no projeto, e **Mais** (⋯) tem o menu do projeto: **Abrir a pasta em Arquivos**, no app de computador **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta**, **Só as sessões dele na barra lateral**, **Compartilhar com pessoas** e **Excluir o projeto** (veja [O menu do projeto](#the-projects-menu)). Clique em qualquer outro ponto do cartão para abrir a página do próprio projeto, com uma seta de volta para todos os projetos (veja [Abra os detalhes de um projeto](#open-a-projects-details)). Solte arquivos do seu computador sobre um cartão para colocá-los na pasta do projeto.

Abaixo dos cartões, **Pastas em que você trabalha** lista as pastas em que suas sessões trabalharam recentemente e que nenhum projeto tem ainda (veja [Pastas em que você trabalha, ainda sem projeto](#folders-you-work-in-not-in-a-project-yet)). **Criar projeto** em uma delas abre a janela **Novo projeto** com essa pasta escolhida; ✕ (**Não é um projeto: parar de sugerir**) a tira da lista de vez. A lista fica de fora enquanto você pesquisa.

Sem projetos ainda, a página diz o que é um projeto e oferece **Novo projeto**. Uma busca sem resultados avisa.

## Crie um projeto

1. Na página Projetos, clique em **Novo projeto** (veja [Encontre todos os seus projetos](#find-all-your-projects)). Ou clique no **+** no fim do cabeçalho **Projetos** da barra lateral (ele aparece quando você aponta para o cabeçalho, e está sempre lá em telas de toque) e escolha **Novo projeto…**. O botão de filtro da barra lateral (**Filtrar e agrupar sessões**) também tem **Novo projeto…**, e o menu de pastas da página inicial também, ao lado do cabeçalho **Projetos** dele (veja [Comece uma sessão em um projeto](#start-a-session-in-a-project)). O cabeçalho de uma pasta na barra lateral tem **Transformar em projeto**, e também cada pasta em **Pastas em que você trabalha** na página Projetos (veja [Pastas em que você trabalha, ainda sem projeto](#folders-you-work-in-not-in-a-project-yet)).
2. Preencha a janela:
   - **Nome**: como você chama o projeto, como "Imposto de renda 2026", "O jardim" ou "Tese". Até 60 caracteres. É o único campo obrigatório. O quadrado ao lado é a marca do projeto, na cor que ele terá: clique nele para escolher outra das oito cores (âmbar, azul, verde, rosa, violeta, verde-azulado, laranja, ardósia). Se você não escolher nenhuma, os projetos recebem as cores em sequência.
   - **Para onde vão os arquivos dele**: escolha uma das duas opções.
     - **Em uma pasta nova** (a escolha usual): o app cria para o projeto uma pasta própria, com o nome dele.
     - **Em uma pasta que já tenho**: um projeto ou uma pasta de documentos neste computador, que continua onde está. Abaixo, **Usados recentemente, ainda em nenhum projeto** mostra pastas em que suas sessões trabalharam recentemente como escolhas de um toque; ou clique em **Escolher uma pasta…** e encontre uma pelo nome ou digite o caminho dela. Se você escolher com o nome ainda vazio, o nome da pasta vira o do projeto. **Variação** escolhe outra.
3. Se quiser, clique em **Mais opções** para ver o resto (um ponto ao lado significa que há algo preenchido ali):
   - **Do que se trata**: uma linha exibida sob o nome. Até 300 caracteres.
   - **Diretrizes dos agentes**: o que todo agente no projeto deve seguir, como para quem é o trabalho, como trabalhar e o que ter em mente: "Valores em EUR. Sou autônomo na Grécia." Até 20.000 caracteres. Veja [Diretrizes dos agentes](/guide/guidelines).
   - **Outras pastas que ele usa**: mais pastas suas com as quais os agentes dele trabalham, onde elas estão; nada é copiado. **Adicionar uma pasta** adiciona uma, até 12; ✕ tira uma de novo.
4. Deixe **Um agente para ele** ativado para que um agente seja criado para o projeto (veja [Agentes](#agents)), ou desative-o.
5. Clique em **Criar o projeto**, ou pressione Enter no campo do nome.

Uma pasta nova fica dentro de uma pasta **Projects**, no mesmo lugar das pastas de tarefa: “Impostos 2026” recebe `~/Hydor/Projects/taxes-2026`, a menos que você tenha movido as pastas de tarefa para outro lugar (veja [Mover as pastas de tarefa](/guide/agents#move-task-folders)). Se esse nome já estiver em uso, o app acrescenta `-2`, `-3` e assim por diante. Quando o projeto é criado pela página Projetos, a página do novo projeto se abre. Quando é criado pela barra lateral, os detalhes dele se abrem em uma janela por cima da página em que você está. Quando é criado pela página inicial, o novo projeto já fica escolhido para a sessão que você vai começar.

Outras duas coisas são definidas depois, na aba **Configurações** do projeto: o agente com que as sessões dele começam e os projetos que ele reúne. As notas, a wiki e os documentos dele ficam na aba **Memória**, as habilidades na aba **Habilidades** e mais pastas na aba **Arquivos** (veja [Detalhes de um projeto](#a-projects-details)).

### Um projeto para uma pasta que você já tem

Na janela **Novo projeto**, escolha **Em uma pasta que já tenho** em **Para onde vão os arquivos dele** e, depois, a pasta: o projeto trabalha nela, e nenhuma pasta nova é criada. Um agente também pode fazer isso: "Crie um projeto chamado Loja para ~/code/shop". A pasta própria de um projeto não pode ser alterada depois que ele é criado, mas as pastas com as quais ele trabalha podem: veja [Arquivos](#files). As sessões que já trabalhavam nessa pasta entram no projeto na hora. Se o Hydor já criou um projeto para essa pasta (veja [Projetos encontrados no Claude Code e no Codex](#projects-found-in-claude-code-and-codex)), criar você mesmo um projeto para ela torna esse projeto seu como você o define agora, com o seu nome, cor, descrição e diretrizes. É o mesmo projeto, com as suas sessões, e ele deixa de dizer onde foi encontrado.

### Projetos encontrados no Claude Code e no Codex

O Hydor lista as sessões que você teve no Claude Code e no Codex fora do Hydor: em um terminal, no VS Code, no app de desktop do Claude ou no app do Codex (veja [A lista de sessões](/guide/start#the-session-list)). As pastas em que você trabalha com eles agora viram projetos do Hydor sozinhas, então o seu trabalho lá está esperando por você como um projeto, com as sessões dele.

- **Quando uma pasta vira um projeto**: quando pelo menos duas sessões que você mesmo iniciou no Claude Code ou no Codex trabalharam nela, em um terminal, no VS Code, no app de desktop do Claude ou no app do Codex. Sessões que um script ou outro programa executou (como `codex exec` ou o Agent SDK), sessões que um agente iniciou para parte do trabalho dele (subagentes) e as sessões do próprio Hydor não contam. Uma sessão em uma subpasta de um repositório Git conta para o repositório inteiro.
- **Projetos do próprio Codex**: os projetos que você mantém no app do Codex, incluindo as pastas que ele guarda para os seus projetos do ChatGPT, viram projetos quando uma sessão trabalha em uma das pastas deles. O projeto recebe o nome que o Codex dá a ele, a primeira pasta dele como pasta própria do projeto e as outras pastas como as pastas com as quais o projeto trabalha.
- **O que fica de fora**: a sua pasta pessoal; pastas ocultas (exceto as pastas dos projetos do próprio Codex); pastas temporárias; as pastas que o app cria para si mesmo (pastas de tarefas, execuções de apps, worktrees e os dados dele); pastas que você marcou como **Não é um projeto**; e pastas que um projeto já tem: a própria pasta dele, uma com a qual ele trabalha ou uma pasta dentro delas.
- **Quando**: assim que o Hydor lê as suas sessões depois de iniciar, e depois em cerca de um minuto após novas sessões aparecerem lá.
- **Seu nome**: o nome que você deu à pasta na barra lateral (**Renomear**), ou então o nome do projeto do Codex, ou então o nome da própria pasta. Se um projeto já tem esse nome, o nome da pasta acima vai na frente ("cliente/app"), e depois um número.
- **Na barra lateral**: o grupo dela é o grupo do projeto, com a marca e o nome dele e, depois do nome, as marcas dos programas em que ele foi encontrado. Aponte para o nome ou abra o **⋯** do título para ver de onde vieram as sessões (**Iniciada fora do Hydor**), como no grupo de uma pasta. Os detalhes se abrem como os de qualquer projeto (veja [Abra os detalhes de um projeto](#open-a-projects-details)); eles não informam onde o projeto foi encontrado.
- **Um projeto como qualquer outro**: a pasta própria dele é a pasta onde essas sessões foram executadas, e nada é movido nem copiado. Ele tem documentos, habilidades, diretrizes, um agente, arquivos e compartilhamento como qualquer projeto, e você pode renomeá-lo, descrevê-lo ou excluí-lo. As habilidades do próprio Claude Code em `.claude/skills` da pasta aparecem na aba **Habilidades** como antes, e o CLAUDE.md ou o AGENTS.md da própria pasta continua sendo lido pelos agentes como antes.
- **Se você o excluir**, o Hydor não o cria de novo, e você ainda pode criar você mesmo um projeto para essa pasta (veja [Exclua um projeto](#delete-a-project)).

Para ver quais projetos vieram assim, procure as marcas dos programas depois do nome de um projeto na barra lateral, ou pergunte a um agente.

### Pastas em que você trabalha, ainda sem projeto

Uma pasta em que duas ou mais das suas sessões trabalham, e que nenhum projeto tem ainda, tem um grupo próprio na barra lateral, em **Projetos**, com o nome da pasta. Aponte para o cabeçalho dela e abra o **⋯** para encontrar **Transformar em projeto**: a janela **Novo projeto** abre com essa pasta escolhida e o nome dela preenchido. O mesmo menu tem **Renomear**, **Usar o nome da própria pasta** (depois que você a renomeia) e **Abrir em Arquivos**.

Quando você cria um projeto para uma pasta por conta própria (ou pela janela **Novo projeto**), as pastas em que suas sessões trabalharam recentemente, nos últimos 90 dias, ou em que alteraram arquivos enquanto trabalhavam em outro lugar, e que nenhum projeto tem ainda, aparecem em **Usados recentemente, ainda em nenhum projeto**, então um toque escolhe uma (veja [Crie um projeto](#make-a-project)). A página Projetos lista as mesmas pastas abaixo dos cartões, como **Pastas em que você trabalha**, cada uma com **Criar projeto** (veja [Encontre todos os seus projetos](#find-all-your-projects)). As mais usadas, e as mais recentes, vêm primeiro. Uma pasta dentro de um projeto mantido no Git conta como o projeto inteiro.

As pastas em que você trabalha com o Claude Code e o Codex viram projetos sozinhas, então estas são, na maioria, pastas em que você trabalhou pelo Hydor. A sua pasta pessoal, as pastas ocultas, as temporárias e as pastas que o app cria para si mesmo (pastas de tarefas, execuções de apps, worktrees) nunca são sugeridas. Quando um projeto passa a ter uma pasta, como própria ou como uma das pastas com as quais ele trabalha, a pasta sai dessa lista. Para impedir que o Hydor crie sozinho um projeto de uma pasta, peça a um agente: ele mantém uma lista de pastas que não são projetos, e excluir um projeto adiciona a pasta dele a essa lista (veja [Exclua um projeto](#delete-a-project)).

## Começar uma sessão em um projeto

Há duas maneiras:

- **A partir do projeto**: clique na caneta no fim do título dele na barra lateral ou em **Nova sessão** no topo dos detalhes (no celular, na caneta). A página inicial se abre com o projeto escolhido e com o que você escolheu nele antes; se você ainda não escolheu nada ali, com o agente dele, quando houver.
- **Pela página inicial**: abra o chip de pasta na linha abaixo da caixa de mensagem. O menu dele tem duas listas curtas: **Projetos**, os cinco em andamento mais recentes (e o escolhido, se não estiver entre eles), cada um com sua marca, seu nome e sua pasta; depois **Pastas**, a pasta em uso e as que você usou por último; e então **Nova pasta de tarefa**. **Nova**, ao lado do título **Projetos**, cria um projeto e o escolhe. Digite parte de um nome no campo no alto para encontrar qualquer projeto ou qualquer pasta. A pasta de um projeto nunca aparece na lista como pasta: se for encontrada pelo nome ou pelo caminho, ou se já tiver sido escolhida antes na página inicial como pasta, ela é o projeto, e a sessão trabalha no projeto.

Quando você escolhe um projeto, o chip mostra a marca e o nome dele no lugar de uma pasta, e a sessão vai trabalhar na pasta do projeto. Em um projeto onde você ainda não escolheu nada, o chip **Agente** mostra o agente do próprio projeto, quando ele tiver um, com o programa, o modelo e as permissões que esse agente sugerir, ou então **Geral**; em um projeto onde você já escolheu, mostra o que você escolheu ali. Você ainda pode mudar qualquer um deles antes de começar. Depois, digite sua mensagem e clique em **Início**.

Cada projeto guarda suas próprias escolhas na página inicial: programa, modelo, esforço, permissões, agente, memória, limite de gastos, **Confidencial** e **Novo worktree** (veja [O que a página inicial lembra](/guide/sessions#what-the-start-page-remembers)). A página inicial lembra o projeto para a sua próxima sessão, em qualquer dispositivo que você use. Para voltar a trabalhar fora dele, escolha uma pasta ou **Nova pasta de tarefa** no mesmo menu. Se um projeto que você tinha escolhido for excluído, a página inicial mantém a pasta dele, mas não o projeto.

No celular, o menu abre como uma folha na parte de baixo da tela, com o título “Project or folder to work in”, e o teclado só aparece quando você toca no campo.

Quando a pasta do projeto é um repositório Git, o fim do menu oferece **Novo worktree**, como para qualquer pasta de um repositório: a sessão passa a trabalhar em um branch próprio, em uma cópia separada do repositório (veja [Sessões](/guide/sessions)). As sessões que você começa por voz no modo Mãos livres começam no último lugar escolhido na página inicial, com as escolhas dele (veja [Documentos, imagens, vídeos e voz](/guide/documents-voice)).

## Detalhes de um projeto

Abra-os como descrito em [Abra os detalhes de um projeto](#open-a-projects-details). As abas são **Visão geral**, **Arquivos**, **Memória**, **Habilidades**, **Agentes** e **Configurações**. **Memória** e **Habilidades** têm uma contagem, exceto no celular, onde as abas não mostram as contagens. No celular (ou em uma janela estreita), as abas que não cabem ficam em **Mais**, no fim da linha: toque para ver um menu com elas. Enquanto uma delas está aberta, o nome dela aparece ali no lugar de **Mais**. Cada aba é exibida na hora.

### O menu do projeto

**Mais** (⋯), no cabeçalho, tem:

- **Abrir a pasta em Arquivos**: a pasta do projeto na página Arquivos.
- **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta**: no app para computador, a pasta do projeto selecionada no gerenciador de arquivos do sistema (veja [Trabalhar com arquivos e pastas](/guide/files-git#work-with-files-and-folders)).
- **Só as sessões dele na barra lateral**: a lista de sessões mostra apenas as sessões do projeto, como faz o filtro da própria barra lateral (veja [Mostrar as sessões de um projeto na barra lateral](#show-one-projects-sessions-in-the-sidebar)). Escolha de novo para ver todas as sessões.
- **Compartilhar com pessoas**: convide alguém (um orientador, um aluno) para ver o projeto e comentar os documentos dele em um link próprio (veja [Compartilhar um projeto com pessoas](#share-a-project-with-people)).
- **Excluir o projeto** (veja [Excluir um projeto](#delete-a-project)).

### Visão geral

O projeto num relance, em cartões:

- **Jobs**, no topo, somente enquanto o projeto tem [trabalhos](/guide/jobs) em execução ou em espera, ou servidores que continuam rodando: até seis deles (três no celular), com o progresso, o tempo restante e o que estão esperando. Clique em um para abrir o painel dele, com os detalhes e a saída; o menu ⋯ tem **Detalhes e saída**, **Abrir sessão** (**Abrir execução** para uma execução de Experimentos), **Editar etiquetas…** e **Parar**. **Todos os trabalhos** (**Todos** e a quantidade, quando há mais do que o cartão mostra) abre Jobs apenas com os trabalhos deste projeto (veja [Ver os trabalhos de um projeto](/guide/jobs#see-one-projects-jobs)). O cartão de um grupo também tem os trabalhos dos projetos dele.
- **Sessões**: as sessões do projeto (começadas nele, ou trabalhando na pasta dele, no Hydor, no Claude Code ou no Codex), a que trabalhou mais recentemente primeiro, cada uma com o ícone do agente, o título, o que está fazendo enquanto executa (**Em andamento**, **Precisa de você**, **Pronto**; não no celular) e há quanto tempo trabalhou. Clique em uma para abri-la. Com mais de seis, **Todos** mostra o resto. Se ainda não houver nenhuma, o cartão diz que uma nova sessão trabalha na pasta do projeto, com as diretrizes, os documentos e as habilidades dele, e tem **Nova sessão**.
- **Arquivos**: os arquivos mais recentes do projeto, até seis, como blocos com as imagens deles: o que foi guardado no projeto (páginas, documentos, slides, imagens…) e os arquivos no topo da pasta dele, o último alterado primeiro (o arquivo próprio de algo guardado que esteja ali aparece uma vez só, como o próprio item). Clique em um para abri-lo. **Todos os arquivos** abre a aba **Arquivos**. O cartão só aparece enquanto o projeto tem arquivos.
- **Compartilhado com** (ao lado deles, embaixo deles no celular), depois que você compartilha o projeto com alguém: cada pessoa, com as iniciais e o que fez por último (“Comentou em “Capítulo 3” · há 2 h”, “Ainda não abriu”). Clique em uma, ou em **Participação**, para ver e alterar com quem ele é compartilhado (veja [Compartilhar um projeto com pessoas](#share-a-project-with-people)).
- **Todas as sessões daqui** (ao lado deles, embaixo deles no celular): o que toda sessão do projeto recebe. **Pasta** (a pasta dele e com quantas outras ele trabalha: clique para ir à aba **Arquivos**), **Diretrizes** (o início das diretrizes dele: clique para ir a **Configurações**), **Memória** (o que ele lembra, em uma linha: “12 notas · 8 artigos · 5 documentos”, com os artigos só enquanto a memória wiki está ativada; clique para ir à aba **Memória**), **Habilidades** (quantas são só dele) e **Começa como** (o agente dele).
- **Os projetos que ele reúne**, para um grupo: cada um dos projetos, com quantas sessões tem. Clique em um para abri-lo.

### Arquivos

Os arquivos do projeto: o que foi guardado nele, a pasta dele e as outras pastas com que ele trabalha. A aba mostra uma pasta como a [página Arquivos](/guide/files-git#browse-a-folder): abrir, selecionar vários, arrastar, e o menu de cada bloco ou linha. Um arquivo abre em uma janela sobre a página.

- Acima da pasta, um chip para cada uma: a pasta do próprio projeto, com o nome do projeto, e cada pasta com que ele trabalha, com o nome dela. Clique em um para mostrá-la.
- **Anexar uma pasta** adiciona uma pasta sua para o projeto trabalhar, onde ela está: encontre-a pelo nome ou digite o caminho. Nada é copiado. Até 12.
- ✕ no chip de uma pasta a deixa fora do projeto; a pasta em si continua como está. A mensagem tem **Desfazer**.
- **Abrir em Arquivos** abre a pasta na página Arquivos. No app para computador, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no menu do projeto) a mostra no gerenciador de arquivos do sistema.

**Blocos e lista.** Os arquivos aparecem como blocos com imagens, a menos que você mesmo tenha escolhido **Como lista** (a chave no fim da barra lembra sua escolha neste navegador). Cada bloco tem uma imagem no alto, um pequeno selo com o tipo para documentos e similares (PDF, Word, Sheet, Slides, Notebook…), o nome e quando mudou (“Alterado há 2 h”); o ⋯ aparece quando você aponta para ele. A imagem é a própria imagem, no caso de imagens, um quadro, no caso de vídeos, a primeira página, no caso de PDFs, a primeira página, slide ou células, no caso de arquivos Word, PowerPoint, Excel e OpenDocument, como se abre, no caso de páginas da web e notebooks, e as primeiras linhas, no caso de arquivos de texto, Markdown, código, CSV e JSON. Qualquer outra coisa mostra o ícone do tipo. A lista mostra as imagens como miniaturas pequenas no lugar de ícones (veja [Percorrer uma pasta](/guide/files-git#browse-a-folder)).

**O que o projeto guarda.** Cada coisa guardada no projeto é também um arquivo próprio na pasta do projeto, com o nome do título: as páginas, designs, slides, documentos, planilhas, documentos LaTeX, notebooks e diagramas que os agentes fizeram e você guardou, páginas da web salvas, e imagens, vídeos e sons que você guardou. Ela aparece na grade entre os outros arquivos, na pasta onde está o arquivo dela, com um selo dizendo o que é, e um clique a abre no próprio editor ou visualizador (veja [O que você guarda também são arquivos](/guide/files-git#kept-things-are-files-too)). Painéis, cujos cartões são ao vivo, e tudo o que não tem arquivo próprio aparecem no topo da pasta do próprio projeto (não nas subpastas, nem nas pastas com que ele trabalha), depois das pastas e antes dos arquivos, o mais novo primeiro: cada um mostra a imagem e o tipo nela, e o menu ⋯ dele tem o que lhe serve, como **Editar**, **Renomear**, **Compartilhar com pessoas**, **Mover para outro projeto**, **Duplicar** e **Excluir**. O campo **Find in** acima os filtra junto com os arquivos. O que você guarda em uma sessão sem projeto fica com essa conversa (veja [Guardar uma página](/guide/library#keep-a-page)).

**Adicionar arquivos.**

- **Enviar** na barra envia arquivos para a pasta exibida, como estão; a seta dele (**Mais formas de enviar**) tem **Enviar arquivos** e **Enviar uma pasta**, que leva a pasta com os arquivos. Um arquivo do Word, planilha ou LaTeX abre nos editores do próprio app, como na página Arquivos.
- Solte arquivos ou pastas do seu computador em qualquer lugar da aba: “Solte para adicionar a “Tese”” aparece enquanto eles estão sobre ela. No celular, o **+** redondo na parte de baixo (**Adicionar a esta pasta**) tem os mesmos itens.
- **Nova** tem **Nova pasta**, **Novo arquivo** e **Novo notebook**, **Enviar arquivos** e **Enviar uma pasta**, e embaixo deles as coisas que o app faz: **Documento**, **Slides**, **Planilha**, **Página**, **Design**, **LaTeX**, **Diagrama**, **Painel** e **Imagem**. Cada um abre a caixa Nova para aquele tipo, com este projeto escolhido (veja [Criar uma página](/guide/library#make-a-page)). Com uma pasta de dentro da pasta do projeto aberta, o que é novo é criado nessa pasta.

Para adicionar arquivos de outros lugares do app, use **Adicionar a um projeto** na página Arquivos, na janela de um arquivo ou nos cartões de arquivo de um agente: um arquivo é copiado para a pasta do projeto (ou para uma pasta que você escolher dentro dela), e uma pasta passa a fazer parte das pastas com que ele trabalha (veja [Adicionar arquivos a um projeto](/guide/files-git#add-files-to-a-project)).

### Memória

O que o projeto lembra, em uma única lista: as notas, os artigos da wiki, os documentos e as descobertas. Uma caixa de busca no topo procura em tudo de uma vez, **Adicionar** inclui uma nota, arquivos ou uma pasta para manter em dia, e os marcadores **Todos**, **Notas**, **Wiki**, **Documentos** e **Descobertas** filtram a lista. Clique em uma linha para abri-la à direita (no celular, ela ocupa o lugar da lista). Um link para um marcador abre o projeto nele, e o mesmo vale para os endereços das antigas abas Conhecimento e LLM Wiki.

- **Notas**: as notas de memória que os agentes guardaram sobre o projeto, como [Configurações → Memória](/settings?s=memory) as lista, com o perfil do projeto primeiro. São os fatos curtos com que toda sessão do projeto começa (veja [Memória](/guide/memory)).
- **Wiki**: os artigos e as fontes da memória wiki do projeto, para ler. Os agentes a escrevem; você a lê aqui. O menu **⋯** tem as tarefas dela e **Atualizações da wiki…** (veja [Memória wiki](/guide/wiki-memory#a-projects-memory-tab)).
- **Documentos**: os documentos do próprio projeto, que só as sessões dele pesquisam, e as pastas que ele mantém atualizadas. Veja [Dar documentos próprios a um projeto](#give-a-project-documents-of-its-own). Documentos novos e alterados também atualizam as notas e a wiki do projeto enquanto a Memória wiki e **Aprender com novos documentos** estão ativadas (veja [Aprender com novos documentos](/guide/wiki-memory#learn-from-new-documents)). Em um projeto com mais documentos do que a wiki lê (100 no início), a wiki lê os fixados, os mais usados pelos agentes e os mais novos, até esse número, e a etiqueta avisa: “A wiki dele lê 100 dos seus 240 documentos: os fixados, os mais usados e os mais recentes. Os agentes pesquisam em todos.” Clique em um documento e ative **Ler na memória wiki** para fixá-lo (veja [Quando um projeto tem documentos demais](/guide/wiki-memory#when-a-project-has-too-many-documents)).
- **Descobertas**: o que o projeto tentou e no que deu, incluindo os becos sem saída, cada uma com seu veredito e suas evidências (veja [Descobertas](/guide/memory#findings-what-was-tried-and-what-came-of-it)).

### Habilidades

Toda habilidade que as sessões do projeto recebem: as dele, as da sua biblioteca de habilidades e as do próprio Claude Code e do Codex, cada uma com uma chave só para este projeto. Veja [Dar habilidades próprias a um projeto](#give-a-project-skills-of-its-own).

### Agentes

Os agentes que trabalham só neste projeto, como uma equipe: para cada um, o que o inicia (**Você pede**, e as agendas dele com quando executam de novo) e, embaixo, os agentes a quem ele passa trabalho, ligados por linhas. Clique em um agente para vê-lo ao lado do painel: onde ele trabalha, com o que ele pensa, o que ele pode fazer, quem o aciona e quanto gastou neste mês, com **Começar uma sessão** (neste projeto) e **Abrir** (a página dele). Embaixo do painel, **Also offered here, from Everywhere** lista os agentes que trabalham em todo lugar. **Novo agente aqui** cria um que trabalha neste projeto (veja [Agentes](/guide/agents)).

Um projeto pode ter um agente feito para ele, com **Um agente para ele** quando você cria o projeto, ou **Criar um para este projeto** nesta aba enquanto ele não tem nenhum:

- Quando o projeto diz o bastante sobre si (do que se trata e as diretrizes, ou um README ou notas de agente na pasta dele), o modelo auxiliar elabora um agente sob medida, partindo do modelo do tipo dele.
- Quando diz pouco, o agente é o modelo do tipo dele, a partir do que a pasta contém ou das palavras com que foi descrito: um engenheiro para software, um desenvolvedor web para um site, um pesquisador de ML para experimentos de aprendizado de máquina, um analista para dados, um redator de artigos para um artigo em LaTeX, um pesquisador para artigos e relatórios para ler, um redator para documentos, um designer para imagens e vídeos, ou um apresentador para slides.
- Sem nada em que se basear, é o agente de projeto padrão.

Ele recebe o nome do projeto (“Engenheiro da Loja”), trabalha só no projeto e na pasta dele e, a menos que o projeto indique outro agente, as sessões do projeto começam com ele. Altere-o como qualquer agente seu. Quando você cria um projeto pela página inicial, o chip **Agente** dela passa para esse agente quando ele fica pronto, a menos que você tenha escolhido outro agente nesse meio-tempo.

### Configurações

Tudo sobre o próprio projeto, em seis partes, cada uma com uma linha sobre para que serve:

- **O projeto**: o **Nome** dele (ao lado da marca, na cor escolhida), **Do que se trata** e **Sua cor**.
- **O que todos os agentes dele seguem**: as **Diretrizes dos agentes** dele, como quando você o criou.
- **Como as sessões começam**: em **Suas sessões começam como**, uma opção para tocar: **O agente escolhido na página inicial** (o padrão: a página inicial mantém o agente que você escolheu no projeto, Geral até você escolher outro), ou um dos seus agentes, nativo ou seu. Um projeto em que você ainda não escolheu nada abre então na página inicial com esse agente.
- **Memória wiki**: se o projeto mantém uma wiki de artigos a partir dos documentos e do trabalho dele: **Como em Configurações (Ativado)** (ou **(Desativado)**, conforme o padrão atual), **Ativada** ou **Desativada**. Salva na hora. [Configurações → Memória](/settings?s=memory&find=Wiki%20memory) tem o padrão para todos os projetos (veja [Memória wiki](/guide/wiki-memory#turn-it-on-or-off)). Embaixo, **Mais documentos para ler na Memória wiki** é **Como em Configurações (100)** ou **Uma numeração própria**: um projeto com mais documentos do que isso faz a wiki ler só essa quantidade (os fixados, os mais usados e os mais novos), e os agentes pesquisam todos (veja [Quando um projeto tem documentos demais](/guide/wiki-memory#when-a-project-has-too-many-documents)).
- **Pesquisável a partir de outros projetos**: uma chave, ativada por padrão, mostrada para um projeto, não para um grupo. Ativada, agentes dos seus outros projetos podem encontrar e ler as notas, a wiki, os documentos e as conversas deste projeto quando os procuram (eles nunca os alteram); desativada, o projeto fica só consigo mesmo, e eles não podem. As sessões dele não são afetadas e ainda podem pesquisar seus outros projetos. Salva na hora (veja [Pesquisar além de um projeto](/guide/memory#search-beyond-one-project)).
- **Os projetos que ele reúne**: escolha projetos aqui para transformar este projeto em um grupo (veja [Reunir projetos em um grupo](#bring-projects-together-in-a-group)).

Quando você altera algo, uma barra diz **Alterações não salvas**, com **Desfazer alterações** e **Salvar**; ela fica à vista enquanto você rola a tela. Na parte de baixo, **Excluir o projeto** diz o que permanece, com o botão dele.

## Dar a um projeto habilidades próprias

Habilidades são métodos escritos que os agentes carregam quando uma tarefa pede (veja [Habilidades](/guide/skills)). Sua biblioteca de habilidades chega a todas as sessões; um projeto também pode ter habilidades próprias, que só as sessões dele recebem: como o trabalho dele é feito, passo a passo. “Citar em APA 7 e conferir todos os DOIs” para uma tese, por exemplo, ou “ingredientes em gramas, depois passos numerados” para um livro de receitas da família. Ele também pode ativar ou desativar qualquer habilidade para as próprias sessões. As duas coisas ficam na aba **Habilidades** do projeto.

A aba lista todas as habilidades que as sessões do projeto recebem, em grupos como em [Configurações → Habilidades](/settings?s=skills), com um campo de busca, **Nova habilidade**, o menu **⋯** e filtros: **Todos**, **Próprio**, **Integrado**, **Seus**, **De plugins**, **Claude Code e Codex** e **Alterada aqui**. As habilidades próprias do projeto vêm primeiro, em **Próprio**; sem nenhuma ainda, esse grupo explica para que servem, com **Nova habilidade**.

**Nova habilidade** abre uma janela com três campos e depois **Adicionar a habilidade**:

- **Nome**: palavras em minúsculas com hifens, como `citation-style`. Espaços e maiúsculas viram isso quando você sai do campo. Os agentes conhecem a habilidade por esse nome.
- **Quando usar**: uma linha, como “Use ao citar uma fonte na tese”. Os agentes a veem em toda sessão do projeto e só leem o resto da habilidade quando uma tarefa se encaixa.
- **A habilidade**: os passos em ordem, as verificações e os erros a evitar, em Markdown.

Para alterar uma habilidade da sua biblioteca só para este projeto, abra-a na aba e clique em **Alterar para este projeto**: ela é copiada para o projeto com seus outros arquivos (exemplos, scripts) e a janela para alterá-la abre. A da biblioteca continua como está para todas as outras sessões.

Uma habilidade precisa de um nome de 2 a 64 caracteres, uma linha sobre quando usá-la com pelo menos 10 caracteres e passos com mais do que algumas palavras; a habilidade inteira comporta no máximo 20.000 caracteres. Uma habilidade que parece conter uma senha, uma chave ou um token é recusada: escreva, em vez disso, onde o segredo é guardado.

### Ativar ou desativar uma habilidade para este projeto

Toda habilidade na aba tem um interruptor no fim da linha: as da sua biblioteca (integradas, suas e de seus plugins), as próprias do projeto e as próprias do Claude Code e do Codex. Um interruptor aqui vale só para as sessões deste projeto; os interruptores em [Configurações → Habilidades](/settings?s=skills) valem para todas as outras sessões.

- Uma habilidade com o interruptor no sentido contrário ao de Configurações mostra **Ativada aqui** ou **Desativada aqui**, e o filtro **Alterada aqui** mostra só essas. Uma habilidade desativada em Configurações aparece como **Desativada**: ative-a para tê-la só neste projeto.
- Na janela dela, uma habilidade alterada aqui informa o que Configurações define para todas as outras sessões, e **Seguir Configurações** volta a isso. Voltar o interruptor manualmente faz o mesmo.
- No menu **⋯**, **Ativar todas as habilidades** e **Desativar todas as habilidades** ativam ou desativam, depois de você confirmar, todas as habilidades que a aba lista para este projeto, e **Seguir as configurações padrão para todas as habilidades** devolve todas as habilidades ao que Configurações define, depois de você confirmar. **Alterar as configurações padrão de habilidades para todos os projetos** abre Configurações → Habilidades. Ativar ou desativar todas vale para toda habilidade da aba, inclusive as que os filtros escondem; habilidades adicionadas depois seguem a configuração habitual, e sessões já em andamento mantêm a delas até começarem de novo. Se as habilidades próprias do Codex não puderem ser lidas, a confirmação avisa, e elas ficam como estão.

Uma nova sessão no projeto recebe os interruptores como estão quando ela começa; uma que já está em andamento mantém o que tinha ao começar, embora o Custom acompanhe uma mudança a partir do turno seguinte. As habilidades próprias do Claude Code e do Codex são ativadas ou desativadas para as sessões do projeto sem alterar as configurações próprias desses agentes. Em Configurações → Habilidades, uma habilidade que um projeto muda para o sentido contrário informa isso na própria linha (“Desativada em Tese”).

### A lista de habilidades de um projeto

Cada habilidade própria do projeto aparece como uma linha: seu nome, quando usá-la e quantas vezes os agentes do projeto (e dos grupos que o reúnem) a usaram. Uma habilidade com o nome de uma da sua biblioteca de habilidades tem o selo **No lugar da biblioteca**: as sessões do projeto recebem essa em vez da da biblioteca.

- Clique nela para ler a habilidade e seu **Histórico** de mudanças. **Variação**, no fim dessa janela, edita o nome, quando usá-la e o texto: um novo nome mantém os outros arquivos, o histórico e o interruptor.
- **Remover**, na mesma janela, a remove depois de você confirmar. As sessões do projeto deixam de vê-la ou voltam à habilidade da biblioteca com esse nome. As habilidades removidas ficam listadas abaixo da lista, depois de **Removida:**: clique em uma para trazê-la de volta como estava.

Em um grupo, as habilidades próprias de cada projeto que ele reúne vêm em seguida, sob o nome desse projeto: as sessões do grupo também as recebem. Altere-as nos detalhes desse projeto. As habilidades próprias do Claude Code e do Codex são listadas para a pasta do projeto: as suas e as que estão nessa pasta (as do Claude Code em `.claude/skills`).

### Como os agentes as recebem

Toda sessão do Claude Code, do Codex e do Custom iniciada no projeto recebe as habilidades dele junto com sua biblioteca de habilidades, conforme o projeto as liga ou desliga: o Claude Code no mesmo plugin chamado “hydor” (hydor:citation-style), o Codex na mesma pasta extra de habilidades, o Custom na sua lista de habilidades. O agente também é informado de quais habilidades são próprias do projeto e de que deve usar uma quando ela servir à tarefa. O Custom passa a ter uma habilidade que você adiciona ou altera a partir do turno seguinte; o Claude Code e o Codex, a partir da sessão seguinte.

As habilidades ficam guardadas na pasta de dados do app, não na pasta do projeto, então seus arquivos continuam como estão. As sessões de um grupo também recebem as habilidades dos projetos que ele reúne (veja [O que as sessões de um grupo recebem](#what-sessions-in-a-group-get)).

### Habilidades que os agentes propõem em um projeto

Depois de uma tarefa que deu trabalho de verdade, um agente pode propor guardar o método dele como uma habilidade, ou melhorar uma que seguiu, e você aprova, edita ou descarta (veja [Aprovar, editar ou descartar uma habilidade proposta](/guide/skills#approve-edit-or-dismiss-a-proposed-skill)). Quando a sessão está em um projeto, o cartão pergunta onde guardá-la, em **Manter para**:

- **Todas as sessões**: na sua biblioteca de habilidades, como fora de um projeto;
- o nome do projeto: só nas habilidades do projeto. Para uma melhoria em uma habilidade da biblioteca, o projeto ganha uma versão própria com a mudança, e a da biblioteca continua como estava.

O agente sugere uma das duas; você escolhe antes de aprovar. Uma melhoria em uma habilidade própria do projeto não tem escolha: ela continua sendo do projeto.

## Alterar um projeto

Abra os detalhes do projeto, vá à aba **Configurações**, mude o que quiser e clique em **Salvar**. As sessões que você começar no projeto a partir daí recebem o novo nome, a nova descrição e as novas diretrizes. Um novo agente aplica as mudanças na próxima vez que você escolher o projeto na página inicial ou clicar em **Nova sessão** nos detalhes dele. A pasta do projeto continua a mesma: ela não pode ser movida para outra pasta.

## Excluir um projeto

1. Abra os detalhes do projeto e clique em **Mais** (⋯) no topo, ou vá à aba **Configurações** dele.
2. Clique em **Excluir o projeto**.
3. O app pergunta “Excluir o projeto *nome*?” Clique em **Excluir**. Para um projeto que o Hydor encontrou, ele acrescenta “O Hydor o encontrou nas sessões do Claude Code e não vai criá-lo de novo.” (ou do Codex, ou do Claude Code e do Codex).

Excluir um projeto mantém tudo o que havia nele:

- **Pasta do app** e os arquivos dela continuam onde estão, assim como as pastas com que ele trabalhou.
- **A pasta dele entra na lista Não é um projeto**: o Hydor não vai sugeri-la de novo nem torná-la um projeto por conta própria. Você ainda pode criar um projeto para ela por conta própria (**Novo projeto** → **Em uma pasta que já tenho**).
- **As sessões dele** continuam e deixam de pertencer a um projeto.
- **O que ele guardou** (páginas, designs, documentos, imagens…) continua, sem projeto: com a conversa que o criou, e a caixa de busca (Ctrl+K) ainda o encontra. A página dele tem **Mover para um projeto** para colocá-lo em outro. Os arquivos que eles tinham na pasta do projeto continuam lá como arquivos comuns.
- **Os documentos dele** passam para o Conhecimento compartilhado, então todas as sessões podem pesquisá-los a partir daí. Para mantê-los separados, mova a base de conhecimento deles para outro projeto (veja [Renomear, mover, reler ou excluir uma base de conhecimento](#rename-move-read-again-or-delete-a-knowledge-base)).
- **As habilidades dele** passam para a sua biblioteca de habilidades, então todas as sessões as recebem a partir daí. Uma com o nome de uma habilidade que a biblioteca já tem recebe o nome do projeto depois do dela: o `research` do projeto Tese vira `research-thesis`.
- **O que os agentes lembram** sobre a pasta dele continua: as notas pertencem à pasta, não ao projeto.
- Ele sai de qualquer grupo em que estava. Um grupo que fica sem nenhum dos seus projetos vira um projeto simples.

## Reunir projetos em um grupo

Um grupo é um projeto que reúne vários projetos, para um trabalho que passa por todos eles: “Tudo para a tese”, reunindo “Tese” e “Notas de leitura”, por exemplo. Ele tem tudo o que um projeto tem: um nome, uma pasta própria, diretrizes, documentos, habilidades e um agente. As sessões dele também trabalham com todos os projetos que ele reúne.

### O que as sessões de um grupo recebem

- **As pastas dos projetos**: o Claude Code pode trabalhar em cada uma como na própria pasta; os outros agentes são informados de onde cada uma fica. O que uma sessão cria vai para a pasta do próprio grupo, a menos que você diga outra coisa.
- **As diretrizes dos projetos**: depois das do próprio grupo, o nome de cada projeto, do que se trata, a pasta dele e as diretrizes dele.
- **Os documentos dos projetos**: pesquisados junto com os documentos do próprio grupo e o Conhecimento compartilhado (a menos que o grupo desligue o Conhecimento compartilhado). O agente é informado de qual projeto vem cada base de conhecimento.
- **As habilidades dos projetos**, com as do próprio grupo e a sua biblioteca de habilidades. Onde duas têm o mesmo nome, a do próprio grupo vem primeiro, depois a do projeto que ele reuniu primeiro.
- **A Memória** vem da pasta do próprio grupo. As notas que os agentes guardaram em cada projeto ficam com esse projeto.

### Criar um grupo

1. Na página Projetos, abra o ▾ ao lado de **Novo projeto** e escolha **Novo grupo de projetos…** (precisa de dois projetos). Ou, na barra lateral, clique no **+** no fim do título **Projetos** e escolha **Novo grupo de projetos…**. Você precisa de pelo menos um projeto para reunir.
2. Em **Novo grupo de projetos**, dê a ele um **Nome**, como “Trabalho” ou “Tudo para a tese”.
3. Em **Os projetos que ele reúne**, toque em cada projeto a reunir; toque de novo para tirá-lo. Escolha pelo menos um.
4. Se quiser, preencha **Do que se trata** e as **Diretrizes dos agentes**, e escolha uma cor.
5. Clique em **Criar o grupo**. Como um projeto, ele ganha uma pasta própria para o que for criado nele, e os detalhes dele abrem.

Você também pode transformar um projeto existente em um grupo: na aba **Configurações** dele, escolha projetos em **Os projetos que ele reúne** e clique em **Salvar**. Mude os projetos de um grupo do mesmo jeito. Tire todos e ele volta a ser um projeto simples.

A aba **Memória** de um grupo, abaixo do chip **Documentos**, também lista **Também pesquisado:** cada um dos projetos que ele reúne, com quantos documentos tem. Clique em um para abrir os documentos desse projeto. A aba **Habilidades** dele mostra **Também as habilidades dos projetos que ele reúne** do mesmo modo.

### Limites

- Um grupo reúne projetos simples, não outros grupos: os grupos têm um nível só. Um projeto que está em um grupo não pode reunir outros projetos; a aba Configurações dele diz, em vez disso, em qual grupo ele está.
- Um projeto pode estar em vários grupos.
- Um grupo reúne no máximo 12 projetos. Quando 12 estão escolhidos, os outros não podem ser tocados.

## Mostrar na barra lateral só as sessões de um projeto

A barra lateral dá a cada projeto um grupo próprio, sob o nome e a marca dele, com as sessões mais recentes; a caneta no fim do título do grupo começa uma nova sessão no projeto. Veja [A lista de sessões](/guide/start#the-session-list). Um projeto pode ter pastas próprias ali, para organizar as sessões: no menu **⋯** dele → **Nova pasta**, e elas aparecem sob o título dele, antes das outras sessões. Veja [Organizar sessões em pastas](/guide/start#sort-sessions-into-folders). Excluir um projeto remove as pastas dele; as sessões permanecem.

Para listar só as sessões de um projeto:

1. No topo da barra lateral, clique no botão de filtro (**Filtrar e agrupar sessões**).
2. Em **Projeto**, o menu lista **Todos os projetos** e até oito dos seus projetos (acima dele ficam **Agente** e **Executa em**; **Novo projeto…** e **Agrupar por pasta ou projeto** ficam abaixo). Escolha um projeto.

A lista de sessões passa então a mostrar só as sessões desse projeto, por dia, o botão de filtro fica colorido enquanto há um filtro ativo, e um chip com o nome do projeto aparece sob **Nova sessão**: clique no × dele para ver todas as sessões de novo. Você também pode escolher **Todos os projetos**. Os outros filtros funcionam ao mesmo tempo: escolha um agente em **Agente** (ou um programa em **Executa em**) para mostrar só as sessões dele no projeto. Se o projeto for excluído, a lista volta a mostrar todas as sessões.

Nos detalhes do projeto, **Mais** (⋯) → **Só as sessões dele na barra lateral** faz o mesmo, com uma marca de seleção enquanto está ativo; escolha de novo para ver todas as sessões.

No celular, abra primeiro a barra lateral (uma gaveta).

## Compartilhar um projeto com pessoas

Você pode convidar pessoas para um projeto, como um orientador e os alunos que trabalham com você, cada uma com um link próprio. Sem a sua senha, elas veem os documentos do projeto, as sessões e, quando houver, as execuções e a lista de leitura. Elas comentam os documentos sob o próprio nome e, se você permitir, também alteram os documentos. Nunca chegam aos seus agentes, aos seus arquivos, às suas configurações nem aos seus outros projetos. Para compartilhar uma coisa só (um documento, uma página, uma imagem, um vídeo…), veja [Compartilhar com pessoas](/guide/library#share-with-people).

### Convidar alguém

1. Abra os detalhes do projeto e clique em **Mais** (⋯) no topo, depois em **Compartilhar com pessoas**.
2. Em **Convidar alguém**, digite **Nome da pessoa**. Os comentários e as alterações dela aparecem com esse nome.
3. Escolha o que a pessoa pode fazer:
   - **Ver e comentar**: a pessoa lê tudo o que o projeto compartilha e comenta os documentos, documentos LaTeX, slides, planilhas e páginas dele.
   - **Editar documentos**: a pessoa também altera os documentos, planilhas, slides, páginas e designs do projeto, nos editores do próprio app (as palavras, as imagens e o layout de uma página, nunca o código dela), e os documentos LaTeX nos casos em que este computador os compõe em ambiente isolado (veja [O que nunca é compartilhado](#what-is-never-shared)).
4. Escolha por quanto tempo o link funciona: **Uma semana**, **Um mês** ou **Até você parar**.
5. Clique em **Gerar o link da pessoa**. Copie-o com o botão de copiar e envie para ela, ou clique no botão de QR code para mostrá-lo como um QR code para a câmera do celular dela. O link só é mostrado agora: o app guarda apenas uma impressão digital dele, então não consegue mostrá-lo de novo. Você sempre pode gerar um novo.

Um agente também pode gerar um link, com a sua aprovação a cada vez: "Compartilhe meu projeto Tese com a Maria para que ela possa comentar, por um mês."

### O que a pessoa vê

O link dela abre o projeto sozinho, com a aparência do app, sem mais nada seu ao redor:

- No topo, a marca do projeto, o nome e o assunto dele. À direita, o nome da própria pessoa: o menu dela diz o que ela pode fazer e até quando, e quem compartilhou com ela, e tem **Idioma** (English, Deutsch, 中文, Ελληνικά) e **Tema** (**Claro**, **Escuro** ou **Como este dispositivo**) para o navegador dela.
- **Documentos**: as páginas, os documentos, slides, planilhas, documentos LaTeX e notebooks do projeto, cada um com a sua imagem. Um deles abre para leitura como o endereço dele o mostra (um documento LaTeX composto em páginas, com o código-fonte a um clique), com **Baixar** para os arquivos dele: um PDF, um documento do Word, o projeto LaTeX e assim por diante. Com **Editar documentos**, documentos, planilhas, slides, páginas e designs abrem no editor.
- **Sessões**: as sessões do projeto, como um [link somente leitura](/guide/devices#share-a-session-with-a-read-only-link) mostra uma sessão: a conversa, os passos pelo nome, as alterações em arquivos e as páginas que o agente mostrou, acompanhando em tempo real enquanto um agente trabalha. Nunca a saída de comandos, o raciocínio do agente nem o que foi dado a um passo. Uma sessão confidencial nunca aparece.
- **Execuções**, quando o projeto tem experimentos: o nome de cada execução, como ela foi e quando, as métricas e as configurações. Nunca o comando, a pasta, o log nem a máquina em que ela rodou.
- **Lista de leitura**, quando o seu app Lista de leitura tem artigos para o projeto: o título de cada artigo (um link para ele), os autores, o veículo e o ano, se já foi lido e as tags. Nunca as suas notas sobre ele nem os arquivos dele.

A página se atualiza sozinha, a cada minuto, enquanto está aberta. Os agentes que trabalham no projeto são avisados de com quem ele está compartilhado e de que essas pessoas leem as sessões, por isso mantêm chaves, senhas e detalhes privados fora delas.

### Comentários sob o nome da pessoa

Em um documento, documento LaTeX, slides, planilha ou página, **Comentários** (ao lado dele, ou sobre ele no celular) lista os comentários e as respostas, cada um sob o nome de quem o escreveu: os da pessoa como **Você**, os de um agente como **Agente**, e os seus sob o seu nome. Na parte de baixo da caixa Compartilhar, **Ela vê seus comentários como** mostra esse nome ("Owner" até você mudar); **Variação** define outro.

Para comentar, a pessoa clica em **Adicionar um comentário** e cola as palavras a que ele se refere, copiadas do documento, ou as deixa de fora para comentar o documento inteiro; em slides ela escolhe o slide, e em uma planilha a aba e a célula (como B4). Ela pode responder a qualquer comentário e resolver ou reabrir um, mas só altera ou exclui os próprios. Com **Editar documentos**, ela comenta no próprio editor, como você.

No seu editor, os comentários dela aparecem sob o nome dela, e os agentes os leem e respondem como respondem aos seus: "Responda aos comentários da Maria no Capítulo 3." Os agentes são orientados a tratar os comentários dela como pedidos sobre o documento apenas, e a não fazer mais nada que ela peça (executar um comando, abrir um arquivo, escrever para alguém) a menos que você peça. Quando alguém comenta ou responde, você recebe um aviso ("Maria comentou: …") e uma linha na sua [Caixa de entrada](/inbox) ("Maria comentou em “Tese, capítulo 3”"), que fica até você ou um agente responder, ou o comentário ser resolvido.

Cada comentário é salvo como uma nova versão do documento; uma sequência deles é guardada como uma só versão. Se você salvar o documento no editor enquanto chegaram comentários, eles são mantidos, nas palavras a que se referiam.

### Alterações sob o nome da pessoa

Com **Editar documentos**, o que a pessoa salva é uma nova versão do documento, com o nome dela na lista de **Versões**, e os agentes são avisados de quem o alterou por último. Ela não pode mudar quem escreveu os comentários de outra pessoa, nem excluí-los. Se o documento mudou desde que ela o abriu, ela é consultada antes de salvar a versão dela por cima (a outra versão fica entre as versões dele).

### Alterar ou parar de compartilhar

Na caixa Compartilhar, **Compartilhado com** lista cada pessoa, com o que ela pode fazer, até quando e o que fez por último. O **Mais** (⋯) dela tem:

- **Ver e comentar** ou **Editar documentos**: o que ela pode fazer, a partir do próximo clique.
- **Por uma semana a partir de agora**, **Por um mês a partir de agora** ou **Até você parar**.
- **Gerar um novo link**: o link dela para de funcionar na hora; envie a ela o novo. Ela continua sendo a mesma pessoa, e os comentários continuam dela.
- **Parar de compartilhar**: o link dela para de funcionar na hora. O que ela escreveu permanece, sob o nome dela.

Um link que expirou, foi desativado ou foi gerado de novo avisa isso quando é aberto ("Este link expirou", "Este link foi desativado"), e a pessoa pode pedir um novo a você.

### O que nunca é compartilhado

- **Seus agentes**: as pessoas não podem começar nem conduzir uma sessão, nem perguntar nada a um agente. Elas leem sessões e comentam documentos.
- **Seus arquivos**: nem a pasta do projeto, nem qualquer pasta sua. Só o que o projeto guarda (as páginas, os documentos, as imagens e afins), e as sessões dele como links somente leitura os mostram.
- **Suas configurações, seus outros projetos** e todo o resto do app. O link de um grupo mostra as coisas do próprio grupo, não as dos projetos que ele reúne.
- **Executar qualquer coisa**: uma página de HTML (um app pequeno, um acompanhador) aparece com os dados como estão, e o que ela altera não é guardado; com **Editar documentos** a pessoa altera as palavras, as imagens e o layout, nunca o código (os scripts e o que roda quando algo é clicado); um notebook mostra as células e as saídas e nunca executa. Documentos LaTeX só são alterados por um link onde o TeX roda isolado pelo bubblewrap (Linux); nos outros casos, as pessoas leem e comentam.

Cada link é um código aleatório longo que abre um projeto para uma pessoa. Um código que não abre nada conta como uma senha errada do endereço de onde veio: depois de dez em uma hora, esse endereço não pode abrir links nem entrar por uma hora (veja [Acessar o app de outro dispositivo](/guide/devices#reach-the-app-from-another-device)).

## Conhecimento compartilhado: documentos que toda sessão pode pesquisar

Os agentes podem pesquisar documentos que você adiciona uma vez: contratos, manuais, notas, artigos, uma pasta inteira. Eles encontram trechos pelas palavras ou pelo significado, e citam o arquivo e a página que leram. Os documentos ficam em **bases de conhecimento**: coleções com nome de arquivos que você soltou e de pastas deste computador.

- **Conhecimento compartilhado** ([a página Conhecimento compartilhado](/knowledge)): toda sessão o pesquisa, também em um projeto, a menos que o projeto desative isso.
- **O conhecimento próprio de um projeto**, na aba **Memória** dele (o chip **Documentos**): só as sessões desse projeto o pesquisam, e as sessões de um grupo que reúne o projeto.

O Conhecimento compartilhado é uma página própria, sem coluna de projetos ao lado. Para abri-la, clique em **Conhecimento compartilhado** no texto no topo de [Configurações → Memória](/settings?s=memory), ou digite "conhecimento compartilhado" na caixa de busca (Ctrl+K).

## Adicionar documentos

Sem nenhum conhecimento compartilhado ainda, a página diz "Adicione seus documentos uma vez" sobre uma caixa grande para soltar documentos. Solte arquivos ou uma pasta ali, e uma base de conhecimento chamada "Meus documentos" é criada para eles. **Começar com uma pasta deste computador** cria uma base "Meus documentos" vazia, na qual você depois adiciona uma pasta.

Toda base de conhecimento tem a própria caixa de soltar e o próprio botão **Adicionar uma pasta neste computador**. Para começar outra base, clique em **Nova base de conhecimento** no topo da página (**Nova** no celular). Bases separadas mantêm as coisas à parte, e um agente pode pesquisar uma base pelo nome, mas uma só basta para começar.

### Soltar ou escolher arquivos

Arraste documentos ou uma pasta para a caixa de uma base de conhecimento ("Solte documentos ou uma pasta aqui"), ou clique em **escolher arquivos**, ou em **pasta** para escolher uma pasta inteira. Os arquivos são copiados para a pasta de dados do app e lidos assim que entram, então mudanças posteriores nos originais não chegam à base. Um pequeno painel mostra o envio. Se já houver na base um arquivo com o mesmo nome, o painel pergunta se você quer **Substituir** o arquivo, **Ignorar existentes** ou **Cancelar**.

Os arquivos vêm do dispositivo que você está usando. No celular, **escolher arquivos** abre o seletor de arquivos do celular; escolher uma pasta inteira só é possível no computador.

### Adicionar uma pasta neste computador

1. Em uma base de conhecimento, clique em **Adicionar uma pasta neste computador**.
2. No menu que se abre ("Uma pasta para ler e manter atualizada"), digite o nome de uma pasta para encontrá-la entre as pastas que você usou recentemente e as da sua pasta pessoal, ou digite o caminho dela, como `~/Documents/Manuals`. Escolha-a.

A pasta é lida onde está: nada é copiado. Ela aparece como uma etiqueta na base, e a base a acompanha. Um minuto depois de o app iniciar, e a cada hora depois disso, o app lê o que é novo ou mudou na pasta e descarta o que foi excluído; depois de uma inicialização, ele também tenta de novo os documentos que não puderam ser lidos, que uma versão mais nova pode conseguir ler. Para lê-la na hora, escolha **Ler de novo agora** no menu da base.

"Este computador" é aquele em que o Hydor roda, que pode não ser o dispositivo à sua frente.

Para parar de ler uma pasta, clique no × da etiqueta dela. Os documentos dela saem da base; a pasta e os arquivos dela não são tocados.

### O que pode ser lido

- **Documentos**: PDF, Word, Excel, PowerPoint, OpenDocument, EPUB, CSV e RTF; também arquivos antigos .doc, .xls e .ppt quando o LibreOffice está instalado neste computador.
- **Texto**: texto simples e Markdown, páginas da web (o texto delas, sem a marcação) e arquivos de código e de dados, como JSON, YAML, Python ou JavaScript.

Ficam de fora: imagens; arquivos e pastas cujos nomes começam com ponto (os ocultos); e as pastas que as ferramentas criam, como `node_modules`, `.git`, `dist`, `build`, `target` e `venv`. Uma pasta é lida até 20.000 arquivos e 12 níveis de profundidade. De um arquivo de texto com mais de 4 MB, como um log ou arquivo de dados grande, são lidos os primeiros 4 MB, e o último trecho diz onde foi cortado. Documentos com mais de 300 MB não são lidos. Um PDF digitalizado sem camada de texto não tem texto para pesquisar.

Cada documento é cortado em trechos de até cerca de 1.400 caracteres, cada um guardando a página, o slide, a aba ou o título de onde veio, para que os agentes possam citá-lo.

## Ver o que uma base de conhecimento guarda

Cada base de conhecimento é um cartão. Sob o nome dela, uma linha conta o que ela guarda: os documentos e os trechos, quanto dela está pronto para a busca por significado (quando está ativada: "pronto para a busca por significado", ou uma porcentagem enquanto ela se prepara, subindo conforme avança), e há quanto tempo foi lida pela última vez ("lido há 25 min"). Enquanto está sendo lida, a linha começa com "Lendo 12 de 40…".

Enquanto a busca por significado está ativada mas não consegue preparar os trechos agora, uma linha acima das bases de conhecimento diz o motivo, e os agentes encontram trechos pelas palavras até lá:

- **A busca por significado está sendo configurada neste computador**, com o que ela está fazendo (instalando o PyTorch, por exemplo): uma vez, na primeira vez.
- **A busca por significado está iniciando**: carregando o modelo dela (baixando-o, na primeira vez).
- **A busca por significado está esperando por memória**, com quanto há livre e quanto ela precisa. Ela tenta de novo a cada poucos minutos; fechar alguns programas ajuda.
- **A busca por significado parou**, com o motivo. Clique em **Tentar de novo** depois de resolver o problema (instalar o Python, por exemplo), ou tente de novo em [Configurações → Memória](/settings?s=memory&find=Search%20by%20meaning).

- **Mostrar os documentos** lista todos os documentos: o nome ou o caminho, depois quantos trechos ele tem e o tamanho. Um alfinete marca um documento que você fixou para a memória wiki e, enquanto a memória wiki está ativada, o menu **Mais** da linha dele tem **Ler na memória wiki** (fixá-lo) ou **Não ler na memória wiki** (veja [Quando um projeto tem documentos demais](/guide/wiki-memory#when-a-project-has-too-many-documents)). **sem texto** marca um documento sem nada para ler nele, e **não foi possível ler** um que falhou; aponte para ele para ver o motivo. Clique em um documento para abri-lo. **Ocultar os documentos** recolhe a lista.
- Quando alguns documentos não puderam ser lidos, uma linha vermelha diz quantos, com os primeiros e o motivo de cada um.
- Um arquivo que você soltou pode ser removido com o × no fim da linha dele (no computador, ele aparece quando você aponta para a linha). Isso exclui a cópia da base. Um documento de uma pasta deste computador não tem ×: remova-o da própria pasta, ou pare de ler a pasta.

## Renomear, mover, ler de novo ou excluir uma base de conhecimento

O botão ⋯ (**Mais**) no canto superior direito de uma base de conhecimento abre o menu dela:

- **Ler de novo agora**: lê de novo os arquivos e as pastas dela imediatamente, para arquivos recém-adicionados ou uma pasta que mudou, e tenta de novo os documentos que não puderam ser lidos.
- **Renomear**: abre **Renomear a base de conhecimento**. Digite o novo nome (até 60 caracteres) e clique em **Salvar**.
- **Mover para**: **Conhecimento compartilhado** ou um dos seus projetos; uma marca de seleção indica onde a base está agora. Em um projeto, só as sessões desse projeto a pesquisam; no conhecimento compartilhado, todas as sessões a pesquisam. Este item aparece quando você já tem projetos.
- **Excluir**: pergunta “Excluir *nome*?” Os trechos dela somem, e os arquivos soltos nela junto; as pastas deste computador continuam como estão. Clique em **Excluir** para continuar.

## Dar documentos próprios a um projeto

Abra os detalhes do projeto, vá até a aba **Memória** e escolha o chip **Documentos**.

- Adicione documentos com **Adicionar** → **Arquivos…**, ou solte arquivos ou uma pasta em qualquer lugar da aba: uma base de conhecimento com o nome do projeto é criada para eles, e os documentos entram na lista. **Adicionar** → **Uma pasta para manter atualizada…** (ou **Adicionar uma pasta** sob o chip) lê uma pasta deste computador no lugar onde ela está, como em [Adicionar uma pasta neste computador](#add-a-folder-on-this-computer); um × ao lado de uma pasta para de lê-la, depois de perguntar. Sem nenhum documento ainda, o chip é uma área para soltar arquivos, com **Adicionar uma pasta para manter atualizada** embaixo.
- Cada documento é uma linha ("Documento · 12 trechos · 2,1 MB · lido ontem"). Clique nela para ver de onde ele vem, o formato, o tamanho e os trechos, quando foi lido, **Abrir**, **Remover** (para um arquivo que você adicionou: isso exclui a cópia que o Hydor guardou) e **Ler na memória wiki**. **Ler os documentos novamente**, no menu **⋯**, lê os arquivos e as pastas de novo na hora.
- A caixa de busca acima da lista pesquisa os documentos junto com as notas e a wiki do projeto (veja [Faça uma busca você mesmo](#try-a-search-yourself)).
- Se as sessões do projeto também pesquisam o conhecimento compartilhado é uma opção na aba **Configurações** dele, **Pesquisar também o conhecimento compartilhado**, ativada a menos que você a desative: desativada, elas pesquisam apenas os documentos do próprio projeto (e, em um grupo, os dos projetos dele). A linha abaixo diz quantos documentos compartilhados existem, com um link para **Conhecimento compartilhado**.

Uma base de conhecimento pode ser movida para um projeto a partir do menu dela na página Conhecimento compartilhado (**Mover para**), e de volta. O índice de busca da própria wiki, uma base chamada "Project wiki", não aparece na lista de documentos de um projeto.

## Como os agentes pesquisam seus documentos

Quando há pelo menos uma base de conhecimento, os agentes ganham ferramentas para pesquisar os documentos que a sessão deles pode pesquisar, para ler mais de um documento em volta de um trecho e para listar o que as bases de conhecimento contêm. Claude Code, Codex, Custom e os agentes que usam ACP e aceitam servidores MCP (servidores de ferramentas) recebem todos essas ferramentas.

No início de uma sessão, o agente é informado de quais bases de conhecimento pode pesquisar e quantos documentos cada uma tem; em um projeto, também se cada uma é do próprio projeto, compartilhada ou de um projeto que o grupo dele inclui. Ele é instruído a pesquisar ali primeiro, antes da web ou da memória, quando uma pergunta puder ser respondida por elas; a responder com base no que os trechos dizem; a citar cada trecho que usar com o arquivo e a página ou parte, e o caminho; e a avisar quando os documentos não respondem à pergunta.

Na conversa, uma busca aparece como uma etapa: **Pesquisou seus documentos**, o que ela procurou e quantos trechos encontrou, ou “nada encontrado”. Clique nela para ver os trechos, cada um com o arquivo, a página e a base de conhecimento. Clique em um trecho para abrir o arquivo.

### Por palavras, por significado ou pelo texto exato

Os agentes pesquisam de três maneiras:

- **Por palavras**: trechos que contêm as palavras da pergunta, com as melhores correspondências primeiro. Sempre disponível.
- **Por significado**: trechos que significam o que a pergunta pede, mesmo com outras palavras ou em outro idioma. Isso precisa da **Busca por significado**, que fica ativada a menos que você a desative em [Configurações → Memória](/settings?s=memory&find=Search%20by%20meaning). Ela roda neste computador e, enquanto estiver ativada, todas as bases se preparam para ela em segundo plano (veja [Memória](/guide/memory#search-by-meaning)). Enquanto estiver desativada, a página Conhecimento compartilhado e a aba Conhecimento de cada projeto indicam onde ativá-la, e os agentes encontram trechos pelas palavras.
- **Pelo texto exato**: uma frase entre aspas (“prazo de aviso prévio”) ou um padrão entre barras (uma expressão regular, como `/INV-\d+/`), encontrado como o comando grep o encontraria: para nomes, números e códigos. Esses trechos vêm na ordem em que aparecem nos documentos.

Um agente pesquisa por palavras e por significado ao mesmo tempo, a menos que peça apenas um deles, e uma pergunta entre aspas ou entre barras é pesquisada de forma exata. Ele recebe 8 trechos por vez, a menos que peça mais (até 25), e pode pesquisar uma base de conhecimento pelo nome.

### Faça uma busca você mesmo

Na página Conhecimento compartilhado, acima das bases de conhecimento, um campo diz "Faça uma busca, como os agentes: uma pergunta, ou “palavras exatas” entre aspas". Digite e pressione Enter. Voltam até 10 trechos, cada um com o arquivo e a página, a base de conhecimento e como foi encontrado: **por palavras**, **por significado**, ou ambos, ou **por texto exato** para texto exato. Clique em um para abrir o arquivo.

Na página Conhecimento compartilhado, esse campo pesquisa o que uma sessão fora de qualquer projeto pesquisa. Em um projeto, a caixa de busca da aba **Memória** dele pesquisa as notas, a wiki e os documentos do próprio projeto juntos, e nunca o conhecimento compartilhado.

## Quais sessões pesquisam qual conhecimento

| Uma sessão… | pesquisa |
|---|---|
| fora de qualquer projeto | o conhecimento compartilhado |
| em um projeto | os documentos do próprio projeto e o conhecimento compartilhado, a menos que o projeto o desative |
| em um grupo | os documentos do próprio grupo, os documentos de todos os projetos que ele reúne e o conhecimento compartilhado, a menos que o grupo o desative |
| iniciada por outra sessão (um subagente do Hydor) | o que a sessão que a iniciou pesquisa |

As ferramentas de conhecimento nunca trazem os documentos de outro projeto, nem mesmo quando um agente pede um arquivo pelo caminho. Uma base de conhecimento cujo projeto foi excluído passa a ser compartilhada.

## Peça a um agente

- "Crie um projeto chamado Impostos 2026 para meus recibos e minha declaração de imposto de renda. As sessões dele devem começar como o Pesquisador, e todos os agentes dele devem saber que os valores estão em EUR."
- "Crie um projeto chamado Loja para o meu código em ~/code/shop."
- "O que o meu projeto Tese guarda nos arquivos dele? Mova a planilha de acompanhamento de leituras para dentro dele."
- "Salve este relatório no meu projeto Tese, na pasta reports dele."
- "Em quais pastas eu andei trabalhando que ainda não estão em um projeto? Crie projetos para as duas que mais uso."
- "Quais dos meus projetos vieram do Claude Code ou do Codex?"
- "Abra a página Projetos e ordene meus projetos por mais sessões."
- "Qual dos meus projetos ficou um mês sem nenhuma sessão?"
- "Não crie um projeto para ~/code/scratch por conta própria."
- "Copie ~/Downloads/contract.pdf para o meu projeto Impostos 2026 e faça com que ele trabalhe também com ~/Documents/Receipts."
- "Agrupe meus projetos Tese e Notas de leitura em um só chamado Tudo para a tese."
- "Dê uma habilidade ao meu projeto Tese: citar no formato APA 7 e conferir se todo DOI funciona antes de eu entregar um capítulo."
- "Copie a habilidade de redação para o meu projeto Jardim e altere-a lá para usar palavras simples para crianças."
- "No meu projeto Site da loja, ative a habilidade docker e desative a habilidade deploy do Claude Code, só para esse projeto."
- "Adicione a pasta ~/Documents/Manuals ao meu conhecimento compartilhado."
- "Torne meu projeto Impostos 2026 privado: outros projetos não devem poder pesquisá-lo."
- "Mova a base de conhecimento Contratos para o projeto Impostos 2026 e faça esse projeto parar de pesquisar o conhecimento compartilhado."
- "Quais bases de conhecimento eu tenho e quais documentos não puderam ser lidos?"
- "Compartilhe meu projeto Tese com a Maria para ela poder comentar, por um mês, e com o Nikos para ele poder editar os documentos."
- "Com quem o meu projeto Tese está compartilhado e o que cada pessoa fez por último?"
- "Responda aos comentários da Maria no Capítulo 3 e depois marque como resolvidos os que você tratou."
- "Pare de compartilhar meu projeto Tese com o Nikos."
