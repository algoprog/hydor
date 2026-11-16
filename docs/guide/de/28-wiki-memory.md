# Wiki Memory

Wiki Memory besteht aus verknüpften Markdown-Artikeln mit Quellen: je einem Wiki für deine Projekte und einem gemeinsamen Wiki. Hydors Agenten können daraus lesen und das Wissen aus Dokumenten und der Projektarbeit ergänzen. Wiki Memory gehört zu Memory und arbeitet mit den vorhandenen Memory-Notizen und Dokumenten zusammen.

![Der Memory-Tab eines Projekts mit Notizen, Wiki Memory und Dokumenten](images/wiki-memory.webp)

## Zusammenspiel mit Notizen und Dokumenten

Memory besteht aus drei Teilen:

- **Memory-Notizen** halten kurze Fakten über dich, ein Projekt oder eine Sitzung fest (siehe [Memory](/guide/memory)).
- **Wiki Memory** enthält ausführlichere, verknüpfte Artikel mit ihren Quellen, jeweils für ein Projekt oder gemeinsam.
- **Dokumente** sind die Dateien selbst, die Agenten durchsuchen und zitieren (siehe [Projekte und Wissen](/guide/projects#give-a-project-documents-of-its-own)).

Die Idee folgt Andrej Karpathys Beschreibung eines von einem KI-Agenten gepflegten Wikis: Originalquellen bleiben erhalten; der Agent verbindet ihre Aussagen in Artikeln, die auf die Quellen verweisen. Neue Quellen können bestehende Artikel ergänzen. So bleibt überprüfbar, woher eine Aussage stammt.

Wenn ein Dokument hinzukommt oder sich ändert, kann Hydor daraus Memory-Notizen und Wiki-Ergänzungen erstellen (siehe [Aus neuen Dokumenten lernen](#learn-from-new-documents)).

## Ein- und ausschalten

Wiki Memory ist für Projekte standardmäßig eingeschaltet. Unter [Settings → Capabilities → Memory → Wiki Memory](/settings?s=memory&find=Wiki%20memory) bestimmst du die Voreinstellung und das gemeinsame Wiki. Im **Settings**-Tab eines Projekts kannst du **Wie in Settings**, **Ein** oder **Aus** wählen. Änderungen werden sofort gespeichert. Ist Wiki Memory für ein Projekt aus, bleiben vorhandene Dateien erhalten.

In den Chat-Optionen kannst du **LLM Wiki** und **Auto lessons learned** für den einzelnen Chat einstellen. Ihre Standardwerte stehen ebenfalls in den Wiki-Einstellungen; Chats ohne eigene Auswahl folgen diesen Werten. Automatische Vorschläge benötigen Memory und müssen vor dem Speichern bestätigt werden. Wird Wiki Memory erst nach dem Start von Claude oder Codex eingeschaltet, starte den Agenten für automatische Checkpoints neu.

Das Lernen aus Dokumenten und Checkpoints benötigt außerdem [Memory](/guide/memory#turn-memory-off-for-all-sessions). Bei ausgeschaltetem Memory werden keine Checkpoints gespeichert.

## Speicherorte der Wikis

Das gemeinsame Wiki liegt im **Wiki-Ordner** unter [Settings → Memory → Wiki Memory](/settings?s=memory&find=Wiki%20folder), zunächst `.wiki` im Hydor-Aufgabenordner, etwa `~/Hydor/.wiki`. Projekt-Wikis liegen standardmäßig im jeweiligen Projektordner unter `.wiki`. Alternativ kannst du sie im gemeinsamen Wiki unter `projects/` ablegen; ihre Ordnernamen bleiben bei einer Projektumbenennung erhalten.

Der gemeinsame Ordner ist ein absoluter Pfad auf dem Computer, auf dem Hydor läuft. **Browse** öffnet in der lokalen Desktop-App den Systemdialog; im Browser zeigt Hydor die Ordner des Rechners, auf dem die Instanz läuft.

Den relativen Projekt-Wiki-Ordner kannst du ändern. **Aus Git ausschließen** ist standardmäßig aktiv und ergänzt beim Schreiben in einem Git-Repository den tatsächlichen lokalen Wiki-Ordner in `.gitignore`. Bereits verfolgte Dateien bleiben verfolgt; beim Ausschalten bleibt ein vorhandener Eintrag erhalten.

Eine Projektbindung wie ``- Wiki: `knowledge/wiki` `` in `AGENTS.md` hat Vorrang. Eine relative Bindung oder ein Link darf auch genau auf den konfigurierten gemeinsamen Wiki-Ordner zeigen. Andere externe Ziele, absolute Pfade, `~`, Git-Ordner und versteckte Hydor-Ordner sind nicht zulässig.

Im Wiki enthält `wiki/` die Artikel, `raw/` ihre Quellen, `index.md` das Inhaltsverzeichnis und `log.md` die Änderungen. Andere Programme können die Markdown-Dateien ebenfalls lesen.

## Aus neuen Dokumenten lernen

Mit **Aus neuen Dokumenten lernen** verarbeitet Hydor neue und geänderte Wissensdokumente: Projektdokumente ergänzen das Projekt-Wiki und seine Memory-Notizen; gemeinsame Dokumente ergänzen das gemeinsame Wiki ohne projektspezifische Notizen.

Das Hilfsmodell aus [Settings → Models](/settings?s=models) verarbeitet Dateien nach einer Ruhezeit einzeln und höchstens 40 pro Stunde. Es liest bis zu 40.000 Zeichen, entfernt erkannte Zugangsdaten und legt den Text als Quelle ab. Es kann bis zu drei Artikel ergänzen, zwei neue Artikel und drei kurze Projektnotizen vorschlagen. Zu stark verkürzte Artikeländerungen und Inhalte mit erkannten Geheimnissen werden verworfen. Unveränderte Dokumente werden nicht erneut verarbeitet; das Wiki verarbeitet sich nicht selbst.

Ist das Hilfsmodell nicht erreichbar oder findet es nichts, zeigt der Verlauf den Grund. Bei einer späteren Dokumentänderung wird erneut versucht.

## Der Memory-Tab eines Projekts

Öffne [Projekte](/projects), wähle ein Projekt und öffne **Memory**. Dort findest du **Notizen**, **Wiki** und **Dokumente**. Im Wiki kannst du Artikel und Quellen öffnen und Links folgen; Agenten schreiben die Inhalte. Der Speicherort wird angezeigt. Die Dokumentenansicht und ihre Suche funktionieren weiterhin wie unter [Projektdokumente](/guide/projects#give-a-project-documents-of-its-own) beschrieben.

**Recent updates** zeigt bis zu 20 Dokumentenverarbeitungen mit Artikeln, Notizen oder Gründen für Fehler beziehungsweise ausbleibende Änderungen. Die Projektübersicht fasst die Bestände zusammen.

## Was Agenten damit tun können

Agenten können Wiki-Artikel und Quellen lesen, neue Text- oder Dokumentquellen erhalten, Artikel mit Quellenverweisen aktualisieren und das Wiki auf Quellen- und Linkprobleme prüfen. Dateien bis 20 MiB bleiben als Original erhalten; ihre Textextraktion kann unvollständig sein. Änderungen nutzen gelesene Prüfsummen, um Konflikte zu erkennen. Die bestehende Dokumentensuche findet indexierte Wiki-Inhalte.

Für bestehende Projektpläne kannst du eine Revisionsvorschau anfordern. Vor der bestätigten Änderung wird der bisherige Inhalt in einem geschützten Snapshot gesichert. Die Bestätigung der Planänderung startet keine Umsetzung.

Andere Projekt-Wikis, versteckte Git- und Archivordner, zurückgezogene Artikel und externe Links sind nicht über die Wiki-Werkzeuge erreichbar. In vertraulichen Sitzungen ist Wiki Memory ausgeschaltet.

## Checkpoints und Lessons Learned

Mit Wiki Memory und Memory kann Custom vor und nach eigener Kontextkomprimierung einen redigierten Checkpoint sichern. Pro Sitzung bleibt ein aktueller Checkpoint im gemeinsamen Wiki; er enthält eine Zusammenfassung oder nur Metadaten, kein vollständiges Transkript.

Bei Claude Code und Codex versucht Hydor beim manuellen Komprimieren und, wenn der native Hook registriert werden kann, vor automatischer Komprimierung einen Checkpoint. Vorhandene oder verborgene Hooks, Plugins, Richtlinien oder eine nicht verfügbare Hook-Erkennung können die Registrierung verhindern. Ein Fehler stoppt die Komprimierung nicht; die Sitzungsdetails zeigen den letzten bekannten Status.

Du kannst Lessons Learned zur Vorschau anfordern oder automatische Vorschläge im Chat einschalten. Vorschläge schreiben nichts ins Wiki; erst deine ausdrückliche Bestätigung speichert den angezeigten Inhalt. Eine Vorschau kann jüngste, noch nicht indexierte Nachrichten auslassen.

## Wiki-Ordner verschieben

Enthält der gemeinsame Wiki-Ordner Dateien, zeigt Hydor vor einer Pfadänderung eine Prüfung. Du kannst die Dateien liegen lassen oder verschieben. Bei Dateien im Ziel kannst du zusammenführen oder ersetzen und bei Konflikten die Quell-, Ziel- oder ältere Version behalten. Hydor legt vollständige Sicherungen der ursprünglichen Ordner an und zeigt ihre Pfade. Der alte Ordner bleibt erhalten. Pausiere andere Programme, die dort schreiben, und aktualisiere deren Pfade. Das Ändern des Projekt-Wiki-Ordners verschiebt keine Projektdateien.

## Einen Agenten fragen

- „Ist Wiki Memory für dieses Projekt eingeschaltet?“
- „Bewahre dieses Dokument als Quelle und ergänze den passenden Artikel.“
- „Prüfe das Projekt-Wiki auf fehlende Quellen und kaputte Links.“
- „Zeige eine Vorschau der Lessons Learned aus dieser Sitzung.“
- „Zeige eine Revision des bestehenden Projektplans zur Prüfung.“
