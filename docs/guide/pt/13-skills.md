# Habilidades

Habilidades são métodos escritos que os agentes carregam quando uma tarefa pede um: como pesquisar uma questão, encontrar a causa de um bug, planejar um projeto, criar um documento do Word ou arrumar tudo depois de uma tarefa. Todas as habilidades que os agentes podem usar ficam em uma só página, [Configurações → Habilidades](/settings?s=skills): as que vêm com o app, as suas, as que seus plugins trazem, as próprias do Claude Code e do Codex, e as dos seus projetos. Os interruptores dela valem para todas as sessões; um projeto pode inverter qualquer habilidade nas suas próprias sessões. Este tópico trata de todas elas, das habilidades que os agentes aprendem com a sua aprovação e das palavras-chave que acionam uma habilidade para o Custom.

![Configurações → Habilidades: todas as habilidades que os agentes podem usar, agrupadas pela finalidade](images/skills.webp)

## O que é uma habilidade

Uma habilidade é um guia curto que um agente segue para um tipo de trabalho. Cada uma é uma pasta com um arquivo chamado SKILL.md dentro: um nome, uma linha sobre quando usar, depois os passos, as verificações e os erros a evitar. Algumas habilidades também trazem arquivos próprios: exemplos, modelos ou pequenos scripts que os passos usam.

Os agentes não leem todas as habilidades o tempo todo. No início de uma sessão, o agente vê apenas o nome de cada habilidade e a linha “quando usar”. Quando uma tarefa se encaixa em uma delas, ele a carrega e a segue. Uma saudação, uma pergunta rápida ou uma mudança pequena e clara não precisa de nenhuma.

## De onde vêm as habilidades

A página Habilidades mostra habilidades de cinco origens, cada uma indicada na sua linha:

