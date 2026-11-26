# Memória

Os agentes do Hydor lembram o que importa de uma sessão para a outra: fatos sobre você, sobre cada projeto e em que ponto está uma tarefa, além de um perfil seu com o qual todo agente começa. Este tópico explica o que eles guardam e quando, o seu perfil, com o que um agente começa, como ver, corrigir ou desfazer o que foi salvo, e tudo o que há em Configurações → Memória, incluindo a busca por significado e a limpeza que acontece sozinha. Use-o para que os agentes parem de perguntar as mesmas coisas duas vezes e para que você sempre saiba o que eles sabem.

![Configurações → Memória: o que os agentes lembram sobre você e seus projetos](images/memory.webp)

## O que os agentes lembram

A memória tem três partes, que funcionam como uma só:

- **Notas da memória**: fatos curtos com os quais todo agente começa, sobre você, um projeto ou uma sessão. A maior parte deste tópico trata delas.
- **Memória wiki**: artigos mais longos, com suas fontes, que os agentes mantêm para cada projeto (e um conjunto compartilhado), escritos a partir de seus documentos, suas conversas e seus commits (veja [Memória wiki](/guide/wiki-memory)). Os agentes recebem, sem precisar pedir, uma linha para os artigos que têm relação com o que você pede e os planos em andamento do projeto.
- **Documentos**: os próprios arquivos, que os agentes pesquisam e citam, e que não são entregues sem serem pedidos. Ficam no [Conhecimento compartilhado](/knowledge) e na aba **Memória** de cada projeto, junto com suas notas e artigos wiki (o filtro **Documentos**; veja [Projetos e conhecimento](/guide/projects)).

