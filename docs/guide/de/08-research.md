# Tiefgehende Recherche, Zweitmeinungen und mehrere Agenten

Reicht ein einzelner Agent nicht aus, kann die App mehrere einsetzen: Tiefgehende Recherche verteilt Teilfragen an Recherche-Agenten und liefert einen Bericht mit Quellen; Subagenten übernehmen abgegrenzte Teilaufgaben; ein Schwarm untersucht ein schwieriges Problem aus mehreren Richtungen; eine Kampagne setzt eine große Änderung in Teilaufgaben um. Zusätzlich kannst du die Arbeit von einem Modell eines anderen Anbieters prüfen lassen, mehrere Modelle mit demselben Auftrag vergleichen und die beste Antwort behalten. Ein Ausgabenlimit begrenzt dabei die rechnerischen Kosten der Sitzung.

![Tiefgehende Recherche auf der Startseite mit gleichzeitigen Recherche-Agenten, Runden, Suchbudget und Berichtsformat](images/research.webp)

## Tiefgehende Recherche starten

Tiefgehende Recherche eignet sich für Fragen mit vielen Quellen: Optionen vergleichen, Behauptungen prüfen, einen Themenüberblick erstellen oder den Forschungsstand ermitteln. Der gestartete Agent leitet die Recherche. Er plant Suchanfragen, verteilt Teilfragen, verfolgt offene Punkte, lässt Kernaussagen anhand zweier Quellen prüfen und erstellt einen Bericht mit Quellenangaben.

### Aktivieren

1. Öffne auf der Startseite **Optionen** (der Chip rechts in der Zeile unter dem Nachrichtenfeld) und wähle **Forschung**.
2. Wähle **Tiefgehende Recherche** mit „Breit recherchieren, Quellen prüfen und zitieren“. Darunter erscheinen die Einstellungen.
3. Lege die Zahlen und die Art des Berichts fest, den du möchtest (siehe unten).
4. Schreibe deine Frage ins Nachrichtenfeld und drücke **Starten**.

Die Recherchezeile zeigt nun etwa „Tiefgehende Recherche · 60 Suchen“ als Suchbudget; auch die Optionsschaltfläche nennt den Modus. **Aus** mit „Ein Agent antwortet und sucht bei Bedarf“ kehrt zur einfachen Sitzung zurück.

Auf dem Smartphone öffnen sich Optionen als Bedienfeld von unten und Recherche darüber.

Tiefgehende Recherche und Schwarm beziehungsweise Kampagne verwenden jeweils ein Team aus Hydor-Subagenten. Deshalb lässt sich nur eine dieser Varianten gleichzeitig aktivieren.

Wenn du zum ersten Mal **Tiefgehende Recherche** wählst, erklärt ein Dialog namens „Bevor du Tiefgehende Recherche verwendest“, was sie tut, wofür sie sich lohnt, wofür nicht und was sie kostet. Drücke **Tiefgehende Recherche verwenden**, um weiterzumachen, oder **Abbrechen**, um alles zu lassen, wie es war. Er erscheint einmal für dich, auf allen Geräten, egal wo du sie wählst (auf der Startseite, in den Optionen einer geplanten Aufgabe oder im Dialog einer Sitzung) und unabhängig davon, ob Tipps an sind oder nicht. Wenn du einen Agenten bittest, die Tipps wieder zu zeigen, erscheint er ebenfalls wieder.

Du musst dich nicht auf der Startseite entscheiden. In einer Sitzung, die schon läuft, öffne ihr Menü (⋯) → **Sitzungseinstellungen** → **Tiefgehende Recherche**; ihr Hinweis lautet „Aus“ oder die Zahl der Suchanfragen („60 Suchanfragen“). Der Dialog hat **Aus** und **Tiefgehende Recherche** mit denselben Einstellungen wie oben (**Gleichzeitig aktive Forscher**, **Runden**, **Suchanfragen insgesamt**, **Der Bericht**); drücke **Speichern**, wenn du fertig bist, oder **Abbrechen**. Die Änderung gilt ab deiner nächsten Nachricht: Der Agent der Sitzung (Claude Code oder Codex) startet vor dieser Nachricht mit den neuen Anweisungen und Tools neu, und die Unterhaltung geht dort weiter, wo sie war. Wenn du eine tiefgehende Recherche einschaltest, schaltet sich ein Schwarm aus, und umgekehrt. Der Chip neben dem **+** im Nachrichtenfeld (seine **Optionen**) hat dieselbe Zeile **Tiefgehende Recherche**, unter **Berechtigungen**.

Bei vertraulichen Sitzungen und von anderen Sitzungen gestarteten Agenten wie Schwarm-Mitgliedern, Recherche-Agenten oder Subagenten fehlt der Eintrag.

Auch eine geplante Aufgabe kann bei jedem Lauf Tiefgehende Recherche starten. Ihr Editor hat dieselbe Option **Forschung**; siehe [Geplante Aufgaben](/guide/tasks).

### Einstellungen

- **Gleichzeitig aktive Forscher** (1 bis 8; anfangs 4): Wie viele Forscher in jeder Runde gleichzeitig suchen, also wie breit jede Runde angelegt ist.
- **Runden**: 1 bis 5, anfangs 2. Jede Runde verfolgt offene Punkte der vorherigen. Anschließend folgt eine separate Prüfrunde.
- **Suchanfragen insgesamt**: 10 bis 500 in Zehnerschritten, anfangs 60. Dieses Budget gilt gemeinsam für Leitung und Recherche-Agenten.
- **Der Bericht**: **Seite** oder **Word**.

Der Browser merkt sich die Zahlen für deinen nächsten Durchlauf mit Tiefgehende Recherche. Der Modus selbst bleibt nicht aktiv: Neue Sitzungen starten ohne Recherchemodus, da Tiefgehende Recherche ein Mehrfaches einer einzelnen Antwort kostet.

### Ablauf

