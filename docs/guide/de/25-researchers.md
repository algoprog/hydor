# Forschung: Papers, Schreiben und Laborarbeit

Hydor unterstützt dein Paper: fachlich auf dem Laufenden bleiben, Papers lesen und organisieren, eigene Arbeiten vor der Einreichung prüfen, auf Gutachten antworten, Ergebnisse präsentieren sowie Experimente und Berichte im Labor verwalten. Vieles findest du als vorgefertigte Apps unter **Forschung**, **Schreiben**, **Labor** und **Arbeit** auf der [Apps-Seite](/apps). Agenten können diese Apps auf Wunsch ebenfalls ausführen. Prüfungen für Papers stehen im [LaTeX-Editor](/guide/library), Trainingsläufe unter [System → Experimente](/guide/experiments). Für die Begutachtung fremder Einreichungen eignet sich eine [vertrauliche Sitzung](/guide/sessions#keep-a-session-confidential).

![Forschungs-Apps auf der Apps-Seite](images/researchers.webp)

## Im Fachgebiet auf dem Laufenden bleiben

Sechs fertige Apps halten dich in deinem Fachgebiet auf dem Laufenden: Du findest sie auf der Seite „Apps“ unter **Forschung** (öffne [Apps](/apps) und wähle den Filter **Forschung**). Fünf davon öffnen sich auf einer eigenen Seite und können sich jeden Tag von selbst aktualisieren: **Paper-Radar**, **Benachrichtigungen über Zitierungen**, **Neue Modelle beobachten**, **Deadline-Radar** und **Fortlaufender Forschungsüberblick**. Die sechste, **Lückenfinder**, läuft, wenn du sie anforderst, mit einem Formular, und Agenten können sie in jeder Sitzung für dich ausführen.

Die Apps greifen schonend auf offene Dienste zu: arXiv, OpenAlex, Semantic Scholar, Hugging Face sowie die Terminlisten ccfddl und ai-deadlines auf GitHub. Keys sind nicht erforderlich, helfen aber bei zwei Diensten: Mit einem kostenlosen **OpenAlex API Key** nutzt du dein eigenes Kontingent. Ohne Key erfolgen höchstens zwei OpenAlex-Abfragen je Aktualisierung aus einem kleinen, im Netzwerk gemeinsam genutzten Kontingent. Ein kostenlos auf Anfrage erhältlicher **Semantic Scholar API Key** verbessert die Verfügbarkeit. Ohne ihn antwortet oft stattdessen OpenAlex, allerdings ohne die Sätze, in denen deine Arbeit zitiert wird. Hinterlege die Keys in den App-Einstellungen über die Schieberegler oben unter **Erforderliche Keys**. Sie liegen im Tresor und werden ausschließlich an diese Dienste gesendet.

Auf der eigenen App-Seite erstellt **Aktualisieren** sofort eine neue Ausgabe. Die Schieberegler öffnen Einstellungen für **Täglich aktualisieren** (zunächst aus), Uhrzeit und Fragen. Unter **Frühere** findest du ältere Ausgaben in ihrem damaligen Zustand. Vor der ersten Ausgabe fragt die App nur notwendige Angaben ab, etwa deinen Autorennamen oder Konferenzen. **Erste Ausgabe erstellen** speichert deine Antworten als Einstellungen. Sobald die tägliche Aktualisierung aktiv ist, erscheint die App auch unter Einstellungen → Geplante Aufgaben; siehe [Geplante Aufgaben](/guide/tasks).

### Paper-Radar

[Paper radar](/apps/t/paper-radar) zeigt dir morgens neue Papers aus deinem Fachgebiet, nach Relevanz für deine Arbeit sortiert. Zu jeder stehen eine kurze Beschreibung und der Grund ihrer Relevanz.

- **Quellen**: neue arXiv-Papers aus deinen Kategorien, höchstens einige Hundert aus den letzten drei Tagen oder nach einer Pause mehr. Dazu kommen thematisch passende Arbeiten aus anderen Kategorien, Papers beobachteter Personen und thematisch passende OpenAlex-Einträge aus Zeitschriften und Konferenzbänden. Bereits geprüfte Papers erscheinen nicht erneut.
- **Relevanz**: Maßstab sind deine Projekte mit Namen, Beschreibungen und letzten Sitzungen, deine Themen und dein Profil. Bei aktivierter [Bedeutungssuche](/settings?s=memory&find=Search%20by%20meaning) verwendet die App das lokale Embedding-Modell, andernfalls Wörter. Gespeicherte Arbeiten erhöhen das Gewicht ähnlicher Arbeiten; verworfene senken es. Papers beobachteter Personen stehen immer zuerst.
- **Ansicht**: Unter **Heute** sind die Papers nach dem jeweils passendsten Projekt oder Thema gruppiert. Oben kannst du ein Thema oder **Alle** wählen. Jede Karte zeigt Veröffentlichungsort und -datum, verlinkten Titel, Autoren, Kurzbeschreibung und Relevanz. Aktionen: **☆ Speichern**, **Zitieren** zum Kopieren von BibTeX, **PDF**, **Vertiefen** für einen [ausführlichen Recherchebericht](/apps/t/deep-research) von wenigen Minuten sowie **Nicht für mich** zum Einklappen mit **Rückgängig**. **Gespeicherte Papers** zeigt deine Auswahl, neueste zuerst, mit **Alles als BibTeX kopieren** und je Eintrag **Zitieren**, **Zur Leseliste hinzufügen**, **Vertiefen** und **Entfernen**.
- **Einstellungen**: **Fachgebiete** als arXiv-Name oder Code, etwa Information Retrieval oder cs.IR und Computation and Language oder cs.CL; unbekannte Kategorien gelten als Themen. Dazu **Themen** und **Beobachtete Personen**, jeweils ein Eintrag pro Zeile und Namen wie in den Papers, sowie **Anzahl Papers**, standardmäßig 15, möglich sind 5 bis 40. Ohne Angaben leitet die App Fachgebiete und Themen aus Profil und Projekten ab.

Eine Aktualisierung stellt dem Hilfsmodell ein oder zwei kurze Anfragen zur Bedeutung der Arbeiten für dich und dauert etwa ein bis zwei Minuten.

### Benachrichtigungen über Zitierungen

[Citation alerts](/apps/t/citation-alerts) zeigt neue Zitate deiner Papers seit der letzten Prüfung: mit dem zitierenden Satz und der Einordnung, ob die Arbeit auf deiner aufbaut, sie vergleicht, ihr widerspricht oder sie erwähnt.

- **Ansicht**: **Neu** gruppiert neue Zitate nach deiner zitierten Paper. Das Hilfsmodell ordnet den Satz als **baut darauf auf**, **vergleicht**, **widerspricht** oder **erwähnt** ein; oben kannst du danach filtern. Du siehst den Satz mit markiertem Verweis, eine kurze Erklärung sowie die zitierende Arbeit mit Link, Autoren, Ort und Datum. **Satz kopieren** übernimmt ihn in die Zwischenablage. **Deine Papers** zeigt Zitationszahlen und neue Zitate.
- **Suche**: Die App findet dich in Semantic Scholar, bei Überlastung in OpenAlex. Sie prüft je Aktualisierung bis zu dreißig deiner meistzitierten und neuesten Arbeiten mit Zitaten auf neue Verweise. Bekannte Zitate werden gespeichert; anfangs gelten nur die aus dem letzten Monat als neu. Fehlt der zitierende Satz, hat der Dienst die Arbeit nicht vollständig gelesen.
- **Ihre Einstellungen**: **Du als Autor** (dein Name, wie ihn deine Papers drucken, oder deine Semantic-Scholar-ID, Ziffern, oder OpenAlex-ID, A und Ziffern) und **Nur diese Papers** (Titel, DOIs oder arXiv-IDs, eine pro Zeile; leer: alle deine). Einmal pro Woche reicht den meisten Menschen: Schalte **Jeden Tag aktualisieren** ein oder bitte einen Agenten, es wöchentlich zu machen.

### Neue Modelle beobachten

[New-model watch](/apps/t/new-model-watch) beobachtet Hugging Face nach neuen Modellen eines Typs, etwa Rerankern oder Embedding-Modellen. Die App prüft deine Grenzen und führt deine eigene Auswertung aus, damit du von Modellen erfährst, die deinen bisherigen Bestwert übertreffen.

- **Auswahl**: neueste Modelle des gewünschten Typs mit deinen Suchwörtern im Namen. Sie müssen das Mindestalter erreichen, standardmäßig sieben Tage, und bis dahin genügend Downloads haben. Pro Aktualisierung kommen die acht meistgeladenen infrage; weitere warten. Kopien in anderen Formaten wie GGUF, ONNX oder quantisierte Varianten bleiben außen vor, sofern du sie nicht ausdrücklich suchst. Modellseite und Model Card liefern Lizenz, Größe und Beschreibung. Nicht passende Lizenzen oder Größen werden ausgeschlossen.
- **Deine Auswertung**: Hinterlege einen Befehl mit `{model}` für den Modellnamen, etwa `python eval.py --model {model}`, den Ordner, die ausgegebene Metrik wie `ndcg@10`, die bevorzugte Wertrichtung und deinen Bestwert. Jedes geeignete Modell wird in [Experimente](/system/experiments) in der Gruppe „Neue Modelle beobachten“ mit je einer GPU eingereiht. Bei einem neuen Bestwert erhältst du eine Nachricht; die nächste Aktualisierung liest die Resultate. Ohne Befehl werden nur neue Modelle aufgelistet.
- **Ansicht**: **Modelle** zeigt Zustand (**neu**, **in Auswertung**, **ausgewertet**, **Bestwert übertroffen**, **nicht ausgeführt**, **übersprungen**, **zu neu**), Beschreibung, Größe, Lizenz, Downloads, Likes und Ergebnis. Bessere Modelle stehen zuerst. **Deine Auswertung** zeigt den Befehl und **Experimente öffnen**.

### Deadline-Radar

[Deadline radar](/apps/t/deadline-radar) bündelt Einreichungsfristen deiner Konferenzen in deiner Zeitzone, erinnert dich vorher und verlinkt Call for Papers, Seitenlimit und Vorlage.

- **Termine**: Grundlage sind die zusammengeführten offenen GitHub-Listen ccfddl und ai-deadlines. Die App rechnet von der angegebenen Zeitzone, häufig AoE beziehungsweise Anywhere on Earth mit UTC−12, in die Zeitzone deines Browsers um.
- **Ansicht**: **Zeitleiste** zeigt kommende Fristen mit lokalem Datum und Uhrzeit, gefordertem Inhalt, Konferenzort, Links zu **Call for Papers** und **Vorlage**, Seitenlimit und verbleibender Zeit. Die nächste Abstract- oder Paper-Frist jeder Konferenz ist hervorgehoben. Oben kannst du nach Konferenz filtern. **Fristen kopieren** kopiert die Liste, **Vergangene anzeigen** die letzten Monate. **Konferenzen** zeigt Rang, nächste Frist, Website und auch Namen, die keine Liste kennt.
- **Erinnerungen**: Jede Aktualisierung schickt dir eine Benachrichtigung zu den Deadlines an den Tagen, die du angegeben hast (14, 3 und 1, wenn du sie nicht änderst), jede Erinnerung einmal, alle in einer Benachrichtigung. Schalte **Jeden Tag aktualisieren** ein, damit sie rechtzeitig kommen.
- **Einstellungen**: **Deine Konferenzen** enthält kommagetrennte Namen wie SIGIR, ACL, EMNLP, NeurIPS, The Web Conference oder KDD. **Erinnern** enthält kommagetrennte Tage vor der Frist; leer deaktiviert Erinnerungen. Seitenlimit und Vorlage ermittelt die App durch eine einmalige Suche und das Lesen des Calls je Konferenz mit dem Hilfsmodell.

### Fortlaufender Forschungsüberblick

[Living related work](/apps/t/living-related-work) pflegt für jedes deiner Themen eine wachsende Seite mit neuen Papers: zusammengefasst, eingeordnet, thematisch gruppiert und als neu markiert.

- **Erweiterung**: Anfangs werden die relevantesten und neuesten arXiv-Arbeiten des letzten Jahres sowie meistzitierte OpenAlex-Arbeiten gesucht, danach nur Neuerscheinungen. Arbeiten, die deine Seed-Paperen zitieren, ergänzen jedes Thema. Das Hilfsmodell wählt zitierwürdige Arbeiten aus, fasst sie in einem Satz zusammen, erklärt den Bezug zum Thema und deinen Seeds und ordnet sie einem Schwerpunkt zu.
- **Ansicht**: **Verwandte Arbeiten** zeigt je Thema die Papers nach Schwerpunkt, jeweils neueste zuerst. Ergänzungen der letzten Aktualisierung tragen **Neu**; oben kannst du ein Thema wählen. Jeder Eintrag hat einen Zitier-Key, **BibTeX** zum Kopieren und **Nicht relevant** zum dauerhaften Entfernen aus dem Thema. **Abschnitt zu verwandten Arbeiten entwerfen** lässt einen Agenten LaTeX schreiben: ein Absatz je Schwerpunkt mit `\cite`-Keys deiner Papers. Nach wenigen Minuten erscheinen **LaTeX kopieren** und **.bib kopieren**; die Erstellung läuft beim Verlassen weiter. **BibTeX exportieren** sammelt alle Einträge des Themas. **Diesmal neu** zeigt Ergänzungen der letzten Aktualisierung.
- **Einstellungen**: **Themen** sowie **Seed-Paperen** als Titel, arXiv-IDs oder DOIs, jeweils pro Zeile. **Höchstens Papers je Thema** steht zunächst auf 80.

### Lückenfinder

[Gap finder](/apps/t/gap-finder) verbindet deine Papers mit aktuellen Arbeiten eines Fachgebiets, entwickelt daraus Projektideen, sucht Vorarbeiten und schätzt den Ressourcenbedarf. Es startet über ein Formular oder durch einen Agenten in einer Sitzung.

- **Eingaben**: **Deine Papers** als Autorenname zur Suche nach neuesten und meistzitierten Arbeiten oder als Titel beziehungsweise arXiv-IDs pro Zeile. Dazu **Fachgebiet** in Worten oder als arXiv-Kategorie, etwa conversational search oder cs.IR, **Verfügbare Rechenleistung**, standardmäßig eine GPU mit 24 GB, und **Anzahl Ideen**, standardmäßig fünf.
- **Ablauf**: Die App liest deine und die im letzten Monat erschienenen Papers, ordnet deren Relevanz ein und lässt das Hilfsmodell kombinierte Ideen entwickeln. Für jede sucht sie in arXiv und Semantic Scholar nach Vorarbeiten. Das Modell bewertet **neu**, **teilweise umgesetzt** oder **bereits umgesetzt** mit der ähnlichsten Arbeit, dem ersten Experiment und dessen Ressourcenbedarf. Es nennt, ob die Idee **passt**, **knapp** oder **zu groß** ist.
- **Ansicht**: **Forschungsideen** zeigt neue Ideen zuerst und lässt nach Urteil filtern. Jede nennt verbundene Arbeiten, Begründung, ähnlichste Vorarbeit mit Link, erstes Experiment und Kosten. **Planen** öffnet Forschung sprint mit der Idee als Forschungsfrage, **Vertiefen** einen Recherchebericht zum Umfeld, **Kopieren** übernimmt die Idee. **Verglichene Arbeiten** listet die verwendeten eigenen und aktuellen Papers.

## Papers lesen und organisieren

Drei Apps unter **Forschung** auf der [Apps-Seite](/apps) unterstützen deine Lektüre: **Leseliste** verwaltet Arbeiten, **Literaturmatrix** vergleicht sie tabellarisch und **Paper reproduzieren** überprüft Ergebnisse durch Ausführen des Codes. Öffne sie dort oder beschreibe deinen Wunsch in einer Sitzung, etwa „Füge 1706.03762 meiner Leseliste hinzu“. Der Agent führt die App aus; siehe [Eine App durch einen Agenten ausführen lassen](/guide/apps#have-an-agent-run-an-app-for-you).

Als Angaben funktionieren DOI, arXiv-ID, Link zu arXiv, DOI, ACL Anthology, OpenReview, Verlagsseite oder PDF, ein Titel oder eine lokale PDF-Datei. Gelesen werden nur frei zugängliche Fassungen von arXiv, über OpenAlex oder der eigenen Papersseite. Paywalls werden nicht umgangen. Ohne offene Fassung verwendet die App den Abstract und kennzeichnet dies.

### Leseliste

[Die Leseliste](/apps/t/reading-list) öffnet deine Papers direkt statt eines Formulars und dient als Arbeitsbereich.

- **Hinzufügen**: **+ Hinzufügen** fragt nach **Paper** als DOI, arXiv-ID, Link oder Titel und optional **Projekt**, kommagetrennten **Tags** und **Status**. **Hinzufügen** recherchiert Autoren, Jahr, Papersort, Abstract, Links, offenes PDF und BibTeX. Gleiche DOI, arXiv-ID oder Titel erzeugen kein Duplikat: Fehlendes wird ergänzt, Notizen, Tags und Status bleiben erhalten. Wird nichts gefunden, bleibt der eingegebene Titel mit einem daraus erzeugten Eintrag gespeichert; prüfe diesen.
- **Deine Papers finden**: Oben steht, wie viele du noch zu lesen hast, gerade liest und gelesen hast (klicke auf eine Zahl, um nur diese zu zeigen) und in wie vielen Projekten. **Deine Papers durchsuchen** findet sie über jedes ihrer Wörter, und **Alle**, **Zum Lesen**, **Wird gerade gelesen** und **Mit dem Lesen fertig** zeigen jeweils einen Status. Jedes Paper zeigt seine Autoren, den Veröffentlichungsort und das Jahr, sein Projekt und seine Tags (klicke auf eines, um nur dessen Papers zu zeigen; sein **✕** zeigt wieder alle), sowie **Zum Lesen**, **Wird gerade gelesen** und **Mit dem Lesen fertig**, um zu ändern, wo es steht: **Mit dem Lesen fertig** hält den Tag fest.
- **Detailseite**: Ein Klick auf den Titel zeigt **Papersseite** und **PDF**, bei lokalen Dateien **PDF öffnen**, sowie Status, Abstract, Projekt und Tags mit **Speichern**, deine **Notizen** mit **Notizen speichern**, BibTeX mit **BibTeX kopieren** und **Aus Liste entfernen**. **Reproduzieren** öffnet [Paper reproduzieren](#reproduce-a-paper) mit vorausgefüllter Arbeit.
- **Nach Projekt**: Projekte erscheinen mit Gesamtzahl und gelesenen Arbeiten. Ein Klick filtert. Verwendest du den Namen eines deiner [Projekte](/guide/projects), bleiben die Arbeiten auch bei dessen Umbenennung zugeordnet. Andere Namen sind ebenfalls möglich.
- **Weitere** bietet **.bib importieren** als eingefügten Text oder lokalen Dateipfad, mit Projekt und Tags für neue Arbeiten. Vorhandene werden ergänzt, eigene Angaben bleiben erhalten. **.bib exportieren** exportiert **Angezeigte** entsprechend Suche und Filtern oder **Alle** als Download oder über **Kopieren**. Außerdem gibt es **Mit Zotero synchronisieren**.
- **Literaturmatrix erstellen**: Wähle Papers über die Kästchen links aus. Die Auswahlleiste zeigt die Anzahl, **Literaturmatrix erstellen** startet die [Literaturmatrix](#literature-matrix) mit dieser Auswahl, **Leeren** hebt sie auf.

Wenn ein Agent ein Paper für dich hinzufügt, zeigt seine Karte **Das Paper**: das Paper, wie die Liste es jetzt hat, ob es neu war, **Deine Leseliste öffnen** und sein BibTeX zum Kopieren.

### Mit Zotero synchronisieren

**Mehr** → **Mit Zotero synchronisieren** → **Jetzt synchronisieren** gleicht die Liste mit deiner Zotero-Bibliothek ab.

1. Beim ersten Mal fragt die App nach deinem **Zotero API Key**. **Key erstellen** öffnet Zotero. Erlaube dort das Lesen der Bibliothek und optional das Schreiben, damit Arbeiten auch dorthin übertragen werden. Füge den Key ein und wähle **Speichern**. Er liegt ausschließlich für Zotero im Tresor; siehe [Keys im Tresor speichern](/guide/connections#keep-keys-in-the-vault). **Zotero-Benutzer-ID** kann leer bleiben, da sie aus dem Key ermittelt wird. Für Gruppenbibliotheken gib `groups/` gefolgt von der Gruppennummer an. Wähle erneut **Jetzt synchronisieren**.
2. Zotero-Einträge werden importiert und vorhandene anhand von DOI, arXiv-ID oder Titel ergänzt. Bei unterschiedlichen bibliografischen Angaben gilt Zotero; Status, Notizen und Projekt bleiben deine eigenen.
3. Nur lokal vorhandene Papers werden als neue Einträge nach Zotero übertragen.

Spätere Abgleiche übertragen nur Änderungen. In Zotero gelöschte Arbeiten bleiben hier ohne Verknüpfung erhalten und werden nicht erneut hochgeladen. Eine Zeile über der Liste nennt Zeitpunkt und Ergebnis, etwa „12 neue aus Zotero, 3 dorthin gesendet“, sowie **Erneut synchronisieren**.

### Literaturmatrix

[Die Literaturmatrix](/apps/t/literature-matrix) vergleicht mehrere Papers in einer Tabelle: eine Zeile pro Arbeit, eine Spalte pro Vergleichskriterium. Jede Zelle nennt die Aussage und ihre Fundstelle als Seite oder Abschnitt.

- **Papers**: höchstens dreißig, eine pro Zeile, als DOI, arXiv-ID, Link, Titel oder lokales PDF. Alternativ kannst du die Leseliste angeben, etwa „my reading list, tag: dense“, ein Projekt oder einen Status wie „my reading list, to read“. **Literaturmatrix erstellen** in der Leseliste füllt die Auswahl vor.
- **Spalten**: ein Kriterium pro Zeile; zunächst **Aufgabe**, **Daten**, **Methode**, **Metriken**, **Ergebnisse** und **Grenzen**.
- **Projekt**: das Zielprojekt der Tabelle. Eine bloße Angabe „my reading list“ verwendet dann die Papers dieses Projekts.

Die App liest drei Arbeiten gleichzeitig, als offene Vollfassung oder andernfalls Abstract. Ein schnelles Modell füllt die Zeilen und fasst gemeinsame Aussagen zusammen. Die Matrix landet als [Tabelle in der Bibliothek](/guide/library#spreadsheets), ergänzt um ein zweites Blatt mit den Papers. **Die Matrix** zeigt Anzahl, **In der Bibliothek öffnen**, **Als Tabelle kopieren**, die Tabelle selbst sowie nicht lesbare Arbeiten mit Gründen. Über **Weitere Spalte** und **Damit erneut erstellen** startest du eine neue Auswertung mit zusätzlichem Kriterium. **Papers** zeigt Kurzbeschreibungen und verwendete Quellen. **Übergreifende Erkenntnisse** nennt Gemeinsamkeiten, Widersprüche und offene Fragen mit **Kopieren**.

### Belege für eine Aussage finden

Wähle im [LaTeX-Editor](/guide/library#latex-documents) einen belegbedürftigen Satz und **Einfügen → Beleg dafür suchen**. Das Hilfsmodell erstellt Suchanfragen für OpenAlex und arXiv und liest die gefundenen Abstracts. Der Dialog listet stark oder teilweise stützende Arbeiten mit Begründung, Autoren, Jahr, Papersort und Abstract. **Zitieren** fügt den originalen BibTeX-Eintrag von doi.org oder arXiv unter einem eindeutigen Key ein und setzt `\cite` hinter die Aussage; weitere Zitate werden angefügt. **Hinzufügen** ergänzt nur die Bibliografie. Übertragen werden nur die Aussage und ihr unmittelbarer Kontext, nicht die gesamte Arbeit.

Im selben Editor kannst du **Werkzeuge → Mit KI Korrektur lesen** nutzen oder mit **Bearbeiten → Mit KI umformulieren** ausgewählten Text überarbeiten, während Befehle, Formeln, `\cite` und `\ref` erhalten bleiben. Mit Strg+K lässt du beschriebene Gleichungen, Tabellen oder Algorithmen erstellen. Der Editor kann sie außerdem aus Bildern lesen. Weitere Funktionen erklären und korrigieren TeX-Fehler und bereinigen die Bibliografie; siehe [LaTeX-Dokumente](/guide/library#latex-documents).

### Paper reproduzieren

[Paper reproduzieren](/apps/t/reproduce-paper) prüft veröffentlichte Ergebnisse mit dem Originalcode. Die App findet den Code, richtet die Umgebung ein, lädt Daten und Checkpoints, führt die Auswertung aus, vergleicht Werte mit der Ergebnistabelle und dokumentiert den Aufwand.

- **Paper** oder **Hochladen**, **Code** als Link oder lokaler Ordner, andernfalls wird danach gesucht. **Zu reproduzierendes Ergebnis** sollte die Bezeichnung der Arbeit verwenden, etwa „Tabelle 2, BM25 + monoT5 auf MS MARCO dev“. **Grenzen** legt Zeit, Speicherplatz und GPUs fest, zunächst „Höchstens 4 Stunden, 100 GB Speicherplatz und 1 GPU“. **Arbeitsordner** ist optional; leer bedeutet einen neuen Ordner pro Lauf.

Die App liest die Arbeit und sucht den Codeverweis. Fehlt er, recherchiert sie parallel auf GitHub und im Web das wahrscheinlichste Repository. Ein schnelles Modell ermittelt Datensatz und Aufteilung, Modell und Checkpoint, Einstellungen und die exakt veröffentlichten Vergleichswerte. Ein Agent folgt dem Skill **reproduce-paper**: saubere Umgebung nach Repository-Anleitung mit venv, conda oder Docker, Daten und Checkpoints, zunächst ein kleiner Test und dann der eigentliche Lauf. Jede Änderung samt Begründung wird dokumentiert; der Bericht liegt als `REPRODUCTION.md` im Arbeitsordner. GPU- oder mehrstündige Läufe gehen an [Experimente](/guide/experiments), das auf freie GPUs wartet und Laufdaten und Protokolle speichert. Die App wartet ohne belegte Agentensitzung auf den Abschluss; anschließend wertet ein Agent die Ergebnisse aus. Abweichungen bis zu einem halben Punkt auf einer Skala von 0–100 beziehungsweise 0,005 auf einer Skala von 0–1 gelten als reproduziert.

Ihre Ansicht hat **War die Reproduktion erfolgreich?** (das Urteil, wie viele Zahlen nah dran waren, die benötigten Stunden und die vorgenommenen Korrekturen, ihr Repository, **Öffne den Ordner**, ihre Läufe in Experimente und **Erneut versuchen**, wenn sie nicht reproduziert wurde; dann die Zahlen des Papers neben unseren mit dem Unterschied, die nahen in Grün, und die Einstellung, wie das Paper sie angibt), **Erforderlicher Aufwand** (jeder Schritt mit seinen Minuten und jede Änderung und Korrektur) und **Bericht** (mit **Bericht kopieren**).

Die App führt lokalen Code aus und kann Stunden benötigen. Sie hält deine Grenzen ein und stoppt mit einem Zwischenbericht, wenn diese sonst überschritten würden. Nicht verfügbarer Code oder nicht öffentliche Daten werden ausdrücklich benannt.

**Beim Lesen markieren.** Öffne das PDF unter Dateien und wähle **Markieren**. Markiere Text oder ziehe einen Rahmen um Gleichungen und Abbildungen, wähle eine von vier Farben und ergänze Notizen. **Fragen** übergibt nur diesen Ausschnitt an einen Agenten, etwa „Was besagt diese Gleichung?“. **Notizen** zeigt alle Markierungen nach Seiten. **In einem Projekt speichern** hält Markierungen und Notizen als laufend aktualisiertes Wissensdokument unter dem Paperstitel fest, damit Projektsitzungen sie finden. **Im PDF speichern** schreibt sie für andere Anwendungen in die Datei. Siehe [PDF lesen und markieren](/guide/files-git#read-and-highlight-a-pdf).

## Paper vor der Einreichung prüfen

Der LaTeX-Editor prüft Referenzen, Anonymität, Seiten und Schriftarten, vorgeschriebene Abschnitte und Tabellenwerte, ähnlich einer redaktionellen und wissenschaftlichen Vorprüfung. Öffne deine Arbeit in [LaTeX-Dokumente](/library?kind=tex) und wähle **Werkzeuge → Vor der Einreichung prüfen**.

1. Wähle das Ziel: **ACL Rolling Review** als langer oder kurzer Beitrag, auch für **EMNLP** und **NAACL**, **SIGIR** als Voll- oder Kurzbeitrag, **CIKM**, **WSDM**, **TheWebConf**, **KDD**, **NeurIPS**, **ICLR**, **ICML**, **AAAI**, **IEEE-Zeitschrift**, **ACM-Zeitschrift** oder **Andere** mit eigenem Seitenlimit und Option **Anonyme Begutachtung**. Darunter stehen Seitenlimit, ausgenommene Teile, Anonymitätsregeln und Pflichtabschnitte. Da Regeln sich jährlich ändern, ist der Call for Papers verlinkt. Die Auswahl wird je Arbeit gespeichert; anfangs wird sie aus dem Dokumentstil abgeleitet.
2. **Prüfen** setzt das Dokument, liest das PDF, recherchiert Referenzen online und zeigt Befunde laufend an. Nur Titel, DOIs und arXiv-IDs gehen an Crossref, arXiv, OpenAlex, Semantic Scholar und DBLP. Antworten werden einige Tage zwischengespeichert; nicht erreichbare Dienste stehen bei den Befunden. Eigene kostenlose Keys verbessern den Zugriff auf OpenAlex und Semantic Scholar. Hinterlege unter [Keys](/apps/connected?tab=keys) OPENALEX_API_KEY für api.openalex.org beziehungsweise SEMANTIC_SCHOLAR_API_KEY für api.semanticscholar.org.

Fünf Gruppen enthalten Befunde mit **Muss korrigiert werden**, **Prüfen** oder **Zur Information**:

- **Referenzen**: Keys, die zitiert werden, aber in keinem Eintrag der Bibliografie stehen (oder mit anderer Groß- und Kleinschreibung zitiert werden als ihr Eintrag), nie zitierte Einträge, dasselbe Paper unter zwei Keys und Einträge ohne das, was ihre Art braucht (die Zeitschrift bei einem Artikel, der Tagungsband bei einem Paper, ein Jahr). Jeder zitierte Eintrag wird über seine DOI, seine arXiv-ID oder sonst seinen Titel nachgeschlagen und mit dem verglichen, was die Dienste auflisten: Titel, Autoren, Jahr und Erscheinungsort. Für einen Preprint wird nach einer veröffentlichten Version gesucht, die Gutachter erwarten, dass du sie zitierst. Von einem Paper, das nirgends zu finden ist, heißt es, dass es vielleicht nicht existiert: Prüfe es selbst, denn auch die Dienste können etwas übersehen.
- **Anonymität**, wo die Begutachtung anonym ist: deine Namen, wenn die Vorlage in ihrer endgültigen Fassung vorliegt (die von ACL, NeurIPS, ICML, ICLR und acmart haben eine anonyme); **\thanks**-Hinweise; ein Abschnitt mit Danksagungen; Links, die dich oder dein Labor nennen könnten (dein eigenes Repository, eine persönliche Seite); „unsere frühere Arbeit“ neben einem Zitat; und die eigenen Felder Author und Title des PDFs.
- **Formatieren**: die Seiten, die auf das Limit angerechnet werden (bis dorthin, wo die Referenzen beginnen, oder ohne die Teile, die die Veranstaltung nicht zählt, wie ACLs Limitations), die Seiten der Referenzen und die Gesamtseiten, wo die Veranstaltung sie begrenzt; Type-3-Schriften und nicht eingebettete Schriften; Änderungen an Rändern, Schriften und Abständen der Vorlage und negative **\vspace**s (als Hinweise: manche sind erlaubt); Referenzen und Zitate, die als ?? erscheinen; **TODO**-, **XXX**- und **\todo**-Markierungen; Zeilen, die weit in den Rand ragen; und die Fehler, wenn sich das Dokument nicht setzen lässt.
- **Pflichtabschnitte**: Abstract und je nach Ziel ACL Limitations, NeurIPS Paper Checklist samt verbliebenen **\answerTODO**, ICML Impact Statement, ICLR AI use statement, CIKM GenAI disclosure, IEEE Index Terms sowie ACM CCS concepts und Keywords.
- **Zahlen**: siehe [Mit den Läufen übereinstimmende Werte](#numbers-that-match-your-runs).

Der Button mit Datei und Zeile öffnet die Fundstelle im Quelltext. **Korrigieren** führt sichere Änderungen aus: bibliografischer Eintrag unter demselben Key aus den Diensten, vorher unter **Eintrag** einsehbar, veröffentlichte statt Preprint-Fassung, anonyme Vorlage, auskommentierte Danksagung, leeres PDF-Author-Feld, entfernte **\todo**-Notiz, korrigierter Fettdruck oder aktualisierte Tabelle. **Rückgängig** nimmt die Editoränderung zurück, **Speichern** legt eine neue Version an. Bei unsicheren Änderungen fragt **Agenten fragen** den Agenten neben dem Editor mit dem Befund; **Agenten alle Befunde korrigieren lassen** übergibt sie gemeinsam.

**Als Kommentare hinzufügen** verankert offene Befunde als [LaTeX-Dokumentkommentare](/guide/library#latex-documents) an ihren Textstellen. Du, mitwirkende Personen und Agenten sehen sie dort; ein zur Bearbeitung beauftragter Agent kann sie korrigieren und erledigen. Eine erneute Prüfung nennt behobene, verbleibende und neue Befunde. **Als Kommentare hinzufügen** erledigt dann Kommentare behobener Befunde.

Agenten können dieselbe Prüfung für Bibliotheksdokumente oder lokale LaTeX-Projekte ausführen: „Prüfe meine Arbeit für ACL vor der Einreichung“.

### Mit den Läufen übereinstimmende Werte

Die Prüfung liest jede Tabelle, Zahl für Zahl:

- **Bestwert fett**: In jeder Spalte sollte der beste Wert fett stehen. Loss, Fehler, Latenz und Perplexität werden minimiert, Accuracy, F1, nDCG und BLEU maximiert; ↓ und ↑ geben die Richtung ausdrücklich an. Ohne Hinweis gilt höher als besser, was der Befund nennt. Bestwerte pro Zeilenblock zwischen Linien, Gleichstände und zeilenweise Metriken werden unterstützt. **Fettdruck verschieben** korrigiert die Markierung.
- **Tabellen, die Experimente erstellt hat.** Eine Tabelle, die du aus [Experimente](/system/experiments) in das Paper übernommen hast (**Tabelle erstellen**, dann **In ein LaTeX-Dokument einfügen**), hat darüber eine Zeile `% hydor:table …`. Die Prüfung rechnet sie aus ihren Läufen, wie sie jetzt sind, neu aus und markiert jede Zahl, die sich seither geändert hat, und Signifikanzmarkierungen, die hinzugekommen oder weggefallen sind. **Tabelle aktualisieren** setzt die neue ein.
- **Die anderen Tabellen.** Ihre Zahlen werden in den abgeschlossenen Läufen des Projekts des Papers (oder seines Ordners) gesucht, so gerundet, wie die Tabelle sie rundet, und als Prozentwerte. Wie viele gefunden wurden, wird zu deiner Information gesagt, nie als Problem: Eine Zahl kann aus einem anderen Paper stammen oder aus einem Lauf, der anderswo gemacht wurde.

### arXiv-Paket

**Exportieren → arXiv-Paket (.zip)** oben in einem geöffneten LaTeX-Dokument (auf dem Smartphone **Mehr** (⋯) → **Herunterladen als**) erstellt eine ZIP-Datei des gespeicherten Papers, die du bei arXiv hochladen kannst. arXiv veröffentlicht den Quelltext so, wie du ihn einreichst. Angehakt ist, was passieren wird:

- **Kommentare entfernen**, sicher: `\%`, unveränderlich gelesene Inhalte wie verbatim, listings, **\verb** und Adressen in **\url** und **\href** bleiben erhalten. `\begin{comment}`-Blöcke werden entfernt, optional auch **\iffalse … \fi**-Blöcke.
- **Nur verwendete Dateien**: Bilder aus **\includegraphics**, eingelesene Dateien sowie eigene Stile und Klassen.
- **.bbl hinzufügen und .bib weglassen**: arXiv verwendet die hier gesetzte Bibliografie. Wähle die Option ab, um .bib zu senden und BibTeX bei arXiv ausführen zu lassen.
- Optional **\input- und \include-Dateien in main.tex einfügen** und **\pdfoutput=1 an den Anfang setzen**, arXivs ältere Vorgabe für pdfLaTeX.

Leerzeichen in Dateinamen werden durch Bindestriche ersetzt und Verweise angepasst. **Paket erstellen** prüft den Build in derselben Sandbox wie andere Dokumente und lädt das Paket herunter. Der Dialog zeigt enthaltene, ausgelassene und umbenannte Dateien, Satzergebnis, Größe gegenüber dem arXiv-Limit von 50 MB und den passenden Prozessor. Deine Auswahl bleibt gespeichert.

### Druckfertige Fassung, andere Vorlage und Weiterverarbeitung

Unter **Werkzeuge → Deine Paper** stehen weitere Aktionen:

- **Für die Veröffentlichung vorbereiten** bittet den Agenten neben dem Editor um die finale Fassung, geschrieben nach den Vorgaben des Veranstaltungsorts: die finale Fassung der Vorlage, die Autoren und ihre Institutionen zurück, die Danksagung zurück, der Copyright- oder Rechteblock, was die finale Fassung zusätzlich verlangt, und ihr Seitenlimit. Gib ihm die Autoren, ihre Institutionen und die Danksagung, wenn sie nicht im Quelltext stehen.
- **In andere Vorlage übertragen** beauftragt den Wechsel zu einer anderen Konferenzvorlage, Springer LNCS, Elsevier oder einem einfachen Artikel, als Begutachtungs- oder Endfassung. Text, Abbildungen, Tabellen und Referenzen bleiben erhalten.
- **arXiv-Paket (.zip)** wie oben.
- **Wie Gutachter prüfen**, **Auf Gutachten antworten** und **Vortrag, Poster und Thread erstellen** öffnen die passenden Apps mit vorausgefülltem PDF beziehungsweise Quellordner für den Vortrag; siehe [Paper begutachten, beantworten und präsentieren](#review-answer-and-present-your-paper).

Ungespeicherte Änderungen werden vorher gespeichert, damit jede Aktion den sichtbaren Stand erhält.

## Paper begutachten, beantworten und präsentieren

Vier fertige Apps unter **Schreiben** auf [der Apps-Seite](/apps) helfen bei deinem eigenen Paper: **Begutachtung simulieren** begutachtet deinen Entwurf so, wie es die Gutachter einer Konferenz tun würden, **Rebuttal erstellen** entwirft deine Antwort auf die Gutachten, die du bekommen hast, **Vortrag, Poster und Thread aus einem Paper** erstellt das Material, mit dem du es vorstellst, und **Abbildungen optimieren** macht seine Plots druckreif. Die ersten drei lesen dein Paper aus einem PDF, einer .tex-Datei oder dem Ordner eines LaTeX-Projekts auf diesem Computer, aus einem Link oder aus einem LaTeX-Dokument deiner Bibliothek (füge dessen Adresse ein); **Oder hochladen** nimmt stattdessen ein PDF an.

### Begutachtung simulieren

[Reviewer simulator](/apps/t/reviewer-simulator) prüft deinen Entwurf vor der Einreichung mit Formular und Bewertungsskala des Papersorts. Wahrscheinliche Kritikpunkte werden nach Risiko geordnet.

- **Deine Paper**, **Papersort** mit **ACL Rolling Review**, **SIGIR**, **NeurIPS**, **ICLR**, **ICML**, **KDD**, **CIKM**, **WSDM**, **TheWebConf**, **Zeitschrift** oder **Andere**, jeweils mit dem Formularstand von 2025. Dazu **Anzahl Gutachter**, 1 bis 5, standardmäßig 3, und **Besonderer Schwerpunkt**.

Die simulierten Gutachter haben unterschiedliche Perspektiven: Methodenexperte, Fachgebietsexperte, skeptischer Empiriker, sorgfältiger Leser eines Nachbargebiets und Reproduzierbarkeitsexperte. Sie füllen das Formular parallel aus. Anschließend erstellt ein simulierter Area Chair die Meta-Begutachtung mit möglichem Ausgang; Schwächen werden nach Ablehnungsrisiko geordnet. Diese Modellbewertungen helfen beim Finden von Schwachstellen, sagen aber keine echte Entscheidung voraus.

Die Ansicht hat **Die Gutachten** (den Veranstaltungsort, den wahrscheinlichen Ausgang, die durchschnittliche Gesamtbewertung, dann jedes Gutachten: seinen Gutachter und Blickwinkel, Bewertungen, Zusammenfassung, Stärken, Schwächen und Fragen), **Meta-Gutachten** (mit **Kopieren** und **Alle Gutachten kopieren**; dann **Mögliche Ursachen für ein Scheitern, die gefährlichsten zuerst**: jede Schwäche mit der Begründung, wie wahrscheinlich sie ist und was sie behebt), **Baselines und Ablationsstudien** (was Gutachter verlangen werden, warum und wie aufwendig es ist) und **Vor dem Absenden** (eine Liste zum Abhaken und **Auf diese Gutachten antworten**, das die Rebuttal-Werkstatt mit ihnen startet, damit du dein Rebuttal üben kannst).

### Rebuttal erstellen

[Rebuttal workbench](/apps/t/rebuttal-workbench) entwirft deine Antwort auf erhaltene Gutachten Punkt für Punkt innerhalb des Limits.

- **Gutachten** vollständig einfügen, jeweils unter der Kennung wie „Reviewer 1“, „R2“ oder OpenReviews „Reviewer xYz1“. Optional **Deine Paper** oder **Hochladen** für genaue Abschnittsverweise. **Limit** als Zeichen oder Wörter je Gutachten, Punkt oder insgesamt, zunächst „2.500 Zeichen pro Gutachter“. **Tonfall** bietet **Höflich und bestimmt**, **Herzlich und dankbar** oder **Kurz und präzise**.

Die App trennt Gutachten, extrahiert parallel die Punkte und führt mehrfach genannte Kritik zusammen. Kategorien sind Missverständnis mit bereits vorhandener Antwort, nötiges Experiment, nötige Erläuterung beziehungsweise Begründung oder Quelle und kleinere Punkte. Sie sucht passende Aussagen der Arbeit, verteilt das Limit auf Antwortentwürfe und setzt die vollständige Erwiderung zusammen. Neue, noch nicht vorliegende Ergebnisse bleiben als [Platzhalter] stehen; Ergebnisse werden nicht erfunden.

**Kritikpunkte** zeigt eine Kurzfassung und Filter **Alle**, **Missverständnisse**, **Experiment nötig**, **Erläuterung nötig** und **Kleinere Punkte**. Jeder Punkt enthält Herkunft und Originalwortlaut, Antwortentwurf, Länge im Verhältnis zum Anteil des Limits und **Kopieren**. **Zu erledigen** enthält abzuhakende Experimente und Textänderungen. **Vollständige Erwiderung** zeigt Antworten je Gutachter gegen das Limit und **Vollständige Erwiderung kopieren**.

### Vortrag, Poster und Thread aus einem Paper

[Paper to talk, poster and thread](/apps/t/paper-to-talk) erstellt Material zur Präsentation deiner Arbeit: zeitlich abgestimmte Folien mit Originalabbildungen, Gleichungen und Vortragsnotizen, ein A0-Poster, Beiträge für X, Bluesky und LinkedIn sowie eine Projektseite.

- **Deine Paper**, idealerweise der LaTeX-Projektordner mit Abbildungen; bei arXiv wird deren Quellpaket geladen. Dazu **Vortragsdauer in Minuten**, standardmäßig 15, **Publikum** mit **Forschende desselben Fachgebiets**, **Forschende anderer Fachgebiete** oder **Allgemeines Publikum**, gewünschte Ergebnisse als **Folien**, **A0-Poster**, **Thread (X, Bluesky, LinkedIn)** und **Projektseite** sowie das **Projekt** zum Speichern.

Die App plant ungefähr eine Folie pro Minute mit je einem Kerngedanken, vom Problem bis zur Schlussfolgerung. Ein Programm verteilt die Zeit exakt auf die gewünschte Gesamtdauer. Anschließend entstehen parallel die gewählten Materialien: bearbeitbare und präsentierbare [Folien in der Bibliothek](/guide/library#slides), das Poster als [LaTeX-Dokument](/guide/library#latex-documents), die Beiträge und eine veröffentlichungsfertige Projektseite; siehe [Seite veröffentlichen](/guide/library#publish-a-page).

**Erstellte Inhalte** zeigt Kernaussage, Einstiegssatz und alle Ergebnisse mit **Öffnen**. **Vortrag** stellt den Ablauf als Streifen dar, dessen Folienbreiten ihrer Dauer entsprechen. Jede Folie zeigt Minuten, Titel, Punkte, Abbildung, Gleichung und Sprechtext. **Thread** wechselt zwischen **X**, **Bluesky** und **LinkedIn**: nummerierte Beiträge mit **Kopieren** und **Thread kopieren**, für den einzelnen LinkedIn-Beitrag **Beitrag kopieren**.

### Abbildungen optimieren

[Figure doctor](/apps/t/figure-doctor) bereitet Plots für den Druck auf: passende Spaltenbreite, Schrift des Papers, auch bei Farbsehschwächen unterscheidbare Farben und Vektor-PDFs mit eingebetteten Schriften, gesteuert durch eine gemeinsame Stildatei.

- **Dein Plot-Code** (ein Skript, ein Notebook oder ein Ordner davon auf diesem Computer, erstellt mit matplotlib oder seaborn), **Die Vorlage der Veranstaltung** (**ACL, EMNLP, NAACL**, **ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)**, **IEEE**, **ICML**, **NeurIPS, ICLR**, **Springer LNCS** oder **Sonstiges (Breite angeben)**), **Breite** (**Eine Spalte** oder **Beide Spalten**), **Oder die Breite in Zoll** (für eine andere Vorlage) und **Die Schriftart des Papers** (**Als Vorlage**, **Times New Roman**, **Computer Modern**, **Linux Libertine** oder **Helvetica**).

Ein Programm ermittelt Breite, Schriftgrößen und geeignete Farbpalette. Ein Agent sichert jedes Skript daneben als name.orig.py und speichert den ursprünglichen Plot als Bild, bevor er das Skript an Ort und Stelle bearbeitet. Alle Skripte nutzen anschließend die gemeinsame Datei `paper.mplstyle`. Plots werden als Vektor-PDF gespeichert; die Prüfung kontrolliert eingebettete Schriften und schließt Type 3 aus, das viele Papersorte ablehnen. Da die Skripte ausgeführt werden, müssen Python, matplotlib, Daten und weitere Abhängigkeiten lokal vorhanden sein.

**Vorher und nachher** zeigt Größe, Schrift und Farben sowie jeden ursprünglichen und neuen Plot mit **PDF öffnen** und Änderungsbeschreibung. **Stildatei** enthält `paper.mplstyle`, **Kopieren** und Verwendungshinweise. **Änderungen** listet alle Anpassungen und die Schriftprüfung.

Diese Methoden stehen Agenten auch über die mitgelieferten Skills **peer-review**, **reproduce-paper** und **figures-for-papers** zur Verfügung; siehe [Skills](/guide/skills). Du kannst deshalb auch eine einzelne Arbeit gemeinsam prüfen, nur eine Gutachterfrage beantworten oder eine Abbildung korrigieren lassen.

## Laborarbeit ausführen

Drei Apps unter **Labor** auf der [Apps-Seite](/apps) helfen im Alltag: Daten annotieren und Modellbewertungen vergleichen, eine Forschungsfrage mit eigenem Code von Hypothesen bis Bericht untersuchen und Modelleinstellungen optimieren. Sprint und Sweep führen Jobs über [Experimente](/guide/experiments) aus und benötigen dort einen Computer oder Cluster mit GPUs.

### Anmerkungs-Workbench

In der **Anmerkungs-Workbench** beschriften du und ein Modell dieselbe Stichprobe von Texten, damit du siehst, wo ihr euch uneinig seid und wie weit du dem Modell beim Rest vertrauen kannst. Öffne sie unter **Apps** und fülle aus:

- **Kategorien**, kommagetrennt, höchstens neun für die Tasten 1 bis 9. **Annotationsrichtlinien** beschreibst du in eigenen Worten; das Modell verwendet dieselben.
- Texte als **CSV- oder JSONL-Datei**, **Hugging-Face-Datensatz** mit Name wie stanfordnlp/imdb oder Adresse und gegebenenfalls **Aufteilung**. Eine Konfiguration steht vor dem Schrägstrich, etwa plain_text/test. Alternativ fügst du einen Text pro Zeile ein. **Textspalte** wird automatisch erkannt: text, review oder sentence, andernfalls die mit den längsten Texten. Korrigiere sie bei Bedarf.
- **Anzahl zu annotierender Texte**: zufällig ausgewählt, standardmäßig 100, höchstens 1.000.

Die App liest Texte, bei Hugging Face über dessen Dataset-Server aus zufällig gewählten Datensatzseiten. Sie mischt die Stichprobe und lässt das Hilfsmodell je zwanzig Texte mit kurzer Begründung klassifizieren. Danach arbeitest du auf der Laufseite:

- **Annotieren** zeigt einen Text und große Kategorienbuttons. Klicke oder drücke **1** bis **9**. Erst danach erscheint das Modellurteil über dem nächsten Text, bei Abweichung mit Begründung, damit es dich nicht beeinflusst. **Vorerst überspringen** mit **S** stellt den Text ans Ende, **Ändern** mit **Z** nimmt die letzte Auswahl zurück. **N** beginnt eine Notiz zum Text. Die Leiste zeigt deinen Fortschritt.
- **Abweichungen** stellt bei unterschiedlich klassifizierten Texten deine Kategorie und Notizen dem Modellurteil mit Begründung gegenüber. **Erneut klassifizieren** legt den Text zurück unter **Annotieren**.
- **Übereinstimmung** zeigt den Anteil identischer Kategorien, die erwartete Zufallsübereinstimmung und Cohens κ als darüber hinausgehende Übereinstimmung: 1 ist perfekt, 0 entspricht Zufall, über 0,6 gilt als deutlich. Die Konfusionsmatrix zeigt deine Kategorien links und die des Modells oben.
- **Exportieren** lädt **CSV** oder **JSONL** mit Text, deiner Kategorie, Modellkategorie samt Begründung und deinen Notizen herunter. **Auf Hugging Face veröffentlichen** erstellt dort einen eigenen Datensatz, standardmäßig privat, außer du wählst **Alle**. Die Dataset Card beschreibt Richtlinien, Vorgehen und Übereinstimmung. Dafür ist ein Hugging-Face-Token mit Schreibzugriff nötig; sonst funktioniert die App ohne Token. Beim ersten Veröffentlichen weist sie darauf hin. Hinterlege es unter dem Formular im optionalen Feld **Hugging Face token** oder unter **Apps → Verbundene Apps → Keys** als HF_TOKEN. **Texte entfernen** löscht Texte und Annotationen eines Datensatzes.

Jeder Datensatz gehört zu einem eigenen Lauf. Texte und deine Annotationen bleiben als App-Daten gespeichert. Die App-Seite zeigt Datensätze unter den letzten Läufen; du setzt sie am bisherigen Stand fort.

### Forschungssprint

**Forschung sprint** untersucht deine Forschungsfrage in einem kurzen Sprint mit deinem Code und schrittweiser Freigabe. Gib **Forschungsfrage**, **Repository** als lokales Git-Repository, **Wichtige Informationen** wie Zielmetrik, Baseline mit Werten, Training, Auswertung und unveränderliche Teile, **Erlaubte GPU-Stunden**, standardmäßig acht für alle Läufe zusammen, und **Anzahl Hypothesen** von eins bis fünf an. Danach:

1. Das Hilfsmodell schlägt aus deiner Frage und der README des Repositorys Hypothesen vor, jeweils mit dem, was für sie sprechen würde, und dem, was gegen sie sprechen würde, und dem Experiment, das sie prüft.
2. **Jeden Schritt freigeben** ist zunächst aktiv. Der Lauf wartet auf deine Auswahl oder eigene Hypothesen, eine pro Zeile. Die Frage erscheint auf der Laufseite, im Posteingang und als Benachrichtigung.
3. Ein Agent erstellt neben deinem unveränderten Checkout einen neuen Worktree auf einem Branch sprint/…. Dort schreibt und committet er Plan als SPRINT.md und benötigten Code. Er listet Baseline- und Hypothesenläufe mit Seeds auf. Läufe über deinem GPU-Budget werden ausgelassen und genannt.
4. Vor dem Verbrauch von GPU-Zeit wartet er erneut. Du kannst starten oder ablehnen; bei Ablehnung endet der Sprint, Plan und Code bleiben auf dem Branch.
5. Experimente führt die mit dem Sprint gekennzeichneten Läufe aus. Der Sprint wartet auf ihren gemeinsamen Abschluss.
6. Eine Ergebnistabelle vergleicht alle Bedingungen mit der Baseline und weist Signifikanz aus. Ein Agent analysiert die Läufe in einem Jupyter-Notebook in deiner [Bibliothek](/library), beurteilt jede Hypothese mit Belegen als gestützt, nicht gestützt oder unklar und schreibt einen kurzen Bericht.

**Sprint** zeigt Frage, Verlauf, Branch sowie Hypothesen mit Urteil und Belegen. **Läufe** enthält Ergebnistabelle und einzelne Metriken. **Bericht** lässt sich lesen und kopieren und bietet **Notebook öffnen** und Vorschläge für weitere Versuche. Bei einem Start über API oder Zeitplan gibt es keine interaktiven Freigaben; der Sprint läuft direkt durch.

### Sweep-Planer

**Sweep-Planer** plant einen Hyperparameter-Sweep innerhalb deines Budgets, startet ihn, beendet schlechte Versuche frühzeitig und erklärt wichtige Einflussfaktoren. Gib **Skript oder Befehl**, **Ordner**, **Metrik** wie in Konsolenausgabe oder Datei als metric=value oder JSON und **Bevorzugte Wertrichtung** an. Dazu **Zu optimierende Einstellungen**, eine pro Zeile mit Werten wie lr: 1e-4, 3e-4, 1e-3; leer lässt sie ermitteln. Das **Budget** kann „20 Läufe“ oder „10 GPU-Stunden“ sein. **Schlechte Versuche frühzeitig stoppen** ist optional.

- Ein Agent liest das Skript ohne Ausführung oder Änderung und ermittelt Argumente, Laufdauer und Erkennungsmerkmale schlechter Läufe. Er schlägt Einstellungen und Werte vor oder übernimmt deine. Ein Programm passt die Auswahl ans Budget an: alle Kombinationen, wenn möglich, andernfalls so viele Zufallsziehungen, wie das Budget zulässt.
- Mit **Plan zuerst prüfen** wartet der Lauf auf dich. Starte ihn unverändert oder gib Änderungen pro Zeile an, etwa lr: 3e-4, 1e-3 für andere Werte oder drop dropout zum Entfernen einer Einstellung.
- Experimente führt den Sweep als ein einziges Experiment aus; mit **Schlechte Versuche frühzeitig stoppen** wird ein Lauf, der deutlich schlechter ist als der bisher beste, gestoppt, um seine GPU-Zeit zu sparen.
- Nach Abschluss ermittelt ein Programm den besten Lauf und den Einfluss jeder Einstellung als Anteil an der erklärten Streuung der Metrik. Das Hilfsmodell erläutert dies und schlägt nächste Versuche vor.

**Ergebnisse** zeigt beste Einstellungen und Metrik, Erkenntnisse, nächste Versuche und Gewichtungsbalken je Einstellung. **Nach Einstellung** zeigt die Metrik je Wert als Boxplots; **Alle Läufe** zeigt die vollständige Liste.

## Berichte: Woche und Laborbuch

Zwei fertige Apps unter **Arbeit** auf der Seite [Apps](/apps) schreiben aus dem, was Hydor über deine Arbeit weiß, auf, was du getan hast: deine Sitzungen (die hier sowie die Claude-Code- und Codex-Sitzungen in VS Code oder einem Terminal, die Hydor liest), deine Commits in den Git-Repositorys, in denen sie gearbeitet haben, deine Läufe unter Experimente, was du in der Bibliothek erstellt hast und die Papers, die du in deiner Leseliste als gelesen markiert hast. Sitzungen ohne Memory und vertrauliche Sitzungen bleiben außen vor, ebenso die Arbeit von Sitzungen, die Agenten für Teile einer Aufgabe starten (sie zählt zur übergeordneten Sitzung). Beide öffnen sich auf einer eigenen Seite und können sich von selbst aktualisieren.

### Wöchentlicher Fortschrittsbericht

**Weekly progress report** erstellt einen Wochenbericht für Betreuung, Team oder Führungskraft: Erledigtes, Ergebnisse mit Zahlen, Probleme und Blockaden, Plan für nächste Woche und offene Fragen. Die Seite zeigt den Bericht für die sieben Tage bis zu seiner Erstellung: Titel, Zusammenfassung, Zahlen sowie **Diese Woche erledigt**, **Ergebnisse**, **Probleme und Blockaden**, **Nächste Woche** und **Fragen**.

- **Als Markdown kopieren** und **Als E-Mail kopieren** übernehmen den Bericht in die Zwischenablage. Die E-Mail enthält Betreff und eine kurze Nachricht mit passender Anrede und Schluss. **Als Dokument speichern** legt ihn in der Bibliothek zum Bearbeiten und Exportieren als Word oder PDF ab.
- **Aktualisieren** schreibt jetzt den Bericht dieser Woche. **Früher** darunter listet die früheren Wochen auf, jede einen Klick entfernt.
- Die Schieberegler oben öffnen **Einstellungen**. **Automatisch aktualisieren** ist zunächst aus und erstellt nach Aktivierung freitags um 16:00 einen Bericht. Ändere Tage über **Täglich**, **Werktags** oder **Wöchentlich am** sowie die Uhrzeit. Als [geplante Aufgabe](/guide/tasks) erscheint dies auch unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks). **Zielgruppe** bestimmt Schreibweise für Betreuung, Team oder Führungskraft. **Projekte** wählt alle oder benannte Projekte, **Inhalte** präzisiert etwa „nur Forschung, keine Kosten“.

### Laborbuch

**Laborbuch** erstellt für jeden aktiven Tag einen datierten Eintrag mit Versuchen, Erkenntnissen, Entscheidungen und offenen Fragen. Verlinkt sind zugehörige Sitzungen, Commits, Läufe, Dateien und Bibliotheksinhalte. Einträge sind App-Daten und getrennt von [Memory](/guide/memory). Die eigene Seite zeigt neueste zuerst:

- **Laborbuch durchsuchen** sucht Wörter und bei aktivierter [Bedeutungssuche](/settings?s=memory&find=Search%20by%20meaning) auch sinngemäß, beste Treffer zuerst. **Alle Einträge** hebt die Suche auf.
- **Link kopieren** unter einem Eintrag kopiert dessen eigene Seite im ursprünglichen Stand, etwa als Beleg in eines Papers, einem Bericht oder einer Notiz.
- **Aktualisieren** schreibt den heutigen Eintrag. **Früheren Tag nachtragen** ergänzt einen fehlenden Tag. Eine erneute Erstellung ersetzt den bisherigen Eintrag; Tage ohne Arbeit erhalten keinen.
- **Einstellungen**: **Automatisch aktualisieren** (aus, bis du es einschaltest) schreibt den Eintrag des Tages jeden Abend um 21:00 Uhr, an den Tagen und zu der Uhrzeit, die du wählst; **Projekte** beschränkt ihn auf einige Projekte.

## Einen Agenten fragen

- „Richte Paper radar für cs.IR und cs.CL ein, mit Dense Retrieval und Query Performance Prediction als Themen. Aktualisiere täglich um 7:30.“
- „Was hat Paper radar heute gefunden? Welche Papers betreffen mein Hydor-Projekt?“
- „Aktiviere Citation alerts für meine Papers unter dem Namen Chris Samarinas. Wer hat ProCIS zuletzt zitiert?“
- „Ergänze SIGIR, ACL und EMNLP in Deadline radar und erinnere mich 21, 7 und 2 Tage vor jeder Frist.“
- „Beobachte Hugging Face nach neuen Rerankern unter einer Milliarde Parametern mit Apache- oder MIT-Lizenz. Führe jeweils python eval.py --model {model} in ~/rerank-eval aus; Metrik ndcg@10, bisheriger Bestwert 0.512.“
- „Starte Living related work zu Learned Sparse Retrieval mit SPLADE und ColBERT als Seed-Paperen und entwirf den Abschnitt zu verwandten Arbeiten.“
- „Finde Forschungslücken zwischen meinen Papers und den Arbeiten dieses Monats zu Conversational Search. Ich habe eine GPU mit 24 GB.“
- „Füge 2104.08663 und die ColBERT-Paper meiner Leseliste im Projekt Dense retrieval hinzu.“
- „Importiere ~/papers/refs.bib mit dem Tag survey in meine Leseliste.“
- „Synchronisiere meine Leseliste mit Zotero.“
- „Welche Papers für das Projekt Dense retrieval habe ich noch nicht gelesen?“
- „Erstelle eine Literaturmatrix aus den Arbeiten mit Tag dense in meiner Leseliste. Ergänze eine Spalte zur Verfügbarkeit ihres Codes.“
- „Reproduziere Tabelle 2 der BEIR-Paper, BM25 auf SciFact, in höchstens einer Stunde und ohne GPU.“
- „Öffne Paper reproduzieren für 2104.08663, starte sie aber noch nicht.“
- „Begutachte meinen Entwurf in ~/papers/draft aus der Sicht von drei SIGIR-Gutachtern. Was könnte zur Ablehnung führen?“
- „Hier sind meine ARR-Gutachten. Entwirf eine Erwiderung mit höchstens 2.500 Zeichen pro Gutachter.“
- „Erstelle aus ~/papers/colbert einen zwölfminütigen Vortrag, ein A0-Poster und einen Thread im Projekt ColBERT.“
- „Bereite die Plots in ~/papers/colbert/plots für einen einspaltigen ACL-Beitrag in Times auf.“
- „Prüfe meine Arbeit vor der ACL-Einreichung und korrigiere sichere Befunde.“
- „Existieren alle Referenzen meiner LaTeX-Arbeit mit den richtigen Autoren und Jahren? Korrigiere falsche Einträge.“
- „Führe doppelte Bibliografieeinträge zusammen und ergänze Angaben über ihre DOIs.“
- „Gibt es inzwischen veröffentlichte Fassungen zitierter Preprints? Zitiere diese.“
- „Anonymisiere meine NeurIPS-Arbeit für die Begutachtung: Namen, Links, Danksagungen und PDF-Metadaten.“
- „Hält meine Arbeit das EMNLP-Seitenlimit ein? Kürze sie nötigenfalls passend.“
- „Stimmen die Werte meiner Ergebnistabellen noch mit den Läufen überein?“
- „Mein SIGIR-Beitrag wurde angenommen. Erstelle die druckfertige Fassung.“
- „Übertrage meine Arbeit in die ICLR-Vorlage für die Begutachtung.“
- „Lade 200 Texte aus dem Sentiment-Teil von tweet_eval auf Hugging Face in Annotation workbench, mit positiv, negativ und neutral sowie diesen Richtlinien: …“
- „Wie gut stimmen meine Annotationen im letzten Datensatz mit dem Modell überein? Welche Kategorien verwechseln wir am häufigsten?“
- „Untersuche in einem Forschung sprint, ob ein Curriculum von kurzen zu langen Anfragen dem Retriever in ~/code/retriever hilft. Budget: 6 GPU-Stunden.“
- „Plane einen Sweep für Lernrate und Batchgröße von ~/code/model/train.py innerhalb von 10 GPU-Stunden. Niedrigerer val_loss ist besser.“
- „Aktiviere meinen Wochenbericht für die Betreuung, freitags um 15:00, nur für das Projekt Retriever.“
- „Was habe ich letzte Woche zu Hard Negatives entschieden? Suche im Laborbuch.“
- „Schreibe meinen Laborbucheintrag für letzten Dienstag.“
