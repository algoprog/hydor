# 终端中的 Hydor

`hydor` 命令可以在终端里完成你在应用各个页面中做的事：与智能体对话并实时跟进它的工作，批准它的请求并回答它的问题，在脚本中运行一条请求并取回答案，还能管理应用保存的一切内容：你的会话、项目、智能体、记忆、技能、插件、密钥、定时任务、用量以及所有设置。对于只有页面才能完成的操作（绘制签名、幻灯片和示意图编辑器），该命令会给出对应页面的地址。它与应用使用的是同一个 Hydor，所以在终端中开始的会话会显示在应用里，在应用中开始的会话也可以在终端里继续。你的 shell 会在你输入时为它补全。

![hydor 命令：欢迎框，以及输入斜杠时打开的菜单](images/terminal.webp)

## 获取命令

- **用安装程序安装**（`./install.sh`）：当 `~/.local/bin` 文件夹在你的 PATH 中时，安装程序会把 `hydor` 链接到该文件夹，并给出提示。否则它会告诉你命令在哪里：位于 Hydor 文件夹中的 `bin/hydor.mjs`，你可以直接运行它，也可以把它链接到你存放命令的位置。
- **使用 Docker**：镜像中已包含该命令。运行 `docker exec -it hydor hydor`，即可与容器内的智能体对话。
- **Mac 应用**每次启动时都会自动把它加入你的 PATH。它会把 `hydor` 链接到 `~/.local/bin`、`~/bin`、`/usr/local/bin` 或 `/opt/homebrew/bin`，选用其中第一个既在你的 PATH 中、又有写入权限的位置。如果都不满足，它会使用 `~/.local/bin`，并在你的 shell 启动文件（zsh 为 `~/.zprofile`）中添加一行带有 Hydor 标记的内容，让该文件夹进入你的 PATH。之后请打开一个新的终端窗口。该命令运行的是应用自带的 Node.js，应用关闭时，`hydor` 会将其打开。从磁盘映像中运行，或者在你把应用移到**应用程序**文件夹之前，它不会执行任何操作。在应用内部，`hydor update`、`hydor service install` 和 `hydor serve` 只会提示这些事情由应用自己完成。
- **Linux 和 Windows 桌面应用**在每次启动时都会做同样的事，不需要密码，也不会提问。在 **Linux**（AppImage 或 .deb）上，该命令是 `~/.local/bin`、`~/bin` 或 `/usr/local/bin` 中的一个小型 `hydor` 文件，选用其中第一个既在你的 PATH 中、又有写入权限的位置。如果都不满足，它会使用 `~/.local/bin`，并在你的 shell 启动文件中添加一行带有 Hydor 标记的内容。.deb 自带的 `/usr/bin/hydor` 会打开应用窗口，所以该命令在你的 PATH 中排在它之前。在 **Windows** 上，它会把 `hydor.cmd` 放进你的 WindowsApps 文件夹（Windows 本来就会搜索它）；否则放进 `%LOCALAPPDATA%\Hydor\bin`，并把该文件夹加入你的 PATH。之后请打开一个新的终端（Windows Terminal、PowerShell 或命令提示符）。与 Mac 上一样，该命令运行的是应用自带的 Node.js，应用关闭时 `hydor` 会将其打开，而 `hydor update`、`hydor service install` 和 `hydor serve` 只会提示这些事情由应用自己完成。如果你的 PATH 中已经有另一个 `hydor`（安装程序为 git 副本创建的链接），应用不会改动任何内容。如果你使用的是另一台电脑上的 Hydor 副本，仍然可以使用那台电脑上的 Hydor：参见[使用另一台电脑上的 Hydor](#use-another-computers-hydor)。

`hydor help` 会按分组列出它能做的所有事情，每项一行说明；`hydor help <command>` 给出某个命令的用法、选项和示例，`hydor help options` 列出所有选项，`hydor help <command> <verb>` 则给出某个动词的说明。维护类命令也使用同一个名称：`hydor service status`、`hydor setup-token`、`hydor update` 等等（`node dist/server/cli.js …` 同样可用）。如果你输错了命令、选项或动词，它会提示“Did you mean …?”。错误信息以红色显示。

如果消息以某个命令的名称开头，请把它放在引号里（`hydor "find the bug in login"`），或者放在 `hydor chat` 之后，以免它被当作命令。

你不必先启动 Hydor。当这台电脑上没有任何响应时，该命令会在后台启动它，显示 **Starting Hydor…**，并在命令结束后让它继续运行，所以你的会话不会中断。`hydor status` 会告诉你它使用的是哪个 Hydor、版本号、是否作为服务运行，以及哪些部分正在工作。在装有桌面应用的电脑上，如果应用已关闭，则会打开应用：该命令不会自行启动服务器。

## 在 shell 中使用 Tab 补全

只需开启一次：

```bash
hydor completion install
```

它会为你使用的 shell（bash、zsh 或 fish）完成设置：把脚本写到 shell 查找它的位置；对于 zsh，以及没有 bash-completion 的 bash，还会在你的 `.zshrc` 或 `.bashrc` 中添加一行。之后请打开一个新的终端。重复运行不会产生重复的改动。`hydor completion bash`（或 `zsh`、`fish`）则会直接打印脚本，方便你放到任意位置：`source <(hydor completion bash)`。

之后，按 Tab 就能补全你输入的内容：命令、它们的动词和选项，以及它们所接收的对象。在 `hydor show ` 或 `hydor send ` 之后，它会列出你的会话的键及各自的标题；`--model` 之后是各个模型，`--as` 之后是你的智能体，`--cwd` 之后是文件夹；项目、技能、插件、设置、指南主题等也是如此，内容取决于这个 Hydor 中实际有的东西。如果 Hydor 没有很快响应，补全会提供在没有它时所能给出的内容，绝不会让你的 shell 卡住。

## 与智能体对话

在某个文件夹中运行 `hydor`，或者在 `hydor` 后面加上你的消息（`hydor fix the failing test`）。第一条消息会在该文件夹中开始一个会话。

聊天以一个欢迎面板开场，这是一个方框，上边框里有 **HYDΩR** 及其版本号。方框内依次是：文件夹“on”它的 git 分支（git 没有可显示的分支时，不显示分支）；然后是将回答你的程序（**Claude Code**、**Codex** 或 **Custom**）、模型（在有档位的 Hydor 上，如果由任务决定模型，则显示为**自动**）和权限模式，三者之间用 · 隔开；智能体不经询问就行动时，模式显示为红色，计划模式则显示为强调色；最后是一行提示：`/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`。无论文件夹名称多长，方框的宽度都保持不变。

你看到的内容都保留在终端自己的历史记录中，所以你可以向上滚动并从中复制，通过 SSH 和在 tmux 中也一样：

- **你的消息**，前面带一个 `›`。
- **智能体的文字**，随生成逐步显示，包括标题、列表、引用、表格、链接（地址跟在文字后面）和代码（不会重新换行，所以复制下来就能运行）。
- **每个步骤**占一行：它读取、搜索、编辑（附带增加和删除的行数）、运行（附带所用时间；失败时附带退出码，错误的第一行显示在其下方）了什么。
- **思考**显示为一行暗色文字，例如“Thought for 8 s”。用 `--thinking` 启动可以看到完整内容，用 `-v` 启动可以看到每个步骤输出的前几行。
- **子智能体**：当智能体把一部分工作交给 [Hydor 子智能体](/guide/research#let-an-agent-hand-work-to-subagents)时，显示“Subagent started”；它的回复返回时，显示“Subagent finished”（或“Subagent failed”）。Claude Code 还可以在后台运行它自己的子智能体，并在它们工作时结束本轮：底部几行会说明哪些正在后台工作，每个结束时会显示“Finished in the background”，智能体随后自行继续。它留在后台运行的命令（例如开发服务器）不会拖住任何事情。`/subagents` 会列出所有子智能体及各自正在做的事（以及某个子智能体花了多少费用）。
- **每一轮的结尾**：用了多长时间、花费多少、使用的模型，以及有多少个子智能体参与工作（“1 subagent”、“3 subagents”）。

在底部，有几行会在智能体工作时不断变化：仍在写的文字、正在进行的步骤、正在工作的子智能体、一个带颜色的旋转图标和已用时间（“Working”上会有微光掠过），以及你的输入行。按 **Esc** 或 Ctrl+C 可以停止本轮。

### 输入行

你的输入位于两条细线之间，下方是一行状态栏：文件夹及其分支、模型和模式、目前的花费，右侧是 `/help`。

- **灰色建议**来自你之前的消息，显示在你输入的内容后面。按 **→** 接受整条建议，按 **Alt+→** 接受其中一个词。**设置 → 应用 → 通用 → 终端建议**可以关闭和开启它（[设置](/settings?s=general&find=Terminal%20suggestions)）。
- **Ctrl+R** 搜索你之前的消息：输入其中的一些词，用 **↑** 和 **↓** 移到某个匹配项，按 **Enter** 把它放进输入行但不发送，这样你可以先修改。按 **Esc** 放弃。
- 一条消息可以有多行，粘贴的内容会整段进入。

### 补全菜单

你输入时，输入行下方会打开一个菜单，并跟随每一次按键更新：

| 输入 | 菜单列出 |
| --- | --- |
| `/` | 各个命令及其作用：先是聊天自己的命令，然后是程序自己的命令（例如 Claude Code 的命令和技能）。 |
| `/model `、`/mode `、`/effort `、`/agent `、`/subagents `、`/open ` | 该命令的取值：模型、模式、思考强度、你的智能体、子智能体、打开的位置。 |
| `@` 加几个字母 | 会话所在文件夹中的文件，模糊匹配：`@clits` 能找到 `src/cli.ts`。以 `/` 结尾可浏览该文件夹。 |

**↑** 和 **↓** 移动，**Tab** 补全高亮的一行，**Enter** 补全并运行它（需要取值的命令则会改为打开该命令的取值列表）。**Esc** 关闭菜单。匹配很宽松，命令的字母不必相邻：`mdl` 能找到 `/model`。

### 选择器

不带取值输入 `/sessions`、`/resume`、`/model`、`/effort`、`/mode` 和 `/agent`，会打开一个选择器：一个带有一行高亮的列表。**↑** 和 **↓** 移动，输入文字可缩小列表范围，**Enter** 选定，**Esc** 退出。列表不超过九行时，仍可按**数字**键直接选择。不带密钥的 `hydor resume` 会打开同样的会话选择器。

### 用 `!` 运行 shell 命令

以 `!` 开头输入一行，其余部分会在会话所在的文件夹中作为 shell 命令运行：`!git status`、`!npm test`。命令运行时，聊天会把终端交出去，所以交互式程序也能使用（`!vim notes.md`、`!htop`），结束后再收回。只要这一行以 `!` 开头，提示符就会变成黄色。智能体看不到这条命令，也看不到它的输出；想让它看到什么，请在消息里说明。此功能仅适用于这台电脑上的 Hydor。

### 回答智能体的询问

当智能体需要你的批准时，请求会显示它涉及的内容（命令、对文件的修改、计划），下方是可选项：

- 按 **y** 选择第一个允许的选项，按 **n** 拒绝，或按任一选项的**数字**（例如“Always allow”）。
- 若要拒绝并告诉智能体改做什么，直接输入内容并按 Enter。

问题会以带编号的选项显示：按数字选择一个（若问题允许多选，可按多个数字，然后按 Enter），或者输入你自己的回答并按 Enter。按 Esc 跳过。表单会逐个询问各字段：输入每个答案并按 Enter，或直接按 Enter 保留当前显示的内容。文件通过它在这台电脑上的路径来提供。

有些请求需要在应用中处理：例如关于签名的请求，或你某个应用所需的密钥。终端会提示这一点，并给出该会话在应用中的地址。

### 当智能体的浏览器在等你

智能体的浏览器所等待的事项会以卡片形式显示在聊天中，排在任何在它之前的批准请求之后，措辞与应用中使用的一致（参见[智能体使用的浏览器](/guide/web#the-browser-agents-use)）：

- “Needs you in the browser: …”，用于登录、验证或智能体拿不准的任何情况，下方是该页面的地址。
- “Stopped before paying or ordering: …. That is yours to do”。
- “Wants to open localhost:3000, on this machine or its network”。
- “Wants to press “Send” on mail.example.com”，用于在浏览器已登录的网站上进行发送、发布、删除或转账的按钮（参见[会发送、发布或删除的按钮](/guide/web#buttons-that-send-post-or-delete)）；卡片还会注明只有你允许它才会按下。
- 网页弹出的提问：网站的提示（或询问是否离开），连同它的消息。

卡片会显示它的按键，按一下即可回答：

- 对于地址或按钮：**y** 表示允许（地址的话，仅限本次会话），**n** 表示不允许。
- 对于登录、验证或付款，这些只有你能在网页中完成：**o** 会在你的浏览器中打开该会话在应用中的页面，这样你可以在那里接手；**d** 表示你已完成；**n** 表示你无法完成（付款时则表示暂不处理）。
- 对于弹出的提问：**y** 表示确定（对于“Leave this page?”则是离开），**n** 表示取消（留下）。提示框只有“确定”。对于文本输入框，输入你的答案并按 Enter，或按 **y** 保留当前显示的内容，或按 **n** 取消。

终端无法显示网页本身，所以请用 **o** 来接手。回答之后，卡片会缩成一行：“Done in the browser”、“Skipped”、“Allowed”或“Not allowed”。

### 智能体工作时

输入行始终归你使用。智能体工作时你发送消息，Enter 如何处理由[设置 → 应用 → 通用](/settings?s=general&find=Sending%20while%20an%20agent%20works)中的**智能体工作时发送**决定：**加入本轮**（默认，与应用一致）会把消息放进正在进行的这一轮，**等它结束**则把消息排入队列，等本轮结束后再发送（显示为 **queued**）。无论如何设置，有两个命令可以为单条消息做决定：

- `/queue <message>` 总是等本轮结束。
- `/now <message>` 总是加入正在进行的这一轮。

这两项设备设置，**智能体工作时发送**和**终端建议**，属于聊天自己的设置：可以在这里设置，用 `hydor settings set general.sending-while-an-agent-works wait`，或者让智能体来修改（参见[设置](#settings)），聊天会立即跟随变化。

### 按键

- **Enter** 发送。**Alt+Enter**、**Ctrl+J**，或在行尾加一个 `\` 再按 Enter，可以换行。粘贴的内容会整段进入，保留其中的换行。
- **↑** 和 **↓** 翻阅你之前的消息（保留最近 500 条）；在多行消息中，它们会先在各行之间移动。菜单打开时，它们在菜单中移动。
- **←**、**→**、**Home**、**End**、**Ctrl+A** 和 **Ctrl+E** 移动光标；**Alt+←** 和 **Alt+→** 一次移动一个词；**Ctrl+W** 删除光标前的词，**Ctrl+U** 和 **Ctrl+K** 分别删除光标之前和之后的本行其余部分。
- **Tab** 打开菜单，并接受高亮的一行。**Ctrl+R** 搜索之前的消息。
- **Esc** 关闭菜单，或停止本轮。**Ctrl+C** 在有一轮运行时停止它，在有文字时清空输入行，其余情况下连按两次则退出。在空行上按 **Ctrl+D** 退出。**Ctrl+L** 清屏。**Ctrl+Z** 挂起聊天（用 `fg` 恢复）。

`/keys` 会在聊天中列出这些按键。你退出时，会话仍会继续：终端会告诉你如何回到它。

### 命令

在输入行中输入（输入 `/` 会列出它们）：

- `/help`：命令、按键，以及另外一些内容（`@`、`!`），分为几个部分：**命令**、**按键**、**其他**。`/keys` 只列出按键。
- `/new`（可加一条消息）：在同一文件夹中新建会话。
- `/sessions`（或 `/resume`）：选择另一个会话继续。
- `/model`、`/effort`、`/mode`：更改模型、思考的深度，以及不经询问可以做什么。不带名称时，各自会打开一个选择器。
- `/agent`：以[你的某个智能体](/guide/agents)的身份工作，从下一条消息起生效。
- `/subagents`：列出子智能体（包括后台的）、各自正在做什么（以及某个子智能体花了多少费用）；`/subagents 2` 显示第二个子智能体的对话。
- `/tiers`、`/usage`、`/cost`：每个档位对应哪个模型、你的套餐的用量和限额，以及本会话及其子智能体花了多少费用。
- `/copy`：把智能体的上一条回复复制到剪贴板，通过 SSH 和在 tmux 中也可以。`/clear` 清屏。
- `/queue` 和 `/now`：发送一条消息，让它等待或加入，不受当前设置影响（[智能体工作时](#while-it-works)）。
- `/stop`、`/rename`、`/open`、`/quit`：停止本轮和后台的子智能体、重命名会话、显示它在应用中的地址、退出。
- `/hydor <command>`：在聊天中运行后面各节里的任何命令（[在聊天中](#inside-the-chat)）。

其他任何 `/command` 会原样发送给智能体，用于程序自己的命令和技能。

终端支持真彩色时会使用真彩色。`NO_COLOR` 和 `--no-color` 可以关闭颜色，通过管道输出时也会关闭。

## 继续一个会话

- `hydor -c` 继续你当前所在文件夹中最近的会话。
- `hydor resume` 打开你最近会话的选择器；`hydor resume 6f1e2a3b` 继续指定的那个会话。

首先显示最近几轮，每一轮的工作都折叠成一行（“Ran 3 commands, read 4 files”）；`hydor show` 会打印全部内容。

## 选择会话如何开始

这些选项可与 `hydor`、`hydor run` 和 `hydor resume` 一起使用：

- `--agent claude`、`codex`、`custom`，或[另一个智能体程序](/guide/agents-models)的名称：由哪个程序来回答。
- `--model`（模型的名称，或用 `auto` 表示自动）、`--effort`，以及 `--mode ask`、`edits`、`plan` 或 `full`（或该程序自己的模式名称）。
- `--as Researcher`：以[你的某个智能体](/guide/agents)的身份开始。
- `--cwd`（一个文件夹；省略时为你当前所在的文件夹）、`--worktree`（独立的分支和文件夹）、`--cap 2`（最多花费 $2）、`--no-memory`、`--title`。

你省略的内容，取自应用起始页上最近一次的选择，其次是应用的默认值。

## 通过脚本发出一次请求

`hydor run "…"`（或 `hydor -p "…"`）会用你的消息启动一个会话，一直跟进到工作完成，打印智能体的最后一条回复，然后结束。“完成”是指：这一轮已经结束，没有子智能体仍在工作或仍欠一条回复（包括后台运行的 Claude Code 自带的子智能体，无论是智能体自己的还是某个子智能体的），队列里也没有等待处理的内容。如果智能体为了等待它的子智能体而结束了这一轮，子智能体的回复或结束会再次唤醒它，运行也会等这一轮结束。留在后台运行的命令（例如开发服务器）不会拖住运行结束。遇到 `--timeout` 超时或按下 Ctrl+C 时，后台的子智能体会随这一轮一起停止。如果后面没有跟消息，它会读取通过管道传入的内容作为消息：`git diff | hydor run "审查这次改动"`。

- 在终端中，侧边的简短文字行会说明正在发生什么（每一步、子智能体的启动和结束）；用 `-q` 可以关闭这些提示。
- 由于没有人可以回答，批准请求或提问会让运行停下，并说明被问到了什么，会话则等你在应用中或用 `hydor resume` 来处理。智能体的浏览器在等待的事项也是如此（登录、付款、需要允许的地址或按钮、弹出的提问），运行时会告诉你：“智能体的浏览器：想在 mail.example.com 上点击“删除””。使用 `--mode full`（或 `-y`）时，智能体不会再询问任何事。
- `--json` 会在结束时打印一个对象：`key`、`url`、`status`、`reply`、`model`、`costUsd`（含其子智能体的费用）、`tokens`、`durationMs`、`turns`、`children`（每个 Hydor 子智能体的 `title`、`label`、`tier`、`costUsd`、`status`），失败时还有 `error`。`--stream-json` 会在每次变化发生时打印一行（`item`、`live`、`note`），最后一行是上述对象。
- `--timeout 300` 会在 300 秒后停止这一轮。

它结束时会返回一个退出码，脚本可以据此检查：

| 退出码 | 发生了什么 |
| --- | --- |
| 0 | 已完成 |
| 1 | 会话失败（出现错误，或达到套餐的用量上限，并会指明是哪一种），或 Hydor 拒绝了请求 |
| 2 | 命令使用不正确 |
| 3 | 需要你的回答 |
| 124 | 耗时超过 `--timeout` |
| 130 | 你按下了 Ctrl+C（先停止了这一轮） |

## 在终端里使用应用的一切功能

应用的每个部分都有自己的命令，用动词表示该页面能做的事。省略动词时，命令会列出内容：`hydor projects` 就是 `hydor projects list`。`hydor help` 会按下面的分组显示所有命令，按 Tab 可以补全动词、选项以及它们所接受的对象。

所有命令的通用规则：

- **给事物命名**：命令需要指定某一项内容（会话、项目、智能体、技能……）时，可以填它的 id 或 id 的开头部分，也可以填它的名称或标题（不分大小写，只要只有一项匹配）。如果有两项或更多匹配，命令会列出最多五项。在终端里，省略名称时，命令会给出一个列表供你选择。
- **修改内容**：各个字段都是选项（`--description`、`--name`）。较长的文本可以来自 `--file <path>`，来自用 `-` 管道传入的内容；在终端里如果两者都没有，则会用你的编辑器（`$VISUAL`、`$EDITOR`）打开当前文本：保存时不做改动就不会有任何变化。
- **删除内容**时会询问 `Remove “name”? [y/N]`。加上 `-y`（或 `--yes`）就等于回答“是”。如果没有终端又没有 `-y`，命令会拒绝执行，而不是自行猜测。
- **`--json`** 会原样输出应用 API 返回的内容，方便脚本使用。
- **退出码**：完成时为 0；Hydor 拒绝或失败时为 1（并说明原因）；命令用法不正确时为 2（并提示该输入什么）。
- **另一台电脑上的 Hydor**：每个命令都可以搭配 `--server` 和 `--token` 使用。
- **只有网页才能做的事**：命令会这样告诉你，并给出该网页的地址。`hydor open … --browser` 会把它打开。

### 会话

| 命令 | 作用 |
| --- | --- |
| `hydor sessions` | 你最近的会话，每个都带一个标记：● 工作中，● 需要你处理，✓ 已完成，✗ 出错。它的动词与会话菜单的功能一一对应：`search`、`rename`、`archive` 和 `unarchive`、`pin` 和 `unpin`、`read`、`snooze`、`move`（移到某个项目）、`fork`、`goal`（不带文字时显示目标：它的状态、轮次、每个检查项、已花费的费用和等待回答的问题；带文字则设定一个目标，智能体会提出检查项；`--start` 对这些检查项点击**开始**，`--answer 1,3` 按显示的编号回答它的问题（可配合 `--other "你自己的办法"` 和 `--note`），`--wait` 让问题继续等你，`--more rounds=8,usd=5,minutes=60` 给它更多额度，`--rule "…"` 添加一条规则，`--pause`、`--resume`、`--clear` 用来暂停、继续、清除：每次调用只做一个操作，在你于这里或应用中点击**开始**之前不会启动任何操作）、`share`（只读链接）、`changes`（它改动过的文件）、`commands`（它运行过的命令）、`queue`（等待中的消息，以及 `queue clear` 和 `queue remove`）、`show`、`export`（把对话导出为 Markdown 文件，用 `-o -` 直接打印，或用 `--library` 在会话所属项目中生成文档）、`send`、`stop` 和 `delete`。 |
| `hydor inbox` | 等你处理的事项（批准、问题、智能体索要的密钥、待审核的技能）：`list`，以及 `show`（查看某一项，并告诉你在哪里回复）。 |
| `hydor outbox` | 等你确认的调用（已连接账户的工具设为“先询问”时）：`list`，`show`（查看某一项及其输入），`send`（原样发送，或用 `--set NAME=value` 修改某个字段）和 `drop`。 |
| `hydor away` | 自你上次访问以来发生的事，就像起始页的**你不在时**所显示的那样：等你处理的事项、已完成或失败的会话、自动运行的内容及其费用，以及今天接下来要运行的内容。`hydor away seen` 会把这一切标为已查看。 |

`hydor show 6f1e2a3b` 等同于 `hydor sessions show 6f1e2a3b`，`send` 和 `stop` 也是如此：这些简短写法依然保留。

```bash
hydor sessions search login          # 与登录有关的会话
hydor sessions rename 6f1e "修复登录问题"
hydor sessions fork 6f1e "改用缓存试试"
hydor sessions export 6f1e -o notes.md  # 把对话导出为 Markdown
hydor sessions goal 6f1e "all tests pass and the PR is open"  # 设定目标：智能体提出检查项
hydor sessions goal 6f1e                  # 查看：状态、轮次、检查项、花费、它的问题
hydor sessions goal 6f1e --start          # 点击开始：各轮开始
hydor sessions goal 6f1e --answer 1,3    # 回答它的问题：办法 1 和 3，按此顺序
hydor sessions goal 6f1e --more rounds=20,usd=10  # 给它更多额度，达到上限时也可以
hydor inbox
hydor away                           # 你不在时发生了什么
```

### 你的工作

| 命令 | 作用 |
| --- | --- |
| `hydor projects` | `list`、`show`、`new`、`rename`、`edit`（描述、准则、启动时使用的智能体、文件夹）、`sessions`、`files`（它读取的文档：`files add` 和 `files remove`）以及 `remove`。 |
| `hydor tasks` | 你的[定时任务](/guide/tasks)和其他自动开始的工作：`list`、`show`、`new`（运行时间：`--every 2h`、`--at 09:00 --days weekdays`、`--cron`、`--once`；或 `--webhook`、`--watch-feed`、`--watch-page`、`--watch-folder`，或用 `--watch-account` 搭配 `--tool` 监视已连接的应用中的新项目，用 `--before 30m` 表示日历中每个事件之前的某个时间）、`edit`、`pause`、`resume`、`run`（立即运行，即使处于暂停状态）、`runs`（最近的运行记录，用 `--reply` 查看最后一次回复）以及 `remove`。监视某个命令或 JSON 地址需要在网页上操作。看板卡片的刷新会列为该看板的任务（“Shop · Sales by day: refresh”）：`pause`、`resume` 和 `run` 对它们同样有效，`show` 会告诉你该去看板上的哪里修改。 |
| `hydor apps` | 你的[应用](/guide/apps)和现成的应用：`list`、`show`、`run`（表单的答案写成 `field=value`，或用 `--input` 传入 JSON；它会打印结果和花费）、`runs`、`run-show`（查看某一次运行）以及 `remove`。`hydor app …`（不带 s）用于以文件形式制作应用：`new`、`folder`、`dev`、`try`、`export`、`import`。 |
| `hydor files`（也可写作 `hydor library`） | 智能体为你制作的内容和你保留的内容，就像各项目的**文件**所显示的那样（[网页、图片、视频和站点](/guide/library)）：`list`（`--kind`、`--project`）、`search`、`show`（文档的文本、看板的卡片，或该项目是什么）、`export`（`--to pdf`、`docx`、`pptx`……，`-o file`）、`open`（其编辑器的地址）、`remove`、`refreshes`（你的看板上哪些内容会刷新、何时刷新、花费多少）以及 `refresh`（立即刷新某张看板卡片，或全部刷新）。 |
| `hydor experiments` | 训练和评估运行：`list`、`show` 和 `stop`。启动运行要靠智能体和网页来完成。 |

```bash
hydor projects new Thesis
hydor projects edit thesis --file guidelines.md
hydor tasks new --at 09:00 --days weekdays "总结我未读的邮件"
hydor apps run trip-planner destination=Lisbon days=5
hydor files export "Q3 report" --to pdf -o q3.pdf
```

### 智能体与模型

| 命令 | 作用 |
| --- | --- |
| `hydor models` 和 `hydor tiers` | 各程序提供的模型，以及每个[档位](/guide/agents-models#tiers-a-model-for-each-kind-of-job)对应哪个模型（`hydor tiers set claude best opus --effort high`、`hydor tiers reset`；`hydor tiers team off` 和 `hydor tiers hard off` 会关闭**主智能体带领子智能体**和**难题用最高档位**，用 `on` 可重新打开）。 |
| `hydor usage` | 各个套餐的用量和限额，以及何时重置。 |
| `hydor agents` | [你的智能体](/guide/agents)：`list`、`show`、`new`、`edit`、`results`、`export`、`install` 和 `remove`（内置的智能体可以复制，但不能修改）。智能体的结果送到哪里，由 `new` 和 `edit` 上的 `--results-to` 决定，每个去处写一次：`library`（同一网页，更新内容）、`library:new`、`sheet`（写入它专属电子表格的一行）、`sheet:<spreadsheet>#<tab>`、`email:<addresses>`、`notify`、`file:<path>`、`webhook:<url>`，或 `none`。它的输出字段在它自己的网页上设置（`hydor open agents`）；`results` 会列出它交回的内容，每个结果一行。`export` 会把智能体保存为 `.hydor-agent` 文件（用 `-o` 指定文件名），并说明哪些内容被省略；`install <file>` 会说明文件带来什么、需要什么，然后询问你，并把它安装在同名的现有智能体旁边，除非加上 `--replace`（`--schedules` 会添加它建议的定时安排，处于暂停状态）。参见[把智能体作为文件分享](/guide/agents#share-an-agent-as-a-file)。 |
| `hydor accounts` | Claude Code 和 Codex 的登录账户：`list`、`show`（查看一个账户：谁已登录以及套餐、新会话是否使用它启动、它的用量和限额、是否保存了 API 密钥（绝不显示密钥本身），以及会话在达到限额时是否切换账户）、`add <program> <name>`（添加另一个账户，并立即登录）、`sign-in`、`sign-out`、`remove` 和 `use`（设定新会话使用的账户）。用于 API 额度的 API 密钥，以及达到用量限额时的切换开关，都属于设置（`accounts.*`）。 |

```bash
hydor agents new Bookkeeper --tools read,edit --tier standard
hydor agents edit bookkeeper --results-to sheet --results-to email:sam@example.com
hydor agents export bookkeeper -o ~/Desktop/bookkeeper.hydor-agent
hydor agents install bookkeeper.hydor-agent --schedules
hydor tiers set claude best opus --effort high
hydor accounts add claude Work
hydor accounts use work
```

### 智能体知道和使用的内容

| 命令 | 作用 |
| --- | --- |
| `hydor memory` | 智能体记住的关于你的事：`list`、`search`、`show`、`add`、`edit`、`forget`（30 天内可恢复）和 `restore`，以及 `profile` 和 `profile edit`（每个智能体最先读取的内容）。`--scope`、`--project` 和 `--session` 用来指明是谁的备注。 |
| `hydor guidelines` | `show` 和 `edit` 每个智能体都要遵循的内容：适用于所有会话、某个项目（`--project`）或某一个会话（`--session`）。 |
| `hydor skills` | 智能体使用的技能：`list`、`show`、`on`、`off`、`add`（来自 `SKILL.md` 或文件夹）和 `remove`。`--agent claude` 或 `--agent codex` 用于这些程序自带的技能。 |
| `hydor plugins` | 带有技能和工具的附加组件：`list`、`show`、`on`、`off`、`add`（内置的、Git 地址、.zip 或文件夹）和 `remove`。制作你自己的插件的方法在它的页面上（`hydor open plugins`）。 |
| `hydor mcp` | 供 Claude Code 和 Codex 使用的工具服务器（MCP）：`list`、`show`（查看一个服务器：它的程序、范围、命令或地址、环境变量和请求头的名称（其值会被隐藏）、开启或关闭状态，加上 `--tools` 还会显示它有多少个工具）、`status`（逐个启动并说明哪些能正常工作）、`add`、`edit` 和 `remove`。 |
| `hydor connections` | [已连接的应用](/guide/connections)（Notion、GitHub、Gmail……）：`list`、`show`、`services`（可以连接哪些服务）、`connect <service>`（隐藏输入的密钥，或在浏览器中登录，命令会等待登录完成）和 `disconnect`。某个连接的哪些工具已开启，要在它的页面上查看。 |
| `hydor keys` | [密钥库](/guide/connections)：`list` 你的密钥名称以及每个密钥可以用于哪里，`set <NAME>` 和 `remove <NAME>`。值会在你隐藏输入时询问，或从你用管道传入的内容中读取；它绝不会作为选项输入（否则你的 shell 会保存它），也绝不会被打印出来。 |

```bash
hydor memory add 我喜欢简短的回答
hydor memory forget 42
hydor skills off research
hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp
hydor keys set GITHUB_TOKEN --domain github.com
hydor guidelines edit --project thesis
hydor connections connect notion --browser
```

### 设置

`hydor settings` 可以访问[设置](/settings)的每一个选项，分为三组（**应用**、**智能体**、**功能**）及其下的各个部分。每个选项都有一个 id，例如 `general.resume-after-usage-limits`：先是它所在的部分，再是它的名称。你可以用这个 id 指定一个选项，也可以用它所在的部分加上名称的开头（`general.resume`），或者在只有一项匹配时只用它的名称；按 Tab 可以补全。

在终端里，单独运行 `hydor settings` 会打开一个浏览界面：先选一个部分，再选一个选项。用 **↑** 和 **↓** 以及直接输入来查找，**Enter** 会打开某个部分或更改某个选项（开关会切换，选项会列出它的可选值，数字或文本需要输入，按钮会先询问确认），**Esc** 返回上一级。通过管道使用时，它会列出每个选项。用于脚本和快速修改：

| 命令 | 作用 |
| --- | --- |
| `hydor settings list [section]` | 列出每个选项及其值，或只列出某一部分的选项。 |
| `hydor settings get <option>` | 一个选项的值，以及它接受什么。 |
| `hydor settings set <option> <value>` | 修改它：开关接受 `on` 或 `off`，选项接受它的某个可选值，数字接受整数，列表用逗号分隔各项（`none` 表示清空）。密钥或令牌会隐藏输入后询问，或从你用管道传入的内容中读取。较长的文本来自 `--file` 或你的编辑器。 |
| `hydor settings run <option>` | 按下该页面的某个按钮（**发送测试**、**立即检查**……），如果会删除或下载内容，会先询问。 |
| `hydor settings open [section]` | 某个部分或某个选项在应用中的地址。 |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

应用保存在每个浏览器里的内容（主题、语言、通知提示音）无法从这里修改：这类选项会说明这一点，并给出该页面的地址。只有网页才能修改的选项也是如此。属于终端的两个设备设置，即**智能体工作时发送**和**终端建议**，是聊天自己的设置，可以用 `hydor settings set` 修改。

### 查找、指南、打开和 api

- `hydor find rate limit` 会搜索搜索框（**Ctrl+K**）能搜索的一切内容：网页、设置及其选项、会话、记忆、技能……`--in settings` 只在设置中查找，`--urls` 会在每个结果下方显示它的地址，`--open 2` 会在浏览器中打开第二个结果。
- `hydor guide` 会列出指南的各个主题；`hydor guide projects` 会在终端中读取其中一个主题，`hydor guide projects "what a project is"` 则读取它的某一节。`--sections` 会列出一个主题的各个小节。
- `hydor open` 会打印应用的地址；`hydor open published`、`hydor open settings memory`、`hydor open project thesis`、`hydor open guide projects` 或 `hydor open 6f1e2a3b`（某个会话）会打印对应页面的地址。`--browser` 还会在浏览器中打开它。只有网页才能做的事都要靠它来到达：幻灯片、电子表格、图片和示意图的编辑器、签名、主题的颜色、登录某项服务。
- `hydor api GET /api/projects` 会调用应用 API 的任意端点并打印其 JSON（`hydor api POST /api/projects -d '{"name":"Thesis"}'`；请求体可以来自 `@file` 或 `-`）。各个端点见 [API 主题](/guide/api)。

### 在聊天中

`/hydor <command>` 可以在不离开对话的情况下运行上面的任何命令：`/hydor sessions`、`/hydor memory search docker`、`/hydor settings get general.resume-after-usage-limits`。它位于 `/` 菜单中，也在 `/help` 的**另见**部分。输入 `/hydor ` 之后，它的菜单会依次列出各个领域、它们的动词，然后是每个动词所接受的对象（你的项目、会话、设置、文件夹……，与在 shell 中按 Tab 补全的内容相同），输入 `-` 时则列出它的选项。命令的输出显示在输入行上方，用法错误或 Hydor 拒绝的回答会以红色显示；聊天会继续进行。命令的询问方式与在 shell 中相同，只是发生在聊天里：需要确认的问题（比如删除）会打开一个选择器，其第一行是**否**；密钥或令牌在输入行中输入，显示为圆点，且绝不会保存到你的历史记录中；需要用到的编辑器会获得终端的控制权，就像 `!` 那样。聊天中没有管道输入，所以较长的文本请用 `--file <path>` 提供（或者省略它，在编辑器中书写）。有自己斜杠命令的命令（`models` 对应 `/model`，`tiers` 对应 `/tiers`，`usage` 对应 `/usage`），或者专为 shell 设计的命令（`run`、`serve`），会说明这一点，并告诉你该用哪个。

## 维护这台 Hydor

- `hydor status` 会告诉你 Hydor 是否在运行、它的版本和地址、数据存放在哪里、是否作为服务运行，以及哪些会话正在工作或需要你处理（标记与 `hydor sessions` 相同）。
- `hydor serve` 在这台电脑上以前台方式运行 Hydor，直到你按下 Ctrl+C。`hydor service install` 让它作为后台服务持续运行，`hydor update` 会拉取最新代码、构建并重启，`hydor set-password`、`hydor setup-token` 和 `hydor access-token` 的作用就和它们的名字一样。在 Mac 应用中，`hydor update`、`hydor service install` 和 `hydor serve` 会提示应用会自行完成这些事。
- `hydor open` 会打印应用的地址；加上 `--browser` 则会直接打开它。
- `hydor machines phone` 会告诉你这里是否已安装并登录 Tailscale，以及应用在你的 tailnet 上的服务地址，还会给出一个二维码，供手机相机扫描。`hydor machines phone serve` 会把应用发布给你自己的设备（如果常用地址已被占用，请加上 `--port 8443`），`hydor machines phone stop` 则会撤销发布，效果与 [设置 → 应用 → 在手机上使用](/settings?s=phone) 相同。

## 使用另一台电脑上的 Hydor

在那台电脑上创建一个访问令牌（在它的 [设置 → 应用 → 机器](/settings?s=machines&find=Access%20from%20other%20machines) 中点击 **新建令牌**，或在那台电脑上运行 `hydor access-token "my laptop"`），然后用它的地址来指定：

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

或者一次性设置好 `HYDOR_URL` 和 `HYDOR_TOKEN`。文件夹指的是那台电脑上的文件夹：除非你用 `--cwd` 指定那台电脑上的某个文件夹，否则会话会在它的默认文件夹中启动（指向这台电脑本身的地址，例如 `http://localhost:8790`，则沿用你当前所在的文件夹）。`!` 命令只能用于这台电脑自己的 Hydor。在这台电脑上，该命令第一次运行时会为自己创建一个令牌，[设置 → 应用 → 机器](/settings?s=machines&find=Access%20from%20other%20machines) 会把它列为“This computer's command line”。若想让这个 Hydor 显示另一台电脑的会话和网页，请把它添加为一台机器：`hydor machines` 会列出这个 Hydor 使用的机器以及它们是否有响应，`hydor machines add Lab --url https://lab.example.com` 会添加一台（若要通过 SSH 连接，请用 `--ssh <host>` 代替 `--url`；它的访问令牌会以隐藏方式输入，或通过 `--file -` 传入），`hydor machines remove lab` 则会停止使用它。

## 颜色与管道

在终端中会显示颜色（终端支持时使用真彩色）；当输出写入文件或交给其他程序、设置了 `NO_COLOR` 或使用 `--no-color` 时，则不显示颜色；`FORCE_COLOR` 可以强制开启颜色。当你输入的内容通过管道传入时（`echo "…" | hydor`），它的效果等同于 `hydor run`。当只有输出被管道传走时，对话会以不带颜色、也没有动态刷新行的方式打印，并且你输入的每一行都会被发送。此时，`hydor sessions` 之类的列表会输出相同的列，不带颜色，也不截断过长的内容，方便脚本读取。在较窄的终端上，列表会整列省略（先省略描述，再省略地址或时间等其他列），而不是把名称和标题截短。在无法显示符号的环境中（Linux 控制台、非 UTF-8 的区域设置，以及旧版 Windows 控制台），命令会改用普通字符来绘制：边框用 `+-|`，提示符用 `>`，标记用 `*`、`+` 和 `x`，标志用 HYDOR。`HYDOR_ASCII=1` 可在任何地方启用这种方式，`HYDOR_ASCII=0` 则将其关闭。写入文件或交给其他程序的内容会保留其中的符号，除非设置了 `HYDOR_ASCII=1`。

## 向智能体提问

- “我怎样在终端里和智能体对话？”
- “在我的 shell 里为 hydor 命令开启 Tab 补全。”
- “给我一个脚本，用 hydor run 对我已暂存的改动做一次审查，发现 bug 时让提交失败。”
- “hydor run 返回退出码 3 是什么意思？”
- “智能体的浏览器想在某个网站上点击“发送”：我在终端里该按什么？”
- “我的 hydor run 因为智能体的浏览器在等待登录而停了：我该怎么继续？”
- “把我笔记本电脑上的 hydor 命令设置为使用这台电脑上的 Hydor。”
- “哪个 hydor 命令可以列出我的定时任务？我该如何在终端里关闭其中一个？”
- “哪个 hydor 命令可以把某个会话的对话保存为 Markdown 文件？”
- “让终端等到一轮对话结束后再发送我的消息。”
- “关闭终端里的灰色建议。”
