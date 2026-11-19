# Caixa de entrada e notificações

Os agentes trabalham por conta própria, mas de vez em quando precisam de você: uma aprovação, uma resposta, um formulário, uma chave ou o seu OK antes de algo ser enviado. Este tópico explica a caixa de entrada, que reúne tudo o que está esperando por você, de todas as sessões e máquinas, para que você responda em um só lugar; a Caixa de saída, com as chamadas aguardando o seu OK; e as notificações que avisam quando uma sessão termina, falha ou precisa de você, no app, no computador ou no celular com o app fechado.

![A caixa de entrada: o que espera por você, de todas as sessões](images/inbox.webp)

## Abrir a caixa de entrada

A caixa de entrada é o bloco **Caixa de entrada** na barra de ícones, com o ícone de bandeja, logo abaixo de **Apps**, com **Pesquisa** abaixo dela (eles ficam ali quando você arrasta os outros blocos). Um número no canto indica quantas coisas esperam por você. No celular, abra primeiro a barra lateral com **Menu** (≡): o botão fica no topo da gaveta. Você também pode digitar "caixa de entrada" na caixa de pesquisa (Ctrl+K, ⌘K no Mac). [Abrir a caixa de entrada](/inbox).

O cabeçalho diz quantas coisas esperam por você ("3 esperando por você"). As mais recentes ficam no topo. A lista é atualizada sozinha conforme as sessões começam e deixam de esperar, e verifica de novo a cada poucos segundos enquanto você a observa.

Quando nada está esperando, aparece "Nada está esperando por você".

