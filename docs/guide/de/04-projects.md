# Projekte und Wissen

Ein Projekt bündelt zusammengehörige Arbeit: Sitzungen, einen eigenen Arbeitsordner und weitere verwendete Ordner, Projektwissen aus Notizen, Wiki und eigenen Dokumenten, gemeinsame Agentenrichtlinien, eigene Skills, einen Startagenten und projektspezifische Agenten. Im gemeinsamen Wissen hinterlegst du Dokumente und Ordner einmal, damit alle Sitzungen sie durchsuchen und mit Datei- und Seitenangaben zitieren können. Dieser Beitrag erklärt Projekte und Projektgruppen, projektspezifische Skills, Freigaben für andere Personen sowie die Dokumentenablage und Suche der Agenten.

![Die Projektseite mit einer Karte je Projekt, Inhaltsübersicht und Neuer Sitzung](images/projects.webp)

## Was ein Projekt ist

Ein Projekt sammelt alles zu einem Vorhaben, ähnlich wie Projekte in ChatGPT oder Claude. Steuererklärung, Abschlussarbeit, Garten oder Website können eigene Projekte sein. Auf der Startseite wählst du den Projektnamen statt eines Ordners. Jede dort gestartete Sitzung:

- **arbeitet im Projektordner**. Der Agent soll Projektdateien dort ablegen und erfährt mit deiner ersten Nachricht, was aktuell darin liegt, zuletzt geänderte Dateien zuerst. Weitere zugeordnete Ordner bleiben an ihrem Ort und werden mitverwendet. Claude Code behandelt sie wie eigene Arbeitsordner; andere Agenten erhalten ihre Pfade;
- **befolgt die Richtlinien des Projekts**: was jeder Agent im Projekt wissen sollte, etwa für wen die Arbeit ist, wie gearbeitet wird und was zu beachten ist (siehe [Agentenrichtlinien](/guide/guidelines));
- **erhält projektspezifische Skills** zusätzlich zu deiner Skill-Bibliothek und lädt diese Arbeitsanleitungen bei passenden Aufgaben. Siehe [Eigene Projekt-Skills](#give-a-project-skills-of-its-own);
- **startet mit dem Projektagenten**, falls einer festgelegt ist. Siehe [Agenten](/guide/agents);
- **nutzt Erkenntnisse früherer Projektsitzungen**. Memory-Notizen sind dem Arbeitsordner zugeordnet und deshalb für alle Projektsitzungen gemeinsam verfügbar. Siehe [Memory](/guide/memory);
- **durchsucht Projektdokumente** und, sofern nicht deaktiviert, das gemeinsame Wissen. Siehe [Welche Sitzungen welches Wissen durchsuchen](#which-sessions-search-which-knowledge).

Sitzungen gehören danach zu einem Projekt, wo sie arbeiten. Jede Sitzung, die im Ordner des Projekts oder in einem Ordner darin arbeitet, gehört zum Projekt, egal wo sie gestartet wurde: in Hydor, in Claude Code oder in Codex. Liegt der Ordner eines Projekts in dem eines anderen, bekommt das innere Projekt die Sitzung. Eine Sitzung in einem Worktree zählt für den Ordner, aus dem der Worktree erstellt wurde, und ein Projekt, dessen Ordner dein persönlicher Ordner ist, bekommt nur die Sitzungen im persönlichen Ordner selbst. Wenn du also ein Projekt für einen Ordner erstellst, in dem du schon arbeitest, kommen seine früheren Sitzungen sofort hinein (die Seitenleiste zeigt sie unter dem Projekt, nicht als Ordnergruppe), und eine Sitzung, die Hydor im Ordner eines Projekts startet (von der Startseite, einer geplanten Aufgabe, einer App oder der API), startet im Projekt, mit seinen Richtlinien, Skills und seinem Wissen von der ersten Runde an.

Ein Projekt kann andere Projekte zusammenfassen. Das ist eine **Gruppe**; siehe [Projekte zu einer Gruppe verbinden](#bring-projects-together-in-a-group).

## Die Projektseite öffnen

Klicke unten in der Seitenleiste auf **Projekte**. Öffne auf dem Smartphone zuerst das Seitenleistenmenü. Auch die Suche nach „Projekte“ mit Strg+K beziehungsweise ⌘K führt dorthin.

Die Seite hat zwei Tabs:

- **Alle Projekte** mit deinen Projekten und **Neues Projekt** oben rechts.
- **Gemeinsames Wissen** für Dokumente, die alle Sitzungen durchsuchen können. Siehe [Gemeinsames Wissen](#shared-knowledge-documents-every-session-can-search).

Jede Projektkarte zeigt:

- ein Streifen in der Farbe des Projekts mit seinem Zeichen: ein abgerundetes Quadrat in dieser Farbe mit dem ersten Buchstaben des Namens (das Zeichen einer Gruppe hat ein zweites Quadrat dahinter, und auf dem Streifen steht **Gruppe**). Ein Projekt, das Hydor von selbst erstellt hat, sagt auf seinem Streifen, wo es es gefunden hat: **Von Claude Code**, **Von Codex** oder **Von Claude Code und Codex**, mit den Zeichen der Programme (siehe [Projekte, die in Claude Code und Codex gefunden wurden](#projects-found-in-claude-code-and-codex)). In der Ecke steht **Mehr** (⋯), dasselbe Menü wie oben auf der Seite des Projekts;
- sein Name und darunter, worum es geht, oder sein Ordner, wenn es keine Beschreibung hat. Eine Gruppe sagt „Bringt … zusammen“ und nennt die Namen ihrer Projekte;
- was es enthält: wie viele Sitzungen (jede Sitzung darin, egal ob du sie hier gestartet hast oder ob sie im Ordner des Projekts arbeitet), wie viele Dinge in der Bibliothek, Dokumente und Skills;
- die Zeit seit der letzten Sitzungsaktivität sowie **Neue Sitzung** zum direkten Start im Projekt.

Ein Klick auf die Karte öffnet das Projekt. Auch sein Name in der Suche per Strg+K führt direkt dorthin. Ohne Projekte erklärt die Seite deren Nutzen in drei kurzen Abschnitten mit **Projekt erstellen**.

Ziehe lokale Dateien auf eine Projektkarte, um sie hinzuzufügen. Währenddessen steht etwa „Ablegen, um zu ‚Abschlussarbeit‘ hinzuzufügen“. Dokumente, Tabellen, Folien, LaTeX und Notebooks werden Bibliotheksseiten, Bilder, Videos und Audio werden dort gespeichert. Andere Dateien landen im Projektordner. Siehe [Eigene Dateien hinzufügen](/guide/library#add-files-of-yours).

Unter den Projekten listet **Ordner, in denen du arbeitest** Ordner auf, in denen du in letzter Zeit gearbeitet hast und die zu Projekten werden könnten (siehe [Ordner, in denen du arbeitest, noch ohne Projekt](#folders-you-work-in-not-in-a-project-yet)).

## Ein Projekt erstellen

1. Klicke auf der [Projektseite](/projects) auf **Neues Projekt**. Auch im Ordnermenü der Startseite gibt es **Neues Projekt** (siehe [Eine Sitzung in einem Projekt starten](#start-a-session-in-a-project)).
2. Fülle das Fenster aus:
   - **Name**: wie du das Projekt nennst, etwa „Steuern 2026“, „Der Garten“ oder „Abschlussarbeit“. Bis zu 60 Zeichen. Es ist das einzige Feld, das du ausfüllen musst. Das Quadrat daneben ist das Zeichen des Projekts, in der Farbe, die es bekommt: Klicke darauf, um eine andere der acht Farben auszuwählen (Bernstein, Blau, Grün, Rosa, Violett, Türkis, Orange, Schiefergrau). Wenn du keine auswählst, bekommen Projekte die Farben der Reihe nach.
   - **Dateien ablegen**: Wähle eine der beiden Möglichkeiten.
     - **In einem neuen Ordner** ist der Standard. Die App erstellt einen nach dem Projekt benannten Ordner.
     - **In einem Ordner, den ich bereits habe** verwendet einen bestehenden Projekt- oder Dokumentenordner auf diesem Computer unverändert. **Kürzlich verwendet, noch in keinem Projekt** bietet passende Ordner direkt an. **Ordner auswählen …** sucht nach Name oder Pfad. Ist der Name noch leer, wird der Ordnername übernommen. **Ändern** wählt einen anderen Ordner.
3. Optional öffnet **Weitere Optionen** die übrigen Angaben. Ein Punkt zeigt bereits ausgefüllte Optionen an:
   - **Worum es geht**: bis zu 300 Zeichen Beschreibung unter dem Namen.
   - **Agentenrichtlinien**: Zielgruppe, Arbeitsweise und Besonderheiten für jede Projektsitzung, etwa „Beträge in EUR. Ich bin in Griechenland selbstständig.“ Bis zu 20.000 Zeichen. Siehe [Agentenrichtlinien](/guide/guidelines).
   - **Andere Ordner, die es verwendet**: zusätzliche Arbeitsordner, ohne Kopieren der Dateien. **Ordner hinzufügen** erlaubt bis zu zwölf, ✕ entfernt die Zuordnung.
4. Lasse **Ein Agent dafür** aktiviert, um einen Projektagenten erstellen zu lassen; siehe [Agenten](#agents). Alternativ schaltest du es aus.
5. Klicke **Projekt erstellen** oder drücke Enter im Namensfeld.

Neue Ordner entstehen unter **Projekte** am Speicherort der Aufgabenordner. „Taxes 2026“ bekommt etwa `~/Hydor/Projects/taxes-2026`, sofern du den Ort nicht geändert hast; siehe [Aufgabenordner verschieben](/guide/agents#move-task-folders). Bei vergebenem Namen folgen `-2`, `-3` und so weiter. Von der Projektseite aus öffnet sich das neue Projekt, von der Startseite aus wird es für die nächste Sitzung ausgewählt.

Zwei weitere Dinge stellst du danach im Tab **Einstellungen** des Projekts ein: den Agenten, als der seine Sitzungen beginnen, und die Projekte, die es zusammenbringt. Seine Notizen, sein Wiki und seine Dokumente findest du im Tab **Memory**, seine Skills im Tab **Skills** und weitere Ordner im Tab **Dateien**.

### Ein Projekt für einen vorhandenen Ordner

Wähle im Fenster **Neues Projekt** unter **Speicherort der Projektdateien** die Option **In einem Ordner, den ich bereits habe** und dann den Ordner: Das Projekt arbeitet darin, und es wird kein neuer Ordner erstellt. Ein Agent kann das auch tun: „Erstelle ein Projekt namens Shop für ~/code/shop“. Der eigene Ordner eines Projekts lässt sich nicht mehr ändern, sobald das Projekt erstellt ist, aber die Ordner, mit denen es arbeitet, schon: siehe [Dateien](#files). Sitzungen, die schon in diesem Ordner gearbeitet haben, gehören sofort zum Projekt. Wenn Hydor aus diesem Ordner schon ein Projekt erstellt hat (siehe [Projekte, die in Claude Code und Codex gefunden wurden](#projects-found-in-claude-code-and-codex)), machst du es mit einem eigenen Projekt für diesen Ordner zu deinem Projekt, so wie du es jetzt erstellst, mit deinem Namen, deiner Farbe, deiner Beschreibung und deinen Richtlinien. Es ist dasselbe Projekt mit seinen Sitzungen, und es sagt nicht mehr, wo es gefunden wurde.

### Aus Claude Code und Codex erkannte Projekte

Hydor listet die Sitzungen auf, die du außerhalb von Hydor in Claude Code und Codex hattest: in einem Terminal, in VS Code, in der Desktop-App von Claude oder in der Codex-App (siehe [Die Sitzungsliste](/guide/start#the-session-list)). Die Ordner, in denen du jetzt mit ihnen arbeitest, werden von selbst zu Hydor-Projekten, sodass deine Arbeit dort als Projekt mit ihren Sitzungen auf dich wartet.

- **Wann ein Ordner zum Projekt wird**: sobald mindestens zwei Sitzungen, die du selbst in Claude Code oder Codex gestartet hast, darin gearbeitet haben, in einem Terminal, in VS Code, in der Desktop-App von Claude oder in der Codex-App. Sitzungen, die ein Skript oder ein anderes Programm ausgeführt hat (etwa `codex exec` oder das Agent SDK), Sitzungen, die ein Agent für einen Teil seiner Arbeit gestartet hat (Subagenten), und Hydors eigene Sitzungen zählen nicht. Eine Sitzung in einem Unterordner eines Git-Repositorys zählt für das ganze Repository.
- **Die eigenen Projekte von Codex**: Die Projekte, die du in der Codex-App führst, einschließlich der Ordner, die sie für deine ChatGPT-Projekte anlegt, werden zu Projekten, sobald eine Sitzung in einem ihrer Ordner gearbeitet hat. Das Projekt übernimmt den Namen, den Codex dafür hat, seinen ersten Ordner als eigenen Ordner des Projekts und seine anderen Ordner als die Ordner, mit denen das Projekt arbeitet.
- **Was ausgenommen ist**: dein persönlicher Ordner; versteckte Ordner (außer den Ordnern der eigenen Projekte von Codex); temporäre Ordner; die Ordner, die die App für sich selbst anlegt (Aufgabenordner, Läufe von Apps, Worktrees und ihre Daten); Ordner, die du als **Kein Projekt** markiert hast; und Ordner, die ein Projekt schon hat: sein eigener Ordner, einer, mit dem es arbeitet, oder ein Ordner darin.
- **Zeitpunkt**: nach dem Einlesen vorhandener Sitzungen beim Hydor-Start, danach etwa innerhalb einer Minute nach neuen Sitzungen.
- **Name**: der Name, den du dem Ordner in der Seitenleiste gegeben hast (**Umbenennen**), sonst der Name des Codex-Projekts, sonst der eigene Name des Ordners. Wenn ein Projekt schon diesen Namen hat, kommt der Name des übergeordneten Ordners davor („client/app“), danach eine Zahl.
- **Auf der Projektseite**: Seine Karte sagt auf ihrem Streifen, wo es gefunden wurde: **Von Claude Code**, **Von Codex** oder **Von Claude Code und Codex**, mit den Zeichen der Programme. Fahre darüber, um „Hydor hat dieses Projekt für einen Ordner erstellt, in dem du mit Claude Code arbeitest“ zu lesen (oder Codex, oder beide). So gefundene Projekte stehen nach den Projekten, die du schon hast, das zuletzt aktive zuerst.
- **In der Seitenleiste**: Seine Gruppe ist die Gruppe des Projekts, mit seinem Zeichen und Namen und nach dem Namen den Zeichen der Programme. Fahre über den Namen oder öffne das **⋯** der Überschrift, um zu sehen, woher seine Sitzungen kamen (**Außerhalb von Hydor gestartet**), wie bei der Gruppe eines Ordners.
- **Vollständiges Projekt**: Der Arbeitsordner bleibt unverändert, ohne Verschieben oder Kopieren. Dokumente, Skills, Richtlinien, Agenten, Bibliothek und Freigaben funktionieren wie gewohnt. Du kannst umbenennen, beschreiben und löschen. Claude-Code-Skills aus `.claude/skills` erscheinen weiterhin unter **Skills**; CLAUDE.md und AGENTS.md werden wie bisher gelesen.
- **Nach dem Löschen** erstellt Hydor es nicht erneut automatisch. Du kannst aber selbst wieder ein Projekt anlegen; siehe [Ein Projekt löschen](#delete-a-project).

Die Herkunftsstreifen auf der [Projektseite](/projects) machen erkannte Projekte sichtbar.

### Arbeitsordner ohne Projekt

Unter den Projekten auf der [Projektseite](/projects) erscheinen bis zu sechs Vorschläge aus den letzten 90 Tagen: Arbeitsordner oder Ordner, in denen Sitzungen von anderswo Dateien geändert haben, die noch keinem Projekt gehören. Häufig und kürzlich verwendete stehen oben. Unterordner eines Git-Projekts zählen zum gesamten Projekt. Die Karte zeigt Name, Pfad, Sitzungszahl und letzte Verwendung.

- **Projekt erstellen** öffnet das Fenster **Neues Projekt** mit ausgewähltem Ordner und ausgefülltem Namen.
- ✕ mit **Kein Projekt** entfernt den Vorschlag und verhindert die automatische Projekterstellung. Siehe [Automatisch erkannte Projekte](#projects-found-in-claude-code-and-codex). Der Ordner bleibt unverändert und kann weiter manuell über **Neues Projekt** aufgenommen werden.

Ordner, in denen du mit Claude Code und Codex arbeitest, werden von selbst zu Projekten, daher enthält diese Liste vor allem Ordner, in denen du aus Hydor gearbeitet hast. Dein persönlicher Ordner, versteckte Ordner, temporäre Ordner und die Ordner, die die App für sich selbst anlegt (Aufgabenordner, Läufe von Apps, Worktrees), werden nie vorgeschlagen. Sobald ein Projekt einen Ordner hat, als eigenen oder als einen der Ordner, mit denen es arbeitet, verschwindet er aus der Liste. Dieselben Ordner stehen im Fenster **Neues Projekt** unter **Kürzlich verwendet, noch in keinem Projekt**.

## Eine Projektsitzung starten

Dafür gibt es zwei Wege:

- **Vom Projekt aus**: **Neue Sitzung** auf der Projektkarte oder oben auf der Projektseite, auf dem Smartphone der Stift, öffnet die Startseite mit ausgewähltem Projekt und dessen bisheriger Auswahl. Ohne gespeicherte Auswahl wird gegebenenfalls der Projektagent gewählt.
- **Von der Startseite aus**: Öffne den Ordner-Chip in der Zeile unter dem Nachrichtenfeld. Sein Menü hat zwei kurze Listen: **Projekte**, die fünf zuletzt aktiven (und das ausgewählte, falls es nicht darunter ist), jedes mit seinem Zeichen, seinem Namen und seinem Ordner; dann **Ordner**, der verwendete Ordner und die, die du zuletzt verwendet hast; dann **Neuer Aufgabenordner**. **Neu** neben der Überschrift **Projekte** erstellt ein Projekt und wählt es aus. Gib oben im Feld einen Teil eines Namens ein, um ein beliebiges Projekt oder einen beliebigen Ordner zu finden. Der eigene Ordner eines Projekts wird nie als Ordner aufgeführt: Wenn du ihn über seinen Namen oder Pfad findest oder ihn vorher auf der Startseite als Ordner ausgewählt hast, ist er das Projekt, und die Sitzung arbeitet im Projekt.

Wenn du ein Projekt auswählst, zeigt der Chip sein Zeichen und seinen Namen statt eines Ordners, und die Sitzung arbeitet im Ordner des Projekts. In einem Projekt, in dem du noch nichts ausgewählt hast, zeigt der Chip **Agent** den eigenen Agenten des Projekts, wenn es einen hat, mit dem Programm, dem Modell und den Berechtigungen, die dieser Agent vorschlägt, sonst **Allgemein**; in einem, in dem du schon etwas ausgewählt hast, zeigt er, was du dort ausgewählt hast. Du kannst jedes davon vor dem Start noch ändern. Gib dann deine Nachricht ein und klicke auf **Starten**.

Jedes Projekt merkt sich Programm, Modell, Denkaufwand, Berechtigungen, Agent, Memory, Ausgabenlimit, **Vertraulich** und **Neuer Worktree** separat. Siehe [Was sich die Startseite merkt](/guide/sessions#what-the-start-page-remembers). Das gewählte Projekt bleibt geräteübergreifend vorausgewählt. Für Arbeit außerhalb wählst du einen Ordner oder **Neuer Aufgabenordner**. Wird das ausgewählte Projekt gelöscht, bleibt sein Ordner ausgewählt, aber ohne Projektzuordnung.

Auf dem Smartphone öffnet das Menü als Bedienfeld „Projekt oder Arbeitsordner“. Die Tastatur erscheint erst beim Antippen der Suche.

Wenn der Ordner des Projekts ein Git-Repository ist, bietet das Ende des Menüs **Neuer Worktree**, wie bei jedem Ordner in einem Repository: Die Sitzung arbeitet dann auf einem eigenen Branch in einer getrennten Kopie des Repositorys (siehe [Sitzungen](/guide/sessions)). Sitzungen, die du per Sprache im Freisprechmodus startest, beginnen an dem Ort, der zuletzt auf der Startseite ausgewählt wurde, mit seinen Auswahlen (siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice)).

## Die Projektseite

Klicke auf der Projektseite auf ein Projekt, um es zu öffnen. Der obere Teil seiner Seite hat die Farbe des Projekts: Der Pfeil links führt zurück zu allen deinen Projekten (wie auf den anderen Seiten der App), dann folgen das Zeichen und der Name des Projekts und worum es geht (bei einer Gruppe die Projekte der Gruppe; ohne Beschreibung sein Ordner). Rechts startet **Neue Sitzung** eine Sitzung im Projekt (auf dem Smartphone der Stift), und **Mehr** (⋯) enthält:

- **Ordner unter „Dateien“ öffnen**: der Ordner des Projekts auf der Seite Dateien.
- **Nur Projektsitzungen in der Seitenleiste**: Die Sitzungsliste zeigt nur die Sitzungen im Projekt, so wie es der Filter der Seitenleiste selbst tut (siehe [Die Sitzungen eines Projekts in der Seitenleiste zeigen](#show-one-projects-sessions-in-the-sidebar)). Wähle es noch einmal aus, um wieder alle Sitzungen zu sehen.
- **Mit anderen teilen**: Lade jemanden (eine Betreuerin, einen Studenten) ein, das Projekt zu sehen und seine Dokumente über einen eigenen Link zu kommentieren (siehe [Ein Projekt mit anderen teilen](#share-a-project-with-people)).
- **Projekt löschen**; siehe [Ein Projekt löschen](#delete-a-project).

Darunter stehen sieben Tabs: **Übersicht**, **Bibliothek**, **Dateien**, **Memory**, **Skills**, **Agenten** und **Einstellungen**. **Bibliothek**, **Memory** und **Skills** zeigen eine Anzahl, außer auf dem Smartphone, wo die Tabs ihre Anzahl weglassen. Auf dem Smartphone (oder in einem schmalen Fenster) stehen die Tabs, die nicht passen, unter **Mehr** am Ende der Zeile: Tippe darauf, um ein Menü mit ihnen zu öffnen. Während einer davon geöffnet ist, steht dort sein Name anstelle von **Mehr**. Jeder Tab erscheint sofort.

### Übersicht

Karten zeigen das Projekt auf einen Blick:

- **Sitzungen**: alle zugehörigen Sitzungen, ob hier oder extern im Projektordner gestartet, zuletzt aktive zuerst. Angezeigt werden Agentensymbol, Titel, am Computer Aktivität wie **In Arbeit**, **Braucht dich** oder **Bereit**, und Zeit seit letzter Aktivität. Ein Klick öffnet die Sitzung; ab mehr als sechs zeigt **Alle** den Rest. Ohne Sitzungen erklärt ein Hinweis die Arbeit mit Projektordner, Richtlinien, Dokumenten und Skills und bietet **Neue Sitzung**.
- **In der Bibliothek**: Projektinhalte, zuletzt geänderte zuerst. Siehe [Bibliothek](#library). **In der Bibliothek öffnen** zeigt sie dort. Auf die Karte gezogene Dateien werden hinzugefügt.
- **Geteilt mit**, daneben oder auf dem Smartphone darunter: nach erster Freigabe die Personen mit Initialen und letzter Aktivität, etwa „‚Kapitel 3‘ kommentiert · vor 2 Std.“ oder „Noch nicht geöffnet“. Eine Person oder **Teilen** öffnet die Freigabeverwaltung. Siehe [Projektfreigaben](#share-a-project-with-people).
- **Jede Sitzung hier** (daneben, auf dem Smartphone darunter): was jede Sitzung im Projekt bekommt. **Ordner** (sein Ordner und wie viele weitere es nutzt: Klicke darauf, um zum Tab **Dateien** zu gelangen), **Richtlinien** (der Anfang seiner Richtlinien: Klicke darauf, um zu **Einstellungen** zu gelangen), **Memory** (was es sich merkt, in einer Zeile: „12 Notizen · 8 Artikel · 5 Dokumente“, wobei die Artikel nur erscheinen, solange sein Wiki-Memory an ist; klicke darauf, um zum Tab **Memory** zu gelangen), **Skills** (wie viele eigene es hat) und **Beginnt als** (sein Agent).
- **Die Projekte, die es zusammenbringt**, bei einer Gruppe: jedes ihrer Projekte, mit der Anzahl seiner Sitzungen. Klicke eines an, um es zu öffnen.

### Bibliothek

Hier liegen Seiten, Folien, Dokumente, Tabellen und LaTeX-Dokumente aus Projektsitzungen sowie selbst gespeicherte oder zugeordnete Inhalte. Siehe [Nach Projekt sortieren](/guide/library#sort-it-by-project). Karten öffnen Inhalte; **Mehr** bietet dieselben Aktionen wie in der Bibliothek. **In der Bibliothek öffnen** nutzt deren Suche und Inhaltsfilter. Ohne Inhalte gibt es **Neue Seite** und **Neue Folien**, jeweils im Projekt. Gezogene Dateien werden ihrem Typ entsprechend aufgenommen. Siehe [Eigene Dateien hinzufügen](/guide/library#add-files-of-yours).

### Dateien

Der Projektordner und Zusatzordner erscheinen wie auf der [Dateien-Seite](/guide/files-git#browse-a-folder), mit Öffnen, Mehrfachauswahl, Ziehen, Hochladen und Zeilenmenüs. Dateien öffnen sich in einem Fenster über der Seite.

- Über dem Inhalt stehen Schaltflächen je Ordner, der Stamm unter dem Projektnamen, weitere unter ihren Ordnernamen. Ein Klick wechselt den angezeigten Ordner.
- **Ordner hinzufügen** fügt per Name oder Pfad einen weiteren Arbeitsordner unverändert hinzu, höchstens zwölf. Es wird nichts kopiert.
- ✕ auf dem Chip eines Ordners nimmt ihn aus dem Projekt heraus; der Ordner selbst bleibt, wie er ist. Der Hinweis bietet **Rückgängig machen**.
- **In Dateien öffnen** öffnet den Ordner auf der Dateien-Seite.

**Zu einem Projekt hinzufügen** auf der Dateien-Seite, im Dateifenster oder auf Agenten-Dateikarten kopiert Dateien in den Projektordner und verknüpft Ordner als zusätzliche Arbeitsorte. Siehe [Dateien zu einem Projekt hinzufügen](/guide/files-git#add-files-to-a-project). Alternativ ziehst du lokale Dateien auf Projektkarte oder Bibliothek. Unterstützte Dokumente, Tabellen und Bilder kommen in die Bibliothek, andere Dateien in den Projektordner. Siehe [Eigene Dateien hinzufügen](/guide/library#add-files-of-yours).

### Memory

Drei Bereiche zeigen das Projektwissen, über eine Auswahl einzeln aufrufbar: **Notizen**, **Wiki** und **Dokumente**. Jeder hat eine eigene Adresse: `/projects/<id>/memory`, ergänzt um `?part=wiki` oder `?part=documents`. Auch die alten Adressen der Tabs Wissen und LLM Wiki öffnen diesen Bereich.

- **Notizen**: die gespeicherten Memory-Notizen des Projekts wie unter [Einstellungen → Memory](/settings?s=memory), mit **Notiz hinzufügen** und Suchfeld. Diese kurzen Fakten erhält jede Projektsitzung zum Start; siehe [Memory](/guide/memory).
- **Wiki**: Artikel und Quellen des Projekt-Wiki-Memory zum Lesen sowie **Letzte Aktualisierungen** durch neue und geänderte Dokumente. Agenten schreiben das Wiki, du liest es hier; siehe [Wiki-Memory](/guide/wiki-memory#a-projects-memory-tab).
- **Dokumente**: die eigenen Dokumente des Projekts, die nur seine Sitzungen durchsuchen, und ob sie auch das gemeinsame Wissen durchsuchen. Siehe [Eigene Projektdokumente](#give-a-project-documents-of-its-own). Neue und geänderte Dokumente ergänzen außerdem die Notizen und das Wiki des Projekts, solange Wiki-Memory und **Aus neuen Dokumenten lernen** eingeschaltet sind (siehe [Aus neuen Dokumenten lernen](/guide/wiki-memory#learn-from-new-documents)). Hat ein Projekt mehr Dokumente, als sein Wiki einliest (zunächst 100), liest das Wiki bis zu dieser Zahl die angehefteten Dokumente ein, dann die, die Agenten am häufigsten genutzt haben, und die neuesten. Dieser Bereich sagt es dir: „Sein Wiki liest 100 seiner 240 Dokumente ein: die angehefteten, die am häufigsten genutzten und die neuesten. Agenten durchsuchen alle.“ Im Menü **Mehr** eines Dokuments in der Liste heftest du es mit **Ins Wiki-Memory einlesen** an (siehe [Wenn ein Projekt zu viele Dokumente hat](/guide/wiki-memory#when-a-project-has-too-many-documents)).

### Skills

Alle verfügbaren Skills aus Projekt, Bibliothek und den eigenen Beständen von Claude Code und Codex, jeweils mit projektspezifischem Schalter. Siehe [Eigene Projekt-Skills](#give-a-project-skills-of-its-own).

### Agenten

Projektspezifische Agenten erscheinen als Team. Jeder zeigt seine Auslöser wie **Auf Anfrage** und Zeitpläne mit nächstem Lauf; darunter sind delegierte Agenten durch Linien verbunden. Ein Klick öffnet daneben Details zu Arbeitsort, Modell, Berechtigungen, Auftraggebern und Monatskosten sowie **Sitzung starten** im Projekt und **Öffnen** für die Agentenseite. Unter dem Board stehen unter **Hier ebenfalls verfügbar, projektübergreifend** die allgemeinen Agenten. **Neuer Agent hier** erstellt einen Projektagenten. Siehe [Agenten](/guide/agents).

Ein Projekt kann bei Erstellung über **Ein Agent dafür** oder hier über **Einen für dieses Projekt erstellen** einen passenden Agenten erhalten:

- Sagt das Projekt genug über sich selbst (worum es geht und welche Richtlinien es hat, oder eine README oder Agentennotizen in seinem Ordner), entwirft das Hilfsmodell einen Agenten, der zu ihm passt, ausgehend von der Vorlage für seine Art.
- Sagt es wenig, ist der Agent die Vorlage für seine Art, bestimmt nach dem, was sein Ordner enthält, oder nach den Worten, mit denen es beschrieben wurde: ein Entwickler für Software, ein Webentwickler für eine Website, ein ML-Forscher für Experimente mit maschinellem Lernen, ein Analyst für Daten, ein Paper-Autor für ein Paper in LaTeX, ein Forscher für Papers und Berichte zum Lesen, ein Autor für Dokumente, ein Designer für Bilder und Videos oder ein Präsentator für Folien.
- Ohne erkennbare Grundlage verwendet es den Standard-Projektagenten.

Der Agent heißt passend zum Projekt, etwa „Shop-Entwickler“, und arbeitet nur dort und in dessen Ordner. Ohne andere Vorgabe starten Projektsitzungen mit ihm. Du kannst ihn wie andere eigene Agenten bearbeiten. Bei Erstellung von der Startseite wechselt **Agent** nach Fertigstellung auf ihn, sofern du inzwischen keinen anderen ausgewählt hast.

### Einstellungen

Alles zum Projekt selbst, in sechs Teilen, jeweils mit einer Zeile dazu, wofür er da ist:

- **Das Projekt**: **Name** neben dem farbigen Zeichen, **Worum es geht** und **Farbe**. Name, Inhalt und Farbe erscheinen auf Projektkarte, Projektseite und Startseite.
- **Was jeder Agent darin befolgt**: seine **Agentenrichtlinien**, wie bei der Erstellung.
- **Agent beim Sitzungsstart**: Unter **Neue Sitzungen starten mit** tippst du eine Auswahl an: **Auf der Startseite ausgewählter Agent** (die Voreinstellung: Die Startseite behält den Agenten, den du im Projekt gewählt hast, Allgemein, bis du einen anderen wählst) oder einen deiner Agenten, ob eingebaut oder selbst erstellt. Ein Projekt, in dem du noch nichts gewählt hast, öffnet sich dann auf der Startseite mit diesem Agenten.
- **Wiki-Memory**: ob das Projekt ein Wiki mit Artikeln aus seinen Dokumenten und seiner Arbeit führt: **Wie in den Einstellungen (ein)** (oder **(aus)**, je nachdem, was gerade die Voreinstellung ist), **Ein** oder **Aus**. Die Auswahl wird sofort gespeichert. [Einstellungen → Memory](/settings?s=memory&find=Wiki%20memory) enthält die Voreinstellung für jedes Projekt (siehe [Wiki-Memory](/guide/wiki-memory#turn-it-on-or-off)). Darunter steht **Höchstzahl der Dokumente für sein Wiki** auf **Wie in den Einstellungen (100)** oder **Eine eigene Zahl**: Hat ein Projekt mehr Dokumente, liest sein Wiki nur so viele ein (die angehefteten, die am häufigsten genutzten und die neuesten), und Agenten durchsuchen alle (siehe [Wenn ein Projekt zu viele Dokumente hat](/guide/wiki-memory#when-a-project-has-too-many-documents)).
- **Für andere Projekte durchsuchbar**: ein Schalter, standardmäßig an, der für ein Projekt angezeigt wird, nicht für eine Gruppe. Ist er an, können Agenten in deinen anderen Projekten die Notizen, das Wiki, die Dokumente und die Unterhaltungen dieses Projekts finden und lesen, wenn sie danach suchen (sie ändern sie nie); ist er aus, hält das Projekt sich für sich, und sie können das nicht. Die eigenen Sitzungen des Projekts sind davon nicht betroffen und können weiterhin in deine anderen Projekte schauen. Die Auswahl wird sofort gespeichert (siehe [Über ein Projekt hinaus suchen](/guide/memory#search-beyond-one-project)).
- **Die Projekte, die es zusammenbringt**: Wähle hier Projekte aus, um dieses Projekt zu einer Gruppe zu machen (siehe [Projekte in einer Gruppe zusammenbringen](#bring-projects-together-in-a-group)).

Nach Änderungen erscheint eine beim Scrollen sichtbare Leiste **Ungespeicherte Änderungen** mit **Änderungen verwerfen** und **Speichern**. Unten erklärt **Projekt löschen**, was erhalten bleibt.

## Eigene Projekt-Skills

Skills beschreiben Arbeitsweisen, die Agenten bei passenden Aufgaben laden. Siehe [Skills](/guide/skills). Deine Skill-Bibliothek gilt überall. Ein Projekt kann zusätzliche, nur dort verfügbare Anleitungen haben, etwa „Nach APA 7 zitieren und jeden DOI prüfen“ für eine Abschlussarbeit oder „Zutaten in Gramm, dann nummerierte Schritte“ für ein Familienkochbuch. Außerdem kann es beliebige Skills für seine Sitzungen ein- oder ausschalten. Beides liegt unter **Skills**.

Der Tab listet jeden Skill, den die Sitzungen des Projekts bekommen, in Gruppen wie unter [Einstellungen → Skills](/settings?s=skills), mit einem Suchfeld, **Neuer Skill**, dem Menü **⋯** und den Filtern **Alle**, **Eigene**, **Eingebaut**, **Eigene**, **Von Plugins**, **Claude Code und Codex** und **Hier geändert**. Die eigenen Skills des Projekts stehen zuerst, unter **Eigene**; solange es noch keine gibt, sagt diese Gruppe, wofür sie da sind, und bietet **Neuer Skill** an.

**Neuer Skill** öffnet ein Fenster mit drei Feldern, danach **Skill hinzufügen**:

- **Name**: Kleinbuchstaben mit Bindestrichen wie `citation-style`. Leerzeichen und Großbuchstaben werden beim Verlassen des Felds umgewandelt. Diesen Namen verwenden Agenten.
- **Wann verwenden**: etwa „Beim Zitieren einer Quelle in der Abschlussarbeit“. Diese Beschreibung erhalten alle Projektsitzungen; den Rest lädt der Agent nur bei Bedarf.
- **Skill**: Arbeitsschritte, Prüfungen und zu vermeidende Fehler in Markdown.

Für eine nur hier geltende Anpassung eines Bibliotheks-Skills öffnest du ihn und wählst **Für dieses Projekt ändern**. Er wird mit Beispielen und Skripten ins Projekt kopiert und im Editor geöffnet. Die Bibliotheksfassung bleibt für andere Sitzungen unverändert.

Ein Skill braucht einen Namen mit 2 bis 64 Zeichen, eine Einsatzbeschreibung mit mindestens zehn Zeichen und eine Anleitung mit mehr als wenigen Wörtern. Insgesamt gelten höchstens 20.000 Zeichen. Erkennbare Passwörter, Keys und Tokens sind nicht erlaubt; beschreibe stattdessen ihren Ablageort.

### Einen Skill nur für dieses Projekt umschalten

Jeder Skill im Tab hat am Ende seiner Zeile einen Schalter: die Skills deiner Bibliothek (eingebaute, eigene und die deiner Plugins), die eigenen des Projekts sowie die eigenen von Claude Code und Codex. Ein Schalter hier gilt nur für die Sitzungen dieses Projekts; die Schalter unter [Einstellungen → Skills](/settings?s=skills) gelten für alle anderen Sitzungen.

- Abweichungen heißen **Hier aktiviert** oder **Hier deaktiviert** und lassen sich mit **Hier geändert** filtern. Global deaktivierte Skills zeigen **Aus** und können nur für dieses Projekt aktiviert werden.
- Im Fenster eines Skills, der hier umgeschaltet wurde, steht, was die Einstellungen für alle anderen Sitzungen festlegen, und **Einstellungen übernehmen** kehrt dorthin zurück. Das Gleiche bewirkt es, ihn von Hand zurückzuschalten.
- Im Menü **⋯** schalten **Alle Skills einschalten** und **Alle Skills ausschalten** nach deiner Bestätigung jeden Skill ein oder aus, den der Tab für dieses Projekt auflistet, und **Standardeinstellungen für alle Skills übernehmen** setzt nach deiner Bestätigung jeden Skill auf das zurück, was die Einstellungen sagen. **Standard-Skill-Einstellungen für alle Projekte ändern** öffnet Einstellungen → Skills. Alles ein- oder auszuschalten betrifft jeden Skill im Tab, auch die, die die Filter ausblenden; später hinzugefügte Skills folgen ihrer üblichen Einstellung, und bereits laufende Sitzungen behalten ihre, bis sie neu starten. Konnten die eigenen Skills von Codex nicht gelesen werden, sagt das die Bestätigung, und sie bleiben, wie sie sind.

Neue Projektsitzungen übernehmen den aktuellen Schaltzustand. Laufende behalten ihre Startauswahl, bei Custom gelten Änderungen ab dem nächsten Durchlauf. Claude-Code- und Codex-Skills werden projektspezifisch geschaltet, ohne die eigenen Programmeinstellungen zu ändern. Globale Skill-Zeilen nennen Projektabweichungen, etwa „In Abschlussarbeit aus“.

### Die projektspezifische Skill-Liste

Jeder eigene Skill des Projekts erscheint als Zeile: sein Name, wann er zu benutzen ist und wie oft Agenten im Projekt (und in Gruppen, die es einbinden) ihn benutzt haben. Ein Skill, der den Namen eines Skills in deiner Skill-Bibliothek trägt, hat das Abzeichen **Ersetzt den Skill aus der Bibliothek**: Die Sitzungen des Projekts bekommen ihn anstelle des Skills aus der Bibliothek.

- Klicke ihn an, um den Skill und seinen **Verlauf** der Änderungen zu lesen. **Veränderung** unten in diesem Fenster bearbeitet seinen Namen, wann er zu benutzen ist und seinen Text: Ein neuer Name behält seine übrigen Dateien, seinen Verlauf und seinen Schalter.
- **Entfernen** im selben Fenster fragt nach. Danach entfällt der Skill oder die gleichnamige Bibliotheksfassung gilt wieder. Entfernte Skills stehen unter der Liste als **Entfernt:** und lassen sich per Klick wiederherstellen.

Gruppen zeigen anschließend die eigenen Skills ihrer Projekte unter deren Namen. Gruppen-Sitzungen erhalten sie ebenfalls; bearbeiten kannst du sie im jeweiligen Projekt. Agenteneigene Skills werden für den Projektordner aufgeführt: persönliche sowie dort vorhandene, bei Claude Code unter `.claude/skills`.

### Wie Agenten die Skills erhalten

Claude Code, Codex und Custom erhalten beim Projektstart dessen Skills zusammen mit der Bibliothek gemäß den Projektschaltern. Claude Code verwendet dasselbe Plugin „hydor“, etwa hydor:citation-style; Codex denselben zusätzlichen Skill-Ordner; Custom seine Skill-Liste. Agenten erkennen Projekteigene und sollen sie bei passenden Aufgaben nutzen. Custom erhält neue oder geänderte Skills ab dem nächsten Durchlauf, Claude Code und Codex ab der nächsten Sitzung.

Skills liegen im App-Datenordner, nicht im Projektordner; deine Dateien bleiben unberührt. Gruppen-Sitzungen erhalten zusätzlich die Skills aller enthaltenen Projekte. Siehe [Was Gruppen-Sitzungen erhalten](#what-sessions-in-a-group-get).

### Von Agenten vorgeschlagene Projekt-Skills

Nach einer Aufgabe, die viel Mühe gekostet hat, kann ein Agent vorschlagen, seine Methode als Skill zu behalten oder einen Skill zu verbessern, dem er gefolgt ist, und du genehmigst, bearbeitest oder verwirfst den Vorschlag (siehe [Einen vorgeschlagenen Skill genehmigen, bearbeiten oder verwerfen](/guide/skills#approve-edit-or-dismiss-a-proposed-skill)). Ist die Sitzung in einem Projekt, fragt die Karte unter **Speichern für**, wo er bleiben soll:

- **Für alle Sitzungen**: in deiner Skill-Bibliothek, wie außerhalb eines Projekts;
- den Projektnamen für eine nur dort verfügbare Fassung. Bei einer Bibliotheksverbesserung entsteht eine Projektkopie; die allgemeine bleibt unverändert.

Der Agent schlägt einen Bereich vor; du wählst vor der Bestätigung. Verbesserungen eigener Projekt-Skills bleiben ohne Bereichsauswahl im Projekt.

## Ein Projekt ändern

Öffne das Projekt, gehe zu seinem Tab **Einstellungen**, ändere, was du möchtest, und klicke auf **Speichern**. Sitzungen, die du ab dann im Projekt startest, bekommen den neuen Namen, die neue Beschreibung und die neuen Richtlinien. Ein neuer Agent gilt, wenn du das Projekt das nächste Mal auf der Startseite auswählst oder auf seiner Seite auf **Neue Sitzung** klickst. Der Ordner des Projekts bleibt derselbe: Er lässt sich nicht in einen anderen Ordner verschieben.

## Ein Projekt löschen

1. Öffne das Projekt und klicke oben auf **Mehr** (⋯) oder gehe zu seinem Tab **Einstellungen**.
2. Wähle **Projekt löschen**.
3. Bestätige „Projekt *Name* löschen?“ mit **Löschen**. Bei automatisch erkannten Projekten erklärt die App, dass sie aus Claude-Code-, Codex- oder beiden Sitzungsbeständen stammen und nicht erneut angelegt werden.

Die bisherigen Inhalte bleiben erhalten:

- **Sein Ordner** und die Dateien darin bleiben, wo sie sind, ebenso die Ordner, mit denen es gearbeitet hat.
- **Sein Ordner kommt auf die Liste Kein Projekt**: Hydor schlägt ihn nicht wieder vor und macht ihn nicht von selbst wieder zu einem Projekt. Du kannst selbst weiterhin ein Projekt dafür erstellen (**Neues Projekt** → **In einem Ordner, den ich bereits habe**).
- **Sitzungen** bleiben ohne Projektzuordnung erhalten.
- **Bibliotheksinhalte** bleiben ohne Projektzuordnung erhalten.
- **Wissensdokumente** wechseln ins gemeinsame Wissen und sind damit allgemein durchsuchbar. Zur Trennung verschiebst du die Wissensdatenbank in ein anderes Projekt; siehe [Wissensdatenbanken verwalten](#rename-move-read-again-or-delete-a-knowledge-base).
- **Seine Skills** wandern in deine Skill-Bibliothek, sodass jede Sitzung sie von da an bekommt. Trägt einer den Namen eines Skills, den die Bibliothek schon hat, hängt er den Namen des Projekts hinter seinen eigenen: Aus `research` des Projekts Thesis wird `research-thesis`.
- **Memory** bleibt beim Ordner, da Notizen nicht an den Projekt-Datensatz gebunden sind.
- Das Projekt verlässt seine Gruppen. Eine dadurch leere Gruppe wird wieder ein gewöhnliches Projekt.

## Projekte zu einer Gruppe verbinden

Eine Gruppe ist ein Projekt, das mehrere andere für übergreifende Arbeit bündelt, etwa „Alles zur Abschlussarbeit“ mit „Abschlussarbeit“ und „Lesenotizen“. Sie besitzt Namen, eigenen Ordner, Richtlinien, Dokumente, Skills und Agenten wie ein Projekt. Ihre Sitzungen verwenden zusätzlich die enthaltenen Projekte.

### Was Gruppen-Sitzungen erhalten

- **Projektordner**: Claude Code kann in allen wie im eigenen Ordner arbeiten, andere Agenten erhalten die Pfade. Neue Ergebnisse werden ohne andere Vorgabe im eigenen Gruppenordner gespeichert.
- **Projektrichtlinien**: Nach den Gruppenrichtlinien folgen je Projekt Name, Beschreibung, Ordner und Richtlinien.
- **Die Dokumente der Projekte**: werden zusammen mit den eigenen Dokumenten der Gruppe und dem gemeinsamen Wissen durchsucht (es sei denn, die Gruppe schaltet das gemeinsame Wissen aus). Der Agent erfährt, aus welchem Projekt jede Wissensdatenbank stammt.
- **Die Skills der Projekte**, zusammen mit den eigenen der Gruppe und deiner Skill-Bibliothek. Haben zwei denselben Namen, kommt zuerst der eigene der Gruppe, dann der des Projekts, das sie zuerst eingebunden hat.
- **Memory** stammt aus dem eigenen Ordner der Gruppe. Die Notizen, die Agenten in jedem Projekt gespeichert haben, bleiben bei diesem Projekt.

### Eine Gruppe erstellen

1. Klicke auf der [Projektseite](/projects) auf **Projekte gruppieren**. Die Karte erscheint ab zwei gewöhnlichen Projekten.
2. Gib unter **Neue Gruppe von Projekten** einen **Namen** ein, etwa „Arbeit“ oder „Alles zur Abschlussarbeit“.
3. Tippe unter **Die Projekte, die es zusammenbringt** jedes Projekt an, das aufgenommen werden soll; tippe es noch einmal an, um es wieder herauszunehmen. Wähle mindestens eines aus.
4. Fülle optional **Worum es geht** und die **Agentenrichtlinien** aus und wähle eine Farbe.
5. Klicke auf **Gruppe erstellen**. Wie ein Projekt bekommt sie einen eigenen Ordner für das, was darin entsteht, und ihre Seite öffnet sich.

Du kannst auch ein bestehendes Projekt zu einer Gruppe machen: Wähle auf seinem Tab **Einstellungen** unter **Die Projekte, die es zusammenbringt** Projekte aus und klicke auf **Speichern**. Die Projekte einer Gruppe änderst du auf dieselbe Weise. Nimmst du alle heraus, ist es wieder ein gewöhnliches Projekt.

Im Tab **Memory** einer Gruppe zeigt **Dokumente** außerdem **Auch die Dokumente der Projekte, die es zusammenführt**: jedes ihrer Projekte, mit der Zahl seiner Dokumente. Klicke eines an, um die Dokumente dieses Projekts zu öffnen. Ihr Tab **Skills** zeigt **Auch die Skills der Projekte, die es zusammenbringt** auf dieselbe Weise.

### Grenzen

- Gruppen enthalten nur gewöhnliche Projekte, keine weiteren Gruppen. Ein bereits einer Gruppe zugeordnetes Projekt kann selbst keine Projekte bündeln; seine Einstellungen nennen stattdessen die zugehörige Gruppe.
- Ein Projekt darf mehreren Gruppen angehören.
- Eine Gruppe umfasst höchstens zwölf Projekte. Danach ist keine weitere Auswahl möglich.

## Projektsitzungen in der Seitenleiste filtern

Jedes Projekt hat in der Seitenleiste eine Gruppe mit Namen, Zeichen und neuesten Sitzungen. Der Stift an der Überschrift startet eine Projektsitzung. Siehe [Die Sitzungsliste](/guide/start#the-session-list).

So zeigst du nur ein Projekt:

1. Klicke in der Seitenleiste auf die Filterschaltfläche am Ende des Feldes **Sitzungen suchen** (**Sitzungen filtern und gruppieren**).
2. Unter **Alle Agenten**, **Claude Code** und **Codex** folgen **Alle Projekte**, bis zu acht Projekte und **Projekte** als Link zur Projektseite. Wähle das gewünschte Projekt.

Die Sitzungsliste zeigt dann nur die Sitzungen dieses Projekts, nach Tagen, und die Filterschaltfläche ist farbig, solange ein Filter eingeschaltet ist. Wähle **Jedes Projekt**, um wieder alle Sitzungen zu sehen. Der Agentenfilter wirkt gleichzeitig, sodass du nur die Sitzungen eines Agenten in einem Projekt siehst. Wird das Projekt gelöscht, zeigt die Liste wieder alle Sitzungen.

Auf der eigenen Seite des Projekts bewirkt **Mehr** (⋯) → **Nur Projektsitzungen in der Seitenleiste** dasselbe, mit einem Haken, solange es eingeschaltet ist; wähle es noch einmal, um wieder alle Sitzungen zu sehen.

Auf dem Smartphone öffnest du zuerst das Seitenleistenmenü.

## Ein Projekt mit Personen teilen

Du kannst Personen in ein Projekt einladen, zum Beispiel eine Betreuerin und die Studierenden, die mit dir arbeiten, jeweils mit einem eigenen Link. Ohne dein Passwort sehen sie die Dokumente des Projekts, seine Sitzungen und, wenn es sie hat, seine Läufe und seine Leseliste. Sie kommentieren seine Dokumente unter ihrem eigenen Namen, und wenn du es erlaubst, ändern sie auch seine Dokumente. Sie erreichen nie deine Agenten, deine Dateien, deine Einstellungen oder deine anderen Projekte. Um nur eine einzelne Sache aus der Bibliothek zu teilen (ein Dokument, eine Seite, ein Bild, ein Video …), siehe [Mit Personen teilen](/guide/library#share-with-people).

### Eine Person einladen

1. Öffne das Projekt und klicke oben auf **Mehr** (⋯) oder auf seiner Karte auf der [Projektseite](/projects) auf **Mehr**. Klicke auf **Mit anderen teilen**.
2. Gib unter **Person einladen** ihren **Namen** für Kommentare und Änderungen ein.
3. Wähle die Berechtigung:
   - **Ansehen und kommentieren**: alle freigegebenen Inhalte lesen und Dokumente, LaTeX, Folien, Tabellen und Seiten kommentieren.
   - **Dokumente bearbeiten**: zusätzlich Dokumente, Tabellen, Folien, Seiten und Designs in Bibliothekseditoren ändern. Bei Seiten gelten Text, Bilder und Layout, nie Code. LaTeX-Bearbeitung ist nur bei abgeschirmter Kompilierung möglich; siehe [Was nie geteilt wird](#what-is-never-shared).
4. Wähle **Eine Woche**, **Einen Monat** oder **Bis zur Deaktivierung**.
5. Klicke auf **Link für diese Person erstellen**. Kopiere ihn mit der Schaltfläche zum Kopieren und schicke ihn der Person, oder klicke auf die Schaltfläche für den QR-Code, um ihn als QR-Code für die Kamera ihres Smartphones anzuzeigen. Der Link wird nur jetzt angezeigt: Die App behält nur einen Fingerabdruck davon, deshalb kann sie ihn nicht noch einmal anzeigen. Du kannst der Person jederzeit einen neuen erstellen.

Auch Agenten können nach jeweiliger Freigabe Links erstellen: „Teile mein Projekt Abschlussarbeit einen Monat lang mit Maria zum Kommentieren.“

### Was eingeladene Personen sehen

Ihr Link öffnet das Projekt für sich allein, im Design der App, ohne etwas anderes von dir drumherum:

- Oben stehen Zeichen, Name und Beschreibung. Rechts nennt das Menü unter dem eigenen Namen Rechte, Ablauf und freigebende Person und bietet **Sprache** mit Deutsch, Englisch, Chinesisch und Griechisch sowie **Design** mit **Hell**, **Dunkel** oder **Geräteeinstellung übernehmen** für diesen Browser.
- **Dokumente**: die Seiten, Dokumente, Folien, Tabellen, LaTeX-Dokumente und Notebooks des Projekts, jeweils mit ihrem Bild. Eines öffnet sich zum Lesen so, wie es seine eigene Adresse zeigt (ein LaTeX-Dokument als gesetzte Seiten, sein Quelltext einen Klick entfernt), mit **Herunterladen** für seine Dateien: ein PDF, ein Word-Dokument, das LaTeX-Projekt und so weiter. Mit **Dokumente bearbeiten** öffnen sich Dokumente, Tabellen, Folien, Seiten und Designs stattdessen in ihrem Editor.
- **Sitzungen**: die Sitzungen des Projekts, so wie ein [Link zum Lesen](/guide/devices#share-a-session-with-a-read-only-link) eine Sitzung zeigt: die Unterhaltung, die Schritte mit ihren Namen, Dateiänderungen und Seiten, die der Agent gezeigt hat, und man liest live mit, während ein Agent arbeitet. Nie die Ausgabe von Befehlen, das Denken des Agenten oder das, was ein Schritt bekommen hat. Eine vertrauliche Sitzung wird nie angezeigt.
- **Ausführungen**, wenn das Projekt Experimente hat: Name jedes Laufs, wie er verlaufen ist und wann, seine Metriken und seine Einstellungen. Nie sein Befehl, sein Ordner, sein Log oder der Computer, auf dem er lief.
- **Leseliste**, wenn die Reading-list-App zugeordnete Fachartikel enthält: verlinkter Titel, Autoren, Papersort, Jahr, Lesestatus und Tags, niemals private Notizen oder Dateien.

Die Seite aktualisiert sich von selbst, jede Minute, solange sie offen ist. Agenten, die im Projekt arbeiten, erfahren, mit wem es geteilt ist und dass diese Personen seine Sitzungen lesen, sodass sie Keys, Passwörter und private Angaben darin vermeiden.

### Kommentare unter eigenem Namen

**Kommentare** neben einem Dokument, LaTeX, Folien, Tabellen oder einer Seite, auf dem Smartphone darüber, zeigt Kommentare und Antworten mit Urheber. Eigene erscheinen als **Du**, Agenten als **Agent**, deine unter deinem Freigabenamen. Diesen nennt **Deine Kommentare erscheinen für sie unter dem Namen** unten im Freigabedialog, zunächst „Eigentümer“; **Ändern** passt ihn an.

Zum Kommentieren klicken sie auf **Kommentar hinzufügen** und fügen dann die Worte ein, um die es geht, aus dem Dokument kopiert, oder lassen sie weg, um das ganze Dokument zu kommentieren; bei Folien wählen sie die Folie, bei einer Tabelle das Blatt und die Zelle (etwa B4). Sie können jeden Kommentar beantworten und erledigen oder wieder öffnen, aber nur ihre eigenen ändern oder löschen. Mit **Dokumente bearbeiten** kommentieren sie im Editor selbst, so wie du.

In deinem Editor erscheinen Gastkommentare unter deren Namen. Agenten lesen und beantworten sie wie deine, etwa „Beantworte Marias Kommentare zu Kapitel 3“. Sie sollen Kommentare nur als dokumentbezogene Aufträge behandeln und andere verlangte Aktionen wie Befehle, Dateizugriffe oder Nachrichten an Dritte nur auf deinen Auftrag ausführen. Neue Kommentare oder Antworten erzeugen eine Benachrichtigung wie „Maria hat kommentiert: …“ und einen Eintrag im [Posteingang](/inbox), etwa „Maria hat ‚Abschlussarbeit, Kapitel 3‘ kommentiert“. Er bleibt bis zu einer Antwort von dir oder einem Agenten beziehungsweise bis zur Erledigung.

Kommentare werden als Dokumentversion gespeichert, direkt aufeinanderfolgende gebündelt. Speichervorgänge im Editor erhalten währenddessen eingegangene Kommentare an ihren Textstellen.

### Änderungen unter eigenem Namen

Mit **Dokumente bearbeiten** gespeicherte Änderungen erstellen eine neue Version unter dem Gastnamen in **Versionen**. Agenten erfahren den letzten Bearbeiter. Gäste können fremde Kommentarurheber nicht ändern und fremde Kommentare nicht löschen. Bei zwischenzeitlichen Dokumentänderungen fragt die App vor dem Überschreiben; die andere Fassung bleibt im Versionsverlauf.

### Freigaben ändern oder beenden

Im Dialog zum Teilen listet **Geteilt mit** jede Person auf, mit dem, was sie tun darf, bis wann und was sie zuletzt getan hat. Ihr Menü **Mehr** (⋯) bietet:

- **Ansehen und kommentieren** oder **Dokumente bearbeiten**, wirksam ab der nächsten Aktion;
- **Ab jetzt eine Woche lang**, **Ab jetzt einen Monat lang** oder **Bis zur Deaktivierung**;
- **Neuen Link erstellen**: deaktiviert den alten sofort. Sende den neuen Link. Identität und Kommentare bleiben erhalten;
- **Freigabe beenden**: deaktiviert den Link sofort, erhält aber Beiträge unter dem Namen.

Ein Link, der abgelaufen ist, angehalten oder neu erstellt wurde, sagt das beim Öffnen („Dieser Link ist abgelaufen“, „Dieser Link wurde ausgeschaltet“), und die Person kann dich um einen neuen bitten.

### Was nie geteilt wird

- **Agenten**: Gäste können weder Sitzungen starten oder steuern noch Agenten befragen, sondern nur mitlesen und kommentieren.
- **Dateien**: Weder Projektordner noch andere Ordner sind zugänglich. Geteilt werden nur Bibliotheksinhalte und Leselink-Ansichten der Sitzungen.
- **Deine Einstellungen, deine anderen Projekte** und alles andere in der App. Der Link einer Gruppe zeigt die eigenen Dinge der Gruppe, nicht die der Projekte, die sie zusammenbringt.
- **Etwas ausführen**: Eine HTML-Seite (eine kleine App, ein Tracker) wird mit ihren Daten so gezeigt, wie sie sind, und was sie ändert, wird nicht gespeichert; mit **Dokumente bearbeiten** ändern sie ihre Worte, Bilder und das Layout, nie ihren Code (ihre Skripte und das, was beim Anklicken läuft); ein Notebook zeigt seine Zellen und Ausgaben und läuft nie. LaTeX-Dokumente werden über einen Link nur dort geändert, wo TeX von bubblewrap abgeschottet läuft (Linux); anderswo lesen und kommentieren die Personen sie.

Jeder lange Zufallscode öffnet ein Projekt für eine Person. Ungültige Codes zählen wie falsche Passwörter derselben Herkunftsadresse: Nach zehn Versuchen pro Stunde sind Links und Anmeldung für diese Adresse eine Stunde gesperrt. Siehe [Zugriff von einem anderen Gerät](/guide/devices#reach-the-app-from-another-device).

## Gemeinsames Wissen für alle Sitzungen

Einmal hinzugefügte Verträge, Handbücher, Notizen, Fachartikel und Ordner lassen sich von Agenten nach Wörtern oder Bedeutung durchsuchen. Antworten zitieren Datei und Seite. **Wissensdatenbanken** sind benannte Sammlungen hochgeladener Dateien und lokaler Ordner.

- **Gemeinsames Wissen** unter [Projekte → Gemeinsames Wissen](/knowledge) ist für alle Sitzungen verfügbar, auch in Projekten, sofern dort nicht ausgeschaltet.
- **Das eigene Wissen eines Projekts**, in seinem Tab **Memory** unter **Dokumente**: Nur die Sitzungen dieses Projekts durchsuchen es, und die Sitzungen einer Gruppe, die das Projekt einbindet.

Um das gemeinsame Wissen zu öffnen, klicke auf der Projektseite auf den Tab **Gemeinsames Wissen** oder tippe „gemeinsames Wissen“ ins Suchfeld (Strg+K).

## Dokumente hinzufügen

Ohne vorhandenes Wissen zeigt die Seite „Dokumente einmal hinzufügen“ über einem großen Ablagefeld. Ziehe Dateien oder einen Ordner hinein, um die Wissensdatenbank „Meine Dokumente“ anzulegen. **Stattdessen mit einem Ordner auf diesem Computer beginnen** erstellt eine leere Datenbank dieses Namens, der du anschließend einen Ordner zuordnest.

Jede Wissensdatenbank hat ein eigenes Ablagefeld und **Ordner auf diesem Computer hinzufügen**. **Neue Wissensdatenbank** oben, auf dem Smartphone **Neu**, legt weitere getrennte Bestände an. Agenten können gezielt nach Namen suchen; zum Einstieg genügt eine.

### Dateien ablegen oder auswählen

Ziehe Dokumente oder Ordner auf das Feld „Dokumente oder Ordner hier ablegen“, oder nutze **Dateien auswählen** beziehungsweise **Ordner**. Dateien werden in den App-Datenordner kopiert und sofort eingelesen. Spätere Änderungen der Originale werden deshalb nicht übernommen. Ein kleiner Bereich zeigt den Upload. Bei gleichen Dateinamen fragt er nach **Ersetzen**, **Vorhandene Dateien überspringen** oder **Abbrechen**.

Uploads kommen vom gerade verwendeten Gerät. Auf dem Smartphone öffnet **Dateien auswählen** dessen Dateiauswahl; ganze Ordner lassen sich nur am Computer auswählen.

### Einen Ordner auf diesem Computer hinzufügen

1. Wähle bei der Wissensdatenbank **Ordner auf diesem Computer hinzufügen**.
2. Tippe im Menü, das sich öffnet („Einen Ordner einlesen und aktuell halten“), den Namen eines Ordners ein, um ihn unter den zuletzt verwendeten Ordnern und denen in deinem Benutzerordner zu finden, oder gib seinen Pfad ein, etwa `~/Documents/Manuals`. Wähle ihn aus.

Der Ordner bleibt an seinem Ort, ohne Kopie. Seine Schaltfläche steht an der Datenbank. Eine Minute nach App-Start und danach stündlich werden neue und geänderte Dateien eingelesen und entfernte aus dem Bestand genommen. Nach einem Start werden auch zuvor nicht lesbare Dokumente erneut versucht, die eine neuere Version vielleicht unterstützt. **Jetzt noch einmal lesen** im Menü startet sofort.

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

- **Bedeutungssuche wird auf diesem Computer eingerichtet**, mit aktuellem Schritt wie PyTorch-Installation, einmalig beim ersten Mal;
- **Bedeutungssuche wird gestartet** beim Laden und erstmaligen Herunterladen des Modells;
- **Bedeutungssuche wartet auf freien Arbeitsspeicher** mit verfügbarem und benötigtem Speicher. Alle paar Minuten wird erneut versucht; das Schließen anderer Programme kann helfen;
- **Semantische Suche angehalten** mit Grund. Nach Korrektur, etwa Python-Installation, nutze **Erneut versuchen** oder [Einstellungen → Memory](/settings?s=memory&find=Search%20by%20meaning).

- **Dokumente anzeigen** listet Name oder Pfad, Passagenzahl und Größe. Ein Pin-Symbol kennzeichnet ein Dokument, das du für das Wiki-Memory angeheftet hast. Solange Wiki-Memory an ist, bietet das Menü **Mehr** seiner Zeile **Ins Wiki-Memory einlesen** (anheften) oder **Nicht ins Wiki-Memory einlesen** an (siehe [Wenn ein Projekt zu viele Dokumente hat](/guide/wiki-memory#when-a-project-has-too-many-documents)). **Kein Text** kennzeichnet leere Textbestände, **konnte nicht gelesen werden** einen Fehler mit Erklärung beim Darüberfahren. Ein Klick öffnet das Dokument, **Dokumente ausblenden** schließt die Liste.
- Konnten einige Dokumente nicht gelesen werden, sagt eine rote Zeile, wie viele, mit den ersten paar und dem Grund für jedes.
- Hochgeladene Dateien entfernst du über × am Zeilenende, am Computer beim Darüberfahren sichtbar. Gelöscht wird die Datenbankkopie. Dateien eingebundener Ordner haben kein ×; entferne sie im Originalordner oder beende dessen Einbindung.

## Wissensdatenbanken umbenennen, verschieben, neu einlesen oder löschen

Die Schaltfläche ⋯ (**Mehr**) oben rechts an einer Wissensdatenbank öffnet ihr Menü:

- **Jetzt noch einmal lesen**: liest ihre Dateien und Ordner sofort noch einmal, für gerade hinzugefügte Dateien oder einen geänderten Ordner, und versucht es noch einmal mit den Dokumenten, die nicht gelesen werden konnten.
- **Umbenennen**: öffnet **Wissensdatenbank umbenennen**. Gib den neuen Namen ein (bis zu 60 Zeichen) und klicke auf **Speichern**.
- **Verschieben nach** in **Gemeinsames Wissen** oder eines deiner Projekte. Ein Haken markiert den aktuellen Ort. Projektwissen ist nur dort durchsuchbar, gemeinsames Wissen überall. Die Auswahl erscheint ab dem ersten Projekt;
- **Löschen**: fragt „*Name* löschen?“ Ihre Passagen werden entfernt, und die Dateien, die in sie hineingezogen wurden, mit ihnen; Ordner auf diesem Computer bleiben, wie sie sind. Klicke auf **Löschen**, um fortzufahren.

## Eigene Projektdokumente

Öffne im Projekt den Tab **Memory** und wähle **Dokumente**.

- **Auch das geteilte Wissen durchsuchen** ist ein Schalter, der eingeschaltet ist, solange du ihn nicht ausschaltest. Schaltest du ihn aus, durchsuchen die Sitzungen des Projekts nur die eigenen Dokumente des Projekts (und in einer Gruppe die ihrer Projekte). Die Zeile darunter sagt, wie viele gemeinsame Dokumente es gibt, mit einem Link **Gemeinsames Wissen**.
- Ohne Dokumente legst du Dateien oder Ordner ab oder wählst sie aus. Es entsteht eine nach dem Projekt benannte Datenbank. **Stattdessen mit einem Ordner auf diesem Computer beginnen** erstellt zunächst eine leere für die Ordnerzuordnung.
- Mit Dokumenten erscheinen Suchfeld, siehe [Selbst suchen](#try-a-search-yourself), die Projekt-Wissensdatenbanken mit denselben Karten und Menüs wie gemeinsame Bestände sowie unten **Neue Wissensdatenbank**.

Über **Verschieben nach** lassen sich gemeinsame Wissensdatenbanken in Projekte und wieder zurück verschieben.

## Wie Agenten deine Dokumente durchsuchen

Sobald es mindestens eine Wissensdatenbank gibt, bekommen Agenten Tools, um die Dokumente zu durchsuchen, die ihre Sitzung durchsuchen darf, um mehr von einem Dokument rund um eine Passage zu lesen und um aufzulisten, was die Wissensdatenbanken enthalten. Claude Code, Codex, Custom und die Agenten, die ACP sprechen und MCP-Server (Tool-Server) annehmen, bekommen sie alle.

Zu Beginn einer Sitzung erfährt der Agent, welche Wissensdatenbanken er durchsuchen kann und wie viele Dokumente jede enthält; in einem Projekt auch, ob jede die eigene des Projekts ist, eine gemeinsame oder aus einem Projekt, das seine Gruppe einbindet. Ihm wird gesagt, dass er zuerst dort suchen soll, vor dem Web oder Memory, wenn sich eine Frage daraus beantworten lässt; dass er aus dem antworten soll, was die Passagen sagen; dass er jede Passage, die er verwendet, mit ihrer Datei und Seite oder ihrem Abschnitt und ihrem Pfad zitieren soll; und dass er es sagen soll, wenn die Dokumente die Frage nicht beantworten.

In der Unterhaltung erscheint eine Suche als Schritt: **Deine Dokumente durchsucht**, wonach gesucht wurde und wie viele Passagen gefunden wurden, oder „nichts gefunden“. Klicke ihn an, um die Passagen zu sehen, jede mit ihrer Datei, Seite und Wissensdatenbank. Klicke eine Passage an, um die Datei zu öffnen.

### Nach Wörtern, Bedeutung oder exaktem Text suchen

Drei Sucharten stehen bereit:

- **Nach Wörtern** für Passagen mit den Suchwörtern, beste Treffer zuerst, immer verfügbar.
- **Nach Bedeutung** für sinngleiche Inhalte, auch anders formuliert oder anderssprachig. Dafür muss **Bedeutungssuche** unter [Einstellungen → Memory](/settings?s=memory&find=Search%20by%20meaning) aktiv sein, standardmäßig eingeschaltet. Das Modell läuft lokal und bereitet alle Datenbanken im Hintergrund vor. Siehe [Memory](/guide/memory#search-by-meaning). Ohne Aktivierung nennen Wissen-Tabs die passende Einstellung; Agenten verwenden Wortsuche.
- **Exakter Text** für Ausdrücke in Anführungszeichen wie „Kündigungsfrist“ oder reguläre Ausdrücke zwischen Schrägstrichen wie `/INV-\d+/`. Wie grep eignet sich das für Namen, Nummern und Codes; Ergebnisse folgen der Dokumentreihenfolge.

Ohne ausdrückliche Einschränkung kombiniert der Agent Wort- und Bedeutungssuche. Anführungszeichen oder Schrägstriche lösen exakte Suche aus. Standardmäßig erhält er acht Passagen, auf Wunsch bis zu 25, und kann einzelne Datenbanken nach Namen auswählen.

### Selbst suchen

Über den Wissensdatenbanken steht ein Feld mit „Probiere die Suche wie ein Agent aus: mit einer Frage oder ‚genauen Wörtern‘ in Anführungszeichen“. Tippe etwas ein und drücke die Eingabetaste. Bis zu 10 Passagen kommen zurück, jede mit ihrer Datei und Seite, ihrer Wissensdatenbank und der Art, wie sie gefunden wurde: **Wörter**, **Bedeutung** oder beides, oder **Exakt** für genauen Text. Klicke eine an, um die Datei zu öffnen.

Im Tab „Gemeinsames Wissen“ durchsucht sie, was eine Sitzung außerhalb jedes Projekts durchsucht. Im Teil „Dokumente“ eines Projekts (sein Tab **Memory**) durchsucht sie, was eine Sitzung in diesem Projekt durchsucht.

## Welche Sitzungen welches Wissen durchsuchen

| Sitzung | Durchsuchbare Inhalte |
|---|---|
| Ohne Projekt | Gemeinsames Wissen |
| in einem Projekt | die eigenen Dokumente des Projekts und das gemeinsame Wissen, es sei denn, das Projekt schaltet es aus |
| in einer Gruppe | die eigenen Dokumente der Gruppe, die Dokumente jedes Projekts, das sie zusammenbringt, und das gemeinsame Wissen, es sei denn, die Gruppe schaltet es aus |
| Von einer anderen Sitzung gestartet, also Hydor-Subagent | Derselbe Bestand wie bei der übergeordneten Sitzung |

Wissenstools liefern nie unzugängliche Projektdokumente, auch nicht bei direkter Pfadanfrage. Nach Löschen eines Projekts wird dessen Wissensdatenbank gemeinsam verfügbar.

## Einen Agenten fragen

- „Erstelle das Projekt Steuern 2026 für Belege und Steuererklärung. Starte Sitzungen als Forscher; alle Agenten sollen wissen, dass Beträge in EUR angegeben werden.“
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
- „Mach mein Projekt Steuern 2026 privat: Andere Projekte sollen es nicht durchsuchen können.“
- „Verschiebe die Wissensdatenbank Verträge nach Steuern 2026 und schalte dort die Suche im gemeinsamen Wissen aus.“
- „Welche Wissensdatenbanken habe ich, und welche Dokumente waren nicht lesbar?“
- „Teile mein Projekt Thesis einen Monat lang mit Maria, damit sie kommentieren kann, und mit Nikos, damit er die Dokumente bearbeiten kann.“
- „Mit wem ist Abschlussarbeit geteilt, und was haben diese Personen zuletzt getan?“
- „Beantworte Marias Kommentare zu Kapitel 3 und erledige die bearbeiteten.“
- „Beende Nikos' Freigabe für Abschlussarbeit.“
