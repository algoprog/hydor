# Agenten, Konten und Modelle

Hydor verwendet Claude Code, Codex, den eigenen Agenten Custom für beliebige Modelle und weitere ACP-Agenten wie Gemini CLI, OpenCode, Qwen Code, Goose oder Grok Build. Hier erfährst du die Unterschiede, wie Programme installiert und aktualisiert werden, wie du ein oder mehrere Konten anmeldest und wie Custom Modelle von OpenRouter, Ollama, Hugging Face oder OpenAI-kompatiblen Servern nutzt.

![Agentenauswahl auf der Startseite: Claude Code, Codex oder Custom](images/agents-models.webp)

## Welchen Agenten soll ich verwenden?

Der Agent ist das Programm, das deine Nachricht liest, Tools wie Dateien, Befehle und Web nutzt und antwortet. Das Modell ist die KI dahinter. Alle erhalten App-Funktionen wie Websuche, Browser, Memory, Skills und Verbindungen. Unterschiede bestehen vor allem bei der Modellquelle.

- **Claude Code** (Anthropic). Läuft mit deinem Claude-Abo oder rechnet über ein Anthropic-API-Konto ab. Seine Modelle sind die von Anthropic (Opus, Sonnet, Haiku). Es hat eigene Nutzungslimits, die die [Nutzungsseite](/usage) zeigt.
- **Codex** von OpenAI nutzt dein ChatGPT-Abo und OpenAI-Modelle. Auch seine Limits stehen unter Nutzung. Codex wird mitgeliefert.
- **Custom** nutzt alle unter [Einstellungen → Agenten → Modelle](/settings?s=models) eingerichteten Modelle: OpenRouter, lokale Ollama- oder vLLM-Modelle und OpenAI-kompatible Endpunkte. Geeignet für offene, günstigere oder vollständig lokale Modelle. Siehe [Custom, der eigene Agent der App](/guide/custom).
- **Agenten mit ACP-Unterstützung** wie Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie und Grok Build (der Coding-Agent von xAI, mit seinen Grok-Modellen) oder ein eigener Befehl. ACP, das Agent Client Protocol, standardisiert die Verbindung zwischen App und Agentenprogramm. Jeder verwendet seine eigene Anmeldung und Modelle.

Unterstützung in der App:

- Ziele (der Agent arbeitet weiter, bis eine Bedingung erfüllt ist) und Verzweigungen (eine Kopie der Sitzung ab einer früheren Antwort): Claude Code, Codex und Custom. Nicht die anderen ACP-Agenten.
- **Fortsetzen in…** (die Unterhaltung an einen anderen Agenten übergeben): von Claude Code oder Codex aus an den jeweils anderen oder an Custom.
- Aufwand (wie intensiv das Modell nachdenkt): Claude Code, Codex und Grok Build sowie jeder andere ACP-Agent, dessen Modelle ihn anbieten.
- Denkaufwand: Claude Code und Codex bei geeigneten Modellen.
- Mehrere Konten, Abolimits und der Kontowechsel bei einem Limit: Claude Code, Codex und Grok Build.
- Limit-Resets und API-Guthaben bei einem Limit: nur Claude Code und Codex.

## Agent und Modell für eine neue Sitzung wählen

Unter dem Nachrichtenfeld der Startseite (`/`) bestimmst du, wer arbeitet.

