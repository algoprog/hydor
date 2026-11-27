# Agenten, Konten und Modelle

Hydor führt mehrere KI-Agenten aus: Claude Code, Codex, Custom (der eigene Agent der App, für jedes Modell) und weitere Agenten mit ACP-Unterstützung, etwa Gemini CLI, OpenCode, Qwen Code, Goose, Grok Build oder Antigravity CLI (Googles Agent für deinen Google-KI-Tarif). Dieses Thema erklärt, worin sie sich unterscheiden, wie ihre Programme installiert und aktuell gehalten werden, wie du sie anmeldest (auch mit mehr als einem Konto) und woher die Modelle von Custom kommen: von OpenRouter, von Ollama, aus Hugging-Face-Modellen, die auf diesem Computer laufen, oder von jedem OpenAI-kompatiblen Endpunkt.

![Den Agenten auf der Startseite auswählen: Claude Code, Codex oder Custom](images/agents-models.webp)

## Welchen Agenten sollte ich verwenden?

Ein Agent ist das Programm, das in einer Sitzung die Arbeit erledigt: Es liest deine Nachricht, nutzt Werkzeuge (Dateien, Befehle, das Web) und antwortet. Das Modell ist die KI dahinter. Jeder Agent hier bekommt dieselbe Unterstützung von der App (Websuche, den Browser, Memory, Skills, deine Verbindungen), aber sie unterscheiden sich darin, woher ihre Modelle kommen.

