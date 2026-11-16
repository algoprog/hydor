# Smartphones, weitere Rechner und Teilen

Hydor funktioniert in jedem Browser: auf deinem Smartphone, auf anderen Computern und über mehrere Rechner mit eigener Hydor-Installation hinweg. Hier erfährst du, wie du die App mobil mit wenigen Klicks privat über Tailscale einrichtest und sicher von außen erreichst, zwischen Rechnern wechselst, Sitzungen schreibgeschützt teilst, externe Agenten verbindest und GitHub- oder Gitea-Konten für Pull Requests hinzufügst.

![Die App auf einem Smartphone: eine Sitzung mit Rückfrage](images/devices.webp)

## Die App auf dem Smartphone verwenden

Auf dem Smartphone nutzt du dieselbe App wie am Computer, angepasst an den kleinen Bildschirm. Auch ein schmales Desktopfenster erhält diese Ansicht:

- **Die Seitenleiste wird zum aufklappbaren Menü.** Tippe oben links auf **Menü** (≡). Die bildschirmfüllende Liste zeigt Sitzungen, Posteingang und Werkzeuge. Tippe auf einen Eintrag oder gehe über **Menü schließen** (✕) zurück.
- **Auswahlfenster öffnen sich von unten.** Programm, Modell, Ordner, Agent und **Optionen** erscheinen auf der Startseite oberhalb der Tastatur, mit abgedunkeltem Hintergrund. Einzelne Optionen öffnen sich darüber. In Sitzungen öffnet die Modellanzeige mit Denkaufwand und Berechtigungen dieselbe Art von Auswahlfenster. Dialoge erscheinen ebenfalls von unten.
- **Ein Bereich nach dem anderen.** Einstellungen zeigen zunächst eine Liste und öffnen jeden Abschnitt auf einer eigenen Seite. Dateien zeigt einen Ordner mit Namen oben. Antippen öffnet die Ortsauswahl, **‹** den übergeordneten Ordner. Dateien öffnen sich separat mit **Zurück**. Die Git-Seite zeigt zunächst Repositorys und danach das gewählte Repository mit Zurück-Pfeil.
- **Berühren statt Mausbedienung.** In Dateien öffnet ⋯ das Zeilenmenü. Langes Drücken markiert Einträge für gemeinsame Aktionen. Der Editor bricht lange Zeilen um. Das Terminal ergänzt Tasten wie Strg, Alt, Esc, Tab und Pfeile.

