# Verbundene Apps, Keys und Tools

Verbinde E-Mail, Notion, GitHub, Stripe, lokale Ordner und andere Dienste einmal unter **Apps → Verbundene Apps**. Danach können alle Agenten und Apps damit arbeiten. API-Keys und Anmeldedaten liegen verschlüsselt im Tresor und werden verwendet, ohne dass Agenten die Werte sehen. Zusätzliche Tool-Server lassen sich für Claude Code und Codex einrichten, Plugins auch für Claude Code. So arbeiten Agenten mit deinen Konten und erhalten weitere Werkzeuge.

![Apps → Verbundene Apps: die Dienste, die du verbunden hast, der Marktplatz und deine Keys](images/connections.webp)

## Was Verbindungen, Keys und Tools sind

Agenten können mehr, wenn du ihnen Werkzeuge gibst. Dafür gibt es drei Stellen:

- **Verbundene Apps** ([Apps → Verbundene Apps](/apps/connected)): Dienste aus einem Marktplatz, einmal für alle Agenten verbunden: Claude Code, Codex, Custom und die Agenten, die ACP sprechen, und die Apps, die sie ausführen. Jedes verbundene Konto gibt den Agenten seine Werkzeuge.
- **Tresor** im Tab **Keys** derselben Seite: API-Keys, Tokens und Anmeldepasswörter. Ein API-Key erlaubt Programmen, einen Dienst über dein Konto zu verwenden. Agenten nutzen diese Daten für Aufrufe, Webseitenanmeldungen und Programme, sehen die Werte aber nicht.
- **MCP-Server und Plugins** unter [Einstellungen → MCP-Server](/settings?s=mcp) und [Einstellungen → Plugins](/settings?s=plugins): selbst eingerichtete Tool-Server für Claude Code, Codex oder Custom sowie Plugins mit Skills und Tools für alle Agenten; siehe [Plugins](/guide/plugins).

MCP, das Model Context Protocol, ist ein gemeinsamer Standard für Agentenwerkzeuge. Ein verbundenes Konto ist ein von Hydor für alle Agenten eingerichteter und angemeldeter MCP-Server. Unter Einstellungen → Agenten richtest du dagegen MCP-Server selbst per Befehl oder Adresse ein.

## Verbundene Apps öffnen

Öffne **Apps** in der Werkzeugleiste und wähle in der Spalte **Verbundene Apps** (auf einem Smartphone den Tab **Verbundene Apps**) oder gehe direkt zu [Apps → Verbundene Apps](/apps/connected). Frühere Links zum Einstellungsbereich Verbindungen führen ebenfalls hierher. Unter Erklärung und **Dienst verbinden** stehen drei Tabs:

- **Verbunden**: die Konten, die du verbunden hast, und wie es jedem geht. Die Zahl auf dem Tab zählt sie; auch **Verbundene Apps** in der Spalte (auf einem Smartphone sein Tab) zählt sie.
- **Marktplatz** enthält verfügbare Dienste.
- **Keys** öffnet den Tresor und zählt gespeicherte Keys.

Die Seite öffnet sich auf **Verbunden**, wenn du etwas verbunden hast, und auf **Marktplatz**, wenn nicht; jeder Tab hat eine eigene Adresse (`/apps/connected?tab=market`, `?tab=keys`). Auf einem Smartphone scrollen die Tabs seitlich, und Dialoge steigen vom unteren Bildschirmrand auf.

## Einen Dienst im Marktplatz finden

Öffne den [Marktplatz](/apps/connected?tab=market).

- Das Suchfeld („{0} Dienste durchsuchen: E-Mail, Notion, Rechnungen …“) sucht in Namen, Beschreibungen, Schlüsselwörtern und Kategorien. Jedes Wort, das du eintippst, muss passen.
- Die Kategorien, jeweils mit der Anzahl ihrer Dienste, zeigen sich eine nach der anderen: **Alle Dienste** (**Alle** als Chip), **Notizen und Dokumente**, **Aufgaben & Projekte**, **E-Mail, Chat und Besprechungen**, **Kalender und Terminplanung**, **Dateien und Speicher**, **Design & Medien**, **Entwicklertools**, **Cloud & Hosting**, **Datenbanken & Daten**, **Analyse und Überwachung**, **Vertrieb, Marketing und Support**, **Zahlungen und Finanzen**, **Websites und Shops**, **Suche und das Web**, **KI & Automatisierung**, **Reisen und Alltag** und **Auf diesem Computer**. Auf einem Computer sind sie eine Liste neben den Diensten; auf einem schmaleren Bildschirm sind es Chips unter dem Suchfeld, die seitlich scrollen.
- **Hervorgehoben**: eine Reihe größerer Karten für bekannte Dienste (Notion, Linear, GitHub, Figma, Stripe, Zapier …). Sie erscheint, solange du nicht gesucht oder eine Kategorie gewählt hast; auf einem Computer scrollen ihre Pfeile sie. Die Dienste folgen unter **Alle Dienste** (oder der gewählten Kategorie, oder **Gefunden**, wenn du suchst), mit ihrer Anzahl. Auf einem Smartphone sind sie die Zeilen einer Liste.

Jede Karte zeigt den Namen des Dienstes, was ein Agent damit tun kann und wie er sich verbindet:

- **Browser-Anmeldung**: Anmeldung beim Dienst im Browser.
- **API-Key**: einen vom Dienst bereitgestellten Key einfügen.
- **Keine Anmeldung**: keine Zugangsdaten erforderlich.
- **Läuft auf diesem Computer**: Hydor startet bei Bedarf ein lokales Programm.
- **Läuft hier mit einem Key**: lokales Programm mit deinem Key.
- **Adresse und App-Passwort**: deine E-Mail-Adresse und ein Passwort, das für Mailprogramme erstellt wurde (E-Mail).

Ein Häkchen bedeutet, dass die Serverantwort mit dem Katalogeintrag abgeglichen wurde. **Nicht geprüft** bedeutet, dass dieser Test noch fehlt. Bereits verbundene Dienste zeigen **Verbunden** oder **Erneut anmelden** statt **Verbinden**.

Beispiele:

- **Notizen, Aufgaben und Projekte**: Notion, Craft, Linear, Asana, Atlassian mit Jira und Confluence, ClickUp, monday.com, Todoist.
- **E-Mail, Chat und Kalender**: Email für gewöhnliche Postfächer mit App-Passwort, Gmail, Slack, Fireflies, Granola, Google Calendar, Calendly.
- **Dateien und Design**: Google Drive, Dropbox, Box, Figma, Canva, Miro, Gamma, Cloudinary.
- **Entwicklertools und Hosting**: GitHub, GitLab, Sentry, CircleCI, Postman, Cloudflare, Vercel, Netlify, Railway, Context7, DeepWiki.
- **Daten und Analyse**: Airtable, Supabase, Neon, PostgreSQL, MongoDB, SQLite, PostHog, Mixpanel, Amplitude, Datadog.
- **Geschäft**: Stripe, PayPal, Plaid, Square, HubSpot, Intercom, Attio, Klaviyo, Webflow, Wix, WordPress.com.
- **Suche und Web**: Exa, Perplexity, Tavily, Brave Search, Firecrawl, Wolfram und ein Playwright-Browser.
- **KI und Alltag**: Hugging Face, Zapier, AllTrails, Kiwi.com, trivago, Strava.
- **Auf diesem Computer**: Dateien auf diesem Computer (die Ordner, die du auswählst), Git, Uhrzeit und ein Memory-Graph.

