# Agenten

Ein Agent legt fest, welche Rolle eine Sitzung übernimmt: Anweisungen, verfügbare Werkzeuge, Arbeitsort und Zeitpläne, Modellstufe, delegierte Aufgaben und Monatsbudget. Dieser Beitrag erklärt die Agentenseite, integrierte und eigene Agenten, Erstellung und Bearbeitung, Projekte, Zeitpläne, Modellstufen, Teams, Budgets, Versionen und Prüfbeispiele. Außerdem geht es um Start und Wechsel von Agenten, Dateifreigaben, den Import von Claude-Code-Agenten, Aufgabenordner und das Aufräumen nach getaner Arbeit.

![Die Agentenseite mit deinen Agenten als Statuskarten und den integrierten Agenten darunter](images/agents.webp)

## Was ein Agent ist

Beim Sitzungsstart wählst du auf der Startseite einen Agenten. Später kannst du ihn im Nachrichtenfeld wechseln. Seine Anweisungen ergänzen die des Programms, sodass dasselbe Programm einmal als sorgfältiger Rechercheur und danach als geduldiger Tutor arbeitet. Agenten funktionieren mit Claude Code, Codex, Custom und Programmen mit Agent Client Protocol, kurz ACP, etwa Gemini CLI oder OpenCode.

Ein Agent kann Folgendes festlegen:

- **Anweisungen** für Rolle und Arbeitsweise. Sie gelten während der gesamten Arbeit; deine Gesprächsaufträge haben Vorrang.
- **Arbeitsort**: überall oder nur in ausgewählten Projekten. Siehe [Wo ein Agent arbeitet](#where-an-agent-works).
- **Auslöser**: deine oder andere Agentenaufträge und eigene Zeitpläne. Siehe [Zeitpläne](#when-an-agent-works-schedules).
- **Modellstufe**: Automatisch oder Quick, Standard, Best beziehungsweise Max mit je Programm einmal zugeordnetem Modell. Siehe [Modellstufen](#what-an-agent-thinks-with-tiers).
- **Team**: Agenten, an die er delegieren darf, und ob andere ihm Aufgaben geben dürfen. Siehe [Delegation zwischen Agenten](#agents-that-hand-work-to-other-agents).
- **Monatsbudget** für seine Sitzungen. Siehe [Monatsbudget](#a-monthly-budget).
- **Ergebnisse** mit geprüften Feldern und Zielen wie Bibliotheksseite, Tabellenzeile, E-Mail, Benachrichtigung, Datei oder Webhook. Siehe [Ergebnisse eines Agenten](#what-an-agent-hands-back).
- **Eigenes fortlaufendes Gespräch** mit Posteingang für dich, andere Agenten und geplante Läufe. Siehe [Ein Agent mit eigenem Gespräch](#an-agent-with-a-conversation-of-its-own).
- **Werkzeuge** zum Lesen, Erstellen und Ändern von Dateien, Ausführen von Befehlen, Nutzen des Webs und weiteren Funktionen. Du kannst einzelne Gruppen ausschalten.
- **Bevorzugte Skills**, die bei passenden Aufgaben vor Arbeitsbeginn geladen werden. Siehe [Skills](/guide/skills).
- **Verbindungen** für in seinen Sitzungen aktivierte Konten. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).
- **Empfehlungen für Programm, Modell und Berechtigungsmodus**, die auf der Startseite übernommen werden, aber vor dem Start änderbar bleiben.
- **Standard-Arbeitsordner**, wenn du keinen wählst: ein neuer Aufgabenordner oder der auf der Startseite angezeigte Ordner.

Ein Agent ist eine Sitzungsrolle. Allgemeine Vorgaben für alle Agenten, ein Projekt oder eine einzelne Sitzung, etwa deine bevorzugte Ansprache, gehören stattdessen in [Agentenrichtlinien](/guide/guidelines). Vor Version 0.37.0 hießen Agenten Assistenten; es sind dieselben Rollen mit erweiterten Möglichkeiten.

## Die Agentenseite

Öffne **Agenten** in der Seitenleiste oder [/agents](/agents). Auf dem Smartphone musst du das Seitenleistenmenü vorher öffnen. Auch **Deine Agenten** unter [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Your%20agents) führt mit der Anzahl eigener Agenten dorthin. Die übrigen Einstellungen dort betreffen Aufgabenordner und Aufräumen.

- **Neuer Agent** erstellt einen; siehe [Einen Agenten erstellen](#make-an-agent). **Importieren** übernimmt Claude-Code-Dateien; siehe [Claude-Code-Agenten importieren](#import-claude-codes-agent-files). **Installieren** liest eine erhaltene Agentendatei; siehe [Agenten als Datei teilen](#share-an-agent-as-a-file).
- Unter dem Titel stehen **Deine Agenten** und **Zeitpläne**. Letzteres zeigt die Woche mit Agentenzeitplänen, anderen geplanten Aufgaben, Apps, Überwachungen und Webhooks, nach Ergebnis eingefärbten Läufen, kommenden Aufgaben und einer Liste mit Pausenschaltern. Siehe [Wochenübersicht](/guide/tasks#see-the-week-what-ran-and-what-runs-next).
- Karten zeigen Name, Kurzbeschreibung, Status **In Arbeit**, bei wartender Sitzung **Benötigt dich**, **Budget aufgebraucht** oder **Inaktiv**, Projekte oder **Überall**, Modellstufe, nächsten Lauf, wartende Posteingangsnachrichten und Monatskosten.
- Filter über den Karten sind **Alle**, **Überall**, Projekte mit eigenen Agenten, **Mit Zeitplan** und **Benötigt dich**.
- Mitgelieferte Agenten stehen unter **Built in**.

Ein Klick auf eine Karte öffnet die Agentenseite:

- Einstellungen erscheinen als Sätze, etwa „Arbeitet überall, werktags um 09:00 Uhr und verwendet Quick“. Unterstrichene Teile lassen sich direkt ändern; siehe [Agenten bearbeiten](#change-an-agent).
- **Sitzung starten** öffnet die Startseite mit diesem Agenten und gegebenenfalls seinem Projekt.
- **Alle Einstellungen** öffnet den vollständigen Editor; siehe [Alle Einstellungen](#all-settings). **Duplizieren** erstellt eine bearbeitbare Kopie, **Löschen** entfernt einen eigenen Agenten.
- **Mehr → Versionen** zeigt bei eigenen Agenten frühere Zustände zum Vergleichen und Wiederherstellen; siehe [Versionen](#versions-go-back-to-an-earlier-one). **Als Datei herunterladen** speichert eine übertragbare Kopie; siehe [Agenten als Datei teilen](#share-an-agent-as-a-file).
- **Beispiele** enthält bei eigenen Agenten Testnachrichten und Prüfkriterien samt **Beispiele testen**. Siehe [Prüfbeispiele](#examples-that-check-it).
- **Zeitpläne** listet als dieser Agent laufende Aufgaben und bietet **Zeitplan hinzufügen**.
- **Posteingang** bei fortlaufendem Gespräch zeigt Nachrichten, Antworten, Eingabefeld und **Sein Gespräch**. Siehe [Eigene Gespräche](#an-agent-with-a-conversation-of-its-own).
- **Ergebnisse** bei konfigurierten Ergebnisfeldern oder Zielen zeigt eine Tabelle mit einer Zeile pro Ergebnis und Zustellorten. Siehe [Ergebnisse eines Agenten](#what-an-agent-hands-back).
- **Diesen Monat** nennt Sitzungszahl, Kosten und gegebenenfalls Budget sowie **Letzte Sitzungen** zum Öffnen.

## Die integrierten Agenten

Acht Agenten sind enthalten. Sie empfehlen weder Programm, Modell, Stufe noch Berechtigungsmodus und behalten deshalb deine Startseitenauswahl bei. Sie begrenzen weder Werkzeuge noch Kosten. Außer Coder starten sie ohne Ordnerauswahl in neuen Aufgabenordnern; siehe [Aufgabenordner](#task-folders-where-a-task-without-a-folder-works). Sie lassen sich nicht bearbeiten oder löschen, aber als eigene Kopie anpassen. Siehe [Duplizieren oder löschen](#duplicate-or-delete-an-agent).

Jeder verwendet passende [Antwortansichten](/guide/sessions#answer-uis-cards-charts-and-maps-in-replies), etwa Faktenprüfungen, direkt beantwortbare Übungen, Reisepläne mit Landkarten oder Kennzahlen und Diagramme. So werden Inhalte sichtbar, vergleichbar, abhakbar oder ausprobierbar, wenn das hilfreicher als reiner Text ist.

### General

„Help with anything: questions, writing, planning, files.“ General ist auf der Startseite voreingestellt, bis du an diesem Arbeitsort einen anderen Agenten wählst. Ein eigener Projektagent hat Vorrang. General richtet sich auch an Menschen ohne Programmierkenntnisse.

- Klärt dein Anliegen und erledigt es. Nur bei Unklarheiten, die das Ergebnis verändern würden, stellt er eine kurze Frage, möglichst mit passenden Antwortschaltflächen. Sonst entscheidet er sinnvoll und nennt seine Annahme.
- Beginnt mit der Antwort, ergänzt wichtige Details in verständlicher Sprache und erklärt unvermeidbare Fachbegriffe.
- Verwendet geeignete Ansichten für Vergleiche, Orte, Checklisten, Zahlen und bebilderte Inhalte. Bilder oder Videos ergänzen die Erklärung; Begründung und Rat stehen im Text.
- Recherchiert aktuelle oder unsichere Fakten, liest genannte Dateien und speichert bleibende Ergebnisse im Sitzungsordner beziehungsweise wiederverwendbare Seiten wie Tracker oder Rechner in deiner [Bibliothek](/guide/library).
- Bietet bei sinnvollen Anschlussmöglichkeiten zwei bis vier Schaltflächen für Vertiefung, Vergleich, Planung oder Umsetzung, aber nicht pauschal nach jeder Antwort.
- Nennt nach Dateiänderungen die betroffenen Dateien und ihren Ort.

### Researcher

„Finds and checks sources, and cites them.“

1. Formuliert die Frage kurz und zerlegt breite Themen in nötige Teilfragen.
2. Recherchiert mit verschiedenen Formulierungen und passenden Kategorien wie Fachartikel, Nachrichten, Patente, Unternehmensberichte oder Datensätze. Breite Themen erhalten größere Trefferlisten.
3. Liest entscheidende Quellen statt nur Suchauszüge und bevorzugt Primärquellen, Originaldaten, offizielle Websites, anerkannte Fachleute und verlässliche Medien. Nennt Daten und Aktualitätsgrenzen.
4. Kennzeichnet Widersprüche, gewichtet Qualität und Aktualität und trennt gesicherte, umstrittene und unbekannte Sachverhalte.
5. Zitiert Aussagen mit Nummern wie [1] und einer Quellenliste mit Titel, Autor oder Herausgeber, Datum und Link. Erfindet keine Quellen, Zitate, Zahlen oder Links und benennt nicht überprüfbare Angaben.
6. Beginnt mit den Ergebnissen und wichtigsten Punkten, ergänzt Details und verbleibende Unsicherheit.
7. Zeigt geeignete Inhalte als Faktenprüfung, Vergleich, Zeitachse, Kennzahlen, Leseliste oder Netzwerk von Personen, Ideen und Organisationen statt sie in Fließtext zu verstecken.
8. Speichert lange Berichte zusätzlich als kommentier- und exportierbare Dokumente in der [Bibliothek](/guide/library) oder auf Wunsch als Markdown-Datei im Sitzungsordner.

Für große Recherchefragen siehe [Deep research, Zweitmeinungen und mehrere Agenten](/guide/research).

### Writer

„Drafts, edits and polishes your writing“: für E-Mails, Briefe, Beiträge, Aufsätze, Berichte, Geschichten und Reden.

- Klärt bei langen Texten Zielgruppe, Zweck, Ton und Länge. Fehlende wichtige Angaben werden kurz erfragt, mehrere per Formular; sonst nennt er Annahmen und schreibt.
- Schreibt konkret, verständlich und abwechslungsreich, mit früher Kernaussage, ohne Fülltext und Floskeln.
- Übernimmt den gewünschten Ton oder anhand früherer Texte deine eigene Stimme.
- Bewahrt bei Überarbeitungen Aussage und Stil, korrigiert Fehler und strafft nur nötige Stellen. Auf Wunsch markiert und erklärt er jede Änderung oder vergleicht Fassungen und liefert danach den bereinigten Text.
- Liefert kurze Texte direkt nutzbar: E-Mail-Varianten mit vorausgefülltem Mailprogramm, plattformgerecht lange Beiträge und Quellenangaben im passenden Stil.
- Bietet bei wichtigen Entscheidungen wie Betreff, Titel, Einstieg oder Namen zwei bis vier kurz erläuterte Varianten.
- Schreibt längere Texte als bearbeitbare, kommentier- und exportierbare Dokumente in deiner [Bibliothek](/guide/library) und weist darauf hin. Auf Dateiwunsch erstellt er Dateien im Sitzungsordner, standardmäßig Markdown.

### Coder

„Builds, fixes and explains software.“ Coder arbeitet als Entwickler in deinem Projekt und nutzt deshalb anders als andere integrierte Agenten den auf der Startseite gewählten Ordner statt eines neuen Aufgabenordners.

- Liest vor Änderungen den umliegenden Code und befolgt Projektkonventionen und Werkzeuge.
- Beschränkt Änderungen auf deinen Auftrag und erwähnt andere Probleme, statt sie ungefragt zu beheben.
- Führt vorhandene Tests, Builds oder Linter aus und behebt Fehlschläge.
- Erklärt bei erkennbar fehlender Programmiererfahrung verständlich Änderungen und Ausführung, mit kopierbaren erläuterten Befehlen und ausprobierbarem Code.
- Nutzt bei Erklärungen passende Ansichten für Fehlerursachen, Testläufe, Dateibäume, Endpunkte, Vergleiche, Abläufe und Architektur.
- Schließt mit Änderungen, Prüfungen und offenen Punkten.

### Tutor

„Teaches step by step and checks you follow.“ Ziel ist, dass du etwas selbst verstehst und anwenden kannst.

- Fragt bei unklarem Niveau oder Lernziel kurz nach, mit Auswahl wie Einstieg, Grundlagen oder Prüfungsvorbereitung.
- Vermittelt schrittweise von einfach zu schwierig, in klarer Sprache und mit konkreten Beispielen.
- Nutzt Bilder, Diagramme, Formelkarten, interaktive Funktionsgraphen, Begriffsnetze, unterschiedlich tiefe Erklärungen, schrittweise Lösungen, ausführbaren Code und Simulationen. Formeln werden wie im Lehrbuch gesetzt.
- Prüft nach jedem Schritt dein Verständnis mit direkt beantwortbaren Quizzen, Text- oder Zahlenaufgaben mit Hinweisen und Lösung nach einem Versuch, Lücken, Zuordnung oder Reihenfolge. Wartet auf deine Antwort und liest deine gesendeten Ergebnisse.
- Erklärt konkret und freundlich richtige und falsche Teile und passt die nächste Erklärung oder Schwierigkeit an.
- Führt bei Hausaufgaben mit Hinweisen und Fragen; die vollständige Lösung folgt nur auf Wunsch oder nach weiterem erfolglosem Versuch.
- Bietet beim Sprachenlernen hörbare Wörter, Verbformen, Gespräche und markierte, erklärte Satzkorrekturen.
- Beendet Themen mit Rückblick und Lernkarten und bietet nächste Schritte als Schaltflächen. Bei längeren Kursen führt er einen Lernplan mit Fortschritt.

### Planner

„Plans trips, events and projects“, außerdem Umzüge und Routinen.

- Klärt Ziel, Termine, Fristen, Budget, Beteiligte und feste Grenzen. Fehlende entscheidende Angaben erfragt er, mehrere per Formular, und nennt sinnvolle Annahmen für den Rest.
- Prüft Öffnungszeiten, Fahrzeiten, Preise, Verfügbarkeit, Regeln und Wetter im Web und kennzeichnet ungeprüfte oder veränderliche Angaben.
- Plant konkrete Zeiten, Orte, Kosten und Zuständigkeiten mit Puffern und einer Reihenfolge wichtiger Buchungen oder Entscheidungen.
- Zeigt Tagesreisepläne mit Landkarte, Tagesabläufe, Kalender, Countdown, Projektphasen, Wochenpläne, Buchungs- und Packlisten, Wetter und Budgets mit Summe.
- Vergleicht zwei oder drei wichtige Alternativen, etwa Flüge oder Unterkünfte, mit ihren Vor- und Nachteilen.
- Speichert bearbeitbare Pläne als Dokument in der [Bibliothek](/guide/library), Budgets und Zeitpläne mit Summen als Tabelle. Schaltflächen bieten typische Anpassungen an. Dateien im Sitzungsordner entstehen auf ausdrücklichen Dateiwunsch.

### Analyst

„Makes sense of data and spreadsheets, with charts“: für Tabellen, CSV-Dateien, Exporte und Zahlen.

- Prüft zuerst Spalten, Umfang, Typen und Lücken und nennt fehlende Werte, Dubletten und ungewöhnliche Formate vor Schlussfolgerungen.
- Berechnet mit Python, JavaScript oder Formeln statt nach Augenmaß und speichert Skripte zur Reproduzierbarkeit im Sitzungsordner.
- Beantwortet die Frage zuerst mit klaren Kennzahlen und erklärt danach die Methode, Annahmen und Grenzen. Behauptet keine unbelegten Ursachen.
- Zeigt Kennzahlen, passende einfache Diagramme wie Balken zum Vergleichen und Linien für Zeitverläufe, sortier- und filterbare Tabellen, Verteilungen, Anteile, Veränderungen, Flüsse, Heatmaps, geografische Zahlen und Rechner für alternative Werte. Ungeeignete Standardansichten ersetzt er durch eigene Livegrafiken oder mehrere als Seite. Achsen und Einheiten sind beschriftet, auch am Smartphone lesbar.
- Speichert benötigte bereinigte Daten und Ergebnisse als CSV oder auf Wunsch XLSX. Weiterbearbeitbare Tabellen mit Formeln und wiederkehrend genutzte Dashboards liegen in deiner [Bibliothek](/guide/library).

### App builder

„Makes your own apps: a form, steps, data and a screen“. Siehe [Apps](/guide/apps).

- Klärt Eingaben, Ausgaben und erfolgreiche Ausführung, fragt nur gestaltungsrelevante Unklarheiten und nennt Annahmen.
- Baut mit eigenen Tools und wählt je Teil den günstigsten passenden Schritt aus Tool, kurzem Modellaufruf, Regel oder Code; Agenten übernehmen Urteilsaufgaben.
- Erstellt zwei bis vier Prüfbeispiele, testet und korrigiert sie vor Übergabe und nennt Kosten und Laufzeit je Ausführung.
- Baut auf deinen eigenen App-Änderungen auf.
- Verwendet den Skill app-builder.

## Einen Agenten erstellen

### Beschreiben, was er tun soll

1. Klicke auf der [Agentenseite](/agents) auf **Neuer Agent**.
2. Beschreibe unter „Was soll er tun?“ Aufgabe und gegebenenfalls Zeitplan, etwa „Schreibe freitagnachmittags meinen Wochenbericht aus Commits und Notizen und lass mich ihn vor dem Versand prüfen“. Beispiele darunter lassen sich übernehmen.
3. **Entwurf erstellen** lässt das Hilfsmodell unter Einstellungen → Modelle einen Namen, Symbol, Kurzbeschreibung, Anweisungen, Werkzeuge, Modellstufe und gegebenenfalls Zeitplan entwerfen.
4. Lies die Beschreibung und ändere unterstrichene Teile direkt; siehe [Agenten bearbeiten](#change-an-agent). Bei Zeitplänen steht unter „Jeder geplante Lauf beginnt mit“ die Startnachricht. **Seine Anweisungen** zeigt den vollständigen Text.
5. **Agent erstellen** meldet „*Name* ist bereit“ und öffnet die Agentenseite. Ein Zeitplan wird als geplante Aufgabe mit diesem Agenten angelegt.

**Alle Einstellungen** öffnet den vollständigen Editor, **Erneut beschreiben** kehrt zum Auftrag zurück. Im Projekt bietet der Tab **Agenten** die Option **Neuer Agent hier** sowie ohne Projektagenten **Agenten für dieses Projekt erstellen** anhand von Beschreibung oder passender Vorlage. Auch neue Projekte können direkt einen erhalten; siehe [Projekte](/guide/projects).

### Leer beginnen

**Leer beginnen** unter dem Feld öffnet den Editor nur mit vorausgewähltem Symbol. Siehe [Alle Einstellungen](#all-settings). Du kannst bis zu 200 eigene Agenten behalten.

### Alle Einstellungen

Der Editor enthält sämtliche Optionen, auf dem Smartphone als Bedienfeld von unten. Nur der Name ist Pflicht. **Speichern** meldet „*Name* gespeichert“ oder bei Neuanlage „*Name* ist bereit“. **Abbrechen** verwirft. Von oben folgen:

- **Symbol**: links neben dem Namen, mit 30 Motiven wie Teleskop, Stift, Kochmütze, Flugzeug oder Geldbörse.
- **Name**: höchstens 60 Zeichen, etwa „Buchhaltung“ oder „Reiseberatung“.
- **Kurzbeschreibung**: höchstens 160 Zeichen für Karte und Startmenü, etwa „Hält die Haushaltsbuchhaltung in Ordnung“.
- **Anweisungen**: Rolle und Arbeitsweise, höchstens 20.000 Zeichen, zu Sitzungsbeginn gelesen. Beginne etwa mit „Du übernimmst in dieser Sitzung die Buchhaltung des Nutzers“ und ergänze „Frage nach benötigten Abrechnungen“ oder „Halte Summen in einer Tabelle im Arbeitsordner fest“.
- **Arbeitsort**: **Überall** oder **In Projekten** mit Einzelauswahl. Siehe [Arbeitsorte](#where-an-agent-works).
- **Sitzungsordner ohne eigene Auswahl**:
  - **Neuer Aufgabenordner** als Standard für eine eigene frische Ablage. Siehe [Aufgabenordner](#task-folders-where-a-task-without-a-folder-works).
  - **Ordner auf der Startseite** wie bei Coder, geeignet für Projektarbeit.
- **Ausführen mit** als Startempfehlung:
  - **Beliebiger Agent** behält standardmäßig deine Startseitenauswahl;
  - **Claude Code**, **Codex**, **Custom** mit beliebigem Modell oder unter [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents) hinzugefügte Programme;
  - nach Programmauswahl dessen Modelle, falls wählbar. Ohne Auswahl gilt sein Standard; eine festgelegte Modellstufe bestimmt das Modell stattdessen.
- **Berechtigungsmodus**:
  - **Wie ausgewählt** behält den Startseitenmodus;
  - **Nachfragen** vor Dateiänderungen und Befehlen;
  - **Änderungen erlauben** für freie Dateibearbeitung, Rückfragen vor Befehlen;
  - **Vollzugriff** ohne Rückfragen;
  - **Plan** nur zum Lesen und Planen bis zur Freigabe.

  Claude Code, Codex und Custom verwenden jeweils passende Modi. Andere Programme wie Gemini CLI oder OpenCode behalten ihre eigenen.
- **Modellstufe**: **Automatisch**, **Quick**, **Standard**, **Best** oder **Max**. Darunter **Subagenten höchstens auf** mit **Beliebig** oder einer Stufe und standardmäßig **Bei fehlgeschlagener Prüfung hochstufen**. Siehe [Modellstufen](#what-an-agent-thinks-with-tiers).
- **Verfügbare Werkzeuge** mit fünf anfangs aktiven Schaltern; siehe unten.
- **Bevorzugte Skills** mit einzeln eingegebenen Namen; siehe unten.
- **Verbindungen**, sobald Konten verbunden sind; siehe unten.
- **Team** mit Schalter je delegierbarem Agenten und **Andere Agenten dürfen Aufgaben übergeben**. Siehe [Delegation](#agents-that-hand-work-to-other-agents).
- **Monatsbudget** in Dollar, leer für unbegrenzt. Siehe [Monatsbudget](#a-monthly-budget).
- **Eigenes Gespräch** mit **Ein Gespräch mit Posteingang beibehalten**. Siehe [Eigene Gespräche](#an-agent-with-a-conversation-of-its-own).
- **Ergebnisse** mit Feldern und Zielen. Siehe [Ergebnisse](#what-an-agent-hands-back).

### Verfügbare Werkzeuge

Die fünf Schalter umfassen:

- **Dateien lesen**: öffnen, auflisten und durchsuchen.
- **Dateien erstellen und ändern**.
- **Befehle ausführen**: lokale Programme und Skripte.
- **Web verwenden**: suchen und Webseiten lesen.
- **Andere Tools**: eingerichtete MCP-Server und Plugins.

Die Wirkung ausgeschalteter Gruppen hängt vom Programm ab:

- **Claude Code und Custom** erhalten diese Tools nicht. Ohne **Andere Tools** bekommt Claude Code nur App-Tools und verbundene Konten, keine selbst eingerichteten MCP-Server.
- **Codex** erhält die Anweisung, sie nicht zu verwenden. Ohne **Web verwenden** ist auch seine eigene Websuche deaktiviert. Ohne Befehle, aber mit erlaubtem Dateilesen darf er die Shell nur zum Lesen und Suchen nutzen, da sein Dateizugriff darüber läuft.
- **Andere Agenten** erhalten entsprechende Nutzungsverbote als Anweisung.

App-eigene Tools wie Seiten und Memory bleiben aktiv, außer sie gehören zu ausgeschalteten Gruppen: Ohne Web entfallen Suche, Seitenabruf und Browser, ohne Dateilesen der Dokumentenleser. Verbundene Konten werden separat über **Verbindungen** geregelt. Benötigt ein Auftrag gesperrte Werkzeuge, soll der Agent das erklären statt Beschränkungen zu umgehen.

### Bevorzugte Skills

Gib einen Skill-Namen ein und drücke Enter oder Komma. Vorschläge stammen aus den eigenen Claude-Code- und Codex-Skills, wie [Einstellungen → Agenten → Skills](/settings?s=skills) sie für den in Dateien geöffneten Ordner zeigt. Auch Bibliotheksnamen wie research sind erlaubt. Der Papierkorb entfernt Einträge. Höchstens 30 sind möglich. Passt einer zur Aufgabe, lädt und befolgt der Agent ihn vor Arbeitsbeginn. Siehe [Skills](/guide/skills) für mitgelieferte und zusätzliche Skills.

### Verbindungen

Dieser Bereich erscheint bei unter [Apps → Verbundene Apps](/apps/connected) eingerichteten Konten. Ihr Schalter aktiviert sie in Agentensitzungen. Global aktivierte Konten zeigen stattdessen „Für jede Sitzung aktiviert“. Nicht mehr verbundene Konten stehen mit „Nicht verbunden“ und Entfernen-Schaltfläche dort. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).

## Einen Agenten bearbeiten

Einstellungen erscheinen als Sätze, etwa „Arbeitet überall, werktags um 09:00 Uhr und verwendet Quick. Darf Dateien lesen und das Web nutzen, fragt keine anderen Agenten, liefert seine Antwort und verbraucht höchstens 3 $ im Monat“. Unterstrichene Teile öffnen direkt gespeicherte Änderungen:

- **Arbeitsort**: überall oder Projekte;
- **Auslöser**: Zeitpläne mit Editor, **Zeitplan hinzufügen** und fortlaufendes Gespräch;
- **Modellstufe** mit Subagentenobergrenze und automatischer Hochstufung;
- **Werkzeuge** mit fünf Schaltern;
- **Team** samt Annahme fremder Agentenaufträge;
- **Ergebnisse** mit Feldern und Zielen;
- **Monatsbudget** oder unbegrenzt.

Weitere Felder liegen unter [Alle Einstellungen](#all-settings). Jede Änderung wird versioniert; siehe [Versionen](#versions-go-back-to-an-earlier-one). Neue und ab der nächsten Nachricht auch laufende Sitzungen verwenden den neuen Stand. Custom liest vor jedem Durchlauf neu; Claude Code und Codex starten bei freier Sitzung neu, während das Gespräch erhalten bleibt.

## Versionen vergleichen und wiederherstellen

Jede inhaltliche Speicherung eines eigenen Agenten erstellt eine Version: auf seiner Seite, im Editor, per CLI, per beauftragtem Agenten über API sowie beim ersten Entwurf oder Dateiimport. Öffne **Mehr → Versionen**:

- Die Liste zeigt **v1**, **v2** und weitere, neueste zuerst, mit verständlichen Änderungen wie „Verwendet jetzt Best statt Quick. Monatsbudget jetzt 5 statt 3 $“, gegebenenfalls der Änderungsbeschreibung des Agenten, Urheber **Du**, **Agent**, **Entwurf**, **Installiert** oder **Importiert** und Zeitpunkt. **Aktuell** markiert die verwendete Fassung. Prüfbeispiele nennen erfolgreiche Fälle wie „2 von 3 bestanden“, damit Verbesserungen erkennbar werden.
- Ein Klick vergleicht mit der vorherigen Version. Über **Vergleichen … mit …** wählst du zwei beliebige aus. Änderungen erscheinen als Sätze und Anweisungen nebeneinander, entfernte Zeilen rot, neue grün.
- **Wiederherstellen** übernimmt den gewählten Stand als neue Version mit „Version 3 wiederhergestellt“. Der bisherige bleibt verfügbar. Inzwischen entfernte Projekte und Teamagenten werden ausgelassen.

Gespeichert werden die letzten 50 Versionen bis zum Löschen des Agenten. Beispiele sind nicht versioniert und bleiben beim Wiederherstellen aktuell. Bei älteren Agenten ohne Versionen wird ihr bisheriger Zustand bei der ersten Änderung als erste Fassung „Vor Einführung der Versionen“ festgehalten.

## Prüfbeispiele

Beispiele testen nach Änderungen, ob ein Agent seine Aufgabe noch erfüllt. Wie App-Beispiele bestehen sie aus Auftrag und Kriterien. Unter **Beispiele** auf der Agentenseite:

1. **Beispiel hinzufügen**: optional Name, **Testnachricht** und Kriterien je erwarteter Eigenschaft. Ein Kriterium ist ein vom Hilfsmodell bewerteter Satz wie „Nennt beide Pull Requests“ oder „Sagt klar, wenn nichts Neues gefunden wurde“, oder eine Ergebnisregel wie `{{reply}} contains Lisbon` beziehungsweise `{{result.count}} > 0`. **Beispiel speichern** übernimmt. Höchstens zehn Beispiele mit je acht Kriterien sind möglich.
2. **Beispiele testen** oder das Testsymbol eines einzelnen Beispiels zeigt zuerst Zahl der Testsitzungen, Modellstufe, geschätzte Kosten anhand früherer Tests oder bisheriger Monatskosten und Restbudget. Vor dem ersten Test fehlt gegebenenfalls eine Schätzgrundlage. Tests zählen zum Monatsbudget. **Testen** startet.
3. Jedes Beispiel läuft als Agent auf seiner Stufe in einer eigenen, nicht gelisteten Sitzung mit leerem temporärem Ordner. Dieser wird nach Speichern des Ergebnisses entfernt, das Gespräch bleibt. Es wird nichts versendet: Verbundene Apps halten geplante Sendungen nur als Vorschau fest, und konfigurierte Ergebnisziele werden nicht bedient. Danach werden Kriterien geprüft. Agenten mit Ergebnisfeldern müssen auch ein Ergebnis zurückgeben.

Die Liste zeigt **Bestanden**, Zahl fehlgeschlagener Kriterien, **Nicht abgeschlossen** oder bei Rückfrage **Wartet auf dich**, jeweils mit Zeit und Kosten. Ein Klick zeigt Nachricht, alle Prüfungen mit Beobachtung und ✓ oder ✗, Ergebnis, Antwort und **Sitzung öffnen**. Änderungen nach dem letzten Test führen zum Hinweis **Erneut testen**. Beispiele laufen niemals automatisch.

## Wo ein Agent arbeitet

Standard ist **Überall**. Auf Projekte beschränkte Agenten:

- stehen nur bei ausgewähltem passenden Projekt zur Verfügung und können nur aus dessen Sitzungen beauftragt werden;
- arbeiten bei genau einem Projekt in dessen Ordner mit Wissen, Memory, Richtlinien und Skills;
- erscheinen in allen zugeordneten Projekten unter **Agenten**. Siehe [Projekte](/guide/projects).

Wechselst du auf der Startseite zu einem Projekt, in dem der ausgewählte Agent nicht arbeitet, wird der eigene Projektagent oder sonst General gewählt.

## Wann ein Agent arbeitet: Zeitpläne

Ein Agent arbeitet durch direkt gestartete Sitzungen, delegierte Aufträge oder Zeitpläne. Ein Zeitplan ist eine geplante Aufgabe mit dieser Agentenrolle: zu festen Zeiten, regelmäßig, einmalig, bei Änderungen einer Seite oder eines Feeds oder durch einen Webhook-Aufruf. Siehe [Geplante Aufgaben](/guide/tasks).

- **Zeitplan hinzufügen** öffnet den Aufgabeneditor mit Agent und Zeitvorgabe. Ergänze Name und Startnachricht und speichere.
- Vorhandene Zeitpläne lassen sich öffnen, ändern, pausieren und sofort ausführen.
- Ein mit dem Agenten entworfener Zeitplan wird bei dessen Erstellung angelegt.

Alle Zeitpläne stehen auch unter [Einstellungen → Agenten → Geplante Aufgaben](/settings?s=tasks). Die Aufgabenoption **Agent** bestimmt die Rolle. [**Zeitpläne**](/agents/schedules) oben auf der Agentenseite zeigt die Woche mit allen Aufgaben, Ergebnissen und kommenden Läufen. Listeneinträge nennen **Agent ·** und Namen; der Stift öffnet die Agentenseite.

## Modellstufen eines Agenten

Modellstufen wählen nach Aufgabentyp statt Modellname:

- **Quick**: günstig für kleine, eindeutige, überprüfbare Aufgaben wie gezielte Änderungen, Faktenextraktion, Sortieren, Formatieren und kurze Zusammenfassungen.
- **Standard**: klare mittelgroße Aufgaben wie vorgegebene Änderungen, Tests, Recherche zu konkreten Fragen und Entwürfe nach Gliederung.
- **Best**: Hauptagent zum Verstehen, Planen, Delegieren und Prüfen.
- **Max**: stärkste Stufe für hartnäckige Fehler, Beweise und Entwürfe mit vielen Bedingungen.

Eine feste Stufe startet mit ihrem Modell für das jeweilige Programm, sofern kein Sitzungsmodell ausdrücklich gewählt wurde. **Automatisch** als Standard übernimmt die Auswahl der Startseite, geplanten Aufgabe oder beauftragenden Sitzung. Auf der Startseite kann diese selbst automatisch sein: Best mit möglichem Wechsel zu Max bei schwierigen Problemen. Siehe [Modellstufen für unterschiedliche Aufgaben](/guide/agents-models#tiers-a-model-for-each-kind-of-job).

[Einstellungen → Agenten → Modelle → Modellstufen](/settings?s=models&find=Tiers) erklärt jede Stufe in einer Tabelle je Programm: Claude Code mit Modell und Denkaufwand, anfangs Haiku, Sonnet, Opus und das neueste Fable; Codex mit Luna, Terra, Sol und Astra samt Denkaufwand, bei nicht verfügbarem Modell dem nächstpassenden und nötigenfalls höherem Denkaufwand; Custom mit einem deiner Modelle oder ohne Vorgabe zum Beibehalten der Sitzungsauswahl. Unveränderte Stufen folgen neueren passenden Programm-Modellen. **Standardwerte wiederherstellen** setzt sie zurück.

**Subagenten höchstens auf** begrenzt delegierte Hydor-Modellstufen. Höhere Anforderungen werden auf die Grenze reduziert; außerdem darf kein Subagent über der Stufe seiner Leitung arbeiten. Ein ausdrücklich genanntes Modell wird wie angegeben verwendet.

**Bei fehlgeschlagener Prüfung hochstufen** ist standardmäßig aktiv. Das Hilfsmodell prüft Auftrag und Antwort stufenbasierter Subagenten. Bei unzureichendem Ergebnis oder Fehler wird die Aufgabe eine Stufe höher wiederholt, höchstens Best und höchstens die erlaubte Obergrenze. Spätere Antworten auf Nachrichten werden nicht erneut als Gesamtauftrag ausgeführt. Die Leitung erfährt Grund und Wechsel, der neue Subagent die Defizite. Auch fehlgeschlagene geplante Agentenläufe werden bis Best eine Stufe höher wiederholt. Die Leitung kann Ergebnisse zusätzlich selbst hochstufen.

## Delegation zwischen Agenten

Agenten können Teile parallel in neuen Hydor-Subagentensitzungen bearbeiten lassen. Siehe [Deep research, Zweitmeinungen und mehrere Agenten](/guide/research). Sie starten:

- **allgemeine Subagenten** auf Quick für kleine klare, Standard als Vorgabe für mittlere oder Best für schwierige eigenständige Teile;
- **eigene benannte Agenten** mit deren Anweisungen, Tools, Konten, Modus und Stufe. Die Antwort kommt zur beauftragenden Sitzung zurück.

Dabei gilt:

- Integrierte Rollen oder Sitzungen ohne Agenten dürfen alle am Arbeitsort verfügbaren eigenen Agenten beauftragen.
- Eigene Agenten dürfen nur an ihr **Team** delegieren.
- Bei deaktiviertem **Andere Agenten dürfen Aufgaben übergeben** nimmt ein Agent keine solchen Aufträge an.
- Benannte Agenten bleiben auf ihre Projekte und höchstens die Berechtigungen der beauftragenden Sitzung beschränkt.

Im Gespräch erscheint je Subagent eine Karte unter dem Startdurchlauf mit Agentenname oder „Hydor-Subagent“, Stufe, Programm, Modell, Aktivität, Kosten und bei Hochstufung Ausgangsstufe und Grund. **Öffnen** zeigt das Gespräch. Der Projekt-Tab **Agenten** visualisiert die Delegationsbeziehungen.

Agenten mit fortlaufendem Gespräch erhalten Aufträge stattdessen im Posteingang. Sie antworten nach Bearbeitung. Siehe [Ein Agent mit eigenem Gespräch](#an-agent-with-a-conversation-of-its-own).

## Monatsbudget

**Monatsbudget** begrenzt die Kosten der Agentensitzungen seit dem Monatsersten in der Zeitzone dieses Computers:

- Jede neue Sitzung erhält das Restbudget als Ausgabenlimit oder ihr niedrigeres eigenes Limit.
- Allgemeine Subagenten zählen mit; benannte Agenten belasten ihr eigenes Budget.
- Bei aufgebrauchtem Budget starten bis zum nächsten Monat keine neuen Sitzungen als dieser Agent. Geplante Aufgaben nennen den Grund; die Karte zeigt **Budget aufgebraucht**.

Kosten werden wie unter [Nutzung und Kosten](/guide/usage) ermittelt. Ein leeres Feld bedeutet unbegrenzt.

## Ergebnisse eines Agenten

Ohne Konfiguration liefert der Agent seine Gesprächsantwort. Unter **Ergebnisse** im vollständigen Editor oder über den entsprechenden Satz kannst du Felder und Ziele festlegen. Nach jeder Aufgabe liefert er dann vor der Zustellung geprüfte Daten:

- **Ergebnisfelder**: je Name und Typ wie Text, Langtext, Zahl, Ja/Nein, Datum, Link, Liste oder Tabelle mit Spalten sowie Pflichtstatus. Der Agent füllt sie über `hand_back`. Unpassende Ergebnisse werden mit Korrekturhinweisen zurückgegeben.
- **Ergebnisziele** zusätzlich zum Gespräch:
  - **Bibliotheksseite**: Standard ist **Dieselbe Seite aktualisieren**. Der erste Lauf erstellt eine nach dem Agenten benannte Seite in seinem Projekt, falls vorhanden. Weitere Läufe speichern neue Versionen; ältere bleiben im Verlauf. Eigene Umbenennungen bleiben erhalten. **Neue Seite pro Lauf** erstellt stattdessen jeweils eine mit Agentenname und Datum. Vor Einführung dieser Auswahl erstellte Agenten behalten dieses Verhalten.
  - **Tabellenzeile**: Jeder Lauf ergänzt dieselbe Bibliothekstabelle um **Datum** und Felder in konfigurierter Reihenfolge. Zahlen, Daten und Links behalten passende Typen, damit Formeln und Diagramme funktionieren; Listen und Tabellen werden lesbarer Zelltext wie „Milch; Eier“. **Neue Tabelle** erstellt beim ersten Lauf eine nach dem Agenten benannte Tabelle. Alternativ wählst du eine vorhandene samt Blatt; fehlende Blätter werden angelegt. Siehe [Eine Tabellenzeile](#a-row-in-a-spreadsheet).
  - **E-Mail** an eine oder mehrere von dir festgelegte Adressen. Im Betreff werden `{date}`, `{time}` und `{agent}` ersetzt; ohne Betreff gilt Agentenname und Tag. **Von** wählt ein verbundenes Mailkonto, ohne Auswahl das erste. Siehe [E-Mail verbinden](/guide/connections#connect-your-email). Felder erscheinen mit Überschriften und Tabellen als Tabellen. Da du die Empfänger hier selbst festlegst, erfolgt der Versand sofort ohne Postausgangsfreigabe.
  - **Benachrichtigung** mit der ersten Ergebniszeile;
  - **Datei im Arbeitsordner**, etwa `reports/{date}.md`, mit `{date}`, `{time}` und `{agent}`. `.json` schreibt JSON, andere Endungen Markdown. Der Pfad darf den Arbeitsordner nicht verlassen;
  - **Webhook** als JSON-POST an eine HTTPS-Adresse, bei angegebenem Tresor-Key signiert und auf dessen erlaubte Hosts begrenzt. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).

Feldeingaben gelten beim Verlassen oder mit Enter. Nach dem ersten Lauf zeigen Einstellungen Links zur erstellten Seite und Tabelle.

### Eine Tabellenzeile

Spalten werden anhand ihrer Überschriften in der ersten Tabellenzeile gefunden. Du kannst sie verschieben, gestalten und eigene hinzufügen; Währungsformate bleiben erhalten. Eigene Formeln wie laufende Summen werden auf neue Zeilen übertragen, und Diagramme nehmen neue Zeilen auf. Summen unterhalb der Tabelle stören das Anhängen; verwende eigene Spalten oder andere Blätter mit Ganzspaltenformeln wie `=SUM(B:B)`. Später ergänzte Ergebnisfelder erzeugen Spalten am Ende. Umbenannte Überschriften passen nicht mehr zum Feld und führen zu einer neuen Spalte; benenne auch das Feld entsprechend, um die Zuordnung zu erhalten. Jede Ergänzung ist eine neue Tabellenversion und erhält Formeln, Diagramme und Kommentare.

### Ergebnisverlauf

**Ergebnisse** auf der Agentenseite zeigt neueste Resultate zuerst, mit Zeitpunkt, Spalten je Feld und **Zugestellt an** mit Symbolen je Ziel. Zustellfehler sind rot; Darüberfahren erklärt den Status, Bibliothekssymbole öffnen den Inhalt. Ein Klick auf die Zeile zeigt das gesamte Ergebnis und **Sitzung öffnen**. Die Tabelle scrollt; **Ältere anzeigen** lädt weitere. Ergebnisse bleiben ein Jahr, höchstens 500 Einträge, also bei täglicher Ausführung ein Jahr, bei stündlicher etwa drei Wochen. Zu lange Felder werden gekennzeichnet und sind an den Zustellzielen vollständig vorhanden. Oberhalb stehen Links zu gefüllter Bibliotheksseite und Tabelle.

## Ein Agent mit eigenem Gespräch

Üblicherweise starten Agenten pro Auftrag eine Sitzung. **Ein Gespräch mit Posteingang beibehalten** im vollständigen Editor oder unter Auslösern erstellt stattdessen bei Bedarf einmalig ein dauerhaftes Gespräch, bei genau einem zugeordneten Projekt in dessen Ordner:

- Nachrichten von dir auf der Agentenseite und von anderen Agenten warten im **Posteingang** und werden nacheinander beantwortet.
- Zeitpläne posten in dasselbe Gespräch und warten auf laufende Durchläufe. Jeder Lauf bleibt im Aufgabenverlauf sichtbar.
- Antworten gehen zum Absender zurück: andere Agenten erhalten Nachrichten, du eine Benachrichtigung.
- Das Gespräch behält seinen bisherigen Kontext.
- Das Monatsbudget wird bei jeder eingehenden Nachricht geprüft.

Der **Posteingang** auf der Agentenseite zeigt **Wartet**, **Wird bearbeitet**, **Beantwortet** oder **Keine Antwort**, die jeweilige Antwort, ein Nachrichtenfeld und **Sein Gespräch** zum Öffnen.

## Eine Sitzung als bestimmter Agent starten

1. Öffne die [Startseite](/). Unter dem Nachrichtenfeld stehen Programm, Modell, Ordner und **Agent** mit aktueller Auswahl.
2. Öffne **Agent**. Unter **Starten als** stehen zuerst integrierte Rollen, dann unter **Deine** projektübergreifende und zum gewählten Projekt passende eigene Agenten.
   - Am Computer stehen Namen in zwei Spalten. Darüberfahren zeigt unten Kurzbeschreibung sowie bei Programmempfehlung „Verwendet“ mit Programm und Modell.
   - Auf dem Smartphone öffnet eine Liste mit Beschreibung als Bedienfeld von unten.
3. Wähle den Agenten, schreibe den Auftrag und drücke Enter oder **Starten**.

**Agenten erstellen oder bearbeiten** unten öffnet die [Agentenseite](/agents). **Sitzung starten** auf einer Agentenseite öffnet die vorausgewählte Startseite.

Die Auswahl bewirkt:

- **Programm, Modell und Berechtigungen**: Empfehlungen werden übernommen, bei Modellstufe deren Modell, sonst eine ausdrückliche Modellvorgabe. Ein festgelegter Modus übernimmt den passenden Programm-Modus unter **Optionen → Berechtigungen**. Alles bleibt vor dem Start änderbar.
- **Verbindungen**: die für den Agenten aktivierten Konten gelten in der neuen Sitzung.
- **Ordner**: Ohne deine eigene Auswahl entscheidet der Agent. Die meisten verwenden **Neuer Aufgabenordner**, Coder und entsprechend konfigurierte Agenten den angezeigten Ordner. Innerhalb eines Projekts bleibst du dort. Bei Ordnerwechsel werden dessen gespeicherte Einstellungen mit dem neu gewählten Agenten geladen.

Die Startseite merkt sich Agent und übrige Auswahl je Projekt, Ordner und neuem Aufgabenordner geräteübergreifend. Ohne bisherige Auswahl gilt der Projektagent oder General. Nicht mehr vorhandene beziehungsweise im Projekt unzulässige Agenten werden ebenfalls dadurch ersetzt.

Die Projektauswahl lädt dessen gespeicherte Einstellungen und bei erstmaliger Nutzung den festgelegten Startagenten. Siehe [Projekte](/guide/projects).

## Agenten innerhalb einer Sitzung wechseln

Im Nachrichtenfeld steht die Rolle, die du jederzeit wechseln kannst, etwa nach der Recherche von **Researcher** zu **Writer**.

1. Der Agent ist die erste Zeile der **Optionen**-Auswahl unter dem Nachrichtenfeld und steht im Namen vorne, etwa „Researcher · Opus 5.5“.
2. Öffne sie und wähle unter **Wechseln zu** einen anderen Agenten. Die Auswahl entspricht der Startseite, am Computer als Raster, am Smartphone von unten.
3. Die App meldet „Ab deiner nächsten Nachricht arbeitet der Agent als *Name*“.

Danach gilt die neue Rolle im fortgesetzten Gespräch:

- Das Programm erhält die Wechselanweisung mit deiner Nachricht, unsichtbar im Gespräch.
- **Claude Code und Codex** lesen Anweisungen beim Start. Bei freier Sitzung starten sie vor deiner Nachricht mit neuer Rolle und Grenzen neu, was kurz länger dauert. Während laufender Durchläufe, Zielarbeit oder Hintergrundaufgaben kommen die Anweisungen zunächst mit der Nachricht; der Neustart folgt später bei freier Sitzung.
- **Custom** liest vor jedem Durchlauf neu. Andere Programme wie Gemini CLI und OpenCode erhalten die Anweisungen mit deiner Nachricht.
- Konten der neuen Rolle ersetzen die bisherigen rollenbezogenen Verbindungen. Deine manuellen Sitzungsänderungen bleiben. Modus und empfohlenes Modell für das aktuelle Programm werden übernommen; das Programm selbst wechselt nicht. Dafür siehe [Mit einem anderen Agenten fortsetzen](/guide/sessions#continue-in-another-agent).

Extern oder vor Einführung der Rollen gestartete Sitzungen zeigen **Kein Agent** und können eine Rolle erhalten. Auch **⋯ → Sitzungseinstellungen → Agent** nennt sie und öffnet beim Klicken deren Seite.

## Einen Agenten duplizieren oder löschen

Auf der Agentenseite:

- **Duplizieren** öffnet bei jedem Agenten einen vorausgefüllten neuen Editor mit „*Name* (Kopie)“. Passe ihn an und speichere. So entstehen eigene Varianten integrierter Rollen.
- **Löschen** ist nur bei eigenen Agenten möglich und fragt nach. Laufende Sitzungen gehen ohne dessen Anweisungen weiter. Zeitpläne bleiben als gewöhnliche Aufgaben erhalten; Teamverknüpfungen entfallen. Projekte verwenden wieder General oder die gewählte Rolle. Der Ergebnisverlauf wird gelöscht, gefüllte Bibliotheksseiten und Tabellen bleiben.

Auch die Suche per Strg+K beziehungsweise ⌘K findet Agenten nach Name und Beschreibung und öffnet ihre Seite.

## Agenten als Datei teilen

Ein eigener Agent lässt sich als einzelne Datei aufbewahren oder an andere Hydor-Nutzer weitergeben.

- **Herunterladen** über **Mehr → Als Datei herunterladen** funktioniert auch für integrierte Rollen, die anderswo als eigene installiert werden. Die `.hydor-agent`-Datei enthält Anweisungen, Werkzeuge, Stufe, Programm und Modell, bevorzugte Skills, Berechtigungen, Budget, weitere Einstellungen, Teamnamen, Ergebnisfelder und Zielarten, vorgeschlagene Uhrzeit-Zeitpläne und Prüfbeispiele. Persönliche Projektzuordnungen, verbundene Konten, konkrete Bibliotheksziele, Mailabsender und Empfänger, Webhook-Adresse und Key sowie Überwachungs-, Webhook- und Einmaltermin-Aufgaben bleiben ausgeschlossen. Die Datei erklärt nötige Neueinrichtungen.
- **Installieren** auf der [Agentenseite](/agents) nimmt über **Datei auswählen** oder Ziehen eine `.hydor-agent` an. Vor Speicherung zeigt eine Karte Namen, Beschreibung, **Enthaltene Einstellungen**, Anweisungen, Werkzeuge, Stufe, Ergebnisse, Beispiele und vorgeschlagene Zeitpläne sowie **Noch einzurichten** mit ausgelassenen Angaben und fehlenden Teamagenten. Ein vorhandener gleicher Name bleibt erhalten; der neue wird „Name (2)“. **Meinen ersetzen** übernimmt stattdessen als neue Version mit Rückkehrmöglichkeit; eigene Beispiele bleiben hinter den importierten bestehen. **Vorgeschlagene Zeitpläne pausiert hinzufügen** legt sie ausgeschaltet an. **Installieren** öffnet danach die Agentenseite.

Beim Import werden riskante oder nicht verfügbare Einstellungen angepasst und auf der Karte genannt: **Vollzugriff** wird zu **Änderungen erlauben**, fehlende Programme zur Startseitenauswahl, neuere Dateifunktionen auf bekannte Felder begrenzt. Für den Rest aktualisiere Hydor. Beschädigte oder falsche Dateien werden begründet abgelehnt. App-Dateien gehören auf die [App-Seite](/guide/apps#share-an-app-as-a-file), Claude-Code-Agentendateien in den folgenden Import.

## Claude-Code-Agentendateien importieren

Claude Code speichert eigene Agenten als Markdown unter `.claude/agents`, mit Kopfzeilen für Name, Beschreibung, Modell und Tools sowie Anweisungen darunter. Hydor macht daraus eigene Agenten für alle Programme.

1. Öffne die [Agentenseite](/agents) und **Importieren**.
2. **Claude-Code-Agenten importieren** zeigt persönliche Dateien aus `~/.claude/agents` unter **Deine** sowie `.claude/agents` im auf der [Dateien-Seite](/files) geöffneten Ordner unter **Dieser Ordner**. Öffne für Projektagenten dort zuerst das Projekt.
3. **Importieren** neben einer Datei macht den Agenten auf Agentenseite und Startseite verfügbar.
4. **Datei auswählen** unter „Oder Agentendatei von diesem Gerät“ nimmt andere `.md`-Dateien an.

Erforderlich ist Markdown bis 256 KB. Übernommen wird:

| Agentendatei | Agenteneinstellung |
|---|---|
| `name`, sonst Dateiname | **Name**: aus „code-reviewer“ wird „Code reviewer“ |
| `description` | **Kurzbeschreibung**: erster Satz ohne Beispiele |
| `model` | **Ausführen mit**: Claude Code und Modell; „inherit“ behält die Startseitenauswahl |
| `tools` | **Verfügbare Werkzeuge** nach Gruppen; ohne tools sind alle erlaubt |
| `permissionMode` | **Berechtigungsmodus**: default → Nachfragen, acceptEdits → Änderungen erlauben, bypassPermissions → Vollzugriff, plan → Plan |
| `skills` | **Bevorzugte Skills** |
| Text unter den Kopfzeilen | **Anweisungen** |

Das Symbol folgt Name und Beschreibung, etwa Teleskop für Recherche, Stift für Schreiben oder Code für Prüfungen und Tests. Importierte Agenten arbeiten wie Claude-Code-Projektagenten im Startseitenordner.

Nach Import heißt die Schaltfläche **Aktualisieren**. Sie liest dieselbe Datei in denselben Agenten neu ein und ersetzt Felder; nur dein selbst gewähltes Symbol bleibt. Eine direkt vom Gerät gewählte Datei erstellt immer einen neuen Agenten.

## Aufgabenordner für Aufträge ohne eigenen Arbeitsort

Reisepläne, Briefe oder Fragen brauchen oft keinen vorhandenen Ordner. **Neuer Aufgabenordner** auf der Startseite erstellt beim Start eine eigene Ablage nach Datum und Nachrichtenwörtern, etwa `~/Hydor/2026-10-31-plan-trip-lisbon`. Der Agent speichert Ergebnisse dort; du findest sie unter [Dateien](/files).

Der Name besteht aus:

- Datum in deiner Zeitzone;
- höchstens fünf Nachrichtenwörtern, ohne kurze Füllwörter, Links und führenden `/command`, ohne Akzente. Dieser Teil des Namens umfasst höchstens 40 Zeichen. Ohne verwertbare Wörter gilt `task`;
- bei Namenskonflikten `-2`, `-3` und weiteren Nummern.

### Aufgabenordner oder eigenen Ordner wählen

Im Startseiten-Ordnermenü:

- erstellt **Neuer Aufgabenordner** mit „Neu in ~/Hydor“ je Sitzung einen neuen;
- verwendet ein ausgewähltes Projekt, zuletzt benutzter oder über **Durchsuchen**, Namen oder Pfad gefundener Ordner stattdessen diesen Ort. Siehe [Projekte](/guide/projects) und [Sitzungen](/guide/sessions).

Ohne deine Auswahl entscheidet die Rolle: Integrierte Agenten außer Coder und entsprechend konfigurierte eigene Agenten nutzen Aufgabenordner. Coder und Agenten mit **Ordner auf der Startseite** verwenden den angezeigten Ort; auf ein Projekt beschränkte Agenten dieses Projekt. Die Startseite merkt sich deine Auswahl. Ein Rollenwechsel überlässt den Ordner wieder dem Agenten, außer du hast seit Öffnen der Seite selbst gewählt oder bist in einem Projekt. Bei Wechsel werden die gespeicherten Ortseinstellungen mit der neuen Rolle geladen.

Aufgabenordner werden nicht in den zuletzt verwendeten Ordnern aufgeführt. Per Sprachmodus gestartete Sitzungen nutzen sie ebenfalls, sofern zuletzt kein konkreter Ordner oder Projekt gewählt war. Siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice).

### Aufgabenordner verschieben

1. Öffne [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Task%20folders) und unter **Aufgaben** den Eintrag **Aufgabenordner**. **(i)** erklärt Datums- und Auftragsnamen sowie Coders abweichendes Verhalten.
2. Klicke auf den Pfad. Gib unter **Arbeitsordner** einen absoluten oder mit `~` beginnenden Pfad ein; Vorschläge zeigen passende und zuletzt genutzte Ordner. **Diesen Ordner verwenden** übernimmt.

Nur neue Aufgabenordner entstehen am neuen Ort; vorhandene bleiben. **Zurück zu ~/Hydor** stellt den Standard wieder her. Darunter siehst du Beispielpfade. Auch neue Projektordner entstehen dort im Unterordner **Projects**. Siehe [Projekte](/guide/projects).

## Nach Aufgaben aufräumen

[Nach Aufgaben aufräumen](/settings?s=assistants&find=Clean%20up%20after%20a%20task) unter Einstellungen → Funktionen → Deine Agenten → Aufgaben ist standardmäßig aktiv und gilt für alle Sitzungen unabhängig von der Rolle. **(i)** erklärt den Umfang.

Als letzten Schritt entfernt ein Agent dann selbst erzeugte, nicht mehr benötigte Zwischenprodukte:

- Test- und Entwurfsdateien, temporäre Ordner und Daten, Debug-Ausgaben und Screenshots;
- selbst erzeugte, zusammengeführte oder aufgegebene Branches, Worktrees und Stashes;
- gestartete Prozesse, Server und Container, sofern du sie nicht weiterlaufen lassen möchtest.

Beauftragte Ergebnisse und noch zu prüfende oder zusammenzuführende Arbeit bleiben erhalten, etwa nicht gemergte Commits. Fremde Inhalte werden nie entfernt. Bei großen oder unklaren Objekten wie Downloads oder gemeinsam genutzten Ressourcen fragt er vorher. Er benennt jedes Objekt statt nach Mustern zu löschen und erklärt kurz Entferntes und Behaltenes. Der mitgelieferte clean-up-Skill beschreibt das Verfahren. Siehe [Skills](/guide/skills).

Ausgeschaltet bleiben Zwischenprodukte liegen. Änderungen gelten ab der nächsten Sitzung, bei Custom ab der nächsten Nachricht.

## Weitere Einsatzorte

- **Projekte** legen den Startagenten unter **Sitzungen starten als** fest; die Startseite übernimmt ihn. Unter **Agenten** stehen die dort arbeitenden Rollen. Siehe [Projekte](/guide/projects).
- **Apps** können einen Startagenten und je Agentenschritt eigene Rollen festlegen; öffentliche Aufrufe verwenden den App-Agenten nicht. Siehe [Apps](/guide/apps).
- **Geplante Aufgaben** verwenden ihre **Agent**-Auswahl. Aus einer Sitzung erstellte Aufgaben übernehmen deren Rolle. Siehe [Geplante Aufgaben](/guide/tasks).
- **Sprachmodus** startet mit zuletzt gewähltem Startseitenort und dessen Einstellungen, andernfalls mit Projektagent oder General.

## Einen Agenten fragen

- „Erstelle Paper scout: werktags um 8 Uhr neue Fachartikel zu meinen Themen suchen und die fünf besten in der Bibliothek speichern, auf Quick.“
- „Erstelle Buchhaltung für meine Haushaltstabelle, ohne Befehlsausführung und mit höchstens 5 $ Monatsbudget.“
- „Lass Release manager an Translator und Test runner delegieren.“
- „Beschränke Translator auf das Projekt Hydor.“
- „Ordne Quick für Claude Code Haiku und für Custom mein lokales Qwen-Modell zu.“
- „Deaktiviere Max für schwierige Probleme, damit automatische Sitzungen auf Best bleiben.“
- „Importiere ~/.claude/agents/code-reviewer.md als Agenten.“
- „Welche Agenten habe ich, welche Modelle verwenden sie und was haben sie diesen Monat gekostet?“
- „Lass Paper scout Fachartikel mit Titel, Link und Bedeutung als Liste auf einer Bibliotheksseite und als Benachrichtigung liefern.“
- „Lass Buchhaltung freitags Wochenkosten und größte Posten als Zeile in Haushaltsbudget ergänzen.“
- „Lass Wochenbericht montags an maria@example.com senden, mit Betreff Wochenbericht {date}.“
- „Welche Ergebnisse hat Buchhaltung diesen Monat geliefert und welche Summe ergibt sich?“
- „Welche Agenten laufen morgen früh automatisch und wann?“
- „Lass Docs keeper ein Gespräch beibehalten und sende: Aktualisiere den Leitfaden zur neuen Agentenseite.“
- „Wechsle die Lissabon-Sitzung auf Planner.“
- „Was hat sich bei Paper scout diese Woche geändert? Stelle die Fassung vor Montag wieder her, falls deren Beispiele besser abschnitten.“
- „Gib Wochenbericht zwei Prüfbeispiele für eine ruhige und eine volle Woche samt Kriterien und teste sie.“
- „Lade Buchhaltung als Datei herunter und erkläre nötige Neueinstellungen auf meinem Laptop.“
- „Lege Aufgabenordner künftig unter ~/Documents/Tasks an.“
