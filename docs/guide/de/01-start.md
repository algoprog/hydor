# Erste Schritte

Dieser Beitrag führt dich durch Hydor: was die App ist, wie ihre Oberfläche aufgebaut ist, wie du deine erste Sitzung startest, Inhalte mit der Suche findest und die App auf dem Smartphone verwendest. Am Ende findest du alle Tastenkombinationen in einer Tabelle.

![Die App mit der Werkzeugleiste und deinen Sitzungen links in der Seitenleiste und der Startseite für neue Aufträge](images/start.webp)

## Was Hydor ist

Hydor führt KI-Agenten auf deinem eigenen Computer aus. Du bedienst sie in einem beliebigen Browser, am Schreibtisch oder auf dem Smartphone. Ein Agent arbeitet an deinem Auftrag: Er liest und schreibt Dateien, führt Befehle aus, recherchiert im Web und berichtet über seine Arbeit. Du kannst Claude Code und Codex mit deinen bestehenden Abos nutzen, Custom als eigenen App-Agenten mit beliebigen Modellen einschließlich offener lokaler Modelle sowie weitere Agenten wie Gemini CLI oder OpenCode. Jede Unterhaltung mit einem Agenten ist eine **Sitzung**. Sie läuft auch bei geschlossener Seite weiter. So kannst du am Schreibtisch beginnen und später vom Smartphone antworten. Neben Programmierung unterstützt Hydor Recherche, Schreiben, Dokumente, Planung und alltägliche Aufgaben.

## Die Oberfläche kennenlernen

