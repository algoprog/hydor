# Documentos, imagens, vídeos e voz

Os agentes do Hydor leem PDFs, Word, Excel, PowerPoint e outros documentos, criam novos para você e os entregam como cartões que você abre ou baixa; também podem criar imagens, desenhos, gráficos e vídeos curtos, encontrar fotos gratuitas, alterar suas imagens e vídeos (recortar, remover o fundo, apagar, cortar trechos) e criar músicas, narrações e sons, com modelos e ferramentas de imagem, vídeo e áudio neste computador, e você pode guardar o que eles criam nos arquivos de um projeto. Você também pode falar em vez de digitar, ouvir as respostas em voz alta ou conversar com o app no modo mãos livres enquanto caminha.

![Um agente que leu um relatório e criou um resumo de uma página em Word e uma planilha com um gráfico](images/documents-voice.webp)

## Dê um documento para um agente ler

Todo agente que o app executa pode ler documentos: Claude Code, Codex, Custom e os agentes que falam ACP e aceitam servidores MCP. Você não precisa converter nada antes. Dê o documento de uma destas formas:

1. **Anexe à sua mensagem**: o clipe de papel (**Anexar arquivos**) na caixa de mensagem, ou arraste o arquivo para a caixa, ou cole-o. As imagens vão para o modelo como imagens; qualquer outro arquivo é salvo no computador que executa o Hydor, e o caminho dele é adicionado à sua mensagem para que o agente possa abri-lo. Uma mensagem leva até 25 MB de arquivos.
2. **Cite um arquivo deste computador**: “Resuma ~/Documents/lease.pdf”. Um caminho que não começa com `/` ou `~` parte da pasta da sessão.
3. **Guarde documentos em um projeto ou no Conhecimento compartilhado**, para que as sessões possam pesquisá-los e citar a página: veja [Projetos e conhecimento](/guide/projects).

Enquanto o agente lê, o trabalho dele mostra **Lendo lease.pdf** e depois **Leu lease.pdf**. Em uma tela mais larga, a linha também diz o que é o documento (o tipo, as páginas, planilhas ou slides) e quais linhas foram lidas. Clique na linha para ver o texto que o agente recebeu e em **Abrir lease.pdf** para ver o próprio arquivo.

Um documento longo é lido em partes, cerca de 1.200 linhas por vez, e o agente é avisado quando há mais. Os agentes são orientados a tratar o que um documento diz como informação, não como instruções. Nada em um documento é executado: as macros nunca são executadas, e só os links da web e de e-mail são mantidos.

O Custom também lê PDFs, documentos do Office e imagens com a leitura de arquivos comum dele: veja [Custom, o agente próprio do app](/guide/custom).

## O que os agentes podem ler em um documento

### PDF

