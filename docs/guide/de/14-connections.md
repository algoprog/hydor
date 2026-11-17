# Verbundene Apps, Keys und Tools

Verbinde E-Mail, Notion, GitHub, Stripe, lokale Ordner und andere Dienste einmal unter **Apps → Verbundene Apps**. Danach können alle Agenten und Apps damit arbeiten. API-Keys und Anmeldedaten liegen verschlüsselt im Tresor und werden verwendet, ohne dass Agenten die Werte sehen. Zusätzliche Tool-Server lassen sich für Claude Code und Codex einrichten, Plugins auch für Claude Code. So arbeiten Agenten mit deinen Konten und erhalten weitere Werkzeuge.

![Apps → Verbundene Apps: verbundene Dienste, Marktplatz und Keys](images/connections.webp)

## Was Verbindungen, Keys und Tools sind

An drei Stellen ergänzt du Werkzeuge für Agenten:

- **Verbundene Apps** unter [Apps → Verbundene Apps](/apps/connected): Marktplatzdienste, einmal für Claude Code, Codex, Custom, ACP-Agenten und deren Apps verbunden. Jedes Konto stellt seine Tools bereit.
- **Tresor** im Tab **Keys** derselben Seite: API-Keys, Tokens und Anmeldepasswörter. Ein API-Key erlaubt Programmen, einen Dienst über dein Konto zu verwenden. Agenten nutzen diese Daten für Aufrufe, Webseitenanmeldungen und Programme, sehen die Werte aber nicht.
- **MCP-Server und Plugins** unter [Einstellungen → MCP-Server](/settings?s=mcp) und [Einstellungen → Plugins](/settings?s=plugins): selbst eingerichtete Tool-Server in den eigenen Einstellungen von Claude Code und Codex sowie Plugins mit Skills und Tools für alle Agenten; siehe [Plugins](/guide/plugins).

MCP, das Model Context Protocol, ist ein gemeinsamer Standard für Agentenwerkzeuge. Ein verbundenes Konto ist ein von Hydor für alle Agenten eingerichteter und angemeldeter MCP-Server. Unter Einstellungen → Agenten richtest du dagegen MCP-Server selbst per Befehl oder Adresse ein.

## Verbundene Apps öffnen

Öffne **Apps** in der Seitenleiste und den Tab **Verbundene Apps** oder direkt [Apps → Verbundene Apps](/apps/connected). Frühere Links zum Einstellungsbereich Verbindungen führen ebenfalls hierher. Unter Erklärung und **Dienst verbinden** stehen drei Tabs:

- **Verbunden** zeigt Konten und Zustand mit ihrer Anzahl. Auch der übergeordnete Tab zählt die Konten.
- **Marktplatz** enthält verfügbare Dienste.
- **Keys** öffnet den Tresor und zählt gespeicherte Keys.

Mit vorhandenen Konten öffnet sich **Verbunden**, sonst **Marktplatz**. Tabs haben eigene Adressen wie `/apps/connected?tab=market` und `?tab=keys`. Mobil sind sie seitlich scrollbar; Dialoge öffnen sich von unten.

## Einen Dienst im Marktplatz finden

Öffne den [Marktplatz](/apps/connected?tab=market).

- Die Suche berücksichtigt Namen, Beschreibungen, Schlüsselwörter und Kategorien. Jedes eingegebene Wort muss passen.
- Kategorien mit Anzahl grenzen die Auswahl ein: **Alle Dienste**, **Notizen und Dokumente**, **Aufgaben und Projekte**, **E-Mail, Chat und Meetings**, **Kalender und Planung**, **Dateien und Speicher**, **Design und Medien**, **Entwicklertools**, **Cloud und Hosting**, **Datenbanken und Daten**, **Analyse und Überwachung**, **Vertrieb, Marketing und Support**, **Zahlungen und Finanzen**, **Websites und Shops**, **Suche und Web**, **KI und Automatisierung**, **Reisen und Alltag** und **Auf diesem Computer**. Am Computer stehen sie seitlich, bei wenig Platz als horizontal scrollbare Auswahl unter der Suche.
- **Empfohlen** zeigt größere Karten bekannter Dienste wie Notion, Linear, GitHub, Figma, Stripe oder Zapier, solange Suche und Kategorien nicht eingeschränkt sind. Pfeile verschieben die Reihe. Darunter folgen alle Dienste, die Kategorie oder Suchtreffer mit Anzahl. Auf Smartphones stehen sie in einer Liste.

Jede Karte nennt Dienst, mögliche Agentenaktionen und Verbindungsart:

- **Browseranmeldung**: Anmeldung beim Dienst im Browser.
- **API-Key**: einen vom Dienst bereitgestellten Key einfügen.
- **Keine Anmeldung**: keine Zugangsdaten erforderlich.
- **Läuft auf diesem Computer**: Hydor startet bei Bedarf ein lokales Programm.
- **Läuft hier mit einem Key**: lokales Programm mit deinem Key.
- **Adresse und App-Passwort**: E-Mail-Zugang für Mailprogramme.

Ein Häkchen bedeutet, dass die Serverantwort mit dem Katalogeintrag abgeglichen wurde. **Nicht geprüft** bedeutet, dass dieser Test noch fehlt. Bereits verbundene Dienste zeigen **Verbunden** oder **Erneut anmelden** statt **Verbinden**.

Beispiele:

- **Notizen, Aufgaben und Projekte**: Notion, Craft, Linear, Asana, Atlassian mit Jira und Confluence, ClickUp, monday.com, Todoist.
- **E-Mail, Chat und Kalender**: Email für gewöhnliche Postfächer mit App-Passwort, Gmail, Slack, Fireflies, Granola, Google Calendar, Calendly.
- **Dateien und Design**: Google Drive, Dropbox, Box, Figma, Canva, Miro, Gamma, Cloudinary.
- **Entwicklertools und Hosting**: GitHub, GitLab, Sentry, CircleCI, Postman, Cloudflare, Vercel, Netlify, Railway, Context7, DeepWiki.
- **Daten und Analyse**: Airtable, Supabase, Neon, PostgreSQL, MongoDB, SQLite, PostHog, Mixpanel, Amplitude, Datadog.
- **Geschäftliches**: Stripe, PayPal, Plaid, Square, HubSpot, Intercom, Attio, Klaviyo, Webflow, Wix, WordPress.com.
- **Suche und Web**: Exa, Perplexity, Tavily, Brave Search, Firecrawl, Wolfram und ein Playwright-Browser.
- **KI und Alltag**: Hugging Face, Zapier, AllTrails, Kiwi.com, trivago, Strava.
- **Auf diesem Computer**: gewählte lokale Ordner, Git, Uhrzeit und ein Wissensgraph.

