# Nutzung, Limits und Kosten

Claude Code und Codex nutzen Abonnements mit Nutzungslimits. Gleichzeitig lässt sich jedem Modellaufruf ein API-Preis zuordnen. Hier erfährst du, wo du deinen Verbrauch und die nächste Zurücksetzung siehst, was beim Erreichen eines Limits passiert, wie Sitzungen danach automatisch weiterlaufen und wie die App Aktivität und geschätzte Kosten erfasst. Eigene Modellpreise kannst du ebenfalls hinterlegen.

![Nutzung: Verbrauch der einzelnen Abonnements und Zeitpunkt ihrer Zurücksetzung](images/usage.webp)

## Die Nutzungsseite öffnen

Öffne **System** in der Seitenleiste und dann den Tab **Nutzung**. Auf dem Smartphone öffnest du zuerst die Seitenleiste. Ein schmaler Balken unter dem System-Symbol zeigt die verbleibende Nutzung aller bezahlten Claude-Code- und Codex-Abonnements. Für jedes Abo zählt dabei das am weitesten ausgeschöpfte Limit. Hast du ausschließlich kostenlose Abos, zeigt der Balken diese; ohne Abos entfällt er. Sind alle Kontingente aufgebraucht, wird er rot. Beim Darüberfahren siehst du die verbleibende Nutzung je Abo.

Die [Nutzungsseite](/usage) hat drei Tabs:

- **Grenzen** (`/usage`): verbleibendes Kontingent und nächste Zurücksetzung.
- **Aktivität** (`/stats`): geänderte Zeilen, Token und Sitzungen im Zeitverlauf.
- **Arena** (`/arena`): welche Modelle bei deinen eigenen Aufgaben gewinnen.

Die App aktualisiert den Verbrauch beim Öffnen der Seite und danach alle fünf Minuten, solange sie geöffnet ist. Im Tab Limits liest **Aktualisieren** die Werte sofort erneut ein.

## Die Limits eines Abos verstehen

Der Tab **Grenzen** zeigt Karten für Claude Code, Codex und jedes Konto, das du unter [Einstellungen → Agenten → Konten](/settings?s=accounts) hinzugefügt hast. Auf breiten Bildschirmen stehen zwei Karten nebeneinander, auf Smartphones untereinander.

Jede Karte zeigt E-Mail-Adresse und Tarif des Kontos, das Alter der angezeigten Werte und eine Zeile pro Limit. Ein Limit begrenzt die Nutzung innerhalb eines Zeitfensters:

- Claude Code: **Aktuelle Sitzung (5 Std.)**, **Wöchentlich · alle Modelle** und modellspezifische Wochenlimits wie **Wöchentlich · nur Sonnet**.
- Codex: **5-Stunden-Fenster**, **Wöchentlich** oder andere Zeitfenster. Bei mehreren Limits beginnt jede Zeile mit deren Bezeichnung.

Jede Zeile zeigt den verbrauchten Anteil mit einem Balken, den verbleibenden Anteil und die nächste Zurücksetzung, etwa „wird in 2 Std. 15 Min. zurückgesetzt“. Beim Darüberfahren erscheint der genaue Zeitpunkt. Ab 90 % Verbrauch wird ein Warnsymbol angezeigt.

Je nach Tarif siehst du außerdem:

- **Zusätzliche Nutzung** bei Claude: ob kostenpflichtige Nutzung über das Abo hinaus aktiviert ist und wie viel des monatlichen Zusatzbudgets verbraucht wurde.
- **Credits** bei Codex: deinen Guthabenstand oder „Unbegrenzt“.
- **Limit-Resets**: aktuell verfügbare Resets; siehe [Einen Limit-Reset verwenden](#use-a-limit-reset).
- **Diese Woche nach Nutzungsbereich** bei Claude: wie sich die Nutzung auf die verschiedenen Claude-Anwendungen verteilt.
- **Token pro Tag** bei Codex: die letzten 30 Tage und der Gesamtverbrauch seit Beginn. Ein Token ist ein Wortteil; Modelle messen damit gelesenen und erzeugten Text.

Bei Problemen erscheint ein entsprechender Hinweis:

- „Nicht angemeldet“ mit **In den Einstellungen anmelden**;
- „Für diesen Tarif wurden keine Nutzungslimits gemeldet“;
- eine Fehlermeldung mit **Anmeldung in den Einstellungen prüfen**;
- „Zuletzt bekannte Werte: …“, wenn die letzte Abfrage fehlgeschlagen ist.

## Was beim Erreichen eines Limits passiert

Ist das Kontingent eines Abos aufgebraucht, endet der laufende Agentendurchlauf. Ein Hinweis nennt das Konto, das betroffene Limit und den Zeitpunkt der Zurücksetzung. Bei einem einzelnen Konto heißt es beispielsweise „Du hast das Nutzungslimit von Claude Code erreicht“, entsprechend auch für Codex. Sind alle Konten eines Agenten ausgeschöpft, erscheint „Alle deine Claude-Code-Konten haben ihr Nutzungslimit erreicht“. Hat ein anderes Konto noch Kontingent, wird das betroffene Konto namentlich genannt, etwa „Arbeit hat sein Nutzungslimit erreicht“.

- auf der Startseite über dem Nachrichtenfeld, passend zum ausgewählten Agenten und Konto;
- in der Sitzung über dem Nachrichtenfeld;
- auf der Karte des Abos unter Nutzung.

Der Hinweis bietet folgende Möglichkeiten:

- **Beim Zurücksetzen fortsetzen**: Ist **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** noch deaktiviert, kannst du damit die einzelne Sitzung automatisch weiterlaufen lassen. Eine Minute nach der Zurücksetzung erhält sie die Nachricht „Mach dort weiter, wo du aufgehört hast.“ Anschließend erscheint „Diese Sitzung wird nach der Zurücksetzung automatisch fortgesetzt“ mit **Abbrechen**.
- **Reset verwenden**: verfügbar, wenn das Konto einen jetzt nutzbaren Limit-Reset hat, etwa „2 Resets verfügbar“.

Ist das Limit bereits aufgehoben, die automatische Fortsetzung aber noch ausstehend, zeigt der Hinweis „Wird automatisch fortgesetzt in …“ mit **Abbrechen**.

## Sitzungen nach einem Limit automatisch fortsetzen

Damit jede Sitzung, die ein Limit erreicht, von selbst weiterläuft, öffne [Einstellungen → App → Allgemein](/settings?s=general&find=Resume%20after%20usage%20limits) und aktiviere **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** (wenn ein Durchgang endet, weil die Nutzung eines Abos aufgebraucht ist, läuft die Sitzung eine Minute nach dem Zurücksetzen des Limits von selbst weiter). Die Funktion ist ausgeschaltet, bis du sie einschaltest. Sie arbeitet auch, wenn kein Browser geöffnet ist. Ist sie an, zeigt eine Sitzung keine Warnung, wenn ein Limit sie stoppt: Eine Zeile über dem Nachrichtenfeld nennt, wessen Limit erreicht wurde (wie die Benachrichtigung), welches Limit und „Wird automatisch fortgesetzt in …“, mit **Reset verwenden**, wenn das Konto einen hat, und **Abbrechen**.

So funktioniert das Timing, mit dem Schalter oder mit **Beim Zurücksetzen fortsetzen**:

- Der geplante Zeitpunkt liegt eine Minute nach der zuletzt vom Anbieter gemeldeten Zurücksetzung. Während der Wartezeit fragt die App den Verbrauch regelmäßig ab, kurz vor Ablauf häufiger. Verschiebt der Anbieter den Termin, passt die App ihn an.
- Wird das Limit früher aufgehoben, etwa durch einen Reset oder die Anmeldung mit einem anderen Konto, läuft die Sitzung sofort weiter. Wurde sie innerhalb der letzten 15 Minuten bereits vorzeitig fortgesetzt und erneut gestoppt, wartet sie stattdessen auf die reguläre Zurücksetzung.
- Fortgesetzt wird nur ein Durchgang, den das Limit wirklich gestoppt hat, nicht einer, der gerade fertig wurde, als die Nutzung des Abos 100 % erreichte. Eine geplante Fortsetzung entfällt, wenn die Sitzung ohne sie weitergeht: Du sendest eine Nachricht oder drückst **Stoppen**, oder ein Durchgang läuft normal durch. Ein Durchgang, den der Agent während des Wartens von selbst startet (wenn eine eigene Hintergrundaufgabe oder ein eigener Subagent am selben Limit stoppt), lässt sie nicht entfallen. Eine Sitzung, die du mit **Stoppen** angehalten hast, wird nie von selbst fortgesetzt, auch wenn der Fehler des Limits zuerst kam, bis du ihr eine Nachricht sendest.
- **Abbrechen** im Hinweis hebt die geplante Fortsetzung auf.

Bei mehreren Konten setzt [**Bei erreichtem Limit das Konto wechseln**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) die Sitzung sofort mit einem anderen Konto fort. Gewartet wird erst, wenn alle Konten ausgeschöpft sind; siehe [Agenten, Konten und Modelle](/guide/agents-models#use-all-your-accounts-switch-at-a-limit). Für Claude Code kann [**Bei erreichtem Limit API-Guthaben verwenden**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit) stattdessen den gespeicherten Anthropic-API-Key zur Abrechnung nutzen; siehe [API-Guthaben verwenden, wenn alle Konten ausgeschöpft sind](/guide/agents-models#use-api-credit-when-every-account-is-at-its-limit).

## Einen Limit-Reset verwenden

Manche Abos geben dir Limit-Resets: Reset-Guthaben bei Codex und Reset-Gutschriften bei Claude. Wenn du einen verwendest, werden die Nutzungslimits des Abos sofort zurückgesetzt, statt dass du auf ihr Zurücksetzen wartest.

Jede Karte listet sie unter **Limit-Resets** auf, mit der Anzahl, die du hast. Jeder Reset zeigt seinen Namen (und wie viele Verwendungen er noch hat), „Läuft ab in …“ (in Warnfarbe, wenn es weniger als einen Tag dauert) oder „Läuft nicht ab“ und Hinweise wie „Nutzbar, sobald du ein Limit erreichst“ oder „Noch nicht nutzbar“. Ein Reset, den ein anderes Limit zurückhält, sagt, welches, und wann es endet: „Gesperrt, solange dein Wochenlimit aufgebraucht ist (nutzbar in …)“. Manche Claude-Resets setzen nur einen Teil deines Kontingents zurück, sodass du sie nicht verwenden kannst, solange dein Wochenlimit aufgebraucht ist; nutzbar werden sie, sobald es zurückgesetzt wird. Gibt es keine: „Im Moment gibt es keine Limit-Resets“, mit dem Zeitpunkt des nächsten, wenn das Abo ihn nennt. Die App prüft die Resets eines Claude-Kontos etwa alle zehn Minuten, da Anthropic häufigere Abfragen ablehnt, und zeigt dazwischen die zuletzt gelesene Liste, auch nach einem Neustart der App. Ein Reset kann deshalb einige Minuten brauchen, bis er als nutzbar erscheint. Einer, den du verwendest, verschwindet sofort aus der Liste.

1. Klicke neben einem Reset auf **Benutzen** oder im Limithinweis auf **Reset verwenden**. Dort wird der erste aktuell nutzbare Reset gewählt.
2. Lies die Bestätigung: Dort stehen der verwendete Reset, dessen Ablaufdatum und der verbleibende Bestand. Ist kein Limit erreicht, erscheint eine entsprechende Warnung.
3. Klicke auf **Reset verwenden**.

Die App meldet das Ergebnis, etwa „Codex-Nutzungslimits wurden zurückgesetzt“, „Claude hat aktuell kein Nutzungslimit erreicht; es wurde nichts zurückgesetzt“, „Resets sind vorübergehend gesperrt. Versuche es später erneut“ oder „Dieser Reset wurde bereits verwendet“. Nach einem erfolgreichen Reset läuft eine wartende Sitzung sofort weiter.

Für Claude-Resets muss Claude Code mit einem Claude-Abonnement angemeldet sein. API-Abrechnung reicht dafür nicht aus.

## Die bisherige Aktivität der Agenten ansehen

Der Tab **Aktivität** (`/stats`) erfasst die Arbeit der Agenten aus den Sitzungen, die der App auf diesem Computer bekannt sind.

Oben wählst du:

- **Täglich** für die letzten 30 Tage, **Wöchentlich** für 26 Wochen, **Monatlich** für zwölf Monate oder seit Beginn deiner Historie und **Jährlich** nach Kalenderjahr. Die Seite merkt sich deine Auswahl.
- **Alle** oder einen Agenten: **Claude**, **Codex**, **Benutzerdefiniert** und weitere hier bereits aktive Agenten wie Gemini CLI oder OpenCode.
- Ein Modell, wenn du es weiter unten unter **Nach Modell** ausgewählt hast. Die Seite zeigt dann nur dessen Werte. Mit dem **✕** an seiner Markierung wechselst du zurück zu allen Modellen.
- **Diagramme** oder **Tabelle**.

Daneben stehen Zeitraum und Zeitzone. Tage, Wochen und Monate richten sich nach deiner Zeitzone.

Die Kacheln zeigen die Summen für den gewählten Zeitraum:

- **Zeilen hinzugefügt** und **Zeilen entfernt**;
- **Eingabetoken**, also neu eingelesene und aus dem Cache gelesene Token, und **Ausgabetoken**, also erzeugten Text;
- **Ausgabegeschwindigkeit** in Token pro Sekunde während der Texterzeugung;
- **API-Kosten (geschätzt)** für dieselbe Tokenmenge bei API-Abrechnung;
- **Prompts** mit der Anzahl der Durchläufe, **Sitzungen**, **Befehle** mit der Anzahl der Tool-Aufrufe und **Dateiänderungen**.

Der kleine Pfeil auf einer Kachel vergleicht den Wert mit dem unmittelbar vorhergehenden gleich langen Zeitraum, etwa den vorherigen 30 Tagen. Die Anzeige ist neutral: Mehr bedeutet weder besser noch schlechter.

**Diagramme** zeigt geänderte Zeilen, hinzugefügte nach oben und entfernte nach unten, Eingabetoken mit neuem und aus dem Cache gelesenem Anteil, Ausgabetoken und Ausgabegeschwindigkeit. Hinzu kommen kleine Balkendiagramme für Prompts, Sitzungen, Befehle und Dateiänderungen. Jeder Balken entspricht einem Tag, einer Woche, einem Monat oder einem Jahr. **Tabelle** zeigt dieselben Werte je Zeitraum, neueste zuerst, mit einer Gesamtsumme.

Darunter findest du in beiden Ansichten:

- **Nach Agent**: jeder Agent mit Namen (Claude Code, Codex, Custom, Gemini CLI und die anderen, die etwas getan haben), mit Sitzungen, Prompts, Zeilen, Eingabe und Ausgabe.
- **Top-Projekte**: die Ordner mit den meisten geänderten Zeilen.
- **Nach Modell**: Sitzungen, Prompts, Eingabetoken, Eingabetoken aus dem Cache, Ausgabetoken und API-Kosten je Modell. Das gilt auch für Custom-Modelle von OpenRouter, Ollama oder vLLM. Klicke auf ein Modell, um die gesamte Seite darauf einzugrenzen. Bei unbekanntem Preis erscheint **Preis festlegen**. Beim Darüberfahren siehst du den Preis pro Million Token und seine Quelle: „eigener Preis“ oder „öffentliche Preistabelle“.

Auf Smartphones stehen zwei Kacheln nebeneinander; einige Tabellenspalten werden ausgeblendet.

Die Startseite fasst den heutigen Tag in einer Zeile unter dem Nachrichtenfeld zusammen, sobald die Agenten heute etwas getan haben: „Heute · 7 Sitzungen · 12 Dateiänderungen · $0.84“, wobei ein Teil, der null ist, entfällt. Das Geld sind die **API-Kosten (geschätzt)** des Tages: Bei einem Abo (Claude Code, Codex) zahlst du stattdessen die Gebühr deines Abos, wie der Hinweis beim Darüberfahren sagt. Fahre über die Zeile, um die hinzugefügten und entfernten Zeilen, die Eingabe- und Ausgabe-Tokens und die Prompts zu sehen; ein Klick darauf öffnet Aktivität.

## Wie die Kostenschätzung funktioniert

Claude- und ChatGPT-Abos haben einen festen Preis. Deshalb zeigt die App, was dieselbe Arbeit bei nutzungsabhängiger API-Abrechnung kosten würde. So kannst du den Nutzen eines Abos und mögliche API-Kosten einschätzen. Dieselbe Schätzung erscheint bei abgeschlossenen Durchläufen, etwa „≈ $0.12“ mit Details unter **Zeit und Kosten**, und in der **Heute**-Zeile. Bei Abo-Nutzung weist der Infotext darauf hin.

- Grundlage ist die öffentliche Preistabelle von LiteLLM. Die App lädt sie höchstens einmal täglich und hält sie auch offline bereit.
- Selbst festgelegte Preise haben Vorrang.
- Die Token einer Sitzung werden dem verwendeten Modell zugeordnet. Bei Modellwechseln gilt das zuletzt genutzte Modell.
- Eingabe aus dem Cache (Text, den das Modell schon früher gelesen hat und der aus seinem Cache kommt) wird zum Cache-Preis berechnet, oder zum Eingabepreis, wenn es keinen gibt.
- Modelle ohne bekannten Preis (nur ein Familienname wie „opus“ oder ein Modell, das die Tabelle nicht aufführt) zählen in den Summen nichts und zeigen unter „Nach Modell“ **einen Preis festlegen**.

OpenRouter-Preise einschließlich Cache-Preisen lädt die App automatisch. Du musst sie nicht eintragen. Ist kein Preis verfügbar, steht unter **Nach Modell** ein Strich statt der Aufforderung zur Preiseingabe.

Ausgabenlimits verwenden dieselben Preise. Meldet ein Agent tatsächliche Kosten, haben diese Vorrang: etwa Claude Codes Kosten oder der von OpenRouter gemeldete Betrag eines Custom-Aufrufs. Ein lokal ausgeführtes Modell zählt dort als kostenlos.

## Eigene Modellpreise festlegen

1. Klicke im Tab **Aktivität** oberhalb von **Nach Modell** auf **Modellpreise** oder bei einem Modell auf **Preis festlegen**.
2. Der Dialog **Modellpreise** listet die Modelle in der Ansicht und alle, für die du schon einen Preis festgelegt hast. Jedes hat **Eingabe**, **Aus dem Cache** und **Ausgabe**, in Dollar pro Million Tokens. Leere Felder verwenden den Preis aus der öffentlichen Tabelle, der grau angezeigt wird.
3. Trage deine Preise ein. Eingabe und Ausgabe sind erforderlich. Der Cache-Preis ist optional; ohne Angabe gilt der Eingabepreis.
4. Für ein nicht aufgeführtes Modell trägst du dessen ID unter **Eine andere Modell-ID** ein und klickst auf **Hinzufügen**.
5. Klicke auf **Preise speichern**.

Das Papierkorbsymbol **Preis aus der Tabelle verwenden** entfernt deinen eigenen Preis. Soll ein lokales Modell als kostenlos zählen, setze Ein- und Ausgabepreis auf 0.

## Jede Sitzung bleibt erhalten

Die App bewahrt Sitzungen und ihre Kennzahlen unabhängig davon auf, wie sich das jeweilige Agentenprogramm verhält. Claude Code löscht Unterhaltungen normalerweise nach 30 Tagen. Daher weist die App jedes Claude-Code-Konto ohne eigene Aufbewahrungsangabe an, sie zu behalten. Zusätzlich hält sie eine eigene Dateiverknüpfung zu jeder Unterhaltung von Claude Code und Codex. Löscht das Agentenprogramm oder jemand anderes die ursprüngliche Datei, bleibt die Unterhaltung aufgelistet und zugänglich. Die Verknüpfung ist dieselbe Datei unter einem zweiten Namen und benötigt keinen zusätzlichen Speicherplatz.

Gelöscht werden Sitzungen, die seit einem Jahr inaktiv sind, sofern du das nicht unter [Einstellungen → Allgemein → Inaktive Sitzungen löschen](/settings?s=general&find=Delete%20inactive%20sessions) änderst; siehe [Inaktive Sitzungen löschen](/guide/app#delete-inactive-sessions). Die zugehörigen Kennzahlen bleiben in Aktivität erhalten.

Unterhaltungen, die Claude Code bereits vor Einführung dieser Aufbewahrung gelöscht hat, lassen sich nicht wiederherstellen. Die Aktivitätshistorie beginnt mit der ersten Erfassung durch die App.

## Die Ausgaben einer Sitzung begrenzen

Ein Ausgabenlimit stoppt die Sitzung, sobald der festgelegte Betrag erreicht ist. Gerechnet wird mit API-Preisen, unabhängig von deinem Abo. Gestartete Subagenten zählen mit.

- Für eine neue Sitzung: Wähle auf der Startseite **Optionen** → **Ausgabenlimit**. Wähle $1, $5, $10 oder $25 oder gib einen Betrag ein und klicke auf **Set**. **Keine Obergrenze** hebt es auf.
- Für eine laufende Sitzung: das Menü der Sitzung (⋯) → **Sitzungseinstellungen** → **Ausgabenlimit**. Der Dialog zeigt, was sie bisher ausgegeben hat. Gib ein Limit ein (ab $0.01) und klicke auf **Limit festlegen** oder **Veränderung**; **Limit entfernen** hebt es auf.

Bei aktivem Limit steht über dem Nachrichtenfeld etwa „$1.20 von $5.00“ mit **Ändern**. Nach dem Modellaufruf, der das Limit erreicht, stoppt der Agent. Unter dem Durchlauf erscheint „Am Ausgabenlimit gestoppt“. Neue Nachrichten warten, bis du das Limit mit **Limit erhöhen …** anhebst oder entfernst. Mehr dazu unter [Sitzungen](/guide/sessions).

## Der Tab Arena

Der Tab **Arena** (`/arena`) zeigt, welche Modelle bei deinen eigenen Aufgaben gewinnen. Auf der Startseite schickt **Optionen** → **Arena** deinen Prompt zusätzlich an ein oder zwei weitere Modelle; du behältst die beste Antwort. Der Tab ordnet die Modelle nach einer Wertung (einer Elo-Wertung, die bei 1000 beginnt) über die Vergleiche, die du entschieden hast, mit der Häufigkeit, mit der jedes behalten wurde, und seiner Gewinnquote, und listet aktuelle Vergleiche auf, entschiedene und noch offene. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).

## Kann ich die Zahlen zurücksetzen?

Es gibt keinen Knopf zum Leeren der Aktivitätsdaten. Löschst du eine Sitzung selbst über **Sitzung löschen** im Sitzungsmenü, werden auch ihre Kennzahlen aus Aktivität entfernt. Automatisch wegen Inaktivität gelöschte Sitzungen behalten ihre Kennzahlen. Die Werte im Tab Limits stammen dagegen vom jeweiligen Anbieter. Diese werden nach dessen Zeitplan oder durch einen [Limit-Reset](#use-a-limit-reset) zurückgesetzt.

## Frag einen Agenten

- „Wie viel meines Claude-Kontingents ist diese Woche noch übrig und wann wird es zurückgesetzt?“
- „Aktiviere die automatische Fortsetzung nach Nutzungslimits.“
- „Setze meine Sitzung ‚Refactor auth‘ fort, sobald das Codex-Limit zurückgesetzt ist.“
- „Was hätte die Arbeit des letzten Monats zu API-Preisen je Modell gekostet?“
- „Warum zeigt die Heute-Zeile auf meiner Startseite $3.10, obwohl ich ein Abo habe?“
- „Zähle meine Ollama-Modelle bei der Kostenschätzung als kostenlos.“
- „Wie viel hat Custom diesen Monat erledigt und mit welchen Modellen?“
- „Lösche Sitzungen erst nach zwei Jahren Inaktivität statt nach einem.“
- „Zeige meine OpenRouter-Nutzung und -Kosten ohne manuelle Modellpreise.“
