# Apps

Eine App ist eine wiederholbare Aufgabe: Du füllst ein kurzes Formular aus, wählst Ausführen und ein Agent erledigt die Arbeit. Das Ergebnis erscheint in einer passenden Ansicht mit interaktiven Seiten, Karten, Diagrammen, Bildern und Videos oder als Ergebniskarte mit Tabellen. Hier erfährst du alles über vorgefertigte Apps, Ausführung und Keys, Nutzung durch Agenten, eigene Apps mit Schritten, Ansichten, Dateien, Daten, Memory und Oberfläche, Freigaben per API Key, für Agenten, als öffentliche Seite oder CSV-Stapel sowie Weitergabe als Datei. Verbundene Dienste stehen neben den Apps; siehe [Verbundene Apps, Keys und Tools](/guide/connections).

![Apps: eigene und bereits installierte vorgefertigte Apps](images/apps.webp)

## Was eine App ist

Eine App ist ein kleines Werkzeug für eine klar umrissene Aufgabe. Du beantwortest Fragen, ihre Schritte recherchieren und berechnen, und die Antwort erscheint passend als Karte, Diagramm, Tabelle oder andere Ansicht. Öffne sie auf der Apps-Seite oder beschreibe in einer Sitzung ihren Zweck, damit ein Agent sie dort ausführt. Apps konzentrieren sich bewusst auf eine Art von Frage.

Die App enthält alles außer den von Lauf zu Lauf wechselnden Angaben:

- **Das Formular**: die Fragen, die jemand vor jedem Lauf beantwortet („Wohin?“, „Wie viele Tage“).
- **Auftrag**: Anweisung an den Agenten mit eingesetzten Antworten.
- **Ergebnis**: vom Agenten ausgefüllte Felder wie Zusammenfassung, Liste oder Tabelle. Ohne Ergebnisfelder wird die normale Agentenantwort verwendet.
- **Ausführender Agent**: der Agent, sein Modell, sein Modus und die Tools, die er benutzen darf.

Jedes Mal, wenn du eine App ausführst, startet Hydor eine Sitzung mit der ausgefüllten Aufgabe. Der Agent arbeitet sie von Anfang bis Ende durch, ohne dir zwischendurch Fragen zu stellen: Er trifft vernünftige Annahmen und sagt, welche das waren. Dieser eine Durchgang heißt **Lauf**. Danach kannst du um Änderungen am Ergebnis bitten, und der Agent liefert ein aktualisiertes ab.

Öffne die Seite „Apps“ über die Kachel **Apps** unten in der Seitenleiste oder gehe zu [/apps](/apps). Auf einem Smartphone ist die Seitenleiste eine Schublade: Öffne sie zuerst. Du kannst auch jede App, eigene oder fertige, finden, indem du ihren Namen in das Suchfeld eingibst (Ctrl+K, auf einem Mac ⌘K).

## Orientierung auf der Apps-Seite

