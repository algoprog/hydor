# Agenten

Ein Agent legt fest, als wer eine Sitzung arbeitet: seine Anweisungen, was er verwenden darf, wo und wann er arbeitet, mit welcher Modellstufe er denkt, an welche anderen Agenten er Arbeit abgibt und was er in einem Monat ausgeben darf. Dieses Thema behandelt die Seite „Agenten“, die mitgelieferten Agenten, das Erstellen eines eigenen Agenten durch eine Beschreibung seiner Aufgabe, das Ändern eines Agenten, seinen Arbeitsbereich, seine Zeitpläne, Leistungsstufen, Agenten, die Arbeit an andere Agenten abgeben, ein Monatsbudget, die Versionen eines Agenten und die Beispiele, die ihn prüfen, das Starten und Wechseln von Sitzungen als Agent, das Teilen eines Agenten als Datei, das Importieren der Agentendateien von Claude Code, Aufgabenordner, das Aufräumen durch Agenten nach einer Aufgabe und die drei Befehle, die jeder Agent in seiner Shell vorfindet.

![Die Seite „Agenten“: deine Agenten, jeder in einer Karte mit seinem aktuellen Status, und darunter die eingebauten](images/agents.webp)

## Was ein Agent ist

Wenn du eine Sitzung startest, wählst du auf der Startseite einen Agenten aus, und später kannst du die Sitzung im Nachrichtenfeld auf einen anderen umstellen. Seine Anweisungen kommen zu denen des Programms hinzu, sodass dasselbe Programm in einer Sitzung als sorgfältiger Forscher arbeitet und in der nächsten als geduldiger Nachhilfelehrer. Ein Agent funktioniert mit jedem Programm: Claude Code, Codex, Custom (der App-eigene Agent) und den Agenten, die ACP (das Agent Client Protocol) sprechen, etwa Gemini CLI oder OpenCode.

Ein Agent kann Folgendes enthalten:

- **Anweisungen**: wer er ist und wie er arbeitet. Er soll durchgehend so arbeiten, aber was du in der Unterhaltung verlangst, hat Vorrang.
- **Arbeitsbereich**: überall oder nur in einigen deiner Projekte (siehe [Wo ein Agent arbeitet](#where-an-agent-works)).
- **Ausführungszeitpunkt**: wenn du oder ein anderer Agent ihn darum bittest, und nach seinen eigenen Zeitplänen (siehe [Wann ein Agent arbeitet: Zeitpläne](#when-an-agent-works-schedules)).
- **Verwendete Modellstufe**: Automatisch oder eine Leistungsstufe (Schnell, Standard, Am besten oder Max), deren Modell du einmal für jedes Programm festlegst (siehe [Womit ein Agent denkt: Leistungsstufen](#what-an-agent-thinks-with-tiers)).
- **Sein Team**: die anderen Agenten, an die er Teile seiner Arbeit weitergeben darf, und ob andere Agenten ihm Arbeit weitergeben dürfen (siehe [Agenten, die Arbeit an andere Agenten weitergeben](#agents-that-hand-work-to-other-agents)).
- **Ein Monatsbudget**: was seine Sitzungen in einem Monat ausgeben dürfen (siehe [Ein Monatsbudget](#a-monthly-budget)).
- **Ergebnisübergabe**: die Felder jedes Ergebnisses, geprüft, und wohin jedes geht: eine behaltene Seite, eine Zeile in einer Tabelle, eine E-Mail an Personen, eine Benachrichtigung, eine Datei, ein Webhook (siehe [Was ein Agent zurückgibt](#what-an-agent-hands-back)).
- **Eine eigene Unterhaltung**: Er kann eine Unterhaltung führen, mit einem Posteingang für Nachrichten von dir und von anderen Agenten, in dem auch seine geplanten Ausführungen etwas posten (siehe [Ein Agent mit eigener Unterhaltung](#an-agent-with-a-conversation-of-its-own)).
- **Erlaubte Werkzeuge**: Dateien lesen, Dateien erstellen und ändern, Befehle ausführen, das Web nutzen, einen Browser nutzen, den Computer nutzen (seinen Bildschirm, seine Maus und seine Tastatur, in den Desktop-Apps mit eingeschalteter Computer-Nutzung) und weitere Werkzeuge. Lass alle eingeschaltet oder schalte einige aus.
- **Bevorzugte Skills**: Skills, die er vor dem Start lädt, wenn sie zur Aufgabe passen (siehe [Skills](/guide/skills)).
- **Verbundene Apps**: verbundene Konten, die in seinen Sitzungen eingeschaltet werden (siehe [Verbundene Apps, Keys und Werkzeuge](/guide/connections)).
- **Ein Programm, Modell und Berechtigungsmodus** als Vorschlag: auf der Startseite mit ausgewählt, und du kannst sie vor dem Start trotzdem noch ändern.
- **Wo seine Sitzungen beginnen**, wenn du keinen Ordner wählst: in einem eigenen neuen Aufgabenordner oder im Ordner, der auf der Startseite angezeigt wird.

Ein Agent ist eine Rolle, die eine Sitzung übernimmt. Text, den alle Agenten in jeder Sitzung befolgen sollen, in einem Projekt oder in einer Sitzung, etwa wie du möchtest, dass sie mit dir sprechen, gehört stattdessen in die [Agentenrichtlinien](/guide/guidelines). Vor Version 0.37.0 hießen Agenten Assistenten; es sind dieselben, nur mit mehr Möglichkeiten.

## Die Seite „Agenten“

Öffne **Agenten** in der Leiste oder gehe zu [/agents](/agents). Auf einem Smartphone ist die Seitenleiste eine Schublade: öffne sie zuerst. [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Your%20agents) hat eine Zeile **Deine Agenten**, die ebenfalls diese Seite öffnet (sie nennt, wie viele Agenten deine eigenen sind); der Rest dieses Abschnitts handelt von Aufgabenordnern und dem Aufräumen, weiter unten.

- Auf einem Computer hat die Seite neben der Leiste eine Spalte, wie Apps und Einstellungen: oben das Logo, **Neu** und **Seitenleiste ausblenden** (Strg+B, ⌘B auf einem Mac), darunter die Orte. **Neu** öffnet ein Menü: **Neuer Agent** erstellt einen (siehe [Einen Agenten erstellen](#make-an-agent)); **Agent aus Datei installieren** installiert einen aus einer Datei, die dir jemand gegeben hat (siehe [Einen Agenten als Datei teilen](#share-an-agent-as-a-file)); **Claude Code-Agentendateien importieren** holt die Agentendateien von Claude Code herein (siehe [Die Agentendateien von Claude Code importieren](#import-claude-codes-agent-files)).
- Die Orte: **Alle Agenten** (jeder Agent als Karte: deine, dann die, die mit der App mitkommen, unter **Eingebaut**), **Deine Agenten** (nur deine), **Eingebaut** (nur die, die mit der App mitkommen; ein Klick auf einen öffnet seine eigene Seite), **Braucht dich** und **Nach einem Zeitplan** (jeweils sichtbar, solange einige von deinen dazu passen) und unter **Wo sie arbeiten** **Überall** und jedes Projekt, das eigene Agenten hat. Jeder Ort zeigt, wie viele Agenten er enthält. Nach einer Trennlinie zeigt **Zeitpläne** alles, was von selbst läuft, auf einer Woche: die Zeitpläne deiner Agenten mit deinen anderen Geplanten Aufgaben, die Zeitpläne deiner Apps, Watcher und Webhooks, jede Ausführung eingefärbt danach, wie sie verlief, was als Nächstes läuft und eine Liste von allen mit einem Schalter, um jede zu pausieren (siehe [Die Woche ansehen: was lief und was als Nächstes läuft](/guide/tasks#see-the-week-what-ran-and-what-runs-next)). Der geöffnete Ort ist markiert, und die Adresse behält ihn (`/agents?place=mine`, `/agents/schedules`), sodass ein Link ihn öffnet.
- Oben auf der Seite steht links der Name des Ortes und rechts das Suchfeld: **Agent suchen** schränkt die Karten und die eingebauten Agenten auf die ein, deren Name oder Zeile enthält, was du eingibst.
- Deine Agenten werden als Karten angezeigt. Jede Karte zeigt den Namen des Agenten, seine Zeile, seinen Status (**Arbeitet**, **Braucht dich**, wenn eine seiner Sitzungen auf deine Antwort wartet, **Budget aufgebraucht** oder **Inaktiv**), die Projekte, in denen er arbeitet (oder **Überall**), seine Leistungsstufe, wann er als Nächstes läuft, wie viele Nachrichten in seinem Posteingang warten und was er diesen Monat ausgegeben hat.
- Auf einem Smartphone und in einem schmalen Fenster gibt es keine Spalte: Die Seite behält ihren Titel, mit **Neuer Agent**, **Importieren** und **Installieren** rechts, darunter zwei Tabs (**Deine Agenten** und **Zeitpläne**) und über den Karten Chips, die **Alle**, **Überall**, jedes Projekt mit eigenen Agenten, **Nach einem Zeitplan** und **Braucht dich** zeigen. Die Agenten, die mit der App mitkommen, stehen unter **Eingebaut**.

Klicke auf eine Karte, um die eigene Seite des Agenten zu öffnen, die die Spalte neben sich behält, wobei dieser Agent markiert ist (**Deine Agenten** bei einem von deinen):

- Seine Einstellungen in wenigen Sätzen, etwa „Er arbeitet überall, jeden Werktag um 09:00 Uhr, und denkt mit Schnell.“ Klicke auf beliebige unterstrichene Wörter, um sie dort zu ändern (siehe [Einen Agenten ändern](#change-an-agent)).
- **Sitzung starten** öffnet die Startseite mit dem ausgewählten Agenten (und seinem Projekt, wenn er in einem arbeitet).
- **Alle Einstellungen** öffnet alle Einstellungen des Agenten in einem Fenster (siehe [Alle Einstellungen](#all-settings)). **Duplizieren** erstellt eine Kopie zum Ändern; **Löschen** entfernt einen von deinen.
- **Mehr** (⋯): **Versionen** listet bei einem von deinen auf, wie er vor jeder Änderung war, zum Vergleichen und Wiederherstellen (siehe [Versionen: zu einer früheren zurückkehren](#versions-go-back-to-an-earlier-one)); **Als Datei herunterladen** speichert ihn als Datei zum Aufbewahren oder Weitergeben (siehe [Einen Agenten als Datei teilen](#share-an-agent-as-a-file)).
- **Beispiele**, bei einem von deinen: Nachrichten, mit denen du ihn ausprobieren kannst, und was seine Antwort leisten muss, mit **Beispiele testen** (siehe [Beispiele, die ihn prüfen](#examples-that-check-it)).
- **Zeitpläne** listet die Geplanten Aufgaben auf, die als er laufen, mit **Zeitplan hinzufügen**.
- **Posteingang**, bei einem Agenten, der eine eigene Unterhaltung führt: seine Nachrichten und deren Antworten, ein Feld, um ihm eine zu schicken, und **Seine Unterhaltung** (siehe [Ein Agent mit eigener Unterhaltung](#an-agent-with-a-conversation-of-its-own)).
- **Zurückgegebenes Ergebnis**, bei einem Agenten mit Feldern oder Zielen für seine Ergebnisse: eine Tabelle seiner Ergebnisse, eine Zeile für jedes, mit dem Ziel, wohin es ging (siehe [Was ein Agent zurückgibt](#what-an-agent-hands-back)).
- **Diesen Monat**: wie viele Sitzungen als er gestartet wurden und was sie ausgegeben haben, gemessen an seinem Budget, falls er eines hat; und seine **Letzte Sitzungen**, die jeweils ihre Unterhaltung öffnen, mit **Alle 23 in der Seitenleiste anzeigen** daneben (siehe [Die Sitzungen eines Agenten finden](#find-an-agents-sessions)).

## Die integrierten Agenten

Acht Agenten sind schon in der App enthalten. Keiner von ihnen schlägt ein Programm, ein Modell, eine Leistungsstufe oder einen Berechtigungsmodus vor, daher behalten sie, was du auf der Startseite gewählt hast, und keiner schränkt ein, was er verwenden darf, oder gibt Geld aus. Alle außer dem Programmierer starten eine Sitzung ohne Ordner in einem neuen Aufgabenordner (siehe [Aufgabenordner](#task-folders-where-a-task-without-a-folder-works)). Du kannst sie nicht ändern oder löschen, aber du kannst einen duplizieren und die Kopie ändern (siehe [Einen Agenten duplizieren oder löschen](#duplicate-or-delete-an-agent)).

Jeder stützt sich auf die [Antwort-UIs](/guide/sessions#answer-uis-cards-charts-and-maps-in-replies), die zu seiner Arbeit passen (ein Faktencheck, Übungsaufgaben, die du direkt an Ort und Stelle beantwortest, eine Reiseroute mit Karte, Kennzahlen und Diagramme). Was man besser ansieht als liest, kommt daher als etwas zum Anschauen, Vergleichen, Abhaken oder Ausprobieren.

### Allgemein

„Hilfe bei allem: Fragen, Schreiben, Planen, Dateien.“ Die Startseite wählt Allgemein, bis du dort einen anderen Agenten auswählst (der eigene Agent eines Projekts hat Vorrang). Er ist für Menschen geschrieben, die keine Programmierer sein müssen.

- Er findet heraus, was du willst, und erledigt es. Er stellt nur dann eine kurze Frage, wenn die Anfrage auf eine Weise unklar ist, die das Ergebnis verändert, und bietet die wahrscheinlichen Antworten als Buttons zum Anklicken an, wenn es nur wenige gibt; andernfalls trifft er eine vernünftige Wahl und sagt, was er gewählt hat.
- Er beginnt mit der Antwort, dann folgt das Wichtige im Detail, in einfachen Worten, und er erklärt jeden Fachbegriff, den er nicht vermeiden kann.
- Er macht jede Antwort leicht aufzunehmen und zu nutzen: Was man besser ansieht als liest (Optionen nebeneinander, Orte auf einer Karte, Schritte zum Abhaken, Zahlen als Diagramm, Dinge mit ihren Bildern), kommt als Antwort-UI, mit einem Bild oder einem Video, wo Sehen hilft, und seine eigenen Worte tragen die Begründung und den Rat.
- Er sucht im Web nach allem Aktuellen oder allem, bei dem er sich nicht sicher ist, liest die Dateien, auf die du ihn hinweist, und speichert Arbeit, die du behalten möchtest, als Dateien im Ordner der Sitzung. Oder er legt sie in den Dateien des Projekts ab (seine Details → **Dateien**), wenn es eine Seite ist, die du wieder verwendest, etwa ein Tracker oder ein Rechner.
- Wenn eine Antwort naheliegende nächste Schritte offenlässt (tiefer einsteigen, vergleichen, planen, etwas daraus machen), endet er mit zwei bis vier davon als Buttons zum Antippen; nicht nach jeder Antwort.
- Wenn er Dateien erstellt oder geändert hat, nennt er am Ende, welche es sind und wo sie liegen.

### Forscher

„Findet und prüft Quellen und zitiert sie.“

1. Er formuliert deine Frage in einer Zeile neu und zerlegt eine breite Frage in die wenigen Teilfragen, die beantwortet werden müssen.
2. Er sucht breit, bevor er einen Schluss zieht: mehrere Websuchen mit unterschiedlichen Formulierungen, in den passenden Suchkategorien (Fachartikel, Nachrichten, Patente, Unternehmensmeldungen, Datensätze), mit mehr Ergebnissen, wenn er ein Thema breit abdeckt.
3. Er liest die wichtigen Quellen, statt aus Textschnipseln zu antworten, und bevorzugt Primärquellen und maßgebliche Quellen: Originalarbeiten und -daten, offizielle Websites, anerkannte Fachleute und Medien. Er vermerkt das Datum jeder Quelle und sagt, wie aktuell die Antwort ist, wenn sich die Fakten im Lauf der Zeit ändern.
4. Wo sich Quellen widersprechen, sagt er das und gewichtet sie nach Qualität und Aktualität, und er trennt, was gesichert ist, was umstritten ist und was unbekannt ist.
5. Er zitiert beim Schreiben: eine nummerierte Markierung nach jeder Aussage, etwa [1], und am Ende die Quellen mit Titel, Autor oder Herausgeber, Datum und Link. Er erfindet nie eine Quelle, ein Zitat, eine Zahl oder einen Link und sagt es, wenn er etwas nicht überprüfen konnte.
6. Er beginnt mit den Ergebnissen: die Antwort in einer Zeile und die wenigen wichtigen Punkte, dann die Details, dann das, was unsicher bleibt.
7. Er zeigt das, was eine eigene Form hat, statt es in Absätzen zu vergraben: Behauptungen, gegen die Belege abgewogen, als Faktencheck, Optionen oder Studien nebeneinander, wie etwas verlaufen ist auf einer Zeitleiste, die wichtigsten Zahlen, lesenswerte Fachartikel und wie Personen, Ideen oder Organisationen zusammenhängen als Netzwerkgraph.
8. Ein langer Bericht wird außerdem in den Dateien des Projekts als Dokument abgelegt, das du lesen, kommentieren und exportieren kannst, oder als Markdown-Datei im Ordner der Sitzung, wenn du eine Datei möchtest.

Für eine große Frage, die viele Suchen erfordert, siehe Deep Research in [Deep Research, zweite Meinungen und mehrere Agenten](/guide/research).

### Schriftsteller

„Entwirft, bearbeitet und verfeinert deine Texte“: E-Mails, Briefe, Beiträge, Essays, Berichte, Geschichten und Reden.

- Vor einem langen Text vergewissert er sich über Zielgruppe, Zweck, Ton und Länge. Er fragt kurz nach, wenn eines davon unklar ist und eine Rolle spielt (in einem Formular, wenn es mehrere sind); andernfalls nennt er seine Annahmen in einer Zeile und schreibt.
- Er schreibt klar und konkret: anschauliche Wörter, die Hauptaussage früh, abwechslungsreiche Sätze, keine Füllwörter oder Klischees.
- Er trifft den gewünschten Stil oder deinen eigenen, wenn du frühere Texte von dir teilst.
- Wenn er deinen Text bearbeitet, bewahrt er Sinn und Stimme: Er korrigiert, was falsch ist, strafft, was zu locker ist, und lässt, was funktioniert. Er zeigt die Änderungen, damit du sie nachvollziehen kannst: deinen Text mit jeder Änderung markiert und erklärt, wenn du Feedback möchtest, oder was sich zwischen den Versionen geändert hat bei einer Umschreibung, danach den sauberen Text.
- Kurze Texte übergibt er gebrauchsfertig: eine E-Mail in Versionen zum Umschalten, in deiner Mail-App geöffnet und komplett ausgefüllt; Beiträge, jeweils gegen die Längenbegrenzung ihrer Plattform geprüft; eine Quellenangabe im benötigten Stil.
- Wenn eine Entscheidung wichtig ist (eine Betreffzeile, ein Titel, ein Einstieg, ein Name), bietet er zwei bis vier Optionen mit je einer Anmerkung an, aus denen du wählen kannst.
- Alles, was länger als ein paar Absätze ist, wird als Dokument (in den Dateien des Projekts) abgelegt, wo du es bearbeiten, kommentieren und exportieren kannst, und er sagt es dir; wenn du eine Datei möchtest, erstellt er eine im Ordner der Sitzung (Markdown, sofern du kein anderes Format willst).

### Programmierer

„Entwickelt, repariert und erklärt Software.“ Der Programmierer ist ein Softwareentwickler, der in deinem Projekt arbeitet, und arbeitet daher anders als die übrigen integrierten Agenten in dem Ordner, den du auf der Startseite wählst, nicht in einem neuen Aufgabenordner.

- Er liest den Code rund um eine Änderung, bevor er sie vornimmt, und folgt den Konventionen und Werkzeugen des Projekts.
- Er beschränkt Änderungen auf das, worum du gebeten hast, und erwähnt andere Probleme, die ihm auffallen, statt sie ungefragt zu beheben.
- Nach einer Codeänderung führt er die Tests, den Build oder den Linter des Projekts aus, sofern es sie gibt, und behebt, was fehlschlägt.
- Wenn du neu im Programmieren zu sein scheinst, erklärt er in einfachen Worten, was er getan hat und wie man es ausführt: Befehle, die du ausführen kannst, jeweils mit einem Kopieren-Button und einer Erklärung, was sie tun, und ein Codeausschnitt, den du in einer Spielwiese ausprobieren kannst.
- Wenn er Code erklärt, statt ihn zu ändern, zeigt er das, was eine eigene Form hat, statt einer Textwand: einen Fehler mit seinen wahrscheinlichen Ursachen und Lösungen, einen Testlauf, die Dateien eines Projekts als Baum, einen Endpunkt, Code Schritt für Schritt neben seinen Zeilen durchgegangen, den Ablauf eines Programms Zeile für Zeile mit seinen Variablen, Ansätze zum Abwägen nebeneinander und ein Diagramm für einen Ablauf oder eine Architektur.
- Er schließt mit einer kurzen Zusammenfassung: was sich geändert hat, wie er es geprüft hat und was noch zu tun ist.

### Nachhilfelehrer

„Bringt dir Schritt für Schritt etwas bei und prüft, ob du folgen kannst.“ Das Ziel ist, dass du es verstehst und selbst kannst, nicht nur, dass du eine Antwort bekommst.

- Wenn dein Niveau oder dein Ziel unklar ist, stellt er zuerst eine kurze Frage, mit den wahrscheinlichen Antworten als Buttons zum Anklicken (ganz neu, Grundlagen vorhanden, Prüfungsvorbereitung).
- Er unterrichtet einen Schritt nach dem anderen, in einfachen Worten, mit einem konkreten Beispiel für jede neue Idee, von einfach zu schwieriger.
- Er macht jeden Schritt zu etwas zum Ansehen oder Ausprobieren, nicht nur zum Lesen: ein Diagramm, ein Bild, eine Formelkarte, ein Funktionsgraph mit Schiebereglern, eine Karte, wie Ideen zusammenhängen, eine Erklärung, zwischen deren Tiefen du umschalten kannst, ein Rechenbeispiel, das Schritt für Schritt aufgedeckt wird, Code, den du ausführen und ändern kannst, Code Zeile für Zeile durchgegangen, ein Programm, das Schritt für Schritt abläuft, nachdem du vorhergesagt hast, was es ausgibt, eine kleine Simulation; Mathematik so dargestellt wie in einem Lehrbuch.
- Nach jedem Schritt prüft er mit etwas, das du direkt an Ort und Stelle beantwortest, und wartet, bevor er weitermacht: ein kurzes Quiz, Übungsaufgaben, die du in eigenen Worten oder Zahlen beantwortest (laufend geprüft, mit Hinweisen und der Lösung nach einem Versuch), Lückentexte, Zuordnen oder Ordnen in die richtige Reihenfolge. Er liest die Punktzahl und die Antworten, die du zurückschickst.
- Wenn du antwortest, sagt er, was richtig war, korrigiert freundlich und konkret, was nicht stimmte, und passt sich an: eine andere Erklärung oder ein anderes Beispiel, wenn du nicht weiterkommst, ein schwierigerer Schritt, wenn du voraus bist.
- Bei Hausaufgaben oder Übungen führt er dich mit Hinweisen und Fragen und gibt die vollständige Lösung nur, wenn du danach fragst oder nach dem Versuchen immer noch nicht weiterkommst.
- Bei einer Sprache gibt er dir Wörter zum Hören und Üben, Verbformen, Gespräche und deine eigenen Sätze korrigiert, jeder Fehler markiert und erklärt.
- Er schließt ein Thema mit einer kurzen Zusammenfassung und Karteikarten zum Merken ab und bietet als Buttons zum Antippen an, was du als Nächstes lernen kannst. Für einen längeren Kurs führt er einen Fahrplan der Themen und wie weit du gekommen bist.

### Planer

„Plant Reisen, Veranstaltungen und Projekte“, außerdem Umzüge und Routinen.

- Zuerst klärt er, was den Plan prägt: das Ziel, Termine und Fristen, das Budget, die beteiligten Personen und feste Grenzen. Er fragt nach den wenigen, die fehlen und wichtig sind (in einem Formular, wenn es mehrere sind), und nimmt für den Rest vernünftige Standardwerte an und sagt, was er angenommen hat.
- Er prüft die Fakten, von denen der Plan abhängt (Öffnungszeiten, Reisezeiten, Preise, Verfügbarkeit, Regeln, das Wetter), im Web und sagt, wenn etwas nicht geprüft werden konnte oder sich ändern kann.
- Er macht den Plan konkret: Zeiten, Orte, Kosten und wer was tut, Spielraum für Dinge, die sich verschieben, und was zuerst zu buchen oder zu entscheiden ist.
- Er zeigt den Plan so, dass du ihm auf einen Blick folgen kannst, in den Antwort-UIs für Pläne: eine Reise Tag für Tag mit ihren Orten auf einer Karte, der Tagesablauf, Termine in einem Kalender oder als Countdown, ein Projekt in Phasen oder über Wochen, was zu buchen oder zu packen ist als Checkliste, die Wettervorhersage und die Kosten als Budget mit einer Summe.
- Wo eine Entscheidung wichtig ist, gibt er zwei oder drei Optionen nebeneinander mit ihren Vor- und Nachteilen an (Flüge und Unterkünfte für eine Reise).
- Er legt den Plan in den Dateien des Projekts ab, wo du ihn ändern kannst: ein Dokument und eine Tabelle für Budgets und Zeitpläne mit Summen. Er bietet an, ihn anzupassen, mit den wahrscheinlichen Änderungen als Buttons zum Antippen. Er legt stattdessen Dateien im Ordner der Sitzung ab, wenn du Dateien möchtest.

### Analyst

„Wertet Daten und Tabellen aus, mit Diagrammen“: Tabellen, CSV-Dateien, Exporte und Zahlen.

- Er sieht sich die Daten an, bevor er sie analysiert (Spalten, Umfang, Typen und Lücken), und meldet Probleme wie fehlende Werte, Duplikate oder ungewöhnliche Formate, bevor er Schlüsse zieht.
- Er rechnet mit Code (einem kurzen Python- oder JavaScript-Skript oder einer Formel), nie durch Schätzen nach Augenmaß, und bewahrt die Skripte im Ordner der Sitzung auf, damit sich die Arbeit wiederholen lässt.
- Er beantwortet zuerst die Frage, in einfachen Worten mit den wichtigsten Zahlen, und zeigt dann, wie er darauf gekommen ist. Er nennt Annahmen und Grenzen und behauptet keine Ursachen, die die Daten nicht zeigen können.
- Er zeigt Ergebnisse in den Antwort-UIs für Zahlen: die Kennzahlen, ein Diagramm (das einfachste, das passt: Balken zum Vergleichen, Linien über die Zeit), eine Tabelle, die du sortieren und filtern kannst, wie sich Werte verteilen, Anteile eines Ganzen, wie sich eine Summe verändert hat, Flüsse, Werte über zwei Dimensionen als Heatmap, Zahlen an Orten auf einer Karte und einen Rechner, wenn du andere Werte ausprobieren möchtest. Eine Darstellung, die keine davon zeichnet, kommt in eine Live-Grafik in der Antwort oder, wenn es mehrere sind, auf eine Seite; Achsen und Einheiten sind beschriftet, und alles ist auf einem Smartphone lesbar.
- Er speichert bereinigte Daten und Ergebnisse als Dateien (CSV oder XLSX, wenn du es möchtest), wenn du sie brauchst. Eine Tabelle, die du dir ansiehst und änderst, wird als Tabelle mit ihren Formeln aufbewahrt, und ein Dashboard, zu dem du zurückkehrst, als Seite.

### App builder

„Erstellt deine eigenen Apps: kleine Werkzeuge für eine Aufgabe, mit einem Formular, Schritten und einer Ansicht ihrer Antwort“ (siehe [Apps](/guide/apps)).

- Er denkt mit **Am besten**, dem Modell, das [Einstellungen → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) für das Programm nennt, auf dem er läuft: Wenn du es auf der Startseite wählst, wählst du dieses Modell, und die Sitzungen, die die Seite „Apps“ startet, verwenden es.
- Er klärt, was hineingeht, was herauskommt und wie ein guter Durchlauf aussieht, und liest die ein oder zwei fertigen Apps, die deiner am nächsten kommen, um so zu bauen wie sie.
- Bei einer neuen App ist seine erste Antwort eine Skizze, bei der noch nichts erstellt ist: was die App abfragt, was sie tut, eine ausgedachte Antwort, was ein Durchlauf braucht und kostet, was er angenommen hat, und höchstens drei Fragen, deren Antworten den Entwurf verändern, als Auswahl zum Anklicken. Er baut die App, wenn du auf **Umsetzen** drückst (siehe [Die Skizze](/guide/apps#the-sketch)). Bei einer Änderung an einer App, die du hast, oder wenn du sagst, er solle einfach bauen, baut er sofort.
- Er baut die App mit eigenen Werkzeugen und wählt für jeden Teil den günstigsten Schritt (ein Werkzeug, eine schnelle Modellantwort, eine Regel, Code) und einen Agenten, wo Urteilsvermögen gefragt ist. Für Daten ruft er die kostenlosen Dienste auf, die die fertigen Apps verwenden, oder liest zuerst die Dokumentation eines Dienstes, statt eine Adresse aus dem Gedächtnis zu nehmen.
- Nachdem er die Ansicht der App entworfen oder geändert hat, sieht er sich Bilder davon an (auf einem Computer in Dunkel und in Hell sowie auf einem Smartphone) und behebt, was falsch aussieht.
- Er gibt der App zwei bis vier Beispiele mit Prüfungen, probiert sie aus und behebt, was fehlschlägt, bevor er sie übergibt, und sagt dabei, was ein Durchlauf kostet und wie lange er dauert.
- Wenn du die App selbst änderst, baut er auf deiner Änderung auf.
- Er verwendet den Skill „app-builder“.

Die Seite „Apps“ startet ihre Sitzungen für dich: **Erstellen** unter **Beschreibe eine App und ein Agent erstellt sie**, **Einem Agenten beschreiben**, wenn keine App tut, was du gesucht hast, und **Agenten um einen Entwurf bitten** oder **Agenten um eine Korrektur bitten** unter **Bearbeiten** einer App starten jeweils sofort eine, mit deinen Worten (siehe [Eine eigene App erstellen](/guide/apps#make-your-own-app)).

## Einen Agenten erstellen

### Sag, was er tun soll

1. Klicke auf der [Agenten-Seite](/agents) oben in der Spalte auf **Neu** und dann auf **Neuer Agent** (auf dem Smartphone auf **Neuer Agent** oben auf der Seite). Das Fenster **Neuer Agent** öffnet sich in zwei Schritten, die oben als **1 Beschreiben** und **2 Einrichten** angezeigt werden.
2. Sag unter „Was soll dein Agent tun?“ in eigenen Worten, was er tun soll und, falls er von selbst arbeiten soll, wann: „Schreibe jeden Freitagnachmittag meinen Wochenfortschrittsbericht aus meinen Commits und Notizen und lass mich ihn prüfen, bevor er rausgeht.“ Unter **Oder starte mit einer Idee** setzen **Paper-Zusammenfassung**, **Wochenbericht**, **Änderungsprüfer** und **Übersetzer** einen Satz in das Feld, sobald du darauf klickst, den du anpassen kannst.
3. Klicke auf **Meinen Agenten entwerfen** (oder drücke Strg+Enter, auf dem Mac ⌘+Enter). Das Hilfsmodell (Einstellungen → Modelle → Hilfsmodell) entwirft den Agenten: Name, Symbol, Zeile, Anweisungen, erlaubte Werkzeuge, die Leistungsstufe, mit der er denkt, und einen Zeitplan, wenn du einen gewünscht hast. Das Fenster wechselt zu **Einrichten**.
4. Lies den Entwurf durch und ändere, was du möchtest (siehe [Alle Einstellungen](#all-settings)). Mit **Zurück** gelangst du wieder zu **Beschreiben**: Was du geschrieben hast, bleibt erhalten, und ein erneuter Entwurf ersetzt den bisherigen.
5. Klicke auf **Agent erstellen**. Die App meldet „*Name* ist bereit“ und öffnet die Seite des Agenten; sein Zeitplan, falls er einen hat, ist eine Geplante Aufgabe, die als dieser Agent läuft.

Wenn du das Fenster schließt (✕, Esc oder ein Klick außerhalb), nachdem du etwas eingegeben oder geändert hast, fragt es zuerst **Diesen Agenten verwerfen?**. Der Tab **Agenten** eines Projekts hat **Neuer Agent hier**, wodurch ein Agent entsteht, der in diesem Projekt arbeitet, und, solange es noch keinen gibt, **Einen für dieses Projekt erstellen**, wodurch einer aus dem entsteht, was das Projekt über sich selbst sagt, oder aus der Vorlage für seine Art; ein neues Projekt kann beim Erstellen gleich einen bekommen (siehe [Projekte](/guide/projects)).

### Selbst einrichten

**Selbst einrichten** unter dem Feld überspringt den Entwurf und öffnet **Einrichten**, wobei nur das Symbol ausgefüllt ist (siehe [Alle Einstellungen](#all-settings)). Du kannst bis zu 200 eigene Agenten haben.

### Einen Agenten einen Agenten erstellen lassen

Bitte in einer beliebigen Sitzung in eigenen Worten: „Erstelle mir einen Agenten, der jeden Freitag um 17 Uhr meine ungelesenen Newsletter zusammenfasst.“ Der Agent, mit dem du sprichst, erstellt ihn für dich, egal auf welchem Programm er läuft (Claude Code, Codex, Custom oder ein anderes): Name, Zeile, Anweisungen, erlaubte Werkzeuge, Leistungsstufe und den Rest, dazu seine Zeitpläne, wenn er von selbst arbeiten soll. Zuerst zeigt eine Karte in der Unterhaltung den Agenten und wann seine Zeitpläne laufen, mit **Agent erstellen** und **Nicht**; nichts wird gespeichert, bevor du antwortest (siehe [Die Karte: eine Änderung bestätigen](/guide/ask-agents#the-card-confirming-a-change)).

Auf dieselbe Weise kann ein Agent einen deiner Agenten ändern (es ändert sich nur, was du verlangst, gespeichert als neue Version von **Ein Agent**), ihm einen Zeitplan geben, einen ändern, einen nicht mehr benötigten entfernen oder einen Agenten samt seinen Zeitplänen löschen. Eine Änderung, die Zeitpläne hinzufügt, ändert oder entfernt, und jedes Löschen fragt dich jedes Mal, es sei denn, die Sitzung hat Vollen Zugriff. Einem Agenten **Voller Zugriff** zu geben (er fragt nie) fragt jedes Mal nach.

### Alle Einstellungen

**Einrichten** ist der zweite Schritt von **Neuer Agent** und das, was **Alle Einstellungen** auf der Seite eines Agenten für diesen Agenten öffnet, ohne den Schritt **Beschreiben**. Auf dem Smartphone füllt das Fenster den Bildschirm. Oben stehen das Symbol (klicke darauf, um eines von 30 auszuwählen: ein Teleskop, ein Stift, eine Kochmütze, ein Flugzeug, eine Geldbörse und so weiter) und der Name mit bis zu 60 Zeichen, zum Beispiel „Buchhalter“ oder „Reisebüro“. Nur der Name ist erforderlich.

Auf einem Computer listet eine Spalte links sieben Bereiche auf, jeweils mit der aktuellen Einstellung unter dem Namen, sodass du den ganzen Agenten auf einen Blick siehst; klicke auf einen, um seine Einstellungen daneben zu sehen. Ist ein Bereich länger als das Fenster, zeigt eine Schaltfläche **Weiter unten mehr**, dass es noch mehr gibt. Auf dem Smartphone listet **Einrichten** die Bereiche mit ihrer jeweiligen Einstellung auf; tippe auf einen, um ihn zu öffnen, und **‹ Alle Einstellungen** führt zurück.

- **Über**:
  - **Eine Zeile dazu**: bis zu 160 Zeichen, angezeigt auf seiner Karte und im Menü der Startseite, zum Beispiel „Hält die Haushaltsfinanzen in Ordnung“.
  - **Anweisungen**: wer er ist und wie er arbeitet, bis zu 20.000 Zeichen. Er liest sie zu Beginn jeder Sitzung. Schreibe sie so, wie es die eingebauten tun: „Du bist für diese Sitzung der Buchhalter des Nutzers“, dann ein paar Zeilen dazu, wie er arbeitet („Frage nach den Kontoauszügen, die du brauchst“, „Führe Summen in einer Tabelle im Arbeitsordner“).
- **Wo und wann**:
  - **Arbeitsbereich**: **Überall** oder **Nur in einigen Projekten** mit einem Schalter für jedes Projekt (siehe [Wo ein Agent arbeitet](#where-an-agent-works)).
  - **Ausführungszeitpunkt**: für einen neuen Agenten **Auf Anfrage**, **Zu einer Uhrzeit** (Tage und eine Uhrzeit) oder **Jeden…** (ein Intervall) sowie **Jeder Lauf beginnt mit**, die Nachricht, mit der jeder geplante Lauf beginnt. Bei einem bereits vorhandenen Agenten sind seine Zeitpläne hier aufgelistet; du fügst sie auf seiner Seite unter **Zeitpläne** hinzu und änderst sie dort (siehe [Wann ein Agent arbeitet: Zeitpläne](#when-an-agent-works-schedules)).
  - **Führt eine dauerhafte Unterhaltung mit eigenem Posteingang** (siehe [Ein Agent mit einer eigenen Unterhaltung](#an-agent-with-a-conversation-of-its-own)).
  - **Wo seine Sitzungen beginnen**, wenn auf der Startseite kein Ordner ausgewählt ist:
    - **Ein neuer Aufgabenordner** (Standard): Jede Sitzung bekommt einen eigenen neuen Ordner (siehe [Aufgabenordner](#task-folders-where-a-task-without-a-folder-works)).
    - **Der Ordner auf der Startseite**: Sitzungen arbeiten im dort angezeigten Ordner, so wie es der Programmierer tut. Wähle dies für Agenten, die in einem Projekt arbeiten.
- **Modell**:
  - **Denkt mit**: **Automatisch**, **Schnell**, **Standard**, **Am besten** oder **Max**, jeweils mit einer Zeile dazu, wofür es gedacht ist (siehe [Womit ein Agent denkt: Leistungsstufen](#what-an-agent-thinks-with-tiers)).
  - **Ausführungsumgebung**: das Programm, das er vorschlägt und das mit ihm auf der Startseite ausgewählt wird.
    - **Beliebiger Agent** (Standard) behält das auf der Startseite ausgewählte Programm bei.
    - **Claude Code**, **Codex**, **Custom** („Beliebiges Modell“) oder jeder Agent, den du unter [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents) hinzugefügt hast.
    - Sobald du ein Programm auswählst, erscheint daneben ein Modellmenü mit den Modellen dieses Programms (bei Programmen, die eine Auswahl bieten); bleibt es unverändert, gilt das Standardmodell des Programms. Eine Leistungsstufe weiter oben wählt stattdessen das Modell aus.
  - **Berechtigungsmodus**: wann er dich zuerst fragt.
    - **Wie ausgewählt** (Standard): behält den auf der Startseite ausgewählten Modus bei.
    - **Fragen**: fragt vor dem Ändern von Dateien und dem Ausführen von Befehlen.
    - **Änderungen akzeptieren**: ändert Dateien ohne Rückfrage, fragt vor Befehlen.
    - **Voller Zugriff**: fragt nie.
    - **Plan**: liest und plant nur, bis du genehmigst.

    Claude Code, Codex und Custom haben jeweils einen passenden Modus dazu. Andere Agenten (Gemini CLI, OpenCode…) behalten ihre eigenen.
  - **Subagenten, die er startet**: **Beliebig** oder nie über einer bestimmten Leistungsstufe.
  - **Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln**: eingeschaltet, solange du es nicht ausschaltest.
- **Werkzeuge**: **Erlaubte Werkzeuge** (sieben Schalter, bei einem neuen Agenten alle eingeschaltet, mit **Alle aktivieren**, wenn einige ausgeschaltet sind; siehe unten), **Bevorzugte Skills** (siehe unten) und **Verbundene Apps**, angezeigt, wenn du Konten verbunden hast (siehe unten).
- **Team**: **Andere Agenten dürfen ihm Arbeit übergeben** und **Er darf Arbeit übergeben an** mit einem Schalter für jeden anderen Agenten (siehe [Agenten, die anderen Agenten Arbeit übergeben](#agents-that-hand-work-to-other-agents)).
- **Ergebnisse**: was er zurückgibt: die Felder jedes Ergebnisses und wohin jedes geht (siehe [Was ein Agent zurückgibt](#what-an-agent-hands-back)).
- **Budget**: **Keine Begrenzung** oder **Ein Monatslimit** in Dollar; bei einem vorhandenen Agenten steht dort, was er in diesem Monat ausgegeben hat (siehe [Ein Monatsbudget](#a-monthly-budget)).

**Agent erstellen** erstellt einen neuen Agenten. Bei einem vorhandenen Agenten behält **Speichern** deine Änderungen („*Name* ist gespeichert“), und **Abbrechen** schließt das Fenster ohne Speichern; beim Schließen nach einer Änderung fragt es **Deine Änderungen verwerfen?**.

### Erlaubte Werkzeuge

Jeder Schalter deckt eine Art von Werkzeug ab:

- **Dateien lesen**: Dateien und Ordner öffnen, auflisten und durchsuchen.
- **Dateien erstellen und ändern**: neue Dateien schreiben und bestehende bearbeiten.
- **Befehle ausführen**: Programme und Skripte auf diesem Computer.
- **Web verwenden**: im Web suchen und Webseiten lesen.
- **Nutze einen Browser**: Websites öffnen, klicken und Formulare in einem echten Browser ausfüllen.
- **Nutze den Computer**: den Bildschirm sehen und Maus und Tastatur in jeder App bedienen (die Desktop-Apps, mit eingeschalteter Computernutzung).
- **Andere Werkzeuge**: MCP-Server (Werkzeugserver) und Plugins, die für die Agenten eingerichtet sind.

Was mit den ausgeschalteten passiert, hängt vom Programm ab:

- Bei **Claude Code und Custom** sind diese Werkzeuge ausgeschaltet. Bei ausgeschaltetem **Andere Werkzeuge** bekommt Claude Code nur die eigenen Werkzeuge der App und deine verbundenen Konten, keinen der MCP-Server, die du selbst eingerichtet hast.
- **Codex** wird angewiesen, sie nicht zu verwenden. Bei ausgeschaltetem **Web verwenden** ist auch seine eigene Websuche ausgeschaltet. Bei ausgeschaltetem **Befehle ausführen**, aber eingeschaltetem **Dateien lesen** wird Codex angewiesen, seine Shell nur zum Lesen und Durchsuchen von Dateien zu verwenden, da es Dateien über die Shell liest.
- Bei **Claude Code, Codex und Custom** sind außerdem die Werkzeuge für Browser und Computer ausgeschaltet, wenn **Nutze einen Browser** oder **Nutze den Computer** ausgeschaltet ist.
- **Andere Agenten** werden angewiesen, sie nicht zu verwenden.

Die eigenen Werkzeuge der App (Seiten, Memory und Ähnliches) bleiben eingeschaltet, außer denen, die unter einen von dir ausgeschalteten Schalter fallen: Bei ausgeschaltetem **Web verwenden** entfallen auch die Websuche und das Seitenlesen der App; bei ausgeschaltetem **Nutze einen Browser** entfällt ihr Browser; bei ausgeschaltetem **Nutze den Computer** entfallen ihre Werkzeuge für Bildschirm, Maus und Tastatur; bei ausgeschaltetem **Dateien lesen** entfällt ihr Dokumentleser. Verbundene Konten sind keine „anderen Werkzeuge“: Darüber entscheiden die **Verbundene Apps** weiter unten. Wenn eine Aufgabe etwas braucht, das der Agent nicht verwenden darf, wird er angewiesen, das zu sagen, statt es zu umgehen.

### Bevorzugte Skills

Gib unter **Werkzeuge** den Namen eines Skills ein und drücke die Eingabetaste (oder ein Komma), um ihn hinzuzufügen. Das Feld schlägt die eigenen Skills von Claude Code und Codex vor, wie sie [Einstellungen → Agenten → Skills](/settings?s=skills) für den in Dateien geöffneten Ordner auflistet; du kannst auch den Namen eines Skills aus der Skill-Bibliothek eingeben, zum Beispiel research. Klicke auf den Papierkorb neben einem Namen, um ihn zu entfernen. Bis zu 30. Wenn einer dieser Skills zur Aufgabe passt, lädt der Agent ihn vor dem Start und befolgt ihn. Unter [Skills](/guide/skills) findest du die Skills, die mit der App mitkommen, und wie du weitere hinzufügst.

### Verbindungen

**Verbundene Apps** unter **Werkzeuge** wird nur angezeigt, wenn du Konten verbunden hast (eingerichtet unter [Apps → Verbundene Apps](/apps/connected)). Jedes hat einen Schalter: Eingeschaltet bedeutet, dass es in den Sitzungen dieses Agenten eingeschaltet ist. Eines, das bereits für jede Sitzung eingeschaltet ist, zeigt stattdessen „Für jede Sitzung eingeschaltet“. Wenn ein Konto, das der Agent nennt, nicht mehr verbunden ist, wird es mit „Nicht verbunden“ unter seinem Namen und einer Schaltfläche zum Entfernen angezeigt. Siehe [Verbundene Apps, Keys und Werkzeuge](/guide/connections).

## Einen Agenten ändern

Auf der Seite eines Agenten lesen sich seine Einstellungen wie Sätze: was er tut, „Er arbeitet *überall*, *jeden Werktag um 09:00* und denkt mit *Schnell*. Er darf *Dateien lesen und das Web verwenden* und bittet *keine anderen Agenten* um Hilfe. Er gibt *seine Antwort* zurück. Er gibt höchstens *3 $* im Monat aus.“ Jeder unterstrichene Teil öffnet, was ihn ändert, und die Änderung wird sofort gespeichert:

- **Arbeitsbereich**: **Überall** oder ein Schalter für jedes Projekt.
- **Ausführungszeitpunkt**: seine Zeitpläne, die jeweils ihren Editor öffnen, **Zeitplan hinzufügen** und **Führt eine dauerhafte Unterhaltung mit eigenem Posteingang**.
- **Verwendete Modellstufe**: Automatisch oder eine Leistungsstufe, **Höchste Modellstufe für die von ihm gestarteten Subagenten** und **Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln**.
- **Erlaubte Werkzeuge**: die sieben Schalter.
- **Wen es um Hilfe bittet**: ein Schalter für jeden anderen Agenten und **Andere Agenten dürfen ihm Arbeit übergeben**.
- **Ergebnisübergabe**: seine Felder und wohin jedes Ergebnis geht.
- **Monatsbudget**: Dollar pro Monat oder keines.

**Alle Einstellungen** enthält den Rest (siehe [Alle Einstellungen](#all-settings)). Jede Änderung wird als Version gespeichert, sodass du zurückgehen kannst (siehe [Versionen: zu einer früheren zurückgehen](#versions-go-back-to-an-earlier-one)). Sitzungen, die du ab dann startest, verwenden die neue Version, ebenso die bereits laufenden Sitzungen mit ihm, ab deiner nächsten Nachricht: Custom liest sie vor jedem Zug, und Claude Code und Codex starten neu, sobald sie frei sind (die Unterhaltung geht weiter).

## Versionen: zu einer früheren zurückgehen

Jedes Speichern, das verändert, was einer deiner Agenten ist, behält eine Version: eine Änderung auf seiner Seite, in **Alle Einstellungen**, über die Befehlszeile, durch einen Agenten, den du darum gebeten hast (über die API der App), sowie der Entwurf oder die Datei, die ihn erzeugt hat. Öffne seine Seite, dann **Mehr** (⋯) → **Versionen**:

- Die Liste zeigt jede Version, die neueste zuerst: **v1**, **v2**…, was sich geändert hat, in ein paar Sätzen („Er denkt jetzt mit Am besten (vorher Schnell). Sein Monatsbudget beträgt jetzt 5 $ (vorher 3 $).“) oder was der Agent, der geändert hat, als seine Tat angegeben hat, wer sie gespeichert hat (**Du**, **Ein Agent**, **Entworfen**, **Installiert**, **Importiert**) und wann; **Jetzt** markiert die aktuelle. Eine Version, mit der seine Beispiele ausprobiert wurden, gibt an, wie viele bestanden haben („Beispiele: 2 von 3 bestanden“), sodass du sehen kannst, ob eine Änderung ihn verbessert hat.
- Klicke auf eine, um sie mit der davor zu vergleichen, oder wähle zwei beliebige unter **Vergleichen** … **mit** …: was sich zwischen ihnen geändert hat, in Sätzen, und seine **Anweisungen** nebeneinander, entfernte Zeilen in Rot und hinzugefügte Zeilen in Grün.
- **Wiederherstellen** macht die ausgewählte Version wieder zur aktuellen. Sie wird als neue Version gespeichert, die „Version 3 wiederhergestellt.“ besagt, sodass die bisherige in der Liste bleibt und du zu ihr zurückgehen kannst. Agenten, an die er Arbeit übergeben hat, und Projekte, die inzwischen weg sind, werden ausgelassen.

Ein Agent behält seine letzten 50 Versionen; sie verschwinden, wenn du ihn löschst. Seine Beispiele sind nicht Teil einer Version: Wenn du eine alte Version wiederherstellst, bleiben die Beispiele, die er jetzt hat, erhalten. Ein Agent, der erstellt wurde, bevor Versionen gespeichert wurden, bekommt bei seiner ersten Änderung den bisherigen Stand als erste Version („Bevor Versionen gespeichert wurden“).

## Beispiele, die prüfen

Mit Beispielen kannst du prüfen, ob einer deiner Agenten nach einer Änderung noch seine Aufgabe erfüllt, so wie bei den Beispielen einer App. Jedes Beispiel besteht aus einer Nachricht für den Testlauf und dem, was seine Antwort leisten muss. Auf der Seite des Agenten, unter **Beispiele**:

1. **Beispiel hinzufügen**: Gib dem Beispiel auf Wunsch einen Namen, schreibe die **Nachricht für den Testlauf** so, wie du sie dem Agenten schreiben würdest, und füge für alles, was eine gute Antwort leistet, eine Prüfung hinzu. Eine Prüfung ist ein einfacher Satz, etwa „Sie nennt beide Pull-Requests“ oder „Sie sagt klar, wenn sie nichts Neues gefunden hat“, an dem das Hilfsmodell die Antwort misst; oder eine Regel dafür, was der Agent geliefert hat, wie bei der Prüfung einer App: `{{reply}} contains Lisbon` oder, bei einem Agenten, der Ergebnisse zurückgibt, `{{result.count}} > 0` für eines seiner Felder. **Beispiel speichern**. Ein Agent kann bis zu 10 Beispiele mit jeweils bis zu 8 Prüfungen haben.
2. **Beispiele testen** (oder der Kolben-Button neben einem Beispiel, nur für dieses) sagt zuerst, was passieren wird und was es kostet: wie viele Sitzungen als der Agent und auf welcher Leistungsstufe gestartet werden, ungefähr welche Kosten dafür anfallen (nach den Kosten seiner letzten Tests oder nach den Kosten seiner Sitzungen in diesem Monat; vor dem ersten Test gibt es noch keine Grundlage) und was von seinem Monatsbudget übrig ist, auf das die Tests angerechnet werden. Klicke auf **Ausprobieren**.
3. Jedes Beispiel läuft in einer eigenen Sitzung, die als der Agent auf seiner Leistungsstufe gestartet wird, in einem eigenen leeren Ordner (er wird entfernt, sobald das Ergebnis gespeichert ist; die Unterhaltung bleibt erhalten) und getrennt von deiner Sitzungsliste. Es wird nichts versendet: Was über deine verbundenen Apps gesendet würde, wird als das festgehalten, was gesendet worden wäre, und was der Agent zurückgibt, geht nirgendwohin außer in den Test. Wenn die Sitzung endet, werden die Prüfungen ausgewertet. Ein Agent mit Feldern zum Zurückgeben muss außerdem ein Ergebnis zurückgeben.

Jedes Beispiel zeigt dann, wie sein letzter Test verlaufen ist: **Bestanden**, wie viele Prüfungen fehlgeschlagen sind, **Nicht abgeschlossen** oder **Wartet auf dich** (seine Sitzung fragt dich etwas: öffne sie), mit dem Zeitpunkt und den Kosten. Klicke auf ein Beispiel, um seine Nachricht zu sehen, außerdem jede Prüfung mit dem, was festgestellt wurde (✓ oder ✗), was es zurückgegeben hat, seine Antwort und **Sitzung öffnen**. Wenn du den Agenten änderst, nachdem seine Beispiele zuletzt getestet wurden, weist die Seite mit **Erneut testen** darauf hin. Beispiele laufen nie von selbst.

## Wo ein Agent arbeitet

Ein Agent arbeitet **Überall**, solange du keine Projekte für ihn auswählst. Ein Agent, der in einigen Projekten arbeitet:

- wird nur dort angeboten: Das Agentenmenü der Startseite listet ihn auf, wenn eines seiner Projekte ausgewählt ist, und andere Agenten können ihm nur in Sitzungen seiner Projekte Arbeit übergeben;
- arbeitet im Ordner des Projekts, wenn er in einem Projekt arbeitet, mit dem Wissen, dem Memory, den Richtlinien und den Skills des Projekts;
- erscheint im Tab **Agenten** jedes seiner Projekte (siehe [Projekte](/guide/projects)).

Wenn du auf der Startseite ein Projekt auswählst, in dem der gewählte Agent nicht arbeitet, wählt die Startseite stattdessen den eigenen Agenten des Projekts, sonst Allgemein.

## Wann ein Agent arbeitet: Zeitpläne

Ein Agent arbeitet, wenn du eine Sitzung als er startest, wenn ein anderer Agent ihm Arbeit übergibt und nach seinen Zeitplänen. Ein Zeitplan ist eine geplante Aufgabe, die als der Agent läuft: zu einer bestimmten Zeit, in regelmäßigen Abständen, einmalig, wenn sich eine Seite oder ein Feed ändert oder wenn ein anderer Dienst seinen Webhook aufruft (siehe [Geplante Aufgaben](/guide/tasks)).

- Auf der Seite des Agenten öffnet **Zeitplan hinzufügen** den Aufgaben-Editor mit dem ausgewählten Agenten und einer eingetragenen Zeit: Gib einen Namen und die Nachricht an, mit der jeder Lauf beginnt, und speichere.
- Jeder Zeitplan in der Liste hat einen Schalter, der ihn pausiert oder einschaltet, und einen Mülleimer, der ihn nach der Frage „*Name* löschen?“ löscht. Klicke auf seinen Namen, um ihn zu ändern: Das Formular hat neben **Testlauf** auch **Löschen**. Das gilt auch für die integrierten Agenten: Ein Zeitplan beim Forscher kann wie jeder andere pausiert oder gelöscht werden. Derselbe Schalter und **Löschen** finden sich in den [Zeitplänen](/agents/schedules), im Menü des Kalenders und in der Liste.
- Ein Zeitplan, der mit einem neuen Agenten entworfen wird, wird mit ihm erstellt.
- Ein Zeitplan, den ein Agent für einen deiner Agenten anlegt, startet auf **Automatisch**, wo das angeboten wird (siehe [Geplante Aufgaben](/guide/tasks#model-effort-permissions-and-other-options)), es sei denn, dieser Agent nennt ein eigenes Modell. Ein Agent, der mit einer Leistungsstufe denkt, läuft weiterhin auf seiner Stufe.
- Ein Agent kann in jeder Sitzung die Zeitpläne eines Agenten für dich hinzufügen, ändern oder entfernen (siehe [Einen Agenten bitten, einen zu erstellen](#ask-an-agent-to-make-one)).
- Ein Zeitplan, der nicht mehr gebraucht wird, verschwindet von selbst: ein einmaliger Zeitplan nach einem erfolgreichen Lauf und ein Zeitplan, dessen Lauf feststellt, dass seine Aufgabe erledigt ist (worauf er gewartet oder was er beobachtet hat, ist eingetreten, wie es seine Nachricht für diesen Fall vorgegeben hat), was die Benachrichtigung zum Lauf mitteilt. Die Zeitpläne eines Agenten werden mit ihm gelöscht.

Jeder Zeitplan steht auch in [Einstellungen → Agenten → Geplante Aufgaben](/settings?s=tasks), zusammen mit allen anderen; die Option **Agent** einer Aufgabe ist der Agent, als der ihre Läufe arbeiten. Der Bereich [**Zeitpläne**](/agents/schedules) in der Spalte der Agenten-Seite (auf dem Smartphone ein Tab oben) zeigt sie zusammen mit jeder anderen Aufgabe in einer Wochenansicht: was lief, wie es verlief und was als Nächstes läuft, in der Liste jeweils mit **Agent ·** und dem Namen des Agenten; sein Stift öffnet die Seite des Agenten.

## Womit ein Agent denkt: Leistungsstufen

Leistungsstufen wählen ein Modell nach der Aufgabe statt nach seinem Namen:

- **Schnell**: die günstigste, für kleine, sehr klare Aufgaben, deren Ergebnis sich prüfen lässt, etwa eine gezielte Änderung, das Herausziehen von Fakten, Sortieren, Formatieren und kurze Zusammenfassungen.
- **Standard**: klare Aufgaben mittlerer Größe: eine genau beschriebene Änderung, Tests, Recherche zu einer festen Frage, ein Entwurf nach einer Gliederung.
- **Am besten**: der Haupt-Agent einer Sitzung. Er findet heraus, was verlangt wird, plant, leitet Subagenten an und prüft ihre Arbeit.
- **Max**: die stärkste, für die schwersten Probleme: hartnäckige Fehler, Beweise, Entwürfe mit vielen Einschränkungen.

Ein Agent, der auf eine Leistungsstufe eingestellt ist, startet mit dem Modell dieser Stufe für das Programm, auf dem er läuft, es sei denn, für die Sitzung wurde ein Modell gewählt; ist er auf **Automatisch** eingestellt (die Voreinstellung), nutzt er das Modell, das dort gewählt ist, wo er gestartet wird: auf der Startseite, in der geplanten Aufgabe (die selbst auf **Automatisch** stehen kann) oder bei dem Agenten, der ihm Arbeit übergibt. Auf der Startseite kann diese Wahl selbst **Automatisch** sein: Am besten, mit Wechsel auf Max, wenn sich das Problem als zu schwer erweist (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](/guide/agents-models#tiers-a-model-for-each-kind-of-job)).

[Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) legt in einer Tabelle mit einer Spalte für jedes Programm fest, was jede Stufe bedeutet: für **Claude Code** ein Modell (zu Beginn Haiku, Sonnet, Opus und das neueste Fable) und einen Aufwand; für **Codex** ein Modell und einen Aufwand (zu Beginn Luna, Terra, Sol und Astra; in einem Tarif ohne eines davon das nächstliegende, das er anbietet, mit mehr Aufwand für die höhere Stufe, wenn sich zwei ein Modell teilen); für **Custom** eines deiner Custom-Modelle: Eine Stufe, die du unverändert lässt, nimmt das neueste Modell ihrer Art unter den Modellen von Custom (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](/guide/agents-models#tiers-a-model-for-each-kind-of-job)); gibt es nur kleine oder lokale Modelle, bleibt sie leer, wodurch das in der Sitzung gewählte Modell erhalten bleibt. Eine Stufe, die du unverändert lässt, folgt dem neuesten Modell ihrer Art im jeweiligen Programm. **Zurück zu den Standardeinstellungen** stellt sie wieder her.

**Höchste Modellstufe für die von ihm gestarteten Subagenten** begrenzt die Leistungsstufen der Hydor-Subagenten, die ein Agent startet: Wird eine höhere verlangt, bekommt ein Subagent diese. Ein Subagent denkt außerdem nie mit einer höheren Stufe als der, mit der sein Leiter denkt. Ein ausdrücklich genanntes Modell wird wie genannt verwendet.

**Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln** (an, solange du es nicht ausschaltest): Ein Hydor-Subagent, den der Agent auf einer Leistungsstufe startet und dessen Antwort eine kurze Prüfung nicht besteht (das Hilfsmodell liest seinen Auftrag und seine Antwort) oder der mit einem Fehler stoppt, läuft noch einmal eine Stufe höher, höchstens bis Am besten und nie über der höchsten Stufe, die der Agent erlaubt. Geprüft wird nur seine Antwort auf den Auftrag: Eine spätere Antwort auf eine Nachricht seines Leiters oder von dir schickt nie die ganze Aufgabe noch einmal los. Der Leiter erfährt, dass und warum das geschehen ist, und dem neuen Subagenten wird gesagt, warum der erste nicht genügte. Ein geplanter Lauf des Agenten, der auf seiner Stufe scheitert, läuft ebenfalls noch einmal eine Stufe höher, bis Am besten. Ein Leiter kann einen Subagenten auch selbst höher stufen, wenn er das Ergebnis nicht gut genug findet.

## Agenten, die anderen Agenten Arbeit übergeben

Ein Agent kann einen Teil seiner Arbeit an eine neue Sitzung übergeben, die neben ihm daran arbeitet: einen Hydor-Subagenten (siehe [Tiefe Recherche, zweite Meinungen und mehrere Agenten](/guide/research)). Er kann Folgendes starten:

- **einen einfachen Subagenten** mit einer Leistungsstufe für seinen Teil: Schnell für eine kleine, sehr klare Aufgabe, Standard für eine klare Aufgabe mittlerer Größe (das bekommt ein Subagent, wenn keine Stufe verlangt wird), Am besten für einen schweren Teil, der für sich steht;
- **einen deiner Agenten** mit Namen: Er arbeitet mit seinen eigenen Anweisungen, Werkzeugen, Verbindungen, seinem Modus und seiner Leistungsstufe, und seine Antwort geht an den Agenten zurück, der ihn gefragt hat.

Wer wem Arbeit übergeben darf:

- Eine Sitzung, die als integrierter Agent (oder keiner) arbeitet, darf jedem deiner Agenten Arbeit übergeben, der dort arbeitet.
- Ein Agent von dir darf nur den Agenten Arbeit übergeben, die in seinem **Team** aufgeführt sind.
- Ein Agent, bei dem **Andere Agenten dürfen ihm Arbeit übergeben** ausgeschaltet ist, nimmt von keinem Arbeit an.
- Ein genannter Agent arbeitet nur in seinen eigenen Projekten und nie mit einem freieren Berechtigungsmodus als die Sitzung, die ihn angefragt hat.

In der Unterhaltung erscheinen die Hydor-Subagenten, die ein Zug gestartet hat, gemeinsam als eine Karte unter diesem Zug, mit einer Zeile für jeden: mit seinem Titel, dem Agenten, als der er arbeitet (oder „Hydor-Subagent“), seiner Leistungsstufe, seinem Programm und Modell, seinem Stand und seinen Kosten sowie, wenn er höher gestuft wurde, von welcher Stufe aus und warum (zeige mit dem Mauszeiger darauf); klicke auf eine Zeile, um seine Unterhaltung zu öffnen. Siehe [Subagenten](/guide/sessions#subagents). Der Tab **Agenten** eines Projekts zeigt, welche seiner Agenten welchen Arbeit übergeben.

Ein Agent mit einer eigenen Unterhaltung nimmt die Arbeit stattdessen in seinem Posteingang an statt in einer neuen Sitzung, und seine Antwort kommt, wenn er dazu kommt (siehe [Ein Agent mit einer eigenen Unterhaltung](#an-agent-with-a-conversation-of-its-own)).

## Ein Monatsbudget

Das Monatslimit eines Agenten (**Budget** in **Alle Einstellungen** oder sein Satz auf seiner Seite) begrenzt, was seine Sitzungen in einem Monat ausgeben (ab dem Ersten des Monats, in der Zeit dieses Computers):

- Jede als er gestartete Sitzung bekommt ein Ausgabenlimit in Höhe dessen, was vom Budget übrig ist (das niedrigere, wenn die Sitzung ein eigenes Limit hat).
- Was seine einfachen Subagenten ausgeben, wird darauf angerechnet; die Arbeit eines genannten Agenten zählt zum eigenen Budget dieses Agenten.
- Sobald das Budget aufgebraucht ist, startet bis zum nächsten Monat keine Sitzung mehr als er: Ein geplanter Lauf sagt, warum er nicht starten konnte, und seine Karte zeigt **Budget aufgebraucht**.

Wie viel jede Sitzung ausgibt, wird wie unter [Nutzung und Kosten](/guide/usage) berechnet. Lass es auf **Keine Begrenzung** stehen, wenn es keine geben soll.

## Was ein Agent zurückgibt

Ohne weitere Einstellungen gibt ein Agent seine Antwort in der Unterhaltung zurück. Lege unter **Ergebnisse** (in **Alle Einstellungen** oder über seinen Satz „Er gibt *seine Antwort* zurück“) Felder und Ziele fest, dann gibt er am Ende jeder Aufgabe ein Ergebnis mit diesen Feldern zurück, das geprüft wird, bevor es irgendwohin geht:

- **Felder jedes Ergebnisses**: jeweils ein Name und eine Art (Text, langer Text, Zahl, Ja oder Nein, Datum, Link, Liste oder Tabelle mit ihren Spalten) sowie die Angabe, ob das Feld erforderlich ist. Der Agent füllt sie mit seinem Tool hand_back aus; ein Ergebnis, das nicht passt, geht mit dem Hinweis, was zu korrigieren ist, an ihn zurück.
- **Wohin jedes Ergebnis geht**, zusätzlich zur Unterhaltung:
  - **Eine behaltene Seite**: **Dieselbe Seite, aktualisiert** (die Voreinstellung für neue Agenten): Beim ersten Lauf entsteht eine Seite mit dem Namen des Agenten, in seinem Projekt, wenn er in einem arbeitet. Jeder weitere Lauf legt eine neue Version dieser Seite an, sodass du immer die neueste öffnest und die früheren in den Versionen liegen. Eine Seite, die du umbenennst, behält ihren Namen. Wähle stattdessen **Bei jedem Lauf eine neue Seite**, wenn jedes Mal eine eigene Seite entstehen soll, benannt nach dem Agenten und dem Tag (Agenten, die vor dieser Auswahl erstellt wurden, verfahren weiterhin so).
  - **Eine Zeile in einer Tabelle**: Jeder Lauf fügt der gleichen Tabelle eine Zeile hinzu: eine Spalte **Datum** für den Zeitpunkt des Laufs, dann für jedes Feld eine Spalte, in der Reihenfolge der Felder. Zahlen werden als Zahlen eingetragen, Daten als Daten und Links als Links, sodass Summen, Formeln und Diagramme damit funktionieren; eine Liste oder eine Tabelle landet in einer Zelle als lesbarer Text („Milch; Eier“). Lässt du die Tabelle auf **Eine neue**, legt der erste Lauf eine mit dem Namen des Agenten an; oder wähle eine deiner Tabellen und das Tabellenblatt, in das die Zeilen kommen (ein fehlendes Blatt wird hinzugefügt). Siehe [Eine Zeile in einer Tabelle](#a-row-in-a-spreadsheet).
  - **Eine E-Mail**: das Ergebnis als E-Mail an die Personen, die du angibst (eine oder mehrere Adressen), mit einem Betreff (`{date}`, `{time}` und `{agent}` werden ersetzt; bleibt er leer, stehen dort der Name des Agenten und der Tag), von einem deiner verbundenen E-Mail-Konten (**Von**; das erste, wenn du keines auswählst; siehe [Verbundene Apps, Keys und Tools](/guide/connections#connect-your-email)). Sie ist in jedem Mailprogramm gut lesbar, jedes Feld unter seinem Namen, Tabellen als Tabellen. Da du die Empfänger hier selbst festgelegt hast, geht sie hinaus, sobald jedes Ergebnis fertig ist, ohne im Postausgang zu warten.
  - **Eine Benachrichtigung** mit der ersten Zeile des Ergebnisses;
  - **Eine Datei im Arbeitsordner des Agenten**, etwa `reports/{date}.md`: `{date}`, `{time}` und `{agent}` werden ersetzt, ein Name mit der Endung `.json` bekommt die Felder als JSON, jeder andere Markdown, und ein Pfad führt nie aus dem Ordner hinaus;
  - **Ein Webhook**: das Ergebnis als JSON in einem POST an eine https-Adresse, signiert mit einem Key aus dem Tresor, wenn du einen angibst, und nur an die Hosts, für die dieser Key erlaubt ist (siehe [Verbundene Apps, Keys und Tools](/guide/connections)).

Was du in diese Felder eingibst, gilt, sobald du das Feld verlässt oder die Eingabetaste drückst. In den Einstellungen siehst du die Seite und die Tabelle, die der erste Lauf angelegt hat, mit einem Link zum Öffnen.

### Eine Zeile in einer Tabelle

Die Spalten werden anhand ihrer Überschriften in der ersten Zeile der Tabelle gefunden, sodass die Tabelle weiterhin dir gehört und du sie nach Belieben gestalten kannst: Spalten verschieben, anders formatieren (eine Spalte, die du als Euro formatierst, bleibt in Euro) und eigene Spalten daneben anlegen. Eine Formel in einer eigenen Spalte (etwa eine laufende Summe) wird in jede neue Zeile übernommen, wie in der Tabelle einer Tabellenkalkulation, und ein Diagramm, das die bisherigen Zeilen liest, bezieht auch die neue ein. Summen unter der Tabelle stehen neuen Zeilen im Weg: Lege sie in eine eigene Spalte oder auf ein anderes Tabellenblatt, über ganze Spalten (`=SUM(B:B)`). Wenn du dem Agenten später ein Feld hinzufügst, bekommt es am Ende eine neue Spalte, und die alten bleiben, wo sie sind; eine umbenannte Überschrift passt nicht mehr zu ihrem Feld, das dann eine neue Spalte erhält (gib dem Feld denselben Namen, damit beide zusammenbleiben). Die Zeile jedes Laufs ist eine neue Version der Tabelle, wie jede Änderung, sodass ihre Formeln, Diagramme und Kommentare unverändert bleiben.

### Der Verlauf seiner Ergebnisse

Die Seite des Agenten zeigt **Zurückgegebenes Ergebnis** als Tabelle: eine Zeile für jedes Ergebnis, das neueste zuerst, mit dem Zeitpunkt des Eingangs, einer Spalte für jedes Feld und dem Ziel (**Übermittelt an**: eine Markierung für jedes Ziel, rot, wo es nicht ankommen konnte; fahre mit der Maus darüber, um zu sehen, was geschehen ist, und klicke auf eine behaltene Seite, um sie zu öffnen). Klicke auf eine Zeile, um das ganze Ergebnis zu sehen, jedes Feld vollständig, mit **Sitzung öffnen**. Die Tabelle lässt sich scrollen, und **Ältere anzeigen** lädt frühere Ergebnisse. Ein Agent behält seine Ergebnisse ein Jahr lang, bis zu 500 davon (ein täglicher Agent behält ein ganzes Jahr, einer, der stündlich läuft, etwa drei Wochen); ein Feld, das zu lang ist, um dort gespeichert zu werden, weist darauf hin und steht vollständig an den Zielen, an die es ging. Die Seite und die Tabelle, die er füllt, erscheinen als Links über der Tabelle.

## Ein Agent mit eigener Unterhaltung

Die meisten Agenten starten jedes Mal eine neue Sitzung. Schalte **Führt eine dauerhafte Unterhaltung mit eigenem Posteingang** ein (in **Alle Einstellungen** unter **Wo und wann** oder im „Wann“-Teil seines Satzes), dann führt der Agent stattdessen eine eigene Unterhaltung, die beim ersten Bedarf angelegt wird, im Ordner seines Projekts, wenn er in einem Projekt arbeitet:

- Nachrichten an ihn warten in seinem **Posteingang** und gehen nacheinander in seine Unterhaltung, jede erst, wenn die vorherige ihre Antwort hat: was du von seiner Seite sendest und was andere Agenten ihm übergeben.
- Seine geplanten Läufe schreiben in dieselbe Unterhaltung und warten, bis ein laufender Durchgang beendet ist; jeder erscheint im Verlauf seines Zeitplans, wie jeder Lauf.
- Jede Antwort geht an den zurück, der sie ausgelöst hat: Ein anderer Agent erhält sie als Nachricht, und du bekommst für deine eine Benachrichtigung.
- Er erinnert sich an das Vorherige, wie in jeder Unterhaltung.
- Sein monatliches Budget wird geprüft, sobald eine Nachricht eingeht.

Auf seiner Seite listet der **Posteingang** die Nachrichten auf, jeweils mit ihrem Stand (**Wartet auf die Ausführung**, **Wird bearbeitet**, **Beantwortet**, **Keine Antwort**) und ihrer Antwort, mit einem Feld, um ihm eine zu senden, sowie **Seine Unterhaltung**, die sie öffnet.

## Eine Sitzung als Agent starten

1. Öffne die [Startseite](/). Unter dem Nachrichtenfeld zeigt eine Zeile, wer die Arbeit erledigt: das Programm, das Modell, der Ordner und der Chip **Agent**, der den aktuell gewählten Agenten nennt.
2. Klicke auf **Agent**. Unter **Starten als** stehen zuerst die integrierten Agenten, dann deine eigenen unter **Eigene**: die, die überall funktionieren, und die, die im gewählten Projekt funktionieren.
   - Auf einem Computer stehen die Namen in einem Raster, zwei pro Zeile. Fahre mit der Maus über einen, um unter dem Raster seine Zeile zu sehen: seine Beschreibung und, wenn er ein Programm vorschlägt, „Nutzt“, gefolgt von diesem Programm und seinem Modell.
   - Auf einem Smartphone öffnet sich das Menü als Sheet vom unteren Bildschirmrand und listet jeden Agenten mit seiner Zeile auf.
3. Wähle einen aus. Gib dann deine Aufgabe ein und drücke die Eingabetaste oder **Starten**.

**Agenten erstellen oder ändern** am Ende des Menüs öffnet die [Agenten-Seite](/agents). **Sitzung starten** auf der Seite eines Agenten öffnet die Startseite mit diesem Agenten als Auswahl.

Was die Wahl eines Agenten auf der Startseite bewirkt:

- **Programm, Modell und Berechtigungen**: Schlägt der Agent ein Programm vor, wechselt die Startseite zu diesem, mit dem Modell seiner Leistungsstufe, wenn er mit einer denkt, sonst mit dem Modell des Agenten, wenn er eines nennt. Hat er einen Berechtigungsmodus, wechseln die **Berechtigungen** der Startseite (unter **Optionen**) zum passenden Modus dieses Programms. Du kannst jedes davon vor dem Start noch ändern.
- **Verbindungen**: Die verbundenen Konten, die der Agent einschaltet, sind für die neue Sitzung eingeschaltet.
- **Ordner**: Wenn du nicht selbst einen Ordner gewählt hast, entscheidet der Agent. Die meisten Agenten starten in **Neuer Aufgabenordner**; Programmierer und Agenten, die auf „Der Ordner auf der Startseite“ eingestellt sind, nutzen den angezeigten Ordner. In einem Projekt führt dich die Wahl eines Agenten nie aus dem Projekt heraus. Wenn der Agent den Ordner ändert, zeigt das Feld die für diesen Ort gemerkten Auswahlen, mit dem Agenten, den du gewählt hast.

Die Startseite merkt sich den Agenten für jeden Ort (jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**), auf jedem Gerät, das du nutzt, zusammen mit den übrigen Auswahlen dieses Ortes. Ein Ort, an dem du noch keinen gewählt hast, öffnet sich mit dem eigenen Agenten des Projekts, wenn das Projekt einen hat, sonst mit Allgemein. Ein Agent, der nicht mehr existiert oder der im gewählten Projekt nicht funktioniert, weicht ebenfalls diesem Standard.

Wenn du im Ordnermenü ein Projekt wählst, öffnet sich das Feld mit den Auswahlen dieses Projekts; in einem Projekt, in dem du noch nichts gewählt hast, gehört dazu der Agent, mit dem das Projekt seine Sitzungen startet, wenn es einen hat (siehe [Projekte](/guide/projects)).

## Den Agenten in einer Sitzung wechseln

Das Nachrichtenfeld einer Sitzung zeigt den Agenten, als der sie arbeitet, und du kannst jederzeit zu einem anderen wechseln: etwa von **Forscher** zu **Schriftsteller**, sobald die Fakten beisammen sind.

1. Er steht in der ersten Zeile des Chips unter dem Nachrichtenfeld, der **Optionen** öffnet, und dieser Chip nennt ihn zuerst, etwa „Forscher · Opus 5.5“.
2. Klicke darauf. Wähle unter **Wechseln zu** einen anderen: dasselbe Menü wie auf der Startseite, auf einem Computer ein Raster und auf einem Smartphone ein Sheet vom unteren Rand.
3. Die App meldet „Der Agent arbeitet ab deiner nächsten Nachricht als *Name*“.

Ab deiner nächsten Nachricht arbeitet die Sitzung als der neue Agent, und die Unterhaltung geht weiter:

- Das Programm erfährt vom Wechsel zusammen mit deiner Nachricht (die Unterhaltung zeigt das nicht).
- **Claude Code und Codex** lesen ihre Anweisungen beim Start. Ist die Sitzung frei, startet ihr Programm daher vor deiner Nachricht neu, mit den Anweisungen und Grenzen des neuen Agenten; diese Nachricht dauert etwas länger. Mitten in einem Durchgang oder solange es auf ein Ziel hinarbeitet oder Arbeit im Hintergrund läuft, erhält es die neuen Anweisungen stattdessen mit deiner Nachricht und startet bei einer späteren Nachricht neu, sobald es frei ist.
- **Custom** liest seine Anweisungen vor jedem Durchgang. Andere Agenten (Gemini CLI, OpenCode …) erhalten die Anweisungen des neuen Agenten mit deiner Nachricht.
- Die verbundenen Konten, die der neue Agent einschaltet, sind in der Sitzung eingeschaltet, anstelle derer des vorherigen; was du für die Sitzung selbst ein- oder ausgeschaltet hast, bleibt. Hat er einen Berechtigungsmodus, wechselt die Sitzung zum passenden Modus, und zu seinem Modell, wenn er das eigene Programm der Sitzung vorschlägt. Das Programm selbst bleibt gleich: Um die Unterhaltung in ein anderes zu verlegen, siehe [In einem anderen Agenten fortsetzen](/guide/sessions#continue-in-another-agent).

Eine Sitzung, die ohne Agenten gestartet wurde (in VS Code oder einem Terminal oder bevor es Agenten in der App gab), zeigt dort **Kein Agent**: Wähle einen aus, um ihr einen zu geben. Auch das Menü der Sitzung (⋯) → **Sitzungseinstellungen** → **Agent** nennt ihn; ein Klick darauf öffnet die Seite des Agenten.

## Die Sitzungen eines Agenten finden

Eine Sitzung, die als anderer als der übliche Agent gestartet wurde, ist in der Seitenleiste daran zu erkennen: Die zweite Zeile ihres Eintrags beginnt mit dem Symbol und dem Namen des Agenten („Planer · web-agent · 5d“ oder „Forscher · Arbeitet · 2m 10s“, während er arbeitet). Der übliche ist der eigene Agent des Projekts bei einer Sitzung in einem Projekt, das einen hat (**Neue Sitzungen starten mit**, in den Details des Projekts), und Allgemein bei allen anderen Sitzungen. Außerhalb von Hydor gestartete Sitzungen und ein inzwischen gelöschter Agent werden ebenfalls nicht genannt. Der Filter und die Suche richten sich nach dem Agenten, als der jede Sitzung wirklich gestartet wurde, auch dem üblichen. So siehst du nur die Sitzungen eines Agenten:

- Klicke oben in der Seitenleiste auf die Filterschaltfläche (**Sitzungen filtern und gruppieren**) und wähle unter **Agent** den Agenten. Sie listet die Agenten auf, als die deine Sitzungen gestartet wurden, den meistgenutzten zuerst (bis zu acht), jeweils mit der Zahl seiner Sitzungen; **Alle Agenten** zeigt wieder jede Sitzung. Der Abschnitt erscheint, sobald eine Sitzung als Agent gestartet wurde.
- Oder öffne die Seite des Agenten und klicke neben **Letzte Sitzungen** auf **Alle 23 in der Seitenleiste anzeigen** (bei acht oder weniger Sitzungen heißt es **In der Seitenleiste anzeigen**). Das öffnet die Startseite, wobei die Seitenleiste nur die Sitzungen dieses Agenten zeigt und andere Filter zurückgesetzt sind; auf einem Smartphone öffnet sich das Menü.
- Oder gib den Namen des Agenten ins Suchfeld ein (Ctrl+K): „Nachhilfelehrer“ findet die Sitzungen, die als Nachhilfelehrer gestartet wurden. Allgemein ist davon ausgenommen, da es die meisten Sitzungen sind. In der Vorschau einer Sitzung steht dort ihr **Agent**.

Solange ein Filter aktiv ist, nennt ihn ein Chip unter **Neue Sitzung** mit seinem Symbol: Klicke auf sein ×, um wieder alle Sitzungen zu zeigen. Der Agentenfilter funktioniert zusammen mit den anderen (**Ausführungsumgebung** und **Projekt**), etwa die Sitzungen eines Agenten in einem Projekt. Wird der Agent gelöscht, zeigt die Liste wieder jede Sitzung. Siehe [Die Seitenleiste](/guide/start#the-sidebar).

## Einen Agenten duplizieren oder löschen

Auf der Seite eines Agenten:

- **Duplizieren** (bei jedem Agenten): öffnet das Fenster bei **Einrichten** als neuen Agenten, in dem alles ausgefüllt ist, mit dem Namen „*Name* (Kopie)“. Ändere, was du möchtest, und klicke auf **Agent erstellen**; seine Seite öffnet sich. So erstellst du deine eigene Version eines integrierten Agenten.
- **Löschen** (nur deine eigenen): fragt zuerst „*Name* löschen?“. Sitzungen, die als er gestartet wurden, laufen ohne seine Anweisungen weiter; seine Zeitpläne werden mit ihm gelöscht, da sie für ihn geschrieben wurden; Agenten, die ihm Arbeit übergeben konnten, listen ihn nicht mehr auf. Projekte, die ihre Sitzungen als er gestartet haben, werden davon befreit: Ihre Sitzungen starten wieder als Allgemein (oder als der Agent, den du wählst). Der Verlauf seiner Ergebnisse geht mit ihm; die Seiten und Tabellen, die er gefüllt hat, bleiben dort, wo sie abgelegt wurden.

Das Suchfeld (Ctrl+K, ⌘K auf einem Mac) findet Agenten auch nach Name und Beschreibung; die Wahl eines Agenten öffnet seine Seite.

## Einen Agenten als Datei teilen

Einer deiner Agenten kann als einzelne Datei weitergegeben werden, zum Aufbewahren oder für eine Kollegin oder einen Kollegen, die oder der ihn auf dem eigenen Hydor installiert.

- **Herunterladen**: Öffne die Seite des Agenten, dann **Mehr** (⋯) → **Als Datei herunterladen**. Auch eingebaute Agenten lassen sich herunterladen, um sie als eigenen Agenten zu installieren. Die Datei (`.hydor-agent`) enthält die Anweisungen, was der Agent verwenden darf, seine Leistungsstufe, sein Programm und Modell, die bevorzugten Skills, den Berechtigungsmodus, das Budget und weitere Einstellungen, die Agenten, an die er Arbeit übergibt (mit Namen), was er zurückgibt und welche Arten von Orten seine Ergebnisse bekommen, seine Zeitpläne, die nach der Uhr laufen (als Vorschläge), und seine Beispiele. Nichts Persönliches von dir steckt darin: Die Projekte, in denen er arbeitet, die verbundenen Konten, die er nutzt, die Seite und die Tabelle, in die seine Ergebnisse gingen, wer seine Ergebnisse per E-Mail bekommt und von welchem Konto, sowie die Adresse und der Key seines Webhooks bleiben draußen. Seine Zeitpläne, die bei einer Überwachung, einem Webhook oder einem Datum starten, bleiben hier. Die Datei listet in Worten auf, was weggelassen wurde, damit du es neu einstellen kannst.
- **Installieren**: Öffne auf der [Agenten-Seite](/agents) **Neu** und wähle **Agent aus Datei installieren** (auf dem Smartphone tippst du auf **Installieren**), dann **Datei auswählen** und wähle eine `.hydor-agent`-Datei (oder zieh sie dorthin). Bevor etwas gespeichert wird, zeigt eine Karte den Agenten: seinen Namen und seine Zeile, **Enthaltene Funktionen** (seine Anweisungen, was er verwenden darf, seine Leistungsstufe, was er zurückgibt, seine Beispiele, seine vorgeschlagenen Zeitpläne), **Was du dafür bereitstellen musst** (was weggelassen wurde, und die Agenten, an die er Arbeit übergibt und die du nicht hast) und **Anweisungen des Schritts** zum Lesen. Ein Agent von dir mit demselben Namen bleibt unberührt: Der neue wird daneben als „Name (2)“ installiert, es sei denn, du wählst **Meinen Agenten ersetzen**. Dann wird deiner mit diesem als neue Version überschrieben (der bisherige Stand bleibt in seinen **Versionen**, und deine Beispiele bleiben, nach denen aus der Datei). **Vorgeschlagene Zeitpläne pausiert hinzufügen** fügt seine Zeitpläne hinzu, ausgeschaltet, bis du sie einschaltest. Klicke auf **Installieren**, und die Seite des Agenten öffnet sich.

Manches ändert sich beim Installieren, und die Karte sagt, was: Ein Agent, der nie nachfragte, bevor er handelte (**Voller Zugriff**), startet mit **Änderungen akzeptieren**, ein Programm, das hier nicht eingerichtet ist, weicht dem Programm, das auf der Startseite gewählt ist, und eine Datei aus einem neueren Hydor bringt mit, was dieses kennt (aktualisiere Hydor für den Rest). Eine Datei, die keine Agentendatei oder beschädigt ist, wird mit dem Grund abgelehnt. Die Datei einer App wird stattdessen auf der [Apps-Seite](/guide/apps#share-an-app-as-a-file) installiert, und Agentendateien von Claude Code kommen mit **Importieren** herein (siehe unten).

## Agentendateien von Claude Code importieren

Claude Code kann eigene Agenten als Markdown-Dateien in einem Ordner `.claude/agents` ablegen: ein kurzer Kopf mit Name, Beschreibung, Modell und Werkzeugen des Agenten und darunter seine Anweisungen. Die App macht aus diesen Dateien Agenten von dir, sodass jedes Programm hier so arbeiten kann.

1. Öffne die [Agenten-Seite](/agents), dann **Neu** und **Claude Code-Agentendateien importieren** (auf dem Smartphone klickst du oben auf **Importieren**).
2. **Claude-Code-Agenten importieren** listet die gefundenen Agentendateien auf: deine in `~/.claude/agents` (markiert mit **Eigene**) und die im Ordner `.claude/agents` des Ordners, der in den [Dateien](/files) geöffnet ist (markiert mit **Dieser Ordner**). Um die Agenten eines Projekts zu sehen, öffne dieses Projekt zuerst in den Dateien.
3. Klicke neben einer Datei auf **Importieren**. Ihr Agent ist dann auf der Agenten-Seite und im Agentenmenü der Startseite bereit.
4. Für eine Datei an anderer Stelle klicke auf **Datei auswählen** („Oder eine Agentendatei von diesem Gerät“) und wähle die `.md`-Datei.

Die Datei muss Markdown (`.md`) sein und höchstens 256 KB groß. Das übernimmt die App daraus:

| In der Agentendatei | Im Agenten |
|---|---|
| `name` (oder der Dateiname, wenn keiner da ist) | **Name**: „code-reviewer“ wird zu „Code reviewer“ |
| `description` | **Eine Zeile dazu**: der erste Satz, ohne die Beispiele |
| `model` | **Ausführungsumgebung**: Claude Code mit diesem Modell („inherit“ behält das der Startseite) |
| `tools` | **Erlaubte Werkzeuge**, nach Art; eine Datei ohne Zeile für Werkzeuge darf alles verwenden |
| `permissionMode` | **Berechtigungsmodus**: default → Fragen, acceptEdits → Änderungen akzeptieren, bypassPermissions → Voller Zugriff, plan → Plan |
| `skills` | **Bevorzugte Skills** |
| Der Text unter dem Kopf | **Anweisungen** |

Das Symbol wird nach Name und Beschreibung des Agenten gewählt (ein Teleskop für Recherche, ein Stift für Schreiben, Code für Prüfen und Testen usw.). Importierte Agenten arbeiten im Ordner der Startseite, so wie Agenten von Claude Code in einem Projekt arbeiten.

Bei einer bereits importierten Datei steht in der Liste **Aktualisieren** statt **Importieren**. **Aktualisieren** liest die Datei erneut in denselben Agenten ein: Seine Felder entsprechen wieder der Datei, nur das Symbol, das du gewählt hast, bleibt. Wenn du eine Datei von deinem Gerät auswählst, entsteht immer ein neuer Agent.

## Aufgabenordner: wo eine Aufgabe ohne Ordner arbeitet

Viele Aufgaben gehören in keinen Ordner: eine Reiseplanung, ein Brief, eine Frage. Dafür zeigt der Ordner-Chip auf der Startseite **Neuer Aufgabenordner**, und wenn du auf **Starten** drückst, legt die App für die Sitzung einen frischen Ordner an, benannt nach dem Tag und ein paar Wörtern deiner Nachricht, etwa `~/Hydor/2026-10-31-plan-trip-lisbon`. Der Agent speichert seine Arbeit dort, und du findest sie in den [Dateien](/files) wieder.

So entsteht der Name:

- Das Datum in deiner Zeitzone.
- Bis zu fünf Wörter deiner Nachricht, ohne Füllwörter (ein, der, bitte, hilf, mir …), Links und einen führenden `/command`, ohne Akzente, höchstens 40 Zeichen. Bleiben keine Wörter übrig, heißt er `task`.
- Ist der Name vergeben, wird `-2`, `-3` usw. angehängt.

### Einen Aufgabenordner oder einen eigenen Ordner wählen

Öffne den Ordner-Chip auf der Startseite:

- **Neuer Aufgabenordner** („ein frischer in ~/Hydor“) legt für jede Sitzung einen frischen Ordner an.
- Wähle ein Projekt, einen zuletzt verwendeten Ordner oder einen beliebigen Ordner, den du mit **Durchsuchen** findest oder indem du seinen Namen oder Pfad eintippst, und die Sitzung arbeitet stattdessen dort (siehe [Projekte](/guide/projects) und [Sitzungen](/guide/sessions)).

Solange du nichts wählst, entscheidet der Agent: Die eingebauten Agenten außer dem Programmierer und deine eigenen mit „Ein neuer Aufgabenordner“ verwenden einen Aufgabenordner. Der Programmierer und Agenten, die auf „Der Ordner der Startseite“ gestellt sind, verwenden den angezeigten Ordner, und ein Agent, der in einem Projekt arbeitet, nutzt dieses Projekt. Die Startseite merkt sich, was du gewählt hast. Wählst du einen anderen Agenten, geht die Entscheidung wieder an ihn zurück, es sei denn, du hast seit dem Öffnen der Seite einen Ordner gewählt oder bist in einem Projekt. Ändert sich der Ordner, zeigt das Feld die für diesen Ort gemerkten Auswahlen, mit dem Agenten, den du gewählt hast.

Aufgabenordner überladen das Ordnermenü nicht: Die zuletzt verwendeten Ordner, die es auflistet, lassen sie aus. Sitzungen, die per Sprache im freihändigen Modus gestartet werden, bekommen ebenfalls einen Aufgabenordner, es sei denn, die Startseite war zuletzt auf einen Ordner oder ein Projekt gestellt (siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice)).

### Aufgabenordner verschieben

1. Suche in [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Task%20folders) unter **Aufgabenordner** in der Gruppe **Aufgaben** (sein (i) sagt, dass eine Sitzung, die ohne Ordner gestartet wird, hier einen neuen bekommt, benannt nach dem Tag und der Aufgabe, und dass der Programmierer stattdessen in dem Ordner arbeitet, den du wählst).
2. Klicke auf den Namen des Ordners. Gib unter **Arbeitsordner** einen Pfad ein (beim Tippen werden Ordner vorgeschlagen, auch zuletzt verwendete) und klicke auf **Diesen Ordner verwenden**. Gib einen vollständigen Pfad an oder einen, der mit `~` für deinen Home-Ordner beginnt.

Neue Aufgabenordner landen von da an dort. Bereits angelegte Ordner bleiben, wo sie sind. **Zurück zu ~/Hydor** erscheint, sobald du es geändert hast, um zur Voreinstellung zurückzukehren. Die Zeile darunter zeigt, wie neue aussehen. Neue Projekte, die einen eigenen Ordner bekommen, erhalten ihn ebenfalls hier, in einem Ordner **Projekte** darin (siehe [Projekte](/guide/projects)).

## Nach Aufgaben aufräumen

In [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Clean%20up%20after%20a%20task) gibt es in der Gruppe **Aufgaben** einen Schalter: **Nach Aufgaben aufräumen** (sein (i) sagt, was der Agent entfernt). Er ist eingeschaltet, solange du ihn nicht ausschaltest, und gilt für jede Sitzung, egal als welcher Agent sie arbeitet.

Ist er eingeschaltet, besteht der letzte Schritt eines Agenten in einer Aufgabe darin, zu entfernen, was er unterwegs erzeugt hat und nicht mehr braucht:

- Hilfs- und Testdateien, temporäre Ordner und Daten, Debug-Ausgaben und Screenshots;
- Git-Branches, Worktrees (zusätzliche Kopien eines Repositorys, jede auf einem eigenen Branch) und Stashes, die er angelegt hat und die zusammengeführt oder aufgegeben sind;
- Prozesse, Server oder Container, die er gestartet hat, es sei denn, du willst, dass sie weiterlaufen.

Er behält, was du verlangt hast, und Arbeit, die noch jemand prüfen oder zusammenführen muss (etwa ein Branch mit nicht zusammengeführten Commits), entfernt nie etwas, das er nicht selbst angelegt hat, und fragt dich vorher, wenn etwas groß oder unklar ist (ein großer Download, alles Geteilte). Er nennt jedes Ding, das er entfernt, beim Namen, statt nach Muster zu löschen, und sagt in einer Zeile, was er entfernt und was er übrig gelassen hat. Der Aufräum-Skill, der mit der App kommt, enthält das Vorgehen (siehe [Skills](/guide/skills)).

Schaltest du ihn aus, lassen Agenten zurück, was sie erzeugt haben. In beiden Fällen übernehmen Agenten die Änderung ab ihrer nächsten Sitzung (Custom ab der nächsten Nachricht).

## Vier Befehle, die jeder Agent hat

Jede Sitzung, die die App startet, ob mit Claude Code, Codex oder Custom, findet vier kleine Befehle in ihrer Shell und erfährt, wofür sie da sind. Du musst nichts tun, um sie zu bekommen: Die App legt sie selbst dort ab, in den Desktop-Apps für Mac, Windows und Linux, in Docker und in einer Kopie, die du aus dem Repository ausführst, und sie erfordern keine Installation auf deinem Computer.

- **`waitfor`** wartet in einem einzigen Aufruf darauf, dass ein langer Vorgang fertig wird, wo ein Agent sonst alle paar Sekunden erneut nachsehen würde. Der Befehl kann darauf warten, dass ein Programm beendet wird, eine Datei erscheint, eine Zeile in einem Log auftaucht, eine Webadresse antwortet, ein Slurm-Job auf einem Cluster seine Warteschlange verlässt oder ein Befehl erfolgreich ist. Er kann bei der ersten Log-Zeile anhalten, die einen Absturz des Jobs meldet, am Ende das Ende des Logs anzeigen und nach einer von dir festgelegten Zeit aufgeben. Er kann auch selbst einen Befehl starten und auf ihn warten. Ein Agent führt ihn als Hintergrundbefehl aus, wenn das Warten länger als ein paar Minuten dauern kann, sodass die Unterhaltung währenddessen weitergeht.
- **`job`** führt lange Arbeiten aus (einen Build, einen Trainingslauf, eine Indexierung), sodass sie unter [Jobs](/guide/jobs) erscheinen, mit dem Fortschritt und der verbleibenden Zeit. Die Arbeit kann erst auf das Ende anderer Jobs warten und sich in eine Warteschlange einreihen, die immer nur einen Job ausführt. Bereits laufende Arbeit zeigt `job adopt` in den Jobs an, ohne sie neu zu starten. Agents versehen jeden Job mit Tags (`--tag`), die die grobe Art der Arbeit nennen (experiments, data-collection, builds …), und verwenden dabei die schon benutzten Tags wieder.
- **`edits`** nimmt in einem Aufruf mehrere exakte Ersetzungen (Suchen und Ersetzen) vor, in so vielen Dateien wie nötig. Geschrieben wird nur, wenn jede Änderung ihren Text genau einmal findet, sodass eine unpassende Änderung deine Dateien unverändert lässt. Der Befehl gibt die geänderten Zeilen mit ihren Nummern aus, damit der Agent die Dateien nicht erneut lesen muss.
- **`sym`** findet, wo etwas definiert ist (eine Funktion, eine Klasse, ein Typ), und gibt alles davon mit den genauen Zeilennummern aus, in TypeScript-, JavaScript-, Python- und Rust-Dateien. Er kann auch auflisten, wo ein Name verwendet wird und welche Deklarationen eine Datei enthält. Er liest den Code, sodass ihn eine Klammer in einer Zeichenkette oder einem Kommentar nicht verwirrt, und er braucht keinen Index. Für reinen Text und andere Sprachen verwenden Agenten weiterhin grep.

Ein fünfter Befehl ist für Beweise: **`leancheck`** sagt, ob die Beweise in einer Lean-Datei gelten (sie lässt sich bauen, nichts ist als `sorry` offen gelassen, jeder Satz stützt sich nur auf die Standardannahmen von Lean, und der Kernprüfer von Lean akzeptiert jeden Schritt), und zeigt, was jeder Satz aussagt, mit einem kurzen **Pin** dieser Aussage. Er ist nur dann erfolgreich und kann deshalb die Befehlsprüfung eines Ziels sein (`leancheck Proofs/Main.lean`); nenne einen Satz mit seinem Pin (`--theorem main_theorem@3fa2c1d9ab12`), und er schlägt auch fehl, wenn die Aussage nicht mehr dieselbe ist. Dafür muss Lean eingerichtet sein (siehe [Beweise: mit Lean prüfen](/guide/researchers#proofs-checking-them-with-lean)).

Kurz gesagt: Agenten brauchen weniger Aufrufe, um zu warten, an mehreren Stellen zu ändern und Code zu lesen. Jeder Befehl erklärt sich selbst mit `--help`. Das liest ein Agent, wenn er eine Option braucht. Agenten werden außerdem angewiesen, weniger, aber umfassendere Schritte zu machen (voneinander unabhängige Suchen zusammen abzuschicken und einen langen Auftrag in Abständen zu prüfen, die zu seiner erwarteten Dauer passen). Das gehört dazu, wie die App Agenten anweist, und ist keine Richtlinie, die du bearbeitest.

Einige Einschränkungen:

- Das Warten auf einen systemd-Dienst funktioniert nur unter Linux.
- Unter Windows braucht das Warten auf ein Programm nach seinem Namen PowerShell, und das Warten auf einen Befehl oder einen Slurm-Job braucht [Git for Windows](https://git-scm.com/download/win), das die Befehle der Agenten ohnehin benötigen (sie laufen in der Bash von Git).
- `sym` kennt Definitionen in TypeScript-, JavaScript-, Python- und Rust-Dateien und sagt es, wenn es nicht erkennen kann, wo eine endet.
- Eine Sitzung, die in einem einzelnen Browser-Tab arbeitet, hat keine Shell und bekommt sie deshalb nicht.

Die App probiert jeden Befehl beim Start einmal aus, so wie ihn die Shell eines Agenten ausführt, und nennt den Agenten nur die, die funktioniert haben. So wird nie ein Befehl angeboten, der auf deinem Computer nicht laufen kann. Eine Änderung gilt für Agenten ab ihrer nächsten Sitzung (bei Custom ab der nächsten Nachricht).

Um dies auszuschalten, starte die App mit der Umgebungsvariable `HYDOR_SHELL_TOOLS=0` (in `~/.config/hydor.env` für die Desktop-Apps und den Dienst oder in `.env` für Docker). Agenten bekommen dann keine zusätzlichen Befehle und erfahren nichts davon. In den Einstellungen gibt es dafür keinen Schalter. Bereits laufende Sitzungen behalten die Befehle, mit denen sie gestartet sind.

## Wo Agenten sonst noch vorkommen

- **Projekte**: Ein Projekt kann festlegen, als welcher Agent seine Sitzungen starten („Seine Sitzungen starten als“). Wenn du das Projekt auf der Startseite wählst, wählst du ihn mit. Sein Tab **Agenten** zeigt die Agenten, die darin arbeiten. Siehe [Projekte](/guide/projects).
- **Apps**: Eine App kann einen **Agent** benennen, und ihre Ausführungen starten als er (Ausführungen von einer öffentlichen Seite nicht). Die Agentenschritte einer App können jeweils einen benennen. Siehe [Apps](/guide/apps).
- **Geplante Aufgaben**: Eine Aufgabe läuft als der Agent, den ihre Option **Agent** nennt. Eine Aufgabe, die ein Agent aus einer Sitzung für dich einrichtet, läuft so wie diese Sitzung. Siehe [Geplante Aufgaben](/guide/tasks).
- **Freihändige Sprache**: Sitzungen, die du per Sprache startest, starten an dem Ort, der auf der Startseite zuletzt gewählt wurde, mit seinen Auswahlen, als der dort gewählte Agent (sonst der eigene Agent des Projekts, sonst Allgemein).

## Einen Agenten fragen

- „Erstelle mir einen Agenten namens Paper-Scout, der an jedem Werktag um 8 neue Paper zu meinen Forschungsthemen findet und die fünf besten auf einer Seite aufbewahrt, und dabei mit Schnell denkt.“
- „Erstelle einen Agenten namens Buchhalter, der meine Haushaltsabrechnung in einer Tabelle führt, keine Befehle ausführen kann und höchstens 5 $ im Monat ausgeben darf.“
- „Erstelle einen Agenten, der jede Stunde prüft, ob Python 3.15 erschienen ist, mir Bescheid sagt, wenn es so weit ist, und dann aufhört.“
- „Der Samstagszeitplan meines Paper-Scouts wird nicht mehr gebraucht: Entferne ihn.“ „Lösche meinen Agenten Buchhalter.“
- „Lass meinen Agenten Release-Manager Arbeit an Übersetzer und Testläufer übergeben.“
- „Lass meinen Agenten Übersetzer nur im Projekt Hydor arbeiten.“
- „Lass Schnell für Claude Code Haiku bedeuten und für Custom mein lokales Qwen-Modell.“
- „Schalte Max für schwierige Probleme aus, damit Sitzungen auf Automatisch bei Am besten bleiben.“
- „Importiere meine Claude-Code-Agentendatei ~/.claude/agents/code-reviewer.md als Agenten.“
- „Welche Agenten habe ich, womit denkt jeder, und was haben sie diesen Monat ausgegeben?“
- „Lass meinen Paper-Scout eine Liste von Papers zurückgeben, jedes mit Titel, Link und dem Grund, warum es wichtig ist, als aufbewahrte Seite und als Benachrichtigung.“
- „Lass meinen Buchhalter jeden Freitag eine Zeile mit den Ausgaben dieser Woche und den größten Posten in meine Tabelle Haushaltsbudget einfügen.“
- „Lass meinen Agenten Wochenbericht seinen Bericht jeden Montag an maria@example.com mailen, mit dem Betreff Wochenbericht {date}.“
- „Was hat mein Buchhalter diesen Monat zurückgegeben, und auf wie viel kam das insgesamt?“
- „Welche meiner Agenten laufen morgen früh von selbst, und wann?“
- „Lass meinen Docs-Verwalter eine eigene Unterhaltung behalten, und schick ihm: Aktualisiere die Anleitung für die neue Agenten-Seite.“
- „Wechsle meine Sitzung zur Lissabon-Reise zum Agenten Planer.“
- „Was hat sich diese Woche an meinem Paper-Scout geändert? Hol die Version von vor Montag zurück, falls seine Beispiele damals besser abschnitten.“
- „Gib meinem Agenten Wochenbericht zwei Beispiele, eines für eine ruhige und eines für eine geschäftige Woche, mit dem, was ein guter Bericht sagen muss, und probiere sie aus.“
- „Lade meinen Agenten Buchhalter als Datei herunter und sag mir, was ich auf meinem Laptop neu einstellen muss.“
- „Lege neue Aufgabenordner ab jetzt in ~/Documents/Tasks ab.“
- „Welche Befehle bekommen meine Agenten in ihrer Shell, und wie schalte ich sie aus?“
- „Führe das Trainingsskript aus und warte, bis es fertig ist, aber brich vorher ab, wenn das Log einen Fehler zeigt.“
