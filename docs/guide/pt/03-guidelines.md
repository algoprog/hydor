# Diretrizes dos agentes

As Diretrizes dos agentes são o que você quer que todos os agentes daqui sigam: como você gosta de trabalhar, o que fazer sempre ou nunca, como falar com você. Um único texto vale para todos os agentes (Claude Code, Codex, Custom e os agentes que falam ACP), e você pode escrevê-lo para todas as sessões, para um projeto ou para uma sessão.

![Configurações → Diretrizes dos agentes: o que toda sessão segue e as diretrizes de cada projeto](images/guidelines.webp)

## O que são as diretrizes

As diretrizes são palavras simples que o app entrega ao agente quando uma sessão começa, antes da sua primeira mensagem: "Responda em linguagem simples e explique qualquer jargão", "Pergunte antes de excluir qualquer coisa", "Guarde o que você criar em ~/Work", "Use a ortografia de Portugal". O agente as segue durante toda a sessão.

Você não precisa saber como cada agente lê suas instruções. O Claude Code e o Codex têm, cada um, arquivos próprios para isso (CLAUDE.md e AGENTS.md), e os outros agentes têm seus próprios jeitos; o app entrega suas diretrizes a cada um deles, então um único texto basta para todos.

O que você pede na conversa sempre vem primeiro: se suas diretrizes dizem "respostas curtas" e você pede um relatório detalhado, você recebe o relatório.

## Os três níveis

As diretrizes têm três níveis, do mais geral ao mais específico:

1. **Para todas as sessões**: todos os agentes, em todas as sessões. Definido em [Configurações → Agentes → Diretrizes dos agentes](/settings?s=guidelines).
2. **Para um projeto**: todas as sessões desse [projeto](/guide/projects). Definido nos detalhes do projeto (na aba **Configurações**), no campo **Diretrizes dos agentes**.
3. **Para uma sessão**: só essa sessão. Definido na página inicial (**Opções → Diretrizes**) antes de ela começar, ou depois, pelo menu da sessão (⋯) → **Configurações da sessão → Diretrizes**.

Um agente recebe todos os níveis que se aplicam à sua sessão, nessa ordem. Quando dois discordam, o mais específico vence: as diretrizes de uma sessão valem mais que as do projeto, e as do projeto valem mais que as de todas as sessões. (O (i) ao lado de **Para uma sessão** em Configurações diz o mesmo.)

## Escrever diretrizes para todas as sessões

1. Abra [Configurações → Agentes → Diretrizes dos agentes](/settings?s=guidelines).
2. Em **Para todas as sessões**, escreva o que todo agente deve saber sobre você e sobre como você trabalha.
3. Clique em **Salvar**.

Abaixo da caixa, **Começar de…** oferece algumas formas prontas de os agentes falarem com você (**Linguagem simples, respostas curtas, explique o jargão**, **Acolhedor e encorajador: sou novo nisso**, **Breve e técnico**). Escolher uma delas a adiciona como uma linha ("Como falar comigo: …"), que você pode alterar antes de salvar. **Salvar** fica apagado até você mudar algo; **Desfazer alterações** restaura o que estava salvo.

Cada nível comporta até 20.000 caracteres. Mantenha o texto curto sempre que puder: toda sessão lê tudo, e poucas linhas claras funcionam melhor que páginas.

## Dar diretrizes a um projeto

Todo projeto tem diretrizes próprias, para o trabalho que você mantém nele: para quem é, o estilo de escrita, as regras do projeto.

1. Na barra lateral de sessões, clique no nome do projeto (abre **Detalhes do projeto**) e abra a aba **Configurações**.
2. Escreva no campo **Diretrizes dos agentes: o que todo agente nele segue**.
3. Salve o projeto.

Você também pode escrevê-las ao criar um projeto: na janela **Novo projeto**, clique em **Mais opções** e escreva em **Diretrizes dos agentes**. **Configurações → Agentes → Diretrizes dos agentes → Para um projeto** lista todos os projetos que têm diretrizes, com a primeira linha de cada um (**Mostrar tudo** quando há muitos); clique em um para abrir esse projeto.

Em um grupo (um projeto que reúne vários projetos), suas sessões seguem as diretrizes do próprio grupo e leem o que cada projeto do grupo pede como parte do trabalho com esse projeto.

