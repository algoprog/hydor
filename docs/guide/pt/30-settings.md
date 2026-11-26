# Todas as configurações

Cada seção das configurações e o que há nela, na ordem em que o app as mostra, com um link para cada uma e para a parte deste guia que a explica. Use-a para descobrir onde algo é ajustado; os tópicos explicam como usar.

## Como as configurações são organizadas

Abra **Configurações** na barra de ícones. No computador, as configurações têm uma coluna à esquerda, como a da Biblioteca, com todas as seções em uma lista sob três títulos: **App** (o próprio app), **Agentes** (os agentes e o que eles leem) e **Recursos** (o que o app acrescenta a cada agente: a busca, o navegador, a memória e o resto). Clique em uma seção e ela ocupa a página, abaixo do título. **Ocultar barra lateral** (Ctrl+B) esconde a coluna, e **Mostrar barra lateral**, no início do título, a traz de volta. No celular, as configurações mostram todas as seções em uma lista; toque em uma para abri-la, e na seta no alto para voltar.

Você não precisa saber onde fica uma opção: digite o que quer na caixa de busca (Ctrl+K, ⌘K no Mac), como "modo escuro" ou "notificações", e escolha. O app abre a seção certa e aponta a opção. Você também pode pedir a qualquer agente que mude uma configuração para você ([Deixe os agentes usarem o app por você](/guide/ask-agents)).

## App

### Geral

[Configurações → Geral](/settings?s=general): tema e o que a tecla Enter faz enquanto um agente trabalha. Mais em [Aparência, idioma e atualizações](/guide/app).

- [**Aparência**](/settings?s=general&find=Appearance): Escuro, claro ou seguindo o seu dispositivo; ou um tema só seu.
- [**Novo tema**](/settings?s=general&find=New%20theme): Crie um tema próprio a partir de qualquer um deles.
- [**Importar**](/settings?s=general&find=Import): Adicionar um tema que alguém compartilhou.
- [**Idioma**](/settings?s=general&find=Language): O idioma em que o app é exibido e em que os agentes escrevem.
- [**Movimento**](/settings?s=general&find=Motion): Quanto o app se move: total, calmo (nada desliza nem esmaece ao abrir uma página ou uma janela) ou nenhum.
- [**Tamanho do texto**](/settings?s=general&find=Text%20size): Tamanho das mensagens, das páginas da Ajuda e da caixa de digitação neste dispositivo: padrão, grande ou maior.
- [**Enviar enquanto um agente trabalha**](/settings?s=general&find=Sending%20while%20an%20agent%20works): Enter entra no turno em andamento ou espera ele terminar.
- [**Sugestões do terminal**](/settings?s=general&find=Terminal%20suggestions): Sugestões em cinza depois do cursor nos terminais.
- [**Detalhes técnicos**](/settings?s=general&find=Technical%20details): Web apps em palavras simples, ou também com arquivos, comandos e logs.
- [**Retomar após limites de uso**](/settings?s=general&find=Resume%20after%20usage%20limits): Continua uma sessão um minuto depois que o limite de um plano é renovado.
- [**Excluir sessões inativas**](/settings?s=general&find=Delete%20inactive%20sessions): Exclui sessões que ninguém usou por um ano, ou pelo tempo que você escolher; até lá, toda conversa é mantida.
- [**Limitar cada sessão**](/settings?s=general&find=Limit%20each%20session): O máximo de memória e de processadores que os programas de uma sessão podem usar.
- [**Iniciar quando este computador ligar**](/settings?s=general&find=Start%20when%20this%20computer%20starts): Inicia o app quando o computador liga.
- [**Manter o computador ativo**](/settings?s=general&find=Keep%20the%20computer%20awake): Nos apps de computador, o computador não entra em suspensão sozinho enquanto os agentes trabalham e antes das tarefas agendadas.
- [**Atualizar automaticamente**](/settings?s=general&find=Update%20automatically): Instala novas versões sozinho: os apps de computador assim que saem, com um minuto de aviso; uma cópia do git quando você não a usa há algum tempo.
- [**Lean (verificador de demonstrações)**](/settings?s=general&find=Lean%20%28proof%20checker%29): Permite que os agentes verifiquem demonstrações matemáticas: uma demonstração que o Lean aceita está correta.
- [**Adicionar Mathlib**](/settings?s=general&find=Add%20Mathlib): Adicionar ao Lean a biblioteca de que a maior parte da matemática precisa.
- [**Fazer o tour**](/settings?s=general&find=Take%20the%20tour): Veja o que cada parte do app faz.
- [**Dicas**](/settings?s=general&find=Tips): Mostra uma parte do app na primeira vez que você chega a ela, depois do tour de boas-vindas.
- [**Ideias para começar**](/settings?s=general&find=Starter%20ideas): Exemplos, seus apps e uma automação abaixo da caixa de mensagem vazia na página inicial.
- [**Verificar agora**](/settings?s=general&find=Check%20now): Procurar uma versão mais recente agora.

### Notificações

