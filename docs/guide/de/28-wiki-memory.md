# Wiki-Memory

Wiki-Memory besteht aus verknüpften Artikeln in einfachen Markdown-Dateien: einem eigenen Wiki für jedes deiner Projekte und einem gemeinsamen Wiki. Agenten schreiben die Artikel aus den Dokumenten und der Arbeit des Projekts; jeder Artikel nennt seine Quellen. Wiki-Memory ist neben Memory-Notizen und Dokumenten ein Teil von Hydors Memory. Dieser Beitrag erklärt, wie die drei zusammenspielen, wo Wiki-Memory gespeichert wird, wie neue Dokumente und die eigene Arbeit eines Projekts es aktualisieren, was du im Tab Memory eines Projekts siehst und was Agenten damit tun können und was nicht. So sammelt sich das, was ein Projekt lernt, mit der Zeit an, statt in jeder Sitzung erneut erarbeitet zu werden.

![Der Tab Memory eines Projekts mit Notizen, Wiki-Memory und Dokumenten](images/wiki-memory.webp)

## Das Zusammenspiel mit Notizen und Dokumenten

Memory hat drei Teile. Jeder hat eine andere Aufgabe, und sie arbeiten zusammen:

- **Memory-Notizen** sind kurze Fakten, mit denen jeder Agent startet: über dich, über ein Projekt, über eine Sitzung; siehe [Memory](/guide/memory).
- **Wiki-Memory** besteht aus Artikeln: länger, verknüpft und mit ihren Quellen, geführt für jedes Projekt (und ein gemeinsames Wiki). Agenten lesen sie, wenn sie die Einzelheiten brauchen, und ergänzen sie bei der Arbeit. Sie werden nicht vollständig übergeben: Ein Agent erfährt, welche Artikel zu seiner aktuellen Arbeit passen (siehe unten).
- **Dokumente** sind die eigentlichen Dateien, die Agenten durchsuchen und zitieren; siehe [Projekte und Wissen](/guide/projects#give-a-project-documents-of-its-own).

Die Grundlage ist ein von einem KI-Agenten gepflegtes Wiki: Die Originalquellen bleiben erhalten, ihre Aussagen werden in Artikeln zusammengeführt, die auf die Quellen verweisen. Bei neuen Informationen aktualisiert der Agent die Artikel, statt von vorn zu beginnen. Du kannst auf bisherigen Ergebnissen aufbauen und nachvollziehen, woher eine Aussage stammt.

Wird ein Dokument hinzugefügt oder geändert, kann Hydor es lesen und seine Inhalte in die beiden anderen Teile übernehmen: einige Memory-Notizen (bei Projektdokumenten) und Aktualisierungen des Wikis; siehe [Aus neuen Dokumenten lernen](#learn-from-new-documents). Etwa einmal am Tag liest Hydor außerdem die letzten Unterhaltungen und Commit-Nachrichten des Projekts und übernimmt ins Wiki, was sich zu behalten lohnt; siehe [Aus der Arbeit des Projekts lernen](#learn-from-the-projects-work).

**Was Agenten ungefragt erhalten.** Ein Agent in einem Projekt erhält mit deiner ersten Nachricht bis zu drei Zeilen, die Artikel des Projekts nennen, die dazu passen („Aus dem Wiki dieses Projekts (wiki_read öffnet einen Artikel)“: Titel jedes Artikels, eine Zeile dazu, was er sagt, und wo er liegt), und mit einer späteren Nachricht höchstens eine. Mehr liest er mit dem Wiki-Tool, wenn er es braucht. Es zählen nur Artikel, nicht die Quellen, `index.md` oder `log.md`, und meist ist keiner klar genug, um genannt zu werden. Eine Zeile sagt „kann veraltet sein“, wenn sich die Dateien, die ihr Artikel nennt, seit dem Schreiben geändert haben (siehe [An den Code gebundene Artikel](#articles-tied-to-the-code)). Die aktiven Pläne des Projekts stehen in den Anweisungen des Agenten, jeweils mit Titel, Ablageort und dem, was noch offen ist („Aktive Pläne im Wiki dieses Projekts“). Dazu muss Wiki-Memory für das Projekt und für den Chat eingeschaltet sein und Memory für die Sitzung; in einer vertraulichen Sitzung geschieht es nie, und eine Sitzung ohne Projekt erhält das gemeinsame Wiki nicht ungefragt. Custom mit einem kleinen Modell erhält weniger Zeilen oder keine (siehe [Custom](/guide/custom#what-the-model-reads)). Wie Memory sonst übergeben wird, steht unter [Womit ein Agent startet](/guide/memory#what-an-agent-starts-with).

## Ein- oder ausschalten

Wiki-Memory ist für jedes Projekt eingeschaltet, solange du es nicht ausschaltest. Zwei Stellen bestimmen das:

- [Einstellungen → Funktionen → Memory → Wiki-Memory](/settings?s=memory&find=Wiki%20memory) enthält den Standard: den Schalter **Wiki-Memory**. Er steuert auch das gemeinsame Wiki, das keinem Projekt gehört.
- Im Tab **Einstellungen** jedes Projekts bietet **Wiki-Memory** die Auswahl **Wie in den Einstellungen (ein)** (beziehungsweise **(aus)**, je nach aktuellem Standard), **Ein** oder **Aus**. Die Auswahl wird sofort gespeichert. Mit **Ein** oder **Aus** legst du fest, dass dieses Projekt vom Standard abweicht.
- Darunter bietet **Höchstzahl der Dokumente für sein Wiki** die Auswahl **Wie in den Einstellungen (100)** (die Zahl, die [Einstellungen](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki) gerade haben) oder **Eine eigene Zahl** mit einem Feld zum Eintippen. Auch das wird sofort gespeichert. Was es bewirkt, steht unter [Wenn ein Projekt zu viele Dokumente hat](#when-a-project-has-too-many-documents).

Ist Wiki-Memory für ein Projekt ausgeschaltet, steht im Tab Memory „Wiki-Memory ist für dieses Projekt ausgeschaltet“. Auch die Wiki-Tools der Agenten melden dort, dass es ausgeschaltet ist, und schreiben nichts. Was schon im Ordner liegt, bleibt erhalten.

In den Chat-Optionen gelten **Wiki-Memory** und **Automatische Lessons Learned** für den jeweiligen Chat. Ihre Standards stehen unter **Einstellungen → Memory → Wiki-Memory**. Automatische Vorschläge für Lessons Learned brauchen außerdem Memory; das Speichern eines geprüften Vorschlags erfordert deine Bestätigung. Ein nativer Agent, der vor dem Einschalten von Wiki-Memory gestartet wurde, muss neu gestartet werden, damit er seinen Checkpoint-Hook registriert.

Für das Lernen aus Dokumenten, das Lernen aus der Arbeit eines Projekts und für Sitzungs-Checkpoints muss außerdem [Memory selbst eingeschaltet sein](/guide/memory#turn-memory-off-for-all-sessions): Bei ausgeschaltetem Memory ergänzen neue Dokumente nichts, und es werden keine Checkpoints gespeichert.

## Wo Wikis gespeichert werden

Standardmäßig liegen alle Wikis in einem Ordner: **Wiki-Ordner** unter [Einstellungen → Memory → Wiki-Memory](/settings?s=memory&find=Wiki%20folder). Anfangs ist das `.wiki` im Aufgabenordner von Hydor, zum Beispiel `~/Hydor/.wiki`. Dieser Ordner ist das gemeinsame Wiki, und das Wiki jedes Projekts ist ein eigener Ordner darin unter `projects/`, der bei Bedarf angelegt wird. Sein Name orientiert sich am Projektnamen und bleibt auch bei einer Umbenennung des Projekts erhalten. In deine Projektordner, die häufig Git-Repositories sind, wird nichts geschrieben.

Der Wiki-Ordner ist ein absoluter Pfad auf dem Computer, auf dem Hydor läuft (läuft Hydor in einem Container, ein Pfad, den der Container erreicht). **Durchsuchen** öffnet die Ordnerauswahl: In der Desktop-App ist das der Systemdialog; im Browser oder von einem anderen Gerät zeigt Hydor die Ordner des Computers, auf dem es läuft, und du kannst dort einen Ordner erstellen.

Unter **Projekt-Wikis** kannst du stattdessen **Im Ordner jedes Projekts** wählen. Jedes Projekt speichert sein Wiki dann in seinem eigenen Ordner, und zwar unter **Ordner innerhalb jedes Projekts** (anfangs `.wiki`; ein Pfad innerhalb des Projekts, niemals `.git`). **Aus Git heraushalten** ergänzt beim Schreiben des Wikis dessen Ordner in der `.gitignore` des Projekts, und zwar nur für Wikis, die im Projektordner liegen, und nur in Git-Repositories. Die Option ist anfangs aus. Späteres Ausschalten entfernt einen bereits ergänzten Eintrag nicht, und Dateien, die Git schon erfasst, bleiben erfasst.

Ein Projekt kann seinen Wiki-Ordner auch selbst benennen: Eine Zeile wie ``- Wiki: `knowledge/wiki` `` in seiner `AGENTS.md` legt diesen Ordner innerhalb des Projekts als sein Wiki fest. Das hat Vorrang vor den Einstellungen oben. Ignoriert wird ein Pfad, der absolut ist, mit `~` beginnt, mit `..` aus dem Projekt herausführt, durch einen Git- oder verborgenen Hydor-Ordner geht, das Projekt über eine Verknüpfung verlässt oder zum gemeinsamen Wiki selbst führt. Nur Projekte haben ein eigenes Wiki: In einem Ordner, der keines deiner Projekte ist, verwenden Agenten das gemeinsame Wiki, egal was der Ordner enthält.

Unabhängig von den Einstellungen liegt jedes Wiki stets in einem Ordner innerhalb des Wiki-Ordners oder innerhalb seines eigenen Projekts, niemals woanders.

Im Wiki enthält `wiki/` die Artikel und `raw/` ihre Quellen. `index.md` listet die Artikel auf, `log.md` hält fest, was sich wann geändert hat. Es sind gewöhnliche Markdown-Dateien, die auch andere Tools lesen können.

## Aus neuen Dokumenten lernen

Ist **Aus neuen Dokumenten lernen** (unter Einstellungen → Memory → Wiki-Memory, anfangs eingeschaltet) aktiviert, aktualisiert ein Dokument, das dem Wissen hinzugefügt oder dort geändert wird, Memory automatisch:

- Dokumente eines Projekts ergänzen **dessen** Wiki und **dessen** Memory-Notizen.
- Dokumente im gemeinsamen Wissen ergänzen das gemeinsame Wiki. Sie erzeugen keine Memory-Notizen, da sie keinem Projekt gehören.

Das unter [Einstellungen → Modelle](/settings?s=models) gewählte Hilfsmodell liest die Dokumente schrittweise:

- Ein Dokument wird gelesen, sobald seine Wissensdatenbank etwa eine halbe Minute lang keine neuen Dateien erhalten hat, einzeln nacheinander und höchstens 40 pro Stunde. Die übrigen warten auf die nächste Stunde.
- Gelesen werden die ersten 40.000 Zeichen eines Dokuments; wurde gekürzt, steht das in der gespeicherten Quelle.
- Der Text des Dokuments wird ohne Passwörter und Keys als Quelle im Ordner `raw/` des Wikis gespeichert. Dann wählt es aus, zu welchen Artikeln das Dokument passt: Hydor findet die besten zwanzig anhand der Wörter ihrer Titel und ihrer Bedeutung und zeigt dem Hilfsmodell nur diese. Es wählt bis zu drei davon zum Ergänzen, bis zu zwei neue Artikel und bis zu drei kurze Notizen für das Projekt aus.
- Die Artikel behalten nur das Wichtige: wofür das Dokument da ist, seine zentralen Fakten, Ergebnisse, Entscheidungen, Namen und Zahlen. Einzelheiten, Beispiele und Tabellen Zeile für Zeile bleiben im Dokument, das Agenten durchsuchen.
- Artikel können überarbeitet werden, nicht nur ergänzt (siehe [Überarbeitungen und lange Artikel](#revisions-and-long-articles)). Alles, was ein Geheimnis enthält, wird weggelassen. Die Notizen sind kurz und neu und wiederholen keine, die das Projekt schon hat.
- Ein Dokument mit demselben Text wird nicht zweimal gelesen. Eine Änderung am Dokument löst erneutes Lesen aus.
- Dokumente, die schon im Wissen eines Projekts liegen, werden ebenfalls einmal gelesen, im selben Tempo (die neuesten zuerst, bis zu 400 pro Projekt, wobei das gemeinsame Wissen wie ein Projekt zählt). Das Wiki eines bestehenden Projekts füllt sich also über einige Stunden. Ein Projekt wird alle zehn Minuten erneut angesehen; ein Projekt, das noch nicht bereit war (sein Wiki-Memory war aus, zum Beispiel), wird gelesen, sobald es bereit ist. Ein Projekt mit mehr Dokumenten als seiner Höchstzahl liest die, die es auswählt (siehe unten).
- Der Ordner des Wiki-Memory ist selbst eine Wissensdatenbank, verarbeitet sich aber nie selbst.

Ist das Hilfsmodell nicht erreichbar oder findet es nichts, was sich zu ergänzen lohnt, geht nichts verloren: Die Aktualisierung wird mit dem Grund aufgeführt, und das Dokument wird erneut versucht, wenn es sich ändert.

### Überarbeitungen und lange Artikel

Ein Artikel wuchs früher nur. Jetzt kann eine neuere Quelle ersetzen, was ein Artikel sagte, wenn sie einer Aussage widerspricht oder zeigt, dass sie veraltet ist:

- Für jede Aussage, die es herausnimmt, nennt das Hilfsmodell einen Grund: durch eine Quelle ersetzt, in einen anderen Artikel verschoben oder seit einem Datum nicht mehr wahr. Eine Neufassung, die mehr als ein Fünftel des Artikels weglässt, wird abgelehnt, es sei denn, jede weggelassene Aussage ist mit ihrem Grund aufgeführt (und stand wirklich im Artikel); eine Neufassung, die weniger als die Hälfte davon behielte, wird immer abgelehnt.
- Vor einer Neufassung wird der frühere Text als **Snapshot** in einem verborgenen Verlaufsordner im Wiki aufbewahrt, die 20 neuesten je Artikel, und `log.md` erhält eine Zeile wie „revised … replaced 2 statements (earlier text kept)“.
- Ein Artikel mit mehr als 12.000 Zeichen, der aktualisiert werden muss, wird zuerst **geteilt**: Das Hilfsmodell ordnet ihn zu einem Hub an derselben Stelle um, mit Links zu zwei bis fünf Teilen. Die Teile müssen mindestens 90 % seines Textes in seinen eigenen Worten behalten: Es wird umgeordnet, nicht zusammengefasst. `log.md` vermerkt die Teilung, und sein Text bleibt als Snapshot erhalten. Lässt er sich nicht teilen und ist zu lang für eine Neufassung, bleibt er unverändert, und die Aktualisierung sagt das.

Jeder Artikel behält außerdem eine einzeilige **Zusammenfassung**, die in `index.md` neben seinem Titel und in den Zeilen steht, die Agenten erhalten.

### Wenn ein Projekt zu viele Dokumente hat

Jede Datei einer großen Sammlung (tausend Fachartikel, eine ganze Dokumentations-Website) zu lesen, würde das Hilfsmodell Tage kosten und viel Geld, und das Wiki wäre zu voll, um zu helfen. Deshalb liest das Wiki von den Dokumenten eines Projekts **höchstens eine Höchstzahl**: **Höchstzahl der Dokumente für das Wiki** unter [Einstellungen → Memory → Wiki-Memory](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki), anfangs 100 (eine ganze Zahl von 0 bis 100.000). Hat ein Projekt mehr Dokumente, liest sein Wiki bis zur Höchstzahl davon, in dieser Reihenfolge:

1. die, die du **angeheftet** hast (siehe unten);
2. dann die, die Agenten **am häufigsten genutzt** haben, das heißt, eine Dokumentensuche hat eine ihrer Passagen geliefert oder ein Agent hat es gelesen;
3. dann die **neuesten**.

Die übrigen werden nicht ins Wiki gelesen. Agenten finden und zitieren sie weiterhin mit der gewöhnlichen Dokumentensuche, die alle abdeckt. Gezählt werden die indexierten Dokumente im eigenen Wissen des Projekts, nicht die eigenen Dateien des Wikis. Das gemeinsame Wiki zählt das gemeinsame Wissen auf dieselbe Weise.

- **Ein Dokument anheften**: Öffne im Tab **Memory** des Projekts unter **Dokumente** das Menü **Mehr** eines Dokuments und wähle **Ins Wiki-Memory einlesen**; **Nicht ins Wiki-Memory einlesen** nimmt es wieder heraus. Ein angeheftetes Dokument zeigt ein Pin-Symbol. Das Menü gibt es, solange Wiki-Memory eingeschaltet ist. Ein angeheftetes Dokument kommt zuerst, wird also auch gelesen, wenn das Projekt über seiner Höchstzahl liegt, und zwar sofort; das Wiki liest insgesamt nie mehr als seine Höchstzahl.
- **Übersichten**: Für jeden Ordner mit Dokumenten, die das Wiki nicht liest (bei einem großen Ordner seine eigenen Unterordner, wenn sie mindestens fünf enthalten), schreibt das Hilfsmodell einen kurzen Artikel „Overview: <Ordner>“ aus den Titeln, Größen, Daten und ersten Zeilen der Dokumente: welche Arten von Dokumenten dort liegen, wie viele und welche bemerkenswert sind. Es rät nichts über ihren Inhalt und sagt, dass Agenten das mit einer Dokumentensuche finden. Er wird neu geschrieben, wenn sich die ungelesenen Dokumente des Ordners ändern, höchstens drei pro Stunde. Sie stehen unter **Letzte Aktualisierungen** als **Übersicht**.

- Ein Projekt kann eine eigene Zahl haben: im Tab **Einstellungen** unter **Höchstzahl der Dokumente für sein Wiki** (siehe [Ein- oder ausschalten](#turn-it-on-or-off)). Sie hat Vorrang vor der Zahl in den Einstellungen; **Wie in den Einstellungen** folgt wieder dieser.
- Eine Höchstzahl von 0 liest gar keine Dokumente und sagt „Dieses Projekt hat 240 Dokumente, mehr als die 0, die sein Wiki liest: Agenten durchsuchen sie, statt sie ins Wiki zu lesen.“ Um das Lesen von Dokumenten für alle Projekte zu beenden, schalte stattdessen **Aus neuen Dokumenten lernen** aus.
- Änderst du eine Höchstzahl, wird das Projekt innerhalb von zehn Minuten erneut angesehen: Erhöhe sie, hefte Dokumente an oder lösche Dokumente, bis das Projekt darunter liegt, und die Dokumente, die es nun liest, werden dann gelesen. Auch Dokumente, die ankamen, während das Projekt über der Höchstzahl lag, werden gelesen, wenn sie zu denen gehören, die es liest.
- Der Tab Memory des Projekts sagt es, wenn es darüber liegt: „Sein Wiki liest 100 seiner 240 Dokumente ein: die angehefteten, die am häufigsten genutzten und die neuesten. Agenten durchsuchen alle.“

### Große Datendateien

Eine große Datendatei, etwa eine CSV- oder TSV-Datei, eine Tabelle oder JSON-Daten (mehr als 40.000 Zeichen Text oder größer als 256 KB), lässt sich als Text schlecht lesen. Deshalb analysiert das Hilfsmodell sie stattdessen mit Code:

- Es schreibt kurze Python-Programme, und Hydor führt jedes in einer Sandbox ohne Netzwerk aus, die nur diese Datei (schreibgeschützt) und einen Arbeitsordner sieht: bis zu vier Läufe von je einer Minute. Das Hilfsmodell liest, was sie ausgeben, und schreibt dann seine Erkenntnisse auf: was die Datei enthält, ihre Größe und Spalten, zentrale Zahlen und Muster.
- Nur die Erkenntnisse werden als Quelle gespeichert und fließen in die Artikel ein. Die Datei bleibt im Wissen, wo Agenten sie durchsuchen.
- Dazu braucht es eine Sandbox für Code, die Hydor unter Linux mit bubblewrap hat. Anderswo (vorerst macOS und Windows) werden große Datendateien nur durchsucht, und **Letzte Aktualisierungen** sagt das.

In einer Sitzung kann ein Agent, der Befehle ausführen darf, eine solche Datei selbst analysieren und in einem Skript von ihrem Pfad laden.

## Aus der Arbeit des Projekts lernen

Etwa einmal am Tag liest das Hilfsmodell, wenn **Aus Unterhaltungen lernen** in [Memory](/settings?s=memory&find=Learn%20from%20conversations) eingeschaltet ist (anfangs der Fall), die letzten Unterhaltungen und Commit-Nachrichten eines Projekts und übernimmt in dessen Wiki, was sich zu behalten lohnt. Es liest nur, was du und die Agenten gesagt haben: deine eigenen Worte (nicht angehängte Dateien oder eingefügte Texte) und die jeweils letzte Antwort eines Agenten an dich, nie die Ausgabe von Tools. Eine vertrauliche Sitzung, eine Sitzung mit ausgeschaltetem Memory, eine Hilfssitzung oder einen geplanten Lauf liest es nie.

- **Unterhaltungen, ausgewählt nach ihrem Inhalt.** Es läuft, wenn das letzte Mal einen Tag oder länger her ist und zehn Minuten lang niemand einem Agenten geschrieben hat, damit es deine Arbeit nicht stört. Ein ausgelastetes Projekt hat mehr Unterhaltungen, als sich zu lesen lohnt; deshalb erhält jede eine Bewertung nach dem, was ihr Text zeigt: darin gemachte Commits, Korrekturen von dir, behobene Fehler und ihre Länge. Die besten kommen zuerst, kurze werden übersprungen. Es liest pro Durchlauf höchstens vier Unterhaltungen für ein Projekt und zwölf insgesamt. Beim ersten Mal schaut es zwei Wochen zurück, sodass ein Projekt, das schon Sitzungen hat, bald nach dem Update sein Wiki bekommt. Danach liest es nur noch Neues: Es merkt sich in jeder Sitzung, wo es aufgehört hat, sodass eine gelesene Unterhaltung nie erneut gelesen wird und bei einer fortgesetzten nur ihre neuen Beiträge. Eine Sitzung, in der ein Agent gerade arbeitet, wartet auf das nächste Mal, ebenso eine, für die es keinen Platz mehr hatte.
- **Unterhaltungen, die ruhig geworden sind.** Eine Sitzung wird auch gelesen, sobald sie 30 Minuten lang keinen neuen Beitrag hatte, ohne den Durchlauf des Tages abzuwarten, damit das Gelernte früher im Wiki steht. Insgesamt werden pro Projekt und Tag höchstens acht Sitzungen gelesen.
- **Commit-Nachrichten.** Einmal am Tag werden für ein Projekt in einem Git-Repository die neuen Commit-Nachrichten (bis zu 60: die Nachrichten, nicht der Code) als eine Quelle gelesen, ohne Passwörter und Keys, und unter **Letzte Aktualisierungen** als **Commits** aufgeführt.
- Zu jeder davon speichert es den Text ohne Passwörter und Keys als Quelle im Ordner `raw/` des Wikis, benannt nach der Sitzung und ihrem Tag, und ergänzt oder aktualisiert dann Artikel oder legt einen neuen an. Es behält dauerhaftes Wissen über das Projekt: Entscheidungen und warum sie getroffen wurden, wie Dinge funktionieren, Konventionen, Befehle, die funktioniert haben, Stolperfallen und ihre Lösungen, Ergebnisse und offene Fragen. „Nichts, was sich zu behalten lohnt“ ist eine völlig in Ordnung gehende Antwort.
- Es behält nie persönliche Angaben über dich, Geheimnisse, Anweisungen für Agenten oder ein Schritt-für-Schritt-Protokoll dessen, was ein Agent getan hat. Artikel können überarbeitet werden, wie bei Dokumenten. Es ergänzt keine Memory-Notizen: Diese kommen aus [Aus Unterhaltungen lernen](/guide/memory#learn-from-conversations) bei der Bereinigung.

Jede Unterhaltung und die Commits jedes Tages erscheinen unter **Letzte Aktualisierungen** im Tab Memory des Projekts, und du kannst die Sitzung von dort öffnen. Um das alles zu beenden, schalte [Aus Unterhaltungen lernen](/settings?s=memory&find=Learn%20from%20conversations) aus (das beendet auch das eigene Lernen von Memory aus Unterhaltungen) oder schalte Wiki-Memory für das Projekt aus.

## An den Code gebundene Artikel

Ein Artikel über den Code eines Projekts veraltet, wenn sich der Code ändert. Deshalb hält jeder Artikel, den das Wiki schreibt, neben seiner Zusammenfassung fest, welche Dateien und Ordner des Projekts er nennt (bis zu 30) und bei welchem Commit das Projekt stand, als er geschrieben wurde.

- Einmal am Tag vergleicht Hydor für ein Projekt, dessen Ordner ein Git-Repository ist, diese Dateien mit dem, was sich seit diesem Commit geändert hat. Ohne Modell wird ein Artikel, dessen Dateien sich geändert haben, als **veraltet** markiert, und Agenten erhalten seine Zeile mit dem Vermerk „kann veraltet sein“, bis er aktualisiert wurde.
- Bis zu fünf veraltete Artikel pro Tag bringt dann das Hilfsmodell anhand des Artikels und der Änderung an seinen Dateien auf den neuesten Stand, nach denselben Regeln wie jede Überarbeitung: der frühere Text als Snapshot aufbewahrt, jede ersetzte Aussage mit Grund aufgeführt, eine Zeile in `log.md` (siehe [Überarbeitungen und lange Artikel](#revisions-and-long-articles)). Die Markierung „veraltet“ verschwindet, wenn ein Artikel überarbeitet wurde oder seine Dateien wieder so sind, wie sie waren.
- Jedes davon erscheint unter **Letzte Aktualisierungen** im Tab Memory des Projekts als **Code-Änderungen**, mit den Artikeln, die es aktualisiert hat.

Ein Projekt, das kein Git-Repository ist, hat keine solchen Markierungen. Dieselben Bindungen zwischen den Dateien eines Projekts und dem, was es sich merkt, gelten für Memory-Notizen (siehe [Automatisch bereinigen](/guide/memory#tidy-up-automatically)).

## Der Tab Memory eines Projekts

Öffne [Projekte](/projects), wähle ein Projekt und seinen Tab **Memory**. Dieser ersetzt die früheren Tabs Wissen und LLM Wiki. Seine Anzahl summiert Notizen, Artikel und Dokumente. Oben wechselst du zwischen drei Bereichen:

- **Notizen**: die Memory-Notizen des Projekts wie unter Einstellungen → Memory, mit **Notiz hinzufügen**, einem Suchfeld und dem Ordner, zu dem sie gehören.
- **Wiki**: die Artikel und Quellen des Projekts. Wähle einen Eintrag zum Lesen, folge seinen Links und öffne die angegebenen Quellen. Hier kannst du nur lesen; Agenten schreiben das Wiki. Ist Wiki-Memory aus, sagt der Tab das und bietet **Seine Einstellungen öffnen**. Ist noch nichts darin, steht dort „Hier ist noch nichts. Agenten ergänzen es bei der Arbeit, und neue Dokumente aktualisieren es.“ Unter der Liste steht der Ordner des Wikis.
- **Dokumente**: die eigenen Dokumente des Projekts und die Einstellung, ob seine Sitzungen auch das gemeinsame Wissen durchsuchen, wie bisher (siehe [Einem Projekt eigene Dokumente geben](/guide/projects#give-a-project-documents-of-its-own)). Eine Zeile sagt, wann neue und geänderte Dokumente auch die Notizen und das Wiki des Projekts ergänzen, und eine weitere, wenn das Projekt mehr Dokumente hat, als sein Wiki liest: „Sein Wiki liest 100 seiner 240 Dokumente ein: die angehefteten, die am häufigsten genutzten und die neuesten. Agenten durchsuchen alle.“ (siehe [Wenn ein Projekt zu viele Dokumente hat](#when-a-project-has-too-many-documents)). Der Bereich Wiki sagt das auch, unter den Artikeln. In der Liste der Dokumente einer Wissensdatenbank zeigt ein angeheftetes Dokument ein Pin-Symbol, und das Menü **Mehr** jeder Zeile bietet **Ins Wiki-Memory einlesen** oder **Nicht ins Wiki-Memory einlesen**.

Unter den Artikeln zeigt **Letzte Aktualisierungen**, was neue und geänderte Dokumente, die Unterhaltungen des Projekts, seine Commits und sein Code zuletzt bewirkt haben, neueste zuerst, höchstens 20. Jede Zeile sagt, woher sie stammt: das Dokument; **Sitzung:** und den Titel der Sitzung (ein Klick öffnet die Sitzung); **Commits:** und den gelesenen Bereich; **Code-Änderungen** für Artikel, die nach einer Änderung der Dateien des Projekts aktualisiert wurden (siehe [An den Code gebundene Artikel](#articles-tied-to-the-code)); oder **Übersicht:** und den Namen eines Ordners für eine Übersicht über Dokumente, die das Wiki nicht liest. Dann, wie lange es her ist, die ergänzten oder geänderten Artikel, wie viele Notizen hinzugefügt wurden, oder „Nichts zu ergänzen“, oder warum nichts geschah oder was schiefging. Ein Klick auf einen Artikel öffnet ihn.

Die **Memory**-Karte im Tab Übersicht fasst den Stand zusammen („12 Notizen · 8 Artikel · 5 Dokumente“). Auf dem Smartphone bleibt die Bereichsauswahl gleich, die Listen stehen untereinander.

## Was Agenten damit tun können

In einem Projekt erhält ein Agent einige Tools für das Wiki dieses Projekts, keine für ein anderes:

- Er kann abfragen, wo das Wiki liegt und ob etwas darin ist, und einen Artikel oder eine Quelle lesen. Welche Artikel zu deiner Anfrage passen, erfährt er ungefragt (siehe [Das Zusammenspiel mit Notizen und Dokumenten](#how-it-sits-beside-notes-and-documents)).
- Er kann einen Text oder ein Dokument als Quelle speichern (eine Dokumentdatei bis zu 20 MiB, unverändert, mit ihrem Text daneben; der Text kann unvollständig sein) und Artikel, `index.md` und `log.md` schreiben. Um eine Datei zu ändern, muss er sie zuvor gelesen haben, damit zwei Schreibzugriffe einander nicht überschreiben. Eine gespeicherte Quelle kann er nicht mehr ändern.
- Er kann die Artikel prüfen: ob die angegebenen Quellen und die Links zwischen den Artikeln existieren.
- Er kann „das gemeinsame Wiki“ nennen, um stattdessen dort zu arbeiten, sofern es eingeschaltet ist.
- Was in einem Wiki steht, findet er mit der gewöhnlichen Dokumentensuche, sodass eine Antwort den Artikel zitieren kann.

**Pläne.** Bitte einen Agenten, einen Plan zu übernehmen (einen, den du ihm gibst, oder ein Dokument, das schon im Wiki liegt). Er zeigt dir dann den genauen Text, wohin er kommt (`output/projects/<name>/plan.md` im Wiki des Projekts), sein Umsetzungsregister (was umgesetzt, bereitgestellt und abgenommen ist, jeweils als eigener Zustand, mit Nachweis oder dem, was es blockiert) und die Pläne, die schon da sind, und wartet auf dein OK. Um einen Plan zu ändern, zeigt er den alten und den neuen Text und den Grund und wartet erneut; der alte Text wird zuvor in einem geschützten Snapshot aufbewahrt, sodass jede frühere Fassung erhalten bleibt, und die Identität des Plans und die Nummern seiner Arbeitspunkte bleiben bestehen. Die Genehmigung eines Plans oder einer Änderung startet nie seine Umsetzung. Kein anderes Tool kann in `output/projects/` schreiben, wie auch immer eine Datei heißt: Pläne ändern sich nur auf diesem Weg. Was getan, bereitgestellt oder abgenommen wurde, wird mit dem gewöhnlichen Schreiben ins Wiki in `output/evidence/<plan>/` festgehalten, und nichts dort ist jemals ein Plan. Ein Plan wird im Tab Memory schreibgeschützt zusammen mit den Artikeln und Quellen angezeigt.

Was er nicht kann: auf das Wiki eines anderen Projekts zugreifen; verborgene Dateien und Ordner, Git- und Archivordner, stillgelegte oder archivierte Artikel oder einen Link, der aus dem Wiki hinausführt, lesen oder schreiben; Text mit Passwörtern oder Keys speichern; oder Wiki-Memory in einer vertraulichen Sitzung überhaupt verwenden. Bittest du den Agenten, das Wiki zu prüfen, meldet er eine einfache Liste grundlegender Probleme; Dateien ändert er dafür nicht.

## Checkpoints und Lessons Learned

Sind Wiki-Memory und Memory eingeschaltet, kann Hydors Custom-Agent bei der Verdichtung seines eigenen Kontexts einen Checkpoint der Sitzung speichern, von dem aus er danach weitermacht. Pro Sitzung gibt es einen Checkpoint, der bei jeder Speicherung überschrieben wird, im Ordner des gemeinsamen Wikis. Er enthält eine um sensible Angaben bereinigte Zusammenfassung oder nur das Ereignis, niemals einen vollständigen Gesprächsverlauf. Für Claude Code und Codex versucht Hydor einen Checkpoint, wenn du die Verdichtung aus Hydor startest, und, wenn sein nativer Hook registriert ist, vor einer automatischen Verdichtung. Bereits vorhandene oder verborgene Hooks, Plugins, Richtlinien oder eine nicht verfügbare Hook-Erkennung können die Registrierung verhindern. Unmittelbar vor einer automatischen Verdichtung gehen die letzten Nachrichten der Sitzung an das Hilfsmodell, das die Zusammenfassung schreibt. Das kann bis zu etwa 14 Sekunden dauern; die Verdichtung wartet darauf und läuft ohne Checkpoint weiter, wenn es länger dauert. Ein Checkpoint kann nur Metadaten enthalten, wenn keine Zusammenfassung verfügbar ist. Bei Codex vertraut Hydor nur seinem eigenen Hook (einem genauen Befehl, den es selbst erstellt hat und der allein dieser Sitzung übergeben wird); einem Hook von dir wird auf diese Weise nie vertraut, und Hydor sucht ihn einmal pro Codex-Version, nicht bei jedem Start. In den Sitzungsdetails siehst du das letzte Ergebnis. Ein fehlgeschlagener Checkpoint verhindert die Verdichtung nicht. Schaltest du Memory für eine Sitzung oder insgesamt aus, werden keine Checkpoints gespeichert oder verwendet; vorhandene bleiben erhalten.

Hydor nutzt den Checkpoint, um eine Sitzung fortzusetzen. Setzt du eine Claude-Code- oder Codex-Sitzung fort, nachdem ihr Kontext verdichtet wurde, enthält die erste Nachricht, die sie erhält, einmalig den Checkpoint: wo man ihn liest, und seine Zusammenfassung, bis zu 3.000 Zeichen. Custom erhält den Checkpoint, nachdem es seine eigene Unterhaltung verdichtet hat, zusammen mit erneut gelesenem Memory für deine letzte Nachricht; sein Anteil richtet sich nach seinem Modell: höchstens 8 % des Kontexts des Modells und nie mehr als 16.000 Zeichen, mit dem Hinweis, wo man den Rest liest (siehe [Womit ein Agent startet](/guide/memory#what-an-agent-starts-with)).

Du kannst einen Agenten bitten, die Lessons Learned aus einer Sitzung in einer Vorschau zu zeigen: Dabei wird nichts geschrieben. Die Vorschau verwendet die indexierten Nachrichten, weshalb die neuesten fehlen können. Das Speichern ausgewählter Lessons Learned verlangt zuerst deine Bestätigung.

Ist **Automatische Lessons Learned** für einen Chat eingeschaltet, sieht sich das Hilfsmodell den letzten Austausch jedes Durchgangs an (höchstens etwa einmal pro Minute, nie in einem vertraulichen Chat und nie bei ausgeschaltetem Memory) und fügt, wenn es etwas findet, das sich zu behalten lohnt, einen Vorschlag als Karte im Chat hinzu: die Lessons Learned mit ihrem Nachweis und dem Ort, an den sie kämen. Es wird nichts geschrieben, bis du den Vorschlag dort übernimmst, und was du übernimmst, ist genau das, was du gesehen hast; oder du verwirfst ihn. Agenten können einen Vorschlag nicht für dich übernehmen oder verwerfen, und sie fragen dich, bevor sie einen der beiden Schalter eines Chats ändern. Der Schalter ist anfangs aus: Schalte ihn für alle Chats in den Einstellungen ein oder für einen Chat in dessen Optionen.

## Den Wiki-Ordner verschieben

Enthält der bisherige **Wiki-Ordner** Dateien, öffnet eine Änderung eine Prüfung. Du kannst die Dateien am bisherigen Ort lassen oder verschieben. Enthält auch der neue Ordner Dateien, kannst du die beiden Ordner zusammenführen oder das Ziel ersetzen, und bei Dateien, die in beiden vorkommen, die Fassung der Quelle, die des Ziels oder die nach Änderungszeit ältere behalten. Hydor behält von jedem ursprünglichen Ordner eine vollständige Kopie als verborgenes Backup daneben und zeigt, wo sie liegt. Der alte Ordner wird aufbewahrt, nicht gelöscht. Pausiere währenddessen andere Programme, die in einen der beiden Ordner schreiben, und passe andere Tools an, die auf den alten Pfad eingestellt sind. Beim Verschieben des Ordners des gemeinsamen Wikis ziehen die darin liegenden Projekt-Wikis mit um. Eine Änderung des Ordners innerhalb jedes Projekts verschiebt dagegen keine Projektdateien.

## Einen Agenten fragen

- „Ist Wiki-Memory für dieses Projekt eingeschaltet? Schalte es nur für das Projekt Taxes 2026 aus.“
- „Schalte Wiki-Memory für alle Projekte außer meiner Abschlussarbeit ein.“
- „Speichere das Wiki jedes Projekts in dessen eigenem Ordner unter `.wiki` und halte es aus Git heraus.“
- „Übernimm diesen Plan in das Wiki des Projekts.“
- „Verschiebe den Wiki-Ordner nach ~/Notes/wiki.“
- „Übernimm meine neuen Dokumente nicht mehr in Memory.“
- „Warum liest das Wiki dieses Projekts meine Dokumente nicht? Wie viele hat es?“
- „Lass das Wiki im Projekt Papers bis zu 300 Dokumente lesen und behalte die 100 für die anderen.“
- „Warum ist das Wiki dieses Projekts immer noch leer?“
- „Was haben meine letzten Dokumente zum Wiki dieses Projekts ergänzt?“
- „Aus welchen Unterhaltungen hat das Wiki dieses Projekts diese Woche gelernt?“
- „Übernimm dieses Paper als Quelle in das Wiki des Projekts und schreibe dann in einem Artikel, was es zum Retrieval sagt.“
- „Prüfe das Wiki dieses Projekts auf kaputte Links und fehlende Quellen.“
- „Hefte das Methods-Paper an, damit das Wiki es immer liest.“
- „Warum liest das Wiki 100 meiner 240 Dokumente? Welche liest es?“
- „Welche Artikel im Wiki dieses Projekts sind als veraltet markiert, und warum?“
- „Was hat das Wiki diese Woche aus den Commits dieses Projekts gelernt?“
- „Zeig mir, was sich im Architektur-Artikel bei seiner Überarbeitung geändert hat und was er ersetzt hat.“
- „Zeige eine Vorschau der Lessons Learned dieser Sitzung und speichere die ersten beiden.“