Die Seite trägt die Überschrift **Apps** und hat zwei Tabs: **Agenten-Apps**, die Apps, um die es in diesem Thema geht, und **Verbundene Apps**, die Dienste, die jeder Agent nutzen kann, einmal verbunden, mit den Keys, die sie benutzen ([Verbundene Apps öffnen](/guide/connections#open-connected-apps)). Jeder Tab zählt, was er hat. Bei **Agenten-Apps** steht oben **Neue App**: Ihr Menü hat **Einem Agenten beschreiben**, **Von Grund auf beginnen** und **Von einer Datei installieren**. Dann, von oben nach unten:

- **Angepinnt**: die Apps, die du am meisten benutzt, als große Kacheln in der Reihenfolge, in die du sie gebracht hast, jede einen Fingertipp vom Öffnen entfernt. **Oben anheften** im **Mehr** (⋯) der Karte einer App oder im Menü **Mehr** ihrer eigenen Seite legt sie hierher, und **Lösen** dort nimmt sie wieder weg. Ziehe eine Kachel, um sie zu verschieben (auf einem Smartphone halte sie zuerst gedrückt), oder nutze das **Mehr** (⋯) der Kachel: **Lösen**, **Nach links verschieben** und **Nach rechts verschieben**. Bis zu 12 Apps. Die App merkt sie sich, sodass jedes Gerät dieselben zeigt.
- **App suchen: Wetter, Rezepte, Reise …**: ein Feld, das beim Tippen jede App findet, nach ihrem Namen, ihrer Art oder dem, was sie tut (jedes Wort, das du tippst, muss irgendwo passen, und eine Mehrzahl findet die Einzahl: „Rezepte“ findet eine Rezept-App), unter deinen eigenen, den fertigen, denen, die du deinstalliert hast, und den Bausteinen, das beste Ergebnis zuerst. Enter öffnet das erste, Esc leert das Feld. Es bleibt beim Scrollen der Seite oben. Darunter steht für jede Art von App ein Chip mit der Anzahl (zuerst **Alle**, dann die Arten der fertigen Apps), um eine Art zu zeigen.
- **Kürzlich verwendet**: die Apps, die du zuletzt ausgeführt hast, jede einmal, die neueste zuerst (bis zu 8): aus ihrem Formular, von ihrer eigenen Seite oder Ansicht oder von einem Agenten für dich in einem Chat ausgeführt. Jede Karte sagt, was zuletzt von ihr verlangt wurde, wie dieser Lauf steht und wann, mit **Ergebnis öffnen** (eine App mit eigener Ansicht öffnet sich auf ihrer Seite), **Antworten**, solange sie auf dich wartet, **Verfolgen**, solange sie arbeitet, oder **Lauf öffnen**, wenn sie fehlgeschlagen ist oder angehalten wurde, und **Erneut ausführen**, das ihr Formular mit denselben Antworten ausgefüllt öffnet. **Neueste Läufe** neben dem Titel klappt deine letzten Läufe (bis zu sechs) als Liste auf. Solange du noch keine App benutzt hast, bilden sie unter diesem Namen den Bereich. Läufe aus Zeilen einer CSV-Datei und von öffentlichen Seiten bleiben außerhalb dieser Liste, bei ihrer eigenen App, ebenso die einer App, die sich auf ihrer eigenen Seite öffnet (Entdecken), die dort ihren letzten zeigt. Solange du keine anheftest, sagt eine Zeile, dass du die, die du am meisten benutzt, über ihr Menü ⋯ anheften sollst.
- **Beginne mit**: solange du noch keine App ausgeführt hast, vier fertige, die die meisten benutzen (**Wetterausblick**, **Reiseplaner**, **Kochen mit deinen Vorräten** und **Produkte vergleichen**), jede einen Klick von ihrem Formular entfernt, mit einer Zeile dazu, was Apps sind, und **Mehr erfahren** ([Was eine App ist](#what-an-app-is)).
- **Deine eigenen Apps**: die, die du gemacht oder aus einer Datei installiert hast, mit der Anzahl, und die Kachel **App erstellen**, die eine neue App öffnet (um sie einem Agenten zu beschreiben, von Grund auf zu beginnen oder eine Datei zu installieren). Ab vier eigenen Apps sortiert die Schaltfläche neben dem Titel sie nach **Am häufigsten verwendet**, **A bis Z** oder **Neueste**. Dieses Gerät merkt sich deine Wahl.
- **Fertige Apps**: die, die mit Hydor kommen, installiert, nach ihren Arten (**Forschung**, **Planung**, **Einkaufen**, **Wetter**, **Sport**, **Essen**, **Spaß** und die übrigen): Führe eine aus oder mache sie zu deiner eigenen, um sie zu ändern.

Jede Karte, auch deine eigene, ist gleich groß: ihr Symbol, ihr Name und was sie tut, dann was sie verlangt (die Fragen ihres Formulars oder **Bereit zur Ausführung**), kleine Zeichen (zeige auf eines, um seine Erklärung zu sehen: Ihre Antwort öffnet sich in einer eigenen Ansicht, mit Karten, Diagrammen und Tabellen. Sie funktioniert in Chats, du kannst also in jeder Sitzung nach dem fragen, was sie tut, und der Agent führt sie dort aus. Sie braucht einen Key, den die App noch nicht hat. **Öffentlich**, wenn ihre öffentliche Seite offen ist), **Nicht installiert** oder **Baustein**, wo das zutrifft, und wann sie zuletzt lief. Ihr **Mehr** (⋯, oben rechts. Auf einem Computer erscheint es, wenn du auf die Karte zeigst) hat **Öffnen**, **Oben anheften** (oder **Lösen**) und **Als Datei herunterladen**. Wenn nichts zu dem passt, was du getippt hast, sagt die Seite „Das macht noch keine App“ mit **Einem Agenten beschreiben**, das den App builder mit deinen Worten startet.

Darunter:

- **Fertige Apps zum Installieren**: erscheint dort, sobald du eine fertige App deinstalliert hast. Jede Karte zeigt ihre Art, was sie tut und was du von ihr bekommst (die Seiten ihrer Ansicht, etwa beim Reiseplaner **Deine Reise**, **Tag für Tag**, **Im Voraus buchen** und **Budget**), und **Installieren** (siehe [Eine fertige App installieren oder deinstallieren](#install-or-uninstall-a-ready-made-app)).
- **Bausteine** ist eingeklappt mit Anzahl: kleine Apps als Schritte eigener Abläufe, etwa Seite zusammenfassen, übersetzen, mit Webbelegen antworten, kategorisieren und Fakten extrahieren. Eigene Bausteine stehen dabei; **Schritt hinzufügen** bietet sie im Builder an.

Zustandsmarkierungen sind **Wartet**, **Wird gestartet**, **In Arbeit**, **Braucht dich** für Freigaben oder Antworten, **Erledigt**, **Fehlgeschlagen** und **Angehalten**.

Ziehe `.hydor-app` oder `.json` irgendwo auf die Seite zum Installieren. Zuerst erscheint eine Beschreibungskarte; siehe [App als Datei teilen](#share-an-app-as-a-file).

Mobil ist die Seite einspaltig. Angeheftete und zuletzt verwendete Apps sowie Kategorienchips scrollen horizontal; Karten konzentrieren sich auf Name und Zweck.

## Vorgefertigte App verwenden

Diese kommen mit Hydor, installiert: Sie gehören von Anfang an zu **Deine Apps**, und Agenten können sie in deinen Sitzungen für dich ausführen (siehe [Eine App von einem Agenten für dich ausführen lassen](#have-an-agent-run-an-app-for-you)). Jede arbeitet in Schritten: Ihre Seite zeigt **Wie es funktioniert**, und **Als Ablaufgraph** (oder **Eigene Kopie erstellen**) öffnet sie im Builder. Jede gibt ihre Antwort in einer eigenen Ansicht ab, mit Seiten für ihre Teile und Schaltflächen, die etwas tun (siehe [Ihre Ansicht](#its-view)). Ihre Agentenschritte laufen mit Claude Code, solange du auf ihrer Seite keinen anderen Agenten wählst. Ihre schnellen Schritte fragen das Hilfsmodell (Einstellungen → Modelle). Die mit einer Frage „Lass mich …“ warten zwischendurch auf dich, nur wenn du sie ankreuzt und jemand da ist, der antworten kann: bei Ausführung aus ihrem Formular oder durch einen Agenten in einer deiner Sitzungen.

- **Bericht der tiefgehenden Recherche**: ein Bericht mit Quellen zu jeder Frage, bei dem das Web durchsucht, Fakten gegengeprüft und jede Aussage belegt werden. Du gibst das Thema an, worauf der Schwerpunkt liegen soll, die Tiefe und für wen er gedacht ist. Sie plant die Fragen, sucht je drei gleichzeitig, bewertet die Quellen, liest die besten Seiten nebeneinander, sucht noch einmal, wo einer Frage Quellen fehlen, und schreibt den Bericht mit nummerierten Quellenangaben. **Fragen zuerst prüfen** lässt sie auf dich warten, damit du die Fragen behältst oder änderst. Ihre Ansicht hat **Zusammenfassung** (die Frage, wie sicher sie ist, und die wichtigsten Erkenntnisse, jede mit **Vertiefen**, das einen eigenen Bericht dazu startet), **Vollständiger Bericht** (mit **Bericht kopieren**) und **Quellen**, die du nach Herausgeber anzeigen kannst.
- **Reiseplaner**: ein Plan Tag für Tag, geprüft an deinen Daten (Öffnungszeiten, Veranstaltungen, Reisezeiten), mit einem Budget und dem, was du im Voraus buchen solltest. Er rechnet die Daten aus und sucht dann nebeneinander Veranstaltungen und Feiertage, das Wetter (die Vorhersage, wenn die Reise zehn Tage oder weniger entfernt ist), was es zu sehen gibt und wo man übernachten kann, und die Fortbewegung, bevor er die Tage plant und das Budget zusammenzählt. **Vor der Planung selbst auswählen** lässt ihn dich fragen, wo du übernachten willst und was unbedingt dabei sein muss. Seine Ansicht hat **Deine Reise** (die Reise in Zahlen, den Plan, die Tage auf einen Blick und Tipps; **Entspannt**, **Ausgewogen** oder **Verpackt** und **+ Noch ein Tag** planen sie auf diese Weise neu), **Tag für Tag** (eine Zeitleiste, auf der du jeden Morgen, Nachmittag und Abend abhakst, jeder Tag mit einem Bild seiner Hauptsehenswürdigkeit als Überschrift und mit einer Karte des Gebiets jedes Tages), eine Seite für jeden Tag (sein Bild, mit **Tagesplan kopieren** und **Forschung** zu seiner Umgebung), **Karte** (das Gebiet jedes Tages auf einer Karte, nummeriert und der Reihe nach verbunden), **Im Voraus buchen** (eine Liste zum Abhaken, während du buchst) und **Budget** (ein Diagramm und jede Schätzung).
- **Produkte vergleichen**: aktuelle Preise, unabhängige Tests und bekannte Probleme, gewichtet nach dem, was dir wichtig ist, mit einer klaren Empfehlung. Wenn du einen Bedarf beschreibst, statt Produkte zu nennen, findet sie zuerst die Möglichkeiten (**Selbst auswählen, was verglichen wird**). Dann sieht sie sich jedes an, je drei gleichzeitig, bewertet sie und ordnet sie danach, was dir wichtig ist. Ihre Ansicht hat **Empfehlung** (das Produkt mit seinem Bild, seinem Preis und warum, und die anderen, die sie abgewogen hat), **Seite an Seite** (die Bewertung jedes Produkts von 100 in einem Diagramm, dann jedes mit seinem Bild, seinen Stärken und Schwächen, die Empfehlung markiert), eine Seite für jedes Produkt (mit **Belastbarkeit recherchieren**) und **Darauf solltest du achten**. Ihre Antwort nennt auch **Empfehlung**, so wie der Vergleich sie aufführt, für Programme.
- **Fragen und Antworten zum Dokument**: Antworten aus einem Dokument, das du anhängst, jede mit der genauen Stelle und wo sie steht. Sie liest das Dokument, findet die Stellen zu jeder Frage, beantwortet je drei gleichzeitig mit einer Zusammenfassung daneben und lässt einen Agenten alles lesen, wenn eine Frage noch unbeantwortet ist. Ihre Ansicht hat **Antworten** (jede mit ihrer Stelle und wo sie steht. **Frage suchen** grenzt sie ein, und **Mehr zu diesem Dokument fragen** führt sie mit neuen Fragen und derselben Datei noch einmal aus) und **Das Dokument**.
- **Aus Besprechungsnotizen werden Aufgaben**: Entscheidungen, Aufgaben mit Verantwortlichen und Terminen, offene Fragen und eine Folge-E-Mail, aus rohen Notizen oder einem Transkript. Sie teilt die Notizen auf, zieht heraus, was entschieden wurde, rechnet die Fristen ab heute aus und fragt dich, wer die Aufgaben übernimmt, die niemand übernommen hat (**Frag mich, wer die noch nicht zugewiesenen Aufgaben übernimmt**). Ihre Ansicht hat **Übersicht** (wer da war, die Besprechung in Zahlen, die Zusammenfassung und was entschieden wurde), **Aktionen** (hake jede ab, wenn sie erledigt ist, oder zeige die einer Person), **E-Mail zur Nachbereitung** (mit **E-Mail kopieren**) und **Noch offen**.
- **Anschreiben**: ein Brief für eine Stelle, aufgebaut auf echten Belegen aus deinem Werdegang, mit ehrlich benannten Lücken. Sie liest die Stellenanzeige, findet heraus, was die Stelle verlangt, schlägt das Unternehmen nach, während sie deine Belege zuordnet, schreibt den Brief und prüft und überarbeitet ihn bis zu zweimal. Ihre Ansicht hat **Der Brief** (auf einer eigenen Seite, mit **Brief kopieren**; **Warm**, **Zuversichtlich** oder **Formell** und **Kurz** oder **Standard** schreiben ihn auf diese Weise neu), **Warum du passt** (jede Anforderung neben deinem Beleg) und **Lücken, auf die man sich vorbereiten muss**, zum Abhaken.
- **Unterrichtsplan**: eine Unterrichtsstunde mit Zeiten, von ihren Zielen her rückwärts geplant, mit Aktivitäten, Verständnisprüfungen, Unterstützung und Vertiefung. Sie prüft die Fakten, die sie vermittelt, und verteilt die Minuten so, dass sie aufgehen. Ihre Ansicht hat **Übersicht** (die Ziele und die Materialien zum Abhaken, sobald du sie bereitgelegt hast), **Zeitleiste** (die Stunde als ein Streifen, jede Aktivität so breit wie ihre Minuten, dann jede Aktivität), **Hilfestellungen und Verständnisfragen** und **Ganzer Plan** (mit **Plan kopieren**).
- **Wöchentliche Nachrichtenübersicht**: die vergangene Woche zu den Themen, denen du folgst, aus Originalberichten, mit zusammengeführten Dubletten und warum jede Meldung wichtig ist. Sie durchsucht die Woche jedes Themas, je drei gleichzeitig, führt gleiche Meldungen zusammen, liest die besten und wählt aus, welche bleiben. Ihre Ansicht hat **Geschichten** (jede mit dem Bild von ihrer eigenen Seite; zeige die eines Themas, markiere jede als gelesen oder nutze **Forschung** für eine) und **Die Zusammenfassung** (mit **Zusammenfassung kopieren**).
- **Vertrag erklären**: Was ein Vertrag aussagt, in einfachen Worten: wichtige Begriffe, Termine, Ungewöhnliches und was du vor dem Unterschreiben fragen solltest. Hänge die Datei an oder füge den Text ein. Die App teilt ihn in seine Klauseln auf, liest die Teile nebeneinander und lässt einen Agenten alles Ernste noch einmal prüfen. Ihre Ansicht hat **Kurz gesagt** (was im Vertrag steht, die Warnsignale in Zahlen und die Fragen, die du stellen solltest, mit **Fragen kopieren**), **Warnsignale** (nach Schwere sortiert, mit der Möglichkeit, nur eine Art anzuzeigen), **Schlüsselbegriffe** und **Termine**.
- **Kleine Web-App erstellen**: Eine funktionierende App aus einer Beschreibung, in schlichtem HTML, CSS und JavaScript, die sich aus einer Datei öffnen lässt und getestet wird, bevor du sie bekommst. Sie plant die App (**Plan vor der Umsetzung prüfen**), baut sie, testet sie und korrigiert sie, bis die Tests bestehen, höchstens zweimal. Ihre Ansicht hat **Umgesetzte Funktionen** (wie du sie öffnest, ihre Dateien und **Mit einer Änderung erneut erstellen**) und **Nächste Schritte** zum Abhaken.

Die Apps für alltägliche Dinge sind kleiner und schneller: Sie holen echte Daten von kostenlosen Diensten, wo es welche gibt (Open-Meteo fürs Wetter, TheSportsDB, TheMealDB für Rezepte, TVmaze, CheapShark, Open Library, Wikipedia, Wikidata, OpenStreetMap), ein Programm berechnet, was genau herauskommen muss, und ein schnelles Modell liest, wählt aus und sagt es in einfachen Worten. Keine braucht einen Key.

- **Wetterausblick**: Die kommenden Tage an jedem Ort: Höchst- und Tiefstwerte und die Regenwahrscheinlichkeit in Diagrammen, die nächsten 48 Stunden, die besten Tage für das, was du vorhast, was du anziehen solltest und worauf du achten musst. Gib einen Ort an (eine Stadt, oder eine mit ihrer Region, wie „Paris, Texas“). Ihre Ansicht hat **Prognose** (das aktuelle Wetter, jeden Tag als Kachel, die ihre Stunden öffnet, und die Diagramme; mit **In °F** oder **In °C** und **14 Tage vorausblicken** startest du sie noch einmal so), **Nächste 48 Stunden** und **Passende Kleidung** (mit **Kopiere die Prognose**, **Die besten Monate zum Verreisen** und einer Karte des Ortes).
- **Beste Reisezeit**: Das Wetter Monat für Monat an jedem Ort, gemittelt über die letzten fünf Jahre: Temperaturen, Regentage und Sonnenstunden in Diagrammen, jeder Monat bewertet danach, was du dort vorhast (Städtereise, Strand, Wandern, Schnee, der Hitze entfliehen). Ihre Ansicht hat **Monat für Monat** (oben ein Foto des Ortes, die besten Monate, die zwölf Monate eingefärbt danach, wie gut jeder passt, und die Diagramme; mit **Am besten für** wählst du eine andere Art von Reise), **Beste Reisezeit** (die besten Monate und warum, die Monate, die du meiden solltest, und Tipps) und **Die Zahlen**.
- **Team-Tracker**: Die nächsten Spiele, die letzten Ergebnisse und die Form eines beliebigen Teams, sein Tabellenstand und die Nachrichten der Woche. Ihre Ansicht hat **Das Team** (sein Wappen, seine Form als farbige Buchstaben, das nächste Spiel mit **Vorschau anzeigen**), **Ergebnisse** (erzielte und kassierte Tore in einem Diagramm), **Spielplan** (jedes Spiel mit **Vorschau**, das eine Spielvorschau startet) und **Nachrichten**.
- **Spielvorschau**: Zwei Teams vor ihrem Aufeinandertreffen: ihre Form, ihre letzten Begegnungen, Teamnachrichten und was die Experten erwarten, mit den Chancen für jedes Ergebnis. Ihre Ansicht hat **Vorschau** (beide Wappen, das wahrscheinliche Ergebnis, die Chancen als ein Balken), **Form und Treffen** (wer ihre letzten Begegnungen gewonnen hat, in einem Diagramm) und **Teamnachrichten** (mit **Vorschau kopieren** und dem Team **Folgen**).
- **Kochen mit deinen Vorräten**: Rezepte für das, was in deinem Kühlschrank ist: was jedes davon von deinen Zutaten braucht und was du noch bräuchtest, mit Fotos, zeitlich geplanten Schritten und einem Video, wenn es eines gibt. Sag, wie du dich ernährst und wie viel Zeit du hast; Salz, Öl und Gewürze gelten als vorhanden, wenn du nichts anderes sagst. Ihre Ansicht hat **Rezepte** (**Etwas Schnelleres** startet sie noch einmal), eine Seite für jedes Rezept (seine Schritte als ein Streifen in Minuten, abgehakt, während du kochst, seine Zutaten markiert, wenn du sie hast, **Schritte kopieren**) und **Was kaufen?**.
- **Speiseplan und Einkaufsliste**: Abendessen für eine Woche (bis zu zwei), ausgewählt für deinen Haushalt, deine Ernährung und deine Vorlieben, jedes mit seinem Rezept und Foto, und eine Einkaufsliste für alle zusammen, mit addierten Mengen, nach Abteilung geordnet. Ihre Ansicht hat **Die Woche** (**Weitere Woche planen**), eine Seite für jedes Abendessen (seine Zutaten, Zubereitung und ein Video), **Einkaufsliste** (zeige eine Abteilung an, hake beim Einkaufen Dinge ab, **Liste kopieren**) und **Tipps**.
- **Geschenkideen**: Durchdachte Geschenke für jemanden in deinem Budget, Dinge und Erlebnisse, jedes mit der Begründung, warum es zu der Person passt, seinem üblichen Preis und einem Angebot zum sofortigen Kauf, mit Preis und Shop. Ihre Ansicht hat **Ideen** (jede mit einem Bild des Angebots zum Kaufen, nach Art geordnet; mit **☆ Speichern** behältst du die, die dir gefallen, **Ähnliche Inhalte** startet sie noch einmal) und **Nach Preis** (die Preisbereiche in einem Diagramm).
- **Was du ansehen möchtest**: Filme und Serien passend zu deiner Stimmung heute Abend, mit dem Streamingdienst in deinem Land (zuerst deine Dienste), ihrer Länge, ihrem Trailer und warum sie passen. Ihre Ansicht hat **Heute Abend** (die Empfehlung für heute Abend, dann die anderen; ein ▶ auf einem Bild bedeutet, dass es einen Trailer gibt), eine Seite für jeden Titel (mit dem dort abgespielten Trailer und **Gesehen: noch einmal auswählen**) und **Seite an Seite**.
- **Spielefinder**: Spiele passend zu dem, was du magst, und dazu, wo du spielst (unter den Möglichkeiten auch Nintendo Switch 2), schon erhältlich, bald erscheinend (mit dem Erscheinungsdatum), oder beides, jedes mit seinem Bild und Trailer, warum es passt und wie lange man dafür braucht; für den PC der heutige Bestpreis und der niedrigste Preis aller Zeiten. Ihre Ansicht hat **Spiele** (ein ▶ auf einem Bild bedeutet, dass es einen Trailer gibt, und bei einem noch kommenden Spiel steht, wann es erscheint), eine Seite für jedes (mit dem dort abgespielten Trailer, seinem Angebot und **Ähnliche Inhalte**), **Preise** (jetzt und am niedrigsten, in einem Diagramm) und **Zeit zum Abschluss**.
- **Quiz zu jedem Thema**: Ein Quiz, das du auf seiner Seite spielst, mit Fakten aus Wikipedia: Wähle eine Antwort, und es zeigt dir, ob du richtig lagst und warum, mit deinem Punktestand oben; die Antworten werden jedes Mal neu gemischt. Ihre Ansicht hat **Quiz spielen** (**Neu beginnen**, **Eine schwierigere Frage**, **Neue Fragen**), **Antworten** und **Zum Thema** (mit **Quiz kopieren**).
- **Buchfinder**: Bücher, die du wahrscheinlich lieben wirst, ausgehend von denen, die du magst, jedes in Open Library auf Cover, Seitenzahl und Bewertung geprüft. Ihre Ansicht hat **Dein Regal** (eine Seite für jedes Buch, mit **Ähnliche Inhalte**) und **Leseliste** (**Als gelesen markieren**).
- **Was ist los?**: Dinge, die du in einer Stadt an den Tagen unternehmen kannst, die du wählst (das kommende Wochenende, wenn du nichts sagst): Konzerte, Märkte, Ausstellungen und Familienausflüge, im Web gefunden, mit dem Wetter für jeden Tag. Ihre Ansicht hat **Nach Tag** (jede Veranstaltung mit dem Bild von ihrer eigenen Seite), **Karte** (jeder Veranstaltungsort nummeriert) und **Nach Art**; markiere, wohin du gehst (**Kommst du?**), oder nutze **Liste kopieren**.
- **Sparplan**: Wie du ein Sparziel bis zu einem Datum erreichst: was du jeden Monat zur Seite legen musst, mit Zinsen, das wachsende Guthaben in einem Diagramm und wann du dein Ziel erreichen würdest, wenn du 20 % mehr oder weniger sparst. Ihre Ansicht hat **Der Plan** (**50 mehr pro Monat sparen** oder **50 weniger sparen**, wenn du einen Betrag angegeben hast), **Monat für Monat** (die Meilensteine und jeder Monat) und **Tipps**.
- **Meine Daten als Diagramm darstellen**: Eine Tabelle, eine CSV-Datei oder eingefügte Zahlen, umgewandelt in bis zu drei Diagramme der Art, die zu ihnen passt, mit ein paar Sätzen dazu, was sie zeigen. Ihre Ansicht hat **Diagramme**, **Was die Daten zeigen** (jede Erkenntnis, zum Kopieren) und **Die Daten** (ihre Spalten zusammengefasst, und **Weitere Frage zu diesen Daten stellen**).
- **Ein Thema als Zeitleiste**: Ein beliebiges Thema als Zeitleiste, aus Wikipedia gelesen: seine wichtigen Momente mit Datum (bis zu dreißig **Ausführlich**), seine Epochen und die Geschichte in Kürze. Ihre Ansicht hat **Die Zeitleiste** (zeige einen Strang an; **Frage mich dazu ab** startet ein Quiz zum Thema) und **Im Diagramm** (die Momente nach Jahr, die Wendepunkte größer, und die Epochen).
- **Ort erkunden**: Was es rund um einen beliebigen Ort gibt (eine Stadt, einen Stadtteil oder eine Sehenswürdigkeit), auf einer Karte: Die Arten von Orten, die du unter **Was dir gefällt** nennst (Hundewiesen, Cafés, Spielplätze …), kommen zuerst, aus OpenStreetMap, dann die bekanntesten Sehenswürdigkeiten aus Wikipedia und Wikidata, dann Museen, Parks und Wahrzeichen, jeweils mit einem Bild und einer Zeile, die besten für dich herausgesucht und in Laufreihenfolge gebracht. Nennst du nichts, arbeitet sie nur mit den Sehenswürdigkeiten. Ihre Ansicht hat **Der Spaziergang** (die Stationen nummeriert und auf der Karte verbunden, jede zum Abhaken als gesehen; **Das Wetter dort**) und **Alles rundherum** (zeige eine Art an).

Forschung- und Labor-Apps beobachten Fachgebiete, lesen und prüfen Arbeiten und verwalten Experimente und Berichte. Einige haben wie Explore eine eigene Seite und automatische Aktualisierung. [Forschung](/guide/researchers) erklärt die Zusammenhänge.

- **Paper-Radar**: Jeden Morgen die neuen Papers deines Fachgebiets (die von arXiv, in den Kategorien, zu den Themen und von den Personen, denen du folgst, und die von OpenAlex zu deinen Themen), gewichtet nach deinen Projekten, Themen und deinem Profil, jedes mit einem Satz dazu, was es macht, und warum es für dich wichtig ist. Es öffnet sich auf einer eigenen Seite und kann sich jeden Tag aktualisieren. Seine Ansicht hat **Heute** (die Papers unter dem Projekt oder Thema, zu dem jedes passt, mit **☆ Speichern**, **Zitieren**, **PDF**, **Vertiefen** und **Nicht für mich**, womit du die Auswahl der nächsten Tage steuerst) und **Gespeicherte Papers** (mit **Alles als BibTeX kopieren** und **Zur Leseliste hinzufügen**). Siehe [In deinem Fachgebiet auf dem Laufenden bleiben](/guide/researchers#keep-up-with-your-field).
- **Benachrichtigungen über Zitierungen**: Wer deine Papers seit dem letzten Nachsehen zitiert hat, mit dem Satz, der dich zitiert (die Erwähnung deines Papers markiert), und ob er auf deiner Arbeit aufbaut, sie vergleicht, ihr widerspricht oder sie nur erwähnt. Sie öffnet sich auf einer eigenen Seite. Ihre Ansicht hat **Neu** (die neuen Zitierungen nach deinem Paper; zeige eine Art an) und **Deine Papers** (jedes mit seinen Zitierungen und wie viele davon neu sind).
- **Neue Modelle beobachten**: Neue Modelle einer Art auf Hugging Face (Reranker, Embedder und mehr), geprüft anhand deiner Lizenzen, Größe und Downloads, die Karte jedes Modells zusammengefasst und, mit deinem Evaluationsbefehl, jedes in Experimente ausgeführt; du erfährst nur dann etwas, wenn eines dein bisher bestes schlägt. Es öffnet sich auf einer eigenen Seite. Seine Ansicht hat **Modelle** (wo jedes steht, was seine Karte sagt, sein Ergebnis) und **Deine Evaluation**.
- **Deadline-Radar**: Die Fristen deiner Konferenzen und Journale aus den offenen Listen ccfddl und ai-deadlines, von AoE (oder der Zeitzone, die ihre Ausschreibung angibt) in deine umgerechnet, mit Erinnerungen an den Tagen, die du angibst (14, 3 und 1), in einer einzigen Benachrichtigung, und mit dem Seitenlimit und der Vorlage jeder Ausschreibung verlinkt. Es öffnet sich auf einer eigenen Seite. Seine Ansicht hat **Zeitleiste** (jede Frist mit der verbleibenden Zeit, **Fristen kopieren**, **Zeige die vergangenen**) und **Konferenzen**.
- **Fortlaufender Forschungsüberblick**: Eine Seite pro Thema, die wächst, wenn neue Papers erscheinen (die von arXiv und OpenAlex und die Papers, die deine Ausgangspapers zitieren), jedes Paper zusammengefasst und mit dem Hinweis, wie es dazu steht, nach Themen gruppiert, die neuen markiert. Er öffnet sich auf einer eigenen Seite. Seine Ansicht hat **Verwandte Arbeiten** (jedes Thema Unterthema für Unterthema, mit **Abschnitt zu verwandten Arbeiten entwerfen**, einem LaTeX-Abschnitt mit `\cite`-Keys, von einem Agenten geschrieben, **BibTeX exportieren** und **Kein inhaltlicher Bezug** bei einem Paper) und **Diesmal neu**.
- **Lückenfinder**: Projektideen aus deinen Papers, gekreuzt mit denen dieses Monats in einem Gebiet, jede auf frühere Arbeiten geprüft (**neu**, **teilweise erledigt** oder **bereits erledigt**, mit dem nächstliegenden Paper) und auf die Rechenleistung zugeschnitten, die du hast, mit ihrem ersten Experiment. Ihre Ansicht hat **Forschungsideen** (jede mit **Planen**, was die App Forschungssprint damit öffnet, und **Vertiefen**) und **Zum Abgleich verwendete Arbeiten**.
- **Leseliste**: Deine Papers nach Projekt, jedes mit seinem PDF, BibTeX, Tags, Status und Notizen, im Abgleich mit Zotero. Sie öffnet sich bei deinen Papers: **+ Hinzufügen** sucht eines über seine DOI, arXiv-ID, seinen Link oder Titel und füllt es aus (eines, das du schon hast, wird ergänzt und nicht noch einmal hinzugefügt); durchsuche sie, zeige einen Status, ein Tag oder ein Projekt an und markiere jedes als **Zum Lesen**, **Wird gerade gelesen** oder **Mit dem Lesen fertig**. Die eigene Seite eines Papers hat seine Links, Notizen und BibTeX sowie **Reproduzieren**; **Nach Projekt** zählt die Papers jedes Projekts. **Mehr** hat **.bib importieren**, **.bib exportieren** und **Mit Zotero synchronisieren** (der Key wird beim ersten Mal abgefragt), und angehakte Papers ergeben eine **Literaturmatrix**. Siehe [Papers lesen und organisieren](/guide/researchers#read-and-organise-papers).
- **Literaturmatrix**: Papers nebeneinander gelesen und in eine Tabelle gebracht: eine Zeile für jedes, eine Spalte für jedes Vergleichskriterium (Aufgabe, Daten, Methode, Metriken, Ergebnisse und Grenzen, solange du sie nicht änderst), jede Zelle mit der Seite, aus der sie stammt. Gib die Papers eines pro Zeile an, oder „meine Leseliste“ mit einem Tag, einem Projekt oder einem Status. Sie liest drei auf einmal und legt die Matrix in deiner Bibliothek ab. Ihre Ansicht hat **Die Matrix** (**In der Bibliothek öffnen**, **Als Tabelle kopieren**, die Papers, die sie nicht lesen konnte, und warum, und **Eine weitere Spalte**), **Papers** und **Über die Papers hinweg**.
- **Ergebnisse eines Papers reproduzieren**: Der Code eines Papers wird ausgeführt, um seine Zahlen zu prüfen: Sie findet den Code (im Paper oder auf GitHub und im Web), baut eine saubere Umgebung auf, besorgt die Daten und Checkpoints, führt zuerst einen kleinen Ausschnitt aus und dann den echten Lauf (einen langen in [Experimente](/guide/experiments), auf den gewartet wird), innerhalb der Grenzen, die du setzt, und vergleicht jede Zahl mit der des Papers. Ihre Ansicht hat **War die Reproduktion erfolgreich?** (die Zahlen des Papers neben unseren, **Öffne den Ordner**, **Erneut versuchen**), **Erforderlicher Aufwand** und **Bericht**.
- **Begutachtung simulieren**: Dein Entwurf, begutachtet auf dem eigenen Formular und mit den eigenen Bewertungen der Konferenz (ACL Rolling Review, SIGIR, NeurIPS, ICLR, ICML, KDD, CIKM, WSDM, TheWebConf oder eines Journals), von bis zu fünf Gutachtern, jeder aus einem eigenen Blickwinkel, mit einem Meta-Gutachten eines Area Chairs. Ihre Ansicht hat **Die Gutachten**, **Meta-Gutachten** (mit dem, was den Entwurf zu Fall bringen könnte, das Gefährlichste zuerst), **Baselines und Ablationsstudien**, nach denen Gutachter fragen werden, und **Vor dem Absenden** (eine Liste zum Abhaken und **Auf diese Gutachten antworten**, was die App Rebuttal erstellen startet). Siehe [Begutachten, antworten und dein Paper präsentieren](/guide/researchers#review-answer-and-present-your-paper).
- **Rebuttal erstellen**: Die Punkte der Gutachten, über alle Gutachter hinweg gruppiert und sortiert (missverstanden, braucht ein Experiment, braucht Erläuterung, geringfügig), zu jedem eine Antwort im Rahmen des Limits der Konferenz entworfen, im Ton, den du wählst, mit Platzhaltern, wo ein neues Ergebnis nötig ist. Ihre Ansicht hat **Angesprochene Punkte** (jeder mit seinem Entwurf, seiner Länge im Verhältnis zu seinem Anteil und **Kopieren**), **Zu tun** (die Experimente und Änderungen zum Abhaken) und **Vollständige Erwiderung** (mit **Vollständige Erwiderung kopieren**).
- **Vortrag, Poster und Thread aus einem Paper**: Aus deinem Paper das, was du davon auswählst: Folien mit Zeitplan, mit seinen echten Abbildungen und Gleichungen und dem, was du dazu sagst, ein A0-Poster (ein LaTeX-Dokument), ein Thread für X und Bluesky und ein Beitrag für LinkedIn sowie eine Projektseite, abgelegt in deiner Bibliothek in dem Projekt, das du nennst. Ihre Ansicht hat **Was wurde gemacht** (jedes mit **Öffnen**), **Der Vortrag** (seine Folien als ein Streifen in Minuten) und **Thread** (die Beiträge jeder Plattform zum Kopieren).
- **Abbildungen optimieren**: Deine Plot-Skripte, passend gemacht für das Paper: die Spaltenbreite der Vorlage der Konferenz, die Schriftart des Papers, Farben, die auch Menschen mit Farbsehschwäche unterscheiden können, Vektor-PDFs mit eingebetteten Schriften (keine vom Typ Type 3) und eine Style-Datei für alle, die Originale daneben behalten. Ihre Ansicht hat **Vorher und nachher**, **Style-Datei** (mit **Kopieren**) und **Änderungen**.
- **Anmerkungs-Workbench**: Du und ein Modell beschriftet dieselbe Stichprobe von Texten. Gib ihr die Labels (bis zu neun), deine Richtlinien und die Texte: eine CSV- oder JSON-Lines-Datei, ein Hugging-Face-Dataset über seinen Namen oder eingefügte Texte; sie zieht eine zufällige Stichprobe und lässt das Hilfsmodell sie nach deinen Richtlinien beschriften. In ihrem Lauf beschriftest du: **Beschriftung** (ein Text nach dem anderen, eine große Schaltfläche und eine Taste von 1 bis 9 für jedes Label, das Label des Modells erst sichtbar, nachdem du deines vergeben hast), **Meinungsverschiedenheiten** nebeneinander, **Vereinbarung** (wie oft ihr euch einig seid, Cohens κ und die Konfusionsmatrix) und **Exportieren** (ein Download als CSV oder JSON Lines oder **Auf Hugging Face veröffentlichen** mit der Karte des Datasets). Siehe [Die Arbeit deines Labors organisieren](/guide/researchers#run-your-labs-work).
- **Forschungssprint**: Eine Forschungsfrage, durch einen Sprint an deinem eigenen Code geführt: Hypothesen, ein Plan und Code in einem eigenen Branch (in einem Worktree, den sie anlegt), Läufe in [Experimente](/guide/experiments) innerhalb deiner GPU-Stunden, ein Analyse-Notebook und ein kurzer Bericht; sie wartet darauf, dass du die Hypothesen beibehältst und die Läufe startest. Ihre Ansicht hat **Der Sprint** (jede Hypothese mit ihrem Urteil und ihren Belegen), **Ausführungen** (mit einer Ergebnistabelle im Vergleich zur Baseline) und **Bericht**.
- **Sweep-Planer**: Ein Hyperparameter-Sweep eines Trainingsskripts innerhalb eines Budgets an Läufen oder GPU-Stunden: Ein Agent liest die Argumente des Skripts und schlägt die Einstellungen und Werte vor (oder übernimmt deine), Experimente führt sie aus und stoppt schlechte Versuche früh, und ein Programm berechnet, wie viel jede Einstellung ausgemacht hat. Ihre Ansicht hat **Ergebnisse** (der beste Lauf, was sie gefunden hat, was du als Nächstes versuchen solltest), **Nach Einstellung** (ein Diagramm für jede) und **Alle Läufe**.
- **Wöchentlicher Fortschrittsbericht**: Deine Woche als Update für deine Betreuung, dein Team oder deine Führungskraft (was erledigt wurde, Ergebnisse mit ihren Zahlen, Probleme und Blockaden, der Plan für die nächste Woche, Fragen, die du stellen solltest), aus deinen Sitzungen (auch denen in VS Code und im Terminal), Commits, Läufen und deiner Lektüre. Er öffnet sich auf einer eigenen Seite mit dem dieser Woche, mit **Als Markdown kopieren**, **Als E-Mail kopieren** und **Als Dokument speichern**, und den früheren Wochen darunter; ist **Automatisch aktualisieren** an, kommt jeden Freitag um 16:00 ein neuer. Siehe [Berichte: deine Woche und dein Laborbuch](/guide/researchers#reports-your-week-and-your-lab-notebook).
- **Laborbuch**: Ein datierter Eintrag für jeden Tag, an dem du gearbeitet hast: was versucht, gefunden und entschieden wurde und was offen ist, mit Links zu den Sitzungen, Commits, Läufen und Dateien des Tages. Es öffnet sich auf einer eigenen Seite mit den Einträgen, den neuesten zuerst, einer Suche nach Wörtern und Bedeutung und dem Link jedes Eintrags zum Zitieren; ist **Automatisch aktualisieren** an, schreibt es den Eintrag des Tages jeden Abend um 21:00.

Vorgefertigte Apps lassen sich nicht direkt ändern. **Eigene Kopie erstellen**, mobil **Bearbeiten**, öffnet eine Kopie im Builder. Beim Erstellen wird sie zu deiner eigenen App.

### Entdecken

**Entdecken** ist ein Magazin, das für dich gemacht wird: Artikel und aktuelle Nachrichten zu dem, woran du arbeitest und was dir wichtig ist. Öffne es über **Entdecken** oben rechts auf der Startseite oder über die Seite Apps. Es hat kein Formular, das du jedes Mal ausfüllen musst: Es öffnet sich auf einer eigenen Seite, bei seiner neuesten Ausgabe, und Agenten führen es nicht in deinen Sitzungen aus.

- **Wie es auswählt**: Es liest dein Profil, die Notizen, die Memory über dich führt, und die Titel deiner letzten Sitzungen (ohne Sitzungen mit ausgeschaltetem Memory, ohne die Sitzungen, die Agenten für Teile ihrer Arbeit starten, und ohne App-Läufe, bei denen niemand zugesehen hat) und lässt das Hilfsmodell etwa sechs Themen auswählen, die dir jetzt Freude machen würden: etwa die Hälfte aus deiner Arbeit und die Hälfte aus dem Rest deines Lebens, nie etwas Privates. Zu jedem durchsucht es Nachrichtenseiten nach Geschichten der letzten zwei Wochen und sucht nach langen Lesestücken (Erklärstücke, Analysen, Essays), liest die besten Seiten nebeneinander, fasst jede zusammen und findet ihr Bild. Eine Website, die Programme aussperrt, wird anhand dessen zusammengefasst, was die Suche von ihr gezeigt hat. Eine Ausgabe dauert ein bis zwei Minuten.
- **Eine Ausgabe**: Ihr Datum und ihre Titelzeile, eine Notiz der Redaktion, die Themen (klicke eines an, um nur dessen Geschichten zu zeigen, **Alles** für alle), die Titelgeschichte, dann ein Abschnitt für jedes Thema. Jede Geschichte hat ihr Bild, **Nachrichten** oder **Long Read**, ihre Quelle und ihr Datum, was sie sagt und warum sie in deiner Ausgabe steht. Klicke auf ihr Bild oder ihre Überschrift, um sie auf ihrer Website zu lesen: Sie wird dann mit **✓ Gelesen** markiert, auch in späteren Ausgaben. **Vertiefen** startet dazu einen Bericht der tiefgehenden Recherche. Unter der Ausgabe listet **Früher** die vorherigen auf, jede öffnet sich so, wie sie war.
- **Aktualisieren** oben erstellt jetzt eine neue Ausgabe. Während sie arbeitet, sagt eine Zeile, was sie gerade tut, mit **Verfolgen**, und die Ausgabe, die du hast, bleibt, bis die neue fertig ist. Vor der ersten Ausgabe macht **Erstes Ergebnis erstellen** dasselbe.
- **Einstellungen**, das Schieberegler-Symbol neben **Aktualisieren**: **Automatisch aktualisieren** (aus, bis du es einschaltest) hat jeden Morgen eine neue Ausgabe bereit; darunter wählst du die Tage (**Jeden Tag**, **An Wochentagen** oder **Einmal pro Woche am** Tag deiner Wahl) und die Uhrzeit (07:00, wenn du sie nicht änderst). Es ist eine [geplante Aufgabe](/guide/tasks), also listet Einstellungen → Geplante Aufgaben sie ebenfalls auf; schaltest du sie aus, wird sie entfernt. Darunter stehen **Zu berücksichtigende letzte Sitzungen** (von wie vielen deiner letzten Sitzungen es die Titel liest: 1.000, wenn du es nicht änderst, höchstens 1.000), **Zusätzliche Themen** (Themen, die immer dabei sind, eines pro Zeile) und **Weglassen** (Themen oder Websites, die übersprungen werden, durch Kommas getrennt). **Speichern** übernimmt sie für jede Aktualisierung, auch die täglichen.
- **Eigene Kopie erstellen** und **Deinstallieren** findest du im Menü **Mehr** (⋯).

Eine Ausgabe benötigt etwa zwanzig kurze Hilfsmodellanfragen und ein Dutzend Websuchen. Bei angemeldetem Claude Code laufen die Modellanfragen über deinen Tarif.

### Vorgefertigte Apps installieren oder deinstallieren

Eine vorgefertigte App, die du nicht nutzt, kannst du entfernen: Öffne sie, dann **Mehr** (⋯) → **Deinstallieren**, und bestätige. Sie verschwindet aus **Deine Apps**, Agenten führen sie nicht mehr in deinen Sitzungen aus, und sie wartet auf der Seite Apps unter **Fertige Apps zum Installieren**. Ihre Läufe bleiben erhalten.

Um sie zurückzuholen, klicke dort auf ihre Karte. Eine Karte zeigt, was die App ist, bevor sich etwas ändert: was sie tut, **Welche Angaben die App benötigt** (die optionalen Fragen sind markiert), **Was du erhältst**, **Wie es funktioniert** in einfachen Worten und **Agenten können die App verwenden**, mit einem Schalter. **Installieren** bringt sie wieder zu deinen Apps zurück und öffnet sie. Auf ihrer eigenen Seite steht „Du hast die App deinstalliert“, auch mit **Installieren**.

## App ausführen

1. Öffne die App über die Apps-Seite oder die Suche. Oben steht auf ihrer Seite, was sie macht, darunter **Deine Antworten** (ihr Formular). Daneben (am Handy darunter) stehen **Was du erhältst** (die Seiten, in denen sich ihre Antwort öffnet, oder ihre Ergebnisfelder), **In deinen Sitzungen** (ob Agenten sie für dich ausführen dürfen: siehe [Lass einen Agenten eine App für dich ausführen](#have-an-agent-run-an-app-for-you)), **Neueste Läufe** (jeder öffnet seinen Lauf) und, bei einer App mit Schritten, **Wie es funktioniert**: ihre Schritte der Reihe nach, jeweils mit der Art, wie sie laufen (**für jeden** Eintrag, mehrere **auf einmal**, **nebeneinander**), und **Als Ablaufgraph**, was sie im Builder öffnet.
2. Fülle das Formular aus. Rote **\*** kennzeichnen Pflichtfelder.
3. Die Zeile unter dem Formular sagt, wer die App ausführt, zum Beispiel „Claude Code · Sonnet · hoher Aufwand · Automatisch“. Bei einer vorgefertigten App zeigt **Veränderung** die Auswahlfelder (siehe unten); bei einer eigenen App änderst du das mit **Bearbeiten**.
4. **Ausführen** öffnet die Laufseite mit Live-Fortschritt.

Fehlende Angaben werden unter dem Feld erläutert, etwa erforderlich, Zahl eingeben oder Datei auswählen, mit Hinweis auf die markierten Fragen.

Ein Link kann das Formular für dich ausfüllen: Die Adresse einer App mit `?in.`, dem Namen einer Frage, `=` und der Antwort öffnet ihre Seite mit dieser Antwort im Formular, bereit zum Ändern: Es läuft nichts, bis du **Ausführen** drückst. [Dieses Beispiel](/apps/t/reproduce-paper?in.paper=2104.08663) öffnet „Ergebnisse eines Papers reproduzieren“ mit einem ausgefüllten Paper; weitere Antworten folgen mit `&in.` (Dateien nie). Agenten geben dir solche Links, ebenso Schaltflächen in Ansichten (**Reproduzieren** bei einem Paper in der Leseliste). Eine App, die auf einer eigenen Seite startet, öffnet dann stattdessen ihr Formular.

### Fragetypen

- **Kurzer Text** als Zeile und **Langer Text** als wachsendes Feld.
- **Zahl**: Auch „$1,250.50“ wird als 1250.5 erkannt.
- **Datum** mit Auswahlfeld.
- **Wahl**: Wenige kurze Optionen erscheinen als Chips, mehr als Liste. Klicke einen ausgewählten Chip noch einmal an, um eine optionale Auswahl aufzuheben. Bei einer Wahl, die mehrere Optionen erlaubt, hakst du Chips ab, jeder abgehakte mit einem Häkchen; was du abhakst, wird als eine Wahl pro Zeile gespeichert.
- **Ja/Nein** als Schalter.
- **Datei** als Anhang.

Eine Frage kann eine Hilfezeile darunter haben, eine Beispielantwort im Feld und einen Wert, der am Anfang schon eingetragen ist.

### Agent, Modell, Denkaufwand und Modus wählen

Bei einer vorgefertigten App zeigt **Veränderung** neben der Zeile unter dem Formular die Auswahlfelder (und **Fertig** klappt sie wieder ein):

- Das Programm: Claude Code, Codex, Custom (Hydors eigener Agent für beliebige Modelle) oder ein anderer Agent, den du hinzugefügt hast.
- **Modell**: die Modelle des Agenten.
- **Aufwand**: wie gründlich das Modell nachdenkt, bei Modellen, die Stufen anbieten (nicht bei Custom und den anderen hinzugefügten Agenten).
- **Modus**: was der Agent tun darf, ohne dich zu fragen. Er beginnt bei **Automatisch**, weil bei einem Lauf niemand zuschaut. Ein Modus, der vor jedem Schritt fragt, lässt den Lauf auf dich warten.

Dieser Browser merkt die Auswahl für die nächste vorgefertigte App.

### Dateien anhängen

Eine Dateifrage zeigt **Datei auswählen**, oder du kannst am Computer eine Datei darauf ablegen. Jede Datei darf bis zu 25 MB groß sein. Die Datei wird im Ordner des Laufs gespeichert und der Agent bekommt ihren Pfad, sodass er PDFs, Word-Dokumente, Tabellen und andere Dateien so lesen kann wie jede andere Datei. Das **×** neben einer gewählten Datei entfernt sie.

### Erforderliche Keys hinterlegen

Manche Apps arbeiten mit einem Dienst, der einen Key will: einen API-Key oder einen Token (ein Wetterdienst, ein Kartenanbieter, ein Konto von dir irgendwo). Eine App nennt die Keys, die sie braucht, nie ihre Werte: Du gibst jeden einmal an, und er wird in deinem Tresor aufbewahrt ([Keys im Tresor aufbewahren](/guide/connections#keep-keys-in-the-vault)), wo Agenten ihn über seinen Namen verwenden, ohne ihn zu sehen.

- Auf der Seite der App listet **Ein erforderlicher Key** (oder **Erforderliche Keys**) unter dem Formular jeden einzelnen auf: was er ist, seinen Namen im Tresor, eine Zeile dazu, wie du ihn bekommst, ein Feld zum Einfügen und **Abrufen**, was die Seite öffnet, auf der du ihn bekommst. Drücke **Ausführen**: Der Key kommt zuerst in den Tresor, dann startet der Lauf. Ein Key, den der Tresor schon hat, erscheint als **Gespeichert**, mit seinen letzten Zeichen und **Veränderung**; einer, ohne den die App auskommt, ist als **optional** markiert.
- Wenn du eine App aus einer Datei installierst, fragt ihre Karte auch nach ihren Keys: Gib sie dann an oder beim ersten Lauf.
- Wenn ein Agent sie in einer Sitzung für dich ausführt, fragt ihre Karte dort nach einem Key, der fehlt; der Key geht direkt in den Tresor, nie in die Unterhaltung.
- Ein Key, den nur ein Teil einer App braucht (der Zotero-Key der Leseliste für **Mit Zotero synchronisieren**), wird nicht in ihrem Formular abgefragt: Ihre Seite fragt danach, wenn du diesen Teil zum ersten Mal benutzt.

Ein Lauf ohne einen Key, den er braucht, startet nicht: In seinem Formular wirst du danach gefragt („Für die Ausführung erforderlich“); über die API, einen Zeitplan oder Zeilen einer CSV-Datei wird der Lauf abgelehnt und sagt, welchen Key du hinzufügen musst (auf ihrer Seite oder unter **Apps → Verbundene Apps → Keys** unter diesem Namen). Wenn ein Key, den du gespeichert hast, noch nicht an eine Website gehen darf, an die die App ihn sendet, sagt das seine Zeile, mit **Erlauben**.

Manche Apps nutzen ein Modell über OpenRouter (zum Beispiel eines, das Bilder zeichnet). Sie fragen auf dieselbe Weise nach deinem **OpenRouter-API-Key**, mit **Abrufen**: Er wird unter [Einstellungen → Modelle](/settings?s=models) gespeichert statt im Tresor, auch für deine anderen Apps und Custom, und das Modell wird deinen Modellen von selbst hinzugefügt, wenn die App zum ersten Mal läuft. Ein Modell, das auf Ollama, vLLM oder einem Endpunkt läuft, richtest du von Hand unter Einstellungen → Modelle ein: Bis dahin wird ein Lauf abgelehnt und sagt, welches Modell und wie.

### Arbeitsort eines Laufs

Jeder Lauf erhält einen neuen, nach App und Zeit benannten Ordner unter `hydor-apps` in deinem Benutzerordner. Eine App kann einen festen [Arbeitsordner](#who-does-it) vorgeben; dann laufen alle dort.

Die Sitzung eines Laufs, den du über das Formular startest, erscheint wie jede andere in der Sitzungsliste der Seitenleiste, mit dem Namen der App und deinen ersten Antworten als Titel. Läufe über die API, von anderen Agenten, von einer öffentlichen Seite oder aus Zeilen einer CSV-Datei werden archiviert, sodass sie nicht in der Liste auftauchen und unter ihrer App erscheinen.

## Eine App durch einen Agenten ausführen lassen

Du musst eine App nicht öffnen, um sie zu benutzen: Bitte in einer beliebigen Sitzung um das, was sie macht („Plane eine 4-tägige Reise nach Lissabon im Mai für uns zwei“), und der Agent führt sie dort aus.

1. Der Agent findet die App, die tut, worum du gebeten hast, und trägt ein, was du gesagt hast: den Ort, die Tage, wer mitkommt. Wenn deine Nachricht eindeutig um das bittet, was eine deiner Apps macht, wird dem Agenten zusammen mit deiner Nachricht gesagt, welche App, sodass er sie ausführt, statt die Arbeit selbst zu machen. Bei vielen Apps durchsucht er sie nach dem, was sie tun (nach Wörtern und, wenn die Suche nach Bedeutung an ist, nach Bedeutung) und wählt aus den zwanzig, die am besten passen.
2. Bevor eine App läuft, erscheint ihre Karte in der Unterhaltung und fragt zuerst nach, es sei denn, die App steht auf deiner Liste der Apps, die ohne Nachfrage laufen (siehe unten). Die Karte sagt „Ein Agent möchte diese App für dich ausführen.“ und zeigt das Symbol und den Namen der App, was sie macht, **Was die App macht** (ihre Schritte der Reihe nach, bis zu sechs, dann „und 3 mehr“), **Aus deiner Nachricht:** und was sie aus deinen Worten übernommen hat, **Letzter Lauf:** (wie lange ihr jüngster Lauf gedauert hat und was er gekostet hat) und **Über diese App**, was die Seite der App öffnet. Wenn die App etwas braucht, das du nicht gesagt hast, stehen die offenen Fragen ebenfalls auf der Karte: Ein Key, den sie braucht und den du noch nicht angegeben hast, wird dort abgefragt und geht in deinen Tresor, nicht in die Unterhaltung. Fülle die mit einem roten **\*** markierten aus und lass die optionalen leer, wenn es dir egal ist. Eine Frage, die sie nicht so übernehmen konnte, wie du es gesagt hast („im Mai“ für ein Datum), zeigt darunter deine Worte. **Ausführen** führt die App einmal aus; **Immer ausführen** setzt die App auf deine Liste und führt sie aus, sodass ihre Karte nicht mehr nachfragt; **Nicht ausführen** schließt die Karte und führt nichts aus: Der Agent erledigt die Aufgabe anders oder fragt dich. Solange die Karte wartet, zeigt die Sitzung **Braucht dich**, und der Posteingang listet sie. Eine App auf deiner Liste zeigt ihre Karte trotzdem, wenn sie Angaben braucht, die deine Nachricht ausgelassen hat; dort heißen die Schaltflächen **Ausführen** und **Nicht jetzt**. Die eigene Sitzung einer geplanten Aufgabe führt Apps ohne Nachfrage aus: Du hast die Aufgabe eingerichtet, und niemand ist da, der antwortet.
3. Die Karte der App bleibt in der Unterhaltung, unter der Antwort des Agenten, und verfolgt den Lauf: wo er steht und die Schritte, die vorbeiziehen, dann ihre Antwort, wie die App sie zeigt (ihre Ansicht, mit ihren Seiten und Schaltflächen; **Einfache Antwort** zeigt die Karte und Tabellen). Eine Frage, die einer ihrer Schritte stellt (eine mit „Lass mich …“), wartet dort ebenfalls. **Öffnen** führt zur Seite des Laufs und der Name der App zur App.
4. Der Agent sagt dann in ein bis zwei Zeilen, was dabei herausgekommen ist; die eigene Antwort des Laufs bleibt auf der Seite des Laufs. Wenn sich die Antwort der App als unpassend für das erweist, worum du gebeten hast, und der Agent stattdessen selbst antwortet, nimmt er die Karte der App aus der Unterhaltung, sodass du eine Antwort bekommst, nicht zwei; der Lauf bleibt unter den Läufen der App. Ein langer Lauf geht weiter, nachdem der Agent aufgehört hat zu warten: Seine Karte verfolgt ihn weiter, und wenn er endet, hört der Agent seine Antwort (dafür erscheint keine Nachricht von dir) und antwortet, wobei die Karte unter diese Antwort wandert. Eine Antwort, die höher ist als der Bildschirm, zeigt sich von oben, mit den Worten des Agenten dazu darüber; der Rest ist einen Scroll entfernt, und **Neueste** springt ans Ende.

Solche Läufe tragen **Aus einer Sitzung**.

Die Seite jeder App hat neben ihrem Formular **In deinen Sitzungen** mit dem Schalter **Agenten können die App verwenden** (deine eigenen Apps haben ihn auch unter **API und Teilen**). Schalte ihn aus, und Agenten führen diese App nicht mehr aus; schalte ihn jederzeit wieder ein. Jede App beginnt mit eingeschaltetem Schalter. Bausteine und Apps, die dafür gemacht sind, auf ihrer eigenen Seite benutzt zu werden (mit einem Bildschirm oder einer Ansicht dessen, was sie speichern), sagen das dort stattdessen, und Agenten führen sie nicht aus. Wenn eine App von dir dasselbe macht wie eine vorgefertigte, bevorzugen Agenten deine.

**Ohne Rückfrage ausführen** unter [Einstellungen → Apps](/settings?s=apps&find=Run%20without%20asking) listet die Apps, die Agenten ohne vorherige Nachfrage ausführen: Das **×** neben einer lässt Agenten wieder nachfragen, und **App hinzufügen** fügt eine hinzu, bevor du gefragt wurdest.

Jede Sitzung erfährt von deinen Apps: die wenigen, die du am häufigsten ausführst, mit dem, was sie tun, und die anderen mit ihrem Namen, insgesamt bis zu 40. Bei mehr als dem finden Agenten die anderen, wenn eine Anfrage eine verlangt.

## Lauf verfolgen und Ergebnis lesen

Die Seite des Laufs zeigt den Namen der App, die Antworten, die sie bekommen hat, in einer Zeile („Lissabon · 2026-11-20 · 3“), woher er kam („Aus dem Formular“, „Testlauf“, „Von der API“, „Von einem anderen Agenten“, „Öffentliche Seite“, „Zeile 3“) und wann er gestartet wurde. Sobald er beendet ist, öffnet **Erneut ausführen** oben das Formular auf dieselbe Weise ausgefüllt.

Die Statuskarte nennt:

- **Wartet auf die Ausführung**, **Wird gestartet…** oder **Arbeitet** mit der bisherigen Zeit. Während er arbeitet, siehst du seine letzten Schritte („Web durchsucht“, „Eine Seite gelesen“, „Den Plan aktualisiert“) und den Anfang dessen, was der Agent zuletzt gesagt hat.
- **Er braucht deine Genehmigung in der Sitzung** oder **Er hat eine Frage an dich in der Sitzung**: Der Agent wartet auf dich. Öffne die Sitzung, um zu antworten; Genehmigungen erscheinen auch [im Posteingang](/inbox).
- **Erledigt in …** mit Kosten.
- **Angehalten** oder **Nicht abgeschlossen** mit Ursache.

Darunter kommt das Ergebnis. Eine App mit einer Ansicht zeigt es dort (siehe [Ansicht der App](#its-view)); **Einfache Antwort** in der Statuskarte zeigt es stattdessen als einfache Karte und Tabellen, und **Eigene Ansicht** geht zurück. Ohne Ansicht:

- Kurze Felder für Text, Zahlen, Datum, Links und Ja/Nein stehen gemeinsam auf einer Karte.
- Langer Text, Listen und Tabellen bekommen jeweils eine Karte unter ihrer Überschrift. Langer Text hat eine Schaltfläche **Kopieren**; Tabellen haben **Kopieren** und **CSV** (ein Download), und eine Spalte mit Bildern zeigt sie klein (ein Klick öffnet eines groß).
- Bilder, Videos, Töne und Dateien: Bilder in einem Raster (ein Klick öffnet eines groß, und mit den Pfeilen gehst du durch die anderen), Videos und Töne zum Abspielen, andere Dateien zum Herunterladen. Eines auf einer anderen Website (ein Video auf YouTube, eine Seite) öffnet sich dort.
- Zu breite Tabellen werden mobil als Karte je Zeile dargestellt.

Die eigene Antwort des Agenten folgt. Sie ist offen, unter **Antwort**, wenn die App keine Ergebnisfelder hat; sonst ist sie eingeklappt unter **Die Antwort des Agenten**. **Die ursprüngliche Anfrage** (eingeklappt) listet die Antworten, die der Lauf bekommen hat.

Der Agent wird einmal erinnert, wenn er fertig wird, ohne die Ergebnisfelder abzugeben. Ein Lauf, der weder mit einer Antwort noch mit einem Ergebnis endet, gilt als fehlgeschlagen („Der Agent hat ohne Antwort geendet“).

Unten öffnet **Mit diesen Antworten erneut ausführen** das Formular auf dieselbe Weise ausgefüllt, bereit zum Ändern und Ausführen. Dateien werden nicht übernommen: Wähle sie erneut aus.

**Sitzung öffnen** (am Handy **Sitzung**) oben öffnet die vollständige Unterhaltung des Laufs.

### Ergebnisansicht

Die Ansicht einer App ist für ihre Antwort gemacht: Seiten, die sie in eigenen Elementen zeigen (Karten, Zeitleisten, Diagramme, Listen zum Abhaken), und Schaltflächen, die etwas damit tun.

- **Seiten**: die Tabs oben; die erste öffnet sich zuerst. Manche Seiten öffnen sich durch einen Klick (ein Tag einer Reise, ein Produkt) und haben oben einen Weg zurück.
- **Häkchen** wie Buchungen und erledigte Aufgaben bleiben je Lauf auf allen Geräten gespeichert. Filter und aktuelle Auswahl gelten nur während des geöffneten Fensters.
- **Schaltflächen, die sie erneut ausführen**: **Entspannt** oder **+ Noch ein Tag** bei einer Reise, **Formell** bei einem Brief, ein Feld für neue Fragen zum selben Dokument. Jede fragt zuerst nach, startet dann einen neuen Lauf mit deinen anderen Antworten, wie sie waren (auch seinen Dateien), und öffnet ihn.
- **Schaltflächen, die eine andere App starten**: **Forschung** zu einer Nachricht oder zur Umgebung einer Reise, **Vertiefen** bei einem Ergebnis: Jede fragt zuerst nach, startet dann den Lauf dieser App und öffnet ihn.
- **Kopieren**: ein Teil zum Einfügen woanders (eine E-Mail, ein Brief, die Fragen, die du stellen sollst).
- **Karten, Plots, Bilder und Videos**: eine Karte der Orte in ihrer Antwort (zieh und zoom sie; ein Ort zeigt seinen Namen, und ein Klick darauf kann seine Seite öffnen), ein Diagramm oder ein 3D-Plot (zeige auf einen Balken oder einen Punkt, um ihn abzulesen, zoome hinein, drehe einen 3D-Plot), Bilder, die sich groß öffnen (ein Eintrag ohne Bild oder dessen Bild nicht geladen werden kann, erscheint ohne eines, und sein Text nimmt den Platz ein), und Videos und Töne zum Abspielen, aus einer Datei oder von YouTube oder Vimeo. Karten, Plots und die eigenen Zeichnungen einer Ansicht laden ihre Bibliotheken (und Karten die Karte selbst, von OpenFreeMap, hell oder dunkel passend zur App) aus dem Web, daher muss dieses Gerät online sein.
- Eigene Apps können in ihrer Ansicht bei fehlenden Schritten den Agenten um Änderungen bitten, andere Flows ausführen und Datensätze speichern.

Die Ansicht erscheint auf Laufseite, unter **Ergebnis** der Sitzung und auf öffentlichen Seiten. Öffentlich funktionieren Seiten und Häkchen, aber keine Aktion erreicht die App: keine neuen Läufe, Wiederholungen oder gespeicherten Daten.

## Ergebnisänderung anfordern

Ein Lauf ist nicht endgültig. Unten auf der Seite des Laufs steht ein Feld mit **Eine Änderung am Ergebnis anfordern …** (oder **Eine Änderung anfordern …**, wenn die App keine Ergebnisfelder hat).

1. Beschreibe die Änderung, etwa weniger Programm an Tag 2, Spalte für Öffnungszeiten oder kürzerer, herzlicherer Text.
2. Enter oder Pfeil sendet, Umschalt+Enter fügt Zeilen ein. Mobil macht Enter eine neue Zeile; der Pfeil sendet.

Die Nachfrage geht an die Sitzung des Laufs. Der Agent erledigt die Arbeit und gibt das gesamte aktualisierte Ergebnis ab, das auf der Seite das alte ersetzt. Jede Nachfrage erscheint unter **Nachverfolgungen** mit der Antwort des Agenten und **Das Ergebnis wurde aktualisiert**, wenn sich das Ergebnis geändert hat. Die Statuskarte lautet dann **Aktualisiert in …** oder **Beantwortet in …**, wenn die Nachfrage nur eine Antwort brauchte (eine Frage, ein Dank).

Wenn du eine Nachfrage sendest, während der Agent noch arbeitet, wartet sie mit dem Hinweis „wartet auf die Ausführung“ und geht an den Agenten, wenn die aktuelle Runde endet. Eine Nachfrage kann bis zu 20.000 Zeichen lang sein.

Öffentliche Läufe, gelöschte Sitzungen und in einem anderen Programm geöffnete Sitzungen erlauben hier keine Nachfragen; setze Letztere dort fort.

## Mit der Laufsitzung arbeiten

Über die Seitenleiste geöffnet, zeigt die Sitzung eines Laufs zuerst das **Ergebnis**, dieselbe Ansicht wie die Seite des Laufs, mit einem Schalter zur **Unterhaltung** oben. (**Sitzung öffnen** auf der Seite des Laufs führt direkt zur Unterhaltung.) Das Nachrichtenfeld der Sitzung sagt dann **Eine Änderung am Ergebnis anfordern …**: Was du dort sendest, ist eine Nachfrage, genau wie auf der Seite des Laufs, und ein Entwurf, den du an einer Stelle beginnst, geht an die andere über.

In der Ansicht **Ergebnis** erscheinen die Genehmigungskarten des Agenten unter dem Ergebnis, sodass du dort genehmigen oder ablehnen kannst. Wenn er stattdessen eine Frage hat, sagt eine Karte **Die App hat eine Frage an dich.** mit **Antworten**, was zur Unterhaltung wechselt.

In der Unterhaltung erscheint der Moment, in dem der Agent sein Ergebnis abgibt, als **Ergebnis übergeben**, mit **Ergebnis öffnen**. Wenn das Abgegebene nicht zu den Ergebnisfeldern passte, zeigt sie **Das Ergebnis entspricht noch nicht den vorgesehenen Ergebnisfeldern** und was falsch war; der Agent korrigiert es und gibt es erneut ab.

## Lauf stoppen oder entfernen

- **Stoppen** (oben, solange ein Lauf läuft): Ein Lauf, der in der Schlange wartet, endet sofort; ein arbeitender wird unterbrochen und zeigt **Angehalten**.
- Sobald ein Lauf beendet ist, fragt die Papierkorb-Schaltfläche (**Aus der Liste entfernen**) „Diesen Lauf entfernen?“ und nimmt ihn aus der Liste der Läufe der App. Die Sitzung bleibt: Lösche sie über das Menü der Sitzung, wenn du sie auch loswerden willst.

## Alle Läufe einer App ansehen

Die Seite deiner eigenen App hat vier Tabs: **Ausführen**, **Ausführungen**, **Für jede Zeile** und **API und Teilen**. **Ausführungen** zeigt, wie viele heute gelaufen sind, und listet jeden Lauf, den neuesten zuerst: die Antworten, die er bekommen hat, woher er kam, vor wie langer Zeit, seine Kosten und seinen Zustand. **Ältere Läufe anzeigen** lädt weitere, jeweils 50.

Vorgefertigte Apps haben keinen Tab „Ausführungen“: Ihre Läufe findest du unter **Neueste Läufe** auf der Apps-Seite oder als Sitzungen in der Seitenleiste.

## Eigene App erstellen

Vier Einstiege:

- **Von Grund auf**: **Neue App** → **Von Grund auf beginnen** auf der Apps-Seite, die Kachel **App erstellen** unter deinen eigenen Apps, oder gehe zu [/apps/new](/apps/new).
- **Durch eine Beschreibung**: Schreibe auf der Apps-Seite (oder der Seite Neue App) unter **Beschreibe eine App und ein Agent erstellt sie**, was sie tun soll, und drücke **Erstellen**. Eine Sitzung startet als **App builder** ([Agenten](/guide/agents)), der die App erstellt, ausprobiert und dir übergibt.
- **Aus einer vorgefertigten App**: Öffne sie und drücke **Eigene Kopie erstellen** (am Handy **Bearbeiten**).
- **Aus einer Sitzung, die gut lief**: Wähle im Menü der Sitzung (⋯) **Mehr** → **Als App speichern**. Die Seite sagt „App-Entwurf wird aus der Sitzung erstellt…“, während das Hilfsmodell die erste Anfrage der Sitzung in ein Formular, eine Aufgabe und Ergebnisfelder umwandelt, aus dem, worum du gebeten hast, und dem, was der Agent geantwortet hat. Die Teile, die sich von einer Benutzung zur nächsten ändern würden, werden zu Fragen. Der Entwurf behält Programm, Modell, Aufwand, Modus und Agent der Sitzung. Wenn der Agent Werkzeuge aufgerufen hat, die ein Schritt von selbst aufrufen kann (er hat eine Seite gelesen, das Web durchsucht), hat der Entwurf auch Schritte: diese Aufrufe als Werkzeugschritte, mit den Antworten des Formulars an den passenden Stellen, dann ein Modell- oder Agentenschritt für den Rest. Schritte, die sich nicht bestätigen, werden weggelassen, und die Aufgabe für einen Agenten bleibt; prüfe die Schritte und probiere sie aus, bevor du speicherst. Wenn das Hilfsmodell den Entwurf nicht erstellen kann, bekommst du die Anfrage, wie sie war, in einer einzigen Frage **Anfrage**, mit einem Hinweis, warum; das Hilfsmodell stellst du unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model) ein.

Du kannst Apps auch in beliebigen Sitzungen beauftragen; siehe [Agenten fragen](#ask-an-agent).

Der Builder öffnet sich unter dem Titel **Neue App**: oben ihr Symbol, ihr Name und ihre Beschreibung (klicke auf den Namen oder die Beschreibung, um sie zu ändern), dann ihre Teile als Tabs, zuerst **Was die App macht**, dann **Formular**, **Antwort**, **Design**, **Beispiele** und **Einstellungen** (wer es tut, ihre Werkzeuge, ihre Grenzen, was sie speichert, ob sie ein Baustein ist und, sobald gespeichert, ihr Ordner und ihre Versionen, jeweils zu einer Zeile eingeklappt, die sagt, wie es eingestellt ist, bis du es öffnest). Jeder Tab ist so breit wie die anderen; am Computer bleiben die Tabs beim Scrollen oben, und am Handy erscheinen sie in zwei Reihen. Auf einem breiten Bildschirm haben **Formular** und **Antwort** daneben eine **Vorschau**, die sich beim Tippen ändert: das Formular, wie die Seite der App es abfragt, und eine ausgedachte Antwort, wie ein Lauf sie zeigt. Fülle sie aus, probiere es mit **Testlauf** aus und drücke dann **Erstellen**. Die Seite der App öffnet sich, bereit zum Ausführen.

### Name, Beschreibung und Symbol

- Klicke auf das Symbol, um seine Farbe (11 Farben) und sein Bild (32 Symbole) zu wählen.
- **Name** (erforderlich, bis zu 60 Zeichen), zum Beispiel „Reiseplaner“.
- Eine Beschreibung: was sie macht, in einem Satz (bis zu 300 Zeichen).

Die Adresse der App entsteht beim Erstellen aus ihrem Namen („Reiseplaner“ wird zu `trip-planner`). Wenn du sie später umbenennst, bleibt die Adresse, sodass Links, Keys und das Werkzeug, das andere Agenten aufrufen, weiter funktionieren.

### Formular

Die Fragen, die jemand vor jedem Lauf beantwortet. **Frage hinzufügen** fügt eine Zeile hinzu mit:

- sichtbaren Wortlaut wie „Wohin?“;
- Ihrer Art: **Kurzer Text**, **Langer Text**, **Zahl**, **Datum**, **Wahl**, **Ja/nein** oder **Datei**.
- **Benötigt**: Der Lauf kann ohne sie nicht starten.
- Bei **Wahl**: den Optionen, eine pro Zeile (bleibt das Feld leer, bietet sie Ja und Nein an), und **Es können mehrere ausgewählt werden**, womit man mehr als eine abhaken kann (die Antwort hat dann eine Option pro Zeile).
- **Hilfetext, Beispiel, Standard …** öffnet drei weitere Felder: **Hilfe unter der Frage**, **Eine Beispielantwort** (grau im leeren Feld angezeigt) und **Standardwert**.

Das Menü **⋯** einer Frage hat **Nach oben verschieben**, **Nach unten** und **Entfernen**. Unter jeder Frage siehst du ihren Platzhalter, zum Beispiel `{{destination}}`: So bezieht sich die Aufgabe auf ihre Antwort, und es ist der Name, den Programme dafür verwenden. Der Platzhalter einer neuen Frage folgt ihrem Wortlaut, bis die Aufgabe ihn verwendet. Eine App kann bis zu 30 Fragen haben.

### Auftrag

Was der Agent tun soll, mit den eingesetzten Antworten (bis zu 30.000 Zeichen; erforderlich). Schreibe es so, wie du den Agenten selbst bitten würdest, und sage, wie er arbeiten soll, nicht nur, was er machen soll.

- **Was die App macht** zeigt die Arbeit der App als **Eine Aufgabe** (dieses Feld), eine **Liste** von Schritten oder einen **Graph** davon; siehe [Apps mit Schritten](#apps-with-steps).
- Die Chips **Einfügen** setzen den Platzhalter einer Frage dorthin, wo der Cursor steht. Fragen, die die Aufgabe noch nicht verwendet, sind hervorgehoben. **heute**, **jetzt** und **weekday** setzen das Datum, Datum und Uhrzeit und den Wochentag ein, wo du bist.
- `{{question}}` wird durch die Antwort ersetzt.
- Zwischen `{{#question}}` und `{{/question}}` bleibt Text nur bei beantworteter, nicht verneinter Frage. `{{^question}}` bis `{{/question}}` gilt nur für leere Fragen.
- **Vorschau** am Ende der Reihe der Chips **Einfügen** zeigt die Aufgabe, in die der Standardwert jeder Frage oder ihr Name in Klammern eingesetzt ist. **Bearbeiten** geht zurück.

Warnungen unter dem Feld sagen dir, wenn ein Platzhalter keine Frage benennt (er bleibt, wie er geschrieben ist) und wenn eine benötigte Frage in der Aufgabe nie verwendet wird.

### Ergebnis

Ergebnisfelder werden vom Agenten ausgefüllt, als Karte oder Tabelle dargestellt und Programmen als JSON zurückgegeben. Ohne Felder gilt die normale Agentenantwort.

**Antwortfeld hinzufügen** ergänzt:

- Überschrift wie „Empfehlung“;
- Ihrer Art: **Text**, **Langer Text** (formatierter Text), **Zahl**, **Ja/nein**, **Datum**, **Link**, **Liste**, **Tabelle** oder **Bilder, Videos oder Dateien**.
- **Benötigt**: Der Agent muss sie ausfüllen.
- **Beschreibung des Feldinhalts für den Agenten (optional)**: ein Hinweis für den Agenten.
- Bei einer **Tabelle**: ihre **Spalten**, jeweils mit einem Namen und einem Typ (**Text**, **Zahl**, **Ja/nein**, **Datum**, **Link** oder **Bild**). **Spalte hinzufügen** fügt eine hinzu; eine Tabelle behält mindestens eine Spalte.

Das **⋯**-Menü eines Ergebnisfelds enthält **Nach oben verschieben**, **Nach unten** und **Entfernen**.

Ein Feld **Bilder, Videos oder Dateien** (und eine Spalte **Bild**) nimmt auf, was der Agent gefunden oder erstellt hat: eine Adresse im Web oder eine Datei auf diesem Computer (ein Foto in deinem Ordner „Bilder“, ein von ihm gezeichnetes Diagramm, eine Aufnahme), jeweils mit einer Beschreibung. Hydor behält eine Kopie einer Datei auf diesem Computer und eines Bilds im Web (bis zu 15 MB), damit es überall zu sehen ist, wo auch das Ergebnis angezeigt wird; Videos im Web bleiben Links. Die Läufe einer öffentlichen Seite dürfen nur auf das Web verweisen.

Hydor prüft, was der Agent abliefert: Zahlen müssen Zahlen sein, Datumsangaben echte Daten und Links vollständige Webadressen. Passt etwas nicht, erfährt der Agent, was er korrigieren muss. Eine App kann bis zu 30 Ergebnisfelder haben und eine Tabelle bis zu 16 Spalten. Ein neues Ergebnisfeld erhält beim Speichern seinen Namen für Programme aus seiner Überschrift; danach bleibt der Name, damit Programme, die ihn lesen, weiter funktionieren.

### Beispiele

Beispiele sind Eingaben zum Ausprobieren der App und Prüfungen dessen, was ein Lauf liefert. So kannst du eine Änderung testen und merken, wenn die App schlechter wird. **Beispiel hinzufügen** fügt eines hinzu: Gib ihm auf Wunsch einen Namen, fülle seine Antworten aus und wähle **Prüfung hinzufügen** für alles, was ein guter Lauf liefern soll. Eine Prüfung ist eine Regel für die Werte des Laufs, so wie die Regel eines Schritts: `{{answer.unread}} > 0`, `{{find.count}} = 3`, `{{reply}} contains Lisbon`. Die Schaltfläche **{ }** setzt einen Wert ein: die Antworten des Formulars, was die Schritte geliefert haben, **Ergebnisfelder** (`{{answer.field}}`) und **Seine Antwort**.

**Ausprobieren** führt jedes Beispiel als Testlauf aus, mit der App so, wie sie auf dem Bildschirm steht, gespeichert oder nicht; die Kolben-Schaltfläche neben einem Beispiel probiert nur dieses aus. Bei jedem steht, wie sein letzter Versuch ausging: **Bestanden**, wie viele Prüfungen fehlgeschlagen sind oder **Nicht abgeschlossen**, dazu wie lange er dauerte und was er kostete; ein geöffnetes Beispiel nennt, was jede fehlgeschlagene Prüfung gesehen hat („answer.unread ist 2“).

### Ausführung

Der Abschnitt erinnert daran, für unbeaufsichtigte Läufe einen Modus ohne ständige Rückfragen zu wählen, etwa Automatisch oder einen mit erlaubten Änderungen.

- Die Auswahlfelder für Programm, **Modell**, **Aufwand** und **Modus**, wie bei einer fertigen App. Der Modus beginnt bei **Automatisch**.
- **Agent**: **Keine**, oder ein Agent, als der jeder Lauf arbeitet (Forscher, Autor … oder einer deiner eigenen), mit seinen Anweisungen, seiner Leistungsstufe und seinem Budget. Siehe [Agenten](/guide/agents).
- **Ordner**: Standardmäßig **Ein neuer Ordner für jeden Lauf**. **Auswählen** lässt jeden Lauf in einem Ordner arbeiten, den du wählst (er muss existieren, wenn ein Lauf startet); **Jedes Mal einen neuen Ordner verwenden** stellt das wieder zurück. Bei einem ausgewählten Ordner werden angehängte Dateien in einem eigenen Upload-Ordner abgelegt, statt sich mit deinen Dateien zu vermischen.

### Werkzeuge

Was die Läufe von Hydors eigenen Tools verwenden dürfen: Websuche, den Browser, Seiten, Memory und den Rest. **Alle** ist zunächst aktiviert. Schalte es aus, um eine Liste mit dem Namen jedes Tools und dem, was es tut, zu sehen, und hake die an, die Läufe verwenden dürfen. Die eigenen Datei- und Befehlstools des Agenten richten sich nach seinem Modus, nicht nach dieser Liste.

### Erforderliche Keys

**Erforderliche Keys** (unter **Einstellungen**) listet die Keys auf, die seine Läufe verwenden, mit ihren Namen in deinem Tresor: jeweils mit einer Angabe, was es ist, **Erlaubte Ziele (Hosts)**, **Bezugsquelle**, einer Zeile dazu, wie man ihn bekommt, und Schaltern für **Die App funktioniert auch ohne diesen Key** und **Befehle auf diesem Computer verwenden den Key**. **Benötigten Key hinzufügen** fügt einen hinzu. Seine Läufe erfahren den Namen jedes Keys und wie man ihn verwendet; die Werte gibt, wer die App installiert (siehe [Gib ihr die Keys, die sie braucht](#give-it-the-keys-it-needs)), und sie sind nie Teil der App oder ihrer Datei.

### Grenzen

- **Ausführungen pro Tag (insgesamt)**: die meisten Läufe, die diese App an einem Tag ausführen darf; gezählt werden Läufe aus dem Formular, der API, von anderen Agenten, aus den Zeilen einer CSV-Datei und von der öffentlichen Seite sowie Unterhaltungen auf ihrem Bildschirm, ab Mitternacht. Darüber hinaus wird ein Lauf mit „This app has run … times today, its limit“ abgelehnt. Leer: kein Limit.
- **Maximale Kosten pro Lauf (US$)** stoppt beim Erreichen; leer bedeutet kein Limit. Siehe [Nutzung, Limits und Kosten](/guide/usage).

### Vor dem Speichern testen

**Testlauf** (auf einem Telefon die Kolben-Schaltfläche) öffnet einen Dialog mit dem Formular so, wie es auf dem Bildschirm steht, gespeichert oder nicht. Fülle es aus und wähle **Test ausführen**: Der Lauf spielt sich im Dialog ab. **Sitzung öffnen** zeigt seine Unterhaltung, und **Erneut testen** führt zurück zum Formular. Testläufe einer gespeicherten App erscheinen in ihrem Tab **Ausführungen** als „Testlauf“. **Als Beispiel speichern** übernimmt die Antworten eines abgeschlossenen Testlaufs als neues Beispiel, dem du unter **Beispiele** Prüfungen geben kannst.

## App ändern, kopieren oder löschen

Auf deiner App-Seite:

- **Bearbeiten** öffnet den Builder, mit dem Titel **Bearbeiten** gefolgt vom Namen der App. Wähle **Speichern**, wenn du fertig bist; bis dahin steht daneben **Noch nicht gespeichert**. Änderungen gelten für die nächsten Läufe; Läufe, die schon laufen, behalten die Version, mit der sie gestartet sind.
- **Mehr** (⋯) → **Duplizieren** erstellt eine Kopie, deren Name am Ende „ copy“ trägt, unter einer eigenen Adresse. Ihr Bildschirm kommt als eigene Seite mit; ihre öffentliche Seite beginnt geschlossen, und ihre Keys und die Datensätze, die sie speichert, werden nicht kopiert.
- **Mehr** (⋯) → **Löschen** fragt „… löschen?“: Ihre Läufe, Keys und öffentliche Seite gehen damit verloren, und Läufe, die noch laufen, werden gestoppt. Die Sitzungen, die sie gestartet hat, bleiben. Bei einer App, die du aus einer Datei installiert hast, steht stattdessen **Deinstallieren**: Sie wird auf dieselbe Weise vollständig gelöscht, und um sie wieder zu haben, installierst du ihre Datei erneut.

Bei einer fertigen App enthält **Mehr** (⋯) den Eintrag **Deinstallieren**, der sie unter **Fertige Apps zum Installieren** behält (siehe [Eine fertige App installieren oder deinstallieren](#install-or-uninstall-a-ready-made-app)).

### Versionen

Jedes Speichern, das ändert, was eine App tut, ergibt eine Version: **Versionen** nahe dem Ende ihres Bereichs **Bearbeiten** listet sie mit der neuesten zuerst auf, jeweils mit dem, was sich geändert hat (oder was der Agent gesagt hat, getan zu haben), wer sie gespeichert hat (**Du**, **Ein Agent**, **App-Ordner** oder **Installiert**) und wann, und, bei Versionen, mit denen ihre Beispiele wie gespeichert ausprobiert wurden, wie viele bestanden haben und was ein Lauf gedauert und gekostet hat, damit du siehst, ob eine Änderung sie besser gemacht hat. **Wiederherstellen** bringt eine frühere Version auf den Bildschirm, und **Speichern** macht sie wieder zur neuesten Version. Das Verschieben ihrer Schritte im Graph und ihre Bildschirme (die eigene Versionen haben) erzeugen keine neue Version. Jeder Lauf behält die Version, mit der er gelaufen ist.

### Als Dateien bearbeiten

**App-Ordner** nahe dem Ende des Bereichs **Bearbeiten** einer gespeicherten App legt die App in einem Ordner mit Dateien ab (**App-Ordner erstellen**; standardmäßig in Hydor/Apps in deinem Home-Ordner), damit du sie in einem beliebigen Editor oder mit einem Coding-Agenten ändern kannst, der in diesem Ordner geöffnet ist. app.json ist die App (was sie fragt, tut und zurückgibt), instructions/ enthält die Anweisungen jedes Schritts in Markdown, steps/ jeden Code-Schritt als die Funktion, die er ausführt, screens/ ihre Bildschirme, und graph.json, wo ihre Schritte sitzen; .naget/ enthält ein Schema von app.json und die Typen eines Code-Schritts, damit dein Editor sie vervollständigt und prüft. Jede Änderung, die du dort speicherst, kommt als Version durch **App-Ordner** hierher, und die App, die in ihrem Bereich **Bearbeiten** geöffnet ist, ändert sich mit (oder meldet **Die App wurde in ihrem Ordner geändert, während du sie hier bearbeitet hast.**); ein Fehler dort wird hier gemeldet und ändert nichts. Ein Speichern hier schreibt den Ordner neu, und **Synchronisierung beenden** lässt die Dateien, wo sie sind. Ihre Daten bleiben hier, nicht im Ordner.

Auf dem Computer, auf dem Hydor läuft, macht die Befehlszeile dasselbe, in ihrem Ordner: `node dist/server/cli.js app new "Leseliste"` erstellt eine App und ihren Ordner, `app folder <app>` erstellt den Ordner einer App, `app dev <app>` probiert ihre Beispiele jedes Mal aus, wenn du dort eine Änderung speicherst, `app try <app>` probiert sie einmal aus (und schlägt fehl, wenn eine Prüfung fehlschlägt), und `app export` und `app import` bringen sie als eine Datei auf einen anderen Computer und sagen vor der Installation, was sie dort tun wird. `app help` listet sie auf; sie verwenden einen eigenen Key, den **Einstellungen → Computer** als „Befehlszeile dieses Computers“ auflistet.

## App aus eigenen Programmen aufrufen

Skripte, Kurzbefehle und andere Programme können deine App mit einem Key ausführen und ihre Antwort zurückbekommen. Öffne deine App → **API und Teilen** → **API**.

1. Wähle **Neuer Key**, gib an, was ihn verwenden wird (um Keys auseinanderzuhalten), und wähle **Key erstellen**.
2. Kopiere den Key sofort: „Dein neuer Key. Kopiere ihn jetzt: Er wird nicht erneut angezeigt.“

Ein Key öffnet nur diese App, nichts anderes in Hydor. Die Liste zeigt den Namen jedes Keys, seine ersten und letzten Zeichen und wann er zuletzt verwendet wurde. **Widerrufen** beendet einen Key: Programme, die ihn verwenden, funktionieren sofort nicht mehr.

Der Tab zeigt einen Beispielaufruf mit der Adresse deiner App und Beispielantworten. Bei einer App von dir namens Trip planner sieht er ungefähr so aus:

```bash
curl -X POST https://your-address/api/apps/trip-planner/run \
  -H "Authorization: Bearer napp_…" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"destination": "Lissabon", "start": "2026-11-20", "days": 4}, "wait": 300}'
```

- Sende die Antworten des Formulars unter `inputs`, mit den Namen ihrer Platzhalter. Gib bei einer Dateifrage den Pfad einer Datei auf diesem Computer an oder sende die Datei unter `files` mit ihrem `name` und ihrem Inhalt in Base64 als `data`.
- `wait` ist die Anzahl der Sekunden, die auf die Antwort gewartet wird, höchstens 900.
- Die Antwort enthält `status` für den Laufzustand, `result` für die Ergebnisfelder, `reply` für die letzte Agentenantwort und `session` als Link zur Sitzung. Falls vorhanden kommen `error` mit dem Fehler und `costUsd` mit den Kosten in US-Dollar hinzu.
- Nach einem Lauf, der noch läuft, kannst du unter `GET …/run/<run>?wait=60` fragen.
- Hinter einem Proxy, der lange Anfragen abschneidet (der von Cloudflare bricht nach 100 Sekunden ab), warte kürzer und frage erneut.

Pro Key sind 30 Aufrufe pro Minute möglich; das App-Tageslimit gilt ebenfalls. Mehr unter [Hydors API](/guide/api).

## Andere Agenten die App als Tool nutzen lassen

Claude Code, Cursor oder ein anderer Agent, der mit Hydors eigenem MCP-Server verbunden ist (eine Standardmethode, mit der Agenten Tools erreichen), kann deine App als Tool ausführen. Unter **API und Teilen** → **Andere Agenten** bietet der Schalter **Anderen Agenten anbieten** sie als Tool an, benannt nach ihrer Adresse, etwa `app_trip_planner`. Bei neuen Apps ist er eingeschaltet. Der Agent füllt das Formular als Eingabe des Tools aus und wartet auf die Antwort; ein langer Lauf kommt mit seiner ID zurück, die der Agent mit einem zweiten Tool prüft, `app_run_status`. Die Adresse und die Tokens, die solche Agenten brauchen, stehen unter [Einstellungen → App → Andere Agenten verbinden](/settings?s=connect).

## Öffentliche Seite freigeben

Eine öffentliche Seite lässt jeden, der den Link hat, das Formular ausfüllen und die Antwort sehen, ohne sich anzumelden und ohne Zugriff auf irgendetwas anderes hier. Du findest sie unter **API und Teilen** → **Öffentliche Seite**.

Öffentliche Läufe nutzen immer Custom. Richte dafür zuerst ein Modell unter [Einstellungen → Agenten → Modelle](/settings?s=models) ein.

1. Schalte den Schalter ein. Der Zustand wechselt von **Geschlossen** zu **Offen für jeden mit dem Link**, und das erste Modell von Custom wird dafür gewählt (ändere es weiter unten).
2. Kopiere den Link (Hydors Adresse, gefolgt von `/a/` und der Adresse der App) oder wähle **Öffnen**.
3. Stelle den Rest ein:
   - **Modell (eines von Custom)**: das Modell, das öffentliche Läufe verwenden.
   - **Im Web suchen und lesen**: zunächst eingeschaltet. Ausgeschaltet antwortet der Agent aus dem, was er weiß.
   - **Läufe pro Besucher und Stunde** (zunächst 5), **Öffentliche Läufe pro Tag** (50) und **Maximale Ausgaben pro Tag** (2 $). Eine Zeile zeigt die öffentlichen Läufe und Ausgaben von heute.

Was Besucher bekommen: den Namen, das Symbol, die Beschreibung und das Formular der App, ihren Lauf, während er läuft, und ihre eigenen früheren Läufe (die letzten 10, an einem Cookie in ihrem Browser erkannt). Sie sehen nie die Aufgabe, die Einstellungen, die Läufe anderer Leute, die Sitzung oder die Kosten, und Fehler erreichen sie in allgemeinen Worten. Dateien, die sie anhängen, dürfen bis zu 3 MB groß sein, und ihre Antworten werden kürzer gehalten als deine. Die Fußzeile der Seite erinnert sie daran, dass Antworten falsch sein können.

Was öffentliche Läufe können: Custom mit dem gewählten Modell, ohne Befehle und ohne Dateien, mit ausgeschaltetem Memory und ausgeschalteten Verbindungen, in einem Wegwerf-Ordner, der gelöscht wird, wenn der Lauf endet. Sie können nur die Ergebnisfelder abliefern und, wenn du es erlaubst, im Web suchen und öffentliche Seiten lesen. Eine angehängte Datei erreicht den Agenten als ihr Text. Die Ausgaben jedes Laufs sind durch das begrenzt, was vom Budget des Tages übrig ist.

Damit es ruhig bleibt: Höchstens 3 öffentliche Läufe einer App laufen gleichzeitig (8 über alle Apps), ein Besucher wartet, bis sein letzter Lauf beendet ist, bevor er einen weiteren startet, und eine Adresse bekommt über alle Seiten höchstens 60 Läufe pro Stunde. Öffentliche Läufe zählen zum Tageslimit der App, und sie nehmen keine Nachfragen an. Schalte den Schalter aus, um die Seite zu schließen; Besucher sehen dann „Diese Seite ist nicht öffentlich freigegeben“.

## App je CSV-Zeile ausführen

Führe deine App auf einer ganzen Liste auf einmal aus: ein Lauf pro Zeile einer Tabelle, die als CSV gespeichert ist. Öffne deine App → **Für jede Zeile**. (Eine fertige App braucht zuerst **Eigene Kopie erstellen**.)

1. **CSV-Datei auswählen** oder lege sie auf dem Feld ab. Die erste Zeile benennt die Spalten. Kommas, Semikolons und Tabs funktionieren alle, bis zu 500 Zeilen.
2. Unter **Welche Spalte beantwortet welche Frage?** bekommt jede Frage eine Spalte (die App rät anhand des Namens) oder **Derselbe Wert für jede Zeile…** mit einem Wert. Für nötige Fragen brauchst du eine Spalte oder einen Wert.
3. Prüfe **Die ersten Zeilen, wie das Formular sie erhält**.
4. Lies die Kostenschätzung (siehe [Was ein Lauf kostet](#what-a-run-costs)) und wähle, wie viele **Gleichzeitig** laufen: 1, 2, 3, 4 oder 6 (zunächst 2).
5. Wähle **Ausführen** und die Anzahl der Zeilen.

Eine Dateifrage nimmt ihre Zelle als Text: ein Pfad auf diesem Computer oder eine Webadresse. Eine Zeile, deren Werte nicht zum Formular passen, schlägt sofort fehl, mit dem Grund in der Tabelle, damit du weißt, was du korrigieren musst. Würden die Zeilen die App über ihr Tageslimit bringen, lehnt Hydor ab, bevor es startet.

Während die Zeilen laufen, füllt sich eine Tabelle: die Zeilennummer, die ersten zwei Fragen, der Zustand, bis zu vier Ergebnisfelder (oder die Antwort) und ein Link zu jedem Lauf. Darüber: wie viele fertig sind, wie viele nicht abgeschlossen wurden, die bisherigen Kosten und wie viele gleichzeitig laufen, mit einem Fortschrittsbalken.

- **Stoppen** beendet die Zeilen, die noch warten, und unterbricht die, die laufen.
- **CSV** lädt die Ergebnisse herunter: die Antworten jeder Zeile, jedes Ergebnisfeld, ihren Zustand, einen eventuellen Fehler, ihre Kosten und einen Link zu ihrer Sitzung. Zellen, die eine Tabelle als Formel behandeln würde, beginnen mit einem Apostroph.
- Das **×** schließt die Tabelle.

Die Zeilen laufen weiter, wenn Hydor neu startet. **Frühere Tabellen** listet deine bisherigen Läufe von Zeilen (die letzten 30) mit ihrem Fortschritt und danach, ob sie **Läuft**, **Angehalten** oder **Abgeschlossen** sind; klicke auf eine, um ihre Tabelle erneut zu öffnen.

## App automatisch ausführen

Eine App kann von selbst laufen: zu einer Uhrzeit, in regelmäßigen Abständen, einmal, wenn ein anderer Dienst einen Webhook aufruft oder wenn ein Watcher eine Änderung sieht (einen Feed, eine Seite, einen Wert, einen Ordner). Jedes Mal läuft sie mit den Antworten, die du festgelegt hast, als käme sie aus ihrem Formular, und der Lauf reiht sich unter **Ausführungen** zu ihren anderen ein.

- **So richtest du einen ein**: Öffne die App, dann **Ausführungen** → **Automatische Ausführung** → **Zeitplan hinzufügen**. Gib ihm einen Namen, fülle die Antworten aus, die jeder Lauf bekommt, und wähle, wann er läuft, wie bei jeder [geplanten Aufgabe](/guide/tasks#when-it-runs). **Testlauf** probiert ihn einmal aus, ohne zu speichern.
- **Antworten von außen**: Die Antworten eines Webhooks können Teile des Aufrufs übernehmen (`{{body.title}}`, `{{headers.name}}`, `{{query.name}}`) und die eines Watchers `{{change}}`, was er sich ändern sah. Der Lauf nimmt sie als Daten, nie als Anweisungen.
- Jeder Lauf benachrichtigt dich mit dem, was er zurückgegeben hat, oder warum er nicht abgeschlossen wurde, und die Benachrichtigung öffnet den Lauf. Seine Zeile unter **Automatische Ausführung** pausiert ihn, führt ihn jetzt aus, zeigt seinen Verlauf oder entfernt ihn; die Aufgabe steht auch unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks).
- **Eine App, die auf einer eigenen Seite geöffnet wird** ([Explore](#explore), der Wochenbericht, das Laborbuch) hat es griffbereiter: In ihren **Einstellungen**, den Schiebereglern oben auf ihrer Seite, führt **Automatisch aktualisieren** sie mit den dort gespeicherten Antworten aus, **Jeden Tag**, **An Wochentagen** oder **Einmal pro Woche am** Tag deiner Wahl, zu einer Uhrzeit deiner Wahl. Eine fertige App kann an eigenen Tagen starten: der Wochenbericht freitags um 16:00 Uhr, das Laborbuch jeden Abend um 21:00 Uhr.

## Kosten eines Laufs

Die Kosten jedes Laufs erscheinen auf seiner Seite, sobald er endet, und in der Liste **Ausführungen**. Es ist der Betrag, den der Agent meldet, oder seine Nutzung zu API-Preisen bewertet (bei Custom geschätzt aus dem, was er gelesen und geschrieben hat); Modelle, die auf diesem Computer laufen, kosten 0 $.

Bevor du eine CSV-Datei ausführst, schätzt Hydor den ganzen Stapel: „About $… for … rows“, aus den mittleren Kosten der letzten abgeschlossenen Läufe der App (bis zu 30). Bei einem Limit pro Lauf kommt hinzu, was die Zeilen höchstens ausgeben könnten. Wenn die App noch nie einen Lauf abgeschlossen hat, steht dort „Führe die App einmal aus, um die Kosten eines Laufs zu sehen.“

Um die Kosten im Griff zu behalten, stelle unter den **Grenzen** der App **Maximale Kosten pro Lauf (US$)** und **Ausführungen pro Tag (insgesamt)** ein und, für eine öffentliche Seite, ihr Tagesbudget. Siehe [Nutzung, Limits und Kosten](/guide/usage) dazu, was alle Sitzungen ausgeben.

## Apps mit Schritten

Eine App kann ihre Arbeit auch in **Schritten** erledigen: Ein Agent erledigt einen Teil, eine schnelle Frage an ein Modell sortiert etwas aus, ein Tool holt eine Seite, eine Regel entscheidet, welchen Weg es weitergeht, dieselben Schritte laufen für jedes Element einer Liste. Jeder Schritt gibt weiter, was er gefunden hat, und der Lauf gibt am Ende die Ergebnisfelder zurück. Schritte machen eine App günstiger, schneller und verlässlicher als einen Agenten, der alles allein macht, und lassen sie mehr tun: Daten zwischen Läufen behalten, deine anderen Apps aufrufen, Teile nebeneinander ausführen.

Eine App mit Schritten erstellst du in ihrem Bereich **Bearbeiten** oder indem du einen Agenten fragst. In **Bearbeiten** zeigt **Was die App macht** ihre Arbeit als **Eine Aufgabe**, als **Liste** von Schritten oder als **Graph** von ihnen (auf einem Computer, wo sie auf dem Graph öffnet, bis du die Liste wählst). Bei einer App, die eine Aufgabe ist, macht **Liste** oder **Graph** aus der Aufgabe einen ersten Schritt, einen Agenten, der sie erledigt, und **Eine Aufgabe** macht aus einem einzelnen Agenten-Schritt wieder eine Aufgabe. **Schritt hinzufügen** wählt eine Art; ein Schritt öffnet sich mit seinen Einstellungen, wenn du ihn anklickst, und sein **⋯**-Menü verschiebt, kopiert oder entfernt ihn. Die Schritte innerhalb von **Entscheide**, **Wiederholen** oder **Zur gleichen Zeit** erscheinen darunter, jede Liste mit ihrem eigenen **Schritt hinzufügen**. Die Schaltfläche **{ }** eines Textfelds (**Wert eingeben**) setzt einen Wert ein: eine Antwort aus dem Formular, was ein Schritt davor geliefert hat (`{{find.records}}`), oder einen eingebauten: **Heute** (`{{today}}`), **Jetzt** (`{{now}}`, Datum und Uhrzeit), **Der Wochentag** (`{{weekday}}`) und **Die Zeitzone** (`{{timezone}}`), alle dort, wo du bist, sowie **Was hat den Lauf ausgelöst?** (`{{run.source}}`: web für sein Formular, api, task, screen, batch für eine Zeile …) und **Der Lauf** (`{{run.id}}`). **Woher die Antwort kommt** sagt, welcher Wert jedes Ergebnisfeld füllt (leer gelassen: der letzte Schritt, der einen Wert dieses Namens geliefert hat). Was korrigiert werden muss, erscheint unter seinem Schritt, während du arbeitest, und **Testlauf** probiert aus, was auf dem Bildschirm steht. **Graph** zeigt sie als Knoten und Verbindungen: Die grauen zeigen die Reihenfolge (die Pfade einer Entscheidung und die nebeneinanderlaufenden Zweige, die Schritte einer Wiederholung in einem Rahmen, was bei einem fehlgeschlagenen Schritt läuft, in Rot), die farbigen, welcher Schritt welche Werte verwendet.

Du kannst auch im Graph bauen (auf einem Computer; ein Telefon behält die Liste). Er zeigt den ganzen Lauf: **Das Formular** oben, daneben **Eingebaut**, wenn Schritte die eingebauten Werte verwenden, darunter die Schritte und am Ende **Die Antwort**; gestrichelte Verbindungen führen vom Formular und von den eingebauten Werten zu den Schritten, die sie verwenden, und von den Schritten, die die Antwort liefern, zu ihr. Ein Klick auf **Das Formular** oder **Die Antwort** öffnet ihren Tab. Ein Klick auf den Knoten eines Schritts öffnet seine Einstellungen neben dem Graph, mit **Mehr** (⋯), um ihn zu verschieben, zu kopieren oder zu entfernen; das **+** auf einer Verbindung setzt dort einen neuen Schritt ein, und **Schritt hinzufügen** beginnt einen leeren Pfad. Ziehe den Punkt rechts an einem Knoten auf einen anderen Schritt, um einen seiner Werte in diesen Schritt einzusetzen (seine Anweisungen, die Eingabe eines Tools, eine Regel …), oder lass ihn im leeren Raum los, um einen neuen Schritt zu erstellen, der ihn verwendet. Ziehe Knoten, um sie zu platzieren (die Schritte innerhalb einer Entscheidung oder Wiederholung bewegen sich mit), doppelklicke auf die Verbindung eines Werts, um sie dort zu biegen (ziehe den Knick, oder doppelklicke ihn, um ihn zu entfernen), und **Alle Elemente automatisch anordnen** ordnet sie von selbst an; klicke mit gedrückter Umschalttaste auf mehrere, um sie **Mit einer Notiz gruppieren**. Ziehe den Hintergrund, um dich zu bewegen, Strg und das Mausrad zoomen, und **Vollbild** gibt ihm das ganze Fenster.

**Ausprobieren** unter den Schaltflächen des Graphs führt die App, wie sie auf dem Bildschirm steht, als Testlauf aus, dort im Graph: Jeder Schritt leuchtet auf, während er läuft und wenn er endet, und die Verbindungen in die Schritte, die gelaufen sind, leuchten mit; zeige auf die Verbindung eines Werts, um zu sehen, was sie getragen hat, und die Einstellungen eines Schritts beginnen damit, wie es **Im letzten Testlauf** ging. In den Einstellungen eines Schritts hält **Haltepunkt vor diesem Schritt setzen** einen Versuch dort an, bis du **Fortsetzen** wählst (oder **Ein Schritt**, der vor dem nächsten wieder pausiert), und die Schneeflocke (**Einfrieren**) lässt einen Versuch das liefern, was der Schritt im letzten geliefert hat, sodass die Schritte nach einem teuren immer wieder ohne Kosten ausprobiert werden können.

**Auf einen Block reduzieren** unter den Schaltflächen des Graphs, wenn Schritte ausgewählt sind (klicke mit gedrückter Umschalttaste auf mehrere, die aufeinander folgen), macht sie zu einer eigenen App, einem Block, den ein Schritt **App aufrufen** an ihrer Stelle ausführt: Was sie von außen verwendet haben (die Antworten des Formulars, die Werte der Schritte davor), wird zu seinem Formular, das der Aufruf liefert, und was die Schritte danach von ihren Werten verwendet haben, wird zu seiner Antwort. Auch andere Apps können den Block aufrufen, und eine Änderung an ihm ist eine Änderung für alle. Schritte, die Daten behalten, bleiben in der App, da ein Block eigene Daten behält, und Listen und Tabellen erreichen einen Block als Text.

Oder bitte einen Agenten darum: „Erstelle eine App, die jeden Link liest, den ich ihr gebe, ihn mit einem schnellen Modell zusammenfasst und in einer Leseliste speichert.“ Der Agent schreibt die Schritte, prüft und testet sie, und du kannst sie danach unter **Bearbeiten** ändern. Agenten haben dafür eigene Tools, in jeder Sitzung: Sie lesen deine Apps, speichern eine (vorher geprüft, Fehler werden in Worten genannt; eine ganze App, einzelne Teile davon oder einen einzelnen Schritt), testen ihre Beispiele und warten ab, wie es ausgegangen ist, geben ihr eine Oberfläche und lesen die Datensätze, die sie speichert, oder fügen welche hinzu (Ändern oder Löschen liegt bei dir, auf der Oberfläche der App, oder sie fragen dich vorher); bevor sie eine App übergeben, sagen sie, was ein Lauf kostet.

In der Unterhaltung erscheint jede App, die der Agent speichert, als Karte, und auf einem breiten Bildschirm öffnet sich die App neben der Unterhaltung, während sie entsteht (**Daneben öffnen** auf der Karte öffnet sie erneut, **Seite öffnen** ihre eigene Seite). Was du dort änderst und speicherst, erreicht den Agenten mit deiner nächsten Nachricht, sodass er auf deiner Version aufbaut: Ein Agent, der speichert, nachdem du etwas geändert hast, liest zuerst deine Version. Wenn der Agent speichert, während du eigene Änderungen auf dem Bildschirm hast, bietet ein Hinweis **Laden** oder **Meine Version behalten** an. Im Menü **⋯** der Schritte startet dort **Agenten dazu fragen** eine Nachricht zu diesem Schritt in der Nachrichtenfeld der Unterhaltung.

Schritttypen:

- **Agenten fragen**: Eine Sitzung arbeitet mit ihren Tools an ihrem Teil und gibt ab, was sie gefunden hat. Jeder Schritt hat eine eigene Sitzung, die du von der Seite des Laufs aus öffnen kannst.
- **Modell fragen**: schnelle Antwort ohne Tools zum Sortieren, Extrahieren und Zusammenfassen, günstig oder mit lokalem Modell kostenlos.
- **Tool verwenden**: eines von Hydors eigenen Tools mit festen Eingaben: im Web suchen, eine Seite lesen, zu jedem Eintrag einer Liste ein Bild (und ein Video) finden, eine Adresse mit einem gespeicherten Key aufrufen, ein Dokument lesen, ein Bild erstellen, dir eine Benachrichtigung schicken, lesen, was Hydor über dich weiß, Dinge nach dem ordnen, was dir wichtig ist, oder das, was es erstellt hat, in deiner Bibliothek speichern (Folien, ein Dokument, eine Tabelle, ein LaTeX-Dokument oder eine Seite, in dem Projekt, das es nennt). Für Papers: eines finden und lesen (aus einer offenen Kopie, mit seinem Eintrag und BibTeX), eine Leseliste führen und sie mit Zotero abgleichen. So gefundene Bilder kommen in die Bildspalte einer Antwort, und Videos (YouTube- oder Vimeo-Links) werden im Videoelement einer Ansicht abgespielt.
- **Entscheide**: so oder so, nach einer Regel („der Preis liegt unter 100“) oder nach einer Frage in Worten, die das Hilfsmodell beantwortet.
- **Wiederholen**: seine Schritte einmal für jedes Element einer Liste (auf Wunsch einige gleichzeitig) oder noch einmal, bis etwas zutrifft.
- **Zur gleichen Zeit**: Zweige, die nebeneinander laufen; der Ablauf geht weiter, wenn alle zu Ende sind.
- **App aufrufen**: eine andere deiner Apps, als ein Schritt. Unter den Arten bietet **Schritt hinzufügen** Bausteine an: Apps, die als Schritte anderer Apps gemacht sind, deine eigenen (die mit **Ein Block** markierten, unter den Antwortfeldern einer App, und die, die „Zu einem Block zusammenfassen“ erstellt) und die vorgefertigten (**Seite zusammenfassen**, **Übersetzen**, **Antwort aus dem Internet**, **Nach Kategorien sortieren** und **Fakten herausarbeiten**, jeder beim Einfügen zu deinem eigenen gemacht). Ein Baustein kommt als Aufruf mit seinem auszufüllenden Formular hinein; Fragen, die das eigene Formular der App unter demselben Namen hat, sind schon beantwortet; eine Änderung an einem Baustein ist eine Änderung für jede App, die ihn aufruft.
- **Daten aufbewahren**: Datensätze hinzufügen, finden, ändern und entfernen.
- **Person fragen**: Der Lauf wartet auf deine Antwort, Ja oder Nein oder ein kurzes Formular: Eine Benachrichtigung öffnet den Lauf, wo eine Karte danach fragt, und der Posteingang listet sie auf. Er wartet eine Woche, wenn du kein anderes Limit setzt, und schlägt dann fehl. Die Fragen vom Typ **Wahl** in seinem Formular können anbieten, was der Lauf gefunden hat: Schreibe einen Wert eines früheren Schritts allein als Wahl, etwa `{{find.items}}`, und wenn der Schritt fragt, bietet die Karte jedes Element dieser Liste (oder jede Zeile eines Textes) als Wahl an, sodass ein Lauf fragen kann, welche der gefundenen Dinge er genauer ansehen soll. Mit **Es können mehrere ausgewählt werden** hakst du so viele an, wie du magst, und `{{step.field}}` sind die angehakten, eines pro Zeile. Auch andere Wörter in der Frage, ihrem Hilfetext und ihren Wahlmöglichkeiten werden mit Werten gefüllt, und eine Wahl, die am Ende nichts anzubieten hat, wird zu einem einfachen Textfeld.
- **Code ausführen**: Ein Programm von dir, in JavaScript, TypeScript oder Python, bekommt die Werte, die du ihm gibst, und gibt die Werte des Schritts zurück (unter **Ausgabewerte** benennst du sie, für die Schritte danach). Es läuft in einer Sandbox: kein Netzwerk und keine Dateien dieses Computers außer den Paketen, die die App installiert. Nach außen greift es nur über `ctx`, jeder Aufruf ein Schritt des Laufs: `ctx.model` fragt ein Modell, `ctx.agent` einen Agenten, `ctx.tool` verwendet eines der Tools der App, `ctx.ask` wartet auf deine Antwort, `ctx.data` speichert Datensätze und `ctx.app` startet eine andere App. So kann ein ganzer Ablauf ein einziges Programm sein, mit eigenen Bedingungen und Schleifen; seine Aufrufe erscheinen auf der Seite des Laufs wie Schritte, und wenn der Lauf nach einem Neustart wieder startet, läuft das Programm noch einmal, und die Aufrufe, die es vorher gemacht hat, liefern das, was sie damals geliefert haben, ohne erneut zu laufen. Eine App-Datei mit Code-Schritten sagt das auf ihrer Installationskarte.
- **Wert berechnen**: ein Wert aus einem anderen, sofort und kostenlos: das erste oder letzte Element einer Liste, die Anzahl, eine Summe, der Durchschnitt, der kleinste oder größte Wert (eines Feldes jedes Elements), ein Feld jedes Elements, die Elemente zu Text verbunden, ohne Wiederholungen, nach einem Feld sortiert, als Zahl oder ein Datum einige Tage später. Er ergibt `{{id.value}}` und erscheint im Graphen als kleine Kapsel.

Ein Schritt kann nur laufen, wenn eine Regel zutrifft, und festlegen, was bei einem Fehler geschieht: stattdessen andere Schritte, ohne ihn weitermachen oder (bei einem Tool-, Modell-, Code-, Daten- oder App-Schritt) **Ein Agent übernimmt den Schritt**: Ein Agent bekommt, was der Schritt erhalten hat und warum er fehlgeschlagen ist, gibt die Werte ab, die die Schritte danach verwenden, und der Lauf geht weiter. Die Seite des Laufs zeigt dann neben dem Schritt **Ein Agent hat den Schritt übernommen**, mit dem Grund des Fehlschlags.

Während ein Lauf arbeitet, listet seine Seite die Schritte auf, sobald sie laufen. Wenn er zu Ende ist, zeigt **Schritte** jeden einzelnen mit dem Ergebnis, der Dauer und den Kosten; die Sitzungsschaltfläche öffnet die Unterhaltung eines Agentenschritts. Ein Lauf mit Schritten nimmt keine Nachfragen an: Ändere die Antworten und führe ihn noch einmal aus.

Sobald ein Lauf mit Schritten beendet ist, hat jeder seiner Schritte **Von hier erneut ausführen** (↺): ein neuer Lauf mit denselben Antworten, in dem die Schritte vor diesem das liefern, was sie dieses Mal geliefert haben (markiert mit **Vom letzten Lauf**, kostenlos), und der Rest läuft so, wie die App jetzt ist. Ein **Testlauf** unter **Bearbeiten** hat das auch, mit dem, was auf dem Bildschirm steht: Ändere einen späteren Schritt und probiere ihn noch einmal aus, ohne die ersten Schritte auszuführen.

### Abläufe festigen

Über den Schritten unter **Bearbeiten** sagen dir die jüngsten Läufe einer App zwei Dinge. Ein Schritt, der fehlgeschlagen ist und den ein Agent übernommen hat, zeigt, in wie vielen Läufen das passiert ist und warum er zuletzt fehlgeschlagen ist; **Agenten um eine Korrektur bitten** fragt den Agenten daneben (wenn die App neben einer Unterhaltung geöffnet ist) oder startet eine Sitzung mit dem **App builder**. Ein Agentenschritt, der in jedem seiner letzten Läufe dasselbe getan hat (er hat zum Beispiel die Seite gelesen, die er bekam, und dann geantwortet), bietet **In feste Schritte umwandeln** an: feste Schritte, die es günstiger erledigen könnten, ein Tool-Schritt für jeden Aufruf des Agenten, mit den Werten, mit denen er sie gemacht hat, dann ein Modellschritt mit seinen Anweisungen und dem, was die Tools geliefert haben. **An den Beispielen ausprobieren** (oder **Ausprobieren**, mit den Antworten dieser Läufe, wenn es keine Beispiele hat) führt sie zuerst aus und zeigt, was ein Lauf mit seinem Agenten und mit den Schritten braucht und kostet; **Diese Schritte verwenden** setzt sie auf dem Bildschirm an seine Stelle, und **Speichern** behält sie. Die Tool-Schritte, die dabei entstehen, lassen einen Agenten ihre Arbeit übernehmen, wenn sie fehlschlagen, sodass ein Lauf, der vorher funktioniert hat, weiter funktioniert.

App-erstellende Agenten erhalten dieselben Vorschläge und Testschritte.

### Gespeicherte Daten einer App

Eine App kann zwischen ihren Läufen Daten behalten: Listen von Datensätzen, etwa die Links einer Leseliste oder die Kunden eines kleinen CRM. Ihre Schritte fügen sie hinzu, finden und ändern sie, und ihre Agenten tun das auch, mit einem eigenen Tool. Eine Liste kann festlegen, was jeder Datensatz enthält (einen Titel, eine Bewertung, ein Datum …), und die App prüft dann, was hineinkommt. Unter **Bearbeiten** listet **Gespeicherte Daten** sie auf: **Liste hinzufügen**, dann gib ihr einen Namen und, wenn du magst, die Felder, die ihre Datensätze enthalten (ohne Felder passt jeder Datensatz hinein).

Auch vorgefertigte Apps speichern Daten: Die [Leseliste](/guide/researchers#reading-list) verwaltet Papers und ihre Seite bearbeitet sie. Andere Apps wie Literaturmatrix lesen dieselben Einträge.

Schritte und Agenten können die Datensätze auch nach einer Frage durchsuchen, so wie deine Wissensbasen durchsucht werden: nach ihren Wörtern und, wenn die [Bedeutungssuche](/settings?s=memory&find=Search%20by%20meaning) eingeschaltet ist, auch nach ihrer Bedeutung, die besten zuerst. Ein Schritt kann mit den Tools knowledge_search und recall auch deine Wissensbasen und Memory-Notizen durchsuchen.

Was eine App speichert, bleibt bei ihr, bis du die App löschst. Läufe von ihrer öffentlichen Seite erreichen es nie. Auch vorgefertigte Apps speichern Datensätze: die Anmerkungs-Workbench ihre Textsammlungen mit deinen Labels, das Laborbuch seine Einträge; sie bleiben, wenn du die App deinstallierst, und kommen mit ihr zurück.

### App mit Memory

Eine App kann sich über ihre Läufe hinweg etwas merken: Ihre Agenten halten in einem eigenen Memory der App fest, was spätere Läufe wissen sollten (eine Vorliebe, die du gezeigt hast, eine Quelle, die funktioniert, einen Fehler, den man vermeiden sollte), und jeder Lauf beginnt damit. [Einstellungen → Memory](/settings?s=memory) listet es als Projekt unter dem Namen der App auf. Schalte es mit **Speichert Informationen über mehrere Läufe hinweg** ein, unter **Gespeicherte Daten** in ihrem **Bearbeiten**.

### Lokale Voraussetzungen

Eine App kann Dinge auf diesem Computer brauchen: Node- oder Python-Pakete, die ihre Agenten verwenden, und Befehle wie ffmpeg. Die Pakete werden im eigenen Ordner der App installiert, nie für den ganzen Computer, sobald du die App installierst oder änderst, und ihr erster Lauf wartet darauf. Auf der Seite der App sagt eine Zeile, während sie installiert werden oder wenn das nicht geklappt hat, mit **Ausgabe anzeigen** und **Erneut installieren**. Ein Befehl, den sie verwendet und der diesem Computer fehlt, wird dort ebenfalls genannt: Installiere ihn selbst.

## Ergebnisgestaltung

Die Ansicht einer App bestimmt, wie ihre Antwort aussieht: Seiten (Tabs und Seiten, die ein Klick öffnet), Elemente, die für ihre Antwort gemacht sind (eine Tageskarte, ein Produkt mit seinen Stärken und Schwächen), und Ereignisse, die festlegen, was ein Klick bewirkt. Ohne Ansicht erscheint ihre Antwort als einfache Karte und Tabellen.

Unter **Bearbeiten** einer App zeigt der Tab **Design** ihre Ansicht mit der Antwort ihres letzten Laufs; **Beispielergebnis** zeigt stattdessen eine in ihrer Form, und was daran zu beheben ist, steht darunter. In der Vorschau führt ein Klick zu Seiten und hakt Dinge ab; was die App erreicht (ihren Agenten fragen, sie noch einmal ausführen), funktioniert auf der Seite eines Laufs.

- **Agenten um einen Entwurf bitten** (sobald die App gespeichert ist): Eine Sitzung startet als **App builder** mit einer Nachricht dazu, oder, wenn die App neben einer Unterhaltung geöffnet ist, geht die Nachricht an diesen Agenten. Er schreibt die Ansicht, probiert sie mit einem Lauf aus und behebt, was nicht passt.
- **Mit dem Ergebnis beginnen**: eine Seite mit einem Block für jedes Antwortfeld, von der aus du weiter änderst.
- **Agenten um eine Änderung bitten** bearbeitet eine vorhandene Ansicht.
- **Als Code ändern**: die Ansicht als JSON, ihre Seiten, Elemente (HTML mit Werten wie `{{result.days}}` und CSS) und Ereignisse, wie das API-Thema des Guides sie beschreibt ([Apps: Ansichten](/guide/api#apps-views)); die Vorschau folgt dem, was du tippst.
- **Ansicht entfernen** stellt nach Speichern einfache Karten wieder her.

Die Ereignisse einer Ansicht können zu einer Seite gehen (mit dem angeklickten Element), etwas abhaken oder einen Filter setzen (mit dem Lauf gespeichert, wenn es so angegeben ist), kopieren, eine Adresse öffnen, den Agenten des Laufs um eine Änderung bitten (bei einer App ohne Schritte), einen ihrer anderen Abläufe ausführen, sie mit einigen geänderten Antworten noch einmal ausführen, eine andere App starten und einen Datensatz, den sie speichert, hinzufügen, ändern oder entfernen. Seiten, die für die eigene Seite der App markiert sind, erscheinen dort anstelle ihres Formulars, mit dem, was sie speichert, und ihrem letzten Lauf. Eine solche Seite hat oben **Aktualisieren**, was die App jetzt ausführt, und daneben **Einstellungen**: die Antworten ihres Formulars, für diese Läufe gespeichert, und **Automatisch aktualisieren** (jeden Tag, werktags oder einmal pro Woche, zu einer Zeit, die du wählst), wie bei [Entdecken](#explore). Eine App, deren Seite ein Ort zum Arbeiten mit dem ist, was sie speichert (die Leseliste), hat keins von beiden: Ihre Seite zeigt ihre Datensätze sofort, und ihre Schaltflächen führen ihr Formular aus. Eine Ansicht ist Teil der App: Sie hat Versionen mit ihr, reist in ihrer Datei, und ihre Elemente sind eigene Dateien in ihrem Ordner (ui/).

Neben seinen eigenen Elementen hat eine Ansicht eingebaute: Text, Listen zum Abhaken, Tabellen und Balkendiagramme, und diese für Medien:

- **Bilder**: eines oder mehrere nebeneinander, jedes mit seiner Beschriftung.
- **Videos**: eine Datei, die in der Ansicht abgespielt wird, oder ein Link zu YouTube oder Vimeo, der sein Standbild zeigt und beim Anklicken über der Seite abspielt.
- **Audio** für Aufnahmen und Songs.
- **Karten**: die Orte in ihrer Antwort, anhand ihrer Breiten- und Längengrade, nummeriert und der Reihe nach verbunden, wenn die Ansicht es sagt.
- **Plots** mit Plotly: Linien, Balken auch gestapelt, Flächen, Punkte, Kreise, Histogramme, Boxplots, Heatmaps sowie 3D-Punkte, Linien und Flächen.

Eine Ansicht kann auch **Widgets** haben: Elemente, die ein eigenes Skript zeichnet (eine 3D-Szene, ein Spiel, ein Diagramm aus einer Bibliothek deiner Wahl) und die die Bibliotheken, die sie nennen, jeweils in einer genauen Version aus dem Web laden (jsDelivr). Alles in einer Ansicht wird in derselben Sandbox gezeichnet wie Seiten: Es kann weder diesen Computer noch deine Anmeldung oder deine anderen Apps erreichen, sondern nur tun, was seine Ereignisse erlauben.

**App-eigene Dateien** unter dem Tab **Design** enthält Bilder, Videos, Töne und Daten, die zur App gehören: **Dateien hinzufügen** fügt sie hinzu (bis zu 100 MB je Datei, 150 MB insgesamt), ein Bild öffnet sich groß, und die Schaltfläche zum Kopieren gibt den Namen an, unter dem eine Ansicht sie zeigt (`asset:tram.jpg`, in einem Bild-, Video- oder Tonblock oder im `src` einer Vorlage). Sie reisen in ihrer Datei. Die Vorschau füllt die Ansicht mit ihrem letzten Lauf oder mit einer erfundenen Antwort, deren Bilder und Videos ihre eigenen Dateien sind.

## Eigene App-Oberfläche

Eine App kann eine eigene Oberfläche haben: eine Seite anstelle ihres Formulars, die sie ausführt und zeigt, was sie speichert. Eine Leseliste kann ihre Links in einer Tabelle zeigen, die du durchsuchst und aufräumst, ein kleines CRM seine Kunden mit einer Schaltfläche, die eine Nachfrage entwirft, ein Tracker eine Zählung dessen, was er erfasst hat. Die Oberfläche arbeitet live: Was du in ihrem Formular abschickst, führt die App aus, ihre Antwort erscheint, wenn sie fertig ist, und ihre Tabellen ändern sich, wenn ihre Schritte und Agenten die Datensätze ändern.

- **So gibst du ihr eine**: Öffne deine App, dann **Mehr** (⋯) → **Ansicht hinzufügen**. Die Oberfläche wird aus ihren Teilen gemacht: ihrem Formular, ihrer Antwort, einer Tabelle für jede Liste, die sie speichert (mit einer Unterhaltung mit ihrem Agenten darunter), und ihren früheren Läufen. Ihre Seite öffnet sich dann auf der Oberfläche.
- **So änderst du sie**: **Mehr** (⋯) → **Ansicht bearbeiten** öffnet sie im Seiteneditor der Bibliothek, wo du sie wie jede Seite änderst ([Eine Seite selbst ändern](/guide/library#change-a-page-yourself)): Verschiebe und gestalte ihre Teile um, oder bitte den Agenten darum. **Hinzufügen** hat einen Tab **App** mit den eigenen Teilen der App: **Formular der App**, **Ergebnisfelder**, **Bisherige Ausführungen**, **Eine Unterhaltung mit seinem Agenten**, ein Formular und eine Schaltfläche für jeden ihrer anderen Abläufe und eine Tabelle und eine Zählung für jede Liste, die sie speichert.
- **Oder bitte einen Agenten darum**: „Gib meiner Leseliste eine Oberfläche mit den ungelesenen Links oben und einer Schaltfläche, die die Zusammenfassung dieser Woche erstellt.“ Agenten schreiben Oberflächen mit denselben Teilen und können einer App weitere Abläufe geben, die die Schaltflächen einer Oberfläche starten.

**Mit ihrem Agenten sprechen.** Die Unterhaltung einer Oberfläche (**Zugehörigen Agenten fragen**, auf einer Oberfläche aus ihren Teilen) ist ein Chat mit dem eigenen Agenten der App, mit seinem Modell und seinen Tools: Schreibe eine Nachricht und drücke **Senden** (oder Enter), und er antwortet dort. Er kann finden und ändern, was die App speichert, und die Abläufe der App für dich ausführen und abwarten, was sie liefern, sodass „Füge Piranesi hinzu, ich habe es gelesen“ oder „Welche davon habe ich noch nicht gelesen?“ einfach funktionieren. Wenn du zurückkommst, ist die letzte Unterhaltung da; **Neue Unterhaltung** startet eine andere, und **Frühere Unterhaltungen** öffnet eine, die du vorher hattest. Unterhaltungen werden getrennt von ihren Läufen mit der App gespeichert.

Eine Oberfläche ist eine eigene Seite der App: Sie erscheint nicht in deiner Bibliothek, sie verschwindet, wenn du die App löschst, und sie reist in der Datei der App. Um die App mit früheren Antworten aus ihrem Formular auszuführen, nutze **Mit diesen Antworten erneut ausführen** auf der Seite eines Laufs.

## App als Datei teilen

Eine App lässt sich als einzelne Datei aufbewahren oder auf einem anderen Hydor installieren.

- **So lädst du eine herunter**: Öffne die App, dann **Mehr** (⋯) → **Als Datei herunterladen**, oder nutze **Mehr** (⋯) auf ihrer Karte auf der Apps-Seite. Vorgefertigte Apps lädst du genauso herunter. Die Datei (`.hydor-app`) enthält alles, was sie tut und braucht, ihre eigenen Dateien (Bilder, Videos, Daten) und die Apps, die ihre Schritte aufrufen. Wenn sie Daten speichert, nimmt **Gespeicherte Datensätze einschließen** auch diese mit. Ihr Ordner, ihre Keys und ihre öffentliche Seite bleiben hier: Die Keys, die sie braucht, reisen nur mit ihren Namen und werden dort abgefragt, wo sie installiert wird.
- **So installierst du eine**: Drücke auf der Apps-Seite **Neue App**, dann **Von einer Datei installieren**, und wähle eine `.hydor-app`-, `.zip`- oder `.json`-Datei (bis 160 MB); oder ziehe die Datei auf die Apps-Seite. Bevor etwas angelegt wird, zeigt eine Karte in einfachen Worten, was es ist: ihren Namen und was sie tut, **Welche Angaben die App benötigt** (die optionalen Fragen sind markiert), **Was du erhältst**, **Wie es funktioniert**, **Agenten können die App verwenden**, mit einem Schalter, der verhindert, dass Agenten sie ausführen, und **Ein erforderlicher Key** (oder **Erforderliche Keys**), den du jetzt oder bei ihrem ersten Lauf angibst. **Lokal verwendete Komponenten** (zugeklappt, und von selbst offen, wenn etwas einen Blick braucht) listet auf, wer die Arbeit macht, ihre Schritte, ihre eigenen Dateien, die Skripte ihrer Ansicht und die Bibliotheken, die sie laden, ihre Oberflächen, die Tools, die sie verwenden darf, die Modelle, die sie verwendet, die Apps, die mit ihr kommen, was sie installiert und die Befehle, die sie verwendet, was sie speichert, ob sie sich etwas merkt, und ihre Limits. Jedes Modell wird so gezeigt, wie es hier eingerichtet ist, hier unter einem anderen Namen, über OpenRouter (beim ersten Lauf zu deinen Modellen hinzugefügt, sein Key wird zusammen mit den Keys der App abgefragt) oder hier nicht eingerichtet: Wähle dafür eines deiner Modelle als Ersatz oder überlasse es dem Standard des Agenten. Drücke **Installieren**.

Manches ändert sich beim Hereinholen, und die Karte sagt, was: Ein Ordner, in dem sie anderswo gearbeitet hat, bleibt weg (jeder Lauf bekommt einen eigenen), ein Modus, der jeden Schritt ohne Nachfrage erlaubt, startet stattdessen als **Automatisch**, und ein Agent, der diesem Computer fehlt, entfällt. Eine mitgelieferte App, die mit einer von dir identisch ist, wird weiterverwendet; sonst wird sie neben deiner installiert. Ihre öffentliche Seite startet geschlossen, und sie hat keine API Keys.

Die Datei einer vorgefertigten App sagt, welche App es ist: Wo du diese App deinstalliert hast, bringt das Installieren der Datei sie zurück (**Wieder installiert**); wo du sie hast, wird die Datei als eigene Kopie installiert, die du beliebig ändern kannst.

## Einen Agenten fragen

Hydor-Agenten können Apps nach deiner Kartenfreigabe erstellen und ausführen. Beispiele:

- „Erstelle eine App namens Wochenbericht, die nach einem Projekt und einem Zeitraum fragt und mit einer Zusammenfassung und einer Tabelle der Änderungen antwortet.“
- „Mache diese Sitzung zu einer wiederverwendbaren App.“
- „Hefte den Reiseplaner und meinen Wochenbericht oben auf der Apps-Seite an, den Bericht zuerst.“
- „Welche Apps habe ich zuletzt genutzt und wie liefen sie?“
- „Führe meinen Price check noch einmal mit denselben Antworten aus wie beim letzten Mal.“
- „Plane für uns zwei eine viertägige Reise nach Lissabon im Mai.“ (Der Reiseplaner läuft hier und fragt nach, was er braucht)
- „Wie ist das Wetter diese Woche in Zermatt? Und was kann ich mit Eiern, Spinat und Kartoffeln kochen?“ (Der Wetterausblick und Kochen mit deinen Vorräten laufen hier, jeder zeigt seine Antwort in seiner Ansicht)
- „Frage mich mit zehn schwierigen Fragen zum Römischen Reich ab.“
- „Finde Hundeparks und Cafés beim Berliner Alexanderplatz.“ Explore a place fragt vor dem Start, sofern nicht freigegeben.
- „Führe meinen Reiseplaner aus, ohne jedes Mal zu fragen.“ (Der Agent setzt ihn unter **Ohne Rückfrage ausführen**, so wie es **Immer ausführen** auf seiner Karte tut)
- „Führe die App Reiseplaner für Lissabon aus, vier Tage ab dem 20. November, und zeige mir das Ergebnis, wenn sie fertig ist.“
- „Führe Company research für diese zwanzig Firmen aus und gib mir die Tabelle.“
- „Starte Trip planner jeden Freitag um 18:00 für drei Tage Lissabon.“
- „Öffne Cover letter öffentlich mit höchstens 1 $ Tagesbudget.“
- „Stoppe alle Price-check-Läufe und widerrufe ihre API Keys.“
- „Deinstalliere die App Wöchentliche Nachrichtenübersicht und verhindere, dass Agenten meine App Price check in Sitzungen ausführen.“
- „Erstelle eine schrittbasierte App, die Links liest, mit einem schnellen Modell zusammenfasst und in einer Leseliste speichert.“
- „Ergänze Competitor watch um eine Benachrichtigung nur bei Änderungen.“
- „Frage mich in meiner App Shopping scout, nachdem sie die Produkte gefunden hat, welche ich vergleichen will, als Auswahl zum Abhaken, und vergleiche dann nur diese.“
- „Installiere die App aus reading-list.hydor-app in meinem Downloads-Ordner.“
- „Erstelle eine App, die das Wetter für eine Stadt von OpenWeather zusammenfasst. Sie braucht meinen OpenWeather API Key.“
- „Ergänze City break um Stopps auf einer Karte und Tageskosten als Diagramm.“
- „Füge die Fotos aus ~/Pictures/Lisbon zu meiner App City break hinzu und zeige sie auf ihrer ersten Seite.“
- „Gib der Ansicht meiner App Wochenbericht ein 3D-Diagramm der Zahlen, als Widget mit three.js.“
- „Gib meiner Leseliste eine Oberfläche mit den ungelesenen Links oben und einer Schaltfläche, die die Zusammenfassung dieser Woche erstellt.“
- „Gestalte eine Ansicht für meine App Wochenbericht: eine Seite mit der Zusammenfassung und den Zahlen oben und eine Seite, die jede Änderung als Karte zeigt, die ich abhaken kann.“
- „Ergänze je Shop in Price check einen Button für einen erneuten Lauf nur dieses Shops.“
- „Wandle meine App Link digest in feste Schritte um und probiere sie zuerst an ihren Beispielen aus.“
- „Sorge dafür, dass der Schritt Look up its title in meiner App Link digest seine Arbeit an einen Agenten übergibt, wenn er fehlschlägt.“
- „Aktualisiere Explore jeden Morgen um 6:30 und berücksichtige immer Formel 1.“
