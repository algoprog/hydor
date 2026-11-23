# Nutzung, Limits und Kosten

Claude Code, Codex und Grok Build laufen mit Tarifen, die Nutzungslimits haben, Antigravity CLI läuft mit deinem Google-AI-Tarif (sein eigenes Terminal zeigt, was davon übrig ist), und jeder Modellaufruf hat einen Preis. Dieses Thema zeigt, wo du siehst, wie viel du von jedem Tarif verbraucht hast und wann er zurückgesetzt wird, was bei einem Limit passiert (und wie Sitzungen von selbst weiterlaufen), was die Agenten im Lauf der Zeit getan haben und wie die App Kosten schätzt, auch mit Preisen, die du selbst festlegst.

![Nutzung: wie viel du von jedem Tarif verbraucht hast und wann er zurückgesetzt wird](images/usage.webp)

## Die Seite „Nutzung“ öffnen

Öffne **Nutzung** in der Leiste (auf einem Smartphone öffnest du zuerst die Seitenleiste). Ein dünner Balken unter dem Nutzung-Symbol zeigt auf einen Blick, wie viel über alle deine bezahlten Claude-Code-, Codex- und Grok-Build-Abos hinweg noch übrig ist, jeweils nach dem Limit gezählt, dem es am nächsten ist; hast du nur kostenlose Abos, zählt er diese, und ohne Abo wird er nicht angezeigt. Er wird rot, wenn nichts mehr übrig ist. Fahre mit der Maus darüber, um zu sehen, was jedes Abo noch übrig hat. Antigravity CLI zählt in diesem Balken nicht mit: Die App liest sein Kontingent nicht.

Die [Seite „Nutzung“](/usage) hat drei Tabs:

- **Grenzen** (`/usage`): wie viel von jedem Tarif noch übrig ist und wann er zurückgesetzt wird.
- **Aktivität** (`/stats`): geänderte Zeilen, Token und Sitzungen im Lauf der Zeit.
- **Arena** (`/arena`): welche Modelle bei deinen eigenen Aufgaben gewinnen.

Die App liest deine Nutzung, wenn du die Seite öffnest, und alle fünf Minuten, solange die App geöffnet ist; im Tab **Grenzen** liest **Aktualisieren** sie sofort erneut. Die Nutzung von Grok Build wird in Abständen von einigen Minuten von seinem Agenten gelesen, und **Aktualisieren** liest sie ebenfalls sofort.

## Die Limits eines Tarifs lesen

Der Tab **Grenzen** hat eine Karte für Claude Code, eine für Codex, eine für Grok Build und eine für Antigravity CLI (sobald du sie in [Einstellungen → Agents → Weitere Agenten](/settings?s=agents) hinzugefügt hast) sowie eine für jedes Konto, das du in [Einstellungen → Agents → Konten](/settings?s=accounts) hinzugefügt hast. Auf einem breiten Bildschirm stehen sie zu zweit in einer Zeile; auf einem Smartphone untereinander.

Jede Karte zeigt die E-Mail-Adresse und den Tarif des Kontos, wie lange es her ist, dass die Zahlen gelesen wurden, und eine Zeile pro Limit (ein Zeitfenster mit einer Obergrenze für die Nutzung):

- Claude Code: **Current session (5 h)**, **Weekly · all models** und wöchentliche Limits für ein Modell, etwa **Weekly · Sonnet only**.
- Codex: **5-hour window**, **Weekly** oder Zeitfenster anderer Länge. Hat Codex mehrere Limits, beginnt jede Zeile mit dem Namen des Limits.
- Grok Build: **Wöchentlich**, mit dem Zeitpunkt des Zurücksetzens. Die Karte nennt auch den Tarif (SuperGrok, SuperGrok Plus oder SuperGrok Heavy). Die eigene Anmeldung von Grok hat ihre Karte, und jedes Grok-Konto, das du hinzugefügt hast, hat eine.
- Antigravity CLI: keine Zeilen. Sobald du es hinzugefügt hast, zeigt seine Karte **Antigravity CLI** die E-Mail-Adresse und den Tarif und sagt: „Antigravity CLI zeigt mit /usage in seinem eigenen Terminal, wie viel von deinem Tarif noch übrig ist.“ Die App liest sein Kontingent nicht, weil Googles Vorgaben Aufrufe im Hintergrund ausschließen. Seine Tarife Google AI Pro und Ultra werden alle fünf Stunden bis zu einem Wochenlimit aufgefrischt; Free und Plus haben ein Wochenlimit.

