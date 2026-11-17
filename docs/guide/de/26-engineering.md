# Engineering: CI, Issues, Abhängigkeiten und Vorfälle

Agenten können sich um deine Codebasis kümmern, während du andere Dinge erledigst: fehlgeschlagene CI-Läufe untersuchen, neue Issues einordnen, Abhängigkeiten aktuell halten und auf Warnmeldungen reagieren. Für jede dieser Aufgaben gibt es ein kurzes Formular zum Einrichten einer geplanten Aufgabe. Mit **Fehlerursache finden** im Git-Bereich sucht ein Agent nach dem Commit, der einen Fehler eingeführt hat. Eine **Kampagne** zerlegt eine größere Änderung in Teilaufgaben, die mehrere Agenten gleichzeitig in eigenen Worktrees bearbeiten.

![Einstellungen → Geplante Aufgaben: die Engineering-Beispiele](images/engineering.webp)

## So funktionieren die Engineering-Aufgaben

Die vier Aufgaben stehen unter [Einstellungen → Geplante Aufgaben](/settings?s=tasks) (**Einstellungen → Agenten → Geplante Aufgaben**) im Bereich **Mit einem Beispiel beginnen**. Wähle **Alle Beispiele anzeigen**, um sie neben [**Neue Pull-Requests prüfen**](/settings?s=tasks&find=Review%20new%20pull%20requests) zu sehen. Jedes Beispiel öffnet ein kurzes Formular. Fülle es aus, wähle unter **Ausführen mit** den Agenten und anschließend **Aufgabe erstellen**. **Weitere Optionen …** öffnet das vollständige Aufgabenformular. Alle Möglichkeiten erklärt [Geplante Aufgaben](/guide/tasks).

Die Aufgaben haben Folgendes gemeinsam:

- **Repository-Ordner**: die lokale Kopie des Repositorys, mit der der Agent arbeitet. Er liest sie und nimmt Änderungen in einem neuen Worktree vor, also einer separaten Arbeitskopie mit eigenem Branch. Deine Arbeitskopie und ihr Branch bleiben unverändert.
- **Jeweils ein Skill**: Der Agent folgt einer beschriebenen Methode. Die mitgelieferten Skills **ci-doctor**, **issue-triage**, **dependency-upgrades** und **incident-response** kannst du unter [Einstellungen → Skills](/settings?s=skills) lesen und bearbeiten.
- **Erlaubte Aktionen**: Schalter im Formular legen etwa fest, ob der Agent **Einen Draft-Pull-Request mit einer Korrektur öffnen** darf. Ist eine Aktion deaktiviert, beschreibt er stattdessen seinen Vorschlag. Keine dieser Aufgaben pusht auf den Standardbranch, führt einen Force-Push aus oder mergt Änderungen.
- **Webhooks**: CI doctor, Issue triage und die Vorfallanalyse starten, wenn ein Dienst die eigene Adresse der Aufgabe aufruft. Nach dem Erstellen zeigt die Aufgabenzeile diese Adresse mit Kopierbutton und einer Anleitung für den jeweiligen Dienst. Dieselbe Anleitung steht schon im Formular. Ein Filter lässt nur passende Ereignisse durch: einen fehlgeschlagenen Lauf, ein neues Issue oder einen aktiven Alarm. Andere Ereignisse werden beantwortet, starten aber keinen Lauf. Zum Ausprobieren funktionieren **Jetzt ausführen** im Aufgabenmenü und **Testlauf** im Formular ohne Webhook: CI doctor nimmt den letzten fehlgeschlagenen Lauf, Issue triage die unbeschrifteten Issues des letzten Tages und die Vorfallanalyse prüft den aktuellen Dienstzustand.
- **Zugriff**: Für GitHub nutzt der Agent das lokal angemeldete Kommando gh. Andernfalls verwendet er einen Key aus deinem Tresor oder eine verbundene App, etwa GitHub, GitLab, Buildkite, CircleCI, Sentry, Grafana, Datadog oder Better Stack. Siehe [Verbundene Apps, Keys und Tools](/guide/connections). Fehlt ein erforderlicher Key, fragt er danach.
- **Jeder Lauf** meldet in einer Zeile, wie er gelaufen ist, in seiner Benachrichtigung und im Verlauf der Aufgabe, und behält Notizen für den nächsten Lauf (die instabilen Tests, die er gesehen hat, die Updates, die er zurückgestellt hat, die bisherigen Vorfälle). Ein Lauf, der deine Genehmigung braucht, wartet darauf, in seiner Sitzung und im [Posteingang](/guide/inbox). Beim Start eines Laufs sieht vielleicht niemand zu. Wähle für diese Aufgaben deshalb unter **Weitere Optionen…** → **Berechtigungen** einen Modus, der Routineschritte durchlaufen lässt und bei riskanten nachfragt (**Automatisch**), sonst wartet der Lauf schon beim ersten Befehl auf dich.

