# Apps conectados, chaves e ferramentas

Conecte os serviços que você usa (seu e-mail, Notion, GitHub, Stripe, uma pasta neste computador…) uma vez, em **Apps conectados**, na página Apps, e todos os agentes e apps poderão trabalhar com eles. Guarde chaves de API e logins em um cofre criptografado que os agentes usam sem nunca ver, adicione servidores de ferramentas ao Claude Code e ao Codex, e plugins ao Claude Code. Use isto quando quiser que os agentes ajam nas suas próprias contas, chamem um serviço com a sua chave ou tenham ferramentas que não vêm com eles.

![Apps → Apps conectados: os serviços que você conectou, o marketplace e as suas chaves](images/connections.webp)

## O que são conexões, chaves e ferramentas

Os agentes conseguem fazer mais quando você dá ferramentas a eles. Há três lugares para isso:

- **Apps conectados** ([Apps → Apps conectados](/apps/connected)): serviços de um marketplace, conectados uma vez para todos os agentes: Claude Code, Codex, Custom e os agentes que falam ACP, e os apps que eles executam. Cada conta conectada dá suas ferramentas aos agentes.
- **O cofre** (a aba **Chaves** da mesma página): chaves de API, tokens e as senhas dos logins. Uma chave de API é uma senha que um serviço dá a você para que programas possam usar a sua conta. Os agentes usam essas chaves para chamar um serviço, entrar em um site ou executar um programa, mas nunca as veem.
- **Servidores MCP e plugins** ([Configurações → Servidores MCP](/settings?s=mcp) e [Configurações → Plugins](/settings?s=plugins)): servidores de ferramentas que você configura nas próprias configurações do Claude Code e do Codex, e plugins que levam habilidades e ferramentas a todos os agentes (veja [Plugins](/guide/plugins)).

MCP (o Model Context Protocol) é a forma comum de um serviço oferecer ferramentas aos agentes. Uma conta conectada é um servidor MCP que o Hydor configura e no qual entra para todos os agentes. Os servidores MCP em Configurações → Agentes são os que você configura à mão, com um comando ou um endereço.

## Abrir Apps conectados

Abra **Apps** na barra de ícones e escolha **Apps conectados** na coluna (no celular, a aba **Apps conectados**), ou vá para [Apps → Apps conectados](/apps/connected). (Antes eles ficavam em Configurações, como Conexões: um link antigo para eles leva até aqui.) Abaixo de uma linha sobre para que servem, com **Conectar um serviço**, há três abas:

- **Conectado**: as contas que você conectou e como cada uma está. O número na aba as conta; **Apps conectados** na coluna (ou sua aba no celular) também as conta.
- **Marketplace**: todos os serviços que você pode conectar.
- **Chaves**: o cofre. O número na aba conta as suas chaves.

A página abre em **Conectado** quando você já conectou algo, e em **Marketplace** quando não conectou; cada aba tem um endereço próprio (`/apps/connected?tab=market`, `?tab=keys`). No celular, as abas rolam para o lado e as caixas de diálogo sobem da parte de baixo da tela.

## Encontrar um serviço no marketplace

Abra [a aba Marketplace](/apps/connected?tab=market).

- A caixa de busca ("Search … services: mail, Notion, invoices…") procura em nomes, descrições, palavras-chave e categorias. Cada palavra que você digitar precisa corresponder.
- As categorias, cada uma com o número de serviços que tem, aparecem uma de cada vez: **Todos os serviços** (**Todos** como chip), **Notas e documentos**, **Tarefas e projetos**, **E-mail, chat e reuniões**, **Calendário e agendamento**, **Arquivos e armazenamento**, **Design e mídia**, **Ferramentas para desenvolvedores**, **Nuvem e hospedagem**, **Bancos de dados e dados**, **Análises e monitoramento**, **Vendas, marketing e suporte**, **Pagamentos e finanças**, **Sites e lojas**, **Busca e web**, **IA e automação**, **Viagens e dia a dia** e **Neste computador**. Em um computador, elas formam uma lista ao lado dos serviços; em uma tela mais estreita, são chips abaixo da caixa de busca que rolam para o lado.
- **Em destaque**: uma fileira de cartões maiores para serviços conhecidos (Notion, Linear, GitHub, Figma, Stripe, Zapier…). Aparece enquanto você não buscou nem escolheu uma categoria; em um computador, as setas a rolam. Os serviços vêm em seguida, em **Todos os serviços** (ou na categoria escolhida, ou **Encontrado** quando você busca), com o número de serviços. No celular, eles são as linhas de uma única lista.

Cada cartão mostra o nome do serviço, o que um agente pode fazer com ele e como ele se conecta:

- **Login pelo navegador**: você entra na sua conta no navegador.
- **Chave de API**: você cola uma chave que o serviço dá a você.
- **Sem login**: não há nada a preencher.
- **Executa neste computador**: um programa que o Hydor inicia aqui quando um agente precisa dele.
- **Executa aqui, com uma chave**: o mesmo, com uma chave que você fornece.
- **Endereço e senha de app**: seu endereço de e-mail e uma senha criada para programas de e-mail (E-mail).

Um sinal de verificação ao lado do nome significa que alguém conferiu que o servidor do serviço responde como diz a sua entrada. **não verificado** significa que ninguém conferiu ainda. Os serviços que você conectou mostram **Conectado** (ou **Entrar de novo**) onde os demais mostram **Conectar**.

Alguns dos serviços disponíveis:

