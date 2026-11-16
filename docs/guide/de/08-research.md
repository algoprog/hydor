# Deep research, Zweitmeinungen und mehrere Agenten

Reicht ein einzelner Agent nicht aus, kann die App mehrere einsetzen: Deep research verteilt Teilfragen an Recherche-Agenten und liefert einen Bericht mit Quellen; Subagenten übernehmen abgegrenzte Teilaufgaben; ein Swarm untersucht ein schwieriges Problem aus mehreren Richtungen; eine Kampagne setzt eine große Änderung in Teilaufgaben um. Zusätzlich kannst du die Arbeit von einem Modell eines anderen Anbieters prüfen lassen, mehrere Modelle mit demselben Auftrag vergleichen und die beste Antwort behalten. Ein Ausgabenlimit begrenzt dabei die rechnerischen Kosten der Sitzung.

![Deep research auf der Startseite mit gleichzeitigen Recherche-Agenten, Runden, Suchbudget und Berichtsformat](images/research.webp)

## Deep research starten

Deep research eignet sich für Fragen mit vielen Quellen: Optionen vergleichen, Behauptungen prüfen, einen Themenüberblick erstellen oder den Forschungsstand ermitteln. Der gestartete Agent leitet die Recherche. Er plant Suchanfragen, verteilt Teilfragen, verfolgt offene Punkte, lässt Kernaussagen anhand zweier Quellen prüfen und erstellt einen Bericht mit Quellenangaben.

### Aktivieren

1. Öffne auf der Startseite **Optionen** rechts unter dem Nachrichtenfeld und wähle **Research**.
2. Wähle **Deep research** mit „Breit recherchieren, Quellen prüfen und zitieren“. Darunter erscheinen die Einstellungen.
3. Lege Umfang und Berichtsformat fest; siehe unten.
4. Schreibe deine Frage und klicke auf **Starten**.

Die Recherchezeile zeigt nun etwa „Deep research · 60 Suchen“ als Suchbudget; auch die Optionsschaltfläche nennt den Modus. **Aus** mit „Ein Agent antwortet und sucht bei Bedarf“ kehrt zur einfachen Sitzung zurück.

Auf dem Smartphone öffnen sich Optionen als Bedienfeld von unten und Recherche darüber.

Deep research und Swarm beziehungsweise Kampagne verwenden jeweils ein Team aus Hydor-Subagenten. Deshalb lässt sich nur eine dieser Varianten gleichzeitig aktivieren.

Bei der ersten Auswahl erklärt „Bevor du Deep research verwendest“ Funktionsweise, geeignete und ungeeignete Aufgaben sowie Kosten. **Deep research verwenden** setzt fort, **Abbrechen** lässt die Einstellung unverändert. Der Hinweis erscheint einmal geräteübergreifend, unabhängig davon, ob du auf der Startseite, in einer geplanten Aufgabe oder im Sitzungsdialog aktivierst und ob Tipps eingeschaltet sind. Wenn du einen Agenten bittest, die Tipps erneut zu zeigen, erscheint er wieder.

Du kannst die Funktion auch später unter **⋯ → Sitzungseinstellungen → Deep research** einschalten. Der Eintrag zeigt **Aus** oder etwa „60 Suchen“. Im Dialog stehen **Aus**, **Deep research** und dieselben Einstellungen für **Gleichzeitige Recherche-Agenten**, **Runden**, **Suchen insgesamt** und **Berichtsformat**. **Speichern** übernimmt, **Abbrechen** verwirft. Die Änderung gilt ab deiner nächsten Nachricht: Claude Code oder Codex startet vorher mit neuen Anweisungen und Tools neu und setzt das Gespräch fort. Deep research schaltet Swarm aus und umgekehrt. Dieselbe Einstellung findest du in **Optionen** neben dem **+** im Nachrichtenfeld unterhalb von **Berechtigungen**.

Bei vertraulichen Sitzungen und von anderen Sitzungen gestarteten Agenten wie Swarm-Mitgliedern, Recherche-Agenten oder Subagenten fehlt der Eintrag.

Auch eine geplante Aufgabe kann bei jedem Lauf Deep research starten. Ihr Editor hat dieselbe Option **Research**; siehe [Geplante Aufgaben](/guide/tasks).

### Einstellungen

- **Gleichzeitige Recherche-Agenten**: 1 bis 8, anfangs 4. Bestimmt, wie breit jede Runde parallel recherchiert.
- **Runden**: 1 bis 5, anfangs 2. Jede Runde verfolgt offene Punkte der vorherigen. Anschließend folgt eine separate Prüfrunde.
- **Suchen insgesamt**: 10 bis 500 in Zehnerschritten, anfangs 60. Dieses Budget gilt gemeinsam für Leitung und Recherche-Agenten.
- **Berichtsformat**: **Seite** oder **Word**.

Der Browser merkt sich die Zahlen für deinen nächsten Durchlauf mit Deep research. Der Modus selbst bleibt nicht aktiv: Neue Sitzungen starten ohne Recherchemodus, da Deep research ein Mehrfaches einer einzelnen Antwort kostet.

### Ablauf

