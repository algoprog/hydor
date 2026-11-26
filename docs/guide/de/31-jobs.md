# Jobs

Jobs zeigt dir an einem Ort die lang laufende Arbeit, die deine Sitzungen im Hintergrund ausführen: Builds, Trainingsläufe, Indexierungen, Downloads und Subagenten. Bei jedem Job siehst du, wie lange er schon läuft, wie weit er ist und wie lange er ungefähr noch braucht, was auf den Start wartet und worauf, und wie die abgeschlossenen Jobs ausgegangen sind. Du kannst dort die Ausgabe eines Jobs lesen und ihn stoppen, und du kannst einen Agenten bitten, eine Sache nach der anderen auszuführen.

![Die Seite „Jobs“: die laufenden Jobs mit Fortschritt und Restzeit, die wartenden und die abgeschlossenen](images/jobs.webp)

## Was Jobs zeigt

Klicke in der Leiste auf **Jobs** oder gehe zu [Jobs](/jobs). Auf dem Handy findest du es bei den Werkzeugen unten in der ausklappbaren Leiste. Eine Zahl am Symbol zeigt, wie viele Jobs gerade laufen.

Ein Job ist eines davon:

- eine Hintergrundaufgabe einer deiner Sitzungen: ein Befehl, eine Überwachung (die ein Protokoll oder ein Programm im Blick behält) oder ein Subagent des Programms, mit dem der Agent selbst arbeitet, etwa Claude Code. Auch Sitzungen, die du außerhalb von Hydor ausführst, in VS Code oder einem Terminal, zeigen ihre Aufgaben;
- Arbeit, die ein Agent als Job gestartet hat (siehe [Wie Agenten Arbeit hierher bringen](#how-agents-put-work-here));
- ein Durchlauf aus [Experimente](/guide/experiments), der läuft oder in der Warteschlange wartet;
- ein Hydor-Subagent, also eine Sitzung, die eine andere Sitzung für einen Teil ihrer Aufgabe gestartet hat, solange er arbeitet (siehe [Subagents](/guide/sessions#subagents)).

Die Zeile ganz oben fasst alles zusammen, zum Beispiel „3 aktiv · 2 in der Warteschlange · alles fertig in etwa 2 h 10 min“. Die Endzeit steht nur da, wenn es für jeden Job eine Schätzung gibt; Subagents, die nie eine haben, zählen dabei nicht mit. Darunter folgen die Abschnitte **Läuft**, **In der Warteschlange**, **Server** und **Abgeschlossen**, jeweils nur, wenn es darin etwas zu zeigen gibt. Die Zahl in der Leiste, die Zeile oben und die Endzeit lassen Server außen vor. Die Seite aktualisiert sich von selbst.

Jede Zeile hat ein Symbol mit einem Punkt für den Zustand und den Namen des Jobs; zeige auf den Namen, um den Befehl zu sehen. Darunter steht, was es ist (**Befehl**, **Überwachung**, **Claude Code Subagent**, **Hydor-Subagent**, **Experiment-Durchlauf**, **Job** oder **Server**), welche Sitzung ihn gestartet hat und zu welchem Projekt er gehört, jeweils als Link. Rechts zeigt **Ausgabe**, was der Job ausgibt, **Öffnen** führt zu seinem Durchlauf oder seiner Sitzung, und **Stoppen** beendet ihn.

Wenn nichts läuft oder wartet, liest du „Gerade läuft nichts im Hintergrund.“

## Läuft

Ein laufender Job zeigt, wie lange er schon läuft („läuft seit 12 Min. 05 Sek“). Wenn der Job selbst meldet, wie weit er ist, siehst du einen Fortschrittsbalken mit Prozentangabe und oft daneben die eigene Zählung des Jobs, etwa „step 120/500“. Die blasse Zeile darunter ist das Letzte, was er ausgegeben hat.

### Restzeit

Wenn es einen Anhaltspunkt gibt, steht in der Zeile „noch etwa 1 Std. 12 Min.“. Die App nimmt den ersten dieser Werte, den sie hat:

1. die Restzeit, die der Job selbst ausgegeben hat, wie es viele Fortschrittsbalken tun;
2. wie schnell sein Fortschritt bisher vorangekommen ist;
3. die Schätzung, die der Agent beim Start des Jobs angegeben hat;
4. wie lange derselbe Befehl im selben Ordner früher gedauert hat, wenn er in der letzten Woche erfolgreich war.

Zeige auf die Zeit, um zu sehen, welcher Wert es ist. **(geschätzt)** daneben bedeutet, dass es nur eine grobe Angabe ist: ein einzelner Fortschrittswert, die Schätzung des Agenten oder ein früherer Lauf. Wenn ein Job länger gelaufen ist als erwartet, steht stattdessen **länger als geschätzt** da. Gibt es keinen Anhaltspunkt, wird keine Zeit angezeigt.

## In der Warteschlange

Ein Job in der Warteschlange hat noch nicht begonnen. In seiner Zeile steht, warum:

- **Wartet auf** und die Namen anderer Jobs: Er startet, sobald alle erfolgreich fertig sind. Klicke auf einen Namen, um dessen Zeile zu finden. Bei den Jobs, auf die andere warten, steht **Danach:** und wer als Nächstes kommt;
- **Als Nächstes in der Warteschlange** und der Name der Warteschlange, oder sein Platz darin, etwa „3. in der Warteschlange gpu“: Eine Warteschlange führt immer nur einen Job aus, in der Reihenfolge, in der sie ankamen, über alle deine Sitzungen hinweg. Der erste in der Reihe wartet vielleicht noch auf einen anderen Job, und die dahinter warten dann mit;
- **Wartet auf eine freie GPU** oder **Wartet auf einen freien Platz**: Ein Durchlauf aus Experimente wartet, bis Platz ist (siehe [Wie die Warteschlange auswählt](/guide/experiments#how-the-queue-chooses)).

Wenn es für die Jobs davor Schätzungen gibt, steht auch da, wann er starten sollte, etwa „startet in etwa 40 min“.

**Stoppen** bei einem Job in der Warteschlange bedeutet, dass er nie startet, und die Jobs, die auf ihn warten, auch nicht. Wenn ein Job, auf den ein anderer wartet, fehlschlägt oder gestoppt wird, startet der wartende ebenfalls nie.

## Server

Manche Befehle enden nie von selbst: ein Entwicklungsserver, ein Web- oder API-Server, ein Notebook oder ein Modellserver, den eine Sitzung im Hintergrund laufen lässt. Jobs erkennt sie an ihrem Befehl und listet sie gesondert unter **Server** auf, mit ihrer bisherigen Laufzeit und ohne Restzeit. Sie laufen, bis du sie stoppst, mit **Stoppen** wie bei jedem anderen Befehl. Sie zählen nicht zu den laufenden Jobs, und die Ansicht **Zeitleiste** zeichnet sie nicht. Sobald einer endet, wandert er nach **Abgeschlossen**.

## Abgeschlossen

**Abgeschlossen** behält, was in den letzten 7 Tagen zu Ende gegangen ist, das Neueste zuerst: die zehn letzten, und mit **Alle anzeigen** den Rest. Bei jedem steht, wie er ausgegangen ist, wann und wie lange er gedauert hat:

- **Fertig**: Er wurde erfolgreich abgeschlossen;
- **Fehlgeschlagen**, mit Exit-Code, falls es einen gibt (die Zahl, mit der ein Programm endet; alles außer 0 bedeutet, dass etwas schiefgegangen ist);
- **Angehalten**: Du oder ein Agent hat ihn gestoppt;
- **Nie gestartet**, und der Grund, etwa dass ein Job, auf den er gewartet hat, fehlgeschlagen ist;
- **Beendet**: Arbeit, die schon lief, als sie zu Jobs hinzugefügt wurde, ist zu Ende, und niemand hat gesehen, ob sie erfolgreich war.

Das × am Ende einer Zeile (**Aus dieser Liste entfernen**) nimmt einen Eintrag heraus, und **Leeren** entfernt nach einer Rückfrage alle. Das räumt nur die Liste auf: Deine Sitzungen und die Durchläufe aus Experimente bleiben erhalten.

## Die Ansicht „Zeitleiste“

Oben rechts wechselst du zwischen **Liste** und **Zeitleiste**; die App merkt sich deine Wahl in diesem Browser. Die Zeitleiste zeichnet entlang der Uhrzeit einen Balken für jeden Job, der läuft oder wartet:

- **Bisher gelaufen** ist ausgefüllt, und **Geschätzt** ist der gestreifte Teil dahinter;
- Jobs mit **In der Warteschlange** sind gestrichelt und stehen dort, wo sie starten sollten;
- ein Balken mit **Keine Schätzung** läuft blass aus;
- die mit **Jetzt** markierte Linie ist der aktuelle Zeitpunkt, und dünne Linien verbinden einen Job mit denen, die auf ihn warten.

Ein Job, der länger läuft als geschätzt, wird bernsteinfarben. Zeige auf einen Balken, um Zustand und Zeiten zu lesen, und klicke ihn an, um seine Ausgabe zu sehen oder ihn zu öffnen, wenn er keine anzuzeigen hat. Auf einem schmalen Bildschirm lässt sich das Diagramm seitlich verschieben, und die Namen bleiben stehen. Die abgeschlossenen Jobs sind darunter aufgelistet.

## Ausgabe und Stoppen

**Ausgabe** öffnet einen Bereich mit dem Ende dessen, was der Job ausgegeben hat. Solange er läuft, wird er alle paar Sekunden aktualisiert; die neuesten Zeilen bleiben sichtbar, außer du scrollst nach oben. Bei einem Subagenten werden seine Schritte aufgelistet. Manche Jobs, etwa Hydor-Subagenten und die Hintergrundaufgaben von Codex, haben hier keine Ausgabe: Nutze **Öffnen**.

**Stoppen** fragt zuerst nach und beendet dann den Job: Ein Job oder ein Befehl wird gestoppt, ein Durchlauf aus Experimente wird wie auf seiner eigenen Seite gestoppt, und die Sitzung eines Hydor-Subagenten wird gestoppt. Was der Job bis dahin getan hat, bleibt erhalten. Arbeit, die in einer Sitzung außerhalb von Hydor läuft, und die Hintergrundaufgaben von Codex lassen sich von hier aus nicht stoppen, deshalb haben sie kein **Stoppen**.

## Wie Agenten Arbeit hierher bringen

Du musst nichts einrichten. Eine Hintergrundaufgabe, die eine Sitzung startet, erscheint hier von selbst. Jede Sitzung, die die App startet, hat außerdem einen Befehl namens `job`, und die Agenten sind angewiesen, ihn für lange Arbeit zu nutzen (alles, was mehr als etwa zehn Minuten dauert), damit sie hier mit Namen, Fortschritt und Restzeit erscheint (siehe [Vier Befehle, die jeder Agent hat](/guide/agents#four-commands-every-agent-has)).

Sag in einfachen Worten, was du willst, und der Agent erledigt den Rest:

- **Eins nach dem anderen**: „Führe die Auswertung aus, nachdem der Index fertig gebaut ist.“ Der zweite Job wartet auf den ersten und startet nie, wenn der erste fehlschlägt;
- **Einer nach dem anderen**: „Stell diese Sweeps in eine Warteschlange.“ Jobs mit demselben Warteschlangennamen kommen nacheinander dran;
- **Wie lange es dauern sollte**: Ein Agent kann eine eigene Schätzung angeben, die gilt, bis der Fortschritt des Jobs mehr verrät;
- **Arbeit, die schon läuft**: „Zeig das Training, das du vorhin gestartet hast, in Jobs an.“ Der Agent fügt es hinzu, ohne es neu zu starten (`job adopt`); unter Windows ist das nicht möglich. Wenn es endet, steht dort **Beendet**, weil niemand sagen kann, wie es ausgegangen ist.

Solange ein Job, den eine Sitzung gestartet hat (mit dem Befehl `job` oder als Lauf von Experimenten), noch wartet oder läuft, ist diese Sitzung nicht fertig: ihr Punkt pulsiert weiter blau, und ihr Status lautet „Arbeitet · 1 im Hintergrund“, auch wenn ihr Agent schon aufgehört hat. Ihre Benachrichtigung **Abgeschlossen** kommt erst, wenn der Job endet. Der Stopp-Button an ihrem Nachrichtenfeld lässt diese Jobs weiterlaufen: Stoppe sie hier.

Wenn die App nicht erreichbar ist, während ein Agent einen Job startet, läuft der Befehl trotzdem; er erscheint dann nur nicht hier.

## Frag einen Agenten

- „Führe die Auswertung als Job aus, nachdem der Index fertig gebaut ist.“
- „Zeig das Training, das du vorhin gestartet hast, in Jobs an.“
- „Führe diese drei Sweeps nacheinander in einer Warteschlange aus.“
- „Was läuft noch, und wann ist es fertig?“
- „Stopp den Download und führe stattdessen die Tests als Job aus.“
- „Warum ist der letzte Build fehlgeschlagen? Sieh dir die Ausgabe seines Jobs an.“
