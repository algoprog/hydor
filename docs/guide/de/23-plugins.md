# Plugins

Ein Plugin bündelt alles, was Agenten für eine bestimmte Aufgabe brauchen: Skills, Tools, ergänzende Anweisungen, eigene Dateien und benötigte Zusatzprogramme. Alle Agenten, die die App startet, erhalten die aktivierten Plugins: Claude Code, Codex, Custom und die anderen. Dieser Beitrag erklärt die mitgelieferten Plugins, das Hinzufügen per Link, Datei oder Ordner, das Erstellen und Teilen eigener Plugins sowie die eigenen Plugins von Claude Code und Codex.

![Einstellungen → Plugins: deine Plugins und die mitgelieferten Plugins](images/plugins.webp)

## Was ein Plugin ist

Ein Plugin ist ein Ordner, der Folgendes enthalten kann:

- **Skills**: beschriebene Arbeitsweisen, die Agenten bei passenden Aufgaben laden. Solange das Plugin aktiviert ist, erscheinen sie in der [Skill-Bibliothek](/guide/skills).
- **Werkzeuge**: Tool-Server (MCP-Server), die Agenten zusätzliche Möglichkeiten geben, etwa Text aus Bildern zu lesen oder Datenbanken abzufragen. Ein Server läuft auf diesem Computer oder ist als Dienst unter einer Adresse erreichbar.
- **Anweisungen**: zusätzliche Anweisungen für jeden Agenten, solange das Plugin aktiviert ist.
- **Eigene Dateien**: Daten, Vorlagen, Bilder oder Skripte für die Skills und Tools des Plugins.
- **Voraussetzungen**: andere Plugins, Python- oder Node-Pakete, Programme auf diesem Computer, herunterzuladende Dateien und Keys aus deinem Tresor.

Plugins verwenden das offene Format Agent Plugins, das auch andere Tools lesen können, etwa VS Code, Cursor, Codex und OpenHands. Auch Plugins für Claude Code lassen sich hier hinzufügen: Ihre Skills und Tools stehen dann allen Agenten zur Verfügung.

## Die Plugin-Seite öffnen

Gehe zu **Einstellungen → Agenten → Plugins** ([öffnen](/settings?s=plugins)). Öffne auf dem Smartphone die Einstellungen und tippe unter Agenten auf **Plugins**.