- **Integrado**: as habilidades que vêm com o app (mais de sessenta). Elas são atualizadas junto com o app.
- **Seus**: habilidades que você escreveu nesta página, aprovadas quando um agente as sugeriu, copiadas de outros agentes neste computador (veja [Trazer de outros assistentes](/guide/memory#bring-in-from-other-assistants)) ou colocadas por você mesmo na sua pasta de habilidades.
- **De plugins**: as habilidades dos [plugins](/guide/plugins) que você ativou. Elas vão e vêm com o plugin.
- **Claude Code e Codex**: as habilidades próprias desses agentes, nas pastas deles. Só o agente correspondente as recebe.
- **Em projetos**: as habilidades próprias de um projeto, que só as sessões dele recebem. Você as altera na aba **Habilidades** do projeto: veja [Dar habilidades próprias a um projeto](/guide/projects#give-a-project-skills-of-its-own).

As três primeiras formam a biblioteca de habilidades, que todo agente iniciado pelo app recebe. Um agente também pode indicar habilidades preferidas: quando uma delas se encaixa na tarefa, ele a carrega antes de começar. Veja [Agentes](/guide/agents).

## Quais agentes recebem quais habilidades

Toda sessão iniciada pelo app recebe a biblioteca de habilidades:

- O **Claude Code** a recebe como um plugin chamado “hydor”, então as habilidades aparecem com esse nome na frente: hydor:research, hydor:writing e assim por diante.
- O **Codex** a recebe como uma pasta extra de habilidades.
- O **Custom**, o agente próprio do app, recebe as habilidades pelo nome, em grupos, e também pode procurar uma pelo tipo de trabalho. Veja [Custom](/guide/custom).
- **Outros agentes** (Gemini CLI, OpenCode e os demais) recebem a lista de habilidades, cada uma com o arquivo a ler quando ela se encaixa.

Sessões iniciadas fora do app, em um terminal ou no VS Code, não veem a biblioteca. Nada dela é gravado nas configurações do seu Claude Code ou do Codex.

Uma sessão em um projeto recebe as habilidades próprias do projeto junto com as da biblioteca, cada uma conforme o projeto a ativa ou desativa (veja [Ativar ou desativar uma habilidade neste projeto](/guide/projects#turn-a-skill-on-or-off-for-this-project)). Uma habilidade do projeto com o nome de uma habilidade da biblioteca toma o lugar dela nas sessões daquele projeto.

As suas habilidades têm prioridade sobre as integradas: uma sua com o nome de uma habilidade integrada toma o lugar dela. Uma habilidade de plugin com um nome que a biblioteca já tem fica de fora, e a página do plugin informa qual habilidade os agentes recebem no lugar.

O Custom lê habilidades de várias pastas, nesta ordem: as habilidades próprias do projeto (nas pastas `.claude/skills` e `.agents/skills`), as habilidades próprias do Claude Code e do Codex na sua pasta pessoal, depois a biblioteca. Quando duas habilidades têm o mesmo nome, vale a primeira encontrada. Assim, uma habilidade que você escreve para o Claude Code ou para o Codex chega também ao Custom. O Custom aceita até 200 habilidades, no máximo 40 delas do projeto e suas; as instruções dele as nomeiam por grupo (as do projeto, as suas, depois os grupos da biblioteca, como Programação ou Documentos) em vez de listar cada uma.

## Ver quando um agente usa uma habilidade

Quando um agente carrega uma habilidade, uma pequena etiqueta aparece na conversa: **Usando habilidade research**, com um indicador de carregamento enquanto o agente a lê. Isso vale para o Claude Code, o Codex e o Custom.

Clique na etiqueta para ler a habilidade: o que ela diz, quando se aplica e o histórico dela. Se a habilidade não faz parte da biblioteca do app, a janela avisa: ela vem da pasta de habilidades própria do agente ou do projeto. Em um projeto, a etiqueta abre a habilidade própria do projeto quando foi essa a que o agente usou: o selo da janela mostra o nome do projeto, e **As habilidades do projeto** abre a aba Habilidades dele.

Quando as suas próprias palavras acionaram uma habilidade em uma sessão do Custom, a etiqueta diz quais palavras foram: “acionada por “pesquisa” na sua mensagem”. Veja [Acionar habilidades por palavras-chave](#bring-skills-in-by-keywords).

Cada vez que um agente carrega uma habilidade, conta como um uso. A linha de uma habilidade da biblioteca mostra quantas vezes ela foi usada e quando foi a última vez.

## Abrir a página Habilidades

Acesse **Configurações → Agentes → Habilidades** ([abrir](/settings?s=skills)). No celular, abra as Configurações e toque em **Habilidades**, em Agentes.

De cima para baixo, a página tem:

- ao lado do título da página, **Nova habilidade** e o menu **⋯**: **Sugerir habilidades adequadas**, **Acionar habilidades por palavras-chave**, **Sua pasta de habilidades** (abre em Arquivos), **Ganhe mais com plugins** (abre [Configurações → Plugins](/settings?s=plugins)) e **Como os agentes recebem habilidades**;
- um grupo com as habilidades sugeridas pelos agentes, quando houver (veja [Aprovar, editar ou descartar uma habilidade proposta](#approve-edit-or-dismiss-a-proposed-skill)); o (i) dele informa que nada é salvo até você aprovar;
- uma caixa de busca e uma linha de filtros: **Todos**, **Integrado**, **Seus**, **De plugins**, **Claude Code e Codex** e **Em projetos**. Só aparecem os que têm habilidades;
- as habilidades, em grupos por finalidade (o título de cada grupo diz quantas ele tem, e um grupo longo mostra as oito primeiras com **Mostrar tudo**): **Jeitos de trabalhar**, **Escrita**, **Documentos**, **Pesquisa e web**, **Planejamento e decisões**, **Dados e números**, **Design e imagens**, **Programação**, **Modelos de IA** e **Este app**; depois **Próprias do Claude Code**, **Próprias do Codex** e um grupo para cada projeto com habilidades próprias;
- no fim, as suas habilidades que você removeu, para restaurar.

Cada habilidade é uma linha: o nome dela (clique para abri-la), para que serve em uma linha, o interruptor e um (i) que diz de onde ela vem e quantas vezes foi usada. As habilidades próprias do Claude Code e do Codex são listadas como cada pasta as tem: as suas e as que vêm com os agentes. As da pasta de um projeto (em `.claude/skills`) ficam na aba **Habilidades** desse projeto.

## Encontrar uma habilidade

Digite na caixa de busca: ela procura nos nomes das habilidades, no que elas fazem e no nome do plugin ou do projeto. Pressione Esc, ou a cruz, para limpar. Escolha um filtro para ver só habilidades de um tipo.

Você também pode encontrar uma habilidade pela caixa de busca do app (Ctrl+K, ⌘K no Mac): digite o nome dela ou para que serve. As habilidades aparecem em **Habilidades**, e escolher uma abre esta página nela.

## Ativar ou desativar uma habilidade

Toda habilidade da biblioteca e do Claude Code e do Codex tem um interruptor no fim da linha. Uma habilidade desativada continua onde está, mas os agentes deixam de recebê-la; o nome fica esmaecido e um selo diz **Desativada**. Ative-a de novo com o mesmo interruptor. Você também pode usá-lo na janela da habilidade.

- Uma habilidade da biblioteca (integrada, sua ou de plugin) desativada fica de fora para todos os agentes, em todos os projetos que não a ativam por conta própria.
- O Claude Code guarda a própria escolha nas configurações dele, pelo nome da habilidade; o Codex a guarda na configuração dele.

Os interruptores daqui valem para todas as sessões. Um projeto pode inverter qualquer habilidade nas suas próprias sessões, na aba **Habilidades** dele: veja [Ativar ou desativar uma habilidade neste projeto](/guide/projects#turn-a-skill-on-or-off-for-this-project). Nesse caso, a linha da habilidade aqui avisa: “Desativada em Tese” ou “Ativada em 2 projetos”.

As habilidades próprias de um projeto não têm interruptor aqui: altere-as na aba **Habilidades** do projeto.

## Ler uma habilidade e o histórico dela

Clique no nome de uma habilidade ou em uma etiqueta **Usando habilidade** em uma conversa. Abre-se uma janela com:

- de onde ela vem, o grupo dela e quantas vezes os agentes a usaram;
- o interruptor: **Os agentes recebem**, ou **Desativada: os agentes não a recebem**;
- os projetos que a invertem nas suas sessões, cada um com **Ativada** ou **Desativada**: clique em um para abrir a aba Habilidades dele;
- quando usá-la e as palavras-chave dela, se tiver (“O Custom a aciona quando você diz” e as palavras);
- as instruções, como os agentes as leem;
- **Histórico**, quando há mudanças: cada mudança, da mais recente para a mais antiga, **Salvo**, **Alterado**, **Removido** ou **Restaurado**, há quanto tempo e quantas linhas foram adicionadas e removidas. Clique em uma mudança para vê-la linha a linha;
- no fim, onde fica o arquivo dela: clique para mostrá-lo em Arquivos; no app para computador, um botão ao lado (**Mostrar no Finder**, **Mostrar no Explorador de Arquivos** ou **Mostrar na pasta**) o mostra no gerenciador de arquivos do sistema.

Os botões no fim dependem da habilidade:

- Integrada: **Fazer minha própria versão** (veja [Alterar uma habilidade integrada](#change-a-built-in-skill)).
- Sua: **Variação** e **Remover**.
- De plugin: **Seu plugin** (abre o plugin) e **Fazer minha própria versão**.
- Do Claude Code ou do Codex: **Variação** (ou **Abrir**, para habilidades que você não pode excluir), que abre o SKILL.md dela em um editor, e **Excluir**.
- De projeto: **As habilidades do projeto**.

No celular, a janela abre como uma folha vinda da parte de baixo da tela. **Fechar** a fecha.

## As habilidades integradas

O app vem com estas habilidades, nos grupos em que a página as mostra. Abra qualquer uma delas para lê-la por inteiro.

**Jeitos de trabalhar**

- **clarify-first**: para um pedido grande ou em aberto (um site, uma viagem, uma reforma, uma palestra, um plano de negócios). O agente primeiro lê o que já existe, faz uma pergunta de cada vez e explica por quê, repete o que entendeu, oferece duas ou três maneiras de fazer e escreve um resumo curto para você aprovar antes de construir qualquer coisa.
- **clean-up**: no fim de uma tarefa. O agente lista o que criou pelo caminho, remove o que não é mais necessário (arquivos temporários, dados de teste, pastas temporárias, branches já mesclados ou abandonados, worktrees, processos que ele iniciou), nunca remove o que não criou, pergunta antes sobre qualquer coisa grande ou compartilhada e diz em uma linha o que removeu e o que deixou. Enquanto **Limpar depois de uma tarefa** estiver ativado em [Configurações → Seus agentes](/settings?s=assistants&find=Clean%20up%20after%20a%20task) (e ele está, a menos que você desative), todo agente é orientado a fazer isso no fim de uma tarefa.
- **decisions-log**: para trabalho sem você por perto (uma meta, uma tarefa agendada, “não precisa me esperar”). O agente resolve sozinho as dúvidas comuns, anota cada decisão com o motivo e o custo se ela estiver errada, e segue em frente. Ele só para antes de passos que não podem ser desfeitos (enviar, pagar, excluir, publicar), de qualquer coisa que envolva senhas ou acesso, ou de qualquer coisa fora do trabalho; a mensagem final lista todas as decisões que ele tomou.
- **evidence-before-done**: antes de o agente dizer que algo está pronto, corrigido, salvo, enviado ou verdadeiro. Ele aponta a verificação que provaria isso, executa, lê o resultado e relata a afirmação com a evidência, ou diz com clareza o que não conseguiu verificar.
- **troubleshooting**: para qualquer coisa que não funciona como deveria (um erro, um aparelho, uma rede doméstica, uma fórmula, uma receita). O agente faz o problema acontecer de propósito, reúne fatos, testa uma ideia de cada vez, corrige a causa e mostra que está corrigido.

**Escrita**

- **writing**: para qualquer coisa que as pessoas vão ler (um relatório, um artigo, uma carta, um discurso). O agente define quem vai ler e para quê, faz um esboço antes de redigir e revisa em etapas separadas.
- **creative-writing**: contos, romances, memórias, poemas e roteiros: encontrar a história, planejar, redigir sem travar, destravar, revisar em ordem, receber comentários e ser publicado (cartas de apresentação, sinopses, agentes literários, autopublicação e as armadilhas a evitar), mantendo a voz do autor como dele.
- **email**: organiza uma caixa de entrada (o que precisa de resposta, o que pode esperar, o que arquivar) e escreve os e-mails que exigem cuidado: respostas, cobranças, pedidos de desculpas, recusas e negativas, no tamanho e no tom certos.
- **plain-language**: reescreve um texto existente para que fique claro e humano, sem jargão, enchimento ou frases rígidas com cara de IA, no nível de leitura certo, mantendo o que o texto diz.
- **translation**: traduz documentos, mensagens, páginas, textos de apps e legendas com fidelidade e naturalidade, com um glossário de termos e nomes, números e datas adequados ao lugar a que se destina e uma verificação do resultado.
- **social-media**: planeja e escreve posts para cada plataforma (LinkedIn, X, Instagram, Mastodon, Bluesky…), adapta uma mesma mensagem para várias e mantém um calendário de conteúdo.
- **seo**: fazer um site, uma loja ou um blog ser encontrado em mecanismos de busca e em respostas de IA: uma verificação das páginas, títulos e descrições, indexação, dados estruturados e rastreadores de IA, e uma medição honesta, sem prometer posições.
- **release-notes**: escreve notas de versão e entradas de changelog a partir de commits e pull requests, para quem vai lê-las, e escolhe o número da próxima versão.

**Documentos**

- **pdf**: cria PDFs (relatórios, faturas, certificados, folhetos, formulários), une, divide, gira, preenche ou carimba, converte arquivos do Office em PDF e lê PDFs, inclusive páginas digitalizadas.
- **presentations**: cria ou altera slides (.pptx) com um mesmo visual do início ao fim, gráficos, tabelas e notas do apresentador, olha os slides como imagens antes de entregar e lê arquivos .pptx, .ppt e .odp.
- **spreadsheets**: cria ou altera pastas de trabalho (.xlsx) com fórmulas, formatos de número e gráficos, verifica se há erros nas fórmulas e lê arquivos .xlsx, .xls, .ods e .csv.
- **word-documents**: cria ou altera documentos do Word (.docx) com títulos, listas e tabelas de verdade, olha as páginas antes de entregar e lê arquivos .docx, .doc e .odt.

**Pesquisa e web**

- **research**: planeja as buscas que uma pergunta exige, busca de forma ampla e depois restrita (artigos, patentes, notícias, registros oficiais), confere cada afirmação importante com duas fontes independentes ou uma fonte primária e responde com citações, dizendo o que não conseguiu confirmar.
- **spin-check**: se um anúncio, um post viral, uma proposta ou uma afirmação é verdadeiro, enganoso ou golpe: afirmação por afirmação, cada uma conferida na fonte que pode resolver a questão, com os truques de persuasão identificados e um veredito para cada uma.
- **papers**: trabalha de perto com artigos acadêmicos: quem cita um deles, um texto completo legal, leitura e resumo, uma tabela comparando estudos, avaliação da qualidade de um estudo e como citá-lo corretamente.
- **peer-review**: revisa um artigo (seu rascunho antes de enviar, ou um que pediram para você revisar) no formulário e nas notas do próprio evento, com as fraquezas que derrubam artigos conferidas uma a uma, e responde a revisões: uma réplica ou resposta aos revisores, ponto a ponto dentro do limite, sem nunca prometer resultados que não tem.
- **reproduce-paper**: reproduz os resultados de um artigo: o número exato a igualar, seu código e configuração, um ambiente limpo, os dados e checkpoints, uma execução pequena antes da real (as longas em [Experimentos](/guide/experiments)), os números comparados em condições iguais e cada mudança registrada em um relatório.
- **figures-for-papers**: deixa os gráficos de um artigo prontos para impressão: com a largura da coluna do modelo do evento, na fonte do artigo, em cores que leitores daltônicos distinguem, como PDFs vetoriais com as fontes incorporadas (nenhuma Type 3), tudo com um único arquivo de estilo.
- **blocked-pages**: quando uma página não carrega ou não pode ser lida (um erro, um paywall, um muro de cookies ou verificação de robô, uma página que precisa de JavaScript), tenta os outros caminhos até o conteúdo, em ordem, e nunca contorna aquilo a que você não tem direito.
- **web-scraping**: coleta dados estruturados de sites (listagens, tabelas, preços, um catálogo) em CSV ou JSON, com educação e confiabilidade, e os confere.
- **maps-and-places**: lugares sem serviços de mapas pagos: as coordenadas de um endereço, o que há por perto, distâncias, rotas e tempos de viagem, fusos horários, horários de funcionamento e um mapa em uma página.
- **watch-and-alert**: acompanha algo ao longo de dias ou semanas (um preço, um produto de volta ao estoque, notícias sobre uma empresa, uma página que muda, uma nova versão) com uma tarefa agendada, e avisa você só quando for importante.

**Planejamento e decisões**

- **decision-brief**: ajuda você a escolher: as opções (inclusive não fazer nada, quando isso é uma opção real), o que importa e quanto, as compensações e os riscos, e uma recomendação clara, em uma página.
- **project-plan**: planeja um projeto de qualquer tipo (um evento, uma mudança, um lançamento, uma reforma): marcos, tarefas com responsáveis e datas, o que depende do quê, riscos e um cronograma para manter atualizado.
- **meetings**: se vale a pena fazer a reunião, uma pauta escrita como perguntas, quem convidar, como conduzi-la, conversas individuais e o acompanhamento depois, e como se preparar para uma reunião conduzida por outra pessoa.
- **weekly-review**: uma revisão semanal para recomeçar: o que está em aberto e prometido, o que empacou, e as prioridades e o tempo da semana seguinte.
- **brainstorming**: muitas ideias com métodos nomeados (inversão, restrições, analogias, a pior ideia…), depois organizá-las e escolher algumas para testar.
- **study-coach**: aprender um assunto ou uma habilidade: o que você já sabe, um plano, explicações no seu nível, perguntas de prática e flashcards para revisar depois.
- **job-interviews**: preparar-se para uma entrevista de emprego: o que a vaga exige, um banco de exemplos verdadeiros, entrevistas simuladas com uma pergunta de cada vez e feedback honesto, perguntas difíceis e uma análise de como uma entrevista foi; também para quem entrevista.
- **solo-business**: um negócio seu (trabalho autônomo, um serviço, um produto, um negócio paralelo): o que você precisa dele, uma oferta testada com clientes que pagam antes de construir muita coisa, preços que remuneram o seu tempo e quando mudar de rumo ou parar.

**Dados e números**

- **data-analysis**: responde perguntas a partir de dados (um CSV, uma planilha do Excel, uma exportação): confere e limpa os dados, faz os cálculos de um jeito que pode ser verificado e diz em que a resposta se apoia.
- **dashboards**: o gráfico certo para a pergunta, e **painéis** para voltar a consultar como uma página mantida, com os dados guardados ou buscados ao vivo.
- **notebooks**: notebooks Jupyter que se leem bem e podem ser executados de novo: uma célula de texto antes de cada seção, células pequenas, um ambiente para executá-los (criado ao lado do notebook quando nenhum serve), uma execução completa desde o início antes de entregar e um cartão que o abre na página de notebooks do app.
- **financial-model**: os números de um negócio em uma planilha (receita, custos, fluxo de caixa, ponto de equilíbrio, cenários), com as premissas em uma aba própria e fórmulas que dá para acompanhar.
- **sql-and-databases**: SQL correto e seguro, mudanças de esquema e migrações seguras em dados em produção, índices e um backup antes de qualquer coisa arriscada.

**Design e imagens**

- **image-prompts**: criar imagens (e vídeos curtos) com os modelos de imagem do app: o que descrever, tamanhos, texto em imagens, manter um personagem ou estilo igual em várias imagens e editar uma imagem.
- **diagrams**: fluxogramas, linhas do tempo, organogramas, mapas mentais e diagramas de arquitetura que as pessoas conseguem ler, mostrados na conversa ou mantidos como uma página.
- **infographics**: explicações visuais de uma página (um infográfico, um pôster comparando opções, um gráfico de processo ou de linha do tempo): primeiro a mensagem e os fatos com fonte, depois a estrutura que combina com eles, um estilo e, por fim, a exportação real conferida no tamanho em que as pessoas vão vê-la.
- **ui-mockups**: antes de uma tela ou página ser construída, dois ou três protótipos rápidos e bem diferentes entre si, mostrados na conversa para comparar e escolher.
- **brand-kit**: uma marca para um pequeno negócio, clube ou projeto: para quem ela é, sua voz, cores com o contraste conferido, fontes gratuitas, ideias de logotipo e um cartão e um manual da marca, postos em uso em perfis e cartões.
- **youtube-thumbnails**: uma miniatura e um título que fazem uma única promessa honesta: três ideias diferentes, legíveis mesmo bem pequenas, pré-visualizadas ao lado de outros vídeos e testadas com o Testar e comparar do YouTube.

**Programação**

- **debugging-code**: a causa raiz de um bug: primeiro um teste que falha, o stack trace, a delimitação do problema (logs, um depurador, git bisect), a correção e um teste que a mantém corrigida.
- **test-first**: testes antes do código, para comportamentos novos e correções de bugs, no nível certo, com o que simular e o que não simular.
- **code-review**: revisar uma alteração, ou o próprio trabalho do agente antes de entregar: primeiro a correção, depois a segurança, os testes e a clareza, cada achado com onde está, por quê e uma correção.
- **refactoring**: mudar a estrutura do código sem mudar o que ele faz, em passos pequenos e com os testes passando.
- **codebase-tour**: orientar-se em um código desconhecido: como compilar, executar e testar, suas partes e onde as coisas ficam, com uma visão geral curta e um diagrama.
- **git-rescue**: sair de apuros no Git com segurança: desfazer commits, encontrar trabalho perdido, resolver conflitos, um segredo enviado por engano em um commit, sempre com um backup antes.
- **github**: pull requests, revisões, verificações e seus logs, issues e releases no GitHub, com o comando gh ou sua API.
- **api-requests**: chamar e depurar APIs da web: logins com suas chaves salvas, respostas de erro, páginas de resultados, limites de requisições e novas tentativas.
- **frontend-polish**: fazer uma página da web parecer e funcionar como algo acabado: layout, espaçamento, tipografia, cor e contraste, todos os estados, celulares, o teclado, conferido em capturas de tela reais.
- **web-accessibility**: sites e apps web que todos conseguem usar (o teclado, leitores de tela, zoom, contraste, legendas, formulários e caixas de diálogo), verificados com ferramentas e à mão, e relatados com honestidade.
- **web-app-qa**: testar um app web como um usuário exigente, no navegador, e escrever os bugs encontrados com passos e evidências.
- **docker**: Dockerfiles e arquivos compose, criar e depurar contêineres e limpar com cuidado.
- **servers**: cuidar de um servidor ou de outro computador por SSH (atualizações, um serviço com falha, um disco cheio, usuários e chaves, o firewall, backups), sempre com um jeito de voltar a entrar antes de mexer no acesso, uma máquina primeiro e uma verificação após cada mudança.
- **security-check**: uma revisão prática de segurança: segredos, injeções, quem pode fazer o quê, pacotes desatualizados, cada problema relatado conforme sua gravidade.
- **performance**: tornar um software mais rápido medindo primeiro, achando o maior custo, corrigindo e medindo de novo.
- **mcp-servers**: criar um servidor MCP para que os agentes ganhem novas ferramentas, projetar bem as ferramentas dele, testá-lo e adicioná-lo a um agente.
- **ci-doctor**: uma execução de CI que falhou (GitHub Actions, GitLab CI, Buildkite, CircleCI): o primeiro erro de verdade nos logs, instável ou real conforme as evidências, reproduzido em um worktree, depois executado de novo uma vez, corrigido em um pull request em rascunho ou relatado, conforme o permitido.
- **issue-triage**: uma nova issue rotulada com os rótulos do próprio projeto, duplicatas encontradas em várias formulações (e com que grau de certeza), um pedido gentil pelo que falta no relato e uma pequena correção tentada em um pull request em rascunho.
- **dependency-upgrades**: o que está desatualizado e quais dependências têm avisos de segurança, atualizadas por risco (correções de segurança, patch, minor, majors à parte) em worktrees, com os testes executados e as notas de versão lidas, um pull request por grupo.
- **incident-response**: um alerta ou uma queda: você é avisado na hora, depois vem uma linha do tempo de erros, deploys e mudanças, a causa provável com suas evidências, uma reversão proposta e perguntada antes, e um postmortem sem culpados depois.
- **git-bisect**: encontrar o commit que quebrou algo com um script de verificação e git bisect run em um worktree próprio, e por que ele quebrou as coisas (veja [Descubra o que quebrou](/guide/engineering#find-what-broke-it)).

**Modelos de IA**

- **hugging-face**: publicar e usar modelos e conjuntos de dados no Hugging Face Hub: envios, cartões de modelo e de dataset, repositórios com acesso restrito e conferência de um envio.
- **fine-tuning**: se vale a pena fazer o fine-tuning de um modelo de linguagem e como fazer: os dados de treinamento, LoRA e QLoRA, configurações, a memória necessária e uma avaliação honesta.
- **model-evaluation**: avaliar modelos com justiça: os conjuntos de teste e as medidas certos, benchmarks, um modelo como juiz com cuidado e o grau de confiança nos resultados.
- **local-models**: executar modelos abertos no seu próprio computador: qual modelo e tamanho cabem, a memória de que precisam, quantização, e Ollama, llama.cpp ou vLLM.

**Este app**

- **everyday-help**: para o “o que você pode fazer por mim?”: uma conversa curta sobre os seus dias, uma pergunta de cada vez, depois uma ou duas ideias combinadas com o que o app realmente faz e uma coisinha configurada, se você disser que sim.
- **app-builder**: para criar ou alterar um dos seus apps. O agente define o que entra e o que sai, escolhe o passo mais barato para cada parte, dá ao app exemplos com verificações e os testa antes de entregar, dizendo quanto custa uma execução.
- **skill-authoring**: escrever uma boa habilidade: quando vale a pena ter uma, a linha sobre quando usá-la, sua estrutura e verificações, e como melhorá-la depois do uso.
- **plugin-authoring**: criar, empacotar e compartilhar um plugin (veja [Plugins](/guide/plugins)): o que vai nele, seu formato, como conferi-lo e como adicioná-lo.

As habilidades de documentos (pdf, presentations, spreadsheets, word-documents) criam arquivos com pequenos scripts em Python. Elas precisam do Python 3 neste computador. Na primeira vez que uma delas for necessária, as bibliotecas que ela usa são baixadas para uma pasta privada dentro da pasta de dados do app (cerca de 30 MB, uma única vez); nada é instalado para o sistema inteiro. Se o Python não estiver instalado, o agente informa o comando que o instala. Para olhar as páginas como imagens antes de entregar um arquivo, elas usam o LibreOffice e o Poppler, quando este computador os tem. Veja [Documentos, imagens, vídeos e voz](/guide/documents-voice).

As habilidades integradas não podem ser removidas, mas você pode desativar qualquer uma delas ou alterar uma: a sua versão toma o lugar dela.

## Escrever uma habilidade própria

1. Clique em **Nova habilidade** ([abrir](/settings?s=skills&find=New%20skill)).
2. Digite um **Nome**: curto, com hifens. “Conferência de faturas” é salvo como conferencia-de-faturas.
3. Em **Quando usar**, escreva uma linha, como “Use ao conferir a fatura de um fornecedor antes de pagá-la”. Os agentes veem essa linha em todas as sessões e só leem o restante quando ela se aplica.
4. Em **Instruções**, escreva o método: os passos em ordem, as verificações, os erros a evitar. Markdown funciona.
5. Se quiser, escolha o **Grupo** e as **Palavras que a acionam**: palavras de um pedido que trazem a habilidade para a vez do Custom por conta própria, separadas por vírgulas (veja [Acionar habilidades por palavras-chave](#bring-skills-in-by-keywords)).
6. Em **Quem recebe**, mantenha **Todos os agentes**, ou escolha **Claude Code** ou **Codex** para uma habilidade que só esse agente recebe.
7. Clique em **Adicionar habilidade**.

Uma habilidade para todos os agentes é salva na sua pasta de habilidades (na pasta de dados do app, `~/.hydor/skills`, a menos que sua instalação guarde os dados em outro lugar) e aparece em **Seus**. Uma habilidade do Claude Code vai para `~/.claude/skills`, e uma do Codex para `~/.agents/skills`, que cada um lê em todas as pastas. Se já existir uma habilidade com esse nome, o app avisa e não salva nada. Uma habilidade só para um projeto é escrita na aba **Habilidades** desse projeto: veja [Dar habilidades próprias a um projeto](/guide/projects#give-a-project-skills-of-its-own).

Para alterar uma das suas, abra-a e clique em **Variação**: os mesmos campos, salvos com **Salvar**. Cada alteração fica guardada no histórico. Você também pode colocar habilidades na sua pasta de habilidades por conta própria: uma pasta por habilidade, com nome em letras minúsculas, dígitos e hifens, e o SKILL.md dentro. Elas aparecem em **Seus**.

## Alterar uma habilidade integrada

Abra a habilidade e clique em **Fazer minha própria versão**. Os mesmos campos abrem com o texto dela; altere o que quiser e clique em **Salvar**. Sua versão começa como uma cópia da pasta inteira da habilidade integrada (com os exemplos e scripts), já com a sua alteração.

A partir daí, os agentes usam a sua versão no lugar da integrada, mesmo depois que o app atualizar a habilidade integrada. Ela aparece em **Seus** como “Sua versão de uma habilidade integrada”. Para voltar à habilidade integrada, remova a sua versão (veja [Remover uma habilidade e trazê-la de volta](#remove-a-skill-and-bring-it-back)).

Quando você aprova a melhoria que um agente propõe para uma habilidade integrada, ela é salva como a sua versão da mesma forma: o cartão avisa isso antes de você aprovar.

## Remover uma habilidade e trazê-la de volta

1. Abra uma das suas habilidades e clique em **Remover**.
2. Confirme com **Remover**.

Os agentes deixam de recebê-la. Se era a sua versão de uma habilidade integrada, os agentes voltam à integrada. O texto continua no histórico da habilidade, então você pode trazê-la de volta: as habilidades que você removeu aparecem listadas no fim da página, depois de **Removida:**. Clique em um nome ali (passe o cursor sobre ele para ver quando foi removida) e a habilidade volta como era.

Habilidades próprias do Claude Code e do Codex: **Excluir** na janela deles remove a pasta da habilidade do disco, com todos os arquivos dentro, depois que você confirma. Isso serve para as suas próprias habilidades e, na aba Habilidades de um projeto, no caso do Claude Code, também para as da pasta do projeto. Habilidades integradas, de administrador e de plugins desses agentes não podem ser excluídas: desative-as. Uma habilidade excluída não pode ser recuperada pelo app.

## Aprovar, editar ou dispensar uma habilidade proposta

Depois de uma tarefa que deu trabalho de verdade, um agente pode propor guardar o método dele como habilidade: uma correção encontrada depois de várias tentativas, um fluxo de trabalho que você teve de explicar, um processo cujos passos são fáceis de errar. Ele também pode propor uma melhoria para uma habilidade que seguiu, quando percebeu que um passo estava faltando, errado ou confuso. Os agentes são instruídos a não propor fatos isolados, seus dados pessoais nem nada secreto.

Nada é salvo até você aprovar. Enquanto isso, o agente continua o trabalho, e sua resposta chega a ele como uma mensagem.

### O que o cartão mostra

A proposta aparece como um cartão na conversa, fora dos passos recolhidos, enquanto o agente continua. No topo, ele pergunta **Manter isto como habilidade?**, **Melhorar esta habilidade?** ou **Melhorar esta habilidade integrada?**, com o nome da habilidade e um selo: **Aguardando você**, **Salvo**, **Dispensada** ou **Substituída**.

Abaixo disso:

- **Por quê**: o que aconteceu nesta tarefa que faz valer a pena guardá-la, nas palavras do agente.
- **Quando se aplica**: a linha que os agentes leem para decidir quando usá-la. Em uma melhoria que a altera, a linha antiga aparece riscada.
- As palavras-chave dela para o Custom, se tiver: “O Custom a aciona quando você diz” e as palavras.
- Avisos, se houver (veja [Avisos no cartão](#warnings-on-the-card)).
- O texto, com um seletor entre **Texto** (para uma habilidade nova) ou **Alterações** (para uma melhoria, linha por linha) e **Habilidade** (o guia como ele fica), e quantas linhas são adicionadas e removidas.
- Em um projeto, **Manter para**: **Todas as sessões** ou o nome do projeto (veja [Habilidades que os agentes propõem em um projeto](/guide/projects#skills-agents-propose-in-a-project)).

### Aprovar

Clique em **Aprovar**. A habilidade é salva na sua biblioteca, e o cartão diz que ela está na sua biblioteca de habilidades: todos os agentes podem usá-la. Um link **Suas habilidades** leva você a [Configurações → Habilidades](/settings?s=skills).

Com o nome do projeto escolhido em **Manter para**, ela é salva nas habilidades do projeto: o cartão diz que ela está nelas, e **As habilidades do projeto** leva você até lá.

O Custom passa a ter a habilidade a partir da próxima vez dele; o Claude Code e o Codex, a partir das próximas sessões.

### Editar antes

1. Clique em **Editar…**. Abre-se uma janela com a habilidade inteira em forma de texto.
2. Altere o que quiser. As linhas do topo (entre as linhas `---`) guardam o nome, que deve ser mantido, e a linha sobre quando usar. Tudo abaixo delas é o guia que os agentes seguem.
3. Clique em **Salvar e aprovar**.

O cartão então diz que você a editou antes de salvar e mostra a versão salva. O app confere o texto editado como confere o do agente: ele precisa de uma linha sobre quando usar, passos de verdade e nenhum segredo.

### Dispensar

1. Clique em **Dispensar…**.
2. Se quiser, diga ao agente o motivo na caixa que se abre.
3. Clique em **Dispensar** (ou em **Cancelar** para voltar).

Nada é salvo. O agente fica sabendo que você dispensou, com a sua observação, e é instruído a não propor de novo, a menos que você peça.

### Avisos no cartão

Habilidades são arquivos que todos os agentes leem, então o app confere cada proposta antes de você vê-la:

- **Um segredo a barra.** Uma proposta com algo que parece uma senha, uma chave ou um token (uma chave de API, uma chave privada, uma senha escrita por extenso ou dentro de um endereço) nunca chega a você como cartão. O agente é instruído a tirá-lo e a dizer onde o segredo fica guardado.
- **Texto que tenta direcionar os agentes é apontado.** O cartão mostra **Veja estas linhas antes de aprovar**, com o número da linha e o texto, quando uma linha que a proposta adiciona: manda os agentes ignorarem suas instruções, tenta trocar quem o agente é, manda os agentes esconderem algo de você, tenta contornar aprovações, envia chaves ou arquivos privados para algum lugar, executa um script direto da internet, altera configurações ou arquivos de inicialização de agentes, exclui ou sobrescreve algo bem fora de um projeto, esconde instruções em um comentário HTML ou tem caracteres que você não consegue ver.

Aprovar uma proposta com avisos pergunta mais uma vez: **Salvar com estes avisos?** Clique em **Salvar** só se as linhas sinalizadas forem o que você quer que os agentes sigam.

### Responder pelas Configurações ou pela caixa de entrada

Uma proposta espera em três lugares, e uma resposta dada em qualquer um deles aparece em todos, em todos os dispositivos:

- o cartão na própria conversa;
- o grupo no topo de [Configurações → Habilidades](/settings?s=skills), “Um agente sugere uma habilidade” (ou quantas ele sugere). Cada linha diz **Nova habilidade:** ou **Alterar para** e o nome, há quanto tempo, de qual conversa veio (clique para abri-la) e “tem avisos” quando houver. **Revisão** abre o mesmo cartão em uma janela;
- a [caixa de entrada](/inbox), como “Sugere uma nova habilidade: …” ou “Sugere uma alteração na habilidade …”. **Abrir** leva você à conversa, onde está o cartão. Veja [Caixa de entrada e notificações](/guide/inbox).

### Limites

- Uma proposta comporta no máximo 20.000 caracteres. Guias mais longos são recusados, e o agente é instruído a manter os passos principais.
- Uma habilidade nova precisa de um nome que não esteja em uso. O nome é formado por palavras curtas em minúsculas com hifens, como release-notes.
- No máximo cinco propostas de uma mesma conversa ficam aguardando você ao mesmo tempo.
- Quando o agente propõe a mesma habilidade de novo antes de você responder, a proposta mais nova toma o lugar da mais antiga, que mostra **Substituída**.
- Se uma habilidade com esse nome foi salva, ou a habilidade mudou, depois que a proposta foi feita, a aprovação falha com uma mensagem. Dispense a proposta e peça de novo ao agente.
- Os agentes só podem melhorar habilidades da biblioteca do app e as habilidades próprias de um projeto. As habilidades próprias do Claude Code e do Codex não são alteradas assim: altere-as em [Configurações → Habilidades](/settings?s=skills).
- Propostas respondidas permanecem nos cartões de conversas antigas por meio ano.

## Habilidades adequadas a uma nova sessão

Quando uma sessão começa com uma mensagem, o agente também fica sabendo quais habilidades combinam com essa mensagem, se alguma combinar claramente: até três, cada uma com a sua finalidade e com a forma como aquele agente carrega uma (o Claude Code com a ferramenta Skill dele, o Codex e outros agentes lendo o SKILL.md, o Custom com a ferramenta de habilidades dele, que também pode encontrar uma habilidade pelo tipo de trabalho, em poucas palavras). O agente carrega a que combina antes de começar, ou segue em frente quando nenhuma combina. Ele fica sabendo disso uma vez, com a sua primeira mensagem, e não a cada mensagem (no caso do Custom, nas instruções com que ele trabalha).

As habilidades são encontradas da mesma forma que a Memória encontra notas (veja [Com o que um agente começa](/guide/memory#what-an-agent-starts-with)): pelas palavras delas, com o nome da habilidade pesando mais, depois as palavras-chave e a finalidade; e, com a Busca por significado ativada em [Configurações → Memória](/settings?s=memory&find=Search%20by%20meaning), pelo que elas significam, de modo que um pedido com outras palavras, ou em outro idioma, ainda encontre a habilidade. Só contam correspondências claras: por palavras, pelo menos duas das suas e bem à frente das demais; por significado, apenas a habilidade mais próxima, quando for parecida o bastante. Palavras comuns de um pedido, como “ajuda”, “preciso” ou “depois”, não contam para a correspondência. Conversa informal, respostas curtas e pedidos a que nenhuma habilidade se adapta não recebem nenhuma.

Isso fica no menu **⋯** de [Configurações → Habilidades](/settings?s=skills&find=Suggest%20skills%20that%20fit): **Sugerir habilidades adequadas**, marcado enquanto estiver ativado. Fica ativado, a menos que você o desative. Não vale para uma sessão que continua, nem para as execuções de um app.

## Acionar habilidades por palavras-chave

Alguns modelos raramente carregam uma habilidade por conta própria. Para eles, o Custom pode trazer uma habilidade quando a sua mensagem usa as palavras-chave dela: o texto da habilidade acompanha a sua mensagem, e o agente o segue onde couber.

Isso fica no menu **⋯** de [Configurações → Habilidades](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords): **Acionar habilidades por palavras-chave**, marcado enquanto estiver ativado. Fica ativado, a menos que você o desative. Afeta apenas o Custom; o Claude Code e o Codex carregam habilidades por conta própria. Com a opção desativada, o Custom ainda vê a lista de habilidades dele e carrega uma quando uma tarefa combina.

Quando palavras-chave acionam uma habilidade, aparece na conversa, sob a sua mensagem, uma etiqueta: **Usando a habilidade pesquisa**, “acionada por “pesquisa” na sua mensagem”. Clique nela para ler a habilidade.

### Como as palavras-chave correspondem

- Uma palavra-chave corresponde a palavras inteiras, em maiúsculas ou minúsculas: “pesquisa” não corresponde a “pesquisadores”.
- Uma palavra-chave terminada em * também corresponde a palavras mais longas: “renov*” corresponde a renovar e renovação; “depur*” corresponde a depurar e depuração.
- Mensagens com menos de quatro palavras não acionam nada, então “ok, continue” nunca carrega uma habilidade.
- No máximo duas habilidades são acionadas por vez: as que têm mais palavras-chave na sua mensagem vêm primeiro.
- Uma habilidade acionada permanece nessa mensagem e nas duas seguintes, para que um processo como perguntar primeiro ou pesquisar possa se estender por várias vezes. As habilidades de uma mensagem mais nova tomam o lugar das mais antigas.
- Uma habilidade longa é cortada para caber no que o modelo aceita; o agente é instruído a carregar o resto por conta própria.

As habilidades integradas com palavras-chave são app-builder (“fazer um modelo”, “criar um app”, “automatizar”…), clarify-first (“planejar uma viagem”, “plano de negócios”, “renov*”…), clean-up (“limpar depois”, “arquivos sobrando”…), decisions-log (“enquanto estou fora”, “durante a noite”…), evidence-before-done (“conferir de novo”, “verificar”…), research (“pesquisar”, “encontrar fontes”, “revisão da literatura”…), troubleshooting (“não funciona”, “trava sempre”, “depur*”…) e writing (“redigir um”, “revisar o texto”, “carta de apresentação”…). A maioria das outras também tem algumas, e as habilidades de documentos não têm nenhuma: o Custom as carrega quando uma tarefa combina. Você vê as palavras-chave de uma habilidade quando a abre.

### Dar palavras-chave a uma habilidade

As palavras-chave de uma habilidade são uma lista nas linhas do topo do SKILL.md dela, por exemplo `triggers: [relatório semanal, atualização de status, reunião diária]`. Um agente pode propor até 12 palavras-chave com uma habilidade nova, cada uma com 3 a 40 caracteres. O Custom também reconhece palavras-chave em habilidades das suas pastas e nas de um projeto, já que ele lê essas também.

## Habilidades próprias do Claude Code e do Codex

O Claude Code e o Codex também leem habilidades de pastas próprias deles: as suas, que eles leem em todas as pastas, e as de um projeto, que eles leem só ali. Elas aparecem na página Habilidades em **Próprias do Claude Code** e **Próprias do Codex** (o filtro **Claude Code e Codex** mostra só elas). Cada linha diz de onde a habilidade vem:

- **esta pasta**: as habilidades próprias da pasta de um projeto, na aba Habilidades desse projeto.
- **este repositório**: habilidades do Codex que vêm com o repositório.
- **todas as pastas**: as suas próprias habilidades, para todas as pastas.
- **um plugin**: habilidades que vêm com um dos plugins do próprio agente (veja [Plugins próprios do Claude Code e do Codex](/guide/plugins#claude-codes-and-codexs-own-plugins)).
- **integradas a ele**: habilidades que vêm com o Codex.
- **definida por um administrador**: habilidades que um administrador configurou para o Codex.

Para o Claude Code, Configurações → Habilidades lista as suas habilidades (em `~/.claude/skills`); para o Codex, o que o próprio Codex informa para todas as pastas. A aba **Habilidades** de um projeto lista também as da pasta do projeto, com chaves para esse projeto apenas. Quando algumas não puderam ser lidas (o Codex não responde, um arquivo de habilidade que ele não consegue ler), uma linha sob a lista avisa.

Escreva uma com **Nova habilidade**, escolhendo **Claude Code** ou **Codex** em **Quem recebe** (veja [Escrever uma habilidade própria](#write-a-skill-of-your-own)). Abra uma para lê-la; **Variação** abre o SKILL.md dela em um editor: altere, clique em **Salvar** e depois em **Concluído**. **Abrir a pasta em Arquivos** mostra a pasta da habilidade, com os demais arquivos que houver nela.

## Pedir a um agente

- "Quais habilidades da Biblioteca os agentes usaram, e com que frequência?"
- "Mostre as propostas de habilidades que estão esperando por mim e o que cada uma mudaria."
- "Desative a habilidade de e-mail para todos os agentes."
- "Escreva uma habilidade para todos os agentes sobre como conferimos notas fiscais, a partir destes três exemplos."
- "Crie minha própria versão da habilidade de pesquisa que sempre cita os números das páginas."
- "Remova minha habilidade invoice-checks", ou "Traga de volta a habilidade que removi ontem."
- "Copie as habilidades que criei em outros agentes para as minhas próprias habilidades e liste-as para mim primeiro."
- "Desative a inclusão de habilidades por palavras-chave para o Custom."
- "Pare de sugerir habilidades no início de novas sessões."
- "No meu projeto Shop website, desative a habilidade de deploy do Claude Code e ative a habilidade docker somente lá."
