# Look, language and updates

How the app looks and behaves for you, and how it keeps itself up to date: dark or light mode, the built-in themes and your own, the language, what Enter does while an agent works, starting with the computer, updates and release notes. It also covers your password, signing out, and where the app keeps its data.

![Settings → General: the themes](images/app.webp)

## Pick dark, light or your device's mode

Open [Settings → App → General](/settings?s=general&find=Theme). The **Theme** section has a switch at its top:

- **Dark**: always a dark theme.
- **Light**: always a light theme.
- **System**: follows your device, a dark theme when it is set to dark (at night, say) and a light one otherwise.

The mode is kept in this browser, so your phone and your computer can differ. The search box (Ctrl+K, ⌘K on a Mac) has **Switch between light and dark**, which turns the mode to light or dark at once.

## Choose a theme

Under the switch, the themes show as small pictures of the app in their colours, in two rows: **Dark** and **Light**. Four come with the app:

- **Naget Dark**: warm near-black with a gold accent. The dark theme at first.
- **Midnight**: a cool blue-black with a periwinkle accent.
- **Naget Light**: warm off-white with a deep gold accent. The light theme at first.
- **Sage**: a cool green-grey paper with a deep teal accent.

Click a theme to use it. It becomes the theme for its mode, and the mode switches to it (unless the mode is **System**: then it shows whenever your device is in that mode). Each mode keeps its own pick, so you can have Midnight at night and Sage by day. With **System** on, the rows say which one is "showing now". Typing a theme's name in the search box finds it too, and picking it switches to it.

Each picture has a menu (⋯, shown when you point at it on a computer):

- **Make a copy to edit**: opens the theme editor with a copy of it.
- **Copy to share**: copies the theme as text, to import elsewhere.
- **Edit** and **Delete**: only for themes you made. Deleting asks first, and devices using it go back to the Naget theme.

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

To give a theme to someone, or to another Naget Agent of yours:

1. In the theme's menu (⋯), choose **Copy to share** (or **Copy** in the editor). The theme is copied as a short piece of text.
2. Send that text.

To add a theme you were given:

1. Click [**Import**](/settings?s=general&find=Import) under the theme pictures.
2. Paste the text into **Import a theme** and click **Add theme**.

The theme is added to your own and used at once. If the text isn't a theme, the app says "That is not a theme" and asks for what **Copy to share** gave you.

## Change the language

[Settings → App → General → Language](/settings?s=general&find=Language) shows the app in:

- **English**
- **中文（简体）** (Chinese, Simplified)
- **Ελληνικά** (Greek)

Picking one reloads the page in that language. The choice is kept in this browser; at first the app follows your browser's language when it has it, and English otherwise.

Only the app's own words change. What people and agents wrote stays as it was: conversations, files, code and terminals.

Agents write to you in the language you pick: they are asked to, unless you write to them in another language or ask for one, and code, commands and file names stay as they are. This reaches each agent when it starts or resumes. The app tells agents its language each time it opens, so if your devices are set to different languages, agents follow the one opened last.

## Decide what Enter does while an agent works

[**Sending while an agent works**](/settings?s=general&find=Sending%20while%20an%20agent%20works) decides what happens when you send a message while the agent is in the middle of a turn:

- **Join the turn** (at first): Enter adds your message to the turn in progress, so the agent takes it into account right away. Ctrl+Enter (⌘Enter on a Mac) waits for the turn to end instead.
- **Wait for it**: Enter puts your message in the queue, and it goes out when the turn ends. Ctrl+Enter (⌘Enter on a Mac) adds it to the turn in progress instead.

The choice is kept in this browser. More about the queue in [Sessions](/guide/sessions).

## Turn terminal suggestions on or off

[**Terminal suggestions**](/settings?s=general&find=Terminal%20suggestions) (on at first) shows grey text after the cursor in the app's terminals with the likeliest rest of the command; → takes it. Turning it off hides the grey text only: Ctrl+Space still lists suggestions. It is kept in this browser. See [Grey suggestions](/guide/files-git#grey-suggestions).

## Resume sessions after a usage limit

[**Resume after usage limits**](/settings?s=general&find=Resume%20after%20usage%20limits) (off at first): when a turn stops because a plan's usage ran out, the session continues by itself a minute after the limit resets. It is kept by the app, so it works with no browser open. More in [Usage, limits and costs](/guide/usage).

## Delete inactive sessions

The app keeps every session, whatever the agent's own program does (see [Every session is kept](/guide/usage#every-session-is-kept)), until nobody has used it for a long time. [**Delete inactive sessions**](/settings?s=general&find=Delete%20inactive%20sessions) (on at first) deletes sessions inactive for **1 year**, a few hundred a day at most.

- Pick how long a session may stay inactive in the menu beside the switch: **After 3 months**, **After 6 months**, **After 1 year**, **After 2 years** or **After 5 years**.
- Turn the switch off to keep every session for good.
- A session counts as inactive from the last time anything happened in it.
- Some sessions always stay: pinned ones, and ones that are at work, waiting for you, have messages queued, are snoozed, are due to resume after a limit, run in VS Code or a terminal, or have an open pull request.
- A deleted session leaves the list and its conversation is gone, but its numbers stay in [Activity](/stats).

It is kept by the app, so it works with no browser open.

## Start the app when the computer starts

[**Start when this computer starts**](/settings?s=general&find=Start%20when%20this%20computer%20starts) brings the app back after the computer restarts, and after a crash. It is on at first: the installer sets the app up as a service, and a copy started by hand from a git clone sets one up the first time it runs. What the switch can do depends on how the app runs, and the line under it says which:

- **As a service of your user** (the usual install): the switch turns it on or off. It starts at boot even before anyone logs in; if the line says it starts only once you log in, run `sudo loginctl enable-linger $USER` once on the computer to change that.
- **As a system service**: changing it needs administrator rights on the computer.
- **In Docker**: its restart policy brings it back (`restart: unless-stopped`), and the switch can't change it.
- **Started some other way**: turning it on sets it up as a service of your user. Where that isn't possible (no systemd for your user), the line says so.

## Keep the app up to date

For a copy installed from git (the installer's, or Docker's), the app looks for a newer version a few minutes after it starts and then once a day. **About**, at the bottom of [Settings → App → General](/settings?s=general&find=Check%20now), shows the version you run and how things stand:

- "Up to date · checked … ago", with **Check now** to look again at once.
- When a newer version is out: "… updates out", the latest change's title, and **Update now**. It gets the new version, builds it and restarts the app; running agents carry on through the restart, and this tab reloads into the new version by itself. If the app can't restart itself, it gets and builds the new version, and you restart the app to use it.
- While it updates: "Getting the new version…", "Installing packages…", "Building…", then "Restarting, this page reconnects by itself…".
- For a week afterwards, how the last update went: when it updated (and from which version to which), or why it failed.

When a newer version is out, a dot shows on **Settings** in the sidebar. A copy not installed from git can't check: **Check now** says so.

[**Update automatically**](/settings?s=general&find=Update%20automatically) (on at first) installs a newer version by itself after 5 hours without a message from you, at most once a day. Running agents carry on. It needs an app that can restart itself (the installer's service, or Docker); otherwise the switch is off and says why.

Other pages open on your devices notice when the app has a newer version than they run, and offer **Reload** ("Naget Agent was updated").

## Read the release notes

Every version has release notes: what changed for the people using it.

- In **About** at the bottom of [Settings → App → General](/settings?s=general), click **Release notes** beside the version.
- Or type "release notes" or "what's new" in the search box.

The notes list every version, newest first, each with its date; the one you run is marked "This version", and Settings opens the notes there.

Once after the app updates, a note in the corner says "Updated to Naget Agent …" with **What's new**, which opens the notes at that version. Each browser shows it once, and a browser's first visit doesn't.

## Take the tour

The welcome tour asks what you want to use (Claude Code, Codex, models through OpenRouter, models on this computer, other agents), sets each of those up on pages that fill the screen, then shows you around the app part by part. It opens by itself the first time you use the app.

To take it again: [Settings → App → General → Welcome tour → **Take the tour**](/settings?s=general&find=Take%20the%20tour), **Take the tour** in the search box, or **Take the tour** at the top of **Help** in the sidebar. More in [Getting started](/guide/start).

## Change your password

The app has one password, chosen when it was installed. To change it, open [Settings → App → Password](/settings?s=security&find=Change%20password):

1. Type your **Current password**.
2. Type the **New password** (at least 10 characters) and **Repeat new password**.
3. Click **Change password**.

Changing it signs out every other browser: phones, other computers, everywhere but this one. If the current password is wrong, or the two new ones differ, nothing changes and the app says why.

If you have forgotten it, run this on the computer the app runs on, in the app's folder: `node dist/server/cli.js set-password` (with Docker: `docker compose exec -it naget-agent node dist/server/cli.js set-password`). Every browser is signed out.

## Sign out of this browser

[Settings → App → Password → Sign out of this browser](/settings?s=security&find=Sign%20out%20of%20this%20browser) → **Sign out** signs this browser out, and only this one. You need the password to come back.

## Where the app keeps its data

The app keeps its own data in one folder, its data folder: `~/.naget-agent` in your home folder (`~/.web-agent` on installs from before version 0.5, or wherever the `DATA_DIR` setting points). Files you delete on the Files page go to the trash in it; **Trash**, among the Files page's places, says where. It holds:

- the password, as a hash (the password itself is never stored);
- the database with the session list, search, settings and the app's other records;
- logs of the agents running now;
- attachments waiting to be sent (the app's copies are deleted after 14 days, and kept under 2 GB in all);
- the trash of the Files page;
- notebook kernels and the private server the terminals run in;
- once search by meaning is on, its private Python environment.

Conversations themselves stay where the agents write them, `~/.claude/projects` for Claude Code and `~/.codex/sessions` for Codex: the app reads them there (**About** in Settings → General says so). With Docker, all of this lives in the container's `/home/node`, kept in its data volume.

### What each browser keeps

Some choices belong to the browser you make them in, so each device can differ:

- the mode (dark, light or system) and which dark and light theme show;
- the language;
- what Enter does while an agent works;
- terminal suggestions, the notification sound, and whether this device gets notifications;
- the Files page's folder, open files, recent files, and how folders show (a list or tiles, and their order); pinned folders are kept on the server, the same on every device;
- files marked **Viewed** when reviewing a branch;
- whether the "What's new" note was shown.

The rest is kept by the app and is the same on every device: themes you made, **Resume after usage limits**, **Delete inactive sessions**, **Start when this computer starts**, **Update automatically**, and whether the tour was taken.

## Ask an agent

- "Make me a dark theme with a deep green background and an orange accent."
- "Delete my theme called Test."
- "Is there a newer version of Naget Agent? What changed in it?"
- "Turn off automatic updates."
- "Make sure the app starts when this computer starts."
- "Turn on resuming sessions after usage limits."