## CI-Diagnose

Ein fehlgeschlagener Lauf in GitHub Actions, GitLab CI, Buildkite oder CircleCI startet einen Agenten. Er liest die Protokolle der fehlgeschlagenen Jobs, ermittelt den ersten tatsächlichen Fehler und vergleicht frühere Läufe desselben Jobs. So unterscheidet er instabile Tests von reproduzierbaren Fehlern. Anschließend stellt er den Fehler in einem Worktree nach, handelt im erlaubten Umfang und fasst das Ergebnis zusammen.

### Einrichten

1. Wähle in [Einstellungen → Geplante Aufgaben](/settings?s=tasks) bei **Mit einem Beispiel beginnen** (**Alle Beispiele anzeigen**) [**CI-Diagnose**](/settings?s=tasks&find=CI%20doctor) aus.
2. Wähle den **Repository-Ordner** und die **CI**: **GitHub Actions**, **GitLab CI**, **Buildkite** oder **CircleCI**.
3. Lege die erlaubten Aktionen fest:
   - **Vermutlich instabile Jobs erneut ausführen**, standardmäßig aktiv: genau ein erneuter Versuch, wenn Hinweise auf einen Laufzeitfehler statt einen Codefehler vorliegen, etwa ein Timeout, ein fehlgeschlagener Download oder ein bekannter sporadischer Testfehler.
   - **Einen Draft-Pull-Request mit einer Korrektur öffnen**, aktiv: Bei einem echten Fehler entsteht eine möglichst kleine Korrektur auf einem eigenen Branch, mit Testnachweis und als Entwurf zur Prüfung.
   - **Commit oder Pull-Request kommentieren**, inaktiv: ein kurzer Kommentar mit Ursache, Korrektur oder nächstem Schritt.
4. Wähle **Aufgabe erstellen**. Der Name enthält die CI, etwa „CI doctor · GitHub Actions“.
5. Kopiere die Adresse aus der Aufgabenzeile in die CI. Die Anleitung unter der Adresse nennt die Einstellungen:
   - **GitHub Actions**: im Repository **Settings → Webhooks → Add webhook**. Adresse als Payload URL, application/json und bei den einzelnen Ereignissen nur **Workflow runs**.
   - **GitLab CI**: im Projekt **Settings → Webhooks → Add new webhook**, nur **Pipeline events**.
   - **Buildkite**: **Settings → Notification Services**, beim Webhook **Add**, Ereignis build.finished.
   - **CircleCI**: im Projekt **Project Settings → Webhooks → Add Webhook**, Ereignis **Workflow Completed**.

Nur fehlgeschlagene Läufe lösen die Aufgabe aus: in GitHub ein Workflow-Lauf mit conclusion failure, in GitLab, Buildkite und CircleCI mit status failed. Der Agent erhält Workflow, Adresse, Branch, Commit samt Nachricht und Pull-Request. Seine Kurzmeldung nennt die Einordnung, Ursache und Aktion, etwa „Instabil: Registry-Timeout bei npm ci; erneut ausgeführt“ oder „Reproduzierbar: Datumsparser scheitert an Schaltjahren; Draft-Pull-Request #42“.

## Issues einordnen

