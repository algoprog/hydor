# Look, language and updates

How the app looks and behaves for you, and how it keeps itself up to date: dark or light mode, the built-in themes and your own, the language, how much of the app moves, what Enter does while an agent works, starting with the computer, keeping it awake while agents work, updates and release notes. It also covers your password, signing out, and where the app keeps its data.

![Settings → General: the themes](images/app.webp)

## Pick dark, light or your device's mode

Open [Settings → App → General](/settings?s=general&find=Appearance). The **Appearance** group has a switch beside its title:

- **Dark**: always a dark theme.
- **Light**: always a light theme.
- **System**: follows your device, a dark theme when it is set to dark (at night, say) and a light one otherwise.

The mode is kept in this browser, so your phone and your computer can differ. The search box (Ctrl+K, ⌘K on a Mac) has **Switch between light and dark**, which turns the mode to light or dark at once.

## Choose a theme

Under the title, in the group's box, the themes show as small pictures of the app in their colours, in two rows: **Dark** and **Light**. Four come with the app:

- **Hydor Dark**: pure black behind your sessions, cool blue-black panels and a periwinkle accent. The dark theme at first.
- **Midnight**: pure black behind your sessions, warm near-black panels and a gold accent.
- **Hydor Light**: warm off-white with a deep gold accent. The light theme at first.
- **Sage**: a cool green-grey paper with a deep teal accent.

Click a theme to use it. It becomes the theme for its mode, and the mode switches to it (unless the mode is **System**: then it shows whenever your device is in that mode). Each mode keeps its own pick, so you can have Midnight at night and Sage by day. With **System** on, the rows say which one is "showing now". Typing a theme's name in the search box finds it too, and picking it switches to it.

Each picture has a menu (⋯, shown when you point at it on a computer):

- **Make a copy to edit**: opens the theme editor with a copy of it.
- **Copy to share**: copies the theme as text, to import elsewhere.
- **Edit** and **Delete**: only for themes you made. Deleting asks first, and devices using it go back to the Hydor theme.

Which theme shows is chosen in each browser. Themes you make are kept by the app and offered on every device you use.

## Make your own theme

1. Click [**New theme**](/settings?s=general&find=New%20theme) under the pictures. The editor opens with a copy of the theme showing now, named "My theme" (or use **Make a copy to edit** on any theme).
2. Name it, and pick **Dark** or **Light** as its base. The base sets the colours of code and the colours programs print in the terminal, and fills in any colour the theme leaves out.
3. Change any colour: click its swatch to pick one, or type a hex code such as `#1e3a2f`.
4. Click **Save theme**. The app uses it straight away.

While you edit, the whole app shows your changes, so you see each colour where it is used. Nothing is kept until you save: **Cancel**, ✕ (**Close without saving**) or Esc put the theme you had back. **Copy** copies the theme as text, like **Copy to share**. The editor is a panel on the right on a computer, and a sheet from the bottom on a phone.

You can have up to 40 themes of your own; **New theme** and **Import** turn grey at that point.

### The colours you can set

- **Backgrounds**: Page (behind everything), Sidebar, Cards (the message box, settings cards, panels), Menus and dialogs, Fields (inputs and quiet fills), Hover (rows under the pointer, chips), Selected (the open row, secondary buttons).
- **Text**: Text, Secondary text, Muted text (hints, times, labels).
- **Borders**: Borders, Strong borders (inputs and outlined buttons).
- **Accent**: Accent (main buttons, links, focus, selection), Text on accent.
- **Status**: Working; Needs you, warnings; Done, added lines; Failed, removed lines; Information.
- **Agents**: Claude, Codex.
- **Code and terminal**: Code blocks, Terminal background, Terminal text.

A text colour that gets hard to read on the backgrounds it sits on shows a warning, "hard to read", with its contrast (for example 2.8:1). 4.5:1 reads well, or 3:1 for muted text.

## Share a theme or import one

To give a theme to someone, or to another Hydor of yours:

1. In the theme's menu (⋯), choose **Copy to share** (or **Copy** in the editor). The theme is copied as a short piece of text.
2. Send that text.

To add a theme you were given:

1. Click [**Import**](/settings?s=general&find=Import) under the theme pictures.
2. Paste the text into **Import a theme** and click **Add theme**.

