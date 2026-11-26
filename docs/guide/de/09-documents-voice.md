# Dokumente, Bilder, Videos und Sprache

Agenten in Hydor lesen PDFs, Word-, Excel-, PowerPoint- und andere Dokumente, erstellen neue für dich und übergeben sie als Karten, die du öffnen oder herunterladen kannst. Außerdem können sie Bilder, Zeichnungen, Diagramme und kurze Videos erstellen, kostenlose Fotos finden, deine Bilder und Videos bearbeiten (zuschneiden, freistellen, Objekte entfernen, kürzen) sowie Songs, Sprachaufnahmen und Geräusche erzeugen – mit Bild-, Video- und Audiomodellen und Tools auf diesem Computer. Was sie erstellen, kannst du in den Dateien eines Projekts aufbewahren. Und du kannst sprechen, statt zu tippen, dir Antworten vorlesen lassen oder freihändig mit der App reden, während du unterwegs bist.

![Ein Agent, der einen Bericht gelesen und eine einseitige Zusammenfassung als Word-Dokument sowie eine Tabelle mit Diagramm erstellt hat](images/documents-voice.webp)

## Einem Agenten ein Dokument zum Lesen geben

Jeder Agent, den die App ausführt, kann Dokumente lesen: Claude Code, Codex, Custom und die Agenten, die ACP sprechen und MCP-Server nutzen. Du musst vorher nichts umwandeln. Gib ihm das Dokument auf eine dieser Arten:

1. **An deine Nachricht anhängen**: die Büroklammer (**Dateien anhängen**) im Nachrichtenfeld, oder zieh die Datei auf das Feld, oder füge sie ein. Bilder gehen als Bilder an das Modell; jede andere Datei wird auf dem Computer gespeichert, auf dem Hydor läuft, und ihr Pfad wird deiner Nachricht hinzugefügt, damit der Agent sie öffnen kann. Eine Nachricht kann bis zu 25 MB an Dateien enthalten.
2. **Eine Datei auf diesem Computer nennen**: „Fasse ~/Documents/lease.pdf zusammen.“ Ein Pfad, der nicht mit `/` oder `~` beginnt, beginnt im Ordner der Sitzung.
3. **Dokumente in einem Projekt oder im Gemeinsamen Wissen aufbewahren**, damit Sitzungen sie durchsuchen und die Seite angeben können: siehe [Projekte und Wissen](/guide/projects).

Während der Agent liest, zeigt seine Arbeit **Lese lease.pdf**, danach **lease.pdf gelesen**. Auf einem breiteren Bildschirm steht in der Zeile außerdem, um was für ein Dokument es sich handelt (die Art, seine Seiten, Blätter oder Folien) und welche Zeilen gelesen wurden. Klicke auf die Zeile, um den Text zu sehen, den der Agent erhalten hat, und auf **lease.pdf öffnen**, um die Datei selbst zu sehen.

Ein langes Dokument wird in Teilen gelesen, etwa 1.200 Zeilen auf einmal, und der Agent erfährt, wenn es mehr gibt. Agenten wird gesagt, dass sie das, was in einem Dokument steht, als Information behandeln sollen, nicht als Anweisung. Nichts in einem Dokument wird ausgeführt: Makros laufen nie, und nur Web- und Mail-Links bleiben erhalten.

Custom liest auch PDFs, Office-Dokumente und Bilder mit seinem normalen Dateilesen: siehe [Custom, der eigene Agent der App](/guide/custom).

## Was Agenten in einem Dokument lesen können

### PDF

