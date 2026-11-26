# Jobs

Unter „Jobs“ findest du an einem Ort die langen Arbeiten, die deine Sitzungen im Hintergrund ausführen, sortiert nach Tags, die angeben, um welche Art von Arbeit es sich jeweils handelt, etwa Experimente, Datensammlung oder Builds: Trainingsläufe, Indexierung, Downloads und Subagents. Zu jedem Job siehst du, wie lange er schon läuft, wie weit er ist und wie lange er ungefähr noch braucht, was auf den Start wartet und worauf, und wie die abgeschlossenen geendet haben. Du kannst die Ausgabe eines Jobs lesen und ihn von dort stoppen, und du kannst einen Agenten bitten, eine Sache nach der anderen auszuführen.

![Die Seite „Jobs“: vier Kacheln als Zusammenfassung, ein Chip für jeden Tag und die Jobs in Arbeit, nach Tag gruppiert, mit Fortschritt und verbleibender Zeit](images/jobs.webp)

## Was Jobs anzeigt

Klicke in der Leiste auf **Jobs** oder öffne [Jobs](/jobs). Auf dem Smartphone findest du die Seite unten in der Schublade bei den Werkzeugen. Eine Zahl auf dem Symbol zeigt, wie viele Jobs gerade laufen.

Ein Job ist eines der folgenden:

