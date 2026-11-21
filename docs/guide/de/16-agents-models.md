# Agenten, Konten und Modelle

Hydor führt mehrere KI-Agenten aus: Claude Code, Codex, Custom (der App-eigene Agent für beliebige Modelle) und weitere Agenten mit ACP-Unterstützung, etwa Gemini CLI, OpenCode, Qwen Code, Goose oder Grok Build. Dieses Thema erklärt, worin sie sich unterscheiden, wie ihre Programme installiert und aktuell gehalten werden, wie du sie anmeldest (auch mit mehr als einem Konto) und woher die Modelle von Custom kommen: von OpenRouter, von Ollama, aus Hugging-Face-Modellen, die auf diesem Computer laufen, oder von einem beliebigen OpenAI-kompatiblen Endpunkt.

![Auswahl des Agenten auf der Startseite: Claude Code, Codex oder Custom](images/agents-models.webp)

## Welchen Agenten soll ich verwenden?

Ein Agent ist das Programm, das in einer Sitzung die Arbeit erledigt: Es liest deine Nachricht, nutzt Werkzeuge (Dateien, Befehle, das Web) und antwortet. Das Modell ist die KI dahinter. Jeder Agent hier bekommt von der App die gleiche Unterstützung (Websuche, den Browser, Memory, Skills, deine Verbindungen), aber sie unterscheiden sich darin, woher ihre Modelle kommen.

- **Claude Code** (Anthropic). Läuft mit deinem Claude-Abo oder rechnet über ein Anthropic-API-Konto ab. Seine Modelle sind die von Anthropic (Opus, Sonnet, Haiku). Es hat eigene Nutzungslimits, die die [Seite „Nutzung“](/usage) zeigt.
- **Codex** (OpenAI). Läuft mit deinem ChatGPT-Abo. Seine Modelle sind die von OpenAI. Auch hier gibt es Nutzungslimits, die auf der Seite „Nutzung“ stehen. Codex ist in der App enthalten.
- **Custom**, der App-eigene Agent. Er führt die Modelle deiner Claude- und ChatGPT-Abos aus (über die Anmeldungen von Claude Code und Codex) sowie jedes Modell, das du in [Einstellungen → Agenten → Modelle](/settings?s=models) hinzufügst: Modelle über OpenRouter, Modelle auf diesem Computer (mit Ollama oder vLLM) oder einen beliebigen OpenAI-kompatiblen Endpunkt. Nutze ihn für offene Modelle, günstigere Modelle oder Modelle, die deinen Computer nie verlassen. Siehe [Custom, der App-eigene Agent](/guide/custom).
- **Agenten mit ACP-Unterstützung**: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build (der Coding-Agent von xAI mit seinen Grok-Modellen) und weitere, oder ein eigener Befehl. ACP (das Agent Client Protocol) ist ein gemeinsamer Weg, wie eine App mit einem Agentenprogramm spricht. Jeder meldet sich einmal in seinem eigenen Programm an und nutzt seine eigenen Modelle.

Was jeder in der App kann:

- Ziele (der Agent arbeitet weiter, bis eine Bedingung erfüllt ist) und Forks (eine Kopie der Sitzung ab einer früheren Antwort): Claude Code, Codex und Custom. Nicht die anderen ACP-Agenten.
- **Fortsetzen in…** (die Unterhaltung an einen anderen Agenten übergeben): von Claude Code oder Codex aus an den jeweils anderen oder an Custom.
- Aufwand (wie intensiv das Modell nachdenkt): Claude Code, Codex und Grok Build sowie jeder andere ACP-Agent, dessen Modelle ihn anbieten.
- Mehr als ein Konto, Nutzungslimits des Abos und Kontowechsel bei Erreichen eines Limits: Claude Code, Codex und Grok Build.
- Zurücksetzen von Limits und API-Guthaben bei Erreichen eines Limits: nur Claude Code und Codex.

## Agent und Modell für eine neue Sitzung wählen

Auf der Startseite (`/`) zeigt die Zeile unter dem Nachrichtenfeld, wer die Arbeit erledigt.

