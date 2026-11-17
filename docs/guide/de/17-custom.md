# Custom, der eigene Agent der App

Custom ist Hydors eigener Agent. Er verwendet Modelle von OpenRouter, Ollama, vLLM oder anderen OpenAI-kompatiblen Servern mit denselben Tools, Skills und Verbindungen wie Claude Code und Codex. Hier erfährst du, was Custom kann, wie Berechtigungen und Befehlsprüfungen funktionieren und wie Auto-Modus, Sandbox, Ziele, lange Gespräche, schwächere Modelle und Einstellungen zusammenspielen.

![Einstellungen → Modelle: Hilfsmodell und Modelle auf diesem Computer](images/custom.webp)

## Was Custom ist und wann du ihn verwendest

Claude Code verwendet ausschließlich Anthropic-Modelle, Codex ausschließlich OpenAI-Modelle. Custom nutzt dagegen jedes unter [Einstellungen → Agenten → Modelle](/settings?s=models) eingerichtete Modell: offene Modelle auf deinem Computer, günstige oder kostenlose Modelle über OpenRouter oder deinen eigenen Server. Zum Hinzufügen siehe [Agenten, Konten und Modelle](/guide/agents-models).

Custom passt, wenn du:

- ein lokal bleibendes Modell über Ollama oder vLLM möchtest oder eine vollständig lokale Sitzung brauchst. Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) verwendet immer Custom;
- ein bestimmtes Modell wie DeepSeek, Qwen, GLM oder Kimi nutzen möchtest;
- Kosten senken oder nach Ausschöpfung deines Claude- oder ChatGPT-Abos weiterarbeiten willst.

Custom unterstützt Recherche, Schreiben, Dokumente und Alltagsaufgaben. In Codeprojekten, erkennbar etwa an `package.json`, `Cargo.toml` oder einem Git-Repository, arbeitet er wie ein sorgfältiger Entwickler: erst lesen, dann ändern, Projektvorgaben beachten und vor der Fertigmeldung die Tests und Prüfungen des Projekts ausführen.

Wie andere Agenten liest Custom `AGENTS.md` oder `CLAUDE.md` des Projekts und beachtet deine [Agentenrichtlinien](/guide/guidelines).

## Eine Custom-Sitzung starten

