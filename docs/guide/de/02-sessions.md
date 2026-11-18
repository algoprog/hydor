# Sitzungen

Eine Sitzung ist eine Unterhaltung mit einem Agenten in einem Ordner: Du beschreibst deinen Auftrag, der Agent arbeitet daran, und du verfolgst seine Schritte, gibst Aktionen frei und steuerst die Arbeit. Dieser Beitrag behandelt die Startseite und ihre Optionen, die Anzeige während der Arbeit, Nachrichten an einen laufenden Agenten und das gesamte Sitzungsmenü, von Abzweigungen und Zielen bis zu Worktrees und Freigaben.

![Eine laufende Sitzung: Schritte und Antworten des Agenten sowie eine Freigabeanfrage für einen Befehl](images/sessions.webp)

## Eine Sitzung starten

**Neu** in der Werkzeugleiste oder **Neue Sitzung** oben in der Seitenleiste öffnet die Startseite. Schreibe deinen Auftrag in das Nachrichtenfeld, prüfe die Auswahl darunter und drücke Enter oder **Starten**; auf dem Smartphone verwendest du den runden Pfeil. Die Sitzungsseite öffnet sich sofort mit deiner Nachricht und dem arbeitenden Agenten (**In Arbeit**). Kann die Sitzung nicht starten, steht dort der Grund. **Zurück zur Startseite** übernimmt deine Nachricht und Anhänge wieder in das Eingabefeld.

Bricht die Verbindung ab, bevor die App antwortet, etwa weil dein Smartphone in den Ruhezustand wechselt oder das Netzwerk wechselt, erscheint **Verbindung wird wiederhergestellt…**. Sobald die Verbindung steht, fragt die Seite den Stand deiner Nachricht ab. Wurde die Sitzung gestartet, öffnet sie sich; eine Sitzung wird nie doppelt gestartet. Ist die App etwa eine Minute lang nicht erreichbar, erscheint **Die App konnte nicht erreicht werden**. **Erneut versuchen** fragt noch einmal nach.

Kurz nach dem Start erhält die Sitzung einen Titel aus wenigen Worten zu deinem Auftrag, etwa „Wochenendreise nach Lissabon“ oder „Checkout-Tests reparieren“. Das Hilfsmodell unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model) erstellt ihn im Hintergrund, ohne eine Nachricht in der Unterhaltung. Seitenleiste, Sitzungskopf und Suche zeigen den Titel; in der Seitenleiste ersetzen seine Wörter nach und nach den Anfang deiner Nachricht. Auch Claude Code und Codex erhalten ihn für ihre eigenen Listen. Bis er vorliegt oder wenn das Hilfsmodell nicht antworten kann, dient der Nachrichtenanfang als Titel. Einen mit **Umbenennen** selbst vergebenen Titel ersetzt die App nie. Die Sitzung erscheint ab dem Absenden ganz oben unter **Aktiv**, zunächst mit **Wird gestartet**.

Unter dem Nachrichtenfeld findest du **Ausführungsumgebung**, **Modell**, **Ordner** oder **Projekt**, **Agent** und am Ende **Optionen**. Auf dem Smartphone öffnet jede Auswahl ein Bedienfeld vom unteren Bildschirmrand.

### Agentenprogramm und Modell auswählen

**Ausführungsumgebung** zeigt die verfügbaren Programme nebeneinander:

- **Claude Code**: der Agent von Anthropic, nutzbar mit einem Claude-Abo oder API-Key.
- **Codex**: der Agent von OpenAI, nutzbar mit einem ChatGPT-Abo oder API-Key.
- **Custom**: der eigene Agent der App für beliebige Modelle von OpenRouter, Ollama oder vLLM. Siehe [Custom, der eigene Agent der App](/guide/custom).
- Weitere hinzugefügte ACP-Agenten wie Gemini CLI, OpenCode, Qwen Code oder Goose, jeweils mit ihrem Startbefehl unter dem Namen.

Unten öffnet **Modelle für Custom** die [Einstellungen → Modelle](/settings?s=models). **Agenten hinzufügen oder verwalten** öffnet [Einstellungen → Weitere Agenten](/settings?s=agents). Siehe [Agenten, Konten und Modelle](/guide/agents-models).

