# Hydor im Terminal

Der Befehl `hydor` macht in einem Terminal das, was du in den Seiten der App tust: mit einem Agenten sprechen und seine Arbeit live verfolgen, genehmigen, worum er bittet, und seine Fragen beantworten, eine einzelne Anfrage aus einem Skript ausführen und die Antwort zurückbekommen und alles verwalten, was die App speichert: deine Sitzungen, Projekte, Agenten, Memory, Skills, Plugins, Keys, Geplanten Aufgaben, die Nutzung und jede Einstellung. Wo nur eine Seite etwas kann (eine Unterschrift zeichnen, die Editoren für Folien und Diagramme), nennt dir der Befehl die Adresse der Seite. Er verwendet dasselbe Hydor wie die App: Eine im Terminal gestartete Sitzung erscheint in der App, und eine in der App gestartete Sitzung kannst du im Terminal fortsetzen. Deine Shell vervollständigt ihn beim Tippen.

![Der Befehl hydor: sein Willkommensfeld und das Menü, das sich öffnet, wenn du einen Schrägstrich tippst](images/terminal.webp)

## Den Befehl bekommen

- **Mit dem Installer installiert** (`./install.sh`): Der Installer verlinkt `hydor` nach `~/.local/bin`, wenn dieser Ordner in deinem PATH liegt, und sagt dir das. Andernfalls sagt er dir, wo der Befehl liegt: `bin/hydor.mjs` im Ordner von Hydor. Du kannst ihn direkt ausführen oder dorthin verlinken, wo du deine Befehle ablegst.
- **Mit Docker**: Das Image enthält ihn. Führe `docker exec -it hydor hydor` aus, um mit einem Agenten im Container zu sprechen.
- **Die Mac-App** legt ihn bei jedem Start von selbst in deinen PATH. Sie verlinkt `hydor` nach `~/.local/bin`, `~/bin`, `/usr/local/bin` oder `/opt/homebrew/bin`, und zwar in den ersten dieser Ordner, der in deinem PATH liegt und in den du schreiben darfst. Ist keiner geeignet, nimmt sie `~/.local/bin` und fügt der Startdatei deiner Shell (bei zsh `~/.zprofile`) eine Zeile hinzu, die als von Hydor stammend markiert ist, damit dieser Ordner in deinem PATH liegt. Öffne danach ein neues Terminal-Fenster. Der Befehl verwendet das App-eigene Node.js, und wenn die App geschlossen ist, öffnet `hydor` sie. Vom Disk-Image aus oder bevor du die App nach **Programme** verschoben hast, tut er nichts. Innerhalb der App sagen `hydor update`, `hydor service install` und `hydor serve` nur, dass die App das selbst erledigt.
- **Die Desktop-Apps für Linux und Windows** machen dasselbe bei jedem Start, ohne Passwort und ohne Rückfrage. Unter **Linux** (AppImage oder .deb) ist der Befehl eine kleine Datei `hydor` in `~/.local/bin`, `~/bin` oder `/usr/local/bin`, und zwar im ersten dieser Ordner, der in deinem PATH liegt und in den du schreiben darfst. Ist keiner geeignet, nimmt sie `~/.local/bin` und fügt der Startdatei deiner Shell eine als von Hydor stammend markierte Zeile hinzu. Das `/usr/bin/hydor` des .deb öffnet das Fenster der App, deshalb muss der Befehl in deinem PATH davor stehen. Unter **Windows** legt sie `hydor.cmd` in deinen WindowsApps-Ordner, den Windows ohnehin durchsucht; andernfalls nach `%LOCALAPPDATA%\Hydor\bin`, den sie deinem PATH hinzufügt. Öffne danach ein neues Terminal (Windows Terminal, PowerShell oder Eingabeaufforderung). Wie beim Mac verwendet der Befehl das App-eigene Node.js, öffnet `hydor` die App, wenn sie geschlossen ist, und sagen `hydor update`, `hydor service install` und `hydor serve` nur, dass die App das selbst erledigt. Liegt bereits ein anderes `hydor` in deinem PATH (der Link, den der Installer zu einer Kopie aus Git anlegt), lässt die App alles unverändert. Von einer Kopie von Hydor auf einem anderen Computer aus kannst du trotzdem das dortige Hydor verwenden: siehe [Das Hydor eines anderen Computers verwenden](#use-another-computers-hydor).

`hydor help` listet alles auf, was er kann, in Gruppen mit je einer Zeile; `hydor help <command>` zeigt die Verwendung eines Befehls, seine Optionen und Beispiele, `hydor help options` listet alle Optionen auf und `hydor help <command> <verb>` die eines Verbs. Die Wartungsbefehle funktionieren unter demselben Namen: `hydor service status`, `hydor setup-token`, `hydor update` und die übrigen (`node dist/server/cli.js …` funktioniert weiterhin). Vertippst du dich bei einem Befehl, einer Option oder einem Verb, fragt er „Did you mean …?“. Fehler erscheinen in Rot.

Eine Nachricht, die mit dem Namen eines Befehls beginnt, setzt du in Anführungszeichen (`hydor "find the bug in login"`) oder hinter `hydor chat`, damit sie nicht für den Befehl gehalten wird.

Du musst Hydor nicht zuerst starten. Antwortet auf diesem Computer nichts, startet der Befehl es im Hintergrund, meldet **Starting Hydor…** und lässt es nach seinem Ende weiterlaufen, damit deine Sitzungen weitergehen. `hydor status` sagt, welches Hydor er verwendet, welche Version es hat, ob es als Dienst läuft und was gerade arbeitet. Auf einem Computer mit der Desktop-App wird stattdessen eine geschlossene App geöffnet: Der Befehl startet keinen eigenen Server.

## Tab-Vervollständigung in deiner Shell

Aktiviere sie einmalig:

```bash
hydor completion install
```

Sie wird für die Shell eingerichtet, die du verwendest (bash, zsh oder fish): Der Befehl schreibt das Skript dorthin, wo die Shell danach sucht, und fügt bei zsh und bei bash ohne bash-completion eine Zeile zu deiner `.zshrc` oder `.bashrc` hinzu. Öffne danach ein neues Terminal. Wenn du ihn erneut ausführst, ändert sich nichts doppelt. `hydor completion bash` (oder `zsh`, `fish`) gibt stattdessen das Skript aus, damit du es ablegen kannst, wo du möchtest: `source <(hydor completion bash)`.

Danach vervollständigt die Tab-Taste, was du tippst: die Befehle, ihre Verben und Optionen und die Dinge, die sie annehmen. Nach `hydor show ` oder `hydor send ` listet sie die Keys deiner Sitzungen auf, jeweils mit ihrem Titel; nach `--model` die Modelle, nach `--as` deine Agenten, nach `--cwd` Ordner; und ebenso Projekte, Skills, Plugins, Einstellungen, Themen der Anleitung und mehr, so wie sie in diesem Hydor vorhanden sind. Antwortet Hydor nicht schnell, bietet die Vervollständigung an, was sie ohne es kann, und hält deine Shell nie auf.

## Mit einem Agenten sprechen

Führe in einem Ordner `hydor` aus, oder `hydor` gefolgt von deiner Nachricht (`hydor fix the failing test`). Die erste Nachricht startet eine Sitzung in diesem Ordner.

Der Chat öffnet sich mit einem Willkommensfeld, einem Kasten mit **HYDΩR** und seiner Version im oberen Rand. Darin stehen der Ordner „auf" seinem Git-Branch (ist kein Branch vorhanden, wird keiner angezeigt); dann das Programm, das dir antwortet (**Claude Code**, **Codex** oder **Custom**), das Modell (**Automatisch**, wenn das Modell nach der Aufgabe gewählt wird, bei einem Hydor mit Leistungsstufen) und der Berechtigungsmodus, jeweils durch ein · getrennt; der Modus erscheint rot, wenn der Agent ohne Nachfrage handelt, und in der Akzentfarbe beim Plan; außerdem eine Zeile mit Hinweisen: `/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`. Der Kasten behält dieselbe Breite, egal wie der Ordner heißt.

Was du siehst, bleibt im eigenen Verlauf des Terminals, sodass du zurückscrollen und daraus kopieren kannst, auch über SSH und in tmux:

- **Deine Nachrichten**, nach einem `›`.
- **Der Text des Agenten**, während er entsteht, mit Überschriften, Listen, Zitaten, Tabellen, Links (die Adresse steht hinter den Wörtern) und Code (nie neu umbrochen, sodass das Kopierte lauffähig bleibt).
- **Jeder Schritt** in einer Zeile: was gelesen, durchsucht, bearbeitet (mit den hinzugefügten und entfernten Zeilen) und ausgeführt wurde (mit der benötigten Zeit und, wenn es fehlschlug, dem Exit-Code, darunter die erste Zeile des Fehlers).
- **Gedanken** als eine blasse Zeile, etwa „Thought for 8 s". Starte mit `--thinking`, um sie vollständig zu sehen, und mit `-v`, um die ersten Zeilen der Ausgabe jedes Schritts zu sehen.
- **Subagenten**: „Subagent started", wenn der Agent einen Teil seiner Arbeit an einen [Hydor-Subagenten](/guide/research#let-an-agent-hand-work-to-subagents) übergibt, und „Subagent finished" (oder „Subagent failed"), wenn dessen Antwort zurückkommt. Claude Code kann auch eigene Subagenten im Hintergrund laufen lassen und seinen Durchlauf beenden, während sie arbeiten: Die unteren Zeilen zeigen, welche im Hintergrund arbeiten, „Finished in the background" erscheint, sobald einer fertig ist, und der Agent macht von selbst weiter. Ein Befehl, den er im Hintergrund laufen lässt, etwa ein Entwicklungsserver, hält nichts auf. `/subagents` listet sie alle auf, mit dem, was jeder gerade tut (und was ein Subagent gekostet hat).
- **Das Ende jedes Durchlaufs**: wie lange er dauerte, was er gekostet hat, das Modell und wie viele Subagenten gearbeitet haben („1 subagent", „3 subagents").

Unten ändern sich einige Zeilen, während der Agent arbeitet: der Text, der noch geschrieben wird, der laufende Schritt, die arbeitenden Subagenten, ein farbiger Spinner mit der bisherigen Zeit (über „Working" läuft ein Schimmer) und deine Eingabezeile. Drücke Esc oder Ctrl+C, um den Durchlauf zu stoppen.

### Die Eingabezeile

Deine Eingabe steht zwischen zwei dünnen Linien, darunter eine Statuszeile: der Ordner auf seinem Branch, das Modell und der Modus sowie die bisherigen Kosten, mit `/help` rechts.

- **Ein grauer Vorschlag** aus deinen früheren Nachrichten erscheint hinter dem, was du tippst. **→** übernimmt ihn, **Alt+→** ein Wort davon. Mit **Einstellungen → App → Allgemein → Terminalvorschläge** schaltest du ihn aus und ein ([Einstellungen](/settings?s=general&find=Terminal%20suggestions)).
- **Ctrl+R** durchsucht deine früheren Nachrichten: Tippe einige ihrer Wörter, gehe mit **↑** und **↓** zu einem Treffer, und die **Eingabetaste** setzt ihn in die Zeile, ohne ihn zu senden, sodass du ihn erst ändern kannst. **Esc** bricht ab.
- Eine Nachricht kann mehrere Zeilen haben, und eingefügter Text kommt als Ganzes an.

### Das Vervollständigungsmenü

Unter der Zeile öffnet sich beim Tippen ein Menü, das mit jeder Taste Schritt hält:

| Eingabe | Das Menü listet |
| --- | --- |
| `/` | Die Befehle, jeweils mit dem, was sie tun: zuerst die des Chats, dann die des Programms (zum Beispiel die Befehle und Skills von Claude Code). |
| `/model `, `/mode `, `/effort `, `/agent `, `/subagents `, `/open ` | Die Werte dieses Befehls: die Modelle, Modi, Aufwände, deine Agenten, die Subagenten, wo geöffnet wird. |
| `@` und ein paar Buchstaben | Die Dateien im Ordner der Sitzung, locker gefunden: `@clits` findet `src/cli.ts`. Mit `/` am Ende durchsuchst du diesen Ordner. |

**↑** und **↓** bewegen die Auswahl, **Tab** vervollständigt die markierte Zeile, und die **Eingabetaste** vervollständigt sie und führt sie aus (ein Befehl, der einen Wert braucht, öffnet stattdessen die Werte dieses Befehls). **Esc** schließt das Menü. Der Abgleich ist locker, und die Buchstaben eines Befehls müssen nicht direkt nebeneinanderstehen: `mdl` findet `/model`.

### Auswahllisten

`/sessions`, `/resume`, `/model`, `/effort`, `/mode` und `/agent` öffnen ohne Wert eine Auswahlliste: eine Liste mit einer markierten Zeile. **↑** und **↓** bewegen die Auswahl, Tippen grenzt die Liste ein, die **Eingabetaste** wählt aus, **Esc** verlässt die Liste. Eine Ziffer wählt weiterhin aus, wenn die Liste höchstens neun Zeilen hat. `hydor resume` ohne Key öffnet dieselbe Auswahlliste deiner Sitzungen.

### Shell-Befehle mit `!`

Beginne eine Zeile mit `!`, und der Rest läuft als Shell-Befehl im Ordner der Sitzung: `!git status`, `!npm test`. Der Chat übergibt das Terminal, solange der Befehl läuft, sodass interaktive Programme funktionieren (`!vim notes.md`, `!htop`), und übernimmt es wieder, wenn er endet. Der Prompt wird gelb, solange die Zeile mit `!` beginnt. Der Agent sieht weder den Befehl noch das, was er ausgegeben hat; wenn du ihm etwas zeigen willst, sag es in einer Nachricht. Das funktioniert nur mit dem Hydor dieses Computers.

### Antworten, wenn der Agent fragt

Braucht der Agent deine Genehmigung, erscheint die Anfrage mit dem, worum es geht (der Befehl, die Änderung an einer Datei, der Plan), und darunter seine Auswahlmöglichkeiten:

- Drücke **y** für die erste Auswahl, die es erlaubt, **n**, um es abzulehnen, oder die **Zahl** einer beliebigen Auswahl (etwa „Always allow").
- Um abzulehnen und dem Agenten zu sagen, was er stattdessen tun soll, tippe das und drücke die Eingabetaste.

Eine Frage zeigt ihre Auswahlmöglichkeiten nummeriert: Drücke eine Zahl, um eine auszuwählen (mehrere bei einer Frage, die mehrere zulässt, dann die Eingabetaste), oder tippe deine eigene Antwort und drücke die Eingabetaste. Esc überspringt sie. Ein Formular fragt seine Felder nacheinander ab: Tippe jede Antwort und drücke die Eingabetaste, oder drücke die Eingabetaste, um das Angezeigte zu behalten. Eine Datei wird über ihren Pfad auf diesem Computer angegeben.

Einige Anfragen brauchen die App: eine zu einer Signatur oder zu einem Key für eine deiner Apps. Das Terminal sagt das und nennt die Adresse der Sitzung in der App.

### Wenn der Browser des Agenten auf dich wartet

Worauf der Browser eines Agenten wartet, erscheint als Karte im Chat, nach einer eventuell vorausgehenden Genehmigung, in den Worten, die die App verwendet (siehe [Der Browser, den Agenten nutzen](/guide/web#the-browser-agents-use)):

- „Needs you in the browser: …", für eine Anmeldung, eine Prüfung oder alles, bei dem sich der Agent unsicher ist, mit der Adresse der Seite darunter.
- „Stopped before paying or ordering: …. That is yours to do".
- „Wants to open localhost:3000, on this machine or its network".
- „Wants to press “Send” on mail.example.com", für eine Schaltfläche, die auf einer Website, bei der der Browser angemeldet ist, sendet, veröffentlicht, löscht oder überweist (siehe [Schaltflächen, die senden, veröffentlichen oder löschen](/guide/web#buttons-that-send-post-or-delete)); die Karte ergänzt, dass er sie nur drückt, wenn du es erlaubst.
- Die Pop-up-Frage einer Seite: Die Website sagt (oder fragt, ob man sie verlassen will), mit ihrer Nachricht.

Die Karte zeigt ihre Tasten, und ein Tastendruck beantwortet sie:

- Bei einer Adresse oder einer Schaltfläche: **y** erlaubt es (eine Adresse für diese Sitzung) und **n** nicht.
- Bei einer Anmeldung, einer Prüfung oder einer Zahlung, die nur du auf der Seite erledigen kannst: **o** öffnet die Seite der Sitzung in der App in deinem Browser, damit du dort übernehmen kannst, **d** sagt, dass du fertig bist, und **n** sagt, dass du es nicht kannst (oder bei einer Zahlung: jetzt nicht).
- Bei einer Pop-up-Frage: **y** ist OK (Verlassen bei „Leave this page?") und **n** ist Abbrechen (Bleiben). Ein Hinweis hat nur OK. Bei einer Texteingabe tippe deine Antwort und drücke die Eingabetaste, oder drücke **y**, um das Angezeigte zu behalten, oder **n**, um abzubrechen.

Das Terminal kann die Seite selbst nicht anzeigen, nutze also **o**, um zu übernehmen. Ist sie beantwortet, schrumpft die Karte auf eine Zeile: „Done in the browser", „Skipped", „Allowed" oder „Not allowed".

### Während er arbeitet

Deine Eingabezeile bleibt deine. Was die Eingabetaste mit einer Nachricht macht, die du sendest, während der Agent arbeitet, legt **Senden, während ein Agent arbeitet** in [Einstellungen → App → Allgemein](/settings?s=general&find=Sending%20while%20an%20agent%20works) fest: **In laufenden Durchlauf senden** (die Voreinstellung, wie in der App) fügt sie in den laufenden Durchlauf ein, und **Auf Ende warten** stellt sie in die Warteschlange, damit sie beim Ende des Durchlaufs losgeht (sie erscheint als **queued**). Was auch eingestellt ist, zwei Befehle entscheiden für eine einzelne Nachricht:

- `/queue <message>` wartet immer, bis der Durchlauf endet.
- `/now <message>` schließt sich immer dem laufenden Durchlauf an.

Die zwei Geräteeinstellungen, **Senden, während ein Agent arbeitet** und **Terminalvorschläge**, gehören dem Chat selbst: Stelle sie hier ein, mit `hydor settings set general.sending-while-an-agent-works wait`, oder bitte den Agenten, eine zu ändern (siehe [Einstellungen](#settings)), und der Chat folgt sofort.

### Keys

- Die **Eingabetaste** sendet. **Alt+Enter**, **Ctrl+J** oder ein `\` am Zeilenende vor der Eingabetaste fügt eine Zeile hinzu. Eingefügter Text kommt als Ganzes an, mit seinen Zeilenumbrüchen.
- **↑** und **↓** gehen durch deine früheren Nachrichten (die letzten 500 werden behalten); in einer mehrzeiligen Nachricht bewegen sie sich zuerst zwischen deren Zeilen. Bei geöffnetem Menü bewegen sie sich darin.
- **←**, **→**, **Home**, **Ende**, **Ctrl+A** und **Ctrl+E** bewegen den Cursor; **Alt+←** und **Alt+→** springen wortweise; **Ctrl+W** löscht das Wort vor dem Cursor, **Ctrl+U** und **Ctrl+K** den Rest der Zeile davor und danach.
- **Tab** öffnet das Menü und übernimmt die markierte Zeile. **Ctrl+R** durchsucht frühere Nachrichten.
- **Esc** schließt das Menü oder stoppt den Durchlauf. **Ctrl+C** stoppt den Durchlauf, wenn einer läuft, leert die Zeile, wenn Text darin steht, und beendet sonst bei zweimaligem Drücken. **Ctrl+D** in einer leeren Zeile beendet. **Ctrl+L** leert den Bildschirm. **Ctrl+Z** unterbricht den Chat (`fg` holt ihn zurück).

`/keys` listet sie im Chat auf. Wenn du den Chat verlässt, läuft die Sitzung weiter: Das Terminal sagt dir, wie du zu ihr zurückkommst.

### Befehle

Tippe sie in die Eingabezeile (`/` listet sie auf):

- `/help`: die Befehle, die Tasten und einige weitere Dinge (`@`, `!`), in Abschnitten: **Befehle**, **Keys**, **Auch**. `/keys` listet nur die Tasten auf.
- `/new` (und eine Nachricht): eine neue Sitzung im selben Ordner.
- `/sessions` (oder `/resume`): eine andere Sitzung zum Weitermachen auswählen.
- `/model`, `/effort`, `/mode`: das Modell ändern, wie gründlich es nachdenkt und was es ohne Nachfrage tun darf. Ohne Namen öffnet jeder eine Auswahlliste.
- `/agent`: ab der nächsten Nachricht als einer [deiner Agenten](/guide/agents) arbeiten.
- `/subagents`: die Subagenten, auch die im Hintergrund, mit dem, was jeder gerade tut (und was ein Subagent gekostet hat); `/subagents 2` zeigt die Unterhaltung des zweiten Subagenten.
- `/tiers`, `/usage`, `/cost`: welches Modell jede Leistungsstufe bedeutet, die Nutzung und Limits deiner Pläne und was diese Sitzung und ihre Subagenten gekostet haben.
- `/copy`: kopiert die letzte Antwort des Agenten in die Zwischenablage, auch über SSH und in tmux. `/clear` leert den Bildschirm.
- `/queue` und `/now`: eine Nachricht senden, damit sie wartet oder sich anschließt, je nachdem, was eingestellt ist ([Während er arbeitet](#while-it-works)).
- `/stop`, `/rename`, `/open`, `/quit`: den Durchlauf und die Subagenten im Hintergrund stoppen, die Sitzung umbenennen, ihre Adresse in der App anzeigen, beenden.
- `/hydor <command>`: einen beliebigen Befehl aus den nächsten Abschnitten im Chat ausführen ([Im Chat](#inside-the-chat)).

Jeder andere `/command` geht unverändert an den Agenten, für die eigenen Befehle und Skills des Programms.

Die Farben sind True Color, wo das Terminal sie unterstützt. `NO_COLOR` und `--no-color` schalten sie aus, ebenso eine Pipe.

## Eine Sitzung fortsetzen

- `hydor -c` setzt die letzte Sitzung des Ordners fort, in dem du dich befindest.
- `hydor resume` öffnet eine Auswahlliste deiner letzten Sitzungen; `hydor resume 6f1e2a3b` setzt genau diese fort.

Zuerst werden die letzten Durchläufe angezeigt, jeweils mit ihrer Arbeit in einer Zeile zusammengefasst („Ran 3 commands, read 4 files"); `hydor show` gibt alles aus.

## Festlegen, wie eine Sitzung startet

Diese gehören zu `hydor`, `hydor run` und `hydor resume`:

- `--agent claude`, `codex`, `custom` oder der Name eines [anderen Agentenprogramms](/guide/agents-models): welches Programm antwortet.
- `--model` (der Name eines Modells oder `auto` für Automatisch), `--effort` und `--mode ask`, `edits`, `plan` oder `full` (oder der eigene Name des Programms für einen Modus).
- `--as Researcher`: als einer [deiner Agenten](/guide/agents) starten.
- `--cwd` (ein Ordner; der Ordner, in dem du dich befindest, wenn du es weglässt), `--worktree` (ein eigener Branch und Ordner), `--cap 2` (höchstens 2 $ ausgeben), `--no-memory`, `--title`.

Was du weglässt, kommt von dem, was die Startseite der App zuletzt gewählt hat, dann von den Standardwerten der App.

## Eine Anfrage aus einem Skript

`hydor run "…"` (oder `hydor -p "…"`) startet eine Sitzung mit deiner Nachricht, verfolgt sie, bis die Arbeit erledigt ist, gibt die letzte Antwort des Agents aus und endet. Erledigt heißt: Der Durchgang ist beendet, kein Subagent arbeitet noch oder schuldet noch eine Antwort (auch die eigenen Subagents von Claude Code im Hintergrund, die des Agents oder eines Subagents), und nichts wartet in der Warteschlange: Ein Agent, der seinen Durchgang beendet, um auf seine Subagents zu warten, wird durch deren Antworten oder deren Ende wieder geweckt, und der Lauf wartet auch auf diesen Durchgang. Ein Befehl, der im Hintergrund weiterläuft, etwa ein Entwicklungsserver, hält den Lauf nicht auf. Bei `--timeout` oder Strg+C werden die Subagents im Hintergrund zusammen mit dem Durchgang gestoppt. Steht nach dem Befehl nichts weiter, liest er die Nachricht aus dem, was per Pipe hineingegeben wird: `git diff | hydor run "prüfe diese Änderung"`.

- In einem Terminal sagen kurze Zeilen am Rand, was gerade passiert (jeder Schritt, Subagents beim Starten und Beenden); mit `-q` schaltest du sie aus.
- Niemand ist da, um zu antworten. Deshalb stoppt eine Genehmigung oder eine Frage den Lauf, sagt, was gefragt wurde, und die Sitzung wartet in der App oder mit `hydor resume` auf dich. Worauf der Browser des Agents wartet, löst dasselbe aus (eine Anmeldung, eine Zahlung, eine Adresse oder eine Schaltfläche, die erlaubt werden soll, eine Pop-up-Frage), und der Lauf meldet es: „Der Browser des Agents: Möchte auf mail.example.com „Löschen“ drücken“. Mit `--mode full` (oder `-y`) fragt der Agent nichts.
- `--json` gibt am Ende ein Objekt aus: `key`, `url`, `status`, `reply`, `model`, `costUsd` (mit dem seiner Subagents), `tokens`, `durationMs`, `turns`, `children` (je `title`, `label`, `tier`, `costUsd`, `status` jedes Hydor-Subagents) und `error`, wenn sie fehlgeschlagen ist. `--stream-json` gibt für jede Änderung sofort eine Zeile aus (`item`, `live`, `note`), danach als letzte Zeile dieses Objekt.
- `--timeout 300` stoppt den Durchgang nach 300 Sekunden.

Der Lauf endet mit einem Exit-Code, den ein Skript prüfen kann:

| Code | Was passiert ist |
| --- | --- |
| 0 | Erledigt |
| 1 | Die Sitzung ist fehlgeschlagen (ein Fehler oder das Nutzungslimit des Tarifs, das genannt wird), oder Hydor hat abgelehnt |
| 2 | Der Befehl wurde nicht richtig verwendet |
| 3 | Es braucht eine Antwort von dir |
| 124 | Es hat länger gedauert als `--timeout` |
| 130 | Du hast Strg+C gedrückt (der Durchgang wurde zuvor gestoppt) |

## Alles, was die App kann, im Terminal

Jeder Teil der App hat einen eigenen Befehl, mit Verben für das, was seine Seite tut. Lässt du das Verb weg, listet er auf: `hydor projects` ist `hydor projects list`. `hydor help` zeigt sie gruppiert wie unten, und Tab vervollständigt die Verben, die Optionen und die Dinge, die sie annehmen.

So funktionieren alle:

- **Dinge benennen**: Wo ein Befehl eines von etwas annimmt (eine Sitzung, ein Projekt, einen Agenten, einen Skill …), gib seine ID oder deren Anfang an, oder seinen Namen oder Titel (in beliebiger Groß- und Kleinschreibung, wenn nur einer passt). Bei zwei oder mehr Treffern listet er bis zu fünf auf. In einem Terminal kannst du den Namen weglassen, dann bietet der Befehl eine Liste zur Auswahl an.
- **Dinge ändern**: Die Felder sind Optionen (`--description`, `--name`). Ein langer Text kommt aus `--file <path>`, aus dem, was du mit `-` hineinleitest, oder, in einem Terminal mit keinem von beiden, aus deinem Editor (`$VISUAL`, `$EDITOR`), der auf dem aktuellen Text geöffnet wird: Speicherst du ihn unverändert, ändert sich nichts.
- **Dinge entfernen** fragt `Remove “name”? [y/N]`. `-y` (oder `--yes`) antwortet mit Ja. Ohne Terminal und ohne `-y` weigert er sich, statt zu raten.
- **`--json`** gibt aus, was die API der App liefert, so wie sie es geliefert hat, für Skripte.
- **Exit-Codes**: 0, wenn es erledigt ist, 1, wenn Hydor es abgelehnt hat oder es fehlgeschlagen ist (er sagt, warum), 2, wenn der Befehl nicht richtig verwendet wurde (er sagt, was du eingeben sollst).
- **Das Hydor eines anderen Computers**: Jeder Befehl funktioniert mit `--server` und `--token`.
- **Nur eine Seite kann es**: Der Befehl sagt das und nennt die Adresse der Seite. `hydor open … --browser` öffnet sie.

### Sitzungen

| Befehl | Was er tut |
| --- | --- |
| `hydor sessions` | Deine neuesten Sitzungen, jede mit einer Markierung: ● arbeitet, ● braucht dich, ✓ fertig, ✗ Fehler. Seine Verben tun, was das Menü einer Sitzung tut: `search`, `rename`, `archive` und `unarchive`, `pin` und `unpin`, `read`, `snooze`, `move` in ein Projekt, `fork`, `goal` (ein Ziel in Worten setzen, oder mit `--pause`, `--resume` und `--clear` anhalten, fortsetzen und löschen: Der Agent schlägt die Prüfungen vor, und nichts startet, bis du in der App auf seiner Karte **Starten** drückst), `share` (ein schreibgeschützter Link), `changes` (die Dateien, die er geändert hat), `commands` (die Befehle, die er ausgeführt hat), `queue` (die wartenden Nachrichten, sowie `queue clear` und `queue remove`), `show`, `export` (die Unterhaltung als Markdown-Datei, `-o -` zum Ausgeben, oder `--library` als Dokument im Projekt der Sitzung), `send`, `stop` und `delete`. |
| `hydor inbox` | Was auf dich wartet (Genehmigungen, Fragen, ein Key, den ein Agent angefragt hat, ein Skill zur Prüfung): `list`, und `show` für einen Eintrag, mit dem Ort, an dem du ihn beantwortest. |
| `hydor outbox` | Aufrufe, die auf dein OK warten (die Tools eines verbundenen Kontos auf „Zuerst fragen“): `list`, `show` für einen mit seiner Eingabe, `send` (unverändert oder mit `--set NAME=value`, um ein Feld zu ändern) und `drop`. |
| `hydor away` | Was seit deinem letzten Besuch passiert ist, wie es **Während du weg warst** auf der Startseite zeigt: was auf dich wartet, Sitzungen, die fertig wurden oder fehlgeschlagen sind, was von selbst lief, mit seinen Kosten, und was heute als Nächstes läuft. `hydor away seen` markiert alles als gesehen. |

`hydor show 6f1e2a3b` ist dasselbe wie `hydor sessions show 6f1e2a3b`, und ebenso `send` und `stop`: Die kurzen bleiben.

```bash
hydor sessions search login          # sessions about login
hydor sessions rename 6f1e "Fix the login bug"
hydor sessions fork 6f1e "try it with a cache instead"
hydor sessions export 6f1e -o notes.md  # the conversation as Markdown
hydor inbox
hydor away                           # what happened while you were away
```

### Deine Arbeit

| Befehl | Was er tut |
| --- | --- |
| `hydor projects` | `list`, `show`, `new`, `rename`, `edit` (Beschreibung, Richtlinien, der Agent, als der es startet, Ordner), `sessions`, `files` (die Dokumente, die es liest: `files add` und `files remove`) und `remove`. |
| `hydor tasks` | Deine [Geplanten Aufgaben](/guide/tasks) und die andere Arbeit, die von selbst startet: `list`, `show`, `new` (wann sie läuft: `--every 2h`, `--at 09:00 --days weekdays`, `--cron`, `--once`; oder `--webhook`, `--watch-feed`, `--watch-page`, `--watch-folder`, oder `--watch-account` mit `--tool` für neue Einträge in einer verbundenen App, und `--before 30m` für eine Zeit vor jedem Termin in einem Kalender), `edit`, `pause`, `resume`, `run` (jetzt, auch wenn pausiert), `runs` (die letzten Ausführungen, `--reply` für die letzte Antwort) und `remove`. Das Beobachten eines Befehls oder einer JSON-Adresse geht auf der Seite. Die Aktualisierungen einer Board-Karte werden als die des Boards aufgeführt („Shop · Sales by day: refresh“): `pause`, `resume` und `run` funktionieren bei ihnen, und `show` sagt, wo du sie änderst, nämlich im Board. |
| `hydor apps` | Deine [Apps](/guide/apps) und die fertigen: `list`, `show`, `run` (die Antworten des Formulars als `field=value`, oder `--input` JSON; er gibt die Antwort und ihre Kosten aus), `runs`, `run-show` (eine Ausführung) und `remove`. `hydor app …` (ohne das s) erstellt Apps als Dateien: `new`, `folder`, `dev`, `try`, `export`, `import`. |
| `hydor files` (auch `hydor library`) | Was Agenten für dich erstellt haben und was du behalten hast, wie es die **Dateien** der Projekte zeigen ([Seiten, Bilder, Videos und Sites](/guide/library)): `list` (`--kind`, `--project`), `search`, `show` (der Text eines Dokuments, die Karten eines Boards oder was das Element ist), `export` (`--to pdf`, `docx`, `pptx` …, `-o file`), `open` (die Adresse seines Editors), `remove`, `refreshes` (was auf deinen Boards aktualisiert wird, wann und was es kostet) und `refresh` (die Karte eines Boards oder alle jetzt aktualisieren). |
| `hydor experiments` | Trainings- und Auswertungsläufe: `list`, `show` und `stop`. Einen Lauf zu starten ist Sache der Agenten und der Seite. |

```bash
hydor projects new Thesis
hydor projects edit thesis --file guidelines.md
hydor tasks new --at 09:00 --days weekdays "Summarise my unread email"
hydor apps run trip-planner destination=Lisbon days=5
hydor files export "Q3 report" --to pdf -o q3.pdf
```

### Agenten und Modelle

| Befehl | Was er tut |
| --- | --- |
| `hydor models` und `hydor tiers` | Die Modelle, die jedes Programm anbietet, und welches Modell jede [Leistungsstufe](/guide/agents-models#tiers-a-model-for-each-kind-of-job) bedeutet (`hydor tiers set claude best opus --effort high`, `hydor tiers reset`; `hydor tiers team off` und `hydor tiers hard off` schalten **Subagenten koordinieren** und **Max für schwierige Probleme** aus, und `on` schaltet sie wieder ein). |
| `hydor usage` | Nutzung und Limits jedes Plans und wann sie zurückgesetzt werden. |
| `hydor agents` | [Deine Agenten](/guide/agents): `list`, `show`, `new`, `edit`, `results`, `export`, `install` und `remove` (die eingebauten können kopiert, aber nicht geändert werden). Wohin die Ergebnisse eines Agenten gehen, ist `--results-to` bei `new` und `edit`, einmal für jeden Ort: `library` (dieselbe Seite, aktualisiert), `library:new`, `sheet` (eine Zeile in einer eigenen Tabelle), `sheet:<spreadsheet>#<tab>`, `email:<addresses>`, `notify`, `file:<path>`, `webhook:<url>` oder `none`. Seine Ausgabefelder werden auf seiner Seite festgelegt (`hydor open agents`); `results` listet auf, was er zurückgegeben hat, eine Zeile für jedes Ergebnis. `export` speichert einen als `.hydor-agent`-Datei (`-o`, um sie zu benennen) und sagt, was weggelassen wurde; `install <file>` sagt, was eine Datei mitbringt und braucht, fragt dann nach und installiert sie neben deinem gleichnamigen, außer mit `--replace` (`--schedules` fügt die Zeitpläne hinzu, die sie vorschlägt, pausiert). Siehe [Einen Agenten als Datei teilen](/guide/agents#share-an-agent-as-a-file). |
| `hydor accounts` | Die Anmeldungen von Claude Code und Codex: `list`, `show` (ein Konto: wer angemeldet ist und der Plan, ob neue Sitzungen damit starten, seine Nutzung und Limits, ob ein API-Key hinterlegt ist (nie der Key selbst), und ob eine Sitzung bei einem Limit wechselt), `add <program> <name>` (ein weiteres Konto, sofort angemeldet), `sign-in`, `sign-out`, `remove` und `use` (das Konto, mit dem neue Sitzungen starten). Der API-Key für API-Guthaben und die Umschalter bei einem Nutzungslimit sind Einstellungen (`accounts.*`). |

```bash
hydor agents new Bookkeeper --tools read,edit --tier standard
hydor agents edit bookkeeper --results-to sheet --results-to email:sam@example.com
hydor agents export bookkeeper -o ~/Desktop/bookkeeper.hydor-agent
hydor agents install bookkeeper.hydor-agent --schedules
hydor tiers set claude best opus --effort high
hydor accounts add claude Work
hydor accounts use work
```

### Was Agenten wissen und nutzen

| Befehl | Was er tut |
| --- | --- |
| `hydor memory` | Was Agenten über dich im Gedächtnis behalten: `list`, `search`, `show`, `add`, `edit`, `forget` (30 Tage lang wiederherstellbar) und `restore`, sowie `profile` und `profile edit` für das, was jeder Agent zuerst liest. `--scope`, `--project` und `--session` bestimmen, wessen Notizen. |
| `hydor guidelines` | `show` und `edit` für das, was jeder Agent befolgt: für jede Sitzung, für ein Projekt (`--project`) oder für eine Sitzung (`--session`). |
| `hydor skills` | Die Skills, die Agenten nutzen: `list`, `show`, `on`, `off`, `add` (aus einer `SKILL.md` oder einem Ordner) und `remove`. `--agent claude` oder `--agent codex` gilt für die Skills, die diese Programme selbst mitbringen. |
| `hydor plugins` | Add-ons mit Skills und Tools: `list`, `show`, `on`, `off`, `add` (eingebaut, eine Git-Adresse, eine .zip oder ein Ordner) und `remove`. Ein eigenes Plugin zu erstellen steht auf seiner Seite (`hydor open plugins`). |
| `hydor mcp` | Tool-Server (MCP) für Claude Code und Codex: `list`, `show` (ein Server: sein Programm, Geltungsbereich, Befehl oder Adresse, die Namen seiner Umgebungsvariablen und Header mit verborgenen Werten, an oder aus, und mit `--tools`, wie viele Tools er hat), `status` (startet jeden und sagt, welche funktionieren), `add`, `edit` und `remove`. |
| `hydor connections` | Die [Verbundenen Apps](/guide/connections) (Notion, GitHub, Gmail …): `list`, `show`, `services` (was verbunden werden kann), `connect <service>` (ein verdeckt eingegebener Key oder eine Anmeldung in deinem Browser, auf die der Befehl wartet) und `disconnect`. Welche Tools einer Verbindung aktiv sind, steht auf ihrer Seite. |
| `hydor keys` | Der [Tresor](/guide/connections): `list` die Namen deiner Keys und wohin jeder gehen darf, `set <NAME>` und `remove <NAME>`. Ein Wert wird abgefragt, wobei deine Eingabe verborgen bleibt, oder aus dem gelesen, was du hineinleitest; er wird nie als Option getippt (deine Shell würde ihn behalten) und nie ausgegeben. |

```bash
hydor memory add I prefer short answers
hydor memory forget 42
hydor skills off research
hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp
hydor keys set GITHUB_TOKEN --domain github.com
hydor guidelines edit --project thesis
hydor connections connect notion --browser
```

### Einstellungen

`hydor settings` erreicht jede Option der [Einstellungen](/settings), in ihren drei Gruppen (**App**, **Agenten**, **Funktionen**) und deren Bereichen. Jede Option hat eine ID, zum Beispiel `general.resume-after-usage-limits`: ihren Bereich, dann ihre Wörter. Du kannst eine über diese ID benennen, über ihren Bereich und den Anfang ihrer Wörter (`general.resume`) oder über ihre Wörter allein, wenn nur eines passt; Tab vervollständigt sie.

In einem Terminal öffnet `hydor settings` allein einen Browser: Wähle einen Bereich, dann eine Option. **↑** und **↓** und Tippen finden sie, die **Eingabetaste** öffnet einen Bereich oder ändert eine Option (ein Schalter wird umgelegt, eine Auswahl bietet ihre Werte an, eine Zahl oder ein Text wird eingetippt, bei einer Schaltfläche wird vorher nachgefragt), und **Esc** geht zurück. Bei umgeleiteter Ausgabe listet er jede Option auf. Für Skripte und schnelle Änderungen:

| Befehl | Was er tut |
| --- | --- |
| `hydor settings list [section]` | Jede Option mit ihrem Wert, oder die eines Bereichs. |
| `hydor settings get <option>` | Der Wert einer Option und was sie annimmt. |
| `hydor settings set <option> <value>` | Ändert sie: Ein Schalter nimmt `on` oder `off`, eine Auswahl einen ihrer Werte, eine Zahl eine ganze Zahl, eine Liste ihre Einträge mit Kommas (`none` leert sie). Ein Key oder Token wird verdeckt abgefragt oder aus dem gelesen, was du hineinleitest. Ein langer Text kommt aus `--file` oder deinem Editor. |
| `hydor settings run <option>` | Drückt eine Schaltfläche der Seite (**Testbenachrichtigung senden**, **Jetzt prüfen** …), und fragt vorher nach, wenn dabei etwas entfernt oder heruntergeladen wird. |
| `hydor settings open [section]` | Die Adresse eines Bereichs oder einer Option in der App. |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

Was die App in jedem Browser speichert (das Design, die Sprache, der Benachrichtigungston), kann von hier aus nicht geändert werden: Eine solche Option sagt das und nennt die Adresse der Seite. Eine Option, die nur die Seite ändern kann, tut dasselbe. Die zwei Geräteeinstellungen, die zu einem Terminal gehören, **Senden, während ein Agent arbeitet** und **Terminalvorschläge**, gehören dem Chat selbst, und `hydor settings set` ändert sie.

### Suchen, Anleitung, Öffnen und API

- `hydor find rate limit` durchsucht alles, was das Suchfeld durchsucht (**Ctrl+K**): Seiten, Einstellungen und ihre Optionen, Sitzungen, Memory, Skills … `--in settings` sucht nur dort, `--urls` zeigt die Adresse jedes Ergebnisses darunter, und `--open 2` öffnet das zweite in deinem Browser.
- `hydor guide` listet die Themen der Anleitung auf; `hydor guide projects` liest eines im Terminal, und `hydor guide projects "what a project is"` einen Abschnitt davon. `--sections` listet die Abschnitte eines Themas auf.
- `hydor open` gibt die Adresse der App aus; `hydor open published`, `hydor open settings memory`, `hydor open project thesis`, `hydor open guide projects` oder `hydor open 6f1e2a3b` (eine Sitzung) geben die der jeweiligen Seite aus. `--browser` öffnet sie zusätzlich in deinem Browser. So erreichst du, was nur eine Seite kann: die Editoren für Folien, Tabellen, Bilder und Diagramme, eine Signatur, die Farben eines Designs, die Anmeldung bei einem Dienst.
- `hydor api GET /api/projects` ruft einen beliebigen Endpunkt der API der App auf und gibt sein JSON aus (`hydor api POST /api/projects -d '{"name":"Thesis"}'`; der Body kann aus `@file` oder `-` kommen). Die Endpunkte stehen im [API-Thema](/guide/api).

### Im Chat

`/hydor <command>` führt jeden Befehl oben aus, ohne die Unterhaltung zu verlassen: `/hydor sessions`, `/hydor memory search docker`, `/hydor settings get general.resume-after-usage-limits`. Er steht im `/`-Menü und im Teil **Also** von `/help`. Nach `/hydor ` listet sein Menü die Bereiche, dann ihre Verben, dann was jedes annimmt (deine Projekte, Sitzungen, Einstellungen, Ordner … so, wie Tab sie in einer Shell vervollständigt) und seine Optionen, wenn du ein `-` tippst. Was der Befehl ausgibt, erscheint über der Eingabezeile, und eine falsche Verwendung oder eine Antwort, die Hydor ablehnt, wird rot angezeigt; der Chat läuft weiter. Der Befehl fragt nach wie in einer Shell, aber im Chat: Eine Frage (ein Entfernen) öffnet eine Auswahl, deren erste Zeile **Nein** ist, ein Key oder ein Token wird in die Eingabezeile getippt, als Punkte angezeigt und nie in deinem Verlauf gespeichert, und ein Editor, den er braucht, bekommt das Terminal, so wie bei `!`. Im Chat gibt es keine umgeleitete Eingabe, gib also einen langen Text mit `--file <path>` an (oder lass es weg, um ihn im Editor zu schreiben). Ein Befehl, der einen eigenen Slash-Befehl hat (`models` hat `/model`, `tiers` hat `/tiers`, `usage` hat `/usage`) oder für eine Shell gedacht ist (`run`, `serve`), sagt das und nennt, welchen du verwenden sollst.

## Dieses Hydor pflegen

- `hydor status` zeigt, ob Hydor läuft, welche Version und welche Adresse es hat, wo seine Daten liegen, ob es als Dienst läuft und welche Sitzungen arbeiten oder dich brauchen (mit denselben Markierungen wie bei `hydor sessions`).
- `hydor serve` führt Hydor hier im Vordergrund aus, bis du Ctrl+C drückst. `hydor service install` hält es als Hintergrunddienst am Laufen, `hydor update` holt den neuesten Code, baut ihn und startet neu, und `hydor set-password`, `hydor setup-token` und `hydor access-token` tun, was ihre Namen sagen. In der Mac-App sagen `hydor update`, `hydor service install` und `hydor serve`, dass die App das selbst erledigt.
- `hydor open` gibt die Adresse der App aus; mit `--browser` wird sie geöffnet.
- `hydor machines phone` zeigt, ob Tailscale hier installiert und angemeldet ist, und unter welcher Adresse die App in deinem Tailnet bereitgestellt wird, mit einem QR-Code für die Kamera deines Handys. `hydor machines phone serve` veröffentlicht die App für deine eigenen Geräte (`--port 8443`, wenn unter der üblichen Adresse etwas anderes läuft), und `hydor machines phone stop` nimmt sie wieder heraus, so wie es [Einstellungen → App → Auf dem Handy nutzen](/settings?s=phone) tut.

## Das Hydor eines anderen Computers nutzen

Erstelle auf diesem Computer ein Zugriffstoken (in seinen [Einstellungen → App → Computer](/settings?s=machines&find=Access%20from%20other%20machines) → **Neues Token**, oder dort mit `hydor access-token "mein Laptop"`) und gib es dann zusammen mit der Adresse des Computers an:

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

oder setze `HYDOR_URL` und `HYDOR_TOKEN` einmalig. Ordner sind die des anderen Computers: Eine Sitzung startet in dessen Standardordner, es sei denn, du gibst `--cwd` mit einem Ordner dort an (bei einer Adresse auf diesem Computer selbst, etwa `http://localhost:8790`, bleibt der Ordner, in dem du gerade bist). `!`-Befehle funktionieren nur mit dem Hydor dieses Computers. Auf diesem Computer erstellt der Befehl beim ersten Mal ein eigenes Token, das [Einstellungen → App → Computer](/settings?s=machines&find=Access%20from%20other%20machines) als „Befehlszeile dieses Computers“ auflistet. Damit dieses Hydor die Sitzungen und Seiten eines anderen Computers zeigt, füge ihn als Computer hinzu: `hydor machines` listet die Computer auf, die dieses Hydor nutzt, und ob sie antworten, `hydor machines add Lab --url https://lab.example.com` fügt einen hinzu (gib `--ssh <host>` statt `--url` an, um ihn über SSH zu erreichen; sein Zugriffstoken wird verdeckt eingegeben oder kommt aus `--file -`), und `hydor machines remove lab` beendet die Nutzung.

## Farben und Pipes

Farben sind in einem Terminal an (True Color, wo vorhanden) und aus, wenn die Ausgabe in eine Datei oder ein anderes Programm geht, sowie wenn `NO_COLOR` gesetzt ist oder `--no-color` angegeben wird; `FORCE_COLOR` schaltet sie ein. Wenn das, was du tippst, per Pipe hereinkommt (`echo "…" | hydor`), funktioniert es wie `hydor run`. Wenn nur die Ausgabe per Pipe weitergeleitet wird, wird die Unterhaltung ohne Farben und ohne die sich verändernden Zeilen ausgegeben, und jede Zeile, die du tippst, wird gesendet. Listen wie `hydor sessions` geben dann dieselben Spalten aus, ohne Farben und ohne Langes abzuschneiden, damit Skripte sie lesen können. In einem schmalen Terminal lässt eine Liste ganze Spalten weg (zuerst eine Beschreibung, dann andere wie eine Adresse oder ein Alter), statt Namen und Titel zu kürzen. Wo Symbole nicht dargestellt werden können (die Linux-Konsole, eine Locale ohne UTF-8 und die alte Windows-Konsole), zeichnet der Befehl mit einfachen Zeichen: `+-|` für den Rahmen, `>` für die Eingabeaufforderung, `*`, `+` und `x` für Markierungen und HYDOR für das Logo. `HYDOR_ASCII=1` schaltet das überall ein und `HYDOR_ASCII=0` schaltet es aus. Was in eine Datei oder ein anderes Programm geht, behält seine Symbole, sofern nicht `HYDOR_ASCII=1` gesetzt ist.

## Einen Agenten fragen

- „Wie spreche ich von meinem Terminal aus mit einem Agenten?“
- „Schalte die Tab-Vervollständigung für den Befehl hydor in meiner Shell ein.“
- „Gib mir ein Skript, das mit hydor run eine Prüfung meiner vorgemerkten Änderungen durchführt und den Commit scheitern lässt, wenn es einen Fehler findet.“
- „Was bedeutet der Exit-Code 3 von hydor run?“
- „Der Browser des Agenten will auf einer Website auf Senden klicken: Was drücke ich im Terminal?“
- „Mein hydor run hat angehalten, weil der Browser des Agenten auf eine Anmeldung wartet: Wie mache ich weiter?“
- „Richte den Befehl hydor auf meinem Laptop so ein, dass er das Hydor dieses Computers nutzt.“
- „Welcher hydor-Befehl listet meine Geplanten Aufgaben auf, und wie schalte ich eine vom Terminal aus ab?“
- „Welcher hydor-Befehl speichert die Unterhaltung einer Sitzung als Markdown-Datei?“
- „Lass das Terminal warten, bis ein Durchgang zu Ende ist, bevor es meine Nachricht sendet.“
- „Schalte die grauen Vorschläge im Terminal aus.“
