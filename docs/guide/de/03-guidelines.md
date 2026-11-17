# Agentenrichtlinien

Agentenrichtlinien legen fest, woran sich alle Agenten hier halten sollen: wie du arbeitest, was sie immer oder niemals tun sollen und wie sie dich ansprechen. Ein gemeinsamer Text gilt für Claude Code, Codex, Custom und Agenten mit ACP-Unterstützung. Du kannst Richtlinien für alle Sitzungen, ein Projekt oder eine einzelne Sitzung hinterlegen.

![Einstellungen → Agentenrichtlinien: Vorgaben für alle Sitzungen und die Richtlinien der einzelnen Projekte](images/guidelines.webp)

## Was Richtlinien sind

Richtlinien sind Anweisungen in normaler Sprache. Die App übergibt sie dem Agenten beim Sitzungsstart, noch vor deiner ersten Nachricht. Zum Beispiel: „Antworte in verständlichem Deutsch und erkläre Fachbegriffe“, „Frage vor dem Löschen nach“, „Speichere deine Ergebnisse unter ~/Work“ oder „Verwende britische Rechtschreibung“. Die Vorgaben gelten für die gesamte Sitzung.

Du musst nicht wissen, wie die einzelnen Agenten ihre Anweisungen einlesen. Claude Code und Codex haben dafür eigene Dateien, CLAUDE.md und AGENTS.md; andere Agenten nutzen andere Verfahren. Die App übergibt deine Richtlinien selbst an jeden Agenten. Deshalb genügt ein gemeinsamer Text.

Deine konkrete Anweisung im Gespräch hat Vorrang: Steht in den Richtlinien „kurze Antworten“ und du verlangst einen ausführlichen Bericht, erhältst du den Bericht.

## Die drei Ebenen

Richtlinien gelten auf drei Ebenen, von allgemein bis spezifisch:

1. **Für alle Sitzungen**: für jeden Agenten in jeder Sitzung. Du legst sie unter [Einstellungen → Agenten → Agentenrichtlinien](/settings?s=guidelines) fest.
2. **Für ein Projekt**: für jede Sitzung in diesem [Projekt](/guide/projects). Du hinterlegst sie im Feld **Agentenrichtlinien** auf der Projektseite.
3. **Für eine Sitzung**: nur für diese Sitzung. Du legst sie vor dem Start unter **Optionen → Richtlinien** oder später im Sitzungsmenü (⋯) unter **Sitzungseinstellungen → Richtlinien** fest.

Der Agent erhält alle zutreffenden Ebenen in dieser Reihenfolge. Widersprechen sich zwei Vorgaben, gilt die spezifischere: Sitzungsrichtlinien gehen vor Projektrichtlinien, Projektrichtlinien vor den allgemeinen Richtlinien. Der Hinweis (i) neben **Für eine Sitzung** in den Einstellungen erklärt das ebenfalls.

## Richtlinien für alle Sitzungen schreiben

1. Öffne [Einstellungen → Agenten → Agentenrichtlinien](/settings?s=guidelines).
2. Schreibe unter **Für alle Sitzungen**, was jeder Agent über dich und deine Arbeitsweise wissen soll.
3. Klicke auf **Speichern**.

Unter dem Textfeld bietet **Vorlage wählen…** einige vorbereitete Vorgaben zur Ansprache: **Verständliche Sprache, kurze Antworten, Fachbegriffe erklären**, **Freundlich und ermutigend: Ich bin neu hier** und **Knapp und technisch**. Eine Auswahl ergänzt die Zeile „So sprichst du mit mir: …“. Du kannst sie vor dem Speichern anpassen. **Speichern** wird erst aktiv, wenn du etwas änderst. **Änderungen verwerfen** stellt den zuletzt gespeicherten Stand wieder her.

Jede Ebene umfasst höchstens 20.000 Zeichen. Halte die Richtlinien möglichst kurz: Jede Sitzung liest den gesamten Text. Wenige klare Sätze sind hilfreicher als mehrere Seiten.

## Richtlinien für ein Projekt festlegen

Jedes Projekt kann eigene Richtlinien erhalten: für wen die Arbeit gedacht ist, welcher Schreibstil passt und welche Projektregeln gelten.

1. Öffne **Projekte** in der Seitenleiste und wähle das Projekt.
2. Fülle das Feld **Agentenrichtlinien: Vorgaben für alle Agenten im Projekt** aus.
3. Speichere das Projekt.

Du kannst die Richtlinien auch beim Anlegen eines Projekts schreiben: Öffne im Fenster **Neues Projekt** die **Weiteren Optionen** und fülle **Agentenrichtlinien** aus. Unter **Einstellungen → Agenten → Agentenrichtlinien → Für ein Projekt** findest du alle Projekte mit Richtlinien, jeweils mit deren erster Zeile. Bei vielen Einträgen zeigt **Alle anzeigen** die vollständige Liste. Klicke auf einen Eintrag, um das Projekt zu öffnen.

Sitzungen in einer Gruppe, die mehrere Projekte zusammenfasst, folgen den Richtlinien der Gruppe. Bei der Arbeit an einem enthaltenen Projekt lesen sie zusätzlich dessen Vorgaben.

