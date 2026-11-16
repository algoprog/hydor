# LLM Wiki

An LLM Wiki keeps linked knowledge from your sources in Markdown files. Hydor's agents can work with an existing wiki and help you build it over time.

## The idea

Andrej Karpathy described a wiki maintained by an AI agent: keep the original sources, then have the agent bring what they say together in linked articles. When another source arrives, the agent can update those articles and point back to the sources. The wiki becomes a place to build on earlier work and check where a claim came from.

## Set up your wiki

Open [Settings → Capabilities → Memory](/settings?s=memory) and find **LLM Wiki**. Turn it on, enter the absolute path to the **Wiki hub folder** on the computer running Hydor, and set the **Project wiki folder** relative to each project's folder. The hub defaults to `.wiki` in Hydor’s task folder (for example, `~/Hydor/.wiki`); the project wiki defaults to `.wiki` inside the project. An existing project binding takes precedence. Switches save immediately; folder paths save when you leave the field or press Enter. A container needs access to these paths inside the container.

When the current hub contains files, changing its folder opens a review. You can leave the files in place or move them. If the new folder contains files, you can combine both folders or replace the destination; for conflicting files, choose the source, destination, or older version by modification time. Hydor keeps complete backups of both original folders and shows their locations. Pause other programs that write to either folder during the move. Other tools configured with the old path need their own configuration updated. Changing the project wiki folder does not move project files.

Use **Browse** to choose the hub folder. The local desktop app opens the system folder dialog; in a browser or on another machine, Hydor shows folders on the machine running that instance and lets you create a folder there.

**Ignore project wikis in Git** is on by default. When Hydor writes to a project wiki, it can add its folder to `.gitignore`. You can turn this off; existing ignore entries remain. Files Git already tracks remain tracked.

## Add sources and ask questions

Ask an agent to add an authorized text source or to read a document or web page and add its text. It keeps the original source, records where it came from, and can update linked articles with source references. Ask it a question about the wiki and check the sources in its answer. Hydor uses its existing knowledge search for indexed wiki content; a changed or newly added file may take time to be indexed.

For a supported document file, ask the agent to add the document itself. Hydor keeps its original bytes alongside an extracted text note. Document files can be up to 20 MiB; the extraction may be incomplete.

You can ask the agent to check the wiki for basic structural, source and link issues. Existing wiki files stay in their Markdown format. Archived and retired material is excluded from ordinary wiki browsing and search.

## Read a project wiki

Open **Projects**, select a project, then open its **LLM Wiki** tab. Pick an article or a source to read it, follow its wiki links, and open its listed sources. If the wiki is off or the configured folder is missing, the tab says so. See [Projects and knowledge](/guide/projects#llm-wiki).

## Checkpoints and lessons learned

With memory and LLM Wiki enabled, Hydor's Custom agent can save checkpoints before and after its own context compaction and periodic event checkpoints in the hub. A checkpoint can contain a redacted agent summary or only event metadata; it is not a full transcript. For Claude Code and Codex, Hydor attempts a checkpoint when you start compaction from Hydor; automatic compaction within those agents has no verified hook coverage. A failed checkpoint does not stop compaction. Turning memory off for a session or globally prevents wiki session capture and rehydration; existing checkpoints remain.

Ask the agent to preview lessons learned from the session. The preview does not write data. It uses indexed messages, so the latest ones may be missing. Saving selected lessons requires your confirmation. See [Memory](/guide/memory#llm-wiki).