The theme is added to your own and used at once. If the text isn't a theme, the app says "That is not a theme" and asks for what **Copy to share** gave you.

## Change the language

[Settings → App → General → Appearance → Language](/settings?s=general&find=Language) is a menu with the languages the app is shown in:

- **English**
- **Deutsch** (German)
- **中文（简体）** (Chinese, Simplified)
- **Ελληνικά** (Greek)

Picking one reloads the page in that language. The choice is kept in this browser; at first the app follows your browser's language when it has it, and English otherwise.

Only the app's own words change, and dates and times are written the way that language writes them. What people and agents wrote stays as it was: conversations, memory notes, the names and descriptions you gave things, files, code and terminals.

Agents write to you in the language you pick: they are asked to, unless you write to them in another language or ask for one, and code, commands and file names stay as they are. This reaches each agent when it starts or resumes. Notifications come in the language too, on your phone as well. The app tells agents its language each time it opens, so if your devices are set to different languages, agents and notifications follow the one opened last.

## Choose how much moves

[Settings → App → General → Appearance → Motion](/settings?s=general&find=Motion) decides how much of the app moves on this device:

- **Full** (at first): all of it. A button dips a little while you press it and springs back, a copy turns into a check that draws itself, a switch springs, the rail's bar glides to the page you opened, a session's dot changes with its status (a ring spreads when work finishes, two pulses when it needs you), lists glide to their new places and close up where something went, numbers count to their new values, the Inbox badge pops, the logo's water rises once when a session finishes, pictures shimmer until they arrive, and a step that finishes draws its check. Four more things move as you open something: the sidebar slides as you hide or show it, the column beside a page (the Browser's right column, the Files page's **Ask an agent** panel) slides in and out, pages cross-fade as you go from one to another (not to or from the Browser), and the light and dark looks blend as you switch themes.
- **Calm**: all of that except the last four. Nothing slides or fades as you open a page.
- **Off**: none of it. Only work in progress keeps moving: the water in the Ω while something loads, and the dots of sessions at work.

Each motion lasts about a tenth to a quarter of a second, never holds back what you open, and never repeats except work in progress. Your device's **Reduce motion** setting always wins: with it on, the app acts as if **Off** were picked, whatever it says here. The choice is kept in this browser. On a phone the slides and cross-fades don't play.

## Decide what Enter does while an agent works

In the **Sessions** group, [**Sending while an agent works**](/settings?s=general&find=Sending%20while%20an%20agent%20works) decides what happens when you send a message while the agent is in the middle of a turn:

- **Join the turn** (at first): Enter adds your message to the turn in progress, so the agent takes it into account right away. Ctrl+Enter (⌘Enter on a Mac) waits for the turn to end instead.
- **Wait for it**: Enter puts your message in the queue, and it goes out when the turn ends. Ctrl+Enter (⌘Enter on a Mac) adds it to the turn in progress instead.

The choice is kept in this browser. More about the queue in [Sessions](/guide/sessions).

## Turn terminal suggestions on or off

In the **Terminals** group, [**Terminal suggestions**](/settings?s=general&find=Terminal%20suggestions) (on at first) shows grey text after the cursor in the app's terminals with the likeliest rest of the command; → takes it. Turning it off hides the grey text only: Ctrl+Space still lists suggestions. It is kept in this browser. See [Grey suggestions](/guide/files-git#grey-suggestions).

## Resume sessions after a usage limit

[**Resume after usage limits**](/settings?s=general&find=Resume%20after%20usage%20limits) (off at first): when a turn stops because a plan's usage ran out, the session continues by itself a minute after the limit resets. It is kept by the app, so it works with no browser open. More in [Usage, limits and costs](/guide/usage).

## Delete inactive sessions

The app keeps every session, whatever the agent's own program does (see [Every session is kept](/guide/usage#every-session-is-kept)), until nobody has used it for a long time. [**Delete inactive sessions**](/settings?s=general&find=Delete%20inactive%20sessions) (on at first) deletes sessions inactive for **1 year**, a few hundred a day at most.

