# Hydor im Terminal

Der Befehl `hydor` macht im Terminal, was du auf den Seiten der App tust: mit einem Agenten sprechen und seine Arbeit verfolgen, während sie geschieht, genehmigen, worum er bittet, und seine Fragen beantworten, eine einzelne Anfrage aus einem Skript ausführen und die Antwort zurückbekommen und alles verwalten, was die App speichert: deine Sitzungen, Projekte, Agenten, Memory, Skills, Plugins, Keys, geplante Aufgaben, Nutzung und jede Einstellung. Wo nur eine Seite etwas kann (eine Unterschrift zeichnen, die Editoren für Folien und Diagramme), gibt dir der Befehl die Adresse der Seite. Er verwendet dasselbe Hydor wie die App, also erscheint eine im Terminal gestartete Sitzung in der App, und eine in der App gestartete läuft im Terminal weiter. Deine Shell vervollständigt ihn beim Tippen.

![Der hydor-Befehl: Begrüßungsfeld und Menü nach Eingabe eines Schrägstrichs](images/terminal.webp)

## Den Befehl einrichten

- **Installation mit `./install.sh`**: Der Installer verlinkt `hydor` nach `~/.local/bin`, sofern der Ordner auf PATH liegt, und meldet das. Andernfalls nennt er `bin/hydor.mjs` im Hydor-Ordner zur direkten Ausführung oder eigenen Verknüpfung.
- **Docker**: Der Befehl ist enthalten. `docker exec -it hydor hydor` öffnet die Unterhaltung im Container.
- **Mac-App**: Bei jedem Start richtet sie `hydor` automatisch auf PATH ein, im ersten beschreibbaren vorhandenen Suchordner aus `~/.local/bin`, `~/bin`, `/usr/local/bin` und `/opt/homebrew/bin`. Ist keiner dieser Ordner geeignet, verwendet sie `~/.local/bin` und ergänzt eine gekennzeichnete PATH-Zeile in der Shell-Startdatei, bei zsh `~/.zprofile`. Öffne danach ein neues Terminal. Der Befehl nutzt das Node.js der App und öffnet sie bei Bedarf. Aus einem Disk-Image oder vor dem Verschieben nach **Programme** wird nichts eingerichtet. `hydor update`, `hydor service install` und `hydor serve` weisen in der Desktop-App darauf hin, dass die App das selbst verwaltet.
- **Die Desktop-Apps für Linux und Windows** tun dasselbe bei jedem Start, ohne Passwort und ohne Rückfrage. Unter **Linux** (das AppImage oder die .deb) ist der Befehl eine kleine Datei `hydor` in `~/.local/bin`, `~/bin` oder `/usr/local/bin`, und zwar im ersten dieser Ordner, der in deinem PATH liegt und in den du schreiben darfst. Ist keiner dabei, nimmt sie `~/.local/bin` und fügt der Startdatei deiner Shell eine Zeile hinzu, die als die von Hydor gekennzeichnet ist. Das `/usr/bin/hydor` der .deb öffnet das Fenster der App, deshalb steht der Befehl in deinem PATH davor. Unter **Windows** legt sie `hydor.cmd` in deinen WindowsApps-Ordner, den Windows ohnehin durchsucht; sonst in `%LOCALAPPDATA%\Hydor\bin`, das sie deinem PATH hinzufügt. Öffne danach ein neues Terminal (Windows Terminal, PowerShell oder Eingabeaufforderung). Wie auf dem Mac führt der Befehl das Node.js der App aus, `hydor` öffnet die App, wenn sie geschlossen ist, und `hydor update`, `hydor service install` und `hydor serve` sagen nur, dass die App das selbst erledigt. Ist schon ein anderes `hydor` in deinem PATH (der Link, den der Installer auf eine Kopie aus git anlegt), lässt die App alles unberührt. Von einer Kopie von Hydor auf einem anderen Computer aus kannst du trotzdem das dortige Hydor verwenden: siehe [Hydor eines anderen Computers verwenden](#use-another-computers-hydor).

`hydor help` listet Befehle nach Gruppen. `hydor help <command>` erklärt Verwendung, Optionen und Beispiele, `hydor help options` alle Optionen und `hydor help <command> <verb>` einzelne Aktionen. Wartungsbefehle heißen ebenfalls `hydor service status`, `hydor setup-token`, `hydor update` und so weiter. `node dist/server/cli.js …` funktioniert weiterhin. Bei Tippfehlern schlägt die Hilfe passende Namen vor. Fehler erscheinen rot.

Beginnt deine Nachricht mit einem Befehlsnamen, setze sie in Anführungszeichen wie `hydor "find the bug in login"` oder verwende `hydor chat`, damit sie nicht als Befehl interpretiert wird.

Du musst Hydor nicht vorher starten. Antwortet auf diesem Computer nichts, startet der Befehl es im Hintergrund, sagt **Starting Hydor…** und lässt es nach seinem Ende weiterlaufen, damit deine Sitzungen weitergehen. `hydor status` sagt, welches Hydor er verwendet, seine Version, ob es als Dienst läuft und was gerade arbeitet. Auf einem Computer mit der Desktop-App wird stattdessen eine geschlossene App geöffnet: Der Befehl startet keinen eigenen Server.

## Tab-Vervollständigung in der Shell

Aktiviere sie einmal:

```bash
hydor completion install
```

Der Befehl richtet bash, zsh oder fish passend ein. Für zsh und bash ohne bash-completion ergänzt er eine Zeile in `.zshrc` oder `.bashrc`. Öffne anschließend ein neues Terminal. Erneute Einrichtung erzeugt keine Duplikate. `hydor completion bash`, entsprechend zsh oder fish, gibt stattdessen das Skript aus, etwa für `source <(hydor completion bash)`.

Dann ergänzt Tab, was du tippst: die Befehle, ihre Aktionen und Optionen und das, was sie annehmen. Nach `hydor show ` oder `hydor send ` listet es die Keys deiner Sitzungen auf, jeden mit seinem Titel; nach `--model` die Modelle, nach `--as` deine Agenten, nach `--cwd` Ordner; und auf dieselbe Weise Projekte, Skills, Plugins, Einstellungen, Themen der Anleitung und mehr, so wie sie in diesem Hydor sind. Antwortet Hydor nicht schnell, bietet die Vervollständigung an, was sie ohne es kann, und hält deine Shell nie auf.

## Mit einem Agenten sprechen

Starte im gewünschten Ordner `hydor` oder direkt `hydor fix the failing test`. Die erste Nachricht erstellt dort eine Sitzung.

Der Chat öffnet sich mit einem Begrüßungsfeld, einem Kasten mit **HYDΩR** und seiner Version im oberen Rand. Darin stehen der Ordner „on“ seinem Git-Branch (hat Git keinen zu nennen, wird kein Branch gezeigt); dann das Programm, das dir antwortet (**Claude Code**, **Codex** oder **Custom**), das Modell (**Automatisch**, wenn sich das Modell nach der Aufgabe richtet, bei einem Hydor mit Leistungsstufen) und der Berechtigungsmodus, mit einem · dazwischen; der Modus erscheint rot, wenn der Agent ohne Nachfrage handelt, und in der Akzentfarbe beim Planen; und eine Zeile mit Hinweisen: `/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`. Der Kasten behält dieselbe Breite, egal wie der Ordner heißt.

Was du siehst, bleibt im eigenen Verlauf des Terminals, sodass du zurückscrollen und daraus kopieren kannst, auch über SSH und in tmux:

- **Deine Nachrichten** beginnen mit `›`.
- **Agententext** erscheint fortlaufend mit Überschriften, Listen, Zitaten, Tabellen, Links samt Adresse und nicht neu umgebrochenem, kopierbarem Code.
- **Jeder Schritt** in einer Zeile: was er gelesen, durchsucht, bearbeitet (mit den hinzugefügten und entfernten Zeilen) und ausgeführt hat (mit der Zeit, die es gedauert hat, und bei einem Fehlschlag mit dem Exit-Code und darunter der ersten Zeile des Fehlers).
- **Denkzeit** erscheint als zurückhaltende Zeile, etwa „8 Sek. nachgedacht“. `--thinking` zeigt mehr, `-v` erste Zeilen der Schrittausgaben.
- **Subagenten**: „Subagent started“, wenn der Agent einen Teil seiner Arbeit an einen [Hydor-Subagenten](/guide/research#let-an-agent-hand-work-to-subagents) übergibt, und „Subagent finished“ (oder „Subagent failed“), wenn seine Antwort zurückkommt. Claude Code kann auch eigene Subagenten im Hintergrund ausführen und seinen Durchlauf beenden, während sie arbeiten: Die unteren Zeilen sagen, welche im Hintergrund arbeiten, „Finished in the background“ erscheint, sobald einer endet, und der Agent macht von selbst weiter. Ein Befehl, den er im Hintergrund laufen lässt, etwa ein Entwicklungsserver, hält nichts auf. `/subagents` listet sie alle auf, mit dem, was jeder gerade tut (und was ein Subagent gekostet hat).
- **Das Ende jedes Durchlaufs**: wie lange er gedauert hat, was er gekostet hat, das Modell und wie viele Subagenten gearbeitet haben („1 subagent“, „3 subagents“).

Unten ändern sich ein paar Zeilen, während der Agent arbeitet: der Text, der noch geschrieben wird, der Schritt, der gerade läuft, die Subagenten bei der Arbeit, ein farbiger Spinner mit der bisherigen Zeit (ein Schimmer läuft über „Arbeitet“) und deine Eingabezeile. Drücke Esc oder Strg+C, um den Durchlauf zu stoppen.

### Die Eingabezeile

Deine Eingabe steht zwischen zwei dünnen Linien, darunter eine Statuszeile: der Ordner auf seinem Branch, das Modell und der Modus und die bisherigen Kosten, rechts `/help`.

- **Graue Vorschläge** aus früheren Nachrichten ergänzen deinen Text. ** → ** übernimmt alles, **Alt+ → ** ein Wort. [Einstellungen](/settings?s=general&find=Terminal%20suggestions) → App → Allgemein → **Terminalvorschläge** schaltet sie um.
- **Strg+R** durchsucht deine früheren Nachrichten: Tippe einige ihrer Wörter, gehe mit **↑** und **↓** zu einem Treffer, und die **Eingabetaste** setzt ihn in die Zeile, ohne ihn zu senden, damit du ihn vorher ändern kannst. **Esc** bricht ab.
- Mehrzeilige Nachrichten und vollständiges Einfügen aus der Zwischenablage sind möglich.

### Das Vervollständigungsmenü

Ein Menü öffnet sich unter der Zeile, während du tippst, und hält mit jeder Taste Schritt:

| Eingabe | Angebot |
| --- | --- |
| `/` | Befehle mit Beschreibung, zuerst die Chatbefehle und danach Programmeigene, etwa Claude-Code-Befehle und Skills. |
| `/model `, `/mode `, `/effort `, `/agent `, `/subagents `, `/open ` | Passende Modelle, Modi, Denkstufen, Agenten, Subagenten und Öffnungsziele. |
| `@` mit einigen Buchstaben | Unscharf gesuchte Dateien im Sitzungsordner. `@clits` findet `src/cli.ts`. Ein abschließendes `/` durchsucht den Unterordner. |

**↑** und **↓** bewegen die Auswahl, **Tab** vervollständigt die markierte Zeile, und die **Eingabetaste** vervollständigt sie und führt sie aus (ein Befehl, der einen Wert braucht, öffnet stattdessen die Werte dieses Befehls). **Esc** schließt das Menü. Der Abgleich ist großzügig, und die Buchstaben eines Befehls müssen nicht nebeneinander stehen: `mdl` findet `/model`.

### Auswahlmenüs

`/sessions`, `/resume`, `/model`, `/effort`, `/mode` und `/agent` öffnen ohne Wert eine Auswahl: eine Liste mit einer markierten Zeile. **↑** und **↓** bewegen, Tippen grenzt die Liste ein, die **Eingabetaste** wählt, **Esc** verlässt sie. Eine Ziffer wählt weiterhin, wenn die Liste neun Zeilen oder weniger hat. `hydor resume` ohne Key öffnet dieselbe Auswahl deiner Sitzungen.

### Shell-Befehle mit `!`

`!` am Zeilenanfang führt den Rest als Shell-Befehl im Sitzungsordner aus, etwa `!git status` oder `!npm test`. Interaktive Programme wie `!vim notes.md` und `!htop` übernehmen vorübergehend das Terminal. Danach kehrt der Chat zurück. Die Eingabe wird bei `!` gelb. Agenten sehen Befehl und Ausgabe nicht; teile benötigte Ergebnisse ausdrücklich mit. Das funktioniert nur mit lokalem Hydor.

### Anfragen des Agenten beantworten

Braucht der Agent deine Genehmigung, erscheint die Anfrage mit dem, worum es geht (der Befehl, die Änderung an einer Datei, der Plan), und darunter seine Auswahlmöglichkeiten:

- **y** erlaubt mit der ersten zustimmenden Option, **n** lehnt ab. Die jeweilige **Ziffer** wählt andere Optionen wie dauerhafte Freigaben.
- Zum Ablehnen mit alternativer Anweisung schreibe deinen Text und drücke Enter.

Eine Frage zeigt ihre Auswahlmöglichkeiten nummeriert: Drücke eine Zahl, um eine zu wählen (mehrere bei einer Frage, die mehrere annimmt, dann die Eingabetaste), oder tippe deine eigene Antwort und drücke die Eingabetaste. Esc überspringt sie. Ein Formular fragt seine Felder nacheinander ab: Tippe jede Antwort und drücke die Eingabetaste, oder drücke die Eingabetaste, um zu behalten, was es zeigt. Nach einer Datei wird mit ihrem Pfad auf diesem Computer gefragt.

Manche Anfragen brauchen die App: eine nach einer Unterschrift oder einem Key für eine deiner Apps. Das Terminal sagt das und gibt die Adresse der Sitzung in der App an.

### Während der Arbeit

Deine Eingabezeile bleibt deine. Was die Eingabetaste mit einer Nachricht macht, die du sendest, während der Agent arbeitet, bestimmt **Senden, während ein Agent arbeitet** in [Einstellungen → App → Allgemein](/settings?s=general&find=Sending%20while%20an%20agent%20works): **In laufenden Durchlauf senden** (die Voreinstellung, wie in der App) gibt sie in den laufenden Durchlauf, und **Auf Ende warten** reiht sie ein, damit sie beim Ende des Durchlaufs geht (sie erscheint als **queued**). Was auch eingestellt ist, zwei Befehle entscheiden für eine Nachricht:

- `/queue <message>` wartet immer bis zum Durchlaufende.
- `/now <message>` fügt immer sofort ein.

Die beiden Geräteeinstellungen, **Senden, während ein Agent arbeitet** und **Terminalvorschläge**, gehören dem Chat selbst: Stelle sie hier ein, mit `hydor settings set general.sending-while-an-agent-works wait`, oder bitte den Agenten, eine zu ändern (siehe [Einstellungen](#settings)), und der Chat folgt sofort.

### Tastenkürzel

- **Enter** sendet. **Alt+Enter**, **Strg+J** oder ein `\` vor Enter erzeugt eine neue Zeile. Einfügen übernimmt Zeilenumbrüche vollständig.
- **↑** und **↓** durchsuchen die letzten 500 Nachrichten, innerhalb mehrzeiliger Nachrichten zunächst die Zeilen. Bei offenem Menü bewegen sie die Auswahl.
- **←**, ** → **, **Pos1**, **Ende**, **Strg+A** und **Strg+E** bewegen den Cursor. **Alt+←** und **Alt+ → ** springen wortweise. **Strg+W** löscht das vorherige Wort, **Strg+U** beziehungsweise **Strg+K** den Zeilenrest davor oder danach.
- **Tab** öffnet oder übernimmt die Auswahl. **Strg+R** sucht frühere Nachrichten.
- **Esc** schließt das Menü oder stoppt den Durchlauf. **Strg+C** stoppt aktive Arbeit, leert sonst Text und beendet bei leerer Eingabe nach zweimaligem Drücken. **Strg+D** beendet bei leerer Eingabe. **Strg+L** leert den Bildschirm. **Strg+Z** hält den Chat an; `fg` setzt ihn fort.

`/keys` listet die Kürzel. Beim Verlassen läuft die Sitzung weiter und das Terminal nennt den Weg zurück.

### Chatbefehle

Gib sie direkt ein; `/` zeigt die Liste:

- `/help`: die Befehle, die Tasten und ein paar weitere Dinge (`@`, `!`), in Abschnitten: **Befehle**, **Keys**, **Also**. `/keys` listet nur die Tasten auf.
- `/new` mit optionaler Nachricht erstellt eine Sitzung im selben Ordner.
- `/sessions` oder `/resume` wählt eine Sitzung zur Fortsetzung.
- `/model`, `/effort`, `/mode`: ändern das Modell, wie gründlich es nachdenkt und was es ohne Nachfrage tun darf. Ohne Namen öffnet jeder eine Auswahl.
- `/agent` arbeitet ab der nächsten Nachricht als einer [deiner Agenten](/guide/agents).
- `/subagents`: die Subagenten, auch die im Hintergrund, mit dem, was jeder gerade tut (und was ein Subagent gekostet hat); `/subagents 2` zeigt die Unterhaltung des zweiten Subagenten.
- `/tiers`, `/usage`, `/cost`: welches Modell jede Leistungsstufe bedeutet, die Nutzung und die Limits deiner Abos und was diese Sitzung und ihre Subagenten gekostet haben.
- `/copy`: kopiert die letzte Antwort des Agenten in die Zwischenablage, auch über SSH und in tmux. `/clear` leert den Bildschirm.
- `/queue` und `/now`: senden eine Nachricht zum Warten oder zum Dazukommen, je nachdem, was eingestellt ist ([Während der Arbeit](#while-it-works)).
- `/stop`, `/rename`, `/open`, `/quit` stoppen einschließlich Hintergrundsubagenten, benennen um, zeigen die App-Adresse oder beenden.
- `/hydor <command>` führt Verwaltungsbefehle direkt im Chat aus; siehe [Innerhalb des Chats](#inside-the-chat).

Andere `/command`-Eingaben gehen unverändert an den Agenten für dessen eigene Befehle und Skills.

Unterstützte Terminals verwenden Echtfarben. `NO_COLOR`, `--no-color` und Weiterleitungen schalten Farben aus.

## Eine Sitzung fortsetzen

- `hydor -c` setzt die neueste Sitzung des aktuellen Ordners fort.
- `hydor resume` öffnet eine Auswahl deiner neuesten Sitzungen; `hydor resume 6f1e2a3b` macht mit genau dieser weiter.

Zunächst erscheinen letzte Durchläufe mit zusammengefassten Schritten wie „3 Befehle ausgeführt, 4 Dateien gelesen“. `hydor show` zeigt alles.

## Den Sitzungsstart festlegen

Diese Optionen gelten für `hydor`, `hydor run` und `hydor resume`:

- `--agent claude`, `codex`, `custom` oder der Name eines [anderen Agentenprogramms](/guide/agents-models): welches Programm antwortet.
- `--model` (der Name eines Modells oder `auto` für Automatisch), `--effort` und `--mode ask`, `edits`, `plan` oder `full` (oder der eigene Name des Programms für einen Modus).
- `--as Researcher` startet als einer [deiner Agenten](/guide/agents).
- `--cwd` für den Ordner, sonst aktueller Ordner, `--worktree` für eigenen Branch und Ordner, `--cap 2` für höchstens $2, `--no-memory` und `--title`.

Fehlende Werte stammen zuerst aus der letzten Startseitenauswahl und danach aus den App-Standards.

## Einen einzelnen Auftrag aus einem Skript ausführen

`hydor run "…"` oder `hydor -p "…"` erstellt eine Sitzung, wartet auf Abschluss, gibt die letzte Antwort aus und beendet sich. Abgeschlossen bedeutet: Der Durchlauf ist beendet, alle Subagenten einschließlich Claude Codes Hintergrundagenten sind fertig und ihre Antworten zugestellt, die Warteschlange ist leer. Ein wartender Hauptagent wird nach Subagentenrückmeldungen fortgesetzt; auch darauf wartet der Befehl. Ein laufender Entwicklungsserver blockiert den Abschluss nicht. Bei `--timeout` oder Strg+C werden Hintergrundsubagenten mitgestoppt. Ohne Nachricht wird Standardeingabe gelesen, etwa `git diff | hydor run "review this change"`.

- In einem Terminal sagen kurze Zeilen am Rand, was passiert (jeder Schritt, Subagenten beim Start und beim Ende); `-q` schaltet sie aus.
- Freigaben und Fragen unterbrechen den unbeaufsichtigten Lauf. Das Terminal nennt die Anfrage; in App oder `hydor resume` kannst du antworten. Mit `--mode full` oder `-y` fragt der Agent nicht.
- `--json` erzeugt am Ende ein Objekt mit `key`, `url`, `status`, `reply`, `model`, `costUsd` einschließlich Subagenten, `tokens`, `durationMs`, `turns`, `children` mit `title`, `label`, `tier`, `costUsd`, `status` je Hydor-Subagent und bei Fehlern `error`. `--stream-json` liefert fortlaufende Zeilen für `item`, `live`, `note` und abschließend dasselbe Ergebnisobjekt.
- `--timeout 300` stoppt nach 300 Sekunden.

Exit-Codes für Skripte:

| Code | Bedeutung |
| --- | --- |
| 0 | Abgeschlossen |
| 1 | Die Sitzung ist fehlgeschlagen (ein Fehler oder das Nutzungslimit des Abos, das sie nennt), oder Hydor hat abgelehnt |
| 2 | Falsche Befehlsverwendung |
| 3 | Benötigt deine Antwort |
| 124 | Zeitlimit aus `--timeout` überschritten |
| 130 | Durch Strg+C beendet; vorher wurde der Durchlauf gestoppt |

## Alle App-Funktionen im Terminal

Jeder Teil der App hat einen eigenen Befehl, mit Aktionen für das, was seine Seite tut. Lässt du die Aktion weg, listet er auf: `hydor projects` ist `hydor projects list`. `hydor help` zeigt sie gruppiert wie unten, und Tab vervollständigt die Aktionen, die Optionen und das, was sie annehmen.

Gemeinsame Bedienung:

- **Dinge benennen**: Wo ein Befehl eines von etwas annimmt (eine Sitzung, ein Projekt, einen Agenten, einen Skill …), gib seine ID oder deren Anfang an, oder seinen Namen oder Titel (in beliebiger Schreibweise, wenn nur einer passt). Bei zwei oder mehr Treffern listet er bis zu fünf auf. In einem Terminal bietet der Befehl eine Liste zur Auswahl an, wenn du den Namen weglässt.
- **Ändern**: Felder heißen etwa `--description` und `--name`. Lange Texte stammen aus `--file <path>`, weitergeleiteter Eingabe mit `-` oder, wenn beides fehlt und du ein interaktives Terminal verwendest, deinem Editor aus `$VISUAL` beziehungsweise `$EDITOR`, der den aktuellen Text öffnet. Unverändertes Speichern ändert nichts.
- **Entfernen** fragt nach Bestätigung. `-y` oder `--yes` stimmt zu. Ohne interaktives Terminal und ohne diese Option wird abgelehnt.
- **`--json`** gibt die unveränderte API-Antwort für Skripte aus.
- **Exit-Codes**: 0, wenn er fertig ist, 1, wenn Hydor abgelehnt hat oder etwas fehlgeschlagen ist (er sagt, warum), 2, wenn der Befehl falsch verwendet wurde (er sagt, was du tippen sollst).
- **Das Hydor eines anderen Computers**: Jeder Befehl funktioniert mit `--server` und `--token`.
- **Nur eine Seite kann es**: Der Befehl sagt das und gibt die Adresse der Seite an. `hydor open … --browser` öffnet sie.

### Sitzungen

| Befehl | Funktion |
| --- | --- |
| `hydor sessions` | Neueste Sitzungen mit ● arbeitet, ● braucht dich, ✓ abgeschlossen und ✗ Fehler. Aktionen entsprechen dem Sitzungsmenü: `search`, `rename`, `archive`, `unarchive`, `pin`, `unpin`, `read`, `snooze`, `move` in ein Projekt, `fork`, `goal`, `share` als schreibgeschützter Link, `changes`, `commands`, `queue` mit `queue clear` und `queue remove`, `show`, `export` als Markdown, mit `-o -` zur Ausgabe oder `--library` als Bibliotheksdokument, sowie `send`, `stop` und `delete`. |
| `hydor inbox` | Was auf dich wartet (Genehmigungen, Fragen, ein Key, um den ein Agent gebeten hat, ein Skill zur Prüfung): `list` und `show` für einen Eintrag, mit dem Ort, an dem du ihn beantwortest. |
| `hydor outbox` | Zurückgehaltene Konto-Tool-Aufrufe mit Vorher fragen: `list`, `show` mit Eingaben, `send` unverändert oder mit `--set NAME=value` und `drop` zum Verwerfen. |
| `hydor away` | Ereignisse seit dem letzten Besuch wie unter **Während du weg warst**: offene Anfragen, abgeschlossene und fehlerhafte Sitzungen, automatische Läufe mit Kosten und heutige nächste Termine. `hydor away seen` markiert alles als gesehen. |

`hydor show 6f1e2a3b` entspricht `hydor sessions show 6f1e2a3b`. Auch `send` und `stop` behalten ihre Kurzformen.

```bash
hydor sessions search login          # sessions about login
hydor sessions rename 6f1e "Fix the login bug"
hydor sessions fork 6f1e "try it with a cache instead"
hydor sessions export 6f1e -o notes.md  # the conversation as Markdown
hydor inbox
hydor away                           # what happened while you were away
```

### Deine Arbeit

| Befehl | Funktion |
| --- | --- |
| `hydor projects` | `list`, `show`, `new`, `rename`, `edit` für Beschreibung, Richtlinien, Standardagent und Ordner, `sessions`, `files` für gelesene Dokumente mit `files add` und `files remove` sowie `remove`. |
| `hydor tasks` | [Geplante Aufgaben](/guide/tasks) und weitere automatische Arbeit: `list`, `show`, `new` mit `--every 2h`, `--at 09:00 --days weekdays`, `--cron`, `--once`, `--webhook`, `--watch-feed`, `--watch-page`, `--watch-folder` oder `--watch-account` mit `--tool` für neue Einträge einer verbundenen App. `--before 30m` startet vor Kalenderterminen. Außerdem `edit`, `pause`, `resume`, `run` auch bei Pause, `runs` mit `--reply` für Antworten und `remove`. Befehls- und JSON-Überwachung wird in der Oberfläche eingerichtet. Aktualisierungen einer Board-Karte erscheinen unter dem Board, etwa „Geschäft · Umsatz nach Tagen: aktualisieren“. `pause`, `resume` und `run` funktionieren auch dafür; `show` nennt den Bearbeitungsort auf dem Board. |
| `hydor apps` | Eigene und fertige [Apps](/guide/apps): `list`, `show`, `run` mit `field=value` oder `--input` JSON und Ausgabe samt Kosten, `runs`, `run-show` und `remove`. Der Singular `hydor app …` erstellt Apps als Dateien über `new`, `folder`, `dev`, `try`, `export` und `import`. |
| `hydor library` | [Bibliothek](/guide/library): `list` mit `--kind` und `--project`, `search`, `show` für Dokumenttext, Board-Karten oder Inhaltstyp, `export` mit `--to pdf`, `docx`, `pptx` und `-o file`, `open` für die Editoradresse, `remove`, `refreshes` für die Aktualisierungen deiner Boards samt Zeitplan und Kosten sowie `refresh`, um eine oder alle Karten eines Boards sofort zu aktualisieren. |
| `hydor experiments` | Trainings- und Evaluationsläufe mit `list`, `show` und `stop`. Neue Läufe starten Agenten oder die Oberfläche. |

```bash
hydor projects new Thesis
hydor projects edit thesis --file guidelines.md
hydor tasks new --at 09:00 --days weekdays "Summarise my unread email"
hydor apps run trip-planner destination=Lisbon days=5
hydor library export "Q3 report" --to pdf -o q3.pdf
```

### Agenten und Modelle

| Befehl | Funktion |
| --- | --- |
| `hydor models` und `hydor tiers` | Die Modelle, die jedes Programm anbietet, und welches Modell jede [Leistungsstufe](/guide/agents-models#tiers-a-model-for-each-kind-of-job) bedeutet (`hydor tiers set claude best opus --effort high`, `hydor tiers reset`; `hydor tiers team off` und `hydor tiers hard off` schalten **Subagenten koordinieren** und **Max für schwierige Probleme** aus, und `on` schaltet sie wieder ein). |
| `hydor usage` | Verbrauch, Limits und Zurücksetzung je Abo. |
| `hydor agents` | [Deine Agenten](/guide/agents) mit `list`, `show`, `new`, `edit`, `results`, `export`, `install` und `remove`. Eingebaute Agenten lassen sich kopieren, nicht ändern. Ergebnisziele werden je Ziel über `--results-to` bei `new` und `edit` gesetzt: `library` aktualisiert dieselbe Seite, `library:new` erstellt eine neue, `sheet` schreibt je Ergebnis eine Zeile in eine eigene Tabelle, `sheet:<spreadsheet>#<tab>` in eine vorhandene, außerdem `email:<addresses>`, `notify`, `file:<path>`, `webhook:<url>` oder `none`. Ausgabefelder werden auf der Agentenseite über `hydor open agents` eingerichtet. `results` listet Ergebnisse. `export` schreibt eine `.hydor-agent`-Datei mit `-o` und nennt ausgelassene Inhalte. `install <file>` erklärt Inhalt und Anforderungen, fragt nach und installiert neben gleichnamigen eigenen Agenten, außer bei `--replace`. `--schedules` übernimmt vorgeschlagene Zeitpläne pausiert. Siehe [Einen Agenten als Datei teilen](/guide/agents#share-an-agent-as-a-file). |
| `hydor accounts` | Die Anmeldungen von Claude Code und Codex: `list`, `show` (ein Konto: wer angemeldet ist und das Abo, ob neue Sitzungen damit starten, seine Nutzung und Limits, ob ein API-Key hinterlegt ist (nie der Key selbst) und ob eine Sitzung bei einem Limit wechselt), `add <program> <name>` (ein weiteres Konto, sofort angemeldet), `sign-in`, `sign-out`, `remove` und `use` (das Konto, mit dem neue Sitzungen starten). Der API-Key für API-Guthaben und die Schalter bei einem Nutzungslimit sind Einstellungen (`accounts.*`). |

```bash
hydor agents new Bookkeeper --tools read,edit --tier standard
hydor agents edit bookkeeper --results-to sheet --results-to email:sam@example.com
hydor agents export bookkeeper -o ~/Desktop/bookkeeper.hydor-agent
hydor agents install bookkeeper.hydor-agent --schedules
hydor tiers set claude best opus --effort high
hydor accounts add claude Work
hydor accounts use work
```

### Wissen und Werkzeuge der Agenten

| Befehl | Funktion |
| --- | --- |
| `hydor memory` | Notizen über dich mit `list`, `search`, `show`, `add`, `edit`, `forget` mit 30 Tagen Wiederherstellung und `restore`. `profile` und `profile edit` bearbeiten den zuerst gelesenen Steckbrief. `--scope`, `--project` und `--session` bestimmen den Bereich. |
| `hydor guidelines` | Richtlinien mit `show` und `edit` für alle Sitzungen, ein Projekt mit `--project` oder eine Sitzung mit `--session`. |
| `hydor skills` | Die Skills, die Agenten verwenden: `list`, `show`, `on`, `off`, `add` (aus einer `SKILL.md` oder einem Ordner) und `remove`. `--agent claude` oder `--agent codex` gilt für die Skills, die diese Programme selbst haben. |
| `hydor plugins` | Erweiterungen mit Skills und Tools: `list`, `show`, `on`, `off`, `add` eingebauter Plugins, Git-Adressen, ZIPs oder Ordner und `remove`. Eigene Plugins werden auf der Seite über `hydor open plugins` erstellt. |
| `hydor mcp` | Tool-Server (MCP) für Claude Code und Codex: `list`, `show` (ein Server: sein Programm, Bereich, Befehl oder Adresse, die Namen seiner Umgebungsvariablen und Header mit verborgenen Werten, an oder aus, und mit `--tools`, wie viele Tools er hat), `status` (startet jeden und sagt, welche funktionieren), `add`, `edit` und `remove`. |
| `hydor connections` | [Verbundene Apps](/guide/connections) wie Notion, GitHub und Gmail: `list`, `show`, `services`, `connect <service>` mit verdeckter Key-Eingabe oder wartender Browseranmeldung und `disconnect`. Einzelne Tools werden in der Oberfläche gesteuert. |
| `hydor keys` | [Tresor](/guide/connections): `list` mit Namen und erlaubten Zielen, `set <NAME>` und `remove <NAME>`. Werte werden verdeckt abgefragt oder aus Standardeingabe gelesen, niemals als Option übergeben oder ausgegeben, damit die Shell sie nicht speichert. |

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

`hydor settings` erreicht jede Option der [Einstellungen](/settings), in ihren drei Tabs (**App**, **Agenten**, **Funktionen**) und deren Abschnitten. Jede Option hat eine ID, etwa `general.resume-after-usage-limits`: ihr Abschnitt, dann ihre Wörter. Du kannst eine über diese ID nennen, über ihren Abschnitt und den Anfang ihrer Wörter (`general.resume`) oder nur über ihre Wörter, wenn nur eine passt; Tab vervollständigt sie.

In einem Terminal öffnet `hydor settings` allein einen Browser: Wähle einen Abschnitt, dann eine Option. **↑** und **↓** und Tippen finden sie, die **Eingabetaste** öffnet einen Abschnitt oder ändert eine Option (ein Schalter wird umgelegt, eine Auswahl bietet ihre Werte an, eine Zahl oder ein Text wird getippt, eine Schaltfläche fragt zuerst nach), und **Esc** geht zurück. Per Pipe aufgerufen, listet er jede Option auf. Für Skripte und schnelle Änderungen:

| Befehl | Funktion |
| --- | --- |
| `hydor settings list [section]` | Alle Optionen mit Werten oder ein Abschnitt. |
| `hydor settings get <option>` | Wert und erlaubte Eingaben einer Option. |
| `hydor settings set <option> <value>` | Ändert sie: Ein Schalter nimmt `on` oder `off`, eine Auswahl einen ihrer Werte, eine Zahl eine ganze Zahl, eine Liste ihre Einträge mit Kommas (`none` leert sie). Nach einem Key oder Token wird verdeckt gefragt, oder er wird aus dem gelesen, was du hineinleitest. Ein langer Text kommt aus `--file` oder deinem Editor. |
| `hydor settings run <option>` | Drückt eine Schaltfläche der Seite (**Testbenachrichtigung senden**, **Jetzt prüfen** …), mit Rückfrage, wenn dabei etwas entfernt oder heruntergeladen wird. |
| `hydor settings open [section]` | Seitenadresse des Abschnitts oder der Option. |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

Browserspezifische Einstellungen wie Design, Sprache und Benachrichtigungston können hier nicht geändert werden. Die Ausgabe erklärt das und nennt die Seite. Dasselbe gilt für rein grafische Optionen. Die beiden Terminaleinstellungen **Senden, während ein Agent arbeitet** und **Terminalvorschläge** lassen sich dagegen mit `hydor settings set` ändern.

### Suchen, Hilfe, Öffnen und API

- `hydor find rate limit` durchsucht alles, was auch das Suchfeld durchsucht (**Strg+K**): Seiten, Einstellungen und ihre Optionen, Sitzungen, Memory, Skills … `--in settings` sucht nur dort, `--urls` zeigt die Adresse jedes Ergebnisses darunter, und `--open 2` öffnet das zweite in deinem Browser.
- `hydor guide` listet die Themen der Anleitung auf; `hydor guide projects` liest eines im Terminal, und `hydor guide projects "what a project is"` einen Abschnitt davon. `--sections` listet die Abschnitte eines Themas auf.
- `hydor open` gibt die Adresse der App aus; `hydor open library`, `hydor open settings memory`, `hydor open project thesis`, `hydor open guide projects` oder `hydor open 6f1e2a3b` (eine Sitzung) geben die der jeweiligen Seite aus. `--browser` öffnet sie zusätzlich in deinem Browser. So erreichst du, was nur eine Seite kann: die Editoren für Folien, Tabellen, Bilder und Diagramme, eine Unterschrift, die Farben eines Themes, die Anmeldung bei einem Dienst.
- `hydor api GET /api/projects` ruft API-Endpunkte auf und gibt JSON aus. Beispiel: `hydor api POST /api/projects -d '{"name":"Abschlussarbeit"}'`. Inhalte können aus `@file` oder `-` stammen. Siehe [API](/guide/api).

### Innerhalb des Chats

`/hydor <command>` führt jeden der oben genannten Befehle aus, ohne dass du die Unterhaltung verlässt: `/hydor sessions`, `/hydor memory search docker`, `/hydor settings get general.resume-after-usage-limits`. Du findest ihn im `/`-Menü und in `/help` unter **Außerdem**. Nach `/hydor ` zeigt sein Menü zuerst die Bereiche, dann deren Verben, dann das, was jedes davon annimmt (deine Projekte, Sitzungen, Einstellungen, Ordner … so, wie Tab sie in einer Shell vervollständigt), und seine Optionen, sobald du ein `-` tippst. Was der Befehl ausgibt, erscheint über der Eingabezeile; eine falsche Verwendung oder eine Antwort, die Hydor ablehnt, wird rot angezeigt, und der Chat läuft weiter. Der Befehl fragt so nach wie in einer Shell, aber im Chat: Eine Rückfrage (etwa beim Entfernen) öffnet eine Auswahl, deren erste Zeile **Nein** ist; ein Key oder ein Token wird in der Eingabezeile getippt, als Punkte angezeigt und nie in deinem Verlauf gespeichert; und einen Editor, den der Befehl braucht, bekommt das Terminal übergeben, so wie bei `!`. Im Chat gibt es keine Eingabe über eine Pipe. Einen langen Text gibst du deshalb mit `--file <path>` an (oder lässt das weg und schreibst ihn im Editor). Ein Befehl, der einen eigenen Slash-Befehl hat (`models` hat `/model`, `tiers` hat `/tiers`, `usage` hat `/usage`) oder für eine Shell gedacht ist (`run`, `serve`), sagt das und nennt dir, welchen du nehmen sollst.

## Diese Hydor-Installation verwalten

- `hydor status` sagt dir, ob Hydor läuft, welche Version es ist und unter welcher Adresse es erreichbar ist, wo seine Daten liegen, ob es als Dienst läuft und welche Sitzungen arbeiten oder dich brauchen (mit denselben Symbolen wie bei `hydor sessions`).
- `hydor serve` läuft im Vordergrund bis Strg+C. `hydor service install` richtet einen Hintergrunddienst ein, `hydor update` lädt Code, baut und startet neu. `hydor set-password`, `hydor setup-token` und `hydor access-token` verwalten Passwort und Tokens. In der Mac-App weisen Update, Dienstinstallation und Serve auf die integrierte Verwaltung hin.
- `hydor open` nennt die App-Adresse, `--browser` öffnet sie.
- `hydor machines phone` zeigt, ob Tailscale hier installiert und angemeldet ist, sowie die App-Adresse in deinem Tailnet mit einem QR-Code für die Smartphonekamera. `hydor machines phone serve` stellt die App deinen eigenen Geräten bereit; mit `--port 8443`, falls die übliche Adresse belegt ist. `hydor machines phone stop` beendet die Bereitstellung wieder, wie [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone).

## Hydor eines anderen Computers verwenden

Erstelle dort einen Zugriffstoken unter [Einstellungen → App → Computer](/settings?s=machines&find=Access%20from%20other%20machines) → **Neues Token** oder mit `hydor access-token "my laptop"`. Verwende anschließend Adresse und Token:

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

oder setzt einmal `HYDOR_URL` und `HYDOR_TOKEN`. Ordner sind die des anderen Computers: Eine Sitzung startet in dessen Standardordner, es sei denn, du gibst `--cwd` mit einem Ordner dort an (bei einer Adresse auf diesem Computer selbst, etwa `http://localhost:8790`, bleibt der Ordner, in dem du gerade bist). `!`-Befehle funktionieren nur mit dem Hydor dieses Computers. Auf diesem Computer legt der Befehl beim ersten Mal einen eigenen Token an, den [Einstellungen → App → Computer](/settings?s=machines&find=Access%20from%20other%20machines) als „Befehlszeile dieses Computers“ auflistet. Damit dieses Hydor die Sitzungen und Seiten eines anderen Computers zeigt, füge ihn als Computer hinzu: `hydor machines` listet die Computer auf, die dieses Hydor nutzt, und zeigt, ob sie antworten; `hydor machines add Lab --url https://lab.example.com` fügt einen hinzu (gib `--ssh <host>` statt `--url` an, um ihn über SSH zu erreichen; sein Zugriffs-Token wird verdeckt eingetippt oder kommt von `--file -`); und `hydor machines remove lab` hört auf, ihn zu nutzen.

## Farben und Weiterleitungen

Farben sind in einem Terminal an (True Color, wo es sie gibt) und aus, wenn die Ausgabe in eine Datei oder an ein anderes Programm geht, sowie wenn `NO_COLOR` gesetzt ist oder du `--no-color` angibst; `FORCE_COLOR` schaltet sie ein. Wenn das, was du tippst, per Pipe hineingegeben wird (`echo "…" | hydor`), arbeitet es wie `hydor run`. Wenn nur die Ausgabe per Pipe weitergeleitet wird, gibt die Unterhaltung ohne Farben und ohne die sich ändernden Zeilen aus, und jede Zeile, die du tippst, wird gesendet. Listen wie `hydor sessions` geben dann dieselben Spalten aus, ohne Farben und ohne Langes abzuschneiden, sodass Skripte sie lesen können. In einem schmalen Terminal lässt eine Liste ganze Spalten weg (zuerst eine Beschreibung, dann andere wie eine Adresse oder ein Alter), statt Namen und Titel zu kürzen. Wo Symbole nicht dargestellt werden können (die Linux-Konsole, eine Locale, die nicht UTF-8 ist, und die alte Windows-Konsole), zeichnet der Befehl mit einfachen Zeichen: `+-|` für den Rahmen, `>` für die Eingabeaufforderung, `*`, `+` und `x` für Markierungen und HYDOR für das Logo. `HYDOR_ASCII=1` schaltet das überall ein und `HYDOR_ASCII=0` schaltet es aus. Was in eine Datei oder an ein anderes Programm geht, behält seine Symbole, solange `HYDOR_ASCII=1` nicht gesetzt ist.

## Frag einen Agenten

- „Wie spreche ich im Terminal mit einem Agenten?“
- „Aktiviere Tab-Vervollständigung für hydor in meiner Shell.“
- „Erstelle ein Skript, das vorgemerkte Änderungen mit hydor run prüft und den Commit bei gefundenen Fehlern verhindert.“
- „Was bedeutet Exit-Code 3 bei hydor run?“
- „Richte hydor auf meinem Laptop für diesen Hydor-Computer ein.“
- „Welcher hydor-Befehl listet meine geplanten Aufgaben auf, und wie schalte ich eine davon im Terminal aus?“
- „Welcher Befehl speichert ein Sitzungsgespräch als Markdown?“
- „Lass das Terminal vor dem Senden bis zum Durchlaufende warten.“
- „Deaktiviere die grauen Terminalvorschläge.“
