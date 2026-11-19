# Deixe os agentes usarem o app por você

Todo agente aqui conhece este guia e pode usar o app por você. Pergunte como algo funciona e ele responde com base no guia, com um link para o lugar certo. Peça para ele mudar uma configuração ou preparar algo (um projeto, um agente, uma tarefa agendada) e ele faz isso, depois que você confirmar em um cartão. Quando precisa de detalhes seus, ele mostra um formulário para você preencher.

![Um agente mudando uma configuração por você: o cartão mostra a mudança antes de ela ser feita](images/ask-agents.webp)

## Pergunte como fazer algo

Em qualquer sessão, com qualquer agente, pergunte sobre o app como você perguntaria a uma pessoa: "Como compartilho esta sessão com um colega?", "Onde ativo as notificações no meu celular?", "O que o modo Automático faz?". O agente procura a resposta neste guia, então ele descreve o app como ele é agora, e os links dele abrem o lugar citado.

Você também pode ler o guia por conta própria: **Ajuda** na barra de ícones, ou pesquise na caixa de busca (Ctrl+K, ⌘K no Mac), onde as seções dele aparecem em **Guia**. Na Ajuda, uma pergunta digitada na caixa no topo vai para um agente quando você pressiona Enter, e a resposta aparece ao lado do guia (veja [Obter ajuda](/guide/start#get-help)).

## Peça a um agente para mudar uma configuração ou preparar algo

Os agentes podem fazer no app o que você faria nas páginas dele. Alguns exemplos do que você pode pedir:

- "Ative a busca por significado."
- "Crie um projeto chamado Tese para a minha dissertação, com o agente Pesquisador."
- "Todo dia útil às 8h, me envie um resumo de notícias sobre energia renovável."
- "Adicione às minhas diretrizes que as respostas devem ser curtas."
- "Use o Brave Search antes do DuckDuckGo."
- "Exclua as notas de memória sobre o meu antigo emprego."
- "Quais apps eu tenho? Execute o planejador de viagens para um fim de semana prolongado em Lisboa."
- "Mude este dispositivo para o tema claro."
- "Use o Opus nesta sessão e pense com mais esforço." "Saia do modo Planejar e pode continuar."

O agente primeiro lê como as coisas estão agora e depois pede que você confirme a mudança em um cartão na conversa. Ler nunca pede confirmação: um agente sempre pode olhar suas configurações, projetos, tarefas e o resto para responder a você.

## Peça a um agente para fazer o que um editor faz

Os agentes mudam o que você guarda como você faria nos editores: eles escrevem slides, documentos, planilhas, documentos LaTeX, notebooks e diagramas, e fazem de uma vez o que um editor faz com o conteúdo inteiro em um clique:

- **Slides**: animar todos os slides (**Sutil**, **Animado** ou **Marcante**, ou tirar todas as animações), corrigir o que a **Verificar acessibilidade** encontra, descrever as imagens que estão sem descrição, deixar a apresentação compatível com o PowerPoint ou devolvê-la ao formato web, aplicar a ela um tema pronto ou um dos seus, deixar os slides em formato widescreen ou padrão, trazer slides de outra apresentação e atualizar os gráficos feitos a partir de uma planilha.
- **Documentos**: aceitar ou rejeitar as mudanças sugeridas, alterar a configuração da página e inserir cabeçalho, rodapé e números de página.
- **Planilhas**: ordenar uma tabela, remover as linhas duplicadas, preencher para baixo ou para a direita, limpar células, remover espaços extras, dividir palavras em colunas, resumir uma tabela em uma nova aba (como faz **Dados → Resumir por**), inserir ou remover linhas e colunas, e renomear, copiar, mover ou excluir abas; as fórmulas acompanham, como no editor.
- **Documentos LaTeX**: renomear ou mover arquivos, imagens e pastas, com as linhas que os citam acompanhando.
- **Notebooks**: limpar as saídas.
- **Diagramas**: reorganizar uma página (ou todas as páginas) como um fluxograma para baixo ou para o lado, uma árvore, um mapa mental, anéis, um círculo ou uma grade, e dar a todas as formas o mesmo visual, a todos os textos a mesma fonte, ou ao diagrama inteiro o aspecto de um desenho à mão.
- **Qualquer um deles**: uma cópia salva como novo item, ou outro tipo de item feito a partir dele (**Transformar em**).

Cada ação gera uma nova versão (a anterior continua entre as versões), o editor aberto nele mostra o resultado na hora, e suas próprias mudanças e comentários continuam lá. Elas são gratuitas e instantâneas, exceto descrever imagens, que é feito por um modelo. O agente ao lado de uma página ([Mude pedindo a um agente](/guide/library#change-it-by-asking-an-agent)) conhece todas elas e sabe exatamente o que você selecionou. Por exemplo:

- "Anime todos os slides do meu 'Plano de lançamento', no estilo animado, e corrija o que a verificação de acessibilidade encontrar."
- "Deixe os slides do meu 'Plano de lançamento' compatíveis com o PowerPoint."
- "Aceite as sugestões da Maria no documento 'Orçamento' e rejeite o resto."
- "Na minha planilha 'Vendas', ordene a tabela por receita, da maior para a menor, e remova as linhas duplicadas."
- "Na minha tese em LaTeX, mova as imagens de figures/ para img/."
- "Reorganize o meu diagrama 'Fluxo de pagamento' da esquerda para a direita e deixe todas as formas azuis."

## O cartão: confirmando uma mudança

Antes de um agente mudar qualquer coisa, um cartão aparece na conversa (e na sua [Caixa de entrada](/inbox), com uma notificação se você estiver ausente). Ele informa:

- **Qual é a mudança**, nas palavras do agente: "Criar o projeto “Tese”".
- **O que muda**, campo por campo: uma configuração como ela está agora e como ficará ("**Resultados**: 10 → 20"), ou com o que algo novo será criado.
- **A chamada em si**, em letras pequenas (por exemplo `PUT /api/search/settings`), para você ver exatamente o que vai acontecer, seja qual for a explicação do agente.

Depois você escolhe:

- **Permitir** faz a mudança.
- **Permitir nesta sessão** faz a mudança e deixa esta sessão fazer outras mudanças do mesmo tipo comum sem perguntar de novo. As mudanças que perguntam sempre (veja abaixo) continuam perguntando.
- **Não** (ou **Recusar**) não muda nada. Você pode dizer por quê, ou o que fazer em vez disso, e o agente lê.

Algumas mudanças perguntam sempre, mesmo depois de **Permitir nesta sessão**: excluir qualquer coisa, começar uma sessão ou a execução de uma tarefa agendada, enviar uma mensagem para outra sessão, adicionar um servidor MCP, adicionar, ativar ou alterar um plugin, alterar o que os agentes podem fazer no Custom ou no Navegador, adicionar uma máquina ou uma conta, baixar um modelo, configurar as ferramentas de imagem neste computador, atualizar o app. Em uma exclusão, o botão diz **Excluir**.

Um cartão espera cerca de nove minutos. Se você não responder até lá, ele some e o agente pergunta a você na resposta dele.

## Quando um agente precisa de detalhes: formulários

Quando um agente precisa de várias informações suas, ele pode mostrar um formulário na conversa em vez de uma lista de perguntas: as datas e o orçamento de uma viagem, o nome e os campos de um novo app. Preencha e clique no botão (**Enviar**, ou o nome que o agente deu a ele); **Agora não** fecha o formulário, e o agente continua sem ele ou pergunta com palavras.

Um formulário espera o tempo que você precisar. Se você não responder em cerca de nove minutos, o agente encerra a vez dele ali e o formulário continua na conversa, mesmo que o agente pare ou o app reinicie. Quando você o preenche, suas respostas vão para o agente como sua próxima mensagem ("Minhas respostas a …"), e ele continua a partir daí; se elas não chegarem até ele, o formulário continua lá para você enviar de novo. Um formulário mais alto que a tela abre pelo início, com **Mais recente** para ir até o fim.

Um cartão de mudança também pode trazer um formulário: "Criar um projeto" pode mostrar o nome, a descrição e as diretrizes que o agente imaginou, para você corrigir antes de clicar em **Salvar**.

## O que os agentes não podem fazer no app

Algumas coisas continuam sendo suas. Um agente que tenta é informado de onde você faz isso:

- sua senha e entrar e sair da conta ([Configurações → Senha](/settings?s=security), [Contas](/settings?s=accounts));
- os valores de chaves e logins: um agente pede por eles com um cartão em que você os digita no Cofre, e nunca os vê ([Apps conectados, chaves e ferramentas](/guide/connections)); a chave do OpenRouter tem um cartão próprio, que a coloca direto em Configurações → Modelos ([Quando um agente precisa da chave do OpenRouter](/guide/documents-voice#when-an-agent-needs-the-openrouter-key));
- criar tokens de acesso para outras máquinas ou agentes, e as chaves de API de um app;
- responder a cartões de aprovação, do próprio agente ou de outra sessão, e decidir sobre cartões que pedem a sua decisão (uma habilidade proposta, uma tarefa agendada, uma publicação);
- arquivos, comandos, terminais e git pelo app: os agentes usam as próprias ferramentas para isso, que perguntam a você conforme as permissões da sessão;
- as ferramentas de IA dos próprios editores e os editores de imagem e de vídeo: os agentes criam, encontram, alteram e editam imagens, desenhos, gráficos e vídeos com ferramentas próprias, que salvam o que fazem na pasta da sessão ([Documentos, imagens, vídeos e voz](/guide/documents-voice)), e narram slides com uma locução das notas de cada slide.

## Permissões e os cartões

O que as permissões de uma sessão permitem decide quanto os cartões perguntam:

- **Planejar** (e **Somente leitura** do Codex): o agente pode ler as configurações do app e responder a perguntas, mas não muda nada. Ele diz o que mudaria. Uma exceção: as configurações da própria sessão dele. Peça a ele para sair do modo Planejar, usar outro modelo ou pensar com mais esforço, e ele pergunta a você em um cartão.
- **Perguntar**, **Aceitar edições**, **Automático** e similares: as mudanças pedem confirmação em um cartão, como descrito acima.
- **Ignorar** (Claude Code) e **Acesso total** (Codex): sem cartões; o agente faz as mudanças que você pede. Um formulário ainda aparece quando o agente precisa de detalhes.
- **Acesso total** do Custom: sem cartões de aprovação, inclusive para mudanças que normalmente perguntam sempre. Um formulário ainda aparece quando são necessários detalhes.

Quaisquer que sejam as permissões, uma mudança nas permissões de uma sessão ou no limite de gastos dela pergunta a você em um cartão todas as vezes, sem **Permitir nesta sessão**: "Mudar esta sessão para Ignorar", "Aumentar o limite para US$ 20". Você pode pedir isso tanto no app quanto no terminal; o terminal mostra o mesmo cartão, e **y** ou **n** responde a ele.

## Configurações guardadas em cada dispositivo

Algumas configurações pertencem a cada dispositivo, e não ao app: o tema, o idioma, o som de notificação, o que a tecla Enter faz enquanto um agente trabalha, as sugestões do terminal e se a barra lateral aparece. Um agente pode mudar essas configurações no dispositivo de onde você fala com ele (as páginas que mostram aquela sessão), sem cartão: "Mude para o tema escuro", "Use o tema Sage", "Mostre o app em grego". Seus outros dispositivos mantêm as próprias configurações.

## Pergunte a um agente

- "Como recebo notificações no meu celular?"
- "Crie um projeto para os meus projetos de jardinagem e dê a ele a diretriz: moramos em um clima frio."
- "Desative as capturas de tela do Navegador."
- "Mostre quais tarefas agendadas eu tenho e desative a de acompanhar preços."
- "Mude este dispositivo para o tema claro."
- "Mude esta sessão para o Sonnet com esforço baixo."
