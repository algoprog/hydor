# 终端里的 Hydor

`hydor` 命令在终端里完成你在应用页面上做的事：与智能体对话并实时跟进它的工作、批准它的请求并回答它的问题、在脚本里发出一次请求并取回答案，并管理应用保存的一切：你的会话、项目、智能体、记忆、技能、插件、密钥、定时任务、用量和每一项设置。只有页面才能做的事（画一个签名、幻灯片和图表编辑器），命令会给你该页面的地址。它和应用用的是同一个 Hydor，所以在终端里开始的会话会显示在应用里，在应用里开始的会话也能在终端里继续。你的 shell 会在你输入时为它补全。

![hydor 命令：它的欢迎框，以及输入斜杠时打开的菜单](images/terminal.webp)

## 获取这个命令

- **用安装程序安装**（`./install.sh`）：当 `~/.local/bin` 在你的 PATH 中时，安装程序会把 `hydor` 链接到那里，并告诉你。否则它会告诉你命令在哪里：Hydor 文件夹里的 `bin/hydor.mjs`，你可以直接运行它，也可以把它链接到你存放命令的地方。
- **用 Docker**：镜像里已经有它。运行 `docker exec -it hydor hydor`，就可以在容器内与智能体对话。
- **Mac 应用**每次启动时都会自己把它放进你的 PATH。它把 `hydor` 链接到 `~/.local/bin`、`~/bin`、`/usr/local/bin` 或 `/opt/homebrew/bin` 中第一个既在你的 PATH 里、又是你有权写入的文件夹。如果没有这样的文件夹，它就用 `~/.local/bin`，并在你的 shell 启动文件（zsh 是 `~/.zprofile`）里加上一行标明由 Hydor 添加的内容，让这个文件夹进入你的 PATH。之后请打开一个新的“终端”窗口。这个命令运行的是应用自带的 Node.js，应用关闭时，`hydor` 会把它打开。从磁盘映像里打开时，或在你把应用移到**应用程序**文件夹之前，它不会做这件事。在应用里，`hydor update`、`hydor service install` 和 `hydor serve` 只会告诉你这些由应用自己完成。
- **Windows 和 Linux 桌面应用**暂时还不会把这个命令放进你的 PATH。在 Linux 上，安装程序仍像上面那样链接它。如果你在另一台电脑上有一份 Hydor，仍然可以使用那一份的：参见[使用另一台电脑上的 Hydor](#use-another-computers-hydor)。

`hydor help` 会按组列出它能做的一切，每个命令一行；`hydor help <命令>` 给出一个命令的用法、选项和示例，`hydor help options` 列出所有选项，`hydor help <命令> <动词>` 给出某个动词的。维护命令用的是同一个名称：`hydor service status`、`hydor setup-token`、`hydor update` 等等（`node dist/server/cli.js …` 也仍然可用）。输错了命令、选项或动词，它会问“Did you mean …?”（你是想输入……吗？）。错误以红色显示。

以某个命令的名字开头的消息要放在引号里（`hydor "find the bug in login"`），或者放在 `hydor chat` 后面，这样它就不会被当成命令。

你不必先启动 Hydor。当这台电脑上没有任何响应时，命令会在后台启动它，显示 **Starting Hydor…**（正在启动 Hydor…），并在命令结束后让它继续运行，所以你的会话不会中断。`hydor status` 会告诉你它用的是哪个 Hydor、它的版本、它是否作为服务运行，以及现在有什么在工作。

## 在 shell 里用 Tab 补全

只需打开一次：

```bash
hydor completion install
```

它会为你用的 shell（bash、zsh 或 fish）设置好：把脚本写到 shell 会去找的地方，对于 zsh 和没有 bash-completion 的 bash，还会在你的 `.zshrc` 或 `.bashrc` 里加上一行。之后请打开一个新的终端。再运行一次不会重复做任何事。`hydor completion bash`（或 `zsh`、`fish`）会改为把脚本打印出来，供你放到想放的地方：`source <(hydor completion bash)`。

此后按 Tab 就会补全你输入的内容：命令、它们的动词和选项，以及它们所接受的对象。在 `hydor show ` 或 `hydor send ` 之后，它会列出你各个会话的键，并带上各自的标题；在 `--model` 之后列出模型，在 `--as` 之后列出你的智能体，在 `--cwd` 之后列出文件夹；项目、技能、插件、设置、指南主题等也一样，都取自这个 Hydor 当前的内容。如果 Hydor 没有很快响应，补全就只给出不依赖它的内容，绝不会拖住你的 shell。

## 与智能体对话

在一个文件夹里运行 `hydor`，或者在 `hydor` 后面跟上你的消息（`hydor fix the failing test`）。第一条消息会在该文件夹里开始一个会话。

聊天以一个欢迎框开头：**HYDΩR** 和它的版本、文件夹及其 git 分支，以及由谁来回答你：程序（**Claude Code**、**Codex** 或 **Custom**）、模型（在有档位的 Hydor 上，如果模型按任务来定，则显示为**自动**）以及权限模式。智能体不经询问就行动时，模式显示为红色；计划模式则用强调色。后面跟着一行提示：`/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`。

你看到的内容都留在终端自己的历史记录里，所以你可以向上滚动并从中复制，通过 SSH 和在 tmux 里也一样：

- **你的消息**，前面有一个 `›`。
- **智能体的文字**，随写随显示，包括标题、列表、引用、表格、链接（地址跟在文字后面）和代码（绝不会重新换行，所以复制出来的内容可以直接运行）。
- **每一步**占一行：它读了什么、搜索了什么、编辑了什么（附带增加和删除的行数）、运行了什么（附带所用时间；失败时还有退出码，错误的第一行显示在它下面）。
- **思考**显示为暗淡的一行，例如“Thought for 8 s”（思考了 8 秒）。用 `--thinking` 启动可以看到完整的思考内容，用 `-v` 可以看到每一步输出的前几行。
- **子智能体**：当智能体把一部分工作交给 [Hydor 子智能体](/guide/research#let-an-agent-hand-work-to-subagents)时，会显示“Subagent started”（子智能体已启动）；它的回复回来时，会显示“Subagent finished”（子智能体已完成；或“Subagent failed”，已失败）。Claude Code 还可以在后台运行它自己的子智能体，并在它们工作时结束这一轮：底部几行会说明哪些子智能体正在后台工作，每个子智能体结束时会显示“Finished in the background”（已在后台完成），智能体则自行继续。它留在后台运行的命令（例如开发服务器）不会拖住任何东西。`/subagents` 会列出所有子智能体，以及每个子智能体正在做什么（和一个子智能体花了多少钱）。
- **每一轮的结尾**：用了多长时间、花了多少钱、用的是哪个模型，以及有多少个子智能体参与了工作（“1 subagent”“3 subagents”）。

在底部，智能体工作时有几行会不断变化：正在写的文字、正在进行的步骤、正在工作的子智能体、带有已用时间的彩色旋转指示符（“Working”上有一道闪光掠过），以及你的输入行。按 Esc 或 Ctrl+C 可以停止这一轮。

### 输入行

你的输入位于两条细线之间，下面有一行状态栏：文件夹及其分支、模型和模式，以及到目前为止的费用，右侧是 `/help`。

- 你输入的内容后面会显示取自你之前消息的**灰色建议**。按 **→** 接受它，按 **Alt+→** 接受其中一个词。**设置 → 应用 → 通用 → 终端建议**可以把它关掉或打开（[设置](/settings?s=general&find=Terminal%20suggestions)）。
- **Ctrl+R** 搜索你之前的消息：输入其中的几个词，用 **↑** 和 **↓** 移到某个匹配项，按 **Enter** 会把它放进输入行但不发送，这样你可以先修改。按 **Esc** 放弃。
- 一条消息可以有多行，粘贴的内容会整体进入。

### 补全菜单

你输入时，输入行下面会打开一个菜单，并随每次按键更新：

| 输入 | 菜单列出 |
| --- | --- |
| `/` | 各个命令及其作用：先是聊天自己的命令，然后是程序自己的命令（例如 Claude Code 的命令和技能）。 |
| `/model `、`/mode `、`/effort `、`/agent `、`/subagents `、`/open ` | 该命令的取值：模型、模式、思考强度、你的智能体、子智能体、在哪里打开。 |
| `@` 加几个字母 | 会话文件夹里的文件，宽松匹配：`@clits` 能找到 `src/cli.ts`。以 `/` 结尾就浏览那个文件夹。 |

**↑** 和 **↓** 移动，**Tab** 补全高亮的一行，**Enter** 补全并运行它（需要取值的命令会改为打开该命令的取值）。**Esc** 关闭菜单。匹配是宽松的，命令里的字母不必相邻：`mdl` 能找到 `/model`。

### 选择器

不带取值输入 `/sessions`、`/resume`、`/model`、`/effort`、`/mode` 和 `/agent`，会打开一个选择器：一个有一行高亮的列表。**↑** 和 **↓** 移动，输入文字缩小范围，**Enter** 选定，**Esc** 离开。列表不超过九行时，按数字仍然可以直接选。`hydor resume` 不带键时打开的就是你的会话的同一个选择器。

### 用 `!` 运行 shell 命令

以 `!` 开头的一行，其余部分会作为 shell 命令在会话的文件夹里运行：`!git status`、`!npm test`。运行期间聊天会把终端交给它，所以交互式程序也能用（`!vim notes.md`、`!htop`），结束后再拿回来。这一行以 `!` 开头时，提示符会变成黄色。智能体看不到这条命令，也看不到它打印的内容；想让它看到，就在消息里说。它只在这台电脑上的 Hydor 里有效。

### 回答智能体的询问

当智能体需要你批准时，请求会连同它的内容一起显示（命令、对文件的修改、计划），选项列在下面：

- 按 **y** 选第一个允许它的选项，按 **n** 拒绝，或者按任一选项的**数字**（例如“Always allow”，即始终允许）。
- 要拒绝并告诉智能体改做什么，输入你的话然后按 Enter。

问题的选项带有编号：按数字选一个（对于可多选的问题，选几个，然后按 Enter），或者输入你自己的答案并按 Enter。按 Esc 跳过。表单会逐个询问它的字段：输入每个答案并按 Enter，或者直接按 Enter 保留它显示的内容。要提供文件，就输入它在这台电脑上的路径。

有些请求需要用到应用：比如与签名有关的，或者你某个应用所需的密钥。终端会这样说明，并给出该会话在应用中的地址。

### 智能体工作时

你的输入行始终归你使用。智能体工作时你发送的消息，按 Enter 后怎么处理，由[设置 → 应用 → 通用](/settings?s=general&find=Sending%20while%20an%20agent%20works)里的**智能体工作时发送**决定：**加入本轮**（默认，和应用里一样）把它放进正在运行的这一轮，**等它结束**则让它排队，在这一轮结束时发出（显示为 **queued**，即已排队）。无论怎么设置，有两条命令可以只为一条消息另作决定：

- `/queue <消息>` 总是等这一轮结束。
- `/now <消息>` 总是加入正在运行的这一轮。

**智能体工作时发送**和**终端建议**这两项属于设备的设置，在终端里是聊天自己的：用 `hydor settings set general.sending-while-an-agent-works queue` 来设置，或者请智能体来改（见[设置](#settings)），聊天会立刻跟着变。

### 按键

- **Enter** 发送。**Alt+Enter**、**Ctrl+J**，或者在行尾加一个 `\` 再按 Enter，可以换行。粘贴的内容会连同换行一起整体进入。
- **↑** 和 **↓** 在你之前的消息中翻查（保留最近 500 条）；在有多行的消息里，它们先在各行之间移动。菜单打开时，它们在菜单里移动。
- **←**、**→**、**Home**、**End**、**Ctrl+A** 和 **Ctrl+E** 移动光标；**Alt+←** 和 **Alt+→** 一次移动一个词；**Ctrl+W** 删除光标前的一个词，**Ctrl+U** 和 **Ctrl+K** 分别删除光标之前和之后的其余部分。
- **Tab** 打开菜单，并接受高亮的一行。**Ctrl+R** 搜索之前的消息。
- **Esc** 关闭菜单，或停止这一轮。**Ctrl+C** 在有一轮正在运行时停止这一轮，有文字时清空这一行，否则连按两次就退出。**Ctrl+D** 在空行上退出。**Ctrl+L** 清屏。**Ctrl+Z** 挂起聊天（用 `fg` 恢复）。

在聊天里，`/keys` 会列出这些按键。你退出时，会话会继续：终端会告诉你怎样回到它。

### 命令

在输入行中输入（输入 `/` 会列出它们）：

- `/help`：命令、按键，以及其他几样东西（`@`、`!`），分成几部分：**Commands**（命令）、**Keys**（按键）、**Also**（其他）。`/keys` 只列出按键。
- `/new`（再加一条消息）：在同一个文件夹里开始一个新会话。
- `/sessions`（或 `/resume`）：选另一个会话继续。
- `/model`、`/effort`、`/mode`：更改模型、思考的深入程度，以及不用询问就可以做哪些事。不带名称时，每个都会打开一个选择器。
- `/agent`：从下一条消息起，以[你的某个智能体](/guide/agents)的身份工作。
- `/subagents`：所有子智能体（包括后台的）、每个子智能体正在做什么（以及一个子智能体花了多少钱）；`/subagents 2` 显示第二个子智能体的对话。
- `/tiers`、`/usage`、`/cost`：每个档位对应哪个模型、你的套餐的用量和限额，以及这个会话和它的子智能体花了多少钱。
- `/copy`：把智能体的最后一条回复复制到剪贴板，通过 SSH 和在 tmux 里也可以。`/clear` 清屏。
- `/queue` 和 `/now`：发送一条消息，让它排队或让它加入，按你所选的方式（[智能体工作时](#while-it-works)）。
- `/stop`、`/rename`、`/open`、`/quit`：停止这一轮和后台的子智能体、给会话重命名、显示它在应用中的地址、退出。
- `/hydor <命令>`：在聊天里运行后面几节中的任何命令（[在聊天里](#inside-the-chat)）。

其他任何 `/命令` 都会原样交给智能体，用于该程序自己的命令和技能。

终端支持真彩色时就用真彩色。`NO_COLOR` 和 `--no-color` 会把颜色关掉，管道也会。

## 继续一个会话

- `hydor -c` 继续你所在文件夹里最近的一个会话。
- `hydor resume` 打开一个你最近的会话的选择器；`hydor resume 6f1e2a3b` 继续指定的那个。

最近的几轮会先显示出来，每一轮的工作折叠成一行（“Ran 3 commands, read 4 files”，即运行了 3 条命令，读了 4 个文件）；`hydor show` 会打印全部内容。

## 选择会话如何开始

这些选项可以和 `hydor`、`hydor run` 和 `hydor resume` 一起使用：

- `--agent claude`、`codex`、`custom`，或者[另一个智能体程序](/guide/agents-models)的名称：由哪个程序来回答。
- `--model`（模型的名称，或者用 `auto` 表示自动）、`--effort`，以及 `--mode ask`、`edits`、`plan` 或 `full`（也可以用该程序自己的模式名称）。
- `--as Researcher`：以[你的某个智能体](/guide/agents)的身份开始。
- `--cwd`（一个文件夹；省略时是你当前所在的文件夹）、`--worktree`（有自己的分支和文件夹）、`--cap 2`（最多花 $2）、`--no-memory`、`--title`。

你省略的部分，取自应用开始页上最近一次的选择，再取自应用的默认值。

## 在脚本里发出一次请求

`hydor run "…"`（或 `hydor -p "…"`）用你的消息开始一个会话，一直跟进到工作完成，打印智能体的最后一条回复，然后结束。完成的意思是：这一轮结束了，没有任何子智能体还在工作或还欠着回复（包括 Claude Code 在后台的子智能体，无论是智能体的还是子智能体的子智能体），队列里也没有在等待的内容：结束一轮来等候子智能体的智能体，会被子智能体的回复或结束唤醒，而这次运行也会等候那一轮。留在后台运行的命令（例如开发服务器）不会拖住它。遇到 `--timeout` 或 Ctrl+C 时，后台的子智能体会随这一轮一起停止。后面不带任何内容时，它会从管道输入的内容读取消息：`git diff | hydor run "review this change"`。

- 在终端里，旁边的短行会说明发生了什么（每一步、子智能体的启动和完成）；`-q` 把它们关掉。
- 没有人可以回答，所以批准请求或问题会让这次运行停下，并说明被问了什么，会话则在应用里或通过 `hydor resume` 等你。使用 `--mode full`（或 `-y`）时，智能体什么都不会问。
- `--json` 在结束时打印一个对象：`key`、`url`、`status`、`reply`、`model`、`costUsd`（含它的子智能体的）、`tokens`、`durationMs`、`turns`、`children`（每个 Hydor 子智能体的 `title`、`label`、`tier`、`costUsd`、`status`），失败时还有 `error`。`--stream-json` 在每次变化发生时各打印一行（`item`、`live`、`note`），最后一行是上面那个对象。
- `--timeout 300` 在 300 秒后停止这一轮。

它结束时带有一个脚本可以检查的退出码：

| 退出码 | 发生了什么 |
| --- | --- |
| 0 | 完成 |
| 1 | 会话失败（出错，或者套餐的用量限额，它会指明），或者 Hydor 拒绝了 |
| 2 | 命令用法不对 |
| 3 | 需要你给出答案 |
| 124 | 用时超过了 `--timeout` |
| 130 | 你按了 Ctrl+C（先停止了这一轮） |

## 应用能做的一切，都能在终端里做

应用的每个部分都有一个自己的命令，它的动词对应该部分页面所做的事。省略动词就是列出：`hydor projects` 就是 `hydor projects list`。`hydor help` 按下面的方式分组显示它们，Tab 会补全动词、选项和它们所接受的对象。

它们共同的做法：

- **指代事物**：凡是命令接受某一样东西（一个会话、一个项目、一个智能体、一个技能……），都可以给它的 id 或 id 的开头，或者它的名称或标题（不分大小写，只要唯一）。有两个或更多匹配时，它会列出最多五个。在终端里省略名称，命令会给出一个列表供你选择。
- **更改事物**：字段是选项（`--description`、`--name`）。较长的文字来自 `--file <路径>`，来自用 `-` 表示的管道输入，或者在终端里两者都没有时，来自打开在当前文字上的编辑器（`$VISUAL`、`$EDITOR`）：保存时没有改动就什么也不会变。
- **删除事物**会问 `Remove “name”? [y/N]`（删除“name”？）。`-y`（或 `--yes`）表示回答是。没有终端又没有 `-y` 时，它会拒绝，而不是去猜。
- **`--json`** 按应用的 API 给出的原样打印内容，供脚本使用。
- **退出码**：完成时为 0，Hydor 拒绝或失败时为 1（它会说明原因），命令用法不对时为 2（它会说明该输入什么）。
- **另一台电脑上的 Hydor**：每个命令都可以与 `--server` 和 `--token` 一起使用。
- **只有页面才能做的事**：命令会这样说明，并给出该页面的地址。`hydor open … --browser` 会把它打开。

### 会话

| 命令 | 作用 |
| --- | --- |
| `hydor sessions` | 你最近的会话，每个前面有一个标记：● 工作中、● 需要你处理、✓ 已完成、✗ 出错。它的动词做的是会话菜单所做的事：`search`、`rename`、`archive` 和 `unarchive`、`pin` 和 `unpin`、`read`、`snooze`、`move`（移到某个项目）、`fork`、`goal`、`share`（只读链接）、`changes`（它修改过的文件）、`commands`（它运行过的命令）、`queue`（正在等待的消息，以及 `queue clear` 和 `queue remove`）、`show`、`send`、`stop` 和 `delete`。 |
| `hydor inbox` | 等你处理的事（批准、问题、智能体要的密钥、待审的技能）：`list`，以及 `show` 查看其中一项和在哪里回答它。 |

`hydor show 6f1e2a3b` 与 `hydor sessions show 6f1e2a3b` 相同，`send` 和 `stop` 也是：短的那些仍然保留。

```bash
hydor sessions search login          # sessions about login
hydor sessions rename 6f1e "Fix the login bug"
hydor sessions fork 6f1e "try it with a cache instead"
hydor inbox
```

### 你的工作

| 命令 | 作用 |
| --- | --- |
| `hydor projects` | `list`、`show`、`new`、`rename`、`edit`（描述、准则、它以哪个智能体开始、文件夹）、`sessions`、`files`（它读取的文档：`files add` 和 `files remove`）和 `remove`。 |
| `hydor tasks` | 你的[定时任务](/guide/tasks)，以及其他自己启动的工作：`list`、`show`、`new`（何时运行：`--every 2h`、`--at 09:00 --days weekdays`、`--cron`、`--once`；或者 `--webhook`、`--watch-feed`、`--watch-page`、`--watch-folder`）、`edit`、`pause`、`resume`、`run`（立即运行，暂停时也可以）、`runs`（最近的几次运行，`--reply` 显示最后一次的回复）和 `remove`。监视某条命令或某个 JSON 地址要在页面上做。 |
| `hydor apps` | 你的[应用](/guide/apps)和现成的应用：`list`、`show`、`run`（表单的答案写成 `字段=值`，或者用 `--input` 给出 JSON；它会打印答案和花费）、`runs`、`run-show`（查看某一次运行）和 `remove`。`hydor app …`（不带 s）用来把应用做成文件：`new`、`folder`、`dev`、`try`、`export`、`import`。 |
| `hydor library` | [资料库](/guide/library)：`list`（`--kind`、`--project`）、`search`、`show`（文档的文字，或者这一项是什么）、`export`（`--to pdf`、`docx`、`pptx`……，`-o 文件`）、`open`（它的编辑器的地址）和 `remove`。 |
| `hydor experiments` | 训练和评估运行：`list`、`show` 和 `stop`。开始一次运行是智能体和页面的事。 |

```bash
hydor projects new Thesis
hydor projects edit thesis --file guidelines.md
hydor tasks new --at 09:00 --days weekdays "Summarise my unread email"
hydor apps run trip-planner destination=Lisbon days=5
hydor library export "Q3 report" --to pdf -o q3.pdf
```

### 智能体和模型

| 命令 | 作用 |
| --- | --- |
| `hydor models` 和 `hydor tiers` | 每个程序提供的模型，以及每个[档位](/guide/agents-models#tiers-a-model-for-each-kind-of-job)对应哪个模型（`hydor tiers set claude best opus --effort high`、`hydor tiers reset`；`hydor tiers team off` 和 `hydor tiers hard off` 分别关闭**主智能体带领子智能体**和**难题用最高档位**，`on` 再把它们打开）。 |
| `hydor usage` | 每个套餐的用量和限额，以及它们何时重置。 |
| `hydor agents` | [你的智能体](/guide/agents)：`list`、`show`、`new`、`edit` 和 `remove`（内置的可以复制，不能更改）。智能体的输出字段和结果去向在它自己的页面上设置（`hydor open agents`）。 |
| `hydor accounts` | Claude Code 和 Codex 的登录：`list`、`add <程序> <名称>`（再添加一个账户，并立即登录）、`sign-in`、`sign-out`、`remove` 和 `use`（新会话用哪一个开始）。用于 API 额度的 API 密钥和用量限额时的开关是设置（`accounts.*`）。 |

```bash
hydor agents new Bookkeeper --tools read,edit --tier standard
hydor tiers set claude best opus --effort high
hydor accounts add claude Work
hydor accounts use work
```

### 智能体知道的和用到的

| 命令 | 作用 |
| --- | --- |
| `hydor memory` | 智能体对你的记忆：`list`、`search`、`show`、`add`、`edit`、`forget`（30 天内可恢复）和 `restore`，以及用于每个智能体最先读到的内容的 `profile` 和 `profile edit`。`--scope`、`--project` 和 `--session` 指明是谁的笔记。 |
| `hydor guidelines` | `show` 和 `edit` 每个智能体都遵循的准则：对每个会话（默认）、对某个项目（`--project`）或对某一个会话（`--session`）。 |
| `hydor skills` | 智能体用的技能：`list`、`show`、`on`、`off`、`add`（来自一个 `SKILL.md` 或一个文件夹）和 `remove`。`--agent claude` 或 `--agent codex` 用于这些程序自己的技能。 |
| `hydor plugins` | 带有技能和工具的附加组件：`list`、`show`、`on`、`off`、`add`（内置的、Git 地址、.zip 或文件夹）和 `remove`。制作你自己的插件在它的页面上（`hydor open plugins`）。 |
| `hydor mcp` | Claude Code 和 Codex 的工具服务器（MCP）：`list`、`status`（启动每一个并说明哪些在工作）、`add`、`edit` 和 `remove`。 |
| `hydor connections` | [已连接的应用](/guide/connections)（Notion、GitHub、Gmail……）：`list`、`show`、`services`（可以连接什么）、`connect <服务>`（隐藏地输入密钥，或者在浏览器里登录，命令会等你完成）和 `disconnect`。连接的哪些工具开着，要在它的页面上设置。 |
| `hydor keys` | [保险库](/guide/connections)：`list` 你的密钥的名称和每个密钥可以发往哪里，`set <NAME>` 和 `remove <NAME>`。值是在你输入时隐藏地询问的，或者从管道输入读取；它绝不会作为选项输入（你的 shell 会把它记下来），也绝不会被打印出来。 |

```bash
hydor memory add I prefer short answers
hydor memory forget 42
hydor skills off research
hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp
hydor keys set GITHUB_TOKEN --domain github.com
hydor guidelines edit --project thesis
hydor connections connect notion --browser
```

### 设置

`hydor settings` 可以访问[设置](/settings)的每一个选项，分布在它的三个标签页（**应用**、**智能体**、**功能**）及其各个分区里。每个选项都有一个 id，例如 `general.resume-after-usage-limits`：先是它的分区，然后是它的词。你可以用这个 id 指代一个选项，也可以用它的分区加上它的词的开头（`general.resume`），或者在只有一个匹配时只用它的词；Tab 会补全它们。

在终端里，单独的 `hydor settings` 会打开一个浏览器：先选一个分区，再选一个选项。**↑** 和 **↓** 以及输入文字用来查找，**Enter** 打开一个分区或更改一个选项（开关会翻转，选择会列出它的取值，数字或文字由你输入，按钮会先询问），**Esc** 返回。通过管道时，它会列出每一个选项。用于脚本和快速更改：

| 命令 | 作用 |
| --- | --- |
| `hydor settings list [分区]` | 每个选项及其值，或者只列一个分区的。 |
| `hydor settings get <选项>` | 一个选项的值，以及它接受什么。 |
| `hydor settings set <选项> <值>` | 更改它：开关接受 `on` 或 `off`，选择接受它的某个取值，数字接受整数，列表接受用逗号分隔的各项（`none` 表示清空）。密钥或令牌是隐藏地询问的，或者从管道输入读取。较长的文字来自 `--file` 或你的编辑器。 |
| `hydor settings run <选项>` | 按下页面的一个按钮（**发送测试**、**立即检查**……），当它要删除或下载什么东西时会先询问。 |
| `hydor settings open [分区]` | 一个分区或一个选项在应用里的地址。 |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

应用在每个浏览器里各自保存的内容（主题、语言、通知声音）不能在这里更改：这样的选项会这样说明，并给出该页面的地址。只有页面才能更改的选项也一样。属于终端的两项设备设置，**智能体工作时发送**和**终端建议**，是聊天自己的，`hydor settings set` 可以更改它们。

### 查找、指南、打开和 api

- `hydor find rate limit` 搜索搜索框能搜到的一切（**Ctrl+K**）：页面、设置及其选项、会话、记忆、技能……`--in settings` 只在那里找，`--urls` 在每个结果下面显示它的地址，`--open 2` 在浏览器里打开第二个。
- `hydor guide` 列出指南的主题；`hydor guide projects` 在终端里读其中一个，`hydor guide projects "what a project is"` 读其中的一节。`--sections` 列出一个主题的各节。
- `hydor open` 打印应用的地址；`hydor open library`、`hydor open settings memory`、`hydor open project thesis`、`hydor open guide projects` 或 `hydor open 6f1e2a3b`（一个会话）打印相应页面的地址。`--browser` 也会在你的浏览器里打开它。只有页面才能做的事就这样到达：幻灯片、表格、图片和图表的编辑器、签名、主题的颜色、登录某个服务。
- `hydor api GET /api/projects` 调用应用 API 的任何接口并打印它的 JSON（`hydor api POST /api/projects -d '{"name":"Thesis"}'`；请求体可以来自 `@文件` 或 `-`）。这些接口在 [API 主题](/guide/api)里。

### 在聊天里

`/hydor <命令>` 无需离开对话就能运行上面的任何命令：`/hydor sessions`、`/hydor memory add I prefer short answers`、`/hydor settings get general.resume-after-usage-limits`。它的菜单在 `/hydor ` 之后列出各个命令，再列出它们的动词和所接受的对象。它打印的内容显示在输入行上方，它提出的问题（例如删除）会以选择器的形式出现，它需要的编辑器会拿到终端，和 `!` 一样。<!-- TODO-VERIFY: the exact behaviour of /hydor -->

## 管理这个 Hydor

- `hydor status` 会说明 Hydor 是否在运行、它的版本和地址、它的数据在哪里、它是否是服务，以及哪些会话在工作或需要你处理（用的标记和 `hydor sessions` 相同）。
- `hydor serve` 在这里于前台运行 Hydor，直到按 Ctrl+C。`hydor service install` 让它作为后台服务持续运行，`hydor update` 拉取最新代码、构建并重启，`hydor set-password`、`hydor setup-token` 和 `hydor access-token` 做的就是它们名字所说的事。在 Mac 应用里，`hydor update`、`hydor service install` 和 `hydor serve` 会说明这些由应用自己完成。
- `hydor open` 打印应用的地址；`--browser` 会把它打开。

## 使用另一台电脑上的 Hydor

在那台电脑上创建一个访问令牌（在它的[设置 → 应用 → 机器](/settings?s=machines&find=Access%20from%20other%20machines)中点**新建令牌**，或者在那里运行 `hydor access-token "my laptop"`），然后连同它的地址一起指定：

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

或者一次性设置 `HYDOR_URL` 和 `HYDOR_TOKEN`。文件夹是那台电脑的：会话会在它的默认文件夹里开始，除非你用 `--cwd` 给出那里的一个文件夹（这台电脑自己的地址，例如 `http://localhost:8790`，则保留你当前所在的文件夹）。`!` 命令只在这台电脑上的 Hydor 里有效。在这台电脑上，命令第一次运行时会为自己创建一个令牌，它在[设置 → 应用 → 机器](/settings?s=machines&find=Access%20from%20other%20machines)中列为“This computer's command line”。要让这个 Hydor 显示另一台电脑的会话和页面，就把它添加为一台机器：`hydor machines` 列出这个 Hydor 在用的机器以及它们是否响应，`hydor machines add Lab --url https://lab.example.com` 添加一台（用 `--ssh <主机>` 代替 `--url` 则通过 SSH 连接；它的访问令牌是隐藏地输入的，或者来自 `--file -`），`hydor machines remove lab` 停止使用它。

## 颜色和管道

终端里颜色是开启的（有真彩色时就用真彩色）；当输出到文件或另一个程序、设置了 `NO_COLOR` 或使用 `--no-color` 时，颜色是关闭的；`FORCE_COLOR` 会把它们打开。当你输入的内容通过管道传入时（`echo "…" | hydor`），它的工作方式和 `hydor run` 一样。当只有输出被管道接走时，对话会不带颜色和不断变化的行来打印，你输入的每一行都会被发送。像 `hydor sessions` 这样的列表此时会打印同样的列，不带颜色，也不会把较长的内容截断，方便脚本读取。

## 问问智能体

- “我怎样才能在终端里与智能体对话？”
- “在我的 shell 里打开 hydor 命令的 Tab 补全。”
- “给我写一个脚本：用 hydor run 审查我已暂存的修改，发现错误时让这次提交失败。”
- “hydor run 返回退出码 3 是什么意思？”
- “在我的笔记本电脑上设置 hydor 命令，让它使用这台电脑上的 Hydor。”
- “哪个 hydor 命令能列出我的定时任务？我怎样在终端里关掉其中一个？”
- “让终端等这一轮结束后再发送我的消息。”
- “关掉终端里的灰色建议。”
