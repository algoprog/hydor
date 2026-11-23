# 所有设置

设置中的每个部分及其内容，按应用中的顺序排列，每项都链接到设置中的位置，以及本指南中讲解它的部分。用它查找某项在哪里设置；各主题会讲解如何使用。

## 设置的布局

从工具栏打开**设置**。在电脑上，设置在左侧有一栏，和资料库的那一栏同类，把所有部分列在一个列表里，分在三个标题下：**应用**（应用本身）、**智能体**（智能体以及它们读取的内容）和**功能**（应用为每个智能体添加的能力：搜索、浏览器、记忆等）。点一个部分，它就在自己的标题下占满页面。**隐藏侧边栏**（Ctrl+B）会隐藏这一栏，标题开头的**显示侧边栏**可以把它找回来。在手机上，设置把所有部分列在一个列表中；点一下即可打开，点顶部的箭头返回。

你不必知道某个选项在哪里：在搜索框（Ctrl+K，Mac 上为 ⌘K）中输入你想要的内容，例如“深色模式”或“通知”，然后选中它。应用会打开正确的部分并指向该选项。你也可以让任何智能体替你更改设置（[让智能体替你操作应用](/guide/ask-agents)）。

## 应用

### 通用

[设置 → 通用](/settings?s=general)：主题，以及智能体工作时 Enter 键的作用。详见[外观、语言和更新](/guide/app)。

- [**外观**](/settings?s=general&find=Appearance)：深色、浅色或跟随你的设备；也可以是你自己的主题。
- [**新建主题**](/settings?s=general&find=New%20theme)：以其中任意一个为基础，制作你自己的主题。
- [**导入**](/settings?s=general&find=Import)：添加别人分享的主题。
- [**语言**](/settings?s=general&find=Language)：应用显示所用的语言，也是智能体写作所用的语言。
- [**动效**](/settings?s=general&find=Motion)：应用里有多少东西会动：完整、平静（打开页面或窗口时不滑动、不淡入淡出）或完全不动。
- [**文字大小**](/settings?s=general&find=Text%20size)：此设备上消息、帮助页面和输入框的文字大小：默认、较大或更大。
- [**智能体工作时发送**](/settings?s=general&find=Sending%20while%20an%20agent%20works)：Enter 加入正在进行的这一轮，或等它结束。
- [**终端建议**](/settings?s=general&find=Terminal%20suggestions)：终端中光标后的灰色补全建议。
- [**用量限制解除后继续**](/settings?s=general&find=Resume%20after%20usage%20limits)：在套餐额度重置一分钟后继续会话。
- [**删除不活跃的会话**](/settings?s=general&find=Delete%20inactive%20sessions)：删除一年（或你选择的时长）无人使用的会话；在此之前，每个对话都会保留。
- [**限制每个会话**](/settings?s=general&find=Limit%20each%20session)：一个会话的程序最多可用的内存和处理器。
- [**开机时启动**](/settings?s=general&find=Start%20when%20this%20computer%20starts)：电脑启动时自动启动本应用。
- [**让电脑保持唤醒**](/settings?s=general&find=Keep%20the%20computer%20awake)：在桌面应用中，智能体工作时和定时任务运行前，电脑不会自行进入睡眠。
- [**自动更新**](/settings?s=general&find=Update%20automatically)：自动安装新版本：桌面应用在新版本一发布时安装，并提前一分钟告诉你；从 git 安装的副本则在你一段时间没有使用时安装。
- [**开始导览**](/settings?s=general&find=Take%20the%20tour)：了解应用各部分的作用。
- [**小贴士**](/settings?s=general&find=Tips)：欢迎导览之后，在你第一次用到应用的某个部分时为你指出它。
- [**开始建议**](/settings?s=general&find=Starter%20ideas)：开始页空消息框下方的示例、你的应用和一个自动化任务。
- [**立即检查**](/settings?s=general&find=Check%20now)：立即检查新版本。

### 通知

[设置 → 通知](/settings?s=notifications)：当会话完成、失败或需要你回答时。详见[收件箱与通知](/guide/inbox)。

