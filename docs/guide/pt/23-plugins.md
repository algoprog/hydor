# Plugins

Um plugin entrega aos agentes o que eles precisam para um tipo de trabalho, tudo de uma vez: habilidades, ferramentas, algumas linhas de instruções, arquivos próprios e o que precisar ser instalado. Todo agente que o app inicia recebe os plugins que você ativar: Claude Code, Codex, Custom e os demais, sem distinção. Este tópico cobre os plugins que vêm com o app, como adicionar outros a partir de um link, de um arquivo ou de uma pasta, como criar e compartilhar os seus, e os plugins próprios do Claude Code e do Codex.

![Configurações → Plugins: seus plugins e os que vêm com o app](images/plugins.webp)

## O que é um plugin

Um plugin é uma pasta que pode conter:

- **Habilidades**: métodos escritos que os agentes carregam quando uma tarefa pede. Elas entram na [Biblioteca de habilidades](/guide/skills) enquanto o plugin estiver ativado.
- **Ferramentas**: servidores de ferramentas (servidores MCP) que dão novas capacidades aos agentes, como ler texto em imagens ou consultar um banco de dados. Um servidor roda neste computador ou é um serviço em um endereço.
- **Instruções**: algumas linhas acrescentadas às instruções próprias de cada agente enquanto o plugin estiver ativado.
- **Arquivos próprios**: dados, modelos, imagens ou scripts que suas habilidades e ferramentas usam.
- **O que ele precisa**: outros plugins, pacotes de Python ou Node, programas neste computador, arquivos para baixar e chaves do seu cofre.

Os plugins usam o formato aberto Agent Plugins, que outras ferramentas (VS Code, Cursor, Codex, OpenHands…) também leem. Plugins feitos para o Claude Code também podem ser adicionados aqui: suas habilidades e ferramentas chegam a todos os agentes.

## Abrir a página Plugins

Acesse **Configurações → Agentes → Plugins** ([abrir](/settings?s=plugins)). No celular, abra Configurações e toque em **Plugins**, em Agentes.

