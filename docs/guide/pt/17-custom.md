# Custom, o agente próprio do app

O Custom é o agente próprio do Hydor: ele executa os modelos dos seus planos do Claude e do ChatGPT, e qualquer modelo que você adicionar, do OpenRouter, do Ollama, do vLLM ou de outro servidor compatível com OpenAI, com as mesmas ferramentas, habilidades e conexões do Claude Code e do Codex. Este tópico explica o que ele pode fazer, seus modos de permissão e como ele verifica comandos, o Modo automático, o sandbox para comandos, objetivos, como ele lida com trabalhos longos e modelos mais fracos, e suas configurações.

![Configurações → Modelos: o modelo auxiliar e os modelos neste computador](images/custom.webp)

## O que é o Custom e quando usar

O Claude Code só executa os modelos da Anthropic, e o Codex só os da OpenAI. O Custom também executa os modelos dos seus planos do Claude e do ChatGPT, por meio das contas conectadas do Claude Code e do Codex neste computador, e qualquer modelo que você configurar em [Configurações → Agentes → Modelos](/settings?s=models): modelos abertos no seu próprio computador, modelos baratos ou gratuitos pelo OpenRouter, ou um servidor seu. Não há nada para configurar nos modelos dos seus planos: assim que o Claude Code estiver conectado, o menu **Modelo** do Custom oferece Claude Opus, Fable, Sonnet e Haiku, e assim que o Codex estiver conectado com o ChatGPT, os modelos que o seu plano do ChatGPT lista, todos em **Suas assinaturas**. Eles usam o uso do seu plano, não uma chave de API. Veja [Agentes, contas e modelos](/guide/agents-models#where-customs-models-come-from) para saber de onde vêm os modelos do Custom e como adicionar mais.

Use o Custom quando você quiser:

- um modelo que nunca sai do seu computador (Ollama ou vLLM), ou uma sessão inteira que também não sai: uma [sessão confidencial](/guide/sessions#keep-a-session-confidential) sempre roda no Custom e usa apenas modelos deste computador ou da sua própria rede (nunca os modelos dos seus planos, que rodam nos servidores da Anthropic ou da OpenAI);
- um modelo específico, como DeepSeek, Qwen, GLM ou Kimi;
- as ferramentas e regras do Custom com um modelo do seu plano do Claude ou do ChatGPT, ou para manter os custos baixos, ou para trabalhar quando o seu plano do Claude ou do ChatGPT acabou (com um modelo de outro lugar).

Ele ajuda em qualquer coisa: pesquisa, redação, documentos e tarefas do dia a dia. Em um projeto de código (uma pasta com um `package.json`, `Cargo.toml`, um repositório git e similares), ele trabalha como um engenheiro cuidadoso: lê antes de alterar, segue as instruções do próprio projeto e executa os testes e as verificações do projeto antes de dizer que terminou.

O Custom lê os arquivos `AGENTS.md` ou `CLAUDE.md` do projeto e segue as suas [Diretrizes dos agentes](/guide/guidelines), como os outros agentes.

## Começar uma sessão do Custom

1. Na página inicial, clique em **Agente** e escolha **Custom** (“Qualquer modelo: OpenRouter, Ollama, vLLM”).
2. Clique em **Modelo** e escolha um dos seus modelos, ou **Automático** quando o menu oferecer: os níveis do Custom se preenchem sozinhos a partir dos modelos que ele tem (primeiro os do seu plano do Claude, depois os do seu plano do ChatGPT, depois os que você adicionou que não estão neste computador), e quando o nível Melhor indica um modelo, uma sessão em Automático começa com ele e lidera os subagentes (veja [Níveis: um modelo para cada tipo de trabalho](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Se a lista estiver vazia, adicione um modelo primeiro: **Agente** → **Modelos do Custom**.
3. Em **Opções**, escolha **Permissões** (veja [Escolher o que o Custom pode fazer sem perguntar](#choose-what-custom-may-do-without-asking)). **Esforço** é oferecido para um modelo que raciocina: um [modelo do OpenRouter](/guide/agents-models#effort-for-openrouter-models), com os esforços que o OpenRouter lista para ele (médio enquanto **Padrão** estiver escolhido), ou o modelo de um [endpoint](/guide/agents-models#other-openai-compatible-endpoints) (o endpoint informa que ele raciocina, ou você define o **Esforço de raciocínio** dele como **Sim**), com os **Níveis de esforço** dele. Para os outros modelos, o Custom não tem a configuração Esforço.
4. Digite a tarefa e pressione Enter.

Um modelo neste computador servido pelo vLLM começa na primeira vez que uma sessão o usa; a sessão mostra “Starting … with vLLM (the first time takes a minute or two)…”.

O Custom recebe uma mensagem por vez. Uma mensagem que você envia enquanto ele trabalha espera na fila acima da caixa de mensagem e é enviada quando a vez termina.

Você pode trocar o modelo durante uma sessão pelo menu abaixo da caixa de mensagem. O Custom usa o novo modelo a partir do próximo passo, até no meio de uma vez.

## O que o Custom pode fazer

- **Arquivos**: lê-los (texto com números de linha, uma parte de um arquivo longo por vez, o conteúdo de uma pasta), criar, reescrever e editar, listar pastas e encontrar arquivos pelo nome ou pelo que contêm. Antes de reescrever um arquivo inteiro que ainda não leu nesta sessão, ele é instruído a lê-lo primeiro.
- **Documentos**: arquivos PDF, Word, Excel, PowerPoint, OpenDocument, RTF e EPUB são lidos como texto.
- **Imagens**: imagens que você anexa, arquivos de imagem que ele abre e imagens de páginas da web ou de ferramentas. Um modelo que vê imagens recebe a imagem (para o modelo de um endpoint, quando o endpoint informa isso ou você define **Vê imagens** como **Sim**); para um que não vê, o modelo auxiliar a descreve (veja [Imagens para modelos que não veem](#images-for-models-that-dont-see)).
- **Comandos**: executam comandos de shell na pasta da sessão, por até dois minutos por padrão e dez no máximo. Servidores, watchers e outros comandos que continuam rodando vão para segundo plano: o Custom lê a saída deles quando precisa e pode pará-los. Eles também param quando o Custom é encerrado, e a próxima vez dele é informada de quais ainda estão rodando.
- **Páginas da web**: busca uma página como texto limpo, com títulos, links, listas e tabelas; PDFs e arquivos do Office online são lidos como texto. Só acessa endereços públicos; para este computador ou a rede dele, usa um comando como `curl`.
- **Um plano**: para trabalhos com várias etapas, mantém uma lista de verificação, exibida na sessão, e vai marcando os itens.
- **Habilidades**: carrega as habilidades que combinam com a tarefa: as do projeto, as suas (as pastas de habilidades do Claude Code e do Codex) e a [biblioteca de habilidades](/guide/skills) do app. Ele as conhece por grupo e nome, e também pode procurar uma pelo tipo de trabalho, em poucas palavras.
- **Servidores MCP**: servidores de ferramentas que você configurou para o Claude Code (para todas as pastas e para esta pasta), o `.mcp.json` do projeto e os do Codex.
- **As ferramentas do próprio app**: busca na web, o navegador, a memória, páginas, suas [conexões](/guide/connections) e o resto, como todo agente aqui recebe.

Cada passo aparece na sessão com um nome simples (“Read index.ts”, “Edit README.md”, “Fetch https://…”), com o diff ou a saída a um clique de distância.

## Escolher o que o Custom pode fazer sem perguntar

A configuração **Permissões** (em **Opções** na página inicial, ou no menu abaixo da caixa de mensagem de uma sessão) decide o que o Custom faz por conta própria. Shift+Tab na caixa de mensagem passa para o próximo modo.

- **Perguntar** (o padrão): pergunta antes de editar arquivos e antes de executar comandos. Comandos que só observam (`ls`, `cat`, `git status` e similares) rodam livremente.
- **Aceitar edições**: edita arquivos na pasta da sessão livremente; pergunta antes de executar comandos (exceto os que só observam) e antes de qualquer coisa fora da pasta.
- **Automático**: os passos de rotina prosseguem; uma verificação rápida pergunta a você sobre os arriscados. Veja [Modo automático](#auto-mode).
- **Acesso total**: ferramentas e comandos rodam sem pedidos de aprovação nem o [sandbox](#the-sandbox-for-commands) de comandos, incluindo comandos de administrador e alterações fora da pasta. Eles usam as permissões da conta do seu computador: isso não concede acesso de administrador que a sua conta não tem. Sessões confidenciais ainda mantêm suas restrições de rede.
- **Planejar**: só lê e planeja. O Custom não pode editar arquivos nem executar comandos, e só usa ferramentas que leem. Termina com um plano numerado. Para executá-lo, mude para outro modo e diga para ele seguir em frente.

Fora do Acesso total, alguns comandos sempre perguntam: veja [Comandos que sempre perguntam](#commands-that-always-ask).

## Aprovar ou recusar o que o Custom quer fazer

Quando o Custom precisa do seu OK, um cartão aparece na sessão (e na [caixa de entrada](/guide/inbox)). O título diz o que o passo faz e por que ele pergunta, por exemplo “Edit /home/you/notes/plan.md — it changes files outside the session folder”. Para um comando, o cartão mostra o comando inteiro.

- **Permitir** deixa este passo rodar.
- **Always allow …** deixa-o rodar, e passos semelhantes daqui em diante nesta sessão, sem perguntar. O botão diz o que ele cobre: “Always allow npm run build …”, “Allow all edits”, “Always allow reading in ~/data”, “Always allow changes in ~/site”.
- **Rejeitar** interrompe este passo. O Custom é informado de que você recusou, e de que não deve tentar de novo.

Como o **Always allow** funciona para comandos: o Custom divide um comando em partes (em `&&`, `;`, `|` e assim por diante) e verifica cada uma. Uma regra cobre o comando para o qual foi criada, pelas primeiras palavras (`git status`, `npm run build`, `docker compose up`), de modo que nada pode ir junto depois de `&&`. Comandos que só observam nunca precisam de uma regra.

O **Always allow** não é oferecido quando não pode ser seguro:

- para código dado direto no comando (como `python -c "…"`);
- para um arquivo cujo nome não pode ser conhecido de antemão;
- para um comando que não pode ser lido com confiança;
- para comandos arriscados, que perguntam sempre.

## Comandos que sempre perguntam

Fora do Acesso total, estes passos perguntam a você sempre, inclusive no Automático, seja o que for que você permitiu antes:

- executar como administrador (`sudo` e similares);
- excluir arquivos fora da pasta da sessão, excluir a própria pasta da sessão, ou excluir arquivos cujo nome não pode ser conhecido de antemão;
- redirecionar um download direto para um shell, ou executar um download imediatamente;
- gravar dados brutos em um disco, formatar ou reparticionar um disco;
- desligar ou reiniciar o computador;
- alterar tarefas agendadas (`crontab`);
- alterar permissões ou donos de uma árvore inteira de pastas;
- alterar chaves SSH, ou configurações e arquivos de inicialização na sua pasta pessoal (como `.bashrc` ou `~/.config`), a menos que a sessão trabalhe nessa pasta.

## Arquivos fora da pasta e arquivos com chaves

Em Perguntar, Aceitar edições e Planejar, o Custom pergunta antes de ler ou alterar arquivos fora da pasta da sessão (a pasta temporária não conta). O **Always allow** então cobre essa pasta, para leitura ou para alterações.

Arquivos que guardam chaves ou senhas perguntam antes de serem lidos ou alterados, também dentro da pasta: arquivos `.env` (não os de exemplo), chaves privadas SSH e outras, `.netrc`, `.npmrc`, arquivos de credenciais, suas pastas de nuvem e de gerenciador de senhas, as contas conectadas dos próprios agentes e os dados do próprio app. Os arquivos que você anexa às suas mensagens são a exceção: o app os guarda junto com os próprios dados, mas o Custom os lê sem perguntar. Um arquivo anexado em outra conversa continua perguntando. Alterações nas configurações e nos hooks do próprio git também perguntam. O **Always allow** então cobre apenas esse arquivo.

No Modo automático, as regras do Automático e a verificação rápida decidem sobre isso. No Acesso total, não perguntam.

## Modo automático

O **Modo automático** deixa o trabalho de rotina seguir sem interromper você e pergunta sobre o resto. Escolha **Automático** em **Permissões**.

Cada passo que perguntaria passa por estas verificações, em ordem:

1. **Regras fixas** que não precisam de modelo:
   - Prosseguem: edições dentro da pasta da sessão; novos arquivos rascunho na pasta temporária; comandos que só leem dentro da pasta; os testes, builds, linters e verificações de tipos do próprio projeto.
   - Perguntam a você: sobrescrever um arquivo fora da pasta; qualquer coisa na [lista de perguntas obrigatórias](#commands-that-always-ask); force-push com git; gravar, mover ou excluir arquivos fora da pasta; comandos que chamam um serviço de pagamento; ferramentas de uma conta conectada ou de um servidor MCP que enviam ou publicam algo, ou gastam dinheiro.
2. **Uma verificação rápida** para todo o resto, feita pelo [modelo auxiliar](/guide/agents-models#choose-the-helper-model). Ela responde de uma de três formas:
   - **permitir**: serve claramente ao que você pediu, fica na sua pasta (ou só lê) e é fácil de desfazer;
   - **perguntar**: poderia causar dano duradouro ou alcança mais longe (excluir dados, instalar software para o sistema inteiro, alterar configurações, usar senhas ou chaves, enviar ou publicar qualquer coisa, gastar dinheiro, ou algo que você não pediu);
   - **recusar**: é claramente prejudicial ou contra o que você quer. O passo não é executado; o Custom é informado do motivo e precisa achar outro caminho.

A verificação rápida vê apenas as suas próprias mensagens na sessão (a primeira e as dez mais recentes), o objetivo se você definiu um, a pasta e o próprio passo (para uma edição, o início do novo texto). Ela nunca vê o que o Custom leu, então uma página da web ou um arquivo não conseguem convencê-la de nada. Se a verificação falhar ou levar mais de 45 segundos, você decide. Dentro de uma mesma vez, o mesmo passo recebe a mesma resposta. Em uma [sessão confidencial](/guide/sessions#keep-a-session-confidential) a verificação fica neste computador: o modelo auxiliar a faz quando roda aqui, senão o próprio modelo da sessão.

Na sessão, um passo que o Automático deixou passar leva um pequeno rótulo **Automático**; passe o mouse sobre ele para ver o motivo. Um passo que o Automático barrou mostra o rótulo em vermelho; passe o mouse sobre ele para ver “Auto stopped this: …” e o motivo. Um cartão que o Automático envia a você começa com “Auto:” e o motivo.

[Configurações → Recursos → Custom](/settings?s=custom&find=Auto%20mode) tem uma linha **Modo automático** cujo (i) descreve o Modo automático com as mesmas palavras; não há nada para ativar ali.

## O sandbox para comandos

No modo Automático, os comandos do Custom podem ser executados em um sandbox: eles só podem alterar arquivos na pasta da sessão e em pastas temporárias, e todo o resto do computador fica somente para leitura. Eles ainda podem usar a rede. Quando a sessão trabalha em um git worktree ou em uma subpasta de um repositório, a pasta do próprio repositório também continua gravável, para que o git possa fazer commits. Os caches dos gerenciadores de pacotes vão para uma pasta temporária. Como o sandbox é feito depende do seu computador:

- **Linux**: usa o bubblewrap. Os comandos podem alterar arquivos na pasta da sessão, na pasta temporária (`/tmp`) e na pasta do próprio repositório.
- **Mac**: usa o Seatbelt, o sandbox que vem com o macOS. A regra é a mesma: a pasta da sessão, as pastas temporárias e a pasta do próprio repositório.
- **Windows**: os comandos são executados em baixa integridade, uma proteção do Windows: eles podem ler tudo, mas só alteram arquivos em pastas marcadas para isso. Na primeira vez, o Hydor marca a pasta da sessão (e a pasta do próprio repositório), e a marca permanece. Os comandos recebem uma pasta temporária própria, em `AppData\LocalLow\Hydor`, para arquivos temporários e caches de pacotes. Sua pasta pessoal, um disco inteiro, o Windows, o Program Files e as pastas de dados de apps nunca são marcados: nessas pastas, os comandos são executados sem o sandbox. O bash do Git não consegue compartilhar seu funcionamento interno com as suas janelas de bash comuns em baixa integridade, então, na primeira vez, o Hydor também faz uma cópia dos programas do Git para os comandos no sandbox, em `AppData\Local\Hydor\sandbox` (feita de links para os mesmos arquivos, por isso não ocupa espaço quando o Git está no mesmo disco).

Quando um comando esbarra nas paredes do sandbox, o Custom é avisado de que ele foi executado em um sandbox e então trabalha dentro dos limites ou diz a você o que precisa ser feito em outro lugar.

Para ativar ou desativar, abra [Configurações → Recursos → Custom](/settings?s=custom&find=Sandbox%20for%20commands) e use o interruptor de **Sandbox para comandos**. Ele vem ativado por padrão. Desative se alguma ferramenta precisar gravar em outro lugar, por exemplo para instalar algo para o sistema inteiro. A mudança vale para as sessões em andamento em cerca de 15 segundos.

Se o sandbox não puder ser executado, o interruptor fica esmaecido e a linha explica o motivo; os comandos então são executados sem sandbox. No Linux, isso significa que o bubblewrap não está instalado ou não consegue ser executado (como em alguns contêineres). No Mac, significa que o Seatbelt não conseguiu iniciar. No Windows, na primeira vez o Hydor cria um pequeno auxiliar com o .NET Framework que vem com o Windows, e também precisa do Git para Windows (de que os comandos precisam de qualquer forma): a linha avisa quando um dos dois está faltando ou quando o auxiliar não consegue iniciar. Nos modos Perguntar e Aceitar edições, os comandos não usam o sandbox: nesses modos, todo comando que faz mais do que apenas olhar espera o seu OK, ou uma regra que você salvou com **Permitir sempre**.

Em uma [sessão confidencial](/guide/sessions#keep-a-session-confidential), todo comando é executado sem rede, em todos os modos e seja qual for a posição deste interruptor, para que não consiga acessar a internet, seus outros computadores nem os servidores deste. Os arquivos continuam como o modo os define. Isso funciona no Linux (bubblewrap) e no Mac (Seatbelt). O Windows não consegue cortar a rede dessa forma; por isso, nele, e onde quer que o sandbox não possa ser executado, cada comando pergunta a você antes, em todos os modos, sem **Permitir sempre**. O Custom é avisado, e um comando que tenta usar a rede fica sabendo por que falhou.

## Dar um objetivo ao Custom

O Custom tem os mesmos objetivos que todos os outros agentes: o próprio ciclo do app o conduz, rodada após rodada, até que as verificações que você aprovou sejam satisfeitas. Abra o menu da sessão (⋯) → **Definir um objetivo**, ou ative **Opções** → **Objetivo** na página inicial, e o agente propõe as verificações para você aprovar. A cada rodada, o app executa as verificações por conta própria, mantém a rodada ou a desfaz (em um worktree), pergunta a você que rumo tomar nos pontos de virada e para quando todas as verificações são satisfeitas, quando você o interrompe ou quando um limite é atingido. A história completa, com as telas, está em [Objetivos](/guide/goals).

O que agora é igual para todos os agentes: o cartão de acordo, as verificações, a lista de rodadas, as perguntas, suas regras e **Sua decisão**, e o relatório. Digitar `/goal` em uma sessão do Custom não faz mais nada de especial: é texto comum. Duas coisas são específicas do Custom:

- Uma verificação do **Revisor**, e a verificação final, são julgadas por um modelo que não fez nenhum do trabalho. Em uma [sessão confidencial](/guide/sessions#keep-a-session-confidential), esse é um modelo neste computador; sem um, a verificação não pode ser executada.
- Os comandos de verificação são executados como os comandos do próprio Custom: no modo Automático com **Sandbox para comandos** ativado, dentro do sandbox, restritos à pasta da sessão; nos outros modos, como os comandos do próprio Custom; em uma sessão confidencial, sempre dentro do sandbox e sem rede.
- As rodadas que um novo objetivo recebe vêm de **Rodadas que um objetivo pode executar** em [Configurações → Recursos → Objetivos](/settings?s=goals). Esse valor vale para os objetivos de todos os agentes, não apenas os do Custom.

Os objetivos que o Custom tinha em andamento antes desta versão não foram mantidos: defina um novo.

Para mudar quantas rodadas um novo objetivo recebe, abra [Configurações → Recursos → Objetivos](/settings?s=goals&find=Rounds%20a%20goal%20may%20run) e escolha **10**, **30** ou **100** na linha **Rodadas que um objetivo pode executar**. Você pode definir outro número no cartão de acordo, e o agente também pode propor um.

## Conversas longas e respostas longas

Todo modelo só consegue ler uma quantidade limitada de uma vez (o seu contexto). O Custom mantém cada conversa dentro desse limite por conta própria, então não há botão Compactar nas sessões do Custom:

1. Quando a conversa chega perto do limite (deixando espaço para a resposta), o Custom primeiro apaga resultados antigos de ferramentas. A sessão registra: “Cleared old tool output to keep within the model's context.”
2. Se isso não bastar, o modelo resume a parte anterior em notas a partir das quais o trabalho continua (“Summarizing the earlier conversation to keep within the model's context…”). Da vez seguinte, ele atualiza essas notas em vez de começar do zero. Seu plano e as habilidades em uso são mantidos nos dois casos.

Se o servidor de um modelo disser que a conversa está longa demais, o Custom descobre o limite real desse modelo e condensa na hora. Apenas as últimas imagens vão junto com cada requisição.

O que a memória deu ao Custom no início permanece o mesmo enquanto ele trabalha, para que o servidor do modelo possa reaproveitar o que guardou da conversa, o que é mais rápido e custa menos. Cada vez que condensa, ele lê a memória de novo, para a sua mensagem mais recente (veja [Com o que um agente começa](/guide/memory#what-an-agent-starts-with)).

O anel ao lado da caixa de mensagem mostra, em porcentagem, quanto do contexto do modelo está cheio; passe o ponteiro sobre ele para ver os tokens e a que se destinam. Em **Opções** (o botão sob a caixa de mensagem), a linha **Contexto** diz “42% em uso”, com uma pequena seta: clique nela para mostrar (ou ocultar) o detalhamento, que fica recolhido no início: **Instruções**, **Instruções do projeto**, **Memória**, **Recursos do app**, **Habilidades**, **Ferramentas** e **Conversa**, cada um com seus tokens e uma barra fina para a sua parte. Uma parte sem nada dentro é omitida. Os números são estimados a partir do texto e ajustados ao que o servidor do modelo contou. Clicar no anel não faz nada em uma sessão do Custom, já que o Custom condensa por conta própria; as sessões do Claude Code e do Codex mantêm o anel e o botão **Compactar** (veja [Ler os medidores](/guide/sessions#read-the-meters-context-cache-and-speed)).

Respostas longas também não enchem a conversa. Quando um comando, uma página ou uma ferramenta devolve mais do que uma parte do contexto do modelo, o Custom guarda tudo em um arquivo na pasta da própria sessão. O modelo recebe o início e o fim (no caso de um comando, principalmente o fim, onde os erros aparecem) e o local do arquivo, e lê o restante em partes ou faz buscas nele. Esses arquivos são excluídos depois de uma semana.

## O que o modelo lê

Antes da sua mensagem, o modelo recebe, nesta ordem:

- as regras do próprio Custom (como trabalhar, o modo, a pasta), as instruções do agente e as suas Diretrizes dos agentes: **Instruções** no detalhamento;
- as instruções do projeto, o `AGENTS.md` ou `CLAUDE.md` dele: **Instruções do projeto**;
- o que a [memória](/guide/memory#what-an-agent-starts-with) tem para o seu pedido: **Memória**;
- o que dizem os recursos do app: como as respostas aparecem, como manter chaves e senhas fora da conversa, a limpeza e como usar por completo as ferramentas que ele tem (imagens, apps, o navegador, documentos e assim por diante): **Recursos do app**;
- suas habilidades (**Habilidades**), nomeadas por grupo: as do próprio projeto, as suas e depois os grupos da Biblioteca, como Programação ou Documentos. O Custom pode carregar uma pelo nome ou procurar uma pelo tipo de trabalho. O Custom aceita até 200 habilidades, no máximo 40 delas do projeto e suas. As habilidades que combinam com a sua primeira mensagem vêm com a descrição do que cada uma faz;
- suas ferramentas, as que ele tem por completo e uma lista curta das demais: **Ferramentas**.

As instruções de um recurso sobre as próprias ferramentas vêm junto com essas ferramentas. Enquanto uma ferramenta espera na lista curta do Custom, suas instruções também esperam; elas são adicionadas quando o modelo procura a ferramenta ou a usa. As regras que valem quaisquer que sejam as ferramentas em uso ficam sempre. O Claude Code e o Codex recebem todas as instruções do app no início, como antes.

Assim, a primeira mensagem para um modelo com contexto pequeno é mais curta do que era, e o que cada parte ocupa está no detalhamento em **Opções**: veja [Conversas longas e respostas longas](#long-conversations-and-long-output).

**A memória é dimensionada conforme o contexto do modelo.** Um modelo com contexto pequeno não conseguiria fazer seu trabalho se a memória ocupasse uma quantidade fixa, então a parte da memória diminui junto com a janela (a linha **Memória** do detalhamento mostra quanto ela ocupa):

- **Menos de 12.000 tokens**: um bloco pequeno, de no máximo 6% do contexto, com as primeiras 120 palavras do seu perfil (ele avisa que são apenas o começo), no máximo três notas e nenhum índice. A memória não acrescenta nada às suas mensagens nem quando o modelo lê ou altera um arquivo, e não fornece linhas de artigos da wiki nem planos. O modelo é avisado de que pode consultar notas com a ferramenta de memória.
- **Até cerca de 33.000 tokens** (fora do OpenRouter): um bloco de no máximo 6% do contexto, as primeiras 400 palavras do seu perfil, no máximo cinco notas, um índice curto, uma linha de artigo da wiki e uma linha de plano, e no máximo uma nota com uma mensagem (600 caracteres) e uma quando um arquivo é lido ou alterado (350).
- **Modelos maiores**: tudo o que a [memória dá a um agente](/guide/memory#what-an-agent-starts-with), o que é uma pequena parte do contexto deles.

Como referência, o bloco da memória chega a cerca de 1.700 caracteres para um modelo de 8.000 tokens, 3.800 para 32.000 e 7.300 para 200.000. Uma sessão que recebeu apenas o início do seu perfil não pode reescrevê-lo: o modelo diz o que você deve acrescentar, ou você mesmo o edita em [Configurações → Memória](/settings?s=memory&find=Your%20profile). As instruções da wiki também são encurtadas: o Custom sempre recebe um parágrafo curto sobre a Memória wiki, e como guardar fontes, verificar a wiki e adotar planos só vem enquanto as ferramentas para isso são oferecidas. Depois que o Custom condensa a conversa, o checkpoint da sessão (veja [Checkpoints](/guide/wiki-memory#checkpoints)) é reduzido a 8% do contexto, no máximo 16.000 caracteres, com a indicação de onde ler o restante.

## Como o Custom lida com modelos mais fracos

Nem todo modelo é tão treinado no uso de ferramentas quanto o Claude ou o GPT. O Custom detecta os deslizes mais comuns e coloca o modelo de volta no caminho:

- **Repetições**: o mesmo passo, sem nada que tenha mudado desde então, não é executado uma terceira vez (o modelo é orientado a usar o resultado anterior); na quinta vez, a vez é interrompida.
- **Passos que falham**: depois de quatro passos seguidos que falharam, o modelo é orientado a parar e repensar; depois de oito, a vez é interrompida.
- **Círculos**: passos que giram em um ciclo recebem uma nota para tentar algo diferente.
- **Trabalho inacabado**: um modelo que diz “vou…” sem fazer, ou que para com itens do seu plano ainda em aberto, é mandado de volta ao trabalho, uma vez em cada caso. Depois de alterar código sem executar as verificações do projeto, ele é solicitado a executá-las antes de terminar.
- **Comprimento**: uma vez tem no máximo 200 passos; no 150º, o modelo é orientado a terminar a parte mais importante. Uma resposta cortada pelo limite de comprimento do modelo é continuada em passos mais curtos.
- **Chamadas de ferramentas quebradas**: chamadas escritas como texto são lidas e executadas, chamadas com argumentos quase certos são corrigidas, e um nome de ferramenta escrito errado é associado ao correto ou respondido com a lista de ferramentas. Uma resposta que escreve suas chamadas como texto termina onde suas chamadas terminam: o que um modelo escreve depois delas (resultados que ele imaginou, mais chamadas por cima dessas, a mesma chamada de novo) não é executado nem mantido, e no máximo seis chamadas são executadas a partir de uma resposta.
- **Modelos sem chamada de ferramentas**: quando o servidor de um modelo não aceita ferramentas, o Custom as descreve nas instruções e lê as chamadas do modelo a partir do que ele escreve.
- **Claude pelo Claude Code**: a Anthropic permite que apenas os próprios programas usem o login de um plano, então um modelo Claude do seu plano responde pelo próprio Claude Code, um passo de cada vez. As ferramentas do Custom são descritas nas instruções dele e o Claude escreve suas chamadas de ferramentas como texto, como em um modelo sem chamada de ferramentas, e cada passo reaproveita o cache do anterior. O Claude Code não consegue encerrar uma resposta nas chamadas de ferramentas, então o Custom a encerra ali por conta própria e para o programa, antes que o Claude possa escrever resultados que imaginou. Os modelos do Codex são diferentes: eles são consultados diretamente no seu plano do ChatGPT, com as ferramentas do Custom como ferramentas de verdade.
- **Soluços**: quando a conexão cai no meio de uma resposta, ou o servidor está ocupado, o Custom espera e tenta de novo algumas vezes. Quando o app reinicia (uma atualização) enquanto um passo espera por um modelo do seu plano, o passo é solicitado de novo assim que o app volta; uma vez que terminou por causa da reinicialização avisa isso, e uma mensagem a retoma.
- **Muitas ferramentas**: quando há muitas (de servidores MCP e conexões), o modelo vê uma lista curta e procura a descrição completa das que precisa; as instruções de um recurso sobre uma ferramenta vêm junto com ela, quando o modelo a procura ou a usa (veja [O que o modelo lê](#what-the-model-reads)). Um modelo com contexto curto (cerca de 32.000 tokens ou menos, fora do OpenRouter) recebe um conjunto mais enxuto: sem orientações sobre UIs de resposta, uma lista de ferramentas só com os nomes e menos ferramentas por completo (a que mostra uma página de HTML também espera na lista). Ele também é orientado a dar passos pequenos.
- **Cada família de modelos** recebe as configurações recomendadas pelo seu fabricante, o formato de edição em que foi treinada e um esforço de raciocínio quando há um. Os passos que apenas leem são executados ao mesmo tempo, para poupar espera.

Quando o Custom interrompe uma vez por um desses motivos, a resposta termina com “(Stopped: …)”.

## Imagens para modelos que não enxergam

Um modelo que vê imagens recebe suas imagens diretamente. O modelo de um endpoint é tratado como um modelo que não vê, a menos que o endpoint diga que vê imagens ou que você defina **Vê imagens** como **Sim** na [linha](/guide/agents-models#other-openai-compatible-endpoints) dele. As imagens são reduzidas antes quando este computador tem ffmpeg ou ImageMagick.

Para um modelo que não enxerga imagens, o modelo auxiliar descreve cada imagem em palavras: o que ela mostra, onde as coisas estão e qualquer texto que apareça nela, copiado exatamente. Isso exige um modelo auxiliar que enxergue imagens: abra [Configurações → Agentes → Modelos](/settings?s=models&find=Helper%20model) e escolha um marcado como "enxerga imagens" no menu **Modelo** do grupo **Modelo auxiliar**. "Automático" não serve. Sem um, o Custom avisa ao modelo que há uma imagem que ele não consegue ver. Em uma sessão confidencial, apenas um modelo auxiliar neste computador descreve imagens (um modelo dos seus planos nunca faz isso).

## Bifurcar e Editar a partir daqui

As sessões do Custom podem ser bifurcadas como as sessões do Claude Code e do Codex: menu da sessão (⋯) → **Bifurcar**. Você também pode alterar uma mensagem sua anterior com **Editar a partir daqui**: a conversa continua em uma cópia a partir de logo antes dessa mensagem, e a original é arquivada. Marque **Restaurar os arquivos como estavam antes desta mensagem** para desfazer as alterações nos arquivos desde então. No Custom, isso vale para os arquivos que as próprias edições dele alteraram; o que os comandos alteraram permanece como está.

O Custom guarda cada conversa no disco, então ela continua depois que o app é reiniciado.

## Quanto o Custom custa

- Modelos pelo OpenRouter: o OpenRouter informa quanto cada chamada custou, e o gasto da sessão usa esse valor. Os modelos Claude por lá são solicitados a manter a conversa no cache, como os outros fazem por conta própria, então cada passo a lê de volta por cerca de um décimo do preço; e as ferramentas oferecidas ao Custom mudam no máximo uma vez em uma sessão (as ferramentas para comandos executados em segundo plano permanecem depois que um deles foi executado), para que esse cache se mantenha.
- Modelos do seu plano Claude ou ChatGPT (em **Suas assinaturas**): o uso do seu plano, não dinheiro por token, então uma sessão mostra US$ 0 nesses passos. Uma conta que atingiu o limite de uso ou que saiu da conta passa o passo para a sua próxima conta desse programa (com **Trocar de conta no limite** ativado).
- Modelos neste computador (Ollama, vLLM): nada.
- Outros endpoints: os tokens são cobrados como os dos outros agentes (veja [Uso, limites e custos](/guide/usage)).

A sessão mostra o custo da API e os tokens de entrada, em cache e de saída acima da caixa de mensagem, mesmo sem um limite de gastos. As cobranças vêm da resposta do OpenRouter, ou do registro de geração dele se a cobrança enviada em streaming estiver ausente; os preços do próprio catálogo são o último recurso. Não é preciso informar preços manualmente.

Um [limite de gastos](/guide/usage#cap-what-a-session-spends) também funciona em sessões do Custom.

## Configurações → Recursos → Custom

[Configurações → Recursos → Custom](/settings?s=custom) (“Modo automático e um sandbox para comandos”) tem duas linhas:

- **Modo automático** (um dos modos do Custom, ao lado de Perguntar, Aceitar edições, Acesso total e Planejar): o (i) dele diz o que o modo Automático deixa passar, o que sempre pergunta e que o modelo auxiliar faz a verificação. Não há nada para ligar: você escolhe Automático por sessão em **Permissões**.
- **Sandbox para comandos** (no modo Automático, os comandos alteram arquivos apenas na pasta da sessão e em /tmp no Linux, nas pastas temporárias no Mac, ou em uma pasta temporária própria no Windows; o Acesso total executa sem esse sandbox e sem pedidos de aprovação): um interruptor, ativado por padrão. Fica esmaecido quando o sandbox não pode ser executado aqui (bubblewrap no Linux, Seatbelt no Mac, Git for Windows e .NET Framework no Windows), e a linha explica o motivo.

Os modelos do Custom estão em [Configurações → Agentes → Modelos](/settings?s=models), e o modelo que faz as verificações é o **Modelo auxiliar** lá.

## Pergunte a um agente

- “Desative o sandbox para os comandos do modo Automático do Custom.”
- “Dê aos novos objetivos até 100 rodadas.”
- “Defina um objetivo na minha sessão do Custom ‘Página de upload’: npm test passa e uploads de 2 GB funcionam, e só me pergunte quando estiver travado.”
- “Qual modelo auxiliar o modo Automático usa, e ele enxerga imagens?”
- “Este computador consegue executar os comandos das minhas sessões confidenciais sem rede?”
- “Adicione o Qwen3 Coder do OpenRouter para eu usá-lo com o Custom.” (depois que sua chave do OpenRouter estiver configurada)
- “Mostre meu uso e meus custos no OpenRouter sem eu informar preços de modelos.”
- “Por que minha primeira mensagem para o Custom fica tão longa para um modelo local?”
- “Quanto do contexto da minha sessão do Custom está cheio, e o que ocupa mais espaço?”
- “Execute minha sessão do Custom no Sonnet do meu plano Claude em vez do OpenRouter.”
- “Qual modelo é o Melhor para o Custom, e minhas sessões do Custom podem começar no Automático?”
