# Suche und Browser

Agenten können unabhängig vom Modell im Web suchen, Seiten lesen und einen echten Browser bedienen. Dieser Beitrag erklärt Suchanbieter und Einrichtung, was eine Suche zeigt und ihre Quellen sowie die Live-Ansicht des Browsers und seine Übernahme für Anmeldungen, Prüfungen oder Zahlungen. Er behandelt auch die Seite „Browser“, einen eigenen Browser in der Desktop-App (Tabs, private Tabs, eine intelligente Adressleiste, Lesezeichen, Verlauf, ein Werbeblocker, Übersetzung, Leseansicht, Erweiterungen), und wie du einem Agenten eine Seite daraus übergibst. In der Desktop-App für Mac, Windows und Linux läuft der Browser in der App, und Agenten können auch Bildschirm, Maus und Tastatur deines Computers verwenden.

![Ein Agent hat im Web recherchiert, Seiten gelesen und Ergebnisse in einer Tabelle verglichen](images/web.webp)

## Wie Agenten im Web suchen

Alle hier ausgeführten Agenten, darunter Claude Code, Codex, Custom und ACP-Agenten, erhalten drei App-Tools: Websuche, Seitenabruf und die Suche nach Bildern und Videos zu konkreten Dingen. Sie funktionieren modellunabhängig; auch ein kleines lokales Modell kann damit genauso recherchieren wie ein großes.