1. **Planen.** Die Leitung klärt, was die Frage bedeutet und was eine vollständige Antwort enthalten muss. Sie bildet Teilfragen und formuliert verschiedene Suchanfragen, bei Bedarf mehrsprachig und auf geeignete Quellen wie amtliche Daten, Fachartikel, Originaldokumente und verlässliche Berichte ausgerichtet. Nur bei entscheidenden Unklarheiten fragt sie einmal kurz nach; andernfalls nennt sie ihre Annahmen und arbeitet weiter.
2. **Erste Runde.** Bis zur festgelegten Zahl startet je ein Hydor-Recherche-Agent pro Teilfrage. Sein Auftrag enthält Gesamtfrage, eigenen Teil, erste Suchanfragen, ungefähres Teilbudget und erwarteten Bericht. Die Leitung wartet auf die Berichte, die als Nachrichten zurückkommen.
3. **Weitere Runden.** Die Leitung liest die Ergebnisse und beauftragt neue Agenten mit Lücken, Widersprüchen und nur einfach belegten Aussagen. Sind keine wichtigen Fragen offen, entfällt eine Runde. Nach jeder Runde nennt sie kurz Ergebnisse und nächste Schritte.
4. **Prüfen.** Zentrale Aussagen benötigen zwei unabhängige Quellen oder werden als nur einfach belegt beziehungsweise umstritten gekennzeichnet. Ein Recherche-Agent oder die Leitung selbst öffnet die Quellen und prüft, ob die Kernaussagen und Zahlen tatsächlich darin stehen. Nicht haltbare Angaben werden korrigiert oder entfernt.
5. **Bericht.** Ein klarer Titel und eine kurze Antwort leiten den gegliederten Bericht ein. Jede belegpflichtige Aussage erhält eine nummerierte Quellenangabe; am Ende stehen Titel, Website, Datum und Link der Quellen. Unsicherheiten und Streitpunkte werden begründet. Eine kurze Zusammenfassung erscheint im Gespräch.

Die Recherche verwendet App-Websuche und Seitenabruf; siehe [Suche und Browser](/guide/web). Die eigenen Websuchen von Claude Code und Codex sind dabei deaktiviert, damit jede Suche zum Budget zählt. Ist es verbraucht, werden weitere Suchen abgelehnt und der Agent soll aus vorhandenen Ergebnissen berichten. Nach den festgelegten Runden und der Prüfrunde kann die Leitung ebenfalls keine weiteren Recherche-Agenten starten.

### Den Fortschritt verfolgen

Über dem Nachrichtenfeld der Leitung zeigt eine Leiste **Deep research** mit dem aktuellen Schritt: „Planung“, „Runde 1 von 2 · 4 Recherche-Agenten arbeiten“, zwischen Runden „Berichte lesen“, „Quellen prüfen“, „Bericht schreiben“ und zuletzt „Bericht fertig“. Dazu steht der Budgetverbrauch, etwa „12 von 60 Suchen“. **Bericht öffnen** rechts öffnet die fertige Bibliotheksseite oder das Word-Dokument. Beim Darüberfahren siehst du Einstellungen und Berichtsformat.