- Den Text jeder Seite, so angeordnet wie auf der Seite.
- Das funktioniert am besten mit dem Programm pdftotext (in poppler-utils). Ohne es lädt die App einmalig pdf.js herunter (etwa 35 MB, dafür braucht es beim ersten Mal Internet), und die Anordnung stimmt nur ungefähr.
- Gescannte Seiten haben keinen Text, und der Agent erfährt, welche das sind („Seiten 3, 5–7 haben keinen Text“). Mit dem Skill **pdf** sieht er sich diese Seiten dann als Bilder an und liest sie selbst oder führt OCR darauf aus, wenn tesseract installiert ist.
- Ein mit einem Passwort gesperrtes PDF kann nicht gelesen werden. Gib dem Agenten das Passwort, und der Skill **pdf** erstellt eine entsperrte Kopie. Ein PDF, das ohne Passwort geöffnet werden kann, aber Änderungen einschränkt (viele amtliche Formulare), wird wie jedes andere gelesen.
- **Formulare**: Der Agent listet die Formularfelder eines PDFs auf, jeweils mit den Wörtern, die daneben gedruckt stehen (sie verraten, wofür ein Feld namens „f1_02“ gedacht ist), und sieht sich die Seiten als Bilder an, auf denen die Felder nummeriert sind und ein Lineal in Punkten eingeblendet ist.
- **Deine Markierungen und Notizen**: das, was du im Reader von Dateien markiert hast, Seite für Seite, mit deinen Notizen und Bildern der Abbildungen und Formeln, die du ausgewählt hast ([PDF lesen und markieren](/guide/files-git#read-and-highlight-a-pdf)), damit er sie zusammenfassen oder mit dem Paper abgleichen kann. Auf Wunsch markiert er auch selbst Wörter für dich, die dann im Reader erscheinen.

### Word, Excel und PowerPoint

- **Word** (.docx sowie die Makro- und Vorlagenvarianten): Überschriften, Absätze, nummerierte und Aufzählungslisten, Tabellen, Links, Textfelder, Bilder anhand ihrer Beschreibung, Fußnoten, Endnoten und Kommentare.
- **Excel** (.xlsx sowie die Makro- und Vorlagenvarianten): jedes Blatt als Tabelle mit Zeilennummern und Spaltenbuchstaben, Zahlen ungefähr wie formatiert (Datumsangaben, Prozente, Geldbeträge) und bis zu 40 Formeln pro Blatt. Ausgeblendete Blätter sind gekennzeichnet. Von jedem Blatt werden die ersten 2.000 Zeilen und 60 Spalten geliefert, und der Agent erfährt, wenn es mehr gibt; um ein größeres Blatt ganz zu lesen, lädt der Skill **Tabellen** es auf andere Weise.
- **PowerPoint** (.pptx sowie die Makro-, Vorlagen- und Bildschirmpräsentationsvarianten): Titel, Text, Tabellen, Bilder (anhand ihrer Beschreibung), Diagramme (Titel und Datenreihen) und Sprechernotizen jeder Folie. Ausgeblendete Folien sind gekennzeichnet. Bis zu 1.000 Folien.

### OpenDocument, EPUB, CSV und RTF

- **OpenDocument** (LibreOffices eigene Formate .odt, .ods und .odp, ihre Vorlagen sowie .odg): Text mit Überschriften, Listen, Tabellen, Links und Fußnoten; Blätter, wie sie angezeigt werden; Folien mit Titeln, Text und Notizen.
- **EPUB**-Bücher: die Kapitel in Lesereihenfolge, mit Überschriften, Listen, Tabellen und Zitaten.
- **CSV**- und **TSV**-Tabellen sowie **RTF**-Text.

### Alte Office-Dateien, gesperrte Dateien und sehr große Dateien

- Alte .doc-, .xls- und .ppt-Dateien werden über LibreOffice gelesen, das sie zuerst in das aktuelle Format umwandelt. Ohne LibreOffice können sie nicht gelesen werden, und der Agent soll dich um die Datei als .docx, .xlsx oder .pptx bitten oder darum, LibreOffice zu installieren.
- Mit einem Passwort gesperrte Word-, Excel- und PowerPoint-Dateien können nicht gelesen werden.
- Dateien bis 300 MB werden gelesen. Ein Dokument liefert bis zu etwa 1.000.000 Zeichen Text (etwa 250.000 Tokens); darüber hinaus wird es gekürzt, und der Agent erfährt es.

## Einen Agenten ein Dokument erstellen lassen

Die App enthält vier Dokument-Skills, die jeder Agent laden kann: **word-documents**, **spreadsheets**, **presentations** und **pdf**. Du findest sie unter [Einstellungen → Skills](/settings?s=skills&find=Built%20in), unter **Dokumente** (siehe [Skills](/guide/skills)). Du wählst sie nicht aus: Bitte einfach in normalen Worten darum („Erstelle aus meinen Notizen einen einseitigen Lebenslauf als Word-Dokument“, „Trage diese Ausgaben in eine Tabelle mit Monatssummen und einem Diagramm ein“, „Erstelle 8 Folien für meinen Vortrag über Bienen“, „Füge diese drei PDFs zusammen“), und der Agent lädt den passenden Skill, wenn die Aufgabe es verlangt.

Jeder Skill funktioniert auf die gleiche Weise:

1. Der Agent plant zuerst das Dokument: seine Gliederung, Blätter oder Folien.
2. Er schreibt die Datei mit einem kurzen Skript im Ordner der Sitzung.
3. Er sieht sich das Ergebnis als Seitenbilder an, prüft auf Text, der über die Seite hinausläuft, Tabellen, die nicht passen, und überfüllte Folien und behebt, was nicht stimmt.
4. Er übergibt die Datei als Karte unter seiner Antwort, mit einer kurzen Beschriftung (siehe [Dateien öffnen oder herunterladen, die ein Agent erstellt hat](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Wenn er eine Datei von dir ändert, speichert er das Ergebnis unter einem neuen Namen, es sei denn, du hast darum gebeten, deine Datei zu überschreiben.

Was Agenten erstellen, bleibt auf deinem Computer: eine Datei im Ordner der Sitzung oder eine Seite, ein Dokument, eine Präsentation oder eine Tabelle, die in der App aufbewahrt wird. Sie legen es nicht in einem externen Dienst ab (einem claude.ai-Artefakt, einem ChatGPT-Canvas, Google Docs) und antworten auch nicht mit einem Link darauf, es sei denn, du bittest darum oder die Aufgabe erfordert es. Die Artefakte von Claude Code und dessen claude.ai-Docs-Connector sowie die Artefakte von Codex sind in den Sitzungen, die Hydor ausführt, abgeschaltet.

### Word-Dokumente

Berichte, Briefe, Lebensläufe, Memos, Verträge, Formulare, Handouts und Notizen, die du in Word, Google Docs oder Pages öffnen kannst.

- Echte Struktur: Überschriften (die im Navigationsbereich von Word und mit Screenreadern funktionieren), Aufzählungs- und nummerierte Listen, Tabellen mit Kopfzeile, Bilder und Seitenumbrüche.
- Ein Inhaltsverzeichnis (Word füllt es beim Öffnen der Datei aus), Seitenzahlen („Seite 1 von 3“), Links und schattierte Tabellenzellen.
- A4 oder US Letter und Schriftarten, die auf jedem Computer gleich aussehen (Calibri, Arial, Cambria, Times New Roman).
- Deine eigenen Dokumente werden direkt geändert, wobei Stile, Kopfzeilen und Layout erhalten bleiben; Text wird ersetzt, ohne die Formatierung zu verlieren; Kommentare werden hinzugefügt.
- Mit deiner gespeicherten Unterschrift unterschrieben: anstelle von {{signature}}, direkt nach Wörtern wie „Unterschrift:“, in einer Tabellenzelle oder am Ende, sobald du es auf einer Karte erlaubst ([Unterschriften](/guide/library#signatures)).
- Auch als PDF, über LibreOffice.

### Tabellen

Budgets, Tracker, Zeitpläne, Rechnungen und Datentabellen (.xlsx).

- Deine Zahlen als Werte und die Ergebnisse als Formeln, sodass du eine Zahl ändern kannst und der Rest sich anpasst.
- Zahlenformate für Geld, Prozente und Datumsangaben; eine fette Kopfzeile, die im Blick bleibt; Spaltenbreiten; Filter für Listen.
- Balken-, Linien- und Kreisdiagramme neben den Daten.
- Eine Prüfung jeder Formel. Ist LibreOffice installiert, berechnet die Prüfung die Formeln und listet Fehler auf (#REF!, #DIV/0!, #NAME?), die der Agent dann behebt.
- Deine eigenen Arbeitsmappen werden geändert, wobei Formeln, Stile und der Großteil des Layouts erhalten bleiben (Pivot-Tabellen bleiben nicht erhalten, Diagramme nur, wenn der Agent sie neu erstellt). Auf Wunsch stattdessen eine CSV-Datei.

### Präsentationen

Pitch-Decks, Vorträge, Lektionen und Zusammenfassungen (.pptx), die du in PowerPoint, Keynote oder Google Slides zeigen kannst.

- Saubere 16:9-Folien mit durchgehend einheitlichem Aussehen und deiner Markenfarbe: eine Titelfolie, Aufzählungen mit Ebenen, zwei Spalten, auf die Folie angepasste Bilder, Tabellen, Diagramme (Säulen, Balken, Linien, Kreis, gestapelt), Abschnittsfolien und Sprechernotizen für das, was du sagst.
- Eine Idee pro Folie, mit Titeln, die die Aussage nennen („Umsatz um 12 % gestiegen“), meist 6 bis 12 Folien für einen Vortrag.
- Bilder von dir, aus dem Web oder mit einem Bildmodell erstellt (siehe [Agenten Bilder erstellen lassen](/guide/documents-voice#let-agents-make-images)).
- Ein neues Deck auf deiner eigenen Vorlage oder dein Deck geändert, wobei Design und Layouts erhalten bleiben.
- Ein PDF der Folien, über LibreOffice.

### PDFs

Berichte, Rechnungen, Zertifikate, Flyer, Briefe und Formulare.

- Überwiegend Text oder etwas, das du bearbeiten willst: Der Agent erstellt ein Word-Dokument und daraus mit LibreOffice ein PDF.
- Exakt gestaltet (Rechnungen, Zertifikate, Tickets, Formulare): Er zeichnet das PDF direkt.
- Folien oder eine Tabelle als PDF: mit dem passenden Skill erstellt und dann in ein PDF umgewandelt.
- **Ein Formular ausfüllen**: seine Felder nach Namen (Text, Häkchen, Auswahlfelder, auch in Griechisch, Chinesisch oder jeder anderen Schrift), sodass jeder Viewer sie anzeigt und sie dort weiterhin geändert werden können; oder, bei einem Formular, das nur aus gedruckten Linien und Kästchen besteht, die Wörter, die neben die gedruckten Wörter („Geburtsdatum:“) auf die Seite geschrieben werden, und Häkchen in den Kästchen; bei einem gescannten Formular, in dem es keine Wörter zu finden gibt, dort, wo der Agent die Leerstellen in einem Bild der Seite sieht. Der Agent fragt dich nach dem, was er nicht weiß, und sieht sich die Seiten davor und danach an. Ein digital signiertes Formular bleibt gültig, wenn nur seine Felder ausgefüllt werden. XFA-Formulare (Adobe LiveCycle) lassen sich nur in Adobes eigenen Apps ausfüllen: Der Agent sagt das und kann trotzdem auf ihre Seiten schreiben.
- **Auf Seiten schreiben**: Wörter, Häkchen und Kreuze, Bilder, weiße Kästen über dem, was dort steht (sie verbergen Wörter nur für das Auge: Die Wörter bleiben in der Datei, das ist also keine Schwärzung), Umrisse und Linien sowie Markierungen und Kommentare als echte PDF-Elemente, die andere Viewer auflisten und entfernen können.
- **Seiten ändern**: drehen, löschen, verschieben, leere Seiten einfügen, PDFs zusammenführen, einige Seiten in eine eigene Datei übernehmen oder ein PDF in mehrere aufteilen. Eine so geänderte Datei kann keine digitale Signatur behalten, und der Agent sagt das.
- Was der Agent schreibt, kommt in eine Kopie neben der Datei („Name (ausgefüllt).pdf“), es sei denn, du bittest darum, die Datei selbst zu ändern; dann kommt ihre alte Version in den Papierkorb. Du kannst ein PDF auch selbst ausfüllen und unterschreiben: [Ein PDF ausfüllen und unterschreiben](/guide/files-git#fill-in-and-sign-a-pdf).
- Große blasse Wörter wie ENTWURF quer über jeder Seite und eine Kopie ohne Passwort (du gibst das Passwort an), mit dem Skill **pdf**.
- Mit deiner gespeicherten Unterschrift unterschrieben, neben Wörtern auf einer Seite oder an einer Stelle, die er dir vorher zeigt, sobald du es auf einer Karte erlaubst; dem PDF hinzugefügt, ohne zu ändern, was darin stand ([Unterschriften](/guide/library#signatures)).
- Office-Dateien in PDFs umgewandelt.

### Was der Computer braucht

Das betrifft den Computer, auf dem Hydor läuft, nicht das Gerät, von dem aus du es nutzt.

- **Python 3** mit seinem venv-Modul: nötig, um Dokumente zu erstellen. Beim ersten Mal installieren die Skills einige Python-Bibliotheken für Office-Dateien und PDFs in einen privaten Ordner der App (etwa 30 MB, einmalig, aus dem Internet); systemweit wird nichts installiert. Fehlt Python, nennt dir der Agent den einen Befehl, den du ausführen musst (unter Debian oder Ubuntu `sudo apt install python3 python3-venv`; auf einem Mac `brew install python`).
- **LibreOffice** (optional): Vorschauen als gestaltete Seiten im Dateibetrachter, Lesen alter .doc-, .xls- und .ppt-Dateien, Agenten, die Office-Dokumente als Seiten ansehen, Formelprüfungen und PDFs aus Office-Dateien. Unter Debian oder Ubuntu: `sudo apt install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui`; auf einem Mac: `brew install --cask libreoffice`.
- **poppler-utils** (optional): das beste PDF-Lesen sowie Bilder von PDF-Seiten für Agenten und für **Ausfüllen und unterschreiben**. Ohne sie zeichnet die App sie mit dem, was der Computer hat (die eigene PDF-Darstellung von Mac oder Windows), oder mit dem Browser aus **Einstellungen → Browser**. Unter Debian oder Ubuntu: `sudo apt install poppler-utils`; auf einem Mac: `brew install poppler`.
- **tesseract** (optional): OCR für gescannte PDFs.

Ohne LibreOffice oder poppler-utils lesen Agenten ihre Dateien als Text zurück, um sie zu prüfen, und halten das Layout einfach.

## Von einem Agenten erstellte Dateien öffnen oder herunterladen

Wenn ein Agent Dateien für dich erstellt hat (ein Dokument, eine Tabelle, Folien, ein PDF, Bilder, ein Archiv), übergibt er sie als Karten unter seiner Antwort, bis zu 12 auf einmal. Jede Karte hat:

- ein Symbol je nach Typ, in dessen Farbe (Word blau, Excel grün, PowerPoint orange, PDF rot), oder ein kleines Bild bei einem Bild;
- den Namen der Datei, was sie ist und ihre Größe („Word-Dokument · 24 KB“);
- die Beschreibung des Agenten („Das Budget, ein Blatt pro Quartal“);
- **Öffnen**, eine Download-Schaltfläche und **Mehr** (⋯).

**Öffnen** zeigt die Datei im Dateibetrachter, in einem Fenster über der Unterhaltung, die an ihrer Stelle bleibt (auf einem Smartphone fährt das Fenster vom unteren Bildschirmrand herauf). **In Dateien öffnen** oben im Fenster bringt die Datei auf die Seite „Dateien“; das Kreuz oder die Escape-Taste schließt das Fenster. Auf einem Computer macht **Vollbild** (das Pfeil-Symbol links von **Mehr**) das Fenster so groß wie die ganze App, wie beim Bereich neben der Unterhaltung, und **Vollbild beenden** an seiner Stelle bringt es wieder auf seine Größe. Die nächste Datei öffnet sich so, wie du die letzte verlassen hast, im Vollbild oder nicht; dein Browser merkt sich das. Über der Datei steht ihr Pfad, wie auf der Seite „Dateien“ ([Eine Datei öffnen und bearbeiten](/guide/files-git#open-and-edit-a-file)); ein Ordner darin öffnet sich im selben Fenster, mit der dort ausgewählten Datei (vorher wird nach nicht gespeicherten Änderungen gefragt), und **‹** oben im Fenster führt zurück zur Datei. Die Download-Schaltfläche speichert die Datei auf deinem Gerät.

**Mehr** (⋯), auf einer Karte und oben im Fenster, enthält **Sitzung damit starten** (die Startseite, mit der Datei im Nachrichtenfeld), **Zu einem Projekt hinzufügen** (kopiert sie in den Ordner eines Projekts), **Kopie behalten** (bei einem Jupyter-Notebook, einer PowerPoint-Präsentation, einem Word- oder Markdown-Dokument, einer Tabelle oder einer LaTeX-Datei: eine Kopie, die als eigenes Dokument in ihrem Editor erhalten bleibt, in den Dateien des Projekts, das du auswählst, wenn du Projekte hast, sonst in denen der Sitzung), **In Dateien anzeigen** (auf einer Karte), **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App; siehe [Mit Dateien und Ordnern arbeiten](/guide/files-git#work-with-files-and-folders)) und **Pfad kopieren**. Siehe [Eine Sitzung mit Dateien starten](/guide/files-git#start-a-session-with-files) und [Dateien zu einem Projekt hinzufügen](/guide/files-git#add-files-to-a-project).

Eine Datei, die seither gelöscht oder verschoben wurde, erscheint als **Nicht mehr vorhanden**. Nennt ein Agent eine Datei, die es nicht gibt, siehst du „Dateien konnten nicht angezeigt werden“ mit der Begründung, und der Agent wird angewiesen, den Fehler zu beheben.

### Dokumente, die er erstellt oder geändert hat, und Dateinamen in seiner Antwort

Unter der Antwort eines Agenten erscheinen die Dokumente, die er in diesem Durchgang erstellt oder geändert hat, jedes Mal als Karten, ob er sie übergeben hat oder nicht: PDF-, Word-, Excel-, PowerPoint- und OpenDocument-Dateien, CSV- und TSV-Tabellen, LaTeX, Jupyter-Notebooks, EPUB und Markdown. Das sind die Dateien, die seine Änderungen geschrieben haben, und die, die seine Befehle im Ordner der Sitzung erzeugt haben, während der Durchgang lief (jene, die der Durchgang nennt oder die neben einer von ihm geänderten Datei liegen: andere Sitzungen, die im selben Ordner arbeiten, fügen ihre nicht hinzu).

- Jede Karte zeigt **Neu** oder **Aktualisiert**, mit Art und Größe, und hat **Öffnen**, eine Download-Schaltfläche und **⋯**, wie die Karten oben.
- Fertige Dokumente (ein PDF, eine Word-Datei …) stehen vor ihren Quellen (LaTeX, Markdown, Tabellen). Die ersten vier werden angezeigt; **N weitere Dokumente anzeigen** zeigt den Rest, und **Weniger anzeigen** klappt sie wieder zusammen.
- Eine Datei, die der Agent übergeben hat, behält ihre eigene Karte und Beschreibung und wird nicht doppelt angezeigt. Eine Datei, die nicht mehr vorhanden ist, wird weggelassen. Bilder, Code- und Datendateien werden so nicht angezeigt (Bilder übergibt ein Agent weiterhin).
- Auf einem breiten Bildschirm wird ein Dokument auch neben der Unterhaltung angezeigt: Die Bereichsschaltfläche auf seiner Karte (**Neben der Unterhaltung öffnen**) öffnet es dort, und die Karte des angezeigten Dokuments ist umrandet. Wenn eine Runde nur ein Dokument erstellt oder ändert, öffnet es sich dort von selbst ([Die Entstehung einer Seite verfolgen](/guide/library#watch-a-page-as-it-is-written)). Ein dort oder im Fenster geöffnetes Dokument zeigt jede Änderung, die der Agent daran vornimmt, beim Schreiben.

Dateinamen und Pfade in einer Antwort sind Links. Ein Name oder Pfad in Code (`report.tex`, `docs/report.pdf`, `src/app.ts:42`, was an dieser Zeile öffnet), ein absoluter Pfad oder ein Pfad mit `~/` im Text und ein Link auf eine Datei öffnen die Datei in dem Fenster über der Unterhaltung, so wie das **Öffnen** einer Karte. Ein einzelner Name öffnet die Datei der Unterhaltung mit diesem Namen; ein Pfad, der nicht an der obersten Ebene beginnt, gilt ab dem Ordner der Sitzung.

## Ein Dokument im Dateibetrachter ansehen

Der Dateibetrachter zeigt Dokumente von einer Karte, von der Seite „Dateien“ oder von einem Link in einer Antwort (siehe [Dateien, Git, Terminal und Vorschau](/guide/files-git)).

- **PDFs** werden unverändert angezeigt, in der PDF-Ansicht des Browsers, mit **Ausfüllen und unterschreiben**, um sie auszufüllen und zu unterschreiben ([Ein PDF ausfüllen und unterschreiben](/guide/files-git#fill-in-and-sign-a-pdf)).
- **PowerPoint**-Dateien (.pptx sowie die Varianten mit Makros, als Bildschirmpräsentation und als Vorlage) öffnen sich auf **Folien**: „Die Folien, wie die App sie zeichnet“. Jede Folie wird so angezeigt, wie sie aussieht, wie bei einer behaltenen Präsentation (mit Bildern, Formen, Tabellen, Diagrammen, Hintergrund und Fußzeile an ihrem Platz), untereinander, mit Nummer und Sprechernotizen, auch auf dem Smartphone. Eine Schriftart, die die Präsentation verwendet und die diesem Computer fehlt, wird durch eine andere ersetzt; braucht diese mehr Platz, wird der Text in einem Feld etwas kleiner gemacht, damit nichts abgeschnitten wird. **Text** („Die Wörter und Sprechernotizen“) zeigt den Text der Folien, und **Seiten** zeigt sie so, wie LibreOffice sie setzt, wenn es installiert ist. Können die Folien nicht gezeichnet werden, öffnet der Betrachter **Text** und nennt den Grund.
- **Word-, Excel-, PowerPoint-, OpenDocument-, EPUB- und RTF**-Dateien (auch alte .doc-, .xls- und .ppt-Dateien) werden als Vorschau angezeigt. Ist LibreOffice installiert, bietet ein Schalter oben zwei Ansichten:
  - **Seiten**: „So, wie LibreOffice sie setzt“, jede Seite so, wie sie gedruckt würde. Beim ersten Mal dauert es einen Moment („Seiten werden gesetzt …“); danach öffnen sich die Seiten sofort, bis sich die Datei ändert.
  - **Text**: „Text, Tabellenblätter und Folien“, so, wie die App sie liest. Ein Textdokument erscheint als Papierseite; eine Arbeitsmappe als Raster mit Spaltenbuchstaben, Zeilennummern und einem Tab für jedes Blatt unten (ausgeblendete Blätter sind mit einem durchgestrichenen Auge markiert); Folien als Karten, jeweils mit Nummer und den Sprechernotizen darunter. Bilder erscheinen als Kasten mit ihrer Beschreibung. Eine Zeile oben weist darauf hin, wenn etwas weggelassen wurde („Zeigt die ersten 1.000 Zeilen“).
- Ohne LibreOffice gibt es nur die Ansicht **Text**. EPUB-Bücher öffnen sich immer darin.
- Auf einem Smartphone öffnet sich die Vorschau auf **Text** (eine PowerPoint-Datei auf **Folien**), was sich auf einem kleinen Bildschirm besser scrollen und zoomen lässt; der Schalter zeigt die Seiten.

Kann LibreOffice eine Datei nicht setzen, sagt der Betrachter das, und ihr Text ist weiterhin unter **Text** zu finden. Eine Datei ohne Vorschau zeigt „Keine Vorschau für diese Datei“: Lade sie herunter, um sie auf deinem Gerät zu öffnen. Die Download-Schaltfläche des Betrachters ist immer da.

## Agenten Bilder erstellen lassen

Bitte einen beliebigen Agenten um ein Bild („Mach ein Logo für meine Bäckerei“, „Mach aus diesem Foto ein Aquarell“), und er erstellt es mit einem Bildmodell über OpenRouter, speichert es im Ordner der Sitzung und zeigt es mit seiner Antwort. Richte es unter **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)** ein (auf einem Smartphone: Einstellungen, dann **Bilder, Video und Audio**).

- **[Bilder erstellen](/settings?s=images&find=Making%20images)**: Der Schalter **Bilderstellung für Agenten erlauben** neben dem Titel der Gruppe gibt jedem Agenten seine Werkzeuge für Bilder: Bilder, Zeichnungen und Plots erstellen sowie einen Hintergrund aus einem Bild entfernen oder einen Teil davon löschen. Er ist eingeschaltet, solange du ihn nicht ausschaltest; ist er aus, werden sie den Agenten nicht angeboten.
- **Der OpenRouter-Key**: Bild-, Video- und Audiomodelle werden über OpenRouter angesprochen, und jedes Bild, Video oder jeder Ton wird mit deinem OpenRouter-Key bezahlt. Ohne einen Key weist dieser Abschnitt darauf hin, mit **Key auf openrouter.ai erstellen** und **Key hinzufügen**, was [Einstellungen → Agenten → Modelle → OpenRouter](/settings?s=models&find=OpenRouter) öffnet, wo der Key eingetragen wird (siehe [Agenten, Konten und Modelle](/guide/agents-models)). Ein Agent, der ihn braucht, fragt stattdessen auf einer Karte danach ([Wenn ein Agent den OpenRouter-Key braucht](#when-an-agent-needs-the-openrouter-key)).
- **[Für die meisten Bilder (Best)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)**: das Modell, das Szenen, Fotos, Menschen, Wörter in einem Bild und Diagramme erstellt sowie jede Veränderung an einem Bild. Es zeigt seinen Namen, mit seinem Hersteller, ungefähr die Kosten eines Bildes (für ein Bild von etwa einem Megapixel) und den Monat, in dem OpenRouter es aufgelistet hat (seine ID steht unter (i)), mit Tags: **Neu** (in den letzten 30 Tagen aufgelistet), **Änderungen** (es nimmt Bilder zum Verändern oder als Vorlage entgegen) und **Text auch** (es schreibt Text in seine Bilder). Bis du eines auswählst, gilt die Wahl der App („Die Wahl der App, bis du eines auswählst“): das erste aus einer kurzen Liste, die OpenRouter noch anbietet: Seedream 5.0 Pro und Flash von ByteDance, dann Bildmodelle von Google Gemini, OpenAI und FLUX.
- **[Für einfache Bilder (Quick)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)**: ein günstigeres, schnelleres Modell für Icons, Hintergründe, Texturen und einfache Bilder, auf dieselbe Weise angezeigt. Bis du eines auswählst, gilt die Wahl der App: das erste aus einer kurzen Liste schneller Modelle, die OpenRouter noch anbietet, zuerst Seedream 5.0 Flash von ByteDance, dann schnelle Modelle von Google, Recraft, FLUX und OpenAI (bietet OpenRouter keines davon an, erstellt das Best-Modell auch einfache Bilder).
- **[Bildwerkzeuge auf diesem Computer](/settings?s=images&find=Picture%20tools%20on%20this%20computer)**: einen Bildhintergrund entfernen, einen Teil davon löschen und es vergrößern, auf diesem Computer statt über OpenRouter: kostenlos, und deine Bilder bleiben hier. **Einrichten** lädt sie einmal herunter, die Zeile darunter zeigt, was sie gerade tun, und **⋯ → Entfernen** nimmt sie wieder von diesem Computer (siehe [Die Bildwerkzeuge auf diesem Computer](/guide/library#the-picture-tools-on-this-computer)).

So wählst du das Best- oder das Quick-Modell aus:

1. Klicke daneben auf **Veränderung**: Eine Liste der Bildmodelle von OpenRouter öffnet sich (**Bildmodell für die meisten Bilder (Best)** oder **Bildmodell für einfache Bilder (Quick)**).
2. Suche darin nach dem Namen („seedream“, „flux“, „gemini“) und sortiere sie nach **Vorgeschlagen** (die Vorschläge der App zuerst), **Neueste** oder **Günstigstes**.
3. Klicke auf eine Zeile, um dieses Modell zu verwenden. Hast du eines ausgewählt, enthält das Menü **⋯** der Zeile **Stattdessen die App auswählen lassen**, womit du zur Wahl der App zurückkehrst.

Die Listen kommen von OpenRouter und brauchen keinen Key; können sie nicht abgerufen werden, sagt die Liste das.

## Agenten Videos erstellen lassen

Agenten können auch kurze Videos erstellen („zehn Sekunden Wellen in der Dämmerung“, „lass dieses Foto meines Hundes über ein Feld rennen“), mit einem Videomodell über OpenRouter, im selben Abschnitt, **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**:

- **[Videos erstellen](/settings?s=images&find=Making%20videos)**: Der Schalter **Videoerstellung für Agenten erlauben** neben dem Titel der Gruppe gibt jedem Agenten das Werkzeug dafür. Er ist eingeschaltet, solange du ihn nicht ausschaltest.
- **[Videomodell](/settings?s=images&find=Video%20model)**: das Modell, das sie erstellt, angezeigt mit seinem Hersteller, was eine Sekunde Video kostet (von der niedrigsten Auflösung ohne Ton bis zur höchsten mit Ton, etwa „0,03 $ bis 0,08 $ pro Sekunde“), den Längen, die es erstellt („4 bis 8 s“), seiner höchsten Auflösung („bis zu 1080p“) und dem Monat, in dem OpenRouter es aufgelistet hat, mit Tags: **Ton** (es erzeugt Ton zum Bild), **Von einem Bild** (es kann von einem Bild ausgehen, das du angibst) und **Bearbeitet Videos** (es verändert ein Video, das du ihm gibst, statt eines aus Worten zu erstellen). Bis du eines auswählst, gilt die Wahl der App: das erste aus einer kurzen Liste von Modellen mit Ton, die OpenRouter noch anbietet: Seedance 2.5 von ByteDance, dann günstigere, schnellere wie Google Veo 3.1 Lite. **Veränderung** öffnet die Liste zum Suchen („seedance“, „veo“, „kling“) und Sortieren nach **Vorgeschlagen**, **Neueste** oder **Günstigstes**.

- **[Grafikkarte für Videos verwenden](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** (unter **Videos bearbeiten**): **Automatisch** erstellt die Videos, die du bearbeitest, und die Bearbeitungen der Agenten auf der Grafikkarte, wenn eine funktionierende vorhanden ist (NVIDIA, Intel, AMD oder Apple): viel schneller, und der Prozessor bleibt frei. Es wird beim ersten Erstellen eines Videos ausprobiert, und die Zeile darunter sagt, was gefunden wurde („NVIDIA GeForce RTX 4090 · NVENC“); **Jetzt prüfen** probiert es erneut. Schlägt die Grafikkarte bei einer Bearbeitung fehl, erstellt der Prozessor sie sofort neu. **Aus** erstellt sie auf dem Prozessor.

Videos kosten weit mehr als Bilder: von einigen Cent bis zu Dollar pro Sekunde, und ein Video von 8 Sekunden mit Ton von einem Spitzenmodell kann mehrere Dollar kosten. Jedes wird mit deinem OpenRouter-Key bezahlt, und du siehst seinen Preis in einem Formular, bevor etwas erstellt wird.

## Agenten Audio erstellen lassen

Agenten können auch Ton erstellen: Songs und Jingles („ein 30-Sekunden-Jingle für meinen Podcast“), Sprecherstimmen und Erzählungen in einer Stimme, die du beschreibst („lies diese Begrüßung mit warmer, langsamer Stimme vor“) oder in einer Stimme, die von einer Aufnahme von dir kopiert wird, sowie Soundeffekte und Atmosphäre („Regen auf einem Blechdach“). Richte es im selben Abschnitt ein, **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**:

- **[Audio erstellen](/settings?s=images&find=Making%20audio)**: Der Schalter **Audioerstellung für Agenten erlauben** neben dem Titel der Gruppe gibt jedem Agenten das Werkzeug dafür. Er ist eingeschaltet, solange du ihn nicht ausschaltest.
- **[Musikmodell](/settings?s=images&find=Music%20model)**: das Modell, das Songs und Musik erstellt, angezeigt mit seinem Hersteller, seinem Preis („0,08 $ pro Song“), der längsten Dauer, die es erstellt („bis zu 3:00“), und dem Monat, in dem OpenRouter es aufgelistet hat, mit dem Tag **Musik**. Bis du eines auswählst, gilt die Wahl der App: Lyria 3 Pro von Google, das ganze Songs von bis zu etwa 3 Minuten erstellt, mit Gesang oder ohne; sonst Lyria 3 Clip, das 30-Sekunden-Clips erstellt.
- **[Stimm- und Tonmodell](/settings?s=images&find=Voice%20and%20sound%20model)**: das Modell, das spricht und andere Töne erstellt, angezeigt mit seinem Preis („0,0025 $ pro Sekunde“, „0,08 $ pro 1.000 Zeichen“, „etwa 0,014 $ pro Minute“), der längsten Dauer, die es erstellt, und der Zahl seiner Stimmen, mit Tags: **Auch Audio** (es erstellt aus einer Beschreibung auch Soundeffekte und Atmosphäre, nicht nur Stimmen), **Kopiert Stimmen** (es spricht in einer Stimme, die aus kurzen Aufnahmen kopiert wird, die du ihm gibst), **Unterhaltungen** (es vertont mehrere Sprecher, jeden in seiner eigenen Stimme) und **Sprechstil steuerbar** (es nimmt Anweisungen für den Vortrag entgegen: Ton, Tempo, Emotion). Bis du eines auswählst, gilt die Wahl der App: Seed Audio 1.0 von ByteDance, das all das aus einer Beschreibung kann, bis zu 2 Minuten auf einmal; sonst Gemini 3.8 Flash TTS von Google, sonst ElevenLabs v3.

**Veränderung** öffnet die Liste jedes Modells zum Suchen („lyria“; „seed“, „elevenlabs“, „gemini“) und Sortieren nach **Vorgeschlagen**, **Neueste** oder **Günstigstes** (Stimmen nach den ungefähren Kosten einer Minute Sprache); die Zeile eines ausgewählten Modells hat **⋯ → Stattdessen die App auswählen lassen**, um zur Wahl der App zurückzukehren. Liest das von dir gewählte Stimmmodell Wörter nur vor, wird ein Soundeffekt oder eine kopierte Stimme mit der Wahl der App erstellt, die das kann, und das Formular sagt es.

Stimmmodelle werden meist nach gelesenen Zeichen verkauft, Seed Audio nach der Sekunde erzeugten Tons, Lyria nach dem Song. Jedes wird mit deinem OpenRouter-Key bezahlt, und du siehst seinen Preis in einem Formular, bevor etwas erstellt wird.

## Einstellungen prüfen, bevor etwas erstellt wird

Bevor ein Agent ein Bild, eine detaillierte Zeichnung, ein Video oder einen Ton erstellt, erscheint in der Unterhaltung ein kurzes Formular mit den Einstellungen, die dieses Modell anbietet, und mit dem, was das Ergebnis kostet. Es ist mit dem ausgefüllt, worum du gebeten hast, und mit den Standardwerten der App:

- für ein Bild: **Form** (quadratisch, breit, hoch …, so viele, wie das Modell kann), **Auflösung** (1K, 2K, 4K …), **Qualität**, **Wie viele Bilder** (bei Modellen, die mehrere auf einmal erstellen) und **Transparenter Hintergrund** (für ein Logo oder ein Icon);
- für eine detaillierte Zeichnung (mit dem Vektormodell von Recraft): ihre **Form**;
- für ein Video: **Videolänge** (die Längen, die das Modell erstellt, oder **Länge in Sekunden**), **Form**, **Auflösung** und **Ton**;
- für einen Ton: bei einem Song **Instrumental, kein Gesang** und, bei einem Modell, das lange Songs erstellt, **Länge in Sekunden** (leer lassen, damit der Song so lange dauert, wie er braucht); bei einem Soundeffekt seine **Länge in Sekunden** (Seed Audio wird pro Sekunde bezahlt); bei Sprache die **Spracheingabe** (bei einem Modell mit eigenen Stimmen) und die **Datei** (**MP3, kleiner** oder **WAV, unkomprimiert**), wo das Modell beides erstellt.

Über den Feldern stehen der Name des Modells, sein Preis („etwa 0,08 $ pro Bild“, „0,03 bis 0,08 $ pro Sekunde, je nach Auflösung und Ton“, „0,08 $ pro Song“, „0,0025 $ pro Sekunde Ton“; bei einem Video oder einem Ton das, was es mit den angezeigten Einstellungen ergibt) und das, was der Agent anfordern wird, vollständig und in seinen eigenen Worten. Ändere, was du möchtest, und klicke auf **Erstellen**; mit **Nicht jetzt** schließt du das Formular, und es wird nichts erstellt oder ausgegeben. Das Formular zeigt nur die Einstellungen, die das Modell anbietet.

Das Formular kommt einmal pro Modell in einer Sitzung: Spätere Bilder, Videos und Töne in dieser Sitzung verwenden die Einstellungen, die du gewählt hast (bei einem Ton seine Stimme und seine Datei), es sei denn, du bittest um andere („jetzt ein hohes“). Sag „zeig mir die Einstellungen noch einmal“, um das Formular zu sehen, oder „mach einfach, such du aus“, damit der Agent ohne Formular erstellt. Geplante Aufgaben und Ausführungen von Apps erstellen ihre Ergebnisse ohne Formular mit den Standardwerten der App, da niemand da ist, der antworten könnte.

## Wenn ein Agent den OpenRouter-Key braucht

Bilder, detaillierte Zeichnungen, Videos, Musik und Stimmen werden von Modellen über OpenRouter erstellt und mit deinem OpenRouter-Key bezahlt. Wenn ein Agent eines davon erstellen will und kein Key hinterlegt ist, erscheint zuerst eine Karte in der Unterhaltung: **Hierzu ist ein OpenRouter-Key erforderlich**. Sie nennt das Modell, das es erstellen würde, ungefähr die Kosten und dass du OpenRouter für das Erstellte bezahlst, und enthält ein Feld für den Key:

- Füge ihn ein und klicke auf **Key speichern** (oder drücke die Eingabetaste). OpenRouter prüft ihn zuerst; er geht direkt an [Einstellungen → Agenten → Modelle → OpenRouter](/settings?s=models&find=OpenRouter), nie in die Unterhaltung, und der Agent macht weiter (wie immer mit dem Formular für die Einstellungen). Die Karte zeigt dann: „Dein OpenRouter-Key ist in Einstellungen → Modelle gespeichert.“
- **Key erstellen** öffnet die Seite von OpenRouter, auf der du einen erstellst.
- **Überspringen**: Dieses Modell läuft nicht, es wird nichts erstellt oder ausgegeben, und der Agent macht ohne es weiter, auf anderem Weg, wo dafür kein Key nötig ist (eine einfache Zeichnung, die er schreibt, die [Bildwerkzeuge auf diesem Computer](/guide/library#the-picture-tools-on-this-computer)), oder gar nicht. Die Sitzung fragt sechs Stunden lang nicht erneut.

Die Karte wartet bis zu neun Minuten; danach macht der Agent ohne den Key weiter und erfährt davon, wenn du ihn später hinzufügst. Geplante Aufgaben und Ausführungen von Apps bekommen keine Karte, da niemand da ist, der antworten könnte: Sie melden, dass der Key fehlt („Für Bilder ist ein OpenRouter-Key erforderlich“, mit **OpenRouter-Key hinzufügen**). Die KI-Werkzeuge der Editoren fragen stattdessen in ihrem Dialog nach dem Key ([Bilder, Zeichnungen, Diagramme und Videos mit KI erstellen](/guide/library#make-pictures-drawings-plots-and-videos-with-ai)).

## Ein Bild anfordern oder ändern lassen

Beschreibe, was du möchtest: das Motiv, die Umgebung, den Stil (ein Foto, eine Illustration, ein Aquarell), die Farben, das Licht und alle Wörter, die darin vorkommen sollen. Der Agent kann außerdem:

- **deine Bilder ändern oder kombinieren**: Bilddateien auf diesem Computer (PNG, JPEG, WebP oder GIF, je bis zu 20 MB; die meisten Modelle verarbeiten bis zu 4, manche mehr), im Ordner der Sitzung oder über ihren Pfad, oder die Bilder, die schon in einer Folienpräsentation, einem Dokument oder einer von dir behaltenen Seite sind; sag, was geändert werden soll. (Ein an eine Nachricht angehängtes Bild geht an das Modell, damit es es ansieht; damit das Bildmodell damit arbeiten kann, muss es eine Datei sein: Lade es auf der Seite „Dateien“ hoch.) Dafür braucht es ein Modell mit dem Tag **Änderungen**; bei einem anderen wird dem Agenten gesagt, er solle die Änderung in Worten beschreiben oder dich bitten, ein Modell zu wählen, das Bilder bearbeitet;
- **das Modell „Schnell“ oder „Am besten“ verwenden**: Der Agent nimmt das Schnelle für einfache Bilder (einen Hintergrund, eine Textur, ein Icon) und das Beste für Szenen, Fotos, Wörter in einem Bild, Diagramme und jede Änderung, oder er entscheidet nach dem, was du verlangst; sag es, um das andere zu bekommen („ein schnelles reicht“, „nimm das beste Modell“);
- **den Hintergrund durchsichtig machen** (ein Logo, ein Icon): Ein Modell, das das nicht kann, gibt es an eines weiter, das es kann, oder, wenn die [Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer) eingerichtet sind, wird das Bild auf einem einfarbigen Hintergrund erstellt und der Hintergrund auf diesem Computer entfernt;
- **ein anderes Modell** für ein einzelnes Bild verwenden, wenn du es nennst („mach es mit FLUX 2 Pro“), ohne die Einstellungen zu ändern.

Bilder werden in einem Ordner **Bilder** im Ordner der Sitzung gespeichert, benannt nach dem, was sie zeigen, und nie über eine bereits vorhandene Datei.

In der Unterhaltung:

- Während das Modell arbeitet, zeigt ein Platzhalter in der angeforderten Form „Bild wird erstellt“ mit der bisherigen Zeit und darunter die Beschreibung.
- Dann erscheinen die Bilder mit der Antwort, mit der Beschreibung und dem Namen des Modells darunter, und **Behalten** (siehe [Behalten, was ein Agent erstellt hat](#keep-what-an-agent-made)). Klicke auf eines, um es groß zu sehen: Klicke noch einmal für die volle Größe, mit den Pfeilen (oder Pfeiltasten) blätterst du durch mehrere, **In einem neuen Tab öffnen** öffnet es einzeln, **Bearbeiten** öffnet es im Bildeditor (was du dort speicherst, wird als neues Bild behalten: [Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos)), und Escape schließt. Über jedem Bild erscheinen **In den Dateien anzeigen**, **Herunterladen** und **Mehr** (⋯: **Sitzung damit starten**, **Zu einem Projekt hinzufügen**, **Pfad kopieren** und, in der Desktop-App, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen**), wenn du darauf zeigst (auf einem Smartphone sind sie immer da); bei mehreren Bildern ist auch **Behalten** da.
- Ist kein OpenRouter-Key hinterlegt, fragt dich zuerst eine Karte danach ([Wenn ein Agent den OpenRouter-Key braucht](#when-an-agent-needs-the-openrouter-key)); in einer Ausführung, die niemand beobachtet (einer geplanten Aufgabe, einer App), siehst du stattdessen „Für Bilder ist ein OpenRouter-Key erforderlich“ mit **OpenRouter-Key hinzufügen**. Wenn nichts erstellt wird (du hast den Key übersprungen oder das Formular geschlossen, oder das Modell hat abgelehnt), siehst du „Diesmal kein Bild“ mit dem Grund.

## Eine Zeichnung oder ein Diagramm anfordern

Manche Bilder werden besser aus Formen gezeichnet oder aus Zahlen berechnet, als dass ein Bildmodell sie malt:

- **Eine Zeichnung** (eine SVG: Formen statt Pixel, in jeder Größe scharf): ein Icon, ein Logo, ein Diagramm, ein sich wiederholendes Muster, eine Form oder eine flache Illustration, in den Farben, die du vorgibst (etwa denen einer Folienpräsentation oder eines Dokuments). Eine einfache schreibt Claude (oder das [Hilfsmodell](/settings?s=models&find=Helper%20model), das du gewählt hast), ohne dass ein Bildmodell bezahlt werden muss, in unter einer Minute; eine detaillierte (eine Illustration, oder wenn du das Beste verlangst) zeichnet das Vektormodell von Recraft über OpenRouter, für etwa 0,08 $ pro Zeichnung, nach dem Formular mit seinem Preis. Skripte, Links und alles, was eine Zeichnung von anderswo laden würde, werden aus jeder Zeichnung entfernt, bevor sie behalten wird.
- **Ein Diagramm** deiner Daten oder von Mathematik, für das, was das Diagramm einer Folie nicht zeichnen kann: Streudiagramme, Histogramme, Boxplots, Fehlerbalken, mehrere Achsen oder Felder, Heatmaps, Funktionen, Anpassungen und Anmerkungen an den wichtigen Punkten. Claude (oder das Hilfsmodell) schreibt es in Python mit matplotlib, es läuft auf diesem Computer, und was schiefgeht, geht zur Korrektur an Claude zurück (bis zu dreimal); es dauert etwa eine halbe Minute und kostet nur diese Antwort. Gib die Zahlen in deiner Nachricht oder als Datei an (CSV, TSV oder JSON, bis zu 20 MB) und sag, was es zeigen soll („zeige, dass sich der Frühling verdoppelt hat“). Es kommt als Zeichnung (SVG; ein PNG bei sehr vielen Punkten), 960 mal 540 Pixel, sofern du keine andere Größe verlangst, mit seinem Python daneben, sodass „jetzt mit logarithmischer Skala“ genau dieses Diagramm ändert; für eine Web-Folienpräsentation kann es auch als Diagramm kommen, das sich bewegt und auf den Mauszeiger reagiert. Es braucht Python mit matplotlib auf dem Computer, auf dem die App läuft: das der Bildwerkzeuge selbst, sobald sie eingerichtet sind ([Die Bildwerkzeuge auf diesem Computer](/guide/library#the-picture-tools-on-this-computer)), oder eines, das schon vorhanden ist.

Beide werden im Ordner **Bilder** im Ordner der Sitzung gespeichert und erscheinen mit der Antwort wie Bilder; während eines erstellt wird, sagt sein Platzhalter „Zeichnung wird erstellt“ oder „Diagramm wird gezeichnet“.

## Kostenlose Fotos finden

Bitte um Fotos statt um Bilder, die ein Modell erstellt („finde zwei Fotos von Lissabons Straßenbahnen für meine Titelfolie“), und der Agent sucht offen lizenzierte Fotos, die kostenlos verwendet und verändert werden dürfen, auch geschäftlich: im Katalog von Openverse (Flickr, Wikimedia Commons, Museen und mehr) oder in der eigenen Suche von Wikimedia Commons, wenn Openverse nicht antworten kann. Er speichert einige der besten (4, wenn du nichts anderes sagst, höchstens 10) im Ordner **Bilder** der Sitzung, mit dem Urheberhinweis zu jedem (Titel, Urheber, Lizenz und Link) in einer Datei daneben, sieht sie sich an, bevor er eines verwendet, und nennt die Urheber, wie es die Lizenz verlangt: in den Sprechernotizen der Folie oder unter dem Bild in einem Dokument oder einer Seite, und bei anderen Lizenzen als CC0 und Public Domain in einer kleinen Bildunterschrift am Foto („Foto: „Titel“ von Urheber, CC BY 2.0“). Es ist kostenlos und dauert ein paar Sekunden; während der Agent sucht, sagt der Platzhalter „Kostenlose Fotos werden gesucht“.

## Ausschneiden, Radieren und Bearbeiten

Agenten verändern deine Bilder und Videos auch, ohne sie neu erstellen zu lassen:

- **Den Hintergrund entfernen** bei einem Bild: Das Motiv (eine Person, ein Produkt, ein Tier, ein Logo) wird als PNG auf durchsichtigem Hintergrund freigestellt. Auf diesem Computer ist das, sobald die [Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer) eingerichtet sind, kostenlos und privat, behält die eigenen Pixel des Motivs und dauert ein paar Sekunden; ein Ausschnitt, der schlecht aussieht, wird von einem Bildmodell noch einmal gemacht. Ohne die Bildwerkzeuge übernimmt das ein Bildmodell über OpenRouter (etwa 0,01 bis 0,04 $), das das Bild ohne Hintergrund neu zeichnet, sodass kleine Details abweichen können.
- **Etwas aus einem Bild radieren** (eine Person im Hintergrund, ein Schild, ein Wasserzeichen, ein Fleck, ein Kabel): Es wird entfernt und so aufgefüllt, dass die Umgebung weitergeführt wird. Der Agent markiert die Stelle oder beschreibt sie, damit ein Bildmodell sie findet. Kleine Bereiche werden auf diesem Computer kostenlos radiert; große, solche, die sich über das ganze Bild erstrecken, und solche zwischen detailreichen Dingen wie Schrift gehen an ein Bildmodell (etwa 0,01 bis 0,04 $).
- **Ein Bild vergrößern**: auf die doppelte oder vierfache Größe pro Seite, wobei die Details scharf neu gezeichnet statt verwischt werden (ein kleines Foto für den Druck oder eine Folie, ein altes Bild). Kostenlos und privat, auf diesem Computer, sobald die [Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer) eingerichtet sind (beim ersten Mal wird das Modell heruntergeladen, etwa 5 MB); ein großes Bild braucht ein bis zwei Minuten.
- **Ein Bild bearbeiten**: zuschneiden, drehen oder spiegeln, die Größe ändern, Licht und Farben anpassen (Belichtung, Kontrast, Wärme und mehr, oder Gradationskurven, Tonwerte, Farbton und Sättigung einer einzelnen Farbe, Farbbalance, Klarheit, Dunstentfernung, Rauschreduzierung, Körnung, oder alles auf einmal mit „Automatisch verbessern“), einen Filter anwenden (**Vintage**, **Schwarz und Weiß** …), Text daraufschreiben, Pfeile und Rahmen zeichnen und Teile davon verwischen oder verpixeln (ein Gesicht, ein Nummernschild, einen Namen). Kostenlos, auf diesem Computer; ein JPEG-, WebP- oder GIF-Bild oder Text darauf braucht dort ffmpeg oder die Bildwerkzeuge.
- **Ein Video bearbeiten**: kürzen, Teile herausschneiden, auf ein Format zuschneiden (16:9, 9:16, quadratisch, 4:5), drehen oder spiegeln, beschleunigen oder verlangsamen (oder rückwärts abspielen, stabilisiert), mehrere Clips und Bilder mit Übergängen verbinden (Überblendungen, Abblenden über Schwarz, Wischblenden, Schiebeblenden), einem Bild einen langsamen Zoom geben, es einfärben (Belichtung, Wärme, Kontrast, ein Look wie Kino oder Schwarz-Weiß, eine Vignette, Körnung), ein- und ausblenden, den Ton entfernen oder die Lautstärke ändern, auswählen, welche Kanäle zu hören sind (ein Ansteckmikrofon auf einer Seite, das auf beiden zu hören ist), Teile des Tons stummschalten, der Musik eine Lautstärkekurve geben, ein Logo, ein Wasserzeichen oder einen Greenscreen darüberlegen, Text darauf setzen (Titel, Untertitel oder Untertitel aus dem Gesprochenen, mit einer .srt-Datei daneben) und Musik und einen Sprecherkommentar darunterlegen, wobei die Stimmen bereinigt, die Musik unter Sprache abgesenkt und die Lautstärke angeglichen wird; oder ein GIF daraus machen oder ein Einzelbild als Bild entnehmen. Kostenlos, mit ffmpeg auf diesem Computer (die Bildwerkzeuge bringen eines mit), auf der Grafikkarte, wenn es eine gibt, solange **Videoerstellung für Agenten erlauben** aktiviert ist.
- **Einen Ton bearbeiten** (eine Tondatei, der Ton eines Videos oder ein Ton, den du behalten hast): einen Teil behalten, Teile herausschneiden oder stummschalten, lange Pausen kürzen, Füllwörter entfernen („ähm“, „äh“: mit Spracherkennung auf diesem Computer, siehe [Spracherkennung auf dem Server](#speech-recognition-on-the-server)), schneller oder langsamer abspielen, wobei die Tonhöhe erhalten bleibt, die Tonhöhe ändern, lauter oder leiser machen oder ausblenden, die lauteste Spitze oder die Lautheit festlegen (Podcast, Streaming, Rundfunk), Rauschen reduzieren, den Klang ändern (eine klarere Stimme, ein Telefon, ein Radio), komprimieren oder begrenzen, Echo oder Hall hinzufügen, umkehren oder in Mono umwandeln und andere Töne an einer Stelle darüberlegen (Musik unter einer Stimme, ein Soundeffekt). Kostenlos, mit ffmpeg auf diesem Computer, solange **Audioerstellung für Agenten erlauben** aktiviert ist.

Jede dieser Funktionen arbeitet mit einer Datei im Ordner der Sitzung oder mit einem Bild oder Video, das bereits in einer Präsentation, einem Dokument oder einer Seite ist, und speichert das Ergebnis im Ordner **Bilder** der Sitzung (ein bearbeitetes Video in **Videos**, ein bearbeiteter Ton in **Audio**), nie über dem Original. Auch ein Bild oder ein Ton, den du behalten hast, kann bearbeitet und an seiner Stelle oder daneben als neues Exemplar abgelegt werden, so wie es **Speichern** und **Kopie speichern** in den Editoren tun („Hellere das Hafenfoto auf, das ich behalten habe“, „Mach meinen Ton ‚Interview‘ so laut wie einen Podcast“). Das Ergebnis erscheint mit der Antwort wie ein Bild, das der Agent erstellt hat; sein Platzhalter sagt „Hintergrund wird entfernt“, „Radieren“, „Bild wird vergrößert“, „Bild wird bearbeitet“, „Video wird bearbeitet“ oder „Ton wird bearbeitet“, solange gearbeitet wird. Bei einem Ausschnitt oder einem Radieren sagt die Antwort, auf welche Weise es gemacht wurde und warum: Wenn es nicht passt, sag „mach es mit KI“, und der Agent fragt das Bildmodell. Um es selbst zu tun, öffne das Bild, das Video oder den Ton im jeweiligen Editor ([Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos), [Der Tonbearbeiter](/guide/library#the-sound-editor)).

## Ein Video anfordern

Beschreibe die Szene, was sich bewegt und wie, die Kamera („eine langsame Heranfahrt“, „sie folgt dem Radfahrer“), den Stil und das Licht sowie Ton oder gesprochene Worte. Der Agent kann außerdem:

- **von einem Bild ausgehen**: eine Bilddatei als erstes Einzelbild des Videos („Lass dieses Foto lebendig werden“) und bei manchen Modellen eine, auf der das Video endet, bei Modellen mit dem Tag **Von einem Bild**;
- **Bildern folgen**: bis zu 4 Bilder einer Figur, eines Produkts oder eines Stils, an die sich das Video halten soll, ohne dass sie seine Einzelbilder sind;
- **ein Video verändern**: eine Videodatei (MP4, WebM oder MOV, bis zu 40 MB) für ein Modell mit dem Tag **Bearbeitet Videos**, um sie zu bearbeiten, zu verlängern oder zu schärfen.

Ein Video braucht von unter einer Minute bis zu mehreren. Der Agent wartet darauf, höchstens etwa neun Minuten; dauert es länger, holt die App es weiter ab und speichert es, sobald es fertig ist, und der Agent zeigt es, sobald er wieder nachsieht. Durch das Warten entstehen keine weiteren Kosten.

Videos werden in einem Ordner **Videos** im Ordner der Sitzung gespeichert, benannt nach dem, was sie zeigen.

In der Unterhaltung:

- Während das Modell arbeitet, sagt ein Platzhalter in der Form des Videos „Video wird erstellt“ mit der bisherigen Zeit.
- Dann erscheint das Video mit der Antwort, bereit zum Abspielen (über die Steuerelemente auch im Vollbild), mit der Beschreibung und dem Namen des Modells darunter sowie **Behalten**. Darüber erscheinen, wenn du mit dem Zeiger darauf gehst, **Bearbeiten** (der Video-Editor: Was du speicherst, wird behalten), **In den Dateien anzeigen**, **Herunterladen** und **Mehr** (⋯: dasselbe wie unter einem Bild, mit **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** in der Desktop-App).
- „Wird noch erstellt“ bedeutet, dass der Agent aufgehört hat zu warten, bevor das Video fertig war: Es erscheint, sobald der Agent wieder nachsieht (bitte ihn darum, wenn er es nicht tut). „Diesmal kein Video“ nennt den Grund: Du hast das Formular geschlossen, oder das Modell hat abgelehnt (seine Worte sagen, warum).

## Musik, eine Stimme oder einen Ton anfordern

Sag dem Agenten, was du hören möchtest:

- **Musik**: das Genre und die Stimmung, die Instrumente, das Tempo, die Stimme, die singt, und wie es verläuft („ein 2-minütiger beschwingter Synthpop-Song über Montagmorgen, gesungen von einer Frau, mit einem eingängigen Refrain“). Gib deine eigenen Songtexte vor oder lass das Modell sie schreiben; bitte um eine Instrumentalversion, wenn du keinen Gesang möchtest. Lyria 3 Clip macht immer 30 Sekunden; Lyria 3 Pro macht bis zu etwa 3 Minuten, so lang, wie du es verlangst. Ein Song braucht ein bis zwei Minuten.
- **Ein Sprecherkommentar**: der Text, der gesprochen werden soll, genau so, und wie er klingen soll („lies das mit ruhiger, tiefer Stimme, langsam“). Bei einem Modell mit eigenen Stimmen wählst du im Formular eine aus; Seed Audio erzeugt die Stimme, die du beschreibst. Auch ein Gespräch zwischen mehreren Sprechern ist möglich („ein kurzes Podcast-Intro mit zwei Moderatoren“), mit Modellen, die sie vertonen.
- **Eine aus einer Aufnahme kopierte Stimme**: Gib dem Agenten 1 bis 3 Aufnahmen der Stimme, Dateien auf diesem Computer (WAV, MP3, M4A, OGG oder FLAC, bis zu 30 MB je Datei; verwendet werden die ersten 30 Sekunden jeder Datei), für ein Modell, das **Kopiert Stimmen** (Seed Audio). Verwende nur eine Stimme, die du verwenden darfst: deine eigene oder eine, deren Inhaber zugestimmt hat. Mit ffmpeg auf dem Computer funktioniert jede dieser Dateien; ohne ffmpeg nur WAV und MP3.
- **Ein Soundeffekt oder eine Geräuschkulisse**: was es ist, was passiert und wann („heftiger Regen auf einem Blechdach, am Ende rollt Donner heran, keine Stimmen“) und wie lange.
- **Ein anderes Modell** für einen einzelnen Ton, wenn du es nennst („lies es mit ElevenLabs v3 vor“), ohne die Einstellungen zu ändern.

Töne werden in einem Ordner **Audio** im Ordner der Sitzung gespeichert, benannt nach dem, was sie sind, als MP3 (oder WAV, wenn du es verlangst).

In der Unterhaltung:

- Während das Modell arbeitet, sagt eine Karte „Musik wird erstellt“, „Sprecherkommentar wird erstellt“ oder „Ton wird erstellt“, mit der bisherigen Zeit.
- Dann erscheint der Ton mit der Antwort in einem Player: Die runde Schaltfläche startet und pausiert ihn (es spielt immer nur ein Ton), seine Form ist die Leiste zum Vor- und Zurückspringen (klicken oder ziehen), dann folgen die Zeit und die Geschwindigkeit (**1×**, **1.25×**, **1.5×**, **2×** oder **0.75×**). Solange der Player den Fokus hat, starten und pausieren Leertaste oder K, und ← → springen 5 Sekunden. Sein Titel stammt aus dem Dateinamen; daneben stehen **Bearbeiten** (der [Tonbearbeiter](/guide/library#the-sound-editor): Was du speicherst, wird behalten), **In den Dateien anzeigen**, **Herunterladen** und **Mehr** (⋯: dasselbe wie unter einem Bild, mit **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** in der Desktop-App). Darunter stehen die Worte, aus denen er erstellt wurde, der Name des Modells und **Behalten** (siehe [Behalten, was ein Agent erstellt hat](#keep-what-an-agent-made)); die **Songtexte** eines Songs öffnen sich darunter.
- Ohne OpenRouter-Key siehst du „Audio braucht einen OpenRouter-Key“ mit **OpenRouter-Key hinzufügen**. „Diesmal kein Ton“ nennt den Grund: Du hast das Formular geschlossen, oder das Modell hat abgelehnt (seine Worte sagen, warum).

Der Agent kann nicht hören, was er erstellt hat: Er kennt den Ton nur anhand dessen, worum er gebeten wurde. Wenn es nicht richtig klingt, sag, was geändert werden soll, und er macht einen neuen; oder lass ihn bearbeiten („blende die letzten zwei Sekunden des Jingles aus“, „leg ihn bei 0:05 unter meinen Sprecherkommentar“), durch den Agenten oder im Tonbearbeiter.

## Bilder in dem, was Agenten erstellen

Wenn ein Agent Folien, ein Dokument oder eine Seite für dich erstellt oder ändert, illustriert er sie selbstständig dort, wo ein Bild etwas beiträgt (eine Titelfolie, ein Abschnitt, eine Idee; nicht jede Folie), in ihren Farben und ihrem Look, wie ein Designer es tun würde: ein Schnell-Bild für einen Hintergrund, eine Textur oder ein Icon, ein Am-besten-Bild für eine Szene, ein Foto oder ein Diagramm, eine Zeichnung für ein Icon, ein Logo oder ein Diagramm, das scharf bleiben muss, ein Plot für Zahlen, kostenlose Fotos von echten Orten und Dingen und seine Bilder, die passend ausgeschnitten, radiert oder bearbeitet werden. Er arbeitet sowohl mit den Bildern, die bereits in dem Geöffneten sind, als auch mit Dateien und schreibt auf Wunsch für jedes Bild einer Präsentation, das keine Beschreibung hat, eine für Menschen, die es nicht sehen können (das Modell, das die Bilder beschreibt, die du behältst, übernimmt das). Was Geld kostet, wird im Formular vor dem Erstellen angezeigt ([Einstellungen prüfen, bevor etwas erstellt wird](#check-the-settings-before-anything-is-made)); sag „keine Bilder“ oder „nur kostenlose Fotos“, wenn du es anders willst.

Wenn du nach einer bekannten Art von Inhalt mit ihrem Namen fragst (eine SWOT-Folie, ein Pitchdeck, ein Anschreiben, eine Zusammenfassung für die Geschäftsleitung, ein Gewohnheits-Tracker, eine Preistabelle, ein Budget), liest der Agent zuerst, wie die App diese Art gut umsetzt: was hineingehört, in welcher Reihenfolge, wie sie aussieht und wo Bilder helfen, so wie die Arten in der Galerie erstellt werden ([Mit KI aus einer Vorlage erstellt](/guide/library#made-with-ai-from-a-kind)). Das kostet nichts.

In einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) gibt es nichts davon: Ihr Agent erstellt, findet und bearbeitet keine Bilder oder Videos.

## Behalten, was ein Agent erstellt hat

**Behalten** unter einem Bild, einem Video oder einem Ton, den ein Agent erstellt hat, speichert eine Kopie davon in den Dateien eines Projekts, wo ein Modell einen Titel und eine Beschreibung dafür schreibt (bei einem Ton aus den Worten, aus denen er erstellt wurde, da kein Modell ihn hören kann; das Modell wird in [Einstellungen → Funktionen → Bilder, Video und Audio → Beschriftungen für Behaltenes](/settings?s=images&find=Captions%20for%20what%20you%20keep) gewählt) und wo sie auch nach dem Aufräumen des Sitzungsordners bleibt. Wenn du Projekte hast, fragt ein kurzes Menü, wohin sie kommt (**Speichern in**): zuerst das eigene Projekt der Sitzung, dann deine anderen Projekte und **Kein Projekt**, wodurch sie bei der Unterhaltung bleibt, wo das Suchfeld (Ctrl+K) sie findet. Die Schaltfläche heißt dann **Behalten** und öffnet sie. Ein Bild, das du behalten hast, erscheint unter den Dateien seines Projekts (die Details des Projekts → **Dateien**, als Kachel mit seinem Bild), und im Editor behält **Behalten** ein bearbeitetes Bild als neues, während **Speichern** es dorthin zurücklegt, woher es kam, und **Kopie speichern** daneben ein weiteres behält.

## Wortvorschläge beim Tippen

Beim Tippen kann Hydor den Rest des Wortes, das du gerade schreibst, grau hinter dem Cursor anzeigen, und das nächste Wort noch blasser. Das funktioniert im Nachrichtenfeld, in Dokumenten, in Notizen und in anderen Textfeldern, in jeder Sprache, in der du schreibst.

- **Tab** übernimmt das graue Wort. Drücke die Taste noch einmal, um das nächste zu übernehmen.
- **→** (der Pfeil nach rechts) übernimmt beide Wörter auf einmal, wenn der Cursor am Ende des Textes steht.
- **Esc** blendet sie bis zum nächsten Wort aus. Tippe einfach weiter, dann verschwinden sie von selbst; tippst du die Buchstaben, die sie zeigen, bleiben sie bestehen, nur kürzer.
- Im Nachrichtenfeld behält ein geöffnetes `@`- oder `/`-Menü Tab und Esc für sich, und **Shift+Tab** ändert weiterhin den Berechtigungsmodus. Wenn nichts Graues angezeigt wird, macht jede Taste das, was sie immer gemacht hat.

Nichts, was du tippst, verlässt deinen Computer: Die Vorschläge kommen von Modellen, die auf ihm laufen. Sie ist von Anfang an eingeschaltet und richtet sich beim ersten Tippen von selbst ein.

### Das erste Mal und das Ausschalten

Wortvorschläge sind von Anfang an eingeschaltet, aber es wird nichts heruntergeladen, bis du sie benutzt: Beim ersten Mal, wenn du in einem Nachrichtenfeld oder einem Dokument tippst, installieren und laden sie, was sie brauchen, insgesamt etwa 1,2 GB. Geladen werden die Python-Bibliotheken, auf denen sie laufen (von PyPI), llama.cpp (von GitHub), das Sprachmodell und das kleine Modell (von Hugging Face). Bis dahin steht unter dem Schalter in **[Einstellungen → Funktionen → Wortvorschläge](/settings?s=suggest)** **Noch nicht eingerichtet**; während sie sich einrichten, zeigt die Zeile dort, wie weit der Vorgang ist, und danach wird nichts mehr erneut heruntergeladen. Bringt ein Update der App eine neue Version des kleinen Modells mit, werden nur die Dateien heruntergeladen, die sich geändert haben, und die alte Kopie wird entfernt, sobald sie eine Woche lang von keiner Kopie der App benutzt wurde. Wenn sie **Bereit: Vorschläge erscheinen beim Tippen** zeigt, funktionieren sie. Der erste Vorschlag nach einer längeren Pause dauert etwas länger, weil die Modelle erst geladen werden; nach einer Weile ohne Tippen werden sie nämlich wieder freigegeben. Alles läuft auf dem Prozessor, du brauchst also keine Grafikkarte.

Wenn du sie nicht willst, schalte dort **[Wortvorschläge](/settings?s=suggest&find=Word%20suggestions)** aus: Sie werden gestoppt, und wenn du sie vor dem ersten Mal ausschaltest, wird gar nichts heruntergeladen; was heruntergeladen wurde, bleibt erhalten. Schlägt die Einrichtung fehl (zum Beispiel ohne Internetverbindung), sagt die Zeile, warum, und sie versuchen es später erneut, nach jedem Fehlschlag mit längerem Abstand; schaltest du den Schalter aus und wieder ein, wird sofort neu versucht.

### Die beiden Modelle und der Speicher, den sie brauchen

Zwei Modelle arbeiten zusammen, beide auf deinem Computer:

- **Das kleine Modell** gehört zur App, ist klein genug für jeden Computer und wurde mit Texten in 200 Sprachen trainiert. Es lernt auch aus dem, was du schreibst ([weiter unten](#learn-from-what-you-write)).
- **Das Sprachmodell** ist Qwen3.5-0.8B, ein größeres Modell, das besser rät, besonders in Dokumenten. Es braucht einen Computer mit mindestens 8 GB Arbeitsspeicher, von denen in dem Moment 2,5 GB frei sein müssen.

**[Sprachmodell](/settings?s=suggest&find=Language%20model)** hat drei Optionen. **Automatisch** nutzt es, wenn der Computer genug Speicher hat, und sonst nur das kleine Modell; die Zeile unter dem Schalter sagt, was gerade passiert und warum. **Ein** nutzt es auch dann (das kann den Computer verlangsamen). **Aus** nutzt es nie. Ohne das Sprachmodell funktionieren die Vorschläge weiterhin, nur etwas weniger gut. Unter **[Größe des Sprachmodells](/settings?s=suggest&find=Language%20model%20size)** wählst du **8-Bit**, das etwas besser rät, oder **4-Bit**, das weniger Speicher braucht und einen kleineren Download hat (etwa 560 MB statt 830 MB).

Wenn du die Größe änderst, wird die jeweils andere Datei beim ersten Mal heruntergeladen. **[Nach Sprache wählen](/settings?s=suggest&find=Choose%20by%20language)**, standardmäßig eingeschaltet, lässt die App dasjenige der beiden Modelle verwenden, das in der Sprache, in der du gerade schreibst, besser ist.

### Wo es angezeigt wird

Unter **Wo** im selben Abschnitt hat jeder Ort seinen eigenen Schalter:

- **[In Nachrichtenfeldern](/settings?s=suggest&find=In%20message%20boxes)**: dort, wo du einem Agenten schreibst, auf der Startseite und in einer Unterhaltung.
- **[In Dokumenten](/settings?s=suggest&find=In%20documents)**: während du in Docs schreibst. Die Option „Während ich tippe, vorschlagen“ unter **Ansicht** in Docs, die das Hilfsmodell fragt, wie ein Satz weitergehen könnte, wartet, solange ein Wortvorschlag angezeigt wird.
- **[In Notizen](/settings?s=suggest&find=In%20notes)**: Memory-Notizen und dein Profil.
- **[In anderen Textfeldern](/settings?s=suggest&find=In%20other%20text%20boxes)**: Folgenachrichten, die Warteschlange, ein früherer Prompt, den du bearbeitest, die Fragen-Bereiche und andere kleine Felder.

Diese Einstellungen gelten einmal für die ganze App. Eine Ausnahme ist **[In diesem Browser anzeigen](/settings?s=suggest&find=Show%20in%20this%20browser)**: Sie wird pro Browser gespeichert, sodass du die grauen Wörter auf einem Gerät ausschalten und auf einem anderen eingeschaltet lassen kannst. Ein Agent kann sie auch für die Browser ändern, die seine Sitzung anzeigen.

### Wie sicher es sein muss

Jeder Vorschlag hat eine gewisse Wahrscheinlichkeit, richtig zu sein, und er wird nur angezeigt, wenn diese Wahrscheinlichkeit hoch genug ist. **[Wie sicher, bevor angezeigt wird](/settings?s=suggest&find=How%20sure%20before%20showing)** legt die Schwelle fest: **Mehr** (die Voreinstellung) zeigt mehr Vorschläge, und mehr davon sind falsch; **Ausgewogen** liegt in der Mitte und zielt auf etwa vier richtige von zehn angezeigten Vorschlägen; **Sicherer** zeigt weniger, und mehr davon sind richtig. Ein Agent kann die Schwelle auch noch höher setzen, sodass nur die sichersten Vorschläge erscheinen. Mit **[Nächstes Wort anzeigen](/settings?s=suggest&find=Show%20the%20next%20word)** schaltest du das blassere zweite Wort aus, sodass nur der Rest des Wortes erscheint, das du gerade tippst.

### Was es liest

Für seine Vorschläge liest es die Wörter, die du vor dem Cursor getippt hast, und das, worauf du antwortest: die letzte Antwort des Agenten bei einer Nachricht oder den Text über dem Absatz in einem Dokument.

- **[Wörter deines Getippten](/settings?s=suggest&find=Words%20of%20what%20you%20typed)**: wie viele deiner letzten Wörter es liest, von 20 bis 200 (anfangs 100). Mehr ist langsamer.
- **[Wörter der Antwort oder des Dokuments](/settings?s=suggest&find=Words%20of%20the%20reply%20or%20document)**: wie viele Wörter der Antwort oder des Dokuments es liest, von 0 bis 200; bei 0 liest es keine.
- **[Aus der Unterhaltung lernen](/settings?s=suggest&find=Learn%20from%20the%20conversation)**: übernimmt beim Schreiben einer Nachricht die Wörter und Namen, die früher in der Unterhaltung vorkamen. Das ist unabhängig vom Lernen weiter unten.
- **[Threads](/settings?s=suggest&find=Threads)**: wie viele Prozessor-Threads die Vorschläge nutzen. **Automatisch** wählt anhand der Kerne des Computers.

### Aus deinem Geschriebenen lernen

Standardmäßig lernt das kleine Modell auch deine eigenen Wörter: die Namen, Begriffe und deine Schreibweise, damit die Vorschläge zu dir passen. Das geschieht auf deinem Computer, und was du geschrieben hast, verlässt ihn nie. Das gelernte Modell wird im Datenordner der App gespeichert und mit niemandem geteilt. Jeder Lernlauf beginnt neu bei dem kleinen Modell, das mit der App geliefert wurde, und lernt aus allem, was du geschrieben hast (dem neuesten Teil davon, wenn du sehr viel geschrieben hast); so driftet das Gelernte von Lauf zu Lauf nie ab. Das Modell, das von dir gelernt hat, schlägt in den Sprachen vor, in denen du schreibst; in den anderen Sprachen übernimmt das Modell, das mit der App geliefert wurde.

- **[Aus meinem Geschriebenen lernen](/settings?s=suggest&find=Learn%20from%20what%20I%20write)** schaltet das Lernen ein oder aus.
- Es lernt aus den Quellen, die du eingeschaltet lässt: **[Aus meinen Nachrichten](/settings?s=suggest&find=From%20my%20messages)** (was du Agenten geschrieben hast, aber nicht in Sitzungen mit ausgeschaltetem Memory oder [vertraulichen Sitzungen](/guide/sessions#keep-a-session-confidential) und nicht, was Apps, geplante Aufgaben oder andere Sitzungen für dich geschrieben haben), **[Aus Antworten von Agenten](/settings?s=suggest&find=From%20agents'%20replies)**, **[Aus meinen Notizen](/settings?s=suggest&find=From%20my%20notes)** (die Memory-Notizen, die du selbst geschrieben hast) und **[Aus meinen Dokumenten](/settings?s=suggest&find=From%20my%20documents)** (die Seiten und Dokumente, die du geschrieben hast). Schalte zum Beispiel die Antworten der Agenten aus, damit die Vorschläge nur deinem eigenen Stil folgen.
- **[Gewicht meiner eigenen Wörter](/settings?s=suggest&find=Weight%20of%20my%20own%20words)** legt fest, wie viel mehr das, was du getippt hast, zählt als der Rest, von 1 (gleich) bis 16; anfangs 4.
- **[Wann gelernt wird](/settings?s=suggest&find=When%20it%20learns)**: **Jede Nacht** (etwa einmal am Tag, wenn du zehn Minuten lang nicht getippt hast und der Computer genug Speicher hat), **Wöchentlich** oder **Nur auf Anfrage**. Es läuft im Hintergrund mit der niedrigsten Priorität, sodass deine Arbeit nicht verlangsamt wird, und macht dort weiter, wo es aufgehört hat, wenn der Computer ausgeschaltet wird. Jeder Durchlauf beginnt beim kleinen Modell, das mit der App geliefert wurde, und lernt aus allem, was du geschrieben hast, dem neuesten Teil davon (grob die letzten drei Millionen Wörter, Jahre des Tippens), sodass es nie abdriftet; ein Durchlauf ohne etwas, das seit dem letzten geschrieben wurde, entfällt; nur wenn ein Update ein neues kleines Modell gebracht hat, lernt der nächste Durchlauf daraus von Neuem, auch wenn nichts Neues geschrieben wurde. Auf einem Computer ohne Grafikkarte kann ein Durchlauf Stunden dauern. Beim ersten Mal, wenn es auf dem Prozessor lernt, lädt die App außerdem PyTorchs Prozessor-Version (etwa 200 MB) in ihren eigenen Python-Ordner herunter, und der Durchlauf wartet darauf; die Zeile unter dem Schalter sagt das. **[Threads für das Lernen](/settings?s=suggest&find=Threads%20for%20learning)** begrenzt, wie viel vom Prozessor es nutzen darf.
- **[Auf der Grafikkarte lernen](/settings?s=suggest&find=Learn%20on%20the%20graphics%20card)** (standardmäßig an) lässt einen Durchlauf die Grafikkarte des Computers nutzen, wenn es eine gibt, um ein Vielfaches schneller als der Prozessor: eine NVIDIA-Karte mit mindestens 4 GB frei, die weniger als halb ausgelastet ist, oder ein Mac mit Apple Silicon. Hast du mehrere Karten, nimmt ein Durchlauf die mit dem meisten freien Speicher, die kein anderes Programm nutzt. Läuft auf jeder Karte ein Programm, das Modelle ausführt, etwa vLLM oder Ollama, teilt er sich eine Karte mit einem solchen Programm im Leerlauf (unter 20 % ausgelastet, dreimal im Abstand von einer Sekunde angesehen) und lässt ihm 2 GB mehr frei; solange diese Programme arbeiten, lernt der Durchlauf auf dem Prozessor. Beim ersten Mal auf einer NVIDIA-Karte lädt die App dafür PyTorch herunter, etwa 2,5 GB, in ihren eigenen Ordner, und der Durchlauf wartet darauf; die Zeile unter dem Schalter sagt das. Lässt sich die Karte nicht einrichten oder fällt sie in einem Durchlauf aus, macht dieser Durchlauf sofort auf dem Prozessor weiter, und die Karte bleibt einen Tag lang unberührt; die Einstellung nennt den Grund. Schalte sie aus, um immer auf dem Prozessor zu lernen.
- **[Jetzt neu trainieren](/settings?s=suggest&find=Retrain%20now)** lernt sofort erneut aus allem, was du geschrieben hast, und beginnt dabei beim kleinen Modell, das mit der App geliefert wurde.
- **[Gelerntes vergessen](/settings?s=suggest&find=Forget%20what%20it%20learned)** löscht nach deiner Bestätigung das aus deinen Texten entstandene Modell und kehrt zu dem zurück, das mit der App kam. Zum nächsten festgelegten Zeitpunkt lernt es wieder, es sei denn, du hast das Lernen ausgeschaltet.

Die Zeile unter dem Schalter sagt, welches kleine Modell gerade verwendet wird, wann es zuletzt gelernt hat, wie weit ein Lerndurchlauf ist und wo er lernt (**Auf der Grafikkarte: …** oder **Auf dem Prozessor**).

Solange ein Durchlauf läuft, hat diese Zeile **Pausieren** und **Stoppen**. **Pausieren** hält den Durchlauf dort an, wo er ist, und behält, was er bisher gelernt hat; die Zeile lautet dann **Pausiert bei 45 %** mit **Fortsetzen** und **Stoppen**, und nichts startet ihn von selbst wieder, auch nicht der Zeitplan, bis du auf **Fortsetzen** drückst (**Jetzt neu trainieren** tut dasselbe); das gilt auch nach einem Neustart der App. **Fortsetzen** macht dort weiter, wo er aufgehört hat, mit denselben Texten, die er gerade las. **Stoppen** fragt vorher nach, verwirft dann, was dieser Durchlauf bisher gelernt hat (das Modell, das du jetzt verwendest, bleibt), und der nächste Durchlauf wartet seine übliche Zeit. Schaltest du das Lernen aus oder wählst **Gelerntes vergessen**, endet auch ein pausierter Durchlauf.

### Wie viel es hilft

Unter **So hilft es dir** im selben Bereich zeigen zwei Zeilen, was die Vorschläge bisher für dich getan haben: die **gesparten Tastenanschläge** (und welchen Anteil deines Tippens das ausmacht) und wie viele Vorschläge von den bewerteten **Richtig** waren, dazu, wie viele du mit Tab übernommen hast. Ein Vorschlag ist richtig, wenn du ihn übernommen hast (Tab oder → für zwei Wörter) oder das ganze graue Wort selbst getippt hast; er ist falsch, wenn du etwas anderes getippt hast, während er angezeigt wurde. Einer, den du mit Esc ausgeblendet hast oder der verschwunden ist, weil du woanders geklickt, die Nachricht gesendet oder den Cursor bewegt hast, zählt weder als richtig noch als falsch. Jedes Tab oder → spart die Buchstaben, die es einfügt, abzüglich der einen Taste, die du gedrückt hast.

**Details anzeigen** ergänzt heute, diese Woche und die Gesamtsumme seit Beginn der Zählung, und **[Zahlen zurücksetzen](/settings?s=suggest&find=Reset%20the%20numbers)** beginnt nach deiner Bestätigung wieder bei null. Es werden nur Zähler gespeichert, nie das, was du getippt hast, und sie ändern nichts an der Funktionsweise der Vorschläge.

## Eine Nachricht diktieren

Das Mikrofon im Nachrichtenfeld (auf der Startseite und in jeder Sitzung) verwandelt das, was du sagst, in Text in deiner Nachricht. Nichts wird von selbst gesendet: Du liest es durch und sendest es wie gewohnt.

1. Klicke oder tippe auf das Mikrofon.
2. Sprich. Ein Bereich über dem Nachrichtenfeld zeigt die Zeit, die bisher gehörten Wörter (oder, wenn der Server die Sprache erkennt, „Aufnahme …“ mit Balken, die deiner Stimme folgen) und die Sprache, auf die gehört wird.
3. Klicke auf **Fertig** oder noch einmal auf das Mikrofon. Die Wörter werden an das angehängt, was du schon geschrieben hast (beim Server erscheint zuvor kurz „Deine Worte werden in Text umgewandelt …“).

Das Sprachchip im Bereich („DE“, „PT-BR“) ändert die Sprache, während du sprichst; es geht in der neuen Sprache weiter. Wenn der Server die Sprache erkennt, endet eine Aufnahme nach 10 Minuten von selbst.

Das Mikrofon erscheint nur dort, wo Diktieren funktionieren kann: wenn der Browser die Sprache selbst erkennt (Chrome, Edge, Safari) oder wenn der Server sie erkennt (siehe [Spracherkennung auf dem Server](/guide/documents-voice#speech-recognition-on-the-server)). Wenn es nicht starten kann, sagt es, warum und was zu tun ist:

- **Das Mikrofon benötigt eine sichere Verbindung**: Browser erlauben es nur über eine HTTPS-Adresse oder über localhost auf dem Computer selbst. Öffne Hydor über eine HTTPS-Adresse (siehe [Smartphones, andere Computer und Teilen](/guide/devices)).
- **Das Mikrofon ist für diese Website gesperrt**: Erlaube es in den Website-Einstellungen des Browsers (auf einem iPhone: **aA** in der Adressleiste, dann **Website-Einstellungen → Mikrofon**) und versuche es dann erneut.
- **Es wurde kein Mikrofon gefunden** oder **Das Mikrofon wird bereits verwendet** (eine andere App nutzt es).
- **Die Spracherkennung ist hier deaktiviert**: Schalte auf einem iPhone das Diktieren unter Einstellungen → Allgemein → Tastatur ein, oder lass den Server die Sprache erkennen.
- **Dieser Browser kann nicht aufzeichnen**: Nutze ein aktuelles Chrome, Edge, Firefox oder Safari.

Jeder dieser Hinweise hat eine Schaltfläche **Spracheinstellungen**, die Einstellungen → Stimme öffnet.

## Spracheingabe einrichten

Alles zur Spracheingabe findest du unter **[Einstellungen → Funktionen → Spracheingabe](/settings?s=voice)** (auf dem Smartphone: Einstellungen, dann **Spracheingabe**). Sie besteht aus drei Teilen.

### Diktieren

**[Diktieren](/settings?s=voice&find=Dictation)** zeigt zuerst, was dieser Browser kann:

- Ein Browser, der Sprache selbst erkennt, zeigt deine Worte schon beim Sprechen an. Dafür kann er deine Stimme an seinen Hersteller senden (Chrome an Google, Safari an Apple). Damit deine Stimme auf deinem Computer bleibt, schalte unten whisper.cpp ein und wähle den Server.
- Ein Browser, der Sprache nicht selbst erkennen kann, diktiert über den Server, sobald die Spracherkennung auf dem Server eingeschaltet ist.

Dann folgt:

- **[Sprache, die du sprichst](/settings?s=voice&find=Language%20you%20speak)**: **Browsersprache verwenden** oder eine von 56 Sprachen und Regionen. Das Diktieren hört auf diese Sprache, und der Freihändig-Modus spricht und hört in ihr.
- **Erkennen mit**: **Dieser Browser** (die Worte erscheinen beim Sprechen) oder **Der Server** (privat mit whisper.cpp; die Worte erscheinen, wenn du aufhörst). Die Auswahl erscheint nur, wenn beides möglich ist.

Die Sprache und **Erkennen mit** werden in diesem Browser gespeichert, daher hat jedes deiner Geräte eigene Werte.

### Spracherkennung auf dem Server

**[Spracherkennung auf dem Server](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** ist für Browser, die Sprache nicht selbst erkennen können, oder damit deine Stimme auf deinem Computer bleibt. Sie ist aus, bis du sie einschaltest, und vorher wird nichts heruntergeladen. Sie wird einmal für die App festgelegt und gilt auf allen Geräten. Wähle unter **Ausführungsort** eine von drei Möglichkeiten:

- **Aus**.
- **Auf diesem Computer**: whisper.cpp läuft auf dem Computer, auf dem Hydor läuft, auf dessen GPU, wenn er eine hat, die whisper.cpp nutzen kann (die eines Macs oder eine NVIDIA-GPU), sonst auf dem Prozessor. Deine Stimme bleibt dort.
  - **Modell**: **Winzig** (74 MB; am schnellsten, verhört sich ab und zu bei einem Wort), **Basis** (141 MB; schnell und für die meisten Diktate gut genug, die Voreinstellung), **Klein** (465 MB; versteht besser, auf einer CPU einige Sekunden pro Satz) oder **Mittel** (1,4 GB; versteht am besten, ohne schnelle CPU langsam).
  - **Sprachen**: **Jede Sprache** (folgt der Sprache, die du sprichst) oder **Nur Englisch** (auf Englisch etwas genauer).
  - **Einschalten · … herunterladen** sagt, wie viel heruntergeladen wird: das Modell und beim ersten Mal auch whisper.cpp selbst (ist schon alles da, schaltet die Auswahl von **Auf diesem Computer** die Erkennung sofort ein). Ein Balken zeigt den Download; **Abbrechen** stoppt ihn und schaltet die Spracherkennung auf dem Server aus. Unter Linux lädt die App ein fertiges whisper.cpp herunter, das auf dem Prozessor läuft; auf einem Mac und dort, wo das fertige nicht läuft, baut sie whisper.cpp auf diesem Computer, wofür ein C++-Compiler und CMake nötig sind (unter Debian oder Ubuntu: `sudo apt install build-essential cmake`; auf einem Mac: `xcode-select --install`, dann `brew install cmake`). Auf einem Mac wird es für die GPU des Macs (Metal) gebaut. Ein eigenes whisper.cpp auf dem Computer (zum Beispiel eines, das für deine GPU gebaut wurde) wird unverändert verwendet.
  - **Eine NVIDIA-GPU** unter Linux: Für whisper.cpp gibt es dafür keinen fertigen Build. Sobald das Diktieren auf dem Prozessor funktioniert, baut die App deshalb im Hintergrund einen für die GPU, mit NVIDIAs CUDA-Toolkit (`nvcc`). Ein Balken zeigt den Fortschritt (es dauert 5 bis 20 Minuten); in der Zwischenzeit funktioniert das Diktieren auf dem Prozessor, danach auf der GPU. Fehlt das Toolkit, weist ein Hinweis darauf hin, mit **Erneut prüfen**, sobald du es installiert hast. Schlägt der Build fehl, wird der Grund mit **Erneut versuchen** angezeigt, und das Diktieren bleibt auf dem Prozessor.
  - Wenn alles bereit ist, steht dort: „Bereit: whisper.cpp … mit dem Modell Basis. Deine Stimme bleibt hier.“ Darunter steht, worauf es läuft, so wie whisper.cpp es beim letzten Lauf gemeldet hat (gleich nach der Bereitschaft probiert es eine Sekunde Stille aus): „Es läuft auf der GPU: Apple M2 Pro (Metal).“ oder „Es läuft auf dem Prozessor dieses Computers.“ Schlägt die GPU fehl (etwa wegen fehlenden Speichers), wird diese Aufnahme auf dem Prozessor verarbeitet, der Hinweis nennt den Grund, und einige Minuten später wird die GPU erneut versucht. **Testen** prüft, ob es antwortet und wie schnell. Ist etwas fehlgeschlagen, wird der Grund mit **Erneut versuchen** angezeigt.
  - Wählst du bei eingeschalteter Erkennung ein anderes Modell, wird dieses Modell heruntergeladen.
- **Ein Dienst**: jeder Dienst mit der Speech-to-Text-Adresse von OpenAI (`/audio/transcriptions`): OpenAI selbst oder ein Server in deinem Netzwerk (Speaches, LocalAI, der Server von whisper.cpp, einer auf einer GPU). Aufnahmen werden an ihn gesendet.
  - **Einrichten** (danach **Bearbeiten**) in der Zeile des Dienstes öffnet ein Formular: **Adresse** (zum Beispiel `https://api.openai.com/v1`), **API-Key** (die meisten Server in deinem Netzwerk brauchen keinen) und **Modell** (`whisper-1`, wenn du kein anderes angibst).
  - **Speichern und einschalten** (danach **Speichern**); **Testen** in seiner Zeile, sobald er eingeschaltet ist; und **Key entfernen** in seinem Menü **⋯**, sobald ein Key gespeichert ist. Ist ein Dienst gespeichert, wechselt ein erneutes Auswählen von **Ein Dienst** sofort zu ihm.

Eine Gruppe, **Auf diesem Computer**, listet mit ihrer Gesamtgröße auf, was whisper.cpp auf diesem Computer hinterlassen hat: whisper.cpp selbst („hier für Metal gebaut“ oder „für CUDA“, wenn die App es für eine GPU gebaut hat) und jedes Modell mit seiner Größe, das verwendete mit der Markierung „in Gebrauch“. Das Menü **⋯** eines Modells enthält **Entfernen** (das Entfernen des verwendeten Modells schaltet die Spracherkennung auf dem Server nach deiner Bestätigung aus). **Alles entfernen** im eigenen Menü **⋯** der Gruppe entfernt whisper.cpp und seine Modelle; es erscheint, solange die Spracherkennung auf dem Server aus ist oder einen Dienst verwendet.

### Vorlesen

**[Vorlesen](/settings?s=voice&find=Read%20aloud)**: Der Lautsprecher an einer Antwort liest sie dir vor und lässt ihren Code aus. Jeder Browser behält seine eigene Stimme und Geschwindigkeit (das (i) der Gruppe weist darauf hin).

- **Stimme**: **Automatisch** (die Stimme des Browsers für die Sprache, die du sprichst) oder jede Stimme, die dieser Browser hat, zuerst die für deine Sprache. Jede nennt ihre Sprache und „online“, wenn sie das Internet braucht.
- **Geschwindigkeit**: von 0,5× bis 2×.
- **Ausprobieren**: **Hörprobe abspielen** liest einen Satz mit dieser Stimme und Geschwindigkeit vor.

Kann der Browser keinen Text vorlesen, steht das im Abschnitt.

## Eine Antwort vorlesen lassen

1. Zeige auf eine Antwort: Oben rechts erscheint neben der Kopieren-Schaltfläche ein Lautsprecher.
2. Klicke darauf. Eine Leiste über dem Nachrichtenfeld zeigt **Vorlesen**, welcher Teil von wie vielen, und die ersten Worte der Antwort.
3. Pausiere und setze sie in der Leiste fort, oder stoppe sie dort oder mit dem Lautsprecher.

Die Antwort wird als normaler Text gelesen: Code wird ausgelassen, Links werden mit ihren Worten gelesen, Webadressen mit ihrer Website und Tabellen Zeile für Zeile. Startest du eine andere Antwort, wird die erste gestoppt, und beim Verlassen der Unterhaltung hört das Vorlesen auf. Der Lautsprecher erscheint, wenn du mit der Maus darauf zeigst; auf dem Smartphone liest dir der Freihändig-Modus Antworten vor („Lies mir die Antwort vor“).

## Freihändig mit der App sprechen

Der Freihändig-Modus ist für Momente gedacht, in denen du nicht auf den Bildschirm schauen kannst, etwa beim Gehen: Du sprichst, die App erledigt es und sagt, was sie getan hat, und hört dann wieder zu. Sie startet Sitzungen, gibt deine Worte an sie weiter, sagt, wie es ihnen geht, beantwortet ihre Genehmigungen und liest dir ihre Ergebnisse vor.

### Starten und beenden

- In einer Sitzung öffnet die Kopfhörer-Schaltfläche im Nachrichtenfeld (**Freihändig**, neben dem Mikrofon) den Modus und folgt dieser Sitzung.
- Auf der Startseite öffnet dieselbe Schaltfläche ihn, ohne einer bestimmten Sitzung zu folgen.
- Im Suchfeld (Ctrl+K, ⌘K auf einem Mac) öffnet ihn auch die Aktion **Freihändig sprechen**.

Er füllt den Bildschirm, sagt „Ich höre zu“ und bittet das Gerät, den Bildschirm eingeschaltet zu lassen, solange er offen ist. Oben siehst du die Sitzung, der er folgt (oder „Mit Hydor sprechen“). Die große runde Schaltfläche zeigt, was gerade geschieht: **Zuhören…**, **Wird bearbeitet…**, **Sprechen** oder **Pausiert: Zum Sprechen tippen**. Darunter siehst du in Anführungszeichen, was verstanden wurde, und die Antwort.

- Tippe auf die runde Schaltfläche, während gesprochen wird, um es abzubrechen; tippe zu anderen Zeiten darauf, um zu pausieren oder weiter zuzuhören.
- Zum Beenden sagst du „Auf Wiedersehen“ (oder „Tschüss“, „Das war’s“, „Nicht mehr zuhören“, „Freihändig beenden“, „Beenden“) oder tippst oben rechts auf das Kreuz.

### Was du sagen kannst

- **Sitzung starten**: „Starte eine Sitzung, um mein Wochenende auf Kreta zu planen“. Sie startet so wie von der Startseite aus: mit dem Programm, Modell, Aufwand, den Berechtigungen, dem Agenten und dem Projekt, die du dort zuletzt gewählt hast, in einem neuen Aufgabenordner (oder in dem Ordner, den du dort zuletzt gewählt hast). Von da an folgt sie dieser Sitzung.
- **Einer Sitzung etwas sagen**: „Sag ihr, sie soll metrische Einheiten verwenden“. Die Worte gehen als deine Nachricht an die Sitzung, der sie folgt.
- **Fragen, wie es steht**: „Wie geht es meinen Sitzungen?“ Sie sagt, was gerade arbeitet, was dich braucht und was gefragt wird, und was zuletzt fertig wurde.
- **Das Ergebnis hören**: „Lies mir die Antwort vor“. Sie liest die letzte Antwort der Sitzung vor, der sie folgt (oder, wenn sie keiner folgt, der geschäftigsten oder zuletzt aktiven Sitzung). Eine lange Antwort kommt als Kurzfassung in drei bis fünf Sätzen; wird die App in einer anderen Sprache als Englisch angezeigt, kommt jede Antwort als Kurzfassung in dieser Sprache.
- **Eine Genehmigung beantworten**: „Genehmigen“ oder „Ablehnen“, wenn die Sitzung, der sie folgt (oder, wenn sie keiner folgt, irgendeine Sitzung), auf ein einfaches Ja oder Nein wartet. Eine Frage, ein Plan oder ein Formular muss auf dem Bildschirm beantwortet werden, und sie sagt dir das.
- **Die Arbeit stoppen**: „Stopp“ stoppt, was die Sitzung, der sie folgt, gerade tut (es beendet den Freihändig-Modus nicht).
- **Wechseln**: Nenne eine andere Sitzung („Lass uns über die Kreta-Reise sprechen“), und sie folgt dieser.
- Frage nach der App oder nach etwas ganz anderem: Sie antwortet kurz oder fragt nach, wenn sie sich nicht sicher ist.

### Was sie dir von selbst sagt

- Wenn die Sitzung, der sie folgt, fertig ist: „… ist fertig. Sag „vorlesen“, um die Antwort zu hören.“
- Wenn irgendeine Sitzung dich braucht: „… braucht dich: …“, dann „Sag genehmigen oder ablehnen“ bei einem einfachen Ja oder Nein oder „Beantworte es auf dem Bildschirm“. Danach folgt sie dieser Sitzung, sodass „Genehmigen“ sie beantwortet.
- Wenn irgendeine Sitzung mit einem Fehler stoppt: „… wurde mit einem Fehler gestoppt.“

Sie hört dafür auf zuzuhören, um das zu sagen, und hört danach wieder zu. Sitzungen auf deinen anderen Computern werden nicht angekündigt.

### Gut zu wissen

- Das Hilfsmodell versteht, was du sagst ([Einstellungen → Agenten → Modelle → Hilfsmodell](/settings?s=models&find=Helper%20model)). Ist es nicht erreichbar, funktionieren einfache Wörter trotzdem: „Status“, „genehmigen“ oder „ja“, „ablehnen“ oder „nein“, „stopp“, „vorlesen“, „starte …“; alles andere geht an die Sitzung, der sie folgt, oder startet eine neue Sitzung, wenn sie keiner folgt.
- Sie antwortet in der Sprache, in der die App angezeigt wird (Einstellungen → Allgemein → Sprache), und hört in der Sprache zu, die du sprichst (Einstellungen → Spracheingabe), sonst in der Sprache der App.
- Sie spricht mit der Stimme und Geschwindigkeit aus [Vorlesen](/guide/documents-voice#read-aloud).
- Sie braucht einen Browser, der vorlesen kann, und eine Möglichkeit zuzuhören: die eigene Spracherkennung des Browsers (Chrome, Edge, Safari) oder die Spracherkennung auf dem Server. Die Kopfhörer erscheinen nur dort, wo es funktionieren kann. Beim Server endet jede Äußerung nach anderthalb Sekunden Stille (höchstens eine halbe Minute), und nach 15 Sekunden Stille hört er wieder zu.
- Ist das Mikrofon nicht erlaubt oder gibt es keines, sagt sie das einmal und pausiert: Erlaube es im Browser und tippe dann zum Zuhören.

## Einen Agenten fragen

- „Füll das Formular ~/Downloads/visa-application.pdf mit meinen Angaben aus meinem Profil aus und frag mich nach dem Rest.“
- „Schreib das heutige Datum und meinen Namen auf die Zeilen von ~/Documents/permission-slip.pdf und kreuz Ja an.“
- „Nimm die Seiten 3 bis 5 aus ~/Documents/contract.pdf heraus und speichere sie in einer eigenen Datei.“
- „Richte die Wortvorschläge jetzt ein, bevor ich tippe, und sag mir, wenn sie bereit sind.“
- „Lass die Wortvorschläge nur die anzeigen, bei denen du dir sicherer bist, und nicht das nächste Wort.“
- „Sorge dafür, dass die Wortvorschläge nicht aus den Antworten von Agenten lernen, sondern nur, wenn ich es verlange.“
- „Pausiere das Lernen der Wortvorschläge und setze es heute Nacht fort.“ / „Stoppe das Lernen, das gerade läuft.“
- „Lernen die Wortvorschläge auf der Grafikkarte? Wenn nicht, warum nicht?“ / „Lass die Wortvorschläge nur auf dem Prozessor lernen.“
- „Läuft das Sprachmodell für die Wortvorschläge? Wenn nicht, warum?“
- „Schalte die Wortvorschläge nur in diesem Browser aus.“
- „Wie viele Tastenanschläge haben mir die Wortvorschläge erspart?“
- „Schalte die Spracherkennung auf diesem Computer ein, mit dem Modell Klein.“
- „Verwende meinen Sprachserver unter http://192.168.1.20:8000/v1 für das Diktieren, mit dem Modell whisper-large-v3.“
- „Welche Whisper-Modelle sind auf diesem Computer, und wie viel Platz brauchen sie? Entferne die, die nicht verwendet werden.“
- „Läuft das Diktieren auf meiner GPU? Wenn nicht, warum nicht?“
- „Welche Bildmodelle verwenden Agenten jetzt für die meisten Bilder und für einfache, und was kostet ungefähr ein Bild mit jedem?“
- „Stelle das Bildmodell für die meisten Bilder auf das günstigste um, das Bilder bearbeiten kann.“
- „Verwende Recraft V4.1 Flash für einfache Bilder.“
- „Richte die Bildwerkzeuge auf diesem Computer ein.“
- „Laufen die Bildwerkzeuge hier auf der Grafikkarte? Wenn eines auf der CPU läuft, warum?“
- „Mach ein flaches Icon von einem Fahrrad in #0f766e und #f59e0b, als Zeichnung, die scharf bleibt.“
- „Zeichne ~/data/sales.csv als monatliche Balken, 2025 gegen 2026, und beschrifte den Sprung im Frühjahr.“
- „Finde drei kostenlose Fotos von Lissabons Straßenbahnen für meine Reisefolien, mit den Quellenangaben.“
- „Entferne den Hintergrund aus ~/Pictures/mug.jpg.“
- „Radiere den Mann links aus beach.jpg weg; wenn es verschmiert aussieht, lass ein Bildmodell das machen.“
- „Schneide ~/Pictures/team.jpg auf 16:9 zu, mach es etwas heller und verwische die Gesichter im Hintergrund.“
- „Schneide aus demo.mp4 den Teil von 0:12 bis 0:40 heraus, blende am Anfang ‚Unsere neue App‘ ein und mach auch ein GIF daraus.“
- „Entferne die Ähs und die langen Pausen aus interview.m4a, reduziere das Hintergrundrauschen und mach es so laut wie einen Podcast.“
- „Hindere Agenten daran, Bilder zu erstellen.“
- „Welche Videomodelle erzeugen Ton, und was kostet eine Sekunde mit jedem?“
- „Lass Agenten Kling für Videos verwenden.“
- „Hindere Agenten daran, Videos zu erstellen.“
- „Welches Musikmodell verwenden Agenten, und was kostet ein Song?“
- „Verwende ElevenLabs v3 für Sprecherstimmen, mit der Stimme George.“
- „Hindere Agenten daran, Audio zu erstellen.“