- [**通知此设备**](/settings?s=notifications&find=Notify%20this%20device)：会话完成、失败或需要你回复时发出通知，即使应用已关闭。
- [**声音**](/settings?s=notifications&find=Sound)：应用打开时，每条通知都会响起简短的提示音。
- [**发送测试**](/settings?s=notifications&find=Send%20a%20test)：现在向这台设备发送一条通知。

### 在手机上使用

[设置 → 在手机上使用](/settings?s=phone)：用 Tailscale 在你自己的手机上私密地打开本应用，并在手机上接收通知。详见[手机、其他机器和分享](/guide/devices)。

- [**发布到我的设备**](/settings?s=phone&find=Serve%20it%20on%20my%20devices)：通过 HTTPS 把应用只发布给登录了你的 Tailscale 账户的设备，绝不发布到公共互联网。
- [**这台电脑上的 Tailscale**](/settings?s=phone&find=Tailscale%20on%20this%20computer)：这里是否安装并登录了 Tailscale，以及这台电脑在你的 tailnet 上的名字。
- [**在手机上打开**](/settings?s=phone&find=Open%20it%20on%20your%20phone)：应用地址的二维码，供手机相机扫描，以及在手机上要做的几步。
- [**停止发布**](/settings?s=phone&find=Stop%20serving)：把应用从你的 tailnet 上撤下，正好撤销“发布到我的设备”所做的一切。
- [**添加到主屏幕**](/settings?s=phone&find=Add%20to%20Home%20Screen)：在手机上：Hydor 有自己的图标，全屏打开；iPhone 的通知需要这样。

### 聊天应用

[设置 → 聊天应用](/settings?s=chat)：在 Telegram、Discord 或 Slack 中与你的智能体对话：开始会话，发送照片、文件和语音消息，收到回复，回答它们的提问。详见[手机、其他机器和分享](/guide/devices)。

- [**Telegram**](/settings?s=chat&find=Telegram)：你自己的 Telegram 机器人，用 @BotFather 创建，你的聊天通过它与智能体对话。
- [**Discord**](/settings?s=chat&find=Discord)：你自己的 Discord 机器人，在开发者门户中创建，你的聊天通过它与智能体对话。
- [**Slack**](/settings?s=chat&find=Slack)：你自己的 Slack 应用，由清单创建，你的聊天通过它与智能体对话。
- [**关联聊天**](/settings?s=chat&find=Link%20a%20chat)：用只能使用一次的代码，让 Telegram、Discord 或 Slack 聊天使用你的智能体。
- [**把机器人添加到服务器**](/settings?s=chat&find=Add%20the%20bot%20to%20a%20server)：把你的 Discord 机器人连同它所需权限添加到你的服务器的链接。
- [**复制清单**](/settings?s=chat&find=Copy%20manifest)：Slack 应用的清单，包含 Socket Mode 及其所需的权限范围，创建应用时粘贴。
- [**新会话使用**](/settings?s=chat&find=New%20sessions%20use)：聊天不在任何会话中时，聊天发来的消息会开始的智能体。
- [**新会话的身份**](/settings?s=chat&find=New%20sessions%20as)：聊天开始的新会话以你的哪个智能体身份进行；在聊天中用 /as 可换一个。
- [**来自所有会话的通知**](/settings?s=chat&find=Notices%20from%20every%20session)：所有会话的通知都发到你的聊天，而不只是由聊天开始的会话。

### 密码

[设置 → 密码](/settings?s=security)：此应用的密码，以及退出登录。详见[外观、语言和更新](/guide/app)。

- [**修改密码**](/settings?s=security&find=Change%20password)：更改后，其他所有浏览器都会退出登录。
- [**在此浏览器上退出登录**](/settings?s=security&find=Sign%20out%20of%20this%20browser)：你需要密码才能重新进入。

### 签名

[设置 → 签名](/settings?s=signatures)：你的签名和姓名缩写：画一次，加密保存，用于你要签署的文档。详见[页面、文档和图片](/guide/library)。

- [**新建签名**](/settings?s=signatures&find=New%20signature)：画出、输入或上传你的签名或姓名缩写。

### 源代码管理

[设置 → 源代码管理](/settings?s=scm)：用于创建拉取请求的 GitHub 和 Gitea 账号。详见[手机、其他机器和分享](/guide/devices)。

