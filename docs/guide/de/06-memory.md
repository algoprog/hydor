# Memory

Agenten in Hydor behalten wichtige Informationen über Sitzungen hinweg: Fakten über dich, deine Projekte und den Stand einer Aufgabe sowie dein Profil, das jeder Agent zu Beginn erhält. Dieser Beitrag erklärt, was gespeichert wird, wann das geschieht, womit Agenten starten und wie du Einträge ansiehst, korrigierst oder zurücknimmst. Außerdem behandelt er alle Optionen unter Einstellungen → Memory, einschließlich der semantischen Suche und automatischen Bereinigung. So müssen Agenten nicht mehrfach dasselbe fragen, und du kannst jederzeit nachvollziehen, was sie wissen.

![Einstellungen → Memory: gespeichertes Wissen über dich und deine Projekte](images/memory.webp)

## Was Agenten speichern

Memory hat drei Teile, die zusammenarbeiten:

- **Memory-Notizen**: kurze Fakten über dich, ein Projekt oder eine Sitzung, die jeder Agent beim Start erhält. Darum geht es im Großteil dieses Beitrags.
- **Wiki-Memory**: längere Artikel mit Quellen, die Agenten für jedes Projekt sowie in einem gemeinsamen Wiki aus Dokumenten und Arbeitsergebnissen schreiben; siehe [Wiki-Memory](/guide/wiki-memory).
- **Dokumente**: die eigentlichen Dateien, die Agenten durchsuchen und zitieren. Sie liegen im [gemeinsamen Wissen](/knowledge) und im Projekt-Tab **Memory** unter **Dokumente**; siehe [Projekte und Wissen](/guide/projects).

