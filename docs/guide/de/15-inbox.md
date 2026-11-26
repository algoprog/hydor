# Posteingang und Benachrichtigungen

Agenten arbeiten selbstständig, aber hin und wieder brauchen sie dich: eine Genehmigung, eine Antwort, ein Formular, einen Key oder dein OK, bevor etwas rausgeht. Dieses Thema behandelt den Posteingang, der alles sammelt, was auf dich wartet, aus jeder Sitzung und von jedem Computer, damit du es an einer Stelle beantworten kannst, seinen Postausgang mit Aufrufen, die auf deine Freigabe warten, und die Benachrichtigungen, die dir sagen, wann eine Sitzung fertig ist, fehlschlägt oder dich braucht, in der App, auf deinem Computer oder auf einem Handy bei geschlossener App.

![Der Posteingang: was auf dich wartet, aus jeder Sitzung](images/inbox.webp)

## Den Posteingang öffnen

Der Posteingang ist die Kachel **Posteingang** in der Leiste, mit dem Ablagefach-Symbol, direkt unter **Experimente** und mit **Suchen** darunter (sie bleiben dort, wenn du die anderen Kacheln verschiebst). Eine Zahl an der Ecke zeigt, wie viele Dinge auf dich warten. Auf einem Handy öffnest du zuerst die Seitenleiste mit **Menü** (≡): Die Schaltfläche befindet sich oben im Drawer. Du kannst auch „Posteingang“ in das Suchfeld eingeben (Ctrl+K, ⌘K auf dem Mac). [Posteingang öffnen](/inbox).

Die Kopfzeile sagt, wie viele Dinge auf dich warten („3 warten auf dich“). Die neuesten stehen oben. Die Liste aktualisiert sich von selbst, wenn Sitzungen anfangen oder aufhören zu warten, und prüft alle paar Sekunden erneut, solange du sie ansiehst.

Wenn nichts wartet, steht dort „Nichts wartet auf dich“.

