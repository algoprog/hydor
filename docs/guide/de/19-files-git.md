# Dateien, Git, Terminal und Vorschau

Über **Dateien**, **Git** und **System** in der Werkzeugleiste gelangst du an diesen Computer: Dateien finden, öffnen, bearbeiten und ihre Inhalte durchsuchen, zu Projekten oder neuen Sitzungen hinzufügen, Jupyter-Notebooks ausführen, Git-Commits erstellen und pushen, Pull-Requests öffnen und Branchänderungen prüfen. Dazu kommen Terminals, Vorschauen laufender Web-Apps, Vorher-nachher-Aufnahmen von Agentenänderungen und die Systemüberwachung. So kannst du Agentenarbeit innerhalb der App prüfen und abschließen.

![Die Git-Seite: Repositoryänderungen, Dateivergleich, Commitfeld und Synchronisierung](images/files-git.webp)

## System öffnen

Wähle **System** in der Werkzeugleiste oder öffne [System](/system). Tabs unter dem Titel führen zu den Bereichen mit eigener Adresse:

- **Übersicht** ([öffnen](/system)): Computer und aktueller Inhalt seiner Werkzeuge; siehe [Übersicht](#the-overview).
- **Terminal** ([öffnen](/terminal)): lokale Shells; siehe [Terminal verwenden](#use-the-terminal).
- **Vorschau** ([öffnen](/preview)): laufende Web-Apps; siehe [Entwicklungsserver in der Vorschau](#look-at-a-dev-server-with-preview). Dieser Bereich erscheint nur für den aktuellen Computer, nicht beim Zugriff auf einen anderen.
- **Überwachen** ([öffnen](/system/monitor)): wie ausgelastet der Computer ist (siehe [Computer überwachen](#watch-this-computer-in-monitor)).

Auf Smartphones zeigt der Titel den Bereich, etwa **System / Überwachen**. Tippe darauf, um alle Bereiche in Viererreihen auszuwählen. Bereichsaktionen (etwa Aktualisieren in der Vorschau) stehen rechts neben dem Titel.

**Dateien** und **Git** gehören nicht zu System: Jedes hat ein eigenes Symbol in der Werkzeugleiste (auf dem Smartphone bei den Werkzeugen im Menü der Seitenleiste). Klicke darauf oder gehe zu [Dateien](/files) (siehe [Dateiseite öffnen](#open-the-files-page)) oder [Git](/git) (siehe [Repositorys auf der Git-Seite](#see-your-repositories-on-the-git-page)). Auch Experimente hat ein eigenes Symbol (siehe [Experimente](/guide/experiments)).

## Übersicht

**Übersicht** zeigt oben den Namen des Computers, sein System und wie lange er schon läuft, mit vier Anzeigen: **Prozessor**, **Memory**, **Datenträger** (der Hauptdatenträger, mit seinem freien Platz) und **Grafik** (wenn er NVIDIA-Grafikkarten hat). Eine Anzeige wird rot, wenn sie fast voll ist. Klicke darauf, um **Überwachen** zu öffnen.

Darunter öffnet jede Werkzeugkarte über Titel oder **Öffnen** den jeweiligen Tab:

- **Terminal**: laufende Shells und **Neu**.
- **Vorschau**: die hier laufenden Web-Apps, jede mit ihrem Port. Klicke auf eine, um sie anzusehen.

## Dateiseite öffnen

Klicke in der Werkzeugleiste auf **Dateien** oder gehe zu [Dateien](/files). Auf einem Computer hat die Seite zwei Bereiche:

- Links die **Orte**: die Dateien, die du zuletzt geöffnet hast, dein Benutzerordner, angeheftete Ordner, die Ordner deiner Projekte, die Ordner, in denen Sitzungen gearbeitet haben, und der Papierkorb (siehe [Orte](/guide/files-git#places)).
- Rechts den aktuellen Ordner und seinen Inhalt; siehe [Ordner durchsuchen](/guide/files-git#browse-a-folder). Geöffnete Dateien erscheinen als Tabs; der erste führt zum Ordner zurück.

In einem kleinen Fenster werden die Orte zu einer Schaltfläche rechts neben dem Titel: Sie nennt den Ordner, in dem du bist, und ein Klick darauf listet die Orte auf.

Auf Smartphones füllt der Ordner den Bildschirm. Sein Name rechts oben öffnet die Orte vom unteren Rand. **‹** mit dem übergeordneten Ordnernamen unter dem Titel wechselt eine Ebene hoch; die Zurück-Funktion des Smartphones zum vorherigen Ordner. Dateien öffnen eine eigene Seite mit **Zurück**.

Weitere Zugänge:

- Klicke auf den Ordner unter dem Titel einer Sitzung oder nutze das Menü der Sitzung (⋯) → **Ordner und Code** → **Ordner durchsuchen**: Dateien öffnet sich in diesem Ordner.
- Eine Datei, die ein Agent geändert oder dir übergeben hat, oder ein Link auf eine Datei in seiner Antwort öffnet sich in einem Fenster über der Unterhaltung, sodass du deinen Platz behältst. **In Dateien öffnen** verschiebt sie auf die Seite „Dateien“; **Vollbild** (das Pfeil-Symbol) macht das Fenster so groß wie die ganze App, und **Vollbild beenden** bringt es zurück (die nächste Datei öffnet sich so, wie du die letzte verlassen hast, in diesem Browser); ✕ oder Esc schließt sie (wenn du sie geändert hast, ohne zu speichern, fragt sie vorher „Deine Änderungen verwerfen?“). Der Pfad der Datei steht darüber wie auf der Seite „Dateien“; ein Ordner darin öffnet sich im selben Fenster, mit der Datei darin ausgewählt (vorher fragt es nach nicht gespeicherten Änderungen), und **‹** oben im Fenster führt zurück zur Datei. Siehe [Erstellte oder geänderte Dokumente](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply).
- Der Projekttab **Dateien** zeigt seine eigenen Ordner; siehe [Projekte und Wissen](/guide/projects).

## Orte

- **Zu einem Ordner wechseln**: nach Namen suchen oder Pfad wie `~/code/shop` eingeben. Projekte und angeheftete Ordner stehen zuerst. Tab oder der Pfeil am Zeilenende zeigt Unterordner.
- **Zuletzt geöffnete Dateien**: in diesem Browser geöffnete Dateien, neueste zuerst, mit Ordner. Nicht mehr vorhandene sind gekennzeichnet; **Nicht mehr vorhandene Einträge entfernen** bereinigt die Liste.
- **Persönlicher Ordner**: dein persönlicher Dateiordner. Ein abweichender Standardordner neuer Sitzungen erscheint darunter.
- **Angepinnt**: auf allen Geräten gleiche Ordner. Zum Anheften nutze Ordnerkontextmenü oder **⋯ → An „Orte“ anheften**. Zum Lösen zeige darauf und wähle ✕ oder **Nicht mehr unter „Orte“ anheften**.
- **Projekte**: eigene Ordner der Projekte.
- **Bisherige Arbeitsordner der Sitzungen**: zuletzt von Sitzungen verwendete Ordner.
- **Papierkorb**: gelöschte Inhalte; siehe [Löschen und wiederherstellen](/guide/files-git#delete-and-put-back).

Auf dem Computer kannst du Dateien oder Zeilen auf einen Ordner in den Orten ziehen.

## Ordner durchsuchen

Die Leiste über dem Ordner enthält von links:

- **Übergeordneter Ordner** als Pfeil nach oben.
- Pfadschritte: Haus für den Benutzerordner, dann etwa **code › shop**. Außerhalb beginnt der Pfad bei **Computer** (`/`). Klicke auf einen Schritt oder ziehe Zeilen darauf zum Verschieben. Lange Pfade klappen mittlere Schritte unter **…** zusammen. Letzter Schritt oder Pfeil daneben öffnet **Zu einem Ordner wechseln**.
- **In *dem Ordner* suchen**: grenzt die Liste beim Tippen auf die Namen ein, die enthalten, was du eingibst. Enter oder die Zeile **Alles in … nach „…“ durchsuchen, auch Dateiinhalte** oben in der Liste durchsucht jeden Ordner darunter, Dateinamen und den Inhalt der Dateien (siehe [Dateien suchen](/guide/files-git#search-files)).
- **Hochladen**: lädt Dateien in den Ordner hoch, in dem du bist (siehe [Dateien und Ordner hochladen](#upload-files-and-folders)). Sein Pfeil (**Weitere Möglichkeiten zum Hochladen**) bietet **Dateien hochladen** und **Ordner hochladen**.
- **Neu** mit **Neuer Ordner**, **Neue Datei**, **Neues Notebook**, **Dateien hochladen** und **Ordner hochladen**. Im Tab **Dateien** eines Projekts erstellt es außerdem, was die App erstellt, im Projekt (siehe [Dateien](/guide/projects#files)).
- **Als Liste** oder **Als Kacheln mit Bildern**: der Schalter zwischen den beiden Arten, einen Ordner zu zeigen. Ordner erscheinen zunächst als Kacheln, bis du selbst die Liste wählst; der Browser merkt sich deine Wahl.
- **Mehr** (⋯): **Sortieren nach** (**Name**, **Änderungsdatum**, **Größe** oder **Typ**, und **Reihenfolge umkehren**), **Versteckte Dateien anzeigen**, **An „Orte“ anheften**, **Neue Sitzung in diesem Ordner**, **Hier ein Terminal öffnen**, **Pfad kopieren**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App; siehe [Mit Dateien und Ordnern arbeiten](/guide/files-git#work-with-files-and-folders)), **Als .zip herunterladen** und **Aktualisieren**.

**Kacheln** sind die Darstellung, in der Ordner zunächst erscheinen. Jede Kachel hat oben ein Bild der Datei (4:3), bei Dokumenten und Ähnlichem ein kleines Kennzeichen mit ihrer Art (PDF, Word, Blatt, CSV, Folien, Notebook, LaTeX, HTML, Markdown, JSON, E-Book, Archiv, SVG, GIF, Video, Audio), ihren Namen und wann sie geändert wurde („Geändert vor 2 Std.“) sowie ein ⋯, das erscheint, wenn du darauf zeigst. Ein Ordner ist eine Ordnerkachel. Das Bild ist:

- bei Bildern das Bild selbst, bei Videos ein Einzelbild;
- bei PDFs die erste Seite, bei Word-, PowerPoint-, Excel- und OpenDocument-Dateien ihre erste Seite, Folie oder ihre ersten Zellen (oder das Bild, das die Datei mitbringt);
- bei HTML-Dateien und Jupyter-Notebooks so, wie sie geöffnet aussehen;
- bei Text-, Markdown-, Code-, CSV- und JSON-Dateien ihre ersten Zeilen auf einer Kachel wie Papier;
- bei allem anderen das Symbol seiner Art.

Die App zeichnet diese Bilder auf diesem Computer mit dem, was sie hat: ffmpeg für Videos und Bilder, poppler für PDFs, ihren eigenen Browser für Dokumente und Seiten und auf dem Mac Quick Look. Eine Datei, die sie nicht zeichnen kann (eine unbekannte Art, kein Werkzeug dafür hier, eine zu große Datei oder eine, bei der es fehlgeschlagen ist), zeigt das Symbol ihrer Art oder ihre ersten Zeilen. Die Bilder werden 30 Tage lang im Datenordner der App aufbewahrt, sodass ein Ordner, in den du zurückkehrst, sie sofort zeigt; eine geänderte Datei bekommt ein neues.

**Die Liste** zeigt Ordner zuerst. In ihr zeigen Bilder ein kleines Vorschaubild statt ihres Symbols. Zu jedem Eintrag zeigt sie seinen Namen, wann er sich geändert hat („gerade eben“, „vor 5 Min.“, die Uhrzeit für heute, „Gestern“ oder das Datum) und seine Größe. Klicke auf den Titel einer Spalte, um danach zu sortieren, und noch einmal für die umgekehrte Reihenfolge. In einem schmalen Fenster verbirgt die Leiste das Feld hinter einer Suchschaltfläche, **Als Liste** und **Als Kacheln mit Bildern** wandern unter **Mehr**, und die Spalten für Datum und Größe weichen den Namen.

- Klicke einen Ordner zum Wechseln oder seinen Pfeil zum Aufklappen im Baum. Geöffnete Unterordner bleiben je Ordner gemerkt.
- Klicke Dateien zum Öffnen.
- Die Zeile unten zählt die Ordner und Dateien und addiert ihre Größe.
- Während der Anzeige wird alle fünf Sekunden aktualisiert, sodass neue Agentendateien automatisch erscheinen.

Auf einem Smartphone zeigt jede Zeile Größe und Datum unter dem Namen; die Suchschaltfläche öffnet das Feld, unter **Mehr** stehen auch **Als Liste**, **Als Kacheln mit Bildern** und **Mehrere auswählen**, und die Schaltfläche **+** unten rechts fügt einen Ordner oder eine Datei hinzu oder lädt hoch.

Jeder Ordner hat eine eigene Adresse für die Zurück-Funktion des Browsers. Der sichtbare Ordner gilt appweit als „in Dateien geöffneter Ordner“. Er wird je Browser und getrennt für jeden verwendeten Computer gespeichert; siehe [Weitere Computer](/guide/devices#use-other-machines-from-one-app).

### Buchstaben neben Dateien

In einem Git-Repository (einem Ordner, dessen Verlauf Git führt) tragen Dateien mit Änderungen seit dem letzten Commit einen Buchstaben und eine Farbe:

- **M**: geändert.
- **A**: neu und bereits zu Git hinzugefügt.
- **U**: neu, noch nicht von Git erfasst.
- **D**: gelöscht.
- **R**: umbenannt.
- **C**: zu lösender Konflikt.
- **•** am Ordner: darin gibt es Änderungen.

## Mit Dateien und Ordnern arbeiten

Jede Zeile hat ein Menü. Fahre auf die Zeile und klicke an ihrem Ende auf **Mehr** (⋯) oder klicke mit der rechten Maustaste darauf; auf einem Smartphone tippe auf ihr ⋯. Darin stehen:

- **Öffnen**.
- **Bild bearbeiten** beziehungsweise **Video bearbeiten**. **Speichern** im Editor überschreibt die Datei und verschiebt die alte Version in den Papierkorb; **Kopie speichern** erstellt daneben „name (edited)“; siehe [Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos).
- **Sitzung damit starten** für Dateien; siehe [Sitzung mit Dateien starten](/guide/files-git#start-a-session-with-files). Für Ordner: **Neue Sitzung in diesem Ordner** mit vorausgewähltem Arbeitsordner.
- **Zu einem Projekt hinzufügen**; siehe [Dateien zu einem Projekt hinzufügen](/guide/files-git#add-files-to-a-project).
- **An „Orte“ anheften** oder **Nicht mehr unter „Orte“ anheften** für Ordner.
- **Umbenennen** mit F2, **Duplizieren**, **Verschieben nach** und **Kopieren nach**.
- **Hier ein Terminal öffnen** (ein Ordner): eine neue Shell in diesem Ordner, auf einem Computer im unteren Bereich, auf einem Smartphone auf der Seite „Terminal“.
- **Pfad kopieren** als vollständiger Pfad.
- **Im Finder anzeigen** (Mac), **Im Datei-Explorer anzeigen** (Windows) oder **Im Ordner anzeigen** (Linux): In der Desktop-App zeigt es eine Datei oder einen Ordner auf diesem Computer ausgewählt im Dateimanager des Systems. Der Name sagt, welcher es auf deinem System ist. In der Web-App gibt es das nicht, und auch nicht für Dateien eines anderen Computers.
- **Herunterladen**, bei Ordnern **Als .zip herunterladen**.
- **Löschen** mit der Entf-Taste.

### Mehrere auswählen

Für gemeinsame Aktionen wählst du mehrere Einträge:

- Am Computer über das Kästchen am Zeilenanfang beim Darüberzeigen, Strg+Klick beziehungsweise ⌘+Klick zum Ergänzen, Umschalt+Klick für einen Bereich ab der letzten Auswahl oder Strg+A für alle.
- Auf einem Smartphone halte eine Zeile gedrückt und tippe dann auf die anderen; oder **Mehr** → **Mehrere auswählen**.

Die Leiste zeigt Anzahl, **Sitzung starten**, **Zu einem Projekt hinzufügen**, **Verschieben nach**, **Löschen** und unter **Mehr** (⋯) zusätzliche Aktionen wie **Kopieren nach**, **Pfade kopieren** und **Als .zip herunterladen**. ✕ oder Esc hebt alles auf.

### Tastatur verwenden

Aktiviere am Computer zuerst die Liste durch einen Klick:

| Tasten | Wirkung |
| --- | --- |
| ↑ ↓ | Zeile darüber oder darunter; Umschalt erweitert die Auswahl |
| → ← | Ordner im Baum öffnen oder schließen; bei Kacheln zur benachbarten Kachel |
| Enter | Öffnen |
| Leertaste | Auswählen oder abwählen |
| Rücktaste | Übergeordneter Ordner |
| Entf | Löschen |
| F2 | Umbenennen |
| Strg+A | Alle auswählen |
| Esc | Auswahl aufheben, danach Suchfeld leeren |

Ein eingegebener Buchstabe startet **Suchen in**.

### Datei oder Ordner erstellen

1. Klicke auf **Neu** → **Neuer Ordner**, **Neue Datei** oder **Neues Notebook** (auf einem Smartphone auf die Schaltfläche **+**).
2. Gib im neuen Listenfeld den Namen ein und bestätige mit Enter. Esc bricht ab.

Neue leere Dateien öffnen sofort im Editor. Ein Notebook heißt zunächst `Untitled.ipynb`, bei belegtem Namen `Untitled 2.ipynb`, hat eine leere Codezelle und öffnet als Notebook. Auch neue Dateien mit Endung `.ipynb` werden als leere Notebooks angelegt. Bei belegtem Namen wird nichts erstellt und ein Hinweis angezeigt.

### Umbenennen oder verschieben

- **Umbenennen** macht den Namen zum Eingabefeld. Enter übernimmt, Esc verwirft.
- **Verschieben nach** listet zuerst deine Projekte und angehefteten Ordner auf, dann die zuletzt verwendeten Ordner, mit einem Feld, um einen beliebigen Ordner nach Namen zu finden oder seinen Pfad einzugeben. Wähle einen aus, und die Datei oder der Ordner wird dorthin verschoben. Eine Meldung sagt, wohin sie gekommen ist, mit **Rückgängig machen**.
- Ziehe auf einem Computer Zeilen auf einen Ordner (in der Liste, auf einen Schritt des Pfads oder unter die Orte), um sie dorthin zu verschieben; zusammen ausgewählte Dateien werden zusammen verschoben. Halte beim Ablegen Alt (auf einem Mac Option) gedrückt, um stattdessen zu kopieren.

Ein Ordner kann nicht in sich selbst verschoben werden. Vorhandenes wird nicht ersetzt; bei gleichem Namen stoppt der Vorgang.

### Duplizieren und kopieren

- **Duplizieren** erstellt eine Kopie daneben mit „copy“, etwa `report copy.pdf`, danach `report copy 2.pdf`.
- **Kopieren nach** kopiert in einen Zielordner wie bei **Verschieben nach**. Namenskonflikte werden ebenso durch „copy“ gelöst. **Anzeigen** in der Meldung öffnet den Zielordner.

### Löschen und wiederherstellen

**Löschen** verschiebt eine Datei oder einen Ordner samt Inhalt sofort in den Papierkorb. Die Meldung bietet **Rückgängig machen**. Erst beim Leeren wird endgültig gelöscht.

Der **Papierkorb** unter den Orten listet auf, was du gelöscht hast, das Neueste zuerst: jeweils mit dem Ort, an dem es war, dem Zeitpunkt des Löschens und seiner Größe.

- **Wiederherstellen** bringt den Inhalt an den Ursprungsort zurück. Ist der Name neu belegt, entsteht eine Kopie mit „copy“. Für alte Einträge ohne erfassten Ursprungsort wird ein Zielordner abgefragt.
- **Mehr** (⋯) bietet **In einen anderen Ordner verschieben** und **Endgültig löschen**.
- **Papierkorb leeren** löscht nach Bestätigung alle Einträge endgültig.

Der Papierkorb liegt im App-Datenordner, etwa `~/.hydor/trash`; die Seite nennt den Pfad. Benutzerordner und Wurzelordner `/` können nicht gelöscht werden. Inhalte auf einem anderen Datenträger als der App-Datenordner lassen sich nicht dorthin verschieben; Hydor fragt zuerst nach endgültigem Löschen.

### Herunterladen

Dateien werden unverändert heruntergeladen. Ordner oder eine Mehrfachauswahl werden während des Downloads als ZIP erstellt. `.git` und `node_modules` bleiben dabei außen vor. Grenzen sind 4 GB und 65.000 Dateien.

## Dateien zu einem Projekt hinzufügen

Projekte speichern eigene Dateien im Projektordner und können weitere vorhandene Ordner einbeziehen; siehe [Projekte und Wissen](/guide/projects). So ergänzt du Inhalte:

1. Öffne das Kontextmenü einer Datei oder eines Ordners oder wähle mehrere und dann **Zu einem Projekt hinzufügen**.
2. Wähle das Projekt oder erstelle mit **Neues Projekt** eines.

Dateien werden oben in den Projektordner kopiert oder in einen Ordner darin, den du wählst. Ordner werden nicht kopiert, sondern an ihrem bisherigen Ort eingebunden. Die Meldung nennt das Ergebnis und **Anzeigen** öffnet den Projekttab **Dateien**. Bereits enthaltene Inhalte bleiben unverändert.

**Zu einem Projekt hinzufügen** steht auch unter **Mehr** (⋯) einer Datei im Editor, in dem Fenster, in dem sich eine Datei über einer Sitzung öffnet, auf den Karten von Dateien, die ein Agent dir übergeben hat, und auf Bildern, die ein Agent erstellt hat.

Sitzungen, die du danach im Projekt startest, finden die Dateien dort: Jeder Sitzung wird gesagt, was der Ordner des Projekts enthält und mit welchen anderen Ordnern es arbeitet.

**Einen Ordner innerhalb des Projekts wählen.** Ein Klick auf ein Projekt legt den Inhalt oben in dessen Ordner ab. Ein Projekt, dessen Ordner Ordner enthält, zeigt außerdem am Ende seiner Zeile eine Ordner-Schaltfläche (**Einen Ordner darin auswählen**). Sie listet diese Ordner auf: Klicke auf einen, um den Inhalt dort abzulegen, oder auf sein › (**Ordner darin anzeigen**), um hineinzugehen. Die erste Zeile, **Oberste Ebene von** *Projekt* (**Dieser Ordner**, sobald du in einem bist), wählt den Ordner, in dem du bist, und die Zeile darüber geht wieder zurück. Dieselbe Auswahl findest du bei **Behalten** (im Menü **Speichern in**), **Kopie behalten**, **In ein Projekt verschieben** und **In ein anderes Projekt verschieben**, im Menü **Speichern** (▾) des Browsers und beim Projekt im Fenster **Neu**. Wählst du einen Ordner in dem Projekt, in dem ein Inhalt schon ist, wandert seine Datei dorthin. Die Meldung nennt dann den Ordner („notes.pdf zu drafts hinzugefügt“, „Verschoben nach drafts“).

## Auch Behaltenes sind Dateien

Was du oder ein Agent in einem Projekt behält (siehe [Eine Seite behalten](/guide/library#keep-a-page)), hat auch eine eigene Datei im Ordner des Projekts, benannt nach seinem Titel. So erscheint es in **Dateien**, im Finder oder Datei-Explorer und bei Agenten, die in diesem Ordner arbeiten. Hydor schreibt die Datei nach jedem Speichern neu, ob deinem oder dem eines Agenten.

- Ein Dokument ist eine Word-Datei (.docx), eine Tabelle eine Excel-Datei (.xlsx), ein Notebook eine .ipynb-Datei und ein Diagramm eine draw.io-Datei (.drawio).
- Folien für das Web, die übliche Art, sind eine Webseite (.html); PowerPoint-kompatibel gemachte Folien sind eine PowerPoint-Datei (.pptx).
- Eine Seite, ein Design oder eine gespeicherte Webseite ist eine .html-Datei.
- Ein LaTeX-Dokument ist eine .tex-Datei oder, wenn es Bilder oder weitere Dateien hat, ein nach ihm benannter Ordner.
- Ein Bild, ein Video oder ein Ton ist eine Datei seiner eigenen Art.

Das gilt auch für das, was Agenten in den Sitzungen eines Projekts speichern. Boards haben keine Datei, da ihre Karten live sind, und nichts, was eine als **Vertraulich** markierte Sitzung behalten hat, kommt in den Ordner. Was du in einem Projekt behalten hast, bevor Hydor das tat, bekommt seine Datei kurz nach dem Start von Hydor. Ein Agent kann den Ordner innerhalb des Projekts nennen, in den eine Datei kommt, und einer, der in einem solchen Ordner arbeitet, speichert dort. Agenten wird gesagt, einen behaltenen Inhalt mit den Werkzeugen zu ändern, die ihn speichern, statt seine Datei zu bearbeiten.

**Öffnen.** In **Dateien** und im Tab **Dateien** eines Projekts trägt die Datei ein Abzeichen, das sagt, was sie ist (**Dokument**, **Folien**, **Bild** …). Ein Klick öffnet sie im Editor von Hydor oder auf der eigenen Seite des Bildes, Videos oder Tons, mit ihren Versionen, Kommentaren und dem Teilen. Ihr ⋯-Menü ist das einer Datei (siehe [Mit Dateien und Ordnern arbeiten](/guide/files-git#work-with-files-and-folders)); was zum Inhalt selbst gehört, etwa ihn zu teilen, zu exportieren oder nach **Kein Projekt** zu verschieben, steht auf der Seite, die sich öffnet. Ein LaTeX-Dokument, das ein Ordner ist, trägt das Abzeichen **LaTeX**: Ein Klick öffnet den Ordner, und die main.tex darin öffnet das Dokument im Editor von Hydor.

**Änderungen außerhalb von Hydor.** Wenn du, ein anderes Programm (etwa Word) oder das Skript eines Agenten die Datei ändert, kommt die Änderung als neue Version zurück, die in den Versionen des Inhalts als **in der Datei geändert** erscheint. Ein Bild, ein Video oder ein Ton behält den vorherigen Stand unter **Frühere Versionen**.

- Hast du ihn inzwischen auch in Hydor geändert, bleiben beide als Versionen erhalten, und die von Hydor bleibt die aktuelle.
- Bevor Hydor eine außerhalb geänderte Datei überschreibt, kommt eine Kopie davon in den Papierkorb.
- Eine Datei, die Hydor nicht zurücklesen kann (die .html von Folien für das Web oder eine beschädigte Datei), oder die Datei einer gesperrten Seite bleibt daneben als „*Name* (changed outside Hydor)“ erhalten, und eine neue Datei wird geschrieben.
- Eine außerhalb von Hydor gelöschte Datei wird bei der nächsten Änderung des Inhalts neu geschrieben. Sie außerhalb von Hydor umzubenennen oder zu verschieben, gilt als Löschen: Die verschobene Datei bleibt eine gewöhnliche Datei.

**Umbenennen, verschieben und löschen.** Die Verknüpfung folgt der Datei:

- Benenne die Datei in den **Dateien** von Hydor um oder verschiebe sie dort, und sie bleibt verknüpft. Ändert sich der Titel des Inhalts, benennt Hydor auch die Datei um, es sei denn, du hast sie selbst umbenannt. Eine neue Endung (etwa .docx zu .txt) macht sie zu einer gewöhnlichen Datei, und der Inhalt bekommt bei seiner nächsten Änderung eine neue.
- Verschiebe die Datei in den Ordner eines anderen Projekts, und der Inhalt wechselt in dieses Projekt. Verschiebe sie aus den Ordnern aller Projekte heraus, und der Inhalt verlässt sein Projekt.
- Lösche die Datei in **Dateien**, und der Inhalt verlässt sein Projekt. Der Inhalt selbst bleibt, und das Suchfeld findet ihn.
- Löschst du den Inhalt in Hydor oder verschiebst ihn nach **Kein Projekt**, kommt seine Datei in den Papierkorb. Verschiebst du ihn in ein anderes Projekt, wandert seine Datei in dessen Ordner.
- Löschst du das Projekt, bleiben die Dateien, wo sie sind, als gewöhnliche Dateien.

**Ein Bild, das du schon hattest.** Behältst du ein Bild, ein Video oder einen Ton aus einer Datei, die schon im Ordner des Projekts liegt, wird diese Datei als seine eigene verwendet, ohne Kopie. Hydor verschiebt sie nie und legt sie nie in den Papierkorb. Was du in Hydor bearbeitest, wird in sie gespeichert, und ihre früheren Versionen bleiben wie bei jedem Bild erhalten.

## Sitzung mit Dateien starten

So beginnt eine neue Sitzung mit ausgewählten Dateien:

1. Öffne das Dateimenü oder eine Mehrfachauswahl und wähle **Sitzung damit starten** beziehungsweise **Sitzung starten** in der Auswahlleiste.
2. Die Startseite zeigt sie im Nachrichtenfeld mit „Auf diesem Computer“. ✕ entfernt einen Eintrag, die Büroklammer ergänzt Gerätedateien. Wähle Agent und Arbeitsordner.
3. Beschreibe den Auftrag und wähle **Starten**.

Es wird nichts hochgeladen: Die Nachricht nennt die Pfade, damit der Agent die Dateien direkt öffnet. PNG, JPEG, GIF und WebP bis 5 MB gehen zusätzlich als Bild an das Modell. Höchstens 20 Dateien pro Nachricht.

Für Ordner wählt **Neue Sitzung in diesem Ordner** den Arbeitsordner der Startseite vor.

**Sitzung damit starten** steht auch unter **Mehr** (⋯) einer Datei im Editor, in dem Fenster, in dem sich eine Datei über einer Sitzung öffnet, auf den Karten von Dateien, die ein Agent dir übergeben hat, und auf Bildern, die ein Agent erstellt hat.

## Dateien und Ordner hochladen

- **Hochladen** in der Leiste lädt in den Ordner hoch, in dem du bist; sein Pfeil (**Weitere Möglichkeiten zum Hochladen**) und **Neu** bieten **Dateien hochladen** und **Ordner hochladen**. Auf einem Smartphone wählt die Schaltfläche **+** → **Dateien hochladen** Dateien oder Fotos vom Smartphone aus.
- Ziehe auf einem Computer Dateien oder ganze Ordner von deinem Desktop auf den Ordner, auf einen Ordner darin oder auf einen Ort („Ziehe Dateien zum Hochladen hierher“). Leere Ordner werden mitgenommen.

Das Feld **Uploads** unten rechts zeigt den Fortschritt je Datei. **Abbrechen** stoppt einen Upload, ✕ entfernt abgeschlossene Einträge. Große Dateien werden in 32-MB-Teilen übertragen.

Bevor etwas gesendet wird, prüft die App, ob es in diesem Ordner Dateien mit denselben Namen gibt. Wenn welche existieren, listet das Feld sie auf („3 sind bereits vorhanden“) mit drei Möglichkeiten:

- **Ersetzen**: vorhandene Dateien überschreiben.
- **Vorhandene Dateien überspringen**: nur neue Dateien hochladen.
- **Abbrechen**: nichts hochladen.

## Datei öffnen und bearbeiten

Klicke im Ordner auf eine Datei. Sie öffnet sich im Editor, in einem eigenen Tab. Der erste Tab führt zurück zum Ordner (oder zur Suche, zu den zuletzt geöffneten Dateien oder zum Papierkorb), aus dem du sie geöffnet hast. Die letzten 12 Dateien, die du geöffnet hast, bleiben als Tabs: Klicke auf einen, um zu ihm zurückzukehren, und schließe ihn mit seinem ✕ oder einem Mittelklick. **Zuletzt geöffnete Dateien** unter den Orten listet die auf, die du zuletzt geöffnet hast.

Über der Datei steht ihr Pfad: ein Haus für deinen Benutzerordner (oder **Computer** für eine Datei außerhalb davon), dann die Ordner, dann der Name der Datei. Jeder Ordner führt auf der Seite „Dateien“ zu diesem Ordner, wobei dort der nächste Schritt des Pfads ausgewählt ist; „…“ listet die Ordner dazwischen auf, wenn der Pfad lang ist (**Die Ordner dazwischen**); der Name der Datei zeigt sie in ihrem Ordner, ausgewählt (**Im Ordner anzeigen**). Auf einem Smartphone öffnet die Ordnerzeile unter dem Namen der Datei **Zu einem Ordner wechseln**: jeden Ordner auf dem Pfad, dann **Im Ordner anzeigen**. Derselbe Pfad steht über den Dateien der Editoren für [Word-, Excel-, CSV- und LaTeX-Dateien](#edit-word-excel-csv-and-latex-files).

Der Editor zeigt Zeilennummern, sprachabhängige Syntaxfarben, Klammerzuordnung und am Computer aufklappbare Codeblöcke und Vervollständigung. Tab rückt ein.

Zum Speichern klicke auf **Speichern** (die Schaltfläche leuchtet auf, sobald du etwas änderst) oder drücke Strg+S (⌘S auf einem Mac). Ein Punkt neben dem Namen der Datei bedeutet, dass es ungespeicherte Änderungen gibt. Die App behält sie, solange sie geöffnet ist: Wechsle zum Tab einer anderen Datei und komme zurück, und die Datei ist so, wie du sie verlassen hast, mit ihrem Rückgängig-Verlauf, Cursor und Platz. Ein Punkt am Tab der Datei zeigt, dass sie nicht gespeicherte Änderungen hat, und wenn du einen solchen Tab schließt (mit seinem ✕ oder per Mittelklick) oder die Datei auf einem Smartphone mit **Zurück** verlässt, fragt die App **Änderungen speichern?**: **Speichern**, **Nicht speichern** oder **Abbrechen**. Wenn du die Seite neu lädst oder schließt, geht Ungespeichertes verloren, und der Browser fragt vorher. Eine Datei, deren Zeilen auf die Windows-Art enden (CRLF), wird genauso gespeichert und nicht in die andere umgewandelt.

### Editorwerkzeuge

Auf einem Computer zeigt die Leiste über der Datei ihren Pfad und diese Schaltflächen:

- **Vorschau** (Markdown-Dateien): die Datei, wie sie sich liest, mit Überschriften, Tabellen, ihren eigenen Bildern (die neben der Datei liegen) und Links auf andere Dateien. Klicke noch einmal darauf, um zu bearbeiten. Markdown-Dateien öffnen sich zuerst als Vorschau.
- **Als Seite anzeigen** für HTML in einem von Hydor isolierten Frame, der benachbarte Dateien laden kann. HTML startet damit. Der Seitenlink gilt eine Stunde; öffne die Datei danach erneut.
- **Änderungen seit dem letzten Commit**: die Unterschiede der Datei zu ihrem letzten Commit, hinzugefügte Zeilen in Grün und entfernte in Rot. Es heißt „Keine Änderungen“, wenn die Datei ihrem letzten Commit entspricht oder nicht in einem Git-Repository liegt. Wenn du zu **Vorschau** oder **Änderungen** wechselst und zurück, bleibt der Text, wie er war, mit seinem Rückgängig-Verlauf, Cursor und Platz.
- **Automatischer Zeilenumbruch**: bricht lange Zeilen um, statt seitlich zu scrollen. Deine Wahl wird gemerkt.
- **Fragen** für Fragen und Änderungsaufträge; siehe [unten](#ask-an-agent-about-the-file).
- **Terminal in diesem Ordner**: eine neue Shell im Ordner der Datei.
- **Herunterladen**.
- **Mehr** (⋯) mit **Suchen**, **Ersetzen**, **Zu Zeile springen**, **Frage zur Auswahl stellen**, **Tastenkombinationen**, **Sitzung damit starten**, **Zu einem Projekt hinzufügen**, **Im Ordner anzeigen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App) und **Pfad kopieren**.
- **Speichern**.

Strg+F beziehungsweise ⌘F öffnet die Suchleiste bei aktivem Textcursor. Ersetzen geht mit Strg+H beziehungsweise ⌘⌥F; Zeilensprung mit Strg+G beziehungsweise ⌘⌥G.

Klicke mit der rechten Maustaste in den Text (oder drücke die Menütaste oder Umschalt+F10 für das Menü am Cursor) für **Ausschneiden**, **Kopieren**, **Einfügen**, **Alles auswählen**, **Finden**, **Ersetzen**, **Zu Zeile springen** und **Frage zur Auswahl stellen**, was [Fragen](#ask-an-agent-about-the-file) öffnet, mit den Zeilen, die du ausgewählt hast, darin zitiert. **Mehr** → **Tastenkombinationen** listet jede Taste auf.

Der Streifen unter dem Text zeigt, wo der Cursor steht (**Zeile 12, Spalte 5**, mit der Anzahl der ausgewählten Zeichen; klicke darauf, um zu einer Zeile zu springen), die Sprache der Datei, ihre Einrückung (**Spaces: 2**, **Spaces: 4**, **Tabs**: aus der Datei gelesen; klicke, um für das, was du als Nächstes tippst, eine andere zu wählen), **LF** oder **CRLF** (wie die Zeilen der Datei enden; klicke, um sie mit dem anderen zu speichern) und **Umbruch** oder **Kein Zeilenumbruch** (klicke zum Umschalten).

Auf einem Smartphone zeigt die Leiste **Zurück**, den Namen der Datei über ihrem Ordner, **Vorschau** oder **Als Seite anzeigen**, **Agenten fragen** (✨), **Speichern** (sobald du etwas änderst) und **Mehr** (⋯), worunter **Finden**, **Zu Zeile springen**, **Frage zur Auswahl stellen**, **Automatischer Zeilenumbruch**, **Änderungen seit dem letzten Commit**, **Terminal in diesem Ordner**, **Herunterladen**, **Sitzung damit starten**, **Zu einem Projekt hinzufügen**, **Im Ordner anzeigen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App) und **Pfad kopieren** stehen. Smartphones brechen lange Zeilen um, solange du **Automatischer Zeilenumbruch** nicht ausschaltest.

### Einen Agenten zur Datei fragen

**Fragen** in der Leiste, mobil ✨, öffnet einen Bereich neben der Datei oder bei schmalem Fenster darüber. Beschreibe die Änderung wie „Finde und behebe Fehler“ oder „Ergänze oben eine Zusammenfassung“ oder stelle eine Frage. Beispiele helfen beim Einstieg; Agent und Modell entsprechen der letzten Startseitenauswahl.

- Ungespeicherte Änderungen werden zuerst gespeichert.
- Der Agent startet im Ordner der Datei, weiß, welche Datei du meinst, und ändert diese Datei selbst. Du siehst jede Änderung im Editor, sobald sie geschrieben ist, die geänderten Zeilen kurz eingefärbt, wobei deine Stelle in der Datei erhalten bleibt.
- Du kannst im Bereich weiter antworten. **Eine neue Anfrage** beginnt neu, **Als Sitzung öffnen** zeigt die vollständige Sitzung, die auch in deiner Sitzungsliste steht. Mobil klappt **Datei ansehen** den Bereich weg; die untere Leiste holt ihn zurück.
- Der Bereich bleibt beim Tabwechsel offen, mit eigener Unterhaltung je Datei. Dies gilt ebenso für Word, Excel, CSV, LaTeX und Notebooks. Bei Notebooks bleiben Ausgaben anderer Zellen erhalten. Bei PDFs liest der Agent und beantwortet auch ausgewählte Textstellen, Gleichungen oder Abbildungen; siehe [Zu einem PDF-Ausschnitt fragen](#ask-about-a-part-of-a-pdf). Gespeichertes Modell und Berechtigungen bleiben wie beim [Fragen in einem Editor](/guide/library#change-it-by-asking-an-agent) unverändert.

### Änderungen an einer geöffneten Datei

Agenten und Terminals ändern Dateien laufend. Der Editor prüft alle paar Sekunden, während eines Agentenlaufs jede Sekunde:

- Ohne eigene ungespeicherte Änderungen übernimmt er den neuen Stand automatisch. Nur geänderte Zeilen werden ersetzt und kurz hervorgehoben, die Leseposition bleibt.
- Bei eigenen ungespeicherten Änderungen erscheint „Die Datei wurde seit dem Öffnen auf dem Datenträger geändert“. Wähle **Neu laden (meine Änderungen verwerfen)** oder **Mit meiner Version überschreiben**.

Ein neuerer Dateistand wird beim Speichern nie ohne diese Abfrage überschrieben.

### Nicht bearbeitbare Dateien

- Über 10 MB erscheint „Datei für diesen Editor zu groß“. Lade sie herunter oder öffne sie im Terminal. Notebooks dürfen bis zu 40 MB haben.
- Binärdateien (alles, was kein Text ist): „Binärdatei“. Lade sie herunter, um sie auf deinem Gerät zu öffnen.
- Word-, Excel-, CSV- und LaTeX-Dateien öffnen sich in eigenen Editoren (der nächste Abschnitt); Bilder, PDFs, Videos, Audio und andere Office-Dokumente erscheinen als Vorschau (der Abschnitt danach).

## Word-, Excel-, CSV- und LaTeX-Dateien bearbeiten

Diese Formate öffnen sich in den eigenen Editoren der App dafür (dem [Dokumenteditor](/guide/library#documents) und seinen Verwandten). Speichern aktualisiert die Originaldatei im eigenen Format:

- **Word-Dokumente** mit .docx im Dokumenteditor auf einer Papierseite, ähnlich Word oder Google Docs.
- **Excel** mit .xlsx sowie **CSV** und **TSV** im Tabelleneditor mit Blättern und Formeln. Bei Excel auch mit Filtern, bedingter Formatierung, Dropdowns, Checkboxen, verbundenen Zellen, Notizen und Diagrammen.
- **LaTeX-Dateien** (.tex) öffnen sich im LaTeX-Editor, der Quelltext neben den gesetzten Seiten. Die Dateien, die das Dokument einliest (Kapitel, die es mit `\input` einbindet, seine Bibliografie), öffnen sich mit, und es wird zusammen mit dem Rest seines Ordners gesetzt (seine Bilder, Stile und Daten), den TeX liest, aber nie verändert. Ein Kapitel öffnet das Dokument, zu dem es gehört (das, das es mit `% !TEX root = …` oder als Subfile nennt, sonst das im eigenen Ordner oder ein oder zwei Ordner darüber, das es einliest), mit geöffnetem Kapitel und den Dateien des Dokuments im [Dateibaum](/guide/library#the-files-tree): die Dateien, die es einliest, in ihren Ordnern und, grau dargestellt, was TeX unverändert aus dem Ordner nimmt (seine Bilder, Stile und Klassen, Daten), zum Ansehen; ändere diese in Dateien. Bei schmalem Bildschirm öffnet **Dateien** über dem Quelltext den Baum. Kommentare funktionieren wie bei [LaTeX-Dokumenten](/guide/library#latex-documents): Eine Datei enthält nur ihren Text, deshalb speichert die App ihre Kommentare daneben, anhand des Dateipfads, mit **Speichern**; sie ziehen mit, wenn du die Datei (oder ihren Ordner) hier umbenennst oder verschiebst, und ein [zur Datei befragter Agent](#ask-an-agent-about-the-file) liest, beantwortet und erledigt sie, seine Antworten erscheinen laufend. **Mit KI lösen**, an einem Kommentar oder oben in **Kommentare**, sendet sie sofort an diesen Agenten ([Kommentare mit KI lösen](/guide/library#resolve-comments-with-ai)). **Versionen vergleichen** gibt es für LaTeX-Dokumente, die die App behält (erstellt mit **Neu** → **LaTeX** oder von einem Agenten), nicht für eine .tex-Datei in einem Ordner.

Bearbeite sie wie im [Dokumenteditor](/guide/library#documents) und klicke dann in der Leiste unten auf **Speichern** oder drücke Strg+S (⌘S auf dem Mac); **Verwerfen** geht zurück zur Datei, wie sie war. Die Leiste oben zeigt den Pfad der Datei sowie **Fragen** ([einen Agenten fragen](#ask-an-agent-about-the-file)), **Herunterladen** und **Mehr** (⋯): **Als Text bearbeiten** (CSV-, TSV- und LaTeX-Dateien) oder **Als Vorschau anzeigen** (Word- und Excel-Dateien) zeigt die Datei wie zuvor, mit einer Schaltfläche in der Leiste, um zum Editor zurückzukehren, und dazu **Sitzung damit starten**, **Zu einem Projekt hinzufügen**, **Im Ordner anzeigen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App) und **Pfad kopieren** der Dateiseite. Eine Datei, die bei einer Zeile aus einer Suche geöffnet wird, öffnet sich als Text.

Erhalt beim Speichern:

- **CSV und TSV**: Unveränderte Zellen und Zeilen behalten ihren Text exakt, ebenso Trennzeichen, Anführungszeichen und Zeilenenden. CSV enthält nur Werte eines Blatts. Bei zusätzlichen Formeln, Blättern oder Formatierung fragt das erste Speichern nach; Formeln werden als Ergebniswerte gespeichert.
- **LaTeX**: Nur geänderte Dateien werden mit eigenen Zeilenenden geschrieben. Neue Editor-Dateien landen im Ordner, gelöschte im [Papierkorb](#delete-and-put-back).
- **Word- und Excel-Dateien** werden aus dem neu geschrieben, was der Editor enthält: Bei einer Word-Datei bleiben Kommentare, Änderungsverfolgung, Gleichungen, Inhaltsverzeichnis, Kopf- und Fußzeile erhalten, bei einer Excel-Datei Filter, bedingte Formatierung, Dropdowns und Checkboxen, verbundene Zellen, Notizen, Kommentare und Diagramme. Enthält eine Datei etwas, das der Editor nicht behält (bei Word Fußnoten, Diagramme oder eine Kopfzeile mit Bild oder Tabelle; bei Excel Bilder, Formen, Pivot-Tabellen, formatierte Tabellen, Hyperlinks, benannte Bereiche, Makros oder gruppierte Zeilen), sagt das eine Leiste oben: „Beim Speichern wird die Datei ersetzt. Folgendes kann dieser Editor nicht erhalten:“, und was genau. Das erste Speichern fragt nach, bevor es die Datei ersetzt, und **Als Kopie speichern** in dieser Leiste schreibt deine Änderungen stattdessen in eine neue Datei daneben („report (edited).docx“). Beim ersten Speichern einer Word- oder Excel-Datei kommt die Datei, wie sie war, in den [Papierkorb](#delete-and-put-back), wo **Wiederherstellen** sie neben die neue zurückholt.
- Zu lange Dateien zeigen nur den Anfang schreibgeschützt; **Als Text bearbeiten** oder **Als Vorschau anzeigen** zeigt alles.

Wenn ein Agent oder ein Terminal die Datei ändert, während sie geöffnet ist, übernimmt der Editor die neue Fassung, wenn du nichts geändert hast, oder fragt wie der Texteditor nach: **Neu laden (meine Änderungen verwerfen)** oder **Mit meiner Version überschreiben**.

PowerPoint-Dateien, ältere Office-Dateien (.doc, .xls, .ppt), OpenDocument-Dateien, RTF und EPUB erscheinen als Vorschau, wie der nächste Abschnitt erklärt.

## Bilder, PDFs, Dokumente und Webseiten ansehen

Der Betrachter zeigt Dateien entsprechend ihrem Inhalt:

- **Bilder** (PNG, JPEG, GIF, WebP, SVG, ICO, BMP, AVIF): vollständig angezeigt, mit Schachbrettmuster dahinter, wo sie durchsichtig sind. **Bearbeiten** oben öffnet ein Bild im Bildeditor ([Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos)).
- **PDFs**: im eigenen PDF-Betrachter deines Browsers, mit **Hervorheben** oben, um sie im eigenen Leser der App zu lesen, zu markieren und Notizen daneben zu behalten (siehe [PDF lesen und markieren](#read-and-highlight-a-pdf)), und **Ausfüllen und unterschreiben**, um sie auszufüllen und zu unterschreiben (siehe [PDF ausfüllen und unterschreiben](#fill-in-and-sign-a-pdf)). Ein PDF, das du markiert hast, öffnet sich im Leser.
- **Video** mit MP4, WebM, MOV und M4V sowie browserabhängig MKV und OGV im eigenen Player; siehe [Video ansehen](#watch-a-video). MP4, MOV, M4V und WebM lassen sich über **Bearbeiten** im Videoeditor öffnen. **Audio** wie MP3, WAV und OGG spielt direkt ab.
- **Office-Dokumente**: PowerPoint (.pptx, .ppt), ältere Word- und Excel-Dateien (.doc, .xls und ähnliche), OpenDocument (.odt, .ods, .odp), RTF und EPUB; dazu Word-Dateien (.docx) und Excel-Dateien (.xlsx) über **Mehr** (⋯) → **Als Vorschau anzeigen** in ihren Editoren. Ein Schalter oben wählt die Ansicht:
  - **Folien** (PowerPoint-Dateien: .pptx sowie Makro-, Bildschirmpräsentations- und Vorlagenvarianten): jede Folie so, wie sie aussieht, gezeichnet wie der Folieneditor Folien zeichnet, mit Bildern, Formen, Tabellen, Diagrammen und Hintergrund an ihrem Platz, ihrer Nummer darüber und ihren Sprechernotizen darunter. Fehlt auf diesem Computer eine Schrift der Präsentation, wird der Text eines Felds, das mehr Platz braucht als vorhanden, etwas verkleinert, damit nichts abgeschnitten wird.
  - **Seiten**: das Dokument, wie LibreOffice es setzt, Seite für Seite („Seitenvorschau wird erstellt…“ beim ersten Mal). Diese Ansicht gibt es nur, wenn LibreOffice auf diesem Computer installiert ist, und nicht für EPUB-Bücher.
  - **Text** als ausgelesenen Inhalt mit Tabellenblättern und Folien.

  Eine PowerPoint-Datei öffnet sich in **Folien**, auch auf dem Smartphone. Andere Dokumente öffnen sich in **Seiten**, wenn LibreOffice installiert ist; Smartphones starten aber mit **Text**, das sich dort besser scrollen und zoomen lässt. Lassen sich die Folien einer Präsentation nicht darstellen, öffnet sie sich in **Text** und nennt den Grund. Wenn ein Dokument nicht gelesen werden kann, steht dort „Keine Vorschau für diese Datei“: Lade es stattdessen herunter.
- **Markdown** und **HTML**: siehe **Vorschau** und **Als Seite anzeigen** oben.

**Herunterladen** steht immer in der Leiste.

### Video ansehen

Ein Video öffnet sich im eigenen Player der App, der den Betrachter ausfüllt:

- **Wiedergabe und Pause**: die runde Schaltfläche in der Mitte, die Schaltfläche unten links, ein Klick auf das Bild oder die Leertaste (K geht auch). Ein Doppelklick auf das Bild füllt den Bildschirm.
- **Durchs Video springen**: Ziehe an der Leiste unten entlang oder klicke auf eine Stelle darauf; wenn du den Zeiger auf der Leiste ruhen lässt, siehst du dort die Zeit, und ihr hellerer Teil ist das, was schon geladen ist. ← und → springen 5 Sekunden, J und L 10 Sekunden, Pos1 und Ende gehen zum Anfang und zum Ende, 0 bis 9 springen zu diesem Zehntel des Videos, und Komma und Punkt gehen im pausierten Zustand ein Einzelbild weiter.
- **Ton** über Lautsprecher oder M stumm- und einschalten. Am Computer öffnet Darüberzeigen den Lautstärkeregler; ↑ und ↓ ändern ebenfalls den Pegel.
- **Geschwindigkeit**: Die Schaltfläche **1×** wählt von 0,5× bis 2× (**Normal** ist 1×).
- **Schleife** spielt das Video jedes Mal von vorn ab, wenn es endet, **Bild im Bild** lässt es in einem kleinen Fenster über allem anderen weiterlaufen (wo dein Browser das kann), **Herunterladen** speichert die Datei, und **Vollbild** (F) füllt den Bildschirm; dieselbe Schaltfläche oder Esc bringt dich zurück.
- Steuerelemente blenden während der Wiedergabe aus und bei Mausbewegung wieder ein. Lautstärke und Tempo bleiben für das nächste Video gespeichert.
- **Auf dem Smartphone**: Tippe auf das Bild, um die Steuerung ein- oder auszublenden, und tippe doppelt auf seine linke oder rechte Seite, um 10 Sekunden zurück- oder vorzuspringen. Auf einem iPhone nutzt der Vollbildmodus den eigenen Videoplayer des Telefons.
- Ein Video, das dein Browser nicht abspielen kann (MKV- und AVI-Dateien nutzen oft Codecs, die Browser nicht kennen), zeigt „Dieses Video kann hier nicht abgespielt werden“, mit **Herunterladen**, um es in einer Video-App anzusehen.

## PDF ausfüllen und unterschreiben

Öffne ein PDF und wähle oben **Ausfüllen und unterschreiben**, mobil den Stift neben dem Namen. Auf den Papierseiten erscheinen Formularfelder hellblau:

- **Felder**: Tippe in ein Textfeld, hake eine Checkbox an, wähle ein Optionsfeld, die Auswahl eines Dropdowns oder die Auswahl einer Liste. Ein Feld, das das Formular sperrt (schreibgeschützt oder durch eine digitale Signatur gesperrt, die schon in der Datei steckt), lässt sich nicht ändern.
- **Ein Klick auf eine Seite** setzt dort, was die Werkzeugleiste gerade hält: **Text** (ein Feld zum Tippen, die übliche Einstellung), **Ankreuzen**, **Kreuz** oder **Datum** (das heutige Datum, das du ändern kannst). Klicke auf eine leere Stelle nach der anderen: Jeder Klick beginnt den nächsten Eintrag. So füllst du ein Formular aus, das nur aus gedruckten Linien und Kästchen besteht, oder ein eingescanntes.
- **Unterschrift** setzt eine gespeicherte oder neu gezeichnete, getippte oder hochgeladene Unterschrift. **Für später speichern** übernimmt neue; siehe [Unterschriften](/guide/library#signatures). Ein Signaturfeld mit **Hier unterschreiben** positioniert sie beim Tippen darin.
- **Verschieben und skalieren**: Häkchen, Kreuz und Unterschrift ziehen, blaue Ecke zum Skalieren. Textfelder haben einen linken Griff; **A−** und **A+** ändern die Schriftgröße. Papierkorb darüber oder Entf entfernt den Eintrag.
- **Zoom** per Zwei-Finger-Geste, am Computer Strg+Mausrad oder Strg+= und Strg+−. **Auf Seitenbreite einpassen** oder Strg+0 setzt zurück.

**Speichern** erstellt „name (filled).pdf“ daneben und öffnet die Kopie. Der Pfeil bietet **Kopie im selben Ordner speichern** und **Datei ersetzen**, wobei die alte Fassung in den [Papierkorb](#delete-and-put-back) wandert. **Schließen** fragt bei Änderungen vor dem Verwerfen.

Die Felder behalten deine Werte als die eigenen Felder eines Formulars, sodass jeder PDF-Betrachter sie zeigt und sie dort weiter geändert werden können, in Schriften, die deine Wörter enthalten (auch Griechisch und Chinesisch). Was du platziert hast, wird auf die Seiten gezeichnet. Die eigenen Bytes der Datei bleiben, wie sie waren, mit den Änderungen dahinter, also:

- Eine **digitale Signatur** bleibt bei reinem Ausfüllen vorhandener Felder gültig. Nachträglich platzierte Texte, Häkchen und Unterschriftsbilder werden in anderen Betrachtern als spätere Änderung sichtbar.
- Bei **geschützten** PDFs ohne Öffnungspasswort werden nur erlaubte Änderungen vorgenommen. Ein PDF mit Öffnungspasswort kann hier nicht ausgefüllt werden.

Grenzen:

- **XFA-Formulare** aus Adobe LiveCycle Designer lassen sich nur in Acrobat oder Reader als echte Felder ausfüllen. Auf ihre Seiten kannst du dennoch schreiben und unterschreiben.
- **Scans** haben keine Felder oder auffindbaren Wörter. Text und Häkchen werden an Klickpositionen gesetzt.
- Eine gezeichnete Unterschrift ist ein Bild, keine kryptografisch belegende digitale Signatur.
- Nichts hier entfernt Wörter endgültig aus einem PDF. Weiße Kästen, die Agenten über Wörter legen können, verbergen sie nur fürs Auge: Die Wörter bleiben in der Datei.

Agenten können PDFs ebenfalls ausfüllen und bearbeiten; siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice#pdfs).

## PDF lesen und markieren

Öffne ein PDF und klicke oben auf **Hervorheben** (auf dem Smartphone auf den Marker neben dem Namen). Seine Seiten erscheinen als Papier, von der App gezeichnet, mit ihren Wörtern darüber, die du wie in jedem Leser auswählen kannst. Ein PDF, das du markiert hast, öffnet sich von selbst so, damit deine Notizen da sind, wenn du wiederkommst; **Schließen** geht zurück zum eigenen Betrachter deines Browsers.

- **Text markieren**: Wähle ihn mit der Maus aus, oder halte auf dem Smartphone ein Wort gedrückt und ziehe an den Anfassern. Es erscheint eine kleine Leiste: Eine ihrer vier Farben (Gelb, Grün, Blau oder Rosa) markiert die Wörter, **Hinweis** markiert sie und öffnet eine Notiz zum Schreiben, **Fragen** fragt einen Agenten dazu ([weiter unten](#ask-about-a-part-of-a-pdf)), und **Kopieren** kopiert sie, wobei ein am Zeilenende getrenntes Wort wieder zusammengesetzt wird. Eine Auswahl reicht, wie du liest, von einer Spalte eines Papers in die nächste.
- **Eine Abbildung oder eine Gleichung markieren**: Klicke auf **Bereich auswählen** und ziehe einen Rahmen darum; am Computer hältst du stattdessen Alt gedrückt und ziehst, ohne die Schaltfläche. Für diesen Teil der Seite erscheint dieselbe Leiste, und er wird als Bild davon gespeichert (**Kopieren** kopiert das Bild oder, wo der Browser kein Kopieren von Bildern erlaubt, seinen Text).
- **Eine Markierung ändern**: Klicke darauf, um ihre Leiste zu öffnen, eine andere Farbe zu wählen, **Notiz bearbeiten**, **Fragen**, **Kopieren** oder sie zu löschen (der Papierkorb oder Entf; **Rückgängig machen** in der Meldung danach holt sie zurück). Wenn du den Zeiger auf einer Markierung ruhen lässt, siehst du ihre Notiz, und ein kleiner Punkt kennzeichnet die, die eine haben. Wenn du dieselben Wörter noch einmal markierst, ändert sich ihre Farbe.
- **Zoom** per Geste, Strg+Mausrad oder Strg+= und Strg+−; **Auf Seitenbreite einpassen** oder Strg+0 setzt zurück. Markierungen bleiben bei jeder Größe an der Textstelle.

Eine Seite, die nur ein Bild ist (ein Scan), hat keine Wörter zum Auswählen: Markiere ihre Teile mit **Bereich auswählen**. Wörter, die an einer Seite nach oben oder unten laufen (eine seitlich gedrehte Seite), lassen sich ebenfalls nicht auswählen. Markierungen, die andere Apps in einem PDF gespeichert haben, erscheinen auf seinen Seiten, aber nicht in **Notizen**.

### Deine Notizen

**Notizen** listet deine Markierungen neben den Seiten auf (auf dem Smartphone als Blatt von unten), Seite für Seite: von jeder ihre Wörter oder das Bild ihres Bereichs, ihre Notiz, die du direkt dort schreibst oder änderst, und ihre Farbe. Klicke auf eine, um auf ihrer Seite zu ihr zu springen; der Papierkorb löscht sie, und ✨ fragt einen Agenten dazu.

Markierungen und Notizen werden getrennt nach Dateipfad gespeichert; das PDF bleibt unverändert. Beim Umbenennen oder Verschieben hier ziehen sie mit. Bei externem Verschieben, etwa durch Terminal oder Agenten, findet Hydor sie beim Öffnen anhand des Inhalts wieder. Ändert sich das PDF, etwa nach neuem LaTeX-Satz, werden Textmarkierungen anhand ihrer Wörter auch auf anderen Seiten gesucht. Nicht mehr auffindbare bleiben an der alten Position mit Hinweis.

Unter **Mehr** (⋯) in Notizen stehen:

- **In einem Projekt speichern**: Deine Markierungen und Notizen kommen als ein Dokument, benannt nach dem Paper („Sparse Retrieval with Learned Term Weights (notes).md“, zum Beispiel), ins [Wissen](/guide/projects#memory) eines Projekts: der Titel des Papers, dann die Wörter jeder Markierung (eine Zeile für einen Bereich) und deine Notiz, Seite für Seite, sodass die Sitzungen des Projekts sie finden, wenn sie seine Dokumente durchsuchen. Das Projekt, in dessen Ordner das PDF liegt, steht zuerst. Das Dokument folgt jeder Änderung, die du an den Notizen machst; **Projektwissen öffnen** zeigt es dort, und **Dort nicht mehr speichern** nimmt es heraus.
- **Im PDF speichern**: echte PDF-Hervorhebungen mit zugehörigen Kommentaren für andere Anwendungen. **Kopie im selben Ordner speichern** erstellt „name (highlighted).pdf“ samt erhaltenen Notizen. **Datei ersetzen** überschreibt mit Sicherung der alten Fassung im [Papierkorb](#delete-and-put-back). Erneutes Speichern ersetzt frühere exportierte Markierungen. Bei untersagten Kommentaren oder entsprechender Zertifizierung bleiben Notizen getrennt gespeichert.
- **Alles kopieren** als Text.

### Zu einem PDF-Ausschnitt fragen

**Fragen** in der Leiste öffnet [Agenten fragen](#ask-an-agent-about-the-file) neben dem PDF (bei schmalem Bildschirm darüber) mit dem, was du ausgewählt hast: den Wörtern oder einem Bild des Bereichs, und seiner Seite. Wähle ein Beispiel („Erkläre diese Textstelle“, „Was besagt diese Gleichung?“, „Wie passt das zu meinem Ansatz?“, „Fasse diesen Abschnitt zusammen“) oder schreibe deine eigene Frage; der Agent kann auch das ganze PDF lesen. Während eine Unterhaltung über die Datei läuft, legt **Fragen** den Teil stattdessen in ihr Nachrichtenfeld, sodass du als Nächstes dazu fragst. Agenten lesen auch deine Markierungen und Notizen in einem PDF, wenn du sie darum bittest („Fasse meine Markierungen in diesem Paper zusammen“).

## Datei nach Namen finden

Drücke auf einer beliebigen Seite Strg+P (⌘P auf dem Mac). „Zur Datei in …“ durchsucht den in Dateien geöffneten Ordner nach Namen: Tippe ein paar Buchstaben des Namens in dieser Reihenfolge (`invq3` findet `invoices/q3-report.xlsx`). Dateien, deren eigener Name enthält, was du getippt hast, stehen zuerst. Bewege dich mit ↑ und ↓, öffne mit Enter oder per Klick. Es listet bis zu 60 Dateien auf, versteckte eingeschlossen.

Auch die Suche mit Strg+K beziehungsweise ⌘K findet ab zwei Buchstaben Dateien aus demselben Ordner.

## Dateien suchen

Eine Suche durchsucht rekursiv Namen und Textinhalte unter einem Ordner. Gib den Suchtext unter **Suchen in** ein und drücke Enter oder öffne [In Dateien suchen](/search).

1. Tippe bei „Dateinamen und Dateiinhalte durchsuchen“ ein, wonach du suchst. Die Ergebnisse erscheinen beim Tippen.
2. Unter dem Feld sagt **In**, wo gesucht wird: zuerst der Ordner, aus dem du kamst. Klicke darauf, um woanders zu suchen: im Ordner eines Projekts, in einem angehefteten Ordner, einem Ordner, in dem Sitzungen gearbeitet haben, deinem **Persönlicher Ordner** oder einem beliebigen Ordner, den du über den Namen findest oder dessen Pfad du eintippst.
3. Optionale Einschränkungen:
   - **Alle Dateitypen** wählt die Art: **Text und Notizen**, **Code**, **Daten und Einstellungen**, **Webseiten** oder **Notebooks**. Oder tippe im selben Menü Namen wie diese ein, durch Kommas getrennt (`*.md, *.py`); ein `!` davor lässt diese weg (`!dist/**`).
   - **Auch versteckte Dateien** berücksichtigt mit Punkt beginnende Namen.
   - **Groß-/Kleinschreibung beachten** vergleicht exakt. Ohne Aktivierung ignoriert eine rein kleingeschriebene Suche die Schreibweise, eine mit Großbuchstaben beachtet sie. **Regulärer Ausdruck** interpretiert Muster wie `colou?r`.

Die Treffer sind aufgeteilt:

- **Dateien mit diesem Namen**: bis zu 30 Dateien, deren Namen enthalten, was du getippt hast, jeweils mit ihrem Ordner.
- **In Dateien**: die passenden Zeilen, nach Datei gruppiert, jede Datei mit ihrer Trefferzahl. Klicke auf eine Zeile, um die Datei an dieser Zeile zu öffnen, oder auf den Namen einer Datei, um sie zu öffnen.

**Mehr** (⋯) bei jedem Ergebnis bietet **Im Ordner anzeigen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App), **Sitzung damit starten**, **Zu einem Projekt hinzufügen** und den Rest des Menüs einer Datei.

Die Suche steht in der Seitenadresse und bleibt bei Zurück oder Neuladen erhalten. Ausgeschlossen sind `.gitignore`-Inhalte und Dateien über 4 MB. Grenzen: 50 Treffer je Datei, insgesamt 1.000 oder 15 Sekunden, angezeigt werden je Datei zunächst 30 Zeilen. PDF, Word und andere Dokumente werden nur nach Namen gefunden. Für Inhaltssuche durch Agenten füge sie dem [Wissen](/guide/projects#shared-knowledge-documents-every-session-can-search) hinzu.

## Ein Jupyter-Notebook ausführen

Ein Notebook (`.ipynb`) öffnet sich als Notebook: seine Zellen, jede mit ihrer Ausgabe. Die Leiste oben enthält die Kernel-Schaltfläche, **Alle Zellen ausführen**, **Unterbrechen (I, I)**, **Kernel neu starten (0, 0)**, **Alle Ausgaben löschen**, **Notebook-Datei (JSON) anzeigen**, **Herunterladen**, **Fragen** (siehe [Einen Agenten zur Datei fragen](#ask-an-agent-about-the-file)) und **Speichern**. Auf dem Smartphone stehen die seltener genutzten unter **Mehr**: **Kernel neu starten**, **Neu starten und alle Zellen ausführen**, **Alle Ausgaben löschen**, **Datei ansehen (JSON)** und **Herunterladen**.

Erstelle eines mit **Neu** → **Neues Notebook** in einem Ordner (siehe [Datei oder Ordner erstellen](/guide/files-git#make-a-file-or-folder)) oder bitte einen Agenten um eines: Er schreibt das Notebook, führt es von oben aus, damit seine Ausgaben da sind, richtet eine Umgebung zum Ausführen ein, wenn keine passt, und übergibt es als Karte, die es hier öffnet.

### Ausführungsumgebung wählen

Die Kernel-Schaltfläche (ein Punkt und ein Name oder „Kein Kernel“) öffnet **Notebook ausführen mit**: die Python-Umgebungen auf diesem Computer. Sie listet virtuelle Umgebungen namens `.venv`, `venv` oder `env` im Ordner des Notebooks oder in den Ordnern darüber, conda-Umgebungen, das System-Python und hier registrierte Jupyter-Kernel (auch für andere Sprachen). Jede zeigt ihre Version, und die, die das Notebook verlangt (oder eine virtuelle Umgebung daneben), ist mit **vorgeschlagen** markiert.

- Eine Umgebung mit der Markierung „benötigt ipykernel“ hat die Schaltfläche **Installieren**: Sie führt nach deiner Bestätigung `pip install ipykernel` in dieser Umgebung aus, und sonst ändert sich darin nichts.
- Wenn du eine Zelle ausführst, obwohl noch kein Kernel läuft, startet einer in der vorgeschlagenen Umgebung. Schlägt das fehl, öffnet sich die Liste, damit du eine andere wählen kannst.
- Bei laufendem Kernel zeigt das Menü der Schaltfläche seinen Zustand (Wird gestartet, Inaktiv, Läuft, Neustart oder Angehalten), wann er gestartet wurde, und **Unterbrechen**, **Neu starten** und **Herunterfahren**. Eine andere Umgebung zu wählen, fragt zuerst nach, da die Variablen des laufenden Kernels verloren gehen.

Kernel laufen nach Schließen des Notebooks und über App-Neustarts hinweg weiter. Beim erneuten Öffnen sind zwischenzeitliche Ausgaben vorhanden. Beende sie im Kernelmenü oder unter [System](/system) bei den laufenden Kerneln.

### Zellen schreiben und ausführen

Zelltypen sind **Code**, **Text** als Markdown und **Roh**. Code wird angeklickt, Text per Doppelklick bearbeitet. Während der Ausführung stehen `[*]` und Dauer, danach die Ausführungsnummer wie `[3]`.

- Zeige auf eine Code-Zelle, und eine Ausführen-Schaltfläche tritt an die Stelle ihrer Nummer („Ausführen (Umschalt+Enter)“: Sie führt die Zelle aus und geht zur nächsten; während die Zelle läuft, unterbricht sie den Kernel). Ihre Werkzeuge erscheinen in der Ecke: **Bearbeiten** (Text-Zellen), der Zelltyp, **Nach oben verschieben**, **Nach unten**, **Zelle darunter hinzufügen**, **Zelle löschen** und **Mehr zu dieser Zelle** (⋯, das Menü der Zelle, weiter unten). Auf dem Smartphone tippst du auf eine Zelle: Ihre Werkzeuge erscheinen darüber, **Ausführen** eingeschlossen.
- Am Computer zeigt das Zeigen zwischen zwei Zellen **+ Code** und **+ Text**. Dieselben beiden Schaltflächen stehen unter der letzten Zelle.
- **Das Zellmenü**: Klicke mit rechts auf eine Zelle (oder auf ihr ⋯ in der Ecke, so öffnet es sich auf dem Smartphone). Es hat **Diese Zelle ausführen**, **Alle Zellen darüber ausführen**, **Diese und folgende Zellen ausführen** und **Alle Zellen darunter ausführen** (nur Code-Zellen werden ausgeführt), **Ausschneiden**, **Kopieren**, **Darunter einfügen**, **Darüber einfügen**, **Duplizieren**, **Am Cursor teilen** (während du die Zelle bearbeitest, mit dem Cursor dort, wo geteilt werden soll), **Mit nächster Zelle zusammenführen**, **Zelle darüber hinzufügen** und **darunter**, **Nach oben verschieben** und **unten**, **Zelltyp**, **Ausgabe löschen**, **Ausgabe einklappen** oder **Ausgabe anzeigen** und **Zelle löschen**, jeweils mit ihrer Taste. Ausgeschnittene, kopierte und duplizierte Zellen behalten ihre Ausgaben; ein Einfügen kann in ein anderes Notebook gehen, solange die App geöffnet ist. Teilen oder Zusammenführen löscht die Ausgaben der Zellen, die dabei entstehen.
- **Mehrere Zellen zusammen**: Umschalt+↑ / Umschalt+↓ (oder Umschalt+Klick) wählt die Zellen zwischen dem Punkt, an dem du angefangen hast, und dem, an dem du bist, getönt dargestellt; das Menü, **Kopieren**, **Ausschneiden**, **Duplizieren**, **Merge** und D, D wirken dann auf alle. Esc lässt los.
- **Eine Ausgabe einklappen**: Die kleinen Pfeile neben der Nummer einer Zelle (oder **Ausgabe einklappen** in ihrem Menü) verbergen ihre Ausgabe hinter „Ausgabe ausgeblendet“; klicke darauf, um sie wieder zu zeigen. Das wird (wie in Jupyter) in der Datei des Notebooks gespeichert, sodass sie eingeklappt bleibt, wenn du es wieder öffnest.
- Bei Eingabeanforderung wie Python `input()` erscheint unter der Zelle ein Feld zum Eingeben und Bestätigen mit Enter. Passwörter bleiben verborgen.
- Tab nach einem Namen fragt beim laufenden Kernel Vervollständigungen ab.

Ausgaben unterstützen Text, farbige Fehler, Bilder und Diagramme, Tabellen, isoliertes HTML, Markdown und Formeln. Interaktive Widgets und JavaScript-Ausgaben laufen hier nicht. Fortschrittsbalken zeigen ihren letzten Stand; schrittweise Konsolenausgaben erscheinen als gemeinsamer Block wie in Jupyter.

### Tastenkürzel

Während der Zellbearbeitung:

- Umschalt+Enter: ausführen und weiter, nach der letzten eine neue Zelle.
- Strg+Enter, auf dem Mac ⌘Enter: ausführen und bleiben.
- Alt+Enter: ausführen und eine Zelle darunter ergänzen.
- Strg+Umschalt+Enter: diese und folgende Zellen ausführen.
- Strg+Umschalt+-, auf dem Mac ⌘⇧-: am Cursor teilen.
- Esc: Bearbeitung beenden.

Außerhalb der Zellbearbeitung:

- Enter: die ausgewählte Zelle bearbeiten. ↑ / ↓ (oder K / J): zwischen Zellen wechseln. Umschalt+↑ / ↓: mehrere auswählen.
- A/B ergänzt oberhalb beziehungsweise unterhalb. D, D löscht die Auswahl. Z stellt zuletzt gelöschte Zellen wieder her, erneut Z frühere.
- C/X kopiert beziehungsweise schneidet aus. V/Umschalt+V fügt darunter beziehungsweise darüber ein. Umschalt+M verbindet mit der nächsten Zelle oder die Auswahl. Strg+Umschalt+Enter führt diese und folgende aus.
- M, Y und R wechseln zu Text, Code und Rohtext.
- I, I unterbricht den Kernel. 0, 0 startet neu.

**Mehr** (⋯) in der Leiste über dem Notebook bietet **Alle Zellen ausführen**, **Alle Zellen darüber ausführen**, **Diese und folgende Zellen ausführen** und **Alle Zellen darunter ausführen** (die letzten drei für die ausgewählte Zelle), **Kernel neu starten**, **Neu starten und alle Zellen ausführen**, **Alle Ausgaben löschen**, **Gliederung** und **Tastenkombinationen**. **Gliederung** zeigt die Überschriften der Text-Zellen (die Zeilen, die mit # beginnen) in einer Liste neben den Zellen (auf dem Smartphone ein Blatt): Klicke auf eine, um zu ihrer Zelle zu springen. **Tastenkombinationen** listet jede Taste auf. Eine Zelle, die ausgeführt wird, während der Kernel noch startet, wartet auf ihn und läuft, sobald er bereit ist.

Strg+S (⌘S auf dem Mac) speichert. Wie bei anderen Dateien bietet eine Leiste **Neu laden (meine Änderungen verwerfen)** oder **Mit meiner Version überschreiben** an, wenn sich das Notebook auf dem Datenträger ändert, während du ungespeicherte Änderungen hast. **Notebook-Datei (JSON) anzeigen** zeigt die Datei als Text im Editor; **Als Notebook öffnen** geht zurück.

## Repositorys auf der Git-Seite

Klicke in der Werkzeugleiste auf **Git** oder gehe zu [Git](/git). Links stehen deine Git-Repositorys, die zuletzt verwendeten zuerst: die, in denen deine Sitzungen gearbeitet haben (der Ordner einer Sitzung oder eine Datei, die eine Sitzung bearbeitet hat; flüchtige Orte wie `/tmp` bleiben außen vor), und die, die du selbst hinzugefügt hast. Sobald es mehr als sechs sind, findet ein Feld oben eines über den Namen.

Wenn du die Git-Seite zum ersten Mal öffnest, führt dich ein kurzer Rundgang herum, der für Git-Neulinge geschrieben ist. Er kommt, solange Tipps eingeschaltet sind, nach der Willkommenstour. Eine Karte erklärt in einfachen Worten, was Git ist (Speicherpunkte für einen Ordner: Commits, in einem Repository), dann leuchtet jeder Teil der Seite der Reihe nach mit einer eigenen Karte auf: deine Repositorys, **Änderungen**, **Commit**, eine Kopie online aufbewahren (**Push** und **Pull**), **Verlauf**, **Branches** und dass du einfach einen Agenten fragen kannst. Mit **Weiter** und **Zurück** bewegst du dich durch den Rundgang; **Fertig** beendet ihn, und **Überspringen** oder Esc schließt ihn früher. **Rundgang zeigen** (die Kompass-Schaltfläche oben rechts auf der Seite) startet ihn jederzeit erneut.

Jedes Repository zeigt seinen Namen und Branch sowie kleine Markierungen, wenn etwas zu tun ist:

- **● 3**: drei geänderte Dateien ohne Commit.
- **↑ 2**: zwei Commits zum Pushen, **↓ 1**: einer zum Pullen.
- **Merge** oder **Rebase wird ausgeführt**: ein Merge, der bei Dateien mit Konflikten angehalten hat (siehe [Wenn ein Merge bei Konflikten anhält](/guide/files-git#when-a-merge-stops-on-conflicts)).
- Rechts das Alter des letzten Commits.

**Remotes aller Repositories abrufen** als Wolke aktualisiert die Remoteinformationen. **Aktualisieren** liest die Liste neu.

Klicke auf ein Repository, um es neben der Liste zu öffnen. Oben stehen: sein Name und Ordner, der Branch, auf dem du bist, eine Zeile dazu, wie es im Vergleich zum Remote steht, **Synchronisieren** und ein ⋯-Menü. Darunter vier Tabs: **Änderungen**, **Verlauf**, **Branches** und **Stashes**. Am Computer öffnet sich das Repository, das du zuletzt benutzt hast, wenn du auf die Seite kommst. In einem kleinen Fenster faltet sich die Liste in den Titel der Seite (klicke auf den Namen des Repositorys, um ein anderes zu wählen); auf dem Smartphone ist die Liste eine eigene Seite, und ein Repository öffnet sich darüber mit einem Zurückpfeil.

### Repository hinzufügen

**Hinzufügen** bietet:

- **Ordner auf diesem Computer hinzufügen**: Tippe den Ordner eines Projekts ein oder wähle ihn und klicke auf **Hinzufügen**. Ein Ordner innerhalb eines Repositorys fügt dieses Repository hinzu. Ein Ordner, den Git noch nicht verwaltet, kann ein eigenes Repository beginnen: **Repository hier initialisieren** (Gits `git init`).
- **Von einem Link klonen**: Füge die Adresse eines Repositorys auf GitHub, GitLab oder einem anderen Git-Server ein (`https://…`, `ssh://…` oder `git@host:owner/project`). **Wohin es geht** schlägt einen eigenen Ordner vor (in `~/code`, wenn du einen hast); er darf noch nicht existieren oder muss leer sein. **Klonen** zeigt, wie weit es ist; du kannst den Dialog schließen, und es läuft weiter. Das Repository öffnet sich, wenn es fertig ist.

Einträge bleiben bis **⋯ → Aus Liste entfernen** bestehen; der Ordner wird dabei nicht verändert.

## Mit dem Remote synchronisieren

Das Remote ist der gemeinsame Repositoryort, etwa GitHub. Unter dem Branch steht beispielsweise „2 zum Pushen · 1 zum Pullen · vor 5 Min. abgerufen“, **Aktuell**, **Noch nicht auf dem Remote** oder **Kein Remote**.

**Synchronisieren** macht in einem Klick, was nötig ist: Es fragt das Remote, was neu ist, holt diese Commits herein und sendet dann deine hoch. Seine Pfeile zeigen, wie viele in jede Richtung gehen (**Synchronisieren ↑2 ↓1**). Ein Branch, den das Remote noch nicht hat, zeigt stattdessen **Branch veröffentlichen**: Es legt den Branch dort an und hält die beiden von da an im Gleichschritt.

Wenn dein Branch und der des Remotes beide weitergegangen sind, ändert Synchronisieren noch nichts und fragt, wie sie zusammengeführt werden sollen:

- **Meine Commits per Rebase aufsetzen** setzt deine Commits nach die des Remotes, als wären sie später entstanden. Das ergibt einen linearen Verlauf, einen Rebase.
- **Zusammenführen** verbindet beide Linien mit einem Merge-Commit; bisherige Commits bleiben unverändert.

Danach sendet Synchronisieren deine Commits hoch. Haben beide Seiten dieselben Zeilen geändert, hält es an, damit du sie klären kannst (siehe [Wenn ein Merge bei Konflikten anhält](/guide/files-git#when-a-merge-stops-on-conflicts)). Berühren deine nicht committeten Änderungen Dateien, die sich im Remote geändert haben, sagt es das: Committe sie zuerst oder lege sie in einem Stash beiseite.

Das ⋯-Menü bietet einzelne Schritte:

- **Fetch** aktualisiert Remoteinformationen ohne lokale Dateiänderung. **Pull** übernimmt Commits mit derselben Rückfrage bei Abweichungen. **Push** sendet deine Commits.
- **Hier ein Terminal öffnen**, **In Dateien anzeigen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App), **Pfad kopieren**.
- **Remotes**: die Remotes des Repositorys und ihre Adressen. Ein Repository ohne eines zeigt **Kein Remote · Hinzufügen**: Füge eine Adresse ein und klicke auf **Remote hinzufügen** (es heißt origin), dann auf **Branch veröffentlichen**.
- **Tags pushen**, wenn Tags vorhanden sind.

Fehler erscheinen rot mit möglichst verständlicher Erklärung und **Git-Ausgabe** für den Originaltext. Hydor fragt Git-Passwörter nicht interaktiv ab. Push und Pull nutzen lokale SSH-Keys oder gespeicherte Git-Zugangsdaten; fehlt ein nichtinteraktiver Zugang, wird dies gemeldet.

## Änderungen committen

**Änderungen** listet jede Datei auf, die seit dem letzten Commit geändert wurde, mit den Buchstaben, die die Dateiseite verwendet (siehe [Was die Buchstaben neben Dateien bedeuten](/guide/files-git#what-the-letters-beside-files-mean)), ihrem Namen in Fettschrift mit dem Ordner dahinter und den hinzugefügten und entfernten Zeilen. Klicke auf eine Datei, um ihre Änderungen neben der Liste zu sehen (auf dem Smartphone auf einer eigenen Seite). Wo Platz ist, zeigen **Einheitlich** und **Seite an Seite** die alten und neuen Zeilen untereinander oder nebeneinander.

Es gibt keinen getrennten Staging-Schritt. Kästchen je Datei bestimmen den nächsten Commit, zunächst alle. Das obere Kästchen wählt alle oder keine; die Anzeige lautet etwa „3 von 4 im Commit“.

- **Diesen Teil verwerfen** oben an jedem Teil der Änderungen einer Datei setzt nach einer Rückfrage genau diese Zeilen auf den Stand des letzten Commits zurück.
- Das ⋯-Menü einer Datei bietet **Datei öffnen**, **In Dateien anzeigen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App), **Änderungen verwerfen** (bei einer neuen Datei **Neue Datei löschen**; beide fragen vorher nach und lassen sich nicht rückgängig machen) sowie **Ignoriere es** (eine neue Datei) oder **Nicht mehr verfolgen und ignorieren** (eine Datei, die Git verfolgt: Der nächste Commit nimmt sie aus dem Repository, auf diesem Computer bleibt sie erhalten). Beides trägt sie in `.gitignore` ein.
- Das Kastensymbol oben über der Liste legt alle Änderungen in einem Stash beiseite (siehe [Änderungen mit einem Stash beiseitelegen](/guide/files-git#put-changes-aside-with-a-stash)).

Zum Committen unten:

1. Schreibe Zusammenfassung und bei Bedarf Beschreibung. **Nachricht schreiben** lässt ein Modell ausgewählte Änderungen im Stil jüngster Repository-Commits beschreiben: Claude bei angemeldetem Claude Code, sonst Codex.
2. Wähle **Commit** oder **Commit & Push**, um ihn gleich an den Remote zu senden (dabei wird der Branch veröffentlicht, falls der Remote ihn noch nicht hat). Auch Strg+Enter committet.

Nur ausgewählte Dateien gehen ein, auch wenn andernorts weitere gestagt wurden.

**Letzten Commit ändern** erscheint, solange kein Remote ihn enthält. Nach Aktivierung bearbeitest du dessen Nachricht und ergänzt ausgewählte Dateien statt eines neuen Commits. Buttons heißen entsprechend **Ändern** und **Ändern und pushen**.

Ist alles committet, steht unter Änderungen **Keine Änderungen zum Committen** und der letzte Commit wird angezeigt: Klicke ihn an, um ihn im Verlauf zu öffnen.

## Mergekonflikte lösen

Wenn beide Seiten dieselben Zeilen geändert haben (bei einem Sync, der Commits holt, beim Mergen eines Branches oder beim Rückgängigmachen eines Commits), bleibt Git auf halbem Weg stehen, und das Repository sagt es oberhalb seiner Tabs: „Merge von origin/main in main angehalten: Konflikt in 1 Datei“. Die Dateien mit Konflikten sind dort aufgeführt und unter Änderungen mit **C** markiert; klicke eine an, um sie zu sehen.

Git kennzeichnet beide Fassungen: Auf `<<<<<<<` folgt deine Fassung, auf `=======` die der anderen Seite bis zur Markierung `>>>>>>>`. Öffne die Datei, behalte den gewünschten Inhalt und entferne Markierungen. Ohne Markierungen gilt sie mit Häkchen als gelöst. Danach:

- **Agenten um die Lösung der Konflikte bitten** öffnet die Startseite mit einem Auftrag für dieses Repository: Ein Agent löst die Konflikte in den Dateien, prüft, dass sie weiterhin funktionieren, und sagt dir, wofür er sich entschieden hat. Es startet nichts, bevor du den Auftrag absendest.
- **Fortfahren** schließt ab, sobald alle Dateien gelöst sind, was angehalten wurde (den Commit des Merges oder den Rest deiner Commits, die obendrauf gesetzt werden).
- **Merge abbrechen** (oder **Rebase abbrechen**, **Revert abbrechen**) stellt nach einer Rückfrage alles so wieder her, wie es vor dem Beginn war. Was du geändert hast, um die Dateien zu lösen, geht verloren.

Bis dahin warten Synchronisierung und Commitfeld; Fortsetzen erstellt den nötigen Commit.

## Verlauf ansehen

Der **Verlauf** listet die Commits auf, die neuesten zuerst, links mit einem Graphen, wie sich Branches trennen und wieder zusammenlaufen: Jede Linie ist ein Branch und jeder Punkt ein Commit; ein Ring ist ein Commit, den der Remote noch nicht hat. Labels zeigen die Branches (deine mit Umrandung), die Branches des Remotes (mit einer Wolke) und die Tags an jedem Commit, danach seine Nachricht, wer ihn erstellt hat und wann.

- **Dieser Branch** zeigt den Verlauf, der zu dem Branch geführt hat, auf dem du bist; **Alle Branches** zeigt den Verlauf jedes Branches, auch den des Remotes.
- **Commit suchen** findet Commits anhand von Wörtern in ihrer Nachricht, dem Namen oder der Adresse ihres Autors oder ihrem Hash.
- **Fehlerverursachenden Commit finden**, die Schaltfläche daneben, lässt einen Agenten den Commit finden, der etwas kaputt gemacht hat (siehe [Den Fehlerverursacher finden](#find-what-broke-it)).
- **Mehr laden** öffnet ältere Commits.

Klicke einen Commit an, um ihn neben der Liste zu öffnen (auf dem Handy auf einer eigenen Seite): seine ganze Nachricht, Autor, Datum und Hash (klicke den Hash an, um ihn zu kopieren), die Branches und Tags daran und die Dateien, die er geändert hat, jede mit ihrem Vergleich zum Aufklappen. Ein Merge nennt, welche Commits er zusammengeführt hat.

- **Erklären** öffnet die Startseite mit einem Agentenauftrag zur verständlichen Erklärung.
- **Diesen Commit rückgängig machen** erscheint beim letzten noch nicht remote vorhandenen Commit. Er wird entfernt, seine Änderungen erscheinen wieder unter Änderungen.
- Das ⋯-Menü bietet außerdem **Hash kopieren**, **Fehlerverursachenden Commit finden** (ab diesem Commit, als letzter Stand, in dem es noch funktionierte), **Neuer Branch von hier** (ein Branch, der bei diesem Commit beginnt; du wechselst darauf), **Diesen Commit mit einem Tag versehen** (ein Name wie `v1.2.0` und, wenn du magst, eine Nachricht; **Tags pushen** im ⋯-Menü des Repositorys sendet Tags an den Remote) und **Diesen Commit rückgängig machen**: ein neuer Commit, der nach einer Rückfrage macht, was dieser geändert hat, wieder rückgängig. Der Commit selbst bleibt im Verlauf.

### Fehlerverursachenden Commit finden

Wenn etwas in einer früheren Version funktioniert hat und jetzt kaputt ist, öffne den Commit, in dem es zuletzt funktionierte, und wähle in seinem ⋯-Menü **Fehlerverursachenden Commit finden**, oder wähle die Schaltfläche **Fehlerverursachenden Commit finden** neben **Commit suchen**. Das Formular fragt:

- **Funktionierte bei**: ausgewählter Commit möglichst als Tag, sonst jüngster Tag. Beliebige Tags, Branches oder Commits sind möglich; die Auflösung steht darunter.
- **Fehlerhaft bei**: zunächst `HEAD`.
- **Was ist kaputt**, in deinen Worten, und **So prüfst du es (optional)**: ein Befehl, der fehlschlägt, solange es kaputt ist.
- **Ausgeführt von**: zuständiger Agent.

**Starten** öffnet eine neue Sitzung im eigenen Worktree und lässt deine Kopie unverändert. Der Agent schreibt eine Prüfung, testet beide Endpunkte, sucht mit git bisect den ersten fehlerhaften Commit, erklärt Ursache und mögliche Korrektur. Siehe [Fehlerverursachenden Commit finden](/guide/engineering#find-what-broke-it).

## Mit Branches arbeiten

Klicke unter dem Namen des Repositorys auf den Namen des Branches, um zu wechseln: Zuerst kommen die Branches hier, die neuesten zuerst, mit ↑↓ gegenüber ihrem Branch auf dem Remote, danach die, die es **Nur auf dem Remote** gibt. Tippe, um einen zu finden; ein Name, der noch kein Branch ist, bietet **Neuer Branch „…“ von hier**. Bei uncommitteten Änderungen fragt die App zuerst nach: Sie kommen mit, und wenn sie mit diesem Branch kollidieren, verweigert Git den Wechsel und nichts ändert sich. Ein Branch, den es nur auf dem Remote gibt, wird hier zu einem Branch, der ihm folgt.

Der Tab **Branches** zeigt zuerst den Branch, auf dem du bist, dann die anderen, jeweils mit seinem letzten Commit und Markierungen: **gemergt** (seine Arbeit ist bereits in deinem Branch), **nur hier** (nicht auf dem Remote), **Vom Remote entfernt** und ↑↓ gegenüber seinem Branch auf dem Remote. **Neuer Branch** erstellt einen von deinem aktuellen Stand aus und wechselt darauf. Jeder Branch hat **Wechseln** und ein ⋯-Menü:

- **Zusammenführen in** *deinen Branch*: Seine Arbeit wird mit deiner vereint. Wenn beide dieselben Zeilen geändert haben, hält der Merge an, damit du sie lösen kannst.
- **Vergleichen mit** *deinem Branch*: die Commits, die jeweils der eine hat und dem anderen fehlen. Klicke einen an, um ihn zu öffnen.
- **Veröffentlichen** pusht einen bisher nur lokalen Branch.
- **Umbenennen** lässt den Remotebranchnamen unverändert.
- **Löschen** entfernt gemergte Branches sofort. Bei ungemergten nennt die Rückfrage sonst nirgends enthaltene Commits; **Trotzdem löschen** entfernt sie mit.

Unter **Nur auf dem Remote** stehen Branches ohne lokale Kopie. **Auschecken** erstellt eine lokale Trackingfassung und wechselt dorthin.

## Änderungen mit einem Stash zurücklegen

Ein Stash legt deine uncommitteten Änderungen beiseite, damit du an etwas anderem arbeiten und sie später zurückholen kannst. **Änderungen stashen** (im Tab **Stashes** oder über das Kastensymbol oben unter Änderungen) fragt, was die Änderungen sind und ob du **Neue Dateien ebenfalls aufnehmen** willst; die Dateien kehren danach zum Stand des letzten Commits zurück.

**Stashes** listet sie mit ihrer Nachricht, dem Branch, auf dem sie erstellt wurden, dem Zeitpunkt und der Zahl der Dateien auf. Klicke einen an, um zu sehen, was er enthält, Datei für Datei:

- **Anbringen und entfernen** stellt Änderungen wieder her und löscht den Stash.
- **Übernehmen** stellt sie wieder her und behält den Stash.
- Papierkorb löscht nach Rückfrage unwiderruflich.

Wenn die Änderungen mit dem kollidieren, was die Dateien jetzt enthalten, sind die Dateien mit Konflikten unter Änderungen mit **C** markiert: Löse sie wie nach einem Merge und committe.

## Pull-Request aus einer Sitzung öffnen

Ein Pull-Request bittet Repositoryverantwortliche um Übernahme eines Branches. Du kannst ihn auf GitHub oder Gitea direkt aus der Sitzung öffnen, die Änderungen erstellt hat.

Voraussetzungen:

- Konto für den Repositoryserver unter [Einstellungen → App → Quellcodeverwaltung](/settings?s=scm); siehe [GitHub- oder Gitea-Konto hinzufügen](/guide/devices#add-a-github-or-gitea-account).
- Der Ordner der Sitzung liegt in einem Git-Repository mit einem Remote, auf einem eigenen Branch. Eine Sitzung, die auf dem Hauptbranch selbst arbeitet, kann keinen Pull-Request öffnen: Starte die Sitzung in einem Worktree (einer separaten Kopie des Repositorys auf einem neuen Branch) oder wechsle zuerst auf einen neuen Branch.

Ablauf:

1. Wähle im Menü der Sitzung (⋯) **Ordner und Code** → **Pull-Request öffnen**.
2. Der Dialog zeigt Branch und Ziel wie `my-branch → main on owner/repo`, Anzahl Commits und Dateien sowie Pushstatus. Noch nicht veröffentlichte Branches werden beim Öffnen gepusht.
3. Aktiviere bei Bedarf **Uncommittete Änderungen zuerst mit dem Titel als Nachricht committen**. Ohne Auswahl bleiben sie außen vor. Ohne vorhandene Commits ist die Option vorausgewählt.
4. Schreibe Titel und Markdown-Beschreibung oder nutze **Für mich schreiben**. Ein Modell liest Commits, Änderungen und Sitzungsauftrag. Mindestens ein Commit ist nötig.
5. Setze den Haken bei **Entwurf**, um ihn als Entwurf zu öffnen. (Gitea kennzeichnet einen Entwurf mit „WIP:“ vor dem Titel.)
6. **Pull-Request öffnen** pusht den Branch, erstellt und verknüpft den PR mit der Sitzung und öffnet einen neuen Tab.

Existiert für den Branch bereits ein offener Pull-Request, bietet der Dialog **Mit dieser Sitzung verknüpfen**. Andere PRs bindest du über **Vorhandenen Pull-Request verknüpfen …**, Adresse und **Verknüpfen** ein.

### Pull-Request verfolgen

Nach der Verknüpfung erscheint die Nummer des Pull-Requests neben der Sitzung in der Seitenleiste und im Kopf der Sitzung, mit einem Symbol für seinen Zustand (offen, Entwurf, gemergt oder geschlossen) und einem Punkt für seine Checks (die Tests, die der Server dafür ausführt: laufend, bestanden oder fehlgeschlagen). Die App prüft alle paar Minuten und sagt dir Bescheid, wenn er gemergt wurde oder seine Checks fertig sind.

Klicke auf die Nummer im Kopf (oder auf **Pull-Request #12** im Menü der Sitzung → **Ordner und Code**), um seinen Dialog zu öffnen:

- **Auf GitHub öffnen**, entsprechend Gitea.
- **Änderungen prüfen**, siehe unten.
- **Jetzt prüfen** für aktuellen Zustand und Checks.
- **Verknüpfung aufheben**: nimmt ihn von der Sitzung ab (der Pull-Request selbst bleibt bestehen).

## Branchänderungen prüfen

Die Seite zur Änderungsprüfung zeigt alles, was der Branch einer Sitzung geändert hat, seit er seinen Basisbranch verlassen hat, ob committet oder nicht, neue Dateien eingeschlossen. Öffne sie über das Menü der Sitzung (⋯) → **Ordner und Code** → **Änderungen prüfen**, über den Dialog eines Pull-Requests oder über den Dialog eines Worktrees (**Änderungen prüfen**).

Oben stehen: „Änderungsprüfung:“ und der Titel der Sitzung, der Branch und seine Basis, wie viele Dateien es sind und wie viele davon „nicht committet“ sind, ein Link zum Pull-Request, falls es einen gibt, und **Sitzung**, um zurückzugehen.

Jede geänderte Datei zeigt ihren Statusbuchstaben (A hinzugefügt, M geändert, D gelöscht, R umbenannt), ihren Pfad, bei Bedarf eine Kennzeichnung „nicht committet“, die hinzugefügten und entfernten Zeilen und darunter ihre Änderungen.

- Setze bei einer Datei, die du gelesen hast, den Haken bei **Gesehen**: Sie klappt ein und zählt zu „… von … angesehen“. Die Markierung gilt, bis sich die Datei wieder ändert, und wird in diesem Browser gespeichert.
- Auf einem breiten Bildschirm steht links eine Liste der Dateien mit einem Fortschrittsbalken: Klicke eine Datei an, um zu ihr zu springen.
- **Änderungen Schritt für Schritt erklären**: Ein Modell liest die Änderungen und schreibt eine kurze Zusammenfassung, eine leicht nachzuvollziehende Reihenfolge (zuerst die Kernidee, dann was sie verwendet, Tests und Dokumentation zuletzt) und zu jeder Datei eine Notiz, was sich geändert hat und worauf du genau achten solltest. Danach wechseln **Empfohlene Reihenfolge** und **Nach Dateipfad** zwischen dieser Reihenfolge und den Dateien nach Namen. Die Erklärung wird genau für diese Änderungen gespeichert, sie ist also beim nächsten Mal da, bis sich der Branch ändert.
- **Neu laden** liest die Änderungen erneut.

Noch nicht von Git erfasste neue Dateien erscheinen, wenn sie kleine Textdateien sind. Binärdateien zeigen nur einen entsprechenden Hinweis ohne Textvergleich.

## Terminal verwenden

Klicke auf **System** und dann auf **Terminal** oder öffne [Terminal](/terminal): echte Shells auf diesem Computer. Ist keine geöffnet, startet eine in deinem Home-Ordner.

- Jedes Terminal ist ein Tab, benannt nach seinem Ordner und dem Programm, das darin läuft. **Neues Terminal** (+) öffnet ein weiteres, ebenfalls in deinem Home-Ordner.
- Doppelklick benennt Tabs um.
- ✕ schließt ein Terminal. Läuft darin noch ein Programm, fragt die App vorher nach, denn das Schließen beendet die Shell und alles, was sie ausführt.
- Ausgabelinks öffnen neue Tabs.

Terminals laufen im privaten tmux-Server der App und überstehen Seitenwechsel, Neuladen, Browserschließen und App-Neustarts. Beim Zurückkehren ist der bisherige Stand vorhanden.

Um eines in einem anderen Ordner zu öffnen, starte es von dort: auf der Seite „Dateien“ über das Menü eines Ordners oder über **Mehr** (⋯) für den Ordner, in dem du bist (**Hier ein Terminal öffnen**), im Editor (**Terminal in diesem Ordner**), bei einem Repository auf der Git-Seite (**Hier ein Terminal öffnen**) und im Menü der Sitzung → **Ordner und Code** → **Hier ein Terminal öffnen**.

### Terminalbereich

Am Computer öffnet oder schließt `` Ctrl+` ``, auch auf dem Mac, den unteren Terminalbereich auf jeder Seite. Es sind dieselben Terminals wie auf der Terminalseite. Ziehe die Oberkante für die Höhe; **Panel ausblenden** schließt. Auch die Suchaktion **Terminalbereich ein- oder ausblenden** schaltet ihn. Aus anderen Seiten gestartete Terminals erscheinen dort.

### Graue Vorschläge

Am Shellprompt erscheint die wahrscheinlichste Fortsetzung deiner Eingabe grau hinter dem Cursor:

- → oder Ende übernimmt alles, Strg+→ oder Alt+→ das nächste Wort.
- Vorschläge kommen aus Befehlen, die du schon eingegeben hast (zuerst die, die im selben Ordner ausgeführt wurden, und neue und häufige vor alten), aus dem eigenen Verlauf deiner Shell und aus Befehlen, die Agenten in letzter Zeit ausgeführt haben.

Strg+Leertaste (auch auf einem Mac) oder **Vorschläge** in der Tableiste öffnet eine Liste mit mehr:

- frühere Befehle mit passendem Anfang;
- Ergänzungen zum aktuellen Wort, etwa Git-Befehle und Branches, Projektskripte mit `npm run …`, Make-Ziele, SSH-Hosts, Ordner und Dateien;
- nach einigen Buchstaben **Befehl für „…“ schreiben**, siehe unten.

↑ und ↓ wählen, Enter oder Klick übernimmt nur die Befehlszeile, Esc schließt. Ausgeführt wird erst durch weiteres Enter am Prompt.

Vorschläge gelten nur am Shellprompt, nicht innerhalb von Editoren oder Python. Mit Leerzeichen beginnende und nach Passwort oder Key aussehende Befehle werden nicht gespeichert. Grauen Text deaktivierst du unter [Einstellungen → App → Allgemein → Terminalvorschläge](/settings?s=general&find=Terminal%20suggestions). Die Liste mit Strg+Leertaste bleibt nutzbar.

### Befehl in Worten beschreiben

Schreibe am Prompt etwa `find the biggest files here`, drücke Strg+Leertaste und wähle **Befehl für „Finde die größten Dateien hier“ schreiben**. Ein Modell, Claude bei angemeldetem Claude Code, sonst Codex, erstellt bis zu drei passende Befehle für Shell und Ordner mit kurzer Erklärung. Übernimm einen, prüfe ihn und führe ihn selbst mit Enter aus.

### Auf dem Smartphone

Die Terminal-Seite ergänzt eine Tastenreihe mit Tasten, die Handys fehlen: **Strg** und **Alt** (sie gelten für die nächste Taste, die du tippst), **Vorschläge**, ^C, ^D, ^Z, ^L, ^R, Esc, Tab, die Pfeile, `|`, `/`, `-`, `~`, Pos1 und Ende. Auf dem Handy gibt es kein unteres Panel: Terminals, die von anderen Seiten aus geöffnet werden, öffnen sich auf der Terminal-Seite.

## Entwicklungsserver in der Vorschau ansehen

Wenn du oder ein Agent hier den Entwicklungsserver einer Web-App startet (`npm run dev`, ein Python-Server), zeigt die Vorschau ihn an, auf diesem Computer oder auf jedem anderen Gerät, das die App erreicht. Klicke auf **System** und dann auf **Vorschau** oder öffne [Vorschau](/preview).

Links listet **Web-Apps** die Server auf diesem Computer auf, die mit einer Webseite antworten: jeweils mit dem Namen ihres Projekts (dem ihres Pakets, sonst dem ihres Ordners), ihrem Port, dem Titel der Seite, dem, was sie ausliefert, wenn die App es erkennen kann (Vite, Next.js, Python …), und ihrem Ordner. **Andere Server**, eingeklappt, listet den Rest auf: APIs, Datenbanken und Ähnliches. **Anderer Port** öffnet einen, der nicht aufgeführt ist. Die Liste wird alle 5 Sekunden aktualisiert; die Aktualisieren-Schaltfläche liest sie sofort neu ein.

Ein Klick zeigt die App rechts. Am Computer öffnet die erste automatisch, mobil füllt sie den Bildschirm mit **Alle Server** zur Rückkehr. Darüber:

- **Zurück**, **Vorwärts** und **Neu laden** sowie die Adresszeile mit dem Port und dem Pfad der Seite. Sie folgt den Links, die du in der App anklickst; gib einen anderen Pfad ein und drücke Enter, um dorthin zu gehen.
- **Computer**, **Tablet**, **Smartphone** für passende Breiten, mobil 390 Pixel, auf den verfügbaren Platz verkleinert.
- **Mehr** (⋯) mit **In einem eigenen Tab öffnen**, **Agenten zu dieser Ansicht fragen**, **Als Bild speichern** und **Als Bild anzeigen** beziehungsweise **Live anzeigen**. Die Agentenfrage öffnet die Startseite mit Screenshot, App-Ordner und ergänzbarem Anfang „Zu diesem Bildschirm von …“.

### Live oder als Bilder

Die Live-Vorschau verwendet einen getrennten Port, standardmäßig 8791. Deine Hydor-Anmeldung erreicht den Entwicklungsserver dadurch nicht; Hot Reload funktioniert. Ein Browser zeigt jeweils einen Server über diesen Port; eine andere Auswahl schaltet ihn um.

Wenn dein Browser den Vorschau-Port nicht erreichen kann (du erreichst die App etwa über einen Tunnel oder einen Proxy mit nur einem Hostnamen), öffnet sich die Seite stattdessen in einem Browser auf diesem Computer, in der Größe, die du gewählt hast, und wird live in die Vorschau gestreamt: Klicke, tippe, scrolle und füge darin ein wie auf jeder Seite, und auch Hot Reload wird dort angezeigt. Auf einem Handy tippst und ziehst du; **Typ** unter der Seite öffnet die Tastatur, neben Tasten, die Handys fehlen (Tab, Enter, Esc, die Pfeile). Die Seite erreicht nur diesen Entwicklungsserver, nicht die anderen Server auf diesem Computer. Wenn du zur Vorschau zurückkommst, findest du sie so vor, wie du sie verlassen hast; nach 15 Minuten, in denen niemand hinsieht, wird sie geschlossen und öffnet sich wieder, wenn du zurückkommst. **Als Bild speichern** und **Agenten zu dieser Ansicht fragen** nehmen die Seite so, wie sie auf dem Bildschirm ist.

Um die Seite selbst in deinem Browser zu haben statt gestreamt:

- Hinter Cloudflare (einem Cloudflare-Tunnel oder einem Namen, den Cloudflare weiterleitet, über https) musst du nichts einrichten: Die Vorschau zeigt die Seite selbst unter deinem Hydor-Namen auf Port 8443, den Cloudflare auch zu Hydor weiterleitet. `PREVIEW_CF_PORT` wählt einen anderen der Ports, die Cloudflare weiterleitet (2053, 2083, 2087 und 2096), und `0` schaltet das aus.
- Öffne Hydor im selben Netzwerk oder über Tailscale beziehungsweise WireGuard an der Computeradresse. Der Vorschauport ist dann direkt erreichbar.
- Gib hinter Tunnel oder Proxy dem Vorschauport einen eigenen Hostnamen, etwa preview.example.com → localhost:8791, und starte Hydor mit entsprechendem `PREVIEW_ORIGIN`.

**Als Bild anzeigen** unter **Mehr** (⋯) zeigt stattdessen Standbilder, die auf diesem Computer aufgenommen werden; **Neu laden** nimmt dann ein neues auf. Streaming und Bilder brauchen ein Chromium auf diesem Computer: das, das der Browser verwendet ([Einstellungen → Funktionen → Browser](/settings?s=browser) kann eines herunterladen). „Die Vorschau ist deaktiviert“ bedeutet, dass die App mit `PREVIEW_PORT=0` gestartet wurde. Die Vorschau gibt es nur für den Computer, auf dem du die App geöffnet hast, nicht für andere Computer, zu denen du wechselst.

## Agentenänderungen an Web-Apps prüfen

Bei Änderungen an Aussehen oder Funktion einer Web-App mit Entwicklungsserver oder HTML-Dateien zeigt der Agent Screenshots: vor der ersten Änderung alle betroffenen Ansichten und nach Abschluss dieselben erneut. Ein fehlender Entwicklungsserver wird zuerst gestartet.

Ein Agent, der Screenshots als Dateien hat (er hat sie mit einem Skript oder in einem anderen Browser aufgenommen oder sie bekommen), zeigt sie auf dieselbe Weise, in einer Karte statt als Bilder in seiner Antwort. Dafür braucht es kein Chromium auf diesem Computer, und es funktioniert auch in einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential).

- Die Screenshots einer Antwort stehen zusammen in einer Karte aus kleinen Bildern, eines für jede Ansicht. Der Agent kann die Ansichten unter eigenen Überschriften gruppieren („Einen Server hinzufügen“, „Einstellungen“). Eine Karte **Vorher** zeigt die Ansichten, wie sie waren; in einer Karte **Vorher und nachher** ist das Paar einer Ansicht mit **Vorher → Nachher** gekennzeichnet, ihr Vorher und Nachher sind in der Mitte geteilt.
- Weitere Fassungen einer Ansicht gehören zu ihrem Bild und sind keine weiteren Bilder: Ein Handy-Symbol kennzeichnet eine Ansicht, die der Agent auch in der Größe eines Handys aufgenommen hat, ein Sonne-und-Mond-Symbol eine, die er auch im dunklen und im hellen Design aufgenommen hat (wenn nur manche Ansichten beides haben). Hat eine Antwort mehr Ansichten, als in eine Reihe passen, zeigt die Karte die erste Reihe mit **Alle anzeigen** darunter (**Weniger anzeigen** klappt sie wieder ein).
- Klicke ein Bild an, um es zu prüfen: Auf einem breiten Bildschirm öffnet es sich neben der Unterhaltung, wie Seiten es tun; in einem schmaleren Fenster oder auf einem Handy über der App. Die Pfeile oben darin führen zu den anderen Ansichten der Antwort. Hat der Agent eine Notiz zur Ansicht geschrieben, steht sie oben.
- Die Computer- und Handy-Schaltflächen wechseln zwischen den Größen, die Mond- und Sonne-Schaltflächen zwischen dem dunklen und dem hellen Design, wenn der Agent beides aufgenommen hat. **Groß anzeigen** öffnet die Bilder über der App.
- Hat der Agent zu einer Ansicht ein Vorher-Bild angegeben, erscheinen ihr Vorher und Nachher übereinander: Ziehe den Schieberegler (oder drücke ← und →), um zwischen ihnen zu wischen, oder wähle **Seite an Seite**.
- **Sieht gut aus** und **Etwas ändern** setzen eine Zeile zur Ansicht ins Nachrichtenfeld, die du fertig schreiben und senden kannst.
- Auf einem breiten Bildschirm öffnet sich das Nachher einer Ansicht von selbst neben der Unterhaltung, sobald es da ist.
- Ohne Vorher-Aufnahme steht das Nachher-Bild allein mit Hinweis; der Agent wird für die nächste Änderung auf die richtige Reihenfolge hingewiesen.

Du kannst jederzeit Aufnahmen verlangen, etwa Einstellungen auf dem Smartphone oder im dunklen Design. Websites mit Systemdesign folgen der genannten Variante, sonst standardmäßig hell. Für die Unterhaltung erstellte oder in einem Projekt behaltene Seiten wie Mockups und Berichte werden dagegen wie in Hydor dunkel aufgenommen, sofern du nicht hell verlangst. So kann der Agent Lesbarkeitsprobleme prüfen. Die Bilder, die die App von einer Web-App aufnimmt, erstellt lokal ein Chromium unter [Einstellungen → Funktionen → Browser](/settings?s=browser); die, die ein Agent aus Dateien zeigt, werden in die App kopiert. In beiden Fällen bleiben sie bei der Sitzung, auch wenn der Agent seine eigenen Dateien aufräumt: Sie werden mit ihr gelöscht und bei insgesamt über 500 MB älteste zuerst bereinigt.

## Computer überwachen

Klicke auf **System** und dann auf **Überwachen** oder öffne [Überwachen](/system/monitor). Oben stehen: der Name des Computers, sein Prozessor, wie viele Threads er hat, wie lange er schon läuft und sein Betriebssystem.

Die Kacheln oben zeigen, mit einem kleinen Diagramm der letzten zwei Minuten:

- **CPU** mit Auslastung und Lastmittelwerten.
- **Arbeitsspeicher** mit belegter und gesamter Größe.
- **GPU × n** bei NVIDIA-GPUs mit durchschnittlicher Auslastung und Grafikspeicher.
- **Netzwerk** mit eingehenden und ausgehenden Daten pro Sekunde.
- **Festplatten-E/A** mit Lese- und Schreibraten.

Darunter stehen Details:

- **CPU**: ein Diagramm, die Auslastung jedes Kerns und, wenn bekannt, die Temperatur.
- **Arbeitsspeicher**: Verlauf, RAM einschließlich Cache und Puffern, Swap und verfügbarer Speicher.
- Je **GPU** Auslastung, Grafikspeicher, Leistungsaufnahme gegenüber Limit, Temperatur, Lüfter, Leistungszustand und Takt; mobil ohne Verlauf.
- **Netzwerk**: Download und Upload sowie jede Netzwerkverbindung.
- **Datenträger** mit Lese- und Schreibraten, freiem Platz, Dateisystem und Belegung je Laufwerk.
- **Sensoren** mit Temperaturen, ab 85 °C rot.
- **Notebook-Kernel** (solange welche laufen): jeder mit seiner Umgebung, seinem Zustand, seinem Speicher, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App) für sein Notebook und **Herunterfahren**.
- **Sitzungen** (solange welche laufen, unter Linux und auf einem Mac): die Programme jeder laufenden Sitzung (die ihres Agenten, die Befehle, die sie ausführt, die Server, die sie gestartet hat), die mit dem meisten Speicher zuerst, mit der Anzahl, ihrer CPU und ihrem Speicher. Rechts stehen die Limits, unter denen Sitzungen laufen: Klicke darauf, um sie zu ändern ([Jede Sitzung begrenzen](/guide/app#limit-each-session)). Klicke eine Sitzung an, um sie zu öffnen.
- **Prozesse**: die 12 aktivsten Programme nach **CPU** oder **Memory** (oder **GPU**, für die, die eine verwenden), mit Prozess-ID, Nutzer, CPU und Speicher. Zeige auf eine Zeile, um ihren vollständigen Befehl zu sehen.

Während die Seite offen ist, wird alle zwei Sekunden gemessen und ein Verlauf von zehn Minuten gespeichert.

## Einen Agenten fragen

- „Ergänze über jeder Funktion der geöffneten Datei einen Kommentar zu ihrem Zweck.“
- „Kopiere die PDFs dieser Woche aus ~/Downloads in mein Projekt Taxes 2026.“
- „Verschiebe den Lesetracker meines Projekts Abschlussarbeit in dessen Ordner notes.“
- „Fülle ~/Downloads/rental-application.pdf mit meinen Angaben aus und frage nach Fehlendem.“
- „Fasse meine Markierungen und Notizen aus ~/Papers/sparse-retrieval.pdf nach Seiten zusammen.“
- „Welche Notizen zur geöffneten Paper widersprechen ihrem Inhalt?“
- „Speichere meine Notizen zu ~/Papers/attention.pdf im Projekt Thesis.“
- „Markiere in ~/Papers/sparse-retrieval.pdf jeden Satz, der ein Ergebnis nennt, grün und schreibe dazu eine Notiz, aus welchem Experiment es stammt.“
- „Verbinde die PDFs unter ~/Documents/Scans mit dem Deckblatt zuerst und richte gedrehte Seiten auf.“
- „Welche Dateien in ~/code/shop erwähnen den Checkout, und was macht jede damit?“
- „Ergänze in ~/Documents/people.csv eine Spalte mit dem jeweiligen Anteil an der Gesamtsumme.“
- „Erstelle unter ~/code/ml ein Notebook für einen kleinen Bildklassifikator, führe es aus und richte die nötige Umgebung ein.“
- „Öffne einen Pull-Request für diesen Sitzungsbranch mit Titel und Beschreibung aus den Commits.“
- „Verknüpfe https://github.com/acme/site/pull/42 mit dieser Sitzung.“
- „Sind die Checks des Pull-Requests dieser Sitzung schon bestanden?“
- „Schreibe eine Leseführung für die Änderungen dieses Branches.“
- „Löse die Mergekonflikte in ~/code/shop-api. Erhalte die Absicht beider Seiten und erkläre deine Entscheidungen.“
- „Was hat sich diese Woche in ~/code/shop-api geändert? Fasse die Commits verständlich zusammen.“
- „Seit v2.3 ist die Suche in ~/code/shop-api langsam. Finde den verursachenden Commit.“
- „Welche Entwicklungsserver laufen gerade auf diesem Computer?“
- „Vergrößere den Button der Checkout-Seite und zeige Vorher und Nachher mobil im dunklen Design.“
- „Führe die Playwright-Tests aus, die von jeder Seite Screenshots machen, und zeige sie mir unter einer Überschrift für jeden Teil der App, die Handy-Aufnahmen neben den Computer-Aufnahmen.“
- „Was verbraucht auf diesem Computer am meisten Arbeitsspeicher?“