- [**添加账户**](/settings?s=scm&find=Add%20an%20account)：用于创建拉取请求的账户。

### 连接其他智能体

[设置 → 连接其他智能体](/settings?s=connect)：让其他地方的智能体通过本应用的 MCP 服务器，在这里启动和引导会话。详见[手机、其他机器和分享](/guide/devices)。

- [**新建令牌**](/settings?s=connect&find=New%20token)：供别处的智能体在这里启动和引导会话的令牌。
- [**它们能做什么**](/settings?s=connect&find=What%20they%20can%20do)：持有令牌的智能体能用的工具。

### 机器

[设置 → 机器](/settings?s=machines)：运行 Hydor 的其他机器（可从这里使用），以及对本机的访问。详见[手机、其他机器和分享](/guide/devices)。

- [**添加机器**](/settings?s=machines&find=Add%20a%20machine)：另一台运行 Hydor 的机器，可从这里使用。
- [**从其他机器访问**](/settings?s=machines&find=Access%20from%20other%20machines)：其他机器用来访问本机的令牌。

## 智能体

### 账户

[设置 → 账户](/settings?s=accounts)：每个会话都使用的 Claude Code、Codex 和 Grok Build 登录。详见[智能体、账户和模型](/guide/agents-models)。

- [**账户**](/settings?s=accounts&find=Accounts)：会话使用的 Claude Code、Codex 和 Grok Build 登录，以及你添加的更多账户。
- [**达到限额时切换账户**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit)：用量耗尽的会话会换另一个账户继续。
- [**达到限额时使用 API 额度**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit)：所有 Claude Code 账户都达到上限时，会话继续运行，费用记在一个 Anthropic API 密钥上。
- [**智能体程序**](/settings?s=accounts&find=Agent%20programs)：已安装哪些智能体程序（包括 Grok Build），以及安装其他程序。
- [**自动更新**](/settings?s=accounts&find=Update%20automatically)：让 Claude Code、Codex 和其他智能体程序保持最新版本。

### 更多智能体

[设置 → 更多智能体](/settings?s=agents)：Gemini CLI、Grok Build、OpenCode、Goose 以及其他支持 ACP 的智能体。详见[智能体、账户和模型](/guide/agents-models)。

- [**你的智能体**](/settings?s=agents&find=Your%20agents)：显示在 Claude Code 和 Codex 旁边的智能体。
- [**添加你自己的**](/settings?s=agents&find=Add%20your%20own)：任何支持 ACP 的智能体（通过其命令）。
- [**支持 ACP 的智能体**](/settings?s=agents&find=Agents%20that%20speak%20ACP)：Gemini CLI、OpenCode、Qwen Code、Goose 和 Grok Build，可随时添加。

### 模型

[设置 → 模型](/settings?s=models)：Custom（应用自带的智能体）的模型：通过 Claude Code 和 Codex 使用你的 Claude 和 ChatGPT 套餐、这台电脑上的模型，以及云端的 OpenRouter 或其他提供商。详见[智能体、账户和模型](/guide/agents-models)。

- [**辅助模型**](/settings?s=models&find=Helper%20model)：在会话之外处理小任务的模型。
- [**档位**](/settings?s=models&find=Tiers)：快速、标准、最佳和最高在每个程序中对应的模型：会话由最佳或最高档位主导，它的子智能体使用标准和快速档位。
- [**主智能体带领子智能体**](/settings?s=models&find=Lead%20with%20subagents)：会话的主智能体负责规划，把明确的部分交给更便宜档位的子智能体，并检查它们的工作。
- [**难题用最高档位**](/settings?s=models&find=Max%20for%20hard%20problems)：使用“自动”时，当问题超出最佳档位的能力，主智能体可以自己升到最高档位。
- [**你的订阅**](/settings?s=models&find=Your%20subscriptions)：你的 Claude 和 ChatGPT 套餐中的模型，Custom 可以通过 Claude Code 和 Codex 使用。
- [**在本机**](/settings?s=models&find=On%20this%20machine)：安装在这里的模型及其下载。
- [**从 Hugging Face 添加模型**](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face)：为这台电脑推荐的模型，或者搜索，看看每一个在这里运行得如何，然后安装它。
- [**OpenRouter**](/settings?s=models&find=OpenRouter)：通过 OpenRouter 使用的模型，用你的密钥。
- [**运行时和端点**](/settings?s=models&find=Runtimes%20and%20endpoints)：Ollama、vLLM 及其他兼容 OpenAI 的端点。
- [**Hugging Face 令牌**](/settings?s=models&find=Hugging%20Face%20token)：仅用于受限或私有模型。