1. **Planen.** Die Leitung klärt, was die Frage bedeutet und was eine vollständige Antwort enthalten muss. Sie bildet Teilfragen und formuliert verschiedene Suchanfragen, bei Bedarf mehrsprachig und auf geeignete Quellen wie amtliche Daten, Fachartikel, Originaldokumente und verlässliche Berichte ausgerichtet. Nur bei entscheidenden Unklarheiten fragt sie einmal kurz nach; andernfalls nennt sie ihre Annahmen und arbeitet weiter.
2. **Erste Runde.** Sie startet bis zu der von dir festgelegten Zahl an Forschern, einen pro Teilfrage. Jeder Forscher ist ein Hydor-Subagent mit einem eigenen Auftrag: die ganze Frage, sein Teil, die Suchanfragen, mit denen er beginnt, etwa wie viele Suchanfragen sein Anteil sind und was er berichten soll. Die Leitung wartet dann; der Bericht jedes Forschers kommt als Nachricht bei ihr an.
3. **Weitere Runden.** Die Leitung liest die Ergebnisse und beauftragt neue Agenten mit Lücken, Widersprüchen und nur einfach belegten Aussagen. Sind keine wichtigen Fragen offen, entfällt eine Runde. Nach jeder Runde nennt sie kurz Ergebnisse und nächste Schritte.
4. **Prüfen.** Zentrale Aussagen benötigen zwei unabhängige Quellen oder werden als nur einfach belegt beziehungsweise umstritten gekennzeichnet. Ein Recherche-Agent oder die Leitung selbst öffnet die Quellen und prüft, ob die Kernaussagen und Zahlen tatsächlich darin stehen. Nicht haltbare Angaben werden korrigiert oder entfernt.
5. **Bericht.** Ein klarer Titel und eine kurze Antwort leiten den gegliederten Bericht ein. Jede belegpflichtige Aussage erhält eine nummerierte Quellenangabe; am Ende stehen Titel, Website, Datum und Link der Quellen. Unsicherheiten und Streitpunkte werden begründet. Eine kurze Zusammenfassung erscheint in der Unterhaltung.

Die Recherche verwendet App-Websuche und Seitenabruf; siehe [Suche und Browser](/guide/web). Die eigenen Websuchen von Claude Code und Codex sind dabei deaktiviert, damit jede Suche zum Budget zählt. Ist es verbraucht, werden weitere Suchen abgelehnt und der Agent soll aus vorhandenen Ergebnissen berichten. Nach den festgelegten Runden und der Prüfrunde kann die Leitung ebenfalls keine weiteren Recherche-Agenten starten.

### Den Fortschritt verfolgen

Eine Leiste über dem Nachrichtenfeld der leitenden Sitzung zeigt, was die Recherche gerade tut: **Tiefgehende Recherche** · „Planung“, dann „Runde 1 von 2 · Aktive Forscher: 4“, zwischen den Runden „Berichte werden gelesen“, „Quellen werden geprüft“, während Forscher die wichtigsten Aussagen prüfen, „Bericht wird geschrieben“ und am Ende „Bericht fertig“ · und wie viel vom Budget verbraucht ist („12 von 60 Suchanfragen“). Sobald der Bericht da ist, öffnet ihn **Bericht öffnen** rechts in der Leiste: die Seite oder das Word-Dokument. Zeige auf die Leiste, um die Einstellungen der Recherche zu sehen und was der Bericht sein wird.

