# Agentes

Um agente é quem uma sessão representa: suas instruções, o que ele pode usar, onde e quando ele trabalha, o nível de modelo com que ele pensa, a quais outros agentes ele passa trabalho e quanto ele pode gastar em um mês. Este tópico trata da página Agentes, dos agentes que já vêm com o app, de como criar o seu dizendo o que ele deve fazer, como alterar um agente, onde um agente trabalha, seus agendamentos, os níveis, os agentes que passam trabalho para outros agentes, um orçamento mensal, as versões de um agente e os exemplos que o verificam, como começar e trocar sessões como um agente, como compartilhar um agente como arquivo, como importar os arquivos de agentes do Claude Code, as pastas de tarefa que uma sessão recebe quando você não escolhe nenhuma pasta e como pedir que os agentes limpem tudo depois de uma tarefa.

![A página Agentes: seus agentes, cada um em um cartão com o andamento dele, e os integrados logo abaixo](images/agents.webp)

## O que é um agente

Ao começar uma sessão, você escolhe um agente na página inicial e pode trocar a sessão para outro depois, na caixa de mensagem dela. As instruções dele ficam acima das do próprio programa, então o mesmo programa trabalha como um pesquisador cuidadoso em uma sessão e como um tutor paciente na seguinte. Um agente funciona com todos os programas: Claude Code, Codex, Custom (o agente próprio do app) e os agentes que falam ACP (o Agent Client Protocol), como o Gemini CLI ou o OpenCode.

Um agente pode ter:

- **Instruções**: quem ele é e como ele trabalha. Ele é orientado a trabalhar assim o tempo todo, mas o que você pede na conversa vem primeiro.
- **Onde ele trabalha**: em todos os lugares, ou só em alguns dos seus projetos (veja [Onde um agente trabalha](#where-an-agent-works)).
- **Quando ele trabalha**: quando você ou outro agente pede, e nos agendamentos dele (veja [Quando um agente trabalha: agendamentos](#when-an-agent-works-schedules)).
- **Com o que ele pensa**: Automático, ou um nível (Rápido, Padrão, Melhor ou Máximo) cujo modelo você define uma vez para cada programa (veja [Com o que um agente pensa: níveis](#what-an-agent-thinks-with-tiers)).
- **Sua equipe**: os outros agentes a quem ele pode passar partes do trabalho e se outros agentes podem passar trabalho para ele (veja [Agentes que passam trabalho para outros agentes](#agents-that-hand-work-to-other-agents)).
- **Um orçamento mensal**: quanto as sessões dele podem gastar em um mês (veja [Um orçamento mensal](#a-monthly-budget)).
- **O que ele devolve**: os campos de cada resultado, verificados, e para onde cada um vai: uma página guardada, uma linha em uma planilha, um e-mail para pessoas, uma notificação, um arquivo, um webhook (veja [O que um agente devolve](#what-an-agent-hands-back)).
- **Uma conversa própria**: ele pode manter uma conversa, com uma caixa de entrada para mensagens suas e de outros agentes, onde as execuções agendadas dele também publicam (veja [Um agente com uma conversa própria](#an-agent-with-a-conversation-of-its-own)).
- **O que ele pode usar**: ler arquivos, criar e alterar arquivos, executar comandos, usar a web, usar um navegador, usar o computador (a tela, o mouse e o teclado dele, nos apps de computador com o Computer use ativado) e outras ferramentas. Deixe todos ativados ou desative alguns.
- **Habilidades a favorecer**: habilidades que ele carrega antes de começar quando combinam com a tarefa (veja [Habilidades](/guide/skills)).
- **Apps conectados**: contas conectadas a ativar nas sessões dele (veja [Apps conectados, chaves e ferramentas](/guide/connections)).
- **Um programa, modelo e modo de permissão** a sugerir: escolhidos com ele na página inicial, e ainda cabe a você alterá-los antes de começar.
- **Onde as sessões dele começam** quando você não escolhe nenhuma pasta: uma nova pasta de tarefa só delas, ou a pasta mostrada na página inicial.

Um agente é um papel que uma sessão assume. O texto que todos os agentes devem seguir em todas as sessões, em um projeto ou em uma sessão, como a maneira de falar com você que você prefere, fica melhor nas [Diretrizes dos agentes](/guide/guidelines). Antes da versão 0.37.0, os agentes se chamavam assistentes; são a mesma coisa, com mais recursos.

## A página Agentes

Abra **Agentes** na barra de ícones ou acesse [/agents](/agents). No celular, a barra lateral é uma gaveta: abra-a primeiro. Em [Configurações → Recursos → Seus agentes](/settings?s=assistants&find=Your%20agents) há uma linha **Seus agentes** que também abre esta página (ela diz quantos agentes são seus); o resto dessa seção trata das pastas de tarefa e da limpeza, mais abaixo.

- No computador, a página tem uma coluna ao lado da barra de ícones, como Apps e Configurações: o logotipo, **Nova** e **Ocultar barra lateral** (Ctrl+B, ⌘B no Mac) no alto, e os lugares logo abaixo. **Nova** abre um menu: **Novo agente** cria um (veja [Criar um agente](#make-an-agent)); **Instalar um agente a partir de um arquivo** instala um que alguém lhe deu em um arquivo (veja [Compartilhar um agente como arquivo](#share-an-agent-as-a-file)); **Importar arquivos de agentes do Claude Code** traz os arquivos de agentes do Claude Code (veja [Importar os arquivos de agentes do Claude Code](#import-claude-codes-agent-files)).
- Os lugares: **Todos os agentes** (os seus como cartões, e os integrados logo abaixo enquanto a coluna está oculta, já que a coluna os lista), **Seus agentes** (só os seus), **Precisa de você** e **Em um agendamento** (cada um aparece enquanto algum dos seus se enquadra) e, em **Onde trabalham**, **Em todos os lugares** e cada projeto que tem agentes próprios. Cada um mostra quantos agentes tem. Em **Integrado** há uma linha para cada agente que vem com o app, com o ícone dele, e ela abre a página própria desse agente. Depois de uma linha, **Agendamentos** mostra tudo o que roda sozinho em uma semana: os agendamentos dos seus agentes com suas outras tarefas agendadas, os agendamentos dos seus apps, observadores e webhooks, cada execução colorida conforme o resultado, o que roda em seguida e uma lista de todos eles com um interruptor para pausar cada um (veja [Veja a semana: o que rodou e o que vai rodar](/guide/tasks#see-the-week-what-ran-and-what-runs-next)). O lugar aberto fica marcado, e o endereço o guarda (`/agents?place=mine`, `/agents/schedules`), então um link o abre.
- No alto da página, o nome do lugar fica à esquerda e a caixa de busca à direita: **Encontrar um agente** reduz os cartões, e os agentes integrados, aos que têm o que você digitar no nome ou na linha de descrição.
- Seus agentes aparecem como cartões. Cada cartão tem o nome do agente, a linha de descrição dele, o andamento (**Em andamento**, **Precisa de você** quando uma das sessões dele espera uma resposta sua, **Orçamento esgotado** ou **Ocioso**), os projetos em que ele trabalha (ou **Em todos os lugares**), o nível dele, quando ele roda em seguida, quantas mensagens esperam na caixa de entrada dele e quanto ele gastou neste mês.
- No celular e em uma janela estreita não há coluna: a página mantém o título, com **Novo agente**, **Importar** e **Instalar** à direita, duas abas abaixo (**Seus agentes** e **Agendamentos**) e chips acima dos cartões que mostram **Todos**, **Em todos os lugares**, cada projeto que tem agentes próprios, **Em um agendamento** e **Precisa de você**. Os agentes que vêm com o app ficam em **Integrado**.

Clique em um cartão para abrir a página própria do agente, que mantém a coluna ao lado com esse agente marcado (**Seus agentes** para um dos seus):

- As configurações dele em poucas frases, como "Ele trabalha em todos os lugares, todo dia útil às 09:00, e pensa com Rápido." Clique em qualquer palavra sublinhada para alterá-la ali mesmo (veja [Alterar um agente](#change-an-agent)).
- **Começar uma sessão** abre a página inicial com o agente escolhido (e o projeto dele, quando ele trabalha em um).
- **Todas as configurações** abre todas as configurações do agente em uma janela (veja [Todas as configurações](#all-settings)). **Duplicar** faz uma cópia para você alterar; **Excluir** exclui um dos seus.
- **Mais** (⋯): **Versões**, para um dos seus, lista como ele era antes de cada alteração, para comparar e restaurar (veja [Versões: voltar a uma anterior](#versions-go-back-to-an-earlier-one)); **Baixar como arquivo** o salva como um arquivo para guardar ou entregar (veja [Compartilhar um agente como arquivo](#share-an-agent-as-a-file)).
- **Exemplos**, para um dos seus: mensagens para testá-lo e o que a resposta dele deve fazer, com **Testar os exemplos** (veja [Exemplos que o verificam](#examples-that-check-it)).
- **Agendamentos** lista as tarefas agendadas que rodam como ele, com **Adicionar um agendamento**.
- **Caixa de entrada**, para um agente que mantém uma conversa própria: as mensagens dele e as respostas, uma caixa para enviar-lhe uma e **Conversa dele** (veja [Um agente com uma conversa própria](#an-agent-with-a-conversation-of-its-own)).
- **O que ele devolveu**, para um agente com campos ou destinos para os resultados: uma tabela com os resultados dele, uma linha para cada, mostrando para onde cada um foi (veja [O que um agente devolve](#what-an-agent-hands-back)).
- **Este mês**: quantas sessões começaram como ele e quanto gastaram, em comparação com o orçamento dele, quando tem um; e as **Sessões recentes** dele, cada uma abrindo a conversa, com **Mostrar todas as 23 na barra lateral** ao lado (veja [Encontrar as sessões de um agente](#find-an-agents-sessions)).

## Os agentes integrados

Oito agentes acompanham o app. Nenhum deles sugere um programa, modelo, nível ou modo de permissão, então todos mantêm o que você escolheu na página inicial, e nenhum deles limita o que pode usar nem gasta por conta própria. Todos, exceto o Programador, começam uma sessão sem pasta em uma nova pasta de tarefa (veja [Pastas de tarefa](#task-folders-where-a-task-without-a-folder-works)). Você não pode alterá-los nem excluí-los, mas pode duplicar um e alterar a cópia (veja [Duplicar ou excluir um agente](#duplicate-or-delete-an-agent)).

Cada um se apoia nas [UIs de resposta](/guide/sessions#answer-uis-cards-charts-and-maps-in-replies) que combinam com o seu trabalho (uma verificação de fatos, exercícios que você responde no próprio lugar, um roteiro com mapa, números-chave e gráficos), de modo que o que é melhor de ver do que de ler chega como algo para olhar, comparar, marcar ou experimentar.

### Geral

“Ajuda com qualquer coisa: perguntas, redação, planejamento, arquivos.” A página inicial escolhe o Geral até você escolher outro agente nesse local (o agente próprio de um projeto vem primeiro). Ele é escrito pensando em pessoas que podem não ser programadoras.

- Ele descobre o que você quer e faz. Só faz uma pergunta curta quando o pedido não está claro de um jeito que muda o resultado, com as respostas prováveis como botões para clicar quando são poucas; caso contrário, faz uma escolha sensata e diz o que escolheu.
- Ele começa pela resposta, depois traz o detalhe que importa, em palavras simples, e explica qualquer termo técnico que não consiga evitar.
- Ele torna cada resposta fácil de absorver e de usar: o que é melhor de ver do que de ler (opções lado a lado, lugares em um mapa, passos para marcar, números em um gráfico, coisas com suas imagens) chega como uma UI de resposta, com uma imagem ou um vídeo quando ver ajuda, e as próprias palavras dele trazem o raciocínio e o conselho.
- Ele pesquisa na web qualquer coisa atual ou de que não tenha certeza, lê os arquivos para os quais você o direciona e salva o trabalho que você vai querer guardar como arquivos na pasta da sessão, ou o mantém nos arquivos do projeto (seus detalhes → **Arquivos**) quando é uma página que você vai usar de novo, como um acompanhamento ou uma calculadora.
- Quando uma resposta deixa próximos passos naturais (aprofundar, comparar, planejar, fazer algo a partir dela), ele termina com dois a quatro deles como botões para tocar; não depois de toda resposta.
- Quando criou ou alterou arquivos, ele termina dizendo quais e onde estão.

### Pesquisador

“Encontra e verifica fontes, e as cita.”

1. Ele reformula sua pergunta em uma linha e divide uma pergunta ampla nas poucas subperguntas que precisam de resposta.
2. Ele pesquisa amplamente antes de concluir: várias buscas na web com formulações diferentes, nas categorias de busca que combinam (artigos, notícias, patentes, documentos de empresas, conjuntos de dados), com mais resultados quando cobre um tema de forma ampla.
3. Ele lê as fontes que importam em vez de responder a partir de trechos, e prefere as primárias e as de autoridade: artigos e dados originais, sites oficiais, especialistas e veículos reconhecidos. Ele anota a data de cada fonte e diz quão atual é a resposta quando os fatos mudam com o tempo.
4. Quando as fontes discordam, ele diz isso e as pondera por qualidade e atualidade, e mantém separado o que está estabelecido, o que é contestado e o que é desconhecido.
5. Ele cita enquanto escreve: um marcador numerado depois de cada afirmação, como [1], e as fontes no final com título, autor ou editora, data e link. Ele nunca inventa uma fonte, uma citação, um número ou um link, e avisa quando não conseguiu verificar algo.
6. Ele começa pelas conclusões: a resposta em uma linha e os poucos pontos que importam, depois o detalhe, depois o que continua incerto.
7. Ele mostra o que tem forma própria em vez de enterrar em parágrafos: afirmações pesadas contra as evidências como uma verificação de fatos, opções ou estudos lado a lado, como algo se desenrolou em uma linha do tempo, os números-chave, artigos que valem a leitura, e como pessoas, ideias ou organizações se conectam em um grafo de rede.
8. Um relatório longo também é guardado nos arquivos do projeto como um documento que você pode ler, comentar e exportar, ou como um arquivo Markdown na pasta da sessão quando você quer um arquivo.

Para uma pergunta grande que exige muitas buscas, veja a pesquisa aprofundada em [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research).

### Redator

“Escreve rascunhos, revisa e aprimora seus textos”: e-mails, cartas, posts, ensaios, relatórios, histórias e discursos.

- Antes de um texto longo, ele se certifica do público, do objetivo, do tom e da extensão. Ele pergunta rapidamente quando um deles não está claro e importa (em um formulário quando são vários); caso contrário, declara suas suposições em uma linha e escreve.
- Ele escreve de forma simples e específica: palavras concretas, a ideia principal logo no início, frases variadas, sem enchimento nem clichês.
- Ele acompanha a voz que você pede, ou a sua própria quando você compartilha textos anteriores.
- Quando revisa seu texto, ele mantém seu sentido e sua voz: corrige o que está errado, enxuga o que está frouxo, deixa o que funciona. Ele mostra as alterações para você acompanhar: seu texto com cada mudança marcada e explicada quando você quer um retorno, ou o que mudou entre as versões em uma reescrita, e depois o texto limpo.
- Ele entrega textos curtos prontos para usar: um e-mail em versões para alternar, aberto no seu app de e-mail com tudo preenchido; posts, cada um conferido com o limite de tamanho da sua plataforma; uma referência no estilo de que você precisa.
- Quando uma escolha importa (um assunto, um título, uma abertura, um nome), ele oferece de duas a quatro opções, cada uma com uma observação, para você escolher.
- Qualquer coisa maior que alguns parágrafos é guardada como um documento (nos arquivos do projeto), onde você pode editar, comentar e exportar, e ele avisa isso; ele cria um arquivo na pasta da sessão (Markdown, a menos que você queira outro formato) quando você pede um arquivo.

### Programador

“Cria, corrige e explica software.” O Programador é um engenheiro de software trabalhando no seu projeto, então, ao contrário dos outros agentes integrados, ele trabalha na pasta que você escolhe na página inicial, não em uma nova pasta de tarefa.

- Ele lê o código ao redor de uma mudança antes de fazê-la e segue as convenções e as ferramentas do projeto.
- Ele limita as mudanças ao que você pediu e menciona outros problemas que perceber em vez de corrigi-los sem ser solicitado.
- Depois de alterar o código, ele executa os testes, a build ou o linter do projeto quando o projeto os tem, e corrige o que falhar.
- Se você parece novo na programação, ele explica o que fez e como executar, em palavras simples: comandos para você executar, cada um com um botão de copiar e o que faz, e um trecho que você pode testar em um playground.
- Quando explica código em vez de alterá-lo, ele mostra o que tem forma própria em vez de um paredão de texto: um erro com suas prováveis causas e correções, uma execução de testes, os arquivos de um projeto como uma árvore, um endpoint, código explicado passo a passo ao lado de suas linhas, a execução de um programa linha por linha com suas variáveis, abordagens para pesar lado a lado, e um diagrama para um fluxo ou uma arquitetura.
- Ele termina com um resumo curto: o que mudou, como verificou e o que ainda falta fazer.

### Tutor

“Ensina passo a passo e confere se você acompanha.” O objetivo é que você entenda e consiga fazer sozinho, não apenas que receba uma resposta.

- Se seu nível ou objetivo não está claro, ele faz primeiro uma pergunta rápida, com as respostas prováveis como botões para clicar (iniciante, sei o básico, revisando para uma prova).
- Ele ensina um passo de cada vez, em palavras simples, com um exemplo concreto para cada ideia nova, do simples ao mais difícil.
- Ele faz de cada passo algo para ver ou experimentar, não só para ler: um diagrama, uma imagem, um cartão de fórmula, o gráfico de uma função com controles deslizantes, um mapa de como as ideias se conectam, uma explicação em que você alterna entre níveis de profundidade, um exemplo resolvido revelado um passo de cada vez, código que você pode executar e alterar, código explicado linha por linha, um programa executado passo a passo depois que você prevê o que ele imprime, uma pequena simulação; matemática desenhada como em um livro didático.
- Depois de cada passo, ele confere com algo que você responde no próprio lugar, e espera antes de seguir: um quiz curto, exercícios que você responde com suas palavras ou números (corrigidos conforme você avança, com dicas e a solução depois de uma tentativa), lacunas para preencher, associações ou itens para colocar em ordem. Ele lê a pontuação e as respostas que você envia.
- Quando você responde, ele diz o que estava certo, corrige o que não estava com gentileza e de forma específica, e se adapta: outra explicação ou exemplo quando você empaca, um passo mais difícil quando você está à frente.
- Com lição de casa ou exercícios, ele orienta você com dicas e perguntas, e dá a solução completa só quando você pede ou continua travado depois de tentar.
- Para um idioma, ele dá palavras para ouvir e praticar, formas verbais, conversas, e suas próprias frases corrigidas com cada erro marcado e explicado.
- Ele encerra um tópico com um resumo curto e cartões de memorização do que lembrar, e oferece o que aprender em seguida como botões para tocar. Para um curso mais longo, ele mantém um roteiro dos tópicos e de quanto você já avançou.

### Planejador

“Planeja viagens, eventos e projetos”, e também mudanças e rotinas.

- Primeiro ele define o que molda o plano: o objetivo, datas e prazos, orçamento, as pessoas envolvidas e limites rígidos. Ele pergunta pelos poucos que faltam e importam (em um formulário quando são vários), e assume padrões sensatos para o resto, dizendo o que assumiu.
- Ele confere na web os fatos de que o plano depende (horários de funcionamento, tempos de deslocamento, preços, disponibilidade, regras, o clima), e avisa quando algo não pôde ser conferido ou pode mudar.
- Ele torna o plano concreto: horários, lugares, custos e quem faz o quê, folga para o que atrasar, e o que reservar ou decidir primeiro.
- Ele mostra o plano para você acompanhar de relance, nas UIs de resposta feitas para planos: uma viagem dia a dia com seus lugares em um mapa, a agenda de um dia, datas em um calendário ou uma contagem regressiva, um projeto em fases ou ao longo de semanas, o que reservar ou levar como uma lista de verificação, a previsão do tempo, e os custos como um orçamento com um total.
- Quando uma escolha importa, ele dá duas ou três opções lado a lado com suas vantagens e desvantagens (voos e hospedagens para uma viagem).
- Ele guarda o plano nos arquivos do projeto, onde você pode alterá-lo: um documento, e uma planilha para orçamentos e cronogramas com totais. Ele se oferece para ajustá-lo, com as prováveis mudanças como botões para tocar. Ele cria os arquivos na pasta da sessão quando você pede arquivos.

### Analista

“Dá sentido a dados e planilhas, com gráficos”: planilhas, arquivos CSV, exportações e números.

- Ele examina os dados antes de analisá-los (colunas, tamanho, tipos e lacunas) e relata problemas como valores ausentes, duplicatas ou formatos estranhos antes de tirar conclusões.
- Ele calcula com código (um script curto em Python ou JavaScript, ou uma fórmula), nunca estimando a olho, e guarda os scripts na pasta da sessão para que o trabalho possa ser repetido.
- Ele responde à pergunta primeiro, em palavras simples e com os números-chave, e depois mostra como chegou a eles. Ele declara suposições e limites, e não afirma causas que os dados não conseguem mostrar.
- Ele mostra os resultados nas UIs de resposta feitas para números: os números-chave, um gráfico (o mais simples que serve: barras para comparar, linhas ao longo do tempo), uma tabela que você pode ordenar e filtrar, como os valores se distribuem, partes de um todo, como um total mudou, fluxos, valores em duas dimensões como um mapa de calor, números em lugares de um mapa, e uma calculadora quando você vai querer testar outros valores. Uma figura que nenhuma delas desenha vai em uma figura dinâmica na resposta, ou em uma página quando são várias; eixos e unidades são rotulados, e a leitura funciona em um celular.
- Ele salva dados tratados e resultados como arquivos (CSV, ou XLSX quando você pede) quando você vai querer tê-los. Uma tabela que você vai consultar e alterar é guardada como uma planilha com suas fórmulas, e um painel de controle a que você vai voltar, como uma página.

### Criador de apps

“Cria seus próprios apps: um formulário, etapas, dados e uma tela” (veja [Apps](/guide/apps)).

- Ele define o que entra, o que sai e como é uma boa execução, pergunta só o que muda o design, e diz o que assumiu.
- Ele cria o app com ferramentas próprias, escolhendo a etapa mais barata para cada parte (uma ferramenta, uma resposta rápida de um modelo, uma regra, código) e um agente onde é preciso julgamento.
- Ele dá ao app de dois a quatro exemplos com verificações, testa-os e corrige o que falhar antes de entregar, dizendo quanto custa uma execução e quanto tempo leva.
- Quando você mesmo altera o app, ele continua a partir da sua alteração.
- Ele usa a habilidade app-builder.

## Criar um agente

### Diga o que ele deve fazer

1. Na [página Agentes](/agents), clique em **Nova** no alto da coluna e depois em **Novo agente** (no celular, **Novo agente** no alto da página). A janela **Novo agente** abre em duas etapas, mostradas no alto como **1 Descrever** e **2 Configurar**.
2. Em "O que seu agente deve fazer?", diga com suas próprias palavras e, se for o caso, quando ele deve trabalhar sozinho: "Toda sexta à tarde, escreva meu relatório semanal de progresso a partir dos meus commits e notas, e deixe-me conferir antes de enviar." Em **Ou comece a partir de uma ideia**, **Resumo de artigos**, **Relatório semanal**, **Revisor de alterações** e **Tradutor** colocam uma frase na caixa quando você clica em um deles, para você alterar.
3. Clique em **Esboçar meu agente** (ou pressione Ctrl+Enter, ⌘+Enter no Mac). O modelo auxiliar (Configurações → Modelos → Modelo auxiliar) esboça o agente: nome, ícone, linha, instruções, o que ele pode usar, o nível com que ele pensa e um agendamento, quando você pediu um. A janela passa para **Configurar**.
4. Leia o rascunho e altere o que quiser (veja [Todas as configurações](#all-settings)). **Voltar** retorna a **Descrever**: o que você escreveu continua lá, e esboçar de novo substitui o rascunho.
5. Clique em **Criar agente**. O app diz "*nome* está pronto" e abre a página dele; o agendamento, se houver, é uma tarefa agendada que é executada como ele.

Se você fechar a janela (✕, Esc ou um clique fora dela) depois de digitar ou alterar algo, ela pergunta antes **Descartar este agente?**. A aba **Agentes** de um projeto tem **Novo agente aqui**, que cria um agente que trabalha nesse projeto e, enquanto o projeto não tiver nenhum, **Criar um para este projeto**, que cria um a partir do que o projeto diz sobre si mesmo ou do modelo para o tipo dele; um projeto novo pode receber um quando é criado (veja [Projetos](/guide/projects)).

### Configurar você mesmo

**Configurar eu mesmo**, abaixo da caixa, pula o rascunho e abre **Configurar** sem nada preenchido além do ícone (veja [Todas as configurações](#all-settings)). Você pode ter até 200 agentes seus.

### Pedir a um agente para criar um

Em qualquer sessão, peça com suas próprias palavras: "Crie um agente que resuma minhas newsletters não lidas toda sexta às 17h." O agente com quem você está conversando, qualquer que seja o programa em que ele executa (Claude Code, Codex, Custom ou outro), cria o agente para você: nome, linha, instruções, o que ele pode usar, o nível e o resto, e os agendamentos dele quando ele deve trabalhar sozinho. Primeiro, um cartão na conversa mostra o agente e quando os agendamentos dele são executados, com **Criar agente** e **Não**; nada é salvo até você responder (veja [O cartão: confirmar uma alteração](/guide/ask-agents#the-card-confirming-a-change)).

Do mesmo modo, um agente pode alterar um dos seus agentes (só muda o que você pede, e fica salvo como uma nova versão por **Um agente**), dar um agendamento a ele, alterar um, remover um que não é mais necessário ou excluir um agente com seus agendamentos. Uma alteração que adiciona, altera ou remove agendamentos, e toda exclusão, pergunta a você a cada vez, a menos que a sessão tenha Acesso total. Dar a um agente **Acesso total** (ele nunca pergunta) pergunta sempre.

### Todas as configurações

**Configurar** é a segunda etapa de **Novo agente**, e é o que **Todas as configurações** na página de um agente abre para esse agente, sem a etapa **Descrever**. No celular, a janela ocupa a tela toda. No alto ficam o ícone (clique nele para escolher um entre 30: um telescópio, uma caneta, um chapéu de chef, um avião, uma carteira e assim por diante) e o nome, com até 60 caracteres, como "Contador" ou "Agente de viagens". Só o nome é obrigatório.

No computador, uma coluna à esquerda lista sete seções, cada uma com o que está definido agora sob o nome, para que o agente inteiro apareça de relance; clique em uma para ver as configurações dela ao lado. Quando uma seção é maior que a janela, um botão **Mais abaixo** mostra que há mais. No celular, **Configurar** lista as seções com o que cada uma tem definido; toque em uma para abri-la, e **‹ Todas as configurações** volta.

- **Sobre**:
  - **Uma linha sobre ele**: até 160 caracteres, mostrada no cartão dele e no menu da página inicial, como "Mantém as contas da casa em ordem".
  - **Instruções**: quem ele é e como trabalha, até 20.000 caracteres. Ele lê isso no início de cada sessão. Escreva do jeito que os agentes integrados fazem: "Você é o contador do usuário nesta sessão", depois algumas linhas sobre como ele trabalha ("Peça os extratos de que precisar", "Mantenha os totais em uma planilha na pasta de trabalho").
- **Onde e quando**:
  - **Onde ele trabalha**: **Em todos os lugares**, ou **Somente em alguns projetos** com um interruptor para cada projeto (veja [Onde um agente trabalha](#where-an-agent-works)).
  - **Quando ele trabalha**: para um agente novo, **Quando pedido**, **Em um horário** (dias e um horário) ou **A cada…** (um intervalo), e **Cada execução começa com**, a mensagem com que cada execução agendada começa. Para um agente que você já tem, os agendamentos dele são listados aqui; você os adiciona e altera na página dele, em **Agendamentos** (veja [Quando um agente trabalha: agendamentos](#when-an-agent-works-schedules)).
  - **Mantém uma conversa, com uma Caixa de entrada** (veja [Um agente com uma conversa própria](#an-agent-with-a-conversation-of-its-own)).
  - **Onde as sessões dele começam**, quando nenhuma pasta está escolhida na página inicial:
    - **Uma nova pasta de tarefa** (o padrão): cada sessão recebe uma pasta nova só dela (veja [Pastas de tarefa](#task-folders-where-a-task-without-a-folder-works)).
    - **A pasta da página inicial**: as sessões trabalham na pasta mostrada ali, como o Programador faz. Escolha isto para agentes que trabalham em um projeto.
- **Modelo**:
  - **Pensa com**: **Automático**, **Rápido**, **Padrão**, **Melhor** ou **Máximo**, cada um com uma linha sobre para que serve (veja [Com o que um agente pensa: níveis](#what-an-agent-thinks-with-tiers)).
  - **Executa em**: o programa que ele sugere, escolhido junto com ele na página inicial.
    - **Qualquer agente** (o padrão) mantém o programa escolhido na página inicial.
    - **Claude Code**, **Codex**, **Custom** ("Qualquer modelo") ou qualquer agente que você adicionou em [Configurações → Agentes → Mais agentes](/settings?s=agents).
    - Depois de escolher um programa, um menu de modelos aparece ao lado com os modelos desse programa (para programas que oferecem escolha); se você não mexer, é o modelo padrão do programa. Um nível acima escolhe o modelo no lugar.
  - **Modo de permissão**: quando ele pergunta a você primeiro.
    - **Como escolhido** (o padrão): mantém o modo escolhido na página inicial.
    - **Perguntar**: pergunta antes de alterar arquivos e executar comandos.
    - **Aceitar edições**: altera arquivos livremente, pergunta antes de comandos.
    - **Acesso total**: nunca pergunta.
    - **Planejar**: só lê e planeja, até você aprovar.

    Claude Code, Codex e Custom têm, cada um, um modo equivalente a esses. Outros agentes (Gemini CLI, OpenCode…) mantêm os seus.
  - **Subagentes que ele inicia**: **Qualquer**, ou nunca acima de um nível.
  - **Subir de nível quando uma verificação falhar**: ativado, a menos que você desative.
- **Ferramentas**: **O que ele pode usar** (sete interruptores, todos ativados para um agente novo, com **Ativar todos** quando alguns estão desativados; veja abaixo), **Habilidades a favorecer** (veja abaixo) e **Apps conectados**, mostrados quando você tem contas conectadas (veja abaixo).
- **Equipe**: **Outros agentes podem passar trabalho para ele** e **Ele pode passar trabalho para**, com um interruptor para cada outro agente (veja [Agentes que passam trabalho para outros agentes](#agents-that-hand-work-to-other-agents)).
- **Resultados**: o que ele devolve: os campos de cada resultado e para onde cada um vai (veja [O que um agente devolve](#what-an-agent-hands-back)).
- **Orçamento**: **Sem limite**, ou **Um limite mensal** em dólares; para um agente que você já tem, mostra o que ele gastou neste mês (veja [Um orçamento mensal](#a-monthly-budget)).

**Criar agente** cria um agente novo. Para um que você já tem, **Salvar** guarda suas alterações ("*nome* foi salvo") e **Cancelar** fecha a janela sem salvar; fechá-la depois de uma alteração pergunta **Descartar suas alterações?**.

### O que ele pode usar

Cada interruptor cobre um tipo de ferramenta:

- **Ler arquivos**: abrir, listar e pesquisar arquivos e pastas.
- **Criar e alterar arquivos**: escrever arquivos novos e editar os existentes.
- **Executar comandos**: programas e scripts neste computador.
- **Usar a web**: pesquisar e ler páginas da web.
- **Usar um navegador**: abrir sites, clicar e preencher formulários em um navegador de verdade.
- **Usar o computador**: ver a tela e usar o mouse e o teclado em qualquer app (nos apps de computador, com o Uso do computador ativado).
- **Outras ferramentas**: servidores MCP (servidores de ferramentas) e plugins configurados para os agentes.

O que acontece com as ferramentas que você desativa depende do programa:

- **Claude Code e Custom** têm essas ferramentas desativadas. Com **Outras ferramentas** desativado, o Claude Code recebe só as ferramentas do próprio app e suas contas conectadas, nenhum dos servidores MCP que você mesmo configurou.
- **Codex** é instruído a não usá-las. Com **Usar a web** desativado, a pesquisa na web do próprio Codex também é desativada. Com **Executar comandos** desativado, mas **Ler arquivos** ativado, o Codex é instruído a usar o shell só para ler e pesquisar arquivos, já que ele lê arquivos pelo shell.
- **Claude Code, Codex e Custom** também têm as ferramentas do navegador e do computador desativadas quando **Usar um navegador** ou **Usar o computador** está desativado.
- **Outros agentes** são instruídos a não usá-las.

As ferramentas do próprio app (páginas, memória e semelhantes) continuam ativadas, exceto as que dependem de um interruptor que você desativou: com **Usar a web** desativado, a pesquisa na web e a leitura de páginas do app também deixam de funcionar; com **Usar um navegador** desativado, o navegador dele deixa de funcionar; com **Usar o computador** desativado, as ferramentas de tela, mouse e teclado dele deixam de funcionar; com **Ler arquivos** desativado, o leitor de documentos dele deixa de funcionar. Contas conectadas não são "outras ferramentas": quem decide sobre elas são os **Apps conectados**, abaixo. Quando uma tarefa precisa de algo que o agente não pode usar, ele é instruído a dizer isso em vez de contornar o problema.

### Habilidades a favorecer

Em **Ferramentas**, digite o nome de uma habilidade e pressione Enter (ou vírgula) para adicioná-la. O campo sugere as habilidades do próprio Claude Code e do Codex, como [Configurações → Agentes → Habilidades](/settings?s=skills) as lista para a pasta aberta em Arquivos; você também pode digitar o nome de uma habilidade da biblioteca de habilidades, como research. Clique na lixeira ao lado de um nome para tirá-lo. Até 30. Quando uma dessas habilidades se encaixa na tarefa, o agente a carrega antes de começar e a segue. Veja [Habilidades](/guide/skills) para as habilidades que vêm com o app e como adicionar mais.

### Conexões

**Apps conectados**, em **Ferramentas**, só aparece quando você tem contas conectadas (configuradas em [Apps → Apps conectados](/apps/connected)). Cada uma tem um interruptor: ativado significa que está ativada nas sessões deste agente. Uma que já está ativada para todas as sessões diz "Ativado para todas as sessões". Se uma conta que o agente cita não está mais conectada, ela aparece com "Não conectado" sob o nome e um botão para removê-la. Veja [Apps conectados, chaves e ferramentas](/guide/connections).

## Alterar um agente

Na página de um agente, as configurações dele aparecem como frases: o que ele faz, "Ele trabalha *em todos os lugares*, *todos os dias úteis às 09:00*, e pensa com *Rápido*. Ele pode *ler arquivos e usar a web*, e pede ajuda a *nenhum outro agente*. Ele devolve *sua resposta*. Ele gasta no máximo *US$ 3* por mês." Cada parte sublinhada abre o que a altera, e a alteração é salva na hora:

- **Onde ele trabalha**: **Em todos os lugares**, ou um interruptor para cada projeto.
- **Quando ele trabalha**: os agendamentos dele, cada um abrindo seu editor, **Adicionar um agendamento** e **Mantém uma conversa, com uma Caixa de entrada**.
- **Com o que ele pensa**: Automático ou um nível, **Subagentes que ele inicia, nunca acima de** e **Subir de nível quando uma verificação falhar**.
- **O que ele pode usar**: os sete interruptores.
- **A quem ele pede ajuda**: um interruptor para cada outro agente e **Outros agentes podem passar trabalho para ele**.
- **O que ele devolve**: os campos dele e para onde cada resultado vai.
- **Orçamento mensal dele**: dólares por mês, ou nenhum.

**Todas as configurações** tem o resto (veja [Todas as configurações](#all-settings)). Cada alteração é guardada como uma versão, para que você possa voltar atrás (veja [Versões: voltar a uma anterior](#versions-go-back-to-an-earlier-one)). As sessões que você começar a partir daí usam a nova versão, e as sessões com ele que já estão em andamento também, a partir da sua próxima mensagem: o Custom a lê antes de cada turno, e o Claude Code e o Codex recomeçam do zero assim que ficam livres (a conversa continua).

## Versões: voltar a uma anterior

Cada salvamento que altera o que um dos seus agentes é guarda uma versão: uma alteração na página dele, em **Todas as configurações**, pela linha de comando, por um agente que você pediu (pela API do app), e o rascunho ou arquivo que o criou. Abra a página dele e depois **Mais** (⋯) → **Versões**:

- A lista mostra cada versão, da mais nova para a mais antiga: **v1**, **v2**…, o que mudou em poucas frases ("Ele pensa com Melhor agora (antes era Rápido). O orçamento mensal dele é US$ 5 agora (antes era US$ 3).") ou o que o agente que a alterou disse que fez, quem a salvou (**Você**, **Um agente**, **Rascunhado**, **Instalado**, **Importado**) e quando; **Agora** marca a atual. Uma versão com a qual os exemplos dela foram testados diz quantos passaram ("Exemplos: 2 de 3 passaram"), para você ver se uma alteração a deixou melhor.
- Clique em uma para compará-la com a anterior, ou escolha duas quaisquer em **Comparar** … **com** …: o que mudou entre elas, em frases, e as **Instruções** dela lado a lado, com as linhas removidas em vermelho e as linhas acrescentadas em verde.
- **Restaurar** torna a versão escolhida a atual de novo. Ela é salva como uma nova versão que diz "Versão 3 restaurada.", então a que existia continua na lista, para você voltar a ela. Agentes para os quais ele passou trabalho e projetos que não existem mais são deixados de fora.

Um agente guarda as últimas 50 versões dele; elas são apagadas quando você o exclui. Os exemplos dele não fazem parte de uma versão: restaurar uma versão antiga mantém os exemplos que ele tem agora. Um agente criado antes de as versões serem guardadas recebe como primeira versão o jeito que ele era ("Antes de as versões serem guardadas") na primeira alteração.

## Exemplos que verificam o agente

Os exemplos permitem verificar se um dos seus agentes ainda faz o trabalho dele depois de você alterá-lo, como acontece com os exemplos de um app. Cada exemplo é uma mensagem para testá-lo e o que a resposta dele deve cumprir. Na página do agente, em **Exemplos**:

1. **Adicionar um exemplo**: dê um nome, se quiser, escreva **A mensagem para testá-lo** como você a escreveria para o agente e adicione uma verificação para cada coisa que uma boa resposta faz. Uma verificação é uma frase simples, como "Cita os dois pull requests" ou "Diz claramente quando não encontrou nada de novo", com a qual o modelo auxiliar compara a resposta; ou uma regra sobre o que ele entregou, como a verificação de um app: `{{reply}} contains Lisbon` ou, para um agente que devolve resultados, `{{result.count}} > 0` em um dos campos dele. **Salvar o exemplo**. Um agente pode ter até 10 exemplos, cada um com até 8 verificações.
2. **Testar os exemplos** (ou o botão de frasco ao lado de um exemplo, para testar só aquele) primeiro informa o que vai fazer e quanto vai custar: quantas sessões ele inicia como o agente e em qual nível, quanto isso deve custar (com base no custo das últimas tentativas ou no custo das sessões dele neste mês; sem nada para estimar antes da primeira tentativa) e o que resta do orçamento mensal dele, no qual as tentativas contam. Pressione **Testá-los**.
3. Cada exemplo é executado em uma sessão própria, iniciada como o agente no nível dele, em uma pasta vazia só dela (removida depois que o resultado é guardado; a conversa permanece), fora da sua lista de sessões. Ele não envia nada: o que seria enviado pelos seus apps conectados é guardado como o que teria sido enviado, e o que ele devolve não vai a lugar nenhum além do teste. Quando termina, as verificações são lidas. Um agente com campos para devolver também precisa devolver um resultado.

Cada exemplo então mostra como foi a última tentativa: **Passou**, quantas verificações falharam, **Não terminou** ou **Aguardando você** (a sessão dele pergunta algo a você: abra-a), com quando aconteceu e quanto custou. Clique em um exemplo para ver a mensagem, cada verificação com o que foi observado (✓ ou ✗), o que ele devolveu, a resposta dele e **Abrir a sessão**. Quando você altera o agente depois da última tentativa dos exemplos, a página avisa com **Testar de novo**. Os exemplos nunca são executados por conta própria.

## Onde um agente trabalha

Um agente trabalha **Em todos os lugares**, a menos que você escolha projetos para ele. Um agente que trabalha em alguns projetos:

- é oferecido apenas neles: o menu de agentes da página inicial o lista quando um dos projetos dele está selecionado, e outros agentes só podem passar trabalho para ele em sessões dos projetos dele;
- trabalha na pasta do projeto quando trabalha em um só projeto, com o conhecimento, a memória, as diretrizes e as habilidades do projeto;
- aparece na aba **Agentes** de cada um dos projetos dele (veja [Projetos](/guide/projects)).

Se você escolher na página inicial um projeto em que o agente selecionado não trabalha, a página inicial seleciona o agente do próprio projeto; se não houver, o Geral.

## Quando um agente trabalha: agendamentos

Um agente trabalha quando você começa uma sessão com ele, quando outro agente passa trabalho para ele e nos agendamentos dele. Um agendamento é uma tarefa agendada executada como o agente: em um horário, de tempos em tempos, uma única vez, quando uma página ou um feed muda, ou quando outro serviço chama o webhook dele (veja [Tarefas agendadas](/guide/tasks)).

- Na página do agente, **Adicionar um agendamento** abre o editor de tarefas com o agente selecionado e um horário preenchido: dê um nome e a mensagem com que cada execução começa, e salve.
- Clique em um agendamento na lista para alterá-lo, pausá-lo ou executá-lo agora.
- Um agendamento rascunhado junto com um novo agente é criado com ele.
- Um agendamento que um agente adiciona a um dos seus agentes começa em **Automático** onde isso é oferecido (veja [Tarefas agendadas](/guide/tasks#model-effort-permissions-and-other-options)), a menos que esse agente indique um modelo próprio. Um agente que pensa com um nível continua executando no nível dele.
- Um agente, em qualquer sessão, pode adicionar, alterar ou remover agendamentos de um agente para você (veja [Peça a um agente para criar um](#ask-an-agent-to-make-one)).
- Um agendamento que não é mais necessário desaparece sozinho: um agendamento de uso único após uma execução bem-sucedida, e um agendamento cuja execução encontra o trabalho concluído (aquilo que ele esperava ou vigiava aconteceu, como a mensagem dele mandava parar nesse caso), o que a notificação da execução informa. Os agendamentos de um agente são excluídos junto com ele.

Todo agendamento também está em [Configurações → Agentes → Tarefas agendadas](/settings?s=tasks), junto com todos os outros; a opção **Agente** de uma tarefa é o agente como o qual as execuções dela trabalham. O lugar [**Agendamentos**](/agents/schedules) na coluna da página Agentes (uma aba no alto em um celular) os mostra em uma semana com todas as outras tarefas: o que foi executado, como foi e o que será executado a seguir, com **Agente ·** e o nome do agente em cada um na lista; o lápis dele abre a página do agente.

## Com o que um agente pensa: níveis

Os níveis escolhem um modelo pelo trabalho em vez de pelo nome:

- **Rápido**: o mais barato, para trabalhos pequenos e muito claros cujo resultado pode ser verificado, como uma edição pontual, extrair fatos, ordenar, formatar e fazer resumos curtos.
- **Padrão**: tarefas claras de tamanho médio: uma alteração bem especificada, testes, pesquisa sobre uma pergunta definida, um rascunho a partir de um roteiro.
- **Melhor**: o agente principal de uma sessão. Ele descobre o que foi pedido, planeja, lidera subagentes e verifica o trabalho deles.
- **Máximo**: o mais forte, para os problemas mais difíceis: bugs teimosos, demonstrações, designs com muitas restrições.

Um agente definido com um nível começa no modelo desse nível para o programa em que executa, a menos que um modelo tenha sido escolhido para a sessão; definido como **Automático** (o padrão), ele usa o modelo escolhido no lugar onde começa: a página inicial, a tarefa agendada (que também pode estar em **Automático**) ou o agente que passa trabalho para ele. Na página inicial, essa escolha também pode ser **Automático**: Melhor, subindo para Máximo se o problema se mostrar difícil demais (veja [Níveis: um modelo para cada tipo de trabalho](/guide/agents-models#tiers-a-model-for-each-kind-of-job)).

[Configurações → Agentes → Modelos → Níveis](/settings?s=models&find=Tiers) explica o que cada nível significa, em uma tabela com uma coluna para cada programa: para o **Claude Code**, um modelo (Haiku, Sonnet, Opus e o mais novo Fable, para começar) e um esforço; para o **Codex**, um modelo e um esforço (Luna, Terra, Sol e Astra, para começar; em um plano sem um deles, o mais próximo que ele oferece, com mais esforço para o nível mais alto quando dois compartilham um modelo); para o **Custom**, um dos seus modelos Custom: um nível que você deixa como está usa o modelo mais novo do tipo dele entre os modelos que o Custom tem (veja [Níveis: um modelo para cada tipo de trabalho](/guide/agents-models#tiers-a-model-for-each-kind-of-job)), e, com apenas modelos pequenos ou locais, ele fica vazio, o que mantém o modelo escolhido pela sessão. Um nível que você deixa como está acompanha o modelo mais novo do programa desse tipo. **Voltar aos padrões** os restaura.

**Subagentes que ele inicia, nunca acima de** limita os níveis dos subagentes do Hydor que um agente inicia: se for pedido um nível mais alto, o subagente recebe este. Um subagente também nunca pensa com um nível acima daquele com que o líder dele pensa. Um modelo indicado explicitamente é usado como indicado.

**Subir de nível quando uma verificação falhar** (ativado, a menos que você o desative): um subagente do Hydor que o agente inicia em um nível, cuja resposta não passa em uma verificação rápida (o modelo auxiliar lê a instrução e a resposta dele) ou que para com um erro, é executado de novo um nível acima, até o Melhor e nunca acima do mais alto que o agente permite. Só a resposta dele à instrução é verificada: uma resposta posterior, a uma mensagem do líder ou sua, nunca faz o trabalho inteiro ser refeito. O líder fica sabendo que isso aconteceu e por quê, e o novo subagente é informado do motivo de o primeiro ter ficado aquém. Uma execução agendada do agente que falha no nível dele também é executada de novo um nível acima, até o Melhor. Um líder também pode subir um subagente de nível por conta própria quando acha o resultado insuficiente.

## Agentes que passam trabalho para outros agentes

Um agente pode passar uma parte do trabalho dele para uma nova sessão que trabalha nela ao lado dele: um subagente do Hydor (veja [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research)). Ele pode iniciar:

- **um subagente simples**, com um nível para a sua parte: Rápido para um trabalho pequeno e muito claro, Padrão para uma tarefa clara de tamanho médio (o que um subagente recebe quando nenhum é pedido), Melhor para uma parte difícil que se sustenta sozinha;
- **um dos seus agentes**, pelo nome: ele trabalha com as próprias instruções, ferramentas, conexões, modo e nível, e a resposta dele volta para o agente que pediu.

Quem pode passar trabalho para quem:

- Uma sessão que trabalha como um agente integrado (ou nenhum) pode passar trabalho para qualquer um dos seus agentes que trabalhe ali.
- Um agente seu só pode passar trabalho para os agentes que a **Equipe** dele lista.
- Um agente com **Outros agentes podem passar trabalho para ele** desativado não recebe trabalho de nenhum.
- Um agente indicado pelo nome trabalha apenas nos próprios projetos e nunca com um modo de permissão mais livre do que o da sessão que o pediu.

Na conversa, os subagentes do Hydor que uma rodada iniciou aparecem juntos em um único cartão sob essa rodada, com uma linha para cada um, com o título dele, o agente como o qual trabalha (ou "Subagente do Hydor"), o nível, o programa e o modelo dele, em que pé está e quanto custou, e, quando subiu de nível, de qual nível e por quê (aponte para a linha); clique em uma linha para abrir a conversa dele. Veja [Subagentes](/guide/sessions#subagents). A aba **Agentes** de um projeto mostra quais dos agentes dele passam trabalho para quais.

Um agente que mantém uma conversa própria recebe o trabalho na caixa de entrada dele em vez de em uma nova sessão, e a resposta dele volta quando ele chega a ela (veja [Um agente com uma conversa própria](#an-agent-with-a-conversation-of-its-own)).

## Um orçamento mensal

O limite mensal de um agente (**Orçamento** em **Todas as configurações**, ou a frase dele na página do agente) limita o que as sessões dele gastam em um mês (a partir do dia primeiro do mês, no horário deste computador):

- Cada sessão iniciada como ele recebe um limite de gastos igual ao que resta do orçamento (o menor, quando a sessão tem um limite próprio).
- O que os subagentes simples dele gastam conta para ele; o trabalho de um agente indicado pelo nome conta para o orçamento desse agente.
- Quando o orçamento se esgota, nenhuma sessão começa como ele até o mês seguinte: uma execução agendada informa por que não pôde começar, e o cartão dela diz **Orçamento esgotado**.

O que cada sessão gasta é calculado como em [Uso e custos](/guide/usage). Deixe em **Sem limite** para não ter nenhum.

## O que um agente devolve

Sem nenhuma configuração, um agente devolve a resposta dele na conversa. Dê a ele campos e destinos em **Resultados** (em **Todas as configurações**, ou na frase dele "Ele devolve *a resposta dele*"), e ao fim de cada tarefa ele devolve um resultado com esses campos, conferido antes de ir a qualquer lugar:

- **Campos de cada resultado**: um nome e um tipo para cada um (texto, texto longo, número, sim ou não, data, link, lista ou tabela com suas colunas), e se é obrigatório. O agente os preenche com a ferramenta hand_back; um resultado que não se encaixa volta para ele com o que corrigir.
- **Para onde vai cada resultado**, além da conversa:
  - **Uma página mantida**: **A mesma página, atualizada** (a opção que os agentes novos recebem): na primeira execução ele cria uma página com o nome do agente, no projeto dele quando trabalha em um, e cada execução seguinte coloca uma nova versão dessa página, de modo que você sempre abre a mais recente e as anteriores ficam esperando nas versões dela. Uma página que você renomeia mantém o nome. Escolha **Uma página nova a cada execução** para ter uma página própria a cada vez, com o nome do agente e do dia (os agentes criados antes dessa opção continuam fazendo assim).
  - **Uma linha em uma planilha**: cada execução acrescenta uma linha à mesma planilha: uma coluna **Data** com o momento da execução, depois uma coluna para cada campo, na ordem dos campos. Números entram como números, datas como datas e links como links, então totais, fórmulas e gráficos funcionam com eles; uma lista ou uma tabela entra em uma célula como texto legível ("leite; ovos"). Deixe a planilha como **Uma nova** e a primeira execução cria uma com o nome do agente, ou escolha uma das suas e a aba em que ela entra (uma aba que não existe é adicionada). Veja [Uma linha em uma planilha](#a-row-in-a-spreadsheet).
  - **Um e-mail**: o resultado como um e-mail para as pessoas que você indicar (um endereço ou mais), com um assunto (`{date}`, `{time}` e `{agent}` são preenchidos; se ficar vazio, o nome do agente e o dia), a partir de uma das suas contas de e-mail conectadas (**De**; a primeira, se você não escolher nenhuma; veja [Apps conectados, chaves e ferramentas](/guide/connections#connect-your-email)). Ele fica bom em qualquer programa de e-mail, com cada campo sob o seu nome e as tabelas como tabelas. Como você mesmo escolheu as pessoas aqui, ele é enviado assim que cada resultado fica pronto, sem esperar na Caixa de saída.
  - **Uma notificação**, com a primeira linha do resultado;
  - **Um arquivo na pasta em que ele trabalha**, como `reports/{date}.md`: `{date}`, `{time}` e `{agent}` são preenchidos, um nome terminado em `.json` recebe os campos como JSON e qualquer outro recebe Markdown, e um caminho nunca sai da pasta;
  - **Um webhook**: o resultado como JSON em um POST para um endereço https, assinado com uma chave do Cofre quando você indica uma, apenas para os hosts para os quais essa chave é permitida (veja [Apps conectados, chaves e ferramentas](/guide/connections)).

O que você digita nessas caixas vale quando você sai da caixa ou pressiona Enter. As configurações mostram a página e a planilha que a primeira execução criou, com um link para abri-las.

### Uma linha em uma planilha

As colunas são encontradas pelos títulos na primeira linha da tabela, então a planilha continua sendo sua para organizar: mova colunas, mude o estilo delas (uma coluna que você formata em euros continua em euros) e adicione colunas suas ao lado. Uma fórmula em uma coluna sua (um total acumulado, por exemplo) é levada para baixo até cada nova linha, como na tabela de uma planilha, e um gráfico que lê as linhas até agora também incorpora a nova. Totais abaixo da tabela atrapalham as novas linhas: coloque-os em uma coluna própria ou em outra aba, sobre colunas inteiras (`=SUM(B:B)`). Quando você adiciona um campo ao agente depois, ele ganha uma nova coluna no final, e as antigas ficam onde estão; um título que você renomeia deixa de corresponder ao campo dele, que então ganha uma nova coluna (dê ao campo o mesmo nome para mantê-los juntos). A linha de cada execução é uma nova versão da planilha, como qualquer alteração, então as fórmulas, os gráficos e os comentários dela continuam como estavam.

### Histórico de resultados dele

A página do agente mostra **O que ele devolveu** como uma tabela: uma linha para cada resultado, do mais novo ao mais antigo, com o momento em que chegou, uma coluna para cada campo e para onde foi (**Foi para**: uma marca para cada destino, vermelha onde não foi possível enviar; aponte para uma para ver o que aconteceu, clique em uma página mantida para abri-la). Clique em uma linha para ver o resultado inteiro, cada campo por completo, com **Abrir a sessão**. A tabela rola, e **Mostrar mais antigos** traz resultados anteriores. Um agente guarda os resultados dele por um ano, até 500 deles (um agente diário guarda um ano inteiro; um que executa a cada hora, cerca de três semanas); um campo longo demais para ser guardado ali avisa isso, e está inteiro nos lugares para onde foi. A página e a planilha que ele preenche aparecem como links acima da tabela.

## Um agente com conversa própria

A maioria dos agentes começa uma nova sessão a cada vez. Ative **Mantém uma conversa, com uma Caixa de entrada** (em **Todas as configurações**, em **Onde e quando**, ou na parte do "quando" da frase dele), e o agente passa a manter uma conversa só dele, criada na primeira vez em que é necessária, na pasta do projeto dele quando trabalha em um projeto:

- As mensagens para ele esperam na **Caixa de entrada** dele e entram na conversa uma de cada vez, cada uma quando a anterior tem a sua resposta: o que você envia pela página dele e o que outros agentes passam a ele.
- As execuções agendadas dele são postadas na mesma conversa, esperando o fim de um turno em andamento; cada uma aparece no histórico do agendamento, como qualquer execução.
- Cada resposta volta para quem a enviou: outro agente a recebe como mensagem, e você recebe uma notificação pelas suas.
- Ele se lembra do que veio antes, como qualquer conversa.
- O orçamento mensal dele é verificado conforme cada mensagem entra.

Na página dele, **Caixa de entrada** lista as mensagens, cada uma com sua situação (**Aguardando a vez**, **Com ele agora**, **Respondido**, **Sem resposta**) e a resposta dele, com uma caixa para enviar uma mensagem, e **Conversa dele**, que a abre.

## Começar uma sessão como um agente

1. Abra a [página inicial](/). Abaixo da caixa de mensagem, uma linha mostra quem faz o trabalho: o programa, o modelo, a pasta e o chip **Agente**, que indica o agente escolhido no momento.
2. Clique em **Agente**. Em **Começar como**, os agentes integrados vêm primeiro, depois os seus em **Seus**: os que funcionam em qualquer lugar e no projeto escolhido.
   - No computador, os nomes ficam em uma grade, dois por linha. Aponte para um para ver a linha dele abaixo da grade: a descrição e, quando ele sugere um programa, "Usa" seguido desse programa e do modelo dele.
   - No celular, o menu abre como uma folha na parte de baixo da tela e lista cada agente com a sua linha.
3. Escolha um. Depois digite sua tarefa e pressione Enter, ou **Início**.

**Criar ou alterar agentes**, no fim do menu, abre a [página Agentes](/agents). **Começar uma sessão** na página de um agente abre a página inicial com ele escolhido.

O que escolher um agente faz na página inicial:

- **Programa, modelo e permissões**: se o agente sugere um programa, a página inicial muda para ele, com o modelo do nível dele quando ele pensa com um, ou então o modelo do agente quando ele indica um. Se ele tem um modo de permissão, as **Permissões** da página inicial (em **Opções**) mudam para o modo correspondente desse programa. Você ainda pode alterar qualquer um deles antes de começar.
- **Conexões**: as contas conectadas que o agente ativa ficam ativas na nova sessão.
- **Pasta**: a menos que você mesmo tenha escolhido uma pasta, o agente decide. A maioria dos agentes começa em **Nova pasta de tarefa**; o Programador, e os agentes configurados para "A pasta da página inicial", usam a pasta mostrada. Em um projeto, escolher um agente nunca tira você dele. Quando o agente muda a pasta, a caixa mostra as escolhas guardadas para esse lugar, com o agente que você escolheu.

A página inicial guarda o agente de cada lugar (cada projeto, cada pasta e **Nova pasta de tarefa**), em qualquer dispositivo que você use, com as outras escolhas do lugar. Um lugar em que você ainda não escolheu nenhum abre com o agente do próprio projeto quando o projeto tem um, senão com o Geral. Um agente que não existe mais, ou que não funciona no projeto escolhido, também dá lugar a esse padrão.

Escolher um projeto no menu de pastas abre a caixa com as escolhas desse projeto; em um projeto em que você ainda não escolheu nada, isso inclui o agente como o qual o projeto começa as sessões dele, quando tem um (veja [Projetos](/guide/projects)).

## Trocar de agente em uma sessão

A caixa de mensagem de uma sessão mostra o agente como o qual ela trabalha, e você pode trocar por outro a qualquer momento: do **Pesquisador** para o **Redator** depois que os fatos estiverem reunidos, por exemplo.

1. É a primeira linha do chip abaixo da caixa de mensagem que abre **Opções**, e esse chip o nomeia primeiro, como "Pesquisador · Opus 5.5".
2. Clique nele. Em **Trocar para**, escolha outro: o mesmo menu da página inicial, uma grade no computador e uma folha na parte de baixo no celular.
3. O app diz "O agente trabalha como *nome* a partir da sua próxima mensagem".

A partir da sua próxima mensagem, a sessão trabalha como o novo agente, e a conversa continua:

- O programa é avisado da troca junto com a sua mensagem (a conversa não mostra isso).
- **Claude Code e Codex** leem as instruções deles ao começar, então, quando a sessão está livre, o programa dela recomeça do zero antes da sua mensagem, com as instruções e os limites do novo agente; essa mensagem demora um pouco mais. No meio de um turno, ou enquanto ele trabalha em direção a um objetivo ou tem trabalho em segundo plano, ele recebe as novas instruções junto com a sua mensagem e recomeça do zero em uma mensagem posterior, quando estiver livre.
- **Custom** lê as instruções dele antes de cada turno. Outros agentes (Gemini CLI, OpenCode…) recebem as instruções do novo agente junto com a sua mensagem.
- As contas conectadas que o novo agente ativa ficam ativas na sessão, no lugar das do anterior; o que você mesmo ativou ou desativou para a sessão continua. Se ele tem um modo de permissão, a sessão muda para o modo correspondente, e para o modelo dele quando ele sugere o programa da própria sessão. O programa em si continua o mesmo: para mover a conversa para outro, veja [Continuar em outro agente](/guide/sessions#continue-in-another-agent).

Uma sessão iniciada sem um agente (no VS Code ou em um terminal, ou antes de os agentes chegarem ao app) mostra **Nenhum agente** ali: escolha um para dar um a ela. O menu da sessão (⋯) → **Configurações da sessão** → **Agente** também o nomeia; clicar nele abre a página do agente.

## Encontrar as sessões de um agente

Uma sessão iniciada como um agente diferente do habitual diz isso na barra lateral: a segunda linha dela começa com o ícone e o nome do agente ("Planejador · web-agent · 5d", ou "Pesquisador · Trabalhando · 2m 10s" enquanto ele trabalha). O habitual é o agente do próprio projeto, para uma sessão em um projeto que tem um (**Suas sessões começam como**, nos detalhes do projeto), e o Geral para todas as outras sessões. Sessões iniciadas fora do Hydor e um agente que você excluiu depois também não são nomeados. O filtro e a busca consideram o agente como o qual cada sessão realmente começou, inclusive o habitual. Para ver apenas as sessões de um agente:

- Clique no botão de filtro no topo da barra lateral (**Filtrar e agrupar sessões**) e escolha o agente em **Agente**. Ele lista os agentes como os quais suas sessões foram iniciadas, os mais usados primeiro (até oito), cada um com o número de sessões que tem; **Todos os agentes** mostra todas as sessões de novo. A seção aparece depois que alguma sessão é iniciada como um agente.
- Ou abra a página do agente e clique em **Mostrar todas as 23 na barra lateral** ao lado de **Sessões recentes** (aparece **Mostrar them in the sidebar** quando o agente tem oito sessões ou menos). Isso abre a página inicial com a barra lateral mostrando apenas as sessões desse agente, com os outros filtros limpos; no celular, o menu abre.
- Ou digite o nome do agente na caixa de busca (Ctrl+K): "Tutor" encontra as sessões iniciadas como Tutor. O Geral fica de fora disso, já que a maioria das sessões é dele. A prévia de uma sessão ali lista o **Agente** dela.

Enquanto um filtro está ativo, um chip abaixo de **Nova sessão** o nomeia, com o ícone dele: clique no × para mostrar todas as sessões de novo. O filtro de agente funciona junto com os outros (**Executa em** e **Projeto**), como as sessões de um agente em um projeto. Se o agente for excluído, a lista volta a mostrar todas as sessões. Veja [A barra lateral](/guide/start#the-sidebar).

## Duplicar ou excluir um agente

Na página de um agente:

- **Duplicar** (em todos os agentes): abre a janela em **Configurar** como um novo agente com tudo preenchido e o nome "*nome* (cópia)". Mude o que quiser e clique em **Criar agente**; a página dele abre. É assim que você faz a sua própria versão de um agente integrado.
- **Excluir** (apenas os seus): pergunta antes "Excluir *nome*?". As sessões iniciadas como ele continuam sem as instruções dele; os agendamentos dele são excluídos com ele, já que foram escritos para ele; os agentes que podiam passar trabalho a ele deixam de listá-lo. Os projetos que começavam as sessões como ele ficam sem ele: as sessões deles começam como o Geral (ou o agente que você escolher) de novo. O histórico de resultados dele vai embora com ele; as páginas e planilhas que ele preencheu continuam onde foram guardadas.

A caixa de busca (Ctrl+K, ⌘K em um Mac) encontra agentes também pelo nome e pela descrição; escolher um abre a página dele.

## Compartilhar um agente como arquivo

Um dos seus agentes pode viajar como um único arquivo, para você guardar ou entregar a um colega, que o instala no Hydor dele.

- **Para baixar um**: abra a página dele, depois **Mais** (⋯) → **Baixar como arquivo**. Os agentes integrados também podem ser baixados, para serem instalados como agentes próprios de alguém. O arquivo (`.hydor-agent`) guarda as instruções do agente, o que ele pode usar, o nível, o programa e o modelo, as habilidades que ele favorece, o modo de permissão, o orçamento e outras configurações, os agentes para os quais ele passa trabalho (pelo nome), o que ele devolve e os tipos de lugar para onde vão os resultados, os agendamentos dele que rodam pelo relógio (como sugestões) e os exemplos. Nada seu vai nele: os projetos em que ele trabalha, as contas conectadas que ele usa, a página e a planilha para onde iam os resultados, para quem os resultados são enviados por e-mail e de qual conta, e o endereço e a chave do webhook dele ficam de fora, e os agendamentos que começam por uma vigilância, um webhook ou uma data continuam aqui. O arquivo lista em palavras o que ficou de fora, para você definir de novo.
- **Para instalar um**: na [página Agentes](/agents), abra **Nova** e escolha **Instalar um agente a partir de um arquivo** (no celular, toque em **Instalar**), depois **Escolher um arquivo** e selecione um arquivo `.hydor-agent` (ou solte-o ali). Antes de qualquer coisa ser salva, um cartão o mostra: o nome e a linha dele, **O que ele traz** (as instruções, o que ele pode usar, o nível, o que ele devolve, os exemplos, os agendamentos sugeridos), **O que ele precisa de você** (o que ficou de fora e os agentes para os quais ele passa trabalho que você não tem) e **Suas instruções** para ler. Um agente seu com o mesmo nome não é alterado: o novo é instalado ao lado dele como “Nome (2)”, a menos que você escolha **Substituir o meu**, que transforma o seu neste, como uma nova versão (como ele era fica em **Versões**, e os seus exemplos permanecem, depois dos do arquivo). **Adicionar os agendamentos sugeridos, pausados** adiciona os agendamentos dele, desligados até você ligá-los. Toque em **Instalar**, e a página dele será aberta.

Algumas coisas mudam na entrada, e o cartão avisa quais: um agente que nunca pedia permissão antes de agir (**Acesso total**) começa com **Aceitar edições**, um programa que não está configurado aqui dá lugar ao escolhido na página inicial, e um arquivo de um Hydor mais novo traz o que este conhece (atualize o Hydor para o resto). Um arquivo que não é de um agente, ou que está corrompido, é recusado com a indicação do problema; o arquivo de um app é instalado na [página Apps](/guide/apps#share-an-app-as-a-file), e os arquivos de agentes do Claude Code entram com **Importar** (abaixo).

## Importar arquivos de agentes do Claude Code

O Claude Code pode guardar agentes próprios como arquivos Markdown em uma pasta `.claude/agents`: um cabeçalho curto com o nome, a descrição, o modelo e as ferramentas do agente, e as instruções dele logo abaixo. O app transforma esses arquivos em agentes seus, para que todos os programas daqui possam funcionar assim.

1. Abra a [página Agentes](/agents), depois **Nova** e **Importar arquivos de agentes do Claude Code** (no celular, clique em **Importar** no topo).
2. **Importar agentes do Claude Code** lista os arquivos de agentes que encontra: os seus em `~/.claude/agents` (marcados como **Seus**) e os da pasta `.claude/agents` da pasta aberta em [Arquivos](/files) (marcados como **Esta pasta**). Para ver os agentes de um projeto, abra primeiro esse projeto em Arquivos.
3. Clique em **Importar** ao lado de um arquivo. O agente dele fica pronto na página Agentes e no menu de agentes da página inicial.
4. Para um arquivo que está em outro lugar, clique em **Escolher um arquivo** (“Ou um arquivo de agente deste dispositivo”) e selecione o arquivo `.md`.

O arquivo deve ser Markdown (`.md`) e ter no máximo 256 KB. O que o app aproveita dele:

| No arquivo do agente | No agente |
|---|---|
| `name` (ou o nome do arquivo, quando não há) | **Nome**: “code-reviewer” vira “Code reviewer” |
| `description` | **Uma linha sobre ele**: a primeira frase, sem os exemplos |
| `model` | **Executa em**: Claude Code com esse modelo (“inherit” mantém o da página inicial) |
| `tools` | **O que ele pode usar**, por tipo; um arquivo sem linha de ferramentas pode usar tudo |
| `permissionMode` | **Modo de permissão**: default → Perguntar, acceptEdits → Aceitar edições, bypassPermissions → Acesso total, plan → Planejar |
| `skills` | **Habilidades a favorecer** |
| O texto abaixo do cabeçalho | **Instruções** |

O ícone é escolhido a partir do nome e da descrição do agente (um telescópio para pesquisa, uma caneta para redação, código para revisão e testes, e assim por diante). Os agentes importados trabalham na pasta da página inicial, como os agentes do Claude Code trabalham em um projeto.

Um arquivo já importado mostra **Atualizar** em vez de **Importar** na lista. **Atualizar** lê o arquivo de novo para o mesmo agente: os campos dele voltam a ser os do arquivo, e só o ícone que você escolheu permanece. Escolher um arquivo do seu dispositivo sempre cria um novo agente.

## Pastas de tarefas: onde trabalha uma tarefa sem pasta

Muitas tarefas não pertencem a nenhuma pasta: um plano de viagem, uma carta, uma pergunta. Para essas, o seletor de pasta na página inicial mostra **Nova pasta de tarefa**, e quando você clica em **Início** o app cria uma pasta nova para a sessão, nomeada pelo dia e por algumas palavras da sua mensagem, como `~/Hydor/2026-10-31-plan-trip-lisbon`. O agente salva o trabalho dele ali, e você o encontra de novo em [Arquivos](/files).

Como o nome é formado:

- A data, no seu fuso horário.
- Até cinco palavras da sua mensagem, deixando de fora as palavras pequenas (a, the, please, help, me…), os links e um `/comando` no início, sem acentos, com no máximo 40 caracteres. Se não sobrar nenhuma palavra, fica `task`.
- Se esse nome já existir, `-2`, `-3` e assim por diante é acrescentado.

### Escolher uma pasta de tarefa ou uma pasta sua

Abra o seletor de pasta na página inicial:

- **Nova pasta de tarefa** (“uma nova em ~/Hydor”) cria uma pasta nova para cada sessão.
- Escolha um projeto, uma pasta que você usou recentemente ou qualquer pasta que encontre com **Procurar** ou digitando o nome ou o caminho dela, e a sessão trabalha ali (veja [Projetos](/guide/projects) e [Sessões](/guide/sessions)).

Até você escolher, o agente decide: os agentes integrados, exceto o Programador, e os seus configurados com “Uma nova pasta de tarefa” usam uma pasta de tarefa; o Programador e os agentes configurados com “A pasta da página inicial” usam a pasta exibida, e um agente que trabalha em um projeto usa esse projeto. A página inicial lembra o que você escolheu. Escolher outro agente devolve a escolha a ele, a menos que você tenha escolhido uma pasta desde que a página foi aberta ou esteja em um projeto. Quando ele muda a pasta, a caixa mostra as escolhas guardadas para aquele lugar, com o agente que você escolheu.

As pastas de tarefas não lotam o menu de pastas: as pastas usadas recentemente que ele lista não as incluem. As sessões iniciadas por voz no modo Mãos livres também recebem uma pasta de tarefa, a menos que a página inicial tenha sido definida por último para uma pasta ou um projeto (veja [Documentos, imagens, vídeos e voz](/guide/documents-voice)).

### Mover as pastas de tarefas

1. Em [Configurações → Recursos → Seus agentes](/settings?s=assistants&find=Task%20folders), encontre **Pastas de tarefas** no grupo **Tarefas** (o (i) dela diz que uma sessão iniciada sem pasta recebe uma nova aqui, nomeada pelo dia e pela tarefa, e que o Programador trabalha na pasta que você escolher).
2. Clique no nome da pasta. Em **Pasta de trabalho**, digite um caminho (ele sugere pastas enquanto você digita, e pastas que você usou recentemente) e clique em **Usar esta pasta**. Informe um caminho completo ou um que comece com `~` para a sua pasta pessoal.

As novas pastas de tarefas vão para lá daqui em diante; as pastas já criadas ficam onde estão. **Voltar para ~/Hydor** aparece depois que você muda, para voltar ao padrão. A linha abaixo dele mostra como são as novas. Os novos projetos que recebem uma pasta própria também a recebem aqui, em uma pasta **Projetos** dentro dela (veja [Projetos](/guide/projects)).

## Limpar depois de uma tarefa

[Configurações → Recursos → Seus agentes](/settings?s=assistants&find=Clean%20up%20after%20a%20task) tem um interruptor no grupo **Tarefas**: **Limpar depois de uma tarefa** (o (i) dele diz o que o agente remove). Ele vem ligado, a menos que você o desligue, e vale para todas as sessões, seja qual for o agente com que ela trabalha.

Com ele ligado, o último passo de um agente em uma tarefa é remover o que ele criou pelo caminho e de que não precisa mais:

- arquivos de rascunho e de teste, pastas e dados temporários, saídas de depuração e capturas de tela;
- branches do git, worktrees (cópias extras de um repositório, cada uma em um branch próprio) e stashes que ele criou e que já foram mesclados ou abandonados;
- processos, servidores ou contêineres que ele iniciou, a menos que você queira mantê-los em execução.

Ele mantém o que você pediu e o trabalho que alguém ainda precisa revisar ou mesclar (como um branch com commits não mesclados), nunca remove nada que não tenha criado e pergunta antes quando algo é grande ou pouco claro (um download grande, qualquer coisa compartilhada). Ele cita cada coisa que remove em vez de excluir por padrão de nome, e diz em uma linha o que removeu e o que deixou. A habilidade de limpeza que acompanha o app tem o método (veja [Habilidades](/guide/skills)).

Desligue-o e os agentes deixam no lugar o que criaram. De qualquer forma, os agentes seguem a mudança a partir da próxima sessão (o Custom, a partir da próxima mensagem).

## Onde mais os agentes entram

- **Projetos**: um projeto pode dizer com qual agente as sessões dele começam (“Suas sessões começam como”); escolher o projeto na página inicial escolhe esse agente. A aba **Agentes** dele mostra os agentes que trabalham nele. Veja [Projetos](/guide/projects).
- **Apps**: um app pode indicar um **Agente**, e as execuções dele começam com esse agente (as execuções a partir de uma página pública não); os passos de agente de um app podem indicar um cada. Veja [Apps](/guide/apps).
- **Tarefas agendadas**: uma tarefa é executada como o agente que a opção **Agente** dela indica; uma tarefa que um agente configura para você a partir de uma sessão é executada como essa sessão. Veja [Tarefas agendadas](/guide/tasks).
- **Voz em Mãos livres**: as sessões que você inicia por voz começam no último lugar escolhido na página inicial, com as escolhas dele, como o agente escolhido ali (senão o agente do próprio projeto, senão o Geral).

## Peça a um agente

- “Crie um agente chamado Caçador de artigos que encontre novos artigos sobre os meus temas de pesquisa todos os dias úteis às 8h e guarde os cinco melhores em uma página, pensando com Rápido.”
- “Crie um agente chamado Contador que cuide das contas da minha casa em uma planilha, não possa executar comandos e possa gastar no máximo US$ 5 por mês.”
- “Crie um agente que verifique a cada hora se o Python 3.15 já foi lançado, me avise quando for e depois pare.”
- “O agendamento de sábado do meu Caçador de artigos não é mais necessário: remova-o.” “Exclua o meu agente Contador.”
- “Deixe o meu agente Gerente de versões passar trabalho para o Tradutor e o Executor de testes.”
- “Faça o meu agente Tradutor trabalhar só no projeto Hydor.”
- “Faça Rápido significar Haiku para o Claude Code e o meu modelo local Qwen para o Custom.”
- “Desligue o Máximo para problemas difíceis, para que as sessões no Automático fiquem no Melhor.”
- “Importe o meu arquivo de agente do Claude Code ~/.claude/agents/code-reviewer.md como um agente.”
- “Quais agentes eu tenho, com o que cada um pensa e quanto eles gastaram neste mês?”
- “Faça o meu Caçador de artigos devolver uma lista de artigos, cada um com um título, um link e por que ele importa, como uma página guardada e uma notificação.”
- “Faça o meu Contador adicionar toda sexta-feira, na planilha Orçamento da casa, uma linha com os gastos da semana e os maiores itens.”
- “Faça o meu agente Relatório semanal enviar o relatório por e-mail para maria@example.com toda segunda-feira, com o assunto Relatório semanal {date}.”
- “O que o meu Contador devolveu neste mês, e quanto isso somou?”
- “Quais dos meus agentes rodam sozinhos amanhã de manhã, e quando?”
- “Deixe o meu Guardião da documentação manter uma conversa própria e envie a ele: atualizar o guia para a nova página Agentes.”
- “Troque a minha sessão sobre a viagem a Lisboa para o agente Planejador.”
- “O que mudou no meu Caçador de artigos nesta semana? Traga de volta a versão de antes de segunda-feira se os exemplos dela se saíam melhor.”
- “Dê ao meu agente Relatório semanal dois exemplos, um para uma semana tranquila e outro para uma semana cheia, com o que um bom relatório precisa dizer, e teste-os.”
- “Baixe o meu agente Contador como arquivo e diga o que vou precisar definir de novo no meu notebook.”
- “De agora em diante, coloque as novas pastas de tarefas em ~/Documents/Tasks.”
