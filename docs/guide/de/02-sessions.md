# Sitzungen

Eine Sitzung ist eine Unterhaltung mit einem Agenten in einem Ordner: Du sagst, was du möchtest, der Agent arbeitet, und du verfolgst mit, genehmigst, was er tun will, und steuerst ihn. Dieses Thema behandelt alles rund um Sitzungen: die Startseite und ihre Optionen, was du siehst, während ein Agent arbeitet, wie du ihm mitten in einer Runde Nachrichten schickst und alles im Menü einer Sitzung, vom Verzweigen über Ziele bis zu Worktrees und dem Teilen.

![Eine Sitzung bei der Arbeit: die Schritte und Antworten des Agenten sowie eine Karte, die darum bittet, einen Befehl auszuführen](images/sessions.webp)

## Eine Sitzung starten

**Neue Sitzung** oben in der Seitenleiste öffnet die Startseite. Schreib in das Nachrichtenfeld, was erledigt werden soll, prüfe die Auswahlreihe darunter und drücke Enter (oder **Starten**; auf dem Handy den runden Pfeil). Die Seite der Sitzung öffnet sich sofort, mit deiner Nachricht und dem Agenten, der daran arbeitet (**Arbeitet**). Wenn die Sitzung nicht starten kann, steht auf ihrer Seite der Grund, und **Zurück zur Startseite** legt deine Nachricht (und alles, was du angehängt hast) zurück ins Feld.

Wenn die Verbindung abbricht, bevor die App antwortet (dein Handy ist in den Ruhezustand gegangen oder das Netzwerk hat gewechselt), zeigt die Seite **Verbindung wird wiederhergestellt…** und fragt die App, sobald es geht, was aus deiner Nachricht geworden ist: Die Sitzung öffnet sich, wenn sie gestartet wurde, und eine Sitzung startet nie doppelt. Bleibt die App etwa eine Minute lang unerreichbar, steht auf der Seite **Die App konnte nicht erreicht werden**; **Erneut versuchen** fragt noch einmal nach.

Kurz nach dem Start bekommt die Sitzung ihren Titel: ein paar Worte dazu, worum du gebeten hast („Wochenendtrip nach Lissabon“, „Die Checkout-Tests reparieren“). Das Hilfsmodell ([Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model)) schreibt ihn nebenbei, ohne dass in der Unterhaltung etwas zu sehen ist. Die Seitenleiste, die Kopfzeile der Sitzung und das Suchfeld zeigen ihn an (in der Seitenleiste erscheinen seine Wörter nacheinander anstelle derer deiner Nachricht), und auch Claude Code und Codex bekommen ihn für ihre eigenen Listen. Bis er da ist, und wenn das Hilfsmodell nicht antworten kann, steht der Anfang deiner Nachricht an seiner Stelle. Einen Titel, den du der Sitzung selbst mit **Umbenennen** gibst, wird nie ersetzt. Die Seitenleiste führt die Sitzung ab dem Moment auf, in dem du sie abschickst, ganz oben unter **Aktiv** (**Wird gestartet**).

Die Reihe unter dem Nachrichtenfeld enthält **Ausführungsumgebung**, **Modell**, **Ordner** (oder **Projekt**), **Agent** und am Ende **Optionen**. Auf dem Handy öffnet sich jede davon als Fenster vom unteren Bildschirmrand.

### Agent und Modell auswählen

**Ausführungsumgebung** listet alle Programme auf, die du nutzen kannst, nebeneinander:

- **Claude Code**: der Agent von Anthropic, mit einem Claude-Abo oder einem API-Key.
- **Codex**: der Agent von OpenAI, mit einem ChatGPT-Abo oder einem API-Key.
- **Custom**: der App-eigene Agent für jedes beliebige Modell: von OpenRouter, Ollama oder vLLM. Siehe [Custom, der App-eigene Agent](/guide/custom).
- Jeder andere Agent, den du hinzugefügt hast und der ACP spricht (Gemini CLI, OpenCode, Qwen Code, Goose …), mit seinem Befehl unter seinem Namen.

Ganz unten öffnet **Modelle für Custom** die [Einstellungen → Modelle](/settings?s=models) und **Agenten hinzufügen oder verwalten** die [Einstellungen → Weitere Agenten](/settings?s=agents). Siehe [Agenten, Konten und Modelle](/guide/agents-models).