- **Notas, tarefas e projetos**: Notion, Craft, Linear, Asana, Atlassian (Jira e Confluence), ClickUp, monday.com, Todoist.
- **E-mail, chat e calendários**: E-mail (qualquer conta de e-mail, com uma senha de app), Gmail, Slack, Fireflies, Granola, Google Calendar, Calendly.
- **Arquivos e design**: Google Drive, Dropbox, Box, Figma, Canva, Miro, Gamma, Cloudinary.
- **Ferramentas para desenvolvedores e hospedagem**: GitHub, GitLab, Sentry, CircleCI, Postman, Cloudflare, Vercel, Netlify, Railway, Context7, DeepWiki.
- **Dados e análises**: Airtable, Supabase, Neon, PostgreSQL, MongoDB, SQLite, PostHog, Mixpanel, Amplitude, Datadog.
- **Negócios**: Stripe, PayPal, Plaid, Square, HubSpot, Intercom, Attio, Klaviyo, Webflow, Wix, WordPress.com.
- **Busca e web**: Exa, Perplexity, Tavily, Brave Search, Firecrawl, Wolfram, um navegador Playwright.
- **IA e dia a dia**: Hugging Face, Zapier, AllTrails, Kiwi.com, trivago, Strava.
- **Neste computador**: Arquivos neste computador (as pastas que você escolher), Git, Hora e um grafo de memória.