Oben findest du drei Tabs: **Alle Agenten** für die Plugins dieser App, die allen Agenten zur Verfügung stehen, sowie **Claude Code** und **Codex** für deren eigene Plugins. Siehe [Eigene Plugins von Claude Code und Codex](#claude-codes-and-codexs-own-plugins).

Unter **Alle Agenten** findest du:

- ein Suchfeld und neben der Abschnittsüberschrift die Schaltfläche **Hinzufügen** mit den Optionen **Plugin erstellen**, **Mit einem Agenten erstellen**, **Über einen Link**, **Aus einer ZIP-Datei** und **Aus einem Ordner**;
- während ein Plugin hinzugefügt oder eingerichtet wird, eine laufend aktualisierte Anzeige der einzelnen Schritte;
- **Deine Plugins**: hinzugefügte Plugins, jeweils mit Schalter und einem **⋯**-Menü mit **Details** sowie **Bearbeiten** für selbst erstellte oder aus einem Ordner eingebundene Plugins. Das (i) neben der Überschrift erklärt, dass diese Plugins mit allen Agenten funktionieren. Selbst erstellte Plugins sind mit **Von dir erstellt** gekennzeichnet, Plugins aus einem Link, einer Datei oder einem fremden Ordner mit **Von dir hinzugefügt**;
- **Mitgeliefert**: noch nicht hinzugefügte integrierte Plugins, jeweils mit **Hinzufügen**.

Jedes Plugin zeigt Namen und Version, seinen Zweck, seinen Inhalt („1 Skill · 1 Tool-Server“) und mögliche Einschränkungen: eine fehlgeschlagene Einrichtung, ein fehlendes Programm oder einen noch nicht gespeicherten Key. Klicke auf den Namen eines Plugins oder auf **⋯ → Details**, um es zu öffnen.

Auch über die Suche (Strg+K, auf dem Mac ⌘K) findest du Plugins im Bereich **Plugins**.

## Ein mitgeliefertes Plugin hinzufügen

1. Klicke unter **Mitgeliefert** in der Zeile des Plugins auf **Hinzufügen**, oder öffne es und klicke dort auf **Hinzufügen**.
2. Oben auf der Seite siehst du die einzelnen Schritte: Zuerst wird das Plugin hinzugefügt, dann werden seine Pakete und Downloads eingerichtet. Sobald es bereit ist, wird es aktiviert.

Benötigt ein Plugin andere Plugins, werden diese zuerst hinzugefügt. Welche das sind, steht vor dem Hinzufügen auf seiner Detailseite.

## Die mitgelieferten Plugins

- **Audio und Video**: Audio und Video konvertieren, kürzen, zusammenfügen, komprimieren und untersuchen; Tonspuren extrahieren, die Lautstärke eines Podcasts angleichen, lange Pausen kürzen, Aufnahmen anhand einer Liste gewünschter Abschnitte schneiden, Hochformat-Clips, GIFs und Vorschaubilder erstellen, Untertitel hinzufügen und Medien herunterladen, für die du die nötigen Rechte hast. Benötigt ffmpeg auf diesem Computer; die Detailseite erklärt die Installation. yt-dlp wird in einer eigenen Umgebung installiert.
- **E-Books**: Metadaten, Inhalt und Text einer EPUB-Datei lesen; aus einem Manuskript in Markdown oder HTML ein gültiges EPUB mit Cover und Inhaltsverzeichnis erstellen; E-Books vor der Veröffentlichung für Kindle, Apple Books oder Kobo prüfen und reparieren. Die nötigen Python-Pakete werden in einer eigenen Umgebung installiert. Ist EPUBCheck vorhanden, kann das Plugin dieselbe Prüfung wie die Shops durchführen; mit pandoc verarbeitet es auch Word-Dateien.
- **Bibliotheksdokumentation**: aktuelle Dokumentation und Codebeispiele für Programmbibliotheken und Frameworks über Context7, damit Agenten Code für die von dir verwendete Version schreiben. Es wird nichts installiert; die Anfragen gehen an Context7.
- **Besprechungsaufnahmen**: Aus Aufnahmen von Besprechungen, Telefonaten und Interviews entstehen Zusammenfassungen, Entscheidungen, Aufgaben mit Verantwortlichen und Terminen, offene Fragen und eine E-Mail zur Nachbereitung, jeweils mit Zeitangaben zur Aufnahme. Fügt **Sprache zu Text** als Voraussetzung hinzu.
- **Python für Daten**: eine eigene Python-Umgebung mit pandas, NumPy, SciPy, Matplotlib, openpyxl und PyArrow, um Tabellen auszuwerten und Diagramme zu erstellen, ohne deine vorhandene Python-Umgebung zu verändern.
- **Sprache zu Text**: Aufnahmen, Sprachnotizen und Videos mit Whisper auf diesem Computer in Text und Untertitel umwandeln, in etwa 100 Sprachen. Mit einer NVIDIA-Grafikkarte läuft die Verarbeitung auf der GPU; dafür installiert die Einrichtung NVIDIA-CUDA-Bibliotheken mit etwa 1,3 GB. Andernfalls wird die CPU verwendet. Schlägt die GPU-Verarbeitung fehl, wechselt das Plugin mit einer Begründung zur CPU. Auf dem Mac verwendet es die CPU, da diese Whisper-Variante keine Apple-GPU unterstützt. Fügt **Audio und Video** hinzu; Modelle werden bei ihrer ersten Verwendung einmalig heruntergeladen.
- **SQLite-Datenbanken**: SQLite-Datenbanken untersuchen, sicher abfragen, Änderungen in einer Transaktion durchführen und Daten aus CSV-Dateien importieren oder als CSV exportieren. Benötigt nur Python 3.
- **Text aus Bildern**: Text aus Bildern, Dokumentfotos, Screenshots, Belegen und gescannten PDFs auf diesem Computer auslesen. Wenn möglich, wird die Grafikkarte verwendet: Für NVIDIA installiert die Einrichtung die GPU-Version von ONNX Runtime und NVIDIA-CUDA-Bibliotheken mit etwa 2 GB; auf dem Mac wird Core ML verwendet. Andernfalls läuft die Verarbeitung auf der CPU. Schlägt die GPU-Verarbeitung fehl, wechselt das Plugin mit einer Begründung zur CPU.

## Ein Plugin öffnen

Klicke auf ein Plugin. Sein Fenster zeigt:

- die Herkunft (**Mitgeliefert**, Link, Datei, **Hier erstellt** oder Ordner), Autor, Lizenz und Website;
- nach dem Hinzufügen seinen Schalter: **Für alle Agenten aktiviert** oder **Aus**;
- seinen Zweck;
- **Was Agenten erhalten**: Skills mit Einsatzbeschreibung, Tool-Server mit Programm oder Adresse, Anweisungen und die Agenten, denen das Plugin zur Verfügung steht;
- **Voraussetzungen**, jeweils mit Haken oder Kreuz: andere Plugins, Python- und Node-Pakete, Downloads, Programme auf diesem Computer samt Installationshinweisen und Keys, bei fehlenden Keys mit **Hinzufügen**;
- eigene Dateien, mögliche Probleme im Plugin-Ordner und unter **Über dieses Plugin** seine eigene Beschreibung;
- bei hinzugefügten Plugins den Plugin-Ordner und den Datenordner.

Ein hinzugefügtes Plugin hat unten ein **⋯**-Menü: **Bearbeiten** für selbst erstellte oder aus einem Ordner eingebundene Plugins, **Neueste Version herunterladen** bei Plugins aus einem Link sowie **Erneut einrichten**, **Als ZIP verpacken**, **Ordner anzeigen** und **Entfernen**.

## Voraussetzungen und Einrichtung eines Plugins

Benötigt ein Plugin Pakete oder Downloads, werden diese beim Hinzufügen in seinem eigenen Datenordner eingerichtet, nicht systemweit:

- Python-Pakete kommen in eine eigene Python-Umgebung. Diese wird mit uv erstellt, wenn es auf dem Computer verfügbar ist, andernfalls mit den Python-eigenen Werkzeugen. Auf Computern mit NVIDIA-GPU kann das Plugin benötigte GPU-Pakete wie NVIDIA-CUDA-Bibliotheken hinzufügen. Schlägt deren Installation fehl, verwendet es die CPU.
- Node-Pakete werden in einem eigenen Ordner installiert, ohne ihre Installationsskripte auszuführen.
- Dateien werden in den Datenordner heruntergeladen und anhand ihrer Prüfsumme geprüft, wenn das Plugin eine vorgibt.

Agenten erfahren, wo Python, Pakete und Dateien des Plugins liegen. Die Tool-Server suchen zuerst dort. Die Tools stehen Agenten erst nach abgeschlossener Einrichtung zur Verfügung.

Schlägt die Einrichtung fehl, zeigt die Plugin-Zeile das an. Im Detailfenster findest du die Ursache und **Erneut versuchen**; **Ausgabe anzeigen** öffnet das vollständige Protokoll. Ändern sich die Voraussetzungen durch ein App- oder Plugin-Update, wird das Plugin erneut eingerichtet: mitgelieferte Plugins automatisch, andere über **Erneut einrichten**.

Benötigte Programme wie ffmpeg werden nicht automatisch installiert. Fehlt eines, siehst du Hinweise zur Installation. Benötigte Keys werden anhand ihres Namens aus deinem Tresor geladen. Füge sie unter [Apps → Verbundene Apps → Keys](/apps/connected?tab=keys) hinzu. Die Tool-Server erhalten die Keys; Agenten sehen deren Werte nie.

## Ein Plugin aktivieren oder deaktivieren

Verwende den Schalter in der Plugin-Zeile oder im Detailfenster. Nach dem Deaktivieren erhalten Agenten ab ihrer nächsten Sitzung keine Skills, Tools und Anweisungen des Plugins mehr. Das Plugin und seine Einrichtung bleiben erhalten, damit du es wieder aktivieren kannst.

- Deaktivierst du ein Plugin, von dem andere abhängen, werden auch diese deaktiviert. Die App nennt sie und fragt vorher nach.
- Aktivierst du ein Plugin, werden auch die benötigten Plugins aktiviert.

## Ein Plugin per Link, Datei oder Ordner hinzufügen

1. Klicke auf **Hinzufügen** und dann auf **Über einen Link**, **Aus einer ZIP-Datei** oder **Aus einem Ordner**.
2. Gib die Quelle an:
   - **Über einen Link**: ein Git-Repository mit einem Plugin, für GitHub als owner/repo oder als Adresse, oder ein Link zum Plugin-Ordner auf GitHub. Unter **Branch oder Unterordner im Repository…** kannst du einen Branch oder Tag und einen Ordner angeben.
   - **Aus einer ZIP-Datei**: ein hier oder anderswo als ZIP verpacktes Plugin. Wähle die Datei aus oder ziehe sie in das Feld.
   - **Aus einem Ordner**: ein Ordner auf diesem Computer. Das Plugin wird direkt von dort verwendet. Änderungen im Ordner gelten für neue Sitzungen; das eignet sich besonders während der Entwicklung.
3. Klicke auf **Ansehen**. Du siehst, was das Plugin bereitstellt und benötigt, welche integrierten Plugins es mitbringt und ob benötigte Plugins noch fehlen. Fehlende Voraussetzungen musst du zuerst hinzufügen.
4. Klicke auf **Hinzufügen**, oder auf **Ersetzen**, wenn bereits ein Plugin mit diesem Namen vorhanden ist. Seine Daten bleiben erhalten.

Während der Einrichtung siehst du die einzelnen Schritte. Ein Plugin mit dem Namen eines mitgelieferten Plugins lässt sich nicht hinzufügen; ändere vorher den Namen in seiner plugin.json.

## Ein eigenes Plugin erstellen

1. Klicke auf **Hinzufügen** und dann auf **Plugin erstellen**.
2. Gib einen **Namen** und den Zweck an und klicke auf **Erstellen**. Das Plugin wird hinzugefügt und aktiviert; der Editor öffnet sich.
3. Fülle die Tabs aus und klicke auf **Speichern**:
   - **Über dieses Plugin**: Anzeigename, Version (bei einer neuen veröffentlichten Fassung erhöhen), Zweck, Kategorie und Bild.
   - **Skills**: **Skill schreiben** mit Name, Kategorie, Einsatzbedingungen und Anweisungen, oder **Eigenen Skill kopieren** aus deiner Skill-Sammlung. Klicke auf einen Skill, um ihn zu bearbeiten.
   - **Werkzeuge**: **Tool-Server hinzufügen**, entweder **Ein Programm hier** mit Programm, einem Argument pro Zeile und Umgebungsvariablen als NAME=value-Zeilen oder **Eine Adresse** mit MCP-Server-Adresse und Headern. `${PLUGIN_ROOT}` steht für den Plugin-Ordner, `${PLUGIN_DATA}` für den Datenordner. Ein Server-Argument kann zum Beispiel `${PLUGIN_ROOT}/files/server.py` lauten.
   - **Voraussetzungen**: Python-Pakete, Node-Pakete, Programme, Keys, andere Plugins und Downloads, jeweils ein Eintrag pro Zeile.
   - **Dateien**: **Dateien hinzufügen** nimmt Dateien in das Plugin auf, bis zu 50 MB pro Datei und 200 MB insgesamt. Der Papierkorb entfernt eine Datei. Dateien werden sofort hinzugefügt oder entfernt; **Speichern** ist dafür nicht nötig.
   - **Anweisungen**: ergänzende Anweisungen, die jeder Agent bei aktiviertem Plugin erhält.

Vor dem Speichern wird alles geprüft: Ein Skill muss seine Einsatzbedingungen nennen, das Programm eines Tool-Servers muss ein einzelnes Programm und keine Shell-Befehlszeile sein, und so weiter. Die App zeigt dir, was du korrigieren musst. Haben sich Pakete geändert, wird das Plugin erneut eingerichtet.

Selbst erstellte Plugins liegen im Datenordner der App unter plugins/mine. Zum späteren Bearbeiten öffnest du das Plugin und wählst **Bearbeiten** im **⋯**-Menü.

**Mit einem Agenten erstellen** öffnet eine neue Sitzung mit einem vorbereiteten Auftrag („Hilf mir, ein Plugin für Hydor zu erstellen, das…“). Beschreibe, was es tun soll. Der Agent erstellt und prüft das Plugin und fügt es nach deiner Zustimmung aus seinem Ordner hinzu.

## Ein Plugin teilen

- **Als Datei**: Öffne das Plugin und wähle **⋯ → In eine ZIP-Datei packen** (oder **In eine ZIP-Datei packen** in seinem Editor). Jeder kann es mit **Hinzufügen → Aus einer ZIP-Datei** hinzufügen. Seine Einrichtung wird nicht mit verpackt: Sie wird dort, wo es hinzugefügt wird, neu durchgeführt.
- **Als Link**: Lege den Plugin-Ordner in einem Git-Repository ab, etwa auf GitHub. Andere fügen das Plugin über **Hinzufügen → Über einen Link** hinzu und erhalten neue Versionen über **Neueste Version herunterladen**.

Auch andere Tools mit Unterstützung für das Format Agent Plugins können seine Skills und Tool-Server verwenden. App-spezifische Angaben wie Voraussetzungen und Anweisungen liegen im Abschnitt `com.naget.agent`, den andere Tools überspringen.

## Ein Plugin aktualisieren oder entfernen

- Mitgelieferte Plugins werden zusammen mit der App aktualisiert.
- Plugin aus einem Link: **⋯ → Neueste Version herunterladen** lädt es erneut und richtet es bei geänderten Voraussetzungen neu ein.
- Plugin aus einer ZIP-Datei: Füge die neuere Datei hinzu; sie ersetzt die alte Version.
- Plugin aus einem Ordner: Änderungen im Ordner gelten automatisch für neue Sitzungen.

Zum Entfernen wählst du **⋯ → Entfernen** und bestätigst. Abhängige Plugins werden ebenfalls entfernt; die App nennt sie vorher. Pakete und Downloads des Plugins werden gelöscht. Bei einem hier erstellten Plugin wird auch der Plugin-Ordner gelöscht. Verpacke es vorher als ZIP, wenn du eine Kopie behalten möchtest. Ein aus deinem eigenen Ordner eingebundenes Plugin bleibt in diesem Ordner erhalten.

## Welche Agenten ein Plugin erhalten

Jede von der App gestartete Sitzung erhält die aktivierten und vollständig eingerichteten Plugins, sofern auch deren benötigte Plugins aktiviert sind:

- **Skills** über die Skill-Bibliothek, wie alle anderen Skills; siehe [Welche Agenten welche Skills erhalten](/guide/skills#which-agents-get-which-skills). Ist ein Skill-Name bereits vergeben, wird der Plugin-Skill ausgelassen. Im Plugin-Fenster steht, welchen Skill Agenten stattdessen erhalten;
- **Tool-Server** als MCP-Server, gestartet im Plugin-Ordner mit den eigenen Paketen;
- ihre **Anweisungen**, mit einer Zeile dazu, wo ihre Pakete und Dateien liegen.

Ein Plugin kann auf bestimmte Agenten beschränkt sein; das steht im Detailfenster. Laufende Sitzungen erhalten Änderungen am Plugin erst bei ihrem nächsten Start.

## Eigene Plugins von Claude Code und Codex

Claude Code und Codex haben eigene Plugins aus ihren Marktplätzen, die jeweils nur der betreffende Agent verwendet. Beide haben einen Tab auf der Plugin-Seite:

- **Claude Code**: **Installiert**, jeweils mit Schalter und **Deinstallieren**; **Entdecken** zum Durchsuchen der Marktplätze, nach Installationszahl sortiert, mit **Installieren**; **Marktplätze** zum Hinzufügen per owner/repo, Git-Adresse oder Ordner und zum Entfernen.
- **Codex**: **Zu Codex hinzugefügt**, jeweils mit **Entfernen**; **Weitere finden** zum Durchsuchen der Codex-Marktplätze mit **Hinzufügen**; **Marktplätze** mit Hinzufügen, **Aktualisieren** und Entfernen.

Die zugehörigen Skills erscheinen auf der Skill-Seite unter den eigenen Skills des Agenten. Soll ein Claude-Code-Plugin allen Agenten zur Verfügung stehen, füge es unter den Plugins dieser App über **Hinzufügen → Über einen Link** hinzu.

## Plugins und Sicherheit

Die Tool-Server eines Plugins führen Programme auf diesem Computer mit deinen Benutzerrechten aus, und jeder Agent erhält die Plugin-Anweisungen. Füge deshalb nur Plugins aus vertrauenswürdigen Quellen hinzu. Prüfe vorher, was ein Plugin bereitstellt und benötigt; die App zeigt das vor jeder Installation an. Mitgelieferte Plugins werden zusammen mit der App entwickelt und geprüft.

Keys gehören nie in ein Plugin. Das Plugin nennt nur die benötigten Keys; seine Server erhalten sie zur Laufzeit aus deinem Tresor.

## Einen Agenten fragen

- „Welche Plugins habe ich, und was stellt jedes davon den Agenten zur Verfügung?“
- „Füge das Plugin Sprache zu Text hinzu und transkribiere ~/Recordings/standup.m4a.“
- „Deaktiviere das Plugin Bibliotheksdokumentation.“
- „Erstelle ein Plugin mit den drei Schreib-Skills unseres Teams und verpacke es als ZIP.“
- „Füge das Plugin unter github.com/acme/agent-tools/tree/main/plugins/invoices hinzu.“
- „Warum meldet das Plugin Text aus Bildern eine fehlgeschlagene Einrichtung?“