[Configurações → Notificações](/settings?s=notifications): quando uma sessão termina, falha ou precisa da sua resposta. Mais em [Caixa de entrada e notificações](/guide/inbox).

- [**Notificar este dispositivo**](/settings?s=notifications&find=Notify%20this%20device): Um aviso quando uma sessão termina, falha ou precisa da sua resposta, mesmo com o app fechado.
- [**Som**](/settings?s=notifications&find=Sound): Um toque curto a cada aviso enquanto o app está aberto.
- [**Enviar um teste**](/settings?s=notifications&find=Send%20a%20test): Enviar um aviso para este dispositivo agora.

### Usar no celular

[Configurações → Usar no celular](/settings?s=phone): abra o app no seu próprio celular, de forma privada com o Tailscale, e receba as notificações dele lá. Mais em [Celulares, outras máquinas e compartilhamento](/guide/devices).

- [**Servir nos meus dispositivos**](/settings?s=phone&find=Serve%20it%20on%20my%20devices): Publica o app via HTTPS apenas para os dispositivos conectados à sua conta do Tailscale, nunca para a internet pública.
- [**Tailscale neste computador**](/settings?s=phone&find=Tailscale%20on%20this%20computer): Se o Tailscale está instalado e conectado aqui, e o nome deste computador na sua tailnet.
- [**Abrir no celular**](/settings?s=phone&find=Open%20it%20on%20your%20phone): Um QR code do endereço do app para a câmera do celular, e os passos no celular.
- [**Parar de servir**](/settings?s=phone&find=Stop%20serving): Tira o app da sua tailnet, desfazendo exatamente o que Serve it on my devices fez.
- [**Adicionar à Tela de Início**](/settings?s=phone&find=Add%20to%20Home%20Screen): No celular: o Hydor com ícone próprio, em tela cheia; as notificações no iPhone exigem isso.

### Apps de chat

[Configurações → Apps de chat](/settings?s=chat): fale com seus agentes pelo Telegram, Discord ou Slack: comece sessões, envie fotos, arquivos e mensagens de voz, receba as respostas deles e responda ao que perguntarem. Mais em [Celulares, outras máquinas e compartilhamento](/guide/devices).

- [**Telegram**](/settings?s=chat&find=Telegram): Um bot do Telegram só seu, criado com @BotFather, com o qual seus chats conversam.
- [**Discord**](/settings?s=chat&find=Discord): Um bot do Discord só seu, criado no Developer Portal, com o qual seus chats conversam.
- [**Slack**](/settings?s=chat&find=Slack): Um app do Slack só seu, criado a partir de um manifesto, com o qual seus chats conversam.
- [**Vincular um chat**](/settings?s=chat&find=Link%20a%20chat): Deixa um chat do Telegram, Discord ou Slack usar seus agentes, com um código que funciona uma vez.
- [**Adicionar o bot a um servidor**](/settings?s=chat&find=Add%20the%20bot%20to%20a%20server): O link que adiciona seu bot do Discord a um servidor seu, com as permissões de que ele precisa.
- [**Copiar manifesto**](/settings?s=chat&find=Copy%20manifest): O manifesto do app do Slack, com o Socket Mode e os escopos de que ele precisa, para colar ao criar o app.
- [**Novas sessões usam**](/settings?s=chat&find=New%20sessions%20use): O agente que uma mensagem de um chat inicia quando o chat não está em nenhuma sessão.
- [**Novas sessões como**](/settings?s=chat&find=New%20sessions%20as): Um dos seus agentes com o qual uma nova sessão de um chat começa; /as no chat escolhe outro.
- [**Avisos de todas as sessões**](/settings?s=chat&find=Notices%20from%20every%20session): Os avisos de todas as sessões nos seus chats, não só os das sessões que um chat iniciou.

### Senha

[Configurações → Senha](/settings?s=security): a senha deste app e como sair. Mais em [Aparência, idioma e atualizações](/guide/app).

- [**Alterar senha**](/settings?s=security&find=Change%20password): Alterar a senha desconecta todos os outros navegadores.
- [**Sair deste navegador**](/settings?s=security&find=Sign%20out%20of%20this%20browser): Você precisa da senha para voltar.

### Assinaturas

[Configurações → Assinaturas](/settings?s=signatures): sua assinatura e rubrica, desenhadas uma vez e guardadas criptografadas, para os documentos que você assina. Mais em [Páginas, documentos e imagens](/guide/library).

- [**Nova assinatura**](/settings?s=signatures&find=New%20signature): Desenhe, digite ou envie sua assinatura ou rubrica.

### Controle de versão

[Configurações → Controle de versão](/settings?s=scm): contas do GitHub e do Gitea para abrir pull requests. Mais em [Celulares, outras máquinas e compartilhamento](/guide/devices).

- [**Adicionar uma conta**](/settings?s=scm&find=Add%20an%20account): Uma conta para abrir pull requests.

### Conectar outros agentes

[Configurações → Conectar outros agentes](/settings?s=connect): deixe agentes de outros lugares começar e conduzir sessões aqui, pelo servidor MCP deste app. Mais em [Celulares, outras máquinas e compartilhamento](/guide/devices).