No alto, três abas: **Todos os agentes** (os plugins deste app, para todos os agentes), **Claude Code** e **Codex** (os plugins próprios de cada agente: veja [Plugins próprios do Claude Code e do Codex](#claude-codes-and-codexs-own-plugins)).

Em **Todos os agentes**:

- uma caixa de busca e o botão **Adicionar** ao lado do título da seção, com **Criar um plugin**, **Criar com um agente**, **De um link**, **De um arquivo .zip** e **De uma pasta**;
- enquanto um plugin está sendo adicionado ou configurado, as etapas dele, conforme acontecem;
- **Seus plugins**: os que você adicionou, cada um com seu interruptor e um menu **⋯** (**Detalhes** e **Alterar** para um que você criou ou usa a partir de uma pasta); o (i) ao lado do título informa que eles funcionam com todos os agentes. Um plugin que você criou mostra **Seus**; um que você adicionou de um link, de um arquivo ou da pasta de outra pessoa mostra **Adicionados por você**;
- **Vêm com o app**: os plugins integrados que ainda não foram adicionados, cada um com **Adicionar**.

Cada plugin mostra o nome e a versão, para que serve, o que ele traz ("1 habilidade · 1 servidor de ferramentas") e qualquer coisa que o impeça de funcionar por completo: a configuração falhou, falta um programa de que ele precisa, uma chave não foi salva. Clique no nome de um plugin (ou em **⋯ → Detalhes**) para abri-lo.

Você também encontra plugins pela caixa de busca (Ctrl+K, ⌘K no Mac): eles aparecem em **Plugins**.

## Adicionar um plugin que vem com o app

1. Em **Vêm com o app**, clique em **Adicionar** na linha dele, ou abra-o e clique em **Adicionar**.
2. As etapas aparecem no alto da página: primeiro a adição, depois a configuração (pacotes e downloads). Ele fica ativado assim que estiver pronto.

Um plugin que precisa de outros plugins traz esses outros junto: eles são adicionados primeiro, e a página do plugin informa quais são antes de você adicionar.

## Os plugins que vêm com o app

- **Áudio e vídeo**: converte, corta, junta, comprime e inspeciona áudio e vídeo, extrai o som, equilibra o volume de um podcast, encurta pausas longas, corta uma gravação a partir de uma lista dos trechos a manter, faz clipes verticais, GIFs e miniaturas, adiciona legendas e baixa mídia a que você tem direito. Precisa do ffmpeg neste computador (a página dele explica como obter) e instala o yt-dlp em um ambiente próprio.
- **Ebooks**: lê os detalhes, o sumário e o texto de um EPUB, cria um EPUB válido com capa e sumário a partir de um manuscrito em Markdown ou HTML, e verifica ou repara um antes de enviá-lo ao Kindle, ao Apple Books ou ao Kobo. Instala os pacotes de Python de que precisa em um ambiente próprio; com o EPUBCheck neste computador, ele também executa a verificação que as lojas usam, e com o pandoc aceita também arquivos do Word.
- **Documentação de bibliotecas**: documentação atual e exemplos de código de bibliotecas e frameworks de programação, pelo serviço do Context7, para que os agentes escrevam código para a versão que você usa. Nada é instalado; as perguntas vão para o Context7.
- **Gravações de reuniões**: de uma gravação de reunião, ligação ou entrevista até as notas: um resumo, decisões, itens de ação com responsáveis e datas, perguntas em aberto e um e-mail de acompanhamento, cada um com o momento em que foi dito. Traz **Fala para texto** junto.
- **Python para dados**: um Python próprio com pandas, NumPy, SciPy, Matplotlib, openpyxl e PyArrow, para analisar tabelas e fazer gráficos sem instalar nada no seu próprio Python.
- **Fala para texto**: gravações, notas de voz e vídeos viram texto e legendas neste computador, com o Whisper, em cerca de 100 idiomas: em uma placa de vídeo NVIDIA quando houver (a configuração então adiciona as bibliotecas CUDA da NVIDIA, cerca de 1,3 GB), senão na CPU, e também na CPU quando a placa falha, informando o motivo. Um Mac transcreve na CPU: este Whisper não tem suporte à GPU da Apple. Traz **Áudio e vídeo** junto; seus modelos são baixados uma vez, na primeira vez que cada um é usado.
- **Bancos de dados SQLite**: ferramentas para examinar bancos de dados SQLite, consultá-los com segurança, alterá-los de uma só vez e levar dados de e para arquivos CSV. Precisa apenas do Python 3.
- **Texto de imagens**: lê o texto em imagens, fotos de documentos, capturas de tela, recibos e PDFs digitalizados, neste computador: na placa de vídeo quando houver (uma placa NVIDIA, para a qual a configuração adiciona a versão para GPU do ONNX Runtime com as bibliotecas CUDA da NVIDIA, cerca de 2 GB; ou a de um Mac, pelo Core ML), senão na CPU, e também na CPU quando a placa falha, informando o motivo.

## Abrir um plugin

Clique em um plugin. A janela dele mostra:

- de onde ele vem (**Vem com o app**, um link, um arquivo, **Feito aqui** ou uma pasta), o autor, a licença e o site;
- o interruptor, depois de adicionado: **Ativado para todos os agentes** ou **Desativada**;
- para que ele serve;
- **O que ele dá aos agentes**: suas habilidades (com quando cada uma é usada), seus servidores de ferramentas (o que cada um executa ou onde está) e suas instruções; e quais agentes o recebem;
- **O que ele precisa**, cada item com um visto ou uma cruz: outros plugins, pacotes de Python e Node, arquivos para baixar, programas neste computador (com como obter um que esteja faltando) e chaves (com **Adicionar** para uma que ainda não foi salva);
- seus próprios arquivos, problemas na pasta dele, se houver, e **Sobre ele**: a descrição do próprio plugin;
- para um plugin que você adicionou, a pasta dele e a pasta de dados.

Um plugin que você adicionou tem um menu **⋯** no fim: **Alterar** (para plugins que você criou ou usa a partir de uma pasta), **Obter a versão mais recente** (para um de um link), **Configurar de novo**, **Empacotar em .zip**, **Mostrar a pasta dele**, **Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta** (no app para computador; veja [Trabalhar com arquivos e pastas](/guide/files-git#work-with-files-and-folders)) e **Remover**.

## O que um plugin precisa e a configuração dele

Quando um plugin precisa de pacotes ou downloads, adicioná-lo os configura em uma pasta de dados própria, nunca para o computador inteiro:

- Os pacotes de Python vão para um ambiente Python próprio (criado com o uv quando este computador o tem; senão, com as ferramentas do próprio Python). Em um computador com GPU NVIDIA, um plugin pode adicionar os pacotes de que precisa para rodar nela, como as bibliotecas CUDA da NVIDIA; se a instalação deles falhar, ele funciona na CPU.
- Os pacotes de Node vão para uma pasta própria, instalados sem executar seus scripts de instalação.
- Os arquivos são baixados para a pasta de dados dele e conferidos com a impressão digital, quando o plugin informa uma.

Os agentes são informados de onde estão o Python, os pacotes e os arquivos dele, e seus servidores de ferramentas os encontram primeiro. As ferramentas de um plugin só chegam aos agentes depois que a configuração termina.

Se a configuração falhar, a linha do plugin avisa; a janela dele mostra o motivo, com **Tentar de novo**, e **Mostrar o que foi impresso** exibe a saída completa. Quando o que um plugin precisa muda (uma atualização do app ou do plugin), ele é configurado de novo: os integrados sozinhos, os outros quando você clica em **Configurar de novo**.

Os programas de que ele precisa (como o ffmpeg) não são instalados por você: um que esteja faltando aparece com como obtê-lo. Uma chave de que ele precisa vem do seu cofre, pelo nome: adicione-a em [Apps → Apps conectados → Chaves](/apps/connected?tab=keys). Os servidores de ferramentas dele recebem a chave; os agentes nunca a veem.

## Ativar ou desativar um plugin

Use o interruptor na linha dele ou na janela dele. Desativado, os agentes deixam de receber as habilidades, as ferramentas e as instruções dele a partir da próxima sessão; ele continua adicionado, com a configuração, para ser ativado de novo.

- Desativar um plugin de que outros precisam desativa esses também: o app pergunta antes e os nomeia.
- Ativar um plugin ativa os plugins de que ele precisa.

## Adicionar um plugin de um link, de um arquivo ou de uma pasta

1. Clique em **Adicionar** e depois em **De um link**, **De um arquivo .zip** ou **De uma pasta**.
2. Informe:
   - **De um link**: um repositório Git com um plugin, como dono/repo (para o GitHub) ou o endereço dele, ou um link para a pasta do plugin no GitHub. **Um branch ou uma pasta dentro do repositório…** aceita um branch ou tag e uma pasta.
   - **De um arquivo .zip**: um plugin empacotado em um .zip, daqui ou de outro lugar. Escolha-o ou solte-o na caixa.
   - **De uma pasta**: uma pasta neste computador. O plugin é usado onde está: as alterações feitas na pasta chegam às novas sessões, o que combina com um plugin que você está criando.
3. Clique em **Dar uma olhada**. Você vê o que o plugin dá aos agentes e o que ele precisa, quais plugins integrados ele traz junto e quais plugins de que ele precisa o app não tem (nesse caso ele não pode ser adicionado até que você adicione esses).
4. Clique em **Adicionar** (ou **Substituir**, quando já existe aqui um plugin com o nome dele; os dados dele são mantidos).

As etapas aparecem enquanto ele é configurado. Um plugin com o nome de um integrado não pode ser adicionado: renomeie-o no plugin.json dele.

## Criar um plugin seu

1. Clique em **Adicionar** e depois em **Criar um plugin**.
2. Dê a ele um **Nome** e para que serve, e clique em **Criar**. Ele é adicionado, fica ativado e o editor dele abre.
3. Preencha as abas e clique em **Salvar**:
   - **Sobre**: o nome que as pessoas veem, a versão (aumente-a quando compartilhar uma nova), para que serve, o grupo e a imagem.
   - **Habilidades**: **Escrever uma habilidade** (nome, grupo, quando usar e instruções), ou **Copiar uma das suas** a partir das suas habilidades. Clique em uma habilidade para alterá-la.
   - **Ferramentas**: **Adicionar um servidor de ferramentas**: **Um programa daqui** (o programa a iniciar, os argumentos dele um por linha e o ambiente dele em linhas NOME=valor) ou **Um endereço** (o endereço de um servidor MCP e cabeçalhos). Use `${PLUGIN_ROOT}` para a pasta do plugin e `${PLUGIN_DATA}` para a pasta de dados dele: os argumentos de um servidor viram `${PLUGIN_ROOT}/files/server.py`, por exemplo.
   - **Precisa de**: pacotes de Python, pacotes de Node, programas, chaves, outros plugins e arquivos para baixar, um por linha.
   - **Arquivos**: **Adicionar arquivos** coloca arquivos nele (cada um com até 50 MB, 200 MB no total); a lixeira remove um. Os arquivos são adicionados e removidos na hora, sem **Salvar**.
   - **Instruções**: algumas linhas que todo agente recebe enquanto o plugin estiver ativado.

Salvar verifica tudo antes: uma habilidade precisa dizer quando usá-la, o programa de um servidor de ferramentas é um único programa (não uma linha de shell), e assim por diante; o app diz o que corrigir. Quando os pacotes dele mudaram, ele é configurado de novo.

Os plugins que você cria ficam na pasta de dados do app (plugins/mine). Para alterar um depois, abra-o e escolha **Alterar** no menu **⋯** dele.

**Criar com um agente** abre uma nova sessão com o início de um pedido ("Me ajude a criar um plugin para o Hydor que…"): diga o que ele deve fazer, e o agente o escreve, o verifica e o adiciona a partir da pasta dele, com a sua aprovação.

## Compartilhar um plugin

- **Como arquivo**: abra o plugin e use **⋯ → Empacotar em .zip** (ou **Empacotar em .zip** no editor dele). Qualquer pessoa o adiciona com **Adicionar → De um arquivo .zip**. A configuração dele não é empacotada: ela é feita de novo onde ele for adicionado.
- **Como link**: coloque a pasta dele em um repositório Git (no GitHub, por exemplo). Qualquer pessoa o adiciona com **Adicionar → De um link** e recebe suas novas versões com **Obter a versão mais recente**.

Outras ferramentas que leem o formato Agent Plugins também podem usar as habilidades e os servidores de ferramentas dele; as partes que só este app lê (o que ele precisa, as instruções) ficam na parte `com.naget.agent`, que elas ignoram.

## Atualizar ou remover um plugin

- Os plugins integrados são atualizados com o app.
- Um plugin de um link: **⋯ → Obter a versão mais recente** baixa-o de novo e o configura se o que ele precisa mudou.
- Um plugin de um arquivo .zip: adicione o arquivo mais novo; ele substitui o antigo.
- Um plugin de uma pasta: as alterações na pasta chegam às novas sessões sozinhas.

Para remover um: **⋯ → Remover** e confirme. Os plugins que dependem dele também são removidos (o app os nomeia antes). Os pacotes e downloads dele são excluídos. Um plugin que você criou aqui é excluído junto com a pasta dele: empacote-o em .zip antes para guardar uma cópia. Um plugin usado a partir de uma pasta sua continua nessa pasta.

## Quais agentes recebem um plugin

Toda sessão que o app inicia recebe os plugins que estão ativados, configurados e cujos plugins necessários também estão ativados:

- as **habilidades** deles pela Biblioteca de habilidades, como as outras (veja [Quais agentes recebem quais habilidades](/guide/skills#which-agents-get-which-skills)). Uma habilidade com um nome que a Biblioteca já tem fica de fora: a janela do plugin diz qual habilidade os agentes recebem no lugar;
- os **servidores de ferramentas** deles como servidores MCP, iniciados na pasta do plugin com os pacotes próprios dele;
- as **instruções** deles, com uma linha sobre onde estão os pacotes e arquivos.

Um plugin pode ser só para alguns agentes; a janela dele diz quais. As sessões que já estão em execução recebem as alterações de um plugin a partir da próxima vez que forem iniciadas.

Um [app](/guide/apps#what-an-app-needs-on-this-computer) pode precisar de um plugin: ele só é executado enquanto esse plugin está ativado, seus agentes recebem as skills e as ferramentas do plugin, e suas etapas podem chamar essas ferramentas.

## Plugins do Claude Code e do Codex

O Claude Code e o Codex têm plugins próprios, vindos de seus marketplaces, que só eles usam. Cada um tem uma aba na página Plugins:

- **Claude Code**: **Instalado** (cada plugin com seu interruptor e **Desinstalar**), **Procurar** (pesquise nos marketplaces, dos mais instalados para os menos instalados, **Instalar**) e **Marketplaces** (adicione um por dono/repositório, um endereço Git ou uma pasta; remova um).
- **Codex**: **Adicionado ao Codex** (cada plugin com **Remover**), **Encontrar mais** (pesquise nos marketplaces do Codex, **Adicionar**) e **Marketplaces** (adicione, **Atualizar** ou remova um).

As habilidades deles aparecem na página Habilidades, junto das habilidades do próprio agente. Para usar um plugin do Claude Code com todos os agentes, adicione-o aos plugins deste app com **Adicionar → De um link**.

## Plugins e segurança

Os servidores de ferramentas de um plugin executam programas neste computador como você, e todos os agentes recebem as instruções dele. Adicione apenas plugins de pessoas em quem você confia e veja o que um plugin oferece e exige antes de adicioná-lo: o app mostra isso antes de instalar qualquer coisa. Os plugins que vêm com o app são feitos e verificados junto com ele.

Chaves nunca ficam em um plugin: o plugin indica os nomes das chaves de que precisa, e os servidores dele as recebem do seu Cofre enquanto são executados.

## Peça a um agente

- "Quais plugins eu tenho, e o que cada um oferece aos agentes?"
- "Adicione o plugin Speech to text e transcreva ~/Recordings/standup.m4a."
- "Desative o plugin Library docs."
- "Crie um plugin com as três habilidades de escrita da nossa equipe e compacte em um .zip."
- "Adicione o plugin que está em github.com/acme/agent-tools/tree/main/plugins/invoices."
- "Por que o plugin Text from pictures diz que a configuração falhou?"
