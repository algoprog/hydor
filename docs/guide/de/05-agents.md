# Agenten

Ein Agent ist das, als was eine Sitzung arbeitet: seine Anweisungen, was er benutzen darf, wo und wann er arbeitet, mit welcher Leistungsstufe des Modells er denkt, an welche anderen Agenten er Arbeit weitergibt und was er in einem Monat ausgeben darf. Dieses Thema behandelt die Agentenseite, die Agenten, die mit der App kommen, wie du deine eigenen erstellst, indem du sagst, was sie tun sollen, wie du einen änderst, wo ein Agent arbeitet, seine Zeitpläne, Leistungsstufen, Agenten, die Arbeit an andere Agenten weitergeben, ein Monatsbudget, die Versionen eines Agenten und die Beispiele, die ihn prüfen, wie du Sitzungen als Agent startest und wechselst, wie du einen Agenten als Datei teilst, wie du die Agentendateien von Claude Code importierst, die Aufgabenordner, die eine Sitzung bekommt, wenn du keinen Ordner wählst, und wie Agenten nach einer Aufgabe aufräumen.

![Die Agentenseite mit deinen Agenten als Statuskarten und den integrierten Agenten darunter](images/agents.webp)

## Was ein Agent ist

Beim Sitzungsstart wählst du auf der Startseite einen Agenten. Später kannst du ihn im Nachrichtenfeld wechseln. Seine Anweisungen ergänzen die des Programms, sodass dasselbe Programm einmal als sorgfältiger Rechercheur und danach als geduldiger Nachhilfelehrer arbeitet. Agenten funktionieren mit Claude Code, Codex, Custom und Programmen mit Agent Client Protocol, kurz ACP, etwa Gemini CLI oder OpenCode.

Ein Agent kann Folgendes festlegen:

