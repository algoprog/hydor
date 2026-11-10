# Every setting

Every section of Settings and what is in it, in the order the app shows them, with a link to each and to the part of this guide that explains it. Use it to find where something is set; the topics explain how to use it.

## How Settings is laid out

Open **Settings** from the sidebar. On a computer, Settings has three tabs at the top: **App** (the app itself), **Agents** (the agents and what they read) and **Capabilities** (what the app adds to every agent: search, the browser, memory and the rest). Each tab lists its sections on the left, and the open section fills the page. On a phone, Settings lists every section in one list; tap one to open it, and the arrow at the top to go back.

You don’t have to know where an option lives: type what you want in the search box (Ctrl+K, ⌘K on a Mac), such as "dark mode" or "notifications", and pick it. The app opens the right section and points at the option. You can also ask any agent to change a setting for you ([Let agents work the app for you](/guide/ask-agents)).

## App

### General

[Settings → General](/settings?s=general): theme, and what Enter does while an agent works. More in [Look, language and updates](/guide/app).

- [**Theme**](/settings?s=general&find=Theme): Dark, light, or following your device; or a theme of your own.
- [**New theme**](/settings?s=general&find=New%20theme): Make a theme of your own from any of them.
- [**Import**](/settings?s=general&find=Import): Add a theme someone shared.
- [**Language**](/settings?s=general&find=Language): The language the app is shown in, and agents write in.
- [**Sending while an agent works**](/settings?s=general&find=Sending%20while%20an%20agent%20works): Enter joins the running turn, or waits for it to end.
- [**Terminal suggestions**](/settings?s=general&find=Terminal%20suggestions): Grey completions after the cursor in terminals.
- [**Resume after usage limits**](/settings?s=general&find=Resume%20after%20usage%20limits): Continues a session a minute after a plan’s limit resets.
- [**Delete inactive sessions**](/settings?s=general&find=Delete%20inactive%20sessions): Deletes sessions nobody used for a year, or as long as you choose; until then every conversation is kept.
- [**Limit each session**](/settings?s=general&find=Limit%20each%20session): The most memory and processors one session’s programs may use.
- [**Start when this computer starts**](/settings?s=general&find=Start%20when%20this%20computer%20starts): Starts the app when the computer starts.
- [**Update automatically**](/settings?s=general&find=Update%20automatically): Installs new versions by itself: the desktop apps as soon as they are out, after a minute’s notice; a copy from git when you have not used it for a while.
- [**Take the tour**](/settings?s=general&find=Take%20the%20tour): See what each part of the app does.
- [**Tips**](/settings?s=general&find=Tips): Points out a part of the app the first time you come to it, after the welcome tour.
- [**Check now**](/settings?s=general&find=Check%20now): Look for a newer version now.

### Notifications

[Settings → Notifications](/settings?s=notifications): when a session finishes, fails or needs your answer. More in [Inbox and notifications](/guide/inbox).

- [**Notify this device**](/settings?s=notifications&find=Notify%20this%20device): A notice when a session finishes, fails or needs your answer, even with the app closed.
- [**Sound**](/settings?s=notifications&find=Sound): A short chime with each notice while the app is open.
- [**Send a test**](/settings?s=notifications&find=Send%20a%20test): Send a notice to this device now.

### Chat apps

[Settings → Chat apps](/settings?s=chat): talk to your agents from Telegram, Discord or Slack: start sessions, get their replies, answer what they ask. More in [Phones, other machines and sharing](/guide/devices).

- [**Telegram**](/settings?s=chat&find=Telegram): A Telegram bot of your own, made with @BotFather, that your chats talk to.
- [**Discord**](/settings?s=chat&find=Discord): A Discord bot of your own, made in the Developer Portal, that your chats talk to.
- [**Slack**](/settings?s=chat&find=Slack): A Slack app of your own, made from a manifest, that your chats talk to.
- [**Link a chat**](/settings?s=chat&find=Link%20a%20chat): Lets a Telegram, Discord or Slack chat use your agents, with a code that works once.
- [**Add the bot to a server**](/settings?s=chat&find=Add%20the%20bot%20to%20a%20server): The link that adds your Discord bot to a server of yours, with the permissions it needs.
- [**Copy manifest**](/settings?s=chat&find=Copy%20manifest): The Slack app’s manifest, with Socket Mode and the scopes it needs, to paste when you create the app.
- [**New sessions use**](/settings?s=chat&find=New%20sessions%20use): The agent a message from a chat starts when the chat is in no session.
- [**Notices from every session**](/settings?s=chat&find=Notices%20from%20every%20session): Every session’s notices in your chats, not only those of the sessions a chat started.

