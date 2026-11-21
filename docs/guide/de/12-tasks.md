# Geplante Aufgaben

Eine geplante Aufgabe ist Agentenarbeit, die von selbst startet: zu einer bestimmten Uhrzeit, alle paar Minuten oder Stunden, einmalig, wenn ein anderer Dienst ihren Webhook aufruft, wenn sich etwas ändert, das du beobachtest, wenn eine neue E-Mail oder ein neuer Datensatz in einer verbundenen App eintrifft oder eine bestimmte Zeit vor jedem Termin in deinem Kalender. Nutze sie für eine Morgenübersicht, eine Erinnerung, einen Preis oder eine Seite, die du im Auge behalten willst, einen Wochenbericht, jede neue Rechnung, die per E-Mail eintrifft, eine erste Antwort auf jeden neuen Lead, eine Zusammenfassung vor jedem Kundengespräch, eine Prüfung jedes neuen Pull-Requests oder einen Blick auf jeden fehlgeschlagenen CI-Lauf. Das Ergebnis kommt zu dir, ohne dass du eine Sitzung starten musst.

![Einstellungen → Geplante Aufgaben: Arbeit, die von selbst startet](images/tasks.webp)

## Was eine geplante Aufgabe ist

Eine geplante Aufgabe ist ein Prompt mit einem Auslöser. Jedes Mal, wenn der Auslöser feuert, startet die App einen Lauf: eine neue Sitzung mit dem Agenten, dem Modell und dem Ordner der Aufgabe, deren erste Nachricht der Prompt der Aufgabe ist (oder, wenn du das möchtest, der Prompt landet in einer Sitzung, die du schon hast). Der Agent arbeitet wie in jeder Sitzung. Am Ende sagt er in einer Zeile, wie es gelaufen ist, und der Verlauf der Aufgabe behält diese Zeile, die Kosten und einen Link zur Sitzung.

Eine Aufgabe kann starten:

- **Zu einer Uhrzeit**: zu einer Tageszeit an den Wochentagen, die du auswählst, oder per Cron-Ausdruck.
- **Wiederholen**: alle so viele Minuten (mindestens 5) oder Stunden.
- **Einmal**: an einem Datum zu einer Uhrzeit.
- **Beobachten**: wenn ein Beobachter eine Änderung in einem Feed, auf einer Webseite, in einem Wert in JSON, in einem Ordner oder in der Ausgabe eines Befehls bemerkt, eine neue E-Mail in einem deiner Mail-Konten, oder etwas Neues in einer verbundenen App (ein Deal, eine Datei, ein Ticket, eine Zahlung), oder eine bestimmte Zeit vor jedem Termin in einem verbundenen Kalender. Ein Beobachter schaut ohne Modell, seine Prüfungen kosten also keine Tokens; der Agent wacht nur auf, wenn sich etwas geändert hat.
- **Webhook**: wenn ein anderer Dienst (GitHub, Gitea, ein Formular, ein Skript von dir) die eigene Adresse der Aufgabe aufruft.