1. Klicke auf **Ausführungsumgebung**. Die Liste zeigt **Claude Code** („Anthropic · Claude-Abo oder API-Key“), **Codex** („OpenAI · ChatGPT-Abo oder API-Key“), **Custom** („Beliebiges Modell: OpenRouter, Ollama, vLLM“) und jeden Agenten, den du unter Einstellungen → Weitere Agenten hinzugefügt hast („ACP-Agent · “ und sein Befehl). Ganz unten öffnet **Modelle für Custom** Einstellungen → Modelle, und **Agenten hinzufügen oder verwalten** öffnet Einstellungen → Weitere Agenten.
2. Klicke auf **Modell** und wähle eines. **Automatisch**, ganz oben und zu Beginn gewählt, lässt die Leistungsstufen entscheiden: Am besten und Max, wenn sich das Problem als zu schwer erweist (siehe [Modellstufen nach Aufgabenart](#tiers-a-model-for-each-kind-of-job)). Darunter zeigt die Liste nur die eigenen Modelle dieses Agenten. Der Standard des Agenten ist mit „Standard“ markiert. Ältere Versionen eines Modells warten hinter einer Zeile wie „2 ältere Modelle“; klicke darauf, um sie zu sehen. Bei mehr als acht Modellen steht oben ein Feld **Modelle suchen**: Tippe ein paar Buchstaben und drücke Enter, um den ersten Treffer zu übernehmen. Wenn der Agent nicht so gestartet ist, wie die App es für seine Modelle verlangt hat, sagt das Menü es mit den eigenen Worten des Agenten zum Grund, und **Erneut versuchen** fragt noch einmal.
3. Unter **Optionen** findest du **Aufwand** (bei Agenten und Modellen, die ihn haben: Standard, Niedrig, Mittel, Hoch und so weiter; zu Grok Build siehe [Aufwand bei Grok Build](#effort-for-grok-build)) und **Berechtigungen** (was der Agent tun darf, ohne dich zu fragen). Umschalt+Tab im Nachrichtenfeld wechselt ebenfalls die Berechtigungen.

Die Startseite merkt sich, was du für jeden Ort, an dem du arbeitest, gewählt hast (jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**), auf jedem Gerät: Modell, Aufwand und Berechtigungen jedes Programms kehren dort so zurück, wie du sie verlassen hast (siehe [Was die Startseite speichert](/guide/sessions#what-the-start-page-remembers)).

Ein anderer ACP-Agent als Custom zeigt seine Auswahl für **Modell** und **Berechtigungen** erst nach seiner ersten Sitzung: Sie listet, was der Agent bei seinem letzten Lauf angeboten hat. Grok Build ist die Ausnahme: Seine Modelle mit den Aufwandsstufen, die jedes anbietet, erscheinen schon nach dem Hinzufügen, weil die App Grok danach fragt.

Ist **Optionen** → **Vertraulich** eingeschaltet, ist **Ausführungsumgebung** auf **Custom**, und **Modell** listet nur die Modelle auf diesem Computer oder in deinem privaten Netzwerk, die besten davon zuerst gewählt: siehe [Eine Sitzung vertraulich halten](/guide/sessions#keep-a-session-confidential).

Auf einem Handy öffnet sich jedes dieser Menüs als Fenster vom unteren Bildschirmrand.

## Modelle während einer Sitzung wechseln

In einer Sitzung stehen Modell, Aufwand und Berechtigungen unter dem Nachrichtenfeld. Sie sind ein einziger Chip, der etwa „Opus 5.5 · Hoch · Plan“ lautet: Klicke darauf für **Modell**, **Aufwand** und **Berechtigungen**.

Nach einem Modellwechsel gilt:

- Claude Code wechselt sofort.
- Codex verwendet das Modell ab dem nächsten Durchlauf.
- Custom wechselt ab dem nächsten Schritt, auch im laufenden Durchlauf.
- Andere ACP-Agenten wechseln, sofern sie die Modellauswahl unterstützen.

Mit dem **Aufwand** der Sitzung ist es genauso: Wähle einen, und der laufende Agent nutzt ihn ab dem nächsten Durchlauf. Bietet das Modell, zu dem du wechselst, den bisherigen Aufwand nicht an, zeigt die Auswahl den Standard dieses Modells, und das Modell läuft damit.

Die Liste enthält nur Modelle des Sitzungsagenten, bei vertraulichen Sitzungen nur lokale oder private. Zum Agentenwechsel wähle im Sitzungsmenü (⋯) **In Codex fortsetzen**, **In Claude Code fortsetzen** oder **In Custom fortsetzen**. Diese Optionen bestehen aus Claude-Code- und Codex-Sitzungen; Custom erscheint bei vorhandenem Modell. Die nächste Nachricht startet eine neue Sitzung im selben Ordner mit der bisherigen Unterhaltung. Gestoppte Sitzungen verwenden beim Fortsetzen ihr letztes Modell, sofern du vorher kein anderes wählst.

## Aufwand bei Grok Build

Die Modelle von Grok nehmen einen Denkaufwand an, dieselbe Wahl, die dir Claude Code und Codex bieten:

- Grok 4.6 (und neuere Modelle, die dieselben anbieten): **xhigh**, **high**, **medium** oder **low**. **High** ist der Standard.
- Grok 4.5: **high**, **medium** oder **low**.

Wähle auf der Startseite unter **Ausführungsumgebung** **Grok Build** und dann **Optionen** → **Aufwand**: Dort stehen die Aufwandsstufen des gewählten Modells, dazu **Standard**. Sie erscheinen schon, sobald Grok Build hinzugefügt ist, auch vor der ersten Sitzung. Eine laufende Grok-Build-Sitzung ändert ihren Aufwand in ihrer eigenen **Aufwand**-Auswahl (dem Chip unter dem Nachrichtenfeld), und auch ein Lauf einer [App](/guide/apps) nimmt einen an. Wechselst du in einer Sitzung zu einem Modell, das den bisherigen Aufwand nicht anbietet (xhigh bei Grok 4.5), zeigt die Auswahl den Standard dieses Modells, und das Modell läuft damit.

Das gibt es nicht nur für Grok: Jeder andere ACP-Agent, dessen Modelle Aufwandsstufen anbieten, bekommt dieselbe **Aufwand**-Auswahl.

## Modellstufen nach Aufgabenart

Agenten wählen Modelle nach Leistungsstufe statt nach Namen: **Schnell** für kleine, sehr klare Aufgaben, deren Ergebnis sich prüfen lässt, **Standard** für klare Aufgaben mittlerer Größe, **Am besten** für den Hauptagenten einer Sitzung, der plant, Subagenten leitet und ihre Arbeit prüft, und **Max** für die schwersten Probleme. Der größte Teil einer Arbeit besteht aus klaren Teilen, die ein günstigeres Modell gut erledigt, deshalb kostet eine Sitzung so weniger, ohne dass das Ergebnis schlechter wird: Das stärkste Modell im Raum plant die Arbeit trotzdem und prüft sie.

Auf der Startseite steht **Modell** auf **Automatisch**: Die Sitzung startet auf der Stufe Am besten. Ihr Hauptagent gibt klare Teile an Subagenten auf Standard und Schnell ab und kann sich selbst auf Max verschieben, wenn sich ein Problem als schwerer erweist, als Am besten bewältigen kann (eine Korrektur, die zweimal fehlgeschlagen ist, eine Ursache, die er nicht findet, ein Beweis); eine Zeile in der Unterhaltung sagt das, mit dem Grund. Eine Anfrage geht nicht allein wegen ihres Wortlauts an Max: Am besten löst das meiste, was schwer klingt, für weniger. Wähle stattdessen ein Modell nach Namen, dann denkt die Sitzung mit diesem; ihre Subagenten bekommen weiterhin Leistungsstufen. Ein Agent von dir kann stattdessen mit einer Stufe denken (siehe [Die Modellstufe eines Agenten](/guide/agents#what-an-agent-thinks-with-tiers)).

[Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) sagt, was jede Stufe für jedes Programm bedeutet: eine Zeile für jede Stufe, mit einem Schalter neben dem Titel der Gruppe, um das Programm zu wählen (**Claude Code**, **Codex** oder **Custom**), und in jeder Zeile ein Modell und, bei Claude Code und Codex, einen Aufwand. Zu Beginn ist bei Claude Code Schnell gleich Haiku, Standard gleich Sonnet, Am besten gleich Opus und Max das neueste Fable; bei Codex ist Schnell gleich Luna, Standard gleich Terra, Am besten gleich Sol und Max gleich Astra (in einem Abo ohne eines davon das nächstliegende, das es anbietet, mit mehr Aufwand für die höhere Stufe, wo sich zwei ein Modell teilen); Custom hat keine, deshalb behalten seine Sitzungen das Modell, das sie gewählt haben, bis du eines deiner Custom-Modelle wählst (ein Modell auf diesem Computer macht Schnell kostenlos). Eine Stufe, die du nicht änderst, folgt dem neuesten Modell dieser Art ihres Programms. **Zurück zu den Standardeinstellungen** im Menü **⋯** neben dem Titel stellt sie wieder her.

Unter **Modellstufen in Sitzungen** stehen zwei standardmäßig aktive Schalter:

- **Subagenten koordinieren** weist den Hauptagenten zu Planung, Delegation an günstigere Stufen und Prüfung an. Ohne vorgegebene Stufe erhalten Subagenten Standard. Deaktiviert arbeiten Agenten grundsätzlich allein, sofern sie nicht selbst anders entscheiden; die Startseite bietet dann kein Automatisch.
- **Max für schwierige Probleme** (zu Beginn an): Ein Hauptagent auf Automatisch kann sich selbst auf Max verschieben, wenn sich ein Problem als zu schwer für Am besten erweist. Ausgeschaltet bleiben Sitzungen auf Automatisch auf Am besten.

## Agentenprogramme werden automatisch installiert

Claude Code, Codex, Gemini CLI, Grok Build und andere sind lokale Programme. Du musst sie nicht manuell installieren.

Unter [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Agent%20programs) zeigt **Agentenprogramme** Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build (sobald du es hinzugefügt hast) und Programme mit ACP-Adapter. Jeder Eintrag nennt Sitzungsprogrammversion und Quelle:

- **Eigene Installation** (bei Grok Build auch mit dem Installer von xAI, der es in `~/.grok/bin` ablegt);
- **von der App installiert**: Die App hat es in ihrem eigenen Ordner installiert.
- **Mit der App geliefert**, etwa Codex;
- **Nicht installiert: Wird bei der ersten Nutzung automatisch installiert**. **Installieren** startet sofort.

Bei Updates nennt die Zeile die neue Version. Codex zeigt bei zusätzlicher eigener Installation auch die Terminalversion. Sitzungen verwenden die App-Version, das Terminal deine eigene.

Ein fehlendes Programm installiert sich auch von selbst, sobald es zum ersten Mal gebraucht wird: Claude Code, wenn du dich bei ihm anmeldest oder eine Claude-Code-Sitzung startest, ein ACP-Agent, wenn du ihn unter Einstellungen → Agenten → Weitere Agenten hinzufügst oder eine Sitzung mit ihm startest. Die App installiert sie mit npm in ihrem eigenen Ordner, du brauchst also keine Administratorrechte.

Goose, Kimi CLI und einige andere Agenten stehen nicht in dieser Liste: Installiere sie selbst (Einstellungen → Agenten → Weitere Agenten zeigt, wo du sie bekommst). Ein Agent, der einen ACP-Adapter braucht, installiert sich in zwei Teilen, dem Adapter und dem Agenten selbst; die Liste zeigt für beide eine Zeile.

## Agentenprogramme aktuell halten

Ist [**Automatisch aktualisieren**](/settings?s=accounts&find=Update%20automatically) an, die letzte Zeile unter **Agentenprogramme** (es ist an, solange du es nicht ausschaltest), bringt die App jedes Agentenprogramm einmal am Tag auf seine neueste Version. Der erste Lauf kommt etwa zehn Minuten nach dem Start der App.

- App-eigene Kopien werden mit npm aktualisiert. Codex kann so eine neuere Kopie als die mitgelieferte verwenden.
- Deine eigenen Installationen aktualisieren sich mit ihrem eigenen Updater: `claude update` für Claude Code, `codex update` für Codex (das, das dein Terminal startet), `opencode upgrade` für OpenCode, `grok update` für Grok Build.
- Mit `npm install -g` global installierte Gemini-CLI-, Qwen-Code-, Auggie-, Grok-Build- und ACP-Adapter-Programme werden mit npm aktualisiert, sofern Schreibrechte bestehen. Andere Installationswege bleiben deiner eigenen Verwaltung überlassen.
- Claude Code folgt seinem konfigurierten Releasekanal: `"autoUpdatesChannel": "stable"` nutzt stabil, sonst aktuell.
- Ist Claude Codes eigener Updater über `DISABLE_AUTOUPDATER=1` aus, wie im Docker-Image, aktualisiert Hydor deine Claude-Code-Installation ebenfalls nicht automatisch. **Jetzt aktualisieren** funktioniert weiterhin.

Die App behält eine neue Version erst, wenn sie so funktioniert, wie die Sitzungen sie nutzen. Claude Code muss beim Start einer Sitzung antworten und seine Modelle nennen, Codex muss seinen App-Server starten und seine Modelle nennen, und die anderen müssen starten und ihre Version nennen. Dafür brauchst du keine Anmeldung, und dein Abo wird nicht belastet. Jedes Programm hat eine Minute Zeit zu antworten, und es zählt nur die Zeit, in der der Computer wach ist. Ein Mac, der mitten in der Prüfung in den Ruhezustand geht, verbraucht die Minute also nicht. Ein Programm, das beim ersten Mal langsam antwortet (ein Mac sieht ein neues Programm erst durch, bevor es zum ersten Mal läuft), wird noch einmal mit zwei weiteren Minuten gestartet und fällt nur durch, wenn es auch dann nicht antwortet. Eine Version, die durchfällt, wird rückgängig gemacht:

- App-eigene und mit npm aktualisierte eigene Kopien kehren zur vorherigen Version zurück.
- Bei eigener Claude-Code-Installation verwenden Sitzungen die vom Installer aufbewahrte frühere Version, während `claude` im Terminal neu bleibt. Die Zeile nennt die fehlgeschlagene Version.
- Dieselbe fehlerhafte Version wird nicht automatisch erneut versucht, die nächste dagegen schon. **Jetzt aktualisieren** kann den Versuch wiederholen.

Unter dieser Zeile steht, wann die App zuletzt nachgesehen hat, etwa „Aktuell · geprüft vor 2 Std.“, mit **Jetzt prüfen**, um erneut nachzusehen. Wenn neuere Versionen verfügbar sind, steht das dort, mit **Jetzt aktualisieren**, um alle auf einmal zu installieren (es gibt keine Schaltfläche pro Programm). Während der Aktualisierung zeigt die App, welches Programm gerade aktualisiert wird. Die Zeilen darunter nennen, was die letzte Aktualisierung geändert hat, etwa „Claude Code 2.1.308 → 2.1.316“, oder warum eine Version nicht installiert werden konnte.

Laufende Sitzungen machen mit der Version weiter, mit der sie gestartet sind. Neue Sitzungen verwenden die neue. Bei ausgeschaltetem **Automatisch aktualisieren** sieht die App trotzdem einmal am Tag nach und zeigt, was verfügbar ist, installiert aber nichts, bis du auf **Jetzt aktualisieren** klickst.

## Claude Code, Codex und Grok Build anmelden

Claude Code und Codex brauchen eine Anmeldung, bevor sie arbeiten können, und Grok Build ebenso, sobald du es hinzugefügt hast (siehe [Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen](#add-gemini-cli-opencode-and-other-acp-agents)). Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts) (auf dem Smartphone ist Einstellungen eine Liste von Abschnitten: Tippe unter Agenten auf **Konten**; mit dem Titel oben kommst du zurück). Die Gruppe **Konten** (ihr (i) sagt, dass das die Claude-Code-, Codex- und Grok-Build-Anmeldungen sind, die deine Sitzungen verwenden, und dass du ein weiteres Abo hinzufügen kannst, zum Beispiel ein Arbeits- und ein privates, und beim Start einer Sitzung eines davon auswählst) listet zuerst die eigene Anmeldung jedes Agenten und dann die Konten, die du dafür hinzugefügt hast. Auch die eigene Anmeldung von Grok Build hat dort eine Zeile, **Grok Build**, die erscheint, sobald es hinzugefügt ist. Bei jedem steht ein grünes Häkchen mit E-Mail, Abo und Anmeldemethode oder ein rotes Kreuz mit „Nicht angemeldet“ oder dem, was schiefgegangen ist.

So meldest du dich an:

1. Klicke neben dem Agenten auf **Anmelden**.
2. Wähle, wie:
   - Claude Code: **Claude-Abonnement** (dein Claude-Abo) oder **Konsole (API-Abrechnung)** (ein Anthropic-API-Konto).
   - Codex: **Gerätecode** oder **Browserumleitung**.
   - Grok Build: nichts zu wählen, es meldet sich immer mit einem Code an.
3. Klicke auf **Anmeldelink abrufen**.
4. Folge den Schritten:
   - Claude Code: Öffne den Link (**Anmeldeseite öffnen**), bestätige den Zugriff in deinem Browser, füge dann den Code, den die Seite zeigt, in **Code von der Seite einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Codex mit Gerätecode: Link auf einem beliebigen Gerät öffnen, bei ChatGPT anmelden und Einmalcode eingeben. Der Dialog erkennt den Abschluss automatisch.
   - Codex, Browserumleitung: Nach der Anmeldung versucht dein Browser, eine „localhost“-Seite zu öffnen, und scheitert. Kopiere die Adresse dieser Seite, füge sie in **localhost-Adresse aus deinem Browser einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Grok Build: Du erhältst einen Link und einen Einmalcode. Öffne den Link auf einem beliebigen Gerät, melde dich mit deinem Grok-Konto an und bestätige den Code (**2. Bestätige diesen Code**). Es wird nichts zurückgefügt: Der Dialog erkennt selbst, wann du fertig bist.

Eine Meldung bestätigt den Erfolg. Bei Fehlern nennt der Dialog den Grund; **Erneut versuchen** startet neu.

Danach erlaubt **Konto wechseln** dieselbe Anmeldung mit einem anderen Konto (bei Grok Build mit einem neuen Code). **Abmelden** im Menü **⋯** meldet das Agentenprogramm auf diesem Computer nach Bestätigung ab, auch für dessen Terminals und Editoren.

Startest du eine Grok-Build-Sitzung, während es abgemeldet ist, bricht die Sitzung ab mit „Grok Build is not signed in: sign in with your Grok account in Settings → Agents → Accounts, then try again.“ Melde dich dort an und sende deine Nachricht erneut. Statt eines Abos funktioniert für Grok Build auch ein xAI-API-Key in `XAI_API_KEY`, in der Umgebung der Agenten.

Die Willkommenstour (über **Hilfe** in der Seitenleiste) fragt, welche Agenten und Modelle du nutzen möchtest, und führt dich ebenfalls durch diese Anmeldungen.

## Ein zweites Konto für Arbeit oder Privat hinzufügen

Du kannst mehr als ein Claude-Code-, Codex- oder Grok-Build-Konto anmelden, zum Beispiel ein Arbeits-Abo und ein privates Abo, und pro Sitzung eines auswählen.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts).
2. Klicke neben dem Titel der Gruppe **Konten** auf **Konto hinzufügen**.
3. Wähle **Claude Code**, **Codex** oder **Grok Build** (wird angeboten, sobald Grok Build eingerichtet ist), gib einen Namen ein (bis zu 40 Zeichen, etwa „Arbeit“ oder „Privat“) und klicke auf **Hinzufügen und anmelden**.
4. Der Anmeldedialog für das neue Konto öffnet sich. Melde dich an, wie oben beschrieben.

Jedes hinzugefügte Konto meldet sich für sich an und behält seinen eigenen Sitzungsverlauf. Deine Einstellungen, Anweisungen, Skills und Plugins werden mit der Hauptanmeldung des Agenten geteilt, Änderungen gelten also für beide. Bei Claude Code ist ein Ordner, dem du mit der Hauptanmeldung vertraut hast, auch für ein hinzugefügtes Konto vertrauenswürdig, sodass in dessen Sitzungen die eigenen Berechtigungsregeln des Ordners gelten. Zwei Konten desselben Agenten können nicht denselben Namen haben.

Ein hinzugefügtes Grok-Build-Konto hat einen eigenen Ordner mit seiner Anmeldung und dem eigenen Sitzungsverlauf von Grok. Die Einstellungen der Grok-CLI teilt es mit deiner Hauptanmeldung: Konfiguration, Regeln (`AGENTS.md`), Skills, Plugins und MCP-Anmeldungen.

Jedes hinzugefügte Konto hat eine eigene Zeile unter der eigenen Anmeldung des Agenten, mit **Anmelden** oder **Konto wechseln**. Sein Menü **⋯** enthält **Abmelden**, **Umbenennen** und **Entfernen**:

- **Umbenennen** mit neuem Namen.
- **Abmelden** unterbricht die Arbeitsfähigkeit seiner Sitzungen bis zur erneuten Anmeldung.
- **Entfernen** nimmt das Konto aus der App. Seine Sitzungen verschwinden aus der Liste, aber ihr Verlauf bleibt auf dem Datenträger, es sei denn, du setzt zusätzlich das Häkchen bei **Auch die Anmeldung und den Verlauf seiner Sitzungen löschen**. Ein Konto kannst du nicht entfernen, solange Sitzungen mit ihm laufen: Beende sie zuerst.

Die [Nutzungsseite](/usage) zeigt pro hinzugefügtem Claude-Code-, Codex- oder Grok-Build-Konto eine eigene Karte mit Limits.

## Das Konto einer Sitzung wählen

Hat der gewählte Agent zusätzliche Konten (bei Grok Build, sobald du eines hinzugefügt hast), erscheint auf der Startseite unter **Optionen** die Zeile **Konto**:

- **Deine Anmeldung** ist das eigene Konto des Programms (das erste für diesen Agenten unter **Konten**; bei Grok Build das eigene Konto der Grok-Build-CLI).
- Zusätzliche Konten stehen mit ihrem Namen in der Liste.
- **Konten verwalten** öffnet die Kontoeinstellungen.

Die Startseite merkt sich deine Wahl für diesen Agenten, an jedem Ort gleich. Eine Sitzung, die mit einem hinzugefügten Konto läuft, zeigt oben in der Sitzung den Namen dieses Kontos mit einem Personensymbol. Wenn dieses Konto ein Nutzungslimit erreicht, betrifft der Limit-Hinweis über dem Nachrichtenfeld dieses Konto. Das Konto wird beim Start der Sitzung festgelegt. Es ändert sich nur von selbst, wenn **Bei erreichtem Limit das Konto wechseln** (siehe unten) eingeschaltet ist.

Um eine Sitzung selbst zu einem anderen Konto zu verschieben, klicke auf den **Konto**-Chip der Sitzung und wähle eines. Das geht bei Claude-Code-, Codex- und Grok-Build-Sitzungen und gilt ab deiner nächsten Nachricht. Der Grok-Verlauf einer Grok-Build-Sitzung zieht mit um; kann Grok sie unter dem anderen Konto nicht wieder öffnen, beginnt sie dort neu, mit einem Hinweis.

## Alle Konten nutzen: bei Limits wechseln

Mit zwei oder mehr Konten für denselben Agenten kann die App alle nutzen: Wenn bei einem die Nutzung aufgebraucht ist, arbeitet deine Arbeit mit einem anderen weiter. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) und suche **Bei erreichtem Limit das Konto wechseln** in der Gruppe **Nutzungslimit erreicht** unter **Konten**. Sie erscheint, sobald du irgendein Konto hinzugefügt hast, auch eines für Grok Build (ihr (i) sagt, dass die Sitzung zu einem anderen Konto dieses Agenten mit verbleibender Nutzung wechselt und weiterläuft, wenn die Nutzung des Kontos einer Sitzung aufgebraucht ist, und dass neue Sitzungen ein Konto an seinem Limit überspringen). Sie ist von Anfang an eingeschaltet (schalte sie dort aus, wenn du das Konto lieber selbst wählst) und funktioniert auch, wenn kein Browser offen ist.

- Wenn ein Durchlauf stoppt, weil das Konto der Sitzung sein Nutzungslimit erreicht hat, wählt die App ein anderes angemeldetes Konto desselben Agenten, das noch Nutzung übrig hat (das am wenigsten genutzte), verschiebt die Sitzung mit ihrem gesamten Verlauf dorthin und sendet „… hat sein Nutzungslimit erreicht, deshalb läuft diese Sitzung jetzt auf …. Mach dort weiter, wo du aufgehört hast.“ Ein Hinweis oben in der App sagt, zu welchem Konto die Sitzung gewechselt ist.
- Die Subagenten, die eine Claude-Code-Sitzung im Hintergrund ausführt, laufen ebenfalls weiter. Die, die beim Erreichen des Limits noch arbeiten, halten beim nächsten Schritt an, und ihre Arbeit bleibt erhalten. Die App wartet auf sie (höchstens zwei Minuten), bevor sie die Sitzung verschiebt. Die Nachricht nennt sie dann, und der Agent führt jeden dort fort, wo er angehalten hat. Wenn nur die Subagenten an ein Limit stoßen (eines nur für ihr Modell), wechselt die Sitzung, sobald ihr Durchlauf beendet ist und keiner von ihnen mehr arbeitet.
- Hydor-Subagenten (die Sitzungen, die ein Agent startet, um einen Teil seiner Arbeit zu erledigen) sind eigene Sitzungen, daher wird jede von selbst verschoben, wenn ein Limit ihren Durchlauf stoppt. Der Agent, der sie gestartet hat, erfährt, dass sie weiterläuft und nicht, dass sie fehlgeschlagen ist, und bekommt ihre Antwort, wenn sie fertig ist.
- Deine Hauptanmeldung und jedes hinzugefügte Konto zählen alle. Claude-Code-Konten lösen Claude-Code-Konten ab, Codex-Konten Codex-Konten, Grok-Build-Konten Grok-Build-Konten.
- Ein Grok-Build-Konto ist am Limit, wenn es sein Wochenlimit, sein Credit-Limit oder sein Ausgabenlimit bei „Nach Verbrauch bezahlen“ erreicht. Die Sitzung wechselt dann zu einem anderen angemeldeten Grok-Konto mit verbleibender Nutzung (dem am wenigsten genutzten) und läuft mit „… hat sein Nutzungslimit erreicht, deshalb läuft diese Sitzung jetzt auf …“ weiter. Ein kurzes Ratenlimit (eine Welle von Anfragen) verschiebt nichts: Es vergeht von selbst. Der Limit-Hinweis über dem Nachrichtenfeld erscheint auch bei Grok-Sitzungen.
- Codex-Ziele wechseln mit und laufen weiter.
- Wenn jedes Konto sein Limit erreicht hat, wechselt nichts (es sei denn, **Bei erreichtem Limit API-Guthaben verwenden** ist eingeschaltet, siehe unten, bei Claude Code). Ist **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** eingeschaltet, läuft die Sitzung weiter, sobald das erste Konto zurückgesetzt wird, und zwar mit diesem Konto. Das gilt auch für Grok-Build-Sitzungen. Mehr dazu unter [Nutzung, Limits und Kosten](/guide/usage#continue-sessions-automatically-after-a-limit).
- Eine neue Sitzung, die mit einem Konto an seinem Limit gestartet wird, startet stattdessen mit einem Konto, das noch Nutzung übrig hat. Und eine Nachricht, die du an eine Sitzung sendest, deren Konto am Limit ist, verschiebt die Sitzung zuerst, damit die Nachricht nicht abgewiesen wird. Mit deiner Nachricht erfährt der Agent, dass er jetzt auf einem Konto mit verbleibender Nutzung läuft, sodass er nicht auf das Zurücksetzen des alten Kontos wartet, und welche seiner Subagenten weitermachen können.
- In VS Code oder Terminals geöffnete Sitzungen bleiben auf ihrem Konto.
- Limit-Resets (Codex-Reset-Guthaben, Claude-Reset-Gutschriften) und API-Guthaben gibt es weiterhin nur für Claude Code und Codex.
- Die kleinen eigenen Fragen der App an Claude Code oder Codex (das Hilfsmodell auf **Automatisch**, schnelle Modellschritte einer App, Pull-Request-Beschreibungen, Befehlsvorschläge) gehen auf dieselbe Weise an dein nächstes angemeldetes Konto, wenn eines am Limit oder abgemeldet ist.

## API-Guthaben nutzen, wenn alle Konten ausgeschöpft sind

Wenn du einen Anthropic-API-Key hast (von [console.anthropic.com](https://console.anthropic.com) → API keys), können deine Claude-Code-Sitzungen damit weiterlaufen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, statt anzuhalten. Das kostet Geld: Die Sitzung wird von Anthropic zu API-Preisen abgerechnet, solange sie so läuft, und ist nicht durch dein Abo gedeckt.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). Klicke in der Zeile eines Claude-Code-Kontos unter **Konten** (deiner Hauptanmeldung oder eines hinzugefügten) auf **⋯** und dann auf **API-Key hinzufügen…**.
2. Füge den Key in **Anthropic-API-Key** ein und klicke auf **Key speichern**. Die App prüft ihn bei Anthropic und speichert ihn verschlüsselt auf diesem Computer. Die Zeile zeigt dann das Etikett **API-Guthaben**. **API-Key ändern…** ersetzt ihn, und **API-Key entfernen** löscht ihn.
3. Schalte **Bei erreichtem Limit API-Guthaben verwenden** in der Gruppe **Nutzungslimit erreicht** ein (ihr (i) sagt, dass Sitzungen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, statt anzuhalten über den Anthropic-API-Key eines Kontos abgerechnet weiterlaufen und dass die Option aus ist, bis du sie einschaltest). Sie erscheint, sobald Claude Code angemeldet ist oder du ein Claude-Code-Konto hinzugefügt hast.

Danach gilt:

- Wenn das Konto einer Claude-Code-Sitzung sein Nutzungslimit erreicht, versucht die App zuerst, was **Bei erreichtem Limit das Konto wechseln** tut: ein anderes Konto mit verbleibender Nutzung. Nur wenn keines mehr etwas übrig hat und die Einstellung eingeschaltet ist, läuft die Sitzung weiter und wird über den API-Key abgerechnet.
- Die Sitzung bleibt mit ihrer Historie auf ihrem Konto. Fehlt dort ein Key, darf der eines anderen Claude-Code-Kontos verwendet werden.
- Die Sitzung zeigt oben neben ihrem Konto das Etikett **API-Guthaben**. Fahre mit der Maus darüber, um den Grund zu sehen.
- Sobald wieder Abokontingent verfügbar ist, wechselt die Sitzung nach dem nächsten Durchlauf zurück, zum eigenen oder einem anderen freien Konto.
- Kann die App den Kontoverbrauch nicht lesen, wechselt sie niemals vorsorglich zur kostenpflichtigen API.
- Codex bleibt davon unberührt; diese API-Option gilt dort nicht.

## Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen

Öffne [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Deine Agenten** (sie erscheinen neben Claude Code und Codex, wenn du eine Sitzung startest) listet zuerst Custom und dann die Agenten, die du hinzugefügt hast. Bei jedem steht ein Häkchen, wenn sein Programm hier installiert ist, oder ein Kreuz und „nicht installiert“.
- **Agenten mit ACP-Unterstützung** (installiere einen, melde dich einmal in seiner eigenen CLI an und füge ihn dann hier hinzu) listet die bekannten, die du noch nicht hinzugefügt hast: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build und weitere. Die installierten stehen zuerst. Bei einer Zeile mit „Nicht installiert“ steht, wie du es bekommst. Die Liste zeigt die ersten paar, die nicht installiert sind; **Alle anzeigen** zeigt den Rest.

Zum Hinzufügen:

1. Klicke am Ende der Zeile auf **Hinzufügen**. Die Schaltfläche ist hervorgehoben, wenn das Programm schon installiert ist.
2. Wenn die App weiß, wie man es installiert (Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build und die Agenten, die einen ACP-Adapter brauchen), installiert sie es jetzt im Hintergrund. Goose, Kimi CLI und die anderen installierst du selbst, mit dem Befehl oder der Adresse in ihrer Zeile.
3. Melde dich einmal im eigenen Programm des Agenten an: Öffne das [Terminal](/terminal), führe seinen Befehl aus (zum Beispiel `gemini`) und folge seiner Anmeldung. Wenn du das überspringst, sagt dir eine Sitzung: „Gemini CLI is not signed in. Run gemini once in a terminal and sign in there, then try again.“

Danach erscheint der Agent unter **Ausführungsumgebung** auf der Startseite.

Um einen hinzugefügten Agenten zu ändern, klicke auf **Bearbeiten**. Um ihn zu entfernen, öffne sein Menü **⋯**, wähle **Entfernen** und bestätige: Seine Sitzungen bleiben aufgelistet, aber um sie fortzusetzen, muss der Agent erneut eingerichtet werden. Custom ist eingebaut: Seine Zeile sagt „Eingebaut: Modelle von OpenRouter, Ollama und vLLM, in Einstellungen → Modelle“ und hat statt Bearbeiten und Entfernen eine Schaltfläche **Modelle**.

### Grok Build

**Grok Build** ist der Coding-Agent von xAI (das Programm `grok`). Klicke in seiner Zeile auf **Hinzufügen**, mehr ist nicht nötig: Die App installiert es beim ersten Bedarf aus npm (`@xai-official/grok`) oder nutzt eines, das schon da ist, auch eines vom Installer von xAI in `~/.grok/bin`. Danach steht es unter **Agentenprogramme** und wird wie die anderen aktuell gehalten. Hydor führt es über ACP aus, mit den eigenen Tools der App, den Freigabekarten und den Grok-Modellen.

Es meldet sich anders an als die übrigen ACP-Agenten: nicht im Terminal, sondern unter [Einstellungen → Agenten → Konten](/settings?s=accounts), wo eine Zeile **Grok Build** erscheint, sobald es hinzugefügt ist (siehe [Claude Code, Codex und Grok Build anmelden](#sign-claude-code-codex-and-grok-build-in)). Dort kannst du auch weitere Grok-Konten hinzufügen.

### Ein eigenes Agentenprogramm hinzufügen

Jedes ACP-fähige Programm kann eingebunden werden:

1. Klicke neben **Deine Agenten** auf **Eigenen hinzufügen**.
2. Trage ein:
   - **Name**: wie er in den Listen erscheint, zum Beispiel „Gemini CLI“.
   - **Befehl**: das Programm, das gestartet wird, zum Beispiel `gemini`, oder ein vollständiger Pfad.
   - **Argumente**: was es im ACP-Modus startet, zum Beispiel `--experimental-acp`.
   - Optionale **Umgebung** mit NAME=value je Zeile für benötigte Einstellungen wie API-Key-Variablen.
3. Klicke auf **Speichern**.

Der Befehl muss ACP-Kommunikation über Standardeingabe und Standardausgabe starten.

### Agenten im eigenen Programm einrichten

Manche Agenten in der Liste sind Programme, die du selbst einrichtest, und ein paar Dinge unterscheiden sich von denen, die die App für dich installiert:

- Die Zeile unter **Weitere Agenten** nennt Installationsbefehl oder Adresse. Hydor führt keine Installationsskripte aus dem Web für dich aus. Verwende das [Terminal](/terminal) oder die genannte Methode.
- Melde dich einmal im eigenen Programm des Agenten an, auch im Terminal (führe zum Beispiel seinen Befehl aus und folge seiner Anmeldung, oder wähle dort sein Modell). Von da an startet die App ihn. Er behält seine eigenen Sitzungen und sein eigenes Memory in seinem eigenen Ordner, und seine Genehmigungskarten sind die, die er anbietet.
- Benötigt ein Agent ein eigenes Gateway, richte es zuerst mit seinem Einrichtungsbefehl ein und lasse es laufen.
- Fehlende native ACP-Unterstützung wird durch einen Adapter ergänzt. Die App installiert Adapter und Programm mit npm ohne Installationsskripte in ihrem eigenen Ordner. Vorhandene eigene Installationen auf PATH haben Vorrang.
- Ein Agent, der keine MCP-Server annimmt, arbeitet nur mit seinen eigenen Tools: Die Tools der App (Seiten, Suche …) erreichen ihn nicht, und die Sitzung sagt das beim Start. Die Richtlinien der App, Memory-Notizen und Skills bekommt er trotzdem mit der ersten Nachricht.

### Möglichkeiten und Grenzen von ACP-Agenten

Die App öffnet eine Sitzung im Ordner, den du wählst, zeigt die Nachrichten und Schritte des Agenten und fragt dich immer, wenn der Agent um Erlaubnis bittet. Einiges funktioniert anders als bei Claude Code und Codex:

- Er nimmt eine Nachricht nach der anderen an. Eine Nachricht, die du sendest, während er arbeitet, wartet in der Warteschlange über dem Nachrichtenfeld und geht raus, wenn der Durchlauf endet. (Custom funktioniert ebenso.)
- Kann ein Agent alte Sitzungen nicht wieder öffnen, beginnt die Fortsetzung ohne früheren Unterhaltungskontext. Die Sitzung erklärt das. Dasselbe passiert, wenn ein Agent eine Sitzung früher wieder öffnen konnte und es nicht mehr kann: Sie läuft mit einem Hinweis neu weiter, statt zu scheitern.
- Bildanhänge kommen nur bei Bildunterstützung an.
- Ziele, Verzweigungen und Übergaben fehlen bei anderen ACP-Agenten; Custom unterstützt Ziele und Verzweigungen.
- Die Tools der App (Seiten, Suche, Memory …) erreichen einen Agenten als MCP-Server: über eine Adresse, wenn der Agent das annimmt, sonst über ein kleines Programm, das die App für ihn startet. Ein Agent, der keines von beidem annimmt, arbeitet nur mit seinen eigenen Tools, bekommt aber trotzdem die Richtlinien, Memory-Notizen und Skills.

## Woher Customs Modelle stammen

Custom verwendet alle unter [Einstellungen → Agenten → Modelle](/settings?s=models) eingerichteten Modelle mit denselben Tools, Skills und MCP-Servern. Wähle auf der Startseite Custom und danach das Modell. Die Einstellungen enthalten:

- **Hilfsmodell** für kleine App-Aufgaben.
- **Auf diesem Computer**: was dieser Computer hat, und die Modelle, die hier installiert sind.
- **Modell von Hugging Face hinzufügen** zum Suchen, Prüfen und Installieren offener Modelle.
- **OpenRouter**: Hunderte Modelle über einen Key, in drei Gruppen: dein Key, die Modelle, die du hinzugefügt hast, und eine Suche, um weitere hinzuzufügen.
- **Modelllaufzeitumgebungen und Endpunkte** für Ollama, vLLM, andere OpenAI-kompatible Server und einen Hugging-Face-Token.

Fahre im Menü **Modell** von Custom mit der Maus über ein Modell, um zu sehen, wo es läuft und wie viel es auf einmal liest, zum Beispiel „OpenRouter · 128K Kontext“ oder „vLLM, auf diesem Computer · 32K Kontext · startet bei Verwendung“. Die Listen aktualisieren sich jede Minute von selbst.

## Das Hilfsmodell wählen

Das Hilfsmodell bearbeitet kleine Aufgaben außerhalb von Unterhaltungen:

- jede neue Sitzung nach deiner Anfrage benennen (ihr Titel in der Seitenleiste);
- Schritte im Auto-Modus von Custom prüfen und ein Custom-Ziel nach jedem Durchlauf prüfen;
- das Memory etwa einmal am Tag aufräumen, aus den Unterhaltungen seitdem lernen und Notizen für den Index betiteln, mit dem Agenten starten;
- eine Frage zu einer Webseite beantworten, die der Browser geöffnet hat;
- Bilder für Custom-Modelle ohne Bildverarbeitung beschreiben;
- lange Antworten von Hydor-Subagenten zusammenfassen;
- Apps oder geplante Aufgaben aus Sitzungen entwerfen;
- Freisprechmodus.

Öffne unter [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model) die Auswahl **Modell** in **Hilfsmodell**. Das (i) nennt die Aufgaben.

- **Automatisch** (der Standard): Claude Haiku über Claude Code, oder Codex, wenn Claude Code nicht antworten kann. Ein Konto an seinem Nutzungslimit gibt die Frage zuerst an dein nächstes angemeldetes Konto weiter (bei eingeschaltetem **Bei erreichtem Limit das Konto wechseln**). Wenn nichts antwortet, nennt die Fehlermeldung für jedes den Grund: „You've hit your weekly limit“, ein Modell, das dein Codex-Abo nicht anbietet …
- Jedes Modell von Custom, mit dem Ort, an dem es läuft (openrouter, ollama, vllm oder endpoint), und „verarbeitet Bilder“ bei denen, die Bilder sehen können.

Automatisch kann keine Bilder ansehen. Wenn du Custom mit einem Modell verwendest, das keine Bilder sieht, wähle ein Hilfsmodell, das Bilder sieht, sonst kann Custom deine Bilder nicht beschreiben lassen.

## Was auf diesem Computer läuft

Der Abschnitt **Auf diesem Computer** in [Einstellungen → Agenten → Modelle](/settings?s=models&find=On%20this%20machine) beginnt mit einer Zusammenfassung dieses Computers:

- **Grafik**: die Grafikkarten (GPUs) und ihr Speicher; bei einem Mac mit Apple Silicon sein Chip („Apple M3 Max“, dessen Grafik sich den Speicher mit dem Computer teilt); oder „Keine GPU“ (Modelle laufen dann auf dem Prozessor).
- **Arbeitsspeicher und Speicherplatz**: der Arbeitsspeicher des Computers, gesamt und frei, und der freie Platz auf dem Datenträger mit dem, was die installierten Modelle belegen.
- **Läuft mit**: ob **Ollama** und **vLLM** installiert sind, mit ihren Versionen, oder ein Link, um sie zu installieren.
- Bei GPU die passende Modellgröße, etwa 30 Milliarden Parameter in 4-Bit auf einer GPU, auf dem Mac etwa 40 Milliarden. Parameter beschreiben die Modellgröße; 4-Bit ist eine verbreitete Komprimierung mit ungefähr einem Viertel des Speicherbedarfs.

Darunter stehen:

- **Laufende Downloads**, jeweils mit einem Fortschrittsbalken, wie viel schon fertig ist, und ob er für Ollama oder vLLM ist. **Abbrechen** stoppt einen. Ein fehlgeschlagener oder abgebrochener zeigt den Grund, mit **Schließen**.
- **Installierte Modelle** (die ersten paar, dann **Alle anzeigen**), jeweils mit ihrer Laufzeit (Ollama oder vLLM), Größe, Details (etwa Größe und Komprimierung bei Ollama-Modellen), „sieht Bilder“, wo es das kann, und ob es läuft.
  - Ein vLLM-Modell hat **Starten** und **Stoppen**. Es startet von selbst, wenn eine Sitzung es zum ersten Mal verwendet (der erste Start dauert ein bis zwei Minuten), auf der Grafikkarte mit dem meisten freien Speicher (mit 8 Bit, wenn es dort so nicht passen würde) oder verteilt auf 2, 4 oder 8 davon, wenn keine einzelne Karte Platz dafür hat („läuft auf GPUs 1, 2“); auf einem Mac auf seinem Apple Silicon. Es läuft weiter, auch wenn die App neu startet, bis du auf **Stoppen** klickst. Wenn es nicht starten kann, steht der Grund darunter.
  - **Entfernen** im Menü **⋯** des Modells löscht nach deiner Bestätigung die Dateien des Modells von diesem Computer. Du kannst es später wieder installieren.

Ohne Modelle erscheint der Hinweis, eines von Hugging Face hinzuzufügen.

## Ein Modell von Hugging Face hinzufügen

Hugging Face ist eine zentrale Quelle offener Modelle. [Modell von Hugging Face hinzufügen](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) schlägt passende Modelle vor, durchsucht den Bestand und erklärt vor dem Download, wie ein Modell hier laufen würde.

### Vorschläge für diesen Computer

Bevor du suchst, listet die Gruppe die Modelle auf, die die App empfiehlt und die auf diesem Computer laufen, nach dem, was er hat:

- **LFM3-VL 2B** von Liquid AI: klein, schnell und bildfähig, für fast jeden Computer.
- **Gemma 4 12B** (Google): ein leistungsfähiger Allrounder, der Bilder liest, für einen Computer mit guter Grafikkarte.
- **Flint** von Recursive: für Programmieragenten auf Apple-Silicon-Macs mit mindestens 32 GB.
- **GLM-5.3 Flash** von Z.ai: leistungsstarkes offenes Modell für Server mit mehreren großen GPUs.

Bei jedem steht, ob es hier gut oder langsam läuft, wie es laufen würde („vLLM mit 8 Bit, auf GPU 0“, „vLLM, verteilt auf 2 GPUs“, „vLLM, auf Apple Silicon“), seine Downloadgröße und **Installieren**. **Hier am besten geeignet** markiert das stärkste, das gut läuft. Sie laufen standardmäßig mit vLLM. Ein Computer ohne NVIDIA-Grafikkarte und ohne Apple Silicon bekommt stattdessen die Version des kleinen Modells für Ollama. Eine Warnung folgt, wenn das, womit sie laufen, noch nicht eingerichtet ist („vLLM ist nicht eingerichtet“, „Ollama läuft nicht“): siehe [Ollama, vLLM oder einen anderen Endpunkt verbinden](#connect-ollama-vllm-or-another-endpoint). Die Zeile **2 weitere für größere Computer** (oder wie viele es sind) zeigt die anderen, mit dem, was jedes braucht. Die Willkommenstour schlägt dieselben vor.

### Suchen und filtern

1. Gib unter **Hugging Face durchsuchen oder org/name einfügen** einen Namen wie `qwen3`, einen vollständigen Modellnamen oder eine huggingface.co-Adresse ein. Vorher erscheinen Vorschläge und **Am häufigsten heruntergeladene ansehen**.
2. Kombiniere Filter:
   - **Läuft hier gut**: nur Modelle, die auf diesem Computer gut laufen würden.
   - **GGUF · Ollama**: Modelle im GGUF-Format, die Ollama ausführt.
   - **vLLM**: Modelle im safetensors-Format, die vLLM auf einer Grafikkarte ausführt.
   - **Verarbeitet Bilder** für bildfähige Modelle.
3. Ändere die Reihenfolge mit dem Menü rechts: **Am häufigsten heruntergeladen**, **Im Trend**, **Am häufigsten positiv bewertet** oder **Neueste**.

Bis zu 40 Treffer werden geladen, zunächst acht sichtbar und weitere über **Alle anzeigen**. Ein vollständig angegebenes Modell steht zuerst, auch ohne Suchtreffer. Enter prüft es direkt.

Jede Zeile zeigt den Hersteller und den Namen, die Form (**GGUF** oder **vLLM**), **Bilder**, wenn es Bilder sieht, **Zugriffsbeschränkt**, wenn sein Hersteller zuerst die Zustimmung zu Bedingungen verlangt, die Größe in Parametern, die Downloads der letzten 30 Tage, Likes und wann es zuletzt geändert wurde.

### Die erste Einschätzung

Unter jedem Modell gibt ein farbiges Etikett eine erste Einschätzung allein nach der Größe:

- **Läuft gut mit vLLM** oder **Läuft gut mit Ollama**, mit ungefährer Geschwindigkeit wie 40 Token/s, also Wortbestandteile pro Sekunde: Das Modell passt in den Grafikspeicher.
- **Auf dem Prozessor, langsam** oder **Auf dem Prozessor sehr langsam**: Es passt nur in den Arbeitsspeicher des Computers und läuft deshalb auf dem Prozessor. Das kann nur Ollama.
- **Zu groß für diesen Computer**: Modell oder Download passen nicht in den verfügbaren Speicher.
- **Mit Ollama in 4-Bit: läuft gut…**: Das Modell ist, wie es gespeichert ist, zu groß, aber seine komprimierte 4-Bit-Version würde mit Ollama gut laufen.

Beim Darüberfahren siehst du die zugrunde liegenden Zahlen.

### Vor dem Download prüfen

Klicke bei einem Modell auf **Überprüfen**, um genau zu sehen, wie es hier laufen würde. Das Fenster zeigt seine Größe, wie viel es auf einmal liest (sein Kontext), ob es Bilder sieht, und dann:

- Bei einem GGUF-Modell: „Läuft mit Ollama“ und jede verfügbare Größe (kleinere Dateien tauschen ein wenig Qualität gegen Tempo und Speicher), die kleinste zuerst. Jede Zeile nennt ihre Einschätzung, den nötigen Speicher, ungefähr wie schnell es laufen würde, und die Downloadgröße, mit einer Schaltfläche **Installieren**. Installieren ist ausgegraut, solange Ollama hier nicht läuft, oder bei einer Größe, die zu groß ist.
- Bei einem vLLM-Modell: „Läuft mit vLLM, das es auf einer GPU startet, wenn eine Sitzung es verwendet“, dieselben Zahlen, Hinweise, welche Grafikkarte es verwenden würde, und eine Schaltfläche **Herunterladen**. Wenn vLLM nicht installiert ist oder dein vLLM diese Art Modell noch nicht ausführen kann, steht das dort, und wenn es eine GGUF-Version gibt, bietet es stattdessen **überprüfen** für diese an.
- Bei anderen Formaten der Hinweis, dass ausführbare Gewichte in safetensors oder GGUF fehlen.

Die Zahlen gehen von einer Unterhaltung mit bis zu etwa 32.000 Token aus, der Länge, die ein Modell auf diesem Computer bekommt. **Schließen** klappt das Fenster zu.

### Installieren und anschließend verwenden

Klicke auf **Installieren** (Ollama) oder **Herunterladen** (vLLM). Der Download erscheint in **Auf diesem Computer** mit seinem Fortschritt. Wenn er fertig ist, erscheint das Modell im Menü **Modell** von Custom. Ein vLLM-Download, der abgebrochen wurde, macht beim erneuten Versuch dort weiter, wo er aufgehört hat. Ein vLLM-Modell, das für keine einzelne Grafikkarte groß genug ist, wird beim Start mit 8 Bit (FP8) gespeichert, was den Speicher, den seine Gewichte brauchen, bei geringem Verlust halbiert (Karten ab der RTX-30-Serie von NVIDIA und A100); passt es dann immer noch nicht, wird es auf mehrere Karten verteilt, wenn sie zusammen Platz haben.

### Zugriffsbeschränkte und private Modelle

Manche Hersteller verlangen, dass du zuerst ihre Bedingungen akzeptierst. Ihre Modelle zeigen **Zugriffsbeschränkt**. Akzeptiere die Bedingungen auf der Seite des Modells auf huggingface.co und füge dann einen Hugging-Face-Token hinzu (siehe [Hugging-Face-Token](#hugging-face-token)). Auch private Modelle brauchen den Token.

## Modelle über OpenRouter nutzen

OpenRouter unter openrouter.ai bietet Hunderte Modelle vieler Anbieter über einen Key mit verbrauchsabhängiger Abrechnung.

### Deinen Key hinzufügen

1. Erstelle einen Key auf openrouter.ai über den Link im Abschnitt.
2. Klicke in [Einstellungen → Agenten → Modelle](/settings?s=models&find=OpenRouter) in der Zeile **Dein OpenRouter-Key** auf **Key hinzufügen**, füge ihn im Dialog in **Dein OpenRouter-Key: sk-or-…** ein und klicke auf **Speichern**.

Danach steht dort **Verbunden mit OpenRouter** mit Anfang und Ende des Keys. **Key entfernen** im Menü **⋯** löscht ihn. Der vollständige Wert bleibt auf dem Server verborgen.

Auch beim ersten Bedarf ist die Eingabe möglich: Für Bilder, Zeichnungen, Videos oder Ton erscheint in der Unterhaltung eine sichere Karte; siehe [Wenn ein Agent den OpenRouter-Key benötigt](/guide/documents-voice#when-an-agent-needs-the-openrouter-key). KI-Editorwerkzeuge fragen im eigenen Dialog. Beide Wege speichern ihn hier.

### Vorgeschlagene Modelle

Vor der Suche zeigt **Vorgeschlagen** unter **OpenRouter-Modelle hinzufügen** vier Custom-Modelle mit Begründung: **GPT-6 Luna** für schnell und günstig, **Grok 4.7** mit weniger Ablehnungen, **GPT-6.1 Sol** für höhere Qualität und **Claude Opus 5.5** als stärkste allgemeine Wahl. **Hinzufügen** übernimmt sie in die Auswahl. Für Medien verwendet die App Seedream 5.0 Pro und das schnellere günstigere Flash, Lyria 3 Pro, Seed Audio 1.0 und Seedance 2.5; siehe [Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images).

### Den Katalog durchsuchen

Tippe in derselben Gruppe in **OpenRouter durchsuchen: deepseek, qwen, claude…**, oder klicke auf einen der vorgeschlagenen Namen oder auf **Neueste ansehen**. Filter:

- **Tool-Aufrufe**: Modelle, die Tools nativ aufrufen, so wie Custom sie am besten nutzt (Beste Übereinstimmung stellt diese zuerst).
- **Verarbeitet Bilder**;
- **Schlussfolgern** für Modelle mit zusätzlichem Denkprozess;
- **Kostenlos**.

Das Menü rechts ordnet die Ergebnisse: **Beste Übereinstimmung** (solange du nach Namen suchst), **Neueste**, **Günstigstes** oder **Größter Kontext**. Du bekommst bis zu 50 Modelle, zuerst die ersten acht und **Alle anzeigen** für den Rest.

Jeder Treffer nennt Anbieter, Name und Kennzeichnungen: **Neueste**, **Neu** für die letzten drei Wochen, **Kostenlos**, **Schlussfolgern**, **Bilder** oder **Keine nativen Tools**. Ohne native Tools beschreibt Custom sie in Anweisungen und liest Aufrufe aus Text. Hinzu kommen Kontextgröße wie „128K Kontext“, maximale Antwortlänge wie „16K Ausgabe“, Ein- und Ausgabepreis pro Million Token, Listungsmonat, Kurzbeschreibung und OpenRouter-Kennung.

### Modelle zur Auswahl hinzufügen

Klicke bei einem Modell auf **Hinzufügen**. Seine Zeile zeigt dann **Hinzugefügt**, und das Modell erscheint in der Gruppe **Deine OpenRouter-Modelle** („In der Modellauswahl“) über der Suche und im Menü **Modell** von Custom. Klicke auf das × bei einem davon, um es aus den Menüs zu nehmen. Bis du mindestens eines hinzufügst, bietet OpenRouter keine Modelle an („Füge mindestens ein Modell hinzu, um OpenRouter zu verwenden.“).

## Ollama, vLLM oder andere Endpunkte verbinden

Unter **Modelllaufzeitumgebungen und Endpunkte** in [Einstellungen → Agenten → Modelle](/settings?s=models&find=Runtimes%20and%20endpoints) verbindest du Modellserver.

### Ollama

Ollama ist ein kostenloses Programm, das Modelle auf deinem Computer ausführt, auf der Grafikkarte oder dem Prozessor. In seiner Zeile steht „Läuft“ mit der Version oder „läuft nicht unter dieser Adresse“ mit einem Link **Ollama installieren**. Die Adresse ist `http://127.0.0.1:11434`, solange du sie nicht änderst: Gib im Feld eine andere ein, dann erscheint daneben **Speichern**. Jedes Modell dieses Ollama steht in der Modellliste von Custom, auch solche, die du außerhalb der App geladen hast.

### vLLM

vLLM ist ein schneller Server für Modelle auf NVIDIA-Grafikkarten und der Weg, auf dem Modelle von Hugging Face hier standardmäßig laufen. Ein Modell, das für eine Karte zu groß ist, läuft darauf in 8-Bit oder verteilt auf 2, 4 oder 8 Karten. Auf einem Mac läuft vLLM auf Apple Silicon mit seinem Metal-Plugin (vllm-metal). Die App findet es selbst im PATH oder in einer conda- oder venv-Umgebung und zeigt seine Version und seinen Fundort. Steht dort „Nicht gefunden (pip install vllm); alternativ den Befehl angeben“, installiere vLLM oder gib im Feld den vollständigen Pfad seines Befehls `vllm` ein und klicke auf **Speichern** (die Schaltfläche erscheint, sobald du etwas eingibst). Lass das Feld leer, damit die App selbst sucht.

### Andere OpenAI-kompatible Endpunkte

Viele Programme und Dienste antworten wie die API von OpenAI: LM Studio, der Server von llama.cpp und andere Anbieter. So fügst du einen hinzu:

1. Klicke neben der Gruppenüberschrift auf **Endpunkt hinzufügen**.
2. Gib im Dialog den **Name**, die Adresse (etwa `http://localhost:1234/v1`) und einen **Key (optional)** ein.
3. Klicke auf **Hinzufügen**.

Der Endpunkt erscheint als Zeile mit seiner Adresse und der Anzahl der Modelle, die er anbietet. Seine Modelle stehen in der Liste von Custom als „Modell (Name)“. Mit × entfernst du ihn. Wenn du einen weiteren Endpunkt mit demselben Namen hinzufügst, ersetzt er den ersten.

[Vertrauliche Sitzungen](/guide/sessions#keep-a-session-confidential) dürfen lokale und private Netzwerkadressen nutzen: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` bis `172.31.…` und Namen mit `.local`. Andere Adressen gelten als online, auch bei deinem eigenen Server. Nutze dann seine private Adresse. Das gilt auch für Ollama; Cloudmodelle mit „cloud“ am Namensende gelten immer als online.

### Hugging-Face-Token

Ein [Hugging-Face-Token](/settings?s=models&find=Hugging%20Face%20token) erlaubt der App, zugriffsbeschränkte oder private Modelle herunterzuladen (die Zeile sagt „Nur für zugriffsbeschränkte oder private Modelle“). Erstelle einen in den Einstellungen deines Hugging-Face-Kontos, klicke auf **Token hinzufügen**, füge ihn in den Dialog ein (er beginnt mit `hf_`) und klicke auf **Speichern**. Die Zeile zeigt dann seinen Anfang und sein Ende, mit **Token entfernen** in ihrem Menü **⋯**.

## Frag einen Agenten

- „Welche Agentenprogramme sind installiert? Installiere Gemini CLI.“
- „Sind Claude Code und Codex aktuell? Aktualisiere sie jetzt.“
- „Füge OpenCode hinzu.“
- „Füge Grok Build hinzu und melde es mit meinem Grok-Abo an.“
- „Füge ein zweites Grok-Konto für die Arbeit hinzu und starte meine nächste Sitzung damit.“
- „Starte meine nächste Grok-Sitzung mit xhigh-Aufwand.“
- „Wie viel von meinem Grok-Abo ist diese Woche noch übrig?“
- „Nutze alle meine Grok-Konten: Wenn eines sein Limit erreicht, mach mit einem anderen weiter.“
- „Füge Gemini CLI und Goose hinzu und sage mir, was ich noch selbst installieren muss.“
- „Finde ein bildfähiges Hugging-Face-Modell, das hier gut läuft. Prüfe und installiere die passende Größe.“
- „Füge das neueste DeepSeek-Modell von OpenRouter hinzu.“ Voraussetzung ist dein OpenRouter-Key.
- „Wähle ein bildfähiges Hilfsmodell.“
- „Stoppe das laufende vLLM-Modell, um Grafikspeicher freizugeben.“
- „Nutze alle Claude-Konten und wechsle bei einem Limit zum nächsten.“
- „Verwende mein API-Guthaben, wenn alle Claude-Abos aufgebraucht sind.“
- „Welche Modelle verwenden die Stufen für Claude Code und Codex? Setze Max für Claude Code auf Opus.“
