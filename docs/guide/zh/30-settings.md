# 所有设置

设置中的每个部分及其内容，按应用中的顺序排列，每项都链接到设置中的位置，以及本指南中讲解它的部分。用它查找某项在哪里设置；各主题会讲解如何使用。

## 设置的布局

从侧边栏打开**设置**。在电脑上，设置顶部有三个标签页：**应用**（应用本身）、**智能体**（智能体以及它们读取的内容）和**功能**（应用为每个智能体添加的能力：搜索、浏览器、记忆等）。每个标签页在左侧列出它的部分，打开的部分占满页面。在手机上，设置把所有部分列在一个列表中；点一下即可打开，点顶部的箭头返回。

你不必知道某个选项在哪里：在搜索框（Ctrl+K，Mac 上为 ⌘K）中输入你想要的内容，例如“深色模式”或“通知”，然后选中它。应用会打开正确的部分并指向该选项。你也可以让任何智能体替你更改设置（[让智能体替你操作应用](/guide/ask-agents)）。

## 应用

### 通用

[设置 → 通用](/settings?s=general)：主题，以及智能体工作时 Enter 键的作用。详见[外观、语言和更新](/guide/app)。

- [**主题**](/settings?s=general&find=Theme)：深色、浅色或跟随你的设备；也可以是你自己的主题。
- [**新建主题**](/settings?s=general&find=New%20theme)：以其中任意一个为基础，制作你自己的主题。
- [**导入**](/settings?s=general&find=Import)：添加别人分享的主题。
- [**语言**](/settings?s=general&find=Language)：应用显示所用的语言，也是智能体写作所用的语言。
- [**智能体工作时发送**](/settings?s=general&find=Sending%20while%20an%20agent%20works)：Enter 加入正在进行的这一轮，或等它结束。
- [**终端建议**](/settings?s=general&find=Terminal%20suggestions)：终端中光标后的灰色补全建议。
- [**用量限制解除后继续**](/settings?s=general&find=Resume%20after%20usage%20limits)：在套餐额度重置一分钟后继续会话。
- [**删除不活跃的会话**](/settings?s=general&find=Delete%20inactive%20sessions)：删除一年（或你选择的时长）无人使用的会话；在此之前，每个对话都会保留。
- [**开机时启动**](/settings?s=general&find=Start%20when%20this%20computer%20starts)：电脑启动时自动启动本应用。
- [**自动更新**](/settings?s=general&find=Update%20automatically)：自动安装新版本：Mac 应用在新版本一发布时安装，并提前一分钟告诉你；从 git 安装的副本则在你一段时间没有使用时安装。
- [**开始导览**](/settings?s=general&find=Take%20the%20tour)：了解应用各部分的作用。
- [**小贴士**](/settings?s=general&find=Tips)：欢迎导览之后，在你第一次用到应用的某个部分时为你指出它。
- [**立即检查**](/settings?s=general&find=Check%20now)：立即检查新版本。

### 通知

[设置 → 通知](/settings?s=notifications)：当会话完成、失败或需要你回答时。详见[收件箱和通知](/guide/inbox)。

- [**通知此设备**](/settings?s=notifications&find=Notify%20this%20device)：会话完成、失败或需要你回复时发出通知，即使应用已关闭。
- [**声音**](/settings?s=notifications&find=Sound)：应用打开时，每条通知都会响起简短的提示音。
- [**发送测试**](/settings?s=notifications&find=Send%20a%20test)：现在向这台设备发送一条通知。

### 密码

[设置 → 密码](/settings?s=security)：此应用的密码，以及退出登录。详见[外观、语言和更新](/guide/app)。

- [**修改密码**](/settings?s=security&find=Change%20password)：更改后，其他所有浏览器都会退出登录。
- [**在此浏览器上退出登录**](/settings?s=security&find=Sign%20out%20of%20this%20browser)：你需要密码才能重新进入。

### 源代码管理

[设置 → 源代码管理](/settings?s=scm)：用于创建拉取请求的 GitHub 和 Gitea 账号。详见[手机、其他机器和分享](/guide/devices)。

