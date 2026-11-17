# Dokumente, Bilder, Videos und Sprache

Agenten in Hydor lesen PDFs, Word-, Excel-, PowerPoint- und andere Dokumente, erstellen neue Dateien und übergeben sie als Karten zum Öffnen oder Herunterladen. Sie können auch Bilder, Zeichnungen, Plots und kurze Videos erstellen, frei nutzbare Fotos suchen, Bilder und Videos zuschneiden, freistellen, retuschieren oder kürzen sowie Musik, Voice-overs und Geräusche erzeugen. Dafür nutzen sie Bild-, Video- und Audiomodelle oder lokale Werkzeuge. Ergebnisse kannst du in der Bibliothek speichern. Außerdem kannst du Nachrichten sprechen, Antworten vorlesen lassen oder Hydor unterwegs freihändig bedienen.

![Ein Agent erstellt aus einem Bericht eine einseitige Word-Zusammenfassung und eine Tabelle mit Diagramm](images/documents-voice.webp)

## Einem Agenten ein Dokument zum Lesen geben

Alle von Hydor gestarteten Agenten können Dokumente lesen: Claude Code, Codex, Custom und ACP-Agenten mit MCP-Unterstützung. Eine vorherige Konvertierung ist nicht nötig. Du hast drei Möglichkeiten:

1. **An Nachricht anhängen**: Nutze die Büroklammer **Dateien anhängen** im Nachrichtenfeld, ziehe die Datei dorthin oder füge sie ein. Bilder gehen als Bilder an das Modell. Andere Dateien werden auf dem Hydor-Computer gespeichert; ihr Pfad steht in deiner Nachricht, damit der Agent sie öffnen kann. Pro Nachricht sind bis zu 25 MB möglich.
2. **Lokale Datei benennen**: etwa „Fasse ~/Documents/lease.pdf zusammen“. Pfade ohne führendes `/` oder `~` beginnen im Sitzungsordner.
3. **Dokumente im Projekt oder gemeinsamen Wissen speichern**, damit Sitzungen sie durchsuchen und mit Seitenangabe zitieren können; siehe [Projekte und Wissen](/guide/projects).

Während des Lesens erscheint **lease.pdf wird gelesen**, danach **lease.pdf gelesen**. Auf breiteren Bildschirmen stehen auch Dateityp, Seiten, Tabellenblätter oder Folien und gelesene Zeilen dabei. Ein Klick zeigt den vom Agenten erhaltenen Text; **lease.pdf öffnen** öffnet die Datei.

Lange Dokumente werden in Abschnitten von etwa 1.200 Zeilen gelesen. Der Agent erfährt, wenn weitere Abschnitte vorhanden sind. Dokumentinhalte werden als Informationen behandelt, nicht als Anweisungen. Makros und andere Dokumentfunktionen werden nicht ausgeführt; nur Web- und E-Mail-Links bleiben erhalten.

Custom liest PDFs, Office-Dokumente und Bilder auch über seine normale Dateilesefunktion; siehe [Custom, Hydors eigener Agent](/guide/custom).

## Welche Dokumentinhalte Agenten lesen können

### PDF

