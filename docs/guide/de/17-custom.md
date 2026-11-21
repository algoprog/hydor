# Custom, der eigene Agent der App

Custom ist der eigene Agent von Hydor: Er führt die Modelle deiner Claude- und ChatGPT-Abos aus sowie jedes Modell, das du hinzufügst, von OpenRouter, Ollama, vLLM oder einem anderen OpenAI-kompatiblen Server, mit denselben Tools, Skills und Verbindungen wie Claude Code und Codex. Dieses Thema behandelt, was Custom kann, seine Berechtigungsmodi und wie er Befehle prüft, den Auto-Modus, die Sandbox für Befehle, Ziele, wie er mit langer Arbeit und schwächeren Modellen zurechtkommt, und seine Einstellungen.

![Einstellungen → Modelle: das Hilfsmodell und Modelle auf diesem Computer](images/custom.webp)

## Was Custom ist und wann du ihn nutzt

Claude Code führt nur Modelle von Anthropic aus, Codex nur die von OpenAI. Custom führt auch die Modelle deiner Claude- und ChatGPT-Abos aus, über die Anmeldungen von Claude Code und Codex auf diesem Computer, und dazu jedes Modell, das du unter [Einstellungen → Agenten → Modelle](/settings?s=models) einrichtest: offene Modelle auf deinem eigenen Computer, günstige oder kostenlose Modelle über OpenRouter oder einen eigenen Server. Für die Modelle deiner Abos musst du nichts einrichten: Sobald Claude Code angemeldet ist, bietet das Menü **Modell** von Custom Claude Opus, Fable, Sonnet und Haiku an, und sobald Codex mit ChatGPT angemeldet ist, die Modelle, die dein ChatGPT-Abo auflistet, alle unter **Deine Abos**. Sie verbrauchen die Nutzung deines Abos, keinen API-Key. Unter [Agenten, Konten und Modelle](/guide/agents-models#where-customs-models-come-from) erfährst du, woher die Modelle von Custom kommen und wie du weitere hinzufügst.

Nutze Custom, wenn du Folgendes möchtest:

- ein Modell, das deinen Computer nie verlässt (Ollama oder vLLM), oder eine ganze Sitzung, die ihn nicht verlässt: Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) läuft immer mit Custom und nutzt nur Modelle auf diesem Computer oder in deinem eigenen Netzwerk (nie die Modelle deiner Abos, die auf den Servern von Anthropic oder OpenAI laufen);
- ein bestimmtes Modell, etwa DeepSeek, Qwen, GLM oder Kimi;
- die eigenen Tools und Regeln von Custom mit einem Modell deines Claude- oder ChatGPT-Abos, oder um Kosten zu sparen, oder um weiterzuarbeiten, wenn dein Claude- oder ChatGPT-Abo aufgebraucht ist (mit einem Modell von anderswo).

Er hilft bei allem: Recherche, Schreiben, Dokumenten und alltäglichen Aufgaben. In einem Code-Projekt (einem Ordner mit einer `package.json`, `Cargo.toml`, einem Git-Repository und dergleichen) arbeitet er wie ein sorgfältiger Entwickler: Er liest, bevor er etwas ändert, folgt den eigenen Anweisungen des Projekts und führt die Tests und Prüfungen des Projekts aus, bevor er sagt, er sei fertig.

Custom liest die Dateien `AGENTS.md` oder `CLAUDE.md` des Projekts und befolgt deine [Agentenrichtlinien](/guide/guidelines), wie die anderen Agenten auch.

## Eine Custom-Sitzung starten