- [**添加账户**](/settings?s=scm&find=Add%20an%20account)：用于创建拉取请求的账户。

### 连接其他智能体

[设置 → 连接其他智能体](/settings?s=connect)：让其他地方的智能体通过本应用的 MCP 服务器，在这里启动和引导会话。详见[手机、其他机器和分享](/guide/devices)。

- [**新建令牌**](/settings?s=connect&find=New%20token)：供别处的智能体在这里启动和引导会话的令牌。
- [**它们能做什么**](/settings?s=connect&find=What%20they%20can%20do)：持有令牌的智能体能用的工具。

### 机器

[设置 → 机器](/settings?s=machines)：运行 Naget Agent 的其他机器（可从这里使用），以及对本机的访问。详见[手机、其他机器和分享](/guide/devices)。

- [**添加机器**](/settings?s=machines&find=Add%20a%20machine)：另一台运行 Naget Agent 的机器，可从这里使用。
- [**从其他机器访问**](/settings?s=machines&find=Access%20from%20other%20machines)：其他机器用来访问本机的令牌。

## 智能体

### 账户

[设置 → 账户](/settings?s=accounts)：每个会话都使用的 Claude Code 和 Codex 登录。详见[智能体、账户和模型](/guide/agents-models)。

- [**你的账户**](/settings?s=accounts&find=Your%20accounts)：会话使用的 Claude Code 和 Codex 登录，以及你添加的更多账户。
- [**达到限额时切换账户**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit)：用量耗尽的会话会换另一个账户继续。
- [**智能体程序**](/settings?s=accounts&find=Agent%20programs)：已安装哪些智能体程序，以及安装其他程序。
- [**自动更新**](/settings?s=accounts&find=Update%20automatically)：让 Claude Code、Codex 和其他智能体程序保持最新版本。

### 更多智能体

[设置 → 更多智能体](/settings?s=agents)：Gemini CLI、OpenCode、Qwen Code、Goose 以及其他支持 ACP 的智能体。详见[智能体、账户和模型](/guide/agents-models)。

- [**你的智能体**](/settings?s=agents&find=Your%20agents)：显示在 Claude Code 和 Codex 旁边的智能体。
- [**添加你自己的**](/settings?s=agents&find=Add%20your%20own)：任何支持 ACP 的智能体（通过其命令）。
- [**支持 ACP 的智能体**](/settings?s=agents&find=Agents%20that%20speak%20ACP)：Gemini CLI、OpenCode、Qwen Code 和 Goose，可随时添加。

### 模型

[设置 → 模型](/settings?s=models)：Custom（本应用自带的智能体）的模型：OpenRouter、Ollama，以及在这里用 vLLM 运行的 Hugging Face 模型。详见[智能体、账户和模型](/guide/agents-models)。

- [**辅助模型**](/settings?s=models&find=Helper%20model)：在会话之外处理小任务的模型。
- [**在本机**](/settings?s=models&find=On%20this%20machine)：安装在这里的模型及其下载。
- [**从 Hugging Face 添加模型**](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face)：搜索，看看每一个在这里运行得如何，然后安装它。
- [**OpenRouter**](/settings?s=models&find=OpenRouter)：通过 OpenRouter 使用的模型，用你的密钥。
- [**运行时和端点**](/settings?s=models&find=Runtimes%20and%20endpoints)：Ollama、vLLM 及其他兼容 OpenAI 的端点。
- [**Hugging Face 令牌**](/settings?s=models&find=Hugging%20Face%20token)：仅用于受限或私有模型。

### 智能体准则

[设置 → 智能体准则](/settings?s=guidelines)：每个智能体都遵循的内容：适用于所有会话、某个项目或单个会话。详见[智能体准则](/guide/guidelines)。