Damit dein Smartphone zugreifen kann, muss die App außerhalb ihres Computers erreichbar sein. [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone) richtet das mit wenigen Klicks privat über Tailscale ein; siehe [Mit Tailscale auf dem Smartphone nutzen](/guide/devices#use-it-on-your-phone-with-tailscale).

### Zum Startbildschirm hinzufügen

Vom Startbildschirm öffnet sich Hydor mit eigenem Symbol im Vollbild wie eine gewöhnliche App. Voraussetzung ist HTTPS, wie es **Auf dem Smartphone nutzen** einrichtet. Öffnest du [Auf dem Smartphone nutzen](/settings?s=phone&find=Add%20to%20Home%20Screen) auf deinem Smartphone, stehen unter **Auf diesem Smartphone → Zum Home-Bildschirm** die passenden Schritte und gegebenenfalls eine **Installieren**-Schaltfläche, falls dein Browser sie unterstützt.

- **iPhone oder iPad**: Öffne die App im Browser und wähle **Teilen → Zum Home-Bildschirm**. Starte sie danach über das neue Symbol.
- **Android**: Verwende im Browsermenü **App installieren** oder **Zum Startbildschirm hinzufügen**.

### Inhalte anderer Apps an Hydor teilen

Nach der Installation erscheint Hydor im Teilen-Menü unterstützter Geräte. Teile ein Foto, PDF, eine Webseite oder Text und wähle **Hydor**. Die Startseite öffnet sich mit Text und Links im Nachrichtenfeld beziehungsweise Dateien als Anhängen. Ergänze deine Aufgabe, wähle bei Bedarf den Agenten und sende die Nachricht.

- **Android**: funktioniert nach Installation über das Browsermenü mit Chrome, Edge und anderen Chromium-Browsern.
- **Computer**: funktioniert in Chrome und Edge nach Installation über die Adressleiste oder **Hydor installieren** im Browsermenü, sofern die Quell-App das systemweite Teilen-Menü verwendet.
- **iPhone und iPad**: Safari erlaubt Web-Apps keine Empfangsfunktion im Teilen-Menü. Fotos und Dateien kannst du stattdessen über eine Chat-App senden; siehe [Was ein Chat kann](/guide/devices#what-a-chat-can-do). Für Text und Links kannst du einen Kurzbefehl anlegen: im Teilen-Menü anzeigen lassen, Text und URLs akzeptieren, die Eingabe mit **URL codieren** umwandeln und über **URLs öffnen** an deine App-Adresse mit `/?prompt=` anhängen, etwa `https://hydor.example.com/?prompt=` plus codiertem Text. Safari öffnet die Startseite mit dem vorausgefüllten Nachrichtenfeld.

Du musst auf dem Gerät angemeldet sein. Bei abgemeldeter Sitzung geht der geteilte Inhalt verloren; die Startseite weist darauf hin. Dateien dürfen zusammen wie im Nachrichtenfeld bis zu 25 MB groß sein und werden am selben Ort wie gewöhnliche Anhänge gespeichert.

### Benachrichtigungen auf dem Smartphone erhalten

Benachrichtigungen informieren dich bei Abschluss, Fehlern und Rückfragen, auch bei geschlossener App.

1. Öffne auf dem Smartphone [Einstellungen → App → Benachrichtigungen](/settings?s=notifications&find=Notify%20this%20device).
2. Aktiviere **Dieses Gerät benachrichtigen** und erlaube die Browseranfrage. Jedes Gerät wird separat eingerichtet.
3. Prüfe den Empfang mit **Test senden**. Die Nachricht erscheint, wenn die App nicht sichtbar ist.

Auf dem Smartphone zeigt [Auf dem Smartphone nutzen](/settings?s=phone) unter **Auf diesem Smartphone** nach **Zum Home-Bildschirm** denselben Schalter **Dieses Gerät benachrichtigen**. **Test senden** sendet dort nur an dieses Smartphone.

Auf iPhone und iPad musst du die App zuerst zum Home-Bildschirm hinzufügen und von dort öffnen. Blockierte Website-Mitteilungen erlaubst du zuerst in den Browsereinstellungen. Einfache Ja-Nein-Freigaben bieten direkt in unterstützten Benachrichtigungen **Genehmigen** und **Ablehnen**. Mehr unter [Posteingang und Benachrichtigungen](/guide/inbox).

## Mit Agenten über Telegram, Discord und Slack sprechen

In Telegram-, Discord- und Slack-Chats kannst du Sitzungen auch mit eigenen Agenten starten, Fotos, Dateien und Sprachnachrichten senden, Antworten lesen und Rückfragen beantworten. Jeder Dienst nutzt einen von dir eingerichteten Bot oder eine eigene App unter [Einstellungen → App → Chat-Apps](/settings?s=chat). Hydor baut die Verbindung nach außen auf: durch Telegram-Abfragen sowie WebSockets zum Discord-Gateway und Slack Socket Mode. Eine öffentliche Internetadresse für Hydor ist deshalb nicht erforderlich.

### Einen Bot oder eine App verbinden

Öffne [Chat-Apps](/settings?s=chat) und wähle in der Gruppe **Bots** einen Dienst. Bis zur Verbindung steht dort **Einrichten**. Darunter erscheinen die Schritte. Eingefügte Zugangsdaten werden verschlüsselt im Tresor gespeichert und danach nicht mehr angezeigt.

- **Telegram**: Öffne @BotFather, sende `/newbot` und vergebe Namen und Benutzernamen. Füge den erhaltenen Token, etwa `123456789:AA…`, in der Zeile [Telegram](/settings?s=chat&find=Telegram) ein und klicke auf **Verbinden**.
- **Discord**: Erstelle im Developer Portal unter discord.com/developers/applications eine **New Application**. Unter **Bot** kopierst du über **Reset Token** einen Token und aktivierst **Message Content Intent**, damit der Bot Nachrichten lesen kann. Füge den Token unter [Discord](/settings?s=chat&find=Discord) ein und wähle **Verbinden**. Über **Bot zu einem Server hinzufügen** lädst du ihn auf einen eigenen Server ein. Discord erlaubt Direktnachrichten nur bei gemeinsamem Server. Angefragt werden View Channels, Send Messages und Read Message History; Hydor registriert die Slash-Befehle.
- **Slack**: Wähle auf api.slack.com/apps **Create New App → From a manifest**, deinen Workspace und das über **Manifest kopieren** erhältliche Manifest aus der Zeile [Slack](/settings?s=chat&find=Slack). Nach dem Verbinden gibt es dafür eine eigene Zeile. Das Manifest aktiviert Socket Mode, Direktnachrichten und Erwähnungen, `/hydor` sowie die Bot-Berechtigungen `app_mentions:read`, `chat:write`, `commands`, `files:read`, `im:history`, `reactions:write` und `users:read`. Erzeuge unter **Basic Information → App-Level Tokens** einen Token mit `connections:write`, beginnend mit `xapp-`. Installiere die App über **Install App** im Workspace und kopiere den Bot User OAuth Token mit `xoxb-`. Füge beide ein und klicke auf **Verbinden**.

Nach dem Verbinden zeigt die erste Zeile Bot-Name und Zustand, etwa „Wartet auf Nachrichten“, oder Probleme wie deaktiviertes Message Content Intent und fehlende Slack-Berechtigungen. Tokens werden nur abgelehnt, wenn der Dienst sie ausdrücklich zurückweist. Bei langsamer oder vorübergehend fehlender Verbindung, insbesondere bei neuen Bots, bleiben sie gespeichert. **Verbindung wird hergestellt…** nennt den Grund; Hydor verbindet sich später automatisch. Ein Telegram-Bot kann nur an einer Stelle Nachrichten empfangen. Verwendet eine andere Hydor-Instanz oder ein anderes Programm denselben Bot, weist die Zeile darauf hin. Das Menü **⋯** bietet **Token ändern**, bei Slack **Tokens ändern**, und **Verbindung trennen**. Beim Wechsel zu einem anderen Bot müssen Chats neu verknüpft werden. Das Trennen entfernt nur die Hydor-Verbindung; Bot oder App bleiben erhalten.

### Einen Chat verknüpfen

Nur verknüpfte Chats dürfen den Bot verwenden. Andere erhalten den Hinweis, dass er privat genutzt wird.

1. Öffne [Chat verknüpfen](/settings?s=chat&find=Link%20a%20chat) in der jeweiligen Dienstzeile. Der angezeigte Code gilt einmalig für zehn Minuten.
2. Bei Telegram wähle **In Telegram öffnen** und anschließend **Starten** oder sende den Code an den Bot. Bei Discord und Slack sende ihn als Direktnachricht oder erwähne den Bot mit dem Code in einem Kanal. Anschließend erscheint der Chat namentlich in der Liste.

Ein Kanal wird der Person zugeordnet, die den Code gesendet hat. Dort werden nur ihre Nachrichten mit Bot-Erwähnung berücksichtigt. Das Papierkorbsymbol **Verknüpfung aufheben** entzieht dem Chat den Zugriff auf deine Agenten.

### Was ein Chat kann

- **Aufgaben senden**: Die Nachricht geht an die aktuelle Chatsitzung oder startet wie die Startseite eine neue Sitzung in einem eigenen Aufgabenordner. **Neue Sitzungen verwenden** bestimmt Claude Code oder Codex; **Neue Sitzungen als** optional einen deiner eigenen Agenten. Nachrichten während der Arbeit warten in der Warteschlange.
- **Fotos, Dateien und Sprachnachrichten**: Sende sie wie an eine Person, optional mit Begleittext. Alben kommen gemeinsam an. Dateien werden unter ihrem Namen im Sitzungsordner gespeichert, Fotos und Aufnahmen mit Zeitstempel, etwa `photo-2026-11-15-0930.jpg`. Bilder erreichen den Agenten zur Ansicht, andere Dateien zum Öffnen. Bei aktivierter [Spracherkennung auf dem Server](/settings?s=voice&find=Speech%20recognition%20on%20the%20server) unter Einstellungen → Funktionen → Sprache werden Sprachnachrichten zusätzlich als Text übergeben; die Aufnahme bleibt gespeichert. Ohne Spracherkennung erhält der Agent die Audiodatei und der Chat erklärt die Aktivierung. Telegram-Bots können Dateien bis 20 MB abrufen; Discord und Slack erlauben Hydor bis 25 MB. Zu große Dateien werden gemeldet. Dateiinhalte und weitergeleitete Nachrichten sind ausdrücklich externe Daten und keine Anweisungen. Slack benötigt für Dateien `files:read`. Bei älteren Manifesten ergänzt du die Berechtigung unter **OAuth & Permissions** und installierst die App erneut. Bei fehlgeschlagenem Dateiabruf weist der Chat darauf hin.
- **Eigene Agenten**: `/as` mit dem Namen eines deiner [Agenten](/agents) startet eine passende Sitzung, etwa `/as Bookkeeper add this to October` zusammen mit einem Belegfoto. Ohne Aufgabe legt `/as Name` den Agenten für die nächste neue Chatsitzung fest. `/agents` oder `/as` allein zeigt eine Liste mit Schaltflächen, deine Agenten zuerst. Agenten mit dauerhaft eigenem Gespräch wechseln direkt dorthin. Discord vervollständigt Namen nach `/as`; in Slack verwendest du `/hydor as Bookkeeper …`. [Neue Sitzungen als](/settings?s=chat&find=New%20sessions%20as) legt den Standard für alle neuen Sitzungen dieser Chat-App fest.
- **Antworten**: Nach Ende des Durchlaufs kommt die Antwort passend formatiert zurück: mit Telegram-Formatierung, Discord-Markdown in Nachrichten zu 2.000 Zeichen oder Slack-mrkdwn in Blöcken. Lange Antworten umfassen höchstens zehn Nachrichten; der Rest bleibt in der Sitzung. Telegram und Discord zeigen eine Schreibanzeige, Slack eine Sanduhr. **In Hydor öffnen** funktioniert, wenn die App eine Internetadresse hat oder über dein Tailnet bereitgestellt wird; siehe [Mit Tailscale auf dem Smartphone nutzen](/guide/devices#use-it-on-your-phone-with-tailscale).
- **Rückfragen**: Einfache Ja-Nein-Fragen enthalten Antwortknöpfe. Formulare, Pläne und andere komplexe Fragen verlinken in die App.
- **Befehle**: `/new` erstellt eine Sitzung, mit angehängter Aufgabe startet sie sofort. `/as` und `/agents` wählen eigene Agenten. `/sessions` listet letzte Sitzungen zur Fortsetzung, `/stop` stoppt den Agenten, `/status` nennt Sitzung und Zustand, `/help` zeigt die Befehle. Telegram zeigt ein Befehlsmenü, Discord Slash-Befehle. In Slack folgt alles auf `/hydor`, etwa `/hydor new`; andere Wörter nach `/hydor` gehen als Nachricht an die Sitzung. In Discord und Slack funktionieren auch `!new`, `!as`, `!status` und weitere als normale Nachricht.
- **Benachrichtigungen**: Bei standardmäßig aktiviertem **Benachrichtigungen aus allen Sitzungen** melden deine Chats Abschluss, Fehler und Rückfragen aller Sitzungen, auch wenn sie nicht dort gestartet wurden.

Sticker, Umfragen und Standorte werden nicht weitergegeben. Der Chat bittet stattdessen um Text, Fotos, Dateien oder Sprachnachrichten.

## Von einem anderen Gerät zugreifen

Standardmäßig antwortet die App nur lokal unter `127.0.0.1` auf Port 8790. Wer sie erreicht und das Passwort kennt, kann auf dem Computer Befehle mit deinen Benutzerrechten ausführen. Behandle den Zugang deshalb wie einen SSH-Zugang. Für Smartphone oder andere Computer richtest du HTTPS davor ein, statt den Port direkt im Netzwerk freizugeben. Den einfachsten Weg bietet die App selbst: [Mit Tailscale auf dem Smartphone nutzen](/guide/devices#use-it-on-your-phone-with-tailscale), siehe unten. HTTPS ist auch für die mobile Installation und Push-Benachrichtigungen nötig.

### Mit Tailscale auf dem Smartphone nutzen

Tailscale ist eine kostenlose App, die deine eigenen Geräte in einem privaten Netzwerk verbindet, dem Tailnet. [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone) stellt Hydor dort unter einer Adresse wie `https://laptop.tail1234.ts.net` bereit. Nur Smartphones und Computer, die bei deinem Tailscale-Konto angemeldet sind, können sie öffnen, nicht das öffentliche Internet. Zusätzlich fragt Hydor weiterhin nach seinem Passwort. Tailscale Funnel, das die App öffentlich erreichbar machen würde, wird dabei nie aktiviert.

1. Installiere Tailscale auf diesem Computer und melde dich an ([tailscale.com/download](https://tailscale.com/download)). **Tailscale auf diesem Computer** zeigt die Bereitschaft, etwa „Angemeldet. Dieser Computer heißt laptop im Konto you@example.com.“ Bis dahin nennt die Zeile das Problem: nicht installiert, nicht gestartet, nicht angemeldet oder ausgeschaltet. Sie bietet **Tailscale herunterladen** oder den nötigen nächsten Schritt und **Erneut prüfen**.
2. Wähle [**Auf meinen Geräten bereitstellen**](/settings?s=phone&find=Serve%20it%20on%20my%20devices). Unter **Adresse** erscheint die App-Adresse mit **Kopieren** und **Öffnen**. Die App akzeptiert sie automatisch; du musst keine Datei bearbeiten.
3. Installiere Tailscale auch auf deinem Smartphone und melde dich mit demselben Konto an.
4. Scanne mit der Smartphonekamera den QR-Code unter [**Auf dem Smartphone öffnen**](/settings?s=phone&find=Open%20it%20on%20your%20phone) oder gib die Adresse ein. Melde dich mit dem App-Passwort an.
5. Das Smartphone öffnet **Auf dem Smartphone nutzen** mit dem Bereich **Auf diesem Smartphone**. Wähle zuerst **Zum Home-Bildschirm**: auf dem iPhone in Safari über **Teilen → Zum Home-Bildschirm**, was dort für Benachrichtigungen erforderlich ist; auf Android über **Installieren** oder im Chrome-Menü **App installieren**. Aktiviere anschließend **Dieses Gerät benachrichtigen** und wähle **Test senden**. Der Test geht ausschließlich an dieses Smartphone.

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

- **Tailscale manuell**: `tailscale serve --bg 8790` stellt die App unter `https://<machine>.<tailnet>.ts.net` nur für deine Geräte bereit.
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

## Mehrere Rechner in einer App nutzen

Läuft Hydor auf mehreren Rechnern, etwa Desktop, GPU-Server und Cloud-Rechner, kannst du sie aus einer App bedienen. Jeder behält eigene Sitzungen, Dateien, Terminals, Anmeldungen und Einstellungen. Die App zeigt jeweils einen Rechner; die Seitenleiste wechselt zwischen ihnen.

Unter [Einstellungen → App → Rechner](/settings?s=machines) beginnt die Gruppe **Rechner** mit diesem Server und seiner Version. Daneben steht **Rechner hinzufügen**. Weitere Einträge zeigen:

- einen grünen Punkt bei Erreichbarkeit, grau während des Verbindens und rot bei Fehlern;
- Verbindungsweg wie `ssh gpu-box` oder Adresse und Zustand, etwa „Online“, „2 brauchen dich · 1 arbeitet“, „Verbindung wird hergestellt…“ oder „Nicht erreichbar“ mit Begründung;
- **Öffnen** und das Menü **⋯** mit **Bearbeiten** und **Entfernen**. Nicht erreichbare Rechner bieten zusätzlich **Jetzt erneut versuchen**.

### Einen Rechner hinzufügen

1. Installiere Hydor **auf dem anderen Rechner** und erzeuge dort einen Zugriffstoken über [Einstellungen → App → Rechner](/settings?s=machines&find=Access%20from%20other%20machines) → **Neuer Token** oder mit `node dist/server/cli.js access-token "my laptop"` im Hydor-Ordner. Kopiere den mit `acm_` beginnenden Token.
2. Öffne **hier** [Einstellungen → App → Rechner](/settings?s=machines&find=Add%20a%20machine) und klicke auf **Rechner hinzufügen**.
3. Gib einen **Namen** ein, etwa „GPU-Rechner“.
4. Wähle unter **Verbindung** den Zugriffsweg:
   - **Über SSH** ist am einfachsten: **SSH-Host** aus `~/.ssh/config` oder `user@host` und den dortigen Hydor-**Port**, normalerweise 8790. Dieser Rechner nutzt seine eigenen SSH-Keys, die ohne Passphrasenabfrage funktionieren müssen. Der andere Rechner lauscht weiterhin nur auf seinem `127.0.0.1`; dort muss kein Port freigegeben werden.
   - **Über die Adresse** in einem privaten Netzwerk, VPN wie Tailscale oder WireGuard oder hinter HTTPS, etwa `http://100.64.0.5:8790`. Die dortige App muss über ihre Einstellung `HOST` auf der erreichbaren Adresse lauschen.
5. Füge den **Zugriffstoken** ein und klicke auf **Verbinden**.

Vor dem Speichern prüft die App die Verbindung. Schlägt sie fehl, zeigt der Dialog den Grund, etwa „GPU-Rechner konnte nicht verwendet werden: …“, und fügt nichts hinzu.

### Zwischen Rechnern wechseln

Nach dem Hinzufügen erscheint oben in der Seitenleiste über **Neue Sitzung** der aktuelle Rechnername. Ein Klick zeigt alle Rechner mit Zustand und Häkchen am ausgewählten Eintrag. Wähle einen Rechner, um seine Seiten zu öffnen. **Rechner hinzufügen oder ändern** führt zu den Einstellungen.

Auf den Seiten eines anderen Rechners wird die Zeile hervorgehoben. Ein Punkt bedeutet, dass Sitzungen auf anderen Rechnern auf dich warten. Bei Verbindungsfehlern erscheint „… ist nicht erreichbar“ mit **Erneut versuchen**, Rückkehr zu deinem eigenen Rechner und **Einstellungen → Rechner**.

### Wenn ein Rechner eine ältere Hydor-Version hat

Die geöffnete App zeigt fremde Rechnerseiten immer mit ihrer eigenen Oberflächenversion. Ein älterer Server kann dafür benötigte Funktionen noch nicht besitzen. Deshalb erscheint beim Wechsel zunächst „… hat eine ältere Hydor-Version“ mit beiden Versionsnummern und dem Hinweis auf mögliche Funktionsfehler. Du hast drei Möglichkeiten:

- **… aktualisieren** führt ein Update des benannten Rechners aus, wie **Jetzt aktualisieren** unter [Einstellungen → App → Allgemein](/settings?s=general&find=Check%20now); siehe [Die App aktuell halten](/guide/app#keep-the-app-up-to-date). Git- und Docker-Installationen erhalten die neue Version, bauen sie und starten neu. Desktop-Apps laden die neue Version und starten damit. Das dauert einige Minuten; dort arbeitende Agenten laufen weiter. Die Seite zeigt Schritte wie Abruf, Paketinstallation, Build und Neustart und verbindet sich danach automatisch wieder.
- **Trotzdem öffnen** öffnet die vorhandenen Seiten. Dieser Browser-Tab fragt für dieselbe Version nicht erneut.
- **Öffnen** mit dem Namen deines eigenen Rechners kehrt dorthin zurück.

Ist ein Fernupdate unmöglich, erklärt die Seite den Grund: Eine Desktop-App muss etwa zuerst in den Programmeordner verschoben werden; einer Installation fehlen Git-Upstream oder Updatequelle; ein Update ist fehlgeschlagen, benötigt einen Neustart oder ist bereits so aktuell wie die Quelle.

Schlägt die Darstellung einer fremden Rechnerseite fehl, erscheint „Diese Seite funktioniert nicht mehr“ mit Fehler, **Neu laden** und Rückkehr zum eigenen Rechner. Die Seitenleiste bleibt bedienbar; ein Seitenwechsel versucht es erneut. Bei älterem Hydor wird ein Update angeboten. Bei neuerem Hydor auf dem fremden Rechner sollst du zuerst diese App aktualisieren und ihn danach wieder öffnen.

### Was rechnerübergreifend funktioniert

- **Alle Inhalte einer Rechnerseite gehören diesem Rechner**: Sitzungen, Ordner, Dateien, Git, Terminals, Agentenanmeldungen, Modelle und Einstellungen.
- **Einige Dinge stammen immer vom zuerst geöffneten Rechner**: Passwort und Anmeldung, Rechnerliste, Benachrichtigungen, eigene Designs sowie Willkommenstour und Tipps.
- **Alle Rechner können dich benachrichtigen.** Nachrichten nennen den Ursprung, Push läuft über deinen eigenen Rechner und der [Posteingang](/guide/inbox) sammelt offene Anfragen aller Rechner. Die Seitenleistenzahl berücksichtigt sie ebenfalls.
- **Schreibgeschützte Links** funktionieren auch für fremde Rechnersitzungen; siehe [Eine Sitzung schreibgeschützt teilen](/guide/devices#share-a-session-with-a-read-only-link).
- **Nicht auf fremden Rechnerseiten verfügbar** sind Vorschau für Entwicklungsserver, die nur den zuerst geöffneten Rechner verwendet, und Andere Agenten verbinden, da jeder Server seine eigene Adresse hat.
- Der Browser merkt sich den geöffneten Ordner der Dateiseite, offene Dateien und das zuletzt genutzte Terminal für jeden Rechner getrennt.

### Einen Rechner ändern oder entfernen

- **Bearbeiten** ändert Namen, Verbindungsweg oder Token. Ein leeres Tokenfeld behält den bisherigen Wert. Geänderte Verbindungen werden vor dem Speichern erneut geprüft.
- **Entfernen** fragt vorher nach. Die Sitzungen bleiben auf dem anderen Rechner; diese App zeigt ihn lediglich nicht mehr an.

### Anderen Rechnern Zugriff auf diesen geben

In **Zugriff von anderen Rechnern**, auf fremden Rechnerseiten **Zugriff auf …**, erstellst du Zugriffstoken. Ein anderer Hydor-Rechner kann damit alles tun, was du hier kannst, einschließlich Befehlsausführung. Erstelle deshalb einen eigenen Token pro zugreifendem Rechner.

1. Klicke neben der Gruppenüberschrift auf **Neuer Token**.
2. Gib unter **Welcher Rechner verwendet ihn?** etwa „Mein Laptop“ ein und wähle **Token erstellen**.
3. Kopiere den nur jetzt sichtbaren Token in die Rechner-Einstellungen des anderen Hydor.

Jeder Token zeigt Erstellungszeit und letzte Verwendung. **Widerrufen** im Menü **⋯** fragt nach und trennt den Zugriff anschließend sofort.

## Eine Sitzung schreibgeschützt teilen

Ein schreibgeschützter Link erlaubt anderen ohne dein Passwort, eine Sitzung live zu verfolgen. Öffne das Sitzungsmenü (⋯) → **Schreibgeschützten Link teilen**. Für ein ganzes Projekt mit Dokumenten, Sitzungen, Läufen, Leseliste und namentlichen Kommentaren siehe [Ein Projekt mit Personen teilen](/guide/projects#share-a-project-with-people). Für einzelne Bibliotheksinhalte mit Kommentar- oder Bearbeitungsrecht siehe [Mit Personen teilen](/guide/library#share-with-people).

1. Wähle unter **Gültig für** einen Tag, eine Woche, einen Monat oder **Bis zur Deaktivierung**.
2. Klicke auf **Link erstellen**.
3. Kopiere und versende den Link. Er wird einmal angezeigt; weitere Links kannst du jederzeit erstellen.

**Aktive Links** zeigt Erstellung, Ablauf oder „Kein Ablauf“, Aufrufanzahl und letzten Aufruf. **Deaktivieren** über das Papierkorbsymbol sperrt einen Link sofort.

### Was die andere Person sieht

Der Link öffnet nur die Sitzung, ohne Seitenleiste oder Eingabefeld. Sichtbar sind Titel, Agent, „Schreibgeschützt, aus Hydor geteilt“ und während der Arbeit ein Aktivitätshinweis. Darunter stehen deine Nachrichten, Antworten, Schrittnamen, Zeilenänderungen mit anklickbaren Diffs und vom Agenten gezeigte Seiten. Die Ansicht aktualisiert sich während der Arbeit alle paar Sekunden.

Befehlsausgaben, Denkprozesse, Bildanhänge selbst und andere App-Inhalte bleiben verborgen. Sichtbar ist nur, dass Bilder angehängt wurden. Die andere Person kann nichts eingeben oder ändern. Abgelaufene oder deaktivierte Links zeigen einen entsprechenden Hinweis.

## Andere Agenten mit dieser App verbinden

Externe Agenten wie Claude Code auf deinem Laptop, Codex, Cursor oder andere MCP-Clients können über Hydors MCP-Server Sitzungen auf diesem Rechner auflisten, lesen, starten und steuern. Jeder benötigt einen unter [Einstellungen → App → Andere Agenten verbinden](/settings?s=connect) erzeugten Token. Damit kann er hier wie du Sitzungen starten und steuern.

1. Klicke neben **Tokens** auf [**Neuer Token**](/settings?s=connect&find=New%20token).
2. Vergib unter **Nach dem Einsatzort benennen** etwa „Claude Code auf meinem Laptop“ und wähle **Token erstellen**.
3. Kopiere die benötigten Angaben jetzt; sie werden nicht erneut angezeigt:
   - **Token**: der eigentliche Zugangstoken.
   - **Claude Code**: ein Einrichtungsbefehl wie `claude mcp add --transport http hydor <address>/mcp --header "Authorization: Bearer <token>"`.
   - **Codex**: Konfigurationszeilen für `~/.codex/config.toml` mit dem Token in `HYDOR_TOKEN`.
   - **Andere Clients (JSON)**: ein gewöhnlicher MCP-Servereintrag.

Die Adresse entspricht der im Browser geöffneten URL. Ein externer Agent muss Hydor auf demselben Weg erreichen können; siehe [Von einem anderen Gerät zugreifen](/guide/devices#reach-the-app-from-another-device).

Die **Tokens**-Liste nennt Namen, Erstellung und letzte Verwendung. Mit einem eigenen Token pro Agent oder Rechner kannst du Zugriffe einzeln über **Widerrufen** im Menü **⋯** sofort sperren.

### Was verbundene Agenten tun können

Das (i) unter [**Was sie tun können**](/settings?s=connect&find=What%20they%20can%20do) unterhalb der Tokens nennt die Tools:

- **list_sessions** und **read_session**: Sitzungen finden und Nachrichten sowie Schrittnamen lesen.
- **start_session**: Claude-Code- oder Codex-Sitzungen mit erster Nachricht in beliebigen Ordnern starten, optional mit eigenem Worktree. Die Antwort enthält einen Link.
- **send_message**: Sitzungen steuern. Ist der Agent beschäftigt, wartet die Nachricht bis zum Ende des Durchlaufs.
- **list_models**: verfügbare Modelle für neue Sitzungen auflisten.

Auch Apps mit aktiviertem **Anderen Agenten anbieten** erscheinen als Tools und werden mit ihren Formularfeldern gestartet; siehe [Apps](/guide/apps).

Direkt in Hydor gestartete Sitzungen benötigen diese Einrichtung nicht. Der Bereich erscheint nur auf dem zuerst geöffneten Rechner, nicht auf fremden Rechnerseiten.

## Ein GitHub- oder Gitea-Konto hinzufügen

Pull Requests werden über Konten unter [Einstellungen → App → Versionsverwaltung](/settings?s=scm) geöffnet. Ein Konto gilt für Repositorys seines GitHub-, GitHub-Enterprise- oder Gitea-Servers. Push verwendet weiterhin die lokale Git-Konfiguration mit SSH-Keys oder gespeicherten Zugangsdaten. Das Konto dient zum Erstellen von Pull Requests und Verfolgen ihrer Prüfungen.

1. Klicke neben **Konten** auf [**Konto hinzufügen**](/settings?s=scm&find=Add%20an%20account).
2. Wähle **GitHub** oder **Gitea**.
3. Bei GitHub kannst du eine vorhandene Anmeldung der lokalen GitHub CLI mit **Anmeldung übernehmen** direkt nutzen. Andernfalls füge einen fein abgestuften **Zugriffstoken** mit Pull requests (Lesen und Schreiben), Contents (Lesen) und Commit statuses (Lesen) für deine Repositorys ein. **Erstellen** öffnet GitHub. Eine **Serveradresse** ist nur für GitHub Enterprise nötig.
4. Für Gitea gib **Serveradresse** wie `https://gitea.example.com` und einen unter Settings → Applications → Generate token erstellten Token mit Lese- und Schreibzugriff auf Repositorys an.
5. Klicke auf **Hinzufügen**. Die App prüft den Token beim Server und zeigt das Konto anschließend mit Benutzernamen an.

Ein zweites Konto für denselben Server ersetzt das erste. Jede Zeile zeigt Benutzername, Server und gegebenenfalls „über die GitHub CLI“. Das Menü **⋯** bietet **Server öffnen** und **Entfernen** mit Rückfrage. Vorhandene Pull-Request-Verknüpfungen bleiben, ihre Zustände werden danach nicht mehr aktualisiert.

Siehe [Einen Pull Request aus einer Sitzung öffnen](/guide/files-git#open-a-pull-request-from-a-session).

## Frag einen Agenten

- „Mache die App über Tailscale von meinem Smartphone aus erreichbar.“
- „Welche Adresse hat die App in meinem Tailnet? Was könnte den Zugriff vom Smartphone verhindern?“
- „Beende die Bereitstellung der App in meinem Tailnet.“
- „Erstelle einen schreibgeschützten Link zu dieser Sitzung für eine Woche.“
- „Deaktiviere alle Freigabelinks dieser Sitzung.“
- „Welche meiner Rechner sind offline? Versuche die Verbindung erneut.“
- „Benenne gpu-box in Studio GPU um.“
- „Liste die Zugriffstoken externer Agenten auf und widerrufe ‚alter Laptop‘.“
- „Füge mein GitHub-Konto mit der Anmeldung der GitHub CLI hinzu.“
- „Sende meinen Telegram-, Discord- und Slack-Chats Benachrichtigungen aller Sitzungen, nicht nur der dort gestarteten.“
- „Welche Chats sind je Chat-App mit Hydor verknüpft?“
- „Verwende Codex für neue Sitzungen aus meinem Discord-Chat.“
- „Starte neue Sitzungen aus meinem Telegram-Chat mit meinem Agenten Bookkeeper.“
- „Trenne die Verbindung zur Slack-App.“