- [**Novo token**](/settings?s=connect&find=New%20token): Um token para um agente em outro lugar começar e conduzir sessões aqui.
- [**O que eles podem fazer**](/settings?s=connect&find=What%20they%20can%20do): As ferramentas que um agente com um token recebe.

### Máquinas

[Configurações → Máquinas](/settings?s=machines): outras máquinas com o Hydor, para usar daqui, e o acesso a esta. Mais em [Celulares, outras máquinas e compartilhamento](/guide/devices).

- [**Adicionar uma máquina**](/settings?s=machines&find=Add%20a%20machine): Outra máquina com o Hydor, para usar daqui.
- [**Acesso de outras máquinas**](/settings?s=machines&find=Access%20from%20other%20machines): Tokens que outras máquinas usam para acessar esta.

## Agentes

### Contas

[Configurações → Contas](/settings?s=accounts): os logins do Claude Code, Codex, Grok Build e Antigravity CLI que toda sessão usa. Mais em [Agentes, contas e modelos](/guide/agents-models).

- [**Contas**](/settings?s=accounts&find=Accounts): Os logins do Claude Code, Codex, Grok Build e Antigravity CLI que as sessões usam, e outros que você adicionar.
- [**Trocar de conta no limite**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit): Uma sessão que fica sem uso continua com outra conta.
- [**Usar crédito de API no limite**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit): Quando todas as contas do Claude Code atingem o limite, as sessões continuam cobradas em uma chave de API da Anthropic.
- [**Programas de agentes**](/settings?s=accounts&find=Agent%20programs): Quais programas de agentes estão instalados, incluindo o Grok Build, e a instalação dos outros.
- [**Atualizar automaticamente**](/settings?s=accounts&find=Update%20automatically): Mantém o Claude Code, o Codex e os outros programas de agentes na versão mais recente.

### Mais agentes

[Configurações → Mais agentes](/settings?s=agents): Gemini CLI, Antigravity CLI, Grok Build, OpenCode, Goose e outros agentes que usam ACP. Mais em [Agentes, contas e modelos](/guide/agents-models).

- [**Seus agentes**](/settings?s=agents&find=Your%20agents): Agentes que aparecem ao lado do Claude Code e do Codex.
- [**Adicionar o seu**](/settings?s=agents&find=Add%20your%20own): Qualquer agente que fale ACP, pelo comando dele.
- [**Agentes que falam ACP**](/settings?s=agents&find=Agents%20that%20speak%20ACP): Gemini CLI, Antigravity CLI, OpenCode, Qwen Code, Goose e Grok Build, prontos para adicionar.

### Modelos

[Configurações → Modelos](/settings?s=models): modelos para o Custom, o agente do próprio app: seus planos do Claude e do ChatGPT pelo Claude Code e pelo Codex, modelos neste computador, e OpenRouter ou outros provedores na nuvem. Mais em [Agentes, contas e modelos](/guide/agents-models).

- [**Modelo auxiliar**](/settings?s=models&find=Helper%20model): O modelo para tarefas pequenas ao lado das sessões.
- [**Níveis**](/settings?s=models&find=Tiers): O modelo que Rápido, Padrão, Melhor e Máximo significam para cada programa: uma sessão lidera em Melhor ou Máximo, e seus subagentes recebem Padrão e Rápido.
- [**Liderar com subagentes**](/settings?s=models&find=Lead%20with%20subagents): O agente principal de uma sessão planeja, passa partes claras para subagentes em níveis mais baratos e confere o trabalho deles.
- [**Máximo para problemas difíceis**](/settings?s=models&find=Max%20for%20hard%20problems): Um agente principal em Automático pode subir sozinho para Máximo quando um problema se mostra mais difícil do que o Melhor consegue resolver.
- [**Suas assinaturas**](/settings?s=models&find=Your%20subscriptions): Os modelos dos seus planos do Claude e do ChatGPT, que o Custom pode usar pelo Claude Code e pelo Codex.
- [**Nesta máquina**](/settings?s=models&find=On%20this%20machine): Modelos instalados aqui e seus downloads.
- [**Adicionar um modelo do Hugging Face**](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face): Os sugeridos para este computador, ou pesquise, veja como cada um rodaria aqui e instale.
- [**OpenRouter**](/settings?s=models&find=OpenRouter): Modelos via OpenRouter, com a sua chave.
- [**Runtimes e endpoints**](/settings?s=models&find=Runtimes%20and%20endpoints): Ollama, vLLM e outros endpoints compatíveis com a OpenAI.
- [**Token do Hugging Face**](/settings?s=models&find=Hugging%20Face%20token): Só para modelos restritos ou privados.

### Diretrizes dos agentes

[Configurações → Diretrizes dos agentes](/settings?s=guidelines): o que todo agente segue: em todas as sessões, em um projeto ou em uma sessão. Mais em [Diretrizes dos agentes](/guide/guidelines).