1. Klicke auf **Ausführungsumgebung**. Die Liste zeigt **Claude Code** („Anthropic · Claude-Abo oder API-Key“), **Codex** („OpenAI · ChatGPT-Abo oder API-Key“), **Custom** („Beliebiges Modell: OpenRouter, Ollama, vLLM“) und jeden Agenten, den du in Einstellungen → Weitere Agenten hinzugefügt hast („ACP-Agent · “ und sein Befehl). Ganz unten öffnet **Modelle für Custom** die Einstellungen → Modelle, und **Agenten hinzufügen oder verwalten** öffnet die Einstellungen → Weitere Agenten.
2. Klicke auf **Modell** und wähle eins aus. **Automatisch**, ganz oben und zu Beginn ausgewählt, lässt die Leistungsstufen entscheiden: Am besten, und Max, wenn sich das Problem als zu schwer erweist (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](#tiers-a-model-for-each-kind-of-job)). Darunter zeigt die Liste nur die eigenen Modelle des Agenten. Das Standardmodell des Agenten ist mit „Standard“ markiert. Ältere Versionen eines Modells stehen hinter einer Zeile wie „2 ältere Modelle“; klicke darauf, um sie zu sehen. Gibt es mehr als acht Modelle, steht oben ein Feld **Modelle suchen**: Tippe ein paar Buchstaben und drücke die Eingabetaste, um den ersten Treffer zu übernehmen. Wenn der Agent nicht wie von der App verlangt mit seinen Modellen gestartet ist, sagt das Menü das, mit den eigenen Worten des Agenten zum Grund, und **Erneut versuchen** fragt noch einmal an.
3. Unter **Optionen** findest du **Aufwand** (für Agenten und Modelle, die ihn haben: Standard, Niedrig, mittel, Hoch und so weiter; zu Grok Build siehe [Aufwand bei Grok Build](#effort-for-grok-build)) und **Berechtigungen** (was der Agent tun darf, ohne dich zu fragen). Auch Umschalt+Tab im Nachrichtenfeld wechselt die Berechtigungen.

Die Startseite merkt sich, was du für jeden Ort, an dem du arbeitest, gewählt hast (jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**), auf jedem Gerät: Modell, Aufwand und Berechtigungen jedes Programms kommen dort so zurück, wie du sie verlassen hast (siehe [Was sich die Startseite merkt](/guide/sessions#what-the-start-page-remembers)).

Ein ACP-Agent außer Custom zeigt seine Auswahl bei **Modell** und **Berechtigungen** erst nach seiner ersten Sitzung: Sie listet auf, was der Agent bei seinem letzten Lauf angeboten hat. Grok Build ist die Ausnahme: Seine Modelle samt den jeweils möglichen Aufwandsstufen erscheinen, sobald es hinzugefügt ist, weil die App Grok danach fragt.

Mit **Optionen** → **Vertraulich** ist **Ausführungsumgebung** auf **Custom** gesetzt, und **Modell** listet nur die Modelle auf diesem Computer oder in deinem privaten Netzwerk, die besten zuerst ausgewählt: siehe [Eine Sitzung vertraulich halten](/guide/sessions#keep-a-session-confidential).

Auf einem Smartphone öffnet sich jedes dieser Menüs als Sheet vom unteren Bildschirmrand.

## Das Modell mitten in einer Sitzung wechseln

In einer Sitzung stehen Modell, Aufwand und Berechtigungen unter dem Nachrichtenfeld. Sie sind ein einziger Chip, der etwa „Opus 5.5 · Hoch · Plan“ anzeigt: Klicke darauf für **Modell**, **Aufwand** und **Berechtigungen**.

Wähle ein anderes Modell, und die Sitzung läuft damit weiter:

- Claude Code wechselt sofort.
- Codex nutzt das neue Modell ab seinem nächsten Zug.
- Custom nutzt es ab seinem nächsten Schritt, sogar mitten in einem Zug.
- Ein anderer ACP-Agent wechselt, wenn er eine Auswahl an Modellen anbietet.

Der **Aufwand** der Sitzung funktioniert genauso. Wähle einen, und der laufende Agent nutzt ihn ab seinem nächsten Zug. Wenn das Modell, auf das du wechselst, den bisherigen Aufwand nicht unterstützt, zeigt die Auswahl den Standard dieses Modells, und das Modell läuft damit.

Das Modellmenü listet nur die Modelle des Agenten der Sitzung; bei einer vertraulichen Sitzung nur die auf diesem Computer oder in deinem privaten Netzwerk. Um eine Unterhaltung zu einem anderen Agenten zu bringen, nutze das Menü der Sitzung (⋯) → **Fortsetzen in Codex**, **Fortsetzen in Claude Code** oder **Fortsetzen in Custom Agent** (von Claude-Code- und Codex-Sitzungen aus; Custom erscheint, sobald es ein Modell hat). Deine nächste Nachricht startet dann eine neue Sitzung dieses Agenten im selben Ordner, mit der bisherigen Unterhaltung. Eine beendete Sitzung wird mit dem Modell fortgesetzt, das sie zuletzt genutzt hat, außer du wählst vor dem Senden ein anderes.

## Aufwand bei Grok Build

Die Modelle von Grok nehmen einen Denkaufwand an, dieselbe Auswahl, die dir auch Claude Code und Codex bieten:

- Grok 4.6 (und neuere Modelle, die dasselbe anbieten): **xhigh**, **Hoch**, **mittel** oder **Niedrig**. **Hoch** ist der Standard.
- Grok 4.5: **Hoch**, **mittel** oder **Niedrig**.

Wähle auf der Startseite unter **Ausführungsumgebung** **Grok Build**, dann **Optionen** → **Aufwand**: Dort stehen die Aufwandsstufen des gewählten Modells, mit **Standard**. Sie erscheinen, sobald Grok Build hinzugefügt ist, noch vor seiner ersten Sitzung. Eine laufende Grok-Build-Sitzung ändert ihren Aufwand in ihrer eigenen Auswahl **Aufwand** (dem Chip unter dem Nachrichtenfeld), und auch ein Lauf einer [App](/guide/apps) nimmt einen an. Wenn du eine Sitzung auf ein Modell umstellst, das den bisherigen Aufwand nicht unterstützt (xhigh bei Grok 4.5), zeigt die Auswahl den Standard dieses Modells, und damit läuft das Modell.

Das gilt nicht nur für Grok: Jeder andere Agent mit ACP-Unterstützung, dessen Modelle Aufwandsstufen anbieten, bekommt dieselbe Auswahl **Aufwand**.

## Leistungsstufen: ein Modell für jede Art von Aufgabe

Agenten wählen Modelle nach Leistungsstufe statt nach Namen: **Schnell** für kleine, sehr klare Aufgaben, deren Ergebnis sich prüfen lässt, **Standard** für klare Aufgaben mittlerer Größe, **Am besten** für den Haupt-Agenten einer Sitzung, der plant, Subagenten koordiniert und ihre Arbeit prüft, und **Max** für die schwierigsten Probleme. Der größte Teil einer Aufgabe besteht aus klaren Teilen, die ein günstigeres Modell gut erledigt, daher kostet eine Sitzung so weniger, ohne dass das Ergebnis schlechter wird: Das stärkste Modell im Raum plant die Arbeit trotzdem und prüft sie.

Auf der Startseite steht **Modell** zunächst auf **Automatisch**: Die Sitzung startet mit Am besten (dasselbe **Automatisch** startet die Sitzungen einer [Geplanten Aufgabe](/guide/tasks#model-effort-permissions-and-other-options), und eine [App](/guide/apps) kann statt mit einem Modell nach Namen mit einer Leistungsstufe denken). Ihr Haupt-Agent gibt klare Teile an Subagenten mit Standard und Schnell ab und kann selbst auf Max wechseln, wenn sich ein Problem als schwerer erweist, als Am besten bewältigen kann (eine Korrektur, die zweimal gescheitert ist, eine Ursache, die er nicht findet, ein Beweis); eine Zeile in der Unterhaltung sagt das, mit dem Grund. Eine Anfrage wird nicht allein wegen ihres Wortlauts an Max geschickt: Am besten löst das meiste, was schwierig klingt, für weniger. Wähle stattdessen ein Modell nach Namen, und die Sitzung denkt mit diesem; ihre Subagenten bekommen trotzdem Leistungsstufen. Ein Agent von dir kann mit einer einzigen Leistungsstufe denken (siehe [Womit ein Agent denkt: Leistungsstufen](/guide/agents#what-an-agent-thinks-with-tiers)).

[Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) legt fest, was jede Stufe für jedes Programm bedeutet: eine Zeile pro Stufe, mit einem Schalter neben dem Titel der Gruppe, um das Programm zu wählen (**Claude Code**, **Codex** oder **Custom**), und in jeder Zeile ein Modell und, für Claude Code und Codex, ein Aufwand. Das (i) einer Stufe sagt mehr dazu. Zu Beginn sind für Claude Code Schnell = Haiku, Standard = Sonnet, Am besten = Opus und Max = das neueste Fable; für Codex Schnell = Luna, Standard = Terra, Am besten = Sol und Max = Astra (in einem Abo ohne eines davon das nächstliegende, das es anbietet, mit mehr Aufwand für die höhere Stufe, wo sich zwei ein Modell teilen); die Stufen von Custom füllen sich selbst: Eine Stufe, die du in Ruhe lässt, nimmt das neueste Modell ihrer Art aus den Modellen, die Custom hat. Aus deinem Claude-Abo ist das Haiku für Schnell, Sonnet für Standard, Opus für Am besten und das neueste Fable für Max; sonst aus deinem ChatGPT-Abo Luna, Terra, Sol und Astra; sonst aus den Modellen, die du hinzugefügt hast und die nicht auf diesem Computer laufen (OpenRouter, ein Endpunkt) und deren Namen eine dieser Familien nennen. Ein Modell auf diesem Computer wird nie für dich gewählt, weil sein Name nicht verrät, wie stark es ist, und ein kleines Modell (Haiku, Luna) wird nie zu Am besten: Mit nur kleinen oder lokalen Modellen bleiben die Stufen leer, bis du wählst, und eine Custom-Sitzung behält dann das Modell, das sie gewählt hat. Sobald Am besten ein Modell nennt, bietet die Startseite für Custom **Automatisch** an, und seine Sitzungen koordinieren Subagenten (Hydor-Subagenten, da Custom kein eigenes Agent-Werkzeug hat). Im Tab **Custom** kannst du für eine Stufe jedes seiner Modelle benennen (siehe [Woher die Modelle von Custom kommen](#where-customs-models-come-from)). Eine Stufe, die du in Ruhe lässt, folgt dem neuesten Modell ihrer Art im jeweiligen Programm. **Zurück zu den Standardeinstellungen** im Menü **⋯** neben dem Titel setzt sie zurück, auch die Auswahl von Custom.

Zwei Schalter in der Gruppe **Modellstufen in Sitzungen** unter den Stufen legen fest, wie Sitzungen sie nutzen:

- **Subagenten koordinieren** (zu Beginn an): Der Haupt-Agent einer Sitzung soll planen, klare Teile an Subagenten auf günstigeren Stufen abgeben und ihre Arbeit prüfen, und ein Subagent, der ohne Stufe angefordert wird, bekommt Standard. Ist der Schalter aus, arbeiten Agenten allein, sofern sie nichts anderes wählen, und die Startseite und das Aufgabenformular haben kein Automatisch.
- **Max für schwierige Probleme** (zu Beginn an): Ein Haupt-Agent auf Automatisch darf selbst auf Max wechseln, wenn sich ein Problem als zu schwer für Am besten erweist. Ist der Schalter aus, bleiben Sitzungen auf Automatisch bei Am besten.

## Agentenprogramme installieren und aktualisieren sich selbst

Claude Code, Codex, Gemini CLI, Grok Build und die anderen sind Programme auf diesem Computer. Du musst sie nicht von Hand installieren.

Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Agent%20programs) und sieh dir die Gruppe **Agentenprogramme** an. Sie listet Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build (sobald du es hinzugefügt hast) und die Agenten auf, die einen ACP-Adapter brauchen, jeweils mit der Version, die die Sitzungen ausführen, und woher sie kommt:

- **deine eigene Installation**: Du hast es selbst installiert (bei Grok Build auch mit dem eigenen Installer von xAI, der es in `~/.grok/bin` ablegt).
- **von der App installiert**: Die App hat es in ihrem eigenen Ordner installiert.
- **In der App enthalten**: Codex wird mit der App ausgeliefert.
- **Nicht installiert: Wird bei der ersten Nutzung automatisch installiert**: fehlt. Klicke auf **Installieren**, um es sofort zu holen.

Eine Zeile sagt außerdem „… ist erschienen“, wenn eine neuere Version erschienen ist. In der Zeile von Codex steht zusätzlich „deins im Terminal: …“, wenn du auch ein eigenes Codex hast: Die Sitzungen führen das der App aus, und ein Terminal führt deins aus.

Ein fehlendes Programm installiert sich auch von selbst, sobald es gebraucht wird: Claude Code, wenn du dich bei ihm anmeldest oder eine Claude-Code-Sitzung startest, ein ACP-Agent, wenn du ihn in Einstellungen → Agenten → Weitere Agenten hinzufügst oder eine Sitzung mit ihm startest. Die App installiert sie mit npm in ihrem eigenen Ordner, du brauchst also keine Administratorrechte.

Goose, Kimi CLI und einige andere Agenten stehen nicht in dieser Liste: Installiere sie selbst (Einstellungen → Agenten → Weitere Agenten zeigt, wo du sie bekommst). Ein Agent, der einen ACP-Adapter braucht, wird in zwei Teilen installiert, dem Adapter und dem Agenten selbst; die Liste zeigt für beide eine Zeile.

## Die Agentenprogramme aktuell halten

Wenn [**Automatisch aktualisieren**](/settings?s=accounts&find=Update%20automatically) aktiviert ist, die letzte Zeile unter **Agentenprogramme** (es ist aktiviert, solange du es nicht ausschaltest), bringt die App jedes Agentenprogramm einmal am Tag auf die neueste Version. Der erste Durchlauf erfolgt etwa zehn Minuten nach dem Start der App.

- Die Kopien, die die App installiert hat, werden mit npm in ihrem eigenen Ordner aktualisiert. Codex wechselt zu einer Kopie, die neuer ist als die, die mit der App geliefert wurde.
- Deine eigenen Installationen werden mit ihrem eigenen Updater aktualisiert: `claude update` für Claude Code, `codex update` für Codex (das, das dein Terminal ausführt), `opencode upgrade` für OpenCode, `grok update` für Grok Build.
- Gemini CLI, Qwen Code, Auggie, Grok Build oder ein Agent mit ACP-Adapter, den du mit `npm install -g` installiert hast, werden mit npm aktualisiert, sofern dein Benutzer in diesen Ordner schreiben darf. Alles, was auf anderem Weg installiert wurde, überlässt die App dir: Aktualisiere es so, wie du es installiert hast.
- Claude Code folgt seiner eigenen Release-Linie: der stabilen, wenn in seinen Einstellungen `"autoUpdatesChannel": "stable"` steht, sonst der neuesten.
- Wenn du die eigenen Updates von Claude Code mit `DISABLE_AUTOUPDATER=1` ausgeschaltet hast (das Docker-Image tut das), aktualisiert die App dein Claude Code auch nicht von selbst. **Jetzt aktualisieren** tut es trotzdem.

Die App behält eine neue Version erst, wenn sie so funktioniert, wie die Sitzungen sie nutzen. Claude Code muss beim Start einer Sitzung antworten und seine Modelle auflisten, Codex muss seinen App-Server starten und seine Modelle auflisten, und die anderen müssen starten und ihre Version nennen. Nichts davon erfordert eine Anmeldung oder verbraucht etwas von deinem Tarif. Jedes Programm hat eine Minute Zeit zu antworten, und es zählt nur die Zeit, in der der Computer wach ist. Ein Mac, der mitten in der Prüfung in den Ruhezustand geht, verbraucht die Minute also nicht. Ein Programm, das beim ersten Mal langsam antwortet (ein Mac prüft ein neues Programm, bevor es zum ersten Mal läuft), wird mit zwei weiteren Minuten erneut gestartet und schlägt nur fehl, wenn es dann ebenfalls nicht antwortet. Eine fehlgeschlagene Version wird rückgängig gemacht:

- Eine Kopie, die die App installiert hat, oder eine deiner eigenen, die sie mit npm aktualisiert hat, geht auf die vorherige Version zurück.
- Bei deinem eigenen Claude Code laufen die Sitzungen weiter mit der vorherigen Version, die der Installer von Claude Code neben der neuen aufbewahrt. Der Befehl `claude` im Terminal bleibt auf der neuen. Die Zeile zeigt „… did not work here“.
- Eine fehlgeschlagene Version wird nicht von selbst erneut versucht, die nächste aber schon, und **Jetzt aktualisieren** versucht sie erneut.

Unter dieser Zeile steht, wann die App zuletzt nachgesehen hat, etwa „Up to date · checked 2h ago“, mit **Jetzt prüfen**, um erneut nachzusehen. Wenn neuere Versionen verfügbar sind, steht das dort, mit **Jetzt aktualisieren**, um alle auf einmal zu installieren (es gibt keine Schaltfläche pro Programm). Während der Aktualisierung wird angezeigt, welches Programm gerade aktualisiert wird. Die Zeilen darunter sagen, was die letzte Aktualisierung geändert hat, etwa „Claude Code 2.1.308 → 2.1.316“, oder warum eine Version nicht installiert werden konnte.

Laufende Sitzungen machen mit der Version weiter, mit der sie gestartet sind. Neue Sitzungen nutzen die neue. Bei ausgeschaltetem **Automatisch aktualisieren** sieht die App weiterhin einmal am Tag nach und zeigt an, was verfügbar ist, installiert aber nichts, bis du auf **Jetzt aktualisieren** klickst.

## Claude Code, Codex und Grok Build anmelden

Claude Code und Codex brauchen eine Anmeldung, bevor sie arbeiten können, und Grok Build ebenfalls, sobald du es hinzugefügt hast (siehe [Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen](#add-gemini-cli-opencode-and-other-acp-agents)). Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts) (auf dem Smartphone sind die Einstellungen eine Liste von Bereichen: Tippe unter Agenten auf **Konten**; der Titel oben bringt dich zurück). Die Gruppe **Konten** (ihr (i) sagt, dass dies die Anmeldungen für Claude Code, Codex und Grok Build sind, die deine Sitzungen nutzen, dass du ein weiteres Abonnement hinzufügen kannst, etwa ein berufliches und ein privates, und beim Start einer Sitzung eines auswählen kannst) listet zuerst die eigene Anmeldung jedes Agenten auf, dann die Konten, die du dafür hinzugefügt hast. Auch die eigene Anmeldung von Grok Build hat dort eine Zeile, **Grok Build**, die erscheint, sobald es hinzugefügt ist. Jede zeigt ein grünes Häkchen mit E-Mail, Tarif und Anmeldeart oder ein rotes Kreuz mit „Nicht angemeldet“ oder dem, was schiefgelaufen ist.

So meldest du dich an:

1. Klicke neben dem Agenten auf **Anmelden**.
2. Wähle die Art:
   - Claude Code: **Claude-Abonnement** (dein Claude-Tarif) oder **Konsole (API-Abrechnung)** (ein Anthropic-API-Konto).
   - Codex: **Gerätecode** oder **Browserumleitung**.
   - Grok Build: Es gibt nichts auszuwählen, die Anmeldung erfolgt immer mit einem Code.
3. Klicke auf **Anmeldelink abrufen**.
4. Folge den Schritten, die der Dialog zeigt:
   - Claude Code: Öffne den Link (**Anmeldeseite öffnen**), genehmige den Zugriff in deinem Browser, füge dann den Code, den die Seite zeigt, bei **Code von der Seite einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Codex, Gerätecode: Öffne den Link auf einem beliebigen Gerät, melde dich bei ChatGPT an und gib den einmaligen Code ein, der im Dialog steht. Der Dialog merkt selbst, wenn du fertig bist.
   - Codex, Browserumleitung: Nach der Anmeldung versucht dein Browser, eine „localhost“-Seite zu öffnen, und scheitert. Kopiere die Adresse dieser Seite, füge sie bei **localhost-Adresse aus deinem Browser einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Grok Build: Du bekommst einen Link und einen einmaligen Code. Öffne den Link auf einem beliebigen Gerät, melde dich mit deinem Grok-Konto an und bestätige den Code (**2. Bestätige diesen Code**). Es wird nichts zurückgefügt: Der Dialog merkt selbst, wenn du fertig bist.

Wenn es klappt, siehst du „Claude Code is signed in“ (oder Codex oder Grok Build). Wenn es fehlschlägt, nennt der Dialog den Grund; klicke auf **Erneut versuchen**.

Nach der Anmeldung heißt die Schaltfläche **Konto wechseln**: Sie startet dieselbe Anmeldung für ein anderes Konto (bei Grok Build ein neuer Code). **Abmelden** findest du im **⋯**-Menü der Zeile: Es meldet das Programm nach deiner Bestätigung auf diesem Computer ab, für jedes Terminal und jeden Editor, die es nutzen.

Wenn du eine Grok-Build-Sitzung startest, während es abgemeldet ist, bricht die Sitzung mit „Grok Build is not signed in: sign in with your Grok account in Settings → Agents → Accounts, then try again.“ ab. Melde dich dort an und sende deine Nachricht erneut. Ein xAI-API-Key in `XAI_API_KEY` in der Umgebung der Agenten funktioniert für Grok Build anstelle eines Abonnements.

Die Willkommenstour (über **Hilfe** in der Leiste) fragt, welche Agenten und Modelle du nutzen möchtest, und führt dich ebenfalls durch diese Anmeldungen.

## Ein zweites Konto hinzufügen (beruflich und privat)

Du kannst mehr als ein Konto für Claude Code, Codex oder Grok Build anmelden, zum Beispiel einen beruflichen und einen privaten Tarif, und pro Sitzung eines auswählen.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts).
2. Klicke neben dem Titel der Gruppe **Konten** auf **Konto hinzufügen**.
3. Wähle **Claude Code**, **Codex** oder **Grok Build** (es wird angeboten, sobald Grok Build eingerichtet ist), gib einen Namen ein (bis zu 40 Zeichen, etwa „Beruflich“ oder „Privat“) und klicke auf **Hinzufügen und anmelden**.
4. Der Anmeldedialog für das neue Konto öffnet sich. Melde dich an wie oben beschrieben.

Jedes hinzugefügte Konto meldet sich für sich an und behält seinen eigenen Sitzungsverlauf. Deine Einstellungen, Anweisungen, Skills und Plugins werden mit der Hauptanmeldung des Agenten geteilt, Änderungen gelten also für beide. Bei Claude Code gilt ein Ordner, dem du mit der Hauptanmeldung vertraut hast, auch für ein hinzugefügtes Konto als vertrauenswürdig, sodass in dessen Sitzungen die eigenen Berechtigungsregeln des Ordners gelten. Zwei Konten desselben Agenten dürfen nicht denselben Namen haben.

Ein hinzugefügtes Grok-Build-Konto hat einen eigenen Ordner mit seiner Anmeldung und dem eigenen Sitzungsverlauf von Grok. Es teilt die eigenen Einstellungen der Grok CLI mit deiner Hauptanmeldung: Konfiguration, Regeln (`AGENTS.md`), Skills, Plugins und MCP-Anmeldungen.

Jedes hinzugefügte Konto hat unter der eigenen Anmeldung des Agenten eine eigene Zeile mit **Anmelden** oder **Konto wechseln**; ihr **⋯**-Menü enthält **Abmelden**, **Umbenennen** und **Entfernen**:

- **Umbenennen** fragt nach einem neuen Namen.
- **Abmelden** sorgt dafür, dass die Sitzungen, die mit diesem Konto laufen, nicht mehr funktionieren, bis es sich wieder anmeldet.
- **Entfernen** nimmt das Konto aus der App. Seine Sitzungen verschwinden aus der Liste, ihr Verlauf bleibt aber auf der Festplatte, es sei denn, du setzt auch das Häkchen bei **Auch die Anmeldung und den Verlauf seiner Sitzungen löschen**. Ein Konto kannst du nicht entfernen, solange Sitzungen damit laufen: Beende sie zuerst.

Die [Nutzungsseite](/usage) zeigt für jedes hinzugefügte Claude-Code-, Codex- oder Grok-Build-Konto eine Karte mit seinen eigenen Limits.

## Das Konto wählen, mit dem eine Sitzung läuft

Wenn der gewählte Agent hinzugefügte Konten hat (bei Grok Build, sobald du eines hinzugefügt hast), zeigen die **Optionen** der Startseite eine Zeile **Konto**. Klicke darauf:

- **Deine Anmeldung** ist das eigene Konto des Programms (das erste für diesen Agenten unter **Konten**; bei Grok Build „The Grok Build CLI's own account“).
- Jedes hinzugefügte Konto wird mit seinem Namen aufgeführt.
- **Konten verwalten** öffnet Einstellungen → Agenten → Konten.

Die Startseite merkt sich deine Wahl für diesen Agenten, überall gleich. Eine Sitzung, die mit einem hinzugefügten Konto läuft, zeigt oben in der Sitzung den Namen dieses Kontos mit einem Personensymbol. Wenn dieses Konto ein Nutzungslimit erreicht, bezieht sich der Limit-Hinweis über dem Nachrichtenfeld auf dieses Konto. Das Konto wird beim Start der Sitzung festgelegt. Es ändert sich von selbst nur mit **Bei erreichtem Limit das Konto wechseln** (unten).

Um eine Sitzung selbst auf ein anderes Konto zu verschieben, klicke auf den **Konto**-Chip der Sitzung und wähle eines aus. Das funktioniert für Sitzungen mit Claude Code, Codex und Grok Build und gilt ab deiner nächsten Nachricht. Der Grok-Verlauf einer Grok-Build-Sitzung zieht mit um; kann Grok ihn unter dem anderen Konto nicht wieder öffnen, beginnt er dort neu, mit einem Hinweis.

## Alle Konten nutzen: Bei einem Limit wechseln

Mit zwei oder mehr Konten für denselben Agenten kann die App alle nutzen: Wenn eines sein Kontingent aufgebraucht hat, geht deine Arbeit mit einem anderen weiter. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) und suche **Bei erreichtem Limit das Konto wechseln** in der Gruppe **Nutzungslimit erreicht** unter **Konten**, die erscheint, sobald du irgendein Konto hinzugefügt hast, auch eines für Grok Build (ihr (i) sagt, dass die Sitzung, wenn das Konto einer Sitzung sein Kontingent aufgebraucht hat, zu einem anderen Konto dieses Agenten mit verbleibendem Kontingent wechselt und weitermacht, und dass neue Sitzungen ein Konto am Limit überspringen). Die Option ist von Anfang an aktiv (schalte sie dort aus, wenn du das Konto lieber selbst wählst), und sie funktioniert, auch wenn kein Browser geöffnet ist.

- Wenn ein Zug stoppt, weil das Konto der Sitzung sein Nutzungslimit erreicht hat, wählt die App ein anderes angemeldetes Konto desselben Agenten, das noch Kontingent hat (das am wenigsten genutzte), verschiebt die Sitzung mit ihrem gesamten Verlauf dorthin und sendet „… reached its usage limit, so this session now runs on …. Continue where you left off.“ Ein kurzer Hinweis am unteren Bildschirmrand nennt das Konto, auf das gewechselt wurde.
- Die Subagenten, die eine Claude-Code-Sitzung im Hintergrund ausführt, machen ebenfalls weiter. Die, die beim Erreichen des Limits noch arbeiten, halten bei ihrem nächsten Schritt an, ihre Arbeit bleibt erhalten, und die App wartet auf sie (höchstens zwei Minuten), bevor sie die Sitzung verschiebt. Die Nachricht nennt sie dann, und der Agent setzt jeden dort fort, wo er stehen geblieben ist. Wenn nur die Subagenten ein Limit erreichen (eines allein für ihr Modell), wechselt die Sitzung, sobald ihr Zug beendet ist und keiner von ihnen mehr arbeitet.
- Hydor-Subagenten (die Sitzungen, die ein Agent startet, um einen Teil seiner Arbeit zu erledigen) sind eigene Sitzungen, also wechselt jeder von selbst, wenn ein Limit seinen Zug stoppt. Der Agent, der ihn gestartet hat, erfährt, dass er weitermacht und nicht, dass er gescheitert ist, und erhält seine Antwort, wenn er fertig ist.
- Deine Hauptanmeldung und jedes hinzugefügte Konto zählen alle mit. Claude-Code-Konten übernehmen von Claude-Code-Konten, Codex von Codex, Grok Build von Grok Build.
- Ein Grok-Build-Konto ist am Limit, wenn es sein Wochenlimit, sein Guthabenlimit oder sein Ausgabenlimit für nutzungsabhängige Abrechnung erreicht. Die Sitzung wechselt dann zu einem anderen angemeldeten Grok-Konto mit verbleibendem Kontingent (dem am wenigsten genutzten) und macht weiter mit „… reached its usage limit, so this session now runs on …“. Ein kurzes Rate-Limit (eine Anfragewelle) verschiebt nichts: Es geht von selbst vorbei. Der Limit-Hinweis über dem Nachrichtenfeld erscheint auch für Grok-Sitzungen.
- Ein Codex-Ziel zieht mit der Sitzung um und läuft weiter.
- Wenn jedes Konto am Limit ist, wechselt nichts (es sei denn, **Bei erreichtem Limit API-Guthaben verwenden** ist aktiviert, unten, für Claude Code). Bei aktiviertem **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** wird die Sitzung fortgesetzt, wenn das erste Konto zurückgesetzt wird, und zwar mit diesem Konto. Das gilt auch für Grok-Build-Sitzungen. Mehr dazu in [Nutzung, Limits und Kosten](/guide/usage#continue-sessions-automatically-after-a-limit).
- Eine neue Sitzung, die auf einem Konto am Limit gestartet wird, startet stattdessen auf einem mit verbleibendem Kontingent, und eine Nachricht, die du an eine Sitzung sendest, deren Konto am Limit ist, verschiebt die Sitzung zuerst, damit die Nachricht nicht abgewiesen wird. Mit deiner Nachricht erfährt der Agent, dass er jetzt auf einem Konto mit verbleibendem Kontingent läuft, damit er nicht auf das Zurücksetzen des alten Kontos wartet, und welche seiner Subagenten weitermachen können.
- Sitzungen, die in VS Code oder einem Terminal geöffnet sind, bleiben auf ihrem Konto.
- Zurücksetzungen von Limits (Codex-Rücksetzguthaben, Claude-Rücksetzgutschriften) und API-Guthaben gibt es weiterhin nur für Claude Code und Codex.
- Die eigenen kurzen Fragen der App an Claude Code oder Codex (das Hilfsmodell auf **Automatisch**, die schnellen Modellschritte einer App, Pull-Request-Beschreibungen, Befehlsvorschläge) gehen auf die gleiche Weise an dein nächstes angemeldetes Konto, wenn eines am Limit oder abgemeldet ist. Wenn weder Claude Code noch Codex antworten kann, springt eines deiner Custom-Modelle ein (siehe [Wenn ein Konto abgemeldet ist](#when-an-account-is-signed-out)).

## Wenn ein Konto abgemeldet ist

Ein Konto von Claude Code, Codex oder Grok Build kann abgemeldet werden: Die Anmeldung ist abgelaufen oder wurde widerrufen, und das Programm meldet „Not logged in · Please run /login“ oder „401 Unauthorized“. Die App umgeht das, wo sie kann, und bittet dich nur dann um eine erneute Anmeldung, wenn nichts anderes die Aufgabe übernehmen könnte.

- **Deine Sitzungen.** Wenn der Zug einer Sitzung abgewiesen wird, weil ihr Konto abgemeldet ist, und [Bei erreichtem Limit das Konto wechseln](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) eingeschaltet ist (von Anfang an der Fall), wechselt die Sitzung mit ihrem gesamten Verlauf zu einem anderen angemeldeten Konto desselben Agents, das noch Nutzung übrig hat, und macht weiter. Ein kurzer Hinweis am unteren Bildschirmrand lautet „<Sitzung>: <Konto> ist abgemeldet, daher geht es mit <anderes Konto> weiter“, und dem Agent wird mitgeteilt: „… ist abgemeldet, daher läuft diese Sitzung jetzt auf …. Mach dort weiter, wo du aufgehört hast.“ Eine Nachricht, die du an eine Sitzung sendest, deren Konto vor kurzer Zeit als abgemeldet erkannt wurde, lässt die Sitzung zuerst auf dieselbe Weise wechseln, damit die Nachricht nicht abgewiesen wird.
- **Wenn eine Sitzung nicht wechseln kann.** Wenn **Bei erreichtem Limit das Konto wechseln** ausgeschaltet ist oder kein anderes Konto dieses Agents noch Nutzung übrig hat, hält die Sitzung an. Über ihrem Nachrichtenfeld erscheint ein Banner mit „<Konto> ist abgemeldet“ und „Diese Sitzung geht weiter, sobald du dich wieder anmeldest.“ sowie einer Schaltfläche **Anmelden**. Sobald du wieder angemeldet bist, hier oder in einem Terminal, geht die Sitzung von selbst weiter, und dem Agent wird mitgeteilt: „Wieder angemeldet. Mach dort weiter, wo du aufgehört hast.“
- **Hintergrundarbeit.** Die kleinen Aufgaben des [Hilfsmodells](/settings?s=models&find=Helper%20model) auf **Automatisch** (Sitzungstitel, Memory-Notizen, das Kürzen [deines Profils](/guide/memory#your-profile), die schnellen Modellschritte einer App, Pull-Request-Beschreibungen …) überspringen ein abgemeldetes Konto für 15 Minuten und versuchen es dann erneut, sodass eine Anmeldung, die du in einem Terminal vornimmst, bemerkt wird. Das nächste angemeldete Konto antwortet, danach Codex. Wenn weder Claude Code noch Codex antworten können (abgemeldet, am Limit oder nicht installiert), übernimmt eines deiner **Custom**-Modelle die Aufgabe: das Modell, das die Stufe **Schnell** von Custom in [Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) nennt (dann **Standard**, und für die seltenen größeren Aufgaben **Am besten**, dann **Max**), oder sonst das günstigste Modell, das du hinzugefügt hast (ein Modell auf diesem Computer gilt als kostenlos). Es werden höchstens zwei versucht. Was es kostet, zählt wie die Nutzung jedes Custom-Modells.
- **Die Aufforderung zur Anmeldung.** Nur wenn nichts die Arbeit übernehmen konnte und ein Konto abgemeldet war, erscheint auf jeder Seite unten rechts eine Karte (auf dem Smartphone über dem Nachrichtenfeld). Ihr Titel lautet „Melde dich erneut bei Claude Code an“ (oder Codex oder Grok Build), darunter „<Konto> ist abgemeldet.“, und dann der Grund: „Hintergrundarbeit braucht es (Kürzen deines Profils), und kein anderes Konto und kein Custom-Modell konnte sie übernehmen.“ oder, bei einer Sitzung, die dadurch angehalten wurde, „… geht weiter, sobald du dich anmeldest.“ **Anmelden** öffnet denselben Anmeldedialog wie [Einstellungen → Agenten → Konten](/settings?s=accounts). **Nicht jetzt** blendet die Karte für eine Stunde aus; eine Sitzung, die deswegen anhält, zeigt die Karte erneut, und das Banner in dieser Sitzung bleibt. Es werden höchstens zwei Karten gleichzeitig angezeigt, danach führt „+N weitere“ zu Einstellungen → Agenten → Konten. Eine Karte verschwindet, sobald das Konto wieder angemeldet ist, über die Karte, über die Einstellungen oder in einem Terminal (die App bemerkt das bei ihrem nächsten Aufruf, der durchkommt). Sie verschwindet auch, sobald die Hintergrundarbeit auf anderem Weg wieder erledigt wird (ein anderes Konto oder ein Custom-Modell antwortet). Wenn sowohl Claude Code als auch Codex abgemeldet sind, wird nur zu Claude Code gefragt, das als Erstes antwortet.

Dein Profil zeigt es ebenfalls: Wenn das Kürzen fehlgeschlagen ist, weil ein Konto abgemeldet ist, steht der Grund darunter („Dein Claude-Code-Konto „Work“ ist abgemeldet, und kein anderes Konto und kein Custom-Modell konnte das übernehmen: Melde dich erneut an (Einstellungen → Agenten → Konten).“), und die Karte erscheint.

## API-Guthaben verwenden, wenn alle Konten am Limit sind

Wenn du einen Anthropic-API-Key hast (von [console.anthropic.com](https://console.anthropic.com) → API keys), können deine Claude-Code-Sitzungen damit weitermachen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, statt anzuhalten. Das kostet Geld: Die Sitzung wird von Anthropic zu API-Preisen abgerechnet, solange sie so läuft, und nicht von deinem Abo abgedeckt.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). Klicke in der Zeile eines Claude-Code-Kontos unter **Konten** (deine Hauptanmeldung oder ein von dir hinzugefügtes) auf **⋯** und dann auf **API-Key hinzufügen…**.
2. Füge den Key bei **Anthropic-API-Key** ein und klicke auf **Key speichern**. Die App prüft ihn bei Anthropic und speichert ihn verschlüsselt auf diesem Computer. Die Zeile zeigt dann ein Label **API-Guthaben**. **API-Key ändern…** ersetzt ihn, und **API-Key entfernen** löscht ihn.
3. Schalte **Bei erreichtem Limit API-Guthaben verwenden** in der Gruppe **Nutzungslimit erreicht** ein (das (i) dort erklärt, dass Sitzungen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, auf den Anthropic-API-Key eines Kontos abgerechnet weitermachen, statt anzuhalten, und dass die Option ausgeschaltet ist, bis du sie einschaltest). Sie erscheint, sobald Claude Code angemeldet ist oder du ein Claude-Code-Konto hinzugefügt hast.

Was dann passiert:

- Wenn das Konto einer Claude-Code-Sitzung sein Nutzungslimit erreicht, versucht die App zuerst, was **Bei erreichtem Limit das Konto wechseln** tut: ein anderes Konto mit übriger Nutzung. Erst wenn keines mehr etwas übrig hat und die Einstellung eingeschaltet ist, macht die Sitzung auf dem API-Key abgerechnet weiter.
- Die Sitzung bleibt bei ihrem eigenen Konto, ihr Verlauf zieht also nicht um. Hat dieses Konto keinen Key, wird der Key eines anderen Claude-Code-Kontos verwendet.
- Die Sitzung zeigt oben neben ihrem Konto ein Label **API-Guthaben**. Fahre mit der Maus darüber, um den Grund zu sehen.
- Wenn ein Tarif wieder Nutzung hat, wechselt die Sitzung nach dem Ende ihres nächsten Zugs dorthin zurück: zu ihrem eigenen Konto oder zu einem anderen mit übriger Nutzung. Du musst nichts tun.
- Wenn die App die Nutzung eines Kontos nicht lesen kann, verlagert sie deine Arbeit nie auf die API-Abrechnung.
- Codex ist nicht betroffen: Es hat kein API-Guthaben.

## Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen

Öffne [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Deine Agenten** (sie erscheinen neben Claude Code und Codex, wenn du eine Sitzung startest) listet zuerst Custom auf, dann die Agenten, die du hinzugefügt hast. Jeder zeigt ein Häkchen, wenn sein Programm hier installiert ist, oder ein Kreuz und „nicht installiert“.
- **Agenten mit ACP-Unterstützung** (installiere einen, melde dich einmal in seiner eigenen CLI an und füge ihn dann hier hinzu) listet die bekannten auf, die du noch nicht hinzugefügt hast: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build und weitere. Die installierten stehen zuerst. Eine Zeile mit „Nicht installiert“ sagt, wie du ihn bekommst. Die Liste zeigt die ersten paar nicht installierten; **Alle anzeigen** zeigt den Rest.

So fügst du einen hinzu:

1. Klicke am Ende seiner Zeile auf **Hinzufügen**. Die Schaltfläche ist hervorgehoben, wenn das Programm schon installiert ist.
2. Wenn die App weiß, wie man ihn installiert (Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build und die Agenten, die einen ACP-Adapter brauchen), installiert sie ihn jetzt im Hintergrund. Goose, Kimi CLI und die anderen installierst du selbst, mit dem Befehl oder der Adresse in ihrer Zeile.
3. Melde dich einmal im eigenen Programm des Agenten an: Öffne das [Terminal](/terminal), führe seinen Befehl aus (zum Beispiel `gemini`) und folge seiner Anmeldung. Wenn du das überspringst, sagt dir eine Sitzung: „Gemini CLI is not signed in. Run gemini once in a terminal and sign in there, then try again.“

Der Agent erscheint nun in der Liste **Ausführungsumgebung** der Startseite.

Um einen hinzugefügten Agenten zu ändern, klicke auf **Bearbeiten**. Um ihn zu entfernen, öffne sein **⋯**-Menü, wähle **Entfernen** und bestätige: Seine Sitzungen bleiben aufgelistet, aber um sie fortzusetzen, muss der Agent wieder eingerichtet sein. Custom ist eingebaut: Seine Zeile sagt „Built in: models from OpenRouter, Ollama and vLLM, in Settings → Models“ und hat eine Schaltfläche **Modelle** statt Bearbeiten und Entfernen.

### Grok Build

**Grok Build** ist der Coding-Agent von xAI (das Programm `grok`). Klicke in seiner Zeile auf **Hinzufügen**, und das ist alles: Die App installiert ihn beim ersten Bedarf aus npm (`@xai-official/grok`) oder nutzt einen, der schon hier ist, auch einen aus dem eigenen Installer von xAI in `~/.grok/bin`. Er erscheint dann unter **Agentenprogramme** und wird zusammen mit den anderen aktuell gehalten. Hydor führt ihn über ACP aus, mit den eigenen Tools der App, den Genehmigungskarten und den Modellen von Grok.

Die Anmeldung läuft anders als bei den anderen ACP-Agenten: nicht im Terminal, sondern unter [Einstellungen → Agenten → Konten](/settings?s=accounts), wo eine Zeile **Grok Build** erscheint, sobald er hinzugefügt ist (siehe [Claude Code, Codex und Grok Build anmelden](#sign-claude-code-codex-and-grok-build-in)). Du kannst dort auch weitere Grok-Konten hinzufügen.

### Einen eigenen Agenten hinzufügen

Jedes Programm, das ACP spricht, kann hier laufen.

1. Klicke neben dem Titel von **Deine Agenten** auf **Eigenen Agenten hinzufügen**.
2. Fülle aus:
   - **Name**: wie er in den Listen angezeigt wird, zum Beispiel „Gemini CLI“.
   - **Befehl**: das Programm, das gestartet werden soll, zum Beispiel `gemini`, oder ein vollständiger Pfad.
   - **Argumente**: was es im ACP-Modus startet, zum Beispiel `--experimental-acp`.
   - **Umgebung (optional, NAME=value pro Zeile)**: Einstellungen, die das Programm braucht, etwa eine Variable für einen API-Key.
3. Klicke auf **Speichern**.

Der Befehl muss den Agenten im ACP-Modus starten, sodass er über seine Standardeingabe und -ausgabe kommuniziert.

### Agenten, die du in ihrem eigenen Programm einrichtest

Einige Agenten in der Liste sind Programme, die du selbst einrichtest, und einiges unterscheidet sich von denen, die die App für dich installiert:

- Ihre Zeile unter **Weitere Agenten** zeigt den Befehl oder die Adresse, mit der du sie installierst. Die App führt kein Skript aus dem Web für dich aus: Installiere ihn selbst, im [Terminal](/terminal) oder so, wie es die Zeile beschreibt.
- Melde dich einmal im eigenen Programm des Agenten an, ebenfalls im Terminal (führe zum Beispiel seinen Befehl aus und folge seiner Anmeldung, oder wähle dort sein Modell). Die App startet ihn von da an. Er behält seine eigenen Sitzungen und sein Memory in seinem eigenen Ordner, und seine Genehmigungskarten sind die, die er anbietet.
- Einer von ihnen verbindet sich mit einem eigenen Gateway: Richte es zuerst mit dem eigenen Einrichtungsbefehl des Agenten ein und lass das Gateway laufen.
- Wenn ein Agent selbst kein ACP spricht, braucht er einen ACP-Adapter. Die App installiert den Adapter zusammen mit dem Agenten, beide mit npm in ihrem eigenen Ordner, ohne ihre Installationsskripte auszuführen. Ein Agent, den du selbst installiert hast, wird verwendet, wenn er im PATH liegt.
- Ein Agent, der keine MCP-Server annimmt, arbeitet nur mit seinen eigenen Tools: Die Tools der App (Seiten, Suche …) erreichen ihn nicht, und die Sitzung sagt das beim Start. Die Richtlinien der App, Memory-Notizen und Skills bekommt er trotzdem mit der ersten Nachricht.

### Was ACP-Agenten hier können und was nicht

Die App öffnet eine Sitzung in dem Ordner, den du wählst, zeigt die Nachrichten und Schritte des Agenten und fragt dich, wann immer der Agent um Erlaubnis bittet. Einiges funktioniert anders als bei Claude Code und Codex:

- Er nimmt jeweils nur eine Nachricht an. Eine Nachricht, die du sendest, während er arbeitet, wartet in der Warteschlange über dem Nachrichtenfeld und wird abgeschickt, wenn der Zug endet. (Custom funktioniert ebenso.)
- Ein Agent, der frühere Sitzungen nicht wieder öffnen kann, beginnt neu, wenn du eine alte fortsetzt, ohne die Unterhaltung davor. Die Sitzung sagt das. Dasselbe passiert, wenn ein Agent eine Sitzung früher wieder öffnen konnte, es aber nicht mehr kann: Er macht mit einem Hinweis neu weiter, statt zu scheitern.
- Bilder, die du anhängst, erreichen ihn nur, wenn er Bilder akzeptiert.
- Ziele, Forks und Übergaben sind nicht verfügbar (Custom hat Ziele und Forks).
- Die Tools der App (Seiten, Suche, Memory …) erreichen einen Agenten als MCP-Server: über eine Adresse, wenn der Agent das akzeptiert, sonst über ein kleines Programm, das die App für ihn startet. Ein Agent, der keines davon annimmt, arbeitet nur mit seinen eigenen Tools, bekommt aber trotzdem die Richtlinien, Memory-Notizen und Skills.

## Woher die Modelle von Custom kommen

Custom führt die Modelle deiner Claude- und ChatGPT-Pläne, Modelle auf diesem Computer und Modelle in der Cloud aus, mit denselben Tools, Skills und MCP-Servern wie die anderen Agents. Wähle auf der Startseite Custom und dann das Modell. Sie kommen aus drei Quellen:

- **Deine Abos**: die Modelle deiner Claude- und ChatGPT-Pläne, über die Anmeldungen von Claude Code und Codex auf diesem Computer. Du musst nichts einrichten: Wenn Claude Code angemeldet ist, bietet das **Modell**-Menü von Custom Claude Opus, Fable, Sonnet und Haiku an (jeweils immer das neueste), und wenn Codex mit ChatGPT angemeldet ist, bietet es die Modelle an, die dein ChatGPT-Plan auflistet (zum Beispiel GPT-6 Luna). Ein Programm, das abgemeldet vorgefunden wird, verliert seine Modelle im Menü, bis du es wieder anmeldest, und ein Codex, der statt mit ChatGPT mit einem API-Key angemeldet ist, stellt keine bereit. Sie nutzen das Kontingent deines Plans, keinen API-Key und kein Geld pro Token, deshalb zeigt eine Custom-Sitzung mit einem dieser Modelle für diese Schritte 0 $ an. Jedes Konto des Programms wird der Reihe nach ausprobiert, wie bei anderer einmaliger Arbeit: Ein Konto, das sein Nutzungslimit erreicht hat oder abgemeldet ist, gibt den Schritt an dein nächstes Konto weiter (wenn **Bei erreichtem Limit das Konto wechseln** aktiviert ist). Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) verwendet sie nie, weil sie auf den Servern von Anthropic oder OpenAI laufen. Unter [Custom](/guide/custom#what-custom-is-and-when-to-use-it) erfährst du, wie sie antworten.
- **Auf diesem Computer**: hier installierte Modelle (Ollama, vLLM) und Endpunkte in deinem Netzwerk.
- **In der Cloud**: OpenRouter, Endpunkte anderswo und die Cloud-Modelle von Ollama.

Du kannst sie überall auswählen, wo sich Modelle von Custom auswählen lassen: auf der Startseite, im Modellmenü einer Sitzung, bei den Leistungsstufen von Custom, beim Hilfsmodell und beim Modell eines Agents oder einer App.

[Einstellungen → Agents → Modelle](/settings?s=models) enthält alles, was die Modelle von Custom brauchen. Die Seite hat sieben Bereiche, von oben nach unten:

- **Hilfsmodell**: das Modell für die kleinen Aufgaben der App.
- **Leistungsstufen**: ein Modell für jede Art von Aufgabe (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](#tiers-a-model-for-each-kind-of-job)).
- **Deine Abos**: je eine Zeile für Claude Code und Codex, mit den Modellen, die sie Custom zur Verfügung stellen. Eine Zeile sagt „Abgemeldet: Melde dich erneut an, um diese Modelle zu nutzen“ mit einem Link zu **Konten**, oder „Auf diesem Computer nicht installiert“.
- **Auf diesem Computer**: was dieser Computer hat, und die hier installierten Modelle.
- **Modell von Hugging Face hinzufügen**: offene Modelle suchen, überprüfen und installieren.
- **OpenRouter**: Hunderte Modelle über einen Key, in drei Gruppen: dein Key, die Modelle, die du hinzugefügt hast, und eine Suche, um weitere hinzuzufügen.
- **Modelllaufzeitumgebungen und Endpunkte**: Ollama, vLLM, andere OpenAI-kompatible Server und ein Hugging-Face-Token.

Im **Modell**-Menü von Custom sind die Modelle unter **Deine Abos**, **Auf diesem Computer** und **In der Cloud** gruppiert, und jede Zeile nennt, worüber das Modell läuft: „Claude Code“, „Codex“, „OpenRouter“, „Ollama“, „vLLM“ oder der Name eines Endpunkts. Fahre mit der Maus über ein Modell, um zu sehen, wo es läuft und wie viel es auf einmal liest, zum Beispiel „OpenRouter · 128K context“ oder „vLLM, on this machine · 32K context · starts when used“. Die Listen aktualisieren sich jede Minute von selbst.

## Das Hilfsmodell wählen

Das Hilfsmodell erledigt kleine Aufgaben neben deinen Sitzungen, außerhalb jeder Unterhaltung:

- jede neue Sitzung anhand deiner Anfrage benennen (ihr Titel in der Seitenleiste);
- Schritte im Auto-Modus von Custom prüfen und ein Custom-Ziel nach jedem Durchgang überprüfen;
- Memory etwa einmal am Tag aufräumen, aus den inzwischen geführten Unterhaltungen lernen und Notizen für den Index betiteln, mit dem Agents starten;
- eine Frage zu einer Webseite beantworten, die der Browser geöffnet hat;
- die Filter (Websites, Datumsangaben, Seitenarten, Sprachen) herauslesen, die die Worte einer Websuche angeben, bevor Naget Search sucht (siehe [Wie Agents im Web suchen](/guide/web#how-agents-search-the-web));
- Bilder für ein Custom-Modell beschreiben, das sie nicht sehen kann;
- eine lange Antwort eines Hydor-Subagents zusammenfassen;
- eine App oder eine Geplante Aufgabe aus einer Sitzung entwerfen;
- den freihändigen Sprachmodus.

Öffne [Einstellungen → Agents → Modelle](/settings?s=models&find=Helper%20model) und klicke in der Gruppe **Hilfsmodell** auf das **Modell**-Menü (sein (i) listet die kleinen Aufgaben auf):

- **Automatisch** (die Voreinstellung): Claude Haiku über Claude Code oder Codex, wenn Claude Code nicht antworten kann. Ein Konto, das sein Nutzungslimit erreicht hat, gibt die Frage zuerst an dein nächstes angemeldetes Konto weiter (wenn **Bei erreichtem Limit das Konto wechseln** aktiviert ist), und ein abgemeldetes Konto wird übergangen. Wenn keines der beiden Programme antworten kann, erledigt eines deiner Custom-Modelle die Aufgabe (das, das die Stufe **Schnell** von Custom nennt, sonst das günstigste, das du hinzugefügt hast; die Modelle deiner Pläne werden hier übersprungen, da sie über dieselben zwei Programme laufen), und nur wenn nichts die Aufgabe erledigen konnte, bittet dich eine Karte, dich anzumelden (siehe [Wenn ein Konto abgemeldet ist](#when-an-account-is-signed-out)). Wenn nichts antwortet, nennt der Fehler für jedes den Grund: „You've hit your weekly limit“, ein Modell, das dein Codex-Plan nicht anbietet …
- Jedes beliebige Modell von Custom, gruppiert wie im **Modell**-Menü von Custom (**Deine Abos**, **Auf diesem Computer** und **In der Cloud**), mit dem, worüber es läuft (Claude Code, Codex, OpenRouter, Ollama, vLLM oder der Name eines Endpunkts), und „Verarbeitet Bilder“ bei denen, die Bilder sehen können. Auch ein Modell deines Claude- oder ChatGPT-Plans kann das Hilfsmodell sein: Es antwortet über Claude Code oder Codex auf Kosten des Kontingents deines Plans.

**Automatisch** kann keine Bilder ansehen. Wenn du Custom mit einem Modell verwendest, das keine Bilder sieht, wähle ein Hilfsmodell, das Bilder sieht, sonst kann Custom deine Bilder nicht beschreiben lassen.

## Sehen, was dieser Computer ausführen kann

Der Bereich **Auf diesem Computer** in [Einstellungen → Agents → Modelle](/settings?s=models&find=On%20this%20machine) beginnt mit einer Übersicht über diesen Computer:

- **Grafik**: die Grafikkarten (GPUs) und ihr Speicher; bei einem Mac mit Apple Silicon sein Chip („Apple M3 Max“, dessen Grafik sich den Speicher mit dem Computer teilt); oder „Keine GPU“ (Modelle laufen dann auf dem Prozessor).
- **Arbeitsspeicher und Speicherplatz**: der Arbeitsspeicher des Computers, gesamt und frei, und der freie Speicherplatz der Festplatte mit dem Platz, den die installierten Modelle belegen.
- **Läuft mit**: ob **Ollama** und **vLLM** installiert sind, mit ihren Versionen, oder ein Link zur Installation.
- Bei einer Grafikkarte, wie groß ein Modell sein darf: „Passt etwa 30B Parameter bei 4 Bit auf eine GPU“ (bei einem Mac: „Passt etwa 40B Parameter bei 4 Bit“). Parameter sind ein Maß für die Größe eines Modells; 4 Bit ist eine verbreitete komprimierte Form, die etwa ein Viertel des Speichers braucht.

Darunter:

- **Laufende Downloads**, jeweils mit einem Fortschrittsbalken, wie viel schon fertig ist und ob er für Ollama oder vLLM ist. **Abbrechen** stoppt einen. Ein fehlgeschlagener oder abgebrochener zeigt den Grund, mit **Schließen**.
- **Installierte Modelle** (die ersten paar, dann **Alle anzeigen**), jeweils mit ihrer Laufzeitumgebung (Ollama oder vLLM), Größe, Details (etwa Größe und Komprimierung bei Ollama-Modellen), „Verarbeitet Bilder“, wo es zutrifft, und ob sie gerade läuft.
  - Ein vLLM-Modell hat **Starten** und **Stoppen**. Es startet von selbst, wenn eine Sitzung es zum ersten Mal verwendet (der erste Start dauert ein bis zwei Minuten), auf der Grafikkarte mit dem meisten freien Speicher (mit 8 Bit, wenn es dort sonst nicht passen würde), oder verteilt auf 2, 4 oder 8 Karten, wenn auf keiner einzelnen genug Platz ist („läuft auf GPUs 1, 2“); auf einem Mac auf seinem Apple Silicon. Es läuft weiter, auch wenn die App neu startet, bis du auf **Stoppen** klickst. Wenn es nicht starten kann, steht der Grund darunter.
  - **Entfernen** im **⋯**-Menü des Modells löscht nach deiner Bestätigung die Dateien des Modells von diesem Computer. Du kannst es später erneut installieren.

Wenn noch keine vorhanden sind: „Noch keine Modelle hier: Füge unten eines von Hugging Face hinzu.“

## Modell von Hugging Face hinzufügen

Hugging Face ist die wichtigste Website für offene Modelle. Die Gruppe [Modell von Hugging Face hinzufügen](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) (für diesen Computer vorgeschlagen, oder die gesamte Seite durchsuchen) schlägt einige vor, durchsucht die Seite und sagt dir, bevor etwas heruntergeladen wird, wie jedes Modell auf diesem Computer laufen würde.

### Für diesen Computer vorgeschlagen

Bevor du suchst, listet die Gruppe die Modelle auf, die die App empfiehlt und die auf diesem Computer laufen, je nachdem, was er hat:

- **LFM3-VL 2B** (Liquid AI): klein und schnell, und es liest Bilder. Läuft auf fast jedem Computer.
- **Gemma 4 12B** (Google): ein fähiger Allrounder, der Bilder liest, für einen Computer mit einer guten Grafikkarte.
- **Flint** (Recursive): gemacht für Coding-Agents, für einen Mac mit Apple Silicon und 32 GB oder mehr.
- **GLM-5.3 Flash** (Z.ai): eines der stärksten offenen Modelle, für einen Server mit mehreren großen Grafikkarten.

Jedes zeigt, ob es hier gut oder langsam läuft, wie es laufen würde („vLLM bei 8 Bit, auf GPU 0“, „vLLM, auf 2 GPUs verteilt“, „vLLM, auf Apple Silicon“), seine Downloadgröße und **Installieren**. **Hier am besten geeignet** kennzeichnet das stärkste, das gut läuft. Sie laufen standardmäßig mit vLLM; ein Computer, der weder eine NVIDIA-Grafikkarte noch Apple Silicon hat, bekommt stattdessen die Ollama-Version des kleinen Modells. Eine Warnung folgt, wenn das, was sie ausführt, noch nicht eingerichtet ist („vLLM ist nicht eingerichtet“, „Ollama läuft nicht“): siehe [Ollama, vLLM oder einen anderen Endpunkt verbinden](#connect-ollama-vllm-or-another-endpoint). Die Zeile **2 weitere für größere Computer** (oder wie viele es sind) zeigt die übrigen, mit dem, was jedes braucht. Die Willkommenstour schlägt dieselben vor.

### Suchen und filtern

1. Tippe in **Hugging Face durchsuchen oder org/name einfügen**: einen Namen wie `qwen3`, oder den vollständigen Namen eines Modells (`org/name`) oder seine huggingface.co-Adresse. Bevor du tippst, schlägt es einige Namen vor, oder **Am häufigsten heruntergeladene ansehen**.
2. Grenze die Liste mit den Filtern ein (du kannst sie kombinieren):
   - **Läuft hier gut**: nur Modelle, die auf diesem Computer gut laufen würden.
   - **GGUF · Ollama**: Modelle im GGUF-Format, die Ollama ausführt.
   - **vLLM**: Modelle im safetensors-Format, die vLLM auf einer Grafikkarte ausführt.
   - **Verarbeitet Bilder**: Modelle, die auch Bilder lesen.
3. Ändere die Reihenfolge mit dem Menü rechts: **Am häufigsten heruntergeladen**, **Im Trend**, **Am häufigsten positiv bewertet** oder **Neueste**.

Du bekommst bis zu 40 Modelle, zunächst die ersten acht und **Alle anzeigen** für den Rest. Ein Modell, das du vollständig benannt hast, erscheint zuerst, auch wenn die Suche es nicht auflistet, und mit der Eingabetaste wird es sofort überprüft.

Jede Zeile zeigt den Hersteller und den Namen, die Form (**GGUF** oder **vLLM**), **Bilder**, wenn es Bilder sieht, **Zugriffsbeschränkt**, wenn sein Hersteller verlangt, dass du zuerst Bedingungen akzeptierst, die Größe in Parametern, Downloads in den letzten 30 Tagen, Likes und wann es zuletzt geändert wurde.

### Die erste Einschätzung

Unter jedem Modell gibt ein farbiges Label eine erste Schätzung allein anhand der Größe:

- **Läuft gut mit vLLM** oder **Läuft gut mit Ollama**, mit einer groben Geschwindigkeit („etwa 40 Tokens/s“; ein Token ist ein Wortstück): Es passt in den Speicher deiner Grafikkarte.
- **Auf dem Prozessor, langsam** oder **Auf dem Prozessor sehr langsam**: Es passt nur in den Arbeitsspeicher des Computers, läuft also auf dem Prozessor. Das kann nur Ollama.
- **Zu groß für diesen Computer**: Es passt nicht, oder der Download passt nicht auf die Festplatte.
- **Bei 4 Bit mit Ollama: läuft gut …**: Das Modell in der gespeicherten Form ist zu groß, aber seine komprimierte 4-Bit-Version würde mit Ollama gut laufen.

Fahre mit der Maus über das Label, um die Zahlen dahinter zu sehen.

### Vor dem Download überprüfen

Klicke bei einem Modell auf **Überprüfen**, um genau zu sehen, wie es hier laufen würde. Das Fenster zeigt seine Größe, wie viel es auf einmal liest (sein Kontext), ob es Bilder sieht, und dann:

- Bei einem GGUF-Modell: „Läuft mit Ollama“ und jede verfügbare Größe, die kleinste zuerst (kleinere Dateien tauschen etwas Qualität gegen Geschwindigkeit und Speicher). Jede Zeile zeigt ihre Einschätzung, den benötigten Speicher, etwa wie schnell es laufen würde, und die Downloadgröße, mit einer Schaltfläche **Installieren**. Installieren ist ausgegraut, solange Ollama hier nicht läuft, oder bei einer Größe, die zu groß ist.
- Bei einem vLLM-Modell: „Läuft mit vLLM, das es auf einer GPU startet, wenn eine Sitzung es verwendet“, dieselben Angaben, Hinweise dazu, welche Grafikkarte es verwenden würde, und eine Schaltfläche **Herunterladen**. Wenn vLLM nicht installiert ist oder dein vLLM diese Art von Modell noch nicht ausführen kann, steht das dort, und wenn es eine GGUF-Version gibt, bietet es stattdessen **überprüfen** für diese an.
- Bei allem anderen: „Keine Gewichte, die diese App ausführen kann (safetensors für vLLM, GGUF für Ollama).“

Die Angaben gehen von einer Unterhaltung mit bis zu etwa 32.000 Tokens aus, der Länge, die einem Modell auf diesem Computer zugestanden wird. **Schließen** klappt das Fenster zu.

### Installieren, und was dann passiert

Klicke auf **Installieren** (Ollama) oder **Herunterladen** (vLLM). Der Download erscheint mit seinem Fortschritt unter **Auf diesem Computer**. Wenn er fertig ist, erscheint das Modell im **Modell**-Menü von Custom. Ein abgebrochener vLLM-Download setzt dort fort, wo er aufgehört hat, wenn du es erneut versuchst. Ein vLLM-Modell, das für keine einzelne Grafikkarte groß genug ist, wird beim Start mit 8 Bit (FP8) gespeichert, was den Speicher für seine Gewichte bei geringem Verlust halbiert (Karten ab NVIDIAs RTX-30-Serie und A100); wenn es immer noch nicht passt, wird es auf mehrere Karten verteilt, sofern sie zusammen Platz haben.

### Zugriffsbeschränkte und private Modelle

Manche Hersteller verlangen, dass du zuerst ihre Bedingungen akzeptierst; ihre Modelle zeigen **Zugriffsbeschränkt**. Akzeptiere die Bedingungen auf der Seite des Modells auf huggingface.co und füge dann ein Hugging-Face-Token hinzu (siehe [Hugging-Face-Token](#hugging-face-token)). Auch private Modelle brauchen das Token.

## Modelle über OpenRouter nutzen

OpenRouter (openrouter.ai) gibt dir mit einem einzigen Key Hunderte Modelle von vielen Herstellern, abgerechnet nach Nutzung.

### Key hinzufügen

1. Hol dir einen Key auf openrouter.ai (der Abschnitt verlinkt dorthin).
2. Klicke in [Einstellungen → Agents → Modelle](/settings?s=models&find=OpenRouter) in der Zeile **Dein OpenRouter-Key** auf **Key hinzufügen**, füge ihn im Dialog in **Dein OpenRouter-Key: sk-or-…** ein und klicke auf **Speichern**.

Die Zeile zeigt dann **Verbunden mit OpenRouter** mit dem Anfang und dem Ende deines Keys. **Key entfernen** im **⋯**-Menü der Zeile vergisst den Key. Der Key bleibt auf dem Server und wird nie wieder angezeigt.

Du kannst ihn auch dann hinzufügen, wenn er zum ersten Mal gebraucht wird: Ein Agent, der ohne Key ein Bild, eine Zeichnung, ein Video oder einen Sound erstellen will, fragt in der Unterhaltung auf einer Karte danach ([Wenn ein Agent den OpenRouter-Key braucht](/guide/documents-voice#when-an-agent-needs-the-openrouter-key)), und die KI-Tools der Editoren fragen in ihrem Dialog danach. In beiden Fällen wird er hier gespeichert.

### Vorgeschlagene Modelle

Bevor du suchst, listet **Vorgeschlagen** in der Gruppe **OpenRouter-Modelle hinzufügen** vier Modelle für Custom auf, jeweils mit Begründung: **GPT-6 Luna** (Schnell und günstig), **Grok 4.7** (Gut, mit weniger Ablehnungen), **GPT-6.1 Sol** (Besser) und **Claude Opus 5.5** (Insgesamt am besten). Mit **Hinzufügen** nimmst du eines in die Auswahlmenüs auf. Für Bilder, Musik, Stimmen und Videos sind die Auswahlen der App Seedream 5.0 Pro (und Flash, schneller und günstiger), Lyria 3 Pro, Seed Audio 1.0 und Seedance 2.5: siehe [Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images).

### Den Katalog durchsuchen

Gib in derselben Gruppe etwas in **OpenRouter durchsuchen: deepseek, qwen, claude…** ein, klicke auf einen der vorgeschlagenen Namen oder auf **Neueste ansehen**. Filter:

- **Tool-Aufrufe**: Modelle, die Tools nativ aufrufen, so wie Custom sie am besten nutzt (**Beste Übereinstimmung** zeigt diese zuerst).
- **Verarbeitet Bilder**
- **Schlussfolgern**: Modelle, die nachdenken, bevor sie antworten.
- **Kostenlos**

Das Menü rechts sortiert die Ergebnisse: **Beste Übereinstimmung** (solange du nach Namen suchst), **Neueste**, **Günstigstes** oder **Größter Kontext**. Du bekommst bis zu 50 Modelle, zunächst die ersten acht und mit **Alle anzeigen** den Rest.

Jedes Modell zeigt Hersteller, Name und Kennzeichnungen: **Neueste** (immer die neueste Version des Herstellers), **Neu** (in den letzten drei Wochen aufgelistet), **Kostenlos**, **Schlussfolgern**, **Bilder** und **Keine nativen Tools** (Custom beschreibt dann seine Tools in den Anweisungen und liest seine Aufrufe aus dem Text). Darunter stehen: wie viel es auf einmal lesen kann („128K context“), die längste Antwort („16K out“), der Preis pro Million Tokens für Eingabe und Ausgabe, der Monat der Aufnahme, eine kurze Beschreibung und der OpenRouter-Name.

### Modelle zu den Auswahlmenüs hinzufügen

Klicke bei einem Modell auf **Hinzufügen**. Seine Zeile zeigt dann **Hinzugefügt**, und das Modell erscheint in der Gruppe **Deine OpenRouter-Modelle** („In den Modell-Auswahlmenüs“) oberhalb der Suche und im Menü **Modell** von Custom. Klicke auf das × bei einem davon, um es aus den Menüs zu entfernen. Solange du nicht mindestens eines hinzugefügt hast, bietet OpenRouter keine Modelle an („Füge mindestens ein Modell hinzu, um OpenRouter zu nutzen.“).

## Ollama, vLLM oder einen anderen Endpunkt verbinden

Die Gruppe **Modelllaufzeitumgebungen und Endpunkte** verbindet die Programme, die Modelle ausführen. Du öffnest sie unter [Einstellungen → Agents → Modelle](/settings?s=models&find=Runtimes%20and%20endpoints).

### Ollama

Ollama ist ein kostenloses Programm, das Modelle auf deinem Computer ausführt, auf der Grafikkarte oder dem Prozessor. Seine Zeile zeigt „läuft“ mit der Version oder „läuft unter dieser Adresse nicht“ mit einem Link **Ollama installieren**. Die Adresse ist `http://127.0.0.1:11434`, solange du sie nicht änderst: Gib im Feld eine andere ein, und daneben erscheint **Speichern**. Jedes Modell in diesem Ollama erscheint in der Modellliste von Custom, auch solche, die du außerhalb der App geladen hast.

### vLLM

vLLM ist ein schneller Server für Modelle auf NVIDIA-Grafikkarten und der Weg, auf dem Modelle von Hugging Face hier standardmäßig laufen. Ein Modell, das für eine Karte zu groß ist, läuft darauf mit 8 Bit oder verteilt auf 2, 4 oder 8 Karten. Auf einem Mac läuft vLLM auf Apple Silicon mit seinem Metal-Plugin (vllm-metal). Die App findet es selbstständig im PATH oder in einer conda- oder venv-Umgebung und zeigt seine Version und seinen Speicherort an. Wenn dort „nicht gefunden (pip install vllm), oder gib den Befehl an“ steht, installiere es oder gib den vollständigen Pfad zu seinem `vllm`-Befehl im Feld ein und klicke auf **Speichern** (erscheint, sobald du tippst). Lass das Feld leer, damit die App selbst sucht.

### Andere OpenAI-kompatible Endpunkte

Viele Programme und Dienste antworten wie die API von OpenAI: LM Studio, der Server von llama.cpp, andere Anbieter. So fügst du einen hinzu:

1. Klicke neben dem Titel der Gruppe auf **Endpunkt hinzufügen**.
2. Gib im Dialog einen **Name**n, seine Adresse (etwa `http://localhost:1234/v1`) und einen **Key (optional)** ein.
3. Klicke auf **Hinzufügen**.

Der Endpunkt erscheint als Zeile mit seiner Adresse und der Anzahl der Modelle, die er anbietet. Seine Modelle erscheinen in der Liste von Custom als „Modell (Name)“. Mit dem × entfernst du ihn. Wenn du einen weiteren Endpunkt mit demselben Namen hinzufügst, ersetzt er den ersten.

Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) darf einen Endpunkt nutzen, dessen Adresse dieser Computer oder dein privates Netzwerk ist: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` bis `172.31.…` oder ein Name, der auf `.local` endet. Jede andere Adresse gilt als online, auch wenn sie zu deinem eigenen Server führt: Nutze stattdessen dessen private Adresse. Dasselbe gilt für die Adresse von Ollama, und die Cloud-Modelle von Ollama (ihre Namen enden auf „cloud“) gelten immer als online.

### Hugging-Face-Token

Mit einem [Hugging-Face-Token](/settings?s=models&find=Hugging%20Face%20token) kann die App geschützte oder private Modelle herunterladen (die Zeile sagt „Nur für geschützte oder private Modelle“). Erstelle einen in den Einstellungen deines Hugging-Face-Kontos, klicke auf **Token hinzufügen**, füge ihn im Dialog ein (er beginnt mit `hf_`) und klicke auf **Speichern**. Die Zeile zeigt dann seinen Anfang und sein Ende, mit **Token entfernen** im **⋯**-Menü.

## Einen Agent fragen

- „Welche Agentenprogramme sind hier installiert? Installiere Gemini CLI.“
- „Sind Claude Code und Codex aktuell? Aktualisiere sie jetzt.“
- „Füge OpenCode zu meinen Agents hinzu.“
- „Füge Grok Build zu meinen Agents hinzu und melde es mit meinem Grok-Abo an.“
- „Füge ein zweites Grok-Konto für die Arbeit hinzu und starte meine nächste Sitzung damit.“
- „Starte meine nächste Grok-Sitzung mit Aufwand xhigh.“
- „Wie viel von meinem Grok-Tarif ist diese Woche noch übrig?“
- „Nutze alle meine Grok-Konten: Wenn eines sein Limit erreicht, mach mit einem anderen weiter.“
- „Füge Gemini CLI und Goose zu meinen Agents hinzu und sag mir, was ich noch installieren muss.“
- „Finde auf Hugging Face ein Modell, das auf diesem Computer gut läuft und Bilder verarbeitet, prüfe es und installiere die beste Größe.“
- „Füge das neueste DeepSeek-Modell von OpenRouter zu meinen Modellen hinzu.“ (sobald dein OpenRouter-Key eingerichtet ist)
- „Mach das Hilfsmodell zu einem, das Bilder verarbeitet.“
- „Nutze das Sonnet aus meinem Claude-Tarif in einer Custom-Sitzung und zeig mir, was es kostet.“
- „Stoppe das laufende vLLM-Modell, um die Grafikkarte freizugeben.“
- „Nutze alle meine Claude-Konten: Wenn eines sein Limit erreicht, mach mit einem anderen weiter.“
- „Wenn alle meine Claude-Konten aufgebraucht sind, mach mit meinem API-Guthaben weiter.“
- „Welches Modell nutzt jede Leistungsstufe für Claude Code und Codex? Lass Max für Claude Code Opus bedeuten.“
- „Welche Modelle nutzen die Leistungsstufen von Custom, und warum ist Am besten leer?“
- „Warum bittet mich Hydor, mich erneut bei Claude Code anzumelden?“
- „Mein Claude-Code-Konto ist abgemeldet: Welche meiner Sitzungen warten darauf, und können sie mit einem anderen Konto weitermachen?“