1. Klicke auf der Startseite auf **Agent** und wähle **Custom** („Beliebiges Modell: OpenRouter, Ollama, vLLM“).
2. Klicke auf **Modell** und wähle eines deiner Modelle oder **Automatisch**, wenn das Menü es anbietet: Die Leistungsstufen von Custom füllen sich selbst aus den Modellen, die er hat (zuerst die deines Claude-Abos, dann die deines ChatGPT-Abos, dann die von dir hinzugefügten, die nicht auf diesem Computer liegen). Sobald seine Stufe „Am besten“ ein Modell nennt, startet eine Sitzung mit Automatisch darauf und führt Subagents an (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Wenn die Liste leer ist, füge zuerst ein Modell hinzu: **Agent** → **Modelle für Custom**.
3. Wähle unter **Optionen** die **Berechtigungen** (siehe [Festlegen, was Custom ohne Nachfrage tun darf](#choose-what-custom-may-do-without-asking)). Custom hat keine Einstellung für den Aufwand.
4. Tippe die Aufgabe ein und drücke die Eingabetaste.

Ein Modell auf diesem Computer, das über vLLM bereitgestellt wird, startet, wenn eine Sitzung es zum ersten Mal nutzt; die Sitzung meldet „Starte … mit vLLM (beim ersten Mal dauert es ein bis zwei Minuten) …“.

Custom nimmt jeweils eine Nachricht entgegen. Eine Nachricht, die du sendest, während er arbeitet, wartet in der Warteschlange über dem Nachrichtenfeld und wird gesendet, wenn der Durchgang endet.

Du kannst das Modell während einer Sitzung über das Menü unter dem Nachrichtenfeld wechseln. Custom nutzt das neue Modell ab seinem nächsten Schritt, auch mitten in einem Durchgang.

## Was Custom kann

- **Dateien**: Sie lesen (Text mit Zeilennummern, jeweils einen Teil einer langen Datei, den Inhalt eines Ordners), sie erstellen, neu schreiben und bearbeiten, Ordner auflisten und Dateien nach Namen oder nach ihrem Inhalt finden. Bevor er eine ganze Datei neu schreibt, die er in dieser Sitzung noch nicht gelesen hat, wird er aufgefordert, sie zuerst zu lesen.
- **Dokumente**: PDF-, Word-, Excel-, PowerPoint-, OpenDocument-, RTF- und EPUB-Dateien werden als Text gelesen.
- **Bilder**: Bilder, die du anhängst, Bilddateien, die er öffnet, und Bilder von Webseiten oder aus Tools. Ein Modell, das Bilder sieht, bekommt das Bild; für eines, das keine sieht, beschreibt das Hilfsmodell es (siehe [Bilder für Modelle, die nicht sehen](#images-for-models-that-dont-see)).
- **Befehle**: Shell-Befehle im Ordner der Sitzung ausführen, standardmäßig bis zu zwei Minuten und höchstens zehn. Server, Watcher und andere Befehle, die weiterlaufen, laufen im Hintergrund: Custom liest ihre Ausgabe, wenn er sie braucht, und kann sie beenden. Sie enden auch, wenn Custom beendet wird, und seinem nächsten Durchgang wird mitgeteilt, welche noch laufen.
- **Webseiten**: eine Seite als sauberen Text mit ihren Überschriften, Links, Listen und Tabellen abrufen; PDFs und Office-Dateien im Netz werden als Text gelesen. Er erreicht nur öffentliche Adressen; für diesen Computer oder sein Netzwerk nutzt er einen Befehl wie `curl`.
- **Einen Plan**: Bei Arbeit mit mehreren Schritten führt er eine Checkliste, die in der Sitzung angezeigt wird, und hakt Punkte ab.
- **Skills**: Er lädt die Skills, die zur Aufgabe passen: die des Projekts, deine eigenen (aus den Skill-Ordnern von Claude Code und Codex) und die der [Skill-Bibliothek](/guide/skills) der App. Er kennt sie nach Gruppe und Name und kann auch mit ein paar Worten nach einem suchen, je nachdem, worum es bei der Arbeit geht.
- **MCP-Server**: Tool-Server, die du für Claude Code eingerichtet hast (für alle Ordner und für diesen Ordner), die `.mcp.json` des Projekts und die von Codex.
- **Die eigenen Tools der App**: Websuche, der Browser, Memory, Seiten, deine [Verbindungen](/guide/connections) und der Rest, wie sie jeder Agent hier bekommt.

Jeder Schritt erscheint in der Sitzung mit einem verständlichen Namen („index.ts lesen“, „README.md bearbeiten“, „https://… abrufen“), mit seinem Diff oder seiner Ausgabe einen Klick entfernt.

## Festlegen, was Custom ohne Nachfrage tun darf

Die Einstellung **Berechtigungen** (unter **Optionen** auf der Startseite oder im Menü unter dem Nachrichtenfeld einer Sitzung) legt fest, was Custom von sich aus tut. Mit Umschalt+Tab im Nachrichtenfeld wechselst du zum nächsten Modus.

- **Fragen** (Standard): fragt, bevor er Dateien bearbeitet und bevor er Befehle ausführt. Befehle, die sich nur umsehen (`ls`, `cat`, `git status` und dergleichen), laufen ohne Nachfrage.
- **Änderungen akzeptieren**: bearbeitet Dateien im Ordner der Sitzung ohne Nachfrage; fragt, bevor er Befehle ausführt (außer solchen, die sich nur umsehen) und bevor er etwas außerhalb des Ordners tut.
- **Automatisch**: Routineschritte laufen durch; eine schnelle Prüfung fragt dich bei riskanten. Siehe [Auto-Modus](#auto-mode).
- **Voller Zugriff**: Tools und Befehle laufen ohne Genehmigungsabfragen oder die [Sandbox](#the-sandbox-for-commands) für Befehle, auch Administratorbefehle und Änderungen außerhalb des Ordners. Sie nutzen die Berechtigungen deines Computerkontos: Das gibt keinen Administratorzugriff, den dein Konto nicht hat. Vertrauliche Sitzungen behalten ihre Netzwerkbeschränkungen weiterhin.
- **Plan**: liest und plant nur. Custom kann keine Dateien bearbeiten oder Befehle ausführen und nutzt nur Tools, die lesen. Am Ende steht ein nummerierter Plan. Um ihn auszuführen, wechsle in einen anderen Modus und sage, dass er loslegen soll.

Außerhalb von Voller Zugriff fragen manche Befehle immer: siehe [Befehle, die immer nachfragen](#commands-that-always-ask).

## Genehmigen oder Ablehnen, was Custom tun möchte

Wenn Custom dein OK braucht, erscheint in der Sitzung (und im [Posteingang](/guide/inbox)) eine Karte. Ihr Titel sagt, was der Schritt tut und warum er fragt, zum Beispiel „/home/you/notes/plan.md bearbeiten – ändert Dateien außerhalb des Sitzungsordners“. Bei einem Befehl zeigt die Karte den ganzen Befehl.

- **Erlauben** lässt diesen einen Schritt laufen.
- **Immer erlauben …** lässt ihn und ähnliche Schritte ab jetzt in dieser Sitzung ohne Nachfrage laufen. Die Schaltfläche sagt, was sie abdeckt: „Immer erlauben: npm run build …“, „Alle Änderungen erlauben“, „Lesen in ~/data immer erlauben“, „Änderungen in ~/site immer erlauben“.
- **Ablehnen** stoppt diesen Schritt. Custom wird mitgeteilt, dass du abgelehnt hast und es nicht erneut versuchen soll.

So funktioniert **Immer erlauben** bei Befehlen: Custom zerlegt einen Befehl in seine Teile (bei `&&`, `;`, `|` und so weiter) und prüft jeden einzeln. Eine Regel gilt für den Befehl, für den sie erstellt wurde, anhand seiner ersten Wörter (`git status`, `npm run build`, `docker compose up`), sodass nach `&&` nichts mitlaufen kann. Befehle, die sich nur umsehen, brauchen nie eine Regel.

**Immer erlauben** wird nicht angeboten, wenn es nicht sicher sein kann:

- bei Code, der direkt im Befehl steht (etwa `python -c "…"`);
- bei einer Datei, deren Name nicht im Voraus bekannt sein kann;
- bei einem Befehl, der sich nicht sicher lesen lässt;
- bei riskanten Befehlen, die jedes Mal fragen.

## Befehle, die immer nachfragen

Außerhalb von Voller Zugriff fragen diese Schritte jedes Mal, auch im Modus Automatisch, egal was du vorher erlaubt hast:

- Ausführen als Administrator (`sudo` und dergleichen);
- Löschen von Dateien außerhalb des Sitzungsordners, Löschen des Sitzungsordners selbst oder Löschen von Dateien, die er nicht im Voraus benennen kann;
- einen Download direkt in eine Shell leiten oder einen Download sofort ausführen;
- rohe Daten auf einen Datenträger schreiben, einen Datenträger formatieren oder neu partitionieren;
- den Computer herunterfahren oder neu starten;
- geplante Jobs ändern (`crontab`);
- Berechtigungen oder Besitzer eines ganzen Ordnerbaums ändern;
- SSH-Keys oder Einstellungen und Startdateien in deinem Home-Ordner ändern (etwa `.bashrc` oder `~/.config`), es sei denn, die Sitzung arbeitet in diesem Ordner.

## Dateien außerhalb des Ordners und Dateien mit Keys

In den Modi Fragen, Änderungen akzeptieren und Plan fragt Custom, bevor er Dateien außerhalb des Sitzungsordners liest oder ändert (der temporäre Ordner zählt nicht). **Immer erlauben** gilt dann für diesen Ordner, zum Lesen oder für Änderungen.

Dateien, die Keys oder Passwörter enthalten, fragen vor dem Lesen oder Ändern nach, auch innerhalb des Ordners: `.env`-Dateien (keine Beispiele), SSH- und andere private Keys, `.netrc`, `.npmrc`, Dateien mit Zugangsdaten, deine Cloud- und Passwortspeicher-Ordner, die Anmeldungen der Agenten selbst und die eigenen Daten der App. Änderungen an den eigenen Einstellungen und Hooks von Git fragen ebenfalls nach. **Immer erlauben** gilt dann nur für diese eine Datei.

Im Auto-Modus entscheiden stattdessen die Regeln von Automatisch und seine schnelle Prüfung darüber. Bei Voller Zugriff fragen sie nicht.

## Auto-Modus

Der **Auto-Modus** lässt Routinearbeit ohne Unterbrechung durchlaufen und fragt bei dem Rest nach. Wähle **Automatisch** unter **Berechtigungen**.

Jeder Schritt, der nachfragen würde, durchläuft der Reihe nach diese Prüfungen:

1. **Feste Regeln**, die kein Modell brauchen:
   - Weiter geht es bei: Bearbeitungen im Ordner der Sitzung; neuen Hilfsdateien im temporären Ordner; Befehlen, die nur im Ordner lesen; den eigenen Tests, Builds, Lintern und Typprüfungen des Projekts.
   - Nachfrage bei dir: Überschreiben einer Datei außerhalb des Ordners; allem auf der [Liste der Befehle, die immer fragen](#commands-that-always-ask); Force-Push mit Git; Schreiben, Verschieben oder Löschen von Dateien außerhalb des Ordners; Befehlen, die einen Zahlungsdienst aufrufen; Tools eines verbundenen Kontos oder MCP-Servers, die etwas senden oder posten oder Geld ausgeben.
2. **Eine schnelle Prüfung** für alles andere, durch das [Hilfsmodell](/guide/agents-models#choose-the-helper-model). Sie antwortet auf eine von drei Arten:
   - **Erlauben**: Der Schritt dient offensichtlich dem, worum du gebeten hast, bleibt in deinem Ordner (oder liest nur) und lässt sich leicht rückgängig machen;
   - **Fragen**: Er könnte bleibenden Schaden anrichten oder reicht weiter (Daten löschen, Software für das ganze System installieren, Einstellungen ändern, Passwörter oder Keys verwenden, etwas senden oder veröffentlichen, Geld ausgeben oder etwas, worum du nicht gebeten hast);
   - **Ablehnen**: Er ist eindeutig schädlich oder widerspricht dem, was du willst. Der Schritt läuft nicht; Custom wird mitgeteilt, warum, und muss einen anderen Weg finden.

Die schnelle Prüfung sieht nur deine eigenen Nachrichten in der Sitzung (die erste und die letzten zehn), das Ziel, falls du eines gesetzt hast, den Ordner und den Schritt selbst (bei einer Bearbeitung den Anfang des neuen Textes). Sie sieht nie, was Custom gelesen hat, sodass eine Webseite oder eine Datei sie zu nichts überreden kann. Wenn die Prüfung fehlschlägt oder länger als 45 Sekunden dauert, entscheidest du. Innerhalb eines Durchgangs bekommt derselbe Schritt dieselbe Antwort. In einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) bleibt die Prüfung auf diesem Computer: Das Hilfsmodell übernimmt sie, wenn es hier läuft, sonst das eigene Modell der Sitzung.

In der Sitzung trägt ein Schritt, den Automatisch durchgelassen hat, ein kleines Label **Automatisch**; fahre mit der Maus darüber, um den Grund zu sehen. Ein Schritt, den Automatisch gestoppt hat, zeigt das Label in Rot; fahre darüber für „Automatisch hat das gestoppt: …“ und den Grund. Eine Karte, die Automatisch an dich schickt, beginnt mit „Automatisch:“ und dem Grund.

[Einstellungen → Funktionen → Custom](/settings?s=custom&find=Auto%20mode) hat eine Zeile **Auto-Modus**, deren (i) den Auto-Modus mit denselben Worten beschreibt; dort gibt es nichts umzuschalten.

## Die Sandbox für Befehle

Im Modus „Automatisch“ können die Befehle von Custom in einer Sandbox laufen: Sie dürfen Dateien nur im Ordner der Sitzung und in temporären Ordnern ändern, alles andere auf dem Computer ist schreibgeschützt. Das Netzwerk können sie weiterhin nutzen. Arbeitet die Sitzung in einem Git-Worktree oder in einem Unterordner eines Repositorys, bleibt auch der eigene Ordner des Repositorys beschreibbar, damit Git committen kann. Die Caches von Paketmanagern wandern in einen temporären Ordner. Wie die Sandbox aufgebaut wird, hängt von deinem Computer ab:

- **Linux**: Sie nutzt bubblewrap. Befehle können Dateien im Ordner der Sitzung, im temporären Ordner (`/tmp`) und im eigenen Ordner des Repositorys ändern.
- **Mac**: Sie nutzt Seatbelt, die Sandbox, die zu macOS gehört. Die Regel ist dieselbe: der Ordner der Sitzung, die temporären Ordner und der eigene Ordner des Repositorys.
- **Windows**: Befehle laufen mit niedriger Integrität („low integrity“), einem Schutz von Windows: Sie können alles lesen, Dateien aber nur in Ordnern ändern, die dafür markiert sind. Beim ersten Mal markiert Hydor den Ordner der Sitzung (und den eigenen Ordner des Repositorys), und die Markierung bleibt bestehen. Befehle bekommen einen eigenen temporären Ordner in `AppData\LocalLow\Hydor` für temporäre Dateien und Paket-Caches. Dein Home-Ordner, ein ganzes Laufwerk, Windows, Program Files und die Ordner für App-Daten werden nie markiert: In einem solchen Ordner laufen Befehle ohne Sandbox. Die Bash von Git kann ihre internen Daten bei niedriger Integrität nicht mit deinen gewöhnlichen Bash-Fenstern teilen. Deshalb legt Hydor beim ersten Mal außerdem eine Kopie der Git-Programme für Befehle in der Sandbox an, in `AppData\Local\Hydor\sandbox` (sie besteht aus Verknüpfungen auf dieselben Dateien und braucht daher keinen Platz, wenn Git auf demselben Laufwerk liegt).

Stößt ein Befehl an die Grenzen der Sandbox, erfährt Custom, dass der Befehl in einer Sandbox lief, und arbeitet entweder innerhalb der Grenzen weiter oder sagt dir, was woanders erledigt werden muss.

Zum Ein- oder Ausschalten öffnest du [Einstellungen → Funktionen → Custom](/settings?s=custom&find=Sandbox%20for%20commands) und benutzt den Schalter bei **Sandbox für Befehle**. Sie ist standardmäßig eingeschaltet. Schalte sie aus, wenn ein Werkzeug woanders schreiben muss, zum Beispiel um etwas für das ganze System zu installieren. Die Änderung gilt für laufende Sitzungen nach etwa 15 Sekunden.

Kann die Sandbox nicht laufen, ist der Schalter ausgegraut, und die Zeile nennt den Grund; Befehle laufen dann ohne Sandbox. Unter Linux bedeutet das, dass bubblewrap nicht installiert ist oder nicht laufen kann (wie in manchen Containern). Auf einem Mac bedeutet es, dass Seatbelt nicht starten konnte. Unter Windows baut Hydor beim ersten Mal mit dem .NET Framework, das zu Windows gehört, ein kleines Hilfsprogramm; außerdem braucht es Git für Windows (das Befehle ohnehin brauchen): Die Zeile sagt es, wenn eines davon fehlt oder das Hilfsprogramm nicht starten kann. In den Modi „Fragen“ und „Änderungen akzeptieren“ nutzen Befehle die Sandbox nicht: Dort wartet jeder Befehl, der mehr tut, als sich nur umzusehen, auf dein OK oder auf eine Regel, die du mit **Immer erlauben** gespeichert hast.

In einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) läuft jeder Befehl ohne Netzwerk, in jedem Modus und unabhängig von diesem Schalter, sodass er weder das Internet noch deine anderen Computer noch die Server dieses Computers erreichen kann. Die Dateien bleiben so, wie der Modus sie vorsieht. Das funktioniert unter Linux (bubblewrap) und auf einem Mac (Seatbelt). Windows kann das Netzwerk auf diese Weise nicht abschalten; daher fragt dort und überall, wo die Sandbox nicht laufen kann, jeder Befehl in jedem Modus zuerst bei dir nach, ohne **Immer erlauben**. Custom wird darüber informiert, und ein Befehl, der das Netzwerk zu nutzen versucht, erfährt, warum es fehlgeschlagen ist.

## Custom ein Ziel geben

Ein Ziel hält Custom Runde um Runde bei der Arbeit, bis eine Bedingung erfüllt ist: „npm test läuft durch und die Upload-Seite kommt mit 2-GB-Dateien zurecht“.

1. Öffne das Menü der Sitzung (⋯) → **Ziel setzen**.
2. Beschreibe, wie „fertig“ aussieht, als Bedingung, die wahr ist, wenn die Arbeit erledigt ist.
3. Klicke auf **Arbeit am Ziel starten** (oder drücke Ctrl+Enter, auf einem Mac ⌘Enter).

Custom legt sofort los; läuft gerade ein Durchgang, wird das Ziel geprüft, wenn dieser Durchgang endet.

Nach jedem Durchgang prüft das Hilfsmodell das Ziel anhand der Belege: was die Schritte getan und gezeigt haben (Befehlsausgaben, Testergebnisse, Dateien, gelesene Seiten). Dass Custom sagt, es sei fertig, zählt allein nicht. Danach gilt:

- **Fertig**: Das Ziel wird geleert, und du bekommst die Meldung „Goal met“.
- **Noch nicht**: Die Prüfung schreibt den nächsten Schritt und schickt ihn als nächste Nachricht („Goal check 3: not there yet…“).
- **Braucht dich**: Das Ziel zeigt „stuck: the agent needs you“ mit der Frage, und du bekommst eine Meldung. Antworte in der Sitzung.
- **Warten** auf etwas von außen (ein Deployment, ein Download): Es schaut in drei Minuten erneut nach.

Deine eigenen Nachrichten haben Vorrang: Eine Prüfung wartet, bis die Warteschlange leer ist.

Das Ziel pausiert und sagt dir, warum, wenn:

- es so viele nächste Schritte gesendet hat, wie **Runden bis zur Zielpause** in den Einstellungen erlaubt (30, wenn du es nicht änderst);
- drei Runden in Folge keinen Fortschritt gebracht haben;
- du den Agent gestoppt hast, ein Durchgang fehlgeschlagen ist, der Agent nicht lief oder die Prüfung selbst fehlgeschlagen ist.

Die Zielleiste über dem Nachrichtenfeld zeigt das Ziel, den Stand („working on it“, „paused“, „stuck: the agent needs you“), wie oft und wie lange geprüft wurde und den Grund der letzten Prüfung. **Pausieren** schickt keine weiteren nächsten Schritte (ein bereits laufender Durchgang wird beendet), **Fortsetzen** macht beim letzten nächsten Schritt weiter (die Rundenzählung beginnt von vorn), und **Leeren** beendet die Arbeit am Ziel. Während ein Ziel läuft, bekommst du eine einzige Meldung, wenn es erreicht ist, statt einer nach jedem Durchgang.

Um zu ändern, wie viele Runden ein Ziel laufen darf, öffne [Einstellungen → Funktionen → Custom](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses) und wähle **10**, **30** oder **100** in der Zeile **Runden bis zur Zielpause** in der Gruppe **Ziele**.

## Lange Unterhaltungen und lange Ausgaben

Jedes Modell kann nur begrenzt viel auf einmal lesen (seinen Kontext). Custom hält jede Unterhaltung von selbst innerhalb dieser Grenze, deshalb gibt es für Custom-Sitzungen keine Schaltfläche „Verdichten“:

1. Nähert sich die Unterhaltung der Grenze (mit Platz für die Antwort), leert Custom zuerst alte Werkzeugausgaben. Die Sitzung vermerkt: „Cleared old tool output to keep within the model's context.“
2. Reicht das nicht, fasst das Modell den früheren Teil in Notizen zusammen, mit denen die Arbeit weitergeht („Summarizing the earlier conversation to keep within the model's context…“). Beim nächsten Mal aktualisiert es diese Notizen, statt von vorn anzufangen. Dein Plan und die verwendeten Skills bleiben in beiden Fällen erhalten.

Sagt der Server eines Modells, die Unterhaltung sei zu lang, lernt Custom die echte Grenze dieses Modells und verdichtet sofort. Nur die neuesten paar Bilder gehen mit jeder Anfrage mit.

Was Memory Custom am Anfang mitgegeben hat, bleibt während der Arbeit unverändert, damit der Server des Modells wiederverwenden kann, was er von der Unterhaltung behalten hat; das ist schneller und kostet weniger. Jedes Mal, wenn Custom verdichtet, liest es Memory für deine neueste Nachricht erneut (siehe [Womit ein Agent startet](/guide/memory#what-an-agent-starts-with)).

Der Ring neben dem Nachrichtenfeld zeigt in Prozent, wie voll der Kontext des Modells ist; zeige darauf, um die Tokens und ihre Verwendung zu sehen. Unter **Optionen** (dem Chip unter dem Nachrichtenfeld) steht in der Zeile **Kontext** „42% in use“ mit einem kleinen Pfeil: Klicke darauf, um die Aufschlüsselung ein- oder auszublenden; anfangs ist sie eingeklappt: **Anweisungen**, **Projektanweisungen**, **Memory**, **App-Funktionen**, **Skills**, **Werkzeuge** und **Unterhaltung**, jeweils mit ihren Tokens und einem dünnen Balken für ihren Anteil. Ein Teil ohne Inhalt wird weggelassen. Die Zahlen werden aus dem Text geschätzt und auf das skaliert, was der Server des Modells gezählt hat. Ein Klick auf den Ring bewirkt in einer Custom-Sitzung nichts, weil Custom von selbst verdichtet; Sitzungen mit Claude Code und Codex behalten ihren Ring und **Verdichten** (siehe [Die Anzeigen lesen](/guide/sessions#read-the-meters-context-cache-and-speed)).

Auch lange Ausgaben füllen die Unterhaltung nicht. Gibt ein Befehl, eine Seite oder ein Werkzeug mehr zurück als einen bestimmten Anteil des Kontexts des Modells, behält Custom das Ganze in einer Datei im eigenen Ordner der Sitzung. Das Modell bekommt den Anfang und das Ende (bei einem Befehl vor allem das Ende, wo Fehler auftauchen) und den Ort der Datei und liest den Rest in Stücken oder durchsucht ihn. Diese Dateien werden nach einer Woche gelöscht.

## Was das Modell liest

Vor deiner Nachricht bekommt das Modell in dieser Reihenfolge:

- Customs eigene Regeln (wie zu arbeiten ist, den Modus, den Ordner), die Anweisungen des Agents und deine Agentenrichtlinien: **Anweisungen** in der Aufschlüsselung;
- die Anweisungen des Projekts, seine `AGENTS.md` oder `CLAUDE.md`: **Projektanweisungen**;
- was [Memory](/guide/memory#what-an-agent-starts-with) zu deiner Anfrage hat: **Memory**;
- was die Funktionen der App vorgeben: wie Antworten aussehen, wie Keys und Passwörter aus dem Chat herausgehalten werden, wie aufgeräumt wird und wie die Werkzeuge, die es vollständig hat, zu benutzen sind (Bilder, Apps, der Browser, Dokumente und so weiter): **App-Funktionen**;
- seine Skills (**Skills**), nach Gruppen benannt: die des Projekts, deine eigenen, dann die Gruppen der Bibliothek wie Coding oder Dokumente. Custom kann einen Skill über seinen Namen laden oder danach suchen, worum es bei der Arbeit geht. Custom nimmt bis zu 200 Skills, davon höchstens 40 aus dem Projekt und von dir. Die Skills, die zu deiner ersten Nachricht passen, kommen mit der Angabe, wofür sie gut sind;
- seine Werkzeuge, die es vollständig hat, und eine kurze Liste der übrigen: **Werkzeuge**.

Die Anweisungen einer Funktion zu ihren eigenen Werkzeugen kommen mit diesen Werkzeugen. Solange ein Werkzeug in Customs kurzer Werkzeugliste wartet, warten auch seine Anweisungen; sie werden hinzugefügt, wenn das Modell das Werkzeug nachschlägt oder benutzt. Die Regeln, die unabhängig von den verwendeten Werkzeugen gelten, bleiben immer erhalten. Claude Code und Codex bekommen wie bisher alle Anweisungen der App am Anfang.

Eine erste Nachricht an ein Modell mit kleinem Kontext ist also kürzer als früher, und was jeder Teil braucht, steht in der Aufschlüsselung unter **Optionen**: siehe [Lange Unterhaltungen und lange Ausgaben](#long-conversations-and-long-output).

**Memory wird an den Kontext des Modells angepasst.** Ein Modell mit kleinem Kontext könnte seine Arbeit nicht erledigen, wenn Memory eine feste Menge belegte. Darum schrumpft der Anteil von Memory mit dem Fenster (die Zeile **Memory** der Aufschlüsselung zeigt, was es belegt):

- **Unter 12.000 Tokens**: ein kleiner Block, höchstens 6 % des Kontexts, mit den ersten 120 Wörtern deines Profils (es steht dabei, dass es nur der Anfang ist), höchstens drei Notizen und ohne Index. Memory fügt nichts zu deinen Nachrichten hinzu und auch nichts, wenn das Modell eine Datei liest oder ändert, und liefert keine Zeilen zu Wiki-Artikeln oder Plänen. Dem Modell wird gesagt, dass es Notizen mit dem Memory-Werkzeug nachschlagen kann.
- **Bis etwa 33.000 Tokens** (nicht über OpenRouter): ein Block von höchstens 6 % des Kontexts, die ersten 400 Wörter deines Profils, höchstens fünf Notizen, ein kurzer Index, eine Zeile zu einem Wiki-Artikel und eine Zeile zu einem Plan sowie höchstens eine Notiz zu einer Nachricht (600 Zeichen) und eine, wenn eine Datei gelesen oder geändert wird (350).
- **Größere Modelle**: alles, was [Memory einem Agent mitgibt](/guide/memory#what-an-agent-starts-with); das ist ein kleiner Anteil ihres Kontexts.

Als Richtwert: Der Block von Memory umfasst etwa 1.700 Zeichen bei einem Modell mit 8.000 Tokens, 3.800 bei 32.000 und 7.300 bei 200.000. Eine Sitzung, die nur den Anfang deines Profils bekommen hat, kann es nicht umschreiben: Das Modell sagt dir, was du ergänzen sollst, oder du bearbeitest es in [Einstellungen → Memory](/settings?s=memory&find=Your%20profile). Auch die Anweisungen zum Wiki sind gekürzt: Custom bekommt immer einen kurzen Absatz zum Wiki-Memory, und wie man Quellen aufbewahrt, das Wiki prüft und Pläne übernimmt, kommt nur, solange die Werkzeuge dafür angeboten werden. Nachdem Custom seine Unterhaltung verdichtet hat, wird der Checkpoint der Sitzung (siehe [Checkpoints](/guide/wiki-memory#checkpoints)) auf 8 % des Kontexts gekürzt, höchstens 16.000 Zeichen, mit dem Hinweis, wo der Rest zu lesen ist.

## Wie Custom mit schwächeren Modellen umgeht

Nicht jedes Modell ist so geübt im Umgang mit Tools wie Claude oder GPT. Custom fängt die typischen Ausrutscher ab und bringt das Modell wieder auf Kurs:

- **Wiederholungen**: Derselbe Schritt, an dem sich seit dem letzten Mal nichts geändert hat, wird kein drittes Mal ausgeführt (das Modell bekommt den Hinweis, das frühere Ergebnis zu verwenden); beim fünften Mal endet der Durchgang.
- **Fehlschlagende Schritte**: Nach vier fehlgeschlagenen Schritten in Folge soll das Modell anhalten und neu nachdenken; nach acht endet der Durchgang.
- **Kreisläufe**: Schritte, die sich im Kreis drehen, bekommen einen Hinweis, etwas anderes zu versuchen.
- **Unfertige Arbeit**: Ein Modell, das „Lass mich …“ sagt, ohne es zu tun, oder aufhört, obwohl Punkte seines Plans noch offen sind, wird zurück an die Arbeit geschickt, jeweils einmal. Hat es Code geändert, ohne die Prüfungen des Projekts auszuführen, wird es gebeten, sie vor dem Abschluss auszuführen.
- **Länge**: Ein Durchgang hat höchstens 200 Schritte; bei 150 wird das Modell angewiesen, den wichtigsten Teil abzuschließen. Eine Antwort, die durch das Längenlimit des Modells abgeschnitten wurde, wird in kürzeren Schritten fortgesetzt.
- **Defekte Tool-Aufrufe**: Als Text geschriebene Aufrufe werden gelesen und ausgeführt, Aufrufe mit fast richtigen Argumenten werden repariert, und ein falsch geschriebener Tool-Name wird dem richtigen zugeordnet oder mit der Liste der Tools beantwortet. Eine Antwort, die ihre Aufrufe als Text schreibt, endet dort, wo ihre Aufrufe enden: Was ein Modell danach schreibt (erfundene Ergebnisse, weitere Aufrufe obendrauf, derselbe Aufruf noch einmal), wird weder ausgeführt noch behalten, und aus einer Antwort werden höchstens sechs Aufrufe ausgeführt.
- **Modelle ohne Tool-Aufrufe**: Wenn der Server eines Modells keine Tools annimmt, beschreibt Custom sie in den Anweisungen und liest die Aufrufe des Modells aus dem, was es schreibt.
- **Claude über Claude Code**: Anthropic erlaubt nur den eigenen Programmen, die Anmeldung eines Abos zu nutzen. Deshalb antwortet ein Claude-Modell deines Abos über Claude Code selbst, Schritt für Schritt. Die Tools von Custom werden in den Anweisungen beschrieben, und Claude schreibt seine Tool-Aufrufe als Text, wie bei einem Modell ohne Tool-Aufrufe; jeder Schritt nutzt den Cache des vorherigen. Claude Code kann eine Antwort nicht an ihren Tool-Aufrufen beenden, also beendet Custom sie dort selbst und stoppt das Programm, bevor Claude erfundene Ergebnisse schreiben kann. Die Modelle von Codex sind anders: Sie werden direkt über dein ChatGPT-Abo angefragt, mit den Tools von Custom als echten Tools.
- **Aussetzer**: Wenn die Verbindung mitten in der Antwort abbricht oder der Server ausgelastet ist, wartet Custom und versucht es einige Male erneut. Wenn die App neu startet (bei einem Update), während ein Schritt auf ein Modell deines Abos wartet, wird der Schritt erneut angefragt, sobald die App wieder da ist; ein Durchgang, der wegen des Neustarts geendet hat, sagt das, und eine Nachricht führt ihn fort.
- **Viele Tools**: Gibt es viele (von MCP-Servern und Verbindungen), sieht das Modell eine kurze Liste und schlägt die vollständige Beschreibung der Tools nach, die es braucht; die Anweisungen einer Funktion zu einem Tool kommen mit, wenn das Modell es nachschlägt oder verwendet (siehe [Was das Modell liest](#what-the-model-reads)). Ein Modell mit kurzem Kontext (etwa 32.000 Tokens oder weniger, nicht über OpenRouter) bekommt ein schlankeres Set: keine Hinweise zu Antwort-UIs, eine Liste der Tools nur mit Namen und weniger Tools in voller Form (auch das Tool, das eine HTML-Seite anzeigt, steht nur in der Liste). Es wird außerdem gebeten, kleine Schritte zu machen.
- **Jede Modellfamilie** bekommt die empfohlenen Einstellungen ihres Herstellers, das Bearbeitungsformat, mit dem sie trainiert wurde, und einen Denkaufwand, wo es einen gibt. Schritte, die nur lesen, laufen gleichzeitig, um Wartezeit zu sparen.

Wenn Custom einen Durchgang aus einem dieser Gründe stoppt, endet die Antwort mit „(Stopped: …)“.

## Bilder für Modelle, die nichts sehen

Ein Modell, das Bilder sieht, bekommt deine Bilder direkt. Die Bilder werden vorher verkleinert, wenn dieser Computer ffmpeg oder ImageMagick hat.

Für ein Modell, das keine Bilder sieht, beschreibt das Hilfsmodell jedes Bild in Worten: was es zeigt, wo sich etwas befindet und welchen Text es enthält, genau abgeschrieben. Dafür braucht es ein Hilfsmodell, das Bilder sieht: Öffne [Einstellungen → Agents → Modelle](/settings?s=models&find=Helper%20model) und wähle im Menü **Modell** der Gruppe **Hilfsmodell** eines, das mit „sees images“ markiert ist. „Automatisch“ geht nicht. Ohne ein solches Modell sagt Custom dem Modell, dass es ein Bild gibt, das es nicht sehen kann. In einer vertraulichen Sitzung beschreibt nur ein Hilfsmodell auf diesem Computer Bilder (ein Modell deiner Abos tut das nie).

## Verzweigen und Von hier aus bearbeiten

Custom-Sitzungen lassen sich wie Sitzungen von Claude Code und Codex verzweigen: Menü der Sitzung (⋯) → **Verzweigen**. Du kannst auch eine frühere Nachricht von dir ändern, mit **Von hier aus bearbeiten**: Die Unterhaltung wird in einer Kopie von kurz vor dieser Nachricht fortgesetzt, und die bisherige wird archiviert. Setze einen Haken bei **Dateien auf den Stand vor dieser Nachricht zurücksetzen**, um die Dateiänderungen seitdem rückgängig zu machen. Bei Custom betrifft das die Dateien, die seine eigenen Bearbeitungen geändert haben; was Befehle geändert haben, bleibt so, wie es ist.

Custom speichert jede Unterhaltung auf der Festplatte, sodass sie nach einem Neustart der App weiterläuft.

## Was Custom kostet

- Modelle über OpenRouter: OpenRouter meldet, was jeder Aufruf gekostet hat, und die Ausgaben der Sitzung beruhen darauf. Claude-Modelle werden dort gebeten, die Unterhaltung in ihrem Cache zu halten, wie es die anderen von selbst tun, sodass jeder Schritt sie für etwa ein Zehntel des Preises wieder einliest; und die Tools, die Custom angeboten werden, ändern sich höchstens einmal pro Sitzung (die Tools für Befehle im Hintergrund bleiben, sobald einer gelaufen ist), damit dieser Cache hält.
- Modelle deines Claude- oder ChatGPT-Abos (unter **Deine Abos**): Es zählt die Nutzung deines Abos, kein Geld pro Token, deshalb zeigt eine Sitzung für diese Schritte 0 $ an. Ein Konto, das sein Nutzungslimit erreicht hat oder abgemeldet ist, gibt den Schritt an dein nächstes Konto dieses Programms weiter (bei eingeschaltetem **Bei erreichtem Limit das Konto wechseln**).
- Modelle auf diesem Computer (Ollama, vLLM): nichts.
- Andere Endpunkte: Die Tokens werden wie bei den anderen Agenten berechnet (siehe [Nutzung, Limits und Kosten](/guide/usage)).

Die Sitzung zeigt über dem Nachrichtenfeld die API-Kosten sowie Eingabe-, Cache- und Ausgabe-Tokens, auch ohne Ausgabenlimit. Die Kosten stammen aus der Antwort von OpenRouter oder aus dessen Generierungsprotokoll, falls die gestreamten Kosten fehlen; als Ausweichlösung dienen dessen eigene Katalogpreise. Preise musst du nicht von Hand eingeben.

Ein [Ausgabenlimit](/guide/usage#cap-what-a-session-spends) funktioniert auch für Custom-Sitzungen.

## Einstellungen → Funktionen → Custom

[Einstellungen → Funktionen → Custom](/settings?s=custom) („Auto-Modus, eine Sandbox für Befehle und wie lange Ziele laufen“) hat drei Zeilen:

- **Auto-Modus** (einer der Modi von Custom, neben Fragen, Änderungen annehmen, Voller Zugriff und Plan): Sein (i) sagt, was Auto durchlässt, was immer nachfragt und dass das Hilfsmodell die Prüfung macht. Es gibt nichts umzuschalten: Du wählst Auto pro Sitzung unter **Berechtigungen**.
- **Sandbox für Befehle** (im Auto-Modus ändern Befehle Dateien nur im Ordner der Sitzung und in /tmp unter Linux, in den temporären Ordnern auf einem Mac oder in einem eigenen temporären Ordner unter Windows; Voller Zugriff läuft ohne diese Sandbox und ohne Rückfragen): ein Schalter, standardmäßig an. Ausgegraut, wenn die Sandbox hier nicht laufen kann (bubblewrap unter Linux, Seatbelt auf einem Mac, Git for Windows und das .NET Framework unter Windows); die Zeile sagt, warum.
- **Runden bis zur Zielpause** in der Gruppe **Ziele** (mit /goal arbeitet Custom Durchgang um Durchgang, bis das Ziel erreicht ist; nach dieser Anzahl Runden pausiert es für dich): **10**, **30** (Standard) oder **100** Runden. Es pausiert außerdem nach drei Runden ohne Fortschritt.

Die Modelle von Custom findest du unter [Einstellungen → Agents → Modelle](/settings?s=models), und das Modell, das die Prüfungen macht, ist dort das **Hilfsmodell**.

## Einen Agent fragen

- „Schalte die Sandbox für die Befehle im Auto-Modus von Custom aus.“
- „Lass die Ziele von Custom bis zu 100 Runden laufen.“
- „Setze für meine Custom-Sitzung ‚Upload-Seite‘ ein Ziel: npm test läuft durch und Uploads von 2 GB funktionieren.“
- „Welches Hilfsmodell nutzt der Auto-Modus, und kann es Bilder sehen?“
- „Kann dieser Computer die Befehle meiner vertraulichen Sitzungen ohne Netzwerk ausführen?“
- „Füge Qwen3 Coder von OpenRouter hinzu, damit ich es mit Custom nutzen kann.“ (sobald dein OpenRouter-Key eingerichtet ist)
- „Zeig mir meine OpenRouter-Nutzung und -Kosten, ohne dass ich Modellpreise eingeben muss.“
- „Warum ist meine erste Nachricht an Custom bei einem lokalen Modell so lang?“
- „Wie voll ist der Kontext meiner Custom-Sitzung, und was braucht am meisten?“
- „Lass meine Custom-Sitzung auf dem Sonnet meines Claude-Abos laufen statt über OpenRouter.“
- „Welches Modell ist für Custom Am besten, und können meine Custom-Sitzungen mit Automatisch starten?“
