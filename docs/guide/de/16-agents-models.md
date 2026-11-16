# Agenten, Konten und Modelle

Hydor verwendet Claude Code, Codex, den eigenen Agenten Custom für beliebige Modelle und weitere ACP-Agenten wie Gemini CLI, OpenCode, Qwen Code oder Goose. Hier erfährst du die Unterschiede, wie Programme installiert und aktualisiert werden, wie du ein oder mehrere Konten anmeldest und wie Custom Modelle von OpenRouter, Ollama, Hugging Face oder OpenAI-kompatiblen Servern nutzt.

![Agentenauswahl auf der Startseite: Claude Code, Codex oder Custom](images/agents-models.webp)

## Welchen Agenten soll ich verwenden?

Der Agent ist das Programm, das deine Nachricht liest, Tools wie Dateien, Befehle und Web nutzt und antwortet. Das Modell ist die KI dahinter. Alle erhalten App-Funktionen wie Websuche, Browser, Memory, Skills und Verbindungen. Unterschiede bestehen vor allem bei der Modellquelle.

- **Claude Code** von Anthropic nutzt dein Claude-Abo oder ein Anthropic-API-Konto und Modelle wie Opus, Sonnet und Haiku. Die [Nutzungsseite](/usage) zeigt seine Limits.
- **Codex** von OpenAI nutzt dein ChatGPT-Abo und OpenAI-Modelle. Auch seine Limits stehen unter Nutzung. Codex wird mitgeliefert.
- **Custom** nutzt alle unter [Einstellungen → Agenten → Modelle](/settings?s=models) eingerichteten Modelle: OpenRouter, lokale Ollama- oder vLLM-Modelle und OpenAI-kompatible Endpunkte. Geeignet für offene, günstigere oder vollständig lokale Modelle. Siehe [Custom, der eigene Agent der App](/guide/custom).
- **ACP-Agenten** wie Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI und Auggie oder ein eigener Befehl. ACP, das Agent Client Protocol, standardisiert die Verbindung zwischen App und Agentenprogramm. Jeder verwendet seine eigene Anmeldung und Modelle.

Unterstützung in der App:

- Ziele, bei denen der Agent bis zum Erreichen einer Bedingung weiterarbeitet, und Verzweigungen als Kopie ab einer früheren Antwort: Claude Code, Codex und Custom, nicht andere ACP-Agenten.
- **Fortsetzen in…** übergibt Gespräche aus Claude Code oder Codex an den jeweils anderen oder an Custom.
- Denkaufwand: Claude Code und Codex bei geeigneten Modellen.
- Mehrere Konten, Abolimits und Limit-Resets: Claude Code und Codex.

## Agent und Modell für eine neue Sitzung wählen

Unter dem Nachrichtenfeld der Startseite (`/`) bestimmst du, wer arbeitet.