- Pick how long a session may stay inactive in the menu beside the switch in its row: **After 3 months**, **After 6 months**, **After 1 year**, **After 2 years** or **After 5 years**.
- Turn the switch off to keep every session for good.
- A session counts as inactive from the last time anything happened in it.
- Some sessions always stay: pinned ones, and ones that are at work, waiting for you, have messages queued, are snoozed, are due to resume after a limit, run in VS Code or a terminal, or have an open pull request.
- A deleted session leaves the list and its conversation is gone, but its numbers stay in [Activity](/stats).

It is kept by the app, so it works with no browser open.

## Limit each session

[**Limit each session**](/settings?s=general&find=Limit%20each%20session) caps what one session may use: its agent's program and everything it runs (commands, the servers it starts). Pick the memory (**2 GB of memory** up to **16 GB of memory**, or **No memory limit**) and the processors (**1 processor** up to **8 processors**, or **No processor limit**).

- Limits hold from the next time a session's agent starts; sessions already running keep the ones they started with.
- Over its memory, the program that asked for more is stopped, not the app and not another session: the agent sees its command end and can go on. The session's Info and System → Monitor say so: "one stopped at its memory limit".
- At its processors, the session's programs run slower, and the rest of the computer stays free.
- Limits work on Linux, through your user's systemd: each session runs in a scope of its own. Elsewhere, or with no user systemd running, the menus are off and the row's (i) says why; what each session uses still shows in [Monitor](/system/monitor).

## Start the app when the computer starts

In the **Startup and updates** group, [**Start when this computer starts**](/settings?s=general&find=Start%20when%20this%20computer%20starts) brings the app back after the computer restarts, and after a crash. It is on at first: the installer sets the app up as a service, and a copy started by hand from a git clone sets one up the first time it runs. What the switch can do depends on how the app runs, and the line under it (and its (i)) says which:

- **As a service of your user** (the usual install): the switch turns it on or off. It starts at boot even before anyone logs in; if the line says it starts only once you log in, run `sudo loginctl enable-linger $USER` once on the computer to change that.
- **As a system service**: changing it needs administrator rights on the computer.
- **In Docker**: its restart policy brings it back (`restart: unless-stopped`), and the switch can't change it.
- **In a desktop app**: it opens in the background when you log in, with its icon in the menu bar (on Windows in the notification area of the taskbar, on Linux in the system tray) and its window closed. It is on from the first time you open it (the Mac app from the Applications folder).
- **Started some other way**: turning it on sets it up as a service of your user. Where that isn't possible (no systemd for your user), the line says so.

While the app loads, in a browser or while a desktop app starts, its logo shows with water rising in the Ω. As soon as the app is ready it is there under the logo, which fades away as the water drains from the Ω and the screen around it clears. You can click and type straight away. If your device asks for reduced motion, the logo simply goes.

## Keep the computer awake

In the desktop apps (Mac, Windows and Linux), [**Keep the computer awake**](/settings?s=general&find=Keep%20the%20computer%20awake), under **Start when this computer starts**, stops the computer from going to sleep by itself while there is work to do: a long run isn't cut off halfway, and a task set for 7:00 runs at 7:00 rather than when you next open the lid. It has three choices:

- **While agents work and before scheduled tasks** (the default): while any agent works on this computer (scheduled runs, app runs, subagents and running experiments count too), and from a few minutes before a scheduled task, one of your agents' schedules or an app's schedule is due until its run has started.
- **While agents work**: only while agents work. A scheduled task runs when the computer is awake.
- **Never**: the computer sleeps as its own settings say.

A session waiting for your answer doesn't count as working. Watchers that look every few minutes (see [Watch for a change](/guide/tasks#watch-for-a-change)) don't keep the computer awake on their own: only the run a change starts does, while it works. Only what runs on this computer counts, not what runs on your other machines. The line under the option says when the computer is kept awake now, and why ("Awake now: agents are working"); a few seconds after the work ends it may sleep again.

