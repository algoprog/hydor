# Wiki-Memory

Wiki-Memory besteht aus verknüpften Artikeln in einfachen Markdown-Dateien: einem eigenen Wiki für jedes Projekt und einem gemeinsamen Wiki. Agenten schreiben die Artikel aus den Dokumenten und der Arbeit des Projekts; jeder Artikel nennt seine Quellen. Wiki-Memory ist neben Memory-Notizen und Dokumenten ein Teil von Hydors Memory. Dieser Beitrag erklärt ihr Zusammenspiel, Speicherorte, die Aktualisierung durch neue Dokumente, den Tab Memory eines Projekts und die Möglichkeiten und Grenzen der Agenten. So sammelt sich Projektwissen mit der Zeit an, statt in jeder Sitzung erneut erarbeitet zu werden.

![Der Tab Memory eines Projekts mit Notizen, Wiki-Memory und Dokumenten](images/wiki-memory.webp)

## Das Zusammenspiel mit Notizen und Dokumenten

Memory hat drei Teile mit unterschiedlichen Aufgaben, die zusammenarbeiten:

- **Memory-Notizen** sind kurze Fakten über dich, ein Projekt oder eine Sitzung, die jeder Agent beim Start erhält; siehe [Memory](/guide/memory).
- **Wiki-Memory** besteht aus längeren, verknüpften Artikeln mit Quellen für jedes Projekt sowie einem gemeinsamen Wiki. Agenten lesen sie bei Bedarf und ergänzen sie während ihrer Arbeit.
- **Dokumente** sind die eigentlichen Dateien, die Agenten durchsuchen und zitieren; siehe [Projekte und Wissen](/guide/projects#give-a-project-documents-of-its-own).

Die Grundlage ist ein von einem KI-Agenten gepflegtes Wiki: Originalquellen bleiben erhalten, ihre Aussagen werden in Artikeln zusammengeführt, die auf die Quellen verweisen. Bei neuen Informationen aktualisiert der Agent vorhandene Artikel, statt von vorn zu beginnen. Du kannst auf bisherigen Ergebnissen aufbauen und nachvollziehen, woher eine Aussage stammt.

Wird ein Dokument hinzugefügt oder geändert, kann Hydor seine Inhalte auch in die beiden anderen Teile übernehmen: einige Memory-Notizen bei Projektdokumenten und Aktualisierungen des Wikis. Siehe [Aus neuen Dokumenten lernen](#learn-from-new-documents).

## Ein- oder ausschalten

Wiki-Memory ist für jedes Projekt aktiviert, solange du es nicht ausschaltest. Zwei Einstellungen bestimmen das:

- [Einstellungen → Funktionen → Memory → Wiki-Memory](/settings?s=memory&find=Wiki%20memory) enthält den Standardschalter **Wiki-Memory**. Er steuert auch das gemeinsame Wiki, das keinem Projekt gehört.
- Im Tab **Einstellungen** jedes Projekts bietet **Wiki-Memory** die Auswahl **Wie in den Einstellungen (Ein)** beziehungsweise **(Aus)** je nach aktuellem Standard sowie **Ein** und **Aus**. Änderungen werden sofort gespeichert. Mit **Ein** oder **Aus** legst du eine Abweichung für dieses Projekt fest.

Ist Wiki-Memory für ein Projekt ausgeschaltet, erklärt das dessen Tab Memory. Auch die Wiki-Tools der Agenten melden, dass es ausgeschaltet ist, und schreiben nichts. Vorhandene Inhalte bleiben im Ordner erhalten.

Für das Lernen aus Dokumenten und Sitzungs-Checkpoints muss außerdem [Memory selbst eingeschaltet sein](/guide/memory#turn-memory-off-for-all-sessions). Bei ausgeschaltetem Memory ergänzen neue Dokumente nichts und es werden keine Checkpoints gespeichert.

## Wo Wikis gespeichert werden

Standardmäßig liegen alle Wikis in einem Ordner: **Wiki-Ordner** unter [Einstellungen → Memory → Wiki-Memory](/settings?s=memory&find=Wiki%20folder). Anfangs ist das `.wiki` im Aufgabenordner von Hydor, zum Beispiel `~/Hydor/.wiki`. Dieser Ordner enthält das gemeinsame Wiki. Jedes Projekt erhält darin bei Bedarf einen eigenen Unterordner unter `projects/`. Sein Name orientiert sich am Projektnamen und bleibt auch bei einer Projektumbenennung erhalten. In deine Projektordner, die häufig Git-Repositories sind, wird nichts geschrieben.

Der Wiki-Ordner ist ein absoluter Pfad auf dem Computer, auf dem Hydor läuft; bei einem Container muss der Pfad dort erreichbar sein. **Durchsuchen** öffnet in der Desktop-App den Systemdialog zur Ordnerauswahl. Im Browser oder von einem anderen Gerät zeigt Hydor die Ordner des ausführenden Computers; dort kannst du auch einen Ordner erstellen.

Unter **Projekt-Wikis** kannst du stattdessen **Im Ordner jedes Projekts** wählen. Jedes Projekt speichert sein Wiki dann am unter **Ordner innerhalb jedes Projekts** angegebenen Ort: anfangs `.wiki`, immer innerhalb des Projekts und niemals `.git`. **Aus Git heraushalten** ergänzt beim Schreiben des Wikis dessen Ordner in der `.gitignore` des Projekts, ausschließlich in Git-Repositories. Die Option ist anfangs aus. Späteres Ausschalten entfernt einen bereits ergänzten Eintrag nicht, und von Git bereits erfasste Dateien bleiben erfasst.

Ein Projekt kann seinen Wiki-Ordner auch selbst benennen: Eine Zeile wie ``- Wiki: `knowledge/wiki` `` in seiner `AGENTS.md` legt diesen Ordner innerhalb des Projekts als Wiki fest. Das hat Vorrang vor den genannten Einstellungen. Ignoriert werden absolute Pfade, Pfade mit `~` am Anfang, mit `..` aus dem Projekt herausführende Pfade, Wege durch Git- oder verborgene Hydor-Ordner und Verknüpfungen aus dem Projekt hinaus.

Unabhängig von den Einstellungen liegt jedes Wiki stets innerhalb des Wiki-Ordners oder seines eigenen Projekts, niemals außerhalb dieser Bereiche.

Im Wiki enthält `wiki/` die Artikel und `raw/` ihre Quellen. `index.md` listet die Artikel auf, `log.md` hält Änderungen mit Zeitpunkt fest. Es sind gewöhnliche Markdown-Dateien, die auch andere Tools lesen können.

## Aus neuen Dokumenten lernen

Ist **Aus neuen Dokumenten lernen** unter Einstellungen → Memory → Wiki-Memory aktiviert, wie es anfangs der Fall ist, aktualisieren neue oder geänderte Wissensdokumente Memory automatisch:

- Dokumente eines Projekts ergänzen **dessen** Wiki und **dessen** Memory-Notizen.
- Dokumente im gemeinsamen Wissen ergänzen das gemeinsame Wiki. Sie erzeugen keine Memory-Notizen, da sie keinem Projekt gehören.

Das unter [Einstellungen → Modelle](/settings?s=models) gewählte Hilfsmodell liest die Dokumente schrittweise:

- Sobald eine Wissensdatenbank etwa eine halbe Minute lang keine neuen Dateien erhalten hat, werden ihre Dokumente einzeln gelesen, höchstens 40 pro Stunde. Weitere Dokumente warten auf die nächste Stunde.
- Gelesen werden die ersten höchstens 40.000 Zeichen eines Dokuments. Eine Kürzung wird in der gespeicherten Quelle vermerkt.
- Der Dokumenttext wird ohne Passwörter und Keys als Quelle im Wiki-Ordner `raw/` gespeichert. Anschließend wählt das Hilfsmodell bis zu drei vorhandene Artikel zum Ergänzen, bis zu zwei neue Artikel und bis zu drei kurze Projektnotizen aus.
- Ein Artikel wird nur erweitert: Eine Neufassung, die ein Fünftel oder mehr des bisherigen Inhalts entfernt, wird abgelehnt. Artikel mit mehr als 20.000 Zeichen bleiben unverändert. Inhalte mit Geheimnissen werden nicht übernommen. Die kurzen Notizen sind neu und wiederholen keine bereits vorhandene Projektnotiz.
- Derselbe Dokumenttext wird nicht zweimal gelesen. Eine Dokumentänderung löst erneutes Lesen aus.
- Der Wiki-Memory-Ordner ist selbst eine Wissensdatenbank, verarbeitet sich aber nie selbst.

Ist das Hilfsmodell nicht erreichbar oder findet es keine sinnvolle Ergänzung, geht nichts verloren. Der Aktualisierungseintrag nennt den Grund; nach einer Änderung wird das Dokument erneut versucht.

## Der Tab Memory eines Projekts

Öffne [Projekte](/projects), wähle ein Projekt und seinen Tab **Memory**. Dieser ersetzt die früheren Tabs Wissen und LLM Wiki. Seine Anzahl summiert Notizen, Artikel und Dokumente. Oben wechselst du zwischen drei Bereichen:

- **Notizen**: Memory-Notizen des Projekts wie unter Einstellungen → Memory, mit **Notiz hinzufügen**, Suchfeld und dem zugehörigen Ordner.
- **Wiki**: Artikel und Quellen des Projekts. Wähle einen Eintrag zum Lesen, folge seinen Links und öffne die angegebenen Quellen. Hier kannst du nur lesen; Agenten schreiben das Wiki. Ist Wiki-Memory aus, erscheint ein Hinweis mit **Einstellungen öffnen**. Ist es noch leer, erklärt es, dass Agenten während der Arbeit Inhalte ergänzen und neue Dokumente sie aktualisieren. Unter der Liste steht der Wiki-Ordner.
- **Dokumente**: die eigenen Projektdokumente und die Einstellung, ob Sitzungen auch das gemeinsame Wissen durchsuchen. Siehe [Einem Projekt eigene Dokumente geben](/guide/projects#give-a-project-documents-of-its-own). Ein Hinweis erklärt, wann neue und geänderte Dokumente auch Notizen und Wiki des Projekts ergänzen.

Unter den Artikeln zeigt **Letzte Aktualisierungen**, was neue und geänderte Dokumente zuletzt bewirkt haben: neueste zuerst, höchstens 20 Einträge. Jeder nennt Dokument, Zeitpunkt, ergänzte oder geänderte Artikel und die Zahl hinzugefügter Notizen, gegebenenfalls „Nichts zu ergänzen“ oder den Grund für ausbleibende Änderungen beziehungsweise Fehler. Ein Klick öffnet einen Artikel.

Die **Memory**-Karte im Tab Übersicht fasst den Stand zusammen, etwa „12 Notizen · 8 Artikel · 5 Dokumente“. Auf dem Smartphone bleibt die Bereichsauswahl gleich, die Listen stehen untereinander.

## Was Agenten damit tun können

In einem Projekt erhält ein Agent einige Tools für dessen Wiki, keine für ein anderes Projekt:

- Er kann Speicherort und Inhaltsstatus abfragen und Artikel oder Quellen lesen.
- Er kann Texte oder Dokumente als Quellen speichern und Artikel, `index.md` sowie `log.md` schreiben. Dokumentdateien dürfen bis zu 20 MiB groß sein und werden unverändert mit ihrem Text daneben gespeichert; der ausgelesene Text kann unvollständig sein. Vor einer Dateiänderung muss der Agent die Datei gelesen haben, damit zwei Schreibzugriffe einander nicht überschreiben. Eine gespeicherte Quelle kann er nicht mehr ändern.
- Er kann prüfen, ob angegebene Quellen und Verknüpfungen zwischen Artikeln existieren.
- Mit dem Ziel „gemeinsames Wiki“ kann er stattdessen dort arbeiten, sofern es eingeschaltet ist.
- Wiki-Inhalte findet er über die gewöhnliche Dokumentensuche, sodass Antworten Artikel zitieren können.

Nicht erlaubt sind der Zugriff auf fremde Projekt-Wikis, Lesen oder Schreiben verborgener Dateien und Ordner, Git- und Archivordner, stillgelegter oder archivierter Artikel sowie Verknüpfungen aus dem Wiki hinaus. Texte mit Passwörtern oder Keys werden nicht gespeichert. In vertraulichen Sitzungen ist Wiki-Memory vollständig deaktiviert. Bittest du um eine Wiki-Prüfung, erstellt der Agent eine einfache Problemliste, ohne Dateien zu ändern.

## Checkpoints und Lessons Learned

Sind Wiki-Memory und Memory eingeschaltet, kann Hydors Custom-Agent bei seiner Kontextverdichtung einen Sitzungs-Checkpoint zum späteren Fortsetzen speichern. Pro Sitzung gibt es einen Checkpoint im gemeinsamen Wiki-Ordner, der bei jeder Speicherung ersetzt wird. Er enthält eine um sensible Angaben bereinigte Zusammenfassung oder nur das Ereignis, niemals einen vollständigen Gesprächsverlauf. Für Claude Code und Codex versucht Hydor einen Checkpoint, wenn du die Verdichtung aus Hydor startest. Eigenständige Verdichtungen dieser Programme sind nicht erfasst. Ein fehlgeschlagener Checkpoint verhindert die Verdichtung nicht. Schaltest du Memory für eine Sitzung oder insgesamt aus, werden keine Checkpoints gespeichert oder verwendet; vorhandene bleiben erhalten.

Du kannst einen Agenten um eine Vorschau der Lessons Learned aus einer Sitzung bitten. Dabei wird nichts geschrieben. Die Vorschau verwendet die indexierten Nachrichten, weshalb die neuesten fehlen können. Das Speichern ausgewählter Erkenntnisse verlangt zuerst deine Bestätigung.

## Den Wiki-Ordner verschieben

Enthält der bisherige **Wiki-Ordner** Dateien, öffnet eine Pfadänderung eine Prüfung. Du kannst die Dateien am bisherigen Ort lassen oder verschieben. Enthält auch das Ziel bereits Dateien, lassen sich die Ordner zusammenführen oder das Ziel ersetzen. Bei gleichen Dateipfaden wählst du die Quellfassung, die Zielfassung oder die laut Änderungszeit ältere Datei. Hydor behält von jedem ursprünglichen Ordner eine vollständige Kopie als verborgenes Backup daneben und zeigt den Speicherort. Der alte Ordner wird aufbewahrt, nicht gelöscht. Pausiere währenddessen andere Programme, die in einen der Ordner schreiben, und passe andere Tools mit dem bisherigen Pfad an. Beim Verschieben des gemeinsamen Wiki-Ordners ziehen die enthaltenen Projekt-Wikis mit um. Eine Änderung des Ordners innerhalb jedes Projekts verschiebt dagegen keine Projektdateien.

## Einen Agenten fragen

- „Ist Wiki-Memory für dieses Projekt eingeschaltet? Schalte es nur für das Projekt Taxes 2026 aus.“
- „Aktiviere Wiki-Memory für alle Projekte außer meiner Abschlussarbeit.“
- „Speichere jedes Projekt-Wiki in seinem eigenen Projektordner unter `.wiki` und halte es aus Git heraus.“
- „Verschiebe den Wiki-Ordner nach ~/Notes/wiki.“
- „Übernimm neue Dokumente nicht mehr automatisch in Memory.“
- „Was haben meine letzten Dokumente zum Wiki dieses Projekts ergänzt?“
- „Übernimm diesen Fachartikel als Quelle in das Projekt-Wiki und beschreibe seine Aussagen zum Retrieval in einem Wiki-Artikel.“
- „Prüfe das Projekt-Wiki auf kaputte Links und fehlende Quellen.“
- „Zeige eine Vorschau der Lessons Learned dieser Sitzung und speichere die ersten beiden.“
