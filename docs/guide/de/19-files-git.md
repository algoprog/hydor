# System: Dateien, Git, Terminal und Vorschau

**System** in der Seitenleiste bündelt die Werkzeuge dieses Computers: Dateien finden, öffnen, bearbeiten und ihre Inhalte durchsuchen, zu Projekten oder neuen Sitzungen hinzufügen, Jupyter-Notebooks ausführen, Git-Commits erstellen und pushen, Pull Requests öffnen und Branchänderungen prüfen. Dazu kommen Terminals, Vorschauen laufender Web-Apps, Vorher-nachher-Aufnahmen von Agentenänderungen und die Systemüberwachung. So kannst du Agentenarbeit innerhalb der App prüfen und abschließen.

![System → Git: Repositoryänderungen, Dateivergleich, Commitfeld und Synchronisierung](images/files-git.webp)

## System öffnen

Wähle **System** unter den Werkzeugen der Seitenleiste oder öffne [System](/system). Tabs unter dem Titel führen zu den Bereichen mit eigener Adresse:

- **Übersicht** ([öffnen](/system)): Computer und aktueller Inhalt der Werkzeuge; siehe [Übersicht](#the-overview).
- **Dateien** ([öffnen](/files)): lokale Dateien; siehe [Dateiseite öffnen](#open-the-files-page).
- **Git** ([öffnen](/git)): Repositorys; siehe [Repositorys auf der Git-Seite](#see-your-repositories-on-the-git-page).
- **Terminal** ([öffnen](/terminal)): lokale Shells; siehe [Terminal verwenden](#use-the-terminal).
- **Vorschau** ([öffnen](/preview)): laufende Web-Apps; siehe [Entwicklungsserver in der Vorschau](#look-at-a-dev-server-with-preview). Dieser Bereich erscheint nur für den aktuellen Computer, nicht beim Zugriff auf einen anderen.
- **Überwachen** ([öffnen](/system/monitor)): Auslastung; siehe [Computer überwachen](#watch-this-computer-in-monitor).
- **Experimente** ([öffnen](/system/experiments)): eigenständige Jobs, die auf freie GPUs warten und mit Ergebnissen gespeichert werden; siehe [Experimente](/guide/experiments).

Auf Smartphones zeigt der Titel den Bereich, etwa **System / Überwachen**. Tippe darauf, um alle Bereiche in Viererreihen auszuwählen. Bereichsaktionen wie **Hinzufügen** in Git oder Aktualisieren in der Vorschau stehen rechts neben dem Titel.

## Übersicht

Oben stehen Computername, Betriebssystem und Laufzeit sowie vier Anzeigen: **Prozessor**, **Arbeitsspeicher**, **Datenträger** mit freiem Platz auf dem Hauptlaufwerk und **Grafik**, sofern NVIDIA-GPUs vorhanden sind. Nahe der Kapazitätsgrenze wird die Anzeige rot. Ein Klick öffnet **Überwachen**.

Darunter öffnet jede Werkzeugkarte über Titel oder **Öffnen** den jeweiligen Tab:

- **Dateien**: Suche ab dem Benutzerordner nach Namen und Inhalten, zuletzt geöffnete Dateien sowie **Benutzerordner**, **Zuletzt verwendete Dateien** und **Papierkorb**.
- **Git**: Repositorys mit Branch und Anzahl geänderter Dateien, zuerst solche mit Änderungen oder ausstehenden Pushes. Ein Klick öffnet das Repository im Git-Tab.
- **Terminal**: laufende Shells und **Neu**.
- **Vorschau**: Web-Apps mit Port, per Klick geöffnet.
- **Experimente**: aktive Läufe mit Status und Metriken, per Klick geöffnet.

## Dateiseite öffnen

Wähle **System → Dateien** oder [Dateien](/files). Auf dem Computer gibt es zwei Bereiche:

- Links **Orte** mit zuletzt geöffneten Dateien, Benutzerordner, angehefteten Ordnern, Projektordnern, Sitzungsordnern und Papierkorb; siehe [Orte](/guide/files-git#places).
- Rechts den aktuellen Ordner und seinen Inhalt; siehe [Ordner durchsuchen](/guide/files-git#browse-a-folder). Geöffnete Dateien erscheinen als Tabs; der erste führt zum Ordner zurück.

In schmalen Fenstern steckt die Ortsauswahl im Button rechts neben dem Titel mit dem aktuellen Ordnernamen.

Auf Smartphones füllt der Ordner den Bildschirm. Sein Name rechts oben öffnet die Orte vom unteren Rand. **‹** mit dem übergeordneten Ordnernamen unter dem Titel wechselt eine Ebene hoch; die Zurück-Funktion des Smartphones zum vorherigen Ordner. Dateien öffnen eine eigene Seite mit **Zurück**.

Weitere Zugänge:

- Klicke auf den Ordner unter einem Sitzungstitel oder auf Sitzungsmenü **⋯ → Ordner und Code → Ordner durchsuchen**.
- Geänderte oder übergebene Dateien und Dateilinks in Antworten öffnen ein Fenster über der Unterhaltung. **In Dateien öffnen** wechselt zur Dateiseite, ✕ oder Esc schließt. Ungespeicherte Änderungen werden vorher abgefragt. Der Dateipfad steht darüber; ein Ordnerwechsel schließt zuerst das Fenster mit derselben Abfrage. Siehe [Erstellte oder geänderte Dokumente](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply).
- Der Projekttab **Dateien** zeigt seine eigenen Ordner; siehe [Projekte und Wissen](/guide/projects).

## Orte

- **Zu einem Ordner wechseln**: nach Namen suchen oder Pfad wie `~/code/shop` eingeben. Projekte und angeheftete Ordner stehen zuerst. Tab oder der Pfeil am Zeilenende zeigt Unterordner.
- **Zuletzt verwendete Dateien**: in diesem Browser geöffnete Dateien, neueste zuerst, mit Ordner. Nicht mehr vorhandene sind gekennzeichnet; **Nicht mehr vorhandene entfernen** bereinigt die Liste.
- **Benutzerordner**: dein persönlicher Dateiordner. Ein abweichender Standardordner neuer Sitzungen erscheint darunter.
- **Angeheftet**: auf allen Geräten gleiche Ordner. Zum Anheften nutze Ordnerkontextmenü oder **⋯ → An Orte anheften**. Zum Lösen zeige darauf und wähle ✕ oder **Aus Orten lösen**.
- **Projekte**: eigene Ordner der Projekte.
- **Sitzungsordner**: zuletzt von Sitzungen verwendete Ordner.
- **Papierkorb**: gelöschte Inhalte; siehe [Löschen und wiederherstellen](/guide/files-git#delete-and-put-back).

Auf dem Computer kannst du Dateien oder Zeilen auf einen Ordner in den Orten ziehen.

## Ordner durchsuchen

Die Leiste über dem Ordner enthält von links:

- **Übergeordneten Ordner** als Pfeil nach oben.
- Pfadschritte: Haus für den Benutzerordner, dann etwa **code › shop**. Außerhalb beginnt der Pfad bei **Computer** (`/`). Klicke auf einen Schritt oder ziehe Zeilen darauf zum Verschieben. Lange Pfade klappen mittlere Schritte unter **…** zusammen. Letzter Schritt oder Pfeil daneben öffnet **Zu einem Ordner wechseln**.
- **Suchen in** dem Ordner filtert laufend nach Namen. Enter oder **Alles in … nach „…“ durchsuchen, auch Dateiinhalte** startet eine rekursive Suche nach Namen und Inhalten; siehe [Dateien suchen](/guide/files-git#search-files).
- **Neu** mit **Neuer Ordner**, **Neue Datei**, **Neues Notebook**, **Dateien hochladen** und **Ordner hochladen**.
- **Liste** oder **Kacheln mit Bildern**. Kacheln zeigen Bildvorschauen und eignen sich für Fotos.
- **Weitere (⋯)**: Sortierung nach **Name**, **Änderungsdatum**, **Größe** oder **Typ**, umgekehrte Reihenfolge, **Versteckte Dateien anzeigen**, **An Orte anheften**, **Neue Sitzung in diesem Ordner**, **Terminal hier öffnen**, **Pfad kopieren**, **Als .zip herunterladen** und **Aktualisieren**.

Ordner stehen zuerst. Die Liste nennt Name, Änderungszeit und Größe. Zeitangaben reichen von „gerade eben“ und „vor 5 Min.“ über Uhrzeit und „Gestern“ bis Datum. Spaltenüberschriften sortieren, erneuter Klick kehrt um. In schmalen Fenstern öffnet ein Suchbutton das Feld; Listen- und Kachelwahl wandern unter **Weitere**, Datum und Größe weichen dem Namen.

- Klicke einen Ordner zum Wechseln oder seinen Pfeil zum Aufklappen im Baum. Geöffnete Unterordner bleiben je Ordner gemerkt.
- Klicke Dateien zum Öffnen.
- Die untere Zeile nennt Ordner- und Dateizahl sowie Gesamtgröße.
- Während der Anzeige wird alle fünf Sekunden aktualisiert, sodass neue Agentendateien automatisch erscheinen.

Mobil stehen Größe und Datum unter dem Namen. Suchbutton, **Weitere** mit Ansichtswechsel und **Mehrere auswählen** sowie **+** rechts unten für neue Ordner, Dateien und Uploads ergänzen die Bedienung.

Jeder Ordner hat eine eigene Adresse für die Zurück-Funktion des Browsers. Der sichtbare Ordner gilt appweit als „in Dateien geöffneter Ordner“. Er wird je Browser und getrennt für jeden verwendeten Computer gespeichert; siehe [Weitere Computer](/guide/devices#use-other-machines-from-one-app).

### Buchstaben neben Dateien

In einem Git-Repository kennzeichnen Buchstabe und Farbe Änderungen seit dem letzten Commit:

- **M**: geändert.
- **A**: neu und bereits zu Git hinzugefügt.
- **U**: neu, noch nicht von Git erfasst.
- **D**: gelöscht.
- **R**: umbenannt.
- **C**: zu lösender Konflikt.
- **•** am Ordner: darin gibt es Änderungen.

## Mit Dateien und Ordnern arbeiten

Jede Zeile hat ein Menü über **Weitere (⋯)** am Ende oder Rechtsklick; mobil über ⋯. Darin stehen:

- **Öffnen**.
- **Bild bearbeiten** beziehungsweise **Video bearbeiten**. **Speichern** im Editor überschreibt die Datei und verschiebt die alte Version in den Papierkorb; **Kopie speichern** erstellt daneben „name (edited)“; siehe [Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos).
- **Sitzung damit starten** für Dateien; siehe [Sitzung mit Dateien starten](/guide/files-git#start-a-session-with-files). Für Ordner: **Neue Sitzung in diesem Ordner** mit vorausgewähltem Arbeitsordner.
- **Zu Projekt hinzufügen**; siehe [Dateien zu einem Projekt hinzufügen](/guide/files-git#add-files-to-a-project).
- **An Orte anheften** oder **Aus Orten lösen** für Ordner.
- **Umbenennen** mit F2, **Duplizieren**, **Verschieben nach** und **Kopieren nach**.
- **Terminal hier öffnen** für Ordner: neue Shell unten im Computerfenster oder mobil auf der Terminalseite.
- **Pfad kopieren** als vollständiger Pfad.
- **Herunterladen**, bei Ordnern **Als .zip herunterladen**.
- **Löschen** mit der Entf-Taste.

### Mehrere auswählen

Für gemeinsame Aktionen wählst du mehrere Einträge:

- Am Computer über das Kästchen am Zeilenanfang beim Darüberzeigen, Strg+Klick beziehungsweise ⌘+Klick zum Ergänzen, Umschalt+Klick für einen Bereich ab der letzten Auswahl oder Strg+A für alle.
- Mobil eine Zeile gedrückt halten und weitere antippen oder **Weitere → Mehrere auswählen**.

Die Leiste zeigt Anzahl, **Sitzung starten**, **Zu Projekt hinzufügen**, **Verschieben nach**, **Löschen** und unter **Weitere (⋯)** zusätzliche Aktionen wie **Kopieren nach**, **Pfade kopieren** und **Als .zip herunterladen**. ✕ oder Esc hebt alles auf.

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

1. Wähle **Neu → Neuer Ordner**, **Neue Datei** oder **Neues Notebook**, mobil **+**.
2. Gib im neuen Listenfeld den Namen ein und bestätige mit Enter. Esc bricht ab.

Neue leere Dateien öffnen sofort im Editor. Ein Notebook heißt zunächst `Untitled.ipynb`, bei belegtem Namen `Untitled 2.ipynb`, hat eine leere Codezelle und öffnet als Notebook. Auch neue Dateien mit Endung `.ipynb` werden als leere Notebooks angelegt. Bei belegtem Namen wird nichts erstellt und ein Hinweis angezeigt.

### Umbenennen oder verschieben

- **Umbenennen** macht den Namen zum Eingabefeld. Enter übernimmt, Esc verwirft.
- **Verschieben nach** zeigt zuerst Projekte und angeheftete Ordner, dann zuletzt verwendete und ein Feld für Namen oder Pfad. Nach der Auswahl erscheint eine Meldung mit Ziel und **Rückgängig**.
- Ziehe am Computer Zeilen auf Ordner in Liste, Pfad oder Orten. Gemeinsame Auswahl wird gemeinsam verschoben. Alt, auf dem Mac Option, beim Ablegen kopiert stattdessen.

Ein Ordner kann nicht in sich selbst verschoben werden. Vorhandenes wird nicht ersetzt; bei gleichem Namen stoppt der Vorgang.

### Duplizieren und kopieren

- **Duplizieren** erstellt eine Kopie daneben mit „copy“, etwa `report copy.pdf`, danach `report copy 2.pdf`.
- **Kopieren nach** kopiert in einen Zielordner wie bei **Verschieben nach**. Namenskonflikte werden ebenso durch „copy“ gelöst. **Anzeigen** in der Meldung öffnet den Zielordner.

### Löschen und wiederherstellen

**Löschen** verschiebt eine Datei oder einen Ordner samt Inhalt sofort in den Papierkorb. Die Meldung bietet **Rückgängig**. Erst beim Leeren wird endgültig gelöscht.

**Papierkorb** unter Orte zeigt neueste Löschungen zuerst, mit Ursprungsort, Löschzeit und Größe.

- **Wiederherstellen** bringt den Inhalt an den Ursprungsort zurück. Ist der Name neu belegt, entsteht eine Kopie mit „copy“. Für alte Einträge ohne erfassten Ursprungsort wird ein Zielordner abgefragt.
- **Weitere (⋯)** bietet **In anderem Ordner wiederherstellen** und **Endgültig löschen**.
- **Papierkorb leeren** löscht nach Bestätigung alle Einträge endgültig.

Der Papierkorb liegt im App-Datenordner, etwa `~/.hydor/trash`; die Seite nennt den Pfad. Benutzerordner und Wurzelordner `/` können nicht gelöscht werden. Inhalte auf einem anderen Datenträger als der App-Datenordner lassen sich nicht dorthin verschieben; Hydor fragt zuerst nach endgültigem Löschen.

### Herunterladen

Dateien werden unverändert heruntergeladen. Ordner oder eine Mehrfachauswahl werden während des Downloads als ZIP erstellt. `.git` und `node_modules` bleiben dabei außen vor. Grenzen sind 4 GB und 65.000 Dateien.

## Dateien zu einem Projekt hinzufügen

Projekte speichern eigene Dateien im Projektordner und können weitere vorhandene Ordner einbeziehen; siehe [Projekte und Wissen](/guide/projects). So ergänzt du Inhalte:

1. Öffne das Kontextmenü einer Datei oder eines Ordners oder wähle mehrere und dann **Zu Projekt hinzufügen**.
2. Wähle das Projekt oder erstelle mit **Neues Projekt** eines.

Dateien werden in den Projektordner kopiert. Ordner werden nicht kopiert, sondern an ihrem bisherigen Ort eingebunden. Die Meldung nennt das Ergebnis und **Anzeigen** öffnet den Projekttab **Dateien**. Bereits enthaltene Inhalte bleiben unverändert.

**Zu Projekt hinzufügen** steht auch im Dateimenü des Editors, im Dateifenster über einer Sitzung, auf übergebenen Dateikarten und erstellten Bildern.

Neue Projektsitzungen erfahren, welche Dateien der Projektordner enthält und welche anderen Ordner dazugehören.

## Sitzung mit Dateien starten

So beginnt eine neue Sitzung mit ausgewählten Dateien:

1. Öffne das Dateimenü oder eine Mehrfachauswahl und wähle **Sitzung damit starten** beziehungsweise **Sitzung starten** in der Auswahlleiste.
2. Die Startseite zeigt sie im Nachrichtenfeld mit „Auf diesem Computer“. ✕ entfernt einen Eintrag, die Büroklammer ergänzt Gerätedateien. Wähle Agent und Arbeitsordner.
3. Beschreibe den Auftrag und wähle **Starten**.

Es wird nichts hochgeladen: Die Nachricht nennt die Pfade, damit der Agent die Dateien direkt öffnet. PNG, JPEG, GIF und WebP bis 5 MB gehen zusätzlich als Bild an das Modell. Höchstens 20 Dateien pro Nachricht.

Für Ordner wählt **Neue Sitzung in diesem Ordner** den Arbeitsordner der Startseite vor.

**Sitzung damit starten** steht ebenfalls im Editor-Dateimenü, im Dateifenster über Sitzungen, auf Dateikarten und erstellten Bildern.

## Dateien und Ordner hochladen

- **Neu → Dateien hochladen** oder **Ordner hochladen** lädt in den aktuellen Ordner. Mobil wählt **+ → Dateien hochladen** Dateien oder Fotos aus.
- Am Computer ziehst du Dateien oder ganze Ordner auf den aktuellen Ordner, einen Unterordner oder einen Ort. Auch leere Ordner werden übernommen.

Das Feld **Uploads** unten rechts zeigt den Fortschritt je Datei. **Abbrechen** stoppt einen Upload, ✕ entfernt abgeschlossene Einträge. Große Dateien werden in 32-MB-Teilen übertragen.

Vor der Übertragung prüft Hydor vorhandene gleiche Namen. Bei Treffern zeigt das Feld etwa „3 bereits vorhanden“ und bietet:

- **Ersetzen**: vorhandene Dateien überschreiben.
- **Vorhandene überspringen**: nur neue Dateien hochladen.
- **Abbrechen**: nichts hochladen.

## Datei öffnen und bearbeiten

Ein Klick öffnet die Datei in einem eigenen Editor-Tab. Der erste Tab führt zum Ausgangsort zurück, auch Suche, zuletzt verwendete Dateien oder Papierkorb. Die letzten zwölf geöffneten Dateien bleiben als Tabs erhalten. ✕ oder Mittelklick schließen einen Tab; **Zuletzt verwendete Dateien** listet weitere.

Über der Datei stehen Benutzerordner als Haus oder **Computer** bei externen Pfaden, dann Ordner und Dateiname. Ein Ordnerschritt öffnet ihn auf der Dateiseite mit dem nächsten Pfadschritt ausgewählt. **…** zeigt ausgelassene Zwischenordner. Der Dateiname führt über **Im Ordner anzeigen** zur ausgewählten Datei. Mobil öffnet die Ordnerzeile **Zu einem Ordner wechseln** mit allen Pfadschritten und derselben Anzeigeaktion. Den Pfad gibt es auch in den [Editoren für Word, Excel, CSV und LaTeX](#edit-word-excel-csv-and-latex-files).

Der Editor zeigt Zeilennummern, sprachabhängige Syntaxfarben, Klammerzuordnung und am Computer aufklappbare Codeblöcke und Vervollständigung. Tab rückt ein.

Speichere über **Speichern** oder Strg+S, auf dem Mac ⌘S. Ein Punkt an Name und Tab kennzeichnet ungespeicherte Änderungen. Beim Tabwechsel bleiben Text, Rückgängig-Verlauf, Cursor und Scrollposition erhalten. Das Schließen eines geänderten Tabs oder mobil **Zurück** fragt **Änderungen speichern?** mit **Speichern**, **Nicht speichern**, **Abbrechen**. Neuladen oder Schließen der Seite verliert Ungespeichertes nach Browserabfrage. CRLF-Zeilenenden bleiben beim Speichern erhalten.

### Editorwerkzeuge

Am Computer bietet die Leiste neben dem Pfad:

- **Vorschau** für Markdown mit Überschriften, Tabellen, lokalen Bildern und Dateilinks. Ein weiterer Klick bearbeitet wieder. Markdown startet in der Vorschau.
- **Als Seite anzeigen** für HTML in einem von Hydor isolierten Frame, der benachbarte Dateien laden kann. HTML startet damit. Der Seitenlink gilt eine Stunde; öffne die Datei danach erneut.
- **Änderungen seit letztem Commit** mit grünen Ergänzungen und roten Löschungen. Bei unveränderter Datei oder ohne Repository steht „Keine Änderungen“. Der Wechsel zwischen Text, Vorschau und Vergleich erhält Verlauf, Cursor und Position.
- **Zeilenumbruch**, dessen Auswahl gespeichert wird.
- **Fragen** für Fragen und Änderungsaufträge; siehe [unten](#ask-an-agent-about-the-file).
- **Terminal in diesem Ordner**.
- **Herunterladen**.
- **Weitere (⋯)** mit **Suchen**, **Ersetzen**, **Gehe zu Zeile**, **Zur Auswahl fragen**, **Tastenkürzel**, **Sitzung damit starten**, **Zu Projekt hinzufügen**, **Im Ordner anzeigen** und **Pfad kopieren**.
- **Speichern**.

Strg+F beziehungsweise ⌘F öffnet die Suchleiste bei aktivem Textcursor. Ersetzen geht mit Strg+H beziehungsweise ⌘⌥F; Zeilensprung mit Strg+G beziehungsweise ⌘⌥G.

Das Textkontextmenü über Rechtsklick, Menütaste oder Umschalt+F10 bietet Ausschneiden, Kopieren, Einfügen, Alles auswählen, Suchen, Ersetzen, Zeilensprung und **Zur Auswahl fragen**. Letzteres öffnet [Fragen](#ask-an-agent-about-the-file) mit zitierten ausgewählten Zeilen. **Weitere → Tastenkürzel** listet alle Tasten.

Unter dem Text stehen Cursorposition wie **Z. 12, Sp. 5** samt Auswahlgröße und Zeilensprung per Klick, Sprache, Einrückung **Leerzeichen: 2**, **Leerzeichen: 4** oder **Tabs**, aus der Datei erkannt und für neue Eingaben änderbar, Zeilenenden **LF** oder **CRLF** mit Wechselmöglichkeit und **Umbruch** beziehungsweise **Kein Umbruch**.

Mobil zeigt die Leiste Zurück, Dateiname und Ordner, Vorschau beziehungsweise Seitendarstellung, **Agenten fragen** als ✨, Speichern und Weitere. Im Menü liegen Suche, Zeilensprung, Auswahlfrage, Umbruch, Commitvergleich, Terminal, Download, Sitzungsstart, Projektzuordnung, Ordneranzeige und Pfad. Zeilen werden mobil standardmäßig umgebrochen.

### Einen Agenten zur Datei fragen

**Fragen** in der Leiste, mobil ✨, öffnet einen Bereich neben der Datei oder bei schmalem Fenster darüber. Beschreibe die Änderung wie „Finde und behebe Fehler“ oder „Ergänze oben eine Zusammenfassung“ oder stelle eine Frage. Beispiele helfen beim Einstieg; Agent und Modell entsprechen der letzten Startseitenauswahl.

- Ungespeicherte Änderungen werden zuerst gespeichert.
- Der Agent startet im Dateiordner, kennt die Datei und bearbeitet sie direkt. Änderungen erscheinen sofort im Editor, geänderte Zeilen kurz farbig, deine Leseposition bleibt erhalten.
- Du kannst im Bereich weiter antworten. **Neue Anfrage** beginnt neu, **Als Sitzung öffnen** zeigt die vollständige Sitzung, die auch in deiner Sitzungsliste steht. Mobil klappt **Datei ansehen** den Bereich weg; die untere Leiste holt ihn zurück.
- Der Bereich bleibt beim Tabwechsel offen, mit eigener Unterhaltung je Datei. Dies gilt ebenso für Word, Excel, CSV, LaTeX und Notebooks. Bei Notebooks bleiben Ausgaben anderer Zellen erhalten. Bei PDFs liest der Agent und beantwortet auch ausgewählte Textstellen, Gleichungen oder Abbildungen; siehe [Zu einem PDF-Ausschnitt fragen](#ask-about-a-part-of-a-pdf). Gespeichertes Modell und Berechtigungen bleiben wie beim [Fragen in der Bibliothek](/guide/library#change-it-by-asking-an-agent) unverändert.

### Änderungen an einer geöffneten Datei

Agenten und Terminals ändern Dateien laufend. Der Editor prüft alle paar Sekunden, während eines Agentenlaufs jede Sekunde:

- Ohne eigene ungespeicherte Änderungen übernimmt er den neuen Stand automatisch. Nur geänderte Zeilen werden ersetzt und kurz hervorgehoben, die Leseposition bleibt.
- Bei eigenen ungespeicherten Änderungen erscheint „Die Datei wurde seit dem Öffnen auf dem Datenträger geändert“. Wähle **Neu laden und meine Änderungen verwerfen** oder **Mit meinen Änderungen überschreiben**.

Ein neuerer Dateistand wird beim Speichern nie ohne diese Abfrage überschrieben.

### Nicht bearbeitbare Dateien

- Über 10 MB erscheint „Datei für diesen Editor zu groß“. Lade sie herunter oder öffne sie im Terminal. Notebooks dürfen bis zu 40 MB haben.
- Binärdateien werden als solche angezeigt und lassen sich herunterladen.
- Word, Excel, CSV und LaTeX haben eigene Editoren. Bilder, PDF, Video, Audio und andere Office-Dateien öffnen Vorschauen.

## Word-, Excel-, CSV- und LaTeX-Dateien bearbeiten

Diese Formate öffnen dieselben Editoren wie die [Bibliothek](/guide/library#documents). Speichern aktualisiert die Originaldatei im eigenen Format:

- **Word-Dokumente** mit .docx im Dokumenteditor auf einer Papierseite, ähnlich Word oder Google Docs.
- **Excel** mit .xlsx sowie **CSV** und **TSV** im Tabelleneditor mit Blättern und Formeln. Bei Excel auch mit Filtern, bedingter Formatierung, Dropdowns, Checkboxen, verbundenen Zellen, Notizen und Diagrammen.
- **LaTeX** mit .tex im Editor mit Quelltext und gesetzten Seiten. Eingelesene Kapitel über `\input` und Bibliografie öffnen mit; TeX liest weitere Bilder, Stile und Daten des Ordners unverändert. Kapitel öffnen das zugehörige Hauptdokument anhand `% !TEX root = …`, subfile-Angabe oder eines einlesenden Dokuments im eigenen oder bis zu zwei übergeordneten Ordnern. Das Kapitel und der [Dateibaum](/guide/library#the-files-tree) sind geöffnet: bearbeitbare Quelldateien und grau dargestellte unverändert verwendete Bilder, Stile, Klassen und Daten. Letztere bearbeitest du in Dateien. Bei schmalem Fenster öffnet **Dateien** über dem Quelltext den Baum. Kommentare funktionieren wie in [LaTeX-Bibliotheksdokumenten](/guide/library#latex-documents), werden aber getrennt anhand des Dateipfads gespeichert. **Speichern** übernimmt sie; beim Umbenennen oder Verschieben hier ziehen sie mit. Ein [zur Datei befragter Agent](#ask-an-agent-about-the-file) liest, beantwortet und erledigt Kommentare laufend. **Mit KI lösen** am Kommentar oder über **Kommentare** sendet sie sofort; siehe [Kommentare mit KI lösen](/guide/library#resolve-comments-with-ai). Versionsvergleiche gibt es für Bibliotheksdokumente.

Bearbeite wie in der [Bibliothek](/guide/library#documents), speichere unten oder per Strg+S beziehungsweise ⌘S. **Verwerfen** lädt den ursprünglichen Stand. Oben stehen Pfad, **Fragen** für [Agentenanfragen](#ask-an-agent-about-the-file), Download und Weitere. **Als Text bearbeiten** für CSV, TSV und LaTeX sowie **Als Vorschau anzeigen** für Word und Excel wechseln zur vorherigen Darstellung mit Rückkehrbutton. Außerdem gibt es Sitzungsstart, Projektzuordnung, Ordneranzeige und Pfadkopie. Aus Suchtreffern mit Zeilenangabe geöffnete Dateien starten als Text.

Erhalt beim Speichern:

- **CSV und TSV**: Unveränderte Zellen und Zeilen behalten ihren Text exakt, ebenso Trennzeichen, Anführungszeichen und Zeilenenden. CSV enthält nur Werte eines Blatts. Bei zusätzlichen Formeln, Blättern oder Formatierung fragt das erste Speichern nach; Formeln werden als Ergebniswerte gespeichert.
- **LaTeX**: Nur geänderte Dateien werden mit eigenen Zeilenenden geschrieben. Neue Editor-Dateien landen im Ordner, gelöschte im [Papierkorb](#delete-and-put-back).
- **Word und Excel**: Der Editor schreibt aus seinem unterstützten Datenmodell neu. Bei Word bleiben Kommentare, Änderungsverfolgung, Gleichungen, Inhaltsverzeichnis, Kopf- und Fußzeile erhalten. Bei Excel Filter, bedingte Formatierung, Dropdowns, Checkboxen, verbundene Zellen, Notizen, Kommentare und Diagramme. Nicht unterstützte Inhalte werden oben konkret genannt: bei Word etwa Fußnoten, Diagramme oder komplexe Kopfzeilen mit Bild oder Tabelle; bei Excel Bilder, Formen, Pivot- und formatierte Tabellen, Hyperlinks, benannte Bereiche, Makros und Zeilengruppen. Der Hinweis erklärt den Verlust beim Ersetzen. Das erste Speichern fragt nach. **Als Kopie speichern** schreibt stattdessen etwa „report (edited).docx“ daneben. Beim ersten Speichern einer Word- oder Excel-Datei geht die Originalfassung in den [Papierkorb](#delete-and-put-back), wo Wiederherstellen sie neben die neue Fassung legt.
- Zu lange Dateien zeigen nur den Anfang schreibgeschützt; **Als Text bearbeiten** oder **Als Vorschau anzeigen** zeigt alles.

Bei externen Änderungen übernimmt der Editor ohne eigene Änderungen automatisch, andernfalls fragt er wie der Texteditor nach Neuladen oder Überschreiben.

PowerPoint, alte Office-Formate, OpenDocument, RTF und EPUB öffnen die folgende Vorschau.

## Bilder, PDFs, Dokumente und Webseiten ansehen

Der Betrachter zeigt Dateien entsprechend ihrem Inhalt:

- **Bilder** wie PNG, JPEG, GIF, WebP, SVG, ICO, BMP und AVIF vollständig, mit Schachbrett hinter transparenten Flächen. **Bearbeiten** öffnet den [Bildeditor](/guide/library#edit-pictures-and-videos).
- **PDF** im Browserbetrachter mit **Markieren** für Hydors Lesemodus und Notizen; siehe [PDF lesen und markieren](#read-and-highlight-a-pdf). **Ausfüllen und unterschreiben** öffnet [Formular und Unterschrift](#fill-in-and-sign-a-pdf). Bereits markierte PDFs starten im Lesemodus.
- **Video** mit MP4, WebM, MOV und M4V sowie browserabhängig MKV und OGV im eigenen Player; siehe [Video ansehen](#watch-a-video). MP4, MOV, M4V und WebM lassen sich über **Bearbeiten** im Videoeditor öffnen. **Audio** wie MP3, WAV und OGG spielt direkt ab.
- **Office** mit PowerPoint, alten Word- und Excel-Formaten, OpenDocument, RTF und EPUB sowie über **Weitere → Als Vorschau anzeigen** auch .docx und .xlsx. Oben wählst du:
  - **Seiten** als LibreOffice-Drucklayout mit anfänglicher Aufbereitung, nur bei installiertem LibreOffice und nicht für EPUB.
  - **Text** als ausgelesenen Inhalt mit Tabellenblättern und Folien.

  Smartphones starten mit dem besser bedienbaren Textmodus. Ohne lesbare Vorschau steht „Keine Vorschau für diese Datei“; lade sie herunter.
- **Markdown und HTML** über Vorschau beziehungsweise Seitendarstellung wie oben.

**Herunterladen** steht immer in der Leiste.

### Video ansehen

Videos füllen den Betrachter im eigenen Player:

- **Wiedergabe und Pause** über mittleren oder linken unteren Button, Bildklick, Leertaste oder K. Doppelklick aktiviert Vollbild.
- **Navigation** über Zeitleiste durch Klicken und Ziehen. Darüberzeigen nennt die Zeit, der hellere Abschnitt zeigt Geladenes. ← und → springen fünf Sekunden, J und L zehn. Pos1 und Ende führen zu Anfang und Ende, 0 bis 9 zu Zehnteln. Komma und Punkt schalten pausiert Einzelbilder.
- **Ton** über Lautsprecher oder M stumm- und einschalten. Am Computer öffnet Darüberzeigen den Lautstärkeregler; ↑ und ↓ ändern ebenfalls den Pegel.
- **Tempo** über **1×** von 0,5× bis 2×, **Normal** ist 1×.
- **Schleife** wiederholt, **Bild im Bild** öffnet bei Browserunterstützung ein kleines schwebendes Fenster, **Herunterladen** speichert, **Vollbild** oder F füllt den Bildschirm. Erneut oder Esc kehrt zurück.
- Steuerelemente blenden während der Wiedergabe aus und bei Mausbewegung wieder ein. Lautstärke und Tempo bleiben für das nächste Video gespeichert.
- **Mobil** zeigt ein Tippen die Steuerung, Doppeltippen links oder rechts springt zehn Sekunden. Auf dem iPhone nutzt Vollbild den Systemplayer.
- Nicht unterstützte Formate oder Codecs, häufig MKV und AVI, zeigen „Video hier nicht abspielbar“ und Download zum Öffnen in einem Videoplayer.

## PDF ausfüllen und unterschreiben

Öffne ein PDF und wähle oben **Ausfüllen und unterschreiben**, mobil den Stift neben dem Namen. Auf den Papierseiten erscheinen Formularfelder hellblau:

- **Felder**: Text schreiben, Checkbox, Optionsfeld, Dropdown oder Listenauswahl bedienen. Schreibgeschützte oder durch eine digitale Signatur gesperrte Felder sind unveränderlich.
- **Seitenklick** platziert das gewählte Werkzeug: standardmäßig **Text**, außerdem **Häkchen**, **Kreuz** und änderbares heutiges **Datum**. Jeder Klick auf eine weitere Leerstelle erzeugt einen neuen Eintrag, auch auf gedruckten Formularen und Scans.
- **Unterschrift** setzt eine gespeicherte oder neu gezeichnete, getippte oder hochgeladene Unterschrift. **Für später speichern** übernimmt neue; siehe [Unterschriften](/guide/library#signatures). Ein Signaturfeld mit **Hier unterschreiben** positioniert sie beim Tippen darin.
- **Verschieben und skalieren**: Häkchen, Kreuz und Unterschrift ziehen, blaue Ecke zum Skalieren. Textfelder haben einen linken Griff; **A−** und **A+** ändern die Schriftgröße. Papierkorb darüber oder Entf entfernt den Eintrag.
- **Zoom** per Zwei-Finger-Geste, am Computer Strg+Mausrad oder Strg+= und Strg+−. **Auf Breite einpassen** oder Strg+0 setzt zurück.

**Speichern** erstellt „name (filled).pdf“ daneben und öffnet die Kopie. Der Pfeil bietet **Kopie daneben speichern** und **Datei ersetzen**, wobei die alte Fassung in den [Papierkorb](#delete-and-put-back) wandert. **Schließen** fragt bei Änderungen vor dem Verwerfen.

Formularwerte bleiben echte bearbeitbare Felder mit passenden Schriften, auch für Griechisch oder Chinesisch. Zusätzliche Elemente werden auf die Seiten gezeichnet. Vorhandene Dateibytes bleiben erhalten und Änderungen werden angehängt:

- Eine **digitale Signatur** bleibt bei reinem Ausfüllen vorhandener Felder gültig. Nachträglich platzierte Texte, Häkchen und Unterschriftsbilder werden in anderen Betrachtern als spätere Änderung sichtbar.
- Bei **geschützten** PDFs ohne Öffnungspasswort werden nur erlaubte Änderungen vorgenommen. Ein PDF mit Öffnungspasswort kann hier nicht ausgefüllt werden.

Grenzen:

- **XFA-Formulare** aus Adobe LiveCycle Designer lassen sich nur in Acrobat oder Reader als echte Felder ausfüllen. Auf ihre Seiten kannst du dennoch schreiben und unterschreiben.
- **Scans** haben keine Felder oder auffindbaren Wörter. Text und Häkchen werden an Klickpositionen gesetzt.
- Eine gezeichnete Unterschrift ist ein Bild, keine kryptografisch belegende digitale Signatur.
- Es gibt hier keine sichere Schwärzung. Weiße Kästen verdecken Text nur optisch; er bleibt in der Datei.

Agenten können PDFs ebenfalls ausfüllen und bearbeiten; siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice#pdfs).

## PDF lesen und markieren

**Markieren** oben im PDF, mobil der Marker neben dem Namen, öffnet Hydors Seitenansicht mit auswählbarem Text. Markierte PDFs öffnen später automatisch so, damit deine Notizen sichtbar bleiben. **Schließen** kehrt zum Browserbetrachter zurück.

- **Text markieren**: mit der Maus auswählen, mobil Wort gedrückt halten und Anfasser ziehen. Die Leiste bietet Gelb, Grün, Blau oder Rosa, **Notiz** mit Hervorhebung und Notizfeld, **Fragen** für [Agentenanfragen](#ask-about-a-part-of-a-pdf) und **Kopieren**. Getrennte Wörter an Zeilenumbrüchen werden zusammengefügt. Auswahl kann beim Lesen von einer Spalte zur nächsten reichen.
- **Abbildung oder Gleichung markieren**: **Bereich auswählen** und Rahmen ziehen, am Computer auch Alt+Ziehen. Dieselbe Leiste gilt für das gespeicherte Ausschnittbild. **Kopieren** übernimmt das Bild oder bei fehlender Browserberechtigung dessen Text.
- **Markierung ändern**: Klicke darauf für Farbe, **Notiz bearbeiten**, Fragen, Kopieren und Löschen über Papierkorb oder Entf. Die Meldung bietet Rückgängig. Darüberzeigen zeigt Notizen; ein Punkt kennzeichnet vorhandene Notizen. Erneute Textmarkierung ändert die Farbe.
- **Zoom** per Geste, Strg+Mausrad oder Strg+= und Strg+−; **Auf Breite einpassen** oder Strg+0 setzt zurück. Markierungen bleiben bei jeder Größe an der Textstelle.

Scans und seitlich gedrehter Text sind nicht auswählbar; nutze Bereichsmarkierungen. Bereits im PDF vorhandene Markierungen anderer Apps erscheinen auf der Seite, aber nicht unter **Notizen**.

### Deine Notizen

**Notizen** zeigt neben den Seiten, mobil von unten, alle Markierungen nach Seiten mit Text oder Ausschnittbild, direkt bearbeitbarer Notiz und Farbe. Ein Klick springt zur Fundstelle, Papierkorb löscht, ✨ fragt den Agenten.

Markierungen und Notizen werden getrennt nach Dateipfad gespeichert; das PDF bleibt unverändert. Beim Umbenennen oder Verschieben hier ziehen sie mit. Bei externem Verschieben, etwa durch Terminal oder Agenten, findet Hydor sie beim Öffnen anhand des Inhalts wieder. Ändert sich das PDF, etwa nach neuem LaTeX-Satz, werden Textmarkierungen anhand ihrer Wörter auch auf anderen Seiten gesucht. Nicht mehr auffindbare bleiben an der alten Position mit Hinweis.

Unter **Weitere (⋯)** in Notizen stehen:

- **In einem Projekt speichern**: ein laufend aktualisiertes [Wissensdokument](/guide/projects#memory) mit Publikationstitel, etwa „Sparse Retrieval with Learned Term Weights (notes).md“, mit Markierungstext oder Bereichshinweis und Notiz je Seite. Projektsitzungen finden es über die Suche. Das Projekt des PDF-Ordners steht zuerst. **Projektwissen öffnen** zeigt es; **Dort nicht mehr speichern** entfernt es.
- **Im PDF speichern**: echte PDF-Hervorhebungen mit zugehörigen Kommentaren für andere Anwendungen. **Kopie daneben speichern** erstellt „name (highlighted).pdf“ samt erhaltenen Notizen. **Datei ersetzen** überschreibt mit Sicherung der alten Fassung im [Papierkorb](#delete-and-put-back). Erneutes Speichern ersetzt frühere exportierte Markierungen. Bei untersagten Kommentaren oder entsprechender Zertifizierung bleiben Notizen getrennt gespeichert.
- **Alle kopieren** als Text.

### Zu einem PDF-Ausschnitt fragen

**Fragen** öffnet [Agenten fragen](#ask-an-agent-about-the-file) neben oder über dem PDF mit ausgewähltem Text oder Ausschnittbild und Seite. Wähle ein Beispiel wie „Erkläre diese Textstelle“, „Was besagt die Gleichung?“, „Wie passt das zu meinem Ansatz?“ oder „Fasse den Abschnitt zusammen“, oder schreibe selbst. Der Agent kann auch das gesamte PDF lesen. Bei laufender Dateiunterhaltung fügt Fragen den Ausschnitt stattdessen ins Nachrichtenfeld für die nächste Nachricht ein. Agenten können auf Wunsch auch alle Markierungen und Notizen lesen und zusammenfassen.

## Datei nach Namen finden

Strg+P, auf dem Mac ⌘P, öffnet auf jeder Seite **Datei suchen in …** für den aktuellen Dateiseitenordner. Gib Buchstaben in Reihenfolge ein; `invq3` findet `invoices/q3-report.xlsx`. Treffer im eigenen Dateinamen stehen zuerst. Wähle mit ↑ und ↓, öffne mit Enter oder Klick. Bis zu 60 Dateien einschließlich versteckter werden gelistet.

Auch die Suche mit Strg+K beziehungsweise ⌘K findet ab zwei Buchstaben Dateien aus demselben Ordner.

## Dateien suchen

Eine Suche durchsucht rekursiv Namen und Textinhalte unter einem Ordner. Gib den Suchtext unter **Suchen in** ein und drücke Enter oder öffne [In Dateien suchen](/search).

1. Gib den Suchtext in **Namen und Dateiinhalte durchsuchen** ein. Treffer erscheinen laufend.
2. **In** nennt zunächst den Ausgangsordner. Ein Klick wählt Projekt-, angeheftete oder Sitzungsordner, **Benutzerordner** oder einen beliebigen Ordner über Namen beziehungsweise Pfad.
3. Optionale Einschränkungen:
   - **Alle Dateitypen** wählt **Text und Notizen**, **Code**, **Daten und Einstellungen**, **Webseiten** oder **Notebooks**. Eigene Muster sind kommagetrennt möglich, etwa `*.md, *.py`; `!dist/**` schließt aus.
   - **Auch versteckte Dateien** berücksichtigt mit Punkt beginnende Namen.
   - **Groß-/Kleinschreibung beachten** vergleicht exakt. Ohne Aktivierung ignoriert eine rein kleingeschriebene Suche die Schreibweise, eine mit Großbuchstaben beachtet sie. **Regulärer Ausdruck** interpretiert Muster wie `colou?r`.

Die Treffer sind aufgeteilt:

- **Dateien mit diesem Namen**: höchstens 30, jeweils mit Ordner.
- **In Dateien**: passende Zeilen nach Datei gruppiert mit Trefferzahl. Ein Zeilenklick öffnet die Fundstelle, ein Dateiklick die Datei.

**Weitere (⋯)** je Treffer bietet Ordneranzeige, Sitzungsstart, Projektzuordnung und das übrige Dateimenü.

Die Suche steht in der Seitenadresse und bleibt bei Zurück oder Neuladen erhalten. Ausgeschlossen sind `.gitignore`-Inhalte und Dateien über 4 MB. Grenzen: 50 Treffer je Datei, insgesamt 1.000 oder 15 Sekunden, angezeigt werden je Datei zunächst 30 Zeilen. PDF, Word und andere Dokumente werden nur nach Namen gefunden. Für Inhaltssuche durch Agenten füge sie dem [Wissen](/guide/projects#shared-knowledge-documents-every-session-can-search) hinzu.

## Ein Jupyter-Notebook ausführen

Ein `.ipynb`-Notebook öffnet Zellen mit ihren Ausgaben. Oben stehen Kernelbutton, **Alle Zellen ausführen**, **Unterbrechen (I, I)**, **Kernel neu starten (0, 0)**, **Alle Ausgaben löschen**, **Notebookdatei als JSON ansehen**, Download, **Fragen** für [Dateianfragen](#ask-an-agent-about-the-file) und Speichern. Mobil liegen Neustart, **Neu starten und alle ausführen**, Ausgabenlöschen, JSON und Download unter Weitere.

Erstelle ein Notebook im Ordner über **Neu → Neues Notebook**; siehe [Datei oder Ordner erstellen](/guide/files-git#make-a-file-or-folder). Oder beauftrage einen Agenten: Er schreibt und führt es von oben aus, richtet bei Bedarf eine passende Umgebung ein und übergibt es mit vorhandenen Ausgaben als Karte.

### Ausführungsumgebung wählen

Der Kernelbutton mit Punkt und Name oder „Kein Kernel“ öffnet **Notebook ausführen mit**. Aufgelistet sind lokale Python-Umgebungen: `.venv`, `venv` oder `env` im Notebookordner oder darüber, conda, System-Python und registrierte Jupyter-Kernel auch anderer Sprachen. Jede nennt die Version. Die vom Notebook verlangte oder benachbarte virtuelle Umgebung trägt **Empfohlen**.

- **ipykernel erforderlich** bietet **Installieren**. Nach Bestätigung läuft nur `pip install ipykernel` in dieser Umgebung.
- Zellenausführung ohne Kernel startet die empfohlene Umgebung. Bei Fehler öffnet die Auswahl.
- Bei laufendem Kernel zeigt das Menü Zustand wie Start, Leerlauf, Ausführung, Neustart oder Gestoppt, Startzeit sowie Unterbrechen, Neustarten und Beenden. Der Umgebungswechsel fragt nach, weil Variablen verloren gehen.

Kernel laufen nach Schließen des Notebooks und über App-Neustarts hinweg weiter. Beim erneuten Öffnen sind zwischenzeitliche Ausgaben vorhanden. Beende sie im Kernelmenü oder unter [System](/system) bei den laufenden Kerneln.

### Zellen schreiben und ausführen

Zelltypen sind **Code**, **Text** als Markdown und **Rohtext**. Code wird angeklickt, Text per Doppelklick bearbeitet. Während der Ausführung stehen `[*]` und Dauer, danach die Ausführungsnummer wie `[3]`.

- Beim Darüberzeigen ersetzt der Startbutton die Nummer: **Ausführen (Umschalt+Enter)** startet und wechselt weiter, während der Ausführung unterbricht er den Kernel. Zellwerkzeuge sind Bearbeiten für Text, Zelltyp, Verschieben nach oben oder unten, Zelle darunter hinzufügen, Löschen und Weitere. Mobil erscheinen sie nach Antippen über der Zelle.
- Zwischen Zellen erscheinen am Computer **+ Code** und **+ Text**, ebenso unter der letzten Zelle.
- Das **Zellmenü** über Rechtsklick oder ⋯ bietet diese, alle darüber, diese und darunter oder alle darunter ausführen, nur Codezellen; Ausschneiden, Kopieren, Einfügen darüber oder darunter, Duplizieren, am Cursor teilen, mit nächster verbinden, Zellen oberhalb oder unterhalb einfügen, verschieben, Typ ändern, Ausgabe löschen, ein- oder ausklappen und Zelle löschen, jeweils mit Tastenkürzel. Kopierte, ausgeschnittene und duplizierte Zellen behalten Ausgaben. Während die App geöffnet ist, kannst du in ein anderes Notebook einfügen. Teilen und Verbinden leert die betroffenen Ausgaben.
- **Mehrfachauswahl**: Umschalt+↑ beziehungsweise ↓ oder Umschalt+Klick wählt den Bereich farbig aus. Menü, Kopieren, Ausschneiden, Duplizieren, Verbinden und D, D wirken gemeinsam. Esc hebt auf.
- **Ausgabe einklappen** über Pfeile neben der Nummer oder Menü zeigt „Ausgabe ausgeblendet“; ein Klick öffnet wieder. Der Zustand bleibt wie in Jupyter in der Notebookdatei gespeichert.
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

- Enter bearbeitet die Auswahl. ↑/↓ oder K/J wechselt, Umschalt+↑/↓ wählt mehrere.
- A/B ergänzt oberhalb beziehungsweise unterhalb. D, D löscht die Auswahl. Z stellt zuletzt gelöschte Zellen wieder her, erneut Z frühere.
- C/X kopiert beziehungsweise schneidet aus. V/Umschalt+V fügt darunter beziehungsweise darüber ein. Umschalt+M verbindet mit der nächsten Zelle oder die Auswahl. Strg+Umschalt+Enter führt diese und folgende aus.
- M, Y und R wechseln zu Text, Code und Rohtext.
- I, I unterbricht den Kernel. 0, 0 startet neu.

**Weitere (⋯)** oben bietet dieselben Ausführungsbereiche, Kernelneustart, Neustart mit Gesamtausführung, Ausgabenlöschen, **Gliederung** und **Tastenkürzel**. Gliederung zeigt mit # beginnende Textüberschriften neben den Zellen, mobil als Blatt; ein Klick springt zur Zelle. Zellaufträge während des Kernelstarts warten auf dessen Bereitschaft.

Strg+S beziehungsweise ⌘S speichert. Externe Änderungen bei eigenem ungespeichertem Stand führen zur Auswahl zwischen Neuladen und Überschreiben. **Notebookdatei als JSON ansehen** öffnet den Texteditor; **Als Notebook öffnen** kehrt zurück.

## Repositorys auf der Git-Seite

Öffne **System → Git** oder [Git](/git). Links stehen zuletzt verwendete Repositorys zuerst: aus Sitzungsordnern oder bearbeiteten Dateien sowie selbst hinzugefügte. Temporäre Orte wie `/tmp` bleiben außen vor. Ab sieben Repositorys gibt es eine Namenssuche.

Jeder Eintrag zeigt Name, Branch und mögliche Aufgaben:

- **● 3**: drei geänderte Dateien ohne Commit.
- **↑ 2**: zwei Commits zum Pushen, **↓ 1**: einer zum Pullen.
- **Merge** oder **Rebase** bei Konflikten; siehe [Mergekonflikte](/guide/files-git#when-a-merge-stops-on-conflicts).
- Rechts das Alter des letzten Commits.

**Remotes aller Repositorys abrufen** als Wolke aktualisiert die Remoteinformationen. **Aktualisieren** liest die Liste neu.

Ein Klick öffnet ein Repository daneben mit Name, Ordner, aktuellem Branch, Remotevergleich, **Synchronisieren** und ⋯. Darunter stehen **Änderungen**, **Verlauf**, **Branches** und **Stashes**. Am Computer öffnet zuletzt verwendetes automatisch. Schmale Fenster falten die Liste in den anklickbaren Titel, mobil öffnet das Repository über einer eigenen Listenseite mit Zurückpfeil.

### Repository hinzufügen

**Hinzufügen** bietet:

- **Lokalen Ordner hinzufügen**: Projektordner eingeben oder wählen. Ein Unterordner übernimmt das zugehörige Repository. Ohne Repository initialisiert **Repository hier erstellen** mit `git init` eines.
- **Von Link klonen**: GitHub-, GitLab- oder andere Git-Adresse als `https://…`, `ssh://…` oder `git@host:owner/project`. Das vorgeschlagene Ziel ist ein eigener Ordner, nach Möglichkeit unter `~/code`, noch nicht vorhanden oder leer. **Klonen** zeigt Fortschritt und läuft auch bei geschlossenem Dialog weiter. Danach öffnet das Repository.

Einträge bleiben bis **⋯ → Aus Liste entfernen** bestehen; der Ordner wird dabei nicht verändert.

## Mit dem Remote synchronisieren

Das Remote ist der gemeinsame Repositoryort, etwa GitHub. Unter dem Branch steht beispielsweise „2 zum Pushen · 1 zum Pullen · vor 5 Min. abgerufen“, **Aktuell**, **Noch nicht auf dem Remote** oder **Kein Remote**.

**Synchronisieren** ruft Remoteinformationen ab, übernimmt neue Commits und sendet eigene. Pfeile zeigen die Anzahl je Richtung, etwa **↑2 ↓1**. Bei unveröffentlichtem Branch steht **Branch veröffentlichen**; danach wird seine Remotezuordnung gespeichert.

Haben beide Seiten eigene neue Commits, fragt Hydor vor Änderungen:

- **Meine Commits darauf aufbauen** setzt deine Commits nach die des Remotes, als wären sie später entstanden. Das ergibt einen linearen Verlauf, einen Rebase.
- **Zusammenführen** verbindet beide Linien mit einem Merge-Commit; bisherige Commits bleiben unverändert.

Danach werden deine Commits gepusht. Konflikte stoppen zur [manuellen Auflösung](/guide/files-git#when-a-merge-stops-on-conflicts). Berühren uncommittete Änderungen remote geänderte Dateien, musst du sie zuerst committen oder stashen.

Das ⋯-Menü bietet einzelne Schritte:

- **Fetch** aktualisiert Remoteinformationen ohne lokale Dateiänderung. **Pull** übernimmt Commits mit derselben Rückfrage bei Abweichungen. **Push** sendet deine Commits.
- **Terminal hier öffnen**, **In Dateien anzeigen**, **Pfad kopieren**.
- **Remotes** zeigt Namen und Adressen. Ohne Remote kannst du über **Kein Remote · Hinzufügen** eine Adresse als origin hinterlegen und anschließend den Branch veröffentlichen.
- **Tags pushen**, wenn Tags vorhanden sind.

Fehler erscheinen rot mit möglichst verständlicher Erklärung und **Git-Ausgabe** für den Originaltext. Hydor fragt Git-Passwörter nicht interaktiv ab. Push und Pull nutzen lokale SSH-Keys oder gespeicherte Git-Zugangsdaten; fehlt ein nichtinteraktiver Zugang, wird dies gemeldet.

## Änderungen committen

**Änderungen** listet alle Dateien seit dem letzten Commit mit den [Statusbuchstaben der Dateiseite](/guide/files-git#what-the-letters-beside-files-mean), fettem Dateinamen, Ordner und Zeilenzahlen. Ein Klick öffnet den Vergleich daneben, mobil auf eigener Seite. **Zusammenhängend** und **Nebeneinander** wechseln bei genügend Platz zwischen untereinander und nebeneinander dargestellten Fassungen.

Es gibt keinen getrennten Staging-Schritt. Kästchen je Datei bestimmen den nächsten Commit, zunächst alle. Das obere Kästchen wählt alle oder keine; die Anzeige lautet etwa „3 von 4 im Commit“.

- **Diesen Teil verwerfen** am Änderungsblock setzt nach Rückfrage nur diese Zeilen auf den letzten Commit zurück.
- Dateimenü: Datei öffnen, In Dateien anzeigen und **Änderungen verwerfen**, bei neuen Dateien **Neue Datei löschen**. Beide fragen nach und sind nicht rückgängig zu machen. **Ignorieren** für neue beziehungsweise **Nicht mehr erfassen und ignorieren** für versionierte Dateien ergänzt `.gitignore`; Letzteres entfernt die Datei im nächsten Commit aus dem Repository, behält sie lokal.
- Das Kastensymbol über der Liste legt alle Änderungen als [Stash](/guide/files-git#put-changes-aside-with-a-stash) zurück.

Zum Committen unten:

1. Schreibe Zusammenfassung und bei Bedarf Beschreibung. **Nachricht schreiben** lässt ein Modell ausgewählte Änderungen im Stil jüngster Repository-Commits beschreiben: Claude bei angemeldetem Claude Code, sonst Codex.
2. Wähle **Commit** oder **Commit und Push** für direkten Versand, gegebenenfalls mit Branchveröffentlichung. Strg+Enter committet ebenfalls.

Nur ausgewählte Dateien gehen ein, auch wenn andernorts weitere gestagt wurden.

**Letzten Commit ändern** erscheint, solange kein Remote ihn enthält. Nach Aktivierung bearbeitest du dessen Nachricht und ergänzt ausgewählte Dateien statt eines neuen Commits. Buttons heißen entsprechend **Ändern** und **Ändern und Push**.

Ohne offene Änderungen steht **Nichts zu committen** mit dem letzten Commit zum Öffnen im Verlauf.

## Mergekonflikte lösen

Ändern beide Seiten dieselben Zeilen beim Synchronisieren, Merge oder Revert, stoppt Git und nennt den Zustand oberhalb der Tabs, etwa „Merge von origin/main nach main gestoppt: 1 Datei mit Konflikt“. Betroffene Dateien stehen dort und mit **C** unter Änderungen.

Git kennzeichnet beide Fassungen: Auf `<<<<<<<` folgt deine Fassung, auf `=======` die der anderen Seite bis zur Markierung `>>>>>>>`. Öffne die Datei, behalte den gewünschten Inhalt und entferne Markierungen. Ohne Markierungen gilt sie mit Häkchen als gelöst. Danach:

- **Agenten Konflikte lösen lassen** öffnet die Startseite mit vorausgefülltem Repositoryauftrag. Erst nach Absenden beginnt die Auflösung mit Prüfung und Erläuterung.
- **Fortsetzen** beendet nach Lösung aller Dateien den Merge-Commit oder Rebase.
- **Merge abbrechen**, entsprechend Rebase oder Revert abbrechen, stellt nach Rückfrage den Ausgangszustand wieder her. Deine Konfliktlösungen gehen dabei verloren.

Bis dahin warten Synchronisierung und Commitfeld; Fortsetzen erstellt den nötigen Commit.

## Verlauf ansehen

**Verlauf** zeigt Commits, neueste zuerst, mit Branchgraph links: Linien für Branches, Punkte für Commits, Ringe für noch nicht remote vorhandene. Labels zeigen lokale Branches mit Umrandung, Remotebranches mit Wolke und Tags, danach Nachricht, Autor und Zeitpunkt.

- **Dieser Branch** zeigt den zugehörigen Verlauf, **Alle Branches** auch andere und Remotebranches.
- **Commit suchen** findet Nachrichtenwörter, Autorennamen, Adressen und Hashes.
- **Fehlerverursachenden Commit finden** daneben startet die [Ursachensuche](#find-what-broke-it).
- **Mehr laden** öffnet ältere Commits.

Ein Commitklick zeigt vollständige Nachricht, Autor, Datum und per Klick kopierbaren Hash, Branches, Tags und geänderte Dateien mit Einzelvergleichen. Merge-Commits nennen ihre Vorgänger.

- **Erklären** öffnet die Startseite mit einem Agentenauftrag zur verständlichen Erklärung.
- **Diesen Commit rückgängig machen** erscheint beim letzten noch nicht remote vorhandenen Commit. Er wird entfernt, seine Änderungen erscheinen wieder unter Änderungen.
- Das ⋯-Menü bietet Hashkopie, Ursachensuche mit diesem funktionierenden Ausgangspunkt, **Neuer Branch von hier** mit Wechsel, **Diesen Commit taggen** mit Name wie `v1.2.0` und optionaler Nachricht, anschließend **Tags pushen**, sowie **Diesen Commit revertieren**. Ein Revert erstellt nach Rückfrage einen neuen Gegencommit; der ursprüngliche bleibt im Verlauf.

### Fehlerverursachenden Commit finden

Öffne den letzten funktionierenden Commit und die entsprechende Aktion im ⋯-Menü oder neben Commit suchen. Das Formular fragt:

- **Funktionierte bei**: ausgewählter Commit möglichst als Tag, sonst jüngster Tag. Beliebige Tags, Branches oder Commits sind möglich; die Auflösung steht darunter.
- **Fehlerhaft bei**: zunächst `HEAD`.
- **Fehlerbeschreibung** und optional **Prüfbefehl**, der bei vorhandenem Fehler scheitert.
- **Ausführen mit**: zuständiger Agent.

**Starten** öffnet eine neue Sitzung im eigenen Worktree und lässt deine Kopie unverändert. Der Agent schreibt eine Prüfung, testet beide Endpunkte, sucht mit git bisect den ersten fehlerhaften Commit, erklärt Ursache und mögliche Korrektur. Siehe [Fehlerverursachenden Commit finden](/guide/engineering#find-what-broke-it).

## Mit Branches arbeiten

Der Branchname unter dem Repository öffnet den Wechsel. Lokale Branches stehen neueste zuerst mit ↑↓ zum Remote, danach **Nur auf dem Remote**. Tippen filtert; ein neuer Name bietet **Neuer Branch „…“ von hier**. Bei uncommitteten Änderungen fragt Hydor nach. Sie ziehen mit; bei Konflikt verweigert Git den Wechsel ohne Änderung. Remotebranches werden lokal mit Tracking angelegt.

Der Tab **Branches** zeigt zuerst den aktuellen, dann weitere mit letztem Commit und Kennzeichnung **zusammengeführt**, **nur lokal**, **vom Remote entfernt** und ↑↓. **Neuer Branch** erstellt und wechselt vom aktuellen Stand. Je Branch stehen Wechseln und ⋯ bereit:

- **In deinen Branch zusammenführen** übernimmt Änderungen und stoppt bei Konflikten.
- **Mit deinem Branch vergleichen** zeigt die jeweils fehlenden Commits zum Öffnen.
- **Veröffentlichen** pusht einen bisher nur lokalen Branch.
- **Umbenennen** lässt den Remotebranchnamen unverändert.
- **Löschen** entfernt gemergte Branches sofort. Bei ungemergten nennt die Rückfrage sonst nirgends enthaltene Commits; **Trotzdem löschen** entfernt sie mit.

Unter **Nur auf dem Remote** stehen Branches ohne lokale Kopie. **Auschecken** erstellt eine lokale Trackingfassung und wechselt dorthin.

## Änderungen mit einem Stash zurücklegen

Ein Stash bewahrt uncommittete Änderungen, damit du anderes bearbeiten und später zurückkehren kannst. **Änderungen stashen** im Stashes-Tab oder über das Kastensymbol fragt nach Beschreibung und **Neue Dateien ebenfalls aufnehmen**. Danach entsprechen die Dateien wieder dem letzten Commit.

**Stashes** listet Nachricht, Ausgangsbranch, Zeitpunkt und Dateizahl. Ein Klick zeigt Inhalte je Datei:

- **Anwenden und entfernen** stellt Änderungen wieder her und löscht den Stash.
- **Anwenden** stellt sie wieder her und behält den Stash.
- Papierkorb löscht nach Rückfrage unwiderruflich.

Konflikte mit aktuellen Dateien erscheinen mit **C** unter Änderungen. Löse sie wie Mergekonflikte und committe.

## Pull Request aus einer Sitzung öffnen

Ein Pull Request bittet Repositoryverantwortliche um Übernahme eines Branches. Du kannst ihn auf GitHub oder Gitea direkt aus der Sitzung öffnen, die Änderungen erstellt hat.

Voraussetzungen:

- Konto für den Repositoryserver unter [Einstellungen → App → Quellcodeverwaltung](/settings?s=scm); siehe [GitHub- oder Gitea-Konto hinzufügen](/guide/devices#add-a-github-or-gitea-account).
- Sitzungsordner in einem Repository mit Remote und eigenem Branch. Auf dem Hauptbranch ist dies nicht möglich; starte im Worktree mit neuem Branch oder wechsle zuerst den Branch.

Ablauf:

1. Öffne Sitzungsmenü **⋯ → Ordner und Code → Pull Request öffnen**.
2. Der Dialog zeigt Branch und Ziel wie `my-branch → main on owner/repo`, Anzahl Commits und Dateien sowie Pushstatus. Noch nicht veröffentlichte Branches werden beim Öffnen gepusht.
3. Aktiviere bei Bedarf **Uncommittete Änderungen zuerst mit dem Titel als Nachricht committen**. Ohne Auswahl bleiben sie außen vor. Ohne vorhandene Commits ist die Option vorausgewählt.
4. Schreibe Titel und Markdown-Beschreibung oder nutze **Für mich schreiben**. Ein Modell liest Commits, Änderungen und Sitzungsauftrag. Mindestens ein Commit ist nötig.
5. **Entwurf** öffnet einen Draft; Gitea setzt dafür „WIP:“ vor den Titel.
6. **Pull Request öffnen** pusht den Branch, erstellt und verknüpft den PR mit der Sitzung und öffnet einen neuen Tab.

Existiert für den Branch bereits ein offener Pull Request, bietet der Dialog **Mit dieser Sitzung verknüpfen**. Andere PRs bindest du über **Vorhandenen Pull Request verknüpfen …**, Adresse und **Verknüpfen** ein.

### Pull Request verfolgen

Nach der Verknüpfung erscheinen Nummer und Zustandssymbol für offen, Entwurf, gemergt oder geschlossen in Seitenleiste und Sitzungskopf. Ein Punkt zeigt laufende, bestandene oder fehlgeschlagene Checks. Hydor prüft alle paar Minuten und meldet Merge oder abgeschlossene Checks.

Die Nummer im Kopf oder **Pull Request #12** unter Sitzungsmenü → Ordner und Code öffnet:

- **Auf GitHub öffnen**, entsprechend Gitea.
- **Änderungen prüfen**, siehe unten.
- **Jetzt prüfen** für aktuellen Zustand und Checks.
- **Verknüpfung lösen**, ohne den PR selbst zu verändern.

## Branchänderungen prüfen

Die Prüfseite zeigt sämtliche Änderungen seit dem Abzweigen vom Basisbranch, mit und ohne Commit sowie neue Dateien. Öffne Sitzungsmenü **⋯ → Ordner und Code → Änderungen prüfen**, den PR-Dialog oder im Worktree-Dialog **Änderungen prüfen**.

Oben stehen Sitzungstitel, Branch und Basis, Dateizahl und uncommittete Dateien, gegebenenfalls PR-Link sowie **Sitzung** zur Rückkehr.

Jede Datei zeigt Status A, M, D oder R, Pfad, Kennzeichnung uncommitteter Änderungen, Zeilenzahlen und Vergleich.

- **Angesehen** klappt eine gelesene Datei ein und zählt den Fortschritt. Der browserlokale Zustand gilt bis zur nächsten Dateiänderung.
- Breite Fenster zeigen links Dateiliste und Fortschrittsbalken zum direkten Springen.
- **Durch die Änderungen führen** lässt ein Modell Zusammenfassung, nachvollziehbare Lesereihenfolge und Hinweise je Datei schreiben: Kernidee, Nutzer dieser Änderung, zuletzt Tests und Dokumentation. **Geführte Reihenfolge** und **Nach Pfad** wechseln die Sortierung. Die Führung bleibt für exakt diesen Änderungsstand gespeichert.
- **Neu laden** liest die Änderungen erneut.

Noch nicht von Git erfasste neue Dateien erscheinen, wenn sie kleine Textdateien sind. Binärdateien zeigen nur einen entsprechenden Hinweis ohne Textvergleich.

## Terminal verwenden

Öffne **System → Terminal** oder [Terminal](/terminal) für echte lokale Shells. Ohne vorhandene öffnet eine im Benutzerordner.

- Jede hat einen Tab mit Ordner und laufendem Programm. **Neues Terminal (+)** öffnet ein weiteres im Benutzerordner.
- Doppelklick benennt Tabs um.
- ✕ schließt. Bei laufendem Programm fragt Hydor nach, weil Shell und gestartete Programme beendet werden.
- Ausgabelinks öffnen neue Tabs.

Terminals laufen im privaten tmux-Server der App und überstehen Seitenwechsel, Neuladen, Browserschließen und App-Neustarts. Beim Zurückkehren ist der bisherige Stand vorhanden.

Andere Arbeitsordner wählst du beim Start über Dateikontextmenü oder Ordnermenü **Terminal hier öffnen**, Editor **Terminal in diesem Ordner**, Git-Repositorymenü oder Sitzungsmenü → Ordner und Code.

### Terminalbereich

Am Computer öffnet oder schließt `` Strg+` ``, auch auf dem Mac, den unteren Terminalbereich auf jeder Seite. Es sind dieselben Terminals wie auf der Terminalseite. Ziehe die Oberkante für die Höhe; **Bereich ausblenden** schließt. Auch die Suchaktion **Terminalbereich ein- oder ausblenden** schaltet ihn. Aus anderen Seiten gestartete Terminals erscheinen dort.

### Graue Vorschläge

Am Shellprompt erscheint die wahrscheinlichste Fortsetzung deiner Eingabe grau hinter dem Cursor:

- → oder Ende übernimmt alles, Strg+→ oder Alt+→ das nächste Wort.
- Quellen sind deine früheren Befehle, zuerst aus demselben Ordner und häufige oder neue vor alten, außerdem Shellverlauf und jüngste Agentenbefehle.

Strg+Leertaste, auch auf dem Mac, oder **Vorschläge** öffnet weitere:

- frühere Befehle mit passendem Anfang;
- Ergänzungen zum aktuellen Wort, etwa Git-Befehle und Branches, Projektskripte mit `npm run …`, Make-Ziele, SSH-Hosts, Ordner und Dateien;
- nach einigen Buchstaben **Befehl für „…“ schreiben**, siehe unten.

↑ und ↓ wählen, Enter oder Klick übernimmt nur die Befehlszeile, Esc schließt. Ausgeführt wird erst durch weiteres Enter am Prompt.

Vorschläge gelten nur am Shellprompt, nicht innerhalb von Editoren oder Python. Mit Leerzeichen beginnende und nach Passwort oder Key aussehende Befehle werden nicht gespeichert. Grauen Text deaktivierst du unter [Einstellungen → App → Allgemein → Terminalvorschläge](/settings?s=general&find=Terminal%20suggestions). Die Liste mit Strg+Leertaste bleibt nutzbar.

### Befehl in Worten beschreiben

Schreibe am Prompt etwa `Finde die größten Dateien hier`, drücke Strg+Leertaste und wähle **Befehl für „Finde die größten Dateien hier“ schreiben**. Ein Modell, Claude bei angemeldetem Claude Code, sonst Codex, erstellt bis zu drei passende Befehle für Shell und Ordner mit kurzer Erklärung. Übernimm einen, prüfe ihn und führe ihn selbst mit Enter aus.

### Auf dem Smartphone

Die Terminalseite ergänzt fehlende Tasten: **Strg**, **Alt** jeweils für die nächste Eingabe, Vorschläge, ^C, ^D, ^Z, ^L, ^R, Esc, Tab, Pfeile, `|`, `/`, `-`, `~`, Pos1 und Ende. Ein unterer Terminalbereich existiert mobil nicht; andere Seiten öffnen die Terminalseite.

## Entwicklungsserver in der Vorschau ansehen

Läuft hier ein Web-Entwicklungsserver wie `npm run dev` oder Python, zeigt **System → Vorschau** beziehungsweise [Vorschau](/preview) die App auch auf anderen Geräten mit Hydor-Zugriff.

Links listet **Web-Apps** antwortende Webserver mit Projektname aus Paket oder Ordner, Port, Seitentitel, erkanntem Server wie Vite, Next.js oder Python und Arbeitsordner. **Andere Server** enthält eingeklappt APIs, Datenbanken und Ähnliches. **Anderer Port** öffnet nicht gelistete Dienste. Alle fünf Sekunden wird aktualisiert, der Aktualisierungsbutton prüft sofort.

Ein Klick zeigt die App rechts. Am Computer öffnet die erste automatisch, mobil füllt sie den Bildschirm mit **Alle Server** zur Rückkehr. Darüber:

- Zurück, Vorwärts, Neu laden und Adresszeile mit Port und Pfad. Sie folgt angeklickten Links; eigene Pfade bestätigst du mit Enter.
- **Computer**, **Tablet**, **Smartphone** für passende Breiten, mobil 390 Pixel, auf den verfügbaren Platz verkleinert.
- **Weitere (⋯)** mit **In eigenem Tab öffnen**, **Agenten zu diesem Bildschirm fragen**, **Bild speichern** und **Als Bild anzeigen** beziehungsweise **Live anzeigen**. Die Agentenfrage öffnet die Startseite mit Screenshot, App-Ordner und ergänzbarem Anfang „Zu diesem Bildschirm von …“.

### Live oder als Bilder

Die Live-Vorschau verwendet einen getrennten Port, standardmäßig 8791. Deine Hydor-Anmeldung erreicht den Entwicklungsserver dadurch nicht; Hot Reload funktioniert. Ein Browser zeigt jeweils einen Server über diesen Port; eine andere Auswahl schaltet ihn um.

Ist der Port etwa hinter einem Tunnel oder Proxy nicht erreichbar, öffnet ein Browser auf dem Hydor-Computer die App in der gewählten Größe und streamt sie interaktiv. Klicken, Schreiben, Scrollen, Einfügen und Hot Reload funktionieren. Mobil tippe und ziehe; **Schreiben** unter der Seite öffnet die Tastatur mit Tab, Enter, Esc und Pfeilen. Die Seite erreicht nur diesen Entwicklungsserver, keine anderen lokalen Dienste. Beim Wiederkommen bleibt der Stand erhalten. Nach 15 Minuten ohne Betrachter schließt die Seite und öffnet bei Bedarf neu. Bildspeicherung und Agentenfrage verwenden den aktuellen Bildschirm.

Für eine direkte statt gestreamte Seite:

- Öffne Hydor im selben Netzwerk oder über Tailscale beziehungsweise WireGuard an der Computeradresse. Der Vorschauport ist dann direkt erreichbar.
- Gib hinter Tunnel oder Proxy dem Vorschauport einen eigenen Hostnamen, etwa preview.example.com → localhost:8791, und starte Hydor mit entsprechendem `PREVIEW_ORIGIN`.

**Als Bild anzeigen** unter Weitere zeigt lokale Einzelaufnahmen; **Neu laden** erstellt eine neue. Streaming und Aufnahmen benötigen Chromium, das [Einstellungen → Funktionen → Browser](/settings?s=browser) herunterladen kann. „Vorschauen deaktiviert“ bedeutet Start mit `PREVIEW_PORT=0`. Die Vorschau gilt nur für den Computer, auf dem du Hydor geöffnet hast, nicht für umgeschaltete andere Computer.

## Agentenänderungen an Web-Apps prüfen

Bei Änderungen an Aussehen oder Funktion einer Web-App mit Entwicklungsserver oder HTML-Dateien zeigt der Agent Screenshots: vor der ersten Änderung alle betroffenen Ansichten und nach Abschluss dieselben erneut. Ein fehlender Entwicklungsserver wird zuerst gestartet.

- **Vorher** zeigt zusammengehörige Screenshots einer Antwort in einer Karte. **Vorher und nachher** zeigt Paare mit mittiger Trennung und **Vorher → Nachher**. Ein Smartphonesymbol kennzeichnet zusätzlich mobil aufgenommene Ansichten. Bei mehreren Reihen öffnet **Alle anzeigen** den Rest und **Weniger anzeigen** klappt ein.
- Ein Bildklick öffnet die Prüfung breit neben der Unterhaltung, sonst darüber. Pfeile wechseln weitere Ansichten derselben Antwort.
- Vorher und nachher liegen übereinander. Ziehe den Regler oder nutze ← und → zum Vergleich oder wähle **Nebeneinander**. Computer- und Smartphonebuttons wechseln vorhandene Größen. **Groß anzeigen** öffnet die Bilder über der App. **Sieht gut aus** und **Etwas ändern** legen einen ergänzbaren Hinweis ins Nachrichtenfeld.
- Breit öffnet eine neue Nachher-Aufnahme automatisch neben der Unterhaltung.
- Ohne Vorher-Aufnahme steht das Nachher-Bild allein mit Hinweis; der Agent wird für die nächste Änderung auf die richtige Reihenfolge hingewiesen.

Du kannst jederzeit Aufnahmen verlangen, etwa Einstellungen auf dem Smartphone oder im dunklen Design. Websites mit Systemdesign folgen der genannten Variante, sonst standardmäßig hell. Für die Unterhaltung oder Bibliothek erstellte Seiten wie Mockups und Berichte werden dagegen wie in Hydor dunkel aufgenommen, sofern du nicht hell verlangst. So kann der Agent Lesbarkeitsprobleme prüfen. Chromium unter [Einstellungen → Funktionen → Browser](/settings?s=browser) erstellt die Bilder lokal. Sie bleiben bei der Sitzung, werden mit ihr gelöscht und bei insgesamt über 500 MB älteste zuerst bereinigt.

## Computer überwachen

Öffne **System → Überwachen** oder [Überwachen](/system/monitor). Oben stehen Computername, Prozessor, Threadzahl, Laufzeit und Betriebssystem.

Die oberen Kacheln enthalten Zweiminutenverläufe:

- **CPU** mit Auslastung und Lastmittelwerten.
- **Arbeitsspeicher** mit belegter und gesamter Größe.
- **GPU × n** bei NVIDIA-GPUs mit durchschnittlicher Auslastung und Grafikspeicher.
- **Netzwerk** mit eingehenden und ausgehenden Daten pro Sekunde.
- **Datenträger-I/O** mit Lese- und Schreibraten.

Darunter stehen Details:

- **CPU**: Verlauf, Kernauslastung und bekannte Temperatur.
- **Arbeitsspeicher**: Verlauf, RAM einschließlich Cache und Puffern, Swap und verfügbarer Speicher.
- Je **GPU** Auslastung, Grafikspeicher, Leistungsaufnahme gegenüber Limit, Temperatur, Lüfter, Leistungszustand und Takt; mobil ohne Verlauf.
- **Netzwerk** mit Download, Upload und Verbindungen.
- **Datenträger** mit Lese- und Schreibraten, freiem Platz, Dateisystem und Belegung je Laufwerk.
- **Sensoren** mit Temperaturen, ab 85 °C rot.
- **Notebook-Kernel** mit Umgebung, Status, Speicher und **Beenden**, wenn aktiv.
- **Sitzungen**, unter Linux und macOS bei laufenden Sitzungen, mit deren Agentenprogrammen, Befehlen und gestarteten Servern, größter Speicherverbrauch zuerst. Anzahl, CPU und Speicher stehen dabei. Rechts lassen sich [Sitzungslimits](/guide/app#limit-each-session) ändern. Ein Klick öffnet die Sitzung.
- **Prozesse**: die zwölf aktivsten nach CPU, Arbeitsspeicher oder GPU, mit ID, Nutzer, CPU und Speicher. Darüberzeigen zeigt den vollständigen Befehl.

Während die Seite offen ist, wird alle zwei Sekunden gemessen und ein Verlauf von zehn Minuten gespeichert.

## Einen Agenten fragen

- „Ergänze über jeder Funktion der geöffneten Datei einen Kommentar zu ihrem Zweck.“
- „Kopiere die PDFs dieser Woche aus ~/Downloads in mein Projekt Taxes 2026.“
- „Fülle ~/Downloads/rental-application.pdf mit meinen Angaben aus und frage nach Fehlendem.“
- „Fasse meine Markierungen und Notizen aus ~/Papers/sparse-retrieval.pdf nach Seiten zusammen.“
- „Welche Notizen zur geöffneten Publikation widersprechen ihrem Inhalt?“
- „Speichere meine Notizen zu ~/Papers/attention.pdf im Projekt Thesis.“
- „Markiere alle Ergebnissätze in ~/Papers/sparse-retrieval.pdf grün und notiere das zugehörige Experiment.“
- „Verbinde die PDFs unter ~/Documents/Scans mit dem Deckblatt zuerst und richte gedrehte Seiten auf.“
- „Welche Dateien in ~/code/shop erwähnen Checkout und wozu?“
- „Ergänze in ~/Documents/people.csv eine Spalte mit dem jeweiligen Anteil an der Gesamtsumme.“
- „Erstelle unter ~/code/ml ein Notebook für einen kleinen Bildklassifikator, führe es aus und richte die nötige Umgebung ein.“
- „Öffne einen Pull Request für diesen Sitzungsbranch mit Titel und Beschreibung aus den Commits.“
- „Verknüpfe https://github.com/acme/site/pull/42 mit dieser Sitzung.“
- „Sind die Checks des Pull Requests dieser Sitzung schon bestanden?“
- „Schreibe eine Leseführung für die Änderungen dieses Branches.“
- „Löse die Mergekonflikte in ~/code/shop-api. Erhalte die Absicht beider Seiten und erkläre deine Entscheidungen.“
- „Was hat sich diese Woche in ~/code/shop-api geändert? Fasse die Commits verständlich zusammen.“
- „Seit v2.3 ist die Suche in ~/code/shop-api langsam. Finde den verursachenden Commit.“
- „Welche Entwicklungsserver laufen gerade auf diesem Computer?“
- „Vergrößere den Button der Checkout-Seite und zeige Vorher und Nachher mobil im dunklen Design.“
- „Was verbraucht auf diesem Computer am meisten Arbeitsspeicher?“
