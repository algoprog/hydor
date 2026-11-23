# Pesquisa e navegador

Os agentes do app podem pesquisar na web, ler páginas e usar um navegador de verdade, seja qual for o modelo. Este tópico explica os provedores de pesquisa que eles usam e como configurá-los, o que uma pesquisa mostra e suas fontes, e o navegador: acompanhá-lo ao vivo, assumir o controle para entrar numa conta, resolver uma verificação ou pagar, e suas configurações. Também fala da página Navegador, um navegador seu no app para computador (abas, abas privadas, uma barra de endereço inteligente, favoritos, histórico, um bloqueador de anúncios, tradução, modo leitura, extensões) e de como passar uma página dele para um agente. No app para computador (Mac, Windows, Linux), o navegador roda dentro do app, e os agentes também podem usar o próprio computador: a tela, o mouse e o teclado.

![Um agente que pesquisou na web, leu páginas e comparou o que encontrou em uma tabela](images/web.webp)

## Como os agentes pesquisam na web

Todo agente que você executa aqui (Claude Code, Codex, Custom e agentes que falam ACP) recebe três ferramentas do app: uma pesquisa na web, um jeito de ler uma página e um jeito de encontrar imagens e vídeos de coisas. Elas funcionam do mesmo jeito, seja qual for o modelo, então um modelo pequeno no seu próprio computador pesquisa tão bem quanto um grande.

