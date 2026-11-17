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
- **Markierungen und Notizen**: Hervorhebungen aus dem Dateibetrachter, nach Seiten geordnet, samt Notizen und Bildern markierter Gleichungen oder Abbildungen. Der Agent kann sie zusammenfassen oder gegen die Publikation prüfen. Auf Wunsch markiert er auch Text für dich; diese Markierungen erscheinen im Betrachter. Siehe [PDF lesen und markieren](/guide/files-git#read-and-highlight-a-pdf).

### Word, Excel und PowerPoint

- **Word** mit .docx sowie Makro- und Vorlagenvarianten: Überschriften, Absätze, nummerierte und unnummerierte Listen, Tabellen, Links, Textfelder, Bildbeschreibungen, Fußnoten, Endnoten und Kommentare.
- **Excel** mit .xlsx sowie Makro- und Vorlagenvarianten: jedes Tabellenblatt mit Zeilennummern und Spaltenbuchstaben, annähernd formatierten Zahlen für Datum, Prozent und Geld sowie bis zu 40 Formeln pro Blatt. Ausgeblendete Blätter sind gekennzeichnet. Zunächst werden je Blatt bis zu 2.000 Zeilen und 60 Spalten gelesen; der Agent wird über weitere informiert. Für vollständige größere Blätter verwendet der Skill **spreadsheets** einen anderen Leseweg.
- **PowerPoint** mit .pptx sowie Makro-, Vorlagen- und Bildschirmpräsentationsvarianten: Folientitel, Text, Tabellen, Bildbeschreibungen, Diagrammtitel und Datenreihen sowie Vortragsnotizen. Ausgeblendete Folien sind gekennzeichnet. Bis zu 1.000 Folien.

### OpenDocument, EPUB, CSV und RTF

- **OpenDocument** mit LibreOffice-Dateien .odt, .ods, .odp, ihren Vorlagen und .odg: Text mit Überschriften, Listen, Tabellen, Links und Fußnoten, angezeigte Tabelleninhalte sowie Folien mit Titel, Text und Notizen.
- **EPUB**: Kapitel in Lesereihenfolge mit Überschriften, Listen, Tabellen und Zitaten.
- **CSV**- und **TSV**-Tabellen sowie **RTF**-Text.

### Alte Office-Dateien, geschützte und sehr große Dateien

- Alte .doc-, .xls- und .ppt-Dateien werden über LibreOffice zunächst in aktuelle Formate umgewandelt. Ohne LibreOffice bittet der Agent um eine .docx-, .xlsx- oder .pptx-Fassung oder um die Installation von LibreOffice.
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

- Echte Dokumentstruktur mit Überschriften für Navigation und Screenreader, Listen, Tabellen mit Kopfzeile, Bildern und Seitenumbrüchen.
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

Erstellte Dokumente, Tabellen, Folien, PDFs, Bilder und Archive übergibt der Agent als Karten unter der Antwort, höchstens zwölf gleichzeitig. Jede zeigt:

- farbiges Dateitypsymbol, etwa Word blau, Excel grün, PowerPoint orange und PDF rot, beziehungsweise Bildminiatur;
- Dateiname, Typ und Größe, etwa „Word-Dokument · 24 KB“;
- Beschreibung des Agenten, etwa „Budget mit einem Blatt pro Quartal“;
- **Öffnen**, Downloadbutton und **Weitere (⋯)**.

**Öffnen** zeigt die Datei über der Unterhaltung, deren Position erhalten bleibt. Auf dem Smartphone öffnet sich das Fenster von unten. **In Dateien öffnen** wechselt zur Dateiseite; Kreuz oder Esc schließen das Fenster. Oben steht der Pfad wie auf der Dateiseite; siehe [Datei öffnen und bearbeiten](/guide/files-git#open-and-edit-a-file). Der Wechsel in einen Ordner schließt zuerst das Fenster und fragt bei ungespeicherten Änderungen nach. Der Downloadbutton speichert auf deinem Gerät.

**Weitere (⋯)** auf Karte und Fenster bietet **Sitzung damit starten** mit vorausgefülltem Nachrichtenfeld, **Zu Projekt hinzufügen** als Kopie im Projektordner, **In Bibliothek speichern** und **Pfad kopieren**, auf Karten zusätzlich **In Dateien anzeigen**. In die Bibliothek lassen sich Jupyter-Notebooks, PowerPoint-, Word-, Markdown-, Tabellen- und LaTeX-Dateien übernehmen und dort im passenden Editor öffnen. Bei vorhandenen Projekten wählst du das Ziel, zunächst das Sitzungsprojekt. Siehe [Sitzung mit Dateien starten](/guide/files-git#start-a-session-with-files) und [Dateien zu einem Projekt hinzufügen](/guide/files-git#add-files-to-a-project).

Verschobene oder gelöschte Dateien zeigen **Nicht mehr vorhanden**. Benennt ein Agent eine nicht existierende Datei, erscheint „Dateien konnten nicht angezeigt werden“ mit Ursache; der Agent wird zur Korrektur aufgefordert.

### Erstellte oder geänderte Dokumente und Dateinamen in Antworten

Nach jeder Runde erscheinen erstellte oder bearbeitete PDF-, Word-, Excel-, PowerPoint- und OpenDocument-Dateien, CSV und TSV, LaTeX, Jupyter-Notebooks, EPUB und Markdown als Karten, auch ohne ausdrückliche Übergabe. Erfasst werden Dateien aus Bearbeitungen und Befehlen im Sitzungsordner: ausdrücklich in der Runde genannte Dateien oder solche neben einer bearbeiteten Datei. Andere Sitzungen im selben Ordner steuern keine Dateien bei.

- Jede Karte zeigt **Neu** oder **Aktualisiert**, Typ und Größe sowie **Öffnen**, Download und **⋯**.
- Fertige Dokumente wie PDF oder Word stehen vor Quellen wie LaTeX, Markdown und Tabellen. Zunächst erscheinen vier. **Weitere N Dokumente anzeigen** öffnet den Rest, **Weniger anzeigen** klappt ihn ein.
- Ausdrücklich übergebene Dateien behalten ihre eigene Karte und Beschreibung ohne Duplikat. Nicht mehr vorhandene Dateien werden ausgelassen. Bilder, Code und Datendateien erscheinen nicht automatisch auf diesem Weg; Bilder können weiterhin ausdrücklich übergeben werden.

Dateinamen und Pfade in Antworten sind Links. Codeangaben wie `report.tex`, `docs/report.pdf` und `src/app.ts:42`, absolute und `~/`-Pfade sowie Dateilinks öffnen denselben Betrachter wie Karten. Eine Zeilenangabe springt dorthin. Ein bloßer Name bezieht sich auf die entsprechende Datei der Sitzung; relative Pfade beginnen im Sitzungsordner.

## Dokumentvorschau im Dateibetrachter

Der Dateibetrachter öffnet Dokumente aus Karten, der Dateiseite und Links in Antworten; siehe [System: Dateien, Git, Terminal und Vorschau](/guide/files-git).

- **PDFs** erscheinen im PDF-Betrachter des Browsers. **Ausfüllen und unterschreiben** öffnet die Formular- und Unterschriftsfunktionen; siehe [PDF ausfüllen und unterschreiben](/guide/files-git#fill-in-and-sign-a-pdf).
- **Word, Excel, PowerPoint, OpenDocument, EPUB und RTF**, auch alte .doc-, .xls- und .ppt-Dateien, erhalten eine Vorschau. Mit installiertem LibreOffice gibt es zwei Ansichten:
  - **Seiten** zeigt das Drucklayout von LibreOffice. Die erste Aufbereitung dauert kurz; danach öffnen die Seiten sofort, bis sich die Datei ändert.
  - **Text** zeigt den ausgelesenen Inhalt. Textdokumente erscheinen als Papierseite, Arbeitsmappen als Raster mit Spaltenbuchstaben, Zeilennummern und Blatttabs unten. Ausgeblendete Blätter haben ein durchgestrichenes Auge. Folien erscheinen als nummerierte Karten mit Vortragsnotizen. Bilder sind Platzhalter mit Beschreibung. Oben wird eine mögliche Kürzung genannt, etwa auf die ersten 1.000 Zeilen.
- Ohne LibreOffice gibt es nur **Text**. EPUB öffnet immer in dieser Ansicht.
- Auf Smartphones startet die Vorschau mit **Text**, da sich diese Ansicht besser scrollen und zoomen lässt. Der Schalter öffnet das Seitenlayout.

Scheitert das LibreOffice-Layout, nennt der Betrachter den Fehler; **Text** bleibt verfügbar. Für Dateien ohne Vorschau steht „Keine Vorschau für diese Datei“. Lade sie herunter, um sie auf deinem Gerät zu öffnen. Der Downloadbutton ist immer verfügbar.

## Bilder durch Agenten erstellen lassen

Bitte einen Agenten um ein Bild, etwa „Erstelle ein Logo für meine Bäckerei“ oder „Verwandle dieses Foto in ein Aquarell“. Er nutzt ein Bildmodell über OpenRouter, speichert das Ergebnis im Sitzungsordner und zeigt es in seiner Antwort. Die Einrichtung steht unter **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**, auf Smartphones direkt unter Einstellungen → **Bilder, Video und Audio**.

- **[Bilder erstellen](/settings?s=images&find=Making%20images)**: **Bilderstellung für Agenten erlauben** neben der Überschrift stellt allen Agenten Werkzeuge für Bilder, Zeichnungen, Plots, Hintergrundentfernung und Retusche bereit. Die Option ist zunächst aktiv.
- **OpenRouter-Key**: Bild-, Video- und Audiomodelle werden über OpenRouter aufgerufen und darüber bezahlt. Ohne Key erscheinen **Auf openrouter.ai abrufen** und **Key hinzufügen**. Letzteres öffnet [Einstellungen → Agenten → Modelle → OpenRouter](/settings?s=models&find=OpenRouter); siehe [Agenten, Konten und Modelle](/guide/agents-models). Benötigt ein Agent den fehlenden Key, fragt er stattdessen auf einer Karte danach; siehe [Wenn ein Agent den OpenRouter-Key benötigt](#when-an-agent-needs-the-openrouter-key).
- **[Für die meisten Bilder (Beste Qualität)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)**: Modell für Szenen, Fotos, Personen, Text im Bild, Diagramme und Bildänderungen. Angezeigt werden Name, Anbieter, ungefährer Preis pro Megapixelbild und Monat der OpenRouter-Aufnahme; die ID steht im (i). Tags kennzeichnen **Neu** für die letzten 30 Tage, **Bearbeitung** für Bildvorlagen und Änderungen sowie **Auch Text**. Ohne eigene Wahl verwendet Hydor das erste noch angebotene Modell einer kurzen Liste: ByteDance Seedream 5.0 Pro und Flash, danach Bildmodelle von Google Gemini, OpenAI und FLUX.
- **[Für einfache Bilder (Schnell)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)**: günstigeres, schnelleres Modell für Icons, Hintergründe, Texturen und einfache Bilder mit denselben Angaben. Automatisch wird zunächst ByteDance Seedream 5.0 Flash versucht, danach schnelle Modelle von Google, Recraft, FLUX und OpenAI. Ist keines verfügbar, übernimmt das Qualitätsmodell auch einfache Bilder.
- **[Bildwerkzeuge auf diesem Computer](/settings?s=images&find=Picture%20tools%20on%20this%20computer)**: Hintergründe entfernen, retuschieren und vergrößern statt über OpenRouter kostenlos und lokal. **Einrichten** lädt die Werkzeuge einmal herunter, die Statuszeile erklärt den Fortschritt. **⋯ → Entfernen** deinstalliert sie; siehe [Lokale Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer).

So wählst du ein Modell für Qualität oder Geschwindigkeit:

1. **Ändern** öffnet die jeweilige Liste **Bildmodell für die meisten Bilder (Beste Qualität)** oder **Bildmodell für einfache Bilder (Schnell)**.
2. Suche nach Namen wie „seedream“, „flux“ oder „gemini“ und sortiere nach **Empfohlen**, **Neueste** oder **Günstigste**.
3. Klicke auf ein Modell. Nach einer eigenen Auswahl stellt **⋯ → App automatisch auswählen lassen** die automatische Wahl wieder her.

Die Listen stammen von OpenRouter und benötigen keinen Key. Ist die Abfrage nicht möglich, steht dies in der Liste.

## Videos durch Agenten erstellen lassen

Agenten können kurze Videos erstellen, etwa „Zehn Sekunden Wellen in der Abenddämmerung“ oder „Lass den Hund aus diesem Foto über eine Wiese laufen“. Die Modelle kommen über OpenRouter. Die Optionen stehen ebenfalls unter **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**:

- **[Videos erstellen](/settings?s=images&find=Making%20videos)**: **Videoerstellung für Agenten erlauben** neben der Überschrift ist zunächst aktiv und stellt das Werkzeug allen Agenten bereit.
- **[Videomodell](/settings?s=images&find=Video%20model)**: Angezeigt werden Anbieter, Preis pro Sekunde von niedriger Auflösung ohne Ton bis hoher Auflösung mit Ton, etwa „0,03–0,08 $ pro Sekunde“, mögliche Längen wie „4–8 s“, maximale Auflösung wie „bis 1080p“ und Aufnahmemonat bei OpenRouter. Tags sind **Ton**, **Aus einem Bild** für ein Ausgangsbild und **Videobearbeitung** für das Ändern vorhandener Videos statt reiner Texterstellung. Ohne eigene Wahl nutzt Hydor das erste verfügbare Modell einer kurzen Liste mit Ton: zunächst ByteDance Seedance 2.5, danach günstigere schnelle Modelle wie Google Veo 3.1 Lite. **Ändern** öffnet Suche nach etwa „seedance“, „veo“ oder „kling“ und Sortierung nach Empfehlung, Datum oder Preis.

- **[Grafikkarte für Videos verwenden](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** im Bereich **Videobearbeitung**: **Automatisch** verwendet geeignete NVIDIA-, Intel-, AMD- oder Apple-Grafik für deine und von Agenten beauftragte Bearbeitungen. Das ist schneller und entlastet die CPU. Die erste Ausgabe prüft die Grafikkarte, die Zeile nennt das Ergebnis, etwa „NVIDIA GeForce RTX 4090 · NVENC“. **Jetzt prüfen** wiederholt den Test. Scheitert eine Bearbeitung auf der GPU, wird sie sofort auf der CPU wiederholt. **Aus** verwendet ausschließlich die CPU.

Videos kosten deutlich mehr als Bilder: wenige Cent bis mehrere Dollar je Sekunde. Ein achtsekündiges Video mit Ton eines Spitzenmodells kann mehrere Dollar kosten. Bezahlt wird über deinen OpenRouter-Key; vor der Erstellung zeigt ein Formular den Preis.

## Audio durch Agenten erstellen lassen

Agenten erstellen Songs und Jingles, etwa einen 30-Sekunden-Podcastjingle, Voice-overs mit beschriebener oder aus einer Aufnahme übernommener Stimme sowie Geräusche und Atmosphäre wie Regen auf einem Blechdach. Die Einrichtung steht unter **[Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images)**:

- **[Audio erstellen](/settings?s=images&find=Making%20audio)**: **Audioerstellung für Agenten erlauben** ist zunächst aktiv und stellt das Werkzeug allen Agenten bereit.
- **[Musikmodell](/settings?s=images&find=Music%20model)**: Name, Anbieter, Preis pro Song wie „0,08 $ pro Song“, maximale Dauer und OpenRouter-Aufnahmemonat erscheinen mit dem Tag **Musik**. Die automatische Wahl ist Google Lyria 3 Pro für vollständige Songs bis ungefähr drei Minuten mit oder ohne Gesang, andernfalls Lyria 3 Clip für 30 Sekunden.
- **[Sprach- und Audiomodell](/settings?s=images&find=Voice%20and%20sound%20model)**: Modelle für Sprache und andere Geräusche zeigen Preise wie „0,0025 $ pro Sekunde“, „0,08 $ pro 1.000 Zeichen“ oder „etwa 0,014 $ pro Minute“, maximale Länge und Anzahl Stimmen. Tags: **Auch Audio** für Geräusche und Atmosphäre, **Stimmen kopieren**, **Unterhaltungen** für mehrere Sprecher und **Sprechstil steuerbar** für Tonfall, Tempo und Emotion. Automatisch wird ByteDance Seed Audio 1.0 verwendet, das alle diese Funktionen aus einer Beschreibung bis zu zwei Minuten unterstützt; andernfalls Google Gemini 3.8 Flash TTS oder ElevenLabs v3.

**Ändern** öffnet die jeweilige Suche nach etwa „lyria“, „seed“, „elevenlabs“ oder „gemini“ und Sortierung nach Empfehlung, Datum oder Preis, für Sprache anhand ungefährer Minutenkosten. **⋯ → App automatisch auswählen lassen** setzt eine eigene Wahl zurück. Kann dein Sprachmodell nur vorlesen, werden Geräusche und kopierte Stimmen mit einem geeigneten automatischen Modell erstellt; das Formular nennt dies.

Sprachmodelle werden meist nach Zeichen abgerechnet, Seed Audio nach erzeugten Sekunden und Lyria nach Songs. Das Formular zeigt die Kosten vor der Erstellung; bezahlt wird über OpenRouter.

## Einstellungen vor der Erstellung prüfen

Bevor ein Agent ein Bild, eine detaillierte Zeichnung, ein Video oder Audio erstellt, erscheint ein kurzes Formular mit unterstützten Einstellungen und Preis, vorausgefüllt aus deiner Anfrage und den App-Standards:

- Bild: **Format** wie quadratisch, breit oder hoch, **Auflösung** wie 1K, 2K oder 4K, **Qualität**, gegebenenfalls **Anzahl Bilder** und **Transparenter Hintergrund** für Logos oder Icons.
- Detaillierte Zeichnung über Recrafts Vektormodell: **Format**.
- Video: **Videolänge** aus unterstützten Werten oder **Dauer in Sekunden**, **Format**, **Auflösung** und **Ton**.
- Audio: Bei Songs **Instrumental, ohne Gesang** und bei längeren Songs optional **Dauer in Sekunden**; leer bestimmt das Modell die Dauer. Bei Geräuschen die Dauer, da Seed Audio pro Sekunde abgerechnet wird. Bei Sprache gegebenenfalls **Stimme**. Unterstützt das Modell beides, wählst du **MP3, kleiner** oder **WAV, unkomprimiert**.

Über den Feldern stehen Modell, Preis und der vollständige Originalauftrag des Agenten. Preisangaben lauten etwa „ungefähr 0,08 $ pro Bild“, „0,03–0,08 $ pro Sekunde je nach Auflösung und Ton“, „0,08 $ pro Song“ oder „0,0025 $ pro Audiosekunde“. Für Videos und Audio erscheint auch der Gesamtpreis der gewählten Einstellungen. Passe die Werte an und wähle **Erstellen**. **Nicht jetzt** schließt das Formular ohne Erstellung und Kosten. Es werden nur tatsächlich unterstützte Einstellungen angeboten.

Das Formular erscheint je Modell einmal pro Sitzung. Danach gelten deine Einstellungen weiter, bei Audio etwa Stimme und Dateiformat, sofern du keine Änderung verlangst. Mit „Zeige mir die Einstellungen erneut“ öffnest du es wieder; „Wähle selbst und leg los“ erlaubt die Erstellung ohne Formular. Geplante Aufgaben und App-Läufe verwenden ohne Formular die Standards, da niemand interaktiv antwortet.

## Wenn ein Agent den OpenRouter-Key benötigt

Bilder, detaillierte Zeichnungen, Videos, Musik und Sprache werden über OpenRouter bezahlt. Fehlt der Key, erscheint vor der Erstellung **OpenRouter-Key erforderlich** mit Modell, ungefährem Preis, Hinweis auf die nutzungsabhängige OpenRouter-Abrechnung und einem Eingabefeld:

- Füge den Key ein und wähle **Key speichern** oder Enter. OpenRouter prüft ihn. Er wird direkt unter [Einstellungen → Agenten → Modelle → OpenRouter](/settings?s=models&find=OpenRouter) gespeichert, niemals in der Unterhaltung. Der Agent setzt mit dem Einstellungsformular fort. Danach bestätigt die Karte den gespeicherten Key.
- **Key erstellen** öffnet die entsprechende OpenRouter-Seite.
- **Überspringen** führt das Modell nicht aus und verursacht keine Kosten. Der Agent versucht einen Weg ohne Key, etwa eine einfache selbst geschriebene Zeichnung oder [lokale Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer), oder verzichtet auf das Ergebnis. Sechs Stunden lang wird nicht erneut gefragt.

Die Karte wartet bis zu neun Minuten. Danach arbeitet der Agent ohne Key weiter und erfährt, wenn du ihn später ergänzt. Geplante Aufgaben und App-Läufe zeigen keine Eingabekarte, sondern etwa „Bilder benötigen einen OpenRouter-Key“ mit **OpenRouter-Key hinzufügen**. Die KI-Werkzeuge der Editoren fragen im eigenen Dialog; siehe [Bilder, Zeichnungen, Plots und Videos mit KI erstellen](/guide/library#make-pictures-drawings-plots-and-videos-with-ai).

## Ein Bild erstellen oder ändern lassen

Beschreibe Motiv, Umgebung, Stil wie Foto, Illustration oder Aquarell, Farben, Licht und gewünschten Text im Bild. Weitere Möglichkeiten:

- **Bilder ändern oder kombinieren**: lokale PNG-, JPEG-, WebP- oder GIF-Dateien bis 20 MB, meist höchstens vier, bei manchen Modellen mehr. Möglich sind auch Bilder aus Folien, Dokumenten und Bibliotheksseiten. Ein Nachrichtenanhang geht nur zum Betrachten an das Gesprächsmodell; als Vorlage des Bildmodells muss das Bild als Datei über die Dateiseite hochgeladen werden. Erforderlich ist ein Modell mit dem Tag **Bearbeitung**. Andernfalls soll der Agent die Änderung beschreiben oder dich ein geeignetes Modell wählen lassen.
- **Schnell oder Beste Qualität**: Einfaches wie Hintergründe, Texturen und Icons nutzt das schnelle Modell; Szenen, Fotos, Text, Diagramme und Änderungen das Qualitätsmodell. Du kannst ausdrücklich eine andere Wahl verlangen.
- **Transparenter Hintergrund** für Logo oder Icon: Ein ungeeignetes Modell übergibt an ein geeignetes. Mit eingerichteten [Bildwerkzeugen](/guide/library#the-picture-tools-on-this-computer) kann das Bild auch auf einfarbigem Hintergrund entstehen und lokal freigestellt werden.
- **Ein bestimmtes Modell** nur für dieses Bild verwenden, etwa „Mit FLUX 2 Pro“, ohne die Einstellungen zu ändern.

Bilder liegen im Unterordner **images** der Sitzung, nach ihrem Inhalt benannt und ohne vorhandene Dateien zu überschreiben.

In der Unterhaltung:

- Während der Erstellung steht im passenden Bildformat „Bild wird erstellt“ mit Dauer und Beschreibung.
- Danach erscheinen Bilder mit Beschreibung, Modellname und **In Bibliothek speichern**; siehe [Ergebnisse eines Agenten aufbewahren](#keep-what-an-agent-made). Ein Klick vergrößert, ein weiterer zeigt volle Größe. Pfeile oder Pfeiltasten wechseln Bilder. **In neuem Tab öffnen** zeigt ein Bild einzeln, **Bearbeiten** öffnet den Bildeditor. Dessen Speicherung legt ein neues Bibliotheksbild an; siehe [Bilder und Videos bearbeiten](/guide/library#edit-pictures-and-videos). Esc schließt. Beim Darüberzeigen erscheinen **In Dateien anzeigen**, **Herunterladen** und **Weitere (⋯)** mit **Sitzung damit starten**, **Zu Projekt hinzufügen**, **Pfad kopieren**; mobil bleiben sie sichtbar. Bei mehreren Bildern gibt es dort auch **In Bibliothek speichern**.
- Ohne Key fragt zuerst die Karte danach; siehe [OpenRouter-Key](#when-an-agent-needs-the-openrouter-key). Unbeaufsichtigte Läufe zeigen stattdessen den fehlenden Key mit Hinzufügeaktion. Bei übersprungenem Key, geschlossenem Formular oder Ablehnung erscheint „Diesmal kein Bild“ mit Ursache.

## Eine Zeichnung oder einen Plot erstellen lassen

Manche Bilder lassen sich besser aus Formen zeichnen oder aus Zahlen berechnen als mit einem Bildmodell erzeugen:

- **Zeichnung als SVG**, beliebig scharf skalierbar: Icons, Logos, Diagramme, wiederholbare Muster, Formen oder flache Illustrationen in deinen Farben. Einfache SVGs schreibt Claude oder das gewählte [Hilfsmodell](/settings?s=models&find=Helper%20model) in unter einer Minute, ohne zusätzlich bezahltes Bildmodell. Für detaillierte Illustrationen oder ausdrücklich gewünschte beste Qualität nutzt Hydor Recrafts Vektormodell über OpenRouter für etwa 0,08 $ je Zeichnung nach dem Preisformular. Skripte, Links und extern geladene Inhalte werden vor dem Speichern entfernt.
- **Plot aus Daten oder Mathematik** für Streudiagramme, Histogramme, Boxplots, Fehlerbalken, mehrere Achsen und Teilabbildungen, Heatmaps, Funktionen, Anpassungen und wichtige Beschriftungen. Claude oder das Hilfsmodell schreibt Python mit matplotlib, das lokal läuft. Fehler gehen für bis zu drei Versuche zurück ans Modell. Es dauert etwa eine halbe Minute und kostet nur die Modellantwort. Gib Zahlen als Nachricht oder CSV-, TSV- beziehungsweise JSON-Datei bis 20 MB und die gewünschte Aussage an, etwa „Zeige die Verdopplung im Frühjahr“. Das Ergebnis ist SVG, bei sehr vielen Punkten PNG, standardmäßig 960 × 540 Pixel. Der Python-Code liegt daneben, sodass „Jetzt mit logarithmischer Skala“ denselben Plot ändert. Webpräsentationen können auch interaktive Plots erhalten. Python und matplotlib müssen lokal vorhanden sein, entweder über die eingerichteten [Bildwerkzeuge](/guide/library#the-picture-tools-on-this-computer) oder eine bestehende Installation.

Beide Ergebnisse liegen unter **images** und erscheinen wie Bilder in der Antwort. Platzhalter heißen „Zeichnung wird erstellt“ oder „Plot wird erstellt“.

## Frei nutzbare Fotos finden

Verlange Fotos statt KI-Bilder, etwa „Finde zwei Fotos von Lissabons Straßenbahnen für meine Titelfolie“. Der Agent sucht offen lizenzierte, auch kommerziell nutzbare und veränderbare Fotos in Openverse aus Flickr, Wikimedia Commons, Museen und weiteren Quellen. Ist Openverse nicht verfügbar, nutzt er Wikimedia Commons direkt. Er speichert standardmäßig vier, höchstens zehn Fotos unter **images** mit einer Begleitdatei für Titel, Autor, Lizenz und Link. Er betrachtet sie vor der Verwendung und nennt die Quelle entsprechend der Lizenz in Vortragsnotizen oder unter dem Bild. Außer bei CC0 und Gemeinfreiheit steht zusätzlich eine kleine Bildunterschrift wie „Foto: ‚Titel‘ von Autor, CC BY 2.0“. Die Suche ist kostenlos, dauert Sekunden und zeigt „Frei nutzbare Fotos werden gesucht“.

## Freistellen, retuschieren und bearbeiten

Agenten können vorhandene Bilder und Videos bearbeiten, ohne sie vollständig neu zu erstellen:

- **Hintergrund entfernen**: Person, Produkt, Tier oder Logo als PNG mit Transparenz. Mit eingerichteten [Bildwerkzeugen](/guide/library#the-picture-tools-on-this-computer) lokal, kostenlos, datensparsam und pixelgetreu in Sekunden. Schlechte Ergebnisse werden mit einem Bildmodell wiederholt. Ohne lokale Werkzeuge zeichnet ein OpenRouter-Modell das Bild ohne Hintergrund neu, ungefähr 0,01–0,04 $, wodurch Details abweichen können.
- **Bildbereiche entfernen**, etwa Personen im Hintergrund, Schilder, Wasserzeichen, Flecken oder Kabel. Der Agent markiert oder beschreibt den Bereich, der passend zur Umgebung ergänzt wird. Kleine Flächen werden kostenlos lokal bearbeitet, große, bildübergreifende oder detailreiche Bereiche wie Text durch ein Bildmodell für etwa 0,01–0,04 $.
- **Vergrößern**: zwei- oder vierfache Seitenlänge mit rekonstruierten Details statt einfacher Unschärfe. Lokal und kostenlos mit [Bildwerkzeugen](/guide/library#the-picture-tools-on-this-computer); beim ersten Mal wird ein etwa 5-MB-Modell geladen. Große Bilder benötigen ein bis zwei Minuten.
- **Bildbearbeitung**: zuschneiden, drehen, spiegeln, skalieren, Belichtung, Kontrast, Wärme, Kurven, Tonwerte, einzelne Farbtöne und Sättigung, Farbbalance, Klarheit, Dunst, Rauschen und Körnung ändern oder automatisch verbessern. Dazu Filter wie **Vintage** und **Schwarzweiß**, Text, Pfeile, Rahmen, Weichzeichnen und Verpixeln, etwa für Gesichter, Nummernschilder und Namen. Lokal und kostenlos; JPEG, WebP, GIF und Text im Bild benötigen ffmpeg oder die lokalen Bildwerkzeuge.
- **Videobearbeitung**: kürzen, Bereiche entfernen, auf 16:9, 9:16, Quadrat oder 4:5 zuschneiden, drehen, spiegeln, Tempo ändern, rückwärts wiedergeben und stabilisieren. Clips und Bilder verbinden mit Überblendung, Schwarzblende, Wisch- und Schiebeübergängen; Bilder langsam zoomen; Farben, Belichtung, Wärme, Kontrast, Filmlook, Schwarzweiß, Vignette und Körnung anpassen. Ein- und ausblenden, Ton entfernen, Pegel und Kanäle ändern, etwa ein einseitiges Ansteckmikrofon beidseitig wiedergeben, Bereiche stummschalten und Musik mit Lautstärkekurve versehen. Logos, Wasserzeichen, Greenscreen, Titel und Untertitel darüberlegen, auch aus Spracherkennung mit .srt-Datei. Musik und Voice-over darunterlegen, Stimmen bereinigen, Musik unter Sprache absenken und Lautheit angleichen. Ebenso GIF oder Einzelbild erstellen. Kostenlos mit lokalem ffmpeg aus den Bildwerkzeugen, nach Möglichkeit auf der GPU, solange **Videoerstellung für Agenten erlauben** aktiv ist.
- **Audiobearbeitung**: Audiodatei, Videoton oder Bibliotheksaudio kürzen, Teile entfernen oder stummschalten, Pausen verkürzen und Füllwörter wie „äh“ entfernen. Dafür ist lokale Spracherkennung nötig; siehe [Spracherkennung auf dem Server](#speech-recognition-on-the-server). Tempo bei gleicher Tonhöhe oder Tonhöhe selbst ändern, Lautstärke, Fades, Spitzenpegel und Ziel-Lautheit für Podcast, Streaming oder Rundfunk einstellen. Rauschen reduzieren, Klangprofile wie klare Stimme, Telefon oder Radio, Kompressor, Limiter, Echo und Hall anwenden, rückwärts oder mono ausgeben und weitere Geräusche, Musik oder Sprache zeitlich mischen. Kostenlos mit lokalem ffmpeg, solange **Audioerstellung für Agenten erlauben** aktiv ist.

Als Ausgang dienen lokale Dateien oder Bilder und Videos aus Folien, Dokumenten und Seiten. Ergebnisse liegen unter **images**, bearbeitete Videos unter **videos**, Audio unter **audio**; Originale bleiben erhalten. Bibliotheksbilder und -audio lassen sich auch ersetzen oder als Kopie daneben speichern wie in den Editoren, etwa „Helle das Hafenfoto in meiner Bibliothek auf“ oder „Passe ‚Interview‘ auf Podcast-Lautheit an“. Währenddessen erscheinen passende Statusmeldungen für Hintergrundentfernung, Retusche, Vergrößerung und Bearbeitung. Beim Freistellen und Retuschieren nennt die Antwort Methode und Grund. Mit „Bearbeite es mit KI“ verlangst du stattdessen ein Bildmodell. Selbst bearbeiten kannst du im [Bild- und Videoeditor](/guide/library#edit-pictures-and-videos) und [Audioeditor](/guide/library#the-sound-editor).

## Ein Video erstellen lassen

Beschreibe Szene, Bewegungen, Kamera wie langsame Zufahrt oder Verfolgung eines Radfahrers, Stil, Licht, Ton und gesprochene Wörter. Zusätzlich möglich:

- **Mit einem Bild beginnen**: Datei als erstes Videobild, etwa „Animiere dieses Foto“. Manche Modelle erlauben auch ein Endbild. Erforderlich ist der Tag **Aus einem Bild**.
- **Bildvorlagen berücksichtigen**: bis zu vier Bilder einer Figur, eines Produkts oder Stils, ohne sie direkt als Videobilder einzusetzen.
- **Video ändern**: MP4, WebM oder MOV bis 40 MB für ein Modell mit **Videobearbeitung**, zum Ändern, Verlängern oder Schärfen.

Die Erstellung dauert unter einer bis mehrere Minuten. Der Agent wartet höchstens etwa neun Minuten. Danach läuft die Erstellung weiter und speichert das fertige Ergebnis; bei der nächsten Prüfung zeigt es der Agent an. Das Warten erzeugt keine Zusatzkosten.

Videos liegen nach Inhalt benannt im Sitzungsunterordner **videos**.

In der Unterhaltung:

- Ein Platzhalter im Videoformat zeigt „Video wird erstellt“ und die vergangene Zeit.
- Danach erscheint das abspielbare Video mit Vollbildsteuerung, Beschreibung, Modellname und **In Bibliothek speichern**. Beim Darüberzeigen erscheinen **Bearbeiten** für den Videoeditor mit Speicherung in der Bibliothek, **In Dateien anzeigen**, **Herunterladen** und **Weitere (⋯)**.
- „Wird noch erstellt“ bedeutet, dass der Agent vor Fertigstellung aufgehört hat zu warten. Er prüft später erneut; bei Bedarf bitte ihn darum. „Diesmal kein Video“ nennt geschlossenes Formular oder Modellablehnung mit dessen Begründung.

## Musik, Sprache oder Geräusche erstellen lassen

Beschreibe, was du hören möchtest:

- **Musik**: Genre, Stimmung, Instrumente, Tempo, Gesangsstimme und Verlauf, etwa „Zwei Minuten fröhlicher Synth-Pop über Montagmorgen mit Sängerin und eingängigem Refrain“. Gib einen Text vor oder lass ihn schreiben; verlange instrumental, wenn du keinen Gesang möchtest. Lyria 3 Clip erzeugt immer 30 Sekunden, Lyria 3 Pro bis etwa drei Minuten nach Vorgabe. Ein Song braucht ein bis zwei Minuten.
- **Voice-over**: exakter Wortlaut und Sprechweise, etwa ruhig, tief und langsam. Bei Modellen mit eigenen Stimmen wählst du eine im Formular, Seed Audio erstellt die beschriebene Stimme. Geeignete Modelle unterstützen auch mehrere Sprecher, etwa zwei Podcast-Hosts.
- **Stimme aus Aufnahmen**: ein bis drei lokale WAV-, MP3-, M4A-, OGG- oder FLAC-Dateien bis je 30 MB, von denen jeweils die ersten 30 Sekunden verwendet werden. Ein Modell mit **Stimmen kopieren**, etwa Seed Audio, ist nötig. Verwende nur deine eigene Stimme oder eine mit Zustimmung der betreffenden Person. Ohne ffmpeg funktionieren nur WAV und MP3.
- **Geräusch oder Atmosphäre**: Ereignisse und zeitlicher Verlauf sowie Länge, etwa „Starker Regen auf einem Blechdach, am Ende Donner, keine Stimmen“.
- **Anderes Modell** ausdrücklich für diese Ausgabe nennen, etwa ElevenLabs v3, ohne die Einstellungen zu ändern.

Audio wird nach Inhalt benannt als MP3 oder auf Wunsch WAV im Unterordner **audio** gespeichert.

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
- **Mikrofon für diese Website blockiert**: Erlaube es in den Website-Einstellungen des Browsers. Auf dem iPhone: **aA → Website-Einstellungen → Mikrofon**. Versuche es erneut.
- **Kein Mikrofon gefunden** oder **Mikrofon belegt**, etwa durch eine andere App.
- **Spracherkennung hier deaktiviert**: Aktiviere auf dem iPhone die Diktierfunktion unter Einstellungen → Allgemein → Tastatur oder nutze Servererkennung.
- **Dieser Browser kann nicht aufnehmen**: Verwende einen aktuellen Chrome, Edge, Firefox oder Safari.

Jeder Hinweis bietet **Spracheinstellungen** zum Öffnen von Einstellungen → Sprache.

## Sprachfunktionen einrichten

Alle Optionen stehen unter **[Einstellungen → Funktionen → Sprache](/settings?s=voice)**, mobil unter Einstellungen → **Sprache**. Es gibt drei Bereiche.

### Diktieren

**[Diktieren](/settings?s=voice&find=Dictation)** erklärt zunächst die Browserfunktionen:

- Browser mit eigener Spracherkennung zeigen Text während des Sprechens. Dafür kann die Aufnahme an den Anbieter gehen, etwa Google bei Chrome oder Apple bei Safari. Soll sie auf deinem Computer bleiben, aktiviere whisper.cpp und wähle den Server.
- Ohne eigene Browsererkennung funktioniert Diktieren nach Aktivierung der Servererkennung.

Weitere Optionen:

- **[Gesprochene Sprache](/settings?s=voice&find=Language%20you%20speak)**: **Wie dieser Browser** oder eine von 56 Sprachen und Regionen. Diktieren hört in dieser Sprache zu; Freisprechen hört und spricht sie.
- **Erkennen mit**: **Diesem Browser** für laufende Textanzeige oder **Dem Server**, mit whisper.cpp lokal und Text nach dem Sprechen. Die Auswahl erscheint nur, wenn beide Wege möglich sind.

Sprache und Erkennungsweg werden im jeweiligen Browser gespeichert, also je Gerät unabhängig.

### Spracherkennung auf dem Server

**[Spracherkennung auf dem Server](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** ist für Browser ohne eigene Erkennung oder für lokale Verarbeitung. Sie ist zunächst aus und lädt vorher nichts herunter. Ihre Einstellung gilt appweit für alle Geräte. Unter **Ausführungsort** gibt es:

- **Aus**.
- **Auf diesem Computer**: whisper.cpp läuft auf dem Hydor-Computer, nach Möglichkeit auf einer unterstützten Mac- oder NVIDIA-GPU, sonst auf der CPU. Die Aufnahme bleibt dort.
  - **Modell**: **Tiny**, 74 MB, am schnellsten mit gelegentlichen Erkennungsfehlern; **Base**, 141 MB, schnell und meist ausreichend, der Standard; **Small**, 465 MB, genauer mit wenigen Sekunden pro Satz auf der CPU; **Medium**, 1,4 GB, am genauesten, ohne schnelle CPU langsam.
  - **Sprachen**: **Alle Sprachen** folgt der gesprochenen Sprache, **Nur Englisch** ist für Englisch etwas genauer.
  - **Aktivieren · herunterladen …** nennt die Größe des Modells und beim ersten Mal von whisper.cpp. Ist alles vorhanden, aktiviert die Auswahl sofort. Ein Balken zeigt den Download, **Abbrechen** stoppt ihn und deaktiviert Servererkennung. Linux verwendet zunächst einen fertigen CPU-Build. Auf dem Mac oder bei ungeeignetem Fertig-Build kompiliert die App lokal mit C++ und CMake. Unter Debian oder Ubuntu: `sudo apt install build-essential cmake`; auf dem Mac: `xcode-select --install`, dann `brew install cmake`. Auf dem Mac wird Metal-Unterstützung für die GPU eingebaut. Eine vorhandene eigene whisper.cpp-Installation wird direkt genutzt, etwa ein GPU-Build.
  - **NVIDIA-GPU unter Linux**: Nach funktionierendem CPU-Diktat kompiliert Hydor im Hintergrund einen GPU-Build mit dem CUDA-Toolkit und `nvcc`, da kein passender Fertig-Build vorliegt. Ein Balken zeigt die 5 bis 20 Minuten. Währenddessen läuft CPU-Erkennung, danach GPU-Erkennung. Fehlt das Toolkit, nennt ein Hinweis dies mit **Erneut prüfen** nach Installation. Bei Buildfehlern erscheinen Ursache und **Erneut versuchen**; CPU-Erkennung bleibt aktiv.
  - Nach Einrichtung steht etwa „Bereit: whisper.cpp mit Base-Modell. Deine Sprache bleibt hier.“ Darunter erscheint das zuletzt gemeldete Gerät, anfangs durch einen Test mit einer Sekunde Stille ermittelt: etwa „GPU: Apple M2 Pro (Metal)“ oder CPU. Scheitert die GPU, beispielsweise wegen Speichermangel, wird diese Aufnahme auf der CPU verarbeitet. Ein Hinweis nennt die Ursache; nach einigen Minuten wird die GPU erneut versucht. **Testen** prüft Antwort und Geschwindigkeit. Fehler erscheinen mit Wiederholungsaktion.
  - Der Wechsel auf ein anderes Modell lädt dieses herunter.
- **Ein Dienst**: OpenAI oder ein eigener kompatibler Server wie Speaches, LocalAI oder whisper.cpp mit `/audio/transcriptions`. Aufnahmen werden an diesen Dienst gesendet.
  - **Einrichten**, später **Bearbeiten**, öffnet **Adresse** wie `https://api.openai.com/v1`, **API Key**, im eigenen Netzwerk häufig nicht nötig, und **Modell**, standardmäßig `whisper-1`.
  - **Speichern und aktivieren**, später **Speichern**, übernimmt die Angaben. **Testen** prüft den Dienst. Bei gespeichertem Key bietet **⋯ → Key entfernen** das Löschen. Ein bereits gespeicherter Dienst lässt sich durch die Auswahl sofort aktivieren.

Die Gruppe **Auf diesem Computer** zeigt Gesamtgröße, whisper.cpp selbst und alle Modelle mit Größen und Markierung **In Verwendung**. Lokal kompilierte Builds nennen Metal oder CUDA. **⋯ → Entfernen** löscht ein Modell; beim aktiven Modell wird die Servererkennung nach Bestätigung deaktiviert. **Alle entfernen** im Gruppenmenü löscht whisper.cpp und Modelle. Diese Aktion erscheint bei deaktivierter Erkennung oder Nutzung eines Dienstes.

### Vorlesen

**[Vorlesen](/settings?s=voice&find=Read%20aloud)** steuert den Lautsprecher an Antworten. Code wird ausgelassen. Stimme und Geschwindigkeit gelten je Browser; das (i) erklärt dies.

- **Stimme**: **Automatisch** wählt eine Browserstimme für deine Sprache. Alternativ stehen alle Browserstimmen bereit, passende Sprachen zuerst, mit Sprachangabe und Kennzeichnung „online“ bei Internetbedarf.
- **Geschwindigkeit**: 0,5× bis 2×.
- **Ausprobieren → Hörprobe abspielen** liest einen Satz mit gewählter Stimme und Geschwindigkeit.

Unterstützt der Browser kein Vorlesen, steht dies im Bereich.

## Eine Antwort vorlesen lassen

1. Zeige auf eine Antwort. Rechts oben neben Kopieren erscheint ein Lautsprecher.
2. Klicke darauf. Über dem Nachrichtenfeld zeigt eine Leiste **Vorlesen**, Abschnitt und Gesamtzahl sowie den Antwortanfang.
3. Pausiere, setze fort oder stoppe über Leiste oder Lautsprecher.

Code wird ausgelassen, Links als Linktext, Webadressen als Website und Tabellen zeilenweise vorgelesen. Eine andere Antwort beendet die erste Wiedergabe; das Verlassen der Unterhaltung stoppt ebenfalls. Der Lautsprecher erscheint beim Darüberzeigen mit der Maus. Mobil liest Freisprechen Antworten auf Wunsch vor: „Lies mir die Antwort vor“.

## Hydor freihändig per Sprache bedienen

Freisprechen eignet sich, wenn du nicht auf den Bildschirm sehen kannst, etwa beim Gehen. Du sprichst, Hydor führt die Aktion aus, nennt das Ergebnis und hört wieder zu. Du kannst Sitzungen starten, Nachrichten weitergeben, Status abfragen, Freigaben beantworten und Ergebnisse hören.

### Starten und beenden

- In einer Sitzung öffnet der Kopfhörerbutton **Freisprechen** neben dem Mikrofon den Modus für diese Sitzung.
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

- Das Hilfsmodell unter [Einstellungen → Agenten → Modelle → Hilfsmodell](/settings?s=models&find=Helper%20model) versteht deine Aussagen. Ist es nicht erreichbar, funktionieren einfache Befehle wie „status“, „approve“ oder „yes“, „deny“ oder „no“, „stop“, „read“ und „start …“. Andere Aussagen gehen an die verfolgte Sitzung oder starten ohne Auswahl eine neue. Diese englischen Befehle sind die einfachen Ersatzbefehle ohne Modell.
- Antworten folgen der App-Sprache unter Einstellungen → Allgemein → Sprache. Erkannt wird die unter Einstellungen → Sprache gewählte gesprochene Sprache, andernfalls die App-Sprache.
- Stimme und Tempo stammen aus [Vorlesen](/guide/documents-voice#read-aloud).
- Nötig sind Vorlesen im Browser und Browser-Spracherkennung in Chrome, Edge oder Safari oder Servererkennung. Der Kopfhörer erscheint nur bei erfüllten Voraussetzungen. Bei Servererkennung endet jede Äußerung nach anderthalb Sekunden Stille, spätestens nach einer halben Minute. Nach 15 Sekunden ohne Sprache startet das Zuhören erneut.
- Bei fehlendem oder gesperrtem Mikrofon erscheint ein Hinweis und der Modus pausiert. Erlaube den Zugriff im Browser und tippe erneut zum Zuhören.

## Einen Agenten fragen

- „Fülle ~/Downloads/visa-application.pdf mit meinen Profildaten aus und frage nach fehlenden Angaben.“
- „Schreibe das heutige Datum und meinen Namen auf die Linien in ~/Documents/permission-slip.pdf und kreuze Ja an.“
- „Speichere Seiten 3 bis 5 von ~/Documents/contract.pdf als eigene Datei.“
- „Aktiviere lokale Spracherkennung mit dem Small-Modell.“
- „Nutze meinen Sprachserver unter http://192.168.1.20:8000/v1 mit whisper-large-v3 zum Diktieren.“
- „Welche Whisper-Modelle sind installiert und wie viel Platz brauchen sie? Entferne ungenutzte.“
- „Läuft Diktieren auf meiner GPU? Falls nicht, warum?“
- „Welche Bildmodelle verwenden Agenten für normale und einfache Bilder und was kostet jeweils ein Bild?“
- „Wähle für normale Bilder das günstigste Modell mit Bildbearbeitung.“
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
