# Apps

Eine App ist eine wiederholbare Aufgabe: Du füllst ein kurzes Formular aus, wählst Ausführen und ein Agent erledigt die Arbeit. Das Ergebnis erscheint in einer passenden Ansicht mit interaktiven Seiten, Karten, Diagrammen, Bildern und Videos oder als Ergebniskarte mit Tabellen. Hier erfährst du alles über vorgefertigte Apps, Ausführung und Keys, Nutzung durch Agenten, eigene Apps mit Schritten, Ansichten, Dateien, Daten, Memory und Oberfläche, Freigaben per API Key, für Agenten, als öffentliche Seite oder CSV-Stapel sowie Weitergabe als Datei. Verbundene Dienste stehen neben den Apps; siehe [Verbundene Apps, Keys und Tools](/guide/connections).

![Apps: eigene und bereits installierte vorgefertigte Apps](images/apps.webp)

## Was eine App ist

Eine App ist ein kleines Werkzeug für eine klar umrissene Aufgabe. Du beantwortest Fragen, ihre Schritte recherchieren und berechnen, und die Antwort erscheint passend als Karte, Diagramm, Tabelle oder andere Ansicht. Öffne sie auf der Apps-Seite oder beschreibe in einer Sitzung ihren Zweck, damit ein Agent sie dort ausführt. Apps konzentrieren sich bewusst auf eine Art von Frage.

Die App enthält alles außer den von Lauf zu Lauf wechselnden Angaben:

- **Formular**: Fragen vor dem Start, etwa Reiseziel und Anzahl Tage.
- **Auftrag**: Anweisung an den Agenten mit eingesetzten Antworten.
- **Ergebnis**: vom Agenten ausgefüllte Felder wie Zusammenfassung, Liste oder Tabelle. Ohne Ergebnisfelder wird die normale Agentenantwort verwendet.
- **Ausführung**: Agent, Modell, Modus und erlaubte Tools.

Jede Ausführung startet eine Sitzung mit dem ausgefüllten Auftrag. Der Agent arbeitet ohne Rückfragen durch, trifft sinnvolle Annahmen und nennt sie. Dieser Durchgang heißt **Lauf**. Danach kannst du Änderungen verlangen und ein aktualisiertes Ergebnis erhalten.

Öffne die **Apps**-Kachel unten in der Seitenleiste oder [/apps](/apps). Mobil öffnest du zuerst die Seitenleiste. Die Suche mit Strg+K, auf dem Mac ⌘K, findet eigene und vorgefertigte Apps nach Namen.

## Orientierung auf der Apps-Seite