### 智能体准则

[设置 → 智能体准则](/settings?s=guidelines)：每个智能体都遵循的内容：适用于所有会话、某个项目或单个会话。详见[智能体准则](/guide/guidelines)。

- [**适用于所有会话**](/settings?s=guidelines&find=For%20every%20session)：每个智能体在每个会话中都遵循的内容。
- [**适用于某个项目**](/settings?s=guidelines&find=For%20a%20project)：项目中的会话所遵循的准则。
- [**适用于单个会话**](/settings?s=guidelines&find=For%20one%20session)：单个会话的准则，可在开始页或会话菜单中设置。
- [**指令文件**](/settings?s=guidelines&find=Instruction%20files)：CLAUDE.md 和 AGENTS.md，由 Claude Code 和 Codex 自行读取。

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
- [**推荐合适的技能**](/settings?s=skills&find=Suggest%20skills%20that%20fit)：新会话的智能体会得知哪些技能适合它的第一条消息。
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
- [**周视图**](/settings?s=tasks&find=Week%20view)：所有自己运行的工作，按周显示：运行过什么，接下来运行什么。
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
- [**CI 医生**](/settings?s=tasks&find=CI%20doctor)：现成的定时任务。
- [**议题分诊**](/settings?s=tasks&find=Issue%20triage)：现成的定时任务。
- [**依赖园丁**](/settings?s=tasks&find=Dependency%20gardener)：现成的定时任务。
- [**故障第一响应人**](/settings?s=tasks&find=Incident%20first%20responder)：现成的定时任务。
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
- [**在已登录的网站上发送前先询问**](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites)：在智能体于已登录的网站上发送、发布、删除或转账之前。
- [**书签**](/settings?s=browser&find=Bookmarks)：你自己的，加上这台电脑上其他浏览器的。
- [**扩展程序**](/settings?s=browser&find=Extensions)：Chrome 扩展程序，在桌面应用中使用。
- [**浏览器设置**](/settings?s=browser&find=Browser%20settings)：Home page, search engine, search shortcuts, page zoom, spell checking, translation, dark pages, ad blocker with its filter lists, languages and sites where ads are allowed, history and clearing what it kept。

### 电脑操控

[设置 → 电脑操控](/settings?s=computer)：智能体能看到你的屏幕，并使用鼠标和键盘，仅限桌面应用。详见[搜索和浏览器](/guide/web)。

- [**电脑操控**](/settings?s=computer&find=Computer%20use)：智能体能看到屏幕，并在任何应用中使用鼠标和键盘（网站的事它们仍交给浏览器）。每个会话都会先问你。
- [**辅助功能**](/settings?s=computer&find=Accessibility)：macOS 允许 Hydor 使用鼠标和键盘的权限。
- [**屏幕录制**](/settings?s=computer&find=Screen%20Recording)：macOS 允许 Hydor 查看屏幕的权限。

### 记忆

[设置 → 记忆](/settings?s=memory)：智能体记住的关于你、你的项目和每个会话的内容，以及记录时间。详见[记忆](/guide/memory)。

