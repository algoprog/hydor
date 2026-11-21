# Agentes, contas e modelos

O Hydor executa vários agentes de IA: Claude Code, Codex, Custom (o agente próprio do app, para qualquer modelo) e outros agentes que falam ACP, como Gemini CLI, OpenCode, Qwen Code, Goose ou Grok Build. Este tópico explica como eles se diferenciam, como os programas deles são instalados e se mantêm atualizados, como entrar em cada um (inclusive com mais de uma conta) e de onde vêm os modelos do Custom: OpenRouter, Ollama, modelos do Hugging Face executados neste computador ou qualquer endpoint compatível com OpenAI.

![Escolhendo o agente na página inicial: Claude Code, Codex ou Custom](images/agents-models.webp)

## Qual agente devo usar?

Um agente é o programa que faz o trabalho em uma sessão: ele lê sua mensagem, usa ferramentas (arquivos, comandos, a web) e responde. O modelo é a IA por trás dele. Todo agente aqui recebe a mesma ajuda do app (busca na web, o Navegador, a Memória, as Habilidades, suas conexões), mas eles diferem na origem dos modelos.

- **Claude Code** (Anthropic). Funciona com o seu plano do Claude ou cobra de uma conta da API da Anthropic. Os modelos dele são os da Anthropic (Opus, Sonnet, Haiku). Tem limites de uso próprios, que a [página Uso](/usage) mostra.
- **Codex** (OpenAI). Funciona com o seu plano do ChatGPT. Os modelos dele são os da OpenAI. Também tem limites de uso, mostrados na página Uso. O Codex vem com o app.
- **Custom**, o agente próprio do app. Ele executa os modelos dos seus planos do Claude e do ChatGPT (pelos logins do Claude Code e do Codex) e qualquer modelo que você adicionar em [Configurações → Agentes → Modelos](/settings?s=models): modelos pelo OpenRouter, modelos neste computador (com Ollama ou vLLM) ou qualquer endpoint compatível com OpenAI. Use-o para modelos abertos, modelos mais baratos ou modelos que nunca saem do seu computador. Veja [Custom, o agente próprio do app](/guide/custom).
- **Agentes que falam ACP**: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build (o agente de programação da xAI, com os modelos Grok) e outros, ou um comando seu. ACP (o Agent Client Protocol) é uma forma comum de um app conversar com um programa de agente. Cada um entra uma vez no próprio programa e usa os próprios modelos.

O que cada um pode fazer no app:

- Metas (o agente continua trabalhando até que uma condição seja cumprida) e forks (uma cópia da sessão a partir de uma resposta anterior): Claude Code, Codex e Custom. Os outros agentes ACP não.
- **Continuar em…** (passar a conversa para outro agente): do Claude Code ou do Codex, para o outro ou para o Custom.
- Esforço (o quanto o modelo pensa): Claude Code, Codex e Grok Build, e qualquer outro agente ACP cujos modelos ofereçam isso.
- Mais de uma conta, limites de uso do plano e troca de conta ao atingir um limite: Claude Code, Codex e Grok Build.
- Redefinição de limites e crédito da API ao atingir um limite: somente Claude Code e Codex.

## Escolher o agente e o modelo de uma nova sessão

Na página inicial (`/`), a linha abaixo da caixa de mensagem diz quem faz o trabalho.