- Text jeder Seite in einer dem Original entsprechenden Anordnung.
- Am besten funktioniert dies mit pdftotext aus poppler-utils. Ohne dieses Programm lädt Hydor einmalig pdf.js, etwa 35 MB, herunter. Dafür ist beim ersten Mal Internet nötig; das Layout wird nur angenähert.
- Gescannte Seiten enthalten keinen auslesbaren Text. Der Agent erfährt die betroffenen Seiten, etwa „Seiten 3, 5–7 ohne Text“. Mit dem Skill **pdf** betrachtet er diese als Bilder und liest sie selbst oder verwendet bei installiertem tesseract OCR.
- Passwortgeschützte PDFs sind ohne Passwort nicht lesbar. Gib dem Agenten das Passwort, damit der Skill **pdf** eine entsperrte Kopie erstellt. PDFs, die ohne Passwort öffnen, aber Änderungen beschränken, etwa viele amtliche Formulare, werden normal gelesen.
- **Formulare**: Der Agent listet Felder mit den daneben gedruckten Beschriftungen auf. Dadurch erkennt er auch den Zweck eines Feldes namens „f1_02“. Zusätzlich betrachtet er Seitenbilder mit nummerierten Feldern und einem Lineal in Punkten.
- **Markierungen und Notizen**: Hervorhebungen aus dem Dateibetrachter, nach Seiten geordnet, samt Notizen und Bildern markierter Gleichungen oder Abbildungen. Der Agent kann sie zusammenfassen oder gegen das Paper prüfen. Auf Wunsch markiert er auch Text für dich; diese Markierungen erscheinen im Betrachter. Siehe [PDF lesen und markieren](/guide/files-git#read-and-highlight-a-pdf).

### Word, Excel und PowerPoint

- **Word** mit .docx sowie Makro- und Vorlagenvarianten: Überschriften, Absätze, nummerierte und unnummerierte Listen, Tabellen, Links, Textfelder, Bildbeschreibungen, Fußnoten, Endnoten und Kommentare.
- **Excel** mit .xlsx sowie Makro- und Vorlagenvarianten: jedes Tabellenblatt mit Zeilennummern und Spaltenbuchstaben, annähernd formatierten Zahlen für Datum, Prozent und Geld sowie bis zu 40 Formeln pro Blatt. Ausgeblendete Blätter sind gekennzeichnet. Zunächst werden je Blatt bis zu 2.000 Zeilen und 60 Spalten gelesen; der Agent wird über weitere informiert. Für vollständige größere Blätter verwendet der Skill **spreadsheets** einen anderen Leseweg.
- **PowerPoint** mit .pptx sowie Makro-, Vorlagen- und Bildschirmpräsentationsvarianten: Folientitel, Text, Tabellen, Bildbeschreibungen, Diagrammtitel und Datenreihen sowie Vortragsnotizen. Ausgeblendete Folien sind gekennzeichnet. Bis zu 1.000 Folien.

### OpenDocument, EPUB, CSV und RTF

- **OpenDocument** mit LibreOffice-Dateien .odt, .ods, .odp, ihren Vorlagen und .odg: Text mit Überschriften, Listen, Tabellen, Links und Fußnoten, angezeigte Tabelleninhalte sowie Folien mit Titel, Text und Notizen.
- **EPUB**: Kapitel in Lesereihenfolge mit Überschriften, Listen, Tabellen und Zitaten.
- **CSV**- und **TSV**-Tabellen sowie **RTF**-Text.

### Alte Office-Dateien, geschützte und sehr große Dateien

- Alte .doc-, .xls- und .ppt-Dateien werden über LibreOffice gelesen, das sie zuerst in das aktuelle Format umwandelt. Ohne LibreOffice lassen sie sich nicht lesen, und der Agent wird angewiesen, dich um die Datei als .docx, .xlsx oder .pptx gespeichert zu bitten oder darum, LibreOffice zu installieren.
- Passwortgeschützte Word-, Excel- und PowerPoint-Dateien können nicht gelesen werden.
- Unterstützt werden Dateien bis 300 MB. Pro Dokument werden bis zu etwa 1.000.000 Textzeichen beziehungsweise 250.000 Token gelesen. Darüber wird der Text gekürzt und der Agent informiert.

## Ein Dokument erstellen lassen

Hydor bringt vier Dokument-Skills mit, die jeder Agent laden kann: **word-documents**, **spreadsheets**, **presentations** und **pdf**. Du findest sie unter [Einstellungen → Skills](/settings?s=skills&find=Built%20in) im Bereich **Dokumente**; siehe [Skills](/guide/skills). Du wählst sie nicht selbst aus. Beschreibe einfach die Aufgabe, etwa „Erstelle aus meinen Notizen einen einseitigen Lebenslauf als Word-Dokument“, „Fasse diese Ausgaben mit Monatssummen und Diagramm in einer Tabelle zusammen“, „Erstelle acht Folien für meinen Vortrag über Bienen“ oder „Führe diese drei PDFs zusammen“. Der Agent lädt den passenden Skill.

Alle vier folgen demselben Ablauf:

1. Der Agent plant Gliederung, Tabellenblätter oder Folien.
2. Ein kurzes Skript im Sitzungsordner erstellt die Datei.
3. Der Agent betrachtet Seitenbilder, prüft überlaufenden Text, unpassende Tabellen und überfüllte Folien und korrigiert Fehler.
4. Er übergibt die Datei als Karte unter seiner Antwort mit kurzer Beschreibung; siehe [Erstellte Dateien öffnen oder herunterladen](/guide/documents-voice#open-or-download-the-files-an-agent-made).

Änderungen an deinen Dateien werden unter neuem Namen gespeichert, sofern du kein Überschreiben beauftragt hast.

### Word-Dokumente

Berichte, Briefe, Lebensläufe, Memos, Verträge, Formulare, Handouts und Notizen für Word, Google Docs oder Pages.

- Echte Struktur: Überschriften (die im Navigationsbereich von Word und mit Screenreadern funktionieren), Listen mit Aufzählungszeichen und nummerierte Listen, Tabellen mit Kopfzeile, Bilder und Seitenumbrüche.
- Inhaltsverzeichnis, das Word beim Öffnen aktualisiert, Seitenzahlen wie „Seite 1 von 3“, Links und schattierte Tabellenzellen.
- A4 oder US Letter mit verbreiteten Schriftarten wie Calibri, Arial, Cambria und Times New Roman.
- Bearbeitung vorhandener Dokumente mit erhaltenen Stilen, Kopfzeilen und Layout, formatierungstreuem Textersatz und Kommentaren.
- Deine gespeicherte Unterschrift anstelle von {{signature}}, nach Text wie „Unterschrift:“, in einer Tabellenzelle oder am Ende, sobald du die Platzierung auf einer Karte freigibst; siehe [Unterschriften](/guide/library#signatures).
- Zusätzlich eine PDF-Fassung über LibreOffice.

### Tabellen

Budgets, Übersichten, Zeitpläne, Rechnungen und Datentabellen als .xlsx.

- Eingaben als Werte, Ergebnisse als Formeln, damit Änderungen automatisch weitergerechnet werden.
- Zahlenformate für Beträge, Prozente und Datum, fette fixierte Kopfzeile, angepasste Spaltenbreiten und Listenfilter.
- Balken-, Linien- und Kreisdiagramme neben den Daten.
- Prüfung jeder Formel. Mit LibreOffice werden Formeln berechnet und Fehler wie #REF!, #DIV/0! und #NAME? aufgelistet und vom Agenten korrigiert.
- Bearbeitung deiner Arbeitsmappen mit erhaltenen Formeln, Stilen und großen Teilen des Layouts. Pivot-Tabellen bleiben nicht erhalten, Diagramme nur bei erneuter Erstellung. Auf Wunsch entsteht stattdessen eine CSV-Datei.

### Präsentationen

Pitchdecks, Vorträge, Unterricht und Zusammenfassungen als .pptx für PowerPoint, Keynote oder Google Slides.

- Klare 16:9-Folien mit einheitlicher Gestaltung und deiner Markenfarbe: Titel, Aufzählungsebenen, zwei Spalten, eingepasste Bilder, Tabellen, Säulen-, Balken-, Linien-, Kreis- und gestapelte Diagramme, Abschnittsfolien und Vortragsnotizen.
- Ein Gedanke pro Folie, mit aussagekräftigem Titel wie „Umsatz um 12 % gestiegen“. Ein Vortrag umfasst meist 6 bis 12 Folien.
- Bilder von dir, aus dem Web oder einem Bildmodell; siehe [Bilder durch Agenten erstellen lassen](/guide/documents-voice#let-agents-make-images).
- Neue Präsentationen mit deiner Vorlage oder Änderungen unter Erhalt des Designs und der Layouts.
- PDF-Fassung über LibreOffice.

### PDFs

Berichte, Rechnungen, Urkunden, Flyer, Briefe und Formulare.

- Für textlastige oder später bearbeitbare Inhalte erstellt der Agent zuerst Word und daraus mit LibreOffice ein PDF.
- Für exakt positionierte Inhalte wie Rechnungen, Urkunden, Tickets und Formulare zeichnet er das PDF direkt.
- Folien und Tabellen entstehen mit dem jeweiligen Skill und werden anschließend als PDF ausgegeben.
- **Formular ausfüllen**: benannte Felder für Text, Häkchen und Auswahl mit Unterstützung beliebiger Schriftsysteme, sodass sie in anderen Betrachtern sichtbar und bearbeitbar bleiben. Bei gedruckten Linien und Kästchen platziert der Agent Text neben Beschriftungen wie „Geburtsdatum:“ und Häkchen in Feldern. Bei Scans erkennt er die Leerstellen auf dem Seitenbild. Fehlende Angaben fragt er ab und kontrolliert vorher und nachher die Seiten. Digitale Signaturen bleiben gültig, wenn ausschließlich Formularfelder ausgefüllt werden. XFA-Formulare aus Adobe LiveCycle funktionieren nur in Adobe-Anwendungen; der Agent weist darauf hin, kann aber dennoch die Seiten beschreiben.
- **Seiten beschreiben**: Text, Häkchen, Kreuze, Bilder, Umrandungen, Linien sowie echte PDF-Markierungen und Kommentare. Weiße Rechtecke verdecken Text nur optisch; der Text bleibt in der Datei. Das ist keine sichere Schwärzung. Andere Betrachter können echte Kommentare auflisten und entfernen.
- **Seiten bearbeiten**: drehen, löschen, verschieben, leere Seiten einfügen, PDFs zusammenführen, Seiten extrahieren und Dateien aufteilen. Solche Änderungen können digitale Signaturen nicht erhalten; der Agent weist darauf hin.
- Ergebnisse liegen als Kopie neben dem Original, etwa „name (filled).pdf“. Beauftragst du die Änderung des Originals, wandert dessen alte Fassung in den Papierkorb. Du kannst auch selbst [PDFs ausfüllen und unterschreiben](/guide/files-git#fill-in-and-sign-a-pdf).
- Helle Wasserzeichen wie ENTWURF auf allen Seiten und entsperrte Kopien bei bekanntem Passwort mit dem Skill **pdf**.
- Gespeicherte Unterschrift neben Text oder an einer vorher gezeigten Position, nach Freigabe auf einer Karte und ohne Veränderung vorhandener PDF-Inhalte; siehe [Unterschriften](/guide/library#signatures).
- Office-Dateien als PDF ausgeben.

### Voraussetzungen auf dem Computer

Gemeint ist der Computer, auf dem Hydor läuft, nicht dein Zugriffsgerät.

- **Python 3 mit venv** ist für die Dokumenterstellung nötig. Beim ersten Mal installieren die Skills etwa 30 MB Python-Bibliotheken für Office und PDF in einen privaten App-Ordner, ohne systemweite Installation. Fehlt Python, nennt der Agent den passenden Befehl: unter Debian oder Ubuntu `sudo apt install python3 python3-venv`, auf dem Mac `brew install python`.
- **LibreOffice**, optional, ermöglicht Seitenvorschauen, alte .doc-, .xls- und .ppt-Dateien, die visuelle Agentenprüfung, Formelberechnung und PDF-Export aus Office. Unter Debian oder Ubuntu: `sudo apt install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui`; auf dem Mac: `brew install --cask libreoffice`.
- **poppler-utils**, optional, verbessert das PDF-Lesen und erstellt Seitenbilder für Agenten und **Ausfüllen und unterschreiben**. Ohne diese Werkzeuge nutzt Hydor die PDF-Darstellung von macOS oder Windows oder den unter **Einstellungen → Browser** eingerichteten Browser. Installation: `sudo apt install poppler-utils` beziehungsweise `brew install poppler`.
- **tesseract**, optional, ermöglicht OCR für gescannte PDFs.

Ohne LibreOffice oder poppler-utils prüfen Agenten erstellte Dateien durch erneutes Lesen als Text und halten das Layout einfach.

## Erstellte Dateien öffnen oder herunterladen

Wenn ein Agent Dateien für dich erstellt hat (ein Dokument, eine Tabelle, Folien, ein PDF, Bilder, ein Archiv), übergibt er sie als Karten unter seiner Antwort, bis zu 12 auf einmal. Jede Karte hat:

- farbiges Dateitypsymbol, etwa Word blau, Excel grün, PowerPoint orange und PDF rot, beziehungsweise Bildminiatur;
- den Namen der Datei, was sie ist und ihre Größe („Word-Dokument · 24 KB“);
- Beschreibung des Agenten, etwa „Budget mit einem Blatt pro Quartal“;
- **Öffnen**, Downloadbutton und **Weitere (⋯)**.

**Öffnen** zeigt die Datei über der Unterhaltung, deren Position erhalten bleibt. Auf dem Smartphone öffnet sich das Fenster von unten. **In Dateien öffnen** wechselt zur Dateiseite; Kreuz oder Esc schließen das Fenster. Oben steht der Pfad wie auf der Dateiseite; siehe [Datei öffnen und bearbeiten](/guide/files-git#open-and-edit-a-file). Der Wechsel in einen Ordner schließt zuerst das Fenster und fragt bei ungespeicherten Änderungen nach. Der Downloadbutton speichert auf deinem Gerät.

**Weitere (⋯)** auf Karte und Fenster bietet **Sitzung damit starten** mit vorausgefülltem Nachrichtenfeld, **Zu Projekt hinzufügen** als Kopie im Projektordner, **In Bibliothek speichern** und **Pfad kopieren**, auf Karten zusätzlich **In Dateien anzeigen**. In die Bibliothek lassen sich Jupyter-Notebooks, PowerPoint-, Word-, Markdown-, Tabellen- und LaTeX-Dateien übernehmen und dort im passenden Editor öffnen. Bei vorhandenen Projekten wählst du das Ziel, zunächst das Sitzungsprojekt. Siehe [Sitzung mit Dateien starten](/guide/files-git#start-a-session-with-files) und [Dateien zu einem Projekt hinzufügen](/guide/files-git#add-files-to-a-project).

Verschobene oder gelöschte Dateien zeigen **Nicht mehr vorhanden**. Benennt ein Agent eine nicht existierende Datei, erscheint „Dateien konnten nicht angezeigt werden“ mit Ursache; der Agent wird zur Korrektur aufgefordert.

### Erstellte oder geänderte Dokumente und Dateinamen in Antworten

Nach jeder Runde erscheinen erstellte oder bearbeitete PDF-, Word-, Excel-, PowerPoint- und OpenDocument-Dateien, CSV und TSV, LaTeX, Jupyter-Notebooks, EPUB und Markdown als Karten, auch ohne ausdrückliche Übergabe. Erfasst werden Dateien aus Bearbeitungen und Befehlen im Sitzungsordner: ausdrücklich in der Runde genannte Dateien oder solche neben einer bearbeiteten Datei. Andere Sitzungen im selben Ordner steuern keine Dateien bei.

- Jede Karte sagt **Neu** oder **Aktualisiert**, mit Art und Größe, und hat **Öffnen**, eine Schaltfläche zum Herunterladen und **⋯**, wie die Karten oben.
- Fertige Dokumente wie PDF oder Word stehen vor Quellen wie LaTeX, Markdown und Tabellen. Zunächst erscheinen vier. **Weitere N Dokumente anzeigen** öffnet den Rest, **Weniger anzeigen** klappt ihn ein.
- Ausdrücklich übergebene Dateien behalten ihre eigene Karte und Beschreibung ohne Duplikat. Nicht mehr vorhandene Dateien werden ausgelassen. Bilder, Code und Datendateien erscheinen nicht automatisch auf diesem Weg; Bilder können weiterhin ausdrücklich übergeben werden.

Dateinamen und Pfade in einer Antwort sind Links. Ein Name oder Pfad in Code (`report.tex`, `docs/report.pdf`, `src/app.ts:42`, was an dieser Zeile öffnet), ein absoluter Pfad oder ein Pfad mit `~/` im Text und ein Link auf eine Datei öffnen die Datei alle in dem Fenster über der Unterhaltung, wie es **Öffnen** auf einer Karte tut. Ein Name allein öffnet die Datei der Unterhaltung mit diesem Namen; ein Pfad, der nicht ganz oben beginnt, ist vom Ordner der Sitzung aus gemeint.

## Dokumentvorschau im Dateibetrachter

Der Dateibetrachter öffnet Dokumente aus Karten, der Dateiseite und Links in Antworten; siehe [System: Dateien, Git, Terminal und Vorschau](/guide/files-git).

- **PDFs** erscheinen im PDF-Betrachter des Browsers. **Ausfüllen und unterschreiben** öffnet die Formular- und Unterschriftsfunktionen; siehe [PDF ausfüllen und unterschreiben](/guide/files-git#fill-in-and-sign-a-pdf).
- **Word, Excel, PowerPoint, OpenDocument, EPUB und RTF**, auch alte .doc-, .xls- und .ppt-Dateien, erhalten eine Vorschau. Mit installiertem LibreOffice gibt es zwei Ansichten:
  - **Seiten**: „Darstellung durch LibreOffice“, jede Seite so, wie sie gedruckt würde. Beim ersten Mal dauert es einen Moment („Seitenvorschau wird erstellt…“); danach öffnen sich die Seiten sofort, bis sich die Datei ändert.
  - **Text** zeigt den ausgelesenen Inhalt. Textdokumente erscheinen als Papierseite, Arbeitsmappen als Raster mit Spaltenbuchstaben, Zeilennummern und Blatttabs unten. Ausgeblendete Blätter haben ein durchgestrichenes Auge. Folien erscheinen als nummerierte Karten mit Vortragsnotizen. Bilder sind Platzhalter mit Beschreibung. Oben wird eine mögliche Kürzung genannt, etwa auf die ersten 1.000 Zeilen.
- Ohne LibreOffice gibt es nur **Text**. EPUB öffnet immer in dieser Ansicht.
- Auf Smartphones startet die Vorschau mit **Text**, da sich diese Ansicht besser scrollen und zoomen lässt. Der Schalter öffnet das Seitenlayout.

Scheitert das LibreOffice-Layout, nennt der Betrachter den Fehler; **Text** bleibt verfügbar. Für Dateien ohne Vorschau steht „Keine Vorschau für diese Datei“. Lade sie herunter, um sie auf deinem Gerät zu öffnen. Der Downloadbutton ist immer verfügbar.

## Bilder durch Agenten erstellen lassen

Bitte einen Agenten um ein Bild, etwa „Erstelle ein Logo für meine Bäckerei“ oder „Verwandle dieses Foto in ein Aquarell“. Er nutzt ein Bildmodell über OpenRouter, speichert das Ergebnis im Sitzungsordner und zeigt es in seiner Antwort. Die Einrichtung steht unter **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**, auf Smartphones direkt unter Einstellungen → **Bilder, Video und Audio**.

- **[Bilder erstellen](/settings?s=images&find=Making%20images)**: Der Schalter **Bilderstellung für Agenten erlauben** neben dem Titel der Gruppe gibt allen Agenten ihre Tools für Bilder: Bilder, Zeichnungen und Plots erstellen sowie den Hintergrund eines Bildes entfernen oder einen Teil davon löschen. Er ist eingeschaltet, solange du ihn nicht ausschaltest; ist er aus, werden sie den Agenten nicht angeboten.
- **OpenRouter-Key**: Bild-, Video- und Audiomodelle werden über OpenRouter aufgerufen und darüber bezahlt. Ohne Key erscheinen **Auf openrouter.ai abrufen** und **Key hinzufügen**. Letzteres öffnet [Einstellungen → Agenten → Modelle → OpenRouter](/settings?s=models&find=OpenRouter); siehe [Agenten, Konten und Modelle](/guide/agents-models). Benötigt ein Agent den fehlenden Key, fragt er stattdessen auf einer Karte danach; siehe [Wenn ein Agent den OpenRouter-Key benötigt](#when-an-agent-needs-the-openrouter-key).
- **[Für die meisten Bilder (Beste Qualität)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)**: das Modell, das Szenen, Fotos, Personen, Wörter in einem Bild und Diagramme erstellt, und jede Änderung an einem Bild. Es zeigt seinen Namen, mit seinem Hersteller, ungefähr was ein Bild kostet (für ein Bild von etwa einem Megapixel) und den Monat, in dem OpenRouter es aufgenommen hat (seine ID steht im (i)), mit Tags: **Neu** (in den letzten 30 Tagen aufgenommen), **Änderungen** (es nimmt Bilder entgegen, um sie zu ändern oder ihnen zu folgen) und **Text auch** (es schreibt Text in seine Bilder). Bis du eines wählst, gilt die Wahl der App („Die Wahl der App, bis du eines wählst“): das erste aus einer kurzen Liste, die OpenRouter noch anbietet: Seedream 5.0 Pro und Flash von ByteDance, dann Bildmodelle von Google Gemini, OpenAI und FLUX.
- **[Für einfache Bilder (Schnell)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)**: günstigeres, schnelleres Modell für Icons, Hintergründe, Texturen und einfache Bilder mit denselben Angaben. Automatisch wird zunächst ByteDance Seedream 5.0 Flash versucht, danach schnelle Modelle von Google, Recraft, FLUX und OpenAI. Ist keines verfügbar, übernimmt das Qualitätsmodell auch einfache Bilder.
- **[Bildwerkzeuge auf diesem Computer](/settings?s=images&find=Picture%20tools%20on%20this%20computer)**: den Hintergrund eines Bildes entfernen, einen Teil davon löschen und es vergrößern, auf diesem Computer statt über OpenRouter: kostenlos, und deine Bilder bleiben hier. **Einrichten** lädt sie einmal herunter, die Zeile darunter sagt, was sie gerade tun, und **⋯ → Entfernen** nimmt sie wieder von diesem Computer (siehe [Lokale Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer)).

So wählst du ein Modell für Qualität oder Geschwindigkeit:

1. **Ändern** öffnet die jeweilige Liste **Bildmodell für die meisten Bilder (Beste Qualität)** oder **Bildmodell für einfache Bilder (Schnell)**.
2. Suche nach Namen wie „seedream“, „flux“ oder „gemini“ und sortiere nach **Empfohlen**, **Neueste** oder **Günstigste**.
3. Klicke auf eine Zeile, um dieses Modell zu verwenden. Sobald du eines gewählt hast, hat das Menü **⋯** der Zeile den Eintrag **Stattdessen die App auswählen lassen**, der zur Wahl der App zurückgeht.

Die Listen stammen von OpenRouter und benötigen keinen Key. Ist die Abfrage nicht möglich, steht dies in der Liste.

## Videos durch Agenten erstellen lassen

Agenten können kurze Videos erstellen, etwa „Zehn Sekunden Wellen in der Abenddämmerung“ oder „Lass den Hund aus diesem Foto über eine Wiese laufen“. Die Modelle kommen über OpenRouter. Die Optionen stehen ebenfalls unter **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**:

- **[Videos erstellen](/settings?s=images&find=Making%20videos)**: **Videoerstellung für Agenten erlauben** neben der Überschrift ist zunächst aktiv und stellt das Werkzeug allen Agenten bereit.
- **[Videomodell](/settings?s=images&find=Video%20model)**: das Modell, das sie erstellt, mit seinem Hersteller, was eine Sekunde Video kostet (von der niedrigsten Auflösung ohne Ton bis zur höchsten mit Ton, als „0,03 $ bis 0,08 $ pro Sekunde“), den Längen, die es erstellt („4 bis 8 s“), seiner höchsten Auflösung („bis 1080p“) und dem Monat, in dem OpenRouter es aufgenommen hat, mit Tags: **Ton** (es erstellt Ton zum Bild), **Von einem Bild** (es kann von einem Bild ausgehen, das du gibst) und **Bearbeitet Videos** (es ändert ein Video, das du ihm gibst, statt eines aus Worten zu erstellen). Bis du eines wählst, gilt die Wahl der App: das erste aus einer kurzen Liste von Modellen mit Ton, die OpenRouter noch anbietet: Seedance 2.5 von ByteDance, dann günstigere, schnellere wie Google Veo 3.1 Lite. **Veränderung** öffnet die Liste zum Suchen („seedance“, „veo“, „kling“) und Sortieren nach **Vorgeschlagen**, **Neueste** oder **Günstigstes**.

- **[Grafikkarte für Videos verwenden](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** im Bereich **Videobearbeitung**: **Automatisch** verwendet geeignete NVIDIA-, Intel-, AMD- oder Apple-Grafik für deine und von Agenten beauftragte Bearbeitungen. Das ist schneller und entlastet die CPU. Die erste Ausgabe prüft die Grafikkarte, die Zeile nennt das Ergebnis, etwa „NVIDIA GeForce RTX 4090 · NVENC“. **Jetzt prüfen** wiederholt den Test. Scheitert eine Bearbeitung auf der GPU, wird sie sofort auf der CPU wiederholt. **Aus** verwendet ausschließlich die CPU.

Videos kosten deutlich mehr als Bilder: wenige Cent bis mehrere Dollar je Sekunde. Ein achtsekündiges Video mit Ton eines Spitzenmodells kann mehrere Dollar kosten. Bezahlt wird über deinen OpenRouter-Key; vor der Erstellung zeigt ein Formular den Preis.

## Audio durch Agenten erstellen lassen

Agenten können auch Ton erstellen: Songs und Jingles („ein 30-Sekunden-Jingle für meinen Podcast“), Voice-overs und Sprecherstimmen mit einer Stimme, die du beschreibst („lies diese Begrüßung mit warmer, langsamer Stimme vor“) oder mit einer Stimme, die aus einer Aufnahme von dir kopiert wurde, sowie Geräusche und Atmosphäre („Regen auf einem Blechdach“). Richte es im selben Abschnitt ein, **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**:

- **[Audio erstellen](/settings?s=images&find=Making%20audio)**: **Audioerstellung für Agenten erlauben** ist zunächst aktiv und stellt das Werkzeug allen Agenten bereit.
- **[Musikmodell](/settings?s=images&find=Music%20model)**: das Modell, das Songs und Musik erstellt, mit seinem Hersteller, seinem Preis („0,08 $ pro Song“), der längsten Dauer, die es erstellt („bis zu 3:00“) und dem Monat, in dem OpenRouter es aufgenommen hat, mit dem Tag **Musik**. Bis du eines wählst, gilt die Wahl der App: Lyria 3 Pro von Google, das ganze Songs von bis zu etwa 3 Minuten erstellt, mit oder ohne Gesang; andernfalls Lyria 3 Clip, das 30-Sekunden-Clips erstellt.
- **[Sprach- und Audiomodell](/settings?s=images&find=Voice%20and%20sound%20model)**: das Modell, das spricht und andere Geräusche erstellt, mit seinem Preis („0,0025 $ pro Sekunde“, „0,08 $ pro 1.000 Zeichen“, „etwa 0,014 $ pro Minute“), der längsten Dauer, die es erstellt, und wie viele Stimmen es hat, mit Tags: **Auch Audio** (es erstellt aus einer Beschreibung Soundeffekte und Atmosphäre sowie Stimmen), **Kopiert Stimmen** (es spricht mit einer Stimme, die aus kurzen Aufnahmen kopiert wurde, die du ihm gibst), **Unterhaltungen** (es vertont mehrere Sprecher, jeden mit seiner eigenen Stimme) und **Sprechstil steuerbar** (es nimmt Anweisungen für den Vortrag an: Tonfall, Tempo, Emotion). Bis du eines wählst, gilt die Wahl der App: Seed Audio 1.0 von ByteDance, das all das aus einer Beschreibung kann, bis zu 2 Minuten auf einmal; andernfalls Gemini 3.8 Flash TTS von Google, sonst ElevenLabs v3.

**Veränderung** öffnet die Liste jedes Modells. Dort kannst du suchen („lyria“, „seed“, „elevenlabs“, „gemini“) und nach **Vorgeschlagen**, **Neueste** oder **Günstigstes** sortieren (Stimmen nach ungefähren Kosten für eine Minute Sprache). In der Zeile eines gewählten Modells geht es mit **⋯ → Stattdessen die App auswählen lassen** zurück zur Wahl der App. Kann das gewählte Sprachmodell nur Text vorlesen, wird ein Geräusch oder eine kopierte Stimme mit dem Modell erstellt, das die App wählt und das es kann. Das Formular sagt dir das.

Sprachmodelle werden meist nach Zeichen abgerechnet, Seed Audio nach erzeugten Sekunden und Lyria nach Songs. Das Formular zeigt die Kosten vor der Erstellung; bezahlt wird über OpenRouter.

## Einstellungen vor der Erstellung prüfen

Bevor ein Agent ein Bild, eine detaillierte Zeichnung, ein Video oder Audio erstellt, erscheint ein kurzes Formular mit unterstützten Einstellungen und Preis, vorausgefüllt aus deiner Anfrage und den App-Standards:

- für ein Bild: **Form** (quadratisch, breit, hoch … so viele, wie das Modell kann), **Auflösung** (1K, 2K, 4K …), **Qualität**, **Wie viele Bilder** (bei Modellen, die mehrere auf einmal erstellen) und **Transparenter Hintergrund** (für ein Logo oder ein Icon);
- Detaillierte Zeichnung über Recrafts Vektormodell: **Format**.
- Video: **Videolänge** aus unterstützten Werten oder **Dauer in Sekunden**, **Format**, **Auflösung** und **Ton**.
- für einen Ton: bei einem Song **Instrumental, kein Gesang** und, bei einem Modell, das lange Songs macht, **Länge in Sekunden** (lass es leer, dann dauert der Song so lange, wie er braucht); bei einem Geräusch seine **Länge in Sekunden** (Seed Audio wird pro Sekunde bezahlt); bei Sprache die **Spracheingabe** (bei einem Modell mit eigenen Stimmen) und die **Datei** (**MP3, kleiner** oder **WAV, unkomprimiert**), wenn das Modell beides kann.

Über den Feldern stehen Modell, Preis und der vollständige Originalauftrag des Agenten. Preisangaben lauten etwa „ungefähr 0,08 $ pro Bild“, „0,03–0,08 $ pro Sekunde je nach Auflösung und Ton“, „0,08 $ pro Song“ oder „0,0025 $ pro Audiosekunde“. Für Videos und Audio erscheint auch der Gesamtpreis der gewählten Einstellungen. Passe die Werte an und wähle **Erstellen**. **Nicht jetzt** schließt das Formular ohne Erstellung und Kosten. Es werden nur tatsächlich unterstützte Einstellungen angeboten.

Das Formular erscheint je Modell einmal pro Sitzung. Danach gelten deine Einstellungen weiter, bei Audio etwa Stimme und Dateiformat, sofern du keine Änderung verlangst. Mit „Zeige mir die Einstellungen erneut“ öffnest du es wieder; „Wähle selbst und leg los“ erlaubt die Erstellung ohne Formular. Geplante Aufgaben und App-Läufe verwenden ohne Formular die Standards, da niemand interaktiv antwortet.

## Wenn ein Agent den OpenRouter-Key benötigt

Bilder, detaillierte Zeichnungen, Videos, Musik und Stimmen werden von Modellen über OpenRouter erstellt und mit deinem OpenRouter-Key bezahlt. Wenn ein Agent eines davon erstellen will und kein Key eingerichtet ist, erscheint zuerst eine Karte in der Unterhaltung: **Hierzu ist ein OpenRouter-Key erforderlich**. Sie nennt das Modell, das es erstellen würde, ungefähr die Kosten und dass du OpenRouter für das Erstellte bezahlst, und hat ein Feld für den Key:

- Füge den Key ein und wähle **Key speichern** oder Enter. OpenRouter prüft ihn. Er wird direkt unter [Einstellungen → Agenten → Modelle → OpenRouter](/settings?s=models&find=OpenRouter) gespeichert, niemals in der Unterhaltung. Der Agent setzt mit dem Einstellungsformular fort. Danach bestätigt die Karte den gespeicherten Key.
- **Key erstellen** öffnet die entsprechende OpenRouter-Seite.
- **Überspringen** führt das Modell nicht aus und verursacht keine Kosten. Der Agent versucht einen Weg ohne Key, etwa eine einfache selbst geschriebene Zeichnung oder [lokale Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer), oder verzichtet auf das Ergebnis. Sechs Stunden lang wird nicht erneut gefragt.

Die Karte wartet bis zu neun Minuten. Danach arbeitet der Agent ohne Key weiter und erfährt, wenn du ihn später ergänzt. Geplante Aufgaben und App-Läufe zeigen keine Eingabekarte, sondern etwa „Bilder benötigen einen OpenRouter-Key“ mit **OpenRouter-Key hinzufügen**. Die KI-Werkzeuge der Editoren fragen im eigenen Dialog; siehe [Bilder, Zeichnungen, Plots und Videos mit KI erstellen](/guide/library#make-pictures-drawings-plots-and-videos-with-ai).

## Ein Bild erstellen oder ändern lassen

Beschreibe, was du willst: das Motiv, die Umgebung, den Stil (ein Foto, eine Illustration, ein Aquarell), die Farben, das Licht und alle Wörter, die im Bild stehen sollen. Der Agent kann außerdem:

- **Bilder ändern oder kombinieren**: lokale PNG-, JPEG-, WebP- oder GIF-Dateien bis 20 MB, meist höchstens vier, bei manchen Modellen mehr. Möglich sind auch Bilder aus Folien, Dokumenten und Bibliotheksseiten. Ein Nachrichtenanhang geht nur zum Betrachten an das Chat-Modell; als Vorlage des Bildmodells muss das Bild als Datei über die Dateiseite hochgeladen werden. Erforderlich ist ein Modell mit dem Tag **Bearbeitung**. Andernfalls soll der Agent die Änderung beschreiben oder dich ein geeignetes Modell wählen lassen.
- **das Quick- oder das Best-Modell nutzen**: Für einfache Bilder (einen Hintergrund, eine Textur, ein Icon) nimmt der Agent das Quick-Modell, für Szenen, Fotos, Wörter in einem Bild, Diagramme und jede Änderung das Best-Modell, oder er entscheidet nach deiner Anfrage. Sag es, wenn du das andere willst („ein schnelles reicht“, „nimm das Best-Modell“);
- **Transparenter Hintergrund** für Logo oder Icon: Ein ungeeignetes Modell übergibt an ein geeignetes. Mit eingerichteten [Bildwerkzeugen](/guide/library#the-picture-tools-on-this-computer) kann das Bild auch auf einfarbigem Hintergrund entstehen und lokal freigestellt werden.
- **Ein bestimmtes Modell** nur für dieses Bild verwenden, etwa „Mit FLUX 2 Pro“, ohne die Einstellungen zu ändern.

Bilder liegen im Unterordner **images** der Sitzung, nach ihrem Inhalt benannt und ohne vorhandene Dateien zu überschreiben.

In der Unterhaltung:

- Während das Modell arbeitet, steht in einem Platzhalter in der gewünschten Form „Bild wird erstellt“ mit der bisherigen Zeit und darunter die Beschreibung.
- Danach erscheinen Bilder mit Beschreibung, Modellname und **In Bibliothek speichern**; siehe [Ergebnisse eines Agenten aufbewahren](#keep-what-an-agent-made). Ein Klick vergrößert, ein weiterer zeigt volle Größe. Pfeile oder Pfeiltasten wechseln Bilder. **In neuem Tab öffnen** zeigt ein Bild einzeln, **Bearbeiten** öffnet den Bildeditor. Dessen Speicherung legt ein neues Bibliotheksbild an; siehe [Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos). Esc schließt. Beim Darüberzeigen erscheinen **In Dateien anzeigen**, **Herunterladen** und **Weitere (⋯)** mit **Sitzung damit starten**, **Zu Projekt hinzufügen**, **Pfad kopieren**; mobil bleiben sie sichtbar. Bei mehreren Bildern gibt es dort auch **In Bibliothek speichern**.
- Ist kein OpenRouter-Key eingerichtet, fragt dich zuerst eine Karte danach ([Wenn ein Agent den OpenRouter-Key braucht](#when-an-agent-needs-the-openrouter-key)). In einem Lauf, den niemand beobachtet (bei einer geplanten Aufgabe oder einer App), siehst du stattdessen „Bilder benötigen einen OpenRouter-Key“ mit **OpenRouter-Key hinzufügen**. Wenn nichts erstellt wird (du hast den Key übersprungen oder das Formular geschlossen, oder das Modell hat abgelehnt), siehst du „Diesmal kein Bild“ mit dem Grund.

## Eine Zeichnung oder einen Plot erstellen lassen

Manche Bilder lassen sich besser aus Formen zeichnen oder aus Zahlen berechnen als mit einem Bildmodell erzeugen:

- **Zeichnung als SVG**, beliebig scharf skalierbar: Icons, Logos, Diagramme, wiederholbare Muster, Formen oder flache Illustrationen in deinen Farben. Einfache SVGs schreibt Claude oder das gewählte [Hilfsmodell](/settings?s=models&find=Helper%20model) in unter einer Minute, ohne zusätzlich bezahltes Bildmodell. Für detaillierte Illustrationen oder ausdrücklich gewünschte beste Qualität nutzt Hydor Recrafts Vektormodell über OpenRouter für etwa 0,08 $ je Zeichnung nach dem Preisformular. Skripte, Links und extern geladene Inhalte werden vor dem Speichern entfernt.
- **Plot aus Daten oder Mathematik** für Streudiagramme, Histogramme, Boxplots, Fehlerbalken, mehrere Achsen und Teilabbildungen, Heatmaps, Funktionen, Anpassungen und wichtige Beschriftungen. Claude oder das Hilfsmodell schreibt Python mit matplotlib, das lokal läuft. Fehler gehen für bis zu drei Versuche zurück ans Modell. Es dauert etwa eine halbe Minute und kostet nur die Modellantwort. Gib Zahlen als Nachricht oder CSV-, TSV- beziehungsweise JSON-Datei bis 20 MB und die gewünschte Aussage an, etwa „Zeige die Verdopplung im Frühjahr“. Das Ergebnis ist SVG, bei sehr vielen Punkten PNG, standardmäßig 960 × 540 Pixel. Der Python-Code liegt daneben, sodass „Jetzt mit logarithmischer Skala“ denselben Plot ändert. Webpräsentationen können auch interaktive Plots erhalten. Python und matplotlib müssen lokal vorhanden sein, entweder über die eingerichteten [Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer) oder eine bestehende Installation.

Beide werden im Ordner **images** im Ordner der Sitzung gespeichert und erscheinen mit der Antwort wie Bilder. Solange eines erstellt wird, steht im Platzhalter „Zeichnung wird erstellt“ oder „Diagramm wird erstellt“.

## Frei nutzbare Fotos finden

Verlange Fotos statt KI-Bilder, etwa „Finde zwei Fotos von Lissabons Straßenbahnen für meine Titelfolie“. Der Agent sucht offen lizenzierte, auch kommerziell nutzbare und veränderbare Fotos in Openverse aus Flickr, Wikimedia Commons, Museen und weiteren Quellen. Ist Openverse nicht verfügbar, nutzt er Wikimedia Commons direkt. Er speichert standardmäßig vier, höchstens zehn Fotos unter **images** mit einer Begleitdatei für Titel, Autor, Lizenz und Link. Er betrachtet sie vor der Verwendung und nennt die Quelle entsprechend der Lizenz in Vortragsnotizen oder unter dem Bild. Außer bei CC0 und Gemeinfreiheit steht zusätzlich eine kleine Bildunterschrift wie „Foto: ‚Titel‘ von Autor, CC BY 2.0“. Die Suche ist kostenlos, dauert Sekunden und zeigt „Frei nutzbare Fotos werden gesucht“.

## Freistellen, retuschieren und bearbeiten

Agenten können vorhandene Bilder und Videos bearbeiten, ohne sie vollständig neu zu erstellen:

- Den **Hintergrund eines Bildes entfernen**: sein Motiv (eine Person, ein Produkt, ein Tier, ein Logo) auf durchsichtigem Hintergrund, als PNG. Auf diesem Computer ist das, sobald die [Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer) eingerichtet sind, kostenlos und privat, behält die eigenen Pixel des Motivs und dauert ein paar Sekunden. Ein Ausschnitt, der schlecht aussieht, wird von einem Bildmodell noch einmal gemacht. Ohne die Werkzeuge übernimmt das ein Bildmodell über OpenRouter (ungefähr 0,01 bis 0,04 $) und zeichnet das Bild ohne Hintergrund neu, sodass kleine Details abweichen können.
- **Etwas aus einem Bild entfernen**: eine Person im Hintergrund, ein Schild, ein Wasserzeichen, ein Fleck, ein Kabel. Es wird weggenommen und so aufgefüllt, wie die Umgebung weitergeht. Der Agent markiert, wo es ist, oder beschreibt es, damit ein Bildmodell es findet. Kleine Bereiche werden auf diesem Computer umsonst entfernt, große, solche, die sich über das ganze Bild ziehen, und solche zwischen feinen Dingen wie Wörtern gehen an ein Bildmodell (ungefähr 0,01 bis 0,04 $).
- **Ein Bild vergrößern**: jede Seite doppelt oder vier Mal so groß, die Details scharf gezeichnet statt verwischt (ein kleines Foto für den Druck oder eine Folie, ein altes Bild). Kostenlos und privat, auf diesem Computer, sobald die [Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer) eingerichtet sind (beim ersten Mal lädt es sein Modell herunter, etwa 5 MB). Ein großes Bild braucht ein bis zwei Minuten.
- **Bildbearbeitung**: zuschneiden, drehen, spiegeln, skalieren, Belichtung, Kontrast, Wärme, Kurven, Tonwerte, einzelne Farbtöne und Sättigung, Farbbalance, Klarheit, Dunst, Rauschen und Körnung ändern oder automatisch verbessern. Dazu Filter wie **Vintage** und **Schwarzweiß**, Text, Pfeile, Rahmen, Weichzeichnen und Verpixeln, etwa für Gesichter, Nummernschilder und Namen. Lokal und kostenlos; JPEG, WebP, GIF und Text im Bild benötigen ffmpeg oder die lokalen Bildwerkzeuge.
- **Videobearbeitung**: kürzen, Bereiche entfernen, auf 16:9, 9:16, Quadrat oder 4:5 zuschneiden, drehen, spiegeln, Tempo ändern, rückwärts wiedergeben und stabilisieren. Clips und Bilder verbinden mit Überblendung, Schwarzblende, Wisch- und Schiebeübergängen; Bilder langsam zoomen; Farben, Belichtung, Wärme, Kontrast, Filmlook, Schwarzweiß, Vignette und Körnung anpassen. Ein- und ausblenden, Ton entfernen, Pegel und Kanäle ändern, etwa ein einseitiges Ansteckmikrofon beidseitig wiedergeben, Bereiche stummschalten und Musik mit Lautstärkekurve versehen. Logos, Wasserzeichen, Greenscreen, Titel und Untertitel darüberlegen, auch aus Spracherkennung mit .srt-Datei. Musik und Voice-over darunterlegen, Stimmen bereinigen, Musik unter Sprache absenken und Lautheit angleichen. Ebenso GIF oder Einzelbild erstellen. Kostenlos mit lokalem ffmpeg aus den Bildwerkzeugen, nach Möglichkeit auf der GPU, solange **Videoerstellung für Agenten erlauben** aktiv ist.
- **Audiobearbeitung**: Audiodatei, Videoton oder Bibliotheksaudio kürzen, Teile entfernen oder stummschalten, Pausen verkürzen und Füllwörter wie „äh“ entfernen. Dafür ist lokale Spracherkennung nötig; siehe [Spracherkennung auf dem Server](#speech-recognition-on-the-server). Tempo bei gleicher Tonhöhe oder Tonhöhe selbst ändern, Lautstärke, Fades, Spitzenpegel und Ziel-Lautheit für Podcast, Streaming oder Rundfunk einstellen. Rauschen reduzieren, Klangprofile wie klare Stimme, Telefon oder Radio, Kompressor, Limiter, Echo und Hall anwenden, rückwärts oder mono ausgeben und weitere Geräusche, Musik oder Sprache zeitlich mischen. Kostenlos mit lokalem ffmpeg, solange **Audioerstellung für Agenten erlauben** aktiv ist.

Jedes arbeitet mit einer Datei im Ordner der Sitzung oder mit einem Bild oder Video, das schon in einem Foliensatz, einem Dokument oder einer Seite steht, und speichert das Ergebnis im Ordner **images** der Sitzung (ein bearbeitetes Video in **videos**, ein bearbeiteter Ton in **audio**), nie über dem Original. Auch ein Bild oder ein Ton aus deiner Bibliothek lässt sich bearbeiten und an seine Stelle oder als neues daneben zurücklegen, so wie es **Speichern** und **Kopie speichern** der Editoren tun („hell das Hafenfoto in meiner Bibliothek auf“, „mach meinen Ton ‚Interview‘ so laut wie einen Podcast“). Es erscheint mit der Antwort wie ein Bild, das der Agent erstellt hat, und der Platzhalter sagt, solange es arbeitet, „Hintergrund wird entfernt“, „Löschen“, „Wird vergrößert“, „Bearbeiten des Bildes“, „Bearbeiten des Videos“ oder „Den Ton bearbeiten“. Bei einem Ausschnitt oder einer Entfernung sagt die Antwort, auf welchem Weg es gemacht wurde und warum. Ist es nicht richtig, sag „mach es mit KI“, dann fragt der Agent das Bildmodell. Wenn du es selbst machen willst, öffne das Bild, das Video oder den Ton in seinem Editor ([Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos), [Der Ton-Editor](/guide/library#the-sound-editor)).

## Ein Video erstellen lassen

Beschreibe Szene, Bewegungen, Kamera wie langsame Zufahrt oder Verfolgung eines Radfahrers, Stil, Licht, Ton und gesprochene Wörter. Zusätzlich möglich:

- **Mit einem Bild beginnen**: Datei als erstes Videobild, etwa „Animiere dieses Foto“. Manche Modelle erlauben auch ein Endbild. Erforderlich ist der Tag **Aus einem Bild**.
- **Bildvorlagen berücksichtigen**: bis zu vier Bilder einer Figur, eines Produkts oder Stils, ohne sie direkt als Videobilder einzusetzen.
- **Video ändern**: MP4, WebM oder MOV bis 40 MB für ein Modell mit **Videobearbeitung**, zum Ändern, Verlängern oder Schärfen.

Die Erstellung dauert unter einer bis mehrere Minuten. Der Agent wartet höchstens etwa neun Minuten. Danach läuft die Erstellung weiter und speichert das fertige Ergebnis; bei der nächsten Prüfung zeigt es der Agent an. Das Warten erzeugt keine Zusatzkosten.

Videos werden in einem Ordner **videos** im Ordner der Sitzung gespeichert und nach dem benannt, was sie zeigen.

In der Unterhaltung:

- Während das Modell arbeitet, steht in einem Platzhalter in der Form des Videos „Video wird erstellt“ mit der bisherigen Zeit.
- Danach erscheint das abspielbare Video mit Vollbildsteuerung, Beschreibung, Modellname und **In Bibliothek speichern**. Beim Darüberzeigen erscheinen **Bearbeiten** für den Videoeditor mit Speicherung in der Bibliothek, **In Dateien anzeigen**, **Herunterladen** und **Weitere (⋯)**.
- „Wird noch erstellt“ bedeutet, dass der Agent vor Fertigstellung aufgehört hat zu warten. Er prüft später erneut; bei Bedarf bitte ihn darum. „Diesmal kein Video“ nennt geschlossenes Formular oder Modellablehnung mit dessen Begründung.

## Musik, Sprache oder Geräusche erstellen lassen

Beschreibe, was du hören möchtest:

- **Musik**: Genre, Stimmung, Instrumente, Tempo, Gesangsstimme und Verlauf, etwa „Zwei Minuten fröhlicher Synth-Pop über Montagmorgen mit Sängerin und eingängigem Refrain“. Gib einen Text vor oder lass ihn schreiben; verlange instrumental, wenn du keinen Gesang möchtest. Lyria 3 Clip erzeugt immer 30 Sekunden, Lyria 3 Pro bis etwa drei Minuten nach Vorgabe. Ein Song braucht ein bis zwei Minuten.
- **Ein Voice-over**: die Wörter, die gesprochen werden sollen, genau, und wie sie klingen sollen („lies das mit ruhiger, tiefer Stimme, langsam“). Bei einem Modell mit eigenen Stimmen wählst du im Formular eine aus. Seed Audio erstellt die Stimme, die du beschreibst. Auch eine Unterhaltung zwischen mehreren Sprechern geht („ein kurzes Podcast-Intro mit zwei Moderatoren“), mit Modellen, die sie sprechen können.
- **Stimme aus Aufnahmen**: ein bis drei lokale WAV-, MP3-, M4A-, OGG- oder FLAC-Dateien bis je 30 MB, von denen jeweils die ersten 30 Sekunden verwendet werden. Ein Modell mit **Stimmen kopieren**, etwa Seed Audio, ist nötig. Verwende nur deine eigene Stimme oder eine mit Zustimmung der betreffenden Person. Ohne ffmpeg funktionieren nur WAV und MP3.
- **Geräusch oder Atmosphäre**: Ereignisse und zeitlicher Verlauf sowie Länge, etwa „Starker Regen auf einem Blechdach, am Ende Donner, keine Stimmen“.
- **Anderes Modell** ausdrücklich für diese Ausgabe nennen, etwa ElevenLabs v3, ohne die Einstellungen zu ändern.

Töne werden in einem Ordner **audio** im Ordner der Sitzung gespeichert, nach dem benannt, was sie sind, als MP3 (oder WAV, wenn du darum bittest).

In der Unterhaltung:

- Eine Karte zeigt „Musik wird erstellt“, „Voice-over wird erstellt“ oder „Audio wird erstellt“ mit Dauer.
- Danach erscheint ein Player: runder Button für Wiedergabe und Pause, immer nur eine Audiodatei gleichzeitig. Die Wellenform dient durch Klicken oder Ziehen zum Springen. Daneben stehen Zeit und Tempo **1×**, **1,25×**, **1,5×**, **2×** oder **0,75×**. Bei Fokus starten und pausieren Leertaste oder K; ← und → springen fünf Sekunden. Der Dateiname bildet den Titel. **Bearbeiten** öffnet den [Audioeditor](/guide/library#the-sound-editor), dessen Speicherung in die Bibliothek geht. Außerdem gibt es **In Dateien anzeigen**, **Herunterladen** und **Weitere (⋯)**. Darunter stehen Beschreibung, Modellname und **In Bibliothek speichern**; siehe [Agentenergebnisse aufbewahren](#keep-what-an-agent-made). Bei Songs lassen sich **Songtexte** aufklappen.
- Ohne Key erscheint „Audio benötigt einen OpenRouter-Key“ mit **OpenRouter-Key hinzufügen**. „Diesmal kein Audio“ nennt ein geschlossenes Formular oder eine Modellablehnung mit Begründung.

Der Agent kann das erzeugte Audio nicht hören; er kennt nur seinen Auftrag. Beschreibe bei Bedarf die gewünschte Änderung, dann erstellt er eine neue Fassung. Alternativ lass vorhandenes Audio bearbeiten, etwa die letzten zwei Sekunden des Jingles ausblenden oder ihn ab 0:05 unter das Voice-over legen, durch den Agenten oder im Audioeditor.

## Bilder in erstellten Inhalten

Bei Folien, Dokumenten und Seiten ergänzt der Agent passende Bilder dort, wo sie helfen, etwa auf Titel- oder Abschnittsfolien und zur Erklärung von Gedanken. Er verwendet keine Bilder auf jeder Folie, sondern orientiert sich an Farben und Gestaltung des Inhalts. Schnelle Modelle erzeugen Hintergründe, Texturen und Icons; Qualitätsmodelle Szenen, Fotos und Diagramme. SVG eignet sich für scharfe Icons, Logos und Diagramme, Plots für Daten und frei nutzbare Fotos für echte Orte und Gegenstände. Vorhandene Bilder werden freigestellt, retuschiert oder passend bearbeitet. Als Quelle dienen auch Bilder aus geöffneten Inhalten. Auf Wunsch ergänzt das für Bibliotheksbilder zuständige Beschreibungsmodell fehlende Alternativtexte für sehbehinderte Personen. Kostenpflichtige Vorgänge zeigen vorher den Preis; siehe [Einstellungen vor der Erstellung prüfen](#check-the-settings-before-anything-is-made). Mit „Keine Bilder“ oder „Nur frei nutzbare Fotos“ passt du das Vorgehen an.

Wenn du einen bekannten Inhaltstyp wie SWOT-Folie, Pitchdeck, Anschreiben, Managementzusammenfassung, Gewohnheitentracker, Preistabelle oder Budget verlangst, liest der Agent zuerst die zugehörige Gestaltungsanleitung: Inhalte, Reihenfolge, Aufbau und sinnvolle Bilder, entsprechend den Typen der Galerie. Das kostet nichts; siehe [Aus einem Inhaltstyp mit KI erstellen](/guide/library#made-with-ai-from-a-kind).

In einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) stehen diese Funktionen nicht bereit. Der Agent erstellt, sucht und bearbeitet dort keine Bilder oder Videos.

## Ergebnisse eines Agenten aufbewahren

**In Bibliothek speichern** unter einem erstellten Bild, Video oder Audio legt eine Kopie in deiner [Bibliothek](/guide/library#images-and-videos-in-the-library) an. Ein Modell ergänzt Titel und Beschreibung, bei Audio aus dem ursprünglichen Auftrag, da kein Modell es hören kann. Die Kopie bleibt nach dem Aufräumen des Sitzungsordners erhalten. Der Button wechselt zu **In deiner Bibliothek** und öffnet sie dort.

## Eine Nachricht diktieren

Das Mikrofon im Nachrichtenfeld der Startseite und jeder Sitzung wandelt Sprache in Nachrichtentext um. Gesendet wird nichts automatisch; du prüfst den Text und sendest wie gewohnt.

1. Klicke oder tippe auf das Mikrofon.
2. Sprich. Über dem Nachrichtenfeld stehen Dauer, bisher erkannter Text und Erkennungssprache. Bei serverseitiger Erkennung erscheinen stattdessen „Aufnahme läuft …“ und Ausschlagsbalken.
3. Wähle **Fertig** oder erneut das Mikrofon. Der Text wird an Vorhandenes angehängt. Bei Servererkennung erscheint davor kurz „Sprache wird in Text umgewandelt …“.

Der Sprachchip wie „DE“ oder „PT-BR“ ändert die Sprache während des Sprechens und setzt die Erkennung damit fort. Serverseitige Aufnahmen enden automatisch nach zehn Minuten.

Das Mikrofon erscheint nur bei verfügbarer Browsererkennung in Chrome, Edge oder Safari oder bei [Spracherkennung auf dem Server](/guide/documents-voice#speech-recognition-on-the-server). Wenn der Start scheitert, nennt Hydor Ursache und Abhilfe:

- **Das Mikrofon benötigt eine sichere Verbindung**: Browser erlauben Zugriff nur über HTTPS oder auf localhost direkt am Computer. Öffne Hydor über HTTPS; siehe [Smartphones, weitere Computer und Freigaben](/guide/devices).
- **Das Mikrofon ist für diese Website gesperrt**: Erlaube es in den Website-Einstellungen des Browsers (auf einem iPhone: **aA** in der Adressleiste, dann **Website-Einstellungen → Mikrofon**) und versuche es dann erneut.
- **Kein Mikrofon gefunden** oder **Mikrofon belegt**, etwa durch eine andere App.
- **Spracherkennung hier deaktiviert**: Aktiviere auf dem iPhone die Diktierfunktion unter Einstellungen → Allgemein → Tastatur oder nutze Servererkennung.
- **Dieser Browser kann nicht aufnehmen**: Verwende einen aktuellen Chrome, Edge, Firefox oder Safari.

Jeder Hinweis bietet **Spracheinstellungen** zum Öffnen von Einstellungen → Sprache.

## Sprachfunktionen einrichten

Alle Optionen stehen unter **[Einstellungen → Funktionen → Sprache](/settings?s=voice)**, mobil unter Einstellungen → **Sprache**. Es gibt drei Bereiche.

### Diktieren

**[Diktieren](/settings?s=voice&find=Dictation)** erklärt zunächst die Browserfunktionen:

- Browser mit eigener Spracherkennung zeigen Text während des Sprechens. Dafür kann die Aufnahme an den Anbieter gehen, etwa Google bei Chrome oder Apple bei Safari. Soll sie auf deinem Computer bleiben, aktiviere whisper.cpp und wähle den Server.
- Ein Browser, der Sprache nicht selbst erkennen kann, diktiert über den Server, sobald die Spracherkennung auf dem Server eingeschaltet ist.

Weitere Optionen:

- **[Gesprochene Sprache](/settings?s=voice&find=Language%20you%20speak)**: **Wie dieser Browser** oder eine von 56 Sprachen und Regionen. Diktieren hört in dieser Sprache zu; Freisprechen hört und spricht sie.
- **Erkennen mit**: **Diesem Browser** für laufende Textanzeige oder **Dem Server**, mit whisper.cpp lokal und Text nach dem Sprechen. Die Auswahl erscheint nur, wenn beide Wege möglich sind.

Die Sprache und **Erkennen mit** werden in diesem Browser gespeichert, also hat jedes deiner Geräte seine eigenen.

### Spracherkennung auf dem Server

**[Spracherkennung auf dem Server](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** ist für Browser ohne eigene Erkennung oder für lokale Verarbeitung. Sie ist zunächst aus und lädt vorher nichts herunter. Ihre Einstellung gilt appweit für alle Geräte. Unter **Ausführungsort** gibt es:

- **Aus**.
- **Auf diesem Computer**: whisper.cpp läuft auf dem Hydor-Computer, nach Möglichkeit auf einer unterstützten Mac- oder NVIDIA-GPU, sonst auf der CPU. Die Aufnahme bleibt dort.
  - **Modell**: **Tiny**, 74 MB, am schnellsten mit gelegentlichen Erkennungsfehlern; **Base**, 141 MB, schnell und meist ausreichend, der Standard; **Small**, 465 MB, genauer mit wenigen Sekunden pro Satz auf der CPU; **Medium**, 1,4 GB, am genauesten, ohne schnelle CPU langsam.
  - **Sprachen**: **Alle Sprachen** folgt der gesprochenen Sprache, **Nur Englisch** ist für Englisch etwas genauer.
  - **Einschalten · herunterladen …** sagt, wie viel heruntergeladen wird: das Modell und beim ersten Mal whisper.cpp selbst (ist schon alles da, schaltet **Auf diesem Computer** es sofort ein). Ein Balken zeigt den Download. **Abbrechen** stoppt ihn und schaltet die Spracherkennung auf dem Server aus. Unter Linux lädt die App ein fertiges whisper.cpp herunter, das auf dem Prozessor läuft. Auf einem Mac und wo das fertige nicht läuft, baut sie whisper.cpp auf diesem Computer, wofür ein C++-Compiler und CMake nötig sind (unter Debian oder Ubuntu: `sudo apt install build-essential cmake`; auf einem Mac: `xcode-select --install`, dann `brew install cmake`). Auf einem Mac wird es für die GPU des Mac gebaut (Metal). Ein eigenes whisper.cpp auf dem Computer (zum Beispiel eines, das für deine GPU gebaut wurde) wird so verwendet, wie es ist.
  - **NVIDIA-GPU unter Linux**: Nach funktionierendem CPU-Diktat kompiliert Hydor im Hintergrund einen GPU-Build mit dem CUDA-Toolkit und `nvcc`, da kein passender Fertig-Build vorliegt. Ein Balken zeigt die 5 bis 20 Minuten. Währenddessen läuft CPU-Erkennung, danach GPU-Erkennung. Fehlt das Toolkit, nennt ein Hinweis dies mit **Erneut prüfen** nach Installation. Bei Buildfehlern erscheinen Ursache und **Erneut versuchen**; CPU-Erkennung bleibt aktiv.
  - Wenn es bereit ist: „Bereit: whisper.cpp … mit dem Base-Modell. Deine Stimme bleibt hier.“ Darunter steht, worauf es läuft, so wie whisper.cpp es beim letzten Lauf gemeldet hat (es probiert eine Sekunde Stille aus, sobald es bereit ist): „Es läuft auf der GPU: Apple M2 Pro (Metal).“ oder „Es läuft auf dem Prozessor dieses Computers.“ Schlägt die GPU fehl (zum Beispiel, weil ihr Speicher voll ist), wird diese Aufnahme auf dem Prozessor gemacht, der Hinweis nennt den Grund, und die GPU wird einige Minuten später erneut versucht. **Testen** prüft, ob es antwortet und wie schnell. Ist etwas fehlgeschlagen, steht der Grund mit **Erneut versuchen** da.
  - Der Wechsel auf ein anderes Modell lädt dieses herunter.
- **Ein Dienst**: jeder Dienst mit der Speech-to-Text-Adresse von OpenAI (`/audio/transcriptions`): OpenAI selbst oder ein Server in deinem Netzwerk (Speaches, LocalAI, der Server von whisper.cpp, einer auf einer GPU). Aufnahmen werden an ihn gesendet.
  - **Einrichten**, später **Bearbeiten**, öffnet **Adresse** wie `https://api.openai.com/v1`, **API Key**, im eigenen Netzwerk häufig nicht nötig, und **Modell**, standardmäßig `whisper-1`.
  - **Speichern und einschalten** (danach **Speichern**), **Testen** in seiner Zeile, sobald er eingeschaltet ist, und **Key entfernen** in seinem Menü **⋯**, sobald ein Key gespeichert ist. Ist ein Dienst gespeichert, schaltet die erneute Auswahl von **Ein Dienst** sofort auf ihn um.

Eine Gruppe, **Auf diesem Computer**, listet mit ihrer Gesamtgröße auf, was whisper.cpp auf diesem Computer hinterlassen hat: whisper.cpp selbst („hier für Metal gebaut“ oder „für CUDA“, wenn die App es für eine GPU gebaut hat) und jedes Modell mit seiner Größe, das benutzte mit „Im Einsatz“ markiert. Im Menü **⋯** eines Modells gibt es **Entfernen** (wer das benutzte entfernt, schaltet nach deiner Bestätigung die Spracherkennung auf dem Server aus). **Alles entfernen** im eigenen Menü **⋯** der Gruppe entfernt whisper.cpp und seine Modelle. Es erscheint, solange die Spracherkennung auf dem Server aus ist oder einen Dienst verwendet.

### Vorlesen

**[Vorlesen](/settings?s=voice&find=Read%20aloud)** steuert den Lautsprecher an Antworten. Code wird ausgelassen. Stimme und Geschwindigkeit gelten je Browser; das (i) erklärt dies.

- **Stimme**: **Automatisch** wählt eine Browserstimme für deine Sprache. Alternativ stehen alle Browserstimmen bereit, passende Sprachen zuerst, mit Sprachangabe und Kennzeichnung „online“ bei Internetbedarf.
- **Geschwindigkeit**: 0,5× bis 2×.
- **Ausprobieren**: **Hörprobe abspielen** liest einen Satz mit dieser Stimme und Geschwindigkeit vor.

Unterstützt der Browser kein Vorlesen, steht dies im Bereich.

## Eine Antwort vorlesen lassen

1. Zeige auf eine Antwort. Rechts oben neben Kopieren erscheint ein Lautsprecher.
2. Klicke darauf. Über dem Nachrichtenfeld zeigt eine Leiste **Vorlesen**, Abschnitt und Gesamtzahl sowie den Antwortanfang.
3. Pausiere, setze fort oder stoppe über Leiste oder Lautsprecher.

Code wird ausgelassen, Links als Linktext, Webadressen als Website und Tabellen zeilenweise vorgelesen. Eine andere Antwort beendet die erste Wiedergabe; das Verlassen der Unterhaltung stoppt ebenfalls. Der Lautsprecher erscheint beim Darüberzeigen mit der Maus. Mobil liest Freisprechen Antworten auf Wunsch vor: „Lies mir die Antwort vor“.

## Hydor freihändig per Sprache bedienen

Freisprechen eignet sich, wenn du nicht auf den Bildschirm sehen kannst, etwa beim Gehen. Du sprichst, Hydor führt die Aktion aus, nennt das Ergebnis und hört wieder zu. Du kannst Sitzungen starten, Nachrichten weitergeben, Status abfragen, Freigaben beantworten und Ergebnisse hören.

### Starten und beenden

- In einer Sitzung öffnet ihn die Kopfhörer-Schaltfläche im Nachrichtenfeld (**Freihändig**, neben dem Mikrofon) und folgt dieser Sitzung.
- Auf der Startseite öffnet derselbe Button den Modus ohne festgelegte Sitzung.
- Die Suche mit Strg+K, auf dem Mac ⌘K, bietet ebenfalls **Freihändig sprechen**.

Der Modus füllt den Bildschirm, sagt „Ich höre zu“ und bittet das Gerät, den Bildschirm aktiv zu halten. Oben steht die verfolgte Sitzung oder „Mit Hydor sprechen“. Der große runde Button zeigt **Hört zu …**, **Wird bearbeitet …**, **Spricht** oder **Pausiert: zum Zuhören tippen**. Darunter erscheinen erkannte Worte in Anführungszeichen und die Antwort.

- Tippe während des Sprechens auf den Button, um die Ausgabe abzukürzen. Sonst pausiert oder aktiviert er das Zuhören.
- Beende mit „Auf Wiedersehen“, „Tschüss“, „Das war alles“, „Nicht mehr zuhören“, „Freisprechen beenden“, „Beenden“ oder dem Kreuz rechts oben.

### Was du sagen kannst

- **Sitzung starten**: „Starte eine Sitzung zur Planung meines Kreta-Wochenendes“. Verwendet werden die letzten Startseiteneinstellungen für Programm, Modell, Denkaufwand, Berechtigungen, Agent und Projekt. Die Sitzung startet im neuen Aufgabenordner oder zuletzt gewählten Ordner und wird danach verfolgt.
- **Nachricht senden**: „Sag dem Agenten, er soll metrische Einheiten verwenden“. Die Worte gehen als deine Nachricht an die verfolgte Sitzung.
- **Status abfragen**: „Wie laufen meine Sitzungen?“ Hydor nennt laufende Arbeit, offene Rückfragen und kürzlich abgeschlossene Sitzungen.
- **Ergebnis hören**: „Lies mir die Antwort vor“. Hydor liest die letzte Antwort der verfolgten Sitzung oder ohne Auswahl die aktivste beziehungsweise neueste. Lange Antworten werden in drei bis fünf Sätzen zusammengefasst. Bei einer anderen App-Sprache als Englisch wird jede Antwort in dieser Sprache zusammengefasst.
- **Freigabe beantworten**: „Genehmigen“ oder „Ablehnen“, wenn die verfolgte oder ohne Auswahl eine beliebige Sitzung auf eine einfache Ja-/Nein-Freigabe wartet. Fragen, Pläne und Formulare musst du am Bildschirm beantworten; Hydor weist darauf hin.
- **Arbeit stoppen**: „Stopp“ beendet die Arbeit der verfolgten Sitzung, nicht den Sprachmodus.
- **Wechseln**: Nenne eine andere Sitzung, etwa „Sprechen wir über die Kreta-Reise“.
- Frage nach Hydor oder anderen Themen. Du erhältst kurze Antworten oder Rückfragen bei Unklarheit.

### Automatische Meldungen

- Wenn die verfolgte Sitzung fertig wird: „… ist fertig. Sag ‚Vorlesen‘, um die Antwort zu hören.“
- Wenn eine Sitzung dich braucht: „… braucht dich: …“, gefolgt von „Sag genehmigen oder ablehnen“ oder „Beantworte es am Bildschirm“. Anschließend wird diese Sitzung verfolgt, damit „Genehmigen“ dort wirkt.
- Wenn eine Sitzung mit Fehler stoppt: „… wurde mit einem Fehler beendet.“

Für Meldungen pausiert das Zuhören und beginnt danach erneut. Sitzungen auf anderen Computern werden nicht angekündigt.

### Gut zu wissen

- Das Hilfsmodell unter [Einstellungen → Agenten → Modelle → Hilfsmodell](/settings?s=models&find=Helper%20model) versteht deine Aussagen. Ist es nicht erreichbar, funktionieren einfache Befehle wie „Status“, „approve“ oder „yes“, „deny“ oder „no“, „stop“, „read“ und „start …“. Andere Aussagen gehen an die verfolgte Sitzung oder starten ohne Auswahl eine neue. Diese englischen Befehle sind die einfachen Ersatzbefehle ohne Modell.
- Antworten folgen der App-Sprache unter Einstellungen → Allgemein → Sprache. Erkannt wird die unter Einstellungen → Sprache gewählte gesprochene Sprache, andernfalls die App-Sprache.
- Stimme und Tempo stammen aus [Vorlesen](/guide/documents-voice#read-aloud).
- Nötig sind Vorlesen im Browser und Browser-Spracherkennung in Chrome, Edge oder Safari oder Servererkennung. Der Kopfhörer erscheint nur bei erfüllten Voraussetzungen. Bei Servererkennung endet jede Äußerung nach anderthalb Sekunden Stille, spätestens nach einer halben Minute. Nach 15 Sekunden ohne Sprache startet das Zuhören erneut.
- Bei fehlendem oder gesperrtem Mikrofon erscheint ein Hinweis und der Modus pausiert. Erlaube den Zugriff im Browser und tippe erneut zum Zuhören.

## Einen Agenten fragen

- „Fülle ~/Downloads/visa-application.pdf mit meinen Profildaten aus und frage nach fehlenden Angaben.“
- „Schreibe das heutige Datum und meinen Namen auf die Linien in ~/Documents/permission-slip.pdf und kreuze Ja an.“
- „Speichere Seiten 3 bis 5 von ~/Documents/contract.pdf als eigene Datei.“
- „Schalte die Spracherkennung auf diesem Computer mit dem Small-Modell ein.“
- „Nutze meinen Sprachserver unter http://192.168.1.20:8000/v1 mit whisper-large-v3 zum Diktieren.“
- „Welche Whisper-Modelle sind installiert und wie viel Platz brauchen sie? Entferne ungenutzte.“
- „Läuft Diktieren auf meiner GPU? Falls nicht, warum?“
- „Welche Bildmodelle verwenden Agenten jetzt für die meisten Bilder und für einfache, und was kostet ein Bild ungefähr mit jedem?“
- „Stelle das Bildmodell für die meisten Bilder auf das günstigste um, das Bilder bearbeiten kann.“
- „Nutze Recraft V4.1 Flash für einfache Bilder.“
- „Richte die lokalen Bildwerkzeuge ein.“
- „Nutzen die Bildwerkzeuge hier die GPU? Warum läuft gegebenenfalls eines auf der CPU?“
- „Zeichne ein flaches Fahrradicon in #0f766e und #f59e0b als scharf skalierbare Grafik.“
- „Stelle ~/data/sales.csv als Monatsbalken für 2025 und 2026 dar und beschrifte den Anstieg im Frühjahr.“
- „Finde drei frei nutzbare Fotos von Lissabons Straßenbahnen für meine Reisefolien mit Quellenangaben.“
- „Entferne den Hintergrund von ~/Pictures/mug.jpg.“
- „Entferne den Mann links aus beach.jpg. Falls das Ergebnis verschmiert aussieht, nutze ein Bildmodell.“
- „Schneide ~/Pictures/team.jpg auf 16:9 zu, helle es etwas auf und mache Gesichter im Hintergrund unscharf.“
- „Kürze demo.mp4 auf 0:12 bis 0:40, blende anfangs ‚Unsere neue App‘ ein und erstelle zusätzlich ein GIF.“
- „Entferne Füllwörter und lange Pausen aus interview.m4a, reduziere Hintergrundrauschen und passe die Lautheit für einen Podcast an.“
- „Deaktiviere Bilderstellung für Agenten.“
- „Welche Videomodelle erzeugen Ton und was kostet je eine Sekunde?“
- „Verwende Kling für Agentenvideos.“
- „Deaktiviere Videoerstellung für Agenten.“
- „Welches Musikmodell verwenden Agenten und was kostet ein Song?“
- „Nutze ElevenLabs v3 mit der Stimme George für Voice-overs.“
- „Deaktiviere Audioerstellung für Agenten.“