- [**记忆**](/settings?s=memory&find=Memory)：智能体开始时会带上之前会话记下的内容，并在你要求时保存笔记。
- [**Wiki 记忆**](/settings?s=memory&find=Wiki%20memory)：智能体为每个项目根据其文档和工作保存的文章：对每个项目都开启，除非项目自己的设置另有规定。
- [**从新文档中学习**](/settings?s=memory&find=Learn%20from%20new%20documents)：新添加和修改的文档会添加记忆笔记，并用辅助模型更新 wiki。
- [**最多读入 wiki 的文档数**](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki)：文档多于此数时，项目的 wiki 会读取其中置顶的、最常用的和最新的：智能体会搜索全部文档。
- [**Wiki 文件夹**](/settings?s=memory&find=Wiki%20folder)：共享 wiki 保存的位置，以及下面没有另行设置时项目 wiki 保存的位置。
- [**项目 Wiki**](/settings?s=memory&find=Project%20wikis)：每个项目的 wiki 保存在哪里：保存在 wiki 文件夹中，或保存在每个项目的文件夹中。
- [**每个项目内的文件夹**](/settings?s=memory&find=Folder%20inside%20each%20project)：每个项目在自己的文件夹里的什么位置保存 wiki。
- [**不纳入 Git**](/settings?s=memory&find=Leave%20it%20out%20of%20Git)：把项目的 wiki 文件夹加入它的 .gitignore，仅限 Git 仓库。
- [**按含义搜索**](/settings?s=memory&find=Search%20by%20meaning)：按含义查找笔记，以及此搜索中的任何内容。
- [**每个智能体开始时获得的笔记**](/settings?s=memory&find=Notes%20each%20agent%20starts%20with)：除了你的档案：最多这么多条与你的请求相关的笔记，以及其余笔记的标题。
- [**自动整理**](/settings?s=memory&find=Tidy%20up%20automatically)：大约每天一次，有新内容之后：合并内容相同的笔记，归纳相关笔记并为它们加上标题。
- [**从对话中学习**](/settings?s=memory&find=Learn%20from%20conversations)：随整理一起：更正对话表明有误的笔记，核验未核验的笔记，留下几件新事。
- [**立即整理**](/settings?s=memory&find=Tidy%20up%20now)：立即整理记忆。
- [**你的档案**](/settings?s=memory&find=Your%20profile)：每个智能体在会话开始时获得的关于你的信息；智能体会让它保持最新。
- [**档案长度**](/settings?s=memory&find=Profile%20length)：你的档案最多可有的词数；超出时，辅助模型会把它缩短。
- [**备注**](/settings?s=memory&find=Notes)：所有已保存的笔记，按位置分类。
- [**添加笔记**](/settings?s=memory&find=Add%20a%20note)：写一条笔记让智能体记住，关于你或某个项目。
- [**已删除的笔记**](/settings?s=memory&find=Deleted%20notes)：最近 30 天内删除的笔记，可以恢复。
- [**导入…**](/settings?s=memory&find=Bring%20in%E2%80%A6)：把其他助手对你的了解变成笔记，也包括你在其中做的技能：Claude Code、Codex、其他智能体，或 ChatGPT、Claude 的导出文件。
- [**导出**](/settings?s=memory&find=Export)：把所有笔记导出为便于阅读的 Markdown，或含更改历史的 JSON。
- [**全部清除…**](/settings?s=memory&find=Clear%20all%E2%80%A6)：删除所有笔记及其历史记录。

### 子智能体

[设置 → 子智能体](/settings?s=children)：智能体把部分工作交给子智能体，以及用集群攻克难题。详见[深度研究、第二意见和多个智能体](/guide/research)。

- [**每个会话同时工作的数量**](/settings?s=children&find=Working%20at%20once%2C%20per%20session)：一个会话同时运行的 Hydor 子智能体数量。
- [**集群规模**](/settings?s=children&find=Swarm%20size)：一个集群或战役中同时工作的智能体数量。

### 目标

[设置 → 目标](/settings?s=goals)：新目标的起始设置：轮数、向你询问的频率，以及何时按它自己的选择继续。详见[目标](/guide/goals)。

- [**目标最多可运行的轮数**](/settings?s=goals&find=Rounds%20a%20goal%20may%20run)：新目标在达到上限而停止前可运行的轮数，除非智能体提议更少，或你在认可时修改。
- [**目标向你询问的频率**](/settings?s=goals&find=How%20much%20a%20goal%20asks%20you)：新目标是自行推进、在转折点询问，还是每一轮都询问。
- [**等待多久后按它自己的选择继续**](/settings?s=goals&find=Goes%20on%20with%20its%20own%20pick%20after)：新目标在询问问题后，等待你回答多久才按它自己的选择继续；0 表示一直等你。