- [**适用于所有会话**](/settings?s=guidelines&find=For%20every%20session)：每个智能体在每个会话中都遵循的内容。
- [**适用于某个项目**](/settings?s=guidelines&find=For%20a%20project)：项目中的会话所遵循的准则。
- [**适用于单个会话**](/settings?s=guidelines&find=For%20one%20session)：单个会话的准则，可在开始页或会话菜单中设置。
- [**Claude Code 和 Codex 也会读取的文件**](/settings?s=guidelines&find=Files%20Claude%20Code%20and%20Codex%20read%20too)：CLAUDE.md 和 AGENTS.md，由 Claude Code 和 Codex 自行读取。

### MCP 服务器

[设置 → MCP 服务器](/settings?s=mcp)：智能体可以调用的工具。详见[已连接的应用、密钥和工具](/guide/connections)。

- [**添加服务器**](/settings?s=mcp&find=Add%20server)：供 Claude Code 或 Codex 使用的工具服务器。
- [**检查连接**](/settings?s=mcp&find=Check%20connections)：查看每个 MCP 服务器是否有响应。

### 技能

[设置 → 技能](/settings?s=skills)：智能体在任务需要时加载的成文方法：内置的、你的、来自插件的，以及智能体自己的。详见[技能](/guide/skills)。

- [**新建技能**](/settings?s=skills&find=New%20skill)：为所有智能体编写技能，或只为 Claude Code 或 Codex 编写。
- [**内置**](/settings?s=skills&find=Built%20in)：应用自带的技能。
- [**你的**](/settings?s=skills&find=Yours)：你编写的技能，或智能体建议后你批准的技能。
- [**来自插件**](/settings?s=skills&find=From%20plugins)：你的插件带来的技能。
- [**Claude Code 和 Codex**](/settings?s=skills&find=Claude%20Code%20and%20Codex)：智能体自己的技能，只有它们自己会获得。
- [**按关键词引入技能**](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords)：消息中的关键词会自动加载技能。
- [**制作我自己的版本**](/settings?s=skills&find=Make%20my%20own%20version)：修改内置技能：你的版本会替代它。

### 插件

[设置 → 插件](/settings?s=plugins)：为每个智能体带来技能、工具和指令的扩展。详见[已连接的应用、密钥和工具](/guide/connections)。

- [**你的插件**](/settings?s=plugins&find=Your%20plugins)：你添加的插件，可为所有智能体开启或关闭。
- [**应用自带**](/settings?s=plugins&find=Come%20with%20the%20app)：应用自带的插件，随时可以添加。
- [**制作插件**](/settings?s=plugins&find=Make%20a%20plugin)：把你自己的技能、工具、指令和文件打包成插件。
- [**来自链接**](/settings?s=plugins&find=From%20a%20link)：从 GitHub 或其他 Git 地址添加插件。
- [**来自 .zip 文件**](/settings?s=plugins&find=From%20a%20.zip%20file)：添加别人打包成 .zip 的插件。
- [**打包成 .zip**](/settings?s=plugins&find=Pack%20into%20a%20.zip)：把插件打包成一个文件来分享。
- [**Claude Code**](/settings?s=plugins&find=Claude%20Code)：Claude Code 自己的插件和市场。
- [**Codex**](/settings?s=plugins&find=Codex)：Codex 自己的插件和市场。

### 定时任务

[设置 → 定时任务](/settings?s=tasks)：自动开始的智能体工作：按计划、仅一次，或在 webhook 调用时。详见[定时任务](/guide/tasks)。

