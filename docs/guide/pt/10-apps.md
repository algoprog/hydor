# Apps

Um app é uma tarefa que você executa várias vezes: você preenche um formulário curto, aperta Executar, e um agente faz o trabalho e entrega o resultado, em uma tela feita para isso (páginas para clicar e agir, com mapas, gráficos, imagens e vídeos) ou como um cartão e tabelas. Este tópico trata dos apps prontos, de como executar um, das chaves de que um app precisa, de como pedir a um agente que execute um para você em qualquer sessão, de como criar seus próprios apps (etapas, uma tela, arquivos próprios, dados, memória), de como compartilhar um (uma chave de API, outros agentes, uma página pública, linhas de um CSV) e de como passar um adiante como arquivo. Os serviços aos quais os agentes se conectam ficam ao lado dos apps: veja [Apps conectados, chaves e ferramentas](/guide/connections).

![Apps: os seus e os prontos, que já vêm instalados](images/apps.webp)

## O que é um app

Um app é uma pequena ferramenta para uma tarefa específica que ajuda você a ver e encontrar informações: você responde a algumas perguntas, as etapas dele pesquisam e calculam, e a resposta aparece em uma tela feita para isso (mapas, gráficos, tabelas, cartões). Você pode usá-lo de duas formas: abri-lo na página Apps, ou simplesmente pedir o que ele faz em qualquer sessão, e o agente o executa para você ali. Os apps são pequenos de propósito: cada um responde bem a um tipo de pergunta, em vez de ser um programa grande.

Um app guarda tudo de que uma tarefa precisa, exceto os detalhes que mudam a cada vez:

- **O formulário**: as perguntas que alguém responde antes de cada execução (“Para onde?”, “Quantos dias”).
- **A tarefa**: o que se pede ao agente, com as respostas já incluídas.
- **A resposta**: os campos do resultado (um resumo, uma lista, uma tabela) que o agente preenche quando termina. Um app sem campos de resposta entrega a resposta do agente no lugar.
- **Quem faz**: o agente, o modelo dele, o modo e as ferramentas que ele pode usar.

Cada vez que você executa um app, o Hydor começa uma sessão com a tarefa preenchida. O agente trabalha do início ao fim sem parar para perguntar nada a você: ele faz suposições razoáveis e diz quais foram. Essa rodada única se chama **execução**. Depois você pode pedir alterações no resultado, e o agente entrega uma versão atualizada.

Abra a página Apps pelo bloco **Apps** na barra de ícones, ou acesse [/apps](/apps). No celular, a barra lateral é uma gaveta: abra-a primeiro. Você também pode encontrar qualquer app, seu ou pronto, digitando o nome dele na caixa de busca (Ctrl+K, ⌘K no Mac).

## Encontre o seu caminho na página Apps

No computador, a página tem uma coluna ao lado da barra de ícones, como as Configurações: o logotipo do Hydor, **Novo app** (o menu dele tem **Descreva para um agente**, **Começar do zero** e **Instalar a partir de um arquivo**) e **Ocultar barra lateral** (Ctrl+B; **Mostrar barra lateral** a traz de volta), e abaixo deles os lugares da página, cada um com quantos apps tem e o aberto marcado:

- **Todos os apps**: a página inteira, como descrito abaixo.
- **Fixados**, **Usados recentemente** e **Seus próprios apps**: cada um mostra apenas essa parte. **Fixados** e **Usados recentemente** aparecem quando já têm algo; **Seus próprios apps** sempre aparece, com **Criar um app**.
- **Tipos**, um rótulo sobre uma linha para cada tipo de app com a contagem (**Pesquisa**, **Planejando**, **Compras**, **Trabalho**, **Escrita**, **Aprendizado**, **Construir**, **Clima**, **Esportes**, **Comida**, **Diversão**, **Laboratório** e assim por diante, quando há dois ou mais): os apps desse tipo, os seus e os prontos.
- **Apps conectados**, depois de uma linha: os serviços que todo agente pode usar, conectados uma só vez, com as chaves que eles usam ([Abrir Apps conectados](/guide/connections#open-connected-apps)). A linha deles os conta.

O lugar fica no endereço (`/apps`, `/apps?place=pinned`, `/apps?place=recent`, `/apps?place=own`, `/apps?kind=Research`, `/apps/connected`), então um link o abre. No topo da página, uma linha mostra o nome do lugar à esquerda (**Todos os apps**, **Fixados**, **Pesquisa**, **Apps conectados**) e tem a caixa de busca à direita, com o que esse lugar oferece ao lado: a ordenação de **Seus próprios apps**, ou **Últimas execuções** de **Usados recentemente**. Escolher outro lugar esvazia a caixa de busca. Em uma janela estreita e no celular não há coluna: a página tem o título **Apps**, com duas abas, **Apps de agentes** e **Apps conectados**, cada uma contando o que tem; **Novo app** fica no topo de **Apps de agentes**; e os tipos são chips abaixo da linha com o título. **Todos os apps**, de cima para baixo (os outros lugares mostram apenas a parte deles, sob a mesma linha):

- **Encontre um app: clima, receitas, uma viagem…**: uma caixa que encontra qualquer app enquanto você digita, pelo nome, pelo tipo ou pelo que ele faz (cada palavra digitada precisa corresponder a algo, e o plural encontra o singular: “receitas” encontra um app de receita), entre os seus, os prontos, os que você desinstalou e os blocos de construção, com a melhor correspondência primeiro. Enter abre o primeiro; Esc limpa a caixa. Ela fica à direita da linha com o título da página (**Todos os apps**, ou o lugar que você escolheu), e permanece no topo enquanto a página rola. No lugar de um tipo, ela busca entre os apps desse tipo; nos outros, entre todos. Sem a coluna, abaixo dela, há um chip para cada tipo de app com a quantidade que ele tem (**Todos** primeiro, depois os tipos dos apps prontos), para mostrar um só tipo.
- **Fixados**: os apps que você mais usa, como blocos grandes na ordem que você definiu, cada um a um toque de abrir. **Fixar no topo**, em **Mais** (⋯) no cartão de um app ou no menu **Mais** da página dele, coloca o app aqui, e **Desafixar** ali o tira. Arraste um bloco para movê-lo (no celular, pressione e segure primeiro), ou use **Mais** (⋯) do bloco: **Desafixar**, **Mover para a esquerda** e **Mover para a direita**. Até 12 apps; o app os guarda, então todos os dispositivos mostram os mesmos.
- **Usados recentemente**: os apps que você executou há pouco, cada um uma vez, o mais recente primeiro (até 8): a partir do formulário, da própria página ou tela deles, ou executados para você por um agente em uma conversa. Cada cartão diz o que foi pedido por último, como está essa execução e quando, com **Abrir o resultado** (um app com tela própria abre na página dele), **Responder** enquanto aguarda você, **Acompanhar** enquanto trabalha, ou **Abrir a execução** quando falhou ou foi interrompida; e **Executar de novo**, que abre o formulário preenchido com as mesmas respostas. **Últimas execuções**, ao lado do título, desdobra suas últimas execuções (até seis) em uma lista; antes de você usar um app, elas são a parte, com esse nome. As execuções a partir de linhas de um CSV e de páginas públicas ficam fora dessa lista, sob o próprio app, assim como as de um app que abre na própria página (Explore), que mostra as últimas execuções ali. Enquanto você não fixar nenhum, uma linha sugere fixar os que mais usa no menu ⋯ deles.
- **Começar com**: antes de você executar qualquer app, quatro apps prontos que a maioria das pessoas usa (**Previsão do tempo**, **Planejador de viagens**, **Cozinhe com o que você tem** e **Comparar produtos**), cada um a um clique do formulário, com uma linha sobre o que são apps e **Saiba mais** ([O que é um app](#what-an-app-is)).
- **Seus próprios apps**: os que você criou ou instalou a partir de um arquivo, com a quantidade, e o bloco **Criar um app**, que abre um novo app (para descrever a um agente, começar do zero ou instalar um arquivo). A partir de quatro apps seus, o botão ao lado do título os ordena por **Mais usados**, **De A a Z** ou **Mais recentes**; este dispositivo lembra sua escolha.
- **Apps prontos**: os que vêm com o Hydor, instalados, sob os tipos deles (**Pesquisa**, **Planejando**, **Compras**, **Clima**, **Esportes**, **Comida**, **Diversão** e os demais): execute um, ou faça dele o seu para alterá-lo.

Todo cartão, inclusive os seus, tem o mesmo tamanho: o ícone, o nome e o que ele faz, depois o que ele pede (as perguntas do formulário, ou **Pronto para executar**), pequenas marcas (aponte para uma para ver o texto: a resposta dele abre em uma tela própria, com mapas, gráficos e tabelas; ele funciona em conversas, então você pode pedir o que ele faz em qualquer sessão e o agente o executa ali; ele precisa de uma chave que o app ainda não tem; **Público** quando a página pública dele está aberta), **Não instalado** ou **Bloco de construção** quando for o caso, e quando foi a última execução. O **Mais** (⋯, no canto superior direito; no computador aparece quando você aponta para o cartão) tem **Abrir**, **Fixar no topo** (ou **Desafixar**) e **Baixar como arquivo**. Quando nada corresponde ao que você digitou, a página diz “Nenhum app faz isso ainda”, com **Descreva para um agente**, que inicia o Criador de apps com as suas palavras.

Abaixo deles:

- **Apps prontos para instalar**: aparecem quando você desinstala um app pronto. Cada cartão mostra o tipo, o que ele faz e o que você recebe dele (as páginas da tela, como **Sua viagem**, **Dia a dia**, **Reservar com antecedência** e **Orçamento** do Planejador de viagens), e **Instalar** (veja [Instalar ou desinstalar um app pronto](#install-or-uninstall-a-ready-made-app)).
- **Blocos de construção** (recolhidos, com a quantidade): pequenos apps feitos para serem etapas dos seus (resumir uma página, traduzir, responder a partir da web, classificar por tipos, extrair os fatos), junto com os blocos que você mesmo criou; **Adicionar uma etapa** os oferece nas etapas de todo app.

O estado de uma execução aparece como um selo: **Aguardando** (na fila), **Iniciando**, **Em andamento**, **Precisa de você** (aguarda uma aprovação ou uma resposta), **Concluído**, **Falhou** ou **Interrompida**.

Solte o arquivo de um app (`.hydor-app` ou `.json`) em qualquer lugar da página para instalá-lo: primeiro abre o cartão que diz o que ele é (veja [Compartilhar um app como arquivo](#share-an-app-as-a-file)).

No celular, a página é uma coluna só, sem os lugares (as duas abas e os chips de tipo os substituem): os apps fixados e os usados recentemente são linhas que rolam para o lado, como os chips de tipo, e os cartões ficam só com o nome e o que fazem.

## Usar um app pronto

Estes vêm com o Hydor, já instalados: estão entre **Seus apps** desde o início, e os agentes podem executá-los para você nas suas sessões (veja [Peça a um agente para executar um app por você](#have-an-agent-run-an-app-for-you)). Cada um funciona em etapas: a página dele mostra **Como funciona**, e **Como grafo** (ou **Torná-lo meu**) abre o app no construtor. Cada um devolve a resposta em uma visualização própria, com páginas para suas partes e botões que fazem coisas (veja [Sua visualização](#its-view)). As etapas de agente são executadas com o Claude Code, a menos que você escolha outro agente na página do app; as etapas rápidas consultam o modelo auxiliar (Configurações → Modelos). Os apps com uma pergunta do tipo “Deixar-me…” só esperam por você no meio do caminho quando você marca a opção e há alguém para responder: ao executar pelo formulário do app ou por um agente em uma das suas sessões.

- **Relatório de pesquisa aprofundada**: um relatório com fontes sobre qualquer pergunta, com busca na web, fatos conferidos entre si e cada afirmação citada. Você informa o tema, o foco, a profundidade e o público. Ele planeja as perguntas, pesquisa três por vez, classifica as fontes, lê as melhores páginas lado a lado, pesquisa de novo onde uma pergunta tem poucas fontes e escreve o relatório com citações numeradas; **Deixar-me verificar as perguntas primeiro** faz com que ele espere você manter ou alterar as perguntas. A visualização dele tem **Resumo** (a pergunta, o grau de certeza e as principais conclusões, cada uma com **Aprofundar**, que inicia um relatório próprio sobre ela), **Relatório completo** (com **Copiar o relatório**) e **Fontes**, que você pode mostrar por editora.
- **Planejador de viagens**: um plano dia a dia conferido com as suas datas (horários de funcionamento, eventos, tempos de deslocamento), com orçamento e o que reservar com antecedência. Ele calcula as datas e depois busca eventos e feriados, o clima (a previsão, quando a viagem é daqui a dez dias ou menos), o que ver, onde ficar e como se locomover, lado a lado, antes de planejar os dias e somar o orçamento; **Deixar-me escolher antes de planejar** faz com que ele pergunte onde ficar e o que não pode faltar. A visualização dele tem **Sua viagem** (a viagem em números, o plano, os dias de relance e dicas; **Tranquilo**, **Equilibrado** ou **Mala pronta**, e **+ Mais um dia**, planejam tudo de novo desse jeito), **Dia a dia** (uma linha do tempo em que você marca cada manhã, tarde e noite, cada dia encabeçado por uma imagem do principal ponto turístico, com um mapa da região de cada dia), uma página para cada dia (com a imagem, **Copiar o dia** e **Pesquisa** sobre a região), **Mapa** (a região de cada dia em um mapa, numerada e ligada em ordem), **Reservar com antecedência** (uma lista para marcar conforme você reserva) e **Orçamento** (um gráfico e cada estimativa).
- **Comparar produtos**: preços atuais, avaliações independentes e problemas conhecidos, ponderados pelo que importa para você, com uma escolha clara. Quando você descreve uma necessidade em vez de citar produtos, ele encontra primeiro as opções (**Deixar-me escolher quais comparar**); depois examina cada uma, três por vez, dá notas e as classifica pelo que importa para você. A visualização dele tem **A escolha** (o produto com sua imagem, seu preço e o motivo, e os outros que ele considerou), **Lado a lado** (a nota de cada um em 100 em um gráfico, depois cada um com sua imagem, pontos fortes e fracos, com a escolha marcada), uma página para cada produto (com **Pesquisar como isso se sustenta**) e **Atenção**. A resposta dele também nomeia **A escolha**, como a comparação a lista, para os programas.
- **Perguntas sobre documento**: respostas a partir de um documento que você anexa, cada uma com o trecho exato e onde ele está. Ele lê o documento, encontra os trechos de cada pergunta, responde três por vez com um resumo ao lado e pede a um agente que leia tudo quando uma pergunta continua sem resposta. A visualização dele tem **Respostas** (cada uma com seu trecho e onde ele está; **Encontrar uma pergunta** filtra as respostas, e **Perguntar mais sobre este documento** executa o app de novo com novas perguntas e o mesmo arquivo) e **O documento**.
- **Das notas de reunião às ações**: decisões, itens de ação com responsáveis e datas, perguntas em aberto e um e-mail de acompanhamento, a partir de notas brutas ou de uma transcrição. Ele divide as notas, extrai o que foi decidido, calcula os prazos a partir de hoje e pergunta a você quem assume as ações que ninguém assumiu (**Pergunte-me quem assume o que ninguém assumiu**). A visualização dele tem **Visão geral** (quem veio, a reunião em números, o resumo e o que foi decidido), **Ações** (marque cada uma quando concluída, ou mostre as de uma pessoa), **E-mail de acompanhamento** (com **Copiar o e-mail**) e **Ainda em aberto**.
- **Carta de apresentação**: uma carta para uma vaga específica, baseada em evidências reais da sua trajetória, com as lacunas apontadas com honestidade. Ele lê o anúncio, descobre o que a vaga pede, pesquisa a empresa enquanto relaciona as suas evidências, escreve a carta e depois a verifica e revisa até duas vezes. A visualização dele tem **A carta** (em uma página própria, com **Copiar a carta**; **Quente**, **Confiante** ou **Formal**, e **Curto** ou **Padrão**, escrevem-na de novo desse jeito), **Por que você se encaixa** (cada requisito ao lado da sua evidência) e **Lacunas para se preparar**, para você marcar.
- **Plano de aula**: uma aula cronometrada planejada a partir dos objetivos, com atividades, verificações de compreensão, apoio e desafio extra. Ele confere os fatos que ensina e distribui os minutos para que a soma feche. A visualização dele tem **Visão geral** (os objetivos e os materiais para marcar conforme você os prepara), **Linha do tempo** (a aula como uma faixa só, cada atividade tão larga quanto seus minutos, e depois cada atividade), **Apoio e verificações** e **Plano completo** (com **Copiar o plano**).
- **Resumo semanal de notícias**: a última semana nos assuntos que você acompanha, a partir de reportagem original, com duplicatas unidas e o motivo pelo qual cada notícia importa. Ele pesquisa a semana de cada assunto, três por vez, une as mesmas notícias, lê as melhores e escolhe quais manter. A visualização dele tem **Reportagens** (cada uma com a imagem da própria página; mostre as de um assunto, marque cada uma como lida ou faça uma **Pesquisa** sobre uma) e **O resumo** (com **Copiar o resumo**).
- **Explicar um contrato**: o que um acordo diz em linguagem simples: termos-chave, datas, o que é incomum e o que perguntar antes de assinar. Anexe o arquivo ou cole o texto. Ele divide o contrato em cláusulas, lê as partes lado a lado e pede a um agente que dê uma segunda olhada em qualquer coisa séria. A visualização dele tem **Resumindo** (o que ele diz, os sinais de alerta em números e as perguntas a fazer, com **Copiar as perguntas**), **Sinais de alerta** (por gravidade, para mostrar um tipo), **Termos-chave** e **Datas**.
- **Criar um app web pequeno**: um app funcional a partir de uma descrição, em HTML, CSS e JavaScript simples que abre a partir de um arquivo, testado antes de ser entregue. Ele planeja o app (**Deixar-me verificar o plano antes de criar**), cria, testa e corrige até os testes passarem, no máximo duas vezes. A visualização dele tem **O que foi criado** (como abri-lo, seus arquivos e **Criar de novo com uma mudança**) e **Próximos passos**, para você marcar.

Os apps para coisas do dia a dia são menores e mais rápidos: eles obtêm dados reais de serviços gratuitos quando há algum (Open-Meteo para o clima, TheSportsDB, TheMealDB para receitas, TVmaze, CheapShark, Open Library, Wikipedia, Wikidata, OpenStreetMap), um programa calcula o que precisa sair exato e um modelo rápido lê, escolhe e diz tudo em linguagem simples. Nenhum precisa de chave.

- **Previsão do tempo**: os próximos dias em qualquer lugar: máximas, mínimas e chance de chuva em gráficos, as próximas 48 horas, os melhores dias para o que você planeja, o que vestir e o que merece atenção. Informe um lugar (uma cidade, ou uma com a região, como “Paris, Texas”). A visualização dele tem **Previsão** (o tempo agora, cada dia como um bloco que abre as horas, e os gráficos; **Em °F** ou **Em °C**, e **Olhar 14 dias à frente**, executam o app de novo desse jeito), **Próximas 48 horas** e **O que vestir** (com **Copiar a previsão**, **Melhores meses para ir** e um mapa do lugar).
- **Melhor época para ir**: o clima mês a mês em qualquer lugar, com a média dos últimos cinco anos: temperaturas, dias de chuva e horas de sol em gráficos, cada mês pontuado para o que você quer fazer lá (passeios pela cidade, praia, trilhas, neve, fugir do calor). A visualização dele tem **Mês a mês** (uma foto do lugar no topo, os melhores meses, os doze meses coloridos conforme o quanto cada um serve, os gráficos; **Ideal para** escolhe outro tipo de viagem), **Quando ir** (os melhores meses e por quê, os meses a evitar, dicas) e **Os números**.
- **Acompanhamento de time**: os próximos jogos de qualquer time, os últimos resultados e a forma, a posição na tabela e as notícias da semana. A visualização dele tem **A equipe** (o escudo, a forma em letras coloridas, a próxima partida com **Ver prévia**), **Resultados** (gols marcados e sofridos em um gráfico), **Próximos jogos** (cada um com **Prévia**, que inicia uma Prévia da partida) e **Notícias**.
- **Prévia da partida**: dois times antes de se encontrarem: a forma, os últimos confrontos, notícias dos times e o que os especialistas esperam, com as chances de cada resultado. A visualização dele tem **Prévia** (os dois escudos, o resultado provável, as chances em uma barra só), **Forma e reuniões** (quem venceu os últimos confrontos, em um gráfico) e **Notícias do time** (com **Copiar a prévia** e **Acompanhar** o time).
- **Cozinhe com o que você tem**: receitas para o que há na sua geladeira: o que cada uma usa do que você tem e o que você precisaria comprar, com fotos, os passos cronometrados e um vídeo quando houver. Diga sua dieta e quanto tempo você tem; sal, óleo e temperos contam como disponíveis, a menos que você diga o contrário. A visualização dele tem **Receitas** (**Algo mais rápido** executa o app de novo), uma página para cada receita (os passos em uma faixa só de minutos, que você marca enquanto cozinha, os ingredientes marcados quando você os tem, **Copiar os passos**) e **O que comprar**.
- **Plano de refeições e lista de compras**: jantares para uma semana (até duas) escolhidos para a sua casa, dieta e gostos, cada um com receita e foto, e uma lista de compras para todos eles, com as quantidades somadas, por corredor. A visualização dele tem **A semana** (**Planejar outra semana**), uma página para cada jantar (ingredientes, modo de preparo e vídeo), **Lista de compras** (mostre um corredor, marque os itens enquanto compra, **Copiar a lista**) e **Dicas**.
- **Ideias de presente**: presentes pensados para alguém dentro do seu orçamento, objetos e experiências, cada um com o motivo de combinar com a pessoa, seu preço habitual e um para comprar agora, com o preço e a loja. A visualização dele tem **Ideias** (cada uma com uma imagem do que comprar, por tipo; **☆ Guardar** as que você gostar, **Mais como este** executa o app de novo) e **Por preço** (as faixas de preço em um gráfico).
- **O que assistir**: filmes e séries escolhidos para o seu humor de hoje à noite, com onde cada um está disponível no seu país (primeiro nos seus serviços), a duração, o trailer e por que combina. A visualização dele tem **Hoje à noite** (a escolha da noite e depois as outras; um ▶ sobre uma imagem indica que há trailer), uma página para cada um (com o trailer rodando ali e **Já vi: escolher de novo**) e **Lado a lado**.
- **Buscador de jogos**: jogos escolhidos pelo que você gosta e onde joga (Nintendo Switch 2 entre as opções), já lançados, a caminho (com a data de cada lançamento) ou ambos, cada um com imagem e trailer, o motivo de combinar e quanto tempo leva; para PC, o melhor preço de hoje e o mais baixo de todos os tempos. A visualização dele tem **Jogos** (um ▶ sobre uma imagem indica que há trailer, e um jogo que ainda vai sair informa quando chega), uma página para cada um (com o trailer rodando ali, sua oferta e **Mais como este**), **Preços** (agora e no mínimo, em um gráfico) e **Tempo para concluir**.
- **Quiz sobre qualquer tema**: um quiz para jogar na própria página, com os fatos lidos da Wikipedia: escolha uma resposta e ele mostra se você acertou e por quê, com sua pontuação no topo; as respostas são embaralhadas a cada vez. A visualização dele tem **Jogar o quiz** (**Recomeçar**, **Uma mais difícil**, **Novas perguntas**), **Respostas** e **Sobre o assunto** (com **Copiar o quiz**).
- **Buscador de livros**: livros que você provavelmente vai amar, a partir dos que você amou, cada um conferido na Open Library quanto à capa, às páginas e à avaliação. A visualização dele tem **Sua estante** (uma página para cada livro, com **Mais como este**) e **Lista de leitura** (**Marcar como lido**).
- **O que fazer**: programas em uma cidade nos dias que você escolher (no próximo fim de semana, se você não disser): shows, feiras, exposições e passeios em família encontrados na web, com o clima de cada dia. A visualização dele tem **Por dia** (cada evento com a imagem da própria página), **Mapa** (cada local numerado) e **Por tipo**; marque a que você vai (**Vai?**) ou use **Copiar a lista**.
- **Plano de economia**: como alcançar uma meta de economia até uma data: quanto guardar por mês com os juros somados, o saldo crescendo em um gráfico e quando você chegaria lá economizando 20% a mais ou a menos. A visualização dele tem **O plano** (**Economizar 50 a mais por mês** ou **Economizar 50 a menos**, quando você informou um valor), **Mês a mês** (os marcos e cada mês) e **Dicas**.
- **Criar gráficos dos meus dados**: uma planilha, um CSV ou números que você cola, transformados em até três gráficos do tipo que mais combina com eles, com o que mostram em poucas frases. A visualização dele tem **Gráficos**, **O que os dados mostram** (cada conclusão, para copiar) e **Os dados** (as colunas resumidas e **Fazer outra pergunta sobre estes dados**).
- **Um assunto como linha do tempo**: qualquer assunto como uma linha do tempo, lida da Wikipedia: seus momentos-chave com datas (até trinta **Em detalhes**), suas eras e a história resumida. A visualização dele tem **A linha do tempo** (mostre um fio; **Me teste sobre isso** inicia um quiz sobre o assunto) e **Em um gráfico** (os momentos por ano, os pontos de virada maiores, e as eras).
- **Explorar um lugar**: o que há ao redor de qualquer lugar (uma cidade, um bairro ou um ponto turístico), em um mapa: os tipos de lugar que você nomeia em **O que você gosta** (parques para cães, cafés, parquinhos…) vêm primeiro, do OpenStreetMap, depois as atrações mais conhecidas da Wikipedia e do Wikidata, depois museus, parques e pontos turísticos, com uma imagem e uma linha cada, os melhores para você destacados e colocados em ordem de caminhada. Não nomeie nada e ele trabalha só com as atrações. A visualização dele tem **A caminhada** (as paradas numeradas e ligadas no mapa, cada uma para marcar como vista; **O clima por lá**) e **Tudo ao redor** (mostre um tipo).

Os apps de pesquisa e de laboratório acompanham a sua área, leem e conferem artigos e cuidam dos seus experimentos e relatórios. Vários abrem em uma página própria e podem se atualizar sozinhos, como o Explorar faz; o tópico [Pesquisa](/guide/researchers) conta como eles se encaixam.

- **Radar de artigos**: toda manhã, os artigos novos da sua área (os do arXiv, nas categorias, nos temas e das pessoas que você acompanha, e os do OpenAlex nos seus temas), classificados de acordo com os seus projetos, temas e perfil, cada um com o que faz em uma frase e por que importa para você. Ele abre em uma página própria e pode se atualizar todos os dias. A visualização dele tem **Hoje** (os artigos sob o projeto ou tema em que cada um se encaixa, com **☆ Salvar**, **Citar**, **PDF**, **Aprofundar** e **Não é para mim**, que orientam as escolhas dos próximos dias) e **Artigos salvos** (com **Copiar tudo como BibTeX** e **Adicionar à lista de leitura**). Veja [Acompanhe a sua área](/guide/researchers#keep-up-with-your-field).
- **Alertas de citações**: quem citou os seus artigos desde a última vez que ele verificou, com a frase que cita você (a menção ao seu artigo destacada) e se ela se baseia no seu trabalho, o compara, o contesta ou apenas o menciona. Ele abre em uma página própria. A visualização dele tem **Nova** (as novas citações por artigo seu; mostre um tipo) e **Seus artigos** (cada um com suas citações e quantas são novas).
- **Monitor de novos modelos**: novos modelos de um tipo no Hugging Face (rerankers, embedders e mais), conferidos com as suas licenças, tamanho e downloads, o cartão de cada um resumido e, com o seu comando de avaliação, cada um executado em Experimentos, que avisa você só quando algum supera o seu melhor. Ele abre em uma página própria. A visualização dele tem **Modelos** (em que pé está cada um, o que diz o cartão, a nota) e **Sua avaliação**.
- **Radar de prazos**: os prazos das suas conferências a partir das listas abertas ccfddl e ai-deadlines, convertidos do AoE (ou do fuso que a chamada indicar) para o seu, com lembretes nos dias que você definir (14, 3 e 1) em uma única notificação, e o limite de páginas e o modelo de cada chamada com link. Ele abre em uma página própria. A visualização dele tem **Linha do tempo** (cada prazo com o tempo que falta, **Copiar os prazos**, **Mostrar os passados**) e **Conferências**.
- **Trabalhos relacionados vivos**: uma página por tema que cresce conforme surgem artigos (os do arXiv e do OpenAlex, e os que citam os seus artigos de partida), cada artigo resumido e com a indicação de como se relaciona, agrupados em temas, com os novos marcados. Ele abre em uma página própria. A visualização dele tem **Trabalhos relacionados** (cada tópico tema por tema, com **Redigir os trabalhos relacionados**, uma seção em LaTeX com chaves `\cite` escrita por um agente, **Exportar BibTeX** e **Sem relação** em um artigo) e **Novo desta vez**.
- **Buscador de lacunas**: ideias de projeto a partir dos seus artigos cruzados com os deste mês em uma área, cada uma conferida quanto a trabalhos anteriores (**novo**, **parcialmente concluído** ou **já concluído**, com o artigo mais próximo) e dimensionada para o poder de computação que você tem, com o primeiro experimento. A visualização dele tem **Ideias de pesquisa** (cada uma com **Planejar**, que abre o app Sprint de pesquisa com ela, e **Aprofundar**) e **O que ele cruzou**.
- **Lista de leitura**: seus artigos por projeto, cada um com seu PDF, BibTeX, tags, status e notas, mantidos em sincronia com o Zotero. Ele abre nos seus artigos: **+ Adicionar** busca um pelo DOI, id do arXiv, link ou título e preenche tudo (um que você já tem é completado, não adicionado de novo); pesquise-os, mostre um status, tag ou projeto e marque cada um como **A ler**, **Lendo agora** ou **Leitura concluída**. A página de cada artigo tem seus links, notas e BibTeX, e **Reproduzir**; **Por projeto** conta os artigos de cada projeto. **Mais** tem **Importar um .bib**, **Exportar um .bib** e **Sincronizar com o Zotero** (a chave dele é pedida na primeira vez), e os artigos marcados geram uma **Matriz de literatura**. Veja [Leia e organize artigos](/guide/researchers#read-and-organise-papers).
- **Matriz de literatura**: artigos lidos lado a lado em uma planilha: uma linha para cada um, uma coluna para cada coisa que você compara (tarefa, dados, método, métricas, resultados e limites, a menos que você mude), cada célula com a página de onde vem. Informe os artigos um por linha, ou “minha lista de leitura” com uma tag, um projeto ou um status. Ele lê três por vez e guarda a matriz como uma planilha nos arquivos do projeto que você indicar. A visualização dele tem **A matriz** (**Abrir a planilha**, **Copiar como tabela**, os artigos que ele não conseguiu ler e por quê, e **Outra coluna**), **Artigos** e **Entre os artigos**.
- **Reproduzir um artigo**: o código de um artigo executado para conferir os números dele: ele encontra o código (no artigo, ou no GitHub e na web), monta um ambiente limpo, obtém os dados e checkpoints, executa primeiro uma pequena fatia e depois a execução real (uma longa em [Experimentos](/guide/experiments), com espera), dentro dos limites que você definir, e compara cada número com o do artigo. A visualização dele tem **Foi reproduzido?** (os números do artigo ao lado dos nossos, **Abrir a pasta**, **Tentar de novo**), **O que foi preciso** e **Relatório**.
- **Simulador de revisores**: seu rascunho avaliado no formulário e nas notas da própria conferência (ACL Rolling Review, SIGIR, NeurIPS, ICLR, ICML, KDD, CIKM, WSDM, TheWebConf ou um periódico), por até cinco revisores, cada um com um ângulo próprio, com uma meta-revisão de um chair da área. A visualização dele tem **As revisões**, **Meta-revisão** (com o que poderia derrubar o artigo, o mais perigoso primeiro), **Linhas de base e ablações** que os revisores vão pedir e **Antes de enviar** (uma lista para marcar, e **Responder a estas avaliações**, que inicia a Bancada de respostas aos revisores). Veja [Revise, responda e apresente o seu artigo](/guide/researchers#review-answer-and-present-your-paper).
- **Bancada de respostas aos revisores**: os pontos das avaliações agrupados entre os revisores e classificados (mal interpretado, exige um experimento, exige palavras, menor), uma resposta redigida para cada um dentro do limite da conferência, no tom que você escolher, com marcadores onde um novo resultado é necessário. A visualização dele tem **Pontos levantados** (cada um com seu rascunho, seu tamanho em relação à sua cota e **Copiar**), **A fazer** (os experimentos e mudanças para marcar) e **Resposta completa** (com **Copiar a resposta completa**).
- **Do artigo à palestra, pôster e thread**: a partir do seu artigo, os que você escolher entre: slides cronometrados com as figuras e equações reais e o que dizer, um pôster A0 (um documento LaTeX), uma thread para X e Bluesky e um post para o LinkedIn, e uma página do projeto, guardados nos arquivos do projeto que você indicar. A visualização dele tem **O que foi criado** (cada um com **Abrir**), **A apresentação oral** (os slides em uma faixa só de minutos) e **Conversa** (os posts de cada plataforma para copiar).
- **Médico de figuras**: seus scripts de gráficos deixados prontos para o artigo: a largura da coluna para o modelo da conferência, a fonte do artigo, cores que leitores daltônicos distinguem, PDFs vetoriais com as fontes incorporadas (nenhuma Type 3) e um arquivo de estilo para todos, com os originais guardados ao lado. A visualização dele tem **Antes e depois**, **Arquivo de estilo** (com **Copiar**) e **O que mudou**.
- **Bancada de anotação**: você e um modelo classificam a mesma amostra de textos. Informe os rótulos (até nove), as suas diretrizes e os textos: um arquivo CSV ou JSON lines, um conjunto de dados do Hugging Face pelo nome ou textos colados; ele pega uma amostra aleatória e pede ao modelo auxiliar que a classifique com as suas diretrizes. A execução dele é onde você classifica: **Classificação** (um texto por vez, um botão grande e uma tecla de 1 a 9 para cada rótulo, com o rótulo do modelo mostrado só depois de você dar o seu), **Divergências** lado a lado, **Concordância** (com que frequência vocês concordam, o κ de Cohen e a matriz de confusão) e **Exportar** (um download em CSV ou JSON lines, ou **Publicar no Hugging Face** com o cartão do conjunto de dados). Veja [Execute o trabalho do seu laboratório](/guide/researchers#run-your-labs-work).
- **Sprint de pesquisa**: uma pergunta de pesquisa levada por um sprint no seu próprio código: hipóteses, um plano e código em um branch próprio (em um worktree que ele cria), execuções em [Experimentos](/guide/experiments) dentro das suas horas de GPU, um notebook de análise e um relatório curto, esperando você manter as hipóteses e iniciar as execuções. A visualização dele tem **O sprint** (cada hipótese com seu veredito e evidências), **Execuções** (com uma tabela de resultados em relação à linha de base) e **Relatório**.
- **Planejador de varreduras**: uma varredura de hiperparâmetros de um script de treinamento dentro de um orçamento de execuções ou horas de GPU: um agente lê os argumentos do script e propõe as configurações e valores (ou usa os seus), o Experimentos as executa e interrompe cedo as tentativas ruins, e um programa calcula quanto cada configuração importou. A visualização dele tem **Resultados** (a melhor execução, o que ele encontrou, o que tentar a seguir), **Por configuração** (um gráfico para cada) e **Todas as execuções**.
- **Relatório semanal de progresso**: a sua semana como uma atualização para o seu orientador, a sua equipe ou um gerente (o que foi feito, resultados com seus números, problemas e bloqueios, o plano da próxima semana, perguntas a fazer), a partir das suas sessões (inclusive as do VS Code e do terminal), commits, execuções e leituras. Ele abre em uma página própria com o da semana atual, com **Copiar como Markdown**, **Copiar como e-mail** e **Salvar como documento**, e as semanas anteriores abaixo; com **Atualizar automaticamente** ativado, um novo chega toda sexta-feira às 16:00. Veja [Relatórios: a sua semana e o seu caderno de laboratório](/guide/researchers#reports-your-week-and-your-lab-notebook).
- **Caderno de laboratório**: uma entrada datada para cada dia em que você trabalhou: o que foi tentado, encontrado e decidido, e o que está em aberto, com links para as sessões, commits, execuções e arquivos do dia. Ele abre em uma página própria com as entradas, as mais recentes primeiro, uma busca por palavras e por significado e o link de cada entrada para citar; com **Atualizar automaticamente** ativado, ele escreve a entrada do dia toda noite às 21:00.

Você não pode alterar um app pronto em si. Para ajustar um, abra-o e pressione **Torná-lo meu** (no celular, **Editar**): o construtor abre com uma cópia que se torna o seu próprio app quando você o criar.

### Explorar

**Explorar** é uma revista feita para você: artigos e notícias recentes sobre o que você faz e o que lhe interessa. Abra-a em **Explorar**, no canto superior direito da página inicial, ou na página Apps. Ela não tem formulário para preencher a cada vez: abre em uma página própria, na edição mais recente, e os agentes não a executam nas suas sessões.

- **Como ela escolhe**: ela lê o seu perfil, as notas que a memória guarda sobre você e os títulos das suas sessões mais recentes (deixando de fora as sessões com a memória desativada, as sessões que os agentes começam para partes do trabalho deles e as execuções de apps que ninguém acompanhou), e pede ao modelo auxiliar que escolha cerca de seis assuntos de que você gostaria agora: mais ou menos metade do seu trabalho e metade do resto da sua vida, nunca nada privado. Para cada um, ela busca em sites de notícias reportagens das últimas duas semanas e procura leituras longas (explicações, análises, ensaios), lê as melhores páginas lado a lado, resume cada uma e encontra a sua imagem. Um site que não permite programas é resumido a partir do que a busca mostrou dele. Uma edição leva um ou dois minutos.
- **Uma edição**: a data e a linha de capa, uma nota do editor, os assuntos (clique em um para mostrar só as suas matérias, **Tudo** para todas), a matéria de capa e, depois, uma seção para cada assunto. Cada matéria tem a sua imagem, **Notícias** ou **Leitura longa**, a fonte e a data, o que ela diz e por que está na sua edição. Clique na imagem ou no título para ler no site dela: a matéria passa a ficar marcada como **✓ Lido**, inclusive nas edições seguintes. **Aprofundar** começa um relatório de pesquisa aprofundada sobre ela. Abaixo da edição, **Anteriores** lista as edições que vieram antes, cada uma abrindo como era.
- **Atualizar**, no alto, cria uma nova edição agora. Enquanto ela trabalha, uma linha diz o que está fazendo, com **Acompanhar**, e a edição que você tem fica até a nova ficar pronta. Antes da primeira, **Fazer o primeiro** faz o mesmo.
- **Configurações**, os controles deslizantes ao lado de **Atualizar**: **Atualizar automaticamente** (desligado até você ativar) deixa uma nova edição pronta a cada manhã; abaixo dele, escolha os dias (**Todos os dias**, **Em dias úteis** ou **Uma vez por semana, em** um dia à sua escolha) e o horário (07:00, a menos que você mude). É uma [tarefa agendada](/guide/tasks), então Configurações → Tarefas agendadas também a lista; ao desativá-la, ela é removida. Abaixo, **Sessões recentes para ler** (quantos títulos das suas últimas sessões ela lê: 1.000, a menos que você mude, no máximo 1.000), **Cobrir também** (assuntos que sempre entram, um por linha) e **Deixar de fora** (assuntos ou sites a ignorar, separados por vírgulas). **Salvar** os mantém para todas as atualizações, inclusive as diárias.
- **Torná-lo meu** e **Desinstalar** ficam no menu **Mais** (⋯) dele.

Cada edição faz cerca de vinte perguntas rápidas ao modelo auxiliar e pesquisa na web uma dúzia de vezes; com o Claude Code conectado, as perguntas saem do seu plano.

### Instalar ou desinstalar um app pronto

Um app pronto que você não usa pode sair: abra-o, depois **Mais** (⋯) → **Desinstalar**, e confirme. Ele sai de **Seus apps**, os agentes deixam de executá-lo nas suas sessões e ele fica esperando em **Apps prontos para instalar**, na página Apps. As execuções dele permanecem.

Para tê-lo de volta, clique no cartão dele ali. Um cartão mostra o que o app é antes de qualquer mudança: o que ele faz, **O que ele pergunta a você** (as perguntas opcionais marcadas), **O que você recebe**, **Como funciona** em palavras simples e **Os agentes podem usá-lo**, com um interruptor. **Instalar** o coloca de volta entre os seus apps e o abre. A página dele diz “Você o desinstalou”, também com **Instalar**.

## Executar um app

1. Abra o app pela página Apps ou pela caixa de busca. A página dele diz no alto o que ele faz, com **Suas respostas** (o formulário) logo abaixo e, ao lado (abaixo, no celular), **O que você recebe** (as páginas em que a resposta dele abre, ou os campos de resposta), **Nas suas sessões** (se os agentes podem executá-lo por você: veja [Peça a um agente que execute um app por você](#have-an-agent-run-an-app-for-you)), **Últimas execuções** (cada uma abre a sua execução) e, para um app com etapas, **Como funciona**: as etapas em ordem, cada uma com a forma como é executada (**para cada** item, várias **de uma vez**, **lado a lado**), e **Como grafo**, que as abre no construtor.
2. Preencha o formulário. As perguntas marcadas com um **\*** vermelho são obrigatórias.
3. A linha abaixo do formulário diz quem executa, como “Claude Code · Sonnet · esforço alto · Automático”. Em um app pronto, **Variação** mostra os seletores (veja abaixo); no seu próprio app, mude com **Editar**.
4. Pressione **Executar**. A página da execução abre e acompanha o trabalho ao vivo.

Se algo estiver faltando, a página diz “Preencha antes as perguntas marcadas” e indica o problema sob cada pergunta (“Obrigatório”, “Um número, por favor”, “Escolher um arquivo”).

Um link pode preencher o formulário para você: o endereço de um app com `?in.`, o nome de uma pergunta, `=` e a resposta abre a página dele com essa resposta no formulário, pronta para mudar: nada é executado até você pressionar **Executar**. [Este](/apps/t/reproduce-paper?in.paper=2104.08663) abre Reproduzir um artigo com um artigo preenchido; mais respostas vêm com `&in.` (arquivos nunca). Os agentes dão esses links a você, e os botões nas visualizações também (o **Reproduzir** de um artigo na Lista de leitura). Um app que abre em uma página própria abre então no formulário.

### Os tipos de perguntas

- **Texto curto** e **Texto longo**: uma linha, ou uma caixa que cresce conforme você digita.
- **Número**: números simples; “$1,250.50” é lido como 1250,5.
- **Data**: um seletor de data.
- **Escolha**: algumas escolhas curtas aparecem como chips; mais de algumas aparecem como lista. Clique de novo em um chip escolhido para limpar uma pergunta opcional. Uma escolha que permite várias mostra chips que você marca, cada um marcado com um sinal de verificação; o que você marca é guardado uma escolha por linha.
- **Sim / não**: um interruptor.
- **Arquivo**: um arquivo para anexar.

Uma pergunta pode ter uma linha de ajuda abaixo, um exemplo de resposta na caixa e um valor já preenchido no início.

### Escolher o agente, o modelo, o esforço e o modo

Em um app pronto, **Variação** ao lado da linha abaixo do formulário mostra os seletores (e **Concluído** os recolhe):

- O programa: Claude Code, Codex, Custom (o agente próprio do Hydor para qualquer modelo) ou outro agente que você adicionou.
- **Modelo**: os modelos do agente.
- **Esforço**: o quanto o modelo pensa, para modelos que oferecem níveis (não para o Custom nem para os outros agentes adicionados).
- **Modo**: o que o agente pode fazer sem perguntar a você. Começa em **Automático**, porque ninguém acompanha uma execução. Um modo que pergunta antes de cada etapa deixa a execução esperando por você.

Este navegador lembra a sua última escolha para o próximo app pronto que você executar.

### Anexar arquivos

Uma pergunta de arquivo mostra **Escolher um arquivo**, ou você pode soltar um arquivo sobre ela (em um computador). Cada arquivo pode ter até 25 MB. O arquivo é salvo na pasta da execução e o agente recebe o caminho dele, então pode ler PDFs, documentos do Word, planilhas e outros arquivos como lê qualquer arquivo. O **×** ao lado de um arquivo escolhido o remove.

### Dar a ele as chaves de que precisa

Alguns apps funcionam com um serviço que exige uma chave: uma chave de API ou um token (um serviço de clima, um provedor de mapas, uma conta sua em algum lugar). Um app nomeia as chaves de que precisa, nunca os valores delas: você dá cada uma uma vez, e ela fica guardada no seu cofre ([Guardar chaves no cofre](/guide/connections#keep-keys-in-the-vault)), onde os agentes a usam pelo nome sem vê-la.

- Na página do app, **Uma chave de que ele precisa** (ou **Chaves de que ele precisa**) abaixo do formulário lista cada uma: o que ela é, o nome dela no cofre, uma linha sobre como obtê-la, uma caixa para colá-la e **Obter uma**, que abre a página onde você a consegue. Pressione **Executar**: a chave vai primeiro para o cofre e depois a execução começa. Uma chave que o cofre já tem aparece como **Salvo**, com os últimos caracteres e **Variação**; uma de que o app pode prescindir é marcada como **opcional**.
- Quando você instala um app a partir de um arquivo, o cartão dele também pede as chaves: dê-as então, ou na primeira execução.
- Quando um agente o executa por você em uma sessão, o cartão dele ali pede uma chave que falta; a chave vai direto para o cofre, nunca para a conversa.
- Uma chave de que só uma parte de um app precisa (a chave do Zotero da Lista de leitura, para **Sincronizar com o Zotero**) não é pedida no formulário: a página dele a pede na primeira vez que você usa essa parte.

Uma execução sem uma chave de que precisa não começa: no formulário dele, você é solicitado a fornecê-la (“Necessária para executar”); pela API, por um agendamento ou por linhas de um CSV, a execução é recusada e diz qual chave adicionar (na página dele, ou em **Apps → Apps conectados → Chaves** com esse nome). Quando uma chave que você salvou ainda não pode ir para um site para o qual o app a envia, a linha dela diz isso, com **Permitir**.

Alguns apps usam um modelo pelo OpenRouter (um que desenha imagens, por exemplo). Eles pedem a sua **Chave de API do OpenRouter** da mesma forma, com **Obter uma**: ela fica guardada em [Configurações → Modelos](/settings?s=models) em vez de no cofre, para os seus outros apps e o Custom também, e o modelo é adicionado aos seus modelos automaticamente na primeira execução do app. Um modelo que roda no Ollama, no vLLM ou em um endpoint é configurado à mão em Configurações → Modelos: até que seja, a execução é recusada e diz qual modelo e como.

### Onde uma execução trabalha

Cada execução recebe uma pasta nova só dela, dentro de uma pasta `hydor-apps` na sua pasta pessoal, com o nome do app e o horário. Um app pode indicar uma pasta em vez disso (veja [Quem faz](#who-does-it)); então toda execução trabalha ali.

A sessão de uma execução que você começa pelo formulário aparece na lista de sessões da Barra lateral como qualquer outra, com o nome do app e as suas primeiras respostas como título. As execuções pela API, por outros agentes, por uma página pública ou por linhas de um CSV são arquivadas, então ficam fora da lista e aparecem sob o app delas.

## Pedir a um agente que execute um app para você

Você não precisa abrir um app para usá-lo: peça o que ele faz em qualquer sessão (“Planeje uma viagem de 4 dias a Lisboa em maio para nós dois”) e o agente o executa ali mesmo.

1. O agente encontra o app que faz o que você pediu e preenche o que você disse: o lugar, os dias, quem vai. Quando sua mensagem pede claramente o que um dos seus apps faz, o agente recebe, junto com a mensagem, a indicação de qual app usar, e por isso o executa em vez de fazer o trabalho por conta própria. Com muitos apps, ele os procura pelo que fazem (por palavras e, quando a busca por significado está ativada, pelo significado) e escolhe entre os vinte que melhor se encaixam.
2. Antes de um app ser executado, o card dele aparece na conversa e pergunta primeiro, a menos que o app esteja na sua lista de apps que são executados sem perguntar (veja abaixo). O card diz “Um agente quer executar este app para você.” e mostra o ícone e o nome do app, o que ele faz, **O que ele faz** (os passos em ordem, até seis, depois “e mais 3”), **Da sua mensagem:** e o que ele tirou das suas palavras, **Última execução:** (quanto tempo levou a última execução e quanto custou) e **Sobre este app**, que abre a página do app. Quando o app precisa de algo que você não disse, as perguntas que sobraram também aparecem no card: uma chave de que ele precisa e que você ainda não forneceu é pedida ali mesmo e vai para o seu cofre, não para a conversa. Preencha as marcadas com um **\*** vermelho e, se não se importar, deixe as opcionais em branco. Uma pergunta que ele não conseguiu entender como você disse (“em maio” para uma data) mostra suas palavras logo abaixo. **Executar** executa o app uma vez; **Sempre executar** coloca o app na sua lista e o executa, de modo que o card dele não pergunta mais; **Não executar** fecha o card e não executa nada: o agente faz o trabalho de outro jeito ou pergunta a você. Enquanto o card aguarda, a sessão mostra **Precisa de você**, e a Caixa de entrada o lista. Um app da sua lista ainda mostra o card quando precisa de detalhes que a sua mensagem deixou de fora; nesse caso os botões são **Executar** e **Agora não**. A sessão de uma tarefa agendada executa apps sem perguntar: você configurou a tarefa, e não há ninguém ali para responder.
3. O card do app fica na conversa, abaixo da resposta do agente, e acompanha a execução: em que ponto ela está e os passos que vão passando, depois a resposta do app como ele a mostra (a tela dele, com suas páginas e botões; **Resposta simples** mostra o card e as tabelas). Uma pergunta feita por um dos passos (uma do tipo “Deixe-me…”) também aguarda ali. **Abrir** leva à página da execução, e o nome do app leva ao app.
4. Em seguida, o agente diz em uma ou duas linhas o que resultou; a resposta da própria execução fica na página da execução. Quando a resposta do app não corresponde ao que você pediu e o agente responde por conta própria, ele tira o card do app da conversa, para que você receba uma resposta, não duas; a execução continua nas execuções do app. Uma execução longa continua depois que o agente para de esperar: o card dela continua acompanhando, e, quando termina, o agente recebe a resposta (nenhuma mensagem sua aparece para isso) e responde, com o card se movendo para baixo dessa resposta. Uma resposta mais alta que a tela aparece a partir do topo, com as palavras do agente sobre ela acima; o resto está a uma rolagem de distância, e **Mais recente** vai até o fim.

As execuções desse tipo mostram **De uma sessão** nas execuções do app.

A página de cada app tem **Nas suas sessões** ao lado do formulário, com a chave **Os agentes podem usá-lo** (seus próprios apps também a têm em **API e compartilhamento**). Desative-a, e os agentes deixam de executar esse app; ative-a de novo quando quiser. Todo app começa com ela ativada. Blocos de construção e apps feitos para serem usados na própria página (com uma tela, ou uma visão do que guardam) informam isso ali, e os agentes não os executam. Quando um app seu faz o mesmo que um pronto, os agentes preferem o seu.

**Executar sem perguntar** em [Configurações → Apps](/settings?s=apps&find=Run%20without%20asking) lista os apps que os agentes executam sem perguntar antes: o **×** ao lado de um faz os agentes voltarem a perguntar, e **Adicionar um app** adiciona um antes de você ser consultado.

Cada sessão é informada dos seus apps: os poucos que você mais executa, com o que fazem, e os demais pelo nome, até 40 no total. Com mais do que isso, os agentes encontram os outros quando um pedido exige.

## Acompanhar uma execução e ler o resultado

A página da execução mostra o nome do app, as respostas que ele recebeu em uma linha (“Lisboa · 2026-11-20 · 3”), de onde veio (“Do formulário”, “Execução de teste”, “Da API”, “De outro agente”, “Página pública”, “Linha 3”) e quando começou. Depois que termina, **Executar de novo** no topo abre o formulário preenchido da mesma forma.

O card de status no topo diz em que ponto ela está:

- **Aguardando a vez**, **Iniciando…** ou **Em andamento** com o tempo até agora. Enquanto trabalha, você vê os últimos passos (“Pesquisou na web”, “Leu uma página”, “Atualizou o plano”) e o início do que o agente disse por último.
- **Precisa da sua aprovação na sessão** ou **Tem uma pergunta para você na sessão**: o agente está esperando por você. Abra a sessão para responder; as aprovações também aparecem na [Caixa de entrada](/inbox).
- **Concluída em** o tempo que levou, com o custo.
- **Interrompida** ou **Não terminou** com o motivo.

Abaixo vem o resultado. Um app com tela a mostra ali (veja [Sua tela](#its-view)); **Resposta simples**, no card de status, a mostra como o card simples e tabelas, e **Sua tela** volta. Sem tela:

- Campos de resposta curtos (texto, números, datas, links, sim ou não) ficam juntos em um card.
- Textos longos, listas e tabelas ganham, cada um, um card sob o seu título. O texto longo tem um botão **Copiar**; as tabelas têm **Copiar** e **CSV** (um download), e uma coluna de imagens as mostra pequenas (um clique abre uma grande).
- Imagens, vídeos, sons e arquivos: imagens em uma grade (um clique abre uma grande, e as setas passam pelas outras), vídeos e sons para reproduzir, outros arquivos para baixar. Um item em outro site (um vídeo no YouTube, uma página) abre lá.
- No celular, uma tabela larga demais para a tela aparece como um card para cada linha.

A resposta do próprio agente vem em seguida. Ela fica aberta, sob **Resposta**, quando o app não tem campos de resposta; caso contrário, fica recolhida sob **A resposta do agente**. **O que foi pedido** (recolhido) lista as respostas que a execução recebeu.

O agente é lembrado uma vez se terminar sem entregar os campos de resposta. Uma execução que termina sem resposta nem resultado conta como falha (“O agente terminou sem uma resposta”).

Embaixo, **Executar de novo com estas respostas** abre o formulário preenchido da mesma forma, pronto para alterar e executar. Os arquivos não são mantidos: escolha-os de novo.

**Abrir a sessão** (no celular, **Sessão**) no topo abre a conversa completa da execução.

### Sua tela

A tela de um app é feita para a sua resposta: páginas que a mostram em elementos próprios (cards, linhas do tempo, gráficos, listas para marcar) e botões que fazem coisas com ela.

- **Páginas**: as abas no topo; a primeira abre primeiro. Algumas páginas abrem com um clique (um dia de uma viagem, um produto) e têm um caminho de volta no topo.
- **Marcações e escolhas**: o que você marca (uma reserva feita, uma ação concluída) fica com a execução, em todos os dispositivos; filtros e seleções (um tema, um responsável) duram enquanto a página estiver aberta.
- **Botões que executam de novo**: **Tranquilo** ou **+ Mais um dia** em uma viagem, **Formal** em uma carta, uma caixa de novas perguntas sobre o mesmo documento. Cada um pergunta primeiro e depois inicia uma nova execução com as suas outras respostas como estavam (os arquivos também) e a abre.
- **Botões que iniciam outro app**: **Pesquisa** em uma notícia ou na região de uma viagem, **Aprofundar** em uma descoberta: cada um pergunta primeiro e depois inicia a execução desse app e a abre.
- **Copiar**: uma parte para colar em outro lugar (um e-mail, uma carta, as perguntas a fazer).
- **Mapas, gráficos, imagens e vídeos**: um mapa dos lugares da resposta (arraste e dê zoom; um lugar mostra o nome, e um clique nele pode abrir a página dele), um gráfico ou um gráfico 3D (aponte para uma barra ou um ponto para ler, dê zoom, gire um 3D), imagens que abrem em tamanho grande (um item sem imagem, ou cuja imagem não carrega, aparece sem ela, com o texto ocupando o espaço), e vídeos e sons para reproduzir, de um arquivo ou do YouTube ou Vimeo. Mapas, gráficos e os desenhos próprios de uma tela carregam suas bibliotecas (e os mapas, o próprio mapa, do OpenFreeMap, claro ou escuro conforme o app) da web, por isso precisam que este dispositivo esteja online.
- Em um app seu, uma tela também pode pedir uma alteração ao seu agente (em um app sem passos), executar um dos seus outros fluxos ou guardar um registro no que ele guarda.

Uma tela aparece na página da execução, no **Resultado** da sessão dela e na página pública do app, onde as páginas e as marcações funcionam, mas nada chega ao app (sem executar de novo, sem novas execuções, nada guardado).

## Pedir alterações no resultado

Uma execução não é definitiva. No pé da página da execução, uma caixa diz **Peça uma alteração no resultado…** (ou **Peça uma alteração…** quando o app não tem campos de resposta).

1. Digite o que alterar: “Deixe o dia 2 menos cheio”, “Adicione uma coluna com os horários de funcionamento”, “Mais curto e mais caloroso”.
2. Pressione Enter ou o botão de seta. Shift+Enter inicia uma nova linha. No celular, Enter inicia uma nova linha: toque na seta para enviar.

O acompanhamento vai para a sessão da execução. O agente faz o trabalho e entrega o resultado inteiro atualizado, que substitui o antigo na página. Cada acompanhamento aparece em **Acompanhamentos** com a resposta do agente, e **Resultado atualizado** quando o resultado mudou. O card de status passa então a dizer **Atualizado em …**, ou **Respondido em …** quando o acompanhamento só precisou de uma resposta (uma pergunta, um agradecimento).

Se você enviar um acompanhamento enquanto o agente ainda está trabalhando, ele aguarda com a nota “aguardando a vez” e vai para o agente quando o turno atual terminar. Um acompanhamento pode ter até 20.000 caracteres.

Execuções de uma página pública não aceitam acompanhamentos. Também não aceitam as de uma sessão que foi excluída, nem as de uma sessão aberta em outro programa (continue por lá).

## Trabalhar com a sessão de uma execução

Aberta pela Barra lateral, a sessão de uma execução mostra primeiro o **Resultado**, a mesma tela da página da execução, com um seletor para **Conversa** no topo. (**Abrir a sessão** na página da execução vai direto para a conversa.) A caixa de mensagem da sessão passa então a dizer **Peça uma alteração no resultado…**: tudo que você enviar ali é um acompanhamento, como na página da execução, e um rascunho que você começa em um lugar continua no outro.

Na visão **Resultado**, os cards de aprovação do agente aparecem sob o resultado, para que você possa aprovar ou recusar ali. Quando ele tem uma pergunta, um card diz **Ele tem uma pergunta para você.** com **Responder**, que muda para a conversa.

Na conversa, o momento em que o agente entrega o resultado aparece como **Resultado entregue**, com **Abrir o resultado**. Se o que ele entregou não coube nos campos de resposta, aparece **O resultado ainda não coube nos campos de resposta** e o que estava errado; o agente corrige e entrega de novo.

## Parar uma execução ou removê-la

- **Parar** (no topo enquanto uma execução está em andamento): uma execução esperando na fila termina na hora; uma em andamento é interrompida e mostra **Interrompida**.
- Depois que uma execução termina, o botão de lixeira (**Remover da lista**) pergunta “Remover esta execução?” e a tira da lista de execuções do app. A sessão permanece: exclua-a pelo menu da sessão se quiser se livrar dela também.

## Ver todas as execuções de um app

A página de um app seu tem quatro abas: **Executar**, **Execuções**, **Para cada linha** e **API e compartilhamento**. **Execuções** mostra quantas foram executadas hoje e lista todas, da mais recente para a mais antiga: as respostas que receberam, de onde vieram, há quanto tempo, o custo e o estado. **Mostrar execuções mais antigas** carrega mais, 50 por vez.

Os apps prontos não têm a aba Execuções: encontre as execuções deles em **Últimas execuções** na página Apps, ou como sessões na Barra lateral.

## Criar seu próprio app

Há quatro maneiras de começar:

- **Do zero**: **Novo app** → **Começar do zero** na página Apps, o cartão **Criar um app** abaixo dos seus apps, ou acesse [/apps/new](/apps/new).
- **Descrevendo o app**: na página Apps (ou na página Novo app), escreva o que ele deve fazer em **Descreva um app e um agente o cria** e pressione **Criar**. Uma sessão começa com o **Criador de apps** ([Agentes](/guide/agents)), que cria o app, o testa e o entrega a você.
- **A partir de um app pronto**: abra-o e pressione **Torná-lo meu** (no celular, **Editar**).
- **A partir de uma sessão que deu certo**: no menu da sessão (⋯), escolha **Mais** → **Salvar como app**. A página mostra "Criando o rascunho de um app a partir da sessão…" enquanto o modelo auxiliar transforma o primeiro pedido da sessão em um formulário, uma tarefa e campos de resposta, com base no que você pediu e no que o agente respondeu. As partes que mudariam de um uso para o outro viram perguntas. O rascunho mantém o programa, o modelo, o esforço, o modo e o agente da sessão. Quando o agente chamou ferramentas que um passo pode chamar sozinho (leu uma página, pesquisou na web), o rascunho também tem passos: essas chamadas como passos de ferramenta, com as respostas do formulário nos lugares certos, e depois um passo de modelo ou de agente para o restante. Os passos que não passam na verificação ficam de fora, e a tarefa de um só agente permanece; confira os passos e teste o app antes de salvar. Se o modelo auxiliar não conseguir fazer o rascunho, você recebe o pedido como estava, em uma única pergunta **Pedido**, com uma nota explicando o motivo; o modelo auxiliar é definido em [Configurações → Agentes → Modelos](/settings?s=models&find=Helper%20model).

Você também pode pedir a um agente, em qualquer sessão, que faça um app para você (veja [Pedir a um agente](#ask-an-agent)).

O criador abre com o título **Novo app**: o ícone, o nome e a descrição no alto (clique no nome ou na descrição para alterá-los) e, depois, as partes do app como abas, primeiro **O que ele faz**, depois **Forma**, **Resposta**, **Design**, **Exemplos** e **Configurações** (quem executa, as ferramentas, os limites, o que ele guarda, se é um bloco e, depois de salvo, a pasta e as versões, cada um recolhido em uma linha que diz como está definido até você abri-lo). Todas as abas têm a mesma largura; no computador, as abas ficam fixas no alto enquanto você rola a página e, no celular, aparecem em duas linhas. Em uma tela larga, **Forma** e **Resposta** têm ao lado uma **Prévia** que muda conforme você digita: o formulário como a página do app o pergunta e uma resposta fictícia como uma execução a mostra. Preencha as abas, teste com **Execução de teste** e pressione **Criar**. A página do app abre, pronta para executar.

### Nome, descrição e ícone

- Clique no ícone para escolher a cor (11 cores) e a imagem (32 ícones).
- **Nome** (obrigatório, até 60 caracteres), por exemplo "Planejador de viagem".
- Uma descrição: o que o app faz, em uma frase (até 300 caracteres).

O endereço do app vem do nome na hora em que você o cria ("Trip planner" vira `trip-planner`). Renomeá-lo depois mantém o endereço, então os links, as chaves e a ferramenta que outros agentes chamam continuam funcionando.

### O formulário

As perguntas que alguém responde antes de cada execução. **Adicionar uma pergunta** acrescenta uma linha com:

- A pergunta, como a pessoa a lê ("Para onde?").
- O tipo: **Texto curto**, **Texto longo**, **Número**, **Data**, **Escolha**, **Sim / não** ou **Arquivo**.
- **Obrigatório**: a execução não pode começar sem ela.
- Para **Escolha**: as opções, uma por linha (se ficar vazio, oferece Sim e Não) e **Dá para escolher vários**, que permite marcar mais de uma opção (a resposta então tem uma opção por linha).
- **Texto de ajuda, exemplo, padrão…** abre mais três caixas: **Ajuda abaixo da pergunta**, **Um exemplo de resposta** (mostrado em cinza na caixa vazia) e **Preenchido no início**.

O menu **⋯** de uma pergunta tem **Mover para cima**, **Mover para baixo** e **Remover**. Abaixo de cada pergunta você vê o marcador dela, como `{{destination}}`: é assim que a tarefa se refere à resposta e o nome que os programas usam para ela. O marcador de uma pergunta nova acompanha o texto da pergunta até a tarefa o usar. Um app pode ter até 30 perguntas.

### A tarefa

O que o agente deve fazer, com as respostas inseridas (até 30.000 caracteres; obrigatório). Escreva como você mesmo pediria ao agente e diga como trabalhar, não só o que fazer.

- **O que ele faz** mostra o trabalho do app como **Uma tarefa** (esta caixa), uma **Lista** de passos ou um **Gráfico** deles; veja [Apps com passos](#apps-with-steps).
- Os botões **Inserir** colocam o marcador de uma pergunta onde está o cursor. As perguntas que a tarefa ainda não usa ficam destacadas. **hoje**, **agora** e **dia da semana** inserem a data, a data e a hora e o dia da semana do lugar onde você está.
- `{{question}}` é substituído pela resposta dela.
- O texto entre `{{#question}}` e `{{/question}}` só permanece quando a pergunta foi respondida (e não com Não). O texto entre `{{^question}}` e `{{/question}}` só permanece quando ela ficou vazia.
- **Prévia**, no fim da linha de botões **Inserir**, mostra a tarefa com o padrão de cada pergunta, ou o nome dela entre colchetes, preenchido. **Editar** volta.

Os avisos abaixo da caixa dizem quando um marcador não corresponde a nenhuma pergunta (ele permanece como está escrito) e quando uma pergunta obrigatória nunca é usada na tarefa.

### A resposta

Os campos que o agente preenche quando termina. Eles aparecem como um cartão ou uma tabela, e os programas os recebem de volta em JSON. Sem campos de resposta, a resposta do agente é a resposta.

**Adicionar um campo de resposta** acrescenta uma linha com:

- Um título ("Recomendação").
- O tipo: **Texto**, **Texto longo** (texto formatado), **Número**, **Sim / não**, **Data**, **Link**, **Lista**, **Tabela** ou **Imagens, vídeos ou arquivos**.
- **Obrigatório**: o agente deve preenchê-lo.
- **O que vai aqui, para o agente (opcional)**: uma dica para o agente.
- Para uma **Tabela**: as **Colunas**, cada uma com um nome e um tipo (**Texto**, **Número**, **Sim / não**, **Data**, **Link** ou **Imagem**). **Adicionar uma coluna** acrescenta uma; uma tabela mantém pelo menos uma.

O menu **⋯** de um campo de resposta tem **Mover para cima**, **Mover para baixo** e **Remover**.

Um campo **Imagens, vídeos ou arquivos** (e uma coluna **Imagem**) recebe o que o agente encontrou ou fez: um endereço na web ou um arquivo neste computador (uma foto na sua pasta Imagens, um gráfico que ele desenhou, uma gravação), cada um com uma legenda. O Hydor guarda uma cópia de um arquivo deste computador e de uma imagem da web (até 15 MB), para que apareça onde quer que a resposta apareça; os vídeos da web continuam sendo links. As execuções de uma página pública só podem apontar para a web.

O Hydor verifica o que o agente entrega: números devem ser números, datas devem ser datas reais, links devem ser endereços web completos. Quando algo não se encaixa, o agente é avisado do que corrigir. Um app pode ter até 30 campos de resposta, e uma tabela, até 16 colunas. Um campo de resposta novo recebe, para os programas, o nome derivado do título quando você salva; depois disso o nome permanece, então os programas que o leem continuam funcionando.

### Exemplos

Os exemplos são respostas para testar o app e verificações do que uma execução devolve, para que você possa testar uma mudança e perceber quando o app piora. **Adicionar um exemplo** acrescenta um: dê um nome a ele, se quiser, preencha as respostas e use **Adicionar uma verificação** para cada coisa que uma boa execução entrega. Uma verificação é uma regra sobre os valores da execução, como a regra de um passo: `{{answer.unread}} > 0`, `{{find.count}} = 3`, `{{reply}} contains Lisbon`. O botão **{ }** insere um valor: as respostas do formulário, o que os passos entregaram, **A resposta dele** (`{{answer.field}}`) e **A resposta dele**.

**Testá-los** executa todos os exemplos como uma execução de teste, com o app como está na tela, salvo ou não; o botão de frasco ao lado de um exemplo testa só aquele. Cada um mostra como foi o último teste: **Passou**, quantas verificações falharam ou **Não terminou**, com o tempo que levou e o custo; um exemplo aberto diz o que cada verificação que falhou viu ("answer.unread is 2").

### Quem executa

A seção diz: "As execuções seguem sem ninguém acompanhar, então escolha um modo que não pare para perguntar (Automático, ou um que permita edições)."

- O programa e os seletores de **Modelo**, **Esforço** e **Modo**, como em um app pronto. O modo começa em **Automático**.
- **Agente**: **Nenhum**, ou um agente com o qual cada execução trabalha (Pesquisador, Redator… ou um dos seus), com as instruções, o nível e o orçamento dele. Veja [Agentes](/guide/agents).
- **Pasta**: **Uma pasta nova para cada execução** por padrão. **Escolha um** faz cada execução trabalhar em uma pasta que você escolher (ela deve existir quando uma execução começar); **Usar um novo a cada vez** volta ao padrão. Com uma pasta escolhida, os arquivos anexados ficam em uma pasta separada de envios, em vez de misturados aos seus.

### Ferramentas

O que as execuções podem usar das ferramentas do próprio Hydor: pesquisa na web, o navegador, páginas, memória e as demais. **Todos** vem ativado no início. Desative-o para ver uma lista com o nome de cada ferramenta e o que ela faz, e marque as que as execuções podem usar. As ferramentas de arquivos e de comandos do próprio agente seguem o modo dele, não esta lista.

### Chaves de que ele precisa

**Chaves de que ele precisa** (em **Configurações**) lista as chaves que as execuções usam, pelos nomes delas no seu cofre: cada uma com o que ela é, **Para onde ela pode ir (hosts)**, **Onde obter uma**, uma linha sobre como, e opções para **Ele pode executar sem ela** e **Comandos neste computador a usam**. **Adicionar uma chave de que ele precisa** acrescenta uma. As execuções recebem o nome de cada chave e como usá-la; quem instala o app informa os valores (veja [Dar a ele as chaves de que precisa](#give-it-the-keys-it-needs)), que nunca fazem parte do app nem do arquivo dele.

### Limites

- **Execuções por dia (de qualquer lugar)**: o máximo de execuções que este app pode fazer em um dia, contando as execuções pelo formulário, pela API, por outros agentes, por linhas de um CSV e pela página pública, e as conversas na tela dele, a partir da meia-noite. Depois disso, a execução é recusada com "Este app foi executado … vezes hoje, o limite dele". Vazio: sem limite.
- **Gasto máximo de uma execução (US$)**: o limite de gastos de cada execução. A execução para quando o atinge. Vazio: sem limite. Veja [Uso, limites e custos](/guide/usage).

### Teste antes de salvar

**Execução de teste** (no celular, o botão de frasco) abre uma janela com o formulário como está na tela, salvo ou não. Preencha-o e pressione **Executar o teste**: a execução acontece na janela. **Abrir a sessão** mostra a conversa dela, e **Testar de novo** volta ao formulário. As execuções de teste de um app salvo aparecem na aba **Execuções** como "Execução de teste". **Manter como exemplo** guarda as respostas de uma execução de teste concluída como um novo exemplo, para receber verificações em **Exemplos**.

## Alterar, copiar ou excluir um app

Na página do seu app:

- **Editar** abre o criador, com o título **Editar** seguido do nome do app. Pressione **Salvar** ao terminar; até então, **Ainda não salvo** aparece ao lado. As alterações valem para as próximas execuções; as execuções em andamento mantêm a versão com que começaram.
- **Mais** (⋯) → **Duplicar** cria uma cópia com " copy" no fim do nome, em um endereço próprio. A tela dele vem junto como uma página à parte; a página pública dela começa fechada, e as chaves e os registros que ele guarda não são copiados.
- **Mais** (⋯) → **Excluir** pergunta "Excluir …?": as execuções, as chaves e a página pública dele vão junto, e as execuções em andamento são interrompidas. As sessões que ele iniciou permanecem. Um app que você instalou de um arquivo diz **Desinstalar**: ele é excluído por completo, do mesmo modo, e para tê-lo de novo você instala o arquivo dele outra vez.

O **Mais** (⋯) de um app pronto tem **Desinstalar**, que o mantém em **Apps prontos para instalar** (veja [Instalar ou desinstalar um app pronto](#install-or-uninstall-a-ready-made-app)).

### Versões

Cada salvamento que muda o que um app faz é uma versão: **Versões**, perto do fim do **Editar** dele, as lista da mais nova para a mais antiga, cada uma com o que mudou (ou o que o agente disse que fez), quem a salvou (**Você**, **Um agente**, **Pasta do app** ou **Instalado**) e quando, e, nas versões em que os exemplos dele foram testados como salvos, quantos passaram e o que uma execução levou e custou, para você ver se uma mudança o deixou melhor. **Restaurar** coloca uma versão anterior na tela, e **Salvar** a torna a versão mais nova de novo. Mover os passos dele pelo gráfico e as telas dele (que têm versões próprias) não cria uma nova versão. Cada execução mantém a versão que executou.

### Trabalhar nele como arquivos

**Pasta do app**, perto do fim do **Editar** de um app salvo, coloca o app em uma pasta de arquivos (**Criar a pasta do app**; por padrão em Hydor/Apps na sua pasta pessoal), para alterá-lo em qualquer editor ou com um agente de programação aberto nessa pasta. app.json é o app (o que ele pergunta, faz e devolve), instructions/ guarda as instruções de cada passo em Markdown, steps/ cada passo de código como a função que ele executa, screens/ as telas dele, e graph.json onde os passos dele ficam; .naget/ tem um esquema do app.json e os tipos de um passo de código, para que o seu editor os complete e verifique. Cada alteração que você salva lá chega aqui como uma versão de **Pasta do app**, e o app aberto no **Editar** muda junto (ou diz **Ele foi alterado na pasta enquanto você o alterava aqui.**); um erro lá é informado aqui e não altera nada. Um salvamento aqui escreve a pasta de novo, e **Parar de manter sincronizado** deixa os arquivos onde estão. Os dados dele ficam aqui, não na pasta. No app para computador, um botão ao lado do caminho da pasta a mostra no gerenciador de arquivos do sistema (**Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta**).

No computador em que o Hydor executa, a linha de comando faz o mesmo, na pasta dele: `node dist/server/cli.js app new "Reading list"` cria um app e a pasta dele, `app folder <app>` cria a de um app, `app dev <app>` testa os exemplos dele a cada alteração que você salva ali, `app try <app>` o testa uma vez (e falha quando uma verificação falha), e `app export` e `app import` o levam para outro computador como um único arquivo, dizendo o que ele fará lá antes de ser instalado. `app help` lista os comandos; eles usam uma chave própria, que **Configurações → Máquinas** lista como “This computer’s command line”.

## Chamar um app a partir dos seus próprios programas

Scripts, atalhos e outros programas podem executar seu app com uma chave e receber a resposta de volta. Abra seu app → **API e compartilhamento** → **API**.

1. Pressione **Nova chave**, diga o que vai usá-la (para distinguir as chaves) e pressione **Criar a chave**.
2. Copie a chave imediatamente: "Sua nova chave. Copie agora: ela não será mostrada de novo."

Uma chave abre somente este app, nada mais no Hydor. A lista mostra o nome de cada chave, seus primeiros e últimos caracteres e quando ela foi usada pela última vez. **Revogar** encerra uma chave: os programas que a usam param de funcionar na hora.

A aba mostra um exemplo de chamada com o endereço do seu app e exemplos de respostas. Para um app seu chamado Trip planner, ela fica mais ou menos assim:

```bash
curl -X POST https://your-address/api/apps/trip-planner/run \
  -H "Authorization: Bearer napp_…" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"destination": "Lisbon", "start": "2026-11-20", "days": 4}, "wait": 300}'
```

- Envie as respostas do formulário em `inputs`, pelos nomes dos marcadores. Para uma pergunta de arquivo, informe o caminho de um arquivo neste computador, ou envie o arquivo em `files` com seu `name` e o conteúdo em base64 como `data`.
- `wait` é quantos segundos esperar pela resposta, no máximo 900.
- A resposta traz o `status` da execução, `result` (os campos da resposta), `reply` (as últimas palavras do agente) e `session` (um link para ela), além de `error` e `costUsd` quando houver.
- Uma execução ainda em andamento pode ser consultada em `GET …/run/<run>?wait=60`.
- Atrás de um proxy que corta requisições longas (o da Cloudflare para em 100 segundos), espere menos e pergunte de novo.

Uma chave pode fazer até 30 chamadas por minuto, e o limite diário do app também vale. Mais sobre a API do próprio Hydor em [A API do app](/guide/api).

## Deixar outros agentes executarem um app como ferramenta

Claude Code, Cursor ou outro agente conectado ao servidor MCP do próprio Hydor (um modo padrão de os agentes acessarem ferramentas) pode executar seu app como uma ferramenta. Em **API e compartilhamento** → **Outros agentes**, a chave **Oferecer a outros agentes** o oferece como uma ferramenta com o nome do endereço dele, como `app_trip_planner`. Ela vem ativada em apps novos. O agente preenche o formulário como entrada da ferramenta e espera a resposta; uma execução longa volta com seu id, que o agente consulta com uma segunda ferramenta, `app_run_status`. O endereço e os tokens de que esses agentes precisam estão em [Configurações → App → Connect other agents](/settings?s=connect).

## Abrir uma página pública que qualquer pessoa possa usar

Uma página pública permite que qualquer pessoa com o link preencha o formulário e veja a resposta, sem entrar e sem acesso a mais nada daqui. Ela fica em **API e compartilhamento** → **Página pública**.

As execuções públicas sempre usam Custom, então primeiro adicione um modelo para o Custom em [Configurações → Agents → Models](/settings?s=models). Depois:

1. Ative a chave. O estado muda de **Fechada** para **Aberto a qualquer pessoa com o link**, e o primeiro modelo do Custom é escolhido para ela (mude abaixo).
2. Copie o link (o endereço do Hydor seguido de `/a/` e do endereço do app) ou use **Abrir**.
3. Defina o resto:
   - **Modelo (um dos do Custom)**: o modelo que as execuções públicas usam.
   - **Pesquisar e ler a web**: ativado no início. Desativado, o agente responde com o que sabe.
   - **Execuções por visitante, por hora** (5 no início), **Execuções públicas por dia** (50) e **Máximo que podem gastar por dia** (US$ 2). Uma linha mostra as execuções públicas e os gastos de hoje.

O que os visitantes recebem: o nome, o ícone, a descrição e o formulário do app, a execução deles em andamento e as execuções anteriores deles (as últimas 10, distinguidas por um cookie no navegador). Eles nunca veem a tarefa, as configurações, as execuções de outras pessoas, a sessão nem o custo, e os erros chegam a eles em palavras gerais. Os arquivos anexados podem ter até 3 MB, e as respostas deles são mantidas mais curtas que as suas. O rodapé da página lembra que as respostas podem estar erradas.

O que as execuções públicas podem fazer: Custom com o modelo escolhido, sem comandos e sem arquivos, com memória e conexões desativadas, em uma pasta temporária que é excluída quando a execução termina. Elas só podem entregar os campos da resposta e, quando você permite, pesquisar na web e ler páginas públicas. Um arquivo anexado chega ao agente como texto. O gasto de cada execução é limitado pelo que resta do orçamento do dia.

Para manter tudo sob controle: no máximo 3 execuções públicas de um mesmo app ao mesmo tempo (8 em todos os apps), um visitante espera a última execução terminar antes de começar outra, e um mesmo endereço faz no máximo 60 execuções por hora em todas as páginas. As execuções públicas contam para o limite diário do app e não aceitam perguntas de acompanhamento. Desative a chave para fechar a página; os visitantes então veem "This page is not open".

## Executar um app uma vez para cada linha de um CSV

Execute seu app em uma lista inteira de uma vez: uma execução por linha de uma planilha salva como CSV. Abra seu app → **Para cada linha**. (Um app pronto precisa antes de **Torná-lo meu**.)

1. **Escolher um arquivo CSV**, ou solte-o na caixa. A primeira linha dá os nomes das colunas. Vírgulas, ponto e vírgula e tabulações funcionam, até 500 linhas.
2. Em **Qual coluna responde a cada pergunta**, cada pergunta recebe uma coluna (o app adivinha pelo nome) ou **O mesmo para todas as linhas…** com um único valor. As perguntas obrigatórias precisam de uma coluna ou de um valor.
3. Confira **As primeiras linhas, como o formulário vai recebê-las**.
4. Leia a estimativa de custo (veja [Quanto custa uma execução](#what-a-run-costs)) e escolha quantas executam **Ao mesmo tempo**: 1, 2, 3, 4 ou 6 (2 no início).
5. Pressione **Executar** e o número de linhas.

Uma pergunta de arquivo recebe o conteúdo da célula como texto: um caminho neste computador ou um endereço da web. Uma linha cujos valores não servem para o formulário falha na hora, com o motivo na tabela, para você saber o que corrigir. Se as linhas levarem o app além do limite diário, o Hydor recusa antes de começar.

Enquanto as linhas são executadas, uma tabela vai sendo preenchida: o número da linha, as duas primeiras perguntas, o estado, até quatro campos de resposta (ou a resposta) e um link para cada execução. Acima dela: quantas terminaram, quantas não terminaram, o custo até agora e quantas executam ao mesmo tempo, com uma barra de progresso.

- **Parar** encerra as linhas que ainda esperam e interrompe as que estão em execução.
- **CSV** baixa os resultados: as respostas de cada linha, todos os campos de resposta, o estado, qualquer erro, o custo e um link para a sessão. As células que uma planilha trataria como fórmula começam com um apóstrofo.
- O **×** fecha a tabela.

As linhas continuam se o Hydor for reiniciado. **Tabelas anteriores** lista suas execuções de linhas passadas (as últimas 30) com o progresso e se estão **Executando**, **Interrompida** ou **Concluídas**; clique em uma para abrir a tabela de novo.

## Executar um app sozinho

Um app pode ser executado sozinho: em um horário do dia, de tempos em tempos, uma vez, quando outro serviço chama um webhook ou quando um observador vê uma mudança (um feed, uma página, um valor, uma pasta). Cada vez, ele é executado com as respostas que você definiu, como se viesse do formulário, e a execução se junta às outras em **Execuções**.

- **Para configurar**: abra o app, depois **Execuções** → **Quando ele executa sozinho** → **Adicionar um agendamento**. Dê um nome, preencha as respostas que cada execução recebe e escolha quando ela executa, como em qualquer [tarefa agendada](/guide/tasks#when-it-runs). **Execução de teste** tenta uma vez sem salvar.
- **Respostas vindas de fora**: as respostas de um webhook podem usar partes da chamada (`{{body.title}}`, `{{headers.name}}`, `{{query.name}}`), e as de um observador, `{{change}}`, o que ele viu mudar. A execução as recebe como dados, nunca como instruções.
- Cada execução notifica você com o que ela devolveu, ou com o motivo de não ter terminado, e a notificação abre a execução. A linha dela em **Quando ele executa sozinho** a pausa, a executa agora, mostra seu histórico ou a remove; a tarefa também está em [Configurações → Tarefas agendadas](/settings?s=tasks).
- **Um app que abre em sua própria página** ([Explore](#explore), o Weekly progress report, o Lab notebook) o tem mais à mão: em suas **Configurações**, os controles deslizantes no topo da página, **Atualizar automaticamente** o executa com as respostas guardadas ali, **Todos os dias**, **Em dias úteis** ou **Uma vez por semana** em um dia que você escolher, em um horário que você escolher. Um app pronto pode começar em dias próprios: o Weekly progress report às sextas, às 16:00, o Lab notebook toda noite, às 21:00.

## Quanto custa uma execução

O custo de cada execução aparece na página dela quando termina, e na lista **Execuções**. É o valor informado pelo agente, ou o uso dele calculado a preços de API (para o Custom, estimado pelo que ele leu e escreveu); modelos executados neste computador custam US$ 0.

Antes de executar um CSV, o Hydor estima o lote inteiro: "Cerca de US$ … para … linhas", a partir do custo mediano das últimas execuções concluídas do app (até 30). Com um limite por execução, ele soma o máximo que as linhas poderiam gastar. Quando o app nunca concluiu uma execução, diz "Execute o app uma vez para ver quanto custa uma execução."

Para manter os custos sob controle, defina **Gasto máximo de uma execução (US$)** e **Execuções por dia (de qualquer lugar)** em **Limites** do app e, para uma página pública, o orçamento diário dela. Veja [Uso, limites e custos](/guide/usage) para o que todas as sessões gastam.

## Apps com passos

Um app também pode fazer o trabalho em **passos**: um agente faz uma parte, uma pergunta rápida a um modelo resolve algo, uma ferramenta busca uma página, uma regra decide o caminho a seguir, os mesmos passos percorrem cada item de uma lista. Cada passo entrega o que encontrou ao próximo, e a execução devolve os campos de resposta no final. Os passos deixam um app mais barato, mais rápido e mais seguro do que um único agente fazendo tudo, e permitem que ele faça mais: guardar dados entre as execuções, chamar seus outros apps, executar partes em paralelo.

Você cria um app com passos em **Editar**, ou pedindo a um agente. Em **Editar**, **O que ele faz** mostra o trabalho como **Uma tarefa**, uma **Lista** de passos ou um **Gráfico** deles (no computador, onde abre no gráfico até você escolher a lista). Para um app que é uma tarefa só, **Lista** ou **Gráfico** transforma a tarefa em um primeiro passo, um agente que a executa, e **Uma tarefa** volta um agente solitário ao que era. **Adicionar uma etapa** escolhe um tipo; um passo abre suas configurações quando você clica nele, e o menu **⋯** dele o move, o copia ou o remove. Os passos dentro de um **Decidir**, um **Repetir** ou um **Ao mesmo tempo** aparecem abaixo dele, cada lista com o seu próprio **Adicionar uma etapa**. O botão **{ }** de uma caixa de texto (**Colocar um valor**) coloca um valor: uma resposta do formulário, o que um passo anterior deu (`{{find.records}}`) ou um valor integrado: **Hoje** (`{{today}}`), **Agora** (`{{now}}`, a data e a hora), **O dia da semana** (`{{weekday}}`) e **O fuso horário** (`{{timezone}}`), todos de onde você está, e **O que iniciou a execução** (`{{run.source}}`: web para o formulário dele, api, task, screen, batch para uma linha…) e **A execução** (`{{run.id}}`). **De onde vem a resposta dele** diz qual valor preenche cada campo de resposta (se ficar vazio: o último passo que deu um com o nome dele). O que precisa de correção aparece sob o passo conforme você avança, e **Execução de teste** testa o que está na tela. O **Gráfico** os mostra como nós e fios: o cinza indica a ordem (os caminhos de um Decidir e os ramos lado a lado, os passos de um Repetir em uma moldura, o que executa quando um passo falha em vermelho), e os coloridos indicam qual passo usa quais valores.

Você também pode construir no gráfico (no computador; o celular mantém a lista). Ele mostra a execução inteira: **O formulário** no alto, com **Integrado** ao lado quando passos usam os valores integrados, os passos abaixo deles e **A resposta** no final; fios tracejados vão do formulário e dos valores integrados até os passos que os usam, e dos passos que dão a resposta até ela. Um clique em **O formulário** ou em **A resposta** abre a aba correspondente. Um clique no nó de um passo abre as configurações dele ao lado do gráfico, com **Mais** (⋯) para movê-lo, copiá-lo ou removê-lo; o **+** em um fio coloca ali um novo passo, e **Adicionar uma etapa** começa um caminho vazio. Arraste o ponto à direita de um nó até outro passo para colocar um dos valores dele nesse passo (as instruções, a entrada de uma ferramenta, uma regra…), ou solte-o em um espaço vazio para criar um novo passo que o use. Arraste os nós para posicioná-los (os passos dentro de um Decidir ou de um Repetir se movem junto), clique duas vezes no fio de um valor para dobrá-lo ali (arraste a dobra, ou clique duas vezes nela para tirá-la), e **Organizar: dispor tudo de novo** os organiza sozinho; com Shift pressionado, clique em vários para **Agrupá-las, com uma nota**. Arraste o fundo para se deslocar, use Ctrl e a roda para dar zoom, e **Tela cheia** dá a ele a janela inteira.

**Experimentar**, entre os botões do gráfico, executa o app como está na tela como uma execução de teste, ali mesmo no gráfico: cada passo se acende ao executar e ao terminar, e os fios que chegam aos passos executados se acendem com eles; aponte para o fio de um valor para ver o que ele carregou, e as configurações de um passo começam com como ele se saiu **No último teste**. Nas configurações de um passo, **Pausar um teste antes dela** interrompe um teste ali até você pressionar **Continuar** (ou **Uma etapa**, que pausa de novo antes da seguinte), e o floco de neve (**Congelar**) faz um teste dar o que o passo deu no último, de modo que os passos depois de um passo caro podem ser testados várias vezes sem custo.

**Recolher em um bloco**, entre os botões do gráfico quando há passos selecionados (clique com Shift em vários que se seguem), transforma-os em um app próprio, um bloco, que um passo **Chamar um app** executa no lugar deles: o que eles usavam de fora (as respostas do formulário, os valores dos passos anteriores) vira o formulário dele, que a chamada fornece, e o que os passos seguintes usavam deles vira a resposta dele. Outros apps também podem chamar o bloco, e uma mudança nele é uma mudança para todos. Os passos que guardam dados ficam no app, já que um bloco guarda dados próprios, e listas e tabelas chegam a um bloco como texto.

Ou peça a um agente: “Crie um app que leia cada link que eu der, resuma com um modelo rápido e guarde em uma lista de leitura.” O agente escreve os passos, confere e os testa, e depois você pode alterá-los em **Editar**. Os agentes têm ferramentas próprias para isso, em qualquer sessão: leem seus apps, salvam um (conferido antes, com os erros explicados em palavras; um app inteiro, algumas partes dele ou um passo), testam os exemplos dele e esperam o resultado, dão uma tela a ele, e leem os registros que ele guarda ou adicionam alguns (alterá-los ou removê-los cabe a você, na tela dele, ou é pedido a você antes); antes de entregar um app, dizem quanto custa uma execução.

Na conversa, cada app que o agente salva aparece como um cartão e, em uma tela larga, o app abre ao lado da conversa conforme é construído (**Abrir ao lado** no cartão o abre de novo, **Abrir a página do app** abre a página própria dele). O que você altera e salva ali chega ao agente com a sua próxima mensagem, e ele constrói sobre a sua versão: um agente que salva depois de você ter alterado lê primeiro a sua versão. Quando o agente salva enquanto você tem alterações suas na tela, uma nota oferece **Carregar** ou **Manter o meu**. No menu **⋯** dos passos ali, **Perguntar ao agente sobre isso** inicia uma mensagem sobre esse passo na caixa de mensagem da conversa.

Os tipos de passos:

- **Perguntar a um agente**: uma sessão trabalha na sua parte com as ferramentas dela e entrega o que encontrou. Cada um tem uma sessão própria, que você pode abrir na página da execução.
- **Perguntar a um modelo**: uma resposta rápida de um modelo, sem ferramentas: separar, extrair, resumir. Custa pouco, e nada com um modelo neste computador.
- **Usar uma ferramenta**: uma das ferramentas do próprio Hydor com entradas definidas: pesquisar na web, ler uma página, encontrar uma imagem (e um vídeo) de cada item de uma lista, chamar um endereço com uma chave salva, ler um documento, criar uma imagem, enviar uma notificação, ler o que o Hydor sabe sobre você, colocar as coisas em ordem do que mais importa para você, ou guardar o que ele criou (slides, um documento, uma planilha, um documento LaTeX ou uma página, nos arquivos do projeto que ele indica). Para artigos: encontrar e ler um (a partir de uma cópia aberta, com o registro e o BibTeX dele), manter uma lista de leitura e sincronizá-la com o Zotero. As imagens encontradas assim vão na coluna de imagens de uma resposta, e os vídeos (links do YouTube ou do Vimeo) são reproduzidos no elemento de vídeo de uma visualização.
- **Decidir**: um caminho ou outro, por uma regra (“o preço é menor que 100”) ou por uma pergunta em palavras que o modelo auxiliar responde.
- **Repetir**: seus passos uma vez para cada item de uma lista (alguns de cada vez, se quiser), ou de novo até que algo se cumpra.
- **Ao mesmo tempo**: ramos que executam lado a lado; o fluxo continua quando todos terminam.
- **Chamar um app**: outro dos seus apps, como um passo. Abaixo dos tipos, **Adicionar uma etapa** oferece blocos: apps feitos para serem passos de outros, os seus (os marcados com **Um bloco**, sob os campos de resposta de um app, e os que Recolher em um bloco cria) e os prontos (**Resumir uma página**, **Traduzir**, **Responder com a web**, **Separar por tipos** e **Extrair os fatos**, cada um tornado seu ao entrar). Um bloco entra como uma chamada com o formulário dele para preencher, e as perguntas dele que o formulário do próprio app tem com o mesmo nome já vêm preenchidas; uma mudança em um bloco é uma mudança para todos os apps que o chamam.
- **Guardar dados**: adicionar, encontrar, alterar ou remover os registros que o app guarda (veja abaixo).
- **Perguntar a uma pessoa**: a execução espera pela sua resposta, sim ou não ou um formulário curto: um aviso abre a execução, onde um cartão pergunta, e a Caixa de entrada a lista. Ela espera uma semana, a menos que você defina outro limite, e depois falha. As perguntas de **Escolha** do formulário dela podem oferecer o que a execução encontrou: escreva sozinho um valor de um passo anterior como uma escolha, como `{{find.items}}`, e quando o passo perguntar, o cartão oferece cada item dessa lista (ou cada linha de um texto) como uma escolha, de modo que uma execução pode perguntar quais das coisas que encontrou investigar. Com **Dá para escolher vários**, você marca quantos quiser, e `{{step.field}}` são os marcados, um por linha. Outras palavras na pergunta, no texto de ajuda e nas escolhas também são preenchidas com valores, e uma escolha que fica sem nada a oferecer vira uma caixa de texto simples.
- **Executar código**: um programa seu, em JavaScript, TypeScript ou Python, recebe os valores que você dá e devolve os valores do passo (**O que ele dá** os nomeia, para os passos seguintes). Executa em um sandbox: sem rede e sem nenhum arquivo deste computador além dos pacotes que o app instala. Ele só se comunica com o exterior por meio de `ctx`, cada chamada sendo um passo da execução: `ctx.model` pergunta a um modelo, `ctx.agent` a um agente, `ctx.tool` usa uma das ferramentas do app, `ctx.ask` espera pela sua resposta, `ctx.data` guarda registros e `ctx.app` executa outro app. Assim, um fluxo inteiro pode ser um único programa, com ifs e laços próprios; as chamadas dele aparecem na página da execução como passos e, quando a execução recomeça após uma reinicialização, o programa executa de novo e as chamadas que fez antes dão o que deram então, sem executar de novo. Um arquivo de app com passos de código avisa isso no cartão de instalação dele.
- **Calcular um valor**: um valor a partir de outro, na hora e sem custo: o primeiro ou o último item de uma lista, quantos, uma soma, média, o menor ou o maior (de um campo de cada), um campo de cada, os itens unidos em texto, sem repetições, ordenados por um campo, como número, ou uma data alguns dias depois. Ele dá `{{id.value}}` e aparece no gráfico como uma pequena pílula.

Um passo pode executar só quando uma regra se cumpre, e dizer o que acontece quando ele falha: outros passos no lugar, seguir sem ele ou (para um passo de ferramenta, modelo, código, dados ou app) **Um agente faz o trabalho**: um agente recebe o que foi dado ao passo e por que ele falhou, entrega os valores que os passos seguintes usam, e a execução continua. A página da execução então diz **Um agente fez o trabalho** ao lado do passo, com o motivo da falha.

Enquanto uma execução trabalha, a página dela lista os passos conforme avançam. Quando termina, **Passos** mostra cada um com como se saiu, quanto tempo levou e quanto custou; o botão de sessão abre a conversa de um passo de agente. Uma execução com passos não aceita acompanhamentos: altere as respostas e execute de novo.

Quando uma execução com passos termina, cada um dos seus passos tem **Executar de novo a partir daqui** (↺): uma nova execução com as mesmas respostas, em que os passos anteriores a esse dão o que deram desta vez (marcados como **Da última execução**, sem custo) e o restante executa como o app está agora. Uma **Execução de teste** em **Editar** também tem isso, com o que está na tela: altere um passo posterior e teste de novo sem executar os primeiros.

### Torná-lo firme

Sobre os passos em **Editar**, as últimas execuções de um app dizem duas coisas. Um passo que falhou e teve um agente fazendo o trabalho dele informa em quantas execuções isso aconteceu e por que falhou da última vez; **Pedir a um agente para corrigir** pede ao agente ao lado (quando o app está aberto ao lado de uma conversa) ou inicia uma sessão com o **Criador de apps**. Um passo de agente que fez o mesmo em cada uma das últimas execuções (leu a página que recebeu e depois respondeu, por exemplo) oferece **Torná-lo firme**: passos fixos que poderiam fazer isso por menos, um passo de ferramenta para cada chamada que o agente fez, com os valores com que ele as fez, e depois um passo de modelo com as instruções dele e o que as ferramentas deram. **Testá-los nos exemplos dele** (ou **Testá-los**, com as respostas dessas execuções, quando ele não tem exemplos) os executa primeiro e mostra o que uma execução leva e custa com o agente dele e com os passos; **Usar estes passos** os coloca no lugar dele na tela, e **Salvar** os mantém. Os passos de ferramenta que ele cria fazem um agente fazer o trabalho deles se falharem, de modo que uma execução que funcionava antes continua funcionando.

Os agentes que criam um app veem o mesmo, com os passos para testar.

### O que um app guarda

Um app pode guardar dados entre as execuções: listas de registros, como os links de uma lista de leitura ou os clientes de um pequeno CRM. Os passos dele os adicionam, encontram e alteram, e os agentes dele também, com uma ferramenta própria. Uma lista pode dizer o que cada registro contém (um título, uma nota, uma data…), e o app então confere o que entra. Em **Editar**, **O que ele guarda** as lista: **Adicionar uma lista**, depois dê um nome a ela e, se quiser, os campos que os registros dela contêm (sem campos, qualquer registro entra).

Apps prontos também guardam registros: a [Lista de leitura](/guide/researchers#reading-list) guarda seus artigos, que a página dela mostra e altera, e que outros apps leem (a Matriz de literatura usa “minha lista de leitura”).

Passos e agentes também podem pesquisar os registros por uma pergunta, do jeito que suas bases de conhecimento são pesquisadas: pelas palavras deles e, quando a [Busca por significado](/settings?s=memory&find=Search%20by%20meaning) está ativada, pelo que significam, os melhores primeiro. Um passo também pode pesquisar suas bases de conhecimento e suas notas de memória, com as ferramentas knowledge_search e recall.

O que um app guarda fica com ele até você excluir o app. As execuções a partir da página pública dele nunca chegam a isso. Apps prontos também guardam registros: a Bancada de anotação os conjuntos de textos com seus rótulos, o Caderno de laboratório as entradas dele; os registros deles permanecem quando você desinstala o app e voltam com ele.

### Um app que lembra

Um app pode lembrar entre as execuções: os agentes dele guardam o que as execuções seguintes devem saber (uma preferência que você mostrou, uma fonte que funciona, um erro a evitar) em uma memória própria do app, e cada execução começa com ela. [Configurações → Memória](/settings?s=memory) a lista como um projeto, com o nome do app. Ative com **Lembra entre as execuções**, em **O que ele guarda** no **Editar** dele.

### O que um app precisa neste computador

Um app pode precisar de coisas neste computador: pacotes Node ou Python que os agentes dele usam e comandos como ffmpeg. Os pacotes são instalados na pasta própria do app, nunca para o computador inteiro, assim que você instala ou altera o app, e a primeira execução espera por eles. Na página do app, uma linha informa enquanto eles são instalados ou quando não foi possível, com **Mostrar a saída** e **Instalar de novo**. Um comando que ele usa e que este computador não tem também é nomeado ali: instale esse você mesmo.

## Projetar a aparência

A visualização de um app é como a resposta dele aparece: páginas (abas e páginas que um clique abre), elementos feitos para a resposta (um cartão de dia, um produto com seus pontos fortes e fracos) e eventos, que dizem o que um clique faz. Sem uma visualização, a resposta aparece como um cartão simples e tabelas.

Em **Editar** de um app, a aba **Design** mostra a visualização dele com a resposta da última execução; **Resposta de exemplo** mostra uma no formato dele, e o que corrigir nela aparece listado embaixo. Na prévia, um clique leva a páginas e marca itens; o que chega ao app (perguntar ao agente dele, executá-lo de novo) funciona na página de uma execução.

- **Peça a um agente para projetá-lo** (depois que o app for salvo): uma sessão começa como o **Criador de apps** com uma mensagem sobre ele ou, com o app aberto ao lado de uma conversa, a mensagem vai para esse agente. Ele escreve a visualização, testa com uma execução e corrige o que não se encaixa.
- **Começar pela resposta**: uma página com um bloco para cada campo da resposta, para você alterar a partir dela.
- **Peça a um agente para alterá-lo**: como acima, para uma visualização que ele já tem.
- **Alterar como código**: a visualização em JSON, com as páginas, os elementos (HTML com valores como `{{result.days}}`, e CSS) e os eventos, como o tópico de API do guia os descreve ([Apps: views](/guide/api#apps-views)); a prévia acompanha o que você digita.
- **Remover a visualização**: a resposta volta a aparecer como um cartão simples depois que você salvar.

Os eventos de uma visualização podem levar a uma página (com o item clicado), marcar um item ou definir um filtro (guardado com a execução quando assim for indicado), copiar, abrir um endereço, pedir uma alteração ao agente da execução (um app sem etapas), executar um de seus outros fluxos, executá-lo de novo com algumas respostas alteradas, iniciar outro app, e adicionar, alterar ou remover um registro que ele guarda. As páginas marcadas como página própria do app aparecem ali no lugar do formulário dele, com o que ele guarda e a última execução. Uma página assim tem **Atualizar** no topo, que executa o app agora, e **Configurações** ao lado: as respostas do formulário dele, guardadas para essas execuções, e **Atualizar automaticamente** (todos os dias, em dias úteis ou uma vez por semana, no horário que você escolher), como em [Explore](#explore). Um app cuja página é um lugar para trabalhar com o que ele guarda (a Reading list) não tem nenhum dos dois: a página mostra os registros de imediato, e os botões dela executam o formulário. Uma visualização faz parte do app: tem versões junto com ele, viaja no arquivo dele, e seus elementos são arquivos próprios na pasta dele (ui/).

Além dos elementos próprios, uma visualização tem elementos integrados: texto, listas para marcar, tabelas e gráficos de barras, e estes para mídia:

- **Imagens**: uma, ou várias lado a lado, cada uma com sua legenda.
- **Vídeos**: um arquivo, reproduzido na visualização, ou um link do YouTube ou do Vimeo, que mostra a imagem de capa e reproduz sobre a página quando você clica.
- **Sons**: uma gravação ou uma música para tocar.
- **Mapas**: os lugares da resposta, a partir da latitude e da longitude, numerados e ligados em ordem quando a visualização indica.
- **Gráficos**: de linhas, de barras (também empilhadas), de área, de dispersão, de pizza, histograma, boxplot e mapa de calor, e em 3D pontos, linhas e superfícies, desenhados com Plotly.

Uma visualização também pode ter **widgets**: elementos desenhados por um script próprio (uma cena 3D, um jogo, um gráfico de uma biblioteca da sua escolha), que carregam da web (jsDelivr) as bibliotecas que citam, cada uma em uma versão exata. Tudo em uma visualização é desenhado no mesmo sandbox das páginas: não consegue acessar este computador, sua conta nem seus outros apps, apenas fazer o que os eventos dele permitem.

**Arquivos próprios**, na aba **Design**, guarda imagens, vídeos, sons e dados que vêm com o app: **Adicionar arquivos** os adiciona (até 100 MB cada, 150 MB no total), uma imagem abre em tamanho grande, e o botão de copiar dá o nome pelo qual uma visualização a mostra (`asset:tram.jpg`, em um bloco de imagem, vídeo ou som, ou no `src` de um modelo). Eles viajam no arquivo dele. A prévia preenche a visualização com a última execução, ou com uma resposta de exemplo cujas imagens e vídeos são arquivos próprios dele.

## Dar uma tela a um app

Um app pode ter uma tela própria: uma página no lugar do formulário, que o executa e mostra o que ele guarda. Uma lista de leitura pode mostrar seus links em uma tabela que você pesquisa e organiza, um pequeno CRM seus clientes com um botão que redige um acompanhamento, um rastreador a contagem do que registrou. A tela funciona ao vivo: o que você envia no formulário executa o app, a resposta aparece quando está pronta, e as tabelas mudam conforme as etapas e os agentes alteram os registros.

- **Para dar uma tela a ele**: abra o app e vá em **Mais** (⋯) → **Dar uma tela a ele**. A tela é feita das partes dele: o formulário, a resposta, uma tabela para cada lista que ele guarda (com uma conversa com o agente dele embaixo) e as execuções anteriores. A página dele passa então a abrir na tela.
- **Para alterá-la**: **Mais** (⋯) → **Editar a tela** a abre no editor de páginas, onde você a altera como qualquer página ([Alterar uma página por conta própria](/guide/library#change-a-page-yourself)): mova e refaça o estilo das partes dela, ou peça ao agente. **Adicionar** tem uma aba **App** com as partes do próprio app: **O formulário dele**, **A resposta dele**, **Suas execuções**, **Uma conversa com o agente dela**, um formulário e um botão para cada um dos outros fluxos dele, e uma tabela e uma contagem para cada lista que ele guarda.
- **Ou peça a um agente**: "Dê à minha Lista de leitura uma tela com os links não lidos no topo e um botão que gera o resumo desta semana." Os agentes escrevem telas com as mesmas partes e podem dar mais fluxos a um app para os botões de uma tela iniciarem.

**Converse com o agente dele.** A conversa de uma tela (**Perguntar ao agente dele**, em uma tela feita das partes dele) é um chat com o agente do próprio app, com o modelo e as ferramentas dele: escreva uma mensagem e pressione **Enviar** (ou Enter), e ele responde ali. Ele pode encontrar e alterar o que o app guarda, e executar os fluxos do app por você e esperar o que eles entregam, então “adicione Piranesi, já li” ou “quais destes eu ainda não li?” funcionam direto. Quando você volta, a última conversa está lá; **Nova conversa** começa outra, e **Conversas anteriores** abre uma que você teve antes. As conversas são guardadas com o app, separadas das execuções dele.

Uma tela é uma página própria do app: não está entre os arquivos de nenhum projeto, some quando você exclui o app e viaja no arquivo dele. Para executar o app a partir do formulário com respostas anteriores, use **Executar de novo com estas respostas** na página de uma execução.

## Compartilhar um app como arquivo

Um app pode viajar como um único arquivo, para guardar ou instalar em outro Hydor.

- **Para baixar um**: abra o app e vá em **Mais** (⋯) → **Baixar como arquivo**, ou use **Mais** (⋯) no cartão dele na página Apps. Os apps prontos são baixados da mesma forma. O arquivo (`.hydor-app`) contém tudo o que ele faz e de que precisa, seus arquivos próprios (imagens, vídeos, dados) e os apps que as etapas dele chamam. Quando ele guarda dados, **Incluir os registros que ele guarda** os inclui também. A pasta dele, as chaves e a página pública ficam aqui: as chaves de que ele precisa viajam apenas pelo nome e são pedidas onde ele for instalado.
- **Para instalar um**: pressione **Novo app** na página Apps, depois **Instalar a partir de um arquivo**, e escolha um arquivo `.hydor-app`, `.zip` ou `.json` (até 160 MB); ou solte o arquivo na página Apps. Antes de qualquer coisa ser criada, um cartão mostra o que ele é, em palavras simples: o nome e o que faz, **O que ele pergunta a você** (as perguntas opcionais aparecem marcadas), **O que você recebe**, **Como funciona**, **Os agentes podem usá-lo**, com um interruptor para impedir que os agentes o executem, e **Uma chave de que ele precisa** (ou **Chaves de que ele precisa**), para informar agora ou na primeira execução. **O que ele usa aqui** (recolhido, e aberto automaticamente quando algo precisa de atenção) lista quem faz o trabalho, as etapas, os arquivos próprios, os scripts da visualização e as bibliotecas que eles carregam, as telas, as ferramentas que ele pode usar, os modelos que ele usa, os apps que vêm com ele, o que ele instala e os comandos que usa, o que ele guarda, se ele tem memória e os limites dele. Cada modelo aparece como está configurado aqui, aqui com outro nome, pelo OpenRouter (adicionado aos seus modelos na primeira execução, com a chave pedida junto com as chaves do app) ou não configurado aqui: nesses casos, escolha um dos seus modelos para substituí-lo ou deixe o padrão do agente. Pressione **Instalar**.

Algumas coisas mudam na entrada, e o cartão avisa quais: uma pasta em que ele trabalhava em outro lugar fica de fora (cada execução recebe uma própria), um modo que permite todas as etapas sem perguntar passa a ser **Automático**, e um agente que este computador não tem é descartado. Um app que vem junto e é igual a um que você já tem é reutilizado; caso contrário, é instalado ao lado dos seus. A página pública dele começa fechada, e ele não tem chaves de API.

O arquivo de um app pronto diz qual app ele é: onde você desinstalou esse app, instalar o arquivo o traz de volta (**Instalado de novo**); onde você o tem, o arquivo é instalado como uma cópia sua, para alterar como quiser.

## Peça a um agente

Os agentes do Hydor podem criar e executar apps para você pela API dele, com a sua aprovação em um cartão. Por exemplo:

- "Crie um app chamado Relatório semanal que pergunta por um projeto e um período, e responde com um resumo e uma tabela do que mudou."
- "Transforme esta sessão em um app que eu possa executar de novo."
- "Fixe o Planejador de viagens e o meu Relatório semanal no topo da página Apps, com o relatório primeiro."
- "Quais apps eu usei recentemente e como foram as últimas execuções deles?"
- "Execute de novo o meu Comparador de preços com as mesmas respostas da última vez."
- "Planeje uma viagem de 4 dias a Lisboa em maio para nós dois." (o Planejador de viagens é executado aqui e pergunta o que precisa)
- "Como está o tempo em Zermatt esta semana? E o que posso cozinhar com ovos, espinafre e batatas?" (a Previsão do tempo e o Cozinhe com o que tem são executados aqui, cada um mostrando a resposta na visualização dele)
- "Faça um quiz comigo sobre o Império Romano, dez perguntas difíceis."
- "Encontre parques para cães e cafés perto da Alexanderplatz, em Berlim." (o app Explorar um lugar é executado aqui, perguntando antes, a menos que esteja na sua lista)
- "Execute o meu Planejador de viagens sem me perguntar toda vez." (o agente o coloca em **Executar sem perguntar**, como **Sempre executar** no cartão dele faz)
- "Execute o app Planejador de viagens para Lisboa, quatro dias a partir de 20 de novembro, e me mostre o resultado quando terminar."
- "Execute o meu app Pesquisa de empresas para cada uma destas 20 empresas e me entregue a tabela."
- "Execute o meu Planejador de viagens toda sexta-feira às 18:00 para Lisboa, três dias."
- "Abra uma página pública para o meu app Carta de apresentação, com no máximo US$ 1 por dia."
- "Pare todas as execuções do meu app Comparador de preços e revogue as chaves de API dele."
- "Desinstale o app Resumo semanal de notícias e impeça os agentes de executarem o meu app Comparador de preços nas sessões."
- "Crie um app com etapas que leia cada link que eu enviar, resuma com um modelo rápido e guarde em uma lista de leitura."
- "Adicione uma etapa ao meu app Monitor de concorrentes que me avise apenas quando algo mudar."
- "No meu app Explorador de compras, depois que ele encontrar os produtos, pergunte quais eu quero comparar, como opções que eu possa marcar, e então compare só esses."
- "Instale o app de reading-list.hydor-app da minha pasta Downloads."
- "Crie um app que resuma o tempo de uma cidade a partir do OpenWeather. Ele precisa da minha chave de API do OpenWeather."
- "Adicione à visualização do meu app Passeio pela cidade um mapa das paradas e um gráfico do custo de cada dia."
- "Adicione ao meu app Passeio pela cidade as fotos de ~/Pictures/Lisbon e mostre-as na primeira página dele."
- "Dê à visualização do meu app Relatório semanal um gráfico 3D dos números, como um widget com three.js."
- "Dê à minha Lista de leitura uma tela com os links não lidos no topo e um botão que gera o resumo desta semana."
- "Projete uma visualização para o meu app Relatório semanal: uma página com o resumo e os números no topo, e uma página que mostre cada mudança como um cartão que eu possa marcar."
- "Na visualização do meu app Comparador de preços, adicione um botão em cada loja que o execute de novo só para aquela loja."
- "Deixe o meu app Resumo de links mais robusto e teste primeiro com os exemplos dele."
- "Faça a etapa Buscar o título do meu app Resumo de links passar o trabalho a um agente quando falhar."
- "Faça o Explorar criar uma nova edição toda manhã às 6:30, sempre com Fórmula 1."
