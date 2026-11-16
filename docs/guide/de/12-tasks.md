# Geplante Aufgaben

Eine geplante Aufgabe startet Agentenarbeit automatisch: zu einer Uhrzeit, alle paar Minuten oder Stunden, einmalig, durch einen Webhook, bei beobachteten Änderungen, neuen E-Mails oder neuen Einträgen in verbundenen Apps oder vor Terminen im Kalender. So erhältst du etwa einen Morgenüberblick, Erinnerungen, Preis- und Seitenmeldungen, Wochenberichte, Rechnungsverarbeitung, erste Antworten auf neue Interessenten, Gesprächsvorbereitungen, Pull-Request-Reviews oder Analysen fehlgeschlagener CI-Läufe, ohne selbst eine Sitzung zu starten.

![Einstellungen → Geplante Aufgaben: automatisch gestartete Arbeit](images/tasks.webp)

## Was eine geplante Aufgabe ist

Eine geplante Aufgabe verbindet einen Prompt mit einem Auslöser. Jedes Auslösen startet einen Lauf: eine neue Sitzung mit Agent, Modell und Ordner der Aufgabe und dem Prompt als erster Nachricht. Alternativ kann der Prompt in eine bestehende Sitzung eingefügt werden. Der Agent arbeitet wie in jeder anderen Sitzung und meldet am Ende das Ergebnis in einer Zeile. Der Verlauf speichert diese Zusammenfassung, Kosten und Sitzungslink.

Mögliche Auslöser:

- **Zu einer Uhrzeit**: an gewählten Wochentagen oder über einen Cron-Ausdruck.
- **Wiederholt**: alle festgelegten Minuten, mindestens fünf, oder Stunden.
- **Einmalig**: zu Datum und Uhrzeit.
- **Überwachen**: Änderungen an Feeds, Webseiten, JSON-Werten, Ordnern oder Befehlsausgaben, neue E-Mails oder neue Einträge in verbundenen Apps wie Deals, Dateien, Tickets und Zahlungen. Auch ein festgelegter Abstand vor Kalenderterminen ist möglich. Die Prüfung arbeitet ohne Modell und verbraucht keine Token; erst eine Änderung startet den Agenten.
- **Webhook**: Ein Dienst wie GitHub, Gitea, ein Formular oder dein Skript ruft die eigene Adresse der Aufgabe auf.

Statt eines Prompts kann eine Aufgabe eine deiner Apps mit hinterlegten Eingaben ausführen. Der Verlauf verlinkt dann zum App-Lauf; siehe [Eine App automatisch ausführen](/guide/apps#run-an-app-by-itself).

Zeiten richten sich nach deiner Browserzeitzone. Verpasste Läufe, etwa bei ausgeschaltetem oder schlafendem Computer oder geschlossener App, werden bei nächster Gelegenheit nachgeholt.

Du findest Aufgaben unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks), innerhalb **Einstellungen → Agenten**. Auch die Suche mit Strg+K beziehungsweise ⌘K findet Aufgaben nach Namen. Es gibt fünf Wege zum Erstellen:

- **Neue Aufgabe** für die vollständige manuelle Einrichtung.
- **Mit einem Beispiel beginnen** für häufige Anwendungsfälle.
- Einen Agenten bitten, etwa „Erinnere mich Freitag um 9“. Du bestätigst seinen Vorschlag auf einer Karte.
- **Als Automatisierung einrichten** im Sitzungsmenü erstellt einen Entwurf aus einer erfolgreichen Sitzung.
- **Zeitplan hinzufügen** unter **Läufe** einer App richtet deren automatische Ausführung ein.

Das automatische Fortsetzen nach einem Nutzungslimit ist eine separate Einstellung: [Einstellungen → Allgemein → Nach Nutzungslimits fortsetzen](/settings?s=general&find=Resume%20after%20usage%20limits); siehe [Nutzung, Limits und Kosten](/guide/usage).

## Deine geplanten Aufgaben ansehen

Unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks) zeigt **Deine Aufgaben** die Zeitzone und Aufgaben, älteste zuerst. Das (i) erklärt das Nachholen verpasster Läufe. Die Liste aktualisiert sich bei Starts und Abschlüssen. **Wochenansicht** neben **Neue Aufgabe** öffnet den Kalender; siehe [Wochenübersicht: bisherige und kommende Läufe](#see-the-week-what-ran-and-what-runs-next). Jede Zeile zeigt:

- Auslösersymbol, etwa Kalender, Auge oder Webhook, Aufgabenname und Agentensymbol.
- Zeitplan und Ort, etwa „Werktags um 09:00 · neue Sitzung in reports · nächster Lauf in 14 Std. 20 Min.“, oder den Hinweis auf eine bestehende Sitzung.
- Bei Überwachungen die letzte Prüfung, etwa „Vor 5 Min. geprüft: 12 Einträge, 2 neu“, bei Fehlern gelb.
- Bei automatischer Pause den Grund mit „Zum erneuten Versuch aktivieren“.
- Bis zu sechs Ergebnisdots, älteste zuerst: grün für abgeschlossen, gelb für teilweise erledigt oder blockiert, rot für fehlgeschlagen oder Fehler, grau für nichts Neues. Daneben stehen **Verlauf**, der letzte Lauf mit möglichem Startfehler und **Öffnen** für dessen Sitzung.
- Bei Webhooks die Adresse mit Kopierknopf und gegebenenfalls dem Zielort im auslösenden Dienst.

Rechts stehen Aktivierungsschalter und Menü (⋯) mit **Jetzt ausführen**, **Ohne Versand testen**, **Bearbeiten**, **Verlauf**, **Duplizieren**, bei Webhooks **Neue Adresse**, und **Löschen**.

Auch eine Board-Karte, die sich automatisch aktuell hält, steht in der Liste, dem Board zugeordnet, etwa „Geschäft · Umsatz nach Tagen: aktualisieren“. Ihre Zeile enthält den Schalter, **Jetzt aktualisieren** und **Board öffnen**. Letzteres öffnet ihre Einstellungen auf dem Board: Frage, Zeitplan und Modellstufe änderst du dort. **Aktualisierung beenden**, das Entfernen der Karte oder das Löschen des Boards entfernt den Eintrag aus dieser Liste. Siehe [Karten aktuell halten](/guide/library#keep-cards-up-to-date).

Ohne Aufgaben erscheint der Hinweis, ein Beispiel zu wählen oder einen Agenten um die Einrichtung zu bitten.

## Wochenübersicht: bisherige und kommende Läufe

Unter [Agenten → Zeitpläne](/agents/schedules) im Tab **Zeitpläne** siehst du alles, was automatisch läuft. **Wochenansicht** in den Aufgabeneinstellungen und die Suche öffnen denselben Bereich. Er vereint geplante Aufgaben, Agentenzeitpläne, App-Zeitpläne einschließlich **Automatisch aktualisieren**, automatisch aktualisierte Board-Karten, Überwachungen und Webhooks. So erkennst du kommende Aufgaben, gleichzeitige Starts und vergangene Ergebnisse.

- **Woche**: Montag bis Sonntag stehen nebeneinander, Stunden am Rand, heute hervorgehoben und die aktuelle Uhrzeit als Linie. Ausgeführte Läufe erscheinen als Blöcke: grün **Abgeschlossen**, grau **Nichts Neues**, gelb **Braucht dich** bei teilweiser Erledigung oder Blockade, rot **Fehlgeschlagen** oder Fehler. Kommende Läufe sind blass und gestrichelt. Starten mehr als drei gleichzeitig, stehen zwei sichtbar neben einem Sammelblock wie **+2**.
- **Tagesspalten** nennen Kosten und Fehleranzahl.
- **Häufige Wiederholungen, Überwachungen und Webhooks** erscheinen oberhalb der Stunden in einem Band pro Aufgabe. Das gilt für Aufgaben mit mehr als acht Läufen täglich sowie für alle Überwachungen und Webhooks. Pro Tag siehst du Ergebnisverteilung, Anzahl und etwa **+48** kommende Läufe. Ein Klick auf die Zeile klappt das Band ein.
- **Ein Laufblock** öffnet Ergebnis, Zeitpunkt, Dauer, Kosten, gegebenenfalls anderen Auslöser, Agentenzusammenfassung, **Sitzung öffnen** oder bei Apps **Lauf öffnen** und **Bearbeiten**. Kommende Läufe zeigen Termin und Bearbeitung. Ein Tagesfeld im Band zählt Ergebnisse und bietet **Letzten öffnen**, sofern eine Sitzung existiert.
- **‹** und **›** wechseln Wochen, **Heute** kehrt zurück. **Woche** und **Monat** wechseln zur Monatsansicht mit Tagesbalken, Anzahl der Läufe, Fehler, bevorstehenden Ausführungen und Kosten. Häufige Wiederholungen stehen etwa als **+48 Wiederholungen**. Ein Klick öffnet die Woche des Tages.
- Die Zeile über dem Kalender summiert Ausführungen, Fehler, Kosten und kommende Läufe und erklärt Farben und Zeitzone.
- Filter wie **Alle**, **Aufgaben**, **Agenten**, **Apps**, **Boards**, **Überwachungen**, **Webhooks** und **Pausiert** mit Anzahl begrenzen Kalender, Summen und Liste.

Unter dem Kalender steht **Alles, was automatisch läuft**: zuerst nächste Termine, dann Überwachungen und Webhooks, danach Pausiertes. Jede Zeile zeigt Name, Zugehörigkeit zu Agent, App, Board oder Aufgabe, Zeitplan, nächsten Termin, Pausengrund, Ergebnisdots, letzten Lauf, Zusammenfassung und **Öffnen**. Der Schalter pausiert oder aktiviert. Der Stift öffnet den passenden Bearbeitungsort: Agentenseite, **Läufe** der App oder bei automatischer Aktualisierung deren **Einstellungen**, bei Board-Karten **Aktuell halten…** auf ihrem Board ([Karten aktuell halten](/guide/library#keep-cards-up-to-date)) und für andere Aufgaben das Aufgabenformular.

Alle Zeiten sind lokal. Auf Smartphones zeigt die Ansicht jeweils einen Tag; **‹**, **›** oder seitliches Wischen wechseln den Tag.

## Eine neue Aufgabe erstellen

1. Öffne [Einstellungen → Geplante Aufgaben](/settings?s=tasks) und [**Neue Aufgabe**](/settings?s=tasks&find=New%20task) neben dem Titel. Das Formular **Neue geplante Aufgabe** erscheint.
2. Gib Namen, Agent, Ordner und Prompt an.
3. Wähle unter **Wann** den Auslöser.
4. Lege unter **Jeder Lauf** Ziel und Grenzen fest.
5. Mit **Testlauf** kannst du die Aufgabe ohne Speichern erproben; siehe [Eine Aufgabe testen](/guide/tasks#try-a-task-with-a-test-run).
6. Wähle **Aufgabe erstellen**.

Erstellen und Testen sind erst mit Namen und Prompt möglich. Neue Aufgaben starten standardmäßig werktags um 09:00 mit dem zuletzt auf der Startseite gewählten Agenten im Standardordner der App, meist deinem persönlichen Ordner.

### Name, Agent und Ordner

- **Name**, etwa „Morgendliche CI-Zusammenfassung“: erscheint in Liste, Benachrichtigungen und Sitzungstiteln wie „Morgenüberblick · 3. Nov., 07:30“. Maximal 120 Zeichen.
- **Agent**: Claude Code, Codex, Custom oder ein hinzugefügter Agent; siehe [Agenten, Konten und Modelle](/guide/agents-models). Ein Wechsel leert Modell und Denkaufwand und setzt die üblichen Berechtigungen des Agenten.
- **Ordner**: Gib einen vorhandenen Pfad ein oder wähle ihn aus und bestätige mit **Diesen Ordner verwenden**.

### Modell, Denkaufwand, Berechtigungen und weitere Optionen

Darunter stehen die Auswahlelemente der Startseite:

- **Modell** und **Denkaufwand** verwenden ohne eigene Auswahl die Agentenstandards.
- **Berechtigungen** bestimmen den Handlungsspielraum. Neue Aufgaben verwenden **Nachfragen** bei Claude Code, **Auto** bei Codex und **Auto** bei Custom: Routinearbeiten laufen, riskante Aktionen fragen nach. Benötigt ein unbeaufsichtigter Lauf Zustimmung, wartet sie in Sitzung und [Posteingang](/guide/inbox).
- **Agent**, **Memory**, sofern aktiv, **Ausgabenlimit**, **Swarm** und **Research** gelten für jede neue Laufsitzung wie auf der Startseite; siehe [Sitzungen](/guide/sessions), [Agenten](/guide/agents) und [Memory](/guide/memory). Eine Aufgabe mit einem deiner Agenten erscheint auch in dessen Zeitplänen, nutzt seine Modellstufe und zählt zum Monatsbudget. Fehlerhafte oder mit Fehler gestoppte Läufe werden eine Stufe höher bis Best wiederholt, außer **Bei fehlgeschlagener Prüfung hochstufen** ist deaktiviert. Bei Agenten mit eigenem dauerhaftem Gespräch wird dort weitergeschrieben statt eine neue Sitzung zu starten.

### Der Prompt

Schreibe die Aufgabe vollständig auf. Ein neuer Lauf kennt das Gespräch nicht, aus dem die Idee stammt. Der Prompt darf bis zu 50.000 Zeichen enthalten.

Die erste Nachricht ergänzt Namen, Zeitplan, Auslöser, aktuelle Uhrzeit, Bitte um Ergebnisbericht und Notizen früherer Läufe. In der Sitzung erscheint das kompakt als „Geplante Aufgabe Morgenüberblick · Werktags um 07:30“. Ein Klick zeigt Prompt und die **Von der App für diesen Lauf ergänzten Angaben**.

### Wann die Aufgabe läuft

**Wann** bietet **Zu einer Uhrzeit**, **Wiederholt**, **Einmalig**, **Überwachen** und **Webhook**. Für die ersten drei zeigt „Nächste Läufe: …“ bis zu drei Termine in deiner Zeitzone.

- **Zu einer Uhrzeit**: Uhrzeit und Wochentage. Ein Klick schaltet einen Tag um; mindestens einer bleibt aktiv. Alle sieben bedeuten täglich.
- **Cron-Ausdruck…** unter der Uhrzeit wandelt die Auswahl in einen bearbeitbaren Standardausdruck um. **Stattdessen eine Uhrzeit** wechselt zurück. Die fünf Felder stehen für Minute, Stunde, Monatstag, Monat und Wochentag, 0 oder 7 für Sonntag. `*/15 9-17 * * 1-5` läuft werktags alle 15 Minuten von 09:00 bis 17:45. Monats- und Tagesnamen wie `jan`, `mon` sowie `@hourly`, `@daily`, `@weekly`, `@monthly` und `@yearly` funktionieren ebenfalls. Ungültige Ausdrücke werden beim Speichern mit Begründung abgewiesen.
- **Wiederholt**: alle angegebenen Minuten oder Stunden, mindestens fünf Minuten. Neue Wiederholungen laufen stündlich; der erste Lauf startet ein Intervall nach dem Speichern.
- **Einmalig**: Datum und Uhrzeit, zunächst in einer Stunde. Danach deaktiviert sich die Aufgabe, bleibt aber zum erneuten Ausführen oder Löschen in der Liste.
- **Überwachen**: siehe [Änderungen überwachen](/guide/tasks#watch-for-a-change).
- **Webhook**: siehe [Läufe per Webhook starten](/guide/tasks#start-runs-from-another-service-with-a-webhook).

Desktop-Apps verhindern automatischen Ruhezustand kurz vor einem Termin und während des Laufs; siehe [Den Computer wach halten](/guide/app#keep-the-computer-awake). Reine Überwachungsprüfungen halten ihn nicht wach. Ein geschlossener Laptopdeckel versetzt ihn weiterhin in den Ruhezustand. Verpasste Aufgaben laufen nach dem Aufwachen. Für zeitkritische Aufgaben nutze einen dauerhaft eingeschalteten Rechner.

### Jeder Lauf

- **Startet eine neue Sitzung**, der Standard, oder **Schreibt in:** eine der 40 neuesten nicht archivierten Sitzungen desselben Agenten. Bestehende Sitzungen behalten Modell und Einstellungen. Bei beschäftigtem Agenten wartet die Nachricht bis zum Durchlaufende. Nur der eigene Anteil zählt zu den Laufkosten.
- **Stoppt oberhalb von $** begrenzt den einzelnen Lauf zu API-Preisen, geprüft nach jedem Modellaufruf. Leer bedeutet unbegrenzt. Es ist dasselbe Ausgabenlimit wie oben und gilt für neue Sitzungen.
- **Nach [3] Fehlern in Folge pausieren** stoppt weitere automatische Läufe mit Begründung. 0 deaktiviert diese Pause; maximal 50.

Darunter steht sinngemäß: Ein Lauf meldet sein Ergebnis; ohne neue Informationen bleibt er still, Fehler werden immer gemeldet.

## Änderungen überwachen

Eine Überwachung prüft regelmäßig ohne Modell und startet den Agenten nur bei Änderungen. Wähle **Überwachen** unter **Wann** und dann eine Quelle:

- **Feed**: die **Adresse** eines RSS- oder Atom-Feeds mit neuen Beiträgen einer Website, eines Blogs oder Code-Hosters. Neue Einträge wecken den Agenten mit Titel, Link, Datum und Zusammenfassung, höchstens 25 gleichzeitig.
- **Seite**: eine Webadresse und der relevante **Bereich**:
  - **Ganze Seite** berücksichtigt Änderungen am lesbaren Text.
  - **Nahe einem Text** berücksichtigt Zeilen mit dem Suchtext und jeweils eine Nachbarzeile davor und danach, etwa rund um „Preis“.
  - **Selektor** wählt über einfache CSS-Selektoren einen Bereich: Tag, `#id`, `.class` oder `[attribute=value]`, kombiniert oder verschachtelt wie `main .price`.

  Der Lauf erhält neue und entfernte Zeilen. Seitenskripte werden nicht ausgeführt. Prüfe deshalb mit **Testen**, ob die Überwachung den gewünschten Inhalt sieht.
- **JSON**: die **Adresse** einer API-Antwort und **Wert unter** einem Pfad wie `data.price` oder `data.items[0].price`. Der Agent startet, wenn sich der Wert ändert, einem Vergleichswert entspricht oder nicht entspricht, darüber oder darunter liegt oder ihn enthält. Zahlen werden numerisch verglichen. Eine Bedingung startet den Agenten beim Eintreten, nicht bei jeder weiteren Prüfung.
- **Ordner**: ein lokaler Ordner mit optionalem Dateimuster wie `*.pdf` unter **Nur passende Dateien**. `*` steht für beliebigen Text, `?` für ein Zeichen. Neue Dateien werden mit Namen, Größen und Datum übergeben. Versteckte Dateien und Unterordner bleiben unberücksichtigt.
- **Befehl**: läuft bei jeder Prüfung mit deiner Shell im Aufgabenordner für höchstens eine Minute. Wähle **Bei geänderter Ausgabe** oder **Bei geändertem Exit-Code**. Exit-Code 0 bedeutet gewöhnlich Erfolg. Der Lauf erhält Ausgabe und Unterschiede.
- **E-Mail**: neue Nachrichten eines [verbundenen E-Mail-Kontos](/guide/connections#connect-your-email). Wähle **Konto** und **Ordner**, standardmäßig Posteingang, sowie optional **Absender enthält**, **Betreff enthält** oder **Nur ungelesene Nachrichten**. Jede neue E-Mail startet einen eigenen Lauf, maximal zehn pro Prüfung, mit Absender, Empfängern, Datum, Betreff und Text als externen Daten. Anhänge landen unter email-attachments im Aufgabenordner. Bei mehr als zehn neuen Nachrichten starten die neuesten zehn; der erste Lauf nennt die älteren in einer Zusammenfassung. Auch nach Neustarts löst dieselbe E-Mail keinen zweiten Lauf aus.
- **Verbundene App**: neue Deals, Kontakte, Dateien, Tickets, Zahlungen oder andere Einträge aus [verbundenen Apps](/guide/connections). Wähle **Konto** und ein aktiviertes lesendes Listen- oder Such-**Tool**. Sendende, ändernde, löschende oder zahlende Tools werden nicht angeboten. **Vorlage wählen** bietet etwa **Neue Dateien**, **Neue Kontakte**, **Neue Deals**, **Neue Tickets** und **Neue Zahlungen**, wählt ein passendes Konto-Tool und füllt Felder vor. Passe sie bei Bedarf an. `{{now}}` steht für den Prüfzeitpunkt, `{{now+2d}}` für zwei Tage später; auch `{{today}}` und `{{tomorrow}}` sind möglich. **Ausprobieren** ruft das Tool einmal auf und zeigt Eintragsliste unter **Einträge befinden sich in**, eindeutiges Feld unter **Unterschieden anhand von**, erste Einträge und vollständige **Antwort**. Korrigiere Liste oder Identifikationsfeld bei Bedarf. Jeder neue Eintrag startet höchstens einmal einen Lauf, maximal zehn pro Prüfung, als externe Daten. Weitere Einträge werden im ersten Lauf genannt. Bitte das Tool über seine Felder möglichst um die neuesten Einträge zuerst und eine ausreichende Anzahl.
  - **Vor jedem Termin**: Bei Kalendern wird nicht jeder neue Eintrag verarbeitet, sondern ein Lauf **15 Min.**, **30 Min.**, **1 Stunde** vorher oder **Am Vorabend** zu einer gewählten Uhrzeit gestartet. Optional gelten **Titel enthält** oder **Nur Termine mit anderen Personen**. Verwende ein Tool zum Auflisten kommender Termine mit etwa `{{now}}` bis `{{now+2d}}`. Nach **Ausprobieren** wählst du das Feld **Startzeit in**. Termine werden bei jeder Prüfung und nochmals zum jeweiligen Auslösezeitpunkt gelesen. Verschobene Termine werden zum neuen Zeitpunkt berücksichtigt, abgesagte nicht.

Anschließend:

- **Alle [Zahl] Minuten prüfen** legt ein Intervall von einer Minute bis einer Woche fest, standardmäßig 15 Minuten.
- **Adressen auf diesem Computer oder in seinem Netzwerk erlauben** gilt für Feeds, Seiten und JSON und ist standardmäßig aus. Nur du kannst dies im Formular freigeben. Vom Agenten vorgeschlagene Überwachungen erreichen dein eigenes Netzwerk nie.
- **Testen** zeigt den aktuellen Stand, etwa „12 Einträge, erste Prüfung“, eine Inhaltsprobe oder den Fehler.

Dabei gilt:

- Die erste Prüfung nach dem Speichern erfasst nur den Ausgangszustand. Erst spätere Änderungen starten den Agenten. Eine geänderte Quelle setzt den Ausgangszustand neu.
- Gelesene Inhalte sind ausdrücklich externe Arbeitsdaten, keine Anweisungen.
- Änderungen während eines noch laufenden vorherigen Laufs warten auf die nächste Prüfung. Neue E-Mails, App-Einträge und Kalendertermine sind ausgenommen und starten eigene Läufe.
- Scheitert eine Prüfung, etwa wegen Ausfall, fehlendem Seitentext, abgemeldetem Konto oder geänderter Antwortstruktur, meldet die Zeile den Fehler und startet keinen Lauf aus ungelesenen Daten. Nach der eingestellten Anzahl aufeinanderfolgender Fehler pausiert die Aufgabe mit Begründung.
- **Jetzt ausführen** übergibt den aktuellen Stand statt einer Änderung.

## Läufe per Webhook starten

Ein Webhook ist eine Adresse, die ein Dienst bei einem Ereignis aufruft, etwa bei einem Pull Request, einer Formularantwort oder aus deinem Skript. Wähle **Webhook** unter **Wann** und speichere die Aufgabe. Danach erscheint die kopierbare Adresse in ihrer Zeile. Sie funktioniert ohne Anmeldung, weil ihr geheimer Bestandteil den Zugriff erlaubt. Halte sie privat und bevorzuge Berechtigungen mit Rückfrage vor Änderungen. Der Dienst muss Hydor unter dieser Adresse erreichen können.

Diese Platzhalter übernehmen Aufrufdaten in den Prompt:

- `{{body.path.to.field}}` liest JSON, Formulardaten oder Text, etwa `{{body.pull_request.html_url}}`.
- `{{headers.name}}` liest einen Header. Zugangsdaten enthaltende Header wie Authorization, Cookies, Signaturen und Tokens werden niemals übernommen.
- `{{query.name}}` liest URL-Parameter hinter `?`.
- `{{body}}` übernimmt den gesamten Inhalt, `{{request}}` Inhalt, Header und URL-Parameter gemeinsam.

Die Daten werden als externe Inhalte gekennzeichnet. **Jetzt ausführen** sendet den unveränderten Prompt ohne Ersetzung durch einen echten Aufruf.

Unter der Adresse stehen:

- **Signaturgeheimnis (optional)**: Trage einen Wert ein oder wähle **Erzeugen** und hinterlege denselben Wert beim Dienst. Aufrufe benötigen dann eine HMAC-SHA256-Signatur des Inhalts, wie sie GitHub, Gitea und andere liefern. Auch GitLabs Token-Header wird unterstützt. Ohne korrekten Nachweis wird der Aufruf abgelehnt.
- **Signatur-Header**: erscheint bei gesetztem Geheimnis. Leer werden Standardheader wie X-Hub-Signature-256, X-Gitea-Signature oder X-Signature-256 verwendet. Alternativ gibst du den eigenen Headernamen an.
- **Filter (optional)**: **Nur ausführen, wenn** oder **Überspringen, wenn** ein Datenpfad einem Wert entspricht, etwa `body.action` gleich `opened`, `headers.x-github-event` gleich `push` oder `query.kind` gleich `daily`. Ohne Präfix wird der Body gelesen. Ausgefilterte Aufrufe werden beantwortet, starten aber nichts.

Für eingehende Aufrufe gilt:

- Derselbe Idempotency-Key oder dieselbe Zustellungs-ID von GitHub, Gitea oder GitLab startet nur einmal einen Lauf. IDs werden eine Woche gespeichert.
- Aufrufe innerhalb von fünf Sekunden nach dem letzten Aufgabenlauf werden abgewiesen, damit Ereignisspitzen nur einen Lauf auslösen.
- Pausierte Aufgaben lehnen Aufrufe ab. Die Nutzlast darf bis zu 2 MB groß sein.
- Die Antwort kommt sofort mit dem Sitzungslink. `?wait=60` wartet bis zu 60 Sekunden auf die Agentenantwort, maximal sind 300 möglich. Läuft der Agent dann noch, erhältst du seinen Link.

## Einer Webhook-Aufgabe eine neue Adresse geben

Ist die Adresse bekannt geworden oder soll ein Dienst sie nicht mehr nutzen, öffne das Aufgabenmenü (⋯) → **Neue Adresse** und bestätige. Die bisherige Adresse wird ungültig; aktualisiere alle aufrufenden Dienste. Normales Bearbeiten behält die Adresse, ein Duplikat erhält eine eigene.

## Mit einem Beispiel beginnen

Unter der Liste findest du [**Mit einem Beispiel beginnen**](/settings?s=tasks&find=Start%20from%20an%20example). Zunächst sind vier Einträge sichtbar. **Alle Beispiele anzeigen** und **Weniger Beispiele anzeigen** erweitern oder kürzen die Liste. Die Gruppen heißen **Alltag**, **Überwachen** und **Entwicklung**. Wähle ein Beispiel, fülle das kurze Formular aus, bestimme unter **Ausgeführt von** den Agenten und klicke auf **Aufgabe erstellen**. **Weitere Optionen…** öffnet stattdessen das vorausgefüllte vollständige Formular. Optionale Felder dürfen leer bleiben. Schalter wie **Pull Requests öffnen** legen fest, was der Agent tun darf.

**Alltag**

- [**Morgenüberblick**](/settings?s=tasks&find=Morning%20brief): Wetter, Neuigkeiten zu deinen Themen und Tagesplanung. Wähle Uhrzeit, zunächst 07:30, Wochentage, Stadt und Nachrichtenthemen. Verbundene Kalender und E-Mail-Konten ergänzen heutige Termine und dringende Nachrichten.
- [**Neuigkeiten zu einem Thema**](/settings?s=tasks&find=News%20on%20a%20topic): tatsächlich neue Informationen mit Quellen zu gewählten Zeiten, zunächst täglich 09:00. Ohne Neuigkeiten bleibt die Aufgabe still.
- [**Wochenbericht aus einem Ordner**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): Änderungen der letzten sieben Tage, offene Arbeit und drei Vorschläge für die nächste Woche, zunächst freitags 16:00. Dateien bleiben unverändert.
- [**E-Mail-Zusammenfassung**](/settings?s=tasks&find=Inbox%20digest): neue Nachrichten seit dem letzten Lauf, dringende zuerst. Nur lesend und mit verbundenem E-Mail-Konto; siehe [Verbundene Apps, Keys und Tools](/guide/connections).
- [**Nach Gewohnheiten fragen**](/settings?s=tasks&find=Habit%20check-in): freundliche Rückfrage zur Gewohnheit, zunächst täglich 20:00. Die Serie erfolgreicher Tage bleibt in den Aufgabennotizen erhalten.
- [**Erinnerung**](/settings?s=tasks&find=Reminder): Hinweis zur gewählten Uhrzeit und an gewählten Tagen, zunächst werktags 09:00. Für einmalige Termine siehe [Erinnerungen](/guide/tasks#reminders).

**Überwachen**

- [**Preis überwachen**](/settings?s=tasks&find=Price%20watch): prüft eine Produktseite alle 60 Minuten, optional nur nahe einem Text wie „Preis“. Meldet Änderungen oder das Erreichen beziehungsweise Unterschreiten deines Zielpreises.
- [**Seitenänderungen melden**](/settings?s=tasks&find=Page%20change%20alert): prüft alle 30 Minuten eine Seite oder einen Textbereich und bewertet relevante Änderungen. Unwichtiges bleibt still.
- [**Neue Releases**](/settings?s=tasks&find=New%20releases): prüft GitHub-Releases eines Repositorys mit owner/name alle sechs Stunden und nennt Neuerungen und mögliche Inkompatibilitäten.
- [**Website-Erreichbarkeit prüfen**](/settings?s=tasks&find=Site%20up%20check): prüft alle zehn Minuten. Bei Ausfall untersucht der Agent DNS, Zertifikat, HTTP-Status und Zeitüberschreitungen. Die Rückkehr meldet er kurz.
- [**Speicherplatzwarnung**](/settings?s=tasks&find=Disk%20space%20alert): prüft ein Laufwerk, zunächst `/`, alle 30 Minuten. Ab standardmäßig 90 % Belegung findet der Agent große Verbraucher und schlägt Bereinigung vor, ohne zu löschen.
- [**Neue Dateien in einem Ordner**](/settings?s=tasks&find=New%20files%20in%20a%20folder): prüft alle 15 Minuten, optional auf Muster wie `*.pdf`, und führt für neue Dateien die Anweisung unter **Danach** aus oder beschreibt sie kurz.

**Entwicklung**, mehr unter [Entwicklung](/guide/engineering)

- [**Neue Pull Requests prüfen**](/settings?s=tasks&find=Review%20new%20pull%20requests): Webhook-Aufgabe im Repository-Ordner für GitHub oder Gitea, nur bei `opened`. Der Agent prüft Änderungen und schlägt Korrekturen vor, ohne Push oder Merge. Kopiere die gespeicherte Adresse in die Repository-Webhook-Einstellungen und wähle bei einzelnen Ereignissen nur **Pull requests**.
- [**CI-Diagnose**](/settings?s=tasks&find=CI%20doctor): Fehlgeschlagene Läufe in GitHub Actions, GitLab CI, Buildkite oder CircleCI starten einen Agenten. Er liest Protokolle, unterscheidet sporadische und tatsächliche Fehler und wiederholt den Lauf oder erstellt je nach Freigabe einen Draft-Pull-Request. Siehe [CI-Diagnose](/guide/engineering#ci-doctor).
- [**Issues einordnen**](/settings?s=tasks&find=Issue%20triage): vergibt Labels, findet Duplikate, fragt nach fehlenden Angaben und versucht kleine Korrekturen als Draft-Pull-Request. Siehe [Issues einordnen](/guide/engineering#issue-triage).
- [**Abhängigkeiten pflegen**](/settings?s=tasks&find=Dependency%20gardener): wöchentliche Updates, zunächst montags 09:00, in getesteten Worktrees. Sicherheitskorrekturen zuerst, ein Pull Request je Risikostufe oder ein Bericht. Siehe [Abhängigkeiten pflegen](/guide/engineering#dependency-gardener).
- [**Erste Hilfe bei Störungen**](/settings?s=tasks&find=Incident%20first%20responder): Alarme aus Sentry, Grafana, Datadog, Better Stack oder anderen Diensten starten einen Agenten, der dich sofort informiert, die wahrscheinliche Ursache sucht und vor jedem Rollback nachfragt. Siehe [Erste Hilfe bei Störungen](/guide/engineering#incident-first-responder).

Webhook-Beispiele erklären im Formular und nach dem Speichern unter ihrer Adresse, wo du diese beim Dienst hinterlegen musst.

## Eine Aufgabe testen

**Testlauf** unten im Formular führt die aktuelle Aufgabe einmal ohne Speichern aus. Wie ein echter Lauf erhält er eine Sitzung namens „Test: <Name> · <Zeit>“. Im Formular erscheinen Ergebnis und **Sitzung öffnen**. Testfehler zählen nicht für die automatische Aufgabenpause. Beim Testen einer bestehenden Aufgabe werden ihre Notizen gelesen und der Test im Verlauf erfasst. Neue Aufgaben haben noch keine Notizen.

Zum Testen sendender, veröffentlichender oder löschender Aufgaben ohne externe Auswirkungen wähle im Menü **Weitere Testmöglichkeiten** neben **Testlauf** die Option **Ohne Versand testen**. Sie steht auch im Menü gespeicherter Aufgaben. Alle extern wirkenden Konto-Tools für Senden, Veröffentlichen, Antworten, Einladen, Teilen, Löschen und Bezahlen sowie alle Tools mit **Vorher fragen** werden nur als „Wäre gesendet worden“ erfasst. Der Agent erfährt davon und arbeitet weiter, als sei der Aufruf erfolgreich gewesen. Formular, **Verlauf** und Sitzung zeigen die vorgesehenen Aktionen. Im Postausgang bleibt nichts zurück. Lesen funktioniert normal. Siehe [Verbundene Apps, Keys und Tools](/guide/connections#ask-first-calls-that-wait-for-your-ok).

## Eine Aufgabe sofort ausführen

**Jetzt ausführen** im Aufgabenmenü (⋯) startet sofort einen Lauf und öffnet seine Sitzung, unabhängig davon, ob die Aufgabe aktiv oder pausiert ist.

## Ergebnisse der Läufe ansehen

**Verlauf** im Aufgabenmenü oder neben den Ergebnisdots zeigt die neuesten 50 Läufe, neueste zuerst. Die App bewahrt 100 pro Aufgabe auf. Jeder Eintrag enthält:

- Ergebnis: **Läuft**, **Abgeschlossen**, **Teilweise erledigt**, **Blockiert** bei fehlendem Zugang oder Entscheidung, **Fehlgeschlagen**, **Nichts Neues** oder **Fehler**, wenn der Start oder Durchlauf scheiterte.
- Startzeit, Auslöser wie Zeitplan, Webhook, Überwachung, manuell, Wiederholung oder Test, Dauer und Kosten.
- Bei Tests ohne Versand die vorgesehenen Aufrufe mit Konto, Tool und Empfänger.
- Die einzeilige Agentenzusammenfassung. Ein Klick auf lange Texte öffnet die vollständige letzte Antwort.
- **Sitzung öffnen** und **Mit denselben Eingaben erneut ausführen** für denselben Webhook-Aufruf oder dieselbe beobachtete Änderung.

Das Ergebnis stammt aus dem Abschlussbericht des Agenten. Fehlt er, entscheidet die App: **Fehler** bei einem fehlerhaften Durchlaufende, **Nichts Neues** bei Antworten mit [SILENT] oder reinem Hinweis auf fehlende Neuigkeiten, ansonsten **Abgeschlossen**. In der Sitzung erscheint der Bericht als Schritt, etwa „Als abgeschlossen gemeldet: …“.

## Notizen zwischen Läufen

Unter dem Verlauf steht **Notizen für weitere Läufe**: bereits gemeldete Inhalte, laufende Summen oder der letzte Arbeitsstand. Jeder Lauf liest diese Notizen beim Start; der Agent ergänzt oder ersetzt sie. Über **Bearbeiten** kannst du selbst ändern und **Speichern** oder **Abbrechen** wählen. Maximal 8.000 Zeichen bleiben erhalten; bei Überschreitung entfallen die ältesten Zeilen.

## Benachrichtigungen einer Aufgabe

Läufe verwenden die üblichen Sitzungsbenachrichtigungen mit Sitzungstitel und Agentenzusammenfassung gemäß deinen Einstellungen; siehe [Posteingang und Benachrichtigungen](/guide/inbox).

- Ohne neue Informationen erfolgt keine Meldung.
- Fehlgeschlagene oder mit Fehler beendete Läufe melden sich immer.
- Blockierte Läufe beginnen mit „Blockiert:“ und nennen den Bedarf.
- Nicht gestartete Läufe, etwa bei fehlendem Ordner oder gelöschter Zielsitzung, melden „Start nicht möglich: …“.
- Automatische Aufgabenpausen nennen ihren Grund.
- Läufe in bestehenden Gesprächen ändern deren Benachrichtigungseinstellungen nicht.

Dringendes kann der Agent schon während der Arbeit über notify_user melden. Das gilt auch für andere Agenten und App-Schritte.

## Aufgaben pausieren, aktivieren, ändern, duplizieren oder löschen

- **Pausieren oder aktivieren** erfolgt über den Zeilenschalter. Pausierte Aufgaben führen weder Läufe noch Prüfungen aus und lehnen Webhooks ab. Das Aktivieren löscht Fehlerzähler und Pausengrund.
- **Automatische Pause** folgt nach der eingestellten Anzahl aufeinanderfolgender Fehler. Die Zeile nennt Anzahl und letzten Fehler.
- **Bearbeiten** öffnet **Aufgabe bearbeiten**; bestätige mit **Speichern**.
- **Duplizieren** öffnet einen vorausgefüllten Entwurf namens „<Name> (Kopie)“ zum Anpassen und Speichern.
- **Löschen** fragt nach. Aufgabe und Verlauf verschwinden; gestartete Sitzungen bleiben.

## Einen Agenten eine Aufgabe einrichten lassen

Bitte im Gespräch etwa „Erinnere mich Freitag um 9 an den Zahnarzt“, „Fasse jeden Montagmorgen die Issues der letzten Woche zusammen“ oder „Melde Änderungen dieser Seite“. Der Vorschlag erscheint als Karte und wird erst nach deiner Antwort gespeichert.

Die Karte fragt **Diese Aufgabe planen?** mit Namen und **Wartet auf dich** und zeigt:

- **Wann**: Zeitplan und kommende Termine in deiner Zeitzone. Bei Überwachungen Quelle, Intervall und Adresse, Befehl oder Konto-Tool sowie den Hinweis, dass zuerst geprüft und der Agent erst bei Änderungen gestartet wird.
- **Aufgabe**: den Prompt, bei langen Texten über **Vollständig anzeigen**.
- **Ausführung**: Agent, Modell und neue Sitzung im Ordner oder dieses Gespräch.

Du wählst:

- **Einplanen** zum Speichern und Aktivieren.
- **Bearbeiten…** zum Anpassen im vollständigen Formular, ebenfalls mit **Einplanen**.
- **Nicht jetzt** zum Ablehnen.

Der Agent erhält deine Antwort einschließlich Änderungen automatisch. Die Karte bleibt mit Ergebnis, nächstem Termin und Link zu **Geplante Aufgaben** im Gespräch und zeigt geräteübergreifend denselben Stand.

Ohne andere Vorgaben übernimmt die Aufgabe Agent, Modell, Berechtigungen und Ordner des Gesprächs. Neue Laufsitzungen erhalten außerdem dessen Agentenprofil, Memory, Ausgabenlimit, verbundene Konten und Projekt. Bittest du um Einträge hier im Gespräch, verwenden alle Läufe stattdessen diese Sitzung.

Agenten können Aufgaben auch ändern, pausieren, reaktivieren oder löschen, immer mit vorheriger Karte. Änderungsfragen zeigen alte Werte durchgestrichen über neuen Werten. Die Entscheidungen lauten etwa **Ändern** oder **Beibehalten**, **Pausieren** oder **Weiterlaufen lassen**, **Aktivieren** oder **Pausiert lassen**, **Löschen** oder **Behalten**. Auflisten mit nächstem Termin und letztem Ergebnis ist ebenfalls möglich.

Grenzen:

- Höchstens fünf unbeantwortete Vorschläge pro Gespräch.
- Ab 100 vorhandenen Aufgaben können Agenten keine weiteren vorschlagen.
- Ein geplanter Lauf darf keine Aufgaben erstellen oder ändern; stattdessen soll er es im Bericht vorschlagen.
- Vorgeschlagene Überwachungen dürfen nicht auf deinen Computer oder dein privates Netzwerk zugreifen.

## Aus einer Sitzung eine Aufgabe machen

Für wiederkehrende Arbeit öffne das Sitzungsmenü (⋯) → **Mehr → Als Automatisierung einrichten**. Das [Hilfsmodell](/settings?s=models&find=Helper%20model) liest das Gespräch und erstellt einen eigenständig wiederholbaren Prompt ohne einmalige Details, mit deinen Korrekturen und einem passenden Auslöser. Agent, Modell, Denkaufwand, Berechtigungen, Ordner und Sitzungseinstellungen werden übernommen. Bei Worktrees dient das ursprüngliche Repository als Arbeitsort.

Das Formular **Neue Automatisierung aus dieser Sitzung** erklärt die Auslöserwahl. Passe alles an, teste und speichere. Die Aufgabe erscheint unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks). Ohne eigene Nachrichten lässt sich eine Sitzung nicht umwandeln.

## Erinnerungen

Eine Erinnerung ist eine Aufgabe, die dir zu einem Termin eine Nachricht in der Sitzung und als Benachrichtigung sendet. Drei Wege:

- Bitte einen Agenten: „Erinnere mich morgen um 8 daran, die Mülltonnen rauszustellen“. Bestätige den einmaligen Vorschlag.
- Nutze das Beispiel [**Erinnerung**](/settings?s=tasks&find=Reminder) für wiederkehrende Tage.
- Erstelle eine **Neue Aufgabe** mit **Einmalig** und einem Prompt wie „Erinnere mich in einem freundlichen Satz daran, den Zahnarzt anzurufen“.

## Auf dem Smartphone

[Einstellungen → Geplante Aufgaben](/settings?s=tasks) funktioniert mobil genauso. [Zeitpläne](/agents/schedules) zeigt jeweils einen Tag. Aufgabenformulare, Beispiele und Bestätigungen vor Löschen oder neuer Webhook-Adresse öffnen sich von unten. Auslöser und Überwachungsarten sind bei Platzmangel seitlich scrollbar; Beispiele stehen untereinander. Aktiviere mobile Benachrichtigungen, um bei geschlossener App informiert zu werden; siehe [Posteingang und Benachrichtigungen](/guide/inbox).

## Frag einen Agenten

- „Gib mir werktags um 7:30 das Wetter in Athen und die KI-Neuigkeiten seit gestern.“
- „Erinnere mich Freitag um 9 daran, den Zahnarzt anzurufen.“
- „Überwache diese Produktseite und melde dich, wenn der Preis unter 99 € fällt.“
- „Wenn eine Rechnung meines Steuerberaters per E-Mail ankommt, speichere das PDF unter ~/Invoices und ergänze meine Ausgabentabelle.“
- „Starte bei einem neuen HubSpot-Deal eine Aufgabe: Recherchiere das Unternehmen und entwirf eine erste Antwort an den Kontakt.“
- „Bereite mich 30 Minuten vor jedem Kundentermin im Google-Kalender auf die Person und unsere letzten Gespräche vor.“
- „Welche geplanten Aufgaben sind diese Woche warum fehlgeschlagen?“
- „Welche Karten auf meinen Boards werden morgen früh aktualisiert und was kosten diese Aktualisierungen pro Monat?“
- „Was läuft morgen automatisch und wann?“
- „Warum starteten Montag so viele Aufgaben um 08:00? Verteile sie zeitlich.“
- „Pausiere meinen Morgenüberblick“ oder „Starte den Wochenbericht jetzt“.
- „Teste die Rechnungserinnerungen ohne Versand und zeige die vorgesehenen E-Mails.“
- „Mache dieses Gespräch zu einer Aufgabe für jeden Montag um 9.“
- „Starte meine Leselisten-App mit dem Beitragslink, sobald dieser Feed einen neuen Beitrag hat.“
- „Richte für ~/code/shop eine CI-Diagnose mit GitHub Actions ein, die sporadisch fehlschlagende Jobs wiederholen darf.“