- [**新建任务**](/settings?s=tasks&find=New%20task)：自动开始的智能体工作。
- [**从示例开始**](/settings?s=tasks&find=Start%20from%20an%20example)：现成的定时任务。
- [**晨间简报**](/settings?s=tasks&find=Morning%20brief)：现成的定时任务。
- [**某个话题的新闻**](/settings?s=tasks&find=News%20on%20a%20topic)：现成的定时任务。
- [**价格监控**](/settings?s=tasks&find=Price%20watch)：现成的定时任务。
- [**网页变化提醒**](/settings?s=tasks&find=Page%20change%20alert)：现成的定时任务。
- [**基于文件夹的每周报告**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder)：现成的定时任务。
- [**收件箱摘要**](/settings?s=tasks&find=Inbox%20digest)：现成的定时任务。
- [**习惯打卡**](/settings?s=tasks&find=Habit%20check-in)：现成的定时任务。
- [**新版本发布**](/settings?s=tasks&find=New%20releases)：现成的定时任务。
- [**网站在线检查**](/settings?s=tasks&find=Site%20up%20check)：现成的定时任务。
- [**磁盘空间提醒**](/settings?s=tasks&find=Disk%20space%20alert)：现成的定时任务。
- [**审查新的拉取请求**](/settings?s=tasks&find=Review%20new%20pull%20requests)：现成的定时任务。
- [**文件夹中的新文件**](/settings?s=tasks&find=New%20files%20in%20a%20folder)：现成的定时任务。
- [**提醒**](/settings?s=tasks&find=Reminder)：现成的定时任务。

## 功能

### 搜索

[设置 → 搜索](/settings?s=search)：智能体如何搜索网络：Naget Search 和其他提供商。详见[搜索和浏览器](/guide/web)。

- [**提供方**](/settings?s=search&find=Providers)：智能体使用哪些搜索提供商，以及使用顺序。
- [**Naget Search**](/settings?s=search&find=Naget%20Search)：应用自带的网页搜索。
- [**SearXNG**](/settings?s=search&find=SearXNG)：你自己运行的搜索引擎。
- [**Brave Search**](/settings?s=search&find=Brave%20Search)：使用 Brave 密钥进行网络搜索。
- [**DuckDuckGo**](/settings?s=search&find=DuckDuckGo)：无需密钥的网络搜索。
- [**每次搜索的结果数**](/settings?s=search&find=Results%20per%20search)：每次搜索返回的结果数。

### 浏览器

[设置 → 浏览器](/settings?s=browser)：智能体使用的网页浏览器，你可以观看并接管。详见[搜索和浏览器](/guide/web)。

- [**供智能体使用的浏览器**](/settings?s=browser&find=A%20browser%20for%20agents)：智能体打开网站、点击、输入并阅读页面。
- [**Chromium**](/settings?s=browser&find=Chromium)：浏览器运行哪个 Chromium。
- [**显示窗口**](/settings?s=browser&find=Show%20a%20window)：在你能看到的窗口中运行浏览器。
- [**禁止网页访问本机及其所在网络**](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network)：这台电脑及其所在网络上的网站始终不可访问。
- [**为能看图片的模型提供截图**](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images)：能看图的模型会收到页面截图。
- [**网站**](/settings?s=browser&find=Sites)：仅限这些网站，或绝不访问这些网站。
- [**个人资料**](/settings?s=browser&find=Profiles)：浏览器的独立登录。

### 电脑操控

[设置 → 电脑操控](/settings?s=computer)：智能体能看到你 Mac 的屏幕，并使用它的鼠标和键盘，仅限 Mac 应用。详见[搜索和浏览器](/guide/web)。

- [**允许智能体使用这台 Mac**](/settings?s=computer&find=Let%20agents%20use%20this%20Mac)：智能体能看到屏幕，并在任何应用中使用鼠标和键盘；每个会话都会先问你。
- [**辅助功能**](/settings?s=computer&find=Accessibility)：macOS 允许 Naget Agent 使用鼠标和键盘的权限。
- [**屏幕录制**](/settings?s=computer&find=Screen%20Recording)：macOS 允许 Naget Agent 查看屏幕的权限。

### 记忆

[设置 → 记忆](/settings?s=memory)：智能体记住的关于你、你的项目和每个会话的内容，以及记录时间。详见[记忆](/guide/memory)。

