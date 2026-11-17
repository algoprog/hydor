# Smartphones, weitere Computer und Teilen

Hydor funktioniert in jedem Browser: auf deinem Smartphone, auf anderen Computern und über mehrere Computer mit eigener Hydor-Installation hinweg. Hier erfährst du, wie du die App mobil mit wenigen Klicks privat über Tailscale einrichtest und sicher von außen erreichst, zwischen Computern wechselst, Sitzungen schreibgeschützt teilst, externe Agenten verbindest und GitHub- oder Gitea-Konten für Pull-Requests hinzufügst.

![Die App auf einem Smartphone: eine Sitzung mit Rückfrage](images/devices.webp)

## Die App auf dem Smartphone verwenden

Auf dem Smartphone nutzt du dieselbe App wie am Computer, angepasst an den kleinen Bildschirm. Auch ein schmales Desktopfenster erhält diese Ansicht:

- **Die Seitenleiste wird zum aufklappbaren Menü.** Tippe oben links auf **Menü** (≡). Die bildschirmfüllende Liste zeigt Sitzungen, Posteingang und Werkzeuge. Tippe auf einen Eintrag oder gehe über **Menü schließen** (✕) zurück.
- **Auswahlfenster öffnen sich von unten.** Auf der Startseite fahren die Menüs für das Programm, das Modell, den Ordner, den Agenten und **Optionen** vom unteren Bildschirmrand hoch, oberhalb der Tastatur, mit abgedunkelter Seite dahinter; eine Einstellung unter **Optionen** öffnet sich über ihrem Fenster. In einer Sitzung öffnet der Chip des Nachrichtenfelds für das Modell (und seinen Aufwand und die Berechtigungen) auf dieselbe Weise ein Auswahlfenster. Auch Dialoge fahren von unten hoch.
- **Ein Bereich nach dem anderen.** Einstellungen zeigen zunächst eine Liste und öffnen jeden Abschnitt auf einer eigenen Seite. Dateien zeigt einen Ordner mit Namen oben. Antippen öffnet die Ortsauswahl, **‹** den übergeordneten Ordner. Dateien öffnen sich separat mit **Zurück**. Die Git-Seite zeigt zunächst Repositorys und danach das gewählte Repository mit Zurück-Pfeil.
- **Berühren statt Mausbedienung.** In Dateien öffnet ⋯ das Zeilenmenü. Langes Drücken markiert Einträge für gemeinsame Aktionen. Der Editor bricht lange Zeilen um. Das Terminal ergänzt Tasten wie Strg, Alt, Esc, Tab und Pfeile.