Ohne Treffer erscheint **Kein passender Dienst**. Du kannst selbst einen ergänzen; siehe [Einen Dienst zum Marktplatz hinzufügen](/guide/connections#add-a-service-to-the-marketplace). Neue Dienste kommen mit App-Updates hinzu.

## Einen Dienst verbinden

1. Klicke auf die Karte des Dienstes. Ein Dialog zeigt, was er tut, seine Kategorie, wie er sich verbindet, und **Geprüft** mit einem Datum (oder **Adresse noch nicht überprüft**). **Website** und **Dokumente** führen zum Dienst. Ein Kasten zeigt, wo er läuft: die Adresse des Servers oder den Befehl, den er hier ausführt. Er sagt außerdem, dass jeder Agent die Werkzeuge des Dienstes unter seinem Kurznamen bekommt (die von Notion unter „notion“) und dass du ihn pro Sitzung ausschalten kannst.
2. Lies den Hinweis im gelben Kasten, falls es einen gibt. Er sagt, was du zuerst wissen solltest, etwa „Benötigt uv (uvx) auf diesem Computer.“, oder dass ein Dienst einen eigenen Anmelde-Client braucht.
3. Fülle die Felder aus und klicke auf **Verbinden** beziehungsweise **Bei … anmelden**.

Danach erscheint der Dienst unter **Verbunden** und wird im Hintergrund getestet. Die benötigten Angaben hängen vom Dienst ab.

### Dienste ohne Zugangsdaten

Klicke auf **Verbinden**. Manche fragen zuerst nach einer Einstellung. GitLab fragt nach seiner Adresse (gitlab.com, außer du betreibst ein eigenes). Dateien auf diesem Computer fragt nach den Ordnern, die es verwenden darf, als vollständige Pfade, einer pro Zeile; es kann nur innerhalb davon Dateien lesen und ändern. SQLite fragt nach der Datenbankdatei. Felder mit der Markierung **optional** können leer bleiben. **Abrufen** neben einem Feld führt zu der Stelle, wo du diesen Wert bekommst.

### Dienste mit einem Key

Online-Dienste zeigen ein **Key**-Feld und **Key erstellen** als Link zum Anbieter. Lokale Dienste fragen gegebenenfalls mehrere Werte wie Token oder Verbindungszeichenfolge ab. Füge sie ein und wähle **Verbinden**.

Der Key wird verschlüsselt im Tresor gespeichert. Danach sind nur seine letzten Zeichen sichtbar. GitHub verwendet zum Beispiel einen fein abgestuften persönlichen Zugriffstoken, der auf bestimmte Repositorys und Rechte begrenzt werden kann.

### Dienste mit Browseranmeldung

1. Klicke auf **Bei … anmelden**.
2. Auf einem Computer öffnet sich ein kleines Fenster. Auf einem Smartphone öffnet sich stattdessen die Anmeldeseite des Dienstes im selben Tab.
3. Melde dich an und erlaube den Zugriff. Hydor zeigt währenddessen „Wartet auf den Abschluss deiner Anmeldung…“.
4. Wenn du fertig bist, sagt eine Meldung, dass das Konto verbunden ist. Auf einem Smartphone kehrst du zu Apps → Verbundene Apps zurück.

Tokens bleiben verschlüsselt auf diesem Computer und werden automatisch erneuert. Agenten sehen sie nie. Schließe die Anmeldung innerhalb von 15 Minuten ab, sonst starte erneut. Verweigerter Zugriff wird entsprechend gemeldet.

Manche Dienste lassen dich nur über einen eigenen Anmelde-Client (eine OAuth-App) anmelden: Asana, Box, HubSpot, Slack und die Apps von Google zum Beispiel. Ihr Dialog öffnet **Deine eigene Client-ID (dieser Dienst benötigt eine)** mit dem, was zu tun ist. Andere Browser-Anmeldungen bieten dasselbe als **Eigene Client-ID verwenden (optional)** an, was sich auch von selbst öffnet, wenn sich zeigt, dass ein Dienst nicht zulässt, dass sich Apps selbst registrieren.

1. Erstelle den Client in den Entwicklereinstellungen des Dienstes.
2. Gib ihm die Adresse unter **Callback-Adresse für den Dienst** (sie hat eine Schaltfläche zum Kopieren).
3. Füge **Client-ID** und gegebenenfalls **Client-Secret** ein.
4. Klicke auf **Bei … anmelden**.

### Dienste auf diesem Computer

Diese starten hier für den Agenten jeder Sitzung ein Programm (mit npx oder uvx). Der erste Test kann etwas dauern, wenn das Programm erst heruntergeladen werden muss. Ein Key, den ein solcher Dienst braucht, kommt beim Start aus dem Tresor in seine Umgebung. Er erscheint nie in einer Befehlszeile, in der andere Programme ihn lesen könnten.

## Dein E-Mail-Konto verbinden

Mit Adresse und App-Passwort können Agenten E-Mails lesen, suchen, ordnen, entwerfen und senden. Unterstützt werden Gmail, iCloud Mail, Fastmail, Yahoo, AOL, GMX, WEB.DE, Zoho, Posteo, mailbox.org, Proton Mail über Bridge und viele Firmen- und Bildungskonten.

1. Öffne den [Marktplatz](/apps/connected?tab=market) und wähle **E-Mail** unter **E-Mail, Chat und Besprechungen** oder per Suche.
2. Gib deine **E-Mail-Adresse** ein. Hydor findet deine Mailserver von selbst. Für einen Anbieter, den es kennt, zeigt es, wie du dort ein App-Passwort erstellst, und **Anleitung zum Erstellen** öffnet die eigene Hilfeseite des Anbieters.
3. Erstelle ein App-Passwort (siehe unten) und füge es in **App-Passwort** ein.
4. Gib optional **Dein Name** für ausgehende Nachrichten an.
5. Klicke auf **Verbinden**. Hydor meldet sich zum Lesen und zum Senden an, bevor es etwas speichert. Schlägt das fehl, sagt es, warum: ein falsches Passwort oder ein falscher Benutzername, dass dein Anbieter ein App-Passwort statt deines üblichen will, oder dass ein Server nicht geantwortet hat.

Das App-Passwort liegt verschlüsselt im lokalen Tresor und bleibt für Agenten unsichtbar. Für weitere Konten öffne **E-Mail** erneut und wähle **Weiteres Konto hinzufügen**.

### Ein App-Passwort erstellen

Ein App-Passwort ist ein eigenes Passwort für Mailprogramme, das in den Sicherheitseinstellungen deines Kontos erstellt wird und anstelle des Passworts verwendet wird, mit dem du dich im Web anmeldest. Bei den meisten Anbietern musst du zuerst die Bestätigung in zwei Schritten einschalten.

- **Gmail**: Aktiviere die Bestätigung in zwei Schritten und öffne im Google-Konto **Sicherheit → App-Passwörter**. Firmen- und Bildungskonten benötigen eine Freigabe der Administration.
- **iCloud Mail**: account.apple.com → **Anmeldung und Sicherheit → Anwendungsspezifische Passwörter**.
- **Fastmail**: **Settings → Privacy & Security → Manage app passwords**.
- **Yahoo** und **AOL**: **Account Security → Generate app password**.
- **GMX**, **WEB.DE** und **Zoho**: Aktiviere zuerst IMAP in den Postfacheinstellungen.
- **Proton Mail**: Installiere und verbinde Proton Mail Bridge auf diesem Computer. Verwende das dort für deine Adresse angezeigte Passwort.

### Wenn Mailserver nicht gefunden werden

Bei unbekannten Anbietern liest Hydor öffentlich bereitgestellte Mailprogrammeinstellungen. Dafür wird Mozillas öffentliches Anbieterverzeichnis mit deiner Domain, niemals mit der vollständigen Adresse, abgefragt. Ohne Treffer werden imap. und smtp. vor deiner Domain versucht und bei der Anmeldung geprüft.

Schlägt das fehl, öffne **Server und Benutzername** und trage die Server für eingehende (IMAP) und ausgehende (SMTP) Mails, ihre Ports und ihre Sicherheit (**SSL/TLS** oder **STARTTLS**) so ein, wie die Hilfeseiten deines Anbieters sie angeben, und den Benutzernamen, wenn er nicht deine ganze Adresse ist. Eine Verbindung ohne Verschlüsselung ist nur zu diesem Computer erlaubt (eine Bridge wie Proton Mail Bridge).

### Outlook.com und Microsoft 365

Outlook.com, Hotmail, Live sowie Microsoft-365-Firmen- und Bildungskonten können so noch nicht verbunden werden. Microsoft hat App-Passwörter dafür abgeschaltet. Eine Microsoft-Anmeldung wird von Hydor noch nicht unterstützt. Der Dialog erklärt das bei entsprechenden Adressen.

### Deine E-Mail-Konten

Unter **Verbunden** listet Email deine Konten nach Adresse. **Testen** prüft ihre Anmeldung. **Konten** öffnet je Konto **Testen**, **Ändern** für App-Passwort, Name oder Server und **Entfernen**. Entfernen löscht nur das gespeicherte App-Passwort, nicht Postfachinhalte. Beim letzten Konto wird Email getrennt; **Trennen** entfernt alle Konten.

### Was Agenten mit E-Mails tun können

Tools stehen unter „email“ zur Verfügung. Bei mehreren Konten wählst du das gewünschte Konto über seine Adresse. Ohne Adressangabe wird das erste Konto verwendet.

- **list_folders**, **search_email** mit Filtern nach Absender, Empfänger, Betreff, Text, Datum, ungelesen, markiert und Anhängen, neueste zuerst, und **read_email** mit Beteiligten, Text und Anhangsnamen und -größen. Lesen markiert keine Nachricht als gelesen.
- **save_attachments** speichert die Anhänge einer E-Mail im Ordner der Sitzung.
- **mark_email** setzt gelesen, ungelesen und Markierungen. **move_email** verschiebt in andere Ordner, niemals in den Papierkorb.
- **save_draft** speichert einen Entwurf zum späteren manuellen Versand und sendet nichts.
- **send_email** sendet sofort eine neue Nachricht oder Thread-Antwort, optional mit Dateien aus dem Sitzungsordner, und speichert eine Kopie unter Gesendet.
- **delete_email** verschiebt Nachrichten in den Papierkorb oder löscht sie endgültig.

Zum Unterbinden von Versand und Löschen deaktiviere **send_email** und **delete_email** unter **Werkzeuge**; siehe [Konten oder einzelne Tools deaktivieren](/guide/connections#turn-an-account-or-some-of-its-tools-off). E-Mail-Inhalte sind externe Daten und dürfen nicht als Anweisungen befolgt werden. Für neue E-Mails lassen sich Aufgaben starten; siehe [Änderungen überwachen](/guide/tasks#watch-for-a-change).

## Eine Verbindung prüfen

Unter **Verbunden** zeigt jedes Konto seinen Zustand:

- **Funktioniert**, letzten Prüfzeitpunkt, aktivierte Tool-Anzahl wie „12 von 14 Tools aktiv“ und Anzahl mit vorheriger Freigabe.
- **Noch nicht getestet**.
- **Eine erneute Anmeldung ist erforderlich**, wenn die Anmeldung nicht erneuert werden konnte.
- **Funktioniert nicht** mit Begründung.

**Testen** verbindet sich mit dem Dienst so, wie es Agenten tun werden, und listet seine Werkzeuge auf. Eine Meldung sagt, dass das Konto funktioniert und wie viele Werkzeuge es hat, oder was schiefgegangen ist: „Der Key wurde abgelehnt“ oder „Die Anmeldung wurde abgelehnt: Verbinde erneut“ (das Konto zeigt dann **Eine erneute Anmeldung ist erforderlich**). Konten werden direkt nach dem Verbinden von selbst getestet.

## Konten oder einzelne Tools deaktivieren

- **Alle Sitzungen**, mobil nur der Schalter: Aktivierte Konten stehen allen Sitzungen zur Verfügung, sofern sie dort nicht deaktiviert sind. Deaktivierte Konten müssen pro Sitzung ausdrücklich aktiviert werden. Neue Konten sind zunächst aktiv.
- **Werkzeuge** erscheint nach dem ersten erfolgreichen Auflisten. Jedes Tool zeigt Beschreibung und **Aktiviert**, **Vorher fragen** oder **Deaktiviert**. Aktivierte Tools dürfen frei verwendet werden, bei Rückfragen wartet jeder Aufruf im Postausgang. Deaktivierte Tools erhalten Agenten nicht. Sendende, veröffentlichende, antwortende, einladende, teilende, löschende, zahlende, überweisende oder erstattende Tools sind als **Wirkt nach außen** markiert. Versucht ein Agent ein deaktiviertes Tool, erhält er den entsprechenden Hinweis.

## Vorher fragen: Aufrufe zur Freigabe

Ein Tool mit **Vorher fragen** wird niemals sofort ausgeführt. Hydor hält den Aufruf von Claude Code, Codex, Custom, anderen Agenten, geplanten Aufgaben oder Apps zurück. Der Agent erfährt sofort von der ausstehenden Freigabe und arbeitet weiter oder beendet den Durchlauf mit Hinweis. Er soll keinen anderen Weg versuchen. Der bearbeitbare Entwurf wartet oben im [Posteingang](/inbox) unter **Postausgang**, bis du **Senden** oder **Verwerfen** wählst; siehe [Der Postausgang](/guide/inbox#the-outbox-calls-held-for-your-ok).

- Neu verbundene Konten setzen nach außen wirkende Tools standardmäßig auf **Vorher fragen**, andere auf **Aktiviert**. Unter **Werkzeuge** kannst du das ändern.
- Frühere Konten behalten ihre Einstellungen, damit bestehende Abläufe funktionieren. Eine Aktion wie **Bei 3 Tools für Senden, Veröffentlichen, Löschen oder Bezahlen vorher fragen** stellt alle entsprechenden Tools gemeinsam um. Sie erscheint, solange solche Tools ohne ausdrückliche Auswahl aktiviert sind.
- „Vorher fragen“ ist deine eigene Einstellung für das Konto, es gilt also in jeder Sitzung und jedem Berechtigungsmodus, auch bei **Voller Zugriff**. Agenten können es nicht ändern, ohne dich auf einer Karte zu fragen, und können einen zurückgehaltenen Aufruf nicht selbst senden. Wo ein Agent auch vor der Nutzung des Werkzeugs fragen würde (die eigene Karte von Claude Code oder Custom), tut er es nicht: Du sagst einmal Ja, im Postausgang.
- Ob ein Werkzeug nach außen wirkt, wird an seinem Namen, seiner Beschreibung und den Hinweisen beurteilt, die sein Dienst gibt (etwa „liest nur“ oder „löscht“). Sieh dir die Markierungen an und stelle jedes andere Werkzeug selbst auf „Vorher fragen“.

Geplante Aufgaben kannst du mit **Ohne Versand testen** ohne externe Aktionen erproben; siehe [Geplante Aufgaben](/guide/tasks#try-a-task-with-a-test-run).

## Eine Verbindung ändern oder erneut anmelden

- **Ändern** öffnet bei Keys oder Einstellungen das Formular mit bisherigen Angaben. Gespeicherte Geheimnisse zeigen „Gespeichert: zum Beibehalten leer lassen“. Nur ein neuer Wert ersetzt sie. Bestätige mit **Speichern**.
- **Erneut anmelden** (bei Browser-Anmeldungen) meldet dich neu an. Wenn ein Konto **Eine erneute Anmeldung ist erforderlich** zeigt, bekommen Agenten es nicht mehr, bis du dich erneut anmeldest.

Ändert der Katalog Adresse oder Anmeldeverfahren eines Dienstes, bleibt das bestehende Konto beim alten Ziel. Die Karte erklärt, dass erst erneutes Verbinden die Änderung übernimmt. Keys und Tokens werden ohne deine erneute Verbindung nicht an eine neue Adresse gesendet.

## Ein Konto trennen

Klicke auf **Trennen**, mobil das Steckersymbol, und bestätige. Die lokal gespeicherte Anmeldung oder der Key wird entfernt und Agenten erhalten keine Tools mehr. Bei Browseranmeldungen widerruft Hydor Tokens zusätzlich beim Dienst, sofern dieser das unterstützt.

## Konten für eine einzelne Sitzung auswählen

Sitzungen erhalten standardmäßig alle Konten mit aktivem Schalter **Alle Sitzungen**. Für Ausnahmen:

1. Öffne das Menü der Sitzung (⋯) → **Sitzungseinstellungen** → **Verbundene Konten**.
2. Aktiviere oder deaktiviere einzelne Konten. Die Anzeige unterscheidet allgemeine Aktivierung, allgemeine Deaktivierung und nur hier geltende Ausnahmen.
3. Klicke auf **Fertig**.

Dienste im Internet übernehmen die Änderung sofort. Dienste, die auf diesem Computer laufen, übernehmen sie, wenn der Agent das nächste Mal startet. Wenn noch nichts verbunden ist, bietet der Dialog **Verbundene Apps öffnen** an.

Ein Agent kann auch Konten für die Sitzungen einschalten, die als er starten: siehe [Agenten](/guide/agents).

## Wie Agenten verbundene Konten verwenden

- Jede Art von Agent bekommt ein verbundenes Konto auf dieselbe Weise: Claude Code, Codex, Custom und die ACP-Agenten erhalten seine Tools unter dem Kurznamen des Dienstes.
- Zu Beginn einer Sitzung erfährt der Agent, welche deiner Konten verbunden sind, und dass er sie nutzen soll, wenn eine Aufgabe sie betrifft. Er kann auch auflisten, was verbunden ist und welche Keys gespeichert sind, jeweils nur mit Namen.
- Verfügbar sind nur aktivierte, angemeldete Konten. Tokens werden auch ohne aktive Verwendung im Hintergrund erneuert, damit lange Sitzungen funktionieren.
- Keys und Tokens gelangen weder in Agenteneinstellungen noch Befehlszeilen. Bekannte Werte werden in Tool-Antworten maskiert.
- Ein Tool mit „Vorher fragen“ sagt das in seiner Beschreibung, und der Agent erfährt, dass ein Aufruf darauf auf dein OK wartet. Sobald du den Aufruf sendest oder verwirfst, zeigt die Sitzung, was passiert ist, und der Agent erfährt es mit deiner nächsten Nachricht.
- Eine geplante Aufgabe kann starten, wenn in einem Konto etwas Neues auftaucht (ein neuer Deal, eine neue Datei, ein neues Ticket oder eine neue Zahlung), oder eine eingestellte Zeit vor jedem Termin in einem verbundenen Kalender. Bei jeder Prüfung ruft Hydor selbst und ohne Modell eines der Tools des Kontos auf, das nur liest, und niemals eines, das sendet, ändert, löscht oder bezahlt (siehe [Änderungen überwachen](/guide/tasks#watch-for-a-change)).
- Die Suche mit Strg+K beziehungsweise ⌘K findet auch verbundene Konten.

## Einen Dienst zum Marktplatz hinzufügen

Du kannst über einen Pull-Request im GitHub-Repository von Hydor Dienste ergänzen oder korrigieren. **So fügst du einen hinzu** unten im Marktplatz öffnet die Anleitung.

1. Schreibe eine kleine JSON-Datei für den Dienst in den Ordner `catalog/` des Repositorys, wie es die dortige Anleitung beschreibt. Sie enthält den Namen des Dienstes, einen einfachen Satz dazu, was ein Agent damit tun kann, seine Kategorie, sein Symbol und seine Farbe, Startseite und Dokumentation, seinen Server (eine Adresse oder einen Befehl, der hier läuft) und wie die Anmeldung funktioniert (keine, eine Anmeldung im Browser oder ein Key) sowie Felder, die Leute ausfüllen.
2. Verwende den offiziellen MCP-Server des Anbieters mit dokumentierter Adresse, sofern vorhanden. Lokale Programme sind sinnvoll, wenn kein solcher Server existiert oder lokale Funktionen wie Dateizugriff benötigt werden.
3. Trage keine Keys oder Tokens ein. Nutzer hinterlegen ihre eigenen im Tresor.
4. Führe die beschriebene Prüfung aus. Sie validiert die Datei und kann die Serverantwort prüfen.
5. Reiche den Pull-Request ein. Nach dem Merge erscheint der Dienst mit dem nächsten Update im Marktplatz.

## Keys im Tresor speichern

Öffne den [Tab Keys](/apps/connected?tab=keys). API-Keys, Tokens und Anmeldepasswörter liegen verschlüsselt auf diesem Computer. Weder hier noch für Agenten werden sie erneut angezeigt; sichtbar bleiben nur die letzten Zeichen.

Agenten verwenden sie über Hydors eigene Tools: sein Tool für Webanfragen, seinen Browser und Befehle auf diesem Computer, wo du das erlaubst. Die App fügt den Key selbst ein, und nur dort, wo du es erlaubst.

Jeder Key zeigt:

- Namen und maskierte Wertvorschau wie „…f3a9“;
- Notiz;
- die Hosts, an die er gesendet werden darf, und **in Befehlen**, wenn Befehle auf diesem Computer ihn verwenden dürfen (**Noch keine Hosts erlaubt**, wenn keins von beidem gilt);
- letzte Verwendung oder „Noch nicht verwendet“ sowie Erstellung und letzte Wertänderung.

Ohne Keys erklärt die Seite das Hinzufügen oder Anfragen durch Agenten.

Auch Apps können Wetter-, Karten- oder andere Keys benötigen. Du gibst sie auf der App-Seite, Installationskarte oder ihrer Karte in einer Sitzung ein; siehe [Benötigte Keys hinterlegen](/guide/apps#give-it-the-keys-it-needs). Sie liegen hier unter den von der App vorgegebenen Namen und Hosts. Die Notiz nennt die zugehörige App.

### Einen Key hinzufügen

1. Klicke auf **Key hinzufügen**.
2. **Name**: 2 bis 64 Großbuchstaben, Ziffern und Unterstriche, beginnend mit einem Buchstaben, etwa WEATHER_API_KEY. Eingaben werden entsprechend umgewandelt, „github token“ etwa in GITHUB_TOKEN, und das Feld zeigt das an.
3. **Wert**: Füge den Key ein. Nur eine Zeile ist erlaubt, außer bei Blöcken mit -----BEGIN wie Zertifikaten oder privaten Keys.
4. **Erlaubte Hosts**: bis zu 20 durch Kommas getrennte Adressen wie api.example.com. Der Key wird nur über HTTPS an diese Hosts und ihre Subdomains gesendet. Ohne Host ist keine Verwendung möglich.
5. **Befehle auf diesem Computer dürfen den Key verwenden** ist zunächst aus. Aktiviere es bei Bedarf für Datenbankpasswörter oder Git-Tokens; siehe [Befehle mit Keys](/guide/connections#commands-that-use-a-key).
6. **Notiz** erklärt den Zweck und ist für Agenten sichtbar.
7. **Übermittlung** (optional): Standardmäßig steht der Key im Authorization-Header, nach „Bearer “. Du kannst die **Kopfzeile** ändern (etwa X-Api-Key) und was **Vor dem Key** steht (nichts, bei anderen Headern) oder ihn stattdessen **Oder als Abfrageparameter** senden (etwa api_key).
8. Klicke auf **Speichern**.

Bereits vorhandene Namen werden abgelehnt. Ersetze stattdessen den Wert des bestehenden Keys.

### Den Wert eines Keys ersetzen

Klicke auf den runden Pfeil (**Neuer Wert**) neben dem Key, füge den neuen Wert in **Neuer Wert** ein und klicke auf **Ersetzen**. Die Hosts, die Notiz und die Übermittlung bleiben, wie sie waren.

### Erlaubte Ziele eines Keys ändern

Öffne über den Stift **Hosts, Notiz und Übermittlung** und ändere Hosts, Befehlsfreigabe, Notiz oder Übermittlungsart. **Speichern** übernimmt die Angaben, der Wert bleibt unverändert.

### Einen Key löschen

Klicke auf den Papierkorb **Löschen** und bestätige. Der Wert wird endgültig entfernt und kann von Agenten nicht mehr verwendet werden. Die Rückfrage nennt vorher die Apps, die ihn verwenden, und die Web-Apps, die unter diesem Namen einen eigenen Wert haben (der bleibt).

### Wie Agenten einen Key verwenden dürfen

- Einen Dienst mit ihm über seinen Namen aufrufen. Die App fügt den Key in die Anfrage ein: dort, wo er dafür eingerichtet ist, oder dort, wo der Agent seinen Namen in doppelten geschweiften Klammern schreibt (etwa {{GITHUB_TOKEN}}), in der Adresse, in einem Header oder im Inhalt, oder als Benutzername und Passwort einer Basic-Anmeldung.
- Ihn über seinen Namen in die Anmeldeseite einer Website in ihrem Browser eintippen: nur in ein einzeiliges Feld, auf einer Seite eines der Hosts des Keys, über https (oder auf diesem Computer). Das Feld zeigt dann Punkte, und der Agent sieht nur, dass es aus dem Tresor befüllt wurde.
- Ihn einem Befehl auf diesem Computer geben, wenn du **Befehle auf diesem Computer dürfen den Key verwenden** eingeschaltet hast, und nur, sobald du den Befehl erlaubst (siehe [Befehle mit Keys](/guide/connections#commands-that-use-a-key)).
- Im Web ausschließlich erlaubte Hosts und Subdomains über HTTPS erreichen, niemals lokale Computer oder Netzwerke. Weiterleitungen zu unerlaubten Hosts werden nicht verfolgt.
- Für einen einzelnen Aufruf Header oder URL-Parameter abweichend wählen.
- Die Namen, Hosts und Notizen der Keys sehen. Niemals ihre Werte: Antworten, Seiten und das, was Befehle ausgeben, kommen mit maskiertem Key zurück.

## Wenn ein Agent nach einem Key fragt

Agenten sind angewiesen, dich nie zu bitten, ein Passwort, einen Token oder einen Key in den Chat zu tippen. Braucht eine Aufgabe einen Key, der nicht gespeichert ist, zeigt der Agent stattdessen eine Karte in der Unterhaltung: **Der Agent fragt nach einem Key**, mit dem Namen des Keys und dem Grund, warum er ihn braucht (oft auch, wo du ihn bekommst).

1. Füge den Wert in das Feld ein.
2. Prüfe die vorgeschlagenen Hosts unter **Nur senden an** und ändere sie bei Bedarf. Ohne Host ist keine Nutzung möglich.
3. Klicke auf **Im Tresor speichern**.

Der Key gelangt direkt in den verschlüsselten Tresor, nicht in die Unterhaltung. Die Karte bestätigt die Speicherung. Der Agent erfährt nur, dass der Key nun vorhanden ist, und kann weiterarbeiten.

- **Nicht jetzt** lehnt ab. Der Agent erfährt, dass du ihn lieber jetzt nicht gibst, und soll ohne ihn weitermachen oder sagen, was sonst funktionieren würde. Die Karte sagt dann, dass du ihn nicht gegeben hast, mit **Doch eingeben**, falls du es dir anders überlegst.
- Solange eine Karte wartet, erscheint sie auch im [Posteingang](/guide/inbox) als „Fragt nach einem Key“ mit dem Namen des Keys. **Öffnen** bringt dich zur Sitzung.
- Ist ein Key mit diesem Namen schon im Tresor, soll der Agent ihn verwenden, und die Karte sagt nur, dass er im Tresor ist. Wenn ein gespeicherter Key nicht mehr funktioniert, kann der Agent noch einmal fragen: Das Feld sagt dann, dass es den gespeicherten Key ersetzt.
- Braucht der Agent den Key in Befehlen auf diesem Computer, hat die Karte auch **Befehle auf diesem Computer dürfen den Key verwenden**, zunächst eingeschaltet. Schalte es aus, wenn du das nicht möchtest; der Agent kann den Key trotzdem auf seinen Hosts verwenden. Bei einem Key, der schon gespeichert ist, heißt die Karte **Der Agent möchte einen Key in Befehlen verwenden**: Lass das Feld leer, um den Wert zu behalten, und klicke auf **Im Tresor speichern**.

### Eine Anmeldung mit mehreren Feldern

Bei Webseiten- oder Dienstanmeldungen fragt **Der Agent bittet um Anmeldedaten** alle nötigen Angaben gemeinsam ab, etwa E-Mail und Passwort oder Datenbankadresse, Benutzer und Passwort. Geheimnisse sind verdeckt; das Augensymbol zeigt sie an.

1. Fülle die Felder aus. Eines, das mit **optional** markiert ist, darf leer bleiben.
2. Prüfe die erlaubten Hosts unter **Nur senden an**.
3. Klicke auf **Im Tresor speichern**.

Jedes Geheimnis kommt als eigener Key in den Tresor, benannt nach der Anmeldung (aus einem Voltaro-Passwort wird VOLTARO_PASSWORD). Ein Feld mit der Markierung **Diese Angabe ist für den Agenten sichtbar** ist eine Angabe, die nicht geheim ist, etwa die Adresse eines Servers: Der Agent bekommt, was du dort eintippst, und es wird nicht im Tresor aufbewahrt. Ein Feld, das der Tresor schon hat, sagt das: Lass es leer, um zu behalten, was gespeichert ist. Nach dem Speichern listet die Karte die Keys auf, und der Agent kann sich damit in seinem Browser anmelden, nur auf diesen Hosts und ohne sie zu sehen.

### Mehrere Keys auf einer Karte, mit Anleitung

Braucht eine Aufgabe mehr als einen Key, oder kann der Agent sagen, wie du einen bekommst, legt er alles auf eine Karte: für jeden einen Tab (auf dem Telefon eine Zeile zum Aufklappen). Jeder sagt, wer den Key ausgibt und wofür er gebraucht wird, führt unter **How to get it** kurze nummerierte Schritte auf, verlinkt die Seite des Anbieters (sie öffnet in einem neuen Tab) und hat seine Felder.

1. Folge den Schritten und füge jeden Wert in sein Feld ein. Er ist beim Tippen verdeckt; das Auge zeigt ihn. Die Zeile unter einem Feld sagt, wie ein richtiger Wert aussieht, und warnt, wenn das Eingefügte offensichtlich keiner ist (sie hält dich nie auf).
2. Klicke auf diesem Tab auf **Speichern**, oder auf **Vorerst überspringen**, wo es angeboten wird.
3. Weiter zum nächsten. Die Zeichen an den Tabs sagen, was gespeichert, übersprungen oder noch offen ist, und in der Ecke steht, wie viele.

- Ein Key, den der Tresor schon hat, wird nie angezeigt: Wähle **Use the one saved on** (mit dem Datum) oder **Ersetzen**.
- Der Agent erfährt davon, sobald jeder nötige Key gespeichert ist, oder wenn du auf **Close without the rest** klickst: für jeden gespeichert, übersprungen oder offen, und nichts vom Wert. Auch einen optionalen, den du danach ergänzt, erfährt er.
- Für eine App, die in Hydor läuft, nehmen Zahlungen nur einen Test-Key (er beginnt mit sk_test_): Ein Live-Key wird dort abgelehnt.
- Bei einer Web-App warnt die Karte vor einem Einfügen, das klar etwas anderes ist (ein veröffentlichbarer Key, wo der geheime hingehört).
- Ein Feld mit der Markierung **Diese Angabe ist für den Agenten sichtbar** bekommt der Agent so, wie du es eintippst, wie auf der Karte einer Anmeldung.

## Befehle mit Keys

Manche Aufgaben brauchen ein Passwort oder einen Token in einem Programm auf diesem Computer: mit einem Token zu GitHub pushen, mit seinem Passwort eine Datenbank lesen, ein Skript, das einen Dienst aufruft. Dafür haben Agenten ein Tool, das einen Befehl ausführt, bei dem Keys aus dem Tresor in seiner Umgebung stehen, jeweils unter ihrem eigenen Namen. Was der Befehl ausgibt, kommt mit maskierten Keys zum Agenten zurück.

- Nur Keys mit aktivem **Befehle auf diesem Computer dürfen den Key verwenden** werden übergeben. Das stellst du im Stiftdialog oder bei der Anfrage ein.
- Vor der Ausführung zeigt **Befehl ausführen mit …** die Key-Namen, den Befehl und seinen Zweck. **Erlauben** gilt einmal. **Für diese Sitzung erlauben** erlaubt spätere Befehle derselben Sitzung mit denselben Keys bis zum App-Neustart. **Nicht ausführen** lehnt ab; du kannst eine Alternative nennen.
- Eine Sitzung mit Vollzugriff führt diese Befehle ohne Nachfrage aus, wie ihre anderen Befehle auch. Im Planmodus läuft keiner.
- Programme können grundsätzlich alles tun, auch Keys an andere Orte senden. Erlaube deshalb nur verstandene Befehle und nur bei tatsächlich benötigten Keys.
- Standardmäßig endet ein Befehl nach zwei Minuten; der Agent kann bis zu zehn Minuten anfordern.

## Ein Formular eines Dienstes ausfüllen

Manche Dienste brauchen mitten in einer Aufgabe etwas von dir: ein Datum, eine Auswahl, ein Ja oder Nein oder eine Seite, die du öffnen sollst. Egal, welcher Agent arbeitet: Die Anfrage erscheint als Karte in der Sitzung, neben den Genehmigungen des Agenten, und im [Posteingang](/guide/inbox). Der Titel der Karte sagt, was der Dienst will:

- **… bittet dich, ein Formular auszufüllen**: die Nachricht des Dienstes, dann seine Felder als Formular. Es gibt Textfelder, längere Texte, Zahlen, Daten, einen Schalter für Ja oder Nein sowie Chips oder eine Liste zum Auswählen (bei Chips kannst du mehrere wählen, wenn der Dienst mehr als einen erlaubt). Klicke auf **Senden**. Leere Felder, die er braucht („Benötigt“), und Zahlen, die keine Zahlen sind, werden markiert, bevor etwas abgeschickt wird. Eine Antwort, die der Dienst nicht annehmen kann (zu lang, keine E-Mail-Adresse, zu wenige ausgewählt), wird mit einem Hinweis, was zu korrigieren ist, abgelehnt, und die Karte bleibt.
- **… bittet dich, eine Seite zu öffnen** zeigt einen Link. **Öffnen** startet einen neuen Tab etwa zur Anmeldung oder Freigabe und meldet das dem Dienst.
- **… bittet um Zustimmung** ist eine Ja-Nein-Frage. **Erlauben** bestätigt.

**Ablehnen** sagt nein, **Nicht jetzt** bricht diesen Versuch ab. Karten warten bis zu einer Stunde; endet der Agentendurchlauf vorher, wird die Anfrage abgebrochen. Auch für Codex eingerichtete MCP-Server verwenden solche Karten.

## MCP-Server für Claude Code, Codex und Custom einrichten

Unter [Einstellungen → Agenten → MCP-Server](/settings?s=mcp) verwaltest du Tool-Server, die du selbst einrichtest, etwa eigene Server oder Tools außerhalb des Marktplatzes. Die von Claude Code und Codex stehen in deren eigenen Einstellungen; die von Custom speichert Hydor, sodass du sie auch ohne eines der beiden Programme hinzufügen kannst. Custom, der eigene Agent der App, verwendet sie alle; siehe [Custom](/guide/custom). Neue Sitzungen laden sie; laufende übernehmen Änderungen beim Neustart.

Die Seite listet die Server in drei Gruppen, **Claude Code**, **Codex** und **Custom**, und **Server hinzufügen** steht neben dem Titel der Seite. Eine Gruppe für Claude Code oder Codex, die nicht eingerichtet sind und keine Server haben, fehlt. Der **Ordner**-Chip oben wählt den Ordner, dessen Server du siehst, denn Claude Code kann Server für einen Ordner ebenso wie für alle Ordner speichern. Das (i) neben dem Namen jeder Gruppe sagt, wann Änderungen wirksam werden.

Jeder Server zeigt:

- seinen Namen und seinen Typ: **Befehl** (ein Programm, das dieser Computer ausführt) oder **HTTP** oder **SSE** (ein Server unter einer Adresse; SSE ist die ältere Art);
- bei Claude Code den Geltungsbereich: **Alle Ordner**, **Dieser Ordner, nur für dich** oder **Dieser Ordner, geteilt**;
- **Aus** bei einem Codex-Server, der in den eigenen Einstellungen von Codex ausgeschaltet ist;
- in der Gruppe **Custom** **Von Claude Code**, **Von Codex** oder **Aus .mcp.json** bei einem Server, den Custom von dort liest, und **Angemeldet** oder **Erneut anmelden** bei einem, der sich im Browser anmeldet;
- Befehl oder Adresse und die Namen von Umgebungsvariablen, Headern oder Bearer-Token-Variablen. Werte bleiben auf dem Server verborgen;
- nach einer Prüfung, wie es dem Server geht (ein Abzeichen am Ende seiner Zeile).

### Einen Server hinzufügen

Klicke auf [Server hinzufügen](/settings?s=mcp&find=Add%20server). Der Dialog **MCP-Server hinzufügen** fragt:

- **Hinzufügen zu**: Claude Code, Codex, Custom oder mehrere davon. Anfangs sind es Claude Code und Codex, wo sie eingerichtet sind, sonst Custom. Ein nicht eingerichtetes Programm lässt sich nicht wählen, und der Dialog sagt, warum. Custom verwendet auch die Server von Claude Code und Codex; füge also für Custom einen Server hinzu, den nur Custom haben soll, oder wenn du keines der beiden Programme hast.
- **Name**: bis zu 64 Buchstaben, Ziffern, Punkte, Bindestriche oder Unterstriche, beginnend mit Buchstabe oder Ziffer. Tool-Namen bestehen daraus, einem Schrägstrich und dem Tool-Namen.
- **Typ**: **Befehl**, **HTTP** oder **SSE**. Codex unterstützt SSE nicht, deshalb schließt die Wahl von SSE Codex aus.
- Für Befehle:
  - **Befehl** als vollständige Zeile, etwa `npx -y @modelcontextprotocol/server-github`. Er startet beim Sitzungsbeginn auf diesem Computer. Argumente mit Leerzeichen benötigen Anführungszeichen. ~ am Argumentanfang steht für deinen persönlichen Ordner.
  - **Umgebung** mit einer KEY=value-Zeile pro Variable. Zeilen mit # werden ignoriert. Werte werden in den Agentenkonfigurationen gespeichert (bei Custom in einer Datei, die Hydor auf diesem Computer führt) und hier nicht erneut angezeigt.
- Für HTTP und SSE:
  - **URL**: die Adresse des Servers, beginnend mit http:// oder https://.
  - **Header** (für Claude Code und Custom): eine Zeile „Name: Wert“ pro Header, für Server, die einen API-Key annehmen. Server, die eine Anmeldung im Browser (OAuth) nutzen, brauchen keine: Melde dich nach dem Hinzufügen in der Liste an.
  - **Bearer-Token-Variable** (für Codex, optional): der Name einer Umgebungsvariablen, deren Wert Codex als Bearer-Token sendet.
- **Wo Claude Code es verwendet**, bei alleiniger Claude-Code-Auswahl **Geltungsbereich**:
  - **Alle Ordner**, der Standard, gilt für alle Sitzungen dieses Computers.
  - **Dieser Ordner** gilt nur im oben gewählten Ordner und liegt in deinen persönlichen Claude-Code-Einstellungen.
  - **Geteilte .mcp.json**: wird in einer .mcp.json-Datei in diesem Ordner gespeichert, damit alle, die im Repository arbeiten, ihn bekommen.

  Server von Codex und Custom gelten immer für alle Ordner.

Klicke im Dialog auf **Server hinzufügen**. Hydor fügt ihn bei Claude Code und Codex über den eigenen Befehl jedes Programms hinzu, damit deren Einstellungen so bleiben, wie sie sie erwarten, und speichert den von Custom selbst. Lehnt ein Agent ab, zeigt der Dialog, dass er den Server nicht hinzugefügt hat, mit dem, was der Agent gesagt hat. Behebe, was nicht stimmt, und klicke noch einmal auf **Server hinzufügen**: Es werden nur die Agenten erneut versucht, bei denen es fehlgeschlagen ist. Ein Server, der so heißt wie einer, den Custom schon aus Claude Code oder Codex liest, ersetzt diesen für Custom.

Um einen Server von Custom zu ändern, öffne sein Menü **⋯** und wähle **Bearbeiten**. Variablen und Header stehen mit leeren Werten da: Lass einen Wert leer, um den gespeicherten zu behalten, oder lösche seine Zeile, um ihn zu entfernen. Wenn du den Befehl oder die Website der Adresse änderst, gib die Werte neu ein.

### Serververbindungen prüfen

[Verbindungen prüfen](/settings?s=mcp&find=Check%20connections) am Ende des Titels einer Gruppe startet jeden Server so, wie es eine neue Sitzung täte, und zeigt, wie es jeweils ausgegangen ist. In der Gruppe **Custom** wird alles geprüft, was Custom lädt; deshalb stehen dort nach einer Prüfung auch die Server, die es aus Claude Code, Codex und der .mcp.json des Ordners liest:

- **Verbunden** mit Tool-Anzahl;
- **Anmeldung erforderlich**; bei Custom ein Server, der eine Anmeldung im Browser (OAuth) verlangt;
- **Erneut anmelden**, bei Custom, wenn eine Anmeldung endete und nicht erneuert werden konnte;
- **Verbindung wird hergestellt**;
- **Fehlgeschlagen** mit Grund oder Hinweis auf fehlenden Start beziehungsweise fehlende Antwort;
- **Deaktiviert**.

Dafür wird kein Modell verwendet. Die Prüfung dauert gegebenenfalls ein bis zwei Minuten. Bei Claude Code zählt der oben ausgewählte Ordner einschließlich seiner eigenen Server.

### Bei einem Server anmelden

Ein Server unter einer Adresse, der sich mit OAuth anmeldet, braucht einmalig eine Anmeldung.

Bei **Claude Code** und **Codex** klicke auf **Anmelden** (zu sehen, wenn eine Prüfung sagt, dass eine Anmeldung nötig ist), oder öffne das Menü **⋯** des Servers und wähle **Im Terminal anmelden (OAuth)**. In der App öffnet sich ein Terminal, in dem die eigene Anmeldung des Programms für diesen Server läuft: Folge dort seinen Schritten.

Bei **Custom** (HTTP-Server, eigene und aus den Programmen gelesene) klicke auf **Anmelden** und dann im Dialog noch einmal auf **Anmelden**: Du meldest dich auf der Seite des Dienstes an, in einem kleinen Fenster (ein Telefon bleibt in seinem Tab), so wie bei [verbundenen Konten](#services-you-sign-in-to-in-the-browser). Bei den meisten Servern kann sich Hydor selbst registrieren; wenn nicht, fragt der Dialog nach einer Client-ID, die du in den Entwicklereinstellungen des Dienstes anlegst, und zeigt die Callback-Adresse, die du dort angibst. Die Tokens liegen verschlüsselt im Tresor, werden nur an diesen Server geschickt und erneuern sich von selbst, sodass Custom sie nie sieht. **Erneut anmelden** erscheint nur, wenn das Erneuern fehlschlägt. **Abmelden** im Menü **⋯** vergisst die Anmeldung.

### Einen Server entfernen

Öffne das Menü **⋯** des Servers, wähle **Entfernen** und bestätige mit **Entfernen**. Der Agent lädt ihn dann nicht mehr. Bereits laufende Sitzungen behalten ihn, bis sie neu starten. Entfernst du einen Server von Custom, wird auch seine Anmeldung vergessen, wenn kein anderer Server diese Adresse nutzt.

## Plugins zu Claude Code hinzufügen

Claude Code hat eigene Plugins mit Skills, Befehlen, Agenten, Hooks und MCP-Servern aus Marktplatzkatalogen in GitHub-, Git-Repositorys oder Ordnern. Diese gelten nur für Claude Code und stehen im Tab **Claude Code** unter [Einstellungen → Agenten → Plugins](/settings?s=plugins&find=Claude%20Code). Codex-Plugins stehen im Tab **Codex**, gemeinsame Plugins unter **Alle Agenten**; siehe [Plugins](/guide/plugins).

### Installierte Plugins

**Installiert** listet die Plugins von Claude Code auf diesem Computer. Neue Claude-Code-Sitzungen laden sie. Jedes zeigt seinen Namen, seinen Marktplatz, seine Version und was es tut.

- Der Schalter aktiviert oder deaktiviert ohne Entfernung.
- **Deinstallieren** im Menü **⋯** fragt nach. Neue Sitzungen laden danach keine zugehörigen Skills, Befehle oder Server mehr.

### Ein Plugin finden und installieren

**Entdecken** listet Marktplatz-Plugins nach Installationshäufigkeit mit Anzahl. **Plugins durchsuchen** grenzt ein. Zunächst werden 40 Einträge gezeigt; **Mehr anzeigen** ergänzt jeweils 40.

**Installieren** mit Bestätigung richtet das Plugin für alle Claude-Code-Sitzungen ein. Plugins können Hooks und Server mit lokaler Befehlsausführung hinzufügen. Installiere nur vertrauenswürdige Plugins.

Hydor fragt die Plugin-Liste höchstens alle zehn Minuten und nach Änderungen erneut bei Claude Code ab. Die erste Abfrage kann dauern.

### Plugin-Marktplätze

**Marktplätze** listet die Kataloge, aus denen Claude Code Plugins installiert.

- **Hinzufügen** neben der Überschrift akzeptiert GitHub-owner/repo, Git-URL oder lokalen Ordner. Bestätige im Dialog mit **Hinzufügen**.
- Der Papierkorb mit Bestätigung entfernt den Marktplatz und deinstalliert auch daraus bezogene Plugins.

## Frag einen Agenten

Diese Aktionen können Agenten mit deiner Kartenfreigabe übernehmen. Key-Werte geben sie niemals selbst in die Oberfläche ein. Stattdessen öffnen sie die sichere Eingabekarte für dich.

- „Welche Konten sind verbunden? Teste Notion und melde das Ergebnis.“
- „Finde und fasse ungelesene E-Mails meines Vermieters aus dieser Woche zusammen.“
- „Entwirf eine Antwort auf Annas letzte E-Mail: Ich kann mich Donnerstag treffen. Speichere sie als Entwurf.“
- „Speichere Anhänge der Rechnungen dieses Monats in diesem Ordner.“
- „Verbinde Context7 für Bibliotheksdokumentation.“
- „Schalte Gmail für jede Sitzung aus, aber lass es in dieser an.“
- „Zeige Notions Tools und deaktiviere die zum Löschen von Seiten.“
- „Stelle Gmails Versand- und Löschtools auf Vorher fragen und lasse den Rest aktiv.“
- „Füge für Claude Code und Codex den MCP-Server npx -y @modelcontextprotocol/server-memory hinzu und prüfe die Verbindung.“
- „Füge Custom den HTTP-MCP-Server unter https://mcp.example.com/mcp hinzu und sag mir, wann ich auf Anmelden drücken muss.“
- „Zeige die am häufigsten installierten Claude-Code-Plugins und installiere anschließend meine Auswahl.“
- „Melde dich bei Voltaro an und lade die Rechnungen dieses Jahres in diesen Ordner.“ Beim ersten Mal erscheint eine Anmeldekarte.
- „Pushe diesen Branch mit dem Token aus dem Tresor zu GitHub.“
- „Frag mich nach den Keys, die mein Shop braucht, alle auf einer Karte, und sag mir, wie ich jeden bekomme.“