- [**Para todas as sessões**](/settings?s=guidelines&find=For%20every%20session): O que todo agente segue, em todas as sessões.
- [**Para um projeto**](/settings?s=guidelines&find=For%20a%20project): Diretrizes que as sessões de um projeto seguem.
- [**Para uma sessão**](/settings?s=guidelines&find=For%20one%20session): Diretrizes de uma sessão, na página inicial ou no menu da sessão.
- [**Arquivos de instruções**](/settings?s=guidelines&find=Instruction%20files): CLAUDE.md e AGENTS.md, que o Claude Code e o Codex leem por conta própria.

### Servidores MCP

[Configurações → Servidores MCP](/settings?s=mcp): ferramentas que os agentes podem chamar. Mais em [Apps conectados, chaves e ferramentas](/guide/connections).

- [**Adicionar servidor**](/settings?s=mcp&find=Add%20server): Um servidor de ferramentas para o Claude Code ou o Codex.
- [**Verificar conexões**](/settings?s=mcp&find=Check%20connections): Veja se cada servidor MCP responde.

### Habilidades

[Configurações → Habilidades](/settings?s=skills): métodos escritos que os agentes carregam quando uma tarefa pede: integrados, seus, de plugins e dos próprios agentes. Mais em [Habilidades](/guide/skills).

- [**Nova habilidade**](/settings?s=skills&find=New%20skill): Escreva uma habilidade para todos os agentes, ou só para o Claude Code ou o Codex.
- [**Integrado**](/settings?s=skills&find=Built%20in): As habilidades que vêm com o app.
- [**Seus**](/settings?s=skills&find=Yours): Habilidades que você escreveu ou aprovou quando um agente as sugeriu.
- [**De plugins**](/settings?s=skills&find=From%20plugins): Habilidades que seus plugins trazem.
- [**Claude Code e Codex**](/settings?s=skills&find=Claude%20Code%20and%20Codex): As habilidades próprias dos agentes, que só eles recebem.
- [**Sugerir habilidades adequadas**](/settings?s=skills&find=Suggest%20skills%20that%20fit): O agente de uma nova sessão fica sabendo quais habilidades combinam com a primeira mensagem.
- [**Acionar habilidades por palavras-chave**](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords): Palavras-chave em uma mensagem carregam habilidades sozinhas.
- [**Fazer minha própria versão**](/settings?s=skills&find=Make%20my%20own%20version): Alterar uma habilidade integrada: a sua versão ocupa o lugar dela.

### Plugins

[Configurações → Plugins](/settings?s=plugins): extensões que levam habilidades, ferramentas e instruções a todos os agentes. Mais em [Apps conectados, chaves e ferramentas](/guide/connections).

- [**Seus plugins**](/settings?s=plugins&find=Your%20plugins): Os plugins que você adicionou, ligados ou desligados para todos os agentes.
- [**Vêm com o app**](/settings?s=plugins&find=Come%20with%20the%20app): Plugins que vêm com o app, prontos para adicionar.
- [**Criar um plugin**](/settings?s=plugins&find=Make%20a%20plugin): Reúna habilidades, ferramentas, instruções e arquivos seus em um plugin.
- [**De um link**](/settings?s=plugins&find=From%20a%20link): Adicionar um plugin do GitHub ou de outro endereço Git.
- [**De um arquivo .zip**](/settings?s=plugins&find=From%20a%20.zip%20file): Adicionar um plugin que alguém empacotou em um .zip.
- [**Empacotar em .zip**](/settings?s=plugins&find=Pack%20into%20a%20.zip): Um plugin em um só arquivo para compartilhar.
- [**Claude Code**](/settings?s=plugins&find=Claude%20Code): Plugins e marketplaces do próprio Claude Code.
- [**Codex**](/settings?s=plugins&find=Codex): Plugins e marketplaces do próprio Codex.

### Tarefas agendadas

[Configurações → Tarefas agendadas](/settings?s=tasks): trabalho de agentes que começa sozinho: em um horário, uma vez ou quando um webhook chama. Mais em [Tarefas agendadas](/guide/tasks).