Quando nenhum serviço corresponde, a página mostra **Nenhum serviço corresponde**. Você pode adicionar o serviço por conta própria: veja [Adicionar um serviço ao marketplace](/guide/connections#add-a-service-to-the-marketplace). Novos serviços chegam com as atualizações do app.

## Conectar um serviço

1. Clique no cartão do serviço. Uma caixa de diálogo mostra o que ele faz, sua categoria, como ele se conecta e **Verificado** com uma data (ou **Endereço ainda não verificado**). **Site** e **Documentação** levam ao serviço. Uma caixa mostra onde ele é executado: o endereço do servidor ou o comando que ele executa aqui. Ela também diz que todos os agentes recebem as ferramentas do serviço sob o nome curto dele (as do Notion sob "notion") e que você pode desativá-lo por sessão.
2. Leia a nota na caixa amarela, se houver. Ela diz o que é bom saber antes, como "Needs uv (uvx) on this computer." ou que um serviço exige o seu próprio cliente de login.
3. Preencha o que a caixa de diálogo pede e clique em **Conectar**, ou em **Entrar em** e o nome do serviço.

Depois de conectar, o serviço passa para a aba **Conectado** e é testado em segundo plano. O que a caixa de diálogo pede depende do serviço.

### Serviços sem nada a preencher

Clique em **Conectar**. Alguns pedem uma configuração antes. O GitLab pede o seu endereço (gitlab.com, a menos que você tenha o seu próprio). Arquivos neste computador pede as pastas que ele pode usar, como caminhos completos, um por linha; ele só pode ler e alterar arquivos dentro delas. O SQLite pede o arquivo do banco de dados. Os campos marcados como **opcional** podem ficar vazios. **Obter uma** ao lado de um campo leva ao lugar onde você consegue esse valor.

### Serviços que usam uma chave

Um serviço na internet tem um campo **Chave**, com **Obter uma chave** levando à página onde ele cria uma. Um serviço que executa aqui pede a chave em um ou mais campos próprios (um token, uma string de conexão). Cole a chave e clique em **Conectar**.

A chave vai para o cofre, criptografada. Daí em diante você só vê os últimos caracteres dela. O GitHub, por exemplo, usa um token de acesso pessoal de granularidade fina: uma chave que você pode limitar aos repositórios e às permissões que quer dar aos agentes.

### Serviços em que você entra pelo navegador

1. Clique em **Entrar em** e o nome do serviço.
2. Em um computador, abre-se uma janela pequena. No celular, a página de login do serviço abre na mesma aba.
3. Entre e permita o acesso. Enquanto você faz isso, a caixa de diálogo diz "Waiting for you to finish signing in…".
4. Quando terminar, um aviso diz que a conta está conectada. No celular, você volta para Apps → Apps conectados.

Os tokens ficam criptografados neste computador e se renovam sozinhos; os agentes nunca os veem. Um login precisa ser concluído em 15 minutos; depois disso, comece de novo. Se você recusar o acesso, aparece "You did not allow access".

Alguns serviços só deixam você entrar por meio de um cliente de login (um app OAuth) seu: Asana, Box, HubSpot, Slack e os apps do Google, por exemplo. A caixa de diálogo deles abre **Seu próprio ID de cliente (este serviço exige um)**, com o que fazer. Outros logins pelo navegador oferecem o mesmo como **Use seu próprio ID de cliente (opcional)**, que também abre sozinho quando um serviço não deixa apps se registrarem por conta própria.

1. Crie o cliente nas configurações de desenvolvedor do serviço.
2. Informe a ele o endereço em **Endereço de retorno a informar** (há um botão de copiar).
3. Cole o **ID do cliente** e o **Segredo do cliente**, se houver.
4. Clique em **Entrar em** e o nome do serviço.

### Serviços que executam neste computador

Eles iniciam um programa aqui (com npx ou uvx) para o agente de cada sessão. O primeiro teste pode demorar se o programa precisar ser baixado antes. Uma chave de que esse serviço precisa vai do cofre para o ambiente dele quando ele inicia. Ela nunca aparece em uma linha de comando, onde outros programas poderiam lê-la.

## Conectar seu e-mail

Os agentes podem ler, buscar, organizar, redigir rascunhos e enviar o seu e-mail depois que você conecta sua conta de e-mail com o endereço e uma senha de app. Funciona com Gmail, iCloud Mail, Fastmail, Yahoo, AOL, GMX, WEB.DE, Zoho, Posteo, mailbox.org, Proton Mail (pelo Proton Mail Bridge) e a maioria dos e-mails de trabalho e de escola.

1. Abra [a aba Marketplace](/apps/connected?tab=market) e clique em **E-mail** (em **E-mail, chat e reuniões**, ou busque por "email").
2. Digite o seu **Endereço de e-mail**. O Hydor encontra os seus servidores de e-mail sozinho. Para um provedor que ele conhece, mostra como criar uma senha de app lá, e **Como criar uma** abre a página de ajuda do próprio provedor.
3. Crie uma senha de app (veja abaixo) e cole em **Senha de app**.
4. Se quiser, digite **Seu nome**, como as pessoas o veem nos e-mails que você envia.
5. Clique em **Conectar**. O Hydor entra para ler e para enviar antes de salvar qualquer coisa. Se isso falhar, ele diz o motivo: uma senha ou um nome de usuário errado, que o seu provedor quer uma senha de app em vez da sua senha de costume, ou que um servidor não respondeu.

A senha de app fica criptografada no cofre neste computador; os agentes nunca a veem. Para conectar outra conta, abra **E-mail** de novo e clique em **Adicionar outra conta**.

### Criar uma senha de app

Uma senha de app é uma senha separada para programas de e-mail, criada nas configurações de segurança da sua conta, usada no lugar da senha com que você entra na web. A maioria dos provedores pede que você ative antes a verificação em duas etapas.

- **Gmail**: ative a Verificação em duas etapas na sua Conta do Google e depois abra **Segurança → Senhas de app**. Contas de trabalho e de escola precisam que o administrador permita.
- **iCloud Mail**: em account.apple.com, abra **Login e segurança → Senhas específicas de app**.
- **Fastmail**: **Configurações → Privacidade e segurança → Gerenciar senhas de app**.
- **Yahoo** e **AOL**: **Segurança da conta → Gerar senha de app**.
- **GMX**, **WEB.DE** e **Zoho**: ative antes o IMAP nas configurações da caixa de e-mail.
- **Proton Mail**: instale o Proton Mail Bridge e entre nele neste computador; depois use a senha que o Bridge mostra para o seu endereço.

### Quando os seus servidores não são encontrados

Para um provedor que o Hydor não conhece, ele lê as configurações que o seu provedor publica para programas de e-mail. Para encontrá-las, ele consulta o diretório público de provedores de e-mail da Mozilla sobre o seu domínio (nunca o seu endereço completo). Quando não há nenhuma, ele tenta imap. e smtp. na frente do seu domínio e deixa o login conferi-los.

Se isso falhar, abra **Servidores e nome de usuário** e digite os servidores de entrada (IMAP) e de saída (SMTP), suas portas e sua segurança (**SSL/TLS** ou **STARTTLS**), como as páginas de ajuda do seu provedor os informam, e o nome de usuário, se não for o seu endereço completo. Uma conexão sem criptografia só é permitida para este computador (uma ponte como o Proton Mail Bridge).

### Outlook.com e Microsoft 365

Contas Outlook.com, Hotmail e Live, e contas de trabalho ou de escola no Microsoft 365, ainda não podem se conectar desta forma. A Microsoft desativou as senhas de app para elas, então precisam de um login da Microsoft, que o Hydor ainda não tem. A caixa de diálogo de E-mail avisa isso quando você digita um endereço assim.

### Suas contas de e-mail

Na aba **Conectado**, a linha de E-mail lista as suas contas pelo endereço. **Testar** entra em cada uma. **Contas** abre a caixa de diálogo, em que cada conta tem **Testar**, **Variação** (uma nova senha de app, nome ou servidores) e **Remover**: a senha de app dela é excluída aqui, e nada muda na caixa de e-mail. Remover a última conta desconecta o E-mail; **Desconectar** remove todas.

### O que os agentes podem fazer com o seu e-mail

Os agentes recebem estas ferramentas sob "email". Cada uma recebe o endereço da conta quando você tem mais de uma; sem ele, usam a primeira.

- **list_folders**, **search_email** (por remetente, destinatário, assunto, palavras, datas, não lidos, com sinalização ou com anexos, os mais recentes primeiro) e **read_email** (quem enviou e para quem, o texto e os nomes e tamanhos dos anexos). Ler não marca um e-mail como lido.
- **save_attachments** salva os anexos de um e-mail na pasta da sessão.
- **mark_email** marca e-mails como lidos ou não lidos, com sinalização ou sem. **move_email** os move para outra pasta, nunca para a lixeira.
- **save_draft** coloca um e-mail na sua pasta de Rascunhos para você mesmo enviar. Nada é enviado.
- **send_email** envia um e-mail na hora, como um novo e-mail ou como resposta na sua conversa, com arquivos da pasta da sessão anexados, e guarda uma cópia em Enviados.
- **delete_email** move e-mails para a lixeira ou os exclui de vez.

Para impedir que os agentes enviem ou excluam, desative **send_email** e **delete_email** em **Ferramentas** (veja [Desativar uma conta ou algumas das ferramentas dela](/guide/connections#turn-an-account-or-some-of-its-tools-off)). O que um e-mail diz chega aos agentes como dados externos, que eles são instruídos a nunca seguir como instruções. Uma tarefa agendada pode começar a cada novo e-mail: veja [Observar uma mudança](/guide/tasks#watch-for-a-change).

## Verificar se uma conta conectada funciona

Na aba **Conectado**, cada conta mostra como está:

- **Em andamento**, quando foi verificada pela última vez, quantas das suas ferramentas estão ativadas (“12 de 14 ferramentas ativadas”) e quantas delas perguntam antes (“3 perguntam antes”).
- **Ainda não testado**.
- **Precisa entrar de novo**: o login terminou e não pôde ser renovado.
- **Não está funcionando**, com o motivo.

**Testar** conecta ao serviço do mesmo modo que os agentes farão e lista as ferramentas dele. Um aviso informa que a conta funciona e quantas ferramentas ela tem, ou o que deu errado: “A chave foi recusada” ou “O login foi recusado: conecte de novo” (a conta passa então a mostrar **Precisa entrar de novo**). As contas são testadas automaticamente logo depois que você as conecta.

## Desativar uma conta ou algumas das suas ferramentas

- **Todas as sessões** (no celular, apenas o interruptor): quando está ativado, o agente de cada sessão recebe a conta, a menos que uma sessão a desative. Quando está desativado, nenhuma sessão a recebe, a menos que essa sessão a ative. Uma conta recém-conectada começa ativada.
- **Ferramentas**: depois que um teste listar as ferramentas de uma conta, este botão as abre, cada uma com o que faz e três opções: **Ativada** (os agentes a usam livremente), **Perguntar antes** (cada chamada espera na sua Caixa de saída até você enviá-la: veja abaixo) e **Desativada** (os agentes não a recebem). As ferramentas que enviam, postam, publicam, respondem, convidam, compartilham, excluem, removem, pagam, transferem ou reembolsam são marcadas como **age fora**. Um agente que tenta usar uma ferramenta que você desativou é informado de que ela está desativada.

## Perguntar antes: chamadas que esperam o seu OK

Uma ferramenta em **Perguntar antes** nunca é chamada de imediato. Quando um agente a chama (Claude Code, Codex, Custom, outro agente, a execução de uma tarefa agendada ou um dos seus apps), o Hydor retém a chamada. O agente é avisado na hora de que a chamada espera o seu OK e segue com o restante do trabalho ou encerra a vez dele dizendo isso: ele não espera e é instruído a não tentar de novo por outro caminho. A chamada espera na **Caixa de saída**, no topo da [Caixa de entrada](/inbox), como um rascunho que você pode alterar antes de **Enviar** ou **Descartar** ([A Caixa de saída](/guide/inbox#the-outbox-calls-held-for-your-ok)).

- As contas que você conectar a partir de agora começam com todas as ferramentas que agem fora em **Perguntar antes** e as demais em **Ativada**. Altere qualquer uma delas em **Ferramentas**.
- As contas que você conectou antes mantêm as ferramentas como estavam, para que tudo o que já as usa continue funcionando. O cartão delas oferece uma linha, como **Perguntar antes para as 3 ferramentas que enviam, postam, excluem ou pagam**: clique nela para definir todas como Perguntar antes de uma vez. Ela aparece enquanto houver essas ferramentas ativadas sem que você tenha escolhido isso.
- Perguntar antes é uma configuração sua para a conta, portanto vale em todas as sessões e em todos os modos de permissão, inclusive **Acesso total**. Os agentes não podem alterá-la sem perguntar a você em um cartão e não podem enviar sozinhos uma chamada retida. Quando um agente também perguntaria antes de usar a ferramenta (o cartão do próprio Claude Code ou do Custom), ele não pergunta: você diz sim uma vez só, na Caixa de saída.
- Se uma ferramenta age fora é avaliado pelo nome dela, pela descrição e pelas dicas que o serviço dá (como “só lê” ou “exclui”). Confira as marcas e defina você mesmo qualquer outra ferramenta como Perguntar antes.

Para experimentar uma tarefa agendada sem que nada saia, use **Testar sem enviar** ([Tarefas agendadas](/guide/tasks#try-a-task-with-a-test-run)).

## Alterar uma conexão ou entrar de novo

- **Variação** (para contas com chave ou configurações) abre a janela de novo com o que você informou. As configurações mantêm seus valores. Os campos de chave e segredo dizem “Salvo: deixe vazio para mantê-lo”: digite um novo para substituí-lo e clique em **Salvar**.
- **Entrar de novo** (para logins pelo navegador) faz o login desde o início. Quando uma conta mostra **Precisa entrar de novo**, os agentes deixam de recebê-la até você fazer isso.

Se o marketplace mudar o endereço de um serviço ou a forma de entrar depois que você o conectou, a conta mostra “O catálogo tem um novo endereço ou login para ele. Ele continua usando o antigo até você conectar de novo.” Sua chave ou seu login nunca vai para um novo endereço até você conectar de novo por conta própria.

## Desconectar uma conta

Clique em **Desconectar** (um ícone de tomada desconectada no celular) e confirme. O login ou a chave da conta é excluído aqui e os agentes deixam de receber as ferramentas dela. No caso de um login pelo navegador, o Hydor também avisa ao serviço que os tokens não são mais necessários, quando o serviço oferece um meio para isso.

## Escolher as contas que uma sessão usa

Toda sessão recebe as contas conectadas cujo interruptor **Todas as sessões** está ativado. Para mudar isso em uma sessão:

1. Abra o menu da sessão (⋯) → **Configurações da sessão** → **Contas conectadas**.
2. Ative ou desative contas para esta sessão. Cada uma diz em que situação está: “Ativada, como em todas as sessões”, “Desativada, como em todas as sessões”, “Ativada só aqui” ou “Desativada só aqui”.
3. Clique em **Concluído**.

Os serviços na internet seguem a mudança na hora. Os que rodam neste computador a seguem quando o agente iniciar de novo. Se ainda não houver nada conectado, a janela oferece **Abrir Apps conectados**.

Um agente também pode ativar contas para as sessões que começam como ele: veja [Agentes](/guide/agents).

## Como os agentes usam as contas conectadas

- Todo tipo de agente recebe uma conta conectada do mesmo jeito: Claude Code, Codex, Custom e os agentes ACP recebem as ferramentas dela com o nome curto do serviço.
- No início de uma sessão, o agente é informado de quais das suas contas estão conectadas e de que deve usá-las quando uma tarefa as envolver. Ele também pode listar o que está conectado e quais chaves estão salvas, apenas pelo nome.
- Um agente só recebe as contas que estão ativadas para a sessão dele e com login ativo. Os logins se renovam em segundo plano, mesmo para contas que nenhuma sessão está usando, de modo que sessões longas continuam funcionando.
- Chaves e tokens nunca vão para as configurações nem para a linha de comando de um agente. Os valores de chaves conhecidos são mascarados em tudo o que as ferramentas do serviço devolvem.
- Uma ferramenta em Perguntar antes diz isso na descrição, e o agente é avisado de que uma chamada a ela espera o seu OK. Depois que você enviar ou descartar a chamada, a sessão mostra o que aconteceu, e o agente fica sabendo com a sua próxima mensagem.
- Uma tarefa agendada pode começar quando algo novo aparece em uma conta (um novo negócio, arquivo, chamado ou pagamento), ou um tempo definido antes de cada evento em um calendário conectado. A cada verificação, o Hydor chama, ele mesmo e sem um modelo, uma das ferramentas da conta que apenas consulta, e nunca uma que envia, altera, exclui ou paga (veja [Acompanhar uma mudança](/guide/tasks#watch-for-a-change)).
- A caixa de busca (Ctrl+K, ⌘K no Mac) também encontra as suas contas conectadas.

## Adicionar um serviço ao marketplace

Qualquer pessoa pode adicionar um serviço ao marketplace, ou corrigir um, com um pull request no repositório do Hydor no GitHub. **Como adicionar um**, na parte de baixo da aba Marketplace, abre o guia para isso.

1. Escreva um pequeno arquivo JSON para o serviço na pasta `catalog/` do repositório, como o guia de lá descreve. Ele traz o nome do serviço, uma frase simples sobre o que um agente pode fazer com ele, a categoria, o ícone e a cor, o site e a documentação, o servidor (um endereço ou um comando que roda aqui) e como ele faz login (nada, um login pelo navegador ou uma chave), além dos campos que as pessoas preenchem, se houver.
2. Use o servidor MCP do próprio serviço no endereço documentado quando houver um. Um programa que roda aqui é bem-vindo quando não existe esse servidor, ou para coisas que só um servidor local consegue fazer, como arquivos neste computador.
3. Não coloque chaves nem tokens no arquivo. As pessoas informam as próprias, no cofre.
4. Execute a verificação que o guia descreve. Ela testa o arquivo contra as regras e pode perguntar ao servidor como ele responde.
5. Envie o pull request. Depois que ele for incorporado, o serviço chega ao marketplace de todos com a próxima atualização.

## Guardar chaves no Cofre

Abra [a aba Chaves](/apps/connected?tab=keys). O Cofre guarda chaves de API, tokens e as senhas de logins, que os agentes usam sem vê-las. Elas são criptografadas neste computador e nunca mais são mostradas, nem aqui nem a um agente: apenas os últimos caracteres.

Os agentes as usam por meio das ferramentas do próprio Hydor: a ferramenta de requisições web, o navegador e os comandos neste computador, onde você permitir. O app coloca a chave por conta própria, e só onde você permitir.

Cada chave da lista mostra:

- o nome e uma dica mascarada do valor (como “…f3a9”);
- a nota dela;
- os hosts para os quais ela pode ser enviada e **em comandos** quando comandos neste computador podem usá-la (**Nenhum host permitido ainda** quando não há nenhum dos dois);
- quando foi usada pela última vez (“ainda não usada” até então) e quando foi adicionada ou teve o valor alterado pela última vez.

Sem nenhuma chave ainda, a aba diz que você pode adicionar uma aqui ou deixar que um agente peça uma.

Os apps também podem precisar de chaves (a de um serviço de previsão do tempo, a de um provedor de mapas): um app indica as chaves de que precisa, e você informa cada uma na página dele, no cartão que o instala ou no cartão dele em uma sessão ([Dê a ele as chaves de que precisa](/guide/apps#give-it-the-keys-it-needs)). Elas ficam guardadas aqui, com os nomes que o app lhes dá, com os hosts que ele indica, e a nota traz o nome do app.

### Adicionar uma chave

1. Clique em **Adicionar uma chave**.
2. **Nome**: como os agentes a chamam, como WEATHER_API_KEY: letras maiúsculas, dígitos e sublinhados, de 2 a 64 caracteres, começando com uma letra. O que você digita é transformado em um nome assim (“github token” vira GITHUB_TOKEN), e o campo avisa isso.
3. **Valor**: cole a chave. Ela precisa ter uma só linha, a não ser que seja um bloco que começa com -----BEGIN (um certificado ou uma chave privada).
4. **Hosts para os quais ela pode ser enviada**: os endereços do serviço, separados por vírgulas, como api.example.com (até 20). A chave vai apenas para esses hosts e seus subdomínios, por https. Enquanto você não adicionar nenhum, os agentes não podem usar a chave.
5. **Comandos neste computador podem usá-la** (desativado no início): ative para uma chave de que um programa daqui precisa, como a senha de um banco de dados ou um token para o git. Veja [Comandos que usam uma chave](/guide/connections#commands-that-use-a-key).
6. **Nota**: para que serve a chave. Os agentes veem essa nota.
7. **Como é enviada** (opcional): por padrão, a chave vai no cabeçalho Authorization, depois de “Bearer ”. Você pode mudar o **Cabeçalho** (como X-Api-Key) e o que vai **Antes da chave** (nada, para outros cabeçalhos), ou enviá-la **Ou como parâmetro de consulta** (como api_key).
8. Clique em **Salvar**.

Um nome que já está no cofre é recusado: dê a essa chave um novo valor.

### Dar um novo valor a uma chave

Clique na seta circular (**Novo valor**) ao lado da chave, cole o novo valor em **Novo valor** e clique em **Substituir**. Os hosts, a nota e como ela é enviada continuam como estavam.

### Alterar para onde uma chave pode ir

Clique no lápis (**Hosts, nota e como é enviada**), altere os hosts, se comandos podem usá-la, a nota ou como ela é enviada, e clique em **Salvar**. O valor permanece.

### Excluir uma chave

Clique na lixeira (**Excluir**) e confirme. Os agentes não podem mais usar a chave, e o valor dela é apagado de vez.

### O que os agentes podem e não podem fazer com uma chave

- Chamar um serviço com ela pelo nome. O app coloca a chave na requisição: onde ela foi configurada para ir, ou onde o agente escreve o nome dela entre chaves duplas (como {{GITHUB_TOKEN}}) no endereço, em um cabeçalho ou no corpo, ou como nome de usuário e senha de um login básico.
- Digitá-la na página de login de um site, no navegador dele, pelo nome: apenas em um campo de uma linha, em uma página de um dos hosts da chave, por https (ou neste computador). O campo então mostra pontos, e o agente só vê que ele foi preenchido a partir do cofre.
- Entregá-la a um comando neste computador, quando você ativou **Comandos neste computador podem usá-la**, e só depois que você permitir o comando (veja [Comandos que usam uma chave](/guide/connections#commands-that-use-a-key)).
- Na web, apenas para os hosts que você permitiu e seus subdomínios, apenas por https, e nunca para este computador nem para a rede local dele. Um redirecionamento para um host para o qual a chave não pode ir não é seguido.
- Mudar, em uma chamada, em qual cabeçalho ou parâmetro de consulta a chave vai.
- Ver os nomes, os hosts e as notas das chaves. Nunca os valores: respostas, páginas e o que os comandos imprimem voltam com a chave mascarada.

## Quando um agente pede uma chave

Os agentes são instruídos a nunca pedir que você digite uma senha, um token ou uma chave no chat. Quando uma tarefa precisa de uma chave que não está salva, o agente mostra um cartão na conversa: **O agente pede uma chave**, com o nome da chave e o motivo de precisar dela (muitas vezes, onde obtê-la).

1. Cole a chave no campo.
2. Confira **Enviada apenas para**: os hosts que o agente sugeriu. Altere-os se precisar. Sem um host, os agentes não podem usar a chave.
3. Clique em **Salvar no cofre**.

A chave vai direto para o cofre criptografado, nunca para a conversa. O cartão se transforma em uma nota informando que a chave foi salva, e o agente recebe uma mensagem de que ela está lá (nunca qual é o valor), para poder continuar.

- **Agora não** recusa. O agente é informado de que você prefere não fornecê-la agora, e deve continuar sem ela ou dizer o que mais funcionaria. O cartão então diz que você não a forneceu, com **Digitar mesmo assim** caso você mude de ideia.
- Enquanto um cartão espera, ele também aparece na [Caixa de entrada](/guide/inbox) como "Pede uma chave" com o nome da chave. **Abrir** leva você à sessão.
- Se já houver no cofre uma chave com esse nome, o agente é instruído a usá-la, e o cartão apenas diz que ela está no cofre. Quando uma chave salva deixou de funcionar, o agente pode pedir de novo: o campo então avisa que ela substitui a chave salva.
- Quando o agente precisa da chave em comandos neste computador, o cartão também mostra **Comandos neste computador podem usá-la**, ativado de início. Desative se preferir; o agente ainda pode usar a chave nos hosts dela. Para uma chave que já está salva, o cartão mostra **O agente pede para usar uma chave em comandos**: deixe o campo vazio para manter o valor e clique em **Salvar no cofre**.

### Um login em vários campos

Para entrar em um site ou serviço, o agente pede tudo de uma vez: **O agente pede um login**, com um campo para cada parte, como um e-mail e uma senha, ou o endereço, o usuário e a senha de um banco de dados. Senhas e outros segredos ficam ocultos enquanto você digita; o olho os mostra.

1. Preencha os campos. Um marcado como **opcional** pode ficar vazio.
2. Confira **Enviada apenas para**: os hosts para os quais o login vale.
3. Clique em **Salvar no cofre**.

Cada segredo vai para o cofre como uma chave própria, com o nome baseado no login (uma senha do Voltaro vira VOLTARO_PASSWORD). Um campo marcado como **O agente vê esta** é um detalhe que não é secreto, como o endereço de um servidor: o agente recebe o que você digita ali, e isso não fica guardado no cofre. Um campo que o cofre já tem avisa isso: deixe-o vazio para manter o que está salvo. Depois de salvo, o cartão lista as chaves, e o agente pode entrar com elas no navegador dele, apenas nesses hosts, sem vê-las.

## Comandos que usam uma chave

Alguns trabalhos precisam de uma senha ou de um token em um programa neste computador: enviar para o GitHub com um token, ler um banco de dados com a senha dele, um script que chama um serviço. Para isso, os agentes têm uma ferramenta que executa um comando com chaves do cofre no ambiente, cada uma sob o próprio nome. O que o comando imprime volta para o agente com as chaves mascaradas.

- Somente chaves com **Comandos neste computador podem usá-la** ativado podem ir para um comando. Ative no diálogo do lápis da chave, ou no cartão quando um agente pedir.
- Antes de um comando assim ser executado, um cartão o mostra: **Executar um comando com** os nomes das chaves, depois o comando, com a finalidade dele. **Permitir** executa uma vez. **Permitir nesta sessão** também deixa os comandos seguintes desta sessão com as mesmas chaves serem executados sem perguntar, até o app reiniciar. **Não** o impede, e você pode dizer ao agente o que fazer em vez disso.
- Uma sessão com acesso total executa esses comandos sem perguntar, como faz com os outros comandos. No modo Planejar, nenhum é executado.
- Um comando pode fazer tudo o que um programa pode, inclusive enviar a chave para outro lugar: permita apenas comandos que você entende e ative isso somente para chaves de que um programa daqui precise.
- Um comando para após dois minutos, a menos que o agente dê mais tempo (até dez).

## Preencher um formulário que um serviço pede

Alguns serviços precisam de algo de você no meio de uma tarefa: uma data, uma escolha, um sim ou não, ou uma página para abrir. Seja qual for o agente que está trabalhando, o pedido aparece como um cartão na sessão, ao lado das aprovações do próprio agente, e na [Caixa de entrada](/guide/inbox). O título do cartão diz o que o serviço quer:

- **…pede que você preencha um formulário**: a mensagem do serviço, depois os campos dele, como um formulário. Há caixas de texto, textos mais longos, números, datas, um interruptor para sim ou não, e chips ou uma lista para escolher (chips em que você pode escolher vários, quando o serviço permite mais de um). Clique em **Enviar**. Campos vazios que ele exige ("Obrigatório") e números que não são números são marcados antes de qualquer envio. Uma resposta que o serviço não aceita (longa demais, não é um endereço de e-mail, poucas escolhas) é recusada com o que corrigir, e o cartão permanece.
- **…pede que você abra uma página**: um link. **Abrir** abre a página em uma nova aba (para aprovar algo ou entrar lá) e avisa o serviço de que você abriu.
- **…pede para prosseguir**: um simples sim ou não. **Permitir** diz sim.

**Recusar** diz não. **Agora não** cancela desta vez. O cartão de um serviço espera até uma hora; se o turno do agente terminar antes, o pedido é cancelado. Servidores MCP que você configura para o Codex pedem no mesmo tipo de cartão.

## Configurar servidores MCP para o Claude Code e o Codex

Abra [Configurações → Agentes → Servidores MCP](/settings?s=mcp). São servidores de ferramentas nas configurações próprias do Claude Code e do Codex, para ferramentas que o marketplace não tem ou servidores que você mesmo executa. Novas sessões os carregam; sessões já em execução pegam as alterações quando reiniciam. O Custom, o agente próprio do app, também os usa, exceto os SSE (veja [Custom](/guide/custom)).

A página lista os servidores do Claude Code e os do Codex em dois grupos, e **Adicionar servidor** fica ao lado do título da página. O chip **Pasta** no alto escolhe a pasta cujos servidores você vê, já que o Claude Code pode manter servidores para uma pasta, além de para todas. O (i) ao lado do nome de cada grupo diz que novas sessões carregam os servidores, e as já em execução pegam as alterações quando reiniciam.

Cada servidor mostra:

- seu nome e seu tipo: **Command** (um programa que esta máquina executa), ou **HTTP** ou **SSE** (um servidor em um endereço; SSE é o tipo mais antigo);
- para o Claude Code, onde ele se aplica: **Todas as pastas**, **Esta pasta, só você** ou **Esta pasta, compartilhada**;
- **Desativada**, para um servidor do Codex desativado nas configurações próprias do Codex;
- seu comando ou endereço, e os nomes de suas variáveis de ambiente, cabeçalhos ou variável do token Bearer. Os valores ficam no servidor e nunca são exibidos;
- após uma verificação, como o servidor está (um selo no fim da linha dele).

### Adicionar um servidor

Clique em [Adicionar servidor](/settings?s=mcp&find=Add%20server). O diálogo **Adicionar um servidor MCP** pergunta:

- **Adicionar a**: Claude Code, Codex, ou ambos (ambos no início).
- **Nome**: letras, dígitos, pontos, hifens ou sublinhados, até 64, começando com uma letra ou um dígito. Os agentes mostram as ferramentas dele como o nome, uma barra e a ferramenta.
- **Digitar**: **Command**, **HTTP** ou **SSE**. O Codex não aceita SSE, então escolher SSE deixa o Codex de fora.
- Para um comando:
  - **Command**: a linha de comando inteira, como `npx -y @modelcontextprotocol/server-github`. Ela é executada nesta máquina quando uma sessão começa. Coloque entre aspas os argumentos que contêm espaços. Um ~ no início de um argumento significa sua pasta pessoal.
  - **Ambiente**: um CHAVE=valor por linha (linhas que começam com # são ignoradas). Os valores vão para os arquivos de configuração dos agentes e nunca são exibidos aqui de novo.
- Para HTTP ou SSE:
  - **URL**: o endereço do servidor, começando com http:// ou https://.
  - **Cabeçalhos** (para o Claude Code): um "Nome: valor" por linha, para servidores que aceitam uma chave de API. Servidores que usam um login no navegador (OAuth) não precisam de nenhum: entre pela lista depois de adicionar.
  - **Variável do token Bearer** (para o Codex, opcional): o nome de uma variável de ambiente cujo valor o Codex envia como o token Bearer.
- **Onde o Claude Code o usa** (**Onde é usado** quando só o Claude Code está escolhido):
  - **Todas as pastas**: toda sessão do Claude Code nesta máquina. Este é o padrão.
  - **Esta pasta**: apenas sessões na pasta escolhida no alto, mantido nas suas próprias configurações do Claude Code.
  - **.mcp.json compartilhado**: salvo em um arquivo .mcp.json nessa pasta, para que todos que trabalham no repositório o recebam.

  Os servidores do Codex sempre valem para todas as pastas.

Clique em **Adicionar servidor** no diálogo. O Hydor o adiciona pelo comando próprio de cada agente, para que as configurações deles fiquem como esperam. Se um agente recusar, o diálogo mostra que ele não adicionou o servidor, com o que o agente disse. Corrija o que estiver errado e clique em **Adicionar servidor** de novo: só os agentes que falharam são tentados.

### Verificar quais servidores se conectam

[Verificar conexões](/settings?s=mcp&find=Check%20connections), no fim do título do grupo do Claude Code ou do Codex, inicia cada servidor como uma nova sessão faria e mostra como cada um se saiu:

- **Conectado**, com o número de ferramentas;
- **Precisa de login**;
- **Ainda conectando**;
- **Falhou**, com o motivo ("O servidor não iniciou ou não respondeu." quando não há nenhum);
- **Desativada**.

Nenhum modelo é usado. Pode levar até um ou dois minutos. Para o Claude Code, ele é executado na pasta escolhida no alto, então os servidores dessa pasta contam.

### Entrar em um servidor

Um servidor em um endereço que usa OAuth para entrar precisa de um login uma vez. Clique em **Entrar** (exibido quando uma verificação diz que ele precisa de login), ou abra o menu **⋯** do servidor e escolha **Entrar (OAuth) em um terminal**. Um terminal abre no app, executando o login próprio do agente para esse servidor: siga os passos de lá.

### Remover um servidor

Abra o menu **⋯** do servidor, escolha **Remover** e confirme com **Remover**. O agente deixa de carregá-lo. Sessões já em execução o mantêm até reiniciarem.

## Adicionar plugins ao Claude Code

O Claude Code tem plugins próprios: complementos que reúnem habilidades, comandos, agentes, hooks e servidores MCP, vindos de marketplaces (catálogos de plugins, mantidos em um repositório do GitHub, em outro repositório git ou em uma pasta). Eles funcionam só para o Claude Code. Ficam na aba **Claude Code** de [Configurações → Agentes → Plugins](/settings?s=plugins&find=Claude%20Code); os plugins próprios do Codex ficam na aba **Codex**. Os plugins para todos os agentes ficam na aba **Todos os agentes**: veja [Plugins](/guide/plugins).

### Plugins instalados

**Instalado** lista os plugins do Claude Code nesta máquina. Novas sessões do Claude Code os carregam. Cada um mostra seu nome, seu marketplace, sua versão e o que faz.

- O interruptor desativa ou ativa um plugin sem removê-lo.
- O menu **⋯** dele tem **Desinstalar**, depois que você confirma. Novas sessões do Claude Code deixam de carregar suas habilidades, comandos e servidores.

### Encontrar e instalar um plugin

**Procurar** lista todos os plugins que você pode instalar a partir dos seus marketplaces, os mais instalados primeiro, com o número de instalações de cada um. **Buscar plugins** restringe a lista. Ela mostra 40 por vez: **Mostrar mais** adiciona mais 40.

Clique em **Instalar** e confirme. O plugin é instalado para toda sessão do Claude Code. Plugins podem adicionar hooks e servidores que executam comandos nesta máquina, então instale apenas plugins em que você confia.

O Hydor pede ao Claude Code a lista de plugins no máximo a cada 10 minutos, e de novo após cada alteração. A primeira vez pode demorar.

### Marketplaces de plugins

**Marketplaces** lista os catálogos de onde o Claude Code instala plugins.

- Para adicionar um, clique em **Adicionar** no título do grupo, digite um owner/repo do GitHub, uma URL git ou uma pasta no diálogo e clique em **Adicionar**.
- Para remover um, clique na lixeira na linha dele e confirme. Os plugins instalados a partir dele também são desinstalados.

## Pedir a um agente

Os agentes podem fazer isto por você, com o seu OK em um cartão. Eles nunca digitam o valor de uma chave no app: para uma chave ou um login, mostram o cartão onde você a digita.

- "Quais contas estão conectadas? Teste o Notion e me diga se funciona."
- "Encontre os e-mails não lidos desta semana do meu locador e faça um resumo."
- "Escreva um rascunho de resposta ao último e-mail da Anna dizendo que posso me encontrar na quinta e salve nos meus Rascunhos."
- "Salve nesta pasta os anexos das faturas que recebi este mês."
- "Conecte o Context7 para que os agentes consultem a documentação de bibliotecas."
- "Desative o Gmail para todas as sessões, mas mantenha ativado nesta."
- "Mostre as ferramentas do Notion e desative as que excluem páginas."
- "Defina as ferramentas do Gmail que enviam ou excluem como Perguntar antes, e deixe as demais ativadas."
- "Adicione um servidor MCP para o Claude Code e o Codex que execute npx -y @modelcontextprotocol/server-memory e depois verifique se ele conecta."
- "Mostre os plugins do Claude Code mais instalados e depois instale o que eu escolher."
- "Entre na minha conta do Voltaro e baixe as faturas deste ano para esta pasta." (Na primeira vez, ele pede o login em um cartão.)
- "Envie este branch para o GitHub com o token do cofre."
