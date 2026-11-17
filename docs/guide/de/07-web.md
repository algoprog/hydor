# Suche und Browser

Agenten können unabhängig vom Modell im Web suchen, Seiten lesen und einen echten Browser bedienen. Dieser Beitrag erklärt Suchanbieter und Einrichtung, die Suchschritte in der Unterhaltung und Quellenangaben sowie die Live-Ansicht des Browsers und seine Übernahme für Anmeldungen, Prüfungen oder Zahlungen. Er behandelt auch die Seite „Browser“, einen eigenen Browser in der Desktop-App (Tabs, eine intelligente Adressleiste, Lesezeichen, Verlauf, ein Werbeblocker, Chrome-Erweiterungen), und wie du einem Agenten eine Seite daraus übergibst. In der Desktop-App für Mac, Windows und Linux läuft der Browser in der App, und Agenten können auch Bildschirm, Maus und Tastatur deines Computers verwenden.

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

Ein Agent kann Dateien nur aus dem Ordner der Sitzung an das Upload-Feld einer Seite anhängen. Soll er eine andere Datei hochladen, kopiere sie zuerst in diesen Ordner (siehe [System: Dateien, Git, Terminal und Vorschau](/guide/files-git)).

## Wann der Browser schließt

Ein Sitzungsbrowser schließt automatisch:

- nach 15 Minuten ohne Bedienung oder Zuschauer, beziehungsweise nach zwei Stunden, wenn er auf dich wartet oder du steuerst;
- beim Schließen des letzten Tabs;
- beim Stoppen des Agentenprogramms oder Löschen der Sitzung;
- wenn du ein anderes Profil dafür wählst oder das Profil löschst, das er verwendet.

Alles, was noch auf dich gewartet hat, endet damit. Der Agent öffnet den Browser erneut, wenn er ihn das nächste Mal braucht.

In der Desktop-App braucht der Browser eines Agenten das Fenster der App nicht: Er arbeitet weiter, während das Fenster geschlossen oder verborgen ist, solange die App läuft (sie bleibt in der Menüleiste, im Infobereich oder im Tray). Öffne das Fenster, und seine Seiten sind zum Zusehen da.

## Dein eigener Browser

Die Seite **Browser** ist ein eigener Browser in der Desktop-App (Mac, Windows, Linux) neben dem, den Agenten benutzen: Öffne **Browser** bei den Werkzeugen der Seitenleiste oder gehe zu [Browser](/browser). Sie gibt es nur in der Desktop-App: Die Web-App in einem Browser und ein Smartphone haben keine Schaltfläche **Browser**, und die Adresse [Browser](/browser) sagt das dort. Die Browser der Agenten funktionieren überall, und du kannst ihnen in ihren Sitzungen zusehen.

Sie hat Tabs, eine Adressleiste, die vervollständigt, was du tippst, und auch sucht, eine Schaltfläche Startseite, Zurück, Vorwärts und Neu laden, Lesezeichen, Verlauf, Chrome-Erweiterungen, einen Blocker für Werbung und Tracker, Suche auf der Seite, Zoom, Drucken, Downloads und eine Liste der Tabs der Agenten. Ihre Tabs sind echte Seiten im Fenster der App, mit der Geschwindigkeit und den Tasten jedes Browsers, und sie verbinden sich direkt mit den Websites, wie in jedem Browser. Ein Menü oder Dialog der App, der sich über der Seite öffnet, nimmt sie kurz weg (ein Bild davon steht, bis er sich schließt). Deine Anmeldungen bleiben zwischen den Besuchen erhalten, in einem eigenen Profil, das kein Agent wählen kann, und beim nächsten Öffnen sind deine Tabs wieder da (bis zu 30; leere werden weggelassen). Deine Tabs können auch Adressen auf diesem Computer und in seinem Netzwerk öffnen (etwa eine Website, die du gerade baust). Kann der Browser nicht starten, nennt die Seite den Grund, mit **Erneut versuchen** und **Browser-Einstellungen**, das [Einstellungen → Browser](/settings?s=browser) öffnet.

### Tabs und Adressleiste