- O texto de cada página, organizado como na página.
- Funciona melhor com o programa pdftotext (no poppler-utils). Sem ele, o app baixa o pdf.js uma vez (cerca de 35 MB, o que exige internet nessa primeira vez), e o layout fica apenas aproximado.
- Páginas digitalizadas não têm texto, e o agente é informado quais são (“As páginas 3, 5–7 não têm texto”). Com a habilidade **pdf**, ele então olha essas páginas como imagens e as lê sozinho, ou executa OCR nelas quando o tesseract está instalado.
- Um PDF protegido por senha não pode ser lido. Informe a senha ao agente, e a habilidade **pdf** cria uma cópia desbloqueada. Um PDF que abre sem senha, mas limita alterações (muitos formulários oficiais), é lido como qualquer outro.
- **Formulários**: o agente lista os campos de formulário de um PDF, cada um com as palavras impressas ao lado (que dizem para que serve um campo chamado “f1_02”), e olha as páginas como imagens com os campos numerados e uma régua em pontos.
- **Seus destaques e notas**: o que você destacou no leitor de Arquivos, página por página, com suas notas e imagens das figuras e equações que você escolheu ([Ler e destacar um PDF](/guide/files-git#read-and-highlight-a-pdf)), para resumi-los ou conferi-los com o artigo. Se você pedir, ele também destaca palavras para você, e elas aparecem no leitor.

### Word, Excel e PowerPoint

- **Word** (.docx e suas variações com macro e modelo): títulos, parágrafos, listas numeradas e com marcadores, tabelas, links, caixas de texto, imagens pela descrição, notas de rodapé, notas de fim e comentários.
- **Excel** (.xlsx e suas variações com macro e modelo): cada planilha como uma tabela com números de linha e letras de coluna, números mais ou menos como formatados (datas, porcentagens, valores em dinheiro) e até 40 fórmulas de cada planilha. Planilhas ocultas são marcadas. De cada planilha são lidas as primeiras 2.000 linhas e 60 colunas, e o agente é avisado quando há mais; para ler uma planilha maior por inteiro, a habilidade **spreadsheets** a carrega de outra forma.
- **PowerPoint** (.pptx e suas variações com macro, modelo e apresentação de slides): o título, o texto, as tabelas, as imagens (pela descrição), os gráficos (título e séries) e as notas do apresentador de cada slide. Slides ocultos são marcados. Até 1.000 slides.

### OpenDocument, EPUB, CSV e RTF

- **OpenDocument** (.odt, .ods e .odp do próprio LibreOffice, seus modelos e .odg): texto com títulos, listas, tabelas, links e notas de rodapé; planilhas como são exibidas; slides com títulos, texto e notas.
- Livros **EPUB**: os capítulos na ordem de leitura, com títulos, listas, tabelas e citações.
- Tabelas **CSV** e **TSV** e texto **RTF**.

### Arquivos antigos do Office, arquivos protegidos e arquivos muito grandes

- Arquivos .doc, .xls e .ppt antigos são lidos pelo LibreOffice, que primeiro os converte para o formato atual. Sem o LibreOffice, eles não podem ser lidos, e o agente é orientado a pedir a você o arquivo salvo como .docx, .xlsx ou .pptx, ou a pedir que o LibreOffice seja instalado.
- Arquivos do Word, Excel e PowerPoint protegidos por senha não podem ser lidos.
- Arquivos de até 300 MB são lidos. Um documento fornece até cerca de 1.000.000 de caracteres de texto (cerca de 250.000 tokens); acima disso, ele é cortado, e o agente é avisado.

## Peça a um agente que crie um documento

O app vem com quatro habilidades de documentos que todo agente pode carregar: **word-documents**, **spreadsheets**, **presentations** e **pdf**. Você as encontra em [Configurações → Habilidades](/settings?s=skills&find=Built%20in), em **Documentos** (veja [Habilidades](/guide/skills)). Você não as escolhe: peça com palavras simples (“Faça um currículo de uma página a partir das minhas notas, como documento do Word”, “Coloque estas despesas em uma planilha com totais mensais e um gráfico”, “Faça 8 slides para minha palestra sobre abelhas”, “Junte estes três PDFs”), e o agente carrega a habilidade certa quando a tarefa pede.

Cada habilidade funciona da mesma forma:

1. O agente planeja o documento primeiro: o esboço, as planilhas ou os slides.
2. Ele escreve o arquivo com um pequeno script na pasta da sessão.
3. Ele olha o resultado como imagens das páginas, verifica se há texto saindo da página, tabelas que não cabem e slides cheios demais, e corrige o que estiver errado.
4. Ele entrega o arquivo como um cartão abaixo da resposta, com uma legenda curta (veja [Abra ou baixe os arquivos que um agente criou](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Quando ele altera um arquivo seu, salva o resultado com outro nome, a menos que você peça para sobrescrever o seu.

### Documentos do Word

Relatórios, cartas, currículos, memorandos, contratos, formulários, material impresso e notas, para abrir no Word, no Google Docs ou no Pages.

- Estrutura de verdade: títulos (que funcionam no painel de navegação do Word e com leitores de tela), listas com marcadores e numeradas, tabelas com linha de cabeçalho, imagens e quebras de página.
- Um sumário (o Word o preenche quando o arquivo abre), números de página (“Página 1 de 3”), links e células de tabela sombreadas.
- A4 ou Carta dos EUA, e fontes que ficam iguais em qualquer computador (Calibri, Arial, Cambria, Times New Roman).
- Seus próprios documentos alterados no próprio arquivo, mantendo estilos, cabeçalhos e layout; texto substituído sem perder a formatação; comentários adicionados.
- Assinado com sua assinatura salva: no lugar de {{signature}}, logo depois de palavras como “Assinatura:”, na célula de uma tabela ou no final, depois que você permitir em um cartão ([Assinaturas](/guide/library#signatures)).
- Também um PDF dele, pelo LibreOffice.

### Planilhas

Orçamentos, controles, cronogramas, faturas e tabelas de dados (.xlsx).

- Seus números como valores e os resultados como fórmulas, para que você altere um número e veja o resto acompanhar.
- Formatos de número para dinheiro, porcentagens e datas; uma linha de cabeçalho em negrito que fica sempre visível; larguras de coluna; filtros em listas.
- Gráficos de barras, linhas e pizza ao lado dos dados.
- Uma verificação de todas as fórmulas. Com o LibreOffice instalado, a verificação calcula as fórmulas e lista os erros (#REF!, #DIV/0!, #NAME?), que o agente então corrige.
- Suas próprias pastas de trabalho alteradas, mantendo fórmulas, estilos e a maior parte do layout (tabelas dinâmicas não são mantidas, e os gráficos só quando o agente os cria de novo). Um arquivo CSV no lugar, quando você pedir.

### Apresentações

Apresentações para investidores, palestras, aulas e resumos (.pptx), para exibir no PowerPoint, no Keynote ou no Google Slides.

- Slides 16:9 limpos, com o mesmo visual do início ao fim e a cor da sua marca: um slide de título, tópicos com níveis, duas colunas, imagens ajustadas ao slide, tabelas, gráficos (colunas, barras, linhas, pizza, empilhados), slides de seção e notas do apresentador para o que você vai dizer.
- Uma ideia por slide, com títulos que dizem o ponto principal (“As vendas cresceram 12%”), geralmente de 6 a 12 slides para uma palestra.
- Imagens suas, da web ou criadas com um modelo de imagem (veja [Deixe os agentes criarem imagens](/guide/documents-voice#let-agents-make-images)).
- Uma nova apresentação no seu próprio modelo, ou a sua apresentação alterada, mantendo o tema e os layouts.
- Um PDF dos slides, pelo LibreOffice.

### PDFs

Relatórios, faturas, certificados, folhetos, cartas e formulários.

- Principalmente texto, ou algo que você vai querer editar: o agente cria um documento do Word e, a partir dele, um PDF com o LibreOffice.
- Layout exato (faturas, certificados, ingressos, formulários): ele desenha o PDF diretamente.
- Slides ou uma planilha em PDF: criados com a habilidade correspondente e depois convertidos em PDF.
- **Preencher um formulário**: seus campos pelo nome (texto, marcações, opções, em grego, chinês ou qualquer escrita), para que qualquer leitor os mostre e eles ainda possam ser alterados ali; ou, para um formulário que é só linhas e caixas impressas, as palavras escritas na página ao lado das palavras impressas (“Data de nascimento:”) e marcações nas caixas; em um formulário digitalizado, que não tem palavras para encontrar, onde o agente vê os espaços em branco em uma imagem da página. O agente pergunta a você o que não sabe e olha as páginas antes e depois. Um formulário com assinatura digital continua válido quando só os campos são preenchidos. Formulários XFA (Adobe LiveCycle) só são preenchidos nos apps da própria Adobe: o agente avisa isso e ainda pode escrever nas páginas deles.
- **Escrever nas páginas**: palavras, marcações e cruzes, imagens, caixas brancas sobre o que está lá (elas escondem as palavras só da vista: as palavras continuam no arquivo, então isso não é uma redação de sigilo), contornos e linhas, e destaques e comentários no formato próprio do PDF, que outros leitores listam e podem remover.
- **Alterar páginas**: girá-las, excluí-las, movê-las, inserir páginas em branco, juntar PDFs, extrair algumas páginas para um arquivo próprio ou dividir um em vários. Um arquivo alterado assim não pode manter uma assinatura digital, e o agente avisa isso.
- O que o agente escreve vai em uma cópia ao lado do arquivo (“nome (preenchido).pdf”), a menos que você peça para alterar o próprio arquivo; nesse caso, a versão antiga vai para a Lixeira. Você também pode preencher e assinar um PDF você mesmo: [Preencher e assinar um PDF](/guide/files-git#fill-in-and-sign-a-pdf).
- Palavras grandes e esmaecidas, como RASCUNHO, em todas as páginas, e uma cópia sem a senha (você informa a senha), com a habilidade **pdf**.
- Assinado com sua assinatura salva, ao lado de palavras em uma página ou em um ponto que ele mostra primeiro, depois que você permitir em um cartão; adicionada ao PDF sem alterar o que já estava nele ([Assinaturas](/guide/library#signatures)).
- Arquivos do Office convertidos em PDF.

### O que o computador precisa

Isto diz respeito ao computador que executa o Hydor, não ao dispositivo de onde você o usa.

- **Python 3**, com o módulo venv: necessário para criar documentos. Na primeira vez, as habilidades instalam algumas bibliotecas Python para arquivos do Office e PDFs em uma pasta privada do app (cerca de 30 MB, uma só vez, pela internet); nada é instalado no sistema todo. Se o Python estiver ausente, o agente informa o único comando a executar (no Debian ou Ubuntu `sudo apt install python3 python3-venv`; em um Mac `brew install python`).
- **LibreOffice** (opcional): visualizações como páginas diagramadas no visualizador de arquivos, leitura de arquivos .doc, .xls e .ppt antigos, agentes olhando documentos do Office como páginas, verificação de fórmulas e PDFs a partir de arquivos do Office. No Debian ou Ubuntu: `sudo apt install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui`; em um Mac: `brew install --cask libreoffice`.
- **poppler-utils** (opcional): a melhor leitura de PDF e imagens das páginas de PDF para os agentes e para **Preencher e assinar**. Sem ele, o app as desenha com o que o computador tem (o recurso próprio do Mac ou do Windows para desenhar PDFs) ou com o navegador de **Configurações → Navegador**. No Debian ou Ubuntu: `sudo apt install poppler-utils`; em um Mac: `brew install poppler`.
- **tesseract** (opcional): OCR para PDFs digitalizados.

Sem o LibreOffice ou o poppler-utils, os agentes releem seus arquivos como texto para conferi-los e mantêm o layout simples.

## Abrir ou baixar os arquivos que um agente criou

Quando um agente cria arquivos para você (um documento, uma planilha, slides, um PDF, imagens, um arquivo compactado), ele os entrega como cartões abaixo da resposta, até 12 por vez. Cada cartão tem:

- um ícone por tipo, na sua cor (azul para Word, verde para Excel, laranja para PowerPoint, vermelho para PDF), ou uma imagem pequena no caso de uma imagem;
- o nome do arquivo, o que ele é e o tamanho ("Documento do Word · 24 KB");
- a legenda do agente ("O orçamento, uma planilha por trimestre");
- **Abrir**, um botão de download e **Mais** (⋯).

**Abrir** mostra o arquivo no visualizador de arquivos, em uma janela sobre a conversa, que continua onde estava (no celular, a janela sobe da parte de baixo da tela). **Abrir em Arquivos**, no topo da janela, leva o arquivo para a página Arquivos; a cruz, ou Escape, fecha a janela. Acima do arquivo aparece o caminho dele, como na página Arquivos ([Abrir e editar um arquivo](/guide/files-git#open-and-edit-a-file)); uma pasta nesse caminho abre na mesma janela, com o arquivo selecionado ali (antes ele pergunta sobre alterações não salvas), e **‹** no topo da janela volta para o arquivo. O botão de download salva o arquivo no seu dispositivo.

**Mais** (⋯), em um cartão e no topo da janela, tem **Começar uma sessão com ele** (a página inicial, com o arquivo na caixa de mensagem), **Adicionar a um projeto** (copia o arquivo para a pasta de um projeto), **Manter uma cópia** (um notebook Jupyter, uma apresentação do PowerPoint, um documento do Word ou Markdown, uma planilha ou um arquivo LaTeX: uma cópia mantida como um documento próprio, no editor dele, nos arquivos do projeto que você escolher quando tiver projetos, o da sessão em primeiro lugar), **Mostrar em Arquivos** (em um cartão), **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para computador; veja [Trabalhar com arquivos e pastas](/guide/files-git#work-with-files-and-folders)) e **Copiar caminho**. Veja [Começar uma sessão com arquivos](/guide/files-git#start-a-session-with-files) e [Adicionar arquivos a um projeto](/guide/files-git#add-files-to-a-project).

Um arquivo excluído ou movido desde então aparece como **Não está mais lá**. Se um agente citar um arquivo que não existe, você vê "Could not show the files" com o motivo, e o agente é avisado para corrigir.

### Documentos que ele criou ou alterou, e nomes de arquivos na resposta

Abaixo da resposta de um agente, os documentos que ele criou ou alterou naquela vez aparecem sempre como cartões, tenha ele os entregado ou não: PDF, Word, Excel, PowerPoint e arquivos OpenDocument, tabelas CSV e TSV, LaTeX, notebooks Jupyter, EPUB e Markdown. São os que as edições dele gravaram e os que os comandos dele criaram na pasta da sessão enquanto a vez rodava (os que a vez cita, ou que ficam ao lado de um arquivo que ele alterou: outras sessões trabalhando na mesma pasta não incluem os delas).

- Cada cartão diz **Nova** ou **Atualizado**, com o tipo e o tamanho, e tem **Abrir**, um botão de download e **⋯**, como os cartões acima.
- Os documentos prontos (um PDF, um arquivo do Word…) vêm antes de seus originais (LaTeX, Markdown, tabelas). Os quatro primeiros aparecem; **Mostrar mais N documentos** mostra o resto e **Mostrar menos** os recolhe de novo.
- Um arquivo que o agente entregou mantém o próprio cartão e a própria legenda, e não aparece duas vezes. Um arquivo que não está mais lá fica de fora. Imagens, código e arquivos de dados não aparecem assim (o agente ainda entrega as imagens).

Nomes de arquivos e caminhos em uma resposta são links. Um nome ou caminho em código (`report.tex`, `docs/report.pdf`, `src/app.ts:42`, que abre nessa linha), um caminho absoluto ou com `~/` no texto e um link para um arquivo abrem o arquivo na janela sobre a conversa, como o **Abrir** de um cartão. Um nome sozinho abre o arquivo da conversa com esse nome; um caminho que não começa na raiz é a partir da pasta da sessão.

## Visualizar um documento no visualizador de arquivos

O visualizador de arquivos mostra documentos a partir de um cartão, da página Arquivos ou de um link em uma resposta (veja [Sistema: arquivos, Git, Terminal e Visualização](/guide/files-git)).

- **PDFs** aparecem como são, na visualização de PDF do próprio navegador, com **Preencher e assinar** para preenchê-los e assiná-los ([Preencher e assinar um PDF](/guide/files-git#fill-in-and-sign-a-pdf)).
- Arquivos do **PowerPoint** (.pptx, e suas versões com macro, de apresentação e de modelo) abrem em **Slides**: "Its slides, as the app draws them". Cada slide aparece como é, como mostra uma apresentação mantida (com imagens, formas, tabelas, gráficos, plano de fundo e rodapé no lugar), um embaixo do outro, com o número e as notas do apresentador, também no celular. Uma fonte que a apresentação usa e que este computador não tem é substituída por outra; quando essa precisa de mais espaço, as palavras de uma caixa ficam um pouco menores para caber, de modo que nada seja cortado. **Texto** ("Its words and speaker notes") mostra as palavras dos slides, e **Páginas** mostra os slides diagramados pelo LibreOffice, quando ele está instalado. Se os slides não puderem ser desenhados, o visualizador abre em **Texto** e diz por quê.
- Arquivos do **Word, Excel, PowerPoint, OpenDocument, EPUB e RTF** (também os antigos .doc, .xls e .ppt) aparecem como uma visualização. Quando o LibreOffice está instalado, um seletor no topo oferece duas visões:
  - **Páginas**: "As LibreOffice lays it out", cada página como seria impressa. Na primeira vez leva um momento ("Laying out the pages…"); depois disso as páginas abrem na hora até o arquivo mudar.
  - **Texto**: "Its text, sheets and slides", como o app os lê. Um documento de texto aparece como uma folha de papel; uma pasta de trabalho como uma grade com letras de coluna, números de linha e uma aba para cada planilha na parte de baixo (as planilhas ocultas são marcadas com um olho riscado); os slides como cartões, cada um com o número e as notas do apresentador abaixo. As imagens aparecem como uma caixa com a descrição delas. Uma linha no topo avisa quando algo ficou de fora ("Shows the first 1000 rows").
- Sem o LibreOffice há apenas a visão **Texto**. Os livros EPUB sempre abrem nela.
- No celular, a visualização abre em **Texto** (um arquivo do PowerPoint em **Slides**), que rola e dá zoom melhor em uma tela pequena; o seletor mostra as páginas.

Se o LibreOffice não conseguir diagramar um arquivo, o visualizador avisa e o texto dele continua em **Texto**. Um arquivo sem visualização diz "No preview for this file": baixe-o para abri-lo no seu dispositivo. O botão de download do visualizador está sempre lá.

## Permitir que os agentes criem imagens

Peça uma imagem a qualquer agente ("faça um logotipo para a minha padaria", "transforme esta foto em uma aquarela") e ele a cria com um modelo de imagem pelo OpenRouter, salva na pasta da sessão e a mostra junto com a resposta. Configure em **[Configurações → Recursos → Imagens, vídeo e áudio](/settings?s=images)** (no celular: Configurações e depois **Imagens, vídeo e áudio**).

- **[Criação de imagens](/settings?s=images&find=Making%20images)**: o interruptor **Permitir que os agentes criem imagens**, ao lado do título do grupo, dá a todos os agentes as ferramentas para imagens: criar imagens, desenhos e gráficos, e tirar o fundo de uma imagem ou apagar parte dela. Fica ativado, a menos que você o desative; desativado, os agentes não as recebem.
- **A chave do OpenRouter**: os modelos de imagem, vídeo e áudio são acessados pelo OpenRouter, e cada imagem, vídeo ou som é pago com a sua chave do OpenRouter. Sem uma, esta seção avisa, com **Crie uma em openrouter.ai** e **Adicionar a chave**, que abre [Configurações → Agentes → Modelos → OpenRouter](/settings?s=models&find=OpenRouter), onde a chave é colocada (veja [Agentes, contas e modelos](/guide/agents-models)). Um agente que precise dela pede a você em um cartão ([Quando um agente precisa da chave do OpenRouter](#when-an-agent-needs-the-openrouter-key)).
- **[Para a maioria das imagens (Melhor)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)**: o modelo que cria cenas, fotos, pessoas, palavras dentro de uma imagem e diagramas, e toda alteração em uma imagem. Ele mostra o nome, com o fabricante, mais ou menos quanto custa uma imagem (para uma imagem de cerca de um megapixel) e o mês em que o OpenRouter o listou (o id dele está no (i)), com etiquetas: **Nova** (listado nos últimos 30 dias), **Edições** (aceita imagens para alterar ou seguir) e **Também texto** (escreve texto junto com as imagens). Até você escolher um, vale a escolha do app ("The app’s choice, until you pick one"): o primeiro de uma lista curta que o OpenRouter ainda oferece: Seedream 5.0 Pro e Flash, da ByteDance, depois modelos de imagem do Google Gemini, da OpenAI e FLUX.
- **[Para imagens simples (Rápido)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)**: um modelo mais barato e mais rápido para ícones, planos de fundo, texturas e imagens simples, mostrado da mesma forma. Até você escolher um, vale a escolha do app: o primeiro de uma lista curta de modelos rápidos que o OpenRouter ainda oferece, com o Seedream 5.0 Flash, da ByteDance, em primeiro lugar, depois modelos rápidos do Google, da Recraft, FLUX e da OpenAI (quando o OpenRouter não oferece nenhum deles, o modelo Melhor também cria as imagens simples).
- **[Ferramentas de imagem neste computador](/settings?s=images&find=Picture%20tools%20on%20this%20computer)**: tirar o fundo de uma imagem, apagar parte dela e ampliá-la neste computador em vez de pelo OpenRouter: de graça, e as suas imagens ficam aqui. **Configurar** baixa as ferramentas uma vez, a linha abaixo diz o que elas estão fazendo, e **⋯ → Remover** as tira deste computador de novo (veja [As ferramentas de imagem neste computador](/guide/library#the-picture-tools-on-this-computer)).

Para escolher o modelo Melhor ou o Rápido:

1. Clique em **Variação** ao lado dele: abre uma lista dos modelos de imagem do OpenRouter (**Modelo de imagem para a maioria das imagens (Melhor)** ou **Modelo de imagem para imagens simples (Rápido)**).
2. Pesquise por nome ("seedream", "flux", "gemini") e ordene por **Sugeridos** (as sugestões do app primeiro), **Mais recentes** ou **Mais barato**.
3. Clique em uma linha para usar esse modelo. Depois que você escolher um, o menu **⋯** da linha tem **Deixar o app escolher**, que volta para a escolha do app.

As listas vêm do OpenRouter e não precisam de chave; quando não é possível acessá-las, a lista avisa.

## Permitir que os agentes criem vídeos

Os agentes também podem criar vídeos curtos ("dez segundos de ondas ao entardecer", "faça esta foto do meu cachorro correr por um campo"), com um modelo de vídeo pelo OpenRouter, na mesma seção, **[Configurações → Recursos → Imagens, vídeo e áudio](/settings?s=images)**:

- **[Criação de vídeos](/settings?s=images&find=Making%20videos)**: o interruptor **Permitir que os agentes criem vídeos**, ao lado do título do grupo, dá a todos os agentes a ferramenta para isso. Fica ativado, a menos que você o desative.
- **[Modelo de vídeo](/settings?s=images&find=Video%20model)**: o modelo que os cria, mostrado com o fabricante, o que custa um segundo de vídeo (da resolução mais baixa sem som até a mais alta com som, como "$0.03 to $0.08 a second"), as durações que ele cria ("4 to 8 s"), a resolução máxima ("up to 1080p") e o mês em que o OpenRouter o listou, com etiquetas: **Som** (cria som junto com a imagem), **A partir de uma imagem** (pode partir de uma imagem que você fornece) e **Edita vídeos** (altera um vídeo que você fornece em vez de criar um a partir de palavras). Até você escolher um, vale a escolha do app: o primeiro de uma lista curta de modelos com som que o OpenRouter ainda oferece: Seedance 2.5, da ByteDance, depois modelos mais baratos e mais rápidos, como o Google Veo 3.1 Lite. **Variação** abre a lista para pesquisar ("seedance", "veo", "kling") e ordenar por **Sugeridos**, **Mais recentes** ou **Mais barato**.

- **[Usar a placa de vídeo para vídeos](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** (em **Edição de vídeos**): **Automático** cria os vídeos que você edita, e as edições dos agentes, na placa de vídeo quando há uma que funcione (NVIDIA, Intel, AMD ou Apple): bem mais rápido, e o processador fica livre. Ela é testada na primeira vez que um vídeo é criado, e a linha abaixo diz o que foi encontrado ("NVIDIA GeForce RTX 4090 · NVENC"); **Verificar agora** testa de novo. Se a placa falhar em uma edição, o processador a refaz na hora. **Desativada** cria os vídeos no processador.

Os vídeos custam bem mais que as imagens: de alguns centavos a dólares por segundo, e um vídeo de 8 segundos com som de um modelo de ponta pode custar vários dólares. Cada um é pago com a sua chave do OpenRouter, e você vê o preço em um formulário antes de qualquer coisa ser criada.

## Permitir que os agentes criem áudio

Os agentes também podem criar som: músicas e jingles ("um jingle de 30 segundos para o meu podcast"), locuções e narrações em uma voz que você descreve ("leia esta mensagem de boas-vindas com uma voz calorosa e lenta") ou em uma voz copiada de uma gravação que você tem, e efeitos sonoros e sons ambiente ("chuva em um telhado de zinco"). Configure na mesma seção, **[Configurações → Recursos → Imagens, vídeo e áudio](/settings?s=images)**:

- **[Criação de áudio](/settings?s=images&find=Making%20audio)**: o interruptor **Permitir que os agentes criem áudio**, ao lado do título do grupo, dá a todos os agentes a ferramenta para isso. Fica ativado, a menos que você o desative.
- **[Modelo de música](/settings?s=images&find=Music%20model)**: o modelo que cria músicas, mostrado com o fabricante, o preço ("$0.08 a song"), a duração máxima ("up to 3:00") e o mês em que o OpenRouter o listou, com a etiqueta **Música**. Até você escolher um, vale a escolha do app: o Lyria 3 Pro, do Google, que cria músicas inteiras de até cerca de 3 minutos, com canto ou sem; senão o Lyria 3 Clip, que cria trechos de 30 segundos.
- **[Modelo de voz e som](/settings?s=images&find=Voice%20and%20sound%20model)**: o modelo que fala e cria outros sons, mostrado com o preço ("$0.0025 a second", "$0.08 per 1,000 characters", "about $0.014 a minute"), a duração máxima e quantas vozes ele tem, com etiquetas: **Também sons** (cria efeitos sonoros e sons ambiente além de vozes, a partir de uma descrição), **Copia vozes** (fala com uma voz copiada de gravações curtas que você fornece), **Conversas** (dá voz a vários falantes, cada um com a própria voz) e **Dirigido** (aceita orientações para a interpretação: tom, ritmo, emoção). Até você escolher um, vale a escolha do app: o Seed Audio 1.0, da ByteDance, que faz tudo isso a partir de uma descrição, até 2 minutos por vez; senão o Gemini 3.8 Flash TTS, do Google, senão o ElevenLabs v3.

**Variação** abre a lista de cada modelo, para pesquisar ("lyria"; "seed", "elevenlabs", "gemini") e ordenar por **Sugeridos**, **Mais recentes** ou **Mais barato** (as vozes por quanto custa mais ou menos um minuto de fala); a linha de um modelo escolhido tem **⋯ → Deixar o app escolher** para voltar à escolha do app. Quando o modelo de voz que você escolheu só lê palavras em voz alta, um efeito sonoro ou uma voz copiada é criado com a escolha do app que consiga fazer isso, e o formulário avisa.

Os modelos de voz são vendidos, em sua maioria, por caractere lido, o Seed Audio por segundo de som criado e o Lyria por música. Cada um é pago com a sua chave do OpenRouter, e você vê o preço em um formulário antes de qualquer coisa ser criada.

## Conferir as configurações antes de criar

Antes de um agente criar uma imagem, um desenho detalhado, um vídeo ou um som, um pequeno formulário aparece na conversa com as configurações que aquele modelo aceita e o custo do resultado, já preenchido com o que você pediu e com os padrões do app:

- para uma imagem: **Forma** (quadrada, larga, alta…, conforme o modelo aceitar), **Resolução** (1K, 2K, 4K…), **Qualidade**, **Quantas imagens** (para modelos que criam várias de uma vez) e **Fundo transparente** (para um logotipo ou um ícone);
- para um desenho detalhado (pelo modelo vetorial da Recraft): a **Forma** dele;
- para um vídeo: **Duração do vídeo** (as durações que o modelo cria, ou **Duração, em segundos**), **Forma**, **Resolução** e **Som**;
- para um som: no caso de uma música, **Instrumental, sem canto** e, com um modelo que cria músicas longas, **Duração, em segundos** (deixe em branco para a música durar o tempo de que precisar); para um efeito sonoro, a **Duração, em segundos** dele (o Seed Audio é cobrado por segundo); para fala, a **Voz** (para um modelo com vozes próprias); e o **Arquivo** (**MP3, menor** ou **WAV, sem compressão**), quando o modelo cria os dois.

Acima dos campos ficam o nome do modelo, o preço dele ("cerca de US$ 0,08 por imagem", "de US$ 0,03 a US$ 0,08 por segundo, conforme a resolução e o som", "US$ 0,08 por música", "US$ 0,0025 por segundo de som"; para um vídeo ou um som, o total com as configurações mostradas) e o que o agente vai pedir, completo e com as palavras dele. Mude o que quiser e clique em **Criar**; **Agora não** fecha o formulário, e nada é criado nem gasto. O formulário mostra só as configurações que o modelo oferece.

O formulário aparece uma vez por modelo em uma sessão: as imagens, os vídeos e os sons seguintes nessa sessão usam as configurações que você escolheu (no caso de um som, a voz e o arquivo), a menos que você peça outras ("agora uma alta"). Diga "mostre as configurações de novo" para ver o formulário, ou "pode continuar, escolha por mim" para o agente criar sem ele. Tarefas agendadas e execuções de apps criam as suas sem formulário, com os padrões do app, já que não há ninguém para responder.

## Quando um agente precisa da chave do OpenRouter

Imagens, desenhos detalhados, vídeos, músicas e vozes são criados por modelos por meio do OpenRouter, pagos com a sua chave do OpenRouter. Quando um agente vai criar um deles e não há chave configurada, um cartão aparece primeiro na conversa, **Isto precisa de uma chave do OpenRouter**, dizendo qual modelo faria o trabalho, quanto custa mais ou menos e que você paga ao OpenRouter pelo que for criado, com um campo para a chave:

- Cole a chave e clique em **Salvar a chave** (ou pressione Enter). O OpenRouter a verifica primeiro; ela vai direto para [Configurações → Agentes → Modelos → OpenRouter](/settings?s=models&find=OpenRouter), nunca para a conversa, e o agente continua (até o formulário com as configurações, como sempre). O cartão então diz "Sua chave do OpenRouter está salva em Configurações → Modelos."
- **Obter uma chave** abre a página do OpenRouter onde você cria uma.
- **Pular**: esse modelo não é executado, nada é criado nem gasto, e o agente continua sem ele, de outro jeito quando não for preciso chave (um desenho simples que ele mesmo escreve, as [ferramentas de imagem neste computador](/guide/library#the-picture-tools-on-this-computer)), ou sem nada. A sessão não pergunta de novo por seis horas.

O cartão espera até nove minutos; depois disso, o agente continua sem a chave e fica sabendo dela se você a adicionar mais tarde. Tarefas agendadas e execuções de apps não recebem cartão, já que não há ninguém para responder: elas avisam que a chave está faltando ("Imagens precisam de uma chave do OpenRouter", com **Adicionar uma chave do OpenRouter**). As ferramentas de IA dos próprios editores pedem a chave na caixa de diálogo delas ([Criar imagens, desenhos, gráficos e vídeos com IA](/guide/library#make-pictures-drawings-plots-and-videos-with-ai)).

## Pedir uma imagem ou mudar uma

Descreva o que você quer: o assunto, o cenário, o estilo (uma foto, uma ilustração, uma aquarela), as cores, a luz e as palavras que devem aparecer nela. O agente também pode:

- **mudar ou combinar suas imagens**: arquivos de imagem neste computador (PNG, JPEG, WebP ou GIF, de até 20 MB cada; a maioria dos modelos aceita até 4, alguns mais), na pasta da sessão ou pelo caminho deles, ou as imagens que já estão em uma apresentação, um documento ou uma página que você manteve; diga o que mudar. (Uma imagem anexada a uma mensagem vai para o modelo olhar; para o modelo de imagem trabalhar a partir dela, ela precisa ser um arquivo: envie-a pela página Arquivos.) Isso exige um modelo com a etiqueta **Edições**; com outro, o agente é orientado a descrever a mudança em palavras ou a pedir que você escolha um modelo que edite imagens;
- **usar o modelo Rápido ou o Melhor**: o agente usa o Rápido para imagens simples (um fundo, uma textura, um ícone) e o Melhor para cenas, fotos, palavras em uma imagem, diagramas e toda mudança, ou decide pelo que você pede; diga para usar o outro ("um rápido serve", "use o modelo Melhor");
- **deixar o fundo transparente** (um logotipo, um ícone): um modelo que não consegue criar isso passa o trabalho a um que consegue ou, com as [ferramentas de imagem](/guide/library#the-picture-tools-on-this-computer) configuradas, a imagem é criada sobre um fundo liso e o fundo é removido neste computador;
- **usar outro modelo** para uma imagem, quando você o nomeia ("crie com o FLUX 2 Pro"), sem mudar as Configurações.

As imagens são salvas em uma pasta **imagens** dentro da pasta da sessão, com o nome do que mostram, e nunca por cima de um arquivo que já exista.

Na conversa:

- Enquanto o modelo trabalha, um espaço reservado no formato pedido diz "Criando uma imagem" com o tempo decorrido, e a descrição embaixo.
- Depois as imagens aparecem com a resposta, com a descrição e o nome do modelo embaixo delas, e **Manter** (veja [Manter o que um agente criou](#keep-what-an-agent-made)). Clique em uma para vê-la grande: clique de novo para o tamanho real, as setas (ou as teclas de seta) passam por várias, **Abrir em uma nova aba** a abre sozinha, **Editar** a abre no editor de imagens (o que você salva ali é mantido como uma nova imagem: [Editar imagens e vídeos](/guide/library#edit-pictures-and-videos)), e Esc fecha. Sobre cada imagem, **Mostrar nos arquivos**, **Baixar** e **Mais** (⋯: **Começar uma sessão com ele**, **Adicionar a um projeto**, **Copiar caminho** e, no app para computador, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta**) aparecem quando você aponta para ela (no celular ficam sempre visíveis); com várias imagens, **Manter** também fica ali.
- Sem uma chave do OpenRouter configurada, um cartão pede uma primeiro ([Quando um agente precisa da chave do OpenRouter](#when-an-agent-needs-the-openrouter-key)); em uma execução que ninguém acompanha (de uma tarefa agendada ou de um app), você vê "Imagens precisam de uma chave do OpenRouter", com **Adicionar uma chave do OpenRouter**. Quando nada é criado (você pulou a chave ou fechou o formulário, ou o modelo recusou), você vê "Nenhuma imagem desta vez" com o motivo.

## Pedir um desenho ou um gráfico

Algumas imagens ficam melhores desenhadas a partir de formas ou calculadas a partir de números do que pintadas por um modelo de imagem:

- **Um desenho** (um SVG: formas em vez de pixels, nítido em qualquer tamanho): um ícone, um logotipo, um diagrama, um padrão que se repete, uma forma ou uma ilustração plana, nas cores que você indicar (as de uma apresentação ou de um documento, por exemplo). Um desenho simples é escrito pelo Claude (ou pelo [modelo auxiliar](/settings?s=models&find=Helper%20model) que você escolheu), sem modelo de imagem para pagar, em menos de um minuto; um desenho detalhado (uma ilustração, ou quando você pede o melhor) é feito pelo modelo vetorial da Recraft por meio do OpenRouter, por cerca de US$ 0,08 o desenho, depois do formulário com o preço. Scripts, links e qualquer coisa que um desenho carregaria de outro lugar são removidos de todo desenho antes de ele ser mantido.
- **Um gráfico** dos seus dados ou de matemática, para o que o gráfico de um slide não consegue desenhar: gráficos de dispersão, histogramas, diagramas de caixa, barras de erro, vários eixos ou painéis, mapas de calor, funções, ajustes e anotações nos pontos importantes. O Claude (ou o modelo auxiliar) o escreve em Python com matplotlib, ele é executado neste computador, e o que der errado volta para ele corrigir (até três tentativas); leva cerca de meio minuto e custa só essa resposta. Dê os números na mensagem ou em um arquivo (CSV, TSV ou JSON, de até 20 MB) e diga a conclusão que ele deve mostrar ("mostre que a primavera dobrou"). Ele vem como um desenho (SVG; um PNG para muitíssimos pontos), de 960 por 540 pixels, a menos que você peça outro tamanho, com o Python dele ao lado, de modo que "agora com escala logarítmica" altera esse gráfico; para uma apresentação na web, ele também pode vir como um gráfico que se mexe e responde ao ponteiro. Ele precisa de Python com matplotlib no computador em que o app roda: o das próprias ferramentas de imagem, depois de configuradas ([As ferramentas de imagem neste computador](/guide/library#the-picture-tools-on-this-computer)), ou um que já esteja lá.

Os dois são salvos na pasta **imagens** dentro da pasta da sessão e aparecem com a resposta como as imagens; enquanto um está sendo criado, o espaço reservado dele diz "Criando um desenho" ou "Desenhando o gráfico".

## Encontrar fotos gratuitas

Peça fotos em vez de imagens criadas por um modelo ("encontre duas fotos dos bondes de Lisboa para o meu slide de título"), e o agente pesquisa fotos com licença aberta, gratuitas para usar e alterar, inclusive para fins comerciais: o catálogo do Openverse (Flickr, Wikimedia Commons, museus e mais) ou a própria busca do Wikimedia Commons, quando o Openverse não consegue responder. Ele salva algumas das melhores (4, a menos que você diga outro número, no máximo 10) na pasta **imagens** da sessão, com o crédito de cada uma (título, autor, licença e link) em um arquivo ao lado, olha as fotos antes de usar uma e dá os créditos como a licença exige: nas notas do apresentador do slide, ou embaixo da imagem em um documento ou uma página, e, para licenças diferentes de CC0 e domínio público, em uma pequena legenda junto da foto ("Foto: “Título” de Autor, CC BY 2.0"). É gratuito e leva alguns segundos; enquanto ele pesquisa, o espaço reservado diz "Encontrando fotos gratuitas".

## Recortar, apagar e editar

Os agentes também alteram suas imagens e vídeos sem precisar criá-los de novo:

- **Remover o fundo** de uma imagem: o assunto dela (uma pessoa, um produto, um animal, um logotipo) em um fundo transparente, como PNG. Neste computador, depois de configuradas as [ferramentas de imagem](/guide/library#the-picture-tools-on-this-computer), é grátis e privado, mantém os pixels originais do assunto e leva alguns segundos; um recorte que fique ruim é refeito por um modelo de imagem. Sem elas, um modelo de imagem pelo OpenRouter faz o trabalho (cerca de US$ 0,01 a US$ 0,04), desenhando a imagem de novo sem o fundo, então pequenos detalhes podem ficar diferentes.
- **Apagar algo** de uma imagem (uma pessoa ao fundo, uma placa, uma marca-d'água, uma mancha, um cabo): o item é retirado e o espaço é preenchido como se o que está ao redor continuasse. O agente marca onde está ou descreve o item para que um modelo de imagem o encontre. Áreas pequenas são apagadas neste computador sem custo; áreas grandes, as que atravessam a imagem e as que ficam entre elementos detalhados, como palavras, vão para um modelo de imagem (cerca de US$ 0,01 a US$ 0,04).
- **Ampliar uma imagem**: duas ou quatro vezes maior em cada lado, com os detalhes desenhados com nitidez em vez de borrados (uma foto pequena para impressão ou para um slide, uma imagem antiga). Grátis e privado, neste computador depois de configuradas as [ferramentas de imagem](/guide/library#the-picture-tools-on-this-computer) (na primeira vez, ele baixa o próprio modelo, cerca de 5 MB); uma imagem grande leva um ou dois minutos.
- **Editar uma imagem**: cortar, girar ou espelhar, redimensionar, mudar a luz e as cores (exposição, contraste, temperatura e o restante, ou curvas, níveis, matiz e saturação de uma cor, equilíbrio de cores, clareza, remoção de névoa, redução de ruído, granulação, ou tudo de uma vez com Melhoria automática), aplicar um filtro (**Vintage**, **Preto e branco**…), escrever textos nela, desenhar setas e caixas e desfocar ou pixelar partes dela (um rosto, uma placa de carro, um nome). Grátis, neste computador; uma imagem JPEG, WebP ou GIF, ou textos em uma delas, exige o ffmpeg ou as ferramentas de imagem instalados.
- **Editar um vídeo**: cortar o início e o fim, remover trechos, recortar para um formato (16:9, 9:16, quadrado, 4:5), girar ou espelhar, acelerar ou desacelerar (ou reproduzir de trás para a frente, com estabilização), juntar vários clipes e imagens com transições (dissolução, fade através do preto, cortinas, deslizamentos), dar um zoom lento em uma imagem, colorir (exposição, temperatura, contraste, um visual como cinematográfico ou preto e branco, vinheta, granulação), aplicar fade de entrada e de saída, tirar o som ou mudar o volume, escolher quais canais são ouvidos (um microfone de lapela de um lado ouvido nos dois), silenciar trechos do som, dar à música uma linha de volume, colocar por cima um logotipo, uma marca-d'água ou uma tela verde, colocar textos (títulos, legendas, ou legendas feitas a partir do que é dito, com um .srt ao lado) e colocar música e uma narração por baixo, com as vozes limpas, a música abaixada durante a fala e o volume uniformizado; ou criar um GIF dele, ou tirar um quadro como imagem. Grátis, com o ffmpeg neste computador (as ferramentas de imagem trazem um), na placa de vídeo quando houver uma, enquanto **Permitir que os agentes criem vídeos** estiver ativado.
- **Editar um som** (um arquivo de som, o som de um vídeo ou um som que você manteve): manter um trecho, remover trechos ou silenciá-los, encurtar pausas longas, tirar vícios de linguagem (“hum”, “é”: com reconhecimento de fala neste computador, veja [Reconhecimento de fala no servidor](#speech-recognition-on-the-server)), tocar mais rápido ou mais devagar mantendo o tom, mudar o tom, deixar mais alto ou mais baixo ou aplicar fade, definir o pico mais alto ou o volume geral (podcast, streaming, transmissão), reduzir ruído, mudar o timbre (uma voz mais clara, um telefone, um rádio), comprimir ou limitar, adicionar eco ou reverberação, inverter ou transformar em mono e misturar outros sons por cima em um ponto (música sob uma voz, um efeito sonoro). Grátis, com o ffmpeg neste computador, enquanto **Permitir que os agentes criem áudio** estiver ativado.

Cada um funciona a partir de um arquivo na pasta da sessão, ou de uma imagem ou um vídeo que já esteja em uma apresentação, um documento ou uma página, e salva o resultado na pasta **imagens** da sessão (um vídeo editado em **vídeos**, um som editado em **áudio**), nunca sobre o original. Uma imagem ou um som que você manteve também pode ser editado e colocado de volta no lugar dele ou ao lado, como um novo, como fazem **Salvar** e **Salvar uma cópia** nos editores (“clareie a foto do porto que eu mantive”, “deixe meu som ‘Entrevista’ tão alto quanto um podcast”). Ele aparece com a resposta como aparece uma imagem criada pelo agente, com um espaço reservado dizendo “Removendo o fundo”, “Apagando”, “Ampliando”, “Editando a imagem”, “Editando o vídeo” ou “Editando o som” enquanto trabalha. Em um recorte ou em uma remoção, a resposta diz de que modo foi feito e por quê: se não ficou bom, diga “faça com IA” e o agente pede ao modelo de imagem. Para fazer você mesmo, abra a imagem, o vídeo ou o som no editor correspondente ([Editar imagens e vídeos](/guide/library#edit-pictures-and-videos), [O editor de som](/guide/library#the-sound-editor)).

## Peça um vídeo

Descreva a cena, o que se move e como, a câmera (“uma aproximação lenta”, “ela segue o ciclista”), o estilo e a luz, e qualquer som ou fala. O agente também pode:

- **partir de uma imagem**: um arquivo de imagem para ser o primeiro quadro do vídeo (“dê vida a esta foto”) e, em alguns modelos, outro para terminar nele, nos modelos com a etiqueta **A partir de uma imagem**;
- **seguir imagens**: até 4 imagens de um personagem, um produto ou um estilo para o vídeo respeitar, sem serem seus quadros;
- **alterar um vídeo**: um arquivo de vídeo (MP4, WebM ou MOV, até 40 MB) para um modelo com a etiqueta **Edita vídeos** editar, estender ou deixar mais nítido.

Um vídeo leva de menos de um minuto a vários. O agente espera por ele, cerca de nove minutos no máximo; quando demora mais, o app continua buscando e o salva quando estiver pronto, e o agente o mostra quando verificar de novo. Esperar não gera nenhum gasto a mais.

Os vídeos são salvos em uma pasta **vídeos** dentro da pasta da sessão, com o nome do que mostram.

Na conversa:

- Enquanto o modelo trabalha, um espaço reservado no formato do vídeo diz “Criando um vídeo” com o tempo decorrido.
- Depois o vídeo aparece com a resposta, pronto para reproduzir (também em tela cheia, pelos controles dele), com a descrição e o nome do modelo embaixo, e **Manter**. Sobre ele, **Editar** (o editor de vídeo: o que você salvar é mantido), **Mostrar nos arquivos**, **Baixar** e **Mais** (⋯: o mesmo que sob uma imagem, com **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** no app para desktop) aparecem quando você passa o mouse sobre ele.
- “Ainda sendo criado” significa que o agente parou de esperar antes de o vídeo ficar pronto: ele aparece quando o agente verificar de novo (peça a ele, se não verificar). “Nenhum vídeo desta vez” informa o motivo: você fechou o formulário ou o modelo recusou (as palavras dele dizem por quê).

## Peça música, uma voz ou um som

Diga ao agente o que você quer ouvir:

- **Música**: o gênero e o clima, os instrumentos, o andamento, a voz que canta e como ela soa (“uma música synth-pop animada de 2 minutos sobre manhãs de segunda-feira, com uma mulher cantando e um refrão grudento”). Dê sua própria letra ou deixe o modelo escrever; peça uma versão instrumental quando não quiser canto. O Lyria 3 Clip sempre cria 30 segundos; o Lyria 3 Pro cria até cerca de 3 minutos, conforme você pedir. Uma música leva um ou dois minutos.
- **Uma narração**: as palavras a dizer, exatamente, e como devem soar (“leia isto com uma voz calma e grave, devagar”). Com um modelo que tem vozes próprias, você escolhe uma no formulário; o Seed Audio cria a voz que você descrever. Uma conversa entre vários falantes também funciona (“uma breve abertura de podcast com dois apresentadores”), com modelos que dão voz a eles.
- **Uma voz copiada de uma gravação**: dê ao agente de 1 a 3 gravações da voz, arquivos neste computador (WAV, MP3, M4A, OGG ou FLAC, até 30 MB cada; os primeiros 30 segundos de cada uma são usados), para um modelo que **Copia vozes** (Seed Audio). Use apenas uma voz que você possa usar: a sua ou a de alguém que tenha concordado. Com o ffmpeg no computador, qualquer um desses arquivos funciona; sem ele, apenas WAV e MP3.
- **Um efeito sonoro ou som ambiente**: o que é, o que acontece e quando (“chuva forte em um telhado de zinco, trovão chegando no final, sem vozes”) e a duração.
- **Outro modelo** para um som, quando você o citar (“leia com o ElevenLabs v3”), sem mudar as Configurações.

Os sons são salvos em uma pasta **áudio** dentro da pasta da sessão, com o nome do que são, como MP3 (ou WAV, quando você pedir).

Na conversa:

- Enquanto o modelo trabalha, um cartão diz “Criando música”, “Criando uma narração” ou “Criando um som”, com o tempo decorrido.
- Depois o som aparece com a resposta, em um player: o botão redondo toca e pausa (um som toca de cada vez), a forma dele é a barra para avançar ou voltar (clique ou arraste), depois o tempo e a velocidade (**1×**, **1,25×**, **1,5×**, **2×** ou **0,75×**). Com o foco no player, Espaço ou K toca e pausa, e ← → movem 5 segundos. O título vem do nome do arquivo, com **Editar** (o [editor de som](/guide/library#the-sound-editor): o que você salvar é mantido), **Mostrar nos arquivos**, **Baixar** e **Mais** (⋯: o mesmo que sob uma imagem, com **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** no app para desktop) ao lado. Embaixo estão as palavras a partir das quais foi criado, o nome do modelo e **Manter** (veja [Mantenha o que um agente criou](#keep-what-an-agent-made)); a **Letra** de uma música abre embaixo delas.
- Sem uma chave do OpenRouter, você vê “O áudio precisa de uma chave do OpenRouter”, com **Adicionar uma chave do OpenRouter**. “Nenhum som desta vez” informa o motivo: você fechou o formulário ou o modelo recusou (as palavras dele dizem por quê).

O agente não consegue ouvir o que criou: ele conhece o som pelo que pediu. Se não soar bem, diga o que mudar e ele cria outro; ou peça que seja editado (“faça um fade out nos dois últimos segundos do jingle”, “coloque-o sob a minha narração aos 0:05”), pelo agente ou no editor de som.

## Imagens no que os agentes criam

Quando um agente cria ou altera slides, um documento ou uma página para você, ele os ilustra por conta própria onde uma imagem acrescenta algo (um slide de título, uma seção, uma ideia; não todos os slides), nas cores e no estilo deles, como faria um designer: uma imagem Rápido para um fundo, uma textura ou um ícone, uma Melhor para uma cena, uma foto ou um diagrama, um desenho para um ícone, um logotipo ou um diagrama que precisa ficar nítido, um gráfico para números, fotos gratuitas de lugares e coisas reais, e suas imagens recortadas, apagadas ou editadas para se encaixar. Ele trabalha com as imagens que já estão no que você tem aberto, além de arquivos e, se pedido, escreve uma descrição para cada imagem de uma apresentação que não tenha uma, para quem não consegue vê-las (o modelo que descreve as imagens que você mantém faz isso). O que custa dinheiro tem o preço mostrado no formulário antes de ser criado ([Confira as configurações antes de criar qualquer coisa](#check-the-settings-before-anything-is-made)); diga “sem imagens” ou “só fotos gratuitas” quando quiser de outro jeito.

Quando você pede um tipo conhecido de coisa pelo nome (um slide de SWOT, uma apresentação de pitch, uma carta de apresentação, um resumo executivo, um controle de hábitos, uma tabela de preços, um orçamento), o agente primeiro lê como o app faz bem esse tipo: o que entra nele, em que ordem, qual é o visual e onde as imagens ajudam, como são feitos os tipos da galeria ([Criado com IA a partir de um tipo](/guide/library#made-with-ai-from-a-kind)). Isso não custa nada.

Em uma [sessão confidencial](/guide/sessions#keep-a-session-confidential), nada disso existe: o agente dela não cria, não busca e não edita imagens nem vídeos.

## Mantenha o que um agente criou

**Manter**, embaixo de uma imagem, um vídeo ou um som criado por um agente, guarda uma cópia dele nos arquivos de um projeto, onde um modelo escreve um título e uma descrição para ele (para um som, a partir das palavras com que foi criado, já que nenhum modelo consegue ouvi-lo; o modelo é escolhido em [Configurações → Recursos → Imagens, vídeo e áudio → Legendas do que você mantém](/settings?s=images&find=Captions%20for%20what%20you%20keep)), e onde ele permanece depois que a pasta da sessão é limpa. Quando você tem projetos, um pequeno menu pergunta para onde vai (**Manter em**): primeiro o projeto da própria sessão, depois seus outros projetos e **Nenhum projeto**, que o mantém com a conversa, onde a caixa de busca (Ctrl+K) o encontra. O botão passa a dizer **Mantida** e o abre. Uma imagem que você manteve aparece entre os arquivos do projeto (os detalhes do projeto → **Arquivos**, como um bloco com a imagem dela), e no editor, **Manter** guarda uma imagem editada como uma nova, enquanto **Salvar** a coloca de volta onde estava e **Salvar uma cópia** guarda outra ao lado.

## Ditar uma mensagem

O microfone na caixa de mensagem (na página inicial e em cada sessão) transforma o que você diz em texto na sua mensagem. Nada é enviado automaticamente: você lê o texto e envia como de costume.

1. Clique ou toque no microfone.
2. Fale. Um painel acima da caixa de mensagem mostra o tempo, as palavras ouvidas até agora (ou, quando o servidor reconhece a fala, "Gravando…" com barras que acompanham a sua voz) e o idioma que ele está ouvindo.
3. Clique em **Concluído** ou no microfone de novo. As palavras se juntam ao que você já escreveu (com o servidor, "Transformando suas palavras em texto…" aparece por um instante antes).

O seletor de idioma no painel ("DE", "PT-BR") muda o idioma enquanto você fala; a gravação continua no novo idioma. Quando o servidor reconhece a fala, uma gravação para sozinha depois de 10 minutos.

O microfone só aparece onde o ditado pode funcionar: quando o próprio navegador reconhece a fala (Chrome, Edge, Safari) ou quando o servidor reconhece (veja [Reconhecimento de fala no servidor](/guide/documents-voice#speech-recognition-on-the-server)). Quando ele não consegue iniciar, avisa o motivo e o que fazer:

- **O microfone precisa de uma conexão segura**: os navegadores só permitem isso em um endereço HTTPS, ou em localhost no próprio computador. Abra o Hydor por um endereço HTTPS (veja [Celulares, outras máquinas e compartilhamento](/guide/devices)).
- **O microfone está bloqueado para este site**: permita-o nas configurações de sites do navegador (em um iPhone: **aA** na barra de endereço, depois **Configurações do Site → Microfone**) e tente de novo.
- **Nenhum microfone foi encontrado**, ou **O microfone está ocupado** (outro app está usando).
- **O reconhecimento de fala está desativado aqui**: em um iPhone, ative o Ditado em Ajustes → Geral → Teclado; ou deixe o servidor reconhecer a fala.
- **Este navegador não consegue gravar**: use uma versão atual do Chrome, Edge, Firefox ou Safari.

Cada um desses avisos tem um botão **Configurações de voz**, que abre Configurações → Voz.

## Configurar a voz

Tudo sobre voz fica em **[Configurações → Recursos → Voz](/settings?s=voice)** (em um celular: Configurações e depois **Voz**). Ela tem três partes.

### Ditado

**[Ditado](/settings?s=voice&find=Dictation)** diz primeiro o que este navegador consegue fazer:

- Um navegador que reconhece a fala por conta própria mostra suas palavras enquanto você fala. Ele pode enviar sua voz ao fabricante para isso (o Chrome para o Google, o Safari para a Apple). Para manter sua voz na sua máquina, ative o whisper.cpp abaixo e escolha o servidor.
- Um navegador que não reconhece a fala por conta própria dita pelo servidor, depois que o reconhecimento de fala no servidor estiver ativado.

Depois:

- **[Idioma que você fala](/settings?s=voice&find=Language%20you%20speak)**: **Igual a este navegador**, ou um entre 56 idiomas e regiões. O ditado ouve nesse idioma, e o modo mãos livres fala e ouve nele.
- **Reconhecer com**: **Este navegador** (as palavras aparecem enquanto você fala) ou **O servidor** (privado com o whisper.cpp; as palavras chegam quando você para). Só aparece quando os dois podem.

O idioma e **Reconhecer com** ficam salvos neste navegador, então cada um dos seus dispositivos tem o seu.

### Reconhecimento de fala no servidor

**[Reconhecimento de fala no servidor](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** é para navegadores que não reconhecem a fala por conta própria, ou para manter sua voz na sua máquina. Fica desativado até você ativar, e nada é baixado antes. É definido uma vez para o app, em todos os dispositivos. Em **Onde executa**, escolha uma de três opções:

- **Desativada**.
- **Nesta máquina**: o whisper.cpp roda no computador que executa o Hydor, na GPU quando ele tem uma que o whisper.cpp possa usar (a de um Mac ou uma GPU NVIDIA) e, senão, no processador, e sua voz fica lá.
  - **Modelo**: **Minúsculo** (74 MB; o mais rápido, às vezes ouve uma palavra errada), **Base** (141 MB; rápido e bom o bastante para a maioria dos ditados, o padrão), **Pequeno** (465 MB; ouve melhor, alguns segundos por frase em uma CPU) ou **Médio** (1,4 GB; ouve melhor ainda, lento sem uma CPU rápida).
  - **Idiomas**: **Qualquer idioma** (acompanha o idioma que você fala) ou **Somente inglês** (um pouco mais preciso em inglês).
  - **Ativar · baixar …** diz quanto será baixado: o modelo e, na primeira vez, o próprio whisper.cpp (quando tudo já está lá, escolher **Nesta máquina** o ativa na hora). Uma barra mostra o download; **Cancelar** o interrompe e desativa o reconhecimento no servidor. No Linux, o app baixa um whisper.cpp pronto, que roda no processador; em um Mac, e onde o pronto não funciona, ele compila o whisper.cpp neste computador, o que exige um compilador C++ e o CMake (no Debian ou Ubuntu: `sudo apt install build-essential cmake`; em um Mac: `xcode-select --install` e depois `brew install cmake`). Em um Mac, ele é compilado para a GPU do Mac (Metal). Um whisper.cpp seu no computador (um compilado para a sua GPU, por exemplo) é usado como está.
  - **Uma GPU NVIDIA** no Linux: o whisper.cpp não tem versão pronta para ela, então, assim que o ditado funcionar no processador, o app compila uma para a GPU em segundo plano, com o toolkit CUDA da NVIDIA (`nvcc`). Uma barra mostra o progresso (leva de 5 a 20 minutos); nesse meio-tempo o ditado funciona no processador e, depois, na GPU. Sem o toolkit, uma nota avisa, com **Verificar de novo** para quando você o instalar; se a compilação falhar, o motivo aparece com **Tentar de novo**, e o ditado continua no processador.
  - Quando está pronto: "Pronto: whisper.cpp … com o modelo Base. Sua voz fica aqui.", e abaixo disso o que ele usa para executar, como o whisper.cpp informou na última vez que rodou (ele testa um segundo de silêncio assim que fica pronto): "Executa na GPU: Apple M2 Pro (Metal)." ou "Executa no processador desta máquina." Se a GPU falhar (por falta de memória, por exemplo), essa gravação é feita no processador, a nota diz o motivo, e a GPU é tentada de novo alguns minutos depois. **Testar** verifica se ele responde e com que rapidez. Se algo falhou, o motivo aparece com **Tentar de novo**.
  - Escolher outro modelo enquanto está ativado baixa esse modelo.
- **Um serviço**: qualquer serviço com o endereço de transcrição de fala da OpenAI (`/audio/transcriptions`): a própria OpenAI ou um servidor na sua rede (Speaches, LocalAI, o servidor do whisper.cpp, um em uma GPU). As gravações são enviadas a ele.
  - **Configurar** (depois **Editar**) na linha do serviço abre um formulário: **Endereço** (como `https://api.openai.com/v1`), **Chave de API** (a maioria dos servidores na sua rede não precisa de nenhuma) e **Modelo** (`whisper-1`, a menos que você informe outro).
  - **Salvar e ativar** (depois **Salvar**); **Testar** na linha dele depois de ativado; e **Remover a chave** no menu **⋯** dele depois que uma chave for salva. Depois que um serviço é salvo, escolher **Um serviço** de novo muda para ele na hora.

Um grupo, **Nesta máquina**, com o tamanho total, lista o que o whisper.cpp deixou neste computador: o próprio whisper.cpp ("compilado aqui para Metal" ou "para CUDA" quando o app o compilou para uma GPU) e cada modelo com seu tamanho, o que está em uso marcado como "em uso". O menu **⋯** de um modelo tem **Remover** (remover o que está em uso desativa o reconhecimento no servidor, depois que você confirmar). **Remover tudo**, no menu **⋯** do próprio grupo, remove o whisper.cpp e seus modelos; aparece enquanto o reconhecimento no servidor está desativado ou usa um serviço.

### Leitura em voz alta

**[Leitura em voz alta](/settings?s=voice&find=Read%20aloud)**: o alto-falante em uma resposta a lê para você, deixando de fora o código. Cada navegador guarda a sua própria voz e velocidade (o (i) do grupo avisa isso).

- **Voz**: **Automático** (a voz do navegador para o idioma que você fala) ou qualquer voz que este navegador tenha, com as do seu idioma primeiro. Cada uma indica seu idioma e "online" quando precisa de internet.
- **Velocidade**: de 0,5× a 2×.
- **Experimentar**: **Ouvir um exemplo** lê uma frase com essa voz e velocidade.

Se o navegador não consegue ler texto em voz alta, a seção avisa.

## Ouvir uma resposta em voz alta

1. Aponte para uma resposta: um alto-falante aparece no canto superior direito dela, ao lado do botão de copiar.
2. Clique nele. Uma barra acima da caixa de mensagem mostra **Lendo em voz alta**, qual parte de quantas e as primeiras palavras da resposta.
3. Pause e retome a leitura pela barra, ou pare por ela ou pelo alto-falante.

Ele lê a resposta como palavras simples: o código é deixado de fora, os links são lidos pelas suas palavras, os endereços da web pelo nome do site e as tabelas linha por linha. Iniciar outra resposta interrompe a primeira, e sair da conversa interrompe a leitura. O alto-falante aparece quando você aponta com o mouse; em um celular, o modo mãos livres lê as respostas para você ("Leia a resposta para mim").

## Conversar com o app com mãos livres

O modo mãos livres é para quando você não pode olhar para a tela, como durante uma caminhada: você fala, o app faz e diz o que fez, e depois ouve de novo. Ele começa sessões, repassa suas palavras a elas, diz como estão indo, responde às aprovações delas e lê para você os resultados.

### Iniciar e encerrar

- Em uma sessão, o botão de fones de ouvido na caixa de mensagem (**Mãos livres**, ao lado do microfone) o abre, acompanhando essa sessão.
- Na página inicial, o mesmo botão o abre sem acompanhar nenhuma sessão em particular.
- Na caixa de busca (Ctrl+K, ⌘K em um Mac), a ação **Conversar com mãos livres** também o abre.

Ele ocupa a tela toda, diz "Estou ouvindo" e pede ao dispositivo que mantenha a tela acesa enquanto estiver aberto. No alto você vê a sessão que ele acompanha (ou "Fale com o Hydor"). O botão redondo grande mostra o que ele está fazendo: **Ouvindo…**, **Trabalhando nisso…**, **Falando** ou **Em pausa: toque para ouvir**. Abaixo dele você vê o que ele ouviu, entre aspas, e a resposta dele.

- Toque no botão redondo enquanto ele fala para interrompê-lo; toque nele em outros momentos para pausar ou continuar ouvindo.
- Para encerrar, diga "Tchau" (ou "Até mais", "É só isso", "Pare de ouvir", "Encerrar mãos livres", "Sair"), ou toque no X no canto superior direito.

### O que você pode dizer

- **Começar uma sessão**: "Começar uma sessão para planejar meu fim de semana em Creta". Ela começa como a página inicial faria: com o programa, modelo, esforço, permissões, agente e projeto que você escolheu por último lá, em uma nova pasta de tarefa (ou na pasta que você escolheu por último lá). A partir daí, ele acompanha essa sessão.
- **Dizer algo a uma sessão**: "Diga a ela para usar unidades métricas". As palavras vão para a sessão que ele acompanha, como sua mensagem.
- **Perguntar como andam as coisas**: "Como estão as minhas sessões?". Ele diz o que está em andamento, o que precisa de você e o que pergunta, e o que terminou recentemente.
- **Ouvir o resultado**: "Leia a resposta para mim". Ele diz a resposta mais recente da sessão que acompanha (ou, quando não acompanha nenhuma, da sessão mais ocupada ou mais recente). Uma resposta longa vem resumida, em três a cinco frases; quando o app é exibido em outro idioma que não o inglês, toda resposta vem resumida nesse idioma.
- **Responder a uma aprovação**: "Aprovar" ou "Recusar", quando a sessão que ele acompanha (ou, quando não acompanha nenhuma, qualquer sessão) espera um simples sim ou não. Uma pergunta, um plano ou um formulário precisa ser respondido na tela, e ele avisa isso.
- **Parar o trabalho**: "Pare" interrompe o que a sessão que ele acompanha está fazendo (não encerra o modo mãos livres).
- **Mudar**: cite o nome de outra sessão ("Vamos falar da viagem a Creta") e ele passa a acompanhar essa.
- Pergunte sobre o app, ou qualquer outra coisa: ele responde de forma breve, ou pergunta de volta quando não tem certeza.

### O que ele avisa por conta própria

- Quando a sessão que ele acompanha termina: "… foi concluída. Diga “leia” para ouvir a resposta."
- Quando qualquer sessão precisa de você: "… precisa de você: …", e depois "Diga aprovar ou recusar" para um simples sim ou não, ou "Responda na tela". Ele passa então a acompanhar essa sessão, de modo que "Aprovar" a responde.
- Quando qualquer sessão para com um erro: "… parou com um erro."

Ele para de ouvir para dizer isso e depois volta a ouvir. As sessões nas suas outras máquinas não são anunciadas.

### Bom saber

- O modelo auxiliar entende o que você diz ([Configurações → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)). Se ele não puder ser alcançado, palavras simples ainda funcionam: "status", "aprovar" ou "sim", "recusar" ou "não", "pare", "leia", "começar …"; qualquer outra coisa vai para a sessão que ele acompanha, ou começa uma nova sessão quando não acompanha nenhuma.
- Ele responde no idioma em que o app é exibido (Configurações → Geral → Idioma) e ouve no idioma que você fala (Configurações → Voz), ou, se não houver, no idioma do app.
- Ele fala com a voz e a velocidade de [Leitura em voz alta](/guide/documents-voice#read-aloud).
- Ele precisa de um navegador que consiga ler em voz alta e de um jeito de ouvir: o reconhecimento de fala do próprio navegador (Chrome, Edge, Safari) ou o reconhecimento de fala no servidor. Os fones de ouvido só aparecem onde ele pode funcionar. Com o servidor, cada coisa que você diz termina após um segundo e meio de silêncio (meio minuto no máximo), e ele volta a ouvir após 15 segundos de silêncio.
- Se o microfone não está permitido ou não existe, ele avisa uma vez e entra em pausa: permita o acesso no navegador e depois toque para ouvir.

## Pergunte a um agente

- "Preencha o formulário ~/Downloads/visa-application.pdf com meus dados do meu perfil e me pergunte o que faltar."
- "Escreva a data de hoje e meu nome nas linhas de ~/Documents/permission-slip.pdf e marque Sim."
- "Tire as páginas 3 a 5 de ~/Documents/contract.pdf e coloque em um arquivo separado."
- "Ative o reconhecimento de fala neste computador, com o modelo Small."
- "Use meu servidor de fala em http://192.168.1.20:8000/v1 para o ditado, com o modelo whisper-large-v3."
- "Quais modelos whisper estão neste computador e quanto espaço ocupam? Remova os que não estão em uso."
- "O ditado roda na minha GPU? Se não roda, por quê?"
- "Quais modelos de imagem os agentes usam agora para a maioria das imagens e para as simples, e quanto custa, em média, uma imagem com cada um?"
- "Troque o modelo de imagem da maioria das imagens pelo mais barato que consiga editar imagens."
- "Use o Recraft V4.1 Flash para imagens simples."
- "Configure as ferramentas de imagem neste computador."
- "As ferramentas de imagem rodam na placa de vídeo daqui? Se alguma roda na CPU, por quê?"
- "Faça um ícone plano de uma bicicleta em #0f766e e #f59e0b, como um desenho que fique nítido em qualquer tamanho."
- "Faça um gráfico de ~/data/sales.csv com barras mensais, 2025 contra 2026, e indique o salto da primavera."
- "Encontre três fotos gratuitas dos bondes de Lisboa para meus slides de viagem, com os créditos."
- "Tire o fundo de ~/Pictures/mug.jpg."
- "Apague o homem à esquerda de beach.jpg; se ficar borrado, peça a um modelo de imagem para fazer isso."
- "Corte ~/Pictures/team.jpg em 16:9, deixe a imagem um pouco mais clara e desfoque os rostos ao fundo."
- "Corte demo.mp4 para o trecho de 0:12 a 0:40, coloque 'Nosso novo app' sobre o início e faça também um GIF dele."
- "Tire os 'ãhs' e as pausas longas de interview.m4a, reduza o chiado de fundo e deixe o volume igual ao de um podcast."
- "Impeça os agentes de criar imagens."
- "Quais modelos de vídeo geram som e quanto custa um segundo com cada um?"
- "Faça os agentes usarem o Kling para vídeos."
- "Impeça os agentes de criar vídeos."
- "Qual modelo de música os agentes usam e quanto custa uma música?"
- "Use o ElevenLabs v3 para narrações, com a voz George."
- "Impeça os agentes de criar áudio."