Auch die Startseite zeigt, was auf dich wartet, zuerst unter **Während du weg warst** unter dem Nachrichtenfeld, mit dem, was fertig wurde und was seit deinem letzten Besuch von selbst lief (siehe [Während du weg warst](/guide/start#while-you-were-away)).

## Was im Posteingang erscheint

Alles, worauf ein Agent von dir wartet, aus jeder Sitzung auf diesem Computer, einschließlich der Sitzungen, die Geplante Aufgaben und Apps starten, und von deinen anderen Computern:

- **Genehmigungen**: ein Befehl, den der Agent ausführen will, eine Datei, die er ändern will, ein Tool, das er verwenden will.
- **Fragen**, die der Agent dir stellt, und **Pläne**, die auf deine Genehmigung warten.
- **Formulare**, die ein Dienst dich mittendrin ausfüllen lässt („Notion bittet dich, ein Formular auszufüllen“), oder eine Seite, die du öffnen sollst.
- **Ein Browser, der dich braucht**: „Braucht dich im Browser: …“ (zum Anmelden oder um eine Prüfung zu bestehen), „Vor dem Bezahlen oder Bestellen angehalten: …“ oder „Will … öffnen, auf diesem Computer oder in seinem Netzwerk“.
- **Ein Key, den ein Agent angefordert hat**: „Fragt nach einem Key: OPENWEATHER_KEY“, mit der Begründung, wofür er ihn braucht.
- **Ein Skill, den ein Agent vorschlägt**: „Schlägt einen neuen Skill vor: …“ oder „Schlägt eine Änderung am Skill … vor“, mit der Begründung.
- **Eine Sitzung, die woanders auf dich wartet**: „Wartet in VS Code auf dich“ (oder in einem Terminal), für Sitzungen, die außerhalb der App laufen.
- **Die Frage einer App**: ein Lauf einer deiner Apps, der bei einem Schritt **Person fragen** wartet.
- **Ein Kommentar von jemandem, mit dem du ein Projekt oder etwas anderes geteilt hast**: „Maria hat „Abschlussarbeit, Kapitel 3“ kommentiert“, mit dem, was sie geschrieben hat, bis du oder ein Agent antwortet oder er erledigt ist. **Öffnen** öffnet das Dokument, das Bild, das Video oder den Ton.
- **Im Postausgang gehaltene Aufrufe**: Ein Agent hat ein Tool eines verbundenen Kontos aufgerufen, das du auf „Vorher fragen“ gestellt hast, etwa eines, das eine E-Mail sendet. Sie stehen ganz oben, unter **Postausgang**.

Jeder Eintrag zeigt, in welcher Sitzung er wartet (mit dem Symbol des Agenten) und wie lange schon.

## Genehmigungen, Fragen und Formulare direkt im Posteingang beantworten

Genehmigungen, Fragen und Formulare erscheinen als dieselbe Karte, die du auch in der Sitzung siehst, sodass du sie beantworten kannst, ohne die Sitzung zu öffnen. Über jeder Karte steht der Name der Sitzung; mit einem Klick darauf öffnest du die Sitzung. Die oberste Zeile der Karte sagt, was gefragt wird und wie lange es schon wartet.

- **Eine Genehmigung** zeigt, was der Agent tun will: den Befehl, die Änderung an einer Datei (als Diff) oder die Eingabe des Tools. Klicke auf eine der Schaltflächen: **Erlauben**, eine „Immer“-Auswahl, wenn der Agent eine anbietet (etwa **Alle Änderungen in dieser Sitzung erlauben** oder **Für diese Sitzung erlauben**), oder **Ablehnen**. Ein Klick auf **Ablehnen…** öffnet zuerst ein Feld, „Optional: Sag dem Agenten, was er stattdessen tun soll“; schreibe dem Agenten gern ein paar Worte und klicke dann auf **Ablehnen**.
- **Ein Plan** (von Claude Code) zeigt den Plan mit **Änderungen genehmigen und automatisch akzeptieren**, **Genehmigen, vor Änderungen fragen** und **Weiter planen**.
- **Eine Frage** zeigt ihre Auswahlmöglichkeiten: Wähle eine aus (oder mehrere, wo erlaubt) oder gib unter **Andere – eigene Antwort eingeben** deine eigene ein; du kannst einer Antwort eine Datei anhängen. Klicke dann auf **Antworten senden** oder auf **Überspringen**.
- **Ein Formular von einem Dienst** zeigt die Nachricht des Dienstes und seine Felder. Fülle sie aus und klicke auf **Senden**, auf **Ablehnen** oder auf **Nicht jetzt**. Ein Formular ohne etwas zum Ausfüllen fragt stattdessen **Erlauben** statt **Senden**. Wenn der Dienst dich bittet, eine Seite zu öffnen, öffnet **Öffnen** sie in einem neuen Tab.

Sobald du geantwortet hast, verschwindet der Eintrag aus dem Posteingang und der Agent macht weiter. Was jede Auswahl bedeutet, steht in [Genehmigen oder Ablehnen, was der Agent tun will](/guide/sessions#approve-or-deny-what-the-agent-wants-to-do) und [Fragen beantworten und Pläne genehmigen](/guide/sessions#answer-questions-and-approve-plans).

## Der Postausgang: Aufrufe, die auf deine Freigabe warten

Wenn ein Agent ein Tool eines verbundenen Kontos aufruft, das du auf **Vorher fragen** gestellt hast ([Verbundene Apps, Keys und Tools](/guide/connections#ask-first-calls-that-wait-for-your-ok)), wird der Aufruf nicht ausgeführt. Er wartet ganz oben im Posteingang, unter **Postausgang**, eine Karte pro Aufruf, bis du ihn sendest oder verwirfst. Der Agent hat nicht auf dich gewartet: Ihm wurde sofort gesagt, dass der Aufruf auf dein OK wartet.

Jede Karte zeigt:

- das Konto und das Tool („Gmail · send_email“) und wie lange es schon wartet;
- **Wartet auf deine Freigabe**, das Symbol des Agenten und die Sitzung, aus der der Aufruf kam (klicke auf den Namen der Sitzung, um sie zu öffnen), sowie die Geplante Aufgabe, wenn der Lauf einer Aufgabe den Aufruf ausgelöst hat;
- was das Tool tut, in den Worten des Dienstes;
- den Aufruf als Formular, das du ändern kannst. Eine E-Mail zeigt **An**, **Cc**, **Betreff** und **Body**; eine Chat-Nachricht, wohin sie geht, und ihren **Text**; ein Beitrag seinen **Text**. Andere Tools zeigen ihre eigenen Felder, mit einem roten * bei denen, die das Tool braucht. Mehrere Adressen kommen durch Kommas getrennt in ein Feld.

Dann:

- **Senden** führt den Aufruf mit dem aus, was das Formular jetzt enthält. Hydor führt ihn selbst aus, auch wenn der Agent längst fertig ist. Die Karte verschwindet aus dem Posteingang und ein Hinweis sagt, dass er gesendet wurde.
- **Verwerfen** wirft den Aufruf weg: Er wird nie ausgeführt.
- **Alle senden**, über den Karten einer Sitzung, wenn sie mehr als eine enthält, sendet alle unverändert, in der Reihenfolge, in der sie zurückgehalten wurden.

Wenn der Dienst mit einem Fehler antwortet, bleibt die Karte bestehen, mit **Der Versand schlug fehl:** und dem Grund sowie **Erneut senden**. Zurückgehaltene Aufrufe bleiben über Neustarts hinweg erhalten und werden 30 Tage aufbewahrt.

In der Sitzung markiert eine Zeile, wo der Aufruf zurückgehalten wurde: **Wartet im Postausgang auf deine Freigabe**, mit **Postausgang öffnen**. Sobald du entschieden hast, steht dort **Mit deiner Freigabe gesendet**, mit dem Anfang der Antwort des Dienstes, oder **Verworfen: nicht gesendet**. Wenn du der Sitzung wieder schreibst, erfährt ihr Agent, was aus seinen Aufrufen wurde.

Ein zurückgehaltener Aufruf benachrichtigt dich wie eine Genehmigung, in der App, auf deinem Computer und auf deinem Handy: „Wartet im Postausgang auf deine Freigabe: …“. Tippe darauf, um den Posteingang zu öffnen, wo du den Entwurf lesen, ändern und vom Handy aus senden kannst.

## Den Rest dort öffnen, wo er wartet

Die übrigen Einträge beantwortest du dort, wo sie warten. Jeder hat ein Symbol, was gefragt wird, eine Detailzeile, die Sitzung und die Zeit sowie **Öffnen**, womit du dorthin gelangst:

- **Ein Browser, der dich braucht** öffnet die Sitzung, in der sein Browser über dem Nachrichtenfeld erscheint, damit du übernehmen kannst ([Suche und der Browser](/guide/web)).
- **Ein Key** oder **eine Anmeldung** öffnet die Sitzung mit der Karte, in der du ihn eingibst ([Verbundene Apps, Keys und Tools](/guide/connections)).
- **Ein Skill-Vorschlag** öffnet die Sitzung mit seiner Karte zum Genehmigen oder Ablehnen, oder **Einstellungen → Skill-Bibliothek**, wenn diese Sitzung nicht mehr existiert ([Skills](/guide/skills)).
- **Eine Sitzung, die in VS Code oder einem Terminal wartet**, öffnet sie hier, damit du sehen kannst, worauf sie wartet; beantworte es in dem Programm, in dem sie läuft.
- **Die Frage einer App** öffnet ihren Lauf, in dem eine Karte sie stellt: **Ja** oder **Nein**, oder ihr Formular und **Antwort senden** ([Apps](/guide/apps#apps-with-steps)).

## Was auf deinen anderen Computern wartet

Wenn du weitere Computer mit Hydor hinzugefügt hast ([Andere Computer aus einer App nutzen](/guide/devices#use-other-machines-from-one-app)), fragt der Posteingang jeden, der online ist, und listet auch auf, was dort wartet. Die Liste ist dann nach Computer gruppiert, unter dem Namen des jeweiligen Computers; **jetzt angezeigt** markiert den Computer, den die App gerade zeigt. Genehmigungen, Fragen und Formulare von einem anderen Computer beantwortest du direkt hier, so wie bei diesem.

Ein Computer, der seine Liste nicht senden kann (zum Beispiel einer mit einer älteren Version), erscheint stattdessen als eine Zeile, „2 Sitzungen warten dort auf dich“, mit **Öffnen**, um zu diesem Computer zu wechseln.

## Die Zahl an der Posteingang-Schaltfläche

Eine kleine Zahl an der Ecke der Posteingang-Schaltfläche zählt die Sitzungen, die auf deine Genehmigung oder Antwort warten: auf diesem Computer und auf deinen anderen Computern, die online sind. Ab 99 zeigt sie **99+**. Wenn du mit dem Zeiger auf die Schaltfläche zeigst, liest du „Posteingang: 3 warten auf dich“.

Die Zahl zählt Sitzungen, nicht Einträge; eine Sitzung mit zwei Genehmigungen zählt also einmal. Im Postausgang gehaltene Aufrufe zählen jeweils einzeln dazu. Manche Dinge im Posteingang zählen nicht mit: ein angeforderter Key, ein Browser, der dich braucht, ein Skill, der geprüft werden soll.

## Die Zahl im Browser-Tab

Solange Sitzungen auf dem Computer, den die App zeigt, auf deine Genehmigung oder Antwort warten, beginnt der Titel des Browser-Tabs mit ihrer Anzahl: „(2) Hydor“. Du siehst sie auch aus anderen Tabs, ohne zurückzuwechseln.

## Wie dir die App Bescheid gibt

Wenn eine Sitzung fertig ist, fehlschlägt oder dich braucht, benachrichtigt dich die App so, wie es zu deiner Situation passt:

- **Die App ist im Blick**: Eine kleine Karte gleitet unten am Bildschirm ein (auf einem Computer unten rechts). Sie zeigt das Symbol des Agenten mit einem farbigen Punkt (grün bei fertig, gelb, wenn er dich braucht, rot bei Fehlschlag), den Namen der Sitzung und den Status mit dem Anfang der Antwort. Klicke darauf, um die Sitzung zu öffnen, oder auf ✕, um sie zu schließen. Sie verschwindet nach ein paar Sekunden, bleibt aber, solange der Zeiger darauf ruht. Ein neuerer Hinweis zur selben Sitzung ersetzt die ältere Karte.
- **Die App ist in einem Tab offen, den du gerade nicht ansiehst**: eine Benachrichtigung deines Systems, sobald du **Dieses Gerät benachrichtigen** eingeschaltet hast.
- **Die App ist geschlossen** oder das Handy steckt in deiner Tasche: eine Push-Benachrichtigung, sobald du auf diesem Gerät **Dieses Gerät benachrichtigen** eingeschaltet hast.
- **Eine Desktop-App (Mac, Windows, Linux)**: die eigene Benachrichtigung deines Computers (auf dem Mac im Mitteilungszentrum), egal ob das Fenster der App im Vordergrund, hinter anderen Fenstern oder geschlossen ist (die App bleibt in der Menüleiste, im Infobereich oder im System-Tray), und auch dann, wenn die App beim Anmelden gestartet ist, ohne ihr Fenster zu öffnen. Klicke darauf, um diese Sitzung im Fenster der App zu öffnen. Eine neuere zur selben Sitzung ersetzt die ältere. Die kleinen Karten im Fenster erscheinen nur, wenn dein System die Benachrichtigungen der App nicht anzeigt. Solange das Fenster weg ist (geschlossen, ausgeblendet, minimiert oder hinter einer anderen App), zählt das Symbol der App außerdem die Sitzungen mit neuen Hinweisen, jede einmal: eine Zahl auf dem Dock-Symbol auf dem Mac, auf der Taskleisten-Schaltfläche unter Windows (solange das Fenster offen ist; ist es in den Infobereich geschlossen, gibt es keine Taskleisten-Schaltfläche) und im Launcher auf Linux-Desktops, die Zähler anzeigen (etwa das Dock von Ubuntu und KDE). Sie erscheint auch bei eingeschaltetem „Nicht stören“ oder einem Fokus und verschwindet, sobald du das Fenster in den Vordergrund holst. Auf dem Mac erscheint sie, solange Hydor sein Symbol mit einem Zähler versehen darf: **Systemeinstellungen → Mitteilungen → Hydor → Mitteilungssymbol auf App-Symbol** (standardmäßig an, sobald du die Benachrichtigungen von Hydor erlaubst).

Zu der Sitzung, die du gerade ansiehst, bekommst du keinen Hinweis. Eine Sitzung ist erst dann fertig, wenn nichts mehr läuft, was sie gestartet hat: Solange ihre Hintergrundaufgaben (ein Befehl wie ein Dev-Server, ein Monitor) oder ihre Subagenten noch arbeiten, wartet der Hinweis und kommt, sobald sie enden. Eine zurückgestellte Sitzung, die dich braucht, kommt sofort aus der Zurückstellung zurück. Im freihändigen Modus sagt die App außerdem laut, wenn die Sitzung, der sie folgt, fertig ist oder dich braucht ([Dokumente, Bilder, Videos und Sprache](/guide/documents-voice)).

## Was jede Benachrichtigung sagt

Der Titel einer Benachrichtigung ist der Name der Sitzung (gekürzt, wenn er lang ist). Der Text sagt, was passiert ist:

- **Abgeschlossen**, danach der Anfang der letzten Antwort des Agents. Sie kommt nach einem Durchgang, der mindestens zehn Sekunden gedauert hat, damit ein kurzes Hin und Her still bleibt.
- Wenn die Sitzung dich braucht, was sie braucht:
  - bei einer einfachen Ja-oder-Nein-Genehmigung, was der Agent tun will, mit seiner ersten Zeile („Befehl ausführen: npm test“);
  - sonst „Braucht deine Genehmigung“ oder „Hat eine Frage an dich“;
  - bei ihrem Browser, was der Browser braucht: „Braucht dich im Browser: …“, „Vor dem Bezahlen angehalten: …“, „Bittet darum, … zu öffnen“ oder „Die Seite fragt: …“;
  - bei einer Sitzung in VS Code oder in einem Terminal „Wartet in VS Code auf dich“, nur gesendet, wenn sie eine Minute später immer noch wartet (du sitzt wahrscheinlich direkt davor);
  - bei einem Aufruf, der im Postausgang festgehalten wird, „Wartet im Postausgang auf dein OK:“, das Konto und das Tool sowie an wen er geht. Ein Tippen darauf öffnet den Posteingang.
- **Fehlgeschlagen**, danach der Fehler.

Eine Sitzung, die an einem Ziel arbeitet, sendet für alles, was dich braucht oder das Ziel beendet, jeweils eine Benachrichtigung, statt nach jeder Runde ein „Abgeschlossen“ ([Ziele](/guide/goals)). „Abgeschlossen“-Benachrichtigungen werden nur zurückgehalten, solange am Ziel gearbeitet wird, nicht, solange es auf dich wartet:

- „Die Prüfungen des Ziels sind bereit für dich“, wenn der Agent die Prüfungen vorgeschlagen hat und auf dein **Starten** wartet, und „Eine Prüfung konnte nicht ausgeführt werden: …“, mit welcher und warum, wenn beim Drücken von **Starten** eine Prüfung gefunden wurde, die nicht ausgeführt werden kann;
- die Frage des Agents, wenn er fragt, wie es weitergehen soll; „Das Ziel braucht dich: …“, wenn es bei etwas feststeckt, das nur du geben kannst; und „Das Ziel braucht dich: Stimmt „…“?“, bei einer Prüfung, die nur du bestätigen kannst;
- „Das Ziel wartet: Die Warteschlange der Sitzung ist pausiert: Drücke dort auf Fortsetzen“, wenn Nachrichten in einer angehaltenen Warteschlange warten;
- „Ziel pausiert: …“ mit dem Grund. Diese Fälle pausieren mit einer Benachrichtigung: Die Nachricht konnte nicht gesendet werden; die Dateien konnten nicht gespeichert werden (vor dem Messen, vor den Prüfungen einer Runde oder vor dem Zurücksetzen: „…daher wurde Runde 4 nicht rückgängig gemacht. Setze fort, um sie erneut zu prüfen.“); das Zurücksetzen der Dateien einer Runde wurde nicht abgeschlossen („Das Zurücksetzen der Dateien von Runde 4 wurde nicht abgeschlossen, daher sind die Dateien möglicherweise nur teilweise zurückgesetzt. Alles, was im Ordner war, ist gespeichert: Trotzdem behalten… bei Runde 4 holt es zurück. Fortsetzen macht mit den Dateien so, wie sie sind, weiter.“); eine Runde konnte nicht geprüft werden, weil die Sitzung im Ordner weiterarbeitete, während ihre Prüfungen liefen, dreimal hintereinander („Runde 4 konnte nicht geprüft werden: … Setze fort, um sie erneut zu prüfen.“); eine Prüfung, die erfüllt war, kann nicht mehr ausgeführt werden („„Tests bestehen“ konnte nicht ausgeführt werden: …“); die Abschlussprüfung konnte nicht ausgeführt werden („Der Prüfer war nicht erreichbar, daher wurde die Abschlussprüfung nicht ausgeführt. Setze fort, um es erneut zu versuchen.“); der Agent hat am Nutzungslimit seines Tarifs angehalten und die App führt ihn nicht von selbst weiter; ein Neustart der App hat den Durchgang des Agents ein zweites Mal abgebrochen; oder die App wurde neu gestartet, als gerade eine Nachricht der Schleife gesendet wurde, und ein erneutes Senden half nicht („Die Nachricht der Schleife hat den Agent nicht erreicht…“). Eine Pause, die du selbst auslöst, eine nach dem Anhalten des Agents („Du hast den Agent angehalten.“) und eine nach einem fehlgeschlagenen Durchgang erscheinen in der Leiste ohne Benachrichtigung;
- „Ziel an seinem Limit angehalten: …“, mit dem Limit („Es hat seine 12 Runden ausgeführt“, „Es hat 10,00 $ von seinen 10,00 $ ausgegeben“);
- „Ziel erreicht: …“, mit dem Ziel;
- „Das Ziel wurde nicht gesetzt: …“, wenn eine Sitzung, die du mit **Ziel** gestartet hast, es nicht bekommen konnte (ein Hydor-Subagent, Plan-Modus, keine Nachricht, die als Ziel dienen kann).

Der Lauf einer Geplanten Aufgabe sagt, wie er verlaufen ist, in einer Zeile, die der Agent geschrieben hat. Ein Lauf ohne Neuigkeiten bleibt still, ein fehlgeschlagener Lauf meldet sich immer, ein blockierter Lauf lautet „Blockiert: …“, und eine Aufgabe, die nach mehreren Fehlschlägen in Folge pausiert wurde, sagt das ebenfalls ([Geplante Aufgaben](/guide/tasks)).

Benachrichtigungen von deinen anderen Computern kommen über diesen einen an, sodass ein Gerät von allen hört: Der Text der Benachrichtigung beginnt mit dem Namen des Computers, und die Karte in der App sagt „auf“ diesem Computer.

## Benachrichtigungen für dieses Gerät aktivieren

[Einstellungen → App → Benachrichtigungen](/settings?s=notifications) hat in der Gruppe **Dieses Gerät** zwei Schalter, die für jedes Gerät (jeden Browser) einzeln gelten, und einen Test:

- [**Dieses Gerät benachrichtigen**](/settings?s=notifications&find=Notify%20this%20device): eine Benachrichtigung, wenn eine Sitzung abgeschlossen wird, fehlschlägt oder deine Antwort braucht, auch bei geschlossener App. Beim Einschalten fragt der Browser nach der Erlaubnis, Benachrichtigungen anzuzeigen. Jedes Gerät schaltet es für sich ein: dein Smartphone und dein Computer getrennt. In einer Desktop-App (Mac, Windows, Linux) ist es immer eingeschaltet: Die Benachrichtigungen kommen als Mac-, Windows- oder Desktop-Benachrichtigungen, solange die App läuft, auch bei geschlossenem Fenster. Auf einem Mac fragt macOS einmal, ob Hydor Benachrichtigungen senden darf: Erlaube es und wähle unter **Systemeinstellungen → Mitteilungen → Hydor**, wie sie angezeigt werden. Wenn das System sie nicht anzeigt, sagt die Zeile das, und währenddessen erscheinen sie in der App; ihr **(i)** sagt, wo du sie erlaubst (unter Windows **Einstellungen → System → Benachrichtigungen**). Schalte den Schalter ein, um sie zu erlauben: Die Systemeinstellungen öffnen sich bei den Benachrichtigungen von Hydor (unter Windows Einstellungen → System → Benachrichtigungen), und wenn du zur App zurückkehrst, zeigt eine Testbenachrichtigung, dass sie funktionieren.
- [**Ton**](/settings?s=notifications&find=Sound): ein kurzer Klang bei jeder Benachrichtigung, solange die App geöffnet ist, steigend, wenn eine Sitzung abgeschlossen wird, und fallend, wenn sie dich braucht oder fehlgeschlagen ist. Zuerst ausgeschaltet; beim Einschalten wird der Klang einmal abgespielt. In einer Desktop-App wird der Klang nur bei Benachrichtigungen abgespielt, die die App in ihrem Fenster anzeigt; die Benachrichtigungen des Systems machen ihren eigenen Ton.
- [**Testbenachrichtigung senden**](/settings?s=notifications&find=Send%20a%20test) (die Zeile **Ausprobieren**, sichtbar, sobald **Dieses Gerät benachrichtigen** eingeschaltet ist): sendet eine Benachrichtigung an jedes Gerät, das Benachrichtigungen eingeschaltet hat. Sie lautet „Benachrichtigungen funktionieren auf diesem Gerät.“ und erscheint, wenn die App nicht im Vordergrund ist, wechsle also von ihr weg, um sie zu sehen. Eine Meldung sagt dir, an wie viele Geräte sie gesendet wurde, oder „Kein Gerät hat sie erhalten.“ In einer Desktop-App ist **Ausprobieren** von Anfang an sichtbar: **Testbenachrichtigung senden** zeigt sofort eine Benachrichtigung auf diesem Computer, auch wenn die App vorne ist. Wenn das System sie nicht anzeigt, sagt eine Meldung „Sie wurde nicht angezeigt. Erlaube Benachrichtigungen für Hydor in den Einstellungen des Systems.“

So richtest du es auf einem Smartphone ein:

1. Öffne die App auf dem Smartphone. Sie muss dafür über HTTPS bereitgestellt werden: [Einstellungen → App → Auf dem Smartphone nutzen](/settings?s=phone) erledigt das privat mit Tailscale, und sein QR-Code öffnet die App auf dem Smartphone bei den folgenden Schritten ([Auf dem Smartphone mit Tailscale nutzen](/guide/devices#use-it-on-your-phone-with-tailscale)).
2. Füge die App auf einem iPhone oder iPad zuerst zu deinem Home-Bildschirm hinzu (**Teilen** → **Zum Home-Bildschirm hinzufügen**) und öffne sie von dort. Bis dahin sagt die Einstellung das und lässt sich nicht einschalten.
3. Öffne **Einstellungen → App → Benachrichtigungen** und schalte **Dieses Gerät benachrichtigen** ein. Erlaube Benachrichtigungen, wenn das Smartphone fragt.
4. Tippe auf **Testbenachrichtigung senden** und verlasse dann die App, um zu sehen, wie sie ankommt.

Wenn die Einstellung sagt, Benachrichtigungen seien „In den Browsereinstellungen für diese Website blockiert“, erlaube sie zuerst in den Einstellungen des Browsers für die Adresse der App und schalte sie dann ein. Wenn dort steht „Dieser Browser kann hier keine Benachrichtigungen empfangen“, kann der Browser sie unter dieser Adresse nicht annehmen, oft weil die App über einfaches HTTP statt HTTPS geöffnet wird.

Wenn der Schalter eines Tages wieder aus ist, hat der Push-Dienst des Browsers dieses Gerät verworfen: Schalte ihn erneut ein. Wenn ein Smartphone ausgeschaltet oder offline ist, wartet eine Benachrichtigung bis zu einen Tag auf es. Eine neuere Benachrichtigung zur selben Sitzung ersetzt auf dem Gerät eine ältere.

Um sie zu beenden, schalte **Dieses Gerät benachrichtigen** auf diesem Gerät aus.

## Über die Benachrichtigung genehmigen oder ablehnen

Wenn eine Sitzung auf eine einfache Ja-oder-Nein-Genehmigung wartet (ein Befehl, eine Dateiänderung oder ein Tool; keine Frage, kein Formular und kein Plan), hat ihre Benachrichtigung zwei Buttons mit den Worten der Karte selbst, etwa **Erlauben** und **Ablehnen**, sofern der Browser Buttons in Benachrichtigungen anzeigt.

- Tippe auf einen, um zu antworten, ohne die App zu öffnen. Eine leise Benachrichtigung bestätigt es, etwa „Erlauben: Befehl ausführen“.
- Wenn die Antwort nicht durchgeht (der Browser wurde abgemeldet oder du hast schon anderswo geantwortet), öffnet sich die Sitzung, damit du dort antworten kannst.
- Tippe auf die Benachrichtigung selbst, um die Sitzung zu öffnen, und zwar in einem bereits geöffneten Fenster der App, falls es eines gibt.
- Die Benachrichtigungen einer Desktop-App haben keine Buttons: Klicke auf eine, um die Sitzung zu öffnen, und antworte dort.
- Ein Aufruf, der im Postausgang festgehalten wird, hat ebenfalls keine Buttons, damit du zuerst liest, was hinausginge: Tippe auf die Benachrichtigung und sende ihn aus dem Posteingang.

Genehmigungen von deinen anderen Computern lassen sich auf dieselbe Weise beantworten: Die Antwort geht über diesen Computer an jenen.

## Einen Agent fragen

Agents können lesen, was auf dich wartet, und eine Testbenachrichtigung senden. Sie können die Genehmigungen anderer Sitzungen nicht für dich beantworten. Ein paar Dinge zum Ausprobieren:

- „Was wartet gerade auf mich? Das Dringendste zuerst.“
- „Welche Sitzungen fragen mich nach einem Key, und wofür?“
- „Was wartet in meinem Postausgang? Lies mir die E-Mails vor, bevor ich sie sende.“
- „Fasse in je einer Zeile zusammen, was jede wartende Sitzung von mir braucht.“
- „Sende eine Testbenachrichtigung, damit ich prüfen kann, ob mein Smartphone sie erhält.“
