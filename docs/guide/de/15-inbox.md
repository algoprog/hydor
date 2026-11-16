# Posteingang und Benachrichtigungen

Agenten arbeiten selbstständig, brauchen aber gelegentlich deine Zustimmung, eine Antwort, ein ausgefülltes Formular, einen Key oder deine Freigabe vor dem Versenden. Der Posteingang sammelt solche offenen Anfragen aus allen Sitzungen und Rechnern. Im Postausgang warten zurückgehaltene Aufrufe auf deine Freigabe. Benachrichtigungen informieren dich, wenn eine Sitzung endet, fehlschlägt oder dich braucht – in der App, am Computer oder auf dem Smartphone, auch bei geschlossener App.

![Der Posteingang: offene Anfragen aus allen Sitzungen](images/inbox.webp)

## Den Posteingang öffnen

Klicke oben in der Seitenleiste neben Hydor auf das Ablagesymbol. Auf dem Smartphone öffnest du zuerst **Menü** (≡); das Symbol steht oben im Seitenmenü. Du kannst auch in der Suche mit Strg+K beziehungsweise ⌘K auf dem Mac nach „Posteingang“ suchen. [Posteingang öffnen](/inbox).

Die Überschrift nennt die Anzahl offener Anfragen, etwa „3 warten auf dich“. Neueste Einträge stehen oben. Die Liste aktualisiert sich, sobald Sitzungen eine Antwort benötigen oder weiterlaufen, und prüft während der Anzeige zusätzlich alle paar Sekunden nach.

Ohne offene Anfragen erscheint „Aktuell wartet nichts auf dich“.

