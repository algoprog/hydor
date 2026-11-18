# Experimente

Experimente führt Trainings- und Evaluationsjobs für dich aus. Ein Job wartet, bis auf einem deiner Computer eine GPU mit genügend freiem Speicher verfügbar ist, oder bis er in der Warteschlange eines Clusters an der Reihe ist. Danach läuft er selbstständig. Dabei werden Code samt Änderungen, Einstellungen, Seed und Umgebung sowie Protokoll, Metriken und mögliche Eingriffe des zuständigen Agenten dokumentiert. Du kannst Läufe vergleichen oder eine Ergebnistabelle mit Signifikanztests für dein Paper erstellen. Auch Agenten nutzen diese Funktion: Bitte einen Agenten, etwas auf einer freien GPU zu trainieren oder auszuwerten. Er startet hier einen Lauf, während seine Unterhaltung verfügbar bleibt.

![System → Experimente: nach Experiment gruppierte Läufe, darüber Warteschlange und GPUs, daneben Protokoll und Metriken eines Laufs](images/experiments.webp)

## Experimente öffnen

Klicke in der Werkzeugleiste auf **System** und dann auf **Experimente** oder öffne [Experimente](/system/experiments). Die Karte **Experimente** in der [Systemübersicht](/system) zeigt aktive Läufe. Ein Klick öffnet den jeweiligen Lauf.

Die obere Zeile beschreibt die Warteschlange, etwa „2 laufen · 1 wartet auf eine GPU“. Daneben siehst du kleine Speicheranzeigen für die GPUs dieses Computers. Belegt einer deiner Läufe eine GPU, erscheint sie in der Akzentfarbe. Fährst du darüber, siehst du, wie stark sie ausgelastet ist und welcher Lauf sie belegt; ein Klick öffnet den Lauf.

Darunter stehen deine Läufe, nach Experiment gruppiert. Das Experiment mit dem neuesten Lauf steht zuerst. Jede Zeile zeigt den Namen des Laufs und rechts, wann er gestartet, beendet oder hinzugefügt wurde. Unter dem Namen stehen:

- Sein Status, ein Punkt und ein paar Worte, nach dem Ende mit der Dauer („Fertig nach 1 h 47 min“).
- Solange er läuft, wie weit er ist, wenn seine Ausgabe es verrät: ein kleiner Balken, „54%“ und ungefähr die verbleibende Zeit.
- Seine wichtigen Metriken: seine Kurven und die Metriken, die zeigen, wie gut er ist (Verlust, Accuracy, NDCG…), nie Verwaltungsangaben wie die Lernrate oder Token-Zahlen.
- Wo er läuft, wenn deine Läufe an mehr als einem Ort laufen, und die GPUs eines laufenden Laufs.

Die Statusangaben bedeuten:

- **Eingereiht**: Der Lauf wurde gerade hinzugefügt. **Warten auf eine GPU**, **Warten, bis ein Lauf endet** (Jobs ohne GPU kommen abwechselnd dran, wenige gleichzeitig: siehe [Ausführungsorte](#where-runs-go)), **Wartet** oder **In der Warteschlange des Clusters**: Der Lauf wäre an der Reihe, aber benötigte Ressourcen sind noch belegt. Beim Darüberfahren erfährst du den Grund.
- **Wird gestartet**, **Läuft seit 2 Std. 13 Min.**, **Anhalten**.
- **Fertig**: mit Exit-Code 0 beendet. Außerdem **Fehlgeschlagen**, **Angehalten**, **Vorzeitig gestoppt** für den vorzeitigen Abbruch innerhalb eines Sweeps und **Nicht mehr vorhanden**, etwa nach einem Computerneustart.

In jedem Experiment stehen zuerst die Läufe, die gerade laufen, dann die wartenden in der Reihenfolge, in der sie starten, dann die beendeten, der letzte zuerst. Die ersten 10 werden angezeigt: **N mehr anzeigen** zeigt den Rest. Klicke auf den Namen eines Experiments, um es einzuklappen (dieses Gerät merkt sich das); eingeklappt nennt seine Zeile weiterhin, wie viele seiner Läufe laufen und warten.

**Suchen** rechts oberhalb der Liste öffnet eine Suche nach Name, Experiment oder Befehl sowie Filter nach Status und Ausführungsort. **× N angezeigt** entfernt aktive Filter.

Sind noch keine Läufe vorhanden, erklärt die Seite die Funktion und bietet **Neuer Lauf** an. Alternativ kannst du einen Agenten bitten: „Trainiere das auf einer freien GPU und benachrichtige mich nach Abschluss.“

## Einen Lauf starten

1. Klicke oben rechts auf [**Neuer Lauf**](/system/experiments?new=1).
2. Trage den **Befehl** so ein, wie du ihn im Arbeitsordner ausführen würdest: `python train.py --lr 3e-4`.
3. Wähle den **Ordner** und den **Ausführungsort**: **Dieser Computer**, einen anderen deiner Computer oder einen Cluster; siehe [Ausführungsorte](#where-runs-go).
4. Lege die Anzahl der **GPUs** fest. Mit 0 läuft der Job ohne GPU. Unter **Freier Speicher je GPU (GB)** gibst du den Speicherbedarf an. Ohne Angabe wartet der Job auf eine vollständig ungenutzte GPU.
5. Vergib bei Bedarf einen **Namen**; ansonsten wird der Skriptname verwendet. Unter **Experiment** ordnest du den Lauf einer gemeinsamen Liste und Vergleichsgruppe zu.
6. Klicke auf **Starten**.

Unter **Weitere Optionen** findest du:

- **Einstellungen**: Zeilen im Format name=value, die mit dem Lauf gespeichert und in Tabellen verglichen werden. Die App erkennt außerdem Parameter im Befehl: `--name value`, `--name=value` und `name=value` hinter dem Programm, wie bei Hydra. `{name}` im Befehl wird durch den jeweiligen Einstellungswert ersetzt.
- **Seed**: `{seed}` übernimmt den Wert im Befehl; ein vorhandenes `--seed` wird ebenfalls erkannt. **Priorität**: Höhere Werte kommen zuerst. **Zeitlimit (Stunden)**: Danach wird der Lauf gestoppt.
- **Metrikdatei**: eine Datei mit Metriken als JSON-Zeilen zusätzlich zur Konsolenausgabe. **Bewertungen pro Beispiel**: eine Datei mit Einzelbewertungen; siehe [Ergebnistabellen für Papers](#results-tables-for-your-paper).
- **Benachrichtigungen**: **Bei Abschluss** und **Bei Fehlern** sind standardmäßig aktiviert. Optional gibt es **Wenn eine Metrik einen Schwellenwert überschreitet**, etwa „val_acc > 0.9“.
- **Überwachung durch einen Agenten**: siehe [Der zuständige Agent](#the-agent-on-call).
- Bei SLURM-Clustern zusätzlich **Prozessoren**, **Arbeitsspeicher (GB)** und **Partition**.

Anschließend öffnet sich der neue Lauf, damit du seinen Start verfolgen kannst.

## Wie die Warteschlange entscheidet

- Jobs werden nach Priorität und danach nach Wartezeit berücksichtigt. GPU-Jobs erhalten GPUs mit mindestens dem angeforderten freien Speicher, die kein anderer deiner Läufe belegt. Die GPU mit dem meisten freien Speicher kommt zuerst. Fehlen Ressourcen, zeigt die App den Grund, etwa „Wartet auf 1 GPU mit 20 GB freiem Speicher; aktuell höchstens 12 GB auf GPU 2 verfügbar; GPU 0 ist durch einen anderen deiner Läufe belegt“. Ein später eingereihter kleinerer Job darf vorher starten, wenn seine Ressourcen bereits frei sind.
- Jobs ohne GPU starten sofort, mit begrenzter Parallelität. Die Anzahl legst du unter [Ausführungsorte](#where-runs-go) fest. Der Standard ist ein Viertel der CPU-Threads, mindestens 1 und höchstens 4.
- Fordert ein Job mehr GPUs an, als vorhanden sind, oder eine GPU auf einem Computer ohne NVIDIA-GPU, schlägt er sofort mit einer Erklärung fehl.
- Ein Lauf sieht über CUDA_VISIBLE_DEVICES nur seine zugewiesenen GPUs. Ein Lauf ohne GPU sieht keine. Außerdem erhält er HYDOR_RUN als Kennung, HYDOR_RUN_DIR als Laufordner und HYDOR_SEED. PYTHONUNBUFFERED sorgt dafür, dass Python-Ausgaben sofort im Protokoll erscheinen.
- Läufe bleiben bei Neustarts oder Updates der App in tmux aktiv, ohne tmux als Hintergrundprozesse. Nach dem Neustart findet die App sie wieder, liest zwischenzeitliche Ausgaben und erkennt beendete Prozesse. Ein verschwundener Prozess erhält den Status **Nicht mehr vorhanden**.

## Was ein Lauf aufzeichnet

- **Code**: Beim Start werden Commit, Branch und noch nicht committete Git-Änderungen des Arbeitsordners erfasst. Nicht eingecheckte Änderungen werden als Patch gespeichert, ohne Binärdateien und bis höchstens 2 MB. Hinzu kommt die Anzahl nicht von Git erfasster Dateien.
- **Umgebung**: Computer, verwendete Python-Version und installierte Versionen von PyTorch, Transformers, JAX, TensorFlow und NumPy. Dafür werden Paketmetadaten gelesen, keine Pakete importiert. Bei GPU-Nutzung kommen CUDA- und Treiberversion sowie GPU-Namen hinzu.
- **Einstellungen und Seed**, **Protokoll**, **Exit-Code** und ein eigener Ordner in den App-Daten mit Protokoll, Patch, Exit-Code und Metriken.
- **Metriken** aus der laufenden Ausgabe: `key=value`-Paare wie `loss=0.42`, JSON-Objekte pro Zeile wie `{"step": 100, "loss": 0.42}`, ausgegebene Python-Dictionaries wie beim Hugging-Face-Trainer, Keras-Ausgaben wie „loss: 0.41 - accuracy: 0.87“ und die Metrikdatei. Der Schritt wird aus `step`, `global_step`, `iter` oder `epoch` gelesen. Für jede Metrik speichert die App den letzten und den besten Wert sowie eine Zeitreihe. Bei Verlust, Fehler, Perplexität und ähnlich benannten Metriken gelten kleinere Werte als besser, bei anderen größere. Eine Metrik, die er immer wieder ausgibt, ist eine Kurve; eine Zahl, die er nur einmal ausgibt, ist ein Wert (seine Einstellungen am Anfang, seine Ergebnisse am Ende). Es werden bis zu 100 Metriken gespeichert: Gibt ein Lauf mehr aus, bleiben seine Kurven vor den Zahlen, die er nur einmal ausgegeben hat.
- **Wie weit er ist**, wenn seine Ausgabe es verrät: ein Fortschrittsbalken (der von tqdm, wie ihn der Trainer von Hugging Face zeichnet, oder einer, der nach Training oder Schritten benannt ist), „step 120/1000“ oder eine Gesamtzahl von Schritten, die er ausgibt (`total_steps`, `max_steps`, `num_training_steps`…), neben seinen Schritten.

## Die Detailseite eines Laufs

Klicke auf einen Lauf. Auf breiten Bildschirmen öffnet er sich neben der Liste, auf schmalen an ihrer Stelle mit einem Zurück-Pfeil.

- Oben stehen Name und Aktionen: **Stoppen** während der Ausführung oder Wartezeit, **Erneut ausführen** zum Öffnen eines vorausgefüllten neuen Laufs und **Mehr** (⋯) mit **Befehl kopieren**, **Arbeitsordner in Dateien öffnen**, **Im Finder anzeigen**, **Im Datei-Explorer anzeigen** oder **Im Ordner anzeigen** (in der Desktop-App; siehe [Mit Dateien und Ordnern arbeiten](/guide/files-git#work-with-files-and-folders)) und nach Abschluss **Datensatz löschen**. Das Löschen entfernt Aufzeichnung, Protokoll, Patch und Metriken. Vom Job im Arbeitsordner erzeugte Dateien bleiben erhalten.
- Darunter siehst du Status und Begründung, Ausführungsort sowie Start- und Endzeit. Solange der Lauf läuft, siehst du, wie weit er ist, wenn seine Ausgabe es verrät: ein Balken, die erledigten Schritte von allen („5.900 von 10.878 · 54%“) und ungefähr die verbleibende Zeit, berechnet aus der bisherigen Dauer.
- **Metriken** zeigt jede Metrik, die der Lauf mehrfach ausgegeben hat, über die Schritte hinweg, die aussagekräftigsten zuerst (Verlust und Scores vor Lernrate, Geschwindigkeit und Speicher), mit letztem und bestem Wert. **Alle N** blendet mehr als vier Metriken ein.
- **Werte** zeigt die Zahlen, die der Lauf nur einmal ausgegeben hat, nach Namen: seine Einstellungen am Anfang, seine Ergebnisse am Ende. **Alle N** blendet mehr als zwölf ein, mit einem Feld, um einen Wert nach Namen zu finden. Ein Lauf ohne Kurven, etwa eine Evaluation, die ihre Ergebnisse einmal ausgibt, zeigt seine Werte zuerst.
- **Protokoll** zeigt die Ausgabe, neueste Zeilen unten. **Folgen** hält bei laufenden Jobs die neueste Ausgabe im Blick. Scrollst du nach oben, wird das automatische Nachführen unterbrochen.
- **Ausführung** zeigt Befehl, Ordner, Commit, Branch, Patch über **Änderungen ansehen**, Einstellungen, Seed und Umgebung sowie den ursprünglichen Lauf bei Wiederholungen und die Sitzung, die ihn gestartet hat.
- **Ereignisse** zeigt mit Zeitstempeln Wartezeit, Start und Ende sowie Beobachtungen und Eingriffe des zuständigen Agenten. **Sitzung öffnen** führt zu deren Unterhaltung.

**Stoppen** sendet zunächst Strg+C an die Programme. Nach zehn Sekunden werden noch aktive Prozesse zwangsweise beendet. Wartende Läufe werden sofort aus der Warteschlange entfernt.

## Der zuständige Agent

Unter **Weitere Optionen** → **Überwachung durch einen Agenten**:

- **Aus**, die Voreinstellung: Probleme werden weiterhin auf der Laufseite erfasst.
- **Benachrichtige mich**: Du erhältst bei einem Problem eine Benachrichtigung.
- **Durch Agenten prüfen lassen**: Ein Agent startet eine Sitzung im Arbeitsordner. Er erhält das Ereignis, das Ende des Protokolls, die Laufaufzeichnung und deine Vorgaben unter **Was der Agent tun darf**. Innerhalb dieses Rahmens handelt er und berichtet anschließend kurz über Ursache und Maßnahmen. Die Laufseite verlinkt seine Sitzung.

Standardmäßig überwacht er alle folgenden Fälle; du kannst einzelne abwählen: **NaN**, wenn eine Metrik NaN oder unendlich wird oder ein NaN-Verlust im Protokoll erscheint; **Nicht genügend Speicher** bei CUDA-Fehlern, `OutOfMemoryError` oder Exit-Code 137; **Stillstand** ohne neue Ausgabe seit 30 Minuten oder der von dir gewählten Dauer; **Ein Absturz** bei Exit-Codes ungleich 0 oder einem unerwartet beendeten Prozess; **Divergenz**, wenn der Verlust fünf Messungen in Folge mehr als doppelt so hoch wie sein bisheriger Bestwert ist.

Ohne eigene Vorgaben gilt sinngemäß: „Lies Protokoll und Code. Ist eine Korrektur eindeutig und sicher, starte den Lauf mit experiment_run erneut, wenn möglich vom letzten Checkpoint. Ändere so wenig wie möglich. Lösche niemals Dateien oder Checkpoints. Berichte dem Nutzer anschließend kurz, was passiert ist und was du getan hast.“ Zuständig ist der Agent, der den Lauf gestartet hat. Wurde er manuell gestartet, gelten Agent und Modell, die du zuletzt auf der Startseite gewählt hast. Pro Lauf untersucht nur ein Agent gleichzeitig das Problem. Höchstens drei solche Einsätze werden pro Stunde gestartet; danach erhältst du stattdessen eine Benachrichtigung.

## Benachrichtigungen

Du erhältst Nachrichten bei Abschluss oder Fehlern, sofern aktiviert, bei überschrittenen Metrikschwellen und vom zuständigen Agenten. Ein Klick öffnet den Lauf. Ein Sweep meldet sich einmal nach Abschluss aller Läufe und nennt seinen besten Lauf. Innerhalb von zehn Minuten werden höchstens acht Laufbenachrichtigungen gesendet. Weitere fasst die App mit ihrer Anzahl zusammen.

Startet ein Agent einen Lauf mit der Bitte um Rückmeldung nach Abschluss, also report, erhält auch die ursprüngliche Sitzung eine Nachricht. Der Agent kann dann dort weiterarbeiten.

## Läufe vergleichen

Markiere die gewünschten Läufe (das Kästchen erscheint, wenn du auf einen Lauf zeigst, und bei jedem Lauf, sobald du einen markiert hast). Unten erscheint eine Leiste mit **Vergleichen**, **Tabelle erstellen** und × zum Aufheben der Auswahl. **Vergleichen** zeigt je Metrik, die die Läufe mehrfach ausgegeben haben, ein Diagramm mit einer Linie pro Lauf, die Werte, die sie nur einmal ausgegeben haben, in einer Tabelle mit dem besten Wert jeder Zeile in Fett, und die Einstellungen der Läufe nebeneinander; Unterschiede werden hervorgehoben.

Das Menü (⋯) eines Experiments bietet **Tabelle erstellen** aus abgeschlossenen Läufen, **Die letzten 6 vergleichen** und **Alle auswählen**.

## Ergebnistabellen für Papers

**Tabelle erstellen** aus der Auswahl oder dem Experimentmenü öffnet eine konfigurierbare Tabelle:

- **Spalten**: Wähle die Metriken durch Anklicken. Der Pfeil legt fest, ob größere oder kleinere Werte besser sind.
- **Zeilen**: **Nach Experiment** oder nach einer Einstellung, die sich zwischen Läufen unterscheidet, etwa **Nach lr**.
- **Grundlinie**: die Zeile, gegen die die anderen getestet werden (die erste Zeile, wenn du keine auswählst).
- **Mit der Baseline vergleichen**: **Automatisch wählen** verwendet gepaarte Tests über Beispiele, wenn Einzelbewertungen vorliegen, andernfalls gepaarte Tests über gemeinsame Seeds und sonst einen Welch-t-Test über Seeds. Manuell verfügbar sind **Welch-t-Test über Seeds**, **Gepaarter t-Test (nach Seed oder Beispiel)**, **Gepaarter Bootstrap über Beispiele** und **Kein Test**.
- **Beschriftung**.

Jede Zelle zeigt Mittelwert ± Standardabweichung über die Läufe beziehungsweise Seeds ihrer Zeile. Der beste Wert jeder Spalte wird fett dargestellt. Ein Kreuz (†) kennzeichnet Werte, die nach Holm-Korrektur für mehrere Zeilen bei p < 0,05 besser als die Baseline sind. Beim Darüberfahren erscheinen die p-Werte. Unter der Tabelle stehen verwendeter Test und ausgeschlossene Läufe, etwa noch aktive Läufe oder solche ohne die nötigen Metriken.

Anschließend kannst du:

- **LaTeX kopieren**: erzeugt eine `table` mit booktabs-Linien. Ergänze `\usepackage{booktabs}` in der Präambel. Bestwerte verwenden `\textbf`, dazu kommen `$\pm$`, Signifikanzzeichen und eine erklärende Beschriftung.
- **Markdown kopieren** oder **CSV herunterladen**: mit Mittelwert, Standardabweichung, Laufanzahl und p-Werten je Metrik.
- **In ein LaTeX-Dokument einfügen**: Wähle ein LaTeX-Dokument aus der [Bibliothek](/library) und eine seiner Dateien. Die Tabelle wird vor `\end{document}` eingefügt, bei Dateien ohne diesen Befehl am Ende. Eine zuvor dort von der App erstellte Tabelle wird ersetzt; deine Beschriftung und dein Label bleiben erhalten. Wie bei eigenen Änderungen entsteht eine neue Dokumentversion.

Beim Kopieren oder Einfügen wird die Tabelle gespeichert. Im LaTeX steht unmittelbar vor tabular die Zeile `% hydor:table <id>`. Behalte sie bei, damit die Prüfung vor einer Einreichung Werte aus den Läufen neu berechnen und Änderungen erkennen kann. **Ergebnistabellen** im oberen Menü (⋯) listet gespeicherte Tabellen. Du kannst sie erneut kopieren oder einfügen oder mit **Neu berechnen** aus dem aktuellen Stand der Läufe aktualisieren.

Für gepaarte Tests über Beispiele, etwa Suchanfragen oder übersetzte Sätze, schreibt ein Lauf eine Datei mit Einzelbewertungen. Gib sie unter **Bewertungen pro Beispiel** an. Diese enthält JSON-Zeilen mit `id`, alternativ `qid`, `query` oder `example`, und einem Zahlenwert je Metrik, etwa `{"id": "q12", "ndcg@10": 0.53}`. Auch Zeilen aus trec_eval -q sind möglich. Wie im Befehl sind `{name}`-Platzhalter erlaubt. Nach Abschluss wird die Datei beim Lauf aufbewahrt.

## Sweeps

Ein Sweep führt denselben Befehl mit unterschiedlichen Parameterwerten aus, einmal für jede gewählte Kombination. Öffne oben **Mehr** (⋯) → [**Neuer Sweep**](/system/experiments?new=sweep) oder wähle beim neuen Lauf **Ein Sweep**:

1. Setze im Befehl `{name}` an die Stelle jedes Parameterwerts: `python train.py --lr {lr} --batch {batch}`.
2. Trage unter **Einstellungen und ihre Werte** zum Beispiel `lr` und `0.001, 0.0003, 0.0001` ein. **Einstellung hinzufügen** ergänzt weitere Parameter.
3. Wähle **Jede Kombination** oder **Eine Zufallsstichprobe** mit **höchstens** N Läufen.
4. Um wenig aussichtsreiche Läufe früh zu stoppen, wähle unter **Metrik für vorzeitigen Abbruch** eine Metrik und die gewünschte Richtung. Ein Lauf wird **vorzeitig gestoppt**, wenn sein Wert bei einem Schritt schlechter als der Median der anderen Läufe an diesem Schritt ist und mindestens drei andere Läufe den Schritt erreicht haben.
5. Benenne das **Experiment** und klicke auf **N Läufe starten**.

Die Läufe erscheinen gemeinsam unter dem Experiment. **Sweep** neben seinem Namen öffnet die Auswertung: Verlauf und bester Lauf nach der gewählten Metrik, wahlweise mit letztem oder bestem Wert. Für jeden Parameter zeigt ein Diagramm einen Punkt pro Lauf; bei weit auseinanderliegenden Werten wie Lernraten verwendet es eine logarithmische Skala. Der beste Lauf ist umrandet. Von dort kannst du **Tabelle erstellen** oder **Die besten 6 vergleichen** wählen.

## Ausführungsorte

Öffne oben **Mehr** (⋯) → [**Ausführungsorte**](/system/experiments?places=1):

- **Dieser Computer**: seine GPUs und die Einstellung **Jobs ohne GPU: höchstens N gleichzeitig**.
- **Andere Computer**: verbundene Computer aus [Einstellungen → Computer](/settings?s=machines). Ein dort gestarteter Lauf wird dort gespeichert und überwacht. Auch zuständiger Agent und Benachrichtigungen laufen dort; die Nachrichten werden hier zugestellt. Die Liste zeigt Läufe aller verbundenen Computer mit ihrem Ausführungsort. Öffnen liest die dortigen Daten, Stoppen beendet den Lauf dort.
- **Cluster**: per SSH erreichbare Computer, auf denen keine zusätzliche Installation nötig ist.

### Einen Cluster hinzufügen

Öffne [**Cluster hinzufügen**](/system/experiments?cluster=new) und trage Folgendes ein:

- **Name** und **SSH-Host**: wie hinter `ssh`, etwa einen Eintrag aus `~/.ssh/config` oder `me@login.cluster.edu`. Der App-Server nutzt seine eigenen SSH-Keys und fragt kein Passwort ab. Dafür muss ein ohne Passwort nutzbarer Key eingerichtet sein, etwa mit `ssh-copy-id`. Der Host-Key des Clusters muss ebenfalls bekannt sein; verbinde dich dazu einmal im Terminal mit `ssh`.
- **SLURM** oder **SSH ohne Scheduler**.
- **Entfernter Ordner für Laufprotokolle**, standardmäßig `~/hydor-runs`, sowie bei SLURM **Partition** und **Konto**.
- **Vorbereitende Befehle**, die vor jedem Job laufen, etwa `module load cuda/12.1` und `source ~/venvs/ml/bin/activate`.

**Prüfen** führt zunächst `ssh host true` aus. Bei SLURM folgt `sinfo` zur Auflistung der Partitionen, bei reinem SSH werden `nvidia-smi` und tmux geprüft. **Hinzufügen** speichert den Cluster. In der Liste gibt es je Cluster **Prüfen** und **Entfernen**.

Cluster-Jobs laufen in einem dortigen Ordner. Der Code muss bereits vorhanden sein, beispielsweise durch Klonen des Repositorys. Für **SLURM** erstellt die App ein Batchskript mit GPU-Anzahl als `--gres=gpu:N`, Prozessoren, Speicher, Zeitlimit als `--time`, Partition, Konto, Vorbereitungsbefehlen und dem eigentlichen Befehl. Anschließend reicht sie es mit sbatch ein. Während der Wartezeit erklärt der Status den SLURM-Grund verständlich, etwa „Andere Jobs haben Vorrang (Priority)“. Die App verfolgt den Job mit squeue und sacct, kopiert laufend sein Protokoll und beendet ihn über **Stoppen** mit scancel. Bei **SSH ohne Scheduler** wählt sie GPUs wie auf dem lokalen Computer und startet den Lauf dort in tmux. Pro Cluster bleibt eine SSH-Verbindung offen, um die Überwachung schlank zu halten.

## Auf dem Smartphone

Die Liste füllt den Bildschirm; Status und Metriken jedes Laufs stehen in so vielen Zeilen, wie sie brauchen, und das Kästchen zum Markieren eines Laufs ist immer sichtbar. Ein geöffneter Lauf ersetzt die Liste und bietet einen Zurück-Pfeil. Das Protokoll wird auf Bildschirmbreite umgebrochen, **Folgen** arbeitet wie am Computer. Neuer Lauf, Vergleich und Tabellen öffnen sich vom unteren Bildschirmrand.

## Frag einen Agenten

- „Trainiere das auf einer freien GPU und benachrichtige mich nach Abschluss.“
- „Führe eval.py auf dem Unity-Cluster mit 2 GPUs für 4 Stunden aus.“
- „Teste die Lernraten 1e-4, 3e-4 und 1e-3 mit den Seeds 1, 2 und 3 als Sweep. Stoppe schlechte Läufe vorzeitig.“
- „Warum ist mein letzter Lauf fehlgeschlagen? Ist die Korrektur eindeutig, starte ihn erneut.“
- „Lass einen Agenten diesen Trainingslauf überwachen. Bei Speichermangel soll er die Batchgröße halbieren und am letzten Checkpoint fortsetzen.“
- „Erstelle eine LaTeX-Tabelle der lora-Experimente mit Accuracy und F1 gegenüber der Baseline einschließlich Signifikanztests und füge sie in meine Paper ein.“
- „Welcher meiner Läufe dieser Woche hatte den besten Validierungsverlust und welche Einstellungen wurden verwendet?“
