# Arquivos, Git, Terminal e Prévia

**Arquivos**, **Git** e **Sistema** na barra de ícones são a sua porta de entrada para este computador: explore, encontre, abra e edite seus arquivos, adicione-os a projetos e a novas sessões, pesquise dentro deles, execute notebooks Jupyter, faça commit e push com o Git, abra pull requests e revise o que um branch altera. Terminais, prévias dos apps web em execução aqui, capturas de tela de antes e depois das mudanças de um agente em um deles, e uma visão ao vivo de como o computador está (Monitor) também ficam aqui, para você conferir e concluir o trabalho de um agente sem sair do app.

![A página Git: as mudanças de um repositório ao lado do diff de um arquivo, a caixa de commit e Sync](images/files-git.webp)

## Abrir o Sistema

Clique em **Sistema** na barra de ícones, ou vá para [Sistema](/system). Uma linha de abas sob o título leva a cada parte, e cada uma tem seu próprio endereço:

- **Visão geral** ([abrir](/system)): o computador de relance, e o que as ferramentas dele guardam agora (veja [A visão geral](#the-overview)).
- **Terminal** ([abrir](/terminal)): shells neste computador (veja [Usar o terminal](#use-the-terminal)).
- **Prévia** ([abrir](/preview)): os apps web em execução aqui (veja [Olhar um servidor de desenvolvimento com a Prévia](#look-at-a-dev-server-with-preview)). Ela só aparece nas páginas desta própria máquina, não enquanto você olha outra máquina.
- **Monitor** ([abrir](/system/monitor)): o quanto o computador está ocupado (veja [Acompanhar este computador no Monitor](#watch-this-computer-in-monitor)).

No celular, o título mostra a parte em que você está (**Sistema / Monitor**): toque nele para ver todas as partes do Sistema, quatro por linha, e toque em uma para ir até ela. Os botões de cada aba (como o de atualizar, na Prévia) ficam à direita do título.

**Arquivos** e **Git** não ficam dentro de Sistema: cada um tem seu próprio ícone na barra de ícones (no celular, entre as ferramentas da gaveta). Clique nele, ou vá para [Arquivos](/files) (veja [Abrir a página Arquivos](#open-the-files-page)) ou [Git](/git) (veja [Ver seus repositórios na página Git](#see-your-repositories-on-the-git-page)). Os Experimentos também têm um ícone próprio (veja [Experimentos](/guide/experiments)).

## A visão geral

**Visão geral** mostra, no alto, o nome do computador, o sistema e há quanto tempo ele está ligado, com quatro medidores: **Processador**, **Memória**, **Disco** (o disco principal, com o espaço livre) e **Gráficos** (quando há placas gráficas NVIDIA). Um medidor fica vermelho conforme se aproxima do limite. Clique neles para abrir o **Monitor**.

Abaixo, um cartão para cada ferramenta; o título dele, ou **Abrir**, abre a aba correspondente:

- **Terminal**: os shells em execução, e **Nova** para abrir outro.
- **Prévia**: os apps web em execução aqui, cada um com sua porta. Clique em um para vê-lo.

## Abrir a página Arquivos

Clique em **Arquivos** na barra de ícones, ou vá para [Arquivos](/files). Em um computador, a página tem duas partes:

- À esquerda, os **lugares**: os arquivos que você abriu recentemente, sua pasta pessoal, as pastas que você fixou, as pastas dos seus projetos, as pastas em que as sessões trabalharam e a lixeira (veja [Lugares](/guide/files-git#places)).
- À direita, a pasta em que você está, com o que há nela (veja [Explorar uma pasta](/guide/files-git#browse-a-folder)). Os arquivos que você abre também aparecem ali, cada um em uma aba: a primeira aba volta para a pasta.

Em uma janela pequena, os lugares se recolhem em um botão à direita do título: ele mostra o nome da pasta em que você está, e um clique nele lista os lugares.

No celular, a pasta ocupa a tela toda. O nome dela, no alto à direita, abre os lugares, a partir da parte de baixo da tela; **‹** com o nome da pasta acima, sob o título, sobe uma pasta, e o **Voltar** do celular vai para a pasta em que você estava antes. Um arquivo abre em uma página própria, com **Voltar**.

Outras formas de chegar:

- Clique na pasta sob o título de uma sessão, ou use o menu da sessão (⋯) → **Pasta e código** → **Explorar a pasta**: Arquivos abre nessa pasta.
- Um arquivo que um agente alterou ou entregou a você, ou um link para um arquivo na resposta dele, abre em uma janela sobre a conversa, para você não perder o ponto em que estava. **Abrir em Arquivos** o leva para a página Arquivos; **Tela cheia** (o ícone de setas) faz a janela ocupar o app inteiro, e **Sair da tela cheia** a devolve ao tamanho de antes (o próximo arquivo abre do jeito que você deixou o último, neste navegador); ✕ ou Esc fecha a janela (se você alterou o arquivo sem salvar, ela pergunta antes “Descartar suas alterações?”). O caminho do arquivo aparece acima dele, como na página Arquivos; uma pasta nele abre na mesma janela, com o arquivo selecionado ali (ela pergunta antes sobre alterações não salvas), e **‹** no alto da janela volta para o arquivo. Veja [Documentos que ele criou ou alterou](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply).
- A aba **Arquivos** de um projeto mostra as pastas do próprio projeto (veja [Projetos e conhecimento](/guide/projects)).

## Lugares

- **Ir para uma pasta**: encontre uma pasta pelo nome, ou digite o caminho dela (`~/code/shop`); os projetos e as pastas fixadas vêm primeiro. Tab, ou a seta no fim de uma linha, lista as pastas dentro de uma.
- **Arquivos recentes**: os arquivos que você abriu recentemente neste navegador, o último primeiro, cada um com sua pasta. Os que não existem mais avisam isso; **Limpar os que já se foram** os tira da lista.
- **Pasta pessoal**: a sua própria pasta, onde ficam seus arquivos. A pasta em que as novas sessões começam aparece abaixo dela quando não é a sua pasta pessoal.
- **Fixados**: as pastas que você fixou, as mesmas em todos os dispositivos. Para fixar uma, use o menu dela ou o ⋯ da pasta → **Fixar em Locais**; para desafixá-la, aponte para ela e clique em ✕, ou use **Desafixar de Locais**.
- **Projetos**: a pasta própria de cada projeto.
- **Sessões trabalhadas em**: as pastas em que as sessões trabalharam recentemente.
- **Lixeira**: o que você excluiu (veja [Excluir e restaurar](/guide/files-git#delete-and-put-back)).

Em um computador, solte arquivos ou linhas sobre uma pasta entre os lugares para colocá-los ali.

## Explorar uma pasta

A barra acima da pasta tem, da esquerda para a direita:

- **A pasta acima** (a seta para cima).
- O caminho da pasta, em etapas: uma casa para a sua pasta pessoal, depois **code › shop**; uma pasta fora da sua pasta pessoal começa em **Computador** (`/`). Clique em uma etapa para ir até ela, ou solte linhas sobre ela para movê-las para lá. Um caminho longo recolhe o meio em **…**, que lista as pastas intermediárias. A última etapa, ou a setinha ao lado dela, abre **Ir para uma pasta**.
- **Buscar em** *a pasta*: reduz a lista aos nomes que contêm o que você digita, conforme você digita. Enter, ou a linha **Pesquisar tudo em … por "…", inclusive dentro dos arquivos** no alto da lista, pesquisa todas as pastas abaixo desta, nomes de arquivos e o que há dentro deles (veja [Pesquisar arquivos](/guide/files-git#search-files)).
- **Enviar**: envia arquivos para a pasta em que você está (veja [Enviar arquivos e pastas](#upload-files-and-folders)). A seta dele (**Mais formas de enviar**) tem **Enviar arquivos** e **Enviar uma pasta**.
- **Nova**: **Nova pasta**, **Novo arquivo**, **Novo notebook**, **Enviar arquivos** e **Enviar uma pasta**. Na aba **Arquivos** de um projeto, ela também cria o que o app cria, dentro do projeto (veja [Arquivos](/guide/projects#files)).
- **Como lista** ou **Como blocos, com imagens**: o botão que alterna entre as duas formas de mostrar uma pasta. As pastas aparecem como blocos no início, até você escolher a lista; o navegador guarda a sua escolha.
- **Mais** (⋯): **Ordenar por** (**Nome**, **Data de alteração**, **Tamanho** ou **Tipo**, e **Ordem inversa**), **Mostrar arquivos ocultos**, **Fixar em Locais**, **Nova sessão nesta pasta**, **Abrir um terminal aqui**, **Copiar caminho**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para desktop; veja [Trabalhar com arquivos e pastas](/guide/files-git#work-with-files-and-folders)), **Baixar como .zip** e **Atualizar**.

Os **blocos** são a forma como as pastas aparecem no início. Cada bloco tem uma imagem do arquivo no alto (4:3), uma pequena etiqueta com o tipo dele para documentos e similares (PDF, Word, Sheet, CSV, Slides, Notebook, LaTeX, HTML, Markdown, JSON, E-book, Archive, SVG, GIF, Video, Audio), o nome e quando mudou (“Alterado há 2 h”), e um ⋯ que aparece quando você aponta para ele. Uma pasta é um bloco de pasta. A imagem é:

- para imagens, a própria imagem; para vídeos, um quadro;
- para PDFs, a primeira página; para arquivos Word, PowerPoint, Excel e OpenDocument, a primeira página, o primeiro slide ou as primeiras células (ou a imagem que o arquivo carrega);
- para arquivos HTML e notebooks Jupyter, a aparência deles quando abertos;
- para arquivos de texto, Markdown, código, CSV e JSON, as primeiras linhas em um bloco que parece papel;
- para qualquer outra coisa, o ícone do tipo dela.

O app desenha essas imagens neste computador com o que tem: ffmpeg para vídeos e imagens, poppler para PDFs, o próprio navegador para documentos e páginas, e o Quick Look em um Mac. Um arquivo que ele não consegue desenhar (um tipo que não conhece, sem ferramenta para isso aqui, um arquivo grande demais ou um que deu erro) mostra o ícone do tipo dele, ou as primeiras linhas. As imagens ficam guardadas por 30 dias na pasta de dados do app, então uma pasta a que você volta as mostra na hora; um arquivo que mudou ganha uma nova.

**A lista** coloca as pastas primeiro. Nela, as imagens mostram uma miniatura no lugar do ícone. Para cada item, ela mostra o nome, quando mudou (“agora mesmo”, “há 5 min”, a hora, se for hoje, “Ontem”, ou a data) e o tamanho. Clique no título de uma coluna para ordenar por ela, e de novo para inverter a ordem. Em uma janela estreita, a barra mantém o campo atrás de um botão de busca, e **Como lista** e **Como blocos, com imagens** passam para **Mais**; as colunas de data e tamanho cedem espaço aos nomes.

- Clique em uma pasta para entrar nela, ou na seta dela para abri-la no lugar, como em uma árvore; a pasta lembra quais das suas pastas estavam abertas.
- Clique em um arquivo para abri-lo.
- A linha no final conta as pastas e os arquivos e soma o tamanho deles.
- A lista é atualizada a cada 5 segundos enquanto você a olha, então os arquivos que os agentes criam aparecem sozinhos.

No celular, cada linha mostra o tamanho e a data sob o nome; o botão de busca abre o campo, **Mais** também tem **Como lista**, **Como blocos, com imagens** e **Selecionar vários**, e o botão **+** no canto inferior direito adiciona uma pasta, um arquivo ou envia arquivos.

Cada pasta tem um endereço próprio, então o Voltar do navegador vai para a pasta em que você estava. A pasta exibida também é a que outras partes do app querem dizer com “a pasta aberta em Arquivos”. Ela fica guardada neste navegador, separadamente para cada máquina que você usa (veja [Outras máquinas](/guide/devices#use-other-machines-from-one-app)).

### O que significam as letras ao lado dos arquivos

Dentro de um repositório git (uma pasta cujo histórico o git guarda), os arquivos com mudanças desde o último commit têm uma letra e uma cor:

- **M**: alterado.
- **A**: novo, e já adicionado ao git.
- **U**: novo, e ainda não está no git.
- **D**: excluído.
- **R**: renomeado.
- **C**: um conflito a resolver.
- **•** em uma pasta: algo dentro dela mudou.

## Trabalhar com arquivos e pastas

Cada linha tem um menu. Aponte para a linha e clique em **Mais** (⋯) no fim dela, ou clique com o botão direito; no celular, toque no ⋯ dela. Ele contém:

- **Abrir**.
- **Editar a imagem** ou **Editar o vídeo** (uma imagem ou um vídeo): ela abre no editor de imagens ou de vídeos, em que **Salvar** grava por cima do arquivo (a versão antiga vai para a Lixeira) e **Salvar uma cópia** coloca “nome (edited)” ao lado dele (veja [Editar imagens e vídeos](/guide/library#edit-pictures-and-videos)).
- **Começar uma sessão com ele** (um arquivo; veja [Começar uma sessão com arquivos](/guide/files-git#start-a-session-with-files)), ou **Nova sessão nesta pasta** (uma pasta: a página inicial, com essa pasta já selecionada).
- **Adicionar a um projeto** (veja [Adicionar arquivos a um projeto](/guide/files-git#add-files-to-a-project)).
- **Fixar em Locais** ou **Desafixar de Locais** (uma pasta).
- **Renomear** (F2), **Duplicar**, **Mover para** e **Copiar para**.
- **Abrir um terminal aqui** (uma pasta): um novo shell nessa pasta, no painel inferior no computador ou na página do Terminal no celular.
- **Copiar caminho**: o caminho completo, para colar onde quiser.
- **Mostrar no Finder** (Mac), **Mostrar no Explorador de Arquivos** (Windows) ou **Mostrar na pasta** (Linux): no app para computador, para um arquivo ou uma pasta deste computador, abre o gerenciador de arquivos do próprio sistema com o item selecionado. O nome indica qual deles o seu sistema tem. Não existe no app web, nem para os arquivos de outra máquina.
- **Baixar**, ou **Baixar como .zip** para uma pasta.
- **Excluir** (a tecla Delete).

### Selecionar vários

Para agir em várias coisas de uma vez, selecione-as:

- No computador, clique na caixa no início de uma linha (ela aparece quando você aponta para a linha), use Ctrl+clique (⌘+clique no Mac) para adicionar uma, Shift+clique para selecionar tudo a partir da última selecionada, ou pressione Ctrl+A para selecionar todas.
- No celular, mantenha uma linha pressionada e toque nas outras; ou **Mais** → **Selecionar vários**.

A barra então mostra quantas estão selecionadas, com **Começar uma sessão**, **Adicionar a um projeto**, **Mover para**, **Excluir** e **Mais** (⋯) para o resto do menu: **Copiar para**, **Copiar caminhos**, **Baixar como .zip** e assim por diante. ✕ (ou Esc) desfaz toda a seleção.

### Usar o teclado

Com a lista em uso (clique nela primeiro), no computador:

| Teclas | O que fazem |
| --- | --- |
| ↑ ↓ | Ir para a linha acima ou abaixo (com Shift, vai selecionando) |
| → ← | Abrir ou fechar uma pasta no próprio lugar; em blocos, o bloco ao lado |
| Enter | Abrir |
| Espaço | Selecionar ou desmarcar |
| Backspace | A pasta acima |
| Delete | Excluir |
| F2 | Renomear |
| Ctrl+A | Selecionar tudo |
| Esc | Desmarcar tudo e, depois, esvaziar o campo |

Digitar uma letra inicia **Find in** com ela.

### Criar um arquivo ou uma pasta

1. Clique em **Nova** → **Nova pasta**, **Novo arquivo** ou **Novo notebook** (no celular, o botão **+**).
2. Digite o nome no campo que aparece na lista e pressione Enter. Esc cancela.

Um arquivo novo está vazio e abre no editor imediatamente. Um novo notebook se chama `Untitled.ipynb` (`Untitled 2.ipynb` quando esse nome já existe) até você digitar outro nome; ele começa com uma célula de código vazia e abre como notebook. Um arquivo novo cujo nome termina em `.ipynb` também começa como um notebook vazio. Se o nome já existir, o app avisa e não cria nada.

### Renomear ou mover

- **Renomear** transforma o nome em um campo. Enter mantém o novo nome, Esc o deixa como estava.
- **Mover para** lista primeiro os seus projetos e as pastas fixadas, depois as pastas usadas recentemente, com um campo para encontrar qualquer pasta pelo nome ou digitar o caminho dela. Escolha uma, e o arquivo ou a pasta vai para lá. Uma mensagem diz para onde foi, com **Desfazer**.
- No computador, arraste linhas para uma pasta (na lista, em uma etapa do caminho ou entre os locais) para movê-las para lá; arquivos selecionados juntos se movem juntos. Mantenha Alt (Option no Mac) pressionado ao soltar para copiar em vez de mover.

Uma pasta não pode ir para dentro dela mesma, e mover não substitui nada: se o destino já tiver algo com esse nome, a movimentação é interrompida.

### Duplicar e copiar

- **Duplicar** cria uma cópia ao lado, com o nome seguido de “copy” (`report copy.pdf`, depois `report copy 2.pdf`).
- **Copiar para** copia para outra pasta, escolhida como em **Mover para**. Se o nome já existir lá, a cópia recebe um nome da mesma forma. **Mostrar** na mensagem abre essa pasta.

### Excluir e restaurar

**Excluir** move o arquivo, ou a pasta com tudo o que há nela, para a lixeira na hora, e uma mensagem avisa com **Desfazer**. Nada se perde até você esvaziar a lixeira.

**Lixeira**, entre os locais, lista o que você excluiu, o mais recente primeiro: cada item com o lugar onde estava, quando saiu e o tamanho.

- **Restaurar** devolve o item ao lugar onde estava. Se outra coisa ocupou o lugar desde então, ele volta ao lado, com “copy” depois do nome. Itens excluídos antes de o app guardar de onde vieram pedem uma pasta.
- O **Mais** (⋯) dele tem **Colocar em outra pasta** e **Excluir para sempre**.
- **Esvaziar a lixeira** exclui tudo o que há nela para sempre, depois que você confirmar.

A lixeira é uma pasta dentro da pasta de dados do app (por exemplo `~/.hydor/trash`); a página dela mostra onde fica. Sua pasta pessoal e a pasta raiz (`/`) não podem ser excluídas. Algo que esteja em outro disco, diferente da pasta de dados do app, não pode ir para a lixeira: o app pergunta antes “Delete … for good?”.

### Baixar

Um arquivo é baixado como ele mesmo. Uma pasta, ou várias coisas selecionadas juntas, são baixadas como um único arquivo .zip, criado durante o download. Um .zip deixa de fora as pastas `.git` e `node_modules`, e comporta até 4 GB e 65.000 arquivos.

## Adicionar arquivos a um projeto

Um projeto guarda os arquivos dele em sua pasta e pode trabalhar com outras pastas suas onde elas estão (veja [Projetos e conhecimento](/guide/projects)). Para adicionar a um projeto:

1. Abra o menu de um arquivo ou de uma pasta (ou selecione vários) e clique em **Adicionar a um projeto**.
2. Escolha o projeto, ou **Novo projeto** para criar um para eles primeiro.

Um arquivo é copiado para o início da pasta do projeto, ou para uma pasta que você escolher dentro dela. Uma pasta não é copiada: ela passa a fazer parte das pastas com que o projeto trabalha, onde está. Uma mensagem diz o que foi adicionado, com **Mostrar**, que abre a aba **Arquivos** do projeto. O que já estiver no projeto permanece como está.

**Adicionar a um projeto** também está no **Mais** (⋯) de um arquivo no editor, na janela em que um arquivo abre sobre uma sessão, nos cartões de arquivos que um agente entregou a você e nas imagens que um agente criou.

As sessões que você começar no projeto encontram então os arquivos lá: cada uma é informada do que a pasta do projeto contém e com quais outras pastas ele trabalha.

**Escolha uma pasta dentro do projeto.** Um clique em um projeto coloca a coisa no início da pasta dele. Um projeto cuja pasta tem pastas mostra também um botão de pasta no fim da linha dele (**Escolher uma pasta dentro dela**). Ele lista essas pastas: clique em uma para colocar a coisa lá, ou no › dela (**Mostrar as pastas dentro dela**) para entrar. A primeira linha, **Início de** *o projeto* (**Esta pasta** depois que você entra em uma), escolhe a pasta em que você está, e a linha de cima volta. A mesma escolha está em **Manter** (no menu **Manter em**), **Manter uma cópia**, **Mover para um projeto** e **Mover para outro projeto**, no menu **Salvar** (▾) do Navegador e no projeto da janela **Nova**. Escolher uma pasta no projeto em que a coisa já está leva o arquivo dela para lá. A mensagem então diz o nome da pasta ("notes.pdf adicionado a drafts", "Movido para drafts").

## O que você guarda também são arquivos

O que você ou um agente guarda em um projeto (veja [Guardar uma página](/guide/library#keep-a-page)) também tem um arquivo próprio na pasta do projeto, com o nome do título. Assim ele aparece em **Arquivos**, no Finder ou no Explorador de Arquivos e para os agentes que trabalham naquela pasta. O Hydor escreve o arquivo de novo depois de cada salvamento, seu ou de um agente.

- Um documento é um arquivo do Word (.docx), uma planilha um arquivo do Excel (.xlsx), um notebook um arquivo .ipynb e um diagrama um arquivo do draw.io (.drawio).
- Slides feitos para a web, o tipo comum, são uma página da web (.html); slides feitos compatíveis com o PowerPoint são um arquivo do PowerPoint (.pptx).
- Uma página, um design ou uma página da web salva é um arquivo .html.
- Um documento LaTeX é um arquivo .tex ou, quando tem imagens ou outros arquivos, uma pasta com o nome dele.
- Uma imagem, um vídeo ou um som é um arquivo do próprio tipo.

Isso vale também para o que os agentes salvam nas sessões de um projeto. Painéis não têm arquivo, porque os cartões deles são ao vivo, e nada do que uma sessão marcada como **Confidencial** guardou vai para a pasta. O que você guardou em um projeto antes de o Hydor fazer isso ganha o arquivo pouco depois de o Hydor iniciar. Um agente pode dizer em qual pasta dentro do projeto um arquivo deve ficar, e um que trabalha em uma pasta dessas salva ali. Os agentes são orientados a mudar uma coisa guardada com as ferramentas que a salvam, em vez de editar o arquivo.

**Abrir uma.** Em **Arquivos** e na aba **Arquivos** de um projeto, o arquivo tem um selo dizendo o que é (**Documento**, **Slides**, **Imagem**…). Um clique o abre no editor do Hydor, ou na página própria da imagem, do vídeo ou do som, com as versões, os comentários e o compartilhamento. O menu ⋯ dele é o de um arquivo (veja [Trabalhar com arquivos e pastas](/guide/files-git#work-with-files-and-folders)); o que pertence à coisa em si, como compartilhá-la, exportá-la ou movê-la para **Nenhum projeto**, está na página que abre. Um documento LaTeX que é uma pasta tem o selo **LaTeX**: um clique abre a pasta, e o main.tex dentro dela abre o documento no editor do Hydor.

**Mudanças feitas fora do Hydor.** Quando você, outro programa (como o Word) ou o script de um agente muda o arquivo, a mudança volta como uma versão nova, que as versões da coisa mostram como **alterado no arquivo**. Uma imagem, um vídeo ou um som mantém a versão anterior entre as **Versões anteriores**.

- Se você também a mudou no Hydor nesse meio tempo, as duas ficam como versões, e a do Hydor continua sendo a atual.
- Antes de o Hydor escrever por cima de um arquivo mudado fora, uma cópia dele vai para a Lixeira.
- Um arquivo que o Hydor não consegue ler de volta (o .html de slides feitos para a web, ou um arquivo danificado), ou o arquivo de uma página bloqueada, é guardado ao lado como "*nome* (changed outside Hydor)", e um arquivo novo é escrito.
- Um arquivo excluído fora do Hydor é escrito de novo na próxima mudança da coisa. Renomeá-lo ou movê-lo fora do Hydor conta como excluí-lo: o arquivo que você moveu fica como um arquivo comum.

**Renomear, mover e excluir.** O vínculo acompanha o arquivo:

- Renomeie ou mova o arquivo nos **Arquivos** do Hydor e ele continua vinculado. Quando o título da coisa muda, o Hydor renomeia o arquivo também, a menos que você o tenha renomeado. Uma extensão nova (de .docx para .txt, por exemplo) o torna um arquivo comum, e a coisa ganha um novo na próxima mudança.
- Mova o arquivo para a pasta de outro projeto e a coisa passa para esse projeto. Tire-o das pastas de todos os projetos e a coisa sai do projeto dela.
- Exclua o arquivo em **Arquivos** e a coisa sai do projeto. A coisa em si continua, e a caixa de busca a encontra.
- Se você excluir a coisa no Hydor, ou movê-la para **Nenhum projeto**, o arquivo dela vai para a Lixeira. Se movê-la para outro projeto, o arquivo passa para a pasta desse projeto.
- Se você excluir o projeto, os arquivos ficam onde estão, como arquivos comuns.

**Uma imagem que você já tinha.** Quando você guarda uma imagem, um vídeo ou um som a partir de um arquivo que já está na pasta do projeto, esse arquivo é usado como o dele, sem cópia. O Hydor nunca o move nem o manda para a Lixeira. O que você edita no Hydor é salvo nele, e as versões anteriores são guardadas como as de qualquer imagem.

## Começar uma sessão com arquivos

Para que uma nova sessão comece com alguns arquivos:

1. Abra o menu de um arquivo (ou selecione vários) e clique em **Começar uma sessão com ele** (ou **Começar uma sessão**, na barra do que está selecionado).
2. A página inicial abre com eles na caixa de mensagem, cada um marcado como “neste computador”. Remova um com o ✕ dele, adicione arquivos do seu dispositivo com o clipe de papel e escolha o agente e a pasta como de costume.
3. Digite o que fazer com eles e pressione **Início**.

Nada é enviado: a mensagem cita cada arquivo pelo caminho, então o agente o abre onde ele está, e as imagens (PNG, JPEG, GIF e WebP de até 5 MB) também vão para o modelo olhar. Até 20 arquivos vão em uma mensagem.

Para uma pasta, **Nova sessão nesta pasta** abre a página inicial com a sessão configurada para trabalhar nela.

**Começar uma sessão com ele** também está no **Mais** (⋯) de um arquivo no editor, na janela em que um arquivo abre sobre uma sessão, nos cartões de arquivos que um agente entregou a você e nas imagens que um agente criou.

## Enviar arquivos e pastas

- **Enviar** na barra envia arquivos para a pasta em que você está; a seta dele (**Mais formas de enviar**) e **Nova** têm **Enviar arquivos** e **Enviar uma pasta**. No celular, o botão **+** → **Enviar arquivos** escolhe arquivos ou fotos do celular.
- No computador, arraste arquivos ou pastas inteiras da sua área de trabalho para a pasta, para uma pasta dentro dela ou para um local (“Drop files here to upload them”). Pastas vazias também vão junto.

Os envios aparecem no painel **Envios**, no canto inferior direito: quanto já foi, arquivo por arquivo. **Cancelar** interrompe um, e o ✕ remove do painel um envio concluído. Arquivos grandes são enviados em partes de 32 MB.

Antes de qualquer coisa ser enviada, o app verifica se há arquivos com os mesmos nomes na pasta. Se houver, o painel os lista (“3 already exist”) com três opções:

- **Substituir**: envia por cima dos existentes.
- **Ignorar existentes**: envia apenas os novos.
- **Cancelar**: não envia nada.

## Abrir e editar um arquivo

Clique em um arquivo na pasta. Ele abre no editor, em uma aba própria. A primeira aba volta para a pasta (ou para a busca, os arquivos recentes ou a lixeira) de onde você o abriu. Os últimos 12 arquivos que você abriu ficam como abas: clique em uma para voltar a ela e feche-a com o ✕ ou com um clique do botão do meio. **Arquivos recentes**, entre os locais, lista os que você abriu há pouco.

Acima do arquivo aparece o caminho dele: uma casa para a sua pasta pessoal (ou **Computador**, para um arquivo fora dela), depois as pastas e, por fim, o nome do arquivo. Cada pasta leva a essa pasta na página Arquivos, com o próximo passo do caminho selecionado lá; “…” lista as pastas do meio quando o caminho é longo (**As pastas do meio**); o nome do arquivo o mostra na pasta dele, selecionado (**Mostrar na pasta**). No celular, a linha da pasta sob o nome do arquivo abre **Ir para uma pasta**: todas as pastas do caminho e, depois, **Mostrar na pasta**. O mesmo caminho aparece acima dos arquivos dos editores de [arquivos Word, Excel, CSV e LaTeX](#edit-word-excel-csv-and-latex-files).

O editor numera as linhas, colore o texto conforme a linguagem do arquivo, destaca os parênteses e colchetes correspondentes e, no computador, recolhe blocos e sugere complementos enquanto você digita. A tecla Tab recua o texto.

Para salvar, clique em **Salvar** (ele se acende quando você altera algo) ou pressione Ctrl+S (⌘S no Mac). Um ponto ao lado do nome do arquivo indica que há alterações não salvas. O app as mantém enquanto estiver aberto: vá para a aba de outro arquivo e volte, e o arquivo estará como você o deixou, com o histórico de desfazer, o cursor e a posição. Um ponto na aba do arquivo mostra que há alterações não salvas, e fechar essa aba (com o ✕ ou um clique do botão do meio), ou sair do arquivo com **Voltar** no celular, pergunta **Salvar as alterações?**: **Salvar**, **Não salvar** ou **Cancelar**. Recarregar ou fechar a página perde o que não foi salvo, e o navegador pergunta antes. Um arquivo cujas linhas terminam no estilo do Windows (CRLF) é salvo do mesmo jeito, sem ser convertido para o outro.

### As ferramentas do editor

No computador, a barra acima do arquivo mostra o caminho dele e estes botões:

- **Prévia** (arquivos Markdown): o arquivo como ele será lido, com títulos, tabelas, as próprias imagens (que estão ao lado do arquivo) e links para outros arquivos. Clique nele de novo para editar. Os arquivos Markdown abrem primeiro em prévia.
- **Mostrar como página** (arquivos HTML): executa a página em um quadro isolado do app, capaz de carregar os arquivos ao lado dela. Os arquivos HTML abrem primeiro como página. O link da página dura uma hora; depois disso, abra o arquivo de novo.
- **Alterações desde o último commit**: as diferenças do arquivo em relação ao último commit, com as linhas adicionadas em verde e as removidas em vermelho. Mostra “No changes” quando o arquivo é igual ao último commit ou não está em um repositório git. Ir para **Prévia** ou **Alterações** e voltar deixa o texto como estava, com o histórico de desfazer, o cursor e a posição.
- **Quebra de linha**: quebra as linhas longas em vez de rolar para o lado. A escolha fica lembrada.
- **Perguntar**: pede a um agente que altere o arquivo ou pergunta sobre ele ([abaixo](#ask-an-agent-about-the-file)).
- **Terminal nesta pasta**: um novo shell na pasta do arquivo.
- **Baixar**.
- **Mais** (⋯): **Encontrar**, **Substituir**, **Ir para a linha**, **Perguntar sobre a seleção** e **Atalhos de teclado**, depois **Começar uma sessão com ele**, **Adicionar a um projeto**, **Mostrar na pasta**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para desktop) e **Copiar caminho**.
- **Salvar**.

Para encontrar texto no arquivo, pressione Ctrl+F (⌘F no Mac) com o cursor nele: uma barra de busca abre no alto, com substituição (Ctrl+H, ou ⌘⌥F no Mac). Ctrl+G (⌘⌥G no Mac) vai para uma linha.

Clique com o botão direito no texto (ou pressione a tecla de menu ou Shift+F10 para abrir o menu no cursor) para ver **Recortar**, **Copiar**, **Colar**, **Selecionar tudo**, **Encontrar**, **Substituir**, **Ir para a linha** e **Perguntar sobre a seleção**, que abre [Perguntar](#ask-an-agent-about-the-file) com as linhas selecionadas citadas nele. **Mais** → **Atalhos de teclado** lista todas as teclas.

A faixa sob o texto mostra onde o cursor está (**Ln 12, Col 5**, com quantos caracteres estão selecionados; clique nela para ir a uma linha), a linguagem do arquivo, a indentação dele (**Spaces: 2**, **Spaces: 4**, **Tabs**: lida do arquivo; clique para escolher outra para o que você digitar a seguir), **LF** ou **CRLF** (como as linhas do arquivo terminam; clique para salvá-lo com a outra) e **Quebrar** ou **Sem quebra** (clique para alternar).

No celular, a barra mostra **Voltar**, o nome do arquivo sobre a pasta dele, **Prévia** ou **Mostrar como página**, **Perguntar a um agente** (✨), **Salvar** (quando você altera algo) e **Mais** (⋯), que contém **Encontrar**, **Ir para a linha**, **Perguntar sobre a seleção**, **Quebra de linha**, **Alterações desde o último commit**, **Terminal nesta pasta**, **Baixar**, **Começar uma sessão com ele**, **Adicionar a um projeto**, **Mostrar na pasta**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para desktop) e **Copiar caminho**. Os celulares quebram as linhas longas, a menos que você desative **Quebra de linha**.

### Perguntar a um agente sobre o arquivo

Clique em **Perguntar** na barra do editor (✨ no celular) e diga o que deve mudar (“Encontre e corrija os bugs”, “Adicione um resumo no início”), ou faça uma pergunta sobre o arquivo. O painel abre ao lado do arquivo (sobre ele, em uma tela estreita), com exemplos para começar, e mostra o agente e o modelo que você escolheu por último na página inicial.

- As alterações não salvas são salvas primeiro, para que o agente trabalhe nelas.
- O agente começa na pasta do arquivo, sabe a qual arquivo você se refere e altera esse arquivo por conta própria. Você vê cada alteração chegar ao editor assim que é escrita, com as linhas alteradas destacadas por um instante e a sua posição no arquivo mantida.
- A conversa continua no painel: escreva de volta para pedir mais. **Um novo pedido** recomeça, e **Abrir como sessão** a abre por inteiro; ela também fica entre as suas sessões. No celular, **Ver o arquivo** recolhe o painel para você ver o arquivo, e a barra na parte inferior o traz de volta.
- O painel continua aberto enquanto você alterna entre as abas dos arquivos, cada uma com a sua própria conversa. Funciona do mesmo modo nos editores de Word, Excel, CSV e LaTeX e nos notebooks, em que o agente altera células e mantém as saídas das outras. Em um PDF, o agente o lê e responde, e você pode perguntar sobre uma passagem, uma equação ou uma figura que selecionou nele ([Perguntar sobre uma parte de um PDF](#ask-about-a-part-of-a-pdf)). Como em [perguntar a partir de um editor](/guide/library#change-it-by-asking-an-agent), o modelo e as permissões lembrados do agente continuam como estavam.

### Quando o arquivo muda enquanto você o tem aberto

Agentes e terminais alteram arquivos o tempo todo. A cada poucos segundos (a cada segundo enquanto um agente trabalha), o editor verifica o arquivo:

- Sem alterações não salvas, ele coloca a nova versão por conta própria, no ponto em que você está lendo: só mudam as linhas que foram alteradas, destacadas por um instante.
- Com alterações suas não salvas, uma barra diz “The file changed on disk since you opened it.” Escolha **Recarregar (descartar a minha)** para ficar com a nova versão, ou **Sobrescrever com a minha versão** para salvar a sua por cima dela.

Salvar nunca grava por cima de uma versão mais nova sem fazer essa pergunta.

### Arquivos que o editor não edita

- Arquivos acima de 10 MB: “File is too large to edit here”. Baixe-o ou abra-o em um terminal. (Notebooks podem ter até 40 MB.)
- Arquivos binários (tudo o que não é texto): “Binary file”. Baixe-o para abri-lo no seu dispositivo.
- Arquivos Word, Excel, CSV e LaTeX abrem em editores próprios (a próxima seção); imagens, PDFs, vídeo, áudio e outros documentos do Office aparecem como prévias (a seção seguinte).

## Editar arquivos Word, Excel, CSV e LaTeX

Esses arquivos abrem nos editores próprios do app para eles (o [editor de documentos](/guide/library#documents) e seus parentes), e salvar grava o mesmo arquivo de novo, no formato dele:

- Os **documentos Word** (.docx) abrem no editor de documentos, como no Word ou no Google Docs, em uma folha do tamanho do papel deles.
- Os **arquivos Excel** (.xlsx) e os arquivos **CSV** e **TSV** abrem no editor de planilhas, com suas abas e fórmulas funcionando (e, em um arquivo Excel, os filtros, a formatação condicional, as listas suspensas e caixas de seleção, as células mescladas, as notas e os gráficos).
- Os **arquivos LaTeX** (.tex) abrem no editor de LaTeX, com o código-fonte ao lado das páginas compostas. Os arquivos que o documento lê (capítulos que ele inclui com `\input`, a bibliografia) abrem junto com ele, e ele é composto em meio ao restante da pasta (as imagens, os estilos e os dados dele), que o TeX lê mas nunca altera. Um capítulo abre o documento a que pertence (o que ele indica com `% !TEX root = …` ou como o de um subarquivo; senão, o que está na pasta dele, ou uma ou duas pastas acima, e que o lê), com o capítulo aberto e os arquivos do documento na [árvore de arquivos](/guide/library#the-files-tree): os arquivos que ele lê, em suas pastas e, esmaecido, o que o TeX toma da pasta como está (as imagens, os estilos e as classes, os dados), para consulta; altere-os em Arquivos. Em uma tela estreita, **Arquivos** sobre o código-fonte abre a árvore. Os comentários funcionam como nos [documentos LaTeX](/guide/library#latex-documents): um arquivo guarda apenas o texto, então o app mantém os comentários ao lado dele, pelo caminho do arquivo, salvos com **Salvar**; eles acompanham o arquivo quando você o renomeia ou move (ou move a pasta dele) aqui, e um agente [consultado sobre o arquivo](#ask-an-agent-about-the-file) os lê, responde e resolve, com as respostas aparecendo conforme chegam. **Resolver com IA**, em um comentário ou no alto de **Comentários**, envia-os a esse agente na hora ([Resolver comentários com IA](/guide/library#resolve-comments-with-ai)). **Comparar versões** serve para documentos LaTeX que o app mantém (feitos com **Nova** → **LaTeX**, ou por um agente), não para um arquivo .tex em uma pasta.

Altere como no [editor de documentos](/guide/library#documents) e depois clique em **Salvar** na barra da parte inferior, ou pressione Ctrl+S (⌘S no Mac); **Descartar** volta ao arquivo como estava. A barra acima tem o caminho do arquivo, **Perguntar** ([perguntar a um agente](#ask-an-agent-about-the-file)), **Baixar** e **Mais** (⋯): **Editar como texto** (arquivos CSV, TSV e LaTeX) ou **Mostrar como prévia** (arquivos Word e Excel) mostra o arquivo como antes, com um botão na barra para voltar ao editor, e os itens da página Arquivos **Começar uma sessão com ele**, **Adicionar a um projeto**, **Mostrar na pasta**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para desktop) e **Copiar caminho**. Um arquivo aberto em uma linha, a partir de uma busca, abre como texto.

O que salvar mantém do arquivo:

- **CSV e TSV**: as linhas e células que você não alterou mantêm o texto exatamente como estava, e o arquivo mantém o separador, as aspas e os fins de linha. Um arquivo CSV guarda os valores de uma planilha: quando você adicionou fórmulas, abas ou formatação, o primeiro salvamento pergunta antes, e as fórmulas são salvas como os valores que elas resultam.
- **LaTeX**: só os arquivos que você alterou são gravados, cada um com os próprios fins de linha. Um arquivo que você adiciona no editor vai para a pasta; um que você exclui vai para a [Lixeira](#delete-and-put-back).
- Os arquivos **Word e Excel** são gravados de novo a partir do que o editor guarda: os comentários, as alterações controladas, as equações, o sumário, o cabeçalho e o rodapé de um arquivo Word acompanham, e também os filtros, a formatação condicional, as listas suspensas e caixas de seleção, as células mescladas, as notas, os comentários e os gráficos de um arquivo Excel. Quando um arquivo tem algo que o editor não guarda (as notas de rodapé, os gráficos ou um cabeçalho com imagem ou tabela de um arquivo Word; as imagens, formas, tabelas dinâmicas, tabelas formatadas, hiperlinks, intervalos nomeados, macros ou linhas agrupadas de um arquivo Excel), uma barra acima avisa: “Saving replaces the file without what this editor does not keep”, e diz o quê. O primeiro salvamento pergunta antes de substituir o arquivo, e **Salvar como cópia**, nessa barra, grava as suas alterações em um novo arquivo ao lado dele (“relatório (editado).docx”). Na primeira vez que você salva um arquivo Word ou Excel, o arquivo como estava vai para a [Lixeira](#delete-and-put-back), de onde **Restaurar** o traz de volta ao lado do novo.
- Um arquivo longo demais para o editor mostra o início dele, somente para leitura: **Editar como texto** ou **Mostrar como prévia** mostra tudo.

Quando um agente ou um terminal altera o arquivo enquanto ele está aberto, o editor assume a nova versão se você não alterou nada, ou pergunta, como o editor de texto: **Recarregar (descartar a minha)** ou **Sobrescrever com a minha versão**.

Arquivos PowerPoint, arquivos mais antigos do Office (.doc, .xls, .ppt), arquivos OpenDocument, RTF e EPUB aparecem como prévia, como explica a próxima seção.

## Ver imagens, PDFs, documentos e páginas da web

O visualizador de arquivos mostra os arquivos como eles são:

- **Imagens** (PNG, JPEG, GIF, WebP, SVG, ICO, BMP, AVIF): mostradas por inteiro, sobre um fundo quadriculado onde são transparentes. **Editar** na parte de cima abre a imagem no editor de imagens ([Editar imagens e vídeos](/guide/library#edit-pictures-and-videos)).
- **PDFs**: no visualizador de PDF do seu navegador, com **Destacar** na parte de cima para lê-los no leitor do próprio app, destacá-los e guardar notas ao lado (veja [Ler e destacar um PDF](#read-and-highlight-a-pdf)), e **Preencher e assinar** para preenchê-los e assiná-los (veja [Preencher e assinar um PDF](#fill-in-and-sign-a-pdf)). Um PDF que você destacou abre no leitor.
- **Vídeo** (MP4, WebM, MOV e M4V; MKV e OGV onde o seu navegador os reproduz): no player do próprio app (veja [Assistir a um vídeo](#watch-a-video) abaixo); **Editar** na parte de cima abre um vídeo MP4, MOV, M4V ou WebM no editor de vídeo. **Áudio** (MP3, WAV, OGG) toca no próprio lugar.
- **Documentos do Office**: PowerPoint (.pptx, .ppt), arquivos mais antigos do Word e do Excel (.doc, .xls e semelhantes), OpenDocument (.odt, .ods, .odp), RTF e EPUB; e arquivos do Word (.docx) e do Excel (.xlsx) em **Mais** (⋯) → **Mostrar como prévia** nos respectivos editores. Um seletor na parte de cima escolhe a visualização:
  - **Slides** (arquivos do PowerPoint: .pptx e suas variantes com macro, apresentação e modelo): cada slide como ele é, desenhado como o editor de slides desenha, com imagens, formas, tabelas, gráficos e plano de fundo no lugar, o número acima e as notas do apresentador abaixo. Quando este computador não tem uma fonte que a apresentação usa, o texto de uma caixa que precisa de mais espaço do que ela tem fica um pouco menor, para que nada seja cortado.
  - **Páginas**: o documento como o LibreOffice o organiza, página por página (“Laying out the pages…” na primeira vez). Esta visualização só existe quando o LibreOffice está instalado neste computador, e não para livros EPUB.
  - **Texto**: o texto, as planilhas e os slides como o app os lê.

  Um arquivo do PowerPoint abre em **Slides**, no celular também. Os outros documentos abrem em **Páginas** quando o LibreOffice está instalado, mas os celulares começam em **Texto**, que rola e dá zoom melhor ali. Se os slides de uma apresentação não puderem ser desenhados, ela abre em **Texto** e diz o motivo. Se um documento não puder ser lido, aparece “No preview for this file”: baixe-o.
- **Markdown** e **HTML**: veja **Prévia** e **Mostrar como página** acima.

**Baixar** está sempre na barra.

### Assistir a um vídeo

Um vídeo abre no player do próprio app, que ocupa todo o visualizador:

- **Tocar e pausar**: o botão redondo no meio, o botão no canto inferior esquerdo, um clique na imagem, ou Espaço (K também funciona). Um clique duplo na imagem abre em tela cheia.
- **Avançar e voltar**: arraste ao longo da barra na parte de baixo, ou clique em um ponto dela; ao deixar o ponteiro sobre a barra, aparece o tempo naquele ponto, e a parte mais clara é o que já foi carregado. ← e → movem 5 segundos, J e L movem 10 segundos, Home e End vão para o início e o fim, de 0 a 9 pulam para aquela décima parte do vídeo, e , e . avançam um quadro por vez enquanto ele está pausado.
- **Som**: o alto-falante ativa e desativa o som (M). No computador, deixe o ponteiro sobre o alto-falante para ver um controle de volume; ↑ e ↓ também mudam o volume.
- **Velocidade**: o botão **1×** escolhe de 0,5× a 2× (**Normal** é 1×).
- **Repetir** toca o vídeo de novo desde o início a cada vez que ele termina, **Imagem em imagem** mantém o vídeo tocando em uma janela pequena sobre todo o resto (onde o seu navegador oferece esse recurso), **Baixar** salva o arquivo, e **Tela cheia** (F) ocupa a tela toda; o mesmo botão, ou Esc, volta ao normal.
- Os controles desaparecem enquanto o vídeo toca e voltam quando você move o ponteiro. O player lembra o seu volume e a sua velocidade para o próximo vídeo.
- **No celular**: toque na imagem para mostrar ou ocultar os controles, e toque duas vezes no lado esquerdo ou direito dela para voltar ou avançar 10 segundos. No iPhone, a tela cheia usa o player de vídeo do próprio celular.
- Um vídeo que o seu navegador não consegue reproduzir (arquivos MKV e AVI muitas vezes usam codecs que os navegadores não têm) mostra “This video can’t play here”, com **Baixar** para assisti-lo em um app de vídeo.

## Preencher e assinar um PDF

Abra um PDF e pressione **Preencher e assinar** na parte de cima (no celular, a caneta ao lado do nome). As páginas aparecem como papel, com os campos do formulário sobre elas em azul-claro:

- **Campos**: digite em uma caixa de texto, marque uma caixa de seleção, escolha um botão de opção, a escolha de uma lista suspensa ou as escolhas de uma lista. Um campo que o formulário bloqueia (somente leitura, ou bloqueado por uma assinatura digital que já está no arquivo) não pode ser alterado.
- **Um clique em uma página** coloca ali o que a barra de ferramentas tem selecionado: **Texto** (uma caixa para digitar, o padrão), **Marca de verificação**, **X** ou **Data** (a data de hoje, que você pode alterar). Clique em um espaço em branco após o outro: cada clique começa o próximo. É assim que você preenche um formulário que tem apenas linhas e caixas impressas, ou um formulário digitalizado.
- **Assinatura** coloca uma das suas assinaturas salvas na página com um toque, ou uma que você desenha, digita ou envia ali (marque **Guardar para depois** para salvá-la; veja [Assinaturas](/guide/library#signatures)). O campo de assinatura do próprio formulário diz **Assine aqui**: toque nele, e a assinatura vai para a caixa.
- **Mover e redimensionar**: arraste uma marca de verificação, um X ou uma assinatura para movê-los, e o canto azul para redimensioná-los. Uma caixa de texto se move pela alça à esquerda, e **A−** e **A+** sobre ela deixam o texto menor ou maior. A lixeira sobre cada item, ou Delete, remove o item.
- **Zoom**: faça o gesto de pinça no celular ou tablet; no computador, Ctrl com a roda do mouse, ou Ctrl+= e Ctrl+−. **Ajustar à largura** (ou Ctrl+0) volta ao normal.

**Salvar** grava uma cópia ao lado do arquivo, “nome (filled).pdf”, e a abre. A seta ao lado tem **Salvar uma cópia ao lado** e **Substituir o arquivo**, cuja versão antiga vai para a [Lixeira](#delete-and-put-back). **Fechar** sai sem salvar, perguntando antes quando você alterou algo.

Os campos guardam seus valores como campos do próprio formulário, então qualquer visualizador de PDF os mostra e eles ainda podem ser alterados lá, em fontes que comportam as suas palavras (grego e chinês também). O que você colocou é desenhado nas páginas. Os bytes originais do arquivo continuam como estavam, com as alterações depois deles, e por isso:

- um PDF **assinado digitalmente** continua válido quando você apenas preenche os campos dele. Texto, marcas de verificação ou uma assinatura colocados nas páginas aparecem em outros visualizadores como uma alteração feita depois da assinatura;
- um PDF **protegido** pelo proprietário (abre sem senha, mas limita alterações) é preenchido apenas até onde ele permite. Um que precisa de senha para abrir não pode ser preenchido aqui.

O que não é possível fazer:

- **Formulários XFA** (feitos com o Adobe LiveCycle Designer, muitas vezes por governos): seus campos só são preenchidos no Adobe Acrobat ou no Reader. Você ainda pode digitar e assinar nas páginas deles.
- **Formulários digitalizados** não têm campos nem palavras para encontrar: seu texto e suas marcas vão onde você clicar.
- Uma assinatura desenhada é uma imagem da sua assinatura, não uma assinatura digital que comprova quem assinou.
- Nada aqui remove palavras de um PDF de forma definitiva. Caixas brancas, que os agentes podem colocar sobre palavras, apenas as escondem da vista: as palavras continuam no arquivo.

Os agentes também preenchem, escrevem em PDFs e os alteram, com ferramentas próprias: veja [Documentos, imagens, vídeos e voz](/guide/documents-voice#pdfs).

## Ler e destacar um PDF

Abra um PDF e pressione **Destacar** na parte de cima (no celular, o marcador ao lado do nome). As páginas aparecem como papel, desenhadas pelo app, com as palavras por cima para você selecionar como em qualquer leitor. Um PDF que você destacou abre assim automaticamente, então suas notas estão lá quando você volta; **Fechar** volta ao visualizador do seu navegador.

- **Destacar palavras**: selecione-as com o mouse, ou no celular pressione e segure uma palavra e arraste as alças. Uma barra pequena aparece: uma das quatro cores (amarelo, verde, azul ou rosa) as destaca, **Nota** as destaca e abre uma nota para escrever, **Perguntar** pergunta a um agente sobre elas ([abaixo](#ask-about-a-part-of-a-pdf)), e **Copiar** as copia, juntando de novo uma palavra dividida no fim de uma linha. Uma seleção segue de uma coluna de um artigo para a seguinte, na ordem em que você lê.
- **Destacar uma figura ou uma equação**: pressione **Selecionar uma área** e arraste uma caixa em volta dela; no computador, segure Alt e arraste, sem o botão. A mesma barra aparece para aquela parte da página, que é guardada como uma imagem dela (**Copiar** copia a imagem, ou o texto dela quando o navegador não deixa uma página copiar imagens).
- **Alterar um destaque**: clique nele para ver a barra, para escolher outra cor, **Editar nota**, **Perguntar**, **Copiar** ou excluí-lo (a lixeira, ou Delete; **Desfazer** na mensagem que aparece em seguida o traz de volta). Deixar o ponteiro sobre um destaque mostra a nota dele, e um pontinho marca os que têm uma. Destacar as mesmas palavras de novo muda a cor delas.
- **Zoom**: faça o gesto de pinça no celular ou tablet; no computador, Ctrl com a roda do mouse, ou Ctrl+= e Ctrl+−. **Ajustar à largura** (ou Ctrl+0) volta ao normal. Os destaques ficam sobre as palavras em qualquer tamanho.

Uma página que é apenas uma imagem (uma digitalização) não tem palavras para selecionar: destaque partes dela com **Selecionar uma área**. Palavras que correm para cima ou para baixo em uma página (uma página virada de lado) também não podem ser selecionadas. Os destaques que outros apps salvaram em um PDF aparecem nas páginas, mas não em **Notas**.

### Suas notas

**Notas** lista os seus destaques ao lado das páginas (como uma folha que sobe da parte de baixo no celular), página por página: as palavras de cada um ou a imagem da área, a nota dele, que você escreve ou altera ali mesmo, e a cor. Clique em um para ir até ele na página; a lixeira o exclui, e ✨ pergunta a um agente sobre ele.

O app guarda seus destaques e notas ao lado do arquivo, pelo caminho dele: o PDF em si não muda. Eles acompanham o arquivo (ou a pasta dele) quando você o renomeia ou move aqui, e um arquivo movido de outra maneira (em um terminal, por um agente) reencontra as notas pelo conteúdo quando você o abre. Quando o próprio arquivo muda (um artigo que você diagramou de novo), cada destaque é encontrado de novo pelas suas palavras, inclusive em outra página; um destaque cujas palavras não estão mais no arquivo continua onde estava, marcado com “The file changed, and these words are not in it now”.

**Mais** (⋯) em Notas tem:

- **Manter em um projeto**: seus destaques e notas vão para o [conhecimento](/guide/projects#memory) de um projeto como um documento com o nome do artigo (“Sparse Retrieval with Learned Term Weights (notes).md”, por exemplo): o título do artigo, depois as palavras de cada destaque (uma linha para uma área) e a sua nota, página por página, para que as sessões do projeto os encontrem quando pesquisarem os documentos dele. O projeto cuja pasta contém o PDF vem primeiro. O documento acompanha todas as alterações que você faz nas notas; **Abrir o conhecimento do projeto** o mostra lá, e **Parar de manter lá** o remove.
- **Salvar no PDF**: grava os destaques no arquivo como destaques do próprio PDF, cada nota como o comentário do seu destaque, para que outros apps de PDF os mostrem. **Salvar uma cópia ao lado** grava “nome (highlighted).pdf”, que também mantém as suas notas; **Substituir o arquivo** grava por cima dele, e a versão antiga vai para a [Lixeira](#delete-and-put-back). Salvar de novo coloca os destaques como estão naquele momento, no lugar dos salvos antes. Um arquivo cujo proprietário proíbe comentários, ou um certificado contra eles, não pode recebê-los: eles continuam ao lado dele.
- **Copiar tudo**: as notas como texto, para colar em outro lugar.

### Perguntar sobre uma parte de um PDF

**Perguntar** na barra abre [Perguntar a um agente](#ask-an-agent-about-the-file) ao lado do PDF (sobre ele em uma tela estreita) com o que você escolheu: as palavras, ou uma imagem da área, e a página dela. Escolha um exemplo (“Explique esta passagem”, “O que esta equação diz?”, “Como isto se compara com a minha abordagem?”, “Resuma esta seção”) ou escreva a sua própria pergunta; o agente também pode ler o PDF inteiro. Enquanto uma conversa sobre o arquivo está em andamento, **Perguntar** coloca a parte na caixa de mensagem dela, para que você pergunte sobre ela em seguida. Os agentes também leem os seus destaques e notas de um PDF quando você pede (“resuma os meus destaques deste artigo”).

## Encontrar um arquivo pelo nome

Pressione Ctrl+P (⌘P no Mac) em qualquer página. “Go to file in …” busca pelo nome na pasta aberta em Arquivos: digite algumas letras do nome, em ordem (`invq3` encontra `invoices/q3-report.xlsx`). Os arquivos cujo próprio nome contém o que você digitou vêm primeiro. Mova-se com ↑ e ↓, abra com Enter ou um clique. A lista tem até 60 arquivos, inclusive os ocultos.

A caixa de busca (Ctrl+K, ⌘K no Mac) também encontra arquivos pelo nome, na mesma pasta, assim que você digita duas letras.

## Buscar arquivos

Uma única busca encontra arquivos pelo nome e pelo texto dentro deles, em qualquer lugar sob uma pasta. Digite no campo **Buscar em** de uma pasta e pressione Enter, ou acesse [Buscar em arquivos](/search).

1. Digite o que procurar em “Buscar nomes e o texto dentro dos arquivos”. Os resultados aparecem enquanto você digita.
2. Abaixo do campo, **Em** indica onde a busca é feita: no início, a pasta de onde você veio. Clique para buscar em outro lugar: a pasta de um projeto, uma pasta fixada, uma em que as sessões trabalharam, sua **Pasta pessoal** ou qualquer pasta que você encontre pelo nome ou cujo caminho você digite.
3. Refine a busca, se quiser:
   - **Todos os tipos de arquivo** escolhe o tipo: **Texto e notas**, **Código**, **Dados e configurações**, **Páginas da web** ou **Notebooks**. Ou digite nomes como estes no mesmo menu, separados por vírgulas (`*.md, *.py`); um `!` na frente exclui esses arquivos (`!dist/**`).
   - **Inclusive arquivos ocultos** busca arquivos e pastas cujo nome começa com um ponto.
   - No campo, **Diferenciar maiúsculas de minúsculas** considera as maiúsculas exatamente como estão (sem essa opção, uma busca em minúsculas ignora a diferença, e uma busca com uma letra maiúscula a considera), e **Expressão regular** lê o que você digita como um padrão (`colou?r`) em vez de texto simples.

Os resultados vêm em duas partes:

- **Arquivos com esse nome**: até 30 arquivos cujos nomes contêm o que você digitou, cada um com sua pasta.
- **Dentro dos arquivos**: as linhas encontradas, agrupadas por arquivo, cada arquivo com seu número de ocorrências. Clique em uma linha para abrir o arquivo naquela linha, ou no nome de um arquivo para abri-lo.

O botão **Mais** (⋯) de cada resultado tem **Mostrar na pasta**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para computador), **Começar uma sessão com ele**, **Adicionar a um projeto** e o restante do menu de um arquivo.

A busca fica no endereço da página, então Voltar e recarregar a mantêm. Ela ignora arquivos que o `.gitignore` da pasta deixa de fora e arquivos com mais de 4 MB. Ela para em 50 ocorrências em um arquivo e 1.000 no total, ou após 15 segundos, e mostra as primeiras 30 linhas encontradas de cada arquivo. PDFs, documentos do Word e outros são encontrados pelos nomes, não pelo texto dentro deles; para que os agentes busquem dentro deles, adicione-os ao [conhecimento](/guide/projects#shared-knowledge-documents-every-session-can-search).

## Executar um notebook Jupyter

Um notebook (`.ipynb`) abre como notebook: suas células, cada uma com sua saída. A barra no topo tem o botão do kernel, **Executar todas as células**, **Interromper (I, I)**, **Reiniciar o kernel (0, 0)**, **Limpar todas as saídas**, **Ver o arquivo do notebook (JSON)**, **Baixar**, **Perguntar** (veja [Perguntar a um agente sobre o arquivo](#ask-an-agent-about-the-file)) e **Salvar**. No celular, os menos usados ficam em **Mais**: **Reiniciar o kernel**, **Reiniciar e executar tudo**, **Limpar todas as saídas**, **Ver o arquivo (JSON)** e **Baixar**.

Crie um com **Nova** → **Novo notebook** em uma pasta (veja [Criar um arquivo ou pasta](/guide/files-git#make-a-file-or-folder)), ou peça um a um agente: ele escreve o notebook, executa do início para que as saídas estejam lá, configura um ambiente para executá-lo quando nenhum serve e entrega tudo em um cartão que o abre aqui.

### Escolher onde o código é executado

O botão do kernel (um ponto e um nome, ou “Sem kernel”) abre **Executar este notebook com**: os ambientes Python deste computador. Ele lista ambientes virtuais chamados `.venv`, `venv` ou `env` na pasta do notebook ou nas pastas acima dela, ambientes conda, o Python do sistema e kernels Jupyter registrados aqui (de outras linguagens também). Cada um mostra sua versão, e aquele que o notebook pede (ou um ambiente virtual ao lado dele) é marcado como **sugerido**.

- Um ambiente marcado com “precisa do ipykernel” tem um botão **Instalar**: ele executa `pip install ipykernel` nesse ambiente, depois que você confirma, e nada mais nele muda.
- Executar uma célula sem kernel ainda inicia um no ambiente sugerido. Se isso falhar, a lista se abre para você escolher outro.
- Com um kernel em execução, o menu do botão mostra seu estado (Iniciando, Ocioso, Executando, Reiniciando ou Parado), quando ele começou, e **Interromper**, **Reiniciar** e **Encerrar**. Escolher outro ambiente pede confirmação antes, pois as variáveis do kernel em execução são perdidas.

Os kernels continuam em execução depois que você fecha o notebook e mesmo após reiniciar o app: abra-o de novo e as saídas do que foi executado nesse meio-tempo estarão lá. Encerre um pelo menu dele, ou pela página [Sistema](/system), onde os kernels em execução são listados.

### Escrever e executar células

Uma célula é **Código**, **Texto** (Markdown) ou **Bruta**. Clique em uma célula de código para editá-la, ou dê um clique duplo em uma célula de texto. Enquanto uma célula é executada, ela mostra `[*]` e um cronômetro; depois, seu número de execução, `[3]`.

- Aponte para uma célula de código e um botão de executar toma o lugar do número dela (“Executar (Shift+Enter)”: executa a célula e vai para a próxima; enquanto a célula é executada, ele interrompe o kernel). As ferramentas aparecem no canto: **Editar** (células de texto), o tipo da célula, **Mover para cima**, **Mover para baixo**, **Adicionar uma célula abaixo**, **Excluir a célula** e **Mais opções para esta célula** (⋯, o menu da célula, abaixo). No celular, toque em uma célula: as ferramentas aparecem acima dela, incluindo **Executar**.
- No computador, apontar para o espaço entre duas células mostra **+ Código** e **+ Texto**. Os mesmos dois botões ficam abaixo da última célula.
- **O menu da célula**: clique com o botão direito em uma célula (ou em seu ⋯ no canto, que é como ele abre no celular). Ele tem **Executar esta célula**, **Executar todas as de cima**, **Executar esta e as de baixo** e **Executar todas as de baixo** (apenas células de código são executadas), **Recortar**, **Copiar**, **Colar abaixo**, **Colar acima**, **Duplicar**, **Dividir no cursor** (enquanto você edita a célula, com o cursor onde ela deve ser dividida), **Mesclar com a próxima célula**, **Adicionar uma célula acima** e **abaixo**, **Mover para cima** e **para baixo**, **Tipo de célula**, **Limpar a saída**, **Recolher a saída** ou **Mostrar a saída**, e **Excluir a célula**, cada um com seu atalho. Células recortadas, copiadas e duplicadas mantêm suas saídas; uma colagem pode ir para outro notebook enquanto o app estiver aberto. Dividir ou mesclar limpa as saídas das células que ele cria.
- **Várias células juntas**: Shift+↑ / Shift+↓ (ou Shift+clique) escolhe as células entre onde você começou e onde você está, mostradas com um tom; o menu, **Copiar**, **Recortar**, **Duplicar**, **Merge** e D, D funcionam então em todas elas. Esc solta a seleção.
- **Recolher uma saída**: as pequenas setas ao lado do número de uma célula (ou **Recolher a saída** no menu dela) escondem a saída atrás de “Saída oculta”; clique nela para mostrar de novo. Isso é guardado no arquivo do notebook (como o Jupyter faz), então ela continua recolhida quando você o abre de novo.
- Quando o código pede uma entrada (o `input()` do Python), um campo aparece sob a célula: “Digite e pressione Enter”. As senhas ficam ocultas.
- Enquanto você edita código, Tab depois de um nome pede sugestões de preenchimento ao kernel em execução.

As saídas mostram texto, erros em cores, imagens e gráficos, tabelas, HTML (em um quadro isolado), Markdown e fórmulas. “Widgets interativos não funcionam aqui”, e a saída em JavaScript também não. As barras de progresso aparecem como estavam por último, e o texto que uma célula imprime aos poucos aparece como um único bloco, como no Jupyter.

### Teclas

Enquanto você edita uma célula:

- Shift+Enter: executa e vai para a próxima célula (uma nova depois da última).
- Ctrl+Enter (⌘Enter no Mac): executa e permanece nela.
- Alt+Enter: executa e adiciona uma célula abaixo.
- Ctrl+Shift+Enter: executa e também as células abaixo dela.
- Ctrl+Shift+- (⌘⇧-): divide a célula no cursor.
- Esc: para de editar.

Quando nenhuma célula está sendo editada:

- Enter: edita a célula selecionada. ↑ / ↓ (ou K / J): move entre as células. Shift+↑ / ↓: escolhe várias.
- A / B: adiciona uma célula acima / abaixo. D, D: exclui a célula (ou as células escolhidas). Z: traz de volta as últimas células excluídas; pressione de novo para as anteriores.
- C / X: copia / recorta a célula (ou as células escolhidas). V / Shift+V: cola abaixo / acima. Shift+M: mescla a célula com a próxima (ou as células escolhidas juntas). Ctrl+Shift+Enter: executa esta célula e as de baixo.
- M, Y, R: transforma a célula em Texto, Código ou Bruta.
- I, I: interrompe o kernel. 0, 0: reinicia o kernel.

**Mais** (⋯) na barra acima do notebook tem **Executar todas as células**, **Executar todas as de cima**, **Executar esta e as de baixo** e **Executar todas as de baixo** (essas três últimas para a célula escolhida), **Reiniciar o kernel**, **Reiniciar e executar tudo**, **Limpar todas as saídas**, **Contorno** e **Atalhos de teclado**. **Contorno** mostra os títulos das células de texto (as linhas que começam com #) em uma lista ao lado das células (uma folha no celular): clique em um para ir até a célula dele. **Atalhos de teclado** lista todas as teclas. Uma célula executada enquanto o kernel ainda está iniciando espera por ele e é executada quando ele estiver pronto.

Ctrl+S (⌘S no Mac) salva. Como em outros arquivos, se o notebook mudar no disco enquanto você tem alterações não salvas, uma barra oferece **Recarregar (descartar a minha)** ou **Sobrescrever com a minha versão**. **Ver o arquivo do notebook (JSON)** mostra o arquivo como texto no editor; **Abrir como notebook** volta.

## Ver seus repositórios na página Git

Clique em **Git** na barra de ícones, ou acesse [Git](/git). À esquerda, ela lista seus repositórios git, os usados mais recentemente primeiro: aqueles em que suas sessões trabalharam (a pasta de uma sessão, ou um arquivo que uma sessão editou; lugares temporários como `/tmp` ficam de fora) e aqueles que você mesmo adicionou. Quando há mais de seis, um campo no topo encontra um pelo nome.

Na primeira vez que você abre a página Git, um tour curto, escrito para quem está começando com o Git, mostra como ela funciona. Ele aparece enquanto as dicas estão ativadas, depois do tour de boas-vindas. Um cartão explica em palavras simples o que é o Git (pontos de salvamento de uma pasta: commits, em um repositório), e depois cada parte da página se ilumina, uma de cada vez, com um cartão próprio: seus repositórios, **Alterações**, **Commit**, manter uma cópia online (**Push** e **Pull**), **Histórico**, **Branches** e o fato de que você pode simplesmente pedir a um agente. Avance e volte com **Próxima** e **Voltar**; **Concluído** encerra o tour, e **Pular** ou Esc o fecha antes. **Me mostre como funciona** (o botão de bússola no canto superior direito da página) o inicia de novo a qualquer momento.

Cada repositório mostra seu nome e branch, e pequenas marcas quando há algo a fazer:

- **● 3**: três arquivos alterados e ainda sem commit.
- **↑ 2**: dois commits para enviar com push. **↓ 1**: um commit para trazer com pull.
- **Fazendo merge** ou **Fazendo rebase**: um merge parou em arquivos em conflito (veja [Quando um merge para em conflitos](/guide/files-git#when-a-merge-stops-on-conflicts)).
- À direita, há quanto tempo foi feito o último commit.

No topo da página, **Buscar o remoto de cada repositório** (a nuvem) pergunta a cada remoto o que há de novo, e **Atualizar** lê a lista de novo.

Clique em um repositório para abri-lo ao lado da lista. No topo dele: seu nome e pasta, o branch em que você está, uma linha sobre como ele está em relação ao remoto, **Sincronizar** e um menu ⋯. Abaixo, quatro abas: **Alterações**, **Histórico**, **Branches** e **Stashes**. No computador, o repositório que você usou por último abre quando você entra na página. Em uma janela pequena, a lista se recolhe no título da página (clique no nome do repositório para escolher outro); no celular, a lista é uma página própria, e um repositório abre sobre ela com uma seta de voltar.

### Adicionar um repositório

**Adicionar** no topo da página tem duas opções:

- **Adicionar uma pasta neste computador**: digite ou escolha a pasta de um projeto e clique em **Adicionar**. Uma pasta dentro de um repositório adiciona esse repositório. Uma pasta que o git ainda não controla pode iniciar um repositório próprio: **Iniciar um repositório aqui** (o `git init` do git).
- **Clonar de um link**: cole o endereço de um repositório no GitHub, GitLab ou outro servidor git (`https://…`, `ssh://…` ou `git@host:owner/project`). **Onde vai ficar** sugere uma pasta própria (em `~/code`, se você tiver uma); ela não pode existir ainda, ou deve estar vazia. **Clonar** mostra o andamento; você pode fechar a janela e ele continua. O repositório abre quando termina.

O que você adiciona fica na lista até você tirar: ⋯ → **Remover da lista**. A pasta dele permanece como está.

## Sincronizar com o remoto

O remoto é onde o repositório é compartilhado, como o GitHub. A linha abaixo do branch diz como o seu está: “2 para enviar · 1 para trazer · buscado há 5 min”, **Atualizado**, **Ainda não está no remoto** ou **Sem remoto**.

**Sincronizar** faz o necessário em um clique: pergunta ao remoto o que há de novo, traz esses commits e depois envia os seus. As setas mostram quantos vão para cada lado (**Sincronizar ↑2 ↓1**). Um branch que o remoto ainda não tem mostra **Publicar branch** no lugar: ele coloca o branch lá e mantém os dois em sincronia daí em diante.

Quando o seu branch e o do remoto avançaram, o Sincronizar não muda nada ainda e pergunta como juntá-los:

- **Colocar meus commits por cima**: seus commits vão depois dos do remoto, como se você os tivesse feito depois, de modo que o histórico fica em uma linha reta (o git chama isso de rebase).
- **Merge**: um commit de merge une as duas linhas; todos os commits permanecem como estavam.

Depois o Sincronizar envia os seus. Se os dois lados mudaram as mesmas linhas, ele para para que você resolva (veja [Quando um merge para em conflitos](/guide/files-git#when-a-merge-stops-on-conflicts)). Se suas alterações sem commit mexem em arquivos que mudaram no remoto, ele avisa: faça commit delas ou guarde-as antes em um stash.

O menu ⋯ tem os passos um de cada vez, e o resto:

- **Buscar** pergunta ao remoto o que há de novo sem mudar nada aqui. **Pull** traz as novidades (quando os dois lados avançaram, ele faz a mesma pergunta). **Push** envia seus commits.
- **Abrir um terminal aqui**, **Mostrar em Arquivos**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para computador) e **Copiar caminho**.
- **Remotos**: os remotos do repositório e seus endereços. Um repositório sem remoto mostra **Sem remoto · Adicionar um**: cole um endereço e clique em **Adicionar remoto** (ele se chama origin), depois em **Publicar branch**.
- **Enviar tags**, quando o repositório tem tags.

Quando algo não dá certo, uma caixa vermelha diz o que aconteceu, em palavras simples quando possível, com **O que o git disse** para a mensagem do próprio git. O git do app nunca pede senha: o push e o pull usam as chaves SSH deste computador ou as credenciais git salvas, e avisam quando elas não funcionam sem uma pergunta.

## Fazer commit das alterações

**Alterações** lista todos os arquivos alterados desde o último commit, com as letras que a página Arquivos usa (veja [O que significam as letras ao lado dos arquivos](/guide/files-git#what-the-letters-beside-files-mean)), o nome em negrito seguido da pasta e as linhas adicionadas e removidas. Clique em um arquivo para ver as alterações dele ao lado da lista (no celular, em uma página própria). Onde houver espaço, **Unificado** e **Lado a lado** mostram as linhas antigas e novas uma embaixo da outra ou uma ao lado da outra.

Não há uma etapa separada de staging: cada arquivo tem uma caixa que o inclui no próximo commit (todos no início), e a caixa no topo marca ou desmarca todos de uma vez ("3 de 4 no commit").

- **Descartar esta parte**, no topo de cada trecho das alterações de um arquivo, devolve só essas linhas ao estado do último commit (depois de uma pergunta).
- O menu ⋯ de um arquivo: **Abrir o arquivo**, **Mostrar em Arquivos**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para computador), **Descartar as alterações** (para um arquivo novo, **Excluir o arquivo novo**; ambos perguntam antes e não podem ser desfeitos) e **Ignorar** (um arquivo novo) ou **Parar de rastrear e ignorar** (um arquivo que o git acompanha: o próximo commit o tira do repositório, e ele continua neste computador). Os dois o adicionam ao `.gitignore`.
- O ícone de caixa no topo da lista coloca todas as alterações de lado em um stash (veja [Deixar alterações de lado com um stash](/guide/files-git#put-changes-aside-with-a-stash)).

Para fazer um commit, na parte de baixo da lista:

1. Escreva um resumo da alteração e, se precisar, uma descrição. Ou clique em **Escrever mensagem**: um modelo lê as alterações que você marcou e redige os dois, no estilo dos commits recentes do repositório (o Claude quando o Claude Code está conectado, o Codex nos demais casos).
2. Clique em **Commit**, ou em **Commit e push** para enviá-lo ao remoto de uma vez (isso publica o branch se o remoto ainda não o tiver). Ctrl+Enter também faz o commit.

Só os arquivos marcados entram, mesmo que outros tenham sido adicionados à área de stage em outro lugar.

**Corrigir o último commit** aparece enquanto nenhum remoto tem o último commit: marque essa opção para alterar esse commit em vez de criar um novo. A mensagem dele é preenchida para você editar, os arquivos que você marcar entram nele, e os botões viram **Corrigir** e **Corrigir e fazer push**.

Quando tudo já tem commit, Alterações mostra **Nada para fazer commit** e exibe o último commit: clique nele para abri-lo em Histórico.

## Quando um merge para por causa de conflitos

Quando os dois lados alteraram as mesmas linhas (uma sincronização que traz commits, o merge de um branch, a reversão de um commit), o git para no meio do caminho, e o repositório avisa acima das abas: "O merge de origin/main em main parou: 1 arquivo em conflito". Os arquivos em conflito aparecem listados ali e marcados com **C** em Alterações; clique em um para vê-lo.

Em cada um desses arquivos, o git colocou as duas versões entre marcadores: `<<<<<<<` e a sua, `=======`, depois a deles até `>>>>>>>`. Abra o arquivo, mantenha o que deve ficar e apague os marcadores. Um arquivo aparece como resolvido, com um visto, quando não restam marcadores. Depois:

- **Peça a um agente para resolvê-los** abre a página inicial com um prompt para este repositório: um agente resolve os arquivos, verifica se ainda funcionam e conta o que escolheu. Nada começa até você enviar.
- **Continuar**, quando todos os arquivos estiverem resolvidos, conclui o que tinha parado (o commit do merge, ou o resto dos seus commits colocados por cima).
- **Interromper o merge** (ou **Parar de colocar por cima**, **Interromper a reversão**) devolve tudo ao estado de antes de começar, depois de uma pergunta. O que você alterou para resolver os arquivos é perdido.

Até lá, a sincronização e a caixa de commit ficam esperando: Continuar faz o commit.

## Percorrer o histórico

**Histórico** lista os commits, do mais recente ao mais antigo, com um gráfico à esquerda mostrando como os branches se separam e se juntam: cada linha é um branch e cada ponto, um commit; um anel é um commit que o remoto ainda não tem. Etiquetas mostram os branches (os seus com contorno), os branches do remoto (com uma nuvem) e as tags de cada commit, depois a mensagem, quem o fez e quando.

- **Este branch** mostra o histórico que levou ao branch em que você está; **Todos os branches** mostra o de todos os branches, inclusive os do remoto.
- **Encontrar um commit** encontra commits por palavras da mensagem, pelo nome ou endereço do autor, ou pelo hash.
- **Encontrar o que quebrou**, o botão ao lado, pede a um agente que encontre o commit que quebrou alguma coisa (veja [Encontrar o que quebrou](#find-what-broke-it)).
- **Carregar mais**, no fim, mostra commits mais antigos.

Clique em um commit para abri-lo ao lado da lista (no celular, em uma página própria): a mensagem completa, o autor, a data e o hash (clique no hash para copiá-lo), os branches e as tags dele e os arquivos que ele alterou, cada um abrindo o seu diff. Um merge diz quais commits ele juntou.

- **Explicar** abre a página inicial com um prompt que pede a um agente que explique o commit em palavras simples.
- **Desfazer este commit** aparece no último commit enquanto nenhum remoto o tem: o commit some, e o que ele alterou volta para Alterações, pronto para um novo commit.
- O menu ⋯ também tem **Copiar hash**, **Encontrar o que quebrou** (a partir deste commit, como o ponto em que funcionava pela última vez), **Novo branch a partir daqui** (um branch que começa neste commit; você muda para ele), **Criar tag neste commit** (um nome como `v1.2.0` e, se quiser, uma mensagem; **Enviar tags**, no menu ⋯ do repositório, envia as tags ao remoto) e **Reverter este commit**: um novo commit que desfaz o que este alterou, depois de uma pergunta. O commit em si continua no histórico.

### Encontrar o que quebrou

Quando algo funcionava em uma versão anterior e agora está quebrado, abra o commit em que funcionava pela última vez e escolha **Encontrar o que quebrou** no menu ⋯ dele, ou selecione o botão **Encontrar o que quebrou** ao lado de **Encontrar um commit**. O formulário pergunta:

- **Funcionava em**: esse commit (pela tag dele, quando tiver) ou, se não, a tag mais recente; qualquer tag, branch ou commit serve, e o commit que ela representa aparece embaixo.
- **Quebrou em**: `HEAD`, para começar.
- **O que está quebrado**, com suas palavras, e **Como verificar (opcional)**: um comando que falha enquanto estiver quebrado.
- **Executada por**: o agente que faz isso.

**Início** abre uma nova sessão em uma worktree do repositório, para que a sua própria cópia fique como está. O agente dela escreve uma verificação, testa nas duas pontas, executa o git bisect para achar o primeiro commit em que quebrou e explica o que nesse commit quebrou e por quê, com uma correção para sugerir. Veja [Encontrar o que quebrou](/guide/engineering#find-what-broke-it).

## Trabalhar com branches

Clique no nome do branch, abaixo do nome do repositório, para mudar: os branches daqui vêm primeiro, do mais recente ao mais antigo, com ↑↓ em relação ao branch deles no remoto, depois os que estão **Somente no remoto**. Digite para encontrar um; um nome que ainda não é um branch oferece **Novo branch “…” a partir daqui**. Com alterações sem commit, o app pergunta antes: elas vão junto, e se entrarem em conflito com esse branch, o git recusa e nada muda. Um branch que só existe no remoto vira um branch daqui que o acompanha.

**Branches** mostra primeiro o branch em que você está, depois os outros, cada um com o último commit e marcas: **merge feito** (o trabalho dele já está no seu branch), **somente aqui** (não está no remoto), **removido do remoto** e ↑↓ em relação ao branch dele no remoto. **Novo branch** cria um a partir de onde você está e muda para ele. Cada branch tem **Mudar** e um menu ⋯:

- **Merge em** *seu branch*: o trabalho dele se junta ao seu. Se os dois alteraram as mesmas linhas, o merge para para que você as resolva.
- **Comparar com** *seu branch*: os commits que cada um tem e o outro não. Clique em um para abri-lo.
- **Publicar** coloca no remoto um branch que só existe aqui.
- **Renomear**: o branch dele no remoto mantém o nome.
- **Excluir**: um branch com merge feito some na hora, pois nada se perde. Para um sem merge, a pergunta lista os commits que nenhum outro branch tem, e **Excluir mesmo assim** o exclui junto com eles.

Recolhidos em **Somente no remoto** estão os branches do remoto que não existem aqui: **Fazer checkout** cria um aqui que o acompanha e muda para ele.

## Deixar alterações de lado com um stash

Um stash coloca de lado as suas alterações sem commit, para você trabalhar em outra coisa e trazê-las de volta depois. **Fazer stash das alterações** (na aba **Stashes**, ou no ícone de caixa no topo de Alterações) pergunta o que são as alterações e se deve **Incluir também os arquivos novos**; os arquivos voltam então ao estado do último commit.

**Stashes** os lista com a mensagem, o branch em que foram feitos, quando e quantos arquivos. Clique em um para ver o que ele guarda, arquivo por arquivo:

- **Aplicar e remover** traz as alterações de volta e tira o stash da lista.
- **Candidatar-se** traz as alterações de volta e mantém o stash.
- A lixeira o descarta, depois de uma pergunta. Isso não pode ser desfeito.

Se as alterações entrarem em conflito com o que os arquivos têm agora, os arquivos em conflito ficam marcados com **C** em Alterações: resolva-os como depois de um merge e faça o commit.

## Abrir um pull request a partir de uma sessão

Um pull request pede às pessoas que cuidam de um repositório que incorporem as alterações de um branch. Você pode abrir um no GitHub ou no Gitea direto da sessão que fez as alterações.

O que é necessário:

- Uma conta do GitHub ou do Gitea em [Configurações → App → Controle de código-fonte](/settings?s=scm) para o servidor em que o repositório está (veja [Adicionar uma conta do GitHub ou do Gitea](/guide/devices#add-a-github-or-gitea-account)).
- A pasta da sessão está em um repositório git com um remoto, em um branch próprio. Uma sessão que trabalha no próprio branch principal não pode abrir um: comece a sessão em uma worktree (uma cópia separada do repositório em um novo branch) ou mude antes para um novo branch.

Para abrir um:

1. No menu da sessão (⋯), escolha **Pasta e código** → **Abrir um pull request**.
2. A caixa de diálogo mostra o branch e para onde ele vai (`my-branch → main on owner/repo`), quantos commits e arquivos ele tem e se o branch já foi enviado ("o branch é enviado quando você abrir" se não).
3. Se houver alterações sem commit, marque **Fazer commit das … alterações sem commit antes, com o título como mensagem** para incluí-las. Caso contrário, elas ficam de fora. (Já vem marcado quando o branch ainda não tem commits.)
4. Escreva um título e uma descrição (Markdown), ou clique em **Escrever para mim**: um modelo lê os commits, as alterações e a tarefa dada à sessão, e escreve os dois. É preciso ao menos um commit.
5. Marque **Rascunho** para abri-lo como rascunho. (O Gitea marca um rascunho com "WIP:" antes do título.)
6. Clique em **Abrir pull request**. O app envia o branch, abre o pull request, o vincula à sessão e o abre em uma nova aba.

Se o branch já tem um pull request aberto, a caixa de diálogo avisa e oferece **Vincular a esta sessão**. Para vincular qualquer outro, clique em **Vincular um pull request que já existe…**, cole o endereço dele e clique em **Link**.

### Acompanhar um pull request

Depois de vinculado, o número do pull request aparece ao lado da sessão na barra lateral e no cabeçalho da sessão, com um ícone para o estado (aberto, rascunho, com merge feito ou fechado) e um ponto para as verificações (os testes que o servidor executa nele: em andamento, aprovadas ou com falha). O app verifica a cada poucos minutos e avisa quando o merge é feito ou quando as verificações terminam.

Clique no número no cabeçalho (ou em **Pull request #12** no menu da sessão → **Pasta e código**) para abrir a caixa de diálogo dele:

- **Abrir no GitHub** (ou no Gitea).
- **Revisar as alterações**: a página de revisão, abaixo.
- **Verificar agora**: pede na hora o estado e as verificações.
- **Desvincular**: tira o pull request da sessão (o pull request em si continua).

## Revisar o que um branch altera

A página de revisão mostra tudo o que o branch de uma sessão altera desde que saiu do branch de base, com commit ou sem, inclusive arquivos novos. Abra-a pelo menu da sessão (⋯) → **Pasta e código** → **Revisar as alterações**, pela caixa de diálogo de um pull request ou pela de uma worktree (**Revisar as alterações**).

No topo: "Revisão:" e o título da sessão, o branch e a base dele, quantos arquivos e quantos estão "sem commit", um link para o pull request, se houver, e **Sessão** para voltar.

Cada arquivo alterado mostra a letra de status (A adicionado, M alterado, D excluído, R renomeado), o caminho, uma etiqueta "sem commit" quando for o caso, as linhas adicionadas e removidas e, abaixo, as alterações dele.

- Marque **Visto** em um arquivo que você já leu: ele se recolhe e conta para "… de … vistos". A marca dura até o arquivo mudar de novo e fica guardada neste navegador.
- Em uma tela larga, uma lista dos arquivos fica à esquerda com uma barra de progresso: clique em um arquivo para ir até ele.
- **Guiar-me pela revisão**: um modelo lê as alterações e escreve um resumo curto, uma ordem fácil de seguir (a ideia central primeiro, depois o que a usa, testes e documentação por último) e uma nota em cada arquivo sobre o que mudou e no que prestar atenção. Depois, **Ordem guiada** e **Por caminho** alternam entre essa ordem e os arquivos por nome. O guia é guardado para exatamente estas alterações, então ele estará lá da próxima vez até o branch mudar.
- **Recarregar** lê as alterações de novo.

Arquivos novos que o git ainda não rastreia aparecem quando são arquivos de texto pequenos. Arquivos binários dizem "Um arquivo binário: não há alterações de texto para mostrar."

## Usar o terminal

Clique em **Sistema** e depois em **Terminal**, ou vá para [Terminal](/terminal): shells reais neste computador. Se nenhum estiver aberto, um é iniciado na sua pasta pessoal.

- Cada terminal é uma aba, com o nome da pasta e do programa que está rodando nele. **Novo terminal** (+) abre outro, também na sua pasta pessoal.
- Clique duas vezes em uma aba para renomeá-la.
- ✕ fecha um terminal. Se ainda houver um programa rodando nele, o app pergunta antes, pois fechar encerra o shell e tudo o que ele executa.
- Os links na saída abrem em uma nova aba.

Os terminais rodam no servidor tmux privado do próprio app, então continuam rodando quando você sai da página, a recarrega ou fecha o navegador, e também durante reinicializações do app: ao voltar, eles estão como você os deixou.

Para abrir um terminal em outra pasta, comece a partir dela: na página Arquivos, no menu de uma pasta ou em **Mais** (⋯) para a pasta em que você está (**Abrir um terminal aqui**), no editor (**Terminal nesta pasta**), em um repositório na página Git (**Abrir um terminal aqui**) e no menu da sessão → **Pasta e código** → **Abrir um terminal aqui**.

### O painel do terminal

Em um computador, `` Ctrl+` `` (também no Mac) mostra ou oculta um painel de terminal na parte inferior de qualquer página, com os mesmos terminais da página Terminal. Arraste a borda superior para deixá-lo mais alto ou mais baixo e clique em **Ocultar painel** para fechá-lo. A opção **Mostrar ou ocultar o painel do terminal**, na caixa de busca, faz o mesmo. Os terminais abertos a partir de outras páginas aparecem neste painel.

### Sugestões em cinza

Enquanto um shell espera por um comando, o mais provável restante do que você está digitando aparece em cinza depois do cursor:

- → ou End aceita tudo; Ctrl+→ (ou Alt+→) aceita a próxima palavra.
- As sugestões vêm de comandos que você digitou antes (primeiro os executados na mesma pasta, e os recentes e frequentes antes dos antigos), do histórico do próprio shell e de comandos que agentes executaram recentemente.

Ctrl+Espaço (também no Mac), ou **Sugestões** na barra de abas, abre uma lista com mais opções:

- comandos anteriores que começam com o que você digitou;
- o que combina com a palavra que você está digitando: comandos e branches do git, os scripts do projeto (`npm run …`), alvos do make, hosts SSH, pastas e arquivos;
- depois de digitar algumas letras, **Escrever um comando para "…"**, mais abaixo.

↑ e ↓ escolhem, Enter ou um clique coloca o comando na linha, e Esc fecha a lista. Nada é executado sozinho: você sempre pressiona Enter no shell.

As sugestões funcionam apenas no prompt de um shell, não dentro de um programa como um editor ou o Python. Comandos que começam com um espaço, e os que parecem conter uma senha ou chave, não são memorizados. Desative o texto em cinza em [Configurações → App → Geral → Sugestões do terminal](/settings?s=general&find=Terminal%20suggestions); a lista do Ctrl+Espaço funciona de qualquer jeito.

### Pedir um comando em palavras

Digite o que você quer em palavras simples no prompt, como `encontrar os maiores arquivos aqui`, pressione Ctrl+Espaço e escolha **Escrever um comando para "encontrar os maiores arquivos aqui"**. Um modelo (o Claude quando o Claude Code está conectado, ou o Codex caso contrário) escreve até três comandos que combinam com o seu shell e a sua pasta, cada um com uma breve nota sobre o que faz. Escolha um para colocá-lo na linha, leia-o e pressione Enter você mesmo para executá-lo.

### No celular

A página Terminal acrescenta uma fileira de teclas que os celulares não têm: **Ctrl** e **Alt** (valem para a próxima tecla que você digitar), **Sugestões**, ^C, ^D, ^Z, ^L, ^R, Esc, Tab, as setas, `|`, `/`, `-`, `~`, Home e End. Não há painel inferior no celular: os terminais abertos a partir de outras páginas abrem na página Terminal.

## Ver um servidor de desenvolvimento com a Prévia

Quando você ou um agente executa o servidor de desenvolvimento de um app web aqui (`npm run dev`, um servidor Python), a Prévia o mostra, neste computador ou em qualquer outro dispositivo que alcance o app. Clique em **Sistema** e depois em **Prévia**, ou vá para [Prévia](/preview).

À esquerda, **Apps web** lista os servidores deste computador que respondem com uma página web: cada um com o nome do seu projeto (o do pacote, ou então o da pasta), a porta, o título da página, o que o serve quando o app consegue identificar (Vite, Next.js, Python…) e a pasta. **Outros servidores**, recolhido, lista o resto: APIs, bancos de dados e similares. **Outra porta** abre um servidor que não está na lista. A lista é atualizada a cada 5 segundos; o botão de atualizar a lê na hora.

Clique em um app web para mostrá-lo à direita. Em um computador, o primeiro aparece de imediato; em um celular, ele ocupa a tela inteira, com **Todos os servidores** para voltar. Acima dele:

- **Voltar**, **Avançar** e **Recarregar**, e a barra de endereço com a porta e o caminho da página. Ela acompanha os links em que você clica dentro do app; digite outro caminho e pressione Enter para ir até ele.
- **Computador**, **Tablet** e **Telefone**: o app na largura dessa tela (a de um telefone é de 390 pixels), reduzido para caber.
- **Mais** (⋯): **Abrir em uma aba própria**, **Perguntar a um agente sobre esta tela** (a tela inicial abre com uma imagem da tela anexada, configurada para trabalhar na pasta do app, e "Sobre esta tela de …" para você completar), **Salvar uma imagem** e **Mostrar como imagem** ou **Mostrar ao vivo**.

### Ao vivo ou como imagens

A Prévia mostra um servidor de desenvolvimento ao vivo pela porta de prévia do app (8791, a menos que a sua instalação defina outra), o que mantém o servidor de desenvolvimento separado do app: o seu login nunca chega até ele, e o hot reload funciona. Um navegador mostra a prévia de um servidor por vez: mostrar outro move a porta de prévia para ele.

Quando o seu navegador não consegue alcançar a porta de prévia (por exemplo, se você acessa o app por um túnel ou um proxy com um único hostname), a página é aberta em um navegador neste computador, no tamanho que você escolheu, e transmitida para a Prévia ao vivo: clique, digite, role e cole nela como em qualquer página, e o hot reload também aparece ali. No celular, toque e arraste; **Digitar**, sob a página, abre o teclado, junto de teclas que os celulares não têm (Tab, Enter, Esc, as setas). A página alcança apenas esse servidor de desenvolvimento, não os outros servidores deste computador. Ao voltar para a Prévia, ela está onde você a deixou; depois de 15 minutos sem ninguém olhando, ela se fecha e abre de novo quando você voltar. **Salvar uma imagem** e **Perguntar a um agente sobre esta tela** capturam a página como ela está na tela.

Para ter a própria página no seu navegador em vez de transmitida:

- na mesma rede, ou por uma VPN como Tailscale ou WireGuard, abra o app no endereço deste computador: a porta funciona diretamente;
- atrás de um túnel ou de um proxy, dê à porta de prévia um hostname próprio (preview.example.com → localhost:8791) e inicie o app com `PREVIEW_ORIGIN` definido com ele.

**Mostrar como imagem** em **Mais** (⋯) mostra, em vez disso, imagens estáticas capturadas neste computador; **Recarregar** então captura uma nova. A transmissão e as imagens exigem um Chromium neste computador: o que o navegador usa ([Configurações → Recursos → Navegador](/settings?s=browser) pode baixar um). “Previews are off” (as prévias estão desativadas) significa que o app foi iniciado com `PREVIEW_PORT=0`. A Prévia existe apenas para a máquina em que você abriu o app, não para outras máquinas para as quais você alterna.

## Revisar as mudanças de um agente em um app web

Quando um agente muda a aparência ou o funcionamento de um app web (um site ou um app com servidor de desenvolvimento, ou arquivos HTML), ele mostra capturas de tela para você revisar: antes da primeira mudança, uma imagem de cada tela que ele vai alterar, e, quando termina, as mesmas telas de novo. Ele inicia primeiro o servidor de desenvolvimento do app quando este não está rodando.

Um agente que tem capturas de tela como arquivos (ele as fez com um script, em outro navegador, ou as recebeu) as mostra do mesmo jeito, em um só cartão, em vez de imagens coladas na resposta. Isso não precisa de Chromium neste computador e funciona também em uma [sessão confidencial](/guide/sessions#keep-a-session-confidential).

- As capturas de uma mesma resposta aparecem juntas, em um só cartão de imagens pequenas, uma para cada tela. O agente pode agrupar as telas sob títulos próprios ("Adicionar um servidor", "Configurações"). Um cartão **Antes** mostra as telas como eram; em um cartão **Antes e depois**, o par de uma tela é marcado com **Antes → depois**, com o antes e o depois divididos ao meio.
- As outras versões de uma tela fazem parte da sua imagem, não são mais imagens: um ícone de telefone marca uma tela que o agente capturou também no tamanho de um telefone, e um ícone de sol e lua uma que ele capturou também nos temas escuro e claro (quando só algumas telas têm os dois). Quando uma resposta tem mais telas do que cabem em uma fileira, o cartão mostra a primeira fileira com **Mostrar tudo** embaixo (**Mostrar menos** as recolhe de novo).
- Clique em uma imagem para revisá-la: em uma tela larga, ela abre ao lado da conversa, como as páginas; em uma janela mais estreita ou em um celular, sobre o app. As setas no topo vão para as outras telas da resposta. Se o agente escreveu uma nota sobre a tela, ela aparece no topo.
- Os botões de computador e telefone alternam entre os tamanhos, e os de lua e sol entre os temas escuro e claro, quando o agente capturou ambos. **Ver em tamanho grande** abre as imagens sobre o app.
- Quando o agente deu uma imagem de antes para uma tela, o antes e o depois dela aparecem um sobre o outro: arraste o controle deslizante (ou pressione ← e →) para alternar entre eles, ou escolha **Lado a lado**.
- **Parece bom** e **Mudar algo** colocam uma linha sobre a tela na caixa de mensagem, para você completar e enviar.
- Em uma tela larga, o depois de uma tela abre sozinho ao lado da conversa quando chega.
- Uma imagem de depois sem uma de antes aparece sozinha, com "Não há imagem de antes para comparar"; o agente é instruído a capturar a de antes primeiro da próxima vez.

Você também pode pedir uma captura de tela a qualquer momento: "mostre a página de configurações em um celular", ou "no tema escuro" (um site que segue o claro ou escuro do seu computador aparece no que você indicar, e no claro caso contrário). Uma página que um agente fez para a conversa ou guardou em um projeto (um protótipo, um relatório) é mostrada como o app a exibe, no tema escuro a menos que o claro seja pedido, para que o agente veja o que não ficaria legível antes de você. As imagens que o app captura de um app web são capturadas neste computador por um Chromium ([Configurações → Recursos → Navegador](/settings?s=browser)); as que um agente mostra a partir de arquivos são copiadas para o app. Nos dois casos são guardadas com a sua sessão, então continuam lá depois que o agente arruma os próprios arquivos: elas somem quando a sessão é excluída, e as mais antigas são apagadas primeiro quando o total passa de 500 MB.

## Acompanhar este computador no Monitor

Clique em **Sistema** e depois em **Monitor**, ou vá para [Monitor](/system/monitor). No topo: o nome do computador, o processador, quantas threads ele tem, há quanto tempo está ligado e o sistema operacional.

Os blocos no topo mostram, com um pequeno gráfico dos últimos dois minutos:

- **CPU**: o quanto o processador está ocupado e as médias de carga.
- **Memória**: quanto está em uso, de quanto.
- **GPU × n** (quando há GPUs NVIDIA): uso médio e memória gráfica em uso.
- **Rede**: dados que entram e saem por segundo.
- **E/S de disco**: dados lidos e gravados por segundo.

Abaixo, com mais detalhes:

- **CPU**: um gráfico, a carga de cada núcleo e a temperatura quando conhecida.
- **Memória**: um gráfico, a RAM em uso com cache e buffers, o swap e quanto está disponível.
- Um cartão por **GPU**: uso, memória gráfica, consumo de energia em relação ao limite, temperatura, ventoinha, estado de desempenho e velocidade do clock (em um celular, sem o gráfico).
- **Rede**: download e upload, e cada conexão de rede.
- **Armazenamento**: leituras e gravações, e cada disco com seu espaço livre, sistema de arquivos e o quanto está cheio.
- **Sensores**: temperaturas, em vermelho a partir de 85 °C.
- **Kernels de notebook** (enquanto algum estiver executando): cada um com seu ambiente, estado, memória, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para desktop) para o seu notebook, e **Encerrar**.
- **Sessões** (enquanto alguma estiver executando, no Linux e no Mac): os programas de cada sessão ativa (os do seu agente, os comandos que ela executa, os servidores que iniciou), com mais memória primeiro, com quantos são, a CPU e a memória deles. À direita, os limites sob os quais as sessões rodam: clique neles para alterá-los ([Limitar cada sessão](/guide/app#limit-each-session)). Clique em uma sessão para abri-la.
- **Processos**: os 12 programas mais ocupados por **CPU** ou **Memória** (ou **GPU**, para os que usam uma), com ID do processo, usuário, CPU e memória. Aponte para uma linha para ver o comando completo.

Ele faz uma leitura a cada 2 segundos enquanto a página está aberta e guarda os últimos 10 minutos.

## Pedir a um agente

- "No arquivo que estou com aberto, adicione um comentário acima de cada função dizendo o que ela faz."
- "Copie os PDFs de ~/Downloads desta semana para o meu projeto Impostos 2026."
- "Mova o acompanhamento de leituras do meu projeto Tese para a pasta notes dele."
- "Preencha o ~/Downloads/rental-application.pdf com os meus dados e me pergunte o que você não souber."
- "Resuma os meus destaques de ~/Papers/sparse-retrieval.pdf, página por página, com as minhas notas."
- "Quais das minhas notas sobre o artigo que estou com aberto discordam do que o artigo diz?"
- "Guarde as minhas notas sobre ~/Papers/attention.pdf no meu projeto Tese."
- "Destaque em verde toda frase de ~/Papers/sparse-retrieval.pdf que apresenta um resultado, com uma nota dizendo de qual experimento ela vem."
- "Junte os PDFs de ~/Documents/Scans em um só arquivo, com a capa primeiro, e endireite as páginas que estão de lado."
- "Quais arquivos em ~/code/shop mencionam o checkout, e o que cada um faz com ele?"
- "Adicione uma coluna a ~/Documents/people.csv com a parcela de cada pessoa no total."
- "Crie em ~/code/ml um notebook que treina um pequeno classificador de imagens, execute-o e configure um ambiente em que eu possa executá-lo."
- "Abra um pull request para o branch desta sessão, com um título e uma descrição escritos a partir dos commits."
- "Vincule https://github.com/acme/site/pull/42 a esta sessão."
- "As verificações do pull request desta sessão já passaram?"
- "Escreva um guia de leitura para o que este branch muda."
- "Resolva os conflitos de merge em ~/code/shop-api: mantenha o que cada lado pretendia e depois me diga o que você escolheu."
- "O que mudou em ~/code/shop-api esta semana? Resuma os commits em palavras simples."
- "A busca ficou lenta depois da v2.3 em ~/code/shop-api: encontre o commit que a deixou lenta."
- "Quais servidores de desenvolvimento estão rodando neste computador agora?"
- "Deixe o botão da página de checkout maior e me mostre o antes e depois em um celular, no tema escuro."
- "Rode os testes do Playwright que tiram capturas de cada página e mostre-as sob um título para cada parte do app, com as do celular ao lado das do computador."
- "O que está usando mais memória neste computador?"