### Password

[Settings → Password](/settings?s=security): the password for this app, and signing out. More in [Look, language and updates](/guide/app).

- [**Change password**](/settings?s=security&find=Change%20password): Changing it signs out every other browser.
- [**Sign out of this browser**](/settings?s=security&find=Sign%20out%20of%20this%20browser): You need the password to come back.

### Signatures

[Settings → Signatures](/settings?s=signatures): your signature and initials, drawn once and kept encrypted, for the documents you sign. More in [Library: pages, images, videos and sites](/guide/library).

- [**New signature**](/settings?s=signatures&find=New%20signature): Draw, type or upload your signature or initials.

### Source control

[Settings → Source control](/settings?s=scm): GitHub and Gitea accounts for opening pull requests. More in [Phones, other machines and sharing](/guide/devices).

- [**Add an account**](/settings?s=scm&find=Add%20an%20account): An account to open pull requests with.

### Connect other agents

[Settings → Connect other agents](/settings?s=connect): let agents elsewhere start and steer sessions here, through this app’s MCP server. More in [Phones, other machines and sharing](/guide/devices).

- [**New token**](/settings?s=connect&find=New%20token): A token for an agent elsewhere to start and steer sessions here.
- [**What they can do**](/settings?s=connect&find=What%20they%20can%20do): The tools an agent with a token gets.

### Machines

[Settings → Machines](/settings?s=machines): other machines running Hydor, to use from here, and access to this one. More in [Phones, other machines and sharing](/guide/devices).

- [**Add a machine**](/settings?s=machines&find=Add%20a%20machine): Another machine running Hydor, to use from here.
- [**Access from other machines**](/settings?s=machines&find=Access%20from%20other%20machines): Tokens other machines use to reach this one.

## Agents

### Accounts

[Settings → Accounts](/settings?s=accounts): the Claude Code and Codex sign-ins every session uses. More in [Agents, accounts and models](/guide/agents-models).

- [**Your accounts**](/settings?s=accounts&find=Your%20accounts): The Claude Code and Codex sign-ins sessions use, and more you add.
- [**Switch accounts at a limit**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit): A session that runs out of usage carries on with another account.
- [**Use API credit at a limit**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit): When every Claude Code account is at its limit, sessions carry on billed to an Anthropic API key.
- [**Agent programs**](/settings?s=accounts&find=Agent%20programs): Which agent programs are installed, and installing the others.
- [**Update automatically**](/settings?s=accounts&find=Update%20automatically): Keeps Claude Code, Codex and the other agent programs at their newest version.

### More agents

[Settings → More agents](/settings?s=agents): Gemini CLI, OpenCode, Qwen Code, Goose and other agents that speak ACP. More in [Agents, accounts and models](/guide/agents-models).

- [**Your agents**](/settings?s=agents&find=Your%20agents): Agents that show next to Claude Code and Codex.
- [**Add your own**](/settings?s=agents&find=Add%20your%20own): Any agent that speaks ACP, by its command.
- [**Agents that speak ACP**](/settings?s=agents&find=Agents%20that%20speak%20ACP): Gemini CLI, OpenCode, Qwen Code and Goose, ready to add.

### Models

[Settings → Models](/settings?s=models): models for Custom, the app’s own agent: OpenRouter, Ollama, and Hugging Face models run here with vLLM. More in [Agents, accounts and models](/guide/agents-models).

- [**Helper model**](/settings?s=models&find=Helper%20model): The model for small jobs beside sessions.
- [**Tiers**](/settings?s=models&find=Tiers): The model Quick, Standard, Best and Max mean for each program: a session leads on Best or Max, and its helpers get Standard and Quick.
- [**Lead with helpers**](/settings?s=models&find=Lead%20with%20helpers): A session’s main agent plans, hands clear parts to helpers on cheaper tiers and checks their work.
- [**Max for hard problems**](/settings?s=models&find=Max%20for%20hard%20problems): Automatic starts a hard problem on Max, and an agent may move itself there when a problem proves harder than it looked.
- [**On this machine**](/settings?s=models&find=On%20this%20machine): Models installed here, and their downloads.
- [**Add a model from Hugging Face**](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face): The ones suggested for this computer, or search, see how each would run here, and install it.
- [**OpenRouter**](/settings?s=models&find=OpenRouter): Models through OpenRouter, with your key.
- [**Runtimes and endpoints**](/settings?s=models&find=Runtimes%20and%20endpoints): Ollama, vLLM and other OpenAI-compatible endpoints.
- [**Hugging Face token**](/settings?s=models&find=Hugging%20Face%20token): Only for gated or private models.

