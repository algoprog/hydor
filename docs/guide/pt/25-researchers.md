# Pesquisa: artigos, escrita e laboratório

O Hydor ajuda no trabalho em torno da pesquisa: acompanhar sua área, ler e organizar artigos, conferir um artigo antes de ele ser enviado, responder a revisões e apresentar seu trabalho, além dos experimentos e relatórios do seu laboratório. A maior parte vem como apps prontos em **Pesquisa**, **Escrita**, **Laboratório** e **Trabalho** na página [Apps](/apps), que os agentes também executam para você quando você pede; as verificações de um artigo ficam no [editor de LaTeX](/guide/library), e suas execuções de treinamento ficam em [Sistema → Experimentos](/guide/experiments). Vai revisar a submissão de outra pessoa? Use uma [sessão confidencial](/guide/sessions#keep-a-session-confidential).

![Os apps de pesquisa na página Apps](images/researchers.webp)

## Acompanhe sua área

Seis apps prontos ajudam você a acompanhar sua área: eles estão na página Apps em **Pesquisa** (abra [Apps](/apps) e escolha o chip **Pesquisa**). Cinco deles abrem em uma página própria e podem se atualizar sozinhos todos os dias: **Radar de artigos**, **Alertas de citações**, **Monitor de novos modelos**, **Radar de prazos** e **Trabalhos relacionados vivos**. O sexto, **Buscador de lacunas**, é executado quando você pede, com um formulário, e os agentes podem executá-lo para você em qualquer sessão.

Eles leem serviços abertos, com delicadeza: arXiv, OpenAlex, Semantic Scholar, Hugging Face e as listas de prazos ccfddl e ai-deadlines no GitHub. Nenhum precisa de chave, mas duas ajudam: uma **Chave da API do OpenAlex** (gratuita: sem ela, o OpenAlex é consultado no máximo duas vezes por atualização, a partir de um orçamento pequeno que todos na sua rede compartilham) e uma **Chave da API do Semantic Scholar** (gratuita, mediante solicitação: sem ela, o Semantic Scholar costuma ficar ocupado, e o OpenAlex responde no lugar, sem as frases que citam você). Informe-as nas configurações do app, os controles deslizantes no topo da página dele, em **Chaves de que ele precisa**: elas vão para o seu cofre, e só para esses serviços.

Na página de cada app, **Atualizar** no topo gera uma nova edição agora, e os controles deslizantes guardam as configurações dele: **Atualizar todos os dias** (desligado até você ligar), o horário e as perguntas dele. Abaixo da página, **Anteriores** lista as edições passadas, e cada uma abre como estava. Antes da primeira, a página pergunta apenas o que o app não consegue dispensar (seu nome como autor, seus locais de publicação); **Fazer o primeiro** guarda suas respostas como as configurações dele. Quando ele passa a atualizar todos os dias, Configurações → Tarefas agendadas também o lista (veja [Tarefas agendadas](/guide/tasks)).

### Radar de artigos

O [Radar de artigos](/apps/t/paper-radar) traz toda manhã os artigos novos da sua área, ordenados de acordo com o que você faz, cada um com uma linha sobre o que ele faz e por que importa para você.

- **O que ele lê**: os artigos novos do arXiv nas categorias que você acompanha (algumas centenas no máximo, enviados nos últimos três dias, mais depois de uma pausa), os que tratam dos seus assuntos em qualquer área e os das pessoas que você segue; também os do OpenAlex sobre seus assuntos (periódicos e anais). Um artigo que uma atualização anterior já viu nunca volta.
- **Como ele ordena**: de acordo com seus projetos (nomes, descrições e últimas sessões), seus assuntos e seu perfil. Por significado, com o modelo de embeddings no seu computador, quando a [Busca por significado](/settings?s=memory&find=Search%20by%20meaning) está ligada; caso contrário, pelas palavras. Os artigos que você salva puxam a ordenação para perto deles; os que você deixa de lado a afastam. Os artigos de pessoas que você segue vêm sempre primeiro.
- **A página**: **Hoje**, os artigos do dia sob o projeto ou assunto a que cada um mais se adapta (escolha um no topo, ou **Todos**). Cada cartão mostra onde e quando saiu, o título (um link para ele), os autores, o que ele faz em uma frase e por que é para você, com **☆ Salvar**, **Citar** (copia o BibTeX dele), **PDF**, **Aprofundar** (um [relatório de Deep research](/apps/t/deep-research) sobre ele, de alguns minutos) e **Não é para mim** (ele se recolhe, com **Desfazer**). **Artigos salvos** lista o que você salvou, do mais novo ao mais antigo, com **Copiar tudo como BibTeX** e, para cada um, **Citar**, **Adicionar à lista de leitura**, **Aprofundar** e **Remover**.
- **Configurações dele**: **Campos a acompanhar** (categorias do arXiv, por nome ou código: Information Retrieval ou cs.IR, Computation and Language ou cs.CL; um campo que não é categoria é tratado como assunto), **Assuntos** (um por linha), **Pessoas a seguir** (uma por linha, como os artigos delas imprimem os nomes) e **Quantos artigos** (15, a menos que você mude, entre 5 e 40). Se ficarem vazios, ele deduz campos e assuntos a partir do seu perfil e dos seus projetos.

Uma atualização faz ao modelo auxiliar uma ou duas perguntas rápidas (o que cada artigo significa para você) e leva um ou dois minutos.

### Alertas de citações

Os [Alertas de citações](/apps/t/citation-alerts) dizem quem citou seus artigos desde a última vez que ele olhou, com a frase que cita você e se ela se baseia no seu trabalho, o compara ou o contesta.

- **A página**: **Nova**, as novas citações por artigo seu: como cada uma cita você (**se baseia em**, **compara com**, **contesta** ou **menciona**, escolhido a partir da frase pelo modelo auxiliar; mostre um tipo no topo), a frase com a menção ao seu artigo destacada, uma palavra sobre o que ela diz do seu trabalho e o artigo que cita (um link), os autores, onde e quando, com **Copiar a frase**. **Seus artigos** lista seus artigos com as citações e quantas são novas.
- **Como ele as encontra**: ele encontra você no Semantic Scholar (ou no OpenAlex, quando aquele está ocupado), pega seus artigos que têm citações (os mais citados e os mais recentes, trinta por atualização) e pergunta quem citou cada um recentemente. As citações que ele já viu são guardadas, então cada atualização mostra só o que é novo; na primeira vez, só as do último mês contam como novas. Um artigo citante sem frase é um que o serviço não leu por completo.
- **Configurações dele**: **Você, como autor** (seu nome como seus artigos o imprimem, ou seu id do Semantic Scholar, só dígitos, ou o id do OpenAlex, A e dígitos) e **Apenas estes artigos** (títulos, DOIs ou ids do arXiv, um por linha; vazio: todos os seus). Uma vez por semana basta para a maioria das pessoas: ligue **Atualizar todos os dias**, ou peça a um agente que o torne semanal.

### Monitor de novos modelos

O [Monitor de novos modelos](/apps/t/new-model-watch) vigia o Hugging Face em busca de novos modelos de um tipo (rerankers, embedders e outros), confere-os com os seus limites e executa a sua própria avaliação em cada um, para que você só saiba dos que superam o seu melhor.

- **O que ele observa**: os modelos mais novos do tipo (com as palavras que você der nos nomes), quando já têm a idade que você definiu (7 dias, a menos que você mude) e downloads suficientes até lá; os oito mais baixados por atualização (os demais esperam a próxima). Cópias de um modelo em outro formato (GGUF, ONNX, quantizado) ficam de fora, a menos que suas palavras as peçam. Ele lê a página e o cartão de cada modelo para saber a licença, o tamanho e o que ele é, e deixa de fora os que suas licenças ou seu tamanho excluem.
- **Sua avaliação**: informe um comando com `{model}` no lugar do nome do modelo (`python eval.py --model {model}`), a pasta dele, a pontuação que ele imprime (`ndcg@10`), se maior ou menor é melhor, e o seu melhor resultado até agora. Cada modelo novo que vale a pena testar é então executado em [Experimentos](/system/experiments) (grupo “New-model watch”, uma GPU cada, na fila dele), que avisa você quando um deles supera o seu melhor; a próxima atualização lê a pontuação de cada execução. Sem um comando, ele só lista os modelos novos.
- **A página**: **Modelos**, cada um com a situação em que está (**novo**, **avaliando**, **avaliado**, **supera** o seu melhor, **não executado**, **ignorado**, **novo demais**), o que o cartão dele diz, o tamanho, a licença, os downloads e as curtidas, e a pontuação; os que superam o seu melhor vêm primeiro. **Sua avaliação** diz o que é executado, com **Abrir Experimentos**.

### Radar de prazos

O [Radar de prazos](/apps/t/deadline-radar) coloca os prazos dos seus locais de publicação em uma única linha do tempo no seu fuso horário, lembra você antes de cada um e traz links para a chamada de trabalhos, o limite de páginas e o modelo.

- **De onde vêm as datas**: duas listas abertas no GitHub, a do ccfddl e a do ai-deadlines, combinadas. Cada prazo é convertido do fuso horário que a chamada indica (a maioria diz AoE, Anywhere on Earth, que é UTC−12) para o seu, que o app tira do seu navegador.
- **A página**: **Linha do tempo**, cada prazo à frente com o dia e a hora onde você está, o que deve ser entregue, como a chamada informa, onde é a conferência, links de **Chamada de trabalhos** e **Modelo** e o limite de páginas, e quanto tempo falta (no momento em que você olha); o próximo prazo de resumo ou de artigo de cada local de publicação se destaca. Mostre um local no topo; **Copiar os prazos** os copia como linhas; **Mostrar os passados** abre os dos últimos meses. **Conferências** mostra cada local por inteiro, com a classificação, o próximo prazo e o site, e os nomes que nenhuma das listas conhece.
- **Lembretes**: cada atualização envia uma notificação sobre os prazos nos dias que você definiu (14, 3 e 1, a menos que você mude), cada lembrete uma só vez, todos em uma única notificação. Ligue **Atualizar todos os dias** para que eles cheguem a tempo.
- **Configurações dele**: **Seus locais de publicação** (como você os diz, separados por vírgulas: SIGIR, ACL, EMNLP, NeurIPS, The Web Conference, KDD…) e **Lembrar-me** (dias antes, separados por vírgulas; vazio: sem lembretes). Para achar o limite de páginas e o modelo de cada chamada, ele pesquisa a chamada uma vez por conferência e a lê (o modelo auxiliar anota os dados).

### Trabalhos relacionados vivos

Os [Trabalhos relacionados vivos](/apps/t/living-related-work) mantêm uma página para cada um dos seus assuntos, que cresce conforme os artigos aparecem: cada artigo resumido, com sua relação explicada, agrupado em temas, e os novos marcados.

- **Como cresce**: na primeira vez, ele pega os melhores artigos do arXiv sobre cada assunto e os mais recentes do último ano, e os mais citados do OpenAlex; depois disso, o que saiu desde então. Os artigos que citam seus artigos de partida entram em todos os assuntos. O modelo auxiliar mantém os que uma seção de trabalhos relacionados deveria citar, resume cada um em uma frase, diz como ele se relaciona (com o assunto e com seus artigos de partida) e o coloca em um tema.
- **A página**: **Trabalhos relacionados**, cada assunto com seus artigos tema por tema, do mais novo ao mais antigo, e os que a última atualização acrescentou marcados como **Novo** (escolha um assunto no topo). Cada artigo tem a chave de citação, **BibTeX** (copia a entrada dele) e **Sem relação** (ele sai do assunto para sempre). **Redigir os trabalhos relacionados** faz um agente escrever a seção do assunto em LaTeX, um parágrafo por tema, com chaves `\cite` dos seus artigos: ela aparece com **Copiar o LaTeX** e **Copiar o .bib** quando fica pronta (alguns minutos; continua se você sair). **Exportar BibTeX** reúne todas as entradas do assunto para copiar. **Novo desta vez** lista o que a última atualização acrescentou.
- **Configurações dele**: **Assuntos** (um por linha), **Artigos de partida** (títulos, ids do arXiv ou DOIs, um por linha) e **Máximo de artigos por tópico** (80, a menos que você mude).

### Buscador de lacunas

O [Buscador de lacunas](/apps/t/gap-finder) cruza seus artigos com os deste mês em uma área para gerar ideias de projeto, verifica cada uma quanto a trabalhos anteriores e a dimensiona para a capacidade de computação que você tem. Ele é executado a partir do formulário, ou um agente o executa para você em uma sessão.

- **O que você informa**: **Seus artigos** (seu nome como autor, que traz seus artigos mais recentes e mais citados, ou os títulos ou ids do arXiv deles, um por linha), **A área** (em palavras, ou uma categoria do arXiv: conversational search, cs.IR), **A capacidade de computação que você tem** (uma GPU de 24 GB, a menos que você diga outra coisa) e **Quantas ideias** (5).
- **O que ele faz**: ele lê seus artigos e os do último mês na área, ordena os do mês em relação aos seus e pede ao modelo auxiliar que proponha ideias que os cruzem. Para cada ideia, pesquisa trabalhos anteriores no arXiv e no Semantic Scholar e pede ao modelo auxiliar que a julgue: **novo**, **parcialmente concluído** ou **já feito**, com o artigo mais próximo; o primeiro experimento a executar, o que ele exige da sua capacidade de computação e se ela **cabe**, está **no limite** ou é **grande demais**.
- **A visualização**: **Ideias de pesquisa**, as novas primeiro (mostre um veredito no topo), cada uma com o que ela cruza, o porquê do veredito, o trabalho mais próximo (um link), o primeiro experimento e seu custo, e **Planejar** (abre o app Research sprint com a ideia como pergunta), **Aprofundar** (um relatório de deep research sobre o trabalho próximo a ela) e **Copiar**. **O que ele cruzou** lista os seus artigos e os do mês que ele usou.

## Ler e organizar artigos

Três apps prontos, em **Pesquisa** na [página de Apps](/apps), ajudam com os artigos que você lê: a **Lista de leitura** guarda os artigos, a **Matriz de literatura** compara vários em uma planilha e **Reproduzir um artigo** confere se os números de um artigo se sustentam executando o código dele. Abra os apps por lá ou peça o que eles fazem em qualquer sessão (“Adicione 1706.03762 à minha lista de leitura”), e o agente os executa para você ([Peça a um agente que execute um app para você](/guide/apps#have-an-agent-run-an-app-for-you)).

Eles encontram um artigo de qualquer forma que você o informe: um DOI, um id do arXiv, um link (do arXiv, de um DOI, do ACL Anthology, do OpenReview, da página de uma editora ou de um PDF), o título ou um PDF neste computador. Eles leem os artigos apenas de cópias abertas (arXiv, as cópias abertas que o OpenAlex conhece, a própria página do artigo), nunca além de um acesso pago: um artigo sem cópia aberta é lido a partir do resumo, e o app avisa.

### Lista de leitura

[A Lista de leitura](/apps/t/reading-list) abre direto nos seus artigos, e não em um formulário: é um lugar para trabalhar.

- **Adicionar um artigo**: **+ Adicionar**, depois **O artigo** (um DOI, um id do arXiv, um link ou o título) e, se quiser, o **Projeto**, as **Tags** (separadas por vírgulas) e o **Status**. **Adicionar** busca o artigo e o guarda com seus autores, ano, veículo de publicação, resumo, links para ele e para um PDF aberto, e a entrada BibTeX dele. Um artigo que você já tem não é adicionado de novo (o mesmo DOI, id do arXiv ou título): o que faltava é preenchido, e suas notas, tags e status continuam como estavam. Um artigo que nada encontra é guardado com o título que você deu e uma entrada feita a partir dele: confira esse.
- **Encontrar seus artigos**: o topo mostra quantos você tem para ler, está lendo e já leu (clique em um para mostrar só esses) e em quantos projetos. **Buscar nos seus artigos** encontra os artigos por qualquer uma de suas palavras, e **Todos**, **A ler**, **Lendo agora** e **Leitura concluída** mostram um status. Cada artigo mostra seus autores, veículo e ano, seu projeto e tags (clique em uma para mostrar só os artigos dela; o **✕** dela mostra todos de novo) e **A ler**, **Lendo agora** e **Leitura concluída**, para mudar em que pé ele está: **Leitura concluída** anota o dia.
- **A página de um artigo**: clique no título dele. Ela tem **Sua página** e **O PDF** (ou **Abrir o PDF**, para um que esteja neste computador), em que pé ele está, o resumo, o projeto e as tags (cada um com **Salvar**), suas **Notas** (**Salvar as notas**), o BibTeX (**Copiar o BibTeX**) e **Remover da lista**. **Reproduzir** abre [Reproduzir um artigo](#reproduce-a-paper) com o artigo já preenchido.
- **Por projeto**: cada projeto com quantos artigos ele tem e quantos você já leu; clique em um para mostrar os artigos dele. Dê o nome de um dos seus [projetos](/guide/projects) e os artigos vão para esse projeto (eles o acompanham quando você o renomeia), ou use o nome que quiser.
- **Mais** tem **Importar um .bib** (cole o conteúdo ou informe o caminho de um arquivo .bib neste computador, com um projeto e tags para os artigos que ele adiciona: os que você já tem são completados, e os seus dados são mantidos), **Exportar um .bib** (**Os exibidos**, como a sua busca e os filtros os mostram, ou **Todos**: um arquivo para baixar, ou **Copiar**) e **Sincronizar com o Zotero** (abaixo).
- **Criar uma matriz de literatura**: marque os artigos (a caixa à esquerda deles) e uma barra mostra quantos você escolheu, com **Criar uma matriz de literatura**, que inicia a [Matriz de literatura](#literature-matrix) com eles, e **Limpar**.

Quando um agente adiciona um artigo para você, o cartão dele mostra **O artigo**: o artigo como a lista o tem agora, se ele era novo, **Abrir sua lista de leitura** e o BibTeX dele para copiar.

### Mantenha tudo em dia com o Zotero

**Mais** → **Sincronizar com o Zotero** → **Sincronizar agora** mantém a lista e a sua biblioteca do Zotero em dia.

1. Na primeira vez, a página pede a sua **Chave da API do Zotero**: **Obter uma** abre a página de chaves do Zotero, onde você cria uma que possa ler a sua biblioteca (e gravar nela, para que os artigos também vão para lá). Cole a chave e clique em **Salvar**: ela vai para o seu cofre, só para o Zotero ([Guarde chaves no cofre](/guide/connections#keep-keys-in-the-vault)). O **ID de usuário do Zotero** pode ficar vazio: ele é descoberto a partir da chave (para a biblioteca de um grupo, informe `groups/` e o número do grupo). Depois clique em **Sincronizar agora** de novo.
2. O que está no Zotero entra: os artigos novos são adicionados, e os que você já tem são completados, combinados por DOI, id do arXiv ou título. Os detalhes do Zotero prevalecem onde forem diferentes, e o seu status, as suas notas e o seu projeto continuam seus.
3. Os artigos que só existem aqui vão para o Zotero, como itens novos.

Cada sincronização depois da primeira move apenas o que mudou desde a anterior. Um artigo que você exclui no Zotero continua aqui, sem vínculo, e nunca é enviado de volta. Uma linha no topo dos seus artigos diz quando foi a última sincronização e o que ela fez (“12 novos do Zotero, 3 enviados para ele”), com **Sincronizar de novo**.

### Matriz de literatura

[A Matriz de literatura](/apps/t/literature-matrix) lê vários artigos lado a lado e preenche uma planilha: uma linha para cada artigo, uma coluna para cada coisa que você compara e, em cada célula, o que o artigo diz, com o lugar onde ele diz (a página ou a seção).

- **Os artigos**: um por linha (no máximo trinta), cada um com um DOI, um id do arXiv, um link, um título ou um PDF neste computador. Ou da sua lista de leitura: uma linha como “minha lista de leitura, tag: dense” (ou um projeto, ou um status: “minha lista de leitura, a ler”). **Criar uma matriz de literatura** na Lista de leitura preenche o campo com os artigos que você marcou.
- **As colunas**: uma por linha; **Tarefa**, **Dados**, **Método**, **Métricas**, **Resultados** e **Limites** até você mudá-las.
- **Projeto**: o projeto seu em que a planilha vai ficar. Uma linha “minha lista de leitura” sem nada depois passa a pegar os artigos desse projeto.

Ela lê três artigos por vez (o artigo inteiro a partir de uma cópia aberta, ou o resumo quando não há cópia), pede a um modelo rápido que preencha cada linha, escreve o que os artigos dizem em conjunto e guarda a matriz como uma [planilha](/guide/library#spreadsheets) nos arquivos do projeto, com uma segunda aba que lista os artigos. A tela dela tem **A matriz** (quantos ela leu, **Abrir a planilha**, **Copiar como tabela**, a própria matriz, os artigos que ela não conseguiu ler e por quê, e **Outra coluna**: dê um nome, e **Fazer de novo com ele** executa tudo outra vez com essa coluna também), **Artigos** (cada um com o que ele faz em uma frase e de onde foi lido) e **Entre os artigos** (onde eles concordam e discordam e o que ainda está em aberto, com **Copiar**).

### Artigos que sustentam uma afirmação

Ao escrever no [editor de LaTeX](/guide/library#latex-documents), selecione uma frase que precisa de uma citação e escolha **Inserir → Encontrar uma citação para isso**. O modelo auxiliar transforma a afirmação em buscas no OpenAlex e no arXiv e lê os resumos do que encontra; a caixa de diálogo lista os artigos que sustentam a afirmação, de forma forte ou parcial, cada um com o motivo em uma linha, seus autores, ano e veículo, e o resumo. **Citar** adiciona o BibTeX do artigo à sua bibliografia (a entrada do doi.org ou do próprio arXiv, com uma chave que ainda não existe) e coloca o `\cite` depois da afirmação, e um segundo se junta ao primeiro; **Adicionar** apenas adiciona. Apenas a afirmação e as palavras ao redor dela são enviadas, nunca o resto do artigo.

O mesmo editor revisa o seu artigo (**Ferramentas → Revisar com IA**), reescreve as palavras que você selecionar mantendo todos os comandos, fórmulas, `\cite` e `\ref` (**Editar → Reescrever com IA**), escreve uma equação, uma tabela ou um algoritmo que você descrever (Ctrl+K), lê um a partir de uma imagem, explica e corrige os erros do TeX e organiza a bibliografia; veja [Documentos LaTeX](/guide/library#latex-documents).

### Reproduzir um artigo

[Reproduzir um artigo](/apps/t/reproduce-paper) executa o código do próprio artigo para ver se os números dele se sustentam: encontra o código, monta o ambiente, obtém os dados e os checkpoints, executa a avaliação, compara os números com a tabela do artigo e diz o que foi preciso.

- **O artigo** (ou **Ou enviar**), **Código** (um link ou uma pasta neste computador; se ficar vazio, ele é procurado), **O que reproduzir**, como o artigo o nomeia (“Tabela 2, a linha BM25 + monoT5 no MS MARCO dev”), **Limites** (o tempo, o disco e as GPUs que ele pode usar: “No máximo 4 horas, 100 GB de disco e 1 GPU” até você mudar) e **Onde trabalhar** (uma pasta; uma nova para cada execução quando vazio).

Ele lê o artigo e procura nele o código; quando o artigo não indica nenhum, busca no GitHub e na web ao mesmo tempo e escolhe o repositório mais provável. Um modelo rápido define a configuração exata (os dados e a divisão, o modelo e o checkpoint, os parâmetros) e os números a igualar, como impressos. Depois, um agente faz o trabalho conforme a habilidade **reproduce-paper** manda: um ambiente limpo como o repositório indica (venv, conda ou Docker), os dados e os checkpoints, uma execução em uma fatia pequena primeiro, depois a execução de verdade, com cada mudança que ele faz anotada e o motivo, e um relatório, `REPRODUCTION.md`, na pasta de trabalho. Uma execução de verdade que precisa de GPU ou de horas vai para os [Experimentos](/guide/experiments), que espera por GPUs livres e guarda o registro e o log da execução: o app espera as execuções terminarem sem manter uma sessão ocupada, e então um agente lê os números delas e conclui o relatório. Por fim, cada número é colocado ao lado do número do artigo: dentro de meio ponto em uma escala de 0 a 100 (0,005 em uma escala de 0 a 1) conta como reproduzido.

A tela dela tem **Foi reproduzido?** (o veredito, quantos números chegaram perto, as horas que levou e as correções que fez, o repositório, **Abrir a pasta**, as execuções dela nos Experimentos e **Tentar de novo** quando não reproduziu; depois os números do artigo ao lado dos nossos, com a diferença, os próximos em verde, e a configuração como o artigo a dá), **O que foi preciso** (cada etapa com seus minutos, e cada mudança e correção) e **Relatório** (com **Copiar o relatório**).

Ele executa código neste computador e pode levar horas: respeita os seus limites e, quando um estiver prestes a ser ultrapassado, para e informa o que tem. Código que ele não consegue obter, ou dados que não são públicos, ele diz com clareza.

**Destaque os artigos enquanto lê.** Abra o PDF de um artigo em Arquivos e clique em **Destacar**: selecione um trecho, ou arraste uma caixa em volta de uma equação ou de uma figura, para destacá-lo em uma de quatro cores e escrever uma nota sobre ele. **Perguntar** pergunta a um agente sobre só aquela parte (“O que esta equação diz?”), e **Notas** lista tudo o que você marcou, página por página. **Manter em um projeto** coloca os seus destaques e notas no conhecimento de um projeto como um documento com o nome do artigo, mantido sempre atualizado, para que as sessões do projeto os encontrem; **Salvar no PDF** os grava no arquivo para outros apps. Veja [Ler e destacar um PDF](/guide/files-git#read-and-highlight-a-pdf).

## Verificar um artigo antes de enviar

Antes de um artigo ser enviado, o editor LaTeX o verifica como fariam a triagem de um evento e seus revisores: as referências, se ele revela quem você é, as páginas e as fontes, as partes que o evento pede e os números das tabelas. Abra seu artigo (um documento LaTeX, entre os arquivos do projeto: os detalhes do projeto → **Arquivos**) e escolha **Ferramentas → Verificar antes de enviar**.

1. Escolha para onde ele vai: **ACL Rolling Review** (um artigo longo ou curto; **EMNLP** e **NAACL** recebem artigos por ele), **SIGIR** (completo ou curto), **CIKM**, **WSDM**, **TheWebConf**, **KDD**, **NeurIPS**, **ICLR**, **ICML**, **AAAI**, **Um periódico da IEEE**, **Um periódico da ACM** ou **Outros**, com um limite de páginas e **Revisado anonimamente** definidos por você. Uma linha abaixo diz o que o evento pede: o limite de páginas, o que não conta para ele, se a revisão é anônima e as partes obrigatórias. Os eventos mudam suas regras todo ano, por isso a linha também tem um link para a chamada de trabalhos. A verificação lembra o evento de cada artigo e, na primeira vez, escolhe aquele para o qual o próprio estilo do artigo aponta.
2. **Verificar** compila o artigo, lê o PDF, procura as referências on-line e mostra o que encontra à medida que avança. Apenas os títulos, os DOIs e os ids do arXiv das referências são enviados, para Crossref, arXiv, OpenAlex, Semantic Scholar e DBLP; o que os serviços responderam fica guardado por alguns dias, e o serviço que não respondeu é citado abaixo dos resultados. OpenAlex e Semantic Scholar respondem a programas com mais boa vontade quando há uma chave gratuita sua: adicione-a em [Chaves](/apps/connected?tab=keys) como OPENALEX_API_KEY (para api.openalex.org) ou SEMANTIC_SCHOLAR_API_KEY (para api.semanticscholar.org), e a verificação a usa.

O que ela encontra vem em cinco grupos, e cada item é marcado como **Precisa corrigir**, **Verificar** ou **Para sua informação**:

- **Referências**: chaves citadas que não estão em nenhuma entrada da bibliografia (ou citadas com maiúsculas diferentes das da entrada), entradas nunca citadas, o mesmo artigo sob duas chaves e entradas sem o que o tipo delas exige (o periódico de um artigo de periódico, os anais de um artigo de congresso, um ano). Cada entrada citada é procurada pelo DOI, pelo id do arXiv ou, na falta deles, pelo título, e comparada com o que os serviços listam: título, autores, ano e onde foi publicada. Um preprint é procurado em uma versão publicada, que os revisores esperam que você cite. Um artigo que não é encontrado em lugar nenhum é apontado como talvez inexistente: confira você mesmo, pois os serviços também podem deixar passar coisas.
- **Anonimato**, quando a revisão é anônima: seus nomes, quando o modelo está na versão final (os da ACL, NeurIPS, ICML, ICLR e acmart têm uma versão anônima); notas com **\thanks**; uma seção de agradecimentos; links que podem identificar você ou seu laboratório (seu próprio repositório, uma página pessoal); “nosso trabalho anterior” ao lado de uma citação; e os campos Author e Title do próprio PDF.
- **Formatar**: as páginas que contam para o limite (até onde começam as referências, ou as partes que o evento não conta, como as Limitations da ACL), as páginas das referências e o total de páginas, onde o evento impõe um teto; fontes Type 3 e fontes não incorporadas; alterações nas margens, nas fontes e no espaçamento do modelo, e **\vspace**s negativos (como avisos: alguns são permitidos); referências e citações que aparecem como ??; marcas **TODO**, **XXX** e **\todo**; linhas que avançam muito na margem; e os erros, quando o artigo não compila.
- **Partes obrigatórias**: um resumo e o que o evento pede: a seção Limitations da ACL, o Paper Checklist da NeurIPS (e suas respostas ainda em **\answerTODO**), o Impact Statement da ICML, a declaração de uso de IA da ICLR, a declaração de uso de GenAI da CIKM, os Index Terms da IEEE, os conceitos CCS e as palavras-chave da ACM.
- **Números**: veja [Números que batem com suas execuções](#numbers-that-match-your-runs).

O botão com o arquivo e a linha de um item mostra o trecho no código-fonte. Quando uma mudança é segura, **Corrigir** a faz: a entrada como os serviços a listam, com a mesma chave, para que suas citações continuem como estão (**A entrada** a mostra antes), a versão publicada de um preprint, o modelo trocado para sua versão anônima, os agradecimentos comentados, o campo Author do PDF apagado, uma nota **\todo** removida, o negrito movido, uma tabela atualizada. Uma correção é uma mudança no editor como qualquer outra: **Desfazer** a desfaz, e **Salvar** a guarda como uma nova versão. Quando nenhuma mudança é segura, **Pedir ao agente** consulta o agente ao lado do editor, com o item incluído no pedido; **Pedir ao agente que corrija** pede todos de uma vez.

**Adicionar como comentários** coloca os itens em aberto sobre as palavras deles como comentários do documento (veja [Documentos LaTeX](/guide/library#latex-documents)), para que você, as pessoas com quem você compartilha o artigo e os agentes vejam cada um onde ele está; um agente a quem se pede que responda aos comentários os corrige e os resolve. Verifique de novo, e ele diz quantos foram corrigidos desde a última verificação, quantos restam e quantos são novos; **Adicionar como comentários** então resolve os comentários dos itens corrigidos.

Os agentes executam a mesma verificação em um artigo que você guardou ou em um projeto LaTeX seu: “verifique meu artigo para a ACL antes de eu enviá-lo”.

### Números que batem com suas execuções

A verificação lê todas as tabelas do artigo, número por número:

- **Negrito no melhor valor.** Em cada coluna, o negrito deve marcar o melhor valor. Qual sentido é melhor vem do cabeçalho da coluna: perda, erro, latência ou perplexidade, menor; acurácia, F1, nDCG ou BLEU, maior; uma seta (↓ ou ↑) diz isso de forma explícita. Quando o cabeçalho não diz, considera-se melhor o maior, e o item avisa. Negrito no melhor de cada bloco de linhas (entre duas linhas horizontais), empates e tabelas com as métricas nas linhas estão corretos. **Mover o negrito** o coloca no melhor valor.
- **Tabelas feitas pelos Experimentos.** Uma tabela que você coloca no artigo a partir de [Experimentos](/system/experiments) (**Criar uma tabela** e depois **Colocar em um documento LaTeX**) tem uma linha `% hydor:table …` acima dela. A verificação a recalcula a partir das execuções como estão agora e aponta cada número que mudou desde então, e as marcas de significância que apareceram ou sumiram. **Atualizar a tabela** coloca a nova.
- **As outras tabelas.** Os números delas são procurados nas execuções concluídas do projeto do artigo (ou de sua pasta), arredondados como a tabela os arredonda, e como porcentagens. Quantos foram encontrados é informado apenas para sua informação, nunca como problema: um número pode vir de outro artigo ou de uma execução feita em outro lugar.

### O pacote do arXiv

**Exportar → Pacote do arXiv (.zip)**, no alto de um documento LaTeX aberto (no celular, **Mais** (⋯) → **Baixar como**), cria um .zip do artigo salvo para enviar ao arXiv, que publica o código-fonte exatamente como você o envia. O que será feito aparece marcado:

- **Remover os comentários**, com segurança: `\%` permanece, assim como o que o TeX toma como está (texto verbatim, listings, **\verb**, os endereços de **\url** e **\href**); os blocos `\begin{comment}` somem e, com **Remover também os blocos \iffalse … \fi**, esses também.
- **Somente os arquivos que o artigo usa**: as imagens que **\includegraphics** mostra, os arquivos que ele lê, seus próprios estilos e classes.
- **Adicionar o .bbl e deixar o .bib de fora**: a bibliografia como foi compilada aqui, que o arXiv usa. Desmarque para enviar o .bib e deixar o arXiv executar o BibTeX.
- **Colocar os arquivos \input e \include no main.tex** e **Colocar \pdfoutput=1 primeiro** (o jeito antigo de o arXiv pedir pdfLaTeX), quando você os marca.

Nomes com espaços recebem hifens, e o código-fonte acompanha. **Criar o pacote** compila o pacote como está, no mesmo ambiente isolado de qualquer documento, para ver se ele compila, e o baixa. A janela diz o que há nele, o que foi deixado de fora ou renomeado, como foi compilado, seu tamanho em relação ao limite de 50 MB do arXiv e qual processador escolher no arXiv. Ela lembra suas escolhas.

### Pronto para impressão, outro modelo e seu artigo nos apps

**Ferramentas → Seu artigo** tem o restante:

- **Deixar pronto para impressão** pede ao agente ao lado do editor a versão final, escrita a partir das regras do evento: a versão final do modelo, os autores e suas afiliações de volta, os agradecimentos de volta, o bloco de direitos autorais, o que a versão final acrescenta e o limite de páginas. Informe os autores, as afiliações e os agradecimentos se eles não estiverem no código-fonte.
- **Mudar para outro modelo** pede ao agente que passe o artigo para o modelo de outro evento (ou o LNCS da Springer, o da Elsevier, um artigo simples), como versão para revisão ou versão final, mantendo suas palavras, figuras, tabelas e referências.
- **Pacote do arXiv (.zip)**, como acima.
- **Revisar como os revisores fariam**, **Responder às revisões** e **Criar uma apresentação, um pôster e uma thread** abrem esses apps com seu artigo já preenchido (o PDF dele ou, para a apresentação, a pasta de seus arquivos-fonte): veja [Revise, responda e apresente seu artigo](#review-answer-and-present-your-paper).

O que ainda não foi salvo é salvo primeiro, para que cada um receba o artigo como você o vê.

## Revisar, responder e apresentar seu artigo

Quatro apps prontos, em **Escrita** na [página de Apps](/apps), ajudam com o seu próprio artigo: o **Simulador de revisores** avalia seu rascunho como os revisores de um evento fariam, a **Bancada de respostas aos revisores** redige sua resposta às avaliações que você recebeu, **Do artigo à palestra, pôster e thread** cria o material para apresentá-lo, e o **Médico de figuras** deixa os gráficos do artigo prontos para impressão. Os três primeiros leem seu artigo a partir de um PDF, de um arquivo .tex ou da pasta de um projeto LaTeX neste computador, de um link, ou de um documento LaTeX que você guardou (cole o endereço dele); **Ou enviar** aceita um PDF no lugar.

### Simulador de revisores

[O Simulador de revisores](/apps/t/reviewer-simulator) avalia seu rascunho antes dos revisores de verdade, usando o formulário e as notas do próprio evento, e lista o que eles provavelmente vão pedir, começando pelo mais perigoso.

- **Seu artigo**, **O evento** (**ACL Rolling Review**, **SIGIR**, **NeurIPS**, **ICLR**, **ICML**, **KDD**, **CIKM**, **WSDM**, **TheWebConf**, **Um periódico** ou **Outros**, cada um com o formulário vigente em 2025), **Quantos revisores** (de 1 a 5; 3 se você não mudar) e **Algo em que focar**.

Ele reúne os revisores, cada um com um ângulo próprio (na ordem: o especialista no método, o especialista na área, um empirista cético, um leitor atento de uma área vizinha e um revisor de reprodutibilidade), e cada um preenche o formulário do evento, lado a lado. Depois, um coordenador de área escreve a meta-revisão com o resultado provável, e os pontos fracos são ordenados pela chance de cada um derrubar o artigo. As avaliações vêm de um modelo: elas encontram pontos fracos antes dos revisores de verdade e não são uma previsão da decisão.

A tela tem **As revisões** (o evento, o resultado provável, a nota geral média e, depois, cada avaliação: o revisor e o ângulo, as notas, o resumo, os pontos fortes, os pontos fracos e as perguntas), **Meta-revisão** (com **Copiar** e **Copiar todas as avaliações**; depois **O que pode derrubá-lo, o mais perigoso primeiro**: cada ponto fraco com o porquê, a probabilidade e o que o resolve), **Linhas de base e ablações** (o que os revisores vão pedir, por quê e o trabalho que isso dá) e **Antes de enviar** (uma lista para marcar e **Responder a estas avaliações**, que inicia a Bancada de respostas aos revisores com elas, para você ensaiar sua resposta).

### Bancada de respostas aos revisores

[A Bancada de respostas aos revisores](/apps/t/rebuttal-workbench) redige sua resposta às avaliações que você recebeu, ponto a ponto, dentro do limite do evento.

- **As revisões** (cole todas, cada uma sob o seu revisor: “Reviewer 1”, “R2”, o “Reviewer xYz1” do OpenReview…), **Seu artigo** (ou **Ou enviar**; opcional, para que as respostas apontem para as seções dele), **O limite** (como o evento define: caracteres ou palavras, por revisor, por ponto ou no total; “2.500 caracteres por revisor” se você não mudar) e **Tom** (**Cortês e firme**, **Caloroso e agradecido** ou **Breve e direto ao ponto**).

Ela separa as avaliações por revisor, extrai os pontos de cada um lado a lado, junta o mesmo ponto levantado por vários revisores e os classifica: mal lidos (seu artigo já responde), precisam de um experimento, precisam de palavras (um esclarecimento, uma justificativa, uma citação) ou leves. Ela encontra o que seu artigo diz sobre cada um, redige cada resposta dentro da sua parte do limite e monta a resposta completa, contada em relação ao limite. Uma resposta que precisa de um resultado novo deixa [espaços reservados] para você preencher: ela nunca inventa resultados.

A tela tem **Pontos levantados** (a resposta em uma linha; **Todos os pontos**, **Mal lidos**, **Precisam de um experimento**, **Precisam de palavras** e **Leve** mostram um tipo de cada vez; cada ponto com quem o levantou, nas palavras da pessoa, a resposta rascunhada, o tamanho dela em relação à sua parte e **Copiar**), **A fazer** (os experimentos a executar e as mudanças a fazer no artigo, para marcar) e **Resposta completa** (a resposta a cada revisor em relação ao limite e **Copiar a resposta completa**).

### Do artigo à palestra, pôster e thread

[Do artigo à palestra, pôster e thread](/apps/t/paper-to-talk) cria o material com que você apresenta seu artigo: slides com as figuras e equações de verdade, cronometrados, com o que dizer; um pôster A0; publicações para X, Bluesky e LinkedIn; e uma página do projeto.

- **Seu artigo** (o ideal é a pasta do projeto LaTeX, por causa das figuras; no caso do arXiv, o código-fonte é baixado para obtê-las), **A duração da palestra, em minutos** (15 se você não mudar), **Público** (**Pesquisadores da área**, **Pesquisadores de outras áreas** ou **Um público geral**), o que criar (**Slides**, **Um pôster A0**, **Uma thread (X, Bluesky, LinkedIn)** e **Uma página do projeto**) e **Projeto** (o projeto seu em que o que ele cria será guardado).

Ele planeja a palestra (cerca de um slide por minuto, uma ideia em cada, do problema à conclusão), um programa distribui os minutos para que somem a duração, e depois cria o que você pediu, lado a lado: os slides, que você edita e apresenta a partir dos arquivos do projeto ([Slides](/guide/library#slides)), o pôster como um documento LaTeX ([Documentos LaTeX](/guide/library#latex-documents)), as publicações e a página do projeto, pronta para você publicar ([Publicar uma página](/guide/library#publish-a-page)).

A tela tem **O que foi criado** (a mensagem da palestra e uma frase de abertura, depois cada coisa criada, com **Abrir**), **A apresentação oral** (a palestra em uma faixa, cada slide com a largura dos seus minutos, depois cada slide: seus minutos, título, pontos, figura, equação e o que dizer) e **Conversa** (**X**, **Bluesky** e **LinkedIn** mostram as publicações de cada um, numeradas, cada uma com **Copiar**, e **Copiar a thread**; a publicação única do LinkedIn tem **Copiar a publicação**).

### Médico de figuras

[O Médico de figuras](/apps/t/figure-doctor) deixa os gráficos do seu artigo prontos para impressão: com a largura da coluna, na fonte do artigo, em cores que leitores daltônicos conseguem distinguir, salvos como PDFs vetoriais com as fontes incorporadas, tudo com um único arquivo de estilo.

- **Seu código de gráficos** (um script, um notebook ou uma pasta deles neste computador, feitos com matplotlib ou seaborn), **O modelo do evento** (**ACL, EMNLP, NAACL**, **ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)**, **IEEE**, **ICML**, **NeurIPS, ICLR**, **Springer LNCS** ou **Outro (informe a largura)**), **Largura** (**Uma coluna** ou **Ambas as colunas**), **Ou a largura em polegadas** (para outro modelo) e **A fonte do artigo** (**Como no modelo**, **Times New Roman**, **Computer Modern**, **Linux Libertine** ou **Helvetica**).

Um programa define o estilo (a largura em polegadas, a fonte e seus tamanhos, uma paleta para leitores daltônicos), e um agente altera seus scripts onde eles estão, depois de copiar cada um ao lado dele (name.orig.py) e guardar uma imagem de cada figura como era. Depois, todos os scripts passam a usar um único arquivo de estilo, `paper.mplstyle`, ao lado deles; cada figura é salva como PDF vetorial, e suas fontes são verificadas: todas incorporadas, nenhuma Type 3, que muitos eventos recusam. Ele executa seus scripts, então precisa do que eles precisam neste computador (Python, matplotlib e os dados deles).

A tela tem **Antes e depois** (o tamanho, a fonte e as cores usados, depois cada figura como era e como ficou, com **Abrir o PDF** e o que mudou), **Arquivo de estilo** (`paper.mplstyle`, com **Copiar** e como usá-lo) e **O que mudou** (cada mudança e o que a verificação das fontes encontrou).

Os agentes das suas sessões também conhecem esses ofícios, por meio de habilidades que acompanham o Hydor (**peer-review**, **reproduce-paper** e **figures-for-papers**: veja [Habilidades](/guide/skills)): peça a um deles que revise um artigo com você, responda a um revisor ou conserte uma única figura, e ele trabalha do mesmo jeito.

## Execute o trabalho do seu laboratório

Três apps prontos, em **Laboratório** na página de [Apps](/apps), ajudam no trabalho diário de um laboratório: rotular dados e conferir um modelo com os seus rótulos, testar uma ideia no seu próprio código, das hipóteses até um relatório, e ajustar as configurações de um modelo. O sprint e a varredura executam seus trabalhos em [Experimentos](/guide/experiments), então precisam que ele tenha um computador (ou um cluster) com GPUs.

### Bancada de anotação

A **Bancada de anotação** faz você e um modelo rotularem a mesma amostra de textos, para que você veja onde discordam e até que ponto dá para confiar no modelo com o resto. Abra-a em **Apps** e preencha:

- **Os rótulos**, separados por vírgulas: até nove, um para cada tecla de 1 a 9. **Como rotular**: suas diretrizes, com as suas palavras; o modelo também rotula com elas.
- Os textos: **um arquivo CSV ou JSON lines**, **um dataset do Hugging Face** pelo nome (como stanfordnlp/imdb) ou pelo endereço, com **Split dele** quando houver vários (e a configuração antes de uma barra, como plain_text/test), ou textos colados, um por linha. **A coluna com o texto** é encontrada sozinha (uma chamada text, review ou sentence; senão, a dos textos mais longos): indique-a quando o palpite estiver errado.
- **Quantos rotular**: escolhidos ao acaso, 100 se você não mudar, no máximo 1.000.

Ela lê os textos (um dataset pelo servidor de datasets do Hugging Face, algumas páginas de linhas de pontos aleatórios), tira a amostra em ordem aleatória e pede ao modelo auxiliar que os rotule vinte por vez, cada um com um motivo curto. A página da execução é então onde você trabalha:

- **Classificação**: um texto por vez, com um botão grande para cada rótulo. Aperte um, ou a tecla dele (**1** a **9**): só então o rótulo do modelo aparece, em uma linha acima do próximo texto (com o motivo, quando você discorda), para nunca influenciar você. **Pular por enquanto** (**S**) manda um texto para o fim, **Variação** (**Z**) desfaz o último, e uma nota (**N** para começar uma) fica com o texto dela. A barra mostra até onde você foi.
- **Divergências**: cada texto que você e o modelo rotularam de forma diferente, com seu rótulo e suas notas ao lado do rótulo e do motivo do modelo. **Classificar de novo** o devolve para **Classificação**.
- **Concordância**: com que frequência vocês deram o mesmo rótulo, o κ de Cohen (essa concordância além do que o acaso daria: 1 é perfeita, 0 não é melhor que o acaso, acima de 0,6 é substancial) e o que só o acaso daria, e a matriz de confusão: seus rótulos na lateral, os do modelo no alto.
- **Exportar**: **CSV** ou **Linhas JSON** baixa os textos que você rotulou, cada um com o seu rótulo, o do modelo e o motivo dele, e suas notas. **Publicar no Hugging Face** cria lá um dataset próprio (privado, a menos que você escolha **Todos**), com os dados e uma ficha que diz como foram rotulados, com suas diretrizes e o quanto você e o modelo concordaram. Isso exige um token do Hugging Face com permissão de escrita: o app funciona sem ele, então na primeira vez que você publicar ele avisa; adicione-o abaixo do formulário do app (**Token do Hugging Face**, marcado como opcional) ou em **Apps → Apps conectados → Chaves** como HF_TOKEN. **Remover seus textos** exclui os textos e rótulos de um conjunto.

Cada conjunto é uma execução própria e guarda seus textos e seus rótulos como registros do app: a página do app lista seus conjuntos entre as últimas execuções, e cada um abre de onde você parou.

### Sprint de pesquisa

O **Sprint de pesquisa** leva uma pergunta de pesquisa por um sprint curto no seu próprio código, com você aprovando cada etapa. Preencha **Sua pergunta de pesquisa**, **O repositório** (um repositório Git neste computador), **O que ele deve saber** (a métrica que importa, a linha de base e seus números, como treinar e avaliar, o que não mudar), **Horas de GPU que ele pode usar** (8 se você não mudar, para todas as execuções juntas) e **Quantas hipóteses** (de uma a cinco). Depois:

1. O modelo auxiliar propõe hipóteses a partir da sua pergunta e do README do repositório, cada uma com o que a apoiaria e o que contaria contra ela, e o experimento que a testa.
2. Com **Quero aprovar cada etapa** marcado (ele vem marcado, a menos que você desmarque), a execução espera por você: mantenha as hipóteses ou escreva as que quer testar no lugar, uma por linha. A pergunta aparece na página da execução, na sua Caixa de entrada e como um aviso.
3. Um agente cria um worktree do repositório em um novo branch (sprint/…), ao lado do seu checkout, que ele nunca altera. Ali ele escreve o plano (SPRINT.md) e o código de que as execuções precisam, faz o commit deles e lista as execuções: uma de linha de base e uma para cada hipótese, com seeds. As que passariam das suas horas de GPU ficam de fora e são nomeadas.
4. Ele espera por você de novo, antes de gastar qualquer tempo de GPU: inicie as execuções ou diga não, e o sprint para ali (o plano e o código ficam no branch).
5. O Experimentos as executa, marcadas com o sprint, e o sprint espera todas terminarem.
6. Uma tabela de resultados compara cada condição com a linha de base, com significância; um agente analisa as execuções em um notebook Jupyter, guardado nos arquivos do projeto, decide cada hipótese (apoiada, não apoiada ou incerta, com a evidência) e escreve um relatório curto.

A tela tem **O sprint** (a pergunta, como foi, o branch e cada hipótese com seu veredito e evidência), **Execuções** (a tabela de resultados e cada execução com sua métrica) e **Relatório** (para ler e copiar, com **Abrir o notebook** e o que tentar em seguida). Executado pela API ou por uma agenda, não há ninguém para aprovar, então ele segue direto até o fim.

### Planejador de varreduras

O **Planejador de varreduras** planeja uma varredura de hiperparâmetros de um script de treinamento dentro de um orçamento, a inicia, para cedo as tentativas ruins e escreve o que importou. Preencha **O script ou comando**, **Pasta do app**, **A métrica** (como o script a imprime ou grava: linhas metric=value ou JSON) e **Qual direção é melhor**, **Configurações a ajustar** (uma por linha, com os valores a testar, como lr: 1e-4, 3e-4, 1e-3; deixe vazio para que sejam encontradas), o **Orçamento** (execuções ou horas de GPU: “20 execuções”, “10 horas de GPU”) e **Parar cedo as tentativas ruins**.

- Um agente lê o script, sem executá-lo nem alterá-lo: seus argumentos, quanto tempo leva uma execução e quando uma execução ruim aparece. Ele propõe as configurações e os valores a testar (os seus, quando você os deu), e um programa os ajusta ao orçamento: todas as combinações quando cabem, senão tantos sorteios aleatórios quanto ele permitir.
- Com **Quero conferir o plano antes**, a execução espera por você: inicie-a como está ou escreva mudanças, uma configuração por linha (lr: 3e-4, 1e-3 para outros valores, drop dropout para deixar uma de fora).
- O Experimentos executa a varredura como um único experimento; com **Parar cedo as tentativas ruins**, uma execução claramente pior que a melhor até então é interrompida, para economizar o tempo de GPU dela.
- Quando as execuções terminam, um programa encontra a melhor execução e o quanto cada configuração importou (a parte da dispersão da métrica entre as execuções que seus valores explicam), e o modelo auxiliar diz o que isso significa e o que tentar em seguida.

A tela tem **Resultados** (as configurações e a métrica da melhor execução, o que ele encontrou, o que tentar em seguida e uma barra com o peso de cada configuração), **Por configuração** (a métrica para cada valor de uma configuração, como caixas) e **Todas as execuções**.

## Relatórios: sua semana e seu caderno de laboratório

Dois apps prontos, em **Trabalho** na página [Apps](/apps), escrevem um resumo do que você fez a partir do que o Hydor sabe do seu trabalho: suas sessões (as feitas aqui e as sessões do Claude Code e do Codex no VS Code ou em um terminal que o Hydor lê), seus commits nos repositórios Git em que elas trabalharam, suas execuções em Experimentos, o que você criou ou guardou e os artigos que você marcou como lidos na sua Lista de leitura. Sessões com a memória desligada e sessões confidenciais ficam de fora, assim como o trabalho das sessões que os agentes iniciam para partes de uma tarefa (ele conta como o da sessão principal). Os dois abrem em uma página própria e podem se atualizar sozinhos.

### Relatório semanal de progresso

O **Relatório semanal de progresso** transforma sua semana em uma atualização para seu orientador, sua equipe ou seu gestor: o que foi feito, resultados com seus números, problemas e o que está bloqueando você, o plano da próxima semana e perguntas a fazer. Ele abre em uma página própria com o relatório desta semana (os sete dias até o dia em que ele é escrito): título e resumo, a semana em números e depois **Concluído nesta semana**, **Resultados**, **Problemas e bloqueios**, **Próxima semana** e **Perguntas**.

- **Copiar como Markdown** e **Copiar como e-mail** (uma linha de assunto e depois uma nota curta que começa e termina como a sua começaria e terminaria) colocam o relatório na sua área de transferência; **Salvar como documento** o guarda como um documento, para você alterar e exportar como Word ou PDF.
- **Atualizar** escreve agora o relatório desta semana. **Anteriores**, logo abaixo, lista as semanas anteriores, cada uma a um clique de distância.
- **Configurações**, os controles deslizantes no alto: **Atualizar automaticamente** (desligado até você ativar) escreve um novo relatório toda sexta-feira às 16:00; abaixo do interruptor, escolha outros dias (**Todos os dias**, **Em dias úteis**, **Uma vez por semana em** um dia) e o horário. É uma [tarefa agendada](/guide/tasks), então [Configurações → Tarefas agendadas](/settings?s=tasks) também a lista. Abaixo dela: **Para quem é** (seu orientador, sua equipe ou um gestor: o relatório é escrito para essa pessoa), **Projetos** (todos ou só alguns, pelo nome) e **O que incluir** (“só pesquisa, sem custos”).

### Caderno de laboratório

O **Caderno de laboratório** guarda uma entrada datada para cada dia em que você trabalhou: o que foi tentado, o que foi encontrado e decidido, e o que ainda está em aberto, com links para as sessões, os commits, as execuções, os arquivos e os itens guardados daquele dia. Suas entradas são registros do próprio app, mantidos separados da [memória](/guide/memory). Ele abre em uma página própria com as entradas, da mais recente para a mais antiga:

- **Pesquisar no notebook** encontra entradas pelas palavras e pelo significado (quando a [Busca por significado](/settings?s=memory&find=Search%20by%20meaning) está ativada), das melhores para as piores; **Todas as entradas** traz todas de volta.
- **Copiar o link dele**, abaixo de cada entrada, copia o endereço da página própria dela, que mostra a entrada como foi escrita: para citá-la em um artigo, um relatório ou uma nota.
- **Atualizar** escreve agora a entrada de hoje, e **Escrever um dia anterior** escreve um dia que você perdeu. Um dia escrito de novo toma o lugar da sua entrada; um dia em que você não fez nada fica sem entrada.
- **Configurações**: **Atualizar automaticamente** (desligado até você ativar) escreve a entrada do dia toda noite às 21:00, nos dias e no horário que você escolher; **Projetos** limita o caderno a alguns projetos.

## Peça a um agente

- “Configure o Paper radar para acompanhar cs.IR e cs.CL, com recuperação densa e previsão de desempenho de consultas como temas, e faça-o atualizar todos os dias às 7:30.”
- “O que o Paper radar encontrou para mim hoje? Quais artigos tocam no meu projeto Hydor?”
- “Ative o Citation alerts para os meus artigos (eu publico como Chris Samarinas) e diga quem citou o ProCIS recentemente.”
- “Adicione SIGIR, ACL e EMNLP ao Deadline radar e me lembre 21, 7 e 2 dias antes de cada prazo.”
- “Observe o Hugging Face em busca de novos rerankers com menos de 1B de parâmetros e licença Apache ou MIT, e execute minha avaliação em cada um: python eval.py --model {model} em ~/rerank-eval, ndcg@10, meu melhor resultado é 0,512.”
- “Comece uma revisão de literatura viva sobre recuperação esparsa aprendida, com SPLADE e ColBERT como ponto de partida, e escreva um rascunho da seção de trabalhos relacionados.”
- “Encontre lacunas entre os meus artigos e os trabalhos deste mês sobre busca conversacional; tenho uma GPU de 24 GB.”
- “Adicione 2104.08663 e o artigo do ColBERT à minha Lista de leitura, no projeto Recuperação densa.”
- “Importe ~/papers/refs.bib para a minha Lista de leitura, com a etiqueta survey.”
- “Sincronize minha Lista de leitura com o Zotero.”
- “Quais artigos da minha Lista de leitura ainda faltam ler para o projeto Recuperação densa?”
- “Faça uma matriz de literatura dos artigos com a etiqueta dense na minha Lista de leitura, com uma coluna indicando se o código deles foi publicado.”
- “Reproduza a Tabela 2 do artigo do BEIR, BM25 no SciFact, em no máximo uma hora e sem GPU.”
- “Abra o Reproduce a paper preenchido para 2104.08663, mas ainda não execute.”
- “Revise meu rascunho em ~/papers/draft como três revisores do SIGIR fariam e diga o que pode derrubá-lo.”
- “Aqui estão minhas revisões do ARR: escreva uma resposta (rebuttal) de no máximo 2.500 caracteres por revisor.”
- “Faça uma apresentação de 12 minutos, um pôster A0 e uma thread a partir do meu artigo em ~/papers/colbert, no projeto ColBERT.”
- “Ajuste os gráficos em ~/papers/colbert/plots para um artigo da ACL, com uma coluna de largura, em Times.”
- “Verifique meu artigo para a ACL antes de eu enviá-lo e corrija o que for seguro corrigir.”
- “Todas as referências do meu artigo em LaTeX são reais, com os autores e os anos certos? Corrija as que não forem.”
- “Una as entradas duplicadas na bibliografia do meu artigo e preencha o que os DOIs delas informam.”
- “Algum preprint citado no meu artigo foi publicado desde então? Cite as versões publicadas.”
- “Deixe meu artigo do NeurIPS anônimo para a revisão: nomes, links, agradecimentos e os próprios campos do PDF.”
- “Meu artigo está dentro do limite de páginas do EMNLP? Se passou, enxugue-o para caber.”
- “Os números das minhas tabelas de resultados ainda batem com as minhas execuções?”
- “Meu artigo do SIGIR foi aceito: prepare a versão final (camera-ready).”
- “Passe meu artigo para o modelo do ICLR, como a versão para revisão.”
- “Carregue 200 textos da parte de sentimento do tweet_eval no Hugging Face para o Annotation workbench, com os rótulos positivo, negativo e neutro e estas diretrizes: …”
- “Qual é a minha concordância com o modelo no meu conjunto de anotações mais recente? Quais rótulos mais confundimos?”
- “Faça uma sprint de pesquisa sobre se um currículo de consultas curtas para longas ajuda o recuperador em ~/code/retriever, com 6 horas de GPU.”
- “Planeje uma varredura da taxa de aprendizado e do tamanho do lote de ~/code/model/train.py em até 10 horas de GPU; quanto menor o val_loss, melhor.”
- “Ative meu relatório semanal de progresso: para o meu orientador, às sextas às 15:00, só o projeto Recuperador.”
- “O que eu decidi sobre negativos difíceis na semana passada? Procure no meu caderno de laboratório.”
- “Escreva a entrada do meu caderno de laboratório para a terça-feira passada.”