1. Klicke auf der Startseite auf **Agent** und wähle **Custom** mit dem Hinweis „Beliebiges Modell: OpenRouter, Ollama, vLLM“.
2. Wähle unter **Modell** eines deiner Modelle. Ist die Liste leer, ergänze zuerst eines über **Agent → Modelle für Custom**.
3. Wähle unter **Optionen → Berechtigungen** den gewünschten Modus; siehe [Was Custom ohne Rückfrage tun darf](#choose-what-custom-may-do-without-asking). Eine Einstellung für den Denkaufwand gibt es bei Custom nicht.
4. Schreibe die Aufgabe und drücke Enter.

Ein lokales vLLM-Modell startet bei der ersten Verwendung. Die Sitzung meldet etwa „… wird mit vLLM gestartet; beim ersten Mal dauert das ein bis zwei Minuten“.

Custom bearbeitet jeweils eine Nachricht. Während der Arbeit gesendete Nachrichten warten in der Warteschlange über dem Eingabefeld bis zum Ende des Durchlaufs.

Du kannst das Modell im Menü unter dem Nachrichtenfeld wechseln. Das neue Modell gilt ab dem nächsten Schritt, auch innerhalb eines laufenden Durchlaufs.

## Was Custom kann

- **Dateien**: Texte mit Zeilennummern oder abschnittsweise lesen, Ordnerinhalte anzeigen, Dateien erstellen, neu schreiben und bearbeiten sowie Namen und Inhalte durchsuchen. Vor dem vollständigen Überschreiben einer in der Sitzung noch nicht gelesenen Datei wird Custom zum Lesen aufgefordert.
- **Dokumente**: PDF, Word, Excel, PowerPoint, OpenDocument, RTF und EPUB als Text lesen.
- **Bilder**: Anhänge, geöffnete Bilddateien und Bilder aus Webseiten oder Tools verarbeiten. Bildfähige Modelle erhalten das Bild direkt; sonst beschreibt es das Hilfsmodell. Siehe [Bilder für Modelle ohne Bildverarbeitung](#images-for-models-that-dont-see).
- **Befehle**: Shell-Befehle im Sitzungsordner standardmäßig bis zu zwei, maximal zehn Minuten ausführen. Server, Watcher und andere Dauerprozesse laufen im Hintergrund. Custom kann ihre Ausgabe lesen und sie stoppen. Beim Beenden von Custom werden sie ebenfalls gestoppt; der nächste Durchlauf erfährt, welche Prozesse noch laufen.
- **Webseiten**: Inhalte mit Überschriften, Links, Listen und Tabellen als bereinigten Text abrufen, auch PDFs und Office-Dateien im Web. Nur öffentliche Adressen sind direkt erreichbar. Für diesen Rechner oder sein Netzwerk verwendet Custom Befehle wie `curl`.
- **Planung**: Bei mehrstufigen Aufgaben eine sichtbare Checkliste führen und Schritte abhaken.
- **Skills**: passende Skills aus dem Projekt, deinen Claude-Code- und Codex-Ordnern und der [Skill-Bibliothek](/guide/skills) laden. Custom kennt Gruppen und Namen und kann nach einer kurzen Aufgabenbeschreibung suchen.
- **MCP-Server**: für Claude Code eingerichtete globale und ordnerspezifische Tool-Server, die `.mcp.json` des Projekts und die Server von Codex verwenden.
- **App-Tools**: Websuche, Browser, Memory, Seiten, deine [Verbindungen](/guide/connections) und weitere Funktionen wie alle Agenten hier nutzen.

Jeder Schritt erhält einen verständlichen Namen wie „index.ts lesen“, „README.md bearbeiten“ oder „https://… abrufen“. Diff und Ausgabe sind per Klick erreichbar.

## Was Custom ohne Rückfrage tun darf

**Berechtigungen** unter **Optionen** auf der Startseite oder im Menü unter dem Nachrichtenfeld bestimmt den Handlungsspielraum. Umschalt+Tab im Nachrichtenfeld wechselt zum nächsten Modus.

- **Nachfragen**, die Voreinstellung: fragt vor Dateiänderungen und Befehlen. Rein lesende Befehle wie `ls`, `cat` oder `git status` laufen ohne Rückfrage.
- **Änderungen akzeptieren**: erlaubt Dateiänderungen im Sitzungsordner. Befehle mit Auswirkungen und Aktionen außerhalb des Ordners benötigen Zustimmung.
- **Auto**: Routinearbeiten laufen direkt, riskantere Schritte prüft eine schnelle Bewertung. Siehe [Auto-Modus](#auto-mode).
- **Vollzugriff**: Tools und Befehle laufen ohne Freigabefragen und ohne [Befehls-Sandbox](#the-sandbox-for-commands), einschließlich Administratorbefehlen und Änderungen außerhalb des Ordners. Es gelten weiterhin die Rechte deines Computerkontos; fehlende Administratorrechte werden dadurch nicht erteilt. Vertrauliche Sitzungen behalten ihre Netzwerkbeschränkungen.
- **Planen**: ausschließlich lesen und planen, keine Dateiänderungen oder Befehle. Custom nutzt nur lesende Tools und endet mit einem nummerierten Plan. Zur Umsetzung wechselst du den Modus und beauftragst die Ausführung.

Außer im Vollzugriff benötigen bestimmte Befehle immer deine Zustimmung; siehe [Befehle mit zwingender Rückfrage](#commands-that-always-ask).

## Custom-Aktionen erlauben oder ablehnen

Benötigt Custom deine Zustimmung, erscheint eine Karte in der Sitzung und im [Posteingang](/guide/inbox). Ihr Titel erklärt Aktion und Grund, etwa „/home/you/notes/plan.md bearbeiten – ändert Dateien außerhalb des Sitzungsordners“. Bei Befehlen steht der vollständige Befehl auf der Karte.

- **Erlauben** gibt nur diesen Schritt frei.
- **Immer erlauben …** erlaubt den Schritt und ähnliche Aktionen für den Rest dieser Sitzung. Die Schaltfläche nennt den Umfang, etwa „npm run build … immer erlauben“, „Alle Änderungen erlauben“, „Lesen in ~/data immer erlauben“ oder „Änderungen in ~/site immer erlauben“.
- **Ablehnen** verhindert den Schritt. Custom erhält deine Entscheidung und soll ihn nicht erneut versuchen.

Bei Befehlen zerlegt **Immer erlauben** die Eingabe an `&&`, `;`, `|` und ähnlichen Trennzeichen und prüft jeden Teil einzeln. Eine Regel gilt anhand der ersten Wörter nur für den zugehörigen Befehl, etwa `git status`, `npm run build` oder `docker compose up`. Weitere Aktionen können nicht hinter `&&` mitlaufen. Rein lesende Befehle benötigen keine Regel.

**Immer erlauben** wird nicht angeboten, wenn eine sichere Regel unmöglich ist:

- bei direkt eingebettetem Code wie `python -c "…"`;
- bei vorab nicht bestimmbaren Dateinamen;
- bei nicht zuverlässig auswertbaren Befehlen;
- bei riskanten Befehlen mit zwingender Rückfrage.

## Befehle mit zwingender Rückfrage

Außer im Vollzugriff benötigen diese Aktionen jedes Mal deine Zustimmung, auch im Auto-Modus und trotz früherer Freigaben:

- Ausführung als Administrator, etwa mit `sudo`;
- Löschen außerhalb des Sitzungsordners, Löschen des Sitzungsordners selbst oder Löschen vorab nicht bestimmbarer Dateien;
- Downloads direkt an eine Shell weitergeben oder sofort ausführen;
- Rohdaten auf Datenträger schreiben, formatieren oder Partitionen ändern;
- den Computer herunterfahren oder neu starten;
- geplante Systemaufgaben über `crontab` ändern;
- Berechtigungen oder Eigentümer eines gesamten Ordnerbaums ändern;
- SSH-Keys, Einstellungen oder Startdateien im persönlichen Ordner wie `.bashrc` oder `~/.config` ändern, sofern die Sitzung nicht direkt dort arbeitet.

## Dateien außerhalb des Ordners und Dateien mit Keys

In den Modi Nachfragen, Änderungen akzeptieren und Planen fragt Custom vor dem Lesen oder Ändern außerhalb des Sitzungsordners. Temporäre Ordner zählen nicht dazu. **Immer erlauben** gilt dann für Lesen oder Ändern im betreffenden Ordner.

Dateien mit Keys oder Passwörtern erfordern auch innerhalb des Sitzungsordners eine Rückfrage: echte `.env`-Dateien, private Keys, `.netrc`, `.npmrc`, Zugangsdaten, Cloud- und Passwortspeicherordner, Agentenanmeldungen und App-Daten. Änderungen an Git-Einstellungen und Hooks benötigen ebenfalls Zustimmung. **Immer erlauben** gilt hier nur für die einzelne Datei.

Im Auto-Modus entscheiden stattdessen dessen Regeln und Schnellprüfung. Im Vollzugriff gibt es keine Rückfrage.

## Auto-Modus

Im Auto-Modus laufen Routinearbeiten ohne Unterbrechung. Für andere Aktionen wirst du gefragt. Wähle dafür **Auto** unter **Berechtigungen**.

Jeder sonst zustimmungspflichtige Schritt durchläuft diese Prüfungen:

1. **Feste Regeln ohne Modell**:
   - Direkt erlaubt: Änderungen im Sitzungsordner, neue Arbeitsdateien im temporären Ordner, lesende Befehle im Sitzungsordner sowie die eigenen Tests, Builds, Linter und Typprüfungen des Projekts.
   - Rückfrage: Überschreiben außerhalb des Ordners, Aktionen der [Liste mit zwingender Rückfrage](#commands-that-always-ask), Git-Force-Push, Schreiben, Verschieben oder Löschen außerhalb des Ordners, Aufrufe von Zahlungsdiensten und Tools verbundener Konten oder MCP-Server, die etwas senden, veröffentlichen oder Geld ausgeben.
2. **Schnellprüfung** durch das [Hilfsmodell](/guide/agents-models#choose-the-helper-model) für alle übrigen Fälle. Die Entscheidung lautet:
   - **allow**: eindeutig vom Auftrag gedeckt, auf den Ordner oder Lesezugriffe beschränkt und leicht rückgängig zu machen;
   - **ask**: möglicherweise dauerhafte Folgen oder größere Reichweite, etwa Datenlöschung, systemweite Installation, Einstellungsänderungen, Passwörter oder Keys, Versand, Veröffentlichung, Ausgaben oder nicht beauftragte Arbeiten;
   - **deny**: eindeutig schädlich oder gegen deinen Wunsch. Der Schritt wird nicht ausgeführt; Custom erhält die Begründung und muss anders vorgehen.

Die Schnellprüfung sieht ausschließlich deine eigenen Nachrichten, die erste und die letzten zehn, ein mögliches Ziel, den Ordner und die geplante Aktion. Bei Dateiänderungen sieht sie den Anfang des neuen Textes. Gelesene Webseiten und Dateien erhält sie nicht und können sie deshalb nicht beeinflussen. Scheitert die Prüfung oder dauert sie länger als 45 Sekunden, entscheidest du. Innerhalb eines Durchlaufs erhält derselbe Schritt dieselbe Entscheidung. In [vertraulichen Sitzungen](/guide/sessions#keep-a-session-confidential) bleibt die Prüfung lokal: durch ein lokales Hilfsmodell oder andernfalls das Sitzungsmodell.

Automatisch erlaubte Schritte tragen **Auto** mit einer Begründung beim Darüberfahren. Gestoppte Schritte zeigen die Kennzeichnung rot und „Auto hat diesen Schritt gestoppt: …“. Rückfragen beginnen mit „Auto:“ und der Begründung.

Unter [Einstellungen → Funktionen → Custom](/settings?s=custom&find=Auto%20mode) erklärt das (i) der Zeile **Auto-Modus** dieselben Regeln. Dort gibt es keinen zusätzlichen Schalter.

## Die Sandbox für Befehle

Im Auto-Modus können Befehle in einer Sandbox laufen. Schreibzugriffe sind dann auf Sitzungsordner und temporäre Ordner begrenzt; der restliche Computer ist schreibgeschützt. Netzwerkzugriffe bleiben möglich. Bei einem Git-Worktree oder Unterordner eines Repositorys bleibt auch der eigentliche Repository-Ordner beschreibbar, damit Git committen kann. Paketmanager verwenden temporäre Cache-Ordner. Die Umsetzung hängt vom Betriebssystem ab:

- **Linux**: bubblewrap erlaubt Schreiben im Sitzungsordner, in `/tmp` und im Repository-Ordner.
- **Mac**: macOS Seatbelt begrenzt Schreiben auf Sitzungsordner, temporäre Ordner und Repository-Ordner.
- **Windows**: Befehle laufen mit niedriger Integritätsstufe. Lesen ist überall möglich, Schreiben nur in entsprechend markierten Ordnern. Hydor markiert Sitzungs- und Repository-Ordner bei der ersten Nutzung dauerhaft. Temporäre Dateien und Paket-Caches liegen in einem eigenen Ordner unter `AppData\LocalLow\Hydor`. Persönlicher Ordner, ganze Laufwerke, Windows, Program Files und App-Datenordner werden nie markiert; dort laufen Befehle ohne Sandbox. Weil Git Bash bei niedriger Integritätsstufe seine internen Abläufe nicht mit normalen Bash-Fenstern teilen kann, legt Hydor außerdem Git-Programmdateien unter `AppData\Local\Hydor\sandbox` ab. Auf demselben Laufwerk sind das platzsparende Verknüpfungen auf dieselben Dateien.

Stößt ein Befehl an die Sandbox-Grenzen, erfährt Custom davon. Er arbeitet innerhalb der Beschränkung weiter oder erklärt, was außerhalb erledigt werden muss.

Unter [Einstellungen → Funktionen → Custom](/settings?s=custom&find=Sandbox%20for%20commands) aktivierst oder deaktivierst du **Sandbox für Befehle**. Die Funktion ist standardmäßig an. Deaktiviere sie, wenn ein Tool außerhalb schreiben muss, etwa für eine systemweite Installation. Laufende Sitzungen übernehmen die Änderung innerhalb von ungefähr 15 Sekunden.

Kann die Sandbox nicht starten, ist der Schalter ausgegraut und nennt den Grund. Befehle laufen dann ohne Sandbox. Unter Linux fehlt oft bubblewrap oder es darf, etwa in manchen Containern, nicht starten. Auf dem Mac ist Seatbelt fehlgeschlagen. Unter Windows erstellt Hydor zunächst einen kleinen Helfer mit dem mitgelieferten .NET Framework und benötigt Git for Windows. Fehlende Voraussetzungen oder Startfehler werden genannt. In Nachfragen und Änderungen akzeptieren wird keine Sandbox verwendet: Nicht rein lesende Befehle warten dort auf deine Zustimmung oder eine passende Regel aus **Immer erlauben**.

In [vertraulichen Sitzungen](/guide/sessions#keep-a-session-confidential) läuft jeder Befehl ohne Netzwerk, unabhängig von Modus und Sandbox-Schalter. Internet, andere Rechner und lokale Server sind dann nicht erreichbar. Dateirechte richten sich weiterhin nach dem Modus. Das funktioniert mit bubblewrap unter Linux und Seatbelt auf dem Mac. Windows kann das Netzwerk so nicht abschalten. Dort und bei nicht verfügbarer Sandbox fragt jeder Befehl in jedem Modus nach, ohne **Immer erlauben**. Custom erhält den Hinweis; Netzwerkversuche erfahren den Grund ihres Scheiterns.

## Custom ein Ziel geben

Ein Ziel lässt Custom über mehrere Durchläufe weiterarbeiten, bis eine Bedingung erfüllt ist, etwa „npm test ist erfolgreich und die Upload-Seite verarbeitet Dateien mit 2 GB“.

1. Öffne das Sitzungsmenü (⋯) → **Ziel festlegen**.
2. Beschreibe den gewünschten Abschluss als überprüfbare Bedingung.
3. Klicke auf **Daran arbeiten** oder drücke Strg+Enter beziehungsweise ⌘Enter auf dem Mac.

Custom beginnt sofort. Läuft bereits ein Durchlauf, wird das Ziel nach dessen Ende geprüft.

Nach jedem Durchlauf bewertet das Hilfsmodell die Belege: ausgeführte Schritte, Befehlsausgaben, Tests, Dateien und gelesene Seiten. Eine bloße Fertigmeldung von Custom genügt nicht. Danach gilt:

- **Erreicht**: Das Ziel wird entfernt und du erhältst „Ziel erreicht“.
- **Noch offen**: Die Prüfung formuliert den nächsten Schritt und sendet ihn als Nachricht, etwa „Zielprüfung 3: noch nicht erreicht …“.
- **Braucht dich**: Das Ziel zeigt „Blockiert: Der Agent braucht dich“ mit der offenen Frage. Du wirst benachrichtigt und antwortest in der Sitzung.
- **Wartet** auf ein externes Ereignis wie Deployment oder Download: Nach drei Minuten wird erneut geprüft.

Deine eigenen Nachrichten haben Vorrang. Die Zielprüfung wartet, bis die Warteschlange leer ist.

Das Ziel pausiert mit Begründung, wenn:

- die unter **Runden bis zur Zielpause** eingestellte Anzahl erreicht ist, standardmäßig 30;
- drei aufeinanderfolgende Runden keinen Fortschritt gebracht haben;
- du den Agenten stoppst, ein Durchlauf fehlschlägt, kein Agent läuft oder die Prüfung selbst scheitert.

Die Zielanzeige über dem Nachrichtenfeld zeigt Zieltext, Zustand, Anzahl und Dauer der Prüfungen sowie die letzte Begründung. **Pausieren** verhindert weitere Folgeschritte; ein laufender Durchlauf endet regulär. **Fortsetzen** arbeitet ab dem letzten Folgeschritt weiter und setzt den Rundenzähler zurück. **Entfernen** beendet die Zielverfolgung. Währenddessen erhältst du erst bei Zielerreichung eine Nachricht statt nach jedem Durchlauf.

Unter [Einstellungen → Funktionen → Custom](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses) wählst du in der Gruppe **Ziele** für **Runden bis zur Zielpause** zwischen **10**, **30** und **100**.

## Lange Gespräche und umfangreiche Ausgaben

Jedes Modell kann nur eine begrenzte Textmenge gleichzeitig lesen, seinen Kontext. Custom hält Gespräche automatisch innerhalb dieser Grenze. Daher gibt es hier keine Schaltfläche zum Komprimieren:

1. Wird der Kontext knapp, räumt Custom zunächst alte Tool-Ausgaben auf und reserviert Platz für die Antwort. Die Sitzung meldet „Alte Tool-Ausgaben wurden entfernt, um im Modellkontext zu bleiben“.
2. Reicht das nicht, fasst das Modell den älteren Gesprächsteil in Arbeitsnotizen zusammen. Bei späteren Kürzungen aktualisiert es diese Notizen. Plan und verwendete Skills bleiben erhalten.

Meldet der Modellserver eine zu lange Anfrage, lernt Custom daraus die tatsächliche Kontextgrenze und komprimiert sofort. Nur die neuesten Bilder werden bei jeder Anfrage mitgesendet.

Die zu Beginn aus Memory übernommenen Informationen bleiben während der Arbeit unverändert. So kann der Modellserver zwischengespeicherten Kontext wiederverwenden, was schneller und günstiger ist. Nach jeder Komprimierung liest Custom Memory passend zu deiner neuesten Nachricht erneut; siehe [Womit ein Agent beginnt](/guide/memory#what-an-agent-starts-with).

Der Ring neben dem Nachrichtenfeld zeigt die Kontextauslastung in Prozent. Beim Darüberfahren siehst du Tokenanzahl und Verteilung. Unter **Optionen → Kontext** steht etwa „42 % belegt“. Ein kleiner Pfeil öffnet die zunächst eingeklappte Aufschlüsselung: **Anweisungen**, **Projektanweisungen**, **Memory**, **App-Funktionen**, **Skills**, **Tools** und **Gespräch**, jeweils mit Tokenzahl und Anteilbalken. Leere Bereiche entfallen. Die Werte werden aus dem Text geschätzt und an die vom Modellserver gemeldete Gesamtzahl angepasst. Der Ring ist bei Custom nicht anklickbar, da die Komprimierung automatisch erfolgt. Claude Code und Codex behalten dagegen **Komprimieren**; siehe [Kontext, Cache und Geschwindigkeit ablesen](/guide/sessions#read-the-meters-context-cache-and-speed).

Auch lange Ausgaben füllen den Kontext nicht unbegrenzt. Überschreitet eine Befehls-, Seiten- oder Tool-Ausgabe ihren Anteil am Kontext, speichert Custom sie vollständig im Sitzungsordner. Das Modell erhält Anfang, Ende und Dateipfad. Bei Befehlen wird mehr vom Ende gezeigt, wo häufig Fehler stehen. Den Rest kann es abschnittsweise lesen oder durchsuchen. Diese Dateien werden nach einer Woche gelöscht.

## Was das Modell liest

Vor deiner Nachricht erhält das Modell in dieser Reihenfolge:

- Customs Arbeitsregeln mit Modus und Ordner, Agentenanweisungen und deine Agentenrichtlinien: **Anweisungen**;
- `AGENTS.md` oder `CLAUDE.md` des Projekts: **Projektanweisungen**;
- passende Informationen aus [Memory](/guide/memory#what-an-agent-starts-with): **Memory**;
- Vorgaben der App-Funktionen, etwa zur Darstellung von Antworten, zum Schutz von Keys und Passwörtern, zum Aufräumen und zur vollständigen Nutzung verfügbarer Funktionen wie Bilder, Apps, Browser und Dokumente: **App-Funktionen**;
- **Skills**, nach Gruppen: projekteigene, persönliche und Bibliotheksgruppen wie Programmierung oder Dokumente. Custom lädt nach Namen oder sucht anhand der Aufgabe. Höchstens 200 Skills werden berücksichtigt, davon maximal 40 persönliche und projekteigene. Zu deiner ersten Nachricht passende Skills enthalten ihren Einsatzzweck;
- vollständig verfügbare Tools und eine kurze Liste weiterer Tools: **Tools**.

Funktionsspezifische Tool-Anleitungen werden erst mit dem jeweiligen Tool geladen. Solange es nur in der Kurzliste steht, wartet auch seine Anleitung. Beim Nachschlagen oder Verwenden wird sie ergänzt. Allgemeine Regeln bleiben immer vorhanden. Claude Code und Codex erhalten weiterhin alle App-Anweisungen beim Start.

So fällt die erste Anfrage bei Modellen mit kleinem Kontext kürzer aus. Die Verteilung siehst du unter **Optionen**; siehe [Lange Gespräche und umfangreiche Ausgaben](#long-conversations-and-long-output).

## Wie Custom schwächere Modelle unterstützt

Nicht jedes Modell kann Tools so zuverlässig einsetzen wie Claude oder GPT. Custom erkennt typische Fehler und lenkt das Modell zurück zur Aufgabe:

- **Wiederholungen**: Derselbe unveränderte Schritt wird beim dritten Mal nicht erneut ausgeführt. Das Modell soll das frühere Ergebnis nutzen. Beim fünften Versuch endet der Durchlauf.
- **Fehlgeschlagene Schritte**: Nach vier aufeinanderfolgenden Fehlern soll das Modell neu planen, nach acht endet der Durchlauf.
- **Schleifen**: Wiederkehrende Abläufe erhalten den Hinweis, anders vorzugehen.
- **Unfertige Arbeit**: Kündigt ein Modell nur an, etwas zu tun, oder beendet es die Arbeit mit offenen Planpunkten, wird es jeweils einmal zurück an die Aufgabe geschickt. Nach Codeänderungen ohne Projektprüfungen wird es aufgefordert, diese vor Abschluss auszuführen.
- **Länge**: Ein Durchlauf umfasst höchstens 200 Schritte. Ab Schritt 150 soll das Modell den wichtigsten Teil abschließen. Wegen der Ausgabelänge abgeschnittene Antworten werden in kleineren Schritten fortgesetzt.
- **Fehlerhafte Tool-Aufrufe**: Als Text geschriebene Aufrufe werden erkannt und ausgeführt, nahezu korrekte Argumente repariert und falsch geschriebene Tool-Namen zugeordnet oder mit einer Tool-Liste beantwortet.
- **Modelle ohne Tool Calling**: Nimmt der Server keine Tool-Definitionen an, beschreibt Custom sie in den Anweisungen und liest Aufrufe aus der Modellausgabe.
- **Verbindungsprobleme**: Bei Abbrüchen während einer Antwort oder überlastetem Server wartet Custom und versucht es mehrfach erneut.
- **Viele Tools**: Bei zahlreichen MCP- und Verbindungs-Tools sieht das Modell zuerst eine Kurzliste. Vollständige Beschreibungen und zugehörige Funktionsanweisungen lädt es bei Bedarf; siehe [Was das Modell liest](#what-the-model-reads). Modelle mit ungefähr 32.000 Kontexttoken oder weniger außerhalb von OpenRouter erhalten weniger Anweisungen: keine Hinweise zu Antwortoberflächen, eine Namensliste weiterer Tools und weniger vollständige Tool-Definitionen. Auch das Tool zum Anzeigen von HTML-Seiten wartet dann in der Liste. Zusätzlich soll das Modell kleine Schritte machen.
- **Modellfamilien** erhalten empfohlene Einstellungen ihres Anbieters, das beim Training verwendete Änderungsformat und gegebenenfalls einen passenden Denkaufwand. Rein lesende Schritte können parallel laufen.

Stoppt Custom einen Durchlauf aus einem dieser Gründe, endet die Antwort mit „(Gestoppt: …)“.

## Bilder für Modelle ohne Bildverarbeitung

Bildfähige Modelle erhalten deine Bilder direkt. Falls ffmpeg oder ImageMagick verfügbar ist, werden große Bilder zuvor verkleinert.

Andernfalls beschreibt das Hilfsmodell Bildinhalt und Anordnung und gibt vorhandenen Text wortgetreu wieder. Dafür muss es selbst Bilder verarbeiten können. Wähle unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model) in der Gruppe **Hilfsmodell** ein entsprechend gekennzeichnetes **Modell**. „Automatisch“ unterstützt das nicht. Ohne geeignetes Hilfsmodell erfährt Custom lediglich, dass ein für ihn nicht sichtbares Bild vorhanden ist. In vertraulichen Sitzungen darf nur ein lokales Hilfsmodell Bilder beschreiben.

## Verzweigen und ab hier bearbeiten

Custom-Sitzungen lassen sich wie Claude-Code- und Codex-Sitzungen über das Sitzungsmenü (⋯) → **Verzweigen** kopieren. Mit **Ab hier bearbeiten** änderst du eine frühere eigene Nachricht: Das Gespräch geht in einer Kopie unmittelbar vor dieser Nachricht weiter; die bisherige Sitzung wird archiviert. **Dateien auf den Stand vor dieser Nachricht zurücksetzen** macht spätere Dateiänderungen rückgängig. Bei Custom gilt das nur für Änderungen seiner eigenen Dateiwerkzeuge. Änderungen durch Befehle bleiben bestehen.

Custom speichert Gespräche auf dem Datenträger und setzt sie nach einem App-Neustart fort.

## Was Custom kostet

- Bei OpenRouter-Modellen verwendet die Sitzung die pro Aufruf gemeldeten tatsächlichen Kosten. Claude-Modelle werden ausdrücklich zur Nutzung des Gesprächs-Caches aufgefordert; andere tun das selbst. Das erneute Lesen kostet so ungefähr ein Zehntel. Die angebotenen Tools ändern sich höchstens einmal pro Sitzung. Tools für Hintergrundbefehle bleiben nach dem ersten Einsatz verfügbar, damit der Cache bestehen bleibt.
- Lokale Modelle über Ollama oder vLLM: keine Modellgebühren.
- Andere Endpunkte: Berechnung anhand der Token wie bei anderen Agenten; siehe [Nutzung, Limits und Kosten](/guide/usage).

Über dem Nachrichtenfeld stehen API-Kosten, Eingabetoken, Token aus dem Cache und Ausgabetoken, auch ohne Ausgabenlimit. Preise stammen aus der OpenRouter-Antwort oder, wenn sie im Stream fehlen, aus dem Datensatz der Generierung. Falls auch diese fehlen, gelten die Katalogpreise von OpenRouter. Eigene Preiseingaben sind nicht erforderlich.

Ein [Ausgabenlimit](/guide/usage#cap-what-a-session-spends) funktioniert auch für Custom.

## Einstellungen → Funktionen → Custom

[Einstellungen → Funktionen → Custom](/settings?s=custom) beschreibt „Auto-Modus, eine Sandbox für Befehle und die Dauer von Zielen“ mit drei Einträgen:

- **Auto-Modus** neben Nachfragen, Änderungen akzeptieren, Vollzugriff und Planen: Das (i) erklärt erlaubte Aktionen, zwingende Rückfragen und die Prüfung durch das Hilfsmodell. Hier gibt es keinen Schalter; du wählst Auto pro Sitzung unter **Berechtigungen**.
- **Sandbox für Befehle**: Im Auto-Modus sind Schreibzugriffe auf Sitzungsordner und temporäre Ordner begrenzt, unter Linux `/tmp`, unter Windows ein eigener temporärer Ordner. Vollzugriff arbeitet ohne Sandbox und Freigabefragen. Der Schalter ist standardmäßig an und bei fehlender Unterstützung ausgegraut. Die Zeile nennt den Grund und die benötigten Komponenten: bubblewrap, Seatbelt beziehungsweise Git for Windows und .NET Framework.
- **Runden bis zur Zielpause** in der Gruppe **Ziele**: Mit /goal arbeitet Custom bis zur Zielerreichung über mehrere Durchläufe. Nach **10**, **30** als Standard oder **100** Runden pausiert er, außerdem nach drei Runden ohne Fortschritt.

Die Modelle von Custom und das für Prüfungen zuständige **Hilfsmodell** findest du unter [Einstellungen → Agenten → Modelle](/settings?s=models).

## Frag einen Agenten

- „Deaktiviere die Sandbox für Befehle in Customs Auto-Modus.“
- „Lass Custom-Ziele bis zu 100 Runden laufen.“
- „Setze für meine Custom-Sitzung ‚Upload-Seite‘ das Ziel: npm test ist erfolgreich und Uploads mit 2 GB funktionieren.“
- „Welches Hilfsmodell nutzt Auto und kann es Bilder verarbeiten?“
- „Kann dieser Computer Befehle vertraulicher Sitzungen ohne Netzwerk ausführen?“
- „Füge Qwen3 Coder von OpenRouter für Custom hinzu.“ Voraussetzung ist ein hinterlegter OpenRouter-Key.
- „Zeige meine OpenRouter-Nutzung und -Kosten ohne manuelle Modellpreise.“
- „Warum ist meine erste Anfrage an Custom für ein lokales Modell so lang?“
- „Wie voll ist der Kontext meiner Custom-Sitzung und was belegt den meisten Platz?“