Jede Zeile zeigt den verbrauchten Prozentsatz, einen Balken, den Prozentsatz, der übrig ist, und wann zurückgesetzt wird („wird in 2 h 15 min zurückgesetzt“; fahre mit der Maus darüber für die genaue Zeit). Ab 90 % erscheint ein Warnzeichen.

Je nach Tarif zeigt die Karte außerdem:

- **Zusätzliche Nutzung** (Claude): ob bezahlte Nutzung über die Limits des Tarifs hinaus aktiviert ist und wie viel von ihrem Monatslimit ausgegeben ist.
- **Credits** (Codex, Grok Build): dein Credit-Guthaben oder „Unbegrenzt“.
- **Nach Verbrauch bezahlen** (Grok Build): wenn der Tarif es hat, was du diesen Monat dafür ausgegeben hast im Vergleich zur Obergrenze („12,00 $ von 50,00 $ in diesem Monat“).
- **Limit-Resets**: Resets, die du jetzt verwenden kannst (siehe [Einen Limit-Reset verwenden](#use-a-limit-reset)).
- **Diese Woche nach Nutzungsbereich** (Claude): wie sich die Nutzung dieser Woche auf die Orte verteilt, an denen du Claude verwendest.
- **Token pro Tag** (Codex): ein Diagramm der letzten 30 Tage mit deiner Gesamtsumme über die gesamte Zeit. Ein Token ist ein Wortstück; Modelle zählen ihr Lesen und Schreiben in Token.

Wenn etwas nicht stimmt, sagt die Karte es:

- „Nicht angemeldet“ mit **In den Einstellungen anmelden** (bei Grok Build: „Melde dich an, um die Tarifnutzung von Grok zu sehen.“);
- bei einem Tarif, den ein Team verwaltet, sagt die Karte von Grok Build „Die Nutzungslimits werden von deinem Team verwaltet.“, da es keine eigenen Limits zu zeigen gibt;
- „Für diesen Tarif werden keine Nutzungslimits gemeldet“;
- ein Fehler mit **Anmeldung in den Einstellungen prüfen**;
- „Zuletzt bekannte Zahlen werden angezeigt: …“, wenn das letzte Lesen fehlgeschlagen ist.

## Was passiert, wenn du ein Limit erreichst

Wenn die Nutzung eines Tarifs aufgebraucht ist, stoppt der Zug des Agenten. Bei Grok Build bedeutet das sein Wochenlimit, sein Credit-Limit oder sein Ausgabenlimit für Nach-Verbrauch-Bezahlung; ein kurzes Ratenlimit (eine Welle von Anfragen) zählt nicht dazu und geht von selbst vorbei. Ein Hinweis sagt, wessen Limit erreicht wurde, welches Limit es ist und wann es zurückgesetzt wird: „Du hast das Nutzungslimit von Claude Code erreicht“ (oder Codex, Grok Build oder Antigravity CLI) bei einem Konto dieses Agenten, „Alle deine Claude-Code-Konten haben ihr Nutzungslimit erreicht“, wenn du mehrere hast und keines mehr Nutzung übrig hat, oder das Konto mit seinem Namen („Work hat sein Nutzungslimit erreicht“), wenn ein anderes noch welche hat. Er wird angezeigt:

- auf der Startseite, über dem Nachrichtenfeld, für den Agenten (und das Konto), den du gewählt hast;
- in einer Sitzung, über dem Nachrichtenfeld;
- auf der Karte dieses Tarifs auf der Seite „Nutzung“.

Der Hinweis bietet an, was du tun kannst:

- **Beim Zurücksetzen fortsetzen** (in einer Sitzung, solange **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** aus ist): Die Sitzung läuft eine Minute nach dem Zurücksetzen des Limits von selbst weiter, mit der Nachricht „Mach dort weiter, wo du aufgehört hast.“ Der Hinweis sagt dann „Diese Sitzung läuft von selbst weiter, wenn zurückgesetzt wird“, mit **Abbrechen**.
- **Reset verwenden**, wenn das Konto einen Limit-Reset hat, den du jetzt verwenden kannst („2 Resets verfügbar“).

Sobald die Nutzung wieder da ist, eine Sitzung aber noch weiterlaufen soll, lautet der Hinweis „Läuft von selbst weiter in …“, mit **Abbrechen**.

Antigravity CLI ist anders. Wenn sein Kontingent aufgebraucht ist („Individual quota reached… Resets in 2h39m52s“), stoppt der Zug, und der Hinweis sagt, dass es sein Nutzungslimit erreicht hat und wann es zurückgesetzt wird, mit der Zeile „Antigravity CLI läuft nicht von selbst weiter (Googles Bedingungen für seine Tarife erlauben nur Züge, die du startest), sende also eine Nachricht, sobald zurückgesetzt wurde.“ Es hat keine Schaltfläche **Beim Zurücksetzen fortsetzen**, und **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** gilt dafür nicht. Der Hinweis sagt dir auch, wenn Google-AI-Credits zu knapp werden („AI credits“).

## Sitzungen nach einem Limit automatisch fortsetzen

Damit jede Sitzung, die ein Limit erreicht, von selbst weiterläuft, öffne [Einstellungen → App → Allgemein](/settings?s=general&find=Resume%20after%20usage%20limits) und aktiviere **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** (wenn ein Zug stoppt, weil die Nutzung eines Tarifs aufgebraucht ist, läuft die Sitzung eine Minute nach dem Zurücksetzen des Limits von selbst weiter). Die Option ist aus, bis du sie aktivierst. Sie funktioniert, auch wenn kein Browser geöffnet ist. Auf eine Antigravity-CLI-Sitzung wird sie nie angewendet: Googles Bedingungen für seine Tarife erlauben nur Züge, die du selbst startest, sende also eine Nachricht, sobald sein Limit zurückgesetzt wurde. Ist sie aktiviert, zeigt eine Sitzung keine Warnung, wenn ein Limit sie stoppt: Eine Zeile über dem Nachrichtenfeld sagt, wessen Limit erreicht wurde (wie es der Hinweis tut), welches Limit und „Läuft von selbst weiter in …“, mit **Reset verwenden**, wenn das Konto einen hat, und **Abbrechen**.

So funktioniert das Timing, mit dem Schalter oder mit **Beim Zurücksetzen fortsetzen**:

- Die Sitzung ist eine Minute nach dem Zurücksetzen des Limits fällig, so wie der Anbieter es zuletzt gemeldet hat. Die App liest die Nutzung hin und wieder, während eine Sitzung wartet, öfter, je näher das Zurücksetzen rückt, und verschiebt die Zeit, wenn der Anbieter das Zurücksetzen verschiebt.
- Wird das Limit früher aufgehoben (du hast einen Reset verwendet oder dich mit einem anderen Konto angemeldet), läuft die Sitzung sofort weiter. Wurde sie in den letzten 15 Minuten früher fortgesetzt und hat das Limit erneut erreicht, wartet sie stattdessen auf das Zurücksetzen.
- Nur ein Zug, den das Limit wirklich gestoppt hat, wird fortgesetzt, nicht einer, der gerade fertig wurde, als die Nutzung des Tarifs 100 % erreichte. Ein geplantes Fortsetzen entfällt, wenn die Sitzung ohne es weitergeht: Du sendest eine Nachricht oder drückst **Stoppen**, oder ein Zug läuft normal durch. Ein Zug, den der Agent während des Wartens von selbst startet (wenn eine Hintergrundaufgabe oder ein eigener Subagent am selben Limit stoppt), lässt es nicht entfallen. Eine Sitzung, die du mit **Stoppen** angehalten hast, wird nie von selbst fortgesetzt, auch wenn der Fehler des Limits zuerst kam, bis du ihr eine Nachricht sendest.
- **Abbrechen** im Hinweis stoppt ein geplantes Fortsetzen.

Hast du mehr als ein Konto für den Agenten (Claude Code, Codex oder Grok Build), führt [**Bei erreichtem Limit das Konto wechseln**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) die Sitzung stattdessen sofort mit einem anderen Konto weiter und wartet nur, wenn jedes Konto an seinem Limit ist (siehe [Agents, Konten und Modelle](/guide/agents-models#use-all-your-accounts-switch-at-a-limit)). Bei Claude Code kann [**Bei erreichtem Limit API-Guthaben verwenden**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit) sie dann weiterführen, abgerechnet über einen von dir gespeicherten Anthropic-API-Key, statt zu warten (siehe [API-Guthaben verwenden, wenn jedes Konto an seinem Limit ist](/guide/agents-models#use-api-credit-when-every-account-is-at-its-limit)).

## Einen Limit-Reset verwenden

Manche Tarife geben dir Limit-Resets: Codex-Reset-Credits und Claude-Reset-Gutschriften (Grok Build hat keine). Wenn du einen verwendest, werden die Nutzungslimits des Tarifs sofort gelöscht, statt auf ihr Zurücksetzen zu warten.

Jede Karte listet sie unter **Limit-Resets** auf, mit der Anzahl, die du hast. Jeder Reset zeigt seinen Namen (und wie viele Verwendungen noch übrig sind), „Läuft ab in …“ (in Warnfarbe, wenn es weniger als einen Tag entfernt ist) oder „Läuft nicht ab“ und Hinweise wie „Funktioniert, sobald du ein Limit erreichst“ oder „Noch nicht verwendbar“. Ein Reset, den ein anderes Limit zurückhält, sagt, welches, und wann es aufgehoben wird: „Gesperrt, solange dein Wochenlimit aufgebraucht ist (verwendbar in …)“. Manche Claude-Resets löschen nur einen Teil deines Kontingents, sodass sie nicht verwendet werden können, solange dein Wochenlimit aufgebraucht ist; sie werden verwendbar, sobald es zurückgesetzt wurde. Gibt es keine: „Derzeit keine Limit-Resets“, mit dem Zeitpunkt des nächsten, falls der Tarif ihn nennt. Die App prüft die Resets eines Claude-Kontos etwa alle zehn Minuten, da Anthropic häufigere Prüfungen ablehnt, und zeigt dazwischen die zuletzt gelesene Liste, auch nach einem Neustart der App. Ein Reset kann also einige Minuten brauchen, bis er als verwendbar angezeigt wird. Einer, den du verwendest, verschwindet sofort aus der Liste.

1. Klicke neben einem Reset auf **Benutzen** oder in einem Limit-Hinweis auf **Reset verwenden** (er nimmt den ersten Reset in der Liste, der jetzt funktioniert).
2. Lies die Bestätigung. Sie sagt, welcher Reset verwendet wird, wann er abläuft und wie viele übrig bleiben. Bist du an keinem Limit, warnt sie dich („Du bist gerade an keinem Limit“).
3. Klicke auf **Reset verwenden**.

Die App sagt, wie es gelaufen ist, zum Beispiel „Die Nutzungslimits von Codex wurden zurückgesetzt.“, „Claude ist gerade an keinem Nutzungslimit, daher wurde nichts zurückgesetzt.“, „Die Resets kühlen noch ab. Versuche es später erneut.“ oder „Dieser Reset wurde bereits verwendet.“ Wenn es klappt, läuft eine Sitzung, die auf das Limit wartet, sofort weiter.

Claude-Resets setzen voraus, dass Claude Code mit einem Claude-Abo angemeldet ist (nicht mit API-Abrechnung).

## Sehen, was die Agenten im Lauf der Zeit getan haben

Der Tab **Aktivität** (`/stats`) zählt, was die Agenten getan haben, aus den Sitzungen, die die App auf diesem Computer kennt.

Oben:

- **Täglich**, **Wöchentlich**, **Monatlich** oder **Jährlich**: der Zeitraum, den die Zahlen zählen, und ein Balken pro Tag, Woche, Monat oder Jahr in den Diagrammen. Die Seite merkt sich deine Wahl.
- **Alle** oder ein Agent: **Claude**, **Codex**, **Custom** und jeder andere Agent, der hier etwas getan hat (Gemini CLI, OpenCode …).
- Der Chip eines Modells, wenn du unten unter **Nach Modell** ein Modell gewählt hast: Die Seite zählt dann dieses Modell allein. Klicke auf den Chip (sein **✕**), um wieder alle Modelle zu sehen.
- **Diagramme** oder **Tabelle**.

Die Zeile daneben nennt den Bereich, den die Diagramme und die Tabelle abdecken (die letzten 30 Tage, die letzten 26 Wochen, die letzten 12 Monate oder seit Beginn deines Verlaufs, oder jedes Jahr), und deine Zeitzone. Tage, Wochen und Monate folgen deiner Zeitzone, und eine Woche beginnt am Montag.

Darunter steht der bisherige Zeitraum, **Heute**, **Diese Woche**, **Diesen Monat** oder **Dieses Jahr**, mit seinen Daten. Die Kacheln zeigen seine Summen:

- **Zeilen hinzugefügt** und **Zeilen entfernt**
- **Eingabetoken** (was die Modelle gelesen haben: neu und aus dem Cache) und **Ausgabetoken** (was sie geschrieben haben)
- **Ausgabegeschwindigkeit**: Token pro Sekunde, während Antworten geschrieben wurden
- **API-Kosten (geschätzt)**: was dieselben Token über die API kosten würden
- **Prompts** (mit der Anzahl der Züge), **Sitzungen**, **Befehle** (mit der Anzahl der Tool-Aufrufe) und **Dateiänderungen**

Der kleine Pfeil auf einer Kachel vergleicht mit dem Zeitraum davor, bis zum gleichen Punkt: An einem Mittwoch um 15:00 Uhr wird diese Woche mit der letzten Woche von Montag bis Mittwoch 15:00 Uhr verglichen; heute mit gestern bis zur gleichen Uhrzeit. Die Zeile neben dem Namen des Zeitraums sagt das („verglichen mit letzter Woche bis zum selben Tag und zur selben Uhrzeit“). Er ist neutral: Mehr ist weder besser noch schlechter.

**Diagramme** zeigt geänderte Zeilen (hinzugefügte nach oben, entfernte nach unten), Eingabetoken (neu und aus dem Cache), Ausgabetoken, Ausgabegeschwindigkeit und kleine Diagramme für Prompts, Sitzungen, Befehle und Dateiänderungen, einen Balken pro Tag, Woche, Monat oder Jahr über den Bereich; der letzte Balken ist der bisherige Zeitraum. **Tabelle** listet dieselben Zahlen pro Zeitraum auf, den neuesten zuerst, mit der Summe für den gesamten Bereich.

Weiter unten, in beiden Ansichten, noch einmal der bisherige Zeitraum, so wie ihn die Kacheln zählen:

- **Nach Agent**: jeder Agent mit Namen (Claude Code, Codex, Custom, Gemini CLI und die anderen, die etwas getan haben), mit Sitzungen, Prompts, Zeilen, Eingabe und Ausgabe.
- **Top-Projekte**: die Ordner mit den meisten geänderten Zeilen.
- **Nach Modell**: Sitzungen, Prompts, Eingabe, Eingabe aus dem Cache, Ausgabe und API-Kosten jedes Modells, bei den Modellen von Custom (OpenRouter, Ollama, vLLM …) ebenso wie bei denen von Claude und Codex. Klicke auf ein Modell, um die ganze Seite nur für dieses zu sehen. Bei einem Modell ohne bekannten Preis steht stattdessen **einen Preis festlegen**. Fahre mit der Maus über ein Modell für seinen Preis pro Million Token und woher er stammt („dein Preis“ oder „öffentliche Preistabelle“).

Auf einem Smartphone stehen die Kacheln zu zweit in einer Zeile, und einige Tabellenspalten entfallen.

Die Startseite fasst den heutigen Tag in einer Zeile unter dem Nachrichtenfeld zusammen, sobald die Agenten heute etwas getan haben: „Heute · 7 Sitzungen · 12 Dateiänderungen · 0,84 $“, wobei ein Teil, der null ist, weggelassen wird. Das Geld sind die **API-Kosten (geschätzt)** des Tages: Bei einem Tarif (Claude Code, Codex) zahlst du stattdessen die Gebühr deines Tarifs, wie es der Hover-Text sagt. Fahre mit der Maus über die Zeile, um die hinzugefügten und entfernten Zeilen, die Eingabe- und Ausgabetoken und die Prompts zu sehen; klicke darauf, um Aktivität zu öffnen.

## Wie Kosten geschätzt werden

Claude- und ChatGPT-Tarife sind Pauschaltarife. Deshalb zeigt die App, was dieselbe Arbeit zu API-Preisen (Preisen bei Abrechnung nach Nutzung) kosten würde. So siehst du, wie viel du aus einem Tarif herausholst und was ein Modell über die API kosten würde. Dieselbe Schätzung erscheint in der Zeile jeder abgeschlossenen Runde einer Sitzung („≈ $0,12“, mit den Einzelposten unter **Zeit und Kosten**) und in der Zeile **Heute** auf der Startseite; bei einem Tarif weisen beide darauf hin, wenn du mit der Maus darauf zeigst.

- Die Preise stammen aus einer öffentlichen Preistabelle (der von LiteLLM), die die App höchstens einmal am Tag abruft und für den Offline-Fall speichert.
- Preise, die du selbst festlegst, haben Vorrang vor der Tabelle.
- Die Tokens jeder Sitzung werden zum Preis ihres Modells berechnet; bei einer Sitzung, in der das Modell gewechselt wurde, gilt das zuletzt verwendete.
- Eingabe aus dem Cache (Text, den das Modell zuvor schon gelesen hat und der aus seinem Cache kommt) wird zum Cache-Preis berechnet, oder zum Eingabepreis, wenn es keinen gibt.
- Modelle ohne bekannten Preis (ein bloßer Familienname wie „opus“ oder ein Modell, das die Tabelle nicht aufführt) zählen in den Summen nichts und zeigen unter **Nach Modell** **einen Preis festlegen** an.

Bei OpenRouter-Modellen werden die Preise automatisch von OpenRouter abgerufen, auch die Preise für Eingaben aus dem Cache. Du musst sie nicht eingeben. Wenn OpenRouter keinen Preis liefert, zeigt **Nach Modell** einen Strich an, statt dich zu bitten, einen festzulegen.

Ausgabenlimits verwenden dieselben Preise, übernehmen aber den eigenen Wert eines Agents, wenn er einen meldet: die Kosten von Claude Code oder das, was OpenRouter für jeden Custom-Aufruf angibt. Ein Modell auf diesem Computer kostet dort nichts.

## Eigenen Preis für ein Modell festlegen

1. Klicke auf dem Tab **Aktivität** oben bei **Nach Modell** auf **Modellpreise** oder neben einem Modell auf **einen Preis festlegen**.
2. Der Dialog **Modellpreise** listet die angezeigten Modelle auf, dazu alle, für die du schon einmal einen Preis festgelegt hast. Jedes hat **Eingabe**, **Aus dem Cache** und **Ausgabe**, in Dollar pro Million Tokens. Leere Felder verwenden den Preis der öffentlichen Tabelle, der grau angezeigt wird.
3. Gib deine Preise ein. Eingabe und Ausgabe sind beide erforderlich; der Cache-Preis ist optional (dann kostet er den Eingabepreis).
4. Um ein Modell zu bepreisen, das nicht aufgeführt ist, gib seine ID unter **Eine andere Modell-ID** ein und klicke auf **Hinzufügen**.
5. Klicke auf **Preise speichern**.

Das Papierkorb-Symbol in einer Zeile (**Preis aus der Tabelle verwenden**) löscht deinen Preis für dieses Modell. Damit ein Modell auf diesem Computer als kostenlos zählt, gib für Eingabe und Ausgabe 0 an.

## Jede Sitzung bleibt erhalten

Die App behält jede Sitzung und ihre Zahlen, unabhängig davon, was das Programm des Agents selbst tut. Claude Code löscht seine Unterhaltungen nach 30 Tagen, sofern nichts anderes festgelegt ist. Deshalb weist die App es an, sie zu behalten (in jedem Claude-Code-Konto, dessen Einstellungen keine Dauer vorgeben), und legt zu jeder Unterhaltungsdatei von Claude Code und Codex eine eigene Verknüpfung an: Eine Unterhaltung, die das Programm des Agents (oder jemand anderes) löscht, kommt zurück, aufgelistet und wie zuvor zu öffnen. Die Verknüpfung ist dieselbe Datei unter einem zweiten Namen und braucht deshalb keinen zusätzlichen Speicherplatz.

Gelöscht wird, was niemand verwendet: Sitzungen, die ein Jahr lang inaktiv waren, werden gelöscht, es sei denn, du änderst das unter [Einstellungen → Allgemein → Inaktive Sitzungen löschen](/settings?s=general&find=Delete%20inactive%20sessions) (siehe [Inaktive Sitzungen löschen](/guide/app#delete-inactive-sessions)). Ihre Zahlen bleiben in der Aktivität erhalten.

Unterhaltungen, die Claude Code vorher gelöscht hat, als die App sie noch nicht behielt, können nicht zurückkommen; der Verlauf der Aktivität beginnt dort, wo die App sie zum ersten Mal erfasst hat.

## Eine Sitzung mit einem Limit für Ausgaben versehen

Ein Ausgabenlimit stoppt eine Sitzung, sobald sie einen festgelegten Betrag zu API-Preisen ausgegeben hat, unabhängig davon, mit welchem Tarif du bezahlst. Subagents, die sie startet, zählen mit.

- Für eine neue Sitzung: auf der Startseite **Optionen** → **Ausgabenlimit**. Wähle 1 $, 5 $, 10 $ oder 25 $, oder gib einen Betrag ein und klicke auf **Set**. Mit **Keine Obergrenze** nimmst du es weg.
- Für eine laufende Sitzung: das Menü der Sitzung (⋯) → **Sitzungseinstellungen** → **Ausgabenlimit**. Der Dialog zeigt, was bisher ausgegeben wurde. Gib ein Limit ein (ab 0,01 $) und klicke auf **Limit festlegen** oder **Veränderung**; mit **Limit entfernen** nimmst du es weg.

Solange ein Limit gesetzt ist, zeigt eine Leiste über dem Nachrichtenfeld „1,20 $ von 5,00 $“, mit **Veränderung**. Wenn das Limit erreicht ist, stoppt der Agent direkt nach dem Modellaufruf, der es erreicht hat, unter der Runde steht der Hinweis „Am Ausgabenlimit gestoppt“, und neue Nachrichten warten, bis du das Limit erhöhst (**Limit erhöhen …**) oder entfernst. Mehr dazu findest du unter [Sitzungen](/guide/sessions).

## Der Tab Arena

Der Tab **Arena** (`/arena`) zeigt, welche Modelle bei deinen eigenen Aufgaben gewinnen. Auf der Startseite schickt **Optionen** → **Arena** deinen Prompt zusätzlich an ein oder zwei weitere Modelle; du behältst die beste Antwort. Der Tab ordnet die Modelle nach einer Wertung (einer Elo-Zahl, die bei 1000 beginnt) über die von dir entschiedenen Duelle, mit der Angabe, wie oft jedes behalten wurde und wie hoch seine Gewinnquote ist, und listet die letzten Duelle auf, ob entschieden oder noch offen. Siehe [Tiefe Recherche, Zweitmeinungen und mehrere Agents](/guide/research).

## Kann ich die Zahlen zurücksetzen?

Es gibt keine Schaltfläche, um die Aktivität zu leeren. Wenn du eine Sitzung selbst löschst (ihr Menü → **Sitzung löschen**), verschwinden auch ihre Zahlen aus der Aktivität; Sitzungen, die wegen Inaktivität gelöscht wurden, behalten ihre. Die Limits auf dem Tab „Limits“ sind die deiner Tarife: Sie werden nach dem Zeitplan des Anbieters zurückgesetzt oder mit einem [Limit-Reset](#use-a-limit-reset).

## Einen Agent fragen

- „Wie viel von meinem Claude-Tarif ist diese Woche noch übrig, und wann wird er zurückgesetzt?“
- „Wie viel von meinem Grok-Tarif ist diese Woche noch übrig?“
- „Wie viel von meinem Antigravity-CLI-Tarif ist noch übrig, und wann wird er zurückgesetzt?“
- „Schalte das Fortsetzen von Sitzungen nach Nutzungslimits ein.“
- „Setze meine Sitzung ‚Auth überarbeiten‘ fort, wenn das Codex-Limit zurückgesetzt wird.“
- „Was hätte die Arbeit des letzten Monats zu API-Preisen gekostet, aufgeschlüsselt nach Modell?“
- „Wie schneidet diese Woche bisher im Vergleich zur letzten ab?“
- „Warum zeigt die Zeile Heute auf meiner Startseite 3,10 $ an, obwohl ich einen Tarif habe?“
- „Zähle meine Ollama-Modelle in den Kostenschätzungen als kostenlos.“
- „Wie viel hat Custom diesen Monat geleistet, und mit welchen Modellen?“
- „Lösche Sitzungen nach zwei Jahren Inaktivität statt nach einem.“
- „Zeig mir meine OpenRouter-Nutzung und -Kosten, ohne Modellpreise einzugeben.“