- [**Nova tarefa**](/settings?s=tasks&find=New%20task): Trabalho de agentes que começa sozinho.
- [**Visão semanal**](/settings?s=tasks&find=Week%20view): Tudo o que roda sozinho, em uma semana: o que rodou e o que roda em seguida.
- [**Começar de um exemplo**](/settings?s=tasks&find=Start%20from%20an%20example): Tarefas agendadas prontas.
- [**Resumo da manhã**](/settings?s=tasks&find=Morning%20brief): Uma tarefa agendada pronta.
- [**Notícias sobre um assunto**](/settings?s=tasks&find=News%20on%20a%20topic): Uma tarefa agendada pronta.
- [**Monitor de preço**](/settings?s=tasks&find=Price%20watch): Uma tarefa agendada pronta.
- [**Alerta de mudança de página**](/settings?s=tasks&find=Page%20change%20alert): Uma tarefa agendada pronta.
- [**Relatório semanal de uma pasta**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): Uma tarefa agendada pronta.
- [**Resumo da caixa de entrada**](/settings?s=tasks&find=Inbox%20digest): Uma tarefa agendada pronta.
- [**Check-in de hábito**](/settings?s=tasks&find=Habit%20check-in): Uma tarefa agendada pronta.
- [**Novos lançamentos**](/settings?s=tasks&find=New%20releases): Uma tarefa agendada pronta.
- [**Verificação de site no ar**](/settings?s=tasks&find=Site%20up%20check): Uma tarefa agendada pronta.
- [**Alerta de espaço em disco**](/settings?s=tasks&find=Disk%20space%20alert): Uma tarefa agendada pronta.
- [**Revisar novos pull requests**](/settings?s=tasks&find=Review%20new%20pull%20requests): Uma tarefa agendada pronta.
- [**Doutor de CI**](/settings?s=tasks&find=CI%20doctor): Uma tarefa agendada pronta.
- [**Triagem de issues**](/settings?s=tasks&find=Issue%20triage): Uma tarefa agendada pronta.
- [**Jardineiro de dependências**](/settings?s=tasks&find=Dependency%20gardener): Uma tarefa agendada pronta.
- [**Primeiro socorro a incidentes**](/settings?s=tasks&find=Incident%20first%20responder): Uma tarefa agendada pronta.
- [**Novos arquivos em uma pasta**](/settings?s=tasks&find=New%20files%20in%20a%20folder): Uma tarefa agendada pronta.
- [**Lembrete**](/settings?s=tasks&find=Reminder): Uma tarefa agendada pronta.

## Recursos

### Pesquisa

[Configurações → Pesquisa](/settings?s=search): como os agentes buscam na web: Naget Search e outros provedores. Mais em [Pesquisa e navegador](/guide/web).

- [**Provedores**](/settings?s=search&find=Providers): Quais provedores de busca os agentes usam e em que ordem.
- [**Naget Search**](/settings?s=search&find=Naget%20Search): A busca na web própria do app.
- [**SearXNG**](/settings?s=search&find=SearXNG): Um mecanismo de busca que você mesmo executa.
- [**Brave Search**](/settings?s=search&find=Brave%20Search): Busca na web com uma chave do Brave.
- [**DuckDuckGo**](/settings?s=search&find=DuckDuckGo): Busca na web sem chave.
- [**Resultados por busca**](/settings?s=search&find=Results%20per%20search): Quantos resultados uma busca traz.

### Navegador

[Configurações → Navegador](/settings?s=browser): um navegador da web que os agentes usam e que você pode acompanhar e assumir. Mais em [Pesquisa e navegador](/guide/web).

- [**Um navegador para agentes**](/settings?s=browser&find=A%20browser%20for%20agents): Agentes abrem sites, clicam, digitam e leem páginas.
- [**Chromium**](/settings?s=browser&find=Chromium): Qual Chromium o navegador executa.
- [**Mostrar uma janela**](/settings?s=browser&find=Show%20a%20window): Executar o navegador em uma janela visível.
- [**Manter as páginas longe desta máquina e da rede dela**](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network): Sites deste computador e da rede dele continuam fora de alcance.
- [**Capturas de tela para modelos que enxergam imagens**](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images): Modelos que enxergam imagens recebem capturas de tela da página.
- [**Sites**](/settings?s=browser&find=Sites): Somente estes sites, ou nunca estes.
- [**Perfis**](/settings?s=browser&find=Profiles): Logins separados para o navegador.
- [**Perguntar antes de enviar em sites com login**](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites): Antes de um agente enviar, publicar, excluir ou transferir algo em um site em que ele esteja conectado.
- [**Favoritos**](/settings?s=browser&find=Bookmarks): Os seus, junto com os dos outros navegadores deste computador.
- [**Extensões**](/settings?s=browser&find=Extensions): Extensões do Chrome, no app para computador.
- [**Configurações do navegador**](/settings?s=browser&find=Browser%20settings): Página inicial, mecanismo de busca, atalhos de pesquisa, zoom da página, verificação ortográfica, tradução, páginas escuras, bloqueador de anúncios com suas listas de filtros, idiomas e sites onde anúncios são permitidos, histórico e limpeza do que ele guardou.

### Uso do computador

[Configurações → Uso do computador](/settings?s=computer): os agentes veem sua tela e usam o mouse e o teclado, no app desktop. Mais em [Pesquisa e navegador](/guide/web).

- [**Uso do computador**](/settings?s=computer&find=Computer%20use): Os agentes veem a tela e usam o mouse e o teclado, em qualquer app (em sites, ficam no navegador). Cada sessão pergunta antes.
- [**Acessibilidade**](/settings?s=computer&find=Accessibility): Permissão do macOS para o Hydor usar o mouse e o teclado.
- [**Gravação de Tela**](/settings?s=computer&find=Screen%20Recording): Permissão do macOS para o Hydor ver a tela.

### Memória

[Configurações → Memória](/settings?s=memory): o que os agentes lembram sobre você, seus projetos e cada sessão, e quando foi escrito. Mais em [Memória](/guide/memory).