**Modell** steht zunächst auf **Automatisch**: Die Sitzung startet mit dem Modell der Leistungsstufe „Am besten“, ihr Hauptagent gibt klar abgegrenzte Teile an Subagenten auf günstigeren Leistungsstufen ab, und sie kann selbst auf das Modell von Max wechseln, wenn sich ein Problem als zu schwer erweist (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Darunter listet das Menü nur die Modelle des gewählten Agenten. Der Standard des Agenten ist mit „Standard“ markiert. Ältere Versionen eines Modells verbergen sich hinter „2 ältere Modelle“; eine lange Liste hat ein Feld **Modelle suchen** (Enter wählt den ersten Treffer). Custom listet die Modelle auf, die du in den Einstellungen → Modelle hinzugefügt hast; ein anderer ACP-Agent listet die Modelle auf, die er beim letzten Lauf angeboten hat, und der Chip erscheint erst, nachdem er einmal gelaufen ist.

### Einen Ordner, ein Projekt oder einen neuen Aufgabenordner auswählen

Der Chip **Ordner** zeigt, wo der Agent arbeitet. Sein Menü („Projekt oder Ordner zum Arbeiten“) hat ein Feld, **Projekt oder Ordner suchen oder Pfad eingeben**, über zwei kurzen Listen, jede Zeile mit ihrem Ort:

- **Projekte**: deine Projekte nach Namen, die fünf zuletzt bearbeiteten (und das gewählte), jeweils mit ihrem Ordner. Wenn du eines wählst, werden für die Sitzung der Ordner des Projekts, sein Agent und seine Richtlinien übernommen; der Chip heißt dann **Projekt** und zeigt den Namen des Projekts. Eine Projektgruppe funktioniert genauso, mit allen ihren Projekten. **Neu** am Ende der Überschrift erstellt ein Projekt (Sitzungen, Dateien und Memory zusammen) und wählt es aus. Siehe [Projekte und Wissen](/guide/projects) und [Agentenrichtlinien](/guide/guidelines).
- **Ordner**: der verwendete Ordner und die drei Ordner, die du zuletzt gewählt hast, jeweils mit dem Ordner, in dem er liegt. **Durchsuchen** am Ende der Überschrift listet die Ordner in deinem Home-Ordner auf.
- **Neuer Aufgabenordner** („ein neuer in ~/Hydor“): ein frischer Ordner für diese Aufgabe, benannt nach dem Tag und ein paar Worten deiner Nachricht (etwa `2026-11-01-plan-trip-lisbon`), in `~/Hydor`, sofern du unter [Aufgabenordner](/settings?s=assistants&find=Task%20folders) (Einstellungen → Funktionen → Deine Agenten) keinen anderen Ort festgelegt hast.

Der eigene Ordner eines Projekts ist das Projekt: Das Menü listet ihn nur als Projekt auf, und eine Sitzung, die darin gestartet wird, arbeitet im Projekt, auch wenn auf der Startseite der Ordner statt des Projekts gewählt war.

Das Menü öffnet sich über oder unter dem Chip, wo mehr Platz ist, und passt ohne Scrollen hinein: In einem kleinen Fenster zeigt es weniger Ordner, dann weniger Projekte, und eine Zeile wie „2 weitere“ unter den Projekten holt den Rest zurück.

Tippe in das Feld, um mehr zu finden:

- Ein Name findet passende Projekte sowie Ordner unter den zuletzt verwendeten, im verwendeten Ordner und in deinem Home-Ordner. Der Ordner eines Projekts, der über seinen Namen gefunden wird, erscheint als Projekt.
- Ein Pfad (`~/code/` oder `code/` ab deinem Home-Ordner) listet die Ordner dort auf, so wie **Durchsuchen** es tut. Der Pfeil am Ende des Felds geht einen Ordner nach oben; das Kreuz oder Escape geht zurück zu den Listen.
- ↑ ↓ und Enter wählen aus. Tab oder der Pfeil am Ende einer Zeile listet die Ordner darin auf.

Liegt der Ordner in einem Git-Repository (und du hast keinen neuen Aufgabenordner gewählt), endet das Menü mit einem Schalter: **Neuer Worktree von main** (oder von dem Branch, der gerade ausgecheckt ist), „Ein neuer Branch, in einer Kopie von“ dem Repository. Ist er eingeschaltet, arbeitet die Sitzung in einer eigenen Kopie auf einem neuen Branch; der Chip heißt „· neuer Worktree“. Siehe [In einem Worktree arbeiten](#work-in-a-worktree).

Ob eine Sitzung standardmäßig einen neuen Aufgabenordner bekommt, hängt vom Agenten ab: Die meisten starten in einem, solange du keinen Ordner wählst; der Programmierer arbeitet im gewählten Ordner, und ein Agent eines Projekts in diesem Projekt.

### Einen Agenten auswählen

**Agent** legt fest, als wer die Sitzung arbeitet: **Allgemein** (bis du einen anderen wählst; in einem Projekt mit eigenem Agenten ist es dieser Agent), **Forscher**, **Schriftsteller**, **Programmierer**, **Nachnachhilfelehrer**, **Planer**, **Analyst**, **App builder** oder einer von dir unter **Eigene** (die, die überall funktionieren, und die des gewählten Projekts). Zeig mit dem Mauszeiger auf einen, um zu lesen, was er tut und welches Programm und Modell er verwendet. Die Auswahl kann auch das Programm, das Modell und die Berechtigungen festlegen, die er vorschlägt (das Modell seiner Leistungsstufe, wenn er mit einer denkt), und seine verbundenen Konten einschalten. **Agenten erstellen oder ändern** öffnet die [Agentenseite](/agents). Siehe [Agenten](/guide/agents).

### Optionen: Aufwand, Berechtigungen und mehr

**Optionen** enthält den Rest. Der Chip heißt „Optionen“ oder nennt, was du abweichend vom Üblichen eingestellt hast, etwa „Hoher Aufwand · Plan · 5,00 $ Limit“. Auf einem Computer endet das Menü mit einem Hinweis: Mit Umschalt+Tab im Nachrichtenfeld wechselst du die Berechtigungen.

- **Aufwand**: wie gründlich das Modell nachdenkt. **Standard** verwendet den eigenen Wert des Modells, dann folgen die Stufen, die das Modell anbietet: **Niedrig** (schnell, wenig Nachdenken), **Mittel** (ausgewogen), **Hoch** (gründlicheres Nachdenken), **Xhigh** (besonders gründliches Nachdenken), **Max** (maximales Nachdenken) und bei manchen Modellen **Minimal**, **Keine** oder **Ultra**. Custom bietet die Auswahl für ein [OpenRouter-Modell](/guide/agents-models#effort-for-openrouter-models), das nachdenkt (dort ist **Standard** gleich mittel), und für ein [Modell eines Endpunkts](/guide/agents-models#other-openai-compatible-endpoints), das nachdenkt (Niedrig, Mittel und Hoch oder die Stufen, die du dafür festlegst); andere ACP-Agenten bieten sie an, wenn sie Stufen auflisten, und Modelle ohne Stufen haben keine.
- **Berechtigungen**: was der Agent tun darf, ohne dich vorher zu fragen. Jeder Agent hat eigene Modi; siehe [Was die Berechtigungsmodi bedeuten](#what-each-permissions-mode-means). Mit Umschalt+Tab im Nachrichtenfeld wechselst du zum nächsten.
- **Konto**: nur, wenn du in den [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts) ein weiteres Konto für Claude Code oder Codex hinzugefügt hast. **Deine Anmeldung** ist das eigene Konto des Agenten; wähle ein anderes, um diese Sitzung damit auszuführen. **Konten verwalten** öffnet die Einstellungen.
- **Vertraulich**, ein Schalter mit einem Schloss („Nur Modelle auf diesem Computer. Nichts verlässt ihn.“): für ein Paper, das du begutachtest, für Patientendaten oder den Code eines Kunden. **Ausführungsumgebung** wird zu **Custom** und **Modell** zum besten hier installierten Modell. Siehe [Eine Sitzung vertraulich halten](#keep-a-session-confidential).
- **Memory**: nur, solange Memory in den Einstellungen eingeschaltet ist. **Ein** nutzt und ergänzt, was sich Agenten merken; **Für diese Sitzung deaktiviert** startet frisch und behält nichts davon. Siehe [Memory](/guide/memory).
- **Ausgabenlimit**: der höchste Betrag, den diese Sitzung ausgeben darf, zu API-Preisen. Gib einen Betrag ein und drücke **Set**, oder wähle 1 $, 5 $, 10 $ oder 25 $; **Keine Obergrenze** hebt es auf. Die Sitzung hält am Limit an, bis du es erhöhst. Siehe [Nutzung, Limits und Kosten](/guide/usage).
- **Schwarm**: **Aus**; **Schwarm**: Ein leitender Agent teilt die Aufgabe in Lösungsansätze auf und startet für jeden ein Mitglied, wobei so viele gleichzeitig arbeiten, wie **Schwarm-Größe** erlaubt ([Einstellungen → Funktionen → Subagenten](/settings?s=children&find=Swarm%20size)). Die Mitglieder teilen ihre Funde auf einem Board und schreiben einander Nachrichten. Für schwierige Probleme; es kostet ein Mehrfaches dessen, was ein einzelner Agent kostet. Oder **Kampagne** („Eine große Änderung in Teilen, jedes in einem Worktree“): Der Leiter teilt eine große Änderung in Teile auf, die Mitglieder erstellen jeweils eines auf einem eigenen Branch samt Tests, und der Leiter führt sie zusammen; der Ordner muss ein Git-Repository sein (siehe [Kampagnen](/guide/engineering#campaigns-a-big-change-in-many-parts)).
- **Forschung**: **Aus** oder **Tiefgehende Recherche**: Der Agent plant die Suchen, schickt Forscher zu jedem Teil, prüft zentrale Aussagen anhand von zwei Quellen und liefert einen Bericht mit Quellenangaben. Lege **Gleichzeitig aktive Forscher** (1 bis 8), **Runden** (1 bis 5), **Suchanfragen insgesamt** (10 bis 500) und **Der Bericht** (**Seite** oder **Word**) fest.
- **Ziel**: **Aus** („Der Agent arbeitet, bis er denkt, dass er fertig ist“) oder **Bis es fertig ist** (der Chip Optionen heißt dann „Zielmodus“) („Es arbeitet Runde um Runde, bis Prüfungen, denen du zustimmst, erfüllt sind“): Deine erste Nachricht ist das Ziel, der Agent überlegt sich zuerst, wie es sich prüfen lässt, und zeigt es dir, und nichts startet, bevor du zustimmst. Unter **Wie oft es dich fragt** wählst du, wie oft es nachfragt, welchen Weg es nehmen soll. Es funktioniert mit jedem Agenten, kostet viele Züge und hält an den Grenzen an, denen du zustimmst (Runden, Geld, Zeit). Siehe [Ziele](/guide/goals).
- **Arena**: **Aus** oder **Modelle vergleichen**: Dieselbe Nachricht geht auch an ein oder zwei weitere Modelle, die du ankreuzt (ein Feld **Modell suchen** hilft bei einer langen Liste), jedes in einer eigenen Sitzung im selben Ordner. Du vergleichst die Antworten und behältst die beste; die anderen werden archiviert. In einem Git-Repository schaltest du im Ordnermenü **Neuer Worktree** ein, damit jedes Modell in einer eigenen Kopie arbeitet.

Schwarm (oder eine Kampagne) und tiefgehende Recherche leiten beide Hydor-Subagenten, daher schaltet das Einschalten des einen das andere aus. Ein **Ziel** passt zu einem Schwarm (seine Leitung hat das Ziel: [Ein Ziel für einen Schwarm](/guide/goals#a-goal-for-a-swarm)), aber nicht zu einer Kampagne, tiefgehender Recherche oder der Arena: Das Einschalten von **Ziel** schaltet diese aus, das Einschalten eines davon schaltet das Ziel aus, und eine Sitzung, die eines davon leitet, kann kein Ziel haben (ihr Menü hat kein **Ziel setzen**). **Vertraulich** schaltet Schwarm, tiefgehende Recherche und die Arena aus, und das Einschalten eines davon schaltet Vertraulich aus (ein Ziel kann in einer vertraulichen Sitzung laufen). Schwarm, tiefgehende Recherche, die Arena und ein Ziel werden nicht für die nächste Sitzung gespeichert, da sie mehr kosten; die Forschungswerte und Arena-Modelle, die du gewählt hast, bleiben in diesem Browser erhalten, falls du sie wieder einschaltest. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).

### Was die Berechtigungsmodi bedeuten

**Claude Code**

| Modus | Was der Agent tun darf |
| --- | --- |
| Fragen (Standard) | Fragt vor Änderungen und Befehlen, die in seinen Einstellungen nicht erlaubt sind |
| Änderungen akzeptieren | Bearbeitet Dateien frei, fragt vor anderen Befehlen |
| Auto | Eine Sicherheitsprüfung genehmigt Routineaktionen und fragt dich bei riskanten |
| Plan | Liest und plant nur, schlägt dann einen Plan vor, den du genehmigst |
| Bypass | Fragt nie (voller Zugriff) |

**Codex**

| Modus | Was der Agent tun darf |
| --- | --- |
| Plan | Bespricht und plant zuerst; kann dir Rückfragen stellen |
| Nur lesen | Liest Dateien und antwortet; fragt, bevor er etwas ändert |
| Auto (Standard) | Bearbeitet Dateien und führt Befehle in seinem Ordner aus; fragt, bevor er darüber hinausgeht |
| Auto-Prüfung | Wie Auto, aber ein Prüf-Agent beantwortet seine Genehmigungsanfragen |
| Voller Zugriff | Keine Sandbox und keine Genehmigungen |

In Docker kann die eigene Sandbox von Codex nicht starten, daher ist dort **Voller Zugriff** der Standard, und das Menü nennt den Grund.

**Custom**

| Modus | Was der Agent tun darf |
| --- | --- |
| Fragen (Standard) | Fragt, bevor er Dateien bearbeitet und bevor er Befehle ausführt; sich umsehen darf er frei |
| Änderungen akzeptieren | Bearbeitet Dateien im Ordner frei, fragt vor dem Ausführen von Befehlen |
| Auto | Routineschritte laufen durch; eine schnelle Prüfung fragt dich bei riskanten |
| Voller Zugriff | Führt Werkzeuge und Befehle ohne Genehmigungsabfragen und ohne Befehls-Sandbox aus, mit den Rechten deines Computerkontos |
| Plan | Liest und plant nur: keine Änderungen, keine Befehle |

Außerhalb von Voller Zugriff fragt Custom dich vor riskanten Befehlen. In Fragen, Änderungen akzeptieren und Plan fragt es außerdem, bevor es Dateien außerhalb des Ordners liest oder ändert oder Dateien, die Keys oder Passwörter enthalten; in Auto beurteilt die schnelle Prüfung diese zuerst. Siehe [Custom, der App-eigene Agent](/guide/custom).

**Andere ACP-Agenten** bieten eigene Modi an, die aufgelistet werden, sobald der Agent gelaufen ist.

### Eine Sitzung vertraulich halten

Manche Arbeit darf deinen Computer nicht verlassen: ein Paper, das dir zur Begutachtung geschickt wurde (die meisten Konferenzen und Fachzeitschriften verbieten es, eine Einreichung an eine Online-KI zu geben), Patienten- oder Kundendaten oder der Code eines Unternehmens, an dem du unter Vertraulichkeitsvereinbarung arbeitest. Eine vertrauliche Sitzung läuft auf einem Modell auf diesem Computer, und nichts davon wird irgendwohin gesendet.

1. Öffne auf der Startseite **Optionen** und schalte **Vertraulich** ein („Nur Modelle auf diesem Computer. Nichts verlässt ihn.“). Der Chip heißt dann „Vertraulich“.
2. **Ausführungsumgebung** wird zu **Custom** und **Modell** zum besten hier installierten Modell; solange es eingeschaltet ist, bieten ihre Menüs nur diese an. Gibt es noch keines, steht das dort: [Einstellungen → Agenten → Modelle](/settings?s=models) installiert die für diesen Computer vorgeschlagenen mit einem Klick.
3. Schreib, was du möchtest, hänge das Paper an oder wähle seinen Ordner und drücke Enter. Zum Beispiel: „Begutachte die angehängte Einreichung als NeurIPS-Gutachter: Zusammenfassung, Stärken, Schwächen, Fragen an die Autoren und eine Bewertung.“

Modelle auf diesem Computer sind die von Ollama und vLLM hier sowie Endpunkte, deren Adresse dieser Computer oder dein privates Netzwerk ist: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` bis `172.31.…` oder ein Name, der auf `.local` endet (siehe [Ollama, vLLM oder einen anderen Endpunkt verbinden](/guide/agents-models#connect-ollama-vllm-or-another-endpoint)). Die Cloud-Modelle von Ollama, deren Namen auf „cloud“ enden, laufen auf ollama.com und zählen nicht. Die Startseite lässt den Schalter für deine nächsten Sitzungen eingeschaltet, bis du ihn ausschaltest.

Eine vertrauliche Sitzung hat neben ihrem Titel ein Schloss, in ihrer Kopfzeile und in der Seitenleiste, und ihr Nachrichtenfeld hat einen ruhigen grünen Rand; eine Zeile über dem Feld erklärt, was das bedeutet, bis du sie schließt. Klick auf das Schloss, um zu sehen, was ein- und was ausgeschaltet ist.

- **Aus**: Websuche und Webseiten, der Browser und dein Bildschirm, verbundene Apps und deine Keys, Apps, Veröffentlichen, Geplante Aufgaben, das Erstellen, Finden oder Bearbeiten von Bildern, Zeichnungen, Diagrammen, Videos oder Ton, Modelle andernorts (tiefgehende Recherche, Schwarm und die Arena; eine [Zweitmeinung](/guide/research) kommt nur von einem Modell eines anderen Herstellers auf diesem Computer), das Übergeben der Unterhaltung an einen anderen Agenten, das Speichern von irgendetwas im Memory und das Exportieren einer Seite als Datei (exportiere sie selbst von der Seite aus).
- **Befehle ohne Netzwerk**: Die Befehle des Agenten laufen in jedem Berechtigungsmodus vom Netzwerk abgeschnitten, sodass nichts heruntergeladen, aus dem Internet installiert, gepusht oder gesendet werden kann. Wo das nicht möglich ist (Windows, manche Container), fragt jeder Befehl dich vorher, egal in welchem Modus, und die Notiz am Schloss sagt es.
- **Weiterhin an**: die Dateien im Ordner, Dokumente (auf diesem Computer gelesen), die Seiten, Bilder und Dateien, die du aufbewahrt hast, Screenshots, die er dir aus Dateien zeigt, Gemeinsames Wissen, deine Memory-Notizen und dein Profil (gelesen, nie ergänzt), Hydor-Subagenten, die ebenfalls vertraulich sind, und Antwort-UIs (ohne Bilder oder Karten aus dem Web).
- **Nichts darüber wird nach außen gesendet**: Ihr Titel stammt vom Hilfsmodell, wenn es auf diesem Computer läuft, sonst aus den ersten Worten deiner Nachricht; Benachrichtigungen sagen nur „Eine vertrauliche Sitzung“ und ob sie fertig ist, dich braucht oder fehlgeschlagen ist; es gibt keinen schreibgeschützten Link, keinen Pull-Request aus ihrem Menü und keine Automatisierung oder App, die daraus erstellt wird; Agenten in anderen Sitzungen und Agenten anderswo können sie nicht lesen; ihre Antworten zeigen keine Bilder aus dem Web, und die Seiten, die sie zeigt, laden nirgendwoher etwas (ein Diagramm, das eine Bibliothek aus dem Web braucht, wird also nicht gezeichnet); Diktieren funktioniert nur mit Spracherkennung auf diesem Computer ([Einstellungen → Funktionen → Stimme](/settings?s=voice)), und Antworten werden nur mit einer Stimme auf deinem Gerät vorgelesen.
- **Sie bleibt vertraulich**: Abzweigungen und **Von hier aus bearbeiten** sind ebenfalls vertraulich, und es lässt sich nicht ausschalten, damit das Gesagte dort bleibt, wo es ist. Starte für Arbeit, die den Computer verlassen darf, eine neue Sitzung.

Was sie nicht versprechen kann: Hydor prüft, wo der Server eines Modells steht, nicht, was dieser Server tut. Ein Endpunkt, den du in deinem Netzwerk eingerichtet hast und der Anfragen an einen Onlinedienst weiterreicht, ist daher trotzdem online. Was du aus der Sitzung herauskopierst oder von anderswo selbst öffnest oder sendest (ein Link in einer Antwort, eine von ihr erstellte Seite, die aus den Dateien des Projekts geöffnet wird, ein Push von der Git-Seite), liegt in deiner Verantwortung, und das gilt auch für das, was du davon auf einem anderen Gerät liest: Die Seiten der App gelangen wie immer dorthin (durch deinen Tunnel, falls du einen verwendest).

### Dateien anhängen, auf Dateien verweisen, Befehle nutzen

- **Dateien anhängen** (das **+** links in der unteren Reihe des Felds), Dateien auf das Nachrichtenfeld ziehen oder Bilder und Dateien hineinkopieren. Eine Nachricht kann bis zu 25 MB an Dateien enthalten. Bilder (PNG, JPEG, GIF, WebP) gehen als Bilder ans Modell, bis zu 8 pro Nachricht; andere Dateien (bis zu 20) werden auf diesem Computer gespeichert und am Ende deiner Nachricht aufgelistet, damit der Agent sie öffnet. Entferne eine vor dem Senden mit ihrem ×. Angehängte Dateien warten im Feld, bis du sie sendest, auch wenn du zu einer anderen Seite wechselst (das Neuladen der Seite leert sie).
- **Screenshot anhängen** (im selben **+**-Menü, auf Computern; wo der Browser keinen aufnehmen kann, ist das **+** eine Büroklammer, die Dateien anhängt): Dein Browser fragt, welchen Bildschirm, welches Fenster oder welchen Tab, und ein Bild davon wird angehängt.
- **@**: Tippe @ und einen Teil eines Dateinamens, um passende Dateien im Ordner aufzulisten; mit ↑ ↓ bewegen, mit Enter oder Tab einfügen, mit Esc schließen.
- **/**: ganz am Anfang der Nachricht listet / die Befehle und Skills des Agenten auf (die von Claude Code), mit einer Beschreibung zu jedem.
- Das Mikrofon (Nachricht diktieren) und die Kopfhörer (freihändiger Sprachmodus) sitzen neben der Senden-Schaltfläche, wenn dein Browser oder dieser Computer Sprache erkennen kann. Siehe [Dokumente, Bilder, Videos und Stimme](/guide/documents-voice).

### Was sich die Startseite merkt

Die Startseite merkt sich ihre Auswahl für jeden Ort, an dem du arbeitest: jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**, auf jedem Gerät. Ein Ort behält seine **Ausführungsumgebung** (das Programm), das **Modell** jedes Programms und unter **Optionen** seinen **Aufwand** und die **Berechtigungen**, den **Agent**, **Memory**, das **Ausgabenlimit**, **Vertraulich** und den Schalter **Neuer Worktree**. Das Konto (**Optionen → Konto**) wird nicht pro Ort gemerkt: Es bleibt überall das, das du gewählt hast. Wenn du an einem Ort ein Programm wählst, kommt zurück, was du zuletzt dort damit verwendet hast.

Ein Ort behält seine Auswahl, sobald du dort etwas änderst oder eine Sitzung startest; bloßes Ansehen eines Ortes merkt sich nichts. Wähle einen Ort im Chip **Ordner** (ein Projekt, einen Ordner oder **Neuer Aufgabenordner**), und das Feld öffnet sich mit der Auswahl dieses Ortes, während das, was du geschrieben und angehängt hast, darin bleibt. Wenn du von einem Projekt aus startest (**Neue Sitzung** auf seiner Karte oder Seite oder das Projekt in der Seitenleiste), öffnet sich die Startseite mit der Auswahl dieses Projekts, und **Neue Sitzung in diesem Ordner** bei einem Ordner (in Dateien oder der Seitenleiste) öffnet sie mit der Auswahl dieses Ordners. Die Seite öffnet sich an dem Ort, den du zuletzt gewählt hast.

Ein Ort, an dem du noch nichts gewählt oder gestartet hast, öffnet sich mit den Standardwerten: Der Agent ist **Allgemein** oder der eigene Agent des Projekts, wenn das Projekt einen hat (und was dieser Agent vorschlägt, gilt, als hättest du ihn gewählt: sein Programm, das Modell seiner Leistungsstufe und seine Berechtigungen); das **Modell** ist **Automatisch**, wo es angeboten wird, sonst der Standard des Programms; **Aufwand** und **Berechtigungen** sind die üblichen des Programms; Memory ist eingeschaltet; es gibt kein Ausgabenlimit; **Vertraulich** und **Neuer Worktree** sind aus. **Ausführungsumgebung** bleibt das Programm, das du zuletzt verwendet hast. Der Ort, den du vor dem Hinzukommen dieser Funktion zuletzt gewählt hattest, behält die Auswahl, die du hattest.

Ein Link zur Startseite kann sie ausfüllen, zum Beispiel `/?prompt=Summarize%20my%20notes&agent=codex`; `model=`, `cwd=` (der Pfad eines Ordners), `assistant=` (die ID eines Agenten, etwa `app-builder`, der auch das Programm, das Modell und die Berechtigungen wählt, die er vorschlägt, sofern der Link kein Programm oder Modell nennt) und `confidential=1` (Vertraulich ein) können hinzugefügt werden. Er füllt nur das Feld und die Auswahl aus; er startet nie von selbst etwas. Unsichtbare Zeichen werden aus einer verlinkten Nachricht entfernt, mit einem Hinweis.

Was du in das Feld schreibst, wartet dort, während du zu anderen Seiten gehst: die Nachricht, die Dateien, die du anhängst, die Optionen nur für diese Aufgabe (**Schwarm**, **Tiefgehende Recherche**, **Arena**, **Richtlinien** für diese Sitzung) und der Ordner, in dem ein Link oder **Neue Agenten-Sitzung hier** es geöffnet hat. Das Feld leert sich, wenn die Sitzung startet: Während der Agent loslegt, steigt der Pfeil auf **Starten** weiter nach oben; dann wird die Startseite zur Sitzung, das Feld rutscht an seinen Platz am unteren Rand, und was du geschrieben hast, wandert nach oben als deine erste Nachricht. Die Nachricht und diese Optionen werden in diesem Browser gespeichert, sie sind also nach einem Neuladen noch da; angehängte Dateien nicht.

## Der Arbeit in einer Sitzung folgen

### Die Kopfzeile

Oben in einer Sitzung stehen:

- das Symbol des Agenten und der Titel (per Doppelklick umbenennen) sowie ein Schloss für eine [vertrauliche Sitzung](#keep-a-session-confidential);
- ein Status: **Arbeitet**, **Braucht dich**, **Bereit**, **Wird gestartet**, **Memory wird erstellt**, **Anhalten** oder „In VS Code öffnen“ bei einer Sitzung, die anderswo läuft. Sobald der Agent nicht mehr läuft, zeigt der Status, wie die Arbeit geendet hat: **Fertig**, wenn die letzte Runde abgeschlossen wurde (mit „· 2 Dateien erstellt“ oder „· 3 Dateien geändert“, wenn Dateien erstellt oder geändert wurden), **Angehalten**, wenn du die Sitzung gestoppt hast oder sie vor dem Ende abgebrochen wurde, **Fehlgeschlagen**, wenn sie mit einem Fehler endete. Zeige mit dem Mauszeiger darauf, um zu sehen, was als Nächstes zu tun ist;
- der Ordner (klicke darauf, um ihn in Dateien zu durchsuchen), ein Pull-Request-Badge, das Konto, wenn die Sitzung mit einem hinzugefügten Konto läuft, und auf breiteren Bildschirmen der Git-Branch und das Modell;
- eine Schaltfläche für das, was du gerade tun kannst: **Stoppen**, solange eine Runde läuft, **Fortsetzen**, wenn der Agent nicht läuft (nach **Angehalten** oder **Fehlgeschlagen**; dezenter nach **Fertig**, da eine Nachricht im Eingabefeld die Sitzung ohnehin fortsetzt), oder **Hier fortsetzen** für eine Claude-Code-Sitzung, die in VS Code oder einem Terminal geöffnet ist;
- **Details** (mit den hinzugefügten und entfernten Zeilen, sobald Dateien geändert wurden), das [das Detailfenster](#the-details-panel-changes-commands-and-info) öffnet;
- während die Unterhaltung [vergrößert oder verkleinert](#zoom-in-and-full-screen) ist, **− 125% +** mit der aktuellen Stufe;
- das Menü der Sitzung (⋯): siehe [Alles im Menü der Sitzung](#everything-in-the-sessions-menu).

### Runden, Schritte und Antworten

Die Unterhaltung liest sich wie ein Chat. Jede Runde besteht aus deiner Nachricht, der Arbeit des Agenten und der Antwort, mit der sie endet:

- **Deine Nachricht** erscheint rechts, mit ihren Bildern und angehängten Dateien, sobald du sie sendest, noch bevor der Agent sie hat: Darunter wird der Agent bei der Arbeit gezeigt, und das Nachrichtenfeld ist frei für deine nächste Nachricht. Geht sie nicht durch (keine Verbindung, ein Ausgabenlimit erreicht), verschwindet sie wieder und kommt zurück ins Nachrichtenfeld, mit einem Hinweis, warum. Eine lange Nachricht wird auf ihre ersten Zeilen eingeklappt; **Mehr anzeigen** öffnet sie.
- **Die Arbeit** steht unter einer Zeile, die sie zusammenfasst: „Gearbeitet 2m 10s · 3 Befehle“, „Nachgedacht“, „Angehalten nach 40s“ oder „Fehlgeschlagen nach 5s“, rechts mit den Kosten der Runde („≈ 0,12 $“): Klicke darauf für [Zeit und Kosten](/guide/sessions#a-turns-time-and-cost) der Runde. Bei einem Abo (Claude Code, Codex) sind das die Kosten, die die Token zu API-Preisen verursachen würden, nicht das, was du zahlst; ist für das Modell kein Preis bekannt, werden stattdessen die Token angezeigt. Während die Runde läuft, steht in der Zeile „Arbeitet · 1m 2s“ (oder „Wartet auf dich“), und die Gliederung der Arbeit wächst mit; nach früheren Runden steht dort zusätzlich, wie lange die Sitzung insgesamt gearbeitet hat, alle Runden zusammen: „Arbeitet · 1m 2s (47m)“. Eine abgeschlossene Runde klappt ihre Arbeit ein; klicke auf die Zeile, um sie zu öffnen.
- **Die Gliederung der Arbeit**: Jede kurze Notiz, die der Agent zwischen seinen Schritten schreibt (was er gefunden hat, was er als Nächstes tut), beginnt einen Abschnitt, und die Schritte, die er danach unternimmt, gehören dazu. Ein abgeschlossener Abschnitt ist eine Zeile mit einem Haken: die Notiz in wenigen Worten („Zuerst die Checkout-Tests ausführen, um zu sehen, was fehlschlägt“, „Zuerst den Rabatt anwenden und nur einmal runden“), wie viele Schritte er gebraucht hat und die geänderten Zeilen. Klicke darauf für die ganze Notiz und jeden Schritt. Der laufende Abschnitt zeigt die Notiz des Agenten vollständig und darunter den Schritt, der gerade ausgeführt wird, etwa „total.ts wird bearbeitet · 4 s“; klicke auf diese Zeile, um die bisherigen Schritte des Abschnitts zu sehen. Schritte vor der ersten Notiz des Agenten bilden einen Abschnitt, der nach ihrem Inhalt benannt ist („3 Befehle ausgeführt, 2 Dateien gelesen“). Eine lange Runde zeigt ihre neuesten Abschnitte; **12 frühere Abschnitte anzeigen** zeigt den Rest.
- **Schritte** werden in einfachen Worten benannt: „Tests ausführen“, „index.ts lesen“, „Im Web gesucht“, mit dem Befehl selbst in dezenterer Schrift. Klicke auf einen Schritt, um zu sehen, was er getan hat. Claude Code führt einen Befehl oder einen anderen Schritt, der etwas verändert, selbstständig aus; die Schritte von Hydor selbst, die der Agent danach in derselben Nachricht angefordert hat (Websuchen, Seitenabrufe …), warten, bis sie zu Ende ist. Ein solcher Schritt zeigt dezent **Warten** anstelle seiner Uhr, bis er wirklich startet; dann läuft seine Uhr ab diesem Moment, und ein beendeter Schritt zeigt die Zeit, die er tatsächlich gebraucht hat. Die Zeile der Gliederung für den laufenden Schritt nennt den Schritt, der wirklich ausgeführt wird.
- **Gedanken** erscheinen als „Nachgedacht 12s“ mit ihrer ersten Überschrift; klicke darauf, um sie zu lesen.
- **Die Antwort** ist das, was der Agent nach seinem letzten Schritt geschrieben hat. Seiten, die der Agent gezeigt hat, stehen bei ihr. Während der Agent arbeitet, erscheint eine kurze Notiz, die er nach seinem letzten Schritt schreibt, in der Gliederung als laufender Abschnitt; endet die Runde dort, wird sie zur Antwort.
- **Antworten zwischen Schritten**: Was der Agent zwischen seinen Schritten schreibt und sich wie eine Antwort liest (seine Antwort auf eine Nachricht, die du während der Arbeit gesendet hast, oder was er gefunden hat, bevor er weitermachte, in mehreren Absätzen, als Liste oder als Tabelle), erscheint ebenfalls als Antwort an seiner Stelle und wird nicht in die Arbeit eingeklappt. Die Arbeit davor und danach steht jeweils unter einer eigenen Zeile, etwa „Gearbeitet 20s · 2 Befehle“.
- **Dateien geändert**: Unter der Antwort zeigt ein Chip, wie viele Dateien die Runde geändert hat, mit hinzugefügten und entfernten Zeilen. Klicke darauf für die Liste und dann auf eine Datei für ihren Diff (bei nur einer Datei öffnet sich ihr Diff sofort); **Datei öffnen** öffnet sie. Mehr als fünf werden hinter „3 weitere Dateien anzeigen“ eingeklappt. Die Chips für die Commits und das Memory der Runde stehen in derselben Zeile daneben, und jeder öffnet sich unter dieser Zeile.
- **Erstellte Dokumente**: Unter der Antwort erscheinen die Dokumente, die der Agent in der Runde erstellt oder geändert hat (PDF, Word, Excel, PowerPoint, LaTeX, Notebooks, Markdown und mehr), als Karten mit der Markierung **Neu** oder **Aktualisiert**, unabhängig davon, ob er sie übergeben hat. Dateinamen und Pfade in der Antwort sind Links, die die Datei in einem Fenster über der Unterhaltung öffnen ([Dokumente, die er erstellt oder geändert hat](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply)). Auf einem breiten Bildschirm öffnet sich außerdem neben der Unterhaltung, wenn die Runde nur ein Dokument erstellt oder geändert hat.
- **Commits**: Hat der Agent in der Runde Commits erstellt, weist ein Chip unter der Antwort darauf hin: **Commit erstellt** · der Titel des Commits oder „3 Commits“ mit den Branches sowie die hinzugefügten und entfernten Zeilen. Klicke darauf (bei mehreren dann auf einen Commit), um die ganze Nachricht, den Autor und den Zeitpunkt, den Hash (zum Kopieren anklicken) und jede geänderte Datei mit ihrem Diff zu lesen. **In Git öffnen** öffnet ihn im Repository der Sitzung auf der [Git-Seite](/git). Ein Commit, den der Agent in derselben Runde nachträglich geändert oder per Rebase entfernt hat, wird weggelassen.

Der Agent kann auch eine Checkliste führen (**Plan** oder **Aufgaben**, mit der Zahl der erledigten Punkte), die sich während der Arbeit abhakt. Hinweise der App folgen der Runde, auf die sie sich beziehen: was Memory gespeichert hat, eine zweite Meinung, ein erreichtes Ausgabenlimit, die Karte der Subagenten, die eine Runde gestartet hat. Nachrichten aus anderen Sitzungen erscheinen als „Von …“, die Antwort eines Subagenten (eines Hydor-, Claude-Code- oder Codex-Subagenten) als „Antwort von …“ (klicke darauf, um die Antwort zu lesen), und der Lauf einer geplanten Aufgabe beginnt mit einer Zeile, die die Aufgabe nennt.

Tageszeilen („Gestern“, „Heute“) trennen die Tage; eine Unterhaltung, die ganz von heute ist, hat keine. Ältere Nachrichten werden beim Hochscrollen oder mit **Frühere Nachrichten anzeigen** geladen. Neue Nachrichten und Antworten erscheinen am Ende der Unterhaltung, ohne dass darunter leerer Raum bleibt. Sobald eine Antwort so lang ist, dass sie den Bildschirm füllt, bleibt die Ansicht bei ihrer ersten Zeile stehen und bleibt dort, während die Antwort wächst, sodass du eine lange Antwort von Anfang an liest; eine kurze Antwort steht einfach unter dem, was vorher kam. Wenn du nach oben scrollst, während der Agent arbeitet, bleibt die Ansicht, wo du bist; **Neueste** bringt dich zurück ans Ende und erscheint auch, während eine Antwort unterhalb des Bildschirms weiterläuft.

Unter jeder abgeschlossenen Antwort stehen **Nachricht kopieren**, **Ab dieser Antwort verzweigen** und **Vorlesen**. **Ab dieser Antwort verzweigen** funktioniert bei jeder Antwort von Claude Code und bei der letzten Antwort einer abgeschlossenen Runde bei Codex und Custom, da diese eine ganze Runde verzweigen. Unter der letzten Antwort einer Runde, in der der Agent ein Tool benutzt oder eine Karte gezeigt hat, lässt **Das noch einmal tun…** (die kreisenden Pfeile) diese Arbeit erneut erledigen, ohne sie noch einmal anzufordern: **Zur App machen** entwirft aus der Runde eine App, deine Korrekturen unterwegs bleiben in ihrer Aufgabe erhalten und ihre Karten werden zu ihrer Antwort ([Aus einer Sitzung, die gut lief](/guide/apps#make-your-own-app)), und **Ausführen alle…** öffnet eine neue [geplante Aufgabe](/guide/tasks) mit dem, was du angefragt hast. Nicht in einer vertraulichen Sitzung. Unter jeder deiner eigenen Nachrichten werden **Nachricht kopieren**, **Von hier aus bearbeiten** und der Zeitpunkt des Sendens immer angezeigt, nicht nur beim Darüberfahren.

### Zeit und Kosten einer Runde

Die Kosten rechts in der Zeile einer abgeschlossenen Runde („≈ 0,12 $“ oder die Token, wenn für das Modell kein Preis bekannt ist) öffnen **Zeit und Kosten**, damit du siehst, warum eine Runde lange gedauert hat oder viel gekostet hat:

- **Dauer**: ein Balken, wohin die Zeit der Runde ging, jeder Teil mit seinem Anteil und seiner Länge: **Das Modell** (Lesen dessen, was es bekommen hat, Nachdenken und Schreiben), **Befehle**, **Dateien lesen und bearbeiten**, **Das Web**, **Weitere Schritte** (Subagenten, Tools verbundener Apps), **Wartet auf dich** (Genehmigungen, Fragen und Formulare, von dem Moment, in dem jede Karte erschien, bis du geantwortet hast) und **Der Rest** (Start und Zeit zwischen den Schritten). Schritte, die parallel liefen, zählen einmal. Darunter steht „Erste Antwort oder erster Schritt nach 3 s“: wie schnell der Agent begonnen hat.
- **Token**: **Neu eingelesen**; **In den Cache geschrieben** (neu eingelesen und vom Anbieter des Modells aufbewahrt, sodass die nächste Anfrage es günstiger liest); **Aus dem Cache gelesen**, mit seinem Anteil an allem Gelesenen; und **Generierter Text** (Antworten, Gedanken und Schritte).
- **Kosten**: die Kosten der Runde und, wenn der Preis des Modells bekannt ist, die jeder Art, mit „Der Cache hat etwa 0,80 $ gespart.“. Bei einem Abo (Claude Code und Codex, es sei denn, eine Sitzung läuft mit API-Guthaben) steht dort „Zu API-Preisen: Mit einem Abo zahlst du die Gebühr deines Abos“. Ist für das Modell kein Preis bekannt, steht dort, dass seine Kosten nicht gezählt werden.

Die Runden von Claude Code liefern die eigene Zeit des Modells und die erste Antwort; bei anderen Agenten besteht der Anteil des Modells aus seinem Nachdenken. Die Kosten und dieses Fenster werden auf breiteren Bildschirmen angezeigt.

### Mathematik, Diagramme, Grafiken und Bilder in Antworten

Agenten schreiben ihre Antworten für diese App, nicht für ein Terminal, deshalb kann eine Antwort mehr als Text enthalten. Jeder Agent kennt diese Möglichkeiten und nutzt sie selbstständig, wo sie eine Antwort klarer machen:

- **Formatierung**: Überschriften, Listen, Tabellen, Fettdruck und Code, übersichtlich angeordnet.
- **Mathematik**: Gleichungen wie in einem Lehrbuch dargestellt, innerhalb eines Satzes oder abgesetzt in einer eigenen Zeile, sowie chemische Gleichungen (2H₂ + O₂ → 2H₂O). Zahlen zwischen paarigen Dollarzeichen (`$1$`, `$0$`) sind ebenfalls Mathematik; gewöhnliche Preise wie $4.70 bleiben Geld.
- **Diagramme**: Flussdiagramme, Sequenz- und Zustandsdiagramme, Zeitleisten, Mindmaps, Gantt- und Kreisdiagramme, in den Farben der App gezeichnet, hell oder dunkel. Die Leiste über einem Diagramm hat **Code anzeigen** (was der Agent geschrieben hat; dieselbe Schaltfläche zeigt wieder das Diagramm), **Als Bild speichern (SVG)**, **Vollbild** und eine Schaltfläche, die seinen Code kopiert. Ein Diagramm, das sich nicht zeichnen lässt, zeigt seinen Code mit dem Grund.
- **Grafiken und kleine Tools**: Ein Diagramm, eine kommentierte Abbildung, ein Rechner, eine Simulation mit Schiebereglern oder ein kurzes Quiz läuft innerhalb der Antwort, abgeschottet von der App und deinen Dateien, wie die Seiten, die Agenten zeigen. Es übernimmt das Aussehen der App und wächst passend mit (**Alles anzeigen** öffnet ein hohes); seine Leiste hat **Code anzeigen** (**Anzeigen** führt zurück), **Als Datei speichern** und **Vollbild**. Auswahlen, die du darin anklickst, landen in deinem Nachrichtenfeld. Solange die Antwort noch geschrieben wird, baut es sich an Ort und Stelle auf („Wird geschrieben …“, bis es etwas zu zeigen hat), und es wird lebendig, sobald es vollständig ist.
- **Bilder**: Fotos aus dem Web (ein Ort, ein Produkt, eine Pflanze, ein Kunstwerk) und Bilder auf diesem Computer, passend in die Antwort eingefügt; klicke eines an, um es groß zu sehen, wo **Bearbeiten** es im Bildeditor öffnet ([Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos)). Mehrere Bilder in einer Reihe erscheinen als Raster, jedes mit seiner Beschreibung darunter: zwei nebeneinander, vier zwei mal zwei, mehr drei pro Reihe (zwei auf dem Handy). Klicke eines der Bilder einer Antwort an, und der Betrachter enthält alle, mit Pfeilen, um von einem zum nächsten zu gehen. Screenshots einer App oder einer Seite kommen stattdessen als eine Karte, die du neben der Unterhaltung prüfst ([Agentenänderungen an Web-Apps prüfen](/guide/files-git#review-an-agents-changes-to-a-web-app)). Bilder aus dem Web laufen über den Server dieser App, sodass die Website, die sie hat, deinen Browser nie sieht. Ein Bild, das sich nicht laden lässt, erscheint als Link darauf.

Um stattdessen reinen Text zu erhalten, sage das in deinen [Agentenrichtlinien](/guide/guidelines) („Antworte in reinem Text, ohne Diagramme oder Bilder“) oder in deiner Nachricht. Du kannst jedes davon auch mit einfachen Worten anfordern: „zeichne die Schritte als Flussdiagramm“, „zeig mir ein Bild davon“, „gib mir einen Schieberegler, mit dem ich andere Werte ausprobieren kann“.

### Antwort-UIs: Karten, Diagramme und Karten in Antworten

Wenn ein Teil einer Antwort etwas ist, das man ansehen, vergleichen, auswählen, verfolgen, ausprobieren oder üben möchte, statt es zu lesen, zeigt der Agent ihn in einer der Antwort-UIs der App: fast 150 fertige Karten, Tabellen, Diagramme, Landkarten, Galerien, Zeitleisten und kleine Tools, gefüllt mit dem eigenen Inhalt der Antwort. Die meisten Antworten von mehr als ein paar Zeilen haben einen solchen Teil, daher siehst du sie in den meisten. Optionen zum Vergleichen werden zu einer Tabelle, in der der beste Wert jeder Zeile markiert ist, ein Rezept zu einer Karte, deren Portionen ihre Mengen skalieren, eine Vorhersage zu den kommenden Stunden und Tagen, Orte zu einer Landkarte mit nummerierten Pins, ein Quiz oder Übungsaufgaben zu Fragen, die du an Ort und Stelle beantwortest. Jede baut sich auf, während die Antwort kommt, im Look der App, hell oder dunkel.

- **Was du in einer tun kannst**: eine Tabelle sortieren und filtern, ein Diagramm auf seine Zahlen umschalten, eine Checkliste abhaken, die Timer eines Rezepts starten, Lernkarten umdrehen, Paare zuordnen oder Lücken füllen, die Fragen eines Problemlösers beantworten, ein Glücksrad drehen, das für dich auswählt, die Schieberegler eines Rechners oder eines Funktionsgraphen bewegen, ein Video abspielen. Was du abhakst oder beantwortest, ist noch da, wenn du auf diesem Gerät zur Unterhaltung zurückkehrst (auch Antworten auf Übungsaufgaben). Eine Schaltfläche mit **Senden** (**Meine Auswahl senden**, **Meine Punktzahl senden**, **Mein Ergebnis senden**, **Senden** und Ähnliches) sendet sofort, was sie nennt, als deine nächste Nachricht, als hättest du es getippt und Enter gedrückt: die gewählte Option, deine Quiz-Punktzahl, wo das Rad stehen geblieben ist. **Gesendet** daneben zeigt, dass es abgeschickt wurde. Was du gerade schreibst, bleibt im Nachrichtenfeld; wenn die Sitzung gerade keine Nachricht annehmen kann (eine andere ist noch unterwegs), landen die Worte stattdessen im Feld, damit du sie senden kannst. Manche gehen weiter:
  - **Übungsaufgaben**, die du in eigenen Worten oder Zahlen beantwortest, werden sofort geprüft (eine Zahl innerhalb einer Toleranz, Wörter ohne Rücksicht auf Groß- und Kleinschreibung; eine richtige Antwort, deren einziger Fehler ein Akzent ist, sagt das). **Zeige einen Hinweis** gibt Hinweise einzeln; die ausgearbeitete Lösung erscheint nach einem Versuch oder sobald alle Hinweise gezeigt wurden. Du erhältst eine Punktzahl, und **Meine Ergebnisse senden** sendet sie an den Agenten. Deine Antwort auf eine offene Frage geht mit **Zur Prüfung senden**, damit der Agent sie überprüft.
  - **Code, den du ausführen und ändern kannst**: Ein Playground führt JavaScript, Python oder eine kleine Webseite an Ort und Stelle aus, abgeschottet von der App, mit seiner Ausgabe (und den Plots von Python) darunter. **Ausführen**, **Zurücksetzen**, **Kopieren** und **Meinen Code senden** (er geht an den Agenten zur Ansicht) sind darauf, und er kann Aufgaben zum Ausprobieren stellen. Python wird beim ersten Mal aus dem Web geladen, daher läuft es nicht in einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential).
  - **Ein Code-Rundgang** erklärt Code als geführte Tour: nummerierte Schritte neben dem Code, die jeweils die Zeilen hervorheben, die sie erklären, während der Rest verblasst. Gehe sie mit den Pfeilen (oder den Tasten **←** und **→**) durch oder tippe auf eine Zeile, um den Schritt zu öffnen, der sie erklärt. **Zu diesem Schritt fragen** legt eine Frage dazu in dein Nachrichtenfeld.
  - **Ein Programm, Schritt für Schritt ausgeführt** zeigt, wo ein Programm bei jedem Schritt steht: die Zeile, in der es ist, seine Variablen (was sich gerade geändert hat, ist markiert), die laufenden Aufrufe und was es bisher ausgegeben hat. Gehe vor und zurück, ziehe den Schieberegler oder drücke auf Abspielen. Wenn du aufgefordert wirst, zuerst die Ausgabe vorherzusagen, tippe deine Vermutung ein und drücke **Überprüfen**. **Zu diesem Schritt fragen** funktioniert auch hier.
  - **Ein Netzwerkdiagramm** zeigt, wie Dinge zusammenhängen (eine Concept Map, die Figuren eines Romans, was wovon abhängt): Tippe auf einen Knoten, um seine Verbindungen hervorzuheben und seine Notiz zu lesen, ziehe Knoten herum, lies die Legende oder wechsle zur Ansicht **Liste**.
  - **Kommentierter Text** markiert Passagen in einem Text: Tippe auf eine, um ihre Notiz (eine Korrektur, einen Kommentar, eine Bedeutung) und die vorgeschlagene Änderung zu lesen, oder **Dazu fragen**. Filtere die Notizen nach Art, wechsle zwischen **Original** und **Korrigiert** und nutze **Korrigierten Text kopieren**, oder lass dir den Text vorlesen.
  - **Ein Faktencheck** geht Behauptungen eine nach der anderen durch, jede mit ihrem Urteil, der Begründung, wie sicher sich der Agent ist, und den Belegen dafür und dagegen, mit Quellen. Die Übersicht der Urteile oben filtert die Behauptungen, wenn du darauf tippst.
  - **Nachverfolgungen** sind zwei bis fünf Schaltflächen mit nächsten Fragen oder Schritten am Ende einer Antwort: Tippe auf eine, um sie als deine nächste Nachricht zu senden, wenn dein Nachrichtenfeld leer ist, oder um sie zu dem hinzuzufügen, was du gerade schreibst. Eine Schaltfläche, die du benutzt hast, bekommt einen Haken.
- **Bilder**: Ein Eintrag ohne Bild oder dessen Bild sich nicht laden lässt, wird ohne Bild gezeigt, sein Text nimmt den Platz ein, sodass kein leeres Feld bleibt.
- **Links**: Was eine Antwort nennt und du vielleicht öffnen möchtest (einen Ort, ein Produkt, ein Paper, ein Buch, einen Film, eine Veranstaltung, eine Seite), führt zu einer eigenen Seite, in den Worten des Agenten und auf seinen Karten, damit du es nie wieder suchen musst. Auf einer Karte ist ein verlinkter Name unterstrichen und hat ein kleines ↗ dahinter, damit du auch auf dem Handy siehst, dass es ein Link ist: tippe oder klicke darauf, um die Seite in einem neuen Tab zu öffnen (auf einer Karte, auf der du etwas auswählst, öffnet sich die Seite, ohne dass die Option ausgewählt wird). Die Adresse eines Ortes öffnet ihn in Google Maps, und eine Tabelle kann eine Spalte mit Namen in Links verwandeln.
- **Zahlen aus einer Tabelle oder einer Datei**: Eine Tabelle, ein Diagramm, Kennzahlen, eine Rangliste, ein Histogramm oder Werte auf einer Landkarte können ihre Zahlen aus einer deiner Tabellen (siehe [Tabellen](/guide/library#spreadsheets)) oder aus einer CSV-, TSV-, JSON- oder JSONL-Datei im Ordner der Unterhaltung oder ihres Projekts lesen, statt sie selbst zu enthalten. Agenten tun das, wenn die Zahlen dort liegen, wenn es mehr als ein paar Dutzend Zeilen sind oder bei einer Karte, die du vielleicht behalten möchtest: Die Karte addiert, zählt, gruppiert, filtert und sortiert sie selbst, sodass nichts erneut abgetippt wird, und sie zeigt jedes Mal die neuesten Zahlen, wenn sie angezeigt wird (auch später hinzugefügte Zeilen, es sei denn, sie nennt einen festen Zellbereich). Eine Zeile darunter sagt, woher sie stammen (**Datenquelle** *Shop-Zahlen · Umsatz*, ein Link, der die Tabelle oder die Datei öffnet), wann sie gelesen wurden und, wenn nur ein Teil gezeigt wird, wie viel („1.000 von 12.400 angezeigt“); **Erneut lesen** liest sie noch einmal, und wenn du die Tabelle speicherst, zeichnet sich die Karte von selbst neu. Wenn die Tabelle, ihr Tab, eine Spalte oder die Datei nicht mehr da ist, sagt die Karte das in einfachen Worten, mit **Erneut versuchen**. Eine Karte liest nur Dateien in den Ordnern ihrer Unterhaltung, nicht anderswo auf deinem Computer, bis zu 50 MB (bei einer JSON-Datei 20 MB) und ihre ersten 1.000.000 Zeilen; eine Tabelle, die in einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) erstellt wurde, wird nur von Karten in dieser Sitzung gelesen.
- **Beim Darüberfahren** (oder wenn du sie mit der Tastatur erreichst) erscheint oben rechts eine kleine Leiste: **Daten anzeigen** zeigt, was der Agent geschrieben hat (bei einer Karte, die eine Tabelle oder Datei liest, woher sie liest und was sie davon zeigt; **Anzeigen** führt zurück), **Als Text kopieren** kopiert es als reinen Text, und **Vollbild** zeigt die Karte allein über der Seite, so breit wie dein Fenster (auf einem Smartphone der ganze Bildschirm), mit Scrollen, wenn sie hoch ist; **Esc**, **Schließen** oder ein Klick daneben bringt dich zurück. Unter **Mehr** (…): **An Board anpinnen** behält eine Kopie der Karte auf einem deiner Boards, einem, das du auswählst, oder einem **Neues Board…**, das du dort benennst, damit du sie neben anderen Karten wiederfindest (siehe [Boards](/guide/library#boards)); **Als Bild speichern** speichert ein PNG der Karte, wie sie aussieht, in dem Design, in dem du sie siehst, und in doppelter Größe, damit es scharf bleibt, benannt nach ihrem Titel, und **Als Bild kopieren** legt dasselbe Bild in die Zwischenablage, um es in eine Nachricht oder ein Dokument einzufügen (wo dein Browser das Seiten erlaubt). Vollbild hat dieselben beiden oben. Eine Karte mit einer Landkarte, einem von einer Diagrammbibliothek gezeichneten Plot, einem Videoplayer oder der Ausgabe eines Code-Playgrounds darin hat keine Bild-Schaltflächen (sie kann trotzdem angepinnt werden): Diese Teile lassen sich nicht in ein Bild zeichnen.
- **Wann Agenten sie benutzen**: Agenten sind angewiesen, für jeden Teil einer Antwort eine zu verwenden, den man ansehen, vergleichen, auswählen, verfolgen, ausprobieren, üben oder behalten möchte, was in einer Antwort von mehr als ein paar Zeilen meistens der Fall ist: abzuwägende Optionen, Dinge mit Bildern und Details (Orte, Produkte, Filme, Bücher, Personen, Paper, Nachrichten), Zahlen, Zeit und Pläne, Dinge zu tun, Dinge zu lernen, zu prüfende Texte, zu überprüfende Behauptungen und nächste Schritte, die du vielleicht gehen möchtest. Sie füllen die Bilder und spielen ein Video ab, wo Zuschauen mehr hilft als ein Foto. Was eine Karte nicht sagen kann (die Begründung, der Rat, die Vorbehalte), bleibt in den Worten des Agenten. Ein normales Gespräch, eine kurze Antwort auf eine kurze Frage und Codeänderungen bleiben Text. Jede Antwort, die erste und jede weitere, kann mehrere enthalten, eine für jeden ihrer Teile (die Reiseroute einer Reise, ihr Wetter und eine Packliste), sodass eine Unterhaltung so viele sammelt, wie ihre Antworten brauchen; eine spätere Antwort kann eine erneut zeigen, mit aktualisierten Daten. Der Agent findet die passenden mit einer einzigen Suche: nach Namen für die, die er schon kennt, und mit ein paar Worten dazu, was jeder andere Teil zeigt (nach Wörtern und, wenn **Bedeutungssuche** in [Einstellungen → Memory](/settings?s=memory) aktiviert ist, auch nach Bedeutung), sodass ihm nie alle auf einmal gegeben werden. Die [integrierten Agenten](/guide/agents#the-built-in-agents) stützen sich jeweils auf die, die zu ihrer Arbeit passen.
- **In deinen Apps**: Die Antwort einer App kann ebenfalls eine solche Karte sein, die der Agent der App bei jedem Lauf ausfüllt (siehe [Die Antwort](/guide/apps#the-answer)), und **Das noch einmal tun…** unter einer Antwort, die Karten gezeigt hat, erstellt eine App, deren Antwort diese Karten sind.
- **Alle ansehen**: [Antwort-UIs](/answers) zeigt jede mit einem Beispiel, nach Gruppen: Zusammenfassungen, Vergleiche, Einkaufen, Orte und Reisen, Essen, Pläne, Arbeit und Business, Zahlen und Diagramme, Geld, Lernen, Wissenschaft, Medien, Menschen und Sport, Schreiben und Code. **Schon während des Streamings abspielen** zeigt eine, wie sie in einer Antwort ankäme.

Du kannst auch mit einfachen Worten nach einer fragen: „vergleiche sie in einer Tabelle“, „zeig sie auf einer Karte“, „frag mich dazu ab“, „gib mir Übungsaufgaben dazu“, „markiere in meinem Aufsatz, was zu verbessern ist“. Deine [Agentenrichtlinien](/guide/guidelines) („Antworte in reinem Text, ohne Karten oder Diagramme“) oder deine Nachricht können stattdessen reinen Text anfordern.

### Zoom und Vollbild

Eine Unterhaltung lässt sich für sich allein größer oder kleiner anzeigen, während Seitenleiste, Kopfzeile und Nachrichtenfeld bleiben, wie sie sind. Alles darin wird größer oder kleiner (Text, Code, Karten und Bilder), und die Zeilen werden neu umbrochen, damit alles passt. Die Stufen sind 67, 80, 90, 100, 110, 125, 150, 175 und 200 %; jedes Gerät merkt sich seine eigene, für alle seine Sitzungen.

- **Tasten**: **Strg** (**⌘** auf dem Mac) mit **+** oder **=** vergrößert, mit **−** verkleinert, und mit **0** geht es zurück auf 100 %. In der Desktop-App findest du das auch unter **View → Zoom In**, **Zoom Out** und **Actual Size**; außerhalb einer Sitzung zoomen sie das ganze Fenster. Ist die Unterhaltung schon bei 100 %, setzt **0** den eigenen Zoom des Browsers oder des Fensters zurück.
- **Maus und Trackpad**: Halte **Strg** gedrückt und scrolle, oder ziehe auf dem Trackpad zwei Finger auseinander oder zusammen. In Safari funktioniert diese Geste ebenfalls.
- **Die Kopfzeile**: Solange die Stufe nicht 100 % ist, steht **− 125% +** neben **Details**; klicke auf die Prozentzahl, um zu 100 % zurückzukehren.
- **Das Menü**: Das ⋯-Menü der Sitzung hat immer eine Zeile **Zoom**, auch auf dem Handy.

Was du oben auf dem Bildschirm gelesen hast, bleibt dort, wenn sich die Stufe ändert. Ein Terminal oder ein Code-Editor behält diese Tasten für sich.

Zoom ist nicht dasselbe wie [Einstellungen → App → Allgemein → Darstellung → Textgröße](/settings?s=general&find=Text%20size). **Textgröße** macht den Lesetext in der ganzen App größer (Nachrichten, die Hilfeseiten und das Feld, in das du tippst) und lässt Karten und Bilder, wie sie sind; Zoom vergrößert die gesamte Unterhaltung einer Sitzung und nichts außerhalb davon.

**Tabellen, Code und Diagramme im Vollbild**: Eine Tabelle hat oben rechts einen kleinen Button, ein Codeblock hat einen neben **Kopieren**, und ein Diagramm hat **Vollbild** in seiner Leiste. Jedes öffnet sich über der Seite, wo:

- **− 100% +** oben das Angezeigte zoomt und ein Klick auf die Prozentzahl zu 100 % zurückführt;
- **Strg** oder **⌘** mit **+**, **−** und **0** dasselbe bewirken und **Strg** mit Scrollen oder die Zweifingergeste um den Mauszeiger herum zoomt;
- du nach dem Zoomen mit der Maus ziehen kannst, um dich darin zu bewegen (Scrollen funktioniert auch);
- **Esc**, **Schließen** oder ein Klick daneben dich zurückbringt.

Bilder öffnen sich bereits groß, wenn du sie anklickst.

### Einen Schritt öffnen, um seine Ausgabe zu sehen

Klicke auf einen beliebigen Schritt, um ihn zu öffnen:

- ein Befehl: der Befehl, der Ordner, in dem er lief, sein Exit-Code und wie lange er dauerte, eine Kopierschaltfläche und seine Ausgabe (**Vollständige Ausgabe laden**, wenn sie abgeschnitten wurde);
- eine Dateibearbeitung: der Diff (**Vollständigen Diff laden**, wenn er abgeschnitten wurde);
- ein Dateizugriff: ein Link zur Datei und was gelesen wurde;
- eine Webseite: ihre Adresse und was davon gelesen wurde;
- eine Aufgabe, die einem Subagenten gegeben wurde: **Aufgabe erteilt** und was zurückkam;
- alles andere: was der Agent gesendet hat und was zurückkam.

Ein Schritt kann mit **Hintergrund** markiert sein (er läuft weiter), mit **Automatisch** (der Auto-Modus von Custom hat entschieden, mit dem Grund beim Darüberfahren) oder einen roten Exit-Code zeigen. Hintergrundaufgaben (ein weiterlaufender Befehl, ein Monitor, ein Workflow) werden in einer Zeile über dem Nachrichtenfeld aufgelistet, zusammen mit den Subagenten der Sitzung; öffne eine Aufgabe, um ihre Ausgabe zu sehen (Claude Code) und sie zu **Stoppen**, was vorher nachfragt; ein Subagent öffnet sich als eigene Sitzung. Siehe [Subagenten](/guide/sessions#subagents).

## Das Memory eines Projekts erstellen, bevor der Agent startet

Wenn du auf der Startseite eine Sitzung in einem Projekt startest, dessen [Wiki-Memory](/guide/wiki-memory) noch neu ist (weniger als 10 Artikel, noch kein Aufbau aus dem Verlauf ausgeführt) und das Projekt etwas enthält, woraus sich eines erstellen lässt (Unterhaltungen, Commit-Nachrichten, Dokumente, Notizen, eine README oder ein docs/-Ordner), fragt die Sitzung zuerst nach. Eine Karte unter deiner Nachricht fragt **Memory von <Projekt> zuerst erstellen?** und zeigt, was gelesen würde und wie lange es dauert, bevor der Agent startet. Die Sitzung zeigt **Braucht dich** (und du bekommst die Benachrichtigung), bis du dich entscheidest:

- **Memory erstellen, dann starten**: Das Memory wird erstellt, die Karte zeigt den Fortschritt, und die Sitzung zeigt **Memory wird erstellt**. Deine Nachricht wartet („Wird an den Agent gesendet, sobald das Memory bereit ist“) und geht an den Agent, sobald der wichtigste Teil geschrieben ist: ein Überblick über das Projekt aus seinen Dateien, seinen Notizen und den Unterhaltungen mit dem meisten Inhalt. Der Rest wird im Hintergrund weitergebaut, und Agenten finden ihn, sobald er fertig ist. **Jetzt starten** sendet deine Nachricht sofort und lässt den Aufbau weiterlaufen; **Erstellen stoppen** hält ihn an (was bereits geschrieben wurde, bleibt) und startet den Agent. Du kannst die App schließen: Der Agent startet von selbst. Schlägt der Aufbau vor diesem Punkt fehl, sagt die Karte das, mit **Erneut versuchen** und **Trotzdem starten**. Wenn der Agent beendet wurde, bevor er deine Nachricht je erhalten hat (er ist abgestürzt, oder der Computer wurde während des Wartens neu gestartet) und nicht wieder gestartet werden kann, bietet die Karte **In neuer Sitzung starten** an: Eine neue Sitzung mit denselben Einstellungen erhält deine Nachricht, übernimmt, was du inzwischen gesendet hast, und die leere wird archiviert.
- **Ohne Memory starten**: Der Agent startet sofort, und dieses Projekt fragt eine Woche lang nicht erneut.
- **Für dieses Projekt nicht mehr fragen**: Für dieses Projekt wird nie wieder gefragt. **Wiki aus dem Verlauf aufbauen…** bleibt im Menü **⋯** des Tabs **Memory** in den Projektdetails.

Alles, was du sendest, während er wartet, geht nach deiner ersten Nachricht an den Agent. Die Abfrage erscheint nur, wenn du selbst auf der Startseite eine Sitzung startest, nie bei Geplanten Aufgaben, Apps, Subagenten oder Sitzungen, die ein Agent startet, und nicht bei einem Projekt, für das es schon einen Aufbau gab.

## Genehmigen oder ablehnen, was der Agent tun will

Wenn der Agent etwas tun will, das seine Berechtigungen ihm nicht allein erlauben, wartet er und fragt mit einer Karte am Ende der Unterhaltung: was er ausführen will, eine Dateiänderung mit ihrem Diff oder ein anderes Tool mit seinen Details, dazu, wie lange er schon wartet. Der Punkt der Sitzung wird gelb, der Posteingang zählt sie mit, und du bekommst eine Benachrichtigung, wenn du sie eingeschaltet hast. Du kannst auf der Karte antworten, im [Posteingang](/guide/inbox) oder, bei einem einfachen Ja oder Nein, direkt in der Benachrichtigung, wo der Browser Schaltflächen anzeigt.

Die Schaltflächen kommen vom Agent:

- **Claude Code**: **Erlauben**, **Ablehnen** und oft eine Regel wie „Bash npm test immer erlauben“ oder „Alle Änderungen in dieser Sitzung erlauben“.
- **Codex**: **Erlauben**, **Für diese Sitzung erlauben**, **Diesen Befehl immer erlauben**, **Ablehnen**, **Ablehnen und stoppen**; bei Dateiänderungen **Änderungen in dieser Sitzung erlauben**; bei weiter gefassten Berechtigungen **Für diesen Durchlauf erlauben** und **Für diese Sitzung erlauben**.
- **Custom**: **Erlauben**, **Immer erlauben**, gefolgt von genau dem, was es abdeckt (nur der Befehl, den du genehmigt hast, damit nichts danach mitlaufen kann), und **Ablehnen**.
- Andere Agenten: die Auswahl, die sie anbieten.

**Ablehnen** öffnet zuerst ein Feld, „Optional: Sag dem Agent, was er stattdessen tun soll“; drücke noch einmal **Ablehnen**, um es zu senden, mit oder ohne Hinweis. (**Ablehnen** bei Custom und **Ablehnen und stoppen** bei Codex antworten sofort.)

Ein Tool eines verbundenen Kontos, das du auf **Vorher fragen** gestellt hast, fragt nicht in der Sitzung: Der Aufruf wird im Postausgang gehalten, und der Agent macht weiter. Eine Zeile in der Unterhaltung sagt **Wartet im Postausgang auf deine Freigabe** und später, ob er gesendet oder verworfen wurde ([Der Postausgang](/guide/inbox#the-outbox-calls-held-for-your-ok)).

Im Modus **Automatisch** von Claude Code kann die Sicherheitsprüfung einen Befehl direkt verweigern, statt zu fragen. Eine Karte über dem Nachrichtenfeld sagt dann „Claude hat einen Befehl blockiert“ und nennt den Grund. **Genehmigen und erneut versuchen** stellt die Sitzung auf Fragen um und lässt den Agent den Befehl noch einmal ausführen, sodass er als normale Genehmigung wieder bei dir landet; **Schließen** lässt es dabei.

## Fragen beantworten und Pläne genehmigen

Wenn der Agent dir eine Frage stellt, zeigt eine Karte mit gelbem Rand die Fragen und ihre Auswahlmöglichkeiten:

- Wähle eine Option, oder mehrere, wo „Beliebig viele auswählen“ steht. Mit **Andere – eigene Antwort eingeben** schreibst du eigene Worte.
- **Dateien anhängen** fügt einer Antwort Dateien hinzu.
- Die Tasten 1 bis 9 wählen eine Option der ersten noch unbeantworteten Frage.
- **Antwort senden** sendet sie als deine nächste Nachricht. Wenn die Sitzung während der Frage angehalten hat, startet **Fortsetzen und antworten** sie mit deiner Antwort neu. Bei einer Claude-Code-Sitzung, die in VS Code oder einem Terminal wartet, beendet **Hier antworten** sie dort und setzt sie hier mit deiner Antwort fort; eine Codex-Sitzung dort muss dort beantwortet werden.

Kommt die Frage stattdessen als Genehmigungskarte, heißen ihre Schaltflächen **Antworten senden** und, bei Claude Code, **Überspringen**.

**Pläne.** Im **Plan**-Modus von Claude Code liest und plant der Agent und zeigt seinen Plan dann in einer Karte: **Änderungen genehmigen und automatisch akzeptieren** (los geht’s, Änderungen ohne Nachfrage), **Genehmigen, vor Änderungen fragen** oder **Weiter planen** (er bleibt im Plan; sag ihm, was er ändern soll). Im Plan-Modus von Codex bespricht und plant Codex zuerst und kann dir Rückfragen stellen. Der Plan-Modus von Custom endet mit einem nummerierten Plan; wechsle die Berechtigungen (Shift+Tab) und antworte, damit er ausgeführt wird.

## Formulare ausfüllen, die ein Dienst anfordert

Wenn ein Dienst, den du verbunden hast, mitten in einer Aufgabe etwas von dir braucht (ein Datum, eine Auswahl, eine Seite zum Genehmigen), erscheint sein Formular als Karte, egal welcher Agent arbeitet: „Linear bittet dich, ein Formular auszufüllen“, „… bittet dich, eine Seite zu öffnen“ oder „… bittet um Erlaubnis fortzufahren“. Fülle die Felder aus und drücke **Senden** (oder **Öffnen**, das die Seite öffnet, oder **Erlauben**), oder drücke **Ablehnen** oder **Nicht jetzt**. Die eigenen Tool-Server von Codex fragen auf dieselbe Weise. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).

## Dem Agent schreiben, während er arbeitet

Du kannst tippen, während ein Durchlauf läuft. Was die Eingabetaste dann bewirkt, legt **Senden, während ein Agent arbeitet** unter [Einstellungen → App → Allgemein](/settings?s=general&find=Sending%20while%20an%20agent%20works) fest, für jeden Browser einzeln:

- **In laufenden Durchlauf senden** (Standard): Die Eingabetaste fügt deine Nachricht dem laufenden Durchlauf hinzu, sodass der Agent sie sofort berücksichtigt. Strg+Eingabe (⌘Eingabe auf dem Mac) stellt sie stattdessen in die Warteschlange.
- **Auf Ende warten**: Die Eingabetaste stellt deine Nachricht in die Warteschlange, damit sie beim Ende des Durchlaufs rausgeht. Strg+Eingabe fügt sie stattdessen dem Durchlauf hinzu.

Das Nachrichtenfeld sagt, was gilt: „Folgenachricht in den laufenden Durchlauf senden“ oder „Nachricht für das Ende dieses Durchlaufs in die Warteschlange stellen“. Auf einem Touchscreen tut die Senden-Schaltfläche das, was die Eingabetaste täte. Custom nimmt Folgenachrichten beim nächsten Modellschritt auf, nachdem laufende Tools fertig sind; **Jetzt senden** tut dasselbe für eine Nachricht in der Warteschlange. Wenn deine Custom-Sitzung schon vor einem App-Update lief und noch keine Live-Folgenachrichten annehmen kann, bleibt deine Nachricht stattdessen in der Warteschlange, bis der Durchlauf endet. Andere ACP-Agenten nehmen jeweils nur eine Nachricht an, daher wartet eine Nachricht, die du sendest, während sie arbeiten, immer in der Warteschlange. Bei Claude Code zeigt eine Nachricht, die gesendet wurde, während der Agent arbeitete, darunter „während der Arbeit gesendet“. Die Antwort des Agents darauf erscheint als Antwort unter deiner Nachricht, auch wenn der Agent danach mit seiner Arbeit weitermacht.

## Die Warteschlange verwalten

Nachrichten in der Warteschlange warten über dem Nachrichtenfeld, nummeriert in der Reihenfolge, in der sie rausgehen; eine, die du einreihst, erscheint dort in dem Moment, in dem du sie sendest. Bei jedem Ende eines Durchlaufs geht von selbst eine raus.

- Ziehe eine Nachricht am Griff, um die Reihenfolge zu ändern.
- **Jetzt senden** (der Pfeil): sendet sie sofort in den laufenden Durchlauf.
- **Bearbeiten** (der Stift): ändere ihren Text, nimm Anhänge weg oder füge weitere hinzu (**Anhängen**, oder Dateien einfügen oder ablegen). Eingabetaste speichert, Esc bricht ab.
- **Entfernen** (der Papierkorb): nimmt sie aus der Warteschlange; ihre Anhänge werden gelöscht.
- Wenn du den Agent stoppst oder die App neu startet, pausiert die Warteschlange: „Die Warteschlange ist pausiert (der Agent wurde gestoppt, oder der Server wurde neu gestartet).“ **Fortsetzen** lässt die Nachrichten wieder rausgehen, sobald der Agent frei wird. Nachrichten, die Agenten einander senden (die Nachrichten einer Sitzung an ihre Hydor-Subagenten und deren Antworten), pausieren bei einem Neustart nicht: Wenn der Agent, auf den sie warten, noch arbeitet, gehen sie raus, wenn sein Durchlauf endet. Auch ein erreichtes Ausgabenlimit hält die Warteschlange an; wenn du das Limit erhöhst, geht es weiter.

## Agent, Modell, Aufwand oder Berechtigungen ändern

Das Nachrichtenfeld einer Sitzung hat den **Agent** der Startseite und ihre drei Auswahlen **Modell**, **Aufwand** und **Berechtigungen** in einem Chip neben dem **+** (er öffnet **Optionen**, auf dem Smartphone ein Sheet von unten). Darunter stehen die übrigen Optionen der Startseite für diese Sitzung, in derselben Reihenfolge: **Konto** (ein anderes Konto übernimmt die Sitzung ab deiner nächsten Nachricht; wird angezeigt, wenn der Agent mehr als eines hat), **Vertraulich** und **Arena** (angezeigt, wie sie sind: Beide werden beim Start einer Sitzung gewählt, und ein Klick sagt, wie du zur anderen kommst), **Memory**, **Ausgabenlimit**, **Schwarm**, **Forschung** und **Richtlinien** (dieselben Auswahlen und Dialoge wie in den [Sitzungseinstellungen](/guide/research#turn-it-on) des Sitzungsmenüs; Schwarm und Forschung ändern sich ab deiner nächsten Nachricht). Der Chip nennt den Agent und das Modell sowie Aufwand und Berechtigungen, wenn sie vom Üblichen abweichen; er wird gelb, solange der Agent alles ohne Nachfrage tun darf (**Bypass** oder bei Codex **Voller Zugriff**). Ein anderer Agent gilt ab deiner nächsten Nachricht (siehe [Den Agent in einer Sitzung wechseln](/guide/agents#switch-agents-in-a-session)). Eine Änderung von Modell, Aufwand oder Berechtigungen gilt sofort für den laufenden Agent und bleibt bei der Sitzung. Shift+Tab wechselt zum nächsten Berechtigungsmodus. Das Modellmenü listet nur die Modelle dieses Agents; um die Unterhaltung zu einem anderen Agent zu verlegen, nutze [In einem anderen Agent fortsetzen](#continue-in-another-agent).

## Einen Teil einer Antwort zitieren

Markiere Text in einer Antwort des Agents oder in einer deiner eigenen Nachrichten: Über dem Text erscheint eine Schaltfläche **Zitat** (auf einem Touchscreen darunter). Sie setzt den Text als Zitat ins Nachrichtenfeld, mit dem Cursor dahinter, sodass du auf diesen Teil antworten oder etwas aufgreifen kannst, das du früher gesagt hast.

## Text in einer Sitzung suchen

Drücke Strg+F (⌘F) in einer Sitzung. **In dieser Sitzung suchen** durchsucht deine Nachrichten und die des Agents, auch die noch nicht geladenen Teile (nicht die Befehlsausgabe). Gib zwei oder mehr Buchstaben ein; es springt zum neuesten Treffer, hebt die Wörter hervor und zeigt „3 von 12“. Die Eingabetaste springt zum älteren Treffer, Shift+Eingabe zum neueren (oder nutze die Pfeile), und Esc schließt die Suche. Eine eingeklappte lange Nachricht öffnet sich an der Fundstelle. Eine Nachricht, die du im Suchfeld (Strg+K) auswählst, öffnet ihre Sitzung mit bereits ausgefüllter Leiste.

## Mehr im Nachrichtenfeld

- ↑ in einem leeren Feld holt deine früheren Nachrichten in dieser Sitzung zurück, die neueste zuerst; ↓ geht wieder vor.
- Was du tippst, wird in diesem Browser für jede Sitzung als Entwurf gespeichert, sodass es noch da ist, wenn du zurückkommst.
- Strg+S (⌘S) legt den Entwurf beiseite und leert das Feld; Strg+S in einem leeren Feld holt ihn zurück.
- Ein sehr langer eingefügter Text (32.000 Zeichen oder mehr) wird als Textdatei angehängt, statt das Feld zu füllen.
- Der Platzhalter sagt dir, was das Senden bewirkt: „Nachricht an Claude…“ oder „Nachricht zum Fortsetzen…“, wenn der Agent nicht läuft: Das Senden startet ihn dann mit der ganzen Unterhaltung neu.

## Das Detailfenster: Änderungen, Befehle und Infos

**Details** in der Kopfzeile öffnet ein Fenster mit drei Tabs. Auf einem breiten Bildschirm sitzt es neben der Unterhaltung und bleibt offen, wenn du zwischen Sitzungen wechselst; auf einem schmaleren schiebt es sich über die Seite; auf einem Smartphone öffnet es sich nur auf Wunsch.

- **Änderungen**: jede Datei, die die Sitzung geändert hat, die am stärksten geänderten zuerst, mit hinzugefügten und entfernten Zeilen. Klicke auf eine Datei, um den Diff jeder Änderung zu sehen; **Öffnen** öffnet die Datei.
- **Befehle**: jeder Shell-Befehl, den der Agent ausgeführt hat, die neuesten zuerst, mit den Filtern **Alle**, **Fehlgeschlagen** und **Hintergrund**. Klicke auf einen, um seine Ausgabe zu sehen.
- **Infos**: der Agent, der Status (wie in der Kopfzeile: **Fertig**, **Angehalten**, **Fehlgeschlagen** oder was er gerade tut), Ordner, Branch, Modell und Aufwand, wie viel vom Kontext belegt ist, wann sie gestartet wurde und zuletzt aktiv war, ihre Aktivität (Prompts, Durchläufe, Tool-Aufrufe, Befehle), Tokens (eingehend, im Cache, ausgehend), die API-Kosten (was dieselbe Arbeit zu API-Preisen kosten würde), die Ausgabegeschwindigkeit, wo sie gestartet wurde (Hydor, VS Code, ein Terminal, die Desktop-App von Claude…) und, solange ihr Agent läuft, **Zugehörige Programme**: was sie gerade verbrauchen (CPU, Arbeitsspeicher und wie viele), mit den [Limits](/guide/app#limit-each-session), unter denen sie laufen. Darunter: ihre Hintergrundaufgaben (öffne eine, um zu sehen, was sie getan hat, oder **Stoppen** sie) und **Im Terminal fortsetzen**: der Befehl, der die Sitzung in einem Terminal fortsetzt, und die Sitzungs-ID, jeweils mit einer Kopieren-Schaltfläche (Claude Code und Codex).

## Die Anzeigen lesen: Kontext, Cache und Geschwindigkeit

Ein kleiner Ring mit einer Prozentzahl neben dem Mikrofon füllt sich, während die Unterhaltung das Kontextfenster des Modells aufbraucht; der Rest steht am Fuß des Menüs des Optionen-Chips:

- **Kontext**: der Ring und die Zeile **Kontext** in den Optionen („42 % belegt“). Zeige auf den Ring, um die genaue Anzahl der Tokens zu sehen. Über 85 % wird er gelb. Klicke auf den Ring oder auf **Verdichten** in den Optionen, um die Unterhaltung zu verdichten (nicht, während ein Durchlauf läuft). In einer Custom-Sitzung zeigst du auf den Ring, um die Tokens und eine Aufschlüsselung zu sehen, wofür sie verwendet werden; die Aufschlüsselung findest du unter dem Pfeil der Zeile **Kontext**; Custom verdichtet von selbst, daher gibt es kein **Verdichten**, und ein Klick auf den Ring bewirkt nichts (siehe [Lange Unterhaltungen und lange Ausgaben](/guide/custom#long-conversations-and-long-output)).
- **cache 4m** (Claude Code): Der Prompt-Cache hält die Unterhaltung eine Weile bereit (5 Minuten oder eine Stunde), sodass die nächste Nachricht günstiger und schneller ist. Er zählt herunter, solange du nichts sendest; eine Nachricht davor nutzt ihn wieder und startet die Zählung neu. **Cache kalt** bedeutet, dass die nächste Nachricht ihn neu aufbaut.
- **85 tok/s**: wie schnell die letzte Antwort geschrieben wurde, in Tokens pro Sekunde.

## Einen Durchlauf stoppen, den Agenten stoppen oder fortsetzen

Der Stopp-Button neben dem Nachrichtenfeld hat einen rotierenden Ring, solange der Agent startet oder arbeitet. Der Ring pausiert, wenn der Agent dich braucht, und steht still, wenn dein Gerät reduzierte Bewegung wünscht. Wenn der Durchlauf vorbei ist, bleibt der Stopp-Button samt Ring erhalten, solange Hintergrundaufgaben oder Subagents, die der Agent gestartet hat, noch laufen, zum Beispiel ein Hydor-Subagent, ein Claude-Code-Subagent, ein weiterlaufender Befehl oder ein Monitor; daneben ist der Senden-Button, und das Feld nimmt deine Nachrichten wie gewohnt entgegen. Zeig auf „Stoppen“, um zu sehen, was damit gestoppt wird: „Stoppt diesen Durchlauf, 2 Subagents und 1 Hintergrundaufgabe“ oder „Stoppt 2 Subagents“. Es stoppt all das auf einmal: den Durchlauf, jeden laufenden Subagent und jede laufende Hintergrundaufgabe sowie die, die diese wiederum gestartet haben. Ein auf diese Weise gestoppter Hydor-Subagent meldet sich nicht bei seinem übergeordneten Agenten zurück, und eine Meldung, die schon unterwegs war, wartet in der pausierten Warteschlange des übergeordneten Agenten, statt ihn aufzuwecken; klicke auf **Fortsetzen**, um die Warteschlange freizugeben. Solange Jobs, die die Sitzung gestartet hat (mit dem Befehl `job` oder als Lauf von Experimenten), noch laufen, behält sie den Status „Arbeitet · 1 im Hintergrund“. „Stoppen“ hält sie aber nicht an, deshalb erscheint der Stopp-Button für sie allein nicht: stoppe sie in **Jobs**.

- **Einen Durchlauf stoppen**: Klicke in der Kopfzeile auf **Stoppen** oder auf den runden, quadratischen Button neben dem Nachrichtenfeld, der auch das stoppt, was die Sitzung gestartet hat (siehe oben). (Esc stoppt ihn nicht: Es schließt nur, was gerade offen ist, etwa die Suchleiste oder eine Liste.) Der Agent hört auf, was er gerade tut; der Durchlauf zeigt „Angehalten nach …“. Die Sitzung zeigt sich in dem Moment als gestoppt, in dem du auf **Stoppen** klickst, auch wenn der Agent ein paar Sekunden zum Beenden braucht (etwa um einen laufenden Befehl zu beenden); arbeitet der Agent 20 Sekunden später noch, zeigt die Sitzung ihn wieder als arbeitend an. Der Agent bleibt für deine nächste Nachricht bereit, und die Warteschlange pausiert, bis du sie fortsetzt.
- **Agentenprozess stoppen**: das Menü der Sitzung (⋯) → **Mehr** → **Agentenprozess stoppen**, wenn gerade kein Durchlauf läuft. Das Programm des Agenten wird beendet; die Sitzung und ihr Verlauf bleiben erhalten, und es wird angezeigt, wie der letzte Durchlauf endete (**Fertig**, **Angehalten** oder **Fehlgeschlagen**).
- **Fortsetzen**: Mit **Fortsetzen** in der Kopfzeile startet der Agent mit der gesamten Unterhaltung erneut, oder du sendest einfach eine Nachricht („Nachricht zum Fortfahren …“): Auch das startet ihn erneut, bei Claude Code, Codex und Custom gleichermaßen. Nach **Fertig** ist **Fortsetzen** ein dezenterer Button, da deine nächste Nachricht genügt. Wurde die Sitzung erst vor Sekunden beschrieben, etwa aus VS Code oder einem Terminal, fragt die App zuerst nach, da zwei Programme, die in dieselbe Sitzung schreiben, ihren Verlauf beschädigen können.
- Ein Agent, der im Leerlauf bleibt, stoppt nach drei Stunden von selbst (wenn nichts auf dich wartet und keine Hintergrundaufgabe läuft); deine nächste Nachricht startet ihn erneut.

## Der Sitzung ein Ziel geben

Ein Ziel hält den Agenten Runde für Runde bei der Arbeit, bis Prüfungen erfüllt sind, denen du zugestimmt hast. Setze eines über das Menü der Sitzung (⋯) → **Ziel setzen**, oder starte eine Sitzung gleich mit einem Ziel, über **Optionen** auf der Startseite. Wie Ziele funktionieren, vom Vereinbaren der Prüfungen bis zum Steuern eines laufenden Ziels, steht unter [Ziele](/guide/goals).

## Eine Sitzung verzweigen

Ein Zweig ist eine neue Sitzung, die mit dieser Unterhaltung beginnt und dann etwas anderes ausprobiert; diese Sitzung bleibt unverändert.

1. Öffne das Menü der Sitzung (⋯) → **Verzweigen**, oder klicke unter einer Antwort auf **Ab dieser Antwort verzweigen** (bei Claude Code unter jeder Antwort; bei Codex und Custom unter der letzten Antwort eines abgeschlossenen Durchgangs), um die Unterhaltung nur bis dorthin zu übernehmen.
2. Schreibe, was der Zweig tun soll („Was soll der Zweig stattdessen versuchen?“).
3. Klicke auf **Verzweigen** (oder drücke Strg+Enter).

Der Zweig öffnet sich mit dem Titel „… · fork“ und demselben Agent, Modell, Aufwand, denselben Berechtigungen und demselben Konto. Oben steht eine Zeile „Verzweigt von …“ mit **Öffnen** (ein Codex-Zweig zeigt nur, was danach kam; die frühere Unterhaltung befindet sich im Original). Verzweigen funktioniert für Claude Code, Codex und Custom, nicht aber für eine Sitzung, die in einer anderen App geöffnet ist. Auch eine Claude-Code-Antwort aus der Zeit vor dem Verdichten der Unterhaltung kann verzweigt werden: Der Zweig beginnt mit der gesamten Unterhaltung bis zu dieser Antwort, so wie sie vor dem Verdichten war.

## Von hier aus bearbeiten

Gehe zu einer deiner Nachrichten zurück und sage stattdessen etwas anderes:

1. Klicke unter deiner Nachricht auf **Von hier aus bearbeiten**.
2. Ändere den Text.
3. Setze ein Häkchen bei **Dateien auf den Stand vor dieser Nachricht zurücksetzen**, wenn die Änderungen des Agents seitdem ebenfalls rückgängig gemacht werden sollen.
4. Klicke auf **Von hier senden** (Enter) oder auf **Abbrechen** (Esc).

Die Unterhaltung wird in einer Kopie bis kurz vor dieser Nachricht fortgesetzt; die Kopie übernimmt den Titel dieser Sitzung, und diese Sitzung wird archiviert. Das Zurücksetzen der Dateien funktioniert bei Claude Code (über dessen eigene Checkpoints von Nachrichten, die aus dieser App gesendet wurden), bei Custom (die Dateien, die seine eigenen Bearbeitungen geändert haben; was Befehle geändert haben, bleibt) und bei jeder Sitzung in einem Worktree (bei jeder gesendeten Nachricht wird ein Snapshot erstellt). Codex-Sitzungen können Dateien nur in einem Worktree zurücksetzen. Stoppe zuerst den Agent, wenn gerade ein Durchgang läuft. Das Zurücksetzen der Dateien wird abgelehnt, solange das [Ziel](/guide/goals) der Sitzung ihre Dateien prüft oder zurücksetzt („Das Ziel dieser Sitzung prüft gerade ihre Dateien: Warte, bis es fertig ist, oder pausiere zuerst das Ziel“); das Ziel selbst endet, wenn die Sitzung ersetzt wird. Von hier aus bearbeiten funktioniert für Claude Code, Codex und Custom.

## In einem anderen Agent fortsetzen

Übergib die Unterhaltung an einen anderen Agent und mache dort weiter:

1. Öffne das Menü der Sitzung (⋯) → **Continue in Codex** (oder **Continue in Claude Code** bzw. **Continue in Custom Agent**, sobald Custom ein Modell hat).
2. Ein Hinweis über dem Nachrichtenfeld sagt, dass deine nächste Nachricht dorthin geht; die Auswahl von Modell, Aufwand und Berechtigungen gilt nun für den neuen Agent. Klicke auf × („Hier bleiben“), um abzubrechen.
3. Schreibe eine Nachricht oder sende einfach ab, um fortzufahren.

Eine neue Sitzung öffnet sich im selben Ordner mit der bisherigen Unterhaltung: deiner ersten Anfrage, dann den neuesten Nachrichten, die in etwa 15.000 Tokens passen, und den geänderten Dateien. Der neue Agent erfährt, wo die gesamte Unterhaltung gespeichert ist, und kann so nachlesen, was weggelassen wurde. Seine erste Nachricht zeigt „Fortgesetzt von Claude Code“ mit **Diese Sitzung öffnen** und einer Schaltfläche, die die übernommenen Nachrichten anzeigt; die alte Sitzung zeigt „Diese Unterhaltung wurde in Codex fortgesetzt“ mit **Öffnen**. Das funktioniert von Claude-Code- und Codex-Sitzungen aus.

## Die Unterhaltung verdichten

Beim Verdichten wird der bisherige Verlauf durch eine Zusammenfassung ersetzt, wodurch im Kontext des Modells wieder Platz für das Kommende frei wird. Verwende das Menü der Sitzung (⋯) → **Mehr** → **Unterhaltung verdichten** oder klicke auf die Kontextanzeige im Nachrichtenfeld und bestätige mit **Verdichten**. Das funktioniert für Claude Code und Codex, zwischen zwei Durchgängen. Custom verdichtet eine lange Unterhaltung selbstständig.

## Umbenennen, anheften, zurückstellen, abschließen, archivieren oder löschen

Das meiste davon findest du im Menü der Sitzung (⋯) und im Menü ihrer Zeile in der Seitenleiste: Zeige auf die Zeile und klicke am Ende auf **⋯** oder klicke mit der rechten Maustaste darauf (auf dem Smartphone tippe auf ihr **⋯**).

- **Umbenennen**: Gib einen neuen Titel ein (bis zu 200 Zeichen); Enter speichert, Esc bricht ab. Dasselbe bewirken ein Doppelklick auf den Titel in der Kopfzeile oder in der Seitenleiste sowie F2 bei einer ausgewählten Zeile.
- **Ordner umbenennen** (in der Seitenleiste, für eine Sitzung ohne Projekt): ein eigener Name für den Ordner, in dem sie arbeitet; die Seitenleiste, die Sitzungszeilen und die Ordnermenüs zeigen ihn auf jedem Gerät an; auf dem Datenträger behält der Ordner seinen eigenen Namen. Lass das Feld leer, um den Namen des Ordners zu verwenden.
- **In Ordner verschieben** (in der Seitenleiste): legt die Sitzung in einen deiner Ordner für Sitzungen, nimmt sie wieder heraus oder erstellt einen neuen Ordner dafür. Du kannst die Sitzung auch auf die Überschrift eines Ordners ziehen. Siehe [Sitzungen in Ordner sortieren](/guide/start#sort-sessions-into-folders).
- **Oben anheften** / **Lösen**: Angeheftete Sitzungen bleiben in der Gruppe **Angepinnt**, in der Reihenfolge, in die du sie ziehst. Du kannst auch eine Sitzung aus den Gruppen darunter (einem Projekt, einem Ordner, Heute, Gestern …) auf „Angepinnt“ ziehen, oder auf „Zum Anheften hier ablegen“, wenn noch nichts angeheftet ist.
- **Zurückstellen**: Blendet die Sitzung in der Gruppe **Zurückgestellt** am Ende aus, bis **Eine Stunde lang**, **Für 3 Stunden**, **Heute Abend** (solange es vor 17 Uhr ist), **Morgen früh**, **Nächste Woche** (Montagmorgen) oder **Datum und Uhrzeit auswählen**. Sie kommt von selbst mit einem Hinweis zurück oder früher, wenn sie dich braucht. **Zurückstellung aufheben** holt sie sofort zurück.
- **Abschließen: vorerst erledigt**: für fertige Arbeit. Der Agent hält an (nicht verfügbar, solange ein Durchgang läuft) und die Sitzung gilt als gelesen; ihr Verlauf und ein eventueller Worktree bleiben erhalten. Bei einer Sitzung in einem Worktree öffnet sich der Dialog des Worktrees, damit du ihn entfernen kannst.
- **Archivieren** / **Aus Archiv holen**: nimmt die Sitzung aus der Liste; nichts wird gelöscht. Archivierte Sitzungen findest du mit dem Suchfeld (Strg+K), markiert als **Archiviert**; öffne eine und wähle in ihrem Menü **Aus Archiv holen**.
- **Sitzung löschen**: Nach deiner Bestätigung wird der Verlauf der Sitzung vom Datenträger entfernt, sodass sie auch in der eigenen Befehlszeile des Agents und in VS Code verschwindet. Das lässt sich nicht rückgängig machen. **Löschen** im Menü ihrer Zeile in der Seitenleiste bewirkt dasselbe.

Bis du sie löschst, behält die App jede Sitzung, auch wenn das Programm des Agents seine Unterhaltung löscht (Claude Code tut das nach 30 Tagen, sofern nicht anders eingestellt): Sie kommt zurück, ist aufgelistet und lässt sich öffnen. Sitzungen, die ein Jahr lang niemand benutzt hat, werden automatisch gelöscht, es sei denn, du heftest sie an oder änderst das unter Einstellungen → Allgemein (siehe [Inaktive Sitzungen löschen](/guide/app#delete-inactive-sessions)).

Anheften, Lösen, Archivieren, Aus Archiv holen und Zurückstellen zeigen einen Hinweis mit **Rückgängig machen**, und Strg+Z macht sie innerhalb von 8 Sekunden rückgängig.

## Einen schreibgeschützten Link teilen

Das Menü der Sitzung (⋯) → **Schreibgeschützten Link teilen** erstellt einen Link, den jeder ohne dein Passwort öffnen kann (nicht für eine [vertrauliche Sitzung](#keep-a-session-confidential)). Man sieht die Unterhaltung live (Nachrichten, die Schritte mit Namen, Dateiänderungen und Seiten, die der Agent gezeigt hat), nicht aber die Ausgabe von Befehlen oder die Gedanken des Agents, und kann nichts eingeben oder ändern. Wähle, wie lange er funktioniert (**Ein Tag**, **Eine Woche**, **Einen Monat**, **Bis zur Deaktivierung**), und klicke auf **Link erstellen**; der Link wird nur einmal angezeigt. Derselbe Dialog listet die aktuell funktionierenden Links auf, wie oft jeder geöffnet wurde, und deaktiviert einen davon. Siehe [Smartphones, andere Computer und Teilen](/guide/devices).

## Eine Unterhaltung exportieren

Das Menü der Sitzung (⋯) → **Exportieren** nimmt die Unterhaltung aus dem Chat heraus:

- **Als Markdown exportieren** lädt sie als Markdown-Datei herunter, benannt nach dem Titel der Sitzung, zum Aufbewahren, Versenden oder Öffnen in jeder Notizen-App.
- **Als Markdown kopieren** legt denselben Text in die Zwischenablage, damit du ihn in Notizen, eine E-Mail oder eine andere App einfügen kannst.
- **Als Dokument behalten** macht daraus ein Dokument, das im Projekt der Sitzung gespeichert wird (es erscheint unter **Dateien** des Projekts; ohne Projekt bleibt es bei dieser Unterhaltung), um es dort zu lesen, zu bearbeiten, zu kommentieren, zu drucken und als Word oder PDF zu exportieren. Eine Meldung sagt, wann es fertig ist; **Öffnen** führt dich dorthin.

Was enthalten ist: der Titel und das Datum, dann jede deiner Nachrichten und jede Antwort des Agents in der Reihenfolge, mit ihren Uhrzeiten. Die Schritte eines Durchgangs werden weggelassen, an ihrer Stelle steht eine Zeile wie „Gearbeitet für 2 Min. · 5 Schritte“. Dateien, die der Agent übergeben hat, werden namentlich aufgelistet. Antwortkarten werden zu lesbarem Text, Tabellen bleiben Tabellen (ein Vergleich, eine Datentabelle, die Zahlen eines Diagramms). Diagramme bleiben als ihr Mermaid-Code und Formeln als LaTeX, so wie der Agent sie geschrieben hat. Im Dokument sind außerdem die Bilder enthalten, die du an deine Nachrichten angehängt hast, und die Bilder, die der Agent übergeben hat.

Auch eine [vertrauliche Sitzung](#keep-a-session-confidential) lässt sich exportieren, und ihr Dokument bleibt wie der Rest ihrer Arbeit auf diesem Computer: Bilder aus dem Web bleiben Links und werden nicht abgerufen. In einem Terminal leistet `hydor sessions export` dasselbe ([Hydor in einem Terminal](/guide/terminal)).

## In einem Worktree arbeiten

Ein Worktree ist eine separate Kopie der Dateien eines Repositorys auf einem neuen Branch, sodass ein Agent Dinge ändern kann, ohne deine eigene Kopie anzufassen, und mehrere Agents gleichzeitig an einem Repository arbeiten können.

- **Einen starten**: Öffne auf der Startseite **Ordner** und aktiviere **New worktree from …** (der Ordner muss in einem Git-Repository liegen). Die App erstellt einen Branch namens `agent/` plus ein paar Wörter deiner Aufgabe, ausgehend vom ausgecheckten Branch, und einen Ordner dafür im Datenordner der App. Die Einstellung wird für das nächste Mal gespeichert.
- **Snapshots**: In einem Worktree speichert die App bei jeder gesendeten Nachricht einen Snapshot der Dateien, damit [Von hier aus bearbeiten](#edit-from-here) sie zurücksetzen kann.
- **Ansehen**: Das Menü der Sitzung (⋯) → **Ordner und Code** → **Worktree: agent/…** zeigt den Branch und den, von dem er stammt, seinen Ordner, wie viele Commits er voraus oder zurück ist, und nicht committete Änderungen, mit **Änderungen prüfen** und **In Git öffnen**.
- **Entfernen**, wenn die Arbeit erledigt ist: im selben Dialog **Worktree entfernen**. Der Ordner verschwindet; die Sitzung behält ihren Verlauf. Der Branch bleibt, sodass nichts Committetes verloren geht, es sei denn, du setzt ein Häkchen bei **Delete branch … too** (ein Branch ohne neue Inhalte wird ohnehin gelöscht). Bei nicht committeten Änderungen setze zuerst ein Häkchen bei **Discard the … uncommitted changes**. Der Agent hält an, falls er lief, und Zweige oder Bearbeitungen, die sich den Worktree teilen, verlieren ihn ebenfalls.

## Einen Pull-Request öffnen

Vom Branch einer Sitzung aus öffnet das Menü der Sitzung (⋯) → **Ordner und Code** → **Pull-Request öffnen** einen Pull-Request auf GitHub oder Gitea. **Für mich schreiben** verfasst Titel und Beschreibung aus den Commits und dem Diff; ein Kontrollkästchen kann nicht committete Änderungen vorher committen; **Entwurf** markiert ihn als Entwurf; der Branch wird gepusht, wenn du auf **Pull-Request öffnen** klickst. Du brauchst ein Konto unter [Einstellungen → Source control](/settings?s=scm). **Vorhandenen Pull-Request verknüpfen …** verknüpft einen, der anderswo geöffnet wurde.

Nach der Verknüpfung erscheinen sein Status und seine Prüfungen als Badge in der Seitenleiste und in der Kopfzeile und werden alle paar Minuten aktualisiert, mit einem Hinweis, wenn er gemergt wurde oder seine Prüfungen abgeschlossen sind. Derselbe Menüpunkt, jetzt **Pull request #12**, enthält **Open on GitHub** (oder Gitea), **Änderungen prüfen**, **Jetzt prüfen** und **Verknüpfung aufheben**. **Änderungen prüfen** im Untermenü geht Datei für Datei durch, was der Branch ändert. Siehe [Dateien, Git, Terminal und Vorschau](/guide/files-git).

## Wenn ein Nutzungslimit eine Sitzung stoppt

Wenn bei einem Claude-Code- oder Codex-Tarif die Nutzung aufgebraucht ist, sagt ein Banner über dem Nachrichtenfeld, wessen Limit erreicht wurde, welches Limit und wann es zurückgesetzt wird: „Du hast das Nutzungslimit von Claude Code erreicht“ bei einem Konto dieses Agents, „Alle deine Claude-Code-Konten haben ihr Nutzungslimit erreicht“, wenn du mehrere hast und keines mehr Nutzung übrig hat, oder das Konto mit seinem Namen („Work hat sein Nutzungslimit erreicht“), wenn ein anderes noch welche hat.

Wenn eines der anderen Konten dieses Agents noch Nutzung übrig hat, siehst du kein Banner, solange **Bei erreichtem Limit das Konto wechseln** aktiviert ist: Die Sitzung wechselt zu diesem Konto und macht weiter (neue Sitzungen starten dort). Ist die Option deaktiviert, nennt das Banner dieses Konto und bietet **Aktivieren** an.

- **Beim Zurücksetzen fortsetzen** setzt die Sitzung eine Minute nach dem Zurücksetzen des Limits automatisch fort, mit der Nachricht „Mach dort weiter, wo du aufgehört hast.“ Das Banner zeigt dann, wann, mit **Abbrechen**.
- **Reset verwenden**: Wenn dein Konto Limit-Resets besitzt, nennt das Banner ihre Anzahl, und damit wird jetzt einer verwendet.
- [Nach Nutzungslimits fortsetzen](/settings?s=general&find=Resume%20after%20usage%20limits) unter Einstellungen → App → Allgemein macht das für jede Sitzung, die ein Limit stoppt. Ist die Option aktiviert, siehst du in der Sitzung keine Warnung: Eine Zeile über dem Nachrichtenfeld sagt, wessen Limit erreicht wurde (wie das Banner), welches Limit und wann es weitergeht („Alle deine Claude-Code-Konten haben ihr Nutzungslimit erreicht“, dann „Aktuelle Sitzung (5 Std.) · Läuft in 3 Std. 15 Min. von selbst weiter.“), mit **Reset verwenden**, wenn du einen hast, und **Abbrechen**. Eine Sitzung, die du selbst mit **Stoppen** angehalten hast, läuft nicht von selbst weiter.

Der Zeitpunkt richtet sich nach dem Limit: Wenn sich das Zurücksetzen verschiebt oder die Nutzung früher wiederkommt, läuft die Sitzung dann weiter. Siehe [Nutzung, Limits und Kosten](/guide/usage).

## Sitzungen, die in VS Code oder einem Terminal laufen

Jede Claude-Code- und Codex-Sitzung auf diesem Computer wird aufgelistet, auch die, die du in VS Code, einem Terminal oder der Desktop-App von Claude ausführst. Solange sie dort laufen, zeigt die Liste „Arbeitet in VS Code“, „Braucht dich im Terminal“ oder „In VS Code geöffnet“ (ein grauer Punkt), und du kannst mitlesen, während sie arbeiten. Wartet eine dort auf dich, benachrichtigt dich die App nur, wenn sie eine Minute später immer noch wartet.

- **Eine Claude-Code-Sitzung übernehmen**: Klicke in ihrer Kopfzeile auf **Hier fortsetzen** oder sende einfach eine Nachricht („In VS Code geöffnet – Senden verschiebt sie hierher“). Die App fragt zuerst: Sie beendet die Sitzung in jener App, wobei abgebrochen wird, was sie gerade tut, und setzt sie hier mit ihrem gesamten Verlauf fort. Jene App zeigt sie als beendet an; du kannst sie dort später wieder öffnen.
- **Codex-Sitzungen**, die anderswo geöffnet sind, sind hier schreibgeschützt, weil ein Codex-Prozess dort alle seine Threads bedient. Setze sie dort fort oder schließe sie dort und setze sie dann hier fort.
- Verzweigen ist nicht verfügbar, solange eine Sitzung in einer anderen App geöffnet ist.

## Subagents

Ein Agent kann Teile einer Aufgabe an Subagents übergeben und deren Ergebnisse zurückbekommen. Es gibt zwei Arten, und die App zeigt, welche es ist:

- Ein **Hydor-Subagent** ist eine eigene Sitzung, die Hydor startet, mit beliebigem Agent und Modell. Er hat eine Zeile in der Subagent-Karte in der Unterhaltung der übergeordneten Sitzung, steht in der Seitenleiste unter seiner übergeordneten Sitzung, und du kannst ihn öffnen und mit ihm sprechen. Er hat eigene Kosten und einen eigenen Anteil am Ausgabenlimit der übergeordneten Sitzung, und seine Antwort kommt als Nachricht bei der übergeordneten Sitzung an.
- Ein **Claude-Code-Subagent** (bei Codex ein „Codex-Subagent“: der Name des Programms der Sitzung selbst) wird von diesem Programm innerhalb der Sitzung für einen kurzen Teil seiner Arbeit ausgeführt. Hydor schaltet diese in den Sitzungen, die es ausführt, ab, sodass du sie nur in Sitzungen siehst, die in VS Code oder einem Terminal laufen, und in früheren. Er wird wie ein Hydor-Subagent angezeigt und geöffnet: eine Zeile in einer Karte in der Unterhaltung, eine Zeile in der Seitenleiste und in der Ablage, und eine eigene Seite mit seiner gesamten Unterhaltung. Du kannst aber nicht mit ihm sprechen (sein Leiter kann es), seine Ausgaben zählen als die des Leiters, und er hat keinen Anteil an einem Ausgabenlimit.

In der Seitenleiste stehen Subagents eingeklappt unter ihrer übergeordneten Sitzung, solange sie arbeiten oder auf dich warten, die Hydor-Subagents und die des Programms zusammen, in einer Zeile („3 Subagents · 1 braucht dich“, „2 Subagents“); klicke auf die Zeile, um für jeden eine Zeile zu sehen. Ein Subagent, der fertig ist, verschwindet aus der Seitenleiste, außer du siehst ihn dir gerade an, und die Zeile bleibt offen, solange du einen davon ansiehst. Die Mitglieder eines Schwarms erscheinen als „Schwarm-Mitglieder“, die einer Kampagne als „Kampagnen-Mitglieder“. In der Unterhaltung der übergeordneten Sitzung erscheinen die Subagents, die ein Durchgang gestartet hat, gemeinsam als eine Karte unter diesem Durchgang: die Hydor-Subagents in einer Karte, die des Programms selbst (Claude Code oder Codex) in einer anderen. Die oberste Zeile nennt, wie viele es sind und welcher Art, mit dem, was sie alle gemeinsam haben („6 Claude-Code-Subagents · Sonnet 5.5“, „3 Hydor-Subagents · Claude Code · Sonnet 5.5“, „4 Forscher“ bei einer tiefgehenden Recherche), und wie es um sie steht („5 arbeiten · 1 fertig“, auch „1 braucht dich“, „1 gestoppt“, „1 fehlgeschlagen“). Klicke auf diese Zeile, um die Karte ein- oder auszuklappen: Sie ist offen, solange einer davon arbeitet oder dich braucht, und klappt auf diese eine Zeile zusammen, sobald alle fertig sind.

Darunter hat jeder Subagent eine Zeile: einen Punkt in der Farbe seines Zustands (blau, leicht pulsierend, während er arbeitet; bernsteinfarben, wenn er dich braucht; grün, wenn er fertig ist; grau, wenn er gestoppt wurde; rot, wenn er fehlgeschlagen ist), seinen Titel, auf einem breiten Bildschirm das, was er im Gegensatz zu den anderen hat (seine Art oder sein Modell, der Agent von dir, als der er arbeitet, seine Leistungsstufe), und wie es um ihn steht: wie lange er bisher gearbeitet hat, „Braucht dich“, wann er fertig wurde („vor 3 Min.“), „Gestoppt“ oder „Fehlgeschlagen“. In der Zeile eines Hydor-Subagents stehen außerdem seine Kosten, und wenn du auf einen zeigst, der eine Stufe aufgestiegen ist, erscheint „Aufgestiegen von“ seiner ersten Leistungsstufe und der Grund. Klicke auf eine Zeile, um den Subagent zu öffnen. Solange andere noch arbeiten, werden die fertigen in einer Zeile zusammengefasst, etwa „4 fertig: “ und ihre Titel: Klicke darauf, um sie zu sehen. Fehlgeschlagene bleiben als eigene Zeilen stehen. Wenn mehr als sechs arbeiten, werden fünf angezeigt, mit **3 weitere anzeigen**.

Hat ein Durchgang nur einen Subagent gestartet, erscheint er als einzeilige Karte: sein Symbol mit Statuspunkt, sein Titel, was er ist („Claude-Code-Subagent · Explore · Sonnet 5.5“ oder „Hydor-Subagent · Claude Code · Sonnet 5.5“, mit dem Agent, als der er arbeitet, und seiner Leistungsstufe, wenn er sie hat) und wie es um ihn steht.

Um einen zu stoppen, zeige auf seine Zeile (oder erreiche sie mit Tab), dann erscheint **Stoppen** anstelle seiner Zeitangabe; auf einem Touchscreen ist immer ein kleiner Stopp-Button da. Bei einem Claude-Code-Subagent wird zuerst nachgefragt („Diesen Subagent stoppen?“), ein Hydor-Subagent stoppt sofort, und ein Codex-Subagent lässt sich von hier aus nicht einzeln stoppen. Das **⋯**-Menü der Karte hat **5 Subagents stoppen** (mit der Anzahl der stoppbaren), das alle ohne Nachfrage stoppt. Der Aufruf, der einen Subagent gestartet hat, bleibt ein Schritt in der eingeklappten Arbeit des Durchgangs.

Wenn ein Subagent, der im Hintergrund gearbeitet hat, zurückkommt, zeigt die Unterhaltung der übergeordneten Sitzung eine Zeile: „Antwort von“ und sein Titel, oder „… wurde gestoppt“, oder „… wurde mit einem Fehler gestoppt“, mit dem Anfang dessen, was er geschrieben hat. Klicke darauf, um die Antwort zu lesen, und auf **Sitzung öffnen**, um zu ihm zu gehen. Die Antwort eines Codex-Subagents wird aus seiner eigenen Unterhaltung geholt, wenn du die Zeile öffnest. Eine Antwort, die kam, während die übergeordnete Sitzung noch arbeitete, erscheint an Ort und Stelle, zwischen den Schritten davor und danach.

In einem Hydor-Subagent steht über dem Nachrichtenfeld eine Leiste mit „Subagent von“ und dem Titel der übergeordneten Sitzung („seine Antworten gehen dorthin zurück“), mit **Übergeordnete Sitzung öffnen**. Ein Claude-Code- oder Codex-Subagent öffnet sich ebenfalls als Sitzung, aber schreibgeschützt: Er zeigt die Aufgabe, die er bekommen hat, seine Schritte und seine Antwort, live, während er arbeitet, ohne Nachrichtenfeld und ohne **Fortsetzen** oder Sitzungsmenü. Anstelle des Nachrichtenfelds steht eine Leiste mit „Claude-Code-Subagent von“ und dem Titel der übergeordneten Sitzung („seine Antworten gehen dorthin zurück“), mit **Übergeordnete Sitzung öffnen**. Während ein Claude-Code-Subagent arbeitet, stoppt **Stoppen** in seiner Kopfzeile ihn, mit vorheriger Nachfrage. Ihm eine Nachricht zu senden, ihn fortzusetzen, zu verzweigen, zu übergeben oder zu löschen wird abgelehnt: Sein Programm führt ihn innerhalb der Sitzung der übergeordneten Sitzung aus, also sprich mit der übergeordneten Sitzung.

Eine übergeordnete Sitzung, deren eigener Durchgang vorbei ist, während ihre Subagents noch laufen, ist nicht fertig: Ihr Punkt pulsiert weiter blau, der Ring am Stopp-Button des Nachrichtenfelds dreht sich weiter, ihr Status lautet „Arbeitet · 2 Subagents laufen“, sie zeigt keine „Fertig“-Markierung und bleibt unter „Aktiv“, und du kannst ihr weiterhin eine Nachricht senden. Das gilt für eine Claude-Code-Sitzung und für eine Codex-Sitzung. Ein Hydor-Subagent zählt ebenfalls als laufend, solange Subagents oder Hintergrundaufgaben (ein Befehl, ein Monitor), die er gestartet hat, nach dem Ende seines eigenen Durchgangs noch laufen, sodass seine übergeordnete Sitzung als arbeitend und nicht als fertig angezeigt wird. Ein Ausgabenlimit der übergeordneten Sitzung deckt ihre Hydor-Subagents ab, und was ein Claude-Code- oder Codex-Subagent ausgibt, ist bereits die eigene Ausgabe der übergeordneten Sitzung. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).

Über dem Nachrichtenfeld fasst eine Zeile alles zusammen, was die Sitzung gestartet hat: ihre Subagents und ihre Hintergrundaufgaben (Befehle, Monitore, Workflows). Sie lautet „2 Subagents und 1 Hintergrundaufgabe laufen“, mit „1 braucht dich“ in Bernstein, wenn ein Hydor-Subagent auf dich wartet, oder „3 Subagents · 2 Hintergrundaufgaben · alle fertig“, wenn nichts läuft, und sie ist bei jedem Öffnen der Sitzung eingeklappt. Klicke darauf, um jeden einzelnen aufzulisten: zuerst, was dich braucht, dann, was läuft, dann, was beendet ist, das Neueste zuerst, mit Scrollen innerhalb ab etwa fünf. Jede Zeile sieht gleich aus: ein Symbol mit Statuspunkt, der Titel, was es ist („Hydor-Subagent · Claude Code · Sonnet 5.5“, „Claude-Code-Subagent · Explore · Haiku 5.5“, „Befehl“, „Monitor“, „Workflow“), wie es steht („Arbeitet · 2 Min. 10 s“, „Braucht dich“, „Fertig · vor 3 Min.“, „Gestoppt“, „Fehlgeschlagen“), die Kosten eines Hydor-Subagents (ein Programm-Subagent zeigt keine: seine Ausgaben gehören der übergeordneten Sitzung), **Öffnen** und ein Stopp-Button (ein Quadrat in einem Kreis), solange es läuft. Zeige auf das, was es ist, um zu sehen, wer es ausführt: „Hydor hat es als eigene Sitzung gestartet: öffne sie, um zuzusehen oder mit ihm zu sprechen“ oder „Claude Code führt es in dieser Sitzung aus: öffne es, um zuzusehen“. **Öffnen** bringt dich zur Sitzung eines Hydor-Subagents oder eines Claude-Code- oder Codex-Subagents; ein Befehl, ein Monitor oder ein Workflow öffnet sich in einem Bereich über der rechten Seite der Seite (auf einem Smartphone der ganze Bildschirm), mit Titel, Art und Zustand, **Stoppen**, solange er läuft, und darunter seiner Ausgabe. Sie wird alle zwei Sekunden aktualisiert und bleibt bei den neuesten Zeilen, solange du nicht nach oben scrollst. Der Stopp-Button eines Subagents heißt „Diesen Subagent stoppen“, der einer Aufgabe „Diese Aufgabe stoppen“. **Alle stoppen** am rechten Ende der Zeile stoppt alles, was läuft, wie der Stopp-Button am Feld. Die Mitglieder eines Schwarms oder einer Kampagne werden hier nicht aufgelistet: Ihr Board zeigt sie. Beendete Aufgaben bleiben aufgelistet, bis das Programm des Agents beendet wird; eine in VS Code oder einem Terminal geöffnete Sitzung listet ihre Aufgaben auf, kann sie aber nicht stoppen.

Wie viele Hydor-Subagents eine Sitzung gleichzeitig ausführt, stellst du unter [Einstellungen → Funktionen → Subagents](/settings?s=children) ein: Diese Einstellungen gelten für Hydor-Subagents, weil die eigenen Subagents von Claude Code und Codex innerhalb ihrer Sitzung laufen. Ist [Mit Subagents führen](/settings?s=models&find=Lead%20with%20subagents) in Einstellungen → Modelle → Leistungsstufen eingeschaltet, plant der Haupt-Agent einer Sitzung, übergibt klare Teile an Subagents auf günstigeren Leistungsstufen und prüft deren Arbeit.

## Alles im Menü der Sitzung

Die Schaltfläche ⋯ oben rechts in einer Sitzung öffnet ihr Menü. Manche Einträge erscheinen nur, wenn sie zutreffen; das Menü einer [vertraulichen Sitzung](#keep-a-session-confidential) hat kein **Schreibgeschützten Link teilen**, kein **Pull-Request öffnen**, kein **Browser öffnen**, keine **Verbundene Konten**, kein **In Automatisierung umwandeln** und kein **Als App speichern**, und ihr Memory bleibt aus.

- **Umbenennen**: den Titel direkt bearbeiten.
- **Zoom**: **−**, die Stufe und **+**, für [die Unterhaltung](#zoom-in-and-full-screen) auf diesem Gerät; klicke auf die Stufe, um zu 100 % zurückzukehren.
- **Oben anheften** / **Lösen**.
- **Zurückstellen** (ein Untermenü mit Zeiten) oder **Zurückstellung aufheben (zurück um …)**, solange sie zurückgestellt ist.
- **Abschließen: vorerst erledigt**: stoppt den Agent und markiert die Sitzung als gelesen (nicht, während ein Durchgang läuft).
- **Verzweigen**: eine neue Sitzung aus dieser Unterhaltung (Claude Code, Codex, Custom).
- **In Codex fortsetzen**, **In Claude Code fortsetzen**, **In Custom Agent fortsetzen**: die Unterhaltung zu einem anderen Agent mitnehmen (von Claude Code und Codex aus).
- **Ziel setzen**: Der Agent und du einigt euch auf Prüfungen, und er arbeitet Runde für Runde, bis sie erfüllt sind; jeder Agent; solange kein Ziel gesetzt ist. Siehe [Ziele](/guide/goals).
- **Zweitmeinung**: Das Modell eines anderen Unternehmens prüft die Arbeit eines Durchgangs anhand dessen, was du verlangt hast, und seine Ergebnisse erscheinen unter diesem Durchgang. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).
- **Schreibgeschützten Link teilen**.
- **Exportieren** (ein Untermenü): **Als Markdown exportieren**, **Als Markdown kopieren** und **Als Dokument behalten**. Siehe [Eine Unterhaltung exportieren](#export-a-conversation).
- **Ordner und Code** (ein Untermenü, für Sitzungen mit einem Ordner):
  - **Änderungen prüfen**: was der Branch ändert, Datei für Datei.
  - **Pull-Request öffnen**, oder **Pull-Request #12**, sobald es einen gibt.
  - **Worktree: agent/…**: der Dialog des Worktrees (Sitzungen in einem Worktree).
  - **Ordner durchsuchen**: öffnet Dateien im Ordner der Sitzung.
  - **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen**: in der Desktop-App der Ordner der Sitzung, markiert im Dateimanager des Systems (siehe [Mit Dateien und Ordnern arbeiten](/guide/files-git#work-with-files-and-folders)).
  - **Hier ein Terminal öffnen**: ein neues Terminal im Ordner (auf einem Computer im Bereich unten, auf einem Smartphone auf der Terminal-Seite).
- **Sitzungseinstellungen** (ein Untermenü):
  - **Memory**, mit **Ein** oder **Aus** daneben: schaltet Memory für diese Sitzung ein oder aus („Für alle aus“, wenn Memory in den Einstellungen ausgeschaltet ist). Siehe [Memory](/guide/memory).
  - **Ausgabenlimit**, mit dem Limit daneben: festlegen, ändern oder erhöhen. Siehe [Nutzung, Limits und Kosten](/guide/usage).
  - **Verbundene Konten**: jedes verbundene Konto nur für diese Sitzung ein- oder ausschalten. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).
  - **Schwarm**, mit **Aus**, **Ein** oder **Kampagne** daneben: öffnet einen Dialog, um einen Schwarm oder eine Kampagne ab deiner nächsten Nachricht ein- oder auszuschalten. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research#set-a-swarm-on-a-hard-problem).
  - **Tiefgehende Recherche**, mit **Aus** oder der Anzahl der Suchen daneben: öffnet einen Dialog, um eine tiefgehende Recherche ab deiner nächsten Nachricht ein- oder auszuschalten oder zu ändern. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research#turn-it-on). (Schwarm und Tiefgehende Recherche werden bei einer vertraulichen Sitzung nicht angezeigt, ebenso nicht bei einer Sitzung, die eine andere Sitzung gestartet hat.)
  - **Agent**, mit seinem Namen daneben: öffnet die Seite des Agents (Sitzungen mit einem Agent). Das Nachrichtenfeld wechselt ihn.
- **Mehr** (ein Untermenü):
  - **Browser öffnen** / **Browser anzeigen**: der Browser der Agenten für diese Sitzung, den du beobachten und übernehmen kannst. Siehe [Suche und Browser](/guide/web).
  - **In Automatisierung umwandeln**: Das Hilfsmodell liest die Sitzung und entwirft daraus eine geplante Aufgabe; ändere, was du willst, probiere sie mit einem Testlauf aus und speichere sie dann. Siehe [Geplante Aufgaben](/guide/tasks).
  - **Als App speichern**: startet eine neue App aus dieser Sitzung. Siehe [Apps](/guide/apps).
  - **Unterhaltung verdichten** (Claude Code und Codex).
  - **CLI-Befehl zum Fortsetzen kopieren**: der Befehl, um diese Sitzung in einem Terminal fortzusetzen.
  - **Agentenprozess stoppen** (solange der Agent läuft und kein Durchgang im Gange ist).
- **Archivieren** / **Aus Archiv holen**.
- **Sitzung löschen**: entfernt ihren Verlauf von der Festplatte, nachdem du bestätigt hast.

## Einen Agenten fragen

- „Starte eine Claude-Code-Sitzung in ~/code/blog in einem neuen Worktree, die einen RSS-Feed hinzufügt, mit einem Ausgabenlimit von 5 $."
- „Welche Sitzungen sind seit heute Morgen fertig geworden? Erledige die abgeschlossenen und archiviere die von letzter Woche."
- „Warum steht bei dieser Sitzung „Fehlgeschlagen“, und was sollte ich senden, um es erneut zu versuchen?"
- „Zoome die Unterhaltung auf diesem Gerät auf 125 %.“
- „Der Text in meinen Sitzungen ist auf meinem Laptop zu klein: Mach die Unterhaltung größer.“
- „Was hat der letzte Zug dieser Sitzung gekostet, und wie viel davon entfiel auf den Cache?"
- „Verschiebe die Sitzung zu den Steuerformularen auf Montag um 9 Uhr."
- „Setze das Umsatzdiagramm und die Kennzahlen, die du mir gerade gezeigt hast, auf mein Board „Shop“."
- „Verzweige die Sitzung mit den Release Notes und probiere eine kürzere Version aus."
- „Stelle die Sitzung „Datenbereinigung“ auf „Änderungen akzeptieren“ um und sende: Mach mit der nächsten Datei weiter."
- „Sende diese Korrektur an meine laufende Custom-Sitzung; falls sie vor dem Update liegt, reihe sie ein, bis der Zug endet."
- „Was bedeutet der rotierende Ring auf „Stopp“?"
- „Stoppe alles, was diese Sitzung gestartet hat: ihre Subagenten und ihre Hintergrundaufgaben."
- „Was zeigt die Zeile über dem Nachrichtenfeld mit Subagenten und Hintergrundaufgaben?"
- „Welche dieser Subagenten hat Hydor gestartet, und welche Claude Code?"
- „Öffne den Subagenten, der die Tests geschrieben hat."
- „Erkläre, wie eine Wärmepumpe funktioniert, mit einem Diagramm des Kreislaufs und einem Bild von einer."
- „Vergleiche die drei E-Reader in einer Tabelle und such mir einen aus."
- „Behalte unsere Unterhaltung über E-Bikes als Dokument in meinem Projekt „Abschlussarbeit“."
- „Zeige die besten Ramen-Läden in der Nähe des Bahnhofs Shibuya auf einer Karte."
- „Frag mich zur Französischen Revolution ab: fünf Fragen."
- „Gib mir Übungsaufgaben zum Lösen quadratischer Gleichungen, mit Hinweisen."
- „Markiere in meinem Aufsatz, was zu verbessern ist, und gib mir die korrigierte Version."
- „Prüfe diese fünf Behauptungen aus dem Artikel auf ihre Richtigkeit."
- „Lass mich dieses Python-Snippet ausprobieren und ändern."
- „Welche meiner Modelle können eine vertrauliche Sitzung ausführen, und welches würde sie verwenden?"
- „Starte eine vertrauliche Sitzung in ~/reviews/4711, die das dortige Paper für ICLR begutachtet."
- „Warum kann meine vertrauliche Sitzung nicht im Web suchen, und was funktioniert darin weiterhin?"
- „Zeige, warum Attention-Gewichte sich zu 1 summieren, mit den Gleichungen und einem Zahlenbeispiel."
- „Stelle die Tabelle „Sales“ meiner Tabelle „Shop-Zahlen“ nach Monaten als Diagramm dar, eine Linie pro Region, und halte es aktuell."
- „Warum hat meine neue Sitzung gefragt, ob zuerst das Memory des Projekts aufgebaut werden soll, und was passiert, wenn ich „Jetzt starten“ wähle?"