**Modell** steht zunächst auf **Automatisch**: Die Sitzung startet mit dem Modell der Stufe Best. Der Hauptagent übergibt klar abgegrenzte Teilaufgaben an Subagenten auf günstigeren Stufen und kann bei besonders schwierigen Problemen selbst auf Max wechseln. Siehe [Modellstufen für unterschiedliche Aufgaben](/guide/agents-models#tiers-a-model-for-each-kind-of-job). Darunter stehen nur Modelle des gewählten Agentenprogramms. Dessen Standardmodell ist mit „Standard“ markiert. Ältere Modellversionen findest du hinter Einträgen wie „2 ältere Modelle“. Lange Listen haben ein Feld **Modelle suchen**; Enter wählt den ersten Treffer. Custom zeigt die unter Einstellungen → Modelle hinzugefügten Modelle. Andere ACP-Agenten zeigen die Modelle ihres letzten Starts; ihre Modellauswahl erscheint, sobald sie einmal ausgeführt wurden.

### Ordner, Projekt oder neuen Aufgabenordner auswählen

Die Schaltfläche **Ordner** legt fest, wo der Agent arbeitet. Ihr Menü „Projekt oder Arbeitsordner“ enthält das Feld **Projekt oder Ordner suchen oder Pfad eingeben** und darunter kurze Listen mit Ortsangaben zu jedem Eintrag:

- **Projekte**: deine fünf zuletzt verwendeten Projekte sowie das aktuell ausgewählte, jeweils mit Namen und Ordner. Wählst du ein Projekt, werden dessen Ordner, Agent und Richtlinien für die Sitzung übernommen. Die Schaltfläche heißt dann **Projekt** und zeigt den Projektnamen. Eine Projektgruppe funktioniert genauso und umfasst alle zugehörigen Projekte. **Neu** neben der Überschrift erstellt und wählt ein Projekt, das Sitzungen, Dateien und Memory bündelt. Siehe [Projekte und Wissen](/guide/projects) und [Agentenrichtlinien](/guide/guidelines).
- **Ordner**: der aktuelle und die drei zuletzt ausgewählten Ordner, jeweils mit ihrem übergeordneten Ordner. **Durchsuchen** neben der Überschrift zeigt die Ordner in deinem Benutzerordner.
- **Neuer Aufgabenordner** („ein neuer Ordner in ~/Hydor“): ein eigener Ordner für diesen Auftrag, benannt nach Datum und einigen Worten deiner Nachricht, etwa `2026-11-01-plan-trip-lisbon`. Er liegt in `~/Hydor`, sofern du unter [Aufgabenordner](/settings?s=assistants&find=Task%20folders) in Einstellungen → Funktionen → Deine Agenten keinen anderen Ort festgelegt hast.

Der Stammordner eines Projekts wird im Menü nur als Projekt angezeigt. Auch eine Sitzung, die du über die Ordnerauswahl in diesem Ordner startest, gehört zu diesem Projekt.

Das Menü öffnet sich oberhalb oder unterhalb der Schaltfläche, je nachdem, wo mehr Platz ist. Es passt sich ohne Scrollen an: Kleine Fenster zeigen zunächst weniger Ordner, dann weniger Projekte. Ein Eintrag wie „2 weitere“ unter den Projekten blendet den Rest ein.

Über das Eingabefeld findest du weitere Einträge:

- Ein Name sucht passende Projekte und Ordner unter den zuletzt verwendeten Ordnern, im aktuellen Ordner und in deinem Benutzerordner. Ein gefundener Projektordner erscheint als Projekt.
- Ein Pfad wie `~/code/` oder `code/` relativ zu deinem Benutzerordner zeigt die dortigen Ordner wie **Durchsuchen**. Der Pfeil am Feldende geht eine Ebene nach oben; das Kreuz oder Escape kehrt zu den Listen zurück.
- Mit ↑, ↓ und Enter wählst du einen Eintrag. Tab oder der Pfeil am Zeilenende zeigt seine Unterordner.

Liegt der Ordner in einem Git-Repository und hast du keinen neuen Aufgabenordner ausgewählt, erscheint unten der Schalter **Neuer Worktree von main** oder vom aktuell ausgecheckten Branch. Die Beschreibung lautet „Ein neuer Branch in einer Kopie von“ diesem Repository. Aktivierst du ihn, arbeitet die Sitzung in einer eigenen Kopie auf einem neuen Branch; die Ordneranzeige ergänzt „· neuer Worktree“. Siehe [In einem Worktree arbeiten](#work-in-a-worktree).

Ob standardmäßig ein neuer Aufgabenordner angelegt wird, hängt vom Agenten ab. Die meisten starten darin, wenn du keinen Ordner auswählst. Programmierer arbeitet im ausgewählten Ordner; ein projektspezifischer Agent arbeitet in seinem Projekt.

### Einen Agenten auswählen

**Agent** legt die Rolle der Sitzung fest: **Allgemein**, bis du einen anderen auswählst, oder der eigene Agent des Projekts, falls vorhanden. Zur Auswahl stehen außerdem **Forscher**, **Schriftsteller**, **Programmierer**, **Nachhilfelehrer**, **Planer**, **Analyst**, **App builder** und unter **Eigene** deine eigenen Agenten: sowohl projektübergreifende als auch die des gewählten Projekts. Fahre über einen Eintrag, um seine Aufgaben sowie Programm und Modell zu sehen. Die Auswahl kann auch die empfohlenen Programme, Modelle und Berechtigungen übernehmen, bei zugeordneter Modellstufe deren Modell, und verbundene Konten aktivieren. **Agenten erstellen oder ändern** öffnet die [Agentenseite](/agents). Siehe [Agenten](/guide/agents).

### Optionen: Denkaufwand, Berechtigungen und mehr

Unter **Optionen** stehen die übrigen Einstellungen. Die Schaltfläche zeigt „Optionen“ oder Abweichungen vom Standard, etwa „Hoher Denkaufwand · Plan · Limit 5,00 $“. Am Computer erinnert das Menü unten daran, dass Umschalt+Tab im Nachrichtenfeld den Berechtigungsmodus wechselt.

- **Aufwand**: wie intensiv das Modell nachdenkt. **Standard** verwendet die Modelleinstellung. Je nach Modell gibt es **Niedrig** für schnelle, einfache Überlegungen, **Mittel** für eine ausgewogene Verarbeitung, **Hoch**, **Xhigh** für besonders gründliches Nachdenken und **Max** für den höchsten Denkaufwand. Manche Modelle bieten außerdem **Minimal**, **Keine** oder **Ultra**. Bei Custom, anderen ACP-Agenten und Modellen ohne solche Stufen wird die Auswahl nicht angeboten.
- **Berechtigungen**: was der Agent ohne Rückfrage tun darf. Jedes Agentenprogramm hat eigene Modi; siehe [Bedeutung der Berechtigungsmodi](#what-each-permissions-mode-means). Umschalt+Tab im Nachrichtenfeld wechselt zum nächsten Modus.
- **Konto**: erscheint, sobald du unter [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts) ein weiteres Konto für Claude Code oder Codex hinzugefügt hast. **Deine Anmeldung** ist das eigene Konto des Agentenprogramms. Wähle ein anderes Konto, um die Sitzung damit auszuführen. **Konten verwalten** öffnet die Einstellungen.
- **Vertraulich**: ein Schalter mit Schloss und dem Hinweis „Nur Modelle auf diesem Computer oder im privaten Netzwerk“ Er eignet sich etwa für die Begutachtung einer Arbeit, Patientendaten oder Kundencode. **Ausführungsumgebung** wechselt zu **Custom**, **Modell** zum besten dafür verfügbaren Modell auf diesem Computer oder im privaten Netzwerk. Siehe [Eine Sitzung vertraulich halten](#keep-a-session-confidential).
- **Memory**: erscheint, wenn Memory in den Einstellungen aktiviert ist. **Ein** verwendet und ergänzt gespeichertes Wissen; **Für diese Sitzung deaktiviert** startet ohne diese Informationen und speichert nichts aus der Sitzung. Siehe [Memory](/guide/memory).
- **Ausgabenlimit**: die maximalen Kosten der Sitzung zu API-Preisen. Gib einen Betrag ein und klicke auf **Festlegen**, oder wähle 1, 5, 10 oder 25 $. **Kein Limit** entfernt die Grenze. Am Limit hält die Sitzung an, bis du es erhöhst. Siehe [Nutzung, Limits und Kosten](/guide/usage).
- **Schwarm**: **Aus** oder **Schwarm**. Ein leitender Agent zerlegt den Auftrag in unterschiedliche Ansätze und startet dafür jeweils einen Agenten. **Schwarm-Größe** unter [Einstellungen → Funktionen → Subagenten](/settings?s=children&find=Swarm%20size) begrenzt die gleichzeitig arbeitenden Mitglieder. Sie teilen Ergebnisse auf einem Board und schreiben einander Nachrichten. Das ist für schwierige Probleme gedacht und kostet ein Mehrfaches einer einzelnen Sitzung. Alternativ gibt es **Kampagne** („Eine große Änderung in Teilaufgaben, jeweils in einem Worktree“): Die Leitung zerlegt die Änderung, Mitglieder setzen ihre Teile auf eigenen Branches mit Tests um, anschließend führt die Leitung sie zusammen. Der Ordner muss in einem Git-Repository liegen; siehe [Kampagnen](/guide/engineering#campaigns-a-big-change-in-many-parts).
- **Forschung**: **Aus** oder **Tiefgehende Recherche**: Der Agent plant die Suchen, schickt Forscher los, die sich je einen Teil vornehmen, prüft wichtige Aussagen anhand von zwei Quellen und liefert einen Bericht mit Quellenangaben. Du stellst **Gleichzeitig aktive Forscher** (1 bis 8), **Runden** (1 bis 5), **Suchanfragen insgesamt** (10 bis 500) und **Der Bericht** (**Seite** oder **Word**) ein.
- **Arena**: **Aus** oder **Modelle vergleichen**. Dieselbe Nachricht geht zusätzlich an ein oder zwei weitere ausgewählte Modelle, jeweils in einer eigenen Sitzung im selben Ordner. **Modell suchen** hilft bei langen Listen. Du vergleichst die Antworten und behältst die beste; die übrigen Sitzungen werden archiviert. Aktiviere in einem Git-Repository **Neuer Worktree** im Ordnermenü, damit jedes Modell mit einer eigenen Kopie arbeitet.

Schwarm, Kampagnen und Tiefgehende Recherche leiten Hydor-Subagenten. Deshalb lassen sich Schwarm oder Kampagne und Tiefgehende Recherche nicht gleichzeitig aktivieren. **Vertraulich** deaktiviert Schwarm, Tiefgehende Recherche und Arena; umgekehrt deaktiviert jede dieser Optionen den vertraulichen Modus. Wegen der höheren Kosten werden Schwarm, Tiefgehende Recherche und Arena nicht für die nächste Sitzung übernommen. Recherche-Einstellungen und ausgewählte Arena-Modelle bleiben jedoch in diesem Browser für die nächste Aktivierung gespeichert. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).

### Bedeutung der Berechtigungsmodi

**Claude Code**

| Modus | Was der Agent darf |
| --- | --- |
| Nachfragen (Standard) | Fragt vor Änderungen und Befehlen, die seine Einstellungen nicht erlauben |
| Änderungen erlauben | Darf Dateien bearbeiten, fragt vor anderen Befehlen |
| Auto | Eine Sicherheitsprüfung erlaubt Routineaktionen und fragt dich bei riskanten Aktionen |
| Plan | Liest und plant nur und legt dir anschließend einen Plan zur Freigabe vor |
| Bypass | Fragt nie nach; vollständiger Zugriff |

**Codex**

| Modus | Was der Agent darf |
| --- | --- |
| Plan | Bespricht und plant zunächst und kann dir Rückfragen stellen |
| Nur lesen | Liest Dateien und antwortet, fragt vor Änderungen |
| Auto (Standard) | Bearbeitet Dateien und führt Befehle im Arbeitsordner aus; fragt für weitergehende Aktionen |
| Automatische Prüfung | Wie Auto, aber ein Prüfagent beantwortet seine Freigabeanfragen |
| Vollzugriff | Keine Sandbox und keine Freigabeanfragen |

In Docker kann die eigene Sandbox von Codex nicht starten. Deshalb ist dort **Voller Zugriff** der Standard; das Menü erklärt den Grund.

**Custom**

| Modus | Was der Agent darf |
| --- | --- |
| Nachfragen (Standard) | Fragt vor Dateiänderungen und Befehlen; reine Erkundung ist ohne Rückfrage möglich |
| Änderungen erlauben | Bearbeitet Dateien im Arbeitsordner ohne Rückfrage, fragt vor Befehlen |
| Auto | Führt Routineschritte aus; eine kurze Prüfung fragt dich bei riskanten Aktionen |
| Vollzugriff | Führt Tools und Befehle ohne Freigabeanfragen oder Befehls-Sandbox mit den Rechten deines Benutzerkontos aus |
| Plan | Liest und plant nur; keine Änderungen und keine Befehle |

Außerhalb von Vollzugriff fragt Custom vor riskanten Befehlen nach. In den Modi Nachfragen, Änderungen erlauben und Plan fragt es auch vor dem Lesen oder Ändern von Dateien außerhalb des Arbeitsordners sowie von Dateien mit Keys oder Passwörtern. Im Modus Auto bewertet zunächst die kurze Prüfung solche Zugriffe. Siehe [Custom, der eigene Agent der App](/guide/custom).

**Andere ACP-Agenten** bieten eigene Modi, die nach ihrem ersten Start angezeigt werden.

### Eine Sitzung vertraulich halten

Manche Inhalte dürfen nicht an öffentliche KI-Dienste übermittelt werden: eine zur Begutachtung zugesandte Paper, deren Weitergabe an Online-KI die meisten Konferenzen und Fachzeitschriften untersagen, Patienten- oder Kundenunterlagen oder vertraglich geschützter Unternehmenscode. Eine vertrauliche Sitzung verwendet nur Modelle auf diesem Computer oder im privaten Netzwerk und schränkt Funktionen für externe Dienste ein. Bei einem Modell im privaten Netzwerk werden die Inhalte an dessen Server übertragen; der Modus garantiert deshalb keine Verarbeitung ausschließlich auf diesem Computer.

1. Öffne auf der Startseite **Optionen** und aktiviere **Vertraulich** („Nur Modelle auf diesem Computer oder im privaten Netzwerk“). Die Schaltfläche zeigt anschließend „Vertraulich“.
2. **Ausführungsumgebung** wechselt zu **Custom**, **Modell** zum besten dafür verfügbaren Modell auf diesem Computer oder im privaten Netzwerk. Solange der Modus aktiv ist, stehen nur entsprechende Programme und Modelle zur Auswahl. Ist kein geeignetes Modell verfügbar, weist die App darauf hin. Unter [Einstellungen → Agenten → Modelle](/settings?s=models) installierst du für diesen Computer vorgeschlagene Modelle mit einem Klick.
3. Schreibe deinen Auftrag, hänge die Arbeit an oder wähle ihren Ordner und drücke Enter. Zum Beispiel: „Begutachte die angehängte Einreichung für NeurIPS: Zusammenfassung, Stärken, Schwächen, Fragen an die Autoren und eine Bewertung.“

Als lokale Modelle gelten hier laufende Ollama- und vLLM-Modelle sowie Endpunkte auf diesem Computer oder in deinem privaten Netzwerk: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` bis `172.31.…` oder Namen mit der Endung `.local`. Siehe [Ollama, vLLM oder einen anderen Endpunkt verbinden](/guide/agents-models#connect-ollama-vllm-or-another-endpoint). Ollama-Cloudmodelle mit „cloud“ am Namensende laufen auf ollama.com und zählen nicht dazu. Die Startseite behält den vertraulichen Modus für weitere Sitzungen bei, bis du ihn ausschaltest.

Eine vertrauliche Sitzung zeigt neben ihrem Titel im Sitzungskopf und in der Seitenleiste ein Schloss. Das Nachrichtenfeld hat einen dezenten grünen Rand; darüber erklärt ein ausblendbarer Hinweis den Modus. Ein Klick auf das Schloss zeigt, welche Funktionen aktiviert oder deaktiviert sind.

- **Deaktiviert**: Websuche und Webseiten, Browser und Bildschirmzugriff, verbundene Apps und deine Keys, Apps, Veröffentlichung, geplante Aufgaben, das Erstellen, Suchen oder Bearbeiten von Bildern, Zeichnungen, Diagrammen, Videos und Audio, externe Modelle für Tiefgehende Recherche, Schwarm und Arena sowie die Übergabe des Unterhaltung an andere Agenten. Eine [Zweitmeinung](/guide/research) kommt nur von einem lokalen Modell eines anderen Anbieters. Ebenfalls deaktiviert sind das Speichern in Memory und der Dateiexport einer Seite durch den Agenten; du kannst sie selbst aus der Bibliothek exportieren.
- **Netzwerkbeschränkung für Befehle**: Wo technisch unterstützt, führt Hydor Befehle in jedem Berechtigungsmodus ohne Netzwerkzugriff aus. Diese Beschränkung verhindert Downloads, Installationen aus dem Internet, Pushes und andere Netzwerkübertragungen durch diese Befehle. Wo sie nicht möglich ist, etwa unter Windows oder in manchen Containern, fragt jeder Befehl unabhängig vom Modus nach deiner Freigabe. Der Schlosshinweis erklärt das. Das ist keine allgemeine Netzwerkisolation der Sitzung: Zugriffe auf ein gewähltes Modell im privaten Netzwerk bleiben möglich.
- **Weiterhin verfügbar**: Dateien im Arbeitsordner, lokal gelesene Dokumente, die Bibliothek, gemeinsames Wissen, lesender Zugriff auf deine Memory-Notizen und dein Profil ohne Ergänzungen, ebenfalls vertrauliche Hydor-Subagenten und Antwortansichten ohne Webbilder oder Karten.
- **Eingeschränkte Weitergabe durch App-Funktionen**: Der Titel stammt nur dann vom Hilfsmodell, wenn dieses lokal läuft, andernfalls aus dem Anfang deiner Nachricht. Benachrichtigungen nennen nur „Eine vertrauliche Sitzung“ und ob sie abgeschlossen ist, dich benötigt oder fehlgeschlagen ist. Es gibt keinen Leselink, keinen Pull-Request aus dem Sitzungsmenü und keine aus der Sitzung erstellte Automation oder App. Andere Sitzungen und externe Agenten können sie nicht lesen. Antworten zeigen keine Webbilder; angezeigte Seiten laden keine externen Inhalte, weshalb etwa ein Diagramm mit einer Bibliothek aus dem Web nicht dargestellt wird. Diktieren funktioniert nur mit lokaler Spracherkennung unter [Einstellungen → Funktionen → Sprache](/settings?s=voice), Vorlesen nur mit einer Stimme auf deinem Gerät.
- **Dauerhaft vertraulich**: Auch Abzweigungen und **Von hier aus bearbeiten** bleiben vertraulich. Der Modus lässt sich für diese Sitzung nicht ausschalten, damit die bisherigen Inhalte geschützt bleiben. Starte für andere Arbeit eine neue Sitzung.

Die Grenzen: Hydor prüft den Standort eines Modellservers, nicht dessen Verhalten. Ein Endpunkt in deinem Netzwerk, der Anfragen an einen Onlinedienst weiterleitet, bleibt faktisch ein Onlinedienst. Für selbst kopierte, geöffnete oder anderweitig versendete Inhalte bist du verantwortlich, etwa einen Link in einer Antwort, eine aus der Bibliothek geöffnete erzeugte Seite oder einen Push auf der Git-Seite. Das gilt auch, wenn du die Sitzung auf einem anderen Gerät liest: Die App überträgt ihre Seiten wie gewohnt dorthin, gegebenenfalls durch deinen Tunnel.

### Dateien anhängen, Dateien erwähnen und Befehle nutzen

- **Dateien anhängen** über das **+** links in der unteren Zeile des Eingabefelds, per Ziehen auf das Nachrichtenfeld oder durch Einfügen von Bildern und Dateien. Eine Nachricht kann bis zu 25 MB Anhänge enthalten. Bis zu acht Bilder in PNG, JPEG, GIF oder WebP gehen direkt als Bilder an das Modell. Bis zu 20 andere Dateien werden auf diesem Computer gespeichert und am Nachrichtenende aufgelistet, damit der Agent sie öffnet. Vor dem Absenden entfernst du Anhänge mit ×. Anhänge bleiben beim Seitenwechsel im Eingabefeld, bis du sendest; ein Neuladen entfernt sie.
- **Screenshot anhängen** im selben **+**-Menü am Computer: Dein Browser fragt nach Bildschirm, Fenster oder Tab und hängt ein einzelnes Bild davon an. Kann der Browser keinen Screenshot aufnehmen, dient statt **+** eine Büroklammer zum Anhängen von Dateien.
- **@**: Tippe @ und einen Teil des Dateinamens, um passende Dateien im Arbeitsordner anzuzeigen. ↑ und ↓ wechseln den Eintrag, Enter oder Tab fügt ihn ein, Esc schließt die Liste.
- **/**: Ganz am Nachrichtenanfang zeigt / die Befehle und Skills des Agenten, bei Claude Code mit einer Beschreibung ihrer Funktion.
- Mikrofon zum Diktieren und Kopfhörer für den Sprachmodus ohne Tastatur stehen neben der Sendeschaltfläche, wenn Browser oder Computer Spracherkennung unterstützen. Siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice).

### Was sich die Startseite merkt

Die Startseite speichert die Auswahl für jeden Arbeitsort, also jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**, geräteübergreifend. Dazu gehören **Ausführungsumgebung**, das jeweilige **Modell** jedes Programms, **Denkaufwand**, **Berechtigungen**, **Agent**, **Memory**, **Ausgabenlimit**, **Vertraulich** und **Neuer Worktree**. Das **Konto** unter **Optionen → Konto** wird nicht je Ort gespeichert; deine Kontoauswahl gilt überall. Wählst du an einem Ort ein Programm, werden seine dort zuletzt verwendeten Einstellungen geladen.

Ein Ort speichert die Auswahl, sobald du dort eine Einstellung änderst oder eine Sitzung startest. Bloßes Ansehen speichert nichts. Wähle über **Ordner** ein Projekt, einen Ordner oder **Neuer Aufgabenordner**: Dessen Einstellungen werden geladen, während Nachricht und Anhänge erhalten bleiben. **Neue Sitzung** auf einer Projektkarte oder Projektseite beziehungsweise die Projektauswahl in der Seitenleiste öffnet die Startseite mit den Projekteinstellungen. **Neue Sitzung in diesem Ordner** in Dateien oder der Seitenleiste lädt die Einstellungen dieses Ordners. Die Startseite öffnet sich am zuletzt gewählten Ort.

Ein noch nicht verwendeter Ort startet mit den Standardwerten: **Allgemein** oder der eigene Projektagent, falls vorhanden, samt dessen empfohlenem Programm, Modell seiner Stufe und Berechtigungen. **Modell** ist **Automatisch**, wo verfügbar, andernfalls der Programmstandard. **Aufwand** und **Berechtigungen** entsprechen den Programmstandards, Memory ist aktiviert, ein Ausgabenlimit fehlt, **Vertraulich** und **Neuer Worktree** sind deaktiviert. **Ausführungsumgebung** bleibt beim zuletzt verwendeten Programm. Der vor Einführung dieser Funktion zuletzt gewählte Ort behält seine bisherigen Einstellungen.

Ein Link kann die Startseite vorausfüllen, etwa `/?prompt=Summarize%20my%20notes&agent=codex`. Ergänzen lassen sich `model=`, `cwd=` für den Ordnerpfad und `confidential=1` für den vertraulichen Modus. Der Link füllt nur Nachricht und Auswahl aus und startet nichts automatisch. Unsichtbare Zeichen werden aus verlinkten Nachrichten entfernt; ein Hinweis informiert darüber.

Beim Seitenwechsel bleiben Nachricht, Anhänge und auf diesen Auftrag begrenzte Optionen wie **Schwarm**, **Tiefgehende Recherche**, **Arena** und Sitzungs-**Richtlinien** erhalten. Das gilt auch für einen Ordner, den ein Link oder **Neue Agentensitzung hier** ausgewählt hat. Erst mit dem Sitzungsstart wird das Feld geleert. Während der Agent startet, bewegt sich der Pfeil auf **Starten** weiter nach oben; dann wird die Startseite zur Sitzung, das Eingabefeld wandert nach unten und deine Nachricht erscheint oben als erste Nachricht. Text und Optionen bleiben in diesem Browser auch nach dem Neuladen gespeichert, angehängte Dateien jedoch nicht.

## Die Arbeit in einer Sitzung verfolgen

### Der Sitzungskopf

Oben in der Sitzung findest du:

- Agentensymbol und Titel, den du per Doppelklick umbenennst, sowie bei einer [vertraulichen Sitzung](#keep-a-session-confidential) ein Schloss;
- den Status **In Arbeit**, **Braucht dich**, **Bereit**, **Wird gestartet**, **Memory wird erstellt**, **Anhalten** oder bei extern laufenden Sitzungen „In VS Code geöffnet“. Läuft der Agent nicht mehr, steht dort das Ergebnis: **Abgeschlossen**, wenn der letzte Durchlauf beendet wurde, gegebenenfalls mit „· 2 Dateien erstellt“ oder „· 3 Dateien geändert“; **Angehalten**, wenn du ihn gestoppt hast oder er vorzeitig unterbrochen wurde; **Fehlgeschlagen** bei einem Fehler. Ein Hinweis beim Darüberfahren erklärt den nächsten Schritt;
- den Ordner, der per Klick in Dateien geöffnet wird, eine Pull-Request-Anzeige und bei zusätzlich hinterlegten Konten den Kontonamen. Auf breiten Bildschirmen stehen dort auch Git-Branch und Modell;
- eine zur Situation passende Schaltfläche: **Stoppen** während eines Durchlaufs, **Fortsetzen** nach **Angehalten** oder **Fehlgeschlagen** und dezenter nach **Abgeschlossen**, weil auch eine neue Nachricht die Sitzung fortsetzt; beziehungsweise **Hier fortsetzen** bei Claude-Code-Sitzungen in VS Code oder einem Terminal;
- **Details**, nach Dateiänderungen mit der Zahl hinzugefügter und entfernter Zeilen, zum Öffnen des [Detailbereichs](#the-details-panel-changes-commands-and-info);
- das Menü der Sitzung (⋯): siehe [Das gesamte Sitzungsmenü](#everything-in-the-sessions-menu).

### Durchläufe, Schritte und Antworten

Die Unterhaltung liest sich wie ein Chat. Ein Durchlauf besteht aus deiner Nachricht, der Arbeit des Agenten und seiner abschließenden Antwort:

- **Deine Nachricht** steht rechts mit Bildern und Anhängen, sobald du sie sendest, noch bevor der Agent sie hat: Darunter arbeitet der Agent schon, und das Nachrichtenfeld ist frei für deine nächste. Geht sie nicht durch (keine Verbindung, Ausgabenlimit erreicht), verschwindet sie wieder und kommt zurück ins Nachrichtenfeld, mit einem Hinweis, warum. Lange Nachrichten werden auf die ersten Zeilen gekürzt; **Mehr anzeigen** klappt sie auf.
- **Die Arbeit** steht unter einer Zusammenfassungszeile, etwa „2 Min. 10 Sek. gearbeitet · 3 Befehle“, „Nachgedacht“, „Nach 40 Sek. gestoppt“ oder „Nach 5 Sek. fehlgeschlagen“. Rechts stehen die Kosten, etwa „≈ 0,12 $“; ein Klick öffnet [Zeit und Kosten](/guide/sessions#a-turns-time-and-cost). Bei einem Claude-Code- oder Codex-Abo ist das der rechnerische API-Preis der Tokens, nicht deine tatsächliche Zahlung. Ist kein Modellpreis bekannt, steht dort die Tokenzahl. Während der Arbeit steht dort etwa „In Arbeit · 1 Min. 2 Sek.“ oder „Wartet auf dich“. Nach früheren Durchläufen kommt die gesamte Arbeitszeit hinzu, etwa „In Arbeit · 1 Min. 2 Sek. (47 Min.)“. Die Arbeitsübersicht wächst laufend. Nach Abschluss wird sie eingeklappt; ein Klick auf die Zeile öffnet sie.
- **Die Arbeitsübersicht** gliedert sich nach den kurzen Zwischenmeldungen des Agenten: was er herausgefunden hat und was er als Nächstes tut. Jede Meldung beginnt einen Abschnitt mit den folgenden Schritten. Abgeschlossene Abschnitte zeigen eine Zeile mit Haken, Kurzbeschreibung, Schrittzahl und geänderten Zeilen, etwa „Zuerst die Checkout-Tests ausführen“ oder „Rabatt anwenden und erst am Ende runden“. Ein Klick zeigt die vollständige Meldung und alle Schritte. Der laufende Abschnitt zeigt die Meldung vollständig und darunter den aktuellen Schritt, etwa „total.ts wird bearbeitet · 4 Sek.“. Ein Klick darauf öffnet die bisherigen Schritte des Abschnitts. Schritte vor der ersten Meldung erhalten einen beschreibenden Abschnittstitel wie „3 Befehle ausgeführt, 2 Dateien gelesen“. Bei langen Durchläufen bleiben die neuesten Abschnitte sichtbar; **12 frühere Abschnitte anzeigen** öffnet den Rest.
- **Schritte** haben verständliche Namen wie „Tests ausführen“, „index.ts lesen“ oder „Im Web gesucht“; der eigentliche Befehl steht dezenter darunter. Ein Klick zeigt die Details. Claude Code führt einen Befehl oder einen anderen verändernden Schritt einzeln aus. Danach in derselben Nachricht angeforderte Hydor-Schritte wie Websuchen oder Seitenabrufe warten, bis dieser Schritt endet. Sie zeigen zunächst **Wartet** statt einer Uhr. Ihre Zeitmessung beginnt erst beim tatsächlichen Start; nach Abschluss steht die wirkliche Laufzeit dort. Die Arbeitsübersicht nennt stets den tatsächlich laufenden Schritt.
- **Überlegungen** erscheinen etwa als „12 Sek. nachgedacht“ mit ihrer ersten Überschrift. Ein Klick öffnet sie.
- **Die Antwort** ist der Text nach dem letzten Schritt. Vom Agenten angezeigte Seiten gehören dazu. Eine kurze Meldung nach dem letzten Schritt steht zunächst im laufenden Abschnitt der Arbeitsübersicht. Endet der Durchlauf dort, wird sie zur Antwort.
- **Antworten zwischen Schritten** bleiben an ihrer Stelle in der Unterhaltung sichtbar, statt in der Arbeitsübersicht zu verschwinden. Das betrifft etwa Antworten auf deine während der Arbeit gesendeten Nachrichten oder ausführlichere Zwischenergebnisse mit Absätzen, Listen oder Tabellen. Die Arbeit davor und danach hat jeweils eine eigene Zusammenfassungszeile, etwa „20 Sek. gearbeitet · 2 Befehle“.
- **Dateien geändert**: Eine Karte unter der Antwort listet alle im Durchlauf geänderten Dateien mit hinzugefügten und entfernten Zeilen. Ein Klick auf die Datei zeigt den Diff; **Datei öffnen** öffnet sie. Bei mehr als fünf Dateien erscheint etwa „3 weitere Dateien anzeigen“.
- **Erstellte Dokumente**: Erstellte oder bearbeitete PDF-, Word-, Excel-, PowerPoint-, LaTeX-, Notebook-, Markdown- und andere Dokumente erscheinen unter der Antwort als Karten mit **Neu** oder **Aktualisiert**, auch wenn der Agent sie nicht ausdrücklich übergeben hat. Dateinamen und Pfade in der Antwort öffnen die Datei in einem Fenster über der Unterhaltung. Siehe [Erstellte oder bearbeitete Dokumente](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply).
- **Commits**: Hat der Agent im Durchlauf Commits erstellt, steht unter der Antwort **Commit erstellt** samt Titel oder etwa „3 Commits“, Branches und hinzugefügten beziehungsweise entfernten Zeilen. Ein Klick und bei mehreren Commits eine weitere Auswahl zeigt Nachricht, Autor, Zeitpunkt, kopierbaren Hash und jede geänderte Datei mit Diff. **In Git öffnen** öffnet den Commit auf der [Git-Seite](/git) im Repository der Sitzung. Commits, die im selben Durchlauf durch Amend oder Rebase ersetzt wurden, erscheinen nicht.

Der Agent kann außerdem eine Checkliste als **Plan** oder **Aufgaben** mit Erledigungsstand führen und während der Arbeit abhaken. Hinweise der App stehen beim jeweiligen Durchlauf: was Memory gespeichert hat, eine Zweitmeinung, ein erreichtes Ausgabenlimit oder eine Hydor-Subagentenkarte. Nachrichten anderer Sitzungen erscheinen als „Von …“, die Antwort eines Subagenten (eines Hydor-, Claude-Code- oder Codex-Subagenten) als anklickbares „Antwort von …“. Ein geplanter Aufgabenlauf beginnt mit einer Zeile, die die Aufgabe nennt.

Tagestrenner wie „Gestern“ und „Heute“ trennen mehrere Tage; bei einer Unterhaltung nur von heute entfallen sie. Ältere Nachrichten werden beim Hochscrollen oder über **Frühere Nachrichten anzeigen** geladen. Neue Nachrichten und Antworten erscheinen ohne Leerraum am Unterhaltungsende. Sobald eine Antwort den Bildschirm füllt, bleibt die Ansicht an ihrem Anfang, während der Text weiterwächst. So kannst du lange Antworten von vorn lesen. Kürzere Antworten stehen einfach unter der bisherigen Unterhaltung. Scrollst du während der Arbeit nach oben, bleibt die Ansicht dort. **Neueste** bringt dich ans Ende; die Schaltfläche erscheint auch, wenn eine Antwort unterhalb des Bildschirms weiterläuft.

Unter jeder abgeschlossenen Antwort stehen **Nachricht kopieren**, **Ab dieser Antwort verzweigen** und **Vorlesen**. **Ab dieser Antwort verzweigen** funktioniert bei Claude Code an jeder Antwort, bei Codex und Custom nur an der letzten Antwort eines abgeschlossenen Durchlaufs, da diese immer einen ganzen Durchlauf verzweigen. Unter jeder deiner eigenen Nachrichten stehen immer **Nachricht kopieren**, **Von hier aus bearbeiten** und die Uhrzeit, zu der du sie gesendet hast, nicht erst beim Darüberfahren.

### Zeit und Kosten eines Durchlaufs

Die Kosten rechts in der Zeile eines abgeschlossenen Durchlaufs, etwa „≈ 0,12 $“ oder die Tokenzahl bei unbekanntem Modellpreis, öffnen **Zeit und Kosten**. Dort siehst du, warum ein Durchlauf lange gedauert oder viel gekostet hat:

- **Dauer**: Ein Balken zeigt die Zeitanteile und Dauer der Abschnitte **Modell** (Lesen der Eingabe, Nachdenken und Schreiben), **Befehle**, **Dateien lesen und bearbeiten**, **Web**, **Weitere Schritte** (etwa Subagenten und Tools verbundener Apps), **Wartet auf dich** (Freigaben, Fragen und Formulare vom Erscheinen der Karte bis zu deiner Antwort) sowie **Der Rest** (Start und Zeit zwischen Schritten). Gleichzeitige Schritte zählen nur einmal. Darunter steht etwa „Erste Antwort oder erster Schritt nach 3 Sek.“.
- **Token**: **Neu eingelesen**, **In den Cache geschrieben** für neu gelesene, vom Modellanbieter zur günstigeren Wiederverwendung gespeicherte Tokens, **Aus dem Cache gelesen** samt Anteil an der gesamten Eingabe und **Ausgegeben** für Antworten, Überlegungen und Schritte.
- **Kosten**: Gesamtkosten des Durchlaufs und bei bekanntem Modellpreis die einzelnen Kostenarten, ergänzt etwa durch „Der Cache hat ungefähr 0,80 $ gespart.“ Bei Claude-Code- und Codex-Abos, sofern die Sitzung kein API-Guthaben verwendet, steht „Zu API-Preisen: Bei einem Abo zahlst du deine Abogebühr“. Ist kein Modellpreis bekannt, weist die Anzeige darauf hin, dass die Kosten nicht erfasst werden.

Claude-Code-Durchläufe liefern die eigene Laufzeit des Modells und den Zeitpunkt der ersten Antwort. Bei anderen Agenten entspricht der Modellanteil der Denkzeit. Kostenanzeige und Detailfenster erscheinen auf breiteren Bildschirmen.

### Formeln, Diagramme, Grafiken und Bilder in Antworten

Agenten schreiben für diese App und können ihre Antworten um mehr als Text ergänzen. Jeder Agent kennt diese Möglichkeiten und verwendet sie selbstständig, wenn sie etwas verständlicher machen:

- **Formatierung**: gut lesbare Überschriften, Listen, Tabellen, Fettdruck und Code.
- **Mathematik**: Formeln wie im Lehrbuch, im Satz oder in einer eigenen Zeile, sowie chemische Gleichungen wie 2H₂ + O₂ → 2H₂O. Zahlen zwischen zwei Dollarzeichen, etwa `$1$` oder `$0$`, gelten ebenfalls als Mathematik. Gewöhnliche Preisangaben wie $4.70 bleiben Geldbeträge.
- **Diagramme**: Ablauf-, Sequenz- und Zustandsdiagramme, Zeitachsen, Mindmaps, Gantt- und Kreisdiagramme in den Farben des hellen oder dunklen App-Designs. Die Leiste darüber bietet **Code anzeigen**, mit derselben Schaltfläche zurück zum Diagramm, **Als Bild speichern (SVG)**, **Vollbild** und eine Schaltfläche zum Kopieren des Codes. Kann ein Diagramm nicht gezeichnet werden, erscheinen sein Code und der Grund.
- **Grafiken und kleine Werkzeuge**: Diagramme, beschriftete Grafiken, Rechner, Simulationen mit Reglern oder kurze Quizze laufen direkt in der Antwort, von App und Dateien abgeschirmt wie die vom Agenten angezeigten Seiten. Sie übernehmen das App-Design und passen ihre Höhe an. **Alles anzeigen** öffnet hohe Inhalte. Die Leiste enthält **Code anzeigen**, **Anzeigen** für die Rückkehr, **Als Datei speichern** und **Vollbild**. Angeklickte Auswahlmöglichkeiten werden in dein Nachrichtenfeld übernommen. Während die Antwort entsteht, baut sich die Darstellung auf; zunächst steht dort „Wird geschrieben…“. Sobald sie vollständig ist, wird sie bedienbar.
- **Bilder**: Fotos aus dem Web, etwa von Orten, Produkten, Pflanzen oder Kunstwerken, sowie lokale Bilder werden passend zur Antwort dargestellt. Ein Klick vergrößert sie; **Bearbeiten** öffnet den Bildeditor. Siehe [Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos). Webbilder werden über den App-Server geladen, sodass die Ursprungsseite deinen Browser nicht sieht. Nicht ladbare Bilder erscheinen als Link.

Wenn du reinen Text möchtest, schreibe das in deine [Agentenrichtlinien](/guide/guidelines), etwa „Antworte mit reinem Text, ohne Diagramme oder Bilder“, oder in deine Nachricht. Du kannst solche Darstellungen auch direkt anfordern: „Zeichne die Schritte als Ablaufdiagramm“, „Zeig mir ein Bild davon“ oder „Gib mir einen Regler, um andere Werte auszuprobieren“.

### Antwortansichten: Karten, Diagramme und Kartenansichten

Wenn ein Teil der Antwort eher zum Anschauen, Vergleichen, Auswählen, Nachvollziehen, Ausprobieren oder Üben geeignet ist, verwendet der Agent eine Antwortansicht der App. Dafür stehen fast 150 fertige Karten, Tabellen, Diagramme, Landkarten, Galerien, Zeitachsen und kleine Werkzeuge bereit, die mit den konkreten Inhalten gefüllt werden. Die meisten längeren Antworten enthalten solche Teile. Vergleichbare Optionen werden zur Tabelle mit markierten Bestwerten, ein Rezept zur Karte mit anpassbarer Portionszahl und Mengen, eine Vorhersage zur Stunden- und Tagesübersicht und Orte zur Landkarte mit nummerierten Markierungen. Quizze und Übungen beantwortest du direkt in der Ansicht. Alles baut sich während der Antwort im hellen oder dunklen App-Design auf.

- **Was du darin tun kannst**: Tabellen sortieren und filtern, Diagramme als Zahlen anzeigen, Checklisten abhaken, Rezept-Timer starten, Lernkarten umdrehen, Paare zuordnen, Lücken füllen, Fragen einer Fehlerdiagnose beantworten, ein Auswahlrad drehen, Regler von Rechnern oder Funktionsgraphen bewegen oder Videos abspielen. Deine Haken und Antworten bleiben auf diesem Gerät beim erneuten Öffnen erhalten, auch Übungsantworten. Manche Ansichten übernehmen deine Auswahl oder dein Quiz-Ergebnis in das Nachrichtenfeld. Einige bieten mehr:
  - **Übungsaufgaben** mit eigenen Text- oder Zahlenantworten werden sofort geprüft. Zahlen dürfen innerhalb einer Toleranz liegen; bei Text spielt Großschreibung keine Rolle. Ist nur ein Akzent falsch, wird das erklärt. **Zeige einen Hinweis** gibt schrittweise Hilfen. Der Lösungsweg erscheint nach einem Versuch oder sobald alle Hinweise sichtbar sind. Du erhältst ein Ergebnis; **Meine Ergebnisse senden** übernimmt es in das Nachrichtenfeld. Auch offene Antworten werden zur Prüfung an den Agenten übergeben.
  - **Ausführbarer und bearbeitbarer Code**: Ein abgeschirmter Playground führt JavaScript, Python oder eine kleine Webseite direkt aus und zeigt darunter Ausgaben und Python-Diagramme. Er bietet **Ausführen**, **Zurücksetzen**, **Kopieren** und **Meinen Code senden** und kann Übungsaufträge enthalten. Python wird bei der ersten Verwendung aus dem Web geladen und funktioniert deshalb nicht in einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential).
  - **Netzwerkdiagramme** zeigen Zusammenhänge, etwa zwischen Begriffen, Romanfiguren oder Abhängigkeiten. Tippe auf einen Knoten, um Verbindungen hervorzuheben und seine Beschreibung zu lesen. Du kannst Knoten verschieben, die Legende lesen oder zur **Liste** wechseln.
  - **Kommentierter Text** markieren einzelne Passagen. Tippe darauf, um Korrekturen, Anmerkungen, Bedeutungen oder Änderungsvorschläge zu sehen, oder nutze **Dazu fragen**. Du kannst Anmerkungen nach Art filtern, zwischen **Original** und **Korrigiert** wechseln, den **Korrigierten Text kopieren** oder ihn anhören.
  - **Faktenprüfungen** behandeln Aussagen einzeln mit Urteil, Begründung, Einschätzung der Sicherheit und Belegen dafür und dagegen samt Quellen. Die Urteilssummen oben filtern die Aussagen beim Antippen.
  - **Anschlussfragen** sind zwei bis fünf Schaltflächen am Antwortende für mögliche nächste Fragen oder Schritte. Ist dein Nachrichtenfeld leer, sendet ein Klick die Frage direkt; andernfalls wird sie an deinen Entwurf angehängt. Verwendete Schaltflächen erhalten einen Haken.
- **Bilder**: Fehlt ein Bild oder lässt es sich nicht laden, nutzt der Text den frei werdenden Platz. Es bleibt kein leerer Bildrahmen.
- **Zahlen aus einer Tabelle oder Datei**: Tabellen, Diagramme, Kennzahlen, Ranglisten, Histogramme und Karten mit Zahlenwerten können ihre Daten aus einer deiner Tabellen in der [Bibliothek](/library) oder aus einer CSV-, TSV-, JSON- oder JSONL-Datei im Ordner der Unterhaltung oder ihres Projekts lesen, statt sie selbst zu enthalten. Agenten verwenden das, wenn die Zahlen dort vorliegen, es mehr als ein paar Dutzend Zeilen sind oder du die Karte voraussichtlich behalten möchtest. Die Karte summiert, zählt, gruppiert, filtert und sortiert selbst; nichts muss erneut eingetippt werden. Bei jeder Anzeige liest sie die aktuellen Zahlen einschließlich später ergänzter Zeilen, sofern kein fester Zellbereich angegeben ist. Darunter stehen **Datenquelle** mit einem Link wie *Geschäftszahlen · Umsatz* zur Tabelle oder Datei, der Abrufzeitpunkt und bei Teilausgaben etwa „1.000 von 12.400 angezeigt“. **Erneut lesen** lädt die Daten neu; nach dem Speichern der Tabelle zeichnet sich die Karte automatisch neu. Fehlen Tabelle, Blatt, Spalte oder Datei, nennt die Karte den Grund verständlich und bietet **Erneut versuchen**. Sie liest ausschließlich Dateien in den Ordnern ihrer Unterhaltung, keine anderen Dateien auf deinem Computer. Die Grenze liegt bei 50 MB, für JSON bei 20 MB, und den ersten 1.000.000 Zeilen. Eine in einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) erstellte Tabelle können nur Karten dieser Sitzung lesen.
- **Beim Darüberfahren** (oder wenn du die Karte mit der Tastatur erreichst) erscheint oben rechts eine kleine Leiste: **Daten anzeigen** zeigt, was der Agent geschrieben hat (bei einer Karte, die eine Tabelle oder eine Datei liest: woher sie liest und was sie davon zeigt; mit **Anzeigen** kehrst du zurück), **Als Text kopieren** kopiert es als reinen Text, und **Vollbild** zeigt die Karte allein über der Seite, so breit wie dein Fenster (auf dem Smartphone der ganze Bildschirm) und scrollbar, wenn sie hoch ist; mit **Esc**, **Schließen** oder einem Klick daneben kommst du zurück. Unter **Mehr** (…): **An Board anpinnen** legt eine Kopie der Karte auf einem Board deiner Bibliothek ab, auf einem, das du auswählst, oder auf einem **Neues Board…**, das du dort benennst, damit du sie neben anderen Karten wiederfindest (siehe [Boards](/guide/library#boards)); **Als Bild speichern** speichert ein PNG der Karte, so wie sie aussieht, in dem Design, in dem du sie siehst, und in doppelter Größe, damit es scharf bleibt, benannt nach ihrem Titel, und **Als Bild kopieren** legt dasselbe Bild in die Zwischenablage, damit du es in eine Nachricht oder ein Dokument einfügen kannst (wo dein Browser das Seiten erlaubt). Im Vollbild gibt es dieselben beiden oben. Eine Karte mit einer Landkarte, einem Diagramm, das eine Diagrammbibliothek zeichnet, einem Videoplayer oder der Ausgabe eines Code-Playgrounds hat keine Schaltflächen für Bilder (sie lässt sich trotzdem anpinnen): Diese Teile lassen sich nicht in ein Bild zeichnen.
- **Wann Agenten sie verwenden**: Die Agenten sind angewiesen, solche Ansichten für alle geeigneten Antwortteile zu nutzen: Vergleiche, Inhalte mit Bildern und Details wie Orte, Produkte, Filme, Bücher, Personen, Fachartikel und Nachrichten, Zahlen, Zeitangaben, Pläne, Aufgaben, Lernstoff, Textkorrekturen, zu prüfende Aussagen und mögliche nächste Schritte. Bilder werden mitgeliefert, Videos verwendet, wenn Bewegung mehr erklärt als ein Foto. Begründungen, Ratschläge und Einschränkungen bleiben im Begleittext. Einfache Unterhaltungen, kurze Antworten und Codeänderungen bleiben Text. Jede Antwort kann mehrere Ansichten enthalten, etwa Reiseplan, Wetter und Packliste. Spätere Antworten können Ansichten mit aktualisierten Daten erneut zeigen. Der Agent findet passende Ansichten über eine einzige Suche, bei bekannten Ansichten nach Namen, sonst mit kurzen Beschreibungen der Inhalte. Gesucht wird nach Wörtern und bei aktiviertem **Bedeutungssuche** unter [Einstellungen → Memory](/settings?s=memory) auch semantisch. Der Agent bekommt also nicht alle Ansichten auf einmal übergeben. Die [integrierten Agenten](/guide/agents#the-built-in-agents) verwenden bevorzugt passende Ansichten für ihre Aufgaben.
- **Alle ansehen**: [Antwortansichten](/answers) zeigt jede Ansicht mit einem Beispiel, sortiert nach Zusammenfassungen, Vergleichen, Einkaufen, Orten und Reisen, Essen, Plänen, Arbeit und Geschäft, Zahlen und Diagrammen, Geld, Lernen, Wissenschaft, Medien, Personen und Sport, Schreiben und Code. **Schon während des Streamings abspielen** zeigt, wie die Ansicht während einer Antwort entsteht.

Du kannst Ansichten auch direkt anfordern: „Vergleiche sie in einer Tabelle“, „Zeig sie auf einer Karte“, „Frag mich dazu ab“, „Gib mir Übungsaufgaben dazu“ oder „Markiere die nötigen Korrekturen in meinem Aufsatz“. Wenn du reinen Text bevorzugst, sage das in deinen [Agentenrichtlinien](/guide/guidelines), etwa „Antworte mit reinem Text, ohne Karten oder Diagramme“, oder in der Nachricht.

### Einen Schritt öffnen und seine Ausgabe ansehen

Ein Klick öffnet die Details eines Schritts:

- bei einem Befehl: Befehlszeile, Arbeitsordner, Exit-Code, Dauer, Kopierschaltfläche und Ausgabe; bei gekürzter Ausgabe zusätzlich **Vollständige Ausgabe laden**;
- bei einer Dateiänderung: den Diff, bei gekürzter Darstellung mit **Vollständigen Diff laden**;
- beim Lesen einer Datei: einen Link zur Datei und den gelesenen Inhalt;
- bei einer Webseite: Adresse und gelesenen Inhalt;
- bei einer Subagentenaufgabe: **Aufgabe erteilt** und das Ergebnis;
- bei allen anderen Schritten: Anfrage des Agenten und zurückgeliefertes Ergebnis.

Ein Schritt kann als **Hintergrund** für eine weiterlaufende Aufgabe oder **Automatisch** für eine Entscheidung des automatischen Custom-Modus markiert sein; die Begründung erscheint beim Darüberfahren. Fehlerhafte Exit-Codes erscheinen rot. Hintergrundaufgaben wie weiterlaufende Befehle, Überwachungen oder Workflows stehen zusammen mit Subagenten in einer Zeile über dem Nachrichtenfeld. Öffne eine Aufgabe für die Ausgabe bei Claude Code oder beende sie mit **Stoppen**, nach Rückfrage; ein Subagent öffnet sich als eigene Sitzung. Siehe [Subagenten](/guide/sessions#subagents).

## Das Memory eines Projekts erstellen, bevor der Agent startet

Startest du auf der Startseite eine Sitzung in einem Projekt, dessen [Wiki-Memory](/guide/wiki-memory) noch neu ist (weniger als 10 Artikel, noch kein Aufbau aus dem Verlauf) und für das es etwas zum Aufbauen gibt (Unterhaltungen, Commit-Nachrichten, Dokumente, Notizen, eine README oder einen Ordner docs/), fragt die Sitzung zuerst nach. Eine Karte unter deiner Nachricht fragt **Memory von <Projekt> zuerst erstellen?** und zeigt, was gelesen würde und wie lange es etwa dauert, bis der Agent startet. Die Sitzung zeigt **Braucht dich** (und du bekommst die Benachrichtigung), bis du dich entscheidest:

- **Memory erstellen, dann starten**: Das Memory wird erstellt, die Karte wird zum Fortschritt, und die Sitzung zeigt **Memory wird erstellt**. Deine Nachricht wartet („Wird an den Agenten gesendet, sobald das Memory bereit ist“) und geht an den Agenten, sobald der wichtigste Teil geschrieben ist: ein Überblick über das Projekt aus seinen Dateien, seinen Notizen und den Unterhaltungen mit dem meisten Inhalt. Der Rest wird im Hintergrund weitererstellt, und Agenten finden ihn, sobald er da ist. **Jetzt starten** sendet deine Nachricht sofort und lässt das Erstellen weiterlaufen; **Erstellen stoppen** beendet es (Geschriebenes bleibt) und startet den Agenten. Du kannst die App schließen: Der Agent startet von selbst. Schlägt das Erstellen vor diesem Punkt fehl, sagt die Karte das, mit **Erneut versuchen** und **Trotzdem starten**. Wurde der Agent beendet, bevor er deine Nachricht je bekam (er ist abgestürzt oder der Computer wurde während des Wartens neu gestartet), und lässt er sich nicht erneut starten, bietet die Karte **In neuer Sitzung starten**: Eine neue Sitzung mit denselben Einstellungen bekommt deine Nachricht, übernimmt, was du inzwischen gesendet hast, und die leere wird archiviert.
- **Ohne Memory starten**: Der Agent startet jetzt, und dieses Projekt fragt eine Woche lang nicht erneut.
- **Für dieses Projekt nicht mehr fragen**: Für dieses Projekt wird nie wieder gefragt. **Build from history** bleibt auf der Memory-Seite des Projekts.

Was du sendest, während es wartet, geht nach deiner ersten Nachricht an den Agenten. Es fragt nur, wenn du selbst auf der Startseite eine Sitzung startest, nie bei geplanten Läufen, Apps, Subagenten oder von Agenten gestarteten Sitzungen und nicht für ein Projekt, für das schon ein Aufbau lief.

## Aktionen des Agenten erlauben oder ablehnen

Will der Agent etwas tun, das seine Berechtigungen nicht ohne Freigabe erlauben, wartet er und zeigt am Unterhaltungsende eine Karte. Darauf stehen der geplante Befehl, eine Dateiänderung mit Diff oder ein anderes Tool samt Details und Wartezeit. Der Sitzungspunkt wird gelb, der Posteingang zählt die Anfrage und bei aktivierten Benachrichtigungen wirst du informiert. Antworten kannst du auf der Karte, im [Posteingang](/guide/inbox) oder bei einfachen Ja-Nein-Fragen direkt in einer Benachrichtigung, sofern der Browser entsprechende Schaltflächen anzeigt.

Die Schaltflächen hängen vom Agenten ab:

- **Claude Code**: **Erlauben**, **Ablehnen** und oft eine Regel wie „Bash npm test immer erlauben“ oder „Alle Änderungen in dieser Sitzung erlauben“.
- **Codex**: **Erlauben**, **Für diese Sitzung erlauben**, **Diesen Befehl immer erlauben**, **Ablehnen**, **Ablehnen und stoppen**; bei Dateiänderungen **Änderungen in dieser Sitzung erlauben**, bei erweiterten Berechtigungen **Für diesen Durchlauf erlauben** und **Für diese Sitzung erlauben**.
- **Custom**: **Erlauben**, **Immer erlauben** mit dem genauen Geltungsbereich sowie **Ablehnen**. Die dauerhafte Freigabe gilt nur für den genehmigten Befehl, damit sich keine weiteren Befehle anhängen lassen.
- Andere Agenten zeigen ihre eigenen Auswahlmöglichkeiten.

**Ablehnen** öffnet zunächst ein Feld mit „Optional: Sag dem Agenten, was er stattdessen tun soll“. Ein zweiter Klick auf **Ablehnen** sendet die Entscheidung mit oder ohne Hinweis. Custom antwortet bei **Ablehnen** sofort, Codex bei **Ablehnen und stoppen** ebenfalls.

Ein Tool eines verbundenen Kontos mit der Einstellung **Vorher fragen** unterbricht die Sitzung nicht. Der Aufruf wartet im Postausgang, während der Agent weiterarbeitet. In der Unterhaltung steht **Wartet im Postausgang auf deine Freigabe**, später auch, ob der Aufruf gesendet oder verworfen wurde. Siehe [Der Postausgang](/guide/inbox#the-outbox-calls-held-for-your-ok).

Im **Automatisch**-Modus von Claude Code kann die Sicherheitsprüfung einen Befehl direkt ablehnen. Über dem Nachrichtenfeld erscheint dann „Claude hat einen Befehl blockiert“ mit Begründung. **Genehmigen und erneut versuchen** schaltet auf Nachfragen um und lässt den Agenten den Befehl erneut anfordern, sodass du ihn normal freigeben kannst. **Schließen** lässt die Ablehnung bestehen.

## Fragen beantworten und Pläne freigeben

Fragen des Agenten erscheinen auf einer gelb umrandeten Karte mit Antwortmöglichkeiten:

- Wähle eine Antwort oder bei „Mehrfachauswahl“ mehrere. **Andere – eigene Antwort eingeben** nimmt deinen eigenen Text auf.
- **Dateien anhängen** ergänzt eine Antwort um Dateien.
- Die Zifferntasten 1 bis 9 wählen eine Option der ersten noch unbeantworteten Frage.
- **Antwort senden** sendet sie als nächste Nachricht. Hat die Sitzung während der Frage angehalten, startet **Fortsetzen und antworten** sie mit deiner Antwort neu. Wartet Claude Code in VS Code oder einem Terminal, beendet **Hier antworten** die dortige Sitzung und setzt sie hier mit der Antwort fort. Eine dort wartende Codex-Sitzung musst du dort beantworten.

Erscheint die Frage stattdessen als Freigabekarte, heißen die Schaltflächen **Antworten senden** und bei Claude Code zusätzlich **Überspringen**.

**Pläne.** Im **Plan**-Modus von Claude Code liest und plant der Agent und legt anschließend eine Plankarte vor. **Änderungen genehmigen und automatisch akzeptieren** startet die Umsetzung ohne Rückfragen zu Änderungen; **Genehmigen, vor Änderungen fragen** verlangt diese Rückfragen; **Weiter planen** bleibt im Plan-Modus, wo du gewünschte Anpassungen nennen kannst. Codex bespricht und plant im Plan-Modus zunächst und kann Rückfragen stellen. Custom schließt den Plan-Modus mit einem nummerierten Plan ab. Wechsle die Berechtigungen per Umschalt+Tab und antworte, um ihn ausführen zu lassen.

## Formulare eines Dienstes ausfüllen

Benötigt ein verbundener Dienst während einer Aufgabe Angaben wie Datum, Auswahl oder eine Bestätigung auf einer Webseite, erscheint unabhängig vom Agenten eine Formularkarte: etwa „Linear bittet dich, ein Formular auszufüllen“, „… eine Seite zu öffnen“ oder „… um Freigabe“. Fülle die Felder aus und wähle **Senden**, **Öffnen** zum Aufrufen der Seite oder **Erlauben**. Alternativ kannst du **Ablehnen** oder **Nicht jetzt** wählen. Auch die eigenen Tool-Server von Codex fragen auf diese Weise nach. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).

## Dem Agenten während der Arbeit schreiben

Du kannst während eines Durchlaufs Nachrichten schreiben. Was Enter dann tut, stellst du für jeden Browser unter **Senden, während ein Agent arbeitet** in [Einstellungen → App → Allgemein](/settings?s=general&find=Sending%20while%20an%20agent%20works) ein:

- **In laufenden Durchlauf senden** ist der Standard: Enter fügt die Nachricht dem laufenden Durchlauf hinzu, damit der Agent sie sofort berücksichtigen kann. Strg+Enter, auf dem Mac ⌘Enter, stellt sie stattdessen in die Warteschlange.
- **Auf Abschluss warten**: Enter stellt die Nachricht in die Warteschlange für das Ende des Durchlaufs. Strg+Enter fügt sie stattdessen dem laufenden Durchlauf hinzu.

Der Hinweis im Nachrichtenfeld erklärt das Verhalten: „Nachricht in den laufenden Durchlauf senden“ oder „Nachricht nach diesem Durchlauf senden“. Auf Touchscreens entspricht die Sendeschaltfläche Enter. Custom berücksichtigt neue Nachrichten beim nächsten Modellschritt, sobald laufende Tools abgeschlossen sind; **Jetzt senden** tut dasselbe für eine wartende Nachricht. Wurde eine Custom-Sitzung schon vor einem App-Update gestartet und unterstützt sie noch keine Live-Nachrichten, bleibt die Nachricht bis zum Durchlaufende in der Warteschlange. Andere ACP-Agenten verarbeiten jeweils nur eine Nachricht, deshalb warten neue Nachrichten dort immer. Bei Claude Code steht unter einer während der Arbeit gesendeten Nachricht „während der Arbeit gesendet“. Die Antwort darauf erscheint direkt unter deiner Nachricht, auch wenn der Agent danach weiterarbeitet.

## Die Warteschlange verwalten

Wartende Nachrichten stehen nummeriert in ihrer Sendereihenfolge über dem Eingabefeld; eine, die du einreihst, steht dort, sobald du sie sendest. Nach jedem Durchlauf wird automatisch genau eine gesendet.

- Ziehe eine Nachricht am Griff, um die Reihenfolge zu ändern.
- **Jetzt senden**, der Pfeil, sendet sie sofort in den laufenden Durchlauf.
- **Bearbeiten**, der Stift, ändert Text und Anhänge. Entferne Anhänge oder füge über **Anhängen**, Einfügen oder Ziehen weitere hinzu. Enter speichert, Esc bricht ab.
- **Entfernen**, der Papierkorb, nimmt die Nachricht aus der Warteschlange und löscht ihre Anhänge.
- Wenn du den Agenten stoppst oder die App neu startet, pausiert die Warteschlange mit dem Hinweis „Die Warteschlange ist pausiert, weil der Agent gestoppt oder der Server neu gestartet wurde.“ **Fortsetzen** gibt sie wieder frei, sobald der Agent bereit ist. Ein erreichtes Ausgabenlimit hält die Warteschlange ebenfalls an; eine Erhöhung setzt sie fort.

## Agent, Modell, Denkaufwand oder Berechtigungen ändern

Im Nachrichtenfeld der Sitzung stehen **Agent**, **Modell**, **Aufwand** und **Berechtigungen** gemeinsam neben dem **+** zur Verfügung. Die Schaltfläche öffnet **Optionen**, auf dem Smartphone als Bedienfeld von unten. Darunter folgen die übrigen Startseitenoptionen für diese Sitzung in derselben Reihenfolge: **Konto**, falls der Agent mehrere Konten hat; ein Wechsel gilt ab deiner nächsten Nachricht. **Vertraulich** und **Arena** zeigen den beim Sitzungsstart gewählten Zustand; ein Klick erklärt, wie du einen anderen Zustand erhältst. Danach folgen **Memory**, **Ausgabenlimit**, **Schwarm**, **Forschung** und **Richtlinien** mit denselben Auswahlmöglichkeiten und Dialogen wie unter [Sitzungseinstellungen](/guide/research#turn-it-on). Schwarm und Forschung ändern sich ab deiner nächsten Nachricht. Die Schaltfläche nennt Agent und Modell sowie abweichenden Denkaufwand und Berechtigungen. Sie wird gelb, wenn der Agent ohne Rückfrage alles tun darf, etwa bei **Bypass** oder Codex-**Voller Zugriff**. Ein anderer Agent gilt ab der nächsten Nachricht; siehe [Agenten in einer Sitzung wechseln](/guide/agents#switch-agents-in-a-session). Änderungen an Modell, Denkaufwand und Berechtigungen gelten sofort für den laufenden Agenten und bleiben für die Sitzung erhalten. Umschalt+Tab wechselt zum nächsten Berechtigungsmodus. Das Modellmenü zeigt nur Modelle dieses Agentenprogramms. Für die Übergabe an ein anderes Programm nutze [Mit einem anderen Agenten fortsetzen](#continue-in-another-agent).

## Einen Teil einer Antwort zitieren

Markiere Text in einer Agentenantwort oder deiner eigenen Nachricht. Darüber, auf Touchscreens darunter, erscheint **Zitieren**. Die Schaltfläche fügt den Text als Zitat in das Nachrichtenfeld ein und setzt den Cursor dahinter. So antwortest du gezielt auf eine Passage oder greifst eine frühere Aussage wieder auf.

## Text in einer Sitzung suchen

Drücke in einer Sitzung Strg+F beziehungsweise ⌘F. **In dieser Sitzung suchen** durchsucht deine Nachrichten und Agentenantworten einschließlich noch nicht geladener Unterhaltungsteile, jedoch keine Befehlsausgaben. Ab zwei Zeichen springt die Suche zum neuesten Treffer, hebt die Wörter hervor und zeigt etwa „3 von 12“. Enter geht zum älteren, Umschalt+Enter zum neueren Treffer; alternativ verwendest du die Pfeile. Esc schließt die Suche. Eingeklappte Nachrichten öffnen sich an der Fundstelle. Wählst du eine Nachricht in der übergreifenden Suche per Strg+K, öffnet sich ihre Sitzung mit vorausgefüllter Suchleiste.

## Weitere Funktionen im Nachrichtenfeld

- ↑ im leeren Feld lädt frühere Nachrichten dieser Sitzung, beginnend mit der neuesten. ↓ geht wieder vorwärts.
- Was du eingibst, wird für jede Sitzung in diesem Browser als Entwurf gespeichert und ist noch da, wenn du zurückkommst.
- Strg+S beziehungsweise ⌘S legt den Entwurf beiseite und leert das Feld. Dieselbe Tastenkombination im leeren Feld stellt ihn wieder her.
- Sehr lange eingefügte Texte ab 32.000 Zeichen werden als Textdatei angehängt, statt das Feld zu füllen.
- Der Platzhalter erklärt das Senden: etwa „Nachricht an Claude…“ oder bei gestopptem Agenten „Nachricht zum Fortsetzen…“. Senden startet den Agenten dann mit der gesamten Unterhaltung neu.

## Der Detailbereich: Änderungen, Befehle und Informationen

**Details** im Sitzungskopf öffnet einen Bereich mit drei Tabs. Auf breiten Bildschirmen steht er neben der Unterhaltung und bleibt beim Sitzungswechsel geöffnet. Auf schmaleren Bildschirmen liegt er über der Seite; auf dem Smartphone öffnet er sich nur auf Anforderung.

- **Änderungen**: alle von der Sitzung geänderten Dateien, nach Umfang sortiert, mit hinzugefügten und entfernten Zeilen. Ein Klick zeigt die Diffs der einzelnen Änderungen; **Öffnen** öffnet die Datei.
- **Befehle**: alle ausgeführten Shell-Befehle, neueste zuerst, mit Filtern für **Alle**, **Fehlgeschlagen** und **Hintergrund**. Ein Klick zeigt die Ausgabe.
- **Infos**: Agent, Status wie im Kopf (**Abgeschlossen**, **Angehalten**, **Fehlgeschlagen** oder aktuelle Aktivität), Ordner, Branch, Modell, Denkaufwand, Kontextauslastung, Startzeit, letzte Aktivität, Aktivitätszahlen für Prompts, Durchläufe, Tool-Aufrufe und Befehle, Tokens für Eingabe, Cache und Ausgabe, rechnerische API-Kosten, Ausgabegeschwindigkeit und Startort wie Hydor, VS Code, Terminal oder Claude-Desktop-App. Während der Agent läuft, zeigt **Zugehörige Programme** aktuelle CPU- und Arbeitsspeichernutzung sowie Prozesszahl und die geltenden [Limits](/guide/app#limit-each-session). Darunter stehen Hintergrundaufgaben, die du zur Ausgabe öffnen oder **Stoppen** kannst, sowie **Im Terminal fortsetzen** mit kopierbarem Fortsetzungsbefehl und Sitzungs-ID für Claude Code und Codex.

## Anzeigen für Kontext, Cache und Geschwindigkeit lesen

Neben dem Mikrofon zeigt ein kleiner Ring mit Prozentzahl, wie viel des Kontextfensters belegt ist. Weitere Anzeigen stehen unten im Optionsmenü:

- **Kontext**: der Ring und die Zeile **Kontext** in den Optionen („42 % belegt“). Fahre über den Ring, um die genaue Anzahl der Tokens zu sehen. Über 85 % wird er gelb. Klicke auf den Ring oder in den Optionen auf **Verdichten**, um die Unterhaltung zu verdichten (nicht, während ein Durchlauf läuft). In einer Custom-Sitzung zeigt der Ring beim Darüberfahren die Tokens und eine Aufteilung, wofür sie verwendet werden; die Aufteilung steht auch unter dem Pfeil der Zeile **Kontext**. Custom verdichtet von selbst, deshalb gibt es kein **Verdichten**, und ein Klick auf den Ring bewirkt nichts (siehe [Lange Unterhaltungen und lange Ausgaben](/guide/custom#long-conversations-and-long-output)).
- **Cache 4 Min.** bei Claude Code: Der Prompt-Cache hält die Unterhaltung fünf Minuten oder eine Stunde bereit, damit die nächste Nachricht schneller und günstiger verarbeitet wird. Ohne neue Nachricht zählt die Zeit herunter. Eine rechtzeitige Nachricht verwendet den Cache und startet den Countdown neu. **Cache kalt** bedeutet, dass die nächste Nachricht ihn neu aufbaut.
- **85 tok/s**: Ausgabegeschwindigkeit der letzten Antwort in Tokens pro Sekunde.

## Einen Durchlauf oder Agenten stoppen und fortsetzen

Der Stoppen-Knopf neben dem Nachrichtenfeld hat einen rotierenden Ring, während der Agent startet oder arbeitet. Braucht er deine Antwort, pausiert der Ring. Bei der Geräteeinstellung für reduzierte Bewegung bleibt er still. Nach dem Durchlauf bleiben Knopf und Ring sichtbar, solange gestartete Subagenten oder Hintergrundaufgaben weiterlaufen, etwa Hydor-Subagenten, Claude-Code-Subagenten, Befehle oder Überwachungen. Daneben steht die Sendeschaltfläche; du kannst normal weiterschreiben. Beim Darüberfahren steht, was gestoppt wird, etwa „Stoppt diesen Durchlauf, 2 Subagenten und 1 Hintergrundaufgabe“ oder „Stoppt 2 Subagenten“. Der Knopf stoppt alles gemeinsam: Durchlauf, laufende Subagenten, Hintergrundaufgaben und deren wiederum gestartete Aufgaben. Ein so gestoppter Hydor-Subagent sendet keinen Abschlussbericht an seinen übergeordneten Agenten. Bereits unterwegs befindliche Berichte warten in dessen pausierter Warteschlange, statt ihn aufzuwecken. **Fortsetzen** gibt die Warteschlange frei.

- **Durchlauf stoppen**: **Stoppen** im Sitzungskopf oder die runde Schaltfläche mit Quadrat neben dem Nachrichtenfeld beendet die aktuelle Arbeit samt gestarteten Aufgaben. Esc stoppt nichts, sondern schließt nur geöffnete Elemente wie Suche oder Listen. Der Durchlauf zeigt „Gestoppt nach…“. Der Agent bleibt für die nächste Nachricht bereit; die Warteschlange pausiert bis zu deiner Fortsetzung.
- **Agentenprozess stoppen**: das Menü der Sitzung (⋯) → **Mehr** → **Agentenprozess stoppen**, wenn kein Durchlauf läuft. Das Programm des Agenten wird beendet; die Sitzung und ihr Verlauf bleiben erhalten, und sie zeigt, wie ihr letzter Durchlauf endete (**Fertig**, **Angehalten** oder **Fehlgeschlagen**).
- **Fortsetzen**: Die Schaltfläche **Fortsetzen** im Kopf startet den Agenten mit der ganzen Unterhaltung neu. Du kannst auch einfach eine Nachricht senden („Nachricht zum Fortfahren…“): Auch das startet ihn wieder, bei Claude Code, Codex und Custom gleichermaßen. Nach **Fertig** ist **Fortsetzen** eine dezentere Schaltfläche, da deine nächste Nachricht genügt. Wurde die Sitzung vor wenigen Sekunden beschrieben, vielleicht aus VS Code oder einem Terminal, fragt die App zuerst nach, da zwei Programme, die in dieselbe Sitzung schreiben, ihren Verlauf beschädigen können.
- Ein unbeschäftigter Agent stoppt nach drei Stunden automatisch, sofern weder eine Antwort von dir aussteht noch Hintergrundaufgaben laufen. Deine nächste Nachricht startet ihn wieder.

## Der Sitzung ein Ziel geben

Ein Ziel hält den Agenten über mehrere Durchläufe hinweg an der Arbeit, bis eine festgelegte Bedingung erfüllt ist. Öffne **⋯ → Ziel setzen** oder schreibe in einer Claude-Code- oder Codex-Sitzung `/goal` mit der Bedingung. Beschreibe konkret, wann die Aufgabe erledigt ist, etwa „npm test läuft erfolgreich durch und die Uploadseite verarbeitet 2-GB-Dateien“. Klicke dann auf **Arbeit am Ziel starten** oder drücke Strg+Enter.

- **Claude Code** arbeitet weiter; nach jedem Durchlauf prüft eine kurze Kontrolle, ob das Ziel erreicht ist.
- **Codex** arbeitet weiter, bis es das Ziel als erreicht bewertet.
- **Custom** arbeitet weiter; nach jedem Durchlauf prüft das Hilfsmodell die Belege und nennt den nächsten Schritt. Bei ausbleibendem Fortschritt pausiert das Ziel. Die maximale Rundenzahl legst du unter [Einstellungen → Custom → Ziele → Runden bis zur Zielpause](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses) fest.

Solange ein Ziel besteht, zeigt eine Leiste über dem Nachrichtenfeld Ziel und Status: in Bearbeitung, pausiert, ohne Fortschritt mit benötigter Hilfe oder an einem Nutzungs- beziehungsweise Tokenlimit gestoppt. Außerdem siehst du Zahl der Prüfungen, Zeit- und Tokenverbrauch und die Begründung der letzten Prüfung. **Pausieren** und **Fortsetzen** funktionieren bei Codex und Custom; **Entfernen** beendet die Arbeit am Ziel. Ein Zielsymbol in der Seitenleiste markiert Sitzungen mit Ziel.

## Eine Sitzung abzweigen

Eine Abzweigung ist eine neue Sitzung, die die bisherige Unterhaltung übernimmt und einen anderen Ansatz verfolgt. Die ursprüngliche Sitzung bleibt erhalten.

1. Öffne **⋯ → Verzweigen** oder wähle unter einer Antwort **Ab dieser Antwort verzweigen**, um nur den Verlauf bis dorthin zu übernehmen: bei Claude Code an jeder Antwort, bei Codex und Custom an der letzten Antwort eines abgeschlossenen Durchlaufs.
2. Beschreibe, was die Abzweigung versuchen soll, im Feld „Was soll die Abzweigung anders versuchen?“.
3. Klicke auf **Verzweigen** oder drücke Strg+Enter.

Die neue Sitzung öffnet sich mit dem Titel „… · Abzweigung“ und demselben Agenten, Modell, Denkaufwand, Berechtigungsmodus und Konto. Oben steht „Abgezweigt von …“ mit **Öffnen**. Bei Codex enthält die Abzweigung nur die neuen Nachrichten; den vorherigen Verlauf liest du im Original. Abzweigungen funktionieren mit Claude Code, Codex und Custom, jedoch nicht bei einer in einer anderen App geöffneten Sitzung. Auch eine Claude-Code-Antwort vor einer Kontextverdichtung lässt sich abzweigen: Die Abzweigung erhält den vollständigen Verlauf bis zu dieser Antwort in seinem damaligen, unverdichteten Zustand.

## Von hier aus bearbeiten

Gehe zu einer deiner früheren Nachrichten zurück und ersetze sie:

1. Wähle unter deiner Nachricht **Von hier aus bearbeiten**.
2. Ändere den Text.
3. Aktiviere **Dateien auf den Stand vor dieser Nachricht zurücksetzen**, wenn auch die seitdem vorgenommenen Änderungen des Agenten rückgängig gemacht werden sollen.
4. Wähle **Von hier senden** beziehungsweise Enter oder **Abbrechen** beziehungsweise Esc.

Die Unterhaltung wird in einer Kopie bis unmittelbar vor dieser Nachricht fortgesetzt, die den Titel dieser Sitzung übernimmt; diese Sitzung wird archiviert. Die Dateien zurückzusetzen funktioniert bei Claude Code (über dessen eigene Checkpoints für Nachrichten, die aus dieser App gesendet wurden), bei Custom (die Dateien, die seine eigenen Bearbeitungen geändert haben; was Befehle geändert haben, bleibt) und bei jeder Sitzung in einem Worktree (bei jeder gesendeten Nachricht wird ein Snapshot erstellt). Codex-Sitzungen können Dateien nur in einem Worktree zurücksetzen. Stoppe zuerst den Agenten, wenn ein Durchlauf läuft. Von hier aus bearbeiten funktioniert bei Claude Code, Codex und Custom.

## Mit einem anderen Agenten fortsetzen

Übergib die Unterhaltung an ein anderes Agentenprogramm:

1. Öffne **⋯ → In Codex fortsetzen**, **In Claude Code fortsetzen** oder **Im Custom-Agenten fortsetzen**, sobald Custom ein Modell hat.
2. Ein Hinweis über dem Nachrichtenfeld zeigt, wohin die nächste Nachricht geht. Modell, Denkaufwand und Berechtigungen gelten nun für den neuen Agenten. Mit ×, „Hier bleiben“, brichst du den Wechsel ab.
3. Schreibe eine Nachricht oder sende ohne weiteren Text, um fortzufahren.

Eine neue Sitzung öffnet sich im selben Ordner. Sie übernimmt deinen ersten Auftrag, danach die neuesten Nachrichten bis zu insgesamt etwa 15.000 Tokens sowie die geänderten Dateien. Der neue Agent erfährt, wo der vollständige Verlauf liegt, und kann ausgelassene Teile nachlesen. Seine erste Nachricht zeigt etwa „Von Claude Code übernommen“, mit **Diese Sitzung öffnen** und einer Schaltfläche für die übernommenen Nachrichten. In der alten Sitzung steht etwa „Diese Unterhaltung wurde in Codex fortgesetzt“ mit **Öffnen**. Das funktioniert aus Claude-Code- und Codex-Sitzungen heraus.

## Die Unterhaltung verdichten

Beim Verdichten wird der bisherige Verlauf durch eine Zusammenfassung ersetzt. Das schafft im Kontext des Modells Platz für das, was als Nächstes kommt. Wähle im Menü der Sitzung (⋯) → **Mehr** → **Unterhaltung verdichten** oder klicke im Nachrichtenfeld auf die Kontextanzeige und bestätige mit **Verdichten**. Das funktioniert bei Claude Code und Codex, zwischen den Durchläufen. Custom verdichtet eine lange Unterhaltung von selbst.

## Umbenennen, anheften, zurückstellen, abschließen, archivieren oder löschen

Die meisten davon stehen im Menü der Sitzung (⋯) und im Menü ihrer Zeile in der Seitenleiste: Fahre über die Zeile und klicke an ihrem Ende auf **⋯**, oder klicke sie mit der rechten Maustaste an (auf dem Smartphone tippst du auf ihr **⋯**).

- **Umbenennen**: Gib einen Titel mit bis zu 200 Zeichen ein. Enter speichert, Esc bricht ab. Dasselbe geht per Doppelklick auf den Titel im Kopf oder in der Seitenleiste beziehungsweise mit F2 auf einer ausgewählten Zeile.
- **Ordner umbenennen** in der Seitenleiste bei Sitzungen außerhalb eines Projekts: Vergib einen eigenen Anzeigenamen für den Arbeitsordner. Seitenleiste, Sitzungszeilen und Ordnermenüs verwenden ihn auf allen Geräten; der Ordnername auf dem Datenträger bleibt erhalten. Ein leeres Feld stellt den ursprünglichen Namen wieder her.
- **Oben anheften** und **Lösen**: Angeheftete Sitzungen bleiben unter **Angepinnt** in der per Ziehen gewählten Reihenfolge. Du kannst auch Sitzungen aus Projekt-, Ordner-, Heute- oder Gestern-Gruppen dorthin ziehen. Ist noch nichts angeheftet, nutze „Zum Anheften hier ablegen“.
- **Zurückstellen**: Verbirgt die Sitzung unten in der Gruppe **Zurückgestellt**, und zwar bis **Eine Stunde lang**, **Für 3 Stunden**, **Heute Abend** (solange es vor 17 Uhr ist), **Morgen früh**, **Nächste Woche** (Montagmorgen) oder **Datum und Uhrzeit auswählen**. Sie kommt von selbst mit einem Hinweis zurück oder früher, wenn sie dich braucht. **Zurückstellen aufheben** holt sie sofort zurück.
- **Abschließen: vorerst erledigt**: für fertige Arbeit. Der Agent wird gestoppt, sofern kein Durchlauf aktiv ist, und die Sitzung als gelesen markiert. Verlauf und Worktree bleiben erhalten. Bei einer Sitzung im Worktree öffnet sich dessen Dialog, damit du ihn entfernen kannst.
- **Archivieren** und **Aus Archiv holen**: Entfernt die Sitzung aus der Liste, ohne etwas zu löschen. Archivierte Sitzungen findest du über **Sitzungen suchen** in der Seitenleiste. Öffne sie und wähle **Aus Archiv holen** im Menü.
- **Sitzung löschen**: Löscht nach Bestätigung den Verlauf vom Datenträger. Die Sitzung verschwindet damit auch aus der Befehlszeile des Agenten und aus VS Code. Das lässt sich nicht rückgängig machen. **Löschen** im Menü der Seitenleistenzeile hat dieselbe Wirkung.

Bis zum Löschen behält die App jede Sitzung, selbst wenn das Agentenprogramm seinen eigenen Unterhaltungsverlauf löscht. Claude Code tut dies standardmäßig nach 30 Tagen. Die Sitzung wird wiederhergestellt und bleibt auffindbar und lesbar. Ein Jahr lang unbenutzte Sitzungen werden automatisch gelöscht, sofern du sie nicht anheftest oder das unter Einstellungen → Allgemein änderst. Siehe [Inaktive Sitzungen löschen](/guide/app#delete-inactive-sessions).

Anheften, Lösen, Archivieren, Wiederherstellen und Zurückstellen zeigen einen Hinweis mit **Rückgängig machen**. Strg+Z macht die Aktion innerhalb von acht Sekunden rückgängig.

## Einen Leselink teilen

**⋯ → Schreibgeschützten Link teilen** erstellt einen Link, den andere ohne dein Passwort öffnen können. Bei [vertraulichen Sitzungen](#keep-a-session-confidential) ist das nicht verfügbar. Andere sehen die Unterhaltung live mit Nachrichten, Schrittnamen, Dateiänderungen und angezeigten Seiten, jedoch ohne Befehlsausgaben und Überlegungen des Agenten. Sie können nichts schreiben oder ändern. Wähle **Ein Tag**, **Eine Woche**, **Einen Monat** oder **Bis zur Deaktivierung** und klicke auf **Link erstellen**. Der Link wird einmal angezeigt. Derselbe Dialog listet aktive Links mit Aufrufzahl und einer Möglichkeit zur Deaktivierung. Siehe [Smartphones, andere Computer und Freigaben](/guide/devices).

## Eine Unterhaltung exportieren

Über **⋯ → Exportieren** übernimmst du die Unterhaltung in andere Formate:

- **Als Markdown exportieren** lädt eine nach dem Sitzungstitel benannte Markdown-Datei herunter, die du aufbewahren, versenden oder in einer Notiz-App öffnen kannst.
- **Als Markdown kopieren** legt denselben Text in die Zwischenablage, zum Einfügen in Notizen, E-Mails oder andere Apps.
- **Als Dokument in der Bibliothek speichern** erstellt im Projekt der Sitzung ein Dokument in der [Bibliothek](/guide/library). Dort kannst du es lesen, bearbeiten, kommentieren, drucken und als Word oder PDF exportieren. Sobald es bereit ist, erscheint ein Hinweis mit **Öffnen**.

Der Export enthält Titel und Datum sowie deine Nachrichten und Agentenantworten in zeitlicher Reihenfolge mit Zeitangaben. Statt der einzelnen Arbeitsschritte steht eine Zeile wie „2 Min. gearbeitet · 5 Schritte“. Übergebene Dateien werden namentlich aufgeführt. Antwortkarten werden zu lesbarem Text, Tabellen bleiben Tabellen, etwa Vergleiche, Datentabellen oder die Zahlen eines Diagramms. Diagramme bleiben als Mermaid-Code und Formeln als LaTeX erhalten. Im Bibliotheksdokument erscheinen auch deine angehängten und die vom Agenten übergebenen Bilder.

Auch [vertrauliche Sitzungen](#keep-a-session-confidential) lassen sich exportieren. Das Dokument bleibt wie ihre übrige Arbeit auf diesem Computer; Webbilder bleiben Links und werden nicht abgerufen. Im Terminal erledigt `hydor sessions export` dasselbe. Siehe [Hydor im Terminal](/guide/terminal).

## In einem Worktree arbeiten

Ein Worktree ist eine separate Dateikopie eines Repositorys auf einem neuen Branch. Der Agent kann dort arbeiten, ohne deinen ursprünglichen Arbeitsstand zu verändern. So können auch mehrere Agenten gleichzeitig am selben Repository arbeiten.

- **Starten**: Öffne auf der Startseite **Ordner** und aktiviere **Neuer Worktree von …**. Der Ordner muss in einem Git-Repository liegen. Die App erstellt vom ausgecheckten Branch einen neuen Branch mit dem Präfix `agent/` und einigen Worten deines Auftrags sowie einen Ordner im App-Datenverzeichnis. Die Auswahl bleibt für das nächste Mal gespeichert.
- **Snapshots**: Bei jeder gesendeten Nachricht speichert die App im Worktree einen Dateisnapshot, damit [Von hier aus bearbeiten](#edit-from-here) den Zustand wiederherstellen kann.
- **Ansehen**: das Menü der Sitzung (⋯) → **Ordner und Code** → **Worktree: agent/…** zeigt den Branch und den, von dem er abstammt, seinen Ordner, um wie viele Commits er voraus oder zurück ist und nicht committete Änderungen, mit **Änderungen prüfen** und **In Git öffnen**.
- **Entfernen**: Wähle nach Abschluss der Arbeit im selben Dialog **Worktree entfernen**. Der Ordner wird entfernt, der Sitzungsverlauf bleibt erhalten. Der Branch bleibt ebenfalls, sodass committete Arbeit erhalten bleibt, außer du aktivierst **Branch … ebenfalls löschen**. Ein Branch ohne eigene neue Änderungen wird ohnehin entfernt. Bei nicht committeten Änderungen musst du zuerst **Die … nicht committeten Änderungen verwerfen** aktivieren. Ein laufender Agent wird gestoppt. Abzweigungen und bearbeitete Unterhaltungskopien, die denselben Worktree verwenden, verlieren ihn ebenfalls.

## Einen Pull-Request öffnen

Vom Branch einer Sitzung aus öffnet das Menü der Sitzung (⋯) → **Ordner und Code** → **Pull-Request öffnen** einen Pull-Request auf GitHub oder Gitea. **Für mich schreiben** entwirft Titel und Beschreibung aus den Commits und dem Diff; über ein Kontrollkästchen kannst du nicht committete Änderungen zuerst committen lassen; **Entwurf** markiert ihn als Entwurf; der Branch wird gepusht, wenn du auf **Pull-Request öffnen** klickst. Du brauchst ein Konto unter [Einstellungen → Versionsverwaltung](/settings?s=scm). **Vorhandenen Pull-Request verknüpfen …** verknüpft einen, der anderswo geöffnet wurde.

Nach der Verknüpfung erscheinen Status und Prüfungen in der Seitenleiste und im Sitzungskopf. Die Anzeige aktualisiert sich alle paar Minuten; beim Zusammenführen oder nach Abschluss der Prüfungen erscheint ein Hinweis. Der Menüeintrag heißt nun etwa **Pull-Request #12** und enthält **Auf GitHub öffnen** beziehungsweise Gitea, **Änderungen prüfen**, **Jetzt prüfen** und **Verknüpfung aufheben**. **Änderungen prüfen** geht die Branch-Änderungen Datei für Datei durch. Siehe [System: Dateien, Git, Terminal und Vorschau](/guide/files-git).

## Wenn ein Nutzungslimit die Sitzung stoppt

Ist das Nutzungskontingent eines Claude-Code- oder Codex-Abos aufgebraucht, nennt ein Hinweis über dem Nachrichtenfeld das betroffene Konto, das Limit und den Zeitpunkt der Freigabe. Bei einem Konto steht etwa „Du hast das Nutzungslimit von Claude Code erreicht“. Sind bei mehreren Konten alle ausgeschöpft, steht „Alle deine Claude-Code-Konten haben ihr Nutzungslimit erreicht“. Hat ein anderes Konto noch Kontingent, wird das betroffene Konto namentlich genannt, etwa „Arbeit hat sein Nutzungslimit erreicht“.

Ist **Bei erreichtem Limit das Konto wechseln** aktiviert und hat ein anderes Konto desselben Agenten noch Kontingent, erscheint kein Hinweis. Die Sitzung wechselt dorthin und arbeitet weiter; neue Sitzungen starten ebenfalls damit. Ist der automatische Wechsel deaktiviert, nennt der Hinweis das andere Konto und bietet **Aktivieren** an.

- **Beim Zurücksetzen fortsetzen** führt die Sitzung eine Minute nach der Rücksetzung mit „Mach dort weiter, wo du aufgehört hast“ fort. Der Hinweis nennt den Zeitpunkt und bietet **Abbrechen**.
- **Reset verwenden**: Hat dein Konto verfügbare Resets für das Nutzungslimit, nennt der Hinweis ihre Anzahl. Diese Schaltfläche verwendet sofort einen davon.
- [Nach Nutzungslimits fortsetzen](/settings?s=general&find=Resume%20after%20usage%20limits) unter Einstellungen → App → Allgemein aktiviert das Verhalten für jede durch ein Limit gestoppte Sitzung. Statt einer Warnung zeigt eine Zeile über dem Nachrichtenfeld das betroffene Konto beziehungsweise alle betroffenen Konten, das Limit und die Fortsetzungszeit, etwa „Alle deine Claude-Code-Konten haben ihr Nutzungslimit erreicht“ und „Aktuelle Sitzung (5 Std.) · Wird in 3 Std. 15 Min. automatisch fortgesetzt“. Bei verfügbaren Resets gibt es **Reset verwenden**, außerdem **Abbrechen**. Eine von dir mit **Stoppen** angehaltene Sitzung wird nicht automatisch fortgesetzt.

Der Zeitpunkt folgt dem Limit: Verschiebt sich die Rücksetzung oder ist früher wieder Kontingent verfügbar, setzt die Sitzung sich entsprechend fort. Siehe [Nutzung, Limits und Kosten](/guide/usage).

## Sitzungen in VS Code oder einem Terminal

Alle Claude-Code- und Codex-Sitzungen auf diesem Computer erscheinen in der Liste, auch Sitzungen aus VS Code, einem Terminal oder der Claude-Desktop-App. Während sie dort laufen, steht etwa „Arbeitet in VS Code“, „Benötigt dich im Terminal“ oder bei geöffneten, inaktiven Sitzungen mit grauem Punkt „In VS Code geöffnet“. Du kannst die Arbeit mitlesen. Wartet eine externe Sitzung auf dich, informiert dich die App erst, wenn sie nach einer Minute noch wartet.

- **Eine Claude-Code-Sitzung übernehmen**: Klicke im Kopf auf **Hier fortsetzen** oder sende eine Nachricht im Feld „In VS Code geöffnet – Senden übernimmt die Sitzung hierher“. Nach Rückfrage beendet die App die Sitzung im anderen Programm samt laufender Arbeit und setzt sie hier mit dem gesamten Verlauf fort. Dort erscheint sie als beendet; später kannst du sie wieder dort öffnen.
- **Codex-Sitzungen**, die anderswo geöffnet sind, sind hier nur lesbar, weil ein dortiger Codex-Prozess alle seine Threads bedient. Setze sie dort fort oder schließe sie dort und starte sie anschließend hier erneut.
- Abzweigen ist nicht verfügbar, solange die Sitzung in einer anderen App geöffnet ist.

## Subagenten

Ein Agent kann Teilaufgaben an Subagenten übergeben und ihre Ergebnisse zurückerhalten. Die App unterscheidet zwei Arten:

- Ein **Hydor-Subagent** ist eine eigene, von Hydor gestartete Sitzung mit beliebigem Agentenprogramm und Modell. Er erscheint als Karte in der übergeordneten Unterhaltung und darunter in der Seitenleiste. Du kannst seine Sitzung öffnen und mit ihm schreiben. Er hat eigene Kosten und einen eigenen Anteil am Ausgabenlimit der übergeordneten Sitzung. Seine Antwort geht als Nachricht an den übergeordneten Agenten zurück.
- Ein **Claude-Code-Subagent** (bei Codex ein „Codex-Subagent“: so heißt das eigene Programm der Sitzung) ist einer, den dieses Programm innerhalb der Sitzung für einen kurzen Teil seiner Arbeit ausführt. Er wird wie ein Hydor-Subagent angezeigt und geöffnet: als Karte in der Unterhaltung, als Zeile in der Seitenleiste und in der Ablage und mit einer eigenen Seite für seine ganze Unterhaltung. Aber du kannst nicht mit ihm schreiben (der übergeordnete Agent kann es), was er verbraucht, zählt zur übergeordneten Sitzung, und er hat keinen Anteil an einem Ausgabenlimit.

In der Seitenleiste sind Subagenten unter ihrer übergeordneten Sitzung eingeklappt, die von Hydor und die des Programms zusammen in einer Zeile („3 Subagenten · 1 benötigt dich · 2 in Arbeit“, „5 Subagenten · 1 in Arbeit“). Ein Klick zeigt für jeden eine Zeile. Während du eine dieser Sitzungen ansiehst, bleibt die Gruppe geöffnet. Schwarm- und Kampagnenmitglieder werden entsprechend bezeichnet. In der übergeordneten Unterhaltung hat jeder Subagent unter dem Durchlauf, der ihn gestartet hat, eine Karte mit Aufgabe und Link zur Sitzung. Die Karte eines Hydor-Subagenten zeigt Agent und Modell, was er gerade tut und was er gekostet hat. Die eines Claude-Code- oder Codex-Subagenten zeigt das Symbol des Programms (es dreht sich während der Arbeit) mit einem Statuspunkt, den Titel (was er tun sollte), was er ist („Claude Code Subagent · Explore · Sonnet 5.5“: seine Art unter den Agenten des Programms und sein Modell, wenn bekannt), seinen Stand („Arbeitet · 2m 10s“, „Vor 3 Min. abgeschlossen“, „Gestoppt“, „Fehlgeschlagen“), **Öffnen** und, solange ein Claude-Code-Subagent arbeitet, eine Stoppschaltfläche, die zuerst nachfragt („Diesen Subagenten stoppen?“). Der Aufruf, der ihn gestartet hat, bleibt ein Schritt in der eingeklappten Arbeit des Durchlaufs. Ein Codex-Subagent lässt sich hier nicht einzeln stoppen.

Kommt ein Subagent zurück, der im Hintergrund gearbeitet hat, zeigt die übergeordnete Unterhaltung eine Zeile: „Antwort von“ und sein Titel, oder „… wurde gestoppt“, oder „… mit einem Fehler gestoppt“, mit dem Anfang seiner Antwort. Ein Klick zeigt die Antwort, **Sitzung öffnen** führt zu ihm. Die Antwort eines Codex-Subagenten wird aus seiner eigenen Unterhaltung geholt, wenn du die Zeile öffnest. Eine Antwort, die kam, während die übergeordnete Sitzung noch arbeitete, steht an ihrer Stelle zwischen den Schritten davor und danach.

In einem Hydor-Subagenten nennt eine Leiste über dem Nachrichtenfeld „Subagent von“ und den übergeordneten Titel, ergänzt um „Antworten gehen dorthin zurück“ und **Übergeordnete Sitzung öffnen**. Ein Claude-Code- oder Codex-Subagent öffnet sich ebenfalls als Sitzung, aber nur zum Lesen: Sie zeigt die Aufgabe, die er bekam, seine Schritte und seine Antwort, live während der Arbeit, ohne Nachrichtenfeld und ohne **Fortsetzen** oder Sitzungsmenü. Anstelle des Nachrichtenfelds steht eine Leiste mit „Claude Code Subagent von“ und dem übergeordneten Titel („Antworten gehen dorthin zurück“) samt **Übergeordnete Sitzung öffnen**. Solange ein Claude-Code-Subagent arbeitet, stoppt **Stoppen** in seiner Kopfzeile ihn, nach Rückfrage. Ihm zu schreiben, ihn fortzusetzen, zu verzweigen, zu übergeben oder zu löschen wird abgelehnt: Sein Programm führt ihn innerhalb der Sitzung der übergeordneten Sitzung aus, schreibe also dieser.

Ist der eigene Durchlauf der Leitung beendet, aber laufen noch Subagenten, gilt die Sitzung weiterhin als aktiv: Der Punkt pulsiert blau, der Ring am Stoppen-Knopf dreht sich, der Status lautet etwa „In Arbeit · 2 Subagenten laufen“, es erscheint keine Abschlussmarkierung und die Sitzung bleibt unter Aktiv. Du kannst ihr weiterhin schreiben. Das gilt für eine Claude-Code- wie für eine Codex-Sitzung. Auch ein Hydor-Subagent zählt als laufend, solange nach seinem eigenen Durchlauf noch Subagenten oder Hintergrundaufgaben laufen, die er gestartet hat (ein Befehl, eine Überwachung); seine übergeordnete Sitzung zeigt dann „In Arbeit“, nicht „Fertig“. Das Ausgabenlimit der übergeordneten Sitzung umfasst ihre Hydor-Subagenten; was ein Claude-Code- oder Codex-Subagent verbraucht, ist schon ihr eigener Verbrauch. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).

Eine Zeile über dem Nachrichtenfeld fasst alles zusammen, was die Sitzung gestartet hat: Subagenten und Hintergrundaufgaben wie Befehle, Überwachungen und Arbeitsablaufs. Dort steht etwa „2 Subagenten und 1 Hintergrundaufgabe laufen“, bei einer wartenden Hydor-Sitzung gelb ergänzt um „1 benötigt dich“, oder „3 Subagenten · 2 Hintergrundaufgaben · alle abgeschlossen“. Beim Öffnen der Sitzung ist die Übersicht eingeklappt. Ein Klick zeigt zuerst Aufgaben mit Rückfrage, danach laufende und zuletzt beendete Aufgaben, innerhalb der Gruppen neueste zuerst. Ab etwa fünf Einträgen scrollt die Liste intern. Jede Zeile enthält Symbol und Statuspunkt, Titel, Art wie „Hydor-Subagent · Claude Code · Sonnet 5.5“, „Claude Code Subagent · Explore · Haiku 5.5“, „Befehl“, „Überwachung“ oder „Arbeitsablauf“, den Status wie „In Arbeit · 2 Min. 10 Sek.“, „Benötigt dich“, „Vor 3 Min. abgeschlossen“, „Gestoppt“ oder „Fehlgeschlagen“, bei Hydor-Subagenten die Kosten (ein Programm-Subagent zeigt keine: was er verbraucht, zählt zur übergeordneten Sitzung) sowie **Öffnen** und während der Ausführung eine Stoppschaltfläche. Ein Hinweis zur Art erklärt die Zuständigkeit: „Hydor hat ihn als eigene Sitzung gestartet: Öffne sie, um mitzuverfolgen oder zu schreiben“ oder „Claude Code führt ihn innerhalb dieser Sitzung aus: Öffne ihn, um zuzusehen“. **Öffnen** führt zur Sitzung eines Hydor-, Claude-Code- oder Codex-Subagenten. Ein Befehl, eine Überwachung oder ein Arbeitsablauf öffnet dagegen einen Bereich rechts über der Seite, auf dem Smartphone bildschirmfüllend, mit Titel, Art, Status und bei laufender Arbeit **Stoppen**. Darunter steht seine Ausgabe. Die Anzeige aktualisiert sich alle zwei Sekunden und folgt den neuesten Zeilen, solange du nicht hochscrollst. Die Stoppschaltfläche heißt je nach Eintrag „Diesen Subagenten stoppen“ oder „Diese Aufgabe stoppen“. **Alle stoppen** rechts an der Übersichtszeile beendet wie der Stoppen-Knopf am Nachrichtenfeld alle laufenden Aufgaben. Schwarm- und Kampagnenmitglieder stehen stattdessen auf ihrem Board. Beendete Aufgaben bleiben bis zum Stoppen des Agentenprogramms sichtbar. Extern in VS Code oder einem Terminal geöffnete Sitzungen zeigen ihre Aufgaben, können sie hier aber nicht stoppen.

Wie viele Hydor-Subagenten eine Sitzung gleichzeitig ausführen darf, stellst du unter [Einstellungen → Funktionen → Subagenten](/settings?s=children) ein. Diese Einstellungen gelten nur für Hydor-Subagenten; die eigenen Subagenten von Claude Code und Codex laufen innerhalb ihrer Sitzung. Ist unter Einstellungen → Modelle → Modellstufen [Mit Subagenten arbeiten](/settings?s=models&find=Lead%20with%20subagents) aktiviert, plant der Hauptagent, übergibt klare Teilaufgaben an günstigere Modellstufen und prüft deren Ergebnisse.

## Das gesamte Sitzungsmenü

Die Schaltfläche ⋯ oben rechts in einer Sitzung öffnet ihr Menü. Manche Einträge erscheinen nur, wenn sie zutreffen; das Menü einer [vertraulichen Sitzung](#keep-a-session-confidential) hat kein **Schreibgeschützten Link teilen**, kein **Pull-Request öffnen**, kein **Browser öffnen**, keine **Verbundene Konten**, kein **In Automatisierung umwandeln** und kein **Als App speichern**, und ihr Memory bleibt aus.

- **Umbenennen**: den Titel direkt bearbeiten.
- **Oben anheften** oder **Lösen**.
- **Zurückstellen** mit Zeitenauswahl oder **Zurückholen (zurück um …)** bei zurückgestellten Sitzungen.
- **Abschließen: vorerst erledigt**: stoppt den Agenten und markiert die Sitzung als gelesen, sofern kein Durchlauf aktiv ist.
- **Verzweigen**: neue Sitzung aus dieser Unterhaltung, für Claude Code, Codex und Custom.
- **In Codex fortsetzen**, **In Claude Code fortsetzen**, **Im Custom-Agenten fortsetzen**: Übergabe aus Claude-Code- oder Codex-Sitzungen an ein anderes Programm.
- **Ziel setzen**: bis zur Erfüllung einer Bedingung weiterarbeiten, bei Claude Code, Codex und Custom, sofern noch kein Ziel besteht.
- **Zweitmeinung**: Ein Modell eines anderen Anbieters prüft die Arbeit eines Durchlaufs gegen deinen Auftrag. Die Ergebnisse erscheinen darunter. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).
- **Schreibgeschützten Link teilen**.
- **Exportieren** mit **Als Markdown exportieren**, **Als Markdown kopieren** und **Als Dokument in der Bibliothek speichern**. Siehe [Eine Unterhaltung exportieren](#export-a-conversation).
- **Ordner und Code** (ein Untermenü, für Sitzungen mit einem Ordner):
  - **Änderungen prüfen**: Branch-Änderungen Datei für Datei ansehen.
  - **Pull-Request öffnen** oder nach der Verknüpfung etwa **Pull-Request #12**.
  - **Worktree: agent/…**: Worktree-Dialog bei entsprechenden Sitzungen.
  - **Ordner durchsuchen**: öffnet Dateien im Sitzungsordner.
  - **Hier ein Terminal öffnen**: neues Terminal im Arbeitsordner, am Computer im unteren Bereich, auf dem Smartphone auf der Terminal-Seite.
- **Sitzungseinstellungen**:
  - **Memory** mit **Ein** oder **Aus**: aktiviert oder deaktiviert Memory für diese Sitzung. „Für alle aus“ bedeutet, dass Memory in den Einstellungen deaktiviert ist. Siehe [Memory](/guide/memory).
  - **Ausgabenlimit** samt aktuellem Betrag: festlegen, ändern oder erhöhen. Siehe [Nutzung, Limits und Kosten](/guide/usage).
  - **Verbundene Konten**: Konten nur für diese Sitzung aktivieren oder deaktivieren. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).
  - **Schwarm** mit **Aus**, **Ein** oder **Kampagne**: öffnet einen Dialog zum Aktivieren oder Deaktivieren ab der nächsten Nachricht. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research#set-a-swarm-on-a-hard-problem).
  - **Tiefgehende Recherche** mit **Aus** oder der Zahl der Suchen: öffnet einen Dialog zum Aktivieren, Deaktivieren oder Ändern ab der nächsten Nachricht. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research#turn-it-on). Schwarm und Tiefgehende Recherche erscheinen weder bei vertraulichen Sitzungen noch bei Sitzungen, die von einer anderen Sitzung gestartet wurden.
  - **Agent** samt Name: öffnet bei zugeordnetem Agenten dessen Seite. Wechseln kannst du ihn im Nachrichtenfeld.
- **Mehr**:
  - **Browser öffnen** oder **Browser anzeigen**: öffnet den Agentenbrowser dieser Sitzung, den du beobachten und übernehmen kannst. Siehe [Suche und Browser](/guide/web).
  - **In Automatisierung umwandeln**: Das Hilfsmodell liest die Sitzung und entwirft eine geplante Aufgabe. Passe sie an, prüfe sie mit einem Testlauf und speichere sie. Siehe [Geplante Aufgaben](/guide/tasks).
  - **Als App speichern**: erstellt aus der Sitzung eine neue App. Siehe [Apps](/guide/apps).
  - **Unterhaltung verdichten** bei Claude Code und Codex.
  - **CLI-Befehl zum Fortsetzen kopieren**: kopiert den Befehl zum Fortsetzen im Terminal.
  - **Agentenprozess stoppen**, wenn das Programm läuft, aber kein Durchlauf aktiv ist.
- **Archivieren** oder **Aus Archiv holen**.
- **Sitzung löschen**: entfernt nach Bestätigung den Verlauf vom Datenträger.

## Einen Agenten fragen

- „Starte in ~/code/blog eine Claude-Code-Sitzung mit neuem Worktree, die einen RSS-Feed ergänzt, und begrenze die Kosten auf 5 $.“
- „Welche Sitzungen sind seit heute Morgen fertig geworden? Schließe erledigte Sitzungen ab und archiviere die aus der letzten Woche.“
- „Warum steht diese Sitzung auf Fehlgeschlagen, und welche Nachricht sollte ich für einen neuen Versuch senden?“
- „Was hat der letzte Durchlauf gekostet, und welcher Anteil entfiel auf den Cache?“
- „Stelle die Sitzung zu den Steuerformularen bis Montag um 9 Uhr zurück.“
- „Lege das gerade gezeigte Umsatzdiagramm und die Kennzahlen auf meinem Board Geschäft ab.“
- „Gib der Sitzung ‚Upload reparieren‘ das Ziel: npm test läuft erfolgreich durch und Uploads mit 2 GB funktionieren.“
- „Zweige die Sitzung zu den Versionshinweisen ab und probiere eine kürzere Fassung.“
- „Schalte die Sitzung ‚Datenbereinigung‘ auf Änderungen erlauben und sende: Mach mit der nächsten Datei weiter.“
- „Sende diese Korrektur in meine laufende Custom-Sitzung. Wenn sie noch vor dem Update gestartet wurde, stelle die Nachricht bis zum Ende des Durchlaufs in die Warteschlange.“
- „Was bedeutet der rotierende Ring auf Stoppen?“
- „Stoppe alles, was diese Sitzung gestartet hat: Subagenten und Hintergrundaufgaben.“
- „Was zeigt die Zeile mit Subagenten und Hintergrundaufgaben über dem Nachrichtenfeld?“
- „Welche dieser Subagenten hat Hydor gestartet und welche Claude Code?“
- „Öffne den Claude-Code-Subagenten, der die Tests geschrieben hat.“
- „Erkläre die Funktionsweise einer Wärmepumpe mit einem Kreislaufdiagramm und einem Bild.“
- „Vergleiche die drei E-Reader in einer Tabelle und empfehle mir einen.“
- „Speichere unser Unterhaltung über E-Bikes als Dokument in meiner Bibliothek.“
- „Zeige die besten Ramen-Restaurants in der Nähe des Bahnhofs Shibuya auf einer Karte.“
- „Frag mich mit fünf Fragen zur Französischen Revolution ab.“
- „Gib mir Übungsaufgaben zu quadratischen Gleichungen mit Hinweisen.“
- „Markiere nötige Korrekturen in meinem Aufsatz und gib mir die korrigierte Fassung.“
- „Prüfe diese fünf Aussagen aus dem Artikel auf ihre Richtigkeit.“
- „Lass mich diesen Python-Code ausprobieren und verändern.“
- „Welche meiner Modelle eignen sich für eine vertrauliche Sitzung, und welches würde verwendet?“
- „Starte eine vertrauliche Sitzung in ~/reviews/4711 und begutachte die dortige Arbeit für ICLR.“
- „Warum kann meine vertrauliche Sitzung nicht im Web suchen, und was funktioniert weiterhin?“
- „Zeige mit Formeln und einem Zahlenbeispiel, warum sich Attention-Gewichte zu 1 addieren.“
- „Zeige das Blatt Umsatz meiner Tabelle Geschäftszahlen als Monatsdiagramm mit einer Linie pro Region und halte es aktuell.“
- „Warum hat meine neue Sitzung gefragt, ob zuerst das Memory des Projekts erstellt werden soll, und was passiert bei Jetzt starten?“