- eine Hintergrundaufgabe einer deiner Sitzungen: ein Befehl, ein Monitor (eine Überwachung eines Logs oder eines Programms) oder ein Subagent des Programms des Agenten selbst, etwa von Claude Code. Sitzungen, die du außerhalb von Hydor ausführst, in VS Code oder in einem Terminal, zeigen ihre Jobs ebenfalls an;
- Arbeit, die ein Agent als Job gestartet hat (siehe [Wie Agenten Arbeit hierher bringen](#how-agents-put-work-here));
- ein Durchlauf aus [Experimente](/guide/experiments), der läuft oder in seiner Warteschlange wartet;
- ein Hydor-Subagent, eine Sitzung, die eine andere Sitzung für einen Teil ihrer Aufgabe gestartet hat, solange er arbeitet (siehe [Subagents](/guide/sessions#subagents)).

Vier Kacheln oben fassen alles zusammen:

- **Läuft** und **In der Warteschlange**: wie viele Jobs laufen und wie viele warten;
- **Alles erledigt**: wann all diese Arbeit voraussichtlich fertig ist, etwa „in etwa 2 Std. 10 Min.“. Es erscheint ein Strich, sofern nicht für jeden Job noch eine Schätzung aussteht; Subagents, die nie eine Schätzung haben, bleiben dabei außen vor;
- **Heute beendet**: wie viele heute geendet haben. Daneben führt dich „1 fehlgeschlagen“ oder die jeweilige Anzahl zu diesen Jobs.

Unter den Kacheln stehen ein Chip für jeden [Tag](#tags), das Projektmenü (**Alle Projekte**, siehe [Jobs eines Projekts ansehen](#see-one-projects-jobs)) und das Feld **Jobs filtern**. Gib etwas in das Feld ein, um nur die Jobs zu sehen, in deren Name, Befehl, Sitzung, Projekt oder Tags diese Wörter vorkommen; mit **Alle Jobs anzeigen** kommt alles zurück, wenn nichts passt. Darunter folgen **In Arbeit**, **Server** und **Abgeschlossen**, jeweils nur dann, wenn es etwas zu zeigen gibt. Die Kacheln zählen nur das, was nach Tag, Projekt und Filter übrig bleibt. Server, die laufen, werden weder in den Kacheln noch in der Zahl in der Leiste mitgezählt. Die Seite aktualisiert sich von selbst.

Wenn nichts läuft oder wartet, steht dort „Im Hintergrund läuft gerade nichts.“

## In Arbeit

Unter **In Arbeit** stehen die Jobs, die laufen, und die, die warten, jeweils in einer Karte pro Tag; die Jobs ohne Tag stehen in der letzten Karte, **Ohne Tag**. Oben auf einer Karte stehen der Tag, wie viele ihrer Jobs laufen und warten (etwa „3 laufen · 1 in der Warteschlange“) und, wenn jeder von ihnen eine Schätzung hat, wann sie fertig sein sollten („fertig in etwa 34 Min.“). Stammt die gesamte Arbeit einer Karte aus einer Sitzung, werden auch diese Sitzung und ihr Projekt dort genannt, und die Zeilen lassen sie weg. Klicke auf den oberen Teil einer Karte, um sie einzuklappen oder wieder zu öffnen; die App merkt sich das in diesem Browser. Solange du filterst oder einen Tag ausgewählt hast, ist nichts eingeklappt. Solange kein Job einen Tag hat, werden die Jobs einfach aufgelistet, ohne Karten nach Tag.

Jeder Job ist eine Zeile. Sein Symbol zeigt, um welche Art es sich handelt (zeige darauf, um **Befehl**, **Überwachen**, **Claude Code subagent**, **Hydor-Subagent**, **Experiment-Durchlauf** oder **Job** zu lesen), und der Punkt auf dem Symbol zeigt den Zustand. Neben dem Namen stehen weitere Tags; zeige auf den Namen, um den Befehl zu sehen. Darunter stehen der Stand, die Sitzung, die ihn gestartet hat, und sein [Projekt](#see-one-projects-jobs), jeweils als Link, und das Letzte, was er ausgegeben hat.

Klicke auf eine Zeile, um [das Fenster des Jobs](#a-jobs-panel-and-stop) zu öffnen. Sein Menü **⋯** enthält **Details und Ausgabe**, **Sitzung öffnen** (**Lauf öffnen** bei einem Durchlauf aus Experimente), **Tags bearbeiten …** und **Stoppen**.

## Läuft

Ein laufender Job zeigt, wie lange er schon läuft („läuft seit 12 Min. 05 Sek.“). Wenn der Job angibt, wie weit er ist, gibt es einen Fortschrittsbalken mit einer Prozentangabe; zeige auf den Balken, um den eigenen Zählstand des Jobs zu sehen, etwa „Schritt 120/500“. Gibt es keine verbleibende Zeit anzuzeigen, steht dieser Zählstand unter dem Balken.

### Verbleibende Zeit

Gibt es einen Anhaltspunkt, steht in der Zeile „noch etwa 1 Std. 12 Min.“. Die App nimmt den ersten der folgenden Anhaltspunkte, den sie hat:

1. die verbleibende Zeit, die der Job selbst ausgegeben hat, wie es viele Fortschrittsbalken tun;
2. wie schnell sein Fortschritt bisher vorangekommen ist;
3. die Schätzung, die der Agent beim Start des Jobs angegeben hat;
4. wie lange derselbe Befehl im selben Ordner zuvor gebraucht hat, wenn er in der letzten Woche gut beendet wurde.

Zeige auf die Zeit, um zu sehen, welcher es ist; das Fenster des Jobs nennt ihn ebenfalls. **(geschätzt)** daneben bedeutet, dass es nur ein grober Wert ist: eine einzelne Fortschrittsmessung, die Schätzung des Agenten oder ein früherer Durchlauf. Ist ein Job länger gelaufen als erwartet, steht stattdessen **länger als geschätzt**. Gibt es keinen Anhaltspunkt, wird keine Zeit angezeigt.

## In der Warteschlange

Ein Job in der Warteschlange ist noch nicht gestartet. Seine Zeile sagt, warum:

- **Wartet auf** und die Namen anderer Jobs: Er startet, sobald alle gut beendet wurden. Klicke auf einen Namen, um dessen Zeile zu finden. Die Jobs, auf die andere warten, zeigen **Danach:** und wer als Nächstes kommt;
- **Als Nächstes in der Warteschlange** und der Name der Warteschlange oder ihr Platz, etwa „3. in der Warteschlange gpu“: Eine Warteschlange führt jeweils einen Job aus, in der Reihenfolge ihres Eintreffens, über alle deine Sitzungen hinweg. Der Erste in der Reihe wartet unter Umständen noch auf einen anderen Job, und die dahinter warten ebenfalls;
- **Wartet auf eine freie GPU** oder **Wartet auf einen freien Platz**: Ein Durchlauf aus Experimente wartet auf Platz (siehe [Wie die Warteschlange auswählt](/guide/experiments#how-the-queue-chooses)).

Haben die Jobs davor Schätzungen, steht dort auch, wann er starten sollte, etwa „startet in etwa 40 Min.“.

**Stoppen** bei einem Job in der Warteschlange bedeutet, dass er nie startet, und die Jobs, die auf ihn warten, ebenso wenig. Schlägt ein Job, auf den ein anderer wartet, fehl oder wird gestoppt, startet auch der wartende nie.

## Server

Manche Befehle enden nie von selbst: ein Entwicklungsserver, ein Web- oder API-Server, ein Notebook oder ein Modellserver, den eine Sitzung im Hintergrund laufen gelassen hat. Jobs erkennt sie an ihrem Befehl und listet sie unter **Server** auf, mit der Laufzeit jedes Servers und ohne verbleibende Zeit. Sie laufen, bis du sie stoppst, mit **Stoppen** wie bei jedem anderen Befehl. Sie zählen nicht zu den laufenden Jobs, und die Ansicht **Zeitleiste** lässt sie aus. Sobald einer endet, kommt er unter **Abgeschlossen**.

## Abgeschlossen

Unter **Abgeschlossen** steht, was in den letzten 7 Tagen geendet hat, das Neueste zuerst, unter einer Überschrift für jeden Tag: **Heute**, **Gestern**, dann das Datum. Du siehst die zehn neuesten, und **Alle anzeigen** bringt den Rest. Jeder Eintrag sagt, wie er geendet hat, wann und wie lange er gedauert hat:

- **Fertig**: Er wurde gut beendet;
- **Fehlgeschlagen**, mit seinem Exit-Code, wenn es einen gibt (die Zahl, mit der ein Programm endet; alles außer 0 bedeutet, dass etwas schiefgegangen ist);
- **Angehalten**: Du oder ein Agent habt ihn gestoppt;
- **Nie gestartet** und der Grund, etwa dass ein Job, auf den er wartete, fehlgeschlagen ist;
- **Beendet**: Arbeit, die schon lief, als sie zu Jobs hinzugefügt wurde, ist beendet, und niemand hat gesehen, ob es gut ging.

Wenn etwas fehlgeschlagen ist, wechsle von **Alle** zu **Fehlgeschlagen**, um nur diese zu sehen. **Aus dieser Liste entfernen** im Menü **⋯** einer Zeile nimmt einen Eintrag heraus, und **Leeren** nimmt nach einer Rückfrage alle heraus, auch die, die ein Tag, das Projektmenü oder der Filter ausblendet. Das räumt nur die Liste auf: Deine Sitzungen und Durchläufe aus Experimente bleiben erhalten.

## Tags

Ein Tag sagt, um welche Art von Arbeit es sich handelt, etwa `experiments` oder `data-collection`, damit du auf einen Blick siehst, was läuft, und dir jeweils eine Art von Arbeit ansehen kannst. Tags benennen nie ein Projekt oder ein Thema; deine Sitzungen und Projekte werden neben jedem Job ohnehin angezeigt. Ein Job hat bis zu 3 Tags, in Kleinbuchstaben mit Bindestrichen zwischen den Wörtern: „Data collection“ wird als `data-collection` gespeichert. Der erste bestimmt, wo er aufgelistet wird.

Es gibt neun grobe Arten von Arbeit, und fast alles passt zu einer davon:

- `experiments`: Training, Auswertung, Parameterdurchläufe und Benchmarks;
- `data-collection`: Crawlen, Scrapen, Herunterladen, Abfragen von Diensten, Beschriften oder Erzeugen von Daten;
- `data-processing`: Bereinigen, Konvertieren, Indexieren und Einbetten von Daten;
- `development`: Schreiben oder Ändern von Code, Dokumenten oder Übersetzungen und deren Überprüfung;
- `builds`: Bauen, Kompilieren und Paketieren;
- `tests`: Testsuiten, Typprüfungen und Linting;
- `deployment`: Ausliefern, Veröffentlichen und Betreiben von Servern;
- `analysis`: Recherche, Berichte, Diagramme und Statistik;
- `maintenance`: Backups, Aufräumen und Updates.

Jede Arbeit wird für sich getaggt: Sie übernimmt nie den Tag ihrer Sitzung, sodass der Build, die Tests und der Download einer Sitzung jeweils unter ihrer eigenen Art stehen. Du musst selbst nichts taggen:

- Der Agent, der einen Job startet, taggt ihn und verwendet einen bereits genutzten Tag, wann immer die Arbeit dazu passt, damit dieselbe Art von Arbeit unter einem Namen bleibt. Sag, welchen Tag du möchtest, und der Agent verwendet ihn;
- Ein Durchlauf aus [Experimente](/guide/experiments) wird immer mit `experiments` getaggt;
- Jede andere Arbeit ohne Tag (die Hintergrundbefehle einer Sitzung, ihre Subagents und Server, ein Job, der ohne Tag gestartet wurde) wird vom [Hilfsmodell](/settings?s=models&find=Helper%20model) getaggt, das sich Namen, Art und Befehl dieser Arbeit ansieht und aus denselben Tags auswählt. Das geschieht im Hintergrund, daher kann ein solcher Tag einen Moment nach der Arbeit erscheinen. Bei einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) wird es nie gefragt, und die Umgebungsvariable `HYDOR_JOBS_TAGGER=0` schaltet es aus.

Die groben Tags haben eigene Farben, überall dieselben.

### Tags ändern

Du kannst die Tags jedes Jobs ändern, egal wer ihn getaggt hat. Wähle **Tags bearbeiten …** im Menü **⋯** des Jobs oder klicke auf den Stift neben den Tags in seinem Fenster. Gib die Tags durch Kommas getrennt ein oder klicke unter **Tags zur Auswahl** auf welche (zuerst die verwendeten Tags, dann die groben), dann auf **Speichern**. Der Dialog sagt, wer den Job bisher getaggt hat: „Der Agent, der ihn gestartet hat, hat ihn getaggt.“, „Du hast ihn getaggt.“, „Das Hilfsmodell hat ihn getaggt. Ändere es, wenn es falsch ist.“ oder, bei einem Durchlauf aus Experimente, „Durchläufe aus Experimente werden mit experiments getaggt.“

Speichere ein leeres Feld, um zu entfernen, was du festgelegt hast. Der Job hat dann keinen eigenen Tag, und das Hilfsmodell kann ihn wie oben erneut taggen.

### Einen Tag ansehen

Klicke auf den Chip eines Tags, um nur die Arbeit darunter zu sehen: Die Kacheln, **In Arbeit**, **Server**, **Abgeschlossen** und die Zeitleiste folgen alle. Die Zahl auf einem Chip gibt an, wie viele seiner Jobs laufen oder warten. Klicke auf **Alle**, um wieder alles zu sehen; der Chip **Ohne Tag** zeigt [die Arbeit ohne Tag](/jobs?untagged=1).

Der gewählte Tag ist Teil der Adresse der Seite (sie endet auf `?tag=` und dem Namen des Tags), sodass du ein Lesezeichen setzen oder sie an dein Smartphone schicken kannst. Ein Chip richtet sich nach dem ersten Tag jedes Jobs; um einen Job über einen anderen seiner Tags zu finden, gib diesen Tag in **Jobs filtern** ein.

## Jobs eines Projekts ansehen

Das Projektmenü steht neben **Jobs filtern**. Es zeigt **Alle Projekte** oder den Namen des gewählten Projekts mit seinem Zeichen. Öffne es zur Auswahl:

- **Alle Projekte**: jeder Job;
- ein Projekt, das hier Jobs hat; die Zahl daneben gibt an, wie viele davon laufen oder warten;
- **Kein Projekt**: die Jobs, die zu keinem gehören.

Die Kacheln, **In Arbeit**, **Server**, **Abgeschlossen** und die Zeitleiste zeigen dann nur diese Jobs. Wenn du ein Projekt wählst, kommst du zum Chip **Alle** zurück, und die Chips und ihre Zahlen beziehen sich nur auf dessen Jobs; klicke auf einen, um diesen Tag innerhalb des Projekts zu sehen. Solange ein Projekt gewählt ist, lassen die Zeilen seinen Namen weg. Das Menü erscheint, sobald ein Job zu einem Projekt gehört.

Das gewählte Projekt ist ebenfalls Teil der Adresse der Seite (`?project=` und seine ID, oder `?project=none`), sodass du ein Lesezeichen setzen kannst. Zu den Jobs einer [Gruppe](/guide/projects#bring-projects-together-in-a-group) gehören die der Projekte, die sie zusammenführt. Solange ein Projekt laufende oder wartende Jobs oder weiterlaufende Server hat, zeigt seine eigene Seite sie unter [Übersicht](/guide/projects#overview).

Ein Job gehört zum Projekt seiner Sitzung. Gibt es keines (seine Sitzung gehört zu keinem Projekt oder er hat keine Sitzung, etwa ein Job, den du aus deinem eigenen Terminal gestartet hast, oder ein Durchlauf, den du auf der Seite Experimente gestartet hast), gehört er zu dem Projekt, in dessen Ordner er läuft. Liegt der Ordner eines Projekts in dem eines anderen, bekommt das innere Projekt ihn. Eine Gruppe und ein Projekt, dessen Ordner dein Home-Ordner oder ein ganzer Datenträger ist, bekommen auf diese Weise nie Jobs. Das Fenster eines Jobs nennt sein **Projekt**.

## Die Ansicht „Zeitleiste“

Wechsle oben rechts zwischen **Liste** und **Zeitleiste**; die App merkt sich deine Wahl in diesem Browser. Die Zeitleiste zeichnet für jeden Job, der läuft oder wartet, einen Balken entlang der Uhr, mit einem Punkt in der Farbe seines Tags vor dem Namen. Die Tag-Chips, das Projektmenü und **Jobs filtern** schränken sie wie die Liste ein:

- **Bisher gelaufen** ist durchgezogen, und **Geschätzt** ist der gestreifte Teil dahinter;
- Jobs in der Warteschlange (**In der Warteschlange**) sind gestrichelt, dort, wo sie starten sollten;
- ein Balken mit **Keine Schätzung** blendet aus;
- die mit **Jetzt** markierte Linie ist die Gegenwart, und dünne Linien verbinden einen Job mit denen, die auf ihn warten.

Ein Job über seiner Schätzung wird bernsteinfarben. Zeige auf einen Balken, um Zustand und Zeiten zu lesen, und klicke darauf, um das Fenster des Jobs zu öffnen. Auf einem schmalen Bildschirm scrollt das Diagramm seitlich, und die Namen bleiben stehen. Die abgeschlossenen Jobs stehen darunter aufgelistet.

## Das Panel eines Jobs und Stoppen

Das Panel öffnet sich über der rechten Seite der Seite (auf einem Smartphone über dem ganzen Bildschirm). Oben stehen der Name des Jobs, sein Zustand, seine Tags, **Sitzung öffnen** (oder **Lauf öffnen**) und **Stoppen**. Darunter steht, was über den Job bekannt ist, etwa seine Sitzung, sein Projekt und sein Ordner, wann er gestartet ist, wie viel Zeit ihm noch bleibt und warum diese Schätzung gilt, worauf er wartet und wie er beendet wurde. Danach folgt sein Befehl, mit einer Schaltfläche, die ihn kopiert.

**Ausgabe** zeigt das Ende dessen, was der Job ausgegeben hat. Solange er läuft, wird die Ansicht alle paar Sekunden aktualisiert; die neuesten Zeilen bleiben sichtbar, sofern du nicht nach oben scrollst. Bei einem Subagent werden seine Schritte aufgelistet. Manche Jobs, etwa Hydor-Subagents und die Hintergrundaufgaben von Codex, haben hier keine Ausgabe: Nutze **Sitzung öffnen**.

**Stoppen** fragt zuerst nach und beendet dann den Job: Ein Job oder ein Befehl wird angehalten, ein Lauf von Experimente wird so gestoppt wie auf seiner eigenen Seite, und die Sitzung eines Hydor-Subagents wird gestoppt. Was der Job bis dahin erledigt hat, bleibt erhalten. Arbeit, die in einer Sitzung außerhalb von Hydor läuft, und die Hintergrundaufgaben von Codex können von hier aus nicht gestoppt werden, deshalb haben sie kein **Stoppen**.

## Wie Agenten Arbeit hierher bringen

Du musst nichts einrichten. Eine Hintergrundaufgabe, die eine Sitzung startet, erscheint hier von selbst. Jede Sitzung, die die App startet, hat außerdem einen Befehl namens `job`. Agenten sind angewiesen, ihn für lange Arbeit zu nutzen (alles, was länger als etwa zehn Minuten dauert), damit sie hier mit einem Namen, einem Tag für die Art der Arbeit, ihrem Fortschritt und der verbleibenden Zeit erscheint (siehe [Vier Befehle, die jeder Agent hat](/guide/agents#four-commands-every-agent-has)).

Sag einfach in eigenen Worten, was du willst, den Rest erledigt der Agent:

- **Nacheinander**: „Führe die Auswertung aus, nachdem der Index-Build fertig ist“. Der zweite Job wartet auf den ersten und startet nie, wenn der erste fehlschlägt;
- **Einer nach dem anderen**: „Stelle diese Sweeps in eine Warteschlange“. Jobs mit demselben Warteschlangennamen kommen abwechselnd an die Reihe;
- **Wie lange es dauern soll**: Ein Agent kann seine eigene Schätzung angeben. Sie gilt, bis der Fortschritt des Jobs mehr aussagt;
- **Welche Art von Arbeit es ist**: „Markiere den Crawl mit dem Tag data-collection“. Agenten können auch die verwendeten Tags und die noch nicht verwendeten allgemeinen Tags auflisten und die Tags jedes Jobs nachträglich ändern;
- **Bereits laufende Arbeit**: „Zeige das Training, das du vorhin gestartet hast, unter Jobs“. Der Agent fügt es hinzu, ohne es neu zu starten (`job adopt`); das ist unter Windows nicht verfügbar. Wenn es endet, steht dort **Beendet**, weil niemand sagen kann, wie es verlaufen ist.

Solange ein Job, den eine Sitzung gestartet hat, noch wartet oder läuft (einer, den sie mit `job` ausgeführt hat, oder ein Lauf von Experimente, den sie gestartet hat), ist diese Sitzung nicht abgeschlossen: Ihr Punkt pulsiert weiter blau und ihr Status lautet „Arbeitet · 1 im Hintergrund“, auch nachdem ihr Agent angehalten hat, und ihre Meldung **Abgeschlossen** kommt erst, wenn der Job endet. Die Stopp-Schaltfläche neben ihrem Nachrichtenfeld lässt diese Jobs weiterlaufen: Stoppe sie hier.

Wenn die App nicht erreichbar ist, während ein Agent einen Job startet, wird der Befehl trotzdem ausgeführt; er erscheint dann nur nicht hier.

## Einen Agenten fragen

- „Führe die Auswertung als Job aus, nachdem der Index-Build fertig ist.“
- „Markiere den Crawl mit dem Tag data-collection.“
- „Zeig mir nur die Experimente, die gerade laufen.“
- „Was läuft gerade in meinem Projekt Thesis?“
- „Zeige das Training, das du vorhin gestartet hast, unter Jobs.“
- „Führe diese drei Sweeps einer nach dem anderen in einer Warteschlange aus.“
- „Was läuft noch, und wann ist es fertig?“
- „Stoppe den Download und führe stattdessen die Tests als Job aus.“
- „Warum ist der letzte Build fehlgeschlagen? Sieh dir die Ausgabe seines Jobs an.“
