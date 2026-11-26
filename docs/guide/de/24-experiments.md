# Experimente

Experimente führt Trainings- und Evaluationsjobs für dich aus. Ein Job wartet auf eine GPU mit genügend freiem Speicher auf einem deiner Computer (oder bis er in der Warteschlange eines Clusters an der Reihe ist), läuft dann selbstständig und wird als Aufzeichnung aufbewahrt: Code, Hyperparameter, Umgebung, Protokoll und Metriken sowie das, was der zuständige Agent unternommen hat, wenn etwas schiefging. Jedes Experiment (die Läufe, die du gemeinsam vergleichst) hat einen Titel, eine Beschreibung und eine Kategorie. Seine Seite zeigt die Läufe als Tabelle, ihre Metriken als Diagramme und welche Hyperparameter wichtig sind. Du kannst Läufe vergleichen oder eine Ergebnistabelle mit Signifikanztests für dein Paper erstellen. Auch Agenten nutzen diese Funktion: Bitte einen beliebigen Agenten, etwas auf einer freien GPU zu trainieren, und er startet hier einen Lauf.

![Die Experimente-Seite: links die Experimente nach Kategorie, daneben der Tab Diagramme eines Sweeps: die Kurven seiner sechs Läufe in gemeinsamen Diagrammen, jeder Lauf in seiner eigenen Farbe](images/experiments.webp)

## Experimente öffnen

Klicke in der Werkzeugleiste auf **Experimente** oder öffne [Experimente](/experiments).

Wenn du die Seite zum ersten Mal öffnest, führt dich ein kurzer Rundgang herum, der für Neulinge bei Experimenten geschrieben ist. Er kommt, solange Tipps eingeschaltet sind, nach der Willkommenstour. Eine Karte erklärt in einfachen Worten, was ein Experiment und ein Lauf sind, dann leuchtet jeder Teil der Seite der Reihe nach mit einer eigenen Karte auf: **Neuer Lauf**, die Warteschlange und die GPUs, deine Experimente nach Kategorie, einen Lauf live verfolgen, Läufe vergleichen und Ergebnistabellen sowie einen Agenten die Arbeit machen lassen. Mit **Weiter** und **Zurück** bewegst du dich durch den Rundgang; **Fertig** beendet ihn, und **Überspringen** oder Esc schließt ihn früher. **Rundgang zeigen** (die Kompass-Schaltfläche oben rechts auf der Seite) startet ihn jederzeit erneut.

Auf einem Computer bleibt links eine Spalte neben allem stehen, was du hier öffnest:

- Die Warteschlangenzeile ganz oben sagt, was gerade passiert („2 aktiv · 1 wartend“ oder „Derzeit keine aktiven Läufe“). Darunter stehen die GPUs dieses Computers als kleine Anzeigen: der Speicher, den jede belegt, in der Akzentfarbe, wenn einer deiner Läufe sie belegt (fahre darüber, um zu sehen, wie stark sie ausgelastet ist und welcher Lauf sie belegt; ein Klick öffnet diesen Lauf).
- **Experiment finden** filtert die Liste nach dem, was du eintippst: Titel, Beschreibung, Kategorie und Name eines Experiments sowie Namen und Befehle seiner Läufe. Passt ein Experiment nur über seine Läufe, steht dort, wie viele es sind („3 Läufe passen“).
- **Übersicht** bringt dich zurück zur unten beschriebenen Seite.
- Darunter folgen die Experimente, nach Kategorie gruppiert (jeweils mit einer kleinen Überschrift; die Kategorie mit dem neuesten Lauf steht zuerst; Experimente ohne Kategorie stehen unter **Weitere Experimente**, und solange keines eine Kategorie hat, gibt es gar keine Überschriften). Jedes zeigt seinen Titel und darunter, wie viele Läufe es hat und wie viele davon aktiv sind („6 Läufe · 1 aktiv“) oder wann sein letzter Lauf war („23 Läufe · vor 2 Std.“). In einer Kategorie steht das Experiment mit dem neuesten Lauf zuerst. **Läufe ohne Experiment** ist der letzte Eintrag, sofern es solche Läufe gibt.

Die **Übersicht** zeigt:

- **Läuft gerade**, wenn etwas läuft oder wartet: eine Karte pro Lauf mit Status, Name, Experiment, Fortschritt („54% · noch etwa 41 Min.“), seiner wichtigsten Metrik mit einer kleinen Kurve und seinen GPUs. Ein wartender Lauf nennt den Grund. Ein Klick auf eine Karte öffnet den Lauf. Sind mehr als 12 aktiv, zeigt **Alle N anzeigen** alle.
- **Experimente**: eine Karte pro Experiment mit Kategorie, Titel und Beschreibung, der Anzahl seiner Läufe, der Anzahl der aktiven und dem Zeitpunkt des letzten Laufs sowie dem besten Wert seiner wichtigsten Metrik („Bestwert dev_bpb 1.599“). Ein Klick öffnet das Experiment.
- **Neueste Läufe**: eine Tabelle der 10 neuesten Läufe aus allen deinen Experimenten. **Alle N Läufe anzeigen** zeigt alle, mit **Lauf finden** darüber.

Auf einem schmalen Bildschirm gibt es keine Spalte: Die Übersicht selbst beginnt mit der Warteschlangenzeile, den GPUs und **Experiment finden** und zeigt die Experimente als Karten.

Sind noch keine Läufe vorhanden, erklärt die Seite, was Experimente ist, und bietet **Neuer Lauf** an – oder: „Bitte einen beliebigen Agenten: ‚Trainiere das auf einer freien GPU und sag mir Bescheid, wenn es fertig ist‘“.

## Die Seite eines Experiments

Klicke in der Spalte oder auf der Übersicht auf ein Experiment. Oben stehen:

- Seine Kategorie und sein Name (der Name, den seine Läufe tragen, so wie du ihn unter **Experiment** eingegeben hast), darunter sein Titel in großen Buchstaben und seine Beschreibung. Eine Beschreibung mit mehr als drei Zeilen hat **Mehr**.
- Eine Zeile mit Zahlen: „23 Läufe · 1 aktiv · 2 wartend · 9 fertig · 6 fehlgeschlagen · letzter Lauf vor 2 Std.“ (nur, was größer als null ist).
- Rechts ein ⋯-Menü, **Dieses Experiment**: **Titel und Beschreibung bearbeiten** und **Erneut schreiben** (siehe [Titel, Beschreibungen und Kategorien](#titles-descriptions-and-categories)), **Neuer Lauf in diesem Experiment**, **Neuer Sweep in diesem Experiment**, **Tabelle erstellen** (aus seinen abgeschlossenen Läufen; siehe [Ergebnistabellen für Papers](#results-tables-for-your-paper)), **Die letzten 6 vergleichen** und **Alle auswählen** (markiert jeden Lauf). Auf einem Smartphone führt ein Pfeil links vom Titel zurück.

Darunter stehen drei Tabs: **Läufe** (mit der Anzahl), **Diagramme** und **Hyperparameter** (sobald das Experiment zwei oder mehr Läufe hat, die sich in einem Hyperparameter unterscheiden). Der Tab, den du zuletzt gewählt hast, öffnet sich beim nächsten Mal zuerst, auf diesem Gerät.

### Die Tabelle der Läufe

Der Tab **Läufe** listet die Läufe des Experiments als Tabelle auf, eine Zeile pro Lauf: seinen Namen, seinen Status („Läuft 54%“, „Fertig“, „Fehlgeschlagen“, „Warten auf eine GPU“; fahre über einen wartenden Status, um den Grund zu sehen), eine Spalte je Metrik (ihr letzter Wert; der beste jeder Spalte fett) und je Hyperparameter, dann **Laufzeit** und **Begonnen**. Liegen die Läufe des Experiments an mehr als einem Ort, nennt eine Spalte **Wo** den Ort. Zuerst stehen die Läufe, die gerade laufen, dann die wartenden in der Reihenfolge, in der sie starten, dann die beendeten, der letzte zuerst. Klicke auf den Namen einer Spalte, um danach zu sortieren (bei einer Metrik steht beim ersten Klick der beste Wert oben; ein weiterer Klick kehrt die Reihenfolge um, ein dritter geht zu dieser Reihenfolge zurück). Die Tabelle scrollt seitwärts, und Kästchen und Name jedes Laufs bleiben im Blick.

Über der Tabelle:

- **Lauf finden** durchsucht Namen, Befehle und Tags der Läufe.
- **Filtern**: nach **Status** (**Alle Läufe**, **Aktive und wartende Läufe**, **Fertig**, **Fehlgeschlagen oder verloren**, **Angehalten**) und, wenn Läufe an mehr als einem Ort liegen, nach **Wo**. Solange eine Suche oder ein Filter aktiv ist, hebt **× N angezeigt** ihn auf.
- **Spalten**: Wähle die Metriken und Hyperparameter, die angezeigt werden (ein Feld findet eine bestimmte; ein Hyperparameter, der sich zwischen den Läufen unterscheidet, trägt den Hinweis **Unterscheidet sich**). **Zurücksetzen** geht zu den Spalten zurück, die die Seite gewählt hat: die Metriken, die am meisten über die Läufe aussagen, und die Hyperparameter, die sich unterscheiden. Jedes Experiment merkt sich seine eigenen Spalten auf diesem Gerät.

Ein Klick auf eine Zeile öffnet den Lauf. Markiere die Kästchen, um Läufe zu vergleichen (siehe [Läufe vergleichen](#compare-runs)). Die Tabelle zeigt 50 Zeilen; **N mehr anzeigen** zeigt den Rest.

### Diagramme

Der Tab **Diagramme** zeichnet jede Metrik, die die Läufe ausgeben, über die Schritte, ein Diagramm je Metrik und eine Linie je Lauf. Links (auf einem Smartphone über den Diagrammen) stehen die Läufe in den Diagrammen: **In den Diagrammen** mit der Anzahl („6 von 23“), dann jeder Lauf des Experiments, mit einem farbigen Punkt, wenn er angezeigt wird, und einem leeren Ring, wenn nicht. Ein Klick auf einen Lauf blendet ihn ein oder aus. Es werden höchstens 8 Läufe gleichzeitig angezeigt („Es werden höchstens 8 Läufe gleichzeitig angezeigt: Blende zuerst einen aus“). Ein Lauf behält seine Farbe, solange er angezeigt wird, was du auch sonst ein- oder ausblendest, sodass du einen Lauf durch deine Änderungen hindurch verfolgen kannst; dieselbe Farbe kennzeichnet ihn in der Tabelle der Läufe. Das ⋯-Menü (**Welche Läufe angezeigt werden**) bietet **Die neuesten 8 anzeigen**, **Die besten 8 anzeigen** (nach der wichtigsten Metrik des Experiments), **Ausgewählte Läufe anzeigen** (die, die du in der Tabelle markiert hast) und **Alle ausblenden**. Zu Beginn werden die ersten 8 Läufe mit Kurven angezeigt. Jedes Experiment merkt sich deine Auswahl auf diesem Gerät.

Die Diagramme sind nach dem Anfang des Metriknamens in Abschnitte gegliedert: **dev** (oder val, validation, eval, test …), **train**, jedes andere Präfix, das zwei oder mehr Metriken vor einem Schrägstrich teilen (`eval/…`), dann **Metriken** für die, die aussagen, wie gut ein Lauf ist, und **Andere** für den Rest (eingeklappt, bis du ihn öffnest). Ein Klick auf den Namen eines Abschnitts klappt ihn ein oder aus. Über den Diagrammen:

- **Metrik finden** zeigt in jedem Abschnitt nur die Diagramme, deren Name enthält, was du eintippst.
- **Glättung**: ein Regler von 0 (die Kurven, wie sie sind) bis 0.99, ein gleitender Mittelwert, wie ihn TensorBoard und Weights & Biases zeichnen; die Rohkurve bleibt blass dahinter.
- **Diagrammoptionen** (die Schaltfläche mit den Reglern): **X-Achse** (**Schritt** oder eine andere Metrik, die nur wächst, etwa Token oder Zeit), **Logarithmische Skala** und **Ausreißer ignorieren** (der Wertebereich eines Diagramms richtet sich nach den meisten Werten statt nach einer Spitze). Sie werden für alle Diagramme auf diesem Gerät gemerkt.

Fahre über ein Diagramm, um den Wert jedes Laufs bei diesem Schritt zu lesen. Mit einer Maus zoomst du hinein, indem du über ein Diagramm ziehst; ein Doppelklick (oder **Zoom zurücksetzen**) geht zurück. Auf einem Touchscreen zeigt ein Tippen oder Ziehen die Werte. **Größer** oben rechts in einem Diagramm öffnet es groß, mit einer Tabelle mit **Zuletzt**, **Am besten**, **Min** und **Max** jedes Laufs.

### Hyperparameter

Der Tab **Hyperparameter** zeigt, wie die Hyperparameter der Läufe mit einer Metrik zusammenhängen. So liest du einen Sweep. Wähle die Metrik (zuerst die wichtigste) und ob jeder Lauf mit seinem **Zuletzt**- oder seinem **Am besten**-Wert zählt; die Seite sagt, ob für sie niedriger oder höher besser ist. Bilden die Läufe einen Sweep, sagt eine Zeile das: „Ein Sweep aus 12 Läufen · jede Kombination · 9 erledigt · 2 aktiv · 1 vorzeitig gestoppt · vorzeitig gestoppt bei dev_loss“. Darunter:

- Der **beste** Lauf: „Bestwert dev_bpb“, sein Wert, der Lauf und die Werte der Hyperparameter, die sich unterscheiden. Ein Klick öffnet den Lauf.
- **Parallele Koordinaten**: eine Linie je Lauf über die Hyperparameter (die wichtigsten zuerst, bis zu 8) und zuletzt die Metrik. Je kräftiger die Linie, desto besser war der Lauf. Fahre über eine Linie, um zu sehen, welcher Lauf es ist; ein Klick öffnet den Lauf.
- **Welche Hyperparameter wichtig sind**: ein Balken je Hyperparameter, der sich unterscheidet, der stärkste zuerst. Bei einer Zahl sagt ρ (von −1 bis 1), wie ihre Rangfolge mit der der Metrik zusammenhängt: Ein Balken links von der Mitte bedeutet, dass ein höherer Wert mit einer niedrigeren Metrik einhergeht, und die Worte sagen „höher ist besser“ oder „niedriger ist besser“. Bei anderen Werten (ein Name, wahr oder falsch) sagt η (von 0 bis 1), wie stark sich die Gruppen unterscheiden, mit „am besten:“ und dem Wert, dessen Läufe im Durchschnitt am besten abschnitten. Darunter steht, aus wie vielen Läufen es berechnet wurde. Es ist eine Korrelation, kein Beweis für eine Ursache: Andere Hyperparameter ändern sich gleichzeitig, und bei wenigen Läufen kann ein Balken zufällig entstehen. Ein Hyperparameter, der in jedem Lauf gleich ist oder den weniger als 3 Läufe haben, bleibt außen vor.
- **Jeder Hyperparameter im Verhältnis zu** der Metrik: ein Diagramm je Hyperparameter, ein Punkt pro Lauf, der beste umrandet (auf einer logarithmischen Skala, wenn die Werte weit auseinanderliegen, wie bei Lernraten).

Am Ende stehen **Tabelle erstellen** und **Die besten 6 vergleichen**.

## Einen Lauf starten

1. Klicke oben rechts auf [**Neuer Lauf**](/experiments?new=1).
2. Trage den **Befehl** so ein, wie du ihn in seinem Ordner ausführen würdest: `python train.py --lr 3e-4`.
3. Wähle den **Ordner**, in dem er läuft, und den **Ausführungsort**: **Dieser Computer**, einen deiner anderen Computer oder einen Cluster (siehe [Ausführungsorte](#where-runs-go)).
4. Lege fest, wie viele **GPUs** er braucht (0 führt ihn ohne GPU aus) und wie viel **Freier Speicher je GPU (GB)**. Ohne Angabe wartet er auf eine GPU, die niemand nutzt.
5. Gib ihm bei Bedarf einen **Namen** (sonst der Name seines Skripts) und ein **Experiment**: Die Läufe eines Experiments werden gemeinsam aufgelistet, als Diagramm gezeichnet und verglichen (das Feld schlägt die vorhandenen vor).
6. Klicke auf **Starten**.

Unter **Weitere Optionen** findest du den Rest:

- **Hyperparameter**: Zeilen im Format name=value (`lr=3e-4`), die mit dem Lauf gespeichert, als Spalten in der Tabelle der Läufe seines Experiments angezeigt und in Tabellen verglichen werden. Hyperparameter im Befehl selbst werden von allein erkannt: `--name value`, `--name=value` und `name=value`-Wörter hinter dem Programm (wie Hydra sie übernimmt). `{name}` im Befehl wird durch den Wert eines Hyperparameters ersetzt.
- **Seed** (`{seed}` im Befehl übernimmt ihn; ein `--seed` im Befehl wird ebenfalls erkannt), **Priorität** (höhere Werte kommen zuerst) und **Zeitlimit (Stunden)** (danach wird der Lauf gestoppt).
- **Metrikdatei**: eine Datei, in die der Lauf zusätzlich zu seiner Ausgabe Metriken als JSON-Zeilen schreibt. **Bewertungen pro Beispiel**: eine Datei mit Bewertungen je Beispiel (siehe [Ergebnistabellen für Papers](#results-tables-for-your-paper)).
- **Benachrichtige mich**: **Bei Abschluss** und **Bei Fehlern** (beide aktiviert, solange du sie nicht abwählst) und **Wenn eine Metrik einen Schwellenwert überschreitet** („val_acc > 0.9“).
- **Überwachung durch einen Agenten**: siehe [Der zuständige Agent](#the-agent-on-call).
- Bei einem SLURM-Cluster: **Prozessoren**, **Arbeitsspeicher (GB)** und **Partition**.

Der neue Lauf öffnet sich, damit du seinen Start verfolgen kannst. Um einem Experiment, das du gerade ansiehst, einen Lauf hinzuzufügen, wähle in seinem ⋯-Menü **Neuer Lauf in diesem Experiment**: **Experiment** ist dann ausgefüllt. Kurz nach dem ersten Lauf eines Experiments gibt ihm das Hilfsmodell einen Titel, eine Beschreibung und eine Kategorie (siehe [Titel, Beschreibungen und Kategorien](#titles-descriptions-and-categories)).

## Wie die Warteschlange entscheidet

- Jobs werden nach Priorität und danach nach Wartezeit berücksichtigt. Ein Job, der GPUs braucht, erhält GPUs mit mindestens dem angeforderten freien Speicher, die kein anderer deiner Läufe belegt; die mit dem meisten freien Speicher kommen zuerst. Bis genug frei sind, wartet er und nennt den Grund: „Warten auf 1 GPU mit 20 GB freiem Speicher: aktuell höchstens 12 GB auf GPU 2 verfügbar; GPU 0 ist durch einen anderen deiner Läufe belegt“. Ein kleinerer Job dahinter darf vorher starten, wenn seine Ressourcen frei sind.
- Jobs ohne GPU starten sofort, wenige gleichzeitig. Die Anzahl legst du unter [Ausführungsorte](#where-runs-go) fest (zu Beginn ein Viertel der Threads des Computers, mindestens 1 und höchstens 4).
- Fordert ein Job mehr GPUs an, als der Computer hat, oder eine GPU auf einem Computer ohne NVIDIA-GPU, schlägt er sofort fehl und sagt, warum.
- Ein Lauf sieht über CUDA_VISIBLE_DEVICES nur seine eigenen GPUs; ein Lauf ohne GPU sieht keine. Außerdem erhält er HYDOR_RUN (seine Kennung), HYDOR_RUN_DIR (sein Ordner) und HYDOR_SEED, und Python gibt sofort aus (PYTHONUNBUFFERED), sodass sein Protokoll laufend mitwächst.
- Läufe laufen bei einem Neustart oder Update der App in tmux weiter (ohne tmux als Hintergrundprozesse). Ist die App zurück, findet sie sie wieder, liest, was sie inzwischen ausgegeben haben, und erkennt, welche beendet sind. Ein Lauf, dessen Prozess verschwunden ist, erhält den Status **Nicht mehr vorhanden**.

## Was ein Lauf aufzeichnet

- **Sein Code**: Beim Start werden Commit und Branch des Git-Repositorys seines Ordners erfasst und ob es nicht committete Änderungen gab; falls ja, ein Patch davon (ohne Binärdateien, höchstens 2 MB) sowie die Anzahl der Dateien, die Git nicht verfolgt.
- **Seine Umgebung**: der Computer; das Python, mit dem der Befehl läuft, und die Versionen von PyTorch, Transformers, JAX, TensorFlow und NumPy darin (aus den Paketen gelesen, nichts wird importiert); bei GPUs die CUDA- und Treiberversionen und die Namen der GPUs.
- **Seine Hyperparameter und sein Seed**, sein **Protokoll**, sein **Exit-Code** und ein eigener Ordner in den App-Daten (sein Protokoll, Patch, Exit-Code und seine Metriken).
- **Seine Metriken**, aus der wachsenden Ausgabe gelesen: `key=value`-Paare (`loss=0.42`, wie Lightning sie in seinen Fortschrittsbalken ausgibt), ein JSON-Objekt pro Zeile (`{"step": 100, "loss": 0.42}`), ausgegebene Python-Dictionaries (wie der Trainer von Hugging Face sie ausgibt), Keras-Ausgaben wie „loss: 0.41 - accuracy: 0.87“ und die Metrikdatei. Der Schritt wird aus `step`, `global_step`, `iter` oder `epoch` gelesen. Für jede Metrik speichert die App den letzten Wert, den besten (bei Verlust, Fehler, Perplexität und ähnlich benannten Metriken sind kleinere Werte besser, bei anderen größere) und eine Zeitreihe für die Diagramme. Eine Metrik, die er immer wieder ausgibt, ist eine Kurve; eine Zahl, die er nur einmal ausgibt, ist ein Wert (seine Hyperparameter am Anfang, seine Ergebnisse am Ende). Es werden bis zu 100 Metriken gespeichert: Gibt ein Lauf mehr aus, bleiben seine Kurven vor den Zahlen, die er nur einmal ausgegeben hat.
- **Wie weit er ist**, wenn seine Ausgabe es verrät: ein Fortschrittsbalken (der von tqdm, wie ihn der Trainer von Hugging Face zeichnet, oder einer, der nach Training oder Schritten benannt ist), „step 120/1000“ oder eine Gesamtzahl von Schritten, die er ausgibt (`total_steps`, `max_steps`, `num_training_steps` …), neben seinen Schritten.

## Die Detailseite eines Laufs

Klicke auf einen Lauf (in einer Tabelle, auf einer Karte oder auf die Anzeige einer GPU). Auf einem Computer öffnet er sich anstelle des Experiments, mit der Spalte weiterhin links; auf einem schmalen Bildschirm füllt er den ganzen Bildschirm, mit einem Zurück-Pfeil. Der Weg zurück ist der Link oben links, benannt nach dem Experiment des Laufs (**Übersicht** bei einem Lauf ohne Experiment).

- Die Kopfzeile: der Name des Laufs; **Stoppen**, solange er läuft oder wartet („Anhalten“, während er angehalten wird); **Erneut ausführen**, das einen neuen Lauf mit seinen Hyperparametern vorausgefüllt öffnet, damit du sie vor dem Start ändern kannst; und **Mehr** (⋯): **Befehl kopieren**, **Arbeitsordner in Dateien öffnen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App; siehe [Mit Dateien und Ordnern arbeiten](/guide/files-git#work-with-files-and-folders)) und nach seinem Ende **Datensatz löschen** (Aufzeichnung, Protokoll, Patch und Metriken werden entfernt; die Dateien, die der Job in seinem eigenen Ordner erzeugt hat, bleiben). Auf einem Smartphone steht **Erneut ausführen** im ⋯-Menü.
- Die Statuszeile: sein Status, nach dem Ende mit der Dauer, sein Exit-Code, wenn er nicht 0 ist, sein Ausführungsort, seine GPUs und sein Start. Solange er läuft und seine Ausgabe verrät, wie weit er ist: ein Balken, die erledigten Schritte von allen („9.120 von 10.878 · 84%“) und ungefähr die verbleibende Zeit, berechnet aus der bisherigen Dauer. Ein Lauf, der wartet oder fehlgeschlagen ist, nennt den Grund.
- Drei Tabs: **Übersicht**, **Diagramme** (mit der Anzahl seiner Kurven) und **Protokoll**.

**Übersicht** enthält:

- **Wie er endete**, als Erstes, bei einem Lauf, der fehlgeschlagen ist oder nicht mehr vorhanden ist: die letzten Zeilen seines Protokolls und **Protokoll öffnen**.
- **Wichtige Metriken**: eine Kachel für jede von bis zu sechs Metriken, die aussagen, wie gut er ist (nie Verwaltungsangaben wie die Lernrate oder Token-Zahlen), mit dem letzten Wert, dem besten, wenn er abweicht, und einer kleinen Kurve. Ein Klick auf eine Kachel öffnet den Tab **Diagramme** bei dieser Metrik.
- **Hyperparameter**: die, die er erhalten hat oder die aus seinem Befehl gelesen wurden (ein Feld findet einen bestimmten, wenn es viele gibt).
- **Werte**: die Zahlen, die er nur einmal ausgegeben hat, nach Namen: seine Hyperparameter am Anfang, seine Ergebnisse am Ende. **Alle N** blendet mehr als zwölf ein, mit einem Feld, um einen Wert zu finden.
- **Details**: sein Experiment (ein Link dorthin), Status, wann er begonnen und geendet hat, wie lange er gedauert hat, wo er läuft, GPUs, Seed, Priorität, die Sitzung, die ihn gestartet hat, und der Lauf, von dem er eine Wiederholung ist.
- **Code**: der Commit und der Branch, **Änderungen anzeigen** für den Patch (oder „Seitdem nichts geändert“) und die Anzahl der Dateien, die Git nicht verfolgt.
- **Befehl**: der Befehl und der Ordner, mit **Arbeitsordner in Dateien öffnen**. **Umgebung**: der Computer, Python, Pakete und GPUs.
- **Was ist passiert?**: seine Ereignisse mit Zeitstempeln: wann er gewartet, begonnen und geendet hat und was der zuständige Agent gesehen und getan hat, mit **Sitzung öffnen**.

**Diagramme** zeichnet die Kurven des Laufs wie der Tab eines Experiments (siehe [Diagramme](#charts)), nur für diesen Lauf, und liest sie, solange er läuft, alle paar Sekunden neu. **Protokoll** zeigt seine Ausgabe, die neueste unten. Solange er läuft, hält **Folgen** die neueste Ausgabe im Blick; scrollst du nach oben, um zu lesen, hört das Folgen auf. **Im Protokoll suchen** zeigt nur die passenden Zeilen („12 Zeilen passen“), und das Folgen pausiert solange.

**Stoppen** sendet zunächst Strg+C an die Programme. Nach 10 Sekunden werden noch aktive Prozesse zwangsweise beendet. Ein Lauf, der nur gewartet hat, wird sofort aus der Warteschlange entfernt.

## Der zuständige Agent

Unter **Weitere Optionen** → **Überwachung durch einen Agenten**:

- **Aus**, die Voreinstellung: Probleme werden weiterhin auf der Seite des Laufs erfasst.
- **Benachrichtige mich**: Du erhältst bei einem Problem eine Benachrichtigung.
- **Durch Agenten prüfen lassen**: Ein Agent startet eine Sitzung im Ordner des Laufs. Er erhält das, was passiert ist, das Ende des Protokolls, die Aufzeichnung des Laufs und **Was der Agent tun darf**, deine Vorgaben für ihn. Innerhalb dieses Rahmens handelt er und berichtet dir anschließend in wenigen Zeilen, was passiert ist und was er getan hat. Die Seite des Laufs verlinkt seine Sitzung.

Er achtet auf (alle, solange du nicht einzelne abwählst): **NaN** (eine Metrik wird NaN oder unendlich oder ein NaN-Verlust im Protokoll), **Nicht genügend Speicher** (CUDA-Meldungen, `OutOfMemoryError` oder das Programm wird mit Exit-Code 137 beendet), **Stillstand** (keine neue Ausgabe seit 30 Minuten oder der von dir gewählten Dauer), **Ein Absturz** (ein Exit-Code ungleich 0 oder ein Prozess, der unerwartet beendet wurde) und **Divergenz** (ein Verlust, der fünf Messungen in Folge mehr als doppelt so hoch wie sein bisheriger Bestwert ist).

Ohne eigene Vorgaben gilt sinngemäß: „Lies Protokoll und Code. Ist eine Korrektur eindeutig und sicher, starte den Lauf mit experiment_run erneut, wenn möglich vom letzten Checkpoint. Ändere so wenig wie möglich. Lösche niemals Dateien oder Checkpoints. Berichte dem Nutzer anschließend kurz, was passiert ist und was du getan hast.“ Zuständig ist der Agent, der den Lauf gestartet hat (wenn ein Agent es war), sonst der Agent und das Modell, die du zuletzt auf der Startseite gewählt hast. Pro Lauf untersucht nur ein Agent gleichzeitig das Problem, und höchstens drei Einsätze werden pro Stunde gestartet; danach erhältst du stattdessen eine Benachrichtigung.

## Benachrichtigungen

Du erfährst, wenn ein Lauf fertig ist oder fehlschlägt (solange du es nicht abwählst), wenn eine Metrik den von dir gesetzten Wert überschreitet, und vom zuständigen Agenten. Eine Benachrichtigung öffnet die Seite des Laufs. Ein Sweep meldet sich einmal, wenn alle seine Läufe beendet sind, und nennt seinen besten Lauf; seine Meldung öffnet das Experiment des Sweeps im Tab **Hyperparameter**. Innerhalb von zehn Minuten kommen höchstens acht Meldungen zu Läufen; darüber hinaus sagt eine, wie viele es noch waren.

Startet ein Agent einen Lauf mit der Bitte um Rückmeldung nach Abschluss (report), erhält auch diese Sitzung eine Nachricht, wenn er endet, sodass ihr Agent dort weiterarbeiten kann.

## Titel, Beschreibungen und Kategorien

Jedes Experiment hat einen Titel (ein paar einfache Worte: was trainiert oder evaluiert wird, woran und was variiert wird), eine Beschreibung (ein bis drei Sätze) und eine Kategorie (ein bis drei Wörter für das Gebiet oder die Aufgabe, etwa „Sprachmodellierung“). Sie erscheinen auf seiner Seite, in der Spalte und auf den Karten der Übersicht, sodass aus einem Namen wie `e7-pretrain` eine Zeile wird, die du verstehst, und die Suche (Strg+K) und **Experiment finden** ein Experiment darüber finden.

Wer sie schreibt:

- **Das Hilfsmodell** ([Einstellungen → Agenten → Modelle](/settings?s=models&find=Helper%20model)) schreibt sie für ein Experiment, das keine hat, kurz nach seinem ersten Lauf (und für deine älteren Experimente etwas nach dem Start der App). Es liest die Namen, Befehle, Hyperparameter und Metriknamen einiger seiner Läufe. Hat es sie geschrieben und das Experiment die doppelte Anzahl Läufe erreicht (mindestens 4), schreibt es sie erneut, höchstens einmal in sechs Stunden.
- **Ein Agent**, der Läufe startet, gibt dem Experiment einen Titel, eine Beschreibung und eine Kategorie, wenn er die ersten Läufe startet, und erneut, wenn sich ändert, was er testet (das Werkzeug experiment_describe).
- **Du**: **Titel und Beschreibung bearbeiten** im ⋯-Menü des Experiments öffnet ein Fenster mit **Titel**, **Beschreibung** und **Kategorie** (es schlägt die bereits verwendeten Kategorien vor). **Erneut schreiben** fragt das Hilfsmodell nach einer neuen Fassung, die ersetzt, was dort steht.

Was du oder ein Agent geschrieben hast, wird nie automatisch überschrieben; nur **Erneut schreiben** tut das. Die Läufe einer [vertraulichen Sitzung](/guide/sessions#keep-a-session-confidential) liest nur ein Hilfsmodell, das auf diesem Computer läuft; ist keines vorhanden, bleibt ihr Experiment, wie es ist.

## Läufe vergleichen

Markiere in einer Tabelle der Läufe das Kästchen jedes Laufs, den du haben möchtest (das Kästchen im Tabellenkopf markiert jeden angezeigten Lauf). Eine Leiste unten sagt „3 ausgewählt“ und bietet **Vergleichen** (ab 2 Läufen, bis zu 8), **Tabelle erstellen** und × zum Aufheben der Auswahl. Die markierten Läufe bleiben markiert, während du zwischen Experimenten wechselst, sodass du Läufe verschiedener Experimente vergleichen kannst. **Vergleichen** öffnet ein Fenster, „3 Läufe vergleichen“, mit:

- Den Läufen, jeweils mit der Farbe ihrer Linie.
- **Metriken**: jede Metrik, die einer von ihnen hat, eine Spalte je Lauf, der beste Wert jeder Zeile fett. Die ersten 15 werden angezeigt; **Alle N** zeigt den Rest.
- **Hyperparameter**: das Experiment, der Befehl, der Ordner, wo er lief, der Commit, der Seed und die GPUs sowie jeder Hyperparameter, nebeneinander. **Nur Unterschiede** (zu Beginn aktiviert) lässt die Zeilen weg, die in jedem Lauf gleich sind; ein Unterschied wird hervorgehoben.
- **Diagramme**: die Kurven der Läufe, ein Diagramm je Metrik, eine Linie je Lauf.

Das ⋯-Menü eines Experiments bietet außerdem **Die letzten 6 vergleichen**, sein Tab **Hyperparameter** **Die besten 6 vergleichen**.

## Ergebnistabellen für Papers

**Tabelle erstellen** (aus markierten Läufen, dem ⋯-Menü eines Experiments oder seinem Tab **Hyperparameter**) zeigt die Tabelle so, wie du sie wählst:

- **Spalten**: die Metriken. Ein Klick fügt eine hinzu oder entfernt sie, und ihr Pfeil legt fest, ob größere oder kleinere Werte besser sind.
- **Zeilen**: **Eine Zeile pro Experiment** oder eine Zeile pro Wert eines Hyperparameters, der sich zwischen den Läufen unterscheidet (**Eine Zeile pro Wert von lr**).
- **Grundlinie**: die Zeile, gegen die die anderen getestet werden (die erste Zeile, wenn du keine auswählst).
- **Mit der Baseline vergleichen**: **Automatisch auswählen** (gepaart über Beispiele, wenn die Läufe Bewertungen pro Beispiel gespeichert haben, sonst gepaart über Seeds, wenn die Läufe der Zeilen ihre Seeds teilen, sonst ein Welch-t-Test über Seeds), **Welch-t-Test über Seeds**, **Gepaarter t-Test (nach Seed oder Beispiel)**, **Gepaarter Bootstrap über Beispiele** oder **Kein Test**.
- **Bildunterschrift**.

Jede Zelle zeigt den Mittelwert ± die Standardabweichung über die Läufe (Seeds) ihrer Zeile; der beste Wert jeder Spalte ist fett; ein Kreuz (†) kennzeichnet eine Zelle, die nach der Holm-Korrektur für den Test mehrerer Zeilen bei p < 0,05 besser als die Baseline ist. Fahre über eine Zelle, um ihre p-Werte zu sehen. Eine Zeile unter der Tabelle nennt den verwendeten Test und was weggelassen wurde (Läufe, die nicht beendet sind oder diese Metriken nicht haben).

Anschließend kannst du:

- **LaTeX kopieren**: eine `table` mit booktabs-Linien (ergänze `\usepackage{booktabs}` in deiner Präambel), die besten Werte in `\textbf`, `$\pm$` und Kreuze sowie eine Beschriftung, die erklärt, wie die Zellen zu lesen sind.
- **Markdown kopieren** und **CSV herunterladen** (Mittelwert, Standardabweichung, Anzahl der Läufe und p-Werte je Metrik).
- **In ein LaTeX-Dokument einfügen**: Wähle eines deiner LaTeX-Dokumente (in den Dateien eines Projekts oder bei seiner Unterhaltung behalten) und dann eine seiner Dateien. Die Tabelle wird vor `\end{document}` eingefügt (oder am Ende einer Datei ohne diesen Befehl) oder anstelle der Tabelle, die dort zuvor erstellt wurde, wobei deine Beschriftung und dein Label bleiben. Sie wird als neue Version des Dokuments gespeichert, wie deine eigenen Änderungen.

Eine Tabelle wird gespeichert, wenn du sie kopierst oder in ein Dokument einfügst. Ihr LaTeX trägt unmittelbar vor ihrem tabular die Zeile `% hydor:table <id>`: Behalte sie bei, damit die Prüfung vor einer Einreichung die Zahlen aus den Läufen neu berechnen und sagen kann, welche sich geändert haben. **Ergebnistabellen** im Menü (⋯) oben auf der Seite listet die gespeicherten Tabellen: Öffne eine, um sie erneut zu kopieren oder einzufügen, oder wähle **Neu berechnen**, um sie aus ihren Läufen im jetzigen Stand neu zu berechnen.

Für gepaarte Tests über Beispiele (Suchanfragen beim Retrieval, Sätze bei der Übersetzung) schreibt ein Lauf eine Datei mit Bewertungen pro Beispiel und gibt sie unter **Bewertungen pro Beispiel** an: JSON-Zeilen mit `id` (oder `qid`, `query`, `example`) und einer Zahl je Metrik, etwa `{"id": "q12", "ndcg@10": 0.53}`, oder Zeilen aus trec_eval -q. Sie kann `{name}`-Platzhalter enthalten wie der Befehl; die Datei wird beim Lauf aufbewahrt, wenn er endet.

## Sweeps

Ein Sweep ist ein Befehl mit einem Platzhalter für jeden Hyperparameter, der einmal für jede Kombination ihrer Werte ausgeführt wird. Klicke oben auf **Mehr** (⋯), dann auf [**Neuer Sweep**](/experiments?new=sweep) (oder auf **Neuer Sweep in diesem Experiment** im Menü eines Experiments oder auf **Ein Sweep** bei Neuer Lauf):

1. Gib den Befehl mit `{name}` an der Stelle ein, an die der Wert jedes Hyperparameters gehört: `python train.py --lr {lr} --batch {batch}`.
2. Gib unter **Hyperparameter und ihre Werte** jedem Hyperparameter seine Werte: `lr` und `0.001, 0.0003, 0.0001`. **Hyperparameter hinzufügen** ergänzt einen weiteren.
3. Wähle **Jede Kombination** oder **Eine Zufallsstichprobe** davon (**höchstens** N Läufe).
4. Um die Läufe zu stoppen, die nicht gewinnen werden, wähle unter **Metrik für vorzeitigen Abbruch** eine Metrik und die gewünschte Richtung: Ein Lauf, dessen Metrik bei einem Schritt schlechter als der Median der anderen Läufe bei diesem Schritt ist, wird gestoppt (**Vorzeitig gestoppt**), sobald drei andere diesen Schritt erreicht haben.
5. Gib seinem **Experiment** einen Namen und klicke auf **N Läufe starten**.

Die Läufe des Sweeps sind ein Experiment wie jedes andere: Seine Tabelle der Läufe hat eine Spalte je Hyperparameter, sein Tab **Diagramme** zeichnet die Kurven, und sein Tab **Hyperparameter** zeigt, wie der Sweep verlaufen ist: seinen besten Lauf (nach der gewählten Metrik, je mit dem besten oder letzten Wert jedes Laufs), welche Hyperparameter am wichtigsten sind und jeden einzelnen im Verhältnis zur Metrik. Von dort aus kannst du **Tabelle erstellen** oder **Die besten 6 vergleichen** wählen. Die Meldung, dass ein Sweep beendet ist, öffnet diesen Tab.

## Ausführungsorte

**Mehr** (⋯) oben → [**Ausführungsorte**](/experiments?places=1):

- **Dieser Computer**: seine GPUs und die Einstellung **Jobs ohne GPU: höchstens N gleichzeitig**.
- **Andere Computer**: verbundene Computer aus [Einstellungen → Computer](/settings?s=machines). Ein dort gestarteter Lauf wird dort gespeichert und überwacht: Sein zuständiger Agent und seine Meldungen gehören diesem Computer (seine Meldungen kommen zu dir hierher, wie alle von diesem Computer), und diese Seite verfolgt ihn. Die Liste hier zeigt auch die Läufe jedes verbundenen Computers, markiert mit ihrem Ausführungsort; Öffnen liest sie dort, und Stoppen stoppt sie dort.
- **Cluster**: per SSH erreichbare Computer, auf denen nichts installiert werden muss.

### Einen Cluster hinzufügen

Klicke auf [**Cluster hinzufügen**](/experiments?cluster=new) und gib an:

- **Name** und **SSH-Host**: so, wie du ihn hinter `ssh` eintippen würdest, ein Eintrag aus deiner `~/.ssh/config` oder `me@login.cluster.edu`. Der Server der App verbindet sich mit seinen eigenen SSH-Keys und fragt nie nach einem Passwort; dafür braucht er dort einen Key, der ohne Passwort funktioniert (`ssh-copy-id`), und der Host-Key des Clusters muss bekannt sein (verbinde dich einmal im Terminal mit `ssh`).
- **SLURM** oder **Einfaches SSH**.
- **Entfernter Ordner für Laufprotokolle** (zu Beginn `~/hydor-runs`) und bei SLURM seine **Partition** und sein **Konto**.
- **Vorbereitende Befehle**, die dort vor jedem Job laufen: `module load cuda/12.1`, `source ~/venvs/ml/bin/activate`.

**Überprüfen** führt `ssh host true` aus, dann bei SLURM `sinfo` (es listet die Partitionen) oder bei einfachem SSH `nvidia-smi` und tmux. **Hinzufügen** speichert den Cluster; in der Liste hat jeder Cluster **Überprüfen** und **Entfernen**.

Ein Job für einen Cluster läuft dort in einem Ordner (der Code muss bereits dort sein: Klone ihn dorthin). Bei **SLURM** schreibt die App ein Batchskript mit den Anforderungen des Jobs (seine GPUs als `--gres=gpu:N`, Prozessoren, Speicher, die Stunden als `--time`, Partition und Konto), deinen vorbereitenden Befehlen und dem Befehl und reicht es mit sbatch ein. Solange er wartet, nennt sein Status den Grund, mit dem Wort von SLURM und in einfachen Worten („Andere Jobs haben Vorrang (Priority)“). Die App verfolgt ihn mit squeue und sacct, kopiert sein Protokoll laufend hierher, und **Stoppen** bricht ihn mit scancel ab. Bei **einfachem SSH** werden die GPUs dort wie hier gewählt, und der Lauf geht dort in tmux. Pro Cluster bleibt eine SSH-Verbindung offen, sodass das Verfolgen der Läufe wenig kostet.

## Auf dem Smartphone

Es gibt keine Spalte: Die Übersicht beginnt mit der Warteschlange, den GPUs und **Experiment finden** und listet die Experimente als Karten auf. Ein Experiment und ein Lauf öffnen sich an ihrer Stelle, mit einem Zurück-Pfeil. Eine Tabelle der Läufe scrollt seitwärts, wobei Kästchen und Name jedes Laufs im Blick bleiben; die Läufe in den Diagrammen sind eine Reihe von Chips über ihnen, und **Glättung** steht im Menü **Diagrammoptionen**. Das Protokoll eines Laufs wird auf Bildschirmbreite umgebrochen, **Folgen** arbeitet wie am Computer. Neuer Lauf, Vergleich und Tabellen öffnen sich vom unteren Bildschirmrand.

## Frag einen Agenten

- „Trainiere das auf einer freien GPU und benachrichtige mich nach Abschluss.“
- „Führe eval.py auf dem Unity-Cluster mit 2 GPUs für 4 Stunden aus.“
- „Teste die Lernraten 1e-4, 3e-4 und 1e-3 mit den Seeds 1, 2 und 3 als Sweep. Stoppe schlechte Läufe vorzeitig.“
- „Warum ist mein letzter Lauf fehlgeschlagen? Ist die Korrektur eindeutig, starte ihn erneut.“
- „Lass einen Agenten diesen Trainingslauf überwachen. Bei Speichermangel soll er die Batchgröße halbieren und am letzten Checkpoint fortsetzen.“
- „Erstelle eine LaTeX-Tabelle der lora-Experimente mit Accuracy und F1 gegenüber der Baseline einschließlich Signifikanztests und füge sie in meine Paper ein.“
- „Welcher meiner Läufe dieser Woche hatte den besten Validierungsverlust und welche Hyperparameter wurden verwendet?“
- „Gib meinen Experimenten klarere Titel und Beschreibungen und sortiere sie in Kategorien ein.“
- „Welche Hyperparameter sind in meinem Lernraten-Sweep am wichtigsten für den Dev-Verlust?“
- „Zeig mir die Kurven der 5 besten Läufe des lora-Experiments.“