A página inicial também mostra o que espera por você, primeiro em **Enquanto você estava fora**, abaixo da caixa de mensagem, com o que terminou e o que foi executado sozinho desde a sua última visita (veja [Enquanto você estava fora](/guide/start#while-you-were-away)).

## O que aparece na caixa de entrada

Tudo o que um agente está esperando de você, de todas as sessões nesta máquina, incluindo as sessões que tarefas agendadas e apps iniciam, e de suas outras máquinas:

- **Aprovações**: um comando que o agente quer executar, um arquivo que quer alterar, uma ferramenta que quer usar.
- **Perguntas** que o agente faz a você, e **planos** aguardando a sua aprovação.
- **Formulários** que um serviço pede para você preencher no meio do caminho ("O Notion pede que você preencha um formulário"), ou uma página que ele pede para você abrir.
- **Um navegador que precisa de você**: "Precisa de você no navegador: …" (para entrar em uma conta ou passar por uma verificação), "Parou antes de pagar ou fazer o pedido: …" ou "Quer abrir …, nesta máquina ou na rede dela".
- **Uma chave que um agente pediu**: "Pede uma chave: OPENWEATHER_KEY", com o motivo de precisar dela.
- **Uma habilidade que um agente sugere**: "Sugere uma nova habilidade: …" ou "Sugere uma alteração na habilidade …", com o motivo.
- **Uma sessão esperando por você em outro lugar**: "Esperando por você no VS Code" (ou em um terminal), para sessões executadas fora do app.
- **A pergunta de um app**: uma execução de um dos seus apps esperando em uma etapa **Perguntar a uma pessoa**.
- **Um comentário de alguém com quem você compartilhou um projeto ou um item**: "Maria comentou em “Tese, capítulo 3”", com o que a pessoa escreveu, até que você ou um agente responda ou o comentário seja resolvido. **Abrir** abre o documento, a imagem, o vídeo ou o áudio.
- **Chamadas aguardando na Caixa de saída**: um agente chamou uma ferramenta de uma conta conectada que você definiu como **Perguntar antes**, como uma que envia um e-mail. Elas vêm primeiro, em **Caixa de saída**.

Cada item mostra em qual sessão ele espera (com o ícone do agente) e há quanto tempo está esperando.

## Responder a aprovações, perguntas e formulários na própria caixa de entrada

Aprovações, perguntas e formulários aparecem como o mesmo cartão que você vê na sessão, então dá para responder sem abri-la. Acima de cada cartão está o nome da sessão; clique nele para abrir a sessão. A linha de cima do cartão diz o que está sendo pedido e há quanto tempo espera.

- **Uma aprovação** mostra o que o agente quer fazer: o comando, a alteração em um arquivo (como um diff) ou os dados de entrada da ferramenta. Clique em um dos botões: **Permitir**, uma opção de "sempre" quando o agente oferece (como **Permitir todas as edições nesta sessão** ou **Permitir nesta sessão**), ou **Recusar**. Ao clicar em **Recusar…**, abre-se primeiro uma caixa, "Opcional: diga ao agente o que fazer em vez disso"; escreva uma palavra ao agente se quiser e clique em **Recusar**.
- **Um plano** (do Claude Code) mostra o plano com **Aprovar, aceitar edições automaticamente**, **Aprovar, perguntar antes de editar** e **Continuar planejando**.
- **Uma pergunta** mostra as opções: escolha uma (ou várias, quando permitido) ou digite a sua em **Outro — digite sua própria resposta**; você pode anexar um arquivo à resposta. Depois clique em **Enviar respostas** ou em **Pular**.
- **Um formulário de um serviço** mostra a mensagem do serviço e os campos dele. Preencha-os e clique em **Enviar**, **Recusar** ou **Agora não**. Um formulário sem nada para preencher pede **Permitir** em vez de **Enviar**. Quando o serviço pede que você abra uma página, **Abrir** a abre em uma nova aba.

Depois de respondido, o item sai da caixa de entrada e o agente continua. O significado de cada escolha está explicado em [Aprovar ou recusar o que o agente quer fazer](/guide/sessions#approve-or-deny-what-the-agent-wants-to-do) e [Responder a perguntas e aprovar planos](/guide/sessions#answer-questions-and-approve-plans).

## A Caixa de saída: chamadas aguardando o seu OK

Quando um agente chama uma ferramenta de uma conta conectada que você definiu como **Perguntar antes** ([Apps conectados, chaves e ferramentas](/guide/connections#ask-first-calls-that-wait-for-your-ok)), a chamada não é feita. Ela espera no topo da caixa de entrada, em **Caixa de saída**, um cartão por chamada, até você enviá-la ou descartá-la. O agente não esperou por você: ele foi avisado na hora de que a chamada aguarda o seu OK.

Cada cartão mostra:

- a conta e a ferramenta ("Gmail · send_email") e há quanto tempo espera;
- **Aguardando sua aprovação**, o ícone do agente e a sessão de onde veio (clique no nome da sessão para abri-la), e a tarefa agendada, quando foi a execução de uma tarefa que fez a chamada;
- o que a ferramenta faz, nas palavras do serviço;
- a chamada como um formulário que você pode alterar. Um e-mail mostra **Para**, **Cc**, **Assunto** e **Corpo**; uma mensagem de chat mostra para onde vai e o **Texto**; uma publicação mostra o **Texto**. Outras ferramentas mostram os próprios campos, com um * vermelho nos que a ferramenta exige. Vários endereços vão em um só campo, separados por vírgulas.

Depois:

- **Enviar** faz a chamada com o que o formulário contém agora. O próprio Hydor a faz, mesmo que o agente já tenha terminado há muito tempo. O cartão sai da caixa de entrada e um aviso diz que foi enviada.
- **Descartar** joga a chamada fora: ela nunca é feita.
- **Enviar tudo**, acima dos cartões de uma sessão quando ela tem mais de um, envia todos como estão, na ordem em que foram retidos.

Se o serviço responder com um erro, o cartão permanece, com **Não foi enviado:** e o motivo, e **Enviar de novo**. As chamadas retidas esperam mesmo após reinicializações e são mantidas por 30 dias.

Na sessão, uma linha marca onde a chamada foi retida: **Aguarda sua aprovação na Caixa de saída**, com **Abrir a Caixa de saída**. Depois que você decide, ela diz **Enviado com sua aprovação**, com o início da resposta do serviço, ou **Descartado: não enviado**. Quando você escreve de novo na sessão, o agente dela fica sabendo o que aconteceu com as chamadas.

Uma chamada retida notifica você como uma aprovação, no app, no computador e no celular: "Aguarda sua aprovação na Caixa de saída: …". Toque nela para abrir a caixa de entrada, onde você pode ler o rascunho, alterá-lo e enviá-lo pelo celular.

## Abrir o restante onde ele espera

Os outros itens são respondidos onde esperam. Cada um tem um ícone, o que é pedido, uma linha de detalhe, a sessão e a hora, e **Abrir**, que leva você até lá:

- **Um navegador que precisa de você** abre a sessão, onde o navegador aparece acima da caixa de mensagem para você assumir o controle ([Pesquisa e o navegador](/guide/web)).
- **Uma chave** ou **um login** abre a sessão com o cartão onde você a informa ([Apps conectados, chaves e ferramentas](/guide/connections)).
- **Uma sugestão de habilidade** abre a sessão com o cartão para aprovar ou recusar, ou **Configurações → Skill library** quando essa sessão não existe mais ([Habilidades](/guide/skills)).
- **Uma sessão esperando no VS Code ou em um terminal** a abre aqui para você ver o que ela espera; responda no programa em que ela está sendo executada.
- **A pergunta de um app** abre a execução dele, onde um cartão a faz: **Sim** ou **Não**, ou o formulário dele e **Enviar a resposta** ([Apps](/guide/apps#apps-with-steps)).

## Coisas esperando em suas outras máquinas

Se você adicionou outras máquinas que executam o Hydor ([Usar outras máquinas a partir de um só app](/guide/devices#use-other-machines-from-one-app)), a caixa de entrada consulta cada uma que esteja online e lista também o que espera por lá. A lista então é agrupada por máquina, sob o nome de cada uma; **exibida agora** marca a máquina que o app está mostrando no momento. Você responde a aprovações, perguntas e formulários de outra máquina aqui mesmo, como faria com esta.

Uma máquina que não consegue enviar a lista (uma com versão mais antiga, por exemplo) aparece como uma única linha, "2 sessões esperam por você lá", com **Abrir** para ir até essa máquina.

## O número no botão da caixa de entrada

Um pequeno número no canto do botão da caixa de entrada conta as sessões aguardando a sua aprovação ou resposta: nesta máquina e nas suas outras máquinas que estão online. Acima de 99, mostra **99+**. Aponte para o botão para ler "Caixa de entrada: 3 esperando por você".

O número conta sessões, não itens, então uma sessão com duas aprovações conta uma vez. As chamadas retidas na Caixa de saída somam uma cada. Algumas coisas na caixa de entrada não entram na conta: uma chave pedida, um navegador que precisa de você, uma habilidade a revisar.

## A contagem na aba do navegador

Enquanto sessões na máquina que o app mostra aguardam a sua aprovação ou resposta, o título da aba do navegador começa com o número delas: "(2) Hydor". Você vê isso de outras abas, sem precisar voltar.

## Como o app avisa você

Quando uma sessão termina, falha ou precisa de você, o app avisa da forma que combina com o lugar em que você está:

- **O app está à vista**: um pequeno cartão desliza na parte de baixo da tela (no canto inferior direito, em um computador). Ele mostra o ícone do agente com um ponto colorido (verde quando terminou, âmbar quando precisa de você, vermelho quando falhou), o nome da sessão e o status com o início da resposta. Clique nele para abrir a sessão, ou em ✕ para fechar. Ele some depois de alguns segundos, mas permanece enquanto o ponteiro estiver sobre ele. Um aviso mais novo sobre a mesma sessão substitui o cartão mais antigo.
- **O app está aberto em uma aba que você não está olhando**: uma notificação do seu sistema, depois que você ativou **Notificar este dispositivo**.
- **O app está fechado**, ou o celular está no seu bolso: uma notificação push, depois que você ativou **Notificar este dispositivo** nesse dispositivo.
- **Um app de desktop (Mac, Windows, Linux)**: a notificação do próprio computador (no Mac, na Central de Notificações), esteja a janela do app na frente, atrás de outras janelas ou fechada (o app fica na barra de menus, na área de notificação ou na bandeja do sistema), e também quando o app iniciou no login sem abrir a janela. Clique nela para abrir essa sessão na janela do app. Uma notificação mais nova sobre a mesma sessão substitui a mais antiga. Os pequenos cartões dentro da janela aparecem só quando o seu sistema não está mostrando as notificações do app. Enquanto a janela está longe (fechada, oculta, minimizada ou atrás de outro app), o ícone do app também conta as sessões com avisos novos, cada uma uma vez: um número no ícone do Dock no Mac, no botão da barra de tarefas no Windows (enquanto a janela está aberta: se ela estiver fechada na área de notificação, não há botão na barra de tarefas) e no iniciador em desktops Linux que mostram contagens (como o dock do Ubuntu e o KDE). O número aparece mesmo com Não Perturbe ou um Foco ativado, e some assim que você traz a janela para a frente. No Mac, ele aparece enquanto o Hydor puder colocar um selo no ícone: **Ajustes do Sistema → Notificações → Hydor → Selo no ícone do app** (ativado por padrão depois que você permite as notificações do Hydor).

Você não recebe aviso sobre a sessão que está olhando agora. Uma sessão só terminou quando nada que ela iniciou continua em execução: enquanto as tarefas em segundo plano dela (um comando como um servidor de desenvolvimento, um monitor) ou os subagentes ainda estão trabalhando, o aviso espera e chega quando eles terminarem. Uma sessão adiada que precisa de você volta do adiamento na hora. No modo Mãos livres, o app também diz em voz alta quando a sessão que ele acompanha termina ou precisa de você ([Documentos, imagens, vídeos e voz](/guide/documents-voice)).

## O que cada notificação diz

O título de uma notificação é o nome da sessão (abreviado quando é longo). O texto diz o que aconteceu:

- **Concluídas**, e depois o início da última resposta do agente. Ela vem depois de uma rodada que levou pelo menos dez segundos, então uma troca rápida de mensagens não gera aviso.
- Quando a sessão precisa de você, o que ela precisa:
  - para uma aprovação simples de sim ou não, o que o agente quer fazer, com a primeira linha ("Executar um comando: npm test");
  - caso contrário, "Precisa da sua aprovação" ou "Tem uma pergunta para você";
  - para o navegador dela, o que o navegador precisa: "Precisa de você no navegador: …", "Parou antes de pagar: …", "Pede para abrir …" ou "A página pergunta: …";
  - para uma sessão no VS Code ou em um terminal, "Esperando por você no VS Code", enviada só se ela ainda esperar um minuto depois (é provável que você esteja bem ali);
  - para uma chamada retida na Caixa de saída, "Aguarda sua aprovação na Caixa de saída:", a conta e a ferramenta, e para quem ela vai. Tocar nela abre a caixa de entrada.
- **Falhou**, e depois o erro.

Uma sessão trabalhando em uma meta diz "Meta alcançada: …" quando a meta é cumprida, e "A meta precisa de você: …" ou "Meta pausada: …" quando ela para ([Dar uma meta à sessão](/guide/sessions#give-the-session-a-goal)).

A execução de uma tarefa agendada diz como foi, em uma linha escrita pelo agente. Uma execução sem nada novo a relatar fica em silêncio, uma execução com falha sempre avisa você, uma execução bloqueada aparece como "Bloqueada: …", e uma tarefa pausada após falhas seguidas diz isso ([Tarefas agendadas](/guide/tasks)).

Os avisos de suas outras máquinas chegam por esta, então um dispositivo ouve de todas elas: o texto da notificação começa com o nome da máquina, e o cartão no app diz "em" essa máquina.

## Ativar notificações neste dispositivo

[Configurações → App → Notificações](/settings?s=notifications) tem, no grupo **Este dispositivo**, duas chaves, definidas em cada dispositivo (cada navegador) para si mesmo, e um teste:

- [**Notificar este dispositivo**](/settings?s=notifications&find=Notify%20this%20device): uma notificação quando uma sessão termina, falha ou precisa da sua resposta, mesmo com o app fechado. Ao ativar, o navegador pede permissão para mostrar notificações. Cada dispositivo ativa para si mesmo: o celular e o computador separadamente. Em um app de desktop (Mac, Windows, Linux) ela fica sempre ativada: as notificações chegam como notificações do Mac, do Windows ou do seu desktop enquanto o app estiver em execução, mesmo com a janela fechada. No Mac, o macOS pergunta uma vez se o Hydor pode enviar notificações: permita e use **Ajustes do Sistema → Notificações → Hydor** para escolher como elas aparecem. Quando o sistema não as está mostrando, a linha avisa, e enquanto isso elas aparecem dentro do app; o **(i)** dela diz onde permiti-las (no Windows, **Configurações → Sistema → Notificações**). Ative a chave para permiti-las: os Ajustes do Sistema abrem nas notificações do Hydor (no Windows, Configurações → Sistema → Notificações) e, quando você voltar ao app, uma notificação de teste mostra que elas funcionam.
- [**Som**](/settings?s=notifications&find=Sound): um toque curto a cada aviso enquanto o app está aberto, que sobe quando uma sessão termina e desce quando ela precisa de você ou falhou. Vem desativado; ao ativar, o toque toca uma vez. Em um app de desktop, o toque só toca com os avisos que o app mostra dentro da janela; as notificações do sistema fazem o próprio som.
- [**Enviar um teste**](/settings?s=notifications&find=Send%20a%20test) (a linha **Experimentar**, mostrada depois que **Notificar este dispositivo** está ativado): envia uma notificação a todos os dispositivos que ativaram as notificações. Ela diz “Notifications work on this device.” e aparece quando o app não está à vista, então saia dele para vê-la. Uma mensagem informa para quantos dispositivos foi enviada, ou “No device got it.” Em um app de desktop, **Experimentar** aparece desde o início: **Enviar um teste** mostra uma notificação neste computador na hora, mesmo com o app em primeiro plano. Se o sistema não a mostrar, uma mensagem diz “It didn’t show. Allow notifications for Hydor in the system’s settings.”

Para configurar em um celular:

1. Abra o app no celular. Para isso, ele precisa ser servido por HTTPS: [Configurações → App → Usar no celular](/settings?s=phone) faz isso de forma privada com o Tailscale, e o QR code dele abre o app no celular nos passos abaixo ([Use no celular com o Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale)).
2. Em um iPhone ou iPad, primeiro adicione o app à Tela de Início (**Participação** → **Adicionar à Tela de Início**) e abra-o por lá. Até então, a configuração avisa isso e não pode ser ativada.
3. Abra **Configurações → App → Notificações** e ative **Notificar este dispositivo**. Permita as notificações quando o celular perguntar.
4. Toque em **Enviar um teste** e saia do app para vê-la chegar.

Se a configuração disser que as notificações estão “Blocked for this site in the browser settings”, primeiro permita-as para o endereço do app nas configurações do navegador e depois ative. Se disser “This browser cannot receive notifications here”, o navegador não consegue recebê-las nesse endereço, geralmente porque o app foi aberto por HTTP simples em vez de HTTPS.

Se a chave aparecer desativada um dia, o serviço de push do navegador removeu este dispositivo: ative-a de novo. Quando um celular está desligado ou offline, a notificação espera por ele por até um dia. Uma notificação mais nova sobre a mesma sessão substitui uma mais antiga no dispositivo.

Para parar de recebê-las, desative **Notificar este dispositivo** nesse dispositivo.

## Aprovar ou recusar pela notificação

Quando uma sessão aguarda uma aprovação simples de sim ou não (um comando, uma alteração em arquivo ou uma ferramenta; não uma pergunta, um formulário ou um plano), a notificação traz dois botões com as palavras do próprio cartão, como **Permitir** e **Recusar**, nos navegadores que mostram botões nas notificações.

- Toque em um deles para responder sem abrir o app. Uma notificação discreta confirma, como “Allow: Run a command”.
- Se a resposta não puder ser enviada (o navegador foi desconectado ou você já respondeu em outro lugar), a sessão abre para você responder por lá.
- Toque na própria notificação para abrir a sessão, em uma janela do app que já esteja aberta, quando houver.
- As notificações de um app de desktop não têm botões: clique em uma para abrir a sessão e responda por lá.
- Uma chamada retida na Caixa de saída também não tem botões, para que você leia antes o que sairia: toque na notificação e envie pela caixa de entrada.

As aprovações das suas outras máquinas podem ser respondidas do mesmo jeito: a resposta vai para essa máquina por meio desta.

## Pergunte a um agente

Os agentes podem ler o que está esperando por você e enviar uma notificação de teste. Eles não podem responder por você às aprovações de outras sessões. Algumas ideias para experimentar:

- "O que está esperando por mim agora? Do mais urgente ao menos urgente."
- "Quais sessões estão me pedindo uma chave, e para quê?"
- "O que está esperando na minha Caixa de saída? Leia para mim os e-mails antes de eu enviar."
- "Resuma o que cada sessão em espera precisa de mim, em uma linha para cada."
- "Envie uma notificação de teste para eu ver se meu celular as recebe."