A aba **Memória** de um projeto mostra as três partes em uma só lista, com uma caixa de busca sobre elas (veja [A aba Memória de um projeto](/guide/wiki-memory#a-projects-memory-tab)). Quando um documento é adicionado ou alterado, o modelo auxiliar o lê, adiciona algumas notas à memória do projeto e atualiza a wiki dele (veja [Aprender com novos documentos](/guide/wiki-memory#learn-from-new-documents)).

As notas da memória são curtas: cada uma tem uma ou duas frases, com no máximo 500 caracteres. Todo agente que o app executa as compartilha: Claude Code, Codex, Custom e os agentes que falam ACP, como o Gemini CLI. As memórias próprias do Claude Code e do Codex ficam desligadas nas sessões que o app executa, então estas notas são a única memória que todos compartilham, e você pode ver e desfazer tudo o que eles guardam. Cada nota pertence a um de três lugares:

- **Sobre você**: fatos e preferências duradouros sobre você (“Prefere unidades métricas”, “Gosta de respostas curtas”, “Trabalha principalmente em Python”). Toda sessão recebe essas notas.
- **Um projeto**: fatos sobre um projeto, como suas convenções, os comandos que o compilam e testam, onde ficam as coisas e as decisões tomadas. O projeto é a pasta em que uma sessão trabalha: a pasta principal do repositório Git, quando ela está em um, ou a própria pasta, caso contrário. Um worktree (uma cópia separada de um repositório, em seu próprio branch) compartilha as notas do repositório principal, então as sessões de todos os branches veem as mesmas. Uma sessão na sua própria pasta pessoal não tem notas de projeto: recebe apenas o que é sobre você e as suas próprias.
- **Uma sessão**: em que ponto está uma tarefa, para que essa sessão retome de onde parou quando continuar. Elas somem quando a sessão é excluída.

Uma sessão vê e altera apenas três conjuntos de notas: as sobre você, as do seu próprio projeto e as suas. Um agente que trabalha em um projeto nunca vê as notas de outro. As sessões de um [projeto](/guide/projects) trabalham todas na pasta do projeto, então compartilham as notas dele. Uma tarefa que ganha uma pasta nova só dela (veja [Agentes](/guide/agents)) tem essa pasta como projeto.

As notas também ficam ligadas ao código do projeto: uma nota de projeto que cita arquivos ou pastas fica ligada a eles no repositório Git do projeto e ao commit em que foi escrita, para que o Hydor perceba quando o código mudou em relação ao que a nota diz (veja [Limpeza automática](/guide/memory#tidy-up-automatically)).

Quando um lugar acumula muitas notas, surgem ali outros tipos de entrada: **temas**, cada um resumindo um grupo de notas relacionadas, e, para um projeto, um **perfil**, um resumo curto que os agentes recebem sempre primeiro. A limpeza os escreve (veja [Limpeza automática](/guide/memory#tidy-up-automatically)), além de um título curto para cada nota e tema, para o índice com o qual os agentes começam. O seu próprio perfil é outra coisa: você e seus agentes o escrevem (veja [Seu perfil](/guide/memory#your-profile)).

A memória funciona nas sessões que este app executa, não nas que ele apenas lista, como uma sessão aberta em um terminal ou no VS Code.

## Como as notas são escritas

Os agentes salvam notas em dois casos: quando você pede (“Lembre que sou vegetariano”, “Lembre que o servidor de teste é test.example.com”) ou quando aprendem algo duradouro que uma sessão posterior não conseguiria descobrir sozinha: o que você quer, uma decisão e o motivo, uma armadilha, uma regra aprendida do jeito difícil. Nada é escrito sozinho depois de uma resposta: as notas vêm de agentes que escolhem salvá-las, de notas que você mesmo escreve ou edita e da limpeza, que retrabalha notas já guardadas (juntando-as, conferindo-as com o código, movendo-as para o projeto a que se referem) e, com [Aprender com conversas](/guide/memory#learn-from-conversations) ativado, guarda no máximo três coisas por dia que nenhum agente salvou.

- **O agente escolhe o lugar**: sobre você, este projeto ou esta sessão. Quando ele salva como sobre você uma nota que cita um projeto (pelo nome, pelo nome da pasta ou por um arquivo que existe só nesse projeto), a resposta que recebe avisa isso. Em uma sessão nesse projeto, ele é orientado a salvar a nota de novo como sobre o projeto e a esquecer a primeira, se for o caso; em qualquer outra sessão, é avisado de que a limpeza moverá a nota para o projeto, depois que o modelo auxiliar confirmar que ela é sobre o projeto e não sobre você (veja [Limpeza automática](/guide/memory#tidy-up-automatically)).
- **Um fato por nota, escrito para ser reencontrado**: cada nota diz uma coisa em uma frase que se sustenta sozinha, citando aquilo de que trata (o projeto, a ferramenta, a pessoa ou o lugar), para que um pedido posterior, com outras palavras, ainda a encontre. O que todo agente deve sempre saber sobre você vai no seu perfil. Não vai o que os arquivos ou o histórico de um projeto já dizem: onde o código está e o que faz mudam, e os arquivos já contam isso.
- **Como se sabe**: o agente diz como sabe o que salva: você disse, ele conferiu (um teste, a saída de um comando, um arquivo) ou é conclusão dele, ainda não conferida. Os agentes seguintes são avisados de quais notas ainda não foram conferidas, e a limpeza confere essas primeiro. Uma nota que você mesmo escreve conta como dita por você.
- **Algumas notas só valem até uma data**: uma viagem, um prazo, uma visita. O agente dá a essa nota uma data de término. A partir dela, os agentes deixam de recebê-la e, em até uma hora, ela vai para Notas excluídas, onde você pode restaurá-la por 30 dias.
- **Correções substituem a nota antiga**: para atualizar uma nota, o agente a reescreve pelo número dela em vez de acrescentar outra. Uma nota com o mesmo texto não é salva duas vezes. Com a [busca por significado](/guide/memory#search-by-meaning) ativada, também não é salva uma nota que diga a mesma coisa com outras palavras.
- **Os agentes também esquecem**: um agente remove uma nota quando ela se mostra errada ou desatualizada, ou quando você pede (“Esqueça meu endereço antigo”).
- **Nunca segredos**: uma nota que pareça conter uma senha, uma chave, um token ou um número de cartão é recusada. O mesmo vale para texto que pareça instruções para um agente (“ignore as instruções anteriores…”), pois chegaria a todas as sessões seguintes.

Você também pode escrever uma nota com **Adicionar uma nota** em [Configurações → Memória](/settings?s=memory&find=Add%20a%20note), e encontrar, editar, datar e excluir cada nota ali (veja [Notas](/guide/memory#notes)).

## Descobertas: o que foi tentado e no que deu

Um projeto de pesquisa esquece o que tentou: um agente entra de novo no mesmo beco sem saída, e as afirmações de um artigo se afastam do que as execuções mostraram. Uma **descoberta** é uma coisa que um projeto tentou e no que deu, guardada com suas evidências, por exemplo: “Negativos difíceis do BM25 aumentam o nDCG@10 de dev em relação aos negativos no lote: confirmada, +0,019 em 3 seeds, o ganho está nas consultas longas.” É uma nota da memória de um tipo próprio, por isso pertence a um projeto, é pesquisada por palavras e por significado, chega às sessões novas quando tem relação com o que você pede e mantém o seu histórico.

Cada descoberta tem:

- **Um enunciado**: a hipótese ou afirmação, em uma frase.
- **Um veredito**: **Confirmada**, **Refutada**, **Pouco claro** ou **Aberta** (enunciada, mas ainda não testada).
- **O que foi aprendido**: uma ou duas frases com os números, onde isso vale ou por que falhou.
- **Evidência**, com no máximo 12 itens: execuções, pontuações e tabelas de resultados de [Experimentos](/guide/experiments), commits, arquivos, artigos e sessões. Um número medido em “O que foi aprendido” (uma pontuação, um ganho, uma proporção) precisa da execução, pontuação ou tabela de onde ele vem ou, quando é o que um artigo relata, desse artigo; caso contrário, a descoberta é recusada. Números em nomes (BM25, nDCG@10), anos e contagens como 3 seeds não são números medidos.

**Os agentes as registram.** Em um projeto, os agentes são orientados a olhar as descobertas dele antes de propor ou começar um experimento, e a registrar uma depois de cada resultado, também quando não funcionou ou não ficou claro. O [Sprint de pesquisa](/guide/researchers#research-sprint) registra uma para cada uma de suas hipóteses, e **Tentar derrubar** registra o veredito sobre a afirmação. **Os becos sem saída são mantidos de propósito**: a arrumação nunca junta, resume, move ou remove uma descoberta (e a criação de uma wiki a partir do histórico do projeto também não as lê), e uma descoberta nunca é sugerida para remoção só porque nenhum agente precisou dela ultimamente. Duas descobertas que se contradizem são mantidas, até que uma posterior substitua a outra: a nova diz o que substitui, e a antiga sai da lista, mas permanece no histórico.

**Onde vê-las.** A aba **Memória** de um projeto tem um filtro **Descobertas** ao lado de **Notas**, **Wiki** e **Documentos** (veja [A aba Memória de um projeto](/guide/wiki-memory#a-projects-memory-tab)), com um filtro menor para cada veredito. Uma linha mostra o enunciado, o veredito e há quanto tempo foi registrada. Abra uma para lê-la por inteiro: o que foi aprendido, as evidências como links que abrem cada execução, commit, arquivo, artigo ou sessão, quem a registrou e quando, e o que ela substitui. Quando um arquivo citado como evidência mudou desde então no repositório Git do projeto, a linha diz **o código mudou desde então** e a descoberta diz “O código em que isto se baseia mudou desde então.”, com os arquivos: teste de novo antes de se apoiar nela. As descobertas também aparecem entre as notas do projeto em [Configurações → Memória](/settings?s=memory), marcadas como **Descoberta**.

**Como mudar ou esquecer uma.** Abra-a e pressione **Alterar** para corrigir à mão o veredito, o enunciado ou o que foi aprendido. **Esquecer** a remove; ela fica em [Notas excluídas](/guide/memory#deleted-notes) por 30 dias, para ser restaurada. Você também pode pedir a um agente: ele registra o resultado mais recente no lugar do antigo ou a esquece. Desligar a memória desliga as descobertas junto.

## Seu perfil

Além das notas, a memória guarda um perfil seu: quem você é e o que faz, o que usa, como gosta das respostas e o que evitar. Enquanto a memória está ativada, todo agente o recebe uma vez, no início de uma sessão, logo depois das suas [Diretrizes dos agentes](/guide/guidelines), e deixa que ele molde a forma de trabalhar com você; suas diretrizes e o que você diz em uma sessão continuam valendo primeiro. As notas guardam o que importa de vez em quando; o perfil guarda o que todo agente deve sempre saber.

- **Os agentes o mantêm atualizado.** Quando algo que você diz revela algo duradouro que ajudará todos os agentes a atendê-lo melhor, como seu trabalho, as ferramentas que usa ou como gosta das respostas, o agente reescreve o perfil com isso. A maioria das mensagens não muda nada. A alteração aparece sob a resposta como **Seu perfil**, com a opção de desfazer (veja [Ver o que um agente salvou depois de uma resposta](/guide/memory#see-what-an-agent-saved-after-a-reply)). Os agentes nunca colocam segredos nele, não podem limpá-lo e não podem sobrescrever uma alteração feita depois do início da sessão deles: veem o perfil como está agora e **tentam de novo**.
- **Escreva você mesmo.** Em [Configurações → Memória](/settings?s=memory&find=Your%20profile), o primeiro grupo, **Seu perfil**, o mostra, com seis linhas, e com **Mostrar tudo** (e **Mostrar menos**) quando é mais longo. **Editar** (ou **Escrever**, enquanto não há perfil), ao lado do título do grupo, abre-o para escrita: Enter começa uma nova linha, Ctrl+Enter (⌘+Enter no Mac) ou **Salvar** salva, e Escape ou **Cancelar** o deixa como estava. Enquanto você escreve, um contador diz quantas palavras ele tem, de quantas pode ter.
- **Que tamanho pode ter.** [Tamanho do perfil](/settings?s=memory&find=Profile%20length), no grupo **O que os agentes recebem**, mais abaixo na página, é o máximo de palavras que ele pode ter: 250, 500, 1.000 (o usual) ou 2.000 palavras. Os agentes ficam dentro desse limite. Um perfil mais longo, salvo por você ou que sobrou quando você escolhe um tamanho menor, é mantido como foi escrito enquanto o modelo auxiliar o encurta, em segundo plano, para caber (“Encurtando para caber em 1.000 palavras…”); a versão mais curta aparece como alterada **pelo auxiliar**. Ele desiste depois de 4 minutos, no máximo (“O modelo auxiliar não respondeu em 4 minutos”). Quando o auxiliar não consegue, o motivo aparece sob o perfil, com **Tentar de novo**; quando é porque uma conta está desconectada, o motivo diz isso (“Sua conta “Work” do Claude Code foi desconectada, e nenhuma outra conta ou modelo Custom pôde fazer isso: entre de novo (Configurações → Agentes → Contas).”) e um cartão pede que você entre (veja [Quando uma conta é desconectada](/guide/agents-models#when-an-account-is-signed-out)).
- **Abaixo dele**: quantas palavras ele tem, de quantas pode ter, e quando foi escrito ou alterado pela última vez e por quem: **por você**, **por um agente** (com a sessão de onde veio) ou **pelo auxiliar**. O **⋯** (menu do perfil) ao lado de **Editar** tem **Histórico de alterações**, todas as versões com quem as escreveu e por quê, e **Limpar perfil**, que pergunta antes. Um perfil limpo fica em [Notas excluídas](/guide/memory#deleted-notes) por 30 dias, e ali **Restaurar** o traz de volta.

## Ver o que um agente salvou depois de uma resposta

Quando um agente salva, altera ou remove notas durante um turno, aparece um chip sob a resposta, como **Memória · 1 adicionada, 1 atualizada**. Ele conta as alterações ainda em vigor (adicionadas, atualizadas, removidas); quando todas foram desfeitas, mostra **desfeito**. Várias alterações em um turno aparecem como um único chip, e uma nota alterada várias vezes aparece como uma só alteração, do que dizia antes ao que diz depois.

Clique no chip para abri-lo. Cada alteração mostra:

- Uma etiqueta: **Adicionado**, **Atualizado**, **Removido** ou **Desfeito**.
- A que lugar a nota pertence (**Sobre você**, **Um projeto ·** e o nome da pasta, **Esta sessão** ou **Outra sessão**; **Seu perfil** para uma alteração no seu perfil), “salva pelo agente”, e por quantas alterações passou nesse turno.
- O texto. Em uma atualização, as palavras retiradas aparecem riscadas e as inseridas, destacadas. Quando a maior parte foi reescrita, o texto antigo aparece riscado acima do novo.
- **Alterado de novo desde**, quando a nota foi editada depois desse turno: clique para ver o que ela diz agora.
- Uma última linha com o motivo dado pelo agente, se houver, e **Excluído desde** ou **Não é mais guardado** quando a nota foi excluída ou apagada depois desse turno.

Os botões de cada alteração:

- **Desfazer esta alteração** (ou **Desfazer estas alterações**): uma nota adicionada some, uma nota atualizada recupera o texto antigo, uma nota removida volta.
- **Editar**: altera o texto no próprio lugar. Enter salva, Shift+Enter começa uma nova linha, Escape cancela. No caso do seu perfil, abre Configurações → Memória, onde o perfil tem espaço para as suas linhas.
- **Excluir**: remove a nota. Ela fica em Notas excluídas, nas Configurações, por 30 dias. Seu perfil não tem Excluir aqui: limpe-o nas Configurações.
- **Restaurar**: traz de volta uma nota que foi excluída depois.

O **⋯** (opções da memória) no alto do chip aberto tem **Memória desta sessão**, que liga ou desliga a memória para esta sessão, e **Toda a memória**, que abre Configurações → Memória. Clique na linha de cima do chip para fechá-lo.

## O que um agente recebe ao começar

Um agente não recebe toda a memória. Ele começa com uma explicação curta sobre a memória, seu perfil, um índice do que está guardado e as notas que têm a ver com o seu pedido. Depois disso, só recebe mais quando algo novo tem a ver com o que está fazendo, e sempre pode consultar o resto. O que ele recebe é contexto de fundo: o agente é avisado de que as notas podem estar desatualizadas, de quais delas ainda não foram verificadas, de que o que você diz agora sempre vem primeiro e de que não deve mencioná-las a menos que ajudem.

- **No início**:
  - seu perfil (veja [Seu perfil](/guide/memory#your-profile));
  - o perfil deste projeto, quando ele tem um. Ele coloca em primeiro lugar as regras permanentes de que os agentes precisam na maioria das sessões: como fazer commit, compilar, testar e publicar, e as preferências duradouras do projeto;
  - as notas da própria sessão, quando a sessão continua;
  - todas as notas de um lugar que tem poucas (sobre você, ou um projeto que ainda não tem tópicos);
  - de um lugar maior, as notas e os tópicos que se destacam para a sua primeira mensagem, no máximo 10, a menos que você mude isso em [Notas com que cada agente começa](/settings?s=memory&find=Notes%20each%20agent%20starts%20with). Nada é dado só para encher espaço: quando menos notas têm a ver com o pedido, o agente recebe menos, ou nenhuma;
  - até três linhas com os nomes dos artigos da wiki do projeto que têm a ver com a sua mensagem (“Da wiki deste projeto (wiki_read abre um)”: o título de cada artigo, o que ele diz em uma linha e onde está; marcado como “pode estar desatualizado” quando os arquivos que ele cita mudaram desde que foi escrito), e os planos em andamento do projeto, com seus itens em aberto (veja [Memória wiki](/guide/wiki-memory#how-it-sits-beside-notes-and-documents)).
- **Como chega até ele**: o Claude Code e o Codex recebem a explicação, os perfis, as notas de um lugar pequeno e o índice nas instruções com que começam, e as notas que têm a ver com o seu pedido junto com a sua primeira mensagem. Essas instruções são as mesmas em todas as sessões de um projeto até que suas notas mudem, então o provedor do modelo reaproveita o que guardou delas de uma sessão para a outra, o que é mais rápido e custa menos. Os agentes que falam ACP recebem tudo junto com a sua primeira mensagem. O [Custom](/guide/custom) recebe tudo em um único bloco antes do primeiro turno e o mantém enquanto trabalha.
- **A cada mensagem**: quando você escreve de novo, a memória é pesquisada para a nova mensagem, com um critério mais rígido do que no início. O que passa a ter a ver com ela vai junto, sob “Da memória, relevante agora para esta mensagem”: no máximo três notas (1.500 caracteres), nunca uma que a sessão já tenha recebido antes, e no máximo uma linha de artigo da wiki. Em geral não há nada a acrescentar, e nada é dito. Um comando, ou uma mensagem de uma ou duas palavras, não traz notas próprias. Isso vale para o Claude Code, o Codex, o Custom e os agentes que falam ACP.
- **Quando um agente abre ou altera um arquivo**: as notas sobre aquele arquivo, sobre a pasta dele e sobre a pasta acima chegam na hora (nunca o projeto inteiro), cada pasta uma vez por sessão, com no máximo duas notas (800 caracteres). O Claude Code as recebe logo depois da leitura ou da edição, por meio de um hook que o app fornece, a menos que suas próprias configurações do Claude Code desativem os hooks; o Custom as recebe na saída da ferramenta; o Codex e os outros agentes que falam ACP as recebem com a sua próxima mensagem. Uma nota fica ligada a um arquivo quando o cita, ou cita a pasta dele, no repositório do projeto.
- **Quando uma sessão continua**: uma sessão que continua dentro de uma hora (depois de reiniciar o app, por exemplo) recebe de novo as mesmas instruções, com as suas próprias notas e as que têm a ver com a sua última mensagem, e nada do que já recebeu antes, a menos que a conversa tenha sido condensada desde então. Quando o Claude Code ou o Codex continua depois que a conversa foi condensada, ele recebe uma vez o ponto de controle da sessão: onde lê-lo e o resumo dele, com até 3.000 caracteres (veja [Pontos de controle](/guide/wiki-memory#checkpoints)). O Custom, quando condensa uma conversa longa, lê a memória de novo para a sua última mensagem e também recebe o ponto de controle.
- **Modelos com contexto pequeno** (Custom): a parcela do contexto do modelo que a memória pode ocupar diminui junto com ele. Um modelo com menos de 12.000 tokens recebe um bloco pequeno (no máximo 6% do contexto) com as primeiras 120 palavras do seu perfil, no máximo três notas, sem índice, sem linhas de wiki nem planos, e nada é acrescentado com uma mensagem ou um arquivo. Um modelo de até cerca de 33.000 tokens recebe um bloco de no máximo 6% do contexto, as primeiras 400 palavras do seu perfil, cinco notas, um índice curto, uma linha de wiki e uma linha de plano, e no máximo uma nota com uma mensagem e uma com um arquivo. Um perfil cortado avisa isso, e essa sessão não pode reescrevê-lo: o agente diz o que você deve acrescentar, ou você o edita em Configurações. Modelos maiores, e todos os outros agentes, recebem tudo o que foi descrito acima (veja [Modelos com contexto pequeno](/guide/custom#what-the-model-reads)).
- **O índice**: para cada lugar maior, o agente também recebe os títulos de suas notas e tópicos (no Custom: dos que ele não recebeu), para saber o que está guardado e consultar quando precisar; um tópico representa as notas que ele resume. O que os agentes mais usaram vem primeiro (o que foi usado uma vez, depois 2 a 3 vezes, depois 4 a 7, e assim por diante), e quando o restante não cabe, ele é contado por área do projeto: “e por área: server/memory (6) · web/src (4) · outras (12)”. A organização escreve os títulos (veja [Organizar automaticamente](/guide/memory#tidy-up-automatically)); até lá, as primeiras palavras da nota fazem o papel de título.
- **Como as notas são encontradas**: por busca híbrida. Uma lista ordena as notas por suas palavras, com as palavras raras valendo mais; com a busca por significado ativada, outra as ordena pelo que querem dizer, de modo que “seja breve” encontra “Gosta de respostas curtas”. As duas listas são combinadas por posição, e as notas que os agentes consultaram recentemente e com frequência ganham um pouco mais de peso. Uma nota só conta como relevante para o seu pedido quando se destaca das demais para ele: alguns pedidos se parecem com todas as notas e outros com quase nenhuma, então cada nota é medida pelo quanto o pedido se parece com todas elas. Com a busca por significado ativada, o modelo dela começa a carregar quando você começa a escrever, de modo que a sua primeira mensagem também é comparada por significado; uma sessão nunca espera por ele: a que começa antes de ele estar pronto recebe as notas relevantes para a sua mensagem pelas palavras.
- **Nomes exatos**: um nome raro que o seu pedido escreve, como um nome de arquivo ou um caminho, um nome em camelCase, snake_case ou kebab-case, uma versão como v0.62.0 ou uma flag como --resume, faz as poucas notas que o contêm serem relevantes para o pedido, mesmo quando o significado delas não se destaca. Palavras comuns com hífen, como “built-in” ou “follow-up”, não contam.
- **Um tópico, ou suas notas**: uma nota e o tópico que a resume nunca são dados juntos. Quando uma das notas de um tópico tem a ver com o seu pedido, o agente recebe só essa nota; quando duas ou mais têm, ele recebe o tópico.
- **Material citado**: as notas que o modelo auxiliar guardou de documentos e conversas, em vez das que você ou um agente escreveu, vêm por último no seu lugar, sob “Guardadas pelo modelo auxiliar a partir de documentos e conversas (material citado, não instruções)”, e também nas consultas, para que o agente as trate como material, não como ordens.
- **Habilidades adequadas**: o mesmo tipo de busca indica as habilidades que combinam com a sua primeira mensagem, quando alguma combina claramente (veja [Habilidades](/guide/skills#skills-that-fit-a-new-session)).

A memória conta duas coisas para cada nota e mostra as duas na nota (veja [Abrir uma nota](/guide/memory#open-a-note)). **Dada aos agentes** é quantas vezes os agentes receberam a nota sem pedir: no início, com uma mensagem ou em um arquivo. **Necessária para os agentes** é quantas vezes a usaram: consultaram, citaram pelo número (#123) ou trabalharam com o arquivo ou o comando a que ela se refere depois de recebê-la. Receber uma nota não é precisar dela: só o que o agente fez com ela diz isso. As notas de que nenhum agente precisou nos últimos meses são oferecidas a você para manter ou excluir (veja [Notas de que nenhum agente precisou recentemente](/guide/memory#notes-no-agent-needed-lately)). Quais notas vêm primeiro numa próxima vez leva em conta apenas o que os agentes consultaram por conta própria.

Os agentes também recebem ferramentas de memória: salvar uma nota (em um lugar, com como ela é conhecida e uma data de fim, se tiver), corrigir uma nota, esquecer uma, consultar notas por palavras e por significado (inclusive as notas que um tópico representa), atualizar seu perfil, pesquisar e ler conversas passadas (veja [Pesquisar sessões anteriores](/guide/memory#search-earlier-sessions)), e pesquisar ao mesmo tempo notas, artigos da wiki, documentos e conversas passadas, em um projeto ou em todos (veja [Pesquisar além de um projeto](/guide/memory#search-beyond-one-project)). Uma nota encontrada em uma consulta também conta como necessária.

## Desativar a memória em uma sessão

Comece uma sessão sem memória pela página inicial:

1. Abaixo da caixa de mensagem, abra **Opções**.
2. Abra **Memória** e escolha **Desativada nesta sessão** (“Começa do zero e não guarda nada dela”). **Ativada** (“Usa e acrescenta ao que os agentes lembram”) é o padrão.
3. O chip de Opções agora mostra **Sem memória**. A página inicial mantém essa escolha também para as suas próximas sessões, até você voltar para Ativada.

**O que os agentes lembram**, na parte de baixo desse menu, abre Configurações → Memória. No celular, esses menus abrem como painéis na parte de baixo da tela. A opção Memória não aparece enquanto a memória está desativada para todas as sessões.

Para uma sessão que já está em andamento, abra o menu da sessão (⋯) → **Configurações da sessão** → **Memória**. A dica dela mostra **Ativada** ou **Desativada**; clique nela para alternar. A mesma chave está no ⋯ do chip de memória, como **Memória desta sessão**. Enquanto a memória está desativada para todas as sessões, as duas ficam esmaecidas, com a dica **Desativada para todos**.

Com a memória desativada, uma sessão “não lê nem escreve notas”:

- O agente dela não recebe notas, perfil nem ferramentas de memória, e nada da sessão é salvo.
- Agentes de outras sessões não conseguem encontrá-la quando pesquisam conversas passadas, e não conseguem lê-la.

O editor de uma tarefa agendada tem o mesmo chip de Memória, então as execuções dela podem funcionar sem memória (veja [Tarefas agendadas](/guide/tasks)). As execuções iniciadas pela página pública de um app sempre têm a memória desativada (veja [Apps](/guide/apps)).

## Desativar a memória em todas as sessões

Desative a chave **Memória** ao lado do título de [Configurações → Memória](/settings?s=memory&find=Memory), no canto superior direito da seção. Depois de desativada, um aviso no alto da página diz: “A memória está desativada: os agentes não recebem notas e não salvam nada de novo. Suas notas permanecem.”

Enquanto ela está desativada:

- Nenhum agente recebe notas, seu perfil nem ferramentas de memória, e nada é salvo.
- Suas notas permanecem. Ative a chave de novo e os agentes voltam a recebê-las.
- A opção Memória sai da página inicial, e a caixa de busca (Ctrl+K) deixa de mostrar notas.
- **Aprender com as conversas**, **Organizar automaticamente**, a linha **Última organização** com **Organizar agora** e **Busca por significado** ficam esmaecidos.
- Seu perfil e suas notas permanecem na página: você ainda pode lê-los, editá-los, adicioná-los, excluí-los e exportá-los.

## Configurações → Memória

Tudo sobre a memória está em [Configurações → Recursos → Memória](/settings?s=memory): “O que os agentes lembram sobre você, seus projetos e cada sessão, e quando foi escrito”. A chave **Memória** fica ao lado do título da seção, e **Saiba mais** abaixo do título abre este tópico. Abaixo dele, de cima para baixo, a página tem seis grupos, e uma linha acima deles que nomeia as três partes da memória:

- **Seu perfil**: o que todo agente recebe sobre você, com **Editar** e um menu **⋯** (veja [Seu perfil](/guide/memory#your-profile)).
- **Notas**: todas as notas guardadas, com **Adicionar uma nota**, um campo de busca e um índice de lugares (veja [Notas](/guide/memory#notes)).
- **Aprendizado**: **Aprender com as conversas**, **Organizar automaticamente** e a **Última organização** com **O que mudou** e **Organizar agora**.
- **Memória wiki**: se os projetos mantêm uma wiki, o aprendizado com novos documentos e onde as wikis ficam guardadas (veja [Memória wiki](#wiki-memory)).
- **O que os agentes recebem**: **Busca por significado**, **Notas com que cada agente começa** e **Tamanho do perfil**.
- **Seus dados**: **Trazer…** de outros assistentes, **Exportar** (Markdown, JSON) e **Limpar tudo…**.

O nome de uma linha pode ter um botão **(i)** ao lado, que diz mais sobre o que a linha faz. No celular, as Configurações abrem como uma lista: toque em **Memória** para abri-la em uma página própria. Ali as notas ocupam a largura toda da tela, e todos os menus da página abrem como painéis na parte de baixo da tela.

### Memória wiki

O grupo **Memória wiki** tem as configurações dos artigos que os agentes mantêm para cada projeto (veja [Memória wiki](/guide/wiki-memory), que explica o que eles são e como funcionam):

- **Memória wiki**: ativada no início, para a wiki compartilhada e para todos os projetos, a menos que a aba **Configurações** do próprio projeto diga o contrário.
- **Aprender com novos documentos**: ativado no início. Documentos novos e alterados acrescentam notas de memória (apenas do próprio projeto) e atualizam a wiki, com o modelo auxiliar.
- **Pasta da wiki**: onde a wiki compartilhada é guardada, e as wikis dos projetos, a menos que se defina outra coisa abaixo: um caminho absoluto no computador que executa o Hydor, com **Procurar**. Mudá-la quando ela tem arquivos abre uma revisão para manter, combinar ou mover esses arquivos (veja [Mover a pasta da wiki](/guide/wiki-memory#move-the-wiki-folder)).
- **Wikis dos projetos**: **Na pasta da wiki** (no início: nada é escrito nas pastas dos seus projetos) ou **Na pasta de cada projeto**. Com a segunda, **Pasta dentro de cada projeto** diz onde, e **Deixar fora do Git** a mantém fora do repositório do projeto.

A própria memória precisa estar ativada para que novos documentos acrescentem alguma coisa, e para os pontos de controle das sessões: com a memória desativada em uma sessão ou em todas, nenhum ponto de controle é salvo e os existentes permanecem (veja [Pontos de controle](/guide/wiki-memory#checkpoints)).

### Notas

O grupo **Notas** lista todas as notas guardadas, com a contagem ao lado do título (33 notas, por exemplo). **Adicionar uma nota**, à direita do título, escreve uma nota sua (veja [Adicionar uma nota](/guide/memory#add-a-note)). Seu perfil não está entre elas, nem na contagem: ele tem um grupo próprio, acima.

Abaixo do título há um campo de busca e um índice de lugares. Cada lugar abre uma página própria:

- **Sobre você**: as notas sobre você, com a quantidade delas.
- **Cada projeto**, pelo nome da pasta, com a contagem de notas e o caminho da pasta, começando pelo projeto que mudou mais recentemente. Os cinco primeiros aparecem; **Mostrar mais N projetos** mostra o restante.
- **Sessões**: as notas guardadas para uma única sessão cada.
- **Não necessárias recentemente**: só quando algumas notas ficam quatro meses sem uso (veja [Notas de que nenhum agente precisou recentemente](/guide/memory#notes-no-agent-needed-lately)).
- **Notas excluídas**: guardadas por 30 dias, para restaurar (veja [Notas excluídas](/guide/memory#deleted-notes)).

A página de um lugar abre dentro da seção, com o link **Memória** no alto para voltar (o botão Voltar do navegador também volta). Ela mostra o nome do lugar e sua contagem (e o caminho da pasta, no caso de um projeto), **Adicionar uma nota** (em Sobre você e em um projeto; a nota começa nesse lugar), um campo de busca próprio (“Buscar nestas notas”) e as notas dele: primeiro o perfil do projeto, depois seus assuntos, depois suas notas, da alteração mais recente para a mais antiga, vinte por vez, com **Mostrar mais** abaixo. Sem notas, ela avisa. O endereço de uma página é `/settings?s=memory&notes=global`, `&notes=session`, `&notes=stale` ou `&notes=deleted`, ou `&notes=repo:` e o caminho da pasta do projeto.

**Para encontrar uma nota**, digite no campo de busca do grupo (ou da página de um lugar): “Buscar em 33 notas” ou “Buscar em 33 notas por palavras ou significado” quando a busca por significado está pronta. Ela encontra notas que contêm todas as palavras digitadas, com a última valendo como início de palavra, e, com a busca por significado ativada, notas que querem dizer o mesmo. As melhores vêm primeiro, cada uma com o lugar a que pertence, e **Mostrar mais** traz as vinte seguintes. “Nenhuma nota encontrada” indica que não há resultados. Esc ou o **×** limpa a busca, e o índice volta. Enquanto a memória não tem notas, o grupo avisa, com um botão **Trazer de outros assistentes** e a linha **Notas excluídas**.

Cada nota em uma lista mostra as duas primeiras linhas (com uma etiqueta **Assunto**, **Perfil** ou **Descoberta**, quando for o caso; veja [Descobertas](/guide/memory#findings-what-was-tried-and-what-came-of-it)) e, abaixo, uma linha de informações: o lugar, em uma lista que mistura lugares (uma busca, **Sessões**, **Não necessárias recentemente**, **Notas excluídas**); **Adicionado** ou **Alterado** e há quanto tempo (passe o ponteiro para ver as datas exatas); **ainda não verificada**, quando ninguém a confirmou; **necessária uma vez** ou **necessária N vezes**, a frequência com que um agente a usou (consultou, citou ou trabalhou com o arquivo ou comando de que ela trata); e **até** uma data, quando ela tem uma data final. Clique em uma nota para abri-la.

### Abrir uma nota

Ao clicar em uma nota, ela abre em uma janela, com o título **Nota**, **Assunto** ou **Perfil**, com o texto inteiro e **Editar** logo abaixo. Abaixo do texto:

- **Onde**: **Sobre você**, o projeto (o nome da pasta e o caminho) ou a sessão a que ela pertence (clique no nome para abrir a sessão).
- **Escrita**: **Adicionado** ou **Alterado** e quando, **por você**, **por um agente** ou **pelo auxiliar** (a arrumação), e a sessão de onde veio, que você pode clicar para abrir. Aponte para ver as datas exatas.
- **Como se sabe**: **você disse**, **verificado** ou **ainda não verificada** (aponte para ver o que significa). Notas de antes de isso ser registrado não dizem nada.
- **Necessária para os agentes**: **Uma vez**, **N vezes** (com a data da última) ou **Ainda não**: quantas vezes um agente usou a nota, consultando-a, citando-a pelo número ou trabalhando com o arquivo ou comando a que ela se refere depois de recebê-la. Receber uma nota não conta.
- **Dada aos agentes**: **Uma vez**, **N vezes** (com a data da última) ou **Ainda não**: quantas vezes os agentes receberam a nota sem pedir, no início de uma sessão, com uma mensagem ou ao abrir um arquivo.
- **No código**, quando arquivos citados pela nota mudaram no projeto desde que ela foi escrita: “<arquivos> mudaram no projeto desde que isto foi escrito (visto há 2h). A próxima arrumação a confere com o código.” Até lá, os agentes recebem a nota marcada como “pode estar desatualizada: <arquivos> mudaram” (veja [Arrumar automaticamente](/guide/memory#tidy-up-automatically)).
- **Data final**: a data, ou **Nenhum**, com **Variação** (veja abaixo).
- **Resume**, para um assunto ou perfil: a quantas notas ele corresponde, com **Mostrar** para listá-las, as excluídas riscadas.
- **Histórico**: **Mostrar** lista cada etapa da vida da nota, da mais recente para a mais antiga: Adicionado, Alterado (texto antigo → texto novo), Movida (“Movida de Sobre você para o projeto”), Excluída, Restaurada, Data final (“Até” uma data, ou “Removida”), Como se sabe, cada uma com quando, por quem, em qual sessão e por quê. **Ocultar** fecha o histórico.

Os botões:

- **Editar**: altere o texto no lugar, com até 500 caracteres (800 para um assunto ou perfil). Enter salva, Shift+Enter inicia uma nova linha, Esc ou **Cancelar** descarta a alteração. Um texto que pareça conter um segredo não pode ser salvo.
- **Data final** → **Variação**: em “Verdadeira até”, escolha uma data e pressione **Salvar**. A nota deixa de valer no fim desse dia: de amanhã até cinco anos à frente. **Sem data final** remove a data final.
- **Excluir**, no canto inferior esquerdo: “Excluída. Ela fica em Notas excluídas por 30 dias.” A janela se fecha.
- **Manter**, quando você abriu a nota em **Não necessárias recentemente** (veja abaixo).
- **Fechar**, ou Esc, sai da janela.

Uma nota excluída abre com **Restaurar** e **Apagar para sempre** no lugar (veja [Notas excluídas](/guide/memory#deleted-notes)); ela não pode ser editada e não tem data final.

### Adicionar uma nota

[Adicionar uma nota](/settings?s=memory&find=Add%20a%20note), ao lado do título de **Notas** (e na página de Sobre você ou de um projeto), abre uma janela: “O que os agentes devem lembrar? Diga, por exemplo: “Prefiro respostas curtas”.” Escreva a nota e depois **Salvar** ou pressione Enter. Shift+Enter inicia uma nova linha; Esc ou **Cancelar** a descarta.

- **A que pertence**: uma nota é sobre você, a menos que você escolha um projeto. A etiqueta antes dos botões (**Sobre você**) lista os projetos para os quais a memória tem notas; uma nota sobre um projeto chega apenas às sessões que trabalham nele. Sem notas de projeto ainda, a etiqueta não aparece e a nota é sobre você. Quando aberta a partir da página de um projeto, a janela começa nesse projeto.
- As mesmas regras das notas dos agentes: no máximo 500 caracteres, mantida como um único parágrafo, e nunca algo que pareça conter uma senha, uma chave, um token ou um número de cartão.
- A nota aparece como **por você**. As sessões a recebem ao começar (o Custom, antes do próximo turno), como qualquer nota.

### Notas de que nenhum agente precisou recentemente

Quando algumas notas ficam quatro meses sem uso, o índice ganha uma linha **Não necessárias recentemente**, com a quantidade: “3 notas de que nenhum agente precisou em quatro meses”. Uma nota conta como usada quando um agente a consultou, a citou ou trabalhou com o arquivo ou comando a que ela se refere; recebê-la no início não conta. Para notas de antes de isso ser registrado, vale a última vez em que foram dadas ou consultadas e, daí em diante, o uso. A página dela diz: “Nenhum agente precisou destas por quatro meses. Mantenha o que ainda importa, exclua o resto.” Ela não tem campo de busca.

Só são sugeridas notas sobre você e sobre projetos, nunca assuntos, perfis, notas com data final ou notas de sessões. Cada linha tem dois botões: **Manter**, que conta a nota como necessária hoje, de modo que ela sai da lista, e **Excluir**, que a remove. Abra uma nota para lê-la inteira antes, com a linha **Necessária para os agentes** e seu histórico: lá, **Manter** e **Excluir** fazem o mesmo. Quando não sobra nenhuma, aparece “Todas as notas foram necessárias recentemente”, e a linha sai do índice.

### Notas excluídas

[Notas excluídas](/settings?s=memory&find=Deleted%20notes), a última linha do índice, abre as notas excluídas por você, por um agente, pela arrumação ou pela data final: “As notas excluídas ficam 30 dias e depois somem para sempre.” As notas de uma sessão somem para sempre logo depois que a própria sessão é excluída. O campo de busca encontra notas excluídas pelas palavras, e o link **Memória** no alto volta.

- **Restaurar**, na linha da nota ou na janela dela, traz a nota de volta. Uma nota cuja data final já passou volta sem ela. Um perfil apagado aparece aqui como **Seu perfil**: restaurado, volta a ser o seu perfil, no lugar de um escrito depois.
- Abra uma nota e pressione **Apagar para sempre**: ela pergunta “Apagar esta nota para sempre?” (“Ela vai embora com o histórico e não poderá voltar.”) e depois a remove de imediato. O **Histórico** dela mostra o que aconteceu com ela.

### Arrumar automaticamente

[Arrumar automaticamente](/settings?s=memory&find=Tidy%20up%20automatically), no grupo **Aprendizado**, mantém a memória curta e atualizada. Vem ativado por padrão: a dica diz “Uma vez por dia, une notas que dizem a mesma coisa e resume as relacionadas”. O modelo auxiliar faz o trabalho: o modelo pequeno que o app usa para tarefas fora das sessões, escolhido em [Configurações → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model) (veja [Agentes, contas e modelos](/guide/agents-models)). Ele lê apenas as notas, a menos que [Aprender com as conversas](/guide/memory#learn-from-conversations) esteja ativado: então ele lê primeiro as conversas desde a última arrumação. Ele deixa em paz as notas próprias das sessões: são poucas e vão embora com a sessão.

Cada arrumação faz estas coisas:

1. **Quase cópias, notas erradas, datas finais.** Cada nota adicionada ou alterada desde a última arrumação é comparada com as notas mais próximas no mesmo lugar (por significado quando a busca por significado está ativada, senão por palavras). Notas que dizem a mesma coisa, ou em que uma atualiza a outra, são unidas em uma só que mantém todos os fatos ainda verdadeiros; onde elas discordam, a mais nova vence, e a nota unida precisa ser mais curta que as notas que ela reúne. Uma nota que uma mais nova mostra estar errada é excluída. Uma nota verdadeira só até uma data que ela cita (“até sexta”, “a viagem de março”) recebe essa data final. No máximo 200 notas são verificadas em uma arrumação; as demais esperam a próxima.
2. **Notas conferidas com o código, no lugar certo e no arquivo certo.** Quatro etapas, cada uma nas notas de um projeto, que continuam mesmo quando uma delas falha:
   - **Conferida com o código.** Uma nota de projeto que cita arquivos fica ligada a eles no repositório Git do projeto e ao commit em que foi escrita. A cada dez minutos o Hydor verifica se esses arquivos mudaram desde então; se mudaram, a nota mostra **No código** em sua janela e os agentes a recebem marcada como “pode estar desatualizada”. A arrumação lê até 20 dessas notas com a mudança nos arquivos (o diff do Git), e o modelo auxiliar decide: ainda verdadeira (a nota é marcada como verificada), atualizada ou removida. Um projeto que não é um repositório Git não tem essas ligações.
   - **Movida para o projeto dela.** Uma nota salva como sobre você que trata de um só projeto (ela o cita: o nome do projeto, o nome da pasta, o nome do repositório ou o nome do pacote ou produto) é movida para as notas desse projeto quando o modelo auxiliar concorda, de modo que deixa de ir para todas as sessões de todos os projetos. Uma preferência que vale em qualquer lugar continua sendo sobre você. A mudança aparece como **Movida**, e o histórico dela diz “Movida de Sobre você para” o projeto. Seu perfil nunca é tocado.
   - **Histórico de design para a wiki.** Em um projeto com a [Memória wiki](/guide/wiki-memory) ativada, notas longas (350 caracteres ou mais, com mais de uma semana, não ditas por você) que parecem histórico de design, com versões, datas e vários caminhos de arquivos, são escritas na wiki. Cada uma é então substituída por uma indicação de uma linha (“<título>: veja <artigo> na wiki”), ou some quando a indicação não acrescentaria nada. No máximo 8 por arrumação.
   - **AGENTS.md.** Uma nota que o `AGENTS.md` (ou `CLAUDE.md`) do projeto já diz é removida (“Já está no AGENTS.md”), e uma que ele diz em parte é reduzida ao que falta. Uma convenção duradoura do projeto, útil para qualquer pessoa que trabalhe nele e nunca um detalhe privado, pode ser sugerida para o arquivo: no máximo três por arrumação, cada uma esperando por você em **Sugerido para o AGENTS.md** (veja [Arrumar agora e desfazer as mudanças](/guide/memory#tidy-up-now-and-undo-its-changes)).
3. **Assuntos e o perfil de um projeto.** Quando as notas de um lugar passam de cerca de 2.400 caracteres, as notas relacionadas são resumidas em assuntos, cada um cobrindo um punhado de notas (até 12). Os agentes então recebem o assunto e ainda podem consultar as notas que ele resume. Um projeto também ganha um perfil curto (no máximo 700 caracteres) que os agentes sempre recebem primeiro: as regras permanentes de que os agentes precisam na maioria das sessões (como fazer commit, compilar, testar e publicar, e as preferências duradouras do projeto), o que ele é, como compilá-lo, testá-lo e executá-lo, e suas armadilhas. Um assunto ou perfil é escrito de novo quando muda o que ele resume. Seu próprio perfil fica por conta de você e dos seus agentes (veja [Seu perfil](/guide/memory#your-profile)).
4. **Títulos.** Cada nota e assunto sobre você e seus projetos recebe um título de poucas palavras, para o índice com que os agentes começam. As notas novas recebem o seu em até uma hora, e uma nota cujo texto muda recebe um novo.

Ela roda sozinha cerca de uma vez por dia, sempre que o app está ligado, de modo que um computador que dorme à noite também a recebe: quando já se passaram 20 horas desde a última arrumação, há algo novo (uma mensagem que você escreveu ou uma nota que você ou um agente alterou) e você fez uma pausa de dez minutos, então ela nunca roda enquanto você digita. Sem nada novo, ela nem roda. Toda mudança que ela faz entra no histórico da nota como feita pelo “auxiliar”, e cada mudança da última arrumação pode ser desfeita (veja [Arrumar agora e desfazer as mudanças](/guide/memory#tidy-up-now-and-undo-its-changes)).

### Aprender com as conversas

[Aprender com as conversas](/settings?s=memory&find=Learn%20from%20conversations), a primeira linha do grupo **Aprendizado**, vem ativada por padrão. A dica diz "Uma vez por dia, corrija o que as conversas mostram de errado e guarde o que os agentes deixaram passar", e o **(i)** acrescenta: "Com a organização, o modelo auxiliar lê as conversas desde a última (exceto as que estão com a memória desativada): ele corrige as notas que elas mostram estar erradas, verifica as notas ainda não verificadas e guarda no máximo algumas coisas por dia que nenhum agente salvou." É a primeira parte de cada organização, seja ela executada sozinha ou com **Organizar agora**.

Os agentes salvam notas na hora, antes de saberem o que vem depois, então uma nota pode estar errada desde o início ou ficar desatualizada, e algumas coisas duradouras nunca chegam a ser escritas. Projeto por projeto, o modelo auxiliar lê o que você escreveu e a última resposta de cada turno (nunca os arquivos que você anexou, o texto que você colou, os passos intermediários, a saída de ferramentas nem as páginas da web), junto com as notas relacionadas a essas conversas, e:

- **corrige** uma nota que uma conversa mostra estar errada ou desatualizada, ou a remove quando não sobra nada de verdadeiro;
- **verifica** uma nota ainda não verificada que uma conversa mostra ser verdadeira; para essa nota, ele também lê a conversa que a escreveu;
- **guarda** o que uma sessão futura precisaria e não encontraria nos arquivos do projeto: algo que você quer ou corrigiu, uma decisão e o motivo, uma armadilha. No máximo três por dia, para que a memória continue pequena; depois, a organização as une a notas quase idênticas, como faz com toda nota nova.

Uma nota de projeto que cita um arquivo que não está mais no projeto é apontada ao modelo, para que ele possa corrigi-la.

Ele nunca lê sessões com a memória desativada (as sessões confidenciais a têm desativada), subagentes do Hydor (um agente escreveu os pedidos deles) nem execuções agendadas, e na primeira vez lê os últimos três dias. Cada alteração aparece na lista da organização com a conversa de onde veio, e pode ser desfeita ali (veja [Organizar agora e desfazer as alterações](/guide/memory#tidy-up-now-and-undo-its-changes)). Desative a chave e a organização passa a ler apenas as notas.

### Organizar agora e desfazer as alterações

A linha **Última organização**, abaixo de **Organizar automaticamente**, informa na dica a última organização:

- "Ainda não organizado"
- "Organizando…" enquanto ela é executada.
- "Há 3 h: 2 adicionadas, 1 atualizada, 3 removidas." (o que ela alterou), ou "Há 3 h: nada a alterar (14 notas analisadas)."
- "Ela leu 12 conversas.", quando [Aprender com as conversas](/guide/memory#learn-from-conversations) leu alguma; "O aprendizado com as conversas parou:" e o motivo, em uma linha abaixo, quando essa parte falhou (o restante da organização foi executado normalmente).
- Quando a última não encontrou nada, mas uma anterior encontrou: "Há 3 h: nada a alterar. Antes disso, há 2 d:" e as alterações dessa organização anterior. Elas continuam na lista, e podem ser desfeitas, até que uma organização altere algo de novo.
- "Algumas etapas de manutenção pararam:" e o motivo, em uma linha abaixo, quando uma das etapas depois das notas quase idênticas (verificar as notas com o código, mover notas para o projeto delas, mover o histórico de design para a wiki, comparar com o AGENTS.md) falhou. As outras etapas foram executadas, e as demais alterações da organização permanecem.
- Quando ela falhou, o motivo depois do horário, como o modelo auxiliar não responder.

**O que mudou**, à direita da linha (exibido quando a última organização alterou algo), abre "O que a última organização mudou". Cada alteração mostra um selo (**Adicionado**, **Atualizado**, **Removido**, **Movida**, **Termina**, **Sem data final**, **Verificado** ou **Desfeito**), **Assunto** ou **Perfil** quando for o caso, o local e o motivo ("Unida à #12", "Resume 5 notas relacionadas", "Já está no AGENTS.md", "Aprendido com “Upload page”"), e o texto, com o antigo riscado acima do novo. Uma alteração **Movida** mostra o texto da nota e "Movida de Sobre você para" o projeto. O botão de balão de fala (**Abrir a conversa**) abre a conversa da qual uma alteração foi aprendida. O botão de seta (**Desfazer esta alteração**) reverte uma alteração: o que ela adicionou é removido, o que ela alterou recupera o texto antigo, o que ela excluiu volta, uma data final que ela definiu é retirada, uma nota que ela verificou deixa de estar verificada (e, quando foi verificada com o código, é sinalizada de novo), e uma nota que ela moveu volta para Sobre você. Feche a janela quando terminar.

Abaixo das alterações, **Sugerido para o AGENTS.md** lista as frases que a organização gostaria de adicionar ao `AGENTS.md` de um projeto, uma convenção duradoura por frase, como uma frase simples. Cada uma mostra o projeto e o arquivo para onde iria (`AGENTS.md`, ou `CLAUDE.md` quando o projeto não tem `AGENTS.md`) e a nota de onde ela vem. Nada é escrito no seu projeto até você pressionar um botão:

- **Adicionar** acrescenta a frase no fim do arquivo, sob o título "## Learned conventions" (criado quando não existe), remove a nota de onde ela veio e informa "Adicionado ao AGENTS.md".
- **Dispensar** mantém o arquivo e a nota como estão, e a frase não é sugerida de novo.

A seção aparece enquanto houver alguma sugestão aguardando você, mesmo quando a última organização não alterou mais nada.

[Organizar agora](/settings?s=memory&find=Tidy%20up%20now), o botão na mesma linha, executa uma organização na hora, esteja **Organizar automaticamente** ativado ou não: "Organizando: isso leva um minuto ou dois". Ele precisa que a memória esteja ativada.

### Busca por significado

[Busca por significado](/settings?s=memory&find=Search%20by%20meaning), a primeira linha do grupo **O que os agentes recebem**, "encontra notas, o que você guarda e mais pelo significado e também pelas palavras, com um modelo que roda neste computador": o mDenseOn, da LightOn, que lê nove idiomas. Ela vem ativada, a menos que você a desative, então as notas e o que você guarda são encontrados por busca híbrida: pelas palavras e pelo significado, com as duas listas combinadas por posição. O modelo roda aqui, então suas notas não são enviadas a nenhum serviço para serem pesquisadas. Com ela desativada, as notas são encontradas só pelas palavras. Com ela ativada:

- Os agentes começam com as notas relacionadas ao seu pedido, mesmo quando as notas usam palavras diferentes das suas.
- Os agentes que consultam notas, e o campo de busca do grupo **Notas**, as encontram pelo significado e também pelas palavras.
- Uma nota que diz o mesmo que outra já guardada, com outras palavras, não é salva de novo, e a organização agrupa as notas por significado.
- A caixa de busca (Ctrl+K) encontra páginas, configurações, sessões, apps e os documentos, imagens e o resto que você guardou (pelos títulos e descrições) pelo significado, e as bases de conhecimento também são pesquisadas por significado (veja [Projetos e conhecimento](/guide/projects)).

**Como ela fica pronta**, uma única vez:

1. Um minuto depois de o app iniciar pela primeira vez, ele prepara um ambiente Python privado na pasta de dados dele, com o ONNX Runtime, o tokenizer da Hugging Face e o NumPy (cerca de 150 MB); se você a desativou, ele faz isso assim que você ativar **Busca por significado** de novo (a própria memória precisa estar ativada). A linha abaixo da linha principal mostra cada etapa, como "Making a private Python environment" e "Installing ONNX Runtime and the tokenizer". Um ambiente que uma versão antiga criou com PyTorch é removido antes, o que libera os gigabytes dele: "Removing the environment an older version made".
2. Depois, ele baixa o modelo, uma única vez: "Downloading the model: 120 of 340 MB, once". É o mDenseOn em 8 bits (algoprog/mDenseOn-ONNX no Hugging Face), com um quarto do tamanho do modelo completo, que encontra as mesmas notas. Cada arquivo é verificado antes de ser usado, e um download interrompido continua de onde parou na próxima vez.
3. Cada nota recebe o vetor dela (os números que a busca por significado compara) em segundo plano, e o mesmo vale para tudo o que você guarda. A linha conta as notas: "all 120 notes found by meaning", ou "80 of 120 notes found by meaning (the rest soon)".

**Desative-a** com a chave da linha: o modelo para, e tudo passa a ser encontrado só pelas palavras. Um computador com pouco espaço em disco ou pouca memória pode dispensá-la. Enquanto a memória está desativada para todas as sessões, a chave fica esmaecida.

**O que ele precisa**:

- Python 3.10 ou mais recente neste computador, a menos que a ferramenta uv esteja instalada, que traz o próprio Python. Se nenhum dos dois estiver presente, a preparação para e avisa, com instruções de como instalar o Python: no Debian ou Ubuntu `sudo apt install python3 python3-venv`, no Mac pelo python.org ou com o Homebrew (`brew install python`). No Mac, o Python da própria Apple só conta quando as ferramentas de desenvolvedor dele estão instaladas, então o app nunca pede que você as instale.
- Espaço em disco: cerca de 150 MB para o ambiente e 340 MB para o modelo. A preparação para com "Not enough disk space" quando há menos de cerca de 1 GB livre.
- Uma conexão com a internet, uma única vez, para os downloads.
- Memória livre para iniciar o modelo: cerca de 1,5 GB. Até haver o bastante, ele mostra "Waiting for memory" e as notas são encontradas pelas palavras.

**Como ele roda**: no processador do computador (a CPU), por meio do ONNX Runtime, em alguns dos núcleos. Ele só inicia quando necessário, usa cerca de 0,6 a 1 GB de memória enquanto roda e para depois de alguns minutos ocioso: "Starts when needed, and stops after a few idle minutes", e "Loaded" enquanto roda. Iniciar leva um ou dois segundos, e ele começa assim que você começa uma mensagem na página inicial (ou em uma sessão cujo agente parou), e pouco antes de uma tarefa agendada ser executada: as notas e habilidades de uma nova sessão também são então encontradas pelo significado. Uma sessão nunca espera o modelo carregar: uma que começa antes de ele estar pronto recebe as notas e habilidades pelas palavras. Ele deixa a placa de vídeo em paz, e um computador com 8 GB de memória é suficiente.

**Onde ele os guarda**: os vetores ficam no banco de dados do app, no seu disco. Para buscar mais rápido, o app também mantém na memória os que mais usa, dentro de um único orçamento que as notas e as bases de conhecimento compartilham: no máximo um 64º da memória do computador (ou do limite de memória de um contêiner, quando for menor), nunca mais de 512 MB, e nunca mais de um oitavo da memória livre no momento. Quando a memória fica curta, ele não mantém nenhum: o que mantinha é liberado em até meio minuto, e cada busca lê os vetores do disco conforme avança, um pouco mais devagar. O que foi usado há mais tempo sai primeiro. As conversas passadas e os registros dos apps são sempre lidos do disco, e a caixa de busca (Ctrl+K) mantém apenas os vetores do que existe agora.

Quando algo dá errado, a linha de status vira um aviso com o motivo (por exemplo "The model took too long to load") e um botão **Tentar de novo**. Desativar a chave para o modelo; o que foi preparado permanece, então ativá-la de novo é rápido.

### Notas com que cada agente começa

[Notas com que cada agente começa](/settings?s=memory&find=Notes%20each%20agent%20starts%20with), no grupo **O que os agentes recebem**, define quantas notas e assuntos sobre você e o projeto, no máximo, um agente recebe ao começar, além do seu perfil: **5**, **10** (o usual), **20** ou **40**, escolhidos nos botões da linha. A dica diz "Além do seu perfil: as que se relacionam com o que você pede", e o **(i)** diz: "No máximo este número das notas sobre você e o projeto que se relacionam com o que você pede, encontradas pelas palavras e, com a busca por significado ativada, pelo significado, e os títulos das demais, que os agentes consultam quando precisam. Um lugar com poucas notas é entregue por inteiro." Mais notas deixam entrar desde o começo mais do que se relaciona com um pedido, ao custo de mais para ler em cada sessão; menos mantém curto o que eles recebem ao começar. As notas da própria sessão vêm além dessas. Veja [Com o que um agente começa](/guide/memory#what-an-agent-starts-with).

A linha abaixo, [Tamanho do perfil](/settings?s=memory&find=Profile%20length), define quantas palavras o seu perfil pode ter (veja [Seu perfil](/guide/memory#your-profile)).

### Exportar suas notas

[Exportar](/settings?s=memory&find=Export), no grupo **Seus dados**, baixa todas as notas guardadas. **Markdown** ("Uma lista para ler") é uma lista legível agrupada por local, com quando cada nota foi adicionada e alterada e a data final dela. **JSON** ("Com históricos") traz cada nota com o histórico dela e, para assuntos e perfis, as notas que eles resumem. As notas excluídas não são incluídas.

### Trazer de outros assistentes

[Trazer de outros assistentes…](/settings?s=memory&find=Bring%20in%E2%80%A6), a primeira linha do grupo **Seus dados** (“O que o Claude Code, o Codex, o ChatGPT e outros sabem sobre você, e suas habilidades”; ou o botão **Trazer de outros assistentes** no grupo **Notas** enquanto a memória não tem nenhuma nota), traz para a memória o que outros agentes neste computador sabem sobre você e seus projetos, como notas que você escolhe. Nada é adicionado até você fazer isso.

1. Em **Neste computador**, marque o que ler. O Hydor encontra o que cada um guarda e mostra quantos arquivos de memória cada um tem:
   - **Claude Code**: a memória que ele guarda para cada projeto e o seu CLAUDE.md para todos os projetos (também os das contas no Hydor).
   - **Codex**: suas memórias e o seu AGENTS.md.
   - **Outros agentes**: alguns outros agentes guardam arquivos de memória sobre você (o que sabem sobre você e seu trabalho), e alguns guardam as instruções que você deu a eles para cada pasta. O Hydor lê esses arquivos, para saber como você gosta de trabalhar. Ele nunca lê as credenciais de login, as chaves nem as configurações deles. Quando um agente guarda a memória em um armazenamento que está em uso, o Hydor lê uma cópia, para que esse agente possa continuar funcionando enquanto isso.
2. Em **De uma exportação**, **Adicionar uma exportação** aceita o .zip que o ChatGPT ou o Claude enviam por e-mail quando você pede seus dados (no ChatGPT, Configurações → Controles de dados → Exportar dados; no Claude, Configurações → Privacidade → Exportar dados), ou o conversations.json que está dentro dele. Ele mostra o que o arquivo contém: a memória do Claude ou as instruções personalizadas do ChatGPT, e quantas conversas, de quando a quando. Das conversas, só é lido o que você escreveu, das mais recentes para as mais antigas: não as respostas, nem os arquivos que você anexou.
3. Clique em **Começar a ler**. O [modelo auxiliar](/settings?s=models&find=Helper%20model) lê uma parte de cada vez, junto com as notas que a memória já tem, e guarda só o que vai durar. Ele deixa de fora o que a memória já diz (mesmo com outras palavras), segredos e textos escritos para orientar agentes. Uma memória grande leva alguns minutos: você pode fechar a janela enquanto isso, e **Parar** interrompe a leitura.
4. Desmarque o que você não quer guardar. As notas vêm agrupadas: primeiro **Sobre você**, depois cada projeto por sua pasta, quando o que foi lido é sobre um projeto cuja pasta está neste computador. **Adicionar ao seu perfil** lista as linhas que seriam adicionadas ao [seu perfil](/guide/memory#your-profile). Clique em **Adicionar N notas**; **Descartar** descarta todas.

As habilidades vêm sozinhas, sem o modelo auxiliar. Em **Habilidades que você criou lá**, o Hydor lista as habilidades que encontra em outros agentes neste computador (todos os perfis e espaços de trabalho que eles têm, incluindo as habilidades compartilhadas e as aprendidas), cada uma com seu nome, para que serve, de onde vem e quantos arquivos tem. Todas usam o mesmo formato das habilidades daqui: uma pasta com um SKILL.md. Esta lista é a prévia: desmarque o que você não quer e clique em **Copiar N habilidades**, e cada uma vai para as suas habilidades, com seus arquivos (veja [De onde vêm as habilidades](/guide/skills#where-skills-come-from)). Algumas aparecem em **N não oferecidas**, com o motivo: as habilidades que um agente já traz de fábrica são dele, não suas; uma habilidade cujo nome já está entre as suas (nativa, sua ou de um plugin) nunca é substituída; e uma habilidade sem descrição, com mais de 20.000 caracteres, ou com uma chave dentro é deixada de fora. Arquivos que guardam chaves ou credenciais de login (arquivos .env, chaves privadas, arquivos chamados credentials, secrets ou tokens, e arquivos com uma chave dentro) nunca são copiados, e a pasta de uma habilidade é copiada até 200 arquivos, 512 KB cada e 2 MB no total: **N arquivos deixados de fora** diz o que ficou para trás. Servidores MCP (servidores de ferramentas) não são trazidos: adicione-os em [Configurações → Servidores MCP](/settings?s=mcp) e coloque no cofre qualquer chave de que eles precisem.

Uma nota trazida de fora diz isso no seu histórico: “Trazida do Claude Code”. Nada muda nos outros assistentes, e uma exportação que você adicionou é excluída assim que as notas dela são adicionadas. Com o modelo auxiliar em **Automático**, o Claude Haiku faz a leitura, pelo seu plano do Claude Code.

### Limpar tudo…

[Limpar tudo…](/settings?s=memory&find=Clear%20all%E2%80%A6), a última linha do grupo **Seus dados** (**Limpar toda a memória**), exclui todas as notas e o histórico delas, e o seu perfil junto. Ele pergunta antes: “Limpar toda a memória? Todas as notas sobre você, seus projetos e suas sessões serão excluídas, com o histórico. Isso não pode ser desfeito; exporte antes para guardar uma cópia.” Clique em **Limpar tudo** para continuar. O botão fica desativado quando não há notas (contadas sem o seu perfil).

## Buscar em sessões anteriores

Além das notas, os agentes podem consultar suas conversas passadas, com qualquer agente. Pergunte “O que decidimos sobre o local do evento no mês passado?” e o agente busca o que você e os agentes escreveram em todas as sessões pelas palavras (todas precisam coincidir) e, com a [busca por significado](/guide/memory#search-by-meaning) ativada, o que você pediu em cada sessão pelo sentido, de modo que uma pergunta com outras palavras também encontra; também os comandos executados e os arquivos alterados, quando precisa. Cada mensagem que você escreve recebe seu vetor em segundo plano, algumas por vez, das mais recentes para as mais antigas: apenas as suas palavras, não os arquivos que você anexou nem os textos que você colou. Depois ele lê a sessão que contém a resposta: suas mensagens e os títulos das etapas realizadas, das mais antigas para as mais recentes.

Sessões com a memória desativada ficam de fora dessa busca e não podem ser lidas a partir de outra sessão. Essas ferramentas só existem enquanto a memória está ativada na sessão em que o agente trabalha.

Por padrão, a busca abrange as sessões de todos os projetos. Peça a um agente para se limitar a um (“só neste projeto” ou “só na Loja”) e a busca dele recebe um projeto: **this** (as sessões deste projeto), **all** (todos os projetos, o padrão) ou o nome de um projeto. Quando uma busca vai além do projeto em que o agente trabalha, cada resultado informa de qual projeto ele vem.

## Buscar além de um projeto

Às vezes o que um agente precisa foi guardado ou feito em outro projeto: “Como configuramos os deploys no meu projeto Loja?” Para isso, os agentes têm uma busca que procura em tudo o que a memória guarda de uma só vez: notas, artigos da wiki, documentos e conversas passadas. Ela procura no projeto em que o agente trabalha, em todos os seus projetos ou em um projeto pelo nome (o nome dele na Barra lateral, o nome da pasta ou o nome do repositório). Ela nunca procura se o agente não pedir: nada dos seus outros projetos é adicionado ao que um agente recebe no início ou junto com uma mensagem.

Cada resultado diz de onde vem e como abri-lo: um artigo abre com a ferramenta de wiki, um documento com a ferramenta de conhecimento, cada uma informando em qual projeto ele está, e uma conversa passada com a sua chave. O que os outros projetos guardam só é lido: um agente nunca altera, a partir daqui, as notas, a wiki, os documentos ou as conversas de outro projeto.

Ficam sempre de fora da busca:

- A conversa em que o agente está e as sessões com a memória desativada.
- Um projeto que mantém seus dados só para si. Cada projeto tem uma chave, **Pesquisável a partir de outros projetos**, na aba **Configurações** dele (veja [Configurações](/guide/projects#settings)): ativada, os agentes dos seus outros projetos podem encontrar e ler as notas, a wiki, os documentos e as conversas dele quando procuram; desativada, não podem, e os agentes do próprio projeto ainda podem consultar os seus outros projetos. Pedir um projeto assim pelo nome informa que ele mantém seus dados só para si.
- A wiki de um projeto com a memória wiki desativada (veja [Memória wiki](/guide/wiki-memory)).

Uma sessão fora de qualquer projeto busca em todos os projetos quando não diz qual. As notas sobre você são buscadas uma única vez, sejam quais forem os projetos pesquisados.

Você mesmo pode buscar em sessões anteriores com a caixa de busca (Ctrl+K, ou ⌘K no Mac). Ela encontra sessões pelo título, mensagens que contêm as suas palavras e notas de memória, em **Memória**. Abrir uma nota “Abre Configurações → Memória, nessa nota”.

## Pergunte a um agente

- “O que você lembra sobre mim? Exclua tudo sobre meu emprego antigo.”
- “O que já tentamos para consultas longas?”
- “Registre que a ideia do currículo não ajudou, junto com as execuções.”
- “Adicione ao meu perfil que sou enfermeira e gosto de respostas em tópicos.”
- “Mostre meu perfil e reduza para umas 300 palavras.”
- “Comece toda sessão com 20 notas em vez de 10.”
- “Mantenha a busca por significado na CPU, para a placa de vídeo ficar livre.”
- “Organize a memória agora e depois me diga o que você mesclou e o que moveu para um projeto.”
- “Quais notas estão sinalizadas porque o código mudou? Confira com o código.”
- “O que a organização sugere para o AGENTS.md? Mostre e adicione a primeira sugestão.”
- “Quais notas foram dadas aos agentes várias vezes, mas nunca foram necessárias?”
- “Essa nota sobre o comando de build é sobre o projeto Hydor, não sobre mim: mova para lá.”
- “Comece toda sessão com menos notas: só as 5 que têm a ver com o que eu pedir.”
- “Desative a memória wiki no projeto Impostos 2026 e mantenha ativada nos outros.”
- “Busque em todos os meus projetos como configuramos o fluxo de lançamento.”
- “Como lidamos com os deploys no meu projeto Loja? Procure na wiki e nas conversas dele.”
- “Quais das minhas conversas passadas neste projeto mencionam o modelo de nota fiscal? Deixe os outros projetos de fora.”
- “Quais notas nenhum agente precisou nos últimos meses? Exclua as do site antigo.”
- “A nota sobre minha viagem a Lisboa só vale até 12 de maio: coloque essa data de término.”
- “Quais notas deste projeto ainda não foram verificadas? Confira com o código.”
- “Pare de aprender com as conversas, mas mantenha a organização.”
- “Desative a memória na sessão chamada Declaração de imposto.”
- “Traga o que o Claude Code e o Codex lembram sobre mim e me mostre as notas antes de adicionar.”
- “Eu usava outro agente antes: traga o que ele sabe sobre mim e as habilidades que criei, e me mostre a lista primeiro.”