### Agent Guidelines

[Settings → Agent Guidelines](/settings?s=guidelines): what every agent follows: in every session, in a project, or in one session. More in [Agent Guidelines](/guide/guidelines).

- [**For every session**](/settings?s=guidelines&find=For%20every%20session): What every agent follows, in every session.
- [**For a project**](/settings?s=guidelines&find=For%20a%20project): Guidelines the sessions in a project follow.
- [**For one session**](/settings?s=guidelines&find=For%20one%20session): Guidelines for one session, from the start page or the session’s menu.
- [**Files Claude Code and Codex read too**](/settings?s=guidelines&find=Files%20Claude%20Code%20and%20Codex%20read%20too): CLAUDE.md and AGENTS.md, which Claude Code and Codex read on their own.

### MCP servers

[Settings → MCP servers](/settings?s=mcp): tools the agents can call. More in [Connected apps, keys and tools](/guide/connections).

- [**Add server**](/settings?s=mcp&find=Add%20server): A tool server for Claude Code or Codex.
- [**Check connections**](/settings?s=mcp&find=Check%20connections): See whether each MCP server answers.

### Skills

[Settings → Skills](/settings?s=skills): written methods agents load when a task calls for one: built in, yours, from plugins and the agents’ own. More in [Skills](/guide/skills).

- [**New skill**](/settings?s=skills&find=New%20skill): Write a skill for every agent, or for Claude Code or Codex alone.
- [**Built in**](/settings?s=skills&find=Built%20in): The skills that come with the app.
- [**Yours**](/settings?s=skills&find=Yours): Skills you wrote, or approved when an agent suggested them.
- [**From plugins**](/settings?s=skills&find=From%20plugins): Skills your plugins bring.
- [**Claude Code and Codex**](/settings?s=skills&find=Claude%20Code%20and%20Codex): The agents’ own skills, which only they get.
- [**Suggest skills that fit**](/settings?s=skills&find=Suggest%20skills%20that%20fit): A new session’s agent hears which skills fit its first message.
- [**Bring skills in by keywords**](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords): Keywords in a message load skills by themselves.
- [**Make my own version**](/settings?s=skills&find=Make%20my%20own%20version): Change a built-in skill: your version takes its place.

### Plugins

[Settings → Plugins](/settings?s=plugins): add-ons that bring skills, tools and instructions to every agent. More in [Connected apps, keys and tools](/guide/connections).

- [**Your plugins**](/settings?s=plugins&find=Your%20plugins): The plugins you added, on or off for every agent.
- [**Come with the app**](/settings?s=plugins&find=Come%20with%20the%20app): Plugins that come with the app, ready to add.
- [**Make a plugin**](/settings?s=plugins&find=Make%20a%20plugin): Bundle skills, tools, instructions and files of your own as a plugin.
- [**From a link**](/settings?s=plugins&find=From%20a%20link): Add a plugin from GitHub or another Git address.
- [**From a .zip file**](/settings?s=plugins&find=From%20a%20.zip%20file): Add a plugin someone packed into a .zip.
- [**Pack into a .zip**](/settings?s=plugins&find=Pack%20into%20a%20.zip): A plugin as one file to share.
- [**Claude Code**](/settings?s=plugins&find=Claude%20Code): Claude Code’s own plugins and marketplaces.
- [**Codex**](/settings?s=plugins&find=Codex): Codex’s own plugins and marketplaces.

### Scheduled tasks

[Settings → Scheduled tasks](/settings?s=tasks): agent work that starts by itself: on a schedule, once, or when a webhook calls. More in [Scheduled tasks](/guide/tasks).

