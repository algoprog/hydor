# Custom, der eigene Agent der App

Custom ist der eigene Agent von Hydor: Er nutzt die Modelle deiner Claude- und ChatGPT-Abos sowie jedes Modell, das du hinzufügst, von OpenRouter, Ollama, vLLM oder einem anderen OpenAI-kompatiblen Server, mit denselben Werkzeugen, Skills und Verbindungen wie Claude Code und Codex. Dieses Thema behandelt, was er kann, seine Berechtigungsmodi und wie er Befehle prüft, den Auto-Modus, die Sandbox für Befehle, Ziele, wie er mit langer Arbeit und schwächeren Modellen zurechtkommt, und seine Einstellungen.

![Einstellungen → Modelle: das Hilfsmodell und Modelle auf diesem Computer](images/custom.webp)

## Was Custom ist und wann du es nutzt

Claude Code nutzt nur Modelle von Anthropic und Codex nur die von OpenAI. Custom nutzt auch die Modelle deiner Claude- und ChatGPT-Abos, über die Anmeldungen von Claude Code und Codex auf diesem Computer, sowie jedes Modell, das du unter [Einstellungen → Agenten → Modelle](/settings?s=models) einrichtest: offene Modelle auf deinem eigenen Computer, günstige oder kostenlose Modelle über OpenRouter oder einen eigenen Server. Für die Modelle deiner Abos musst du nichts einrichten: Sobald Claude Code angemeldet ist, bietet das Menü **Modell** von Custom Claude Opus, Fable, Sonnet und Haiku an, und sobald Codex mit ChatGPT angemeldet ist, die Modelle, die dein ChatGPT-Abo auflistet, alle unter **Deine Abos**. Sie verbrauchen die Nutzung deines Abos, keinen API-Key. Unter [Agenten, Konten und Modelle](/guide/agents-models#where-customs-models-come-from) erfährst du, woher die Modelle von Custom kommen und wie du weitere hinzufügst.

Nutze Custom, wenn du Folgendes möchtest:

- ein Modell, das deinen Computer nie verlässt (Ollama oder vLLM), oder eine ganze Sitzung, die das nicht tut: Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) läuft immer auf Custom und nutzt nur Modelle auf diesem Computer oder in deinem eigenen Netzwerk (nie die Modelle deiner Abos, die auf den Servern von Anthropic oder OpenAI laufen);
- ein bestimmtes Modell, etwa DeepSeek, Qwen, GLM oder Kimi;
- die eigenen Werkzeuge und Regeln von Custom mit einem Modell deines Claude- oder ChatGPT-Abos, oder um Kosten zu sparen, oder um weiterzuarbeiten, wenn dein Claude- oder ChatGPT-Abo aufgebraucht ist (mit einem Modell von anderswo).

Custom hilft bei allem: Recherche, Schreiben, Dokumenten und Alltagsaufgaben. In einem Code-Projekt (einem Ordner mit einer `package.json`, `Cargo.toml`, einem Git-Repository und Ähnlichem) arbeitet es wie ein sorgfältiger Entwickler: Es liest, bevor es etwas ändert, folgt den eigenen Anweisungen des Projekts und führt die Tests und Prüfungen des Projekts aus, bevor es sagt, dass es fertig ist.

Custom liest die `AGENTS.md`- oder `CLAUDE.md`-Dateien des Projekts und folgt deinen [Agentenrichtlinien](/guide/guidelines), wie die anderen Agenten.

## Eine Custom-Sitzung starten