Only the computer is kept running: the screen can still turn off as usual. Closing a laptop's lid still puts it to sleep, and so does choosing Sleep yourself: the operating system decides that, not the app. A computer that is already asleep doesn't wake up for a task; the run starts as soon as it is awake again. For work that must run at any hour, use a computer that stays on, such as a desktop or a server, and reach it from your laptop or phone (see [Use other machines from one app](/guide/devices#use-other-machines-from-one-app) and [Reach the app from another device](/guide/devices#reach-the-app-from-another-device)).

The option shows only in the desktop apps. The app installed as a service (or in Docker) leaves the computer's sleep alone.

## Keep the app up to date

A copy installed from git (the installer's, or Docker's) looks for a newer version a few minutes after it starts and then once a day; the desktop apps look a minute after they open and then every 4 hours. The version row, the last row of **Startup and updates** in [Settings → App → General](/settings?s=general&find=Check%20now), is named after the version you run (**Hydor …**) and shows how things stand:

- "Up to date · checked … ago", with **Check now** to look again at once.
- When a newer version is out: "… updates out", the latest change's title, and **Update now**. It gets the new version, builds it and restarts the app; running agents carry on through the restart, and this tab reloads into the new version by itself. If the app can't restart itself, it gets and builds the new version, and you restart the app to use it.
- While it updates: "Getting the new version…", "Installing packages…", "Building…", then "Restarting, this page reconnects by itself…".
- For a week afterwards, how the last update went: when it updated (and from which version to which), or why it failed.

When a newer version is out, a dot shows on **Settings** on the rail. A copy not installed from git can't check: **Check now** says so. The row's (i) says where sessions run and where their history comes from.

[**Update automatically**](/settings?s=general&find=Update%20automatically) (on at first, the row above the version) installs a newer version by itself: a copy installed from git after 5 hours without a message from you, at most once a day; the desktop apps as soon as one is out, after a minute's notice (the Linux .deb asks for your password first). Running agents carry on. It needs an app that can restart itself (the installer's service, Docker, or a desktop app that can replace itself, such as the Mac app in the Applications folder); otherwise the switch is off and says why.

Other pages open on your devices notice when the app has a newer version than they run, and offer **Reload** ("Hydor was updated"). A page that fails to draw shows "This page stopped working", what went wrong and **Reload**, instead of an empty window; the sidebar stays, and moving to another page tries again.

### Update an older copy by hand

Hydor's history on GitHub was rewritten in version 0.78.0, and a copy installed from git or Docker before then can't update itself past it: **Update now** stops with "Not possible to fast-forward, aborting.", and so does updating that machine from another machine's app (see [Use other machines from one app](/guide/devices#use-other-machines-from-one-app)), whose page then says what to do. Update it once on that machine itself, in the way it was installed; from then on it updates by itself again.

- **With the installer**: run it again there. It moves the copy to the new history (files you changed in it stay), builds it and restarts the service, and running agents carry on: `curl -fsSL https://raw.githubusercontent.com/algoprog/hydor/main/install.sh | bash`. If you installed it in a folder of your own choosing, give that folder: `curl -fsSL https://raw.githubusercontent.com/algoprog/hydor/main/install.sh | HYDOR_DIR=/that/folder bash`.
- **In Docker**: get the new image and start the container again from it, in the folder with your `compose.yaml`: `docker compose pull && docker compose up -d` (or `docker pull algoprog/hydor` and run it as you did before). What the app keeps is in its volume, so nothing is lost. If you build the image yourself, first update your clone as in the next point, then `docker compose up -d --build`.
- **From a git clone of your own**: in its folder, `git fetch && git reset --keep @{u} && npm ci && npm run build`, then start the app again. `git reset --keep` keeps the files you changed and stops before it would overwrite one. If you made commits of your own, move them onto the new history with `git rebase --onto` instead.

Newer copies handle a rewritten history by themselves: when the copy has no commits of its own, **Update now** moves it to the new history, keeping the files you changed; when it has some, it says so and leaves them as they are.

### Updates in the desktop apps

The desktop apps (Mac, Windows and Linux) go by released versions instead. With [**Update automatically**](/settings?s=general&find=Update%20automatically) on, it downloads a new version as soon as it is out and checks that it is the build the release names, without waiting for you to be away. Then it tells you, in two places:

- A notification: "Hydor … is ready", restarting in a minute to install it. Clicking it opens the app; its **Restart Now** button installs the new version at once.
- A note in the corner of every open page of the app that counts down the seconds ("Restarting in 42 s to install it"), with **Restart now** and **Later**.

When the minute is up, the app restarts into the new version: running agents carry on, and its window comes back by itself. **Later** puts it off for 4 hours, when the notification and the note come back. Until then, **Restart to Update to …** in the menu of the app's icon (in the menu bar, the notification area or the system tray, and in the app's own menu) installs it whenever you like, and so does **Restart now** in the version row, which says "Version … is ready to install" and when it asks again.