Im Tab **Memory** eines Projekts findest du alle drei Teile. Bei neuen oder geänderten Dokumenten liest das Hilfsmodell deren Inhalt, ergänzt einige Projektnotizen und aktualisiert das Wiki; siehe [Aus neuen Dokumenten lernen](/guide/wiki-memory#learn-from-new-documents).

Memory-Notizen sind kurz: ein oder zwei Sätze mit höchstens 500 Zeichen. Alle von der App ausgeführten Agenten teilen diese Notizen: Claude Code, Codex, Custom und ACP-Agenten wie Gemini CLI. Die eigenen Memory-Funktionen von Claude Code und Codex bleiben in App-Sitzungen ausgeschaltet. So gibt es einen gemeinsamen, einsehbaren und korrigierbaren Bestand. Jede Notiz gehört zu einem von drei Bereichen:

- **Über dich**: dauerhafte Fakten und Vorlieben, etwa „Bevorzugt metrische Einheiten“, „Mag kurze Antworten“ oder „Arbeitet hauptsächlich mit Python“. Jede Sitzung erhält diese Informationen.
- **Projekt**: projektspezifische Fakten wie Konventionen, Build- und Testbefehle, Ablageorte und Entscheidungen. Als Projekt zählt hier der Stammordner des Git-Repositorys, in dem die Sitzung arbeitet, andernfalls ihr Arbeitsordner. Worktrees teilen die Notizen ihres Hauptrepositorys, sodass alle Branches denselben Stand sehen. Eine Sitzung direkt in deinem Benutzerordner erhält keine Projektnotizen, sondern nur persönliche und sitzungseigene Notizen.
- **Sitzung**: der Arbeitsstand einer einzelnen Aufgabe für ihre spätere Fortsetzung. Diese Notizen werden mit der Sitzung gelöscht.

Eine Sitzung sieht und verändert nur persönliche Notizen, Notizen ihres eigenen Projekts und ihre eigenen Sitzungsnotizen. Ein Agent in einem Projekt sieht nie die Notizen eines anderen Projekts. Alle Sitzungen eines [Projekts](/guide/projects) arbeiten in dessen Ordner und teilen deshalb die Projektnotizen. Ein Auftrag mit eigenem neuen Aufgabenordner verwendet diesen als Projekt; siehe [Agenten](/guide/agents).

Bei vielen Notizen entstehen zusätzlich **Themen**, die zusammengehörige Notizen bündeln, und für Projekte ein **Profil** als kurze Zusammenfassung, die Agenten immer zuerst erhalten. Die Bereinigung erstellt diese Einträge und kurze Titel für den Startindex; siehe [Automatisch bereinigen](/guide/memory#tidy-up-automatically). Dein persönliches Profil ist davon getrennt und wird von dir und deinen Agenten gepflegt; siehe [Dein Profil](/guide/memory#your-profile).

Memory funktioniert in Sitzungen, die diese App selbst ausführt, nicht in lediglich aufgelisteten Sitzungen aus Terminal oder VS Code.

## Wie Notizen entstehen

Agenten speichern Notizen, wenn du sie darum bittest, etwa „Merk dir, dass ich vegetarisch esse“ oder „Merk dir, dass der Testserver test.example.com heißt“. Außerdem können sie dauerhafte Erkenntnisse speichern, die spätere Sitzungen nicht selbst aus den Projektdateien ableiten könnten: Wünsche, Entscheidungen mit Begründung, Stolperfallen oder aus Erfahrung entstandene Regeln. Nach einer Antwort wird nicht pauschal etwas gespeichert. Notizen entstehen durch gezieltes Speichern der Agenten, deine eigenen Eingaben und die Bereinigung vorhandener Notizen. Bei aktiviertem [Aus Unterhaltungen lernen](/guide/memory#learn-from-conversations) ergänzt diese höchstens drei täglich übersehene Erkenntnisse.

- **Der Agent wählt den Bereich**: persönlich, Projekt oder Sitzung.
- **Ein Fakt pro auffindbarer Notiz**: Jede Notiz beschreibt einen Sachverhalt als eigenständig verständlichen Satz und nennt das Thema, etwa Projekt, Werkzeug, Person oder Ort. So lässt sie sich auch mit anders formulierten Fragen finden. Was jeder Agent immer über dich wissen soll, gehört ins Profil. Inhalte, die bereits aus Projektdateien oder Git-Verlauf hervorgehen, sollen nicht erneut gespeichert werden: Code und Ablageorte ändern sich, und die Dateien bleiben die bessere Quelle.
- **Herkunft der Information**: Der Agent kennzeichnet, ob du etwas gesagt hast, er es anhand eines Tests, einer Befehlsausgabe oder Datei geprüft hat oder es sich um eine noch ungeprüfte Schlussfolgerung handelt. Spätere Agenten erkennen ungeprüfte Notizen; die Bereinigung prüft sie zuerst. Eigene Notizen gelten als von dir mitgeteilt.
- **Befristete Notizen**: Reisen, Fristen und Besuche können ein Enddatum erhalten. Danach werden sie Agenten nicht mehr gegeben und innerhalb einer Stunde nach Gelöschte Notizen verschoben, wo du sie 30 Tage lang wiederherstellen kannst.
- **Korrekturen ersetzen den alten Eintrag**: Der Agent ändert die bestehende Notiz anhand ihrer Nummer, statt eine zweite anzulegen. Identischer Text wird nicht doppelt gespeichert. Mit [semantischer Suche](/guide/memory#search-by-meaning) gilt das auch für sinngleiche Formulierungen.
- **Auch Vergessen ist möglich**: Ein Agent entfernt falsche, veraltete oder auf deinen Wunsch zu löschende Notizen, etwa „Vergiss meine alte Adresse“.
- **Keine Geheimnisse**: Texte mit erkennbaren Passwörtern, Keys, Tokens oder Kartennummern werden abgelehnt. Das gilt auch für an Agenten gerichtete Steueranweisungen wie „Ignoriere die bisherigen Anweisungen…“, da diese sonst spätere Sitzungen beeinflussen könnten.

Über **Notiz hinzufügen** unter [Einstellungen → Memory](/settings?s=memory&find=Add%20a%20note) kannst du selbst Notizen schreiben. Dort findest, bearbeitest, befristest und löschst du alle Einträge; siehe [Notizen](/guide/memory#notes).

## Dein Profil

Neben Notizen führt Memory ein persönliches Profil: wer du bist, was du tust und verwendest, welche Antworten du bevorzugst und was vermieden werden soll. Bei aktiviertem Memory erhält jeder Agent es einmal zu Sitzungsbeginn direkt nach deinen [Agentenrichtlinien](/guide/guidelines). Es prägt seine Arbeitsweise, bleibt aber deinen Richtlinien und aktuellen Nachrichten untergeordnet. Notizen enthalten situativ relevantes Wissen; das Profil beschreibt, was jeder Agent grundsätzlich über dich wissen sollte.

- **Agenten halten es aktuell.** Äußerst du etwas Dauerhaftes, das allen Agenten hilft, etwa Beruf, Werkzeuge oder Antwortvorlieben, kann der Agent das Profil entsprechend überarbeiten. Die meisten Nachrichten ändern nichts. Anpassungen erscheinen unter der Antwort als **Dein Profil** mit Rückgängig-Funktion; siehe [Gespeicherte Änderungen unter einer Antwort](/guide/memory#see-what-an-agent-saved-after-a-reply). Agenten dürfen keine Geheimnisse eintragen, das Profil nicht leeren und keine Änderungen überschreiben, die seit ihrem Sitzungsstart vorgenommen wurden. Bei einem Konflikt erhalten sie den aktuellen Stand und versuchen es erneut.
- **Selbst bearbeiten.** Unter [Einstellungen → Memory](/settings?s=memory&find=Your%20profile) zeigt die erste Gruppe **Dein Profil** zunächst sechs Zeilen. Bei längeren Profilen gibt es **Alle anzeigen** und **Weniger anzeigen**. **Bearbeiten** beziehungsweise bei leerem Profil **Schreiben** neben der Überschrift öffnet den Editor. Enter fügt eine Zeile ein, Strg+Enter oder auf dem Mac ⌘+Enter beziehungsweise **Speichern** speichert. Escape oder **Abbrechen** verwirft die Eingabe. Eine Wortzählung zeigt aktuelle und zulässige Länge.
- **Maximale Länge.** [Profillänge](/settings?s=memory&find=Profile%20length) unter **Was Agenten erhalten** legt 250, 500, 1.000 als Standard oder 2.000 Wörter fest. Agenten halten sich daran. Ein von dir gespeichertes längeres Profil oder ein Profil nach nachträglicher Limitverkleinerung bleibt zunächst erhalten, während das Hilfsmodell es im Hintergrund kürzt, etwa „Wird auf 1.000 Wörter gekürzt…“. Die gekürzte Fassung erscheint als Änderung **durch das Hilfsmodell**. Scheitert dies, stehen darunter Ursache und **Erneut versuchen**.
- **Unter dem Profil** stehen Wortzahl, Limit und Zeitpunkt sowie Urheber der Erstellung oder letzten Änderung: **von dir**, **von einem Agenten** mit Herkunftssitzung oder **vom Hilfsmodell**. Das **⋯**-Profilmenü neben **Bearbeiten** bietet **Änderungsverlauf** mit allen Versionen, Urhebern und Gründen sowie **Profil leeren** mit Bestätigung. Ein geleertes Profil bleibt 30 Tage unter [Gelöschte Notizen](/guide/memory#deleted-notes) und lässt sich dort **Wiederherstellen**.

## Gespeicherte Änderungen unter einer Antwort

Speichert, ändert oder entfernt ein Agent während eines Durchlaufs Notizen, erscheint unter seiner Antwort etwa **Memory · 1 hinzugefügt, 1 aktualisiert**. Gezählt werden noch wirksame Änderungen; wurden alle zurückgenommen, steht dort **rückgängig gemacht**. Mehrere Änderungen eines Durchlaufs werden gemeinsam angezeigt. Mehrfaches Ändern derselben Notiz zählt als eine Änderung vom ursprünglichen zum abschließenden Stand.

Ein Klick öffnet die Anzeige. Jede Änderung zeigt:

- die Kennzeichnung **Hinzugefügt**, **Aktualisiert**, **Entfernt** oder **Rückgängig gemacht**;
- den Bereich **Über dich**, **Projekt ·** mit Ordnername, **Diese Sitzung**, **Andere Sitzung** oder bei Profiländerungen **Dein Profil**, dazu „vom Agenten gespeichert“ und die Zahl der Bearbeitungen in diesem Durchlauf;
- den Text mit durchgestrichenen entfernten und hervorgehobenen neuen Wörtern. Bei weitgehender Neufassung steht der alte Text durchgestrichen über dem neuen;
- **Seitdem erneut geändert**, falls nach diesem Durchlauf weitere Änderungen erfolgten, anklickbar für den aktuellen Stand;
- den vom Agenten angegebenen Grund sowie gegebenenfalls **Seitdem gelöscht** oder **Nicht mehr gespeichert**, wenn die Notiz später gelöscht oder endgültig entfernt wurde.

Jede Änderung bietet:

- **Diese Änderung rückgängig machen** beziehungsweise **Diese Änderungen rückgängig machen**: Neue Notizen werden entfernt, geänderte zurückgesetzt und entfernte wiederhergestellt.
- **Bearbeiten**: Text direkt ändern. Enter speichert, Umschalt+Enter fügt eine Zeile ein, Escape bricht ab. Bei deinem Profil öffnet sich der größere Editor unter Einstellungen → Memory.
- **Löschen**: entfernt die Notiz mit 30 Tagen Wiederherstellungsfrist. Dein Profil lässt sich hier nicht löschen, sondern nur in den Einstellungen leeren.
- **Wiederherstellen**: holt eine seitdem gelöschte Notiz zurück.

Im **⋯**-Menü der geöffneten Anzeige schaltet **Memory für diese Sitzung** Memory ein oder aus. **Alle Memory-Einträge** öffnet Einstellungen → Memory. Ein Klick auf die obere Zeile schließt die Anzeige.

## Womit ein Agent startet

Jeder Agent erhält einmal eine kurze Erklärung zu Memory, dein Profil, einen Index der gespeicherten Einträge und passende Notizen zu deinem Auftrag:

- **Zeitpunkt**: Claude Code und Codex erhalten Erklärung, Profile, vollständige Notizen kleiner Bereiche und den Index in ihren Startanweisungen; auftragsbezogene Notizen kommen mit der ersten Nachricht. Solange sich Projektnotizen nicht ändern, bleiben die Startanweisungen für dessen Sitzungen gleich. Der Modellanbieter kann seinen Cache wiederverwenden, was Zeit und Kosten spart. ACP-Agenten erhalten alles mit der ersten Nachricht. [Custom](/guide/custom) erhält die Inhalte ebenfalls mit der ersten Nachricht und behält sie während der Arbeit. Erst nach Verdichtung einer langen Unterhaltung liest es Memory erneut passend zur neuesten Nachricht. Wird eine Sitzung innerhalb einer Stunde fortgesetzt, etwa nach einem App-Neustart, erhält sie dieselben Anweisungen samt eigenen Notizen und passenden Einträgen zur letzten Nachricht, damit der Anbieter den Cache der Unterhaltung weiterverwenden kann.
- **Inhalt**: [Dein Profil](/guide/memory#your-profile), ein vorhandenes Projektprofil, bei fortgesetzten Sitzungen deren eigene Notizen und bei kleinen Bereichen ohne Themen alle persönlichen beziehungsweise projektspezifischen Notizen. Aus größeren Bereichen kommen passende Notizen und Themen zum Auftrag, standardmäßig höchstens zehn. Das änderst du über [Notizen beim Agentenstart](/settings?s=memory&find=Notes%20each%20agent%20starts%20with). Gibt es weniger passende Inhalte, wird nicht aufgefüllt. Einzelnotizen, die ein bereits übergebenes Thema zusammenfasst, werden ausgelassen.
- **Index**: Für größere Bereiche erhält der Agent die Titel von Notizen und Themen, bei Custom nur die noch nicht übergebenen, damit er bei Bedarf gezielt nachschlagen kann. Ein Thema steht für seine Einzelnotizen. Die [automatische Bereinigung](/guide/memory#tidy-up-automatically) erstellt die Titel; vorher dienen die ersten Wörter als Titel.
- **Auswahl passender Notizen**: Eine hybride Suche kombiniert eine Rangliste nach Wörtern, mit besonderem Gewicht für seltene Begriffe, und bei aktivierter semantischer Suche eine Liste nach Bedeutung. So findet „Fass dich kurz“ auch „Mag kurze Antworten“. Beide Listen werden anhand ihrer Rangfolge zusammengeführt. Häufig und kürzlich aktiv nachgeschlagene Notizen erhalten etwas mehr Gewicht. Eine Notiz gilt nur als passend, wenn sie sich für den konkreten Auftrag vom übrigen Bestand abhebt. Ihre Ähnlichkeit wird deshalb relativ zur Ähnlichkeit aller Notizen zur Anfrage bewertet. Das semantische Modell startet bereits beim Tippen. Eine Sitzung wartet jedoch nie darauf; ist es noch nicht bereit, werden Notizen nach Wörtern ausgewählt.
- **Passende Skills**: Dieselbe Suchmethode nennt eindeutig zur ersten Nachricht passende Skills. Siehe [Passende Skills für eine neue Sitzung](/guide/skills#skills-that-fit-a-new-session).
- **Umgang damit**: Notizen sind Hintergrundwissen. Der Agent weiß, dass sie veraltet sein können, welche ungeprüft sind und dass deine aktuellen Angaben Vorrang haben. Er soll sie nur erwähnen, wenn sie helfen.

Die Notizen, die ein Agent bekommen hat, weil sie zu deiner Anfrage passen, zählen als **benötigt**. Die Einstellungen zeigen, wie oft jede Notiz benötigt wurde und wann zuletzt (**Von Agenten verwendet**, in der Notiz), und listen die Notizen, die seit Monaten kein Agent benötigt hat, unter **Länger nicht verwendet** auf, damit du sie behalten oder löschen kannst (siehe [Notizen, die länger kein Agent benötigt hat](/guide/memory#notes-no-agent-needed-lately)). Welche Notizen beim nächsten Mal zuerst kommen, berücksichtigt nur, was Agenten selbst nachgeschlagen haben: Eine Notiz am Anfang übergeben zu bekommen, bringt sie nicht wieder an die erste Stelle.

Agenten erhalten außerdem Tools zum Speichern mit Bereich, Herkunft und Enddatum, zum Korrigieren und Vergessen, zum Nachschlagen nach Wörtern und Bedeutung einschließlich der Einzelnotizen eines Themas, zum Aktualisieren deines Profils und zum Durchsuchen und Lesen früherer Unterhaltungen. Siehe [Frühere Sitzungen durchsuchen](/guide/memory#search-earlier-sessions). Auch aktiv nachgeschlagene Notizen zählen als benötigt.

## Memory für eine Sitzung ausschalten

So startest du ohne Memory:

1. Öffne unter dem Nachrichtenfeld **Optionen**.
2. Wähle unter **Memory** die Option **Für diese Sitzung aus** mit „Startet ohne Vorwissen und speichert nichts daraus“. Standard ist **Ein** mit „Verwendet und ergänzt gespeichertes Wissen“.
3. Die Optionsschaltfläche nennt nun **Ohne Memory**. Die Startseite merkt sich die Auswahl für weitere Sitzungen, bis du sie wieder aktivierst.

**Was Agenten speichern** unten im Menü öffnet Einstellungen → Memory. Auf dem Smartphone öffnen sich die Menüs als Bedienfelder von unten. Ist Memory global ausgeschaltet, fehlt die Option auf der Startseite.

In laufenden Sitzungen schaltest du Memory über **⋯ → Sitzungseinstellungen → Memory** um. Der Hinweis zeigt **Ein** oder **Aus**. Denselben Schalter gibt es unter **Memory für diese Sitzung** im **⋯**-Menü der Memory-Anzeige. Bei global deaktiviertem Memory sind beide mit **Für alle aus** ausgegraut.

Ohne Memory liest und schreibt eine Sitzung keine Notizen:

- Der Agent erhält weder Notizen, Profil noch Memory-Tools. Aus der Sitzung wird nichts gespeichert.
- Andere Sitzungen finden sie nicht in früheren Unterhaltungen und können sie nicht lesen.

Auch geplante Aufgaben haben im Editor denselben Memory-Schalter; siehe [Geplante Aufgaben](/guide/tasks). Aufrufe über die öffentliche Seite einer App laufen immer ohne Memory; siehe [Apps](/guide/apps).

## Memory für alle Sitzungen ausschalten

Deaktiviere den **Memory**-Schalter oben rechts neben der Überschrift unter [Einstellungen → Memory](/settings?s=memory&find=Memory). Danach steht oben: „Memory ist aus: Agenten erhalten keine Notizen und speichern nichts Neues. Deine Notizen bleiben erhalten.“

Solange es ausgeschaltet ist:

- erhält kein Agent Notizen, Profil oder Memory-Tools und wird nichts gespeichert;
- bleiben vorhandene Notizen erhalten und nach erneuter Aktivierung wieder verfügbar;
- fehlt die Memory-Option auf der Startseite und zeigt die Suche per Strg+K keine Notizen;
- sind **Aus Unterhaltungen lernen**, **Automatisch bereinigen**, **Letzte Bereinigung** mit **Jetzt bereinigen** und **Nach Bedeutung suchen** ausgegraut;
- bleiben Profil und Notizen sichtbar und lassen sich weiterhin lesen, bearbeiten, ergänzen, löschen und exportieren.

## Einstellungen → Memory

Alles zu Memory steht unter [Einstellungen → Funktionen → Memory](/settings?s=memory): „Was Agenten über dich, deine Projekte und einzelne Sitzungen speichern und wann es geschrieben wurde“. Neben der Überschrift steht der **Memory**-Schalter. **Mehr erfahren** darunter öffnet diesen Beitrag. Es folgen sechs Gruppen sowie darüber eine Zeile mit den drei Memory-Bestandteilen:

- **Dein Profil**: Informationen für jeden Agenten, mit **Bearbeiten** und **⋯**-Menü. Siehe [Dein Profil](/guide/memory#your-profile).
- **Notizen**: alle Einträge mit **Notiz hinzufügen**, Suche und Bereichsübersicht. Siehe [Notizen](/guide/memory#notes).
- **Lernen**: **Aus Unterhaltungen lernen**, **Automatisch bereinigen** und **Letzte Bereinigung** mit **Änderungen ansehen** und **Jetzt bereinigen**.
- **Wiki-Memory**: ob Projekte ein Wiki führen, das Lernen aus neuen Dokumenten und wo Wikis gespeichert werden (siehe [Wiki-Memory](#wiki-memory)).
- **Was Agenten erhalten**: **Nach Bedeutung suchen**, **Notizen beim Agentenstart** und **Profillänge**.
- **Deine Daten**: **Importieren…** aus anderen Assistenten, **Exportieren** als Markdown oder JSON und **Alles löschen…**.

Neben dem Namen einer Zeile kann eine **(i)**-Schaltfläche stehen, die mehr darüber sagt, was die Zeile bewirkt. Auf dem Smartphone öffnen sich die Einstellungen als Liste: Tippe auf **Memory**, um es auf einer eigenen Seite zu öffnen. Dort nehmen die Notizen die ganze Breite des Bildschirms ein, und jedes Menü auf der Seite öffnet sich als Blatt vom unteren Bildschirmrand.

### Wiki-Memory

Die Gruppe **Wiki-Memory** enthält die Einstellungen für die Artikel der Projekte. [Wiki-Memory](/guide/wiki-memory) erklärt Inhalt und Arbeitsweise.

- **Wiki-Memory**: anfangs eingeschaltet für das gemeinsame Wiki und alle Projekte ohne eigene abweichende Auswahl im Tab **Einstellungen**.
- **Aus neuen Dokumenten lernen**: anfangs eingeschaltet. Das Hilfsmodell ergänzt aus neuen und geänderten Dokumenten Memory-Notizen, nur für das jeweilige Projekt, und aktualisiert das Wiki.
- **Wiki-Ordner**: Speicherort für das gemeinsame Wiki und, sofern unten nicht anders festgelegt, Projekt-Wikis. Der absolute Pfad liegt auf dem Hydor-Computer; **Durchsuchen** öffnet die Ordnerauswahl. Enthält der bisherige Ordner Dateien, prüfst du vor einem Wechsel, ob sie bleiben, zusammengeführt oder verschoben werden; siehe [Den Wiki-Ordner verschieben](/guide/wiki-memory#move-the-wiki-folder).
- **Wiki-Memory in Chats standardmäßig einschalten** und **Automatische Lessons Learned in Chats standardmäßig einschalten**: womit ein neuer Chat startet. Anfangs ist das Wiki-Memory in Chats eingeschaltet und die automatischen Lessons-Learned-Vorschläge sind ausgeschaltet; die eigenen Optionen eines Chats können davon abweichen (siehe [Ein- oder ausschalten](/guide/wiki-memory#turn-it-on-or-off)).
- **Projekt-Wikis**: **Im Wiki-Ordner**, der Standard ohne Schreibzugriffe auf deine Projektordner, oder **Im Ordner jedes Projekts**. Bei letzterem bestimmt **Ordner innerhalb jedes Projekts** den Ort; **Aus Git heraushalten** schließt ihn aus dem Repository aus.

Für Ergänzungen aus neuen Dokumenten und Sitzungs-Checkpoints muss auch Memory selbst aktiviert sein. Ist es für eine Sitzung oder insgesamt ausgeschaltet, werden keine Checkpoints gespeichert; vorhandene bleiben erhalten. Siehe [Checkpoints und Lessons Learned](/guide/wiki-memory#checkpoints-and-lessons-learned).

### Notizen

Die Gruppe **Notizen** listet alle Einträge und nennt ihre Anzahl neben der Überschrift, etwa 33 Notizen. **Notiz hinzufügen** rechts schreibt einen eigenen Eintrag; siehe [Eine Notiz hinzufügen](/guide/memory#add-a-note). Dein persönliches Profil steht separat darüber und zählt nicht mit.

Unter der Überschrift stehen Suche und Bereichsübersicht. Jeder Bereich öffnet eine eigene Seite:

- **Über dich**: die Notizen über dich, mit ihrer Anzahl.
- **Jedes Projekt**, mit dem Namen seines Ordners, der Zahl seiner Notizen und dem Pfad des Ordners, das zuletzt geänderte Projekt zuerst. Die ersten fünf werden gezeigt; **N weitere Projekte anzeigen** zeigt den Rest.
- **Sitzungen**: Notizen einzelner Sitzungen.
- **Länger nicht benötigt** bei seit vier Monaten ungenutzten Notizen. Siehe [Länger nicht benötigte Notizen](/guide/memory#notes-no-agent-needed-lately).
- **Gelöschte Notizen** mit 30 Tagen Wiederherstellungsfrist. Siehe [Gelöschte Notizen](/guide/memory#deleted-notes).

Bereichsseiten öffnen sich innerhalb der Einstellungen. **Memory** oben oder die Browser-Zurückschaltfläche führt zur Übersicht. Angezeigt werden Bereichsname, Anzahl, bei Projekten der Ordnerpfad, in persönlichen und Projektbereichen **Notiz hinzufügen** mit passender Vorauswahl, das Suchfeld „Diese Notizen durchsuchen“ und die Einträge: zuerst Projektprofil, dann Themen und anschließend Notizen nach letzter Änderung. Es erscheinen jeweils 20, mit **Mehr anzeigen** darunter. Leere Bereiche zeigen einen Hinweis. Die Adressen lauten `/settings?s=memory&notes=global`, `&notes=session`, `&notes=stale`, `&notes=deleted` oder für Projekte `&notes=repo:` mit Ordnerpfad.

**Notizen finden**: Tippe in die Gruppensuche oder Bereichssuche mit dem Hinweis „33 Notizen durchsuchen“ beziehungsweise bei bereiter semantischer Suche „33 Notizen nach Wörtern oder Bedeutung durchsuchen“. Alle eingegebenen Wörter müssen passen; das letzte darf ein Wortanfang sein. Bei aktivierter semantischer Suche kommen sinngleiche Einträge hinzu. Die besten Treffer stehen oben, jeweils mit Bereich. **Mehr anzeigen** lädt die nächsten 20. Ohne Treffer steht „Keine passenden Notizen“. Escape oder **×** leert die Suche und zeigt die Übersicht wieder. Gibt es noch keine Notizen, stehen dort ein Hinweis, **Aus anderen Assistenten importieren** und **Gelöschte Notizen**.

Jeder Eintrag zeigt die ersten zwei Zeilen, bei Zusammenfassungen mit **Thema** oder **Profil**, und darunter Metadaten: in gemischten Listen wie Suche, **Sitzungen**, **Länger nicht benötigt** und **Gelöschte Notizen** den Bereich; **Hinzugefügt** oder **Geändert** mit relativer Zeit und exaktem Datum beim Darüberfahren; gegebenenfalls **Noch ungeprüft**; **Einmal benötigt** oder **N-mal benötigt** für passende Übergaben und aktive Suchen; bei Befristung **Bis** mit Datum. Ein Klick öffnet die Notiz.

### Eine Notiz öffnen

Ein Klick öffnet den Dialog **Notiz**, **Thema** oder **Profil** mit vollständigem Text und **Bearbeiten**. Darunter stehen:

- **Wo**: **Über dich**, das Projekt (der Name und Pfad seines Ordners) oder die Sitzung, zu der sie gehört (klicke auf ihren Namen, um die Sitzung zu öffnen).
- **Geschrieben**: **Hinzugefügt** oder **Geändert**, Zeitpunkt, **von dir**, **von einem Agenten** oder **vom Hilfsmodell** bei Bereinigung sowie die anklickbare Herkunftssitzung. Beim Darüberfahren erscheinen genaue Daten.
- **Herkunft**: **Von dir mitgeteilt**, **Geprüft** oder **Noch ungeprüft**, mit Erklärung beim Darüberfahren. Ältere Notizen ohne erfasste Herkunft zeigen nichts.
- **Von Agenten benötigt**: **Einmal**, **N-mal** mit letztem Zeitpunkt oder **Noch nicht**.
- **Enddatum**: das Datum oder **Keine**, mit **Veränderung** (siehe unten).
- **Fasst zusammen** bei Themen und Profilen: Zahl der Einzelnotizen. **Anzeigen** listet sie auf, gelöschte durchgestrichen.
- **Verlauf**: **Anzeigen** listet alle Ereignisse, neueste zuerst: Hinzufügen, Ändern mit altem und neuem Text, Löschen, Wiederherstellen, Enddatum mit „Bis“ oder „Entfernt“ sowie Herkunft. Dazu stehen Zeitpunkt, Urheber, Sitzung und Grund. **Ausblenden** schließt den Verlauf.

Die Schaltflächen:

- **Bearbeiten**: bis zu 500 Zeichen, bei Themen oder Profilen 800. Enter speichert, Umschalt+Enter fügt eine Zeile ein, Escape oder **Abbrechen** verwirft. Texte mit erkennbaren Geheimnissen lassen sich nicht speichern.
- **Enddatum** → **Veränderung**: Wähle unter „Gültig bis“ ein Datum und drücke auf **Speichern**. Die Notiz hört am Ende dieses Tages auf, wahr zu sein: ab morgen bis zu fünf Jahre im Voraus. **Kein Enddatum** nimmt ein Enddatum weg.
- **Löschen** unten links entfernt die Notiz und schließt den Dialog mit „Gelöscht. Die Notiz bleibt 30 Tage unter Gelöschte Notizen.“
- **Behalten**, wenn du die Notiz aus **Länger nicht benötigt** geöffnet hast; siehe unten.
- **Schließen** oder Escape verlässt den Dialog.

Gelöschte Notizen bieten stattdessen **Wiederherstellen** und **Endgültig löschen**. Sie lassen sich nicht bearbeiten und haben kein Enddatum. Siehe [Gelöschte Notizen](/guide/memory#deleted-notes).

### Eine Notiz hinzufügen

[Notiz hinzufügen](/settings?s=memory&find=Add%20a%20note) neben **Notizen** oder auf einer persönlichen beziehungsweise Projektseite öffnet einen Dialog: „Was sollen Agenten sich merken? Zum Beispiel: Ich bevorzuge kurze Antworten.“ Schreibe die Notiz und wähle **Speichern** oder Enter. Umschalt+Enter fügt eine Zeile ein, Escape oder **Abbrechen** verwirft.

- **Bereich**: Standardmäßig gehört die Notiz zu dir. Über **Über dich** vor den Schaltflächen wählst du ein Projekt, für das bereits Notizen existieren. Projektnotizen erreichen nur Sitzungen dieses Projekts. Gibt es keine Projektnotizen, fehlt die Auswahl. Von einer Projektseite geöffnet, ist dieses Projekt vorausgewählt.
- Es gelten dieselben Regeln wie für Agentennotizen: höchstens 500 Zeichen in einem Absatz, keine erkennbaren Passwörter, Keys, Tokens oder Kartennummern.
- Die Notiz trägt **von dir**. Sitzungen erhalten sie wie andere Notizen beim Start, Custom vor dem nächsten Durchlauf.

### Länger nicht benötigte Notizen

Wurden Notizen vier Monate nicht benötigt, erscheint **Länger nicht benötigt** in der Übersicht mit Anzahl, etwa „3 Notizen seit vier Monaten nicht benötigt“. Die Seite erklärt: „Kein Agent hat diese Notizen seit vier Monaten benötigt. Behalte Wichtiges und lösche den Rest.“ Sie hat kein Suchfeld.

Vorgeschlagen werden nur Notizen über dich und über Projekte, nie Themen, Profile, Notizen mit einem Enddatum oder Notizen von Sitzungen. Jede Zeile hat zwei Schaltflächen: **Behalten**, das die Notiz als heute benötigt zählt, sodass sie die Liste verlässt, und **Löschen**, das sie entfernt. Öffne eine Notiz, um sie zuerst ganz zu lesen, mit ihrer Zeile **Von Agenten verwendet** und ihrem Verlauf: Dort tun **Beibehalten** und **Löschen** dasselbe. Sind keine mehr übrig, steht dort „Jede Notiz wurde kürzlich benötigt“, und die Zeile verlässt den Index.

### Gelöschte Notizen

[Gelöschte Notizen](/settings?s=memory&find=Deleted%20notes) am Ende der Übersicht zeigt Einträge, die du, ein Agent, die Bereinigung oder ein abgelaufenes Enddatum entfernt haben. Sie bleiben 30 Tage erhalten und werden danach endgültig gelöscht. Sitzungsnotizen werden kurz nach dem Löschen ihrer Sitzung endgültig entfernt. Das Suchfeld sucht nach Wörtern; **Memory** oben führt zurück.

- **Wiederherstellen** in der Zeile oder im Dialog holt eine Notiz zurück. Ein bereits abgelaufenes Enddatum wird dabei entfernt. Ein geleertes Profil erscheint als **Dein Profil** und ersetzt beim Wiederherstellen ein eventuell zwischenzeitlich neu geschriebenes Profil.
- **Endgültig löschen** im geöffneten Eintrag fragt „Diese Notiz endgültig löschen?“ mit dem Hinweis, dass auch ihr Verlauf unwiederbringlich entfernt wird. Nach Bestätigung wird sie sofort gelöscht. Ihr **Verlauf** erklärt zuvor die bisherigen Ereignisse.

### Automatisch bereinigen

[Automatisch bereinigen](/settings?s=memory&find=Tidy%20up%20automatically) unter **Lernen** hält Memory kurz und aktuell. Die Funktion ist standardmäßig aktiviert und führt einmal täglich sinngleiche Notizen zusammen und bündelt verwandte Inhalte. Das Hilfsmodell erledigt dies: ein kleines Modell für Hintergrundaufgaben, wählbar unter [Einstellungen → Modelle → Hilfsmodell](/settings?s=models&find=Helper%20model). Siehe [Agenten, Konten und Modelle](/guide/agents-models). Es liest nur Notizen, außer [Aus Unterhaltungen lernen](/guide/memory#learn-from-conversations) ist aktiv. Dann liest es zuerst die Unterhaltungen seit der letzten Bereinigung. Sitzungsnotizen bleiben unberührt, da sie wenige sind und mit der Sitzung gelöscht werden.

Jede Bereinigung umfasst:

1. **Dubletten, falsche Angaben und Enddaten.** Seit der letzten Bereinigung hinzugefügte oder geänderte Notizen werden mit ähnlichen Einträgen desselben Bereichs verglichen, semantisch bei aktivierter Funktion, sonst nach Wörtern. Sinngleiche oder aktualisierende Notizen werden so zusammengeführt, dass alle noch gültigen Fakten erhalten bleiben. Bei Widersprüchen gewinnt die neuere Angabe; das Ergebnis muss kürzer als die Ausgangsnotizen sein. Durch neue Informationen widerlegte Notizen werden gelöscht. Eine ausdrücklich zeitlich begrenzte Angabe wie „bis Freitag“ oder „die Reise im März“ erhält ein Enddatum. Pro Bereinigung werden höchstens 200 Notizen geprüft, der Rest wartet auf die nächste.
2. **Themen und Projektprofil.** Überschreitet ein Bereich etwa 2.400 Zeichen, werden zusammengehörige Notizen in Themen mit jeweils bis zu zwölf Einzelnotizen gebündelt. Agenten erhalten dann das Thema und können die zugrunde liegenden Notizen weiterhin nachschlagen. Projekte bekommen zusätzlich ein höchstens 700 Zeichen langes Profil, das Agenten immer zuerst erhalten: Zweck, Build-, Test- und Startbefehle sowie Stolperfallen. Ändern sich die Grundlagen, werden Thema oder Projektprofil neu geschrieben. Dein persönliches Profil bleibt dir und deinen Agenten vorbehalten; siehe [Dein Profil](/guide/memory#your-profile).
3. **Titel.** Persönliche und Projektnotizen sowie Themen bekommen kurze Titel für den Startindex. Neue Notizen erhalten sie innerhalb einer Stunde; bei Textänderungen wird der Titel erneuert.

Die Bereinigung läuft etwa täglich, sobald die App aktiv ist, auch auf nachts schlafenden Computern. Voraussetzungen sind mindestens 20 Stunden seit der letzten Bereinigung, neue Inhalte wie eine Nachricht oder geänderte Notiz und zehn Minuten Eingabepause. Während du tippst, startet sie nicht. Ohne neue Inhalte entfällt sie. Jede Änderung wird im Notizverlauf dem Hilfsmodell zugeschrieben. Die Änderungen der letzten wirksamen Bereinigung lassen sich zurücknehmen; siehe [Jetzt bereinigen und Änderungen zurücknehmen](/guide/memory#tidy-up-now-and-undo-its-changes).

### Aus Unterhaltungen lernen

[Aus Unterhaltungen lernen](/settings?s=memory&find=Learn%20from%20conversations), die erste Einstellung unter **Lernen**, ist standardmäßig aktiv. Einmal täglich korrigiert sie durch Unterhaltungen widerlegte Notizen und ergänzt von Agenten übersehene Erkenntnisse. **(i)** erklärt, dass das Hilfsmodell während der Bereinigung Unterhaltungen seit dem letzten Lauf liest, ausgenommen Sitzungen ohne Memory, damit Korrekturen vornimmt, ungeprüfte Notizen überprüft und täglich nur wenige neue Inhalte speichert. Das ist der erste Schritt jeder automatischen oder über **Jetzt bereinigen** gestarteten Bereinigung.

Agenten speichern während der Arbeit, bevor der weitere Verlauf bekannt ist. Dadurch können Notizen schon anfangs falsch sein oder später veralten, während manche dauerhaften Erkenntnisse fehlen. Das Hilfsmodell liest projektweise deine Nachrichten und die letzte Antwort jedes Durchlaufs, niemals Anhänge, eingefügte Fremdtexte, Zwischenschritte, Tool-Ausgaben oder Webseiten. Dazu erhält es passende Notizen und:

- **korrigiert** durch die Unterhaltung widerlegte oder veraltete Einträge beziehungsweise entfernt sie, wenn nichts Gültiges übrig bleibt;
- **bestätigt** ungeprüfte Notizen, deren Richtigkeit die Unterhaltung zeigt; dafür liest es auch die Unterhaltung, in der die Notiz entstand;
- **speichert** Informationen für spätere Sitzungen, die nicht aus den Projektdateien hervorgehen: Wünsche, Korrekturen, Entscheidungen mit Begründung oder Stolperfallen. Höchstens drei pro Tag halten Memory klein. Die anschließende Bereinigung führt sie wie andere neue Einträge mit ähnlichen Notizen zusammen.

Verweist eine Projektnotiz auf eine nicht mehr vorhandene Datei, erhält das Hilfsmodell einen Hinweis, um sie korrigieren zu können.

Nicht gelesen werden Sitzungen ohne Memory, einschließlich vertraulicher Sitzungen, Hydor-Subagenten mit vom Agenten formulierten Aufträgen und geplante Ausführungen. Beim ersten Lauf werden die letzten drei Tage berücksichtigt. Jede Änderung erscheint mit Herkunftsgespräch in der Bereinigungsliste und lässt sich dort zurücknehmen; siehe [Jetzt bereinigen und Änderungen zurücknehmen](/guide/memory#tidy-up-now-and-undo-its-changes). Nach dem Ausschalten liest die Bereinigung nur noch Notizen.

### Jetzt bereinigen und Änderungen zurücknehmen

Die Zeile **Letztes Aufräumen** unter **Automatisch aufräumen** meldet das letzte Aufräumen in ihrem Hinweis:

- „Noch nicht bereinigt“;
- „Wird bereinigt…“ während der Verarbeitung;
- etwa „Vor 3 Std.: 2 hinzugefügt, 1 aktualisiert, 3 entfernt“ oder „Vor 3 Std.: keine Änderungen nötig, 14 Notizen geprüft“;
- „12 Unterhaltungen gelesen“, wenn [Aus Unterhaltungen lernen](/guide/memory#learn-from-conversations) Unterhaltungen verarbeitet hat. Bei einem Fehler steht darunter „Lernen aus Unterhaltungen angehalten:“ mit Grund; die übrige Bereinigung läuft trotzdem;
- bei einem ergebnislosen letzten Lauf und zuvor erfolgten Änderungen etwa „Vor 3 Std.: keine Änderungen nötig. Davor, vor 2 Tagen:“ mit der früheren Änderungsliste. Sie bleibt rückgängig machbar, bis ein weiterer Lauf etwas ändert;
- bei Fehlern den Grund nach der Zeit, etwa ein nicht antwortendes Hilfsmodell.

**Änderungen** rechts in der Zeile (sichtbar, wenn das letzte Aufräumen etwas geändert hat) öffnet „Was das letzte Aufräumen geändert hat“. Jede Änderung zeigt ein Abzeichen (Hinzugefügt, Aktualisiert, Entfernt, Endet, Kein Enddatum, Geprüft oder Rückgängig gemacht), **Thema** oder **Profil**, wenn es eines ist, den Ort und den Grund („Mit #12 zusammengeführt“, „Fasst 5 verwandte Notizen zusammen“, „Aus ‚Upload-Seite‘ gelernt“) und den Text, den alten durchgestrichen über dem neuen. Die Sprechblasen-Schaltfläche (**Öffne die Unterhaltung**) öffnet die Unterhaltung, aus der eine Änderung gelernt wurde. Die Pfeil-Schaltfläche (**Diese Änderung rückgängig machen**) macht eine rückgängig: Was sie hinzugefügt hat, verschwindet, was sie geändert hat, bekommt seinen alten Text zurück, was sie gelöscht hat, kommt zurück, ein von ihr gesetztes Enddatum wird entfernt, und eine Notiz, die sie geprüft hat, gilt wieder als ungeprüft. Schließe den Dialog, wenn du fertig bist.

[Jetzt aufräumen](/settings?s=memory&find=Tidy%20up%20now), die Schaltfläche in derselben Zeile, startet sofort ein Aufräumen, ob **Automatisch aufräumen** an ist oder nicht: „Wird aufgeräumt: Das dauert ein bis zwei Minuten“. Dafür muss Memory eingeschaltet sein.

### Nach Bedeutung suchen

[Nach Bedeutung suchen](/settings?s=memory&find=Search%20by%20meaning) unter **Was Agenten erhalten** findet Notizen, Bibliotheksinhalte und weitere Einträge sowohl nach Wörtern als auch nach Bedeutung. Dafür läuft LightOns Modell mDenseOn mit Unterstützung für neun Sprachen auf diesem Computer. Die Funktion ist standardmäßig aktiviert. Die hybride Suche führt Wort- und Bedeutungsranglisten zusammen. Deine Notizen werden dafür nicht an einen externen Dienst gesendet. Ohne diese Funktion zählt nur der Wortlaut. Bei aktivierter Funktion:

- starten Agenten auch mit passenden Notizen, die anders formuliert sind als dein Auftrag;
- Agenten, die Notizen nachschlagen, und das Suchfeld der Gruppe **Notizen** finden sie nach Bedeutung ebenso wie nach Wörtern.
- Eine Notiz, die dasselbe sagt wie eine schon gespeicherte, nur mit anderen Worten, wird nicht noch einmal gespeichert, und das Aufräumen gruppiert Notizen nach Bedeutung.
- findet die Bibliothek Seiten, Dokumente, Bilder und weitere Inhalte anhand der Bedeutung von Titel und Beschreibung. Siehe [Deine Seiten finden](/guide/library#find-your-pages);
- findet die Suche per Strg+K Seiten, Einstellungen, Sitzungen, Apps und weitere Inhalte sinngemäß. Auch Wissensdatenbanken werden semantisch durchsucht. Siehe [Projekte und Wissen](/guide/projects).

**Einmalige Einrichtung**:

1. Eine Minute nach dem ersten App-Start wird im Datenordner eine eigene Python-Umgebung mit ONNX Runtime, Hugging-Face-Tokenizer und NumPy eingerichtet, insgesamt etwa 150 MB. Bei deaktivierter Funktion geschieht das erst nach erneuter Aktivierung von **Nach Bedeutung suchen**, sofern Memory eingeschaltet ist. Statusmeldungen nennen Schritte wie „Eigene Python-Umgebung erstellen“ und „ONNX Runtime und Tokenizer installieren“. Eine ältere PyTorch-Umgebung wird vorher entfernt, um deren Speicherplatz freizugeben, mit dem Hinweis „Umgebung einer älteren Version entfernen“.
2. Danach wird einmalig das Modell heruntergeladen, etwa „Modell wird heruntergeladen: 120 von 340 MB“. Verwendet wird die 8-Bit-Version von mDenseOn, algoprog/mDenseOn-ONNX auf Hugging Face. Sie ist ein Viertel so groß wie das vollständige Modell und findet dieselben Notizen. Jede Datei wird vor Verwendung geprüft; unterbrochene Downloads werden beim nächsten Versuch fortgesetzt.
3. Im Hintergrund werden Vektoren für alle Notizen und Bibliotheksinhalte erstellt. Das sind die Zahlen, die die semantische Suche vergleicht. Die Anzeige meldet etwa „Alle 120 Notizen semantisch durchsuchbar“ oder „80 von 120 Notizen semantisch durchsuchbar, Rest folgt“.

**Ausschalten** über den Schalter stoppt das Modell. Inhalte werden dann nur nach Wörtern gefunden. Bei knappem Speicherplatz oder Arbeitsspeicher kannst du darauf verzichten. Ist Memory global ausgeschaltet, ist der Schalter ausgegraut.

**Voraussetzungen**:

- Python ab 3.10 auf diesem Computer oder uv, das eine eigene Version beschafft. Fehlt beides, stoppt die Einrichtung mit Installationshinweisen: Unter Debian oder Ubuntu `sudo apt install python3 python3-venv`, auf dem Mac über python.org oder Homebrew mit `brew install python`. Apples eigenes Python zählt nur mit installierten Entwicklerwerkzeugen; die App fordert deren Installation nicht an.
- Etwa 150 MB für die Umgebung und 340 MB für das Modell. Bei weniger als etwa 1 GB freiem Speicherplatz stoppt die Einrichtung mit „Nicht genügend Speicherplatz“.
- Einmaliger Internetzugang für die Downloads.
- Etwa 1,5 GB freier Arbeitsspeicher zum Modellstart. Bis dahin steht „Wartet auf Arbeitsspeicher“, und Notizen werden nach Wörtern gesucht.

**Ausführung**: auf wenigen CPU-Kernen über ONNX Runtime. Das Modell startet nur bei Bedarf, belegt laufend etwa 0,6 bis 1 GB Arbeitsspeicher und stoppt nach wenigen ungenutzten Minuten. Die Anzeige erklärt dieses Verhalten und zeigt während der Laufzeit „Geladen“. Der Start dauert ein bis zwei Sekunden. Er beginnt beim Tippen auf der Startseite oder in einer Sitzung mit gestopptem Agenten sowie kurz vor geplanten Aufgaben, damit auch deren Notizen und Skills semantisch gefunden werden. Sitzungen warten nie auf den Modellstart; ist es noch nicht bereit, gilt die Wortsuche. Die Grafikkarte wird nicht verwendet; ein Computer mit 8 GB Arbeitsspeicher genügt.

Bei Problemen wird die Statuszeile zur Warnung mit Ursache, etwa „Das Laden des Modells hat zu lange gedauert“, und **Erneut versuchen**. Ausschalten stoppt das Modell, lässt die eingerichtete Umgebung aber bestehen, sodass erneutes Einschalten schnell geht.

### Notizen beim Agentenstart

[Notizen beim Agentenstart](/settings?s=memory&find=Notes%20each%20agent%20starts%20with) unter **Was Agenten erhalten** begrenzt passende persönliche und Projektnotizen beziehungsweise Themen zusätzlich zu deinem Profil auf **5**, **10** als Standard, **20** oder **40**. Der Hinweis nennt „Zusätzlich zu deinem Profil: passend zu deinem Auftrag“. **(i)** erklärt die Auswahl nach Wörtern und gegebenenfalls Bedeutung sowie die Übergabe der übrigen Titel zum gezielten Nachschlagen. Kleine Bereiche mit nur wenigen Notizen werden vollständig übergeben. Ein höherer Wert stellt von Anfang an mehr passende Informationen bereit, erhöht aber die in jeder Sitzung zu lesende Menge. Ein niedrigerer hält die Startinformationen kurz. Sitzungseigene Notizen kommen zusätzlich hinzu. Siehe [Womit ein Agent startet](/guide/memory#what-an-agent-starts-with).

Darunter legt [Profillänge](/settings?s=memory&find=Profile%20length) die maximale Wortzahl deines Profils fest; siehe [Dein Profil](/guide/memory#your-profile).

### Notizen exportieren

[Exportieren](/settings?s=memory&find=Export) unter **Deine Daten** lädt alle gespeicherten Notizen herunter. **Markdown** erzeugt eine lesbare, nach Bereichen gegliederte Liste mit Erstellungs-, Änderungs- und Enddatum. **JSON** enthält zusätzlich Verläufe und bei Themen beziehungsweise Profilen die zusammengefassten Einzelnotizen. Gelöschte Notizen sind nicht enthalten.

### Aus anderen Assistenten importieren

[Importieren…](/settings?s=memory&find=Bring%20in%E2%80%A6), die erste Einstellung unter **Deine Daten**, übernimmt Wissen anderer Agenten auf diesem Computer als auswählbare Notizen. Der Hinweis nennt Claude Code, Codex, ChatGPT und andere sowie deine Skills. Bei leerem Memory gibt es auch **Aus anderen Assistenten importieren** unter **Notizen**. Ohne deine Auswahl wird nichts hinzugefügt.

1. Wähle unter **Auf diesem Computer**, was gelesen werden soll. Hydor erkennt die Ablagen und zeigt die Zahl der Memory-Dateien:
   - **Claude Code**: projektspezifisches Memory und deine CLAUDE.md für jedes Projekt, auch für zusätzlich hinterlegte Hydor-Konten.
   - **Codex**: seine Memory-Einträge und deine AGENTS.md.
   - **Andere Agenten**: Manche anderen Agenten führen Memory-Dateien über dich (was sie über dich und deine Arbeit wissen), und manche führen die Anweisungen, die du ihnen für jeden Ordner gegeben hast. Hydor liest diese, um zu erfahren, wie du gern arbeitest. Es liest nie ihre Anmeldungen, Keys oder Einstellungen. Führt ein Agent sein Memory in einem Speicher, der gerade in Benutzung ist, liest Hydor eine Kopie, sodass dieser Agent währenddessen weiterlaufen kann.
2. Unter **Aus einem Export** nimmt **Export hinzufügen** die von ChatGPT oder Claude bereitgestellte ZIP-Datei oder ihre conversations.json an. Du erhältst sie bei ChatGPT unter Einstellungen → Datenkontrollen → Daten exportieren, bei Claude unter Einstellungen → Datenschutz → Daten exportieren. Die Anzeige nennt enthaltenes Claude-Memory beziehungsweise benutzerdefinierte ChatGPT-Anweisungen sowie Zahl und Zeitraum der Chats. Aus Chats werden nur deine Nachrichten gelesen, neueste zuerst, nicht die Antworten oder Anhänge.
3. Klicke auf **Einlesen starten**. Das [Hilfsmodell](/settings?s=models&find=Helper%20model) verarbeitet abschnittsweise die Quelle zusammen mit vorhandenen Notizen und behält nur dauerhafte Informationen. Bereits gespeicherte Inhalte, auch sinngleich formulierte, Geheimnisse und Agenten-Steueranweisungen werden ausgelassen. Große Bestände brauchen einige Minuten. Du kannst den Dialog schließen; **Stoppen** bricht ab.
4. Wähle unerwünschte Vorschläge ab. Zuerst erscheinen persönliche Notizen unter **Über dich**, danach Projekte nach Ordner, sofern die Quelle zu einem lokal vorhandenen Projekt gehört. **Deinem Profil hinzufügen** zeigt vorgeschlagene Ergänzungen zu [deinem Profil](/guide/memory#your-profile). **N Notizen hinzufügen** übernimmt die Auswahl, **Verwerfen** verwirft alle Vorschläge.

Skills werden ohne Hilfsmodell übernommen. Unter **Dort erstellte Skills** stehen erkannte eigene Skills anderer lokaler Agenten aus allen Profilen und Arbeitsbereichen, einschließlich geteilter und erlernter Skills, mit Name, Zweck, Herkunft und Dateizahl. Sie verwenden dasselbe Format: einen Ordner mit SKILL.md. Die Liste ist eine Vorschau. Wähle Unerwünschtes ab und klicke auf **N Skills kopieren**, um Ordner und Dateien in deine eigenen Skills zu übernehmen. Siehe [Herkunft von Skills](/guide/skills#where-skills-come-from). Unter **N nicht angeboten** stehen ausgelassene Skills mit Grund: Mitgelieferte Skills gehören dem anderen Agenten; vorhandene Namen integrierter, eigener oder Plugin-Skills werden nie überschrieben; Skills ohne Beschreibung, mit mehr als 20.000 Zeichen oder mit enthaltenem Key werden ausgelassen. Dateien mit Anmeldedaten oder Keys werden nie kopiert, etwa .env-Dateien, private Keys, Dateien namens credentials, secrets oder tokens und Dateien mit erkannten Keys. Pro Skill gelten höchstens 200 Dateien, 512 KB je Datei und 2 MB insgesamt. **N Dateien ausgelassen** erklärt die Ausschlüsse. MCP-Server werden nicht importiert: Füge sie unter [Einstellungen → MCP-Server](/settings?s=mcp) hinzu und hinterlege benötigte Keys im Tresor.

Importierte Notizen nennen ihre Herkunft im Verlauf, etwa „Aus Claude Code importiert“. Die anderen Assistenten bleiben unverändert. Eine hochgeladene Exportdatei wird nach Übernahme ihrer Notizen gelöscht. Bei Hilfsmodell **Automatisch** liest Claude Haiku über dein Claude-Code-Abo die Inhalte.

### Alles löschen…

[Alles löschen…](/settings?s=memory&find=Clear%20all%E2%80%A6), die letzte Zeile der Gruppe **Deine Daten** (**Gesamtes Memory löschen**), löscht jede Notiz und ihren Verlauf und mit ihnen dein Profil. Es fragt zuerst: „Gesamtes Memory löschen? Jede Notiz über dich, deine Projekte und deine Sitzungen geht mit ihrem Verlauf. Das lässt sich nicht rückgängig machen; exportiere zuerst, um eine Kopie zu behalten.“ Klicke auf **Alles löschen**, um fortzufahren. Die Schaltfläche ist ausgegraut, wenn es keine Notizen gibt (ohne dein Profil gezählt).

## Frühere Sitzungen durchsuchen

Agenten können neben Notizen auch frühere Unterhaltungen mit beliebigen Agenten durchsuchen. Bei „Was haben wir letzten Monat zum Veranstaltungsort entschieden?“ sucht der Agent in deinen Nachrichten und Antworten nach allen Suchwörtern. Mit [semantischer Suche](/guide/memory#search-by-meaning) durchsucht er zusätzlich deine damaligen Aufträge sinngemäß, damit andere Formulierungen ebenfalls treffen. Bei Bedarf sucht er auch nach ausgeführten Befehlen und geänderten Dateien. Deine eigenen Nachrichten erhalten im Hintergrund schrittweise Vektoren, neueste zuerst; Anhänge und eingefügte Fremdtexte bleiben außen vor. Anschließend liest der Agent die passende Sitzung mit Nachrichten und Schritttiteln in zeitlicher Reihenfolge.

Sitzungen ohne Memory sind von der Suche ausgeschlossen und lassen sich aus anderen Sitzungen nicht lesen. Diese Tools stehen nur bei aktiviertem Memory in der aktuellen Sitzung zur Verfügung.

Du kannst selbst mit Strg+K beziehungsweise ⌘K frühere Sitzungen nach Titeln und Nachrichtentext sowie unter **Memory** Notizen finden. Ein Notiztreffer öffnet Einstellungen → Memory direkt bei der Notiz.

## Einen Agenten fragen

- „Was weißt du über mich? Lösche alles über meinen alten Arbeitsplatz.“
- „Ergänze mein Profil: Ich arbeite in der Krankenpflege und bevorzuge Antworten in Stichpunkten.“
- „Zeig mir mein Profil und kürze es auf etwa 300 Wörter.“
- „Starte jede Sitzung mit 20 statt 10 Notizen.“
- „Lass die semantische Suche auf der CPU laufen, damit die Grafikkarte frei bleibt.“
- „Bereinige Memory jetzt und erkläre anschließend, was zusammengeführt wurde.“
- „Welche Notizen hat seit Monaten kein Agent benötigt? Lösche die zur alten Website.“
- „Die Notiz zur Lissabon-Reise gilt nur bis 12. Mai. Setze dieses Enddatum.“
- „Welche Notizen zu diesem Projekt sind noch ungeprüft? Gleiche sie mit dem Code ab.“
- „Deaktiviere das Lernen aus Unterhaltungen, aber behalte die Bereinigung bei.“
- „Schalte Memory für die Sitzung Steuererklärung aus.“
- „Importiere, was Claude Code und Codex über mich wissen, und zeige mir die Vorschläge vor dem Hinzufügen.“
- „Ich habe vorher einen anderen Agenten verwendet. Übernimm sein Wissen über mich und meine eigenen Skills und zeige mir zuerst die Liste.“
- „Schalte Wiki-Memory nur für das Projekt Taxes 2026 aus und lasse es für die übrigen Projekte eingeschaltet.“
