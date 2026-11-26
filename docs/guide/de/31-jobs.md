# Jobs

Jobs zeigt die lang laufenden Arbeiten, die deine Sitzungen im Hintergrund ausführen, alle an einem Ort und nach Tags sortiert, die sagen, wozu jede gehört: Builds, Trainingsläufe, Indexierungen, Downloads und Subagenten. Bei jeder siehst du, wie lange sie schon läuft, wie weit sie ist und wie lange sie ungefähr noch braucht, was auf den Start wartet und worauf es wartet, und wie die abgeschlossenen ausgegangen sind. Du kannst dort die Ausgabe eines Jobs lesen und ihn stoppen, und du kannst einen Agenten bitten, eines nach dem anderen auszuführen.

![Die Seite Jobs: vier Kacheln mit der Zusammenfassung, ein Chip für jeden Tag und die laufenden Jobs, nach Tags gruppiert, mit Fortschritt und Restzeit](images/jobs.webp)

## Was Jobs zeigt

Klicke in der Leiste auf **Jobs** oder öffne [Jobs](/jobs). Auf dem Handy findest du es bei den Werkzeugen unten in der ausklappbaren Leiste. Eine Zahl auf dem Symbol sagt, wie viele Jobs gerade laufen.

Ein Job ist eines davon:

- eine Hintergrundaufgabe einer deiner Sitzungen: ein Befehl, eine Überwachung (die ein Protokoll oder ein Programm beobachtet) oder ein Subagent aus dem Programm des Agenten selbst, etwa von Claude Code. Sitzungen, die du außerhalb von Hydor laufen lässt, in VS Code oder einem Terminal, zeigen ihre ebenfalls;
- Arbeit, die ein Agent als Job gestartet hat (siehe [Wie Agenten Arbeit hierher bringen](#how-agents-put-work-here));
- ein Lauf von [Experimente](/guide/experiments), der gerade läuft oder in dessen Warteschlange wartet;
- ein Hydor-Subagent, also eine Sitzung, die eine andere Sitzung für einen Teil ihrer Aufgabe gestartet hat, solange er arbeitet (siehe [Subagenten](/guide/sessions#subagents)).

Vier Kacheln oben fassen alles zusammen:

- **Läuft** und **In der Warteschlange**: wie viele Jobs laufen und wie viele warten;
- **Alles erledigt**: wann all diese Arbeit fertig sein sollte, zum Beispiel „in etwa 2 h 10 min“. Dort steht ein Strich, solange nicht für jeden Job eine Schätzung vorliegt. Subagenten zählen dabei nicht mit, denn für sie gibt es nie eine;
- **Heute beendet**: wie viele heute geendet haben. Daneben bringt dich „Fehlgeschlagen: 1“ (mit der jeweiligen Zahl) direkt zu ihnen.

Unter den Kacheln stehen ein Chip für jeden [Tag](#tags), das Projektmenü (**Alle Projekte**, siehe [Die Jobs eines Projekts ansehen](#see-one-projects-jobs)) und das Feld **Jobs filtern**. Tippe in das Feld, um nur die Jobs zu sehen, deren Name, Befehl, Sitzung, Projekt oder Tags diese Wörter enthalten. Passt nichts, bringt **Alle Jobs anzeigen** alles zurück. Darunter folgen **In Arbeit**, **Server** und **Abgeschlossen**, jeweils nur, wenn es dort etwas zu zeigen gibt. Die Kacheln zählen nur, was Tag, Projekt und Filter übrig lassen. Laufende Server werden weder in den Kacheln noch in der Zahl in der Leiste mitgezählt. Die Seite aktualisiert sich von selbst.

Wenn nichts läuft oder wartet, liest du „Gerade läuft nichts im Hintergrund.“

## In Arbeit

**In Arbeit** enthält die Jobs, die laufen, und die, die warten, mit einer Karte für jeden Tag. Die Jobs ohne Tag stehen in der letzten, **Ohne Tag**. Oben auf einer Karte stehen der Tag, wie viele seiner Jobs laufen und warten (zum Beispiel „3 aktiv · 1 in der Warteschlange“) und, wenn für jeden eine Schätzung vorliegt, wann sie fertig sein sollten („fertig in etwa 34 min“). Stammt die gesamte Arbeit einer Karte aus einer Sitzung, werden diese Sitzung und ihr Projekt auch dort genannt, und in den Zeilen fehlen sie dann. Klicke oben auf eine Karte, um sie einzuklappen oder wieder zu öffnen. Die App merkt sich das in diesem Browser. Während du filterst oder einen Tag ausgewählt hast, ist nichts eingeklappt. Solange kein Job einen Tag hat, werden die Jobs einfach aufgelistet, ohne Karten nach Tags.

Jeder Job ist eine Zeile. Das Symbol sagt, welche Art er ist (zeige darauf, um **Befehl**, **Überwachung**, **Claude Code Subagent**, **Hydor-Subagent**, **Experiment-Durchlauf** oder **Job** zu lesen), und der Punkt am Symbol zeigt seinen Zustand. Neben dem Namen stehen weitere Tags. Zeige auf den Namen, um den Befehl zu sehen. Darunter stehen der aktuelle Stand, die Sitzung, die ihn gestartet hat, und ihr [Projekt](#see-one-projects-jobs) (beide als Link) sowie das Letzte, was er ausgegeben hat.

Klicke auf eine Zeile, um [das Panel des Jobs](#a-jobs-panel-and-stop) zu öffnen. Ihr Menü **⋯** enthält **Details und Ausgabe**, **Sitzung öffnen** (bei einem Lauf von Experimente **Lauf öffnen**), **Tags bearbeiten …** und **Stoppen**.

## Läuft

Ein laufender Job sagt, wie lange er schon läuft („läuft seit 12 Min. 05 Sek.“). Wenn der Job sagt, wie weit er ist, gibt es einen Fortschrittsbalken mit Prozentzahl. Zeige auf den Balken, um die eigene Zählung des Jobs zu sehen, etwa „Schritt 120/500“. Wenn keine Restzeit angezeigt werden kann, steht diese Zählung unter dem Balken.

### Restzeit

Wenn es Anhaltspunkte gibt, steht in der Zeile „noch etwa 1 Std. 12 Min.“. Die App nimmt den ersten dieser Werte, den sie hat:

1. die Restzeit, die der Job selbst ausgegeben hat, wie es viele Fortschrittsbalken tun;
2. wie schnell sein Fortschritt bisher vorangekommen ist;
3. die Schätzung, die der Agent beim Start des Jobs angegeben hat;
4. wie lange derselbe Befehl im selben Ordner früher gedauert hat, wenn er in der letzten Woche erfolgreich beendet wurde.

Zeige auf die Zeit, um zu sehen, welcher Wert es ist. Auch das Panel des Jobs nennt ihn. **(geschätzt)** daneben bedeutet, dass die Angabe nur grob ist: eine einzelne Fortschrittsmeldung, die Schätzung des Agenten oder ein früherer Lauf. Läuft ein Job länger als erwartet, steht dort stattdessen **länger als geschätzt**. Gibt es keine Anhaltspunkte, wird keine Zeit angezeigt.

## In der Warteschlange

Ein Job in der Warteschlange hat noch nicht begonnen. Seine Zeile sagt, warum:

- **Wartet auf** und die Namen anderer Jobs: Er startet, sobald sie alle erfolgreich beendet sind. Klicke auf einen Namen, um dessen Zeile zu finden. Bei den Jobs, auf die andere warten, steht **Danach:** und wer als Nächstes kommt;
- **Als Nächstes in der Warteschlange** und deren Name, oder der Platz darin, etwa „3. in der Warteschlange gpu“: Eine Warteschlange führt immer nur einen Job aus, in der Reihenfolge ihres Eintreffens, über all deine Sitzungen hinweg. Der erste in der Reihe wartet vielleicht noch auf einen anderen Job, und die dahinter warten dann mit;
- **Wartet auf eine freie GPU** oder **Wartet auf einen freien Platz**: Ein Lauf von Experimente wartet, bis Platz ist (siehe [Wie die Warteschlange auswählt](/guide/experiments#how-the-queue-chooses)).

Wenn für die Jobs davor Schätzungen vorliegen, steht dort auch, wann er starten sollte, etwa „startet in etwa 40 Min.“.

**Stoppen** bei einem wartenden Job bedeutet, dass er nie startet, und die Jobs, die auf ihn warten, ebenfalls nicht. Wenn ein Job, auf den ein anderer wartet, fehlschlägt oder gestoppt wird, startet der wartende auch nie.

## Server

Manche Befehle enden nie von selbst: ein Entwicklungsserver, ein Web- oder API-Server, ein Notebook- oder Modellserver, den eine Sitzung im Hintergrund weiterlaufen lässt. Jobs erkennt sie an ihrem Befehl und listet sie unter **Server** auf, jeweils mit ihrer bisherigen Laufzeit und ohne Restzeit. Sie laufen, bis du sie stoppst, mit **Stoppen** wie bei jedem anderen Befehl. Sie zählen nicht zu den laufenden Jobs, und die Ansicht **Zeitleiste** lässt sie weg. Sobald einer endet, wandert er zu **Abgeschlossen**.

## Abgeschlossen

**Abgeschlossen** behält, was in den letzten 7 Tagen geendet hat, das Neueste zuerst, mit einer Überschrift für jeden Tag: **Heute**, **Gestern**, dann das Datum. Du siehst die zehn neuesten, und **Alle anzeigen** holt die übrigen dazu. Bei jedem steht, wie er ausgegangen ist, wann und wie lange er gedauert hat:

- **Fertig**: erfolgreich beendet;
- **Fehlgeschlagen**, mit dem Exit-Code, falls es einen gibt (die Zahl, mit der ein Programm endet; alles außer 0 bedeutet, dass etwas schiefgegangen ist);
- **Angehalten**: du oder ein Agent hat ihn gestoppt;
- **Nie gestartet**, mit dem Grund, zum Beispiel weil ein Job, auf den er gewartet hat, fehlgeschlagen ist;
- **Beendet**: Arbeit, die schon lief, als sie zu Jobs hinzugefügt wurde, ist zu Ende, und niemand hat gesehen, ob sie gut ausgegangen ist.

Wenn etwas fehlgeschlagen ist, wechsle von **Alle** zu **Fehlgeschlagen**, um nur diese zu sehen. **Aus dieser Liste entfernen** im Menü **⋯** einer Zeile nimmt einen Eintrag heraus, und **Leeren** nimmt nach einer Rückfrage alle heraus, auch die, die ein Tag, das Projektmenü oder der Filter ausblendet. Das räumt nur die Liste auf: Deine Sitzungen und die Läufe von Experimente bleiben erhalten.

## Tags

Ein Tag sagt, wozu eine Arbeit gehört, etwa `intent-data` oder `search-index`. So siehst du, wofür alles Laufende da ist, und kannst dir ein Vorhaben nach dem anderen ansehen. Ein Job hat bis zu 3 Tags, in Kleinbuchstaben mit Bindestrichen zwischen den Wörtern: „Intent data“ wird als `intent-data` gespeichert. Der erste bestimmt, wo der Job aufgelistet wird.

Du musst nichts selbst taggen:

- Agenten geben jedem Job, den sie starten, einen Tag und verwenden einen vorhandenen, wenn die Arbeit dazu gehört, sodass ein Vorhaben unter einem Namen bleibt. Nenne den gewünschten Tag, und der Agent verwendet ihn;
- Arbeit ohne eigene Tags (die Hintergrundbefehle einer Sitzung, ihre Subagenten und Läufe von Experimente, ein ohne Tag gestarteter Job) übernimmt den Tag ihrer Sitzung. Das ist der, den du hier für die Sitzung festgelegt hast; sonst der, den ihre Jobs der letzten Woche am häufigsten haben; sonst einer, den das [Hilfsmodell](/settings?s=models&find=Helper%20model) für die Sitzung aussucht, wobei es einen bereits verwendeten Tag nimmt, wenn einer passt.

Das Hilfsmodell wählt im Hintergrund aus, daher kann ein solcher Tag kurz nach der Arbeit selbst erscheinen. Dafür liest es den Titel der Sitzung, ihr Projekt und die Namen einiger ihrer Arbeiten. Zu einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) wird es nie befragt.

### Tags ändern

Wähle im Menü **⋯** eines Jobs **Tags bearbeiten …** oder klicke in seinem Panel auf den Stift neben den Tags. Tippe die Tags mit Kommas dazwischen ein oder klicke welche unter **Verwendete Tags** an, dann **Speichern**.

Bei Arbeit, die ein Agent als Job gestartet hat, sind das die eigenen Tags dieses Jobs. Bei anderer Arbeit sind es die ihrer Sitzung, sodass die gesamte Arbeit dieser Sitzung ohne eigene Tags sie übernimmt. Speichere ein leeres Feld, um das Festgelegte zu entfernen: Der Tag wird dann wieder wie oben beschrieben für dich ausgewählt. Arbeit, die zu keiner Sitzung gehört, kann nicht getaggt werden, außer es ist ein Job.

### Einen Tag ansehen

Klicke auf den Chip eines Tags, um nur die Arbeit zu sehen, die darunter aufgelistet ist: Die Kacheln, **In Arbeit**, **Server**, **Abgeschlossen** und die Zeitleiste folgen alle. Die Zahl auf einem Chip gibt an, wie viele seiner Jobs laufen oder warten. Klicke auf **Alle**, um wieder alles zu sehen. Der Chip **Ohne Tag** zeigt [die Arbeit ohne Tag](/jobs?untagged=1).

Der ausgewählte Tag ist Teil der Adresse der Seite (sie endet auf `?tag=` und den Namen des Tags). Du kannst sie also als Lesezeichen speichern oder an dein Handy schicken. Ein Chip richtet sich nach dem ersten Tag jedes Jobs. Um einen Job über einen seiner anderen Tags zu finden, tippe diesen Tag in **Jobs filtern** ein.

## Die Jobs eines Projekts ansehen

Das Projektmenü steht neben **Jobs filtern**. Dort steht **Alle Projekte** oder der Name des ausgewählten Projekts mit seinem Zeichen. Öffne es, um auszuwählen:

- **Alle Projekte**: jeder Job;
- ein Projekt, das hier Jobs hat; die Zahl daneben sagt, wie viele davon laufen oder warten;
- **Kein Projekt**: die Jobs, die zu keinem gehören.

Die Kacheln, **In Arbeit**, **Server**, **Abgeschlossen** und die Zeitleiste zeigen dann nur diese Jobs. Wenn du ein Projekt auswählst, springst du zurück zum Chip **Alle**, und die Chips und ihre Zahlen umfassen nur seine Jobs; klicke auf einen, um diesen Tag innerhalb des Projekts zu sehen. Solange ein Projekt ausgewählt ist, lassen die Zeilen seinen Namen weg. Das Menü erscheint, sobald ein Job zu einem Projekt gehört.

Auch das ausgewählte Projekt ist Teil der Adresse der Seite (`?project=` und seine ID oder `?project=none`), sodass du ein Lesezeichen setzen kannst. Zu den Jobs einer [Gruppe](/guide/projects#bring-projects-together-in-a-group) gehören die der Projekte, die sie zusammenfasst. Solange ein Projekt laufende oder wartende Jobs oder noch laufende Server hat, zeigt seine eigene Seite sie unter [Übersicht](/guide/projects#overview).

Ein Job gehört zum Projekt seiner Sitzung. Wenn es keines gibt (seine Sitzung ist in keinem Projekt, oder er hat keine Sitzung, etwa ein Job, den du aus deinem eigenen Terminal gestartet hast, oder ein Lauf, den du auf der Seite Experimente gestartet hast), gehört er zu dem Projekt, in dessen Ordner er läuft. Liegt der Ordner eines Projekts in dem eines anderen, bekommt ihn das innere Projekt. Eine Gruppe und ein Projekt, dessen Ordner dein persönlicher Ordner oder ein ganzes Laufwerk ist, bekommen auf diesem Weg nie Jobs. Das Panel eines Jobs nennt sein **Projekt**.

## Die Ansicht „Zeitleiste“

Wechsle oben rechts zwischen **Liste** und **Zeitleiste**. Die App merkt sich deine Wahl in diesem Browser. Die Zeitleiste zeichnet für jeden Job, der läuft oder wartet, einen Balken entlang der Uhrzeit, mit einem Punkt in der Farbe seines Tags vor dem Namen. Die Tag-Chips, das Projektmenü und **Jobs filtern** grenzen sie genauso ein wie die Liste:

- **Bisher gelaufen** ist durchgehend gefüllt, und **Geschätzt** ist der gestreifte Teil dahinter;
- Jobs **In der Warteschlange** sind gestrichelt und stehen dort, wo sie starten sollten;
- ein Balken mit **Keine Schätzung** läuft blass aus;
- die mit **Jetzt** beschriftete Linie ist die Gegenwart, und dünne Linien verbinden einen Job mit denen, die auf ihn warten.

Ein Job, der länger als geschätzt läuft, wird gelb. Zeige auf einen Balken, um seinen Zustand und seine Zeiten zu lesen, und klicke darauf, um das Panel des Jobs zu öffnen. Auf einem schmalen Bildschirm lässt sich das Diagramm seitwärts scrollen, und die Namen bleiben stehen. Die abgeschlossenen Jobs sind darunter aufgelistet.

## Das Panel eines Jobs und Stoppen

Das Panel öffnet sich über der rechten Seite (auf dem Handy über den ganzen Bildschirm). Oben stehen der Name des Jobs, sein Zustand, seine Tags, **Sitzung öffnen** (oder **Lauf öffnen**) und **Stoppen**. Darunter steht, was über ihn bekannt ist, etwa Sitzung, Projekt und Ordner, wann er gestartet ist, wie lange er noch braucht und worauf diese Schätzung beruht, worauf er wartet und wie er ausgegangen ist. Dann folgt sein Befehl, mit einem Knopf zum Kopieren.

**Ausgabe** zeigt das Ende dessen, was der Job ausgegeben hat, und wird während des Laufs alle paar Sekunden aktualisiert. Die neuesten Zeilen bleiben im Blick, solange du nicht nach oben scrollst. Bei einem Subagent werden seine Schritte aufgelistet. Manche Jobs, etwa Hydor-Subagenten und die Hintergrundaufgaben von Codex, haben hier keine Ausgabe: Nutze **Sitzung öffnen**.

**Stoppen** fragt erst nach und beendet dann den Job: Ein Job oder ein Befehl wird gestoppt, ein Lauf von Experimente wird wie auf seiner eigenen Seite gestoppt, und bei einem Hydor-Subagent wird dessen Sitzung gestoppt. Was der Job bis dahin getan hat, bleibt erhalten. Arbeit, die in einer Sitzung außerhalb von Hydor läuft, und die Hintergrundaufgaben von Codex lassen sich von hier aus nicht stoppen, deshalb haben sie kein **Stoppen**.

## Wie Agenten Arbeit hierher bringen

Du musst nichts einrichten. Eine Hintergrundaufgabe, die eine Sitzung startet, erscheint hier von selbst. Jede Sitzung, die die App startet, hat außerdem einen Befehl namens `job`, und die Agenten sind angewiesen, ihn für lange Arbeiten zu verwenden (alles über etwa zehn Minuten), damit sie hier mit Name, Tag, Fortschritt und Restzeit erscheinen (siehe [Vier Befehle, die jeder Agent hat](/guide/agents#four-commands-every-agent-has)).

Sag in einfachen Worten, was du möchtest, und der Agent erledigt den Rest:

- **Eines nach dem anderen**: „Starte die Auswertung, nachdem der Indexaufbau fertig ist“. Der zweite Job wartet auf den ersten und startet nie, wenn der erste fehlschlägt;
- **Einer nach dem anderen**: „Stell diese Sweeps in eine Warteschlange“. Jobs mit demselben Warteschlangennamen kommen abwechselnd an die Reihe;
- **Wie lange es dauern sollte**: Ein Agent kann eine eigene Schätzung angeben, die verwendet wird, bis der Fortschritt des Jobs mehr verrät;
- **Wozu es gehört**: „Gib dem Indexaufbau den Tag search-index“. Agenten können auch die verwendeten Tags auflisten und die Tags eines Jobs nachträglich ändern;
- **Bereits laufende Arbeit**: „Zeig das Training, das du vorhin gestartet hast, in Jobs an“. Der Agent fügt es hinzu, ohne es neu zu starten (`job adopt`). Unter Windows ist das nicht verfügbar. Wenn es endet, steht dort **Beendet**, weil niemand sagen kann, wie es ausgegangen ist.

Solange ein Job, den eine Sitzung gestartet hat, noch wartet oder läuft (einer, den sie mit `job` ausgeführt hat, oder ein Lauf von Experimente, den sie gestartet hat), ist diese Sitzung nicht abgeschlossen: Ihr Punkt pulsiert weiter blau und ihr Status lautet „Arbeitet · 1 im Hintergrund“, auch nachdem ihr Agent aufgehört hat. Ihre Benachrichtigung **Abgeschlossen** kommt erst, wenn der Job endet. Der Knopf zum Stoppen neben dem Nachrichtenfeld lässt diese Jobs weiterlaufen: Stoppe sie hier.

Wenn die App nicht erreichbar ist, während ein Agent einen Job startet, läuft der Befehl trotzdem. Er erscheint nur nicht hier.

## Frag einen Agenten

- „Führe die Auswertung als Job aus, sobald der Indexaufbau fertig ist.“
- „Gib dem Indexaufbau den Tag search-index.“
- „Was läuft noch für intent-data?“
- „Was läuft gerade in meinem Projekt Thesis?“
- „Zeig mir das Training, das du vorhin gestartet hast, in den Jobs.“
- „Führe diese drei Sweeps nacheinander in einer Warteschlange aus.“
- „Was läuft noch, und wann ist es fertig?“
- „Stopp den Download und führe stattdessen die Tests als Job aus.“
- „Warum ist der letzte Build fehlgeschlagen? Sieh dir die Ausgabe des Jobs an.“