Der Bildschirm besteht aus drei Teilen: der **Werkzeugleiste**, einem schmalen Streifen mit Werkzeugen ganz links, einer **Spalte** daneben, die manche Seiten haben, nämlich der **Seitenleiste** mit deinen Sitzungen auf der Startseite und in einer Sitzung oder der eigenen Liste von Apps, Agenten, Hilfe und Einstellungen, und der geöffneten Seite, etwa Startseite, Sitzung oder Einstellungen. Die Werkzeugleiste ist am Computer immer da. Auf dem Smartphone gibt es sie nicht: Dort lässt sich die Seitenleiste als Menü einblenden und enthält auch die Werkzeuge (siehe [Die App auf dem Smartphone verwenden](#use-the-app-on-a-phone)).

Am Computer kannst du die Spalte zwischen 180 und 560 Pixel breit einstellen: Ziehe ihren rechten Rand oder klicke darauf und verwende die linke und rechte Pfeiltaste. Die Breite ist für alle Spalten gleich, und der Browser merkt sie sich.

### Die Werkzeugleiste

Die Werkzeugleiste ist eine Spalte aus Symbolen; zeigst du auf eines oder gehst mit der Tabulatortaste dorthin, nennt ein Hinweis daneben seinen Namen und, wo es eines gibt, sein Tastenkürzel. Das Symbol der geöffneten Seite ist hervorgehoben, daneben sitzt am Bildschirmrand ein Balken in der Akzentfarbe. Von oben nach unten:

- **Sitzungen**: zeigt deine Sitzungen in der Seitenleiste. Auf der Startseite oder in einer Sitzung blendet die Kachel die Seitenleiste ein oder aus (wie Strg+B). Von jeder anderen Seite zeigt sie die Seitenleiste und bringt dich zur Sitzung, die du zuletzt in diesem Fenster geöffnet hattest, sonst zur Startseite.

Dann die Bereiche der App (die Desktop-App hat drei; in der Web-App und auf dem Smartphone sind es zwei, ohne **Browser**):

- **Browser**: ein eigener Browser, nur in der Desktop-App, mit Tabs, privaten Tabs, einer intelligenten Adressleiste, Seitenübersetzung, Leseansicht, Lesezeichen, Verlauf, einem Werbeblocker und Chrome-Erweiterungen, aus dem du einem Agenten eine Seite übergeben kannst. Siehe [Dein eigener Browser](/guide/web#your-own-browser).
- **Apps**: wiederkehrende Aufgaben, für die du ein Formular ausfüllst und ein Agent die Arbeit übernimmt. Siehe [Apps](/guide/apps).
- **Agenten**: deine und die mitgelieferten Agenten mit Aufgaben, Arbeitsorten, Zeitplänen, Modellen und Zuständigkeiten. Siehe [Agenten](/guide/agents).

Direkt darunter, immer an dieser Stelle:

- **Posteingang**: alle ausstehenden Freigaben, Fragen und Formulare aus sämtlichen Sitzungen, geplanten Aufgaben und Computern. Die Zahl am Symbol nennt, wie viele Dinge gerade auf dich warten. Siehe [Posteingang und Benachrichtigungen](/guide/inbox).
- **Suchen**: öffnet dieselbe Suche wie Strg+K.

Dann, nach etwas Abstand, die Werkzeuge:

- **Nutzung**: wie viel du vom Kontingent jedes Abos verbraucht hast und wann es zurückgesetzt wird, mit den Tabs **Aktivität** und **Arena**. Ein schmaler Balken unter dem Symbol zeigt das übrige Kontingent deiner bezahlten Abos oder, falls du keine hast, deiner kostenlosen Abos. Ist nichts mehr übrig, wird er rot. Siehe [Nutzung, Limits und Kosten](/guide/usage).
- **System**: dieser Computer mit Tabs für **Übersicht** zu Zustand und aktuellem Inhalt der Werkzeuge, **Dateien** zum Durchsuchen, Öffnen und Bearbeiten, **Git** für Repositorys, Änderungen, Branches und Verlauf, **Terminal** für auch nach einem Seitenwechsel weiterlaufende Shells, **Vorschau** für lokale Entwicklungsserver, nur auf den eigenen Seiten dieses Computers und **Überwachen** mit Live-Anzeigen für Prozessoren, Grafikkarten, Arbeitsspeicher, Datenträger und aktive Programme. Siehe [System: Dateien, Git, Terminal und Vorschau](/guide/files-git).
- **Einstellungen**: sämtliche App-Einstellungen. Ein Punkt zeigt eine verfügbare neue Version an. Siehe [Alle Einstellungen](/guide/settings).
- **Hilfe**: öffnet diesen Leitfaden, in dem du auch einen Agenten zur App befragen kannst. Hier startet auch die Willkommenstour.

Die Bereiche stehen in der Reihenfolge Browser, Agenten, Apps, dann Posteingang und Suchen, und die Werkzeuge darunter in der Reihenfolge Nutzung, System, Einstellungen, Hilfe: Das ist die Standardreihenfolge. Zum Ändern ziehst du eine Kachel an eine andere Position innerhalb ihrer Gruppe (der Bereiche oder der Werkzeuge ganz unten); Posteingang und Suchen bleiben direkt unter den Bereichen. Deine Reihenfolge gilt auf allen Geräten und für alle angezeigten Computer. Nach einer Änderung stellt ein Rechtsklick auf eine Kachel und **Standardreihenfolge wiederherstellen** alles zurück. In einem zu niedrigen Fenster lässt sich die Werkzeugleiste scrollen.

Die Seitenleiste mit deinen Sitzungen gibt es nur auf der Startseite, in einer Sitzung und in deren Review. **Apps**, **Agenten**, die **Hilfe** und die **Einstellungen** haben eine Spalte derselben Art, mit dem Logo, ihrer eigenen Liste (die Bereiche der Apps-Seite und der Agenten-Seite, die Themen der Hilfe, die Bereiche der Einstellungen) und **Seitenleiste ausblenden**; die Seite **Browser** zeigt ihre Tabs in einer eigenen Spalte, und die übrigen Seiten (Posteingang, Nutzung, System …) nutzen die ganze Breite. **Strg+B** blendet die Spalte der Seite ein oder aus, auf der du bist, und alle Spalten sind gleich breit. Eine Spalte, die mehr enthält, als hineinpasst, zeigt ihre Bildlaufleiste, und ihr unteres Ende blendet aus, solange darunter noch mehr kommt. Während die Seite sich erneut mit der App verbindet, erscheint ein durchgestrichenes WLAN-Symbol neben dem Logo oben in der Spalte oder oben in der Werkzeugleiste, wenn keine Spalte zu sehen ist (sie ist ausgeblendet, oder die Seite hat keine).

### Die Seitenleiste

Die Seitenleiste ist die Spalte neben der Werkzeugleiste. Sie enthält:

- Das **HYDΩR**-Logo, am Ende **Sitzungen filtern und gruppieren** und **Seitenleiste ausblenden** (Strg+B). Bei ausgeblendeter Seitenleiste zeigt die Schaltfläche oben links auf der Seite sie wieder an; die Werkzeugleiste bleibt. Auf dem Smartphone stehen hier stattdessen das Logo, der Posteingang, die Filterschaltfläche und **Menü schließen**.
- Eine Computerauswahl, sobald du unter [Einstellungen → Computer](/settings?s=machines) weitere Computer hinzugefügt hast. Sie nennt den angezeigten Computer und zeigt einen Punkt, wenn Sitzungen anderswo deine Antwort benötigen. Siehe [Smartphones, andere Computer und Freigaben](/guide/devices).
- **Neue Sitzung** öffnet die [Startseite](#the-start-page).
- Um eine Sitzung zu finden, nutze die Suche: **Suchen** in der Werkzeugleiste (auf dem Smartphone **Suchen** bei den Werkzeugen unten im Menü) oder Strg+K (⌘K auf dem Mac). Sie sucht nach Titel, Ordner, dem Agenten, als der die Sitzung gestartet wurde (gib Tutor ein, um die als Tutor gestarteten Sitzungen zu finden; General bleibt außen vor), und Nachrichteninhalt, auch in archivierten Sitzungen, die mit **Archiviert** markiert sind und nach den übrigen stehen. Siehe [Alles mit Strg+K durchsuchen](#search-everything-with-ctrlk).
- **Sitzungen filtern und gruppieren** in der Kopfzeile grenzt die Liste ein. Das Menü hat Abschnitte: **Agent** (**Alle Agenten**, dann die Agenten, als die deine Sitzungen gestartet wurden, die meistgenutzten zuerst, bis zu acht, jeweils mit der Zahl ihrer Sitzungen; der Abschnitt erscheint, sobald eine Sitzung als Agent gestartet wurde), **Ausführungsumgebung** (ein Schalter mit **Beliebig**, **Claude Code** und **Codex**) und, sobald Projekte vorhanden sind, **Projekt** (**Jedes Projekt**, dann bis zu acht deiner Projekte). **Neues Projekt …** legt ein Projekt an. Die Filter wirken zusammen, etwa die Sitzungen eines Agenten in einem Projekt. Ein aktiver Filter färbt die Schaltfläche in der Akzentfarbe, und für jeden aktiven Filter erscheint unter **Neue Sitzung** ein Chip mit Symbol und Name: Sein × zeigt für diesen Filter wieder alle Sitzungen. Eine gefilterte Liste ohne Treffer sagt „Keine Sitzungen entsprechen dem Filter.“ **Nach Ordner oder Projekt gruppieren** schaltet die Gruppen ein oder aus; siehe [Die Sitzungsliste](#the-session-list), [Die Sitzungen eines Agenten finden](/guide/agents#find-an-agents-sessions) und [Projekte und Wissen](/guide/projects).

### Die Sitzungsliste

Unter **Neue Sitzung** stehen alle Sitzungen in Gruppen:

- **Aktiv**: Sitzungen mit Aktivität in den letzten fünf Minuten, hier, in VS Code oder einem Terminal, auch bereits abgeschlossene. Nach fünf Minuten ohne Aktivität wechseln sie in ihre normale Gruppe, selbst wenn das Agentenprogramm noch offen ist. Durch Nutzungslimits gestoppte Sitzungen bleiben hier, solange ihre automatische Fortsetzung geplant ist; brichst du diese ab, gilt wieder die Fünf-Minuten-Regel. Laufende Hintergrundagenten, Befehle oder Überwachungen halten eine Sitzung ebenfalls hier, unabhängig von zwischenzeitlicher Stille. Die Einträge behalten ihre Position; per Ziehen änderst du sie.
- **Angepinnt**: deine angehefteten Sitzungen in frei veränderbarer Reihenfolge. Ziehe eine Sitzung aus einer unteren Gruppe hierher, um sie anzuheften. Ein Klick auf die Überschrift klappt sie ein; solange sie eingeklappt ist, zeigt das Ziehen einer Sitzung unter der Überschrift ein Feld **Zum Anheften hier ablegen**, auf das du sie ziehst.
- **Projekte**: je eine Gruppe für jedes Projekt mit Sitzungen und für jeden selbst ausgewählten Ordner mit mindestens zwei Sitzungen. Zunächst steht der zuletzt verwendete oben. Ziehe eine Gruppe an ihrer Überschrift an eine andere Position, um eine eigene Reihenfolge festzulegen; auf dem Smartphone hältst du sie vorher kurz gedrückt. Die Reihenfolge gilt geräteübergreifend. Noch nie verschobene Gruppen, etwa neue Projekte, erscheinen zuerst. Jede Gruppe zeigt die fünf neuesten Sitzungen; **12 weitere anzeigen** beziehungsweise die entsprechende Anzahl öffnet den Rest, **Weniger anzeigen** klappt ihn wieder ein.
- **Heute**, **Gestern**, **Diese Woche**, danach Monate und Jahre: die übrigen Sitzungen nach letzter Aktivität.
- **Zurückgestellt**: unten bis zum festgelegten Zeitpunkt.

Nur selbst ausgewählte Ordner erhalten Gruppen. Benutzerordner, Standardordner, neue Aufgabenordner, App-Arbeitsordner und temporäre Ordner werden nach Tagen einsortiert. Worktree-Sitzungen gehören zur Gruppe des Ausgangsordners. Sitzungen im Projektordner oder seinen Unterordnern erscheinen in der Projektgruppe, unabhängig davon, ob sie in Hydor, Claude Code oder Codex gestartet wurden. Codex-Projektordner erscheinen unter dem Projektnamen. Die Codex-App benennt Ordner für ChatGPT-Projekte nur mit einer ID. Kennt Codex den Projektnamen nicht, erhalten sie keine Gruppe und zeigen als Ordner **ChatGPT-Projekt**. Vergib über **Ordner umbenennen** im Sitzungsmenü einen Namen, um eine entsprechende Gruppe zu erhalten. Gleichnamige Ordner zeigen so viele übergeordnete Pfadteile wie nötig zur Unterscheidung, etwa „client/app“ und „server/app“.

Auch **Aktiv**, **Angepinnt** und **Projekte** lassen sich einklappen: Ein Klick auf die Überschrift verbirgt den gesamten Inhalt darunter, ein weiterer zeigt ihn wieder. Eingeklappt zeigen **Aktiv** und **Angepinnt**, wie viele Sitzungen sie enthalten, und einen Punkt, wenn eine davon seit deinem letzten Besuch abgeschlossen wurde. Die Sitzung, die du geöffnet hast, bleibt unter ihrer Überschrift sichtbar, auch wenn der Abschnitt eingeklappt ist. Dieser Computer merkt sich die Auswahl unabhängig vom Klappzustand einzelner Projekte und Ordner innerhalb von **Projekte**. Fährst du über die Überschrift **Projekte**, erscheint ein **+** (auf einem Touchscreen ist es immer da): **Neues Projekt …** und **Neue Gruppe von Projekten …** (siehe [Ein Projekt anlegen](/guide/projects#make-a-project)).

Ein Klick auf die Überschrift eines Ordners klappt ihn zu einer Zeile mit Sitzungszahl und einem Punkt für seit deinem letzten Besuch abgeschlossene Sitzungen ein; ein weiterer Klick öffnet ihn. Bei der Überschrift eines Projekts ist es anders: Ein Klick auf seinen Namen öffnet seine Details in einem Fenster (siehe [Die Details eines Projekts öffnen](/guide/projects#open-a-projects-details)), und der kleine Pfeil neben dem Namen klappt seine Sitzungen ein. Jede Gruppe startet eingeklappt, als Überschrift mit der Zahl ihrer Sitzungen; öffne die, die du willst, und sie bleiben, wie du sie verlassen hast. Die geöffnete Sitzung bleibt auch in einer eingeklappten Gruppe sichtbar. Dein Browser merkt sich den Klappzustand. Der Stift am Ende der Überschrift, am Computer beim Darüberfahren sichtbar (auf einem Touchscreen immer), startet eine Sitzung in diesem Ordner oder Projekt. **⋯** daneben oder ein Rechtsklick auf die Überschrift öffnet das Menü: bei einem Projekt **Projektdetails** und **Umbenennen**, bei einem Ordner **Umbenennen**, **Ursprünglichen Ordnernamen verwenden** (sobald du ihn umbenannt hast), **Zum Projekt machen** und **In Dateien öffnen**. Bei einem Ordner erlaubt auch ein Doppelklick auf den Namen das Umbenennen; Enter speichert, Esc bricht ab. Ein Projekt benennst du über sein Menü ⋯ → **Umbenennen** um (oder per Rechtsklick auf die Überschrift). Ein Projektname ändert sich überall. Ein eigener Ordnername gilt in der App geräteübergreifend für Seitenleiste, Sitzungen und Ordnermenüs, während der tatsächliche Name auf dem Datenträger unverändert bleibt. Ein leeres Namensfeld stellt ihn wieder her.

Auch außerhalb von Hydor gestartete Claude-Code- und Codex-Sitzungen erscheinen hier, etwa aus VS Code, Terminal, Claude-Desktop-App oder Codex-App. Ihre Arbeitsordner werden automatisch zu Projekten; siehe [Aus Claude Code und Codex erkannte Projekte](/guide/projects#projects-found-in-claude-code-and-codex). Die Projektgruppe zeigt hinter dem Namen die Kennzeichnung von Claude Code, Codex oder beiden. Externe Arbeitsordner ohne Projekt, etwa mit nur einer externen Sitzung oder von Hydor ausgelassene Ordner, behalten ihre gewöhnliche Ordnergruppe. Hat die erste Sitzung eines Ordners außerhalb von Hydor begonnen, zeigen entsprechende Kennzeichnungen die Herkunft. Beim Darüberfahren oder unter **⋯** siehst du die ursprünglichen Programme, etwa **Aus Codex: VS Code, Terminal**, gegebenenfalls mit dem Namen eines unter [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts) hinzugefügten Kontos. Die Herkunftsmarkierung bleibt bestehen, wenn du später aus Hydor weiterarbeitest.

Für eine reine Tagesansicht deaktiviere **Nach Ordner oder Projekt gruppieren** im Filtermenü oder suche nach **Sitzungen nach Ordner oder Projekt gruppieren**. Auf dieselbe Weise aktivierst du die Gruppen wieder. Bei einem Filter auf ein einzelnes Projekt werden dessen Sitzungen nach Tagen angezeigt.

Archivierte Sitzungen erscheinen nicht in der Liste, bleiben aber über die Suche (Strg+K) auffindbar, mit **Archiviert** markiert. Vor der ersten Sitzung steht dort „Noch keine Sitzungen“.

Jede Zeile zeigt das Symbol des Agenten mit einem Statuspunkt, den Titel der Sitzung und eine zweite Zeile. Solange der Agent läuft, steht in der zweiten Zeile, was er gerade tut („Arbeitet · 2 Min. 10 Sek.“; wenn er nach früheren Durchläufen insgesamt schon länger gearbeitet hat, steht dort auch diese Gesamtzeit, „Arbeitet · 2 Min. 10 Sek. (47 Min.)“; „Braucht dich“, „Bereit“, „Arbeitet · 1 im Hintergrund“, „In VS Code öffnen“). Sonst zeigt die Zeile den Ordner („Persönlicher Ordner“ bei deinem eigenen), wie lange die Sitzung zuletzt aktiv war und wie viele Zeilen der Agent hinzugefügt und entfernt hat. Eine Sitzung, die als anderer Agent als der übliche gestartet wurde (bei einer Sitzung in einem Projekt mit eigenem Agenten dessen Agent, sonst General), beginnt ihre zweite Zeile mit dem Symbol und dem Namen dieses Agenten: „Planner · web-agent · 5 T.“ im Leerlauf, „Researcher · Arbeitet · 2 Min. 10 Sek.“, solange sie arbeitet. Der übliche Agent, außerhalb von Hydor gestartete Sitzungen und inzwischen gelöschte Agenten werden nicht genannt, die meisten Zeilen sehen also aus wie bisher: In einem Projekt, dessen eigener Agent Coder ist, werden Coder-Sitzungen nicht genannt, eine Researcher-Sitzung aber schon, und eine General-Sitzung ebenso. Unter **Projekte**, wo schon die Gruppe den Ordner nennt, hat eine Zeile nur eine Zeile mit dem Titel, dann (nach dem Branch eines Worktrees) wie lange die Sitzung zuletzt aktiv war, oder was der Agent gerade tut, solange er arbeitet oder dich braucht; eine Sitzung, die als anderer Agent als der übliche gestartet wurde, behält dort eine zweite Zeile, die ihn nennt („Planner · 5 T.“). Hinter dem Titel können kleine Symbole stehen:

- Ein Punkt in Akzentfarbe bedeutet, dass die Sitzung seit deinem letzten Besuch fertig geworden ist. Die zweite Zeile zeigt etwa „Abgeschlossen · vor 5 Min.“. Öffnen markiert sie auf allen Geräten als gelesen.
- Eine Pull-Request-Anzeige nennt dessen Status.
- Ein Zielsymbol zeigt ein gesetztes Ziel.
- eine Stecknadel: Die Sitzung ist angepinnt (in der Gruppe **Angepinnt**, die das schon sagt, gibt es keine).

Beim Start und während der Arbeit verwendet Custom die Hydor-Ladeanimation mit steigendem und fallendem Wasser im Ω statt eines rotierenden Agentensymbols. Ladeanzeigen sind neben ihrem Text vertikal zentriert.

Der Statuspunkt zeigt den Zustand der Sitzung:

| Punkt | Bedeutung |
| --- | --- |
| Blau, pulsierend | In Arbeit: Ein Durchlauf oder Hintergrundaufgaben laufen |
| Gelb | Benötigt dich: Freigabe, Frage oder Formular wartet |
| Grün | Bereit: Der Agent läuft und wartet auf deine nächste Nachricht |
| Grau | In VS Code oder einem Terminal geöffnet, dort gerade ohne Arbeit |
| Kein Punkt | Gestoppt: Das Agentenprogramm läuft nicht; eine Nachricht startet es erneut |

Der Browser-Tab zeigt die Zahl der wartenden Sitzungen, etwa „(2) Hydor“.

Subagenten, also die vom Agenten für Teilaufgaben gestarteten Sitzungen (Hydor-Subagenten) und die, die sein Programm innerhalb der Sitzung ausführt (die eigenen von Claude Code und Codex), stehen eingeklappt unter der übergeordneten Sitzung, solange sie arbeiten oder auf dich warten, etwa „3 Subagenten · 1 benötigt dich“. Ein Klick zeigt sie. Ist einer fertig, verschwindet er aus der Seitenleiste, außer du hast ihn geöffnet: Er steht weiter auf der Subagenten-Karte in der Unterhaltung und in der Zeile über dem Nachrichtenfeld. Siehe [Subagenten](/guide/sessions#subagents).

Jede Sitzungszeile hat ein Menü: Fahre darüber und klicke rechts auf **⋯**, oder verwende einen Rechtsklick; auf dem Smartphone tippst du auf **⋯**. Es bietet **Umbenennen**, außerhalb von Projekten **Ordner umbenennen**, **Anheften** oder **Lösen**, **Zurückstellen**, **Abschließen**, **Archivieren** und **Löschen** mit Bestätigung. Ein Doppelklick auf den Titel oder F2 bei ausgewählter Zeile benennt die Sitzung ebenfalls um. Siehe [Umbenennen, anheften, zurückstellen, abschließen, archivieren oder löschen](/guide/sessions#rename-pin-snooze-settle-archive-or-delete).

### Die Startseite

**Neue Sitzung** öffnet die Startseite mit „Woran sollen wir arbeiten?“ und „Stelle eine Aufgabe: Recherche, Dokumente, Pläne oder Code.“. Unter dem großen Nachrichtenfeld stehen:

- **Ausführungsumgebung**: das Agentenprogramm, etwa Claude Code, Codex, Custom oder ein hinzugefügter Agent.
- **Modell**: dessen Modell.
- **Ordner**: der Arbeitsordner, ein Projekt oder ein neuer Aufgabenordner.
- **Agent**: die Rolle, etwa Allgemein, Forscher, Schriftsteller, Programmierer, Nachhilfelehrer, Planer, Analyst, App builder oder ein eigener Agent. Siehe [Agenten](/guide/agents).
- **Optionen**: Denkaufwand, Berechtigungen, Memory, Ausgabenlimit und mehr. Abweichungen vom Standard werden direkt an der Schaltfläche genannt.

Am Computer steht darunter „Enter zum Starten · Umschalt+Enter für eine neue Zeile“. Ist das Abo-Kontingent des Agenten ausgeschöpft, nennt ein Hinweis über dem Feld das Limit und die Rücksetzzeit.

Gab es seit deinem letzten Besuch neue Ereignisse, steht unter dem Feld **Während du weg warst** mit einer Zusammenfassung: abgeschlossene Arbeit, Rückfragen, automatische Ausführungen und kommende Aufgaben. Siehe [Während deiner Abwesenheit](#while-you-were-away). Ohne neue Ereignisse entfällt der Bereich.

Bei leerem Feld erscheinen **Einstiegsideen**: drei Beispielaufträge, zwei deiner Apps und eine Automation.

- Ein Klick auf ein Beispiel übernimmt es in das Feld. Passe es an und sende es selbst; vorher wird nichts gesendet. „…“ ergänzt du mit deinem Text. Die Beispiele wechseln täglich und beziehen sich in Codeordnern auf Programmierung.
- Ein Klick auf eine App öffnet ihr Formular. Angezeigt werden deine beiden meistverwendeten Apps, anfangs **Bericht der tiefgehenden Recherche** und **Reiseplaner**. Siehe [Apps](/guide/apps).
- Die Automation, etwa „Jeden Montag um 8:00 Uhr sende mir …“, übernimmt ihren Text in das Feld. Ergänze und sende ihn; der Agent richtet eine [geplante Aufgabe](/guide/tasks) ein.

Beim Tippen verschwinden die Ideen. **Ausblenden** verbirgt sie dauerhaft auf allen Geräten. Unter [Einstiegsideen](/settings?s=general&find=Starter%20ideas) in Einstellungen → App → Allgemein aktivierst du sie wieder. Auf dem Smartphone stehen sie in einer horizontal scrollbaren Zeile.

Darunter fasst **Heute** den Tag zusammen, etwa „Heute · 7 Sitzungen · 12 Dateiänderungen · 0,84 $“. Werte von null werden ausgelassen. Der Betrag entspricht den rechnerischen API-Preisen der Tagestokens, derselben Schätzung wie **API-Kosten (geschätzt)** auf der Aktivitätsseite. Bei Claude-Code- und Codex-Abos zahlst du stattdessen die Abogebühr. Beim Darüberfahren siehst du geänderte Zeilen, Tokens und Prompts; ein Klick öffnet die Aktivitätsseite. Auf dem Smartphone stehen unter **Zuletzt** die sechs neuesten Sitzungen.

**Entdecken** oben rechts öffnet ein für dich zusammengestelltes Magazin mit Artikeln und aktuellen Nachrichten zu deinen Interessen und Arbeitsgebieten, ausgewählt anhand deines Profils und deiner letzten Sitzungen. Siehe [Entdecken](/guide/apps#explore). Ein Punkt zeigt eine noch ungelesene neue Ausgabe an.

Die Startseite merkt sich die Auswahl je Projekt, Ordner und **Neuer Aufgabenordner** getrennt. So kann ein Projekt mit eigenem Programm, Modell und Agenten öffnen. Siehe [Was sich die Startseite merkt](/guide/sessions#what-the-start-page-remembers). Alle Startseitenfunktionen erklärt [Eine Sitzung starten](/guide/sessions#start-a-session).

### Während deiner Abwesenheit

Unter dem Nachrichtenfeld und über den Einstiegsideen siehst du nach deiner Rückkehr, was seit dem letzten Besuch passiert ist. Die Zusammenfassung ist zunächst eine Zeile, nach Wichtigkeit sortiert, etwa „1 benötigt dich · 1 fehlgeschlagen · 3 abgeschlossen · Als Nächstes: Morgenüberblick um 07:30 · Seit gestern 18:40“. Leere Kategorien entfallen. Ein Klick auf die Zeile öffnet alles; einzelne Kategorien wie **Benötigt dich**, **Fehlgeschlagen** oder **Abgeschlossen** öffnen nur ihre Einträge. **Alle anzeigen** hebt den Filter auf. **Als Nächstes** öffnet die geplanten Aufgaben, die Zeitangabe alle Ereignisse. Auf dem Smartphone öffnet die gesamte Zeile den Bereich; die Zeit steht in dessen Kopf.

Geöffnet zeigt der Bereich bis zu sechs Einträge, die wichtigsten zuerst. **… weitere anzeigen** öffnet den Rest:

- **Braucht dich**: Freigaben, Fragen, Formulare, im Postausgang zurückgehaltene Aufrufe und weitere Rückfragen wie im [Posteingang](/guide/inbox). Bei Freigaben, Fragen, Formularen und zurückgehaltenen Aufrufen öffnet **Hier antworten** die passende Posteingangskarte unter dem Eintrag. Andere Einträge führen zum jeweiligen Ort.
- **Abgeschlossen** und **Fehlgeschlagen**: seit dem letzten Besuch beendete und noch nicht erneut geöffnete Sitzungen, jeweils mit dem Anfang der letzten Antwort oder Fehlerbeschreibung und erstellten Dateien. Dateien öffnen sich in Dateien, der Eintrag öffnet die Sitzung. Eine Sitzung, deren Durchlauf endete, während noch von ihr gestartete Subagenten oder Hintergrundaufgaben laufen, ist noch nicht abgeschlossen: Sie erscheint hier, sobald diese enden.
- **Automatisch ausgeführt**: Läufe deiner [geplanten Aufgaben](/guide/tasks), Agentenzeitpläne und Apps, die über App-Seite, Link, API oder Chat-App gestartet wurden. Angezeigt werden Ergebnis (**Abgeschlossen**, **Fehlgeschlagen** oder **Nichts Neues**) und Kosten. Ein Klick öffnet die ausführende Sitzung beziehungsweise den App-Lauf.
- **Heute als Nächstes**: unter den Ereignissen die für heute noch anstehenden Aufgaben.

Der Bereich öffnet sich nicht selbst, auch bei Rückfragen. Dein Gerät merkt sich den geöffneten oder geschlossenen Zustand. **Alle als gesehen markieren** leert die Anzeige und markiert Einträge und Sitzungen auf allen Geräten als gesehen beziehungsweise geöffnet; auch ihre Punkte in der Seitenleiste verschwinden. Spätere Ereignisse erscheinen neu. Läufe ohne neue Ergebnisse und kommende Aufgaben lösen die Anzeige allein nicht aus.

Als letzter Besuch zählt das Ende deiner letzten aktiven Nutzung von mehr als einer Minute, bei geöffneter App im Vordergrund, auf einem beliebigen Gerät. Ein Smartphonebesuch zählt also auch am Computer. Neuladen, kurze Blicke unter einer Minute und ein unbeaufsichtigt offenes Fenster verschieben den Zeitpunkt nicht. Eine geöffnete Sitzung wird wie gewohnt als gesehen markiert. Vor dem ersten Besuch wird ein Tag zurückgeblickt. Die Startseite eines anderen Computers unter Einstellungen → Computer zeigt dessen Ereignisse. Ältere Hydor-Versionen bieten den Bereich nicht.

Im Terminal listet `hydor away` dieselben Ereignisse auf; `hydor away seen` markiert sie als gesehen. Siehe [Hydor im Terminal](/guide/terminal).

## Deine erste Sitzung starten

1. Stelle sicher, dass der Agent einsatzbereit ist. Melde dich für Claude Code oder Codex unter [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts) im Bereich **Konten** über **Anmelden** beim gewünschten Agenten an. Folge den Schritten: Link öffnen, bestätigen und Code einfügen oder eingeben. Custom benötigt ein Modell aus [Einstellungen → Agenten → Modelle](/settings?s=models). Die Willkommenstour hilft dir beim ersten Mal dabei. Siehe [Agenten, Konten und Modelle](/guide/agents-models).
2. Klicke oben in der Seitenleiste auf **Neue Sitzung**. Auch beim App-Start erscheint die Startseite.
3. Wähle unter dem Nachrichtenfeld über **Ausführungsumgebung** das Programm und daneben über **Modell** sein Modell. Zum Einstieg genügt das als „Standard“ markierte Modell.
4. Wähle unter **Ordner** den Arbeitsort:
   - ein **Projekt**, um in dessen Ordner mit seinen Dokumenten und Richtlinien zu arbeiten;
   - einer der Ordner, die du zuletzt verwendet hast, unter **Ordner**, oder ein anderer: Mit **Durchsuchen** durchsuchst du deine Ordner, oder du gibst den Namen oder Pfad eines Ordners in **Projekt oder Ordner suchen oder Pfad eingeben** ein;
   - **Neuer Aufgabenordner** für einen nach deinem Auftrag benannten Ordner in `~/Hydor`, sofern du den Ort nicht unter [Einstellungen → Funktionen → Deine Agenten](/settings?s=assistants&find=Task%20folders) änderst.

   Die meisten Agenten starten ohne eigene Ordnerauswahl in einem neuen Aufgabenordner. Programmierer arbeitet im gewählten Ordner.
5. Beschreibe im Nachrichtenfeld deinen Auftrag oder stelle eine Frage. Hänge Dateien über die Büroklammer an oder ziehe sie auf das Feld. Bereits lokal vorhandene Dateien übernimmst du auf der Dateien-Seite über **Sitzung damit starten** im Dateimenü. Siehe [Eine Sitzung mit Dateien starten](/guide/files-git#start-a-session-with-files).
6. Drücke Enter oder **Starten**, auf dem Smartphone den runden Pfeil.

Die Sitzung öffnet sich. Du siehst die einzelnen Schritte in verständlicher Form und am Ende die Antwort. Braucht ein Befehl oder eine Dateiänderung eine Freigabe, erscheint eine Karte mit **Erlauben** und **Ablehnen**. Im Nachrichtenfeld unten setzt du die Unterhaltung fort. Deine Startseitenauswahl bleibt geräteübergreifend für die nächste Sitzung gespeichert.

Weiter geht es mit [Sitzungen](/guide/sessions), wo alle Sitzungsfunktionen beschrieben sind.

## Alles mit Strg+K durchsuchen

Die Suche findet beim Tippen Inhalte in der gesamten App, ähnlich wie Spotlight auf dem Mac. Strg+K beziehungsweise ⌘K öffnet sie auf jeder Seite, außer beim Tippen in einem Codeeditor oder Terminal. Auch **Suchen** in der Werkzeugleiste (auf dem Smartphone **Suchen** bei den Werkzeugen im Menü) öffnet sie. Erneutes Strg+K oder Esc schließt sie.

### Was die Suche findet

- **Gehe zu**: App-Seiten wie Neue Sitzung, Posteingang, Dateien, In Dateien suchen, Git, Terminal, Apps, Neue App, Projekte, Gemeinsames Wissen, Veröffentlicht, Vorschau, Nutzung und Limits, Modell-Arena, Aktivität, System und Einstellungen.
- **Aktionen**: Take a tour, Sprachmodus, Versionshinweise, helles oder dunkles Design, Seitenleiste ein- oder ausblenden, Sitzungen nach Ordner oder Projekt gruppieren und Terminalbereich ein- oder ausblenden.
- **Einstellungen**: alle Einstellungsbereiche und ihre Optionen. Ein Treffer öffnet den Bereich und hebt die Option hervor.
- **Designs**: integrierte und eigene Designs. Die Auswahl aktiviert das Design.
- **Sitzungen**: Titel, Ordner, Branch, erste Nachricht und der Agent, als der sie gestartet wurde (General bleibt außen vor, da es die meisten sind), auch archivierte Sitzungen, mit **Archiviert** markiert und nach den übrigen. Ein Treffer öffnet die Sitzung. Seine Vorschau nennt den **Agent**.
- **In Nachrichten**: Nachrichten mit deinen Suchwörtern. Ein Treffer öffnet die Sitzung an der passenden Stelle mit vorbereiteter Suchleiste.
- **Memory**: deine Memory-Notizen. Ein Treffer öffnet Einstellungen → Memory bei der Notiz.
- **Projekte**: Projektname und Beschreibung. Ein Treffer öffnet die Details des Projekts in einem Fenster über der Seite, auf der du gerade bist.
- **Apps**, **Geplante Aufgaben**, **Agenten**, **Skills**, **Seiten**, **Bilder, Videos und Audio** und **Verbindungen**: eigene und mitgelieferte Einträge. Jeder öffnet seinen jeweiligen Bereich.
- **Dateien**: bis zu fünf passende Dateinamen aus dem auf der Dateien-Seite geöffneten Ordner oder dem Standardordner der App.
- **Verlauf**, **Lesezeichen** und **Downloads**: in der Desktop-App die Seiten, die du in deinem eigenen [Browser](/guide/web#your-own-browser) besucht hast, deine Lesezeichen und die Dateien, die er heruntergeladen hat. Sie werden über ihre Wörter gefunden und, wenn [Nach Bedeutung suchen](/settings?s=memory&find=Search%20by%20meaning) eingeschaltet ist, über das, worum es in ihnen geht, auch wenn die Wörter abweichen. Eine Seite öffnet sich in einem neuen Tab der **Browser**-Seite; bei einem Download zeigt ein Treffer die Datei in ihrem Ordner. Sie bleiben auf diesem Computer, Agenten bekommen sie nie, und die Suche merkt sich nicht, was du getippt hast, um sie zu finden.

### Suchbereiche auswählen

**Suchen in** am Feldende zeigt den Suchbereich an, zunächst **Überall**. Ein Klick öffnet **Sitzungen**, **Nachrichten** für Unterhaltungsinhalte, **Projekte**, **Behaltene Dateien** (die Seiten, Bilder, Videos und Audiodateien, die Agenten erstellt und du behalten hast), **Apps**, **Dateien**, **Memory**, **Geplante Aufgaben**, **Agenten**, **Skills**, **Verbindungen**, **Einstellungen** einschließlich Designs, **Navigation und Aktionen** für App-Seiten und Funktionen, **Hilfe** und, nur in der Desktop-App, **Browser** (dein Verlauf, deine Lesezeichen und Downloads).

- Wähle einen oder mehrere Bereiche. Die Suche beschränkt sich darauf, und die Schaltfläche nennt sie in Akzentfarbe, etwa „Sitzungen, Behaltene Dateien“ oder „3 Bereiche“. Ein erneuter Klick entfernt einen Bereich; **Überall** aktiviert wieder alle.
- Ohne Suchtext siehst du die Inhalte der ausgewählten Bereiche, häufig genutzte zuerst: letzte Sitzungen, Projekte und Seiten, Einstellungsbereiche oder Hilfethemen. Nachrichten, Memory-Notizen und Dateien erscheinen erst nach einer Eingabe.
- Die Auswahl bleibt geräteübergreifend gespeichert. Gibt es keine Treffer, durchsucht **Überall suchen** unter dem Hinweis wieder alle Bereiche.
- Auf dem Smartphone ist **Suchen in** das Filtersymbol neben **Abbrechen**. Nach der Auswahl nennt es die Bereiche; die Liste öffnet sich vom unteren Bildschirmrand.

### Die Ergebnisanzeige

- **Beste Übereinstimmung** steht oben. Danach folgen Kategorien mit bis zu vier Zeilen. „3 weitere in Sitzungen“ zeigt den Rest.
- Bilder, Videos, Töne, behaltene Seiten und Dateien erscheinen mit Vorschaubild und ihren Angaben: was es ist (ein Bild, ein Video, ein Dokument, Folien, eine Tabelle, ein PNG-Bild …), Größe oder Länge, wo es liegt (bei einem behaltenen Element steht „Dateien › Projektname“, in den Dateien des Projekts) und wann es zuletzt geändert wurde. Bei einer Seite folgt ihre Beschreibung.
- Auf breiten Bildschirmen zeigt eine Vorschau neben der Liste weitere Angaben zum ausgewählten Treffer und seinem Ziel. Ein Bild oder eine Seite erscheint dort größer (ein Klick öffnet es), und ein Video oder ein Ton spielt direkt dort.
- Auf dem Smartphone füllen die Treffer den Bildschirm, ohne Vorschau: Jede Zeile sagt genug, um die Treffer auseinanderzuhalten, und ist groß genug zum Antippen.
- Mit ↑ und ↓ wechselst du zwischen den Treffern, mit Enter öffnest du einen. Esc leert, was du eingegeben hast, und ein zweites Esc schließt die Suche (ist die Liste **Suchen in** geöffnet, schließt Esc zuerst die Liste).
- Ohne Eingabe zeigt die Suche **Letzte Sitzungen** und **Vorschläge**: die Orte, die du am häufigsten nutzt (bis sie diese kennt, ein paar nützliche). Sind in **Suchen in** Orte ausgewählt, zeigt sie stattdessen, was diese enthalten.
- Unten steht **Worte** oder **Wörter und Bedeutung**. Mit aktiviertem [Nach Bedeutung suchen](/settings?s=memory&find=Search%20by%20meaning), standardmäßig unter Einstellungen → Funktionen → Memory eingeschaltet, findet die Suche auch sinngleiche Formulierungen und andere Sprachen.

### Die Suche lernt deine Nutzung kennen

- Sie merkt sich ausgewählte Treffer samt Suchtext. Suchst du erneut mit denselben Wörtern, steht der Treffer sofort oben.
- Sie berücksichtigt besuchte Seiten, Einstellungsbereiche, Sitzungen, Apps und Dateien unabhängig vom Zugangsweg. Häufig verwendete passende Treffer rücken nach oben, stärker bei guter Textübereinstimmung und mit der Zeit wieder schwächer.
- Die App speichert dies geräteübergreifend, sodass Smartphone und Computer gemeinsam lernen.

## Die App auf dem Smartphone verwenden

Damit du Hydor auf deinem Smartphone erreichst, braucht die App eine HTTPS-Adresse. [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone) richtet sie mit wenigen Klicks privat über Tailscale ein: Nur deine eigenen Geräte können zugreifen, und ein QR-Code öffnet die App auf dem Smartphone. Ein Cloudflare-Tunnel oder dein eigener Proxy funktioniert ebenfalls. Siehe [Smartphones, andere Computer und Freigaben](/guide/devices).

### Zum Home-Bildschirm hinzufügen

Du kannst Hydor wie eine App installieren und im Vollbild öffnen:

- **iPhone oder iPad**: in Safari öffnen, dann Teilen → **Zum Home-Bildschirm hinzufügen**.
- **Android**: in Chrome öffnen, dann ⋮ → **Zum Home-Bildschirm hinzufügen** oder **App installieren**.

Nach der Installation unter Android sowie mit Chrome oder Edge am Computer erscheint Hydor auch als Teilen-Ziel. Teile ein Foto, eine Datei oder einen Link aus einer anderen App: Die Startseite öffnet sich mit dem Inhalt im Nachrichtenfeld. Siehe [Aus anderen Apps an Hydor teilen](/guide/devices#share-to-hydor-from-other-apps).

Auf iPhone und iPad funktionieren Benachrichtigungen nur in der zum Home-Bildschirm hinzugefügten App. Öffne sie dort und aktiviere unter Einstellungen → App → Benachrichtigungen [Dieses Gerät benachrichtigen](/settings?s=notifications&find=Notify%20this%20device). Siehe [Posteingang und Benachrichtigungen](/guide/inbox).

### Die Seitenleiste als Menü

- Die Schaltfläche **Menü** oben links auf jeder Seite öffnet sie. Sie füllt den Bildschirm.
- Tippe auf eine Sitzung oder ein Werkzeug, um dorthin zu wechseln und das Menü zu schließen. Auch **Menü schließen**, das ×, schließt es.
- Halte eine Sitzung kurz gedrückt und ziehe sie, um aktive oder angeheftete Sitzungen umzusortieren oder sie anzuheften.
- Halte ein Werkzeug unten einen Moment gedrückt, um es aufzunehmen, und ziehe es dann an eine andere Stelle zwischen den anderen.
- **⋯** am Zeilenende öffnet das Sitzungsmenü mit **Umbenennen**, **Ordner umbenennen**, **Anheften**, **Zurückstellen**, **Abschließen**, **Archivieren** und **Löschen** mit Bestätigung.

### Menüs als Bedienfelder

Auf dem Smartphone öffnen die Startseitenauswahlen für Programm, Modell, Ordner, Agent und Optionen ein Bedienfeld vom unteren Bildschirmrand, oberhalb der Tastatur. Das Suchfeld der Ordnerauswahl erhält erst beim Antippen den Fokus, damit die Tastatur die Liste nicht verdeckt.

### Tippen und Senden

- Unter dem Nachrichtenfeld stehen die sechs neuesten Sitzungen unter **Zuletzt**. **Alle Sitzungen** öffnet das Menü.
- Enter fügt eine neue Zeile ein. Der runde Pfeil startet eine Sitzung oder sendet eine Nachricht. Mit angeschlossener Tastatur senden auch Strg+Enter beziehungsweise ⌘Enter.
- In der Sitzung zeigt eine Schaltfläche das Modell und bei Abweichungen Denkaufwand und Berechtigungen. Sie öffnet ein Bedienfeld mit **Modell**, **Aufwand**, **Berechtigungen**, Kontextauslastung und **Verdichten**.
- Markiere einen Teil einer Antwort oder deiner Nachricht, um darunter **Zitieren** einzublenden.
- **Details** öffnet sich nur auf Anforderung über der Unterhaltung.
- Die Suche füllt den Bildschirm; **Abbrechen** schließt sie.
- Die Screenshot-Funktion gibt es nur am Computer.

## Tastenkombinationen

Auf dem Mac steht ⌘ statt Strg. Ausnahmen sind Strg+` und Strg+Leertaste, die unverändert bleiben.

| Tasten | Funktion | Wo |
| --- | --- | --- |
| Strg+K | Suche öffnen oder schließen | Überall außer beim Tippen in Codeeditoren oder Terminals |
| Strg+B | Die Spalte neben der Werkzeugleiste ein- oder ausblenden: die Seitenleiste oder die von Apps, Agenten, Hilfe oder Einstellungen (die Werkzeugleiste bleibt) | Am Computer außer im Codeeditor |
| Strg+` | Unteren Terminalbereich ein- oder ausblenden | Am Computer |
| Strg+P | Datei im Ordner der Dateien-Seite über einen Teil ihres Namens schnell öffnen | Überall |
| Strg+Z | Anheften, Lösen, Archivieren, Wiederherstellen oder Zurückstellen innerhalb von 8 Sekunden rückgängig machen | Außerhalb von Textfeldern |
| Enter | Sitzung starten oder Nachricht senden | Startseite und Nachrichtenfeld; auf dem Smartphone neue Zeile |
| Umschalt+Enter | Neue Zeile | Nachrichtenfeld |
| Strg+Enter | Während der Arbeit das Gegenteil von Enter: Nachricht einreihen statt im laufenden Durchlauf senden oder umgekehrt; auf dem Smartphone senden | Nachrichtenfeld |
| Umschalt+Tab | Zum nächsten Berechtigungsmodus wechseln | Nachrichtenfeld auf Startseite oder in Sitzung |
| ↑ in einem leeren Feld | Holt deine früheren Nachrichten in dieser Sitzung zurück, eine nach der anderen (↓ geht wieder vorwärts) | Das Nachrichtenfeld in einer Sitzung |
| Strg+S | Entwurf beiseitelegen; im leeren Feld wiederherstellen | Nachrichtenfeld einer Sitzung |
| @ | Dateien im Sitzungsordner zum Erwähnen auflisten | Nachrichtenfeld |
| / am Anfang | Befehle und Skills des Agenten anzeigen, bei Claude Code | Nachrichtenfeld |
| ↑ ↓, Enter oder Tab, Esc | Durch @- und /-Listen bewegen, einfügen oder schließen | Nachrichtenfeld |
| Strg+F | Nachrichtentext in dieser Sitzung suchen | Sitzung |
| Enter, Umschalt+Enter | Älterer beziehungsweise neuerer Treffer | Suchleiste |
| 1 bis 9 | Eine Antwort auf die Frage des Agenten auswählen | Fragekarte, wenn kein Textfeld den Fokus hat |
| F2 | Ausgewählte Sitzung umbenennen | Sitzungsliste der Seitenleiste |
| ↑ ↓, Enter, Esc | Auswählen, öffnen, leeren und schließen | Übergreifende Suche |
| ↑ ↓, Enter, Tab | Auswählen, übernehmen, Unterordner anzeigen | Ordnermenü auf der Startseite |
| Strg+S | Datei speichern | Dateieditor |
| Strg+Leertaste, → | Befehlsvorschläge anzeigen beziehungsweise grauen Vorschlag übernehmen | Terminal |

## Hilfe erhalten

**Hilfe** in der Werkzeugleiste (auf dem Smartphone im Menü) öffnet diesen Leitfaden. In einem breiten Fenster hat er eine Spalte derselben Art wie die Seitenleiste: das Logo und **Seitenleiste ausblenden** in einer Zeile, darunter **Hilfe-Startseite** und alle Themen, gruppiert wie auf der Startseite, jeweils mit ihrem Symbol; das geöffnete ist markiert. Die Startseite zeigt dann nur ihr Feld und einige häufige Fragen. In einem schmaleren Fenster oder auf dem Smartphone öffnen die Karten der Startseite die Themen, und **Alle Themen** oben in einem Thema geht zurück; in einem breiten Fenster mit ausgeblendeter Spalte stehen die Karten ebenfalls auf der Startseite. Gib auf der Startseite eine Frage oder einige Wörter in das Feld ein:

- **Passende Abschnitte** erscheinen beim Tippen. Ein Klick öffnet sie; auch die übergreifende Suche per Strg+K findet sie.
- **Enter** oder **Fragen** lässt einen Agenten in einem Bereich neben dem Leitfaden antworten, mit Links zu passenden Stellen. Nach deiner Freigabe auf einer Karte kann er auch Einstellungen ändern oder etwas einrichten. Die Antwort gehört zu einer normalen Sitzung mit dem auf der Startseite zuletzt gewählten Agenten und Modell. Stelle weitere Fragen im Bereich oder öffne die Sitzung über den Pfeil oben auf ihrer eigenen Seite.

In einem schmalen Fenster oder auf dem Smartphone öffnet **Agenten fragen** oben rechts denselben Bereich, ebenso „Einen Agenten zur App fragen“ in der Suche. Unter dem Eingabefeld stehen die Themen in Gruppen als Karten, in einem breiten Fenster stattdessen in der Spalte. In einem Thema findet das Feld oben rechts ebenfalls Abschnitte und fragt einen Agenten. Die Abschnitte eines Themas lassen sich einzeln öffnen oder mit **Alle öffnen** gemeinsam anzeigen. Am Ende stehen Beispielaufträge: Ein Klick übernimmt sie in das Agentenfeld, wo du sie anpassen und senden kannst.

- Die Willkommenstour führt dich durch die App und richtet die gewünschten Agenten ein. Starte sie über **Take a tour** oben in der Hilfe, über [Take a tour](/settings?s=general&find=Take%20the%20tour) unter Einstellungen → App → Allgemein oder mit „Tour“ in der Suche. Erkennt Hydor auf diesem Computer den Ordner eines zuvor verwendeten Agenten wie Claude Code oder Codex, ergänzt die Tour **Nutzt du bereits einen anderen Agenten?**. Sie nennt die gefundenen Agenten. **Ihr Wissen übernehmen** öffnet [Importieren](/guide/memory#bring-in-from-other-assistants) über der Tour, um Wissen über dich und selbst erstellte Skills zu übernehmen. Ohne solche Ordner entfällt der Schritt. Findet Hydor in der Desktop-App andere Browser auf diesem Computer, folgt darauf ein weiterer Schritt, **Lesezeichen und Verlauf importieren?**: Er listet jeden Browser mit der Anzahl seiner Lesezeichen und Seiten im Verlauf auf, und **Importieren** daneben übernimmt, was eingeschaltet ist, **Lesezeichen** und **Verlauf** (siehe [Lesezeichen importieren](/guide/web#bring-in-bookmarks) und [Verlauf](/guide/web#history)); **Weiter** geht ohne Import weiter. Auf einem Mac hat die Zeile von Safari, solange macOS Hydor das Lesen verwehrt, **Systemeinstellungen öffnen** statt **Importieren**; muss Hydor nach deiner Erlaubnis dort neu geöffnet werden, kehrt die Tour zu diesem Schritt zurück. In der Desktop-App folgt außerdem **Auch auf dem Handy nutzen?**: **Einrichten** beendet die Tour bei [Auf dem Smartphone nutzen](/settings?s=phone); **Nicht jetzt** setzt sie fort. Anschließend erklären Hinweise die übrige App beim ersten Besuch des jeweiligen Bereichs. Siehe [Die Tour starten](/guide/app#take-the-tour).
- **Versionshinweise** unter Einstellungen → App → Allgemein oder in der Suche erklären die Änderungen jeder Version. Nach einem Update erscheint einmal „Was ist neu?“.
- Auch die Agenten können diesen Leitfaden lesen. Frage in jeder Sitzung „Wie kann ich…?“. Der Agent kann antworten oder die Aufgabe übernehmen. Siehe [Agenten die App bedienen lassen](/guide/ask-agents).

## Einen Agenten fragen

- „Welche Sitzungen warten gerade auf mich, und was braucht jede davon?“
- „Starte eine Codex-Sitzung in ~/code/shop und repariere die Checkout-Tests.“
- „Finde die Sitzung zur Lissabon-Reise und hefte sie an.“
- „Warum steht eine auf ihre Kontingentfreigabe wartende Sitzung noch unter Aktiv?“
- „Zeige meine Sitzungen in der Seitenleiste nach Tagen, ohne Ordnergruppen.“
- „Wähle auf der Startseite beim nächsten Öffnen Claude Code mit dem Agenten Forscher.“
- „Blende die Einstiegsideen unter dem Nachrichtenfeld aus.“
- „Was ist während meiner Abwesenheit passiert? Ist etwas fehlgeschlagen?“
- „Markiere alle Ereignisse während meiner Abwesenheit als gesehen.“
- „Was hätten meine heutigen Sitzungen zu API-Preisen gekostet?“
- „Beschränke meine Suche auf Sitzungen und Seiten.“
- „Findet die Suche die Seite über Hotels in Lissabon, die ich letzten Monat besucht habe?“ (in der Desktop-App: dein Verlauf, deine Lesezeichen und Downloads, über ihre Wörter oder darüber, worum es geht; Agenten können sie nicht ansehen)
- „Setze Einstellungen an den Anfang der Werkzeuge ganz unten in meiner Werkzeugleiste.“
- „Setze mein Projekt Abschlussarbeit an die erste Stelle der Gruppen in der Seitenleiste.“
- „Welche Projekte hat Hydor aus meinen Claude-Code- und Codex-Sitzungen erstellt?“
- „Was steht in meinem Posteingang?“
- „Richte die App so ein, dass ich sie auf meinem Smartphone nutzen kann.“
