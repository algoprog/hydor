# Celulares, outras máquinas e compartilhamento

O Hydor funciona em qualquer navegador: no seu celular, em outro computador e em várias máquinas que rodam o Hydor cada uma. Este tópico explica como usá-lo no celular (acessado de forma privada pelo Tailscale, configurado em poucos cliques), como acessá-lo com segurança de fora, como trabalhar com outras máquinas em um só app, como compartilhar uma sessão com um link somente leitura, como deixar agentes de outros lugares começarem e conduzirem sessões aqui e como adicionar as contas do GitHub ou do Gitea com as quais os pull requests são abertos.

![O app em um celular: uma sessão que precisa de você](images/devices.webp)

## Usar o app no celular

O app no celular é o mesmo app do computador, com o layout ajustado para uma tela pequena (uma janela estreita no computador também recebe esse layout). O que muda:

- **A barra lateral vira uma gaveta.** Toque em **Menu** (≡) no canto superior esquerdo de uma página ou sessão para abri-la. Ela ocupa a tela toda, com suas sessões, a Caixa de entrada e as ferramentas; toque em uma sessão ou ferramenta para ir até ela, ou em **Fechar menu** (✕) para voltar.
- **Seletores abrem como painéis.** Na página inicial, os menus do programa, do modelo, da pasta, do agente e de **Opções** sobem da parte de baixo da tela, longe do teclado, com a página escurecida ao fundo; uma configuração em **Opções** abre sobre o seu painel. Em uma sessão, o chip da caixa de mensagem para o modelo (e seu esforço e permissões) abre um painel do mesmo jeito. Os diálogos também sobem de baixo.
- **Uma coisa de cada vez.** Configurações é uma lista, com cada seção em uma página própria. Arquivos mostra uma pasta, com o nome no topo (toque no nome para ver os locais, em **‹** para a pasta acima), e depois um arquivo em uma página própria com **Voltar**. A página do Git lista seus repositórios e depois abre um com uma seta de voltar.
- **Toque em vez de mouse.** Em Arquivos, o ⋯ de uma linha abre o menu dela, e manter uma linha pressionada a seleciona, para agir em vários de uma vez. O editor quebra linhas longas. A página do Terminal acrescenta uma fileira de teclas que os celulares não têm (Ctrl, Alt, Esc, Tab, as setas e mais).

Para acessar o app no celular, ele precisa estar acessível de fora deste computador. [Configurações → App → Usar no celular](/settings?s=phone) faz isso em poucos cliques, de forma privada, com o Tailscale: veja [Use no celular com o Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale).

### Adicionar à tela de início

Instalado na tela de início, o app abre em tela cheia com seu próprio ícone, como qualquer outro app. Isso exige que o app seja servido por HTTPS, como faz o Usar no celular. Aberto no celular, [Usar no celular](/settings?s=phone&find=Add%20to%20Home%20Screen) mostra os passos para o celular que você está segurando em **Neste celular → Adicionar à Tela de Início**, com um botão **Instalar** onde o navegador oferece um.

- **iPhone ou iPad**: abra o app no navegador, toque em **Participação** e depois em **Adicionar à Tela de Início**. A partir daí, abra o Hydor pelo novo ícone.
- **Android**: abra o app no navegador e use a opção do menu para instalar o app ou adicioná-lo à tela de início.

### Compartilhar com o Hydor a partir de outros apps

Depois de instalado, o Hydor aparece na folha de compartilhamento do celular ou do computador como um app de mensagens. Compartilhe uma foto, um PDF, uma página da web ou algumas linhas de texto de qualquer outro app, escolha **Hydor**, e a página inicial abre com o que você compartilhou já na caixa de mensagem: as palavras e o link como texto, os arquivos como anexos. Acrescente uma palavra sobre o que fazer com isso, escolha o agente se quiser e envie.