### 图片、视频和音频

[设置 → 图片、视频和音频](/settings?s=images)：智能体通过 OpenRouter 为你做的图片、视频、音乐和语音，以及由谁来写它们的说明。详见[文档、图片、视频和语音](/guide/documents-voice)。

- [**图片生成**](/settings?s=images&find=Making%20images)：允许智能体生成图片。
- [**用于大多数图片（最佳）**](/settings?s=images&find=For%20most%20pictures%20%28Best%29)：生成大多数图片、并负责每次修改图片的模型。
- [**用于简单图片（快速）**](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)：更便宜、更快的模型，用于图标、背景、纹理和简单图片。
- [**这台电脑上的图片工具**](/settings?s=images&find=Picture%20tools%20on%20this%20computer)：在这里去掉图片背景、擦除其中一部分或把它放大：免费，你的图片也留在这台电脑上。
- [**视频生成**](/settings?s=images&find=Making%20videos)：允许智能体生成视频。
- [**视频模型**](/settings?s=images&find=Video%20model)：生成视频的模型。
- [**用显卡生成视频**](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)：有显卡时用显卡生成编辑后的视频：更快，处理器也能空出来。
- [**音频生成**](/settings?s=images&find=Making%20audio)：允许智能体生成音频。
- [**音乐模型**](/settings?s=images&find=Music%20model)：生成音乐的模型。
- [**语音和声音模型**](/settings?s=images&find=Voice%20and%20sound%20model)：生成语音和声音的模型。
- [**为保留的内容写说明**](/settings?s=images&find=Captions%20for%20what%20you%20keep)：为你保存的图片、视频和音频撰写标题和说明的模型。

### 语音

[设置 → 语音](/settings?s=voice)：口述消息，并让回复朗读出来。详见[文档、图片、视频和语音](/guide/documents-voice)。

- [**听写**](/settings?s=voice&find=Dictation)：说出消息，不用打字。
- [**你说的语言**](/settings?s=voice&find=Language%20you%20speak)：听写所识别的语言。
- [**服务器端语音识别**](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)：在这台电脑上或通过某个服务识别语音。
- [**朗读**](/settings?s=voice&find=Read%20aloud)：朗读回复。

### 词语建议

[设置 → 词语建议](/settings?s=suggest)：以灰色显示你正在输入的词的其余部分和下一个词，由会从你的写作中学习的小模型生成。详见[文档、图片、视频和语音](/guide/documents-voice)。