- [**Memória**](/settings?s=memory&find=Memory): Os agentes começam com o que sessões anteriores guardaram e salvam notas quando você pedir.
- [**Memória wiki**](/settings?s=memory&find=Wiki%20memory): Artigos que os agentes mantêm para cada projeto, a partir dos documentos e do trabalho dele: ativados em todo projeto, a menos que as configurações do próprio projeto digam o contrário.
- [**Aprender com novos documentos**](/settings?s=memory&find=Learn%20from%20new%20documents): Documentos novos e alterados adicionam notas à memória e atualizam a wiki, com o modelo auxiliar.
- [**Máximo de documentos para ler na wiki**](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki): Com mais documentos do que isso, a wiki de um projeto lê os fixados, os mais usados e os mais recentes: os agentes pesquisam em todos.
- [**Pasta da wiki**](/settings?s=memory&find=Wiki%20folder): Onde fica a wiki compartilhada e as wikis dos projetos, a menos que definido abaixo.
- [**Wikis dos projetos**](/settings?s=memory&find=Project%20wikis): Onde fica a wiki de cada projeto: na pasta wiki ou na pasta de cada projeto.
- [**Pasta dentro de cada projeto**](/settings?s=memory&find=Folder%20inside%20each%20project): Em que lugar da pasta cada projeto guarda sua wiki.
- [**Deixar fora do Git**](/settings?s=memory&find=Leave%20it%20out%20of%20Git): Adiciona a pasta wiki do projeto ao .gitignore dele, só em repositórios Git.
- [**Busca por significado**](/settings?s=memory&find=Search%20by%20meaning): Encontra notas, e qualquer coisa nesta busca, pelo significado.
- [**Notas com que cada agente começa**](/settings?s=memory&find=Notes%20each%20agent%20starts%20with): Além do seu perfil: no máximo este número de notas que tenham a ver com o que você pergunta, e os títulos das demais.
- [**Organizar automaticamente**](/settings?s=memory&find=Tidy%20up%20automatically): Cerca de uma vez por dia, depois de algo novo: junta notas que dizem a mesma coisa, resume as relacionadas e dá títulos a elas.
- [**Aprender com as conversas**](/settings?s=memory&find=Learn%20from%20conversations): Com a organização: corrige notas que as conversas mostram estar erradas, verifica as não verificadas e guarda algumas novidades.
- [**Organizar agora**](/settings?s=memory&find=Tidy%20up%20now): Organiza a memória de uma vez.
- [**Seu perfil**](/settings?s=memory&find=Your%20profile): O que todo agente recebe sobre você no início de uma sessão; os agentes o mantêm atualizado.
- [**Tamanho do perfil**](/settings?s=memory&find=Profile%20length): O máximo de palavras que seu perfil pode ter; se for maior, o modelo auxiliar o encurta.
- [**Notas**](/settings?s=memory&find=Notes): Todas as notas guardadas, por local.
- [**Adicionar uma nota**](/settings?s=memory&find=Add%20a%20note): Escreva uma nota para os agentes lembrarem, sobre você ou sobre um projeto.
- [**Notas excluídas**](/settings?s=memory&find=Deleted%20notes): Notas excluídas nos últimos 30 dias, para restaurar.
- [**Trazer…**](/settings?s=memory&find=Bring%20in%E2%80%A6): Notas sobre o que outros assistentes sabem de você e as habilidades que você criou neles: Claude Code, Codex, outros agentes ou uma exportação do ChatGPT ou do Claude.
- [**Exportar**](/settings?s=memory&find=Export): Todas as notas em Markdown para ler, ou em JSON com os históricos.
- [**Limpar tudo…**](/settings?s=memory&find=Clear%20all%E2%80%A6): Exclui todas as notas e o histórico delas.

### Subagentes

[Configurações → Subagentes](/settings?s=children): agentes que passam partes de um trabalho a subagentes e enxames para problemas difíceis. Mais em [Pesquisa aprofundada, segundas opiniões e vários agentes](/guide/research).

- [**Trabalhando ao mesmo tempo, por sessão**](/settings?s=children&find=Working%20at%20once%2C%20per%20session): Quantos subagentes do Hydor uma sessão executa ao mesmo tempo.
- [**Tamanho do enxame**](/settings?s=children&find=Swarm%20size): Quantos agentes de um enxame ou de uma campanha trabalham ao mesmo tempo.

### Objetivos

[Configurações → Objetivos](/settings?s=goals): os valores iniciais de um novo objetivo: as rodadas, quanto ele pergunta a você e quando segue com a própria escolha. Mais em [Objetivos](/guide/goals).

- [**Rodadas que um objetivo pode executar**](/settings?s=goals&find=Rounds%20a%20goal%20may%20run): Quantas rodadas um novo objetivo recebe antes de parar no limite, a menos que o agente proponha menos ou você altere ao combinar.
- [**Quanto um objetivo pergunta a você**](/settings?s=goals&find=How%20much%20a%20goal%20asks%20you): Se um novo objetivo trabalha por conta própria, pergunta nos pontos de virada ou pergunta a cada rodada.
- [**Segue com a própria escolha após**](/settings?s=goals&find=Goes%20on%20with%20its%20own%20pick%20after): Quanto tempo um novo objetivo espera pela sua resposta a uma pergunta antes de seguir com a própria escolha; 0 espera por você.