Jeder Recherche-Agent erscheint als entsprechend markierte Karte im Gespräch und unter der Leitung in der Seitenleiste, wie andere [Hydor-Subagenten](/guide/research#follow-subagents). Zurückgesendete Berichte erscheinen als Zeile „Antwort von“ mit Titel und Ergebnisanfang. Ein Klick öffnet den Bericht. In der Recherche-Agentensitzung steht „Recherchiert für“ mit dem Titel der Leitung; **Leitung** führt zurück.

### Der Bericht

- **Seite**: Der Bericht wird als bleibende Seite gespeichert, im Gespräch angezeigt und in der Bibliothek aufbewahrt. Siehe [Bibliothek: Seiten, Bilder, Videos und Websites](/guide/library).
- **Word**: Ein .docx-Dokument im Sitzungsordner, erstellt mit dem Skill **word-documents**, erscheint als Dateikarte zum Öffnen oder Herunterladen. Siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice#open-or-download-the-files-an-agent-made).

Deep research führt viele Agenten gleichzeitig aus. Setze vorher im selben Optionsmenü ein Ausgabenlimit, das Leitung und alle Recherche-Agenten einschließt. Siehe [Ein Ausgabenlimit setzen](/guide/research#put-a-spending-cap-on-a-session).

## Arbeit an Subagenten übergeben

Jeder Agent kann eine eigenständige Teilaufgabe parallel von einem Subagenten bearbeiten lassen und dessen Ergebnis erhalten. Die App unterscheidet zwei Arten: Ein **Hydor-Subagent** ist eine eigene Sitzung mit frei wählbarem Agentenprogramm und Modell, Karte im Gespräch, Eintrag unter der Leitung in der Seitenleiste, eigenen Kosten und einem Anteil am Ausgabenlimit. Du kannst seine Sitzung öffnen und ihm schreiben; seine Antwort geht als Nachricht an die Leitung. Ein **Claude-Code-Subagent** beziehungsweise **Codex-Subagent** läuft für einen Teilauftrag innerhalb des jeweiligen Programms. Er erscheint über dem Nachrichtenfeld, zeigt seine Schritte in einem Bereich, lässt sich stoppen, aber nicht direkt anschreiben. Seine Kosten zählen zur Hauptsitzung. Die Übersicht nennt die Art, etwa „Hydor-Subagent · Claude Code · Sonnet 5.5“ oder „Claude-Code-Subagent“, und erklärt beim Darüberfahren die Zuständigkeit. Siehe [Subagenten](/guide/sessions#subagents). Im Folgenden geht es um Hydor-Subagenten.

Du musst nichts aktivieren. Bitte etwa „Lass drei Subagenten jeweils einen Anbieter recherchieren“ oder „Lass Codex die Tests schreiben, während du die Dokumentation bearbeitest“, oder überlasse die Aufteilung dem Agenten. Der Hauptagent soll selbstständig planen und prüfen und klare Teilaufgaben an günstigere Modellstufen delegieren. Siehe [Modellstufen für unterschiedliche Aufgaben](/guide/agents-models#tiers-a-model-for-each-kind-of-job). Dort lässt sich das mit **Mit Subagenten arbeiten** ausschalten.

Für jeden Hydor-Subagenten legt der Agent fest:

- **Agentenprogramm und Modell**: Custom mit einem seiner unter [Einstellungen → Modelle](/settings?s=models) hinzugefügten Modelle, Claude Code, Codex oder ein anderer Agent wie Gemini CLI oder OpenCode. Standard ist dasselbe Programm wie bei der Leitung. Günstige oder lokale Modelle eignen sich für umfangreiche Routinearbeit, Claude Code oder Codex für anspruchsvolle Teile.
- **Modellstufe**: **Quick** für kleine, sehr klare Aufgaben, **Standard** für klare Aufgaben mittleren Umfangs und als Vorgabe ohne Auswahl, **Best** für schwierige eigenständige Teilaufgaben. Das Modell je Programm und Stufe kommt aus [Einstellungen → Modelle → Modellstufen](/settings?s=models&find=Tiers). Subagenten verwenden nie eine höhere Stufe als ihre Leitung. Eigene Agenten können niedrigere Höchststufen vorgeben.
- **Einen deiner Agenten** per Name statt eines allgemeinen Subagenten. Dieser verwendet eigene Anweisungen, Tools und Modellstufe. Siehe [Agenten mit delegierten Aufgaben](/guide/agents#agents-that-hand-work-to-other-agents). Ein Agent mit fortlaufendem eigenem Gespräch erhält die Aufgabe stattdessen im Posteingang und antwortet, wenn er sie bearbeitet.
- **Ordner**: standardmäßig der Arbeitsordner der Leitung, sonst ein ausdrücklich anderer.
- **Worktree** bei Bedarf: separate Repository-Kopie auf einem neuen Branch, damit Änderungen getrennt bleiben.
- **Kurztitel** als sichtbarer Name.

Hydor-Subagenten sehen das übergeordnete Gespräch nicht. Deshalb erhalten sie einen vollständigen Auftrag mit allen nötigen Angaben. Niemand betreut sie laufend: Kleinere Fragen entscheiden sie selbst und dokumentieren die Entscheidung. Sie fragen nur nach, wenn sie nicht weiterkommen.

### Wie Antworten zurückkommen

Endet ein Hydor-Subagentendurchlauf, geht die Antwort als Nachricht an die Leitung und aktiviert sie wieder. Arbeitet diese gerade, wartet die Antwort bis zum Ende ihres Durchlaufs in der Warteschlange.

Im übergeordneten Gespräch steht „Antwort von“ mit Subagententitel und Textanfang. Ein Klick öffnet die Antwort oder bei langen Texten eine Zusammenfassung. **Sitzung öffnen** oder **Ganze Antwort lesen** führt zum Subagenten. Vorzeitig gestoppte Agenten erscheinen mit „… wurde gestoppt“, Fehler mit „… mit Fehler beendet“.

- Antworten über etwa 4.000 Zeichen werden vom Hilfsmodell zusammengefasst; die Leitung kann weiterhin den Volltext lesen. Siehe [Agenten, Konten und Modelle](/guide/agents-models).
- Fehler und vorzeitige Stopps werden ebenfalls an die Leitung gemeldet.
- Bei Quick und Standard prüft das Hilfsmodell Auftrag und Antwort kurz. Ist das Ergebnis unzureichend oder schlägt der Agent fehl, wird die Aufgabe eine Stufe höher erneut ausgeführt, höchstens auf Best und nie über die von der Leitung erlaubte Höchststufe. Die Leitung erfährt Grund und Wechsel. Nur die ursprüngliche Auftragsantwort wird so geprüft, nicht spätere Antworten. Eigene Agenten können **Bei fehlgeschlagener Prüfung hochstufen** deaktivieren. Die Leitung kann auch selbst bei unzureichenden Ergebnissen hochstufen.
- Die Leitung kann jederzeit Aktivität, Programm, Modell, Kosten und Anfang der neuesten Antwort ihrer Subagenten abrufen und ihnen weitere Aufgaben geben.
- Antworten aus während eines App-Stopps beendeten Durchläufen werden nach dem Neustart zugestellt.

Du kannst Hydor-Subagenten wie andere Sitzungen öffnen und anschreiben. Jede abschließende Antwort geht ebenfalls an die Leitung.

### Subagenten verfolgen

- **Im übergeordneten Gespräch**: Jeder Hydor-Subagent hat unter seinem Startdurchlauf eine Karte mit Titel, Art, bei Deep research **Recherche-Agent**, Programm, Modell, Aktivität, gegebenenfalls „Läuft nicht“ oder „Mit Fehler beendet“, letzter Aktivität, Kosten und bei Hochstufung ursprünglicher Stufe und Grund. **Öffnen** führt zur Sitzung. Während der Arbeit stoppt die quadratische Schaltfläche seinen Durchlauf.
- **In der Seitenleiste**: Subagenten stehen eingeklappt unter der Leitung, etwa „3 Subagenten · 1 benötigt dich · 2 in Arbeit“. Die Liste bleibt geöffnet, während du einen davon ansiehst. Auf dem Smartphone klappt Antippen sie auf, ohne das Seitenleistenmenü zu schließen.
- **Beim Subagenten**: Über dem Nachrichtenfeld stehen „Subagent von“, übergeordneter Titel, „Antworten gehen dorthin zurück“ und **Übergeordnete Sitzung öffnen**.

Ein Subagent mit Freigabeanfrage oder Rückfrage wartet wie jede andere Sitzung und erscheint im Posteingang. Siehe [Posteingang und Benachrichtigungen](/guide/inbox).

### Möglichkeiten und Grenzen von Hydor-Subagenten

- **Eine Ebene.** Ein Hydor-Subagent kann keine eigenen Hydor-Subagenten starten. Er bearbeitet seinen Teil selbst und nennt weiteren Bedarf.
- **Keine weitergehenden Berechtigungen.** Ein Subagent erhält niemals mehr Freiheiten als die Leitung. Beim Wechsel zwischen Claude Code, Codex und Custom wird der freizügigste Modus gewählt, der diese Grenze einhält. Andere Programme wie Gemini CLI starten mit ihrem eigenen Standard.
- **Anteil am Limit.** Bei begrenzten Ausgaben erhält jeder neue Hydor-Subagent einen Anteil des Restbudgets. Das übergeordnete Limit umfasst trotzdem alle. Siehe [Limits für Subagenten](/guide/research#caps-for-subagents).
- **Dasselbe Konto.** Läuft derselbe Agententyp wie bei der Leitung, also Claude Code oder Codex, verwendet er deren Konto.
- **Begrenzte Parallelität.** Pro Sitzung laufen nur eine bestimmte Zahl Hydor-Subagenten gleichzeitig. Vor weiteren Starts wartet der Agent auf freie Plätze.

### Gleichzeitige Subagenten festlegen

Unter [Einstellungen → Funktionen → Subagenten](/settings?s=children) stellst du **Gleichzeitig pro Sitzung** mit − und + auf 1 bis 12, anfangs 4. Der Eintrag liegt in der Gruppe **Subagenten**; **(i)** erklärt deren Grenzen. [Zur Einstellung](/settings?s=children&find=Working%20at%20once%2C%20per%20session). Das Limit gilt je Sitzung, nicht für die ganze App. Für Deep research gilt eine eigene Zahl gleichzeitiger Recherche-Agenten, Swarm die **Swarm-Größe**.

## Ein schwieriges Problem mit einem Swarm bearbeiten

Ein Swarm setzt ein Agententeam auf ein Problem an. Die Leitung bildet unterschiedliche Lösungsansätze mit verschiedenen Methoden, Annahmen oder Blickwinkeln und startet pro Ansatz ein Mitglied. Mitglieder teilen Versuche und Ergebnisse auf einem Board, lesen Beiträge und schreiben einander. Die Leitung steuert, besetzt frei werdende Plätze neu und lässt das Ergebnis vor der Übergabe prüfen.

Geeignet sind schwierige Probleme mit mehreren möglichen Wegen: Beweise, hartnäckige Fehler oder Fragen ohne klaren Einstieg. Die Kosten liegen bei einem Mehrfachen eines einzelnen Agenten.

### Einen Swarm starten

1. Öffne auf der Startseite **Optionen → Swarm**.
2. Wähle **Swarm**, etwa „Bis zu 5 Agenten gleichzeitig, mit unterschiedlichen Ansätzen“. Die Zahl entspricht deiner Swarm-Größe.
3. Schreibe den Auftrag und klicke **Starten**.

Die Zeile zeigt etwa „Ein · 5 gleichzeitig“ und die Optionsschaltfläche nennt den Modus. **Swarm-Größe** unten führt zur Einstellung. Wie bei Deep research wird der Modus nicht für die nächste Sitzung gespeichert; beide schließen einander aus. Ein Ausgabenlimit im selben Menü umfasst Leitung und alle Mitglieder. Geplante Aufgaben haben dieselbe **Swarm**-Option für jeden Lauf.

Bei der ersten Auswahl von **Swarm** oder **Kampagne** erklärt „Bevor du Swarm verwendest“ Funktion, passende und ungeeignete Aufgaben sowie Kosten. **Swarm verwenden** fährt fort, **Abbrechen** lässt den Modus ausgeschaltet. Der Hinweis erscheint je Modus einmal geräteübergreifend, unabhängig von Tipps. Eine Bitte an den Agenten, Tipps erneut zu zeigen, setzt ihn zurück.

Auch innerhalb einer Sitzung kannst du unter **⋯ → Sitzungseinstellungen → Swarm** zwischen **Aus**, **Swarm** und **Kampagne** wechseln. Der Eintrag zeigt den aktuellen Modus. Die Änderung gilt ab der nächsten Nachricht: Claude Code oder Codex startet vorher mit neuen Anweisungen und Tools neu und führt das Gespräch fort. Swarm und Deep research deaktivieren sich gegenseitig. Vertrauliche und von anderen Sitzungen gestartete Sitzungen haben den Eintrag nicht. Die **Optionen** neben **+** enthalten dieselbe Swarm-Auswahl unterhalb von **Berechtigungen**.

### Wie ein Swarm arbeitet

1. Die Leitung klärt Auftrag und überprüfbares Ergebnis und wählt bis zur festgelegten Swarm-Größe unterschiedliche Ansätze. Bei einem Beweis wären das direkte Herleitung, Widerspruch, Induktion, kleine Fälle mit Computersuche oder bekannte Resultate.
2. Pro Ansatz startet ein Hydor-Subagent mit Gesamtproblem, eigenem Ansatz, Abschlusskriterien und Prüfverfahren. Sein Titel nennt den Ansatz. Standardmäßig verwendet er Modell und Denkaufwand der Leitung, sofern diese nichts anderes festlegt.
3. Mitglieder veröffentlichen **Fortschritt** mit Versuchen und Arbeitsstand, **Ergebnis** für nutzbare Erkenntnisse, **Frage** für offene Punkte und **Notiz**. Sie lesen das Board alle paar Schritte, nutzen Ergebnisse anderer, vermeiden widerlegte Wege und beantworten an sie gerichtete Fragen.
4. Die Leitung erhält gebündelte Boardmeldungen: Ergebnisse, Fragen und direkte Nachrichten nach etwa einer Minute, reine Fortschrittsmeldungen alle paar Minuten. Sie verteilt Erkenntnisse, lenkt festgefahrene oder doppelte Ansätze um, lässt Ergebnisse unabhängig prüfen und besetzt freie Plätze mit neuen Ideen.
5. Vor dem Abschluss veranlasst sie eine unabhängige Prüfung durch ein anderes Mitglied, eine Berechnung oder ihre eigene gründliche Kontrolle.
6. Ist das Problem gelöst oder sind die Ansätze ausgeschöpft, stoppt sie übrige Mitglieder und erklärt Ergebnis, Lösungsweg, Prüfung und gescheiterte Ansätze mit Gründen.

Ein fertiges Mitglied sendet seinen Bericht an die Leitung. Eine neue Nachricht an ein gerade nicht arbeitendes Mitglied aktiviert es wieder.

### Fortschritt und Board ansehen

Über dem Nachrichtenfeld der Leitung steht **Swarm**, zunächst mit „Ansätze auswählen“, danach etwa „3 in Arbeit · 2 abgeschlossen · 14 Beiträge“, sowie **Board**. Mitglieder zeigen „Im Swarm von“ mit Leitungstitel, dem Hinweis auf zurückgesendete Beiträge und Berichte sowie **Board** und **Leitung**. In der Seitenleiste stehen sie unter der Leitung, etwa „5 Swarm-Mitglieder · 3 in Arbeit“.

**Board** öffnet die Übersicht, auf dem Smartphone von unten:

- **Mitglieder**: laufende und maximal gleichzeitige Zahl, danach jedes Mitglied mit Aktivität oder „Durchlauf abgeschlossen“, „Gestoppt“ beziehungsweise „Mit Fehler beendet“. Ein Klick öffnet seine Sitzung, **Leitung öffnen** die Hauptsitzung. Vor der Ansatzwahl steht dort, dass noch niemand gestartet wurde.
- **Beiträge**: neueste zuerst, mit Autor als Leitung oder Mitgliedstitel, gegebenenfalls Empfänger, Art wie Fortschritt, Ergebnis, Frage oder Notiz und Alter. Filter sind **Alle**, **Ergebnisse** und **Fragen**. Neue Beiträge erscheinen laufend.

### Mitglieder stoppen

**Alle stoppen** im Board ist bei laufenden Mitgliedern verfügbar. Es stoppt sie, erhält ihre bisherigen Ergebnisse und verhindert das automatische Aufwecken durch neue Beiträge. Die Leitung erfährt den Stopp und kann trotzdem weitere Aufgaben vergeben. Nach einer Lösung stoppt sie die Mitglieder selbst.

### Swarm-Größe festlegen

Unter [Einstellungen → Funktionen → Subagenten](/settings?s=children) bestimmt **Swarm-Größe** in der Gruppe **Swarm** die gleichzeitige Mitgliederzahl pro Swarm oder Kampagne: 1 bis 16, anfangs 5. [Zur Einstellung](/settings?s=children&find=Swarm%20size). Jedes Mitglied kostet ungefähr so viel wie ein eigener Agent; die Leitung startet bei freien Plätzen weitere.

## Eine große Änderung als Kampagne umsetzen

Eine Kampagne ist die zweite Swarm-Variante für große Änderungen über eine Codebasis hinweg, etwa Migrationen, Framework-Upgrades oder umfassende Umbenennungen. Wähle in einem Git-Repository **Optionen → Swarm → Kampagne** mit „Eine große Änderung in Teilaufgaben, jeweils im eigenen Worktree“. Die Zeile zeigt etwa „Kampagne · 5 gleichzeitig“. In laufenden Sitzungen gilt **⋯ → Sitzungseinstellungen → Swarm → Kampagne** ab der nächsten Nachricht.

Die Leitung zerlegt die Änderung nach Paketen, Modulen oder Ordnern und veröffentlicht ihren Plan. Jedes Mitglied bearbeitet einen Teil auf eigenem Branch im neuen Worktree, maximal so viele parallel wie die Swarm-Größe. Es führt Prüfungen aus und meldet den Teil als fertig oder fehlgeschlagen. Fehlerhafte Teile erhalten einen zweiten Versuch. Die Leitung führt fertige Teile einzeln zusammen und prüft nach jedem Schritt, oder öffnet auf deinen Wunsch je einen Pull Request. Abschließend berichtet sie über Änderungen und Fehlschläge. Die Leiste zeigt etwa „Kampagne · 12 von 40 Teilen fertig · 2 fehlgeschlagen“. Im Board stehen neben Beiträgen die Teile und ihr Status. Siehe [Kampagnen: eine große Änderung in vielen Teilen](/guide/engineering#campaigns-a-big-change-in-many-parts).

## Eine Zweitmeinung zu einem Durchlauf einholen

Bei einer Zweitmeinung prüft das Modell eines anderen Anbieters die geänderten Dateien, ausgeführten Befehle und Antwort eines Durchlaufs gegen deinen Auftrag. Es sucht fehlende Arbeit oder unbelegte Erledigungsbehauptungen, Fehler in Code, Fakten, Zahlen oder Auftragsverständnis, Risiken wie Datenverlust, Geheimnisoffenlegung und Regressionen sowie störende, nicht beauftragte Zusatzänderungen. Die Agentenantwort gilt dabei als zu prüfende Behauptung, nicht als Beweis.

### Anfordern

1. Wähle im Sitzungsmenü **⋯ → Zweitmeinung**.
2. Wähle unter **Wer prüft?** den Prüfer; die Empfehlung steht oben.
3. Wähle unter **Welcher Durchlauf?** aus bis zu zwölf zuletzt abgeschlossenen Durchläufen mit Zeitpunkt und Zahl geänderter Dateien. Der neueste ist vorausgewählt.
4. Klicke auf **Fragen**; die Schaltfläche nennt den Prüfer, etwa **Codex fragen**.

Unter dem Durchlauf erscheint sofort eine Karte, die sich meist innerhalb von ein bis zwei Minuten füllt. Laufende Durchläufe sind erst nach ihrem Ende prüfbar. Auf dem Smartphone öffnet der Dialog von unten.

### Wer die Arbeit prüfen kann

Es kommen nur Modelle anderer Anbieter infrage, damit kein Anbieter seine eigene Arbeit prüft:

- **Claude-Code-Sitzungen** und andere Sitzungen mit Anthropic-Modell können von **Codex** über dessen Programm oder einem nicht von Anthropic stammenden Custom-Modell geprüft werden.
- **Codex-Sitzungen** und andere Sitzungen mit OpenAI-Modell können von **Claude**, Sonnet über Claude Code, oder einem Custom-Modell außerhalb von OpenAI geprüft werden.
- Andere Sitzungen mit Custom oder weiteren Agenten und Modellen anderer Anbieter können Claude, Codex oder ein Custom-Modell eines jeweils anderen Anbieters verwenden.

Custom bietet deine unter [Einstellungen → Modelle](/settings?s=models) hinzugefügten Modelle an. Die Prüfung liest nur. Claude und Codex dürfen gezielt Dateien im Sitzungsordner öffnen, verändern aber nichts. Zusätzlich zum Durchlauf sehen sie deine erste Sitzungsnachricht und deine Nachricht unmittelbar vor dem Durchlauf. Zu große Änderungen werden nur teilweise übergeben; die Karte weist darauf hin.

### Inhalt der Prüfkarte

Unter **Zweitmeinung** und Prüfername steht:

- während der Prüfung „Arbeit wird geprüft“, die bisherige Dauer und der gerade gelesene Inhalt;
- nach Abschluss eine Zusammenfassung nach Schweregrad wie „1 kritisch · 2 wichtig“, **Sieht gut aus** mit gegebenenfalls kleineren Hinweisen oder **Kein eindeutiges Urteil**, wenn die Antwort nicht als Prüfergebnis gelesen werden konnte;
- bei Fehlschlag **Keine Antwort** mit Grund, etwa fehlendes Prüferprogramm, keine Antwort innerhalb von acht Minuten oder zwischenzeitlicher App-Neustart, und **Erneut versuchen**.

Die Überschrift klappt die Karte auf oder zu. Innen stehen Zusammenfassung und Befunde nach Schweregrad. Jeder Befund nennt:

- **Kritisch** für falsche, defekte oder unsichere Ergebnisse, **Wichtig** für vor Verwendung zu korrigierende Probleme oder **Kleinigkeit** für prüfenswerte, vertretbare Hinweise;
- Kurztitel und anklickbare Datei mit Zeile;
- Problem, Auswirkungen und Korrekturvorschlag.

Bei schwereren Befunden sind Kleinigkeiten unter **N kleinere Hinweise anzeigen** eingeklappt; **Kleinere Hinweise ausblenden** schließt sie wieder. × entfernt die Karte aus der Ansicht.

### Hinweise an den Agenten senden

- Das Papierflugzeug **An Agenten senden** neben einem Befund übernimmt ihn als bearbeitbaren Entwurf ins Nachrichtenfeld.
- **Alle an Agenten senden** übernimmt sämtliche angezeigten Befunde.
- Während der Agent arbeitet, fügt **Alle einreihen** beziehungsweise **Einreihen** sie der Warteschlange für das Ende des Durchlaufs hinzu.

Die Nachricht nennt Prüfer, Befunde mit Schweregrad und Dateien und bittet den Agenten, jeden Punkt zu prüfen, bestätigte Probleme zu beheben und begründet zu erklären, was er unverändert lässt.

## Modelle in der Arena vergleichen

Die Modell-Arena sendet denselben Auftrag gleichzeitig an zwei oder drei Modelle. Du vergleichst Antworten und behältst die beste. Deine Auswahl zählt für eine Bewertung, die zeigt, welche Modelle deine Aufgaben am besten lösen.

### Einen Vergleich starten

1. Wähle auf der Startseite Programm und Modell wie gewohnt; das ist das erste Modell.
2. Öffne **Optionen → Arena → Modelle vergleichen** mit „Derselbe Auftrag an mehrere Modelle, direkt vergleichen“.
3. Wähle unter „Zusätzlich zum gewählten Modell fragen, höchstens 2“ ein oder zwei weitere Modelle. Angeboten werden einige Modelle von Claude Code, Codex, Custom und weiteren Agenten. **Modell suchen** grenzt lange Listen ein.
4. Schreibe den Auftrag und klicke **Starten**.

Die Arena-Zeile zeigt „+1 Modell“ oder „+2 Modelle“, die Optionsschaltfläche nennt den Modus. Der Browser merkt sich die Modellauswahl, aktiviert die Arena aber nicht für die nächste Sitzung.

Beim ersten Mal erklärt „Bevor du die Arena verwendest“ Funktion, geeignete und ungeeignete Aufgaben sowie Kosten. **Arena verwenden** startet, **Abbrechen** bricht ab. Der Hinweis erscheint einmal geräteübergreifend unabhängig von Tipps. Anders als Deep research und Swarm lässt sich die Arena nur auf der Startseite wählen: Sie verteilt die erste Nachricht und kann deshalb nicht nachträglich zu einer Sitzung ergänzt werden.

Jedes Modell arbeitet in einer eigenen Sitzung mit demselben Auftrag, Anhängen, Ordner und Sitzungseinstellungen für Agent, Memory und Ausgabenlimit sowie seinen üblichen Denkaufwands- und Berechtigungswerten. Aktiviere in Git-Repositorys **Neuer Worktree** im Ordnermenü, damit die Modelle getrennte Codekopien verwenden. Kann ein Modell nicht starten, meldet die App das; der Vergleich läuft ohne dieses Modell weiter.

### Antworten vergleichen und die beste behalten

Jede Vergleichssitzung zeigt über dem Nachrichtenfeld **Arena** mit „Derselbe Auftrag ging an weitere Modelle“ und **Antworten vergleichen**. Die Vergleichsseite zeigt oben den Auftrag und pro Modell eine während der Ausgabe wachsende Antwortspalte, am Computer nebeneinander, auf dem Smartphone untereinander.

- **Diese behalten** ist nach der ersten Antwort verfügbar. Die Sitzung gewinnt, andere werden archiviert und bleiben dort weiterhin lesbar. Die Spalten heißen anschließend **Behalten** und **Archiviert**.
- **Öffnen** führt zur Modellsitzung; beim Gewinner heißt es **Hier weiterarbeiten**.
- **Welche Modelle gewinnen** beziehungsweise auf dem Smartphone **Rangliste** öffnet Nutzung → Arena.

### Sieger und Bewertungen ansehen

[Nutzung → Arena](/arena), in der Suche per Strg+K als „Modell-Arena“ auffindbar, zeigt **Welche Modelle bei deinen Aufgaben gewinnen** mit **Bewertung**, Anzahl **Behalten** im Verhältnis zu Vergleichen und **Siegquote**, die auf dem Smartphone entfällt. Verwendet wird eine Elo-Wertung wie im Schach, beginnend bei 1000. In jedem entschiedenen Vergleich gewinnt die behaltene Antwort gegen alle anderen.

Darunter stehen unter **Vergleiche** bis zu 100 letzte Vergleiche mit Auftrag, Modellen, Zeitpunkt und Gewinner oder **Offen** bei noch fehlender Entscheidung. Ein Klick öffnet die Antworten.

## Ein Ausgabenlimit setzen

Ein Ausgabenlimit begrenzt die rechnerischen API-Kosten einer Sitzung, unabhängig von deinem tatsächlichen Abo. Ist es erreicht, hält der Agent bis zur Erhöhung an. Das eignet sich besonders bei mehreren Agenten für Deep research, Swarm, Subagenten oder Arena.

### Was mitgezählt wird

- Modellaufrufe der Sitzung einschließlich agenteneigener Subagenten, etwa innerhalb von Claude Code.
- Gestartete Hydor-Subagenten, die unter das übergeordnete Limit fallen.
- Lokale Modelle über Ollama oder vLLM zählen mit null Kosten.
- Tokens ohne bekannten Preis lassen sich nicht erfassen. Der Limitdialog weist darauf hin, wenn deshalb höhere tatsächliche rechnerische Kosten möglich sind.

Siehe [Nutzung, Limits und Kosten](/guide/usage) zu den Gesamtkosten.

### Beim Start ein Limit festlegen

Öffne **Optionen → Ausgabenlimit** auf der Startseite. Gib einen Dollarbetrag ein und wähle **Festlegen** oder Enter, oder wähle 1,00, 5,00, 10,00 oder 25,00 $. **Kein Limit** entfernt es. Die Optionsschaltfläche zeigt etwa „Limit 5,00 $“.

Anders als Deep research, Swarm und Arena bleibt die Limitauswahl für weitere Sitzungen geräteübergreifend bestehen, bis du sie änderst.

### Ein Sitzungslimit festlegen oder ändern

**⋯ → Sitzungseinstellungen → Ausgabenlimit** zeigt das aktuelle Limit. Im Dialog steht **Bisher verbraucht**, bei Hydor-Subagenten aufgeteilt, etwa „Diese Sitzung 1,20 $, ihre Hydor-Subagenten 0,80 $“, mit dem Hinweis, dass gestartete Subagenten mitzählen. Bei einem Subagenten siehst du zusätzlich den Verbrauch des übergeordneten Limits. Gib unter **Limit** einen Betrag ein oder wähle 1,00, 5,00, 10,00 oder 25,00 $ und bestätige **Limit festlegen** beziehungsweise **Ändern**. **Limit entfernen** hebt es auf.

Möglich sind 0,01 bis 100.000 $. Liegt das Limit nicht über dem bisherigen Verbrauch, warnt der Dialog, dass die Sitzung gestoppt bleibt. Auf dem Smartphone öffnet er von unten.

### Die Leiste über dem Nachrichtenfeld

Eine Leiste zeigt etwa „1,20 $ von 5,00 $“ mit Füllstand, ab 80 % gelb und am Limit rot mit **Limit erreicht**. Bei mitgezählten Hydor-Subagenten steht auf breiten Bildschirmen „mit Subagenten“; beim Darüberfahren siehst du die Aufteilung. **Ändern** oder nach Erreichen **Erhöhen** öffnet den Dialog.

### Was am Limit passiert

Geprüft wird nach jedem Modellaufruf. Der Durchlauf stoppt nach dem Aufruf, der das Limit erreicht, sodass die Summe leicht darüber liegen kann:

- Der Agent stoppt. Unter dem Durchlauf steht „Am Ausgabenlimit gestoppt“ mit Verbrauch, Limit und **Limit erhöhen…**. Eine Benachrichtigung nennt die Sitzung.
- Laufende Hydor-Subagenten stoppen ebenfalls. Ihr Hinweis nennt das übergeordnete Ausgabenlimit und bietet **Sitzung öffnen**.
- Neue Nachrichten warten. Gesendeter Text wird nicht weitergegeben, sondern bleibt mit einem Limit-Hinweis im Feld. Die Warteschlange bleibt angehalten, bis du das Limit erhöhst oder entfernst.

### Das Limit erhöhen oder entfernen

Wähle **Erhöhen** in der Leiste, **Limit erhöhen…** im Hinweis oder das Sitzungsmenü. Setze ein Limit oberhalb des bisherigen Verbrauchs oder entferne es. Wartende Nachrichten werden anschließend gesendet. Subagenten, die am übergeordneten Limit stoppten, nehmen nach dessen Erhöhung ebenfalls wieder Nachrichten an.

### Limits für Subagenten

Jeder neue Hydor-Subagent erhält einen gleichen Anteil des verbleibenden übergeordneten Budgets, aufgeteilt zwischen Leitung und der maximal gleichzeitig möglichen Subagentenzahl. Das übergeordnete Limit umfasst weiterhin alle und stoppt beim Erreichen sämtliche Beteiligten. Ist nichts mehr übrig, kann die Leitung keine weiteren Subagenten starten und soll mit den vorhandenen Ergebnissen abschließen.

### Limits für geplante Aufgaben und Apps

- **Geplante Aufgaben**: Der Editor unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks), **Neue Aufgabe** oder Aufgabenmenü → **Bearbeiten** enthält das **Ausgabenlimit** wie die Startseite. **Stoppt ab $** unter **Pro Ausführung** setzt dasselbe Limit; leer bedeutet unbegrenzt. Jede neue Ausführungssitzung hält daran an. Fügt eine Ausführung stattdessen eine Nachricht in eine vorhandene Sitzung ein, gilt deren eigenes Limit. Aus einem Gespräch erstellte Aufgaben übernehmen dessen Einstellungen einschließlich Ausgabenlimit. Siehe [Geplante Aufgaben](/guide/tasks).
- **Apps**: Unter **Limits** gibt es **Maximale Kosten pro Ausführung (US$)**. Siehe [Apps](/guide/apps).

## Einen Agenten fragen

- „Starte Deep research zu Wärmepumpen für ein Haus aus den 1930er-Jahren mit sechs gleichzeitigen Recherche-Agenten, Word-Bericht und 10 $ Limit.“
- „Wie weit ist Deep research in meiner Sitzung ‚Ladestationen im Vergleich‘?“
- „Aktiviere dort ab meiner nächsten Nachricht Deep research mit sechs Recherche-Agenten und Word-Bericht.“
- „Schalte meine Sitzung ‚Unzuverlässige Tests‘ auf Swarm und auf mein Zeichen wieder auf einen Agenten zurück.“
- „Setze für diese Sitzung ein Limit von 5 $ und nenne den bisherigen Verbrauch.“
- „Erlaube sechs gleichzeitige Subagenten je Sitzung und acht Mitglieder pro Swarm.“
- „Welche Subagenten hat Hydor gestartet und welche Claude Code?“
- „Hole eine Zweitmeinung zum letzten Durchlauf der Sitzung ‚Abrechnungsumbau‘ ein und erkläre die Ergebnisse.“
- „Welche Modelle gewinnen in meiner Arena? Behalte im letzten Vergleich die Antwort von Claude Code.“