- [**New task**](/settings?s=tasks&find=New%20task): Agent work that starts by itself.
- [**Start from an example**](/settings?s=tasks&find=Start%20from%20an%20example): Ready-made scheduled tasks.
- [**Morning brief**](/settings?s=tasks&find=Morning%20brief): A ready-made scheduled task.
- [**News on a topic**](/settings?s=tasks&find=News%20on%20a%20topic): A ready-made scheduled task.
- [**Price watch**](/settings?s=tasks&find=Price%20watch): A ready-made scheduled task.
- [**Page change alert**](/settings?s=tasks&find=Page%20change%20alert): A ready-made scheduled task.
- [**Weekly report from a folder**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): A ready-made scheduled task.
- [**Inbox digest**](/settings?s=tasks&find=Inbox%20digest): A ready-made scheduled task.
- [**Habit check-in**](/settings?s=tasks&find=Habit%20check-in): A ready-made scheduled task.
- [**New releases**](/settings?s=tasks&find=New%20releases): A ready-made scheduled task.
- [**Site up check**](/settings?s=tasks&find=Site%20up%20check): A ready-made scheduled task.
- [**Disk space alert**](/settings?s=tasks&find=Disk%20space%20alert): A ready-made scheduled task.
- [**Review new pull requests**](/settings?s=tasks&find=Review%20new%20pull%20requests): A ready-made scheduled task.
- [**CI doctor**](/settings?s=tasks&find=CI%20doctor): A ready-made scheduled task.
- [**Issue triage**](/settings?s=tasks&find=Issue%20triage): A ready-made scheduled task.
- [**Dependency gardener**](/settings?s=tasks&find=Dependency%20gardener): A ready-made scheduled task.
- [**Incident first responder**](/settings?s=tasks&find=Incident%20first%20responder): A ready-made scheduled task.
- [**New files in a folder**](/settings?s=tasks&find=New%20files%20in%20a%20folder): A ready-made scheduled task.
- [**Reminder**](/settings?s=tasks&find=Reminder): A ready-made scheduled task.

## Capabilities

### Search

[Settings → Search](/settings?s=search): how agents search the web: Naget Search and other providers. More in [Search and the browser](/guide/web).

- [**Providers**](/settings?s=search&find=Providers): Which search providers agents use, and in what order.
- [**Naget Search**](/settings?s=search&find=Naget%20Search): The app’s own web search.
- [**SearXNG**](/settings?s=search&find=SearXNG): A search engine you run yourself.
- [**Brave Search**](/settings?s=search&find=Brave%20Search): Web search with a Brave key.
- [**DuckDuckGo**](/settings?s=search&find=DuckDuckGo): Web search without a key.
- [**Results per search**](/settings?s=search&find=Results%20per%20search): How many results a search gives.

### Browser

[Settings → Browser](/settings?s=browser): a web browser agents use, which you can watch and take over. More in [Search and the browser](/guide/web).

- [**A browser for agents**](/settings?s=browser&find=A%20browser%20for%20agents): Agents open sites, click, type and read pages.
- [**Chromium**](/settings?s=browser&find=Chromium): Which Chromium the browser runs.
- [**Show a window**](/settings?s=browser&find=Show%20a%20window): Run the browser in a window you can see.
- [**Keep pages off this machine and its network**](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network): Sites on this computer and its network stay off limits.
- [**Screenshots for models that see images**](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images): Models that see images get screenshots of the page.
- [**Sites**](/settings?s=browser&find=Sites): Only these sites, or never these.
- [**Profiles**](/settings?s=browser&find=Profiles): Separate sign-ins for the browser.

### Computer use

[Settings → Computer use](/settings?s=computer): agents see your screen and use the mouse and keyboard, in the desktop app. More in [Search and the browser](/guide/web).

- [**Let agents use this computer**](/settings?s=computer&find=Let%20agents%20use%20this%20computer): Agents see the screen and use the mouse and keyboard, in any app (for websites they keep to the browser). Each session asks you first.
- [**Accessibility**](/settings?s=computer&find=Accessibility): macOS’s permission for Hydor to use the mouse and keyboard.
- [**Screen Recording**](/settings?s=computer&find=Screen%20Recording): macOS’s permission for Hydor to see the screen.

### Memory

[Settings → Memory](/settings?s=memory): what agents remember about you, your projects and each session, and when it was written. More in [Memory](/guide/memory).

- [**Memory**](/settings?s=memory&find=Memory): Agents start with what earlier sessions kept, and save notes when you ask.
- [**Search by meaning**](/settings?s=memory&find=Search%20by%20meaning): Finds notes, and anything in this search, by what it means.
- [**Notes each agent starts with**](/settings?s=memory&find=Notes%20each%20agent%20starts%20with): Besides your profile: at most this many notes that bear on what you ask, and the titles of the rest.
- [**Tidy up automatically**](/settings?s=memory&find=Tidy%20up%20automatically): About once a day, after something new: merges notes that say the same thing, sums related ones up and titles them.
- [**Learn from conversations**](/settings?s=memory&find=Learn%20from%20conversations): With the tidy-up: corrects notes the conversations show wrong, checks the unchecked, keeps a few new things.
- [**Tidy up now**](/settings?s=memory&find=Tidy%20up%20now): Tidies memory up at once.
- [**Your profile**](/settings?s=memory&find=Your%20profile): What every agent gets about you at the start of a session; agents keep it current.
- [**Profile length**](/settings?s=memory&find=Profile%20length): The most words your profile may have; longer, the helper model shortens it.
- [**Notes**](/settings?s=memory&find=Notes): Every note kept, by place.
- [**Add a note**](/settings?s=memory&find=Add%20a%20note): Write a note for agents to remember, about you or a project.
- [**Deleted notes**](/settings?s=memory&find=Deleted%20notes): Notes deleted in the last 30 days, to restore.
- [**Bring in…**](/settings?s=memory&find=Bring%20in%E2%80%A6): Notes from what other assistants know about you: Claude Code, Codex, Hermes, OpenClaw, or a ChatGPT or Claude export.
- [**Export**](/settings?s=memory&find=Export): Every note as Markdown to read, or as JSON with histories.
- [**Clear all…**](/settings?s=memory&find=Clear%20all%E2%80%A6): Deletes every note and its history.