### Imagens, vídeo e áudio

[Configurações → Imagens, vídeo e áudio](/settings?s=images): imagens, vídeos, músicas e vozes que os agentes criam para você pelo OpenRouter, e quem escreve as legendas. Mais em [Documentos, imagens, vídeos e voz](/guide/documents-voice).

- [**Criação de imagens**](/settings?s=images&find=Making%20images): Permitir que os agentes criem imagens.
- [**Para a maioria das imagens (Melhor)**](/settings?s=images&find=For%20most%20pictures%20%28Best%29): O modelo que faz a maioria das imagens e cada alteração feita em uma.
- [**Para imagens simples (Rápido)**](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29): Um modelo mais barato e rápido para ícones, fundos, texturas e imagens simples.
- [**Ferramentas de imagem neste computador**](/settings?s=images&find=Picture%20tools%20on%20this%20computer): Tire o fundo de uma imagem, apague uma parte dela ou aumente-a, aqui mesmo: grátis, e suas imagens ficam neste computador.
- [**Criação de vídeos**](/settings?s=images&find=Making%20videos): Permitir que os agentes criem vídeos.
- [**Modelo de vídeo**](/settings?s=images&find=Video%20model): O modelo que faz vídeos.
- [**Usar a placa de vídeo para vídeos**](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos): Fazer a edição de vídeos na placa de vídeo, quando houver: mais rápido e com o processador livre.
- [**Criação de áudio**](/settings?s=images&find=Making%20audio): Permitir que os agentes criem áudio.
- [**Modelo de música**](/settings?s=images&find=Music%20model): O modelo que faz música.
- [**Modelo de voz e som**](/settings?s=images&find=Voice%20and%20sound%20model): O modelo que faz vozes e sons.
- [**Legendas do que você guarda**](/settings?s=images&find=Captions%20for%20what%20you%20keep): O modelo que escreve os títulos e as descrições das imagens, dos vídeos e dos áudios que você guarda.

### Voz

[Configurações → Voz](/settings?s=voice): dite mensagens e ouça as respostas em voz alta. Mais em [Documentos, imagens, vídeos e voz](/guide/documents-voice).

- [**Ditado**](/settings?s=voice&find=Dictation): Fale uma mensagem em vez de digitar.
- [**Idioma que você fala**](/settings?s=voice&find=Language%20you%20speak): O idioma que o ditado escuta.
- [**Reconhecimento de fala no servidor**](/settings?s=voice&find=Speech%20recognition%20on%20the%20server): Reconhecer fala neste computador ou com um serviço.
- [**Ler em voz alta**](/settings?s=voice&find=Read%20aloud): Ouvir as respostas em voz alta.

### Sugestões de palavras

[Configurações → Sugestões de palavras](/settings?s=suggest): o resto da palavra que você está digitando em cinza, e a próxima palavra, de um modelo pequeno que aprende com a sua escrita. Mais em [Documentos, imagens, vídeos e voz](/guide/documents-voice).