Damit dein Smartphone zugreifen kann, muss die App außerhalb ihres Computers erreichbar sein. [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone) richtet das mit wenigen Klicks privat über Tailscale ein; siehe [Mit Tailscale auf dem Smartphone nutzen](/guide/devices#use-it-on-your-phone-with-tailscale).

### Zum Startbildschirm hinzufügen

Auf dem Home-Bildschirm installiert, öffnet sich die App im Vollbild mit ihrem eigenen Symbol, wie jede andere App. Dafür muss die App über HTTPS bereitgestellt werden, wie bei „Auf dem Handy nutzen“. Auf dem Handy geöffnet zeigt [Auf dem Handy nutzen](/settings?s=phone&find=Add%20to%20Home%20Screen) die Schritte für das Handy in deiner Hand unter **Auf diesem Handy → Zum Home-Bildschirm hinzufügen**, mit einer Schaltfläche **Installieren**, wo der Browser eine anbietet.

- **iPhone oder iPad**: Öffne die App im Browser, tippe auf **Teilen** und dann auf **Zum Home-Bildschirm hinzufügen**. Öffne Hydor von da an über sein neues Symbol.
- **Android**: Öffne die App in deinem Browser und nutze im Menü die Option, die App zu installieren oder zum Startbildschirm hinzuzufügen.

### Inhalte anderer Apps an Hydor teilen

Installiert, erscheint Hydor im Teilen-Menü deines Handys oder Computers, wie es eine Messaging-App tut. Teile ein Foto, ein PDF, eine Webseite oder ein paar Zeilen Text aus einer beliebigen anderen App, wähle **Hydor**, und die Startseite öffnet sich mit dem, was du geteilt hast, schon im Nachrichtenfeld: die Wörter und der Link als Text, die Dateien als Anhänge. Schreibe ein Wort dazu, was damit geschehen soll, wähle auf Wunsch den Agenten und sende ab.

- **Android**: funktioniert in Chrome, Edge und anderen Browsern auf Basis von Chromium, sobald die App über das Menü des Browsers installiert ist (**App installieren** oder **Zum Home-Bildschirm hinzufügen**).
- **Computer**: funktioniert in Chrome und Edge nach Installation über die Adressleiste oder **Hydor installieren** im Browsermenü, sofern die Quell-App das systemweite Teilen-Menü verwendet.
- **iPhone und iPad**: Safari erlaubt Web-Apps keine Empfangsfunktion im Teilen-Menü. Fotos und Dateien kannst du stattdessen über eine Chat-App senden; siehe [Was ein Chat kann](/guide/devices#what-a-chat-can-do). Für Text und Links kannst du einen Kurzbefehl anlegen: im Teilen-Menü anzeigen lassen, Text und URLs akzeptieren, die Eingabe mit **URL codieren** umwandeln und über **URLs öffnen** an deine App-Adresse mit `/?prompt=` anhängen, etwa `https://hydor.example.com/?prompt=` plus codiertem Text. Safari öffnet die Startseite mit dem vorausgefüllten Nachrichtenfeld.

Du musst auf dem Gerät angemeldet sein. Bei abgemeldeter Sitzung geht der geteilte Inhalt verloren; die Startseite weist darauf hin. Dateien dürfen zusammen wie im Nachrichtenfeld bis zu 25 MB groß sein und werden am selben Ort wie gewöhnliche Anhänge gespeichert.

### Benachrichtigungen auf dem Smartphone erhalten

Benachrichtigungen informieren dich bei Abschluss, Fehlern und Rückfragen, auch bei geschlossener App.

1. Öffne auf dem Smartphone [Einstellungen → App → Benachrichtigungen](/settings?s=notifications&find=Notify%20this%20device).
2. Aktiviere **Dieses Gerät benachrichtigen** und erlaube die Browseranfrage. Jedes Gerät wird separat eingerichtet.
3. Prüfe den Empfang mit **Testbenachrichtigung senden**. Die Nachricht erscheint, wenn die App nicht sichtbar ist.

Auf dem Smartphone zeigt [Auf dem Smartphone nutzen](/settings?s=phone) unter **Auf diesem Handy** nach **Zum Home-Bildschirm hinzufügen** denselben Schalter **Dieses Gerät benachrichtigen**. **Testbenachrichtigung senden** sendet dort nur an dieses Smartphone.

Auf iPhone und iPad musst du die App zuerst zum Home-Bildschirm hinzufügen und von dort öffnen. Blockierte Website-Mitteilungen erlaubst du zuerst in den Browsereinstellungen. Einfache Ja-Nein-Freigaben bieten direkt in unterstützten Benachrichtigungen **Genehmigen** und **Ablehnen**. Mehr unter [Posteingang und Benachrichtigungen](/guide/inbox).

## Mit Agenten über Telegram, Discord und Slack sprechen

In Telegram-, Discord- und Slack-Chats kannst du Sitzungen auch mit eigenen Agenten starten, Fotos, Dateien und Sprachnachrichten senden, Antworten lesen und Rückfragen beantworten. Jeder Dienst nutzt einen von dir eingerichteten Bot oder eine eigene App unter [Einstellungen → App → Chat-Apps](/settings?s=chat). Hydor baut die Verbindung nach außen auf: durch Telegram-Abfragen sowie WebSockets zum Discord-Gateway und Slack Socket Mode. Eine öffentliche Internetadresse für Hydor ist deshalb nicht erforderlich.

### Einen Bot oder eine App verbinden

Öffne [Chat-Apps](/settings?s=chat) und wähle in der Gruppe **Bots** einen Dienst. Bis zur Verbindung steht dort **Einrichten**. Darunter erscheinen die Schritte. Eingefügte Zugangsdaten werden verschlüsselt im Tresor gespeichert und danach nicht mehr angezeigt.

- **Telegram**: Öffne @BotFather, sende `/newbot` und vergebe Namen und Benutzernamen. Füge den erhaltenen Token, etwa `123456789:AA…`, in der Zeile [Telegram](/settings?s=chat&find=Telegram) ein und klicke auf **Verbinden**.
- **Discord**: Erstelle im Developer Portal unter discord.com/developers/applications eine **New Application**. Unter **Bot** kopierst du über **Reset Token** einen Token und aktivierst **Message Content Intent**, damit der Bot Nachrichten lesen kann. Füge den Token unter [Discord](/settings?s=chat&find=Discord) ein und wähle **Verbinden**. Über **Bot zu einem Server hinzufügen** lädst du ihn auf einen eigenen Server ein. Discord erlaubt Direktnachrichten nur bei gemeinsamem Server. Angefragt werden View Channels, Send Messages und Read Message History; Hydor registriert die Slash-Befehle.
- **Slack**: Wähle auf api.slack.com/apps **Create New App → From a manifest**, deinen Workspace und das über **Manifest kopieren** erhältliche Manifest aus der Zeile [Slack](/settings?s=chat&find=Slack). Nach dem Verbinden gibt es dafür eine eigene Zeile. Das Manifest aktiviert Socket Mode, Direktnachrichten und Erwähnungen, `/hydor` sowie die Bot-Berechtigungen `app_mentions:read`, `chat:write`, `commands`, `files:read`, `im:history`, `reactions:write` und `users:read`. Erzeuge unter **Basic Information → App-Level Tokens** einen Token mit `connections:write`, beginnend mit `xapp-`. Installiere die App über **Install App** im Workspace und kopiere den Bot User OAuth Token mit `xoxb-`. Füge beide ein und klicke auf **Verbinden**.

Nach dem Verbinden zeigt die erste Zeile darunter den Namen des Bots und was er gerade tut („Wartet auf Nachrichten“ oder was nicht stimmt: Message Content Intent bei Discord ausgeschaltet, eine Berechtigung, die der Slack-App fehlt). **Verbinden** weist einen Token nur ab, wenn der Dienst selbst ihn ablehnt: Wenn Telegram, Discord oder Slack langsam antwortet oder gerade nicht erreichbar ist (wie es in den ersten Minuten eines neuen Bots vorkommen kann), behält Hydor den Token, die Zeile zeigt **Verbindung wird hergestellt …** und den Grund, und der Bot verbindet sich von selbst, sobald der Dienst antwortet. Ein Telegram-Bot erhält seine Nachrichten nur an einer einzigen Stelle; verwendet also eine andere Kopie von Hydor oder ein anderes Programm denselben Bot, sagt das die Zeile. Das **⋯**-Menü der Zeile bietet **Token ändern** (**Tokens ändern** bei Slack), womit du andere eintragen kannst (die Chats eines anderen Bots werden erneut verknüpft), und **Trennen**, womit er aus Hydor entfernt wird; der Bot oder die App bleibt deiner.

### Einen Chat verknüpfen

Nur verknüpfte Chats dürfen den Bot verwenden. Andere erhalten den Hinweis, dass er privat genutzt wird.

1. Öffne [Chat verknüpfen](/settings?s=chat&find=Link%20a%20chat) in der jeweiligen Dienstzeile. Der angezeigte Code gilt einmalig für zehn Minuten.
2. Bei Telegram wähle **In Telegram öffnen** und anschließend **Starten** oder sende den Code an den Bot. Bei Discord und Slack sende ihn als Direktnachricht oder erwähne den Bot mit dem Code in einem Kanal. Anschließend erscheint der Chat namentlich in der Liste.

Ein Kanal wird der Person zugeordnet, die den Code gesendet hat. Dort werden nur ihre Nachrichten mit Bot-Erwähnung berücksichtigt. Das Papierkorbsymbol **Verknüpfung aufheben** entzieht dem Chat den Zugriff auf deine Agenten.

### Was ein Chat kann

- **Schicke, was erledigt werden soll**: Es geht an die Sitzung, in der der Chat ist, oder startet eine neue, wie die Startseite in einem eigenen Aufgabenordner, mit dem Agenten, der in der Zeile **Neue Sitzungen verwenden** festgelegt ist (**Claude Code** oder **Codex**), und als einer deiner Agenten in der Zeile **Neue Sitzungen als**, wenn du einen gewählt hast. Was du sendest, während der Agent arbeitet, wartet in der Warteschlange der Sitzung.
- **Fotos, Dateien und Sprachnachrichten**: Sende sie wie an eine Person, optional mit Begleittext. Alben kommen gemeinsam an. Dateien werden unter ihrem Namen im Sitzungsordner gespeichert, Fotos und Aufnahmen mit Zeitstempel, etwa `photo-2026-11-15-0930.jpg`. Bilder erreichen den Agenten zur Ansicht, andere Dateien zum Öffnen. Bei aktivierter [Spracherkennung auf dem Server](/settings?s=voice&find=Speech%20recognition%20on%20the%20server) unter Einstellungen → Funktionen → Sprache werden Sprachnachrichten zusätzlich als Text übergeben; die Aufnahme bleibt gespeichert. Ohne Spracherkennung erhält der Agent die Audiodatei und der Chat erklärt die Aktivierung. Telegram-Bots können Dateien bis 20 MB abrufen; Discord und Slack erlauben Hydor bis 25 MB. Zu große Dateien werden gemeldet. Dateiinhalte und weitergeleitete Nachrichten sind ausdrücklich externe Daten und keine Anweisungen. Slack benötigt für Dateien `files:read`. Bei älteren Manifesten ergänzt du die Berechtigung unter **OAuth & Permissions** und installierst die App erneut. Bei fehlgeschlagenem Dateiabruf weist der Chat darauf hin.
- **Eigene Agenten**: `/as` mit dem Namen eines deiner [Agenten](/agents) startet eine passende Sitzung, etwa `/as Bookkeeper add this to October` zusammen mit einem Belegfoto. Ohne Aufgabe legt `/as` den Agenten für die nächste neue Chatsitzung fest. `/agents` oder `/as` allein zeigt eine Liste mit Schaltflächen, deine Agenten zuerst. Agenten mit dauerhaft eigener Unterhaltung wechseln direkt dorthin. Discord vervollständigt Namen nach `/as`; in Slack verwendest du `/hydor as Bookkeeper …`. [Neue Sitzungen als](/settings?s=chat&find=New%20sessions%20as) legt den Standard für alle neuen Sitzungen dieser Chat-App fest.
- **Antworten**: Nach Ende des Durchlaufs kommt die Antwort passend formatiert zurück: mit Telegram-Formatierung, Discord-Markdown in Nachrichten zu 2.000 Zeichen oder Slack-mrkdwn in Blöcken. Lange Antworten umfassen höchstens zehn Nachrichten; der Rest bleibt in der Sitzung. Telegram und Discord zeigen eine Schreibanzeige, Slack eine Sanduhr. **In Hydor öffnen** funktioniert, wenn die App eine Internetadresse hat oder über dein Tailnet bereitgestellt wird; siehe [Mit Tailscale auf dem Smartphone nutzen](/guide/devices#use-it-on-your-phone-with-tailscale).
- **Was ein Agent fragt**: Eine einfache Ja-Nein-Frage kommt mit Schaltflächen, die sie beantworten; alles Weitere (ein Formular, ein Plan) kommt mit einem Link, um in der App zu antworten.
- **Befehle**: `/new` erstellt eine Sitzung, mit angehängter Aufgabe startet sie sofort. `/as` und `/agents` wählen eigene Agenten. `/sessions` listet letzte Sitzungen zur Fortsetzung, `/stop` stoppt den Agenten, `/status` nennt Sitzung und Zustand, `/help` zeigt die Befehle. Telegram zeigt ein Befehlsmenü, Discord Slash-Befehle. In Slack folgt alles auf `/hydor`, etwa `/hydor new`; andere Wörter nach `/hydor` gehen als Nachricht an die Sitzung. In Discord und Slack funktionieren auch `!new`, `!as`, `!status` und weitere als normale Nachricht.
- **Benachrichtigungen**: Bei standardmäßig aktiviertem **Mitteilungen von jeder Sitzung** melden deine Chats Abschluss, Fehler und Rückfragen aller Sitzungen, auch wenn sie nicht dort gestartet wurden.

Sticker, Umfragen und Standorte werden nicht weitergegeben. Der Chat bittet stattdessen um Text, Fotos, Dateien oder Sprachnachrichten.

## Von einem anderen Gerät zugreifen

Standardmäßig antwortet die App nur lokal unter `127.0.0.1` auf Port 8790. Wer sie erreicht und das Passwort kennt, kann auf dem Computer Befehle mit deinen Benutzerrechten ausführen. Behandle den Zugang deshalb wie einen SSH-Zugang. Für Smartphone oder andere Computer richtest du HTTPS davor ein, statt den Port direkt im Netzwerk freizugeben. Den einfachsten Weg bietet die App selbst: [Mit Tailscale auf dem Smartphone nutzen](/guide/devices#use-it-on-your-phone-with-tailscale), siehe unten. HTTPS ist auch für die mobile Installation und Push-Benachrichtigungen nötig.

### Mit Tailscale auf dem Smartphone nutzen

Tailscale ist eine kostenlose App, die deine eigenen Geräte in einem privaten Netzwerk verbindet, dem Tailnet. [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone) stellt Hydor dort unter einer Adresse wie `https://laptop.tail1234.ts.net` bereit. Nur Smartphones und Computer, die bei deinem Tailscale-Konto angemeldet sind, können sie öffnen, nicht das öffentliche Internet. Zusätzlich fragt Hydor weiterhin nach seinem Passwort. Tailscale Funnel, das die App öffentlich erreichbar machen würde, wird dabei nie aktiviert.

1. Installiere Tailscale auf diesem Computer und melde dich an ([tailscale.com/download](https://tailscale.com/download)). **Tailscale auf diesem Computer** zeigt die Bereitschaft, etwa „Angemeldet. Dieser Computer heißt laptop im Konto you@example.com.“ Bis dahin nennt die Zeile das Problem: nicht installiert, nicht gestartet, nicht angemeldet oder ausgeschaltet. Sie bietet **Tailscale herunterladen** oder den nötigen nächsten Schritt und **Erneut prüfen**.
2. Wähle [**Auf meinen Geräten bereitstellen**](/settings?s=phone&find=Serve%20it%20on%20my%20devices). Unter **Adresse** erscheint die App-Adresse mit **Kopieren** und **Öffnen**. Die App akzeptiert sie automatisch; du musst keine Datei bearbeiten.
3. Installiere Tailscale auch auf deinem Smartphone und melde dich mit demselben Konto an.
4. Scanne mit der Smartphonekamera den QR-Code unter [**Auf dem Handy öffnen**](/settings?s=phone&find=Open%20it%20on%20your%20phone) oder gib die Adresse ein. Melde dich mit dem App-Passwort an.
5. Das Smartphone öffnet **Auf dem Handy nutzen** mit dem Bereich **Auf diesem Handy**. Wähle zuerst **Zum Home-Bildschirm hinzufügen**: auf dem iPhone in Safari über **Teilen → Zum Home-Bildschirm hinzufügen**, was dort für Benachrichtigungen erforderlich ist; auf Android über **Installieren** oder im Chrome-Menü **App installieren**. Aktiviere anschließend **Dieses Gerät benachrichtigen** und wähle **Testbenachrichtigung senden**. Der Test geht ausschließlich an dieses Smartphone.

**Bereitstellung beenden** entfernt die App wieder aus deinem Tailnet. Dabei wird genau rückgängig gemacht, was **Auf meinen Geräten bereitstellen** eingerichtet hat: die bereitgestellte Adresse und ihre Aufnahme in die von Hydor akzeptierten Adressen. Andere Tailscale-Bereitstellungen bleiben erhalten. Hast du Hydor bereits manuell mit Tailscale bereitgestellt, zeigt die Seite „Außerhalb dieser Seite mit Tailscale eingerichtet“. **Bereitstellung beenden** schaltet auch diese Bereitstellung ab.

Solange die App so bereitgestellt wird, beginnen die von ihr ausgegebenen Links mit dieser Adresse und funktionieren auch auf deinem Smartphone: **In Hydor öffnen** in einer Chat-App sowie Agentenlinks zu Sitzungen und Bibliotheksseiten. Ist in `ALLOWED_ORIGINS` eine eigene Adresse angegeben, verwenden Links weiterhin diese; siehe [Weitere Zugriffswege](/guide/devices#other-ways-to-reach-it).

Im Terminal zeigt `hydor machines phone` denselben Status mit QR-Code. `hydor machines phone serve` und `hydor machines phone stop` übernehmen Bereitstellung und Beendigung; siehe [Das Terminal](/guide/terminal).

### Wenn die Einrichtung nicht klappt

Die Seite erklärt das Problem und den jeweils nötigen Schritt:

- **Serve und HTTPS-Zertifikate sind in deinem Tailnet noch nicht aktiviert.** Tailscale liefert einen Freischaltungslink. **Aktivieren** öffnet ihn; melde dich bei Tailscale an und bestätige einmal. Wähle danach **Erneut versuchen**.
- **Unter Linux darf nur der Tailscale-Operator die Bereitstellung ändern.** Führe den angezeigten Befehl einmal im Terminal aus: `sudo tailscale set --operator=$USER`, mit deinem Benutzernamen. Wähle anschließend **Erneut versuchen**.
- **Unter der Adresse ist bereits etwas anderes bereitgestellt.** Hydor ersetzt es nie. **Auf Port 8443 bereitstellen** verwendet stattdessen etwa `https://laptop.tail1234.ts.net:8443`.
- **Funnel ist für diese Adresse aktiviert.** Tailscale Funnel wurde manuell eingeschaltet, deshalb ist die Adresse aus dem Internet erreichbar. Die Seite weist darauf hin und zeigt den Befehl zum Abschalten.
- **HTTPS-Zertifikate sind in deinem Tailnet deaktiviert.** **Aktivieren** öffnet die Tailscale-DNS-Einstellungen. Schalte dort MagicDNS und HTTPS Certificates ein.

### Weitere Zugriffswege

Wenn du den Zugriff selbst einrichten möchtest, funktionieren auch diese Wege:

- **Tailscale von Hand**: Auf diesem Computer stellt `tailscale serve --bg 8790` die App unter `https://<machine>.<tailnet>.ts.net` bereit, erreichbar nur von deinen eigenen Geräten.
- **Cloudflare Tunnel**: Verbinde den Tunnel mit `http://localhost:8790`. Cloudflare Access kann eine zusätzliche Anmeldung vorschalten.
- **Eigener Reverse Proxy**, etwa Caddy: Leite deinen Hostnamen an `127.0.0.1:8790` weiter.

Ändert der Proxy den `Host`-Header, gib die tatsächlich verwendete Adresse über `ALLOWED_ORIGINS=https://agents.example.com` an. Bei Dienstinstallationen stehen solche Einstellungen in `~/.config/hydor.env`, eine `NAME=value`-Zeile pro Eintrag, bei Docker Compose in `.env`. Starte die App anschließend neu.

Vorschauen von Entwicklungsservern verwenden einen eigenen Port, 8791; siehe [Entwicklungsserver in der Vorschau ansehen](/guide/files-git#look-at-a-dev-server-with-preview).

### Das Passwort schützt den gesamten Zugriff

Das Passwort schützt den gesamten Zugriff. Eine Browseranmeldung bleibt 30 Tage gültig. Falsche Passwörter werden für die jeweilige Herkunftsadresse innerhalb der letzten Stunde gezählt:

- Nach drei Fehlversuchen erscheint ein Bild mit fünf Zeichen. Übertrage sie in **Zeichen im Bild**. Falsch eingegebene Bildzeichen erhöhen den Zähler nicht. **Neues Bild**, der runde Pfeil daneben, erzeugt ein anderes.
- Nach zehn Fehlversuchen wird die Adresse für eine Stunde gesperrt, auch mit richtigem Passwort. Die Seite nennt die Restzeit.
- Nach zehn Fehlversuchen insgesamt erscheint das Zeichenbild für alle. Nach sechzig kann sich bis zum Ablauf der Stunde niemand anmelden.

Hinter den genannten Proxys wird die weitergereichte tatsächliche Besucheradresse gezählt. Bei einer Sperre kannst du ein anderes Netzwerk wie Mobilfunk verwenden, warten oder direkt am Computer ein neues Passwort setzen. Letzteres hebt alle Sperren auf. Siehe [Dein Passwort ändern](/guide/app#change-your-password).

## Mehrere Computer in einer App nutzen

Läuft Hydor auf mehreren Computern, etwa Desktop, GPU-Server und Cloud-Computer, kannst du sie aus einer App bedienen. Jeder behält eigene Sitzungen, Dateien, Terminals, Anmeldungen und Einstellungen. Die App zeigt jeweils einen Computer; die Seitenleiste wechselt zwischen ihnen.

Das richtest du unter [Einstellungen → App → Computer](/settings?s=machines) ein. Die Gruppe **Computer** (mit **Computer hinzufügen** neben ihrem Titel) beginnt mit diesem Computer („Dieser Server“, mit seiner Version), gefolgt von denen, die du hinzugefügt hast, jeweils mit:

- einen grünen Punkt bei Erreichbarkeit, grau während des Verbindens und rot bei Fehlern;
- Verbindungsweg wie `ssh gpu-box` oder Adresse und Zustand, etwa „Online“, „2 brauchen dich · 1 arbeitet“, „Verbindung wird hergestellt…“ oder „Nicht erreichbar“ mit Begründung;
- **Öffnen** und das Menü **⋯** mit **Bearbeiten** und **Entfernen**. Nicht erreichbare Computer bieten zusätzlich **Jetzt erneut versuchen**.

### Einen Computer hinzufügen

1. Installiere Hydor **auf dem anderen Computer** und erzeuge dort einen Zugriffstoken über [Einstellungen → App → Computer](/settings?s=machines&find=Access%20from%20other%20machines) → **Neues Token** oder mit `node dist/server/cli.js access-token "my laptop"` im Hydor-Ordner. Kopiere den mit `acm_` beginnenden Token.
2. Öffne **hier** [Einstellungen → App → Computer](/settings?s=machines&find=Add%20a%20machine) und klicke auf **Computer hinzufügen**.
3. Gib einen **Namen** ein, etwa „GPU-Computer“.
4. Wähle unter **Verbindung** den Zugriffsweg:
   - **Über SSH** ist am einfachsten: **SSH-Host** aus `~/.ssh/config` oder `user@host` und den dortigen Hydor-**Port**, normalerweise 8790. Dieser Computer nutzt seine eigenen SSH-Keys, die ohne Passphrasenabfrage funktionieren müssen. Der andere Computer lauscht weiterhin nur auf seinem `127.0.0.1`; dort muss kein Port freigegeben werden.
   - **Über die Adresse** in einem privaten Netzwerk, VPN wie Tailscale oder WireGuard oder hinter HTTPS, etwa `http://100.64.0.5:8790`. Die dortige App muss über ihre Einstellung `HOST` auf der erreichbaren Adresse lauschen.
5. Füge den **Zugriffstoken** ein und klicke auf **Verbinden**.

Vor dem Speichern prüft die App die Verbindung. Schlägt sie fehl, zeigt der Dialog den Grund, etwa „GPU-Computer konnte nicht verwendet werden: …“, und fügt nichts hinzu.

### Zwischen Computern wechseln

Nach dem Hinzufügen erscheint oben in der Seitenleiste über **Neue Sitzung** der aktuelle Computername. Ein Klick zeigt alle Computer mit Zustand und Häkchen am ausgewählten Eintrag. Wähle einen Computer, um seine Seiten zu öffnen. **Computer hinzufügen oder ändern** führt zu den Einstellungen.

Auf den Seiten eines anderen Computers wird die Zeile hervorgehoben. Ein Punkt bedeutet, dass Sitzungen auf anderen Computern auf dich warten. Bei Verbindungsfehlern erscheint „… ist nicht erreichbar“ mit **Erneut versuchen**, Rückkehr zu deinem eigenen Computer und **Einstellungen → Computer**.

### Wenn ein Computer eine ältere Hydor-Version hat

Die App, die du öffnest, zeigt die Seiten eines anderen Computers in ihrer eigenen Version, egal welches Hydor dieser Computer verwendet. Einem Computer mit einem älteren Hydor kann fehlen, was seine Seiten brauchen, und manche von ihnen können nicht mehr funktionieren. Wenn du also einen Computer wählst, dessen Hydor älter ist als das dieser App, kommt zuerst eine Seite: „… verwendet eine ältere Hydor-Version“. Sie nennt beide Versionen, dass seine Seiten hier in der Version dieser App geöffnet werden und dass manche mit einer älteren nicht mehr funktionieren können. Sie hat drei Schaltflächen:

- **… aktualisieren** (mit dem Namen des Computers) aktualisiert diesen Computer von hier aus, so wie die Schaltfläche **Jetzt aktualisieren** in seiner Versionszeile unter [Einstellungen → App → Allgemein](/settings?s=general&find=Check%20now) (siehe [Die App aktuell halten](/guide/app#keep-the-app-up-to-date)): Eine über Git installierte Kopie oder das Docker-Image erhält die neue Version, baut sie und startet neu; eine Desktop-App lädt die neue Version herunter und startet damit neu. Das dauert einige Minuten, und Agenten, die dort arbeiten, machen weiter. Die Seite zeigt jeden Schritt („Neue Version wird abgerufen“, „Pakete werden installiert“, „Wird erstellt“, „Neustart läuft. Diese Seite verbindet sich automatisch erneut.“) und öffnet die Seiten dieses Computers von selbst, sobald er wieder da ist.
- **Trotzdem öffnen** öffnet die vorhandenen Seiten. Dieser Browser-Tab fragt für dieselbe Version nicht erneut.
- **Öffnen** mit dem Namen deines eigenen Computers kehrt dorthin zurück.

Wenn von hier aus kein Update möglich ist, nennt die Seite stattdessen den Grund: eine Desktop-App, die sich dort, wo sie liegt, nicht selbst ersetzen kann („Verschiebe Hydor in deinen Programme-Ordner, um es zu aktualisieren.“), eine Kopie, die keine Quelle für Updates hat („… kann sich nicht selbst aktualisieren, weil Hydor dort nicht über Git mit einem Upstream installiert wurde. Aktualisiere Hydor dort manuell oder öffne es trotzdem.“), ein Update, das fehlgeschlagen ist („Das Update hat nicht funktioniert: …“), eines, das zuerst neu starten muss („Die neue Version ist vorhanden. Starte Hydor auf … neu, um sie zu nutzen.“), oder eines, das schon so neu ist wie die Quelle, aus der es aktualisiert.

Wenn die Seite eines anderen Computers nicht angezeigt werden kann, siehst du statt eines leeren Fensters „Diese Seite funktioniert nicht mehr“ mit der Angabe, was schiefgegangen ist, sowie **Neu laden** und **Öffnen** für deinen eigenen Computer. Die Seitenleiste bleibt erhalten, und ein Wechsel auf eine andere Seite versucht es erneut. Bei einem Computer mit älterem Hydor bietet die Seite wie oben **Aktualisieren …** an; bei einem Computer mit neuerem Hydor als diese App steht dort, dass du diese App aktualisieren und den Computer danach wieder öffnen sollst.

### Was rechnerübergreifend funktioniert

- **Alle Inhalte einer Computerseite gehören diesem Computer**: Sitzungen, Ordner, Dateien, Git, Terminals, Agentenanmeldungen, Modelle und Einstellungen.
- **Einige Dinge stammen immer vom zuerst geöffneten Computer**: Passwort und Anmeldung, Computerliste, Benachrichtigungen, eigene Designs sowie Willkommenstour und Tipps.
- **Alle Computer können dich benachrichtigen.** Nachrichten nennen den Ursprung, Push läuft über deinen eigenen Computer und der [Posteingang](/guide/inbox) sammelt offene Anfragen aller Computer. Die Seitenleistenzahl berücksichtigt sie ebenfalls.
- **Schreibgeschützte Links** funktionieren auch für fremde Computersitzungen; siehe [Eine Sitzung schreibgeschützt teilen](/guide/devices#share-a-session-with-a-read-only-link).
- **Nicht auf fremden Computerseiten verfügbar** sind Vorschau für Entwicklungsserver, die nur den zuerst geöffneten Computer verwendet, und Andere Agenten verbinden, da jeder Server seine eigene Adresse hat.
- Der Browser merkt sich den geöffneten Ordner der Dateiseite, offene Dateien und das zuletzt genutzte Terminal für jeden Computer getrennt.

### Einen Computer ändern oder entfernen

- **Bearbeiten** ändert Namen, Verbindungsweg oder Token. Ein leeres Tokenfeld behält den bisherigen Wert. Geänderte Verbindungen werden vor dem Speichern erneut geprüft.
- **Entfernen** fragt vorher nach. Die Sitzungen bleiben auf dem anderen Computer; diese App zeigt ihn lediglich nicht mehr an.

### Anderen Computern Zugriff auf diesen geben

In **Zugriff von anderen Computern**, auf fremden Computerseiten **Zugriff auf …**, erstellst du Zugriffstoken. Ein anderer Hydor-Computer kann damit alles tun, was du hier kannst, einschließlich Befehlsausführung. Erstelle deshalb einen eigenen Token pro zugreifendem Computer.

1. Klicke neben der Gruppenüberschrift auf **Neues Token**.
2. Gib unter **Welcher Computer wird es verwenden?** etwa „Mein Laptop“ ein und wähle **Token erstellen**.
3. Kopiere den nur jetzt sichtbaren Token in die Computer-Einstellungen des anderen Hydor.

Jeder Token zeigt Erstellungszeit und letzte Verwendung. **Widerrufen** im Menü **⋯** fragt nach und trennt den Zugriff anschließend sofort.

## Eine Sitzung schreibgeschützt teilen

Ein schreibgeschützter Link erlaubt anderen ohne dein Passwort, eine Sitzung live zu verfolgen. Öffne das Sitzungsmenü (⋯) → **Schreibgeschützten Link teilen**. Für ein ganzes Projekt mit Dokumenten, Sitzungen, Läufen, Leseliste und namentlichen Kommentaren siehe [Ein Projekt mit Personen teilen](/guide/projects#share-a-project-with-people). Für einzelne Bibliotheksinhalte mit Kommentar- oder Bearbeitungsrecht siehe [Mit Personen teilen](/guide/library#share-with-people).

1. Wähle unter **Gültig für** **Ein Tag**, **Eine Woche**, **Einen Monat** oder **Bis zur Deaktivierung**.
2. Klicke auf **Link erstellen**.
3. Kopiere und versende den Link. Er wird einmal angezeigt; weitere Links kannst du jederzeit erstellen.

**Aktive Links** listet die laufenden Links der Sitzung auf, jeweils mit dem Zeitpunkt der Erstellung, dem Ablauf („ohne Ablaufdatum“ bei Links, die bis zur Deaktivierung gelten), der Anzahl der Aufrufe und dem letzten Aufruf. **Deaktivieren** (der Papierkorb) beendet einen Link sofort.

### Was die andere Person sieht

Der Link öffnet nur die Sitzung, ohne Seitenleiste und ohne etwas zum Eintippen. Du siehst den Titel der Sitzung, welcher Agent darin arbeitet, „Schreibgeschützt, aus Hydor geteilt“ und „arbeitet gerade“, solange der Agent arbeitet. Darunter steht die Unterhaltung: deine Nachrichten, die Antworten des Agenten, seine Schritte mit Namen (mit den Zeilen, die jede Dateiänderung hinzugefügt und entfernt hat, und den Änderungen selbst einen Klick entfernt) und Seiten, die der Agent gezeigt hat. Die Ansicht aktualisiert sich von selbst, alle paar Sekunden, solange der Agent arbeitet.

Befehlsausgaben, Denkprozesse, Bildanhänge selbst und andere App-Inhalte bleiben verborgen. Sichtbar ist nur, dass Bilder angehängt wurden. Die andere Person kann nichts eingeben oder ändern. Abgelaufene oder deaktivierte Links zeigen einen entsprechenden Hinweis.

## Andere Agenten mit dieser App verbinden

Externe Agenten wie Claude Code auf deinem Laptop, Codex, Cursor oder andere MCP-Clients können über Hydors MCP-Server Sitzungen auf diesem Computer auflisten, lesen, starten und steuern. Jeder benötigt einen unter [Einstellungen → App → Andere Agenten verbinden](/settings?s=connect) erzeugten Token. Damit kann er hier wie du Sitzungen starten und steuern.

1. Klicke neben dem Titel der Gruppe **Token** auf [**Neues Token**](/settings?s=connect&find=New%20token).
2. Vergib unter **Benenne es nach dem Einsatzort** etwa „Claude Code auf meinem Laptop“ und wähle **Token erstellen**.
3. Kopiere die benötigten Angaben jetzt; sie werden nicht erneut angezeigt:
   - **Token**: der eigentliche Zugangstoken.
   - **Claude Code**: ein Einrichtungsbefehl wie `claude mcp add --transport http hydor <address>/mcp --header "Authorization: Bearer <token>"`.
   - **Codex**: Konfigurationszeilen für `~/.codex/config.toml` mit dem Token in `HYDOR_TOKEN`.
   - **Andere Clients (JSON)**: ein gewöhnlicher MCP-Servereintrag.

Die Adresse entspricht der im Browser geöffneten URL. Ein externer Agent muss Hydor auf demselben Weg erreichen können; siehe [Von einem anderen Gerät zugreifen](/guide/devices#reach-the-app-from-another-device).

Die Liste **Token** zeigt für jedes Token den Namen, wann es erstellt wurde und wann es zuletzt verwendet wurde. Erstelle für jeden Agenten und jeden Computer ein eigenes Token, damit du sie einzeln **Widerrufen** kannst (im Menü **⋯** eines Tokens); wenn du ein Token widerrufst, wird dieser Agent sofort ausgesperrt.

### Was verbundene Agenten tun können

Die Zeile [**Was sie tun können**](/settings?s=connect&find=What%20they%20can%20do) unter den Token hat ein (i), das die Tools auflistet, die ein Agent mit einem Token bekommt:

- **list_sessions** und **read_session**: Sitzungen finden und Nachrichten sowie Schrittnamen lesen.
- **start_session**: Claude-Code- oder Codex-Sitzungen mit erster Nachricht in beliebigen Ordnern starten, optional mit eigenem Worktree. Die Antwort enthält einen Link.
- **send_message**: Sitzungen steuern. Ist der Agent beschäftigt, wartet die Nachricht bis zum Ende des Durchlaufs.
- **list_models**: verfügbare Modelle für neue Sitzungen auflisten.

Auch Apps mit aktiviertem **Anderen Agenten anbieten** erscheinen als Tools und werden mit ihren Formularfeldern gestartet; siehe [Apps](/guide/apps).

Direkt in Hydor gestartete Sitzungen benötigen diese Einrichtung nicht. Der Bereich erscheint nur auf dem zuerst geöffneten Computer, nicht auf fremden Computerseiten.

## Ein GitHub- oder Gitea-Konto hinzufügen

Pull-Requests werden über Konten unter [Einstellungen → App → Versionsverwaltung](/settings?s=scm) geöffnet. Ein Konto gilt für Repositorys seines GitHub-, GitHub-Enterprise- oder Gitea-Servers. Push verwendet weiterhin die lokale Git-Konfiguration mit SSH-Keys oder gespeicherten Zugangsdaten. Das Konto dient zum Erstellen von Pull-Requests und Verfolgen ihrer Prüfungen.

1. Klicke neben dem Titel der Gruppe **Konten** auf [**Konto hinzufügen**](/settings?s=scm&find=Add%20an%20account). Ein Dialog öffnet sich.
2. Wähle **GitHub** oder **Gitea**.
3. Bei GitHub kannst du eine vorhandene Anmeldung der lokalen GitHub CLI mit **Diese Anmeldung verwenden** direkt nutzen. Andernfalls füge einen fein abgestuften **Zugriffstoken** mit Pull requests (Lesen und Schreiben), Contents (Lesen) und Commit statuses (Lesen) für deine Repositorys ein. **Erstellen** öffnet GitHub. Eine **Serveradresse** ist nur für GitHub Enterprise nötig.
4. Für Gitea: die **Serveradresse** (`https://gitea.example.com`) und ein **Zugriffstoken**, das du in Gitea unter Settings → Applications → Generate token erstellst, mit Lese- und Schreibzugriff auf das Repository.
5. Klicke auf **Hinzufügen**. Die App prüft den Token beim Server und zeigt das Konto anschließend mit Benutzernamen an.

Ein zweites Konto für denselben Server ersetzt das erste. Jede Zeile zeigt Benutzername, Server und gegebenenfalls „über die GitHub CLI“. Das Menü **⋯** bietet **Server öffnen** und **Entfernen** mit Rückfrage. Vorhandene Pull-Request-Verknüpfungen bleiben, ihre Zustände werden danach nicht mehr aktualisiert.

Wie Pull-Requests geöffnet und weiterverfolgt werden: [Einen Pull-Request aus einer Sitzung öffnen](/guide/files-git#open-a-pull-request-from-a-session).

## Frag einen Agenten

- „Mache die App über Tailscale von meinem Smartphone aus erreichbar.“
- „Welche Adresse hat die App in meinem Tailnet? Was könnte den Zugriff vom Smartphone verhindern?“
- „Beende die Bereitstellung der App in meinem Tailnet.“
- „Erstelle einen schreibgeschützten Link zu dieser Sitzung für eine Woche.“
- „Deaktiviere alle Freigabelinks dieser Sitzung.“
- „Welche meiner Computer sind offline? Versuche die Verbindung erneut.“
- „Benenne gpu-box in Studio GPU um.“
- „Liste die Tokens auf, mit denen andere Agenten auf diese App zugreifen, und widerrufe das Token mit dem Namen alter Laptop.“
- „Füge mein GitHub-Konto mit der Anmeldung der GitHub CLI hinzu.“
- „Sende meinen Telegram-, Discord- und Slack-Chats Benachrichtigungen aller Sitzungen, nicht nur der dort gestarteten.“
- „Welche Chats sind je Chat-App mit Hydor verknüpft?“
- „Verwende Codex für neue Sitzungen aus meinem Discord-Chat.“
- „Starte neue Sitzungen aus meinem Telegram-Chat mit meinem Agenten Bookkeeper.“
- „Trenne die Verbindung zur Slack-App.“