- Die Tableiste über der Adressleiste zeigt Symbol, Titel und **×** jedes Tabs. **+** (**Neuer Tab**) öffnet deine Startseite. Ein Mittelklick schließt einen Tab. Schließt du den letzten Tab, bleibt ein leerer.
- Ein Tab, der Ton abspielt, zeigt einen Lautsprecher: Klicke darauf, um den Tab stummzuschalten, und noch einmal, um ihn wieder zu hören. Ein stummgeschalteter Tab behält seinen Lautsprecher.
- Die Adressleiste zeigt die Adresse der Seite. Gib eine Adresse mit oder ohne https:// ein (`example.com`, `localhost:3000`, `192.168.1.5`, eine `file://`-Adresse) und drücke Enter, um sie zu öffnen. Alles andere, was du eingibst, wird mit deiner Suchmaschine gesucht (zuerst Google; siehe [Browser-Einstellungen](/guide/web#browser-settings)). **Alt+Enter** oder Strg+Enter (⌘+Enter auf dem Mac) öffnet es stattdessen in einem neuen Tab.
- **Zurück**, **Vorwärts**, **Neu laden** und **Startseite** stehen links der Adressleiste. Während eine Seite lädt, wird aus Neu laden **Stoppen**. **Startseite** öffnet deine Startseite im geöffneten Tab.
- Der Stern am Ende der Adressleiste setzt ein Lesezeichen für die Seite in der Lesezeichenleiste; ausgefüllt ist sie als Lesezeichen gesetzt, und ein erneuter Klick entfernt das Lesezeichen.
- **Menü** (⋯) bietet **Zu dieser Seite fragen**, **Hier erledigen lassen**, **Auf der Seite suchen**, **Drucken …**, **In deinem Standardbrowser öffnen**, **Lesezeichen**, **Verlauf**, **Erweiterungen**, **Downloads**, **Tabs der Agenten**, **Website-Berechtigungen** und **Einstellungen**. **In deinem Standardbrowser öffnen** öffnet die Seite in dem Browser, den dein Computer für Links verwendet.
- Ist der geöffnete Tab die Chrome-Web-Store-Seite einer Erweiterung, erscheint in der Leiste die Schaltfläche **Zu Hydor hinzufügen** (siehe [Chrome-Erweiterungen](/guide/web#chrome-extensions)).

Ein Link auf `/browser?url=https://example.com` öffnet die Seite Browser mit dieser Adresse in einem neuen Tab.

### Vorschläge

Während du in die Adressleiste tippst, bietet eine Liste darunter an, mit den getippten Wörtern fett:

- deine geöffneten Tabs („Zum Tab wechseln“: Wähle einen, um zu ihm zu gehen, statt die Seite erneut zu öffnen),
- deine Lesezeichen und die Seiten deines Verlaufs, die zu den Wörtern in ihren Titeln und Adressen passen, die du oft und zuletzt besucht hast zuerst (Adressen, die du selbst getippt hast, zählen am meisten),
- bei eingeschaltetem [Nach Bedeutung suchen](/settings?s=memory&find=Search%20by%20meaning) Lesezeichen und Seiten deines Verlaufs, in denen es um das Getippte geht, auch wenn ihre Titel und Adressen dessen Wörter nicht enthalten, nach denen, die sie enthalten (sie erscheinen ohne fette Wörter). Das Modell, das sie findet, läuft auf diesem Computer, mit einem Vektor aus Titel und Adresse jeder Seite (ohne ihren Query-String), den die App getrennt von allem anderen in ihrer Datenbank aufbewahrt; er verschwindet mit der Seite,
- das, was du getippt hast, als Suche („Mit Google suchen“) oder, wenn es wie eine Adresse aussieht, als diese Adresse,
- die eigenen Vorschläge der Suchmaschine, wenn [Suchvorschläge](/guide/web#browser-settings) eingeschaltet ist,
- zuletzt **Agenten fragen: „…“**, das eine Sitzung mit dem Getippten als erster Nachricht startet, mit dem Agenten und Modell, die die Startseite zuletzt verwendet hat, und dich dorthin bringt.

Die Liste zeigt so viele Einträge, wie auf den Bildschirm passen, darunter mindestens zwei deiner Seiten und zwei Vorschläge der Suchmaschine, soweit es so viele gibt. Die Pfeiltasten bewegen sich darin, und **Enter** öffnet den markierten (das Getippte, wenn keiner markiert ist); **Alt+Enter** oder Strg+Enter (⌘+Enter auf dem Mac) öffnet ihn in einem neuen Tab. Die Adressleiste vervollständigt auch an Ort und Stelle: Beginnt etwas, wohin du gegangen bist, mit dem Getippten, steht der Rest markiert hinter deinem Cursor (gefunden über die getippten Wörter, nie über die Bedeutung), und **Tab** oder **→** übernimmt ihn. Löschst du das Getippte, wird die Vervollständigung ausgeschaltet. **Umschalt+Entf** bei einem Verlaufsvorschlag vergisst diese Seite, und **Esc** schließt die Liste.

### Tastenkürzel

Auf der Seite Browser, auch aus einer Seite heraus, mit Strg unter Windows und Linux und ⌘ auf dem Mac:

- **Strg+T** öffnet einen neuen Tab, und **Strg+W** schließt den geöffneten.
- **Strg+Umschalt+T** öffnet den zuletzt geschlossenen Tab wieder; drücke es noch einmal für den davor.
- **Strg+Tab** geht zum nächsten Tab und **Strg+Umschalt+Tab** zum vorigen. **Strg+1** bis **Strg+8** gehen zu diesem Tab und **Strg+9** zum letzten.
- **Strg+L** springt in die Adressleiste.
- **Strg+R** (auch **F5**) lädt neu.
- **Alt+←** und **Alt+→** gehen zurück und vor (auf dem Mac auch **⌘[** und **⌘]**).
- **Strg+F** öffnet die Suche auf der Seite, und **Esc** schließt sie.
- **Strg+D** setzt ein Lesezeichen für die Seite.
- **Strg+H** öffnet den Verlauf und **Strg+J** die Downloads.
- **Strg+P** druckt die Seite.
- **Strg+Umschalt+Entf** öffnet die Einstellungen bei **Browserdaten löschen**.
- **Strg** mit **+**, **−** und **0** vergrößert, verkleinert und geht zurück auf 100 % (siehe [Zoom, Drucken und Vollbild](/guide/web#zoom-print-and-full-screen)).

### Auf einer Seite suchen

**Strg+F** oder **Auf der Seite suchen** im Menü öffnet eine Leiste unter der Adressleiste. Tippe, und der erste Treffer wird gefunden und ins Bild gescrollt, sobald du pausierst. **Enter** springt zum nächsten Treffer und **Umschalt+Enter** zum vorigen (die Pfeile ebenso), und die Leiste sagt, bei welchem Treffer du bist („3 von 12“, „1000+“ ab tausend), oder „Keine Übereinstimmungen“. Groß- und Kleinschreibung spielt keine Rolle, außer du drückst **Groß- und Kleinschreibung beachten**, und die Suche beginnt am Ende von vorn. **Esc** oder **×** schließt die Leiste und löscht, was gefunden wurde.

### Zoom, Drucken und Vollbild

- **Zoom**: **Strg** mit **+** vergrößert, **−** verkleinert und **0** geht zurück auf 100 %, in den Stufen, die Chrome verwendet (25 % bis 500 %). Auch Strg und das Mausrad zoomen. Ein Zoom ungleich 100 % erscheint als Chip am Ende der Adressleiste, etwa „125%“: Klicke darauf, um zurück auf 100 % zu gehen.
- **Drucken**: **Strg+P** oder **Drucken …** im Menü oder **Print…** im Rechtsklickmenü öffnet den Druckdialog deines Computers für die Seite, mit ihren Hintergründen.
- **Vollbild**: Möchte ein Video oder eine Seite den Bildschirm füllen, geht das Fenster der App in den Vollbildmodus, und die Seite füllt es. Der eigene Ausweg der Seite (Esc) bringt das Fenster zurück.

### Rechtsklickmenü

Ein Rechtsklick auf einer Seite öffnet ein Menü, auf Englisch, mit dem, was dort passt, wo du geklickt hast:

- In einem Textfeld: Rechtschreibvorschläge für ein falsch geschriebenes Wort, mit **Add to dictionary**; dann **Undo**, **Redo**, **Cut**, **Copy**, **Paste** und **Select all**.
- Bei einem Link: **Open link in new tab**, **Open link in your default browser** und **Copy link address**.
- Bei einem Bild: **Open image in new tab**, **Save image as…**, **Copy image** und **Copy image address**.
- Bei markiertem Text: **Copy**, **Search**, das ihn mit deiner Suchmaschine sucht (es öffnet sich in einem neuen Tab), und **Ask an agent about**, das den Kasten **Zu dieser Seite fragen** mit den markierten Wörtern und der Adresse der Seite ausgefüllt öffnet (siehe [Zu dieser Seite fragen](/guide/web#ask-about-this-page)).
- Auf der Seite selbst, abseits von Feld oder markiertem Text: **Back**, **Forward** und **Reload**.
- Immer: **Bookmark this page**, **Print…** und **Inspect**, das die Entwicklerwerkzeuge der Seite öffnet.

Die eigenen Einträge einer Erweiterung werden nie gezeigt (siehe [Was möglicherweise nicht funktioniert](/guide/web#what-may-not-work)).

### Verlauf

Drücke **Strg+H** oder **Menü** (⋯) → **Verlauf** oder gehe zu [Verlauf](/browser?panel=history). Der Bereich listet die Seiten auf, die du in deinem eigenen Browser besucht hast, die neuesten zuerst, nach Tag („Heute“, „Gestern“, dann das Datum), jede mit Uhrzeit, Website-Symbol, Titel und Adresse.

- Das Suchfeld **Verlauf durchsuchen** findet Seiten anhand der Wörter in ihren Titeln und Adressen.
- Klicke auf eine Seite, um sie im geöffneten Tab zu öffnen, oder Strg+Klick (⌘+Klick auf dem Mac) für einen neuen Tab. **×** neben einer nimmt sie aus dem Verlauf. **Ältere anzeigen** lädt mehr.
- **Zuletzt geschlossen** (wenn du nicht suchst) listet Tabs auf, die du kürzlich geschlossen hast: Klicke auf einen, um ihn wieder zu öffnen. **Strg+Umschalt+T** öffnet den neuesten.
- **Browserdaten löschen …** öffnet die Einstellungen an dieser Stelle.

Dein Verlauf bleibt auf diesem Computer, in der eigenen Datenbank der App, und nur dein eigenes Surfen trägt zu ihm bei: Webseiten und Dateien, die Seite, auf der jeder Tab landet, und sein Titel, sobald er feststeht. Die letzten 20.000 Seiten bleiben erhalten; die ältesten gehen zuerst. Agenten sehen ihn nie. Auf ihn stützen sich die [Vorschläge](/guide/web#suggestions) der Adressleiste.

Die Dateien, die dein Browser herunterlädt, werden ebenfalls in einer Liste gespeichert: jeweils Name, Speicherort und die Adresse, von der sie kam, die letzten 5.000. **Browserdaten löschen** mit angehaktem **Browserverlauf** leert auch diese Liste, für denselben Zeitraum (die Dateien bleiben dort, wo sie gespeichert wurden), und eine Seite, ein Lesezeichen oder ein Download, der verschwindet, nimmt seinen Platz in der Bedeutungssuche mit. Die Suche (Strg+K) findet deinen Verlauf, deine Lesezeichen und Downloads über ihre Wörter und über das, worum es in ihnen geht, unter **Browser** in **Suchen in** (siehe [Alles mit Strg+K durchsuchen](/guide/start#search-everything-with-ctrlk)). Agenten sehen nichts davon.

### Browser-Einstellungen

**Menü** (⋯) → **Einstellungen** oder [Einstellungen → Browser → Dein eigenes Surfen → Browser-Einstellungen](/settings?s=browser&find=Browser%20settings) oder [Browser-Einstellungen](/browser?panel=settings) öffnet einen Bereich mit:

- **Startseite**: die Webadresse, die die Schaltfläche Startseite und neue Tabs öffnen (zuerst https://www.google.com/). **Aktuelle Seite verwenden** setzt sie auf die Seite, auf der du bist.
- **Suchmaschine**: womit die Adressleiste sucht: Google (zuerst), DuckDuckGo, Bing, Brave, Ecosia, Startpage oder **Custom**, eine eigene Adresse mit %s an der Stelle deiner Suchwörter, etwa `https://example.com/search?q=%s`.
- **Suchvorschläge** (zuerst eingeschaltet): Was du in die Adressleiste eingibst, geht beim Tippen wie in jedem Browser an deine Suchmaschine, damit sie Suchen vorschlagen kann. Startpage und eine eigene Adresse liefern keine. Schalte es aus, um das Getippte auf diesem Computer zu behalten; deine geöffneten Tabs, Lesezeichen und dein Verlauf erscheinen weiterhin.
- **Werbung und Tracker blockieren** (zuerst eingeschaltet), siehe unten.
- **Browserdaten löschen**: Hake **Browserverlauf**, **Cookies und Websitedaten** (du wirst von Websites abgemeldet) und **Zwischengespeicherte Dateien** an, wähle einen Zeitraum (**Letzte Stunde**, **Letzte 24 Stunden**, **Letzte 7 Tage** oder **Gesamter Zeitraum**) und drücke **Daten löschen**. Der Zeitraum gilt nur für den Verlauf (und die dazugehörige Download-Liste): Cookies, Websitedaten und zwischengespeicherte Dateien werden immer für den gesamten Zeitraum gelöscht.

### Werbung und Tracker blockieren

Dein eigener Browser blockiert Werbung und Tracker, wie es ein Werbeblocker tut: Er hält die Anfragen bekannter Werbe- und Trackingserver davon ab, hinauszugehen, und blendet die leeren Stellen aus, die übrig bleiben. Er nutzt die Listen von Ghostery für Werbung und Tracker (EasyList, EasyPrivacy und andere), die die App beim ersten Start deines Browsers von GitHub herunterlädt und jede Woche aktualisiert (gelingt das nicht, behält sie die Listen, die sie hat); dabei wird nichts über dich gesendet. In den Browsern der Agenten blockiert er nichts. **Werbung und Tracker blockieren** in den [Einstellungen des Browsers](/guide/web#browser-settings) schaltet ihn aus.

Ist er eingeschaltet, läuft eine Chrome-Erweiterung, die Anfragen blockiert (ein eigener Werbeblocker), möglicherweise nicht; schalte den Blocker aus, um ihr die Seite zu überlassen.

Damit eine Website ihre Werbung zeigen darf, klicke auf das Schloss in der Adressleiste und drücke **Werbung auf dieser Website erlauben** (auch für ihre Subdomains); die Seite lädt neu. **Werbung auf dieser Website blockieren** nimmt es zurück.

### Das Schloss

Das Schloss am Anfang der Adressleiste zeigt, ob die Verbindung zur Website sicher ist („Nicht sicher“, mit offenem Schloss, bei einer http-Seite). Klicke darauf, um die Website zu sehen, ob ihre Verbindung sicher ist, was du für sie erlaubt oder blockiert hast (jeweils mit **Vergessen**, damit sie wieder fragt) und, bei eingeschaltetem Blocker, wie viele Werbungen und Tracker auf dieser Seite blockiert wurden, mit **Werbung auf dieser Website erlauben** oder **Werbung auf dieser Website blockieren**.

### Downloads

Eine Datei, die eine Seite herunterlädt, wird im Ordner Downloads des Computers gespeichert, auf dem die App läuft, und steht unter **Menü** (⋯) → **Downloads** als „Wird heruntergeladen…“, „Fertig“ oder „Fehlgeschlagen“, mit ihrem Pfad. Klicke auf eine fertige, um sie in ihrem Ordner zu zeigen.

### Wenn eine Website eine Berechtigung anfragt

Möchte eine Seite in deinem eigenen Browser deine Kamera, dein Mikrofon, deinen Standort, Benachrichtigungen, deine Zwischenablage oder Ähnliches verwenden, sagt das eine Leiste über der Seite („example.com möchte deine Kamera verwenden“) mit **Nicht zulassen** und **Erlauben**. Deine Antwort wird für diese Website gemerkt, sodass sie nur einmal fragt; um zu sehen, was du erlaubt oder blockiert hast, oder um wieder gefragt zu werden, öffne das Schloss oder **Menü** (⋯) → **Website-Berechtigungen** und drücke **Vergessen** neben einer Antwort. Die Browser der Agenten dort lehnen jede solche Anfrage selbst ab, außer um den Bildschirm zu füllen und in deine Zwischenablage zu kopieren. Eine Dialogfrage der Seite (eine Warnung, eine Ja-Nein-Frage oder eine Texteingabe) erscheint über der Seite wie im Browser der Agenten (siehe [Dialogfragen einer Webseite beantworten](/guide/web#answer-a-pages-pop-up-questions)).

## Lesezeichen

Die Lesezeichenleiste steht unter der Adressleiste, sobald du ein Lesezeichen darauf hast (auf dem Smartphone fehlt sie; deine Lesezeichen stehen im Menü). Klicke auf ein Lesezeichen, um es im geöffneten Tab zu öffnen; Strg+Klick (⌘+Klick auf dem Mac) oder ein Mittelklick öffnet es in einem neuen Tab. Ein Ordner öffnet eine Liste dessen, was darin ist, eine Leiste, die länger als die Seite ist, scrollt, und **»** listet alles auf. Klicke mit der rechten Maustaste auf einen Eintrag für **Öffnen**, **In einem neuen Tab öffnen**, **Bearbeiten** (**Umbenennen** bei einem Ordner) und **Löschen**.

Für alle drücke **Menü** (⋯) → **Lesezeichen** oder gehe zu [Lesezeichen](/browser?panel=bookmarks). Der Bereich hat zwei Orte, **Lesezeichenleiste** und **Andere Lesezeichen**, und die Ordner darin öffnen und schließen sich.

- **Neuer Ordner** (oben) fügt der Leiste einen Ordner hinzu und fragt nach seinem Namen.
- Fahre über eine Zeile für **Nach oben verschieben**, **Nach unten**, **Bearbeiten** (**Umbenennen** bei einem Ordner) und **Löschen**. Du kannst eine Zeile auch ziehen: auf die Mitte eines Ordners, um sie hineinzulegen, oder zwischen Zeilen, um sie dort einzusortieren. Ein Ordner kann nicht in sich selbst liegen. Das Löschen eines Ordners fragt vorher und nimmt mit, was darin ist.
- Die Adresse eines Lesezeichens beginnt mit http://, https://, file:// oder chrome-extension://. Du kannst bis zu 20.000 behalten.

### Lesezeichen importieren

Unter **Importieren** im Bereich listet die App die Browser auf diesem Computer auf, die Lesezeichen haben, jeweils mit der Anzahl: Chrome (und Chrome Beta), Chromium, Edge, Brave, Vivaldi, Opera, Firefox und, nur auf einem Mac, Arc und Safari. Ein Browser mit mehreren Profilen wird für jedes einzeln aufgeführt, mit dem Namen des Profils. Drücke bei einem **Importieren**, und seine Lesezeichen kommen in einen neuen Ordner am Ende der Lesezeichenleiste mit dem Namen „Imported from Chrome“ („Imported from Chrome (Work)“, wenn der Browser mehrere Profile hat). Die eigenen Ordner des Browsers bleiben erhalten: zuerst, was in seiner Lesezeichenleiste war, dann seine anderen Lesezeichen, mobile und das Menü von Firefox als Ordner, benannt, wie dieser Browser sie nennt. Links, die keine Webseiten sind, etwa javascript:-Links, und leere Ordner werden weggelassen. Firefox kann geöffnet bleiben.

Safari bewahrt seine Lesezeichen dort auf, wo macOS sie schützt. Solange du es nicht erlaubst, sagt seine Zeile „Hydor may not read Safari’s bookmarks: allow it in System Settings → Privacy & Security → Full Disk Access“. Füge Hydor dort hinzu und importiere sie erneut.

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

Jede Erweiterung im Bereich zeigt Symbol, Name und Version und einen Schalter zum Ein- und Ausschalten. **Entfernen** löscht sie (die eigenen Dateien eines Ordners bleiben). Hat eine Erweiterung eine Schaltfläche in der Symbolleiste, erscheint sie rechts der Adressleiste, solange die Erweiterung eingeschaltet ist: Klicke darauf, um ihr Popup unter der Schaltfläche zu öffnen; ein Abzeichen darauf, eine Zahl oder ein paar Buchstaben, zeigt, was die Erweiterung meldet. **Optionen** öffnet ihre Optionsseite in einem Tab.

**Auch in den Browsern der Agenten** ist anfangs aus. Eingeschaltet läuft die Erweiterung auch in den Browsern der Agenten, die Anmeldungen behalten, also denen mit einem Profil (siehe [Anmeldungen mit Profilen behalten](/guide/web#keep-sign-ins-with-profiles)), und nur dort. Browser, die ohne Anmeldung neu starten, bekommen nie Erweiterungen. (Auf einem Server laden ein Chromium oder Chrome for Testing sie; Google Chrome tut das nicht mehr.)

### Was möglicherweise nicht funktioniert

Der Browser der Desktop-App hat nur einen Teil dessen, was Chrome Erweiterungen bietet. Inhalte, die eine Erweiterung zu Seiten hinzufügt, Popups, Optionsseiten, gespeicherte Einstellungen, Nachrichten, Abzeichen, Benachrichtigungen (als die des Systems angezeigt) und Wecker funktionieren. Was möglicherweise nicht funktioniert: Anfragen blockieren oder ändern (worauf viele Werbeblocker beruhen), das Seitenfenster, die Anmeldung mit einem Konto, Cookies, Verlauf, Lesezeichen und Downloads des Browsers, Tab-Gruppen, Hintergrundseiten, die Chrome für sie erstellt (Offscreen), Tastenkürzel einer Erweiterung und die Einträge, die eine Erweiterung zum Rechtsklickmenü hinzufügt (angenommen, nie angezeigt). Die Zeile der Erweiterung sagt, welche sie anfordert, in einer Zeile wie „Einige Teile funktionieren hier möglicherweise nicht: Anfragen blockieren oder ändern, Cookies“. Sie richtet sich nach dem, was die Erweiterung anfordert, kann also trotzdem gut funktionieren.

## Eine Seite an einen Agenten übergeben

Einen Agenten bekommt dein eigener Browser nie. Du kannst ihm eine Seite daraus geben, auf zwei Arten. Öffne **Menü** (⋯) und wähle **Zu dieser Seite fragen** oder **Hier erledigen lassen**: Sie funktionieren bei einer Seite einer Website, und jede öffnet unter dem Menü ein kleines Feld, in das du schreibst, was du willst, und mit **Strg+Enter** (⌘+Enter auf dem Mac) sendest.

### Zu dieser Seite fragen

Das Feld fragt „Was möchtest du über diese Seite wissen?“; drücke **Fragen**. Der Agent erhält eine Kopie der Seite, eine Datei mit Titel, Adresse, dem, was du darauf markiert hattest, und ihrem lesbaren Text (bis zu 200.000 Zeichen), und eine neue Sitzung startet mit deiner Frage, mit dem Agenten und Modell, die die Startseite zuletzt verwendet hat. Du landest in der Sitzung. Der Agent kann die Seite nicht anfassen oder deine Anmeldungen sehen: Er liest die Kopie. Lass die Seite zuerst fertig laden, denn die Kopie ist das, was der Tab jetzt zeigt.

### Hier erledigen lassen

Das Feld fragt „Was soll ein Agent auf dieser Seite tun?“ und sagt, was der Agent bekommt. Wähle **Claude Code** oder **Custom** als **Agent** (nur diese beiden lassen sich auf den Browser beschränken; die App lehnt die anderen ab) und drücke **Starten**. Der Agent bekommt:

- **Einen eigenen Tab** in dem Browser, der deine Anmeldungen behält, geöffnet bei der Adresse deiner Seite: Er ist auf dieser Website als du angemeldet. Dein eigener Tab bleibt, wo er ist.
- **Nur diese Website**: Seiten anderswo öffnen sich für ihn nicht. Bei einer Seite auf diesem Computer ist es nur diese Adresse.
- **Nur den Browser**: keine Befehle, keine Dateien, keine Websuche, keine anderen Apps, kein Memory und keine Subagenten. Eine solche Sitzung lässt sich nicht in einem anderen Agenten fortsetzen, und ein Fork davon bleibt auf den Browser beschränkt.
- **Einen Halt vor dem Senden**: Er fragt wie oben nach, bevor er eine Schaltfläche drückt, die etwas sendet, veröffentlicht, löscht oder überweist, und ihm ist gesagt, dass er dich fragen soll, wenn er unsicher ist (siehe [Schaltflächen, die senden, veröffentlichen oder löschen](/guide/web#buttons-that-send-post-or-delete)). Bezahlen bleibt wie immer deine Sache.

Die erste Nachricht an den Agenten sagt ihm, dass deine Seite in seinem Browser geöffnet ist und dass er dort allein arbeitet. Der Browser muss in den Einstellungen eingeschaltet sein (**Ein Browser für Agenten**). Nach dem Drücken von **Starten** öffnet sich **Tabs der Agenten**, wo der Browser der Sitzung erscheint.

### Die Seite zurückholen

Bei einem Agentenbrowser, der deine Seite bekommen hat, sagt der Bereich über dem Nachrichtenfeld „Dein Tab von example.com“ mit **Zurückholen**, ebenso **Tabs der Agenten** und die Leiste über seiner Seite. Drücke es, um den Tab des Agenten zu schließen und die Seite als neuen Tab von dir zu öffnen, ganz vorn. Dem Agenten wird gesagt „I took the page back: it is mine again“. Sein Browser schließt sich mit seinem letzten Tab und sonst wie der jeder Sitzung, wenn die Sitzung endet (siehe [Wann der Browser schließt](/guide/web#when-the-browser-closes)).

## Tabs der Agenten

**Menü** (⋯) → **Tabs der Agenten** listet die Browser der Agenten auf, die gerade geöffnet sind, mit ihrer Anzahl daneben. Jeder zeigt Titel und Agent der Sitzung, was er gerade tut („Klicken auf „Anmelden““, „Wartet auf dich“, „Du steuerst – der Agent wartet“) und seine Tabs (die ersten sechs). Die Liste wird aktuell gehalten, und ein Hinweis erscheint, wenn keiner geöffnet ist. Drücke **Anzeigen**, um diesen Browser anstelle der Seite zu sehen, mit einer schmalen Leiste darüber: **Zurück zu deinen Tabs**, der Titel der Sitzung, **Öffne die Unterhaltung**, **Übernehmen** (oder **An Agenten zurückgeben**) und **Zurückholen** bei einer Seite, die du ihm übergeben hast. Klicke in der Desktop-App in seine Seite, um sie selbst zu bedienen; der Agent wartet wie bei [Für Anmeldung, Prüfungen oder Zahlungen übernehmen](/guide/web#take-over-to-log-in-solve-a-check-or-pay).

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

In der Desktop-App hat [Einstellungen → Browser](/settings?s=browser) außerdem eine Gruppe **Dein eigenes Surfen** („Die Browser-Seite: Seiten, die du selbst nutzt und die Agenten nie erhalten“) mit drei Zeilen, die die Bereiche der Seite Browser öffnen: [Lesezeichen](/settings?s=browser&find=Bookmarks) („Deine eigenen, zusammen mit denen der anderen Browser auf diesem Computer“), [Erweiterungen](/settings?s=browser&find=Extensions) („Chrome-Erweiterungen in der Desktop-App“) und [Browser-Einstellungen](/settings?s=browser&find=Browser%20settings) („Startseite, Suchmaschine, Werbeblocker, Verlauf und das Löschen dessen, was der Browser gespeichert hat“). Anderswo wird die Gruppe nicht gezeigt. Siehe [Lesezeichen](/guide/web#bookmarks), [Chrome-Erweiterungen](/guide/web#chrome-extensions) und [Browser-Einstellungen](/guide/web#browser-settings).

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
- „Wie gebe ich einem Agenten die Seite, die ich auf der Seite Browser ansehe?“ (**Zu dieser Seite fragen** gibt ihm eine Kopie; **Hier erledigen lassen** gibt ihm den Tab.)
- „Setze example.org/reports in einen Ordner namens Arbeit in meiner Lesezeichenleiste.“
- „Wie ändere ich die Suchmaschine oder die Startseite meines Browsers?“ (Es ist **Menü** → **Einstellungen** auf der Seite Browser: deine Sache, Agenten können es nicht.)
- „Wie erlaube ich Werbung auf einer Website in meinem Browser?“ (**Werbung auf dieser Website erlauben** am Schloss)
- „Wie lösche ich meinen Browserverlauf und meine Cookies?“ (**Browser-Einstellungen** → **Browserdaten löschen**; der Zeitraum gilt nur für den Verlauf und die dazugehörige Download-Liste)
- „Warum schlägt die Adressleiste eine Seite vor, die ich besucht habe und die keines der getippten Wörter enthält?“ (bei eingeschalteter Bedeutungssuche bietet sie auch Seiten an, in denen es um das Getippte geht)
- „Wie öffne ich einen Tab wieder, den ich geschlossen habe?“ (**Strg+Umschalt+T** oder **Zuletzt geschlossen** im Verlauf)
- „Blockiert mein Browser Werbung, und woher stammen seine Listen?“
- „Importiere meine Lesezeichen aus Chrome und Firefox in die Seite Browser.“ (oder: „Warum kann ich meine Safari-Lesezeichen nicht importieren?“)
- „Welche Chrome-Erweiterungen sind in meinem Browser, und welche davon laufen auch in den Browsern der Agenten?“
- „Füge die Erweiterung unter https://chromewebstore.google.com/detail/… zu meinem Browser hinzu.“ (Die App fragt dich jedes Mal zuerst.)
- „Fülle für mich das Bibliotheksausweisformular auf riverside.example.org aus. Ich schaue zu.“ Der Live-Zeiger zeigt seine Klicks und Eingaben.
- „Öffne Notizen auf meinem Mac und lege eine Notiz mit der heutigen Einkaufsliste an.“
- „Öffne Editor und schreibe die heutige Einkaufsliste auf.“ Unter Windows zeigt der leuchtende Rand die Arbeit an, der Ring markiert den Zeiger und Esc stoppt sie.