Ohne Treffer erscheint **Kein passender Dienst**. Du kannst selbst einen ergänzen; siehe [Einen Dienst zum Marktplatz hinzufügen](/guide/connections#add-a-service-to-the-marketplace). Neue Dienste kommen mit App-Updates hinzu.

## Einen Dienst verbinden

1. Klicke auf die Karte. Der Dialog erklärt Funktionen, Kategorie, Verbindungsart, Prüfdatum oder fehlende Prüfung. **Website** und **Dokumentation** führen zum Anbieter. Ein Kasten zeigt Serveradresse oder lokalen Befehl und erklärt, dass alle Agenten die Tools unter dem Kurznamen, etwa „notion“, erhalten. Du kannst sie pro Sitzung deaktivieren.
2. Lies gegebenenfalls den gelben Hinweis, etwa zu benötigtem uv beziehungsweise uvx oder einem eigenen OAuth-Client.
3. Fülle die Felder aus und klicke auf **Verbinden** beziehungsweise **Bei … anmelden**.

Danach erscheint der Dienst unter **Verbunden** und wird im Hintergrund getestet. Die benötigten Angaben hängen vom Dienst ab.

### Dienste ohne Zugangsdaten

Klicke auf **Verbinden**. Manche Dienste benötigen Einstellungen: GitLab eine Serveradresse, standardmäßig gitlab.com, lokale Dateien erlaubte Ordner mit einem vollständigen Pfad pro Zeile und SQLite eine Datenbankdatei. Lokale Dateien dürfen nur innerhalb erlaubter Ordner gelesen und geändert werden. Optionale Felder dürfen leer bleiben. **Abrufen** neben einem Feld verlinkt zur Bezugsquelle des Werts.

### Dienste mit einem Key

Online-Dienste zeigen ein **Key**-Feld und **Key erstellen** als Link zum Anbieter. Lokale Dienste fragen gegebenenfalls mehrere Werte wie Token oder Verbindungszeichenfolge ab. Füge sie ein und wähle **Verbinden**.

Der Key wird verschlüsselt im Tresor gespeichert. Danach sind nur seine letzten Zeichen sichtbar. GitHub verwendet zum Beispiel einen fein abgestuften persönlichen Zugriffstoken, der auf bestimmte Repositorys und Rechte begrenzt werden kann.

### Dienste mit Browseranmeldung

1. Klicke auf **Bei … anmelden**.
2. Am Computer öffnet sich ein kleines Fenster, mobil die Anmeldeseite im selben Tab.
3. Melde dich an und erlaube den Zugriff. Hydor zeigt währenddessen „Wartet auf den Abschluss deiner Anmeldung…“.
4. Eine Meldung bestätigt die Verbindung. Mobil kehrst du zu Apps → Verbundene Apps zurück.

Tokens bleiben verschlüsselt auf diesem Computer und werden automatisch erneuert. Agenten sehen sie nie. Schließe die Anmeldung innerhalb von 15 Minuten ab, sonst starte erneut. Verweigerter Zugriff wird entsprechend gemeldet.

Asana, Box, HubSpot, Slack, Google-Apps und manche andere Dienste benötigen einen eigenen OAuth-Client. Ihr Dialog öffnet **Eigene Client-ID erforderlich** mit Anleitung. Andere bieten **Eigene Client-ID verwenden (optional)**; diese Option öffnet sich auch, wenn automatische Clientregistrierung nicht möglich ist.

1. Erstelle den Client in den Entwicklereinstellungen des Dienstes.
2. Hinterlege die kopierbare **Callback-Adresse** aus Hydor.
3. Füge **Client-ID** und gegebenenfalls **Client-Geheimnis** ein.
4. Klicke auf **Bei … anmelden**.

### Dienste auf diesem Computer

Diese starten pro Sitzungsagent ein Programm über npx oder uvx. Beim ersten Test kann der Download dauern. Benötigte Keys werden beim Start aus dem Tresor in die Prozessumgebung übernommen, niemals in die für andere Programme lesbare Befehlszeile.

## Dein E-Mail-Konto verbinden

Mit Adresse und App-Passwort können Agenten E-Mails lesen, suchen, ordnen, entwerfen und senden. Unterstützt werden Gmail, iCloud Mail, Fastmail, Yahoo, AOL, GMX, WEB.DE, Zoho, Posteo, mailbox.org, Proton Mail über Bridge und viele Firmen- und Bildungskonten.

1. Öffne den [Marktplatz](/apps/connected?tab=market) und wähle **Email** unter **E-Mail, Chat und Meetings** oder per Suche.
2. Gib deine **E-Mail-Adresse** ein. Hydor sucht die Mailserver automatisch. Bekannte Anbieter erhalten eine Anleitung für App-Passwörter mit Link zur Anbieterhilfe.
3. Erstelle ein App-Passwort und füge es ein.
4. Gib optional **Deinen Namen** für ausgehende Nachrichten an.
5. Klicke auf **Verbinden**. Hydor prüft Lese- und Versandzugang vor dem Speichern und erklärt Fehler wie falsche Zugangsdaten, erforderliches App-Passwort oder nicht erreichbare Server.

Das App-Passwort liegt verschlüsselt im lokalen Tresor und bleibt für Agenten unsichtbar. Für weitere Konten öffne **Email** erneut und wähle **Weiteres Konto hinzufügen**.

### Ein App-Passwort erstellen

App-Passwörter werden separat für Mailprogramme in den Sicherheitseinstellungen deines Kontos erzeugt. Meist muss zuerst Zwei-Faktor-Authentifizierung aktiv sein.

- **Gmail**: Aktiviere die Bestätigung in zwei Schritten und öffne im Google-Konto **Sicherheit → App-Passwörter**. Firmen- und Bildungskonten benötigen eine Freigabe der Administration.
- **iCloud Mail**: account.apple.com → **Anmeldung und Sicherheit → Anwendungsspezifische Passwörter**.
- **Fastmail**: **Settings → Privacy & Security → Manage app passwords**.
- **Yahoo** und **AOL**: **Account Security → Generate app password**.
- **GMX**, **WEB.DE** und **Zoho**: Aktiviere zuerst IMAP in den Postfacheinstellungen.
- **Proton Mail**: Installiere und verbinde Proton Mail Bridge auf diesem Computer. Verwende das dort für deine Adresse angezeigte Passwort.

### Wenn Mailserver nicht gefunden werden

Bei unbekannten Anbietern liest Hydor öffentlich bereitgestellte Mailprogrammeinstellungen. Dafür wird Mozillas öffentliches Anbieterverzeichnis mit deiner Domain, niemals mit der vollständigen Adresse, abgefragt. Ohne Treffer werden imap. und smtp. vor deiner Domain versucht und bei der Anmeldung geprüft.

Scheitert das, öffne **Server und Benutzername** und trage IMAP- und SMTP-Server, Ports und Verschlüsselung, **SSL/TLS** oder **STARTTLS**, gemäß Anbieterhilfe ein. Ergänze einen abweichenden Benutzernamen. Unverschlüsselte Verbindungen sind nur zum lokalen Computer erlaubt, etwa für Proton Mail Bridge.

### Outlook.com und Microsoft 365

Outlook.com, Hotmail, Live sowie Microsoft-365-Firmen- und Bildungskonten können so noch nicht verbunden werden. Microsoft hat App-Passwörter dafür abgeschaltet. Eine Microsoft-Anmeldung wird von Hydor noch nicht unterstützt. Der Dialog erklärt das bei entsprechenden Adressen.

### Deine E-Mail-Konten

Unter **Verbunden** listet Email deine Konten nach Adresse. **Testen** prüft ihre Anmeldung. **Konten** öffnet je Konto **Testen**, **Ändern** für App-Passwort, Name oder Server und **Entfernen**. Entfernen löscht nur das gespeicherte App-Passwort, nicht Postfachinhalte. Beim letzten Konto wird Email getrennt; **Verbindung trennen** entfernt alle Konten.

### Was Agenten mit E-Mails tun können

Tools stehen unter „email“ zur Verfügung. Bei mehreren Konten wählst du das gewünschte Konto über seine Adresse. Ohne Adressangabe wird das erste Konto verwendet.

- **list_folders**, **search_email** mit Filtern nach Absender, Empfänger, Betreff, Text, Datum, ungelesen, markiert und Anhängen, neueste zuerst, und **read_email** mit Beteiligten, Text und Anhangsnamen und -größen. Lesen markiert keine Nachricht als gelesen.
- **save_attachments** speichert Anhänge im Sitzungsordner.
- **mark_email** setzt gelesen, ungelesen und Markierungen. **move_email** verschiebt in andere Ordner, niemals in den Papierkorb.
- **save_draft** speichert einen Entwurf zum späteren manuellen Versand und sendet nichts.
- **send_email** sendet sofort eine neue Nachricht oder Thread-Antwort, optional mit Dateien aus dem Sitzungsordner, und speichert eine Kopie unter Gesendet.
- **delete_email** verschiebt Nachrichten in den Papierkorb oder löscht sie endgültig.

Zum Unterbinden von Versand und Löschen deaktiviere **send_email** und **delete_email** unter **Tools**; siehe [Konten oder einzelne Tools deaktivieren](/guide/connections#turn-an-account-or-some-of-its-tools-off). E-Mail-Inhalte sind externe Daten und dürfen nicht als Anweisungen befolgt werden. Für neue E-Mails lassen sich Aufgaben starten; siehe [Änderungen überwachen](/guide/tasks#watch-for-a-change).

## Eine Verbindung prüfen

Unter **Verbunden** zeigt jedes Konto seinen Zustand:

- **Funktioniert**, letzten Prüfzeitpunkt, aktivierte Tool-Anzahl wie „12 von 14 Tools aktiv“ und Anzahl mit vorheriger Freigabe.
- **Noch nicht getestet**.
- **Erneute Anmeldung erforderlich**, wenn die Anmeldung nicht erneuert werden konnte.
- **Funktioniert nicht** mit Begründung.

**Testen** verbindet sich wie ein Agent und liest die Tools. Eine Meldung bestätigt Funktion und Anzahl oder erklärt Fehler wie abgelehnten Key oder erforderliche Neuanmeldung. Direkt nach dem Verbinden erfolgt dieser Test automatisch.

## Konten oder einzelne Tools deaktivieren

- **Alle Sitzungen**, mobil nur der Schalter: Aktivierte Konten stehen allen Sitzungen zur Verfügung, sofern sie dort nicht deaktiviert sind. Deaktivierte Konten müssen pro Sitzung ausdrücklich aktiviert werden. Neue Konten sind zunächst aktiv.
- **Tools** erscheint nach dem ersten erfolgreichen Auflisten. Jedes Tool zeigt Beschreibung und **Aktiviert**, **Vorher fragen** oder **Deaktiviert**. Aktivierte Tools dürfen frei verwendet werden, bei Rückfragen wartet jeder Aufruf im Postausgang. Deaktivierte Tools erhalten Agenten nicht. Sendende, veröffentlichende, antwortende, einladende, teilende, löschende, zahlende, überweisende oder erstattende Tools sind als **Wirkt nach außen** markiert. Versucht ein Agent ein deaktiviertes Tool, erhält er den entsprechenden Hinweis.

## Vorher fragen: Aufrufe zur Freigabe

Ein Tool mit **Vorher fragen** wird niemals sofort ausgeführt. Hydor hält den Aufruf von Claude Code, Codex, Custom, anderen Agenten, geplanten Aufgaben oder Apps zurück. Der Agent erfährt sofort von der ausstehenden Freigabe und arbeitet weiter oder beendet den Durchlauf mit Hinweis. Er soll keinen anderen Weg versuchen. Der bearbeitbare Entwurf wartet oben im [Posteingang](/inbox) unter **Postausgang**, bis du **Senden** oder **Verwerfen** wählst; siehe [Der Postausgang](/guide/inbox#the-outbox-calls-held-for-your-ok).

- Neu verbundene Konten setzen nach außen wirkende Tools standardmäßig auf **Vorher fragen**, andere auf **Aktiviert**. Unter **Tools** kannst du das ändern.
- Frühere Konten behalten ihre Einstellungen, damit bestehende Abläufe funktionieren. Eine Aktion wie **Bei 3 Tools für Senden, Veröffentlichen, Löschen oder Bezahlen vorher fragen** stellt alle entsprechenden Tools gemeinsam um. Sie erscheint, solange solche Tools ohne ausdrückliche Auswahl aktiviert sind.
- Die Vorgabe gilt für alle Sitzungen und Berechtigungsmodi, einschließlich **Vollzugriff**. Agenten können sie nur nach deiner Zustimmung auf einer Karte ändern und zurückgehaltene Aufrufe nicht selbst senden. Eine zusätzliche Agentenfreigabe entfällt, damit du nur einmal im Postausgang zustimmst.
- Die Einordnung basiert auf Tool-Name, Beschreibung und Anbieterhinweisen wie „nur lesend“ oder „löscht“. Prüfe die Markierungen und stelle weitere Tools bei Bedarf selbst auf **Vorher fragen**.

Geplante Aufgaben kannst du mit **Ohne Versand testen** ohne externe Aktionen erproben; siehe [Geplante Aufgaben](/guide/tasks#try-a-task-with-a-test-run).

## Eine Verbindung ändern oder erneut anmelden

- **Ändern** öffnet bei Keys oder Einstellungen das Formular mit bisherigen Angaben. Gespeicherte Geheimnisse zeigen „Gespeichert: zum Beibehalten leer lassen“. Nur ein neuer Wert ersetzt sie. Bestätige mit **Speichern**.
- **Erneut anmelden** erneuert Browseranmeldungen. Bis dahin stehen Konten mit abgelaufener Anmeldung Agenten nicht zur Verfügung.

Ändert der Katalog Adresse oder Anmeldeverfahren eines Dienstes, bleibt das bestehende Konto beim alten Ziel. Die Karte erklärt, dass erst erneutes Verbinden die Änderung übernimmt. Keys und Tokens werden ohne deine erneute Verbindung nicht an eine neue Adresse gesendet.

## Ein Konto trennen

Klicke auf **Verbindung trennen**, mobil das Steckersymbol, und bestätige. Die lokal gespeicherte Anmeldung oder der Key wird entfernt und Agenten erhalten keine Tools mehr. Bei Browseranmeldungen widerruft Hydor Tokens zusätzlich beim Dienst, sofern dieser das unterstützt.

## Konten für eine einzelne Sitzung auswählen

Sitzungen erhalten standardmäßig alle Konten mit aktivem Schalter **Alle Sitzungen**. Für Ausnahmen:

1. Öffne das Sitzungsmenü (⋯) → **Sitzungseinstellungen → Verbundene Konten**.
2. Aktiviere oder deaktiviere einzelne Konten. Die Anzeige unterscheidet allgemeine Aktivierung, allgemeine Deaktivierung und nur hier geltende Ausnahmen.
3. Klicke auf **Fertig**.

Online-Dienste übernehmen die Änderung sofort, lokale Dienste beim nächsten Agentenstart. Ohne Verbindungen bietet der Dialog **Verbundene Apps öffnen**. Eigene Agenten können ebenfalls bestimmte Konten für ihre Sitzungen aktivieren; siehe [Agenten](/guide/agents).

## Wie Agenten verbundene Konten verwenden

- Claude Code, Codex, Custom und ACP-Agenten erhalten dieselben Tools unter dem Kurznamen des Dienstes.
- Beim Start erfährt der Agent von vorhandenen Konten und soll sie für passende Aufgaben verwenden. Er kann Konten und gespeicherte Keys nach Namen auflisten.
- Verfügbar sind nur aktivierte, angemeldete Konten. Tokens werden auch ohne aktive Verwendung im Hintergrund erneuert, damit lange Sitzungen funktionieren.
- Keys und Tokens gelangen weder in Agenteneinstellungen noch Befehlszeilen. Bekannte Werte werden in Tool-Antworten maskiert.
- Tools mit **Vorher fragen** kennzeichnen das in ihrer Beschreibung. Nach Senden oder Verwerfen wird die Entscheidung in der Sitzung sichtbar und erreicht den Agenten mit deiner nächsten Nachricht.
- Geplante Aufgaben können auf neue Deals, Dateien, Tickets oder Zahlungen und auf bevorstehende Kalendertermine reagieren. Die App prüft selbst ohne Modell über rein lesende Konto-Tools, niemals über sendende, ändernde, löschende oder zahlende Tools; siehe [Änderungen überwachen](/guide/tasks#watch-for-a-change).
- Die Suche mit Strg+K beziehungsweise ⌘K findet auch verbundene Konten.

## Einen Dienst zum Marktplatz hinzufügen

Du kannst über einen Pull Request im GitHub-Repository von Hydor Dienste ergänzen oder korrigieren. **So fügst du einen hinzu** unten im Marktplatz öffnet die Anleitung.

1. Erstelle gemäß Anleitung eine JSON-Datei unter `catalog/` mit Name, verständlicher Funktionsbeschreibung, Kategorie, Symbol, Farbe, Website, Dokumentation, Serveradresse oder lokalem Befehl, Anmeldeverfahren und auszufüllenden Feldern.
2. Verwende den offiziellen MCP-Server des Anbieters mit dokumentierter Adresse, sofern vorhanden. Lokale Programme sind sinnvoll, wenn kein solcher Server existiert oder lokale Funktionen wie Dateizugriff benötigt werden.
3. Trage keine Keys oder Tokens ein. Nutzer hinterlegen ihre eigenen im Tresor.
4. Führe die beschriebene Prüfung aus. Sie validiert die Datei und kann die Serverantwort prüfen.
5. Reiche den Pull Request ein. Nach dem Merge erscheint der Dienst mit dem nächsten Update im Marktplatz.

## Keys im Tresor speichern

Öffne den [Tab Keys](/apps/connected?tab=keys). API-Keys, Tokens und Anmeldepasswörter liegen verschlüsselt auf diesem Computer. Weder hier noch für Agenten werden sie erneut angezeigt; sichtbar bleiben nur die letzten Zeichen.

Agenten verwenden sie über Hydors Webanfragen, Browser und ausdrücklich erlaubte lokale Befehle. Die App fügt Werte selbst und nur an erlaubten Stellen ein.

Jeder Key zeigt:

- Namen und maskierte Wertvorschau wie „…f3a9“;
- Notiz;
- erlaubte Hosts und gegebenenfalls **In Befehlen** oder **Noch keine Hosts erlaubt**;
- letzte Verwendung oder „Noch nicht verwendet“ sowie Erstellung und letzte Wertänderung.

Ohne Keys erklärt die Seite das Hinzufügen oder Anfragen durch Agenten.

Auch Apps können Wetter-, Karten- oder andere Keys benötigen. Du gibst sie auf der App-Seite, Installationskarte oder Gesprächskarte ein; siehe [Benötigte Keys hinterlegen](/guide/apps#give-it-the-keys-it-needs). Sie liegen hier unter den von der App vorgegebenen Namen und Hosts. Die Notiz nennt die zugehörige App.

### Einen Key hinzufügen

1. Klicke auf **Key hinzufügen**.
2. **Name**: 2 bis 64 Großbuchstaben, Ziffern und Unterstriche, beginnend mit einem Buchstaben, etwa WEATHER_API_KEY. Eingaben werden entsprechend umgewandelt, „github token“ etwa in GITHUB_TOKEN, und das Feld zeigt das an.
3. **Wert**: Füge den Key ein. Nur eine Zeile ist erlaubt, außer bei Blöcken mit -----BEGIN wie Zertifikaten oder privaten Keys.
4. **Erlaubte Hosts**: bis zu 20 durch Kommas getrennte Adressen wie api.example.com. Der Key wird nur über HTTPS an diese Hosts und ihre Subdomains gesendet. Ohne Host ist keine Verwendung möglich.
5. **Befehle auf diesem Computer dürfen ihn verwenden** ist zunächst aus. Aktiviere es bei Bedarf für Datenbankpasswörter oder Git-Tokens; siehe [Befehle mit Keys](/guide/connections#commands-that-use-a-key).
6. **Notiz** erklärt den Zweck und ist für Agenten sichtbar.
7. **Übermittlung**, optional: Standardmäßig steht der Key hinter „Bearer “ im Authorization-Header. Du kannst Headernamen wie X-Api-Key und das Präfix ändern. Bei anderen Headern kann das Präfix leer bleiben. Alternativ kannst du einen URL-Parameter wie api_key wählen.
8. Klicke auf **Speichern**.

Bereits vorhandene Namen werden abgelehnt. Ersetze stattdessen den Wert des bestehenden Keys.

### Den Wert eines Keys ersetzen

Klicke auf den runden Pfeil **Neuer Wert**, füge ihn ein und wähle **Ersetzen**. Hosts, Notiz und Übermittlungsart bleiben erhalten.

### Erlaubte Ziele eines Keys ändern

Öffne über den Stift **Hosts, Notiz und Übermittlung** und ändere Hosts, Befehlsfreigabe, Notiz oder Übermittlungsart. **Speichern** übernimmt die Angaben, der Wert bleibt unverändert.

### Einen Key löschen

Klicke auf den Papierkorb **Löschen** und bestätige. Der Wert wird endgültig entfernt und kann von Agenten nicht mehr verwendet werden.

### Wie Agenten einen Key verwenden dürfen

- Dienste nach Key-Namen aufrufen. Die App fügt ihn gemäß Einstellung oder als Platzhalter wie {{GITHUB_TOKEN}} in Adresse, Header oder Inhalt ein. Auch Benutzername und Passwort einer Basic-Anmeldung sind möglich.
- Werte nach Namen in einzeilige Browser-Anmeldefelder eintragen, nur auf erlaubten Hosts über HTTPS oder lokal. Das Feld zeigt danach Punkte; der Agent sieht lediglich, dass es aus dem Tresor befüllt wurde.
- Lokal über Befehle nutzen, wenn du das am Key freigegeben und den Befehl erlaubt hast; siehe [Befehle mit Keys](/guide/connections#commands-that-use-a-key).
- Im Web ausschließlich erlaubte Hosts und Subdomains über HTTPS erreichen, niemals lokale Rechner oder Netzwerke. Weiterleitungen zu unerlaubten Hosts werden nicht verfolgt.
- Für einen einzelnen Aufruf Header oder URL-Parameter abweichend wählen.
- Namen, Hosts und Notizen sehen, niemals Werte. Antworten, Seiten und Befehlsausgaben maskieren die Keys.

## Wenn ein Agent nach einem Key fragt

Agenten sollen Passwörter, Tokens und Keys niemals im Chat anfordern. Fehlt ein benötigter Key, erscheint stattdessen **Der Agent fragt nach einem Key** mit Name, Begründung und häufig Bezugsquelle.

1. Füge den Wert in das Feld ein.
2. Prüfe die vorgeschlagenen Hosts unter **Nur senden an** und ändere sie bei Bedarf. Ohne Host ist keine Nutzung möglich.
3. Klicke auf **Im Tresor speichern**.

Der Key gelangt direkt in den verschlüsselten Tresor, nicht ins Gespräch. Die Karte bestätigt die Speicherung. Der Agent erfährt nur, dass der Key nun vorhanden ist, und kann weiterarbeiten.

- **Nicht jetzt** lehnt ab. Der Agent soll ohne Key fortfahren oder Alternativen erklären. **Doch eingeben** auf der Karte erlaubt eine spätere Änderung deiner Entscheidung.
- Offene Karten erscheinen auch im [Posteingang](/guide/inbox) als Key-Anfrage. **Öffnen** führt zur Sitzung.
- Existiert der Name bereits, soll der Agent den vorhandenen Key nutzen. Funktioniert dieser nicht mehr, darf er einen Ersatz anfragen. Das Feld weist dann auf das Ersetzen hin.
- Bei lokaler Befehlsnutzung zeigt die Karte **Befehle auf diesem Computer dürfen ihn verwenden**, zunächst aktiviert. Deaktivierst du dies, bleibt die Verwendung auf erlaubten Hosts möglich. Für vorhandene Keys heißt die Karte **Der Agent möchte einen Key in Befehlen verwenden**. Lass das Wertfeld leer, um den bisherigen Wert zu behalten, und speichere.

### Eine Anmeldung mit mehreren Feldern

Bei Webseiten- oder Dienstanmeldungen fragt **Der Agent bittet um Anmeldedaten** alle nötigen Angaben gemeinsam ab, etwa E-Mail und Passwort oder Datenbankadresse, Benutzer und Passwort. Geheimnisse sind verdeckt; das Augensymbol zeigt sie an.

1. Fülle Pflichtfelder aus. Optionale Felder dürfen leer bleiben.
2. Prüfe die erlaubten Hosts unter **Nur senden an**.
3. Klicke auf **Im Tresor speichern**.

Jedes Geheimnis erhält einen eigenen Key-Namen, etwa VOLTARO_PASSWORD. Mit **Der Agent sieht diese Angabe** markierte Daten wie Serveradressen sind nicht geheim, werden direkt übergeben und nicht im Tresor gespeichert. Vorhandene Werte bleiben bei leeren Feldern erhalten. Nach dem Speichern listet die Karte die Keys. Der Agent kann sich damit auf erlaubten Hosts im Browser anmelden, ohne die Werte zu sehen.

## Befehle mit Keys

Manche Aufgaben brauchen Zugangsdaten in lokalen Programmen: GitHub-Push mit Token, Datenbankzugriff oder Dienstaufrufe aus Skripten. Dafür gibt es ein Tool, das einen Befehl mit Tresor-Keys als Umgebungsvariablen unter ihren jeweiligen Namen startet. Die Rückgabe maskiert bekannte Werte.

- Nur Keys mit aktivem **Befehle auf diesem Computer dürfen ihn verwenden** werden übergeben. Das stellst du im Stiftdialog oder bei der Anfrage ein.
- Vor der Ausführung zeigt **Befehl ausführen mit …** die Key-Namen, den Befehl und seinen Zweck. **Erlauben** gilt einmal. **Für diese Sitzung erlauben** erlaubt spätere Befehle derselben Sitzung mit denselben Keys bis zum App-Neustart. **Nicht ausführen** lehnt ab; du kannst eine Alternative nennen.
- Vollzugriff führt diese Befehle wie andere ohne Rückfrage aus. Im Planmodus laufen keine.
- Programme können grundsätzlich alles tun, auch Keys an andere Orte senden. Erlaube deshalb nur verstandene Befehle und nur bei tatsächlich benötigten Keys.
- Standardmäßig endet ein Befehl nach zwei Minuten; der Agent kann bis zu zehn Minuten anfordern.

## Ein Formular eines Dienstes ausfüllen

Ein Dienst kann während der Arbeit Datum, Auswahl, Bestätigung oder das Öffnen einer Seite benötigen. Unabhängig vom Agenten erscheint eine Karte in Sitzung und [Posteingang](/guide/inbox):

- **… bittet dich, ein Formular auszufüllen** zeigt Nachricht und Felder: kurze oder lange Texte, Zahlen, Daten, Ja-Nein-Schalter und Einzel- oder Mehrfachauswahl. **Senden** übermittelt die Angaben. Fehlende Pflichtfelder und ungültige Zahlen werden vorher markiert. Weitere unzulässige Antworten wie zu lange Texte, falsche E-Mail-Adressen oder zu wenige Auswahlen nennt die Karte mit Korrekturhinweis und bleibt offen.
- **… bittet dich, eine Seite zu öffnen** zeigt einen Link. **Öffnen** startet einen neuen Tab etwa zur Anmeldung oder Freigabe und meldet das dem Dienst.
- **… bittet um Zustimmung** ist eine Ja-Nein-Frage. **Erlauben** bestätigt.

**Ablehnen** sagt nein, **Nicht jetzt** bricht diesen Versuch ab. Karten warten bis zu einer Stunde; endet der Agentendurchlauf vorher, wird die Anfrage abgebrochen. Auch für Codex eingerichtete MCP-Server verwenden solche Karten.

## MCP-Server für Claude Code und Codex einrichten

Unter [Einstellungen → Agenten → MCP-Server](/settings?s=mcp) verwaltest du Tool-Server in den eigenen Agenteneinstellungen, etwa eigene Server oder Tools außerhalb des Marktplatzes. Neue Sitzungen laden sie; laufende übernehmen Änderungen beim Neustart. Custom verwendet sie ebenfalls, außer SSE-Servern; siehe [Custom](/guide/custom).

Claude-Code- und Codex-Server stehen in getrennten Gruppen. **Server hinzufügen** steht neben dem Titel. Über **Ordner** oben wählst du die für Claude Code relevanten ordnerspezifischen Server. Das (i) jeder Gruppe erklärt, wann Änderungen übernommen werden.

Jeder Server zeigt:

- Namen und Typ: lokaler **Befehl**, **HTTP** oder das ältere **SSE**;
- bei Claude Code den Geltungsbereich: **Alle Ordner**, **Dieser Ordner, nur für dich** oder **Dieser Ordner, geteilt**;
- **Deaktiviert**, falls in Codex abgeschaltet;
- Befehl oder Adresse und die Namen von Umgebungsvariablen, Headern oder Bearer-Token-Variablen. Werte bleiben auf dem Server verborgen;
- nach einer Prüfung den Verbindungszustand.

### Einen Server hinzufügen

Öffne [Server hinzufügen](/settings?s=mcp&find=Add%20server). Der Dialog fragt:

- **Hinzufügen zu**: Claude Code, Codex oder standardmäßig beide.
- **Name**: bis zu 64 Buchstaben, Ziffern, Punkte, Bindestriche oder Unterstriche, beginnend mit Buchstabe oder Ziffer. Tool-Namen bestehen daraus, einem Schrägstrich und dem Tool-Namen.
- **Typ**: Befehl, HTTP oder SSE. Codex unterstützt SSE nicht und wird bei dieser Auswahl ausgeschlossen.
- Für Befehle:
  - **Befehl** als vollständige Zeile, etwa `npx -y @modelcontextprotocol/server-github`. Er startet beim Sitzungsbeginn auf diesem Rechner. Argumente mit Leerzeichen benötigen Anführungszeichen. ~ am Argumentanfang steht für deinen persönlichen Ordner.
  - **Umgebung** mit einer KEY=value-Zeile pro Variable. Zeilen mit # werden ignoriert. Werte werden in den Agentenkonfigurationen gespeichert und hier nicht erneut angezeigt.
- Für HTTP und SSE:
  - **URL** mit http:// oder https://.
  - **Header** für Claude Code, eine Zeile „Name: Wert“ etwa für API-Keys. OAuth-Server benötigen keine; du meldest dich nach dem Hinzufügen an.
  - **Bearer-Token-Variable** für Codex, optional: Name einer Umgebungsvariablen mit dem zu sendenden Token.
- **Wo Claude Code ihn verwendet**, bei alleiniger Claude-Code-Auswahl **Geltungsbereich**:
  - **Alle Ordner**, der Standard, gilt für alle Sitzungen dieses Rechners.
  - **Dieser Ordner** gilt nur im oben gewählten Ordner und liegt in deinen persönlichen Claude-Code-Einstellungen.
  - **Geteilte .mcp.json** speichert im Projektordner für alle am Repository Arbeitenden.

  Codex-Server gelten immer für alle Ordner.

**Server hinzufügen** verwendet die eigenen Einrichtungsbefehle der Agenten. So bleiben deren Einstellungen im erwarteten Format. Bei Ablehnung zeigt der Dialog die Agentenantwort. Korrigiere die Angaben und wiederhole; nur fehlgeschlagene Agenteneinrichtungen werden erneut versucht.

### Serververbindungen prüfen

[Verbindungen prüfen](/settings?s=mcp&find=Check%20connections) neben der Gruppenüberschrift startet Server wie eine neue Sitzung und zeigt:

- **Verbunden** mit Tool-Anzahl;
- **Anmeldung erforderlich**;
- **Verbindung wird hergestellt**;
- **Fehlgeschlagen** mit Grund oder Hinweis auf fehlenden Start beziehungsweise fehlende Antwort;
- **Deaktiviert**.

Dafür wird kein Modell verwendet. Die Prüfung dauert gegebenenfalls ein bis zwei Minuten. Bei Claude Code zählt der oben ausgewählte Ordner einschließlich seiner eigenen Server.

### Bei einem Server anmelden

OAuth-Server benötigen eine einmalige Anmeldung. **Anmelden** erscheint bei entsprechendem Prüfergebnis. Alternativ wähle im Menü **⋯** **Im Terminal anmelden (OAuth)**. Ein App-Terminal öffnet die agenteneigene Anmeldung. Folge den dortigen Schritten.

### Einen Server entfernen

Wähle im Menü **⋯** **Entfernen** und bestätige. Der Agent lädt den Server nicht mehr. Bereits laufende Sitzungen behalten ihn bis zum Neustart.

## Plugins zu Claude Code hinzufügen

Claude Code hat eigene Plugins mit Skills, Befehlen, Agenten, Hooks und MCP-Servern aus Marktplatzkatalogen in GitHub-, Git-Repositorys oder Ordnern. Diese gelten nur für Claude Code und stehen im Tab **Claude Code** unter [Einstellungen → Agenten → Plugins](/settings?s=plugins&find=Claude%20Code). Codex-Plugins stehen im Tab **Codex**, gemeinsame Plugins unter **Alle Agenten**; siehe [Plugins](/guide/plugins).

### Installierte Plugins

**Installiert** zeigt lokale Claude-Code-Plugins mit Name, Marktplatz, Version und Beschreibung. Neue Claude-Code-Sitzungen laden sie.

- Der Schalter aktiviert oder deaktiviert ohne Entfernung.
- **Deinstallieren** im Menü **⋯** fragt nach. Neue Sitzungen laden danach keine zugehörigen Skills, Befehle oder Server mehr.

### Ein Plugin finden und installieren

**Entdecken** listet Marktplatz-Plugins nach Installationshäufigkeit mit Anzahl. **Plugins durchsuchen** grenzt ein. Zunächst werden 40 Einträge gezeigt; **Mehr anzeigen** ergänzt jeweils 40.

**Installieren** mit Bestätigung richtet das Plugin für alle Claude-Code-Sitzungen ein. Plugins können Hooks und Server mit lokaler Befehlsausführung hinzufügen. Installiere nur vertrauenswürdige Plugins.

Hydor fragt die Plugin-Liste höchstens alle zehn Minuten und nach Änderungen erneut bei Claude Code ab. Die erste Abfrage kann dauern.

### Plugin-Marktplätze

**Marktplätze** zeigt die Kataloge für Claude-Code-Plugins.

- **Hinzufügen** neben der Überschrift akzeptiert GitHub-owner/repo, Git-URL oder lokalen Ordner. Bestätige im Dialog mit **Hinzufügen**.
- Der Papierkorb mit Bestätigung entfernt den Marktplatz und deinstalliert auch daraus bezogene Plugins.

## Frag einen Agenten

Diese Aktionen können Agenten mit deiner Kartenfreigabe übernehmen. Key-Werte geben sie niemals selbst in die Oberfläche ein. Stattdessen öffnen sie die sichere Eingabekarte für dich.

- „Welche Konten sind verbunden? Teste Notion und melde das Ergebnis.“
- „Finde und fasse ungelesene E-Mails meines Vermieters aus dieser Woche zusammen.“
- „Entwirf eine Antwort auf Annas letzte E-Mail: Ich kann mich Donnerstag treffen. Speichere sie als Entwurf.“
- „Speichere Anhänge der Rechnungen dieses Monats in diesem Ordner.“
- „Verbinde Context7 für Bibliotheksdokumentation.“
- „Deaktiviere Gmail für alle Sitzungen außer dieser.“
- „Zeige Notions Tools und deaktiviere die zum Löschen von Seiten.“
- „Stelle Gmails Versand- und Löschtools auf Vorher fragen und lasse den Rest aktiv.“
- „Füge für Claude Code und Codex den MCP-Server npx -y @modelcontextprotocol/server-memory hinzu und prüfe die Verbindung.“
- „Zeige die am häufigsten installierten Claude-Code-Plugins und installiere anschließend meine Auswahl.“
- „Melde dich bei Voltaro an und lade die Rechnungen dieses Jahres in diesen Ordner.“ Beim ersten Mal erscheint eine Anmeldekarte.
- „Pushe diesen Branch mit dem Token aus dem Tresor zu GitHub.“