1. Clique em **Executa em**. A lista mostra **Claude Code** (“Anthropic · plano Claude ou chave de API”), **Codex** (“OpenAI · plano ChatGPT ou chave de API”), **Custom** (“Qualquer modelo: OpenRouter, Ollama, vLLM”) e todos os agentes que você adicionou em Configurações → Mais agentes (“Agente ACP · ” e o comando dele). No fim, **Modelos do Custom** abre Configurações → Modelos, e **Adicionar ou gerenciar agentes** abre Configurações → Mais agentes.
2. Clique em **Modelo** e escolha um. **Automático**, no topo e já selecionado no início, deixa os níveis escolherem: Melhor e, se o problema se mostrar difícil demais, Máximo (veja [Níveis: um modelo para cada tipo de trabalho](#tiers-a-model-for-each-kind-of-job)). Abaixo dele, a lista mostra só os modelos do próprio agente. O padrão do agente aparece marcado como “padrão”. Versões mais antigas de um modelo ficam atrás de uma linha como “2 modelos mais antigos”; clique nela para vê-las. Quando há mais de oito modelos, uma caixa **Buscar modelos** aparece no topo: digite algumas letras e pressione Enter para escolher o primeiro resultado. Quando o agente não iniciou como o app pediu para listar seus modelos, o menu avisa, com as palavras do próprio agente sobre o motivo, e **Tentar de novo** pede outra vez.
3. Em **Opções** você encontra **Esforço** (para agentes e modelos que têm isso: Padrão, Baixo, Médio, Alto e assim por diante; para o Grok Build, veja [Esforço no Grok Build](#effort-for-grok-build)) e **Permissões** (o que o agente pode fazer sem perguntar a você). Shift+Tab na caixa de mensagem também alterna as permissões.

A página inicial lembra o que você escolheu para cada lugar em que trabalha (cada projeto, cada pasta e **Nova pasta de tarefa**), em todos os dispositivos: o modelo, o esforço e as permissões de cada programa voltam ali como você os deixou (veja [O que a página inicial lembra](/guide/sessions#what-the-start-page-remembers)).

Um agente ACP que não seja o Custom só mostra as escolhas de **Modelo** e **Permissões** depois da primeira sessão: elas listam o que o agente ofereceu na última vez em que foi executado. O Grok Build é a exceção: seus modelos, com os esforços que cada um aceita, aparecem assim que ele é adicionado, porque o app os pede ao Grok.

Com **Opções** → **Confidencial** ativado, **Executa em** fica em **Custom** e **Modelo** lista só os modelos deste computador ou da sua rede privada, com o melhor deles escolhido primeiro: veja [Manter uma sessão confidencial](/guide/sessions#keep-a-session-confidential).

No celular, cada um desses menus abre como uma folha a partir da parte de baixo da tela.

## Trocar de modelo no meio de uma sessão

Em uma sessão, o modelo, o esforço e as permissões ficam abaixo da caixa de mensagem. Eles formam um único chip que aparece como “Opus 5.5 · Alto · Planejar”: clique nele para ver **Modelo**, **Esforço** e **Permissões**.

Escolha outro modelo e a sessão continua com ele:

- O Claude Code troca na hora.
- O Codex usa o novo modelo a partir do próximo turno.
- O Custom usa o novo modelo a partir do próximo passo, até no meio de um turno.
- Outro agente ACP troca se oferecer uma escolha de modelos.

O **Esforço** da sessão funciona do mesmo jeito. Escolha um e o agente em execução o usa a partir do próximo turno. Se o modelo para o qual você trocou não aceita o esforço que você tinha, o seletor mostra o padrão desse modelo, e o modelo é executado com ele.

O menu de modelos lista apenas os modelos do agente da própria sessão; em uma sessão confidencial, apenas os que estão neste computador ou na sua rede privada. Para passar uma conversa para outro agente, use o menu da sessão (⋯) → **Continuar em Codex**, **Continuar em Claude Code** ou **Continuar em Custom Agent** (em sessões do Claude Code e do Codex; o Custom aparece quando já tem um modelo). Sua próxima mensagem então começa uma nova sessão desse agente na mesma pasta, com a conversa até aqui. Uma sessão parada é retomada no último modelo que usou, a menos que você escolha outro antes de enviar.

## Esforço no Grok Build

Os modelos do Grok aceitam um esforço de raciocínio, a mesma escolha que o Claude Code e o Codex oferecem:

- Grok 4.6 (e modelos mais novos que ofereçam o mesmo): **xhigh**, **alto**, **médio** ou **baixo**. **Alto** é o padrão.
- Grok 4.5: **alto**, **médio** ou **baixo**.

Na página inicial, escolha **Grok Build** em **Executa em** e depois **Opções** → **Esforço**: a lista mostra os esforços do modelo escolhido, com **Padrão**. Eles aparecem assim que o Grok Build é adicionado, mesmo antes da primeira sessão. Uma sessão do Grok Build em execução muda o esforço no próprio seletor de **Esforço** (o chip abaixo da caixa de mensagem), e a execução de um [app](/guide/apps) também aceita um. Quando você troca uma sessão para um modelo que não aceita o esforço que você tinha (xhigh no Grok 4.5), o seletor mostra o padrão desse modelo, e é com ele que o modelo é executado.

Isso não vale só para o Grok: qualquer outro agente que fale ACP e cujos modelos ofereçam esforços recebe a mesma escolha de **Esforço**.

## Níveis: um modelo para cada tipo de trabalho

Os agentes escolhem modelos por nível, e não por nome: **Rápido** para tarefas pequenas e bem claras, cujo resultado pode ser verificado, **Padrão** para tarefas claras de tamanho médio, **Melhor** para o agente principal de uma sessão, que planeja, lidera subagentes e confere o trabalho deles, e **Máximo** para os problemas mais difíceis. A maior parte de um trabalho são partes claras que um modelo mais barato faz bem, então uma sessão custa menos assim sem que o resultado piore: o modelo mais forte da sala continua planejando o trabalho e conferindo.

Na página inicial, **Modelo** abre em **Automático**: a sessão começa em Melhor (o mesmo **Automático** inicia as sessões de uma [tarefa agendada](/guide/tasks#model-effort-permissions-and-other-options), e um [app](/guide/apps) pode pensar com um nível em vez de um modelo por nome). O agente principal passa as partes claras para subagentes em Padrão e Rápido, e pode se mover para Máximo quando um problema se mostra mais difícil do que o Melhor consegue resolver (uma correção que falhou duas vezes, uma causa que ele não encontra, uma demonstração); uma linha na conversa avisa, com o motivo. Um pedido não vai para o Máximo só pela redação: o Melhor resolve a maior parte do que parece difícil, por menos. Escolha um modelo por nome e a sessão pensa com esse; os subagentes dela continuam recebendo níveis. Um agente seu pode pensar com um único nível (veja [Com o que um agente pensa: níveis](/guide/agents#what-an-agent-thinks-with-tiers)).

[Configurações → Agentes → Modelos → Níveis](/settings?s=models&find=Tiers) diz o que cada nível significa para cada programa: uma linha para cada nível, com um seletor ao lado do título do grupo para escolher o programa (**Claude Code**, **Codex** ou **Custom**) e, em cada linha, um modelo e, no Claude Code e no Codex, um esforço. O (i) de um nível diz mais sobre ele. No início, Rápido é o Haiku, Padrão é o Sonnet, Melhor é o Opus e Máximo é o Fable mais novo no Claude Code; no Codex, Rápido é o Luna, Padrão é o Terra, Melhor é o Sol e Máximo é o Astra (em um plano sem algum deles, o mais próximo que ele oferece, com mais esforço para o nível mais alto onde dois compartilham um modelo); os níveis do Custom se preenchem sozinhos: um nível que você deixa quieto usa o modelo mais novo do tipo dele entre os modelos que o Custom tem. Do seu plano do Claude, isso é Haiku para Rápido, Sonnet para Padrão, Opus para Melhor e o Fable mais novo para Máximo; senão, do seu plano do ChatGPT, Luna, Terra, Sol e Astra; senão, dos modelos que você adicionou que não estão neste computador (OpenRouter, um endpoint) e cujos nomes indicam uma dessas famílias. Um modelo neste computador nunca é escolhido por você, porque o nome dele não diz o quanto é forte, e um modelo pequeno (Haiku, Luna) nunca vira Melhor: com apenas modelos pequenos ou locais, os níveis ficam vazios até você escolher, e uma sessão do Custom então mantém o modelo que escolheu. Quando o Melhor aponta um modelo, a página inicial oferece **Automático** para o Custom, e as sessões dele lideram subagentes (subagentes do Hydor, já que o Custom não tem uma ferramenta Agent própria). Na aba **Custom** você pode indicar qualquer um dos modelos dele para um nível (veja [De onde vêm os modelos do Custom](#where-customs-models-come-from)). Um nível que você deixa quieto acompanha o modelo mais novo do tipo dele no programa. **Voltar aos padrões**, no menu **⋯** ao lado do título, restaura tudo, inclusive as escolhas do Custom.

Dois seletores no grupo **Níveis nas sessões**, abaixo dos níveis, dizem como as sessões os usam:

- **Liderar com subagentes** (ativado no início): o agente principal de uma sessão é orientado a planejar, passar partes claras para subagentes em níveis mais baratos e conferir o trabalho deles, e um subagente pedido sem nível recebe Padrão. Desativado, os agentes trabalham sozinhos, a menos que escolham outra coisa, e a página inicial e o formulário de tarefa não têm Automático.
- **Máximo para problemas difíceis** (ativado no início): um agente principal em Automático pode se mover para Máximo quando um problema se mostra difícil demais para o Melhor. Desativado, as sessões em Automático ficam no Melhor.

## Os programas de agentes se instalam e se atualizam sozinhos

Claude Code, Codex, Gemini CLI, Grok Build e os outros são programas neste computador. Você não precisa instalá-los à mão.

Abra [Configurações → Agentes → Contas](/settings?s=accounts&find=Agent%20programs) e veja o grupo **Programas de agentes**. Ele lista Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build (depois de você adicioná-lo) e os agentes que precisam de um adaptador ACP, cada um com a versão que as sessões executam e de onde ela vem:

- **instalação própria**: você mesmo a instalou (no Grok Build, também com o instalador da própria xAI, que o coloca em `~/.grok/bin`).
- **instalado pelo app**: o app o instalou na própria pasta.
- **vem com o app**: o Codex acompanha o app.
- **Não está aqui: instala sozinho no primeiro uso**: ausente. Clique em **Instalar** para obtê-lo agora.

Uma linha também diz “… saiu” quando há uma versão mais nova. A linha do Codex acrescenta “o seu no terminal: …” quando você também tem um Codex próprio: as sessões executam o do app, e um terminal executa o seu.

Um programa ausente também se instala sozinho na primeira vez em que é necessário: o Claude Code quando você entra nele ou começa uma sessão do Claude Code, um agente ACP quando você o adiciona em Configurações → Agentes → Mais agentes ou começa uma sessão com ele. O app os instala com npm na própria pasta, então você não precisa de direitos de administrador.

Goose, Kimi CLI e alguns outros agentes não estão nesta lista: instale-os você mesmo (Configurações → Agentes → Mais agentes mostra onde obtê-los). Um agente que precisa de um adaptador ACP se instala em duas partes, o adaptador e o agente em si; a lista mostra uma linha para os dois.

## Manter os programas de agentes atualizados

Com [**Atualizar automaticamente**](/settings?s=accounts&find=Update%20automatically) ativado, a última linha de **Programas de agentes** (ele vem ativado, a menos que você o desative), o app atualiza cada programa de agente para a versão mais recente uma vez por dia. A primeira execução acontece cerca de dez minutos depois que o app inicia.

- As cópias que o app instalou são atualizadas com o npm, na própria pasta dele. O Codex passa a usar uma cópia mais nova do que a que veio com o app.
- As instalações feitas por você são atualizadas pelo atualizador delas: `claude update` para o Claude Code, `codex update` para o Codex (o que o seu terminal executa), `opencode upgrade` para o OpenCode, `grok update` para o Grok Build.
- Gemini CLI, Qwen Code, Auggie, Grok Build ou um agente com adaptador ACP que você instalou com `npm install -g` são atualizados com o npm, quando o seu usuário tem permissão de gravar nessa pasta. O que foi instalado de outra forma fica por sua conta: atualize do mesmo jeito que instalou.
- O Claude Code segue a própria linha de versões: a estável quando as configurações dele dizem `"autoUpdatesChannel": "stable"`, e a mais recente nos demais casos.
- Se você desativou as atualizações do próprio Claude Code com `DISABLE_AUTOUPDATER=1` (a imagem do Docker faz isso), o app também não atualiza o seu Claude Code por conta própria. **Atualizar agora** continua atualizando.

O app só mantém uma versão nova quando ela funciona do jeito que as sessões a usam. O Claude Code precisa responder quando uma sessão começa e listar os modelos dele, o Codex precisa iniciar o servidor do app e listar os modelos dele, e os outros precisam iniciar e informar a versão. Nada disso exige login nem usa o seu plano. Cada um tem um minuto para responder, e só conta o tempo em que o computador está ativo, então um Mac que entra em repouso no meio da verificação não gasta o minuto. Um programa que demora a responder na primeira vez (o Mac examina um programa novo antes de executá-lo pela primeira vez) é iniciado de novo com mais dois minutos, e só falha se também não responder nesse prazo. Uma versão que falha é desfeita:

- Uma cópia que o app instalou, ou uma das suas que ele atualizou com o npm, volta à versão anterior.
- No caso do seu próprio Claude Code, as sessões continuam usando a versão anterior, que o instalador do Claude Code mantém ao lado da nova. O comando `claude` em um terminal continua na versão nova. A linha mostra “… did not work here”.
- Uma versão que falhou não é tentada de novo automaticamente, mas a próxima é, e **Atualizar agora** tenta de novo.

Abaixo dessa linha, aparece quando o app verificou pela última vez, como “Up to date · checked 2h ago”, com **Verificar agora** para verificar de novo. Quando há versões mais novas, ele avisa, com **Atualizar agora** para instalar todas de uma vez (não há um botão por programa); enquanto trabalha, mostra qual programa está atualizando. As linhas abaixo dizem o que a última atualização mudou, como “Claude Code 2.1.308 → 2.1.316”, ou por que uma versão não pôde ser instalada.

As sessões em execução continuam com a versão com que começaram; as novas sessões usam a nova. Com **Atualizar automaticamente** desativado, o app ainda verifica uma vez por dia e mostra o que há de novo, mas não instala nada até você clicar em **Atualizar agora**.

## Entrar no Claude Code, no Codex e no Grok Build

O Claude Code e o Codex precisam de login antes de funcionar, e o Grok Build também, depois de adicionado (veja [Add Gemini CLI, OpenCode and other ACP agents](#add-gemini-cli-opencode-and-other-acp-agents)). Abra [Configurações → Agentes → Contas](/settings?s=accounts) (no celular, as Configurações são uma lista de seções: toque em **Contas** em Agentes; o título no alto leva você de volta). O grupo **Contas** (o (i) dele diz que são os logins do Claude Code, do Codex e do Grok Build que as suas sessões usam, e que você pode adicionar outra assinatura, uma de trabalho e uma pessoal, por exemplo, e escolher uma ao começar uma sessão) lista primeiro o login próprio de cada agente e depois as contas que você adicionou para ele. O login próprio do Grok Build também tem uma linha ali, **Grok Build**, que aparece depois que ele é adicionado. Cada uma mostra um check verde com o e-mail, o plano e o método de login, ou uma cruz vermelha com “Not signed in” ou com o que deu errado.

Para entrar:

1. Clique em **Entrar** ao lado do agente.
2. Escolha como:
   - Claude Code: **Assinatura do Claude** (o seu plano do Claude) ou **Console (cobrança por API)** (uma conta de API da Anthropic).
   - Codex: **Código do dispositivo** ou **Redirecionamento do navegador**.
   - Grok Build: não há o que escolher, ele sempre entra com um código.
3. Clique em **Obter link de login**.
4. Siga os passos que a caixa de diálogo mostra:
   - Claude Code: abra o link (**Abrir página de login**), aprove o acesso no navegador, depois cole o código que a página mostra em **Cole o código da página** e clique em **Concluir login**.
   - Codex, Código do dispositivo: abra o link em qualquer dispositivo, entre no ChatGPT e digite o código de uso único mostrado na caixa de diálogo. A caixa percebe sozinha quando você termina.
   - Codex, Redirecionamento do navegador: depois que você entra, o navegador tenta abrir uma página “localhost” e falha. Copie o endereço dessa página, cole em **Cole o endereço localhost do seu navegador** e clique em **Concluir login**.
   - Grok Build: você recebe um link e um código de uso único. Abra o link em qualquer dispositivo, entre com a sua conta do Grok e confirme o código (**2. Confirme este código**). Nada é colado de volta: a caixa percebe sozinha quando você termina.

Quando dá certo, você vê “Claude Code is signed in” (ou Codex, ou Grok Build). Se falhar, a caixa de diálogo diz o motivo; clique em **Tentar de novo**.

Depois de entrar, o botão passa a dizer **Trocar de conta**: ele inicia o mesmo login para outra conta (no Grok Build, um novo código). **Sair** fica no menu **⋯** da linha: ele desconecta o programa neste computador, para todos os terminais e editores que o usam, depois que você confirma.

Se você começar uma sessão do Grok Build sem estar conectado, a sessão para com “Grok Build is not signed in: sign in with your Grok account in Settings → Agents → Accounts, then try again.” Entre ali e envie a mensagem de novo. Uma chave de API da xAI em `XAI_API_KEY`, no ambiente dos agentes, funciona no Grok Build no lugar de uma assinatura.

O tour de boas-vindas (em **Ajuda** na barra de ícones) pergunta quais agentes e modelos você quer usar e também guia você por esses logins.

## Adicionar uma segunda conta (trabalho e pessoal)

Você pode entrar com mais de uma conta do Claude Code, do Codex ou do Grok Build, por exemplo um plano de trabalho e um pessoal, e escolher uma por sessão.

1. Abra [Configurações → Agentes → Contas](/settings?s=accounts&find=Accounts).
2. Clique em **Adicionar uma conta**, ao lado do título do grupo **Contas**.
3. Escolha **Claude Code**, **Codex** ou **Grok Build** (ele é oferecido depois que o Grok Build está configurado), digite um nome (até 40 caracteres, como “Trabalho” ou “Pessoal”) e clique em **Adicionar e entrar**.
4. A caixa de diálogo de login abre para a nova conta. Entre como descrito acima.

Cada conta adicionada entra por conta própria e mantém o próprio histórico de sessões. Suas configurações, instruções, habilidades e plugins são compartilhados com o login principal do agente, então as mudanças valem para ambos. No Claude Code, uma pasta em que você confiou com o login principal também é confiável com uma conta adicionada, então as regras de permissão da própria pasta valem nas sessões dela. Duas contas do mesmo agente não podem ter o mesmo nome.

Uma conta adicionada do Grok Build tem uma pasta própria com o login e o histórico de sessões do próprio Grok. Ela compartilha com o seu login principal as configurações do próprio Grok CLI: a configuração, as regras (`AGENTS.md`), as habilidades, os plugins e os logins de MCP.

Cada conta adicionada tem a própria linha, abaixo do login próprio do agente, com **Entrar** ou **Trocar de conta**; o menu **⋯** dela tem **Sair**, **Renomear** e **Remover**:

- **Renomear** pede um novo nome.
- **Sair** impede que as sessões executadas com essa conta funcionem até ela entrar de novo.
- **Remover** tira a conta do app. As sessões dela saem da lista, mas o histórico fica no disco, a menos que você também marque **Excluir também o login e o histórico das sessões dela**. Não é possível remover uma conta enquanto há sessões em execução com ela: pare-as primeiro.

A [página de Uso](/usage) mostra um cartão para cada conta adicionada do Claude Code, do Codex ou do Grok Build, com os limites dela.

## Escolher a conta com que uma sessão é executada

Quando o agente escolhido tem contas adicionadas (no Grok Build, depois que você adicionou uma), as **Opções** da página inicial mostram uma linha **Conta**. Clique nela:

- **Seu login** é a conta própria do programa (a primeira daquele agente em **Contas**; no Grok Build, “The Grok Build CLI's own account”).
- Cada conta adicionada aparece com o nome dela.
- **Gerenciar contas** abre Configurações → Agentes → Contas.

A página inicial lembra a sua escolha para aquele agente, a mesma em todos os lugares. Uma sessão executada com uma conta adicionada mostra o nome dessa conta, com um ícone de pessoa, no alto da sessão. Se essa conta atingir um limite de uso, o aviso de limite acima da caixa de mensagem é sobre ela. A conta é definida quando a sessão começa. Ela muda sozinha apenas com **Trocar de conta no limite** (abaixo).

Para mover uma sessão para outra conta por conta própria, clique no chip **Conta** da sessão e escolha uma. Isso funciona para sessões do Claude Code, do Codex e do Grok Build, e vale a partir da sua próxima mensagem. O histórico do Grok de uma sessão do Grok Build vai junto; se o Grok não conseguir reabri-la na outra conta, ela começa do zero ali, com uma nota.

## Usar todas as suas contas: trocar no limite

Com duas ou mais contas do mesmo agente, o app pode usar todas elas: quando uma fica sem uso, o seu trabalho continua em outra. Abra [Configurações → Agentes → Contas](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) e encontre **Trocar de conta no limite**, no grupo **No limite de uso** em **Contas**, que aparece assim que você adiciona qualquer conta, inclusive a do Grok Build (o (i) dele diz que, quando a conta de uma sessão fica sem uso, a sessão passa para outra conta daquele agente que ainda tem uso e continua, e que as novas sessões pulam uma conta que está no limite). Ela vem ativada (desative ali se preferir escolher a conta você mesmo), e funciona sem nenhum navegador aberto.

- Quando um turno para porque a conta da sessão atingiu o limite de uso, o app escolhe outra conta conectada do mesmo agente que ainda tem uso (a menos usada), move a sessão para lá com todo o histórico e envia “… reached its usage limit, so this session now runs on …. Continue where you left off.” Uma nota curta na parte de baixo da tela diz para qual conta ela foi movida.
- Os subagentes que uma sessão do Claude Code executa em segundo plano também continuam. Os que ainda estão trabalhando quando o limite chega param no próximo passo, com o trabalho preservado, e o app espera por eles (no máximo dois minutos) antes de mover a sessão. A mensagem então os cita, e o agente continua cada um de onde parou. Se apenas os subagentes atingirem um limite (um só para o modelo deles), a sessão é movida quando o turno terminar e nenhum deles estiver mais trabalhando.
- Os subagentes do Hydor (as sessões que um agente inicia para fazer parte do trabalho) são sessões independentes, então cada um se move sozinho quando um limite interrompe o turno dele. O agente que o iniciou fica sabendo que ele continua, e não que falhou, e recebe a resposta quando ele termina.
- Seu login principal e cada conta adicionada contam. Contas do Claude Code assumem no lugar de contas do Claude Code, as do Codex no lugar das do Codex, e as do Grok Build no lugar das do Grok Build.
- Uma conta do Grok Build está no limite quando atinge o limite semanal, o limite de crédito ou o limite de gastos do pagamento por uso. A sessão então passa para outra conta do Grok conectada que ainda tem uso (a menos usada) e continua com “… reached its usage limit, so this session now runs on …”. Um limite de taxa curto (uma rajada de requisições) não move nada: passa sozinho. O aviso de limite acima da caixa de mensagem aparece também nas sessões do Grok.
- Uma meta do Codex acompanha a sessão e continua.
- Quando todas as contas estão no limite, nada é movido (a menos que **Usar crédito de API no limite** esteja ativado, abaixo, no Claude Code). Com **Retomar após limites de uso** ativado, a sessão continua quando a primeira conta é renovada, nessa conta. Isso vale também para as sessões do Grok Build. Mais em [Usage, limits and costs](/guide/usage#continue-sessions-automatically-after-a-limit).
- Uma nova sessão iniciada em uma conta que está no limite começa em uma que ainda tem uso, e uma mensagem que você envia a uma sessão cuja conta está no limite move a sessão primeiro, para que a mensagem não seja recusada. Junto com a sua mensagem, o agente fica sabendo que agora roda em uma conta com uso disponível, para não esperar a renovação da conta antiga, e quais dos seus subagentes podem continuar.
- As sessões abertas no VS Code ou em um terminal ficam na conta delas.
- As renovações de limite (créditos de redefinição do Codex, concessões de redefinição do Claude) e o crédito de API continuam valendo apenas para o Claude Code e o Codex.
- As perguntas rápidas do próprio app ao Claude Code ou ao Codex (o modelo auxiliar em **Automático**, os passos rápidos de modelo de um app, descrições de pull request, sugestões de comandos) vão para a sua próxima conta conectada da mesma forma quando uma está no limite ou desconectada. Quando nem o Claude Code nem o Codex conseguem responder, um dos seus modelos Custom assume (veja [When an account is signed out](#when-an-account-is-signed-out)).

## Quando uma conta está desconectada

Uma conta do Claude Code, do Codex ou do Grok Build pode ficar desconectada: o login dela terminou ou foi revogado, e o programa diz "Not logged in · Please run /login" ou "401 Unauthorized". O app dá um jeito quando pode e só pede que você entre de novo quando nada mais resolve.

- **Suas sessões.** Quando a vez de uma sessão é recusada porque a conta dela está desconectada, e [Trocar de conta no limite](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) está ativado (vem ativado desde o início), a sessão passa, com todo o histórico, para outra conta conectada do mesmo agente que ainda tenha uso disponível, e continua. Um aviso curto na parte de baixo da tela diz "<sessão>: <conta> está desconectada, então continua em <outra conta>", e o agente recebe a mensagem "… está desconectada, então esta sessão agora roda em …. Continue de onde parou." Uma mensagem que você envia a uma sessão cuja conta foi encontrada desconectada há pouco tempo a move primeiro da mesma forma, para que a mensagem não seja recusada.
- **Quando uma sessão não pode ser movida.** Com **Trocar de conta no limite** desativado, ou quando nenhuma outra conta desse agente tem uso disponível, a sessão para. Um aviso acima da caixa de mensagem diz "<conta> está desconectada" e "Esta sessão continua quando você entrar de novo.", com um botão **Entrar**. Assim que você entra de novo, aqui ou em um terminal, a sessão continua sozinha, e o agente recebe a mensagem "Você entrou de novo. Continue de onde parou."
- **Trabalho em segundo plano.** As tarefas pequenas do [modelo auxiliar](/settings?s=models&find=Helper%20model) em **Automático** (títulos de sessões, notas de memória, resumo do [seu perfil](/guide/memory#your-profile), etapas rápidas de modelo de um app, descrições de pull request…) ignoram uma conta desconectada por 15 minutos e depois tentam de novo, para que um login feito em um terminal seja notado. A próxima conta conectada responde, depois o Codex. Quando nem o Claude Code nem o Codex podem responder (desconectados, no limite ou não instalados), um dos seus modelos **Custom** faz o trabalho: o que o nível **Rápido** do Custom indica em [Configurações → Agentes → Modelos → Níveis](/settings?s=models&find=Tiers) (depois **Padrão** e, para os raros trabalhos maiores, **Melhor** e depois **Máximo**), ou então o modelo mais barato que você adicionou (um modelo neste computador conta como gratuito). No máximo dois são testados. O custo conta como o uso de qualquer modelo Custom.
- **O pedido para entrar.** Somente quando nada pôde fazer o trabalho e uma conta estava desconectada, um cartão aparece em todas as páginas, no canto inferior direito (acima da caixa de mensagem no celular). O título é "Entre de novo no Claude Code" (ou Codex, ou Grok Build), abaixo dele "<conta> está desconectada.", e o motivo do pedido: "O trabalho em segundo plano precisa disso (resumo do seu perfil), e nenhuma outra conta ou modelo Custom pôde fazê-lo." ou, para uma sessão que ele parou, "… continua quando você entrar." **Entrar** abre a mesma janela de login de [Configurações → Agentes → Contas](/settings?s=accounts). **Agora não** oculta o cartão por uma hora; uma sessão que para por causa disso mostra o cartão de novo, e o aviso na sessão permanece. No máximo dois cartões aparecem ao mesmo tempo, e então "+N mais" leva você a Configurações → Agentes → Contas. Um cartão some quando a conta é conectada de novo, pelo cartão, pelas Configurações ou em um terminal (o app percebe na próxima chamada que der certo). Ele também some quando o trabalho em segundo plano volta a ser feito de outra forma (outra conta ou um modelo Custom responde). Quando o Claude Code e o Codex estão ambos desconectados, só o Claude Code, que responde primeiro, é perguntado.

Seu perfil também mostra isso: quando o resumo dele falhou porque uma conta está desconectada, o motivo abaixo dele diz isso ("Sua conta “Work” do Claude Code está desconectada, e nenhuma outra conta ou modelo Custom pôde fazer isso: entre de novo (Configurações → Agentes → Contas).") e o cartão aparece.

## Usar crédito de API quando todas as contas estão no limite

Se você tem uma chave de API da Anthropic (em [console.anthropic.com](https://console.anthropic.com) → API keys), suas sessões do Claude Code podem continuar com ela quando todas as contas do Claude Code estão no limite de uso, em vez de parar. Isso custa dinheiro: a sessão é cobrada pela Anthropic pelos preços da API enquanto roda assim, sem cobertura da sua assinatura.

1. Abra [Configurações → Agentes → Contas](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). Na linha de uma conta do Claude Code em **Contas** (seu login principal ou um que você adicionou), clique em **⋯** e depois em **Adicionar chave de API…**.
2. Cole a chave em **Chave de API da Anthropic** e clique em **Salvar chave**. O app a verifica com a Anthropic e a guarda criptografada neste computador. A linha então mostra uma etiqueta **Crédito da API**. **Alterar chave de API…** a substitui e **Remover chave de API** a exclui.
3. Ative **Usar crédito de API no limite**, no grupo **No limite de uso** (o (i) dele diz que, quando todas as contas do Claude Code estão no limite de uso, as sessões continuam cobradas na chave de API da Anthropic de uma conta em vez de parar, e que fica desativado até você ativar). Ele aparece quando o Claude Code está conectado ou você adicionou uma conta do Claude Code.

O que acontece então:

- Quando a conta de uma sessão do Claude Code atinge o limite de uso, o app primeiro tenta o que **Trocar de conta no limite** faz: outra conta com uso disponível. Só quando nenhuma tem uso disponível, e a configuração está ativada, a sessão continua cobrada na chave de API.
- A sessão continua na própria conta, então o histórico dela não se move. Se essa conta não tem chave, é usada a chave de outra conta do Claude Code.
- A sessão mostra uma etiqueta **Crédito da API** ao lado da conta, no alto. Passe o mouse sobre ela para ver o motivo.
- Quando um plano volta a ter uso, a sessão volta a ele depois que o próximo turno terminar: para a própria conta ou para outra com uso disponível. Você não precisa fazer nada.
- Se o app não consegue ler o uso de uma conta, ele nunca move seu trabalho para a cobrança da API.
- O Codex não é afetado: ele não tem crédito de API.

## Adicionar Gemini CLI, OpenCode e outros agentes ACP

Abra [Configurações → Agentes → Mais agentes](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Seus agentes** (eles aparecem ao lado do Claude Code e do Codex quando você começa uma sessão) lista o Custom primeiro, depois os agentes que você adicionou. Cada um mostra um visto quando o programa dele está instalado aqui, ou um X e "não instalado".
- **Agentes que falam ACP** (instale um, entre uma vez no CLI dele e depois adicione aqui) lista os conhecidos que você ainda não adicionou: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build e outros. Os instalados vêm primeiro. Uma linha que diz "Não instalado" explica como obtê-lo. A lista mostra os primeiros que não estão instalados; **Mostrar tudo** mostra o resto.

Para adicionar um:

1. Clique em **Adicionar** no fim da linha dele. O botão fica em destaque quando o programa já está instalado.
2. Se o app sabe como instalá-lo (Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build e os agentes que precisam de um adaptador ACP), ele o instala agora, em segundo plano. Goose, Kimi CLI e os outros você mesmo instala, com o comando ou o endereço da linha deles.
3. Entre uma vez no programa do próprio agente: abra o [Terminal](/terminal), execute o comando dele (por exemplo `gemini`) e siga o login. Se você pular esta etapa, uma sessão avisa: "Gemini CLI is not signed in. Run gemini once in a terminal and sign in there, then try again."

O agente agora aparece na lista **Executa em** da página inicial.

Para alterar um agente adicionado, clique em **Editar**. Para tirá-lo, abra o menu **⋯** dele, escolha **Remover** e confirme: as sessões dele continuam na lista, mas continuá-las exige configurar o agente de novo. O Custom já vem embutido: a linha dele diz "Built in: models from OpenRouter, Ollama and vLLM, in Settings → Models" e tem um botão **Modelos** no lugar de Editar e Remover.

### Grok Build

O **Grok Build** é o agente de programação da xAI (o programa `grok`). Clique em **Adicionar** na linha dele, e pronto: o app o instala pelo npm (`@xai-official/grok`) na primeira vez que for necessário, ou usa um que já esteja aqui, inclusive um do instalador próprio da xAI em `~/.grok/bin`. Ele então aparece em **Programas de agentes** e é mantido atualizado com os outros. O Hydor o executa por ACP, com as ferramentas do próprio app, os cartões de aprovação e os modelos do Grok.

Ele entra de um jeito diferente dos outros agentes ACP: não no Terminal, mas em [Configurações → Agentes → Contas](/settings?s=accounts), onde uma linha **Grok Build** aparece assim que ele é adicionado (veja [Entrar no Claude Code, no Codex e no Grok Build](#sign-claude-code-codex-and-grok-build-in)). Você também pode adicionar mais contas do Grok ali.

### Adicionar um agente seu

Qualquer programa que fale ACP pode rodar aqui.

1. Clique em **Adicionar o seu**, ao lado do título de **Seus agentes**.
2. Preencha:
   - **Nome**: como ele aparece nas listas, por exemplo "Gemini CLI".
   - **Command**: o programa a iniciar, por exemplo `gemini`, ou um caminho completo.
   - **Argumentos**: o que o inicia no modo ACP, por exemplo `--experimental-acp`.
   - **Ambiente (opcional, NOME=valor por linha)**: configurações de que o programa precisa, como uma variável de chave de API.
3. Clique em **Salvar**.

O comando precisa iniciar o agente no modo ACP, conversando pela entrada e saída padrão.

### Agentes que você configura no programa deles

Alguns agentes da lista são programas que você mesmo configura, e algumas coisas diferem dos que o app instala para você:

- A linha deles em **Mais agentes** mostra o comando ou o endereço para instalá-los. O app não executa um script da web por você: instale você mesmo, no [Terminal](/terminal) ou do jeito que a linha indica.
- Entre uma vez no programa do próprio agente, também no Terminal (por exemplo, execute o comando dele e siga o login, ou escolha o modelo dele ali). O app o inicia daí em diante. Ele guarda as próprias sessões e a própria memória na pasta dele, e os cartões de aprovação são os que ele oferece.
- Um deles se conecta a um gateway próprio: configure-o primeiro, com o comando de configuração do próprio agente, e mantenha o gateway rodando.
- Quando um agente não fala ACP por conta própria, ele precisa de um adaptador ACP. O app instala o adaptador junto com o agente, ambos com o npm na pasta própria dele, sem executar os scripts de instalação. Um agente que você instalou por conta própria é usado quando está no PATH.
- Um agente que não aceita servidores MCP funciona só com as próprias ferramentas: as ferramentas do app (páginas, busca…) não chegam a ele, e a sessão avisa isso quando começa. Ele ainda recebe as diretrizes do app, as notas de memória e as habilidades com a primeira mensagem.

### O que os agentes ACP podem e não podem fazer aqui

O app abre uma sessão na pasta que você escolher, mostra as mensagens e as etapas do agente e pergunta a você sempre que o agente pede permissão. Algumas coisas funcionam de modo diferente do Claude Code e do Codex:

- Ele aceita uma mensagem por vez. Uma mensagem que você envia enquanto ele trabalha espera na fila acima da caixa de mensagem e sai quando o turno termina. (O Custom também funciona assim.)
- Um agente que não consegue reabrir sessões anteriores começa do zero quando você continua uma antiga, sem a conversa anterior. A sessão avisa isso. O mesmo acontece quando um agente conseguia reabrir uma sessão antes, mas não consegue mais: ele continua do zero, com um aviso, em vez de falhar.
- As imagens que você anexa só chegam a ele se ele aceitar imagens.
- Metas, forks e transferências não estão disponíveis (o Custom tem metas e forks).
- As ferramentas do app (páginas, busca, memória…) chegam a um agente como um servidor MCP: por endereço quando o agente aceita isso, ou então por um pequeno programa que o app inicia para ele. Um agente que não aceita nenhum deles funciona só com as próprias ferramentas, mas ainda recebe as diretrizes, as notas de memória e as habilidades.

## De onde vêm os modelos do Custom

O Custom roda os modelos dos seus planos do Claude e do ChatGPT, modelos neste computador e modelos na nuvem, com as mesmas ferramentas, habilidades e servidores MCP dos outros agentes. Escolha Custom na página inicial e depois o modelo. Eles vêm de três lugares:

- **Suas assinaturas**: os modelos dos seus planos do Claude e do ChatGPT, por meio das contas conectadas do Claude Code e do Codex neste computador. Não há nada a configurar: quando o Claude Code está conectado, o menu **Modelo** do Custom oferece Claude Opus, Fable, Sonnet e Haiku (sempre o mais novo de cada um), e quando o Codex está conectado com o ChatGPT, ele oferece os modelos que o seu plano do ChatGPT lista (por exemplo, GPT-6 Luna). Um programa que for encontrado sem conexão perde seus modelos no menu até você entrar de novo, e o Codex conectado com uma chave de API em vez do ChatGPT não cede nenhum. Eles usam o uso do seu plano, não uma chave de API nem dinheiro por token, então uma sessão do Custom em um deles mostra US$ 0 nesses passos. Cada conta do programa é tentada em sequência, como em outros trabalhos avulsos: uma conta que atingiu o limite de uso ou que está sem conexão passa o passo para a sua próxima conta (com **Trocar de conta no limite** ativado). Uma [sessão confidencial](/guide/sessions#keep-a-session-confidential) nunca os usa, porque eles rodam nos servidores da Anthropic ou da OpenAI. Veja [Custom](/guide/custom#what-custom-is-and-when-to-use-it) para saber como eles respondem.
- **Neste computador**: modelos instalados aqui (Ollama, vLLM) e endpoints na sua rede.
- **Na nuvem**: OpenRouter, endpoints em outros lugares e os modelos na nuvem do Ollama.

Você pode escolhê-los em qualquer lugar onde os modelos do Custom podem ser escolhidos: a página inicial, o menu de modelo de uma sessão, os níveis do Custom, o modelo auxiliar e o modelo de um agente ou de um app.

[Configurações → Agentes → Modelos](/settings?s=models) tem tudo o que os modelos do Custom precisam. A página tem sete partes, de cima para baixo:

- **Modelo auxiliar**: o modelo para as tarefas pequenas do app.
- **Níveis**: um modelo para cada tipo de tarefa (veja [Níveis: um modelo para cada tipo de tarefa](#tiers-a-model-for-each-kind-of-job)).
- **Suas assinaturas**: uma linha para o Claude Code e outra para o Codex, com os modelos que cada um cede ao Custom. Uma linha diz “Sem conexão: entre de novo para usar estes modelos” com um link para **Contas**, ou “Não instalado neste computador”.
- **Nesta máquina**: o que este computador tem e os modelos instalados aqui.
- **Adicionar um modelo do Hugging Face**: pesquise, verifique e instale modelos abertos.
- **OpenRouter**: centenas de modelos com uma só chave, em três grupos: sua chave, os modelos que você adicionou e uma busca para adicionar mais.
- **Runtimes e endpoints**: Ollama, vLLM, outros servidores compatíveis com OpenAI e um token do Hugging Face.

No menu **Modelo** do Custom, os modelos ficam agrupados em **Suas assinaturas**, **Neste computador** e **Na nuvem**, e cada linha diz por onde ele passa: “Claude Code”, “Codex”, “OpenRouter”, “Ollama”, “vLLM” ou o nome de um endpoint. Passe o mouse sobre um modelo para ver onde ele roda e quanto ele lê de uma vez, por exemplo “OpenRouter · 128K de contexto” ou “vLLM, nesta máquina · 32K de contexto · inicia quando usado”. As listas são atualizadas sozinhas a cada minuto.

## Escolher o modelo auxiliar

O modelo auxiliar faz pequenas tarefas ao lado das suas sessões, fora de qualquer conversa:

- dar nome a cada nova sessão a partir do seu pedido (o título dela na barra lateral);
- verificar passos no modo Automático do Custom e verificar uma meta do Custom após cada turno;
- organizar a memória cerca de uma vez por dia, aprender com as conversas desde então e dar título às notas do índice com que os agentes começam;
- responder a uma pergunta sobre uma página da web que o navegador tem aberta;
- ler os filtros (sites, datas, tipos de página, idiomas) que as palavras de uma busca na web indicam, antes de o Naget Search pesquisar (veja [Como os agentes pesquisam na web](/guide/web#how-agents-search-the-web));
- descrever imagens para um modelo do Custom que não consegue vê-las;
- resumir uma resposta longa de um subagente do Hydor;
- redigir um app ou uma tarefa agendada a partir de uma sessão;
- o modo de voz Mãos livres.

Abra [Configurações → Agentes → Modelos](/settings?s=models&find=Helper%20model) e clique no menu **Modelo** no grupo **Modelo auxiliar** (o (i) dele lista as tarefas pequenas):

- **Automático** (o padrão): Claude Haiku pelo Claude Code, ou o Codex quando o Claude Code não pode responder. Uma conta que atingiu o limite de uso passa a pergunta primeiro para a sua próxima conta conectada (com **Trocar de conta no limite** ativado), e uma conta sem conexão é ignorada. Quando nenhum dos dois programas pode responder, um dos seus modelos do Custom faz a tarefa (o que o nível **Rápido** do Custom indica, ou, na falta dele, o mais barato que você adicionou; os modelos dos seus planos são ignorados aqui, pois passam pelos mesmos dois programas), e só quando nada pôde fazê-la um cartão pede que você entre (veja [Quando uma conta está sem conexão](#when-an-account-is-signed-out)). Quando nada responde, o erro diz o motivo de cada um: “Você atingiu seu limite semanal”, um modelo que o seu plano do Codex não oferece…
- Qualquer um dos modelos do Custom, agrupados como no menu **Modelo** do Custom (**Suas assinaturas**, **Neste computador** e **Na nuvem**), com o que ele usa para responder (Claude Code, Codex, OpenRouter, Ollama, vLLM ou o nome de um endpoint) e “Vê imagens” para os que enxergam. Um modelo do seu plano do Claude ou do ChatGPT também pode ser o auxiliar: ele responde pelo Claude Code ou pelo Codex, no uso do seu plano.

O modo Automático não consegue olhar imagens. Se você usa o Custom com um modelo que não vê imagens, escolha um modelo auxiliar que veja imagens, ou o Custom não poderá descrever as suas imagens.

## Ver o que este computador pode rodar

A seção **Nesta máquina** de [Configurações → Agentes → Modelos](/settings?s=models&find=On%20this%20machine) começa com um resumo deste computador:

- **Gráficos**: as placas de vídeo (GPUs) e a memória delas; em um Mac com Apple silicon, o chip dele (“Apple M3 Max”, cujos gráficos compartilham a memória do computador); ou “Sem GPU” (os modelos então rodam no processador).
- **Memória e disco**: a memória do computador, total e livre, e o espaço livre no disco com quanto os modelos instalados ocupam.
- **Roda com**: se o **Ollama** e o **vLLM** estão instalados, com as versões deles, ou um link para instalá-los.
- Com uma placa de vídeo, o tamanho de modelo que cabe: “Cabe cerca de 30B de parâmetros em 4 bits em uma GPU” (em um Mac: “Cabe cerca de 40B de parâmetros em 4 bits”). Parâmetros são uma medida do tamanho de um modelo; 4 bits é uma forma comprimida comum que precisa de cerca de um quarto da memória.

Abaixo dele:

- **Downloads em andamento**, cada um com uma barra de progresso, quanto já foi feito e se é para o Ollama ou o vLLM. **Cancelar** interrompe um. Um que falhou ou foi cancelado mostra o motivo, com **Dispensar**.
- **Modelos instalados** (os primeiros e depois **Mostrar tudo**), cada um com seu runtime (Ollama ou vLLM), tamanho, detalhes (como o tamanho e a compressão dos modelos do Ollama), “Vê imagens” quando é o caso e se está rodando.
  - Um modelo do vLLM tem **Início** e **Parar**. Ele inicia sozinho quando uma sessão o usa pela primeira vez (o primeiro início leva um ou dois minutos), na placa de vídeo com mais memória livre (em 8 bits quando não coubesse nela como está), ou dividido entre 2, 4 ou 8 delas quando nenhuma placa sozinha tem espaço para ele (“rodando nas GPUs 1, 2”); em um Mac, no Apple silicon dele. Ele continua rodando, mesmo quando o app reinicia, até você clicar em **Parar**. Se não conseguir iniciar, o motivo aparece embaixo dele.
  - **Remover**, no menu **⋯** do modelo, exclui os arquivos do modelo deste computador, depois que você confirmar. Você pode instalá-lo de novo depois.

Quando ainda não há nenhum: “Nenhum modelo aqui ainda: adicione um do Hugging Face abaixo.”

## Adicionar um modelo do Hugging Face

O Hugging Face é o principal site de modelos abertos. O grupo [Adicionar um modelo do Hugging Face](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) (sugeridos para este computador, ou pesquise em todo o site) sugere alguns, faz a busca e diz a você, antes de qualquer download, como cada modelo rodaria neste computador.

### Sugeridos para este computador

Antes de você pesquisar, o grupo lista os modelos que o app recomenda e que rodam neste computador, conforme o que ele tem:

- **LFM3-VL 2B** (Liquid AI): pequeno e rápido, e lê imagens. Roda em quase qualquer computador.
- **Gemma 4 12B** (Google): um modelo versátil e capaz que lê imagens, para um computador com uma boa placa de vídeo.
- **Flint** (Recursive): feito para agentes de programação, para um Mac com Apple silicon e 32 GB ou mais.
- **GLM-5.3 Flash** (Z.ai): entre os modelos abertos mais fortes, para um servidor com várias placas de vídeo grandes.

Cada um mostra se roda bem ou devagar aqui, como rodaria (“vLLM em 8 bits, na GPU 0”, “vLLM, dividido entre 2 GPUs”, “vLLM, no Apple silicon”), o tamanho do download e **Instalar**. **Melhor aqui** marca o mais forte que roda bem. Eles rodam com o vLLM por padrão; um computador sem placa de vídeo NVIDIA nem Apple silicon recebe, em vez disso, a versão do modelo pequeno para o Ollama. Um aviso aparece quando o que os executa ainda não está configurado (“O vLLM não está configurado”, “O Ollama não está rodando”): veja [Conectar o Ollama, o vLLM ou outro endpoint](#connect-ollama-vllm-or-another-endpoint). A linha **Mais 2 para computadores maiores** (ou quantos forem) mostra os outros, com o que cada um precisa. O tour de boas-vindas sugere os mesmos.

### Pesquisar e filtrar

1. Digite em **Pesquise no Hugging Face ou cole org/nome**: um nome como `qwen3`, ou o nome completo de um modelo (`org/name`) ou o endereço dele no huggingface.co. Antes de você digitar, ele sugere alguns nomes, ou **ver os mais baixados**.
2. Restrinja a lista com os filtros (você pode combiná-los):
   - **Roda bem aqui**: apenas modelos que rodariam bem neste computador.
   - **GGUF · Ollama**: modelos em formato GGUF, que o Ollama roda.
   - **vLLM**: modelos em formato safetensors, que o vLLM roda em uma placa de vídeo.
   - **Vê imagens**: modelos que também leem imagens.
3. Mude a ordem com o menu à direita: **Mais baixados**, **Em alta**, **Mais curtidos** ou **Mais recentes**.

Você recebe até 40 modelos, os primeiros oito de início e **Mostrar tudo** para o restante. Um modelo que você nomeou por inteiro aparece primeiro, mesmo quando a busca não o lista, e pressionar Enter o verifica na hora.

Cada linha mostra o criador e o nome, o formato dele (**GGUF** ou **vLLM**), **Imagens** se ele vê imagens, **Restrito** se o criador pede que você aceite termos primeiro, o tamanho em parâmetros, os downloads nos últimos 30 dias, as curtidas e quando foi alterado pela última vez.

### O primeiro veredito

Embaixo de cada modelo, uma etiqueta colorida dá uma primeira estimativa só pelo tamanho:

- **Roda bem com vLLM** ou **Roda bem com Ollama**, com uma velocidade aproximada (“cerca de 40 tokens/s”; um token é um pedaço de palavra): ele cabe na memória da sua placa de vídeo.
- **No processador, devagar** ou **No processador, muito devagar**: ele só cabe na memória do computador, então roda no processador. Só o Ollama consegue fazer isso.
- **Grande demais para este computador**: ele não cabe, ou o download não cabe no disco.
- **Em 4 bits com Ollama: roda bem…**: o modelo como está armazenado é grande demais, mas a versão comprimida de 4 bits rodaria bem com o Ollama.

Passe o mouse sobre a etiqueta para ver os números por trás dela.

### Verificar antes de baixar

Clique em **Verificar** em um modelo para ver exatamente como ele rodaria aqui. O painel mostra o tamanho dele, quanto ele lê de uma vez (o contexto), se ele vê imagens e, depois:

- Para um modelo GGUF: “Roda com Ollama” e cada tamanho disponível (arquivos menores trocam um pouco de qualidade por velocidade e memória), do menor para o maior. Cada linha dá o veredito, a memória de que precisa, a velocidade aproximada e o tamanho do download, com um botão **Instalar**. Instalar fica desativado enquanto o Ollama não está rodando aqui, ou para um tamanho grande demais.
- Para um modelo vLLM: “Roda com vLLM, que o inicia em uma GPU quando uma sessão o usa”, os mesmos números, observações sobre qual placa de vídeo ele usaria e um botão **Baixar**. Se o vLLM não estiver instalado, ou se o seu vLLM ainda não consegue rodar esse tipo de modelo, isso é informado e, quando existe uma versão GGUF, ele oferece **verificar** essa versão no lugar.
- Para qualquer outra coisa: “Nenhum peso que este app possa rodar (safetensors para o vLLM, GGUF para o Ollama).”

Os números pressupõem uma conversa de até cerca de 32.000 tokens, o tamanho que um modelo neste computador recebe. **Fechar** recolhe o painel.

### Instalar e o que acontece depois

Clique em **Instalar** (Ollama) ou **Baixar** (vLLM). O download aparece em **Nesta máquina** com o progresso dele. Quando termina, o modelo aparece no menu **Modelo** do Custom. Um download do vLLM que foi interrompido continua de onde parou quando você tenta de novo. Um modelo do vLLM grande demais para qualquer placa de vídeo sozinha é armazenado em 8 bits (FP8) ao iniciar, o que reduz pela metade a memória que os pesos dele ocupam, com pouca perda (placas da série RTX 30 da NVIDIA e A100 em diante); se ainda assim não couber, ele é dividido entre várias placas, se juntas tiverem espaço.

### Modelos restritos e privados

Alguns criadores pedem que você aceite os termos deles primeiro; os modelos deles mostram **Restrito**. Aceite os termos na página do modelo no huggingface.co e depois adicione um token do Hugging Face (veja [Token do Hugging Face](#hugging-face-token)). Modelos privados também precisam do token.

## Usar modelos pelo OpenRouter

O OpenRouter (openrouter.ai) dá a você centenas de modelos de vários fabricantes com uma só chave, pagos por uso.

### Adicionar sua chave

1. Obtenha uma chave em openrouter.ai (o link da seção leva até lá).
2. Em [Configurações → Agentes → Modelos](/settings?s=models&find=OpenRouter), clique em **Adicionar chave** na linha **Sua chave do OpenRouter**, cole-a em **Sua chave do OpenRouter: sk-or-…** na janela e clique em **Salvar**.

A linha passa a mostrar **Conectado ao OpenRouter** com o início e o fim da sua chave. **Remover chave**, no menu **⋯** da linha, faz o app esquecer a chave. A chave fica no servidor e nunca é mostrada de novo.

Você também pode adicioná-la quando ela for necessária pela primeira vez: um agente que vai criar uma imagem, um desenho, um vídeo ou um som sem a chave pede por ela em um cartão na conversa ([Quando um agente precisa da chave do OpenRouter](/guide/documents-voice#when-an-agent-needs-the-openrouter-key)), e as ferramentas de IA dos editores pedem na própria janela. De qualquer forma, ela fica guardada aqui.

### Modelos sugeridos

Antes de pesquisar, **Sugeridos**, no grupo **Adicionar modelos do OpenRouter**, lista quatro modelos para o Custom, cada um com o motivo: **GPT-6 Luna** (Rápido e barato), **Grok 4.7** (Bom, com menos recusas), **GPT-6.1 Sol** (Melhor) e **Claude Opus 5.5** (O melhor no geral). **Adicionar** coloca um deles nos seletores. Para imagens, música, vozes e vídeos, as escolhas do app são Seedream 5.0 Pro (e Flash, mais rápido e mais barato), Lyria 3 Pro, Seed Audio 1.0 e Seedance 2.5: veja [Configurações → Recursos → Imagens, vídeo e áudio](/settings?s=images).

### Pesquisar no catálogo

No mesmo grupo, digite em **Pesquisar no OpenRouter: deepseek, qwen, claude…**, ou clique em um dos nomes sugeridos, ou em **ver os mais recentes**. Filtros:

- **Chamadas de ferramentas**: modelos que chamam ferramentas de forma nativa, do jeito que o Custom as usa melhor (**Melhor correspondência** coloca esses primeiro).
- **Vê imagens**
- **Raciocínio**: modelos que pensam antes de responder.
- **Livre**

O menu à direita ordena os resultados: **Melhor correspondência** (enquanto você pesquisa por nome), **Mais recentes**, **Mais barato** ou **Maior contexto**. Você recebe até 50 modelos, os oito primeiros de início e **Mostrar tudo** para o restante.

Cada modelo mostra seu fabricante, nome e rótulos: **Mais recente** (sempre a versão mais nova do fabricante), **Nova** (listado nas últimas três semanas), **Livre**, **Raciocínio**, **Imagens** e **Sem ferramentas nativas** (o Custom então descreve suas ferramentas nas instruções e lê as chamadas a partir do texto). Abaixo: quanto ele lê de uma vez (“128K context”), sua resposta mais longa (“16K out”), seu preço por milhão de tokens de entrada e de saída, o mês em que foi listado, uma descrição curta e seu nome no OpenRouter.

### Adicionar modelos aos seletores

Clique em **Adicionar** em um modelo. A linha dele passa a dizer **Adicionado**, e o modelo aparece no grupo **Seus modelos do OpenRouter** (“In the model pickers”) acima da pesquisa e no menu **Modelo** do Custom. Clique no × em um deles para tirá-lo dos menus. Até você adicionar pelo menos um, o OpenRouter não oferece nenhum modelo (“Add at least one model to use OpenRouter.”).

## Conectar Ollama, vLLM ou outro endpoint

O grupo **Runtimes e endpoints** conecta os programas que executam modelos. Abra-o em [Configurações → Agentes → Modelos](/settings?s=models&find=Runtimes%20and%20endpoints).

### Ollama

O Ollama é um programa gratuito que executa modelos no seu computador, na placa de vídeo ou no processador. A linha dele diz “running” com a versão, ou “not running at this address” com um link **Instalar o Ollama**. O endereço dele é `http://127.0.0.1:11434`, a menos que você o mude: digite outro no campo, e **Salvar** aparece ao lado. Todo modelo desse Ollama aparece na lista de modelos do Custom, inclusive os que você baixou fora do app.

### vLLM

O vLLM é um servidor rápido para modelos em placas de vídeo NVIDIA, e a forma como os modelos do Hugging Face são executados aqui por padrão. Um modelo grande demais para uma só placa roda nela a 8 bits, ou dividido entre 2, 4 ou 8 placas. Em um Mac, o vLLM roda em Apple silicon com o plugin Metal (vllm-metal). O app o encontra sozinho no PATH ou em um ambiente conda ou venv, e mostra a versão e onde ele está. Se aparecer “not found (pip install vllm), or give its command”, instale-o, ou digite o caminho completo do comando `vllm` no campo e clique em **Salvar** (o botão aparece quando você digita). Deixe o campo vazio para que o app procure sozinho.

### Outros endpoints compatíveis com a OpenAI

Muitos programas e serviços respondem do mesmo jeito que a API da OpenAI: LM Studio, o servidor do llama.cpp, outros provedores. Para adicionar um:

1. Clique em **Adicionar endpoint**, ao lado do título do grupo.
2. Na janela, digite um **Nome**, o endereço dele (como `http://localhost:1234/v1`) e uma **Chave (opcional)**.
3. Clique em **Adicionar**.

O endpoint aparece como uma linha com o endereço e quantos modelos ele oferece. Os modelos dele aparecem na lista do Custom como “modelo (nome)”. O × o remove. Adicionar outro endpoint com o mesmo nome substitui o primeiro.

Uma [sessão confidencial](/guide/sessions#keep-a-session-confidential) pode usar um endpoint cujo endereço seja este computador ou sua rede privada: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` a `172.31.…`, ou um nome terminado em `.local`. Qualquer outro endereço conta como online, mesmo que leve ao seu próprio servidor: use o endereço privado dele. O mesmo vale para o endereço do Ollama, e os modelos em nuvem do Ollama (os nomes deles terminam em “cloud”) sempre contam como online.

### Token do Hugging Face

Um [token do Hugging Face](/settings?s=models&find=Hugging%20Face%20token) permite que o app baixe modelos restritos ou privados (a linha diz “Only for gated or private models”). Crie um nas configurações da sua conta do Hugging Face, clique em **Adicionar token**, cole-o na janela (ele começa com `hf_`) e clique em **Salvar**. A linha então mostra o início e o fim dele, com **Remover token** no menu **⋯**.

## Pedir a um agente

- “Quais programas de agente estão instalados aqui? Instale o Gemini CLI.”
- “O Claude Code e o Codex estão atualizados? Atualize os dois agora.”
- “Adicione o OpenCode aos meus agentes.”
- “Adicione o Grok Build aos meus agentes e entre com minha assinatura do Grok.”
- “Adicione uma segunda conta do Grok para o trabalho e comece minha próxima sessão nela.”
- “Comece minha próxima sessão do Grok com esforço xhigh.”
- “Quanto do meu plano do Grok ainda resta esta semana?”
- “Use todas as minhas contas do Grok: quando uma atingir o limite, continue com outra.”
- “Adicione o Gemini CLI e o Goose aos meus agentes e diga o que ainda preciso instalar.”
- “Encontre no Hugging Face um modelo que rode bem neste computador e veja imagens, verifique-o e instale o melhor tamanho.”
- “Adicione o modelo DeepSeek mais recente do OpenRouter aos meus modelos.” (depois de definir sua chave do OpenRouter)
- “Faça do modelo auxiliar um que veja imagens.”
- “Use o Sonnet do meu plano do Claude em uma sessão Custom e mostre quanto custa.”
- “Pare o modelo vLLM que está rodando, para liberar a placa de vídeo.”
- “Use todas as minhas contas do Claude: quando uma atingir o limite, continue com outra.”
- “Quando todas as minhas contas do Claude acabarem, continue com meu crédito de API.”
- “Qual modelo cada nível usa no Claude Code e no Codex? Faça Máximo significar Opus no Claude Code.”
- “Quais modelos os níveis do Custom usam, e por que Melhor está vazio?”
- “Por que o Hydor pede que eu entre no Claude Code de novo?”
- “Minha conta do Claude Code foi desconectada: quais das minhas sessões estão esperando por ela, e elas podem continuar com outra conta?”