Jeder Recherche-Agent hat eine Zeile in der einen Karte, die sich die Recherche-Agenten in der Unterhaltung der Leitung teilen („Forscher: 4“), und steht unter der Leitung in der Seitenleiste, wie andere [Hydor-Subagenten](/guide/research#follow-subagents). Zurückgesendete Berichte erscheinen als Zeile „Antwort von“ mit Titel und Ergebnisanfang. Ein Klick öffnet den Bericht. In der Recherche-Agentensitzung steht „Recherchiert für“ mit dem Titel der Leitung; **Leitung** führt zurück.

### Der Bericht

- **Seite**: Der Bericht wird als bleibende Seite gespeichert, in der Unterhaltung angezeigt und in den Dateien des Projekts der Sitzung aufbewahrt (seine Details → **Dateien**); hat die Sitzung kein Projekt, bleibt sie bei der Unterhaltung. Siehe [Seiten, Dokumente und Bilder](/guide/library).
- **Word**: Ein .docx-Dokument im Sitzungsordner, erstellt mit dem Skill **word-documents**, erscheint als Dateikarte zum Öffnen oder Herunterladen. Siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice#open-or-download-the-files-an-agent-made).

Tiefgehende Recherche führt viele Agenten gleichzeitig aus. Setze vorher im selben Optionsmenü ein Ausgabenlimit, das Leitung und alle Recherche-Agenten einschließt. Siehe [Ein Ausgabenlimit setzen](/guide/research#put-a-spending-cap-on-a-session).

## Arbeit an Subagenten übergeben

Jeder Agent kann einen abgeschlossenen Teil seiner Arbeit an einen Subagenten übergeben, der ihn gleichzeitig bearbeitet und danach berichtet. Es gibt zwei Arten, und die App sagt dir, welche es ist. Ein **Hydor-Subagent** ist eine eigene Sitzung, die Hydor startet, mit beliebigem Agenten und Modell: Er hat eine Zeile in der Subagenten-Karte in der Unterhaltung, steht in der Seitenleiste unter seiner übergeordneten Sitzung, hat eigene Kosten und seinen eigenen Anteil am Ausgabenlimit, du kannst ihn öffnen und mit ihm sprechen, und seine Antwort kommt als Nachricht bei der übergeordneten Sitzung an. Ein **Claude-Code-Subagent** ist einer, den Claude Code für einen kurzen Teil seiner Arbeit innerhalb der Sitzung ausführt (bei Codex ein „Codex-Subagent“): Er wird wie ein Hydor-Subagent angezeigt, mit einer Zeile in der Karte in der Unterhaltung, einer Zeile in der Seitenleiste und in der Leiste über dem Nachrichtenfeld und einer eigenen Seite, die du öffnen und lesen kannst, aber du kannst nicht mit ihm schreiben, was er ausgibt, zählt zu den Ausgaben der Sitzung selbst, und er hat keinen Anteil an einem Ausgabenlimit. In der Leiste und in seiner Zeile sagt jeder, welche Art es ist („Hydor-Subagent · Claude Code · Sonnet 5.5“ oder „Claude Code Subagent · Explore · Sonnet 5.5“), und wenn du darauf zeigst, steht dort, wer ihn ausführt ([Subagenten](/guide/sessions#subagents)). Der Rest dieses Abschnitts handelt von Hydor-Subagenten.

Du musst nichts aktivieren. Bitte etwa „Lass drei Subagenten jeweils einen Anbieter recherchieren“ oder „Lass Codex die Tests schreiben, während du die Dokumentation bearbeitest“, oder überlasse die Aufteilung dem Agenten. Der Hauptagent soll selbstständig planen und prüfen und klare Teilaufgaben an günstigere Modellstufen delegieren. Siehe [Modellstufen für unterschiedliche Aufgaben](/guide/agents-models#tiers-a-model-for-each-kind-of-job). Dort lässt sich das mit **Subagenten koordinieren** ausschalten.

Für jeden Hydor-Subagenten legt der Agent fest:

- **Agentenprogramm und Modell**: Custom mit einem seiner unter [Einstellungen → Modelle](/settings?s=models) hinzugefügten Modelle, Claude Code, Codex oder ein anderer Agent wie Gemini CLI oder OpenCode. Standard ist dasselbe Programm wie bei der Leitung. Günstige oder lokale Modelle eignen sich für umfangreiche Routinearbeit, Claude Code oder Codex für anspruchsvolle Teile.
- **Modellstufe**: **Schnell** für kleine, sehr klare Aufgaben, **Standard** für klare Aufgaben mittleren Umfangs und als Vorgabe ohne Auswahl, **Am besten** für schwierige eigenständige Teilaufgaben. Das Modell je Programm und Stufe kommt aus [Einstellungen → Modelle → Modellstufen](/settings?s=models&find=Tiers). Subagenten verwenden nie eine höhere Stufe als ihre Leitung. Eigene Agenten können niedrigere Höchststufen vorgeben.
- **Einen deiner Agenten** per Name statt eines allgemeinen Subagenten. Dieser verwendet eigene Anweisungen, Tools und Modellstufe. Siehe [Agenten mit delegierten Aufgaben](/guide/agents#agents-that-hand-work-to-other-agents). Ein Agent mit fortlaufendem eigener Unterhaltung erhält die Aufgabe stattdessen im Posteingang und antwortet, wenn er sie bearbeitet.
- **Ordner**: standardmäßig der Arbeitsordner der Leitung, sonst ein ausdrücklich anderer.
- **Ein Worktree**, wenn er einen möchte: eine eigene Kopie des Git-Repositorys des Ordners auf einem neuen Branch, damit sich die Änderungen des Subagenten nicht mit denen anderer vermischen.
- **Kurztitel** als sichtbarer Name.

Hydor-Subagenten sehen die übergeordnete Unterhaltung nicht. Deshalb erhalten sie einen vollständigen Auftrag mit allen nötigen Angaben. Niemand betreut sie laufend: Kleinere Fragen entscheiden sie selbst und dokumentieren die Entscheidung. Sie fragen nur nach, wenn sie nicht weiterkommen.

### Wie Antworten zurückkommen

Endet ein Hydor-Subagentendurchlauf, geht die Antwort als Nachricht an die Leitung und aktiviert sie wieder. Arbeitet diese gerade, wartet die Antwort bis zum Ende ihres Durchlaufs in der Warteschlange.

In der Unterhaltung der übergeordneten Sitzung erscheint die Antwort als eine Zeile: „Antwort von“, der Titel des Subagenten und der Anfang dessen, was er geschrieben hat. Klicke auf die Zeile, um die Antwort zu lesen (bei langen Antworten ihre Zusammenfassung), dann auf **Sitzung öffnen** oder **Vollständige Antwort lesen**, um zum Subagenten zu gehen. Ein Subagent, der vor dem Ende gestoppt wurde, erscheint als „… wurde gestoppt“, einer, der fehlgeschlagen ist, als „… wurde mit einem Fehler gestoppt“. Einer, der ein Nutzungslimit erreicht hat und weiterläuft, erscheint als „… läuft nach einem Nutzungslimit weiter“, mit Angabe, wie es weitergeht.

Ein Claude-Code- oder Codex-Subagent, der im Hintergrund gearbeitet hat, kommt genauso zurück: eine Zeile, „Antwort von“ und sein Titel (oder „… wurde gestoppt“, „… mit einem Fehler gestoppt“), mit dem Anfang dessen, was er geschrieben hat. Klicke auf die Zeile, um die Antwort zu lesen, dann auf **Sitzung öffnen**, um zu ihm zu gehen. Die Antwort eines Codex-Subagenten wird aus seiner eigenen Unterhaltung geholt, wenn du die Zeile öffnest („Antwort wird geladen“). Eine Antwort, die kam, während die übergeordnete Sitzung noch arbeitete, steht an ihrer Stelle zwischen den Schritten davor und danach.

- Antworten über etwa 4.000 Zeichen werden vom Hilfsmodell zusammengefasst; die Leitung kann weiterhin den Volltext lesen. Siehe [Agenten, Konten und Modelle](/guide/agents-models).
- Wenn ein Hydor-Subagent mit einem Fehler stoppt oder vor dem Ende gestoppt wird, erfährt die übergeordnete Sitzung auch das.
- Wenn ein Nutzungslimit den Durchlauf eines Hydor-Subagenten stoppt und er weiterläuft (mit einem anderen Konto, mit API-Guthaben oder von selbst, sobald das Limit zurückgesetzt ist), erfährt die übergeordnete Sitzung das statt eines Fehlers, damit sie die Arbeit nicht noch einmal beginnt: Die Antwort des Subagenten kommt, wenn er fertig ist. Nur ein Subagent, der gestoppt bleibt, wird als Fehler gemeldet. Mehr dazu unter [Alle Konten nutzen: bei Limits wechseln](/guide/agents-models#use-all-your-accounts-switch-at-a-limit).
- Bei Quick und Standard prüft das Hilfsmodell Auftrag und Antwort kurz. Ist das Ergebnis unzureichend oder schlägt der Agent fehl, wird die Aufgabe eine Stufe höher erneut ausgeführt, höchstens auf Best und nie über die von der Leitung erlaubte Höchststufe. Die Leitung erfährt Grund und Wechsel. Nur die ursprüngliche Auftragsantwort wird so geprüft, nicht spätere Antworten. Eigene Agenten können **Bei fehlgeschlagener Prüfung auf eine höhere Stufe wechseln** deaktivieren. Die Leitung kann auch selbst bei unzureichenden Ergebnissen hochstufen.
- Die Leitung kann jederzeit Aktivität, Programm, Modell, Kosten und Anfang der neuesten Antwort ihrer Subagenten abrufen und ihnen weitere Aufgaben geben.
- Antworten aus während eines App-Stopps beendeten Durchläufen werden nach dem Neustart zugestellt.

Du kannst Hydor-Subagenten wie andere Sitzungen öffnen und anschreiben. Jede abschließende Antwort geht ebenfalls an die Leitung.

### Subagenten verfolgen

- **In der Unterhaltung der übergeordneten Sitzung**: Die Subagenten, die ein Durchlauf gestartet hat, erscheinen gemeinsam als eine Karte unter diesem Durchlauf, die Hydor-Subagenten in einer Karte und die des Programms in einer anderen. Ihre oberste Zeile sagt, wie viele es sind und welcher Art, mit dem, was sie alle gemeinsam haben („Hydor-Subagenten: 3 · Claude Code · Sonnet 5.5“, „Subagenten von Claude Code: 6 · Sonnet 5.5“, „Forscher: 4“ bei einer tiefgehenden Recherche), und wie sie dastehen („In Bearbeitung: 5 · 1 erledigt“, ebenso „1 braucht dich“, „1 angehalten“, „1 fehlgeschlagen“); ein Klick klappt die Karte ein oder aus. Sie ist offen, solange einer arbeitet oder dich braucht, und klappt auf diese Zeile zu, sobald alle fertig sind. Darunter hat jeder Subagent eine Zeile: einen Punkt in der Farbe seines Zustands (blau, solange er arbeitet; gelb, wenn er dich braucht; grün, fertig; grau, angehalten; rot, fehlgeschlagen), seinen Titel, auf einem breiten Bildschirm das, was er den anderen voraus hat (seine Art oder sein Modell, der Agent von dir, als der er arbeitet, seine Leistungsstufe) und seinen Stand (wie lange er gearbeitet hat, „Braucht dich“, „Vor 3 Min.“ wenn er fertig wurde, „Angehalten“, „Fehlgeschlagen“). In der Zeile eines Hydor-Subagenten stehen außerdem seine Ausgaben, und wenn du auf einen zeigst, der hochgestuft wurde, siehst du „Hochgestuft von“ seiner ersten Leistungsstufe und warum; ein Claude-Code- oder Codex-Subagent hat keine eigenen Kosten. Ein Klick auf eine Zeile öffnet den Subagenten. Solange andere noch arbeiten, klappen die fertigen zu einer Zeile zusammen („4 beendet: “ und ihre Titel; ein Klick zeigt sie), fehlgeschlagene bleiben als eigene Zeilen stehen, und arbeiten mehr als sechs, werden fünf gezeigt, dazu **3 mehr anzeigen**. Hat ein Durchlauf nur einen Subagenten gestartet, erscheint er als einzeilige Karte mit seiner Art („Claude Code Subagent · Explore · Sonnet 5.5“). Zum Stoppen zeigst du auf die Zeile (oder erreichst sie mit Tab): **Stoppen** erscheint anstelle der Zeit (auf einem Touchscreen ist immer eine kleine Stoppschaltfläche da). Ein Hydor-Subagent stoppt sofort, ein Claude-Code-Subagent fragt zuerst nach („Diesen Subagenten stoppen?“), und ein Codex-Subagent lässt sich hier nicht einzeln stoppen. Das **⋯**-Menü der Karte enthält **Subagenten stoppen: 5** (mit der Zahl derer, die sich stoppen lassen), das alle ohne Rückfrage stoppt.
- **In der Seitenleiste**: Subagenten stehen eingeklappt unter der Leitung, etwa „3 Subagenten · 1 benötigt dich · 2 in Arbeit“, oder „5 Subagenten · 1 in Arbeit“, wenn Subagenten des Programms dabei sind. Klicke auf die Zeile, um sie aufzuklappen (die Zeile eines Programm-Subagenten hat kein ⋯-Menü). Die Liste bleibt geöffnet, während du einen davon ansiehst. Auf dem Smartphone klappt Antippen sie auf, ohne das Seitenleistenmenü zu schließen.
- **Beim Subagenten**: Über dem Nachrichtenfeld stehen „Subagent von“, übergeordneter Titel, „Antworten gehen dorthin zurück“ und **Übergeordnete Sitzung öffnen**. Die Seite eines Claude-Code- oder Codex-Subagenten ist nur zum Lesen: Sie zeigt die Aufgabe, die er bekam, seine Schritte und seine Antwort, live während der Arbeit, mit einer Leiste „Claude Code Subagent von“ und dem übergeordneten Titel anstelle des Nachrichtenfelds, samt **Übergeordnete Sitzung öffnen**, und ohne **Fortsetzen** oder Sitzungsmenü. Solange ein Claude-Code-Subagent arbeitet, stoppt **Stoppen** in seiner Kopfzeile ihn, nach Rückfrage. Ihm zu schreiben, ihn fortzusetzen, zu verzweigen, zu übergeben oder zu löschen wird abgelehnt: Sein Programm führt ihn innerhalb der Sitzung der Leitung aus, schreibe also dieser.

Ein Subagent mit Freigabeanfrage oder Rückfrage wartet wie jede andere Sitzung und erscheint im Posteingang. Siehe [Posteingang und Benachrichtigungen](/guide/inbox).

### Möglichkeiten und Grenzen von Hydor-Subagenten

- **Eine Ebene.** Ein Hydor-Subagent kann keine eigenen Hydor-Subagenten starten. Er bearbeitet seinen Teil selbst und nennt weiteren Bedarf.
- **Keine weitergehenden Berechtigungen.** Ein Subagent erhält niemals mehr Freiheiten als die Leitung. Beim Wechsel zwischen Claude Code, Codex und Custom wird der freizügigste Modus gewählt, der diese Grenze einhält. Andere Programme wie Gemini CLI starten mit ihrem eigenen Standard.
- **Anteil am Limit.** Bei begrenzten Ausgaben erhält jeder neue Hydor-Subagent einen Anteil des Restbudgets. Das übergeordnete Limit umfasst trotzdem alle. Siehe [Limits für Subagenten](/guide/research#caps-for-subagents).
- **Dasselbe Konto.** Läuft derselbe Agententyp wie bei der Leitung, also Claude Code oder Codex, verwendet er deren Konto.
- **Begrenzte Parallelität.** Pro Sitzung laufen nur eine bestimmte Zahl Hydor-Subagenten gleichzeitig. Vor weiteren Starts wartet der Agent auf freie Plätze.

### Gleichzeitige Subagenten festlegen

Unter [Einstellungen → Funktionen → Subagenten](/settings?s=children) stellst du **Gleichzeitig aktive Subagenten pro Sitzung** mit − und + auf 1 bis 12, anfangs 4. Der Eintrag liegt in der Gruppe **Subagenten**; **(i)** erklärt deren Grenzen. [Zur Einstellung](/settings?s=children&find=Working%20at%20once%2C%20per%20session). Das Limit gilt je Sitzung, nicht für die ganze App. Für Tiefgehende Recherche gilt eine eigene Zahl gleichzeitiger Recherche-Agenten, Schwarm die **Schwarm-Größe**.

## Ein schwieriges Problem mit einem Schwarm bearbeiten

Ein Schwarm setzt ein Agententeam auf ein Problem an. Die Leitung bildet unterschiedliche Lösungsansätze mit verschiedenen Methoden, Annahmen oder Blickwinkeln und startet pro Ansatz ein Mitglied. Mitglieder teilen Versuche und Ergebnisse auf einem Board, lesen Beiträge und schreiben einander. Die Leitung steuert, besetzt frei werdende Plätze neu und lässt das Ergebnis vor der Übergabe prüfen.

Geeignet sind schwierige Probleme mit mehreren möglichen Wegen: Beweise, hartnäckige Fehler oder Fragen ohne klaren Einstieg. Die Kosten liegen bei einem Mehrfachen eines einzelnen Agenten.

### Einen Schwarm starten

1. Öffne auf der Startseite **Optionen** und wähle **Schwarm**.
2. Wähle **Schwarm**, etwa „Bis zu 5 Agenten gleichzeitig, mit unterschiedlichen Ansätzen“. Die Zahl entspricht deiner Schwarm-Größe.
3. Schreibe den Auftrag und klicke **Starten**.

Die Zeile zeigt etwa „Ein · 5 gleichzeitig“ und die Optionsschaltfläche nennt den Modus. **Schwarm-Größe** unten führt zur Einstellung. Wie bei Tiefgehende Recherche wird der Modus nicht für die nächste Sitzung gespeichert; beide schließen einander aus. Ein Ausgabenlimit im selben Menü umfasst Leitung und alle Mitglieder. Geplante Aufgaben haben dieselbe **Schwarm**-Option für jeden Lauf.

Bei der ersten Auswahl von **Schwarm** oder **Kampagne** erklärt „Bevor du Schwarm verwendest“ Funktion, passende und ungeeignete Aufgaben sowie Kosten. **Schwarm verwenden** fährt fort, **Abbrechen** lässt den Modus ausgeschaltet. Der Hinweis erscheint je Modus einmal geräteübergreifend, unabhängig von Tipps. Eine Bitte an den Agenten, Tipps erneut zu zeigen, setzt ihn zurück.

Du kannst einen Schwarm auch innerhalb einer Sitzung ein- oder ausschalten oder in eine Kampagne umwandeln: Öffne ihr Menü (⋯) → **Sitzungseinstellungen** → **Schwarm** (ihr Hinweis lautet **Aus**, **Ein** oder **Kampagne**) und wähle **Aus**, **Schwarm** oder **Kampagne**. Die Änderung gilt ab deiner nächsten Nachricht: Der Agent der Sitzung (Claude Code oder Codex) startet vor dieser Nachricht mit den neuen Anweisungen und Tools neu, und die Unterhaltung geht weiter. Wenn du einen Schwarm einschaltest, schaltet sich eine tiefgehende Recherche aus, und umgekehrt. Den Eintrag gibt es nicht in einer vertraulichen Sitzung und nicht in einer Sitzung, die eine andere Sitzung gestartet hat (ein Mitglied, ein Forscher, ein Subagent). Der Chip neben dem **+** im Nachrichtenfeld (seine **Optionen**) hat dieselbe Zeile **Schwarm**, unter **Berechtigungen**.

### Wie ein Schwarm arbeitet

1. Die Leitung klärt Auftrag und überprüfbares Ergebnis und wählt bis zur festgelegten Schwarm-Größe unterschiedliche Ansätze. Bei einem Beweis wären das direkte Herleitung, Widerspruch, Induktion, kleine Fälle mit Computersuche oder bekannte Resultate.
2. Pro Ansatz startet ein Hydor-Subagent mit Gesamtproblem, eigenem Ansatz, Abschlusskriterien und Prüfverfahren. Sein Titel nennt den Ansatz. Standardmäßig verwendet er Modell und Denkaufwand der Leitung, sofern diese nichts anderes festlegt.
3. Mitglieder veröffentlichen **Fortschritt** mit Versuchen und Arbeitsstand, **Ergebnis** für nutzbare Erkenntnisse, **Frage** für offene Punkte und **Notiz**. Sie lesen das Board alle paar Schritte, nutzen Ergebnisse anderer, vermeiden widerlegte Wege und beantworten an sie gerichtete Fragen.
4. Die Leitung erhält gebündelte Boardmeldungen: Ergebnisse, Fragen und direkte Nachrichten nach etwa einer Minute, reine Fortschrittsmeldungen alle paar Minuten. Sie verteilt Erkenntnisse, lenkt festgefahrene oder doppelte Ansätze um, lässt Ergebnisse unabhängig prüfen und besetzt freie Plätze mit neuen Ideen.
5. Vor dem Abschluss veranlasst sie eine unabhängige Prüfung durch ein anderes Mitglied, eine Berechnung oder ihre eigene gründliche Kontrolle.
6. Ist das Problem gelöst oder sind die Ansätze ausgeschöpft, stoppt sie übrige Mitglieder und erklärt Ergebnis, Lösungsweg, Prüfung und gescheiterte Ansätze mit Gründen.

Ein fertiges Mitglied sendet seinen Bericht an die Leitung. Eine neue Nachricht an ein gerade nicht arbeitendes Mitglied aktiviert es wieder.

**Ein Schwarm mit einem Ziel**: Eine Sitzung, die einen Schwarm leitet, kann ein Ziel haben, dessen Prüfungen die App ausführt. Jede Runde ist dann die Arbeit des ganzen Schwarms, und die App, nicht die Leitung, entscheidet, wann es fertig ist. Siehe [Ein Ziel für einen Schwarm](/guide/sessions#a-goal-for-a-swarm).

### Fortschritt und Board ansehen

Über dem Nachrichtenfeld der Leitung steht **Schwarm**, zunächst mit „Ansätze auswählen“, danach etwa „3 in Arbeit · 2 abgeschlossen · 14 Beiträge“, sowie **Board**. Mitglieder zeigen „Im Schwarm von“ mit Leitungstitel, dem Hinweis auf zurückgesendete Beiträge und Berichte sowie **Board** und **Leitung**. In der Seitenleiste stehen sie unter der Leitung, etwa „5 Schwarm-Mitglieder · 3 in Arbeit“.

**Board** öffnet das Schwarm-Board (auf einem Smartphone von unten):

- **Mitglieder**: laufende und maximal gleichzeitige Zahl, danach jedes Mitglied mit Aktivität oder „Durchlauf abgeschlossen“, „Gestoppt“ beziehungsweise „Mit Fehler beendet“. Ein Klick öffnet seine Sitzung, **Leitenden Agenten öffnen** die Hauptsitzung. Vor der Ansatzwahl steht dort, dass noch niemand gestartet wurde.
- **Beiträge**: alles, was gepostet wurde, die neuesten zuerst. Jeder Beitrag zeigt, wer ihn geschrieben hat (die Leitung oder der Titel des Mitglieds), für wen er war, wenn er an ein Mitglied oder an die Leitung ging, seine Art (Fortschritt, Erkenntnis, Frage, Notiz) und wie lange das her ist. Wechsle zwischen **Alle**, **Erkenntnisse** und **Fragen**. Neue Beiträge erscheinen, sobald sie eintreffen.

### Mitglieder stoppen

**Alle stoppen** im Board ist bei laufenden Mitgliedern verfügbar. Es stoppt sie, erhält ihre bisherigen Ergebnisse und verhindert das automatische Aufwecken durch neue Beiträge. Die Leitung erfährt den Stopp und kann trotzdem weitere Aufgaben vergeben. Nach einer Lösung stoppt sie die Mitglieder selbst.

### Schwarm-Größe festlegen

Unter [Einstellungen → Funktionen → Subagenten](/settings?s=children) bestimmt **Schwarm-Größe** in der Gruppe **Schwarm** die gleichzeitige Mitgliederzahl pro Schwarm oder Kampagne: 1 bis 16, anfangs 5. [Zur Einstellung](/settings?s=children&find=Swarm%20size). Jedes Mitglied kostet ungefähr so viel wie ein eigener Agent; die Leitung startet bei freien Plätzen weitere.

## Eine große Änderung als Kampagne umsetzen

Eine Kampagne ist die andere Art von Schwarm, für eine große Änderung an einer ganzen Codebasis statt für ein schwieriges Problem: eine Migration, ein Framework-Upgrade, eine Umbenennung überall. Wähle sie an derselben Stelle, **Optionen** → **Schwarm** → **Kampagne** („Eine große Änderung in Teilen, jeder in einem Worktree“), in einem Ordner, der ein Git-Repository ist. Die Zeile Schwarm lautet dann „Kampagne · 5 gleichzeitig“. In einer Sitzung, die schon läuft, tut ihr Menü (⋯) → **Sitzungseinstellungen** → **Schwarm** → **Kampagne** ab deiner nächsten Nachricht dasselbe.

Die Leitung zerlegt die Änderung nach Paketen, Modulen oder Ordnern und veröffentlicht ihren Plan. Jedes Mitglied bearbeitet einen Teil auf eigenem Branch im neuen Worktree, maximal so viele parallel wie die Schwarm-Größe. Es führt Prüfungen aus und meldet den Teil als fertig oder fehlgeschlagen. Fehlerhafte Teile erhalten einen zweiten Versuch. Die Leitung führt fertige Teile einzeln zusammen und prüft nach jedem Schritt, oder öffnet auf deinen Wunsch je einen Pull-Request. Abschließend berichtet sie über Änderungen und Fehlschläge. Die Leiste zeigt etwa „Kampagne · 12 von 40 Teilen fertig · 2 fehlgeschlagen“. Im Board stehen neben Beiträgen die Teile und ihr Status. Siehe [Kampagnen: eine große Änderung in vielen Teilen](/guide/engineering#campaigns-a-big-change-in-many-parts).

## Eine Zweitmeinung zu einem Durchlauf einholen

Bei einer Zweitmeinung prüft das Modell eines anderen Anbieters die geänderten Dateien, ausgeführten Befehle und Antwort eines Durchlaufs gegen deinen Auftrag. Es sucht fehlende Arbeit oder unbelegte Erledigungsbehauptungen, Fehler in Code, Fakten, Zahlen oder Auftragsverständnis, Risiken wie Datenverlust, Geheimnisoffenlegung und Regressionen sowie störende, nicht beauftragte Zusatzänderungen. Die Agentenantwort gilt dabei als zu prüfende Behauptung, nicht als Beweis.

### Anfordern

1. Öffne das Menü der Sitzung (⋯) und wähle **Zweitmeinung**.
2. Wähle unter **Wer prüft es?** den Prüfer; die Empfehlung steht oben.
3. Wähle unter **Durchlauf auswählen** aus bis zu zwölf zuletzt abgeschlossenen Durchläufen mit Zeitpunkt und Zahl geänderter Dateien. Der neueste ist vorausgewählt.
4. Klicke auf **Fragen**; die Schaltfläche nennt den Prüfer, etwa **Codex fragen**.

Unter dem Durchlauf erscheint sofort eine Karte, die sich meist innerhalb von ein bis zwei Minuten füllt. Laufende Durchläufe sind erst nach ihrem Ende prüfbar. Auf dem Smartphone öffnet der Dialog von unten.

### Wer die Arbeit prüfen kann

Es kommen nur Modelle anderer Anbieter infrage, damit kein Anbieter seine eigene Arbeit prüft:

- **Claude Code**-Sitzungen und andere Sitzungen mit Anthropic-Modell können von **Codex** über dessen Programm oder einem nicht von Anthropic stammenden Custom-Modell geprüft werden.
- **Codex**-Sitzungen und andere Sitzungen mit OpenAI-Modell können von **Claude**, Sonnet über Claude Code, oder einem Custom-Modell außerhalb von OpenAI geprüft werden.
- Andere Sitzungen mit Custom oder weiteren Agenten und Modellen anderer Anbieter können Claude, Codex oder ein Custom-Modell eines jeweils anderen Anbieters verwenden.

Custom bietet deine unter [Einstellungen → Modelle](/settings?s=models) hinzugefügten Modelle an. Die Prüfung liest nur. Claude und Codex dürfen gezielt Dateien im Sitzungsordner öffnen, verändern aber nichts. Zusätzlich zum Durchlauf sehen sie deine erste Sitzungsnachricht und deine Nachricht unmittelbar vor dem Durchlauf. Zu große Änderungen werden nur teilweise übergeben; die Karte weist darauf hin.

### Inhalt der Prüfkarte

Die Überschrift der Karte lautet **Zweitmeinung** und der Name des Prüfers, dann:

- Solange er arbeitet: „Arbeit wird geprüft“ und wie lange es schon dauert, mit einer Zeile, die sagt, was der Prüfer gerade liest.
- nach Abschluss eine Zusammenfassung nach Schweregrad wie „1 kritisch · 2 wichtig“, **Sieht gut aus** mit gegebenenfalls kleineren Hinweisen oder **Kein klares Urteil**, wenn die Antwort nicht als Prüfergebnis gelesen werden konnte;
- bei Fehlschlag **Keine Antwort** mit Grund, etwa fehlendes Prüferprogramm, keine Antwort innerhalb von acht Minuten oder zwischenzeitlicher App-Neustart, und **Erneut versuchen**.

Die Überschrift klappt die Karte auf oder zu. Innen stehen Zusammenfassung und Befunde nach Schweregrad. Jeder Befund nennt:

- **Kritisch** für falsche, defekte oder unsichere Ergebnisse, **Wichtig** für vor Verwendung zu korrigierende Probleme oder **Kleinigkeit** für prüfenswerte, vertretbare Hinweise;
- ein kurzer Titel und die Datei und Zeile, um die es geht (klicke darauf, um die Datei dort zu öffnen);
- Problem, Auswirkungen und Korrekturvorschlag.

Bei schwereren Befunden sind Kleinigkeiten unter **N kleinere Hinweise anzeigen** eingeklappt; **Kleinere Befunde ausblenden** schließt sie wieder. × entfernt die Karte aus der Ansicht.

### Hinweise an den Agenten senden

- Das Papierflugzeug **An Agenten senden** neben einem Befund übernimmt ihn als bearbeitbaren Entwurf ins Nachrichtenfeld.
- **Alles an den Agenten senden** übernimmt sämtliche angezeigten Befunde.
- Während der Agent arbeitet, fügt **Alle in die Warteschlange stellen** beziehungsweise **Einreihen** sie der Warteschlange für das Ende des Durchlaufs hinzu.

Die Nachricht nennt Prüfer, Befunde mit Schweregrad und Dateien und bittet den Agenten, jeden Punkt zu prüfen, bestätigte Probleme zu beheben und begründet zu erklären, was er unverändert lässt.

## Modelle in der Arena vergleichen

Die Modell-Arena sendet denselben Auftrag gleichzeitig an zwei oder drei Modelle. Du vergleichst Antworten und behältst die beste. Deine Auswahl zählt für eine Bewertung, die zeigt, welche Modelle deine Aufgaben am besten lösen.

### Einen Vergleich starten

1. Wähle auf der Startseite Programm und Modell wie gewohnt; das ist das erste Modell.
2. Öffne **Optionen** → **Arena** und wähle **Modelle vergleichen** („Derselbe Auftrag an mehrere Modelle, direkt nebeneinander“).
3. Wähle unter „Zusätzlich zum gewählten Modell fragen, höchstens 2“ ein oder zwei weitere Modelle. Angeboten werden einige Modelle von Claude Code, Codex, Custom und weiteren Agenten. **Modell suchen** grenzt lange Listen ein.
4. Schreibe den Auftrag und klicke **Starten**.

Die Arena-Zeile zeigt „+1 Modell“ oder „+2 Modelle“, die Optionsschaltfläche nennt den Modus. Der Browser merkt sich die Modellauswahl, aktiviert die Arena aber nicht für die nächste Sitzung.

Wenn du zum ersten Mal **Modelle vergleichen** wählst, erklärt ein Dialog namens „Bevor du Arena verwendest“, was sie tut, wofür sie sich lohnt, wofür nicht und was sie kostet; drücke **Arena verwenden**, um weiterzumachen, oder **Abbrechen**. Er erscheint einmal für dich, auf allen Geräten, unabhängig davon, ob Tipps an sind oder nicht. Anders als eine tiefgehende Recherche oder ein Schwarm ist die Arena nur auf der Startseite wählbar: Sie schickt deine erste Nachricht an die anderen Modelle, deshalb lässt sie sich nicht zu einer Sitzung hinzufügen, die schon läuft.

Jedes Modell arbeitet in einer eigenen Sitzung mit demselben Auftrag, Anhängen, Ordner und Sitzungseinstellungen für Agent, Memory und Ausgabenlimit sowie seinen üblichen Denkaufwands- und Berechtigungswerten. Aktiviere in Git-Repositorys **Neuer Worktree** im Ordnermenü, damit die Modelle getrennte Codekopien verwenden. Kann ein Modell nicht starten, meldet die App das; der Vergleich läuft ohne dieses Modell weiter.

### Antworten vergleichen und die beste behalten

Jede Vergleichssitzung zeigt über dem Nachrichtenfeld **Arena** mit „Derselbe Auftrag ging an weitere Modelle“ und **Antworten vergleichen**. Die Vergleichsseite zeigt oben den Auftrag und pro Modell eine während der Ausgabe wachsende Antwortspalte, am Computer nebeneinander, auf dem Smartphone untereinander.

- **Dieses behalten** ist nach der ersten Antwort verfügbar. Die Sitzung gewinnt, andere werden archiviert und bleiben dort weiterhin lesbar. Die Spalten heißen anschließend **Behalten** und **Archiviert**.
- **Öffnen** führt zur Sitzung eines Modells. Beim behaltenen steht dort **Hier fortsetzen**, um die Unterhaltung mit dem Gewinner fortzusetzen.
- **Welche Modelle gewinnen** beziehungsweise auf dem Smartphone **Rangliste** öffnet Nutzung → Arena.

### Sieger und Bewertungen ansehen

[Nutzung → Arena](/arena), in der Suche per Strg+K als „Modell-Arena“ auffindbar, zeigt **Welche Modelle bei deinen Aufgaben gewinnen** mit **Bewertung**, Anzahl **Behalten** im Verhältnis zu Vergleichen und **Siegquote**, die auf dem Smartphone entfällt. Verwendet wird eine Elo-Wertung wie im Schach, beginnend bei 1000. In jedem entschiedenen Vergleich gewinnt die behaltene Antwort gegen alle anderen.

Darunter stehen unter **Vergleiche** bis zu 100 letzte Vergleiche mit Auftrag, Modellen, Zeitpunkt und Gewinner oder **Offen** bei noch fehlender Entscheidung. Ein Klick öffnet die Antworten.

## Ein Ausgabenlimit setzen

Ein Ausgabenlimit ist das Meiste, was eine Sitzung ausgeben darf, zu API-Preisen: was ihre Tokens über die API kosten würden, egal mit welchem Abo du tatsächlich zahlst. Wenn sie es erreicht, hält der Agent an, bis du das Limit erhöhst. Es ist eine gute Ergänzung zu allem, was viele Agenten laufen lässt: eine tiefgehende Recherche, ein Schwarm, Subagenten, ein Arena-Vergleich.

### Was mitgezählt wird

- Modellaufrufe der Sitzung einschließlich agenteneigener Subagenten, etwa innerhalb von Claude Code.
- Gestartete Hydor-Subagenten, die unter das übergeordnete Limit fallen.
- Lokale Modelle über Ollama oder vLLM zählen mit null Kosten.
- Tokens ohne bekannten Preis lassen sich nicht erfassen. Der Limitdialog weist darauf hin, wenn deshalb höhere tatsächliche rechnerische Kosten möglich sind.

Siehe [Nutzung, Limits und Kosten](/guide/usage) zu den Gesamtkosten.

### Beim Start ein Limit festlegen

Öffne auf der Startseite **Optionen** → **Ausgabenlimit**. Gib einen Betrag in Dollar ein und drücke **Set** (oder Enter), oder wähle 1,00 $, 5,00 $, 10,00 $ oder 25,00 $. **Keine Obergrenze** entfernt es. Der Chip Optionen nennt dann das Limit („Ausgabenlimit: 5,00 $“).

Anders als Tiefgehende Recherche, Schwarm und Arena bleibt die Limitauswahl für weitere Sitzungen geräteübergreifend bestehen, bis du sie änderst.

### Ein Sitzungslimit festlegen oder ändern

Öffne das Menü der Sitzung (⋯) → **Sitzungseinstellungen** → **Ausgabenlimit** (das aktuelle Limit steht daneben). Der Dialog zeigt **Bisher ausgegeben**, aufgeteilt auf diese Sitzung und ihre Hydor-Subagenten, wenn sie welche hat („Diese Sitzung 1,20 $, ihre Hydor-Subagenten 0,80 $“; der Dialog ergänzt „Gestartete Subagenten zählen mit.“), und bei einem Hydor-Subagenten, wie viel vom Limit seiner übergeordneten Sitzung ausgegeben ist. Gib einen Betrag unter **Ausgabenlimit** ein oder wähle 1,00 $, 5,00 $, 10,00 $ oder 25,00 $, dann drücke **Limit festlegen** (oder **Veränderung**). **Limit entfernen** nimmt es weg.

Möglich sind 0,01 bis 100.000 $. Liegt das Limit nicht über dem bisherigen Verbrauch, warnt der Dialog, dass die Sitzung gestoppt bleibt. Auf dem Smartphone öffnet er von unten.

### Die Leiste über dem Nachrichtenfeld

Solange eine Sitzung ein Limit hat, zeigt eine Leiste über ihrem Nachrichtenfeld, wie viel davon sie ausgegeben hat („1,20 $ von 5,00 $“), mit einer Linie, die sich füllt: gelb ab 80 %, rot am Limit, wo **Ausgabenlimit erreicht** steht. Haben Hydor-Subagenten einen Teil davon ausgegeben, steht dort zusätzlich „mit Subagenten“ (auf einem breiteren Bildschirm); zeige auf die Beträge, um die Aufteilung zu sehen. **Veränderung** (oder **Erhöhen**, sobald es erreicht ist) öffnet den Dialog zum Limit.

### Was am Limit passiert

Geprüft wird nach jedem Modellaufruf. Der Durchlauf stoppt nach dem Aufruf, der das Limit erreicht, sodass die Summe leicht darüber liegen kann:

- Der Agent stoppt. Unter dem Durchlauf steht „Am Ausgabenlimit gestoppt“ mit Verbrauch, Limit und **Limit erhöhen …**. Eine Benachrichtigung nennt die Sitzung.
- Ihre laufenden Hydor-Subagenten stoppen ebenfalls. Ihr Hinweis sagt, dass die Sitzung, die sie gestartet hat, ihr Ausgabenlimit erreicht hat, mit **Öffnen**, um dorthin zu gehen.
- Neue Nachrichten warten. Gesendeter Text wird nicht weitergegeben, sondern kommt mit einem Limit-Hinweis zurück ins Feld. Die Warteschlange bleibt angehalten, bis du das Limit erhöhst oder entfernst.

### Das Limit erhöhen oder entfernen

Wähle **Erhöhen** in der Leiste, **Limit erhöhen …** im Hinweis oder das Sitzungsmenü. Setze ein Limit oberhalb des bisherigen Verbrauchs oder entferne es. Wartende Nachrichten werden anschließend gesendet. Subagenten, die am übergeordneten Limit stoppten, nehmen nach dessen Erhöhung ebenfalls wieder Nachrichten an.

### Limits für Subagenten

Jeder neue Hydor-Subagent erhält einen gleichen Anteil des verbleibenden übergeordneten Budgets, aufgeteilt zwischen Leitung und der maximal gleichzeitig möglichen Subagentenzahl. Das übergeordnete Limit umfasst weiterhin alle und stoppt beim Erreichen sämtliche Beteiligten. Ist nichts mehr übrig, kann die Leitung keine weiteren Subagenten starten und soll mit den vorhandenen Ergebnissen abschließen.

### Limits für geplante Aufgaben und Apps

- **Geplante Aufgaben**: Der Editor unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks), **Neue Aufgabe** oder Aufgabenmenü → **Bearbeiten** enthält das **Ausgabenlimit** wie die Startseite. **Stoppt oberhalb von $** unter **Pro Ausführung** setzt dasselbe Limit; leer bedeutet unbegrenzt. Jede neue Ausführungssitzung hält daran an. Fügt eine Ausführung stattdessen eine Nachricht in eine vorhandene Sitzung ein, gilt deren eigenes Limit. Aus einer Unterhaltung erstellte Aufgaben übernehmen deren Einstellungen einschließlich Ausgabenlimit. Siehe [Geplante Aufgaben](/guide/tasks).
- **Apps**: Unter **Grenzen** gibt es **Maximale Kosten pro Lauf (US$)**. Siehe [Apps](/guide/apps).

## Einen Agenten fragen

- „Starte Tiefgehende Recherche zu Wärmepumpen für ein Haus aus den 1930er-Jahren mit sechs gleichzeitigen Recherche-Agenten, Word-Bericht und 10 $ Limit.“
- „Wie weit ist Tiefgehende Recherche in meiner Sitzung ‚Ladestationen im Vergleich‘?“
- „Aktiviere dort ab meiner nächsten Nachricht Tiefgehende Recherche mit sechs Recherche-Agenten und Word-Bericht.“
- „Schalte meine Sitzung ‚Unzuverlässige Tests‘ auf Schwarm und auf mein Zeichen wieder auf einen Agenten zurück.“
- „Setze für diese Sitzung ein Limit von 5 $ und nenne den bisherigen Verbrauch.“
- „Erlaube sechs gleichzeitige Subagenten je Sitzung und acht Mitglieder pro Schwarm.“
- „Welche Subagenten hat Hydor gestartet und welche Claude Code?“
- „Hole eine Zweitmeinung zum letzten Durchlauf der Sitzung ‚Abrechnungsumbau‘ ein und erkläre die Ergebnisse.“
- „Welche Modelle gewinnen in meiner Arena? Behalte im letzten Vergleich die Antwort von Claude Code.“