Unter **Apps** gibt es **Agent-Apps** für die hier beschriebenen Aufgaben und **Verbundene Apps** für gemeinsam nutzbare Dienste und deren Keys; siehe [Verbundene Apps öffnen](/guide/connections#open-connected-apps). Beide Tabs nennen ihre Anzahl. **Neue App** unter Agent-Apps bietet **Einem Agenten beschreiben**, **Von Grund auf erstellen** und **Aus Datei installieren**. Darunter:

- **Angeheftet**: große Kacheln deiner häufigsten Apps in eigener Reihenfolge. **Oben anheften** im Karten- oder App-Seitenmenü ergänzt sie, **Lösen** entfernt. Ziehen sortiert, mobil nach Gedrückthalten. Das Kachelmenü bietet auch Nach links und Nach rechts. Bis zu zwölf Apps werden appweit auf allen Geräten gleich gespeichert.
- **App suchen: Wetter, Rezepte, Reise …** durchsucht Namen, Kategorie und Zweck aller eigenen, vorgefertigten, deinstallierten und Baustein-Apps. Alle Suchwörter müssen irgendwo passen; Mehrzahl findet auch Einzahl. Beste Treffer zuerst, Enter öffnet den ersten, Esc leert. Die Suche bleibt beim Scrollen oben. Kategorienchips darunter zählen und filtern; **Alle** steht zuerst.
- **Zuletzt verwendet**: bis zu acht zuletzt gestartete Apps, jede einmal, unabhängig vom Start über Formular, eigene Seite, Oberfläche oder Agentenchat. Karten nennen letzten Auftrag, Zustand und Zeitpunkt und bieten Ergebnis öffnen, bei Rückfragen Antworten, bei laufender Arbeit Verfolgen oder bei Fehler/Abbruch Lauf öffnen. **Erneut ausführen** füllt dieselben Antworten vor. **Letzte Läufe** neben dem Titel klappt bis zu sechs Läufe auf und ist anfangs ein eigener Bereich. CSV- und öffentliche Läufe sowie Apps mit eigener Startseite wie Explore bleiben bei der jeweiligen App. Ohne angeheftete Apps erklärt ein Hinweis das Anheften über ⋯.
- **Beginne mit** vor dem ersten Lauf: Wetterausblick, Reiseplanung, Kochen mit vorhandenen Zutaten und Produktvergleich, jeweils direkt zum Formular, mit kurzer Einführung und [Mehr erfahren](#what-an-app-is).
- **Eigene Apps**: selbst erstellt oder aus Datei installiert, mit Anzahl und **App erstellen** für Beschreibung, leeren Start oder Installation. Ab vier eigenen Apps sortiert ein Button nach Nutzung, A–Z oder Datum; das Gerät merkt die Wahl.
- **Vorgefertigte Apps**: installierte Hydor-Apps nach Kategorien wie Research, Planung, Einkauf, Wetter, Sport, Essen und Unterhaltung. Du kannst sie direkt ausführen oder als eigene Kopie anpassen.

Alle Karten haben gleiche Größe mit Symbol, Name, Zweck, Formularfragen oder **Startbereit**, Funktionssymbolen mit erklärendem Tooltip und letztem Lauf. Symbole zeigen eigene Ergebnisansicht, Verfügbarkeit für Agentenchats, fehlenden Key und **Öffentlich**. Gegebenenfalls stehen **Nicht installiert** oder **Baustein** dabei. **Weitere (⋯)** rechts oben, am Computer beim Darüberzeigen, bietet Öffnen, Anheften/Lösen und Als Datei herunterladen. Ohne Treffer erscheint „Noch keine passende App“ mit **Einem Agenten beschreiben**, das App builder mit deiner Suche startet.

Darunter:

- **Vorgefertigte Apps zum Installieren** erscheint nach einer Deinstallation. Karten erklären Kategorie, Zweck und Ergebnisseiten, etwa Reise, Tagesplan, Vorabbuchungen und Budget. **Installieren** stellt wieder her; siehe [Vorgefertigte Apps installieren oder deinstallieren](#install-or-uninstall-a-ready-made-app).
- **Bausteine** ist eingeklappt mit Anzahl: kleine Apps als Schritte eigener Abläufe, etwa Seite zusammenfassen, übersetzen, mit Webbelegen antworten, kategorisieren und Fakten extrahieren. Eigene Bausteine stehen dabei; **Schritt hinzufügen** bietet sie im Builder an.

Zustandsmarkierungen sind **Wartet**, **Startet**, **In Arbeit**, **Braucht dich** für Freigaben oder Antworten, **Erledigt**, **Fehlgeschlagen** und **Gestoppt**.

Ziehe `.hydor-app` oder `.json` irgendwo auf die Seite zum Installieren. Zuerst erscheint eine Beschreibungskarte; siehe [App als Datei teilen](#share-an-app-as-a-file).

Mobil ist die Seite einspaltig. Angeheftete und zuletzt verwendete Apps sowie Kategorienchips scrollen horizontal; Karten konzentrieren sich auf Name und Zweck.

## Vorgefertigte App verwenden

Vorgefertigte Apps sind von Anfang an unter **Deine Apps** installiert und für Agenten in Sitzungen verfügbar; siehe [Eine App durch einen Agenten ausführen lassen](#have-an-agent-run-an-app-for-you). **Ablauf** zeigt ihre Schritte. **Als Graph** oder **Eigene Kopie erstellen** öffnet den Builder. Ergebnisse haben passende Seiten und Aktionen; siehe [Ergebnisansicht](#its-view). Agentenschritte nutzen zunächst Claude Code, auf der App-Seite änderbar, schnelle Schritte das Hilfsmodell unter Einstellungen → Modelle. Fragen mit „Lass mich …“ warten nur bei aktivierter Option und interaktivem Start über Formular oder Agentensitzung.

- **Deep research report** erstellt einen belegten Bericht zu Thema, Schwerpunkt, Tiefe und Zielgruppe. Er plant Fragen, recherchiert drei parallel, bewertet Quellen, liest die besten gleichzeitig und sucht bei Lücken nach. **Fragen zuerst prüfen** erlaubt eigene Anpassungen. **Zusammenfassung** zeigt Frage, Sicherheit und Kernerkenntnisse mit **Vertiefen** für eigene Berichte. Weitere Seiten: **Vollständiger Bericht** mit Kopieren und **Quellen** nach Herausgeber filterbar.
- **Trip planner** erstellt einen tagesgenauen Plan mit Öffnungszeiten, Veranstaltungen, Fahrtzeiten, Budget und Vorabbuchungen. Nach Datumsberechnung recherchiert er parallel Feiertage, Ereignisse, Wetter mit Vorhersage bis zehn Tage im Voraus, Sehenswürdigkeiten, Unterkünfte und Verkehr. Optional wählst du Unterkunft und Pflichtziele vor dem Planen. **Deine Reise** zeigt Zahlen, Plan, Tagesübersicht und Tipps; Entspannt, Ausgewogen, Vollgepackt und Ein Tag mehr planen neu. **Tag für Tag** enthält abzuhakende Morgen-, Nachmittags- und Abendpunkte, Hauptmotivfoto und Tageskarte. Einzelne Tagesseiten bieten Tagesplan kopieren und Umgebung recherchieren. **Karte** verbindet nummerierte Tagesgebiete, **Vorab buchen** ist eine Checkliste, **Budget** zeigt Diagramm und Schätzungen.
- **Compare products** recherchiert aktuelle Preise, unabhängige Bewertungen und bekannte Probleme und gewichtet sie nach deinen Kriterien. Bei einer Bedarfsbeschreibung werden zuerst Produkte vorgeschlagen, optional von dir ausgewählt, dann je drei parallel untersucht, bewertet und sortiert. **Empfehlung** zeigt Produktbild, Preis, Begründung und Alternativen. **Gegenüberstellung** zeigt 100-Punkte-Werte, Bilder, Stärken, Schwächen und Favorit. Produktseiten bieten Langzeitrecherche; **Achtung** nennt Risiken. Das strukturierte Ergebnis enthält ebenfalls den empfohlenen Vergleichseintrag.
- **Document Q&A** beantwortet Fragen aus einem Anhang mit exakter Textstelle und Fundort. Nach Lesen und Passagensuche werden drei Fragen parallel beantwortet; Offenes lässt ein Agent anhand des vollständigen Dokuments prüfen. **Antworten** bietet Suche und erneuten Lauf mit neuen Fragen zur selben Datei; daneben steht **Dokument**.
- **Meeting notes to actions** extrahiert Entscheidungen, Aufgaben mit Verantwortlichen und Terminen, offene Fragen und Folge-E-Mail aus Notizen oder Transkript. Fristen werden vom heutigen Datum abgeleitet. Optional fragt die App nach nicht zugeordneten Aufgaben. **Übersicht** zeigt Teilnehmende, Zahlen, Zusammenfassung und Beschlüsse; **Aufgaben** lässt nach Person filtern und abhaken, **Folge-E-Mail** kopieren; **Noch offen** sammelt Fragen.
- **Cover letter** schreibt ein belegtes Anschreiben für eine Stelle und benennt Lücken ehrlich. Sie liest Ausschreibung, recherchiert Anforderungen und Unternehmen, gleicht Erfahrungen ab, schreibt und überarbeitet höchstens zweimal. **Anschreiben** bietet Kopieren und Neufassung in warmem, selbstbewusstem oder formellem Ton sowie kurz oder normal. **Warum du passt** stellt Anforderungen und Belege gegenüber; **Vorbereitung auf Lücken** ist abhakbar.
- **Lesson plan** plant eine Unterrichtsstunde von Lernzielen rückwärts mit Zeit, Aktivitäten, Verständnisprüfung, Unterstützung und Vertiefung. Fakten werden geprüft, Minuten passend verteilt. **Übersicht** enthält Ziele und Materialcheckliste, **Zeitleiste** Aktivitäten proportional zur Dauer, **Unterstützung und Prüfungen** und **Gesamtplan** mit Kopieren.
- **Weekly news digest** recherchiert die letzte Woche deiner Themen, je drei parallel, führt gleiche Meldungen zusammen, liest Originalberichte und erklärt ihre Bedeutung. **Meldungen** zeigt Originalbilder, Themenfilter, Gelesen-Markierung und Vertiefung; **Zusammenfassung** lässt sich kopieren.
- **Explain a contract** erklärt Vertragsklauseln, Fristen, ungewöhnliche Bedingungen und Fragen vor Unterzeichnung aus Datei oder Text. Klauseln werden parallel gelesen, Ernstes durch einen Agenten nachgeprüft. **Kurzfassung** zeigt Inhalt, Risikozahlen und kopierbare Fragen, **Warnzeichen** filtert Schweregrade, weitere Seiten sind **Wichtige Begriffe** und **Termine**.
- **Build a small web app** erstellt aus deiner Beschreibung eine funktionierende lokale HTML/CSS/JavaScript-App. Optional prüfst du zuerst den Plan. Erstellung, Tests und Korrektur werden bis zum Bestehen höchstens zweimal durchlaufen. **Ergebnis** nennt Öffnung und Dateien und bietet Neuerstellung mit Änderung; **Nächste Schritte** ist abhakbar.

Alltags-Apps sind kleiner und schneller. Sie nutzen freie Datenquellen wie Open-Meteo, TheSportsDB, TheMealDB, TVmaze, CheapShark, Open Library, Wikipedia, Wikidata und OpenStreetMap. Exakte Werte berechnet ein Programm; ein schnelles Modell liest, wählt und erklärt. Keys sind nicht nötig.

- **Weather outlook** zeigt Vorhersage für einen Ort mit Höchst-/Tiefstwerten, Regenwahrscheinlichkeit, 48 Stunden, geeigneten Tagen, Kleidung und Warnungen. Ortsnamen können die Region enthalten, etwa „Paris, Texas“. **Vorhersage** zeigt aktuelles Wetter, Tageskacheln mit Stunden und Diagramme; °F/°C und 14-Tage-Ausblick starten passend neu. Weitere Ansichten: **Nächste 48 Stunden**, **Kleidung**, kopierbare Vorhersage, beste Reisemonate und Karte.
- **Best time to go** mittelt fünf Wetterjahre je Monat mit Temperaturen, Regentagen, Sonnenstunden und Eignungswert für Stadt, Strand, Wandern, Schnee oder Hitzeflucht. **Monatsvergleich** zeigt Ortsfoto, beste Monate, Farbbewertung und Diagramme mit wechselbarer Reiseart. **Reisezeit** erläutert gute und schlechte Monate mit Tipps; **Zahlen** enthält Daten.
- **Team tracker** zeigt nächste Spiele, Ergebnisse, aktuelle Form, Tabellenstand und Wochennachrichten. **Team** zeigt Wappen, farbige Formfolge und nächstes Spiel mit Vorschau. **Ergebnisse** stellt erzielte und kassierte Punkte/Tore dar, **Spielplan** startet Einzelvorschauen, **Nachrichten** ergänzt Aktuelles.
- **Match preview** vergleicht Form, direkte Begegnungen, Teamnachrichten und Experteneinschätzungen zweier Teams samt Ergebniswahrscheinlichkeiten. **Vorschau** zeigt Wappen, Prognose und Chancenbalken, **Form und Begegnungen** den Verlauf, **Teamnachrichten** Kopieren und Team verfolgen.
- **Cook with what you have** sucht Rezepte aus vorhandenen Zutaten mit Fehlendem, Fotos, zeitlich geplanten Schritten und optionalem Video. Gib Ernährung und Zeit an; Salz, Öl und Gewürze gelten zunächst als vorhanden. **Rezepte** bietet schnellere Neusuche. Einzelrezepte haben Minutenablauf, abhakbare Schritte, markierte vorhandene Zutaten und Kopieren. **Einkaufen** listet Fehlendes.
- **Meal plan and shopping list** plant Abendessen für eine bis zwei Wochen nach Haushalt, Ernährung und Vorlieben, jeweils mit Rezept und Foto. Eine gemeinsame Einkaufsliste addiert Mengen nach Abteilungen. **Woche** plant erneut, Tagesseiten zeigen Zutaten, Anleitung und Video, **Einkaufsliste** filtert Abteilungen und lässt abhaken/kopieren, **Tipps** ergänzt Hinweise.
- **Gift ideas** findet passende Gegenstände und Erlebnisse im Budget mit Begründung, üblichen Preisen und aktuellem Angebot samt Shop. **Ideen** zeigt Bilder und Kategorien, Speichern und ähnliche Vorschläge; **Nach Preis** zeigt Preisbereiche.
- **What to watch** empfiehlt Filme und Serien nach Stimmung, Land und Streamingdiensten, bevorzugt deinen Abos, mit Länge, Trailer und Begründung. **Heute Abend** zeigt Favorit und Alternativen. ▶ markiert Trailer. Detailseiten spielen sie ab und bieten „Schon gesehen: neu auswählen“. **Gegenüberstellung** vergleicht.
- **Game finder** empfiehlt erschienene und kommende Spiele mit Datum, auch für Nintendo Switch 2, Bildern, Trailern, Eignung und Spieldauer. PC-Spiele enthalten aktuellen Bestpreis und historischen Tiefstpreis. **Spiele**, Detailseiten mit Trailer, Angebot und ähnlichen Spielen, **Preise** als Diagramm und **Spieldauer** bilden die Ansicht.
- **Quiz on any topic** nutzt Wikipedia-Fakten, mischt Antworten neu und zeigt nach jeder Wahl Richtigkeit, Erklärung und Gesamtpunktzahl. **Quiz spielen** bietet Neustart, schwierigeres Quiz und neue Fragen; **Antworten** und **Zum Thema** ergänzen mit Kopieren.
- **Book finder** empfiehlt Bücher anhand deiner Vorlieben und prüft Cover, Seiten und Bewertungen in Open Library. **Bücherregal** bietet Detailseiten und ähnliche Titel; **Leseliste** lässt als gelesen markieren.
- **What's on** sucht Veranstaltungen einer Stadt für deine Tage, standardmäßig kommendes Wochenende: Konzerte, Märkte, Ausstellungen und Familienausflüge mit Tageswetter. **Nach Tag** zeigt Originalbilder, **Karte** nummerierte Orte, **Nach Art** Kategorien. Du kannst Teilnahme markieren oder die Liste kopieren.
- **Savings plan** berechnet monatliche Sparrate und Zinsen bis zum Zieltermin, zeigt Kapitalverlauf und Zielerreichung bei 20 % mehr oder weniger. **Plan** bietet 50 mehr oder weniger pro Monat bei vorgegebenem Betrag, **Monat für Monat** zeigt Meilensteine und Werte, **Tipps** ergänzt Hinweise.
- **Chart my data** erzeugt aus Tabelle, CSV oder eingefügten Zahlen bis zu drei passende Diagramme und kurze Erklärungen. Ansichten: **Diagramme**, **Datenerkenntnisse** zum Kopieren und **Daten** mit Spaltenzusammenfassung und weiterer Frage.
- **A topic as a timeline** stellt Wikipedia-Themen mit datierten Schlüsselereignissen, ausführlich bis dreißig, Epochen und Kurzgeschichte dar. **Zeitleiste** filtert Stränge und startet ein Themenquiz; **Als Diagramm** zeigt Jahre, größere Wendepunkte und Epochen.
- **Explore a place** zeigt Orte einer Stadt, eines Viertels oder Wahrzeichens auf der Karte. Unter **Vorlieben** genannte Hundeparks, Cafés oder Spielplätze aus OpenStreetMap kommen zuerst, dann bekannte Wikipedia-/Wikidata-Sehenswürdigkeiten sowie Museen, Parks und Wahrzeichen. Bilder, Kurztexte und geeignete Fußreihenfolge ergänzen die Auswahl. Ohne Vorlieben genügen Sehenswürdigkeiten. **Spaziergang** verbindet nummerierte abhakbare Stopps und Wetter; **Umgebung** filtert Kategorien.

Research- und Labor-Apps beobachten Fachgebiete, lesen und prüfen Arbeiten und verwalten Experimente und Berichte. Einige haben wie Explore eine eigene Seite und automatische Aktualisierung. [Research](/guide/researchers) erklärt die Zusammenhänge.

- **Paper radar** zeigt morgens neue arXiv- und OpenAlex-Arbeiten nach Kategorien, Themen und Personen, gewichtet für Projekte und Profil mit Kurzbeschreibung und Relevanz. Eigene Seite, optional täglich. **Heute** gruppiert nach Thema mit Speichern, Zitieren, PDF, Vertiefen und Nicht relevant als Einfluss auf spätere Auswahl. **Gespeicherte Publikationen** bietet BibTeX-Export und Leseliste; siehe [Im Fachgebiet aktuell bleiben](/guide/researchers#keep-up-with-your-field).
- **Citation alerts** zeigt neue Zitate deiner Arbeiten mit markiertem zitierenden Satz und Einordnung als Aufbau, Vergleich, Widerspruch oder Erwähnung. Eigene Seite mit **Neu**, nach Arbeit und Typ, sowie **Deine Publikationen** mit Zitationszahlen.
- **New-model watch** prüft neue Hugging-Face-Modelle nach Typ, Lizenz, Größe und Downloads, fasst Model Cards zusammen und führt deinen Auswertungsbefehl in Experimente aus. Nur neue Bestwerte werden gemeldet. Eigene Seite mit Modellzustand, Beschreibung, Score und Auswertung.
- **Deadline radar** bündelt ccfddl- und ai-deadlines-Fristen, rechnet AoE oder andere Quellzeitzonen in deine um und erinnert gesammelt etwa 14, 3 und 1 Tag vorher. Seitenlimit und Vorlage sind verlinkt. Eigene Seite mit Zeitleiste, Restzeit, Kopieren, vergangenen Terminen und Konferenzen.
- **Living related work** pflegt wachsende Themenseiten mit arXiv, OpenAlex und Seed-Zitaten, Zusammenfassung, Bezug, Themen und Neu-Markierung. **Verwandte Arbeiten** bietet einen LaTeX-Entwurf mit `\cite`, BibTeX-Export und Entfernen irrelevanter Arbeiten; **Diesmal neu** zeigt Ergänzungen.
- **Gap finder** kombiniert eigene und aktuelle Fachpublikationen zu Ideen. Vorarbeitssuche unterscheidet neu, teilweise oder bereits umgesetzt samt nächster Arbeit. Sie schätzt Rechenbedarf und erstes Experiment. **Forschungsideen** öffnet Plan im Research sprint oder Vertiefung; **Verglichene Arbeiten** nennt Quellen.
- **Reading list** verwaltet Arbeiten nach Projekt mit PDF, BibTeX, Tags, Status und Notizen samt Zotero-Abgleich. Hinzufügen über DOI, arXiv-ID, Link oder Titel ergänzt Vorhandenes statt Duplikaten. Suche und Filter nach Lesestatus, Tag und Projekt, Detailseite mit Links, Notizen, BibTeX und Reproduzieren. **Nach Projekt** zählt Arbeiten; Weitere importiert/exportiert .bib und synchronisiert Zotero mit anfänglicher Key-Abfrage. Ausgewählte Arbeiten starten eine Literaturmatrix; siehe [Lesen und organisieren](/guide/researchers#read-and-organise-papers).
- **Literature matrix** liest je drei Arbeiten parallel für eine Zeile je Arbeit und Spalten zu Aufgabe, Daten, Methode, Metriken, Ergebnissen und Grenzen mit Fundstelle je Zelle. Eingabe zeilenweise oder Leseliste mit Tag, Projekt oder Status. Die Tabelle landet in der Bibliothek. **Matrix** bietet Öffnen, Kopieren, nicht lesbare Arbeiten mit Gründen und zusätzliche Spalte; weitere Seiten sind Publikationen und übergreifende Erkenntnisse.
- **Reproduce a paper** sucht Code in der Arbeit, auf GitHub und im Web, erstellt eine saubere Umgebung, lädt Daten und Checkpoints und testet erst klein, dann vollständig innerhalb deiner Grenzen. Lange Läufe gehen wartend an [Experimente](/guide/experiments). Werte werden mit der Arbeit verglichen. **Reproduziert?** zeigt Vergleich, Ordner und erneuten Versuch; weitere Seiten sind Aufwand und Bericht.
- **Reviewer simulator** simuliert bis zu fünf Perspektiven auf den Entwurf mit Formularen von ACL Rolling Review, SIGIR, NeurIPS, ICLR, ICML, KDD, CIKM, WSDM, TheWebConf oder Zeitschrift und Area-Chair-Meta-Begutachtung. Seiten: Gutachten, Meta-Begutachtung mit Ablehnungsrisiken, erwartete Baselines/Ablationen und Einreichungscheckliste mit Übergabe an Rebuttal workbench; siehe [Begutachten, antworten und präsentieren](/guide/researchers#review-answer-and-present-your-paper).
- **Rebuttal workbench** gruppiert Kritik über Gutachter hinweg als Missverständnis, Experiment nötig, Erläuterung nötig oder kleiner Punkt. Antwortentwürfe berücksichtigen Ton und Limit, fehlende Ergebnisse bleiben Platzhalter. Seiten: Kritikpunkte mit Entwurf, Länge und Kopieren, Aufgabencheckliste sowie vollständige kopierbare Erwiderung.
- **Paper to talk, poster and thread** erstellt gewählte Folien mit Originalabbildungen, Gleichungen, Sprechtext und Zeitplan, A0-LaTeX-Poster, X-/Bluesky-Thread, LinkedIn-Beitrag und Projektseite im benannten Bibliotheksprojekt. Seiten: erstellte Inhalte zum Öffnen, Vortrag als Zeitstreifen und kopierbare Plattformbeiträge.
- **Figure doctor** passt Plot-Skripte an Spaltenbreite, Vorlage, Schrift und farbsehschwächentaugliche Palette an. Vektor-PDFs enthalten eingebettete Schriften ohne Type 3 und alle verwenden eine Stildatei. Originale bleiben daneben. Seiten: Vorher/Nachher, kopierbare Stildatei und Änderungen.
- **Annotation workbench** lässt dich und ein Modell dieselbe zufällige Textstichprobe nach bis zu neun Kategorien und deinen Richtlinien klassifizieren. Quelle ist CSV, JSONL, Hugging Face oder eingefügter Text. Modellurteil erscheint erst nach deinem. Ansichten: Annotieren mit Tasten 1–9, Abweichungen, Übereinstimmung samt Cohens κ und Konfusionsmatrix sowie CSV-/JSONL-Export oder Hugging-Face-Veröffentlichung mit Dataset Card; siehe [Laborarbeit](/guide/researchers#run-your-labs-work).
- **Research sprint** führt eine Frage durch Hypothesen, Plan und Code im eigenen Worktree-Branch, [Experimente](/guide/experiments) innerhalb des GPU-Budgets, Analyse-Notebook und Bericht. Du bestätigst Hypothesen und Laufstart. Ansichten: Sprint mit Urteilen und Belegen, Läufe mit Baselinevergleich und Bericht.
- **Sweep planner** plant Trainingsparameter im Budget aus Läufen oder GPU-Stunden. Ein Agent liest Skriptargumente und übernimmt oder empfiehlt Werte. Experimente stoppt schlechte Versuche früh, ein Programm ermittelt den Einfluss. Ansichten: bestes Ergebnis, nächste Versuche, Diagramme je Einstellung und alle Läufe.
- **Weekly progress report** fasst Sitzungen einschließlich VS Code und Terminal, Commits, Läufe und Lektüre für Betreuung, Team oder Führungskraft zusammen: Erledigtes, Zahlen, Blockaden, nächste Woche und Fragen. Eigene Seite mit Markdown-, E-Mail-Kopie und Dokumentenspeicherung, älteren Wochen und optional freitags 16:00 automatischer Erstellung; siehe [Wochenbericht und Laborbuch](/guide/researchers#reports-your-week-and-your-lab-notebook).
- **Lab notebook** erstellt datierte Tagesnotizen mit Versuchen, Erkenntnissen, Entscheidungen, offenen Fragen und Links zu Sitzungen, Commits, Läufen und Dateien. Eigene Seite, neueste zuerst, Suche nach Wörtern und Bedeutung, zitierbare Eintragslinks und optionale tägliche Aktualisierung um 21:00.

Vorgefertigte Apps lassen sich nicht direkt ändern. **Eigene Kopie erstellen**, mobil **Bearbeiten**, öffnet eine Kopie im Builder. Beim Erstellen wird sie zu deiner eigenen App.

### Explore

**Explore** erstellt ein persönliches Magazin mit Artikeln und Nachrichten zu deinen Interessen. Öffne es rechts oben auf der Startseite oder unter Apps. Es hat kein wiederkehrendes Formular, öffnet die neueste Ausgabe auf einer eigenen Seite und wird nicht von Agenten in Sitzungen ausgeführt.

- **Auswahl**: Profil, Memory-Notizen und Titel jüngster Sitzungen liefern etwa sechs aktuelle Themen, ungefähr hälftig Arbeit und übriges Leben, nie private Inhalte. Ausgenommen sind Sitzungen ohne Memory, Subagenten und unbeaufsichtigte App-Läufe. Je Thema recherchiert die App Nachrichten der letzten zwei Wochen und längere Erklärungen, Analysen oder Essays, liest die besten parallel, fasst zusammen und ermittelt Bilder. Bei gesperrtem Websitezugriff dienen Suchausschnitte. Eine Ausgabe dauert ein bis zwei Minuten.
- **Ausgabe**: Datum, Titelzeile, redaktioneller Einstieg, Themenfilter mit Alle, Titelgeschichte und Themenabschnitte. Beiträge enthalten Bild, Nachricht oder Hintergrundartikel, Quelle, Datum, Inhalt und Auswahlgrund. Klick auf Bild oder Titel öffnet die Quelle und markiert auch für spätere Ausgaben als gelesen. **Vertiefen** startet einen Recherchebericht. **Frühere** öffnet historische Ausgaben unverändert.
- **Aktualisieren** erstellt sofort neu und zeigt Fortschritt sowie Verfolgen, während die vorige Ausgabe bleibt. Vor der ersten Ausgabe heißt dies Erste Ausgabe erstellen.
- **Einstellungen** über Schieberegler: Automatische Aktualisierung zunächst aus, danach morgens. Wähle täglich, werktags oder wöchentlich sowie Uhrzeit, zunächst 07:00. Die [geplante Aufgabe](/guide/tasks) erscheint auch in den Einstellungen und wird beim Deaktivieren entfernt. **Zu lesende Sitzungen** bestimmt die Zahl der Titel, standardmäßig und höchstens 1.000. **Auch behandeln** nennt Dauerthemen je Zeile, **Auslassen** Themen oder Websites kommagetrennt. Speichern gilt für alle Ausgaben.
- **Eigene Kopie erstellen** und **Deinstallieren** stehen unter Weitere.

Eine Ausgabe benötigt etwa zwanzig kurze Hilfsmodellanfragen und ein Dutzend Websuchen. Bei angemeldetem Claude Code laufen die Modellanfragen über deinen Tarif.

### Vorgefertigte Apps installieren oder deinstallieren

Öffne die App, **Weitere → Deinstallieren** und bestätige. Sie verschwindet aus deinen Apps und wird nicht mehr von Agenten genutzt, bleibt aber unter **Vorgefertigte Apps zum Installieren** verfügbar. Läufe bleiben erhalten.

Zur Wiederherstellung öffne dort die Karte. Sie zeigt vor Änderungen Zweck, Fragen mit optionaler Kennzeichnung, Ergebnis, verständlichen Ablauf und den Schalter **Für Agenten verfügbar**. **Installieren** stellt sie wieder her und öffnet sie. Auch ihre eigene Seite meldet die Deinstallation mit Installationsbutton.

## App ausführen

1. Öffne die App über Apps oder Suche. Oben stehen Zweck und **Deine Antworten**. Daneben, mobil darunter, folgen **Ergebnis**, **In deinen Sitzungen** für [Agentennutzung](#have-an-agent-run-an-app-for-you), letzte Läufe und bei Schritten Ablauf mit Wiederholung je Element, gleichzeitig oder parallel. Als Graph öffnet den Builder.
2. Fülle das Formular aus. Rote **\*** kennzeichnen Pflichtfelder.
3. Unter dem Formular steht etwa „Claude Code · Sonnet · hoher Denkaufwand · Automatisch“. Bei vorgefertigten Apps öffnet Ändern die Auswahl, bei eigenen nutzt du Bearbeiten.
4. **Ausführen** öffnet die Laufseite mit Live-Fortschritt.

Fehlende Angaben werden unter dem Feld erläutert, etwa erforderlich, Zahl eingeben oder Datei auswählen, mit Hinweis auf die markierten Fragen.

Ein Link mit `?in.`, Feldname, `=` und Antwort füllt ein Formular vor, startet aber nichts. [Dieses Beispiel](/apps/t/reproduce-paper?in.paper=2104.08663) öffnet Reproduce a paper mit ausgewählter Arbeit. Weitere Antworten folgen mit `&in.`, niemals Dateien. Agenten und Ansichtsbuttons wie Reproduzieren in der Leseliste verwenden solche Links. Apps mit eigener Startseite öffnen dafür ihr Formular.

### Fragetypen

- **Kurzer Text** als Zeile und **Langer Text** als wachsendes Feld.
- **Zahl**: Auch „$1,250.50“ wird als 1250.5 erkannt.
- **Datum** mit Auswahlfeld.
- **Auswahl**: wenige kurze Optionen als Chips, mehr als Liste. Erneuter Klick hebt optionale Auswahl auf. Mehrfachauswahl zeigt Häkchen und speichert einen Eintrag pro Zeile.
- **Ja/Nein** als Schalter.
- **Datei** als Anhang.

Hilfstext, Beispiel und Anfangswert können eine Frage ergänzen.

### Agent, Modell, Denkaufwand und Modus wählen

Bei vorgefertigten Apps öffnet **Ändern** neben der Ausführungszeile die Auswahl; Fertig klappt sie ein:

- Programm: Claude Code, Codex, Custom für beliebige Modelle oder hinzugefügter Agent.
- Modell des gewählten Agenten.
- Denkaufwand bei unterstützten Modellen, nicht Custom und anderen hinzugefügten Agenten.
- Modus als Berechtigungsumfang. Anfangs Automatisch, da Läufe unbeaufsichtigt sein können. Abfragen vor jedem Schritt lassen den Lauf auf dich warten.

Dieser Browser merkt die Auswahl für die nächste vorgefertigte App.

### Dateien anhängen

**Datei auswählen** oder am Computer Ablegen im Feld nimmt bis zu 25 MB an. Die Datei landet im Laufordner, der Agent erhält den Pfad und liest PDF, Word, Tabellen und andere Formate wie gewohnt. × entfernt die Auswahl.

### Erforderliche Keys hinterlegen

Manche Apps benötigen einen API Key oder Token für Wetter, Karten oder ein anderes Konto. Sie benennen Keys, niemals deren Werte. Du hinterlegst jeden einmal im [Tresor](/guide/connections#keep-keys-in-the-vault); Agenten verwenden ihn anhand seines Namens, ohne ihn zu sehen.

- Unter dem Formular nennt **Erforderlicher Key** beziehungsweise **Erforderliche Keys** Zweck, Tresorname, Beschaffungsanleitung, Eingabefeld und **Key erstellen** als Link. **Ausführen** speichert zuerst und startet danach. Vorhandene zeigen **Gespeichert**, letzte Zeichen und Ändern; entbehrliche sind optional.
- Auch Installationskarten fragen danach. Gib Keys sofort oder beim ersten Lauf an.
- In Agentensitzungen fragt die App-Karte nach fehlenden Keys und speichert sie direkt im Tresor, nicht in der Unterhaltung.
- Nur für Teilfunktionen nötige Keys, etwa Zotero beim Synchronisieren der Leseliste, werden erst bei ihrer ersten Verwendung abgefragt.

Ohne Pflicht-Key startet kein Lauf: Formulare fragen nach, API-, Zeitplan- und CSV-Läufe werden mit Name des fehlenden Keys abgelehnt. Hinterlege ihn auf der App-Seite oder unter Apps → Verbundene Apps → Keys. Darf ein vorhandener Key eine benötigte Website noch nicht erreichen, zeigt die Zeile dies mit **Erlauben**.

Apps mit OpenRouter-Modellen fragen ebenso nach dem **OpenRouter API Key**, speichern ihn aber unter [Einstellungen → Modelle](/settings?s=models) für andere Apps und Custom. Das verwendete Modell wird beim ersten Lauf automatisch ergänzt. Modelle auf Ollama, vLLM oder eigenen Endpunkten richtest du dort manuell ein; bis dahin nennt ein abgelehnter Lauf Modell und Vorgehen.

### Arbeitsort eines Laufs

Jeder Lauf erhält einen neuen, nach App und Zeit benannten Ordner unter `hydor-apps` in deinem Benutzerordner. Eine App kann einen festen [Arbeitsordner](#who-does-it) vorgeben; dann laufen alle dort.

Formularläufe erscheinen als normale Sitzungen mit App-Name und ersten Antworten in der Seitenleiste. Läufe aus API, anderen Agenten, öffentlichen Seiten und CSV werden archiviert und nur unter der App angezeigt.

## Eine App durch einen Agenten ausführen lassen

Du musst die App nicht öffnen. Beschreibe ihren Zweck in einer Sitzung, etwa „Plane für uns zwei vier Tage Lissabon im Mai“.

1. Der Agent findet eine passende App und übernimmt Angaben wie Ort, Tage und Reisende. Bei eindeutigem App-Auftrag bekommt er schon mit deiner Nachricht den Hinweis, sie auszuführen. Bei vielen Apps durchsucht er Zwecke nach Wörtern und optional Bedeutung und wählt aus zwanzig besten Treffern.
2. Vor der Ausführung fragt eine Karte, außer bei Apps auf deiner Liste für Starts ohne Nachfrage. Sie zeigt Symbol, Namen, Zweck, bis zu sechs Schritte mit Restzahl, übernommene Nachrichtenangaben, Dauer und Kosten des letzten Laufs sowie Link zur App. Fehlende Fragen und Keys stehen ebenfalls dort; Keys gehen direkt in den Tresor. Rote **\*** markieren Pflichtangaben, optionale dürfen leer bleiben. Nicht exakt übernehmbare Angaben wie „im Mai“ für ein Datum stehen zur Orientierung darunter. **Ausführen** startet einmal, **Immer ausführen** ergänzt die Freigabeliste, **Nicht ausführen** lässt den Agenten anders arbeiten oder nachfragen. Währenddessen erscheint Braucht dich und ein Posteingangseintrag. Auch freigegebene Apps fragen bei fehlenden Angaben mit Ausführen/Nicht jetzt. Geplante Aufgaben starten ohne Nachfrage, da sie bereits eingerichtet wurden und niemand antwortet.
3. Die Karte bleibt unter der Agentenantwort und verfolgt Zustand und Schritte, anschließend Ergebnisansicht mit Seiten und Aktionen. **Einfache Antwort** zeigt Karte und Tabellen. Zwischenfragen warten ebenfalls dort. **Öffnen** geht zur Laufseite, der App-Name zur App.
4. Der Agent fasst das Ergebnis kurz zusammen; seine eigentliche Laufantwort bleibt auf der Laufseite. Passt das App-Ergebnis nicht und antwortet er stattdessen selbst, entfernt er die Ergebniskarte aus der Unterhaltung, nicht den gespeicherten Lauf. Lange Läufe arbeiten nach Ende seiner Wartezeit weiter. Bei Abschluss erhält er das Ergebnis ohne künstliche Nutzernachricht und antwortet; die Karte wandert darunter. Hohe Ergebnisse beginnen oben mit seiner Einordnung darüber. Scrollen zeigt den Rest, Neueste springt ans Ende.

Solche Läufe tragen **Aus einer Sitzung**.

Auf jeder App-Seite steht neben dem Formular **In deinen Sitzungen** mit **Für Agenten verfügbar**, bei eigenen auch unter API und Freigabe. Der zunächst aktive Schalter lässt sich beliebig umstellen. Bausteine und Apps für eigene Seiten mit Oberfläche oder gespeicherten Daten werden stattdessen als solche erklärt und nicht in Agentensitzungen gestartet. Eigene Apps werden bei gleichem Zweck vor vorgefertigten bevorzugt.

[Ohne Nachfrage ausführen](/settings?s=apps&find=Run%20without%20asking) unter Einstellungen → Apps listet freigegebene Apps. × entfernt die Freigabe, App hinzufügen ergänzt sie vor einer ersten Nachfrage.

Jede Sitzung erfährt von bis zu vierzig Apps: meistgenutzte mit Zweck, weitere mit Namen. Darüber hinaus suchen Agenten bei Bedarf gezielt.

## Lauf verfolgen und Ergebnis lesen

Die Laufseite zeigt App-Name, Antwortkurzfassung wie „Lissabon · 2026-11-20 · 3“, Herkunft aus Formular, Test, API, anderem Agenten, öffentlicher Seite oder CSV-Zeile und Startzeit. Nach Abschluss öffnet **Erneut ausführen** dasselbe vorausgefüllte Formular.

Die Statuskarte nennt:

- **Wartet**, **Startet …** oder **In Arbeit** mit Dauer, letzten Schritten und Anfang der jüngsten Agentenmeldung.
- **Freigabe in der Sitzung erforderlich** oder **Frage in der Sitzung offen**. Öffne die Sitzung zum Antworten; Freigaben stehen auch im [Posteingang](/inbox).
- **Erledigt in …** mit Kosten.
- **Gestoppt** oder **Nicht abgeschlossen** mit Ursache.

Darunter steht das Ergebnis in seiner [Ansicht](#its-view). Einfache Antwort wechselt zur Karte mit Tabellen, Ergebnisansicht zurück. Ohne eigene Ansicht:

- Kurze Felder für Text, Zahlen, Datum, Links und Ja/Nein stehen gemeinsam auf einer Karte.
- Lange Texte, Listen und Tabellen erhalten eigene Karten mit Titel. Text hat Kopieren, Tabellen Kopieren und CSV-Download. Bildspalten zeigen anklickbare Miniaturen.
- Bilder stehen im Raster mit Großansicht und Pfeilen, Video und Audio sind abspielbar, Dateien herunterladbar. Externe Inhalte wie YouTube öffnen am Quellort.
- Zu breite Tabellen werden mobil als Karte je Zeile dargestellt.

Die Agentenantwort folgt offen als **Antwort**, wenn Ergebnisfelder fehlen, andernfalls eingeklappt als **Agentenantwort**. **Auftrag** zeigt eingeklappt die Eingaben.

Fehlen beim Agentenende die Ergebnisfelder, wird er einmal erinnert. Ohne Textantwort und Ergebnis gilt der Lauf als fehlgeschlagen.

Unten öffnet **Mit diesen Antworten erneut ausführen** das Formular zur Anpassung. Dateien musst du dort erneut wählen. **Sitzung öffnen**, mobil Sitzung, oben zeigt die vollständige Unterhaltung.

### Ergebnisansicht

Eine eigene Ansicht stellt die Antwort passend als Seiten mit Karten, Zeitleisten, Diagrammen und Checklisten sowie Aktionen dar.

- **Seiten** sind Tabs oben, die erste startet. Andere öffnen aus Elementen wie Reisetag oder Produkt und bieten Zurück.
- **Häkchen** wie Buchungen und erledigte Aufgaben bleiben je Lauf auf allen Geräten gespeichert. Filter und aktuelle Auswahl gelten nur während des geöffneten Fensters.
- **Erneute Läufe** über Entspannt, Ein Tag mehr, Formell oder neue Dokumentfragen fragen vorher und starten mit übrigen Antworten und Dateien unverändert einen neuen Lauf.
- **Andere Apps** über Recherche oder Vertiefen fragen ebenfalls und öffnen dann deren Lauf.
- **Kopieren** übernimmt einzelne E-Mails, Briefe oder Fragen.
- **Karten, Plots, Bilder und Videos** erlauben Verschieben, Zoomen, Ortsnamen und Detailseiten, Datenablesen und Drehen von 3D-Plots, große Bilder sowie lokale oder YouTube-/Vimeo-Medien. Ohne Bild oder bei Ladefehler nutzt der Text den Platz. Bibliotheken und Kartendaten von OpenFreeMap mit passendem Hell-/Dunkeldesign kommen aus dem Web; das Gerät muss online sein.
- Eigene Apps können in ihrer Ansicht bei fehlenden Schritten den Agenten um Änderungen bitten, andere Flows ausführen und Datensätze speichern.

Die Ansicht erscheint auf Laufseite, unter **Ergebnis** der Sitzung und auf öffentlichen Seiten. Öffentlich funktionieren Seiten und Häkchen, aber keine Aktion erreicht die App: keine neuen Läufe, Wiederholungen oder gespeicherten Daten.

## Ergebnisänderung anfordern

Unten auf der Laufseite steht **Änderung am Ergebnis anfordern …**, ohne Ergebnisfelder nur Änderung anfordern.

1. Beschreibe die Änderung, etwa weniger Programm an Tag 2, Spalte für Öffnungszeiten oder kürzerer, herzlicherer Text.
2. Enter oder Pfeil sendet, Umschalt+Enter fügt Zeilen ein. Mobil macht Enter eine neue Zeile; der Pfeil sendet.

Die Nachricht geht an die Laufsitzung. Der Agent übergibt ein vollständiges aktualisiertes Ergebnis, das das bisherige ersetzt. **Nachfragen** zeigt jeweils Nachricht, Antwort und gegebenenfalls Ergebnis aktualisiert. Status wird Aktualisiert in … oder Beantwortet in … bei bloßen Fragen oder Dank.

Während laufender Arbeit wartet die Nachfrage bis zum Rundenende. Bis zu 20.000 Zeichen sind möglich.

Öffentliche Läufe, gelöschte Sitzungen und in einem anderen Programm geöffnete Sitzungen erlauben hier keine Nachfragen; setze Letztere dort fort.

## Mit der Laufsitzung arbeiten

Über die Seitenleiste öffnet eine Laufsitzung zuerst **Ergebnis** wie auf der Laufseite und bietet oben **Unterhaltung**. Sitzung öffnen auf der Laufseite springt dagegen direkt dorthin. Das Nachrichtenfeld fragt nach Ergebnisänderungen. Entwürfe werden zwischen beiden Orten geteilt.

Unter Ergebnis stehen Freigabekarten zum Genehmigen oder Ablehnen. Bei Fragen wechselt **Antworten** zur Unterhaltung.

In der Unterhaltung markiert **Ergebnis übergeben** den Zeitpunkt und bietet Ergebnis öffnen. Passt es noch nicht zu den Feldern, werden Fehler genannt; der Agent korrigiert und übergibt erneut.

## Lauf stoppen oder entfernen

- **Stoppen** beendet wartende Läufe sofort, unterbricht aktive und markiert sie gestoppt.
- Nach Abschluss entfernt der Papierkorb **Aus Liste entfernen** nach Nachfrage den Lauf aus der App-Liste. Die Sitzung bleibt und kann separat im Sitzungsmenü gelöscht werden.

## Alle Läufe einer App ansehen

Eigene App-Seiten bieten **Ausführen**, **Läufe**, **Für jede Zeile** und **API und Freigabe**. Läufe zeigt heutige Anzahl und alle Läufe neueste zuerst mit Eingaben, Herkunft, Alter, Kosten und Status. Ältere werden in 50er-Gruppen geladen.

Vorgefertigte Apps haben keinen eigenen Läufe-Tab. Nutze Letzte Läufe auf der Apps-Seite oder die Sitzungen.

## Eigene App erstellen

Vier Einstiege:

- **Von Grund auf** über Neue App, App-erstellen-Kachel oder [/apps/new](/apps/new).
- **Beschreiben** auf Apps- oder Neue-App-Seite unter **Beschreibe eine App, ein Agent erstellt sie**. Erstellen startet eine [App-builder-Sitzung](/guide/agents), die erstellt, testet und übergibt.
- **Vorgefertigte kopieren** über Eigene Kopie erstellen, mobil Bearbeiten.
- **Erfolgreiche Sitzung übernehmen** über Sitzungsmenü Weitere → Als App speichern. Das Hilfsmodell macht aus erstem Auftrag und Antwort Formular, Aufgabe und Ergebnisfelder. Veränderliche Details werden Fragen. Programm, Modell, Denkaufwand, Modus und Agent bleiben. Eigenständig ausführbare Toolaufrufe wie Lesen und Suchen werden zu Schritten mit Formulareingaben, gefolgt vom Modell- oder Agentenschritt. Ungültige Schritte entfallen zugunsten des normalen Agentenauftrags. Prüfe und teste den Entwurf. Scheitert das Hilfsmodell, bleibt die ursprüngliche Anfrage als eine Formularfrage mit Begründung. Das Modell steht unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model).

Du kannst Apps auch in beliebigen Sitzungen beauftragen; siehe [Agenten fragen](#ask-an-agent).

Im Builder **Neue App** stehen oben Symbol, anklickbarer Name und Beschreibung. Tabs sind **Auftrag**, **Formular**, **Ergebnis**, **Design**, **Beispiele** und **Einstellungen**. Letztere enthalten Ausführung, Tools, Grenzen, gespeicherte Daten, Bausteinstatus sowie nach Speicherung Ordner und Versionen, jeweils eingeklappt mit Kurzstatus. Tabs sind gleich breit und bleiben am Computer oben; mobil stehen sie zweireihig. Auf breiten Bildschirmen zeigen Formular und Ergebnis daneben eine Live-Vorschau mit Beispieldaten. Fülle aus, teste mit Testlauf und wähle Erstellen. Danach öffnet die startbereite App.

### Name, Beschreibung und Symbol

- Symbol anklicken für elf Farben und 32 Icons.
- Pflichtname bis 60 Zeichen, etwa Reiseplaner.
- Beschreibung in einem Satz bis 300 Zeichen.

Die Adresse entsteht beim Erstellen aus dem Namen, etwa `trip-planner`. Spätere Umbenennung ändert sie nicht, damit Links, Keys und Agententools funktionieren.

### Formular

**Frage hinzufügen** ergänzt pro Frage:

- sichtbaren Wortlaut wie „Wohin?“;
- Typ kurzer/langer Text, Zahl, Datum, Auswahl, Ja/Nein oder Datei;
- Pflichtkennzeichnung;
- Auswahloptionen pro Zeile, leer bedeutet Ja/Nein, sowie Mehrfachauswahl mit einem Ergebnis pro Zeile;
- zusätzliche Hilfszeile, graues Beispiel im leeren Feld und Anfangswert.

Das ⋯-Menü verschiebt nach oben/unten oder entfernt. Der Platzhalter wie `{{destination}}` darunter ist zugleich programmatischer Feldname. Er folgt anfangs dem Wortlaut, bis der Auftrag ihn verwendet. Höchstens dreißig Fragen sind möglich.

### Auftrag

Schreibe den Agentenauftrag mit eingesetzten Antworten, höchstens 30.000 Zeichen und erforderlich. Beschreibe auch das Vorgehen.

- Auftrag zeigt eine Einzelaufgabe, Liste oder Graph; siehe [Apps mit Schritten](#apps-with-steps).
- Einfügechips setzen Frageplatzhalter am Cursor. Ungenutzte Fragen sind hervorgehoben. **today**, **now** und **weekday** liefern lokales Datum, Datum/Uhrzeit und Wochentag.
- `{{question}}` wird durch die Antwort ersetzt.
- Zwischen `{{#question}}` und `{{/question}}` bleibt Text nur bei beantworteter, nicht verneinter Frage. `{{^question}}` bis `{{/question}}` gilt nur für leere Fragen.
- Vorschau am Ende der Chips zeigt Anfangswerte oder Feldnamen in Klammern. Bearbeiten kehrt zurück.

Hinweise nennen unbekannte Platzhalter, die unverändert bleiben, und im Auftrag ungenutzte Pflichtfragen.

### Ergebnis

Ergebnisfelder werden vom Agenten ausgefüllt, als Karte oder Tabelle dargestellt und Programmen als JSON zurückgegeben. Ohne Felder gilt die normale Agentenantwort.

**Ergebnisfeld hinzufügen** ergänzt:

- Überschrift wie „Empfehlung“;
- Typ Text, formatierter langer Text, Zahl, Ja/Nein, Datum, Link, Liste, Tabelle oder Bilder/Videos/Dateien;
- Pflichtkennzeichnung;
- optionalen Agentenhinweis zum Inhalt;
- bei Tabellen Spalten mit Name und Typ Text, Zahl, Ja/Nein, Datum, Link oder Bild. **Spalte hinzufügen** ergänzt eine weitere; mindestens eine Spalte bleibt.

Das ⋯-Menü verschiebt und entfernt Felder.

Medienfelder und Bildspalten nehmen Webadressen oder lokale Dateien mit Beschreibung an. Hydor kopiert lokale Dateien und Webbilder bis 15 MB, damit Ergebnisse überall sichtbar bleiben. Webvideos bleiben Links. Öffentliche Läufe dürfen nur Webadressen verwenden.

Zahlen, reale Datumswerte und vollständige Webadressen werden geprüft. Bei Fehlern erhält der Agent eine Korrekturanforderung. Grenzen sind dreißig Ergebnisfelder und sechzehn Tabellenspalten. Programmatische Namen entstehen beim ersten Speichern aus der Überschrift und bleiben danach für stabile Schnittstellen erhalten.

### Beispiele

Beispiele sind Testeingaben mit Ergebnisprüfungen, damit Änderungen überprüfbar werden. **Beispiel hinzufügen** ergänzt optionalen Namen und Eingaben. **Prüfung hinzufügen** definiert Regeln wie `{{answer.unread}} > 0`, `{{find.count}} = 3` oder `{{reply}} contains Lisbon`. **{ }** fügt Formulareingaben, Schrittergebnisse, **Ergebnis** als `{{answer.field}}` und **Antwort** ein.

**Alle testen** führt Beispiele gegen den sichtbaren, auch ungespeicherten Stand aus. Der Kolben an einem Beispiel testet nur dieses. Angezeigt werden bestanden, Anzahl fehlgeschlagener Prüfungen oder nicht abgeschlossen, Dauer und Kosten. Aufgeklappt siehst du beobachtete Werte fehlgeschlagener Regeln wie „answer.unread ist 2“.

### Ausführung

Der Abschnitt erinnert daran, für unbeaufsichtigte Läufe einen Modus ohne ständige Rückfragen zu wählen, etwa Automatisch oder einen mit erlaubten Änderungen.

- Programm, Modell, Denkaufwand und Modus wie bei vorgefertigten Apps, anfangs Automatisch.
- **Agent**: keiner oder General, Researcher, Writer beziehungsweise ein eigener mit Anweisungen, Stufe und Budget; siehe [Agenten](/guide/agents).
- **Ordner**: standardmäßig je Lauf neu. **Auswählen** legt einen vorhandenen festen Arbeitsordner fest, **Jedes Mal neu** setzt zurück. Bei festem Ordner bleiben Anhänge in separaten Uploadordnern.

### Tools

Hier bestimmst du erlaubte Hydor-Tools für Websuche, Browser, Seiten, Memory und anderes. Zunächst sind Alle aktiv. Deaktivieren zeigt die einzeln auswählbare Liste mit Zweck. Eigene Datei- und Befehlstools des Agenten richten sich nach seinem Modus, nicht dieser Liste.

### Erforderliche Keys

Unter Einstellungen stehen Tresornamen mit Zweck, erlaubten Hosts, Beschaffungslink und Anleitung sowie optionaler Nutzung und Erlaubnis für lokale Befehle. **Erforderlichen Key hinzufügen** ergänzt einen. Agenten erfahren Namen und Verwendung; die installierende Person hinterlegt [Werte separat](#give-it-the-keys-it-needs). Sie gehören nie zur App-Datei.

### Grenzen

- **Läufe pro Tag aus allen Quellen** zählt seit Mitternacht Formular, API, Agenten, CSV, öffentliche Seiten und Unterhaltungen auf der App-Oberfläche. Darüber wird abgelehnt. Leer bedeutet unbegrenzt.
- **Ausgabenlimit pro Lauf in US-Dollar** stoppt beim Erreichen; leer bedeutet kein Limit. Siehe [Nutzung, Limits und Kosten](/guide/usage).

### Vor dem Speichern testen

**Testlauf**, mobil der Kolben, öffnet das Formular des sichtbaren, auch ungespeicherten Entwurfs. Fülle es aus und wähle **Test ausführen**. Der Dialog verfolgt den Lauf, Sitzung öffnen zeigt die Unterhaltung, Erneut testen kehrt zum Formular zurück. Gespeicherte Apps listen Tests unter Läufe. **Als Beispiel behalten** übernimmt abgeschlossene Testeingaben zur Ergänzung von Prüfungen.

## App ändern, kopieren oder löschen

Auf deiner App-Seite:

- **Bearbeiten** öffnet den Builder. Erst Speichern übernimmt; davor steht Noch nicht gespeichert. Neue Läufe nutzen Änderungen, aktive behalten ihre Startversion.
- **Weitere → Duplizieren** erstellt eine eigene Adresse mit Namenszusatz „copy“. Die Oberfläche wird als eigene Seite kopiert, öffentliche Freigabe bleibt geschlossen. Keys und Datensätze werden nicht kopiert.
- **Weitere → Löschen** fragt nach und entfernt Läufe, Keys und öffentliche Seite, aktive Läufe werden gestoppt. Gestartete Sitzungen bleiben. Bei aus Datei installierten Apps heißt dies Deinstallieren mit derselben vollständigen Löschung; Wiederherstellung benötigt erneut die Datei.

Vorgefertigte Apps bleiben nach Deinstallation dagegen [erneut installierbar](#install-or-uninstall-a-ready-made-app).

### Versionen

Jede funktionale Speicherung erzeugt eine Version. **Versionen** am Ende von Bearbeiten zeigt neueste zuerst mit Änderungen, speichernder Instanz Du/Agent/Ordner/Installation, Zeitpunkt und bei getesteten gespeicherten Beispielen Bestehenszahl, Laufzeit und Kosten. So erkennst du Verbesserungen. **Wiederherstellen** holt eine ältere Fassung in den Editor; Speichern erstellt daraus die aktuelle neue Version. Graphpositionen und Oberflächen mit eigener Versionsverwaltung erzeugen keine App-Version. Läufe behalten ihre ausgeführte Fassung.

### Als Dateien bearbeiten

**Ordner** am Ende einer gespeicherten App legt über **App-Ordner erstellen** einen dateibasierten Arbeitsbereich an, standardmäßig Hydor/Apps im Benutzerordner. Du kannst ihn in jedem Editor oder mit einem Coding-Agenten bearbeiten. app.json enthält Formular, Auftrag und Ergebnis, instructions/ Schrittanweisungen als Markdown, steps/ Codefunktionen, screens/ Oberflächen, graph.json Positionen. .naget/ liefert Schema und Codetypen für Vervollständigung und Prüfung. Gültige Dateiänderungen erscheinen als Version aus dem Ordner und im offenen Builder. Bei parallelen Änderungen wird gewarnt, Fehler werden ohne Übernahme genannt. Speichern im Builder aktualisiert den Ordner. **Nicht mehr synchronisieren** beendet den Abgleich und behält Dateien. App-Daten bleiben außerhalb.

Lokal funktioniert auch die CLI im Hydor-Ordner: `node dist/server/cli.js app new "Reading list"` erstellt App und Ordner, `app folder <app>` den Ordner, `app dev <app>` prüft Beispiele nach jedem Speichern, `app try <app>` einmal mit Fehlercode bei gescheiterter Prüfung. `app export` und `app import` übertragen eine Datei mit Vorschau vor Installation. `app help` listet Befehle. Ihr eigener Key erscheint unter Einstellungen → Computer als „Befehlszeile dieses Computers“.

## App aus eigenen Programmen aufrufen

Skripte, Kurzbefehle und Programme können Apps per Key starten und Ergebnisse erhalten. Öffne **API und Freigabe → API**.

1. **Neuer Key**, Verwendungszweck und **Key erstellen**.
2. Kopiere ihn sofort; er wird nie erneut vollständig angezeigt.

Der Key erlaubt nur diese App, sonst nichts in Hydor. Die Liste zeigt Name, erste und letzte Zeichen und letzte Nutzung. Widerrufen beendet den Zugriff sofort.

Ein Beispiel mit App-Adresse und Eingaben:

```bash
curl -X POST https://your-address/api/apps/trip-planner/run \
  -H "Authorization: Bearer napp_…" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"destination": "Lisbon", "start": "2026-11-20", "days": 4}, "wait": 300}'
```

- Formulareingaben stehen unter `inputs` mit Platzhalternamen. Dateien als lokaler Pfad oder unter `files` mit `name` und Base64-Inhalt als `data`.
- `wait` wartet höchstens 900 Sekunden.
- Die Antwort enthält `status` für den Laufzustand, `result` für die Ergebnisfelder, `reply` für die letzte Agentenantwort und `session` als Link zur Sitzung. Falls vorhanden kommen `error` mit dem Fehler und `costUsd` mit den Kosten in US-Dollar hinzu.
- Laufstatus folgt über `GET …/run/<run>?wait=60`.
- Bei Proxy-Zeitlimits wie Cloudflares 100 Sekunden kürzer warten und erneut abfragen.

Pro Key sind 30 Aufrufe pro Minute möglich; das App-Tageslimit gilt ebenfalls. Mehr unter [Hydors API](/guide/api).

## Andere Agenten die App als Tool nutzen lassen

Claude Code, Cursor und andere mit Hydors MCP-Server verbundene Agenten können deine App als Tool aufrufen. **API und Freigabe → Andere Agenten → Anderen Agenten anbieten** bietet etwa `app_trip_planner` aus der Adresse an und ist anfangs aktiv. Eingabe entspricht dem Formular. Lange Läufe liefern eine ID für `app_run_status`. Adresse und Tokens stehen unter [Einstellungen → App → Andere Agenten verbinden](/settings?s=connect).

## Öffentliche Seite freigeben

Unter **API und Freigabe → Öffentliche Seite** können alle mit Link ohne Anmeldung das Formular nutzen und eigene Ergebnisse sehen, ohne weiteren Hydor-Zugriff.

Öffentliche Läufe nutzen immer Custom. Richte dafür zuerst ein Modell unter [Einstellungen → Agenten → Modelle](/settings?s=models) ein.

1. Aktiviere den Schalter. Zustand wird Offen für alle mit Link und zunächst das erste Custom-Modell gewählt.
2. Kopiere oder öffne den Link aus Hydor-Adresse, `/a/` und App-Adresse.
3. Wähle Modell, **Web durchsuchen und lesen** (anfangs aktiv; sonst nur Modellwissen) sowie Besucherlimit pro Stunde, zunächst 5, öffentliche Läufe pro Tag, 50, und Tagesbudget, 2 $. Eine Zeile zeigt aktuelle Nutzung.

Besucher sehen Name, Symbol, Beschreibung, Formular, laufenden Fortschritt und ihre letzten zehn Läufe anhand eines Browsercookies. Auftrag, Einstellungen, fremde Läufe, Sitzung und Kosten bleiben verborgen; Fehler werden allgemein formuliert. Anhänge sind bis 3 MB möglich, Antworten kürzer. Der Fußbereich erinnert an mögliche Fehler.

Öffentlich arbeitet Custom ohne Befehle, Dateien, Memory und Verbindungen in einem danach gelöschten temporären Ordner. Erlaubt sind Ergebnisfelder und gegebenenfalls Websuche und öffentliche Seiten. Anhänge werden als Text übergeben. Das verbleibende Tagesbudget begrenzt jeden Lauf.

Höchstens drei öffentliche Läufe je App und acht insgesamt laufen gleichzeitig. Besucher warten auf ihren vorigen Abschluss; je Adresse sind insgesamt 60 Läufe pro Stunde möglich. Sie zählen zum App-Tageslimit und erlauben keine Nachfragen. Deaktivieren schließt die Seite mit entsprechendem Hinweis.

## App je CSV-Zeile ausführen

Öffne **Für jede Zeile** für eine als CSV gespeicherte Liste. Vorgefertigte Apps benötigen zuerst eine eigene Kopie.

1. CSV auswählen oder ablegen. Erste Zeile enthält Spaltennamen. Komma, Semikolon und Tab funktionieren, höchstens 500 Zeilen.
2. Weise jeder Frage eine Spalte oder einen konstanten Wert zu. Namen werden vorgeschlagen. Pflichtfragen brauchen eine Zuordnung.
3. Prüfe die Vorschau der ersten Zeilen.
4. Lies die [Kostenschätzung](#what-a-run-costs) und wähle Gleichzeitigkeit 1, 2, 3, 4 oder 6, anfangs 2.
5. Starte über Ausführen mit Zeilenzahl.

Dateifragen interpretieren Zellen als lokale Pfade oder Webadressen. Ungültige Zeilen scheitern mit Ursache in der Tabelle. Ein überschrittenes Tageslimit verhindert den gesamten Start.

Die Ergebnistabelle zeigt Zeilennummer, erste zwei Fragen, Status, bis zu vier Ergebnisfelder oder Antwort und Lauflink. Oben stehen erledigte und gescheiterte Zahl, Kosten, Gleichzeitigkeit und Fortschritt.

- Stoppen beendet wartende und unterbricht aktive Läufe.
- CSV exportiert Eingaben, alle Ergebnisse, Status, Fehler, Kosten und Sitzungslink. Potenzielle Tabellenformeln erhalten ein führendes Apostroph.
- × schließt die Tabelle.

Die Verarbeitung übersteht Hydor-Neustarts. Frühere Tabellen listet die letzten dreißig mit Fortschritt und Status laufend, gestoppt oder fertig zum erneuten Öffnen.

## App automatisch ausführen

Apps können zu Uhrzeit, regelmäßig, einmalig, per Webhook oder bei Änderungen an Feed, Seite, Wert oder Ordner laufen. Die festgelegten Eingaben entsprechen dem Formular; Läufe erscheinen unter Läufe.

- Einrichten über App → Läufe → Automatische Ausführung → Zeitplan hinzufügen. Name, Antworten und [Auslöser](/guide/tasks#when-it-runs) angeben. Testlauf probiert ohne Speichern.
- Webhooks können `{{body.title}}`, `{{headers.name}}` oder `{{query.name}}` einsetzen, Watcher `{{change}}`. Externe Werte gelten als Daten, nie als Anweisungen.
- Jeder Lauf meldet Ergebnis oder Fehler mit Link. Die Zeile pausiert, startet sofort, zeigt Verlauf oder entfernt den Zeitplan. Er steht auch unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks).
- Apps mit eigener Seite wie [Explore](#explore), Wochenbericht und Laborbuch bieten Automatisch aktualisieren direkt über Schieberegler. Gespeicherte Eingaben, täglich, werktags oder wöchentlich und Uhrzeit sind wählbar. Vorgefertigte Standards sind etwa Freitag 16:00 für Wochenberichte und täglich 21:00 fürs Laborbuch.

## Kosten eines Laufs

Nach Abschluss stehen Kosten auf Laufseite und in der Liste: Agentenangabe oder API-Bewertung, bei Custom aus Eingabe und Ausgabe geschätzt. Lokale Modelle kosten 0 $.

Vor CSV-Starts schätzt Hydor die Gesamtkosten aus dem Median von bis zu dreißig abgeschlossenen Läufen. Bei Ausgabenlimit wird auch das Maximum genannt. Ohne bisherigen Abschluss fordert der Hinweis zu einem ersten einzelnen Lauf auf.

Begrenze Kosten über Ausgabenlimit pro Lauf, Tagesanzahl und bei öffentlicher Seite Tagesbudget. [Nutzung, Limits und Kosten](/guide/usage) zeigt die Gesamtnutzung.

## Apps mit Schritten

Apps können den Auftrag auf Schritte verteilen: Agent für eine Teilaufgabe, schnelle Modellfrage, Tool zum Seitenabruf, Entscheidung anhand einer Regel, Wiederholung für eine Liste. Ergebnisse fließen weiter und am Ende in die Ergebnisfelder. Feste Schritte können günstiger, schneller und verlässlicher arbeiten als ein Agent für alles. Sie erlauben außerdem dauerhafte Daten, Aufrufe anderer Apps und parallele Verarbeitung.

Erstelle sie im Builder oder per Agentenauftrag. **Auftrag** wechselt zwischen Einzelaufgabe, Liste und am Computer standardmäßig Graph. Liste/Graph wandelt eine Einzelaufgabe in einen ersten Agentenschritt um; ein einzelner Agentenschritt kann zurückgewandelt werden. Schritt hinzufügen wählt den Typ, Anklicken öffnet Einstellungen, ⋯ verschiebt, kopiert oder entfernt. Entscheidung, Wiederholung und Parallelzweige enthalten eigene Unterlisten. **{ } → Wert einsetzen** fügt Formulareingaben, frühere Ergebnisse wie `{{find.records}}` und lokale Standardwerte ein: Datum `{{today}}`, Datum/Uhrzeit `{{now}}`, Wochentag `{{weekday}}`, Zeitzone `{{timezone}}`, Herkunft `{{run.source}}` wie web, api, task, screen oder batch und Lauf-ID `{{run.id}}`. **Ergebnisquelle** ordnet Werte Feldern zu; leer verwendet den letzten gleichnamigen Wert. Fehler erscheinen am Schritt, Testlauf prüft den sichtbaren Stand. Im Graph zeigen graue Linien Reihenfolge und Zweige, Rahmen Wiederholungen, Rot Fehlerpfade und farbige Linien Datenabhängigkeiten.

Am Computer kannst du direkt im Graph bauen, mobil in der Liste. Formular steht oben, Standardwerte daneben, Schritte darunter und Ergebnis am Ende. Gestrichelte Linien verbinden genutzte Eingaben und Ergebnisse. Formular- und Ergebnisknoten öffnen ihren Tab, Schritte die Einstellungen daneben mit Menü. + auf einer Linie fügt dort ein; Schritt hinzufügen beginnt einen leeren Pfad. Ziehe den rechten Knotenpunkt auf einen Schritt, um einen Wert in Auftrag, Tooleingabe oder Regel einzusetzen, oder auf freie Fläche für einen neuen nutzenden Schritt. Knoten verschieben Unterzweige mit. Doppelklick auf Wertlinien setzt Knicke, Ziehen ändert sie, weiterer Doppelklick entfernt. Automatisch anordnen sortiert neu; Umschalt+Mehrfachklick gruppiert mit Notiz. Hintergrundziehen verschiebt die Ansicht, Strg+Mausrad zoomt, Vollbild nutzt das Fenster.

**Ausprobieren** startet einen Test direkt im Graph. Schritte und aktive Verbindungen leuchten, Wertlinien zeigen beim Darüberzeigen den Inhalt. Einstellungen nennen den letzten Versuch. **Test davor anhalten** setzt einen Haltepunkt bis Fortsetzen oder Einzelschritt, das vor dem nächsten anhält. **Einfrieren** als Schneeflocke verwendet das Ergebnis des vorigen Versuchs, damit du teure vorherige Schritte nicht erneut bezahlen musst.

**Zu Baustein zusammenfassen** wandelt per Umschalt ausgewählte aufeinanderfolgende Schritte in eine eigene App um, ersetzt durch einen App-Aufruf. Externe Eingaben werden ihr Formular, nachfolgend benötigte Ausgaben ihre Ergebnisfelder. Andere Apps können denselben Baustein nutzen; Änderungen gelten für alle. Datenspeichernde Schritte bleiben in der ursprünglichen App, da Bausteine eigene Daten haben. Listen und Tabellen werden als Text übergeben.

Oder beauftrage einen Agenten: „Lies jeden Link, fasse ihn mit einem schnellen Modell zusammen und speichere ihn in einer Leseliste“. Er erstellt, prüft und testet Schritte, die du danach bearbeitest. Seine Tools lesen Apps, speichern ganze Apps, Teile oder einzelne Schritte nach Validierung, testen Beispiele mit Ergebnisprüfung, erstellen Oberflächen und lesen oder ergänzen Datensätze. Änderungen und Löschungen von Datensätzen erfolgen auf deinen Auftrag, über die Oberfläche oder nach Nachfrage. Vor Übergabe nennt er Laufkosten.

Gespeicherte Apps erscheinen als Karte und breit während der Erstellung neben der Unterhaltung. **Daneben öffnen** öffnet erneut, **App-Seite öffnen** die eigenständige Seite. Deine dort gespeicherten Änderungen erreichen den Agenten mit der nächsten Nachricht. Vor späterem Speichern liest er deine Version. Bei parallelen ungespeicherten Änderungen bietet ein Hinweis Laden oder Meinen Stand behalten. **Agenten dazu fragen** im Schrittmenü bereitet eine Nachricht zu diesem Schritt vor.

Schritttypen:

- **Agenten fragen**: eigene Sitzung mit Tools und strukturiertem Ergebnis, von der Laufseite aus öffnbar.
- **Modell fragen**: schnelle Antwort ohne Tools zum Sortieren, Extrahieren und Zusammenfassen, günstig oder mit lokalem Modell kostenlos.
- **Tool verwenden**: Hydor-Funktionen mit Eingaben, etwa Websuche, Seitenlesen, Bilder und Videos für Listen finden, Adresse mit gespeichertem Key aufrufen, Dokumente lesen, Bilder erstellen, benachrichtigen, Profilwissen lesen, gewichten und Bibliotheksinhalte im benannten Projekt speichern. Für Publikationen offene Volltexte, Metadaten und BibTeX finden, Leseliste und Zotero synchronisieren. Gefundene Bilder eignen sich für Bildspalten, YouTube-/Vimeo-Links für Videoelemente.
- **Entscheiden**: nach Regel wie Preis unter 100 oder einer vom Hilfsmodell beantworteten Frage verzweigen.
- **Wiederholen**: je Listenelement, optional mehrere gleichzeitig, oder bis zu einer Bedingung.
- **Gleichzeitig**: parallele Zweige, danach gemeinsam fortfahren.
- **App aufrufen**: eine andere App als Schritt. Schritt hinzufügen bietet eigene markierte Bausteine und vorgefertigte wie Seite zusammenfassen, Übersetzen, Mit Webbelegen antworten, Kategorisieren und Fakten extrahieren, die dabei als eigene Kopie entstehen. Gleichnamige Formularfragen werden vorgefüllt. Bausteinänderungen wirken auf alle Aufrufer.
- **Daten speichern**: Datensätze hinzufügen, finden, ändern und entfernen.
- **Person fragen**: wartet auf Ja/Nein oder ein kurzes Formular, erreichbar über Benachrichtigung, Laufkarte und Posteingang. Standardzeitlimit eine Woche, danach Fehler. Auswahlfragen können eine frühere Liste wie `{{find.items}}` allein als Option enthalten; dann werden Listenelemente oder Textzeilen zu Optionen. Mehrfachauswahl liefert `{{step.field}}` mit einer Auswahl pro Zeile. Auch Frage, Hilfe und andere Optionen können Werte einsetzen. Leere dynamische Auswahl wird zum Textfeld.
- **Code ausführen**: JavaScript, TypeScript oder Python verarbeitet Eingabewerte und liefert benannte Ausgaben. Sandbox ohne Netzwerk und lokale Dateien, abgesehen von installierten Paketen. Externe Aktionen laufen ausschließlich über `ctx`: `ctx.model` fragt ein Modell, `ctx.agent` einen Agenten, `ctx.tool` verwendet ein App-Tool, `ctx.ask` wartet auf deine Antwort, `ctx.data` verwaltet Datensätze und `ctx.app` startet eine andere App. Jeder dieser Aufrufe erscheint als eigener Schritt im Laufprotokoll. Ganze Abläufe mit Bedingungen und Schleifen sind möglich. Nach Neustart läuft der Code erneut, doch frühere Aufrufe liefern gespeicherte Ergebnisse ohne erneute Ausführung. Installationskarten nennen Code-Schritte.
- **Wert berechnen**: sofort und kostenlos erstes/letztes Element, Anzahl, Summe, Mittelwert, Minimum, Maximum, Feld je Element, Textverknüpfung, Duplikatentfernung, Feldsortierung, Zahlumwandlung oder Datumsverschiebung. Ergebnis ist `{{id.value}}`, der Graph zeigt eine kleine Kapsel.

Schritte können bedingt laufen und bei Fehler Ersatzschritte ausführen, ohne Ergebnis fortsetzen oder bei Tool-, Modell-, Code-, Daten- und App-Schritten **Arbeit durch Agenten übernehmen lassen**. Dieser erhält Eingaben und Fehler, liefert die nötigen Werte und erlaubt Fortsetzung. Die Laufseite nennt Übernahme und Ursache.

Die Laufseite zeigt Schritte laufend und nach Abschluss Zustand, Dauer und Kosten. Sitzungsbuttons öffnen Agentenschritte. Schrittbasierte Läufe haben keine Nachfragen; ändere Eingaben und starte neu.

Nach Abschluss bietet jeder Schritt **Ab hier erneut ausführen (↺)**. Frühere Schritte liefern kostenlos gespeicherte Werte aus dem letzten Lauf, weitere verwenden die aktuelle App. Auch Builder-Testläufe unterstützen dies für Änderungen späterer Schritte.

### Abläufe festigen

Im Builder zeigen jüngste Läufe fehlgeschlagene, von Agenten übernommene Schritte mit Häufigkeit und letzter Ursache. **Agenten korrigieren lassen** fragt den Agenten daneben oder startet App builder. Wiederholt gleich arbeitende Agentenschritte bieten **Ablauf festigen**: feste Toolschritte der bisherigen Aufrufe und anschließend Modellschritt mit Anweisungen und Toolergebnissen. **An Beispielen testen**, ohne Beispiele mit bisherigen Laufeingaben, vergleicht Dauer und Kosten. **Diese Schritte verwenden** ersetzt den Agentenschritt im Entwurf, Speichern übernimmt. Bei Toolfehlern bleibt die Agentenübernahme erhalten, damit bisher funktionierende Läufe weiterlaufen.

App-erstellende Agenten erhalten dieselben Vorschläge und Testschritte.

### Gespeicherte Daten einer App

Apps können Datensatzlisten über Läufe hinweg halten, etwa Links oder CRM-Kontakte. Schritte und Agententools lesen und ändern sie. Optional definierte Felder wie Titel, Score und Datum werden validiert. Im Builder unter Gespeicherte Daten ergänzt Liste hinzufügen Name und optionale Felder; ohne Schema sind beliebige Datensätze möglich.

Auch vorgefertigte Apps speichern Daten: Die [Leseliste](/guide/researchers#reading-list) verwaltet Publikationen und ihre Seite bearbeitet sie. Andere Apps wie Literaturmatrix lesen dieselben Einträge.

Schritte und Agenten können nach Wörtern und bei aktivierter [Bedeutungssuche](/settings?s=memory&find=Search%20by%20meaning) sinngemäß suchen, beste Treffer zuerst. knowledge_search und recall suchen auch Wissensbasen und Memory-Notizen.

Daten bleiben bis zum Löschen der App erhalten; öffentliche Läufe greifen nie darauf zu. Vorgefertigte Apps wie Annotation workbench und Laborbuch behalten Daten auch bei Deinstallation für eine spätere Wiederinstallation.

### App mit Memory

Agenten können Hinweise für spätere Läufe wie Vorlieben, hilfreiche Quellen und Fehlervermeidung im eigenen App-Memory speichern. Jeder Lauf beginnt damit. [Einstellungen → Memory](/settings?s=memory) zeigt es als Projekt unter dem App-Namen. Aktiviere **Über Läufe hinweg merken** unter Gespeicherte Daten im Builder.

### Lokale Voraussetzungen

Apps können Node-/Python-Pakete oder Befehle wie ffmpeg benötigen. Pakete werden bei Installation oder Änderung nur im App-Ordner installiert, nie systemweit. Der erste Lauf wartet darauf. Die App-Seite zeigt Installation oder Fehler mit Ausgabe anzeigen und Erneut installieren. Fehlende externe Befehle werden genannt und müssen von dir installiert werden.

## Ergebnisgestaltung

Die Ansicht besteht aus Tabs und Detailseiten, passenden Elementen wie Tageskarten oder Produktbewertungen und Klickaktionen. Ohne Ansicht erscheinen nur Ergebniskarte und Tabellen.

Der Buildertab **Design** zeigt das letzte Ergebnis, **Beispielergebnis** stattdessen passende erfundene Daten. Fehler stehen darunter. Vorschauklicks wechseln Seiten und Häkchen; App-erreichende Aktionen wie Agentenanfragen und neue Läufe funktionieren auf der Laufseite.

- **Agenten gestalten lassen** startet bei gespeicherter App App builder oder beauftragt den Agenten neben der App. Er schreibt, testet und korrigiert die Ansicht.
- **Mit Ergebnis beginnen** erzeugt eine Seite mit Block je Ergebnisfeld.
- **Agenten ändern lassen** bearbeitet eine vorhandene Ansicht.
- **Als Code bearbeiten** öffnet JSON mit Seiten, HTML-Elementen, Werten wie `{{result.days}}`, CSS und Ereignissen nach [Apps: Ansichten](/guide/api#apps-views). Die Vorschau folgt der Eingabe.
- **Ansicht entfernen** stellt nach Speichern einfache Karten wieder her.

Ereignisse können Detailseiten mit angeklicktem Element öffnen, Häkchen und Filter setzen, gegebenenfalls laufbezogen speichern, kopieren, Adressen öffnen, Agenten um Änderungen bitten bei Apps ohne Schritte, andere Flows starten, neue Läufe mit geänderten Eingaben starten, andere Apps aufrufen und Datensätze bearbeiten. Für die eigene App-Seite markierte Ansichten ersetzen das Formular und zeigen Daten sowie letzten Lauf. Aktualisieren startet sofort, Einstellungen speichert Formulareingaben und Zeitplan täglich, werktags oder wöchentlich wie bei [Explore](#explore). Arbeitsbereiche wie Leseliste brauchen weder Aktualisieren noch Zeitplaneinstellungen; sie zeigen Daten direkt und öffnen ihr Formular über Buttons. Ansichten sind versionierter App-Bestandteil, reisen in der App-Datei und haben Elementdateien unter ui/.

Neben eigenen Elementen gibt es Text, Checklisten, Tabellen, Balkendiagramme und Medien:

- **Bilder** einzeln oder nebeneinander mit Beschreibung.
- **Videos** als lokale Datei oder YouTube-/Vimeo-Link mit Vorschaubild und Wiedergabe über der Seite.
- **Audio** für Aufnahmen und Songs.
- **Karten** mit Koordinaten, optional nummeriert und verbunden.
- **Plots** mit Plotly: Linien, Balken auch gestapelt, Flächen, Punkte, Kreise, Histogramme, Boxplots, Heatmaps sowie 3D-Punkte, Linien und Flächen.

**Widgets** sind eigene Skripte etwa für 3D-Szene, Spiel oder Diagrammbibliothek. Benannte Bibliotheken werden versionsgenau von jsDelivr geladen. Alles läuft in derselben Sandbox wie Seiten, ohne Zugriff auf Computer, Anmeldung oder andere Apps und nur mit erlaubten Ereignissen.

**Eigene Dateien** unter Design enthält Bilder, Video, Audio und Daten für die App. Hinzufügen erlaubt je 100 MB und insgesamt 150 MB. Bilder öffnen groß; Kopieren liefert den Ansichtsnamen wie `asset:tram.jpg` für Medienblock oder `src`. Dateien werden mitgeliefert. Die Vorschau verwendet letztes oder passendes Beispielergebnis mit eigenen Medien.

## Eigene App-Oberfläche

Eine App kann statt des Formulars eine lebendige Arbeitsseite zeigen: Leseliste mit suchbarer Tabelle, CRM mit Follow-up-Entwurf oder Tracker mit Zähler. Formulare starten Läufe, Ergebnisse erscheinen nach Abschluss und Tabellen aktualisieren sich bei Datenänderungen.

- **Erstellen** über Weitere → Oberfläche erstellen aus Formular, Ergebnis, Tabelle je Liste, Agentenunterhaltung und früheren Läufen. Danach öffnet diese Seite.
- **Ändern** über Weitere → Oberfläche bearbeiten im [Seiteneditor](/guide/library#change-a-page-yourself). Verschiebe und gestalte Teile oder frage den Agenten. Hinzufügen → App bietet Formular, Ergebnis, Läufe, Agentenunterhaltung, Formulare und Buttons anderer Flows sowie Tabelle und Zähler jeder Liste.
- **Agentenauftrag** etwa „Zeige ungelesene Links oben und einen Button für die Wochenzusammenfassung“. Agenten verwenden dieselben Bausteine und können passende Zusatzflows erstellen.

**Mit dem App-Agenten sprechen** nutzt dessen Modell und Tools. Senden oder Enter startet eine Nachricht. Der Agent kann Daten finden und bearbeiten, Flows starten und Ergebnisse abwarten, etwa „Füge Piranesi hinzu, schon gelesen“ oder „Was ist noch ungelesen?“. Die letzte Unterhaltung bleibt, Neue Unterhaltung beginnt neu und Frühere Unterhaltungen öffnet vorhandene. Sie sind getrennt von App-Läufen gespeichert.

Die Oberfläche gehört ausschließlich der App, erscheint nicht in der Bibliothek, wird mit ihr gelöscht und mit ihrer Datei übertragen. Für Formularstarts mit früheren Eingaben nutze Mit diesen Antworten erneut ausführen auf einer Laufseite.

## App als Datei teilen

Eine App lässt sich als einzelne Datei aufbewahren oder auf einem anderen Hydor installieren.

- **Herunterladen** über App → Weitere → Als Datei herunterladen oder Kartenmenü, auch vorgefertigte. `.hydor-app` enthält Auftrag, Abhängigkeiten, eigene Medien und Daten sowie aufgerufene Apps. Optional Gespeicherte Datensätze einschließen übernimmt deren Inhalt. Arbeitsordner, Keywerte und öffentliche Seite bleiben hier; Keys werden nur benannt und am Ziel abgefragt.
- **Installieren** über Neue App → Aus Datei installieren mit `.hydor-app`, `.zip` oder `.json` bis 160 MB oder Ablegen auf der Apps-Seite. Vor Änderungen zeigt eine Karte Name, Zweck, Fragen mit optionaler Kennzeichnung, Ergebnis, Ablauf, Agentenverfügbarkeitsschalter und Keyabfrage jetzt oder später. Der aufklappbare technische Überblick öffnet bei Prüfbedarf automatisch: Ausführende, Schritte, Dateien, Skripte und Bibliotheken, Oberflächen, Tools, Modelle, enthaltene Apps, Pakete und Befehle, Daten, Memory und Grenzen. Modelle sind lokal eingerichtet, anders benannt, über OpenRouter mit anfänglicher Keyabfrage und automatischem Modelleintrag oder fehlend. Für fehlende wählst du Ersatz oder den Agentenstandard. Installieren übernimmt.

Die Karte nennt Anpassungen: fremde feste Ordner entfallen zugunsten neuer Laufordner, Vollzugriffsmodi werden Automatisch, fehlende Agenten entfallen. Identische enthaltene Apps werden wiederverwendet, andere daneben installiert. Öffentliche Seite bleibt geschlossen, API Keys fehlen.

Eine vorgefertigte App-Datei kennt ihre Herkunft. War sie deinstalliert, stellt die Datei sie wieder her; war sie vorhanden, entsteht eine eigene veränderbare Kopie.

## Einen Agenten fragen

Hydor-Agenten können Apps nach deiner Kartenfreigabe erstellen und ausführen. Beispiele:

- „Erstelle Weekly report mit Fragen nach Projekt und Zeitraum und einer Zusammenfassung plus Änderungstabelle.“
- „Mache diese Sitzung zu einer wiederverwendbaren App.“
- „Hefte Trip planner und Weekly report oben an, den Bericht zuerst.“
- „Welche Apps habe ich zuletzt genutzt und wie liefen sie?“
- „Starte Price check erneut mit denselben Antworten.“
- „Plane für uns zwei vier Tage Lissabon im Mai.“ Trip planner übernimmt und fragt Fehlendes ab.
- „Wie wird das Wetter in Zermatt diese Woche und was koche ich aus Eiern, Spinat und Kartoffeln?“ Beide passenden Apps zeigen eigene Ergebnisse.
- „Frage mich mit zehn schwierigen Fragen zum Römischen Reich ab.“
- „Finde Hundeparks und Cafés beim Berliner Alexanderplatz.“ Explore a place fragt vor dem Start, sofern nicht freigegeben.
- „Starte Trip planner künftig ohne Nachfrage.“ Das ergänzt dieselbe Freigabeliste wie Immer ausführen.
- „Starte Trip planner für Lissabon, vier Tage ab 20. November, und zeige das Ergebnis.“
- „Führe Company research für diese zwanzig Firmen aus und gib mir die Tabelle.“
- „Starte Trip planner jeden Freitag um 18:00 für drei Tage Lissabon.“
- „Öffne Cover letter öffentlich mit höchstens 1 $ Tagesbudget.“
- „Stoppe alle Price-check-Läufe und widerrufe ihre API Keys.“
- „Deinstalliere Weekly news digest und deaktiviere Price check für Agentensitzungen.“
- „Erstelle eine schrittbasierte App, die Links liest, mit einem schnellen Modell zusammenfasst und in einer Leseliste speichert.“
- „Ergänze Competitor watch um eine Benachrichtigung nur bei Änderungen.“
- „Lass mich in Shopping scout nach der Produktsuche Vergleichskandidaten per Mehrfachauswahl wählen.“
- „Installiere reading-list.hydor-app aus Downloads.“
- „Erstelle eine OpenWeather-App für Stadtwetter mit meinem OpenWeather API Key.“
- „Ergänze City break um Stopps auf einer Karte und Tageskosten als Diagramm.“
- „Füge ~/Pictures/Lisbon hinzu und zeige die Fotos auf der ersten Seite.“
- „Ergänze Weekly report um ein 3D-Diagramm als three.js-Widget.“
- „Gib Reading list eine Oberfläche mit ungelesenen Links oben und Wochenberichtbutton.“
- „Gestalte Weekly report mit Zusammenfassung und Zahlen oben sowie einer Seite mit abhakbaren Änderungskarten.“
- „Ergänze je Shop in Price check einen Button für einen erneuten Lauf nur dieses Shops.“
- „Festige Link digest und teste zuerst die Beispiele.“
- „Lass den Schritt Look up its title bei Fehlern an einen Agenten übergeben.“
- „Aktualisiere Explore jeden Morgen um 6:30 und berücksichtige immer Formel 1.“