- **Claude Code** (Anthropic). Läuft mit deinem Claude-Tarif oder rechnet über ein Anthropic-API-Konto ab. Seine Modelle stammen von Anthropic (Opus, Sonnet, Haiku). Es hat eigene Nutzungslimits, die die [Seite „Nutzung“](/usage) anzeigt.
- **Codex** (OpenAI). Läuft mit deinem ChatGPT-Tarif. Seine Modelle stammen von OpenAI. Auch hier gibt es Nutzungslimits, die auf der Seite „Nutzung“ angezeigt werden. Codex ist in der App enthalten.
- **Custom**, der eigene Agent der App. Er nutzt die Modelle deiner Claude- und ChatGPT-Tarife (über die Anmeldungen von Claude Code und Codex) sowie jedes Modell, das du unter [Einstellungen → Agenten → Modelle](/settings?s=models) hinzufügst: Modelle über OpenRouter, Modelle auf diesem Computer (mit Ollama oder vLLM) oder jeder OpenAI-kompatible Endpunkt. Verwende ihn für offene Modelle, günstigere Modelle oder Modelle, die deinen Computer nie verlassen. Siehe [Custom, der eigene Agent der App](/guide/custom).
- **Agenten mit ACP-Unterstützung**: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build (xAIs Coding-Agent mit den Grok-Modellen), Antigravity CLI (Googles Coding-Agent, mit deinem Google-KI-Tarif) und weitere oder ein eigener Befehl. ACP (das Agent Client Protocol) ist eine gemeinsame Art, wie eine App mit einem Agentenprogramm spricht. Jeder meldet sich einmal an und nutzt seine eigenen Modelle: die meisten in ihrem eigenen Programm, Grok Build und Antigravity CLI unter [Einstellungen → Agenten → Konten](/settings?s=accounts). Seit dem 18. Juni 2026 bedient Gemini CLI Google AI Pro und Ultra (oder Gemini Code Assist für Einzelpersonen) nicht mehr: Für diese Tarife ist Googles Terminal-Agent Antigravity CLI (siehe [Antigravity CLI](#antigravity-cli)). Gemini CLI bleibt für einen Gemini-API-Key oder eine Lizenz für Gemini Code Assist Standard oder Enterprise.

Was jeder in der App kann:

- Ziele (die App hält den Agenten Runde für Runde bei der Arbeit, bis Prüfungen, auf die ihr euch geeinigt habt, erfüllt sind; siehe [Ziele](/guide/goals)): jeder Agent, Claude Code, Codex, Custom und die anderen ACP-Agenten. Ein `/goal`, das du in einem Claude-Code- oder Codex-Chat eingibst, ist das eigene, einfachere Ziel dieses Programms. Forks (eine Kopie der Sitzung ab einer früheren Antwort): Claude Code, Codex und Custom. Die anderen ACP-Agenten nicht.
- **Fortsetzen in…** (die Unterhaltung an einen anderen Agenten übergeben): von Claude Code oder Codex aus zum jeweils anderen oder zu Custom.
- Aufwand (wie intensiv das Modell nachdenkt): Claude Code, Codex, Grok Build und Antigravity CLI sowie jeder andere ACP-Agent, dessen Modelle ihn anbieten.
- Mehr als ein Konto und Kontowechsel bei einem Limit: Claude Code, Codex und Grok Build. Tarif-Nutzungslimits auf der Seite „Nutzung“: diese drei sowie eine Karte für Antigravity CLI, die sagt, wo du deren Nutzung siehst (sie hat nur eine Anmeldung und funktioniert nur in Sitzungen, die du selbst startest: siehe [Antigravity CLI](#antigravity-cli)).
- Zurücksetzen von Limits und API-Guthaben bei einem Limit: nur Claude Code und Codex.

## Agent und Modell für eine neue Sitzung auswählen

Auf der Startseite (`/`) zeigt die Zeile unter dem Nachrichtenfeld, wer die Arbeit erledigt.

1. Klicke auf **Ausführungsumgebung**. Die Liste zeigt **Claude Code** („Anthropic · Claude-Tarif oder API-Key“), **Codex** („OpenAI · ChatGPT-Tarif oder API-Key“), **Custom** („Jedes Modell: OpenRouter, Ollama, vLLM“) und jeden Agenten, den du unter Einstellungen → Weitere Agenten hinzugefügt hast („ACP-Agent · “ und sein Befehl). Ganz unten öffnet **Modelle für Custom** die Einstellungen → Modelle, und **Agenten hinzufügen oder verwalten** öffnet die Einstellungen → Weitere Agenten.
2. Klicke auf **Modell** und wähle eines aus. **Automatisch**, ganz oben und zu Beginn ausgewählt, lässt die Leistungsstufen entscheiden: Am besten, und Max, wenn sich das Problem als zu schwer erweist (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](#tiers-a-model-for-each-kind-of-job)). Darunter zeigt die Liste nur die eigenen Modelle dieses Agenten. Das Standardmodell des Agenten ist mit „Standard“ markiert. Ältere Versionen eines Modells verbergen sich hinter einer Zeile wie „2 ältere Modelle“; klicke darauf, um sie zu sehen. Bei mehr als acht Modellen steht oben ein Feld **Modelle suchen**: Tippe ein paar Buchstaben und drücke die Eingabetaste, um den ersten Treffer zu übernehmen. Wenn der Agent nicht wie von der App gewünscht gestartet ist, um seine Modelle zu liefern, sagt das Menü es mit den eigenen Worten des Agenten zur Ursache, und **Erneut versuchen** fragt noch einmal an.
3. Unter **Optionen** findest du **Aufwand** (für Agenten und Modelle, die ihn haben: Standard, Niedrig, Mittel, Hoch und so weiter; zu Grok Build siehe [Aufwand bei Grok Build](#effort-for-grok-build)) und **Berechtigungen** (was der Agent ohne Nachfrage tun darf). Auch mit Shift+Tab im Nachrichtenfeld wechselst du die Berechtigungen.

Die Startseite merkt sich, was du für jeden Ort, an dem du arbeitest, ausgewählt hast (jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**), auf jedem Gerät: Modell, Aufwand und Berechtigungen jedes Programms kommen dort so zurück, wie du sie verlassen hast (siehe [Was sich die Startseite merkt](/guide/sessions#what-the-start-page-remembers)).

Ein ACP-Agent außer Custom zeigt seine Auswahl für **Modell** und **Berechtigungen** erst nach seiner ersten Sitzung: Sie listet, was der Agent beim letzten Mal angeboten hat. Grok Build ist die Ausnahme: Seine Modelle mit den jeweils möglichen Aufwandsstufen erscheinen, sobald es hinzugefügt ist, weil die App Grok danach fragt. Die Modelle und Aufwandsstufen von Antigravity CLI erscheinen nach der ersten Sitzung, wenn die App sie beim Öffnen der Sitzung erfährt.

Wenn **Optionen** → **Vertraulich** aktiviert ist, ist **Ausführungsumgebung** auf **Custom** gesetzt und **Modell** listet nur die Modelle auf diesem Computer oder in deinem privaten Netzwerk, die besten davon zuerst: siehe [Eine Sitzung vertraulich halten](/guide/sessions#keep-a-session-confidential).

Auf einem Smartphone öffnet sich jedes dieser Menüs als Sheet vom unteren Bildschirmrand.

## Modelle mitten in einer Sitzung wechseln

In einer Sitzung stehen Modell, Aufwand und Berechtigungen unter dem Nachrichtenfeld. Sie bilden einen Chip, der etwa „Opus 5.5 · Hoch · Plan“ lautet: Klicke darauf für **Modell**, **Aufwand** und **Berechtigungen**.

Wähle ein anderes Modell, und die Sitzung läuft damit weiter:

- Claude Code wechselt sofort.
- Codex verwendet das neue Modell ab seinem nächsten Zug.
- Custom verwendet es ab seinem nächsten Schritt, auch mitten in einem Zug.
- Ein anderer ACP-Agent wechselt, wenn er eine Auswahl an Modellen anbietet.

Der **Aufwand** der Sitzung funktioniert genauso. Wähle einen, und der laufende Agent nutzt ihn ab seinem nächsten Zug. Wenn das Modell, zu dem du wechselst, den bisherigen Aufwand nicht unterstützt, zeigt die Auswahl den Standard dieses Modells, und das Modell läuft damit.

Das Modellmenü listet nur die Modelle des Agenten der Sitzung; bei einer vertraulichen Sitzung nur die auf diesem Computer oder in deinem privaten Netzwerk. Um eine Unterhaltung zu einem anderen Agenten zu verschieben, nutze das Menü der Sitzung (⋯) → **Fortsetzen in Codex**, **Fortsetzen in Claude Code** oder **Fortsetzen in Custom Agent** (aus Claude-Code- und Codex-Sitzungen; Custom erscheint, sobald es ein Modell hat). Deine nächste Nachricht startet dann eine neue Sitzung dieses Agenten im selben Ordner, mit der bisherigen Unterhaltung. Eine gestoppte Sitzung macht mit dem Modell weiter, das sie zuletzt verwendet hat, es sei denn, du wählst vor dem Senden ein anderes.

## Aufwand bei Grok Build

Die Modelle von Grok unterstützen einen Denkaufwand, dieselbe Auswahl, die dir Claude Code und Codex bieten:

- Grok 4.6 (und neuere Modelle, die dasselbe anbieten): **xhigh**, **high**, **medium** oder **low**. **Hoch** ist der Standard.
- Grok 4.5: **high**, **medium** oder **low**.

Wähle auf der Startseite unter **Ausführungsumgebung** **Grok Build**, dann **Optionen** → **Aufwand**: Er listet die Aufwandsstufen des gewählten Modells, mit **Standard**. Sie erscheinen, sobald Grok Build hinzugefügt ist, noch vor der ersten Sitzung. Eine laufende Grok-Build-Sitzung ändert ihren Aufwand in ihrer eigenen Auswahl **Aufwand** (der Chip unter dem Nachrichtenfeld), und auch eine [App](/guide/apps) nimmt beim Ausführen einen an. Wenn du eine Sitzung zu einem Modell wechselst, das den bisherigen Aufwand nicht unterstützt (xhigh bei Grok 4.5), zeigt die Auswahl den Standard dieses Modells, und damit läuft das Modell.

Das gilt nicht nur für Grok: Jeder andere Agent mit ACP-Unterstützung, dessen Modelle Aufwandsstufen anbieten, bekommt dieselbe Auswahl **Aufwand**.

## Leistungsstufen: ein Modell für jede Art von Aufgabe

Agenten wählen Modelle nach Leistungsstufe statt nach Namen: **Schnell** für kleine, sehr klare Aufgaben, deren Ergebnis sich prüfen lässt, **Standard** für klare Aufgaben mittlerer Größe, **Am besten** für den Haupt-Agenten einer Sitzung, der plant, Subagenten koordiniert und ihre Arbeit prüft, und **Max** für die schwierigsten Probleme. Der größte Teil einer Aufgabe besteht aus klaren Teilen, die ein günstigeres Modell gut erledigt, daher kostet eine Sitzung so weniger, ohne dass das Ergebnis schlechter wird: Das stärkste Modell im Raum plant die Arbeit trotzdem und prüft sie.

Auf der Startseite öffnet **Modell** mit **Automatisch**: Die Sitzung startet mit Am besten (dasselbe **Automatisch** startet die Sitzungen einer [Geplanten Aufgabe](/guide/tasks#model-effort-permissions-and-other-options), und eine [App](/guide/apps) kann mit einer Leistungsstufe statt mit einem Modell nach Namen denken). Ihr Haupt-Agent übergibt klare Teile an Subagenten mit Standard und Schnell und kann sich selbst auf Max setzen, wenn ein Problem schwieriger ist, als Am besten bewältigen kann (eine Korrektur, die zweimal gescheitert ist, eine Ursache, die er nicht findet, ein Beweis); eine Zeile in der Unterhaltung sagt das, mit Begründung. Eine Anfrage geht nicht allein wegen ihres Wortlauts an Max: Am besten löst das meiste, was schwierig klingt, günstiger. Wähle stattdessen ein Modell nach Namen, und die Sitzung denkt mit diesem; ihre Subagenten bekommen weiterhin Leistungsstufen. Ein Agent von dir kann stattdessen mit einer Leistungsstufe denken (siehe [Womit ein Agent denkt: Leistungsstufen](/guide/agents#what-an-agent-thinks-with-tiers)).

[Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) legt fest, was jede Stufe für jedes Programm bedeutet: eine Zeile je Stufe, mit einem Schalter neben dem Titel der Gruppe, um das Programm zu wählen (**Claude Code**, **Codex** oder **Custom**), und in jeder Zeile ein Modell und, für Claude Code und Codex, ein Aufwand. Das (i) einer Stufe sagt mehr dazu. Zu Beginn ist bei Claude Code Schnell Haiku, Standard Sonnet, Am besten Opus und Max das neueste Fable; bei Codex ist Schnell Luna, Standard Terra, Am besten Sol und Max Astra (bei einem Tarif ohne eines davon das nächstliegende, das er anbietet, mit mehr Aufwand für die höhere Stufe, wo sich zwei ein Modell teilen); die Stufen von Custom füllen sich selbst: Eine Stufe, die du in Ruhe lässt, nimmt das neueste Modell ihrer Art aus den Modellen, die Custom hat. Aus deinem Claude-Tarif sind das Haiku für Schnell, Sonnet für Standard, Opus für Am besten und das neueste Fable für Max; sonst aus deinem ChatGPT-Tarif Luna, Terra, Sol und Astra; sonst aus den Modellen, die du hinzugefügt hast und die nicht auf diesem Computer laufen (OpenRouter, ein Endpunkt), deren Namen eine dieser Familien nennen. Ein Modell auf diesem Computer wird nie für dich gewählt, weil sein Name nicht verrät, wie stark es ist, und ein kleines Modell (Haiku, Luna) wird nie zu Am besten: Mit nur kleinen oder lokalen Modellen bleiben die Stufen leer, bis du wählst, und eine Custom-Sitzung behält dann das Modell, das sie gewählt hat. Sobald Am besten ein Modell nennt, bietet die Startseite **Automatisch** für Custom an, und seine Sitzungen koordinieren Subagenten (Hydor-Subagenten, wie in jeder Sitzung). Auf dem Tab **Custom** kannst du für eine Stufe jedes seiner Modelle nennen (siehe [Woher die Modelle von Custom kommen](#where-customs-models-come-from)). Eine Stufe, die du in Ruhe lässt, folgt dem neuesten Modell ihrer Art beim jeweiligen Programm. **Zurück zu den Standardeinstellungen** im Menü **⋯** neben dem Titel stellt sie wieder her, auch die Auswahl von Custom.

Zwei Schalter in der Gruppe **Modellstufen in Sitzungen** unter den Leistungsstufen legen fest, wie Sitzungen sie nutzen:

- **Subagenten koordinieren** (zu Beginn an): Der Haupt-Agent einer Sitzung soll planen, klare Teile an Subagenten mit günstigeren Stufen übergeben und ihre Arbeit prüfen, und ein Subagent, der ohne Stufe angefordert wird, bekommt Standard. Ist der Schalter aus, arbeiten Agenten allein, sofern sie sich nicht anders entscheiden, und die Startseite und das Aufgabenformular haben kein Automatisch.
- **Max für schwierige Probleme** (zu Beginn an): Ein Haupt-Agent auf Automatisch darf sich selbst auf Max setzen, wenn ein Problem für Am besten zu schwer ist. Ist der Schalter aus, bleiben Sitzungen auf Automatisch bei Am besten.

## Agentenprogramme installieren und aktualisieren sich selbst

Claude Code, Codex, Gemini CLI, Grok Build und die anderen sind Programme auf diesem Computer. Du musst sie nicht von Hand installieren. Die Ausnahme ist Antigravity CLI: Google verlangt, dass man es selbst installiert, deshalb tut die App es nicht (siehe [Antigravity CLI](#antigravity-cli)). Es aktualisiert sich selbst.

Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Agent%20programs) und sieh dir die Gruppe **Agentenprogramme** an. Sie listet Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build (sobald du es hinzugefügt hast) und die Agenten, die einen ACP-Adapter brauchen, jeweils mit der Version, die die Sitzungen ausführen, und der Herkunft:

- **deine eigene Installation**: Du hast es selbst installiert (bei Grok Build auch mit dem eigenen Installer von xAI, der es in `~/.grok/bin` ablegt).
- **von der App installiert**: Die App hat es in ihrem eigenen Ordner installiert.
- **In der App enthalten**: Codex wird mit der App ausgeliefert.
- **Nicht installiert: Wird bei der ersten Nutzung automatisch installiert**: fehlt. Klicke auf **Installieren**, um es jetzt zu holen.

Eine Zeile sagt außerdem „… ist erschienen“, wenn eine neuere Version verfügbar ist. Die Zeile von Codex ergänzt „deins im Terminal: …“, wenn du auch ein eigenes Codex hast: Die Sitzungen führen das der App aus, und ein Terminal führt deins aus.

Ein fehlendes Programm installiert sich außerdem beim ersten Bedarf selbst: Claude Code, wenn du dich dort anmeldest oder eine Claude-Code-Sitzung startest, ein ACP-Agent, wenn du ihn unter Einstellungen → Agenten → Weitere Agenten hinzufügst oder eine Sitzung mit ihm startest. Die App installiert sie mit npm in ihren eigenen Ordner, du brauchst also keine Administratorrechte.

Goose, Kimi CLI, Antigravity CLI und einige andere Agenten stehen nicht in dieser Liste: Installiere sie selbst (Einstellungen → Agenten → Weitere Agenten zeigt, wo du sie bekommst). Ein Agent, der einen ACP-Adapter braucht, installiert sich in zwei Teilen, dem Adapter und dem Agenten selbst; die Liste zeigt für beide eine Zeile.

## Agentenprogramme aktuell halten

Wenn [**Automatisch aktualisieren**](/settings?s=accounts&find=Update%20automatically) eingeschaltet ist, die letzte Zeile unter **Agentenprogramme** (die Option ist standardmäßig an, solange du sie nicht ausschaltest), bringt die App jedes Agentenprogramm einmal am Tag auf die neueste Version. Der erste Durchlauf findet etwa zehn Minuten nach dem Start der App statt.

- Die Kopien, die die App installiert hat, werden mit npm in ihrem eigenen Ordner aktualisiert. Codex wechselt zu einer Kopie, die neuer ist als die mit der App gelieferte.
- Deine eigenen Installationen werden mit ihrem eigenen Updater aktualisiert: `claude update` für Claude Code, `codex update` für Codex (die Version, die dein Terminal startet), `opencode upgrade` für OpenCode, `grok update` für Grok Build.
- Gemini CLI, Qwen Code, Auggie, Grok Build oder ein Agent mit ACP-Adapter, die du mit `npm install -g` installiert hast, werden mit npm aktualisiert, sofern dein Benutzer in diesen Ordner schreiben darf. Alles, was auf anderem Weg installiert wurde, musst du so aktualisieren, wie du es installiert hast.
- Claude Code folgt seiner eigenen Release-Linie: der stabilen, wenn in den Einstellungen `"autoUpdatesChannel": "stable"` steht, sonst der neuesten.
- Wenn du die eigenen Updates von Claude Code mit `DISABLE_AUTOUPDATER=1` ausgeschaltet hast (das Docker-Image tut das), aktualisiert die App dein Claude Code ebenfalls nicht von selbst. **Jetzt aktualisieren** tut es trotzdem.

Die App behält eine neue Version erst, wenn sie so funktioniert, wie die Sitzungen sie nutzen. Claude Code muss beim Start einer Sitzung antworten und seine Modelle auflisten, Codex muss seinen App-Server starten und seine Modelle auflisten, und die übrigen müssen starten und ihre Version nennen. Dafür ist keine Anmeldung nötig, und dein Tarif wird nicht beansprucht. Jedes Programm hat eine Minute Zeit zu antworten, und es zählt nur die Zeit, in der der Computer wach ist. Ein Mac, der mitten in der Prüfung in den Ruhezustand geht, verbraucht die Minute also nicht. Ein Programm, das beim ersten Mal langsam antwortet (ein Mac sieht ein neues Programm erst durch, bevor es zum ersten Mal läuft), wird mit zwei weiteren Minuten neu gestartet und scheitert nur, wenn es auch dann nicht antwortet. Eine Version, die scheitert, wird rückgängig gemacht:

- Eine von der App installierte Kopie oder eine deiner eigenen, die sie mit npm aktualisiert hat, geht auf die vorherige Version zurück.
- Bei deinem eigenen Claude Code laufen die Sitzungen weiter mit der vorherigen Version, die der Installer von Claude Code neben der neuen aufbewahrt. Der Befehl `claude` im Terminal bleibt auf der neuen. In der Zeile steht „… did not work here“.
- Eine gescheiterte Version wird nicht von selbst erneut versucht, die nächste aber schon, und **Jetzt aktualisieren** versucht sie erneut.

Unter dieser Zeile steht, wann die App zuletzt nachgesehen hat, etwa „Up to date · checked 2h ago“, mit **Jetzt prüfen**, um erneut nachzusehen. Wenn neuere Versionen verfügbar sind, steht das dort, mit **Jetzt aktualisieren**, um alle auf einmal zu installieren (es gibt keine Schaltfläche pro Programm). Während der Aktualisierung zeigt die App, welches Programm gerade dran ist. Die Zeilen darunter sagen, was das letzte Update geändert hat, etwa „Claude Code 2.1.308 → 2.1.316“, oder warum eine Version nicht installiert werden konnte.

Laufende Sitzungen machen mit der Version weiter, mit der sie gestartet sind. Neue Sitzungen nutzen die neue. Ist **Automatisch aktualisieren** ausgeschaltet, sieht die App trotzdem einmal am Tag nach und zeigt, was verfügbar ist, installiert aber nichts, bis du auf **Jetzt aktualisieren** klickst.

## Bei Claude Code, Codex und Grok Build anmelden

Claude Code und Codex brauchen eine Anmeldung, bevor sie arbeiten können, ebenso Grok Build, sobald du es hinzugefügt hast (siehe [Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen](#add-gemini-cli-opencode-and-other-acp-agents)). Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts) (auf dem Smartphone sind die Einstellungen eine Liste von Bereichen: tippe unter „Agenten“ auf **Konten**; der Titel oben bringt dich zurück). Die Gruppe **Konten** (ihr (i) erklärt, dass dies die Anmeldungen bei Claude Code, Codex und Grok Build sind, die deine Sitzungen nutzen, und dass du ein weiteres Abonnement hinzufügen kannst, zum Beispiel ein berufliches und ein privates, und beim Start einer Sitzung eines auswählst) listet zuerst die eigene Anmeldung jedes Agenten auf, danach die Konten, die du dafür hinzugefügt hast. Auch die eigene Anmeldung von Grok Build hat dort eine Zeile, **Grok Build**, die erscheint, sobald es hinzugefügt ist. Jede zeigt ein grünes Häkchen mit E-Mail, Tarif und Anmeldemethode oder ein rotes Kreuz mit „Not signed in“ oder dem, was schiefgegangen ist.

So meldest du dich an:

1. Klicke neben dem Agenten auf **Anmelden**.
2. Wähle die Methode:
   - Claude Code: **Claude-Abonnement** (dein Claude-Tarif) oder **Konsole (API-Abrechnung)** (ein Anthropic-API-Konto).
   - Codex: **Gerätecode** oder **Browserumleitung**.
   - Grok Build: nichts zu wählen, die Anmeldung läuft immer über einen Code.
3. Klicke auf **Anmeldelink abrufen**.
4. Folge den Schritten, die der Dialog zeigt:
   - Claude Code: Öffne den Link (**Anmeldeseite öffnen**), genehmige den Zugriff in deinem Browser, füge dann den Code, den die Seite zeigt, in **Code von der Seite einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Codex, Gerätecode: Öffne den Link auf einem beliebigen Gerät, melde dich bei ChatGPT an und gib den einmaligen Code ein, den der Dialog zeigt. Der Dialog bemerkt von selbst, wenn du fertig bist.
   - Codex, Browserumleitung: Nach der Anmeldung versucht dein Browser, eine „localhost“-Seite zu öffnen, und scheitert. Kopiere die Adresse dieser Seite, füge sie in **localhost-Adresse aus deinem Browser einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Grok Build: Du bekommst einen Link und einen einmaligen Code. Öffne den Link auf einem beliebigen Gerät, melde dich mit deinem Grok-Konto an und bestätige den Code (**2. Bestätige diesen Code**). Es wird nichts zurückgefügt: Der Dialog bemerkt von selbst, wenn du fertig bist.

Wenn es klappt, siehst du „Claude Code is signed in“ (oder Codex, oder Grok Build). Wenn es scheitert, sagt der Dialog warum; klicke auf **Erneut versuchen**.

Antigravity CLI, der Agent von Google für deinen Google-KI-Tarif, hat in derselben Gruppe eine eigene Zeile **Antigravity CLI**, sobald du es hinzugefügt hast. Seine Anmeldung funktioniert etwas anders: siehe [Antigravity CLI](#antigravity-cli).

Nach der Anmeldung heißt die Schaltfläche **Konto wechseln**: Sie startet dieselbe Anmeldung für ein anderes Konto (bei Grok Build mit einem neuen Code). **Abmelden** findest du im Menü **⋯** der Zeile: Es meldet das Programm nach deiner Bestätigung auf diesem Computer ab, für jedes Terminal und jeden Editor, die es nutzen.

Wenn du eine Grok-Build-Sitzung startest, während es abgemeldet ist, bricht die Sitzung mit „Grok Build is not signed in: sign in with your Grok account in Settings → Agents → Accounts, then try again.“ ab. Melde dich dort an und sende deine Nachricht erneut. Ein xAI-API-Key in `XAI_API_KEY` in der Umgebung der Agenten funktioniert für Grok Build anstelle eines Abonnements.

Die Willkommenstour (über **Hilfe** in der Seitenleiste) fragt, welche Agenten und Modelle du nutzen möchtest, und führt dich ebenfalls durch diese Anmeldungen.

## Ein zweites Konto hinzufügen (beruflich und privat)

Du kannst mehr als ein Konto für Claude Code, Codex oder Grok Build anmelden, zum Beispiel einen beruflichen und einen privaten Tarif, und pro Sitzung eines auswählen.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts).
2. Klicke neben dem Titel der Gruppe **Konten** auf **Konto hinzufügen**.
3. Wähle **Claude Code**, **Codex** oder **Grok Build** (es wird angeboten, sobald Grok Build eingerichtet ist; Antigravity CLI wird nie angeboten: Es hat nur eine Anmeldung, siehe [Antigravity CLI](#antigravity-cli)), gib einen Namen ein (bis zu 40 Zeichen, etwa „Beruflich“ oder „Privat“) und klicke auf **Hinzufügen und anmelden**.
4. Der Anmeldedialog für das neue Konto öffnet sich. Melde dich an, wie oben beschrieben.

Jedes hinzugefügte Konto meldet sich für sich an und behält seinen eigenen Sitzungsverlauf. Deine Einstellungen, Anweisungen, Skills und Plugins werden mit der Hauptanmeldung des Agenten geteilt, Änderungen gelten also für beide. Bei Claude Code gilt ein Ordner, dem du mit der Hauptanmeldung vertraut hast, auch für ein hinzugefügtes Konto als vertrauenswürdig, sodass in dessen Sitzungen die eigenen Berechtigungsregeln des Ordners gelten. Zwei Konten desselben Agenten können nicht denselben Namen haben.

Ein hinzugefügtes Grok-Build-Konto hat einen eigenen Ordner mit seiner Anmeldung und dem eigenen Sitzungsverlauf von Grok. Es teilt die eigenen Einstellungen der Grok CLI mit deiner Hauptanmeldung: Konfiguration, Regeln (`AGENTS.md`), Skills, Plugins und MCP-Anmeldungen.

Jedes hinzugefügte Konto hat unter der eigenen Anmeldung des Agenten eine eigene Zeile mit **Anmelden** oder **Konto wechseln**; in seinem Menü **⋯** findest du **Abmelden**, **Umbenennen** und **Entfernen**:

- **Umbenennen** fragt nach einem neuen Namen.
- **Abmelden** sorgt dafür, dass die Sitzungen, die mit diesem Konto laufen, nicht mehr funktionieren, bis es sich wieder anmeldet.
- **Entfernen** nimmt das Konto aus der App. Seine Sitzungen verschwinden aus der Liste, ihr Verlauf bleibt aber auf der Festplatte, es sei denn, du setzt zusätzlich das Häkchen bei **Auch die Anmeldung und den Verlauf seiner Sitzungen löschen**. Ein Konto kannst du nicht entfernen, solange Sitzungen damit laufen: Stoppe sie zuerst.

Die [Seite „Nutzung“](/usage) zeigt für jedes hinzugefügte Konto von Claude Code, Codex oder Grok Build eine Karte mit den jeweils eigenen Limits.

## Das Konto wählen, mit dem eine Sitzung läuft

Wenn der gewählte Agent hinzugefügte Konten hat (bei Grok Build, sobald du eines hinzugefügt hast), zeigen die **Optionen** der Startseite eine Zeile **Konto**. Klicke darauf:

- **Deine Anmeldung** ist das eigene Konto des Programms (das erste für diesen Agenten unter **Konten**; bei Grok Build „The Grok Build CLI's own account“).
- Jedes hinzugefügte Konto ist mit seinem Namen aufgeführt.
- **Konten verwalten** öffnet Einstellungen → Agenten → Konten.

Die Startseite merkt sich deine Wahl für diesen Agenten, an jedem Ort gleich. Eine Sitzung, die mit einem hinzugefügten Konto läuft, zeigt oben in der Sitzung den Namen dieses Kontos mit einem Personensymbol. Erreicht dieses Konto ein Nutzungslimit, betrifft der Limit-Hinweis über dem Nachrichtenfeld dieses Konto. Das Konto wird beim Start der Sitzung festgelegt. Es ändert sich nur von selbst mit **Bei erreichtem Limit das Konto wechseln** (unten).

Um eine Sitzung selbst auf ein anderes Konto zu verschieben, klicke auf den **Konto**-Chip der Sitzung und wähle eines aus. Das funktioniert bei Sitzungen von Claude Code, Codex und Grok Build und gilt ab deiner nächsten Nachricht. Der Grok-Verlauf einer Grok-Build-Sitzung wandert mit; kann Grok sie unter dem anderen Konto nicht wieder öffnen, beginnt sie dort neu, mit einem Hinweis.

## Alle Konten nutzen: bei erreichtem Limit wechseln

Bei zwei oder mehr Konten für denselben Agenten kann die App alle nutzen: Ist bei einem die Nutzung aufgebraucht, geht deine Arbeit mit einem anderen weiter. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) und suche **Bei erreichtem Limit das Konto wechseln** in der Gruppe **Nutzungslimit erreicht** unter **Konten**, die erscheint, sobald du irgendein Konto hinzugefügt hast, auch eines für Grok Build (ihr (i) erklärt, dass die Sitzung, wenn die Nutzung des Kontos einer Sitzung aufgebraucht ist, zu einem anderen Konto dieses Agenten mit verbleibender Nutzung wechselt und weitermacht und dass neue Sitzungen ein Konto am Limit überspringen). Die Option ist von Anfang an eingeschaltet (schalte sie dort aus, wenn du das Konto lieber selbst wählst) und funktioniert, auch wenn kein Browser geöffnet ist.

- Wenn ein Zug stoppt, weil das Konto der Sitzung sein Nutzungslimit erreicht hat, wählt die App ein anderes angemeldetes Konto desselben Agenten, das noch Nutzung übrig hat (das am wenigsten genutzte), verschiebt die Sitzung samt Verlauf dorthin und sendet „… reached its usage limit, so this session now runs on …. Continue where you left off.“ Ein kurzer Hinweis am unteren Bildschirmrand sagt, zu welchem Konto sie gewechselt ist.
- Die Subagenten, die eine Claude-Code-Sitzung im Hintergrund ausführt, machen ebenfalls weiter. Die, die noch arbeiten, wenn das Limit eintritt, stoppen bei ihrem nächsten Schritt, ihre Arbeit bleibt erhalten, und die App wartet auf sie (höchstens zwei Minuten), bevor sie die Sitzung verschiebt. Die Nachricht nennt sie dann, und der Agent setzt jeden dort fort, wo er aufgehört hat. Erreichen nur die Subagenten ein Limit (eines allein für ihr Modell), wird die Sitzung verschoben, sobald ihr Zug beendet ist und keiner von ihnen mehr arbeitet.
- Hydor-Subagenten (die Sitzungen, die ein Agent startet, um einen Teil seiner Arbeit zu erledigen) sind eigene Sitzungen, daher wechselt jeder von selbst, wenn ein Limit seinen Zug stoppt. Der Agent, der ihn gestartet hat, erfährt, dass er weitermacht und nicht, dass er gescheitert ist, und bekommt seine Antwort, wenn er fertig ist.
- Deine Hauptanmeldung und jedes hinzugefügte Konto zählen alle mit. Konten von Claude Code übernehmen von Konten von Claude Code, Codex von Codex, Grok Build von Grok Build. Antigravity CLI hat keine anderen Konten, zu denen gewechselt werden könnte, daher gilt das dort nie (siehe [Antigravity CLI](#antigravity-cli)).
- Ein Grok-Build-Konto ist am Limit, wenn es sein Wochenlimit, sein Guthabenlimit oder sein Pay-as-you-go-Ausgabenlimit erreicht. Die Sitzung wechselt dann zu einem anderen angemeldeten Grok-Konto mit verbleibender Nutzung (dem am wenigsten genutzten) und macht mit „… reached its usage limit, so this session now runs on …“ weiter. Ein kurzes Rate-Limit (eine Anfragespitze) verschiebt nichts: Es geht von selbst vorüber. Der Limit-Hinweis über dem Nachrichtenfeld erscheint auch bei Grok-Sitzungen.
- Ein Ziel, das die App steuert, gehört der App und läuft deshalb auf dem neuen Konto weiter. Ein Ziel, das in Codex als `/goal` eingegeben wurde, wandert mit der Sitzung und läuft weiter.
- Es zählt die Nutzung, die für das Modell der Sitzung übrig ist. Ein Limit nur für ein Modell, etwa ein Wochenlimit für Fable, hält nur Sitzungen mit diesem Modell auf: Eine Sitzung mit Sonnet oder Opus wechselt trotzdem zu einem Konto, das nur seinen Fable-Anteil aufgebraucht hat. Ein Konto, dessen Plan das Modell der Sitzung nicht enthält, wird für sie übergangen (Claude Code sagt dann, das Modell „requires usage credits“, wie Fable bei einem Pro-Plan): Die Sitzung wechselt zu einem Konto, dessen Plan das Modell enthält, oder wartet, bis das erste davon zurückgesetzt wird, und der Hinweis sagt „Der Plan von … enthält … nicht“.
- Wenn alle Konten am Limit sind, wird nichts verschoben (außer **Bei erreichtem Limit API-Guthaben verwenden** ist eingeschaltet, unten, für Claude Code). Ist **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** eingeschaltet, macht die Sitzung weiter, wenn das erste Konto zurückgesetzt wird, und zwar auf diesem Konto. Das gilt auch für Grok-Build-Sitzungen. Mehr dazu unter [Nutzung, Limits und Kosten](/guide/usage#continue-sessions-automatically-after-a-limit).
- Lässt sich eine Sitzung nicht verschieben, sagt ein kurzer Hinweis am unteren Bildschirmrand, warum, und die Sitzung bleibt auf ihrem Konto: Ist **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** eingeschaltet, macht sie weiter, wenn dieses Konto zurückgesetzt wird. Eine Kopie ihres Verlaufs, die eine frühere Verschiebung im anderen Konto hinterlassen hat, hält die Verschiebung nicht auf: Der Verlauf ersetzt diese Kopie, und was in der Kopie anders ist, kommt in den **Papierkorb** auf der Dateiseite.
- Eine neue Sitzung, die auf einem Konto am Limit gestartet wird, startet stattdessen auf einem mit verbleibender Nutzung, und eine Nachricht, die du an eine Sitzung sendest, deren Konto am Limit ist, verschiebt die Sitzung zuerst, damit die Nachricht nicht abgewiesen wird. Mit deiner Nachricht erfährt der Agent, dass er jetzt auf einem Konto mit verbleibender Nutzung läuft, damit er nicht auf das Zurücksetzen des alten Kontos wartet, und welche seiner Subagenten weitermachen können.
- Sitzungen, die in VS Code oder in einem Terminal geöffnet sind, bleiben auf ihrem Konto.
- Zurücksetzungen von Limits (Codex-Reset-Guthaben, Claude-Reset-Gutschriften) und API-Guthaben gibt es weiterhin nur für Claude Code und Codex.
- Die eigenen kurzen Fragen der App an Claude Code oder Codex (das Hilfsmodell auf **Automatisch**, die schnellen Modellschritte einer App, Pull-Request-Beschreibungen, Befehlsvorschläge) gehen auf dieselbe Weise an dein nächstes angemeldetes Konto, wenn eines am Limit oder abgemeldet ist. Wenn weder Claude Code noch Codex antworten kann, springt eines deiner Custom-Modelle ein (siehe [Wenn ein Konto abgemeldet ist](#when-an-account-is-signed-out)).

## Wenn ein Konto abgemeldet ist

Ein Konto von Claude Code, Codex oder Grok Build kann abgemeldet werden: Seine Anmeldung ist abgelaufen oder wurde widerrufen, und das Programm meldet „Not logged in · Please run /login“ oder „401 Unauthorized“. Die App umgeht das, wo es geht, und bittet dich nur dann, dich erneut anzumelden, wenn nichts anderes die Aufgabe übernehmen konnte.

Antigravity CLI hat kein anderes Konto, auf das es ausweichen könnte. Wenn du eine Sitzung startest, während es abgemeldet ist, stoppt die Sitzung mit „Antigravity CLI is not signed in: sign in with your Google account in Settings → Agents → Accounts, then try again.“, und seine Zeile dort zeigt es als abgemeldet an. Melde dich dort an und sende deine Nachricht erneut.

- **Deine Sitzungen.** Wenn der Durchgang einer Sitzung abgewiesen wird, weil ihr Konto abgemeldet ist, und [Bei erreichtem Limit das Konto wechseln](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) eingeschaltet ist (das ist von Anfang an so), wechselt die Sitzung mit ihrem gesamten Verlauf zu einem anderen angemeldeten Konto desselben Agents, das noch Nutzung übrig hat, und macht weiter. Ein kurzer Hinweis am unteren Bildschirmrand lautet „<Sitzung>: <Konto> ist abgemeldet, daher geht es mit <anderes Konto> weiter“, und dem Agent wird mitgeteilt: „… is signed out, so this session now runs on …. Continue where you left off.“ Eine Nachricht, die du an eine Sitzung sendest, deren Konto vor kurzer Zeit als abgemeldet erkannt wurde, lässt die Sitzung zuerst auf dieselbe Weise wechseln, damit die Nachricht nicht abgewiesen wird.
- **Wenn eine Sitzung nicht wechseln kann.** Ist **Bei erreichtem Limit das Konto wechseln** ausgeschaltet oder hat kein anderes Konto dieses Agents noch Nutzung übrig, stoppt die Sitzung. Ein Banner über ihrem Nachrichtenfeld zeigt „<Konto> ist abgemeldet“ und „Diese Sitzung geht weiter, sobald du dich erneut anmeldest.“ mit einer Schaltfläche **Anmelden**. Sobald du wieder angemeldet bist, hier oder in einem Terminal, geht die Sitzung von selbst weiter, und dem Agent wird mitgeteilt: „Signed in again. Continue where you left off.“
- **Hintergrundarbeit.** Die kleinen Aufgaben des [Hilfsmodells](/settings?s=models&find=Helper%20model) auf **Automatisch** (Sitzungstitel, Memory-Notizen, Kürzen von [deinem Profil](/guide/memory#your-profile), schnelle Modellschritte einer App, Pull-Request-Beschreibungen …) überspringen ein abgemeldetes Konto 15 Minuten lang und versuchen es dann erneut, sodass eine Anmeldung, die du in einem Terminal vornimmst, bemerkt wird. Das nächste angemeldete Konto antwortet, danach Codex. Wenn weder Claude Code noch Codex antworten können (abgemeldet, am Limit oder nicht installiert), übernimmt eines deiner **Custom**-Modelle die Aufgabe: das Modell, das die Stufe **Schnell** von Custom in [Einstellungen → Agents → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) nennt (danach **Standard**, und für die seltenen größeren Aufgaben **Am besten**, dann **Max**), oder sonst das günstigste Modell, das du hinzugefügt hast (ein Modell auf diesem Computer gilt als kostenlos). Es werden höchstens zwei versucht. Was es kostet, wird wie die Nutzung jedes Custom-Modells gezählt.
- **Die Aufforderung zur Anmeldung.** Nur wenn nichts die Arbeit übernehmen konnte und ein Konto abgemeldet war, erscheint auf jeder Seite unten rechts eine Karte (auf einem Smartphone über dem Nachrichtenfeld). Ihr Titel lautet „Erneut bei Claude Code anmelden“ (oder Codex oder Grok Build), darunter „<Konto> ist abgemeldet.“, und sie nennt den Grund: „Hintergrundarbeit braucht es (Kürzen deines Profils), und kein anderes Konto und kein Custom-Modell konnte sie übernehmen.“ oder, bei einer Sitzung, die sie gestoppt hat, „… geht weiter, sobald du dich anmeldest.“ **Anmelden** öffnet denselben Anmeldedialog wie [Einstellungen → Agents → Konten](/settings?s=accounts). **Nicht jetzt** blendet die Karte für eine Stunde aus; eine Sitzung, die deswegen stoppt, zeigt die Karte erneut, und das Banner in dieser Sitzung bleibt. Es werden höchstens zwei Karten gleichzeitig angezeigt, dann führt „+N weitere“ zu Einstellungen → Agents → Konten. Eine Karte verschwindet, sobald das Konto wieder angemeldet ist, über die Karte, in den Einstellungen oder in einem Terminal (die App bemerkt es bei ihrem nächsten erfolgreichen Aufruf). Sie verschwindet auch, sobald die Hintergrundarbeit auf andere Weise wieder erledigt wird (ein anderes Konto oder ein Custom-Modell antwortet). Wenn sowohl Claude Code als auch Codex abgemeldet sind, wird nur nach Claude Code gefragt, das zuerst antwortet.

Dein Profil zeigt es ebenfalls: Wenn das Kürzen fehlgeschlagen ist, weil ein Konto abgemeldet ist, steht der Grund darunter („Dein Claude-Code-Konto „Work“ ist abgemeldet, und kein anderes Konto und kein Custom-Modell konnte das übernehmen: Melde dich erneut an (Einstellungen → Agents → Konten).“), und die Karte erscheint.

## API-Guthaben verwenden, wenn jedes Konto am Limit ist

Wenn du einen Anthropic-API-Key hast (von [console.anthropic.com](https://console.anthropic.com) → API keys), können deine Claude-Code-Sitzungen damit weitermachen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, anstatt zu stoppen. Das kostet Geld: Die Sitzung wird von Anthropic zu API-Preisen abgerechnet, solange sie so läuft, und ist nicht durch dein Abo abgedeckt.

1. Öffne [Einstellungen → Agents → Konten](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). Klicke in der Zeile eines Claude-Code-Kontos unter **Konten** (deine Hauptanmeldung oder ein Konto, das du hinzugefügt hast) auf **⋯** und dann auf **API-Key hinzufügen…**.
2. Füge den Key unter **Anthropic-API-Key** ein und klicke auf **Key speichern**. Die App prüft ihn bei Anthropic und speichert ihn verschlüsselt auf diesem Computer. Die Zeile zeigt dann ein Label **API-Guthaben**. **API-Key ändern…** ersetzt ihn, und **API-Key entfernen** löscht ihn.
3. Schalte **Bei erreichtem Limit API-Guthaben verwenden** in der Gruppe **Nutzungslimit erreicht** ein (das (i) dort erklärt, dass Sitzungen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, weitermachen und über den Anthropic-API-Key eines Kontos abgerechnet werden, anstatt zu stoppen, und dass die Option ausgeschaltet ist, bis du sie einschaltest). Sie wird angezeigt, sobald Claude Code angemeldet ist oder du ein Claude-Code-Konto hinzugefügt hast.

Was dann passiert:

- Wenn das Konto einer Claude-Code-Sitzung sein Nutzungslimit erreicht, versucht die App zuerst, was **Bei erreichtem Limit das Konto wechseln** tut: ein anderes Konto mit übriger Nutzung. Nur wenn keines mehr etwas übrig hat und die Einstellung eingeschaltet ist, macht die Sitzung mit Abrechnung über den API-Key weiter.
- Die Sitzung bleibt bei ihrem eigenen Konto, ihr Verlauf wechselt also nicht. Hat dieses Konto keinen Key, wird der Key eines anderen Claude-Code-Kontos verwendet.
- Die Sitzung zeigt oben neben ihrem Konto ein Label **API-Guthaben**. Fahre mit der Maus darüber, um den Grund zu sehen.
- Wenn ein Tarif wieder Nutzung hat, kehrt die Sitzung nach dem Ende ihres nächsten Durchgangs dorthin zurück: zu ihrem eigenen Konto oder zu einem anderen mit übriger Nutzung. Du musst nichts tun.
- Wenn die App die Nutzung eines Kontos nicht lesen kann, verlagert sie deine Arbeit nie auf die API-Abrechnung.
- Codex ist nicht betroffen: Es hat kein API-Guthaben.

## Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen

Öffne [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Deine Agenten** (sie erscheinen neben Claude Code und Codex, wenn du eine Sitzung startest) listet zuerst Custom auf, dann die Agenten, die du hinzugefügt hast. Bei jedem steht ein Häkchen, wenn sein Programm hier installiert ist, sonst ein Kreuz und „nicht installiert“.
- **Agenten mit ACP-Unterstützung** (installiere einen, melde dich einmal in seiner eigenen CLI an und füge ihn dann hier hinzu) listet die bekannten Agenten auf, die du noch nicht hinzugefügt hast: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build, Antigravity CLI und weitere. Die installierten stehen zuerst. Bei einer Zeile mit „Nicht installiert“ steht, wie du den Agenten bekommst. Die Liste zeigt die ersten nicht installierten; mit **Alle anzeigen** siehst du die übrigen.

So fügst du einen hinzu:

1. Klicke am Ende seiner Zeile auf **Hinzufügen**. Die Schaltfläche ist hervorgehoben, wenn das Programm schon installiert ist.
2. Wenn die App weiß, wie sie ihn installiert (Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build und die Agenten, die einen ACP-Adapter brauchen), installiert sie ihn jetzt im Hintergrund. Goose, Kimi CLI, Antigravity CLI und die übrigen installierst du selbst, mit dem Befehl oder der Adresse in ihrer Zeile.
3. Melde dich einmal im Programm des Agenten an: Öffne das [Terminal](/terminal), führe seinen Befehl aus (zum Beispiel `gemini`) und folge seiner Anmeldung. Wenn du das überspringst, sagt dir eine Sitzung: „Gemini CLI ist nicht angemeldet. Führe gemini einmal in einem Terminal aus und melde dich dort an, dann versuche es erneut.“ Grok Build und Antigravity CLI sind die Ausnahmen: Sie melden sich unter [Einstellungen → Agenten → Konten](/settings?s=accounts) an.

Gemini CLI ist für einen Gemini-API-Key oder eine Gemini-Code-Assist-Standard- oder -Enterprise-Lizenz gedacht; seine Voreinstellung hier startet es mit `--acp`. Seit dem 18. Juni 2026 bedient es Google AI Pro und Ultra (oder Gemini Code Assist für Einzelpersonen) nicht mehr: Nutze für diese Tarife die Antigravity CLI.

Der Agent erscheint jetzt in der Liste **Ausführungsumgebung** auf der Startseite.

Um einen hinzugefügten Agenten zu ändern, klicke auf **Bearbeiten**. Um ihn zu entfernen, öffne sein Menü **⋯**, wähle **Entfernen** und bestätige: Seine Sitzungen bleiben in der Liste, aber um sie fortzusetzen, muss der Agent wieder eingerichtet sein. Custom ist eingebaut: Seine Zeile sagt „Eingebaut: Modelle von OpenRouter, Ollama und vLLM, in Einstellungen → Modelle“ und hat statt Bearbeiten und Entfernen eine Schaltfläche **Modelle**.

### Grok Build

**Grok Build** ist der Coding-Agent von xAI (das Programm `grok`). Klicke in seiner Zeile auf **Hinzufügen**, mehr ist nicht nötig: Die App installiert es beim ersten Bedarf aus npm (`@xai-official/grok`) oder nutzt ein bereits vorhandenes, auch eines aus dem eigenen Installer von xAI in `~/.grok/bin`. Danach erscheint es unter **Agentenprogramme** und wird zusammen mit den anderen aktuell gehalten. Hydor führt es über ACP aus, mit den eigenen Tools der App, den Genehmigungskarten und den Modellen von Grok.

Die Anmeldung unterscheidet sich von den anderen ACP-Agenten: nicht im Terminal, sondern unter [Einstellungen → Agenten → Konten](/settings?s=accounts), wo eine Zeile **Grok Build** erscheint, sobald es hinzugefügt ist (siehe [Claude Code, Codex und Grok Build anmelden](#sign-claude-code-codex-and-grok-build-in)). Dort kannst du auch weitere Grok-Konten hinzufügen.

### Antigravity CLI

**Antigravity CLI** ist der Coding-Agent von Google für das Terminal (das Programm `agy`) und derjenige, der mit deinem Google-AI-Tarif funktioniert. Seit dem 18. Juni 2026 bedient Gemini CLI Google AI Pro und Ultra (oder Gemini Code Assist für Einzelpersonen) nicht mehr. Gemini CLI bleibt für einen Gemini-API-Key oder eine Gemini-Code-Assist-Standard- oder -Enterprise-Lizenz.

**Selbst installieren.** Google verlangt, dass man es selbst installiert, deshalb tut die App es nicht. Seine Zeile in [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents&find=Agents%20that%20speak%20ACP) (unter **Agenten mit ACP-Unterstützung**, mit dem Namen **Antigravity CLI** und dem Befehl `agy acp`) zeigt den Installer von Google. Führe unter macOS und Linux Folgendes im [Terminal](/terminal) aus; es legt `agy` in `~/.local/bin` ab:

```
curl -fsSL https://antigravity.google/cli/install.sh | bash
```

Führe unter Windows Folgendes in PowerShell aus:

```
irm https://antigravity.google/cli/install.ps1 | iex
```

Es aktualisiert sich selbst und gehört deshalb nicht zu den **Agentenprogrammen**, die die App aktuell hält. Sobald es installiert ist, klicke in seiner Zeile auf **Hinzufügen**.

**Anmelden.** Nach dem Hinzufügen zeigt [Einstellungen → Agenten → Konten](/settings?s=accounts) eine Zeile **Antigravity CLI** mit einer eigenen Anmeldung:

1. Klicke auf **Anmelden**, dann auf **Anmeldelink abrufen**.
2. Klicke auf **1. Öffne diesen Link**: Das ist die Anmeldeseite von Google. Melde dich mit deinem Google-Konto an, einem privaten mit Google AI Pro, Ultra, Plus oder dem kostenlosen Tarif von Antigravity. Die Seite zeigt dann einen Code.
3. Füge den Code in **2. Füge den Code von der Seite ein** ein (oder die ganze Adresse der Seite, auf der du landest) und klicke auf **Anmeldung abschließen**.

Die Zeile zeigt dann die E-Mail-Adresse und, sobald eine Sitzung geöffnet wurde, den Tarif (zum Beispiel Google AI Pro). **Abmelden** im Menü **⋯** der Zeile meldet Antigravity CLI auf diesem Computer ab, für jedes Programm, das es nutzt. In der Terminal-App erledigt `hydor accounts sign-in antigravity` dieselbe Anmeldung. Wenn du eine Sitzung startest, während es abgemeldet ist, bricht sie ab mit „Antigravity CLI ist nicht angemeldet: Melde dich in Einstellungen → Agenten → Konten mit deinem Google-Konto an und versuche es dann erneut.“

**Modelle und Aufwand.** In einer Sitzung listet **Modell** die eigenen Modelle der Antigravity CLI (Gemini-4-Modelle, Gemini 3.8 Flash und weitere, die dein Tarif bietet), **Aufwand** ihre Denkstufen (low, medium, high, xhigh und max) und **Berechtigungen** ihre Berechtigungsmodi. Sie erscheinen nach der ersten Sitzung, wenn die App sie beim Öffnen der Sitzung kennenlernt. Die eigenen Tools und Genehmigungskarten der App funktionieren wie bei anderen ACP-Agenten.

**Was die Bedingungen von Google hier bedeuten.** Unter der Zeile sagt die App: „Die Bedingungen von Google für seine Tarife erlauben Antigravity CLI nur in Sitzungen, die du selbst startest und steuerst. Deshalb hat es nur eine Anmeldung und arbeitet nie im Hintergrund.“ In Hydor heißt das:

- **Nur eine Anmeldung.** Du kannst keine weiteren Antigravity-CLI-Konten hinzufügen: **Konto hinzufügen** bietet es nicht an, und **Bei erreichtem Limit das Konto wechseln** gilt nie für es.
- **Nur Sitzungen, die du startest.** Die Startseite, die Terminal-App, eine Chat-App (Telegram und ähnliche) und freihändige Sprache können eine starten. Ein Zeitplan, ein Subagent, den ein anderer Agent startet, ein Lauf einer [App](/guide/apps), die Arena oder alles andere, was die App startet, wird abgelehnt: „Antigravity CLI läuft nur in Sitzungen, die du selbst startest und steuerst: Die Bedingungen von Google für seine Tarife schließen Arbeit aus, die die App oder ein anderer Agent startet (Zeitpläne, Subagents, Apps). Wähle dafür einen anderen Agenten.“
- **Keine eigenen Nachrichten der App.** Die App schickt ihm nie von sich aus eine Nachricht. Was sie schicken würde (das Ergebnis eines Subagents, die Antwort einer App, eine Erinnerung), erscheint in der Sitzung als Hinweis: „Nicht an Antigravity CLI gesendet, das nur Nachrichten annimmt, die du selbst sendest (Bedingungen von Google für seine Tarife). Um es weiterzugeben, sende es selbst:“ gefolgt vom Text. Was du selbst tust (eine Karte beantworten, einen Key speichern, deine Stimme), kommt weiterhin bei ihm an.
- **Kein selbstständiges Weitermachen.** Nach einem Limit macht es nie von allein weiter: Es gibt dafür weder **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** noch eine Schaltfläche **Beim Zurücksetzen fortsetzen**. Siehe [Nutzung, Limits und Kosten](/guide/usage#what-happens-when-you-hit-a-limit).

Wenn du die Anmeldung in einem anderen Programm nutzt oder Konten rotierst, kann der Antigravity-Zugriff des Google-Kontos gesperrt werden (Google sagt das in seinen FAQ). Nutze sie also nur wie hier beschrieben. Für Arbeit ohne Aufsicht, etwa Zeitpläne, Subagents und Apps, ist ein Gemini-API-Key mit Gemini CLI der richtige Weg.

Seine Nutzung erscheint als Karte auf der [Nutzungsseite](/usage), mit E-Mail-Adresse und Tarif, aber ohne Anzeigen: siehe [Die Limits eines Tarifs lesen](/guide/usage#read-a-plans-limits).

### Einen eigenen Agenten hinzufügen

Jedes Programm, das ACP spricht, kann hier laufen.

1. Klicke neben dem Titel von **Deine Agenten** auf **Eigenen Agenten hinzufügen**.
2. Fülle aus:
   - **Name**: wie er in den Listen erscheint, zum Beispiel „Gemini CLI“.
   - **Befehl**: das Programm, das gestartet wird, zum Beispiel `gemini`, oder ein vollständiger Pfad.
   - **Argumente**: was es im ACP-Modus startet, zum Beispiel `--acp`.
   - **Umgebung (optional, NAME=value pro Zeile)**: Einstellungen, die das Programm braucht, etwa eine Variable für einen API-Key.
3. Klicke auf **Speichern**.

Der Befehl muss den Agenten im ACP-Modus starten, sodass er über Standardeingabe und Standardausgabe kommuniziert.

### Agenten, die du in ihrem eigenen Programm einrichtest

Einige Agenten in der Liste sind Programme, die du selbst einrichtest, und ein paar Dinge unterscheiden sich von denen, die die App für dich installiert:

- Ihre Zeile in **Weitere Agenten** zeigt den Befehl oder die Adresse, mit der du sie installierst. Die App führt kein Skript aus dem Web für dich aus: Installiere sie selbst, im [Terminal](/terminal) oder so, wie es die Zeile sagt.
- Melde dich einmal im Programm des Agenten an, ebenfalls im Terminal (führe zum Beispiel seinen Befehl aus und folge seiner Anmeldung, oder wähle dort sein Modell). Von da an startet die App ihn. Er behält seine eigenen Sitzungen und sein Memory in seinem eigenen Ordner, und seine Genehmigungskarten sind die, die er selbst anbietet.
- Einer von ihnen verbindet sich mit einem eigenen Gateway: Richte es zuerst mit dem Einrichtungsbefehl des Agenten ein und lass das Gateway laufen.
- Wenn ein Agent ACP nicht selbst spricht, braucht er einen ACP-Adapter. Die App installiert den Adapter zusammen mit dem Agenten, beide mit npm in ihrem eigenen Ordner, ohne ihre Installationsskripte auszuführen. Ein Agent, den du selbst installiert hast, wird verwendet, wenn er im PATH liegt.
- Ein Agent, der keine MCP-Server annimmt, arbeitet nur mit seinen eigenen Tools: Die Tools der App (Seiten, Suche …) erreichen ihn nicht, und die Sitzung sagt das beim Start. Die Richtlinien der App, Memory-Notizen und Skills bekommt er trotzdem mit der ersten Nachricht.

### Was ACP-Agenten hier können und was nicht

Die App öffnet eine Sitzung im Ordner, den du wählst, zeigt die Nachrichten und Schritte des Agenten und fragt dich, wann immer der Agent um Erlaubnis bittet. Manches funktioniert anders als bei Claude Code und Codex:

- Er nimmt jeweils nur eine Nachricht an. Eine Nachricht, die du sendest, während er arbeitet, wartet in der Warteschlange über dem Nachrichtenfeld und geht raus, wenn der Zug endet. (Custom funktioniert ebenso.)
- Ein Agent, der frühere Sitzungen nicht wieder öffnen kann, beginnt neu, wenn du eine alte fortsetzt, ohne die Unterhaltung davor. Die Sitzung sagt das. Dasselbe passiert, wenn ein Agent eine Sitzung früher wieder öffnen konnte und es nicht mehr kann: Er macht mit einem Hinweis neu weiter, statt zu scheitern.
- Bilder, die du anhängst, erreichen ihn nur, wenn er Bilder akzeptiert.
- Forks und Übergaben sind nicht verfügbar (Custom hat Forks). Ziele sind es: Die eigene Schleife der App steuert sie für jeden Agenten.
- Antigravity CLI funktioniert nur in Sitzungen, die du selbst startest und steuerst, mit einer Anmeldung (siehe [Antigravity CLI](#antigravity-cli)).
- Die Tools der App (Seiten, Suche, Memory …) erreichen einen Agenten als MCP-Server: per Adresse, wenn der Agent das akzeptiert, sonst über ein kleines Programm, das die App für ihn startet. Ein Agent, der keines davon annimmt, arbeitet nur mit seinen eigenen Tools, bekommt aber trotzdem die Richtlinien, Memory-Notizen und Skills.

## Woher die Modelle von Custom kommen

Custom führt die Modelle deiner Claude- und ChatGPT-Tarife aus, Modelle auf diesem Computer und Modelle in der Cloud, mit denselben Tools, Skills und MCP-Servern wie die anderen Agenten. Wähle Custom auf der Startseite, dann das Modell. Sie kommen aus drei Quellen:

- **Deine Abos**: die Modelle deiner Claude- und ChatGPT-Abos, über die Anmeldungen von Claude Code und Codex auf diesem Computer. Es gibt nichts einzurichten: Wenn Claude Code angemeldet ist, bietet das Menü **Modell** von Custom Claude Opus, Fable, Sonnet und Haiku an (immer das jeweils neueste), und wenn Codex mit ChatGPT angemeldet ist, die Modelle, die dein ChatGPT-Abo aufführt (zum Beispiel GPT-6 Luna). Wird ein Programm abgemeldet vorgefunden, verschwinden seine Modelle aus dem Menü, bis du es wieder anmeldest, und ein Codex, das mit einem API-Key statt mit ChatGPT angemeldet ist, stellt keine zur Verfügung. Sie verbrauchen die Nutzung deines Abos, keinen API-Key und kein Geld pro Token, deshalb zeigt eine Custom-Sitzung mit ihnen für diese Schritte $0. Das Menü **Aufwand** bietet für jedes die Stufen an, die sein Programm dafür aufführt; solange **Standard** gewählt ist, gilt die des Programms. Jedes Konto des Programms wird der Reihe nach versucht, wie bei anderen einmaligen Arbeiten: Ein Konto, das sein Nutzungslimit erreicht hat oder abgemeldet ist, gibt den Schritt an dein nächstes Konto weiter (wenn **Bei erreichtem Limit das Konto wechseln** eingeschaltet ist). Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) verwendet sie nie, weil sie auf Servern von Anthropic oder OpenAI laufen. Wie sie antworten, steht unter [Custom](/guide/custom#what-custom-is-and-when-to-use-it).
- **Auf diesem Computer**: hier installierte Modelle (Ollama, vLLM) und Endpunkte in deinem Netzwerk.
- **In der Cloud**: OpenRouter, Endpunkte anderswo und die Cloud-Modelle von Ollama.

Du kannst sie überall wählen, wo Modelle von Custom wählbar sind: auf der Startseite, im Modellmenü einer Sitzung, bei den Leistungsstufen von Custom, beim Hilfsmodell und beim Modell eines Agenten oder einer App.

[Einstellungen → Agenten → Modelle](/settings?s=models) enthält alles, was die Modelle von Custom brauchen. Die Seite hat sieben Teile, von oben nach unten:

- **Hilfsmodell**: das Modell für die kleinen Aufgaben der App.
- **Leistungsstufen**: ein Modell für jede Art von Aufgabe (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](#tiers-a-model-for-each-kind-of-job)).
- **Deine Abos**: je eine Zeile für Claude Code und Codex, mit den Modellen, die es Custom leiht. Eine Zeile sagt „Abgemeldet: Melde dich erneut an, um diese Modelle zu nutzen“ mit einem Link zu **Konten**, oder „Nicht auf diesem Computer installiert“.
- **Auf diesem Computer**: was dieser Computer hat, und die hier installierten Modelle.
- **Modell von Hugging Face hinzufügen**: offene Modelle suchen, prüfen und installieren.
- **OpenRouter**: Hunderte Modelle über einen Key, in drei Gruppen: dein Key, die Modelle, die du hinzugefügt hast, und eine Suche, um weitere hinzuzufügen.
- **Modelllaufzeitumgebungen und Endpunkte**: Ollama, vLLM, andere OpenAI-kompatible Server und ein Hugging-Face-Token.

Im Menü **Modell** von Custom sind die Modelle unter **Deine Abos**, **Auf diesem Computer** und **In der Cloud** gruppiert, und jede Zeile sagt, worüber es läuft: „Claude Code“, „Codex“, „OpenRouter“, „Ollama“, „vLLM“ oder der Name eines Endpunkts. Fahre mit der Maus über ein Modell, um zu sehen, wo es läuft und wie viel es auf einmal liest, zum Beispiel „OpenRouter · 128K Kontext“ oder „vLLM, auf diesem Computer · 32K Kontext · startet bei Gebrauch“. Die Listen aktualisieren sich jede Minute von selbst.

## Das Hilfsmodell auswählen

Das Hilfsmodell erledigt kleine Aufgaben neben deinen Sitzungen, außerhalb jeder Unterhaltung:

- jede neue Sitzung anhand deiner Anfrage benennen (ihr Titel in der Seitenleiste);
- Schritte im Auto-Modus von Custom überprüfen und die Prüfungen eines Ziels beurteilen, die ein Prüfer als erfüllt bewerten muss (ein Prüfer ist ein Modell, das nichts von der Arbeit gemacht hat; in einer vertraulichen Sitzung ist es ein Modell auf diesem Computer);
- das Memory etwa einmal am Tag aufräumen, aus den Unterhaltungen seither lernen und Notizen für den Index betiteln, mit dem Agenten starten;
- eine Frage zu einer Webseite beantworten, die der Browser geöffnet hat;
- die Filter (Websites, Daten, Arten von Seiten, Sprachen) herauslesen, die die Wörter einer Websuche festlegen, bevor Naget Search sucht (siehe [Wie Agenten im Web suchen](/guide/web#how-agents-search-the-web));
- Bilder für ein Custom-Modell beschreiben, das sie nicht sehen kann;
- eine lange Antwort eines Hydor-Subagents zusammenfassen;
- aus einer Sitzung eine App oder eine Geplante Aufgabe entwerfen;
- den freihändigen Sprachmodus.

Öffne [Einstellungen → Agents → Modelle](/settings?s=models&find=Helper%20model) und klicke in der Gruppe **Hilfsmodell** auf das Menü **Modell** (das (i) listet die kleinen Aufgaben auf):

- **Automatisch** (die Voreinstellung): Claude Haiku über Claude Code oder Codex, wenn Claude Code nicht antworten kann. Erreicht ein Konto sein Nutzungslimit, geht die Frage zuerst an dein nächstes angemeldetes Konto (bei eingeschaltetem **Bei erreichtem Limit das Konto wechseln**); ein abgemeldetes Konto wird übergangen. Kann keines der beiden Programme antworten, übernimmt eines deiner Custom-Modelle die Aufgabe (das Modell, das die Leistungsstufe **Schnell** von Custom nennt, sonst das günstigste, das du hinzugefügt hast; die Modelle deiner Abos werden hier übersprungen, da sie über dieselben zwei Programme laufen). Nur wenn es nichts erledigen konnte, bittet dich eine Karte, dich anzumelden (siehe [Wenn ein Konto abgemeldet ist](#when-an-account-is-signed-out)). Wenn nichts antwortet, nennt der Fehler für jedes den Grund: „You've hit your weekly limit“, ein Modell, das dein Codex-Abo nicht anbietet …
- Jedes der Modelle von Custom, gruppiert wie im Menü **Modell** von Custom (**Deine Abos**, **Auf diesem Computer** und **In der Cloud**), mit dem Weg, über den es kommt (Claude Code, Codex, OpenRouter, Ollama, vLLM oder der Name eines Endpunkts) und „Verarbeitet Bilder“ bei denen, die Bilder sehen können. Auch ein Modell deines Claude- oder ChatGPT-Abos kann das Hilfsmodell sein: Es antwortet über Claude Code oder Codex auf die Nutzung deines Abos.

Automatisch kann keine Bilder ansehen. Wenn du Custom mit einem Modell verwendest, das keine Bilder verarbeitet, wähle ein Hilfsmodell, das Bilder verarbeitet, sonst kann Custom deine Bilder nicht beschreiben lassen.

## Sehen, was dieser Computer ausführen kann

Der Abschnitt **Auf diesem Computer** unter [Einstellungen → Agents → Modelle](/settings?s=models&find=On%20this%20machine) beginnt mit einer Übersicht über diesen Computer:

- **Grafik**: die Grafikkarten (GPUs) und ihr Speicher; bei einem Mac mit Apple Silicon sein Chip („Apple M3 Max“, dessen Grafik sich den Speicher mit dem Computer teilt); oder „No GPU“ (Modelle laufen dann auf dem Prozessor).
- **Arbeitsspeicher und Speicherplatz**: der Arbeitsspeicher des Computers, gesamt und frei, und der freie Platz auf der Festplatte mit dem Platz, den die installierten Modelle belegen.
- **Läuft mit**: ob **Ollama** und **vLLM** installiert sind, mit ihren Versionen, oder ein Link zur Installation.
- Bei einer Grafikkarte, wie groß ein Modell sein darf: „Fits about 30B parameters at 4-bit on one GPU“ (bei einem Mac: „Fits about 40B parameters at 4-bit“). Parameter sind ein Maß für die Größe eines Modells; 4-Bit ist eine verbreitete komprimierte Form, die etwa ein Viertel des Speichers braucht.

Darunter:

- **Downloads in progress**, jeweils mit Fortschrittsbalken, wie viel schon erledigt ist und ob er für Ollama oder vLLM ist. Mit **Abbrechen** stoppst du einen. Bei einem fehlgeschlagenen oder abgebrochenen steht der Grund, dazu **Schließen**.
- **Installed models** (die ersten paar, dann **Alle anzeigen**), jeweils mit ihrer Laufzeitumgebung (Ollama oder vLLM), Größe, Details (etwa Größe und Komprimierung bei Ollama-Modellen), „Verarbeitet Bilder“, wo es zutrifft, und ob es läuft.
  - Ein vLLM-Modell hat **Starten** und **Stoppen**. Es startet von selbst, wenn eine Sitzung es zum ersten Mal verwendet (der erste Start dauert ein bis zwei Minuten), auf der Grafikkarte mit dem meisten freien Speicher (mit 8-Bit, wenn es dort sonst nicht passen würde), oder verteilt auf 2, 4 oder 8 Karten, wenn keine einzelne Karte genug Platz hat („running on GPUs 1, 2“); auf einem Mac auf seinem Apple Silicon. Es läuft weiter, auch wenn die App neu startet, bis du auf **Stoppen** klickst. Wenn es nicht starten kann, steht der Grund darunter.
  - **Entfernen** im **⋯**-Menü des Modells löscht nach deiner Bestätigung die Dateien des Modells von diesem Computer. Du kannst es später wieder installieren.

Wenn noch keine vorhanden sind: „No models here yet: add one from Hugging Face below.“

## Ein Modell von Hugging Face hinzufügen

Hugging Face ist die wichtigste Website für offene Modelle. Die Gruppe [Add a model from Hugging Face](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) (für diesen Computer vorgeschlagen oder die gesamte Website durchsuchen) schlägt einige vor, durchsucht die Website und sagt dir, bevor etwas heruntergeladen wird, wie jedes Modell auf diesem Computer laufen würde.

### Für diesen Computer vorgeschlagen

Vor der Suche listet die Gruppe die Modelle auf, die die App empfiehlt und die auf diesem Computer laufen, je nachdem, was er hat:

- **LFM3-VL 2B** (Liquid AI): klein und schnell, und es liest Bilder. Läuft auf fast jedem Computer.
- **Gemma 4 12B** (Google): ein leistungsfähiger Allrounder, der Bilder liest, für einen Computer mit guter Grafikkarte.
- **Flint** (Recursive): für Coding-Agenten gemacht, für einen Mac mit Apple Silicon und 32 GB oder mehr.
- **GLM-5.3 Flash** (Z.ai): eines der stärksten offenen Modelle, für einen Server mit mehreren großen Grafikkarten.

Jedes zeigt, ob es hier gut oder langsam läuft, wie es laufen würde („vLLM at 8-bit, on GPU 0“, „vLLM, split across 2 GPUs“, „vLLM, on Apple silicon“), seine Downloadgröße und **Installieren**. **Hier am besten geeignet** kennzeichnet das stärkste, das gut läuft. Sie laufen standardmäßig mit vLLM; ein Computer weder mit NVIDIA-Grafikkarte noch mit Apple Silicon bekommt stattdessen die Ollama-Version des kleinen Modells. Eine Warnung folgt, wenn das, womit sie laufen, noch nicht eingerichtet ist („vLLM is not set up“, „Ollama is not running“): siehe [Ollama, vLLM oder einen anderen Endpunkt verbinden](#connect-ollama-vllm-or-another-endpoint). Die Zeile **2 more for bigger computers** (oder wie viele es eben sind) zeigt die übrigen, mit dem, was jedes braucht. Die Willkommenstour schlägt dieselben vor.

### Suchen und filtern

1. Tippe in **Hugging Face durchsuchen oder org/name einfügen** einen Namen wie `qwen3`, den vollständigen Namen eines Modells (`org/name`) oder seine huggingface.co-Adresse. Bevor du tippst, schlägt das Feld einige Namen vor oder **Am häufigsten heruntergeladene ansehen**.
2. Grenze die Liste mit den Filtern ein (du kannst sie kombinieren):
   - **Läuft hier gut**: nur Modelle, die auf diesem Computer gut laufen würden.
   - **GGUF · Ollama**: Modelle im GGUF-Format, die Ollama ausführt.
   - **vLLM**: Modelle im safetensors-Format, die vLLM auf einer Grafikkarte ausführt.
   - **Verarbeitet Bilder**: Modelle, die auch Bilder lesen.
3. Ändere die Reihenfolge mit dem Menü rechts: **Am häufigsten heruntergeladen**, **Im Trend**, **Am häufigsten positiv bewertet** oder **Neueste**.

Du bekommst bis zu 40 Modelle, zunächst die ersten acht und **Alle anzeigen** für den Rest. Ein Modell, das du mit vollem Namen angegeben hast, steht zuerst, auch wenn die Suche es nicht auflistet, und mit der Eingabetaste wird es sofort überprüft.

Jede Zeile zeigt den Hersteller und den Namen, die Form (**GGUF** oder **vLLM**), **Bilder**, wenn es Bilder verarbeitet, **Zugriffsbeschränkt**, wenn sein Hersteller zuerst die Annahme von Bedingungen verlangt, seine Größe in Parametern, Downloads in den letzten 30 Tagen, Likes und wann es zuletzt geändert wurde.

### Die erste Einschätzung

Unter jedem Modell gibt ein farbiges Label eine erste Einschätzung allein anhand seiner Größe:

- **Runs well with vLLM** oder **Runs well with Ollama**, mit grober Geschwindigkeit („about 40 tokens/s“; ein Token ist ein Wortstück): Es passt in den Speicher deiner Grafikkarte.
- **Auf dem Prozessor, langsam** oder **Auf dem Prozessor sehr langsam**: Es passt nur in den Arbeitsspeicher des Computers und läuft daher auf dem Prozessor. Das kann nur Ollama.
- **Zu groß für diesen Computer**: Es passt nicht, oder der Download passt nicht auf die Festplatte.
- **At 4-bit with Ollama: runs well…**: Das Modell ist, wie es gespeichert ist, zu groß, aber seine komprimierte 4-Bit-Version würde mit Ollama gut laufen.

Fahre mit der Maus über das Label, um die Zahlen dahinter zu sehen.

### Vor dem Download überprüfen

Klicke bei einem Modell auf **Überprüfen**, um genau zu sehen, wie es hier laufen würde. Das Panel zeigt seine Größe, wie viel es auf einmal liest (sein Kontext), ob es Bilder verarbeitet, und dann:

- Bei einem GGUF-Modell: „Runs with Ollama“ und jede verfügbare Größe (kleinere Dateien tauschen etwas Qualität gegen Geschwindigkeit und Speicher), die kleinste zuerst. Jede Zeile nennt ihre Einschätzung, den benötigten Speicher, etwa wie schnell es laufen würde, und die Downloadgröße, mit einer Schaltfläche **Installieren**. Installieren ist ausgegraut, solange Ollama hier nicht läuft, oder bei einer Größe, die zu groß ist.
- Bei einem vLLM-Modell: „Runs with vLLM, which starts it on a GPU when a session uses it“, dieselben Angaben, Hinweise darauf, welche Grafikkarte es verwenden würde, und eine Schaltfläche **Herunterladen**. Wenn vLLM nicht installiert ist oder dein vLLM diese Art von Modell noch nicht ausführen kann, steht das dort, und wenn es eine GGUF-Version gibt, wird stattdessen **überprüfen** dafür angeboten.
- Bei allem anderen: „No weights this app can run (safetensors for vLLM, GGUF for Ollama).“

Die Zahlen gehen von einer Unterhaltung von bis zu etwa 32.000 Tokens aus, der Länge, die ein Modell auf diesem Computer bekommt. **Schließen** klappt das Panel zu.

### Installieren und was dann passiert

Klicke auf **Installieren** (Ollama) oder **Herunterladen** (vLLM). Der Download erscheint mit seinem Fortschritt unter **Auf diesem Computer**. Wenn er fertig ist, erscheint das Modell im Menü **Modell** von Custom. Ein abgebrochener vLLM-Download macht beim erneuten Versuch dort weiter, wo er aufgehört hat. Ein vLLM-Modell, das für keine einzelne Grafikkarte groß genug ist, wird beim Start mit 8-Bit (FP8) gespeichert, was den Speicher für seine Gewichte bei geringem Verlust halbiert (Karten ab NVIDIAs RTX-30-Serie und A100); passt es dann immer noch nicht, wird es auf mehrere Karten verteilt, sofern sie zusammen genug Platz haben.

### Zugriffsbeschränkte und private Modelle

Manche Hersteller verlangen zuerst die Annahme ihrer Bedingungen; ihre Modelle zeigen **Zugriffsbeschränkt**. Akzeptiere die Bedingungen auf der Seite des Modells auf huggingface.co und füge dann ein Hugging-Face-Token hinzu (siehe [Hugging-Face-Token](#hugging-face-token)). Auch private Modelle brauchen das Token.

## Modelle über OpenRouter verwenden

OpenRouter (openrouter.ai) gibt dir Hunderte Modelle vieler Hersteller über einen Key, bezahlt pro Nutzung.

### Deinen Key hinzufügen

1. Hol dir einen Key auf openrouter.ai (die Links im Abschnitt führen dorthin).
2. Klicke in [Einstellungen → Agents → Modelle](/settings?s=models&find=OpenRouter) in der Zeile **Dein OpenRouter-Key** auf **Key hinzufügen**, füge ihn im Dialog in **Dein OpenRouter-Key: sk-or-…** ein und klicke auf **Speichern**.

Die Zeile zeigt dann **Verbunden mit OpenRouter** mit Anfang und Ende deines Keys. **Key entfernen** im **⋯**-Menü der Zeile vergisst den Key. Der Key bleibt auf dem Server und wird nie wieder angezeigt.

Du kannst ihn auch hinzufügen, wenn er zum ersten Mal gebraucht wird: Ein Agent, der ohne Key ein Bild, eine Zeichnung, ein Video oder einen Ton erzeugen will, fragt auf einer Karte in der Unterhaltung danach ([Wenn ein Agent den OpenRouter-Key braucht](/guide/documents-voice#when-an-agent-needs-the-openrouter-key)), und die KI-Tools der Editoren fragen in ihrem Dialog. In beiden Fällen wird er hier gespeichert.

### Vorgeschlagene Modelle

Vor der Suche listet **Vorgeschlagen** in der Gruppe **OpenRouter-Modelle hinzufügen** vier Modelle für Custom auf, jeweils mit Begründung: **GPT-6 Luna** (Fast and cheap), **Grok 4.7** (Good, with fewer refusals), **GPT-6.1 Sol** (Better) und **Claude Opus 5.5** (Best overall). **Hinzufügen** legt eines in die Auswahlmenüs. Für Bilder, Musik, Stimmen und Videos sind die Auswahl der App Seedream 5.0 Pro (und Flash, schneller und günstiger), Lyria 3 Pro, Seed Audio 1.0 und Seedance 2.5: siehe [Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images).

### Den Katalog durchsuchen

Tippe in derselben Gruppe in **OpenRouter durchsuchen: deepseek, qwen, claude…**, oder klicke auf einen der vorgeschlagenen Namen oder auf **Neueste ansehen**. Filter:

- **Tool-Aufrufe**: Modelle, die Tools nativ aufrufen, so wie Custom sie am besten nutzt (Beste Übereinstimmung stellt diese zuerst).
- **Verarbeitet Bilder**
- **Schlussfolgern**: Modelle, die nachdenken, bevor sie antworten.
- **Kostenlos**

Das Menü rechts sortiert die Ergebnisse: **Beste Übereinstimmung** (während du nach Namen suchst), **Neueste**, **Günstigstes** oder **Größter Kontext**. Du bekommst bis zu 50 Modelle, zunächst die ersten acht und **Alle anzeigen** für den Rest.

Jedes Modell zeigt seinen Hersteller, Namen und Labels: **Neueste** (immer die neueste Version des Herstellers), **Neu** (in den letzten drei Wochen gelistet), **Kostenlos**, **Schlussfolgern**, **Bilder** und **Keine nativen Tools** (Custom beschreibt dann seine Tools in den Anweisungen und liest seine Aufrufe aus seinem Text). Darunter: wie viel es auf einmal liest („128K context“), seine längste Antwort („16K out“), sein Preis pro Million Tokens ein und aus, der Monat, in dem es gelistet wurde, eine kurze Beschreibung und sein OpenRouter-Name.

### Modelle zu den Auswahlmenüs hinzufügen

Klicke bei einem Modell auf **Hinzufügen**. Seine Zeile zeigt dann **Hinzugefügt**, und das Modell erscheint in der Gruppe **Deine OpenRouter-Modelle** („In the model pickers“) über der Suche und im Menü **Modell** von Custom. Klicke auf das × bei einem von ihnen, um es aus den Menüs zu nehmen. Solange du nicht mindestens eines hinzugefügt hast, bietet OpenRouter keine Modelle an („Add at least one model to use OpenRouter.“).

### Aufwand bei OpenRouter-Modellen

Ein Modell, das nachdenkt, bietet im Menü **Aufwand** die Stufen an, die OpenRouter für dieses Modell aufführt, aus **Keine** (kein Nachdenken), **Minimal**, **Niedrig**, **Mittel**, **Hoch**, **Xhigh** und **Max**. Custom fordert einen mittleren Aufwand an, solange **Standard** gewählt ist, und sonst den Aufwand, den du wählst. Ein Modell, bei dessen Stufen die mittlere fehlt, behält seine eigene Voreinstellung, und ein Modell, das keine Stufen aufführt, hat keine Einstellung **Aufwand** und wird mit mittlerem Aufwand angefragt.

## Ollama, vLLM oder einen anderen Endpunkt verbinden

Die Gruppe **Modelllaufzeitumgebungen und Endpunkte** verbindet die Programme, auf denen Modelle laufen. Du öffnest sie unter [Einstellungen → Agents → Modelle](/settings?s=models&find=Runtimes%20and%20endpoints).

### Ollama

Ollama ist ein kostenloses Programm, das Modelle auf deinem Computer ausführt, auf der Grafikkarte oder dem Prozessor. In seiner Zeile steht „läuft“ mit der Version oder „läuft nicht unter dieser Adresse“ mit einem Link **Ollama installieren**. Die Adresse lautet `http://127.0.0.1:11434`, solange du sie nicht änderst: Gib im Feld eine andere ein, dann erscheint daneben **Speichern**. Jedes Modell in diesem Ollama erscheint in der Modellliste von Custom, auch solche, die du außerhalb der App geladen hast.

### vLLM

vLLM ist ein schneller Server für Modelle auf NVIDIA-Grafikkarten und der Weg, auf dem Modelle von Hugging Face hier standardmäßig laufen. Ein Modell, das für eine Karte zu groß ist, läuft darauf mit 8 Bit oder verteilt auf 2, 4 oder 8 Karten. Auf einem Mac läuft vLLM auf Apple Silicon mit seinem Metal-Plugin (vllm-metal). Die App findet es selbstständig im PATH oder in einer conda- oder venv-Umgebung und zeigt seine Version und seinen Speicherort an. Wenn dort „nicht gefunden (pip install vllm), oder gib den Befehl an“ steht, installiere es oder gib den vollständigen Pfad zu seinem Befehl `vllm` im Feld ein und klicke auf **Speichern** (die Schaltfläche erscheint, sobald du etwas eingibst). Lass das Feld leer, damit die App selbst sucht.

### Andere OpenAI-kompatible Endpunkte

Viele Programme und Dienste antworten genauso wie die API von OpenAI: LM Studio, der Server von llama.cpp, andere Anbieter. So fügst du einen hinzu:

1. Klicke neben dem Titel der Gruppe auf **Endpunkt hinzufügen**.
2. Gib im Dialog einen **Name**n, die Adresse (zum Beispiel `http://localhost:1234/v1`) und einen **Key (optional)** ein.
3. Klicke auf **Hinzufügen**.

Der Endpunkt erscheint als Zeile mit seiner Adresse und der Anzahl der Modelle, die er anbietet. Seine Modelle erscheinen in der Liste von Custom als „Modell (Name)“. Mit dem × entfernst du ihn. Wenn du einen weiteren Endpunkt mit demselben Namen hinzufügst, ersetzt er den ersten.

Klicke unter der Zeile auf **Funktionen der Modelle festlegen**, um seine Modelle zu sehen, jedes mit zwei Auswahlmöglichkeiten: **Verarbeitet Bilder** und **Denkaufwand**. Jede steht auf **Automatisch**, **Ja** oder **Nein**. Ein Modell, das nachdenkt, hat eine dritte, **Aufwandsstufen**. Ein Modell, das Bilder verarbeitet, bekommt Screenshots und Bilder als Bilder, während ein Modell, das das nicht kann, eine Beschreibung davon erhält (siehe [Bilder für Modelle, die nicht sehen](/guide/custom#images-for-models-that-dont-see)). Ein Modell, das nachdenkt, bietet seine Stufen im Menü **Aufwand** an (Low, Medium und High, sofern du keine anderen festlegst), und Custom sendet die gewählte als `reasoning_effort`, die Einstellung, die OpenAI-kompatible Server annehmen (solange **Standard** gewählt ist, wird nichts gesendet). **Automatisch** folgt dem, was der Endpunkt über das Modell sagt, und das Menü zeigt, was das ist: Server, die ihre Modelle beschreiben (im Stil von OpenRouter, Mistral und andere), geben es mit ihrer Modellliste an, und bei einem LiteLLM-Gateway fragt Hydor mit demselben Key auch dessen Modellinformationen ab. Ein Endpunkt, der nichts dazu sagt, zählt als Nein: Stelle bei den Modellen, von denen du weißt, dass sie Bilder verarbeiten oder nachdenken, **Ja** ein. Was du einstellst, bleibt erhalten, wenn du den Endpunkt erneut hinzufügst.

Um die Stufen eines Modells zu ändern, klicke daneben auf **Aufwandsstufen**. Hake unter `none`, `minimal`, `low`, `medium`, `high`, `xhigh` und `max` die an, die es annimmt, oder gib unter **Weitere Stufe** eine andere ein, die der Endpunkt annimmt, und klicke auf **Hinzufügen** (ein Wort; mindestens eine Stufe bleibt angehakt). **low, medium und high verwenden** stellt die üblichen drei wieder her. Welche Stufen ein Modell annimmt, entscheidet sein Server: Lehnt er eine ab, sendet Custom die Anfrage noch einmal ohne sie, und das Modell läuft mit seinem eigenen Standard.

Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) darf einen Endpunkt verwenden, dessen Adresse dieser Computer oder dein privates Netzwerk ist: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` bis `172.31.…` oder ein Name, der auf `.local` endet. Jede andere Adresse gilt als online, selbst wenn sie zu deinem eigenen Server führt: Verwende stattdessen dessen private Adresse. Dasselbe gilt für die Adresse von Ollama, und die Cloud-Modelle von Ollama (ihre Namen enden auf „cloud“) gelten immer als online.

### Hugging-Face-Token

Mit einem [Hugging-Face-Token](/settings?s=models&find=Hugging%20Face%20token) kann die App geschützte oder private Modelle herunterladen (in der Zeile steht „Nur für geschützte oder private Modelle“). Erstelle einen in den Einstellungen deines Hugging-Face-Kontos, klicke auf **Token hinzufügen**, füge ihn in den Dialog ein (er beginnt mit `hf_`) und klicke auf **Speichern**. Die Zeile zeigt dann seinen Anfang und sein Ende, mit **Token entfernen** in ihrem Menü **⋯**.

## Einen Agent fragen

- „Welche Agent-Programme sind hier installiert? Installiere Gemini CLI.“
- „Sind Claude Code und Codex auf dem neuesten Stand? Aktualisiere sie jetzt.“
- „Füge OpenCode zu meinen Agents hinzu.“
- „Füge Grok Build zu meinen Agents hinzu und melde es mit meinem Grok-Abo an.“
- „Richte Antigravity CLI mit meinem Google-AI-Pro-Tarif ein.“
- „Ist Antigravity CLI hier installiert, und bin ich dort angemeldet?“
- „Warum kann eine geplante Aufgabe Antigravity CLI nicht verwenden?“
- „Füge ein zweites Grok-Konto für die Arbeit hinzu und starte meine nächste Sitzung damit.“
- „Starte meine nächste Grok-Sitzung mit dem Aufwand xhigh.“
- „Biete für das gpt-Modell meines Gateway-Endpunkts die Aufwandsstufen low, high und xhigh an.“
- „Wie viel von meinem Grok-Tarif ist diese Woche noch übrig?“
- „Nutze alle meine Grok-Konten: Wenn eines sein Limit erreicht, mach mit einem anderen weiter.“
- „Füge Gemini CLI und Goose zu meinen Agents hinzu und sag mir, was ich noch installieren muss.“
- „Finde ein Modell auf Hugging Face, das auf diesem Computer gut läuft und Bilder verarbeitet, prüfe es und installiere die beste Größe.“
- „Füge das neueste DeepSeek-Modell von OpenRouter zu meinen Modellen hinzu.“ (sobald dein OpenRouter-Key eingerichtet ist)
- „Mach das Hilfsmodell zu einem, das Bilder verarbeitet.“
- „Nutze das Sonnet aus meinem Claude-Tarif in einer Custom-Sitzung und zeig mir, was es kostet.“
- „Stoppe das laufende vLLM-Modell, um die Grafikkarte freizugeben.“
- „Nutze alle meine Claude-Konten: Wenn eines sein Limit erreicht, mach mit einem anderen weiter.“
- „Wenn alle meine Claude-Konten aufgebraucht sind, mach mit meinem API-Guthaben weiter.“
- „Welches Modell verwendet jede Leistungsstufe für Claude Code und Codex? Lass Max für Claude Code Opus bedeuten.“
- „Welche Modelle verwenden die Leistungsstufen von Custom, und warum ist Am besten leer?“
- „Warum bittet mich Hydor, mich erneut bei Claude Code anzumelden?“
- „Mein Claude-Code-Konto ist abgemeldet: Welche meiner Sitzungen warten darauf, und können sie mit einem anderen Konto weitermachen?“