## Richtlinien für eine einzelne Sitzung

### Vor dem Start

1. Öffne auf der Startseite **Optionen** neben dem Nachrichtenfeld.
2. Klicke auf **Richtlinien**. Der Dialog öffnet den Tab **Diese Sitzung**.
3. Schreibe die Vorgaben für diese Sitzung und klicke auf **Speichern**. Die Optionsanzeige zeigt anschließend **Für diese Sitzung**.

Derselbe Dialog zeigt auch die Projektrichtlinien, sofern du ein Projekt gewählt hast, und die allgemeinen Richtlinien. Jede Ebene hat einen eigenen Tab. So kannst du alle Vorgaben einsehen und bei Bedarf ändern. Ein Punkt am Tab bedeutet, dass dort Richtlinien hinterlegt sind.

### In einer laufenden Sitzung

1. Öffne das Sitzungsmenü (⋯) → **Sitzungseinstellungen → Richtlinien**.
2. Ändere die Vorgaben unter **Diese Sitzung**, für das Projekt oder für alle Sitzungen und klicke auf **Speichern**.

Die Änderung gilt ab deiner nächsten Nachricht. Claude Code und Codex lesen Anweisungen beim Start. Deshalb startet die App den Agenten mit der nächsten Nachricht unauffällig neu; das Gespräch läuft an derselben Stelle weiter. Solange der Agent einen Durchlauf bearbeitet, ein Ziel verfolgt oder Hintergrundaufgaben ausführt, wartet die App mit dem Neustart, bis er frei ist. Custom liest die Richtlinien ohnehin vor jedem Durchlauf. Andere Agenten wie Gemini CLI oder OpenCode übernehmen geänderte Richtlinien erst in ihrer nächsten Sitzung.

## Was gute Richtlinien ausmacht

- **Formuliere konkret, was du möchtest**: „Frage mich, bevor du etwas installierst“ ist klarer als „Sei vorsichtig“.
- **Dauerhafte Vorgaben gehören hierher, die Aufgabe in die Nachricht**: Richtlinien beschreiben, was grundsätzlich gelten soll.
- **Wähle die passende Ebene**: Deine bevorzugte Ansprache gehört in die allgemeinen Richtlinien, Projektregeln ins Projekt und einmalige Einschränkungen in die Sitzung.
- **Halte sie aktuell**: Wenn ein Agent wiederholt etwas Unerwünschtes tut, ergänze eine klare Vorgabe.

Beispiele:

- Für alle Sitzungen: „Antworte in verständlichem Deutsch. Erkläre Fachbegriffe beim ersten Auftreten. Frage nach, bevor du Dateien löschst oder etwas von diesem Computer versendest.“
- Für ein Projekt „Abschlussarbeit“: „Zitiere nach APA. Die Arbeit behandelt Milchwirtschaft in Griechenland. Lege Entwürfe im Ordner drafts ab.“
- Für eine Sitzung: „Verwende ausschließlich die Python-Standardbibliothek.“

## Wie Agenten dich ansprechen

Die frühere Einstellung **Wie Agenten dich ansprechen** unter Einstellungen → Funktionen → Assistenten, jetzt Deine Agenten, ist Teil der allgemeinen Richtlinien geworden. Dein bisheriger Text wurde dort als Zeile mit dem Anfang „So sprichst du mit mir:“ übernommen. Du kannst ihn dort ändern oder entfernen.

## CLAUDE.md und AGENTS.md

Claude Code und Codex lesen weiterhin eigene Anweisungsdateien: CLAUDE.md für Claude Code und AGENTS.md für Codex. Dateien im persönlichen Ordner gelten für alle Sitzungen; Dateien im Projektordner für die dortige Arbeit. Wenn du solche Dateien in einem Repository mit anderen teilst, kannst du sie weiterhin hier bearbeiten:

1. Öffne [Einstellungen → Agenten → Agentenrichtlinien](/settings?s=guidelines).
2. Öffne **Anweisungsdateien** in der letzten Gruppe unter **Für eine Sitzung**. Der Hinweis nennt „CLAUDE.md und AGENTS.md in einem Projektordner“; das (i) erläutert den Zweck.
3. Wähle den Ordner, dann **Claude Code** oder **Codex** und die zu bearbeitende Datei. Mit **Erstellen** legst du eine neue Datei an.

Die Liste zeigt alle Dateien, die der Agent für eine Sitzung in diesem Ordner liest, in ihrer Lesereihenfolge. Für die meisten Anwendungsfälle sind Richtlinien einfacher: Diese gelten für alle Agenten und benötigen keine eigenen Dateien.

## Frag einen Agenten

- „Ergänze meine Richtlinien: Antworte immer auf Griechisch.“
- „Welche Richtlinien gelten für diese Sitzung?“
- „Ergänze im Projekt Abschlussarbeit die Richtlinie: nach APA zitieren.“
- „Entferne die Zeile zur britischen Rechtschreibung aus meinen Richtlinien.“
- „Verwende nur in dieser Sitzung ausschließlich die Standardbibliothek.“