Jedes auf GitHub oder Gitea neu eröffnete Issue startet einen Agenten. Er liest das Issue und die Beitragsrichtlinien, vergibt vorhandene Labels und sucht mit verschiedenen Formulierungen nach demselben Problem in offenen und kürzlich geschlossenen Issues. Dabei nennt er die Sicherheit seiner Einschätzung. Fehlende Angaben wie Version, Schritte oder Protokolle fragt er freundlich per Kommentar nach. Ist eine Korrektur klein und eindeutig, testet er sie in einem Worktree und öffnet einen Draft-Pull-Request mit Verweis auf das Issue.

1. Wähle bei **Mit einem Beispiel beginnen** (**Alle Beispiele anzeigen**) [**Issues einordnen**](/settings?s=tasks&find=Issue%20triage) aus.
2. Wähle den **Repository-Ordner** und die erlaubten Aktionen: **Labels vergeben**, **Kommentieren** und **Einfache Fälle als Draft-Pull-Request bearbeiten**. Alle sind zunächst aktiv.
3. Wähle **Aufgabe erstellen**. Trage die Adresse im GitHub-Repository unter **Settings → Webhooks → Add webhook** ein und aktiviere nur **Issues**. Auf Gitea wählst du ebenfalls Issues-Ereignisse.

Nur neu eröffnete Issues lösen einen Lauf aus. Der Agent schließt, sperrt, überträgt oder löscht kein Issue und weist niemandem ein Issue zu. Eindeutige Duplikate kennzeichnet er; das Schließen bleibt den Verantwortlichen überlassen. Er beachtet die Projektregeln: Ein Projekt, das keine KI-erstellten Pull-Requests annimmt, erhält auch keine. Öffentlich gemeldete Sicherheitsprobleme diskutiert er nicht öffentlich weiter. Er verweist auf den privaten Meldeweg des Projekts und benachrichtigt dich sofort.

## Abhängigkeiten pflegen

Einmal pro Woche prüft der Agent die Abhängigkeiten des Repositorys für npm, pnpm, yarn, pip, uv, poetry, cargo und go auf veraltete Versionen und Sicherheitsmeldungen. Sicherheitskorrekturen kommen zuerst, danach Patch-, Minor- und Major-Updates in getrennten Gruppen. Major-Updates werden nie mit anderen Updates vermischt. Jede Gruppe erhält einen eigenen Worktree. Der Agent liest die Versionshinweise auf inkompatible Änderungen und führt Tests aus. Updates, die Tests beschädigen, stellt er mit einer Begründung in den Aufgabennotizen zurück, damit sie nicht jede Woche erneut vorgeschlagen werden.

1. Wähle bei **Mit einem Beispiel beginnen** (**Alle Beispiele anzeigen**) [**Abhängigkeiten pflegen**](/settings?s=tasks&find=Dependency%20gardener) aus.
2. Wähle den **Repository-Ordner**, den Wochentag unter **Am** (zunächst Montag) und die Uhrzeit unter **Um** (09:00).
3. **Pull-Requests öffnen**, aktiv: Für jede erfolgreich getestete Gruppe entsteht ein Draft-Pull-Request mit den wichtigsten Änderungen, behobenen Sicherheitsproblemen und Prüfpunkten. Ist die Option aus, pusht der Agent nichts und nennt stattdessen die Befehle zum Anwenden jeder Gruppe.
4. Wähle **Aufgabe erstellen**.

Wenn alles aktuell ist und keine Sicherheitsmeldung offen ist, bleibt die Aufgabe still.

## Erste Hilfe bei Störungen

Ein Alarm von Sentry, Grafana, Datadog, Better Stack oder einem anderen Dienst startet einen Agenten. Innerhalb weniger Minuten benachrichtigt er dich darüber, was seit wann nicht funktioniert und wie schwerwiegend es ist. Er bringt Fehler, Protokolle, letzte Deployments und Änderungen seit der letzten funktionierenden Version auf eine gemeinsame Zeitleiste. Daraus ermittelt er mit Belegen die wahrscheinliche Ursache und schlägt den sichersten nächsten Schritt vor, häufig einen Rollback. Ohne deine Freigabe führt er weder Rollback noch Neustart noch Deployment aus. Er fragt auf einer Karte in der Sitzung nach. Antwortet niemand rechtzeitig, meldet er den offenen Handlungsbedarf samt wartendem Befehl. Nach dem Vorfall kannst du in derselben Sitzung einen Postmortem-Bericht anfordern.