Eine Aufgabe kann statt eines Prompts auch eine deiner Apps ausführen: Jedes Mal, wenn ihr Auslöser feuert, läuft die App mit den Antworten, die du festgelegt hast, und der Verlauf der Aufgabe verlinkt auf diesen Lauf (siehe [Eine App von selbst ausführen](/guide/apps#run-an-app-by-itself)).

Die Zeiten richten sich nach deiner Zeitzone, die die App aus deinem Browser übernimmt. Ein Lauf, der zu seiner Zeit nicht starten konnte, weil der Computer aus war oder im Ruhezustand oder die App nicht lief, wird bei der nächsten Gelegenheit ausgeführt.

Deine Aufgaben findest du unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks) (**Einstellungen → Agenten → Geplante Aufgaben**). Das Suchfeld (Ctrl+K, ⌘K auf dem Mac) findet eine Aufgabe ebenfalls über ihren Namen und öffnet sie dort. Es gibt fünf Wege, eine zu erstellen:

- **Neue Aufgabe** in den Einstellungen, wo du jeden Teil selbst festlegst.
- **Mit einem Beispiel beginnen**: ein kurzes Formular für eine gängige Aufgabe.
- Einen Agenten in einer beliebigen Unterhaltung fragen („Erinnere mich Freitag um 9"): Er zeigt eine Karte, die du bestätigst.
- **In Automatisierung umwandeln** im Menü einer Sitzung: Es entwirft eine Aufgabe aus einer Sitzung, die gut funktioniert hat.
- **Zeitplan hinzufügen** unter **Ausführungen** einer App: eine Aufgabe, die diese App ausführt.

Eine Sitzung von selbst fortzusetzen, sobald das Nutzungslimit eines Tarifs zurückgesetzt wird, ist ein eigener Schalter: [Einstellungen → Allgemein → Nach Nutzungslimits fortsetzen](/settings?s=general&find=Resume%20after%20usage%20limits) (siehe [Nutzung, Limits und Kosten](/guide/usage)).

## Deine geplanten Aufgaben ansehen

[Einstellungen → Geplante Aufgaben](/settings?s=tasks) hat eine Gruppe **Deine Aufgaben**, deren Zeile deine Zeitzone nennt (ihr (i) ergänzt, dass ein Lauf, der nicht starten konnte, weil der Computer aus war, bei der nächsten Gelegenheit ausgeführt wird) und die deine Aufgaben auflistet, die älteste zuerst. Die Liste aktualisiert sich von selbst, wenn Läufe starten und enden. **Wochenansicht** neben **Neue Aufgabe** zeigt sie alle in einem Kalender (siehe [Die Woche ansehen: was lief und was als Nächstes läuft](#see-the-week-what-ran-and-what-runs-next)). Jede Zeile zeigt:

- Ein Symbol für den Auslöser (ein Kalender, ein Auge für einen Beobachter, ein Webhook-Zeichen), den Namen der Aufgabe und das Symbol ihres Agenten.
- Wann und wo sie läuft, etwa „Werktags um 09:00 · neue Sitzung in reports · nächste in 14 h 20 min" oder „schreibt in eine Sitzung".
- Bei einem Beobachter seine letzte Prüfung: „Vor 5 Min. geprüft: 12 Einträge, 2 neu" (in Bernstein, wenn die Prüfung fehlgeschlagen ist).
- Wenn die Aufgabe sich selbst pausiert hat, den Grund, mit „Schalte sie ein, um es erneut zu versuchen."
- Punkte für ihre letzten Läufe (bis zu sechs, die ältesten zuerst: grün für erledigt, bernsteinfarben für teilweise erledigt oder blockiert, rot für fehlgeschlagen oder einen Fehler, grau für nichts Neues) mit **Verlauf** daneben; **Letzter Lauf vor 3 Std.** (in Rot, mit dem Grund, wenn der letzte Lauf nicht starten konnte); und **Öffnen**, das die Sitzung des letzten Laufs öffnet.
- Bei einer Webhook-Aufgabe ihre Adresse mit einer Kopieren-Schaltfläche und, bei einer aus einem Beispiel erstellten, wo du sie im aufrufenden Dienst einfügen musst.

Rechts neben jeder Zeile stehen ein Schalter, der die Aufgabe pausiert oder einschaltet, und das Menü der Aufgabe (⋯): **Jetzt ausführen**, **Ohne Versand testen**, **Bearbeiten**, **Verlauf**, **Duplizieren**, **Neue Adresse** (nur Webhook-Aufgaben) und **Löschen**.

Eine Board-Karte, die sich selbst aktuell hält, wird ebenfalls aufgeführt, als Eintrag des Boards: „Shop · Umsatz pro Tag: aktualisieren". Ihre Zeile hat ihren Schalter, **Jetzt aktualisieren** und **Board öffnen**, das die Einstellungen der Karte auf dem Board öffnet: Ihre Frage, ihr Zeitplan und ihre Leistungsstufe werden dort geändert, und **Aktualisierung beenden** dort (oder die Karte entfernen oder das Board löschen) nimmt sie aus dieser Liste ([Karten aktuell halten](/guide/library#keep-cards-up-to-date)).

Solange es noch keine Aufgaben gibt, steht in der Liste: „Noch keine geplanten Aufgaben: Beginne mit einem Beispiel unten oder bitte einen Agenten, eine einzurichten".

## Die Woche ansehen: was lief und was als Nächstes läuft

Alles, was automatisch läuft, ist an einem Ort: [Agenten → Zeitpläne](/agents/schedules), der Bereich **Zeitpläne** in der Spalte der Agenten-Seite (auf einem Smartphone ein Tab oben). **Wochenansicht** in Einstellungen → Geplante Aufgaben öffnet ihn ebenfalls, ebenso das Suchfeld. Er vereint deine geplanten Aufgaben, die Zeitpläne deiner Agenten, die Zeitpläne deiner Apps (auch **Automatisch aktualisieren**), die Board-Karten, die sich selbst aktuell halten, Beobachter und Webhooks, sodass du sehen kannst, was morgen läuft, warum mehrere um 08:00 gestartet sind und wie die letzte Woche lief.

- **Die Woche**: sieben Tage nebeneinander, von Montag bis Sonntag, die Stunden am Rand und der heutige Tag markiert, mit einer Linie zur aktuellen Uhrzeit. Jeder Lauf, der stattgefunden hat, ist ein Block zu seiner Zeit, eingefärbt danach, wie er lief: grün für **Fertig**, grau für **Nichts Neues**, bernsteinfarben für **Braucht dich** (teilweise erledigt oder blockiert), rot für **Fehlgeschlagen** (oder einen Fehler). Läufe, die noch bevorstehen, werden blass gezeichnet, mit gestricheltem Rand und ihrem Namen. Wenn mehr als drei gleichzeitig starten, werden zwei angezeigt und ein Block **+2** (oder mehr) listet die übrigen auf.
- **Die Spalte jedes Tages** zeigt, was ihre Läufe gekostet haben und wie viele fehlgeschlagen sind.
- **Alle paar Minuten, Beobachter und Webhooks**: Was mehr als achtmal am Tag läuft, wird bei Beobachtern und Webhooks als ein Band pro Aufgabe über den Stunden dargestellt, nicht als Block für jeden Lauf. Jeder Tag hat einen Balken dafür, wie seine Läufe verliefen, wie viele liefen, und **+48** (zum Beispiel) für die, die noch bevorstehen. Klicke auf die Zeile, um sie einzuklappen.
- **Klicke auf einen Block** für seine Karte: wie es lief, wann, wie lange es dauerte und was es kostete, was es gestartet hat (wenn es nicht sein Zeitplan war), die einzeilige Zusammenfassung des Agenten, **Sitzung öffnen** (oder **Lauf öffnen** bei einer App) und **Bearbeiten**. Bei einem bevorstehenden Lauf steht, wann er läuft, mit **Bearbeiten**. Der Tag eines Bands zählt seine Läufe danach, wie sie verliefen, mit **Letzten Durchlauf öffnen**, wenn es eine Sitzung gibt.
- **‹** und **›** wechseln zur Woche davor oder danach, und **Heute** kehrt zurück. **Woche** und **Monat** oben rechts wechseln zu einem Monat: jeder Tag mit einem Balken dafür, wie seine Läufe verliefen, wie viele liefen und fehlschlugen, wie viele noch bevorstehen (und **+48 Wiederholungen** für das, was alle paar Minuten läuft), und seinen Kosten. Klicke auf einen Tag, um seine Woche zu öffnen.
- Die Zeile über dem Kalender summiert, was angezeigt wird: wie viele liefen, wie viele fehlschlugen, was sie gekostet haben und wie viele bevorstehen, dann was die Farben bedeuten und deine Zeitzone.
- **Die Chips** oben (**Alle**, **Aufgaben**, **Agenten**, **Apps**, **Boards**, **Beobachter**, **Webhooks**, **Pausiert**, jeweils mit der Anzahl) zeigen nur diese: im Kalender, in seinen Summen und in der Liste.

Unter dem Kalender listet **Alles, was automatisch läuft** jeden Eintrag auf: zuerst, was als Nächstes läuft, dann Beobachter und Webhooks, dann, was pausiert ist. Eine Zeile zeigt ihren Namen und wem sie gehört (**Agent ·** und der Agent, **App ·** und die App, **Board ·** und das Board, oder **Aufgabe**), wann sie läuft und wann als Nächstes, warum sie sich selbst pausiert hat, Punkte für ihre letzten Läufe mit **Letzter Lauf vor 3 Std.:** und wie er verlief, die Zusammenfassung des Agenten und **Öffnen**. Der Schalter pausiert sie oder schaltet sie ein. Der Stift öffnet sie dort, wo du sie änderst: den Zeitplan eines Agenten auf der Seite des Agenten, den einer App unter **Ausführungen** der App (oder unter **Einstellungen** ihrer Seite, bei **Automatisch aktualisieren**), die Aktualisierungen einer Board-Karte auf ihrem Board (ihr **Aktuell halten…**: [Karten aktuell halten](/guide/library#keep-cards-up-to-date)), jede andere Aufgabe hier in Einstellungen → Geplante Aufgaben, mit geöffnetem Formular.

Die Zeiten richten sich nach deiner Zeitzone. Auf einem Smartphone zeigt Zeitpläne einen Tag auf einmal: **‹** und **›** oder ein Wischen zur Seite wechseln zum Tag davor oder danach.

## Neue Aufgabe erstellen

1. Öffne [Einstellungen → Geplante Aufgaben](/settings?s=tasks) und wähle [**Neue Aufgabe**](/settings?s=tasks&find=New%20task), die Schaltfläche neben dem Titel der Seite. Das Formular **Neue geplante Aufgabe** öffnet sich.
2. Gib einen Namen ein, wähle den Agenten und den Ordner und schreibe den Prompt.
3. Wähle unter **Wann**, wann die Aufgabe ausgeführt wird.
4. Wähle unter **Jeder Lauf**, wohin jeder Lauf geht und welche Limits gelten.
5. Wenn du möchtest, wähle **Testlauf**, um die Aufgabe einmal ohne Speichern auszuprobieren (siehe [Eine Aufgabe mit einem Testlauf ausprobieren](/guide/tasks#try-a-task-with-a-test-run)).
6. Wähle **Aufgabe erstellen**.

**Aufgabe erstellen** und **Testlauf** sind erst verfügbar, wenn die Aufgabe einen Namen und einen Prompt hat. Eine neue Aufgabe ist so eingestellt, dass sie werktags um 09:00 Uhr läuft, mit dem Agenten, den du zuletzt auf der Startseite gewählt hast, im Standardordner der App (meist dein Home-Ordner).

### Name, Agent und Ordner

- **Name** (das Feld mit dem Hinweis „Name, z. B. Morgendliche CI-Zusammenfassung“): wie die Aufgabe in der Liste, in Benachrichtigungen und in den Titeln der Sitzungen ihrer Läufe angezeigt wird („Morgenüberblick · 3. Nov., 07:30“). Bis zu 120 Zeichen.
- Der Agenten-Chip: wer die Aufgabe ausführt. Claude Code, Codex, Custom oder ein anderer Agent, den du hinzugefügt hast (siehe [Agenten, Konten und Modelle](/guide/agents-models)). Wenn du einen anderen Agenten wählst, werden Modell und Aufwand zurückgesetzt und die üblichen Berechtigungen dieses Agenten gesetzt.
- Der Ordner-Chip: der Ordner, in dem jeder Lauf arbeitet. Gib einen Pfad ein oder wähle einen aus und wähle dann **Diesen Ordner verwenden**. Der Ordner muss existieren.

### Modell, Aufwand, Berechtigungen und weitere Optionen

Die Zeile darunter enthält die Auswahlfelder der Startseite:

- **Modell** und **Aufwand**: das Modell und wie intensiv es nachdenkt. **Automatisch** steht im Menü **Modell** wie auf der Startseite an erster Stelle: Die Sitzungen der Aufgabe starten auf „Am besten“, und ihr Hauptagent kann selbstständig auf „Max“ wechseln, wenn sich ein Problem als zu schwierig erweist (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Die Option wird angeboten, wenn [**Subagenten koordinieren**](/settings?s=models&find=Lead%20with%20subagents) eingeschaltet ist und das Programm Leistungsstufen hat (bei Custom, sobald seine Stufe „Am besten“ ein Modell nennt), und nicht bei einer vertraulichen Aufgabe. Eine neue Aufgabe startet überall dort auf **Automatisch**, wo es angeboten wird; eine Aufgabe, die du früher gespeichert hast, behält ihr Modell, und du kannst es hier jederzeit ändern. In einem Terminal bewirkt `hydor tasks new … --model auto` dasselbe (siehe [Hydor im Terminal](/guide/terminal)). Ein Modell, das du mit Namen auswählst, wird genau so verwendet. Wenn du nichts änderst, gelten die Standardwerte des Agenten.
- **Berechtigungen**: was der Agent tun darf, ohne dich zu fragen. Eine neue Aufgabe startet bei Claude Code auf **Fragen**, bei Codex auf **Automatisch** und bei Custom auf **Automatisch** (Routineschritte laufen durch, riskante fragen nach). Es kann sein, dass bei einem Lauf niemand zusieht: Ein Lauf, der deine Genehmigung braucht, wartet darauf, in seiner Sitzung und im [Posteingang](/guide/inbox).
- **Agent**, **Memory** (wenn Memory eingeschaltet ist), **Ausgabenlimit**, **Schwarm** und **Forschung**: Die neue Sitzung jedes Laufs startet mit diesen Einstellungen, genau wie eine Sitzung, die du von der Startseite aus startest (siehe [Sitzungen](/guide/sessions), [Agenten](/guide/agents) und [Memory](/guide/memory)). Eine Aufgabe, die als einer deiner Agenten läuft, gehört zu den Zeitplänen dieses Agenten: Sie erscheint auf der Seite des Agenten, ihre Läufe erhalten die Leistungsstufe des Agenten und zählen auf sein Monatsbudget. Ein Lauf, der auf der Stufe des Agenten fehlschlägt oder mit einem Fehler stoppt, läuft erneut eine Stufe höher, bis „Am besten“, es sei denn, **Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln** ist beim Agenten ausgeschaltet. Ein Agent, der mit einer Leistungsstufe denkt, läuft weiterhin auf seiner Stufe, was auch immer das Modell der Aufgabe sagt. Wenn der Agent eine eigene Unterhaltung führt, sendet jeder Lauf seine Nachricht in diese Unterhaltung, statt eine neue Sitzung zu starten.

### Der Prompt

Was der Agent jedes Mal tun soll. Schreibe ihn als vollständige Anweisung: Ein Lauf beginnt frisch und kann die Unterhaltung, in der dir die Idee kam, nicht sehen. Er kann bis zu 50.000 Zeichen lang sein.

Die erste Nachricht jedes Laufs enthält mehr als deinen Prompt: eine Zeile mit dem Namen der Aufgabe, der Häufigkeit, dem Grund, warum dieser Lauf gestartet wurde, und der aktuellen Uhrzeit; die Bitte, zu berichten, wie es gelaufen ist; und die Notizen der Aufgabe aus früheren Läufen. In der Sitzung des Laufs erscheint all das als eine einzige Zeile, etwa „Geplante Aufgabe Morgenüberblick · Werktags um 07:30“. Wähle sie, um den Prompt zu lesen und unter „Von der App für diesen Lauf hinzugefügt“ den Rest.

### Wann sie läuft

**Wann** bietet fünf Möglichkeiten: **Zu einer Uhrzeit**, **Wiederholen**, **Einmal**, **Beobachten** und **Webhook**. Bei den ersten drei listet eine Zeile darunter („Nächster: …“) die nächsten Läufe auf, bis zu drei, in deiner Zeitzone.

- **Zu einer Uhrzeit**: eine Tageszeit und die Wochentage (S M T W T F S). Wähle einen Tag, um ihn ein- oder auszuschalten; alle sieben bedeuten täglich, und mindestens einer bleibt immer eingeschaltet.
- **Cron-Ausdruck…** (unter **Zu einer Uhrzeit**) wandelt Uhrzeit und Tage in einen Cron-Ausdruck um, eine Standardschreibweise für Zeitpläne, den du dann ändern kannst; **Stattdessen eine Tageszeit** geht zurück. Er hat fünf Felder: Minute, Stunde, Tag des Monats, Monat und Wochentag (0 oder 7 ist Sonntag), in deiner Zeitzone. `*/15 9-17 * * 1-5` läuft werktags alle 15 Minuten von 09:00 bis 17:45 Uhr. Monats- und Tagesnamen (`jan`, `mon`) und die Kürzel `@hourly`, `@daily`, `@weekly`, `@monthly` und `@yearly` funktionieren ebenfalls. Ein Ausdruck, der nicht funktioniert, wird beim Speichern mit Begründung abgelehnt.
- **Wiederholen**: „Alle [Zahl] Minuten“ oder „Stunden“. Das kürzeste Intervall beträgt 5 Minuten; eine neue wiederholte Aufgabe läuft jede Stunde. Der erste Lauf kommt ein Intervall nach dem Speichern.
- **Einmal**: ein Datum und eine Uhrzeit (zunächst eine Stunde ab jetzt). Nach einem erfolgreichen Lauf (**Fertig** oder **Nichts Neues**) wird die Aufgabe gelöscht, da sie nichts mehr zu tun hat. Nach einem Lauf, der fehlgeschlagen ist oder dich braucht, schaltet sie sich selbst aus und bleibt in der Liste, damit du sehen kannst, warum, und sie mit **Jetzt ausführen** erneut starten kannst.
- **Beobachten**: siehe [Auf eine Änderung achten](/guide/tasks#watch-for-a-change).
- **Webhook**: siehe [Läufe von einem anderen Dienst mit einem Webhook starten](/guide/tasks#start-runs-from-another-service-with-a-webhook).

In den Desktop-Apps geht der Computer von einigen Minuten vor einem fälligen Lauf bis zu dessen Start nicht von selbst in den Ruhezustand, ebenso wenig, während der Lauf arbeitet (siehe [Den Computer wach halten](/guide/app#keep-the-computer-awake)); die Prüfungen eines Watchers halten ihn nicht wach. Das Zuklappen eines Laptops versetzt ihn weiterhin in den Ruhezustand, und ein Computer, der zur fälligen Zeit schläft, führt die Aufgabe einmal aus, sobald er aufwacht. Für Läufe, die zu jeder Stunde stattfinden müssen, nutze einen Computer, der eingeschaltet bleibt.

### Jeder Lauf

- **Startet eine neue Sitzung** (Standard) oder **Sendet an:** eine deiner letzten Sitzungen mit demselben Agenten (die 40 neuesten, die nicht archiviert sind). Wenn du in eine Sitzung sendest, bleiben alle Läufe in einer Unterhaltung, die ihr eigenes Modell und ihre eigenen Einstellungen verwendet. Wenn der Agent dort beschäftigt ist, wartet die Nachricht des Laufs in seiner Warteschlange, bis der Durchgang endet, und die Kosten des Laufs zählen nur seinen eigenen Teil.
- **Stoppt oberhalb von $**: ein Ausgabenlimit für jeden Lauf, zu API-Preisen. Die Sitzung des Laufs stoppt, sobald sie so viel ausgegeben hat (geprüft nach jedem Modellaufruf). Leer bedeutet kein Limit. Es ist dasselbe Limit wie der Chip **Ausgabenlimit** oben und gilt wie dieser für neue Sitzungen.
- **Nach [3] Fehlschlägen in Folge pausieren**: Die Aufgabe pausiert sich selbst nach so vielen fehlgeschlagenen Läufen in Folge und sagt dir, warum. 0 bedeutet, dass Fehlschläge sie nie pausieren; der Höchstwert ist 50.

Die Zeile darunter fasst es zusammen: „Ein Lauf sagt dir, wie es gelaufen ist; ein Lauf ohne etwas zu berichten bleibt still, und Fehlschläge benachrichtigen immer.“

## Auf eine Änderung achten

Ein Watcher ist eine günstige Prüfung, die alle paar Minuten ohne Modell läuft und den Agenten nur startet, wenn sich etwas geändert hat. Wähle **Beobachten** unter **Wann** und dann, was angeschaut werden soll:

- **Feed**: die **Adresse** eines RSS- oder Atom-Feeds (die Liste neuer Beiträge, die viele Websites, Blogs und Code-Plattformen veröffentlichen). Jeder neue Eintrag startet den Agenten, mit Titel, Link, Datum und Zusammenfassung (bis zu 25 auf einmal).
- **Seite**: die **Adresse** einer Webseite, und es kommt darauf an, **Welcher Abschnitt** gilt:
  - **Ganze Seite**: jede Änderung an ihrem lesbaren Text.
  - **Im Umfeld eines Textes**: nur die Zeilen mit diesem Text und die Zeile davor und danach (bei einem Preis: „Preis“).
  - **Selektor**: der Teil, den ein einfacher CSS-Selektor auswählt (die Namen, die eine Webseite ihren Teilen gibt): ein Tag, `#id`, `.class` oder `[attribute=value]`, kombiniert oder verschachtelt, etwa `main .price`.

  Der Lauf erhält die Zeilen, die hinzugekommen sind, und die Zeilen, die weggefallen sind. Der Watcher liest die Seite so, wie der Server sie erhält, ohne die Skripte der Seite auszuführen. Nutze daher **Testen**, um zu prüfen, ob er sieht, was du siehst.
- **JSON**: die **Adresse** einer JSON-Antwort (das Datenformat, das die APIs vieler Dienste liefern), **Wert unter** einem Pfad wie `data.price` oder `data.items[0].price`, und **Agenten starten, wenn der Wert** sich ändert, gleich ist, nicht gleich ist, größer ist als, kleiner ist als oder enthält: ein **Wert**. Zahlen werden als Zahlen verglichen. Eine Bedingung startet den Agenten, wenn sie zu gelten beginnt, nicht bei jeder Prüfung, solange sie gilt.
- **Ordner**: ein **Ordner** auf diesem Computer und, wenn du möchtest, **Nur Dateien mit diesem Muster**, etwa `*.pdf` (`*` steht für beliebigen Text, `?` für ein Zeichen). Neue Dateien starten den Agenten, mit ihren Namen, Größen und Daten. Versteckte Dateien und Unterordner bleiben außen vor.
- **Befehl**: ein **Befehl**, der bei jeder Prüfung mit deiner Shell im Ordner der Aufgabe läuft, höchstens eine Minute lang, und ob der Agent starten soll, **Wenn sich die Ausgabe ändert** oder **Bei geändertem Exit-Code** (die Zahl, mit der ein Befehl endet: 0 bedeutet meist, dass er funktioniert hat). Der Lauf erhält die Ausgabe und das, was sich darin geändert hat.
- **E-Mail**: neue E-Mails in einem E-Mail-Konto, das du verbunden hast (siehe [E-Mail verbinden](/guide/connections#connect-your-email)). Wähle das **Konto** und den **Ordner** (der Posteingang, sofern du keinen anderen wählst), und wenn du möchtest, nur E-Mails, bei denen **Absender enthält** oder **Betreff enthält** einen bestimmten Text trifft, oder **Nur noch ungelesene E-Mails**. Jede neue E-Mail startet einen eigenen Lauf, höchstens 10 pro Prüfung: wer sie gesendet hat und an wen, das Datum, der Betreff und ihr Text, als externe Daten, mit ihren Anhängen, die im Ordner der Aufgabe unter email-attachments gespeichert werden. Wenn zwischen zwei Prüfungen mehr als 10 eintreffen, bekommen die neuesten 10 Läufe, und der erste Lauf listet die älteren in einer Zeile auf. Eine E-Mail startet nie zwei Läufe, auch nicht nach einem Neustart der App.
- **Verbundene App**: etwas Neues in einer der Apps, die du verbunden hast (siehe [Verbundene Apps](/guide/connections)), etwa ein neuer Deal oder Kontakt in einem CRM, eine neue Datei in einem Cloud-Laufwerk, ein neues Ticket oder eine neue Zahlung. Wähle das **Konto** und dann das **Werkzeug**, das bei jeder Prüfung aufgerufen wird: Angeboten werden nur seine Werkzeuge, die etwas ansehen (auflisten oder suchen), nie eines, das sendet, ändert, löscht oder bezahlt, und nur solche, die dafür eingeschaltet sind. **Ausgangspunkt** bietet fertige Startpunkte, wo die App solche Dinge enthält (**Neue Dateien**, **Neue Kontakte**, **Neue Verkaufschancen**, **Neue Tickets**, **Neue Zahlungen** und weitere): Jeder wählt eines der eigenen Werkzeuge des Kontos und füllt dessen Felder aus. Fülle die Felder des Werkzeugs nach Bedarf aus; in einem Feld steht `{{now}}` für die Zeit jeder Prüfung und `{{now+2d}}` für zwei Tage später (`{{today}}` und `{{tomorrow}}` ebenso). **Ausprobieren** ruft das Werkzeug einmal auf und zeigt, was zurückkam: wo sich die Einträge in der Antwort befinden (**Einträge befinden sich in**), das Feld, das sie unterscheidet (**Eindeutige Kennung**, etwa eine ID oder eine Adresse), die ersten Einträge und **Vollständige Tool-Antwort**. Wähle dort eine andere Liste oder ein anderes Feld, wenn das gefundene nicht stimmt. Jeder neue Eintrag startet dann einen eigenen Lauf, höchstens 10 pro Prüfung, mit dem Eintrag als externen Daten; wenn mehr auf einmal kommen, nennt der erste Lauf die anderen in einer Zeile. Ein Eintrag startet nie zwei Läufe, auch nicht nach einem Neustart der App. Bitte das Werkzeug um die neuesten zuerst und um genug davon, wo seine Felder das erlauben.
  - **Vor jedem Termin**: bei einem verbundenen Kalender ein Lauf zu einem festen Zeitpunkt vor jedem Termin, statt eines Laufs für jeden neuen Eintrag. **Lauf starten** **15 Min.**, **30 Min.** oder **1 Stunde** vor jedem Termin, oder **Am Abend zuvor** **Um** einer Uhrzeit, die du wählst, und wenn du möchtest, nur Termine, bei denen **Titel enthält** einen Text trifft, oder **Nur Termine mit weiteren Personen**. Nutze das Werkzeug, das deine Termine auflistet, mit Feldern von `{{now}}` bis etwa `{{now+2d}}`, und wähle nach **Ausprobieren** unter **Startzeit in** das Feld mit dem Beginn jedes Termins. Der Watcher liest die bevorstehenden Termine bei jeder Prüfung und noch einmal zum Zeitpunkt jedes Termins. Ein Termin, der sich verschiebt, bekommt seinen Lauf vor der neuen Zeit; ein abgesagter bekommt keinen.

Dann:

- **Alle [Zahl] Minuten prüfen**: wie oft er nachsieht, von 1 Minute bis zu einer Woche. Ein neuer Watcher sieht alle 15 Minuten nach.
- **Adressen auf diesem Computer oder in seinem Netzwerk erlauben** (Feeds, Seiten und JSON): ausgeschaltet, solange du es nicht ankreuzt, sodass ein Watcher nur öffentliche Websites erreicht. Nur du kannst das erlauben, hier im Formular; ein Watcher, den ein Agent vorschlägt, erreicht dein eigenes Netzwerk nie.
- **Testen**: zeigt, was der Watcher jetzt sieht, mit einer Zeile wie „12 Einträge (erster Blick)“ und einer Auswahl dessen, was er gelesen hat, oder was schiefgelaufen ist.

Wie sich ein Watcher verhält:

- Sein erster Blick nach dem Speichern nimmt nur den Stand auf; Änderungen danach starten den Agenten. Wenn du änderst, was eine Aufgabe beobachtet, beginnt sie von vorn.
- Was er gelesen hat, erreicht den Agenten als externe Daten markiert, damit er damit arbeitet und ihnen nie als Anweisungen folgt.
- Eine Änderung, die kommt, während der Lauf für die letzte noch läuft, wartet auf den nächsten Blick. Neue E-Mails, neue Einträge einer verbundenen App und Kalendertermine sind die Ausnahme: Jede startet einen eigenen Lauf.
- Wenn ein Blick fehlschlägt (die Website ist nicht erreichbar, der Text steht nicht mehr auf der Seite, eine verbundene App ist abgemeldet oder ihre Antwort hat sich geändert), sagt die Zeile das, und es startet kein Lauf auf Grundlage dessen, was nicht gelesen werden konnte. Nach so vielen fehlgeschlagenen Blicken in Folge, wie **Nach … Fehlschlägen in Folge pausieren** erlaubt, pausiert die Aufgabe: „Pausiert, nachdem die Prüfung 3-mal in Folge fehlgeschlagen ist: …“.
- **Jetzt ausführen** bei einer Watcher-Aufgabe führt den Agenten mit dem aus, was der Watcher jetzt sieht, statt mit einer Änderung.

## Läufe von einem anderen Dienst per Webhook starten

Ein Webhook ist eine Adresse, die ein anderer Dienst aufruft, wenn etwas passiert: GitHub, wenn ein Pull-Request geöffnet wird, ein Formular, wenn jemand es abschickt, ein Skript von dir. Wähle unter **Wann** die Option **Webhook** und speichere die Aufgabe, um ihre Adresse zu erhalten („Speichere die Aufgabe, um ihre Adresse zu erhalten; jeder Aufruf startet einen Lauf“). Sie erscheint in der Zeile der Aufgabe, mit einer Schaltfläche zum Kopieren. Die Adresse funktioniert ohne Anmeldung in der App, denn der geheime Teil der Adresse ist die Berechtigung: Halte sie privat und bevorzuge einen Berechtigungsmodus, der vor Änderungen nachfragt. Der Dienst muss diese App unter dieser Adresse erreichen können.

Teile des Aufrufs können in den Prompt übernommen werden:

- `{{body.path.to.field}}`: ein Wert aus dem, was der Dienst gesendet hat (JSON, ein Formular oder reiner Text), zum Beispiel `{{body.pull_request.html_url}}`.
- `{{headers.name}}`: einer der Header des Aufrufs. Header mit Zugangsdaten (Authorization, Cookies, Signaturen, Tokens) werden nie eingefüllt.
- `{{query.name}}`: ein Wert aus der Query der Adresse (der Teil nach dem `?`).
- `{{body}}` für den gesamten Body, `{{request}}` für Body, Header und Query zusammen.

Sie erreichen den Agent als externe Daten gekennzeichnet. **Jetzt ausführen** bei einer Webhook-Aufgabe sendet ihren Prompt unverändert, ohne einen Aufruf, mit dem er gefüllt würde.

Die Optionen unter der Adresse:

- **Signaturgeheimnis (optional)**: Gib eines ein oder wähle **Generieren**, und gib dasselbe Geheimnis dem Dienst. Aufrufe müssen dann eine HMAC-SHA256-Signatur ihres Body tragen, die damit erstellt wurde (ein Code, den nur jemand erzeugen kann, der das Geheimnis kennt), wie GitHub, Gitea und andere sie senden; der Token-Header von GitLab funktioniert ebenfalls. Aufrufe ohne Signatur werden abgelehnt.
- **Signatur-Header**: erscheint, sobald es ein Geheimnis gibt. Lass das Feld leer für die üblichen Header (X-Hub-Signature-256, X-Gitea-Signature, X-Signature-256…) oder gib den Namen des Headers an, den dein Dienst verwendet.
- **Filter (optional)**: **Nur ausführen, wenn** oder **Überspringen, wenn** ein Pfad in den Aufruf einen bestimmten Wert **ist**: `body.action` ist `opened`, `headers.x-github-event` ist `push`, `query.kind` ist `daily`. Ein Pfad ohne `body.`, `headers.` oder `query.` liest den Body. Ein Aufruf, den der Filter ausschließt, wird beantwortet und startet nichts.

Was die Adresse mit Aufrufen macht:

- Eine erneut gesendete Zustellung mit demselben Idempotency-Key oder derselben Delivery-ID (GitHub, Gitea und GitLab geben jeder Zustellung eine) wird nur einmal ausgeführt. Die IDs werden eine Woche lang gespeichert.
- Ein Aufruf innerhalb von fünf Sekunden nach dem letzten Lauf der Aufgabe wird abgewiesen, sodass eine Welle von Aufrufen nur einen Lauf startet.
- Eine pausierte Aufgabe lehnt Aufrufe ab. Ein Aufruf kann bis zu 2 MB groß sein.
- Der Aufruf wird sofort beantwortet, mit einem Link zur Sitzung des Laufs. Hänge `?wait=60` an die Adresse an, um in der Antwort bis zu 60 Sekunden auf die Antwort des Agenten zu warten (bis zu 300); läuft der Lauf bis dahin noch, enthält die Antwort einen Link dorthin.

## Einer Webhook-Aufgabe eine neue Adresse geben

Wenn die Adresse bekannt geworden ist oder ein Dienst sie nicht mehr aufrufen soll: Menü der Aufgabe (⋯) → **Neue Adresse**, dann **Neue Adresse** bestätigen („Die aktuelle Adresse funktioniert nicht mehr. Aktualisiere die Dienste, die sie aufrufen.“). Beim Bearbeiten einer Webhook-Aufgabe bleibt ihre Adresse erhalten; ein Duplikat bekommt eine eigene Adresse.

## Mit einem Beispiel beginnen

Unterhalb der Liste enthält [**Mit einem Beispiel beginnen**](/settings?s=tasks&find=Start%20from%20an%20example) („Je ein kurzes Formular; alles lässt sich später ändern“) fertige Aufgaben als Zeilen, wobei die ersten vier sichtbar sind und die übrigen hinter **Alle Beispiele anzeigen** liegen (**Weniger Beispiele anzeigen** klappt sie wieder ein). Hier sind sie in drei Gruppen: **Alltag**, **Beobachten** und **Entwicklung**. Wähle eines aus, um sein kurzes Formular zu öffnen, fülle es aus, wähle unter **Ausgeführt von**, wer es ausführt, und wähle **Aufgabe erstellen**. **Weitere Optionen…** öffnet stattdessen das vollständige Aufgabenformular mit allem ausgefüllt. Felder mit der Kennzeichnung (optional) können leer bleiben; die anderen werden benötigt. Schalter (wie **Pull-Requests erstellen**) legen fest, was der Agent tun darf: an oder aus, wie du möchtest.

**Alltag**

- [**Morgenüberblick**](/settings?s=tasks&find=Morning%20brief): das Wetter, Neuigkeiten zu dem, was du verfolgst, und dein Tag, jeden Morgen. Du gibst die Uhrzeit an (zunächst 07:30), die Tage, die Stadt für das Wetter und die Themen für die Nachrichten; er ergänzt die heutigen Termine und dringende E-Mails, wenn ein Kalender oder ein E-Mail-Konto verbunden ist.
- [**Neuigkeiten zu einem Thema**](/settings?s=tasks&find=News%20on%20a%20topic): was zu einem Thema wirklich neu ist, mit Quellen, zu der Uhrzeit und an den Tagen, die du wählst (zunächst jeden Tag um 09:00); still, wenn es nichts Neues gibt.
- [**Wochenbericht aus einem Ordner**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder): an einem Wochentag (zunächst Freitag um 16:00) was sich in den letzten sieben Tagen in einem Ordner oder Repository geändert hat und was unfertig aussieht, mit drei Vorschlägen für die nächste Woche. Er ändert keine Dateien.
- [**E-Mail-Zusammenfassung**](/settings?s=tasks&find=Inbox%20digest): was seit dem letzten Lauf in deinem Postfach eingegangen ist, zuerst die Nachrichten, die dich brauchen. Sie liest nur und benötigt ein verbundenes E-Mail-Konto (siehe [Verbundene Apps, Keys und Tools](/guide/connections)).
- [**Gewohnheits-Check-in**](/settings?s=tasks&find=Habit%20check-in): eine freundliche Frage zu einer Gewohnheit zu der Uhrzeit, die du wählst (zunächst jeden Tag um 20:00), wobei deine Serie in den Notizen der Aufgabe gespeichert wird.
- [**Erinnerung**](/settings?s=tasks&find=Reminder): ein Anstoß zu einer festen Uhrzeit an den Tagen, die du wählst (zunächst werktags um 09:00). Für eine einzelne Erinnerung siehe [Erinnerungen](/guide/tasks#reminders).

**Beobachten**

- [**Preisüberwachung**](/settings?s=tasks&find=Price%20watch): beobachtet alle 60 Minuten eine Produktseite (nur in der Nähe eines Textes wie „Preis“, falls du einen angibst) und sagt dir Bescheid, wenn sich der Preis ändert oder wenn er beim von dir angegebenen Zielpreis oder darunter liegt.
- [**Benachrichtigung bei Seitenänderung**](/settings?s=tasks&find=Page%20change%20alert): beobachtet alle 30 Minuten eine Seite oder den Teil in der Nähe eines Textes und sagt, was sich geändert hat und ob es wichtig ist; unwichtige Änderungen bleiben still.
- [**Neue Releases**](/settings?s=tasks&find=New%20releases): beobachtet alle 6 Stunden die Releases eines GitHub-Repositorys (Besitzer/Name) und fasst zusammen, was neu ist und was Probleme machen könnte.
- [**Erreichbarkeit der Website prüfen**](/settings?s=tasks&find=Site%20up%20check): prüft alle 10 Minuten eine Adresse. Wenn die Website ausfällt, findet der Agent heraus, warum (DNS, Zertifikat, HTTP-Status, Zeitüberschreitung); wenn sie wieder erreichbar ist, sagt er es in einer Zeile.
- [**Speicherplatzwarnung**](/settings?s=tasks&find=Disk%20space%20alert): prüft alle 30 Minuten einen Datenträger (zunächst `/`). Wenn er über eine Marke (90 %) hinaus voll wird, findet der Agent heraus, was den Platz belegt, und schlägt vor, was aufgeräumt werden kann, ohne etwas zu löschen.
- [**Neue Dateien in einem Ordner**](/settings?s=tasks&find=New%20files%20in%20a%20folder): beobachtet alle 15 Minuten einen Ordner (nur Dateien wie `*.pdf`, wenn du es angibst) und tut mit jeder neuen Datei, was du unter **Dann** schreibst, oder sagt dir in einer Zeile, was sie ist.

**Entwicklung** (mehr unter [Entwicklung](/guide/engineering))

- [**Neue Pull-Requests prüfen**](/settings?s=tasks&find=Review%20new%20pull%20requests): eine Webhook-Aufgabe in einem Repository-Ordner, die GitHub oder Gitea für jeden neuen Pull-Request aufruft (sie läuft nur, wenn der Aufruf `opened` meldet). Der Agent prüft die Änderung und schlägt Korrekturen vor, ohne zu pushen oder zu mergen. Sobald sie gespeichert ist, kopiere ihre Adresse in die Webhook-Einstellungen des Repositorys, wie es in ihrer Zeile steht (bei den einzelnen Ereignissen nur **Pull-Requests**).
- [**CI-Diagnose**](/settings?s=tasks&find=CI%20doctor): ein fehlgeschlagener Lauf in GitHub Actions, GitLab CI, Buildkite oder CircleCI weckt einen Agenten, der die Logs liest, instabile von echten Fehlern unterscheidet, den Lauf wiederholt oder einen Entwurf eines Pull-Requests mit einer Korrektur öffnet, je nachdem, was du erlaubst, und alles zusammenfasst. Siehe [CI-Diagnose](/guide/engineering#ci-doctor).
- [**Issues einordnen**](/settings?s=tasks&find=Issue%20triage): jedes neue Issue wird mit Labels versehen, auf Duplikate geprüft, mit einer freundlichen Bitte um fehlende Angaben beantwortet und, wenn die Korrektur klein ist, als Entwurf eines Pull-Requests ausprobiert. Siehe [Issues einordnen](/guide/engineering#issue-triage).
- [**Abhängigkeiten pflegen**](/settings?s=tasks&find=Dependency%20gardener): einmal pro Woche (zunächst montags um 09:00) Upgrades in Worktrees mit ausgeführten Tests, Sicherheitskorrekturen zuerst, ein Pull-Request pro Risikostufe oder ein Bericht. Siehe [Abhängigkeiten pflegen](/guide/engineering#dependency-gardener).
- [**Erste Hilfe bei Störungen**](/settings?s=tasks&find=Incident%20first%20responder): eine Warnung von Sentry, Grafana, Datadog, Better Stack oder einem anderen Dienst weckt einen Agenten, der dich sofort informiert, die wahrscheinliche Ursache findet und vor jedem Rollback nachfragt. Siehe [Erste Hilfe bei Störungen](/guide/engineering#incident-first-responder).

Das Formular eines Webhook-Beispiels sagt unter seinen Feldern, wohin seine Adresse gehören wird; sobald die Aufgabe erstellt ist, sagt ihre Zeile unter der Adresse dasselbe.

## Eine Aufgabe mit einem Testlauf ausprobieren

**Testlauf** in der Fußzeile des Formulars führt die Aufgabe jetzt einmal aus, so wie das Formular sie hat, ohne sie zu speichern. Er läuft wie ein echter Lauf, in einer eigenen Sitzung mit dem Titel „Test: <Name> · <Zeit>“, und ein Streifen im Formular zeigt nach dem Ende **Testlauf** mit dem Ergebnis sowie **Sitzung öffnen**. Ein Testlauf zählt nie zu den Fehlschlägen, die eine Aufgabe pausieren. Beim Testen einer Aufgabe, die du gerade bearbeitest, werden ihre Notizen gelesen, und er erscheint in ihrem Verlauf als **Testlauf**; eine neue Aufgabe hat noch keine Notizen.

Um eine aufgabe auszuprobieren, die sendet, postet oder löscht, ohne dass etwas hinausgeht, öffne das Menü neben **Testlauf** (**Weitere Möglichkeiten zum Testen**) und wähle **Ohne Versand testen**, oder wähle **Ohne Versand testen** im Menü (⋯) einer gespeicherten Aufgabe. Sie läuft genauso, aber jeder Aufruf eines Tools eines verbundenen Kontos, das nach außen wirkt (sendet, postet, veröffentlicht, antwortet, einlädt, teilt, löscht oder bezahlt), und jeder Aufruf eines Tools auf „Vorher fragen“ wird als „wäre gesendet worden“ festgehalten und nie ausgeführt. Der Agent wird darüber informiert und macht weiter, als wäre es erfolgt. Sein Streifen, sein Lauf im **Verlauf** und seine Sitzung listen auf, was er **Wäre gesendet worden**, und danach wartet nichts im Postausgang. Lesen funktioniert wie gewohnt. Siehe [Verbundene Apps, Keys und Tools](/guide/connections#ask-first-calls-that-wait-for-your-ok).

## Eine Aufgabe jetzt ausführen

Menü der Aufgabe (⋯) → **Jetzt ausführen** startet sofort einen Lauf, egal ob die Aufgabe eingeschaltet oder pausiert ist, und öffnet ihre Sitzung.

## Nachsehen, wie die Läufe verlaufen sind

Menü der Aufgabe (⋯) → **Verlauf**, oder **Verlauf** neben den Punkten, öffnet die Läufe der Aufgabe, die neuesten zuerst (die letzten 50 werden angezeigt; die App behält 100 pro Aufgabe). Jeder Lauf zeigt:

- Wie er verlaufen ist: **Läuft**, **Fertig**, **Teilweise erledigt**, **Blockiert** (der Agent braucht dich: Zugriff oder eine Entscheidung), **Fehlgeschlagen**, **Nichts Neues** oder **Fehler** (er konnte nicht starten, oder sein Durchgang endete mit einem Fehler).
- Wann er begonnen hat, was ihn gestartet hat (**Nach Zeitplan**, **Webhook**, **Beobachter**, **Jetzt ausführen**, **Wiederholen**, **Testlauf** oder **Ohne Versand testen**), wie lange er gedauert hat und was er gekostet hat.
- Bei einem Test ohne Versand, was er **Wäre gesendet worden**: jeder Aufruf, mit dem Konto, dem Tool und dem Empfänger, an den er gegangen wäre.
- Die einzeilige Zusammenfassung des Agenten. Wähle eine lange aus, um die gesamte letzte Antwort des Agenten zu lesen.
- **Sitzung öffnen** und **Mit derselben Eingabe erneut ausführen**, was die Aufgabe noch einmal mit dem ausführt, was jener Lauf erhalten hat: derselbe Webhook-Aufruf oder dieselbe Änderung, die ein Beobachter gesehen hat.

Das Ergebnis ist das, was der Agent am Ende gemeldet hat. Hat er nichts gemeldet, entscheidet die App: **Fehler**, wenn der Durchgang mit einem solchen endete, **Nichts Neues**, wenn die Antwort mit [SILENT] beginnt oder nur sagt, dass es nichts zu berichten gibt, und sonst **Fertig**. In der Sitzung des Laufs erscheint der Bericht des Agenten als Schritt: „Reported done: …“.

## Notizen, die eine Aufgabe zwischen den Läufen behält

Unter dem Verlauf liegt der Notizblock der Aufgabe, **Notizen für weitere Läufe**: was der nächste Lauf wissen sollte, etwa was schon gemeldet wurde, eine laufende Summe oder wo er aufgehört hat. Jeder Lauf liest ihn zu Beginn, und der Agent ergänzt ihn oder schreibt ihn neu. Wähle **Bearbeiten**, um ihn selbst zu ändern, dann **Speichern** (oder **Abbrechen**). Er fasst bis zu 8.000 Zeichen; darüber hinaus fallen die ältesten Zeilen weg.

## Benachrichtigungen einer Aufgabe

Ein Lauf sagt dir mit der üblichen Benachrichtigung seiner Sitzung, wie er verlaufen ist, mit dem Namen der Sitzung als Titel und der einzeiligen Zusammenfassung des Agenten. Sie folgt deinen Benachrichtigungseinstellungen (siehe [Posteingang und Benachrichtigungen](/guide/inbox)).

- Ein Lauf ohne etwas zu berichten sendet nichts.
- Ein fehlgeschlagener Lauf oder einer, der mit einem Fehler endete, sendet immer eine Fehlermeldung.
- Ein blockierter Lauf sendet eine Meldung, dass er dich braucht, die mit „Blocked:“ beginnt.
- Ein Lauf, der nicht starten konnte (sein Ordner ist weg, die Sitzung, in die er postet, wurde gelöscht), sendet eine Fehlermeldung, „Could not start: …“.
- Eine Aufgabe, die sich selbst pausiert, sendet eine Meldung mit dem Grund.
- Ein Lauf, der seine Aufgabe beendet, sagt es: „Its job is done, so its schedule was deleted.“
- Ein Lauf, der in eine deiner Unterhaltungen postet, lässt die Benachrichtigungen dieser Unterhaltung unverändert.

Ein Agent kann dir auch während der Arbeit eine Benachrichtigung senden (sein Tool notify_user), für etwas, das nicht bis zum Ende des Laufs warten kann; das kann jeder Agent, und auch der Schritt einer App.

## Eine Aufgabe pausieren, einschalten, bearbeiten, duplizieren oder löschen

- **Pausieren oder einschalten**: der Schalter in der Zeile der Aufgabe. Eine pausierte Aufgabe läuft nicht und beobachtet nichts, und ihr Webhook lehnt Aufrufe ab. Beim erneuten Einschalten einer Aufgabe werden ihre Fehlerzählung und der Grund der Pausierung gelöscht.
- **Selbst pausieren**: nach der eingestellten Anzahl von Fehlschlägen in Folge pausiert sich die Aufgabe, und ihre Zeile nennt den Grund („Paused after 3 failed runs in a row. The last: …“).
- **Bearbeiten**: Menü der Aufgabe (⋯) → **Bearbeiten** öffnet das Formular als **Aufgabe bearbeiten**; wähle **Speichern**.
- **Duplizieren**: öffnet ein neues Aufgabenformular mit einer Kopie namens „<Name> (copy)“, die du ändern und speichern kannst.
- **Löschen**: fragt zuerst nach: „It stops running, and its history goes. Sessions it started stay.“
- **Selbst löschen**: Eine Aufgabe, die nicht mehr gebraucht wird, verschwindet von selbst, etwa eine Minute nach dem Ende ihres letzten Laufs: eine einmalige Aufgabe nach einem erfolgreichen Lauf und eine Aufgabe, deren Lauf seine Arbeit als erledigt befunden hat, weil das eingetreten ist, worauf sie gewartet oder was sie beobachtet hat, und ihr Prompt sagte, dann aufzuhören (die Benachrichtigung des Laufs sagt es). Die Zeitpläne eines Agenten werden mit dem Agenten gelöscht.

## Einen Agenten eine Aufgabe einrichten lassen

Frag in einer beliebigen Unterhaltung, ganz in deinen eigenen Worten: „Erinnere mich am Freitag um 9 daran, den Zahnarzt anzurufen“, „Fasse jeden Montagmorgen die Issues der letzten Woche zusammen“, „Sag mir Bescheid, wenn sich diese Seite ändert“. Der Agent schlägt die Aufgabe vor, und eine Karte zeigt sie in der Unterhaltung. Nichts wird gespeichert, bevor du antwortest.

Die Karte fragt **Diese Aufgabe planen?**, mit dem Namen der Aufgabe und **Wartet auf dich**, und zeigt:

- **Wann**: den Zeitplan in Worten, mit den nächsten Ausführungen in deiner Zeitzone. Bei einem Watcher: was er beobachtet und wie oft, mit der Adresse, dem Befehl oder dem Tool einer verbundenen App, und „Es sieht richtig aus, sobald du bestätigst, und der Agent wacht nur auf, wenn sich etwas geändert hat.“
- **Aktion**: den Prompt (**Alles davon** öffnet einen langen Prompt).
- **Ausführungen**: den Agenten, sein Modell (**Automatisch**, wenn die Unterhaltung darauf steht) und wo: in einer neuen Sitzung in einem Ordner oder in dieser Unterhaltung.

Dann wähle:

- **Einplanen**: speichert die Aufgabe und aktiviert sie.
- **Bearbeiten…**: öffnet das Aufgabenformular mit allem ausgefüllt, damit du vorher beliebige Teile ändern kannst; die Schaltfläche heißt dort ebenfalls **Einplanen**.
- **Nicht jetzt**: lehnt ab.

Der Agent erfährt deine Antwort als Nachricht, auch alle Teile, die du geändert hast, du musst es ihm also nicht sagen. Die Karte bleibt mit dem Ergebnis in der Unterhaltung („Eingeplant“, „Nächste Ausführung …“, ein Link zu **Geplante Aufgaben**) und zeigt auf deinen anderen Geräten dasselbe.

Wenn du nichts anderes verlangst, läuft die Aufgabe mit dem Agenten, dem Modell, den Berechtigungen und dem Ordner der Unterhaltung (eine Unterhaltung auf **Automatisch** erzeugt eine Aufgabe, die ebenfalls auf Automatisch startet), und die Sitzung jeder Ausführung beginnt mit den Einstellungen der Unterhaltung: Agent, Memory, Ausgabenlimit, verbundene Konten und Projekt. Bitte darum, dass die Ausführungen hier posten, dann schreibt jede in diese Unterhaltung, statt eine neue Sitzung zu starten.

Agenten können deine Aufgaben auch ändern, pausieren, wieder aktivieren oder löschen, immer zuerst mit einer Karte: **Diese Aufgabe ändern?** (die Teile, die sich ändern, mit dem alten Wert durchgestrichen über dem neuen), **Diese Aufgabe pausieren?**, **Diese Aufgabe wieder aktivieren?** oder **Diese Aufgabe löschen?**, jeweils mit eigenem Ja und Nein (**Ändern** oder **Unverändert lassen**, **Pausieren** oder **Weiterlaufen lassen**, **Aktivieren** oder **Pausiert lassen**, **Löschen** oder **Beibehalten**). Sie können auch deine Aufgaben auflisten, mit der nächsten Ausführung und dem Ergebnis der letzten.

Agenten löschen eine Aufgabe, die nicht mehr gebraucht wird, statt sie zu pausieren. Bei einer Aufgabe, die enden soll, wenn etwas eintritt („bis die neue Version draußen ist“, „sobald mein Paket angekommen ist“), schreiben sie das in den Prompt, und die Ausführung, die das Ereignis bemerkt, beendet die Aufgabe.

Einige Grenzen halten das im Rahmen:

- Eine Unterhaltung kann bis zu fünf Vorschläge haben, die auf deine Antwort warten.
- Ein Agent kann keine neue Aufgabe vorschlagen, sobald du 100 hast.
- Eine geplante Ausführung kann keine Aufgaben planen oder ändern; stattdessen soll sie in ihrer Zusammenfassung eine vorschlagen. Sie kann nur ihre eigene Aufgabe beenden, wenn ihr Auftrag erledigt ist.
- Ein Watcher, den ein Agent vorschlägt, erreicht nie Adressen auf deinem eigenen Computer oder in deinem eigenen Netzwerk.

## Eine Sitzung in eine Aufgabe umwandeln

Wenn eine Sitzung etwas getan hat, das du wiederholen möchtest: Menü der Sitzung (⋯) → **Mehr** → **In Automatisierung umwandeln**. Das [Hilfsmodell](/settings?s=models&find=Helper%20model) liest die Unterhaltung und entwirft eine Aufgabe: einen Prompt, der von allein erneut laufen kann (ohne die einmaligen Details dieses Mals, mit deinen Korrekturen eingearbeitet), und einen passenden Auslöser. Agent, Modell, Aufwand, Berechtigungen, Ordner und die Einstellungen der Sitzung kommen aus der Sitzung (eine Sitzung auf **Automatisch** ergibt eine Aufgabe, die auf Automatisch startet); eine Sitzung in einem Worktree läuft in dem Repository, aus dem sie stammt.

Das Formular öffnet sich als **Neue Automatisierung aus dieser Sitzung**, mit einer Zeile, die erklärt, warum dieser Auslöser gewählt wurde. Ändere, was du willst, probiere einen Testlauf aus und speichere dann; die Aufgabe findest du danach unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks). Eine Sitzung ohne Nachrichten von dir kann nicht in eine Aufgabe umgewandelt werden.

## Erinnerungen

Eine Erinnerung ist eine Aufgabe, deren Ausführung dich zu einer bestimmten Zeit über etwas informiert, als Benachrichtigung und in ihrer Sitzung. Es gibt drei Wege, eine einzurichten:

- Bitte einen Agenten: „Erinnere mich morgen um 8 daran, die Mülltonnen rauszustellen.“ Er schlägt eine Aufgabe vor, die einmal läuft, und du bestätigst sie auf der Karte.
- Nutze das Beispiel [**Erinnerung**](/settings?s=tasks&find=Reminder) für eine, die sich an den von dir gewählten Tagen wiederholt.
- Lege eine **Neue Aufgabe** mit **Einmal** unter **Wann** an, und einem Prompt wie „Erinnere mich in einer freundlichen Zeile daran, den Zahnarzt anzurufen.“

## Auf dem Smartphone

[Einstellungen → Geplante Aufgaben](/settings?s=tasks) funktioniert auf dem Smartphone genauso, und [Zeitpläne](/agents/schedules) zeigt jeweils einen Tag. Das Aufgabenformular, die Formulare der Beispiele und die Bestätigungen (vor **Löschen** oder **Neue Adresse**) öffnen sich als Sheets am unteren Bildschirmrand. Die Auswahlmöglichkeiten unter **Wann** und die Arten eines Watchers lassen sich seitlich scrollen, wenn sie nicht passen, und die Beispiele erscheinen als einspaltige Zeilen. Damit du auch bei geschlossener App von deinen Aufgaben hörst, aktiviere Benachrichtigungen für das Smartphone (siehe [Posteingang und Benachrichtigungen](/guide/inbox)).

## Einen Agenten fragen

- „Gib mir jeden Werktag um 7:30 das Wetter in Athen und die KI-Nachrichten seit gestern.“
- „Erinnere mich am Freitag um 9 daran, den Zahnarzt anzurufen.“
- „Lass meinen Morgenüberblick auf Automatisch laufen.“
- „Beobachte diese Produktseite und sag mir Bescheid, wenn der Preis unter 99 € fällt.“
- „Wann immer eine E-Mail mit einer Rechnung von meinem Steuerberater eintrifft, speichere das PDF in ~/Invoices und füge meiner Ausgabentabelle eine Zeile hinzu.“
- „Starte eine Aufgabe, wenn in HubSpot ein neuer Deal eingeht: Recherchiere das Unternehmen und entwirf eine erste Antwort an den Ansprechpartner.“
- „Informiere mich dreißig Minuten vor jedem Kundentermin in meinem Google Calendar darüber, wen ich treffe und worüber wir zuletzt gesprochen haben.“
- „Welche meiner geplanten Aufgaben sind diese Woche fehlgeschlagen, und warum?“
- „Was auf meinen Boards wird morgen früh aktualisiert, und was kosten diese Aktualisierungen im Monat?“
- „Was läuft morgen von allein, und um welche Uhrzeit?“
- „Warum haben so viele meiner Aufgaben am Montag um 08:00 gestartet? Verteile sie zeitlich.“
- „Pausiere meinen Morgenüberblick“ oder „Führe den Wochenbericht jetzt aus.“
- „Prüfe alle 30 Minuten, ob mein Paket zugestellt wurde, sag mir Bescheid, wenn es so weit ist, und höre dann auf.“
- „Welche meiner geplanten Aufgaben werden nicht mehr gebraucht? Lösche sie.“
- „Teste meine Rechnungserinnerungen, ohne etwas zu senden, und zeig mir die E-Mails, die sie versendet hätte.“
- „Mach aus dieser Unterhaltung eine Aufgabe, die jeden Montag um 9 läuft.“
- „Führe meine Leseliste-App aus, sobald dieser Feed einen neuen Beitrag hat, mit dem Link des Beitrags.“
- „Richte einen CI-Doktor für ~/code/shop auf GitHub Actions ein, der instabile Jobs erneut ausführen darf.“
