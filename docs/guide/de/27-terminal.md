# Hydor im Terminal

Der Befehl `hydor` bringt die App ins Terminal: mit Agenten sprechen, ihre Arbeit live verfolgen, Aktionen freigeben und Fragen beantworten, einzelne Skriptaufträge ausführen und Sitzungen, Projekte, Agenten, Memory, Skills, Plugins, Keys, Aufgaben, Nutzung und Einstellungen verwalten. Für rein grafische Funktionen wie Unterschriften oder Folien- und Diagrammeditoren erhältst du die passende Adresse. Terminal und Oberfläche verwenden dieselbe Hydor-Instanz. Sitzungen lassen sich deshalb auf beiden Wegen fortsetzen. Die Shell vervollständigt Eingaben automatisch.

![Der hydor-Befehl: Begrüßungsfeld und Menü nach Eingabe eines Schrägstrichs](images/terminal.webp)

## Den Befehl einrichten

- **Installation mit `./install.sh`**: Der Installer verlinkt `hydor` nach `~/.local/bin`, sofern der Ordner auf PATH liegt, und meldet das. Andernfalls nennt er `bin/hydor.mjs` im Hydor-Ordner zur direkten Ausführung oder eigenen Verknüpfung.
- **Docker**: Der Befehl ist enthalten. `docker exec -it hydor hydor` öffnet das Gespräch im Container.
- **Mac-App**: Bei jedem Start richtet sie `hydor` automatisch auf PATH ein, im ersten beschreibbaren vorhandenen Suchordner aus `~/.local/bin`, `~/bin`, `/usr/local/bin` und `/opt/homebrew/bin`. Ist keiner dieser Ordner geeignet, verwendet sie `~/.local/bin` und ergänzt eine gekennzeichnete PATH-Zeile in der Shell-Startdatei, bei zsh `~/.zprofile`. Öffne danach ein neues Terminal. Der Befehl nutzt das Node.js der App und öffnet sie bei Bedarf. Aus einem Disk-Image oder vor dem Verschieben nach **Programme** wird nichts eingerichtet. `hydor update`, `hydor service install` und `hydor serve` weisen in der Desktop-App darauf hin, dass die App das selbst verwaltet.
- **Linux- und Windows-Desktop-Apps** richten den Befehl ebenfalls bei jedem Start ohne Passwortabfrage ein. Linux verwendet eine kleine Datei im ersten beschreibbaren PATH-Ordner aus `~/.local/bin`, `~/bin` oder `/usr/local/bin`, andernfalls eine gekennzeichnete Shell-PATH-Ergänzung. Der Befehl steht vor `/usr/bin/hydor` der .deb, das das App-Fenster öffnet. Windows legt `hydor.cmd` in WindowsApps ab, ersatzweise unter `%LOCALAPPDATA%\Hydor\bin` mit PATH-Ergänzung. Öffne danach ein neues Windows Terminal, PowerShell oder Eingabeaufforderungsfenster. Wie auf dem Mac werden App-Node.js und automatischer App-Start verwendet. Eine schon vorhandene andere `hydor`-Installation bleibt unangetastet. Von einer anderen Installation kannst du auf diese zugreifen; siehe [Hydor eines anderen Rechners verwenden](#use-another-computers-hydor).

`hydor help` listet Befehle nach Gruppen. `hydor help <command>` erklärt Verwendung, Optionen und Beispiele, `hydor help options` alle Optionen und `hydor help <command> <verb>` einzelne Aktionen. Wartungsbefehle heißen ebenfalls `hydor service status`, `hydor setup-token`, `hydor update` und so weiter. `node dist/server/cli.js …` funktioniert weiterhin. Bei Tippfehlern schlägt die Hilfe passende Namen vor. Fehler erscheinen rot.

Beginnt deine Nachricht mit einem Befehlsnamen, setze sie in Anführungszeichen wie `hydor "find the bug in login"` oder verwende `hydor chat`, damit sie nicht als Befehl interpretiert wird.

Hydor muss vorher nicht laufen. Antwortet lokal kein Server, startet der Befehl ihn im Hintergrund und lässt ihn nach Ende weiterlaufen. `hydor status` nennt Instanz, Version, Dienstzustand und Funktionsstatus. Bei Desktop-Installation wird stattdessen die App geöffnet und kein zusätzlicher Server gestartet.

## Tab-Vervollständigung in der Shell

Aktiviere sie einmal:

```bash
hydor completion install
```

Der Befehl richtet bash, zsh oder fish passend ein. Für zsh und bash ohne bash-completion ergänzt er eine Zeile in `.zshrc` oder `.bashrc`. Öffne anschließend ein neues Terminal. Erneute Einrichtung erzeugt keine Duplikate. `hydor completion bash`, entsprechend zsh oder fish, gibt stattdessen das Skript aus, etwa für `source <(hydor completion bash)`.

Tab ergänzt Befehle, Aktionen, Optionen und Werte. Nach `hydor show ` oder `hydor send ` erscheinen Sitzungskennungen mit Titeln, nach `--model` Modelle, nach `--as` deine Agenten, nach `--cwd` Ordner und entsprechend Projekte, Skills, Plugins, Einstellungen und Hilfethemen. Antwortet Hydor zu langsam, bietet die Shell verfügbare lokale Vorschläge und bleibt bedienbar.

## Mit einem Agenten sprechen

Starte im gewünschten Ordner `hydor` oder direkt `hydor fix the failing test`. Die erste Nachricht erstellt dort eine Sitzung.

Das Begrüßungsfeld trägt **HYDΩR** und die Version im oberen Rand. Es zeigt Ordner und gegebenenfalls Git-Branch, Agentenprogramm, Modell oder **Automatisch** bei Modellstufen und Berechtigungsmodus. Vollzugriff erscheint rot, Planen in Akzentfarbe. Darunter stehen Hinweise wie `/ commands · @ files · ! shell · ↑ history · Ctrl+R search · /help`. Die Breite bleibt unabhängig vom Ordnernamen konstant.

Ausgaben bleiben in der Terminalhistorie zum Scrollen und Kopieren, auch über SSH und in tmux:

- **Deine Nachrichten** beginnen mit `›`.
- **Agententext** erscheint fortlaufend mit Überschriften, Listen, Zitaten, Tabellen, Links samt Adresse und nicht neu umgebrochenem, kopierbarem Code.
- **Schritte** zeigen gelesene, gesuchte und geänderte Dateien mit Zeilenbilanz sowie Befehle mit Dauer und bei Fehlern Exit-Code und erster Fehlerzeile.
- **Denkzeit** erscheint als zurückhaltende Zeile, etwa „8 Sek. nachgedacht“. `--thinking` zeigt mehr, `-v` erste Zeilen der Schrittausgaben.
- **Unteragenten** werden beim Start und Abschluss oder Fehler gemeldet; siehe [Arbeit an Unteragenten übergeben](/guide/research#let-an-agent-hand-work-to-subagents). Claude Codes eigene Unteragenten können im Hintergrund weiterarbeiten, während sein Durchlauf endet. Die unteren Zeilen zeigen ihren Zustand; nach ihrer Rückmeldung arbeitet der Hauptagent selbstständig weiter. Hintergrundbefehle wie Entwicklungsserver blockieren nichts. `/subagents` listet Aufgaben und Kosten.
- **Durchlaufabschluss** zeigt Dauer, Kosten, Modell und Anzahl der Unteragenten.

Unten aktualisieren sich aktuelle Antwort, Schritt, Unteragenten, farbiges Ladesymbol mit Zeit und Eingabezeile. Esc oder Strg+C stoppt den Durchlauf.

### Die Eingabezeile

Die Eingabe liegt zwischen zwei Linien. Darunter stehen Ordner, Branch, Modell, Modus, bisherige Kosten und rechts `/help`.

- **Graue Vorschläge** aus früheren Nachrichten ergänzen deinen Text. **→** übernimmt alles, **Alt+→** ein Wort. [Einstellungen](/settings?s=general&find=Terminal%20suggestions) → App → Allgemein → **Terminalvorschläge** schaltet sie um.
- **Strg+R** durchsucht frühere Nachrichten. Tippe Wörter, wähle mit **↑** und **↓** und übernimm mit **Enter** zunächst nur in die Eingabe. **Esc** bricht ab.
- Mehrzeilige Nachrichten und vollständiges Einfügen aus der Zwischenablage sind möglich.

### Das Vervollständigungsmenü

Während der Eingabe öffnet sich ein mitlaufendes Menü:

| Eingabe | Angebot |
| --- | --- |
| `/` | Befehle mit Beschreibung, zuerst die Chatbefehle und danach Programmeigene, etwa Claude-Code-Befehle und Skills. |
| `/model `, `/mode `, `/effort `, `/agent `, `/subagents `, `/open ` | Passende Modelle, Modi, Denkstufen, Agenten, Unteragenten und Öffnungsziele. |
| `@` mit einigen Buchstaben | Unscharf gesuchte Dateien im Sitzungsordner. `@clits` findet `src/cli.ts`. Ein abschließendes `/` durchsucht den Unterordner. |

**↑** und **↓** bewegen die Auswahl, **Tab** ergänzt sie, **Enter** ergänzt und führt aus oder öffnet bei fehlendem Wert dessen Auswahl. **Esc** schließt das Menü. Buchstaben müssen nicht zusammenhängen: `mdl` findet `/model`.

### Auswahlmenüs

`/sessions`, `/resume`, `/model`, `/effort`, `/mode` und `/agent` öffnen ohne Wert eine Auswahlliste. Pfeile bewegen, Tippen filtert, Enter wählt, Esc schließt. Bei höchstens neun Zeilen kann eine Ziffer wählen. `hydor resume` ohne Kennung öffnet dieselbe Sitzungsauswahl.

### Shell-Befehle mit `!`

`!` am Zeilenanfang führt den Rest als Shell-Befehl im Sitzungsordner aus, etwa `!git status` oder `!npm test`. Interaktive Programme wie `!vim notes.md` und `!htop` übernehmen vorübergehend das Terminal. Danach kehrt der Chat zurück. Die Eingabe wird bei `!` gelb. Agenten sehen Befehl und Ausgabe nicht; teile benötigte Ergebnisse ausdrücklich mit. Das funktioniert nur mit lokalem Hydor.

### Anfragen des Agenten beantworten

Freigaben zeigen Befehl, Änderung oder Plan und darunter die Auswahl:

- **y** erlaubt mit der ersten zustimmenden Option, **n** lehnt ab. Die jeweilige **Ziffer** wählt andere Optionen wie dauerhafte Freigaben.
- Zum Ablehnen mit alternativer Anweisung schreibe deinen Text und drücke Enter.

Fragen zeigen nummerierte Antworten. Wähle eine oder mehrere und Enter oder tippe frei. Esc überspringt. Formulare fragen Felder nacheinander ab; Enter behält den angezeigten Wert. Dateien werden per lokalem Pfad angegeben.

Unterschriften oder Keys für Apps benötigen die Oberfläche. Das Terminal erklärt dies und nennt die Sitzungsadresse.

### Während der Arbeit

Du kannst jederzeit schreiben. [Einstellungen → App → Allgemein](/settings?s=general&find=Sending%20while%20an%20agent%20works) → **Senden während der Agentenarbeit** bestimmt Enter: **In den Durchlauf einfügen** übergibt sofort, **Warten** stellt die Nachricht als **In Warteschlange** zurück. Zwei Befehle überschreiben die Vorgabe je Nachricht:

- `/queue <message>` wartet immer bis zum Durchlaufende.
- `/now <message>` fügt immer sofort ein.

**Senden während der Agentenarbeit** und **Terminalvorschläge** gehören zu diesem Terminalchat. `hydor settings set general.sending-while-an-agent-works wait` oder eine Agentenanweisung ändert sie sofort; siehe [Einstellungen](#settings).

### Tastenkürzel

- **Enter** sendet. **Alt+Enter**, **Strg+J** oder ein `\` vor Enter erzeugt eine neue Zeile. Einfügen übernimmt Zeilenumbrüche vollständig.
- **↑** und **↓** durchsuchen die letzten 500 Nachrichten, innerhalb mehrzeiliger Nachrichten zunächst die Zeilen. Bei offenem Menü bewegen sie die Auswahl.
- **←**, **→**, **Pos1**, **Ende**, **Strg+A** und **Strg+E** bewegen den Cursor. **Alt+←** und **Alt+→** springen wortweise. **Strg+W** löscht das vorherige Wort, **Strg+U** beziehungsweise **Strg+K** den Zeilenrest davor oder danach.
- **Tab** öffnet oder übernimmt die Auswahl. **Strg+R** sucht frühere Nachrichten.
- **Esc** schließt das Menü oder stoppt den Durchlauf. **Strg+C** stoppt aktive Arbeit, leert sonst Text und beendet bei leerer Eingabe nach zweimaligem Drücken. **Strg+D** beendet bei leerer Eingabe. **Strg+L** leert den Bildschirm. **Strg+Z** hält den Chat an; `fg` setzt ihn fort.

`/keys` listet die Kürzel. Beim Verlassen läuft die Sitzung weiter und das Terminal nennt den Weg zurück.

### Chatbefehle

Gib sie direkt ein; `/` zeigt die Liste:

- `/help` zeigt **Befehle**, **Tastenkürzel** und **Außerdem** mit `@` und `!`. `/keys` zeigt nur Tasten.
- `/new` mit optionaler Nachricht erstellt eine Sitzung im selben Ordner.
- `/sessions` oder `/resume` wählt eine Sitzung zur Fortsetzung.
- `/model`, `/effort`, `/mode` ändern Modell, Denkaufwand und Berechtigungen; ohne Wert öffnen sie eine Liste.
- `/agent` arbeitet ab der nächsten Nachricht als einer [deiner Agenten](/guide/agents).
- `/subagents` listet auch Hintergrundagenten mit Aufgaben und Kosten. `/subagents 2` öffnet das zweite Gespräch.
- `/tiers`, `/usage`, `/cost` zeigen Modellstufen, Abonutzung und Sitzungs- einschließlich Unteragentenkosten.
- `/copy` kopiert die letzte Antwort auch über SSH und tmux. `/clear` leert den Bildschirm.
- `/queue` und `/now` senden wartend oder sofort; siehe [Während der Arbeit](#while-it-works).
- `/stop`, `/rename`, `/open`, `/quit` stoppen einschließlich Hintergrundunteragenten, benennen um, zeigen die App-Adresse oder beenden.
- `/hydor <command>` führt Verwaltungsbefehle direkt im Chat aus; siehe [Innerhalb des Chats](#inside-the-chat).

Andere `/command`-Eingaben gehen unverändert an den Agenten für dessen eigene Befehle und Skills.

Unterstützte Terminals verwenden Echtfarben. `NO_COLOR`, `--no-color` und Weiterleitungen schalten Farben aus.

## Eine Sitzung fortsetzen

- `hydor -c` setzt die neueste Sitzung des aktuellen Ordners fort.
- `hydor resume` öffnet die Auswahl, `hydor resume 6f1e2a3b` die genannte Sitzung.

Zunächst erscheinen letzte Durchläufe mit zusammengefassten Schritten wie „3 Befehle ausgeführt, 4 Dateien gelesen“. `hydor show` zeigt alles.

## Den Sitzungsstart festlegen

Diese Optionen gelten für `hydor`, `hydor run` und `hydor resume`:

- `--agent claude`, `codex`, `custom` oder ein [weiteres Agentenprogramm](/guide/agents-models).
- `--model` mit Modellname oder `auto`, `--effort` und `--mode ask`, `edits`, `plan`, `full` oder programmeigenem Modusnamen.
- `--as Researcher` startet als einer [deiner Agenten](/guide/agents).
- `--cwd` für den Ordner, sonst aktueller Ordner, `--worktree` für eigenen Branch und Ordner, `--cap 2` für höchstens $2, `--no-memory` und `--title`.

Fehlende Werte stammen zuerst aus der letzten Startseitenauswahl und danach aus den App-Standards.

## Einen einzelnen Auftrag aus einem Skript ausführen

`hydor run "…"` oder `hydor -p "…"` erstellt eine Sitzung, wartet auf Abschluss, gibt die letzte Antwort aus und beendet sich. Abgeschlossen bedeutet: Der Durchlauf ist beendet, alle Unteragenten einschließlich Claude Codes Hintergrundagenten sind fertig und ihre Antworten zugestellt, die Warteschlange ist leer. Ein wartender Hauptagent wird nach Unteragentenrückmeldungen fortgesetzt; auch darauf wartet der Befehl. Ein laufender Entwicklungsserver blockiert den Abschluss nicht. Bei `--timeout` oder Strg+C werden Hintergrundunteragenten mitgestoppt. Ohne Nachricht wird Standardeingabe gelesen, etwa `git diff | hydor run "review this change"`.

- Im Terminal melden kurze Statuszeilen Schritte und Unteragenten. `-q` blendet sie aus.
- Freigaben und Fragen unterbrechen den unbeaufsichtigten Lauf. Das Terminal nennt die Anfrage; in App oder `hydor resume` kannst du antworten. Mit `--mode full` oder `-y` fragt der Agent nicht.
- `--json` erzeugt am Ende ein Objekt mit `key`, `url`, `status`, `reply`, `model`, `costUsd` einschließlich Unteragenten, `tokens`, `durationMs`, `turns`, `children` mit `title`, `label`, `tier`, `costUsd`, `status` je Hydor-Unteragent und bei Fehlern `error`. `--stream-json` liefert fortlaufende Zeilen für `item`, `live`, `note` und abschließend dasselbe Ergebnisobjekt.
- `--timeout 300` stoppt nach 300 Sekunden.

Exit-Codes für Skripte:

| Code | Bedeutung |
| --- | --- |
| 0 | Abgeschlossen |
| 1 | Sitzungsfehler, benanntes Nutzungslimit oder Ablehnung durch Hydor |
| 2 | Falsche Befehlsverwendung |
| 3 | Benötigt deine Antwort |
| 124 | Zeitlimit aus `--timeout` überschritten |
| 130 | Durch Strg+C beendet; vorher wurde der Durchlauf gestoppt |

## Alle App-Funktionen im Terminal

Jeder App-Bereich hat einen Befehl mit passenden Aktionen. Ohne Aktion wird aufgelistet: `hydor projects` entspricht `hydor projects list`. `hydor help` zeigt die folgenden Gruppen; Tab ergänzt Aktionen, Optionen und Werte.

Gemeinsame Bedienung:

- **Einträge auswählen**: Verwende ID, ID-Anfang oder eindeutigen Namen beziehungsweise Titel, ohne Beachtung der Großschreibung. Bei mehreren Treffern werden bis zu fünf gezeigt. Im Terminal öffnet eine fehlende Angabe eine Auswahl.
- **Ändern**: Felder heißen etwa `--description` und `--name`. Lange Texte stammen aus `--file <path>`, weitergeleiteter Eingabe mit `-` oder, wenn beides fehlt und du ein interaktives Terminal verwendest, deinem Editor aus `$VISUAL` beziehungsweise `$EDITOR`, der den aktuellen Text öffnet. Unverändertes Speichern ändert nichts.
- **Entfernen** fragt nach Bestätigung. `-y` oder `--yes` stimmt zu. Ohne interaktives Terminal und ohne diese Option wird abgelehnt.
- **`--json`** gibt die unveränderte API-Antwort für Skripte aus.
- **Exit-Codes**: 0 für Erfolg, 1 für Ablehnung oder Fehler mit Grund, 2 für falsche Verwendung mit Anleitung.
- **Andere Rechner** werden mit `--server` und `--token` unterstützt.
- **Grafische Funktionen** liefern ihre Seitenadresse. `hydor open … --browser` öffnet sie.

### Sitzungen

| Befehl | Funktion |
| --- | --- |
| `hydor sessions` | Neueste Sitzungen mit ● arbeitet, ● braucht dich, ✓ abgeschlossen und ✗ Fehler. Aktionen entsprechen dem Sitzungsmenü: `search`, `rename`, `archive`, `unarchive`, `pin`, `unpin`, `read`, `snooze`, `move` in ein Projekt, `fork`, `goal`, `share` als schreibgeschützter Link, `changes`, `commands`, `queue` mit `queue clear` und `queue remove`, `show`, `export` als Markdown, mit `-o -` zur Ausgabe oder `--library` als Bibliotheksdokument, sowie `send`, `stop` und `delete`. |
| `hydor inbox` | Offene Freigaben, Fragen, Key-Anfragen und Skill-Vorschläge: `list` und `show` mit Antwortort. |
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
| `hydor models` und `hydor tiers` | Verfügbare Modelle und Zuordnung der [Modellstufen](/guide/agents-models#tiers-a-model-for-each-kind-of-job): etwa `hydor tiers set claude best opus --effort high` oder `hydor tiers reset`. `hydor tiers team off` deaktiviert Unteragentenführung, `hydor tiers hard off` Max für schwierige Probleme; `on` aktiviert wieder. |
| `hydor usage` | Verbrauch, Limits und Zurücksetzung je Abo. |
| `hydor agents` | [Deine Agenten](/guide/agents) mit `list`, `show`, `new`, `edit`, `results`, `export`, `install` und `remove`. Eingebaute Agenten lassen sich kopieren, nicht ändern. Ergebnisziele werden je Ziel über `--results-to` bei `new` und `edit` gesetzt: `library` aktualisiert dieselbe Seite, `library:new` erstellt eine neue, `sheet` schreibt je Ergebnis eine Zeile in eine eigene Tabelle, `sheet:<spreadsheet>#<tab>` in eine vorhandene, außerdem `email:<addresses>`, `notify`, `file:<path>`, `webhook:<url>` oder `none`. Ausgabefelder werden auf der Agentenseite über `hydor open agents` eingerichtet. `results` listet Ergebnisse. `export` schreibt eine `.hydor-agent`-Datei mit `-o` und nennt ausgelassene Inhalte. `install <file>` erklärt Inhalt und Anforderungen, fragt nach und installiert neben gleichnamigen eigenen Agenten, außer bei `--replace`. `--schedules` übernimmt vorgeschlagene Zeitpläne pausiert. Siehe [Einen Agenten als Datei teilen](/guide/agents#share-an-agent-as-a-file). |
| `hydor accounts` | Claude-Code- und Codex-Anmeldungen: `list`, `show` mit Konto, Tarif, Standardauswahl, Nutzung, Limits, vorhandenem API-Key ohne Wert und Kontowechselstatus, `add <program> <name>` mit Anmeldung, `sign-in`, `sign-out`, `remove` und `use` für den Standard neuer Sitzungen. API-Guthaben und Limit-Schalter liegen unter `accounts.*`. |

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
| `hydor skills` | `list`, `show`, `on`, `off`, `add` aus SKILL.md oder Ordner und `remove`. `--agent claude` und `--agent codex` betreffen deren eigene Skills. |
| `hydor plugins` | Erweiterungen mit Skills und Tools: `list`, `show`, `on`, `off`, `add` eingebauter Plugins, Git-Adressen, ZIPs oder Ordner und `remove`. Eigene Plugins werden auf der Seite über `hydor open plugins` erstellt. |
| `hydor mcp` | Claude-Code- und Codex-Tool-Server: `list`, `show` mit Programm, Bereich, Befehl oder Adresse, Variablen- und Headernamen ohne Werte, Zustand und mit `--tools` auch Toolanzahl, `status` zum Start- und Verbindungstest, `add`, `edit`, `remove`. |
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

`hydor settings` erreicht alle [Einstellungen](/settings) in **App**, **Agenten** und **Funktionen**. Optionen haben IDs wie `general.resume-after-usage-limits`. Du kannst vollständige ID, eindeutigen Anfang wie `general.resume` oder eindeutigen Namen verwenden. Tab ergänzt.

Im Terminal öffnet `hydor settings` ohne Argumente eine interaktive Auswahl: zuerst Abschnitt, dann Option. Pfeile und Tippen suchen, Enter öffnet oder ändert, Esc geht zurück. Schalter wechseln direkt, Auswahlen zeigen Werte, Texte und Zahlen werden eingegeben, Aktionen fragen gegebenenfalls nach. Bei Weiterleitung wird stattdessen alles aufgelistet.

| Befehl | Funktion |
| --- | --- |
| `hydor settings list [section]` | Alle Optionen mit Werten oder ein Abschnitt. |
| `hydor settings get <option>` | Wert und erlaubte Eingaben einer Option. |
| `hydor settings set <option> <value>` | Schalter mit `on` oder `off`, Auswahlwert, Ganzzahl oder kommagetrennte Liste; `none` leert Listen. Keys und Tokens werden verdeckt oder aus Standardeingabe gelesen. Lange Texte kommen aus `--file` oder Editor. |
| `hydor settings run <option>` | Löst Aktionen wie Testnachricht oder Updatesuche aus, vor Entfernen oder Herunterladen mit Rückfrage. |
| `hydor settings open [section]` | Seitenadresse des Abschnitts oder der Option. |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

Browserspezifische Einstellungen wie Design, Sprache und Benachrichtigungston können hier nicht geändert werden. Die Ausgabe erklärt das und nennt die Seite. Dasselbe gilt für rein grafische Optionen. Die beiden Terminaleinstellungen **Senden während der Agentenarbeit** und **Terminalvorschläge** lassen sich dagegen mit `hydor settings set` ändern.

### Suchen, Hilfe, Öffnen und API

- `hydor find rate limit` durchsucht wie **Strg+K** Seiten, Einstellungen, Sitzungen, Memory und Skills. `--in settings` grenzt ein, `--urls` zeigt Adressen, `--open 2` öffnet den zweiten Treffer.
- `hydor guide` listet Hilfethemen, `hydor guide projects` liest eines und `hydor guide projects "what a project is"` einen Abschnitt. `--sections` listet Abschnitte.
- `hydor open` nennt die App-Adresse. `hydor open library`, `hydor open settings memory`, `hydor open project thesis`, `hydor open guide projects` und `hydor open 6f1e2a3b` führen zu Bereichen oder Sitzungen. `--browser` öffnet sie. So erreichst du grafische Editoren, Unterschriften, Designfarben und Dienstanmeldungen.
- `hydor api GET /api/projects` ruft API-Endpunkte auf und gibt JSON aus. Beispiel: `hydor api POST /api/projects -d '{"name":"Thesis"}'`. Inhalte können aus `@file` oder `-` stammen. Siehe [API](/guide/api).

### Innerhalb des Chats

`/hydor <command>` führt Verwaltungsbefehle ohne Verlassen des Gesprächs aus, etwa `/hydor sessions`, `/hydor memory search docker` und `/hydor settings get general.resume-after-usage-limits`. Es steht im `/`-Menü und unter **Außerdem** in `/help`. Die Vervollständigung bietet Bereiche, Aktionen, Werte und bei `-` Optionen wie in der Shell. Ausgabe erscheint über der Eingabe; Fehler rot, der Chat bleibt aktiv.

Rückfragen funktionieren im Chat: Löschbestätigungen öffnen eine Auswahl mit **Nein** zuerst, Keys und Tokens werden als Punkte ohne Historieneintrag eingegeben und Editoren übernehmen wie bei `!` das Terminal. Standardeingabe aus Pipes gibt es hier nicht. Lange Texte kommen über `--file <path>` oder den Editor. Hat ein Befehl einen eigenen Slash-Befehl wie `/model`, `/tiers`, `/usage` oder gehört nur in eine Shell wie `run` und `serve`, erklärt die Ausgabe die passende Alternative.

## Diese Hydor-Installation verwalten

- `hydor status` zeigt Zustand, Version, Adresse, Datenpfad, Dienststatus und aktive oder wartende Sitzungen mit denselben Symbolen wie `hydor sessions`.
- `hydor serve` läuft im Vordergrund bis Strg+C. `hydor service install` richtet einen Hintergrunddienst ein, `hydor update` lädt Code, baut und startet neu. `hydor set-password`, `hydor setup-token` und `hydor access-token` verwalten Passwort und Tokens. In der Mac-App weisen Update, Dienstinstallation und Serve auf die integrierte Verwaltung hin.
- `hydor open` nennt die App-Adresse, `--browser` öffnet sie.
- `hydor machines phone` zeigt, ob Tailscale hier installiert und angemeldet ist, sowie die App-Adresse in deinem Tailnet mit einem QR-Code für die Smartphonekamera. `hydor machines phone serve` stellt die App deinen eigenen Geräten bereit; mit `--port 8443`, falls die übliche Adresse belegt ist. `hydor machines phone stop` beendet die Bereitstellung wieder, wie [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone).

## Hydor eines anderen Rechners verwenden

Erstelle dort einen Zugriffstoken unter [Einstellungen → App → Rechner](/settings?s=machines&find=Access%20from%20other%20machines) → **Neuer Token** oder mit `hydor access-token "my laptop"`. Verwende anschließend Adresse und Token:

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

Alternativ setzt du `HYDOR_URL` und `HYDOR_TOKEN`. Ordner beziehen sich auf den fremden Rechner. Ohne `--cwd` gilt sein Standardordner. Bei lokaler Serveradresse wie `http://localhost:8790` bleibt der aktuelle Ordner erhalten. `!` funktioniert nur mit lokalem Hydor. Dafür erstellt der Befehl bei erster Nutzung einen eigenen Token, gelistet unter [Einstellungen → App → Rechner](/settings?s=machines&find=Access%20from%20other%20machines) als Befehlszeilenzugriff dieses Computers.

Weitere Rechner für diese Hydor-Instanz verwaltest du mit `hydor machines`: Auflisten zeigt Erreichbarkeit, `hydor machines add Lab --url https://lab.example.com` fügt hinzu, alternativ `--ssh <host>`. Der Token wird verdeckt eingegeben oder aus `--file -` gelesen. `hydor machines remove lab` entfernt die Verbindung.

## Farben und Weiterleitungen

Farben sind im Terminal aktiv und bei Dateiausgabe, Pipes, `NO_COLOR` oder `--no-color` aus. `FORCE_COLOR` erzwingt sie. Weitergeleitete Eingabe wie `echo "…" | hydor` arbeitet wie `hydor run`. Nur weitergeleitete Ausgabe erzeugt ein Gespräch ohne Farben und wechselnde Statuszeilen; jede Eingabezeile wird gesendet.

Listen wie `hydor sessions` behalten in Pipes vollständige Spalten und ungekürzte Inhalte für Skripte. Schmale Terminals lassen ganze Spalten weg, zuerst Beschreibungen und dann etwa Adressen oder Alter, statt Namen abzuschneiden. Ohne Symbolunterstützung, etwa Linux-Konsole, Nicht-UTF-8-Locale oder alte Windows-Konsole, verwendet die Darstellung `+-|`, `>`, `*`, `+`, `x` und HYDOR statt Sonderzeichen. `HYDOR_ASCII=1` erzwingt das, `HYDOR_ASCII=0` schaltet es ab. Dateiausgabe und Pipes behalten Symbole, außer ASCII ist ausdrücklich aktiv.

## Frag einen Agenten

- „Wie spreche ich im Terminal mit einem Agenten?“
- „Aktiviere Tab-Vervollständigung für hydor in meiner Shell.“
- „Erstelle ein Skript, das vorgemerkte Änderungen mit hydor run prüft und den Commit bei gefundenen Fehlern verhindert.“
- „Was bedeutet Exit-Code 3 bei hydor run?“
- „Richte hydor auf meinem Laptop für diesen Hydor-Rechner ein.“
- „Wie liste und deaktiviere ich geplante Aufgaben im Terminal?“
- „Welcher Befehl speichert ein Sitzungsgespräch als Markdown?“
- „Lass das Terminal vor dem Senden bis zum Durchlaufende warten.“
- „Deaktiviere die grauen Terminalvorschläge.“
