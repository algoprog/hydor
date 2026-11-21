# Hydor em um terminal

O comando `hydor` faz em um terminal o que você faz nas páginas do app: conversar com um agente e acompanhar o trabalho dele em tempo real, aprovar o que ele pede e responder às perguntas dele, executar um pedido a partir de um script e receber a resposta de volta, e cuidar de tudo o que o app guarda: suas sessões, projetos, agentes, memória, habilidades, plugins, chaves, tarefas agendadas, uso e todas as configurações. Quando só uma página consegue fazer a tarefa (desenhar uma assinatura, os editores de slides e de diagramas), o comando mostra o endereço da página. Ele usa o mesmo Hydor do app, então uma sessão começada no terminal aparece no app, e uma começada no app continua no terminal. O seu shell completa o comando enquanto você digita.

![O comando hydor: a caixa de boas-vindas e o menu que abre quando você digita uma barra](images/terminal.webp)

## Instalar o comando

- **Instalado com o instalador** (`./install.sh`): o instalador cria um link de `hydor` em `~/.local/bin` quando essa pasta está no seu PATH, e avisa. Caso contrário, ele informa onde está o comando: `bin/hydor.mjs`, na pasta do Hydor, que você pode executar como está ou vincular a uma pasta onde guarda seus comandos.
- **Com Docker**: a imagem já inclui o comando. Execute `docker exec -it hydor hydor` para conversar com um agente dentro do contêiner.
- **O app para Mac** coloca o comando no seu PATH sozinho, toda vez que é iniciado. Ele cria um link de `hydor` em `~/.local/bin`, `~/bin`, `/usr/local/bin` ou `/opt/homebrew/bin`, na primeira dessas pastas que estiver no seu PATH e em que você tiver permissão de escrita. Quando nenhuma serve, ele usa `~/.local/bin` e adiciona uma linha, marcada como do Hydor, ao arquivo de inicialização do seu shell (`~/.zprofile` no zsh) para que essa pasta fique no seu PATH. Depois, abra uma nova janela do Terminal. O comando usa o Node.js do próprio app e, quando o app está fechado, `hydor` o abre. Ele não faz nada a partir da imagem de disco, nem antes de você mover o app para **Aplicativos**. Dentro do app, `hydor update`, `hydor service install` e `hydor serve` apenas informam que o app faz isso sozinho.
- **Os apps de desktop para Linux e Windows** fazem o mesmo a cada início, sem pedir senha e sem perguntas. No **Linux** (o AppImage ou o .deb), o comando é um pequeno arquivo `hydor` em `~/.local/bin`, `~/bin` ou `/usr/local/bin`, na primeira dessas pastas que estiver no seu PATH e em que você tiver permissão de escrita. Quando nenhuma serve, ele usa `~/.local/bin` e adiciona uma linha, marcada como do Hydor, ao arquivo de inicialização do seu shell. O `/usr/bin/hydor` do próprio .deb abre a janela do app, então o comando precisa vir antes dele no seu PATH. No **Windows**, ele coloca `hydor.cmd` na sua pasta WindowsApps, que o Windows já consulta; se não for possível, em `%LOCALAPPDATA%\Hydor\bin`, que ele adiciona ao seu PATH. Depois, abra um novo terminal (Windows Terminal, PowerShell ou Prompt de Comando). Como no Mac, o comando usa o Node.js do próprio app, quando o app está fechado `hydor` o abre, e `hydor update`, `hydor service install` e `hydor serve` apenas informam que o app faz isso sozinho. Se já houver outro `hydor` no seu PATH (o link que o instalador cria para uma cópia do git), o app não mexe em nada. A partir de uma cópia do Hydor em outro computador, você ainda pode usar o Hydor de lá: veja [Usar o Hydor de outro computador](#use-another-computers-hydor).

`hydor help` lista tudo o que o comando faz, em grupos, com uma linha para cada item; `hydor help <command>` mostra o uso de um comando, suas opções e exemplos, `hydor help options` lista todas as opções, e `hydor help <command> <verb>` mostra as de um verbo. Os comandos de manutenção funcionam com o mesmo nome: `hydor service status`, `hydor setup-token`, `hydor update` e os demais (`node dist/server/cli.js …` continua funcionando também). Se você digitar errado um comando, uma opção ou um verbo, ele pergunta “Did you mean …?”. Os erros aparecem em vermelho.

Uma mensagem que começa com o nome de um comando vai entre aspas (`hydor "find the bug in login"`), ou depois de `hydor chat`, para não ser confundida com o comando.

Você não precisa iniciar o Hydor antes. Quando nada responde neste computador, o comando o inicia em segundo plano, mostra **Starting Hydor…** e o deixa em execução quando termina, para que suas sessões continuem. `hydor status` informa qual Hydor ele usa, a versão, se ele roda como serviço e o que está funcionando. Em um computador com o app de desktop, um app fechado é aberto no lugar: o comando não inicia um servidor próprio.

## Conclusão com Tab no seu shell

Ative uma vez:

```bash
hydor completion install
```

Ele configura o shell que você usa (bash, zsh ou fish): grava o script onde o shell o procura e, no zsh e no bash sem bash-completion, adiciona uma linha ao seu `.zshrc` ou `.bashrc`. Depois, abra um novo terminal. Executá-lo de novo não altera nada em dobro. `hydor completion bash` (ou `zsh`, `fish`) imprime o script em vez disso, para você colocá-lo onde preferir: `source <(hydor completion bash)`.

Depois disso, a tecla Tab completa o que você digita: os comandos, seus verbos e opções, e as coisas que eles recebem. Depois de `hydor show ` ou `hydor send `, ela lista as chaves das suas sessões, cada uma com o título; depois de `--model`, os modelos; depois de `--as`, seus agentes; depois de `--cwd`, pastas; e do mesmo modo projetos, habilidades, plugins, configurações, tópicos do guia e mais, como estão neste Hydor. Se o Hydor não responder rápido, a conclusão oferece o que consegue sem ele e nunca trava o seu shell.

## Conversar com um agente

Em uma pasta, execute `hydor`, ou `hydor` seguido da sua mensagem (`hydor corrija o teste que está falhando`). A primeira mensagem começa uma sessão nessa pasta.

O chat abre com um painel de boas-vindas, uma caixa com **HYDΩR** e a versão dele na borda superior. Dentro dela aparecem a pasta "em" seu branch do git (nenhum branch é mostrado quando o git não tem um para indicar); depois o programa que vai responder a você (**Claude Code**, **Codex** ou **Custom**), o modelo (**Automático** quando o modelo é escolhido conforme o trabalho, em um Hydor com níveis) e o modo de permissão, com um · entre eles; o modo aparece em vermelho quando o agente age sem perguntar, e na cor de destaque no modo planejar; e uma linha de dicas: `/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`. A caixa mantém a mesma largura, seja qual for o nome da pasta.

O que você vê fica no próprio histórico do terminal, então você pode rolar para trás e copiar dele, inclusive por SSH e no tmux:

- **Suas mensagens**, depois de um `›`.
- **O texto do agente** conforme chega, com seus títulos, listas, citações, tabelas, links (o endereço depois das palavras) e código (nunca reajustado, para que o que você copiar funcione).
- **Cada passo** em uma linha: o que ele leu, pesquisou, editou (com as linhas adicionadas e removidas), executou (com o tempo que levou e, quando falhou, o código de saída, com a primeira linha do erro embaixo).
- **Pensamentos** em uma linha apagada, como "Thought for 8 s". Comece com `--thinking` para vê-los por inteiro, e com `-v` para ver as primeiras linhas da saída de cada passo.
- **Subagentes**: "Subagent started" quando o agente entrega parte do trabalho a um [subagente do Hydor](/guide/research#let-an-agent-hand-work-to-subagents), e "Subagent finished" (ou "Subagent failed") quando a resposta dele volta. O Claude Code também pode executar subagentes próprios em segundo plano e encerrar o turno enquanto eles trabalham: as linhas de baixo dizem quais estão trabalhando em segundo plano, "Finished in the background" aparece quando cada um termina, e o agente continua sozinho. Um comando que ele deixa rodando em segundo plano, como um servidor de desenvolvimento, não trava nada. `/subagents` lista todos eles com o que cada um está fazendo (e quanto um subagente custou).
- **O fim de cada turno**: quanto tempo levou, quanto custou, o modelo e quantos subagentes trabalharam ("1 subagent", "3 subagents").

Na parte de baixo, algumas linhas mudam enquanto o agente trabalha: o texto que ainda está sendo escrito, o passo em andamento, os subagentes trabalhando, um indicador giratório colorido com o tempo até agora (um brilho passa sobre "Working") e a sua linha de entrada. Pressione **Esc** ou Ctrl+C para interromper o turno.

### A linha de entrada

Sua entrada fica entre duas linhas finas, com uma linha de status embaixo: a pasta com seu branch, o modelo e o modo, e o custo até agora, com `/help` à direita.

- **Uma sugestão em cinza** vinda das suas mensagens anteriores aparece depois do que você digita. **→** aceita a sugestão inteira, **Alt+→** uma palavra dela. **Configurações → App → Geral → Sugestões do terminal** desativa e ativa o recurso ([Configurações](/settings?s=general&find=Terminal%20suggestions)).
- **Ctrl+R** pesquisa suas mensagens anteriores: digite algumas palavras, vá até um resultado com **↑** e **↓**, e **Enter** o coloca na linha sem enviar, para você poder alterá-lo antes. **Esc** desiste.
- Uma mensagem pode ter várias linhas, e um texto colado entra inteiro.

### O menu de preenchimento

Um menu abre embaixo da linha conforme você digita, e acompanha cada tecla:

| Digite | O menu lista |
| --- | --- |
| `/` | Os comandos, cada um com o que faz: primeiro os do próprio chat, depois os do próprio programa (os comandos e habilidades do Claude Code, por exemplo). |
| `/model `, `/mode `, `/effort `, `/agent `, `/subagents `, `/open ` | Os valores desse comando: os modelos, modos, níveis de esforço, seus agentes, os subagentes, onde abrir. |
| `@` e algumas letras | Os arquivos da pasta da sessão, encontrados de forma aproximada: `@clits` encontra `src/cli.ts`. Termine com `/` para navegar nessa pasta. |

**↑** e **↓** movem, **Tab** completa a linha destacada, e **Enter** a completa e a executa (um comando que precisa de um valor abre os valores desse comando). **Esc** fecha o menu. A correspondência é aproximada, e as letras de um comando não precisam estar juntas: `mdl` encontra `/model`.

### Seletores

`/sessions`, `/resume`, `/model`, `/effort`, `/mode` e `/agent`, digitados sem um valor, abrem um seletor: uma lista com uma linha destacada. **↑** e **↓** movem, digitar reduz a lista, **Enter** escolhe, **Esc** sai. Um dígito ainda escolhe quando a lista tem nove linhas ou menos. `hydor resume` sem chave abre o mesmo seletor das suas sessões.

### Comandos de shell com `!`

Comece uma linha com `!` e o resto é executado como um comando de shell na pasta da sessão: `!git status`, `!npm test`. O chat entrega o terminal enquanto o comando roda, então programas interativos funcionam (`!vim notes.md`, `!htop`), e o retoma quando ele termina. O prompt fica amarelo enquanto a linha começa com `!`. O agente não vê o comando nem o que ele imprimiu; para mostrar algo a ele, diga isso em uma mensagem. Só funciona com o Hydor deste computador.

### Responder ao que o agente pergunta

Quando o agente precisa da sua aprovação, o pedido aparece com o assunto (o comando, a alteração em um arquivo, o plano) e as opções embaixo:

- Pressione **y** para a primeira opção que permite, **n** para recusar, ou o **número** de qualquer opção (como "Always allow").
- Para recusar e dizer ao agente o que fazer em vez disso, digite isso e pressione Enter.

Uma pergunta mostra suas opções numeradas: pressione um número para escolher uma (várias, para uma pergunta que aceita várias, depois Enter), ou digite sua própria resposta e pressione Enter. **Esc** a ignora. Um formulário pergunta seus campos um por um: digite cada resposta e pressione Enter, ou pressione Enter para manter o que ele mostra. Um arquivo é pedido pelo caminho dele neste computador.

Alguns pedidos precisam do app: um sobre uma assinatura, ou uma chave para um dos seus apps. O terminal avisa e informa o endereço da sessão no app.

### Quando o navegador do agente espera por você

O que o navegador de um agente espera aparece como um cartão no chat, depois de qualquer aprovação que esteja na frente, com as palavras que o app usa (veja [O navegador que os agentes usam](/guide/web#the-browser-agents-use)):

- "Needs you in the browser: …", para um login, uma verificação ou qualquer coisa de que o agente não tenha certeza, com o endereço da página embaixo.
- "Stopped before paying or ordering: …. That is yours to do".
- "Wants to open localhost:3000, on this machine or its network".
- "Wants to press “Send” on mail.example.com", para um botão que envia, publica, exclui ou transfere em um site em que o navegador está conectado (veja [Botões que enviam, publicam ou excluem](/guide/web#buttons-that-send-post-or-delete)); o cartão acrescenta que só o pressiona se você permitir.
- A pergunta de um pop-up da página: o site diz (ou pergunta se deve sair), com a mensagem dele.

O cartão mostra suas teclas, e um toque responde:

- Para um endereço ou um botão: **y** permite (um endereço, nesta sessão) e **n** não permite.
- Para um login, uma verificação ou um pagamento, que só você pode fazer na página: **o** abre a página da sessão do app no seu navegador, para você assumir por lá, **d** diz que você terminou, e **n** diz que você não pode (ou não agora, no caso de um pagamento).
- Para a pergunta de um pop-up: **y** é OK (Leave, para "Leave this page?") e **n** é Cancelar (Stay). Um alerta tem só OK. Para uma pergunta de texto, digite sua resposta e pressione Enter, ou pressione **y** para manter o que ela mostra, ou **n** para cancelar.

O terminal não consegue mostrar a página em si, então use **o** para assumir. Quando é respondido, o cartão encolhe para uma linha: "Done in the browser", "Skipped", "Allowed" ou "Not allowed".

### Enquanto ele trabalha

Sua linha de entrada continua sendo sua. O que o Enter faz com uma mensagem que você envia enquanto o agente trabalha é definido por **Enviar enquanto um agente trabalha** em [Configurações → App → Geral](/settings?s=general&find=Sending%20while%20an%20agent%20works): **Entrar no turno** (o padrão, como no app) a coloca no turno em andamento, e **Esperar** a coloca na fila, para ir quando o turno terminar (ela aparece como **queued**). Seja qual for a opção, dois comandos decidem para uma mensagem:

- `/queue <mensagem>` sempre espera o turno terminar.
- `/now <mensagem>` sempre entra no turno em andamento.

As duas configurações do dispositivo, **Enviar enquanto um agente trabalha** e **Sugestões do terminal**, são do próprio chat: defina-as aqui, com `hydor settings set general.sending-while-an-agent-works wait`, ou peça ao agente para alterar uma (veja [Configurações](#settings)), e o chat acompanha na hora.

### Teclas

- **Enter** envia. **Alt+Enter**, **Ctrl+J**, ou uma `\` no fim da linha antes do Enter, adiciona uma linha. Um texto colado entra inteiro, com suas quebras de linha.
- **↑** e **↓** percorrem suas mensagens anteriores (as últimas 500 são guardadas); em uma mensagem de várias linhas, movem primeiro entre as linhas dela. Com o menu aberto, movem dentro dele.
- **←**, **→**, **Início**, **Fim**, **Ctrl+A** e **Ctrl+E** movem; **Alt+←** e **Alt+→** movem uma palavra por vez; **Ctrl+W** apaga a palavra antes do cursor, **Ctrl+U** e **Ctrl+K** o resto da linha antes e depois dele.
- **Tab** abre o menu e aceita a linha destacada. **Ctrl+R** pesquisa mensagens anteriores.
- **Esc** fecha o menu ou interrompe o turno. **Ctrl+C** interrompe o turno quando há um em andamento, limpa a linha quando há texto e, fora isso, sai quando você o pressiona duas vezes. **Ctrl+D** em uma linha vazia sai. **Ctrl+L** limpa a tela. **Ctrl+Z** suspende o chat (`fg` o traz de volta).

`/keys` as lista no chat. Quando você sai, a sessão continua: o terminal diz como voltar a ela.

### Comandos

Digite-os na linha de entrada (`/` os lista):

- `/help`: os comandos, as teclas e mais algumas coisas (`@`, `!`), em seções: **Comandos**, **Chaves**, **Also**. `/keys` lista só as teclas.
- `/new` (e uma mensagem): uma nova sessão na mesma pasta.
- `/sessions` (ou `/resume`): escolher outra sessão para continuar.
- `/model`, `/effort`, `/mode`: mudam o modelo, o quanto ele pensa e o que ele pode fazer sem perguntar. Sem um nome, cada um abre um seletor.
- `/agent`: trabalhar como um dos [seus agentes](/guide/agents), a partir da próxima mensagem.
- `/subagents`: os subagentes, os de segundo plano também, o que cada um está fazendo (e quanto um subagente custou); `/subagents 2` mostra a conversa do segundo subagente.
- `/tiers`, `/usage`, `/cost`: qual modelo cada nível significa, o uso e os limites dos seus planos, e quanto esta sessão e seus subagentes custaram.
- `/copy`: copia a última resposta do agente para a área de transferência, inclusive por SSH e no tmux. `/clear` limpa a tela.
- `/queue` e `/now`: enviam uma mensagem para esperar ou para entrar no turno, conforme a configuração ([Enquanto ele trabalha](#while-it-works)).
- `/stop`, `/rename`, `/open`, `/quit`: interrompem o turno e os subagentes em segundo plano, renomeiam a sessão, mostram o endereço dela no app, saem.
- `/hydor <comando>`: executa qualquer comando das próximas seções no chat ([Dentro do chat](#inside-the-chat)).

Qualquer outro `/comando` vai para o agente como está, para os comandos e habilidades do próprio programa.

As cores são true color quando o terminal tem esse recurso. `NO_COLOR` e `--no-color` as desativam, e um pipe também.

## Continuar uma sessão

- `hydor -c` continua a última sessão da pasta em que você está.
- `hydor resume` abre um seletor das suas últimas sessões; `hydor resume 6f1e2a3b` continua aquela.

Os últimos turnos aparecem primeiro, cada um com o trabalho resumido em uma linha ("Ran 3 commands, read 4 files"); `hydor show` mostra tudo.

## Escolher como uma sessão começa

Estas opções vão com `hydor`, `hydor run` e `hydor resume`:

- `--agent claude`, `codex`, `custom`, ou o nome de [outro programa de agente](/guide/agents-models): qual programa responde.
- `--model` (o nome de um modelo, ou `auto` para Automático), `--effort`, e `--mode ask`, `edits`, `plan` ou `full` (ou o nome do próprio programa para um modo).
- `--as Researcher`: começar como um dos [seus agentes](/guide/agents).
- `--cwd` (uma pasta; a pasta em que você está quando for omitida), `--worktree` (um branch e uma pasta próprios), `--cap 2` (gastar no máximo US$ 2), `--no-memory`, `--title`.

O que você deixar de fora vem do que a página inicial do app escolheu por último e, depois, dos padrões do app.

## Uma solicitação a partir de um script

`hydor run "…"` (ou `hydor -p "…"`) começa uma sessão com sua mensagem, acompanha até o trabalho terminar, mostra a última resposta do agente e encerra. Terminar significa que a vez acabou, nenhum subagente ainda está trabalhando nem deve uma resposta (incluindo os subagentes do próprio Claude Code em segundo plano, tanto os do agente quanto os de um subagente) e nada está esperando na fila: um agente que encerra a vez para aguardar seus subagentes é acordado pelas respostas ou pelo fim deles, e a execução também espera por essa vez. Um comando deixado rodando em segundo plano, como um servidor de desenvolvimento, não a segura. Com `--timeout` ou Ctrl+C, os subagentes em segundo plano são interrompidos junto com a vez. Se não houver nada depois do comando, ele lê a mensagem do que for enviado por pipe: `git diff | hydor run "revise esta alteração"`.

- Em um terminal, linhas curtas ao lado dizem o que está acontecendo (cada etapa, subagentes começando e terminando); `-q` as desativa.
- Como não há ninguém para responder, uma aprovação ou uma pergunta interrompe a execução, informa o que foi perguntado, e a sessão espera por você no app ou com `hydor resume`. O que o navegador do agente aguarda faz o mesmo (um login, um pagamento, um endereço ou um botão a permitir, uma pergunta em pop-up), e a execução avisa: "O navegador do agente: Quer clicar em “Excluir” em mail.example.com". Com `--mode full` (ou `-y`), o agente não pergunta nada.
- `--json` mostra um objeto no final: `key`, `url`, `status`, `reply`, `model`, `costUsd` (com o dos seus subagentes), `tokens`, `durationMs`, `turns`, `children` (de cada subagente do Hydor: `title`, `label`, `tier`, `costUsd`, `status`) e `error` quando falhou. `--stream-json` mostra uma linha para cada mudança conforme acontece (`item`, `live`, `note`) e, por último, esse objeto como a linha final.
- `--timeout 300` interrompe a vez após 300 segundos.

Ela termina com um código de saída que um script pode verificar:

| Código | O que aconteceu |
| --- | --- |
| 0 | Concluído |
| 1 | A sessão falhou (um erro ou o limite de uso do plano, que ela informa) ou o Hydor recusou |
| 2 | O comando não foi usado corretamente |
| 3 | Precisa de uma resposta sua |
| 124 | Demorou mais que o `--timeout` |
| 130 | Você pressionou Ctrl+C (a vez foi interrompida antes) |

## Tudo o que o app faz, pelo terminal

Cada parte do app tem um comando próprio, com verbos para o que a página dela faz. Se você omitir o verbo, ele lista: `hydor projects` é o mesmo que `hydor projects list`. `hydor help` mostra os comandos agrupados como abaixo, e a tecla Tab completa os verbos, as opções e as coisas que eles recebem.

Como todos funcionam:

- **Nomear as coisas**: sempre que um comando recebe um item (uma sessão, um projeto, um agente, uma habilidade…), informe o id ou o começo dele, ou o nome ou título (em maiúsculas ou minúsculas, quando só um combina). Se houver dois ou mais resultados, ele lista até cinco. Em um terminal, se você omitir o nome, o comando oferece uma lista para escolher.
- **Alterar as coisas**: os campos são opções (`--description`, `--name`). Um texto longo vem de `--file <path>`, do que você enviar por pipe com `-` ou, em um terminal sem nenhum dos dois, do seu editor (`$VISUAL`, `$EDITOR`) aberto com o texto atual: salvar sem mudar nada não altera nada.
- **Remover as coisas** pergunta `Remove “name”? [y/N]`. `-y` (ou `--yes`) responde sim. Sem terminal e sem `-y`, o comando se recusa, em vez de adivinhar.
- **`--json`** imprime o que a API do app devolve, do jeito que ela devolveu, para uso em scripts.
- **Códigos de saída**: 0 quando terminou, 1 quando o Hydor recusou ou falhou (ele diz o motivo) e 2 quando o comando foi usado de forma incorreta (ele diz o que digitar).
- **O Hydor de outro computador**: todos os comandos funcionam com `--server` e `--token`.
- **Só uma página consegue fazer**: o comando avisa e informa o endereço da página. `hydor open … --browser` abre essa página.

### Sessões

| Comando | O que faz |
| --- | --- |
| `hydor sessions` | Suas últimas sessões, cada uma com uma marca: ● trabalhando, ● precisa de você, ✓ concluída, ✗ erro. Os verbos dele fazem o que o menu de uma sessão faz: `search`, `rename`, `archive` e `unarchive`, `pin` e `unpin`, `read`, `snooze`, `move` para um projeto, `fork`, `goal` (sem palavras mostra o objetivo: o estado, a rodada, cada verificação, o que gastou e uma pergunta pendente; com palavras define um, e o agente propõe as verificações; `--start` pressiona **Início** nelas, `--answer 1,3` responde à pergunta pelos números mostrados (com `--other "um caminho seu"` e `--note`), `--wait` deixa a pergunta esperando, `--more rounds=8,usd=5,minutes=60` dá mais a ele, `--rule "…"` adiciona uma regra, e `--pause`, `--resume` e `--clear` o controlam: uma ação por chamada, e nada começa até você pressionar **Início**, aqui ou no app), `share` (um link somente leitura), `changes` (os arquivos que ela alterou), `commands` (os comandos que ela executou), `queue` (as mensagens em espera, e `queue clear` e `queue remove`), `show`, `export` (a conversa como um arquivo Markdown, `-o -` para imprimir, ou `--library` para um documento no projeto da sessão), `send`, `stop` e `delete`. |
| `hydor inbox` | O que espera por você (aprovações, perguntas, uma chave que um agente pediu, uma habilidade para revisar): `list`, e `show` para um item, com o lugar onde respondê-lo. |
| `hydor outbox` | Chamadas retidas esperando o seu OK (as ferramentas de uma conta conectada em Perguntar antes): `list`, `show` para uma delas com a entrada, `send` (como está, ou com `--set NAME=value` para alterar um campo) e `drop`. |
| `hydor away` | O que aconteceu desde a sua última visita, como o mostra **Enquanto você estava fora**, na página inicial: o que espera por você, sessões que terminaram ou falharam, o que rodou sozinho com o custo e o que roda a seguir hoje. `hydor away seen` marca tudo como visto. |

`hydor show 6f1e2a3b` é o mesmo que `hydor sessions show 6f1e2a3b`, e o mesmo vale para `send` e `stop`: as versões curtas continuam existindo.

```bash
hydor sessions search login          # sessions about login
hydor sessions rename 6f1e "Fix the login bug"
hydor sessions fork 6f1e "try it with a cache instead"
hydor sessions export 6f1e -o notes.md  # the conversation as Markdown
hydor sessions goal 6f1e "all tests pass and the PR is open"  # definir um objetivo: o agente propõe as verificações
hydor sessions goal 6f1e                  # ver: estado, rodada, verificações, gasto, a pergunta
hydor sessions goal 6f1e --start          # pressionar Início: as rodadas começam
hydor sessions goal 6f1e --answer 1,3    # responder à pergunta: caminhos 1 e 3, nessa ordem
hydor sessions goal 6f1e --more rounds=20,usd=10  # dar mais a ele, também num limite
hydor inbox
hydor away                           # what happened while you were away
```

### Seu trabalho

| Comando | O que faz |
| --- | --- |
| `hydor projects` | `list`, `show`, `new`, `rename`, `edit` (descrição, diretrizes, o agente com que ele começa, pastas), `sessions`, `files` (os documentos que ele lê: `files add` e `files remove`) e `remove`. |
| `hydor tasks` | Suas [tarefas agendadas](/guide/tasks) e os outros trabalhos que começam sozinhos: `list`, `show`, `new` (quando executa: `--every 2h`, `--at 09:00 --days weekdays`, `--cron`, `--once`; ou `--webhook`, `--watch-feed`, `--watch-page`, `--watch-folder`, ou `--watch-account` com `--tool` para novos itens em um app conectado, e `--before 30m` para um horário antes de cada evento em um calendário), `edit`, `pause`, `resume`, `run` (agora, mesmo em pausa), `runs` (as últimas execuções, `--reply` para a última resposta) e `remove`. Observar um comando ou um endereço JSON só é possível na página. As atualizações do cartão de um painel aparecem na lista como do painel (“Loja · Vendas por dia: atualizar”): `pause`, `resume` e `run` funcionam nelas, e `show` diz onde alterá-las, no painel. |
| `hydor apps` | Seus [apps](/guide/apps) e os prontos: `list`, `show`, `run` (as respostas do formulário como `field=value`, ou JSON em `--input`; ele imprime a resposta e o custo), `runs`, `run-show` (uma execução) e `remove`. `hydor app …` (sem o s) cria apps como arquivos: `new`, `folder`, `dev`, `try`, `export`, `import`. |
| `hydor files` (também `hydor library`) | O que os agentes fizeram para você e o que você guardou, como os **Arquivos** dos projetos mostram ([páginas, imagens, vídeos e sites](/guide/library)): `list` (`--kind`, `--project`), `search`, `show` (o texto de um documento, os cartões de um painel ou o que o item é), `export` (`--to pdf`, `docx`, `pptx`…, `-o file`), `open` (o endereço do editor dele), `remove`, `refreshes` (o que nos seus painéis é atualizado, quando e quanto custa) e `refresh` (o cartão de um painel, ou todos, agora). |
| `hydor experiments` | Execuções de treinamento e avaliação: `list`, `show` e `stop`. Iniciar uma execução é com os agentes e a página. |

```bash
hydor projects new Thesis
hydor projects edit thesis --file guidelines.md
hydor tasks new --at 09:00 --days weekdays "Summarise my unread email"
hydor apps run trip-planner destination=Lisbon days=5
hydor files export "Q3 report" --to pdf -o q3.pdf
```

### Agentes e modelos

| Comando | O que faz |
| --- | --- |
| `hydor models` e `hydor tiers` | Os modelos que cada programa oferece e qual modelo cada [nível](/guide/agents-models#tiers-a-model-for-each-kind-of-job) significa (`hydor tiers set claude best opus --effort high`, `hydor tiers reset`; `hydor tiers team off` e `hydor tiers hard off` desativam **Liderar com subagentes** e **Máximo para problemas difíceis**, e `on` os ativa de novo). |
| `hydor usage` | O uso e os limites de cada plano, e quando eles são redefinidos. |
| `hydor agents` | [Seus agentes](/guide/agents): `list`, `show`, `new`, `edit`, `results`, `export`, `install` e `remove` (os que já vêm no app podem ser copiados, não alterados). Para onde vão os resultados de um agente é `--results-to` em `new` e `edit`, uma vez para cada lugar: `library` (a mesma página, atualizada), `library:new`, `sheet` (uma linha em uma planilha própria), `sheet:<spreadsheet>#<tab>`, `email:<addresses>`, `notify`, `file:<path>`, `webhook:<url>` ou `none`. Os campos de saída dele são definidos na página dele (`hydor open agents`); `results` lista o que ele entregou, uma linha para cada resultado. `export` salva um agente como um arquivo `.hydor-agent` (`-o` para dar o nome) e diz o que ficou de fora; `install <file>` diz o que um arquivo traz e exige, depois pergunta, e o instala ao lado do seu de mesmo nome, a menos que haja `--replace` (`--schedules` adiciona os agendamentos que ele sugere, em pausa). Veja [Compartilhar um agente como arquivo](/guide/agents#share-an-agent-as-a-file). |
| `hydor accounts` | Os logins do Claude Code e do Codex: `list`, `show` (uma conta: quem está conectado e o plano, se as novas sessões começam com ela, o uso e os limites dela, se há uma chave de API registrada (nunca a chave) e se uma sessão muda de conta ao atingir um limite), `add <program> <name>` (outra conta, com login imediato), `sign-in`, `sign-out`, `remove` e `use` (aquela com que as novas sessões começam). A chave de API para crédito de API e as trocas ao atingir um limite de uso são configurações (`accounts.*`). |

```bash
hydor agents new Bookkeeper --tools read,edit --tier standard
hydor agents edit bookkeeper --results-to sheet --results-to email:sam@example.com
hydor agents export bookkeeper -o ~/Desktop/bookkeeper.hydor-agent
hydor agents install bookkeeper.hydor-agent --schedules
hydor tiers set claude best opus --effort high
hydor accounts add claude Work
hydor accounts use work
```

### O que os agentes sabem e usam

| Comando | O que faz |
| --- | --- |
| `hydor memory` | O que os agentes lembram sobre você: `list`, `search`, `show`, `add`, `edit`, `forget` (restaurável por 30 dias) e `restore`, e `profile` e `profile edit` para o que todo agente lê primeiro. `--scope`, `--project` e `--session` indicam de quem são as notas. |
| `hydor guidelines` | `show` e `edit` o que todo agente segue: para todas as sessões, para um projeto (`--project`) ou para uma sessão (`--session`). |
| `hydor skills` | As habilidades que os agentes usam: `list`, `show`, `on`, `off`, `add` (de um `SKILL.md` ou de uma pasta) e `remove`. `--agent claude` ou `--agent codex` é para as habilidades que esses programas têm por conta própria. |
| `hydor plugins` | Complementos com habilidades e ferramentas: `list`, `show`, `on`, `off`, `add` (embutido, um endereço Git, um .zip ou uma pasta) e `remove`. Como criar um plugin seu está na página dele (`hydor open plugins`). |
| `hydor mcp` | Servidores de ferramentas (MCP) para o Claude Code e o Codex: `list`, `show` (um servidor: o programa, o escopo, o comando ou endereço, os nomes das variáveis de ambiente e dos cabeçalhos com os valores ocultos, ativado ou desativado e, com `--tools`, quantas ferramentas ele tem), `status` (inicia cada um e diz quais funcionam), `add`, `edit` e `remove`. |
| `hydor connections` | Os [apps conectados](/guide/connections) (Notion, GitHub, Gmail…): `list`, `show`, `services` (o que pode ser conectado), `connect <service>` (uma chave digitada em modo oculto, ou um login no navegador que o comando aguarda) e `disconnect`. Quais ferramentas de uma conexão estão ativadas fica na página dela. |
| `hydor keys` | O [cofre](/guide/connections): `list` os nomes das suas chaves e para onde cada uma pode ir, `set <NAME>` e `remove <NAME>`. O valor é pedido com o que você digita oculto, ou lido do que você enviar por pipe; nunca é digitado como opção (seu shell o guardaria) e nunca é impresso. |

```bash
hydor memory add I prefer short answers
hydor memory forget 42
hydor skills off research
hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp
hydor keys set GITHUB_TOKEN --domain github.com
hydor guidelines edit --project thesis
hydor connections connect notion --browser
```

### Configurações

`hydor settings` alcança todas as opções das [Configurações](/settings), nos três grupos (**App**, **Agentes**, **Recursos**) e nas seções deles. Cada opção tem um id, como `general.resume-after-usage-limits`: a seção dela, depois as palavras dela. Você pode indicar uma pelo id, pela seção e o começo das palavras (`general.resume`), ou só pelas palavras, quando apenas uma combina; a tecla Tab as completa.

Em um terminal, `hydor settings` sozinho abre um navegador de opções: escolha uma seção, depois uma opção. **↑** e **↓** e a digitação as encontram, **Enter** abre uma seção ou altera uma opção (um interruptor alterna, uma escolha oferece seus valores, um número ou texto é digitado, um botão pergunta antes) e **Esc** volta. Com pipe, ele lista todas as opções. Para scripts e mudanças rápidas:

| Comando | O que faz |
| --- | --- |
| `hydor settings list [section]` | Todas as opções com o valor, ou as de uma seção. |
| `hydor settings get <option>` | O valor de uma opção e o que ela aceita. |
| `hydor settings set <option> <value>` | Altera a opção: um interruptor aceita `on` ou `off`, uma escolha um dos valores dela, um número um número inteiro, uma lista os itens separados por vírgulas (`none` esvazia). Uma chave ou token é pedido em modo oculto, ou lido do que você enviar por pipe. Um texto longo vem de `--file` ou do seu editor. |
| `hydor settings run <option>` | Pressiona um botão da página (**Enviar um teste**, **Verificar agora**…), depois de perguntar quando ele remove ou baixa algo. |
| `hydor settings open [section]` | O endereço de uma seção ou de uma opção no app. |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

O que o app guarda em cada navegador (o tema, o idioma, o som de notificação) não pode ser alterado por aqui: uma opção assim avisa e informa o endereço da página. Uma opção que só a página pode alterar faz o mesmo. As duas configurações do dispositivo que pertencem a um terminal, **Enviar enquanto um agente trabalha** e **Sugestões do terminal**, são do próprio chat, e `hydor settings set` as altera.

### Find, guide, open e api

- `hydor find rate limit` pesquisa tudo o que a caixa de busca pesquisa (**Ctrl+K**): páginas, configurações e as opções delas, sessões, memória, habilidades… `--in settings` pesquisa só nas configurações, `--urls` mostra o endereço de cada resultado embaixo dele e `--open 2` abre o segundo no seu navegador.
- `hydor guide` lista os tópicos do guia; `hydor guide projects` lê um no terminal, e `hydor guide projects "what a project is"` lê uma seção dele. `--sections` lista as seções de um tópico.
- `hydor open` imprime o endereço do app; `hydor open published`, `hydor open settings memory`, `hydor open project thesis`, `hydor open guide projects` ou `hydor open 6f1e2a3b` (uma sessão) imprimem o da página correspondente. `--browser` a abre também no seu navegador. É assim que você alcança o que só uma página faz: os editores de slides, planilhas, imagens e diagramas, uma assinatura, as cores de um tema, o login em um serviço.
- `hydor api GET /api/projects` chama qualquer endpoint da API do app e imprime o JSON dele (`hydor api POST /api/projects -d '{"name":"Thesis"}'`; o corpo pode vir de `@file` ou `-`). Os endpoints estão no [tópico da API](/guide/api).

### Dentro do chat

`/hydor <command>` executa qualquer comando acima sem sair da conversa: `/hydor sessions`, `/hydor memory search docker`, `/hydor settings get general.resume-after-usage-limits`. Ele está no menu `/` e na parte **Também** do `/help`. Depois de `/hydor `, o menu dele lista as áreas, depois os verbos delas, depois o que cada um recebe (seus projetos, sessões, configurações, pastas… como a tecla Tab completa em um shell) e as opções dele quando você digita um `-`. O que o comando imprime aparece acima da linha de entrada, e um uso incorreto ou uma resposta que o Hydor recusa aparece em vermelho; o chat continua. O comando pergunta como em um shell, mas dentro do chat: uma pergunta (uma remoção) abre um seletor cuja primeira linha é **Não**, uma chave ou um token é digitado na linha de entrada, mostrado como pontos e nunca guardado no seu histórico, e um editor de que ele precisa recebe o terminal, como acontece com `!`. Não há entrada por pipe no chat, então informe um texto longo com `--file <path>` (ou omita-o para escrevê-lo no editor). Um comando que tem um comando de barra próprio (`models` tem `/model`, `tiers` tem `/tiers`, `usage` tem `/usage`) ou que é para um shell (`run`, `serve`) avisa, e diz qual usar.

## Cuidar deste Hydor

- `hydor status` informa se o Hydor está em execução, a versão e o endereço, onde ficam os dados, se ele é um serviço e quais sessões estão trabalhando ou precisam de você (com as mesmas marcas de `hydor sessions`).
- `hydor serve` executa o Hydor aqui, em primeiro plano, até você pressionar Ctrl+C. `hydor service install` o mantém em execução como um serviço em segundo plano, `hydor update` baixa o código mais recente, compila e reinicia, e `hydor set-password`, `hydor setup-token` e `hydor access-token` fazem o que os nomes dizem. No app para Mac, `hydor update`, `hydor service install` e `hydor serve` avisam que o próprio app faz isso.
- `hydor open` mostra o endereço do app; `--browser` o abre.
- `hydor machines phone` informa se o Tailscale está instalado e com a conta conectada aqui, e o endereço em que o app é servido na sua tailnet, com um QR code para a câmera do seu celular. `hydor machines phone serve` publica o app para os seus próprios dispositivos (`--port 8443` quando outra coisa estiver no endereço de sempre) e `hydor machines phone stop` o retira do ar, como faz [Configurações → App → Usar no celular](/settings?s=phone).

## Usar o Hydor de outro computador

Crie um token de acesso nesse computador (em [Configurações → App → Máquinas](/settings?s=machines&find=Access%20from%20other%20machines) → **Novo token**, ou com `hydor access-token "meu notebook"` lá) e depois indique o endereço dele:

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

ou defina `HYDOR_URL` e `HYDOR_TOKEN` uma vez. As pastas são as desse computador: uma sessão começa na pasta padrão dele, a menos que você passe `--cwd` com uma pasta de lá (um endereço neste próprio computador, como `http://localhost:8790`, mantém a pasta em que você está). Os comandos com `!` só funcionam com o Hydor deste computador. Neste computador, o comando cria um token próprio na primeira vez, que [Configurações → App → Máquinas](/settings?s=machines&find=Access%20from%20other%20machines) lista como “This computer's command line”. Para que este Hydor mostre as sessões e as páginas de outro computador, adicione-o como máquina: `hydor machines` lista as máquinas que este Hydor usa e se elas respondem, `hydor machines add Lab --url https://lab.example.com` adiciona uma (passe `--ssh <host>` no lugar de `--url` para acessá-la por SSH; o token de acesso dela é digitado oculto, ou vem de `--file -`) e `hydor machines remove lab` deixa de usá-la.

## Cores e pipes

As cores ficam ativas em um terminal (cores reais, quando ele as tem) e desativadas quando a saída vai para um arquivo ou outro programa, e também com `NO_COLOR` definido ou `--no-color`; `FORCE_COLOR` as ativa. Quando o que você digita entra por pipe (`echo "…" | hydor`), funciona como `hydor run`. Quando só a saída vai por pipe, a conversa é impressa sem cores nem linhas que mudam, e cada linha que você digita é enviada. Listas como `hydor sessions` então imprimem as mesmas colunas, sem cores e sem cortar o que é longo, para que scripts possam lê-las. Em um terminal estreito, uma lista omite colunas inteiras (primeiro a descrição, depois outras, como endereço ou idade) em vez de cortar nomes e títulos. Onde os símbolos não podem ser exibidos (o console do Linux, uma localidade que não é UTF-8 e o console antigo do Windows), o comando desenha com caracteres simples: `+-|` para a caixa, `>` para o prompt, `*`, `+` e `x` para as marcas e HYDOR para o logotipo. `HYDOR_ASCII=1` ativa isso em qualquer lugar e `HYDOR_ASCII=0` o desativa. O que vai para um arquivo ou outro programa mantém os símbolos, a menos que `HYDOR_ASCII=1` esteja definido.

## Pergunte a um agente

- “Como converso com um agente pelo meu terminal?”
- “Ative o autocompletar com Tab para o comando hydor no meu shell.”
- “Me dê um script que execute uma revisão das minhas alterações em staging com hydor run e faça o commit falhar quando encontrar um bug.”
- “O que significa o código de saída 3 do hydor run?”
- “O navegador do agente quer apertar Enviar em um site: o que eu aperto no terminal?”
- “Meu hydor run parou com o navegador do agente esperando um login: como continuo?”
- “Configure o comando hydor no meu notebook para usar o Hydor deste computador.”
- “Qual comando do hydor lista minhas tarefas agendadas, e como desativo uma pelo terminal?”
- “Qual comando do hydor salva a conversa de uma sessão como um arquivo Markdown?”
- “Faça o terminal esperar até que uma vez termine antes de enviar minha mensagem.”
- “Desative as sugestões em cinza no terminal.”