- **Anweisungen** für Rolle und Arbeitsweise. Sie gelten während der gesamten Arbeit; deine Unterhaltungsaufträge haben Vorrang.
- **Arbeitsbereich**: überall oder nur in ausgewählten Projekten. Siehe [Wo ein Agent arbeitet](#where-an-agent-works).
- **Ausführungszeitpunkt**: wenn du oder ein anderer Agent ihn darum bittest, und nach seinen eigenen Zeitplänen (siehe [Wann ein Agent arbeitet: Zeitpläne](#when-an-agent-works-schedules)).
- **Verwendete Modellstufe**: Automatisch oder Quick, Standard, Best beziehungsweise Max mit je Programm einmal zugeordnetem Modell. Siehe [Modellstufen](#what-an-agent-thinks-with-tiers).
- **Sein Team**: die anderen Agenten, an die er Teile seiner Arbeit weitergeben darf, und ob andere Agenten ihm Arbeit weitergeben dürfen (siehe [Agenten, die Arbeit an andere Agenten weitergeben](#agents-that-hand-work-to-other-agents)).
- **Ein Monatsbudget**: was seine Sitzungen in einem Monat ausgeben dürfen (siehe [Ein Monatsbudget](#a-monthly-budget)).
- **Ergebnisübergabe**: die Felder jedes Ergebnisses, geprüft, und wohin jedes geht: eine behaltene Seite, eine Zeile in einer Tabelle, eine E-Mail an Personen, eine Benachrichtigung, eine Datei, ein Webhook (siehe [Was ein Agent zurückgibt](#what-an-agent-hands-back)).
- **Eine eigene Unterhaltung**: Er kann eine Unterhaltung führen, mit einem Posteingang für Nachrichten von dir und von anderen Agenten, in dem auch seine geplanten Läufe etwas hinterlassen (siehe [Ein Agent mit einer eigenen Unterhaltung](#an-agent-with-a-conversation-of-its-own)).
- **Erlaubte Werkzeuge**: Dateien lesen, Dateien erstellen und ändern, Befehle ausführen, das Web benutzen, einen Browser benutzen, den Computer benutzen (seinen Bildschirm, seine Maus und seine Tastatur, in den Desktop-Apps mit eingeschaltetem Computer Use) und andere Tools. Lass alle eingeschaltet oder schalte einige aus.
- **Bevorzugte Skills**, die bei passenden Aufgaben vor Arbeitsbeginn geladen werden. Siehe [Skills](/guide/skills).
- **Verbundene Apps** für in seinen Sitzungen aktivierte Konten. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).
- **Empfehlungen für Programm, Modell und Berechtigungsmodus**, die auf der Startseite übernommen werden, aber vor dem Start änderbar bleiben.
- **Standard-Arbeitsordner**, wenn du keinen wählst: ein neuer Aufgabenordner oder der auf der Startseite angezeigte Ordner.

Ein Agent ist eine Sitzungsrolle. Allgemeine Vorgaben für alle Agenten, ein Projekt oder eine einzelne Sitzung, etwa deine bevorzugte Ansprache, gehören stattdessen in [Agentenrichtlinien](/guide/guidelines). Vor Version 0.37.0 hießen Agenten Assistenten; es sind dieselben Rollen mit erweiterten Möglichkeiten.

## Die Agentenseite

Öffne **Agenten** in der Werkzeugleiste oder [/agents](/agents). Auf dem Smartphone musst du das Seitenleistenmenü vorher öffnen. Auch **Deine Agenten** unter [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Your%20agents) führt mit der Anzahl eigener Agenten dorthin. Die übrigen Einstellungen dort betreffen Aufgabenordner und Aufräumen.

- Auf einem Computer hat die Seite eine Spalte neben der Werkzeugleiste, wie die Apps und die Einstellungen: oben das Logo, **Neu** und **Seitenleiste ausblenden** (Strg+B, ⌘B auf dem Mac), darunter die Bereiche. **Neu** öffnet ein Menü: **Neuer Agent** erstellt einen; siehe [Einen Agenten erstellen](#make-an-agent). **Agent aus Datei installieren** liest eine erhaltene Agentendatei; siehe [Agenten als Datei teilen](#share-an-agent-as-a-file). **Claude Code-Agentendateien importieren** übernimmt Claude-Code-Dateien; siehe [Claude-Code-Agenten importieren](#import-claude-codes-agent-files).
- Die Bereiche: **Alle Agenten** (deine als Karten, darunter die eingebauten, solange die Spalte ausgeblendet ist, denn die Spalte listet sie), **Deine Agenten** (nur deine), **Braucht dich** und **Nach einem Zeitplan** (jeweils sichtbar, solange einige von deinen so sind) und unter **Wo sie arbeiten** **Überall** und jedes Projekt mit eigenen Agenten. Jeder zeigt, wie viele Agenten er enthält. Unter **Eingebaut** steht für jeden mitgelieferten Agenten eine Zeile mit seinem Symbol, die seine eigene Seite öffnet. Nach einer Trennlinie zeigt **Zeitpläne**, alles, was von selbst in einer Woche läuft: die Zeitpläne deiner Agenten mit deinen anderen geplanten Aufgaben, die Zeitpläne deiner Apps, Überwachungen und Webhooks, jeder Lauf nach seinem Ergebnis eingefärbt, was als Nächstes läuft, und eine Liste von allen mit einem Schalter, um jeden anzuhalten (siehe [Die Woche ansehen: was lief und was als Nächstes läuft](/guide/tasks#see-the-week-what-ran-and-what-runs-next)). Der geöffnete Bereich ist markiert, und die Adresse behält ihn (`/agents?place=mine`, `/agents/schedules`), sodass ein Link ihn öffnet.
- Oben auf der Seite steht links der Name des Bereichs und rechts das Suchfeld: **Agent suchen** schränkt die Karten und die eingebauten Agenten auf die ein, in deren Namen oder Zeile vorkommt, was du tippst.
- Deine Agenten erscheinen als Karten. Jede Karte zeigt den Namen des Agenten, seine Zeile, wie es ihm geht (**Arbeitet**, **Braucht dich**, wenn eine seiner Sitzungen auf deine Antwort wartet, **Budget aufgebraucht** oder **Inaktiv**), die Projekte, in denen er arbeitet (oder **Überall**), seine Leistungsstufe, wann er als Nächstes läuft, wie viele Nachrichten in seinem Posteingang warten und was er in diesem Monat ausgegeben hat.
- Auf dem Smartphone und in einem schmalen Fenster gibt es keine Spalte: Die Seite behält ihren Titel, rechts **Neuer Agent**, **Importieren** und **Installieren**, darunter zwei Tabs (**Deine Agenten** und **Zeitpläne**) und über den Karten Filter, die **Alle**, **Überall**, Projekte mit eigenen Agenten, **Nach einem Zeitplan** und **Braucht dich** zeigen. Mitgelieferte Agenten stehen unter **Eingebaut**.

Klicke auf eine Karte für die eigene Seite des Agenten. Die Spalte bleibt daneben, mit diesem Agenten markiert (bei einem von deinen **Deine Agenten**):

- Einstellungen erscheinen als Sätze, etwa „Arbeitet überall, werktags um 09:00 Uhr und verwendet Quick“. Unterstrichene Teile lassen sich direkt ändern; siehe [Agenten bearbeiten](#change-an-agent).
- **Sitzung starten** öffnet die Startseite mit diesem Agenten und gegebenenfalls seinem Projekt.
- **Alle Einstellungen** öffnet alle Einstellungen des Agenten in einem Fenster; siehe [Alle Einstellungen](#all-settings). **Duplizieren** erstellt eine bearbeitbare Kopie, **Löschen** entfernt einen eigenen Agenten.
- **Mehr** (⋯): **Versionen** listet bei einem deiner Agenten auf, wie er vor jeder Änderung war, zum Vergleichen und Zurückholen (siehe [Versionen: zu einer früheren zurückgehen](#versions-go-back-to-an-earlier-one)); **Als Datei herunterladen** speichert ihn als Datei zum Aufbewahren oder Weitergeben (siehe [Einen Agenten als Datei teilen](#share-an-agent-as-a-file)).
- **Beispiele** enthält bei eigenen Agenten Testnachrichten und Prüfkriterien samt **Beispiele testen**. Siehe [Prüfbeispiele](#examples-that-check-it).
- **Zeitpläne** listet als dieser Agent laufende Aufgaben und bietet **Zeitplan hinzufügen**.
- **Posteingang**, für einen Agenten, der eine eigene Unterhaltung führt: seine Nachrichten und ihre Antworten, ein Feld, um ihm eine zu schicken, und **Seine Unterhaltung** (siehe [Ein Agent mit einer eigenen Unterhaltung](#an-agent-with-a-conversation-of-its-own)).
- **Ergebnisse** bei konfigurierten Ergebnisfeldern oder Zielen zeigt eine Tabelle mit einer Zeile pro Ergebnis und Zustellorten. Siehe [Ergebnisse eines Agenten](#what-an-agent-hands-back).
- **Diesen Monat**: wie viele Sitzungen als er gestartet wurden und was sie ausgegeben haben, im Vergleich zu seinem Budget, wenn er eines hat; und unter **Letzte Sitzungen** die Sitzungen selbst, die jeweils ihre Unterhaltung öffnen, mit **Alle 23 in der Seitenleiste anzeigen** daneben (siehe [Die Sitzungen eines Agenten finden](#find-an-agents-sessions)).

## Die integrierten Agenten

Acht Agenten sind enthalten. Sie empfehlen weder Programm, Modell, Stufe noch Berechtigungsmodus und behalten deshalb deine Startseitenauswahl bei. Sie begrenzen weder Werkzeuge noch Kosten. Außer Programmierer starten sie ohne Ordnerauswahl in neuen Aufgabenordnern; siehe [Aufgabenordner](#task-folders-where-a-task-without-a-folder-works). Sie lassen sich nicht bearbeiten oder löschen, aber als eigene Kopie anpassen. Siehe [Duplizieren oder löschen](#duplicate-or-delete-an-agent).

Jeder verwendet passende [Antwortansichten](/guide/sessions#answer-uis-cards-charts-and-maps-in-replies), etwa Faktenprüfungen, direkt beantwortbare Übungen, Reisepläne mit Landkarten oder Kennzahlen und Diagramme. So werden Inhalte sichtbar, vergleichbar, abhakbar oder ausprobierbar, wenn das hilfreicher als reiner Text ist.

### Allgemein

„Hilft bei allem: Fragen, Schreiben, Planen, Dateien“ Allgemein ist auf der Startseite voreingestellt, bis du an diesem Arbeitsort einen anderen Agenten wählst. Ein eigener Projektagent hat Vorrang. Allgemein richtet sich auch an Menschen ohne Programmierkenntnisse.

- Klärt dein Anliegen und erledigt es. Nur bei Unklarheiten, die das Ergebnis verändern würden, stellt er eine kurze Frage, möglichst mit passenden Antwortschaltflächen. Sonst entscheidet er sinnvoll und nennt seine Annahme.
- Beginnt mit der Antwort, ergänzt wichtige Details in verständlicher Sprache und erklärt unvermeidbare Fachbegriffe.
- Sie macht jede Antwort leicht aufzunehmen und zu verwenden: Was sich besser ansehen als lesen lässt (Optionen nebeneinander, Orte auf einer Karte, Schritte zum Abhaken, Zahlen als Diagramm, Dinge mit ihren Bildern), kommt als Antwortansicht, mit einem Bild oder einem Video, wo das Sehen hilft, und die eigenen Worte des Agenten tragen die Begründung und den Rat.
- Er sucht im Web nach allem Aktuellen oder allem, bei dem er sich nicht sicher ist, liest die Dateien, auf die du ihn hinweist, und speichert Arbeitsergebnisse, die du behalten willst, als Dateien im Ordner der Sitzung – oder in den Dateien des Projekts (seine Details → **Dateien**), wenn es eine Seite ist, die du wieder brauchst, etwa einen Tracker oder einen Rechner.
- Bietet bei sinnvollen Anschlussmöglichkeiten zwei bis vier Schaltflächen für Vertiefung, Vergleich, Planung oder Umsetzung, aber nicht pauschal nach jeder Antwort.
- Hat er Dateien erstellt oder geändert, nennt er am Ende, welche es sind und wo sie liegen.

### Forscher

„Findet und prüft Quellen und zitiert sie“

1. Er fasst deine Frage in einer Zeile zusammen und zerlegt eine breite Frage in die wenigen Teilfragen, die beantwortet werden müssen.
2. Recherchiert mit verschiedenen Formulierungen und passenden Kategorien wie Fachartikel, Nachrichten, Patente, Unternehmensberichte oder Datensätze. Breite Themen erhalten größere Trefferlisten.
3. Er liest die wichtigen Quellen, statt aus Suchauszügen zu antworten, und bevorzugt Primärquellen und maßgebliche Quellen: Original-Papers und -Daten, offizielle Websites, anerkannte Fachleute und Medien. Er notiert das Datum jeder Quelle und sagt, wie aktuell die Antwort ist, wenn sich die Fakten mit der Zeit ändern.
4. Wo sich Quellen widersprechen, sagt er das, gewichtet sie nach Qualität und Aktualität und trennt, was gesichert, was umstritten und was unbekannt ist.
5. Er belegt, während er schreibt: mit einer nummerierten Markierung hinter jeder Aussage, etwa [1], und den Quellen am Ende mit Titel, Autor oder Herausgeber, Datum und Link. Er erfindet nie eine Quelle, ein Zitat, eine Zahl oder einen Link und sagt es, wenn er etwas nicht überprüfen konnte.
6. Er beginnt mit den Ergebnissen: die Antwort in einer Zeile und die wenigen wichtigen Punkte, dann die Einzelheiten, dann was unsicher bleibt.
7. Er zeigt, was eine eigene Form hat, statt es in Absätzen zu vergraben: Aussagen, die gegen die Belege abgewogen werden, als Faktencheck, Optionen oder Studien nebeneinander, den Verlauf von etwas auf einer Zeitleiste, die wichtigsten Zahlen, lesenswerte Papers, und wie Personen, Ideen oder Organisationen zusammenhängen, als Netzwerkgrafik.
8. Speichert lange Berichte zusätzlich als kommentier- und exportierbare Dokumente in den Dateien des Projekts oder auf Wunsch als Markdown-Datei im Sitzungsordner.

Für eine große Frage, die viele Suchen braucht, siehe tiefgehende Recherche unter [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research).

### Schriftsteller

„Schreibt Entwürfe, überarbeitet und poliert deine Texte“: für E-Mails, Briefe, Beiträge, Aufsätze, Berichte, Geschichten und Reden.

- Vor einem langen Text vergewissert er sich über Zielgruppe, Zweck, Ton und Länge. Ist eines davon unklar und wichtig, fragt er kurz nach (in einem Formular, wenn es mehrere sind); sonst nennt er seine Annahmen in einer Zeile und schreibt.
- Schreibt konkret, verständlich und abwechslungsreich, mit früher Kernaussage, ohne Fülltext und Floskeln.
- Übernimmt den gewünschten Ton oder anhand früherer Texte deine eigene Stimme.
- Wenn er deinen Text bearbeitet, bleiben Aussage und Stil erhalten: Er korrigiert, was falsch ist, strafft, was ausufert, und lässt, was funktioniert. Er zeigt die Änderungen, damit du sie nachvollziehen kannst: deinen Text mit jeder Änderung markiert und erklärt, wenn du Feedback möchtest, oder bei einer Überarbeitung, was sich zwischen den Fassungen geändert hat, danach den bereinigten Text.
- Kurze Texte liefert er gebrauchsfertig: eine E-Mail in Varianten zum Umschalten, in deinem Mailprogramm geöffnet und komplett ausgefüllt; Beiträge, jeweils geprüft gegen die Längenbegrenzung der Plattform; eine Quellenangabe in dem Stil, den du brauchst.
- Bietet bei wichtigen Entscheidungen wie Betreff, Titel, Einstieg oder Namen zwei bis vier kurz erläuterte Varianten.
- Alles, was länger als ein paar Absätze ist, behält er als Dokument (in den Dateien des Projekts), wo du es bearbeiten, kommentieren und exportieren kannst, und er sagt dir das; wenn du eine Datei möchtest, erstellt er eine im Ordner der Sitzung (Markdown, sofern du kein anderes Format willst).

### Programmierer

„Entwickelt, repariert und erklärt Software“ Programmierer arbeitet als Entwickler in deinem Projekt und nutzt deshalb anders als andere integrierte Agenten den auf der Startseite gewählten Ordner statt eines neuen Aufgabenordners.

- Liest vor Änderungen den umliegenden Code und befolgt Projektkonventionen und Werkzeuge.
- Beschränkt Änderungen auf deinen Auftrag und erwähnt andere Probleme, statt sie ungefragt zu beheben.
- Nach Codeänderungen führt er die Tests, den Build oder den Linter des Projekts aus, wenn es sie hat, und behebt, was fehlschlägt.
- Wirkst du neu im Programmieren, erklärt er in einfachen Worten, was er getan hat und wie du es ausführst: Befehle, die du ausführen kannst, jeweils mit Kopierschaltfläche und einer Erklärung, was sie tun, und ein Snippet, das du in einer Spielwiese ausprobieren kannst.
- Wenn er Code erklärt, statt ihn zu ändern, zeigt er, was eine eigene Form hat, statt einer Textwand: einen Fehler mit wahrscheinlichen Ursachen und Lösungen, einen Testlauf, die Dateien eines Projekts als Baum, einen Endpunkt, Ansätze zum Abwägen nebeneinander und ein Diagramm für einen Ablauf oder eine Architektur.
- Am Ende steht eine kurze Zusammenfassung: was sich geändert hat, wie er es geprüft hat und was noch zu tun ist.

### Nachhilfelehrer

„Erklärt Schritt für Schritt und prüft, ob du folgen kannst“ Das Ziel ist, dass du es verstehst und selbst anwenden kannst, nicht nur, dass du eine Antwort bekommst.

- Sind dein Niveau oder dein Ziel unklar, stellt er zuerst eine kurze Frage, mit den wahrscheinlichen Antworten als Schaltflächen zum Anklicken (neu dabei, Grundlagen vorhanden, Prüfungsvorbereitung).
- Vermittelt schrittweise von einfach zu schwierig, in klarer Sprache und mit konkreten Beispielen.
- Er macht jeden Schritt zu etwas, das du sehen oder ausprobieren kannst, nicht nur lesen: ein Diagramm, ein Bild, eine Formelkarte, einen Funktionsgraphen mit Schiebereglern, eine Karte, wie Ideen zusammenhängen, eine Erklärung, bei der du zwischen verschiedenen Tiefen wechseln kannst, ein Rechenbeispiel, das Schritt für Schritt aufgedeckt wird, Code, den du ausführen und ändern kannst, eine kleine Simulation; Mathematik so gesetzt wie im Lehrbuch.
- Nach jedem Schritt prüft er mit etwas, das du direkt an Ort und Stelle beantwortest, und wartet, bevor es weitergeht: ein kurzes Quiz, Übungsaufgaben, die du mit eigenen Worten oder Zahlen beantwortest (beim Antworten geprüft, mit Hinweisen und der Lösung nach einem Versuch), Lückentexte, Zuordnen oder Ordnen in eine Reihenfolge. Er liest die Punktzahl und die Antworten, die du zurückschickst.
- Wenn du antwortest, sagt er, was richtig war, korrigiert freundlich und konkret, was nicht stimmte, und passt sich an: eine andere Erklärung oder ein anderes Beispiel, wenn du nicht weiterkommst, ein schwierigerer Schritt, wenn du voraus bist.
- Führt bei Hausaufgaben mit Hinweisen und Fragen; die vollständige Lösung folgt nur auf Wunsch oder nach weiterem erfolglosem Versuch.
- Bei einer Sprache gibt er dir Wörter zum Hören und Üben, Verbformen, Unterhaltungen und deine eigenen Sätze korrigiert, mit jedem Fehler markiert und erklärt.
- Ein Thema schließt er mit einem kurzen Rückblick und Lernkarten zu dem ab, was du dir merken solltest, und bietet an, was du als Nächstes lernen kannst, als Schaltflächen zum Antippen. Bei einem längeren Kurs führt er einen Lernplan mit den Themen und deinem bisherigen Fortschritt.

### Planer

„Plant Reisen, Veranstaltungen und Projekte“, außerdem Umzüge und Routinen.

- Zuerst klärt er, was den Plan bestimmt: das Ziel, Termine und Fristen, das Budget, die Beteiligten und feste Grenzen. Er fragt nach den wenigen Angaben, die fehlen und wichtig sind (in einem Formular, wenn es mehrere sind), und nimmt für den Rest sinnvolle Standardwerte an, wobei er sagt, was er angenommen hat.
- Er prüft die Fakten, von denen der Plan abhängt (Öffnungszeiten, Fahrzeiten, Preise, Verfügbarkeit, Regeln, das Wetter), im Web und sagt, wenn etwas nicht geprüft werden konnte oder sich ändern kann.
- Plant konkrete Zeiten, Orte, Kosten und Zuständigkeiten mit Puffern und einer Reihenfolge wichtiger Buchungen oder Entscheidungen.
- Er zeigt den Plan so, dass du ihn auf einen Blick erfassen kannst, in den Antwortansichten für Pläne: eine Reise Tag für Tag mit ihren Orten auf einer Karte, den Zeitplan eines Tages, Termine in einem Kalender oder als Countdown, ein Projekt in Phasen oder über Wochen, was zu buchen oder zu packen ist, als Checkliste, die Vorhersage und die Kosten als Budget mit einer Summe.
- Vergleicht zwei oder drei wichtige Alternativen, etwa Flüge oder Unterkünfte, mit ihren Vor- und Nachteilen.
- Er behält den Plan in den Dateien des Projekts, wo du ihn ändern kannst: als Dokument und, für Budgets und Zeitpläne mit Summen, als Tabelle. Er bietet an, ihn anzupassen, mit den wahrscheinlichen Änderungen als Schaltflächen zum Antippen. Wenn du Dateien möchtest, erstellt er sie stattdessen im Ordner der Sitzung.

### Analyst

„Wertet Daten und Tabellen aus, mit Diagrammen“: für Tabellen, CSV-Dateien, Exporte und Zahlen.

- Er sieht sich die Daten an, bevor er sie analysiert (Spalten, Umfang, Typen und Lücken), und meldet Probleme wie fehlende Werte, Duplikate oder ungewöhnliche Formate, bevor er Schlüsse zieht.
- Er rechnet mit Code (einem kurzen Python- oder JavaScript-Skript oder einer Formel), schätzt nie nach Augenmaß und behält die Skripte im Ordner der Sitzung, damit die Arbeit wiederholt werden kann.
- Er beantwortet zuerst die Frage, in einfachen Worten mit den wichtigsten Zahlen, und zeigt dann, wie er darauf gekommen ist. Er nennt Annahmen und Grenzen und behauptet keine Ursachen, die die Daten nicht zeigen können.
- Er zeigt Ergebnisse in den Antwortansichten für Zahlen: die Kennzahlen, ein Diagramm (das einfachste, das passt: Balken zum Vergleichen, Linien über die Zeit), eine Tabelle, die du sortieren und filtern kannst, wie sich Werte verteilen, Anteile an einem Ganzen, wie sich eine Summe verändert hat, Flüsse, Werte über zwei Dimensionen als Heatmap, Zahlen an Orten auf einer Karte und einen Rechner, wenn du andere Werte ausprobieren willst. Eine Darstellung, die keine davon zeichnet, kommt als Livegrafik in die Antwort oder, wenn es mehrere sind, auf eine Seite; Achsen und Einheiten sind beschriftet, und alles ist auf dem Smartphone lesbar.
- Er speichert bereinigte Daten und Ergebnisse als Dateien (CSV oder, wenn du es willst, XLSX), wenn du sie behalten willst. Eine Tabelle, die du ansiehst und änderst, behält er mit ihren Formeln als Tabelle, und ein Dashboard, zu dem du zurückkehrst, als Seite.

### App builder

„Erstellt deine eigenen Apps: kleine Werkzeuge für eine Aufgabe, mit Formular, Schritten und einer Ansicht der Antwort“. Siehe [Apps](/guide/apps).

- Klärt Eingaben, Ausgaben und erfolgreiche Ausführung, fragt nur gestaltungsrelevante Unklarheiten und nennt Annahmen.
- Baut mit eigenen Tools und wählt je Teil den günstigsten passenden Schritt aus Tool, kurzem Modellaufruf, Regel oder Code; Agenten übernehmen Urteilsaufgaben.
- Er gibt der App zwei bis vier Beispiele mit Prüfungen, probiert sie aus und behebt, was fehlschlägt, bevor er sie dir übergibt, und sagt, was ein Lauf kostet und wie lange er dauert.
- Wenn du die App selbst änderst, baut er auf deiner Änderung auf.
- Verwendet den Skill app-builder.

## Einen Agenten erstellen

### Beschreiben, was er tun soll

1. Klicke auf der [Agentenseite](/agents) oben in der Spalte auf **Neu**, dann auf **Neuer Agent** (auf dem Smartphone auf **Neuer Agent** oben auf der Seite). Das Fenster **Neuer Agent** öffnet sich in zwei Schritten, die oben als **1 Beschreiben** und **2 Einrichten** angezeigt werden.
2. Sag unter „Was soll dein Agent tun?“ in deinen eigenen Worten, was er tun soll und, falls er selbstständig arbeiten soll, wann: „Schreibe jeden Freitagnachmittag meinen wöchentlichen Fortschrittsbericht anhand meiner Commits und Notizen und lass mich ihn vor der Veröffentlichung prüfen.“ Unter **Oder starte mit einer Idee** setzen **Paper-Zusammenfassung**, **Wochenbericht**, **Änderungsprüfer** und **Übersetzer** beim Anklicken einen Satz in das Feld, den du ändern kannst.
3. Klicke auf **Meinen Agenten entwerfen** (oder drücke Strg+Enter, auf dem Mac ⌘+Enter). Das Hilfsmodell unter Einstellungen → Modelle → Hilfsmodell entwirft Name, Symbol, Kurzbeschreibung, Anweisungen, Werkzeuge, Modellstufe und gegebenenfalls einen Zeitplan. Das Fenster wechselt zu **Einrichten**.
4. Sieh dir den Entwurf an und ändere, was du willst (siehe [Alle Einstellungen](#all-settings)). **Zurück** führt zu **Beschreiben** zurück: Was du geschrieben hast, bleibt erhalten, und ein neuer Entwurf ersetzt den bisherigen.
5. Klicke auf **Agent erstellen**. Die App meldet „*Name* ist bereit“ und öffnet die Agentenseite. Ein Zeitplan wird als geplante Aufgabe mit diesem Agenten angelegt.

Schließt du das Fenster (✕, Esc oder ein Klick daneben), nachdem du etwas eingegeben oder geändert hast, fragt es zuerst **Diesen Agenten verwerfen?**. Im Projekt bietet der Tab **Agenten** die Option **Neuer Agent hier** sowie ohne Projektagenten **Einen für dieses Projekt erstellen** anhand von Beschreibung oder passender Vorlage. Auch neue Projekte können direkt einen erhalten; siehe [Projekte](/guide/projects).

### Selbst einrichten

**Selbst einrichten** unter dem Feld überspringt den Entwurf und öffnet **Einrichten** nur mit vorausgewähltem Symbol. Siehe [Alle Einstellungen](#all-settings). Du kannst bis zu 200 eigene Agenten behalten.

### Alle Einstellungen

**Einrichten** ist der zweite Schritt von **Neuer Agent** und das, was **Alle Einstellungen** auf der Seite eines Agenten für diesen Agenten öffnet, ohne den Schritt **Beschreiben**. Auf dem Smartphone füllt das Fenster den Bildschirm. Oben stehen das Symbol (klicke darauf, um eines von 30 auszuwählen: ein Teleskop, ein Stift, eine Kochmütze, ein Flugzeug, eine Geldbörse und so weiter) und der Name, höchstens 60 Zeichen, etwa „Buchhaltung“ oder „Reiseberatung“. Nur der Name ist Pflicht.

Auf dem Computer listet eine Spalte links sieben Bereiche auf, jeweils mit dem, worauf er gerade eingestellt ist, unter seinem Namen, sodass du den ganzen Agenten auf einen Blick siehst. Klicke auf einen, um daneben seine Einstellungen zu sehen. Ist ein Bereich länger als das Fenster, zeigt die Schaltfläche **Weiter unten mehr**, dass es weitergeht. Auf dem Smartphone listet **Einrichten** die Bereiche mit ihrer jeweiligen Einstellung auf; tippe auf einen, um ihn zu öffnen, und **‹ Alle Einstellungen** führt zurück.

- **Über**:
  - **Eine Zeile dazu**: höchstens 160 Zeichen, angezeigt auf seiner Karte und im Menü der Startseite, etwa „Hält die Haushaltskonten in Ordnung“.
  - **Anweisungen**: Rolle und Arbeitsweise, höchstens 20.000 Zeichen, zu Sitzungsbeginn gelesen. Beginne etwa mit „Du übernimmst in dieser Sitzung die Buchhaltung des Nutzers“ und ergänze „Frage nach benötigten Abrechnungen“ oder „Halte Summen in einer Tabelle im Arbeitsordner fest“.
- **Wo und wann**:
  - **Arbeitsbereich**: **Überall** oder **Nur in einigen Projekten** mit einem Schalter für jedes Projekt (siehe [Wo ein Agent arbeitet](#where-an-agent-works)).
  - **Ausführungszeitpunkt**: bei einem neuen Agenten **Auf Anfrage**, **Zu einer Uhrzeit** (Tage und Uhrzeit) oder **Jeden…** (ein Intervall) sowie **Jeder Lauf beginnt mit**, der Nachricht, mit der jeder geplante Lauf beginnt. Bei einem vorhandenen Agenten stehen hier seine Zeitpläne; du fügst sie auf seiner Seite unter **Zeitpläne** hinzu und änderst sie dort (siehe [Wann ein Agent arbeitet: Zeitpläne](#when-an-agent-works-schedules)).
  - **Führt eine dauerhafte Unterhaltung mit eigenem Posteingang** (siehe [Eigene Unterhaltungen](#an-agent-with-a-conversation-of-its-own)).
  - **Wo seine Sitzungen beginnen**, wenn auf der Startseite kein Ordner ausgewählt ist:
    - **Neuer Aufgabenordner** als Standard für eine eigene frische Ablage. Siehe [Aufgabenordner](#task-folders-where-a-task-without-a-folder-works).
    - **Der Ordner auf der Startseite**: Sitzungen arbeiten in dem Ordner, der dort angezeigt wird, wie bei Programmierer. Wähle das für Agenten, die in einem Projekt arbeiten.
- **Modell**:
  - **Denkt mit**: **Automatisch**, **Schnell**, **Standard**, **Am besten** oder **Max**, jeweils mit einer Zeile dazu, wofür es gedacht ist (siehe [Modellstufen](#what-an-agent-thinks-with-tiers)).
  - **Ausführungsumgebung**: das Programm, das er vorschlägt und mit dem er auf der Startseite ausgewählt wird.
    - **Beliebiger Agent** behält standardmäßig deine Startseitenauswahl;
    - **Claude Code**, **Codex**, **Custom** mit beliebigem Modell oder unter [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents) hinzugefügte Programme;
    - Sobald du ein Programm auswählst, erscheint daneben ein Modellmenü mit den Modellen dieses Programms (bei Programmen, die eine Auswahl bieten); lässt du es unberührt, gilt das Standardmodell des Programms. Eine Leistungsstufe darüber bestimmt stattdessen das Modell.
  - **Berechtigungsmodus**:
    - **Wie ausgewählt** (die Standardeinstellung): behält den auf der Startseite gewählten Modus.
    - **Fragen** vor Dateiänderungen und Befehlen;
    - **Änderungen akzeptieren** für freie Dateibearbeitung, Rückfragen vor Befehlen;
    - **Voller Zugriff** ohne Rückfragen;
    - **Plan** nur zum Lesen und Planen bis zur Freigabe.

    Claude Code, Codex und Custom verwenden jeweils passende Modi. Andere Programme wie Gemini CLI oder OpenCode behalten ihre eigenen.
  - **Subagenten, die er startet**: **Beliebig** oder nie über einer Stufe.
  - **Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln**: eingeschaltet, solange du es nicht ausschaltest.
- **Werkzeuge**: **Erlaubte Werkzeuge** (sieben Schalter, bei einem neuen Agenten alle eingeschaltet, mit **Alle aktivieren**, wenn einige ausgeschaltet sind; siehe unten), **Bevorzugte Skills** (siehe unten) und **Verbundene Apps**, sobald Konten verbunden sind (siehe unten).
- **Team**: **Andere Agenten dürfen ihm Arbeit übergeben** und **Er darf Arbeit übergeben an** mit einem Schalter für jeden anderen Agenten (siehe [Agenten, die Arbeit an andere Agenten übergeben](#agents-that-hand-work-to-other-agents)).
- **Ergebnisse**: was er zurückgibt: die Felder jedes Ergebnisses und wohin jedes geht (siehe [Was ein Agent übergibt](#what-an-agent-hands-back)).
- **Budget**: **Keine Begrenzung** oder **Ein Monatslimit** in Dollar; bei einem vorhandenen Agenten steht dort, was er diesen Monat ausgegeben hat (siehe [Monatsbudget](#a-monthly-budget)).

**Agent erstellen** legt einen neuen Agenten an. Bei einem vorhandenen Agenten übernimmt **Speichern** deine Änderungen („*Name* ist gespeichert“), **Abbrechen** schließt das Fenster ohne Speichern; schließt du es nach einer Änderung, fragt es zuerst **Deine Änderungen verwerfen?**.

### Verfügbare Werkzeuge

Die fünf Schalter umfassen:

- **Dateien lesen**: öffnen, auflisten und durchsuchen.
- **Dateien erstellen und ändern**: neue Dateien schreiben und bestehende bearbeiten.
- **Befehle ausführen**: lokale Programme und Skripte.
- **Web verwenden**: suchen und Webseiten lesen.
- **Nutze einen Browser**: Websites öffnen, klicken und Formulare ausfüllen in einem echten Browser.
- **Nutze den Computer**: den Bildschirm sehen und Maus und Tastatur in jeder App verwenden (die Desktop-Apps, mit eingeschaltetem Computer Use).
- **Andere Werkzeuge**: MCP-Server (Werkzeug-Server) und Plugins, die für die Agenten eingerichtet sind.

Die Wirkung ausgeschalteter Gruppen hängt vom Programm ab:

- Bei **Claude Code und Custom** sind diese Werkzeuge ausgeschaltet. Ist **Andere Werkzeuge** aus, bekommt Claude Code nur die eigenen Werkzeuge der App und deine verbundenen Konten, keinen der MCP-Server, die du selbst eingerichtet hast.
- **Codex** wird angewiesen, sie nicht zu verwenden. Ist **Web verwenden** aus, ist auch seine eigene Websuche ausgeschaltet. Ist **Befehle ausführen** aus, aber **Dateien lesen** an, wird Codex angewiesen, seine Shell nur zum Lesen und Durchsuchen von Dateien zu nutzen, da er Dateien über die Shell liest.
- **Claude Code, Codex und Custom** haben außerdem die Werkzeuge für Browser und Computer ausgeschaltet, wenn **Nutze einen Browser** oder **Nutze den Computer** aus ist.
- **Andere Agenten** erhalten entsprechende Nutzungsverbote als Anweisung.

Die eigenen Werkzeuge der App (Seiten, Memory und dergleichen) bleiben an, außer denen, die unter einen Schalter fallen, den du ausgeschaltet hast: Ist **Web verwenden** aus, entfallen auch die Websuche und das Lesen von Seiten der App; ist **Nutze einen Browser** aus, entfällt ihr Browser; ist **Nutze den Computer** aus, entfallen ihre Werkzeuge für Bildschirm, Maus und Tastatur; ist **Dateien lesen** aus, entfällt ihr Dokumentenleser. Verbundene Konten sind keine „anderen Werkzeuge“: Darüber entscheiden die **Verbundenen Apps** weiter unten. Braucht eine Aufgabe etwas, das der Agent nicht verwenden kann, soll er das sagen, statt sich anders zu behelfen.

### Bevorzugte Skills

Gib unter **Werkzeuge** einen Skill-Namen ein und drücke Enter oder Komma. Vorschläge stammen aus den eigenen Claude-Code- und Codex-Skills, wie [Einstellungen → Agenten → Skills](/settings?s=skills) sie für den in Dateien geöffneten Ordner zeigt. Auch Bibliotheksnamen wie research sind erlaubt. Der Papierkorb entfernt Einträge. Höchstens 30 sind möglich. Passt einer zur Aufgabe, lädt und befolgt der Agent ihn vor Arbeitsbeginn. Siehe [Skills](/guide/skills) für mitgelieferte und zusätzliche Skills.

### Verbindungen

**Verbundene Apps** unter **Werkzeuge** erscheint nur bei unter [Apps → Verbundene Apps](/apps/connected) eingerichteten Konten. Ihr Schalter aktiviert sie in Agentensitzungen. Global aktivierte Konten zeigen stattdessen „Für jede Sitzung aktiviert“. Nicht mehr verbundene Konten stehen mit „Nicht verbunden“ unter ihrem Namen und einer Entfernen-Schaltfläche dort. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).

## Einen Agenten bearbeiten

Auf der Seite eines Agenten lesen sich seine Einstellungen als Sätze: was er tut, „Er arbeitet *überall*, *jeden Werktag um 09:00 Uhr* und denkt mit *Quick*. Er darf *Dateien lesen und das Web nutzen* und bittet *keine anderen Agenten* um Hilfe. Er übergibt *seine Antwort*. Er gibt höchstens *3 $* im Monat aus.“ Jeder unterstrichene Teil öffnet, was ihn ändert, und die Änderung wird sofort gespeichert:

- **Arbeitsbereich**: **Überall** oder ein Schalter für jedes Projekt.
- **Ausführungszeitpunkt**: seine Zeitpläne, die jeweils ihren Editor öffnen, **Zeitplan hinzufügen** und **Führt eine dauerhafte Unterhaltung mit eigenem Posteingang**.
- **Verwendete Modellstufe**: Automatisch oder eine Leistungsstufe, **Höchste Modellstufe für die von ihm gestarteten Subagenten** und **Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln**.
- **Erlaubte Werkzeuge**: die sieben Schalter.
- **Wen es um Hilfe bittet**: ein Schalter für jeden anderen Agenten und **Andere Agenten dürfen ihm Arbeit übergeben**.
- **Ergebnisübergabe**: seine Felder und wohin jedes Ergebnis geht.
- **Monatsbudget** oder unbegrenzt.

Der Rest steht unter **Alle Einstellungen** (siehe [Alle Einstellungen](#all-settings)). Jede Änderung wird als Version gespeichert, sodass du zurückgehen kannst (siehe [Versionen: zu einer früheren zurückkehren](#versions-go-back-to-an-earlier-one)). Sitzungen, die du ab jetzt startest, verwenden die neue Version, und ebenso die Sitzungen mit ihm, die schon laufen, ab deiner nächsten Nachricht: Custom liest sie vor jedem Durchgang, und Claude Code und Codex starten neu, sobald sie frei sind (die Unterhaltung läuft weiter).

## Versionen vergleichen und wiederherstellen

Jede Speicherung, die ändert, was einer deiner Agenten ist, erzeugt eine Version: eine Änderung auf seiner Seite, unter **Alle Einstellungen**, über die Kommandozeile, durch einen Agenten, den du darum gebeten hast (über die API der App), und der Entwurf oder die Datei, aus der er entstanden ist. Öffne seine Seite, dann **Mehr** (⋯) → **Versionen**:

- Die Liste zeigt **v1**, **v2** und weitere, neueste zuerst, mit verständlichen Änderungen wie „Verwendet jetzt Best statt Quick. Monatsbudget jetzt 5 statt 3 $“, gegebenenfalls der Änderungsbeschreibung des Agenten, Urheber **Du**, **Agent**, **Entwurf**, **Installiert** oder **Importiert** und Zeitpunkt. **Aktuell** markiert die verwendete Fassung. Prüfbeispiele nennen erfolgreiche Fälle wie „2 von 3 bestanden“, damit Verbesserungen erkennbar werden.
- Klicke eine an, um sie mit der davor zu vergleichen, oder wähle zwei beliebige unter **Vergleichen** … **mit** …: was sich zwischen ihnen geändert hat, in Sätzen, und ihre **Anweisungen** nebeneinander, entfernte Zeilen in Rot und neu eingefügte Zeilen in Grün.
- **Wiederherstellen** macht die gewählte Version wieder zur aktuellen. Sie wird als neue Version gespeichert, die „Version 3 wiederhergestellt.“ sagt, sodass die bisherige in der Liste bleibt und du zu ihr zurückkehren kannst. Agenten, an die er Arbeit übergeben hat, und Projekte, die inzwischen weg sind, werden ausgelassen.

Gespeichert werden die letzten 50 Versionen bis zum Löschen des Agenten. Beispiele sind nicht versioniert und bleiben beim Wiederherstellen aktuell. Bei älteren Agenten ohne Versionen wird ihr bisheriger Zustand bei der ersten Änderung als erste Fassung „Vor Einführung der Versionen“ festgehalten.

## Prüfbeispiele

Mit Beispielen kannst du prüfen, ob einer deiner Agenten nach einer Änderung noch seine Aufgabe erfüllt, so wie die Beispiele einer App. Jedes besteht aus einer Nachricht zum Ausprobieren und dem, was seine Antwort leisten muss. Auf der Seite des Agenten, unter **Beispiele**:

1. **Beispiel hinzufügen**: Gib ihm, wenn du magst, einen Namen, schreibe die **Nachricht für den Testlauf** so, wie du sie dem Agenten schreiben würdest, und füge für alles, was eine gute Antwort leistet, eine Prüfung hinzu. Eine Prüfung ist ein einfacher Satz, etwa „Es benennt beide Pull-Requests“ oder „Es sagt klar, wenn es nichts Neues gefunden hat“, gegen den das Hilfsmodell seine Antwort liest; oder eine Regel zu dem, was er geliefert hat, wie bei der Prüfung einer App: `{{reply}} contains Lisbon` oder, bei einem Agenten, der Ergebnisse übergibt, `{{result.count}} > 0` für eines seiner Felder. **Beispiel speichern**. Ein Agent hat bis zu 10 Beispiele mit jeweils bis zu 8 Prüfungen.
2. **Beispiele testen** (oder die Kolbenschaltfläche neben einem, nur für dieses) sagt zuerst, was passieren wird und was es kostet: wie viele Sitzungen er als der Agent startet und auf welcher Leistungsstufe, was das ungefähr kostet (nach den Kosten seiner letzten Versuche oder den Kosten seiner Sitzungen in diesem Monat; vor dem ersten Versuch gibt es noch nichts, woran man sich halten kann) und was von seinem Monatsbudget übrig ist, auf das die Versuche angerechnet werden. Drücke **Ausprobieren**.
3. Jedes Beispiel läuft als Agent auf seiner Stufe in einer eigenen, nicht gelisteten Sitzung mit leerem temporärem Ordner. Dieser wird nach Speichern des Ergebnisses entfernt, die Unterhaltung bleibt. Es wird nichts versendet: Verbundene Apps halten geplante Sendungen nur als Vorschau fest, und konfigurierte Ergebnisziele werden nicht bedient. Danach werden Kriterien geprüft. Agenten mit Ergebnisfeldern müssen auch ein Ergebnis zurückgeben.

Jedes Beispiel zeigt dann, wie sein letzter Versuch ausgegangen ist: **Bestanden**, wie viele Prüfungen fehlgeschlagen sind, **Nicht abgeschlossen** oder **Wartet auf dich** (seine Sitzung fragt dich etwas: öffne sie), mit Zeitpunkt und Kosten. Klicke eines an, um seine Nachricht zu sehen, jede Prüfung mit dem, was beobachtet wurde (✓ oder ✗), was er übergeben hat, seine Antwort und **Sitzung öffnen**. Wenn du den Agenten änderst, nachdem seine Beispiele zuletzt ausprobiert wurden, weist die Seite mit **Erneut testen** darauf hin. Beispiele laufen nie von selbst.

## Wo ein Agent arbeitet

Ein Agent arbeitet **Überall**, solange du ihm keine Projekte zuweist. Einer, der in einigen Projekten arbeitet:

- wird nur dort angeboten: Das Agentenmenü der Startseite führt ihn auf, wenn eines seiner Projekte ausgewählt ist, und andere Agenten können ihm nur in Sitzungen seiner Projekte Arbeit übergeben;
- arbeitet im Ordner des Projekts, wenn er in einem Projekt arbeitet, mit dem Wissen, dem Memory, den Richtlinien und den Skills des Projekts;
- erscheinen in allen zugeordneten Projekten unter **Agenten**. Siehe [Projekte](/guide/projects).

Wechselst du auf der Startseite zu einem Projekt, in dem der ausgewählte Agent nicht arbeitet, wird der eigene Projektagent oder sonst Allgemein gewählt.

## Wann ein Agent arbeitet: Zeitpläne

Ein Agent arbeitet durch direkt gestartete Sitzungen, delegierte Aufträge oder Zeitpläne. Ein Zeitplan ist eine geplante Aufgabe mit dieser Agentenrolle: zu festen Zeiten, regelmäßig, einmalig, bei Änderungen einer Seite oder eines Feeds oder durch einen Webhook-Aufruf. Siehe [Geplante Aufgaben](/guide/tasks).

- Auf der Seite des Agenten öffnet **Zeitplan hinzufügen** den Aufgabeneditor mit ausgewähltem Agenten und eingetragener Uhrzeit: Gib ihm einen Namen und die Nachricht, mit der jeder Lauf beginnt, und speichere.
- Vorhandene Zeitpläne lassen sich öffnen, ändern, pausieren und sofort ausführen.
- Ein mit dem Agenten entworfener Zeitplan wird bei dessen Erstellung angelegt.

Alle Zeitpläne stehen auch unter [Einstellungen → Agenten → Geplante Aufgaben](/settings?s=tasks). Die Aufgabenoption **Agent** bestimmt die Rolle. [**Zeitpläne**](/agents/schedules) in der Spalte der Agentenseite (auf dem Smartphone ein Tab oben) zeigt die Woche mit allen Aufgaben, Ergebnissen und kommenden Läufen. Listeneinträge nennen **Agent ·** und Namen; der Stift öffnet die Agentenseite.

## Modellstufen eines Agenten

Modellstufen wählen nach Aufgabentyp statt Modellname:

- **Schnell**: günstig für kleine, eindeutige, überprüfbare Aufgaben wie gezielte Änderungen, Faktenextraktion, Sortieren, Formatieren und kurze Zusammenfassungen.
- **Standard**: klare mittelgroße Aufgaben wie vorgegebene Änderungen, Tests, Recherche zu konkreten Fragen und Entwürfe nach Gliederung.
- **Am besten**: der Hauptagent einer Sitzung. Er findet heraus, was verlangt wird, plant, leitet Subagenten und prüft ihre Arbeit.
- **Max**: stärkste Stufe für hartnäckige Fehler, Beweise und Entwürfe mit vielen Bedingungen.

Ein Agent, der auf eine Leistungsstufe eingestellt ist, startet mit dem Modell dieser Stufe für das Programm, auf dem er läuft, außer wenn für die Sitzung ein Modell gewählt wurde; ist er auf **Automatisch** eingestellt (die Standardeinstellung), verwendet er das Modell, das dort gewählt wurde, wo er startet: auf der Startseite, in der geplanten Aufgabe oder beim Agenten, der ihm Arbeit übergibt. Auf der Startseite kann diese Wahl selbst **Automatisch** sein: Best, mit Wechsel zu Max, wenn sich das Problem als zu schwer erweist (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](/guide/agents-models#tiers-a-model-for-each-kind-of-job)).

[Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) sagt, was jede Leistungsstufe bedeutet, in einer Tabelle mit einer Spalte für jedes Programm: bei **Claude Code** ein Modell (zu Beginn Haiku, Sonnet, Opus und das neueste Fable) und ein Aufwand; bei **Codex** ein Modell und ein Aufwand (zu Beginn Luna, Terra, Sol und Astra; bei einem Abo ohne eines davon das nächstliegende, das es anbietet, mit mehr Aufwand für die höhere Stufe, wo sich zwei ein Modell teilen); bei **Custom** eines deiner benutzerdefinierten Modelle oder keines, wodurch das in der Sitzung gewählte Modell bleibt. Eine Leistungsstufe, die du nicht anfasst, folgt dem neuesten Modell dieser Art ihres Programms. **Zurück zu den Standardeinstellungen** stellt sie wieder her.

**Höchste Modellstufe für die von ihm gestarteten Subagenten** begrenzt delegierte Hydor-Modellstufen. Höhere Anforderungen werden auf die Grenze reduziert; außerdem darf kein Subagent über der Stufe seiner Leitung arbeiten. Ein ausdrücklich genanntes Modell wird wie angegeben verwendet.

**Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln** (eingeschaltet, solange du es nicht ausschaltest): Ein Hydor-Subagent, den der Agent auf einer Leistungsstufe startet und dessen Antwort eine kurze Prüfung nicht besteht (das Hilfsmodell liest seinen Auftrag und seine Antwort) oder der mit einem Fehler stoppt, läuft noch einmal eine Stufe höher, höchstens bis Best und nie über der höchsten Stufe, die der Agent erlaubt. Geprüft wird nur seine Antwort auf den Auftrag: Eine spätere Antwort auf eine Nachricht seiner Leitung oder von dir schickt nie die ganze Aufgabe noch einmal durch. Die Leitung erfährt, dass und warum das geschehen ist, und dem neuen Subagenten wird gesagt, warum der erste nicht genügt hat. Auch ein geplanter Lauf des Agenten, der auf seiner Stufe fehlschlägt, läuft noch einmal eine Stufe höher, bis Best. Eine Leitung kann einen Subagenten auch selbst hochstufen, wenn sie das Ergebnis nicht gut genug findet.

## Delegation zwischen Agenten

Agenten können Teile parallel in neuen Hydor-Subagentensitzungen bearbeiten lassen. Siehe [Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten](/guide/research). Sie starten:

- **ein einfacher Subagent**, mit einer Leistungsstufe für seinen Teil: Quick für eine kleine, sehr klare Aufgabe, Standard für eine klare Aufgabe mittlerer Größe (was ein Subagent bekommt, wenn keine verlangt wird), Best für einen schwierigen Teil, der für sich steht;
- **eigene benannte Agenten** mit deren Anweisungen, Tools, Konten, Modus und Stufe. Die Antwort kommt zur beauftragenden Sitzung zurück.

Dabei gilt:

- Integrierte Rollen oder Sitzungen ohne Agenten dürfen alle am Arbeitsort verfügbaren eigenen Agenten beauftragen.
- Ein Agent von dir darf nur an die Agenten Arbeit übergeben, die sein **Team** aufführt.
- Bei deaktiviertem **Andere Agenten dürfen ihm Arbeit übergeben** nimmt ein Agent keine solchen Aufträge an.
- Benannte Agenten bleiben auf ihre Projekte und höchstens die Berechtigungen der beauftragenden Sitzung beschränkt.

In der Unterhaltung erscheinen die Hydor-Subagenten, die ein Durchgang gestartet hat, gemeinsam als eine Karte unter diesem Durchgang, mit einer Zeile für jeden: mit seinem Titel, dem Agenten, als der er arbeitet (oder „Hydor-Subagent“), seiner Leistungsstufe, seinem Programm und Modell, seinem Stand und den Kosten und, wenn er hochgestuft wurde, von welcher Stufe aus und warum (zeige auf die Zeile); ein Klick auf eine Zeile öffnet seine Unterhaltung. Siehe [Subagenten](/guide/sessions#subagents). Der Tab **Agenten** eines Projekts zeigt, welche seiner Agenten Arbeit an welche übergeben.

Ein Agent, der eine eigene Unterhaltung führt, nimmt die Arbeit in seinem Posteingang statt in einer neuen Sitzung an, und seine Antwort kommt, wenn er dazu kommt (siehe [Ein Agent mit einer eigenen Unterhaltung](#an-agent-with-a-conversation-of-its-own)).

## Monatsbudget

Das Monatslimit eines Agenten (**Budget** unter **Alle Einstellungen** oder sein Satz auf seiner Seite) begrenzt die Kosten der Agentensitzungen seit dem Monatsersten in der Zeitzone dieses Computers:

- Jede Sitzung, die als er gestartet wird, bekommt als Ausgabenlimit das, was vom Budget übrig ist (das niedrigere, wenn die Sitzung ein eigenes Limit hat).
- Was seine einfachen Subagenten ausgeben, wird darauf angerechnet; die Arbeit eines benannten Agenten wird auf dessen eigenes Budget angerechnet.
- Bei aufgebrauchtem Budget starten bis zum nächsten Monat keine neuen Sitzungen als dieser Agent. Geplante Aufgaben nennen den Grund; die Karte zeigt **Budget aufgebraucht**.

Kosten werden wie unter [Nutzung und Kosten](/guide/usage) ermittelt. Bei **Keine Begrenzung** gibt es keines.

## Ergebnisse eines Agenten

Ohne Konfiguration liefert der Agent seine Unterhaltungsantwort. Unter **Ergebnisse** (in **Alle Einstellungen**) oder über den entsprechenden Satz kannst du Felder und Ziele festlegen. Nach jeder Aufgabe liefert er dann vor der Zustellung geprüfte Daten:

- **Ergebnisfelder**: je Name und Typ wie Text, Langtext, Zahl, Ja/Nein, Datum, Link, Liste oder Tabelle mit Spalten sowie Pflichtstatus. Der Agent füllt sie über `hand_back`. Unpassende Ergebnisse werden mit Korrekturhinweisen zurückgegeben.
- **Ergebnisziele** zusätzlich zur Unterhaltung:
  - **Eine behaltene Seite**: Standard ist **Dieselbe Seite, aktualisiert**. Der erste Lauf erstellt eine nach dem Agenten benannte Seite in seinem Projekt, falls vorhanden. Weitere Läufe speichern neue Versionen; ältere bleiben im Verlauf. Eigene Umbenennungen bleiben erhalten. **Bei jedem Lauf eine neue Seite** erstellt stattdessen jeweils eine mit Agentenname und Datum. Vor Einführung dieser Auswahl erstellte Agenten behalten dieses Verhalten.
  - **Eine Zeile in einer Tabelle**: Jeder Lauf ergänzt dieselbe Tabelle um **Datum** und Felder in konfigurierter Reihenfolge. Zahlen, Daten und Links behalten passende Typen, damit Formeln und Diagramme funktionieren; Listen und Tabellen werden lesbarer Zelltext wie „Milch; Eier“. **Neue Tabelle** erstellt beim ersten Lauf eine nach dem Agenten benannte Tabelle. Alternativ wählst du eine vorhandene samt Blatt; fehlende Blätter werden angelegt. Siehe [Eine Tabellenzeile](#a-row-in-a-spreadsheet).
  - **Eine E-Mail**: das Ergebnis als E-Mail an die Personen, die du nennst (eine Adresse oder mehrere), mit einem Betreff (`{date}`, `{time}` und `{agent}` werden ersetzt; leer gelassen, gelten der Name des Agenten und der Tag), von einem deiner verbundenen Mailkonten (**Von**; das erste, wenn du keines auswählst; siehe [Verbundene Apps, Keys und Werkzeuge](/guide/connections#connect-your-email)). Sie liest sich in jedem Mailprogramm gut, jedes Feld unter seinem Namen, Tabellen als Tabellen. Da du die Personen hier selbst gewählt hast, wird sie gesendet, sobald jedes Ergebnis bereit ist, ohne im Postausgang zu warten.
  - **Benachrichtigung** mit der ersten Ergebniszeile;
  - **Eine Datei im Arbeitsordner des Agenten**, etwa `reports/{date}.md`, mit `{date}`, `{time}` und `{agent}`. `.json` schreibt JSON, andere Endungen Markdown. Der Pfad darf den Arbeitsordner nicht verlassen;
  - **Webhook** als JSON-POST an eine HTTPS-Adresse, bei angegebenem Tresor-Key signiert und auf dessen erlaubte Hosts begrenzt. Siehe [Verbundene Apps, Keys und Tools](/guide/connections).

Was du in diese Felder eingibst, gilt, sobald du das Feld verlässt oder Enter drückst. Die Einstellungen zeigen die Seite und die Tabelle, die sein erster Lauf erstellt hat, mit einem Link zum Öffnen.

### Eine Tabellenzeile

Die Spalten werden an ihren Überschriften in der ersten Zeile der Tabelle erkannt, daher kannst du die Tabelle weiter selbst anordnen: Spalten verschieben, sie umformatieren (eine Spalte, die du als Euro formatierst, bleibt in Euro) und eigene Spalten daneben ergänzen. Eine Formel in einer eigenen Spalte (etwa eine laufende Summe) wird in jede neue Zeile übernommen, wie in der Tabelle einer Tabellenkalkulation, und ein Diagramm, das die bisherigen Zeilen liest, nimmt auch die neue auf. Summen unter der Tabelle stören neue Zeilen: Lege sie in eine eigene Spalte oder auf einen anderen Tab, über ganze Spalten (`=SUM(B:B)`). Wenn du dem Agenten später ein Feld hinzufügst, bekommt es am Ende eine neue Spalte, und die alten bleiben, wo sie sind; eine Überschrift, die du umbenennst, passt nicht mehr zu ihrem Feld, das dann eine neue Spalte bekommt (nenne das Feld genauso, damit beide zusammenbleiben). Die Zeile jedes Laufs ist eine neue Version der Tabelle, wie jede Änderung, daher bleiben ihre Formeln, Diagramme und Kommentare, wie sie waren.

### Ergebnisverlauf

**Ergebnisse** auf der Agentenseite zeigt neueste Resultate zuerst, mit Zeitpunkt, Spalten je Feld und **Übermittelt an** mit Symbolen je Ziel. Zustellfehler sind rot; Darüberfahren erklärt den Status, ein Symbol für eine behaltene Seite öffnet sie. Ein Klick auf die Zeile zeigt das gesamte Ergebnis und **Sitzung öffnen**. Die Tabelle scrollt; **Ältere anzeigen** lädt weitere. Ergebnisse bleiben ein Jahr, höchstens 500 Einträge, also bei täglicher Ausführung ein Jahr, bei stündlicher etwa drei Wochen. Zu lange Felder werden gekennzeichnet und sind an den Zustellzielen vollständig vorhanden. Oberhalb stehen Links zur Seite und zur Tabelle, die er füllt.

## Ein Agent mit eigener Unterhaltung

Üblicherweise starten Agenten pro Auftrag eine Sitzung. **Führt eine dauerhafte Unterhaltung mit eigenem Posteingang** unter **Alle Einstellungen** bei **Wo und wann** oder unter Auslösern erstellt stattdessen bei Bedarf einmalig eine dauerhafte Unterhaltung, bei genau einem zugeordneten Projekt in dessen Ordner:

- Nachrichten an ihn warten in seinem **Posteingang** und kommen nacheinander in seine Unterhaltung, jede erst, wenn die vorherige ihre Antwort hat: was du von seiner Seite sendest und was andere Agenten ihm übergeben.
- Seine geplanten Läufe schreiben in dieselbe Unterhaltung und warten, bis ein laufender Durchgang zu Ende ist; jeder erscheint im Verlauf seines Zeitplans, wie jeder Lauf.
- Antworten gehen zum Absender zurück: andere Agenten erhalten Nachrichten, du eine Benachrichtigung.
- Die Unterhaltung behält ihren bisherigen Kontext.
- Das Monatsbudget wird bei jeder eingehenden Nachricht geprüft.

Der **Posteingang** auf der Agentenseite zeigt **Wartet**, **Wird bearbeitet**, **Beantwortet** oder **Keine Antwort**, die jeweilige Antwort, ein Nachrichtenfeld und **Seine Unterhaltung** zum Öffnen.

## Eine Sitzung als bestimmter Agent starten

1. Öffne die [Startseite](/). Unter dem Nachrichtenfeld zeigt eine Zeile, wer die Arbeit macht: das Programm, das Modell, der Ordner und der **Agent**-Chip, der den aktuell gewählten Agenten nennt.
2. Öffne **Agent**. Unter **Starten als** stehen zuerst integrierte Rollen, dann unter **Eigene** projektübergreifende und zum gewählten Projekt passende eigene Agenten.
   - Am Computer stehen die Namen in einem Raster, zwei pro Zeile. Fahre mit der Maus über einen, um unter dem Raster seine Zeile zu sehen: seine Beschreibung und, wenn er ein Programm vorschlägt, „Verwendet“, gefolgt von diesem Programm und seinem Modell.
   - Auf dem Smartphone öffnet sich das Menü als Blatt vom unteren Bildschirmrand und listet jeden Agenten mit seiner Zeile auf.
3. Wähle den Agenten, schreibe den Auftrag und drücke Enter oder **Starten**.

**Agenten erstellen oder ändern** unten öffnet die [Agentenseite](/agents). **Sitzung starten** auf einer Agentenseite öffnet die vorausgewählte Startseite.

Die Auswahl bewirkt:

- **Programm, Modell und Berechtigungen**: Schlägt der Agent ein Programm vor, wechselt die Startseite zu diesem, mit dem Modell seiner Leistungsstufe, wenn er mit einer denkt, sonst mit dem Modell des Agenten, wenn er eines nennt. Hat er einen Berechtigungsmodus, wechseln die **Berechtigungen** der Startseite (unter **Optionen**) auf den passenden Modus dieses Programms. Du kannst jedes davon vor dem Start noch ändern.
- **Verbindungen**: die für den Agenten aktivierten Konten gelten in der neuen Sitzung.
- **Ordner**: Ohne deine eigene Auswahl entscheidet der Agent. Die meisten verwenden **Neuer Aufgabenordner**, Programmierer und entsprechend konfigurierte Agenten den angezeigten Ordner. Innerhalb eines Projekts bleibst du dort. Bei Ordnerwechsel werden dessen gespeicherte Einstellungen mit dem neu gewählten Agenten geladen.

Die Startseite merkt sich den Agenten für jeden Ort (jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**) auf jedem Gerät, das du benutzt, zusammen mit den übrigen Auswahlen des Ortes. Ein Ort, an dem du noch keinen gewählt hast, öffnet sich mit dem eigenen Agenten des Projekts, wenn das Projekt einen hat, sonst mit Allgemein. Ein Agent, den es nicht mehr gibt oder der im gewählten Projekt nicht arbeitet, weicht ebenfalls diesem Standard.

Wählst du im Ordnermenü ein Projekt, öffnet sich das Feld mit den Auswahlen dieses Projekts; in einem Projekt, in dem du noch nichts gewählt hast, gehört dazu der Agent, als der das Projekt seine Sitzungen startet, wenn es einen hat (siehe [Projekte](/guide/projects)).

## Agenten innerhalb einer Sitzung wechseln

Das Nachrichtenfeld einer Sitzung zeigt den Agenten, als der sie arbeitet, und du kannst jederzeit zu einem anderen wechseln: etwa von **Forscher** zu **Schriftsteller**, sobald die Fakten vorliegen.

1. Der Agent ist die erste Zeile der **Optionen**-Auswahl unter dem Nachrichtenfeld und steht im Namen vorne, etwa „Forscher · Opus 5.5“.
2. Öffne sie und wähle unter **Wechseln zu** einen anderen Agenten. Die Auswahl entspricht der Startseite, am Computer als Raster, am Smartphone von unten.
3. Die App meldet „Ab deiner nächsten Nachricht arbeitet der Agent als *Name*“.

Ab deiner nächsten Nachricht arbeitet die Sitzung als der neue Agent, und die Unterhaltung geht weiter:

- Das Programm erhält die Wechselanweisung mit deiner Nachricht, unsichtbar in der Unterhaltung.
- **Claude Code und Codex** lesen ihre Anweisungen beim Start. Ist die Sitzung frei, startet ihr Programm deshalb vor deiner Nachricht neu, mit den Anweisungen und Grenzen des neuen Agenten; diese Nachricht dauert dann einen Moment länger. Mitten in einem Durchgang oder während es auf ein Ziel hinarbeitet oder Arbeit im Hintergrund hat, bekommt es die neuen Anweisungen stattdessen mit deiner Nachricht und startet bei einer späteren Nachricht neu, sobald es frei ist.
- **Custom** liest vor jedem Durchlauf neu. Andere Programme wie Gemini CLI und OpenCode erhalten die Anweisungen mit deiner Nachricht.
- Die verbundenen Konten, die der neue Agent einschaltet, sind in der Sitzung eingeschaltet, anstelle derer des vorherigen; was du selbst für die Sitzung ein- oder ausgeschaltet hast, bleibt. Hat er einen Berechtigungsmodus, wechselt die Sitzung auf den passenden Modus, und auf sein Modell, wenn er das eigene Programm der Sitzung vorschlägt. Das Programm selbst bleibt gleich: Wie du die Unterhaltung in ein anderes verlegst, steht unter [Mit einem anderen Agenten fortsetzen](/guide/sessions#continue-in-another-agent).

Eine Sitzung, die ohne Agent gestartet wurde (in VS Code oder einem Terminal oder bevor es Agenten in der App gab), zeigt dort **Kein Agent**: Wähle einen, um ihr einen zu geben. Auch das Menü der Sitzung (⋯) → **Sitzungseinstellungen** → **Agent** nennt ihn; ein Klick darauf öffnet die Seite des Agenten.

## Die Sitzungen eines Agenten finden

Eine Sitzung, die als anderer Agent als der übliche gestartet wurde, sagt das in der Seitenleiste: Die zweite Zeile ihres Eintrags beginnt mit dem Symbol und dem Namen des Agenten („Planner · web-agent · 5 T.“ oder „Researcher · Arbeitet · 2 Min. 10 Sek.“, solange sie arbeitet). Der übliche Agent ist bei einer Sitzung in einem Projekt mit eigenem Agenten dieser Agent (**Neue Sitzungen starten mit** in den Details des Projekts), bei jeder anderen Sitzung General. Außerhalb von Hydor gestartete Sitzungen und inzwischen gelöschte Agenten werden ebenfalls nicht genannt. Der Filter und die Suche richten sich nach dem Agenten, als der jede Sitzung wirklich gestartet wurde, auch dem üblichen. So siehst du nur die Sitzungen eines Agenten:

- Klicke oben in der Seitenleiste auf **Sitzungen filtern und gruppieren** und wähle den Agenten unter **Agent**. Das Menü listet die Agenten, als die deine Sitzungen gestartet wurden, die meistgenutzten zuerst (bis zu acht), jeweils mit der Zahl ihrer Sitzungen; **Alle Agenten** zeigt wieder alle Sitzungen. Der Abschnitt erscheint, sobald eine Sitzung als Agent gestartet wurde.
- Oder öffne die Seite des Agenten und klicke neben **Letzte Sitzungen** auf **Alle 23 in der Seitenleiste anzeigen** (bei höchstens acht Sitzungen steht dort **In der Seitenleiste anzeigen**). Das öffnet die Startseite, und die Seitenleiste zeigt nur die Sitzungen dieses Agenten, andere Filter sind zurückgesetzt; auf dem Smartphone öffnet sich das Menü.
- Oder gib den Namen des Agenten in die Suche ein (Strg+K): „Tutor“ findet die als Tutor gestarteten Sitzungen. General bleibt dabei außen vor, da es die meisten Sitzungen sind. Die Vorschau einer Sitzung nennt dort den **Agent**.

Solange ein Filter aktiv ist, nennt ihn ein Chip unter **Neue Sitzung** mit seinem Symbol: Ein Klick auf sein × zeigt wieder alle Sitzungen. Der Agentenfilter wirkt zusammen mit den anderen (**Ausführungsumgebung** und **Projekt**), etwa die Sitzungen eines Agenten in einem Projekt. Wird der Agent gelöscht, zeigt die Liste wieder alle Sitzungen. Siehe [Die Seitenleiste](/guide/start#the-sidebar).

## Einen Agenten duplizieren oder löschen

Auf der Agentenseite:

- **Duplizieren** (bei jedem Agenten): öffnet das Fenster bei **Einrichten** als neuen Agenten mit allem ausgefüllt und dem Namen „*Name* (Kopie)“. Ändere, was du willst, und klicke auf **Agent erstellen**; seine Seite öffnet sich. So machst du deine eigene Version eines integrierten Agenten.
- **Löschen** (nur deine eigenen): fragt zuerst „*Name* löschen?“. Sitzungen, die als dieser Agent gestartet wurden, laufen ohne seine Anweisungen weiter; seine Zeitpläne bleiben als gewöhnliche geplante Aufgaben; Agenten, die ihm Arbeit übergeben könnten, führen ihn nicht mehr auf. Projekte, die ihre Sitzungen als er gestartet haben, werden davon befreit: Ihre Sitzungen starten wieder als Allgemein (oder als der Agent, den du wählst). Sein Ergebnisverlauf geht mit ihm; die Seiten und Tabellen, die er gefüllt hat, bleiben dort, wo sie behalten wurden.

Auch die Suche per Strg+K beziehungsweise ⌘K findet Agenten nach Name und Beschreibung und öffnet ihre Seite.

## Agenten als Datei teilen

Ein eigener Agent lässt sich als einzelne Datei aufbewahren oder an andere Hydor-Nutzer weitergeben.

- **Einen herunterladen**: Öffne seine Seite, dann **Mehr** (⋯) → **Als Datei herunterladen**. Auch integrierte Agenten lassen sich herunterladen, um sie als eigenen zu installieren. Die Datei (`.hydor-agent`) enthält seine Anweisungen, was er benutzen darf, seine Leistungsstufe, sein Programm und Modell, die Skills, die er bevorzugt, seinen Berechtigungsmodus, sein Budget und weitere Einstellungen, die Agenten, denen er Arbeit übergibt (mit Namen), was er zurückgibt und die Arten von Orten, an die seine Ergebnisse gehen, seine Zeitpläne, die nach der Uhr laufen (als Vorschläge), und seine Beispiele. Nichts von dir kommt hinein: Die Projekte, in denen er arbeitet, die verbundenen Konten, die er nutzt, die Seite und die Tabelle, in die seine Ergebnisse gingen, an wen seine Ergebnisse per E-Mail gehen und von welchem Konto, sowie die Adresse und der Key seines Webhooks bleiben draußen, und seine Zeitpläne, die bei einer Überwachung, einem Webhook oder einem Datum starten, bleiben hier. Die Datei listet in Worten auf, was ausgelassen wurde, damit du es neu einstellst.
- **Einen installieren**: Öffne auf der [Agentenseite](/agents) **Neu** und wähle **Agent aus Datei installieren** (auf dem Smartphone drückst du auf **Installieren**), dann auf **Datei auswählen** und wähle eine `.hydor-agent`-Datei (oder ziehe sie dorthin). Bevor etwas gespeichert wird, zeigt eine Karte sie: seinen Namen und seine Zeile, **Enthaltene Funktionen** (seine Anweisungen, was er benutzen darf, seine Leistungsstufe, was er zurückgibt, seine Beispiele, seine vorgeschlagenen Zeitpläne), **Was du dafür bereitstellen musst** (was ausgelassen wurde und die Agenten, denen er Arbeit übergibt und die du nicht hast) und **Anweisungen des Schritts** zum Lesen. Ein Agent von dir mit demselben Namen bleibt unberührt: Der neue wird daneben als „Name (2)“ installiert, es sei denn, du wählst **Meinen Agenten ersetzen**; das macht deinen zu diesem, als neue Version (der bisherige Stand bleibt in seinen **Versionen**, und deine Beispiele bleiben, nach denen der Datei). **Vorgeschlagene Zeitpläne pausiert hinzufügen** fügt seine Zeitpläne hinzu, ausgeschaltet, bis du sie einschaltest. Drücke auf **Installieren**, und seine Seite öffnet sich.

Manches ändert sich auf dem Weg hinein, und die Karte sagt, was: Ein Agent, der vor dem Handeln nie nachfragte (**Voller Zugriff**), startet mit **Änderungen akzeptieren**, ein Programm, das hier nicht eingerichtet ist, weicht dem auf der Startseite gewählten, und eine Datei aus einem neueren Hydor bringt mit, was dieses kennt (aktualisiere Hydor für den Rest). Eine Datei, die keine Agentendatei oder beschädigt ist, wird mit dem Grund abgelehnt; die Datei einer App wird stattdessen auf der [Apps-Seite](/guide/apps#share-an-app-as-a-file) installiert, und die Agentendateien von Claude Code kommen mit **Importieren** herein (siehe unten).

## Claude-Code-Agentendateien importieren

Claude Code kann eigene Agenten als Markdown-Dateien in einem Ordner `.claude/agents` führen: ein kurzer Kopf mit Name, Beschreibung, Modell und Tools des Agenten und darunter seine Anweisungen. Die App macht aus diesen Dateien Agenten von dir, sodass jedes Programm hier so arbeiten kann.

1. Öffne die [Agentenseite](/agents), dann **Neu** und **Claude Code-Agentendateien importieren** (auf dem Smartphone klickst du oben auf **Importieren**).
2. **Claude-Code-Agenten importieren** zeigt persönliche Dateien aus `~/.claude/agents` unter **Eigene** sowie `.claude/agents` im auf der [Dateien-Seite](/files) geöffneten Ordner unter **Dieser Ordner**. Öffne für Projektagenten dort zuerst das Projekt.
3. **Importieren** neben einer Datei macht den Agenten auf Agentenseite und Startseite verfügbar.
4. Für eine Datei an einem anderen Ort klicke auf **Datei auswählen** („Oder eine Agentendatei von diesem Gerät“) und wähle die `.md`-Datei.

Die Datei muss Markdown (`.md`) und höchstens 256 KB groß sein. Das übernimmt die App daraus:

| Agentendatei | Agenteneinstellung |
|---|---|
| `name` (oder der Dateiname, wenn es keinen gibt) | **Name**: „code-reviewer“ wird zu „Code reviewer“ |
| `description` | **Eine Zeile dazu**: ihr erster Satz, ohne die Beispiele |
| `model` | **Ausführungsumgebung**: Claude Code und Modell; „inherit“ behält die Startseitenauswahl |
| `tools` | **Erlaubte Werkzeuge** nach Gruppen; ohne tools sind alle erlaubt |
| `permissionMode` | **Berechtigungsmodus**: default → Nachfragen, acceptEdits → Änderungen erlauben, bypassPermissions → Vollzugriff, plan → Plan |
| `skills` | **Bevorzugte Skills** |
| Text unter den Kopfzeilen | **Anweisungen** |

Das Symbol wird nach Name und Beschreibung des Agenten gewählt (ein Teleskop für Forschung, ein Stift für Schreiben, Code für Prüfen und Testen und so weiter). Importierte Agenten arbeiten im Ordner der Startseite, wie die Agenten von Claude Code in einem Projekt arbeiten.

Eine importierte Datei zeigt in der Liste **Aktualisieren** statt **Importieren**. **Aktualisieren** liest die Datei erneut in denselben Agenten ein: Seine Felder werden wieder die der Datei, und nur das Symbol, das du gewählt hast, bleibt. Eine Datei von deinem Gerät zu wählen, macht immer einen neuen Agenten.

## Aufgabenordner für Aufträge ohne eigenen Arbeitsort

Viele Aufgaben gehören in keinen Ordner: ein Reiseplan, ein Brief, eine Frage. Dafür zeigt der Ordner-Chip auf der Startseite **Neuer Aufgabenordner**, und wenn du auf **Starten** drückst, legt die App für die Sitzung einen frischen Ordner an, benannt nach dem Tag und einigen Wörtern deiner Nachricht, etwa `~/Hydor/2026-10-31-plan-trip-lisbon`. Der Agent speichert seine Arbeit dort, und du findest sie wieder unter [Dateien](/files).

Der Name besteht aus:

- Datum in deiner Zeitzone;
- höchstens fünf Nachrichtenwörtern, ohne kurze Füllwörter, Links und führenden `/command`, ohne Akzente. Dieser Teil des Namens umfasst höchstens 40 Zeichen. Ohne verwertbare Wörter gilt `task`;
- bei Namenskonflikten `-2`, `-3` und weiteren Nummern.

### Aufgabenordner oder eigenen Ordner wählen

Im Startseiten-Ordnermenü:

- erstellt **Neuer Aufgabenordner** mit „Neu in ~/Hydor“ je Sitzung einen neuen;
- verwendet ein ausgewähltes Projekt, zuletzt benutzter oder über **Durchsuchen**, Namen oder Pfad gefundener Ordner stattdessen diesen Ort. Siehe [Projekte](/guide/projects) und [Sitzungen](/guide/sessions).

Bis du wählst, entscheidet der Agent: Die integrierten außer Programmierer und deine eigenen, die auf „Ein neuer Aufgabenordner“ gestellt sind, nutzen einen Aufgabenordner; Programmierer und Agenten, die auf „Der Ordner auf der Startseite“ gestellt sind, nutzen den gezeigten Ordner, und ein Agent, der in einem Projekt arbeitet, nutzt dieses Projekt. Die Startseite merkt sich, was du gewählt hast. Wählst du einen anderen Agenten, geht die Entscheidung wieder an ihn zurück, es sei denn, du hast seit dem Öffnen der Seite einen Ordner gewählt oder bist in einem Projekt. Ändert sich der Ordner, zeigt das Feld die für diesen Ort gemerkten Auswahlen, mit dem Agenten, den du gewählt hast.

Aufgabenordner werden nicht in den zuletzt verwendeten Ordnern aufgeführt. Per Sprachmodus gestartete Sitzungen nutzen sie ebenfalls, sofern zuletzt kein konkreter Ordner oder Projekt gewählt war. Siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice).

### Aufgabenordner verschieben

1. Finde in [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Task%20folders) **Aufgabenordner** in der Gruppe **Aufgaben** (sein (i) sagt, dass eine Sitzung, die ohne Ordner gestartet wird, hier einen neuen bekommt, benannt nach dem Tag und der Aufgabe, und dass Programmierer stattdessen in dem Ordner arbeitet, den du wählst).
2. Klicke auf den Pfad. Gib unter **Arbeitsordner** einen absoluten oder mit `~` beginnenden Pfad ein; Vorschläge zeigen passende und zuletzt genutzte Ordner. **Diesen Ordner verwenden** übernimmt.

Neue Aufgabenordner entstehen von da an dort; schon angelegte Ordner bleiben, wo sie sind. **Zurück zu ~/Hydor** erscheint, sobald du es geändert hast, um zum Standard zurückzukehren. Die Zeile darunter zeigt, wie neue aussehen. Neue Projekte, die einen eigenen Ordner bekommen, bekommen ihn auch hier, in einem Ordner **Projekte** darin (siehe [Projekte](/guide/projects)).

## Nach Aufgaben aufräumen

[Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Clean%20up%20after%20a%20task) hat in der Gruppe **Aufgaben** einen Schalter: **Nach Aufgaben aufräumen** (sein (i) sagt, was der Agent entfernt). Er ist eingeschaltet, solange du ihn nicht ausschaltest, und gilt für jede Sitzung, als welcher Agent sie auch arbeitet.

Als letzten Schritt entfernt ein Agent dann selbst erzeugte, nicht mehr benötigte Zwischenprodukte:

- Test- und Entwurfsdateien, temporäre Ordner und Daten, Debug-Ausgaben und Screenshots;
- Git-Branches, Worktrees (zusätzliche Kopien eines Repositorys, jede auf einem eigenen Branch) und Stashes, die er angelegt hat und die zusammengeführt oder aufgegeben sind;
- gestartete Prozesse, Server und Container, sofern du sie nicht weiterlaufen lassen möchtest.

Beauftragte Ergebnisse und noch zu prüfende oder zusammenzuführende Arbeit bleiben erhalten, etwa nicht gemergte Commits. Fremde Inhalte werden nie entfernt. Bei großen oder unklaren Objekten wie Downloads oder gemeinsam genutzten Ressourcen fragt er vorher. Er benennt jedes Objekt statt nach Mustern zu löschen und erklärt kurz Entferntes und Behaltenes. Der mitgelieferte clean-up-Skill beschreibt das Verfahren. Siehe [Skills](/guide/skills).

Ausgeschaltet bleiben Zwischenprodukte liegen. Änderungen gelten ab der nächsten Sitzung, bei Custom ab der nächsten Nachricht.

## Weitere Einsatzorte

- **Projekte**: Ein Projekt kann festlegen, als welcher Agent seine Sitzungen starten („Seine Sitzungen starten als“); wenn du das Projekt auf der Startseite wählst, wird er mitgewählt. Sein Tab **Agenten** zeigt die Agenten, die darin arbeiten. Siehe [Projekte](/guide/projects).
- **Apps**: Eine App kann einen **Agent** nennen, und ihre Läufe starten als er (Läufe von einer öffentlichen Seite nicht); die Agentenschritte einer App können je einen nennen. Siehe [Apps](/guide/apps).
- **Geplante Aufgaben** verwenden ihre **Agent**-Auswahl. Aus einer Sitzung erstellte Aufgaben übernehmen deren Rolle. Siehe [Geplante Aufgaben](/guide/tasks).
- **Freihändige Sprachsteuerung**: Sitzungen, die du per Sprache startest, starten an dem Ort, der zuletzt auf der Startseite gewählt wurde, mit dessen Auswahlen, als der Agent, der dort gewählt ist (sonst der eigene Agent des Projekts, sonst Allgemein).

## Einen Agenten fragen

- „Erstelle Paper scout: werktags um 8 Uhr neue Fachartikel zu meinen Themen suchen und die fünf besten auf einer Seite behalten, auf Quick.“
- „Erstelle einen Agenten namens Buchhalter, der meine Haushaltskonten in einer Tabelle führt, keine Befehle ausführen kann und höchstens 5 $ im Monat ausgeben darf.“
- „Lass Release manager an Translator und Test runner delegieren.“
- „Beschränke Translator auf das Projekt Hydor.“
- „Ordne Quick für Claude Code Haiku und für Custom mein lokales Qwen-Modell zu.“
- „Deaktiviere Max für schwierige Probleme, damit automatische Sitzungen auf Best bleiben.“
- „Importiere meine Claude-Code-Agentendatei ~/.claude/agents/code-reviewer.md als Agenten.“
- „Welche Agenten habe ich, welche Modelle verwenden sie und was haben sie diesen Monat gekostet?“
- „Lass Paper scout Fachartikel mit Titel, Link und Bedeutung als Liste auf einer behaltenen Seite und als Benachrichtigung liefern.“
- „Lass meinen Buchhalter jeden Freitag eine Zeile mit den Ausgaben dieser Woche und ihren größten Posten in meine Tabelle Haushaltsbudget eintragen.“
- „Lass meinen Agenten Wochenbericht jeden Montag seinen Bericht per E-Mail an maria@example.com senden, mit dem Betreff Wochenbericht {date}.“
- „Welche Ergebnisse hat Buchhaltung diesen Monat geliefert und welche Summe ergibt sich?“
- „Welche Agenten laufen morgen früh automatisch und wann?“
- „Lass Docs keeper eine Unterhaltung beibehalten und sende: Aktualisiere den Leitfaden zur neuen Agentenseite.“
- „Wechsle meine Sitzung zur Lissabon-Reise zum Agenten Planer.“
- „Was hat sich bei Paper scout diese Woche geändert? Stelle die Fassung vor Montag wieder her, falls deren Beispiele besser abschnitten.“
- „Gib meinem Agenten Wochenbericht zwei Beispiele, eines für eine ruhige und eines für eine volle Woche, mit dem, was ein guter Bericht sagen muss, und probiere sie aus.“
- „Lade Buchhaltung als Datei herunter und erkläre nötige Neueinstellungen auf meinem Laptop.“
- „Lege Aufgabenordner künftig unter ~/Documents/Tasks an.“