### Child sessions

[Settings → Child sessions](/settings?s=children): agents handing parts of a job to other agents, and swarms for hard problems. More in [Deep research, second opinions and several agents](/guide/research).

- [**Working at once, per session**](/settings?s=children&find=Working%20at%20once%2C%20per%20session): How many child sessions one session runs at once.
- [**Swarm size**](/settings?s=children&find=Swarm%20size): How many agents of a swarm or campaign work at once.

### Images, video and audio

[Settings → Images, video and audio](/settings?s=images): pictures, videos, music and voices agents make for you through OpenRouter, and who writes their captions in the Library. More in [Documents, images, videos and voice](/guide/documents-voice).

- [**Making images**](/settings?s=images&find=Making%20images): Let agents make images.
- [**For most pictures (Best)**](/settings?s=images&find=For%20most%20pictures%20%28Best%29): The model that makes most pictures, and every change to one.
- [**For simple pictures (Quick)**](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29): A cheaper, quicker model for icons, backgrounds, textures and simple pictures.
- [**Picture tools on this computer**](/settings?s=images&find=Picture%20tools%20on%20this%20computer): Take a picture’s background out, erase part of it, or make it larger, here: free, and your pictures stay on this computer.
- [**Making videos**](/settings?s=images&find=Making%20videos): Let agents make videos.
- [**Video model**](/settings?s=images&find=Video%20model): The model that makes videos.
- [**Use the graphics card for videos**](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos): Make edited videos on the graphics card when there is one: faster, the processor free.
- [**Making audio**](/settings?s=images&find=Making%20audio): Let agents make audio.
- [**Music model**](/settings?s=images&find=Music%20model): The model that makes music.
- [**Voice and sound model**](/settings?s=images&find=Voice%20and%20sound%20model): The model that makes voices and sounds.
- [**Captions in the Library**](/settings?s=images&find=Captions%20in%20the%20Library): The model that writes the titles and descriptions of the images, videos and audio you keep.

### Voice

[Settings → Voice](/settings?s=voice): dictate messages, and have replies read aloud. More in [Documents, images, videos and voice](/guide/documents-voice).

- [**Dictation**](/settings?s=voice&find=Dictation): Speak a message instead of typing it.
- [**Language you speak**](/settings?s=voice&find=Language%20you%20speak): The language dictation listens for.
- [**Speech recognition on the server**](/settings?s=voice&find=Speech%20recognition%20on%20the%20server): Recognize speech on this computer or with a service.
- [**Read aloud**](/settings?s=voice&find=Read%20aloud): Have replies read aloud.

### Your agents

[Settings → Your agents](/settings?s=assistants): where task folders go, and cleaning up after a task; your agents themselves are on the Agents page. More in [Agents](/guide/agents).

- [**Open Agents**](/settings?s=assistants&find=Open%20Agents): Your agents are on the Agents page.
- [**Clean up after a task**](/settings?s=assistants&find=Clean%20up%20after%20a%20task): Agents remove what they made along the way and no longer need.
- [**Task folders**](/settings?s=assistants&find=Task%20folders): Where new task folders go, for sessions started without a folder.

### Custom

[Settings → Custom](/settings?s=custom): auto mode, a sandbox for commands, and how long goals run. More in [Custom, the app's own agent](/guide/custom).

- [**Auto mode**](/settings?s=custom&find=Auto%20mode): Custom approves safe steps by itself.
- [**Sandbox for commands**](/settings?s=custom&find=Sandbox%20for%20commands): Auto mode commands run in a sandbox; Full access runs without it.
- [**Goals**](/settings?s=custom&find=Goals): How many rounds a goal may run.

## Ask an agent

- "Where do I change what Enter does while an agent works?"
- "Turn on the notification sound."
- "Show me my search settings."
- "Set the helper model to the cheapest one."
- "Turn off memory for new sessions."
