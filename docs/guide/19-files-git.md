# Files, Git, Terminal and Preview

The tools around the agents: browse, open and edit the files on this computer, search inside them, run Jupyter notebooks, commit and push with Git, open pull requests and review what a branch changes. Terminals, previews of the dev servers running here and a live view of the computer (System) are here too, so you can check and finish an agent's work without leaving the app.

![Git: a project’s changes, a message for the commit, and its recent commits](images/files-git.webp)

## Open the Files page

Click **Files** in the sidebar's tools, or go to [Files](/files). On a computer the page has two parts:

- On the left, a switch between **Files** (the folder tree) and **Search** (search inside the files, see [Search inside files](/guide/files-git#search-inside-files)).
- On the right, the files you opened, each in a tab. With none open it says "No file open" and reminds you of Ctrl+P (⌘P on a Mac).

On a phone the tree fills the screen. A file opens on a page of its own, with **Back** to return to the tree.

Other ways in:

- Click the folder under a session's title, or use the session's menu (⋯) → **Folder and code** → **Browse the folder**: the tree opens at that folder.
- A file an agent changed or handed you, or a link to a file in its reply, opens in a window over the conversation, so you keep your place. **Open in Files** moves it to the Files page; ✕ or Esc closes it (if you changed it without saving, it asks "Discard your changes?" first).

## Browse folders in the tree

The tree starts at a root folder, at first the folder new sessions start in. Its path shows at the top, with `~` for your home folder.

- **Change the root**: click the path and type another. Subfolders are suggested as you type, along with folders your sessions worked in (marked "recent"); Tab takes a suggestion and goes into it. Press **Open**, or **Cancel**.
- **Up one folder** (the arrow button) moves the root to the folder above.
- A folder's menu → **Open as root** makes it the root.
- Click a folder to open or close it. The tree remembers which folders were open, for each root.
- The tree refreshes itself every 5 seconds while you look at it, so files the agents make appear on their own. **Refresh** does it at once.
- **Show dotfiles** / **Hide dotfiles** (the eye button) shows or hides files and folders whose names start with a dot. The `.github` folder always shows.

The root folder and your open tabs are kept in this browser, separately for each machine you use (see [Other machines](/guide/devices#use-other-machines-from-one-app)).

### What the letters beside files mean

Inside a git repository (a folder whose history git keeps), files with changes since the last commit carry a letter and a colour:

- **M**: changed.
- **A**: new, and already added to git.
- **U**: new, and not yet in git.
- **D**: deleted.
- **R**: renamed.
- **C**: a conflict to resolve.
- **•** on a folder: something inside it changed.

## Work with files and folders

Every row in the tree has a menu. Point at the row and click **More** (⋯), right-click it, or on a phone press and hold it. The menu holds:

- **Open** (a file) or **Open as root** (a folder).
- **New file here** and **New folder here**.
- **Upload files here** and **Upload a folder here**.
- **Open terminal here**: a new shell in that folder, in the bottom panel on a computer or on the Terminal page on a phone.
- **New agent session here**: the start page, with that folder picked.
- **Rename**.
- **Copy path**: the full path, to paste anywhere.
- **Download** (a file).
- **Delete**.

The buttons at the top of the tree do the same for the root folder: **New file**, **New folder** and **Upload files**.

### Make a file or folder

1. Click **New file** or **New folder** (or the row menu's **New file here** / **New folder here**).
2. Type the name in the field that appears in the tree and press Enter. Esc cancels.

A new file is empty and opens in the editor at once. If the name is taken, the app says so and makes nothing.

### Rename or move

- **Rename** turns the name into a field. Enter keeps the new name, Esc leaves it as it was.
- On a computer, drag a row onto another folder to move it there, or onto the empty part of the tree to move it to the root folder. A folder can't go into itself, and nothing is replaced: if the place already has something with that name, the move stops.

### Delete

**Delete** asks first, then moves the file, or the folder with everything in it, to the trash folder in the app's data folder. The question says where that is (for example `~/.naget-agent/trash`). To get something back, show dotfiles, open that folder in the tree and move it out: its name starts with the date and time it was deleted.

- Your home folder and the top folder (`/`) can't be deleted.
- Something on another disk than the app's data folder can't move to the trash, so it is deleted for good.

## Upload files and folders

- **Upload files** at the top of the tree uploads into the root folder. A row's menu has **Upload files here** and **Upload a folder here**.
- On a computer, drag files or whole folders from your desktop onto a folder in the tree, or onto the empty part of the tree to upload into the root ("Drop files or folders on a folder to upload"). Empty folders come along too.

Uploads show in the **Uploads** panel at the bottom right: how much has gone, file by file. **Cancel** stops one, and ✕ clears a finished one from the panel. Big files go up in 32 MB pieces.

Before anything is sent, the app checks for files with the same names in that folder. If some exist, the panel lists them ("3 already exist") with three choices:

- **Replace**: upload them over the existing ones.
- **Skip existing**: upload only the new ones.
- **Cancel**: upload nothing.

## Open and edit a file

Click a file in the tree. It opens in the editor, in a tab of its own. The last 12 files you opened stay as tabs: click one to go back to it, and close it with its ✕ or a middle click.

The editor numbers the lines, colours the text by the file's language, matches brackets and, on a computer, folds blocks and suggests completions as you type. Tab indents.

To save, click **Save** (it lights up once you change something) or press Ctrl+S (⌘S on a Mac). A dot beside the file's name means there are unsaved changes, and leaving the page with unsaved changes makes the browser ask first.

### The editor's tools

On a computer, the bar above the file shows its path and these buttons:

- **Preview** (Markdown files): the file as it reads, with headings, tables, its own images (from beside the file) and links to other files. Click it again to edit. Markdown files open as a preview first.
- **Show as a page** (HTML files): runs the page in a frame sealed off from the app, able to load the files next to it. HTML files open as a page first. The page's link lasts an hour; after that, open the file again.
- **Changes since the last commit**: the file's differences from its last commit, added lines in green and removed ones in red. It says "No changes" when the file matches its last commit or isn't in a git repository.
- **Word wrap**: wraps long lines instead of scrolling sideways. The choice is remembered.
- **Terminal in this folder**: a new shell in the file's folder.
- **Download**.
- **Save**.

To find text in the file, press Ctrl+F (⌘F on a Mac) while the cursor is in it: a find bar opens at the top, with replace.

On a phone the bar shows **Back**, the file's name over its folder, **Preview** or **Show as a page**, **Save** (once you change something) and **More** (⋯), which holds **Find**, **Word wrap**, **Changes since the last commit**, **Terminal in this folder** and **Download**. Phones wrap long lines unless you turn **Word wrap** off.

### When the file changes while you have it open

Agents and terminals change files all the time. Every few seconds the editor checks the file:

- With nothing unsaved, it loads the new version by itself.
- With unsaved changes of yours, a bar says "The file changed on disk since you opened it." Choose **Reload (discard mine)** to take the new version, or **Overwrite with mine** to save yours over it.

Saving never writes over a newer version without this question.

### Files the editor doesn't edit

- Files over 10 MB: "File is too large to edit here". Download it, or open it in a terminal. (Notebooks may be up to 40 MB.)
- Binary files (anything that isn't text): "Binary file". Download it to open it on your device.
- Images, PDFs, video, audio and Office documents show as previews instead, as the next section explains.

## See images, PDFs, documents and web pages

The file viewer shows files as they look:

- **Images** (PNG, JPEG, GIF, WebP, SVG, ICO, BMP, AVIF): shown whole, on a checkerboard where they are see-through.
- **PDFs**: in your browser's own PDF viewer.
- **Video** (MP4, WebM, MOV and M4V; MKV and OGV where your browser plays them): in the app's own player (see [Watch a video](#watch-a-video) below). **Audio** (MP3, WAV, OGG) plays in place.
- **Office documents**: Word (.docx, .doc and the like), Excel (.xlsx, .xls), PowerPoint (.pptx, .ppt), OpenDocument (.odt, .ods, .odp), RTF and EPUB. A switch at the top picks the view:
  - **Pages**: the document as LibreOffice lays it out, page by page ("Laying out the pages…" the first time). This view is there only when LibreOffice is installed on this computer, and not for EPUB books.
  - **Text**: its text, sheets and slides as the app reads them.

  Phones start on **Text**, which scrolls and zooms better there. If a document can't be read, it says "No preview for this file": download it instead.
- **Markdown** and **HTML**: see **Preview** and **Show as a page** above.

**Download** is always in the bar.

### Watch a video

A video opens in the app's own player, which fills the viewer:

- **Play and pause**: the round button in the middle, the button at the bottom left, a click on the picture, or Space (K works too). A double click on the picture fills the screen.
- **Move through it**: drag along the bar at the bottom, or click a point on it; resting the pointer on the bar shows the time there, and its paler part is what has loaded. ← and → move 5 seconds, J and L 10 seconds, Home and End go to the start and the end, 0 to 9 jump to that tenth of the video, and , and . step one frame while it is paused.
- **Sound**: the speaker mutes and unmutes it (M). On a computer, rest the pointer on the speaker for a volume slider; ↑ and ↓ change the volume too.
- **Speed**: the **1×** button picks from 0.5× to 2× (**Normal** is 1×).
- **Loop** plays it again from the start each time it ends, **Picture in picture** keeps it playing in a small window over everything else (where your browser has it), **Download** saves the file, and **Full screen** (F) fills the screen; the same button, or Esc, comes back.
- The controls fade while it plays and come back when you move the pointer. The player remembers your volume and speed for the next video.
- **On a phone**: tap the picture to show or hide the controls, and double-tap its left or right side to go back or forward 10 seconds. On an iPhone, full screen uses the phone's own video player.
- A video your browser can't play (MKV and AVI files often use codecs browsers don't) says "This video can’t play here", with **Download** to watch it in a video app.

## Find a file by name

Press Ctrl+P (⌘P on a Mac) on any page. "Go to file in …" searches the Files page's root folder by name: type a few letters of the name in order (`invq3` finds `invoices/q3-report.xlsx`). Files whose own name holds what you typed come first. Move with ↑ and ↓, open with Enter or a click. It lists up to 60 files, hidden ones included.

The search box (Ctrl+K, ⌘K on a Mac) finds files by name too, from the same folder, once you type two letters.

## Search inside files

Click **Search** above the tree, or go to [Search in files](/search).

1. Type what to look for in "Search in files". Results come as you type, grouped by file, each with its number of matches.
2. Click a line to open the file at that line, or a file's name to open it.

Next to the field:

- **Match case**: matches capitals exactly. Without it, a search in lower case ignores case, and one with a capital letter in it matches case.
- **Regular expression**: reads what you type as a pattern (`colou?r`) instead of plain text.

Under it, "Files to include, e.g. *.ts, !dist/**" narrows the search: patterns separated by commas, and a `!` in front leaves those files out.

The search covers the tree's root folder (the line "in …" names it); change the root to search elsewhere. It skips hidden files, files the folder's `.gitignore` leaves out and files over 4 MB. It stops at 50 matches in a file and 1,000 in all ("Showing the first 1000 matches."), or after 15 seconds, and lists the first 30 matching lines of each file.

## Run a Jupyter notebook

A notebook (`.ipynb`) opens as a notebook: its cells, each with its output. The bar at the top holds the kernel button, **Run all cells**, **Interrupt (I, I)**, **Restart the kernel (0, 0)**, **Clear all outputs**, **View the notebook file (JSON)**, **Download** and **Save**. On a phone, the less used ones are under **More**: **Restart the kernel**, **Restart and run all**, **Clear all outputs**, **View the file (JSON)** and **Download**.

### Pick where the code runs

The kernel button (a dot and a name, or "No kernel") opens **Run this notebook with**: the Python environments on this computer. It lists virtual environments named `.venv`, `venv` or `env` in the notebook's folder or the folders above it, conda environments, the system Python, and Jupyter kernels registered here (other languages too). Each shows its version, and the one the notebook asks for (or a virtual environment beside it) is marked **suggested**.

- An environment marked "needs ipykernel" has an **Install** button: it runs `pip install ipykernel` in that environment, after you confirm, and nothing else in it changes.
- Running a cell with no kernel yet starts one in the suggested environment. If that fails, the list opens so you can pick another.
- With a kernel running, the button's menu shows its state (Starting, Idle, Running, Restarting or Stopped), when it started, and **Interrupt**, **Restart** and **Shut down**. Picking another environment asks first, since the running kernel's variables are lost.

Kernels keep running after you close the notebook, and through restarts of the app: open it again and the outputs of what ran meanwhile are there. Shut one down from its menu, or from the [System](/system) page, where running kernels are listed.

### Write and run cells

A cell is **Code**, **Text** (Markdown) or **Raw**. Click a code cell to edit it, or double-click a text cell. While a cell runs it shows `[*]` and a timer; afterwards its run number, `[3]`.

- Point at a code cell and a run button takes the place of its number ("Run (Ctrl+Enter)"; while the cell runs, it interrupts the kernel). Its tools show in the corner: **Edit** (text cells), the cell type, **Move up**, **Move down**, **Add a cell below** and **Delete the cell**. On a phone, tap a cell: its tools show above it, **Run** included.
- On a computer, pointing between two cells shows **+ Code** and **+ Text**. The same two buttons sit below the last cell.
- When code asks for input (Python's `input()`), a field appears under the cell: "Type, then Enter". Passwords stay hidden.
- While you edit code, Tab after a name asks the running kernel for completions.

Outputs show text, errors in colour, images and charts, tables, HTML (in a sealed-off frame), Markdown and formulas. "Interactive widgets do not run here", and neither does JavaScript output.

### Keys

While you edit a cell:

- Shift+Enter: run it and go to the next cell (a new one after the last).
- Ctrl+Enter (⌘Enter on a Mac): run it and stay.
- Alt+Enter: run it and add a cell below.
- Esc: stop editing.

When no cell is being edited:

- Enter: edit the selected cell. ↑ / ↓ (or K / J): move between cells.
- A / B: add a cell above / below. D, D: delete the cell. Z: bring back the last deleted cell.
- M, Y, R: make the cell Text, Code or Raw.
- I, I: interrupt the kernel. 0, 0: restart it.

Ctrl+S (⌘S on a Mac) saves. As with other files, if the notebook changes on disk while you have unsaved changes, a bar offers **Reload (discard mine)** or **Overwrite with mine**. **View the notebook file (JSON)** shows the file as text in the editor; **Open as a notebook** goes back.

## See your repositories on the Git page

Click **Git** in the sidebar, or go to [Git](/git). It lists the git repositories your sessions worked in, most recently used first: those holding a session's folder or a file a session edited (throwaway places such as `/tmp` are left out). To see a repository here, start a session in it.

Each repository shows its name, its branch, how many files changed and when the last commit was made, with a badge:

- **↑ 3**: three commits to push. **↓ 2**: two commits to pull.
- **Up to date**: the branch matches the copy on the remote (the server the repository is shared through, such as GitHub).
- **Local only**: the branch isn't on the remote yet. **Detached**: not on any branch.

At the top, **Fetch all** asks every repository's remote what is new, and **Refresh** reads the list again.

Click a repository to open it. On a computer it opens beside the list; on a phone it fills the screen, with a back arrow to the list. Its page shows the name and folder, **Open a terminal here**, the branch menu, what the branch tracks ("tracks origin/main", "not on the remote yet" or "no remote") and these parts, top to bottom: **To push**, **To pull**, **Changes**, **Stashes** and **Recent commits**, then the remotes' addresses.

## Fetch, pull and push

- **Fetch** asks the remote what is new without changing your files. The line beside it says when that last happened ("Never fetched" at first). **To pull** then lists the commits waiting there.
- **Pull** (it shows the count: **Pull 2**) brings those commits in, fast-forward only: it never makes a merge commit. If your branch and the remote's have both moved on, it fails and says to merge or rebase in a terminal.
- **Push** (**Push 3**) sends your commits up, after a question that lists them. Everything on the branch that the remote lacks goes up, including commits other sessions made.
- **Publish branch** appears instead of **Push** when the branch isn't on the remote yet: it creates it there and makes it the branch's upstream (the remote branch it tracks).

When one of these fails, a red box says "… failed" with git's own message; ✕ dismisses it. A repository without a remote says so: add one in a terminal (`git remote add origin <address>`), then publish the branch from here.

The app's git never asks for a password. Pushing and pulling use this computer's SSH keys or saved git credentials, and fail with git's message if those don't work without a prompt.

## Commit changes

**Changes** lists every changed file, with what happened to it (New, Added, Modified, Deleted, Renamed, Copied, Conflict). There is no separate staging step: you tick the files that go into the commit.

- Each file has a box to tick; the box at the top ticks or unticks them all, and says how many are in ("4 of 6 in the commit"). Long lists show the first 60 files and **Show all … files**.
- Click a file to see its changes. **Open the file** opens it in the editor.
- **Discard the changes** puts a file back as it was in the last commit; for a new file it's **Delete the new file**. Both ask first and can't be undone.

To commit:

1. Tick the files.
2. Write the commit message in "Commit message", or click **Write message**: a model reads the ticked files' changes and drafts a message in the style of the repository's recent ones (Claude when Claude Code is signed in, Codex otherwise). Edit it as you like.
3. Click **Commit**, or **Commit & push** to send it to the remote straight away (that one shows only when the repository has a remote, and publishes the branch if it isn't there yet).

Only the ticked files go in, even if others were staged elsewhere.

## Switch, create and delete branches

Click the branch name (the button with the branch icon) to open the branch menu:

- **New branch from here**: type a name and click **Create**. The new branch starts from where you are, and you switch to it.
- The branches, newest first, each with when it last changed, how it stands against its remote branch and "merged" when its work is already in the current branch. Click one to switch to it. With uncommitted changes, the app asks first: the changes come along, and if they clash with that branch git refuses and nothing changes.
- A merged branch has a delete button. Only merged branches can be deleted here, so no commit is lost.

## Put changes aside with a stash

**Stash** (next to **Changes**) puts every change aside, new files included, and leaves the folder as it was at the last commit. The stash then shows under **Stashes**, with its message and when it was made:

- **Apply** brings the changes back and removes the stash from the list.
- **Drop** deletes the stash, after a question. This can't be undone.

## Look through the history

- **To push**: commits on your branch that the remote lacks (up to the latest 100).
- **To pull**: commits on the remote that you lack, as of the last fetch.
- **Recent commits**: the last 15 commits.

**To push** and **To pull** show only when the branch tracks a branch on the remote.

Click a commit to open it: its full message, author, date and the files it changed with the lines added and removed. Click a file to see its changes.

## Open a pull request from a session

A pull request asks the people who look after a repository to take a branch's changes in. You can open one on GitHub or Gitea straight from the session that made the changes.

What it needs:

- A GitHub or Gitea account in [Settings → App → Source control](/settings?s=scm) for the server the repository lives on (see [Add a GitHub or Gitea account](/guide/devices#add-a-github-or-gitea-account)).
- The session's folder is in a git repository with a remote, on a branch of its own. A session working on the main branch itself can't open one: start the session in a worktree (a separate copy of the repository on a new branch), or switch to a new branch first.

To open one:

1. In the session's menu (⋯), choose **Folder and code** → **Open a pull request**.
2. The dialog shows the branch and where it goes (`my-branch → main on owner/repo`), how many commits and files it holds, and whether the branch is pushed ("the branch is pushed when you open it" if not).
3. If there are uncommitted changes, tick **Commit the … uncommitted changes first, with the title as the message** to include them. Otherwise they stay out. (It's ticked for you when the branch has no commits yet.)
4. Write a title and a description (Markdown), or click **Write it for me**: a model reads the commits, the changes and the task the session was given, and writes both. It needs at least one commit.
5. Tick **Draft** to open it as a draft. (Gitea marks a draft with "WIP:" before the title.)
6. Click **Open pull request**. The app pushes the branch, opens the pull request, links it to the session and opens it in a new tab.

If the branch already has an open pull request, the dialog says so and offers **Link it to this session**. To link any other one, click **Link a pull request that already exists…**, paste its address and click **Link**.

### Follow a pull request

Once linked, the pull request's number shows beside the session in the sidebar and in the session's header, with an icon for its state (open, draft, merged or closed) and a dot for its checks (the tests the server runs on it: running, passed or failed). The app checks every few minutes, and tells you when it is merged or its checks finish.

Click the number in the header (or **Pull request #12** in the session's menu → **Folder and code**) for its dialog:

- **Open on GitHub** (or Gitea).
- **Review the changes**: the review page, below.
- **Check now**: asks for its state and checks at once.
- **Unlink**: takes it off the session (the pull request itself stays).

## Review what a branch changes

The review page shows everything a session's branch changes since it left its base branch, committed or not, new files included. Open it from the session's menu (⋯) → **Folder and code** → **Review the changes**, from a pull request's dialog, or from a worktree's dialog (**Review its changes**).

At the top: "Review:" and the session's title, the branch and its base, how many files and how many are "not committed", a link to the pull request if there is one, and **Session** to go back.

Each changed file shows its status letter (A added, M changed, D deleted, R renamed), its path, a "not committed" tag where that applies, the lines added and removed, and its changes below.

- Tick **Viewed** on a file you've read: it folds away and counts towards "… of … viewed". The mark lasts until the file changes again, and is kept in this browser.
- On a wide screen, a list of the files sits on the left with a progress bar: click a file to jump to it.
- **Guide me through it**: a model reads the changes and writes a short summary, an order that is easy to follow (the core idea first, then what uses it, tests and documentation last) and a note on each file about what changed and what to look at closely. Then **Guided order** and **By path** switch between that order and the files by name. The guide is kept for exactly these changes, so it is there next time until the branch changes.
- **Reload** reads the changes again.

New files git doesn't track yet are shown when they are small text files. Binary files say "A binary file: no text changes to show."

## Use the terminal

Click **Terminal** in the sidebar, or go to [Terminal](/terminal): real shells on this computer. If none is open, one starts.

- Each terminal is a tab, named after its folder and the program running in it. **New terminal** (+) opens another, in the Files page's root folder.
- Double-click a tab to rename it.
- ✕ closes a terminal. If a program is still running in it, the app asks first, since closing ends the shell and everything it runs.
- Links in the output open in a new tab.

Terminals run in the app's own private tmux server, so they keep running when you leave the page, reload it or close the browser, and through restarts of the app: come back and they're as you left them.

Other places open a new terminal in a folder: a row's menu on the Files page (**Open terminal here**), the editor (**Terminal in this folder**), a repository on the Git page (**Open a terminal here**) and the session's menu → **Folder and code** → **Open a terminal here**.

### The terminal panel

On a computer, `` Ctrl+` `` (also on a Mac) shows or hides a terminal panel at the bottom of any page, with the same terminals as the Terminal page. Drag its top edge to make it taller or shorter, and click **Hide panel** to close it. The search box's **Show or hide the terminal panel** does the same. Terminals opened from other pages appear in this panel.

### Grey suggestions

While a shell waits for a command, the likeliest rest of what you're typing shows in grey after the cursor:

- → or End takes all of it; Ctrl+→ (or Alt+→) takes the next word.
- Suggestions come from commands you typed before (those run in the same folder first, and recent and frequent ones before old ones), your shell's own history and commands agents ran lately.

Ctrl+Space (also on a Mac), or **Suggestions** in the tab bar, opens a list with more:

- earlier commands that start with what you typed;
- what fits the word you're typing: git commands and branches, the project's scripts (`npm run …`), make targets, SSH hosts, folders and files;
- once you've typed a few letters, **Write a command for "…"**, below.

↑ and ↓ choose, Enter or a click puts the command on the line, and Esc closes the list. Nothing ever runs by itself: you still press Enter in the shell.

Suggestions work only at a shell's prompt, not inside a program such as an editor or Python. Commands that start with a space, and ones that look like they hold a password or key, aren't remembered. Turn the grey text off in [Settings → App → General → Terminal suggestions](/settings?s=general&find=Terminal%20suggestions); the Ctrl+Space list works either way.

### Ask for a command in words

Type what you want in plain words at the prompt, such as `find the biggest files here`, press Ctrl+Space and pick **Write a command for "find the biggest files here"**. A model (Claude when Claude Code is signed in, Codex otherwise) writes up to three commands that fit your shell and folder, each with a short note on what it does. Pick one to put it on the line, read it, and press Enter yourself to run it.

### On a phone

The Terminal page adds a row of keys phones lack: **Ctrl** and **Alt** (they apply to the next key you type), **Suggestions**, ^C, ^D, ^Z, ^L, ^R, Esc, Tab, the arrows, `|`, `/`, `-`, `~`, Home and End. There is no bottom panel on a phone: terminals opened from other pages open on the Terminal page.

## Look at a dev server with Preview

When you or an agent run a web app's dev server here (`npm run dev`, a Python server), Preview opens it in your browser, on this computer or any other device that reaches the app. Click **Preview** in the sidebar, or go to [Preview](/preview).

- **Running here** lists the servers listening on this computer, each with its port, the program, its folder and its command. Click **Open**.
- For a server that isn't listed, type its port under **Another port** and click **Open**.

The preview opens in a tab of its own, on the app's preview address (port 8791 unless your install set another). That browser stays signed in to the preview for 12 hours, and hot reload works. Your sign-in to the app never reaches the dev server. A browser previews one server at a time: opening another moves the preview address to it. Each **Open** makes a fresh one-time link, so to look on your phone, open Preview there and click **Open**. The list refreshes every 5 seconds; **Refresh** reads it at once.

- If your browser can't reach the preview port, the page says so: on the same network or a VPN such as Tailscale or WireGuard, the port works directly; behind a tunnel or proxy, give the port a hostname of its own and start the app with `PREVIEW_ORIGIN` set to it.
- "Previews are off" means the app was started with `PREVIEW_PORT=0`.
- Preview is there only for the machine you opened the app on, not for other machines you switch to.

## Watch this computer on the System page

Click **System** in the sidebar, or go to [System](/system). Under the title: the computer's name, its processor, how many threads it has and how long it has been up, then the operating system.

The tiles at the top show, with a small chart of the last two minutes:

- **CPU**: how busy the processor is, and the load averages.
- **Memory**: how much is used, of how much.
- **GPU × n** (when there are NVIDIA GPUs): average use, and graphics memory used.
- **Network**: data in and out per second.
- **Disk I/O**: data read and written per second.

Below, in more detail:

- **CPU**: a chart, every core's load, and the temperature when known.
- **Memory**: a chart, RAM used with cache and buffers, swap, and how much is available.
- One card per **GPU**: use, graphics memory, power against its limit, temperature, fan, performance state and clock speed.
- **Network**: download and upload, and each network connection.
- **Storage**: reads and writes, and every disk with its free space, filesystem and how full it is.
- **Sensors**: temperatures, red from 85 °C.
- **Notebook kernels** (while any run): each with its environment, state, memory and **Shut down**.
- **Processes**: the 12 busiest programs by **CPU** or **Memory** (or **GPU**, for those using one), with process ID, user, CPU and memory. Point at a row for its full command.

It takes a reading every 2 seconds while the page is open and keeps the last 10 minutes.

## Ask an agent

- "Open a pull request for this session's branch, with a title and description written from the commits."
- "Link https://github.com/acme/site/pull/42 to this session."
- "Have the checks on this session's pull request passed yet?"
- "Write a reading guide for what this branch changes."
- "Which dev servers are running on this computer right now?"
- "What's using the most memory on this computer?"