- [**词语建议**](/settings?s=suggest&find=Word%20suggestions)：你正在输入的词的其余部分和下一个词，以灰色显示在光标后，由在这台电脑上运行的模型生成；首次使用会下载约 1.3 GB。
- [**在此浏览器中显示**](/settings?s=suggest&find=Show%20in%20this%20browser)：此浏览器是否显示词语建议（每个浏览器各自保存设置）。
- [**语言模型**](/settings?s=suggest&find=Language%20model)：在小模型之外加用 Qwen3.5：电脑内存足够时自动使用、始终使用，或从不使用。
- [**语言模型大小**](/settings?s=suggest&find=Language%20model%20size)：8 位（更好）或 4 位（更小，稍差）的语言模型。
- [**显示前的把握程度**](/settings?s=suggest&find=How%20sure%20before%20showing)：建议需要多确定才会显示：显示更多，或显示更少但更常猜对。
- [**显示下一个词**](/settings?s=suggest&find=Show%20the%20next%20word)：同时显示其后的一个词，颜色更淡。
- [**重置数字**](/settings?s=suggest&find=Reset%20the%20numbers)：从零开始重新统计节省的按键次数和正确的建议数。
- [**在消息框中**](/settings?s=suggest&find=In%20message%20boxes)：在你给智能体写消息的输入框中给出建议。
- [**在文档中**](/settings?s=suggest&find=In%20documents)：在文档中写作时给出建议。
- [**在备注中**](/settings?s=suggest&find=In%20notes)：在备注中给出建议。
- [**在其他文本框中**](/settings?s=suggest&find=In%20other%20text%20boxes)：在你输入的其他位置给出建议：追问、队列、之前的提示词、询问面板。
- [**你输入的词数**](/settings?s=suggest&find=Words%20of%20what%20you%20typed)：它会读取你在光标前输入的多少个词。
- [**回复或文档的词数**](/settings?s=suggest&find=Words%20of%20the%20reply%20or%20document)：它会读取智能体上一条回复，或段落之前文档中的多少个词。
- [**按语言选择**](/settings?s=suggest&find=Choose%20by%20language)：根据你写作的语言，选择表现最好的模型。
- [**从对话中学习**](/settings?s=suggest&find=Learn%20from%20the%20conversation)：输入消息时，使用对话中之前出现过的词。
- [**Threads**](/settings?s=suggest&find=Threads)：用于建议的处理器线程数（默认自动）。
- [**从我写的内容中学习**](/settings?s=suggest&find=Learn%20from%20what%20I%20write)：小模型会在这台电脑上于后台从你的写作中学习。
- [**学习时间**](/settings?s=suggest&find=When%20it%20learns)：每晚、每周，或仅在你点击“立即重新训练”时；会等到你已有十分钟没有输入。
- [**来自我的消息**](/settings?s=suggest&find=From%20my%20messages)：从你发给智能体的消息中学习。
- [**来自智能体的回复**](/settings?s=suggest&find=From%20agents'%20replies)：从智能体给你的回复中学习。
- [**来自我的备注**](/settings?s=suggest&find=From%20my%20notes)：从你写的记忆笔记中学习。
- [**来自我的文档**](/settings?s=suggest&find=From%20my%20documents)：从你写的文档和页面中学习。
- [**我自己输入的词的权重**](/settings?s=suggest&find=Weight%20of%20my%20own%20words)：你输入的词比它学习的其余内容重要多少。
- [**用于学习的线程数**](/settings?s=suggest&find=Threads%20for%20learning)：用于学习的处理器线程数（默认自动）。
- [**在显卡上学习**](/settings?s=suggest&find=Learn%20on%20the%20graphics%20card)：有空闲的 NVIDIA 显卡或搭载 Apple 芯片的 Mac 时，会在其上学习，比在处理器上快很多倍。
- [**立即重新训练**](/settings?s=suggest&find=Retrain%20now)：现在在后台学习你自上次以来写的内容。
- [**忘记已学内容**](/settings?s=suggest&find=Forget%20what%20it%20learned)：删除从你的写作中学习的模型；改回使用应用自带的模型。

### 你的智能体

[设置 → 你的智能体](/settings?s=assistants)：任务文件夹的位置，以及任务完成后的清理；你的智能体本身在“智能体”页面上。详见[智能体](/guide/agents)。

- [**你的智能体**](/settings?s=assistants&find=Your%20agents)：你的智能体在“智能体”页面上。
- [**任务完成后清理**](/settings?s=assistants&find=Clean%20up%20after%20a%20task)：智能体会删除过程中创建且不再需要的内容。
- [**任务文件夹**](/settings?s=assistants&find=Task%20folders)：新任务文件夹的位置，用于未选文件夹而开始的会话。

### 应用

[设置 → 应用](/settings?s=apps)：应用对你了解什么，以及哪些无需询问就能运行。详见[应用](/guide/apps)。

- [**关于你**](/settings?s=apps&find=About%20you)：应用从哪里开始提问，这样就不用每次都问。
- [**无需询问直接运行**](/settings?s=apps&find=Run%20without%20asking)：智能体无需先询问就为你运行的应用；移除某个应用后会再次询问。

### Custom

[设置 → Custom](/settings?s=custom)：自动模式和用于运行命令的沙盒。详见[Custom，Hydor 自带的智能体](/guide/custom)。

- [**自动模式**](/settings?s=custom&find=Auto%20mode)：Custom 会自行批准安全的步骤。
- [**命令沙盒**](/settings?s=custom&find=Sandbox%20for%20commands)：自动模式的命令在沙盒中运行；完全访问不使用沙盒。

## 问问智能体

- “在哪里更改智能体工作时 Enter 键的作用？”
- “打开通知提示音。”
- “给我看看我的搜索设置。”
- “把辅助模型设为最便宜的那个。”
- “为新会话关闭记忆。”