1. **Ausführen mit** zeigt Claude Code mit Claude-Abo oder API-Key, Codex mit ChatGPT-Abo oder API-Key, Custom mit OpenRouter, Ollama oder vLLM sowie deine unter Weitere Agenten hinzugefügten ACP-Programme. **Modelle für Custom** öffnet die Modelleinstellungen, **Agenten hinzufügen oder verwalten** die weiteren Agenten.
2. Wähle unter **Modell** einen Eintrag. **Automatisch** ist zunächst gewählt und startet auf Best, bei nachgewiesen zu schwierigen Problemen auf Max; siehe [Modellstufen nach Aufgabenart](#tiers-a-model-for-each-kind-of-job). Darunter stehen nur Modelle des gewählten Agenten. Sein Standard ist markiert, ältere Versionen sind eingeklappt. Bei mehr als acht Modellen erscheint eine Suche. Enter übernimmt den ersten Treffer. Konnte der Agent seine Modelle nicht liefern, erscheinen seine Fehlermeldung und **Erneut versuchen**.
3. **Optionen** enthält **Denkaufwand** bei unterstützten Agenten und Modellen, etwa Standard, Niedrig, Mittel und Hoch, sowie **Berechtigungen**. Umschalt+Tab wechselt diese ebenfalls.

Die Startseite merkt sich Programm, Modell, Denkaufwand und Berechtigungen pro Projekt, Ordner und **Neuer Aufgabenordner**, geräteübergreifend. Siehe [Was die Startseite speichert](/guide/sessions#what-the-start-page-remembers).

Andere ACP-Agenten als Custom zeigen Modell- und Berechtigungsoptionen erst nach ihrer ersten Sitzung anhand der zuletzt gemeldeten Möglichkeiten.

Mit **Optionen → Vertraulich** wird Custom gewählt. Die Modellliste enthält nur lokale und private Netzwerkmodelle, das beste zuerst; siehe [Eine Sitzung vertraulich halten](/guide/sessions#keep-a-session-confidential).

Mobil öffnen sich Auswahlen vom unteren Bildschirmrand.

## Modelle während einer Sitzung wechseln

Unter dem Nachrichtenfeld stehen Modell, Denkaufwand und Berechtigungen gemeinsam, etwa „Opus 5.5 · Hoch · Planen“. Ein Klick öffnet die drei Auswahlen.

Nach einem Modellwechsel gilt:

- Claude Code wechselt sofort.
- Codex verwendet das Modell ab dem nächsten Durchlauf.
- Custom wechselt ab dem nächsten Schritt, auch im laufenden Durchlauf.
- Andere ACP-Agenten wechseln, sofern sie die Modellauswahl unterstützen.

Die Liste enthält nur Modelle des Sitzungsagenten, bei vertraulichen Sitzungen nur lokale oder private. Zum Agentenwechsel wähle im Sitzungsmenü (⋯) **In Codex fortsetzen**, **In Claude Code fortsetzen** oder **In Custom fortsetzen**. Diese Optionen bestehen aus Claude-Code- und Codex-Sitzungen; Custom erscheint bei vorhandenem Modell. Die nächste Nachricht startet eine neue Sitzung im selben Ordner mit dem bisherigen Gespräch. Gestoppte Sitzungen verwenden beim Fortsetzen ihr letztes Modell, sofern du vorher kein anderes wählst.

## Modellstufen nach Aufgabenart

Agenten wählen Modelle nach Stufen: **Quick** für kleine eindeutige und überprüfbare Aufgaben, **Standard** für klare mittelgroße Arbeit, **Best** für den leitenden Sitzungsagenten mit Planung, Delegation und Prüfung und **Max** für besonders schwierige Probleme. Klare Teilaufgaben können günstigere Modelle übernehmen, während das stärkste Modell plant und prüft.

**Automatisch** startet auf Best. Der leitende Agent übergibt klar begrenzte Teile an Standard- und Quick-Unteragenten. Er kann bei nachweislich schwierigen Problemen auf Max wechseln, etwa nach zwei fehlgeschlagenen Korrekturen, ungeklärter Ursache oder einem anspruchsvollen Beweis. Das Gespräch nennt den Wechsel und seinen Grund. Die Formulierung einer Anfrage allein löst Max nicht aus. Wählst du ein bestimmtes Modell, bleibt der Hauptagent dabei; Unteragenten verwenden weiterhin Stufen. Eigene Agenten können ebenfalls eine feste Stufe nutzen; siehe [Die Modellstufe eines Agenten](/guide/agents#what-an-agent-thinks-with-tiers).

Unter [Einstellungen → Agenten → Modelle → Modellstufen](/settings?s=models&find=Tiers) wählst du Claude Code, Codex oder Custom und pro Stufe Modell sowie bei Claude Code und Codex Denkaufwand. Das (i) erläutert die Stufe. Voreinstellungen für Claude Code sind Haiku, Sonnet, Opus und das neueste Fable; für Codex Luna, Terra, Sol und Astra. Fehlt ein Modell im Tarif, gilt das nächstliegende verfügbare, bei gleichem Modell mit mehr Denkaufwand für höhere Stufen. Custom hat zunächst keine Zuordnung und behält das gewählte Modell, bis du Stufen festlegst. Ein lokales Modell macht Quick gebührenfrei. Unveränderte Stufen folgen der neuesten passenden Modellversion. **Standards wiederherstellen** im Menü **⋯** setzt Zuordnungen zurück.

Unter **Modellstufen in Sitzungen** stehen zwei standardmäßig aktive Schalter:

- **Mit Unteragenten arbeiten** weist den Hauptagenten zu Planung, Delegation an günstigere Stufen und Prüfung an. Ohne vorgegebene Stufe erhalten Unteragenten Standard. Deaktiviert arbeiten Agenten grundsätzlich allein, sofern sie nicht selbst anders entscheiden; die Startseite bietet dann kein Automatisch.
- **Max für schwierige Probleme** erlaubt den Wechsel von Automatisch auf Max bei unzureichendem Best. Deaktiviert bleibt Automatisch auf Best.

## Agentenprogramme werden automatisch installiert

Claude Code, Codex, Gemini CLI und andere sind lokale Programme. Du musst sie nicht manuell installieren.

Unter [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Agent%20programs) zeigt **Agentenprogramme** Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie und Programme mit ACP-Adapter. Jeder Eintrag nennt Sitzungsprogrammversion und Quelle:

- **Eigene Installation**;
- **Von der App installiert** in ihrem eigenen Ordner;
- **Mit der App geliefert**, etwa Codex;
- **Noch nicht vorhanden: wird bei erster Verwendung installiert**. **Installieren** startet sofort.

Bei Updates nennt die Zeile die neue Version. Codex zeigt bei zusätzlicher eigener Installation auch die Terminalversion. Sitzungen verwenden die App-Version, das Terminal deine eigene.

Fehlende Programme werden bei erster Verwendung installiert: Claude Code beim Anmelden oder Sitzungsstart, ACP-Agenten beim Hinzufügen oder ersten Start. Die Installation erfolgt über npm in einem App-Ordner ohne Administratorrechte.

Goose, Kimi CLI und manche anderen Programme installierst du selbst. Weitere Agenten verlinkt ihre Bezugsquellen. Bei ACP-Adaptern werden Adapter und eigentliches Programm gemeinsam eingerichtet und in einer Zeile angezeigt.

## Agentenprogramme aktuell halten

[**Automatisch aktualisieren**](/settings?s=accounts&find=Update%20automatically) als letzter Eintrag unter **Agentenprogramme** ist standardmäßig an. Die App aktualisiert täglich, erstmals etwa zehn Minuten nach ihrem Start.

- App-eigene Kopien werden mit npm aktualisiert. Codex kann so eine neuere Kopie als die mitgelieferte verwenden.
- Eigene Installationen verwenden `claude update`, `codex update` für die Terminalversion oder `opencode upgrade`.
- Mit `npm install -g` global installierte Gemini-CLI-, Qwen-Code-, Auggie- und ACP-Adapter-Programme werden mit npm aktualisiert, sofern Schreibrechte bestehen. Andere Installationswege bleiben deiner eigenen Verwaltung überlassen.
- Claude Code folgt seinem konfigurierten Releasekanal: `"autoUpdatesChannel": "stable"` nutzt stabil, sonst aktuell.
- Ist Claude Codes eigener Updater über `DISABLE_AUTOUPDATER=1` aus, wie im Docker-Image, aktualisiert Hydor deine Claude-Code-Installation ebenfalls nicht automatisch. **Jetzt aktualisieren** funktioniert weiterhin.

Eine neue Version bleibt erst nach einem Funktionstest: Claude Code muss wie beim Sitzungsstart antworten und Modelle nennen, Codex seinen App-Server starten und Modelle liefern, andere Programme starten und ihre Version nennen. Das braucht weder Anmeldung noch Abokontingent. Pro Versuch gilt eine Minute tatsächlicher Wachzeit; Ruhezustand zählt nicht mit. Langsame erste Starts, etwa wegen macOS-Prüfung, erhalten einen zweiten Versuch mit zwei weiteren Minuten. Erst danach wird zurückgesetzt:

- App-eigene und mit npm aktualisierte eigene Kopien kehren zur vorherigen Version zurück.
- Bei eigener Claude-Code-Installation verwenden Sitzungen die vom Installer aufbewahrte frühere Version, während `claude` im Terminal neu bleibt. Die Zeile nennt die fehlgeschlagene Version.
- Dieselbe fehlerhafte Version wird nicht automatisch erneut versucht, die nächste dagegen schon. **Jetzt aktualisieren** kann den Versuch wiederholen.

Darunter stehen letzter Prüfzeitpunkt und **Jetzt prüfen**. Neue Versionen werden gemeinsam über **Jetzt aktualisieren** installiert, ohne einzelnen Knopf je Programm. Währenddessen wird das aktuelle Programm genannt. Ergebnisse zeigen Versionswechsel wie „Claude Code 2.1.308 → 2.1.316“ oder Fehlergründe.

Laufende Sitzungen behalten ihre Startversion, neue verwenden die aktualisierte. Ohne Automatik sucht die App weiterhin täglich, installiert aber erst auf deinen Klick.

## Claude Code und Codex anmelden

Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts), mobil unter Agenten den Abschnitt **Konten**. Der Titel führt zurück. Die Kontogruppe erklärt, dass du mehrere Abos wie Arbeit und Privat anmelden und pro Sitzung wählen kannst. Zuerst steht die Hauptanmeldung je Agent, darunter zusätzliche Konten. Grüne Häkchen zeigen E-Mail, Tarif und Methode, rote Kreuze fehlende Anmeldung oder Fehler.

1. Klicke neben dem Agenten auf **Anmelden**.
2. Wähle bei Claude Code **Claude-Abonnement** oder **Console (API-Abrechnung)**, bei Codex **Gerätecode** oder **Browserweiterleitung**.
3. Klicke auf **Anmeldelink abrufen**.
4. Folge den Schritten:
   - Claude Code: **Anmeldeseite öffnen**, Zugriff im Browser bestätigen, den angezeigten Code einfügen und **Anmeldung abschließen**.
   - Codex mit Gerätecode: Link auf einem beliebigen Gerät öffnen, bei ChatGPT anmelden und Einmalcode eingeben. Der Dialog erkennt den Abschluss automatisch.
   - Codex mit Browserweiterleitung: Nach Anmeldung versucht der Browser vergeblich eine localhost-Seite zu öffnen. Kopiere ihre Adresse, füge sie in Hydor ein und schließe die Anmeldung ab.

Eine Meldung bestätigt den Erfolg. Bei Fehlern nennt der Dialog den Grund; **Erneut versuchen** startet neu.

Danach erlaubt **Konto wechseln** dieselbe Anmeldung mit einem anderen Konto. **Abmelden** im Menü **⋯** meldet das Agentenprogramm auf diesem Computer nach Bestätigung ab, auch für dessen Terminals und Editoren.

Die Willkommenstour unter **Hilfe** führt ebenfalls durch Agentenwahl und Anmeldung.

## Ein zweites Konto für Arbeit oder Privat hinzufügen

Du kannst mehrere Claude-Code- oder Codex-Abos anmelden und pro Sitzung wählen.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts).
2. Klicke neben **Konten** auf **Konto hinzufügen**.
3. Wähle Claude Code oder Codex, einen Namen bis 40 Zeichen wie „Arbeit“ oder „Privat“ und **Hinzufügen und anmelden**.
4. Schließe die Anmeldung im geöffneten Dialog ab.

Jedes Konto hat eine eigene Anmeldung und Sitzungshistorie. Einstellungen, Anweisungen, Skills und Plugins werden mit der Hauptanmeldung geteilt. Bei Claude Code gelten auch deren Ordnervertrauen und ordnerspezifische Berechtigungen. Kontonamen müssen je Agent eindeutig sein.

Zusätzliche Konten zeigen **Anmelden** oder **Konto wechseln** und im Menü **⋯**:

- **Umbenennen** mit neuem Namen.
- **Abmelden** unterbricht die Arbeitsfähigkeit seiner Sitzungen bis zur erneuten Anmeldung.
- **Entfernen** nimmt das Konto und seine Sitzungen aus der App. Die Historie bleibt auf dem Datenträger, außer du wählst zusätzlich das Löschen von Anmeldung und Sitzungsverlauf. Aktive Sitzungen musst du vorher stoppen.

Die [Nutzungsseite](/usage) zeigt pro Konto eine eigene Karte mit Limits.

## Das Konto einer Sitzung wählen

Hat der gewählte Agent zusätzliche Konten, erscheint auf der Startseite unter **Optionen** die Zeile **Konto**:

- **Deine Anmeldung** ist das Hauptkonto des Programms.
- Zusätzliche Konten stehen mit ihrem Namen in der Liste.
- **Konten verwalten** öffnet die Kontoeinstellungen.

Die Auswahl gilt für diesen Agenten unabhängig vom Arbeitsort. Sitzungen zusätzlicher Konten zeigen oben Namen und Personensymbol. Limithinweise betreffen dieses Konto. Die Zuordnung wird beim Start festgelegt und ändert sich nur durch den automatischen Kontowechsel.

## Alle Konten nutzen: bei Limits wechseln

Mit mehreren Konten desselben Agenten kann die App nach ausgeschöpftem Kontingent weiterarbeiten. Unter [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) erscheint nach dem ersten Zusatzkonto **Bei einem Limit das Konto wechseln** in der Gruppe **Bei Nutzungslimits**. Die Funktion ist standardmäßig an, kann für manuelle Auswahl deaktiviert werden und funktioniert ohne offenen Browser.

- Stoppt ein Durchlauf am Limit, wählt die App das am wenigsten verbrauchte angemeldete Konto desselben Agenten mit Restkontingent. Die gesamte Sitzung wird mit Historie übertragen und erhält eine Fortsetzungsnachricht mit Begründung. Ein Hinweis nennt das neue Konto.
- Haupt- und Zusatzkonten zählen gleichermaßen. Claude Code wechselt nur zu Claude Code, Codex nur zu Codex.
- Codex-Ziele wechseln mit und laufen weiter.
- Sind alle Konten ausgeschöpft, erfolgt kein Wechsel, außer die unten beschriebene API-Nutzung ist aktiv. Mit automatischer Fortsetzung nach Limits geht es beim zuerst zurückgesetzten Konto weiter; siehe [Nutzung, Limits und Kosten](/guide/usage#continue-sessions-automatically-after-a-limit).
- Neue Sitzungen überspringen ausgeschöpfte Konten. Auch vor dem Senden an eine bestehende Sitzung wird gegebenenfalls gewechselt, damit die Nachricht nicht am Limit scheitert.
- In VS Code oder Terminals geöffnete Sitzungen bleiben auf ihrem Konto.
- Kleine App-Anfragen über das automatische Hilfsmodell, schnelle Modellschritte in Apps, Pull-Request-Beschreibungen oder Befehlsvorschläge wechseln ebenfalls bei ausgeschöpftem oder abgemeldetem Konto.

## API-Guthaben nutzen, wenn alle Konten ausgeschöpft sind

Mit einem Anthropic-API-Key von [console.anthropic.com](https://console.anthropic.com) → API keys können Claude-Code-Sitzungen nach Ausschöpfung aller Abos kostenpflichtig weiterarbeiten. Diese Nutzung wird zu API-Preisen berechnet und ist nicht im Abo enthalten.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). Wähle bei Haupt- oder Zusatzkonto von Claude Code **⋯ → API-Key hinzufügen…**.
2. Füge den **Anthropic-API-Key** ein und speichere. Die App prüft ihn und speichert ihn lokal verschlüsselt. Das Konto trägt danach **API-Guthaben**. **API-Key ändern…** ersetzt, **API-Key entfernen** löscht ihn.
3. Aktiviere **Bei einem Limit API-Guthaben verwenden** unter **Bei Nutzungslimits**. Die Funktion ist zunächst aus und erscheint bei vorhandener Claude-Code-Anmeldung oder Zusatzkonto.

Danach gilt:

- Zuerst versucht die App den Wechsel zu einem Konto mit Restkontingent. Erst wenn keines verfügbar ist und die API-Option aktiv ist, wird API-Abrechnung verwendet.
- Die Sitzung bleibt mit ihrer Historie auf ihrem Konto. Fehlt dort ein Key, darf der eines anderen Claude-Code-Kontos verwendet werden.
- Oben erscheint **API-Guthaben** neben dem Konto. Der Infotext erklärt den Grund.
- Sobald wieder Abokontingent verfügbar ist, wechselt die Sitzung nach dem nächsten Durchlauf zurück, zum eigenen oder einem anderen freien Konto.
- Kann die App den Kontoverbrauch nicht lesen, wechselt sie niemals vorsorglich zur kostenpflichtigen API.
- Codex bleibt davon unberührt; diese API-Option gilt dort nicht.

## Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen

Öffne [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Deine Agenten** zeigt zuerst Custom und dann hinzugefügte Programme mit installiertem oder fehlendem Zustand.
- **Agenten mit ACP-Unterstützung** zeigt bekannte noch nicht hinzugefügte Programme wie Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI und Auggie. Installierte stehen zuerst; fehlende nennen die Bezugsquelle. **Alle anzeigen** erweitert die zunächst kurze Liste.

Zum Hinzufügen:

1. Klicke rechts auf **Hinzufügen**, bei installierten Programmen hervorgehoben.
2. Bekannte Installationen von Gemini CLI, OpenCode, Qwen Code, Auggie und ACP-Adaptern erledigt die App im Hintergrund. Goose, Kimi CLI und andere installierst du mit dem genannten Befehl oder Link selbst.
3. Melde dich einmal im eigenen Agentenprogramm an: Öffne das [Terminal](/terminal), starte etwa `gemini` und folge der Anmeldung. Ohne diesen Schritt erklärt die Sitzung, welches Programm du zur Anmeldung ausführen sollst.

Danach erscheint der Agent unter **Ausführen mit** auf der Startseite.

**Bearbeiten** ändert ihn; **⋯ → Entfernen** fragt nach und nimmt ihn heraus. Seine Sitzungen bleiben sichtbar, benötigen zum Fortsetzen aber eine erneute Einrichtung. Custom ist eingebaut und bietet stattdessen **Modelle** mit Hinweis auf OpenRouter, Ollama und vLLM.

### Ein eigenes Agentenprogramm hinzufügen

Jedes ACP-fähige Programm kann eingebunden werden:

1. Klicke neben **Deine Agenten** auf **Eigenen hinzufügen**.
2. Trage ein:
   - **Name** für Listen, etwa „Gemini CLI“.
   - **Befehl** oder vollständigen Programmpfad, etwa `gemini`.
   - **Argumente** zum ACP-Start, etwa `--experimental-acp`.
   - Optionale **Umgebung** mit NAME=value je Zeile für benötigte Einstellungen wie API-Key-Variablen.
3. Klicke auf **Speichern**.

Der Befehl muss ACP-Kommunikation über Standardeingabe und Standardausgabe starten.

### Agenten im eigenen Programm einrichten

Bei manuell einzurichtenden Agenten gibt es Unterschiede:

- Die Zeile unter **Weitere Agenten** nennt Installationsbefehl oder Adresse. Hydor führt keine Installationsskripte aus dem Web für dich aus. Verwende das [Terminal](/terminal) oder die genannte Methode.
- Anmeldung und gegebenenfalls Modellauswahl erfolgen einmal im eigenen Programm. Danach startet Hydor es. Eigene Sitzungen und Memory bleiben in dessen Ordnern; die Freigabekarten entsprechen dem Agenten.
- Benötigt ein Agent ein eigenes Gateway, richte es zuerst mit seinem Einrichtungsbefehl ein und lasse es laufen.
- Fehlende native ACP-Unterstützung wird durch einen Adapter ergänzt. Die App installiert Adapter und Programm mit npm ohne Installationsskripte in ihrem eigenen Ordner. Vorhandene eigene Installationen auf PATH haben Vorrang.
- Ohne MCP-Unterstützung erhält ein Agent nur seine eigenen Tools. Die Sitzung weist darauf hin. App-Richtlinien, Memory-Notizen und Skills kommen dennoch mit der ersten Nachricht.

### Möglichkeiten und Grenzen von ACP-Agenten

Die App startet im gewählten Ordner, zeigt Nachrichten und Schritte und reicht Berechtigungsfragen weiter. Unterschiede:

- Jeweils eine Nachricht wird bearbeitet. Weitere warten bis zum Durchlaufende in der Warteschlange. Das gilt auch für Custom.
- Kann ein Agent alte Sitzungen nicht wieder öffnen, beginnt die Fortsetzung ohne früheren Gesprächskontext. Die Sitzung erklärt das.
- Bildanhänge kommen nur bei Bildunterstützung an.
- Ziele, Verzweigungen und Übergaben fehlen bei anderen ACP-Agenten; Custom unterstützt Ziele und Verzweigungen.
- App-Tools wie Seiten, Suche und Memory werden als MCP-Server über Adresse oder ein kleines lokales Hilfsprogramm bereitgestellt. Unterstützt der Agent beides nicht, bleiben nur seine eigenen Tools sowie Richtlinien, Memory-Notizen und Skills.

## Woher Customs Modelle stammen

Custom verwendet alle unter [Einstellungen → Agenten → Modelle](/settings?s=models) eingerichteten Modelle mit denselben Tools, Skills und MCP-Servern. Wähle auf der Startseite Custom und danach das Modell. Die Einstellungen enthalten:

- **Hilfsmodell** für kleine App-Aufgaben.
- **Auf diesem Rechner** mit Hardware und lokalen Modellen.
- **Modell von Hugging Face hinzufügen** zum Suchen, Prüfen und Installieren offener Modelle.
- **OpenRouter** mit Key, hinzugefügten Modellen und Modellsuche.
- **Laufzeitumgebungen und Endpunkte** für Ollama, vLLM, andere OpenAI-kompatible Server und einen Hugging-Face-Token.

Der Infotext jedes Modells nennt Ausführungsort und Kontextgröße, etwa „OpenRouter · 128K Kontext“ oder „vLLM, auf diesem Rechner · 32K Kontext · startet bei Verwendung“. Listen aktualisieren sich minütlich.

## Das Hilfsmodell wählen

Das Hilfsmodell bearbeitet kleine Aufgaben außerhalb von Gesprächen:

- neue Sitzungen anhand deiner Anfrage benennen;
- Customs Auto-Schritte und Ziele nach Durchläufen prüfen;
- Memory etwa täglich aufräumen, aus neuen Gesprächen lernen und Notizen für den Startindex benennen;
- eine Frage zur geöffneten Browserseite beantworten;
- Bilder für Custom-Modelle ohne Bildverarbeitung beschreiben;
- lange Antworten von Hydor-Unteragenten zusammenfassen;
- Apps oder geplante Aufgaben aus Sitzungen entwerfen;
- Freisprechmodus.

Öffne unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model) die Auswahl **Modell** in **Hilfsmodell**. Das (i) nennt die Aufgaben.

- **Automatisch** ist der Standard: Claude Haiku über Claude Code, ersatzweise Codex. Bei aktivem Kontowechsel wird zuerst ein weiteres angemeldetes Konto versucht. Antwortet keines, nennt die Fehlermeldung alle Ursachen, etwa Wochenlimit oder ein im Tarif fehlendes Modell.
- Alternativ ein Custom-Modell mit Quelle und Kennzeichnung für Bildunterstützung.

Automatisch kann keine Bilder sehen. Für ein Custom-Modell ohne Bildverarbeitung brauchst du daher ein bildfähiges Hilfsmodell.

## Was auf diesem Computer läuft

Unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=On%20this%20machine) beginnt **Auf diesem Rechner** mit:

- **Grafik**: GPUs und Speicher, bei Apple Silicon der Chip wie Apple M3 Max mit gemeinsamem Arbeitsspeicher oder „Keine GPU“ für CPU-Ausführung.
- **Arbeitsspeicher und Datenträger**: gesamter und freier RAM, freier Plattenplatz und Modellbelegung.
- **Laufzeit**: installierte Ollama- und vLLM-Versionen oder Installationslinks.
- Bei GPU die passende Modellgröße, etwa 30 Milliarden Parameter in 4-Bit auf einer GPU, auf dem Mac etwa 40 Milliarden. Parameter beschreiben die Modellgröße; 4-Bit ist eine verbreitete Komprimierung mit ungefähr einem Viertel des Speicherbedarfs.

Darunter stehen:

- **Laufende Downloads** mit Fortschritt, Datenmenge und Laufzeitumgebung. **Abbrechen** stoppt sie; Fehler oder Abbruch zeigen Grund und **Ausblenden**.
- **Installierte Modelle**, zunächst einige und dann **Alle anzeigen**, mit Laufzeit, Größe, Komprimierung, Bildunterstützung und Laufzustand.
  - vLLM bietet **Starten** und **Stoppen**. Bei erster Sitzungsnutzung startet es automatisch, zunächst nach ein bis zwei Minuten, auf der GPU mit dem meisten freien Speicher. Passt es unkomprimiert nicht, wird 8-Bit verwendet; reicht eine GPU nicht, wird auf 2, 4 oder 8 verteilt. Der Zustand nennt beteiligte GPUs. Apple-Silicon-Macs nutzen ihren Chip. Das Modell bleibt auch nach App-Neustarts aktiv, bis du es stoppst. Startfehler stehen darunter.
  - **Entfernen** im Menü **⋯** löscht nach Bestätigung lokale Modelldateien. Erneute Installation bleibt möglich.

Ohne Modelle erscheint der Hinweis, eines von Hugging Face hinzuzufügen.

## Ein Modell von Hugging Face hinzufügen

Hugging Face ist eine zentrale Quelle offener Modelle. [Modell von Hugging Face hinzufügen](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) schlägt passende Modelle vor, durchsucht den Bestand und erklärt vor dem Download, wie ein Modell hier laufen würde.

### Vorschläge für diesen Computer

Vor einer Suche erscheinen anhand der vorhandenen Hardware geeignete Modellvorschläge:

- **LFM3-VL 2B** von Liquid AI: klein, schnell und bildfähig, für fast jeden Computer.
- **Gemma 4 12B** von Google: vielseitig und bildfähig, für gute Grafikkarten.
- **Flint** von Recursive: für Programmieragenten auf Apple-Silicon-Macs mit mindestens 32 GB.
- **GLM-5.3 Flash** von Z.ai: leistungsstarkes offenes Modell für Server mit mehreren großen GPUs.

Jeder Vorschlag nennt Geschwindigkeitseinschätzung, Laufzeit und Verteilung, Downloadgröße und **Installieren**. **Beste Wahl hier** markiert das stärkste gut laufende Modell. Standard ist vLLM. Ohne NVIDIA-GPU und Apple Silicon wird beim kleinen Modell die Ollama-Variante angeboten. Fehlende Laufzeitumgebungen werden gemeldet; siehe [Ollama, vLLM oder andere Endpunkte verbinden](#connect-ollama-vllm-or-another-endpoint). Eine Zeile wie **2 weitere für größere Computer** zeigt weitere Modelle und Anforderungen. Die Willkommenstour verwendet dieselben Vorschläge.

### Suchen und filtern

1. Gib unter **Hugging Face durchsuchen oder org/name einfügen** einen Namen wie `qwen3`, einen vollständigen Modellnamen oder eine huggingface.co-Adresse ein. Vorher erscheinen Vorschläge und **Die meistgeladenen anzeigen**.
2. Kombiniere Filter:
   - **Läuft hier gut** für geeignete Modelle.
   - **GGUF · Ollama** für GGUF-Dateien.
   - **vLLM** für safetensors-Modelle auf GPU.
   - **Verarbeitet Bilder** für bildfähige Modelle.
3. Sortiere nach **Meiste Downloads**, **Im Trend**, **Am beliebtesten** oder **Neueste**.

Bis zu 40 Treffer werden geladen, zunächst acht sichtbar und weitere über **Alle anzeigen**. Ein vollständig angegebenes Modell steht zuerst, auch ohne Suchtreffer. Enter prüft es direkt.

Jede Zeile nennt Anbieter, Modell, GGUF- oder vLLM-Format, Bildunterstützung, nötige Freigabe als **Zugriff beschränkt**, Parameterzahl, Downloads der letzten 30 Tage, Likes und letzte Änderung.

### Die erste Einschätzung

Ein farbiger Hinweis schätzt anhand der Größe:

- **Läuft gut mit vLLM** oder **Läuft gut mit Ollama**, mit ungefährer Geschwindigkeit wie 40 Token/s, also Wortbestandteile pro Sekunde: Das Modell passt in den Grafikspeicher.
- **Auf der CPU, langsam** oder **sehr langsam**: Es passt nur in den Arbeitsspeicher. Das unterstützt hier nur Ollama.
- **Zu groß für diesen Computer**: Modell oder Download passen nicht in den verfügbaren Speicher.
- **Mit Ollama in 4-Bit: läuft gut…**: Die gespeicherte Variante ist zu groß, eine komprimierte Version passt.

Beim Darüberfahren siehst du die zugrunde liegenden Zahlen.

### Vor dem Download prüfen

**Prüfen** öffnet Modellgröße, Kontext, Bildunterstützung und genaue Möglichkeiten:

- Bei GGUF **Läuft mit Ollama** und verfügbare Dateigrößen, kleinste zuerst. Kleinere Varianten sparen Speicher und Zeit bei etwas weniger Qualität. Jede Zeile nennt Eignung, Speicherbedarf, Geschwindigkeit, Downloadgröße und **Installieren**. Ohne laufendes Ollama oder bei zu großen Varianten ist die Aktion deaktiviert.
- Bei vLLM die GPU-Ausführung bei erster Nutzung, dieselben Kennzahlen, GPU-Auswahl und **Herunterladen**. Fehlt vLLM oder Modellunterstützung, erscheint ein Hinweis und gegebenenfalls eine alternative GGUF-Prüfung.
- Bei anderen Formaten der Hinweis, dass ausführbare Gewichte in safetensors oder GGUF fehlen.

Die Schätzung berücksichtigt etwa 32.000 Kontexttoken für lokale Modelle. **Schließen** klappt die Details ein.

### Installieren und anschließend verwenden

**Installieren** für Ollama oder **Herunterladen** für vLLM zeigt den Fortschritt unter **Auf diesem Rechner**. Danach erscheint das Modell in Customs Auswahl. Unterbrochene vLLM-Downloads setzen beim nächsten Versuch fort. Zu große vLLM-Modelle werden beim Start in 8-Bit-FP8 gespeichert, was den Gewichtsspeicher bei geringem Qualitätsverlust halbiert, unterstützt ab NVIDIA RTX 30 und A100. Reicht das nicht, werden sie bei insgesamt genügend Speicher auf mehrere GPUs verteilt.

### Zugriffsbeschränkte und private Modelle

Bei **Zugriff beschränkt** musst du zuerst die Bedingungen auf huggingface.co akzeptieren und einen [Hugging-Face-Token](#hugging-face-token) hinterlegen. Auch private Modelle benötigen einen Token.

## Modelle über OpenRouter nutzen

OpenRouter unter openrouter.ai bietet Hunderte Modelle vieler Anbieter über einen Key mit verbrauchsabhängiger Abrechnung.

### Deinen Key hinzufügen

1. Erstelle einen Key auf openrouter.ai über den Link im Abschnitt.
2. Wähle unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=OpenRouter) in **Dein OpenRouter-Key** **Key hinzufügen**, füge den mit sk-or- beginnenden Wert ein und speichere.

Danach steht dort **Mit OpenRouter verbunden** mit Anfang und Ende des Keys. **Key entfernen** im Menü **⋯** löscht ihn. Der vollständige Wert bleibt auf dem Server verborgen.

Auch beim ersten Bedarf ist die Eingabe möglich: Für Bilder, Zeichnungen, Videos oder Ton erscheint im Gespräch eine sichere Karte; siehe [Wenn ein Agent den OpenRouter-Key benötigt](/guide/documents-voice#when-an-agent-needs-the-openrouter-key). KI-Editorwerkzeuge fragen im eigenen Dialog. Beide Wege speichern ihn hier.

### Vorgeschlagene Modelle

Vor der Suche zeigt **Vorgeschlagen** unter **OpenRouter-Modelle hinzufügen** vier Custom-Modelle mit Begründung: **GPT-6 Luna** für schnell und günstig, **Grok 4.7** mit weniger Ablehnungen, **GPT-6.1 Sol** für höhere Qualität und **Claude Opus 5.5** als stärkste allgemeine Wahl. **Hinzufügen** übernimmt sie in die Auswahl. Für Medien verwendet die App Seedream 5.0 Pro und das schnellere günstigere Flash, Lyria 3 Pro, Seed Audio 1.0 und Seedance 2.5; siehe [Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images).

### Den Katalog durchsuchen

Suche nach Namen wie deepseek, qwen oder claude, wähle einen Vorschlag oder **Neueste anzeigen**. Filter:

- **Tool-Aufrufe** für native Tool-Unterstützung, bei bester Übereinstimmung bevorzugt;
- **Verarbeitet Bilder**;
- **Reasoning** für Modelle mit zusätzlichem Denkprozess;
- **Kostenlos**.

Sortiert wird nach bester Namensübereinstimmung, neuesten oder günstigsten Modellen oder längstem Kontext. Bis zu 50 Treffer werden geladen, zunächst acht sichtbar und weitere über **Alle anzeigen**.

Jeder Treffer nennt Anbieter, Name und Kennzeichnungen: **Aktuellste Version**, **Neu** für die letzten drei Wochen, **Kostenlos**, **Reasoning**, **Bilder** oder **Keine nativen Tools**. Ohne native Tools beschreibt Custom sie in Anweisungen und liest Aufrufe aus Text. Hinzu kommen Kontextgröße wie „128K Kontext“, maximale Antwortlänge wie „16K Ausgabe“, Ein- und Ausgabepreis pro Million Token, Listungsmonat, Kurzbeschreibung und OpenRouter-Kennung.

### Modelle zur Auswahl hinzufügen

**Hinzufügen** markiert das Modell als hinzugefügt und listet es unter **Deine OpenRouter-Modelle** sowie in Customs Modellauswahl. × entfernt es wieder. Mindestens ein Modell muss hinzugefügt werden, bevor OpenRouter-Modelle auswählbar sind.

## Ollama, vLLM oder andere Endpunkte verbinden

Unter **Laufzeitumgebungen und Endpunkte** in [Einstellungen → Agenten → Modelle](/settings?s=models&find=Runtimes%20and%20endpoints) verbindest du Modellserver.

### Ollama

Ollama ist kostenlos und führt Modelle auf GPU oder CPU aus. Die Zeile zeigt Version und Laufzustand oder fehlende Erreichbarkeit mit **Ollama installieren**. Standardadresse ist `http://127.0.0.1:11434`. Nach einer Adressänderung erscheint **Speichern**. Alle Modelle dieses Servers, auch außerhalb von Hydor geladene, stehen Custom zur Verfügung.

### vLLM

vLLM führt Modelle schnell auf NVIDIA-GPUs aus und ist hier Standard für Hugging-Face-Modelle. Große Modelle laufen in 8-Bit oder auf 2, 4 oder 8 GPUs. Auf Apple Silicon nutzt vLLM das Metal-Plugin vllm-metal. Die App sucht auf PATH und in conda- oder venv-Umgebungen und nennt Fundort und Version. Falls nicht gefunden, installiere vLLM mit `pip install vllm` oder trage den vollständigen Pfad zum `vllm`-Befehl ein und speichere. Ein leeres Feld aktiviert die automatische Suche.

### Andere OpenAI-kompatible Endpunkte

LM Studio, llama.cpp-Server und andere Anbieter unterstützen das OpenAI-API-Format:

1. Klicke neben der Gruppenüberschrift auf **Endpunkt hinzufügen**.
2. Gib Namen, Adresse wie `http://localhost:1234/v1` und optional einen **Key** ein.
3. Klicke auf **Hinzufügen**.

Die Zeile zeigt Adresse und Modellanzahl. Modelle erscheinen bei Custom als „Modell (Name)“. × entfernt den Endpunkt. Ein gleicher Name ersetzt einen vorhandenen Eintrag.

[Vertrauliche Sitzungen](/guide/sessions#keep-a-session-confidential) dürfen lokale und private Netzwerkadressen nutzen: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` bis `172.31.…` und Namen mit `.local`. Andere Adressen gelten als online, auch bei deinem eigenen Server. Nutze dann seine private Adresse. Das gilt auch für Ollama; Cloudmodelle mit „cloud“ am Namensende gelten immer als online.

### Hugging-Face-Token

Ein [Hugging-Face-Token](/settings?s=models&find=Hugging%20Face%20token) erlaubt den Download privater oder zugriffsbeschränkter Modelle. Erstelle ihn in deinem Hugging-Face-Konto, wähle **Token hinzufügen**, füge den mit `hf_` beginnenden Wert ein und speichere. Danach erscheinen nur Anfang und Ende. **Token entfernen** steht im Menü **⋯**.

## Frag einen Agenten

- „Welche Agentenprogramme sind installiert? Installiere Gemini CLI.“
- „Sind Claude Code und Codex aktuell? Aktualisiere sie jetzt.“
- „Füge OpenCode hinzu.“
- „Füge Gemini CLI und Goose hinzu und sage mir, was ich noch selbst installieren muss.“
- „Finde ein bildfähiges Hugging-Face-Modell, das hier gut läuft. Prüfe und installiere die passende Größe.“
- „Füge das neueste DeepSeek-Modell von OpenRouter hinzu.“ Voraussetzung ist dein OpenRouter-Key.
- „Wähle ein bildfähiges Hilfsmodell.“
- „Stoppe das laufende vLLM-Modell, um Grafikspeicher freizugeben.“
- „Nutze alle Claude-Konten und wechsle bei einem Limit zum nächsten.“
- „Verwende mein API-Guthaben, wenn alle Claude-Abos aufgebraucht sind.“
- „Welche Modelle verwenden die Stufen für Claude Code und Codex? Setze Max für Claude Code auf Opus.“