1. Klicke auf der Startseite auf **Agent** und wähle **Custom** („Jedes Modell: OpenRouter, Ollama, vLLM“).
2. Klicke auf **Modell** und wähle eines deiner Modelle, oder **Automatisch**, wenn das Menü es anbietet: Die Leistungsstufen von Custom füllen sich selbst aus den Modellen, die es hat (zuerst die deines Claude-Abos, dann die deines ChatGPT-Abos, dann die, die du hinzugefügt hast und die nicht auf diesem Computer laufen). Sobald die Stufe „Am besten“ ein Modell nennt, startet eine Sitzung auf „Automatisch“ damit und leitet Subagents an (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Wenn die Liste leer ist, füge zuerst ein Modell hinzu: **Agent** → **Modelle für Custom**.
3. Wähle unter **Optionen** die **Berechtigungen** (siehe [Festlegen, was Custom ohne Nachfrage tun darf](#choose-what-custom-may-do-without-asking)). Custom hat keine Aufwand-Einstellung.
4. Tippe die Aufgabe ein und drücke die Eingabetaste.

Ein Modell auf diesem Computer, das über vLLM läuft, startet beim ersten Mal, wenn eine Sitzung es nutzt; die Sitzung meldet „Starting … with vLLM (the first time takes a minute or two)…“.

Custom nimmt jeweils eine Nachricht entgegen. Eine Nachricht, die du sendest, während es arbeitet, wartet in der Warteschlange über dem Nachrichtenfeld und geht raus, wenn der Durchgang endet.

Du kannst das Modell während einer Sitzung über das Menü unter dem Nachrichtenfeld wechseln. Custom nutzt das neue Modell ab seinem nächsten Schritt, auch mitten in einem Durchgang.

## Was Custom kann

- **Dateien**: Sie lesen (Text mit Zeilennummern, bei langen Dateien jeweils einen Teil, den Inhalt eines Ordners), erstellen, neu schreiben und bearbeiten, Ordner auflisten und Dateien nach Namen oder nach Inhalt finden. Bevor es eine ganze Datei neu schreibt, die es in dieser Sitzung nicht gelesen hat, wird es aufgefordert, sie zuerst zu lesen.
- **Dokumente**: PDF-, Word-, Excel-, PowerPoint-, OpenDocument-, RTF- und EPUB-Dateien werden als Text gelesen.
- **Bilder**: Bilder, die du anhängst, Bilddateien, die es öffnet, und Bilder von Webseiten oder aus Werkzeugen. Ein Modell, das Bilder sieht, bekommt das Bild; bei einem, das das nicht kann, beschreibt das Hilfsmodell es (siehe [Bilder für Modelle, die nicht sehen](#images-for-models-that-dont-see)).
- **Befehle**: Shell-Befehle im Ordner der Sitzung ausführen, standardmäßig bis zu zwei Minuten und höchstens zehn. Server, Watcher und andere Befehle, die weiterlaufen, laufen im Hintergrund: Custom liest ihre Ausgabe, wenn es sie braucht, und kann sie stoppen. Sie enden auch, wenn Custom beendet wird, und sein nächster Durchgang erfährt, welche noch laufen.
- **Webseiten**: Eine Seite als sauberen Text mit Überschriften, Links, Listen und Tabellen abrufen; PDFs und Office-Dateien im Netz werden als Text gelesen. Es erreicht nur öffentliche Adressen; für diesen Computer oder sein Netzwerk nutzt es einen Befehl wie `curl`.
- **Ein Plan**: Bei Arbeit mit mehreren Schritten führt es eine Checkliste, die in der Sitzung angezeigt wird, und hakt Punkte ab.
- **Skills**: Es lädt die Skills, die zur Aufgabe passen: die des Projekts, deine (aus den Skill-Ordnern von Claude Code und Codex) und die der [Skill-Bibliothek](/guide/skills) der App. Es kennt sie nach Gruppe und Name und kann auch mit ein paar Worten nach einem suchen, passend zur Arbeit.
- **MCP-Server**: Werkzeugserver, die du für Claude Code einrichtest (für alle Ordner und für diesen Ordner), die `.mcp.json` des Projekts und die von Codex.
- **Die eigenen Werkzeuge der App**: Websuche, Browser, Memory, Seiten, deine [Verbindungen](/guide/connections) und der Rest, wie sie jeder Agent hier bekommt.

Jeder Schritt erscheint in der Sitzung mit einem verständlichen Namen („Read index.ts“, „Edit README.md“, „Fetch https://…“), seine Diff- oder Ausgabeansicht ist einen Klick entfernt.

## Festlegen, was Custom ohne Nachfrage tun darf

Die Einstellung **Berechtigungen** (unter **Optionen** auf der Startseite oder im Menü unter dem Nachrichtenfeld einer Sitzung) bestimmt, was Custom von sich aus tut. Mit Umschalt+Tab im Nachrichtenfeld wechselst du zum nächsten Modus.

- **Fragen** (Standard): fragt vor dem Bearbeiten von Dateien und vor dem Ausführen von Befehlen. Befehle, die sich nur umsehen (`ls`, `cat`, `git status` und Ähnliche), laufen ohne Nachfrage.
- **Änderungen akzeptieren**: bearbeitet Dateien im Ordner der Sitzung ohne Nachfrage; fragt vor dem Ausführen von Befehlen (außer solchen, die sich nur umsehen) und vor allem außerhalb des Ordners.
- **Automatisch**: Routineschritte laufen durch; eine Schnellprüfung fragt dich bei riskanten. Siehe [Auto-Modus](#auto-mode).
- **Voller Zugriff**: Werkzeuge und Befehle laufen ohne Genehmigungsabfragen oder die [Sandbox](#the-sandbox-for-commands) für Befehle, auch Administratorbefehle und Änderungen außerhalb des Ordners. Sie nutzen die Berechtigungen deines Computerkontos: Das gewährt keinen Administratorzugriff, den dein Konto nicht hat. Vertrauliche Sitzungen behalten ihre Netzwerkbeschränkungen.
- **Plan**: liest und plant nur. Custom kann keine Dateien bearbeiten oder Befehle ausführen und nutzt nur lesende Werkzeuge. Am Ende steht ein nummerierter Plan. Um ihn auszuführen, wechsle in einen anderen Modus und sag ihm, dass es loslegen soll.

Außerhalb von Voller Zugriff fragen manche Befehle immer: siehe [Befehle, die immer fragen](#commands-that-always-ask).

## Genehmigen oder Ablehnen, was Custom tun will

Wenn Custom dein OK braucht, erscheint in der Sitzung eine Karte (und im [Posteingang](/guide/inbox)). Ihr Titel sagt, was der Schritt tut und warum er fragt, zum Beispiel „Edit /home/you/notes/plan.md — it changes files outside the session folder“. Bei einem Befehl zeigt die Karte den ganzen Befehl.

- **Erlauben** lässt diesen einen Schritt laufen.
- **Immer erlauben …** lässt ihn und ähnliche Schritte von nun an in dieser Sitzung ohne Nachfrage laufen. Die Schaltfläche sagt, was sie abdeckt: „Always allow npm run build …“, „Allow all edits“, „Always allow reading in ~/data“, „Always allow changes in ~/site“.
- **Ablehnen** stoppt diesen Schritt. Custom wird gesagt, dass du abgelehnt hast und es das nicht noch einmal versuchen soll.

So funktioniert **Immer erlauben** bei Befehlen: Custom zerlegt einen Befehl in seine Teile (bei `&&`, `;`, `|` und so weiter) und prüft jeden einzeln. Eine Regel deckt den Befehl ab, für den sie erstellt wurde, anhand seiner ersten Wörter (`git status`, `npm run build`, `docker compose up`), sodass nichts hinter `&&` mitlaufen kann. Befehle, die sich nur umsehen, brauchen nie eine Regel.

**Immer erlauben** wird nicht angeboten, wenn es nicht sicher sein kann:

- bei Code, der direkt im Befehl steht (etwa `python -c "…"`);
- bei einer Datei, deren Name nicht im Voraus bekannt sein kann;
- bei einem Befehl, der sich nicht sicher lesen lässt;
- bei riskanten Befehlen, die jedes Mal fragen.

## Befehle, die immer fragen

Außerhalb von Voller Zugriff fragen diese Schritte jedes Mal, auch im Modus Automatisch, was auch immer du vorher erlaubt hast:

- Ausführen als Administrator (`sudo` und Ähnliches);
- Löschen von Dateien außerhalb des Sitzungsordners, Löschen des Sitzungsordners selbst oder Löschen von Dateien, die es nicht im Voraus benennen kann;
- einen Download direkt in eine Shell leiten oder einen Download sofort ausführen;
- Rohdaten auf einen Datenträger schreiben, einen Datenträger formatieren oder neu partitionieren;
- den Computer herunterfahren oder neu starten;
- geplante Jobs ändern (`crontab`);
- Berechtigungen oder Besitzer eines ganzen Ordnerbaums ändern;
- SSH-Keys oder Einstellungs- und Startdateien in deinem Home-Ordner ändern (etwa `.bashrc` oder `~/.config`), es sei denn, die Sitzung arbeitet in diesem Ordner.

## Dateien außerhalb des Ordners und Dateien mit Keys

In den Modi Fragen, Änderungen akzeptieren und Plan fragt Custom, bevor es Dateien außerhalb des Sitzungsordners liest oder ändert (der temporäre Ordner zählt nicht). **Immer erlauben** gilt dann für diesen Ordner, zum Lesen oder für Änderungen.

Dateien, die Keys oder Passwörter enthalten, fragen vor dem Lesen oder Ändern, auch innerhalb des Ordners: `.env`-Dateien (keine Beispiele), SSH- und andere private Keys, `.netrc`, `.npmrc`, Dateien mit Zugangsdaten, deine Cloud- und Passwortspeicher-Ordner, die Anmeldungen der Agenten selbst und die eigenen Daten der App. Änderungen an den eigenen Einstellungen und Hooks von Git fragen ebenfalls. **Immer erlauben** gilt dann nur für diese Datei.

Im Auto-Modus entscheiden stattdessen die Regeln von Automatisch und seine Schnellprüfung darüber. Bei Voller Zugriff fragen sie nicht.

## Auto-Modus

Der **Auto-Modus** lässt Routinearbeit ohne Unterbrechung durchlaufen und fragt bei dem Rest. Wähle **Automatisch** unter **Berechtigungen**.

Jeder Schritt, der fragen würde, durchläuft diese Prüfungen der Reihe nach:

1. **Feste Regeln**, die kein Modell brauchen:
   - Weiter geht es bei: Änderungen im Sitzungsordner; neuen Arbeitsdateien im temporären Ordner; Befehlen, die im Ordner nur lesen; den eigenen Tests, Builds, Lintern und Typprüfungen des Projekts.
   - Dich fragen bei: dem Überschreiben einer Datei außerhalb des Ordners; allem auf der [Immer-fragen-Liste](#commands-that-always-ask); Force-Push mit Git; dem Schreiben, Verschieben oder Löschen von Dateien außerhalb des Ordners; Befehlen, die einen Zahlungsdienst aufrufen; Werkzeugen eines verbundenen Kontos oder MCP-Servers, die etwas senden oder posten oder Geld ausgeben.
2. **Eine Schnellprüfung** für alles andere durch das [Hilfsmodell](/guide/agents-models#choose-the-helper-model). Sie antwortet auf eine von drei Arten:
   - **Erlauben**: Der Schritt dient eindeutig dem, was du verlangt hast, bleibt in deinem Ordner (oder liest nur) und lässt sich leicht rückgängig machen;
   - **Fragen**: Er könnte bleibenden Schaden anrichten oder reicht weiter (Daten löschen, Software für das ganze System installieren, Einstellungen ändern, Passwörter oder Keys verwenden, etwas senden oder veröffentlichen, Geld ausgeben oder etwas, das du nicht verlangt hast);
   - **Ablehnen**: Er ist eindeutig schädlich oder widerspricht deinem Willen. Der Schritt läuft nicht; Custom wird der Grund genannt und es muss einen anderen Weg finden.

Die Schnellprüfung sieht nur deine eigenen Nachrichten in der Sitzung (die erste und die letzten zehn), das Ziel, falls du eines gesetzt hast, den Ordner und den Schritt selbst (bei einer Bearbeitung den Anfang des neuen Textes). Sie sieht nie, was Custom gelesen hat, sodass eine Webseite oder eine Datei sie zu nichts überreden kann. Wenn die Prüfung fehlschlägt oder länger als 45 Sekunden dauert, entscheidest du. Innerhalb eines Durchgangs bekommt derselbe Schritt dieselbe Antwort. In einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) bleibt die Prüfung auf diesem Computer: Das Hilfsmodell übernimmt sie, wenn es hier läuft, sonst das eigene Modell der Sitzung.

In der Sitzung trägt ein Schritt, den Automatisch durchgelassen hat, ein kleines Label **Automatisch**; fahre mit der Maus darüber, um den Grund zu sehen. Ein Schritt, den Automatisch gestoppt hat, zeigt das Label in Rot; fahre darüber, um „Auto stopped this: …“ und den Grund zu sehen. Eine Karte, die Automatisch an dich schickt, beginnt mit „Auto:“ und dem Grund.

[Einstellungen → Funktionen → Custom](/settings?s=custom&find=Auto%20mode) hat eine Zeile **Auto-Modus**, deren (i) den Auto-Modus mit denselben Worten beschreibt; dort gibt es nichts umzuschalten.

## Die Sandbox für Befehle

Im Modus „Automatisch“ können die Befehle von Custom in einer Sandbox laufen: Sie dürfen Dateien nur im Ordner der Sitzung und in temporären Ordnern ändern, alles andere auf dem Computer ist schreibgeschützt. Das Netzwerk dürfen sie weiterhin nutzen. Arbeitet die Sitzung in einem Git-Worktree oder in einem Unterordner eines Repositorys, bleibt auch der eigene Ordner des Repositorys beschreibbar, damit Git committen kann. Die Caches von Paketmanagern wandern in einen temporären Ordner. Wie die Sandbox aufgebaut ist, hängt von deinem Computer ab:

- **Linux**: Sie nutzt bubblewrap. Befehle können Dateien im Ordner der Sitzung, im temporären Ordner (`/tmp`) und im eigenen Ordner des Repositorys ändern.
- **Mac**: Sie nutzt Seatbelt, die Sandbox, die zu macOS gehört. Die Regel ist dieselbe: der Ordner der Sitzung, die temporären Ordner und der eigene Ordner des Repositorys.
- **Windows**: Befehle laufen mit niedriger Integrität (Low Integrity), einem Schutz, den Windows mitbringt: Sie können alles lesen, aber Dateien nur in Ordnern ändern, die dafür markiert sind. Beim ersten Mal markiert Hydor den Ordner der Sitzung (und den eigenen Ordner des Repositorys), und die Markierung bleibt bestehen. Befehle bekommen einen eigenen temporären Ordner in `AppData\LocalLow\Hydor` für temporäre Dateien und Paket-Caches. Dein Benutzerordner, ein ganzes Laufwerk, Windows, Programme (Program Files) und die Ordner für App-Daten werden nie markiert: In so einem Ordner laufen Befehle ohne Sandbox. Die Bash von Git kann ihre internen Dateien bei niedriger Integrität nicht mit deinen normalen Bash-Fenstern teilen. Deshalb legt Hydor beim ersten Mal außerdem eine Kopie der Git-Programme für Befehle in der Sandbox an, in `AppData\Local\Hydor\sandbox` (sie besteht aus Verknüpfungen auf dieselben Dateien und braucht deshalb keinen Platz, wenn Git auf demselben Laufwerk liegt).

Wenn ein Befehl an die Grenzen der Sandbox stößt, erfährt Custom, dass er in einer Sandbox lief, und arbeitet entweder innerhalb der Grenzen oder sagt dir, was anderswo erledigt werden muss.

Zum Ein- oder Ausschalten öffnest du [Einstellungen → Funktionen → Custom](/settings?s=custom&find=Sandbox%20for%20commands) und benutzt den Schalter bei **Sandbox für Befehle**. Standardmäßig ist sie eingeschaltet. Schalte sie aus, wenn ein Werkzeug woanders schreiben muss, zum Beispiel um etwas für das ganze System zu installieren. Die Änderung gilt für laufende Sitzungen nach etwa 15 Sekunden.

Wenn die Sandbox nicht laufen kann, ist der Schalter ausgegraut und die Zeile nennt den Grund; Befehle laufen dann ohne Sandbox. Unter Linux heißt das, dass bubblewrap nicht installiert ist oder nicht laufen kann (wie in manchen Containern). Auf einem Mac bedeutet es, dass Seatbelt nicht starten konnte. Unter Windows baut Hydor beim ersten Mal ein kleines Hilfsprogramm mit dem .NET Framework, das zu Windows gehört, und braucht außerdem Git für Windows (das Befehle ohnehin brauchen): Die Zeile sagt es, wenn eines von beiden fehlt oder das Hilfsprogramm nicht starten kann. In den Modi „Fragen“ und „Änderungen annehmen“ nutzen Befehle die Sandbox nicht: Dort wartet jeder Befehl, der mehr tut als nur nachzuschauen, auf dein OK oder auf eine Regel, die du mit **Immer erlauben** gespeichert hast.

In einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) läuft jeder Befehl ohne Netzwerk, in jedem Modus und unabhängig von diesem Schalter, sodass er weder das Internet noch deine anderen Computer noch die Server dieses Computers erreichen kann. Die Dateien bleiben so, wie der Modus sie vorsieht. Das funktioniert unter Linux (bubblewrap) und auf einem Mac (Seatbelt). Windows kann das Netzwerk auf diese Weise nicht abschneiden. Deshalb fragt dort, und überall dort, wo die Sandbox nicht laufen kann, jeder Befehl in jedem Modus zuerst bei dir nach, ohne **Immer erlauben**. Custom wird informiert, und ein Befehl, der das Netzwerk versucht, erfährt, warum es fehlschlug.

## Custom ein Ziel geben

Custom hat dieselben Ziele wie jeder andere Agent: Die eigene Schleife der App treibt es Runde für Runde an, bis Prüfungen erfüllt sind, denen du zugestimmt hast. Öffne das Menü der Sitzung (⋯) → **Ziel setzen** oder schalte auf der Startseite **Optionen** → **Ziel** ein, und der Agent schlägt dir die Prüfungen zur Zustimmung vor. In jeder Runde führt die App die Prüfungen selbst aus, behält die Runde oder macht sie rückgängig (in einem Worktree), fragt dich an Wendepunkten, welchen Weg es gehen soll, und hält an, wenn alle Prüfungen erfüllt sind, du es stoppst oder ein Limit erreicht ist. Die ganze Geschichte mit den Bildschirmen steht unter [Der Sitzung ein Ziel geben](/guide/sessions#give-the-session-a-goal).

Was jetzt für jeden Agenten gleich ist: die Vereinbarungskarte, die Prüfungen, die Rundenliste, die Fragen, deine Regeln und **Deine Entscheidung** sowie der Bericht. `/goal` in einer Custom-Sitzung zu tippen bewirkt nichts Besonderes mehr: Es ist normaler Text. Zwei Dinge betreffen Custom:

- Eine **Prüfer**-Prüfung und die Abschlussprüfung beurteilt ein Modell, das an der Arbeit nicht beteiligt war. In einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) ist das ein Modell auf diesem Computer; ohne ein solches kann die Prüfung nicht laufen.
- Prüfbefehle laufen so wie die eigenen Befehle von Custom: im Modus „Automatisch“ bei eingeschalteter **Sandbox für Befehle** innerhalb der Sandbox, beschränkt auf den Ordner der Sitzung; in den anderen Modi so, wie die eigenen Befehle dort laufen; in einer vertraulichen Sitzung immer innerhalb der Sandbox ohne Netzwerk.
- Die Runden, die ein neues Ziel bekommt, stammen aus **Runden bis zur Zielpause** weiter unten. Der Wert gilt jetzt für die Ziele jedes Agenten, nicht nur für die von Custom.

Ziele, die Custom vor dieser Version laufen hatte, werden nicht übernommen: Setze ein neues.

Um zu ändern, wie viele Runden ein neues Ziel bekommt, öffne [Einstellungen → Funktionen → Custom](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses) und wähle **10**, **30** oder **100** in der Zeile **Runden bis zur Zielpause** in der Gruppe **Ziele**. Auf der Vereinbarungskarte kannst du eine andere Zahl festlegen, und auch der Agent kann eine vorschlagen.

## Lange Unterhaltungen und lange Ausgaben

Jedes Modell kann nur eine begrenzte Menge auf einmal lesen (seinen Kontext). Custom hält jede Unterhaltung von selbst darin, deshalb gibt es für Custom-Sitzungen keine Schaltfläche „Verdichten“:

1. Wenn die Unterhaltung nahe an die Grenze kommt (mit Platz für die Antwort), löscht Custom zuerst alte Werkzeugausgaben. Die Sitzung vermerkt: „Cleared old tool output to keep within the model's context.“
2. Reicht das nicht, fasst das Modell den früheren Teil in Notizen zusammen, mit denen die Arbeit weitergeht („Summarizing the earlier conversation to keep within the model's context…“). Beim nächsten Mal aktualisiert es diese Notizen, statt von vorn anzufangen. Dein Plan und die verwendeten Skills bleiben in jedem Fall erhalten.

Wenn der Server eines Modells meldet, dass die Unterhaltung zu lang ist, lernt Custom die tatsächliche Grenze dieses Modells und verdichtet sofort. Mit jeder Anfrage gehen nur die letzten paar Bilder mit.

Was Memory Custom am Anfang mitgegeben hat, bleibt während der Arbeit unverändert, damit der Server des Modells wiederverwenden kann, was er von der Unterhaltung behalten hat. Das ist schneller und kostet weniger. Jedes Mal, wenn Custom verdichtet, liest es Memory erneut, passend zu deiner neuesten Nachricht (siehe [Womit ein Agent startet](/guide/memory#what-an-agent-starts-with)).

Der Ring neben dem Nachrichtenfeld zeigt in Prozent, wie voll der Kontext des Modells ist; zeige darauf, um die Tokens und ihre Verwendung zu sehen. Unter **Optionen** (dem Chip unter dem Nachrichtenfeld) steht in der Zeile **Kontext** „42 % belegt“, mit einem kleinen Pfeil: Klicke darauf, um die Aufschlüsselung ein- oder auszublenden, die zunächst eingeklappt ist: **Anweisungen**, **Projektanweisungen**, **Memory**, **App-Funktionen**, **Skills**, **Werkzeuge** und **Unterhaltung**, jeweils mit ihren Tokens und einem dünnen Balken für ihren Anteil. Ein Teil ohne Inhalt wird weggelassen. Die Zahlen werden aus dem Text geschätzt und auf das skaliert, was der Server des Modells gezählt hat. Ein Klick auf den Ring bewirkt in einer Custom-Sitzung nichts, da Custom von selbst verdichtet; Sitzungen mit Claude Code und Codex behalten ihren Ring und **Verdichten** (siehe [Die Anzeigen lesen](/guide/sessions#read-the-meters-context-cache-and-speed)).

Auch lange Ausgaben füllen die Unterhaltung nicht. Wenn ein Befehl, eine Seite oder ein Werkzeug mehr zurückgibt als einen bestimmten Anteil des Kontexts des Modells, behält Custom alles in einer Datei im eigenen Ordner der Sitzung. Das Modell bekommt den Anfang und das Ende (bei einem Befehl vor allem das Ende, wo Fehler auftauchen) und den Speicherort der Datei, und liest den Rest in Stücken oder durchsucht ihn. Diese Dateien werden nach einer Woche gelöscht.

## Was das Modell liest

Vor deiner Nachricht bekommt das Modell in dieser Reihenfolge:

- die eigenen Regeln von Custom (wie es arbeitet, der Modus, der Ordner), die Anweisungen des Agenten und deine Agentenrichtlinien: **Anweisungen** in der Aufschlüsselung;
- die Anweisungen des Projekts, seine `AGENTS.md` oder `CLAUDE.md`: **Projektanweisungen**;
- was [Memory](/guide/memory#what-an-agent-starts-with) zu deiner Anfrage hat: **Memory**;
- was die Funktionen der App vorgeben: wie Antworten aussehen, Keys und Passwörter aus dem Chat heraushalten, aufräumen und wie die vollständig bereitgestellten Werkzeuge zu benutzen sind (Bilder, Apps, der Browser, Dokumente und so weiter): **App-Funktionen**;
- seine Skills (**Skills**), nach Gruppen benannt: die des Projekts, deine eigenen, dann die Gruppen der Bibliothek wie Coding oder Dokumente. Custom kann einen Skill über seinen Namen laden oder danach suchen, worum es bei der Arbeit geht. Custom nimmt bis zu 200 Skills, davon höchstens 40 vom Projekt und von dir. Die Skills, die zu deiner ersten Nachricht passen, kommen mit der Angabe, wofür sie jeweils da sind;
- seine Werkzeuge, die vollständig bereitgestellten und eine kurze Liste der übrigen: **Werkzeuge**.

Die Anweisungen einer Funktion zu ihren eigenen Werkzeugen kommen mit diesen Werkzeugen. Solange ein Werkzeug in der kurzen Werkzeugliste von Custom wartet, warten auch seine Anweisungen; sie werden hinzugefügt, wenn das Modell das Werkzeug nachschlägt oder benutzt. Die Regeln, die unabhängig von den verwendeten Werkzeugen gelten, bleiben immer. Claude Code und Codex bekommen wie bisher alle Anweisungen der App am Anfang.

Eine erste Nachricht an ein Modell mit kleinem Kontext ist also kürzer als früher, und was jeder Teil braucht, steht in der Aufschlüsselung unter **Optionen**: siehe [Lange Unterhaltungen und lange Ausgaben](#long-conversations-and-long-output).

**Memory wird an den Kontext des Modells angepasst.** Ein Modell mit kleinem Kontext könnte seine Arbeit nicht erledigen, wenn Memory einen festen Umfang beanspruchte. Deshalb schrumpft der Anteil von Memory mit dem Fenster (die Zeile **Memory** der Aufschlüsselung zeigt, was es braucht):

- **Unter 12.000 Tokens**: ein kleiner Block, höchstens 6 % des Kontexts, mit den ersten 120 Wörtern deines Profils (es steht dabei, dass das nur der Anfang ist), höchstens drei Notizen und ohne Index. Memory fügt nichts zu deinen Nachrichten hinzu und auch nichts, wenn das Modell eine Datei liest oder ändert, und liefert keine Zeilen zu Wiki-Artikeln oder Plänen. Dem Modell wird gesagt, dass es Notizen mit dem Memory-Werkzeug nachschlagen kann.
- **Bis etwa 33.000 Tokens** (nicht über OpenRouter): ein Block von höchstens 6 % des Kontexts, die ersten 400 Wörter deines Profils, höchstens fünf Notizen, ein kurzer Index, eine Zeile zu einem Wiki-Artikel und eine Zeile zu einem Plan sowie höchstens eine Notiz zu einer Nachricht (600 Zeichen) und eine, wenn eine Datei gelesen oder geändert wird (350).
- **Größere Modelle**: alles, was [Memory einem Agenten mitgibt](/guide/memory#what-an-agent-starts-with), was einen kleinen Anteil ihres Kontexts ausmacht.

Als Richtwert: Der Block von Memory umfasst etwa 1.700 Zeichen bei einem Modell mit 8.000 Tokens, 3.800 bei 32.000 und 7.300 bei 200.000. Eine Sitzung, die nur den Anfang deines Profils bekommen hat, kann es nicht umschreiben: Das Modell sagt dir, was du ergänzen sollst, oder du bearbeitest es in [Einstellungen → Memory](/settings?s=memory&find=Your%20profile). Auch die Anweisungen des Wikis sind gekürzt: Custom bekommt immer einen kurzen Absatz über Wiki-Memory, und wie man Quellen aufbewahrt, das Wiki prüft und Pläne übernimmt, kommt nur dazu, solange die Werkzeuge dafür angeboten werden. Nachdem Custom seine Unterhaltung verdichtet hat, wird der Checkpoint der Sitzung (siehe [Checkpoints](/guide/wiki-memory#checkpoints)) auf 8 % des Kontexts gekürzt, höchstens 16.000 Zeichen, mit dem Hinweis, wo man den Rest liest.

## Wie Custom mit schwächeren Modellen zurechtkommt

Nicht jedes Modell ist im Umgang mit Werkzeugen so geübt wie Claude oder GPT. Custom fängt die häufigen Patzer ab und bringt das Modell zurück auf Kurs:

- **Wiederholungen**: Derselbe Schritt, bei dem sich seitdem nichts geändert hat, wird nicht ein drittes Mal ausgeführt (dem Modell wird gesagt, es solle das frühere Ergebnis verwenden); beim fünften Mal endet der Durchgang.
- **Fehlgeschlagene Schritte**: Nach vier fehlgeschlagenen Schritten in Folge wird dem Modell gesagt, es solle innehalten und neu nachdenken; nach acht endet der Durchgang.
- **Kreisläufe**: Schritte, die sich im Kreis drehen, bekommen einen Hinweis, etwas anderes zu versuchen.
- **Unfertige Arbeit**: Ein Modell, das „Lass mich …“ sagt, ohne es zu tun, oder aufhört, obwohl Punkte seines Plans noch offen sind, wird je einmal wieder an die Arbeit geschickt. Hat es Code geändert, ohne die Prüfungen des Projekts auszuführen, wird es gebeten, sie auszuführen, bevor es fertig ist.
- **Länge**: Ein Durchgang umfasst höchstens 200 Schritte; bei 150 wird dem Modell gesagt, es solle den wichtigsten Teil abschließen. Eine Antwort, die durch das Längenlimit des Modells abgeschnitten wurde, wird in kürzeren Schritten fortgesetzt.
- **Fehlerhafte Werkzeugaufrufe**: Als Text geschriebene Aufrufe werden gelesen und ausgeführt, Aufrufe mit fast richtigen Argumenten werden repariert, und ein falsch geschriebener Werkzeugname wird dem richtigen zugeordnet oder mit der Liste der Werkzeuge beantwortet. Eine Antwort, die ihre Aufrufe als Text schreibt, endet dort, wo ihre Aufrufe enden: Was ein Modell danach schreibt (erfundene Ergebnisse, weitere Aufrufe obendrauf, derselbe Aufruf noch einmal), wird weder ausgeführt noch behalten, und aus einer Antwort laufen höchstens sechs Aufrufe.
- **Modelle ohne Werkzeugaufrufe**: Wenn der Server eines Modells keine Werkzeuge annimmt, beschreibt Custom sie in den Anweisungen und liest die Aufrufe des Modells aus dem, was es schreibt.
- **Claude über Claude Code**: Anthropic erlaubt nur den eigenen Programmen, die Anmeldung eines Tarifs zu nutzen. Deshalb antwortet ein Claude-Modell deines Tarifs über Claude Code selbst, Schritt für Schritt. Die Werkzeuge von Custom werden in seinen Anweisungen beschrieben, und Claude schreibt seine Werkzeugaufrufe als Text, wie bei einem Modell ohne Werkzeugaufrufe; jeder Schritt nutzt den Cache des vorigen. Claude Code kann eine Antwort nicht an seinen Werkzeugaufrufen beenden, also beendet Custom sie dort selbst und stoppt das Programm, bevor Claude erfundene Ergebnisse schreiben kann. Die Modelle von Codex sind anders: Sie werden direkt über deinen ChatGPT-Tarif angefragt, mit den Werkzeugen von Custom als echten Werkzeugen.
- **Aussetzer**: Wenn die Verbindung mitten in der Antwort abbricht oder der Server ausgelastet ist, wartet Custom und versucht es einige Male erneut. Wenn die App neu startet (ein Update), während ein Schritt auf ein Modell deines Tarifs wartet, wird der Schritt erneut angefragt, sobald die App wieder da ist; ein Durchgang, der wegen des Neustarts endete, sagt das, und eine Nachricht führt ihn weiter.
- **Viele Werkzeuge**: Wenn es viele sind (von MCP-Servern und Verbindungen), sieht das Modell eine kurze Liste und schlägt die vollständige Beschreibung der Werkzeuge nach, die es braucht; die Anweisungen einer Funktion zu einem Werkzeug kommen mit ihm, wenn das Modell es nachschlägt oder benutzt (siehe [Was das Modell liest](#what-the-model-reads)). Ein Modell mit kurzem Kontext (etwa 32.000 Tokens oder weniger, nicht über OpenRouter) bekommt einen schlankeren Satz: keine Hinweise zu Antwort-UIs, eine Liste der Werkzeuge nur mit Namen und weniger vollständig bereitgestellte Werkzeuge (auch das Werkzeug, das eine HTML-Seite anzeigt, wartet in der Liste). Es wird außerdem gebeten, kleine Schritte zu machen.
- **Jede Modellfamilie** bekommt die empfohlenen Einstellungen ihres Herstellers, das Bearbeitungsformat, mit dem sie trainiert wurde, und einen Denkaufwand, wo es einen gibt. Schritte, die nur lesen, laufen gleichzeitig, um Wartezeit zu sparen.

Wenn Custom einen Durchgang aus einem dieser Gründe stoppt, endet die Antwort mit „(Stopped: …)“.

## Bilder für Modelle, die nichts sehen

Ein Modell, das Bilder sehen kann, bekommt deine Bilder direkt. Die Bilder werden vorher verkleinert, wenn auf diesem Computer ffmpeg oder ImageMagick vorhanden ist.

Bei einem Modell, das keine Bilder sehen kann, beschreibt das Hilfsmodell jedes Bild in Worten: was es zeigt, wo sich die Dinge befinden und welcher Text darin steht, wortgetreu abgeschrieben. Dafür brauchst du ein Hilfsmodell, das Bilder sehen kann: Öffne [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model) und wähle im Menü **Modell** der Gruppe **Hilfsmodell** eines mit dem Hinweis „sieht Bilder“. „Automatisch“ funktioniert dafür nicht. Ohne ein solches Modell teilt Custom dem Modell mit, dass es ein Bild gibt, das es nicht sehen kann. In einer vertraulichen Sitzung beschreibt nur ein Hilfsmodell auf diesem Computer Bilder (ein Modell deiner Abos tut das nie).

## Verzweigen und Von hier aus bearbeiten

Custom-Sitzungen können wie Sitzungen von Claude Code und Codex verzweigt werden: Menü der Sitzung (⋯) → **Verzweigen**. Du kannst auch eine frühere Nachricht von dir mit **Von hier aus bearbeiten** ändern: Die Unterhaltung wird in einer Kopie von unmittelbar vor dieser Nachricht fortgesetzt, und die bisherige wird archiviert. Setze einen Haken bei **Dateien auf den Stand vor dieser Nachricht zurücksetzen**, um die seither erfolgten Dateiänderungen rückgängig zu machen. Bei Custom betrifft das die Dateien, die durch die eigenen Bearbeitungen geändert wurden; was Befehle geändert haben, bleibt unverändert.

Custom speichert jede Unterhaltung auf der Festplatte, sodass sie auch nach einem Neustart der App weitergeht.

## Was Custom kostet

- Modelle über OpenRouter: OpenRouter meldet, was jeder Aufruf gekostet hat, und die Ausgaben der Sitzung beruhen darauf. Claude-Modelle werden dort gebeten, die Unterhaltung in ihrem Cache zu halten, wie es die anderen von selbst tun, sodass jeder Schritt sie für etwa ein Zehntel des Preises wieder einliest. Die Werkzeuge, die Custom angeboten werden, ändern sich höchstens einmal pro Sitzung (die Werkzeuge für Befehle, die im Hintergrund laufen, bleiben, sobald einer gelaufen ist), damit dieser Cache erhalten bleibt.
- Modelle deines Claude- oder ChatGPT-Abos (unter **Deine Abos**): Es zählt die Nutzung deines Abos, nicht Geld pro Token, daher zeigt eine Sitzung für diese Schritte 0 $ an. Ein Konto, das sein Nutzungslimit erreicht hat oder abgemeldet ist, übergibt den Schritt an dein nächstes Konto dieses Programms (wenn **Bei erreichtem Limit das Konto wechseln** aktiviert ist).
- Modelle auf diesem Computer (Ollama, vLLM): nichts.
- Andere Endpunkte: Die Tokens werden wie bei den anderen Agenten berechnet (siehe [Nutzung, Limits und Kosten](/guide/usage)).

Die Sitzung zeigt über dem Nachrichtenfeld die API-Kosten sowie Eingabe-, Cache- und Ausgabe-Tokens an, auch ohne Ausgabenlimit. Die Kosten stammen aus der Antwort von OpenRouter oder aus dessen Generierungsprotokoll, falls die gestreamten Kosten fehlen; als Ersatz dienen die Katalogpreise von OpenRouter. Du musst keine Preise manuell eintragen.

Ein [Ausgabenlimit](/guide/usage#cap-what-a-session-spends) funktioniert auch für Custom-Sitzungen.

## Einstellungen → Funktionen → Custom

[Einstellungen → Funktionen → Custom](/settings?s=custom) („Auto-Modus, eine Sandbox für Befehle und wie lange Ziele laufen“) hat drei Zeilen:

- **Auto-Modus** (einer der Modi von Custom, neben Fragen, Änderungen akzeptieren, Voller Zugriff und Plan): Sein (i) erklärt, was Auto durchlässt, was immer nachfragt und dass das Hilfsmodell die Prüfung übernimmt. Du musst nichts umschalten: Auto wählst du pro Sitzung unter **Berechtigungen**.
- **Sandbox für Befehle** (im Auto-Modus ändern Befehle Dateien nur im Ordner der Sitzung und in /tmp unter Linux, in den temporären Ordnern auf einem Mac oder in einem eigenen temporären Ordner unter Windows; Voller Zugriff läuft ohne diese Sandbox und ohne Genehmigungsabfragen): ein Schalter, standardmäßig aktiviert. Ausgegraut, wenn die Sandbox hier nicht laufen kann (bubblewrap unter Linux, Seatbelt auf einem Mac, Git for Windows und das .NET Framework unter Windows); die Zeile nennt den Grund.
- **Runden bis zur Zielpause** in der Gruppe **Ziele** (die Runden, die ein neues Ziel eines beliebigen Agenten bekommt; auf der Vereinbarungskarte des Ziels kannst du eine andere Zahl festlegen): **10**, **30** (Standard) oder **100** Runden. Ein Ziel, dem die Runden ausgehen, hält an seiner Grenze an, und du kannst ihm mehr geben.

Die Modelle von Custom findest du unter [Einstellungen → Agenten → Modelle](/settings?s=models), und das Modell, das die Prüfungen durchführt, ist dort das **Hilfsmodell**.

## Einen Agenten fragen

- „Schalte die Sandbox für die Befehle im Auto-Modus von Custom aus.“
- „Gib neuen Zielen bis zu 100 Runden.“
- „Setze ein Ziel für meine Custom-Sitzung ‚Upload-Seite‘: npm test läuft durch und Uploads von 2 GB funktionieren, und frag mich nur, wenn du nicht weiterkommst.“
- „Welches Hilfsmodell verwendet der Auto-Modus, und kann es Bilder sehen?“
- „Kann dieser Computer die Befehle meiner vertraulichen Sitzungen ohne Netzwerk ausführen?“
- „Füge Qwen3 Coder von OpenRouter hinzu, damit ich es mit Custom nutzen kann.“ (sobald dein OpenRouter-Key eingerichtet ist)
- „Zeige meine OpenRouter-Nutzung und -Kosten an, ohne Modellpreise einzugeben.“
- „Warum ist meine erste Nachricht an Custom bei einem lokalen Modell so lang?“
- „Wie voll ist der Kontext meiner Custom-Sitzung, und was nimmt am meisten Platz ein?“
- „Lass meine Custom-Sitzung auf dem Sonnet meines Claude-Abos statt auf OpenRouter laufen.“
- „Welches Modell ist für Custom Am besten, und können meine Custom-Sitzungen mit Automatisch starten?“