With **Update automatically** off, nothing downloads by itself: the version row says "Version … is out", and **Update now** downloads it, checks it and opens it in place of the one you run ("Downloading the new version…", then "Opening the new version, this page reconnects by itself…").

A download that breaks off carries on from where it stopped: when the computer goes to sleep, or the connection drops or goes quiet for a minute, it picks up again as soon as it can. If it still gets no further after a couple of minutes, it keeps what it has, the line under the version row says how far it got, and it tries again an hour later, carrying on from there; so does **Update now**.

On Windows, the new version's installer runs without its window, installs over the app and opens it again. The Linux .deb asks for your password to install: a version that downloaded by itself waits, and **Restart to Update** (or **Restart now**) asks for the password and opens the new version.

If the new version of the Mac app or an AppImage does not start, the version before comes back by itself and the line under the version row says why; that version then installs only when you press **Update now**. The Mac app can update itself only from the Applications folder (or another folder you can write to): opened from the disk image, it says to move it there. An AppImage likewise needs a folder you can write to, such as your home folder.

## Read the release notes

Every version has release notes: what changed for the people using it.

- In the version row at the bottom of **Startup and updates** in [Settings → App → General](/settings?s=general), click **Release notes**.
- Or type "release notes" or "what's new" in the search box.

The notes list every version, newest first, each with its date; the one you run is marked "This version", and Settings opens the notes there.

Once after the app updates, a note in the corner says "Updated to Hydor …" with **What's new**, which opens the notes at that version. Each browser shows it once, and a browser's first visit doesn't.

## Take the tour

The welcome tour is made for people new to AI. It opens with a short film of a request being done (you ask in your own words, the agent works step by step, the result is ready), then asks what should do the work: **Claude** or **ChatGPT** (with the plan you already pay for), **Pay as you go** (models from every company through OpenRouter), **Free, on this computer** (models that run here), or **Other agents**. It sets each one you pick up on pages that fill the screen, each with its picture and its words in the same place and nothing to scroll: signing in, adding your OpenRouter key and picking the models for your agent, then the models that make pictures, music, voices and videos, or installing one of the models suggested for this computer with one click. The picture beside each page shows what you picked as streams flowing into a pool around the Ω, which fills as you pick more; small dots at the bottom show where you are, over a sea whose waves drift gently. When another agent's folder is on this computer (Claude Code, Codex or another), one more page, **Coming from another agent?**, names what it found and opens [Bring in](/guide/memory#bring-in-from-other-assistants) over the tour; with none of them here, there is no such page. In the desktop app, when Hydor finds other browsers on this computer, the next page, **Bring in your bookmarks and history?**, says "Hydor has a browser of its own. Bring in what the browsers on this computer know, so your sites are a click away and the address bar suggests them. It all stays on this computer." It has two switches, **Bookmarks** and **History** (both on), then each browser (and each of its profiles) with how many bookmarks and pages of history it has, and **Import** beside it, which brings in what is switched on: the bookmarks into a new folder at the end of the bookmarks bar, "Imported from Chrome", as in [Bring in bookmarks](/guide/web#bring-in-bookmarks), and the history as in [History](/guide/web#history). It shows **Brought in** once done, and a problem (Safari's permission, a locked file) on that browser's row, with **Import** there to try again. **Next** goes on without importing. With no other browser found, or outside the desktop app, there is no such page. Then it shows you around the app part by part, with something to try on the way: a first task you can put in the message box with one click. Its step **Hear when it’s done** turns on notifications for this device; in a desktop app, **Turn on notifications** shows a test notification, or, when your system isn't showing Hydor's notifications yet, opens its settings where you allow them (on a Mac, System Settings at Hydor's notifications) and checks again when you come back. In a desktop app, the next step asks **Use it on your phone too?**: **Set it up** ends the tour at [Settings → App → Use on your phone](/settings?s=phone), to reach the app from your phone privately with Tailscale, and **Not now** goes on. It opens by itself the first time you use the app.

