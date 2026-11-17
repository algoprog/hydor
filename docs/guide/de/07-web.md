# Suche und Browser

Agenten können unabhängig vom Modell im Web suchen, Seiten lesen und einen echten Browser bedienen. Dieser Beitrag erklärt Suchanbieter und Einrichtung, die Suchschritte im Gespräch und Quellenangaben sowie die Live-Ansicht des Browsers und seine Übernahme für Anmeldungen, Prüfungen oder Zahlungen. In der Desktop-App für Mac, Windows und Linux können Agenten auch Bildschirm, Maus und Tastatur deines Computers verwenden.

![Ein Agent hat im Web recherchiert, Seiten gelesen und Ergebnisse in einer Tabelle verglichen](images/web.webp)

## Wie Agenten im Web suchen

Alle hier ausgeführten Agenten, darunter Claude Code, Codex, Custom und ACP-Agenten, erhalten drei App-Tools: Websuche, Seitenabruf und die Suche nach Bildern und Videos zu konkreten Dingen. Sie funktionieren modellunabhängig; auch ein kleines lokales Modell kann damit genauso recherchieren wie ein großes.

- Suchanfragen verwenden die Anbieter unter **Einstellungen → Funktionen → Suche** in ihrer Reihenfolge. Der erste aktivierte Anbieter antwortet. Fehlen Key oder Kontingent, ist der Anbieter unerreichbar oder verlangt er eine Bot-Prüfung, wird der nächste versucht. Das Ergebnis nennt dem Agenten den verwendeten Anbieter.
- Agenten können bis zu 100 Ergebnisse anfordern und nach Websites einschließlich Ausschlüssen, Zeitraum, Sprache, PDF-Dateien oder offiziellen Startseiten filtern, etwa Personen- oder Unternehmensseiten. Naget Search unterstützt außerdem Kategorien wie wissenschaftliche Arbeiten, Preprints, biomedizinische Veröffentlichungen, US-Patente, Unternehmensberichte, Nachrichten, Dokumentation und Diskussionen. Unterstützt ein Anbieter einen Filter nicht, erfährt der Agent das.
- Naget Search kann pro Treffer statt eines gewöhnlichen Auszugs gezielt die zur Frage passenden Sätze liefern. Das dauert länger und wird verwendet, wenn Fakten aus den Seiten benötigt werden. Dafür ist kein Key nötig.
- Für Listen von Spielen, Filmen, Orten, Gerichten, Produkten oder Teams können Agenten jeweils ein Bild finden: bevorzugt aus dem passenden Wikipedia-Artikel, etwa Cover, Ortsfoto oder Vereinswappen, sonst das Vorschaubild einer zugehörigen Webseite. Auf Wunsch kommt ein YouTube-Video hinzu, dessen Titel das Objekt ausdrücklich nennt, etwa Trailer, Rezept oder Höhepunkte. Ohne eindeutige Zuordnung bleibt der Eintrag ohne Bild oder Video. Apps verwenden diese Inhalte in Antworten; siehe [Apps](/guide/apps).
- Agenten sollen verwendete Seiten mit einer Nummer in Klammern direkt an der belegten Aussage und einer Liste genau dieser Seiten am Antwortende zitieren. Die App stellt daraus Links und Quellenkarten dar; siehe [Quellen unter einer Antwort ansehen](/guide/web#see-the-sources-under-a-reply). Suchergebnisse und Webseiten gelten als Informationen, niemals als Anweisungen.

Fehlgeschlagene Anbieter werden vorübergehend ausgesetzt, etwa bis wieder Kontingent vorhanden ist, damit weitere Suchen nicht erneut darauf warten. Identische Anfragen innerhalb von zehn Minuten verwenden das gespeicherte Ergebnis.

Claude Code und Codex besitzen zusätzlich eigene Webtools. Deren zitierte Quellen werden auf dieselbe Weise dargestellt.

## Suchanbieter auswählen

Öffne [Einstellungen → Funktionen → Suche](/settings?s=search). Auf dem Smartphone wählst du in der Einstellungsliste unter Funktionen **Suche**.

Unter [Anbieter](/settings?s=search&find=Providers) gilt „Von oben nach unten: Der erste aktivierte Anbieter antwortet“. Jede Zeile zeigt:

- den Namen, beim ersten aktivierten Anbieter **Standard** und gegebenenfalls Warnungen wie **Key erforderlich** oder **Adresse deiner Instanz erforderlich**;
- eine Kurzbeschreibung. **(i)** ergänzt unterstützte Suchfilter, etwa „Bis zu 100 Ergebnisse · Kategorien · Zeitraum · Startseiten · passende Seitenauszüge“;
- falls vorhanden eine gekürzte Kennzeichnung des gespeicherten Keys wie „sk-ab…12cd“, niemals den vollständigen Wert;
- den letzten Fehler in Rot mit Zeitangabe;
- rechts einen Schalter und ein **⋯**-Menü mit **Key hinzufügen** oder **Key ändern**, **Adresse festlegen** oder **Adresse ändern**, **Testen**, bei aktiven nachgeordneten Anbietern **Als Standard festlegen** sowie **Nach oben** und **Nach unten**.

**(i)** neben **Anbieter** erklärt, dass alle Modelle Websuche und Seitenabruf nutzen können und externe Inhalte nur Informationen, keine Agentenanweisungen sind.

**Als Standard festlegen** verschiebt den Anbieter nach oben. Die anfängliche Reihenfolge lautet Naget Search, SearXNG, Brave Search und DuckDuckGo. Naget Search und DuckDuckGo sind aktiviert. SearXNG und Brave Search bleiben bis zur Eingabe ihrer Voraussetzungen deaktiviert.

### Naget Search

[Naget Search](/settings?s=search&find=Naget%20Search) ist der Standardanbieter mit einem eigenen Index für Web, wissenschaftliche Arbeiten, Patente und Unternehmensberichte. Ohne Key steht ein kostenloses Tageskontingent bereit. Nach der ersten Antwort zeigt die Zeile **Heute noch kostenlos verfügbar**, einen Balken und die nächste Freigabezeit. Ist das Kontingent verbraucht, erscheint ein Hinweis; bis zur Erneuerung antwortet der nächste Anbieter.

Ein Key von naget.com ermöglicht mehr Anfragen. Die Anzeige nennt dann **Verbleibende Credits**. Mit Key kann Naget Search auch beim Seitenabruf die zur Frage passenden Sätze auswählen; siehe [Ganze Seiten oder gezielt passende Abschnitte lesen](/guide/web#read-whole-pages-or-only-the-parts-that-answer-a-question). Ohne Key wählt die App Absätze nach Wörtern aus. Passende Sätze direkt in Suchergebnissen sind auch ohne Key möglich. „Naget Search benötigt derzeit einen Key“ bedeutet, dass Anfragen ohne Key gerade abgelehnt werden; bis zur Eingabe übernimmt der nächste Anbieter.

Das Formular enthält außerdem **Adresse**, standardmäßig https://naget.com. Ändere sie nur, wenn du eine andere Adresse erhalten hast.

### SearXNG

[SearXNG](/settings?s=search&find=SearXNG) ist eine selbst betriebene Metasuchmaschine, die mehrere Suchmaschinen gleichzeitig abfragt, ohne ein Nutzungsprofil über dich anzulegen. Benötigt wird kein Key, sondern nur die Instanzadresse: **⋯ → Adresse festlegen**, etwa https://searx.example.org, dann **Speichern**. Die Adresse aktiviert den Anbieter. Er liefert bis zu 100 Ergebnisse.

### Brave Search

[Brave Search](/settings?s=search&find=Brave%20Search) verwendet den unabhängigen Brave-Index über die Search API. Dafür brauchst du einen Key; Brave bietet auch einen kostenlosen Tarif. **⋯ → Key hinzufügen** öffnet ein Formular mit dem Link **Key unter api-dashboard.search.brave.com erhalten**. Speichern aktiviert den Anbieter. Er liefert bis zu 100 Ergebnisse.

### DuckDuckGo

[DuckDuckGo](/settings?s=search&find=DuckDuckGo) benötigt keinen Key und ist von Anfang an als letzter Anbieter aktiviert. Es liefert ungefähr zehn Treffer pro Seite und insgesamt höchstens 30. Bei einer Bot-Prüfung übernimmt der nächste Anbieter, sofern vorhanden.

### Key oder Adresse hinzufügen oder ändern

1. Öffne in der Anbieterzeile **⋯ → Key hinzufügen**, **Key ändern**, **Adresse festlegen** oder **Adresse ändern**.
2. Füge den Key unter **Key** ein, wo er als Punkte erscheint, oder gib die **Adresse** an. Bei Naget Search ist der Key als optional für zusätzliche Anfragen gekennzeichnet.
3. **Speichern** übernimmt die Angaben; **Abbrechen** verwirft sie.

Das Hinterlegen einer benötigten Adresse oder eines Keys aktiviert den Anbieter. Keys bleiben auf dem Server; die Oberfläche zeigt nur eine gekürzte Kennzeichnung. **Gespeicherten Key entfernen** im Formular löscht ihn.

### Einen Anbieter testen

**⋯ → Testen** führt eine kleine Anfrage nur mit diesem Anbieter aus, ohne Wechsel zum nächsten. Dabei werden auch noch nicht gespeicherte Formulareingaben verwendet. Du siehst „Funktioniert“, Trefferzahl, Dauer und die ersten drei Ergebnisse als Links oder die Fehlerursache. Ein erfolgreicher Test des gespeicherten Anbieters löscht außerdem seine alte Fehlermeldung.

### Ergebnisse pro Suche

[Ergebnisse pro Suche](/settings?s=search&find=Results%20per%20search) legt die Standardzahl fest, falls der Agent keine nennt: **10**, **20** als Standard, **50** oder **100**. Für gründliche Recherche, etwa nach Fachartikeln, kann der Agent weiterhin bis zu 100 verlangen. Mehr Ergebnisse bedeuten mehr zu lesenden Inhalt.

Ein Hinweis unten auf der Seite verlinkt die Entwickleranleitung zum Ergänzen weiterer Anbieter.

### Wenn kein Anbieter antworten kann

Scheitern alle aktivierten Anbieter oder sind alle ausgeschaltet, erhält der Agent die einzelnen Gründe. Claude Code und Codex verwenden dann für diese und weitere Anfragen des Auftrags ihre eigene integrierte Websuche, Claude Code WebSearch beziehungsweise die Codex-Websuche, und zitieren wie gewohnt. Erst wenn auch diese scheitert, verweisen sie dich auf Einstellungen → Suche. Andere Agenten wie Custom haben keine eigene Websuche. Sie sollen dich darauf hinweisen, dort einen Key zu hinterlegen oder einen anderen Anbieter zu aktivieren. Bei [Deep research](/guide/research) sind die agenteneigenen Websuchen deaktiviert, damit jede Anfrage zum Suchbudget zählt; dort erfährst du ebenfalls, was zu korrigieren ist.

## Suchergebnisse ansehen

Agentenschritte sind zwischen Nachrichten zusammengefasst, etwa „4-mal gesucht“, wobei dort Websuchen und Seitenabrufe gemeinsam zählen. Öffne die Zeile für die einzelnen Schritte. Eine Suche heißt beispielsweise „Im Web nach ‚E-Bikes unter 2.000 Euro‘ gesucht“. Rechts stehen Anbieter und Trefferzahl, auf dem Smartphone nur die Anzahl. Währenddessen steht „Websuche läuft“ mit Zeitmessung; ein Fehler erscheint als „Websuche fehlgeschlagen“.

Ein Klick öffnet:

- verwendete Filter als kleine Markierungen, etwa Website, Zeitraum oder Kategorie, sowie gegebenenfalls „Passende Auszüge“ für gezielt angeforderte Sätze;
- Hinweise auf ausgefallene Anbieter, den ersatzweise verwendeten Anbieter oder nicht unterstützte Filter;
- nummerierte Ergebnisse in der Reihenfolge des Agenten: anklickbarer Titel, Website, Datum, Kategorie wie Fachartikel, arXiv, PubMed, Patent, SEC-Bericht oder Dokumentation, PDF-Markierung und Textauszug beziehungsweise passende Sätze. Jeder Treffer hat eine Öffnen-Schaltfläche ↗.

Zunächst erscheinen acht Treffer. **Alle N Ergebnisse anzeigen** öffnet den Rest.

## Quellen unter einer Antwort ansehen

Zitiert ein Agent verwendete Seiten, ersetzt die App die nummerierte Schlussliste durch zwei Darstellungen:

- **Im Text** steht an der belegten Aussage ein kleines Quellenfeld mit Website-Symbol und Namen, etwa **ign**. Mehrere Quellen erscheinen etwa als **ign +1**. Am Computer zeigt Darüberfahren Titel und Websites; ein Klick öffnet die Seite oder die gewählte Quelle aus der Liste. Auf dem Smartphone öffnet Antippen zunächst die Quellen und ein weiteres Antippen die Seite.
- **Unter der Antwort** steht **Quellen** mit den ersten Website-Symbolen und der Zahl zitierter Seiten. Ein Klick öffnet für jede Quelle eine Karte mit Titel, Website und Link.

Angezeigt werden nur tatsächlich zitierte Seiten anhand der vergebenen Nummern, nicht alle Suchergebnisse. Die gesamte Recherche steht unter **Gearbeitet für…** oberhalb der Antwort. **Nachricht kopieren** unter der Antwort kopiert den ursprünglichen Text samt Quellenliste. Beim Vorlesen entfallen Nummern und Liste. Website-Symbole werden beim ersten Mal direkt von der Website geladen und gespeichert. Fehlt ein Symbol, erscheint der Anfangsbuchstabe.

## Ganze Seiten oder gezielt passende Abschnitte lesen

Reichen Suchauszüge nicht, liest der Agent die Seite. Lange Seiten kommen in Abschnitten von etwa 3.000 Wörtern; weitere Abschnitte fordert er bei Bedarf an. Alternativ stellt er eine Frage an die Seite und erhält nur passende Auszüge, die deutlich kürzer sind.

- Mit aktiviertem Naget Search und hinterlegtem Key wählt dieser Dienst die passenden Sätze aus. Der Schritt nennt den übernommenen Wortanteil. Anders als passende Sätze in Suchergebnissen benötigt dies einen Key.
- Andernfalls wählt die App Absätze mit den meisten gemeinsamen Wörtern zur Frage. Der Agent soll die ganze Seite lesen, falls sie die Frage nicht beantworten.

Auch PDFs werden als Text gelesen. So lassen sich nur öffentliche Webseiten abrufen, keine lokalen oder privaten Netzwerkadressen. Der [Browser](/guide/web#the-browser-agents-use) kann diese nach deiner Freigabe öffnen. Ein Seitenabruf wird zehn Minuten gespeichert, sodass weitere Abschnitte sofort verfügbar sind.

Im Gespräch steht „Gelesen“ mit Seitentitel, auf breiten Bildschirmen auch der Frage. Ein Klick zeigt Adresse, Abschnitt wie „Teil 1 von 3“ oder „Passende Abschnitte“ und den an den Agenten übergebenen Text.

## Der Browser für Agenten

Für Websites mit Interaktionen, Formularen, Anmeldungen oder Skripten reicht ein Textabruf nicht. Agenten nutzen dafür einen echten Chromium-Browser, die Open-Source-Grundlage von Chrome. Er läuft auf dem Hydor-Computer getrennt von deinem eigenen Browser. Du kannst ihn live beobachten und jederzeit übernehmen.

Mit aktiviertem Browser kann jeder Agent:

- Seiten mit laufenden Skripten im aktuellen oder einem neuen Tab öffnen;
- die Seite als Textübersicht mit nummerierten Links, Schaltflächen und Feldern lesen;
- klicken, doppelklicken, auf Elemente zeigen, Felder ersetzen oder ergänzen, Enter drücken, Listen auswählen, scrollen, Tasten drücken, zurückgehen und warten. Bis zu zehn Aktionen sind gebündelt möglich; bei Seitenänderungen endet die Folge früher;
- hinterlegte Tresor-Anmeldedaten anhand ihres Namens eingeben lassen, ohne Passwort oder Key selbst zu sehen, und nur auf dafür erlaubten Hosts. Siehe [Keys im Tresor speichern](/guide/connections#keep-keys-in-the-vault);
- Screenshots mit eingezeichneten Nummern ansehen, sofern das Modell Bilder versteht und Screenshots aktiviert sind;
- Seitentext suchen, abschnittsweise lesen oder vom Hilfsmodell Fragen zu langen Seiten beantworten lassen. Siehe [Agenten, Konten und Modelle](/guide/agents-models);
- Tabs auflisten, wechseln und schließen;
- Dateien aus dem Sitzungsordner in Uploadfelder einfügen, niemals von anderen Orten;
- die Bedienung an dich übergeben.

Manches bleibt immer dir vorbehalten:

- **Anmeldungen ohne hinterlegte Zugangsdaten, Prüfungen und Unsicherheiten.** Agenten sollen diese an dich übergeben, einschließlich Captchas und zugesandter Einmalcodes. Muss ein Auftrag später ohne dich erneut auf ein Konto zugreifen, etwa eine geplante Aufgabe, kann der Agent stattdessen über eine Karte nach Zugangsdaten für den Tresor fragen.
- **Bezahlen und Bestellen.** Agenten klicken nie auf zahlungs- oder bestellauslösende Schaltflächen wie Bezahlen, Jetzt kaufen, Bestellen, Abonnieren, Spenden, Jetzt buchen oder Absenden eines Formulars mit Kartenfeldern. Sie halten an und bitten dich, selbst abzuschließen.
- **Deine Eingaben.** Passwörter, Kartennummern, Sicherheits- und Einmalcodes sowie während deiner Übernahme eingegebene Inhalte werden dem Agenten nie gezeigt. Auch passwortähnliche URL-Bestandteile werden verborgen. Aus dem Tresor befüllte Felder erscheinen als Punkte; der Agent erfährt nur, dass sie ausgefüllt wurden.
- **Dialogfragen der Seite**; siehe [Dialogfragen einer Webseite beantworten](/guide/web#answer-a-pages-pop-up-questions).

Jede Sitzung hat einen eigenen Browser. Ohne Profil startet er ohne Anmeldung und verwirft alles beim Schließen. Mit Profil übernimmt er dessen Anmeldungen; siehe [Anmeldungen mit Profilen behalten](/guide/web#keep-sign-ins-with-profiles).

## Den Browser live beobachten

Bei geöffnetem Sitzungsbrowser erscheint direkt über dem Nachrichtenfeld ein Bereich mit Seitentitel oder „Leere Seite“, aktueller Aktion wie „Klickt auf ‚Anmelden‘“ oder „Schreibt in ‚Suche‘“, verwendetem Profil und Tabzahl. Bei Rückfragen steht dort „Wartet auf dich“, während deiner Bedienung „Du steuerst – der Agent wartet“.

Am Computer:

- Eingeklappt zeigt der Bereich links ein kleines Livebild. Klicke darauf, auf den Titel oder auf **Live-Ansicht anzeigen**, um ihn zu öffnen. **Live-Ansicht ausblenden** klappt ihn ein.
- **Vollbild** zeigt den Browser über der gesamten App, **Vollbild schließen** kehrt zurück.
- **Übernehmen** übergibt dir die Steuerung; **Browseroptionen** unter **⋯** öffnet das Menü.

Auf dem Smartphone öffnet ein Antippen den Browser im Vollbild; × schließt die Ansicht.

Das Livebild wird mehrmals pro Sekunde übertragen, solange du zusiehst. Bis zum ersten Bild steht „Verbindung zum Browser wird hergestellt…“.

### Den Zeiger des Agenten verfolgen

Da der Browser unsichtbar im Hintergrund läuft, zeigt die Live-Ansicht einen großen Pfeil in der App-Farbe mit weichem Leuchtrand und **Agent**-Kennzeichnung.

- Vor Klicken, Tippen oder Scrollen gleitet der Zeiger in etwa einer Drittelsekunde zum Ziel. Solange du zusiehst, wartet der Agent diese Bewegung ab. Ohne Zuschauer entfällt die Wartezeit.
- Beim Klick breitet sich ein Ring aus, beim Doppelklick zwei. Eingabefelder und Auswahllisten erhalten kurz einen Rahmen. Scrollpfeile zeigen die Richtung; gedrückte Tasten wie Enter, Tab oder Strg+A erscheinen neben der Kennzeichnung.
- Der Zeiger bleibt am letzten Aktionsort. Im kleinen Vorschaubild erscheint er als kleiner Pfeil.
- Während deiner Übernahme verschwindet der Agentenzeiger. Er kehrt bei Rückgabe zurück.

Jeder Browserschritt steht außerdem im Gespräch, etwa „github.com geöffnet“, „Schaltfläche [12] ‚Anmelden‘ angeklickt“ oder „Dich gebeten: Bei GitHub anmelden“, mit einem kleinen Bild der Seite danach. Ein Klick auf die Zeile öffnet das größere Bild und die vollständige Antwort des Tools. Im großen Bild markieren Ringe Klickstellen und gestrichelte Rahmen Eingabefelder, bei mehreren Aktionen nummeriert. Die App speichert Bilder der letzten 400 Schritte je Sitzung. Nach einem Monat ohne Sitzungsnutzung werden sie gelöscht.

## Für Anmeldung, Prüfungen oder Zahlungen übernehmen

Braucht der Agent dich im Browser, erscheint dies gleichzeitig:

- oben im Browserbereich mit passenden Schaltflächen;
- als Gesprächskarte, etwa „Benötigt dich im Browser: Bei GitHub anmelden“, mit **Anzeigen**, auf dem Smartphone **Öffnen**;
- als Benachrichtigung und Eintrag im [Posteingang](/inbox). Siehe [Posteingang und Benachrichtigungen](/guide/inbox).

Am Computer öffnet sich die Live-Ansicht bei Anmeldung, Zahlung oder Dialogfrage automatisch und klappt nach Erledigung wieder ein, sofern du sie nicht selbst geöffnet hattest.

### Am Computer

1. Wähle **Übernehmen** in der Hinweiszeile oder im Browserbereich. „Du steuerst – der Agent wartet“ und ein farbiger Rahmen kennzeichnen die Übernahme.
2. Bediene die Seite wie gewohnt mit Maus, Scrollrad und Tastatur. Klicke zuerst in die Seite; anschließend gehen Tastendrücke dorthin statt an App-Kurzbefehle. Eingefügte Inhalte werden als Text übernommen.
3. Über der Seite stehen **Zurück**, **Neu laden** und die Adresszeile. Eine Adresse mit Enter öffnet sie.
4. Klicke nach Abschluss in der Hinweiszeile auf **Fertig**. Die App informiert den Agenten mit dem aktuellen Seitenstand, und er setzt seine Arbeit fort.

### Auf dem Smartphone

1. Tippe auf **Übernehmen**. Der Browser öffnet im Vollbild und passt die Seite während deiner Bedienung an den Smartphonebildschirm an. Darüber stehen **Zurück**, **Neu laden** und die Adresszeile.
2. Tippen entspricht einem Klick, Ziehen scrollt. **Tippen** öffnet die Bildschirmtastatur. Daneben stehen Tab, Enter, Esc, ⌫ und Pfeiltasten.
3. **Fertig** stellt die normale Seitengröße wieder her und lässt den Agenten weiterarbeiten.

### Bezahlen und Bestellen

Vor einem zahlungs- oder bestellauslösenden Knopf hält der Agent an, etwa „Vor Zahlung oder Bestellung gestoppt: Bestellen auf shop.example.com. Das musst du selbst ausführen.“ Übernimm, prüfe die Bestellung und bezahle selbst. **Fertig** meldet den Abschluss, **Nicht jetzt** den Abbruch. Der Agent erfährt deine Entscheidung.

### Andere Rückmeldungen und selbst übernehmen

- **Nicht möglich** meldet dem Agenten, dass du die Bitte nicht erfüllen konntest.
- Du kannst jederzeit über **Übernehmen** selbst eingreifen, auch ohne Aufforderung. Der Agent wartet. Versucht er währenddessen einen Browserzugriff, erfährt er, dass du steuerst und er bei Rückgabe benachrichtigt wird. **Zurückgeben** gibt die Steuerung frei; ein wartender Agent erhält den aktuellen Seitenstand.

Die von der App in deinem Namen gesendeten Meldungen erscheinen im Gespräch. Bei einem laufenden Durchlauf warten sie bis zu dessen Ende.

## Dialogfragen einer Webseite beantworten

Öffnet die Seite einen Dialog, etwa Warnung, Ja-Nein-Frage, Texteingabe oder „Seite verlassen?“, erscheint er über dem Livebild mit Website und Nachricht. Nur du antwortest: **OK**, **Abbrechen**, gegebenenfalls mit Textfeld, oder **Verlassen** und **Bleiben**. Hat ein Agentenschritt den Dialog ausgelöst, wirst du benachrichtigt; der Agent erfährt deine Antwort.

## Lokale Websites oder Netzwerkadressen für eine Sitzung erlauben

Die standardmäßig aktive Option [Zugriff auf diesen Computer und sein Netzwerk sperren](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) verhindert Seitenzugriffe auf lokale Geräte. Will der Agent etwa einen Entwicklungsserver öffnen, fragt er: „Möchte localhost:3000 auf diesem Computer oder in seinem Netzwerk öffnen“, mit **Nicht erlauben** und **Für diese Sitzung erlauben**. Eine Freigabe gilt für diese Adresse im Sitzungsbrowser; der Agent wird zum erneuten Öffnen aufgefordert.

Auch von dir während einer Übernahme eingegebene lokale oder private Adressen werden für die Sitzung freigegeben. Unter **Websites für diese Sitzung** im Browsermenü stehen sie unter „Auf diesem Computer oder im Netzwerk erlaubt“. × widerruft eine Freigabe. Hydor selbst lässt sich im Agentenbrowser nie öffnen.

## Das Browsermenü

**Browseroptionen** unter **⋯** bietet:

- **Tabs**, wenn mehrere offen sind: Wähle den sichtbaren Tab. Öffnet eine Seite einen neuen Tab, arbeitet der Agent dort weiter.
- **Im Sitzungsordner gespeichert**: zuletzt heruntergeladene Dateien zum Öffnen.
- **Profil – Wechsel startet den Browser neu**: **Neu, ohne Anmeldungen** oder eines deiner Profile. Die Auswahl erscheint nach dem ersten angelegten Profil. Ein Wechsel schließt den Browser; beim nächsten Einsatz startet er mit dem neuen Profil.
- **Websites für diese Sitzung**: **Nur diese Websites**, leer für uneingeschränkte Auswahl, und **Diese Websites nie**, jeweils eine pro Zeile. Sie ergänzen die Listen unter Einstellungen → Browser. **Speichern** übernimmt sie.
- **Browser schließen**.

## Den Browser selbst öffnen

Du kannst den Sitzungsbrowser vor dem Agenten öffnen, etwa um dich vor einem Auftrag anzumelden. Wähle **⋯ → Mehr → Browser öffnen** im Sitzungsmenü und dann **Übernehmen** im Bereich über dem Nachrichtenfeld. Ist er bereits geöffnet, heißt der Eintrag **Browser anzeigen**. Bei deaktiviertem Browser in den Einstellungen erscheint ein entsprechender Hinweis.

## Downloads und Uploads

Heruntergeladene Dateien liegen im Unterordner downloads des Sitzungsordners. Der Agent erfährt den Pfad. Das Browsermenü zeigt die neuesten Dateien unter **Im Sitzungsordner gespeichert**.

Agenten können nur Dateien aus dem Sitzungsordner hochladen. Kopiere andere Dateien zuerst dorthin. Siehe [System: Dateien, Git, Terminal und Vorschau](/guide/files-git).

## Wann der Browser schließt

Ein Sitzungsbrowser schließt automatisch:

- nach 15 Minuten ohne Bedienung oder Zuschauer, beziehungsweise nach zwei Stunden, wenn er auf dich wartet oder du steuerst;
- beim Schließen des letzten Tabs;
- beim Stoppen des Agentenprogramms oder Löschen der Sitzung;
- beim Profilwechsel oder Löschen des verwendeten Profils.

Offene Rückfragen enden dabei ebenfalls. Bei Bedarf öffnet der Agent den Browser erneut.

## Den Browser einrichten

Öffne [Einstellungen → Funktionen → Browser](/settings?s=browser): „Ein Browser für Agenten, den du beobachten und übernehmen kannst“.

### Ein Browser für Agenten

[Ein Browser für Agenten](/settings?s=browser&find=A%20browser%20for%20agents) neben der Überschrift aktiviert oder deaktiviert den Browser für alle Agenten. Sobald Chromium gefunden wurde, ist er standardmäßig aktiv; vorher lässt er sich nicht einschalten. Ohne Aktivierung erhalten Agenten keine Browsertools.

### Chromium

[Chromium](/settings?s=browser&find=Chromium) nennt die verwendete Version und unter **(i)** ihren Pfad. Die automatische Auswahl bevorzugt installiertes Chrome oder Chromium, danach eine von der App heruntergeladene Version und schließlich eine Playwright-Installation. Bei mehreren Funden kannst du **Beste gefundene Version** oder eine konkrete Installation wählen.

Ohne Fund bietet die App den Download von Chrome for Testing mit etwa 170 MB in den App-Datenordner an. **Chrome herunterladen** startet ihn mit Fortschrittsbalken und Fehlerhinweis bei Problemen. Die Schaltfläche bleibt verfügbar, solange keine heruntergeladene Kopie existiert, auch bei anderweitig gefundenem Chromium.

Kann Chromes Sandbox zur Abschirmung von Webseiten auf diesem Computer nicht laufen, weist die App darauf hin. Netzwerkzugriffe bleiben trotzdem gesperrt; beschränke Profile auf benötigte Websites.

### Browserfenster anzeigen

[Browserfenster anzeigen](/settings?s=browser&find=Show%20a%20window) ist zunächst aus: Der Browser läuft verborgen und wird in der App angezeigt. Aktiviert öffnet er zusätzlich ein echtes Fenster auf diesem Computer. Playwrights Headless Shell unterstützt kein Fenster; mit ihr bleibt die Option aus. Änderungen gelten beim nächsten Browserstart.

### Zugriff auf diesen Computer und sein Netzwerk sperren

[Zugriff auf diesen Computer und sein Netzwerk sperren](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) ist standardmäßig aktiv. Webseiten dürfen weder diesen Computer noch private Netzwerkadressen wie Router, Drucker oder Hydor erreichen. Jede Verbindung wird geprüft, auch wenn ein Hostname erst später auf eine private Adresse zeigt. Eigene Entwicklungsserver bleiben nach Einzelfreigabe erreichbar; siehe [Lokale Websites oder Netzwerkadressen für eine Sitzung erlauben](/guide/web#let-a-session-open-a-site-on-this-computer-or-your-network). Bei deaktiviertem Schalter sind Netzwerkzugriffe möglich; Hydor selbst bleibt gesperrt.

### Screenshots für bildfähige Modelle

[Screenshots für bildfähige Modelle](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images) ist standardmäßig aktiv. Geeignete Modelle sehen die Seite mit nummerierten Markierungen. Reine Textmodelle erhalten immer eine Textansicht. Bei ausgeschalteter Option gilt das für alle Modelle.

### Websites erlauben oder sperren

Unter [Websites](/settings?s=browser&find=Sites) gelten zwei Listen für sämtliche Sitzungsbrowser. Schreibe eine Website pro Zeile, etwa example.com; Unterdomains sind eingeschlossen:

- **Nur diese Websites**: Mit Einträgen dürfen nur diese Websites geöffnet werden; leer bedeutet alle.
- **Diese Websites nie**: Von diesen Websites wird nichts geladen.

Nach Änderungen erscheint **Websites speichern** neben der Überschrift. Auch vollständige Adressen sind erlaubt; die App übernimmt nur den Host, aus „https://www.example.com/page“ wird example.com. Jede Sitzung ergänzt eigene Listen über **Websites für diese Sitzung** im Browsermenü.

### Anmeldungen mit Profilen behalten

Ein Profil ist ein eigener Browserordner, der Anmeldungen zwischen Sitzungen behält. So können Agenten angemeldete Websites nutzen, ohne dein Passwort zu sehen. Dein persönliches Chrome-Profil wird nie verwendet. Unter [Profile](/settings?s=browser&find=Profiles):

1. Wähle **Neues Profil**, gib etwa Arbeit oder Einkaufen als Namen ein und klicke **Hinzufügen**.
2. Im Fenster „Bei Websites anmelden · Arbeit“ gibst du etwa github.com/login ein und wählst **Öffnen**.
3. Bediene die Seite wie gewohnt und melde dich an. Auf dem Smartphone öffnet **Tastatur** die Bildschirmtastatur. Weitere Websites kannst du genauso öffnen.
4. Schließe das Fenster. Die Anmeldungen bleiben im Profil.

Wähle das Profil im Sitzungsbrowser über **Browseroptionen → Profil**. Der Browser schließt und öffnet beim nächsten Aufruf durch dich oder den Agenten mit den gespeicherten Anmeldungen. Der Bereich nennt den Profilnamen. Sitzungen mit demselben Profil teilen seine Anmeldungen.

Jedes Profil bietet **Bei Websites anmelden** für weitere Anmeldungen und ein **⋯**-Menü mit **Umbenennen** und **Löschen**. Löschen entfernt Anmeldungen und alle Browserdaten dieses Profils und schließt verwendende Browser. Ohne Profile erklärt die Liste, dass jeder Sitzungsbrowser ohne Anmeldung neu startet.

## Agenten deinen Computer bedienen lassen

In der Desktop-App für Mac, Windows und Linux können Agenten den Computer wie eine Person vor Ort bedienen: Bildschirm ansehen, Maus und Tastatur in beliebigen Apps verwenden, etwa Notizen oder Kalender am Mac, Editor oder Excel unter Windows, Dateien unter Linux und Programme ohne Browserzugang. Websites werden weiterhin im schnelleren und sichereren Browser bearbeitet. Computer Use ist zunächst ausgeschaltet.

### Computer Use aktivieren

Öffne [Einstellungen → Funktionen → Computer Use](/settings?s=computer) mit „Agenten sehen deinen Bildschirm und bedienen Maus und Tastatur in der Desktop-App“. Aktiviere [**Computer Use**](/settings?s=computer&find=Computer%20use) neben der Überschrift. Je nach System gilt anschließend:

- **Mac**: Erteile Hydor die beiden macOS-Berechtigungen. Neben [**Bedienungshilfen**](/settings?s=computer&find=Accessibility) für Maus und Tastatur öffnet **Erlauben…** die Systemeinstellungen unter **Datenschutz & Sicherheit → Bedienungshilfen**, nachdem macOS um Erlaubnis zur Computersteuerung gefragt hat. Aktiviere dort **Hydor**. Neben [**Bildschirmaufnahme**](/settings?s=computer&find=Screen%20Recording) öffnet **Erlauben…** die entsprechende Freigabe unter **Bildschirmaufnahme**, ab macOS 15 **Bildschirm- & Systemaudioaufnahme**. Aktiviere **Hydor**. Falls macOS Beenden und Neustarten verlangt, folge dem Hinweis; laufende Agenten arbeiten weiter. Erteilte Berechtigungen zeigen **Erlaubt** und bleiben bei Updates bestehen. Ist Hydor in den Systemeinstellungen aktiv, aber hier steht weiterhin **Erlauben…**, stammt die Freigabe möglicherweise von vor Version 0.28.1, als sie nach Updates erneut nötig war. **Erlauben…** entfernt die alte Zuordnung; aktiviere Hydor danach erneut.
- **Windows**: Keine zusätzliche Freigabe nötig. Programme mit Administratorrechten und der gesperrte Bildschirm sind nicht erreichbar.
- **Linux**: Erforderlich sind ein X11- beziehungsweise Xorg-Desktop und Python 3, das meist vorhanden ist. Wayland, heute bei vielen GNOME- und KDE-Systemen Standard, erlaubt anderen Apps keinen solchen Bildschirm-, Maus- und Tastaturzugriff. Die Einstellungen erklären das und den Wechsel zu X11. Unter Ubuntu wählst du am Anmeldebildschirm über das Zahnrad **Ubuntu on Xorg**.

Verhindert etwas Computer Use, nennt ein gelbes Feld oben den Grund. Bei deaktiviertem Schalter steht dort, dass Agenten den Computer nicht bedienen können. Die Einstellungsseite ist überall vorhanden, die Funktion selbst nur in der Desktop-App; anderswo erklärt ein Hinweis diese Einschränkung.

### Was Agenten am Computer tun können

Beim ersten gewünschten Computerzugriff pro Sitzung fragt eine Karte „Darf der Agent deinen Mac bedienen?“, unter Windows „deinen PC“ und unter Linux „deinen Computer“. **Für diese Sitzung erlauben** und **Nicht jetzt** beantworten die Anfrage. Die Sitzung wartet, und du wirst benachrichtigt. Nach Freigabe kann der Agent:

- den verkleinerten Hauptbildschirm sehen, keine weiteren Bildschirme;
- klicken, doppelklicken, rechtsklicken, ziehen, scrollen und den Zeiger bewegen;
- Text in beliebigen Sprachen eingeben und Tastenkombinationen drücken, etwa ⌘C am Mac oder Strg+C unter Windows und Linux;
- Apps nach ihrem Namen aus Start- oder Anwendungsmenü öffnen.

Während der Bedienung leuchten auf allen Bildschirmen die Ränder. Unten steht „Ein Agent bedient deinen Mac“ beziehungsweise PC oder Computer sowie „Esc zum Stoppen“. Die Anzeige lässt Klicks durch und erhält nie den Tastaturfokus. Sie ist nur für dich sichtbar: Für Agentenscreenshots wird sie kurz ausgeblendet. Unter Linux benötigt sie einen Desktop mit Fenster-Compositing, etwa GNOME, KDE, Xfce, Cinnamon oder MATE. Ohne diesen Effekt meldet immerhin das Tray-Symbol die aktive Bedienung.

### Den Zeiger auf deinem Bildschirm verfolgen

Der Agent bewegt deinen echten Mauszeiger, der leicht zu übersehen ist. Deshalb umgibt ihn ein großer Ring mit weichem Leuchtrand in den Anzeigefarben und einer **Agent**-Kennzeichnung:

- Der Zeiger gleitet innerhalb einer Viertelsekunde ans Ziel, statt zu springen. Der Ring folgt mit.
- Ein Klick erzeugt eine Welle, ein Rechtsklick eine gestrichelte, ein Doppelklick zwei. Beim Ziehen zieht sich der Ring zusammen und folgt der Bewegung.
- Eingegebener Text und gedrückte Tasten wie Strg+S oder Enter erscheinen kurz neben der Kennzeichnung. Pfeile zeigen Scrollrichtungen.

Der Ring gehört zur Randanzeige: Klicks gehen hindurch, er erhält keinen Tastaturfokus, erscheint nicht auf Agentenscreenshots und benötigt unter Linux Fenster-Compositing.

Jeder Schritt steht im Gespräch mit einem kleinen Screenshot danach. Ein Klick auf das Bild vergrößert es; die Zeile öffnet das vollständige Tool-Ergebnis. Im großen Bild markieren Ringe Klicks, bei Doppel- und Rechtsklick entsprechend doppelt oder gestrichelt, Linien Ziehbewegungen und Pfeile Scrollen. Mehrere Aktionen werden nummeriert. Die App speichert die letzten 200 Schrittbilder je Sitzung und entfernt sie nach einem Monat ohne Sitzungsnutzung.

Agenten sollen vor dem Handeln den Bildschirm ansehen, für Websites den Browser verwenden und niemals Passwörter, Kartennummern oder Codes eintippen beziehungsweise zahlen, kaufen oder Geld versenden. Dafür stoppen sie und bitten dich um Übernahme. Nur eine Sitzung darf den Computer gleichzeitig bedienen.

### Computer Use sofort stoppen

Während der Bedienung zeigen Randanzeige, App-Symbol und Sitzung den Zugriff an. Am Mac steht etwa „Agent bedient deinen Mac“ in der Menüleiste und über dem Nachrichtenfeld. Zum sofortigen Stoppen:

- drücke in einer beliebigen App **Esc**, am Mac auch **⌘⇧Esc**. Esc stoppt nur bei laufender Agentenbedienung. Ein vom Agenten selbst gedrücktes Escape, etwa zum Schließen eines Dialogs, stoppt ihn nicht;
- wähle **Stoppen** im Menü des App-Symbols, am Mac in der Menüleiste, unter Windows im Infobereich, unter Linux im System-Tray;
- oder klicke **Stoppen** über dem Sitzungsfeld beziehungsweise unter Einstellungen → Computer Use.

Stoppen beendet die Aktion und entzieht allen Sitzungen die Freigabe. Für erneuten Zugriff muss der Agent wieder fragen, etwa „Du hast die Bedienung deines Macs gestoppt. Darf der Agent fortfahren?“. Das Ausschalten von **Computer Use** hat dieselbe Wirkung.

## Einen Agenten fragen

- „Aktiviere SearXNG unter https://searx.example.org, setze es an die erste Stelle der Suchanbieter und teste es.“
- „Deaktiviere DuckDuckGo für die Websuche.“
- „Verwende standardmäßig 50 Suchergebnisse.“
- „Lass den Browser niemals facebook.com oder tiktok.com öffnen.“
- „Zeige den Browser als Fenster auf diesem Computer und deaktiviere seine Screenshots.“
- „Erstelle ein Browserprofil namens Einkaufen.“ Die Anmeldung führst du selbst unter Einstellungen → Browser durch.
- „Fülle für mich das Bibliotheksausweisformular auf riverside.example.org aus. Ich schaue zu.“ Der Live-Zeiger zeigt seine Klicks und Eingaben.
- „Öffne Notizen auf meinem Mac und lege eine Notiz mit der heutigen Einkaufsliste an.“
- „Öffne Editor und schreibe die heutige Einkaufsliste auf.“ Unter Windows zeigt der leuchtende Rand die Arbeit an, der Ring markiert den Zeiger und Esc stoppt sie.