- Suchanfragen verwenden die Anbieter unter **Einstellungen → Funktionen → Suchen** in ihrer Reihenfolge. Der erste aktivierte Anbieter antwortet. Fehlen Key oder Kontingent, ist der Anbieter unerreichbar oder verlangt er eine Bot-Prüfung, wird der nächste versucht. Das Ergebnis nennt dem Agenten den verwendeten Anbieter.
- Agenten können bis zu 100 Ergebnisse anfordern und nach Websites einschließlich Ausschlüssen, Zeitraum, Sprache, PDF-Dateien oder offiziellen Startseiten filtern, etwa Personen- oder Unternehmensseiten. Naget Search unterstützt außerdem Kategorien wie Papers, Preprints, biomedizinische Veröffentlichungen, US-Patente, Unternehmensberichte, Nachrichten, Dokumentation und Diskussionen. Unterstützt ein Anbieter einen Filter nicht, erfährt der Agent das. Setzt ein Agent selbst keinen Filter, nennen die Wörter seiner Suche aber welche (etwa „Klimaberichte auf nasa.gov vom letzten Monat“ oder „Papers zu Retrieval Augmented Generation seit 2024“), liest das Hilfsmodell sie zuerst heraus (siehe [Das Hilfsmodell wählen](/guide/agents-models#choose-the-helper-model)), und Naget Search durchsucht die übrigen Wörter mit diesen Filtern. Das geschieht nur bei Suchen, deren Wörter nach einem Filter aussehen, wenige auf einmal und in etwa 8 Sekunden. Kann das Hilfsmodell nicht rechtzeitig antworten oder schlägt das Lesen zweimal hintereinander fehl (dann pausiert es 10 Minuten), läuft die Suche so, wie der Agent sie geschrieben hat; ebenso bei SearXNG, Brave Search und DuckDuckGo und wenn der Agent selbst einen Filter setzt. Finden die gelesenen Filter nichts, durchsucht Naget Search stattdessen die Wörter so, wie sie geschrieben wurden.
- Naget Search kann pro Treffer statt eines gewöhnlichen Auszugs gezielt die zur Frage passenden Sätze liefern. Das dauert länger und wird verwendet, wenn Fakten aus den Seiten benötigt werden. Dafür ist kein Key nötig.
- Für Listen von Spielen, Filmen, Orten, Gerichten, Produkten oder Teams können Agenten jeweils ein Bild finden: bevorzugt aus dem passenden Wikipedia-Artikel, etwa Cover, Ortsfoto oder Vereinswappen, sonst das Vorschaubild einer zugehörigen Webseite. Auf Wunsch kommt ein YouTube-Video hinzu, dessen Titel das Objekt ausdrücklich nennt, etwa Trailer, Rezept oder Höhepunkte. Ohne eindeutige Zuordnung bleibt der Eintrag ohne Bild oder Video. Apps verwenden diese Inhalte in Antworten; siehe [Apps](/guide/apps).
- Agenten sollen verwendete Seiten mit einer Nummer in Klammern direkt an der belegten Aussage und einer Liste genau dieser Seiten am Antwortende zitieren. Die App stellt daraus Links und Quellenkarten dar; siehe [Quellen unter einer Antwort ansehen](/guide/web#see-the-sources-under-a-reply). Suchergebnisse und Webseiten gelten als Informationen, niemals als Anweisungen.

Fehlgeschlagene Anbieter werden vorübergehend ausgesetzt, etwa bis wieder Kontingent vorhanden ist, damit weitere Suchen nicht erneut darauf warten. Identische Anfragen innerhalb von zehn Minuten verwenden das gespeicherte Ergebnis.

Claude Code und Codex besitzen zusätzlich eigene Webtools. Deren zitierte Quellen werden auf dieselbe Weise dargestellt.

## Suchanbieter auswählen

Öffne [Einstellungen → Funktionen → Suche](/settings?s=search). Auf dem Smartphone wählst du in der Einstellungsliste unter Funktionen **Suchen**.

Unter [Anbieter](/settings?s=search&find=Providers) gilt „Von oben nach unten: Der erste aktivierte Anbieter antwortet“. Jede Zeile zeigt:

- den Namen, beim ersten aktivierten Anbieter **Standard** und gegebenenfalls Warnungen wie **Key erforderlich** oder **Benötigt die Adresse deiner Instanz**;
- eine Zeile dazu, was er ist; das (i) neben seinem Namen ergänzt, worauf er eine Suche beschränken kann, etwa „Bis zu 100 Ergebnisse · Kategorien · Zeiträume · Startseiten · die Teile von Seiten, die antworten“;
- falls vorhanden eine gekürzte Kennzeichnung des gespeicherten Keys wie „sk-ab…12cd“, niemals den vollständigen Wert;
- den letzten Fehler in Rot mit Zeitangabe;
- ein Schalter rechts, der ihn ein- oder ausschaltet, und ein **⋯**-Menü mit **Key hinzufügen** (oder **Key ändern**), **Adresse festlegen** (oder **Adresse ändern**), **Testen**, **Als Standard festlegen** (bei einem Anbieter, der an, aber nicht der erste ist) sowie **Nach oben verschieben** und **Nach unten**, um seinen Platz in der Reihenfolge zu ändern.

Das (i) neben **Anbieter** sagt, dass Agenten das Web durchsuchen und Seiten lesen können, egal welches Modell sie nutzen, und dass Suchergebnisse und Seiten externe Daten sind, die Agenten als Information nutzen, nie als Anweisungen.

**Als Standard festlegen** verschiebt den Anbieter nach oben. Die anfängliche Reihenfolge lautet Naget Search, SearXNG, Brave Search und DuckDuckGo. Naget Search und DuckDuckGo sind aktiviert. SearXNG und Brave Search bleiben bis zur Eingabe ihrer Voraussetzungen deaktiviert.

### Naget Search

[Naget Search](/settings?s=search&find=Naget%20Search) ist der Standardanbieter mit einem eigenen Index für Web, Papers, Patente und Unternehmensberichte. Ohne Key steht ein kostenloses Tageskontingent bereit. Nach der ersten Antwort zeigt die Zeile **Heute verbleibendes kostenloses Kontingent**, einen Balken und die nächste Freigabezeit. Ist das Kontingent verbraucht, erscheint ein Hinweis; bis zur Erneuerung antwortet der nächste Anbieter.

Ein Key von naget.com ermöglicht mehr Anfragen. Die Anzeige nennt dann **Verbleibende Credits**. Mit Key kann Naget Search auch beim Seitenabruf die zur Frage passenden Sätze auswählen; siehe [Ganze Seiten oder gezielt passende Abschnitte lesen](/guide/web#read-whole-pages-or-only-the-parts-that-answer-a-question). Ohne Key wählt die App Absätze nach Wörtern aus. Passende Sätze direkt in Suchergebnissen sind auch ohne Key möglich. „Naget Search benötigt derzeit einen Key“ bedeutet, dass Anfragen ohne Key gerade abgelehnt werden; bis zur Eingabe übernimmt der nächste Anbieter.

Das Formular enthält außerdem **Adresse**, standardmäßig https://naget.com. Ändere sie nur, wenn du eine andere Adresse erhalten hast.

### SearXNG

[SearXNG](/settings?s=search&find=SearXNG) ist eine Suchmaschine, die du selbst betreibst, die viele Suchmaschinen auf einmal fragt und nichts über dich aufzeichnet. Sie braucht keinen Key, nur die Adresse deiner Instanz: Öffne ihr **⋯**-Menü, wähle **Adresse festlegen**, gib sie ein (etwa https://searx.example.org) und drücke auf **Speichern**. Mit einer Adresse wird sie eingeschaltet. Sie liefert bis zu 100 Ergebnisse.

### Brave Search

[Brave Search](/settings?s=search&find=Brave%20Search) verwendet den unabhängigen Brave-Index über die Search API. Dafür brauchst du einen Key; Brave bietet auch einen kostenlosen Tarif. **⋯ → Key hinzufügen** öffnet ein Formular mit dem Link **Key unter api-dashboard.search.brave.com erhalten**. Speichern aktiviert den Anbieter. Er liefert bis zu 100 Ergebnisse.

### DuckDuckGo

[DuckDuckGo](/settings?s=search&find=DuckDuckGo) benötigt keinen Key und ist von Anfang an als letzter Anbieter aktiviert. Es liefert ungefähr zehn Treffer pro Seite und insgesamt höchstens 30. Bei einer Bot-Prüfung übernimmt der nächste Anbieter, sofern vorhanden.

### Key oder Adresse hinzufügen oder ändern

1. Öffne in der Zeile des Anbieters das **⋯**-Menü und wähle **Key hinzufügen** (oder **Key ändern**, **Adresse festlegen**, **Adresse ändern**).
2. Füge den Key unter **Key** ein, wo er als Punkte erscheint, oder gib die **Adresse** an. Bei Naget Search ist der Key als optional für zusätzliche Anfragen gekennzeichnet.
3. **Speichern** übernimmt die Angaben; **Abbrechen** verwirft sie.

Das Hinterlegen einer benötigten Adresse oder eines Keys aktiviert den Anbieter. Keys bleiben auf dem Server; die Oberfläche zeigt nur eine gekürzte Kennzeichnung. **Gespeicherten Key entfernen** im Formular löscht ihn.

### Einen Anbieter testen

Öffne das **⋯**-Menü einer Zeile und wähle **Testen**. Die App führt eine kleine Suche nur mit diesem Anbieter aus, ohne auf den nächsten auszuweichen, und mit dem, was du in sein Formular getippt hast, noch bevor du es speicherst. Du siehst „Funktioniert:“, die Zahl der Ergebnisse und wie lange es dauerte, mit den ersten drei Ergebnissen als Links, oder den Grund, warum es fehlschlug. Einen Anbieter zu testen, wie er gespeichert ist, löscht außerdem seinen alten Fehler, sobald er wieder funktioniert.

### Ergebnisse pro Suche

[Ergebnisse pro Suche](/settings?s=search&find=Results%20per%20search) legt die Standardzahl fest, falls der Agent keine nennt: **10**, **20** als Standard, **50** oder **100**. Für gründliche Recherche, etwa nach Fachartikeln, kann der Agent weiterhin bis zu 100 verlangen. Mehr Ergebnisse bedeuten mehr zu lesenden Inhalt.

Ein Hinweis unten auf der Seite verlinkt die Entwickleranleitung zum Ergänzen weiterer Anbieter.

### Wenn kein Anbieter antworten kann

Scheitern alle aktivierten Anbieter oder sind alle ausgeschaltet, erhält der Agent die einzelnen Gründe. Claude Code und Codex verwenden dann für diese und weitere Anfragen des Auftrags ihre eigene integrierte Websuche, Claude Code WebSearch beziehungsweise die Codex-Websuche, und zitieren wie gewohnt. Erst wenn auch diese scheitert, verweisen sie dich auf Einstellungen → Suche. Andere Agenten wie Custom haben keine eigene Websuche. Sie sollen dich darauf hinweisen, dort einen Key zu hinterlegen oder einen anderen Anbieter zu aktivieren. Bei [Tiefgehende Recherche](/guide/research) sind die agenteneigenen Websuchen deaktiviert, damit jede Anfrage zum Suchbudget zählt; dort erfährst du ebenfalls, was zu korrigieren ist.

## Suchergebnisse ansehen

Agentenschritte sind zwischen Nachrichten zusammengefasst, etwa „4-mal gesucht“, wobei dort Websuchen und Seitenabrufe gemeinsam zählen. Öffne die Zeile für die einzelnen Schritte. Eine Suche heißt beispielsweise „Im Web nach ‚E-Bikes unter 2.000 Euro‘ gesucht“. Rechts stehen Anbieter und Trefferzahl, auf dem Smartphone nur die Anzahl. Währenddessen steht „Websuche läuft“ mit Zeitmessung; ein Fehler erscheint als „Websuche fehlgeschlagen“.

Ein Klick öffnet:

- verwendete Filter als kleine Markierungen, etwa Website, Zeitraum oder Kategorie (auch die aus den Wörtern der Suche gelesenen, mit einem Hinweis auf die gesuchten Wörter), sowie gegebenenfalls „Passende Auszüge“ für gezielt angeforderte Sätze;
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

In der Unterhaltung erscheint ein Lesen als „Gelesen“ mit dem Titel der Seite, auf breiteren Bildschirmen mit der Frage, die an sie gestellt wurde. Klicke darauf, um die Adresse zu sehen, welcher Teil es war („Teil 1 von 3“) oder „die Teile, die antworten“ auf die Frage, und den Text, den der Agent bekam.

## Der Browser für Agenten

Für Websites mit Interaktionen, Formularen, Anmeldungen oder Skripten reicht ein Textabruf nicht. Agenten nutzen dafür einen Browser, der von deinem eigenen getrennt ist: Er hat keine der Anmeldungen des Chrome, Edge, Firefox oder Safari, die du benutzt. Du kannst ihn live beobachten und jederzeit übernehmen. Welcher Browser es ist, hängt davon ab, wo die App läuft:

- **In der Desktop-App** (Mac, Windows, Linux) ist es der eigene Browser der App auf Basis von Chromium (die Open-Source-Grundlage von Chrome), der in der App läuft. Es muss nichts installiert werden, und die App wählt ihn, sofern du keinen anderen wählst (siehe [Chromium](/guide/web#chromium)). Seine Seiten werden im Fenster der App schnell gezeichnet, du klickst in eine hinein, um sie zu bedienen, und er arbeitet auch bei geschlossenem Fenster weiter.
- **Überall sonst** (die App in Docker oder auf einem Server sowie ein Smartphone oder jede Webseite, die sie anzeigt) ist es ein echtes Chromium, das die App auf dem Computer startet, auf dem sie läuft, und das du als Livebild siehst.

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

Manches bleibt immer dir vorbehalten oder wartet auf dein OK:

- **Anmeldungen ohne hinterlegte Zugangsdaten, Prüfungen und Unsicherheiten.** Agenten sollen diese an dich übergeben, einschließlich Captchas und zugesandter Einmalcodes. Muss ein Auftrag später ohne dich erneut auf ein Konto zugreifen, etwa eine geplante Aufgabe, kann der Agent stattdessen über eine Karte nach Zugangsdaten für den Tresor fragen.
- **Bezahlen und Bestellen.** Agenten klicken nie auf zahlungs- oder bestellauslösende Schaltflächen wie Bezahlen, Jetzt kaufen, Bestellen, Abonnieren, Spenden, Jetzt buchen oder Absenden eines Formulars mit Kartenfeldern. Sie halten an und bitten dich, selbst abzuschließen.
- **Deine Eingaben.** Passwörter, Kartennummern, Sicherheits- und Einmalcodes sowie während deiner Übernahme eingegebene Inhalte werden dem Agenten nie gezeigt. Auch passwortähnliche URL-Bestandteile werden verborgen. Aus dem Tresor befüllte Felder erscheinen als Punkte; der Agent erfährt nur, dass sie ausgefüllt wurden.
- **Schaltflächen, die senden, veröffentlichen, löschen oder überweisen, auf einer Website, bei der der Browser angemeldet ist.** Bevor ein Agent eine drückt, wirst du gefragt, ob er darf (siehe [Schaltflächen, die senden, veröffentlichen oder löschen](/guide/web#buttons-that-send-post-or-delete)). In den Einstellungen kannst du das ausschalten.
- **Dialogfragen der Seite**; siehe [Dialogfragen einer Webseite beantworten](/guide/web#answer-a-pages-pop-up-questions).

Jede Sitzung hat einen eigenen Browser. Ohne Profil startet er ohne Anmeldung und verwirft alles beim Schließen. Mit Profil übernimmt er dessen Anmeldungen; siehe [Anmeldungen mit Profilen behalten](/guide/web#keep-sign-ins-with-profiles). Dein eigener Browser auf der Seite „Browser“ ist ein anderer, den Agenten nie verwenden, es sei denn, du übergibst ihnen eine Seite daraus (siehe [Eine Seite an einen Agenten übergeben](/guide/web#hand-a-page-to-an-agent)).

## Den Browser live beobachten

Bei geöffnetem Sitzungsbrowser erscheint direkt über dem Nachrichtenfeld ein Bereich mit Seitentitel oder „Leere Seite“, aktueller Aktion wie „Klickt auf ‚Anmelden‘“ oder „Schreibt in ‚Suche‘“, verwendetem Profil und Tabzahl. Bei Rückfragen steht dort „Wartet auf dich“, während deiner Bedienung „Du steuerst – der Agent wartet“.

Am Computer:

- Eingeklappt zeigt der Bereich links ein kleines Livebild. Klicke darauf, auf den Titel oder auf **Live-Ansicht anzeigen**, um ihn zu öffnen. **Live-Ansicht ausblenden** klappt ihn ein.
- **Vollbild** zeigt den Browser über der gesamten App, **Vollbild beenden** kehrt zurück.
- **Übernehmen** lässt dich den Browser selbst bedienen (siehe unten), und **Browseroptionen** (⋯) öffnet sein Menü.

Auf dem Smartphone öffnet ein Antippen den Browser im Vollbild; × schließt die Ansicht.

In der Desktop-App ist die Live-Ansicht die Seite selbst, von der App gezeichnet und so schnell aktualisiert, wie sich die Seite ändert, sodass sich Scrollen und Tippen wie in jedem Browser anfühlen. Anderswo ist sie ein Bild der Seite, das mehrmals pro Sekunde übertragen wird, solange du zusiehst; bis zum ersten Bild steht „Verbindung zum Browser wird hergestellt…“.

### Den Zeiger des Agenten verfolgen

Da der Browser unsichtbar im Hintergrund läuft, zeigt die Live-Ansicht einen großen Pfeil in der App-Farbe mit weichem Leuchtrand und **Agent**-Kennzeichnung.

- Bevor der Agent klickt, tippt oder scrollt, gleitet sein Zeiger von seiner bisherigen Stelle an diese Stelle, in etwa einer Drittelsekunde, damit dein Auge ihm folgen kann. Solange du zusiehst, wartet der Agent darauf; wenn niemand den Browser ansieht, wartet er nicht.
- Beim Klick breitet sich ein Ring aus, beim Doppelklick zwei. Eingabefelder und Auswahllisten erhalten kurz einen Rahmen. Scrollpfeile zeigen die Richtung; gedrückte Tasten wie Enter, Tab oder Strg+A erscheinen neben der Kennzeichnung.
- Der Zeiger bleibt dort, wo der Agent zuletzt gehandelt hat. Im kleinen Bild des eingeklappten Panels erscheint er als kleiner Pfeil.
- Während du steuerst, verschwindet der Zeiger des Agenten aus der Live-Ansicht: Deiner ist der einzige. Er kommt zurück, wenn du den Browser zurückgibst.

Jeder Browserschritt steht außerdem in der Unterhaltung, etwa „github.com geöffnet“, „Schaltfläche [12] ‚Anmelden‘ angeklickt“ oder „Dich gebeten: Bei GitHub anmelden“, mit einem kleinen Bild der Seite danach. Ein Klick auf die Zeile öffnet das größere Bild und die vollständige Antwort des Tools. Im großen Bild markieren Ringe Klickstellen und gestrichelte Rahmen Eingabefelder, bei mehreren Aktionen nummeriert. Die App speichert Bilder der letzten 400 Schritte je Sitzung. Nach einem Monat ohne Sitzungsnutzung werden sie gelöscht.

## Für Anmeldung, Prüfungen oder Zahlungen übernehmen

Wenn ein Agent dich im Browser braucht, erfährst du es an mehreren Stellen zugleich:

- oben im Browserbereich mit passenden Schaltflächen;
- als Unterhaltungskarte, etwa „Benötigt dich im Browser: Bei GitHub anmelden“, mit **Anzeigen**, auf dem Smartphone **Öffnen**;
- als Benachrichtigung und Eintrag im [Posteingang](/inbox). Siehe [Posteingang und Benachrichtigungen](/guide/inbox).

Am Computer öffnet sich die Live-Ansicht bei Anmeldung, Zahlung oder Dialogfrage automatisch und klappt nach Erledigung wieder ein, sofern du sie nicht selbst geöffnet hattest.

### Am Computer

1. Wähle **Übernehmen** in der Hinweiszeile oder im Browserbereich. „Du steuerst – der Agent wartet“ und ein farbiger Rahmen kennzeichnen die Übernahme.
2. Bediene die Seite wie gewohnt mit Maus, Scrollrad und Tastatur. Klicke zuerst in die Seite; anschließend gehen Tastendrücke dorthin statt an App-Kurzbefehle. Eingefügte Inhalte werden als Text übernommen. In der Desktop-App genügt ein Klick oder Tastendruck in der Seite zum Übernehmen: Der Bereich wechselt von selbst zu „Du steuerst – der Agent wartet“, und solange der Agent steuert, steht unter der Adresse „Klicke in die Seite, um sie selbst zu bedienen“.
3. Während du steuerst, hat eine Leiste über der Seite **Zurück**, **Neu laden** und die Adresse: Gib eine Adresse ein und drücke Enter, um dorthin zu gehen.
4. Klicke nach Abschluss in der Hinweiszeile auf **Fertig**. Die App informiert den Agenten mit dem aktuellen Seitenstand, und er setzt seine Arbeit fort.

### Auf dem Smartphone

1. Tippe auf **Übernehmen**. Der Browser öffnet im Vollbild und passt die Seite während deiner Bedienung an den Smartphonebildschirm an. Darüber stehen **Zurück**, **Neu laden** und die Adresszeile.
2. Tippen entspricht einem Klick, Ziehen scrollt. **Tippen** öffnet die Bildschirmtastatur. Daneben stehen Tab, Enter, Esc, ⌫ und Pfeiltasten.
3. **Fertig** stellt die normale Seitengröße wieder her und lässt den Agenten weiterarbeiten.

### Bezahlen und Bestellen

Vor einem zahlungs- oder bestellauslösenden Knopf hält der Agent an, etwa „Vor Zahlung oder Bestellung gestoppt: Bestellen auf shop.example.com. Das musst du selbst ausführen.“ Übernimm, prüfe die Bestellung und bezahle selbst. **Fertig** meldet den Abschluss, **Nicht jetzt** den Abbruch. Der Agent erfährt deine Entscheidung.

### Andere Rückmeldungen und selbst übernehmen

- **Nicht möglich** meldet dem Agenten, dass du die Bitte nicht erfüllen konntest.
- Du kannst jederzeit über **Übernehmen** selbst eingreifen, auch ohne Aufforderung. Der Agent wartet. Versucht er währenddessen einen Browserzugriff, erfährt er, dass du steuerst und er bei Rückgabe benachrichtigt wird. **An Agenten zurückgeben** gibt die Steuerung frei; ein wartender Agent erhält den aktuellen Seitenstand.

Die von der App in deinem Namen gesendeten Meldungen erscheinen in der Unterhaltung. Bei einem laufenden Durchlauf warten sie bis zu dessen Ende.

## Schaltflächen, die senden, veröffentlichen oder löschen

Auf einer Website, bei der der Browser angemeldet ist, fragt ein Agent nach, bevor er eine Schaltfläche drückt, die etwas sendet, veröffentlicht, teilt, beantwortet, löscht, entfernt, überweist oder abhebt. Das gilt für einen Browser mit Profil (siehe [Anmeldungen mit Profilen behalten](/guide/web#keep-sign-ins-with-profiles)) und für eine Seite, die du einem Agenten übergeben hast (siehe [Eine Seite an einen Agenten übergeben](/guide/web#hand-a-page-to-an-agent)). Ein Browser, der ohne Anmeldung neu startet, hat nichts zu schützen und fragt nicht. Bezahlen und Bestellen bleiben allein deine Sache (siehe oben).

Der Agent erkennt diese Schaltflächen an ihren Wörtern auf Englisch, Deutsch, Griechisch, Chinesisch, Französisch und Spanisch: Senden, Veröffentlichen, Löschen, Überweisen und Ähnliches, dazu ein bloßes „Bestätigen“ oder „Ja“, wenn die Seite von einer davon handelt (ein Dialog mit „Diesen Beitrag löschen?“). „Anmelden“, „Weiter“, „Entwurf speichern“, „Abbrechen“, eine Suchschaltfläche und das Senden eines Codes an dich selbst (Code erneut senden) werden nicht angehalten.

Erreicht er eine, hält er an, beendet seinen Durchlauf und wartet. Du siehst „Möchte „Delete“ auf mail.example.com drücken“ an denselben Stellen wie andere Fragen (die Zeile im Browserbereich und eine Karte in der Unterhaltung), mit **Nicht zulassen** und **Erlauben**. Die Live-Ansicht öffnet sich dabei nicht von selbst.

- **Erlauben** sagt dem Agenten, dass er die Schaltfläche jetzt drücken darf. Es gilt für einen Druck auf eine Schaltfläche mit denselben Wörtern auf dieser Website in den nächsten zwei Minuten; danach fragt der Agent erneut.
- **Nicht zulassen** sagt dem Agenten, dass er sie nicht drücken soll. Er macht ohne sie weiter oder sagt dir, was er nicht tun konnte. Die Karte zeigt dann „Erlaubt“ oder „Nicht erlaubt“.

Anfangs ist das eingeschaltet. Zum Ausschalten siehe [Vor dem Senden auf angemeldeten Websites fragen](/guide/web#ask-before-sending-on-signed-in-sites).

## Dialogfragen einer Webseite beantworten

Öffnet die Seite einen Dialog, etwa Warnung, Ja-Nein-Frage, Texteingabe oder „Seite verlassen?“, erscheint er über dem Livebild mit Website und Nachricht. Nur du antwortest: **OK**, **Abbrechen**, gegebenenfalls mit Textfeld, oder **Verlassen** und **Bleiben**. Hat ein Agentenschritt den Dialog ausgelöst, wirst du benachrichtigt; der Agent erfährt deine Antwort.

## Lokale Websites oder Netzwerkadressen für eine Sitzung erlauben

Die standardmäßig aktive Option [Zugriff auf diesen Computer und sein Netzwerk sperren](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) verhindert Seitenzugriffe auf lokale Geräte. Will der Agent etwa einen Entwicklungsserver öffnen, fragt er: „Möchte localhost:3000 auf diesem Computer oder in seinem Netzwerk öffnen“, mit **Nicht zulassen** und **Für diese Sitzung erlauben**. Eine Freigabe gilt für diese Adresse im Sitzungsbrowser; der Agent wird zum erneuten Öffnen aufgefordert.

Auch von dir während einer Übernahme eingegebene lokale oder private Adressen werden für die Sitzung freigegeben. Unter **Websites für diese Sitzung** im Browsermenü stehen sie unter „Auf diesem Computer oder im Netzwerk erlaubt“. × widerruft eine Freigabe. Hydor selbst lässt sich im Agentenbrowser nie öffnen.

## Das Browsermenü

**Browseroptionen** (⋯) am Panel öffnet ein Menü:

- **Tabs**, wenn mehrere offen sind: Wähle den sichtbaren Tab. Öffnet eine Seite einen neuen Tab, arbeitet der Agent dort weiter.
- **Wird im Sitzungsordner gespeichert**: die neuesten Dateien, die der Browser heruntergeladen hat; wähle eine, um sie zu öffnen.
- **Profil; ein Wechsel startet den Browser neu**: **Neues Profil ohne Anmeldungen** oder eines deiner Profile. Die Auswahl erscheint nach dem ersten angelegten Profil. Ein Wechsel schließt den Browser; beim nächsten Einsatz startet er mit dem neuen Profil.
- **Websites für diese Sitzung**: **Nur diese Seiten**, leer für uneingeschränkte Auswahl, und **Diese Websites ausschließen**, jeweils eine pro Zeile. Sie ergänzen die Listen unter Einstellungen → Browser. **Speichern** übernimmt sie.
- **Browser schließen**.

## Den Browser selbst öffnen

Du kannst den Browser einer Sitzung öffnen, bevor der Agent es tut, etwa um dich auf einer Website anzumelden, bevor du ihn dort arbeiten lässt. Öffne das Menü der Sitzung (⋯) → **Mehr** → **Browser öffnen**. Das Fenster erscheint über dem Nachrichtenfeld: Drücke **Übernehmen** und nutze es. Ist der Browser schon geöffnet, heißt derselbe Eintrag **Browser anzeigen**. Wenn der Browser in den Einstellungen ausgeschaltet ist, bekommst du einen Hinweis darauf. Für einen eigenen Browser, der an keine Sitzung gebunden ist, siehe [Dein eigener Browser](/guide/web#your-own-browser).

## Downloads und Uploads

Heruntergeladene Dateien liegen im Unterordner downloads des Sitzungsordners. Der Agent erfährt den Pfad. Das Browsermenü zeigt die neuesten Dateien unter **Wird im Sitzungsordner gespeichert**.

Ein Agent kann Dateien nur aus dem Ordner der Sitzung an das Upload-Feld einer Seite anhängen. Soll er eine andere Datei hochladen, kopiere sie zuerst in diesen Ordner (siehe [Dateien, Git, Terminal und Vorschau](/guide/files-git)).

## Wann der Browser schließt

Ein Sitzungsbrowser schließt automatisch:

- nach 15 Minuten ohne Bedienung oder Zuschauer, beziehungsweise nach zwei Stunden, wenn er auf dich wartet oder du steuerst;
- beim Schließen des letzten Tabs;
- beim Stoppen des Agentenprogramms oder Löschen der Sitzung;
- wenn du ein anderes Profil dafür wählst oder das Profil löschst, das er verwendet.

Alles, was noch auf dich gewartet hat, endet damit. Der Agent öffnet den Browser erneut, wenn er ihn das nächste Mal braucht.

In der Desktop-App braucht der Browser eines Agenten das Fenster der App nicht: Er arbeitet weiter, während das Fenster geschlossen oder verborgen ist, solange die App läuft (sie bleibt in der Menüleiste, im Infobereich oder im Tray). Öffne das Fenster, und seine Seiten sind zum Zusehen da.

## Dein eigener Browser

Die Seite **Browser** ist ein eigener Browser in der Desktop-App (Mac, Windows, Linux) neben dem, den Agenten benutzen: Öffne **Browser** in der Werkzeugleiste oder gehe zu [Browser](/browser). Sie gibt es nur in der Desktop-App: Die Web-App in einem Browser und ein Smartphone haben keine Schaltfläche **Browser**, und die Adresse [Browser](/browser) sagt das dort. Die Browser der Agenten funktionieren überall, und du kannst ihnen in ihren Sitzungen zusehen.

Er hat oben eine Leiste mit einem Feld, das sucht, öffnet und einen Agenten fragt oder ihm sagt, was er mit der Seite tun soll; links von der Seite eine Spalte mit deinen Tabs, den angehefteten Websites und den arbeitenden Agenten; und rechts eine Spalte, so breit, wie du sie ziehst, um einen Agenten zur Seite zu fragen oder ihm zu sagen, was er dort tun soll, für die Unterhaltung eines Agenten und für Verlauf, Downloads, Lesezeichen, Erweiterungen und Einstellungen. Er hat Zurück, Vorwärts und Neu laden, Lesezeichen, Verlauf, Chrome-Erweiterungen, einen Werbe- und Tracker-Blocker (mit einem Schild in der Adressleiste), der auch Cookie-Banner ausblendet, die Suche auf der Seite, Zoom, Drucken und Downloads. Außerdem gibt es [private Tabs](/guide/web#private-tabs), die alles vergessen, wenn du sie schließt, die [Übersetzung einer Seite](/guide/web#translate-a-page) in deine Sprache, die [Leseansicht](/guide/web#reader-view) für Artikel, [dunkle Seiten](/guide/web#dark-pages), [Screenshots und das Speichern einer Seite als PDF](/guide/web#screenshots-and-pdfs) sowie Websites, die nicht von selbst Ton abspielen dürfen. Wenn du auf einen Link zeigst, erscheint in einem kleinen Feld unten links auf der Seite, wohin er führt (unten rechts, solange die Maus dort ist), wie in Chrome. Seine Tabs sind echte Seiten im Fenster der App, mit der Geschwindigkeit und den Tasten jedes Browsers, und sie verbinden sich wie in jedem Browser direkt mit den Websites. Ein Menü oder Dialog der App, der sich über der Seite öffnet, nimmt sie für einen Moment weg (ein Bild von ihr bleibt sichtbar, bis er sich schließt). Er behält deine Anmeldungen zwischen den Besuchen, in einem eigenen Profil, das kein Agent wählen kann, und öffnet sich wieder mit den Tabs, die du hattest (bis zu 30; leere und private bleiben außen vor). Deine Tabs können auch Adressen auf diesem Computer und in seinem Netzwerk öffnen (zum Beispiel eine Website, die du gerade baust). Wenn der Browser nicht starten kann, nennt die Seite den Grund, mit **Erneut versuchen** und **Browser-Einstellungen**, die [Einstellungen → Browser](/settings?s=browser) öffnet.

### Leiste und Feld

Oben über die Seite verläuft eine Leiste. Links, über der Tab-Spalte, stehen das **HYDΩR**-Logo, **Neuer Tab** (+) und **Tabs ausblenden** (dasselbe wie Strg+B), das die Tab-Spalte wegklappt, bis **Tabs einblenden** sie zurückholt. Der Rest der Leiste gehört der Seite, auf der du bist:

- **Zurück**, **Vorwärts**, **Neu laden** und **Startseite** stehen links vom Feld. Während eine Seite lädt, wird aus Neu laden **Stoppen**. **Startseite** öffnet deine Startseite im Tab, in dem du bist, wie **Neuer Tab** in einem neuen.
- Das Feld in der Mitte ist die Adressleiste. Im Ruhezustand zeigt es die Adresse der Seite als Website, mit dem Rest der Adresse in einer blasseren Farbe, und den Hinweis **Strg+L**. Klicke hinein oder drücke Strg+L, und es zeigt die ganze Adresse zum Ändern. Was du dort eintippst, bleibt erhalten, während du in einer anderen App bist; ein Klick auf die Seite stellt die Adresse wieder her. Gib eine Adresse ein, mit oder ohne https:// (`example.com`, `localhost:3000`, `192.168.1.5`, eine `file://`-Adresse), und drücke die **Eingabetaste**, um sie zu öffnen. Alles andere, was du eintippst, wird mit deiner Suchmaschine gesucht (zunächst Google; siehe [Browser-Einstellungen](/guide/web#browser-settings)), und ein Kürzel wie `yt` und ein Leerzeichen vor deinen Wörtern sucht stattdessen auf dieser Website (siehe [Vorschläge](/guide/web#suggestions)). **Alt+Eingabetaste** oder Strg+Eingabetaste (⌘+Eingabetaste auf einem Mac) öffnet sie stattdessen in einem neuen Tab (einem privaten, wenn du in einem privaten Tab bist). Was es beim Tippen anbietet, steht unter [Vorschläge](/guide/web#suggestions). Das Schloss ist links (in einem privaten Tab steht zuerst ein violetter Chip **Privat**: siehe [Private Tabs](/guide/web#private-tabs)). Rechts sind ein Schild, das die auf einer Webseite blockierten Werbungen und Tracker zählt (siehe [Werbung und Tracker blockieren](/guide/web#block-ads-and-trackers)), eine Schaltfläche, die die Seite übersetzt, wenn sie in einer anderen Sprache als deiner ist (siehe [Eine Seite übersetzen](/guide/web#translate-a-page)), eine Buch-Schaltfläche für die Leseansicht, wenn die Seite einen Artikel hat, mit **Aa** daneben, solange sie aktiv ist (siehe [Leseansicht](/guide/web#reader-view)), und der Stern.
- Der Stern am Ende des Felds setzt ein Lesezeichen für die Seite in der Lesezeichenleiste; ausgefüllt ist sie als Lesezeichen gesetzt, und ein erneuter Klick entfernt das Lesezeichen. Die Websites der Leiste erscheinen als Kacheln oben in der Tab-Spalte.
- **Speichern** legt eine lesbare Kopie der Seite in einem Projekt ab, wie eine Leseansicht sie zeigt: den Text des Artikels mit seinen Bildern und Videos, ohne Menüs, Werbung, Kommentare und Skripte der Website. Ein Hinweis sagt „In den Dateien von“ und den Namen des Projekts („In den Dateien von Abschlussarbeit gespeichert“), mit **Öffnen**: Die Kopie ist eine Webseite unter den Dateien des Projekts, in seinem Tab **Dateien** (siehe [Dateien](/guide/projects#files)). Das **▾** neben Speichern (**Projekt zum Speichern wählen**) nennt, wohin sie kommen kann: **Kein Projekt** und jedes deiner Projekte. Ein Projekt, dessen Ordner Ordner enthält, lässt dich auch einen davon wählen (**Einen Ordner darin auswählen**), und die Datei der Kopie, eine .html-Seite, kommt dorthin. Der Ort, den Speichern benutzt, ist in diesem Menü markiert: der, den du zuletzt auf diesem Computer gewählt hast (zuerst **Kein Projekt**). Ohne Projekt sagt der Hinweis „Gespeichert. Wähle neben „Speichern“ ein Projekt, um Kopien in seinen Dateien zu behalten.“: Die Kopie bleibt ohne Projekt, und die Suche (Strg+K) findet sie. Deine Listen (Lesezeichen, Seiten zum späteren Lesen, Downloads, Verlauf und Markierungen) sind Bereiche dieser Seite, im **Menü** (⋯) (siehe [Die Spalte neben der Seite](/guide/web#the-column-beside-the-page)).
- **Fragen** öffnet die Spalte neben der Seite, in der du einen Agenten zu ihr fragst oder mit **Erledigen** einen Agenten in ihr arbeiten lässt (siehe [Neben der Seite fragen](/guide/web#ask-beside-the-page)); es leuchtet, solange die Spalte da ist.
- Danach kommen die Schaltflächen der Erweiterungen, die du angeheftet hast, dann **Erweiterungen** (das Puzzleteil), das jede eingeschaltete Erweiterung auflistet, und, wenn der geöffnete Tab die Chrome-Web-Store-Seite einer Erweiterung ist, **Zu Hydor hinzufügen** (siehe [Chrome-Erweiterungen](/guide/web#chrome-extensions)).
- **Menü** (⋯) bietet **Neuer privater Tab** (siehe [Private Tabs](/guide/web#private-tabs)), dann **Auf der Seite suchen**, **Seite übersetzen …** (**Original anzeigen**, solange die Seite übersetzt ist; siehe [Eine Seite übersetzen](/guide/web#translate-a-page)), **Leseansicht** und **Dunkle Seiten** (abgehakt, solange sie an sind; siehe [Leseansicht](/guide/web#reader-view) und [Dunkle Seiten](/guide/web#dark-pages)), und **Zoom** mit − und + und dem Zoom in Prozent dazwischen (siehe [Zoom, Drucken und Vollbild](/guide/web#zoom-print-and-full-screen)). Dann **Drucken …** und **Screenshot oder PDF**, das **Screenshot des sichtbaren Bereichs**, **Screenshot der ganzen Seite** und **Als PDF speichern …** an der Stelle des Menüs zeigt (**Screenshot oder PDF** oben darin bringt dich zurück; siehe [Screenshots und PDFs](/guide/web#screenshots-and-pdfs)). Dann deine Listen: **Verlauf**, **Downloads**, **Lesezeichen**, **Später lesen** (mit der Zahl der wartenden Seiten; siehe [Später lesen](/guide/web#read-later)) und **Markierungen** (mit der Zahl auf der Seite). Zuletzt der Browser selbst: **Erweiterungen**, **Website-Berechtigungen**, **Einstellungen** und **Tastenkombinationen**. Die Listen und diese öffnen sich in der Spalte rechts von der Seite (siehe [Die Spalte neben der Seite](/guide/web#the-column-beside-the-page)). Das Menü bleibt offen, während du auf − und + des Zooms drückst. In einem privaten Tab ist **Fragen** ausgegraut: Agenten bekommen nie einen privaten Tab.

Ein Link auf `/browser?url=https://example.com` öffnet die Seite Browser mit dieser Adresse in einem neuen Tab, und [/browser?private=1](/browser?private=1) öffnet einen neuen privaten Tab (hänge `&url=https://example.com` an, um diese Adresse darin zu öffnen).

### Vorschläge

Während du in die Adressleiste tippst, bietet eine Liste darunter an, mit den getippten Wörtern fett:

- deine geöffneten Tabs („Zum Tab wechseln“: Wähle einen, um zu ihm zu gehen, statt die Seite erneut zu öffnen; deine privaten Tabs sind darunter, solange sie offen sind, und nichts über sie wird danach behalten),
- deine Lesezeichen und die Seiten deines Verlaufs, die zu den Wörtern in ihren Titeln und Adressen passen, die du oft und zuletzt besucht hast zuerst (Adressen, die du selbst getippt hast, zählen am meisten, und ein Lesezeichen zählt wie zwanzig Besuche). Passen Lesezeichen zu den getippten Wörtern, sind immer mindestens zwei davon unter den angebotenen Seiten, anstelle der letzten Seiten deines Verlaufs, sodass ein großer Verlauf, etwa einer aus einem anderen Browser, sie nie verdeckt,
- bei eingeschaltetem [Nach Bedeutung suchen](/settings?s=memory&find=Search%20by%20meaning) Lesezeichen und Seiten deines Verlaufs, in denen es um das Getippte geht, auch wenn ihre Titel und Adressen dessen Wörter nicht enthalten, nach denen, die sie enthalten (sie erscheinen ohne fette Wörter). Das Modell, das sie findet, läuft auf diesem Computer, mit einem Vektor aus Titel und Adresse jeder Seite (ohne ihren Query-String), den die App getrennt von allem anderen in ihrer Datenbank aufbewahrt; er verschwindet mit der Seite,
- wenn das, was du getippt hast, mit einem deiner Suchkürzel und einem Leerzeichen beginnt (`yt lofi`), zuallererst eine Zeile, die diese Website nach den Wörtern danach durchsucht („Mit YouTube suchen: ‚lofi‘“), was **Enter** tut (siehe [Browser-Einstellungen](/guide/web#browser-settings)),
- das, was du getippt hast, als Suche („Mit Google suchen“) oder, wenn es wie eine Adresse aussieht, als diese Adresse; steht ein Kürzel davor, durchsucht diese Zeile weiterhin alle deine Wörter mit deiner Suchmaschine,
- die eigenen Vorschläge der Suchmaschine, wenn [Suchvorschläge](/guide/web#browser-settings) eingeschaltet ist,
- darunter, wenn der geöffnete Tab eine Webseite ist (und kein privater Tab, den Agenten nie bekommen), **Zu dieser Seite fragen: „…“**, das „Fragen“ neben der Seite mit dem Getippten als Frage öffnet. Solange in „Fragen“ **Erledigen** gewählt ist, steht dort stattdessen **Auf dieser Seite erledigen lassen: „…“**, das einem Agenten das Getippte gibt, damit er es dort erledigt (siehe [Auf der Seite erledigen lassen](/guide/web#do-it-on-the-page)),
- zuletzt **Agenten fragen: „…“**, das eine Sitzung mit dem Getippten als erster Nachricht startet, mit dem Agenten und Modell, die die Startseite zuletzt verwendet hat, und dich dorthin bringt.

Die Liste zeigt so viele Einträge, wie auf den Bildschirm passen, darunter mindestens zwei deiner Seiten und zwei Vorschläge der Suchmaschine, soweit es so viele gibt. Muss die Liste für ein niedriges Fenster gekürzt werden, gehen Seiten deines Verlaufs vor deinen Lesezeichen und geöffneten Tabs. Die Pfeiltasten bewegen sich darin, und **Enter** öffnet den markierten (das Getippte, wenn keiner markiert ist); **Alt+Enter** oder Strg+Enter (⌘+Enter auf dem Mac) öffnet ihn in einem neuen Tab (in einem privaten, wenn du in einem privaten Tab bist). Die Adressleiste vervollständigt auch an Ort und Stelle: Beginnt etwas, wohin du gegangen bist, mit dem Getippten, steht der Rest markiert hinter deinem Cursor (gefunden über die getippten Wörter, nie über die Bedeutung), und **Tab** oder **→** übernimmt ihn. Löschst du das Getippte, wird die Vervollständigung ausgeschaltet. **Umschalt+Entf** bei einem Verlaufsvorschlag vergisst diese Seite, und **Esc** schließt die Liste.

### Die Tab-Spalte

Die Spalte links von der Seite listet von oben nach unten auf (**Tabs ausblenden** oder Strg+B klappt sie weg):

- **Angepinnte Websites**: die Einträge deiner Lesezeichenleiste als Kacheln, fünf pro Reihe und höchstens zwei Reihen (eine Kachel **…** listet den Rest). Klicke auf eine, um sie im geöffneten Tab zu öffnen; Strg+Klick (⌘+Klick auf dem Mac) oder ein Mittelklick öffnet sie in einem neuen Tab. Ein Ordner öffnet eine Liste seines Inhalts. Rechtsklick auf eine Kachel bietet **Öffnen**, **In neuem Tab öffnen**, **Bearbeiten** (**Umbenennen** bei einem Ordner) und **Löschen**. Ist die Lesezeichenleiste leer, gibt es keine Kacheln; der Stern legt die Seite dort ab (siehe [Lesezeichen](/guide/web#bookmarks)).
- **Agenten bei der Arbeit**, solange ein Agent einen Browser offen hat: eine Zeile für jeden, mit seinem Symbol und einem Punkt (blau, solange er arbeitet, bernsteinfarben, wenn er auf dich wartet oder du steuerst), dem Titel der Sitzung und dem, was er gerade tut. Klicke auf eine, um ihn zu sehen (siehe [Agenten bei der Arbeit](/guide/web#agents-at-work)). Ihr Pfeil klappt die Liste zu.
- **Privat**, solange du private Tabs offen hast: ein violetter Bereich mit einer Maske und der Anzahl und einer Zeile für jeden privaten Tab (eine getönte Zeile, mit einer kleinen Maske auf ihrem Symbol). Ein Klick auf die Beschriftung klappt den Bereich ein; **Private Tabs schließen** (×, wenn du auf die Beschriftung zeigst) schließt sie alle, und **Neuer privater Tab** an seinem Ende öffnet einen weiteren (siehe [Private Tabs](/guide/web#private-tabs)). Private Tabs sind in keiner Gruppe und lassen sich nicht in eine ziehen.
- **Tabs**: eine Zeile für jeden Tab, mit Symbol, Titel, **⋯** und **×** (beim geöffneten Tab und bei dem, auf den du zeigst). Ein Titel, der zu lang für die Spalte ist, blendet an seinem Ende aus und läuft durch, solange du auf seine Zeile zeigst, damit du den Rest siehst. Der geöffnete Tab ist die markierte Zeile; ein Klick auf eine Zeile zeigt diesen Tab, ein Mittelklick schließt ihn. Rechtsklicke eine Zeile oder drücke ihr **⋯** für das Menü des Tabs (siehe [Tab-Gruppen und das Tab-Menü](/guide/web#tab-groups-and-the-tab-menu)). Tabs, die du in eine Gruppe legst, stehen unter dem Kopf der Gruppe, und der Funkel-Button am Ende der Beschriftung **Tabs** gruppiert deine Tabs mit KI. Ein Tab, der Ton abspielt, zeigt einen Lautsprecher: Klicke darauf, um den Tab stummzuschalten, und noch einmal, um ihn wieder zu hören. Ein stummgeschalteter Tab behält seinen Lautsprecher. **Neuer Tab** am Ende öffnet deine Startseite. Schließt du den letzten Tab, bleibt ein leerer.
- **Später lesen**, unter den Tabs: die Seiten, die du zurückgelegt hast (siehe [Später lesen](/guide/web#read-later)), die neuesten zuerst, jeweils mit Symbol und Titel und der Anzahl der wartenden. Solange nichts wartet, ist die Rubrik eingeklappt; ihr Pfeil öffnet sie. Ein Klick auf eine Zeile öffnet die Seite in einem neuen Tab. Zeige auf eine Zeile für **Als gelesen markieren** (sie verschwindet aus der Liste) und **Entfernen**. **Gelesene anzeigen** am Ende holt die gelesenen Seiten zurück (**Gelesene ausblenden** räumt sie wieder weg).

### Tab-Gruppen und das Tab-Menü

Rechtsklicke einen Tab (oder drücke das **⋯** auf einer Zeile, auf die du zeigst, oder die Menütaste auf einer fokussierten Zeile) für sein Menü:

- **Tab schließen**, **Andere Tabs schließen** und **Tabs darunter schließen** (die Tabs unter ihm in der Spalte, so wie sie aufgelistet sind). Dein Browser behält immer einen Tab offen.
- **Duplizieren** öffnet dieselbe Adresse in einem neuen Tab daneben, in derselben Gruppe, und zeigt ihn (die Kopie eines privaten Tabs ist privat). **Neu laden** lädt genau diesen Tab neu, nicht nur den geöffneten.
- **Adresse kopieren**, **Als Markdown-Link kopieren**, das einen Link zur Seite in Markdown mit ihrem Titel als Text für ein Dokument oder eine Nachricht kopiert (ein Hinweis sagt „Markdown-Link kopiert“), und **Lesezeichen** (**Lesezeichen entfernen**, wenn die Seite eins hat), das die Seite in die Lesezeichenleiste legt.
- **Zu Gruppe hinzufügen**, das deine Gruppen auflistet (die Gruppe des Tabs ist abgehakt) und **Neue Gruppe …**, das aus dem Tab eine Gruppe macht und ihren Namen zum Eintippen öffnet; und **Aus Gruppe entfernen**. Das Menü eines privaten Tabs hat beides nicht: Private Tabs lassen sich nicht gruppieren.

Eine Gruppe hält Tabs zusammen, die zusammengehören. Sie hat einen Namen, eine von sieben Farben (Grau, Blau, Grün, Bernstein, Orange, Rot oder Lila) und ist offen oder eingeklappt. In der Spalte ist sie ein Kopf mit ihrer Farbe, ihrem Namen („Unbenannte Gruppe“, bis du einen vergibst) und der Zahl ihrer Tabs; ihre Tabs stehen darunter, mit einer Linie in ihrer Farbe an der Seite, und die Tabs ohne Gruppe kommen nach den Gruppen. Ein Klick auf den Kopf klappt die Gruppe ein oder wieder auf; eine eingeklappte Gruppe verbirgt ihre Tabs, außer dem, den du geöffnet hast. Doppelklicke den Namen (oder drücke F2), um ihn umzubenennen. Du kannst einen Tab auf eine Gruppe ziehen, um ihn hineinzulegen, und auf die Tabs ohne Gruppe, um ihn herauszunehmen. Rechtsklicke den Kopf oder drücke sein **⋯** für das Menü der Gruppe:

- **Umbenennen** und **Farbe**.
- **Neuer Tab in der Gruppe** öffnet deine Startseite in einem neuen Tab darin.
- **Gruppierung aufheben** löst die Gruppe auf und lässt ihre Tabs, wo sie sind.
- **Gruppe schließen** schließt die Gruppe und alle ihre Tabs.

Eine Gruppe ohne Tab ist weg. Gruppen werden mit deinen Tabs gespeichert und kommen mit ihnen wieder, wenn der Browser erneut geöffnet wird. Auf einem Handy sind die Tabs eine Liste in der Leiste, ohne Gruppen.

### Meine Tabs mit KI gruppieren

Hast du viele Tabs offen, sortiert der Funkel-Button am Ende der Beschriftung **Tabs** (**Meine Tabs mit KI gruppieren**; er erscheint, wenn du auf die Beschriftung zeigst) die Tabs ohne Gruppe danach, wofür sie da sind. Es braucht mindestens drei davon; Tabs, die schon in einer Gruppe sind, bleiben, wo sie sind, und private Tabs bleiben außen vor: Sie werden nie gezählt, nie gruppiert und nie irgendwohin gesendet.

**Was gesendet wird, und an welches Modell.** Nur wenn du den Button drückst, gehen Titel und Adresse jedes dieser Tabs (bis zu 60) an das Hilfsmodell der App, das auch Sitzungstitel und Memory-Notizen schreibt ([Einstellungen → Agenten → Modelle → Hilfsmodell](/settings?s=models&find=Helper%20model)). Bei „Automatisch“ ist das Claude Haiku über Claude Code, sonst Codex, beide online; ein eigenes Modell auf diesem Computer behält sie hier. Eine Adresse geht ohne alles nach einem **?** oder **#**, die Adresse einer Datei nur als ihr Name. Text und Bilder der Seiten werden nie gesendet, und zu keiner anderen Zeit wird etwas gesendet. Ist ein Titel privat, drücke ihn nicht (oder nimm ein Modell auf diesem Computer als Hilfsmodell).

Das Modell antwortet mit Gruppen von Tabs, jede mit einem kurzen Namen und einer Farbe, und die App legt sie sofort an. Eine Meldung sagt, wie viele Gruppen sie gemacht hat, mit **Rückgängig machen**, das die Gruppen wieder so herstellt, wie sie waren. Passen keine Tabs zusammen, sagt sie das und ändert nichts. Agenten sehen deine Tabs nie, und die App lässt sie das nicht benutzen.

### Die Spalte neben der Seite

Rechts neben der Seite gibt es eine Spalte, die nur erscheint, wenn etwas darin ist, und zwar jeweils eines davon: **Fragen** zur Seite oder einen Agenten etwas darin erledigen lassen (siehe [Neben der Seite fragen](/guide/web#ask-beside-the-page)); die Unterhaltung eines Agenten, während du seinem Tab zusiehst (siehe [Agenten bei der Arbeit](/guide/web#agents-at-work)); oder das Panel für **Verlauf**, **Downloads**, **Lesezeichen**, **Später lesen**, **Lesezeichen und Verlauf importieren**, **Höhepunkte**, **Erweiterungen**, **Website-Berechtigungen**, **Einstellungen**, **Tastenkombinationen** oder die Statistik des **Werbeblockers**. Jedes hat ein **×** zum Schließen, und ein anderes zu wählen ersetzt es. Nichts wird über die Seite gelegt: Sie wird schmaler, um Platz zu machen, und wieder breiter, wenn die Spalte sich schließt. Die Adressen [Verlauf](/browser?panel=history), [Downloads](/browser?panel=downloads), [Lesezeichen](/browser?panel=bookmarks), [Später lesen](/browser?panel=later), [Lesezeichen und Verlauf importieren](/browser?panel=import), [Höhepunkte](/browser?panel=highlights), [Erweiterungen](/browser?panel=extensions), [Website-Berechtigungen](/browser?panel=permissions), [Einstellungen](/browser?panel=settings), [Tastenkombinationen](/browser?panel=shortcuts) und [Werbeblocker](/browser?panel=adblock) öffnen die Browser-Seite mit diesem Panel.

Zieh am linken Rand der Spalte, um sie breiter oder schmaler zu machen (oder fokussiere den Rand und drücke **←** oder **→**); ein Doppelklick stellt ihre übliche Breite von 400 px wieder her. Es ist eine Breite für alles, was die Spalte zeigt, sie bleibt auf diesem Gerät erhalten, ist nie schmaler als 340 px und lässt der Seite immer mindestens 360 px. In einem schmalen Fenster sind die Tabs eine Liste in der Leiste, und die Spalte ist ein Blatt über der Seite mit eigener Breite.

### Neben der Seite fragen

**Fragen** in der Leiste (oder **Zu dieser Seite fragen: „…“** in der Liste des Felds oder **Agenten zu „…“ fragen** im Rechtsklickmenü) öffnet die Spalte für den Tab, auf dem du bist. Oben steht ein Schalter, **Fragen** oder **Erledigen**; was du wählst, bleibt auf diesem Gerät erhalten.

Mit **Fragen** schreibst du, was du wissen möchtest, oder drückst **Zusammenfassen**, **Wichtige Punkte** oder **Einfach erklären**, dann **Fragen** (**Strg+Enter**, ⌘+Enter auf dem Mac). Die Zeile unter dem Feld sagt, welcher Agent und welches Modell antworten: die, die die Startseite zuletzt verwendet hat. Eine neue Sitzung startet mit einer Kopie der Seite, wie sie jetzt ist (siehe [Zu dieser Seite fragen](/guide/web#ask-about-this-page)), und ihre Unterhaltung füllt die Spalte, sodass du dort weiterfragen kannst. Ihr Hinweis endet mit „Wähle Erledigen, damit ein Agent in der Seite arbeitet.“

Mit **Erledigen** schreibst du, was ein Agent auf dieser Seite tun soll („Füll das Formular mit meinen Angaben aus“), und drückst **Erledigen lassen** (**Strg+Enter**, ⌘+Enter auf dem Mac). Die Agentenzeile unter dem Feld ist eine Schaltfläche, die **Claude Code** oder **Custom** wählt (nur diese beiden lassen sich auf einen Tab beschränken; der, den die Startseite zuletzt hatte, zuerst Claude Code, oder Custom, wenn du nicht bei Claude Code angemeldet bist, das dann **Nicht eingerichtet** zeigt), mit dem Modell, das die Startseite dafür zuletzt hatte. Der Hinweis sagt, was der Agent bekommt: einen eigenen Tab, mit deinen Anmeldungen auf dieser Website und nur den Browser, und er fragt nach, bevor er etwas sendet, veröffentlicht, löscht oder bezahlt (siehe [Auf der Seite erledigen lassen](/guide/web#do-it-on-the-page)). Sobald er startet, erscheint der Tab des Agenten anstelle der Seite, und seine Unterhaltung füllt die Spalte, wie bei [Agenten bei der Arbeit](/guide/web#agents-at-work).

In beiden gehen Wörter, die du auf der Seite markiert und mit **Agenten zu „…“ fragen** geschickt hast und die über dem Feld erscheinen, mit deiner Anfrage mit (bis zu 4.000 Zeichen davon); ebenso ein Bild, das du mit **Zu diesem Bild fragen** geschickt hast (siehe [Rechtsklickmenü](/guide/web#right-click-menu)), das ebenfalls über dem Feld erscheint, bei „Fragen“ mit Schnellfragen wie **Beschreibe dieses Bild**.

Jeder Tab hat seine eigene Unterhaltung: Wechselst du den Tab, zeigt die Spalte die Unterhaltung dieses Tabs. **Als Sitzung öffnen** bringt dich zu ihr unter deinen Sitzungen. **Neue Frage** (**Neue Anfrage** nach einem „Erledigen“) vergisst die Unterhaltung dieses Tabs hier (die Sitzung bleibt), damit du neu fragen kannst. Gehst du nach „Erledigen“ zurück zu deinen Tabs, zeigt „Fragen“ für diesen Tab die Unterhaltung mit **Sieh bei der Arbeit zu**, das den Tab des Agenten wieder anstelle der Seite zeigt. Es funktioniert bei Webseiten („Fragen“ auch bei Dateien). Die Zeile der Adressleiste für die Seite folgt dem Schalter (siehe [Vorschläge](/guide/web#suggestions)).

### Tastenkürzel

Auf der Seite Browser, auch aus einer Seite heraus, mit Strg unter Windows und Linux und ⌘ auf dem Mac:

- **Strg+T** öffnet einen neuen Tab, und **Strg+W** schließt den geöffneten.
- **Strg+Umschalt+T** öffnet den zuletzt geschlossenen Tab wieder; drücke es noch einmal für den davor (private Tabs stehen nicht auf dieser Liste).
- **Strg+Umschalt+N** öffnet einen neuen privaten Tab (**⇧⌘N** auf dem Mac).
- **Strg+Tab** geht zum nächsten Tab und **Strg+Umschalt+Tab** zum vorigen. **Strg+1** bis **Strg+8** gehen zu diesem Tab und **Strg+9** zum letzten.
- **Strg+L** springt in die Adressleiste.
- **Strg+R** (auch **F5**) lädt neu.
- **Alt+←** und **Alt+→** gehen zurück und vor (auf dem Mac auch **⌘[** und **⌘]**).
- **Strg+F** öffnet die Suche auf der Seite, und **Esc** schließt sie.
- **Strg+D** setzt ein Lesezeichen für die Seite.
- **Strg+H** öffnet den Verlauf und **Strg+J** die Downloads.
- **Strg+B** klappt die Tab-Spalte weg und holt sie zurück. Zieh an ihrem Rand, um sie breiter oder schmaler zu machen: Sie hat die Breite, die alle Spalten der App teilen.
- **Strg+P** druckt die Seite.
- **Menü** (⋯) → **Tastenkombinationen** listet diese Tasten in der Spalte rechts von der Seite auf, nach Gruppen: Tabs, Seite, Adressleiste, deine Listen und Agenten ([Tastenkombinationen](/browser?panel=shortcuts)).
- **Strg+Umschalt+Entf** öffnet die Einstellungen bei **Browserdaten löschen**.
- **Strg** mit **+**, **−** und **0** vergrößert, verkleinert und setzt den Zoom zurück (siehe [Zoom, Drucken und Vollbild](/guide/web#zoom-print-and-full-screen)).

### Auf einer Seite suchen

**Strg+F** oder **Auf der Seite suchen** im Menü öffnet eine Leiste unter der Adressleiste. Tippe, und der erste Treffer wird gefunden und ins Bild gescrollt, sobald du pausierst. **Enter** springt zum nächsten Treffer und **Umschalt+Enter** zum vorigen (die Pfeile ebenso), und die Leiste sagt, bei welchem Treffer du bist („3 von 12“, „1000+“ ab tausend), oder „Keine Übereinstimmungen“. Groß- und Kleinschreibung spielt keine Rolle, außer du drückst **Groß- und Kleinschreibung beachten**, und die Suche beginnt am Ende von vorn. **Esc** oder **×** schließt die Leiste und löscht, was gefunden wurde.

### Zoom, Drucken und Vollbild

- **Zoom**: **Strg** mit **+** vergrößert und **−** verkleinert, in den Stufen, die Chrome verwendet (25 % bis 500 %). Auch Strg und das Mausrad zoomen, ebenso **−** und **+** in der Zeile **Zoom** im **Menü** (⋯), das dabei offen bleibt. **Strg+0**, der Prozentwert in dieser Zeile oder der Chip unten setzt den Zoom auf den **Seitenzoom** der [Browser-Einstellungen](/guide/web#browser-settings) zurück (zuerst 100 %). Eine Website, die du selbst zoomst, behält ihren Zoom, solange die App läuft. Ein Zoom, der vom Seitenzoom abweicht, erscheint als Chip am Ende der Adressleiste, etwa „125%“: Klicke darauf, um zurückzugehen (sein Titel lautet „Zurück auf 100 %“ oder dein Seitenzoom).
- **Drucken**: **Strg+P** oder **Drucken …** im Menü oder im Rechtsklickmenü öffnet den Druckdialog deines Computers für die Seite, mit ihren Hintergründen.
- **Vollbild**: Möchte ein Video oder eine Seite den Bildschirm füllen, geht das Fenster der App in den Vollbildmodus, und die Seite füllt es. Der eigene Ausweg der Seite (Esc) bringt das Fenster zurück.

### Screenshots und PDFs

**Menü** (⋯) → **Screenshot oder PDF** hat drei Einträge, die die Seite, auf der du bist, als Datei behalten, für eine Webseite oder eine Datei, die im Tab gezeigt wird:

- **Screenshot des sichtbaren Bereichs**: ein Bild des Teils der Seite, der im Tab zu sehen ist.
- **Screenshot der ganzen Seite**: ein Bild der Seite von oben bis unten, so weit sie auch scrollt (bis zu 16.384 Pixel hoch; lässt sich das nicht aufnehmen, bekommst du den sichtbaren Bereich).
- **Als PDF speichern …**: die Seite als PDF, mit ihren Hintergründen, als hättest du sie gedruckt.

Ein Screenshot ist eine PNG-Datei. Er wird in deinem Ordner Downloads gespeichert, benannt nach dem Titel der Seite mit Datum und Uhrzeit („Example 2026-11-18 at 14.30.05.png“), und auch in die Zwischenablage gelegt, sodass du ihn gleich in eine Nachricht oder ein Dokument einfügen kannst. Ein Hinweis sagt „Screenshot in Downloads gespeichert und kopiert“, mit **Im Ordner anzeigen**. Ein PDF wird in Downloads gespeichert, benannt nach dem Titel der Seite, mit dem Hinweis „Als PDF in Downloads gespeichert“ und **Im Ordner anzeigen**. Ist ein Name schon vergeben, bekommt er eine Nummer dahinter, und nichts wird überschrieben. Sie funktionieren auch in einem privaten Tab.

### Rechtsklickmenü

Ein Rechtsklick auf einer Seite öffnet ein Menü mit dem, was dort passt, wo du geklickt hast, im eigenen Aussehen und in der Sprache der App wie ihre anderen Menüs (**Esc** oder ein Klick außerhalb schließt es):

- In einem Textfeld: Rechtschreibvorschläge für ein falsch geschriebenes Wort, mit **Zum Wörterbuch hinzufügen**; dann **Rückgängig machen**, **Wiederholen**, **Ausschneiden**, **Kopieren**, **Einfügen** und **Alles auswählen**.
- Bei einem Link: **Link in neuem Tab öffnen**, **Link in privatem Tab öffnen** (siehe [Private Tabs](/guide/web#private-tabs)), **Link in deinem Standardbrowser öffnen**, **Linkadresse kopieren** und **Link später lesen** (siehe [Später lesen](/guide/web#read-later)).
- Bei einem Bild: **Bild in neuem Tab öffnen**, **Bild speichern unter …** (in deinen Downloads-Ordner), **Bild in** *dem Projekt, das Speichern verwendet,* **speichern** (nur **Bild speichern**, solange kein Projekt gewählt ist), **Zu diesem Bild fragen**, **Bild kopieren** und **Bildadresse kopieren**.
- Bei einem Video: **Abspielen** oder **Pausieren**, **Stumm** oder **Stummschaltung aufheben**, **Schleife** und **Steuerelemente anzeigen** (abgehakt, solange sie an sind), **Bild im Bild** (abgehakt, solange es gezeigt wird), **Video in neuem Tab öffnen**, **Video speichern unter …** (in deinen Downloads-Ordner) und **Videoadresse kopieren**. Bei einem Ton gibt es dasselbe als **Audio in neuem Tab öffnen**, **Audio speichern unter …** und **Audioadresse kopieren**, ohne Bild im Bild. Ein Eintrag erscheint nur, wenn dieses Video oder dieser Ton es kann.
- Bei markiertem Text: **Kopieren**, **Mit … nach „…“ suchen**, das mit deiner Suchmaschine danach sucht (es öffnet sich in einem neuen Tab), und **Agenten zu „…“ fragen**, das **Fragen** neben der Seite mit den markierten Wörtern (bis zu 4.000 Zeichen davon) und der Adresse der Seite öffnet, bereit für deine Frage (siehe [Neben der Seite fragen](/guide/web#ask-beside-the-page)), **„…“ übersetzen**, das die Wörter in deine Sprache übersetzt in einem Feld zeigt (siehe [Eine Seite übersetzen](/guide/web#translate-a-page)), und **Markieren**, das die Wörter auf der Seite markiert und speichert (siehe [Markierungen](/guide/web#highlights)).
- Auf einer Markierung von dir: **Markierung entfernen**.
- Auf der Seite selbst, abseits von Feld oder markiertem Text: **Zurück**, **Vorwärts** und **Neu laden** sowie **Übersetzen nach Deutsch** (die Sprache, in die du übersetzt; **Original anzeigen**, solange die Seite übersetzt ist).
- Immer: **Lesezeichen für diese Seite setzen**, **Diese Seite später lesen** (auf einer Webseite), **Drucken …** und **Untersuchen**, das die Entwicklerwerkzeuge der Seite öffnet.

In einem privaten Tab hat das Menü kein **Link in privatem Tab öffnen**, **Link in neuem Tab öffnen** und die anderen „in neuem Tab“-Einträge öffnen einen privaten Tab, und keiner der **Fragen**-Einträge (**Agenten zu „…“ fragen**, **Zu diesem Bild fragen**) ist da, weil Agenten nie einen privaten Tab bekommen.

**Bild in** *einem Projekt* **speichern** liest das Bild mit den Anmeldungen des Tabs selbst, sodass auch ein Bild hinter einem Login funktioniert, und behält es in dem Projekt (und Ordner), das neben **Speichern** gewählt ist (in seinen **Dateien**, mit der Seite als dem Ort, von dem es kam), oder ohne Projekt. Ein Hinweis sagt „In den Dateien von Abschlussarbeit gespeichert“ (oder „Bild gespeichert“), mit **Öffnen** (oder „Dieses Bild ist bereits gespeichert“, wenn du es früher behalten hast). Behalten werden PNG-, JPEG-, WebP-, GIF- und AVIF-Bilder bis 50 MB; eine Bitmap oder ein Symbol wird zu einem PNG, andere Arten wie SVG werden abgelehnt. Das Bild braucht eine http-, https-, data- oder blob-Adresse. Agenten können lesen, was ein Projekt behält; behalte ein Bild dort also nur, wenn das für dich in Ordnung ist. **Zu diesem Bild fragen** liest das Bild auf dieselbe Weise und öffnet **Fragen** neben der Seite mit dem Bild, bereit für deine Frage, zusammen mit einer Kopie der Seite.

Die eigenen Einträge einer Erweiterung werden nie gezeigt (siehe [Was möglicherweise nicht funktioniert](/guide/web#what-may-not-work)).

### Private Tabs

Ein privater Tab ist ein Tab, der vergisst. Öffne einen mit **Strg+Umschalt+N** (**⇧⌘N** auf dem Mac), **Menü** (⋯) → **Neuer privater Tab**, **Neuer privater Tab** am Ende des Bereichs **Privat** in der Tab-Spalte oder [/browser?private=1](/browser?private=1) (hänge `&url=https://example.com` an, um diese Adresse darin zu öffnen). Bei einem Link: Rechtsklick → **Link in privatem Tab öffnen**; in einem privaten Tab selbst gibt es diesen Eintrag nicht, und **Link in neuem Tab öffnen** öffnet einen privaten Tab (ebenso die anderen „in neuem Tab“-Einträge, die Suche nach markierten Wörtern und **Alt+Enter** in der Adressleiste).

So sieht ein privater Tab aus:

- Seine Zeile steht im violetten Bereich **Privat** der Tab-Spalte, der sagt, wie viele es sind. **Private Tabs schließen** (das × am Ende der Beschriftung) schließt sie alle.
- Am Anfang der Adressleiste steht ein violetter Chip **Privat**. Drücke ihn, um zu sehen, was ein privater Tab ist und behält, mit **Private Tabs schließen**.

Was ein privater Tab getrennt hält und vergisst:

- **Anmeldungen, Cookies, Websitedaten und zwischengespeicherte Dateien** liegen im Arbeitsspeicher, getrennt von deinen anderen Tabs: Eine Website, bei der du in einem normalen Tab angemeldet bist, kennt dich in einem privaten nicht, und umgekehrt. Alles wird vergessen, wenn der letzte private Tab sich schließt oder die App beendet wird.
- **Seine Seiten werden nicht behalten**: nicht in deinem [Verlauf](/guide/web#history), nicht in der Liste **Zuletzt geschlossen** (**Strg+Umschalt+T** überspringt sie) und nicht unter den Tabs, die beim nächsten Start des Browsers wieder aufgehen. Tabs, die du schließt, sind für immer weg.
- **Erweiterungen laufen darin nicht.** Der Werbeblocker und das Ausblenden von Cookie-Bannern funktionieren wie in jedem Tab.
- **Berechtigungen**, die eine Website anfragt (Kamera, Standort und Ähnliches), werden jedes Mal neu erfragt, und deine Antwort wird vergessen, wenn der Tab sich schließt. Eine Website, die du in deinen normalen Tabs blockiert hast, bleibt blockiert.
- **Downloads werden gespeichert**, und zwar in deinem Ordner Downloads, aber sie kommen nicht in die Liste der Downloads, die die Suche (Strg+K) findet.
- Was du ausdrücklich verlangst, wird trotzdem behalten: **Lesezeichen**, **Später lesen**, **Markierungen** und **Speichern** (in ein Projekt). Sie bleiben, wenn der private Tab weg ist, und zeigen die Seite; verlange sie also nur, wenn das für dich in Ordnung ist.
- **Übersetzen** funktioniert in einem privaten Tab wie in jedem Tab, die Wörter der Seite gehen also an das Hilfsmodell (siehe [Eine Seite übersetzen](/guide/web#translate-a-page)); lass eine private Seite unübersetzt, wenn dir das wichtig ist.
- Ein privater Tab lässt sich nicht in eine Gruppe legen, und **Meine Tabs mit KI gruppieren** zählt ihn nie und sendet ihn nie.
- **Agenten bekommen nie einen privaten Tab.** **Fragen** ist ausgegraut, die Zeile **Zu dieser Seite fragen** (oder **Auf dieser Seite erledigen lassen**) der Adressleiste und die Einträge **Agenten zu „…“ fragen** und **Zu diesem Bild fragen** des Rechtsklickmenüs sind nicht da, und der Server weigert sich, die Seite eines privaten Tabs für einen Agenten zu kopieren (siehe [Eine Seite an einen Agenten übergeben](/guide/web#hand-a-page-to-an-agent)).

Schließt du den letzten normalen Tab, während private Tabs offen sind, bleiben nur die privaten; sonst behält dein Browser immer einen Tab offen. Private Tabs betreffen nur die Aufzeichnung dieses Computers: Die Websites, die du besuchst, dein Internetanbieter und dein Netzwerk können weiterhin sehen, wohin du gehst, und eine Website, bei der du dich anmeldest, weiß, wer du bist.

### Eine Seite übersetzen

Ist eine Seite in einer anderen Sprache als der, die du liest, erscheint rechts in der Adressleiste eine Übersetzen-Schaltfläche (ein kleines Symbol **Sprachen**). Sie leuchtet, solange die Seite übersetzt ist, und pulsiert, solange die Übersetzung unterwegs ist. Drücke sie:

- Sie nennt die Sprache, in der die Seite gefunden wurde („Erkannt: Deutsch“), die die App auf diesem Computer aus den Wörtern der Seite und ihrem eigenen Sprach-Tag ermittelt.
- **Übersetzen in** ist die Zielsprache. Zuerst ist es die Sprache der App; wählst du eine andere, bleibt sie deine Wahl (es ist auch **Übersetzen in** in den [Browser-Einstellungen](/guide/web#browser-settings)), und eine Seite, die schon übersetzt ist, wird noch einmal in diese Sprache übersetzt.
- **Übersetzen** startet. Während es arbeitet, sagt die Zeile darunter „Wird übersetzt … 12 von 40 Teilen“, und die Schaltfläche wird zu **Original anzeigen**, das jedes Wort der Seite so zurückholt, wie es war. Ist es fertig, sagt die Zeile, aus welcher Sprache und mit welchem Modell übersetzt wurde. Konnte es nicht, nennt die Zeile den Grund, und die Schaltfläche heißt **Erneut versuchen**.
- **Deutsch immer übersetzen** (mit der gefundenen Sprache) übersetzt Seiten in dieser Sprache von da an, sobald sie laden. **Deutsch nie übersetzen** unterbindet die Schaltfläche für sie. **example.com nie übersetzen** (die Website der Seite) tut dasselbe für diese Website, in welcher Sprache auch immer.
- **Übersetzungseinstellungen** öffnet die [Browser-Einstellungen](/guide/web#browser-settings) bei **Übersetzung**.

Zuerst wird übersetzt, was auf dem Bildschirm steht, dann der Rest der Seite und dann alles, was später kommt, wenn du scrollst oder die Seite sich selbst ändert, sodass sie in deiner Sprache bleibt. Layout, Links und Bilder der Seite bleiben, wie sie sind: Nur ihre Wörter ändern sich, an Ort und Stelle. Textfelder, Code und Teile, die eine Website als nicht zu übersetzen kennzeichnet, bleiben unberührt. Eine sehr lange Seite wird bis etwa 150.000 Zeichen über das hinaus übersetzt, was auf dem Bildschirm steht.

Du kannst auch **Menü** (⋯) → **Seite übersetzen …** nehmen (**Original anzeigen**, solange sie übersetzt ist), das dasselbe Feld unter dem Menü öffnet, wenn die Schaltfläche nicht angezeigt wird, etwa bei einer Seite, die schon in deiner Sprache ist. Rechtsklicke die Seite abseits von Link, Bild oder markierten Wörtern und wähle **Übersetzen nach Deutsch** (die Sprache, in die du übersetzt) oder, solange sie übersetzt ist, **Original anzeigen**. Markiere ein paar Wörter, rechtsklicke und wähle **„…“ übersetzen**, um nur diese zu übersetzen (bis zu 5.000 Zeichen): Ein Feld **Übersetzung** zeigt sie mit ihrer Übersetzung, dazu eine Auswahl **Übersetzen in**, um eine andere Sprache zu probieren, und **Kopieren**.

Die Sprachnamen in der Schaltfläche und in den Listen stehen in der Sprache der App, mit dem eigenen Namen jeder Sprache daneben.

**Was gesendet wird, und an welches Modell.** Beim Übersetzen werden die Wörter der Seite in Stücken an das Hilfsmodell der App gesendet, das auch Sitzungstitel und Memory-Notizen schreibt ([Einstellungen → Agenten → Modelle → Hilfsmodell](/settings?s=models&find=Helper%20model)); Wörter, die du zum Übersetzen markierst, gehen ebenfalls dorthin. Bei „Automatisch“ ist das Claude Haiku über Claude Code, sonst Codex, beide online; ein eigenes Modell auf diesem Computer behält die Wörter hier. Bilder und Anmeldungen werden nie gesendet. Es geschieht, wenn du **Übersetzen** oder die Menüeinträge drückst und, bei einer Sprache, die du auf **Immer übersetzen** gesetzt hast, von selbst, sobald jede Seite lädt: Enthält eine Seite Wörter, die du privat halten willst, übersetze sie nicht (oder nimm ein Modell auf diesem Computer als Hilfsmodell). Agenten sehen nichts davon, und ihre Routen sind ihnen verwehrt.

Eine übersetzte Seite wird auch in der [Leseansicht](/guide/web#reader-view) übersetzt gezeigt.

### Leseansicht

Auf einer Seite mit einem Artikel, etwa einer Nachricht, einem Blogbeitrag oder einem Rezept, erscheint rechts in der Adressleiste eine Buch-Schaltfläche (**Leseansicht**). Drücke sie, und der Artikel erscheint allein über der Seite, in einer aufgeräumten Spalte: die Website, der Titel, der Autor, wie lange das Lesen dauert („5 Minuten“) und das Datum, dann der Text mit seinen Bildern, ohne Menüs, Werbung und Kommentare der Website. Drücke die Schaltfläche noch einmal (**Leseansicht verlassen**), um zur Seite zurückzugehen, oder wähle **Menü** (⋯) → **Leseansicht**, das abgehakt ist, solange sie an ist. Ein Link darin verlässt sie, wie jede andere Seite es tut. Eine Seite ohne Artikel hat keine Schaltfläche (und der Menüeintrag ist ausgegraut; zeigt sich, dass eine Seite keinen hat, sagt ein Hinweis „Diese Seite hat keinen Artikel für die Leseansicht“).

Solange die Leseansicht an ist, öffnet **Aa** (**Stil der Leseansicht**), wie der Artikel aussieht:

- **Textgröße**, mit **Kleinerer Text** und **Größerer Text**: von 14 bis 28 (zuerst 19).
- **Farben**: **Automatisch** (folgt dem hellen oder dunklen Aussehen der App), **Dunkel**, **Hell** oder **Sepia**.
- **Schriftart**: **Serife** oder **Serifenlos**.

Eine Änderung zeigt sich sofort und gilt für jeden Artikel. Die Pfeiltasten, **Bild ab** und die **Leertaste** scrollen den Artikel. Dafür verlässt nichts den Tab: Die Seite wird dort gelesen, wo sie ist, und kein Agent und kein Modell ist beteiligt.

### Dunkle Seiten

**Menü** (⋯) → **Dunkle Seiten** (abgehakt, solange es an ist) oder **Dunkle Seiten** in den [Browser-Einstellungen](/guide/web#browser-settings) zeigt Webseiten dunkel. Eine Website, die ein eigenes dunkles Design hat, nutzt es, wie sie es tut, wenn dein Computer auf dunkel steht; eine Seite ohne eines wird vom automatischen Dunkelmodus des Browsers abgedunkelt, sodass ihre hellen Hintergründe dunkel und ihr Text hell werden. Es ist zuerst aus, gilt für alle Tabs auf einmal und lässt die Browser der Agenten in Ruhe.

Manche Seiten sehen abgedunkelt seltsam aus (Bilder, Diagramme, Farben, die etwas bedeuteten). Um eine Website so zu zeigen, wie sie ist, klicke auf ihr Schloss und schalte **Dunkle Seiten auf dieser Website** aus (der Schalter ist da, solange Dunkle Seiten an ist). Solche Websites stehen in den Einstellungen des Browsers unter **Websites, die unverändert gezeigt werden**, wo das × neben einer sie wieder dunkel zeigt.

### Später lesen

Lege eine Seite für später zurück: Öffne **Menü** (⋯) → **Später lesen** und drücke oben im Bereich auf **Diese Seite hinzufügen**, oder klicke mit der rechten Maustaste auf die Seite und wähle **Diese Seite später lesen**, oder auf einen Link und wähle **Link später lesen**. Ein Hinweis sagt „Zu „Später lesen“ hinzugefügt“; eine Seite, die schon auf der Liste steht, wartet wieder, ganz oben. Solange die Seite, auf der du bist, auf der Liste wartet, steht auf der Schaltfläche im Bereich **Auf deiner Liste**. Nur Webseiten (http und https) lassen sich zurücklegen.

Die Liste erscheint an zwei Stellen: in der Tab-Spalte als **Später lesen** (siehe [Die Tab-Spalte](/guide/web#the-tab-column)) und in einem eigenen Bereich in der Spalte neben der Seite: **Menü** (⋯) → **Später lesen** (das Menü sagt, wie viele Seiten warten), oder gehe zu [Später lesen](/browser?panel=later). Unter seinem Titel hat der Bereich ein Feld, **Liste „Später lesen“ durchsuchen**, das die Liste auf die Seiten eingrenzt, in deren Titel oder Adresse deine Wörter vorkommen. Die neuesten stehen zuerst, jede Zeile hat das Symbol der Website, den Titel der Seite und darunter die Website und wann du sie hinzugefügt („Hinzugefügt heute“) oder als gelesen markiert hast. Ein Klick auf eine Zeile oder **Öffnen** öffnet die Seite in einem neuen Tab. **Als gelesen markieren** nimmt sie von der Liste; **Gelesene anzeigen** (erscheint, sobald du eine gelesen hast) holt die gelesenen Seiten zurück, und mit **Als ungelesen markieren** wartet eine wieder; **Gelesene ausblenden** räumt sie wieder weg. **Entfernen** vergisst sie. Ist nichts zurückgelegt, sagt der Bereich „Nichts zum späteren Lesen zurückgelegt“.

Wie deine Lesezeichen gehört die Liste nur dir: Agenten sehen sie nie, und die Wege, die sie ausliefern, sind ihnen verwehrt.

### Verlauf

Drücke **Strg+H** oder **Menü** (⋯) → **Verlauf** oder gehe zu [Verlauf](/browser?panel=history). Der Bereich listet die Seiten auf, die du in deinem eigenen Browser besucht hast, die neuesten zuerst, nach Tag („Heute“, „Gestern“, dann das Datum), jede mit Uhrzeit, Website-Symbol, Titel und Adresse.

- Das Suchfeld **Verlauf durchsuchen** findet Seiten anhand der Wörter in ihren Titeln und Adressen.
- Klicke auf eine Seite, um sie im geöffneten Tab zu öffnen, oder Strg+Klick (⌘+Klick auf dem Mac) für einen neuen Tab. **×** neben einer nimmt sie aus dem Verlauf. **Ältere anzeigen** lädt mehr.
- **Zuletzt geschlossen** (wenn du nicht suchst) listet Tabs auf, die du kürzlich geschlossen hast: Klicke auf einen, um ihn wieder zu öffnen. **Strg+Umschalt+T** öffnet den neuesten.
- **Browserdaten löschen …** öffnet die Einstellungen an dieser Stelle.

Dein Verlauf bleibt auf diesem Computer, in der eigenen Datenbank der App, und nur dein eigenes Surfen trägt zu ihm bei: Webseiten und Dateien, die Seite, auf der jeder Tab landet, und sein Titel, sobald er feststeht. Seiten in [privaten Tabs](/guide/web#private-tabs) kommen nie hinzu, und ein privater Tab, den du schließt, steht nicht unter **Zuletzt geschlossen**. Die letzten 20.000 Seiten bleiben erhalten; die ältesten gehen zuerst. Agenten sehen ihn nie. Auf ihn stützen sich die [Vorschläge](/guide/web#suggestions) der Adressleiste.

Um den Verlauf deiner anderen Browser zu importieren, nutze **Importieren** am Ende des Bereichs (es erscheint, wenn du nicht suchst), so wie im Bereich Lesezeichen. Es listet die Browser auf diesem Computer auf, die einen Verlauf haben, dieselben wie bei den [Lesezeichen](/guide/web#bring-in-bookmarks), bei mehreren Profilen eines Browsers je eine Zeile, jeweils mit der Anzahl der Seiten, die hinzukämen („Seiten: 8.931“). Drücke **Importieren**, und seine letzten 20.000 Seiten kommen herein: Jede behält ihren Titel, wann du sie zuletzt besucht hast, wie oft und wie oft du ihre Adresse getippt hast, sodass die [Vorschläge](/guide/web#suggestions) der Adressleiste sie so einordnen, wie dieser Browser es tat. Seiten, die du schon hast, behalten den späteren Besuch und die größeren Zahlen, ein erneuter Import fügt also nichts doppelt hinzu. Dein Verlauf behält weiterhin nur die letzten 20.000 Seiten, die ältesten gehen zuerst, und alles bleibt auf diesem Computer: Agenten sehen ihn nie. Eine Meldung sagt „8.931 Seiten importiert“, wenn es fertig ist (oder „Dein Verlauf enthält schon alles davon“), und der Bereich sagt „Auf diesem Computer wurde kein anderer Browser mit Verlauf gefunden.“, wenn es nichts zu importieren gibt.

Ein Browser, der seinen Verlauf sperrt, solange er geöffnet ist, sagt „Schließe Google Chrome und versuche es erneut: Der Browser sperrt seinen Verlauf, solange er geöffnet ist.“; schließe ihn und drücke erneut **Importieren**. Firefox kann geöffnet bleiben. Safari bewahrt seinen Verlauf dort auf, wo macOS ihn schützt, wie seine Lesezeichen: Solange du es nicht erlaubst, sagt seine Zeile „Hydor may not read Safari’s history: allow it in System Settings → Privacy & Security → Full Disk Access“. Seine Zeile zeigt **Systemeinstellungen öffnen** statt **Importieren**: Das öffnet Systemeinstellungen → Datenschutz & Sicherheit → Festplattenvollzugriff, wo du Hydor einschaltest (füge es mit **+** hinzu, falls es nicht aufgelistet ist). Wenn du zu Hydor zurückkommst, prüft es erneut, und die Zahl bei Safari und **Importieren** erscheinen. Kann es Safari weiterhin nicht lesen, ergänzt die Zeile „Erlaubt? macOS verlangt eventuell zuerst einen Neustart von Hydor: Beende Hydor und öffne es erneut.“

Die Dateien, die dein Browser herunterlädt, werden ebenfalls in einer Liste gespeichert: jeweils Name, Speicherort und die Adresse, von der sie kam, die letzten 5.000. **Browserdaten löschen** mit angehaktem **Browserverlauf** leert auch diese Liste, für denselben Zeitraum (die Dateien bleiben dort, wo sie gespeichert wurden), und eine Seite, ein Lesezeichen oder ein Download, der verschwindet, nimmt seinen Platz in der Bedeutungssuche mit. Die Suche (Strg+K) findet deinen Verlauf, deine Lesezeichen und Downloads über ihre Wörter und über das, worum es in ihnen geht, unter **Browser** in **Suchen in** (siehe [Alles mit Strg+K durchsuchen](/guide/start#search-everything-with-ctrlk)). Agenten sehen nichts davon.

### Markierungen

Markiere Wörter auf einer Seite, und sie bleiben markiert. Wähle ein paar Wörter aus, klicke mit der rechten Maustaste und wähle **Markieren**: Sie werden sofort in einem sanften Gelb markiert, das auch auf dunklen Seiten gut lesbar ist, und gespeichert. Jedes Mal, wenn du die Seite wieder öffnest, werden die Wörter gefunden und markiert, und einen Moment später noch einmal, falls die Seite ihren Inhalt erst nach dem Laden aufbaut. Klicke mit der rechten Maustaste in eine Markierung und wähle **Markierung entfernen**, um sie zu entfernen. Die Wörter der Seite selbst werden nicht verändert, nur umhüllt; beim Kopieren von Text aus einer Seite bekommst du also dieselben Wörter.

- Eine Seite ist dieselbe Seite, was auch immer ihrer Adresse folgt: Ein `#fragment` oder Tracking-Parameter (`utm_…`, `fbclid` und Ähnliches) spielen keine Rolle, und `http`, `https` und `www.` zählen als eins. Jede Markierung behält ihre Wörter, ein wenig Text davor und danach (um die richtige Stelle zu finden, wenn dieselben Wörter zweimal vorkommen), den Titel der Seite, wann du sie gemacht hast und, wenn du eine hinzufügst, eine Notiz.
- Eine Seite mit Markierungen zeigt ein kleines gelbes Zeichen auf **Menü** (⋯), und **Menü** (⋯) → **Markierungen** sagt, wie viele es sind. Es öffnet die Spalte neben der Seite mit den Markierungen dieser Seite, oder gehe zu [Markierungen](/browser?panel=highlights). **Auf der Seite zeigen** scrollt zu einer, **Kopieren** kopiert ihre Wörter, **Notiz hinzufügen** (oder **Notiz bearbeiten**) schreibt eine Notiz, die erscheint, wenn du auf der Seite mit dem Zeiger auf die Markierung zeigst, und **Löschen** entfernt sie. **Einen Agenten dazu fragen** startet eine Sitzung mit der Adresse der Seite und ihren Markierungen als Zitat, samt deinen Notizen.
- Wörter, die nicht mehr gefunden werden (die Seite hat sich geändert), bleiben in der Liste und sind nur nicht markiert. Eine Markierung fasst bis zu 5.000 Zeichen, eine Seite bis zu 500 Markierungen. Wörter in einem Textfeld und die verborgenen Teile einer Seite werden nicht markiert. Ebenso wenig Wörter in einem Frame innerhalb der Seite (eine andere Seite, die darin angezeigt wird): Dort hat das Menü kein **Markieren**. Wörter in den eigenen Komponenten einer Seite werden wie alle anderen markiert.

Deine Markierungen bleiben auf diesem Computer, in der eigenen Datenbank der App, und Agenten sehen sie nie: Die Routen dafür weisen Agenten ab. Sie erreichen einen Agenten nur, wenn du **Einen Agenten dazu fragen** drückst, und dann gehen nur die Adresse dieser Seite und ihre Markierungen hinaus.

### Browser-Einstellungen

**Menü** (⋯) → **Einstellungen** oder [Einstellungen → Browser → Dein eigenes Surfen → Browser-Einstellungen](/settings?s=browser&find=Browser%20settings) oder [Browser-Einstellungen](/browser?panel=settings) öffnet einen Bereich mit:

- **Startseite**: die Webadresse, die die Schaltfläche Startseite und neue Tabs öffnen (zuerst https://www.google.com/). **Aktuelle Seite verwenden** setzt sie auf die Seite, auf der du bist.
- **Suchmaschine**: womit die Adressleiste sucht: Google (zuerst), DuckDuckGo, Bing, Brave, Ecosia, Startpage oder **Custom**, eine eigene Adresse mit %s an der Stelle deiner Suchwörter, etwa `https://example.com/search?q=%s`.
- **Suchkürzel**: Tippe in die Adressleiste ein Kürzel, ein Leerzeichen und deine Wörter, um diese Website zu durchsuchen. Die üblichen sind `yt` (YouTube), `wiki` (Wikipedia), `gh` (GitHub), `scholar` (Google Scholar), `arxiv` (arXiv) und `hf` (Hugging Face). Das × bei einem entfernt es. **Kürzel hinzufügen** fragt nach einem **Kürzel** (ein Wort), einem **Namen** und einer **Adresse, mit %s an der Stelle deiner Suchwörter**, dann **Hinzufügen** (oder **Abbrechen**); es können 50 sein. **Die üblichen wiederherstellen** erscheint, sobald du die Liste geändert hast. In der Adressleiste bietet `yt lofi` zuerst „Mit YouTube suchen: ‚lofi‘“ an, und **Enter** tut es; die Zeile des Getippten („Mit Google suchen“) durchsucht weiterhin alle Wörter mit deiner Suchmaschine.
- **Suchvorschläge** (zuerst eingeschaltet): Was du in die Adressleiste eingibst, geht beim Tippen wie in jedem Browser an deine Suchmaschine, damit sie Suchen vorschlagen kann. Startpage und eine eigene Adresse liefern keine. Schalte es aus, um das Getippte auf diesem Computer zu behalten; deine geöffneten Tabs, Lesezeichen und dein Verlauf erscheinen weiterhin.
- **Werbung** (siehe [Werbung und Tracker blockieren](/guide/web#block-ads-and-trackers)):
  - **Werbung und Tracker blockieren** (anfangs an).
  - **Cookie-Banner ausblenden** (anfangs an; setzt voraus, dass **Werbung und Tracker blockieren** an ist, und ist ohne das ausgegraut).
  - **Filterlisten**: EasyList, EasyPrivacy, die Listen von uBlock Origin, die Liste von Peter Lowe und die Online Malicious URL Blocklist, stets aktuell gehalten. Die Zeile sagt, wann sie aktualisiert wurden und wie viele Regeln der Blocker hat („Vor 2 Stunden aktualisiert · 307.000 Regeln“), und **Jetzt aktualisieren** holt sie sofort.
  - **Listen für Websites in anderen Sprachen**: anfangs die Liste für die eigene Sprache der App (EasyList Germany, wenn die App auf Deutsch ist, AdGuard Japanese auf Japanisch; keine für Englisch). **Sprache hinzufügen** fügt eine weitere Liste hinzu, aus etwa 25 Sprachen, und mit dem × bei einer entfernst du sie.
  - **Strengeres Blockieren** (anfangs aus): fügt die Werbeliste von AdGuard hinzu. Sie erfasst mehr Werbung, aber bei einigen Websites muss Werbung eventuell erlaubt werden.
  - **Störendes ausblenden** (anfangs aus): fügt die Annoyances-Liste von uBlock Origin hinzu, die Pop-ups, Newsletter-Boxen, Chat- und Social-Widgets sowie „In App öffnen“-Banner ausblendet. Manche Websites funktionieren dann möglicherweise nicht richtig.
  - **Websites, auf denen Werbung erlaubt ist**: die Websites, die du über das Schild erlaubt hast, jeweils mit einem ×, um ihre Werbung wieder zu blockieren. Sie erscheint nur, wenn es welche gibt.
  - **Statistiken**: wie viele Werbeanzeigen und Tracker blockiert wurden und seit wann, und **Anzeigen** öffnet die Statistiken.
- **Übersetzung**, für das [Übersetzen von Seiten](/guide/web#translate-a-page):
  - **Übersetzen in**: die Sprache, in die Seiten übersetzt werden. Es ist die Sprache der App, bis du eine wählst.
  - **Anbieten, Seiten in anderen Sprachen zu übersetzen** (zuerst eingeschaltet): zeigt die Übersetzen-Schaltfläche in der Adressleiste bei einer Seite in einer anderen Sprache. Ausgeschaltet erscheint die Schaltfläche nur bei einer Seite, die schon übersetzt ist; **Menü** (⋯) → **Seite übersetzen …** funktioniert weiterhin.
  - **Immer übersetzen**: Sprachen, deren Seiten übersetzt werden, sobald sie laden. **Sprache hinzufügen** wählt eine; das × bei einer Sprache nimmt sie heraus.
  - **Nie übersetzen**: Sprachen, für die die Schaltfläche nie gezeigt wird. Eine Sprache steht höchstens in einer dieser beiden Listen.
  - **Diese Websites nie übersetzen**: Websites, für die die Schaltfläche nie gezeigt wird und die nie von selbst übersetzt werden („Keine Websites“, bis du eine mit **Nie übersetzen** im Übersetzungsfeld hinzufügst); das × bei einer Website nimmt sie heraus.
  - Ein Hinweis sagt, was das Übersetzen sendet und an welches Modell.
- **Seiten**:
  - **Seitenzoom** (zuerst 100 %; 50 % bis 200 %): wie groß Seiten sind, außer du zoomst eine Website selbst. Eine Website, die du selbst zoomst (Strg mit + oder −, Strg und das Mausrad, das **Zoom** des Menüs), behält ihren Zoom, solange die App läuft; **Zurücksetzen** (Strg+0, der Prozentwert des Menüs, der Chip der Adressleiste) setzt ihn auf den Seitenzoom zurück (siehe [Zoom, Drucken und Vollbild](/guide/web#zoom-print-and-full-screen)).
  - **Rechtschreibung prüfen** (zuerst eingeschaltet): unterstreicht falsch geschriebene Wörter beim Tippen, mit Vorschlägen im Rechtsklickmenü.
  - **Dunkle Seiten** (zuerst aus): Seiten ohne eigenes dunkles Design werden in dunklen Farben gezeigt (siehe [Dunkle Seiten](/guide/web#dark-pages)).
  - **Websites, die unverändert gezeigt werden**: die Websites, für die du **Dunkle Seiten auf dieser Website** ausgeschaltet hast, mit einem × zum Wiederzeigen in Dunkel.
  - **Websites dürfen von selbst Ton abspielen** (zuerst aus): Ausgeschaltet wartet der Ton einer Seite, bis du darin klickst oder tippst, während Videos ohne Ton trotzdem laufen; eingeschaltet darf eine Seite ihren Ton sofort starten, wie in älteren Browsern. Es gilt für Tabs, die du nach der Änderung öffnest.
- **Browserdaten löschen**: Hake **Browserverlauf**, **Cookies und Websitedaten** (du wirst von Websites abgemeldet) und **Zwischengespeicherte Dateien** an, wähle einen Zeitraum (**Letzte Stunde**, **Letzte 24 Stunden**, **Letzte 7 Tage** oder **Gesamter Zeitraum**) und drücke **Daten löschen**. Der Zeitraum gilt nur für den Verlauf (und die dazugehörige Download-Liste): Cookies, Websitedaten und zwischengespeicherte Dateien werden immer für den gesamten Zeitraum gelöscht.

### Werbung und Tracker blockieren

Dein eigener Browser blockiert Werbung und Tracker, so wie es ein Werbeblocker tut. Er stoppt die Anfragen an Werbe- und Tracking-Server, blendet die leeren Stellen aus, die sie hinterlassen, sowie die als gesponsert gekennzeichneten Kästen (auch mit den erweiterten Regeln von uBlock Origin, die eine Werbung an ihren Wörtern oder ihrer Form erkennen) und gibt einer Seite harmlose Platzhalter für die blockierten Werbeskripte, damit eine Seite, die auf sie prüft, weiter funktioniert. Außerdem führt er die kleinen Seitenkorrekturen von uBlock Origin in jedem Frame der Seite aus, noch vor den eigenen Skripten der Seite: Damit verschwinden die Videowerbung auf YouTube und viele „Schalte deinen Werbeblocker aus“-Meldungen. In den Browsern der Agenten blockiert er nichts, in privaten Tabs funktioniert er. Mit **Werbung und Tracker blockieren** in den [Browser-Einstellungen](/guide/web#browser-settings) schaltest du ihn aus.

Seine Listen sind die, die in diesen Einstellungen unter **Filterlisten** beschrieben sind. Die App lädt sie beim ersten Start deines Browsers von ihren Herausgebern und lädt jede erneut, wenn sie abläuft: die schnellen Korrekturen von uBlock Origin, zu denen auch die YouTube-Korrekturen gehören, etwa alle 8 Stunden, die anderen alle paar Tage; mit **Jetzt aktualisieren** geschieht das sofort. Lässt sich eine Liste nicht laden, behält der Blocker die, die er hat. Es gehen nur die Anfragen nach den Listen hinaus, und nichts über dich oder die Seiten, die du besuchst, wird mitgeschickt. Die zusätzlichen Listen (**Listen für Websites in anderen Sprachen**, **Strengeres Blockieren** und **Störendes ausblenden**) kannst du in denselben Einstellungen selbst aktivieren.

**Das Schild.** Auf einer Webseite zeigt ein Schild in der Adressleiste, wie viele Werbeanzeigen und Tracker auf ihr blockiert wurden. Klicke darauf, um zu sehen:

- die Anzahl, aufgeteilt in Werbung und Tracker, und die blockierten Hosts, jeweils mit **Werbung** oder **Tracker** gekennzeichnet (zum Beispiel googleads.g.doubleclick.net);
- was auf dieser Website insgesamt blockiert wurde, seit der Blocker zu zählen begonnen hat;
- **Werbung auf dieser Website blockieren**, ein Schalter. Ist er ausgeschaltet, erlaubt er Werbung auf dieser Website und ihren Subdomains, und die Seite lädt neu; wieder eingeschaltet, blockiert er sie erneut und lädt die Seite neu. Nutze ihn, wenn eine Website den Blocker trotzdem bemerkt oder etwas auf ihr nicht mehr funktioniert;
- **Statistiken**, womit die [Statistiken des Werbeblockers](/browser?panel=adblock) geöffnet werden, und **Einstellungen**, womit der Bereich **Werbung** der [Browser-Einstellungen](/guide/web#browser-settings) geöffnet wird.

Ist der Blocker aus, steht im Feld des Schilds **Der Werbeblocker ist aus**, dazu **Aktivieren**, womit du ihn einschaltest und die Seite neu lädst.

**Statistiken.** Der [Werbeblocker](/browser?panel=adblock) (über **Statistiken** am Schild oder über **Browser-Einstellungen** → **Werbung** → **Statistiken** → **Anzeigen**) zeigt **Blockiert**, **Werbung**, **Tracker** und **Eingesparte Daten** (eine Schätzung, ausgehend von der üblichen Größe des Blockierten), seit wann gezählt wird, ein Diagramm der letzten 30 Tage, **Am meisten blockiert** (die Hosts) und **Websites mit den meisten blockierten Elementen**. **Statistiken zurücksetzen** vergisst sie und beginnt neu zu zählen. Sie bleiben auf diesem Computer, in den eigenen Daten der Desktop-App, und Agenten können sie nicht lesen. Ein privater Tab zählt in den Summen mit, hinterlässt aber keine Hosts oder Websites, und **Browserdaten löschen** mit angehaktem **Browserverlauf** lässt die Statistiken auch die Websites vergessen.

Bei eingeschaltetem Blocker sehen deine Chrome-Erweiterungen weiterhin die Anfragen der Seite, aber eine, die Anfragen blockiert oder ändert (ein eigener Werbeblocker), blockiert sie nicht; schalte den Blocker aus, um ihr die Seite zu überlassen.

**Cookie-Banner ausblenden** (zunächst eingeschaltet, in den Browser-Einstellungen und nur, solange der Blocker an ist) blendet außerdem die Cookie-Hinweise aus, die viele Websites zeigen; dafür wird die Liste von EasyList zu den obigen Listen hinzugefügt. Es blendet einen Hinweis aus und beantwortet ihn nicht für dich, sodass eine Website, die auf deine Antwort wartet, manche ihrer Inhalte zurückhalten kann: Erlaube Werbung auf dieser Website über ihr Schild, um ihren Hinweis wieder zu sehen.

### Das Schloss

Das Schloss am Anfang der Adressleiste zeigt, ob die Verbindung zur Website sicher ist („Nicht sicher“ mit einem offenen Schloss bei einer http-Seite). Klicke darauf, um die Website zu sehen, ob ihre Verbindung sicher ist und was du für sie erlaubt oder blockiert hast (jeweils mit **Vergessen**, damit erneut gefragt wird). Die auf der Seite blockierten Werbeanzeigen und Tracker findest du im Schild am rechten Ende der Adressleiste (siehe [Werbung und Tracker blockieren](/guide/web#block-ads-and-trackers)). Auf einer Webseite hat es außerdem:

- **Dunkle Seiten auf dieser Website**, ein Schalter, der erscheint, solange [dunkle Seiten](/guide/web#dark-pages) an ist: Schalte ihn aus, um diese Website unverändert zu zeigen.
- **Cookies und Websitedaten**, mit **Löschen**. Es fragt zuerst („Cookies und Websitedaten von example.com löschen, auch die seiner Subdomains? Du wirst dort abgemeldet.“); **Löschen** entfernt die Cookies und gespeicherten Websitedaten dieser Website, auch die ihrer Subdomains (bei `mail.example.com` die von example.com), aus den Anmeldungen genau dieses Tabs (bei einem privaten Tab sind es seine eigenen), und lädt die Seite neu. Ein Hinweis sagt, was gelöscht wurde. Zwischengespeicherte Dateien bleiben: **Browserdaten löschen** in den Einstellungen des Browsers löscht sie und alles von jeder Website.

### Downloads

Eine Datei, die eine Seite herunterlädt, wird im Ordner Downloads des Computers gespeichert, auf dem die App läuft, und steht unter **Menü** (⋯) → **Downloads** als „Wird heruntergeladen…“, „Fertig“ oder „Fehlgeschlagen“, mit ihrem Pfad. Ein Download aus einem privaten Tab wird genauso gespeichert und steht hier, kommt aber nicht in die Liste, die die Suche (Strg+K) findet. Klicke auf eine fertige, um sie in ihrem Ordner zu zeigen: Die Desktop-App öffnet dafür den Dateimanager des Systems mit der ausgewählten Datei (**Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen**; siehe [Mit Dateien und Ordnern arbeiten](/guide/files-git#work-with-files-and-folders)).

### Wenn eine Website eine Berechtigung anfragt

Möchte eine Seite in deinem eigenen Browser deine Kamera, dein Mikrofon, deinen Standort, Benachrichtigungen, deine Zwischenablage oder Ähnliches verwenden, sagt das eine Leiste über der Seite („example.com möchte deine Kamera verwenden“) mit **Nicht zulassen** und **Erlauben**. Deine Antwort wird für diese Website gemerkt, sodass sie nur einmal fragt; um zu sehen, was du erlaubt oder blockiert hast, oder um wieder gefragt zu werden, öffne das Schloss oder **Menü** (⋯) → **Website-Berechtigungen** und drücke **Vergessen** neben einer Antwort. Die Browser der Agenten dort lehnen jede solche Anfrage selbst ab, außer um den Bildschirm zu füllen und in deine Zwischenablage zu kopieren. In einem privaten Tab fragt die Leiste jedes Mal: Deine Antwort wird vergessen, wenn der Tab sich schließt, und ein Erlauben aus einem normalen Tab gilt dort nicht (eine Website, die du blockiert hast, bleibt blockiert). Eine Dialogfrage der Seite (eine Warnung, eine Ja-Nein-Frage oder eine Texteingabe) erscheint über der Seite wie im Browser der Agenten (siehe [Dialogfragen einer Webseite beantworten](/guide/web#answer-a-pages-pop-up-questions)).

## Lesezeichen

Die Websites der Lesezeichenleiste sind oben in der Tab-Spalte angepinnt, sobald du ein Lesezeichen darauf hast (auf einem Smartphone gibt es keine Tab-Spalte; deine Lesezeichen sind im Menü). Klicke auf eine, um sie im geöffneten Tab zu öffnen; Strg+Klick (⌘+Klick auf dem Mac) oder ein Mittelklick öffnet sie in einem neuen Tab. Ein Ordner öffnet eine Liste seines Inhalts, und zehn Kacheln sind das Höchste, was gezeigt wird (eine Kachel **…** listet den Rest). Rechtsklick auf eine Kachel bietet **Öffnen**, **In neuem Tab öffnen**, **Bearbeiten** (**Umbenennen** bei einem Ordner) und **Löschen**.

Für alle drücke **Menü** (⋯) → **Lesezeichen** oder gehe zu [Lesezeichen](/browser?panel=bookmarks). Der Bereich hat zwei Orte, **Lesezeichenleiste** und **Andere Lesezeichen**, und die Ordner darin öffnen und schließen sich; jeder bleibt beim nächsten Öffnen des Bereichs so, wie du ihn gelassen hast.

- **Lesezeichen durchsuchen** (das Feld oben) findet ein Lesezeichen anhand seiner Wörter (siehe [Lesezeichen durchsuchen](/guide/web#search-your-bookmarks)).
- **Neuer Ordner** (oben) fügt der Leiste einen Ordner hinzu und fragt nach seinem Namen.
- **Mit KI organisieren** (der Funkel-Button oben, neben **Neuer Ordner**) sortiert deine Lesezeichen nach Thema in Ordner (siehe [Mit KI organisieren](/guide/web#organize-with-ai)).
- Fahre über eine Zeile für **Nach oben verschieben**, **Nach unten**, **Bearbeiten** (**Umbenennen** bei einem Ordner) und **Löschen**. Du kannst eine Zeile auch ziehen: auf die Mitte eines Ordners, um sie hineinzulegen, oder zwischen Zeilen, um sie dort einzusortieren. Ein Ordner kann nicht in sich selbst liegen. Das Löschen eines Ordners fragt vorher und nimmt mit, was darin ist.
- Die Adresse eines Lesezeichens beginnt mit http://, https://, file:// oder chrome-extension://. Du kannst bis zu 20.000 behalten.

### Lesezeichen durchsuchen

Oben im Bereich findet das Feld **Lesezeichen durchsuchen** Lesezeichen anhand jedes Worts, das du tippst, in ihren Namen und Adressen (Groß- und Kleinschreibung und Akzente spielen keine Rolle) und Ordner anhand ihrer Namen. Solange das Feld Wörter enthält, zeigt der Bereich statt der Ordner **Ordner** (bis zu 20) und **Lesezeichen** (bis zu 200), und jedes Lesezeichen zeigt seine Website und wo es liegt, etwa „Lesezeichenleiste › Imported from Chrome › Research“.

- Klicke auf einen Ordner, um ihn unter deinen Ordnern zu sehen: Die Suche wird geleert und der Ordner öffnet sich.
- Klicke auf ein Lesezeichen, um es zu öffnen; Strg+Klick (⌘+Klick auf dem Mac) öffnet es in einem neuen Tab.
- Fahre über ein Lesezeichen für **Im Ordner anzeigen**, **Bearbeiten** und **Löschen**.
- **Enter** öffnet das erste gefundene Lesezeichen, und **Esc** leert die Suche.

### Mit KI organisieren

Hast du viele Lesezeichen, sortiert der Funkel-Button **Mit KI organisieren** oben im Bereich, neben **Neuer Ordner**, sie nach Thema in Ordner. Du kannst auch im Suchfeld (Strg+K) nach „Lesezeichen mit KI organisieren“ suchen oder zu [Mit KI organisieren](/browser?panel=bookmarks&organize=1) gehen. Es öffnet **Deine Lesezeichen mit KI organisieren**, wo du wählst, wie:

- **Meine Ordner behalten** (zuerst gewählt): Deine Ordner und die Lesezeichen darin bleiben, wie sie sind. Lose Lesezeichen kommen in den passenden Ordner: einen von dir oder einen neuen. Lose heißt: direkt in **Andere Lesezeichen** oder in einem Ordner, der nur Lesezeichen sammelt, etwa „Imported from Chrome“ eines Imports und die darin liegenden Ordner „Other bookmarks“ oder „Mobile bookmarks“ (das Hilfsmodell unterscheidet sie von deinen eigenen Ordnern, in jeder Sprache). Ein solcher Sammelordner, den das Einsortieren leert, wird entfernt (einer, der schon leer war, bleibt); kein anderer Ordner wird entfernt, umbenannt oder verschoben. Neue Ordner kommen ans Ende von **Andere Lesezeichen** oder in einen deiner Ordner.
- **Neu beginnen**: Jedes Lesezeichen kommt nach Thema in neue Ordner in **Andere Lesezeichen**, und deine alten Ordner werden entfernt. Die neuen Ordner stehen in **Andere Lesezeichen** zuerst, nach Namen, mit höchstens einer Ebene von Unterordnern; ein Ordner, in dem ein Lesezeichen bleibt, das das Modell nicht einordnen konnte, bleibt bestehen.

In beiden Fällen bleiben die Websites, die an deiner Lesezeichenleiste angepinnt sind (die eigenen Links der Leiste), wo sie sind.

**Was gesendet wird, und an welches Modell.** Nur wenn du **Organisieren** drückst, gehen die Titel und Adressen deiner Lesezeichen (ohne alles nach einem **?** oder **#**) und die Namen deiner Ordner an das Hilfsmodell der App, das auch Sitzungstitel und Memory-Notizen schreibt ([Einstellungen → Agenten → Modelle → Hilfsmodell](/settings?s=models&find=Helper%20model)). Bei „Automatisch“ ist das Claude Haiku über Claude Code; ein eigenes Modell auf diesem Computer behält sie hier. Zu keiner anderen Zeit wird etwas gesendet. Ist der Titel eines Lesezeichens privat, drücke den Button nicht (oder nimm ein Modell auf diesem Computer als Hilfsmodell).

Es arbeitet in zwei Schritten: Zuerst legt es die Ordner fest, dann sortiert es die Lesezeichen hinein, 150 auf einmal; ein paar hundert Lesezeichen dauern ein bis zwei Minuten. Während es arbeitet, steht oben im Bereich „Ordner werden ermittelt …“, dann „Lesezeichen werden sortiert … 150 von 412“ mit einem Balken und **Stoppen**, das nichts ändert. Ist es fertig, sagt es, was es getan hat, etwa „Einsortierte Lesezeichen: 412. Neue Ordner: 14. Entfernte leere Ordner: 3.“, und die Ordner erscheinen zugeklappt, damit die neuen auf einen Blick zu erkennen sind. **Rückgängig machen** stellt jedes Lesezeichen wieder so her, wie es war, solange du deine Lesezeichen seither nicht geändert hast; das X schließt die Meldung. Schlägt es fehl, wird nichts geändert, und **Erneut versuchen** öffnet es wieder.

Agenten können deine Lesezeichen nicht für dich ordnen: Dein eigenes Surfen gehört nur dir. Frag einen, und er sagt dir, wo der Button ist.

### Lesezeichen importieren

Unter **Importieren** im Bereich listet die App die Browser auf diesem Computer auf, die Lesezeichen haben, jeweils mit der Anzahl: Chrome (und Chrome Beta), Chromium, Edge, Brave, Vivaldi, Opera, Firefox und, nur auf einem Mac, Arc und Safari. Ein Browser mit mehreren Profilen wird für jedes einzeln aufgeführt, mit dem Namen des Profils. Drücke bei einem **Importieren**, und seine Lesezeichen kommen in einen neuen Ordner am Ende der Lesezeichenleiste mit dem Namen „Imported from Chrome“ („Imported from Chrome (Work)“, wenn der Browser mehrere Profile hat). Die eigenen Ordner des Browsers bleiben erhalten: zuerst, was in seiner Lesezeichenleiste war, dann seine anderen Lesezeichen, mobile und das Menü von Firefox als Ordner, benannt, wie dieser Browser sie nennt. Links, die keine Webseiten sind, etwa javascript:-Links, und leere Ordner werden weggelassen. Firefox kann geöffnet bleiben. In der Desktop-App bietet die Willkommenstour das ebenfalls an, auf einer eigenen Seite, **Lesezeichen und Verlauf importieren?**, wenn Hydor auf diesem Computer andere Browser findet (siehe [Die Tour starten](/guide/app#take-the-tour)).

Wenn du die Seite Browser zum ersten Mal öffnest, Hydor auf diesem Computer andere Browser findet und dir der Import noch nicht angeboten wurde (die Seite der Tour zählt mit), fragt eine Leiste über der Seite „Lesezeichen und Verlauf aus Google Chrome und Firefox importieren?“ und nennt die gefundenen Browser. **Nein danke** schließt sie, und **Importieren …** öffnet das Fenster **Lesezeichen und Verlauf importieren** ([Lesezeichen und Verlauf importieren](/browser?panel=import)). Die Leiste erscheint nur bei diesem einen Besuch; das Fenster ist jederzeit unter dieser Adresse da, und die Suche (Strg+K) findet es. Die Bereiche **Lesezeichen** und **Verlauf** haben außerdem unten **Importieren**. Es hat einen Hinweis, „Lesezeichen kommen in einen neuen Ordner am Ende der Lesezeichenleiste, und der Verlauf kommt zu deinem hinzu. Alles bleibt auf diesem Computer.“, dann die Schalter **Lesezeichen** und **Verlauf** (beide an) und für jeden Browser (und jedes Profil) eine Zeile mit der Anzahl seiner Lesezeichen und Seiten im Verlauf und **Importieren**, das übernimmt, was eingeschaltet ist, wie auf der Seite der Tour. **Importiert** erscheint an beiden Stellen bei dem, was hereingekommen ist. Wird kein Browser gefunden, steht dort „Auf diesem Computer wurde kein anderer Browser gefunden.“

Safari bewahrt seine Lesezeichen dort auf, wo macOS sie schützt. Solange du es nicht erlaubst, sagt seine Zeile „Hydor may not read Safari’s bookmarks: allow it in System Settings → Privacy & Security → Full Disk Access“. Seine Zeile zeigt **Systemeinstellungen öffnen** statt **Importieren**: Das öffnet Systemeinstellungen → Datenschutz & Sicherheit → Festplattenvollzugriff, wo du Hydor einschaltest (füge es mit **+** hinzu, falls es nicht aufgelistet ist). Wenn du zu Hydor zurückkommst, prüft es erneut, und die Zahl bei Safari und **Importieren** erscheinen. Kann es Safari weiterhin nicht lesen, ergänzt die Zeile „Erlaubt? macOS verlangt eventuell zuerst einen Neustart von Hydor: Beende Hydor und öffne es erneut.“

Um stattdessen eine Datei zu importieren, drücke **Aus einer Datei** und wähle eine Lesezeichendatei, die aus einem beliebigen Browser exportiert wurde (eine .html-Datei, bis zu 20 MB). Sie kommt in einen Ordner mit dem Namen „Imported bookmarks“.

### Lesezeichen exportieren

**Exportieren** unter **Importieren** speichert alle deine Lesezeichen als `bookmarks.html`, das Chrome, Firefox und Safari importieren können.

## Chrome-Erweiterungen

Dein eigener Browser kann Chrome-Erweiterungen ausführen: einen Passwortmanager, einen Dunkelmodus, einen Übersetzer. Drücke **Menü** (⋯) → **Erweiterungen** oder gehe zu [Erweiterungen](/browser?panel=extensions). Erweiterungen laufen im eigenen Browser der Desktop-App. Anderswo bewahrt der Bereich sie auf und sagt das („Erweiterungen laufen im eigenen Browser der Desktop-App. Sie werden hier gespeichert und dort ausgeführt.“). Eine Erweiterung läuft mit deinen Anmeldungen und kann die Websites lesen, die sie anfordert; füge also nur vertrauenswürdige hinzu.

### Erweiterung hinzufügen

- **Aus dem Chrome Web Store**: Füge den Link der Erweiterung (eine Adresse von chromewebstore.google.com oder chrome.google.com/webstore) oder ihre ID (32 Buchstaben von a bis p) unter **Aus dem Chrome Web Store** ein und drücke **Hinzufügen**. Oder öffne die Seite der Erweiterung in deinem eigenen Browser und drücke oben in der Leiste **Zu Hydor hinzufügen**. Die App lädt sie aus dem Chrome Web Store herunter (eine Anfrage an Google) und merkt sich ihre Web-Store-ID.
- **Aus einem Ordner**: Drücke **Ordner auswählen** (in der Desktop-App) oder gib den Pfad des Ordners ein (anderswo: ein Ordner auf dem Computer, auf dem die App läuft), für eine entpackte Erweiterung mit einer manifest.json. Sie wird dort verwendet, wo sie liegt, und nicht kopiert, sodass Änderungen eines Entwicklers sichtbar werden.
- **Aus deinen anderen Browsern**: Die Erweiterungen, die in Chrome, Edge, Brave und anderen Chromium-basierten Browsern auf diesem Computer installiert sind, stehen mit je einem Kontrollkästchen in der Liste. Hake die gewünschten an und drücke **Importieren**. Die schon vorhandenen sagen „Schon vorhanden“, und die, die in ihrem Browser ausgeschaltet sind, „Dort deaktiviert“.

Erweiterungen werden nicht von selbst aktualisiert. Füge eine erneut aus dem Chrome Web Store hinzu, um ihre neueste Version zu erhalten; sie ersetzt die alte.

### Eine ausschalten oder entfernen

Jede Erweiterung im Bereich zeigt Symbol, Name und Version und einen Schalter zum Ein- und Ausschalten. **Entfernen** löscht sie (die eigenen Dateien eines Ordners bleiben). **Optionen** öffnet ihre Optionsseite in einem Tab.

Hat eine Erweiterung eine Schaltfläche in der Symbolleiste, erscheint sie rechts der Adressleiste, solange die Erweiterung eingeschaltet und angeheftet ist: Klicke darauf, um ihr Popup unter der Schaltfläche zu öffnen; ein Abzeichen darauf, eine Zahl oder ein paar Buchstaben, zeigt, was die Erweiterung meldet. Die Erweiterungen, die du nicht angeheftet hast, haben keine eigene Schaltfläche und sind in der Schaltfläche **Erweiterungen** (dem Puzzleteil) hinter den anderen. Sie erscheint, solange mindestens eine Erweiterung eingeschaltet ist.

- **Eine Erweiterung im Menü benutzen**: Drücke **Erweiterungen** und klicke auf den Namen einer Erweiterung, um sie zu benutzen, als hättest du auf ihre Schaltfläche geklickt. Auch eine Erweiterung ohne eigene Schaltfläche in der Symbolleiste steht in der Liste: Ihr Name öffnet ihre Optionsseite, wenn sie eine hat.
- **Anheften oder lösen**: Die Nadel neben einer Erweiterung in diesem Menü (**In der Symbolleiste anheften**, bei einer angehefteten **Von der Symbolleiste lösen**) zeigt oder verbirgt ihre Schaltfläche in der Symbolleiste. Die Nadel leuchtet, solange die Erweiterung angeheftet ist. Das Anheften ändert nur die Symbolleiste: Die Erweiterung läuft in beiden Fällen weiter.
- **Mehr zu einer Erweiterung**: Das **⋮** daneben hat **Optionen** (wenn sie eine Optionsseite hat), **Deaktivieren** und **Entfernen**, das vorher nachfragt.
- **Erweiterungen verwalten** am Ende des Menüs öffnet den Bereich.
- **Klicke mit der rechten Maustaste auf eine Schaltfläche** in der Symbolleiste, um ein kleines Menü mit ihrem Namen zu öffnen, dann **Optionen** (wenn sie eine Optionsseite hat), **Lösen**, **Entfernen** und **Erweiterungen verwalten**.
- **In der Symbolleiste anheften** ist auch ein Schalter im Bereich, unter jeder eingeschalteten Erweiterung mit Schaltfläche.

Eine neue Erweiterung ist zuerst angeheftet. Erweiterungen, die du aus Chrome importierst, behalten ihre Pins von dort: Die, die du in Chrome angeheftet hattest, sind hier angeheftet, die anderen sind im Menü **Erweiterungen**. Ein Klick auf eine Erweiterung, die in diesem Browser nicht läuft, sagt das („… läuft in diesem Browser nicht“).

**Auch in den Browsern der Agenten** ist anfangs aus. Eingeschaltet läuft die Erweiterung auch in den Browsern der Agenten, die Anmeldungen behalten, also denen mit einem Profil (siehe [Anmeldungen mit Profilen behalten](/guide/web#keep-sign-ins-with-profiles)), und nur dort. Browser, die ohne Anmeldung neu starten, bekommen nie Erweiterungen. (Auf einem Server laden ein Chromium oder Chrome for Testing sie; Google Chrome tut das nicht mehr.)

### Was möglicherweise nicht funktioniert

Der Browser der Desktop-App hat das meiste von dem, was Chrome Erweiterungen bietet. Inhalte, die eine Erweiterung zu Seiten hinzufügt, Popups, Optionsseiten, gespeicherte Einstellungen, Nachrichten, Abzeichen, Benachrichtigungen (als die des Systems angezeigt) und Wecker funktionieren, ebenso das, was eine Erweiterung mit deinen Tabs macht: Sie sieht den Tab, in dem du bist, und Adresse und Titel der Seiten, die sie lesen darf; sie öffnet Tabs (im Vordergrund, wie in Chrome), wechselt zu ihnen und schließt sie, und sie erfährt, wenn sie laden oder sich ändern. Ihre Downloads werden wie deine gespeichert, sie liest und setzt die Cookies der Websites, die sie verwenden darf, die Hintergrundseiten, die sie sich selbst erstellt (Offscreen), laufen, und ihr Seitenfenster öffnet sich unter ihrer Schaltfläche, so wie ein Popup. Was möglicherweise nicht funktioniert: Anfragen blockieren oder ändern (worauf viele Werbeblocker beruhen), die Anmeldung mit einem Konto, Verlauf und Lesezeichen des Browsers, Tab-Gruppen, Tastenkürzel einer Erweiterung und die Einträge, die eine Erweiterung zum Rechtsklickmenü hinzufügt (angenommen, nie angezeigt). Die Zeile der Erweiterung sagt, welche sie anfordert, in einer Zeile wie „Einige Teile funktionieren hier möglicherweise nicht: Anfragen blockieren oder ändern, Anmeldung mit einem Konto“. Sie richtet sich nach dem, was die Erweiterung anfordert, kann also trotzdem gut funktionieren.

## Eine Seite an einen Agenten übergeben

Ein Agent bekommt nie deinen eigenen Browser. Du kannst ihm eine Seite daraus geben, auf zwei Arten (ein [privater Tab](/guide/web#private-tabs) lässt sich nicht übergeben: **Fragen** ist dort ausgegraut, und die App verweigert die Kopie seiner Seite): **Fragen** gibt ihm eine Kopie zum Lesen, und **Erledigen** gibt ihm einen Tab zum Arbeiten. Beides steht unter **Fragen** in der Leiste, das die Spalte neben der Seite mit einem Schalter öffnet, **Fragen** oder **Erledigen** (siehe [Neben der Seite fragen](/guide/web#ask-beside-the-page)). Sie funktionieren bei einer Seite einer Website. Das Feld in der Leiste tut beides mit dem, was du tippst, so wie der Schalter es sagt: Seine Zeile **Zu dieser Seite fragen: „…“** wird zu **Auf dieser Seite erledigen lassen: „…“**, solange **Erledigen** gewählt ist.

### Zu dieser Seite fragen

Der Agent bekommt eine Kopie der Seite, eine Datei mit ihrem Titel, ihrer Adresse, dem, was du darauf markiert hattest, und ihrem lesbaren Text (bis zu 200.000 Zeichen), und eine neue Sitzung startet mit deiner Frage, mit dem Agenten und Modell, die die Startseite zuletzt verwendet hat. Die Antwort erscheint in der Spalte neben der Seite, und **Als Sitzung öffnen** bringt dich dorthin. Der Agent kann die Seite nicht anfassen und sieht deine Anmeldungen nicht: Er liest die Kopie. Lass die Seite zuerst fertig laden, denn die Kopie ist das, was der Tab jetzt zeigt.

### Auf der Seite erledigen lassen

Ist in „Fragen“ **Erledigen** gewählt, fragt die Spalte „Was soll ein Agent auf dieser Seite tun?“ und sagt, was der Agent bekommt. Wähle mit der Agentenschaltfläche **Claude Code** oder **Custom** (nur diese beiden lassen sich auf den Browser beschränken; die App lehnt die anderen ab) und drücke **Erledigen lassen**. Wörter, die du auf der Seite mit **Agenten zu „…“ fragen** gewählt hast, oder ein Bild von **Zu diesem Bild fragen** gehen mit der Anfrage mit. Der Agent bekommt:

- **Einen eigenen Tab** in dem Browser, der deine Anmeldungen behält, geöffnet bei der Adresse deiner Seite: Er ist auf dieser Website als du angemeldet. Dein eigener Tab bleibt, wo er ist.
- **Nur diese Website**: Seiten anderswo öffnen sich für ihn nicht. Bei einer Seite auf diesem Computer ist es nur diese Adresse.
- **Nur den Browser**: keine Befehle, keine Dateien, keine Websuche, keine anderen Apps, kein Memory und keine Subagenten. Eine solche Sitzung lässt sich nicht in einem anderen Agenten fortsetzen, und ein Fork davon bleibt auf den Browser beschränkt.
- **Einen Halt vor dem Senden**: Er fragt wie oben nach, bevor er eine Schaltfläche drückt, die etwas sendet, veröffentlicht, löscht oder überweist, und ihm ist gesagt, dass er dich fragen soll, wenn er unsicher ist (siehe [Schaltflächen, die senden, veröffentlichen oder löschen](/guide/web#buttons-that-send-post-or-delete)). Bezahlen bleibt wie immer deine Sache.

Die erste Nachricht an den Agenten sagt ihm, dass deine Seite in seinem Browser geöffnet ist und dass er dort allein arbeitet. Der Browser muss in den Einstellungen eingeschaltet sein (**Ein Browser für Agenten**). Nach dem Drücken von **Erledigen lassen** erscheint der Tab des Agenten anstelle der Seite, mit seiner Unterhaltung daneben (siehe [Agenten bei der Arbeit](/guide/web#agents-at-work)). Zurück in deinen Tabs zeigt „Fragen“ für diesen Tab die Unterhaltung, mit **Sieh bei der Arbeit zu** (der Tab des Agenten erscheint wieder), **Als Sitzung öffnen** und **Neue Anfrage**.

### Die Seite zurückholen

Bei einem Agentenbrowser, der deine Seite bekommen hat, sagt der Bereich über dem Nachrichtenfeld „Dein Tab von example.com“ mit **Zurückholen**, ebenso die Leiste, solange du ihn ansiehst. Drücke es, um den Tab des Agenten zu schließen und die Seite als neuen Tab von dir zu öffnen, ganz vorn. Dem Agenten wird gesagt „I took the page back: it is mine again“. Sein Browser schließt sich mit seinem letzten Tab und sonst wie der jeder Sitzung, wenn die Sitzung endet (siehe [Wann der Browser schließt](/guide/web#when-the-browser-closes)).

## Agenten bei der Arbeit

Solange ein Agent einen Browser offen hat, listet ihn die Tab-Spalte unter **Agenten bei der Arbeit** auf, eine Zeile für jeden, mit dem Titel der Sitzung und dem, was er gerade tut („Klicken auf „Anmelden““, „Wartet auf dich“, „Du steuerst – der Agent wartet“). Die Liste ist immer aktuell, und es gibt diesen Teil nicht, wenn kein Agent einen Browser offen hat. Klicke auf eine Zeile, um diesen Browser anstelle der Seite zu sehen:

- Die Seite erscheint mit den Fragen des Agenten darüber, wie unter [Für Anmeldung, Prüfungen oder Zahlungen übernehmen](/guide/web#take-over-to-log-in-solve-a-check-or-pay), und mit einem Ring darum: bernsteinfarben, solange er auf dich wartet, blau, solange du steuerst. Das Feld zeigt einen Chip mit dem Agenten und dem Titel der Sitzung (sein **×**, **Zurück zu deinen Tabs**, geht zurück) und die Adresse des Tabs des Agenten.
- Die Leiste hat **Stoppen**, solange der Agent arbeitet, **Übernehmen** (oder **An Agenten zurückgeben**, wenn du steuerst), **Zurückholen** für eine Seite, die du ihm gegeben hast, und **Sitzung öffnen**. In der Desktop-App klickst du in seine Seite, um sie selbst zu bedienen; der Agent wartet.
- Die Spalte rechts zeigt die Unterhaltung der Sitzung, live, mit ihrem Nachrichtenfeld: Sieh ihm bei der Arbeit zu, antworte ihm oder schicke ihm eine Nachricht. **Sitzung öffnen** und **×** stehen oben.

**Esc**, das **×** des Chips, **Zurück zu deinen Tabs** oder ein Klick auf einen deiner Tabs bringt dich zu deinen eigenen Tabs zurück; die Spalte rechts zeigt wieder, was sie vorher zeigte, oder schließt sich.

## Den Browser einrichten

Öffne [Einstellungen → Funktionen → Browser](/settings?s=browser): „Ein Browser für Agenten, den du beobachten und übernehmen kannst“.

### Ein Browser für Agenten

[Ein Browser für Agenten](/settings?s=browser&find=A%20browser%20for%20agents) ist der Schalter neben dem Titel des Abschnitts. Er schaltet den Browser für alle Agenten ein oder aus. Er ist von selbst eingeschaltet, sobald ein Chromium gefunden wurde, und lässt sich erst einschalten, wenn eines da ist. Ist er ausgeschaltet, bekommen Agenten die Tools des Browsers nicht. Jeder Agent hat außerdem einen eigenen Schalter **Nutze einen Browser** unter [Erlaubte Werkzeuge](/guide/agents#what-it-may-use): Ein Agent, bei dem er aus ist, bekommt die Tools des Browsers nicht, egal was hier eingestellt ist.

### Chromium

[Chromium](/settings?s=browser&find=Chromium) zeigt das verwendete mit seiner Version und, unter (i), wo es liegt. Die App wählt in dieser Reihenfolge: in der Desktop-App **Der eigene Browser der Desktop-App**; ein auf diesem Computer installiertes Chrome oder Chromium, eines, das sie selbst heruntergeladen hat, dann eines, das Playwright (ein Tool zum Testen von Browsern) installiert hat. Findet sie mehr als eines, kannst du in einer Auswahl wählen: **Beste verfügbare Variante** oder ein bestimmtes.

Ohne Fund bietet die App den Download von Chrome for Testing mit etwa 170 MB in den App-Datenordner an. **Chrome herunterladen** startet ihn mit Fortschrittsbalken und Fehlerhinweis bei Problemen. Die Schaltfläche bleibt verfügbar, solange keine heruntergeladene Kopie existiert, auch bei anderweitig gefundenem Chromium.

Der eigene Browser der Desktop-App braucht keinen Download und hat keinen Pfad zum Anzeigen. Solange er verwendet wird, sagt die Zeile „Seiten werden im Fenster der App angezeigt.“, und **Chrome herunterladen** und **Ein Fenster anzeigen** erscheinen nicht, da keines von beiden für ihn etwas bedeutet. Wähle ein anderes Chromium, und sie kehren zurück. Die Seite Browser (dein eigener Browser) verwendet dieselbe Engine.

Kann Chromes Sandbox zur Abschirmung von Webseiten auf diesem Computer nicht laufen, weist die App darauf hin. Netzwerkzugriffe bleiben trotzdem gesperrt; beschränke Profile auf benötigte Websites.

### Browserfenster anzeigen

[Browserfenster anzeigen](/settings?s=browser&find=Show%20a%20window) ist zunächst aus: Der Browser läuft verborgen und wird in der App angezeigt. Aktiviert öffnet er zusätzlich ein echtes Fenster auf diesem Computer. Playwrights Headless Shell unterstützt kein Fenster; mit ihr bleibt die Option aus. Änderungen gelten beim nächsten Browserstart. Die Option erscheint nicht, solange der eigene Browser der Desktop-App verwendet wird.

### Zugriff auf diesen Computer und sein Netzwerk sperren

[Zugriff auf diesen Computer und sein Netzwerk sperren](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) ist standardmäßig aktiv. Webseiten dürfen weder diesen Computer noch private Netzwerkadressen wie Router, Drucker oder Hydor erreichen. Jede Verbindung wird geprüft, auch wenn ein Hostname erst später auf eine private Adresse zeigt. Eigene Entwicklungsserver bleiben nach Einzelfreigabe erreichbar; siehe [Lokale Websites oder Netzwerkadressen für eine Sitzung erlauben](/guide/web#let-a-session-open-a-site-on-this-computer-or-your-network). Bei deaktiviertem Schalter sind Netzwerkzugriffe möglich; Hydor selbst bleibt gesperrt.

### Screenshots für bildfähige Modelle

[Screenshots für bildfähige Modelle](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images) ist standardmäßig aktiv. Geeignete Modelle sehen die Seite mit nummerierten Markierungen. Reine Textmodelle erhalten immer eine Textansicht. Bei ausgeschalteter Option gilt das für alle Modelle.

### Vor dem Senden auf angemeldeten Websites fragen

[Vor dem Senden auf angemeldeten Websites fragen](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites) ist anfangs eingeschaltet. Bevor ein Agent auf einer Website, bei der er angemeldet ist, etwas sendet, veröffentlicht, löscht oder überweist, wirst du gefragt (siehe [Schaltflächen, die senden, veröffentlichen oder löschen](/guide/web#buttons-that-send-post-or-delete)). Ausgeschaltet drücken Agenten solche Schaltflächen ohne Nachfrage, auf Websites, bei denen ein Profil angemeldet ist, und auf einer Seite, die du ihnen übergeben hast. Zahlungen halten in beiden Fällen an.

### Websites erlauben oder sperren

Unter [Websites](/settings?s=browser&find=Sites) gelten zwei Listen für sämtliche Sitzungsbrowser. Schreibe eine Website pro Zeile, etwa example.com; Unterdomains sind eingeschlossen:

- **Nur diese Seiten**: Mit Einträgen dürfen nur diese Websites geöffnet werden; leer bedeutet alle.
- **Diese Websites ausschließen**: Von diesen Websites wird nichts geladen.

Nach Änderungen erscheint **Websites speichern** neben der Überschrift. Auch vollständige Adressen sind erlaubt; die App übernimmt nur den Host, aus „https://www.example.com/page“ wird example.com. Jede Sitzung ergänzt eigene Listen über **Websites für diese Sitzung** im Browsermenü.

### Anmeldungen mit Profilen behalten

Ein Profil ist ein eigener Browserordner, der Anmeldungen zwischen Sitzungen behält. So können Agenten angemeldete Websites nutzen, ohne dein Passwort zu sehen. Dein persönliches Chrome-Profil wird nie verwendet. Unter [Profile](/settings?s=browser&find=Profiles):

1. Wähle **Neues Profil**, gib etwa Arbeit oder Einkaufen als Namen ein und klicke **Hinzufügen**.
2. Im Fenster „Bei Websites anmelden · Arbeit“ gibst du etwa github.com/login ein und wählst **Öffnen**.
3. Bediene die Seite wie gewohnt und melde dich an. Auf dem Smartphone öffnet **Tastatur** die Bildschirmtastatur. Weitere Websites kannst du genauso öffnen.
4. Schließe das Fenster, wenn du fertig bist. Die Anmeldungen bleiben im Profil.

Um es zu verwenden, öffne den Browser einer Sitzung, dann **Browseroptionen** (⋯) → wähle das Profil unter **Profil**. Mit der Auswahl schließt sich der Browser. Beim nächsten Mal, wenn der Agent oder du ihn öffnest, öffnet er sich wieder, angemeldet, und das Fenster zeigt den Namen des Profils. Sitzungen, die dasselbe Profil verwenden, teilen seine Anmeldungen.

Jedes Profil bietet **Bei Websites anmelden** für weitere Anmeldungen und ein **⋯**-Menü mit **Umbenennen** und **Löschen**. Löschen entfernt Anmeldungen und alle Browserdaten dieses Profils und schließt verwendende Browser. Ohne Profile erklärt die Liste, dass jeder Sitzungsbrowser ohne Anmeldung neu startet.

### Dein eigenes Surfen

In der Desktop-App hat [Einstellungen → Browser](/settings?s=browser) außerdem eine Gruppe **Dein eigenes Surfen** („Die Browser-Seite: Seiten, die du selbst nutzt und die Agenten nie erhalten“) mit drei Zeilen, die die Bereiche der Seite Browser öffnen: [Lesezeichen](/settings?s=browser&find=Bookmarks) („Deine eigenen, zusammen mit denen der anderen Browser auf diesem Computer“), [Erweiterungen](/settings?s=browser&find=Extensions) („Chrome-Erweiterungen in der Desktop-App“) und [Browser-Einstellungen](/settings?s=browser&find=Browser%20settings) („Startseite, Suchmaschine, Übersetzung, dunkle Seiten, Werbeblocker, Verlauf und das Löschen dessen, was der Browser gespeichert hat“). Anderswo wird die Gruppe nicht gezeigt. Siehe [Lesezeichen](/guide/web#bookmarks), [Chrome-Erweiterungen](/guide/web#chrome-extensions) und [Browser-Einstellungen](/guide/web#browser-settings).

## Agenten deinen Computer bedienen lassen

In der Desktop-App können Agenten auf einem Mac, unter Windows und unter Linux auch den Computer selbst bedienen, wie eine Person davor: Sie sehen seinen Bildschirm und benutzen Maus und Tastatur, in jeder App (Notizen oder Kalender auf einem Mac, Editor oder Excel unter Windows, Dateien unter Linux, eine App, die der Browser nicht erreichen kann). Bei Websites bleiben sie beim Browser, der schneller und sicherer ist. Die Computersteuerung ist anfangs ausgeschaltet. Jeder Agent hat außerdem einen eigenen Schalter **Nutze den Computer** unter [Erlaubte Werkzeuge](/guide/agents#what-it-may-use): Ein Agent, bei dem er aus ist, kann den Computer nicht bedienen, auch wenn die Computersteuerung eingeschaltet ist.

### Computer Use aktivieren

Öffne [Einstellungen → Funktionen → Computer Use](/settings?s=computer) mit „Agenten sehen deinen Bildschirm und bedienen Maus und Tastatur in der Desktop-App“. Aktiviere [**Computer Use**](/settings?s=computer&find=Computer%20use) neben der Überschrift. Je nach System gilt anschließend:

- **Auf einem Mac** erteilst du Hydor die zwei Berechtigungen von macOS. Drücke neben [**Barrierefreiheit**](/settings?s=computer&find=Accessibility), der Berechtigung von macOS zur Nutzung von Maus und Tastatur, auf **Erlauben…**. macOS fragt, ob Hydor diesen Computer steuern darf, und seine Systemeinstellungen öffnen sich bei **Datenschutz & Sicherheit → Bedienungshilfen**: Schalte dort **Hydor** ein. Drücke neben [**Bildschirmaufzeichnung**](/settings?s=computer&find=Screen%20Recording), der Berechtigung von macOS zum Sehen des Bildschirms, auf **Erlauben…** und schalte **Hydor** unter **Bildschirmaufzeichnung** ein (**Bildschirm- & Systemaudioaufnahme** ab macOS 15). Wenn macOS verlangt, Hydor zu beenden und neu zu öffnen, tu das: Laufende Agenten arbeiten weiter. Eine Berechtigung, die macOS erteilt hat, zeigt **Erlaubt** und bleibt bei Updates der App erhalten. Wenn die Systemeinstellungen **Hydor** als eingeschaltet zeigen, die Einstellungen aber weiter **Erlauben…** sagen, stammt dieser Schalter aus einer früheren Version (vor 0.28.1 brauchte jedes Update die Berechtigungen erneut): Drücke **Erlauben…**, was ihn zurücksetzt, und schalte **Hydor** noch einmal ein.
- **Windows**: Keine zusätzliche Freigabe nötig. Programme mit Administratorrechten und der gesperrte Bildschirm sind nicht erreichbar.
- **Linux**: Erforderlich sind ein X11- beziehungsweise Xorg-Desktop und Python 3, das meist vorhanden ist. Wayland, heute bei vielen GNOME- und KDE-Systemen Standard, erlaubt anderen Apps keinen solchen Bildschirm-, Maus- und Tastaturzugriff. Die Einstellungen erklären das und den Wechsel zu X11. Unter Ubuntu wählst du am Anmeldebildschirm über das Zahnrad **Ubuntu on Xorg**.

Verhindert etwas Computer Use, nennt ein gelbes Feld oben den Grund. Bei deaktiviertem Schalter steht dort, dass Agenten den Computer nicht bedienen können. Die Einstellungsseite ist überall vorhanden, die Funktion selbst nur in der Desktop-App; anderswo erklärt ein Hinweis diese Einschränkung.

### Was Agenten am Computer tun können

Beim ersten gewünschten Computerzugriff pro Sitzung fragt eine Karte „Darf der Agent deinen Mac bedienen?“, unter Windows „deinen PC“ und unter Linux „deinen Computer“. **Für diese Sitzung erlauben** und **Nicht jetzt** beantworten die Anfrage. Die Sitzung wartet, und du wirst benachrichtigt. Nach Freigabe kann der Agent:

- den verkleinerten Hauptbildschirm sehen, keine weiteren Bildschirme;
- klicken, doppelklicken, rechtsklicken, ziehen, scrollen und den Zeiger bewegen;
- Text in beliebigen Sprachen eingeben und Tastenkombinationen drücken, etwa ⌘C am Mac oder Strg+C unter Windows und Linux;
- eine App über ihren Namen öffnen, so wie ihn das Startmenü oder das Anwendungsmenü zeigt.

Während der Bedienung leuchten auf allen Bildschirmen die Ränder. Unten steht „Ein Agent bedient deinen Mac“ beziehungsweise PC oder Computer sowie „Esc zum Stoppen“. Die Anzeige lässt Klicks durch und erhält nie den Tastaturfokus. Sie ist nur für dich sichtbar: Für Agentenscreenshots wird sie kurz ausgeblendet. Unter Linux benötigt sie einen Desktop mit Fenster-Compositing, etwa GNOME, KDE, Xfce, Cinnamon oder MATE. Ohne diesen Effekt meldet immerhin das Tray-Symbol die aktive Bedienung.

### Den Zeiger auf deinem Bildschirm verfolgen

Der Agent bewegt deinen echten Mauszeiger, der leicht zu übersehen ist. Deshalb umgibt ihn ein großer Ring mit weichem Leuchtrand in den Anzeigefarben und einer **Agent**-Kennzeichnung:

- der Mauszeiger gleitet in einer Viertelsekunde zu jeder Stelle, statt dorthin zu springen, und der Ring bewegt sich mit, damit dein Auge folgen kann;
- Ein Klick erzeugt eine Welle, ein Rechtsklick eine gestrichelte, ein Doppelklick zwei. Beim Ziehen zieht sich der Ring zusammen und folgt der Bewegung.
- Eingegebener Text und gedrückte Tasten wie Strg+S oder Enter erscheinen kurz neben der Kennzeichnung. Pfeile zeigen Scrollrichtungen.

Der Ring gehört zur Randanzeige: Klicks gehen hindurch, er erhält keinen Tastaturfokus, erscheint nicht auf Agentenscreenshots und benötigt unter Linux Fenster-Compositing.

Jeder Schritt steht in der Unterhaltung mit einem kleinen Screenshot danach. Ein Klick auf das Bild vergrößert es; die Zeile öffnet das vollständige Tool-Ergebnis. Im großen Bild markieren Ringe Klicks, bei Doppel- und Rechtsklick entsprechend doppelt oder gestrichelt, Linien Ziehbewegungen und Pfeile Scrollen. Mehrere Aktionen werden nummeriert. Die App speichert die letzten 200 Schrittbilder je Sitzung und entfernt sie nach einem Monat ohne Sitzungsnutzung.

Agenten sollen vor dem Handeln den Bildschirm ansehen, für Websites den Browser verwenden und niemals Passwörter, Kartennummern oder Codes eintippen beziehungsweise zahlen, kaufen oder Geld versenden. Dafür stoppen sie und bitten dich um Übernahme. Nur eine Sitzung darf den Computer gleichzeitig bedienen.

### Computer Use sofort stoppen

Solange ein Agent den Computer bedient, sind das Leuchten und sein Hinweis zu sehen, das Symbol der App zeigt es an (auf einem Mac steht daneben in der Menüleiste „Agent verwendet deinen Mac“), und seine Sitzung zeigt über dem Nachrichtenfeld „Der Agent verwendet deinen Mac“ (deinen PC, deinen Computer). Um ihn sofort zu stoppen:

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
- „Frag mich nicht mehr, bevor Agenten auf Websites, bei denen sie angemeldet sind, Senden oder Löschen drücken.“ (Es ist Einstellungen → Browser → Vor dem Senden auf angemeldeten Websites fragen; schalte es auf dieselbe Weise wieder ein.)
- „Ist der Browser meiner Agenten der eigene Browser der Desktop-App oder ein Chromium?“
- „Wie gebe ich einem Agenten die Seite, die ich auf der Seite Browser ansehe?“ (**Zu dieser Seite fragen** gibt ihm eine Kopie; **Erledigen** unter „Fragen“ gibt ihm einen eigenen Tab bei der Seite.)
- „Lass einen Agenten das Formular auf dieser Seite für mich ausfüllen.“ (**Fragen** in der Leiste, dann **Erledigen**; er bekommt einen eigenen Tab, auf dieser Website als du angemeldet, und fragt nach, bevor er etwas sendet)
- „Wie durchsuche ich YouTube oder Wikipedia direkt aus der Adressleiste?“ (ein Suchkürzel: tippe `yt` oder `wiki`, ein Leerzeichen und deine Wörter; unter **Browser-Einstellungen** → **Suchkürzel** fügst du eigene hinzu)
- „Zeig Webseiten standardmäßig größer und schalte die Rechtschreibprüfung aus.“ (**Browser-Einstellungen** → **Seiten** → **Seitenzoom** und **Rechtschreibung prüfen**)
- „Mach die Spalte neben der Seite breiter.“ (zieh an ihrem linken Rand; ein Doppelklick stellt ihre Breite wieder her)
- „Auf welche Tasten reagiert mein Browser?“ (**Menü** → **Tastenkombinationen**)
- „Setze example.org/reports in einen Ordner namens Arbeit in meiner Lesezeichenleiste.“
- „Wie ändere ich die Suchmaschine oder die Startseite meines Browsers?“ (Es ist **Menü** → **Einstellungen** auf der Seite Browser: deine Sache, Agenten können es nicht.)
- „Wie erlaube ich Werbung auf einer Website in meinem Browser?“ (der Schalter **Werbung auf dieser Website blockieren** am Schild, ausgeschaltet)
- „Wie lösche ich meinen Browserverlauf und meine Cookies?“ (**Browser-Einstellungen** → **Browserdaten löschen**; der Zeitraum gilt nur für den Verlauf und die dazugehörige Download-Liste)
- „Warum schlägt die Adressleiste eine Seite vor, die ich besucht habe und die keines der getippten Wörter enthält?“ (bei eingeschalteter Bedeutungssuche bietet sie auch Seiten an, in denen es um das Getippte geht)
- „Wie lege ich meine Tabs in Gruppen, und was sendet Meine Tabs mit KI gruppieren?“ (Rechtsklick auf einen Tab → **Zu Gruppe hinzufügen**; der KI-Button sendet Tab-Titel und Adressen, ohne alles nach einem ? oder #, an das Hilfsmodell, nur wenn du ihn drückst)
- „Wie öffne ich einen Tab wieder, den ich geschlossen habe?“ (**Strg+Umschalt+T** oder **Zuletzt geschlossen** im Verlauf)
- „Wie markiere ich Wörter auf einer Seite und finde sie wieder?“ (auswählen, Rechtsklick, **Markieren**; **Menü** → **Markierungen** hat sie)
- „Blockiert mein Browser YouTube-Werbung?“ (ja, bei eingeschaltetem **Werbung und Tracker blockieren**: Die Seitenkorrekturen von uBlock Origin entfernen die Videowerbung auf YouTube und werden etwa alle 8 Stunden aktualisiert)
- „Woher kommen die Listen des Werbeblockers, und wie oft werden sie aktualisiert?“ (von ihren Herausgebern, jede wird erneut geladen, wenn sie abläuft: die schnellen Korrekturen von uBlock Origin etwa alle 8 Stunden, die anderen alle paar Tage; **Jetzt aktualisieren** unter **Browser-Einstellungen** → **Werbung** lädt sie sofort)
- „Warum sagt eine Website, dass ich einen Werbeblocker benutze, und was kann ich tun?“ (manche Websites bemerken ihn; erlaube ihre Werbung mit dem Schalter **Werbung auf dieser Website blockieren** am Schild, ausgeschaltet, und die Seite lädt neu)
- „Wie sehe ich, wie viel Werbung mein Browser blockiert hat?“ (die Zahl am Schild gilt für diese Seite; ein Klick darauf zeigt, was auf der Website insgesamt blockiert wurde, und **Statistiken** öffnet den **Werbeblocker** mit den letzten 30 Tagen)
- „Was behält ein privater Tab, und was vergisst er?“ (Anmeldungen, Cookies und Websitedaten sind getrennt und werden vergessen, wenn der letzte private Tab sich schließt; seine Seiten stehen nicht im Verlauf; Downloads, Lesezeichen und was du speicherst, bleiben trotzdem)
- „Übersetze diese Seite ins Englische, und übersetze japanische Seiten immer.“ (die Übersetzen-Schaltfläche in der Adressleiste; **Immer übersetzen** steht in den **Browser-Einstellungen** → **Übersetzung**; die Wörter der Seite gehen an das Hilfsmodell)
- „Wie lese ich einen Artikel ohne den Wirrwarr, in größerer Schrift?“ (die Buch-Schaltfläche in der Adressleiste, dann **Aa**)
- „Zeige Webseiten dunkel, außer eine Website.“ (**Menü** → **Dunkle Seiten**, dann das Schloss dieser Website → **Dunkle Seiten auf dieser Website**)
- „Wie speichere ich eine ganze Webseite als Bild oder als PDF?“ (**Menü** → **Screenshot oder PDF** → **Screenshot der ganzen Seite** oder **Als PDF speichern …**; beides landet in Downloads)
- „Wie sortiere ich meine Lesezeichen mit KI in Ordner, und was sendet das?“ (**Mit KI organisieren** im Bereich Lesezeichen; die Titel und Adressen deiner Lesezeichen, ohne alles nach einem ? oder #, und die Namen deiner Ordner gehen an das Hilfsmodell, nur wenn du **Organisieren** drückst; **Rückgängig machen** stellt sie wieder her)
- „Wie finde ich ein Lesezeichen?“ (**Lesezeichen durchsuchen** oben im Bereich Lesezeichen)
- „Wie merke ich mir eine Seite zum späteren Lesen, und wo finde ich die Liste?“ (**Menü** → **Später lesen** → **Diese Seite hinzufügen**, oder Rechtsklick → **Diese Seite später lesen**; die Liste ist in diesem Bereich und unter den Tabs)
- „Speichere diese Seite in meinem Projekt Abschlussarbeit.“ (**Speichern**, mit **Abschlussarbeit** im **▾** daneben; die Kopie liegt in den **Dateien** des Projekts)
- „Importiere meine Lesezeichen aus Chrome und Firefox in die Seite Browser.“ (oder: „Warum kann ich meine Safari-Lesezeichen nicht importieren?“)
- „Importiere meinen Chrome-Verlauf in die Seite Browser.“ (oder: „Warum kann ich meinen Safari-Verlauf nicht importieren?“)
- „Welche Chrome-Erweiterungen sind in meinem Browser, und welche davon laufen auch in den Browsern der Agenten?“
- „Füge die Erweiterung unter https://chromewebstore.google.com/detail/… zu meinem Browser hinzu.“ (Die App fragt dich jedes Mal zuerst.)
- „Lass nur meinen Passwortmanager in der Symbolleiste und die anderen Erweiterungen im Menü Erweiterungen.“ (die Nadel neben jeder Erweiterung im Menü der Schaltfläche **Erweiterungen**)
- „Fülle für mich das Bibliotheksausweisformular auf riverside.example.org aus. Ich schaue zu.“ Der Live-Zeiger zeigt seine Klicks und Eingaben.
- „Öffne Notizen auf meinem Mac und lege eine Notiz mit der heutigen Einkaufsliste an.“
- „Öffne Editor und schreibe die heutige Einkaufsliste auf.“ Unter Windows zeigt der leuchtende Rand die Arbeit an, der Ring markiert den Zeiger und Esc stoppt sie.
