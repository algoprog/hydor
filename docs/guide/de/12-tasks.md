# Geplante Aufgaben

Eine geplante Aufgabe startet Agentenarbeit automatisch: zu einer Uhrzeit, alle paar Minuten oder Stunden, einmalig, durch einen Webhook, bei beobachteten Änderungen, neuen E-Mails oder neuen Einträgen in verbundenen Apps oder vor Terminen im Kalender. So erhältst du etwa einen Morgenüberblick, Erinnerungen, Preis- und Seitenmeldungen, Wochenberichte, Rechnungsverarbeitung, erste Antworten auf neue Interessenten, Gesprächsvorbereitungen, Pull-Request-Reviews oder Analysen fehlgeschlagener CI-Läufe, ohne selbst eine Sitzung zu starten.

![Einstellungen → Geplante Aufgaben: automatisch gestartete Arbeit](images/tasks.webp)

## Was eine geplante Aufgabe ist

Eine geplante Aufgabe verbindet einen Prompt mit einem Auslöser. Jedes Auslösen startet einen Lauf: eine neue Sitzung mit Agent, Modell und Ordner der Aufgabe und dem Prompt als erster Nachricht. Alternativ kann der Prompt in eine bestehende Sitzung eingefügt werden. Der Agent arbeitet wie in jeder anderen Sitzung und meldet am Ende das Ergebnis in einer Zeile. Der Verlauf speichert diese Zusammenfassung, Kosten und Sitzungslink.

Mögliche Auslöser:

- **Zu einer Uhrzeit**: an gewählten Wochentagen oder über einen Cron-Ausdruck.
- **Wiederholt**: alle festgelegten Minuten, mindestens fünf, oder Stunden.
- **Einmal**: zu Datum und Uhrzeit.
- **Überwachen**: Änderungen an Feeds, Webseiten, JSON-Werten, Ordnern oder Befehlsausgaben, neue E-Mails oder neue Einträge in verbundenen Apps wie Deals, Dateien, Tickets und Zahlungen. Auch ein festgelegter Abstand vor Kalenderterminen ist möglich. Die Prüfung arbeitet ohne Modell und verbraucht keine Token; erst eine Änderung startet den Agenten.
- **Webhook**: Ein Dienst wie GitHub, Gitea, ein Formular oder dein Skript ruft die eigene Adresse der Aufgabe auf.

Statt eines Prompts kann eine Aufgabe eine deiner Apps mit hinterlegten Eingaben ausführen. Der Verlauf verlinkt dann zum App-Lauf; siehe [Eine App automatisch ausführen](/guide/apps#run-an-app-by-itself).

Zeiten richten sich nach deiner Browserzeitzone. Verpasste Läufe, etwa bei ausgeschaltetem oder schlafendem Computer oder geschlossener App, werden bei nächster Gelegenheit nachgeholt.

Du findest Aufgaben unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks), innerhalb **Einstellungen → Agenten**. Auch die Suche mit Strg+K beziehungsweise ⌘K findet Aufgaben nach Namen. Es gibt fünf Wege zum Erstellen:

- **Neue Aufgabe** für die vollständige manuelle Einrichtung.
- **Mit einem Beispiel beginnen** für häufige Anwendungsfälle.
- Einen Agenten bitten, etwa „Erinnere mich Freitag um 9“. Du bestätigst seinen Vorschlag auf einer Karte.
- **In Automatisierung umwandeln** im Sitzungsmenü erstellt einen Entwurf aus einer erfolgreichen Sitzung.
- **Zeitplan hinzufügen** unter **Ausführungen** einer App richtet deren automatische Ausführung ein.

Das automatische Fortsetzen nach einem Nutzungslimit ist eine separate Einstellung: [Einstellungen → Allgemein → Nach Nutzungslimits fortsetzen](/settings?s=general&find=Resume%20after%20usage%20limits); siehe [Nutzung, Limits und Kosten](/guide/usage).

## Deine geplanten Aufgaben ansehen

Unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks) zeigt **Deine Aufgaben** die Zeitzone und Aufgaben, älteste zuerst. Das (i) erklärt das Nachholen verpasster Läufe. Die Liste aktualisiert sich bei Starts und Abschlüssen. **Wochenansicht** neben **Neue Aufgabe** öffnet den Kalender; siehe [Wochenübersicht: bisherige und kommende Läufe](#see-the-week-what-ran-and-what-runs-next). Jede Zeile zeigt:

- Ein Symbol für den Auslöser (ein Kalender, ein Auge für eine Überwachung, ein Webhook-Zeichen), der Name der Aufgabe und das Symbol ihres Agenten.
- Zeitplan und Ort, etwa „Werktags um 09:00 · neue Sitzung in reports · nächster Lauf in 14 Std. 20 Min.“, oder den Hinweis auf eine bestehende Sitzung.
- Bei Überwachungen die letzte Prüfung, etwa „Vor 5 Min. geprüft: 12 Einträge, 2 neu“, bei Fehlern gelb.
- Bei automatischer Pause den Grund mit „Zum erneuten Versuch aktivieren“.
- Punkte für die letzten Läufe (bis zu sechs, die ältesten zuerst: grün für erledigt, gelb für teilweise erledigt oder blockiert, rot für fehlgeschlagen oder einen Fehler, grau für nichts Neues) mit **Verlauf** daneben; **Letzter Lauf vor 3 Std.** (in Rot, mit dem Grund, wenn der letzte Lauf nicht starten konnte); und **Öffnen**, das die Sitzung des letzten Laufs öffnet.
- Bei einer Webhook-Aufgabe ihre Adresse mit einer Schaltfläche zum Kopieren und, bei einer aus einem Beispiel erstellten, wo du sie in dem Dienst einfügst, der sie aufruft.

Rechts in jeder Zeile stehen ein Schalter, der die Aufgabe pausiert oder einschaltet, und das Menü der Aufgabe (⋯): **Jetzt ausführen**, **Ohne Versand testen**, **Bearbeiten**, **Verlauf**, **Duplizieren**, **Neue Adresse** (nur bei Webhook-Aufgaben) und **Löschen**.

Auch eine Board-Karte, die sich automatisch aktuell hält, steht in der Liste, dem Board zugeordnet, etwa „Geschäft · Umsatz nach Tagen: aktualisieren“. Ihre Zeile enthält den Schalter, **Jetzt aktualisieren** und **Board öffnen**. Letzteres öffnet ihre Einstellungen auf dem Board: Frage, Zeitplan und Modellstufe änderst du dort. **Aktualisierung beenden**, das Entfernen der Karte oder das Löschen des Boards entfernt den Eintrag aus dieser Liste. Siehe [Karten aktuell halten](/guide/library#keep-cards-up-to-date).

Ohne Aufgaben erscheint der Hinweis, ein Beispiel zu wählen oder einen Agenten um die Einrichtung zu bitten.

## Wochenübersicht: bisherige und kommende Läufe

Unter [Agenten → Zeitpläne](/agents/schedules) im Tab **Zeitpläne** siehst du alles, was automatisch läuft. **Wochenansicht** in den Aufgabeneinstellungen und die Suche öffnen denselben Bereich. Er vereint geplante Aufgaben, Agentenzeitpläne, App-Zeitpläne einschließlich **Automatisch aktualisieren**, automatisch aktualisierte Board-Karten, Überwachungen und Webhooks. So erkennst du kommende Aufgaben, gleichzeitige Starts und vergangene Ergebnisse.

- **Woche**: Montag bis Sonntag stehen nebeneinander, Stunden am Rand, heute hervorgehoben und die aktuelle Uhrzeit als Linie. Ausgeführte Läufe erscheinen als Blöcke: grün **Abgeschlossen**, grau **Nichts Neues**, gelb **Braucht dich** bei teilweiser Erledigung oder Blockade, rot **Fehlgeschlagen** oder Fehler. Kommende Läufe sind blass und gestrichelt. Starten mehr als drei gleichzeitig, stehen zwei sichtbar neben einem Sammelblock wie **+2**.
- **Die Spalte jedes Tages** nennt, was seine Läufe gekostet haben und wie viele fehlgeschlagen sind.
- **Häufige Wiederholungen, Überwachungen und Webhooks** erscheinen oberhalb der Stunden in einem Band pro Aufgabe. Das gilt für Aufgaben mit mehr als acht Läufen täglich sowie für alle Überwachungen und Webhooks. Pro Tag siehst du Ergebnisverteilung, Anzahl und etwa **+48** kommende Läufe. Ein Klick auf die Zeile klappt das Band ein.
- **Klicke auf einen Block**, um seine Karte zu sehen: wie es lief, wann, wie lange es dauerte und was es kostete, was es gestartet hat (wenn es nicht der Zeitplan war), die einzeilige Zusammenfassung des Agenten, **Sitzung öffnen** (oder **Lauf öffnen**, bei einer App) und **Bearbeiten**. Bei einem kommenden Lauf steht, wann er läuft, mit **Bearbeiten**. Der Tag eines Bands zählt seine Läufe danach, wie sie verlaufen sind, mit **Letzten Durchlauf öffnen**, wenn es eine Sitzung gibt.
- **‹** und **›** wechseln Wochen, **Heute** kehrt zurück. **Woche** und **Monat** wechseln zur Monatsansicht mit Tagesbalken, Anzahl der Läufe, Fehler, bevorstehenden Ausführungen und Kosten. Häufige Wiederholungen stehen etwa als **+48 Wiederholungen**. Ein Klick öffnet die Woche des Tages.
- Die Zeile über dem Kalender summiert, was angezeigt wird: wie viele liefen, wie viele fehlschlugen, was sie gekostet haben und wie viele noch kommen, dann was die Farben bedeuten und deine Zeitzone.
- **Die Filter** oben (**Alle**, **Aufgaben**, **Agenten**, **Apps**, **Boards**, **Beobachter**, **Webhooks**, **Pausiert**, jeweils mit der Anzahl) zeigen nur diese: im Kalender, in seinen Summen und in der Liste.

Unter dem Kalender listet **Alles, was automatisch läuft** jeden einzelnen Eintrag auf: zuerst, was als Nächstes läuft, dann Beobachter und Webhooks, dann das Pausierte. Eine Zeile zeigt ihren Namen und wem sie gehört (**Agent ·** und der Agent, **App ·** und die App, **Board ·** und das Board oder **Aufgabe**), wann sie läuft und wann das nächste Mal, warum sie sich selbst pausiert hat, Punkte für die letzten Läufe mit **Letzter Lauf vor 3 Std.:** und wie er verlief, die Zusammenfassung des Agenten und **Öffnen**. Der Schalter pausiert sie oder schaltet sie ein. Der Stift öffnet sie dort, wo du sie änderst: den Zeitplan eines Agenten auf der Seite des Agenten, den einer App unter **Ausführungen** der App (oder unter **Einstellungen** ihrer Seite, für **Automatisch aktualisieren**), die Aktualisierungen einer Board-Karte auf ihrem Board (ihr **Aktuell halten…**: [Karten aktuell halten](/guide/library#keep-cards-up-to-date)), jede andere Aufgabe hier unter Einstellungen → Geplante Aufgaben, mit geöffnetem Formular.

Alle Zeiten sind lokal. Auf Smartphones zeigt die Ansicht jeweils einen Tag; **‹**, **›** oder seitliches Wischen wechseln den Tag.

## Eine neue Aufgabe erstellen

1. Öffne [Einstellungen → Geplante Aufgaben](/settings?s=tasks) und [**Neue Aufgabe**](/settings?s=tasks&find=New%20task) neben dem Titel. Das Formular **Neue geplante Aufgabe** erscheint.
2. Gib einen Namen ein, wähle den Agenten und den Ordner und schreib den Prompt.
3. Wähle unter **Wann** den Auslöser.
4. Wähle unter **Jeder Lauf**, wohin jeder Lauf geht und welche Grenzen er hat.
5. Mit **Testlauf** kannst du die Aufgabe ohne Speichern erproben; siehe [Eine Aufgabe testen](/guide/tasks#try-a-task-with-a-test-run).
6. Wähle **Aufgabe erstellen**.

**Aufgabe erstellen** und **Testlauf** sind erst möglich, wenn die Aufgabe einen Namen und einen Prompt hat. Eine neue Aufgabe ist so eingestellt, dass sie werktags um 09:00 läuft, mit dem Agenten, den du zuletzt auf der Startseite gewählt hast, im Standardordner der App (meist dein Home-Ordner).

### Name, Agent und Ordner

- **Name** (das Feld mit „Name, z. B. Morgendliche CI-Zusammenfassung“): wie die Aufgabe in der Liste, in Benachrichtigungen und in den Titeln der Sitzungen ihrer Läufe erscheint („Morgenüberblick · 3. Nov., 07:30“). Bis zu 120 Zeichen.
- Der Agent-Chip: wer sie ausführt. Claude Code, Codex, Benutzerdefiniert oder ein anderer Agent, den du hinzugefügt hast (siehe [Agenten, Konten und Modelle](/guide/agents-models)). Wenn du einen anderen Agenten wählst, werden Modell und Aufwand zurückgesetzt und die üblichen Berechtigungen dieses Agenten gesetzt.
- Der Ordner-Chip: der Ordner, in dem jeder Lauf arbeitet. Gib einen Pfad ein oder wähle einen, und wähle dann **Diesen Ordner verwenden**. Der Ordner muss existieren.

### Modell, Denkaufwand, Berechtigungen und weitere Optionen

Darunter stehen die Auswahlelemente der Startseite:

- **Modell** und **Aufwand** verwenden ohne eigene Auswahl die Agentenstandards.
- **Berechtigungen** bestimmen den Handlungsspielraum. Neue Aufgaben verwenden **Fragen** bei Claude Code, **Automatisch** bei Codex und **Automatisch** bei Custom: Routinearbeiten laufen, riskante Aktionen fragen nach. Benötigt ein unbeaufsichtigter Lauf Zustimmung, wartet sie in Sitzung und [Posteingang](/guide/inbox).
- **Agent**, **Memory**, sofern aktiv, **Ausgabenlimit**, **Schwarm** und **Forschung** gelten für jede neue Laufsitzung wie auf der Startseite; siehe [Sitzungen](/guide/sessions), [Agenten](/guide/agents) und [Memory](/guide/memory). Eine Aufgabe mit einem deiner Agenten erscheint auch in dessen Zeitplänen, nutzt seine Modellstufe und zählt zum Monatsbudget. Fehlerhafte oder mit Fehler gestoppte Läufe werden eine Stufe höher bis Best wiederholt, außer **Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln** ist deaktiviert. Bei Agenten mit eigener dauerhafter Unterhaltung wird dort weitergeschrieben statt eine neue Sitzung zu starten.

### Der Prompt

Was der Agent jedes Mal tun soll. Schreib es als vollständige Anweisungen auf: Ein Lauf beginnt von vorn und kann die Unterhaltung nicht sehen, in der du die Idee hattest. Er darf bis zu 50.000 Zeichen lang sein.

Die erste Nachricht jedes Laufs enthält mehr als deinen Prompt: eine Zeile mit dem Namen der Aufgabe, wie oft sie läuft, warum dieser Lauf gestartet wurde und der aktuellen Uhrzeit; eine Bitte, zu berichten, wie es lief; und die Notizen der Aufgabe aus früheren Läufen. In der Sitzung des Laufs erscheint das alles als eine Zeile, etwa „Geplante Aufgabe Morgenüberblick · Werktags um 07:30“. Wähle sie, um den Prompt und, unter „Von der App für diesen Lauf hinzugefügt“, den Rest zu lesen.

### Wann die Aufgabe läuft

**Wann** bietet **Zu einer Uhrzeit**, **Wiederholt**, **Einmal**, **Überwachen** und **Webhook**. Für die ersten drei zeigt „Nächste Läufe: …“ bis zu drei Termine in deiner Zeitzone.

- **Zu einer Uhrzeit**: eine Tageszeit und die Wochentage (S M T W T F S). Wähle einen Tag, um ihn ein- oder auszuschalten; alle sieben bedeuten jeden Tag, und mindestens einer bleibt immer eingeschaltet.
- **Cron-Ausdruck…** (unter **Zu einer Uhrzeit**) wandelt die Uhrzeit und die Tage in einen Cron-Ausdruck um, eine gängige Schreibweise für Zeitpläne, den du dann ändern kannst; **Stattdessen eine Tageszeit** geht zurück. Er hat fünf Felder: Minute, Stunde, Tag des Monats, Monat und Wochentag (0 oder 7 ist Sonntag), in deiner Zeitzone. `*/15 9-17 * * 1-5` läuft werktags alle 15 Minuten von 09:00 bis 17:45. Monats- und Tagesnamen (`jan`, `mon`) und die Kürzel `@hourly`, `@daily`, `@weekly`, `@monthly` und `@yearly` funktionieren ebenfalls. Ein Ausdruck, der nicht funktioniert, wird beim Speichern mit dem Grund abgelehnt.
- **Wiederholt**: alle angegebenen Minuten oder Stunden, mindestens fünf Minuten. Neue Wiederholungen laufen stündlich; der erste Lauf startet ein Intervall nach dem Speichern.
- **Einmal**: ein Datum und eine Uhrzeit (zu Beginn in einer Stunde). Nach ihrem Lauf schaltet sich die Aufgabe selbst aus, bleibt aber in der Liste: Du kannst sie mit **Jetzt ausführen** erneut ausführen oder löschen.
- **Überwachen**: siehe [Änderungen überwachen](/guide/tasks#watch-for-a-change).
- **Webhook**: siehe [Läufe per Webhook starten](/guide/tasks#start-runs-from-another-service-with-a-webhook).

Desktop-Apps verhindern automatischen Ruhezustand kurz vor einem Termin und während des Laufs; siehe [Den Computer wach halten](/guide/app#keep-the-computer-awake). Reine Überwachungsprüfungen halten ihn nicht wach. Ein geschlossener Laptopdeckel versetzt ihn weiterhin in den Ruhezustand. Verpasste Aufgaben laufen nach dem Aufwachen. Für zeitkritische Aufgaben nutze einen dauerhaft eingeschalteten Computer.

### Jeder Lauf

- **Startet eine neue Sitzung** (der Standard) oder **Sendet an:** eine deiner letzten Sitzungen mit demselben Agenten (die 40 jüngsten, die nicht archiviert sind). Wenn du in eine Sitzung sendest, bleiben alle Läufe in einer Unterhaltung, die ihr eigenes Modell und ihre eigenen Einstellungen nutzt. Ist der Agent dort beschäftigt, wartet die Nachricht des Laufs in seiner Warteschlange, bis der Durchgang endet, und zu den Kosten des Laufs zählt nur sein eigener Anteil.
- **Stoppt oberhalb von $**: ein Ausgabenlimit für jeden Lauf, zu API-Preisen. Die Sitzung des Laufs stoppt, sobald sie so viel ausgegeben hat (geprüft nach jedem Modellaufruf). Leer bedeutet kein Limit. Es ist dasselbe Limit wie der Chip **Ausgabenlimit** oben und gilt wie dieser für neue Sitzungen.
- **Pausieren nach [3] Fehlern in Folge**: Die Aufgabe pausiert sich selbst nach so vielen fehlgeschlagenen Läufen in Folge und sagt dir, warum. 0 bedeutet, dass Fehler sie nie pausieren; der Höchstwert ist 50.

Darunter steht sinngemäß: Ein Lauf meldet sein Ergebnis; ohne neue Informationen bleibt er still, Fehler werden immer gemeldet.

## Änderungen überwachen

Eine Überwachung prüft regelmäßig ohne Modell und startet den Agenten nur bei Änderungen. Wähle **Überwachen** unter **Wann** und dann eine Quelle:

- **Feed**: die **Adresse** eines RSS- oder Atom-Feeds mit neuen Beiträgen einer Website, eines Blogs oder Code-Hosters. Neue Einträge wecken den Agenten mit Titel, Link, Datum und Zusammenfassung, höchstens 25 gleichzeitig.
- **Seite**: die **Adresse** einer Webseite, und **Welcher Abschnitt** zählt:
  - **Ganze Seite** berücksichtigt Änderungen am lesbaren Text.
  - **Im Umfeld eines Textes** berücksichtigt Zeilen mit dem Suchtext und jeweils eine Nachbarzeile davor und danach, etwa rund um „Preis“.
  - **Selektor** wählt über einfache CSS-Selektoren einen Bereich: Tag, `#id`, `.class` oder `[attribute=value]`, kombiniert oder verschachtelt wie `main .price`.

  Der Lauf bekommt die Zeilen, die dazugekommen sind, und die Zeilen, die weggefallen sind. Die Überwachung liest die Seite so, wie der Server sie erhält, ohne die Skripte der Seite auszuführen. Prüfe deshalb mit **Testen**, ob sie sieht, was du siehst.
- **JSON**: die **Adresse** einer JSON-Antwort (das Datenformat, das die APIs vieler Dienste liefern), **Wert unter** einem Pfad wie `data.price` oder `data.items[0].price`, und **Agenten starten, wenn der Wert** sich ändert, gleich ist, nicht gleich ist, darüber liegt, darunter liegt oder einen **Wert** enthält. Zahlen werden als Zahlen verglichen. Eine Bedingung weckt den Agenten, wenn sie zu gelten beginnt, nicht bei jeder Prüfung, solange sie gilt.
- **Ordner**: ein **Ordner** auf diesem Computer und, wenn du magst, **Nur Dateien mit diesem Muster**, ein Muster wie `*.pdf` (`*` steht für beliebigen Text, `?` für ein Zeichen). Neue Dateien wecken den Agenten, mit ihren Namen, Größen und Daten. Versteckte Dateien und Unterordner bleiben unberücksichtigt.
- **Befehl**: ein **Befehl**, der bei jeder Prüfung mit deiner Shell im Ordner der Aufgabe läuft, höchstens eine Minute lang, und ob der Agent geweckt wird, **Wenn sich die Ausgabe ändert** oder **Bei geändertem Exit-Code** (die Zahl, mit der ein Befehl endet: 0 bedeutet meist, dass er funktioniert hat). Der Lauf bekommt die Ausgabe und das, was sich darin geändert hat.
- **E-Mail**: neue Nachrichten eines [verbundenen E-Mail-Kontos](/guide/connections#connect-your-email). Wähle **Konto** und **Ordner**, standardmäßig Posteingang, sowie optional **Absender enthält**, **Betreff enthält** oder **Nur noch ungelesene E-Mails**. Jede neue E-Mail startet einen eigenen Lauf, maximal zehn pro Prüfung, mit Absender, Empfängern, Datum, Betreff und Text als externen Daten. Anhänge landen unter email-attachments im Aufgabenordner. Bei mehr als zehn neuen Nachrichten starten die neuesten zehn; der erste Lauf nennt die älteren in einer Zusammenfassung. Auch nach Neustarts löst dieselbe E-Mail keinen zweiten Lauf aus.
- **Verbundene App**: etwas Neues in einer der Apps, die du verbunden hast (siehe [Verbundene Apps](/guide/connections)), etwa ein neuer Deal oder Kontakt in einem CRM, eine neue Datei in einem Cloud-Laufwerk, ein neues Ticket oder eine neue Zahlung. Wähle das **Konto** und dann das **Werkzeug**, das bei jeder Prüfung aufgerufen wird: Angeboten werden nur Werkzeuge, die nachsehen (auflisten oder suchen), nie eines, das sendet, ändert, löscht oder bezahlt, und nur solche, die für das Konto aktiviert sind. **Ausgangspunkt** bietet fertige Startpunkte, wo die App solche Dinge enthält (**Neue Dateien**, **Neue Kontakte**, **Neue Verkaufschancen**, **Neue Tickets**, **Neue Zahlungen** und weitere): Jeder wählt eines der Werkzeuge des Kontos und füllt dessen Felder aus. Fülle die Felder des Werkzeugs nach Belieben aus; in einem Feld steht `{{now}}` für den Zeitpunkt jeder Prüfung und `{{now+2d}}` für zwei Tage später (auch `{{today}}` und `{{tomorrow}}`). **Ausprobieren** ruft das Werkzeug einmal auf und zeigt, was zurückkam: wo die Einträge in seiner Antwort stehen (**Einträge befinden sich in**), das Feld, an dem man sie unterscheidet (**Eindeutige Kennung**, etwa eine ID oder eine Adresse), die ersten Einträge und die **Vollständige Tool-Antwort** im Ganzen. Wähle dort eine andere Liste oder ein anderes Feld, wenn das gefundene nicht passt. Jeder neue Eintrag startet dann einen eigenen Lauf, höchstens 10 pro Prüfung, mit dem Eintrag als externen Daten; kommen mehr auf einmal, nennt der erste Lauf die anderen in einer Zeile. Ein Eintrag startet nie zwei Läufe, auch nicht nach einem Neustart der App. Bitte das Werkzeug, die neuesten zuerst und genug davon zu liefern, wo seine Felder das erlauben.
  - **Vor jedem Termin**: für einen verbundenen Kalender ein Lauf zu einer festen Zeit vor jedem seiner Termine, statt einen für jeden neuen Eintrag. **Lauf starten** **15 Min.**, **30 Min.** oder **1 Stunde** vor jedem Termin, oder **Am Abend zuvor** **Um** einer Uhrzeit deiner Wahl, und wenn du magst nur für Termine, bei denen der **Titel enthält** einen bestimmten Text, oder **Nur Termine mit weiteren Personen**. Verwende das Werkzeug, das deine Termine auflistet, mit Feldern von `{{now}}` bis `{{now+2d}}` oder so, und wähle nach **Ausprobieren** unter **Startzeit in** das Feld mit dem Beginn jedes Termins. Der Beobachter liest bei jeder Prüfung die anstehenden Termine und noch einmal zum Zeitpunkt jedes Termins. Ein verschobener Termin bekommt seinen Lauf vor der neuen Zeit; ein abgesagter bekommt keinen.

Anschließend:

- **Alle [Zahl] Minuten prüfen** legt ein Intervall von einer Minute bis einer Woche fest, standardmäßig 15 Minuten.
- **Adressen auf diesem Computer oder in seinem Netzwerk erlauben** gilt für Feeds, Seiten und JSON und ist standardmäßig aus. Nur du kannst dies im Formular freigeben. Vom Agenten vorgeschlagene Überwachungen erreichen dein eigenes Netzwerk nie.
- **Testen**: zeigt, was der Beobachter jetzt sieht, mit einer Zeile wie „12 Einträge (erste Prüfung)“ und einer Probe des Gelesenen, oder was schiefgegangen ist.

Dabei gilt:

- Die erste Prüfung nach dem Speichern erfasst nur den Ausgangszustand. Erst spätere Änderungen starten den Agenten. Eine geänderte Quelle setzt den Ausgangszustand neu.
- Was gelesen wurde, kommt als externe Daten gekennzeichnet beim Agenten an: Er arbeitet damit, folgt ihm aber nie als Anweisungen.
- Änderungen während eines noch laufenden vorherigen Laufs warten auf die nächste Prüfung. Neue E-Mails, App-Einträge und Kalendertermine sind ausgenommen und starten eigene Läufe.
- Schlägt eine Prüfung fehl (die Website ist nicht erreichbar, der Text steht nicht mehr auf der Seite, eine verbundene App ist abgemeldet oder ihre Antwort hat sich geändert), sagt die Zeile das, und es startet kein Lauf mit dem, was nicht gelesen werden konnte. Nach so vielen fehlgeschlagenen Prüfungen in Folge, wie **Pausieren nach … Fehlern in Folge** erlaubt, pausiert die Aufgabe: „Nach 3 fehlgeschlagenen Prüfungen in Folge pausiert: …“.
- **Jetzt ausführen** bei einer Beobachter-Aufgabe startet den Agenten mit dem, was der Beobachter jetzt sieht, und nicht mit einer Änderung.

## Läufe per Webhook starten

Ein Webhook ist eine Adresse, die ein anderer Dienst aufruft, wenn etwas passiert: GitHub, wenn ein Pull-Request geöffnet wird, ein Formular, wenn jemand es abschickt, ein Skript von dir. Wähle **Webhook** unter **Wann** und speichere die Aufgabe, um ihre Adresse zu erhalten („Speichere die Aufgabe, um ihre Adresse zu erhalten. Jeder Aufruf startet einen Lauf.“). Sie erscheint in der Zeile der Aufgabe, mit einer Schaltfläche zum Kopieren. Die Adresse funktioniert ohne Anmeldung in der App, weil ihr geheimer Teil die Erlaubnis ist: Halte sie privat und bevorzuge einen Berechtigungsmodus, der vor Änderungen fragt. Der Dienst muss diese App unter dieser Adresse erreichen können.

Diese Platzhalter übernehmen Aufrufdaten in den Prompt:

- `{{body.path.to.field}}`: ein Wert aus dem, was der Dienst gesendet hat (JSON, ein Formular oder reiner Text), etwa `{{body.pull_request.html_url}}`.
- `{{headers.name}}` liest einen Header. Zugangsdaten enthaltende Header wie Authorization, Cookies, Signaturen und Tokens werden niemals übernommen.
- `{{query.name}}`: ein Wert aus der Query der Adresse (der Teil nach `?`).
- `{{body}}` übernimmt den gesamten Inhalt, `{{request}}` Inhalt, Header und URL-Parameter gemeinsam.

Die Daten werden als externe Inhalte gekennzeichnet. **Jetzt ausführen** sendet den unveränderten Prompt ohne Ersetzung durch einen echten Aufruf.

Unter der Adresse stehen:

- **Signaturgeheimnis (optional)**: Trage einen Wert ein oder wähle **Generieren** und hinterlege denselben Wert beim Dienst. Aufrufe benötigen dann eine HMAC-SHA256-Signatur des Inhalts, wie sie GitHub, Gitea und andere liefern. Auch GitLabs Token-Header wird unterstützt. Ohne korrekten Nachweis wird der Aufruf abgelehnt.
- **Signatur-Header**: erscheint bei gesetztem Geheimnis. Leer werden Standardheader wie X-Hub-Signature-256, X-Gitea-Signature oder X-Signature-256 verwendet. Alternativ gibst du den eigenen Headernamen an.
- **Filter (optional)**: **Nur ausführen, wenn** oder **Überspringen, wenn** ein Pfad im Aufruf einem Wert **ist**: `body.action` ist `opened`, `headers.x-github-event` ist `push`, `query.kind` ist `daily`. Ein Pfad ohne `body.`, `headers.` oder `query.` liest den Body. Ein Aufruf, den der Filter ausschließt, wird beantwortet und startet nichts.

Für eingehende Aufrufe gilt:

- Derselbe Idempotency-Key oder dieselbe Zustellungs-ID von GitHub, Gitea oder GitLab startet nur einmal einen Lauf. IDs werden eine Woche gespeichert.
- Aufrufe innerhalb von fünf Sekunden nach dem letzten Aufgabenlauf werden abgewiesen, damit Ereignisspitzen nur einen Lauf auslösen.
- Pausierte Aufgaben lehnen Aufrufe ab. Die Nutzlast darf bis zu 2 MB groß sein.
- Der Aufruf wird sofort beantwortet, mit einem Link zur Sitzung des Laufs. Hänge `?wait=60` an die Adresse, um bis zu 60 Sekunden (höchstens 300) in der Antwort auf die Antwort des Agenten zu warten; ein Lauf, der dann noch läuft, antwortet mit einem Link dazu.

## Einer Webhook-Aufgabe eine neue Adresse geben

Wenn die Adresse bekannt geworden ist oder ein Dienst sie nicht mehr aufrufen soll: Menü der Aufgabe (⋯) → **Neue Adresse**, dann bestätige **Neue Adresse** („Die bisherige Adresse funktioniert nicht mehr. Aktualisiere die Dienste, die sie aufrufen.“). Beim Bearbeiten einer Webhook-Aufgabe bleibt ihre Adresse erhalten; ein Duplikat bekommt eine eigene Adresse.

## Mit einem Beispiel beginnen

Unter der Liste findest du [**Mit einem Beispiel beginnen**](/settings?s=tasks&find=Start%20from%20an%20example). Zunächst sind vier Einträge sichtbar. **Alle Beispiele anzeigen** und **Weniger Beispiele anzeigen** erweitern oder kürzen die Liste. Die Gruppen heißen **Alltag**, **Überwachen** und **Entwicklung**. Wähle ein Beispiel, fülle das kurze Formular aus, bestimme unter **Ausgeführt von** den Agenten und klicke auf **Aufgabe erstellen**. **Weitere Optionen…** öffnet stattdessen das vorausgefüllte vollständige Formular. Optionale Felder dürfen leer bleiben. Schalter wie **Pull-Requests erstellen** legen fest, was der Agent tun darf.

**Alltag**

- [**Morgenüberblick**](/settings?s=tasks&find=Morning%20brief): Wetter, Neuigkeiten zu deinen Themen und Tagesplanung. Wähle Uhrzeit, zunächst 07:30, Wochentage, Stadt und Nachrichtenthemen. Verbundene Kalender und E-Mail-Konten ergänzen heutige Termine und dringende Nachrichten.
- [**Neuigkeiten zu einem Thema**](/settings?s=tasks&find=News%20on%20a%20topic): tatsächlich neue Informationen mit Quellen zu gewählten Zeiten, zunächst täglich 09:00. Ohne Neuigkeiten bleibt die Aufgabe still.
- [**Wochenbericht aus einem Ordner**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): an einem Wochentag (zunächst freitags um 16:00 Uhr), was sich in den letzten sieben Tagen in einem Ordner oder Repository geändert hat und was unfertig wirkt, mit drei Vorschlägen für die nächste Woche. Sie ändert keine Dateien.
- [**E-Mail-Zusammenfassung**](/settings?s=tasks&find=Inbox%20digest): neue Nachrichten seit dem letzten Lauf, dringende zuerst. Nur lesend und mit verbundenem E-Mail-Konto; siehe [Verbundene Apps, Keys und Tools](/guide/connections).
- [**Gewohnheits-Check-in**](/settings?s=tasks&find=Habit%20check-in): freundliche Rückfrage zur Gewohnheit, zunächst täglich 20:00. Die Serie erfolgreicher Tage bleibt in den Aufgabennotizen erhalten.
- [**Erinnerung**](/settings?s=tasks&find=Reminder): Hinweis zur gewählten Uhrzeit und an gewählten Tagen, zunächst werktags 09:00. Für einmalige Termine siehe [Erinnerungen](/guide/tasks#reminders).

**Überwachen**

- [**Preisüberwachung**](/settings?s=tasks&find=Price%20watch): prüft eine Produktseite alle 60 Minuten, optional nur nahe einem Text wie „Preis“. Meldet Änderungen oder das Erreichen beziehungsweise Unterschreiten deines Zielpreises.
- [**Benachrichtigung bei Seitenänderung**](/settings?s=tasks&find=Page%20change%20alert): prüft alle 30 Minuten eine Seite oder einen Textbereich und bewertet relevante Änderungen. Unwichtiges bleibt still.
- [**Neue Releases**](/settings?s=tasks&find=New%20releases): prüft GitHub-Releases eines Repositorys mit owner/name alle sechs Stunden und nennt Neuerungen und mögliche Inkompatibilitäten.
- [**Erreichbarkeit der Website prüfen**](/settings?s=tasks&find=Site%20up%20check): prüft alle zehn Minuten. Bei Ausfall untersucht der Agent DNS, Zertifikat, HTTP-Status und Zeitüberschreitungen. Die Rückkehr meldet er kurz.
- [**Speicherplatzwarnung**](/settings?s=tasks&find=Disk%20space%20alert): prüft ein Laufwerk, zunächst `/`, alle 30 Minuten. Ab standardmäßig 90 % Belegung findet der Agent große Verbraucher und schlägt Bereinigung vor, ohne zu löschen.
- [**Neue Dateien in einem Ordner**](/settings?s=tasks&find=New%20files%20in%20a%20folder): prüft alle 15 Minuten, optional auf Muster wie `*.pdf`, und führt für neue Dateien die Anweisung unter **Danach** aus oder beschreibt sie kurz.

**Entwicklung**, mehr unter [Entwicklung](/guide/engineering)

- [**Neue Pull-Requests prüfen**](/settings?s=tasks&find=Review%20new%20pull%20requests): eine Webhook-Aufgabe in einem Repository-Ordner, die GitHub oder Gitea für jeden neuen Pull-Request aufruft (sie läuft nur, wenn der Aufruf `opened` sagt). Der Agent prüft die Änderung und schlägt Korrekturen vor, ohne zu pushen oder zu mergen. Sobald sie gespeichert ist, kopiere ihre Adresse in die Webhook-Einstellungen des Repositorys, wie ihre Zeile es sagt (unter den einzelnen Ereignissen nur **Pull-Requests**).
- [**CI-Diagnose**](/settings?s=tasks&find=CI%20doctor): Fehlgeschlagene Läufe in GitHub Actions, GitLab CI, Buildkite oder CircleCI starten einen Agenten. Er liest Protokolle, unterscheidet sporadische und tatsächliche Fehler und wiederholt den Lauf oder erstellt je nach Freigabe einen Draft-Pull-Request. Siehe [CI-Diagnose](/guide/engineering#ci-doctor).
- [**Issues einordnen**](/settings?s=tasks&find=Issue%20triage): vergibt Labels, findet Duplikate, fragt nach fehlenden Angaben und versucht kleine Korrekturen als Draft-Pull-Request. Siehe [Issues einordnen](/guide/engineering#issue-triage).
- [**Abhängigkeiten pflegen**](/settings?s=tasks&find=Dependency%20gardener): wöchentliche Updates, zunächst montags 09:00, in getesteten Worktrees. Sicherheitskorrekturen zuerst, ein Pull-Request je Risikostufe oder ein Bericht. Siehe [Abhängigkeiten pflegen](/guide/engineering#dependency-gardener).
- [**Erste Hilfe bei Störungen**](/settings?s=tasks&find=Incident%20first%20responder): Alarme aus Sentry, Grafana, Datadog, Better Stack oder anderen Diensten starten einen Agenten, der dich sofort informiert, die wahrscheinliche Ursache sucht und vor jedem Rollback nachfragt. Siehe [Erste Hilfe bei Störungen](/guide/engineering#incident-first-responder).

Webhook-Beispiele erklären im Formular und nach dem Speichern unter ihrer Adresse, wo du diese beim Dienst hinterlegen musst.

## Eine Aufgabe testen

**Testlauf** in der Fußzeile des Formulars führt die Aufgabe einmal jetzt aus, so wie das Formular sie hat, ohne sie zu speichern. Er läuft wie ein echter Lauf, in einer eigenen Sitzung mit dem Titel „Test: <Name> · <Zeit>“, und ein Streifen im Formular zeigt **Testlauf** mit dem Ergebnis, sobald er endet, und **Sitzung öffnen**. Ein Testlauf zählt nie zu den Fehlern, die eine Aufgabe pausieren. Wenn du eine Aufgabe beim Bearbeiten testest, liest der Testlauf ihre Notizen und erscheint in ihrem Verlauf als **Testlauf**; eine neue Aufgabe hat noch keine Notizen.

Um eine Aufgabe zu testen, die sendet, veröffentlicht oder löscht, ohne dass etwas nach außen geht, öffne das Menü neben **Testlauf** (**Weitere Möglichkeiten zum Testen**) und wähle **Ohne Versand testen**, oder wähle **Ohne Versand testen** im Menü (⋯) einer gespeicherten Aufgabe. Sie läuft genauso, aber jeder Aufruf eines Werkzeugs eines verbundenen Kontos, das nach außen wirkt (sendet, veröffentlicht, antwortet, einlädt, teilt, löscht oder bezahlt), und jeder Aufruf eines Werkzeugs mit „Vorher fragen“ wird als „wäre gesendet worden“ festgehalten und nie ausgeführt. Der Agent erfährt das und macht weiter, als wäre es hinausgegangen. Ihr Streifen, ihr Lauf im **Verlauf** und ihre Sitzung listen auf, was sie **Wäre gesendet worden**, und danach wartet nichts im Postausgang. Lesen funktioniert wie gewohnt. Siehe [Verbundene Apps, Keys und Tools](/guide/connections#ask-first-calls-that-wait-for-your-ok).

## Eine Aufgabe sofort ausführen

**Jetzt ausführen** im Aufgabenmenü (⋯) startet sofort einen Lauf und öffnet seine Sitzung, unabhängig davon, ob die Aufgabe aktiv oder pausiert ist.

## Ergebnisse der Läufe ansehen

Das Menü der Aufgabe (⋯) → **Verlauf**, oder **Verlauf** neben den Punkten, öffnet die Läufe der Aufgabe, neueste zuerst (die letzten 50 werden angezeigt; die App behält 100 pro Aufgabe). Jeder Lauf zeigt:

- Ergebnis: **Läuft**, **Abgeschlossen**, **Teilweise erledigt**, **Blockiert** bei fehlendem Zugang oder Entscheidung, **Fehlgeschlagen**, **Nichts Neues** oder **Fehler**, wenn der Start oder Durchlauf scheiterte.
- wann er gestartet wurde, was ihn gestartet hat (**Nach Zeitplan**, **Webhook**, **Beobachter**, **Jetzt ausführen**, **Wiederholen**, **Testlauf** oder **Ohne Versand testen**), wie lange er gedauert hat und was er gekostet hat.
- Bei einem Test ohne Versand, was er **Wäre gesendet worden**: jeder Aufruf, mit dem Konto, dem Werkzeug und dem Empfänger, an den er gegangen wäre.
- Die einzeilige Agentenzusammenfassung. Ein Klick auf lange Texte öffnet die vollständige letzte Antwort.
- **Sitzung öffnen** und **Mit derselben Eingabe erneut ausführen**, was die Aufgabe noch einmal mit dem ausführt, was dieser Lauf bekommen hat: derselbe Webhook-Aufruf oder dieselbe Änderung, die ein Beobachter gesehen hat.

Das Ergebnis stammt aus dem Abschlussbericht des Agenten. Fehlt er, entscheidet die App: **Fehler** bei einem fehlerhaften Durchlaufende, **Nichts Neues** bei Antworten mit [SILENT] oder reinem Hinweis auf fehlende Neuigkeiten, ansonsten **Abgeschlossen**. In der Sitzung erscheint der Bericht als Schritt, etwa „Als abgeschlossen gemeldet: …“.

## Notizen zwischen Läufen

Unter dem Verlauf steht **Notizen für weitere Läufe**: bereits gemeldete Inhalte, laufende Summen oder der letzte Arbeitsstand. Jeder Lauf liest diese Notizen beim Start; der Agent ergänzt oder ersetzt sie. Über **Bearbeiten** kannst du selbst ändern und **Speichern** oder **Abbrechen** wählen. Maximal 8.000 Zeichen bleiben erhalten; bei Überschreitung entfallen die ältesten Zeilen.

## Benachrichtigungen einer Aufgabe

Ein Lauf sagt dir mit der üblichen Benachrichtigung seiner Sitzung, wie er gelaufen ist, mit dem Namen der Sitzung als Titel und der einzeiligen Zusammenfassung des Agenten. Sie folgt deinen Benachrichtigungseinstellungen (siehe [Posteingang und Benachrichtigungen](/guide/inbox)).

- Ohne neue Informationen erfolgt keine Meldung.
- Ein fehlgeschlagener Lauf oder einer, der mit einem Fehler endete, sendet immer eine Fehlermeldung.
- Blockierte Läufe beginnen mit „Blockiert:“ und nennen den Bedarf.
- Ein Lauf, der nicht starten konnte (sein Ordner ist weg, die Sitzung, in die er schreibt, wurde gelöscht), sendet eine Fehlermeldung: „Konnte nicht gestartet werden: …“.
- Automatische Aufgabenpausen nennen ihren Grund.
- Läufe in bestehenden Unterhaltungen ändern deren Benachrichtigungseinstellungen nicht.

Ein Agent kann dir auch während der Arbeit eine Benachrichtigung schicken (sein Werkzeug notify_user), für etwas, das nicht bis zum Ende des Laufs warten kann; das kann jeder Agent, und auch der Schritt einer App.

## Aufgaben pausieren, aktivieren, ändern, duplizieren oder löschen

- **Pausieren oder aktivieren** erfolgt über den Zeilenschalter. Pausierte Aufgaben führen weder Läufe noch Prüfungen aus und lehnen Webhooks ab. Das Aktivieren löscht Fehlerzähler und Pausengrund.
- **Automatische Pause**: Nach der eingestellten Anzahl von Fehlern in Folge pausiert die Aufgabe, und ihre Zeile sagt, warum („Nach 3 fehlgeschlagenen Läufen in Folge pausiert. Zuletzt: …“).
- **Bearbeiten**: Menü der Aufgabe (⋯) → **Bearbeiten** öffnet das Formular als **Aufgabe bearbeiten**; wähle **Speichern**.
- **Duplizieren** öffnet einen vorausgefüllten Entwurf namens „<Name> (Kopie)“ zum Anpassen und Speichern.
- **Löschen** fragt nach. Aufgabe und Verlauf verschwinden; gestartete Sitzungen bleiben.

## Einen Agenten eine Aufgabe einrichten lassen

Bitte in der Unterhaltung etwa „Erinnere mich Freitag um 9 an den Zahnarzt“, „Fasse jeden Montagmorgen die Issues der letzten Woche zusammen“ oder „Melde Änderungen dieser Seite“. Der Vorschlag erscheint als Karte und wird erst nach deiner Antwort gespeichert.

Die Karte fragt **Diese Aufgabe planen?** mit Namen und **Wartet auf dich** und zeigt:

- **Wann**: der Zeitplan in Worten, mit den nächsten Läufen in deiner Zeitzone. Bei einem Beobachter, was er beobachtet und wie oft, mit der Adresse, dem Befehl oder dem Werkzeug einer verbundenen App, und „Es sieht richtig aus, nachdem du bestätigst, und der Agent wacht nur auf, wenn sich etwas geändert hat.“
- **Aufgabe**: den Prompt, bei langen Texten über **Vollständig anzeigen**.
- **Ausführungen**: der Agent, sein Modell und wo: eine neue Sitzung in einem Ordner oder in dieser Unterhaltung.

Du wählst:

- **Einplanen** zum Speichern und Aktivieren.
- **Bearbeiten…**: öffnet das Aufgabenformular mit allem ausgefüllt, um zuerst einen beliebigen Teil zu ändern; seine Schaltfläche heißt ebenfalls **Einplanen**.
- **Nicht jetzt** zum Ablehnen.

Der Agent erfährt deine Antwort als Nachricht, einschließlich der Teile, die du geändert hast, du musst es ihm also nicht sagen. Die Karte bleibt mit dem Ergebnis in der Unterhaltung („Geplant“, „Nächster Lauf …“, ein Link zu **Geplante Aufgaben**) und zeigt auf deinen anderen Geräten dasselbe.

Ohne andere Vorgaben übernimmt die Aufgabe Agent, Modell, Berechtigungen und Ordner des Unterhaltung. Neue Laufsitzungen erhalten außerdem dessen Agentenprofil, Memory, Ausgabenlimit, verbundene Konten und Projekt. Bittest du um Einträge hier in der Unterhaltung, verwenden alle Läufe stattdessen diese Sitzung.

Agenten können deine Aufgaben auch ändern, pausieren, wieder aktivieren oder löschen, immer zuerst mit einer Karte: **Diese Aufgabe ändern?** (die Teile, die sich ändern, der alte Wert durchgestrichen über dem neuen), **Diese Aufgabe pausieren?**, **Diese Aufgabe wieder aktivieren?** oder **Diese Aufgabe löschen?**, jeweils mit eigenem Ja und Nein (**Ändern** oder **Unverändert lassen**, **Pausieren** oder **Weiterlaufen lassen**, **Aktivieren** oder **Pausiert lassen**, **Löschen** oder **Beibehalten**). Sie können auch deine Aufgaben auflisten, mit dem nächsten Lauf jeder Aufgabe und dem Ergebnis des letzten Laufs.

Grenzen:

- Eine Unterhaltung kann bis zu fünf Vorschläge haben, die auf deine Antwort warten.
- Ab 100 vorhandenen Aufgaben können Agenten keine weiteren vorschlagen.
- Ein geplanter Lauf darf keine Aufgaben erstellen oder ändern; stattdessen soll er es im Bericht vorschlagen.
- Vorgeschlagene Überwachungen dürfen nicht auf deinen Computer oder dein privates Netzwerk zugreifen.

## Aus einer Sitzung eine Aufgabe machen

Wenn eine Sitzung etwas getan hat, das du noch einmal erledigt haben willst: Menü der Sitzung (⋯) → **Mehr** → **In Automatisierung umwandeln**. Das [Hilfsmodell](/settings?s=models&find=Helper%20model) liest die Unterhaltung und entwirft eine Aufgabe: einen Prompt, der von allein wieder laufen kann (ohne die einmaligen Details dieses Mals, mit deinen eingearbeiteten Korrekturen), und einen passenden Auslöser. Agent, Modell, Aufwand, Berechtigungen, Ordner und die Einstellungen der Sitzung kommen aus der Sitzung; eine Sitzung in einem Worktree läuft im Repository, aus dem sie stammt.

Das Formular **Neue Automatisierung aus dieser Sitzung** erklärt die Auslöserwahl. Passe alles an, teste und speichere. Die Aufgabe erscheint unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks). Ohne eigene Nachrichten lässt sich eine Sitzung nicht umwandeln.

## Erinnerungen

Eine Erinnerung ist eine Aufgabe, die dir zu einem Termin eine Nachricht in der Sitzung und als Benachrichtigung sendet. Drei Wege:

- Bitte einen Agenten: „Erinnere mich morgen um 8 daran, die Mülltonnen rauszustellen“. Bestätige den einmaligen Vorschlag.
- Nutze das Beispiel [**Erinnerung**](/settings?s=tasks&find=Reminder) für wiederkehrende Tage.
- Erstelle eine **Neue Aufgabe** mit **Einmal** unter **Wann** und einem Prompt wie „Erinnere mich in einem freundlichen Satz daran, den Zahnarzt anzurufen.“

## Auf dem Smartphone

[Einstellungen → Geplante Aufgaben](/settings?s=tasks) funktioniert auf einem Smartphone genauso, und [Zeitpläne](/agents/schedules) zeigt jeweils einen Tag. Das Aufgabenformular, die Formulare der Beispiele und die Bestätigungen (vor **Löschen** oder **Neue Adresse**) öffnen sich als Blätter vom unteren Bildschirmrand. Die Auswahl unter **Wann** und die Arten eines Beobachters scrollen seitlich, wenn sie nicht passen, und die Beispiele stehen als eine Spalte von Zeilen untereinander. Um von deinen Aufgaben zu hören, wenn die App geschlossen ist, aktiviere Benachrichtigungen für das Smartphone (siehe [Posteingang und Benachrichtigungen](/guide/inbox)).

## Frag einen Agenten

- „Gib mir werktags um 7:30 das Wetter in Athen und die KI-Neuigkeiten seit gestern.“
- „Erinnere mich Freitag um 9 daran, den Zahnarzt anzurufen.“
- „Überwache diese Produktseite und melde dich, wenn der Preis unter 99 € fällt.“
- „Wenn eine Rechnung meines Steuerberaters per E-Mail ankommt, speichere das PDF unter ~/Invoices und ergänze meine Ausgabentabelle.“
- „Starte bei einem neuen HubSpot-Deal eine Aufgabe: Recherchiere das Unternehmen und entwirf eine erste Antwort an den Kontakt.“
- „Bereite mich 30 Minuten vor jedem Kundentermin im Google-Kalender auf die Person und unsere letzten Unterhaltungen vor.“
- „Welche geplanten Aufgaben sind diese Woche warum fehlgeschlagen?“
- „Welche Karten auf meinen Boards werden morgen früh aktualisiert und was kosten diese Aktualisierungen pro Monat?“
- „Was läuft morgen automatisch und wann?“
- „Warum starteten Montag so viele Aufgaben um 08:00? Verteile sie zeitlich.“
- „Pausiere meinen Morgenüberblick“ oder „Starte den Wochenbericht jetzt“.
- „Teste die Rechnungserinnerungen ohne Versand und zeige die vorgesehenen E-Mails.“
- „Mache diese Unterhaltung zu einer Aufgabe für jeden Montag um 9.“
- „Starte meine Leselisten-App mit dem Beitragslink, sobald dieser Feed einen neuen Beitrag hat.“
- „Richte für ~/code/shop eine CI-Diagnose mit GitHub Actions ein, die sporadisch fehlschlagende Jobs wiederholen darf.“