- [**Sugestões de palavras**](/settings?s=suggest&find=Word%20suggestions): O resto da palavra que você está digitando e a próxima, em cinza depois do cursor, de modelos que rodam neste computador; na primeira vez, baixa cerca de 1,2 GB.
- [**Mostrar neste navegador**](/settings?s=suggest&find=Show%20in%20this%20browser): Se este navegador mostra sugestões de palavras (cada navegador mantém a sua configuração).
- [**Modelo de linguagem**](/settings?s=suggest&find=Language%20model): Qwen3.5 junto com o modelo pequeno: automaticamente quando o computador tem memória, sempre ou nunca.
- [**Tamanho do modelo de linguagem**](/settings?s=suggest&find=Language%20model%20size): O modelo de linguagem em 8 bits (melhor) ou 4 bits (menor, um pouco pior).
- [**Segurança antes de mostrar**](/settings?s=suggest&find=How%20sure%20before%20showing): Quão segura uma sugestão precisa ser para aparecer: mais sugestões, ou menos sugestões e mais acertos.
- [**Mostrar a palavra seguinte**](/settings?s=suggest&find=Show%20the%20next%20word): Também a palavra seguinte, mais apagada.
- [**Zerar os números**](/settings?s=suggest&find=Reset%20the%20numbers): Recomeça do zero a contagem de teclas economizadas e de sugestões certas, e aprende de novo quanta certeza uma sugestão precisa ter.
- [**Em caixas de mensagem**](/settings?s=suggest&find=In%20message%20boxes): Sugestões na caixa em que você escreve uma mensagem para um agente.
- [**Em documentos**](/settings?s=suggest&find=In%20documents): Sugestões enquanto você escreve em um documento.
- [**Em notas**](/settings?s=suggest&find=In%20notes): Sugestões nas notas.
- [**Em outras caixas de texto**](/settings?s=suggest&find=In%20other%20text%20boxes): Sugestões em outros lugares onde você digita: acompanhamentos, a fila, um prompt anterior, painéis Perguntar.
- [**Palavras do que você digitou**](/settings?s=suggest&find=Words%20of%20what%20you%20typed): Quantas das palavras que você digitou antes do cursor ele lê.
- [**Palavras da resposta ou do documento**](/settings?s=suggest&find=Words%20of%20the%20reply%20or%20document): Quantas palavras da última resposta do agente, ou do documento antes do parágrafo, ele lê.
- [**Escolher por idioma**](/settings?s=suggest&find=Choose%20by%20language): Escolhe o modelo que se sai melhor no idioma do que você escreve.
- [**Aprender com a conversa**](/settings?s=suggest&find=Learn%20from%20the%20conversation): Usa as palavras usadas antes na conversa enquanto você digita uma mensagem.
- [**Threads**](/settings?s=suggest&find=Threads): Threads do processador para as sugestões (automático por padrão).
- [**Aprender com o que eu escrevo**](/settings?s=suggest&find=Learn%20from%20what%20I%20write): O modelo pequeno aprende com o que você escreve, neste computador, em segundo plano; cada rodada recomeça do que veio com o app.
- [**Quando ele aprende**](/settings?s=suggest&find=When%20it%20learns): Toda noite, toda semana ou só quando você pressionar Treinar de novo; ele espera até você ficar dez minutos sem digitar.
- [**Das minhas mensagens**](/settings?s=suggest&find=From%20my%20messages): Aprender com as mensagens que você escreveu para os agentes.
- [**Das respostas dos agentes**](/settings?s=suggest&find=From%20agents'%20replies): Aprender com o que os agentes responderam a você.
- [**Das minhas notas**](/settings?s=suggest&find=From%20my%20notes): Aprender com as notas de memória que você escreveu.
- [**Dos meus documentos**](/settings?s=suggest&find=From%20my%20documents): Aprender com os documentos e as páginas que você escreveu.
- [**Peso das minhas próprias palavras**](/settings?s=suggest&find=Weight%20of%20my%20own%20words): Quanto mais as palavras que você digitou contam em relação ao resto do que ele aprende.
- [**Threads para o aprendizado**](/settings?s=suggest&find=Threads%20for%20learning): Threads do processador para o aprendizado (automático por padrão).
- [**Aprender na placa de vídeo**](/settings?s=suggest&find=Learn%20on%20the%20graphics%20card): O aprendizado roda em uma placa de vídeo NVIDIA ou em um Mac com Apple silicon quando há uma livre, muitas vezes mais rápido do que no processador.
- [**Treinar de novo**](/settings?s=suggest&find=Retrain%20now): Aprende agora, em segundo plano, com tudo o que você escreveu, partindo do modelo pequeno que veio com o app.
- [**Esquecer o que aprendeu**](/settings?s=suggest&find=Forget%20what%20it%20learned): Exclui o modelo que aprendeu com você; o que veio com o app volta a ser usado.

### Seus agentes

[Configurações → Seus agentes](/settings?s=assistants): para onde vão as pastas de tarefas e a limpeza depois de uma tarefa; seus agentes ficam na página Agentes. Mais em [Agentes](/guide/agents).

- [**Seus agentes**](/settings?s=assistants&find=Your%20agents): Seus agentes estão na página Agentes.
- [**Limpar depois de uma tarefa**](/settings?s=assistants&find=Clean%20up%20after%20a%20task): Os agentes removem o que criaram pelo caminho e não precisam mais.
- [**Pastas de tarefas**](/settings?s=assistants&find=Task%20folders): Para onde vão as novas pastas de tarefas, em sessões iniciadas sem uma pasta.

### Apps

[Configurações → Apps](/settings?s=apps): o que os apps sabem sobre você e quais são executados sem perguntar. Mais em [Apps](/guide/apps).

- [**Sobre você**](/settings?s=apps&find=About%20you): De onde os apps partem para fazer suas perguntas, para não perguntarem toda vez.
- [**Executar sem perguntar**](/settings?s=apps&find=Run%20without%20asking): Os apps que os agentes executam por você sem perguntar antes; remova um para voltar a ser perguntado.

### Custom

[Configurações → Custom](/settings?s=custom): modo automático e um sandbox para comandos. Mais em [Custom, o agente próprio do app](/guide/custom).

- [**Modo automático**](/settings?s=custom&find=Auto%20mode): O Custom aprova sozinho os passos seguros.
- [**Sandbox para comandos**](/settings?s=custom&find=Sandbox%20for%20commands): No modo Automático, os comandos rodam em um sandbox; o Acesso total roda sem ele.

## Perguntar a um agente

- "Onde eu mudo o que o Enter faz enquanto um agente trabalha?"
- "Ative o som das notificações."
- "Mostre minhas configurações de busca."
- "Defina o modelo auxiliar como o mais barato."
- "Desative a memória para novas sessões."
