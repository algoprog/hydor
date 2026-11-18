# Skills

Skills beschreiben Arbeitsmethoden, die Agenten bei passenden Aufgaben laden: eine Frage recherchieren, einen Fehler finden, ein Projekt planen, ein Word-Dokument erstellen oder nach einer Aufgabe aufräumen. Unter [Einstellungen → Skills](/settings?s=skills) findest du alle verfügbaren Skills: eingebaute, deine eigenen, Skills aus Plugins, die eigenen Skills von Claude Code und Codex sowie Projektskills. Die Schalter dort gelten für alle Sitzungen. Ein Projekt kann für seine Sitzungen davon abweichen. Dieser Artikel erklärt auch, wie Agenten mit deiner Zustimmung neue Skills lernen und wie Schlüsselwörter passende Skills für Custom einbinden.

![Einstellungen → Skills: alle verfügbaren Skills, nach Einsatzzweck gruppiert](images/skills.webp)

## Was ein Skill ist

Ein Skill ist eine kurze Anleitung für eine bestimmte Art von Arbeit. Jeder Skill liegt in einem eigenen Ordner mit einer SKILL.md. Darin stehen sein Name, eine Zeile zum Einsatzzweck und anschließend Arbeitsschritte, Prüfungen und Hinweise auf typische Fehler. Manche Skills bringen außerdem Beispiele, Vorlagen oder kleine Skripte mit.

Agenten lesen nicht ständig alle Skills. Zu Beginn einer Sitzung sehen sie nur die Namen und die Beschreibungen der Einsatzzwecke. Passt ein Skill zur Aufgabe, lädt der Agent die vollständige Anleitung und folgt ihr. Eine Begrüßung, eine schnelle Frage oder eine kleine eindeutige Änderung benötigt keinen Skill.

## Woher Skills stammen

Die Skills-Seite zeigt fünf Quellen, die in den jeweiligen Zeilen gekennzeichnet sind:

- **Eingebaut**: mehr als sechzig mitgelieferte Skills, die mit der App aktualisiert werden.
- **Deine Skills**: Skills, die du hier geschrieben, nach einem Agentenvorschlag bestätigt, von anderen Agenten auf diesem Computer übernommen oder selbst im Skills-Ordner abgelegt hast. Siehe [Von anderen Assistenten übernehmen](/guide/memory#bring-in-from-other-assistants).
- **Von Plugins**: Skills deiner aktivierten [Plugins](/guide/plugins). Diese werden mit dem Plugin verfügbar und verschwinden beim Deaktivieren wieder.
- **Claude Code und Codex**: eigene Skills dieser Agenten in deren Ordnern. Nur der jeweilige Agent erhält sie.
- **In Projekten**: projekteigene Skills, die nur den Sitzungen des Projekts zur Verfügung stehen. Du bearbeitest sie im Tab **Skills** des Projekts; siehe [Eigene Skills für ein Projekt](/guide/projects#give-a-project-skills-of-its-own).

Die ersten drei Quellen bilden die Skill-Bibliothek für alle von der App gestarteten Agenten. Ein Agent kann außerdem bevorzugte Skills festlegen und passende davon vor Beginn der Arbeit laden. Siehe [Agenten](/guide/agents).

## Welche Agenten welche Skills erhalten

Jede von der App gestartete Sitzung erhält die Skill-Bibliothek:

- **Claude Code** erhält sie als Plugin namens „hydor“. Die Skills erscheinen deshalb etwa als hydor:research oder hydor:writing.
- **Codex** erhält einen zusätzlichen Skills-Ordner.
- **Custom**, der eigene Agent der App, erhält die Skills nach Namen und Gruppen. Er kann außerdem anhand der Aufgabe nach einem Skill suchen. Siehe [Custom](/guide/custom).
- **Andere Agenten** wie Gemini CLI oder OpenCode erhalten eine Liste mit dem Dateipfad jedes Skills und lesen die passende Datei bei Bedarf.

Außerhalb der App gestartete Sitzungen, etwa im Terminal oder in VS Code, erhalten die Bibliothek nicht. Die App trägt sie nicht in deine Claude-Code- oder Codex-Einstellungen ein.

Eine Projektsitzung erhält zusätzlich die projekteigenen Skills. Für alle Skills gelten die Schalter des Projekts; siehe [Einen Skill für dieses Projekt aktivieren oder deaktivieren](/guide/projects#turn-a-skill-on-or-off-for-this-project). Ein projekteigener Skill ersetzt einen gleichnamigen Bibliotheksskill in den Sitzungen dieses Projekts.

Deine eigenen Skills haben Vorrang vor eingebauten Skills gleichen Namens. Hat ein Plugin-Skill einen bereits in der Bibliothek vorhandenen Namen, wird er ausgelassen. Die Plugin-Seite zeigt, welchen Skill die Agenten stattdessen erhalten.

Custom liest mehrere Ordner in dieser Reihenfolge: projekteigene Skills aus `.claude/skills` und `.agents/skills`, eigene Skills von Claude Code und Codex in deinem persönlichen Ordner und danach die Bibliothek. Bei gleichen Namen gilt der zuerst gefundene Skill. So stehen deine Claude-Code- und Codex-Skills auch Custom zur Verfügung. Custom berücksichtigt höchstens 200 Skills, davon maximal 40 projekteigene und persönliche. Seine Anweisungen nennen die Gruppen, etwa projekteigene Skills, deine Skills und Bibliotheksgruppen wie Programmierung oder Dokumente, statt jeden Skill einzeln aufzulisten.

## Erkennen, wann ein Agent einen Skill verwendet

Lädt ein Agent einen Skill, erscheint in der Unterhaltung eine kleine Anzeige wie **Skill wird verwendet: research**. Während des Lesens dreht sich ein Ladesymbol. Das funktioniert mit Claude Code, Codex und Custom.

Klicke auf die Anzeige, um Anleitung, Einsatzzweck und Verlauf zu lesen. Stammt der Skill nicht aus der App-Bibliothek, weist das Fenster auf den eigenen Skills-Ordner des Agenten oder den Projektordner hin. Wurde ein projekteigener Skill verwendet, öffnet sich genau dieser. Die Kennzeichnung zeigt den Projektnamen; **Skills des Projekts** öffnet dessen Skills-Tab.

Haben Wörter deiner Nachricht den Skill in eine Custom-Sitzung eingebunden, nennt die Anzeige diese Wörter, etwa „durch ‚Forschung‘ in deiner Nachricht eingebunden“. Siehe [Skills anhand von Schlüsselwörtern einbinden](#bring-skills-in-by-keywords).

Jedes Laden zählt als Verwendung. Bei Bibliotheksskills zeigt die Zeile die Anzahl der Verwendungen und den Zeitpunkt der letzten Nutzung.

## Die Skills-Seite öffnen

Öffne **Einstellungen → Agenten → Skills** ([direkt öffnen](/settings?s=skills)). Auf dem Smartphone öffnest du zuerst die Einstellungen und tippst unter Agenten auf **Skills**.

Von oben nach unten findest du:

- Neben dem Titel **Neuer Skill** und das Menü **⋯** mit **Passende Skills vorschlagen**, **Skills anhand von Schlüsselwörtern einbinden**, **Dein Skills-Ordner** zum Öffnen in Dateien, **Mit Plugins erweitern** für [Einstellungen → Plugins](/settings?s=plugins) und **So erhalten Agenten Skills**.
- Ausstehende Agentenvorschläge, sofern vorhanden; siehe [Einen Skill-Vorschlag bestätigen, bearbeiten oder verwerfen](#approve-edit-or-dismiss-a-proposed-skill). Das (i) erklärt, dass erst nach deiner Zustimmung gespeichert wird.
- Ein Suchfeld und die Filter **Alle**, **Eingebaut**, **Deine Skills**, **Von Plugins**, **Claude Code und Codex** und **In Projekten**. Leere Filter werden ausgeblendet.
- die Skills, in Gruppen nach ihrem Zweck (der Titel jeder Gruppe nennt, wie viele sie enthält, und eine lange Gruppe zeigt ihre ersten acht mit **Alle anzeigen**): **Arbeitsweisen**, **Schreiben**, **Dokumente**, **Recherche und Web**, **Planung und Entscheidungen**, **Daten und Zahlen**, **Design und Bilder**, **Programmierung**, **KI-Modelle** und **Diese App**; dann **Eigene Skills von Claude Code**, **Eigene Skills von Codex** und eine Gruppe für jedes Projekt mit eigenen Skills;
- Am Ende entfernte eigene Skills, die du wiederherstellen kannst.

Jede Zeile zeigt Name, Einsatzzweck, Schalter und ein (i) mit Quelle und Nutzungshäufigkeit. Ein Klick auf den Namen öffnet den Skill. Claude-Code- und Codex-Skills werden so aufgeführt, wie sie in den jeweiligen Ordnern vorliegen: deine eigenen und mit dem Agenten gelieferte Skills. Die Skills eines Projektordners aus `.claude/skills` findest du im **Skills**-Tab des Projekts.

## Einen Skill finden

Die Suche berücksichtigt Namen, Einsatzzweck und Namen des zugehörigen Plugins oder Projekts. Mit Esc oder dem Kreuz leerst du sie. Ein Filter begrenzt die Liste auf eine Quelle.

Auch die allgemeine App-Suche mit Strg+K beziehungsweise ⌘K auf dem Mac findet Skills nach Namen oder Einsatzzweck. Treffer stehen unter **Skills**. Ein Klick öffnet die Skills-Seite beim gesuchten Eintrag.

## Einen Skill aktivieren oder deaktivieren

Jeder Bibliotheksskill und jeder eigene Skill von Claude Code oder Codex hat rechts einen Schalter. Ein deaktivierter Skill bleibt erhalten, steht Agenten aber nicht mehr zur Verfügung. Sein Name ist ausgegraut und die Kennzeichnung lautet **Deaktiviert**. Mit demselben Schalter aktivierst du ihn wieder. Der Schalter ist auch im Skill-Fenster verfügbar.

- Ein deaktivierter Bibliotheksskill, ob eingebaut, persönlich oder aus einem Plugin, wird für alle Agenten ausgelassen. Projekte können ihn für ihre Sitzungen dennoch aktivieren.
- Claude Code speichert den Zustand unter dem Skill-Namen in seinen Einstellungen; Codex in seiner eigenen Konfiguration.

Die allgemeinen Schalter gelten für alle Sitzungen. Ein Projekt kann davon in seinem **Skills**-Tab abweichen; siehe [Einen Skill für dieses Projekt aktivieren oder deaktivieren](/guide/projects#turn-a-skill-on-or-off-for-this-project). Die allgemeine Liste zeigt dann etwa „Deaktiviert in Abschlussarbeit“ oder „Aktiviert in 2 Projekten“.

Projekteigene Skills haben hier keinen Schalter. Du änderst sie im **Skills**-Tab des Projekts.

## Einen Skill und seinen Verlauf lesen

Klicke auf den Skill-Namen oder eine Anzeige **Skill wird verwendet** in der Unterhaltung. Das Fenster zeigt:

- woher er kommt, seine Gruppe und wie oft Agenten ihn verwendet haben;
- den Schalter mit **Für Agenten verfügbar** oder **Deaktiviert: für Agenten nicht verfügbar**;
- Projekte mit abweichender Einstellung, jeweils **Aktiviert** oder **Deaktiviert**. Ein Klick öffnet den Skills-Tab des Projekts;
- Einsatzzweck und gegebenenfalls Schlüsselwörter unter „Custom bindet es auf deine Anweisung ein“;
- die Anleitung, wie Agenten sie lesen;
- **Verlauf**, sofern Änderungen vorliegen: neueste zuerst mit **Gespeichert**, **Geändert**, **Entfernt** oder **Wiederhergestellt**, Zeitpunkt sowie hinzugefügten und entfernten Zeilen. Ein Klick zeigt die Änderungen zeilenweise;
- ganz unten, wo seine Datei liegt: Klicke darauf, um sie in Dateien anzuzeigen; in der Desktop-App zeigt eine Schaltfläche daneben (**Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen**) sie im Dateimanager des Systems.

Welche Aktionen unten verfügbar sind, hängt vom Skill ab:

- Eingebaut: **Meine eigene Version erstellen**; siehe [Einen eingebauten Skill ändern](#change-a-built-in-skill).
- Eigener Skill: **Ändern** und **Entfernen**.
- Plugin-Skill: **Sein Plugin** zum Öffnen des Plugins und **Meine eigene Version erstellen**.
- Eigener Skill von Claude Code oder Codex: **Ändern**, bei nicht löschbaren Skills **Öffnen**, öffnet SKILL.md im Editor. Außerdem gibt es **Löschen**.
- Projektskill: **Skills des Projekts**.

Auf dem Smartphone öffnet sich das Fenster vom unteren Bildschirmrand. **Schließen** beendet die Ansicht.

## Die eingebauten Skills

Die App bringt die folgenden Skills mit, nach denselben Gruppen wie auf der Skills-Seite. Öffne einen Skill, um seine vollständige Anleitung zu lesen.

**Arbeitsweisen**

- **clarify-first**: für umfangreiche oder offene Anfragen, etwa eine Website, Reise, Renovierung, einen Vortrag oder Geschäftsplan. Der Agent liest zuerst vorhandene Informationen, stellt begründete Rückfragen einzeln, fasst sein Verständnis zusammen und bietet zwei oder drei Vorgehensweisen an. Vor der Umsetzung legt er dir eine kurze Aufgabenbeschreibung zur Bestätigung vor.
- **clean-up**: räumt am Ende einer Aufgabe auf. Der Agent erfasst dabei entstandene Arbeitsdateien, Testdaten, temporäre Ordner, zusammengeführte oder aufgegebene Branches, Worktrees und gestartete Prozesse. Er entfernt nur selbst angelegte, nicht mehr benötigte Dinge, fragt bei großen oder gemeinsam genutzten Ressourcen nach und nennt kurz Entferntes und Behaltenes. Solange **Nach Aufgaben aufräumen** unter [Einstellungen → Deine Agenten](/settings?s=assistants&find=Clean%20up%20after%20a%20task) aktiviert ist, erhält jeder Agent diese Anweisung am Aufgabenende. Die Funktion ist standardmäßig an.
- **decisions-log**: für Arbeit ohne unmittelbare Rückfragen, etwa Ziele, geplante Aufgaben oder „Warte nicht auf mich“. Der Agent entscheidet gewöhnliche Fragen selbst, dokumentiert Begründung und Folgen einer Fehlentscheidung und arbeitet weiter. Vor unumkehrbaren Schritten wie Versenden, Bezahlen, Löschen oder Veröffentlichen, bei Passwörtern oder Zugriffsrechten und außerhalb des Auftrags hält er an. Die Abschlussnachricht nennt seine Entscheidungen.
- **evidence-before-done**: vor Aussagen wie erledigt, behoben, gespeichert, gesendet oder nachgewiesen. Der Agent bestimmt eine geeignete Prüfung, führt sie durch und liest das Ergebnis. Er belegt seine Aussage oder nennt ausdrücklich, was ungeprüft blieb.
- **troubleshooting**: für alles, was nicht wie erwartet funktioniert, etwa Fehler, Geräte, Heimnetzwerke, Formeln oder Rezepte. Der Agent reproduziert das Problem, sammelt Fakten, prüft einzelne Vermutungen und weist nach, dass die Ursache behoben ist.

**Schreiben**

- **writing**: für Berichte, Artikel, Briefe, Reden und andere Sachtexte. Der Agent klärt Zielgruppe und Zweck, erstellt vor dem Entwurf eine Gliederung und überarbeitet in getrennten Durchgängen.
- **creative-writing**: für Geschichten, Romane, Memoiren, Gedichte und Drehbücher. Unterstützt Stoffentwicklung, Planung, Schreiben, den Umgang mit Blockaden, systematische Überarbeitung, Feedback und Veröffentlichung einschließlich Anschreiben, Exposés, Literaturagenturen und Selfpublishing. Die eigene Stimme bleibt erhalten.
- **email**: ordnet Posteingänge nach Antwortbedarf, Wartezeit und Archivierung und formuliert sensible E-Mails wie Antworten, Nachfragen, Erinnerungen, Entschuldigungen und Absagen in passendem Ton und Umfang.
- **plain-language**: überarbeitet vorhandene Texte verständlich und natürlich, ohne unnötigen Jargon, Füllwörter oder steife KI-Formulierungen. Aussage und passendes Sprachniveau bleiben erhalten.
- **translation**: übersetzt Dokumente, Nachrichten, Seiten, App-Texte und Untertitel sinngenau und natürlich. Ein Glossar hält Begriffe und Namen konsistent; Zahlen und Datumsangaben werden für die Zielregion angepasst und das Ergebnis geprüft.
- **social-media**: plant und schreibt plattformspezifische Beiträge für LinkedIn, X, Instagram, Mastodon, Bluesky und weitere Dienste, passt Botschaften an und führt einen Redaktionskalender.
- **seo**: verbessert die Auffindbarkeit von Websites, Shops und Blogs in Suchmaschinen und KI-Antworten. Prüft Seiten, Titel, Beschreibungen, Indexierung, strukturierte Daten und KI-Crawler und misst Ergebnisse ohne Rankingversprechen.
- **release-notes**: erstellt aus Commits und Pull-Requests verständliche Release Notes und Changelog-Einträge und bestimmt die nächste Versionsnummer.

**Dokumente**

- **pdf**: erstellt Berichte, Rechnungen, Urkunden, Flyer und Formulare als PDF, führt PDFs zusammen, teilt, dreht, befüllt oder stempelt sie, wandelt Office-Dateien um und liest auch gescannte PDFs.
- **presentations**: erstellt oder ändert .pptx-Präsentationen mit einheitlicher Gestaltung, Diagrammen, Tabellen und Vortragsnotizen. Prüft Folien vor der Übergabe als Bilder und liest .pptx-, .ppt- und .odp-Dateien.
- **spreadsheets**: erstellt oder ändert .xlsx-Arbeitsmappen mit Formeln, Zahlenformaten und Diagrammen, prüft Formelfehler und liest .xlsx-, .xls-, .ods- und .csv-Dateien.
- **word-documents**: erstellt oder ändert .docx-Dokumente mit echten Überschriften, Listen und Tabellen, prüft die Seitendarstellung und liest .docx-, .doc- und .odt-Dateien.

**Recherche und Web**

- **research**: plant die nötigen Suchen, recherchiert zunächst breit und dann gezielt in Fachartikeln, Patenten, Nachrichten und offiziellen Unterlagen. Zentrale Aussagen werden durch zwei unabhängige Quellen oder eine Primärquelle geprüft. Die Antwort enthält Quellen und nennt offene Punkte.
- **spin-check**: prüft Werbung, virale Beiträge, Verkaufsaussagen und andere Behauptungen auf Wahrheit, Irreführung oder Betrug. Jede Aussage wird mit einer geeigneten Quelle abgeglichen; Überzeugungstechniken und Einzelurteile werden benannt.
- **papers**: unterstützt die vertiefte Arbeit mit wissenschaftlicher Literatur: Zitierbeziehungen, rechtmäßig verfügbare Volltexte, Zusammenfassungen, Studienvergleiche, Qualitätsbewertung und korrektes Zitieren.
- **peer-review**: begutachtet eigene Entwürfe oder zugewiesene Artikel anhand des Bewertungsformulars und der Punkteskala der jeweiligen Paper. Prüft kritische Schwachstellen einzeln und beantwortet Gutachten innerhalb der vorgegebenen Länge, ohne noch nicht vorliegende Ergebnisse zu versprechen.
- **reproduce-paper**: reproduziert veröffentlichte Ergebnisse mit genauem Zielwert, Originalcode und Einstellungen, sauberer Umgebung, Daten und Checkpoints. Vor dem vollständigen Lauf steht ein kleiner Test; lange Läufe gehören in [Experimente](/guide/experiments). Ergebnisse werden unter vergleichbaren Bedingungen geprüft und Änderungen dokumentiert.
- **figures-for-papers**: erstellt druckfähige Abbildungen in Spaltenbreite und Schrift des Paperssvorlage, mit für Farbsehschwächen geeigneten Farben und als Vektor-PDF mit eingebetteten Schriften ohne Type 3. Eine gemeinsame Stildatei hält alle Abbildungen konsistent.
- **blocked-pages**: sucht geordnet nach anderen Zugängen zu benötigten Seiteninhalten, wenn Fehler, Paywalls, Cookie-Schranken, Bot-Prüfungen oder JavaScript das Lesen verhindern. Unberechtigte Zugriffsbarrieren werden nicht umgangen.
- **web-scraping**: sammelt strukturierte Daten wie Angebote, Tabellen, Preise oder Kataloge rücksichtsvoll und zuverlässig als CSV oder JSON und prüft die Ergebnisse.
- **maps-and-places**: ermittelt ohne kostenpflichtige Kartendienste Koordinaten, Orte in der Nähe, Entfernungen, Routen, Reisezeiten, Zeitzonen und Öffnungszeiten und bindet Karten in Seiten ein.
- **watch-and-alert**: beobachtet mit einer geplanten Aufgabe über Tage oder Wochen Preise, Verfügbarkeit, Unternehmensnachrichten, Seitenänderungen oder Releases und benachrichtigt dich nur bei relevanten Ereignissen.

**Planung und Entscheidungen**

- **decision-brief**: hilft bei Entscheidungen mit Optionen, bei Bedarf einschließlich Nichtstun, gewichteten Kriterien, Zielkonflikten, Risiken und einer klaren Empfehlung auf einer Seite.
- **project-plan**: plant Veranstaltungen, Umzüge, Produkteinführungen, Renovierungen und andere Projekte mit Meilensteinen, Zuständigkeiten, Terminen, Abhängigkeiten, Risiken und einer pflegbaren Zeitleiste.
- **meetings**: klärt, ob ein Treffen nötig ist, erstellt eine Agenda aus Fragen, bestimmt Teilnehmende und unterstützt Moderation, Einzelgespräche, Nachbereitung und die Vorbereitung auf fremdgeleitete Meetings.
- **weekly-review**: bringt wöchentlich offene Aufgaben, Zusagen und stockende Vorhaben auf den Stand und plant Prioritäten und Zeit für die kommende Woche.
- **brainstorming**: sammelt viele Ideen mit Methoden wie Umkehrung, Einschränkungen, Analogien oder der schlechtesten Idee und sortiert sie anschließend zu wenigen testbaren Ansätzen.
- **study-coach**: erfasst Vorwissen, erstellt einen Lernplan, erklärt auf passendem Niveau und bietet Übungsfragen und wiederholbare Lernkarten.
- **job-interviews**: bereitet Bewerbungsgespräche anhand der Stellenanforderungen und echter Beispiele vor. Übungsgespräche laufen Frage für Frage mit ehrlichem Feedback. Unterstützt schwierige Fragen, Nachbesprechungen und auch Interviewende.
- **solo-business**: unterstützt Einzelunternehmen, freiberufliche Arbeit und Nebenerwerb. Klärt Anforderungen, testet Angebote früh mit zahlenden Kunden, kalkuliert kostendeckende Preise und hilft zu entscheiden, wann ein Richtungswechsel oder Ende sinnvoll ist.

**Daten und Zahlen**

- **data-analysis**: beantwortet Datenfragen anhand von CSV, Excel oder Exporten. Prüft und bereinigt Daten, arbeitet nachvollziehbar und nennt die Grundlage der Ergebnisse.
- **dashboards**: wählt passende Diagramme und erstellt wiederholt nutzbare Dashboards als Bibliotheksseiten mit gespeicherten oder live geladenen Daten.
- **notebooks**: erstellt verständliche und erneut ausführbare Jupyter-Notebooks mit erklärenden Textzellen, kleinen Codezellen und passender Laufzeitumgebung. Fehlt eine Umgebung, wird sie neben dem Notebook angelegt. Vor der Übergabe wird alles vollständig ausgeführt. Eine Karte öffnet die Notebook-Seite der App.
- **financial-model**: bildet Umsatz, Kosten, Cashflow, Gewinnschwelle und Szenarien eines Unternehmens in einer Tabelle ab, mit Annahmen auf einem eigenen Blatt und nachvollziehbaren Formeln.
- **sql-and-databases**: unterstützt korrektes, sicheres SQL, Schemas und Migrationen für Live-Daten, Indizes und Backups vor riskanten Änderungen.

**Design und Bilder**

- **image-prompts**: erstellt Bilder und kurze Videos mit den Bildmodellen der App. Unterstützt Beschreibung, Größen, Text im Bild, konsistente Figuren und Stile sowie Bildbearbeitung.
- **diagrams**: erstellt verständliche Flussdiagramme, Zeitleisten, Organigramme, Mindmaps und Architekturdiagramme in der Unterhaltung oder als gespeicherte Seite.
- **infographics**: erstellt einseitige visuelle Erklärungen wie Infografiken, Vergleichsposter, Prozessgrafiken und Zeitleisten. Botschaft und belegte Fakten stehen vor Aufbau und Gestaltung; der tatsächliche Export wird in seiner späteren Anzeigegröße geprüft.
- **ui-mockups**: zeigt vor dem Bau einer Ansicht oder Seite zwei oder drei schnelle, deutlich unterschiedliche Entwürfe zum Vergleichen und Auswählen direkt in der Unterhaltung.
- **brand-kit**: entwickelt eine Marke für kleine Unternehmen, Vereine oder Projekte: Zielgruppe, Tonalität, auf Kontrast geprüfte Farben, kostenlose Schriften, Logoideen sowie einen kompakten Markenleitfaden und ein Markenhandbuch. Setzt die Gestaltung auf Profilen und Karten ein.
- **youtube-thumbnails**: entwickelt Thumbnails und Titel mit einem gemeinsamen, ehrlichen Versprechen: drei unterschiedliche Ideen, auch klein gut lesbar, in einer Vorschau neben anderen Videos geprüft und mit YouTubes Test & Compare getestet.

**Programmierung**

- **debugging-code**: findet die eigentliche Fehlerursache: zuerst einen fehlschlagenden Test erstellen, dann Stacktrace, Protokolle, Debugger oder git bisect zur Eingrenzung nutzen. Anschließend folgen Korrektur und ein Test, der ein erneutes Auftreten verhindert.
- **test-first**: schreibt bei neuen Funktionen und Fehlerkorrekturen Tests vor dem Code, wählt die richtige Testebene und klärt, wo Mocks sinnvoll sind und wo nicht.
- **code-review**: prüft Änderungen oder eigene Arbeit vor der Übergabe. Zuerst Korrektheit, danach Sicherheit, Tests und Verständlichkeit. Jeder Befund nennt Fundstelle, Grund und Korrektur.
- **refactoring**: ändert die Codestruktur ohne Verhaltensänderung, in kleinen Schritten bei durchgehend erfolgreichen Tests.
- **codebase-tour**: erschließt eine unbekannte Codebasis: Build, Start, Tests, Bestandteile und Ablageorte, mit kurzem Überblick und Diagramm.
- **git-rescue**: hilft sicher bei Git-Problemen wie rückgängig zu machenden Commits, verlorener Arbeit, Konflikten oder versehentlich eingecheckten Zugangsdaten, immer mit vorheriger Sicherung.
- **github**: bearbeitet Pull-Requests, Reviews, Checks und Protokolle, Issues und Releases über gh oder die GitHub-API.
- **api-requests**: ruft Web-APIs auf und untersucht Fehler, mit gespeicherten Keys für die Anmeldung, Fehlerantworten, seitenweisen Ergebnissen, Zugriffslimits und Wiederholungsversuchen.
- **frontend-polish**: verbessert Layout, Abstände, Typografie, Farben, Kontraste, Zustände, mobile Darstellung und Tastaturbedienung einer Webseite. Die Prüfung erfolgt anhand echter Screenshots.
- **web-accessibility**: prüft Websites und Web-Apps mit Tools und manuell auf Tastaturbedienung, Screenreader, Zoom, Kontraste, Untertitel, Formulare und Dialoge und berichtet die Ergebnisse nachvollziehbar.
- **web-app-qa**: testet eine Web-App im Browser wie ein anspruchsvoller Nutzer und dokumentiert gefundene Fehler mit Schritten und Belegen.
- **docker**: schreibt Dockerfiles und Compose-Dateien, baut und untersucht Container und räumt vorsichtig auf.
- **servers**: verwaltet Computer über SSH: Updates, Dienste, Speicherplatz, Benutzer und Keys, Firewall und Backups. Vor Zugriffsänderungen muss ein Rückweg gesichert sein. Änderungen beginnen auf einem Computer und werden einzeln geprüft.
- **security-check**: prüft praktisch auf offengelegte Zugangsdaten, Injection, Berechtigungen und veraltete Pakete und bewertet Probleme nach Schweregrad.
- **performance**: verbessert Geschwindigkeit durch Messen, Erkennen des größten Engpasses, Korrigieren und erneutes Messen.
- **mcp-servers**: erstellt MCP-Server mit sinnvoll gestalteten neuen Tools, testet sie und verbindet sie mit Agenten.
- **ci-doctor**: untersucht fehlgeschlagene Läufe von GitHub Actions, GitLab CI, Buildkite oder CircleCI. Findet den ersten tatsächlichen Protokollfehler, unterscheidet sporadische von dauerhaften Fehlern und reproduziert im Worktree. Je nach Auftrag folgt genau eine Wiederholung, ein Draft-Pull-Request oder ein Bericht.
- **issue-triage**: vergibt passende Projektlabels für neue Issues, sucht Duplikate mit verschiedenen Formulierungen, benennt Unsicherheit, fragt freundlich nach fehlenden Angaben und versucht kleine Korrekturen als Draft-Pull-Request.
- **dependency-upgrades**: erkennt veraltete oder sicherheitskritische Abhängigkeiten und aktualisiert nach Risiko getrennt: Sicherheitskorrekturen, Patch-, Minor- und Major-Updates. Jede Gruppe wird im Worktree getestet, mit gelesenen Release Notes und eigenem Pull-Request.
- **incident-response**: informiert bei Alarmen oder Ausfällen sofort, erstellt eine Zeitleiste aus Fehlern, Deployments und Änderungen und belegt die vermutete Ursache. Ein Rollback wird vorgeschlagen und vorher abgestimmt. Anschließend folgt eine sachliche Nachbetrachtung ohne Schuldzuweisungen.
- **git-bisect**: findet mit einem Prüfskript und git bisect run in einem eigenen Worktree den verursachenden Commit und erklärt den Fehler; siehe [Die verursachende Änderung finden](/guide/engineering#find-what-broke-it).

**KI-Modelle**

- **hugging-face**: veröffentlicht und nutzt Modelle und Datensätze im Hugging Face Hub, einschließlich Uploads, Model Cards, Dataset Cards, zugriffsbeschränkter Repositorys und Upload-Prüfung.
- **fine-tuning**: prüft, ob sich Fine-Tuning lohnt, und begleitet Trainingsdaten, LoRA, QLoRA, Einstellungen, Speicherbedarf und eine ehrliche Evaluation.
- **model-evaluation**: bewertet Modelle fair mit geeigneten Testdaten, Metriken, Benchmarks, vorsichtig eingesetzten Modellbewertungen und einer Einschätzung der Ergebnissicherheit.
- **local-models**: führt offene Modelle lokal aus und unterstützt Modellgröße, Speicherbedarf, Quantisierung sowie Ollama, llama.cpp und vLLM.

**Diese App**

- **everyday-help**: beantwortet „Was kannst du für mich tun?“ mit einer kurzen Unterhaltung über deinen Alltag, jeweils einer Frage und ein oder zwei passenden Ideen aus den tatsächlichen App-Funktionen. Mit deiner Zustimmung wird eine kleine Hilfe eingerichtet.
- **app-builder**: erstellt oder ändert deine Apps. Klärt Ein- und Ausgabe, wählt kostengünstige Schritte für jede Teilaufgabe, ergänzt Beispiele mit Prüfungen, testet vor der Übergabe und nennt die Kosten eines Laufs.
- **skill-authoring**: hilft beim Schreiben guter Skills: wann sich einer lohnt, Einsatzzweck, Aufbau, Prüfungen und Verbesserungen nach der Nutzung.
- **plugin-authoring**: erstellt, paketiert, prüft und teilt Plugins und erklärt Inhalt, Format und Einbindung; siehe [Plugins](/guide/plugins).

Die Dokument-Skills pdf, presentations, spreadsheets und word-documents erzeugen Dateien mit kleinen Python-Skripten. Dafür muss Python 3 auf diesem Computer vorhanden sein. Bei der ersten Nutzung laden sie benötigte Bibliotheken in einen privaten Ordner innerhalb der App-Daten, einmalig etwa 30 MB. Es erfolgt keine systemweite Installation. Fehlt Python, nennt der Agent den Installationsbefehl. Zur visuellen Prüfung der Seiten verwenden sie LibreOffice und Poppler, sofern vorhanden. Siehe [Dokumente, Bilder, Videos und Sprache](/guide/documents-voice).

Eingebaute Skills lassen sich nicht entfernen. Du kannst sie jedoch deaktivieren oder eine eigene Version erstellen, die das Original ersetzt.

## Einen eigenen Skill schreiben

1. Klicke auf **Neuer Skill** ([direkt öffnen](/settings?s=skills&find=New%20skill)).
2. Gib einen kurzen **Namen** ein, getrennt mit Bindestrichen. „Invoice checks“ wird als invoice-checks gespeichert.
3. Beschreibe unter **Einsatzzweck** in einer Zeile, wann der Skill passt, etwa „Verwende diesen Skill, wenn du eine Lieferantenrechnung vor der Zahlung prüfst“. Agenten sehen diese Zeile in jeder Sitzung und lesen die vollständige Anleitung nur bei Bedarf.
4. Schreibe unter **Anweisungen** die Methode: Schritte in Reihenfolge, Prüfungen und typische Fehler. Markdown ist möglich.
5. Wähle optional die **Gruppe** und **Auslösende Wörter**: durch Kommas getrennte Formulierungen, die den Skill automatisch in einen Custom-Durchlauf einbinden; siehe [Skills anhand von Schlüsselwörtern einbinden](#bring-skills-in-by-keywords).
6. Behalte unter **Verfügbar für** die Auswahl **Alle Agenten** oder wähle **Claude Code** oder **Codex**, wenn nur dieser Agent den Skill erhalten soll.
7. Klicke auf **Skill hinzufügen**.

Ein Skill für alle Agenten wird in deinem Skills-Ordner innerhalb der App-Daten gespeichert, normalerweise `~/.hydor/skills`, und erscheint unter **Deine Skills**. Claude-Code-Skills liegen in `~/.claude/skills`, Codex-Skills in `~/.agents/skills`. Der jeweilige Agent liest sie in allen Arbeitsordnern. Existiert der Name bereits, meldet die App das und speichert nichts. Einen Skill für ein einzelnes Projekt schreibst du im **Skills**-Tab des Projekts; siehe [Eigene Skills für ein Projekt](/guide/projects#give-a-project-skills-of-its-own).

Öffne einen eigenen Skill und klicke auf **Ändern**, um dieselben Felder erneut zu bearbeiten. **Speichern** übernimmt die Änderung und legt sie im Verlauf ab. Du kannst Skills auch selbst im Skills-Ordner anlegen: ein Ordner pro Skill, Name aus Kleinbuchstaben, Ziffern und Bindestrichen, darin SKILL.md. Auch diese erscheinen unter **Deine Skills**.

## Einen eingebauten Skill ändern

Öffne den Skill und klicke auf **Meine eigene Version erstellen**. Bearbeite die vorausgefüllten Felder und klicke auf **Speichern**. Deine Version basiert auf einer vollständigen Kopie des eingebauten Skill-Ordners einschließlich Beispielen und Skripten.

Danach verwenden Agenten deine Version, auch wenn die App später das eingebaute Original aktualisiert. Unter **Deine Skills** steht „Deine Version eines eingebauten Skills“. Entferne deine Version, um zum Original zurückzukehren; siehe [Einen Skill entfernen und wiederherstellen](#remove-a-skill-and-bring-it-back).

Auch wenn du einen Verbesserungsvorschlag eines Agenten für einen eingebauten Skill bestätigst, entsteht auf diese Weise deine eigene Version. Die Karte erklärt das vor der Zustimmung.

## Einen Skill entfernen und wiederherstellen

1. Öffne einen deiner Skills und klicke auf **Entfernen**.
2. Bestätige mit **Entfernen**.

Der Skill steht Agenten danach nicht mehr zur Verfügung. War es deine Version eines eingebauten Skills, verwenden sie wieder das Original. Der Text bleibt im Verlauf erhalten und lässt sich wiederherstellen. Entfernte eigene Skills stehen unten unter **Entfernt:**. Beim Darüberfahren siehst du das Entfernungsdatum. Ein Klick auf den Namen stellt den Skill im damaligen Zustand wieder her.

Bei eigenen Skills von Claude Code und Codex entfernt **Löschen** nach Bestätigung den gesamten Skill-Ordner samt Dateien von der Festplatte. Diese Aktion gilt für deine eigenen Skills und im Skills-Tab eines Projekts auch für Claude-Code-Skills des Projektordners. Eingebaute, administrativ vorgegebene und Plugin-Skills dieser Agenten lassen sich nur deaktivieren. Ein gelöschter Skill kann in der App nicht wiederhergestellt werden.

## Einen Skill-Vorschlag bestätigen, bearbeiten oder verwerfen

Nach einer aufwendigen Aufgabe kann ein Agent vorschlagen, seine Methode als Skill zu speichern: etwa eine erst nach mehreren Versuchen gefundene Korrektur, einen von dir erläuterten Arbeitsablauf oder einen fehleranfälligen Prozess. Auch Verbesserungen an verwendeten Skills sind möglich, wenn Schritte fehlen, falsch oder unklar sind. Agenten sollen keine einmaligen Fakten, persönlichen Angaben oder Geheimnisse vorschlagen.

Gespeichert wird erst nach deiner Zustimmung. Bis dahin arbeitet der Agent weiter. Deine Entscheidung erreicht ihn als Nachricht.

### Was die Karte zeigt

Der Vorschlag erscheint während der weiteren Arbeit als Karte in der Unterhaltung, außerhalb der eingeklappten Schritte. Oben steht **Als Skill speichern?**, **Diesen Skill verbessern?** oder **Diesen integrierten Skill verbessern?**, dazu Name und Status: **Wartet auf dich**, **Gespeichert**, **Verworfen** oder **Ersetzt**.

Darunter stehen:

- **Warum**: der konkrete Anlass, aus dem die Methode aufbewahrt werden sollte, in den Worten des Agenten.
- **Einsatzzweck**: die Beschreibung, anhand derer Agenten den Skill auswählen. Wird sie geändert, erscheint die bisherige Zeile durchgestrichen.
- Gegebenenfalls Schlüsselwörter für Custom mit dem Hinweis „Custom bindet es auf deine Anweisung ein“.
- Mögliche Warnungen; siehe [Warnungen auf der Karte](#warnings-on-the-card).
- Der Text mit Umschaltung zwischen **Text** bei einem neuen Skill beziehungsweise **Änderungen** für den zeilenweisen Vergleich und **Skill** für die lesbare Anleitung, dazu die Anzahl hinzugefügter und entfernter Zeilen.
- Im Projekt die Auswahl **Speichern für** mit **Alle Sitzungen** oder dem Projektnamen; siehe [Skill-Vorschläge in einem Projekt](/guide/projects#skills-agents-propose-in-a-project).

### Den Vorschlag bestätigen

Klicke auf **Genehmigen**. Der Skill wird in deiner Bibliothek gespeichert. Die Karte bestätigt, dass alle Agenten ihn verwenden können. **Deine Skills** führt zu [Einstellungen → Skills](/settings?s=skills).

Ist unter **Speichern für** der Projektname gewählt, wird der Skill stattdessen dort abgelegt. Die Karte weist darauf hin und **Skills des Projekts** öffnet den entsprechenden Bereich.

Custom erhält den Skill ab dem nächsten Durchlauf, Claude Code und Codex ab ihrer nächsten Sitzung.

### Den Vorschlag zuerst bearbeiten

1. Klicke auf **Bearbeiten…**. Ein Fenster zeigt den vollständigen Skill als Text.
2. Ändere, was du willst. Die Zeilen oben (zwischen den `---`-Zeilen) enthalten seinen Namen, der bleiben muss, und die Zeile dazu, wann er verwendet wird. Alles darunter ist die Anleitung, der Agenten folgen.
3. Klicke auf **Speichern und genehmigen**.

Die Karte zeigt anschließend die gespeicherte Version und weist auf deine Bearbeitung hin. Die App prüft deinen Text wie den Vorschlag des Agenten: Einsatzzweck, konkrete Arbeitsschritte und keine Geheimnisse.

### Den Vorschlag verwerfen

1. Klicke auf **Verwerfen…**.
2. Begründe deine Entscheidung bei Bedarf im geöffneten Feld.
3. Klicke auf **Verwerfen** oder gehe mit **Abbrechen** zurück.

Es wird nichts gespeichert. Der Agent erhält deine Entscheidung mit einer möglichen Begründung und soll den Vorschlag ohne deine Aufforderung nicht erneut einreichen.

### Warnungen auf der Karte

Skills werden von Agenten gelesen. Deshalb prüft die App jeden Vorschlag vor der Anzeige:

- **Geheimnisse blockieren den Vorschlag.** Text, der wie ein Passwort, Key oder Token aussieht, etwa ein API-Key, privater Key oder ein Passwort im Klartext oder innerhalb einer Adresse, wird nicht als Karte angezeigt. Der Agent soll den Wert entfernen und stattdessen seinen Aufbewahrungsort nennen.
- **Auffällige Steuerungsanweisungen werden markiert.** Unter **Sieh dir diese Zeilen an, bevor du sie genehmigst** erscheinen Zeilennummer und Text, wenn ein Vorschlag etwa bestehende Anweisungen außer Kraft setzen, die Identität des Agenten ersetzen, Informationen vor dir verbergen oder Zustimmungen umgehen will. Auch das Versenden von Keys oder privaten Dateien, direkt aus dem Internet gestartete Skripte, geänderte Agenteneinstellungen oder Startdateien, weit außerhalb des Projekts gelöschte oder überschriebene Dateien, versteckte HTML-Anweisungen und unsichtbare Zeichen werden hervorgehoben.

Bei solchen Warnungen fragt die App erneut: **Trotz dieser Warnungen speichern?** Klicke nur auf **Speichern**, wenn die markierten Anweisungen tatsächlich von den Agenten befolgt werden sollen.

### In den Einstellungen oder im Posteingang antworten

Ein Vorschlag wartet an drei Stellen. Deine Entscheidung wird überall und auf allen Geräten angezeigt:

- Auf der Karte in der ursprünglichen Unterhaltung.
- Oben unter [Einstellungen → Skills](/settings?s=skills) als „Ein Agent schlägt einen Skill vor“ oder mit der Anzahl der Vorschläge. Jede Zeile nennt **Neuer Skill:** oder **Änderung an**, Name, Zeitpunkt, Ursprungsgespräch als Link und gegebenenfalls „enthält Warnungen“. **Prüfen** öffnet dieselbe Karte in einem Fenster.
- Im [Posteingang](/inbox) als „Schlägt einen neuen Skill vor: …“ oder „Schlägt eine Änderung am Skill … vor“. **Öffnen** führt zur Karte in der Unterhaltung. Siehe [Posteingang und Benachrichtigungen](/guide/inbox).

### Grenzen

- Ein Vorschlag darf höchstens 20.000 Zeichen enthalten. Längere Anleitungen werden abgelehnt; der Agent soll sich auf die wesentlichen Schritte beschränken.
- Ein neuer Skill benötigt einen freien Namen aus kurzen kleingeschriebenen Wörtern mit Bindestrichen, etwa release-notes.
- Pro Unterhaltung können höchstens fünf Vorschläge gleichzeitig auf deine Entscheidung warten.
- Schlägt der Agent denselben Skill erneut vor, bevor du antwortest, ersetzt der neue Vorschlag den alten. Dieser erhält den Status **Ersetzt**.
- Wurde seit dem Vorschlag ein gleichnamiger Skill gespeichert oder der betreffende Skill geändert, schlägt die Bestätigung mit einer Meldung fehl. Verwirf den Vorschlag und frage den Agenten erneut.
- Agenten können nur Bibliotheksskills und projekteigene Skills auf diese Weise verbessern. Eigene Skills von Claude Code und Codex bearbeitest du direkt unter [Einstellungen → Skills](/settings?s=skills).
- Beantwortete Vorschläge bleiben ein halbes Jahr auf ihren Karten in alten Unterhaltungen erhalten.

## Passende Skills für neue Sitzungen

Beginnt eine Sitzung mit einer Nachricht, erhält ihr Agent bis zu drei eindeutig passende Skills mit Einsatzzweck und Ladehinweis. Claude Code verwendet sein Skill-Tool, Codex und andere Agenten lesen SKILL.md. Custom nutzt sein skill-Tool, das auch anhand einer kurzen Aufgabenbeschreibung suchen kann. Der Agent lädt passende Skills vor Beginn der Arbeit oder arbeitet ohne Skill weiter. Der Hinweis wird einmalig zur ersten Nachricht übergeben; bei Custom steht er in den Arbeitsanweisungen.

Die Suche funktioniert wie die Notizsuche in Memory; siehe [Womit ein Agent beginnt](/guide/memory#what-an-agent-starts-with). Zuerst zählen Wörter: der Skill-Name am stärksten, dann Schlüsselwörter und Einsatzzweck. Ist unter [Einstellungen → Memory](/settings?s=memory&find=Search%20by%20meaning) die Bedeutungssuche aktiv, werden auch sinngleiche Anfragen in anderen Formulierungen oder Sprachen erkannt. Es zählen nur eindeutige Treffer: Bei Wörtern müssen mindestens zwei übereinstimmen und deutlich vor anderen Treffern liegen; bei Bedeutungssuche wird nur der ähnlichste, ausreichend passende Skill genannt. Allgemeine Wörter wie „help“, „need“ oder „after“ zählen nicht. Smalltalk, kurze Antworten und unpassende Anfragen erhalten keinen Skill.

Du steuerst die Funktion im Menü **⋯** unter [Einstellungen → Skills](/settings?s=skills&find=Suggest%20skills%20that%20fit) über **Passende Skills vorschlagen**. Ein Häkchen zeigt den aktiven Zustand. Standardmäßig ist die Funktion an. Bei fortgesetzten Sitzungen und App-Läufen wird kein neuer Hinweis übergeben.

## Skills anhand von Schlüsselwörtern einbinden

Manche Modelle laden Skills selten selbstständig. Für sie kann Custom einen Skill automatisch einbinden, wenn deine Nachricht dessen Schlüsselwörter enthält. Der Skill-Text wird mit der Nachricht übergeben, damit der Agent ihm bei passender Aufgabe folgt.

Die Einstellung findest du im Menü **⋯** unter [Einstellungen → Skills](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords): **Skills anhand von Schlüsselwörtern einbinden**. Die Funktion ist standardmäßig an und betrifft nur Custom. Claude Code und Codex laden Skills selbst. Auch bei deaktivierter Einstellung sieht Custom weiterhin seine Skills-Liste und kann passende Anleitungen selbst laden.

Wird ein Skill durch Schlüsselwörter eingebunden, steht unter deiner Nachricht etwa **Skill wird verwendet: Forschung** und „durch ‚Forschung‘ in deiner Nachricht eingebunden“. Ein Klick öffnet den Skill.

### Wie Schlüsselwörter erkannt werden

- Ein Schlüsselwort muss ein ganzes Wort treffen. Groß- und Kleinschreibung ist egal. „Forschung“ passt nicht zu „Forschungers“.
- Ein Schlüsselwort mit abschließendem * passt auch auf längere Wörter: „renovat*“ auf renovate und renovation, „debug*“ auf debugging.
- Nachrichten mit weniger als vier Wörtern binden nichts ein. „ok, go on“ lädt deshalb keinen Skill.
- Höchstens zwei Skills werden gleichzeitig eingebunden. Die meisten passenden Schlüsselwörter bestimmen die Reihenfolge.
- Ein eingebundener Skill gilt für die aktuelle und die nächsten zwei Nachrichten. So können Rückfragen oder Recherchen mehrere Durchläufe umfassen. Neue passende Skills ersetzen ältere.
- Zu lange Skills werden auf die verfügbare Kontextgröße gekürzt. Der Agent erhält den Hinweis, den Rest selbst zu laden.

Eingebaute Skills mit Schlüsselwörtern sind unter anderem app-builder mit „make a template“, „make an app“, „automate“; clarify-first mit „plan a trip“, „business plan“, „renovat*“; clean-up mit „clean up after“, „leftover files“; decisions-log mit „while I'm away“, „overnight“; evidence-before-done mit „double-check“, „verify“; Forschung mit „Forschung“, „find sources“, „literature review“; troubleshooting mit „not working“, „keeps crashing“, „debug*“ und writing mit „draft a“, „proofread“, „cover letter“. Viele weitere Skills haben ebenfalls einige Schlüsselwörter. Die Dokument-Skills haben keine; Custom lädt sie bei passenden Aufgaben selbst. Die tatsächlichen Schlüsselwörter siehst du im jeweiligen Skill-Fenster.

### Einem Skill Schlüsselwörter geben

Die Schlüsselwörter stehen als Liste im Frontmatter von SKILL.md, etwa `triggers: [weekly report, status update, standup]`. Ein Agent kann für einen neuen Skill höchstens 12 Schlüsselwörter mit jeweils 3 bis 40 Zeichen vorschlagen. Custom berücksichtigt auch Schlüsselwörter aus deinen eigenen Skills-Ordnern und dem Projekt, da es diese Skills ebenfalls liest.

## Die eigenen Skills von Claude Code und Codex

Claude Code und Codex lesen auch Skills aus eigenen Ordnern: persönliche Skills für alle Arbeitsordner und projekteigene Skills nur im jeweiligen Projekt. Auf der Skills-Seite stehen sie unter **Eigene Skills von Claude Code** und **Eigene Skills von Codex**. Der Filter **Claude Code und Codex** zeigt nur diese. Jede Zeile nennt die Quelle:

- **Dieser Ordner**: Skills aus dem Projektordner, sichtbar im Skills-Tab des Projekts.
- **Dieses Repository**: mit dem Repository gelieferte Codex-Skills.
- **Alle Ordner**: deine eigenen Skills für alle Arbeitsordner.
- **Ein Plugin**: Skills aus einem eigenen Plugin des Agenten; siehe [Die eigenen Plugins von Claude Code und Codex](/guide/plugins#claude-codes-and-codexs-own-plugins).
- **Darin eingebaut**: mit Codex gelieferte Skills.
- **Von einem Administrator festgelegt**: administrativ eingerichtete Codex-Skills.

Für Claude Code listet Einstellungen → Skills deine Skills aus `~/.claude/skills`; für Codex die von Codex für alle Ordner gemeldeten Skills. Der **Skills**-Tab eines Projekts zeigt zusätzlich die dortigen Skills mit projektspezifischen Schaltern. Konnten einzelne nicht gelesen werden, etwa weil Codex nicht antwortet oder eine Datei unlesbar ist, erklärt eine Zeile unter der Liste das Problem.

Schreibe einen mit **Neuer Skill** und wähle unter **Verfügbar für** **Claude Code** oder **Codex** (siehe [Einen eigenen Skill schreiben](#write-a-skill-of-your-own)). Öffne einen, um ihn zu lesen; **Veränderung** öffnet seine SKILL.md in einem Editor: Ändere sie, klicke auf **Speichern**, dann auf **Fertig**. **Ordner unter „Dateien“ öffnen** zeigt den Ordner des Skills mit allen weiteren Dateien darin.

## Frag einen Agenten

- „Welche Bibliotheksskills haben die Agenten wie oft verwendet?“
- „Zeige die ausstehenden Skill-Vorschläge und welche Änderungen sie jeweils enthalten.“
- „Deaktiviere den Skill email für alle Agenten.“
- „Schreibe anhand dieser drei Beispiele einen Skill zur Rechnungsprüfung für alle Agenten.“
- „Erstelle meine eigene Version von research, die immer Seitenzahlen zitiert.“
- „Entferne meinen Skill invoice-checks“ oder „Stelle den gestern entfernten Skill wieder her.“
- „Übernimm die Skills, die ich in anderen Agenten erstellt habe, in meine eigenen Skills. Liste sie vorher auf.“
- „Deaktiviere für Custom das Einbinden von Skills anhand von Schlüsselwörtern.“
- „Schlage beim Start neuer Sitzungen keine Skills mehr vor.“
- „Deaktiviere im Projekt Shop-Website den Claude-Code-Skill deploy und aktiviere docker nur für dieses Projekt.“