- [**记忆**](/settings?s=memory&find=Memory)：智能体开始时会带上之前会话记下的内容，并在你要求时保存笔记。
- [**按含义搜索**](/settings?s=memory&find=Search%20by%20meaning)：按含义查找笔记，以及此搜索中的任何内容。
- [**每晚整理**](/settings?s=memory&find=Tidy%20up%20each%20night)：辅助模型会合并内容相同的笔记，并归纳相关笔记。
- [**立即整理**](/settings?s=memory&find=Tidy%20up%20now)：立即整理记忆。
- [**备注**](/settings?s=memory&find=Notes)：所有已保存的笔记，按位置分类。
- [**添加笔记**](/settings?s=memory&find=Add%20a%20note)：写一条笔记让智能体记住，关于你或某个项目。
- [**已删除的笔记**](/settings?s=memory&find=Deleted%20notes)：最近 30 天内删除的笔记，可以恢复。
- [**导出**](/settings?s=memory&find=Export)：把所有笔记导出为便于阅读的 Markdown，或含更改历史的 JSON。
- [**全部清除…**](/settings?s=memory&find=Clear%20all%E2%80%A6)：删除所有笔记及其历史记录。

### 子会话

[设置 → 子会话](/settings?s=children)：智能体把部分工作交给其他智能体，以及用集群攻克难题。详见[深度研究、第二意见和多个智能体](/guide/research)。

- [**每个会话同时工作的数量**](/settings?s=children&find=Working%20at%20once%2C%20per%20session)：一个会话同时运行的子会话数量。
- [**集群规模**](/settings?s=children&find=Swarm%20size)：一个集群中同时工作的智能体数量。

### 图片和视频

[设置 → 图片和视频](/settings?s=images)：智能体通过 OpenRouter 为你生成的图片和视频，以及资料库中它们的标题和说明由谁撰写。详见[文档、图片、视频和语音](/guide/documents-voice)。

- [**图片生成**](/settings?s=images&find=Making%20images)：允许智能体生成图片。
- [**图像模型**](/settings?s=images&find=Image%20model)：生成它们的模型。
- [**视频生成**](/settings?s=images&find=Making%20videos)：允许智能体生成视频。
- [**视频模型**](/settings?s=images&find=Video%20model)：生成视频的模型。
- [**资料库中的标题和说明**](/settings?s=images&find=Captions%20in%20the%20Library)：为你保存的图片和视频撰写标题和说明的模型。

### 语音

[设置 → 语音](/settings?s=voice)：口述消息，并让回复朗读出来。详见[文档、图片、视频和语音](/guide/documents-voice)。

- [**听写**](/settings?s=voice&find=Dictation)：说出消息，不用打字。
- [**你说的语言**](/settings?s=voice&find=Language%20you%20speak)：听写所识别的语言。
- [**服务器端语音识别**](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)：在这台电脑上或通过某个服务识别语音。
- [**朗读**](/settings?s=voice&find=Read%20aloud)：朗读回复。

### 助手

[设置 → 助手](/settings?s=assistants)：开始会话时可选的预设（研究员、写作者、导师……），以及任务文件夹的位置。详见[助手](/guide/assistants)。

- [**新建助手**](/settings?s=assistants&find=New%20assistant)：启动会话时使用的预设。
- [**任务完成后清理**](/settings?s=assistants&find=Clean%20up%20after%20a%20task)：智能体会删除过程中创建且不再需要的内容。
- [**任务文件夹**](/settings?s=assistants&find=Task%20folders)：助手的新任务文件夹存放位置。

### Custom

[设置 → Custom](/settings?s=custom)：自动模式、命令沙盒，以及目标的运行时长。详见[Custom，应用自己的智能体](/guide/custom)。

- [**自动模式**](/settings?s=custom&find=Auto%20mode)：Custom 会自行批准安全的步骤。
- [**命令沙盒**](/settings?s=custom&find=Sandbox%20for%20commands)：命令在沙盒中运行。
- [**目标**](/settings?s=custom&find=Goals)：一个目标最多可运行的轮数。

## 问问智能体

- “在哪里更改智能体工作时 Enter 键的作用？”
- “打开通知提示音。”
- “给我看看我的搜索设置。”
- “把辅助模型设为最便宜的那个。”
- “为新会话关闭记忆。”