1. Wähle bei **Mit einem Beispiel beginnen** (**Alle Beispiele anzeigen**) [**Erste Hilfe bei Störungen**](/settings?s=tasks&find=Incident%20first%20responder) aus.
2. Wähle den **Repository-Ordner des Dienstes** und unter **Alarmquelle** den Dienst: **Sentry**, **Grafana**, **Datadog**, **Better Stack** oder **Anderer Dienst**.
3. **Rollback-Befehl**, optional: ein Befehl, den der Agent nach deiner Freigabe ausführen darf, etwa `kubectl rollout undo deployment/web`. Bleibt das Feld leer, fragt er nach dem Vorgehen.
4. Wähle **Aufgabe erstellen** und leite die Alarme wie in der Aufgabenzeile beschrieben an ihre Adresse weiter:
   - **Sentry**: **Settings → Developer Settings → Create New Integration → Internal Integration**. Trage die Adresse als Webhook URL ein und aktiviere **Alert Rule Action**. Ergänze die Integration anschließend bei den Aktionen deiner Alarmregeln.
   - **Grafana**: **Alerting → Contact points → Add contact point**, Webhook-Integration mit der Aufgabenadresse. Leite über eine Benachrichtigungsrichtlinie Alarme dorthin.
   - **Datadog**: **Integrations → Webhooks → New**, mit der Adresse und `"transition": "$ALERT_TRANSITION"` im Payload. Erwähne anschließend `@webhook-` mit dem Namen in den Monitornachrichten.
   - **Better Stack**: **Incidents → Integrations → Exporting data → Outgoing webhooks → Configure**, dann bei Incident **Add**. Wähle nur Ereignisse für neu erstellte oder erneut geöffnete Vorfälle.

Entwarnungen starten keinen Lauf; die Filter erkennen dies bei Sentry, Grafana und Datadog. Kommt dennoch eine Entwarnung durch, wird sie nur in den Aufgabennotizen festgehalten. Ist die Alarmquelle als App verbunden, liest der Agent darüber Fehler und Protokolle.

## Fehlerverursachenden Commit finden

Wenn etwas früher funktioniert hat und jetzt fehlschlägt, kann ein Agent den verantwortlichen Commit suchen. Er testet die dazwischenliegenden Commits mit git bisect und halbiert den Suchbereich bei jedem Schritt. Bei tausend Commits sind so etwa zehn Tests nötig. Anschließend nennt er den ersten fehlerhaften Commit und erklärt, welche Änderung den Fehler verursacht.

1. Öffne auf der [Git-Seite](/git) das Repository und seinen **Verlauf**.
2. Öffne den Commit, bei dem es zuletzt funktioniert hat, und wähle in seinem ⋯-Menü **Fehlerverursachenden Commit finden**, oder wähle die Schaltfläche **Fehlerverursachenden Commit finden** neben **Commit suchen** oben in der Liste.
3. Fülle das Formular **Fehlerursache finden** aus:
   - **Funktionierte bei**: der ausgewählte Commit, möglichst als Tag, andernfalls der neueste Tag. Du kannst einen Tag, Branch oder Commit eingeben. Aktuelle Tags werden vorgeschlagen. Darunter erscheinen Commitnachricht und Alter oder der Hinweis, dass kein passender Commit oder Tag existiert.
   - **Fehlerhaft bei**: zunächst `HEAD`, der neueste Commit des aktuellen Branches.
   - **Fehlerbeschreibung**: möglichst genau in eigenen Worten, etwa „PDF-Export eines Dokuments mit Bildern scheitert mit ‚Bild zu groß‘“.
   - **Prüfbefehl**, optional: ein Befehl, der im Fehlerfall fehlschlägt, etwa `npm test -- export`. Ohne Angabe erstellt der Agent selbst eine Prüfung.
   - **Ausführen mit**: der Agent mit dem auf der Startseite zuletzt verwendeten Modell und Berechtigungsmodus.