To take it again: [Settings → App → General → Help → Welcome tour → **Take the tour**](/settings?s=general&find=Take%20the%20tour), **Take the tour** in the search box, or **Take the tour** at the top of **Help** on the rail. More in [Getting started](/guide/start).

After the tour, tips show you the rest of the app as you come to it. The first time a part of the app is on your screen (the inbox, a session's menu, the Git page, **Settings → Memory**…), a small card beside it says what it is for, and **Learn more** opens this guide where it says more. Tips come one at a time and a while apart, never while you type or have a menu open.

- **Got it**, or using the part it points at, puts a tip away for good, on every device.
- **Skip tips** stops them all, on every device. **Skip the tour** on the tour's first page does too; closing the tour with ✕ leaves them on.
- Separately, the first time you pick a mode that costs several times what one agent does (**Swarm**, **Campaign**, **Deep research** or **Arena**), a dialog explains what it is for and what it costs before it is on. It shows once for each mode, on every device, whether tips are on or not; ask an agent to show the tips again and it comes back too.
- To turn them on or off again: [Settings → App → General → Help → **Tips**](/settings?s=general&find=Tips).

## Change your password

The app has one password, chosen when it was installed. To change it, open [Settings → App → Password](/settings?s=security&find=Change%20password) and click **Change…** in the **Change password** row. A dialog opens:

1. Type your **Current password**.
2. Type the **New password** (at least 10 characters) and **Repeat new password**.
3. Click **Change password** (it stays grey until the current password is typed and the new one has 10 characters).

Changing it signs out every other browser: phones, other computers, everywhere but this one. If the current password is wrong, or the two new ones differ, nothing changes and the app says why.

If you have forgotten it, run this on the computer the app runs on, in the app's folder: `node dist/server/cli.js set-password` (with Docker: `docker compose exec -it hydor node dist/server/cli.js set-password`). Every browser is signed out, and addresses paused after wrong passwords can sign in again.

## Sign out of this browser

[Settings → App → Password → This browser → Sign out of this browser](/settings?s=security&find=Sign%20out%20of%20this%20browser) → **Sign out** signs this browser out, and only this one. You need the password to come back.

## Where the app keeps its data

The app keeps its own data in one folder, its data folder: `~/.hydor` in your home folder (`~/.web-agent` on installs from before version 0.5, or wherever the `DATA_DIR` setting points). Files you delete on the Files page go to the trash in it; **Trash**, among the Files page's places, says where. It holds:

- the password, as a hash (the password itself is never stored);
- the database with the session list, search, settings and the app's other records;
- logs of the agents running now;
- attachments waiting to be sent (the app's copies are deleted after 14 days, and kept under 2 GB in all);
- the trash of the Files page;
- notebook kernels and the private server the terminals run in;
- once search by meaning is on, its private Python environment.

Conversations themselves stay where the agents write them, `~/.claude/projects` for Claude Code and `~/.codex/sessions` for Codex: the app reads them there (the (i) beside the version in Settings → General says so). With Docker, all of this lives in the container's `/home/node`, kept in its data volume.

### What each browser keeps

Some choices belong to the browser you make them in, so each device can differ:

- the mode (dark, light or system) and which dark and light theme show;
- the language;
- how much moves (**Motion**);
- what Enter does while an agent works;
- terminal suggestions, the notification sound, and whether this device gets notifications;
- the Files page's folder, open files, recent files, and how folders show (a list or tiles, and their order); pinned folders are kept on the server, the same on every device;
- files marked **Viewed** when reviewing a branch;
- whether the "What's new" note was shown.

The rest is kept by the app and is the same on every device: themes you made, **Resume after usage limits**, **Delete inactive sessions**, **Start when this computer starts**, **Update automatically**, whether the tour was taken, and the tips (on or off, and which were shown).

## Ask an agent

- "Make me a dark theme with a deep green background and an orange accent."
- "Delete my theme called Test."
- "Is there a newer version of Hydor? What changed in it?"
- "Install the new version of Hydor that is waiting, now."
- "Turn off automatic updates."
- "Make sure the app starts when this computer starts."
- "Keep my computer awake only while agents work, not before scheduled tasks."
- "Turn on resuming sessions after usage limits."
- "Turn the tips back on, and show them all again from the start."
- "Set Motion to Calm." or "Turn off the animations on this device."
