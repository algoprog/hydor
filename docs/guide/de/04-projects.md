# Projekte und Wissen

Ein Projekt bündelt zusammengehörige Arbeit: Sitzungen, einen eigenen Arbeitsordner und weitere verwendete Ordner, Projektwissen aus Notizen, Wiki und eigenen Dokumenten, gemeinsame Agentenrichtlinien, eigene Skills, einen Startagenten und projektspezifische Agenten. Im gemeinsamen Wissen hinterlegst du Dokumente und Ordner einmal, damit alle Sitzungen sie durchsuchen und mit Datei- und Seitenangaben zitieren können. Dieser Beitrag erklärt Projekte und Projektgruppen, projektspezifische Skills, Freigaben für andere Personen sowie die Dokumentenablage und Suche der Agenten.

![Die Projektseite mit einer Karte je Projekt, Inhaltsübersicht und Neuer Sitzung](images/projects.webp)

## Was ein Projekt ist

Ein Projekt sammelt alles zu einem Vorhaben, ähnlich wie Projekte in ChatGPT oder Claude. Steuererklärung, Abschlussarbeit, Garten oder Website können eigene Projekte sein. Auf der Startseite wählst du den Projektnamen statt eines Ordners. Jede dort gestartete Sitzung:

- **arbeitet im Projektordner**. Der Agent soll Projektdateien dort ablegen und erfährt mit deiner ersten Nachricht, was aktuell darin liegt, zuletzt geänderte Dateien zuerst. Weitere zugeordnete Ordner bleiben an ihrem Ort und werden mitverwendet. Claude Code behandelt sie wie eigene Arbeitsordner; andere Agenten erhalten ihre Pfade;
- **befolgt die Projekt-Richtlinien** zu Zielgruppe, Arbeitsweise und Besonderheiten. Siehe [Agentenrichtlinien](/guide/guidelines);
- **erhält projektspezifische Skills** zusätzlich zu deiner Skill-Bibliothek und lädt diese Arbeitsanleitungen bei passenden Aufgaben. Siehe [Eigene Projekt-Skills](#give-a-project-skills-of-its-own);
- **startet mit dem Projektagenten**, falls einer festgelegt ist. Siehe [Agenten](/guide/agents);
- **nutzt Erkenntnisse früherer Projektsitzungen**. Memory-Notizen sind dem Arbeitsordner zugeordnet und deshalb für alle Projektsitzungen gemeinsam verfügbar. Siehe [Memory](/guide/memory);
- **durchsucht Projektdokumente** und, sofern nicht deaktiviert, das gemeinsame Wissen. Siehe [Welche Sitzungen welches Wissen durchsuchen](#which-sessions-search-which-knowledge).

Die Projektzuordnung folgt dem Arbeitsort. Jede Sitzung im Projektordner oder einem Unterordner gehört dazu, ob in Hydor, Claude Code oder Codex gestartet. Bei verschachtelten Projekten gilt das innere. Worktrees werden dem Ausgangsordner zugerechnet. Ein Projekt mit deinem Benutzerordner als Stamm umfasst nur Sitzungen direkt darin. Legst du für einen bereits verwendeten Ordner ein Projekt an, werden vorhandene Sitzungen sofort aufgenommen und in der Seitenleiste unter dem Projekt angezeigt. Neue Hydor-Sitzungen im Projektordner, aus Startseite, geplanten Aufgaben, Apps oder API, erhalten Richtlinien, Skills und Wissen bereits im ersten Durchlauf.

Ein Projekt kann andere Projekte zusammenfassen. Das ist eine **Gruppe**; siehe [Projekte zu einer Gruppe verbinden](#bring-projects-together-in-a-group).

## Die Projektseite öffnen

Klicke unten in der Seitenleiste auf **Projekte**. Öffne auf dem Smartphone zuerst das Seitenleistenmenü. Auch die Suche nach „Projekte“ mit Strg+K beziehungsweise ⌘K führt dorthin.

Die Seite hat zwei Tabs:

- **Alle Projekte** mit deinen Projekten und **Neues Projekt** oben rechts.
- **Gemeinsames Wissen** für Dokumente, die alle Sitzungen durchsuchen können. Siehe [Gemeinsames Wissen](#shared-knowledge-documents-every-session-can-search).

Jede Projektkarte zeigt:

- einen farbigen Streifen und das Projektzeichen: ein abgerundetes Quadrat mit Anfangsbuchstaben. Gruppen haben ein zweites Quadrat dahinter und die Kennzeichnung **Gruppe**. Automatisch erkannte Projekte nennen **Aus Claude Code**, **Aus Codex** oder **Aus Claude Code und Codex** mit Programmsymbolen. Siehe [Aus Claude Code und Codex erkannte Projekte](#projects-found-in-claude-code-and-codex). **Mehr** unter **⋯** in der Ecke entspricht dem Menü der Projektseite;
- Name und Beschreibung oder ohne Beschreibung den Ordner. Gruppen nennen die enthaltenen Projekte;
- die Anzahl von Sitzungen, einschließlich extern im Ordner gestarteter, Bibliotheksinhalten, Dokumenten und Skills;
- die Zeit seit der letzten Sitzungsaktivität sowie **Neue Sitzung** zum direkten Start im Projekt.

Ein Klick auf die Karte öffnet das Projekt. Auch sein Name in der Suche per Strg+K führt direkt dorthin. Ohne Projekte erklärt die Seite deren Nutzen in drei kurzen Abschnitten mit **Projekt erstellen**.

Ziehe lokale Dateien auf eine Projektkarte, um sie hinzuzufügen. Währenddessen steht etwa „Ablegen, um zu ‚Abschlussarbeit‘ hinzuzufügen“. Dokumente, Tabellen, Folien, LaTeX und Notebooks werden Bibliotheksseiten, Bilder, Videos und Audio werden dort gespeichert. Andere Dateien landen im Projektordner. Siehe [Eigene Dateien hinzufügen](/guide/library#add-files-of-yours).

Unter den Projekten stehen **Deine Arbeitsordner**, die sich als Projekte eignen. Siehe [Arbeitsordner ohne Projekt](#folders-you-work-in-not-in-a-project-yet).

## Ein Projekt erstellen

1. Klicke auf der [Projektseite](/projects) auf **Neues Projekt**. Auch das Ordnermenü der Startseite bietet dies; siehe [Eine Projektsitzung starten](#start-a-session-in-a-project).
2. Fülle das Fenster aus:
   - **Name**: etwa „Steuern 2026“, „Garten“ oder „Abschlussarbeit“, höchstens 60 Zeichen. Nur dieses Feld ist Pflicht. Das farbige Quadrat daneben zeigt das Projektzeichen und öffnet die acht Farben Gelb, Blau, Grün, Pink, Violett, Türkis, Orange und Schiefergrau. Ohne Auswahl werden Farben reihum vergeben.
   - **Dateien ablegen**: Wähle eine der beiden Möglichkeiten.
     - **In einem neuen Ordner** ist der Standard. Die App erstellt einen nach dem Projekt benannten Ordner.
     - **In einem vorhandenen Ordner** verwendet einen bestehenden Projekt- oder Dokumentenordner auf diesem Computer unverändert. **Zuletzt verwendet, noch ohne Projekt** bietet passende Ordner direkt an. **Ordner auswählen…** sucht nach Name oder Pfad. Ist der Name noch leer, wird der Ordnername übernommen. **Ändern** wählt einen anderen Ordner.
3. Optional öffnet **Weitere Optionen** die übrigen Angaben. Ein Punkt zeigt bereits ausgefüllte Optionen an:
   - **Worum es geht**: bis zu 300 Zeichen Beschreibung unter dem Namen.
   - **Agentenrichtlinien**: Zielgruppe, Arbeitsweise und Besonderheiten für jede Projektsitzung, etwa „Beträge in EUR. Ich bin in Griechenland selbstständig.“ Bis zu 20.000 Zeichen. Siehe [Agentenrichtlinien](/guide/guidelines).
   - **Weitere verwendete Ordner**: zusätzliche Arbeitsordner, ohne Kopieren der Dateien. **Ordner hinzufügen** erlaubt bis zu zwölf, ✕ entfernt die Zuordnung.
4. Lasse **Agent für dieses Projekt** aktiviert, um einen Projektagenten erstellen zu lassen; siehe [Agenten](#agents). Alternativ schaltest du es aus.
5. Klicke **Projekt erstellen** oder drücke Enter im Namensfeld.

Neue Ordner entstehen unter **Projects** am Speicherort der Aufgabenordner. „Taxes 2026“ bekommt etwa `~/Hydor/Projects/taxes-2026`, sofern du den Ort nicht geändert hast; siehe [Aufgabenordner verschieben](/guide/agents#move-task-folders). Bei vergebenem Namen folgen `-2`, `-3` und so weiter. Von der Projektseite aus öffnet sich das neue Projekt, von der Startseite aus wird es für die nächste Sitzung ausgewählt.

Den Startagenten und enthaltene Projekte stellst du später unter **Einstellungen** ein. Notizen, Wiki und Dokumente gehören zu **Memory**, Skills zu **Skills** und weitere Arbeitsordner zu **Dateien**.

### Ein Projekt für einen vorhandenen Ordner

Wähle unter **Neues Projekt → Dateien ablegen → In einem vorhandenen Ordner** den Ordner. Er wird direkt verwendet; es entsteht kein neuer. Auch ein Agent kann das erledigen, etwa „Erstelle das Projekt Shop für ~/code/shop“. Der Stammordner ist nach Erstellung nicht mehr änderbar, zusätzliche Arbeitsordner schon; siehe [Dateien](#files). Vorhandene Sitzungen werden sofort zugeordnet. Hat Hydor bereits automatisch ein Projekt für diesen Ordner erstellt, übernimmst du dasselbe Projekt mit seinen Sitzungen und deinen neuen Angaben zu Name, Farbe, Beschreibung und Richtlinien. Die Herkunftsmarkierung entfällt. Siehe [Automatisch erkannte Projekte](#projects-found-in-claude-code-and-codex).

### Aus Claude Code und Codex erkannte Projekte

Hydor zeigt auch außerhalb gestartete Claude-Code- und Codex-Sitzungen aus Terminal, VS Code, Claude-Desktop-App oder Codex-App. Siehe [Die Sitzungsliste](/guide/start#the-session-list). Deren Arbeitsordner werden automatisch zu Projekten, damit die Arbeit samt Sitzungen bereitsteht.

- **Wann ein Ordner zum Projekt wird**: sobald mindestens zwei selbst gestartete Claude-Code- oder Codex-Sitzungen darin gearbeitet haben. Skriptstarts wie `codex exec`, Agent-SDK-Sitzungen, Subagenten und Hydor-eigene Starts zählen nicht. Unterordner eines Git-Repositorys werden zum Repository zusammengefasst.
- **Codex-Projekte**: Projekte der Codex-App einschließlich ChatGPT-Projektordner werden nach der ersten Sitzung in einem ihrer Ordner übernommen. Hydor nutzt den Codex-Projektnamen, den ersten Ordner als Stamm und weitere Ordner als zusätzliche Arbeitsorte.
- **Ausnahmen**: Benutzerordner, versteckte Ordner außer Codex-Projektordnern, temporäre Ordner, von der App erzeugte Aufgaben-, App-, Worktree- und Datenordner, als **Kein Projekt** markierte Ordner und bereits von Projekten erfasste Stamm-, Zusatz- oder Unterordner.
- **Zeitpunkt**: nach dem Einlesen vorhandener Sitzungen beim Hydor-Start, danach etwa innerhalb einer Minute nach neuen Sitzungen.
- **Name**: zuerst ein in der Seitenleiste vergebener Anzeigename, sonst Codex-Projektname, sonst Ordnername. Bei Namenskonflikten wird der übergeordnete Ordner ergänzt, etwa „client/app“, danach gegebenenfalls eine Zahl.
- **Projektseite**: Die Karte zeigt ihre Herkunft und erklärt beim Darüberfahren etwa „Hydor hat dieses Projekt für einen mit Claude Code verwendeten Ordner erstellt“, entsprechend für Codex oder beide. Solche Projekte stehen nach deinen selbst erstellten, zuletzt aktive zuerst.
- **Seitenleiste**: Die Projektgruppe zeigt Zeichen, Namen und Herkunftssymbole. Darüberfahren oder **⋯** nennt unter **Außerhalb von Hydor gestartet** die ursprünglichen Programme wie bei Ordnergruppen.
- **Vollständiges Projekt**: Der Arbeitsordner bleibt unverändert, ohne Verschieben oder Kopieren. Dokumente, Skills, Richtlinien, Agenten, Bibliothek und Freigaben funktionieren wie gewohnt. Du kannst umbenennen, beschreiben und löschen. Claude-Code-Skills aus `.claude/skills` erscheinen weiterhin unter **Skills**; CLAUDE.md und AGENTS.md werden wie bisher gelesen.
- **Nach dem Löschen** erstellt Hydor es nicht erneut automatisch. Du kannst aber selbst wieder ein Projekt anlegen; siehe [Ein Projekt löschen](#delete-a-project).

Die Herkunftsstreifen auf der [Projektseite](/projects) machen erkannte Projekte sichtbar.

### Arbeitsordner ohne Projekt

Unter den Projekten auf der [Projektseite](/projects) erscheinen bis zu sechs Vorschläge aus den letzten 90 Tagen: Arbeitsordner oder Ordner, in denen Sitzungen von anderswo Dateien geändert haben, die noch keinem Projekt gehören. Häufig und kürzlich verwendete stehen oben. Unterordner eines Git-Projekts zählen zum gesamten Projekt. Die Karte zeigt Name, Pfad, Sitzungszahl und letzte Verwendung.

- **Projekt erstellen** öffnet das Formular mit vorausgewähltem Ordner und Namen.
- ✕ mit **Kein Projekt** entfernt den Vorschlag und verhindert die automatische Projekterstellung. Siehe [Automatisch erkannte Projekte](#projects-found-in-claude-code-and-codex). Der Ordner bleibt unverändert und kann weiter manuell über **Neues Projekt** aufgenommen werden.

Da Claude-Code- und Codex-Ordner automatisch übernommen werden, stehen hier vor allem aus Hydor verwendete Ordner. Benutzerordner, versteckte und temporäre Ordner sowie automatisch erzeugte Aufgaben-, App- und Worktree-Ordner werden nicht vorgeschlagen. Sobald ein Projekt einen Stamm- oder Zusatzordner verwendet, verschwindet dieser aus der Liste. Dieselben Vorschläge stehen unter **Zuletzt verwendet, noch ohne Projekt** im Erstellungsformular.

## Eine Projektsitzung starten

Dafür gibt es zwei Wege:

- **Vom Projekt aus**: **Neue Sitzung** auf der Projektkarte oder oben auf der Projektseite, auf dem Smartphone der Stift, öffnet die Startseite mit ausgewähltem Projekt und dessen bisheriger Auswahl. Ohne gespeicherte Auswahl wird gegebenenfalls der Projektagent gewählt.
- **Von der Startseite aus**: Das Ordnermenü unter dem Nachrichtenfeld zeigt **Projekte** mit den fünf zuletzt aktiven sowie dem ausgewählten Projekt, jeweils mit Zeichen, Namen und Pfad. Darunter folgen **Ordner** und **Neuer Aufgabenordner**. **Neu** neben Projekte erstellt und wählt ein Projekt. Die Suche findet beliebige Projekte und Ordner nach Namensbestandteilen. Ein Projektstammordner erscheint auch bei Pfadsuche oder früherer Ordnerauswahl immer als Projekt; die Sitzung gehört dazu.

Nach Auswahl zeigt die Schaltfläche Projektzeichen und Namen. Die Sitzung arbeitet im Projektordner. Ohne frühere Auswahl übernimmt **Agent** den eigenen Projektagenten samt empfohlenem Programm, Modell und Berechtigungen oder sonst **General**. Andernfalls gilt die gespeicherte Auswahl. Du kannst alles vor dem Start ändern. Schreibe dann deine Nachricht und klicke **Starten**.

Jedes Projekt merkt sich Programm, Modell, Denkaufwand, Berechtigungen, Agent, Memory, Ausgabenlimit, **Vertraulich** und **Neuer Worktree** separat. Siehe [Was sich die Startseite merkt](/guide/sessions#what-the-start-page-remembers). Das gewählte Projekt bleibt geräteübergreifend vorausgewählt. Für Arbeit außerhalb wählst du einen Ordner oder **Neuer Aufgabenordner**. Wird das ausgewählte Projekt gelöscht, bleibt sein Ordner ausgewählt, aber ohne Projektzuordnung.

Auf dem Smartphone öffnet das Menü als Bedienfeld „Projekt oder Arbeitsordner“. Die Tastatur erscheint erst beim Antippen der Suche.

Liegt der Projektordner in Git, bietet das Menü **Neuer Worktree** für eine getrennte Kopie auf eigenem Branch. Siehe [Sitzungen](/guide/sessions). Per Sprachmodus gestartete Sitzungen verwenden den zuletzt gewählten Startseitenort samt Einstellungen. Siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice).

## Die Projektseite

Ein Klick auf eine Projektkarte öffnet die Projektseite. Oben stehen in Projektfarbe Zurückpfeil zu allen Projekten, Projektzeichen, Name und Beschreibung, bei Gruppen enthaltene Projekte und ohne Beschreibung der Ordner. Rechts startet **Neue Sitzung**, auf dem Smartphone der Stift, eine Projektsitzung. **Mehr** unter **⋯** enthält:

- **Projektordner in Dateien öffnen**;
- **Nur Projektsitzungen in der Seitenleiste** wie der Seitenleistenfilter. Erneute Auswahl zeigt wieder alle. Siehe [Projektsitzungen filtern](#show-one-projects-sessions-in-the-sidebar);
- **Mit Personen teilen** zum Einladen über eigene Links, etwa für Betreuung oder Studierende. Siehe [Ein Projekt mit Personen teilen](#share-a-project-with-people);
- **Projekt löschen**; siehe [Ein Projekt löschen](#delete-a-project).

Darunter stehen sieben Tabs: **Übersicht**, **Bibliothek**, **Dateien**, **Memory**, **Skills**, **Agenten** und **Einstellungen**. Bibliothek, Memory und Skills zeigen außer auf dem Smartphone eine Anzahl. Nicht passende Tabs liegen auf schmalen Bildschirmen unter **Mehr** am Zeilenende. Ist einer davon geöffnet, steht sein Name dort statt Mehr. Jeder Tab öffnet unmittelbar.

### Übersicht

Karten zeigen das Projekt auf einen Blick:

- **Sitzungen**: alle zugehörigen Sitzungen, ob hier oder extern im Projektordner gestartet, zuletzt aktive zuerst. Angezeigt werden Agentensymbol, Titel, am Computer Aktivität wie **In Arbeit**, **Benötigt dich** oder **Bereit**, und Zeit seit letzter Aktivität. Ein Klick öffnet die Sitzung; ab mehr als sechs zeigt **Alle** den Rest. Ohne Sitzungen erklärt ein Hinweis die Arbeit mit Projektordner, Richtlinien, Dokumenten und Skills und bietet **Neue Sitzung**.
- **In der Bibliothek**: Projektinhalte, zuletzt geänderte zuerst. Siehe [Bibliothek](#library). **In der Bibliothek öffnen** zeigt sie dort. Auf die Karte gezogene Dateien werden hinzugefügt.
- **Geteilt mit**, daneben oder auf dem Smartphone darunter: nach erster Freigabe die Personen mit Initialen und letzter Aktivität, etwa „‚Kapitel 3‘ kommentiert · vor 2 Std.“ oder „Noch nicht geöffnet“. Eine Person oder **Teilen** öffnet die Freigabeverwaltung. Siehe [Projektfreigaben](#share-a-project-with-people).
- **Jede Sitzung hier**, daneben beziehungsweise darunter: **Ordner** mit zusätzlichen Ordnern und Link zu Dateien, **Richtlinien** mit Textanfang und Link zu Einstellungen, **Memory** mit einer Zusammenfassung wie „12 Notizen · 8 Artikel · 5 Dokumente“, wobei Artikel nur bei aktiviertem Wiki-Memory erscheinen. Ein Klick öffnet den Tab **Memory**. Hinzu kommen **Skills** mit der Anzahl eigener Skills und **Startet als** mit dem Agenten.
- **Enthaltene Projekte** bei Gruppen: Projekte mit Sitzungszahl, jeweils anklickbar.

### Bibliothek

Hier liegen Seiten, Folien, Dokumente, Tabellen und LaTeX-Dokumente aus Projektsitzungen sowie selbst gespeicherte oder zugeordnete Inhalte. Siehe [Nach Projekt sortieren](/guide/library#sort-it-by-project). Karten öffnen Inhalte; **Mehr** bietet dieselben Aktionen wie in der Bibliothek. **In der Bibliothek öffnen** nutzt deren Suche und Inhaltsfilter. Ohne Inhalte gibt es **Neue Seite** und **Neue Folien**, jeweils im Projekt. Gezogene Dateien werden ihrem Typ entsprechend aufgenommen. Siehe [Eigene Dateien hinzufügen](/guide/library#add-files-of-yours).

### Dateien

Der Projektordner und Zusatzordner erscheinen wie auf der [Dateien-Seite](/guide/files-git#browse-a-folder), mit Öffnen, Mehrfachauswahl, Ziehen, Hochladen und Zeilenmenüs. Dateien öffnen sich in einem Fenster über der Seite.

- Über dem Inhalt stehen Schaltflächen je Ordner, der Stamm unter dem Projektnamen, weitere unter ihren Ordnernamen. Ein Klick wechselt den angezeigten Ordner.
- **Ordner verknüpfen** fügt per Name oder Pfad einen weiteren Arbeitsordner unverändert hinzu, höchstens zwölf. Es wird nichts kopiert.
- ✕ entfernt eine Ordnerzuordnung, nicht den Ordner. Der Hinweis bietet **Rückgängig**.
- **In Dateien öffnen** öffnet den Ordner auf der Dateien-Seite.

**Zu einem Projekt hinzufügen** auf der Dateien-Seite, im Dateifenster oder auf Agenten-Dateikarten kopiert Dateien in den Projektordner und verknüpft Ordner als zusätzliche Arbeitsorte. Siehe [Dateien zu einem Projekt hinzufügen](/guide/files-git#add-files-to-a-project). Alternativ ziehst du lokale Dateien auf Projektkarte oder Bibliothek. Unterstützte Dokumente, Tabellen und Bilder kommen in die Bibliothek, andere Dateien in den Projektordner. Siehe [Eigene Dateien hinzufügen](/guide/library#add-files-of-yours).

### Memory

Drei Bereiche zeigen das Projektwissen, über eine Auswahl einzeln aufrufbar: **Notizen**, **Wiki** und **Dokumente**. Jeder hat eine eigene Adresse: `/projects/<id>/memory`, ergänzt um `?part=wiki` oder `?part=documents`. Auch die alten Adressen der Tabs Wissen und LLM Wiki öffnen diesen Bereich.

- **Notizen**: die gespeicherten Memory-Notizen des Projekts wie unter [Einstellungen → Memory](/settings?s=memory), mit **Notiz hinzufügen** und Suchfeld. Diese kurzen Fakten erhält jede Projektsitzung zum Start; siehe [Memory](/guide/memory).
- **Wiki**: Artikel und Quellen des Projekt-Wiki-Memory zum Lesen sowie **Letzte Aktualisierungen** durch neue und geänderte Dokumente. Agenten schreiben das Wiki, du liest es hier; siehe [Wiki-Memory](/guide/wiki-memory#a-projects-memory-tab).
- **Dokumente**: die nur für Projektsitzungen durchsuchbaren Dokumente und die Option, zusätzlich gemeinsames Wissen zu verwenden. Siehe [Eigene Projektdokumente](#give-a-project-documents-of-its-own). Bei aktiviertem Wiki-Memory und **Aus neuen Dokumenten lernen** ergänzen neue und geänderte Dokumente außerdem Notizen und Wiki des Projekts; siehe [Aus neuen Dokumenten lernen](/guide/wiki-memory#learn-from-new-documents).

### Skills

Alle verfügbaren Skills aus Projekt, Bibliothek und den eigenen Beständen von Claude Code und Codex, jeweils mit projektspezifischem Schalter. Siehe [Eigene Projekt-Skills](#give-a-project-skills-of-its-own).

### Agenten

Projektspezifische Agenten erscheinen als Team. Jeder zeigt seine Auslöser wie **Auf Anfrage** und Zeitpläne mit nächstem Lauf; darunter sind delegierte Agenten durch Linien verbunden. Ein Klick öffnet daneben Details zu Arbeitsort, Modell, Berechtigungen, Auftraggebern und Monatskosten sowie **Sitzung starten** im Projekt und **Öffnen** für die Agentenseite. Unter dem Board stehen unter **Hier ebenfalls verfügbar, projektübergreifend** die allgemeinen Agenten. **Neuer Agent hier** erstellt einen Projektagenten. Siehe [Agenten](/guide/agents).

Ein Projekt kann bei Erstellung über **Agent für dieses Projekt** oder hier über **Agenten für dieses Projekt erstellen** einen passenden Agenten erhalten:

- Bei ausreichender Beschreibung durch Zweck, Richtlinien, README oder Agentennotizen entwirft das Hilfsmodell einen zugeschnittenen Agenten auf Basis einer passenden Vorlage.
- Bei wenigen Angaben verwendet es eine Vorlage nach Ordnerinhalt und Beschreibung: Softwareentwicklung, Webentwicklung, ML-Research, Datenanalyse, wissenschaftliches Schreiben mit LaTeX, Recherche für Fachartikel und Berichte, Schreiben für Dokumente, Gestaltung für Bilder und Videos oder Präsentationen für Folien.
- Ohne erkennbare Grundlage verwendet es den Standard-Projektagenten.

Der Agent heißt passend zum Projekt, etwa „Shop-Entwickler“, und arbeitet nur dort und in dessen Ordner. Ohne andere Vorgabe starten Projektsitzungen mit ihm. Du kannst ihn wie andere eigene Agenten bearbeiten. Bei Erstellung von der Startseite wechselt **Agent** nach Fertigstellung auf ihn, sofern du inzwischen keinen anderen ausgewählt hast.

### Einstellungen

Fünf Bereiche verwalten das Projekt mit jeweils einer kurzen Erklärung:

- **Das Projekt**: **Name** neben dem farbigen Zeichen, **Worum es geht** und **Farbe**. Name, Inhalt und Farbe erscheinen auf Projektkarte, Projektseite und Startseite.
- **Richtlinien für Agenten**: Zielgruppe, Arbeitsweise und Hinweise. Diese Richtlinien werden jeder Sitzung übergeben, wie bei der Erstellung festgelegt.
- **Sitzungsstart**: Unter **Sitzungen starten als** wählst du **Den auf der Startseite gewählten Agenten** als Standard, zunächst General, oder einen integrierten beziehungsweise eigenen Agenten. Ein bislang unbenutztes Projekt öffnet dann die Startseite mit diesem Agenten.
- **Wiki-Memory**: Legt fest, ob das Projekt ein Wiki mit Artikeln aus seinen Dokumenten und seiner Arbeit pflegt. **Wie in den Einstellungen (Ein)** beziehungsweise **(Aus)** übernimmt den aktuellen Standard; **Ein** oder **Aus** weicht für dieses Projekt davon ab. Die Auswahl wird sofort gespeichert. [Einstellungen → Memory](/settings?s=memory&find=Wiki%20memory) enthält den Standard für alle Projekte; siehe [Wiki-Memory](/guide/wiki-memory#turn-it-on-or-off).
- **Enthaltene Projekte**: Die Auswahl macht das Projekt zur Gruppe. Siehe [Projekte gruppieren](#bring-projects-together-in-a-group).

Nach Änderungen erscheint eine beim Scrollen sichtbare Leiste **Ungespeicherte Änderungen** mit **Änderungen verwerfen** und **Speichern**. Unten erklärt **Projekt löschen**, was erhalten bleibt.

## Eigene Projekt-Skills

Skills beschreiben Arbeitsweisen, die Agenten bei passenden Aufgaben laden. Siehe [Skills](/guide/skills). Deine Skill-Bibliothek gilt überall. Ein Projekt kann zusätzliche, nur dort verfügbare Anleitungen haben, etwa „Nach APA 7 zitieren und jeden DOI prüfen“ für eine Abschlussarbeit oder „Zutaten in Gramm, dann nummerierte Schritte“ für ein Familienkochbuch. Außerdem kann es beliebige Skills für seine Sitzungen ein- oder ausschalten. Beides liegt unter **Skills**.

Der Tab gruppiert alle Skills wie [Einstellungen → Skills](/settings?s=skills) und bietet Suche, **Neuer Skill**, **⋯** und Filter für **Alle**, **Projekteigene**, **Integriert**, **Deine**, **Aus Plugins**, **Claude Code und Codex** sowie **Hier geändert**. Projekteigene Skills stehen zuerst. Ohne solche erklärt der Bereich den Zweck und bietet **Neuer Skill**.

**Neuer Skill** öffnet drei Felder und **Skill hinzufügen**:

- **Name**: Kleinbuchstaben mit Bindestrichen wie `citation-style`. Leerzeichen und Großbuchstaben werden beim Verlassen des Felds umgewandelt. Diesen Namen verwenden Agenten.
- **Wann verwenden**: etwa „Beim Zitieren einer Quelle in der Abschlussarbeit“. Diese Beschreibung erhalten alle Projektsitzungen; den Rest lädt der Agent nur bei Bedarf.
- **Skill**: Arbeitsschritte, Prüfungen und zu vermeidende Fehler in Markdown.

Für eine nur hier geltende Anpassung eines Bibliotheks-Skills öffnest du ihn und wählst **Für dieses Projekt anpassen**. Er wird mit Beispielen und Skripten ins Projekt kopiert und im Editor geöffnet. Die Bibliotheksfassung bleibt für andere Sitzungen unverändert.

Ein Skill braucht einen Namen mit 2 bis 64 Zeichen, eine Einsatzbeschreibung mit mindestens zehn Zeichen und eine Anleitung mit mehr als wenigen Wörtern. Insgesamt gelten höchstens 20.000 Zeichen. Erkennbare Passwörter, Keys und Tokens sind nicht erlaubt; beschreibe stattdessen ihren Ablageort.

### Einen Skill nur für dieses Projekt umschalten

Jede Zeile hat einen projektspezifischen Schalter für Bibliotheks-, Plugin-, Projekt- und agenteneigene Skills. Die Schalter unter [Einstellungen → Skills](/settings?s=skills) gelten für andere Sitzungen.

- Abweichungen heißen **Hier ein** oder **Hier aus** und lassen sich mit **Hier geändert** filtern. Global deaktivierte Skills zeigen **Aus** und können nur für dieses Projekt aktiviert werden.
- Das Skill-Fenster erklärt die globale Einstellung. **Einstellungen übernehmen** oder manuelles Zurückschalten entfernt die Abweichung.
- **⋯ → Alle Skills ausschalten** deaktiviert nach Bestätigung sämtliche im Tab enthaltenen Skills für dieses Projekt, auch ausgefilterte. **Alle Schalter hier zurücksetzen** übernimmt nach Bestätigung wieder die globalen Werte. **Skills für alle Projekte** öffnet Einstellungen → Skills. Später hinzugefügte Skills folgen ihrer üblichen Einstellung; laufende Sitzungen behalten ihre bisherige Auswahl bis zum Neustart. Konnten die eigenen Codex-Skills nicht gelesen werden, nennt die Bestätigung das und lässt sie unverändert.

Neue Projektsitzungen übernehmen den aktuellen Schaltzustand. Laufende behalten ihre Startauswahl, bei Custom gelten Änderungen ab dem nächsten Durchlauf. Claude-Code- und Codex-Skills werden projektspezifisch geschaltet, ohne die eigenen Programmeinstellungen zu ändern. Globale Skill-Zeilen nennen Projektabweichungen, etwa „In Abschlussarbeit aus“.

### Die projektspezifische Skill-Liste

Jeder eigene Skill zeigt Name, Einsatzbeschreibung und Nutzungszahl im Projekt und seinen Gruppen. Ein Namenskonflikt mit der Bibliothek trägt **Ersetzt Bibliotheks-Skill**; Projektsitzungen verwenden diese Fassung.

- Ein Klick zeigt Anleitung und **Änderungsverlauf**. **Bearbeiten** unten ändert Name, Einsatzbeschreibung und Text. Umbenennen erhält Dateien, Verlauf und Schaltzustand.
- **Entfernen** im selben Fenster fragt nach. Danach entfällt der Skill oder die gleichnamige Bibliotheksfassung gilt wieder. Entfernte Skills stehen unter der Liste als **Entfernt:** und lassen sich per Klick wiederherstellen.

Gruppen zeigen anschließend die eigenen Skills ihrer Projekte unter deren Namen. Gruppen-Sitzungen erhalten sie ebenfalls; bearbeiten kannst du sie im jeweiligen Projekt. Agenteneigene Skills werden für den Projektordner aufgeführt: persönliche sowie dort vorhandene, bei Claude Code unter `.claude/skills`.

### Wie Agenten die Skills erhalten

Claude Code, Codex und Custom erhalten beim Projektstart dessen Skills zusammen mit der Bibliothek gemäß den Projektschaltern. Claude Code verwendet dasselbe Plugin „hydor“, etwa hydor:citation-style; Codex denselben zusätzlichen Skill-Ordner; Custom seine Skill-Liste. Agenten erkennen Projekteigene und sollen sie bei passenden Aufgaben nutzen. Custom erhält neue oder geänderte Skills ab dem nächsten Durchlauf, Claude Code und Codex ab der nächsten Sitzung.

Skills liegen im App-Datenordner, nicht im Projektordner; deine Dateien bleiben unberührt. Gruppen-Sitzungen erhalten zusätzlich die Skills aller enthaltenen Projekte. Siehe [Was Gruppen-Sitzungen erhalten](#what-sessions-in-a-group-get).

### Von Agenten vorgeschlagene Projekt-Skills

Nach aufwendigen Aufgaben können Agenten eine bewährte Methode als neuen Skill oder Verbesserung vorschlagen. Du bestätigst, bearbeitest oder verwirfst; siehe [Skill-Vorschläge prüfen](/guide/skills#approve-edit-or-dismiss-a-proposed-skill). In Projekten enthält die Karte **Speichern für**:

- **Alle Sitzungen** für die allgemeine Bibliothek;
- den Projektnamen für eine nur dort verfügbare Fassung. Bei einer Bibliotheksverbesserung entsteht eine Projektkopie; die allgemeine bleibt unverändert.

Der Agent schlägt einen Bereich vor; du wählst vor der Bestätigung. Verbesserungen eigener Projekt-Skills bleiben ohne Bereichsauswahl im Projekt.

## Ein Projekt ändern

Öffne **Einstellungen** im Projekt, ändere Angaben und klicke **Speichern**. Neue Sitzungen erhalten Namen, Beschreibung und Richtlinien ab dann. Ein neuer Startagent gilt bei der nächsten Projektauswahl auf der Startseite oder **Neue Sitzung** auf der Projektseite. Der Stammordner bleibt unveränderbar.

## Ein Projekt löschen

1. Öffne das Projekt und **Mehr** unter **⋯** oben oder den Tab **Einstellungen**.
2. Wähle **Projekt löschen**.
3. Bestätige „Projekt *Name* löschen?“ mit **Löschen**. Bei automatisch erkannten Projekten erklärt die App, dass sie aus Claude-Code-, Codex- oder beiden Sitzungsbeständen stammen und nicht erneut angelegt werden.

Die bisherigen Inhalte bleiben erhalten:

- **Stamm- und Zusatzordner** samt Dateien bleiben an ihrem Ort.
- **Der Stammordner gilt als Kein Projekt** und wird weder vorgeschlagen noch automatisch aufgenommen. Manuelle Neuanlage über **Neues Projekt → In einem vorhandenen Ordner** bleibt möglich.
- **Sitzungen** bleiben ohne Projektzuordnung erhalten.
- **Bibliotheksinhalte** bleiben ohne Projektzuordnung erhalten.
- **Wissensdokumente** wechseln ins gemeinsame Wissen und sind damit allgemein durchsuchbar. Zur Trennung verschiebst du die Wissensdatenbank in ein anderes Projekt; siehe [Wissensdatenbanken verwalten](#rename-move-read-again-or-delete-a-knowledge-base).
- **Skills** wechseln in deine allgemeine Bibliothek. Bei Namenskonflikten wird der Projektname angehängt, etwa `research-thesis` statt `research` aus dem Projekt Thesis.
- **Memory** bleibt beim Ordner, da Notizen nicht an den Projekt-Datensatz gebunden sind.
- Das Projekt verlässt seine Gruppen. Eine dadurch leere Gruppe wird wieder ein gewöhnliches Projekt.

## Projekte zu einer Gruppe verbinden

Eine Gruppe ist ein Projekt, das mehrere andere für übergreifende Arbeit bündelt, etwa „Alles zur Abschlussarbeit“ mit „Abschlussarbeit“ und „Lesenotizen“. Sie besitzt Namen, eigenen Ordner, Richtlinien, Dokumente, Skills und Agenten wie ein Projekt. Ihre Sitzungen verwenden zusätzlich die enthaltenen Projekte.

### Was Gruppen-Sitzungen erhalten

- **Projektordner**: Claude Code kann in allen wie im eigenen Ordner arbeiten, andere Agenten erhalten die Pfade. Neue Ergebnisse werden ohne andere Vorgabe im eigenen Gruppenordner gespeichert.
- **Projektrichtlinien**: Nach den Gruppenrichtlinien folgen je Projekt Name, Beschreibung, Ordner und Richtlinien.
- **Projektdokumente**: gemeinsam durchsuchbar mit Gruppendokumenten und, sofern für die Gruppe aktiv, gemeinsamem Wissen. Jede Wissensdatenbank nennt ihre Herkunft.
- **Projekt-Skills** zusätzlich zu Gruppen-Skills und Bibliothek. Bei gleichen Namen gilt zuerst die Gruppe, dann das zuerst zugeordnete Projekt.
- **Memory** stammt aus dem Gruppenordner. Notizen der Einzelprojekte bleiben bei diesen.

### Eine Gruppe erstellen

1. Klicke auf der [Projektseite](/projects) auf **Projekte gruppieren**. Die Karte erscheint ab zwei gewöhnlichen Projekten.
2. Gib unter **Neue Projektgruppe** einen **Namen** ein, etwa „Arbeit“ oder „Alles zur Abschlussarbeit“.
3. Wähle unter **Enthaltene Projekte** mindestens eines aus. Erneutes Antippen entfernt es.
4. Optional ergänze Beschreibung, Agentenrichtlinien und Farbe.
5. **Gruppe erstellen** legt einen eigenen Ergebnisordner an und öffnet die Gruppe.

Auch ein bestehendes Projekt wird über **Einstellungen → Enthaltene Projekte** und **Speichern** zur Gruppe. Dort änderst du auch die Zuordnung. Ohne enthaltene Projekte wird es wieder ein gewöhnliches Projekt.

Im Tab **Memory** unter **Dokumente** zeigt die Gruppe zusätzlich die Dokumentenzahl jedes enthaltenen Projekts. Ein Klick öffnet dessen Dokumente. Unter **Skills** gibt es dieselbe Übersicht für enthaltene Skills.

### Grenzen

- Gruppen enthalten nur gewöhnliche Projekte, keine weiteren Gruppen. Ein bereits einer Gruppe zugeordnetes Projekt kann selbst keine Projekte bündeln; seine Einstellungen nennen stattdessen die zugehörige Gruppe.
- Ein Projekt darf mehreren Gruppen angehören.
- Eine Gruppe umfasst höchstens zwölf Projekte. Danach ist keine weitere Auswahl möglich.

## Projektsitzungen in der Seitenleiste filtern

Jedes Projekt hat in der Seitenleiste eine Gruppe mit Namen, Zeichen und neuesten Sitzungen. Der Stift an der Überschrift startet eine Projektsitzung. Siehe [Die Sitzungsliste](/guide/start#the-session-list).

So zeigst du nur ein Projekt:

1. Öffne **Sitzungen filtern und gruppieren** am Ende von **Sitzungen suchen**.
2. Unter **Alle Agenten**, **Claude Code** und **Codex** folgen **Alle Projekte**, bis zu acht Projekte und **Projekte** als Link zur Projektseite. Wähle das gewünschte Projekt.

Die Liste zeigt seine Sitzungen nach Tagen; die Filterschaltfläche ist farbig. **Alle Projekte** hebt die Auswahl auf. Der Agentenfilter wirkt zusätzlich. Nach Löschen des Projekts werden wieder alle Sitzungen angezeigt.

Auf der Projektseite hat **Mehr → Nur Projektsitzungen in der Seitenleiste** dieselbe Wirkung, mit Haken bei Aktivierung. Erneute Auswahl hebt den Filter auf.

Auf dem Smartphone öffnest du zuerst das Seitenleistenmenü.

## Ein Projekt mit Personen teilen

Du kannst einzelne Personen wie Betreuung oder Studierende mit jeweils eigenem Link einladen. Ohne dein Passwort sehen sie Projektdokumente, Sitzungen und vorhandene Experimentläufe oder Leselisten. Sie kommentieren unter eigenem Namen und dürfen bei Freigabe auch Dokumente bearbeiten. Agenten, Dateien, Einstellungen und andere Projekte bleiben ausgeschlossen. Einzelne Bibliotheksinhalte teilst du separat; siehe [Mit Personen teilen](/guide/library#share-with-people).

### Eine Person einladen

1. Öffne **Mehr → Mit Personen teilen** oben im Projekt oder auf seiner Karte der [Projektseite](/projects).
2. Gib unter **Person einladen** ihren **Namen** für Kommentare und Änderungen ein.
3. Wähle die Berechtigung:
   - **Ansehen und kommentieren**: alle freigegebenen Inhalte lesen und Dokumente, LaTeX, Folien, Tabellen und Seiten kommentieren.
   - **Dokumente bearbeiten**: zusätzlich Dokumente, Tabellen, Folien, Seiten und Designs in Bibliothekseditoren ändern. Bei Seiten gelten Text, Bilder und Layout, nie Code. LaTeX-Bearbeitung ist nur bei abgeschirmter Kompilierung möglich; siehe [Was nie geteilt wird](#what-is-never-shared).
4. Wähle **Eine Woche**, **Einen Monat** oder **Bis zur Deaktivierung**.
5. **Link erstellen** zeigt den Link einmalig zum Kopieren oder als QR-Code für die Smartphonekamera. Gespeichert wird nur sein Fingerabdruck, deshalb kann er später nicht erneut angezeigt werden. Du kannst jederzeit einen neuen erstellen.

Auch Agenten können nach jeweiliger Freigabe Links erstellen: „Teile mein Projekt Abschlussarbeit einen Monat lang mit Maria zum Kommentieren.“

### Was eingeladene Personen sehen

Der Link öffnet nur das Projekt im App-Design, ohne deine übrigen Inhalte:

- Oben stehen Zeichen, Name und Beschreibung. Rechts nennt das Menü unter dem eigenen Namen Rechte, Ablauf und freigebende Person und bietet **Sprache** mit Deutsch, Englisch, Chinesisch und Griechisch sowie **Design** mit **Hell**, **Dunkel** oder **Wie dieses Gerät** für diesen Browser.
- **Dokumente**: Seiten, Dokumente, Folien, Tabellen, LaTeX und Notebooks jeweils mit Vorschau. Inhalte öffnen lesbar an ihrer eigenen Adresse, LaTeX als gesetzte Seiten mit Quelltextzugriff, und bieten **Herunterladen** für PDF, Word, LaTeX-Projekt und andere Dateien. Mit Bearbeitungsrecht öffnen Dokumente, Tabellen, Folien, Seiten und Designs im Editor.
- **Sitzungen**: wie bei [Leselinks](/guide/devices#share-a-session-with-a-read-only-link) Gespräch, Schrittnamen, Dateiänderungen und angezeigte Seiten live mitlesen, niemals Befehlsausgaben, Überlegungen oder Tool-Eingaben. Vertrauliche Sitzungen erscheinen nie.
- **Läufe** bei Experimenten: Name, Ergebnis, Zeitpunkt, Metriken und Einstellungen, niemals Befehl, Ordner, Log oder ausführender Computer.
- **Leseliste**, wenn die Reading-list-App zugeordnete Fachartikel enthält: verlinkter Titel, Autoren, Publikationsort, Jahr, Lesestatus und Tags, niemals private Notizen oder Dateien.

Die Seite aktualisiert sich jede Minute. Projektagenten erfahren, mit wem geteilt wird und dass diese Personen Sitzungen mitlesen, damit keine Keys, Passwörter oder privaten Details darin landen.

### Kommentare unter eigenem Namen

**Kommentare** neben einem Dokument, LaTeX, Folien, Tabellen oder einer Seite, auf dem Smartphone darüber, zeigt Kommentare und Antworten mit Urheber. Eigene erscheinen als **Du**, Agenten als **Agent**, deine unter deinem Freigabenamen. Diesen nennt **Deine Kommentare erscheinen als** unten im Freigabedialog, zunächst „Eigentümer“; **Ändern** passt ihn an.

Über **Kommentar hinzufügen** können Gäste kopierte Textstellen einfügen oder für einen allgemeinen Kommentar weglassen. Bei Folien wählen sie die Folie, bei Tabellen Blatt und Zelle wie B4. Sie können alle Kommentare beantworten, erledigen und wieder öffnen, aber nur eigene ändern oder löschen. Mit Bearbeitungsrecht kommentieren sie direkt im Editor.

In deinem Editor erscheinen Gastkommentare unter deren Namen. Agenten lesen und beantworten sie wie deine, etwa „Beantworte Marias Kommentare zu Kapitel 3“. Sie sollen Kommentare nur als dokumentbezogene Aufträge behandeln und andere verlangte Aktionen wie Befehle, Dateizugriffe oder Nachrichten an Dritte nur auf deinen Auftrag ausführen. Neue Kommentare oder Antworten erzeugen eine Benachrichtigung wie „Maria hat kommentiert: …“ und einen Eintrag im [Posteingang](/inbox), etwa „Maria hat ‚Abschlussarbeit, Kapitel 3‘ kommentiert“. Er bleibt bis zu einer Antwort von dir oder einem Agenten beziehungsweise bis zur Erledigung.

Kommentare werden als Dokumentversion gespeichert, direkt aufeinanderfolgende gebündelt. Speichervorgänge im Editor erhalten währenddessen eingegangene Kommentare an ihren Textstellen.

### Änderungen unter eigenem Namen

Mit **Dokumente bearbeiten** gespeicherte Änderungen erstellen eine neue Version unter dem Gastnamen in **Versionen**. Agenten erfahren den letzten Bearbeiter. Gäste können fremde Kommentarurheber nicht ändern und fremde Kommentare nicht löschen. Bei zwischenzeitlichen Dokumentänderungen fragt die App vor dem Überschreiben; die andere Fassung bleibt im Versionsverlauf.

### Freigaben ändern oder beenden

**Geteilt mit** im Dialog listet Personen, Rechte, Ablauf und letzte Aktivität. **Mehr** unter **⋯** bietet:

- **Ansehen und kommentieren** oder **Dokumente bearbeiten**, wirksam ab der nächsten Aktion;
- **Eine Woche ab jetzt**, **Einen Monat ab jetzt** oder **Bis zur Deaktivierung**;
- **Neuen Link erstellen**: deaktiviert den alten sofort. Sende den neuen Link. Identität und Kommentare bleiben erhalten;
- **Freigabe beenden**: deaktiviert den Link sofort, erhält aber Beiträge unter dem Namen.

Abgelaufene, deaktivierte oder ersetzte Links zeigen entsprechende Hinweise. Die Person kann dich um einen neuen bitten.

### Was nie geteilt wird

- **Agenten**: Gäste können weder Sitzungen starten oder steuern noch Agenten befragen, sondern nur mitlesen und kommentieren.
- **Dateien**: Weder Projektordner noch andere Ordner sind zugänglich. Geteilt werden nur Bibliotheksinhalte und Leselink-Ansichten der Sitzungen.
- **Einstellungen, andere Projekte und übrige App**: Gruppenlinks zeigen nur gruppeneigene Inhalte, nicht die ihrer enthaltenen Projekte.
- **Ausführung von Code**: HTML-Seiten wie kleine Apps zeigen den gespeicherten Datenstand; Laufzeitänderungen bleiben nicht erhalten. Bearbeitungsrechte gelten für Text, Bilder und Layout, nie Skripte oder Klickaktionen. Notebooks zeigen Zellen und Ausgaben, führen aber nichts aus. LaTeX lässt sich über Freigaben nur bearbeiten, wenn TeX unter Linux mit bubblewrap abgeschirmt läuft; andernfalls bleibt Lesen und Kommentieren.

Jeder lange Zufallscode öffnet ein Projekt für eine Person. Ungültige Codes zählen wie falsche Passwörter derselben Herkunftsadresse: Nach zehn Versuchen pro Stunde sind Links und Anmeldung für diese Adresse eine Stunde gesperrt. Siehe [Zugriff von einem anderen Gerät](/guide/devices#reach-the-app-from-another-device).

## Gemeinsames Wissen für alle Sitzungen

Einmal hinzugefügte Verträge, Handbücher, Notizen, Fachartikel und Ordner lassen sich von Agenten nach Wörtern oder Bedeutung durchsuchen. Antworten zitieren Datei und Seite. **Wissensdatenbanken** sind benannte Sammlungen hochgeladener Dateien und lokaler Ordner.

- **Gemeinsames Wissen** unter [Projekte → Gemeinsames Wissen](/knowledge) ist für alle Sitzungen verfügbar, auch in Projekten, sofern dort nicht ausgeschaltet.
- **Projektwissen** im Tab **Memory** unter **Dokumente** ist nur für das Projekt und Gruppen, die es enthalten, verfügbar.

Öffne **Gemeinsames Wissen** auf der Projektseite oder über die Suche per Strg+K.

## Dokumente hinzufügen

Ohne vorhandenes Wissen zeigt die Seite „Dokumente einmal hinzufügen“ über einem großen Ablagefeld. Ziehe Dateien oder einen Ordner hinein, um die Wissensdatenbank „Meine Dokumente“ anzulegen. **Stattdessen mit einem Ordner auf diesem Computer beginnen** erstellt eine leere Datenbank dieses Namens, der du anschließend einen Ordner zuordnest.

Jede Wissensdatenbank hat ein eigenes Ablagefeld und **Ordner auf diesem Computer hinzufügen**. **Neue Wissensdatenbank** oben, auf dem Smartphone **Neu**, legt weitere getrennte Bestände an. Agenten können gezielt nach Namen suchen; zum Einstieg genügt eine.

### Dateien ablegen oder auswählen

Ziehe Dokumente oder Ordner auf das Feld „Dokumente oder Ordner hier ablegen“, oder nutze **Dateien auswählen** beziehungsweise **Ordner**. Dateien werden in den App-Datenordner kopiert und sofort eingelesen. Spätere Änderungen der Originale werden deshalb nicht übernommen. Ein kleiner Bereich zeigt den Upload. Bei gleichen Dateinamen fragt er nach **Ersetzen**, **Vorhandene überspringen** oder **Abbrechen**.

Uploads kommen vom gerade verwendeten Gerät. Auf dem Smartphone öffnet **Dateien auswählen** dessen Dateiauswahl; ganze Ordner lassen sich nur am Computer auswählen.

### Einen Ordner auf diesem Computer hinzufügen

1. Wähle bei der Wissensdatenbank **Ordner auf diesem Computer hinzufügen**.
2. Suche im Menü „Ordner einlesen und aktuell halten“ nach zuletzt verwendeten Ordnern oder Ordnern im Benutzerordner, oder gib einen Pfad wie `~/Documents/Manuals` ein und wähle ihn.

Der Ordner bleibt an seinem Ort, ohne Kopie. Seine Schaltfläche steht an der Datenbank. Eine Minute nach App-Start und danach stündlich werden neue und geänderte Dateien eingelesen und entfernte aus dem Bestand genommen. Nach einem Start werden auch zuvor nicht lesbare Dokumente erneut versucht, die eine neuere Version vielleicht unterstützt. **Jetzt neu einlesen** im Menü startet sofort.

„Dieser Computer“ ist der Hydor-Server und muss nicht das Gerät vor dir sein.

× an der Ordnerschaltfläche beendet die Einbindung und entfernt seine Dokumente aus der Datenbank. Ordner und Dateien selbst bleiben unverändert.

### Unterstützte Inhalte

- **Dokumente**: PDF, Word, Excel, PowerPoint, OpenDocument, EPUB, CSV und RTF, mit installiertem LibreOffice auch alte .doc-, .xls- und .ppt-Dateien.
- **Text**: Klartext, Markdown, Webseiten ohne HTML-Auszeichnung sowie Code- und Datenformate wie JSON, YAML, Python und JavaScript.

Ausgelassen werden Bilder, versteckte Dateien und Ordner mit Punkt am Namensanfang sowie Werkzeugordner wie `node_modules`, `.git`, `dist`, `build`, `target` und `venv`. Pro Ordner gelten höchstens 20.000 Dateien und zwölf Ebenen. Textdateien über 4 MB werden auf die ersten 4 MB gekürzt; die letzte Passage kennzeichnet den Schnitt. Dokumente über 300 MB werden nicht gelesen. Ein gescanntes PDF ohne Textebene enthält keinen durchsuchbaren Text.

Dokumente werden in Passagen von ungefähr höchstens 1.400 Zeichen geteilt, mit Herkunftsseite, Folie, Tabellenblatt oder Überschrift für Quellenangaben.

## Den Inhalt einer Wissensdatenbank ansehen

Jede Datenbank erscheint als Karte. Unter dem Namen stehen Dokument- und Passagenzahl, bei aktivierter semantischer Suche der Vorbereitungsstand als „Semantisch durchsuchbar“ oder wachsender Prozentwert und die letzte Einlesezeit, etwa „Vor 25 Min. eingelesen“. Während der Verarbeitung steht etwa „12 von 40 werden eingelesen…“.

Ist die semantische Suche aktiv, aber noch nicht bereit, erklärt ein Hinweis über den Datenbanken den Grund. Bis dahin suchen Agenten nach Wörtern:

- **Semantische Suche wird auf diesem Computer eingerichtet**, mit aktuellem Schritt wie PyTorch-Installation, einmalig beim ersten Mal;
- **Semantische Suche startet** beim Laden und erstmaligen Herunterladen des Modells;
- **Semantische Suche wartet auf Arbeitsspeicher** mit verfügbarem und benötigtem Speicher. Alle paar Minuten wird erneut versucht; das Schließen anderer Programme kann helfen;
- **Semantische Suche angehalten** mit Grund. Nach Korrektur, etwa Python-Installation, nutze **Erneut versuchen** oder [Einstellungen → Memory](/settings?s=memory&find=Search%20by%20meaning).

- **Dokumente anzeigen** listet Name oder Pfad, Passagenzahl und Größe. **Kein Text** kennzeichnet leere Textbestände, **Nicht lesbar** einen Fehler mit Erklärung beim Darüberfahren. Ein Klick öffnet das Dokument, **Dokumente ausblenden** schließt die Liste.
- Bei Lesefehlern nennt eine rote Zeile die Anzahl und erste Beispiele mit Gründen.
- Hochgeladene Dateien entfernst du über × am Zeilenende, am Computer beim Darüberfahren sichtbar. Gelöscht wird die Datenbankkopie. Dateien eingebundener Ordner haben kein ×; entferne sie im Originalordner oder beende dessen Einbindung.

## Wissensdatenbanken umbenennen, verschieben, neu einlesen oder löschen

**Mehr** unter **⋯** oben rechts bietet:

- **Jetzt neu einlesen** für alle Dateien und Ordner einschließlich neuer Dateien und erneuter Versuche zuvor nicht lesbarer Dokumente;
- **Umbenennen** mit bis zu 60 Zeichen und **Speichern**;
- **Verschieben nach** in **Gemeinsames Wissen** oder eines deiner Projekte. Ein Haken markiert den aktuellen Ort. Projektwissen ist nur dort durchsuchbar, gemeinsames Wissen überall. Die Auswahl erscheint ab dem ersten Projekt;
- **Löschen** mit Bestätigung für *Name*. Passagen und hochgeladene Kopien werden entfernt; lokale eingebundene Ordner bleiben unverändert.

## Eigene Projektdokumente

Öffne im Projekt den Tab **Memory** und wähle **Dokumente**.

- **Auch gemeinsames Wissen durchsuchen** ist standardmäßig aktiv. Ausgeschaltet begrenzt es Projektsitzungen auf eigene Dokumente und bei Gruppen deren enthaltene Projekte. Darunter stehen Zahl und Link des gemeinsamen Wissens.
- Ohne Dokumente legst du Dateien oder Ordner ab oder wählst sie aus. Es entsteht eine nach dem Projekt benannte Datenbank. **Stattdessen mit einem Ordner auf diesem Computer beginnen** erstellt zunächst eine leere für die Ordnerzuordnung.
- Mit Dokumenten erscheinen Suchfeld, siehe [Selbst suchen](#try-a-search-yourself), die Projekt-Wissensdatenbanken mit denselben Karten und Menüs wie gemeinsame Bestände sowie unten **Neue Wissensdatenbank**.

Über **Verschieben nach** lassen sich gemeinsame Wissensdatenbanken in Projekte und wieder zurück verschieben.

## Wie Agenten deine Dokumente durchsuchen

Ab der ersten Wissensdatenbank erhalten Claude Code, Codex, Custom und ACP-Agenten mit MCP-Unterstützung Tools zum Durchsuchen erlaubter Dokumente, Lesen umliegender Passagen und Auflisten der Bestände.

Beim Start erfährt der Agent zugängliche Datenbanken und Dokumentzahlen, im Projekt auch deren Herkunft als eigenes, gemeinsames oder aus einem enthaltenen Projekt stammendes Wissen. Er soll bei passenden Fragen zuerst dort suchen, vor Web und Memory, Antworten auf die gelesenen Inhalte stützen, verwendete Passagen mit Datei, Seite oder Abschnitt und Pfad zitieren und fehlende Antworten offen benennen.

Im Gespräch steht **Deine Dokumente durchsucht** mit Anfrage und Passagenzahl oder „Nichts gefunden“. Ein Klick zeigt Passagen mit Datei, Seite und Datenbank. Die Passage öffnet ihre Datei.

### Nach Wörtern, Bedeutung oder exaktem Text suchen

Drei Sucharten stehen bereit:

- **Nach Wörtern** für Passagen mit den Suchwörtern, beste Treffer zuerst, immer verfügbar.
- **Nach Bedeutung** für sinngleiche Inhalte, auch anders formuliert oder anderssprachig. Dafür muss **Nach Bedeutung suchen** unter [Einstellungen → Memory](/settings?s=memory&find=Search%20by%20meaning) aktiv sein, standardmäßig eingeschaltet. Das Modell läuft lokal und bereitet alle Datenbanken im Hintergrund vor. Siehe [Memory](/guide/memory#search-by-meaning). Ohne Aktivierung nennen Wissen-Tabs die passende Einstellung; Agenten verwenden Wortsuche.
- **Exakter Text** für Ausdrücke in Anführungszeichen wie „Kündigungsfrist“ oder reguläre Ausdrücke zwischen Schrägstrichen wie `/INV-\d+/`. Wie grep eignet sich das für Namen, Nummern und Codes; Ergebnisse folgen der Dokumentreihenfolge.

Ohne ausdrückliche Einschränkung kombiniert der Agent Wort- und Bedeutungssuche. Anführungszeichen oder Schrägstriche lösen exakte Suche aus. Standardmäßig erhält er acht Passagen, auf Wunsch bis zu 25, und kann einzelne Datenbanken nach Namen auswählen.

### Selbst suchen

Über den Datenbanken steht „Suche wie ein Agent: eine Frage oder ‚exakte Wörter‘ in Anführungszeichen“. Gib Text ein und drücke Enter. Bis zu zehn Passagen zeigen Datei, Seite, Datenbank und Suchart **Wörter**, **Bedeutung**, beides oder **Exakt**. Ein Klick öffnet die Datei.

Im gemeinsamen Wissen gilt derselbe Zugriff wie für eine Sitzung ohne Projekt, im Bereich **Dokumente** des Projekt-Tabs **Memory** derselbe wie für dessen Sitzung.

## Welche Sitzungen welches Wissen durchsuchen

| Sitzung | Durchsuchbare Inhalte |
|---|---|
| Ohne Projekt | Gemeinsames Wissen |
| Im Projekt | Eigene Projektdokumente und, sofern aktiv, gemeinsames Wissen |
| In einer Gruppe | Eigene Gruppendokumente, Dokumente aller enthaltenen Projekte und, sofern aktiv, gemeinsames Wissen |
| Von einer anderen Sitzung gestartet, also Hydor-Subagent | Derselbe Bestand wie bei der übergeordneten Sitzung |

Wissenstools liefern nie unzugängliche Projektdokumente, auch nicht bei direkter Pfadanfrage. Nach Löschen eines Projekts wird dessen Wissensdatenbank gemeinsam verfügbar.

## Einen Agenten fragen

- „Erstelle das Projekt Steuern 2026 für Belege und Steuererklärung. Starte Sitzungen als Researcher; alle Agenten sollen wissen, dass Beträge in EUR angegeben werden.“
- „Erstelle das Projekt Shop für meinen Code in ~/code/shop.“
- „Was liegt für meine Abschlussarbeit in der Bibliothek? Ordne den Lesetracker diesem Projekt zu.“
- „Welche meiner Arbeitsordner haben noch kein Projekt? Erstelle Projekte für die beiden häufigsten.“
- „Welche Projekte wurden aus Claude Code oder Codex übernommen?“
- „Erstelle für ~/code/scratch kein automatisches Projekt.“
- „Kopiere ~/Downloads/contract.pdf ins Projekt Steuern 2026 und verknüpfe zusätzlich ~/Documents/Receipts.“
- „Fasse Abschlussarbeit und Lesenotizen zur Gruppe Alles zur Abschlussarbeit zusammen.“
- „Erstelle dort einen Skill: nach APA 7 zitieren und vor jeder Kapitelabgabe alle DOIs prüfen.“
- „Kopiere den Schreib-Skill ins Projekt Garten und passe ihn für verständliche Kindersprache an.“
- „Aktiviere im Shop-Projekt docker und deaktiviere dort Claude Codes deploy-Skill, nur für dieses Projekt.“
- „Füge ~/Documents/Manuals zum gemeinsamen Wissen hinzu.“
- „Verschiebe die Wissensdatenbank Verträge nach Steuern 2026 und schalte dort die Suche im gemeinsamen Wissen aus.“
- „Welche Wissensdatenbanken habe ich, und welche Dokumente waren nicht lesbar?“
- „Teile Abschlussarbeit einen Monat mit Maria zum Kommentieren und mit Nikos zum Bearbeiten.“
- „Mit wem ist Abschlussarbeit geteilt, und was haben diese Personen zuletzt getan?“
- „Beantworte Marias Kommentare zu Kapitel 3 und erledige die bearbeiteten.“
- „Beende Nikos' Freigabe für Abschlussarbeit.“
