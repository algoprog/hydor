# LLM Wiki

Ein LLM-Wiki hält verknüpftes Wissen aus deinen Quellen in Markdown-Dateien fest. Hydors Agenten können ein vorhandenes Wiki nutzen und dich dabei unterstützen, es weiter aufzubauen.

## Die Idee

Andrej Karpathy beschreibt ein Wiki, das ein KI-Agent pflegt: Die Originalquellen bleiben erhalten, während der Agent ihre Inhalte in verknüpften Artikeln zusammenführt. Kommt eine neue Quelle hinzu, kann er bestehende Artikel aktualisieren und auf die Quellen verweisen. So lässt sich auf früherer Arbeit aufbauen und nachvollziehen, woher eine Aussage stammt.

## Wiki einrichten

Öffne [Einstellungen → Fähigkeiten → Speicher](/settings?s=memory) und suche **LLM Wiki**. Schalte es ein, gib unter **Wiki hub folder** den absoluten Pfad auf dem Computer ein, auf dem Hydor läuft, und lege unter **Project wiki folder** den Pfad relativ zu jedem Projektordner fest. Der Hub liegt standardmäßig unter `.wiki` im Hydor-Aufgabenordner, zum Beispiel `~/Hydor/.wiki`; Projekt-Wikis liegen standardmäßig unter `.wiki` im jeweiligen Projekt. Eine vorhandene Projektbindung hat Vorrang. Schalter werden sofort gespeichert; Ordnerpfade beim Verlassen des Feldes oder mit der Eingabetaste. Läuft Hydor in einem Container, müssen die Pfade darin erreichbar sein.

Enthält der bisherige Hub Dateien, kannst du beim Ändern des Ordners entscheiden, ob sie dort bleiben oder umziehen. Enthält der Zielordner Dateien, kannst du beide Ordner zusammenführen oder das Ziel ersetzen. Für Konflikte wählst du die Quellversion, die Zielversion oder die anhand des Änderungszeitpunkts ältere Version. Hydor sichert beide ursprünglichen Ordner vollständig und zeigt die Backup-Pfade an. Pausiere während des Umzugs andere Programme, die in die Ordner schreiben. Andere Programme mit dem alten Pfad musst du separat umstellen. Die Änderung des Projekt-Wiki-Ordners verschiebt keine Projektdateien.

Mit **Durchsuchen** kannst du den Hub-Ordner auswählen. Die lokale Desktop-App öffnet den Systemdialog; im Browser oder auf einem anderen Rechner zeigt Hydor die Ordner der jeweiligen Hydor-Instanz und lässt dich dort einen Ordner erstellen.

**Ignore project wikis in Git** ist standardmäßig eingeschaltet. Wenn Hydor ein Projekt-Wiki beschreibt, kann es dessen Ordner in `.gitignore` eintragen. Du kannst die Option ausschalten; vorhandene Einträge bleiben bestehen. Dateien, die Git bereits verfolgt, werden weiterhin verfolgt.

## Quellen hinzufügen und Fragen stellen

Bitte einen Agenten, eine freigegebene Textquelle hinzuzufügen oder ein Dokument beziehungsweise eine Webseite zu lesen und den Text aufzunehmen. Er bewahrt die ursprüngliche Quelle, dokumentiert ihre Herkunft und kann verknüpfte Artikel samt Quellenverweisen aktualisieren. Stelle Fragen zum Wiki und prüfe die Quellen in der Antwort. Hydor verwendet seine vorhandene Wissenssuche; neue oder geänderte Dateien werden möglicherweise erst mit Verzögerung indexiert.

Bitte den Agenten bei einer unterstützten Dokumentdatei, das Dokument selbst hinzuzufügen. Hydor bewahrt die unveränderte Originaldatei neben einer extrahierten Textnotiz auf. Dokumente dürfen bis zu 20 MiB groß sein; der extrahierte Text kann unvollständig sein.

Du kannst den Agenten bitten, grundlegende Struktur-, Quellen- und Linkprüfungen auszuführen. Vorhandene Wiki-Dateien bleiben im Markdown-Format. Archivierte und zurückgezogene Inhalte sind von der normalen Wiki-Ansicht und Suche ausgeschlossen.

## Ein Projekt-Wiki lesen

Öffne **Projekte**, wähle ein Projekt und öffne den Reiter **LLM Wiki**. Wähle einen Artikel oder eine Quelle zum Lesen, folge Wiki-Links und öffne die aufgeführten Quellen. Der Reiter meldet, wenn das Wiki ausgeschaltet ist oder der konfigurierte Ordner fehlt. Siehe [Projekte und Wissen](/guide/projects#llm-wiki).

## Checkpoints und Lessons Learned

Wenn Speicher und LLM Wiki eingeschaltet sind, kann Hydors eigener Agent Custom Checkpoints vor und nach seiner Kontextkomprimierung sowie regelmäßige Ereignisstände im Hub speichern. Ein Checkpoint kann eine redigierte Zusammenfassung des Agenten oder nur Ereignismetadaten enthalten; er ist kein vollständiges Transkript. Bei Claude Code und Codex versucht Hydor einen Checkpoint, wenn du die Komprimierung aus Hydor heraus startest. Für die automatische Komprimierung innerhalb dieser Agenten ist die Hook-Abdeckung nicht nachgewiesen. Schlägt ein Checkpoint fehl, kann die Komprimierung weiterlaufen. Ist Memory für die Sitzung oder global ausgeschaltet, erfolgen keine Wiki-Sitzungserfassung und Wiederherstellung; vorhandene Checkpoints bleiben bestehen.

Bitte den Agenten um eine Vorschau der Lessons Learned aus der Sitzung. Die Vorschau schreibt keine Daten und verwendet bereits indexierte Nachrichten; die neuesten können noch fehlen. Das Speichern ausgewählter Erkenntnisse erfordert deine Bestätigung. Siehe [Memory](/guide/memory#llm-wiki).