## Diretrizes para uma sessão

### Antes de ela começar

1. Na página inicial, abra **Opções** (ao lado da caixa de mensagem).
2. Clique em **Diretrizes**. Uma janela abre em **Esta sessão**.
3. Escreva o que só esta sessão deve seguir e clique em **Salvar**. O chip de Opções passa a mostrar **Para esta sessão**.

A mesma janela mostra as diretrizes do projeto (quando você escolheu um projeto) e as de todas as sessões, cada uma em sua aba, para você ver tudo o que o agente vai seguir e alterar essas também. Um ponto em uma aba indica que aquele nível tem algum texto.

### Em uma sessão em andamento

1. Abra o menu da sessão (⋯) → **Configurações da sessão → Diretrizes**.
2. Altere **Esta sessão** (ou as do projeto, ou as de todas as sessões) e clique em **Salvar**.

A mudança vale a partir da sua próxima mensagem. O Claude Code e o Codex leem suas instruções quando começam, então, quando você envia a próxima mensagem, o app reinicia o agente discretamente com as novas diretrizes; a conversa continua de onde estava. Isso espera enquanto o agente está no meio de um turno, trabalha em direção a um objetivo ou tem trabalho rodando em segundo plano: acontece quando ele fica ocioso. O Custom as lê antes de cada turno de qualquer forma. Os outros agentes (Gemini CLI, OpenCode e os demais) pegam as diretrizes alteradas a partir da próxima sessão.

## O que torna boas as diretrizes

- **Diga o que você quer, com clareza**: "Pergunte antes de instalar qualquer coisa" é mais claro que "tenha cuidado".
- **Coloque aqui o que é duradouro e a tarefa na mensagem**: as diretrizes servem para o que vale sempre.
- **Use o nível certo**: como você gosta de ser tratado vai nas de todas as sessões; as regras de um projeto, no projeto; uma restrição pontual, na sessão.
- **Mantenha-as atualizadas**: quando um agente insiste em fazer algo que você não quer, adicione uma linha.

Alguns exemplos:

- Para todas as sessões: "Responda em linguagem simples. Explique o jargão na primeira vez. Pergunte antes de excluir arquivos ou de enviar qualquer coisa para fora deste computador."
- Para um projeto "Tese": "Cite no estilo ABNT. A tese é sobre pecuária leiteira na Grécia. Guarde os rascunhos na pasta rascunhos."
- Para uma sessão: "Use apenas a biblioteca padrão do Python."

## Como os agentes falam com você

A configuração que antes se chamava **Como os agentes falam com você** (em Configurações → Recursos → Assistentes, agora Seus agentes) agora faz parte das diretrizes para todas as sessões: o que você tinha escrito lá foi movido para elas, como uma linha que começa com "Como falar comigo:". Altere ou remova a linha ali.

## CLAUDE.md e AGENTS.md

O Claude Code e o Codex também leem arquivos de instruções próprios: CLAUDE.md (Claude Code) e AGENTS.md (Codex), na sua pasta pessoal para todas as sessões e na pasta de um projeto para as sessões que trabalham nele. Eles continuam funcionando como antes. Quem mantém esses arquivos em um repositório, para compartilhá-los com todos que trabalham nele, ainda pode editá-los aqui:

1. Abra [Configurações → Agentes → Diretrizes dos agentes](/settings?s=guidelines).
2. Abra **Arquivos de instruções** no último grupo, abaixo de **Para uma sessão** (a dica diz "CLAUDE.md e AGENTS.md na pasta de um projeto"; o (i) explica por que eles estão aqui).
3. Escolha a pasta, depois **Claude Code** ou **Codex**, e o arquivo a editar (ou **Criar** o arquivo).

A lista mostra todos os arquivos que o agente lê para uma sessão nessa pasta, na ordem em que ele os lê. Para a maioria das pessoas, as diretrizes são mais simples: funcionam para todos os agentes e não precisam de arquivos.

## Pergunte a um agente

- "Adicione às minhas diretrizes que você deve sempre responder em grego."
- "Quais diretrizes esta sessão segue?"
- "Dê ao meu projeto Tese a diretriz: citar no estilo ABNT."
- "Remova das minhas diretrizes a linha sobre a ortografia de Portugal."
- "Só nesta sessão, não use nenhuma biblioteca fora da biblioteca padrão."