- **Android**: funciona no Chrome, no Edge e em outros navegadores baseados em Chromium, depois que o app é instalado pelo menu do navegador (**Instalar app** ou **Adicionar à tela inicial**).
- **Um computador**: funciona no Chrome e no Edge depois que o app é instalado (o botão de instalar na barra de endereço, ou o menu do navegador → **Instalar Hydor**), a partir de apps que compartilham pela folha de compartilhamento do sistema.
- **iPhone e iPad**: o Safari não deixa apps da web receberem compartilhamentos. Envie uma foto ou um arquivo para seus agentes por um app de conversa (veja [O que uma conversa pode fazer](/guide/devices#what-a-chat-can-do)). Para texto e links, um atalho resolve: no app Atalhos, crie um que apareça na folha de compartilhamento e receba texto e URLs, adicione **Codificar URL** para a entrada dele e depois **Abrir URLs** com o endereço do seu app seguido de `/?prompt=` e o texto codificado (como `https://hydor.example.com/?prompt=` e o resultado). Ele abre a página inicial no Safari com o texto na caixa.

Um compartilhamento exige que você esteja conectado naquele dispositivo: um feito sem entrar na conta não chega ao Hydor, e a página inicial avisa isso. Até 25 MB de arquivos vão junto com um compartilhamento, como na caixa de mensagem, salvos onde a caixa de mensagem guarda seus anexos.

### Receber notificações no celular

Uma notificação pode chegar ao seu celular quando uma sessão termina, falha ou precisa da sua resposta, mesmo com o app fechado.

1. No celular, abra [Configurações → App → Notificações](/settings?s=notifications&find=Notify%20this%20device).
2. Ative **Notificar este dispositivo** e permita notificações quando o navegador perguntar. Cada dispositivo ativa isso por si.
3. **Enviar um teste** verifica se funciona (ele aparece quando o app não está à vista).

Aberto no celular, [Usar no celular](/settings?s=phone) tem o mesmo botão **Notificar este dispositivo** em **Neste celular**, depois de **Adicionar à Tela de Início**, e o seu **Enviar um teste** vai só para aquele celular.

Em um iPhone ou iPad, adicione primeiro o app à tela de início e abra-o de lá: caso contrário, o navegador não consegue receber notificações. Se as notificações estiverem bloqueadas para o site, permita-as antes nas configurações do navegador. Uma aprovação simples de sim ou não vem com **Aprovar** e **Recusar** na própria notificação, onde o celular mostra botões. Mais em [Caixa de entrada e notificações](/guide/inbox).

## Falar com seus agentes pelo Telegram, Discord e Slack

Em uma conversa no Telegram, no Discord ou no Slack, em qualquer celular ou computador, você pode começar sessões (inclusive como um dos seus próprios agentes), enviar fotos, arquivos e mensagens de voz, ler as respostas e responder ao que os agentes perguntam. Cada um funciona por um bot ou app seu, configurado em [Configurações → App → Apps de chat](/settings?s=chat). O Hydor se conecta a eles por conta própria (pede ao Telegram as novas mensagens e abre um WebSocket com o Gateway do Discord e com o Socket Mode do Slack), então nenhum deles exige que o app tenha um endereço na internet.

### Conectar um bot ou app

Abra [Apps de chat](/settings?s=chat) e pressione a linha do que você quer no grupo **Bots** (ela diz **Configurar** até estar conectado): os passos abrem logo abaixo. O que você cola fica guardado no Cofre, criptografado, e nunca mais aparece no app.

- **Telegram**: no Telegram, abra @BotFather, envie `/newbot` e dê um nome e um nome de usuário ao bot. Cole o token que ele responder, como `123456789:AA…`, na caixa da linha do [Telegram](/settings?s=chat&find=Telegram) e pressione **Conectar**.
- **Discord**: no Developer Portal (discord.com/developers/applications), crie uma **New Application**. Em **Bot**, pressione **Reset Token** e copie-o, e ative **Message Content Intent** para que o bot possa ler o que você escreve. Cole o token na linha do [Discord](/settings?s=chat&find=Discord) e pressione **Conectar**. Depois adicione o bot a um servidor seu pela linha **Adicionar o bot a um servidor** (o Discord só deixa você enviar mensagem a um bot com quem compartilha um servidor, então um pequeno servidor seu serve). O convite pede View Channels, Send Messages e Read Message History, e o Hydor divulga seus comandos de barra.
- **Slack**: em api.slack.com/apps, escolha **Create New App → From a manifest**, selecione seu workspace e cole o manifesto que **Copiar manifesto** (nos passos da linha do [Slack](/settings?s=chat&find=Slack), e em uma linha própria depois de conectado) copia: ele ativa o Socket Mode, assina as mensagens diretas e as menções, adiciona o comando `/hydor` e pede os escopos de bot `app_mentions:read`, `chat:write`, `commands`, `files:read` (para os arquivos que você envia), `im:history`, `reactions:write` e `users:read`. Em **Basic Information → App-Level Tokens**, gere um token com o escopo `connections:write` (ele começa com `xapp-`); em **Install App**, instale o app no seu workspace e copie o Bot User OAuth Token (ele começa com `xoxb-`). Cole os dois e pressione **Conectar**.

Depois de conectado, a primeira linha abaixo mostra o nome do bot e o que ele está fazendo (“Listening for messages” ou o que está errado: o Message Content Intent do Discord desativado, um escopo que falta ao app do Slack). **Conectar** recusa um token apenas quando o próprio serviço diz não a ele: quando o Telegram, o Discord ou o Slack demora a responder ou não pode ser alcançado naquele momento (como pode acontecer nos primeiros minutos de um bot novo), o Hydor mantém o token, a linha diz **Conectando…** e o motivo, e o bot se conecta sozinho assim que o serviço responde. Um bot do Telegram recebe suas mensagens em um só lugar, então, quando outra cópia do Hydor ou outro programa usa o mesmo bot, a linha avisa. O menu **⋯** da linha tem **Alterar token** (**Alterar tokens** no Slack), que coloca outros (as conversas de outro bot se vinculam de novo), e **Desconectar**, que o tira do Hydor, e o bot ou app continua sendo seu.

### Vincular uma conversa

Só as conversas que você vincula podem usar o bot: qualquer outra pessoa que o encontrar é avisada de que ele é de alguém.

1. Abra a linha e pressione a linha [Vincular uma conversa](/settings?s=chat&find=Link%20a%20chat). Ela mostra um código que funciona uma vez, por dez minutos.
2. No Telegram, pressione **Abrir no Telegram** e depois **Início** na conversa que abrir, ou envie o código ao bot. No Discord e no Slack, envie o código ao bot ou app em uma mensagem direta, ou mencione-o com o código em um canal. A conversa aparece na linha com seu nome.

Um canal se vincula à pessoa que enviou o código: só ela é ouvida ali, e só quando menciona o bot. O botão de lixeira (**Desvincular**) ao lado de uma conversa tira dela o uso dos seus agentes.

### O que uma conversa pode fazer

- **Enviar o que você quer que seja feito**: vai para a sessão em que a conversa está, ou começa uma nova, em uma pasta de tarefa própria como faz a página inicial, com o agente definido na linha **Novas sessões usam** (**Claude Code** ou **Codex**), como o agente seu na linha **Novas sessões como**, se você escolheu um. O que você envia enquanto o agente trabalha espera na fila da sessão.
- **Fotos, arquivos e mensagens de voz**: envie como enviaria a uma pessoa, com uma legenda se quiser: a legenda vai junto, e vários enviados de uma vez (um álbum) chegam juntos. Cada um é salvo na pasta da sessão para onde vai, com o próprio nome (fotos e mensagens de voz recebem o nome de quando chegaram, como `photo-2026-11-15-0930.jpg`), e chega ao agente como os anexos da caixa de mensagem: imagens para ver, outros arquivos para abrir. Uma mensagem de voz chega ao agente como palavras quando o [Reconhecimento de voz no servidor](/settings?s=voice&find=Speech%20recognition%20on%20the%20server) está ativado em Configurações → Recursos → Voz, e a gravação continua na pasta; sem ele, a gravação vai como arquivo de som, e a conversa diz como ativá-lo. O Telegram deixa os bots baixarem arquivos de até 20 MB, e o Hydor aceita arquivos de até 25 MB do Discord e do Slack: a conversa avisa quando um é grande demais. O que os arquivos contêm, e mensagens encaminhadas de outra pessoa, chegam ao agente marcados como dados externos, para trabalhar com eles, nunca como instruções. No Slack, os arquivos exigem o escopo `files:read`: um app criado a partir de um manifesto mais antigo precisa tê-lo adicionado em **OAuth & Permissions** e depois ser instalado de novo (a conversa avisa quando um arquivo não consegue chegar).
- **Seus próprios agentes**: `/as` e o nome de um agente começa uma nova sessão como um dos seus [agentes](/agents), como `/as Contador adicione isto a outubro` com a foto de um recibo. `/as` e o nome sozinhos fazem a próxima nova sessão da conversa começar como ele, e `/agents` (ou `/as` sozinho) os lista com um botão cada, os seus primeiro. Um agente que mantém uma conversa própria leva a conversa para essa conversa. O Discord completa o nome do agente conforme você digita `/as`; no Slack, escreva `/hydor as Contador …`. A linha [Novas sessões como](/settings?s=chat&find=New%20sessions%20as) faz toda nova sessão daquele app de chat começar como um dos seus agentes.
- **A resposta** volta quando o turno do agente termina, formatada para o app (a formatação do Telegram; o Markdown do Discord, em mensagens de 2.000 caracteres; o mrkdwn do Slack em blocos), em até dez mensagens quando é longa (o resto fica na sessão). O Telegram e o Discord mostram “digitando…” enquanto ele trabalha; o Slack coloca uma ampulheta na sua mensagem. **Abrir no Hydor** abre a sessão no app, quando o app tem um endereço na internet ou é servido na sua tailnet (veja [Use no celular com o Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale)).
- **O que um agente pergunta**: uma pergunta simples de sim ou não vem com botões que a respondem; qualquer coisa mais (um formulário, um plano) vem com um link para responder no app.
- **Comandos**: `/new` começa uma nova sessão (`/new` e o que ela deve fazer a começa na hora), `/as` e `/agents` começam uma como um dos seus agentes (acima), `/sessions` lista as mais recentes para continuar uma, `/stop` para o agente, `/status` diz em qual sessão a conversa está e o que ela está fazendo, e `/help` os lista. O Telegram os mostra em seu menu de comandos, e o Discord como comandos de barra; no Slack eles vêm depois de `/hydor` (`/hydor new`, e `/hydor` com outras palavras é uma mensagem para a sessão); no Discord e no Slack, `!new`, `!as`, `!status` e os demais também funcionam digitados como mensagem.
- **Avisos**: com a linha **Avisos de todas as sessões** ativada, como vem por padrão, toda sessão que termina, falha ou precisa de você avisa nas suas conversas, e não só as que uma conversa começou.

Figurinhas, enquetes e localizações não chegam aos agentes: a conversa pede palavras, fotos, arquivos ou mensagens de voz no lugar.

## Acessar o app de outro dispositivo

Por padrão, o app responde apenas no computador em que ele está rodando (porta 8790 de `127.0.0.1`). Qualquer pessoa que consiga alcançá-lo e saiba a senha pode executar qualquer comando como o seu usuário nesse computador, então trate o acesso a ele como o acesso por SSH ao computador. Para usá-lo no celular ou em outro computador, coloque HTTPS na frente dele em vez de abrir a porta para a rede. O jeito mais simples já vem integrado: [Usar no celular com o Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale), logo abaixo. O HTTPS também é o que os celulares exigem para instalar o app e receber notificações push.

### Usar no celular com o Tailscale

O Tailscale é um app gratuito que liga os seus próprios dispositivos em uma rede privada só sua, chamada de tailnet. Em [Configurações → App → Usar no celular](/settings?s=phone), o Hydor é publicado nela, em um endereço como `https://laptop.tail1234.ts.net`. Somente celulares e computadores conectados à sua conta do Tailscale podem abrir esse endereço, nunca a internet pública, e o app ainda pede a senha dele. O Hydor nunca ativa o Tailscale Funnel, que tornaria o app público.

1. Instale o Tailscale neste computador e entre na sua conta ([tailscale.com/download](https://tailscale.com/download)). A linha **Tailscale neste computador** da seção avisa quando tudo está pronto ("Signed in. This computer is laptop on you@example.com."). Até lá, ela diz o que está faltando (não instalado, não está rodando, sem conta conectada, desativado) com **Baixar o Tailscale** ou a única coisa a fazer, e **Verificar de novo**.
2. Pressione [**Servir nos meus dispositivos**](/settings?s=phone&find=Serve%20it%20on%20my%20devices). A linha **Endereço** mostra o endereço do app, com **Copiar** e **Abrir**. O app aceita esse endereço por conta própria: não há nenhum arquivo para editar.
3. Instale o Tailscale também no celular, conectado à mesma conta.
4. Escaneie o código QR abaixo de [**Abrir no celular**](/settings?s=phone&find=Open%20it%20on%20your%20phone) com a câmera do celular (ou digite o endereço) e entre com a senha do app.
5. O celular abre em **Usar no celular**, com **Neste celular**: **Adicionar à Tela de Início** (em um iPhone, no Safari: Compartilhar → **Adicionar à Tela de Início**, o que as notificações exigem nesse caso; no Android, **Instalar**, ou o menu do Chrome → **Instalar app**), depois **Notificar este dispositivo** e **Enviar um teste**, que envia uma notificação somente a esse celular.

**Parar de servir** tira o app da sua tailnet. Ele desfaz exatamente o que **Servir nos meus dispositivos** fez: o único endereço que foi publicado e o endereço que foi adicionado aos aceitos pelo app. Qualquer outra coisa que você sirva com o Tailscale continua como estava. Se você já tinha servido o app com o Tailscale manualmente, a seção mostra isso ("Set up outside this page, with Tailscale itself"), e **Parar de servir** também desativa essa configuração.

Enquanto o app está sendo servido, os links que ele gera começam com esse endereço, então também abrem no celular: o **Open in Hydor** de uma sessão em um app de chat e os links que os agentes dão para sessões e páginas salvas. Se `ALLOWED_ORIGINS` indicar um endereço próprio (veja [Outras formas de acessar](/guide/devices#other-ways-to-reach-it)), os links continuam usando esse.

Em um terminal, `hydor machines phone` mostra o mesmo e desenha o código QR; `hydor machines phone serve` e `hydor machines phone stop` fazem o resto (veja [O terminal](/guide/terminal)).

### Quando algo atrapalha

A seção diz em uma frase o que aconteceu, com a única coisa a fazer:

- **Serve and HTTPS certificates aren't turned on in your tailnet yet.** O Tailscale dá um link que os ativa: **Ativar** o abre (você entra no Tailscale e confirma uma vez), depois **Tentar de novo**.
- **On Linux, Tailscale lets only its operator change what it serves.** Execute o comando mostrado, uma vez, em um terminal (`sudo tailscale set --operator=$USER`, com o seu nome de usuário), depois **Tentar de novo**.
- **Something else is already published at the address.** O Hydor nunca o substitui: **Serve on port 8443** publica o app em `https://laptop.tail1234.ts.net:8443`.
- **Funnel is on for this address.** O Tailscale Funnel foi ativado manualmente, então qualquer pessoa na internet pode alcançá-lo: a seção avisa isso, com o comando que o desativa.
- **HTTPS certificates are off in your tailnet.** **Ativar** abre as configurações de DNS do Tailscale, onde você ativa o MagicDNS e os certificados HTTPS.

### Outras formas de acessar

Se preferir configurar por conta própria, qualquer uma destas também funciona:

- **Tailscale manualmente**: neste computador, `tailscale serve --bg 8790` serve o app em `https://<machine>.<tailnet>.ts.net`, acessível apenas pelos seus próprios dispositivos.
- **Cloudflare Tunnel**: aponte um túnel para `http://localhost:8790`. O Cloudflare Access pode adicionar um segundo login na frente.
- **Seu próprio proxy reverso**, como o Caddy, enviando um nome de host seu para `127.0.0.1:8790`.

Se o proxy alterar o cabeçalho `Host`, informe ao app o endereço em que as pessoas o abrem: `ALLOWED_ORIGINS=https://agents.example.com`. Configurações como essa ficam em `~/.config/hydor.env` (um `NAME=value` por linha) para um app instalado como serviço, ou em `.env` para o Docker Compose; reinicie o app depois.

As prévias de servidores de desenvolvimento usam uma porta própria (8791); veja [Ver um servidor de desenvolvimento com a Prévia](/guide/files-git#look-at-a-dev-server-with-preview).

### A senha protege tudo

A senha protege tudo. Um navegador permanece conectado por 30 dias depois que você entra. As senhas erradas são contadas pelo endereço de onde vêm, na última hora:

- Depois de três, a página de entrada também mostra uma imagem de cinco caracteres para digitar em **Caracteres da imagem**, para que um programa não continue tentando adivinhar. Digitá-los errado não tem custo, e **Nova imagem** (a seta redonda ao lado) traz outra.
- Depois de dez, esse endereço não consegue entrar por uma hora, nem com a senha certa. A página informa quanto tempo falta.
- Depois de dez vindas de qualquer lugar, todos recebem a imagem; depois de sessenta, ninguém consegue entrar até a hora acabar.

Atrás de um dos proxies acima, o endereço contado é o do próprio visitante, como o proxy o repassa. Se você ficar bloqueado, entre de outra rede (os dados móveis de um celular, por exemplo), espere, ou defina uma nova senha no próprio computador, o que encerra todas as pausas. Veja [Alterar sua senha](/guide/app#change-your-password).

## Usar outras máquinas a partir de um só app

Se o Hydor roda em mais de uma máquina (um desktop, um servidor com GPU, um computador na nuvem), você pode usar todas a partir de uma delas. Cada máquina mantém suas próprias sessões, arquivos, terminais, contas conectadas e configurações; o app que você abre mostra uma máquina por vez, e a barra lateral alterna entre elas.

Isso é configurado em [Configurações → App → Máquinas](/settings?s=machines). O grupo **Máquinas** (com **Adicionar uma máquina** ao lado do título) começa com esta máquina ("This server", com a versão dela), seguida pelas que você adicionou, cada uma com:

- um ponto: verde quando responde, cinza enquanto conecta, vermelho quando não responde;
- como ela é alcançada (`ssh gpu-box` ou o endereço dela) e como está: "Online", "2 need you · 1 working", "Connecting…" ou "Not reachable" (com o motivo);
- **Abrir** (as páginas dela) e um menu **⋯** com **Editar** e **Remover**. Uma máquina que não responde também tem um botão **Tentar de novo agora**.

### Adicionar uma máquina

1. **Na outra máquina**, instale o Hydor e crie um token de acesso para esta: em [Configurações → App → Máquinas](/settings?s=machines&find=Access%20from%20other%20machines) dela → **Novo token**, ou executando `node dist/server/cli.js access-token "my laptop"` na pasta do Hydor dela. Copie o token (ele começa com `acm_`).
2. **Aqui**, abra [Configurações → App → Máquinas](/settings?s=machines&find=Add%20a%20machine) e clique em **Adicionar uma máquina**.
3. Dê um **Nome** a ela ("GPU box").
4. Em **Como alcançá-la**, escolha como esta máquina chega até lá:
   - **Por SSH**, o mais simples: o **Host SSH** (um nome do seu `~/.ssh/config` ou `user@host`) e **Porta dela**, a porta em que o Hydor escuta lá (8790). Esta máquina abre a conexão com as próprias chaves SSH, que precisam funcionar sem pedir senha. A outra máquina continua escutando só no próprio `127.0.0.1`: não é preciso abrir nada lá.
   - **Pelo endereço**, em uma rede privada, uma VPN como Tailscale ou WireGuard, ou atrás de HTTPS: por exemplo `http://100.64.0.5:8790`. O app de lá precisa escutar onde esta máquina o alcança (a configuração `HOST` dele).
5. Cole o **Token de acesso** e clique em **Conectar**.

O app verifica se a máquina responde antes de guardá-la. Se não responder, a caixa de diálogo diz o motivo ("Could not use GPU box: …") e nada é adicionado.

### Alternar entre máquinas

Depois de adicionar uma máquina, uma linha com o nome da máquina atual aparece no topo da barra lateral, acima de **Nova sessão**. Clique nela para ver todas as máquinas com o estado de cada uma e um visto na que está sendo mostrada; escolha uma para ir às páginas dela. **Adicionar ou alterar máquinas** abre Configurações → Máquinas.

Nas páginas de outra máquina, a linha fica destacada, para você saber onde está, e um ponto nela significa que há sessões em outras máquinas esperando por você. Se a máquina não responde, uma página diz "… is not reachable" com **Tentar de novo**, um botão de volta para a sua própria máquina e **Configurações → Máquinas**.

### Quando uma máquina tem um Hydor mais antigo

O app que você abre mostra as páginas de outra máquina na própria versão, seja qual for o Hydor que essa máquina executa. Uma máquina com um Hydor mais antigo pode não ter o que as páginas dela precisam, e algumas podem parar de funcionar. Por isso, quando você escolhe uma máquina cujo Hydor é mais antigo que o deste app, uma página aparece primeiro: "… has an older Hydor". Ela informa as duas versões, que as páginas dela abrem aqui na versão deste app e que algumas podem parar de funcionar com uma versão mais antiga. Ela tem três botões:

- **Atualizar…** (com o nome da máquina) atualiza essa máquina a partir daqui, como faz o botão **Atualizar agora** da linha de versão dela em [Configurações → App → Geral](/settings?s=general&find=Check%20now) (veja [Manter o app atualizado](/guide/app#keep-the-app-up-to-date)): uma cópia instalada pelo git, ou a imagem do Docker, recebe a nova versão, compila e reinicia; um app de desktop baixa a nova versão e reinicia nela. Leva alguns minutos, e os agentes que estão trabalhando lá continuam. A página mostra cada etapa ("Getting the new version", "Installing packages", "Building", "Restarting, this page reconnects by itself"; num app de desktop, quanto da nova versão já foi baixado, com uma barra) e abre as páginas dessa máquina sozinha quando ela voltar. Uma cópia do git ou do Docker anterior à 0.78.0 não consegue se atualizar além do histórico reescrito do Hydor ("Not possible to fast-forward, aborting."): a página então avisa, com o comando a executar uma vez nessa máquina (veja [Atualizar uma cópia antiga manualmente](/guide/app#update-an-older-copy-by-hand)).
- **Abrir mesmo assim** abre as páginas dela como estão. Esta aba do navegador não pergunta de novo para essa versão.
- **Abrir** seguido do nome da sua própria máquina volta para a sua própria máquina.

Quando não dá para atualizar a partir daqui, a página diz o motivo: um app de desktop que não consegue se substituir onde está ("Move Hydor to your Applications folder to update it."), uma cópia sem de onde se atualizar ("… has nowhere to update from by itself (it was not installed from git with an upstream): update Hydor there, or open it anyway."), uma atualização que falhou ("The update did not work: …"), uma que precisa reiniciar primeiro ("It has the new version: restart Hydor on … to use it.") ou uma que já está tão nova quanto o lugar de onde se atualiza.

Se uma página de outra máquina falhar ao ser desenhada, você vê "This page stopped working" com o que deu errado, **Recarregar** e **Abrir** a sua própria máquina, em vez de uma janela vazia. A barra lateral permanece, e ir para outra página tenta de novo. Em uma máquina com um Hydor mais antigo, a página oferece **Atualizar…** como acima; em uma máquina com um Hydor mais novo que o deste app, ela diz para atualizar este app e depois abrir a máquina de novo.

### O que funciona entre máquinas

- **Tudo nas páginas de uma máquina é dessa máquina**: as sessões, pastas e arquivos, o Git, os terminais, as contas conectadas dos agentes, os modelos e as configurações.
- **Algumas coisas vêm sempre da máquina em que você abriu o app**: sua senha e entrada, a lista de máquinas, as notificações, os temas que você criou, e o tour de boas-vindas e suas dicas.
- **Os avisos de todas as máquinas chegam até você.** Um aviso de outra máquina cita o nome dela, as notificações push chegam pela sua própria máquina, e a [Caixa de entrada](/guide/inbox) lista o que espera por você em todas as máquinas. A contagem da **Caixa de entrada** na barra de ícones inclui esses itens.
- Os **links somente leitura** funcionam também para sessões em outras máquinas (veja [Compartilhar uma sessão com um link somente leitura](/guide/devices#share-a-session-with-a-read-only-link)).
- **Não funcionam em outras máquinas**: a Prévia, que abre servidores de desenvolvimento somente na máquina em que você abriu o app, e Conectar outros agentes, já que o servidor de cada máquina é alcançado no endereço dela.
- Seu navegador lembra, para cada máquina separadamente, a pasta da página Arquivos, os arquivos abertos e o terminal usado por último.

### Alterar ou remover uma máquina

- **Editar** altera o nome, a forma de alcançá-la ou o token de acesso. Deixe o token vazio para manter o atual. Uma mudança na forma de alcançá-la é verificada de novo antes de ser guardada.
- **Remover** pergunta antes. As sessões da máquina permanecem nela; este app deixa de mostrá-las.

### Deixar outras máquinas usarem esta

No grupo **Acesso de outras máquinas** (nas páginas de outra máquina: **Access to** essa máquina), você cria os tokens que outras máquinas usam para alcançar esta. Outro Hydor com um desses tokens pode fazer tudo o que você pode fazer aqui, inclusive executar comandos, então crie um para cada máquina que se conecta.

1. Clique em **Novo token** ao lado do título do grupo.
2. Diga **Qual máquina vai usá-lo?** ("My laptop") e clique em **Criar token**.
3. Copie o token e cole em Configurações → Máquinas da outra máquina. Ele só é mostrado agora.

Cada token mostra quando foi criado e usado pela última vez. **Revogar**, no menu **⋯** dele (após uma pergunta), corta o acesso dessa máquina na hora.

## Compartilhar uma sessão com um link somente leitura

Um link somente leitura permite que alguém sem a sua senha acompanhe uma sessão em tempo real. Abra o menu da sessão (⋯) → **Compartilhar um link somente leitura**. Para compartilhar um projeto inteiro com alguém (seus documentos, sessões, execuções e lista de leitura, com comentários em nome da pessoa), veja [Compartilhar um projeto com pessoas](/guide/projects#share-a-project-with-people); para compartilhar uma coisa guardada (um documento, uma página, uma imagem, um vídeo…) para comentar ou editar, veja [Compartilhar com pessoas](/guide/library#share-with-people).

1. Em **Vale por**, escolha **Um dia**, **Uma semana**, **Um mês** ou **Até ser desativado**.
2. Clique em **Criar um link**.
3. Copie o link e envie. Ele é mostrado uma única vez; você pode criar outro quando quiser.

**Links ativos agora** lista os links em uso da sessão, cada um com a data em que foi criado, quando termina ("sem fim" para os que valem até serem desativados), quantas vezes foi aberto e quando foi a última vez. **Desativar** (a lixeira) interrompe um link na hora.

### O que a pessoa vê

O link abre apenas a sessão, sem a Barra lateral e sem nada para digitar. Ele mostra o título da sessão, qual agente trabalha nela, "somente leitura, compartilhado do Hydor" e "trabalhando agora" enquanto o agente trabalha. Abaixo está a conversa: suas mensagens, as respostas do agente, os passos dele pelo nome (com as linhas que cada alteração de arquivo adicionou e removeu, e as próprias alterações a um clique de distância) e as páginas que o agente mostrou. Ela se atualiza sozinha, a cada poucos segundos enquanto o agente trabalha.

A pessoa não vê a saída de comandos, o raciocínio do agente, as imagens que você anexou (só que havia algumas) nem qualquer outra coisa do app, e não pode digitar nem alterar nada. Um link que expirou ou foi desativado mostra "Este link expirou ou foi desativado".

## Conectar outros agentes a este app

Agentes que rodam em outro lugar (o Claude Code no seu notebook, o Codex, o Cursor ou qualquer cliente que fale MCP, o protocolo que os agentes usam para chamar ferramentas) podem listar, ler, iniciar e conduzir sessões nesta máquina por meio do servidor MCP do próprio app. Cada um precisa de um token, criado em [Configurações → App → Conectar outros agentes](/settings?s=connect). Um agente com token pode iniciar e conduzir sessões aqui, como você pode.

1. Clique em [**Novo token**](/settings?s=connect&find=New%20token), ao lado do título do grupo **Tokens**.
2. Em **Dê um nome conforme o destino**, digite algo como "Claude Code no meu notebook" e clique em **Criar token**.
3. Copie agora o que você precisar (ele não é mostrado de novo):
   - **Token**, o token em si.
   - **Claude Code**: um comando que adiciona o servidor, `claude mcp add --transport http hydor <address>/mcp --header "Authorization: Bearer <token>"`.
   - **Codex**: linhas para `~/.codex/config.toml`, com o token na variável de ambiente `HYDOR_TOKEN`.
   - **Outros clientes (JSON)**: a entrada usual de servidor MCP.

O endereço é o que o seu navegador está com aberto, então um agente em outra máquina precisa alcançar o app do mesmo modo que o seu navegador (veja [Acessar o app de outro dispositivo](/guide/devices#reach-the-app-from-another-device)).

A lista **Tokens** mostra o nome de cada token, quando foi criado e quando foi usado pela última vez. Crie um para cada agente ou máquina, para poder **Revogar** um de cada vez (no menu **⋯** do token); revogar corta o acesso daquele agente na hora.

### O que eles podem fazer

A linha [**O que eles podem fazer**](/settings?s=connect&find=What%20they%20can%20do), abaixo dos tokens, tem um (i) que lista as ferramentas que um agente com token recebe:

- **list_sessions** e **read_session**: encontrar uma sessão e se atualizar sobre ela (suas mensagens e seus passos pelo nome).
- **start_session**: uma nova sessão do Claude Code ou do Codex com uma primeira mensagem, em qualquer pasta, opcionalmente em uma worktree própria. Ela responde com um link que você pode abrir.
- **send_message**: conduzir uma sessão. Se o agente dela estiver ocupado, a mensagem espera na fila da sessão até o turno terminar.
- **list_models**: os modelos que uma nova sessão pode usar.

Os apps que você oferece a outros agentes (a opção **Oferecer a outros agentes** do app, veja [Apps](/guide/apps)) também aparecem como ferramentas e executam o app com os campos do formulário dele.

As sessões iniciadas neste app não precisam de nada disso. A seção aparece apenas na máquina em que você abriu o app, não nas páginas de outras máquinas.

## Adicionar uma conta do GitHub ou do Gitea

Os pull requests são abertos com uma conta em [Configurações → App → Controle de versão](/settings?s=scm). Cada conta cobre os repositórios do seu servidor: GitHub, um servidor GitHub Enterprise ou um servidor Gitea. O envio (push) em si usa a configuração de git deste computador (suas chaves SSH ou credenciais salvas); a conta serve para abrir o pull request e acompanhar suas verificações.

1. Clique em [**Adicionar uma conta**](/settings?s=scm&find=Add%20an%20account), ao lado do título do grupo **Contas**. Uma caixa de diálogo se abre.
2. Escolha **GitHub** ou **Gitea**.
3. Para o GitHub: se a CLI do GitHub neste computador estiver conectada, **Usar o login dela** adiciona a conta com um clique e pronto. Caso contrário, cole um **Token de acesso**: um token de escopo restrito (fine-grained) com Pull requests (leitura e escrita), Contents (leitura) e Commit statuses (leitura) nos seus repositórios (**Criar um** abre a página no GitHub). Preencha **Endereço do servidor** apenas para o GitHub Enterprise.
4. Para o Gitea: o **Endereço do servidor** (`https://gitea.example.com`) e um **Token de acesso** criado no Gitea em Settings → Applications → Generate token, com leitura e escrita de repositório.
5. Clique em **Adicionar**. O app confere o token perguntando ao servidor a quem ele pertence e depois lista a conta com esse nome de usuário.

Uma segunda conta para o mesmo servidor substitui a primeira. Cada conta é uma linha com o nome de usuário, o servidor e "pela CLI do GitHub" quando for o caso. O menu **⋯** dela tem **Abrir o servidor** e **Remover**, que pergunta antes: os pull requests já vinculados a sessões continuam vinculados, mas o estado deles deixa de ser atualizado.

Como os pull requests são abertos e acompanhados: [Abrir um pull request a partir de uma sessão](/guide/files-git#open-a-pull-request-from-a-session).

## Pedir a um agente

- "Deixe este app acessível do meu celular com o Tailscale."
- "Qual é o endereço deste app na minha tailnet? Alguma coisa impede meu celular de abri-lo?"
- "Pare de servir o app na minha tailnet."
- "Crie um link somente leitura para esta sessão que valha por uma semana."
- "Desative todos os links de compartilhamento desta sessão."
- "Quais das minhas máquinas estão offline? Tente reconectá-las."
- "Renomeie a máquina chamada gpu-box para Studio GPU."
- "Liste os tokens que outros agentes usam para acessar este app e revogue o chamado old laptop."
- "Adicione minha conta do GitHub usando o login da CLI do GitHub."
- "Envie para os meus chats no Telegram, Discord e Slack os avisos de todas as sessões, não só das que eles iniciaram."
- "Quais chats estão vinculados a este app, em cada app de chat?"
- "Faça as novas sessões do meu chat do Discord usarem o Codex."
- "Faça as novas sessões do meu chat do Telegram começarem como o meu agente Contador."
- "Desconecte o app do Slack."