4. Wähle **Starten**. Beide Endpunkte müssen unterschiedliche gültige Commits sein und die **Fehlerbeschreibung** muss ausgefüllt sein.

Sofort öffnet sich eine neue Sitzung in einem neuen Worktree; deine Arbeitskopie bleibt unverändert. Der Agent folgt dem Skill **git-bisect**. Er erstellt ein kleines Prüfskript mit Exit-Code 0 für funktionierende, 1 für fehlerhafte und 125 für nicht testbare Commits, etwa wenn ein Build scheitert. Er prüft zuerst beide Endpunkte und führt anschließend `git bisect run` aus. Danach zeigt er den ersten fehlerhaften Commit und die entscheidende Änderung. Er belegt die Ursache durch gezieltes Rückgängigmachen dieses Commits und schlägt eine Korrektur vor. Deine Branches verändert er nicht. Unter Sitzungsmenü → **Abschließen: vorerst erledigt** kannst du anschließend den Worktree entfernen lassen; siehe [In einem Worktree arbeiten](/guide/sessions#work-in-a-worktree).

Auch die Suche mit Strg+K findet **Fehlerursache finden** und öffnet das Formular für das zuletzt verwendete Repository.

## Kampagnen: eine große Änderung in Teilaufgaben

Eine Kampagne verteilt eine größere, überwiegend mechanische Änderung an der Codebasis auf mehrere Agenten, etwa den Wechsel aller Pakete auf einen neuen Logger, ein Framework-Update oder die projektweite Umbenennung einer API. Ein leitender Agent zerlegt die Änderung in Pakete, Module oder Ordner. Jedes Mitglied bearbeitet und testet seinen Teil in einem eigenen Worktree. Kampagnen sind die zweite Variante eines [Schwärme](/guide/research#set-a-swarm-on-a-hard-problem). **Schwarm-Größe** bestimmt bei beiden, wie viele Agenten gleichzeitig arbeiten.

### Kampagne starten

1. Wähle auf der Startseite den Repository-Ordner. Eine Kampagne benötigt ein Git-Repository.
2. Öffne **Optionen**, wähle **Schwarm** und dann **Kampagne** („Eine große Änderung in Teilen, jeweils in einem Worktree“).
3. Beschreibe die Änderung und die Prüfung, etwa „Stelle alle Pakete von Jest auf Vitest um; npm test muss in jedem Paket bestehen“, und wähle **Starten**.

Die Schwarm-Zeile zeigt etwa „Kampagne · 5 gleichzeitig“, abhängig von deiner Schwarm-Größe. Die Wahl gilt nur für diese Sitzung. Tiefgehende Recherche und Kampagne können nicht gleichzeitig aktiv sein. Ein Ausgabenlimit im selben Menü gilt für den leitenden Agenten und alle Mitglieder zusammen. Dieselbe Auswahl gibt es im Editor geplanter Aufgaben.

### Ablauf

1. Der leitende Agent klärt Änderung und Prüfung und zerlegt die Arbeit in unabhängig bearbeitbare und testbare Teile. Er veröffentlicht den Plan auf dem Board: benannte Teile in sinnvoller Reihenfolge, gemeinsamer Code zuerst.
2. Für jeden Teil startet er ein Mitglied, höchstens so viele gleichzeitig wie die Schwarm-Größe erlaubt. Sobald Mitglieder fertig sind, starten weitere. Jedes erhält einen eigenen Branch und einen neuen Worktree auf Grundlage des Branches des leitenden Agenten.
3. Ein Mitglied bearbeitet nur seinen Teil, führt Prüfungen aus und committet auf seinem Branch. Es meldet den Teil mit Branch und Prüfergebnissen als erledigt oder mit Fehlerbeschreibung als fehlgeschlagen.
4. Ein fehlgeschlagener Teil erhält mit den bisherigen Erkenntnissen einen zweiten Versuch. Scheitert er erneut, bleibt er als fehlgeschlagen markiert.
5. Der leitende Agent mergt fertige Branches nacheinander in sinnvoller Reihenfolge in seinen Arbeitsbranch, prüft nach jedem Merge und entfernt den jeweiligen Worktree. Wenn du in deinem Auftrag Pull-Requests verlangst, öffnet er stattdessen einen pro Teil und mergt nichts. Er pusht nie auf den Standardbranch.
6. Zum Schluss berichtet er über Änderungen, Fehlschläge samt Ursache und verbleibende manuelle Arbeit.

Soll die gesamte Änderung auf einem eigenen Branch bleiben, aktiviere im Ordnermenü auch für den leitenden Agenten **Neuer Worktree**. Die Mitglieder zweigen dann von dessen Branch ab, und die Merges landen dort.

### Fortschritt verfolgen: Leiste und Board

Über dem Nachrichtenfeld der leitenden Sitzung steht zunächst **Kampagne · Teilaufgaben werden geplant**, später etwa „12 von 40 Teilen erledigt · 2 fehlgeschlagen · 3 in Arbeit“ sowie **Board**. Mitgliedersitzungen zeigen „In der Kampagne von“ mit dem Titel der leitenden Sitzung sowie **Board** und **Leitender Agent**. In der Seitenleiste stehen sie eingeklappt unter der leitenden Sitzung, etwa „40 Kampagnenmitglieder · 3 in Arbeit“.

**Board** öffnet das **Kampagnenboard**, auf dem Smartphone vom unteren Bildschirmrand:

- **Teilaufgaben**: Anzahl erledigter und fehlgeschlagener Teile sowie alle Teile in Planreihenfolge. Jeder zeigt seinen Zustand (**Wartet**, **In Arbeit**, **Erledigt**, **Fehlgeschlagen**, **Erneuter Versuch** oder **Zweimal fehlgeschlagen**) und die letzte Meldung beziehungsweise aktuelle Tätigkeit. Ein Klick öffnet die Mitgliedersitzung. **Alle stoppen** beendet alle noch arbeitenden Mitglieder.
- **Aktuell in Arbeit**: die aktiven Mitglieder, höchstens so viele wie deine Schwarm-Größe erlaubt.
- **Beiträge**, auf breiten Bildschirmen neben den Teilen: alle Meldungen, neueste zuerst, jeweils mit Typ (**Plan**, **Fortschritt**, **Erledigt**, **Fehlgeschlagen**, **Erkenntnis**, **Frage**, **Notiz**) und zugehöriger Teilaufgabe.

Nachrichten an alle wecken Mitglieder in einer Kampagne nicht erneut auf; erledigte Teile bleiben erledigt. Eine direkte Nachricht an ein Mitglied aktiviert es dagegen wieder.

## Einen Agenten fragen

- „Richte für ~/code/shop einen CI doctor mit GitHub Actions ein. Er darf instabile Jobs erneut ausführen, aber keine Pull-Requests öffnen.“
- „Warum ist der letzte CI-Lauf auf main in acme/shop fehlgeschlagen? War der Fehler sporadisch?“
- „Ordne die diese Woche eröffneten Issues in acme/shop ein: Vergib Labels und suche Duplikate.“
- „Prüfe jeden Montag um 9 die Abhängigkeiten von ~/code/api und öffne Pull-Requests für erfolgreich getestete Updates.“
- „Richte eine Vorfallanalyse für die Grafana-Alarme von checkout ein, mit kubectl rollout undo deployment/checkout als Rollback-Befehl.“
- „Schreibe einen Postmortem-Bericht zum gestrigen checkout-Ausfall.“
- „In v1.2.0 hat es funktioniert. Finde in ~/code/docs den Commit, der den PDF-Export beschädigt hat.“
- „Starte in ~/code/shop eine Kampagne zur Umstellung aller Pakete von Jest auf Vitest, mit einem Pull-Request pro Paket.“