- Uma pesquisa vai para os provedores em **Configurações → Recursos → Pesquisa**, na ordem deles. O primeiro que estiver ativado responde. Quando ele não consegue (precisa de uma chave, a cota acabou, está fora de alcance ou pede para provar que a pesquisa não vem de um robô), o próximo responde. A resposta informa ao agente qual provedor respondeu.
- Um agente pode pedir até 100 resultados e restringir uma pesquisa a certos sites (ou excluir sites), a datas, a idiomas, a PDFs ou às páginas iniciais dos sites (a página de uma pessoa, um site oficial). O Naget Search também pode restringir a tipos de páginas, como artigos científicos, preprints, artigos biomédicos, patentes dos EUA, documentos de empresas, notícias, documentação ou discussões. Quando um provedor não consegue respeitar um filtro, o agente é avisado. Quando o agente não define nenhum filtro, mas as palavras da pesquisa indicam algum (“relatórios sobre o clima em nasa.gov do mês passado”, “artigos sobre geração aumentada por recuperação desde 2024”), o modelo auxiliar os lê primeiro (veja [Escolher o modelo auxiliar](/guide/agents-models#choose-the-helper-model)), e o Naget Search pesquisa as palavras restantes com esses filtros. Isso acontece apenas em pesquisas cujas palavras parecem indicar um filtro, algumas por vez, e em cerca de 8 segundos. Quando o modelo auxiliar não consegue responder a tempo, ou duas leituras seguidas falham (a leitura então pausa por 10 minutos), a pesquisa vai como o agente a escreveu, como acontece com SearXNG, Brave Search e DuckDuckGo, e quando o próprio agente define algum filtro. Se os filtros lidos não encontrarem nada, o Naget Search pesquisa as palavras como foram escritas.
- O Naget Search também pode trazer, para cada resultado, as frases da página que respondem à pesquisa, em vez de um trecho simples. Isso é mais lento, por isso os agentes pedem quando precisam de fatos das páginas. Funciona também sem chave.
- Para uma lista de coisas a mostrar (jogos, filmes, lugares, pratos, produtos, times), um agente pode encontrar uma imagem de cada uma: a imagem do próprio artigo da Wikipédia (a capa de um jogo, a foto de um lugar, o escudo de um time) ou, na falta dela, a que as páginas mostram quando compartilhadas; e, quando pedido, um vídeo do YouTube cujo título a nomeie (um trailer, uma receita, melhores momentos). Só vale o que nomeia claramente a coisa, então algumas voltam sem imagem. Os apps usam isso para mostrar imagens e vídeos nas respostas (veja [Apps](/guide/apps)).
- Os agentes são orientados a citar as páginas que usam: um número entre colchetes depois do que cada página sustenta e, no fim da resposta, uma lista só dessas páginas. O app as mostra como links e cartões (veja [Ver as fontes abaixo de uma resposta](/guide/web#see-the-sources-under-a-reply)). Os agentes tratam o que os resultados e as páginas dizem como informação, nunca como instruções.

Um provedor que falhou descansa por um tempo (até a cota voltar, por exemplo), para que as pesquisas seguintes não esperem por ele. A mesma pesquisa feita de novo em até 10 minutos recebe os resultados anteriores, sem pesquisar outra vez.

O Claude Code e o Codex também têm ferramentas de web próprias. Quando uma resposta cita as páginas que eles encontraram, elas aparecem do mesmo jeito.

## Escolher seus provedores de pesquisa

Abra [Configurações → Recursos → Pesquisa](/settings?s=search). No celular, as Configurações são uma lista: toque em **Pesquisa** em Recursos.

Em [Provedores](/settings?s=search&find=Providers) (“Tentados de cima para baixo: o primeiro que estiver ativado responde”), cada provedor tem uma linha:

- seu nome, com **Padrão** no primeiro que está ativado, e um aviso como **Precisa de uma chave** ou **Precisa do endereço da sua instância** quando ele não consegue responder do jeito que está configurado;
- uma linha sobre o que ele é; o (i) ao lado do nome acrescenta a que ele pode restringir uma pesquisa, como “Até 100 resultados · categorias · datas · páginas iniciais · as partes das páginas que respondem”;
- uma dica da chave salva, se houver (como “sk-ab…12cd”: nunca a chave em si);
- seu último erro, em vermelho, com há quanto tempo ocorreu;
- um interruptor à direita que o ativa ou desativa, e um menu **⋯** com **Adicionar uma chave** (ou **Alterar a chave**), **Definir o endereço** (ou **Alterar o endereço**), **Testar**, **Tornar padrão** (num provedor que está ativado, mas não é o primeiro), e **Mover para cima** e **Mover para baixo** para mudar seu lugar na ordem.

O (i) ao lado de **Provedores** diz que os agentes podem pesquisar na web e ler páginas seja qual for o modelo, e que os resultados de pesquisa e as páginas são dados externos, que os agentes usam como informação, nunca como instruções.

**Tornar padrão** move o provedor para o topo da lista. De fábrica, a ordem é Naget Search, SearXNG, Brave Search, DuckDuckGo. O Naget Search e o DuckDuckGo começam ativados; o SearXNG e o Brave Search começam desativados, até você dar a eles o que precisam.

### Naget Search

O [Naget Search](/settings?s=search&find=Naget%20Search) é o padrão: o índice próprio do Naget da web, de artigos, patentes e documentos de empresas. Não precisa de chave: as pesquisas sem ela usam uma cota gratuita diária. Depois que ele responde, sua linha mostra **Cota gratuita restante hoje** (quantas da cota do dia), uma barra e quando chegam mais. Quando a cota acaba, a linha avisa, e o próximo provedor responde até ela voltar.

Uma chave de naget.com dá mais pesquisas; com ela, a linha mostra **Créditos restantes** no lugar. Uma chave também permite que o Naget Search escolha as partes de uma página que respondem a uma pergunta quando os agentes leem páginas (veja [Ler páginas inteiras ou só as partes que respondem a uma pergunta](/guide/web#read-whole-pages-or-only-the-parts-that-answer-a-question)); sem ela, o app as escolhe pelas palavras. As frases que respondem a uma pesquisa vêm nos resultados sem chave. Se a linha disser “O Naget Search precisa de uma chave por enquanto”, as pesquisas sem chave estão sendo recusadas; até você adicionar uma, o próximo provedor responde.

O formulário dele também tem um **Endereço**: https://naget.com, a menos que você defina outro. Deixe como está, a não ser que tenham lhe dado outro endereço.

### SearXNG

O [SearXNG](/settings?s=search&find=SearXNG) é um mecanismo de busca que você mesmo executa, que consulta vários mecanismos de busca ao mesmo tempo e não guarda registro sobre você. Não precisa de chave, só do endereço da sua instância: abra o menu **⋯**, escolha **Definir o endereço**, digite-o (como https://searx.example.org) e pressione **Salvar**. Dar um endereço a ele o ativa. Ele traz até 100 resultados.

### Brave Search

O [Brave Search](/settings?s=search&find=Brave%20Search) pesquisa o índice independente do próprio Brave, por meio da API de Pesquisa dele. Precisa de uma chave; o Brave tem um plano gratuito. **⋯ → Adicionar uma chave** abre um formulário com um link, **Get one at api-dashboard.search.brave.com**. Adicionar uma chave o ativa. Ele traz até 100 resultados.

### DuckDuckGo

O [DuckDuckGo](/settings?s=search&find=DuckDuckGo) não precisa de chave e já vem ativado, no fim da lista, como último recurso. Ele traz cerca de 10 resultados por página (30 no máximo) e pode pedir para provar que a pesquisa não vem de um robô; nesse caso o próximo provedor responde, se houver.

### Adicionar ou alterar uma chave ou um endereço

1. Na linha do provedor, abra o menu **⋯** e escolha **Adicionar uma chave** (ou **Alterar a chave**, **Definir o endereço**, **Alterar o endereço**).
2. Cole a chave em **Chave** (ela aparece como pontos) ou digite o **Endereço**. No Naget Search, a chave vem marcada como “opcional, para mais pesquisas”.
3. Pressione **Salvar**. **Cancelar** fecha o formulário e mantém tudo como estava.

Dar a um provedor a chave ou o endereço de que ele precisa o ativa. As chaves ficam no servidor: a página só mostra uma dica delas. Para apagar uma chave salva, abra o formulário e pressione **Remover a chave salva**.

### Testar um provedor

Abra o menu **⋯** de uma linha e escolha **Testar**. O app executa uma pequena pesquisa só com esse provedor, sem recorrer ao próximo, e com o que você digitou no formulário dele mesmo antes de salvar. Você vê “Works:”, o número de resultados e quanto tempo levou, com os três primeiros resultados como links, ou o motivo da falha. Testar um provedor como está salvo também limpa o erro antigo dele quando voltar a funcionar.

### Resultados por pesquisa

[Resultados por pesquisa](/settings?s=search&find=Results%20per%20search) define quantos resultados uma pesquisa traz quando o agente não pede um número: **10**, **20** (o padrão), **50** ou **100**. Os agentes ainda podem pedir mais, até 100, para pesquisas mais profundas, como encontrar artigos. Mais resultados dão mais trabalho de leitura para o agente.

Uma nota no fim da página leva a como um desenvolvedor pode adicionar outro provedor.

### Quando nenhum provedor consegue responder

Se todos os provedores ativados falharem, ou você desativou todos, o agente é informado do motivo de cada um. O Claude Code e o Codex passam então a pesquisar com a pesquisa web embutida deles (o WebSearch do Claude Code, a pesquisa web do Codex), nessa pesquisa e no restante da tarefa, e citam as páginas dela como de costume: só avisam sobre Configurações → Pesquisa se a pesquisa própria deles também falhar. Outros agentes, como o Custom, não têm pesquisa web própria: eles são orientados a dizer que Configurações → Pesquisa pode receber uma chave ou ativar outro provedor. Em uma [pesquisa profunda](/guide/research), a pesquisa web própria dos agentes fica desativada, para que toda pesquisa conte no orçamento: ali também você é informado do que corrigir.

## Ver o que uma pesquisa encontrou

Os passos de um agente se recolhem numa linha entre as mensagens dele, como “Pesquisou 4 vezes” (pesquisas na web e páginas lidas contam como pesquisas ali). Abra-a para ver cada passo. Uma pesquisa aparece como “Pesquisou na web “e-bikes por menos de 2.000 euros””, com o provedor que respondeu e o número de resultados à direita (no celular, só o número). Enquanto executa, aparece “Pesquisando na web”, com um cronômetro; uma que falhou aparece como “A pesquisa na web falhou”.

Clique em uma pesquisa para abri-la:

- os filtros que ela usou (um site, datas, uma categoria…) como pequenas etiquetas, incluindo os lidos das palavras da pesquisa, com uma nota que indica as palavras pesquisadas e “as partes que respondem” quando o agente pediu as frases que respondem;
- notas, como um provedor que não conseguiu responder e qual respondeu no lugar, ou um filtro que o provedor não conseguiu respeitar;
- os resultados, numerados como o agente os viu: o título (um link), o site, a data, uma etiqueta para o tipo de página (Artigo, arXiv, PubMed, Patente, Documento da SEC, Docs…), uma etiqueta PDF, e o trecho ou as frases que respondem à pesquisa. Cada um tem um botão de abrir (↗).

Os 8 primeiros resultados aparecem; **Mostrar todos os N resultados** mostra o resto.

## Ver as fontes abaixo de uma resposta

Quando um agente cita as páginas que usou, a resposta as mostra em dois lugares, em vez de uma lista numerada no fim:

- **No texto**: onde cita uma página, aparece um pequeno chip com o ícone e o nome do site, como **ign**. Um chip que representa várias páginas diz quantas a mais (**ign +1**). No computador, aponte para um chip para ver as páginas dele, com títulos e sites; clique nele para abrir a página (uma entre várias, a partir do cartão). No celular, toque nele para vê-las e depois toque em uma para abrir.
- **Abaixo da resposta**: uma linha de **Fontes** com os ícones dos primeiros sites e quantas páginas a resposta cita. Clique nela para abrir um cartão para cada página: o título, o site e um link.

Só aparecem as páginas que a resposta cita, pelos números que o agente deu a elas, não todas as pesquisas que ele fez: o que ele pesquisou e leu está nos passos dele (abra **Trabalhou por…** acima da resposta). **Copiar mensagem** (abaixo da resposta) a copia como o agente a escreveu, com a lista de fontes; ao ler em voz alta, os números e a lista ficam de fora. O ícone de um site vem do próprio site na primeira vez que aparece e é guardado; um site sem ícone mostra a primeira letra.

## Ler páginas inteiras ou só as partes que respondem a uma pergunta

Quando os trechos não bastam, um agente lê a página. Ele pode lê-la inteira: uma página longa vem em partes de cerca de 3.000 palavras, e o agente pede a próxima parte quando precisa. Ou faz uma pergunta à página e recebe de volta só as partes que respondem a ela, o que é bem mais curto.

- Com o Naget Search ativado e sua chave adicionada, o Naget Search escolhe as frases da página que respondem à pergunta. O passo informa quantas das palavras da página foram mantidas. Ao contrário das frases que respondem a uma pesquisa, isso precisa da chave.
- Caso contrário, o app escolhe os parágrafos que compartilham mais palavras com a pergunta e orienta o agente a ler a página inteira se eles não trouxerem a resposta.

PDFs também são lidos como texto. Só páginas públicas da web podem ser lidas assim: endereços neste computador ou na rede dele não podem (o [navegador](/guide/web#the-browser-agents-use) pode abri-los depois que você permitir). Uma página é buscada uma vez e guardada por 10 minutos, então a parte seguinte vem na hora.

Na conversa, uma leitura aparece como “Leu” e o título da página, com a pergunta feita a ela em telas mais largas. Clique para ver o endereço, qual parte foi (“parte 1 de 3”) ou “as partes que respondem” à pergunta, e o texto que o agente recebeu.

## O navegador que os agentes usam

Alguns sites exigem cliques, formulários, logins ou scripts, que uma leitura simples não consegue atravessar. Para esses casos, os agentes têm um navegador, separado do seu: ele não tem nenhum dos logins do Chrome, Edge, Firefox ou Safari que você usa. Você pode acompanhá-lo ao vivo e assumir o controle a qualquer momento. Qual navegador é usado depende de onde o app está rodando:

- **No app para desktop** (Mac, Windows, Linux) é o navegador próprio do app, baseado no Chromium (o navegador de código aberto em que o Chrome se baseia) e executado dentro do app. Não é preciso instalar nada, e o app o escolhe, a menos que você prefira outro (veja [Chromium](/guide/web#chromium)). As páginas são desenhadas rapidamente na janela do app, você clica em uma para usá-la, e ele continua funcionando com a janela fechada.
- **Em qualquer outro lugar** (o app no Docker ou em um servidor, e um celular ou qualquer página da web que o acesse) é um Chromium de verdade que o app inicia no computador onde está rodando, e que você vê como uma imagem ao vivo.

Com o navegador ativado, todo agente pode:

- abrir uma página, na aba em que está ou em uma nova, com os scripts da página em execução;
- ver a página como uma estrutura de tópicos: o texto, com links, botões e campos numerados;
- clicar, dar duplo clique, apontar, digitar em um campo (substituindo o que ele contém, ou acrescentando, e pressionando Enter), escolher em uma lista, rolar a página, pressionar teclas, voltar e esperar: até 10 passos de uma vez, parando antes se a página mudar;
- entrar com um login que você salvou no cofre: ele digita a senha (ou outra chave) na página pelo nome dela, sem vê-la, e somente em uma página dos hosts que você permitiu para ela (veja [Guardar chaves no cofre](/guide/connections#keep-keys-in-the-vault));
- olhar uma captura de tela com os números desenhados, quando o modelo dele enxerga imagens e as capturas de tela estão ativadas;
- procurar texto na página, ler o texto dela em partes, ou pedir ao modelo auxiliar que responda a uma pergunta a partir de uma página longa (veja [Agentes, contas e modelos](/guide/agents-models));
- listar, trocar e fechar abas;
- anexar arquivos da pasta da sessão ao campo de upload de uma página (nada de nenhum outro lugar);
- entregar o navegador a você.

Algumas coisas são sempre suas, ou esperam o seu OK:

- **Logins sem um login salvo, verificações e qualquer coisa de que o agente não tenha certeza.** Os agentes são orientados a passar essas etapas para você em vez de tentar, incluindo um captcha (uma verificação de que você é uma pessoa) e um código enviado a você. Quando uma tarefa precisar entrar de novo sem você, como uma tarefa agendada, o agente pode pedir o login em um cartão, para guardá-lo no cofre.
- **Pagar e fazer pedidos.** Um agente nunca pressiona um botão que pagaria ou faria um pedido (Pagar, Comprar agora, Finalizar pedido, Assinar agora, Doar, Reservar agora, o botão de envio de um formulário com campos de cartão…). Ele para, e você é solicitado a concluir a ação por conta própria.
- **Botões que enviam, publicam, excluem ou transferem, em um site em que o navegador está com login ativo.** Antes de um agente pressionar um deles, você é solicitado a permitir (veja [Botões que enviam, publicam ou excluem](/guide/web#buttons-that-send-post-or-delete)). Você pode desativar isso em Configurações.
- **O que você digita.** Os valores de senhas, números de cartão, códigos de segurança e códigos de uso único nunca são mostrados ao agente, nem qualquer coisa que você digitou enquanto estava no controle. As partes de endereços que se parecem com senhas também ficam ocultas para ele. Um campo que o agente preencheu a partir do cofre mostra pontos, e o agente apenas fica sabendo que ele foi preenchido.
- **Perguntas em pop-up** que uma página faz (veja [Responder às perguntas em pop-up de uma página](/guide/web#answer-a-pages-pop-up-questions)).

Cada sessão tem um navegador próprio. Sem um perfil, ele começa novo, sem login em lugar nenhum, e não guarda nada quando é fechado. Com um perfil, ele fica logado onde o perfil estiver (veja [Manter logins com perfis](/guide/web#keep-sign-ins-with-profiles)). O seu próprio navegador, na página Navegador, é um navegador separado que os agentes nunca usam, a menos que você entregue a eles uma página dele (veja [Entregar uma página a um agente](/guide/web#hand-a-page-to-an-agent)).

## Acompanhar o navegador ao vivo

Enquanto o navegador de uma sessão está aberto, um painel fica logo acima da caixa de mensagem. Ele mostra o título da página (ou “Página em branco”) e, abaixo dele, o que o agente está fazendo (“Clicando em “Entrar””, “Digitando em “Pesquisar””), o perfil que ele usa e quantas abas estão abertas. Ele diz “Aguardando você” quando algo espera por você, e “Você está no controle: o agente espera” enquanto você o usa.

Em um computador:

- Dobrado, o painel mostra uma pequena imagem ao vivo da página à esquerda. Clique nela, no título ou na seta (**Mostrar a visualização ao vivo**) para abrir a visualização ao vivo; **Ocultar a visualização ao vivo** a dobra de novo.
- **Tela cheia** mostra o navegador sobre todo o app; **Sair da tela cheia** traz você de volta.
- **Assumir** deixa você usar o navegador por conta própria (veja abaixo), e **Opções do navegador** (⋯) abre o menu dele.

Em um celular, toque no painel para abrir o navegador em tela cheia; o × o fecha.

No app para desktop, a visualização ao vivo é a própria página, desenhada pelo app e atualizada tão rápido quanto a página muda, de modo que rolar e digitar parecem como em qualquer navegador. Nos outros casos, é uma imagem da página, enviada várias vezes por segundo enquanto você assiste; ela diz “Conectando ao navegador…” até a primeira chegar.

### Ver para onde o agente aponta

O navegador roda fora da vista, então a visualização ao vivo desenha o ponteiro do agente para você: uma seta grande na cor do app, com um halo suave e uma etiqueta **Agente** ao lado.

- Antes de o agente clicar, digitar ou rolar, o ponteiro dele desliza de onde estava até aquele lugar, em cerca de um terço de segundo, para que seu olhar possa acompanhar. Enquanto você assiste, o agente espera por ele; quando ninguém está olhando o navegador, ele não espera.
- Onde ele clica, um anel se espalha (dois para um duplo clique). O campo em que ele digita, ou a lista em que ele escolhe, ganha um contorno por um instante. Uma rolagem mostra o sentido com setas ao lado do ponteiro, e as teclas que ele pressiona (Enter, Tab, Ctrl+A) aparecem ao lado da etiqueta.
- O ponteiro fica onde o agente agiu pela última vez. Na pequena imagem do painel dobrado, ele aparece como uma pequena seta.
- Enquanto você está no controle, o ponteiro do agente some da visualização ao vivo: o seu é o único. Ele volta quando você devolve o navegador.

Cada passo que o agente dá no navegador também aparece na conversa, entre os outros passos dele, como uma linha (“Abriu github.com”, “Clicou em [12] botão "Entrar"”, “Perguntou a você: Entrar no GitHub”) com uma pequena imagem da página logo depois. Clique na linha para ver a imagem maior e a resposta completa do agente. Na imagem maior, um anel marca onde o passo clicou e um contorno tracejado marca o campo em que ele digitou, numerado quando o passo fez várias coisas. O app guarda as imagens dos últimos 400 passos de cada sessão; as de sessões sem uso há um mês são apagadas.

## Assumir o controle para entrar, resolver uma verificação ou pagar

Quando um agente precisa de você no navegador, você fica sabendo em vários lugares ao mesmo tempo:

- uma linha no topo do painel do navegador, com os botões dela;
- um cartão na conversa, como “Precisa de você no navegador: Entrar no GitHub”, com **Mostrar** (**Abrir** em um celular);
- uma notificação, como quando uma sessão precisa da sua resposta, e uma entrada na [Caixa de entrada](/inbox) (veja [Caixa de entrada e notificações](/guide/inbox)).

Em um computador, a visualização ao vivo se abre sozinha para um login, um pagamento ou uma pergunta em pop-up, e se dobra de novo quando isso é resolvido (a menos que você a tenha aberto por conta própria).

### Em um computador

1. Pressione **Assumir** na linha (ou no painel). O painel diz “Você está no controle: o agente espera”, e a visualização ao vivo ganha um contorno colorido.
2. Use a página como em qualquer navegador: clique, role com a roda do mouse, digite. Clique primeiro na página; a partir daí suas teclas vão para a página (os atalhos do próprio app esperam), e o que você cola entra como texto. No app para desktop, clicar ou digitar na página basta para assumir o controle: o painel muda sozinho para “Você está no controle: o agente espera”, e enquanto o agente está no controle, uma linha abaixo do endereço diz “Clique na página para usá-la você mesmo”.
3. Enquanto você está no controle, uma barra acima da página tem **Voltar**, **Recarregar** e o endereço: digite um endereço e pressione Enter para ir até ele.
4. Quando terminar, pressione **Concluído** na linha. O app avisa o agente que você terminou, com a página que o navegador mostra agora, e o agente continua.

### Em um celular

1. Toque em **Assumir**. O navegador abre em tela cheia, e a página é ajustada à tela do seu celular enquanto você está no controle. A barra com **Voltar**, **Recarregar** e o endereço fica acima dela.
2. Toque para clicar, arraste para rolar. **Digitar** abre o teclado do celular; a fileira ao lado tem Tab, Enter, Esc, ⌫ e as teclas de seta.
3. Toque em **Concluído** quando terminar. A página volta ao tamanho habitual, e o agente continua.

### Pagar e fazer pedidos

Quando o agente chega a um botão que pagaria ou faria um pedido, ele para: “Parou antes de pagar ou fazer o pedido: Finalizar pedido em shop.example.com. Isso cabe a você.” Assuma o controle, confira o pedido, pague você mesmo e pressione **Concluído**. Pressione **Agora não** se você não for em frente. De qualquer forma, o agente fica sabendo qual foi a escolha.

### Outras respostas e assumir o controle por conta própria

- **Não pode** avisa o agente que você não conseguiu fazer o que ele pediu.
- Você pode assumir o controle a qualquer momento, não só quando solicitado: pressione **Assumir** no painel. O agente espera; se ele tentar usar o navegador nesse meio-tempo, é avisado de que você está com ele e que será informado quando você terminar. Pressione **Devolver** para devolver o navegador; se o agente estava esperando por ele, recebe uma mensagem com a página que o navegador mostra.

As mensagens que o app envia ao agente por você aparecem na conversa. Se o agente estiver no meio de uma vez dele, elas esperam até ela terminar.

## Botões que enviam, publicam ou excluem

Em um site em que o navegador está com login ativo, um agente pergunta antes de pressionar um botão que envia, publica, divulga, compartilha, responde, exclui, remove, transfere ou saca algo. Isso vale para um navegador que usa um perfil (veja [Manter logins com perfis](/guide/web#keep-sign-ins-with-profiles)) e para uma página que você entregou a um agente (veja [Entregar uma página a um agente](/guide/web#hand-a-page-to-an-agent)). Um navegador que começa novo, sem login em lugar nenhum, não tem nada a proteger e não pergunta. Pagar e fazer pedidos continuam sendo só seus (veja acima).

O agente reconhece esses botões pelas palavras, em inglês, alemão, grego, chinês, francês e espanhol: Enviar, Publicar, Excluir, Transferir e semelhantes, e um simples “Confirmar” ou “Sim” quando a página trata de um deles (um pop-up perguntando “Excluir esta publicação?”). “Entrar”, “Próximo”, “Salvar rascunho”, “Cancelar”, um botão de busca e o envio de um código para você mesmo (Reenviar código) não são bloqueados.

Ao chegar a um deles, ele para, encerra a vez dele e espera. Você vê “Quer pressionar “Excluir” em mail.example.com” nos mesmos lugares que as outras perguntas (a linha no painel do navegador e um cartão na conversa), com **Não permitir** e **Permitir**. A visualização ao vivo não se abre sozinha.

- **Permitir** avisa o agente que ele pode pressionar o botão agora. Isso libera um clique em um botão com as mesmas palavras, nesse site, nos próximos dois minutos; depois disso o agente pergunta de novo.
- **Não permitir** avisa o agente para não pressioná-lo. Ele continua sem isso, ou diz a você o que não conseguiu fazer. O cartão então mostra “Permitido” ou “Não permitido”.

Isso vem ativado de início. Para desativar, veja [Perguntar antes de enviar em sites com login ativo](/guide/web#ask-before-sending-on-signed-in-sites).

## Responder às perguntas em pop-up de uma página

Quando uma página abre um pop-up (um alerta, uma pergunta de sim ou não, um pedido de texto, ou “Sair desta página?”), ele aparece sobre a visualização ao vivo: o site, “diz” (ou “pergunta se deve sair”) e a mensagem. Só você responde: **OK** ou **Cancelar** (com um campo de texto para um pedido de texto), ou **Sair** ou **Hospedagem**. Se foi um passo do agente que o abriu, você recebe uma notificação, e o agente fica sabendo como você respondeu.

## Deixar uma sessão abrir um site neste computador ou na sua rede

Com [Manter as páginas longe desta máquina e da rede dela](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) ativado (como vem de início), as páginas não conseguem alcançar este computador nem outros dispositivos da rede dele. Quando um agente quer uma delas, por exemplo um site que você está criando e que roda neste computador (um servidor de desenvolvimento), ele pergunta antes: “Quer abrir localhost:3000, nesta máquina ou na rede dela”, com **Não permitir** e **Permitir nesta sessão**. Permitir deixa o navegador desta sessão abrir esse endereço daqui em diante, e o agente é avisado para abri-lo de novo.

Um endereço neste computador ou na rede dele que você digita por conta própria enquanto está no controle é permitido para a sessão do mesmo jeito. **Sites desta sessão**, no menu do navegador, lista o que você permitiu em “Permitido nesta máquina ou na rede dela”; o × ao lado de um o retira. O próprio Hydor nunca pode ser aberto pelo navegador.

## O menu do navegador

**Opções do navegador** (⋯) no painel abre um menu:

- **Abas**, quando mais de uma está aberta: escolha uma para mostrá-la. Quando uma página abre um link em uma nova aba, o agente continua nela.
- **Salvo na pasta da sessão**: os arquivos mais recentes que o navegador baixou; escolha um para abri-lo.
- **Perfil (trocar por outro reinicia o navegador)**: **Novo, sem logins**, ou um dos seus perfis. Ele aparece depois que você cria um perfil. Escolher outro fecha o navegador; ele abre no novo perfil na próxima vez que for usado.
- **Sites desta sessão**: sites que o navegador desta sessão só pode visitar (**Somente estes sites**, qualquer site quando vazio) e sites que ele nunca visita (**Nunca estes sites**), um por linha. Eles se somam às listas em Configurações → Navegador. Pressione **Salvar** para guardá-los.
- **Fechar o navegador**.

## Abrir o navegador por conta própria

Você pode abrir o navegador de uma sessão antes do agente, por exemplo, para entrar em um site antes de pedir que ele trabalhe lá. Abra o menu da sessão (⋯) → **Mais** → **Abrir um navegador**. O painel aparece acima da caixa de mensagem: pressione **Assumir** e use-o. Quando o navegador já está aberto, o mesmo item aparece como **Mostrar o navegador**. Se o navegador estiver desativado em Configurações, você é avisado. Para um navegador só seu, sem ligação com uma sessão, veja [Seu próprio navegador](/guide/web#your-own-browser).

## Downloads e uploads

Os arquivos que uma página baixa são salvos na pasta da sessão, em uma pasta chamada downloads, e o agente é informado de onde eles foram parar. O menu do navegador lista os mais recentes em **Salvo na pasta da sessão**.

Um agente só pode anexar arquivos ao campo de upload de uma página a partir da pasta da sessão. Para que ele envie outro arquivo, copie esse arquivo para essa pasta primeiro (veja [Sistema: arquivos, Git, Terminal e Preview](/guide/files-git)).

## Quando o navegador fecha

O navegador de uma sessão fecha sozinho:

- quando ninguém o usa nem o observa por 15 minutos, ou por duas horas enquanto ele espera por você ou você está no controle;
- quando a última aba é fechada;
- quando o agente da sessão para de executar, ou a sessão é excluída;
- quando você escolhe outro perfil para ele, ou exclui o perfil que ele usa.

Tudo o que ainda estava esperando por você termina junto com ele. O agente abre o navegador de novo quando precisar dele outra vez.

No app para desktop, o navegador de um agente não precisa da janela do app: ele continua funcionando com a janela fechada ou oculta, desde que o app esteja em execução (ele fica na barra de menus, na área de notificação ou na bandeja). Abra a janela e as páginas dele estarão lá para você acompanhar.

## Seu próprio navegador

A página **Navegador** é um navegador só seu dentro do app para desktop (Mac, Windows, Linux), ao lado do que os agentes usam: abra **Navegador** na barra de ícones ou acesse [Navegador](/browser). Ela faz parte apenas do app para desktop: o app web em um navegador e o celular não têm o botão **Navegador**, e o endereço [Navegador](/browser) nesses casos avisa isso. Os navegadores dos agentes funcionam em qualquer lugar, e você pode acompanhá-los nas sessões deles.

Ela tem uma barra no alto com uma caixa que pesquisa, abre e pergunta a um agente ou diz a ele o que fazer sobre a página; uma coluna com suas abas, com os sites que você fixou e os agentes em ação, à esquerda da página; e, à direita, uma coluna, com a largura que você arrastar, para perguntar a um agente sobre a página ou dizer a ele o que fazer nela, para a conversa de um agente e para o histórico, os downloads, os favoritos, as extensões e as configurações. Ela tem voltar, avançar e recarregar, favoritos, histórico, extensões do Chrome, um bloqueador de anúncios e rastreadores (com um escudo na barra de endereço) que também oculta avisos de cookies, localizar na página, zoom, impressão e downloads. Ela também tem [abas privadas](/guide/web#private-tabs) que esquecem tudo quando você as fecha, [tradução de uma página](/guide/web#translate-a-page) para o seu idioma, [modo de leitura](/guide/web#reader-view) para artigos, [páginas escuras](/guide/web#dark-pages), [capturas de tela e como salvar uma página como PDF](/guide/web#screenshots-and-pdfs), e sites que não podem tocar som sozinhos. Ao apontar para um link, uma pequena caixa no canto inferior esquerdo da página mostra para onde ele vai (no canto inferior direito enquanto o mouse está lá), como no Chrome. As abas dela são páginas reais na janela do app, com a velocidade e as teclas de qualquer navegador, e se conectam diretamente aos sites, como em qualquer navegador. Um menu ou uma caixa de diálogo do app que abre sobre a página a tira de vista por um momento (uma imagem dela aparece até que seja fechado). Ela mantém suas contas conectadas entre uma visita e outra, em um perfil próprio que nenhum agente pode escolher, e abre de novo com as abas que você tinha (até 30; as em branco e as privadas ficam de fora). Suas abas também podem abrir endereços neste computador e na rede dele (um site que você está criando, por exemplo). Se o navegador não consegue iniciar, a página explica o motivo, com **Tentar de novo** e **Configurações do navegador**, que abre [Configurações → Navegador](/settings?s=browser).

### A barra e a caixa

Uma barra percorre o topo da página. Na esquerda, sobre a coluna de abas, ficam o logotipo do app, **Nova aba** (+) e **Ocultar abas** (o mesmo que Ctrl+B), que recolhe a coluna de abas até que **Mostrar abas** a traga de volta. O resto da barra é para a página em que você está:

- **Voltar**, **Avançar**, **Recarregar** e **Início** ficam à esquerda da caixa. Enquanto uma página carrega, Recarregar vira **Parar**. **Início** abre a sua página inicial na aba em que você está, como **Nova aba** faz em uma nova.
- A caixa do meio é a barra de endereço. Em repouso, ela mostra o endereço da página como o site dela, com o resto do endereço em uma cor mais clara, e o lembrete **Ctrl+L**. Clique nela, ou pressione Ctrl+L, e ela mostra o endereço inteiro para você alterar. O que você digita ali permanece enquanto você está em outro app; um clique na página recoloca o endereço. Digite um endereço, com ou sem https:// (`example.com`, `localhost:3000`, `192.168.1.5`, um endereço `file://`), e pressione **Enter** para abri-lo. Qualquer outra coisa que você digitar é pesquisada com o seu mecanismo de busca (o Google no início; veja [Configurações do navegador](/guide/web#browser-settings)), e um atalho como `yt` seguido de um espaço antes das suas palavras pesquisa naquele site (veja [Sugestões](/guide/web#suggestions)). **Alt+Enter**, ou Ctrl+Enter (⌘+Enter no Mac), abre o resultado em uma nova aba (uma privada, quando você está em uma aba privada). O que ela oferece enquanto você digita está em [Sugestões](/guide/web#suggestions). O cadeado fica à esquerda (em uma aba privada, um selo roxo **Privado** vem primeiro: veja [Abas privadas](/guide/web#private-tabs)). À direita ficam um escudo que conta os anúncios e rastreadores bloqueados em uma página web (veja [Bloquear anúncios e rastreadores](/guide/web#block-ads-and-trackers)), um botão que traduz a página quando ela está em outro idioma que não o seu (veja [Traduzir uma página](/guide/web#translate-a-page)), um botão de livro para o modo de leitura quando a página tem um artigo, com **Aa** ao lado enquanto ele está ativado (veja [Modo de leitura](/guide/web#reader-view)), e a estrela.
- A estrela no fim da caixa adiciona a página aos favoritos na barra de favoritos; preenchida, a página está nos favoritos, e pressioná-la de novo tira o favorito. Os sites da barra aparecem como blocos no topo da coluna de abas.
- **Salvar** guarda em um projeto uma cópia legível da página, como um modo de leitura a mostra: o texto do artigo com suas imagens e vídeos, sem os menus, anúncios, comentários e scripts do site. Uma nota diz “Salvo em” e o nome do projeto (“Salvo em Arquivos de Tese”), com **Abrir**: a cópia é uma página web entre os arquivos do projeto, na aba **Arquivos** dele (veja [Arquivos](/guide/projects#files)). O **▾** ao lado de Salvar (**Escolha um projeto para salvar**) lista para onde ela pode ir: **Nenhum projeto** e cada um dos seus projetos. O lugar que Salvar usa fica marcado nesse menu: o que você escolheu por último neste computador (**Nenhum projeto** no início). Sem projeto, a nota diz “Salvo. Escolha um projeto ao lado de Salvar para guardar cópias nos arquivos dele.”: a cópia fica sem projeto, e a caixa de busca (Ctrl+K) a encontra. Suas listas (favoritos, páginas para ler depois, downloads, histórico e destaques) são painéis desta página, no **Menu** (⋯) (veja [A coluna ao lado da página](/guide/web#the-column-beside-the-page)).
- **Perguntar** abre a coluna ao lado da página, onde você pergunta a um agente sobre ela ou escolhe **Fazer** para que um agente trabalhe nela (veja [Perguntar ao lado da página](/guide/web#ask-beside-the-page)); ele fica aceso enquanto essa coluna está lá.
- Os botões das extensões que você fixou vêm em seguida, depois **Extensões** (a peça de quebra-cabeça), que lista todas as extensões ativadas e, quando a aba aberta é uma página da Chrome Web Store de uma extensão, **Adicionar ao Hydor** (veja [Extensões do Chrome](/guide/web#chrome-extensions)).
- **Menu** (⋯) tem **Nova aba privada** (veja [Abas privadas](/guide/web#private-tabs)), depois o que você faz com a página: **Localizar na página**, **Traduzir página…** (**Mostrar original** enquanto a página está traduzida; veja [Traduzir uma página](/guide/web#translate-a-page)), **Modo de leitura** e **Páginas escuras** (marcados enquanto estão ativados; veja [Modo de leitura](/guide/web#reader-view) e [Páginas escuras](/guide/web#dark-pages)), e **Zoom**, com − e + e o zoom em porcentagem entre eles (veja [Zoom, impressão e tela cheia](/guide/web#zoom-print-and-full-screen)). Depois **Imprimir…** e **Captura de tela ou PDF**, que mostra **Captura de tela do que você vê**, **Captura de tela da página inteira** e **Salvar como PDF…** no lugar do menu (**Captura de tela ou PDF** no topo volta ao menu; veja [Capturas de tela e PDFs](/guide/web#screenshots-and-pdfs)). Depois as suas listas: **Histórico**, **Downloads**, **Favoritos**, **Ler depois** (com quantas páginas esperam; veja [Ler depois](/guide/web#read-later)) e **Destaques** (com quantos a página tem). Por último, o próprio navegador: **Extensões**, **Permissões do site**, **Configurações** e **Atalhos de teclado**. As listas e estes abrem na coluna à direita da página (veja [A coluna ao lado da página](/guide/web#the-column-beside-the-page)). O menu continua aberto enquanto você pressiona − e + do zoom. Em uma aba privada, **Perguntar** fica esmaecido: os agentes nunca recebem uma aba privada.

Um link para `/browser?url=https://example.com` abre a página Navegador com esse endereço em uma nova aba, e [/browser?private=1](/browser?private=1) abre uma nova aba privada (acrescente `&url=https://example.com` para abrir esse endereço nela).

### Sugestões

Enquanto você digita na barra de endereço, uma lista embaixo dela oferece, com as palavras que você digitou em negrito:

- suas abas abertas (“Ir para a aba”: escolha uma para ir até ela em vez de abrir a página de novo; suas abas privadas estão entre elas enquanto estão abertas, e nada sobre elas é guardado depois),
- seus favoritos e as páginas do seu histórico que correspondem às palavras nos títulos e endereços, as que você visita com frequência e recentemente primeiro (endereços que você mesmo digitou contam mais, e um favorito conta como vinte visitas). Quando favoritos correspondem às palavras que você digitou, pelo menos dois deles sempre estão entre as páginas oferecidas, no lugar das últimas páginas do seu histórico, de modo que um histórico grande, como um trazido de outro navegador, nunca os esconda,
- com a [Busca por significado](/settings?s=memory&find=Search%20by%20meaning) ativada, favoritos e páginas do seu histórico que tratam do que você digitou mesmo quando os títulos e endereços não contêm as palavras, depois dos que contêm (eles aparecem sem palavras em negrito). O modelo que os encontra roda neste computador, a partir de um vetor feito do título e do endereço de cada página (sem a query string) e guardado no banco de dados do app, separado de todo o resto; ele some quando a página some,
- quando o que você digitou começa com um dos seus atalhos de busca e um espaço (`yt lofi`), antes de tudo uma linha que pesquisa esse site pelas palavras que vêm depois (“Pesquisar “lofi” no YouTube”), o que **Enter** faz (veja [Configurações do navegador](/guide/web#browser-settings)),
- o que você digitou, como uma pesquisa (“Pesquisar no Google”) ou, quando parece um endereço, como esse endereço; com um atalho na frente, essa linha ainda pesquisa todas as suas palavras com o seu mecanismo de busca,
- as sugestões do próprio mecanismo de busca, quando [Sugestões de pesquisa](/guide/web#browser-settings) está ativado,
- abaixo delas, quando a aba aberta é uma página web (e não uma aba privada, que os agentes nunca recebem), **Perguntar sobre esta página: “…”**, que abre Perguntar ao lado da página com o que você digitou como pergunta. Enquanto **Fazer** está escolhido em Perguntar, a linha diz **Fazer isso nesta página: “…”**, e dá a um agente o que você digitou para fazer ali (veja [Fazer na página](/guide/web#do-it-on-the-page)),
- por último, **Perguntar a um agente: “…”**, que começa uma sessão com o que você digitou como primeira mensagem, no agente e no modelo que a tela inicial usou por último, e leva você até ela.

A lista mostra quantas couberem na tela, com pelo menos duas das suas páginas e duas sugestões do mecanismo entre elas quando houver tantas. Quando a lista precisa ser cortada para caber em uma janela baixa, as páginas do seu histórico saem antes dos seus favoritos e das abas abertas. As setas do teclado percorrem a lista e **Enter** abre a marcada (o que você digitou, quando nenhuma está marcada); **Alt+Enter**, ou Ctrl+Enter (⌘+Enter no Mac), abre em uma nova aba (uma privada, quando você está em uma aba privada). A barra de endereço também completa no próprio lugar: quando algo que você visitou começa com o que você digitou, o resto aparece selecionado depois do cursor (encontrado pelas palavras que você digitou, nunca por significado), e **Tab** ou **→** o aceita. Apagar o que você digitou desativa a conclusão. **Shift+Delete** em uma sugestão do histórico esquece essa página, e **Esc** fecha a lista.

### A coluna de abas

A coluna à esquerda da página lista, de cima para baixo (**Ocultar abas**, ou Ctrl+B, a recolhe):

- **Sites fixados**: os itens da sua barra de favoritos como blocos, cinco por linha e no máximo duas linhas (um bloco **…** lista o restante). Clique em um para abri-lo na aba aberta; Ctrl+clique (⌘+clique no Mac) ou um clique com o botão do meio o abre em uma nova aba. Uma pasta abre uma lista do que há nela. Clique com o botão direito em um bloco para ver **Abrir**, **Abrir em uma nova aba**, **Editar** (**Renomear** para uma pasta) e **Excluir**. Sem nada na barra de favoritos, não há blocos; a estrela coloca a página lá (veja [Favoritos](/guide/web#bookmarks)).
- **Agentes trabalhando**, enquanto um agente está com um navegador aberto: uma linha para cada um, com seu ícone e um ponto (azul enquanto trabalha, âmbar quando espera por você ou quando você assume o controle), o título da sessão e o que ele está fazendo. Clique em uma para vê-lo (veja [Agentes trabalhando](/guide/web#agents-at-work)). A seta dela recolhe a lista.
- **Privado**, enquanto você tem abas privadas abertas: uma seção roxa com uma máscara e a quantidade de abas, e uma linha para cada aba privada (uma linha com fundo colorido, com uma pequena máscara no ícone). Clique no rótulo para recolher a seção; **Fechar abas privadas** (×, quando você aponta para o rótulo) fecha todas elas, e **Nova aba privada**, no fim da seção, abre outra (veja [Abas privadas](/guide/web#private-tabs)). As abas privadas não ficam em nenhum grupo e não podem ser arrastadas para um.
- **Abas**: uma linha para cada aba, com seu ícone, título, **⋯** e **×** (na aba aberta e na aba para a qual você aponta). Um título comprido demais para a coluna some aos poucos no fim e rola para mostrar o restante enquanto você aponta para a linha. A aba aberta é a linha marcada; clique em uma linha para mostrar essa aba, e um clique com o botão do meio a fecha. Clique com o botão direito em uma linha, ou pressione o **⋯** dela, para abrir o menu da aba (veja [Grupos de abas e o menu da aba](/guide/web#tab-groups-and-the-tab-menu)). As abas que você coloca em um grupo ficam sob o cabeçalho do grupo, e o botão de brilhos no fim do rótulo **Abas** agrupa suas abas com IA. Uma aba que toca som mostra um alto-falante: clique nele para silenciar a aba e clique de novo para ouvir. Uma aba silenciada mantém o alto-falante. **Nova aba**, no fim, abre sua página inicial. Fechar a última aba deixa uma aba em branco.
- **Ler depois**, abaixo das abas: as páginas que você deixou de lado (veja [Ler depois](/guide/web#read-later)), das mais recentes às mais antigas, cada uma com seu ícone e título, e o número de páginas à espera. Ela fica recolhida enquanto nada espera; a seta a abre. Clique em uma linha para abrir essa página em uma nova aba. Aponte para uma linha para ver **Marcar como lida** (ela sai da lista) e **Remover**. **Mostrar lidas**, no fim, traz de volta as páginas que você já leu (**Ocultar lidas** as guarda de novo).

### Grupos de abas e o menu da aba

Clique com o botão direito em uma aba (ou pressione o **⋯** em uma linha para a qual você aponta, ou a tecla de menu em uma linha com foco) para abrir o menu dela:

- **Fechar aba**, **Fechar outras abas** e **Fechar abas abaixo** (as abas abaixo dela na coluna, na ordem em que estão listadas). Seu navegador sempre mantém uma aba aberta.
- **Duplicar** abre o mesmo endereço em uma nova aba ao lado, no mesmo grupo, e a mostra (a cópia de uma aba privada também é privada). **Recarregar** recarrega essa aba, não apenas a que você tem aberta.
- **Copiar endereço**, **Copiar como link em Markdown**, que copia um link para a página em Markdown, com o título como texto, para um documento ou uma mensagem (um aviso diz “Copied a Markdown link”), e **Favoritar** (**Remover o favorito** quando ela já está favoritada), que coloca a página na barra de favoritos.
- **Adicionar ao grupo**, que lista seus grupos (o grupo em que a aba está aparece marcado) e **Novo grupo…**, que cria um grupo com a aba e abre o nome dele para você digitar; e **Remover do grupo**. O menu de uma aba privada não tem nenhum dos dois: abas privadas não podem ser agrupadas.

Um grupo mantém juntas as abas que combinam. Ele tem um nome, uma de sete cores (cinza, azul, verde, âmbar, laranja, vermelho ou roxo) e fica aberto ou recolhido. Na coluna, é um cabeçalho com sua cor, seu nome (“Grupo sem nome” até você dar um) e quantas abas ele tem; as abas dele ficam abaixo, com uma linha na cor do grupo ao lado, e as abas que não estão em nenhum grupo vêm depois dos grupos. Clique no cabeçalho para recolher o grupo ou abri-lo de novo; um grupo recolhido oculta suas abas, exceto a que você tem aberta. Clique duas vezes no nome (ou pressione F2) para renomeá-lo. Você pode arrastar uma aba até um grupo para colocá-la nele, e até as abas sem grupo para tirá-la dele. Clique com o botão direito no cabeçalho, ou pressione o **⋯** dele, para abrir o menu do grupo:

- **Renomear** e **Cor**.
- **Nova aba no grupo** abre sua página inicial em uma nova aba dentro dele.
- **Desagrupar** desfaz o grupo e deixa suas abas onde estão.
- **Fechar grupo** fecha o grupo e todas as suas abas.

Um grupo sem nenhuma aba deixa de existir. Os grupos são guardados com suas abas, então voltam com elas quando o navegador abre de novo. No celular, as abas são uma lista na barra, sem grupos.

### Agrupar minhas abas com IA

Quando você tem muitas abas abertas, o botão de brilhos no fim do rótulo **Abas** (**Agrupar minhas abas com IA**; ele aparece quando você aponta para o rótulo) organiza as abas que não estão em nenhum grupo de acordo com a finalidade delas. São necessárias pelo menos três; as abas que já estão em um grupo ficam onde estão, e as abas privadas ficam de fora: nunca são contadas, nunca são agrupadas e nunca são enviadas a lugar nenhum.

**O que é enviado, e para qual modelo.** Somente quando você pressiona o botão, o título e o endereço de cada uma dessas abas (até 60) vão para o modelo auxiliar do app, aquele que escreve os títulos das sessões e as notas da Memória ([Configurações → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)). No Automático, é o Claude Haiku pelo Claude Code, ou então o Codex, ambos online; um modelo seu neste computador mantém os dados aqui. Um endereço vai sem nada depois de um **?** ou **#**, e o endereço de um arquivo vai apenas com o nome dele. O texto e as imagens das páginas nunca são enviados, e nada é enviado em nenhum outro momento. Se algum título for privado, não pressione o botão (ou coloque um modelo neste computador como modelo auxiliar).

O modelo responde com grupos de abas, cada um com um nome curto e uma cor, e o app os cria na hora. Uma mensagem diz quantos grupos foram criados, com **Desfazer**, que devolve as abas ao estado anterior. Se nenhuma aba combina com outra, o app avisa e não muda nada. Os agentes nunca veem suas abas, e o app não permite que eles usem este recurso.

### A coluna ao lado da página

À direita da página há uma coluna, mostrada somente quando há algo nela, com um destes itens por vez: **Perguntar** sobre a página, ou pedir a um agente que faça algo nela (veja [Perguntar ao lado da página](/guide/web#ask-beside-the-page)); a conversa de um agente, enquanto você acompanha a aba dele (veja [Agentes trabalhando](/guide/web#agents-at-work)); ou o painel de **Histórico**, **Downloads**, **Favoritos**, **Ler depois**, **Importar favoritos e histórico**, **Destaques**, **Extensões**, **Permissões do site**, **Configurações**, **Atalhos de teclado** ou as estatísticas do **Bloqueador de anúncios**. Cada um tem um **×** para fechar, e escolher outro substitui o atual. Nada fica sobreposto à página: ela fica mais estreita para abrir espaço e volta a ficar larga quando a coluna fecha. Os endereços [Histórico](/browser?panel=history), [Downloads](/browser?panel=downloads), [Favoritos](/browser?panel=bookmarks), [Ler depois](/browser?panel=later), [Importar favoritos e histórico](/browser?panel=import), [Destaques](/browser?panel=highlights), [Extensões](/browser?panel=extensions), [Permissões do site](/browser?panel=permissions), [Configurações](/browser?panel=settings), [Atalhos de teclado](/browser?panel=shortcuts) e [Bloqueador de anúncios](/browser?panel=adblock) abrem a página do Navegador com esse painel.

Arraste a borda esquerda da coluna para deixá-la mais larga ou mais estreita (ou foque a borda e pressione **←** ou **→**); um clique duplo volta à largura habitual, 400 px. A largura é uma só para tudo o que a coluna mostra, fica guardada neste dispositivo, nunca fica abaixo de 340 px e sempre deixa para a página pelo menos 360 px. Em uma janela estreita, as abas são uma lista na barra, e a coluna é uma folha sobre a página, com largura própria.

### Perguntar ao lado da página

**Perguntar** na barra (ou **Perguntar sobre esta página: “…”** na lista da caixa, ou **Perguntar a um agente sobre** no menu de clique com o botão direito) abre a coluna para a aba em que você está. No topo há uma chave, **Perguntar** ou **Fazer**; a que você escolher fica guardada neste dispositivo.

Com **Perguntar**, escreva o que você quer saber, ou pressione **Resumir**, **Pontos principais** ou **Explicar de forma simples**, e depois **Perguntar** (**Ctrl+Enter**, ⌘+Enter no Mac). A linha sob a caixa diz qual agente e qual modelo respondem: os que a página inicial usou por último. Uma nova sessão começa com uma cópia da página como ela está agora (veja [Perguntar sobre esta página](/guide/web#ask-about-this-page)), e a conversa dela preenche a coluna, para você continuar perguntando ali. A nota dela termina com “Pick Do to have an agent work in the page.”

Com **Fazer**, escreva o que um agente deve fazer nesta página (“preencha o formulário com meus dados”) e pressione **Fazer isso** (**Ctrl+Enter**, ⌘+Enter no Mac). A linha do agente sob a caixa é um botão que escolhe **Claude Code** ou **Custom** (os únicos dois que podem ficar restritos a uma só aba; o que a página inicial teve por último, Claude Code no início), com o modelo que a página inicial teve por último para ele. A nota diz o que o agente recebe: uma aba só dele, com os seus logins neste site e apenas o navegador, e ele pergunta antes de enviar, publicar, excluir ou pagar (veja [Fazer na página](/guide/web#do-it-on-the-page)). Quando ele começa, a aba do agente aparece no lugar da página e a conversa dele preenche a coluna, como em [Agentes trabalhando](/guide/web#agents-at-work).

Nos dois casos, as palavras que você selecionou na página e enviou com **Perguntar a um agente sobre** aparecem acima da caixa e vão junto com seu pedido (até 4.000 caracteres delas); o mesmo vale para uma imagem enviada com **Perguntar sobre esta imagem** (veja [Menu de clique com o botão direito](/guide/web#right-click-menu)), que também aparece acima da caixa, com perguntas rápidas como **Descrever esta imagem** em Perguntar.

Cada aba tem sua própria conversa: troque de aba e a coluna mostra a conversa dessa aba. **Abrir como sessão** leva você a ela entre as suas sessões. **Nova pergunta** (**Novo pedido** depois de um Fazer) esquece a conversa desta aba aqui (a sessão continua existindo) para você perguntar de novo. Depois de um Fazer, volte às suas abas e Perguntar para essa aba mostra a conversa com **Ver trabalhando**, que mostra de novo a aba do agente no lugar da página. Funciona em páginas de sites (Perguntar também em arquivos). A linha da página na barra de endereços acompanha a chave (veja [Sugestões](/guide/web#suggestions)).

### Atalhos de teclado

Na página do Navegador, também de dentro de uma página, com Ctrl no Windows e no Linux e ⌘ no Mac:

- **Ctrl+T** abre uma nova aba, e **Ctrl+W** fecha a aberta.
- **Ctrl+Shift+T** reabre a aba que você fechou por último; pressione de novo para a anterior (as abas privadas não entram nessa lista).
- **Ctrl+Shift+N** abre uma nova aba privada (**⇧⌘N** no Mac).
- **Ctrl+Tab** vai para a próxima aba e **Ctrl+Shift+Tab** para a anterior. **Ctrl+1** a **Ctrl+8** vão para a aba correspondente, e **Ctrl+9** para a última.
- **Ctrl+L** vai para a barra de endereços.
- **Ctrl+R** (**F5** também) recarrega.
- **Alt+←** e **Alt+→** voltam e avançam (**⌘[** e **⌘]** também no Mac).
- **Ctrl+F** abre a busca na página, e **Esc** a fecha.
- **Ctrl+D** favorita a página.
- **Ctrl+H** abre o histórico, e **Ctrl+J** os downloads.
- **Ctrl+B** recolhe a coluna de abas e a traz de volta. Arraste a borda dela para deixá-la mais larga ou mais estreita: ela mantém a largura que todas as colunas do app compartilham.
- **Ctrl+P** imprime a página.
- **Menu** (⋯) → **Atalhos de teclado** lista essas teclas na coluna à direita da página, por grupo: abas, a página, a barra de endereços, suas listas e agentes ([Atalhos de teclado](/browser?panel=shortcuts)).
- **Ctrl+Shift+Delete** abre as configurações em **Limpar dados de navegação**.
- **Ctrl** com **+**, **−** e **0** aumentam o zoom, diminuem o zoom e voltam a 100 % (veja [Zoom, impressão e tela cheia](/guide/web#zoom-print-and-full-screen)).

### Localizar em uma página

**Ctrl+F**, ou **Localizar na página** no menu, abre uma barra sob a barra de endereços. Digite, e a primeira ocorrência é encontrada e levada à vista quando você faz uma pausa. **Enter** vai para a próxima ocorrência e **Shift+Enter** para a anterior (as setas também), e a barra diz em qual ocorrência você está (“3 of 12”, “1000+” acima de mil) ou “No matches”. Maiúsculas e minúsculas não importam, a menos que você pressione **Diferenciar maiúsculas de minúsculas**, e a busca recomeça do início ao chegar ao fim. **Esc**, ou **×**, fecha a barra e limpa o que foi encontrado.

### Zoom, impressão e tela cheia

- **Zoom**: **Ctrl** com **+** aumenta o zoom e **−** diminui, nos passos que o Chrome usa (25 % a 500 %). Ctrl e a roda do mouse também dão zoom, assim como **−** e **+** na linha **Zoom** do **Menu** (⋯), que continua aberto enquanto você os pressiona. **Ctrl+0**, a porcentagem nessa linha ou o chip abaixo devolvem o zoom ao **Zoom da página** das [Configurações do navegador](/guide/web#browser-settings) (100 % no início). Um site em que você mesmo muda o zoom mantém esse zoom enquanto o app está em execução. Um zoom diferente do zoom da página aparece como um chip no fim da barra de endereços, como “125%”: clique nele para voltar (o título dele diz “Back to 100 %”, ou o zoom da sua página).
- **Imprimir**: **Ctrl+P**, ou **Imprimir…** no menu ou no menu de clique com o botão direito, abre a caixa de impressão do seu computador para a página, com os fundos dela.
- **Tela cheia**: quando um vídeo ou uma página pede para ocupar a tela, a janela do app entra em tela cheia e a página a preenche. A saída própria da página (Esc) traz a janela de volta.

### Capturas de tela e PDFs

O **Menu** (⋯) → **Captura de tela ou PDF** tem três itens que guardam como arquivo a página em que você está, seja uma página da web ou um arquivo mostrado na aba:

- **Captura de tela do que você vê**: uma imagem da parte da página que aparece na aba.
- **Captura de tela da página inteira**: uma imagem da página de cima a baixo, por mais que ela role (até 16.384 pixels de altura; quando não for possível, você recebe o que vê).
- **Salvar como PDF…**: a página como PDF, com os fundos, como se você a imprimisse.

Uma captura de tela é um PNG. Ela é salva na sua pasta Downloads, com o nome do título da página seguido da data e da hora (“Example 2026-11-18 at 14.30.05.png”), e também vai para a área de transferência, para você colar direto em uma mensagem ou em um documento. Uma nota diz “Captura de tela salva em Downloads e copiada”, com **Mostrar na pasta**. Um PDF é salvo em Downloads, com o nome do título da página, com uma nota “Salvo como PDF em Downloads” e **Mostrar na pasta**. Se o nome já existir, ele ganha um número no fim, e nada é sobrescrito. Também funcionam em uma aba privada.

### Menu do botão direito

Um clique com o botão direito em uma página abre um menu com o que se aplica ao lugar em que você clicou, com o visual e o idioma do próprio app, como os outros menus (**Esc** ou um clique fora o fecha):

- Em um campo de texto: sugestões de correção para uma palavra escrita errada, com **Adicionar ao dicionário**; depois **Desfazer**, **Refazer**, **Recortar**, **Copiar**, **Colar** e **Selecionar tudo**.
- Em um link: **Abrir link em nova aba**, **Abrir link em aba privada** (veja [Abas privadas](/guide/web#private-tabs)), **Abrir link no seu navegador padrão**, **Copiar endereço do link** e **Ler link depois** (veja [Ler depois](/guide/web#read-later)).
- Em uma imagem: **Abrir imagem em nova aba**, **Salvar imagem como…** (na sua pasta Downloads), **Salvar imagem em** *o projeto que o Salvar usa* (apenas **Salvar imagem** enquanto nenhum projeto estiver escolhido), **Perguntar sobre esta imagem**, **Copiar imagem** e **Copiar endereço da imagem**.
- Em um vídeo: **Reproduzir** ou **Pausar**, **Silenciar** ou **Reativar som**, **Repetir** e **Mostrar controles** (marcados enquanto estiverem ativos), **Imagem em imagem** (marcado enquanto aparece), **Abrir vídeo em nova aba**, **Salvar vídeo como…** (na sua pasta Downloads) e **Copiar endereço do vídeo**. Um áudio tem os mesmos itens, como **Abrir áudio em nova aba**, **Salvar áudio como…** e **Copiar endereço do áudio**, sem imagem em imagem. Um item só aparece quando aquele vídeo ou áudio pode fazer isso.
- Com texto selecionado: **Copiar**, **Pesquisa** com o seu mecanismo de busca para ele (abre em uma nova aba) e **Perguntar a um agente sobre** ele, que abre o **Perguntar** ao lado da página com as palavras selecionadas (até 4.000 caracteres delas) e o endereço da página prontos para ir com a sua pergunta (veja [Perguntar ao lado da página](/guide/web#ask-beside-the-page)), **Traduzir “…”**, que mostra as palavras traduzidas para o seu idioma em uma caixa (veja [Traduzir uma página](/guide/web#translate-a-page)), e **Destacar**, que marca as palavras na página e as guarda (veja [Destaques](/guide/web#highlights)).
- Em um destaque seu: **Remover destaque**.
- Na própria página, longe de um campo ou de um texto selecionado: **Voltar**, **Avançar** e **Recarregar**, e **Traduzir para alemão** (o idioma para o qual você traduz; **Mostrar original** enquanto a página está traduzida).
- Sempre: **Favoritar esta página**, **Ler esta página depois** (em uma página da web), **Imprimir…** e **Inspecionar**, que abre as ferramentas de desenvolvedor da página.

Em uma aba privada, o menu não tem **Abrir link em aba privada**, **Abrir link em nova aba** e os outros itens “em nova aba” abrem uma aba privada, e nenhum dos itens de **Perguntar** (**Perguntar a um agente sobre**, **Perguntar sobre esta imagem**) aparece, já que os agentes nunca têm acesso a uma aba privada.

**Salvar imagem em** *um projeto* lê a imagem com as próprias credenciais de login da aba, então uma imagem atrás de um login funciona, e a guarda no projeto escolhido ao lado de **Salvar** (em seus **Arquivos**, com a página como origem), ou sem projeto. Uma nota diz “Salvo nos arquivos de Thesis” (ou “Imagem salva”), com **Abrir** (ou “Essa imagem já está salva”, quando você a guardou antes). Ele guarda imagens PNG, JPEG, WebP, GIF e AVIF de até 50 MB; um bitmap ou um ícone vira PNG, e outros tipos, como SVG, são recusados. A imagem precisa ter um endereço http, https, data ou blob. Os agentes podem ler o que um projeto guarda, então guarde uma imagem ali somente quando isso não for um problema para você. **Perguntar sobre esta imagem** lê a imagem do mesmo jeito e abre o **Perguntar** ao lado da página com ela pronta para ir com a sua pergunta, junto com uma cópia da página.

Os itens próprios de uma extensão nunca são mostrados (veja [O que pode não funcionar](/guide/web#what-may-not-work)).

### Abas privadas

Uma aba privada é uma aba que esquece. Abra uma com **Ctrl+Shift+N** (**⇧⌘N** no Mac), **Menu** (⋯) → **Nova aba privada**, **Nova aba privada** no fim da seção **Privado** na coluna de abas, ou [/browser?private=1](/browser?private=1) (acrescente `&url=https://example.com` para abrir esse endereço nela). Em um link, clique com o botão direito → **Abrir link em aba privada**; em uma aba privada, esse item não aparece, e **Abrir link em nova aba** abre uma aba privada (assim como os outros itens “em nova aba”, **Pesquisa** para palavras selecionadas e **Alt+Enter** na barra de endereço).

Uma aba privada tem este aspecto:

- A linha dela fica na seção roxa **Privado** da coluna de abas, que diz quantas há. **Fechar abas privadas** (o × no fim do rótulo) fecha todas.
- Um chip roxo **Privado** fica no início da barra de endereço. Pressione-o para ver o que uma aba privada é e guarda, com **Fechar abas privadas**.

O que uma aba privada mantém separado e esquece:

- **Logins, cookies, dados de sites e arquivos em cache** ficam na memória, separados das suas outras abas: um site em que você está conectado em uma aba normal não reconhece você em uma privada, e vice-versa. Tudo isso é esquecido quando a última aba privada se fecha ou quando o app é encerrado.
- **Suas páginas não são guardadas** no seu [histórico](/guide/web#history), na lista **Fechadas recentemente** (**Ctrl+Shift+T** as ignora), nem entre as abas que reabrem na próxima vez que você iniciar o navegador. As abas que você fecha somem de vez.
- **As extensões não funcionam nela.** O bloqueador de anúncios e a ocultação de banners de cookies funcionam como em qualquer aba.
- As **Permissões** que um site pede (câmera, localização e semelhantes) são pedidas de novo a cada vez, e a sua resposta é esquecida quando a aba se fecha. Um site que você bloqueou nas abas normais continua bloqueado.
- **Os downloads são salvos** na sua pasta Downloads, mas não são adicionados à lista de downloads que a caixa de pesquisa (Ctrl+K) encontra.
- O que você pede explicitamente continua sendo guardado: **favoritos**, **Ler depois**, **destaques** e **Salvar** (em um projeto). Eles permanecem depois que a aba privada some e mostram a página, então peça por eles somente quando isso não for um problema para você.
- **Traduzindo** funciona em uma aba privada como em qualquer aba, então as palavras da página vão para o modelo auxiliar (veja [Traduzir uma página](/guide/web#translate-a-page)); deixe uma página privada sem traduzir se isso for importante.
- Uma aba privada não pode ser colocada em um grupo, e **Agrupar minhas abas com IA** nunca a conta nem a envia.
- **Os agentes nunca têm acesso a uma aba privada.** **Perguntar** fica esmaecido, a linha **Perguntar sobre esta página** (ou **Faça isso nesta página**) da barra de endereço e os itens **Perguntar a um agente sobre** e **Perguntar sobre esta imagem** do menu do botão direito não aparecem, e o servidor se recusa a copiar a página dela para um agente (veja [Entregar uma página a um agente](/guide/web#hand-a-page-to-an-agent)).

Fechar a última aba normal enquanto há abas privadas abertas deixa apenas as privadas; fora isso, o navegador sempre mantém uma aba aberta. As abas privadas dizem respeito apenas ao registro deste computador: os sites que você visita, o seu provedor de internet e a sua rede ainda podem ver aonde você vai, e um site em que você entra sabe quem você é.

### Traduzir uma página

Quando uma página está em um idioma diferente do que você lê, um botão de tradução (um pequeno ícone de **Idiomas**) aparece à direita da barra de endereço. Ele fica aceso enquanto a página está traduzida e pulsa enquanto a tradução está a caminho. Pressione-o:

- Ele diz em que idioma a página foi identificada (“Detectado: alemão”), o que o app descobre neste computador a partir das palavras da página e da sua própria marcação de idioma.
- **Traduzir para** é o idioma para o qual traduzir. No início, é o idioma do próprio app; escolher outro o guarda como sua preferência (ele também é **Traduzir para** nas [Configurações do navegador](/guide/web#browser-settings)), e uma página que já está traduzida é traduzida de novo para ele.
- **Traduzir** começa. Enquanto trabalha, a linha abaixo diz “Traduzindo… 12 de 40 partes”, e o botão vira **Mostrar original**, que coloca de volta cada palavra da página como era. Quando termina, a linha diz de que idioma foi traduzida e com qual modelo. Se não foi possível, a linha diz o motivo, e o botão passa a dizer **Tentar de novo**.
- **Sempre traduzir alemão** (para o idioma encontrado) traduz as páginas nesse idioma assim que carregam, daqui em diante. **Nunca traduzir alemão** faz o botão deixar de aparecer para ele. **Nunca traduzir example.com** (o site da página) faz o mesmo para esse site, seja qual for o idioma.
- **Configurações de tradução** abre as [Configurações do navegador](/guide/web#browser-settings) em **Tradução**.

O que está na tela é traduzido primeiro, depois o resto da página, e depois o que vier mais tarde, conforme você rola ou a própria página muda, para continuar no seu idioma. O layout, os links e as imagens da página continuam como estão: só as palavras mudam, no próprio lugar. Campos de texto, código e partes que um site marca como não traduzíveis são deixados em paz. Uma página muito longa é traduzida até cerca de 150.000 caracteres além do que está na tela.

Você também pode usar **Menu** (⋯) → **Traduzir página…** (**Mostrar original** enquanto ela está traduzida), que abre a mesma caixa sob o menu quando o botão não aparece, como em uma página que já está no seu idioma. Clique com o botão direito na página, longe de um link, de uma imagem ou de palavras selecionadas, e escolha **Traduzir para alemão** (o idioma para o qual você traduz) ou, enquanto ela está traduzida, **Mostrar original**. Selecione algumas palavras, clique com o botão direito e escolha **Traduzir “…”** para traduzir só essas (até 5.000 caracteres): uma caixa **Tradução** mostra as palavras com a tradução, uma escolha de **Traduzir para** para tentar outro idioma, e **Copiar**.

Os nomes dos idiomas, no botão e nas listas, estão no idioma do app, com o nome de cada idioma ao lado.

**O que é enviado e para qual modelo.** Traduzir envia as palavras da página, em partes, para o modelo auxiliar do app, o mesmo que escreve os títulos das sessões e as notas de memória ([Configurações → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)); as palavras que você seleciona para traduzir também vão para lá. No Automático, é o Claude Haiku pelo Claude Code, ou então o Codex, ambos online; um modelo seu neste computador mantém as palavras aqui. Imagens e logins nunca são enviados. Isso acontece quando você pressiona **Traduzir** ou os itens do menu e, para um idioma que você definiu como **Sempre traduzir**, por conta própria a cada página que carrega: se uma página tiver palavras que você quer manter privadas, não a traduza (ou coloque um modelo neste computador como auxiliar). Os agentes nunca veem nada disso e têm as rotas recusadas.

Uma página traduzida também aparece traduzida no [modo de leitura](/guide/web#reader-view).

### Modo de leitura

Em uma página que tem um artigo, como uma notícia, um post de blog ou uma receita, um botão de livro (**Modo de leitura**) aparece à direita da barra de endereço. Pressione-o e o artigo aparece sozinho sobre a página, em uma coluna limpa: o site, o título, o autor, quanto tempo leva para ler (“5 min de leitura”) e a data, depois o texto com as imagens, sem os menus, anúncios e comentários do site. Pressione o botão de novo (**Sair do modo leitura**) para voltar à página, ou escolha **Menu** (⋯) → **Modo de leitura**, que fica marcado enquanto ele está ativo. Abrir um link nele o encerra, como ir para qualquer outra página. Uma página sem artigo para mostrar não tem o botão (e o item do menu fica esmaecido; se uma página não tiver artigo, uma nota diz “Esta página não tem artigo para mostrar no modo de leitura”).

Com o modo de leitura ativo, **Aa** (**Estilo do modo leitura**) abre as opções de aparência do artigo:

- **Tamanho do texto**, com **Texto menor** e **Texto maior**: de 14 a 28 (19 no início).
- **Cores**: **Automático** (segue o visual claro ou escuro do app), **Escuro**, **Claro** ou **Sépia**.
- **Fonte**: **Com serifa** ou **Sem serifa**.

Uma mudança aparece na hora e vale para todos os artigos. As setas, **Page Down** e **Espaço** rolam o artigo. Nada sai da aba para isso: a página é lida onde está, e nenhum agente ou modelo é envolvido.

### Páginas escuras

**Menu** (⋯) → **Páginas escuras** (marcado enquanto está ativo), ou **Páginas escuras** nas [Configurações do navegador](/guide/web#browser-settings), mostra as páginas da web no modo escuro. Um site que tem um visual escuro próprio o usa, como faz quando o seu computador está no modo escuro; uma página sem ele é escurecida pelo modo escuro automático do próprio navegador, então os fundos claros ficam escuros e o texto fica claro. Ele começa desativado, vale para todas as abas ao mesmo tempo e não afeta os navegadores dos agentes.

Algumas páginas ficam estranhas escurecidas (imagens, gráficos, cores que tinham um significado). Para mostrar um site como ele é, clique no cadeado dele e desative **Páginas escuras neste site** (a chave aparece enquanto Páginas escuras está ativo). Esses sites ficam listados em **Sites mostrados como são** nas configurações do navegador, onde o × ao lado de um deles volta a mostrar aquele site escuro.

### Ler depois

Deixe uma página de lado para quando tiver tempo: abra o **Menu** (⋯) → **Ler depois** e pressione **Adicionar esta página** no topo do painel, ou clique na página com o botão direito e escolha **Ler esta página depois**, ou clique num link e escolha **Ler link depois**. Um aviso diz "Added to Read later"; uma página que já está na lista volta a ficar esperando, no topo. Enquanto a página em que você está espera na lista, o botão do painel mostra **Na sua lista**. Só páginas da web (http e https) podem ser deixadas de lado.

A lista aparece em dois lugares: na coluna de abas, como **Ler depois** (veja [A coluna de abas](/guide/web#the-tab-column)), e em um painel próprio na coluna ao lado da página: **Menu** (⋯) → **Ler depois** (o menu diz quantas páginas esperam), ou vá para [Ler depois](/browser?panel=later). Sob o título, o painel tem uma caixa, **Pesquisar na sua lista Ler depois**, que reduz a lista às páginas cujo título ou endereço contenham suas palavras. Das mais novas para as mais antigas, cada linha mostra o ícone do site, o título da página e, embaixo, o site e quando você a adicionou ("Added Today") ou a marcou como lida. Clique em uma linha, ou em **Abrir**, para abrir a página em uma nova aba. **Marcar como lida** a tira da lista; **Mostrar lidas** (exibido depois que você lê uma) traz de volta as páginas que você já leu, onde **Marcar como não lida** a devolve à espera, e **Ocultar lidas** as guarda de novo. **Remover** a esquece. Sem nada deixado de lado, o painel diz "Nothing set aside to read later".

Como os seus favoritos, a lista é só sua: os agentes nunca a veem e têm o acesso às rotas que a fornecem recusado.

### Histórico

Pressione **Ctrl+H**, ou **Menu** (⋯) → **Histórico**, ou vá para [Histórico](/browser?panel=history). O painel lista as páginas que você visitou no seu próprio navegador, das mais novas para as mais antigas, por dia ("Today", "Yesterday" e depois a data), cada uma com seu horário, ícone do site, título e endereço.

- A caixa de busca, **Pesquisar no histórico**, encontra páginas pelas palavras em seus títulos e endereços.
- Clique em uma página para abri-la na aba aberta, ou Ctrl+clique (⌘+clique no Mac) para abrir em uma nova aba. O **×** ao lado de uma página a tira do histórico. **Mostrar mais antigos** carrega mais.
- **Fechadas recentemente** (quando você não está pesquisando) lista as abas que você fechou há pouco: clique em uma para abri-la de novo. **Ctrl+Shift+T** abre a mais recente.
- **Limpar dados de navegação…** abre as configurações nessa parte.

Seu histórico fica neste computador, no banco de dados do próprio app, e só a sua navegação o alimenta: páginas da web e arquivos, a página em que cada aba termina e o título dela depois que se estabiliza. Páginas em [abas privadas](/guide/web#private-tabs) nunca são adicionadas, e uma aba privada que você fecha não aparece em **Fechadas recentemente**. As últimas 20.000 páginas são mantidas; as mais antigas saem primeiro. Os agentes nunca o veem. É nele que as [sugestões](/guide/web#suggestions) da barra de endereço se baseiam.

Para trazer o histórico dos seus outros navegadores, use **Importar** no pé do painel (aparece quando você não está pesquisando), como no painel de Favoritos. Ele lista os navegadores deste computador que têm histórico, os mesmos dos [favoritos](/guide/web#bring-in-bookmarks), com uma linha para cada perfil quando um navegador tem vários, cada uma com quantas páginas entrariam ("8,931 pages"). Pressione **Importar** e as últimas 20.000 páginas dele entram: cada uma mantém seu título, quando você a visitou pela última vez, quantas vezes, e quantas vezes você digitou o endereço dela, de modo que as [sugestões](/guide/web#suggestions) da barra de endereço as classificam como aquele navegador fazia. Páginas que você já tem ficam com a visita mais recente e as contagens maiores, então importar de novo não adiciona nada duas vezes. Seu histórico continua mantendo só as últimas 20.000 páginas, as mais antigas saindo primeiro, e tudo fica neste computador: os agentes nunca o veem. Um aviso diz "Brought in 8,931 pages" quando termina (ou "Your history has all of it already"), e o painel diz "No other browser with history was found on this computer." quando não há de onde importar.

Um navegador que bloqueia o histórico enquanto está aberto diz "Close Google Chrome, then try again: it locks its history while it is open"; feche-o e pressione **Importar** de novo. O Firefox pode ficar aberto. O Safari guarda o histórico onde o macOS o protege, como faz com os favoritos: até você permitir, a linha dele diz "Hydor may not read Safari’s history: allow it in System Settings → Privacy & Security → Full Disk Access". A linha dele mostra **Abrir Ajustes do Sistema** no lugar de **Importar**: ela abre Ajustes do Sistema → Privacidade e Segurança → Acesso Total ao Disco, onde você ativa o Hydor (adicione-o com **+** se ele não estiver na lista). Quando você volta ao Hydor, ele verifica de novo, e a contagem do Safari e **Importar** aparecem. Se ele ainda não conseguir ler o Safari, a linha acrescenta "Allowed it? macOS may want Hydor reopened first: quit Hydor and open it again."

Os arquivos que o seu navegador baixa também ficam em uma lista: o nome de cada um, onde foi salvo e o endereço de onde veio, os últimos 5.000. **Limpar dados de navegação** com **Histórico de navegação** marcado limpa essa lista também, para o mesmo período (os arquivos ficam onde foram salvos), e uma página, favorito ou download que sai leva junto o seu lugar na busca por significado. A caixa de busca (Ctrl+K) encontra seu histórico, favoritos e downloads, pelas palavras e pelo assunto deles, em **Navegador** em **Buscar em** (veja [Pesquise tudo com Ctrl+K](/guide/start#search-everything-with-ctrlk)). Os agentes nunca veem nada disso.

### Destaques

Marque palavras em uma página e elas continuam marcadas. Selecione algumas palavras, clique com o botão direito e escolha **Destacar**: elas são marcadas na hora, em um amarelo suave que também fica bem em páginas escuras, e guardadas. Cada vez que você abre aquela página de novo, as palavras são encontradas e marcadas, e outra vez pouco depois no caso de uma página que monta o conteúdo depois de carregar. Clique com o botão direito dentro de um destaque e escolha **Remover destaque** para tirá-lo. As palavras da própria página não são alteradas, apenas envolvidas, então copiar texto de uma página dá as mesmas palavras.

- Uma página é a mesma página seja o que for que venha depois do endereço: um `#fragment` ou parâmetros de rastreamento (`utm_…`, `fbclid` e semelhantes) não importam, e `http`, `https` e `www.` contam como um só. Cada destaque guarda suas palavras, um pouco do texto antes e depois delas (para achar o lugar certo quando as mesmas palavras aparecem duas vezes), o título da página, quando você o fez e, se você adicionar uma, uma nota.
- Uma página que tem destaques mostra uma pequena marca amarela em **Menu** (⋯), e **Menu** (⋯) → **Destaques** diz quantos são. Isso abre a coluna ao lado da página com os destaques dela, ou vá para [Destaques](/browser?panel=highlights). **Mostrar na página** rola até um deles, **Copiar** copia suas palavras, **Adicionar uma nota** (ou **Editar a nota**) escreve uma nota que aparece quando você aponta para o destaque na página, e **Excluir** o remove. **Perguntar a um agente sobre isto** começa uma sessão com o endereço da página e os destaques dela citados, com as suas notas.
- Palavras que não podem mais ser encontradas (a página mudou) continuam na lista e simplesmente não são marcadas. Um destaque comporta até 5.000 caracteres e uma página até 500 destaques. Palavras em um campo de texto e as partes ocultas de uma página não são marcadas. Nem as palavras em um frame dentro da página (outra página mostrada nela): ali o menu não tem **Destacar**. Palavras dentro dos componentes da própria página são marcadas como quaisquer outras.

Seus destaques ficam neste computador, no banco de dados do próprio app, e os agentes nunca os veem: as rotas deles recusam agentes. Eles chegam a um agente só quando você pressiona **Perguntar a um agente sobre isto**, e então só o endereço dessa página e os destaques dela vão.

### Configurações do navegador

**Menu** (⋯) → **Configurações**, ou [Configurações → Navegador → Sua própria navegação → Configurações do navegador](/settings?s=browser&find=Browser%20settings), ou [Configurações do navegador](/browser?panel=settings), abre um painel com:

- **Página inicial**: o endereço da web que o botão Início e as novas abas abrem (https://www.google.com/ no começo). **Usar a página atual** a define como a página em que você está.
- **Mecanismo de busca**: com o que a barra de endereço pesquisa: Google (no começo), DuckDuckGo, Bing, Brave, Ecosia, Startpage ou **Custom**, um endereço seu com %s no lugar das suas palavras, como `https://example.com/search?q=%s`.
- **Atalhos de pesquisa**: digite um atalho, um espaço e suas palavras na barra de endereço para pesquisar naquele site. Os padrões são `yt` (YouTube), `wiki` (Wikipédia), `gh` (GitHub), `scholar` (Google Scholar), `arxiv` (arXiv) e `hf` (Hugging Face). O × em um deles o remove. **Adicionar um atalho** pede um **Atalho** (uma palavra), um **Nome** e um **Endereço, com %s no lugar das suas palavras**, e depois **Adicionar** (ou **Cancelar**); pode haver 50. **Restaurar os padrões** aparece depois que você muda a lista. Na barra de endereço, `yt lofi` oferece primeiro "Search YouTube for “lofi”", e **Enter** faz a busca; a linha do que você digitou ("Search Google") ainda pesquisa todas as palavras com o seu mecanismo.
- **Sugestões de pesquisa** (ativadas no começo): o que você digita na barra de endereço vai para o seu mecanismo de busca enquanto você digita, como em qualquer navegador, para que ele possa sugerir pesquisas. O Startpage e um endereço personalizado não dão nenhuma. Desative para manter o que você digita neste computador; suas abas abertas, favoritos e histórico continuam aparecendo.
- **Anúncios** (veja [Bloqueie anúncios e rastreadores](/guide/web#block-ads-and-trackers)):
  - **Bloquear anúncios e rastreadores** (ativado no começo).
  - **Ocultar avisos de cookies** (ativado no começo; precisa de **Bloquear anúncios e rastreadores** ativado e fica esmaecido sem ele).
  - **Listas de filtros**: EasyList, EasyPrivacy, as listas do uBlock Origin, a lista de Peter Lowe e a Online Malicious URL Blocklist, mantidas atualizadas. A linha diz quando elas foram atualizadas e quantas regras o bloqueador tem ("Atualizadas há 2 horas · 307.000 regras"), e **Atualizar agora** as busca na hora.
  - **Listas para sites em outros idiomas**: no começo, a lista do idioma do próprio app (EasyList Germany quando o app está em alemão, AdGuard Japanese em japonês; nenhuma para inglês). **Adicionar um idioma** adiciona outra lista, entre cerca de 25 idiomas, e o × em uma delas a remove.
  - **Bloqueio mais rígido** (desativado no começo): adiciona a lista de anúncios da AdGuard. Ela pega mais anúncios, mas alguns sites podem precisar de anúncios permitidos.
  - **Ocultar incômodos** (desativado no começo): adiciona a lista de incômodos do uBlock Origin, que oculta pop-ups, caixas de newsletter, widgets de chat e de redes sociais e avisos de “abrir no app”. Alguns sites podem não funcionar como deveriam.
  - **Sites com anúncios permitidos**: os sites que você permitiu pelo escudo, cada um com um × para bloquear seus anúncios de novo. Aparece somente quando há algum.
  - **Estatísticas**: quantos anúncios e rastreadores foram bloqueados e desde quando, e **Mostrar** abre as estatísticas.
- **Tradução**, para [traduzir páginas](/guide/web#translate-a-page):
  - **Traduzir para**: o idioma para o qual as páginas são traduzidas. É o idioma do próprio app até você escolher outro.
  - **Oferecer tradução de páginas em outros idiomas** (ativado no começo): mostra o botão de traduzir na barra de endereço em uma página em outro idioma. Desativado, o botão aparece só em uma página que já está traduzida; **Menu** (⋯) → **Traduzir página…** continua funcionando.
  - **Sempre traduzir**: idiomas cujas páginas são traduzidas assim que carregam. **Adicionar um idioma** escolhe um; o × em um idioma o tira da lista.
  - **Nunca traduzir**: idiomas para os quais o botão nunca é mostrado. Um idioma fica em no máximo uma dessas duas listas.
  - **Nunca traduzir estes sites**: sites para os quais o botão nunca é mostrado e que nunca são traduzidos sozinhos ("No sites" até você adicionar um com **Nunca traduzir** na caixa de tradução); o × em um site o tira da lista.
  - Um aviso diz o que a tradução envia e para qual modelo.
- **Páginas**:
  - **Zoom da página** (100 % no começo; 50 % a 200 %): o tamanho das páginas, a menos que você mesmo dê zoom em um site. Um site em que você dá zoom (Ctrl com + ou −, Ctrl e a roda do mouse, o **Zoom** do menu) mantém o zoom enquanto o app estiver em execução; **Redefinir** (Ctrl+0, a porcentagem do menu, o chip da barra de endereço) o devolve ao zoom da página (veja [Zoom, impressão e tela cheia](/guide/web#zoom-print-and-full-screen)).
  - **Verificar ortografia** (ativado no começo): sublinha palavras escritas errado enquanto você digita, com sugestões no menu do botão direito.
  - **Páginas escuras** (desativado no começo): páginas sem visual escuro próprio são mostradas em cores escuras (veja [Páginas escuras](/guide/web#dark-pages)).
  - **Sites mostrados como são**: os sites para os quais você desativou **Páginas escuras neste site**, com um × para voltar a mostrar um deles escuro.
  - **Permitir que os sites toquem som sozinhos** (desativado no começo): desativado, o som de uma página espera até você clicar ou digitar nela, enquanto vídeos sem som continuam sendo reproduzidos; ativado, uma página pode iniciar o som na hora, como em navegadores mais antigos. Vale para as abas abertas depois que você muda.
- **Limpar dados de navegação**: marque **Histórico de navegação**, **Cookies e dados do site** (você sai dos sites) e **Arquivos em cache**, escolha um período (**Última hora**, **Últimas 24 horas**, **Últimos 7 dias** ou **Todo o período**) e pressione **Limpar dados**. O período vale só para o histórico (e a lista de downloads mantida com ele): cookies, dados de sites e arquivos em cache são sempre limpos de todo o período.

### Bloquear anúncios e rastreadores

O seu próprio navegador bloqueia anúncios e rastreadores, como faz um bloqueador de anúncios. Ele impede as solicitações a servidores de anúncios e de rastreamento, oculta os espaços vazios que eles deixam e as caixas marcadas como patrocinadas (também com as regras avançadas do uBlock Origin, as que encontram um anúncio pelas palavras ou pela forma), e dá à página substitutos inofensivos dos scripts de anúncios que bloqueia, para que uma página que verifica a presença deles continue funcionando. Ele também executa as pequenas correções de página do uBlock Origin em cada frame da página, antes dos scripts da própria página: é isso que remove os anúncios em vídeo do YouTube e neutraliza muitas mensagens do tipo “desative o seu bloqueador de anúncios”. Ele não bloqueia nada nos navegadores dos agentes e funciona em abas privadas. **Bloquear anúncios e rastreadores** nas [configurações do navegador](/guide/web#browser-settings) desativa o bloqueio.

As listas dele são as descritas em **Listas de filtros** nessas configurações. O app as busca com os seus criadores quando o navegador inicia pela primeira vez e busca cada uma de novo quando ela informa que expira: as correções rápidas do uBlock Origin, onde ficam as correções do YouTube, a cada 8 horas mais ou menos, e as outras a cada poucos dias; **Atualizar agora** faz isso na hora. Quando não é possível buscar uma lista, o bloqueador mantém a que já tem. Saem apenas as solicitações das listas, e nada sobre você ou sobre as páginas que você visita vai junto. As listas extras (**Listas para sites em outros idiomas**, **Bloqueio mais rígido** e **Ocultar incômodos**) ficam por sua conta ativar nas mesmas configurações.

**O escudo.** Em uma página da web, um escudo na barra de endereço mostra quantos anúncios e rastreadores foram bloqueados nela. Clique nele para ver:

- a contagem, dividida entre anúncios e rastreadores, e os hosts que foram bloqueados, cada um marcado como **Anúncio** ou **Acompanhamento** (googleads.g.doubleclick.net, por exemplo);
- o que foi bloqueado neste site no total, desde que o bloqueador começou a contar;
- **Bloquear anúncios neste site**, um interruptor. Desativado, ele permite anúncios neste site e em seus subdomínios, e a página é recarregada; ativado de novo, ele volta a bloqueá-los e recarrega a página. Use-o quando um site ainda perceber o bloqueador ou algo nele deixar de funcionar;
- **Estatísticas**, que abre as [estatísticas do bloqueador de anúncios](/browser?panel=adblock), e **Configurações**, que abre a parte **Anúncios** das [configurações do navegador](/guide/web#browser-settings).

Com o bloqueador desativado, a caixa do escudo diz **O bloqueador de anúncios está desativado**, com **Ativar**, que o ativa e recarrega a página.

**Estatísticas.** O [Bloqueador de anúncios](/browser?panel=adblock) (pelo botão **Estatísticas** do escudo, ou por **Configurações do navegador** → **Anúncios** → **Estatísticas** → **Mostrar**) exibe **Bloqueada**, **Anúncios**, **Acompanhamentos** e **Dados economizados** (uma estimativa, a partir do tamanho habitual do que foi bloqueado), desde quando ele conta, um gráfico dos últimos 30 dias, **Mais bloqueados** (os hosts) e **Sites com mais bloqueios**. **Zerar estatísticas** as esquece e começa a contar de novo. Elas ficam neste computador, nos dados próprios do app para desktop, e os agentes não podem lê-las. Uma aba privada conta nos totais, mas não deixa hosts nem sites registrados, e **Limpar dados de navegação** com **Histórico de navegação** marcado faz as estatísticas esquecerem os sites também.

Com o bloqueador ativado, as suas extensões do Chrome ainda veem as solicitações da página, mas uma que bloqueia ou altera solicitações (um bloqueador de anúncios seu) não as bloqueia; desative o bloqueador para entregar a página a ela.

**Ocultar avisos de cookies** (ativado no início, nas configurações do navegador, e somente enquanto o bloqueador estiver ativado) também oculta os avisos de cookies que muitos sites exibem, com a lista deles do EasyList somada às listas acima. Ele oculta um aviso e não responde a ele por você, então um site que espera a sua resposta pode reter parte do conteúdo: permita anúncios nesse site pelo escudo dele para ver o aviso de novo.

### O cadeado

O cadeado no início da barra de endereço mostra se a conexão com o site é segura (“Não seguro”, com um cadeado aberto, para uma página http). Clique nele para ver o site, se a conexão dele é segura e o que você permitiu ou bloqueou para ele (cada item com **Esquecer**, para que ele pergunte de novo). Os anúncios e rastreadores bloqueados na página ficam no escudo, à direita da barra de endereço (veja [Bloquear anúncios e rastreadores](/guide/web#block-ads-and-trackers)). Em uma página da web, ele também tem:

- **Páginas escuras neste site**, uma chave que aparece enquanto as [páginas escuras](/guide/web#dark-pages) estão ativadas: desative-a para mostrar este site como ele é.
- **Cookies e dados do site**, com **Excluir**. Ele pergunta antes ("Delete the cookies and site data of example.com? You’ll be signed out of it."); pressionar **Excluir** remove os cookies e os dados armazenados desse site, e dos subdomínios dele também (para `mail.example.com`, os de example.com), dos logins próprios desta aba (os de uma aba privada são só dela), e carrega a página de novo. Um aviso diz o que foi excluído. Os arquivos em cache ficam: **Limpar dados de navegação** nas configurações do navegador os limpa, e tudo de todos os sites.

### Downloads

Um arquivo baixado por uma página é salvo na pasta Downloads do computador onde o app está rodando e aparece em **Menu** (⋯) → **Downloads** como "Baixando…", "Concluído" ou "Falhou", com o caminho dele. Um download feito em uma aba privada é salvo da mesma forma e aparece aqui, mas não é adicionado à lista que a caixa de busca (Ctrl+K) encontra. Clique em um download concluído para vê-lo na pasta dele: o app para computador abre o gerenciador de arquivos do sistema com o arquivo selecionado (**Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta**; veja [Trabalhar com arquivos e pastas](/guide/files-git#work-with-files-and-folders)).

### Quando um site pede uma permissão

Quando uma página no seu próprio navegador pede para usar sua câmera, seu microfone, sua localização, notificações, sua área de transferência ou algo parecido, uma barra acima da página avisa ("example.com quer usar sua câmera") com **Não permitir** e **Permitir**. Sua resposta fica guardada para aquele site, então ele pergunta só uma vez; para ver o que você permitiu ou bloqueou, ou para ser perguntado de novo, abra o cadeado, ou **Menu** (⋯) → **Permissões do site**, e clique em **Esquecer** ao lado de uma resposta. Os navegadores dos agentes recusam sozinhos todos esses pedidos, exceto para preencher a tela e para copiar para a sua área de transferência. Em uma aba privada, a barra pergunta toda vez: sua resposta é esquecida quando a aba é fechada, e um "Permitir" que você deu em uma aba normal não vale ali (um site que você bloqueou continua bloqueado). A pergunta em pop-up de uma página (um alerta, uma pergunta de sim ou não ou um campo de texto) aparece acima da página, como no navegador dos agentes (veja [Responder às perguntas em pop-up de uma página](/guide/web#answer-a-pages-pop-up-questions)).

## Favoritos

Os sites da barra de favoritos ficam fixados no topo da coluna de abas assim que você tem um favorito nela (no celular não há coluna de abas; seus favoritos ficam no menu). Clique em um para abri-lo na aba aberta; Ctrl+clique (⌘+clique no Mac) ou um clique com o botão do meio o abre em uma nova aba. Uma pasta abre uma lista do que há nela, e dez blocos é o máximo que ela mostra (um bloco **…** lista o restante). Clique com o botão direito em um bloco para ver **Abrir**, **Abrir em uma nova aba**, **Editar** (**Renomear** para uma pasta) e **Excluir**.

Para ver todos, clique em **Menu** (⋯) → **Favoritos**, ou acesse [Favoritos](/browser?panel=bookmarks). O painel tem dois lugares, **Barra de favoritos** e **Outros favoritos**, e as pastas dentro deles abrem e fecham; cada uma continua como você a deixou na próxima vez que abrir o painel.

- **Pesquisar nos seus favoritos** (a caixa no topo) encontra um favorito pelas palavras dele (veja [Pesquisar nos seus favoritos](/guide/web#search-your-bookmarks)).
- **Nova pasta** (no topo) adiciona uma pasta à barra e pede o nome dela.
- **Organizar com IA** (o botão de brilhos no topo, ao lado de **Nova pasta**) separa seus favoritos em pastas por assunto (veja [Organizar com IA](/guide/web#organize-with-ai)).
- Passe o mouse sobre uma linha para ver **Mover para cima**, **Mover para baixo**, **Editar** (**Renomear** para uma pasta) e **Excluir**. Você também pode arrastar uma linha: sobre o meio de uma pasta para colocá-la dentro, ou entre linhas para posicioná-la ali. Uma pasta não pode ir para dentro dela mesma. Excluir uma pasta pede confirmação antes e leva junto o que há nela.
- O endereço de um favorito começa com http://, https://, file:// ou chrome-extension://. Você pode guardar até 20.000.

### Pesquisar nos seus favoritos

No topo do painel, a caixa **Pesquisar nos seus favoritos** encontra favoritos por todas as palavras que você digitar, nos nomes e nos endereços deles (maiúsculas e acentos não importam), e pastas pelos nomes. Enquanto a caixa tiver palavras, o painel mostra **Pastas** (até 20) e **Favoritos** (até 200) no lugar das pastas, e cada favorito mostra o site dele e onde está, como "Barra de favoritos › Imported from Chrome › Research".

- Clique em uma pasta para vê-la entre as suas pastas: a pesquisa é limpa e a pasta abre.
- Clique em um favorito para abri-lo; Ctrl+clique (⌘+clique no Mac) o abre em uma nova aba.
- Passe o mouse sobre um favorito para ver **Mostrar na pasta**, **Editar** e **Excluir**.
- **Enter** abre o primeiro favorito encontrado, e **Esc** limpa a pesquisa.

### Organizar com IA

Com muitos favoritos, o botão de brilhos **Organizar com IA** no topo do painel, ao lado de **Nova pasta**, separa os favoritos em pastas por assunto. Você também pode procurar por "Organizar favoritos com IA" na caixa de busca (Ctrl+K), ou acessar [Organizar com IA](/browser?panel=bookmarks&organize=1). Isso abre **Organize seus favoritos com IA**, onde você escolhe como:

- **Manter minhas pastas** (escolhido de início): suas pastas, e os favoritos que estão nelas, continuam como estão. Os favoritos soltos vão para a pasta que combina: uma das suas ou uma nova. Solto quer dizer que está em **Outros favoritos** mesmo, ou em uma pasta que só reúne favoritos, como a "Imported from Chrome" de uma importação e as pastas "Other bookmarks" ou "Mobile bookmarks" dentro dela (o modelo auxiliar as distingue das suas próprias pastas, em qualquer idioma). Uma pasta de reunião que a organização esvazia é removida (uma que já estava vazia continua); nenhuma outra pasta é removida, renomeada ou movida. As novas pastas vão para o fim de **Outros favoritos**, ou para dentro de uma das suas pastas.
- **Recomeçar**: todos os favoritos vão para novas pastas por assunto, em **Outros favoritos**, e suas pastas antigas são removidas. As novas pastas ficam primeiro em **Outros favoritos**, por nome, com até um nível de subpastas; uma pasta que ficar com um favorito que o modelo não conseguiu encaixar continua.

De qualquer forma, os sites fixados na sua barra de favoritos (os links da própria barra) continuam onde estão.

**O que é enviado, e para qual modelo.** Somente quando você clica em **Organizar**, os títulos e os endereços dos seus favoritos (sem o que vem depois de um **?** ou **#**) e os nomes das suas pastas vão para o modelo auxiliar do app, o que escreve os títulos das sessões e as notas da memória ([Configurações → Agentes → Modelos → Modelo auxiliar](/settings?s=models&find=Helper%20model)). Em Automático, é o Claude Haiku pelo Claude Code; um modelo seu neste computador mantém tudo aqui. Nada é enviado em nenhum outro momento. Se o título de um favorito for privado, não clique nele (ou coloque um modelo neste computador como auxiliar).

Funciona em duas etapas: primeiro define as pastas, depois separa os favoritos nelas, 150 por vez; algumas centenas de favoritos levam um ou dois minutos. Enquanto trabalha, o topo do painel diz "Definindo as pastas…", depois "Organizando seus favoritos… 150 de 412" com uma barra, e **Parar**, que não altera nada. Quando termina, ele diz o que fez, como "412 favoritos organizados em 14 novas pastas. 3 pastas vazias removidas.", e as pastas aparecem fechadas para que as novas sejam vistas de relance. **Desfazer** devolve todos os favoritos ao que eram, desde que você não tenha alterado seus favoritos depois; o X fecha o aviso. Se falhar, nada é alterado, e **Tentar de novo** o abre outra vez.

Os agentes não podem organizar seus favoritos por você: sua navegação é só sua. Peça a um deles, e ele diz onde fica o botão.

### Trazer favoritos

Em **Importar** no painel, o app lista os navegadores deste computador que têm favoritos, cada um com a quantidade: Chrome (e Chrome Beta), Chromium, Edge, Brave, Vivaldi, Opera, Firefox e, só no Mac, Arc e Safari. Um navegador com vários perfis aparece uma vez para cada um, pelo nome do perfil. Clique em **Importar** em um deles e os favoritos dele entram em uma nova pasta no fim da barra de favoritos, chamada "Imported from Chrome" ("Imported from Chrome (Work)" quando o navegador tem vários perfis). Ela mantém as pastas do próprio navegador: primeiro o que estava na barra de favoritos dele, depois os outros favoritos, os do celular e o menu do Firefox, como pastas com os nomes que aquele navegador dá. Links que não são páginas da web, como os javascript:, e pastas vazias ficam de fora. O Firefox pode ficar aberto. No app para computador, o tour de boas-vindas também oferece isso, em uma página própria, **Trazer seus favoritos e seu histórico?**, quando o Hydor encontra outros navegadores neste computador (veja [Fazer o tour](/guide/app#take-the-tour)).

Na primeira vez que você abre a página Navegador, quando o Hydor encontra outros navegadores neste computador e a importação ainda não foi oferecida a você (a página do tour conta), uma barra acima da página pergunta "Trazer seus favoritos e seu histórico do Google Chrome e do Firefox?", citando os navegadores que encontrou. **Não, obrigado** a fecha, e **Importar…** abre o painel **Importar favoritos e histórico** ([Importar favoritos e histórico](/browser?panel=import)). A barra aparece só nessa visita; o painel fica disponível a qualquer momento nesse endereço, e a caixa de busca (Ctrl+K) o encontra. Os painéis **Favoritos** e **Histórico** também têm **Importar** no pé. Ele tem uma nota, "Os favoritos entram em uma nova pasta no fim da barra de favoritos, e o histórico se junta ao seu. Tudo fica neste computador.", depois os botões de alternância **Favoritos** e **Histórico** (os dois ativados) e uma linha para cada navegador (e perfil) com quantos favoritos e páginas de histórico ele tem, e **Importar**, que traz o que está ativado, como a página do tour faz. **Importado** aparece ao lado do que entrou, nos dois lugares. Se nenhum for encontrado, diz "Nenhum outro navegador foi encontrado neste computador."

O Safari guarda seus favoritos onde o macOS os protege. Até você permitir, a linha dele diz "O Hydor pode não ler os favoritos do Safari: permita em Ajustes do Sistema → Privacidade e Segurança → Acesso total ao disco". A linha dele mostra **Abrir Ajustes do Sistema** no lugar de **Importar**: isso abre Ajustes do Sistema → Privacidade e Segurança → Acesso total ao disco, onde você ativa o Hydor (adicione-o com **+** se ele não estiver na lista). Quando você volta ao Hydor, ele verifica de novo, e a contagem do Safari e **Importar** aparecem. Se ainda não conseguir ler o Safari, a linha acrescenta "Permitiu? O macOS pode querer que o Hydor seja reaberto antes: feche o Hydor e abra-o de novo."

Para trazer um arquivo em vez disso, clique em **De um arquivo** e escolha um arquivo de favoritos exportado de qualquer navegador (um arquivo .html, de até 20 MB). Ele entra em uma pasta chamada "Imported bookmarks".

### Levar seus favoritos para fora

**Exportar**, em **Importar**, salva todos os favoritos como `bookmarks.html`, que o Chrome, o Firefox e o Safari conseguem importar.

## Extensões do Chrome

Seu próprio navegador pode executar extensões do Chrome: um gerenciador de senhas, um modo escuro, um tradutor. Pressione **Menu** (⋯) → **Extensões**, ou acesse [Extensões](/browser?panel=extensions). As extensões são executadas no navegador do próprio app para computador. Em outros lugares, o painel as guarda e avisa isso (“As extensões são executadas no navegador do próprio app para computador. Elas ficam guardadas aqui e são executadas lá.”). Uma extensão é executada com seus logins e pode ler os sites que ela pede, então adicione apenas as que você considera confiáveis.

### Adicionar uma extensão

- **Da Chrome Web Store**: cole o link da extensão (um endereço chromewebstore.google.com ou chrome.google.com/webstore) ou o id dela (32 letras de a a p) em **Da Chrome Web Store** e pressione **Adicionar**. Ou abra a página da extensão no seu próprio navegador e pressione **Adicionar ao Hydor** na barra superior. O app baixa a extensão da Chrome Web Store (uma solicitação ao Google) e guarda o id dela na Web Store.
- **De uma pasta**: pressione **Escolher uma pasta** (no app para computador) ou digite o caminho da pasta (em outros lugares: uma pasta do computador em que o app é executado), para uma extensão descompactada que tenha um manifest.json. Ela é usada onde está, sem ser copiada, então as alterações de quem desenvolve aparecem.
- **De seus outros navegadores**: as extensões instaladas no Chrome, no Edge, no Brave e em outros navegadores baseados em Chromium neste computador são listadas, cada uma com uma caixa de seleção. Marque as que você quer e pressione **Importar**. As que já estão aqui aparecem com “Já está aqui”, e as que estão desativadas no navegador delas aparecem com “Desativada lá”.

As extensões não são atualizadas sozinhas. Adicione uma de novo da Chrome Web Store para obter a versão mais recente; ela substitui a antiga.

### Desativar uma extensão ou removê-la

Cada extensão no painel mostra o ícone, o nome e a versão, além de um interruptor que a ativa ou desativa. **Remover** a exclui (os arquivos de uma pasta permanecem). **Opções** abre a página de opções dela em uma aba.

Quando uma extensão tem um botão na barra de ferramentas, ele aparece à direita da barra de endereços enquanto a extensão está ativada e fixada: clique nele para abrir o popup embaixo do botão, e um selo nele, um número ou algumas letras, mostra o que a extensão informa. As extensões que você não fixou não têm botão próprio e ficam no botão **Extensões** (a peça de quebra-cabeça), depois das outras. Ele aparece enquanto pelo menos uma extensão está ativada.

- **Usar uma extensão pelo menu**: pressione **Extensões** e clique no nome de uma extensão para usá-la, como você clicaria no botão dela. Uma extensão sem botão próprio na barra de ferramentas também aparece na lista: o nome dela abre a página de opções, quando ela tem uma.
- **Fixar ou desafixar**: o alfinete ao lado de uma extensão nesse menu (**Fixar na barra de ferramentas**, ou **Desafixar da barra de ferramentas** quando ela está fixada) mostra ou oculta o botão dela na barra de ferramentas. O alfinete fica aceso enquanto ela está fixada. Fixar muda apenas a barra de ferramentas: a extensão continua sendo executada de qualquer forma.
- **Mais opções para uma extensão**: o **⋮** ao lado dela tem **Opções** (quando ela tem uma página de opções), **Desativar** e **Remover**, que pergunta antes.
- **Gerenciar extensões**, no fim do menu, abre o painel.
- **Clique com o botão direito em um botão** da barra de ferramentas para ver um pequeno menu com o nome dele, depois **Opções** (quando a extensão tem uma página de opções), **Desafixar**, **Remover** e **Gerenciar extensões**.
- **Fixar na barra de ferramentas** também é um interruptor no painel, embaixo de cada extensão que está ativada e tem um botão.

Uma nova extensão começa fixada. As extensões que você importa do Chrome mantêm os alfinetes que tinham lá: as que você tinha fixado no Chrome ficam fixadas aqui, e as outras ficam no menu **Extensões**. Um clique em uma extensão que não está sendo executada neste navegador avisa isso (“… não está sendo executada neste navegador”).

**Também nos navegadores dos agentes** vem desativado no início. Quando ativado, a extensão também é executada nos navegadores dos agentes que guardam logins, aqueles que usam um perfil (veja [Manter logins com perfis](/guide/web#keep-sign-ins-with-profiles)), e somente nesses. Navegadores que começam do zero nunca recebem extensões. (Em um servidor, um Chromium ou Chrome for Testing as carrega; o Google Chrome não carrega mais.)

### O que pode não funcionar

O navegador do app para computador tem a maior parte do que o Chrome oferece às extensões. Funcionam o conteúdo que uma extensão adiciona às páginas, popups, páginas de opções, configurações guardadas, mensagens, selos, notificações (exibidas como as do sistema) e alarmes, e também o que uma extensão faz com suas abas: ela vê a aba em que você está, além do endereço e do título das páginas que pode ler; abre abas (em primeiro plano, como no Chrome), muda para elas e as fecha, e sabe quando elas carregam ou mudam. Os downloads dela são salvos como os seus, ela lê e define os cookies dos sites que pode usar, as páginas em segundo plano que ela cria para si mesma (offscreen) são executadas, e o painel lateral dela abre embaixo do botão, como um popup. Coisas que podem não funcionar: bloquear ou alterar solicitações (em que muitos bloqueadores de anúncios se baseiam), entrar com uma conta, o histórico e os favoritos do navegador, grupos de abas, atalhos de teclado de uma extensão e os itens que uma extensão adiciona ao menu do botão direito (aceitos, nunca exibidos). A linha da extensão informa quais delas ela pede, em um texto como “Algumas partes podem não funcionar aqui: bloquear ou alterar solicitações, entrar com uma conta”. Isso depende do que a extensão pede, então ela ainda pode funcionar bem.

## Entregar uma página a um agente

Um agente nunca recebe o seu próprio navegador. Você pode dar a ele uma página dele, de duas maneiras (uma [aba privada](/guide/web#private-tabs) não pode ser entregue: **Perguntar** fica esmaecido nela, e o app recusa a cópia da página): **Perguntar** dá a ele uma cópia para ler, e **Fazer** dá a ele uma aba para trabalhar. Ambos ficam em **Perguntar** na barra, que abre a coluna ao lado da página com um interruptor, **Perguntar** ou **Fazer** (veja [Perguntar ao lado da página](/guide/web#ask-beside-the-page)). Funcionam em uma página de um site. A caixa na barra faz as duas coisas com o que você digitar, conforme o interruptor: a linha **Perguntar sobre esta página: “…”** vira **Fazer isso nesta página: “…”** enquanto **Fazer** está selecionado.

### Perguntar sobre esta página

O agente recebe uma cópia da página, um arquivo com o título, o endereço, o que você tinha selecionado nela e o texto legível (até 200.000 caracteres), e uma nova sessão começa com a sua pergunta, no agente e no modelo que a página inicial usou por último. A resposta aparece na coluna ao lado da página, e **Abrir como sessão** leva você até ela. O agente não pode tocar na página nem ver seus logins: ele lê a cópia. Deixe a página terminar de carregar primeiro, pois a cópia é o que a aba mostra agora.

### Fazer na página

Com **Fazer** selecionado em Perguntar, a coluna pergunta “O que um agente deve fazer nesta página?” e mostra o que o agente recebe. Escolha **Claude Code** ou **Custom** no botão do agente (somente esses dois podem ficar restritos ao navegador; o app recusa os outros) e pressione **Fazer isso**. As palavras que você selecionou na página com **Perguntar a um agente sobre** ou uma imagem de **Perguntar sobre esta imagem** vão junto com o pedido. O agente recebe:

- **Uma aba só dele**, no navegador que guarda seus logins, aberta no endereço da sua página: ele entra como você nesse site. A sua própria aba continua onde está.
- **Somente esse site**: páginas de outros lugares não abrirão para ele. Para uma página neste computador, é somente esse endereço.
- **Somente o navegador**: sem comandos, sem arquivos, sem busca na web, sem outros apps, sem memória e sem subagentes. Uma sessão assim não pode ser continuada em outro agente, e uma bifurcação dela continua restrita ao navegador.
- **Uma parada antes de enviar**: ele pergunta, como acima, antes de pressionar um botão que envia, publica, exclui ou transfere algo, e é instruído a perguntar a você quando estiver em dúvida (veja [Botões que enviam, publicam ou excluem](/guide/web#buttons-that-send-post-or-delete)). Pagar é com você, como sempre.

A primeira mensagem do agente informa que a sua página está aberta no navegador dele e que ele trabalha ali sozinho. O navegador precisa estar ativado em Configurações (**Um navegador para agentes**). Depois que você pressiona **Fazer isso**, a aba do agente aparece no lugar da página, com a conversa dele ao lado (veja [Agentes trabalhando](/guide/web#agents-at-work)). De volta às suas abas, o Perguntar dessa aba mostra a conversa, com **Ver trabalhando** (a aba do agente aparece de novo), **Abrir como sessão** e **Novo pedido**.

### Retomar a página

No navegador de um agente que recebeu a sua página, o painel acima da caixa de mensagem dele diz “Sua aba de example.com” com **Retomar**, e a barra também diz isso enquanto você o observa. Pressione-o para fechar a aba do agente e abrir a página como uma nova aba sua, em primeiro plano. O agente é avisado: “Retomei a página: ela é minha de novo”. O navegador dele fecha com a última aba e, fora isso, como o de qualquer sessão quando a sessão termina (veja [Quando o navegador fecha](/guide/web#when-the-browser-closes)).

## Agentes trabalhando

Enquanto um agente tem um navegador aberto, a coluna de abas o lista em **Agentes trabalhando**, uma linha para cada um, com o título da sessão e o que ele está fazendo (“Clicando em ‘Entrar’”, “Esperando por você”, “Você está no controle: o agente espera”). A lista é mantida atualizada, e essa parte não existe quando nenhum agente tem um navegador aberto. Clique em uma linha para ver esse navegador no lugar da página:

- A página aparece com as perguntas do agente acima dela, como em [Assumir o controle para entrar, resolver uma verificação ou pagar](/guide/web#take-over-to-log-in-solve-a-check-or-pay), e um anel ao redor: âmbar enquanto ele espera por você, azul enquanto você conduz. A caixa mostra um chip com o agente e o título da sessão (o **×** dele, **Voltar para suas abas**, volta) e o endereço da aba do agente.
- A barra tem **Parar** enquanto o agente trabalha, **Assumir** (ou **Devolver**, quando você conduz), **Retomar** para uma página que você entregou a ele, e **Abrir a sessão**. No app para computador, clique na página dele para usá-la você mesmo; o agente espera.
- A coluna à direita mostra a conversa da sessão, ao vivo, com a caixa de mensagem dela: veja o agente trabalhar, responda a ele ou envie uma mensagem. **Abrir a sessão** e **×** ficam no topo dela.

**Esc**, o **×** do chip, **Voltar para suas abas** ou um clique em uma das suas abas volta para as suas próprias abas; a coluna à direita mostra o que mostrava antes, ou se fecha.

## Configurar o navegador

Abra [Configurações → Recursos → Navegador](/settings?s=browser) (“Um navegador da web que os agentes usam, e que você pode acompanhar e assumir”).

### Um navegador para os agentes

[Um navegador para os agentes](/settings?s=browser&find=A%20browser%20for%20agents) é o interruptor ao lado do título da seção. Ele liga ou desliga o navegador para todos os agentes. Ele se liga sozinho quando um Chromium é encontrado, e só pode ser ligado depois que houver um. Quando está desligado, os agentes não recebem as ferramentas do navegador. Cada agente também tem o seu próprio interruptor **Usar um navegador**, em [O que ele pode usar](/guide/agents#what-it-may-use): um agente com ele desligado não recebe as ferramentas do navegador, seja qual for a configuração aqui.

### Chromium

[Chromium](/settings?s=browser&find=Chromium) mostra o que está em uso, com a versão, e onde ele fica em seu (i). O app escolhe, nesta ordem: no app para desktop, **O navegador próprio do app para desktop**; um Chrome ou Chromium instalado neste computador; um que ele mesmo baixou; e, por fim, um que o Playwright (uma ferramenta de teste de navegadores) instalou. Quando encontra mais de um, um seletor permite escolher: **O melhor encontrado** ou um em particular.

O navegador próprio do app para desktop não precisa de download e não tem um caminho para mostrar. Enquanto ele é o que está em uso, a linha diz “As páginas aparecem na janela do app.”, e **Baixar o Chrome** e **Mostrar uma janela** não aparecem, pois nenhum dos dois faz sentido para ele. Escolha outro Chromium e eles voltam. A página Navegador (o seu próprio navegador) usa o mesmo mecanismo.

Quando nenhum é encontrado, a linha avisa e oferece baixar o Chrome for Testing (cerca de 170 MB) para a pasta de dados do app: pressione **Baixar o Chrome**; uma barra mostra o progresso e, se falhar, a linha diz o motivo. O botão continua aparecendo enquanto não houver uma cópia baixada, mesmo que outro Chromium tenha sido encontrado.

Se o sandbox do próprio Chrome (a barreira entre as páginas e o resto do computador) não puder funcionar neste computador, uma nota avisa. As páginas continuam sem acesso à rede desta máquina, mas limite os perfis aos sites de que você precisa.

### Mostrar uma janela

[Mostrar uma janela](/settings?s=browser&find=Show%20a%20window) vem desligado: o navegador roda fora de vista, e você o acompanha no app. Ligado, ele também abre uma janela na tela deste computador. O headless shell do Playwright (um Chromium sem janela) não consegue mostrar uma, então o interruptor fica desligado com ele. A mudança vale na próxima vez que o navegador for iniciado. O interruptor não aparece enquanto o navegador próprio do app para desktop está em uso.

### Manter as páginas longe desta máquina e da rede dela

[Manter as páginas longe desta máquina e da rede dela](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) vem ligado. As páginas não conseguem acessar este computador nem endereços privados da rede dele (roteadores, impressoras, este app), seja por uma conexão direta ou por um nome de site que depois leve a um endereço assim: toda conexão passa por um ponto de verificação do app. Uma sessão ainda pode abrir o próprio servidor de desenvolvimento depois que você permitir (veja [Permitir que uma sessão abra um site neste computador ou na sua rede](/guide/web#let-a-session-open-a-site-on-this-computer-or-your-network)). Desligado, as páginas podem acessar a sua rede, mas o próprio Hydor continua fora do alcance.

### Capturas de tela para modelos que veem imagens

[Capturas de tela para modelos que veem imagens](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images) vem ligado: agentes cujo modelo vê imagens podem olhar a página com caixas numeradas desenhadas sobre ela. Modelos que só leem texto sempre recebem a página como texto; com isto desligado, todos os modelos recebem.

### Perguntar antes de enviar em sites com login

[Perguntar antes de enviar em sites com login](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites) vem ligado. Antes de um agente enviar, publicar, excluir ou transferir qualquer coisa em um site em que está conectado, você é consultado (veja [Botões que enviam, publicam ou excluem](/guide/web#buttons-that-send-post-or-delete)). Desligado, os agentes pressionam esses botões sem perguntar, em sites em que um perfil está conectado e em uma página que você entregou a eles. Pagamentos continuam sendo interrompidos de qualquer forma.

### Sites: somente estes, nunca estes

Em [Sites](/settings?s=browser&find=Sites), duas listas valem para o navegador de todas as sessões, um site por linha, como example.com (os subdomínios também contam):

- **Somente estes sites**: quando tem algum, o navegador abre páginas somente nesses sites. Vazia significa qualquer site.
- **Nunca estes sites**: nada desses sites é carregado.

**Salvar sites** aparece ao lado do título do grupo assim que você muda algo: pressione-o. Você pode colar endereços inteiros: o app guarda só o site (“https://www.example.com/page” vira example.com). Cada sessão pode adicionar os seus no menu do navegador dela (**Sites desta sessão**).

### Manter logins com perfis

Um perfil é uma pasta de navegador própria que guarda logins entre sessões, para que os agentes trabalhem em sites em que você está conectado sem que sua senha chegue até eles. O seu próprio perfil do Chrome nunca é usado. Em [Perfis](/settings?s=browser&find=Profiles):

1. Pressione **Novo perfil**, dê um nome a ele (como Trabalho ou Compras) e pressione **Adicionar**.
2. Uma janela se abre, “Entrar em sites · Trabalho”. Digite um site em que entrar, como github.com/login, e pressione **Abrir**.
3. Clique e digite na página como em qualquer navegador (no celular, **Teclado** abre o seu teclado) e faça o login. Abra outros sites da mesma forma.
4. Feche a janela quando terminar. Os logins ficam no perfil.

Para usá-lo, abra o navegador de uma sessão e depois **Opções do navegador** (⋯) → escolha o perfil em **Perfil**. Ao escolher, o navegador se fecha; ele abre de novo, já com o login feito, na próxima vez que o agente ou você o abrir, e o painel mostra o nome do perfil. Sessões que usam o mesmo perfil compartilham os logins dele.

Cada perfil da lista tem **Entrar em sites** (para fazer login em mais sites) e um menu **⋯** com **Renomear** e **Excluir**, que também exclui os logins dele e tudo o que o navegador guardou para ele, e fecha os navegadores que o usam. Sem nenhum perfil ainda, a lista diz que o navegador de cada sessão começa do zero, sem login em lugar nenhum.

### Sua própria navegação

No app para desktop, [Configurações → Navegador](/settings?s=browser) também tem um grupo **Sua própria navegação** (“A página Navegador: páginas que você usa por conta própria e que os agentes nunca recebem”), com três linhas que abrem os painéis da página Navegador: [Favoritos](/settings?s=browser&find=Bookmarks) (“Os seus, com os dos outros navegadores deste computador”), [Extensões](/settings?s=browser&find=Extensions) (“Extensões do Chrome, no app para desktop”) e [Configurações do navegador](/settings?s=browser&find=Browser%20settings) (“Página inicial, mecanismo de busca, tradução, páginas escuras, bloqueador de anúncios, histórico e limpeza do que ele guardou”). Em outros lugares o grupo não aparece. Veja [Favoritos](/guide/web#bookmarks), [Extensões do Chrome](/guide/web#chrome-extensions) e [Configurações do navegador](/guide/web#browser-settings).

## Permitir que os agentes usem o seu computador

No app para desktop, no Mac, no Windows e no Linux, os agentes também podem usar o próprio computador, como uma pessoa diante dele: eles veem a tela e usam o mouse e o teclado, em qualquer app (Notas ou Calendário no Mac, Bloco de Notas ou Excel no Windows, Arquivos no Linux, um app que o navegador não alcança). Para sites, eles ficam no navegador, que é mais rápido e seguro. O uso do computador vem desligado. Cada agente também tem o seu próprio interruptor **Usar o computador**, em [O que ele pode usar](/guide/agents#what-it-may-use): um agente com ele desligado não pode usar o computador, mesmo com o Uso do computador ligado.

### Ligar o uso do computador

Abra [Configurações → Recursos → Uso do computador](/settings?s=computer) (“Os agentes veem a sua tela e usam o mouse e o teclado, no app para desktop”) e ligue o interruptor [**Uso do computador**](/settings?s=computer&find=Computer%20use) ao lado do título da seção. Depois, conforme o seu sistema:

- **No Mac**, dê ao Hydor as duas permissões do macOS. Ao lado de [**Acessibilidade**](/settings?s=computer&find=Accessibility), a permissão do macOS para usar o mouse e o teclado, pressione **Permitir…**. O macOS pergunta se o Hydor pode controlar este computador, e as Configurações do Sistema abrem em **Privacidade e Segurança → Acessibilidade**: ligue o **Hydor** ali. Ao lado de [**Gravação de Tela**](/settings?s=computer&find=Screen%20Recording), a permissão do macOS para ver a tela, pressione **Permitir…** e ligue o **Hydor** em **Gravação de Tela** (**Gravação de Tela e Áudio do Sistema** no macOS 15). Se o macOS pedir para fechar e reabrir o Hydor, faça isso: os agentes em execução continuam. Uma permissão concedida pelo macOS mostra **Permitido** e se mantém quando o app é atualizado. Se as Configurações do Sistema mostram o **Hydor** ligado mas as Configurações ainda dizem **Permitir…**, esse interruptor é de uma versão anterior (antes da 0.28.1, cada atualização exigia as permissões de novo): pressione **Permitir…**, que o limpa, e ligue o **Hydor** mais uma vez.
- **No Windows** não há nada a permitir. Programas executados como administrador ficam fora do alcance do agente, e a tela também, enquanto está bloqueada.
- **No Linux** funciona em um desktop X11 (Xorg) com Python 3, que quase todo sistema tem. Um desktop com Wayland, como o GNOME e o KDE são hoje na maioria dos sistemas, não deixa nenhum app ver a tela nem usar o mouse e o teclado dos outros: a seção avisa isso e explica como entrar em uma sessão X11 (no Ubuntu, a engrenagem na tela de login → **Ubuntu on Xorg**).

Quando algo impede o uso do computador neste computador, a seção diz o que é, em uma caixa amarela no topo (com o interruptor desligado, uma nota avisa que os agentes não podem usar este computador). A seção aparece nas Configurações em qualquer lugar, mas só o app para desktop pode fazer isso: nos outros, ela avisa.

### O que os agentes fazem no seu computador

Na primeira vez que um agente de uma sessão quer o computador, um cartão na conversa pergunta: “Deixar o agente usar o seu Mac?” (“o seu PC” no Windows, “o seu computador” no Linux), com **Permitir nesta sessão** e **Agora não**. A sessão espera pela sua resposta, e você recebe uma notificação. Depois de permitido, o agente pode:

- olhar a tela (a tela principal, reduzida; as outras telas não aparecem);
- clicar, dar duplo clique, clicar com o botão direito, arrastar, rolar e mover o ponteiro;
- digitar texto, em qualquer idioma, e pressionar teclas e atalhos como ⌘C no Mac ou Ctrl+C no Windows e no Linux;
- abrir um app pelo nome, como o menu Iniciar ou o menu de aplicativos o mostra.

Enquanto um agente trabalha, um brilho contorna as bordas da sua tela, em todas as telas, e uma nota na parte de baixo diz “Um agente está usando o seu Mac” (o seu PC, o seu computador) e “Pressione Esc para parar”. Os cliques passam através dele, e ele nunca captura o teclado. Ele é só para você: as capturas de tela do agente nunca o mostram (ele fica oculto no instante da captura e volta). No Linux, ele precisa de um desktop que componha as suas janelas, como GNOME, KDE, Xfce, Cinnamon e MATE; sem isso não há brilho, e o ícone da bandeja continua avisando que um agente está trabalhando.

### Ver onde o agente aponta na sua tela

O agente move o seu próprio ponteiro do mouse, que é pequeno e fácil de perder. Por isso, enquanto ele trabalha, um anel grande com um halo suave, nas cores do brilho, circula o ponteiro, com uma etiqueta **Agente** ao lado:

- o ponteiro desliza até cada lugar em um quarto de segundo em vez de pular para lá, e o anel vai junto, para que seu olhar possa acompanhar;
- onde ele clica, uma onda se espalha (tracejada para o clique com o botão direito, duas para o duplo clique), e enquanto ele mantém o botão pressionado (um arrasto), o anel se aperta e acompanha o arrasto;
- as palavras que ele digita e as teclas que pressiona (Ctrl+S, Enter) aparecem ao lado da etiqueta por um momento, e uma rolagem mostra o sentido dela com setas.

O anel faz parte do brilho: os cliques passam através dele, ele nunca captura o teclado, as capturas de tela do agente nunca o mostram e, no Linux, ele precisa de um desktop que componha as suas janelas.

Cada passo aparece na conversa como uma linha com uma pequena imagem da tela depois dele: clique na imagem para vê-la grande, e na linha para ver a resposta completa do agente. Aberta, a imagem marca onde o passo agiu: um anel onde clicou (dois para um duplo clique, tracejado para o clique com o botão direito), uma linha ao longo de um arrasto, uma seta onde rolou, numerada quando o passo fez várias coisas. O app guarda as imagens dos últimos 200 passos de cada sessão; as das sessões sem uso há um mês são apagadas.

Os agentes são instruídos a olhar antes de agir, a usar o navegador para sites e a nunca digitar senhas, números de cartão ou códigos, nem pagar, comprar ou enviar dinheiro: nesses casos, eles param e pedem que você mesmo faça. Uma sessão usa o computador por vez.

### Impedir um agente de usar o seu computador

Enquanto um agente usa o computador, o brilho e a nota dele aparecem, o ícone do app avisa (no Mac, “Agente usando o seu Mac” ao lado dele na barra de menus) e a sessão dele mostra “O agente está usando o seu Mac” (o seu PC, o seu computador) acima da caixa de mensagem. Para impedi-lo na hora:

- pressione **Esc**, em qualquer app (no Mac, **⌘⇧Esc** também funciona). O Esc só interrompe o agente enquanto há um trabalhando, e o agente pressionar Escape por conta própria, para fechar uma caixa de diálogo, por exemplo, não o interrompe;
- escolha **Parar** no menu do ícone do app: na barra de menus no Mac, na área de notificação no Windows, na bandeja do sistema no Linux;
- ou pressione **Parar** acima da caixa de mensagem da sessão, ou em Configurações → Uso do computador.

Parar encerra o que o agente está fazendo e retira a permissão de todas as sessões: um agente que queira o computador de novo pergunta outra vez no cartão (“Você impediu o agente de usar o seu Mac. Deixar que continue?”). Desligar o **Uso do computador** tem o mesmo efeito.

## Pergunte a um agente

- "Ative o SearXNG em https://searx.example.org, coloque-o em primeiro lugar entre os provedores de pesquisa e teste."
- "Desative o DuckDuckGo na pesquisa na web."
- "Faça os agentes receberem 50 resultados de pesquisa por padrão."
- "Nunca deixe o navegador abrir facebook.com ou tiktok.com."
- "Mostre o navegador em uma janela neste computador e desative as capturas de tela dele."
- "Crie um perfil de navegador chamado Compras." (Entrar em sites nele é com você, em Configurações → Navegador.)
- "Pare de me perguntar antes de os agentes pressionarem Enviar ou Excluir em sites nos quais eles estão conectados." (é Configurações → Navegador → Perguntar antes de enviar em sites com login; para ativar de novo, faça o mesmo caminho)
- "O navegador dos meus agentes é o próprio do app para computador ou um Chromium?"
- "Como dou a um agente a página que estou vendo na página Navegador?" (**Perguntar sobre esta página** dá a ele uma cópia; **Fazer** em Perguntar dá a ele uma aba própria na página)
- "Peça a um agente que preencha o formulário desta página para mim." (**Perguntar** na barra e depois **Fazer**; ele recebe uma aba própria, conectado como você naquele site, e pergunta antes de enviar)
- "Como pesquiso no YouTube ou na Wikipédia direto da barra de endereço?" (um atalho de pesquisa: digite `yt` ou `wiki`, um espaço e suas palavras; **Configurações do navegador** → **Atalhos de pesquisa** adiciona os seus)
- "Deixe as páginas da web maiores por padrão e desative o corretor ortográfico." (**Configurações do navegador** → **Páginas** → **Zoom da página** e **Verificar ortografia**)
- "Deixe mais larga a coluna ao lado da página." (arraste a borda esquerda dela; um clique duplo restaura a largura)
- "A quais teclas o meu navegador responde?" (**Menu** → **Atalhos de teclado**)
- "Adicione example.org/reports à minha barra de favoritos, em uma pasta chamada Trabalho."
- "Como mudo o mecanismo de busca ou a página inicial do meu navegador?" (é **Menu** → **Configurações** na página Navegador: é você quem muda, os agentes não podem)
- “Como permito anúncios em um único site no meu navegador?” (a chave **Bloquear anúncios neste site** do escudo, desativada)
- "Como limpo meu histórico de navegação e os cookies?" (**Configurações do navegador** → **Limpar dados de navegação**; o período vale para o histórico e para a lista de downloads mantida junto com ele, e só para eles)
- "Por que a barra de endereço sugere uma página que visitei e que não tem nenhuma das palavras que digitei?" (com a busca por significado ativada, ela também oferece páginas sobre o que você digitou)
- "Como coloco minhas abas em grupos, e o que o botão Agrupar minhas abas com IA envia?" (clique com o botão direito em uma aba → **Adicionar ao grupo**; o botão de IA envia os títulos e endereços das abas, sem o que vem depois de um ? ou #, ao modelo auxiliar, somente quando você o pressiona)
- "Como reabro uma aba que fechei?" (**Ctrl+Shift+T**, ou **Fechadas recentemente** no histórico)
- "Como destaco palavras em uma página e as encontro de novo?" (selecione-as, clique com o botão direito, **Destacar**; **Menu** → **Destaques** as mostra)
- “O meu navegador bloqueia anúncios do YouTube?” (sim, com **Bloquear anúncios e rastreadores** ativado: as correções de página do uBlock Origin removem os anúncios em vídeo do YouTube e são atualizadas cerca de a cada 8 horas)
- “De onde vêm as listas do bloqueador de anúncios, e com que frequência são atualizadas?” (dos seus autores, e cada uma é baixada de novo quando expira: as correções rápidas do uBlock Origin cerca de a cada 8 horas, as outras a cada poucos dias; **Atualizar agora** em **Configurações do navegador** → **Anúncios** as baixa na hora)
- “Por que um site diz que eu uso um bloqueador de anúncios, e o que posso fazer?” (alguns sites o percebem; permita os anúncios dele com a chave **Bloquear anúncios neste site** do escudo, desativada, e a página é recarregada)
- “Como vejo quantos anúncios o meu navegador bloqueou?” (o número no escudo vale para esta página; clique nele para ver o que foi bloqueado no site no total, ou em **Estatísticas** para abrir o painel **Bloqueador de anúncios** com os últimos 30 dias)
- "O que uma aba privada guarda e o que ela esquece?" (logins, cookies e dados de sites são mantidos separados e esquecidos quando a última aba privada é fechada; as páginas dela não ficam no histórico; downloads, favoritos e o que você salva continuam sendo mantidos)
- "Traduza esta página para o português e sempre traduza páginas em japonês." (o botão de traduzir na barra de endereço; **Sempre traduzir** fica em **Configurações do navegador** → **Tradução**; as palavras da página vão para o modelo auxiliar)
- "Como leio um artigo sem a poluição visual, em uma fonte maior?" (o botão de livro na barra de endereço e depois **Aa**)
- "Mostre as páginas da web em modo escuro, exceto um site." (**Menu** → **Páginas escuras** e depois o cadeado desse site → **Páginas escuras neste site**)
- "Como salvo uma página da web inteira como imagem ou PDF?" (**Menu** → **Captura de tela ou PDF** → **Captura de tela da página inteira** ou **Salvar como PDF…**; ambos vão para Downloads)
- "Como organizo meus favoritos em pastas com IA, e o que isso envia?" (**Organizar com IA** no painel Favoritos; os títulos e endereços dos seus favoritos, sem o que vem depois de um ? ou #, e os nomes das suas pastas vão para o modelo auxiliar, somente quando você pressiona **Organizar**; **Desfazer** coloca tudo de volta)
- "Como encontro um favorito?" (**Pesquisar nos seus favoritos**, no topo do painel Favoritos)
- "Como guardo uma página para ler depois, e onde encontro a lista?" (**Menu** → **Ler depois** → **Adicionar esta página**, ou clique com o botão direito → **Ler esta página depois**; a lista fica nesse painel e embaixo das abas)
- "Salve esta página no meu projeto Tese." (**Salvar**, com **Tese** escolhido no **▾** ao lado; a cópia fica nos **Arquivos** do projeto)
- "Traga meus favoritos do Chrome e do Firefox para a página Navegador." (ou: "Por que não consigo importar meus favoritos do Safari?")
- "Traga meu histórico do Chrome para a página Navegador." (ou: "Por que não consigo importar meu histórico do Safari?")
- "Quais extensões do Chrome estão no meu navegador, e quais delas também funcionam nos navegadores dos agentes?"
- "Adicione ao meu navegador a extensão em https://chromewebstore.google.com/detail/…" (o app pergunta a você antes, todas as vezes)
- "Deixe só o meu gerenciador de senhas na barra de ferramentas e as outras extensões no menu Extensões." (o alfinete ao lado de cada extensão no menu do botão **Extensões**)
- "Preencha para mim o formulário de cartão da biblioteca em riverside.example.org; vou acompanhar." (o ponteiro dele aparece na visualização ao vivo, mostrando onde ele clica e digita)
- "Abra o Notas no meu Mac e comece uma nota com a lista de compras de hoje."
- "Abra o Bloco de Notas e anote a lista de compras de hoje." (no Windows; o brilho ao redor da tela aparece enquanto ele trabalha, o anel dele mostra onde ele aponta, e Esc o interrompe)
