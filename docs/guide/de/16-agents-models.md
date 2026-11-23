# Agenten, Konten und Modelle

Hydor führt mehrere KI-Agenten aus: Claude Code, Codex, Custom (der app-eigene Agent für jedes beliebige Modell) und weitere Agenten mit ACP-Unterstützung, etwa Gemini CLI, OpenCode, Qwen Code, Goose oder Grok Build. Dieses Thema erklärt, worin sie sich unterscheiden, wie ihre Programme installiert und aktuell gehalten werden, wie du sie anmeldest (auch mit mehr als einem Konto) und woher die Modelle von Custom kommen: von OpenRouter, von Ollama, aus Hugging-Face-Modellen, die auf diesem Computer laufen, oder von jedem OpenAI-kompatiblen Endpunkt.

![Auswahl des Agenten auf der Startseite: Claude Code, Codex oder Custom](images/agents-models.webp)

## Welchen Agenten soll ich verwenden?

Ein Agent ist das Programm, das in einer Sitzung die Arbeit erledigt: Es liest deine Nachricht, nutzt Werkzeuge (Dateien, Befehle, das Web) und antwortet. Das Modell ist die KI dahinter. Alle Agenten hier bekommen von der App dieselbe Unterstützung (Websuche, den Browser, Memory, Skills, deine Verbindungen), unterscheiden sich aber darin, woher ihre Modelle kommen.

- **Claude Code** (Anthropic). Läuft über deinen Claude-Tarif oder rechnet über ein Anthropic-API-Konto ab. Seine Modelle sind die von Anthropic (Opus, Sonnet, Haiku). Es hat eigene Nutzungslimits, die die [Nutzungsseite](/usage) anzeigt.
- **Codex** (OpenAI). Läuft über deinen ChatGPT-Tarif. Seine Modelle sind die von OpenAI. Auch hier gibt es Nutzungslimits, die auf der Nutzungsseite angezeigt werden. Codex ist in der App enthalten.
- **Custom**, der app-eigene Agent. Er nutzt die Modelle deiner Claude- und ChatGPT-Tarife (über die Anmeldungen von Claude Code und Codex) sowie jedes Modell, das du unter [Einstellungen → Agenten → Modelle](/settings?s=models) hinzufügst: Modelle über OpenRouter, Modelle auf diesem Computer (mit Ollama oder vLLM) oder jeden OpenAI-kompatiblen Endpunkt. Verwende ihn für offene Modelle, günstigere Modelle oder Modelle, die deinen Computer nie verlassen. Siehe [Custom, der app-eigene Agent](/guide/custom).
- **Agenten mit ACP-Unterstützung**: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build (der Coding-Agent von xAI mit den Grok-Modellen) und weitere, oder ein eigener Befehl. ACP (das Agent Client Protocol) ist eine gemeinsame Art, wie eine App mit einem Agentenprogramm spricht. Jeder meldet sich einmal in seinem eigenen Programm an und nutzt seine eigenen Modelle.

Was jeder in der App kann:

- Ziele (die App hält den Agenten Runde um Runde bei der Arbeit, bis Prüfungen, denen du zustimmst, erfüllt sind; siehe [Der Sitzung ein Ziel geben](/guide/sessions#give-the-session-a-goal)): jeder Agent, also Claude Code, Codex, Custom und die anderen ACP-Agenten. Ein `/goal`, das in einem Claude-Code- oder Codex-Chat eingegeben wird, ist das eigene, einfachere Ziel dieses Programms. Forks (eine Kopie der Sitzung ab einer früheren Antwort): Claude Code, Codex und Custom. Nicht die anderen ACP-Agenten.
- **Fortsetzen in…** (die Unterhaltung an einen anderen Agenten übergeben): von Claude Code oder Codex aus an den jeweils anderen oder an Custom.
- Aufwand (wie intensiv das Modell nachdenkt): Claude Code, Codex und Grok Build sowie jeder andere ACP-Agent, dessen Modelle ihn anbieten.
- Mehr als ein Konto, Nutzungslimits des Tarifs und Kontowechsel bei einem Limit: Claude Code, Codex und Grok Build.
- Zurücksetzen von Limits und API-Guthaben bei einem Limit: nur Claude Code und Codex.

## Agent und Modell für eine neue Sitzung wählen

Auf der Startseite (`/`) zeigt die Zeile unter dem Nachrichtenfeld, wer die Arbeit erledigt.

1. Klicke auf **Ausführungsumgebung**. Die Liste zeigt **Claude Code** („Anthropic · Claude-Tarif oder API-Key“), **Codex** („OpenAI · ChatGPT-Tarif oder API-Key“), **Custom** („Jedes Modell: OpenRouter, Ollama, vLLM“) und jeden Agenten, den du unter Einstellungen → Weitere Agenten hinzugefügt hast („ACP-Agent · “ und sein Befehl). Ganz unten öffnet **Modelle für Custom** die Einstellungen → Modelle, und **Agenten hinzufügen oder verwalten** öffnet die Einstellungen → Weitere Agenten.
2. Klicke auf **Modell** und wähle eines aus. **Automatisch**, ganz oben und zu Beginn ausgewählt, lässt die Leistungsstufen entscheiden: Am besten und Max, wenn das Problem sich als zu schwer erweist (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](#tiers-a-model-for-each-kind-of-job)). Darunter zeigt die Liste nur die eigenen Modelle dieses Agenten. Der Standard des Agenten ist mit „Standard“ markiert. Ältere Versionen eines Modells verbergen sich hinter einer Zeile wie „2 ältere Modelle“; klicke darauf, um sie zu sehen. Bei mehr als acht Modellen steht oben ein Feld **Modelle suchen**: Tippe ein paar Buchstaben und drücke die Eingabetaste, um den ersten Treffer zu übernehmen. Wenn der Agent nicht wie von der App gewünscht mit seinen Modellen gestartet ist, sagt das Menü das mit den eigenen Worten des Agenten dazu, und **Erneut versuchen** fragt noch einmal an.
3. Unter **Optionen** findest du **Aufwand** (für Agenten und Modelle, die ihn haben: Standard, Niedrig, Mittel, Hoch und so weiter; zu Grok Build siehe [Aufwand für Grok Build](#effort-for-grok-build)) und **Berechtigungen** (was der Agent ohne Rückfrage tun darf). Auch Shift+Tab im Nachrichtenfeld wechselt die Berechtigungen.

Die Startseite merkt sich, was du für jeden Ort gewählt hast, an dem du arbeitest (jedes Projekt, jeden Ordner und **Neuer Aufgabenordner**), auf jedem Gerät: Modell, Aufwand und Berechtigungen jedes Programms kommen dort so zurück, wie du sie verlassen hast (siehe [Was sich die Startseite merkt](/guide/sessions#what-the-start-page-remembers)).

Ein anderer ACP-Agent als Custom zeigt seine Auswahl für **Modell** und **Berechtigungen** erst nach seiner ersten Sitzung: Sie listet, was der Agent bei seinem letzten Lauf angeboten hat. Grok Build ist die Ausnahme: Seine Modelle samt den jeweils möglichen Aufwandsstufen erscheinen, sobald es hinzugefügt wurde, weil die App Grok danach fragt.

Ist **Optionen** → **Vertraulich** eingeschaltet, ist **Ausführungsumgebung** auf **Custom** gesetzt, und **Modell** listet nur die Modelle auf diesem Computer oder in deinem privaten Netzwerk, die besten zuerst ausgewählt: siehe [Eine Sitzung vertraulich halten](/guide/sessions#keep-a-session-confidential).

Auf einem Smartphone öffnet sich jedes dieser Menüs als Sheet vom unteren Bildschirmrand.

## Das Modell mitten in einer Sitzung wechseln

In einer Sitzung stehen Modell, Aufwand und Berechtigungen unter dem Nachrichtenfeld. Sie bilden einen einzigen Chip, der etwa „Opus 5.5 · Hoch · Plan“ lautet: Klicke darauf für **Modell**, **Aufwand** und **Berechtigungen**.

Wähle ein anderes Modell, und die Sitzung läuft damit weiter:

- Claude Code wechselt sofort.
- Codex verwendet das neue Modell ab seinem nächsten Durchgang.
- Custom verwendet es ab seinem nächsten Schritt, sogar mitten in einem Durchgang.
- Ein anderer ACP-Agent wechselt, wenn er eine Auswahl an Modellen anbietet.

Der **Aufwand** der Sitzung funktioniert genauso. Wähle einen aus, und der laufende Agent verwendet ihn ab seinem nächsten Durchgang. Wenn das Modell, zu dem du wechselst, den bisherigen Aufwand nicht unterstützt, zeigt die Auswahl den Standard dieses Modells an, und das Modell läuft damit.

Das Modellmenü listet nur die Modelle des Agenten der Sitzung auf; bei einer vertraulichen Sitzung nur die auf diesem Computer oder in deinem privaten Netzwerk. Um eine Unterhaltung an einen anderen Agenten zu übergeben, nutze das Menü der Sitzung (⋯) → **Fortsetzen in Codex**, **Fortsetzen in Claude Code** oder **Fortsetzen in Custom Agent** (aus Claude-Code- und Codex-Sitzungen; Custom erscheint, sobald es ein Modell hat). Deine nächste Nachricht startet dann eine neue Sitzung dieses Agenten im selben Ordner, mit der bisherigen Unterhaltung. Eine gestoppte Sitzung wird mit dem zuletzt verwendeten Modell fortgesetzt, sofern du vor dem Senden kein anderes auswählst.

## Aufwand für Grok Build

Die Modelle von Grok unterstützen einen Denkaufwand, dieselbe Auswahl, die dir auch Claude Code und Codex bieten:

- Grok 4.6 (und neuere Modelle, die dasselbe anbieten): **xhigh**, **Hoch**, **mittel** oder **Niedrig**. **Hoch** ist der Standard.
- Grok 4.5: **Hoch**, **mittel** oder **Niedrig**.

Wähle auf der Startseite unter **Ausführungsumgebung** den Eintrag **Grok Build**, dann **Optionen** → **Aufwand**: Die Liste zeigt die Aufwandsstufen des gewählten Modells, mit **Standard**. Sie erscheinen, sobald Grok Build hinzugefügt wurde, noch vor der ersten Sitzung. Eine laufende Grok-Build-Sitzung ändert ihren Aufwand in ihrer eigenen Auswahl **Aufwand** (dem Chip unter dem Nachrichtenfeld), und auch ein Lauf einer [App](/guide/apps) nimmt einen entgegen. Wenn du eine Sitzung auf ein Modell umstellst, das den bisherigen Aufwand nicht unterstützt (xhigh bei Grok 4.5), zeigt die Auswahl den Standard dieses Modells an, und damit läuft das Modell.

Das gibt es nicht nur für Grok: Jeder andere Agent mit ACP-Unterstützung, dessen Modelle Aufwandsstufen anbieten, bekommt dieselbe Auswahl für **Aufwand**.

## Leistungsstufen: ein Modell für jede Art von Aufgabe

Agenten wählen Modelle nach Leistungsstufe statt nach Namen: **Schnell** für kleine, sehr klare Aufgaben, deren Ergebnis sich prüfen lässt, **Standard** für klare Aufgaben mittlerer Größe, **Am besten** für den Hauptagenten einer Sitzung, der plant, Subagenten koordiniert und ihre Arbeit prüft, und **Max** für die schwierigsten Probleme. Der größte Teil einer Aufgabe besteht aus klaren Teilen, die ein günstigeres Modell gut erledigt, sodass eine Sitzung so weniger kostet, ohne dass das Ergebnis schlechter wird: Das stärkste Modell im Raum plant die Arbeit trotzdem und prüft sie.

Auf der Startseite steht **Modell** auf **Automatisch**: Die Sitzung startet mit Am besten (dasselbe **Automatisch** startet die Sitzungen einer [Geplanten Aufgabe](/guide/tasks#model-effort-permissions-and-other-options), und eine [App](/guide/apps) kann statt mit einem Modell nach Namen mit einer Leistungsstufe denken). Ihr Hauptagent gibt klare Teile an Subagenten auf Standard und Schnell weiter und kann sich selbst auf Max umstellen, wenn ein Problem sich als schwerer erweist, als Am besten bewältigen kann (eine Korrektur, die zweimal gescheitert ist, eine Ursache, die er nicht findet, ein Beweis); eine Zeile in der Unterhaltung sagt das, mit Begründung. Eine Anfrage geht nicht allein wegen ihres Wortlauts an Max: Am besten löst das meiste, was schwierig klingt, für weniger. Wählst du stattdessen ein Modell nach Namen, denkt die Sitzung mit diesem; ihre Subagenten bekommen weiterhin Leistungsstufen. Ein Agent von dir kann stattdessen mit einer einzigen Leistungsstufe denken (siehe [Womit ein Agent denkt: Leistungsstufen](/guide/agents#what-an-agent-thinks-with-tiers)).

[Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) sagt, was jede Stufe für jedes Programm bedeutet: eine Zeile für jede Stufe, mit einem Schalter neben dem Titel der Gruppe, um das Programm zu wählen (**Claude Code**, **Codex** oder **Custom**), und in jeder Zeile ein Modell und, bei Claude Code und Codex, ein Aufwand. Das (i) einer Stufe sagt mehr dazu. Zu Beginn ist bei Claude Code Schnell gleich Haiku, Standard gleich Sonnet, Am besten gleich Opus und Max das neueste Fable; bei Codex ist Schnell gleich Luna, Standard gleich Terra, Am besten gleich Sol und Max gleich Astra (in einem Tarif ohne eines davon das nächstliegende, das er anbietet, mit mehr Aufwand für die höhere Stufe, wo sich zwei ein Modell teilen); die Stufen von Custom füllen sich selbst: Eine Stufe, die du in Ruhe lässt, nimmt das neueste Modell ihrer Art aus den Modellen, die Custom hat. Aus deinem Claude-Tarif sind das Haiku für Schnell, Sonnet für Standard, Opus für Am besten und das neueste Fable für Max; sonst aus deinem ChatGPT-Tarif Luna, Terra, Sol und Astra; sonst aus den Modellen, die du hinzugefügt hast und die nicht auf diesem Computer laufen (OpenRouter, ein Endpunkt) und deren Namen eine dieser Familien nennen. Ein Modell auf diesem Computer wird nie für dich gewählt, weil sein Name nicht verrät, wie stark es ist, und ein kleines Modell (Haiku, Luna) wird nie Am besten: Mit nur kleinen oder lokalen Modellen bleiben die Stufen leer, bis du wählst, und eine Custom-Sitzung behält dann das Modell, das sie gewählt hat. Sobald Am besten ein Modell nennt, bietet die Startseite **Automatisch** für Custom an, und seine Sitzungen koordinieren Subagenten (Hydor-Subagenten, da Custom kein eigenes Agent-Werkzeug hat). Auf dem Tab **Custom** kannst du für eine Stufe jedes seiner Modelle benennen (siehe [Woher die Modelle von Custom kommen](#where-customs-models-come-from)). Eine Stufe, die du in Ruhe lässt, folgt dem neuesten Modell ihrer Art im jeweiligen Programm. **Zurück zu den Standardeinstellungen** im Menü **⋯** neben dem Titel setzt sie zurück, auch die Auswahl von Custom.

Zwei Schalter in der Gruppe **Modellstufen in Sitzungen** unter den Leistungsstufen legen fest, wie Sitzungen sie nutzen:

- **Subagenten koordinieren** (zu Beginn an): Der Hauptagent einer Sitzung wird angewiesen zu planen, klare Teile an Subagenten auf günstigeren Stufen weiterzugeben und ihre Arbeit zu prüfen, und ein Subagent, der ohne Stufe angefordert wird, bekommt Standard. Ist er aus, arbeiten Agenten allein, sofern sie sich nicht anders entscheiden, und die Startseite und das Aufgabenformular haben kein Automatisch.
- **Max für schwierige Probleme** (zu Beginn an): Ein Hauptagent auf Automatisch kann sich selbst auf Max umstellen, wenn ein Problem für Am besten zu schwer wird. Ist er aus, bleiben Sitzungen auf Automatisch bei Am besten.

## Agentenprogramme installieren und aktualisieren sich selbst

Claude Code, Codex, Gemini CLI, Grok Build und die anderen sind Programme auf diesem Computer. Du musst sie nicht von Hand installieren.

Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Agent%20programs) und sieh dir die Gruppe **Agentenprogramme** an. Sie listet Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build (sobald du es hinzugefügt hast) und die Agenten, die einen ACP-Adapter brauchen, jeweils mit der Version, die die Sitzungen ausführen, und der Herkunft:

- **deine eigene Installation**: Du hast es selbst installiert (bei Grok Build auch mit dem eigenen Installer von xAI, der es in `~/.grok/bin` ablegt).
- **von der App installiert**: Die App hat es in ihrem eigenen Ordner installiert.
- **In der App enthalten**: Codex wird mit der App ausgeliefert.
- **Nicht installiert: Wird bei der ersten Nutzung automatisch installiert**: fehlt. Klicke auf **Installieren**, um es jetzt zu holen.

Eine Zeile sagt auch „… ist erschienen“, wenn eine neuere Version erschienen ist. Die Zeile von Codex ergänzt „deine im Terminal: …“, wenn du auch ein eigenes Codex hast: Die Sitzungen führen das der App aus, ein Terminal führt deines aus.

Ein fehlendes Programm installiert sich auch von selbst, sobald es zum ersten Mal gebraucht wird: Claude Code, wenn du dich bei ihm anmeldest oder eine Claude-Code-Sitzung startest, ein ACP-Agent, wenn du ihn unter Einstellungen → Agenten → Weitere Agenten hinzufügst oder eine Sitzung mit ihm startest. Die App installiert sie mit npm in ihren eigenen Ordner, du brauchst also keine Administratorrechte.

Goose, Kimi CLI und einige andere Agenten stehen nicht in dieser Liste: Installiere sie selbst (Einstellungen → Agenten → Weitere Agenten zeigt, wo du sie bekommst). Ein Agent, der einen ACP-Adapter braucht, installiert sich in zwei Teilen, dem Adapter und dem Agenten selbst; die Liste zeigt für beide eine Zeile.

## Die Agentenprogramme aktuell halten

Wenn [**Automatisch aktualisieren**](/settings?s=accounts&find=Update%20automatically) eingeschaltet ist, die letzte Zeile unter **Agentenprogramme** (es ist eingeschaltet, solange du es nicht ausschaltest), bringt die App jedes Agentenprogramm einmal am Tag auf die neueste Version. Der erste Durchlauf erfolgt etwa zehn Minuten nach dem Start der App.

- Die Kopien, die die App installiert hat, werden mit npm in ihrem eigenen Ordner aktualisiert. Codex wechselt zu einer Kopie, die neuer ist als die, mit der die App geliefert wurde.
- Deine eigenen Installationen werden mit ihrem eigenen Updater aktualisiert: `claude update` für Claude Code, `codex update` für Codex (die Version, die dein Terminal startet), `opencode upgrade` für OpenCode, `grok update` für Grok Build.
- Gemini CLI, Qwen Code, Auggie, Grok Build oder ein Agent mit ACP-Adapter, den du mit `npm install -g` installiert hast, werden mit npm aktualisiert, sofern dein Benutzer in diesen Ordner schreiben darf. Alles, was auf anderem Weg installiert wurde, musst du selbst so aktualisieren, wie du es installiert hast.
- Claude Code folgt seiner eigenen Release-Linie: der stabilen, wenn in seinen Einstellungen `"autoUpdatesChannel": "stable"` steht, sonst der neuesten.
- Wenn du die eigenen Updates von Claude Code mit `DISABLE_AUTOUPDATER=1` ausgeschaltet hast (das Docker-Image tut das), aktualisiert die App dein Claude Code auch nicht von selbst. **Jetzt aktualisieren** tut es trotzdem.

Die App behält eine neue Version erst, wenn sie so funktioniert, wie die Sitzungen sie verwenden. Claude Code muss beim Start einer Sitzung antworten und seine Modelle auflisten, Codex muss seinen App-Server starten und seine Modelle auflisten, und die anderen müssen starten und ihre Version nennen. Nichts davon erfordert eine Anmeldung oder verbraucht etwas von deinem Tarif. Jedes Programm hat eine Minute Zeit zu antworten, und es zählt nur die Zeit, in der der Computer wach ist. Ein Mac, der mitten in der Prüfung in den Ruhezustand geht, verbraucht die Minute also nicht. Ein Programm, das beim ersten Mal langsam antwortet (ein Mac prüft ein neues Programm, bevor es zum ersten Mal läuft), wird mit zwei weiteren Minuten erneut gestartet und scheitert erst, wenn es auch dann nicht antwortet. Eine Version, die scheitert, wird rückgängig gemacht:

- Eine Kopie, die die App installiert hat, oder eine deiner eigenen, die sie mit npm aktualisiert hat, geht auf die vorherige Version zurück.
- Bei deinem eigenen Claude Code laufen die Sitzungen weiter mit der vorherigen Version, die der Installer von Claude Code neben der neuen aufbewahrt. Der Befehl `claude` in einem Terminal bleibt auf der neuen. In der Zeile steht „… did not work here“.
- Eine Version, die gescheitert ist, wird nicht von selbst erneut versucht, die nächste aber schon, und **Jetzt aktualisieren** versucht sie erneut.

Unter dieser Zeile steht, wann die App zuletzt nachgesehen hat, etwa „Up to date · checked 2h ago“, mit **Jetzt prüfen**, um erneut nachzusehen. Wenn neuere Versionen verfügbar sind, steht das dort, mit **Jetzt aktualisieren**, um alle auf einmal zu installieren (es gibt keine Schaltfläche pro Programm); während der Arbeit wird angezeigt, welches Programm gerade aktualisiert wird. Die Zeilen darunter nennen, was das letzte Update geändert hat, etwa „Claude Code 2.1.308 → 2.1.316“, oder warum eine Version nicht installiert werden konnte.

Laufende Sitzungen machen mit der Version weiter, mit der sie gestartet sind; neue Sitzungen verwenden die neue. Ist **Automatisch aktualisieren** ausgeschaltet, sieht die App trotzdem einmal am Tag nach und zeigt an, was verfügbar ist, installiert aber nichts, bis du auf **Jetzt aktualisieren** klickst.

## Claude Code, Codex und Grok Build anmelden

Claude Code und Codex brauchen eine Anmeldung, bevor sie arbeiten können, ebenso Grok Build, sobald du es hinzugefügt hast (siehe [Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen](#add-gemini-cli-opencode-and-other-acp-agents)). Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts) (auf einem Telefon ist Einstellungen eine Liste von Bereichen: tippe unter „Agenten“ auf **Konten**; der Titel oben bringt dich zurück). Die Gruppe **Konten** (ihr (i) erklärt, dass dies die Anmeldungen für Claude Code, Codex und Grok Build sind, die deine Sitzungen verwenden, dass du ein weiteres Abonnement hinzufügen kannst, etwa ein berufliches und ein privates, und beim Start einer Sitzung eines auswählen kannst) listet zuerst die eigene Anmeldung jedes Agenten auf, dann die Konten, die du dafür hinzugefügt hast. Auch die eigene Anmeldung von Grok Build hat dort eine Zeile, **Grok Build**, die erscheint, sobald es hinzugefügt ist. Jede zeigt einen grünen Haken mit E-Mail, Tarif und Anmeldemethode oder ein rotes Kreuz mit „Nicht angemeldet“ oder dem, was schiefgelaufen ist.

So meldest du dich an:

1. Klicke neben dem Agenten auf **Anmelden**.
2. Wähle, wie:
   - Claude Code: **Claude-Abonnement** (dein Claude-Tarif) oder **Konsole (API-Abrechnung)** (ein Anthropic-API-Konto).
   - Codex: **Gerätecode** oder **Browserumleitung**.
   - Grok Build: nichts zu wählen, die Anmeldung erfolgt immer mit einem Code.
3. Klicke auf **Anmeldelink abrufen**.
4. Folge den Schritten, die der Dialog zeigt:
   - Claude Code: öffne den Link (**Anmeldeseite öffnen**), genehmige den Zugriff in deinem Browser, füge dann den Code, den die Seite anzeigt, bei **Code von der Seite einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Codex, Gerätecode: öffne den Link auf einem beliebigen Gerät, melde dich bei ChatGPT an und gib den einmaligen Code ein, der im Dialog steht. Der Dialog merkt selbst, wenn du fertig bist.
   - Codex, Browserumleitung: Nach deiner Anmeldung versucht dein Browser, eine „localhost“-Seite zu öffnen, und scheitert. Kopiere die Adresse dieser Seite, füge sie bei **localhost-Adresse aus deinem Browser einfügen** ein und klicke auf **Anmeldung abschließen**.
   - Grok Build: Du bekommst einen Link und einen einmaligen Code. Öffne den Link auf einem beliebigen Gerät, melde dich mit deinem Grok-Konto an und bestätige den Code (**2. Bestätige diesen Code**). Es wird nichts zurückgefügt: Der Dialog merkt selbst, wenn du fertig bist.

Wenn es klappt, siehst du „Claude Code is signed in“ (oder Codex oder Grok Build). Wenn es scheitert, nennt der Dialog den Grund; klicke auf **Erneut versuchen**.

Sobald du angemeldet bist, heißt die Schaltfläche **Konto wechseln**: Sie startet dieselbe Anmeldung für ein anderes Konto (bei Grok Build mit einem neuen Code). **Abmelden** findest du im **⋯**-Menü der Zeile: Nach deiner Bestätigung meldet es das Programm auf diesem Computer ab, für jedes Terminal und jeden Editor, der es verwendet.

Wenn du eine Grok-Build-Sitzung startest, während es abgemeldet ist, bricht die Sitzung ab mit „Grok Build is not signed in: sign in with your Grok account in Settings → Agents → Accounts, then try again.“ Melde dich dort an und sende deine Nachricht erneut. Ein xAI-API-Key in `XAI_API_KEY` in der Umgebung der Agenten funktioniert für Grok Build anstelle eines Abonnements.

Die Willkommenstour (über **Hilfe** in der Leiste) fragt, welche Agenten und Modelle du verwenden möchtest, und führt dich ebenfalls durch diese Anmeldungen.

## Ein zweites Konto hinzufügen (beruflich und privat)

Du kannst mehr als ein Konto für Claude Code, Codex oder Grok Build anmelden, zum Beispiel einen beruflichen und einen privaten Tarif, und pro Sitzung eines auswählen.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Accounts).
2. Klicke neben dem Titel der Gruppe **Konten** auf **Konto hinzufügen**.
3. Wähle **Claude Code**, **Codex** oder **Grok Build** (es wird angeboten, sobald Grok Build eingerichtet ist), gib einen Namen ein (bis zu 40 Zeichen, etwa „Beruflich“ oder „Privat“) und klicke auf **Hinzufügen und anmelden**.
4. Der Anmeldedialog für das neue Konto öffnet sich. Melde dich an, wie oben beschrieben.

Jedes hinzugefügte Konto meldet sich für sich an und behält seinen eigenen Sitzungsverlauf. Deine Einstellungen, Anweisungen, Skills und Plugins werden mit der Hauptanmeldung des Agenten geteilt, Änderungen gelten also für beide. Bei Claude Code gilt ein Ordner, dem du mit der Hauptanmeldung vertraut hast, auch für ein hinzugefügtes Konto als vertrauenswürdig, sodass in dessen Sitzungen die eigenen Berechtigungsregeln des Ordners gelten. Zwei Konten desselben Agenten dürfen nicht denselben Namen haben.

Ein hinzugefügtes Grok-Build-Konto hat einen eigenen Ordner mit seiner Anmeldung und dem eigenen Sitzungsverlauf von Grok. Es teilt die eigenen Einstellungen der Grok CLI mit deiner Hauptanmeldung: Konfiguration, Regeln (`AGENTS.md`), Skills, Plugins und MCP-Anmeldungen.

Jedes hinzugefügte Konto hat unter der eigenen Anmeldung des Agenten eine eigene Zeile mit **Anmelden** oder **Konto wechseln**; ihr **⋯**-Menü enthält **Abmelden**, **Umbenennen** und **Entfernen**:

- **Umbenennen** fragt nach einem neuen Namen.
- **Abmelden** sorgt dafür, dass die Sitzungen, die als dieses Konto laufen, nicht mehr funktionieren, bis es sich wieder anmeldet.
- **Entfernen** nimmt das Konto aus der App. Seine Sitzungen verschwinden aus der Liste, ihr Verlauf bleibt aber auf der Festplatte, es sei denn, du setzt auch das Häkchen bei **Auch die Anmeldung und den Verlauf seiner Sitzungen löschen**. Ein Konto lässt sich nicht entfernen, solange Sitzungen als dieses Konto laufen: Beende sie zuerst.

Die [Seite „Nutzung“](/usage) zeigt für jedes hinzugefügte Claude-Code-, Codex- oder Grok-Build-Konto eine Karte mit den eigenen Limits.

## Das Konto wählen, als das eine Sitzung läuft

Wenn der Agent, den du gewählt hast, hinzugefügte Konten hat (bei Grok Build, sobald du eines hinzugefügt hast), zeigen die **Optionen** der Startseite eine Zeile **Konto**. Klicke darauf:

- **Deine Anmeldung** ist das eigene Konto des Programms (das erste für diesen Agenten unter **Konten**; bei Grok Build „The Grok Build CLI's own account“).
- Jedes hinzugefügte Konto steht mit seinem Namen in der Liste.
- **Konten verwalten** öffnet Einstellungen → Agenten → Konten.

Die Startseite merkt sich deine Wahl für diesen Agenten, überall gleich. Eine Sitzung, die als hinzugefügtes Konto läuft, zeigt oben in der Sitzung den Namen dieses Kontos mit einem Personensymbol. Wenn dieses Konto ein Nutzungslimit erreicht, betrifft der Limit-Hinweis über dem Nachrichtenfeld dieses Konto. Das Konto wird beim Start der Sitzung festgelegt. Es ändert sich von selbst nur mit **Bei erreichtem Limit das Konto wechseln** (siehe unten).

Um eine Sitzung selbst auf ein anderes Konto zu verschieben, klicke auf den **Konto**-Chip der Sitzung und wähle eines aus. Das funktioniert für Sitzungen mit Claude Code, Codex und Grok Build und gilt ab deiner nächsten Nachricht. Der Grok-Verlauf einer Grok-Build-Sitzung wandert mit; wenn Grok ihn unter dem anderen Konto nicht wieder öffnen kann, beginnt die Sitzung dort neu, mit einem Hinweis.

## Alle deine Konten nutzen: bei einem Limit wechseln

Mit zwei oder mehr Konten für denselben Agenten kann die App sie alle nutzen: Wenn bei einem das Nutzungskontingent aufgebraucht ist, geht deine Arbeit mit einem anderen weiter. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) und suche **Bei erreichtem Limit das Konto wechseln** in der Gruppe **Nutzungslimit erreicht** unter **Konten**, die erscheint, sobald du irgendein Konto hinzugefügt hast, auch eines für Grok Build (ihr (i) erklärt, dass die Sitzung zu einem anderen Konto dieses Agenten mit verbleibendem Kontingent wechselt und weitermacht, wenn das Kontingent des Kontos einer Sitzung aufgebraucht ist, und dass neue Sitzungen ein Konto am Limit überspringen). Es ist von Anfang an eingeschaltet (schalte es dort aus, wenn du das Konto lieber selbst wählst), und es funktioniert, auch wenn kein Browser geöffnet ist.

- Wenn ein Durchgang endet, weil das Konto der Sitzung sein Nutzungslimit erreicht hat, wählt die App ein anderes angemeldetes Konto desselben Agenten, das noch Kontingent hat (das am wenigsten genutzte), verschiebt die Sitzung mit ihrem gesamten Verlauf dorthin und sendet „… reached its usage limit, so this session now runs on …. Continue where you left off.“ Ein kurzer Hinweis am unteren Bildschirmrand nennt das Konto, zu dem gewechselt wurde.
- Auch die Subagents, die eine Claude-Code-Sitzung im Hintergrund ausführt, machen weiter. Diejenigen, die beim Erreichen des Limits noch arbeiten, halten bei ihrem nächsten Schritt an, wobei ihre Arbeit erhalten bleibt, und die App wartet auf sie (höchstens zwei Minuten), bevor sie die Sitzung verschiebt. Die Nachricht nennt sie dann, und der Agent setzt jeden dort fort, wo er angehalten hat. Wenn nur die Subagents ein Limit erreichen (etwa eines nur für ihr Modell), wird die Sitzung verschoben, sobald ihr Durchgang beendet ist und keiner von ihnen mehr arbeitet.
- Hydor-Subagents (die Sitzungen, die ein Agent startet, um einen Teil seiner Arbeit zu erledigen) sind eigene Sitzungen, daher wechselt jeder von selbst, wenn ein Limit seinen Durchgang stoppt. Der Agent, der ihn gestartet hat, erfährt, dass er weitermacht und nicht gescheitert ist, und bekommt seine Antwort, wenn er fertig ist.
- Deine Hauptanmeldung und jedes hinzugefügte Konto zählen alle. Claude-Code-Konten werden von Claude-Code-Konten abgelöst, Codex von Codex, Grok Build von Grok Build.
- Ein Grok-Build-Konto hat sein Limit erreicht, wenn es sein Wochenlimit, sein Guthabenlimit oder sein Ausgabenlimit für nutzungsabhängige Abrechnung erreicht. Die Sitzung wechselt dann zu einem anderen angemeldeten Grok-Konto mit verbleibendem Kontingent (dem am wenigsten genutzten) und macht weiter mit „… reached its usage limit, so this session now runs on …“. Ein kurzes Rate-Limit (eine Anfragewelle) verschiebt nichts: Es geht von selbst vorbei. Der Limit-Hinweis über dem Nachrichtenfeld wird auch für Grok-Sitzungen angezeigt.
- Ein Ziel, das die App steuert, gehört der App, es läuft also auf dem neuen Konto weiter. Ein Ziel, das in Codex als `/goal` eingegeben wurde, wandert mit der Sitzung und läuft weiter.
- Wenn alle Konten an ihrem Limit sind, wird nichts verschoben (es sei denn, **Bei erreichtem Limit API-Guthaben verwenden** ist eingeschaltet, siehe unten, für Claude Code). Ist **Nach dem Zurücksetzen von Nutzungslimits fortsetzen** eingeschaltet, macht die Sitzung weiter, wenn das erste Konto zurückgesetzt wird, auf diesem Konto. Das gilt auch für Grok-Build-Sitzungen. Mehr dazu unter [Nutzung, Limits und Kosten](/guide/usage#continue-sessions-automatically-after-a-limit).
- Eine neue Sitzung, die auf einem Konto am Limit gestartet wird, startet stattdessen auf einem mit verbleibendem Kontingent, und eine Nachricht, die du an eine Sitzung sendest, deren Konto am Limit ist, verschiebt zuerst die Sitzung, damit die Nachricht nicht abgewiesen wird. Mit deiner Nachricht erfährt der Agent, dass er jetzt auf einem Konto mit verbleibendem Kontingent läuft, damit er nicht auf das Zurücksetzen des alten Kontos wartet, und welche seiner Subagents weitermachen können.
- Sitzungen, die in VS Code oder einem Terminal geöffnet sind, bleiben auf ihrem Konto.
- Zurücksetzen von Limits (Codex-Reset-Guthaben, Claude-Reset-Gutschriften) und API-Guthaben gibt es weiterhin nur für Claude Code und Codex.
- Die schnellen Fragen der App an Claude Code oder Codex (das Hilfsmodell auf **Automatisch**, schnelle Modellschritte einer App, Pull-Request-Beschreibungen, Befehlsvorschläge) gehen auf dieselbe Weise an dein nächstes angemeldetes Konto, wenn eines am Limit oder abgemeldet ist. Wenn weder Claude Code noch Codex antworten kann, springt eines deiner Custom-Modelle ein (siehe [Wenn ein Konto abgemeldet ist](#when-an-account-is-signed-out)).

## Wenn ein Konto abgemeldet ist

Ein Konto von Claude Code, Codex oder Grok Build kann abgemeldet werden: Die Anmeldung ist abgelaufen oder wurde widerrufen, und das Programm meldet „Not logged in · Please run /login“ oder „401 Unauthorized“. Die App umgeht das, wo sie kann, und bittet dich nur dann, dich erneut anzumelden, wenn nichts anderes die Arbeit übernehmen könnte.

- **Deine Sitzungen.** Wird der Durchgang einer Sitzung abgewiesen, weil ihr Konto abgemeldet ist, und ist [Bei erreichtem Limit das Konto wechseln](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) eingeschaltet (das ist von Anfang an so), wechselt die Sitzung samt ihrem gesamten Verlauf zu einem anderen angemeldeten Konto desselben Agents, das noch Nutzung übrig hat, und macht dort weiter. Ein kurzer Hinweis am unteren Bildschirmrand lautet „<Sitzung>: <Konto> ist abgemeldet, daher geht es mit <anderes Konto> weiter“, und dem Agent wird mitgeteilt: „… ist abgemeldet, daher läuft diese Sitzung jetzt auf …. Mach da weiter, wo du aufgehört hast.“ Eine Nachricht, die du an eine Sitzung sendest, deren Konto vor kurzem als abgemeldet erkannt wurde, lässt die Sitzung zuerst auf die gleiche Weise wechseln, damit die Nachricht nicht abgewiesen wird.
- **Wenn eine Sitzung nicht wechseln kann.** Ist **Bei erreichtem Limit das Konto wechseln** ausgeschaltet oder hat kein anderes Konto dieses Agents noch Nutzung übrig, hält die Sitzung an. Über ihrem Nachrichtenfeld erscheint ein Banner mit „<Konto> ist abgemeldet“ und „Diese Sitzung geht weiter, sobald du dich erneut anmeldest.“ sowie einer Schaltfläche **Anmelden**. Sobald du wieder angemeldet bist, hier oder in einem Terminal, macht die Sitzung von selbst weiter, und dem Agent wird mitgeteilt: „Wieder angemeldet. Mach da weiter, wo du aufgehört hast.“
- **Hintergrundarbeit.** Die kleinen Aufgaben des [Hilfsmodells](/settings?s=models&find=Helper%20model) auf **Automatisch** (Sitzungstitel, Memory-Notizen, Kürzen von [deinem Profil](/guide/memory#your-profile), schnelle Modellschritte einer App, Pull-Request-Beschreibungen …) überspringen ein abgemeldetes Konto für 15 Minuten und versuchen es dann erneut, sodass eine Anmeldung, die du in einem Terminal vornimmst, bemerkt wird. Das nächste angemeldete Konto antwortet, danach Codex. Wenn weder Claude Code noch Codex antworten können (abgemeldet, am Limit oder nicht installiert), übernimmt eines deiner **Custom**-Modelle die Aufgabe: das Modell, das die Stufe **Schnell** von Custom unter [Einstellungen → Agenten → Modelle → Leistungsstufen](/settings?s=models&find=Tiers) nennt (danach **Standard**, und für die seltenen größeren Aufgaben **Am besten**, dann **Max**), oder sonst das günstigste Modell, das du hinzugefügt hast (ein Modell auf diesem Computer gilt als kostenlos). Es werden höchstens zwei ausprobiert. Was das kostet, wird wie die Nutzung jedes Custom-Modells gezählt.
- **Die Aufforderung zur Anmeldung.** Nur wenn nichts die Arbeit übernehmen konnte und ein Konto abgemeldet war, erscheint auf jeder Seite unten rechts eine Karte (auf einem Smartphone über dem Nachrichtenfeld). Ihr Titel lautet „Melde dich erneut bei Claude Code an“ (oder Codex oder Grok Build), darunter „<Konto> ist abgemeldet.“, und der Grund der Aufforderung: „Hintergrundarbeit braucht es (Kürzen deines Profils), und kein anderes Konto und kein Custom-Modell konnte sie erledigen.“ oder, bei einer Sitzung, die sie angehalten hat, „… geht weiter, sobald du dich anmeldest.“ **Anmelden** öffnet denselben Anmeldedialog wie [Einstellungen → Agenten → Konten](/settings?s=accounts). **Nicht jetzt** blendet die Karte für eine Stunde aus; eine Sitzung, die deswegen anhält, zeigt die Karte wieder, und das Banner in dieser Sitzung bleibt. Es werden höchstens zwei Karten gleichzeitig angezeigt, dann führt „+N weitere“ zu Einstellungen → Agenten → Konten. Eine Karte verschwindet, sobald das Konto wieder angemeldet ist, über die Karte, über die Einstellungen oder in einem Terminal (die App bemerkt es bei ihrem nächsten Aufruf, der durchkommt). Sie verschwindet auch, sobald die Hintergrundarbeit auf anderem Weg wieder erledigt wird (ein anderes Konto oder ein Custom-Modell antwortet). Wenn sowohl Claude Code als auch Codex abgemeldet sind, wird nur nach Claude Code gefragt, das als Erstes antwortet.

Dein Profil zeigt es ebenfalls: Ist das Kürzen fehlgeschlagen, weil ein Konto abgemeldet ist, steht der Grund darunter („Dein Claude-Code-Konto „Work“ ist abgemeldet, und kein anderes Konto und kein Custom-Modell konnte das erledigen: Melde dich erneut an (Einstellungen → Agenten → Konten).“) und die Karte erscheint.

## API-Guthaben verwenden, wenn jedes Konto am Limit ist

Wenn du einen Anthropic-API-Key hast (von [console.anthropic.com](https://console.anthropic.com) → API keys), können deine Claude-Code-Sitzungen damit weitermachen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, statt anzuhalten. Das kostet Geld: Die Sitzung wird von Anthropic zu API-Preisen abgerechnet, solange sie so läuft, und ist nicht durch dein Abonnement gedeckt.

1. Öffne [Einstellungen → Agenten → Konten](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). Klicke in der Zeile eines Claude-Code-Kontos unter **Konten** (deine Hauptanmeldung oder eines, das du hinzugefügt hast) auf **⋯** und dann auf **API-Key hinzufügen…**.
2. Füge den Key bei **Anthropic-API-Key** ein und klicke auf **Key speichern**. Die App prüft ihn bei Anthropic und speichert ihn verschlüsselt auf diesem Computer. In der Zeile erscheint dann ein Tag **API-Guthaben**. **API-Key ändern…** ersetzt ihn, und **API-Key entfernen** löscht ihn.
3. Schalte **Bei erreichtem Limit API-Guthaben verwenden** ein, in der Gruppe **Nutzungslimit erreicht** (sein (i) erklärt, dass Sitzungen, wenn jedes Claude-Code-Konto sein Nutzungslimit erreicht hat, weitermachen und über den Anthropic-API-Key eines Kontos abgerechnet werden, statt anzuhalten, und dass die Option ausgeschaltet ist, bis du sie einschaltest). Sie erscheint, sobald Claude Code angemeldet ist oder du ein Claude-Code-Konto hinzugefügt hast.

Was dann passiert:

- Erreicht das Konto einer Claude-Code-Sitzung sein Nutzungslimit, versucht die App zuerst, was **Bei erreichtem Limit das Konto wechseln** tut: ein anderes Konto mit Nutzung übrig. Nur wenn keines mehr etwas übrig hat und die Einstellung eingeschaltet ist, macht die Sitzung mit Abrechnung über den API-Key weiter.
- Die Sitzung bleibt bei ihrem eigenen Konto, ihr Verlauf wird also nicht verschoben. Hat dieses Konto keinen Key, wird der Key eines anderen Claude-Code-Kontos verwendet.
- Die Sitzung zeigt oben neben ihrem Konto ein Tag **API-Guthaben**. Bewege den Mauszeiger darüber, um den Grund zu sehen.
- Hat ein Tarif wieder Nutzung übrig, kehrt die Sitzung nach dem Ende ihres nächsten Durchgangs dorthin zurück: zu ihrem eigenen Konto oder zu einem anderen mit Nutzung übrig. Du musst nichts tun.
- Kann die App die Nutzung eines Kontos nicht lesen, verschiebt sie deine Arbeit nie auf API-Abrechnung.
- Codex ist nicht betroffen: Es hat kein API-Guthaben.

## Gemini CLI, OpenCode und andere ACP-Agenten hinzufügen

Öffne [Einstellungen → Agenten → Weitere Agenten](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Deine Agenten** (sie erscheinen neben Claude Code und Codex, wenn du eine Sitzung startest) listet zuerst Custom auf, dann die Agenten, die du hinzugefügt hast. Bei jedem steht ein Häkchen, wenn sein Programm hier installiert ist, oder ein Kreuz und „nicht installiert“.
- **Agenten mit ACP-Unterstützung** (einen installieren, einmal in dessen eigener CLI anmelden, dann hier hinzufügen) listet die bekannten auf, die du noch nicht hinzugefügt hast: Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build und weitere. Die installierten stehen zuerst. Eine Zeile mit „Nicht installiert“ sagt, wie du ihn bekommst. Die Liste zeigt die ersten paar, die nicht installiert sind; **Alle anzeigen** zeigt den Rest.

So fügst du einen hinzu:

1. Klicke am Ende seiner Zeile auf **Hinzufügen**. Die Schaltfläche ist hervorgehoben, wenn das Programm bereits installiert ist.
2. Wenn die App weiß, wie man ihn installiert (Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build und die Agenten, die einen ACP-Adapter brauchen), installiert sie ihn jetzt im Hintergrund. Goose, Kimi CLI und die anderen installierst du selbst, mit dem Befehl oder der Adresse in ihrer Zeile.
3. Melde dich einmal im eigenen Programm des Agents an: Öffne das [Terminal](/terminal), führe seinen Befehl aus (zum Beispiel `gemini`) und folge seiner Anmeldung. Wenn du das überspringst, sagt es dir eine Sitzung: „Gemini CLI is not signed in. Run gemini once in a terminal and sign in there, then try again.“

Der Agent erscheint nun in der Liste **Ausführungsumgebung** der Startseite.

Um einen hinzugefügten Agent zu ändern, klicke auf **Bearbeiten**. Um ihn zu entfernen, öffne sein Menü **⋯**, wähle **Entfernen** und bestätige: Seine Sitzungen bleiben aufgelistet, aber um sie fortzusetzen, muss der Agent wieder eingerichtet sein. Custom ist eingebaut: Seine Zeile sagt „Built in: models from OpenRouter, Ollama and vLLM, in Settings → Models“ und hat eine Schaltfläche **Modelle** statt Bearbeiten und Entfernen.

### Grok Build

**Grok Build** ist der Coding-Agent von xAI (das Programm `grok`). Klicke in seiner Zeile auf **Hinzufügen**, mehr ist nicht nötig: Die App installiert ihn bei der ersten Verwendung aus npm (`@xai-official/grok`) oder nutzt einen, der schon hier ist, auch einen aus dem eigenen Installer von xAI in `~/.grok/bin`. Danach erscheint er unter **Agentenprogramme** und wird zusammen mit den anderen aktuell gehalten. Hydor führt ihn über ACP aus, mit den eigenen Tools der App, den Genehmigungskarten und den Modellen von Grok.

Die Anmeldung läuft anders als bei den anderen ACP-Agenten: nicht im Terminal, sondern unter [Einstellungen → Agenten → Konten](/settings?s=accounts), wo eine Zeile **Grok Build** erscheint, sobald er hinzugefügt ist (siehe [Claude Code, Codex und Grok Build anmelden](#sign-claude-code-codex-and-grok-build-in)). Dort kannst du auch weitere Grok-Konten hinzufügen.

### Einen eigenen Agenten hinzufügen

Jedes Programm, das ACP spricht, kann hier laufen.

1. Klicke auf **Eigenen Agenten hinzufügen**, neben dem Titel von **Deine Agenten**.
2. Fülle aus:
   - **Name**: wie er in den Listen angezeigt wird, zum Beispiel „Gemini CLI“.
   - **Befehl**: das Programm, das gestartet werden soll, zum Beispiel `gemini`, oder ein vollständiger Pfad.
   - **Argumente**: was es im ACP-Modus startet, zum Beispiel `--experimental-acp`.
   - **Umgebung (optional, NAME=value pro Zeile)**: Einstellungen, die das Programm braucht, etwa eine Variable für einen API-Key.
3. Klicke auf **Speichern**.

Der Befehl muss den Agent im ACP-Modus starten, wobei er über seine Standardeingabe und -ausgabe kommuniziert.

### Agenten, die du in ihrem eigenen Programm einrichtest

Einige Agenten in der Liste sind Programme, die du selbst einrichtest, und einiges unterscheidet sich von denen, die die App für dich installiert:

- Ihre Zeile unter **Weitere Agenten** zeigt den Befehl oder die Adresse, mit der du sie installierst. Die App führt kein Skript aus dem Web für dich aus: Installiere ihn selbst, im [Terminal](/terminal) oder so, wie die Zeile es sagt.
- Melde dich einmal im eigenen Programm des Agents an, ebenfalls im Terminal (führe zum Beispiel seinen Befehl aus und folge seiner Anmeldung, oder wähle dort sein Modell). Von da an startet die App ihn. Er behält seine eigenen Sitzungen und sein eigenes Memory in seinem eigenen Ordner, und seine Genehmigungskarten sind die, die er anbietet.
- Einer von ihnen verbindet sich mit einem eigenen Gateway: Richte es zuerst mit dem eigenen Einrichtungsbefehl des Agents ein und lass das Gateway laufen.
- Wenn ein Agent selbst kein ACP spricht, braucht er einen ACP-Adapter. Die App installiert den Adapter zusammen mit dem Agent, beide mit npm in ihrem eigenen Ordner, ohne ihre Installationsskripte auszuführen. Ein Agent, den du selbst installiert hast, wird verwendet, wenn er im PATH liegt.
- Ein Agent, der keine MCP-Server annimmt, arbeitet nur mit seinen eigenen Tools: Die Tools der App (Seiten, Suche …) erreichen ihn nicht, und die Sitzung sagt das beim Start. Die Richtlinien der App, Memory-Notizen und Skills bekommt er trotzdem mit der ersten Nachricht.

### Was ACP-Agenten hier können und was nicht

Die App öffnet eine Sitzung in dem Ordner, den du wählst, zeigt die Nachrichten und Schritte des Agents und fragt dich, wann immer der Agent um Erlaubnis bittet. Einiges funktioniert anders als bei Claude Code und Codex:

- Er nimmt jeweils eine Nachricht auf einmal an. Eine Nachricht, die du sendest, während er arbeitet, wartet in der Warteschlange über dem Nachrichtenfeld und wird abgeschickt, wenn der Durchgang endet. (Custom funktioniert ebenso.)
- Ein Agent, der frühere Sitzungen nicht erneut öffnen kann, beginnt neu, wenn du eine alte fortsetzt, ohne die Unterhaltung davor. Die Sitzung sagt das. Dasselbe passiert, wenn ein Agent eine Sitzung früher öffnen konnte, es aber nicht mehr kann: Er macht mit einem Hinweis neu weiter, statt zu scheitern.
- Bilder, die du anhängst, erreichen ihn nur, wenn er Bilder akzeptiert.
- Forks und Übergaben sind nicht verfügbar (Custom hat Forks). Ziele gibt es: Die eigene Schleife der App steuert sie für jeden Agent.
- Die Tools der App (Seiten, Suche, Memory …) erreichen einen Agent als MCP-Server: über eine Adresse, wenn der Agent das akzeptiert, sonst über ein kleines Programm, das die App für ihn startet. Ein Agent, der keines von beidem annimmt, arbeitet nur mit seinen eigenen Tools, bekommt aber trotzdem die Richtlinien, Memory-Notizen und Skills.

## Woher die Modelle von Custom kommen

Custom führt die Modelle deiner Claude- und ChatGPT-Pläne, Modelle auf diesem Computer und Modelle in der Cloud aus, mit denselben Tools, Skills und MCP-Servern wie die anderen Agenten. Wähle auf der Startseite Custom und dann das Modell. Sie kommen aus drei Quellen:

- **Deine Abos**: die Modelle deiner Claude- und ChatGPT-Pläne, über die Anmeldungen von Claude Code und Codex auf diesem Computer. Du musst nichts einrichten: Wenn Claude Code angemeldet ist, bietet das Menü **Modell** von Custom Claude Opus, Fable, Sonnet und Haiku an (jeweils immer das neueste), und wenn Codex mit ChatGPT angemeldet ist, bietet es die Modelle an, die dein ChatGPT-Plan auflistet (zum Beispiel GPT-6 Luna). Ein Programm, das abgemeldet vorgefunden wird, verschwindet mit seinen Modellen aus dem Menü, bis du es wieder anmeldest, und Codex, das mit einem API-Key statt mit ChatGPT angemeldet ist, stellt keine zur Verfügung. Sie verbrauchen die Nutzung deines Plans, keinen API-Key und kein Geld pro Token, deshalb zeigt eine Custom-Sitzung mit ihnen für diese Schritte 0 $ an. Jedes Konto des Programms wird der Reihe nach ausprobiert, wie bei anderer Einzelarbeit: Ein Konto, das sein Nutzungslimit erreicht hat oder abgemeldet ist, gibt den Schritt an dein nächstes Konto weiter (wenn **Bei erreichtem Limit das Konto wechseln** aktiviert ist). Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) nutzt sie nie, weil sie auf den Servern von Anthropic oder OpenAI laufen. Wie sie antworten, steht unter [Custom](/guide/custom#what-custom-is-and-when-to-use-it).
- **Auf diesem Computer**: hier installierte Modelle (Ollama, vLLM) und Endpunkte in deinem Netzwerk.
- **In der Cloud**: OpenRouter, Endpunkte an anderen Orten und die Cloud-Modelle von Ollama.

Du kannst sie überall auswählen, wo Modelle von Custom auswählbar sind: auf der Startseite, im Modellmenü einer Sitzung, bei den Leistungsstufen von Custom, beim Hilfsmodell und beim Modell eines Agenten oder einer App.

[Einstellungen → Agenten → Modelle](/settings?s=models) enthält alles, was die Modelle von Custom brauchen. Die Seite hat sieben Bereiche, von oben nach unten:

- **Hilfsmodell**: das Modell für die kleinen Aufgaben der App.
- **Leistungsstufen**: ein Modell für jede Art von Aufgabe (siehe [Leistungsstufen: ein Modell für jede Art von Aufgabe](#tiers-a-model-for-each-kind-of-job)).
- **Deine Abos**: eine Zeile für Claude Code und eine für Codex, mit den Modellen, die sie Custom zur Verfügung stellen. Eine Zeile sagt „Abgemeldet: Melde dich erneut an, um diese Modelle zu nutzen“ mit einem Link zu **Konten**, oder „Nicht auf diesem Computer installiert“.
- **Auf diesem Computer**: was dieser Computer hat, und die hier installierten Modelle.
- **Modell von Hugging Face hinzufügen**: offene Modelle suchen, überprüfen und installieren.
- **OpenRouter**: Hunderte Modelle über einen Key, in drei Gruppen: dein Key, die Modelle, die du hinzugefügt hast, und eine Suche, um weitere hinzuzufügen.
- **Modelllaufzeitumgebungen und Endpunkte**: Ollama, vLLM, andere OpenAI-kompatible Server und ein Hugging-Face-Token.

Im Menü **Modell** von Custom sind die Modelle unter **Deine Abos**, **Auf diesem Computer** und **In der Cloud** gruppiert, und jede Zeile sagt, worüber sie läuft: „Claude Code“, „Codex“, „OpenRouter“, „Ollama“, „vLLM“ oder der Name eines Endpunkts. Fahre mit der Maus über ein Modell, um zu sehen, wo es läuft und wie viel es auf einmal liest, zum Beispiel „OpenRouter · 128K context“ oder „vLLM, on this machine · 32K context · starts when used“. Die Listen aktualisieren sich jede Minute von selbst.

## Das Hilfsmodell wählen

Das Hilfsmodell erledigt kleine Aufgaben neben deinen Sitzungen, außerhalb jeder Unterhaltung:

- jede neue Sitzung anhand deiner Anfrage benennen (ihr Titel in der Seitenleiste);
- Schritte im Auto-Modus von Custom überprüfen und die Prüfungen eines Ziels beurteilen, die ein Prüfer als wahr befinden muss (ein Prüfer ist ein Modell, das an der Arbeit nicht beteiligt war, und in einer vertraulichen Sitzung ist es ein Modell auf diesem Computer);
- etwa einmal am Tag das Memory aufräumen, aus den Unterhaltungen seitdem lernen und Notizen für den Index betiteln, mit dem Agenten starten;
- eine Frage zu einer Webseite beantworten, die der Browser geöffnet hat;
- die Filter (Websites, Daten, Arten von Seiten, Sprachen) herauslesen, die die Wörter einer Websuche festlegen, bevor Naget Search sucht (siehe [Wie Agenten im Web suchen](/guide/web#how-agents-search-the-web));
- Bilder für ein Custom-Modell beschreiben, das sie nicht sehen kann;
- eine lange Antwort eines Hydor-Subagents zusammenfassen;
- aus einer Sitzung eine App oder eine Geplante Aufgabe entwerfen;
- den freihändigen Sprachmodus.

Öffne [Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model) und klicke auf das Menü **Modell** in der Gruppe **Hilfsmodell** (sein (i) listet die kleinen Aufgaben auf):

- **Automatisch** (die Voreinstellung): Claude Haiku über Claude Code oder Codex, wenn Claude Code nicht antworten kann. Ein Konto, das sein Nutzungslimit erreicht hat, gibt die Frage zuerst an dein nächstes angemeldetes Konto weiter (wenn **Bei erreichtem Limit das Konto wechseln** aktiviert ist), und ein abgemeldetes Konto wird übergangen. Wenn keines der beiden Programme antworten kann, erledigt eines deiner Custom-Modelle die Aufgabe (das, das die Stufe **Schnell** von Custom nennt, sonst das günstigste, das du hinzugefügt hast; die Modelle deiner Pläne werden hier übersprungen, da sie über dieselben beiden Programme laufen), und nur wenn nichts es erledigen konnte, bittet dich eine Karte, dich anzumelden (siehe [Wenn ein Konto abgemeldet ist](#when-an-account-is-signed-out)). Wenn nichts antwortet, nennt der Fehler für jedes den Grund: „You've hit your weekly limit“, ein Modell, das dein Codex-Plan nicht anbietet …
- Jedes der Modelle von Custom, gruppiert wie im Menü **Modell** von Custom (**Deine Abos**, **Auf diesem Computer** und **In der Cloud**), mit dem, worüber es läuft (Claude Code, Codex, OpenRouter, Ollama, vLLM oder der Name eines Endpunkts), und „sees images“ bei denen, die Bilder sehen können. Auch ein Modell deines Claude- oder ChatGPT-Plans kann das Hilfsmodell sein: Es antwortet über Claude Code oder Codex mit der Nutzung deines Plans.

Automatisch kann keine Bilder ansehen. Wenn du Custom mit einem Modell nutzt, das keine Bilder verarbeitet, wähle ein Hilfsmodell, das Bilder verarbeitet, sonst kann Custom deine Bilder nicht beschreiben lassen.

## Sehen, was dieser Computer ausführen kann

Der Bereich **Auf diesem Computer** in [Einstellungen → Agenten → Modelle](/settings?s=models&find=On%20this%20machine) beginnt mit einer Zusammenfassung dieses Computers:

- **Grafik**: die Grafikkarten (GPUs) und ihr Speicher; bei einem Mac mit Apple Silicon sein Chip („Apple M3 Max“, dessen Grafik sich den Speicher mit dem Computer teilt); oder „No GPU“ (Modelle laufen dann auf dem Prozessor).
- **Arbeitsspeicher und Speicherplatz**: der Arbeitsspeicher des Computers, gesamt und frei, und der freie Speicherplatz auf der Festplatte mit dem, was die installierten Modelle belegen.
- **Läuft mit**: ob **Ollama** und **vLLM** installiert sind, mit ihren Versionen, oder ein Link zur Installation.
- Bei einer Grafikkarte, wie groß ein Modell sein darf: „Fits about 30B parameters at 4-bit on one GPU“ (bei einem Mac: „Fits about 40B parameters at 4-bit“). Parameter sind ein Maß für die Größe eines Modells; 4-Bit ist eine verbreitete komprimierte Form, die etwa ein Viertel des Speichers braucht.

Darunter:

- **Downloads in progress**, jeweils mit einem Fortschrittsbalken, wie viel schon fertig ist und ob er für Ollama oder vLLM ist. **Abbrechen** stoppt einen. Ein fehlgeschlagener oder abgebrochener zeigt den Grund, mit **Schließen**.
- **Installed models** (die ersten paar, dann **Alle anzeigen**), jeweils mit ihrer Laufzeitumgebung (Ollama oder vLLM), Größe, Details (etwa Größe und Komprimierung bei Ollama-Modellen), „sees images“, wo es zutrifft, und ob es läuft.
  - Ein vLLM-Modell hat **Starten** und **Stoppen**. Es startet von selbst, wenn eine Sitzung es zum ersten Mal nutzt (der erste Start dauert ein oder zwei Minuten), auf der Grafikkarte mit dem meisten freien Speicher (mit 8-Bit, wenn es dort sonst nicht passen würde), oder verteilt auf 2, 4 oder 8 davon, wenn keine einzelne Karte Platz dafür hat („running on GPUs 1, 2“); auf einem Mac auf seinem Apple Silicon. Es läuft weiter, auch wenn die App neu startet, bis du auf **Stoppen** klickst. Wenn es nicht starten kann, steht der Grund darunter.
  - **Entfernen** im Menü **⋯** des Modells löscht die Dateien des Modells von diesem Computer, nachdem du bestätigt hast. Du kannst es später wieder installieren.

Wenn es noch keine gibt: „No models here yet: add one from Hugging Face below.“

## Modell von Hugging Face hinzufügen

Hugging Face ist die wichtigste Website für offene Modelle. Die Gruppe [Modell von Hugging Face hinzufügen](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) (für diesen Computer vorgeschlagen oder die gesamte Seite durchsuchen) schlägt einige vor, durchsucht sie und sagt dir, bevor etwas heruntergeladen wird, wie jedes Modell auf diesem Computer laufen würde.

### Für diesen Computer vorgeschlagen

Bevor du suchst, listet die Gruppe die Modelle auf, die die App empfiehlt und die auf diesem Computer laufen, je nachdem, was er hat:

- **LFM3-VL 2B** (Liquid AI): klein und schnell, und es liest Bilder. Läuft auf fast jedem Computer.
- **Gemma 4 12B** (Google): ein fähiger Allrounder, der Bilder liest, für einen Computer mit guter Grafikkarte.
- **Flint** (Recursive): für Coding-Agenten gemacht, für einen Mac mit Apple Silicon und 32 GB oder mehr.
- **GLM-5.3 Flash** (Z.ai): eines der stärksten offenen Modelle, für einen Server mit mehreren großen Grafikkarten.

Jedes zeigt, ob es hier gut oder langsam läuft, wie es laufen würde („vLLM at 8-bit, on GPU 0“, „vLLM, split across 2 GPUs“, „vLLM, on Apple silicon“), seine Download-Größe und **Installieren**. **Hier am besten geeignet** markiert das stärkste, das gut läuft. Sie laufen standardmäßig mit vLLM; ein Computer weder mit NVIDIA-Grafikkarte noch mit Apple Silicon bekommt stattdessen die Ollama-Version des kleinen. Eine Warnung folgt, wenn das, was sie ausführt, noch nicht eingerichtet ist („vLLM is not set up“, „Ollama is not running“): siehe [Ollama, vLLM oder einen anderen Endpunkt verbinden](#connect-ollama-vllm-or-another-endpoint). Die Zeile **2 more for bigger computers** (oder wie viele es sind) zeigt die anderen, mit dem, was jedes braucht. Die Willkommenstour schlägt dieselben vor.

### Suchen und filtern

1. Tippe in **Hugging Face durchsuchen oder org/name einfügen**: einen Namen wie `qwen3`, den vollständigen Namen eines Modells (`org/name`) oder seine huggingface.co-Adresse. Bevor du tippst, schlägt es einige Namen vor, oder **Am häufigsten heruntergeladene ansehen**.
2. Grenze die Liste mit den Filtern ein (du kannst sie kombinieren):
   - **Läuft hier gut**: nur Modelle, die auf diesem Computer gut laufen würden.
   - **GGUF · Ollama**: Modelle in der GGUF-Form, die Ollama ausführt.
   - **vLLM**: Modelle in der Safetensors-Form, die vLLM auf einer Grafikkarte ausführt.
   - **Verarbeitet Bilder**: Modelle, die auch Bilder lesen.
3. Ändere die Reihenfolge mit dem Menü rechts: **Am häufigsten heruntergeladen**, **Im Trend**, **Am häufigsten positiv bewertet** oder **Neueste**.

Du bekommst bis zu 40 Modelle, zunächst die ersten acht und **Alle anzeigen** für den Rest. Ein Modell, das du vollständig benannt hast, steht zuerst, auch wenn die Suche es nicht auflistet, und mit der Eingabetaste wird es sofort überprüft.

Jede Zeile zeigt den Hersteller und den Namen, die Form (**GGUF** oder **vLLM**), **Bilder**, wenn es Bilder verarbeitet, **Zugriffsbeschränkt**, wenn sein Hersteller verlangt, dass du zuerst Bedingungen akzeptierst, seine Größe in Parametern, Downloads in den letzten 30 Tagen, Likes und wann es zuletzt geändert wurde.

### Die erste Einschätzung

Unter jedem Modell gibt ein farbiges Label allein anhand seiner Größe eine erste Einschätzung:

- **Runs well with vLLM** oder **Runs well with Ollama**, mit einer groben Geschwindigkeit („about 40 tokens/s“; ein Token ist ein Wortstück): Es passt in den Speicher deiner Grafikkarte.
- **Auf dem Prozessor, langsam** oder **Auf dem Prozessor sehr langsam**: Es passt nur in den Arbeitsspeicher des Computers, also läuft es auf dem Prozessor. Das kann nur Ollama.
- **Zu groß für diesen Computer**: Es passt nicht, oder der Download passt nicht auf die Festplatte.
- **At 4-bit with Ollama: runs well…**: Das Modell in der gespeicherten Form ist zu groß, aber seine komprimierte 4-Bit-Version würde mit Ollama gut laufen.

Fahre mit der Maus über das Label, um die Zahlen dahinter zu sehen.

### Vor dem Herunterladen überprüfen

Klicke bei einem Modell auf **Überprüfen**, um genau zu sehen, wie es hier laufen würde. Das Panel zeigt seine Größe, wie viel es auf einmal liest (sein Kontext), ob es Bilder verarbeitet, und dann:

- Bei einem GGUF-Modell: „Runs with Ollama“ und jede verfügbare Größe (kleinere Dateien tauschen etwas Qualität gegen Geschwindigkeit und Speicher), die kleinste zuerst. Jede Zeile gibt ihre Einschätzung, den nötigen Speicher, etwa wie schnell es laufen würde, und die Download-Größe, mit einer Schaltfläche **Installieren**. Installieren ist ausgegraut, solange Ollama hier nicht läuft, oder bei einer Größe, die zu groß ist.
- Bei einem vLLM-Modell: „Runs with vLLM, which starts it on a GPU when a session uses it“, dieselben Zahlen, Hinweise dazu, welche Grafikkarte es nutzen würde, und eine Schaltfläche **Herunterladen**. Wenn vLLM nicht installiert ist oder dein vLLM diese Art von Modell noch nicht ausführen kann, steht das dort, und wenn es eine GGUF-Version gibt, bietet es stattdessen **überprüfen** für diese an.
- Bei allem anderen: „No weights this app can run (safetensors for vLLM, GGUF for Ollama).“

Die Zahlen gehen von einer Unterhaltung von bis zu etwa 32.000 Tokens aus, der Länge, die ein Modell auf diesem Computer bekommt. **Schließen** klappt das Panel zu.

### Installieren und was dann passiert

Klicke auf **Installieren** (Ollama) oder **Herunterladen** (vLLM). Der Download erscheint unter **Auf diesem Computer** mit seinem Fortschritt. Wenn er fertig ist, erscheint das Modell im Menü **Modell** von Custom. Ein abgebrochener vLLM-Download macht dort weiter, wo er aufgehört hat, wenn du es erneut versuchst. Ein vLLM-Modell, das für keine einzelne Grafikkarte groß genug passt, wird beim Start mit 8-Bit (FP8) gespeichert, was den Speicher für seine Gewichte bei geringem Verlust halbiert (Karten ab NVIDIAs RTX-30-Serie und A100); wenn es immer noch nicht passt, wird es auf mehrere Karten verteilt, wenn sie zusammen Platz haben.

### Zugriffsbeschränkte und private Modelle

Einige Hersteller verlangen, dass du zuerst ihre Bedingungen akzeptierst; ihre Modelle zeigen **Zugriffsbeschränkt**. Akzeptiere die Bedingungen auf der Seite des Modells auf huggingface.co und füge dann ein Hugging-Face-Token hinzu (siehe [Hugging-Face-Token](#hugging-face-token)). Private Modelle brauchen ebenfalls das Token.

## Modelle über OpenRouter nutzen

OpenRouter (openrouter.ai) gibt dir mit einem einzigen Key Hunderte Modelle von vielen Herstellern, abgerechnet wird nach Nutzung.

### Key hinzufügen

1. Hole dir einen Key auf openrouter.ai (der Link im Abschnitt führt dorthin).
2. Klicke in [Einstellungen → Agents → Modelle](/settings?s=models&find=OpenRouter) in der Zeile **Dein OpenRouter-Key** auf **Key hinzufügen**, füge den Key im Dialog in **Dein OpenRouter-Key: sk-or-…** ein und klicke auf **Speichern**.

Die Zeile zeigt dann **Verbunden mit OpenRouter** mit dem Anfang und dem Ende deines Keys. **Key entfernen** im **⋯**-Menü der Zeile löscht den Key. Der Key bleibt auf dem Server und wird nie wieder angezeigt.

Du kannst ihn auch erst dann hinzufügen, wenn er gebraucht wird: Ein Agent, der ohne Key ein Bild, eine Zeichnung, ein Video oder einen Sound erzeugen will, fragt in der Unterhaltung auf einer Karte danach ([Wenn ein Agent den OpenRouter-Key braucht](/guide/documents-voice#when-an-agent-needs-the-openrouter-key)), und die KI-Tools der Editoren fragen in ihrem Dialog. In beiden Fällen wird der Key hier gespeichert.

### Vorgeschlagene Modelle

Vor der Suche listet **Vorgeschlagen** in der Gruppe **OpenRouter-Modelle hinzufügen** vier Modelle für Custom auf, jeweils mit Begründung: **GPT-6 Luna** (Schnell und günstig), **Grok 4.7** (Gut, mit weniger Verweigerungen), **GPT-6.1 Sol** (Besser) und **Claude Opus 5.5** (Insgesamt am besten). Mit **Hinzufügen** kommt eines davon in die Auswahllisten. Für Bilder, Musik, Stimmen und Videos sind die Auswahl der App Seedream 5.0 Pro (und Flash, schneller und günstiger), Lyria 3 Pro, Seed Audio 1.0 und Seedance 2.5: siehe [Einstellungen → Funktionen → Bilder, Video und Audio](/settings?s=images).

### Den Katalog durchsuchen

Gib in derselben Gruppe etwas in **OpenRouter durchsuchen: deepseek, qwen, claude…** ein, klicke auf einen der vorgeschlagenen Namen oder auf **Neueste ansehen**. Filter:

- **Tool-Aufrufe**: Modelle, die Tools nativ aufrufen, so wie Custom sie am besten nutzt (**Beste Übereinstimmung** zeigt diese zuerst).
- **Verarbeitet Bilder**
- **Schlussfolgern**: Modelle, die nachdenken, bevor sie antworten.
- **Kostenlos**

Das Menü rechts sortiert die Ergebnisse: **Beste Übereinstimmung** (während du nach Namen suchst), **Neueste**, **Günstigstes** oder **Größter Kontext**. Du bekommst bis zu 50 Modelle, zunächst die ersten acht und mit **Alle anzeigen** den Rest.

Jedes Modell zeigt seinen Hersteller, seinen Namen und Kennzeichnungen: **Neueste** (immer die neueste Version des Herstellers), **Neu** (in den letzten drei Wochen aufgenommen), **Kostenlos**, **Schlussfolgern**, **Bilder** und **Keine nativen Tools** (Custom beschreibt seine Tools dann in den Anweisungen und liest seine Aufrufe aus dem Text). Darunter: wie viel es auf einmal liest („128K context“), seine längste Antwort („16K out“), sein Preis pro Million Tokens für Eingabe und Ausgabe, der Monat der Aufnahme, eine kurze Beschreibung und sein OpenRouter-Name.

### Modelle zu den Auswahllisten hinzufügen

Klicke bei einem Modell auf **Hinzufügen**. Seine Zeile zeigt dann **Hinzugefügt**, und das Modell erscheint in der Gruppe **Deine OpenRouter-Modelle** („In den Modell-Auswahllisten“) oberhalb der Suche und im **Modell**-Menü von Custom. Klicke bei einem davon auf das ×, um es aus den Menüs zu entfernen. Solange du kein Modell hinzugefügt hast, bietet OpenRouter keine Modelle an („Füge mindestens ein Modell hinzu, um OpenRouter zu nutzen.“).

## Ollama, vLLM oder einen anderen Endpunkt verbinden

Die Gruppe **Modelllaufzeitumgebungen und Endpunkte** verbindet die Programme, die Modelle ausführen. Du öffnest sie unter [Einstellungen → Agents → Modelle](/settings?s=models&find=Runtimes%20and%20endpoints).

### Ollama

Ollama ist ein kostenloses Programm, das Modelle auf deinem Computer ausführt, auf der Grafikkarte oder dem Prozessor. Seine Zeile zeigt „läuft“ mit der Version oder „läuft nicht unter dieser Adresse“ mit einem Link **Ollama installieren**. Die Adresse lautet `http://127.0.0.1:11434`, solange du sie nicht änderst: Gib im Feld eine andere ein, dann erscheint daneben **Speichern**. Jedes Modell in diesem Ollama erscheint in der Modellliste von Custom, auch solche, die du außerhalb der App heruntergeladen hast.

### vLLM

vLLM ist ein schneller Server für Modelle auf NVIDIA-Grafikkarten und die Art, wie Modelle von Hugging Face hier standardmäßig laufen. Ein Modell, das für eine Karte zu groß ist, läuft darauf mit 8 Bit oder verteilt auf 2, 4 oder 8 Karten. Auf einem Mac läuft vLLM auf Apple Silicon mit seinem Metal-Plugin (vllm-metal). Die App findet es selbstständig im PATH oder in einer conda- oder venv-Umgebung und zeigt seine Version und seinen Ort an. Wenn dort „nicht gefunden (pip install vllm) oder gib den Befehl an“ steht, installiere es oder gib den vollständigen Pfad seines `vllm`-Befehls im Feld ein und klicke auf **Speichern** (erscheint, sobald du etwas eingibst). Lass das Feld leer, damit die App selbst sucht.

### Andere OpenAI-kompatible Endpunkte

Viele Programme und Dienste antworten so wie die API von OpenAI: LM Studio, der Server von llama.cpp, andere Anbieter. So fügst du einen hinzu:

1. Klicke neben dem Titel der Gruppe auf **Endpunkt hinzufügen**.
2. Gib im Dialog einen **Name**n, seine Adresse (etwa `http://localhost:1234/v1`) und einen **Key (optional)** ein.
3. Klicke auf **Hinzufügen**.

Der Endpunkt erscheint als Zeile mit seiner Adresse und der Anzahl der Modelle, die er anbietet. Seine Modelle erscheinen in der Liste von Custom als „Modell (Name)“. Mit dem × entfernst du ihn. Wenn du einen weiteren Endpunkt mit demselben Namen hinzufügst, ersetzt er den ersten.

Klicke unter der Zeile auf **Funktionen der Modelle festlegen**, um seine Modelle zu sehen, jeweils mit zwei Auswahlmöglichkeiten: **Verarbeitet Bilder** und **Denkaufwand**. Jede steht auf **Automatisch**, **Ja** oder **Nein**. Ein Modell, das Bilder verarbeitet, bekommt Screenshots und Bilder als Bilder, ein Modell, das das nicht kann, bekommt eine Beschreibung davon (siehe [Bilder für Modelle, die nicht sehen](/guide/custom#images-for-models-that-dont-see)). Ein Modell, das schlussfolgert, bietet im Menü **Aufwand** Niedrig, Mittel und Hoch an, und Custom sendet die gewählte Stufe als `reasoning_effort`, die Einstellung, die OpenAI-kompatible Server annehmen (solange **Standard** gewählt ist, wird nichts gesendet). **Automatisch** folgt dem, was der Endpunkt über das Modell angibt, und das Menü zeigt, was das ist: Server, die ihre Modelle beschreiben (im Stil von OpenRouter, Mistral und andere), geben es mit ihrer Modellliste an, und bei einem LiteLLM-Gateway fragt Hydor zusätzlich dessen Modellinformationen ab, mit demselben Key. Ein Endpunkt, der nichts angibt, zählt als Nein: Stelle für die Modelle, von denen du weißt, dass sie Bilder verarbeiten oder schlussfolgern, **Ja** ein. Was du festlegst, bleibt erhalten, wenn du den Endpunkt erneut hinzufügst.

Eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential) darf einen Endpunkt nutzen, dessen Adresse dieser Computer oder dein privates Netzwerk ist: `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` bis `172.31.…` oder ein Name, der auf `.local` endet. Jede andere Adresse zählt als online, auch eine, die zu deinem eigenen Server führt: Nutze stattdessen dessen private Adresse. Dasselbe gilt für die Adresse von Ollama, und die Cloud-Modelle von Ollama (ihre Namen enden auf „cloud“) zählen immer als online.

### Hugging-Face-Token

Mit einem [Hugging-Face-Token](/settings?s=models&find=Hugging%20Face%20token) kann die App geschützte oder private Modelle herunterladen (die Zeile sagt „Nur für geschützte oder private Modelle“). Erstelle einen in den Einstellungen deines Hugging-Face-Kontos, klicke auf **Token hinzufügen**, füge ihn im Dialog ein (er beginnt mit `hf_`) und klicke auf **Speichern**. Die Zeile zeigt dann seinen Anfang und sein Ende, mit **Token entfernen** in ihrem **⋯**-Menü.

## Einen Agent fragen

- „Welche Agent-Programme sind hier installiert? Installiere Gemini CLI.“
- „Sind Claude Code und Codex auf dem neuesten Stand? Aktualisiere sie jetzt.“
- „Füge OpenCode zu meinen Agents hinzu.“
- „Füge Grok Build zu meinen Agents hinzu und melde es mit meinem Grok-Abonnement an.“
- „Füge ein zweites Grok-Konto für die Arbeit hinzu und starte meine nächste Sitzung damit.“
- „Starte meine nächste Grok-Sitzung mit Aufwand xhigh.“
- „Wie viel von meinem Grok-Tarif ist diese Woche noch übrig?“
- „Nutze alle meine Grok-Konten: Wenn eines sein Limit erreicht, mach mit einem anderen weiter.“
- „Füge Gemini CLI und Goose zu meinen Agents hinzu und sag mir, was ich noch installieren muss.“
- „Finde auf Hugging Face ein Modell, das auf diesem Computer gut läuft und Bilder verarbeitet, prüfe es und installiere die beste Größe.“
- „Füge das neueste DeepSeek-Modell von OpenRouter zu meinen Modellen hinzu.“ (sobald dein OpenRouter-Key eingerichtet ist)
- „Mach das Hilfsmodell zu einem Modell, das Bilder verarbeitet.“
- „Nutze das Sonnet aus meinem Claude-Tarif in einer Custom-Sitzung und zeig mir, was es kostet.“
- „Stoppe das laufende vLLM-Modell, um die Grafikkarte freizugeben.“
- „Nutze alle meine Claude-Konten: Wenn eines sein Limit erreicht, mach mit einem anderen weiter.“
- „Wenn alle meine Claude-Konten aufgebraucht sind, mach mit meinem API-Guthaben weiter.“
- „Welches Modell nutzt jede Leistungsstufe bei Claude Code und Codex? Lass Max bei Claude Code für Opus stehen.“
- „Welche Modelle nutzen die Leistungsstufen von Custom, und warum ist Am besten leer?“
- „Warum bittet mich Hydor, mich bei Claude Code erneut anzumelden?“
- „Mein Claude-Code-Konto ist abgemeldet: Welche meiner Sitzungen warten darauf, und können sie mit einem anderen Konto weitermachen?“