Auch die Startseite zeigt offene Anfragen unter dem Nachrichtenfeld im Bereich **Während du weg warst**, zusammen mit abgeschlossenen und automatisch ausgeführten Aufgaben seit deinem letzten Besuch. Siehe [Während du weg warst](/guide/start#while-you-were-away).

## Was im Posteingang erscheint

Hier findest du offene Anfragen aus allen Sitzungen dieses Computers, auch aus geplanten Aufgaben und App-Läufen, sowie von deinen anderen Rechnern:

- **Freigaben** für Befehle, Dateiänderungen oder Tool-Aufrufe.
- **Fragen** des Agenten und **Pläne**, die auf Zustimmung warten.
- **Formulare** eines Dienstes während der Arbeit, etwa „Notion bittet dich, ein Formular auszufüllen“, oder die Aufforderung, eine Seite zu öffnen.
- **Browseranfragen** wie „Braucht dich im Browser: …“ zum Anmelden oder Abschließen einer Prüfung, „Vor dem Bezahlen oder Bestellen angehalten: …“ oder „Möchte … auf diesem Rechner oder in seinem Netzwerk öffnen“.
- **Angeforderte Keys**, etwa „Fragt nach einem Key: OPENWEATHER_KEY“, einschließlich Begründung.
- **Skill-Vorschläge** wie „Schlägt einen neuen Skill vor: …“ oder „Schlägt eine Änderung am Skill … vor“, mit dem jeweiligen Anlass.
- **Sitzungen, die außerhalb der App warten**, etwa „Wartet in VS Code auf dich“ oder im Terminal.
- **Rückfragen einer App**, deren Lauf einen Schritt **Eine Person fragen** erreicht hat.
- **Kommentare zu geteilten Projekten oder Inhalten**, etwa „Maria hat ‚Abschlussarbeit, Kapitel 3‘ kommentiert“, mit dem Text. Der Eintrag bleibt, bis du oder ein Agent antwortet oder der Kommentar als erledigt markiert ist. **Öffnen** führt zum Dokument, Bild, Video oder Audio.
- **Zurückgehaltene Aufrufe im Postausgang**, etwa ein E-Mail-Versand über ein verbundenes Konto mit der Vorgabe „Vorher fragen“. Diese stehen zuerst unter **Postausgang**.

Jeder Eintrag nennt die Sitzung mit Agentensymbol und die bisherige Wartezeit.

## Freigaben, Fragen und Formulare direkt beantworten

Freigaben, Fragen und Formulare erscheinen als dieselben Karten wie in der Sitzung. Du kannst sie direkt beantworten, ohne das Gespräch zu öffnen. Darüber steht der Sitzungsname als Link. Die oberste Kartenzeile beschreibt Anfrage und Wartezeit.

- **Freigaben** zeigen Befehl, Dateiänderung als Diff oder Tool-Eingaben. Wähle **Erlauben**, eine angebotene dauerhafte Freigabe wie **Alle Änderungen in dieser Sitzung erlauben** oder **Für diese Sitzung erlauben**, oder **Ablehnen**. **Ablehnen…** öffnet zuerst das Feld „Optional: Sag dem Agenten, was er stattdessen tun soll“. Danach bestätigst du mit **Ablehnen**.
- **Pläne** von Claude Code zeigen den Plan mit **Genehmigen, Änderungen automatisch übernehmen**, **Genehmigen, vor Änderungen fragen** und **Weiter planen**.
- **Fragen** bieten eine oder gegebenenfalls mehrere Auswahlmöglichkeiten. Unter **Andere Antwort eingeben** kannst du selbst antworten und eine Datei anhängen. Wähle anschließend **Antworten senden** oder **Überspringen**.
- **Dienstformulare** zeigen Nachricht und Felder des Dienstes. Fülle sie aus und wähle **Senden**, **Ablehnen** oder **Nicht jetzt**. Ohne auszufüllende Felder steht dort **Erlauben** statt **Senden**. **Öffnen** führt eine angeforderte Seite in einem neuen Tab auf.

Nach der Antwort verschwindet der Eintrag und der Agent arbeitet weiter. Die Optionen erklären [Agentenaktionen erlauben oder ablehnen](/guide/sessions#approve-or-deny-what-the-agent-wants-to-do) und [Fragen beantworten und Pläne freigeben](/guide/sessions#answer-questions-and-approve-plans).

## Der Postausgang: Aufrufe zur Freigabe

Ruft ein Agent ein Konto-Tool mit der Einstellung **Vorher fragen** auf, wird die Aktion zunächst zurückgehalten; siehe [Verbundene Apps, Keys und Tools](/guide/connections#ask-first-calls-that-wait-for-your-ok). Oben im Posteingang erscheint unter **Postausgang** eine Karte pro Aufruf, bis du ihn ausführst oder verwirfst. Der Agent wartet dabei nicht: Er erhält sofort die Rückmeldung, dass deine Freigabe aussteht.

Jede Karte zeigt:

- Konto und Tool, etwa „Gmail · send_email“, sowie die Wartezeit;
- **Wartet auf deine Freigabe**, Agentensymbol und Ursprungssitzung als Link sowie gegebenenfalls die geplante Aufgabe;
- die Beschreibung des Tools durch den Dienst;
- die bearbeitbaren Eingaben. Bei E-Mails sind das **An**, **Cc**, **Betreff** und **Nachricht**, bei Chats Ziel und **Text**, bei Beiträgen der **Text**. Andere Tools zeigen ihre eigenen Felder. Pflichtfelder haben einen roten Stern. Mehrere Adressen trennst du durch Kommas.

Danach wählst du:

- **Senden**, um den Aufruf mit den aktuell eingetragenen Werten auszuführen. Hydor übernimmt die Ausführung selbst, auch wenn der Agent längst fertig ist. Die Karte verschwindet und eine Benachrichtigung bestätigt den Versand.
- **Verwerfen**, um den Aufruf endgültig nicht auszuführen.
- **Alle senden** oberhalb mehrerer Karten einer Sitzung, um sie unverändert in der ursprünglichen Reihenfolge auszuführen.

Bei einer Fehlermeldung des Dienstes bleibt die Karte mit **Nicht gesendet:**, Begründung und **Erneut senden** erhalten. Zurückgehaltene Aufrufe überstehen Neustarts und werden 30 Tage aufbewahrt.

In der Sitzung markiert **Wartet im Postausgang auf deine Freigabe** mit **Postausgang öffnen** die Stelle des Aufrufs. Nach deiner Entscheidung steht dort **Mit deiner Freigabe gesendet** mit dem Beginn der Dienstantwort oder **Verworfen: nicht gesendet**. Bei deiner nächsten Nachricht erfährt der Agent, was mit seinen Aufrufen passiert ist.

Ein zurückgehaltener Aufruf benachrichtigt dich wie eine Freigabe in der App, am Computer und am Smartphone: „Wartet im Postausgang auf deine Freigabe: …“. Tippe darauf, um den Entwurf zu lesen, zu bearbeiten und auch vom Smartphone aus zu senden.

## Weitere Anfragen am richtigen Ort öffnen

Andere Anfragen beantwortest du dort, wo sie entstanden sind. Jeder Eintrag zeigt Symbol, Anfrage, Details, Sitzung und Zeitpunkt. **Öffnen** führt zum passenden Ort:

- **Browseranfragen** öffnen die Sitzung. Über dem Nachrichtenfeld erscheint der Browser zur Übernahme; siehe [Suche und Browser](/guide/web).
- **Keys oder Anmeldungen** öffnen die entsprechende Karte in der Sitzung; siehe [Verbundene Apps, Keys und Tools](/guide/connections).
- **Skill-Vorschläge** öffnen die Karte zur Bestätigung oder Ablehnung, bei nicht mehr vorhandener Sitzung stattdessen **Einstellungen → Skill-Bibliothek**; siehe [Skills](/guide/skills).
- **In VS Code oder im Terminal wartende Sitzungen** öffnen sich hier zur Ansicht. Die Antwort gibst du im ursprünglichen Programm.
- **App-Rückfragen** öffnen den Lauf mit **Ja**, **Nein** oder einem Formular mit **Antwort senden**; siehe [Apps](/guide/apps#apps-with-steps).

## Offene Anfragen auf anderen Rechnern

Hast du weitere Hydor-Rechner hinzugefügt, fragt der Posteingang alle erreichbaren Rechner ab und zeigt auch ihre offenen Anfragen; siehe [Mehrere Rechner in einer App nutzen](/guide/devices#use-other-machines-from-one-app). Die Liste ist nach Rechnernamen gruppiert. **Aktuell angezeigt** markiert den gerade geöffneten Rechner. Freigaben, Fragen und Formulare anderer Rechner beantwortest du hier genauso wie lokale.

Kann ein Rechner seine Liste nicht liefern, etwa wegen einer älteren Version, erscheint stattdessen eine Zeile wie „Dort warten 2 Sitzungen auf dich“. **Öffnen** wechselt zu diesem Rechner.

## Die Zahl am Posteingangssymbol

Eine kleine Zahl am Symbol zählt Sitzungen mit offenen Freigaben oder Fragen auf diesem und allen erreichbaren anderen Rechnern. Über 99 erscheint **99+**. Beim Darüberfahren steht etwa „Posteingang: 3 warten auf dich“.

Gezählt werden Sitzungen, keine einzelnen Anfragen. Zwei Freigaben in einer Sitzung zählen einmal. Jeder zurückgehaltene Aufruf im Postausgang zählt zusätzlich einzeln. Key-Anfragen, Browseranfragen und Skill-Vorschläge erhöhen die Zahl nicht.

## Die Zahl im Browser-Tab

Warten Sitzungen des aktuell angezeigten Rechners auf Freigaben oder Antworten, beginnt der Tab-Titel mit ihrer Anzahl, etwa „(2) Hydor“. So siehst du offene Anfragen auch aus anderen Tabs.

## Wie die App dich benachrichtigt

Beendet sich eine Sitzung, schlägt sie fehl oder benötigt sie dich, passt die App die Benachrichtigung an deine aktuelle Situation an:

- **Die App ist sichtbar**: Unten erscheint kurz eine Karte, am Computer unten rechts. Sie zeigt Agentensymbol und farbigen Punkt – grün für abgeschlossen, gelb für Rückfragen, rot für Fehler –, Sitzungsname, Status und Anfang der Antwort. Ein Klick öffnet die Sitzung, ✕ schließt die Karte. Nach wenigen Sekunden verschwindet sie, bleibt aber beim Darüberfahren sichtbar. Eine neue Nachricht derselben Sitzung ersetzt die alte Karte.
- **Die App ist in einem anderen Tab geöffnet**: Nach Aktivierung von **Dieses Gerät benachrichtigen** erscheint eine Systembenachrichtigung.
- **Die App ist geschlossen oder das Smartphone gesperrt**: Nach Aktivierung von **Dieses Gerät benachrichtigen** auf diesem Gerät erhältst du eine Push-Nachricht.
- **Desktop-App für Mac, Windows oder Linux**: Solange die App läuft, erscheinen native Systembenachrichtigungen, auch bei verdecktem oder geschlossenem Fenster oder nach einem Start bei der Anmeldung ohne Fenster. Die App bleibt dann in Menüleiste, Infobereich oder Systemablage aktiv. Ein Klick öffnet die Sitzung. Neue Nachrichten derselben Sitzung ersetzen frühere. Karten im Fenster erscheinen nur, wenn das System die App-Benachrichtigungen nicht anzeigt. Ist das Fenster geschlossen, verborgen, minimiert oder im Hintergrund, zählt auch das App-Symbol Sitzungen mit neuen Nachrichten jeweils einmal: im Mac-Dock, auf der Windows-Taskleiste bei geöffnetem Fenster und in unterstützten Linux-Startern wie Ubuntu-Dock oder KDE. Bei geschlossenem Windows-Fenster im Infobereich gibt es keinen Taskleistenknopf. Die Zahl erscheint auch bei „Nicht stören“ oder einem Fokus und verschwindet, sobald du das Fenster in den Vordergrund holst. Auf dem Mac muss **Systemeinstellungen → Mitteilungen → Hydor → Kennzeichensymbol für App** erlaubt sein. Nach Erlaubnis der Mitteilungen ist das standardmäßig aktiv.

Zur gerade betrachteten Sitzung erhältst du keine Nachricht. Eine zurückgestellte Sitzung erscheint sofort wieder, wenn sie dich benötigt. Im Freisprechmodus sagt die App außerdem an, wenn die verfolgte Sitzung endet oder dich braucht; siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice).

## Was Benachrichtigungen enthalten

Der Titel ist der gegebenenfalls gekürzte Sitzungsname. Der Text beschreibt das Ereignis:

- **Abgeschlossen** mit dem Anfang der letzten Agentenantwort. Das erscheint erst nach Durchläufen ab zehn Sekunden, damit kurze Gespräche ruhig bleiben.
- Bei Rückfragen die benötigte Aktion:
  - bei einfachen Ja-Nein-Freigaben der Vorgang mit erster Zeile, etwa „Befehl ausführen: npm test“;
  - sonst „Benötigt deine Freigabe“ oder „Hat eine Frage an dich“;
  - bei Browseranfragen etwa „Braucht dich im Browser: …“, „Vor dem Bezahlen angehalten: …“, „Möchte … öffnen“ oder „Die Seite fragt: …“;
  - bei VS-Code- oder Terminalsitzungen „Wartet in VS Code auf dich“, erst nach einer Minute, da du wahrscheinlich bereits dort arbeitest;
  - bei zurückgehaltenen Aufrufen „Wartet im Postausgang auf deine Freigabe:“ mit Konto, Tool und Empfänger. Antippen öffnet den Posteingang.
- **Fehlgeschlagen** mit dem Fehler.

Bei Zielen heißt es „Ziel erreicht: …“ oder beim Anhalten „Das Ziel braucht dich: …“ beziehungsweise „Ziel pausiert: …“; siehe [Der Sitzung ein Ziel geben](/guide/sessions#give-the-session-a-goal).

Geplante Aufgaben melden das Ergebnis mit einer vom Agenten formulierten Zeile. Ohne neue Erkenntnisse bleiben sie still, Fehler werden immer gemeldet. Blockierte Läufe zeigen „Blockiert: …“. Wird eine Aufgabe nach mehreren Fehlern pausiert, nennt die Nachricht das ebenfalls; siehe [Geplante Aufgaben](/guide/tasks).

Nachrichten anderer Rechner werden über diesen Rechner zugestellt. Ihr Text beginnt mit dem Rechnernamen; die Karte in der App nennt ebenfalls den Ausführungsrechner.

## Benachrichtigungen für dieses Gerät aktivieren

Unter [Einstellungen → App → Benachrichtigungen](/settings?s=notifications) enthält die Gruppe **Dieses Gerät** zwei geräte- beziehungsweise browserspezifische Schalter und einen Test:

- [**Dieses Gerät benachrichtigen**](/settings?s=notifications&find=Notify%20this%20device): informiert bei Abschluss, Fehlern und Rückfragen auch bei geschlossener App. Der Browser fragt einmal nach deiner Erlaubnis. Smartphone und Computer richtest du getrennt ein. In Desktop-Apps ist die Funktion immer aktiv, solange die App läuft, auch bei geschlossenem Fenster. macOS fragt einmal nach der Erlaubnis; anschließend steuerst du die Anzeige unter **Systemeinstellungen → Mitteilungen → Hydor**. Blockiert das System Benachrichtigungen, weist die Zeile darauf hin und die App zeigt vorübergehend interne Karten. Das **(i)** nennt den passenden Einstellungsort, unter Windows **Einstellungen → System → Benachrichtigungen**. Aktivierst du den Schalter, öffnen sich die Systemeinstellungen. Nach der Rückkehr bestätigt eine Testnachricht die Funktion.
- [**Ton**](/settings?s=notifications&find=Sound): spielt bei geöffneter App einen kurzen Ton, aufsteigend bei Abschluss, absteigend bei Rückfragen oder Fehlern. Die Funktion ist zunächst aus; beim Einschalten hörst du eine Vorschau. In Desktop-Apps gilt der Ton nur für interne Karten, Systembenachrichtigungen verwenden ihren eigenen Ton.
- [**Test senden**](/settings?s=notifications&find=Send%20a%20test) in der Zeile **Ausprobieren** erscheint nach Aktivierung der Gerätebenachrichtigung. Der Test sendet an alle aktivierten Geräte „Benachrichtigungen funktionieren auf diesem Gerät“. Wechsle aus der App, um ihn zu sehen. Eine Meldung nennt die Anzahl erreichter Geräte oder „Kein Gerät hat die Nachricht erhalten“. In Desktop-Apps ist **Ausprobieren** sofort sichtbar und zeigt den Test auch bei aktivem Fenster. Bleibt die Systemnachricht aus, erscheint „Die Benachrichtigung wurde nicht angezeigt. Erlaube Hydor-Benachrichtigungen in den Systemeinstellungen.“

Auf dem Smartphone:

1. Öffne die App auf dem Smartphone über HTTPS. [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone) richtet den privaten Zugang über Tailscale ein. Der QR-Code öffnet die App auf dem Smartphone direkt bei den folgenden Einrichtungsschritten; siehe [Mit Tailscale auf dem Smartphone nutzen](/guide/devices#use-it-on-your-phone-with-tailscale).
2. Auf iPhone oder iPad füge sie zuerst über **Teilen → Zum Home-Bildschirm** hinzu und öffne sie von dort. Vorher erklärt die Einstellung diese Voraussetzung und bleibt deaktiviert.
3. Aktiviere **Einstellungen → App → Benachrichtigungen → Dieses Gerät benachrichtigen** und erlaube die angefragten Mitteilungen.
4. Tippe auf **Test senden** und verlasse die App, um den Eingang zu prüfen.

Steht dort „In den Browsereinstellungen für diese Website blockiert“, erlaube Benachrichtigungen zuerst für die App-Adresse im Browser. „Dieser Browser kann hier keine Benachrichtigungen empfangen“ bedeutet oft, dass du die App über HTTP statt HTTPS geöffnet hast.

Ist der Schalter später wieder aus, hat der Push-Dienst des Browsers die Registrierung entfernt. Aktiviere ihn erneut. Für ausgeschaltete oder nicht erreichbare Smartphones wartet eine Nachricht bis zu einem Tag. Neuere Nachrichten derselben Sitzung ersetzen ältere auf dem Gerät.

Zum Abschalten deaktiviere **Dieses Gerät benachrichtigen** auf dem betreffenden Gerät.

## Direkt in der Benachrichtigung erlauben oder ablehnen

Bei einfachen Ja-Nein-Freigaben für Befehle, Dateiänderungen oder Tools enthält die Nachricht die beiden Kartenaktionen, etwa **Erlauben** und **Ablehnen**, sofern der Browser solche Schaltflächen unterstützt. Fragen, Formulare und Pläne zählen nicht dazu.

- Tippe auf eine Aktion, um ohne Öffnen der App zu antworten. Eine leise Nachricht bestätigt beispielsweise „Erlauben: Befehl ausführen“.
- Scheitert die Antwort, etwa wegen abgelaufener Anmeldung oder einer bereits anderswo beantworteten Anfrage, öffnet sich die Sitzung zur Bearbeitung.
- Ein Tipp auf die Nachricht selbst öffnet die Sitzung, möglichst in einem bereits geöffneten App-Fenster.
- Desktop-Benachrichtigungen haben keine Aktionsschaltflächen. Öffne die Sitzung per Klick und antworte dort.
- Auch zurückgehaltene Postausgangsaufrufe haben keine Schaltflächen. Öffne zuerst den Posteingang, prüfe den Inhalt und sende ihn dort.

Freigaben anderer Rechner lassen sich genauso beantworten. Deine Antwort wird über diesen Rechner dorthin weitergegeben.

## Frag einen Agenten

Agenten können offene Anfragen lesen und Testbenachrichtigungen senden. Freigaben anderer Sitzungen dürfen sie nicht an deiner Stelle beantworten. Beispiele:

- „Was wartet gerade auf mich? Das Dringendste zuerst.“
- „Welche Sitzungen fragen nach einem Key und wofür?“
- „Was liegt im Postausgang? Lies mir die E-Mails vor, bevor ich sie sende.“
- „Fasse in jeweils einer Zeile zusammen, was die wartenden Sitzungen von mir brauchen.“
- „Sende eine Testbenachrichtigung, damit ich den Empfang auf dem Smartphone prüfen kann.“
