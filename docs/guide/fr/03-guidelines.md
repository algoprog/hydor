# Consignes des agents

Les consignes des agents, c’est ce que vous voulez que chaque agent suive ici : votre façon de travailler, ce qu’il doit toujours ou ne jamais faire, la manière de vous parler. Un seul texte vaut pour tous les agents (Claude Code, Codex, Custom et les agents qui parlent ACP), et vous pouvez le rédiger pour toutes les sessions, pour un projet ou pour une seule session.

![Paramètres → Consignes des agents : ce que suit chaque session, et les consignes de chaque projet](images/guidelines.webp)

## Ce que sont les consignes

Les consignes sont des mots simples que l’app transmet à l’agent au démarrage d’une session, avant votre premier message : « Réponds en français simple et explique le jargon », « Demande-moi avant de supprimer quoi que ce soit », « Garde ce que tu produis dans ~/Work », « Utilise l’orthographe rectifiée ». L’agent les suit pendant toute la session.

Vous n’avez pas besoin de savoir comment chaque agent lit ses instructions. Claude Code et Codex ont chacun leurs propres fichiers pour cela (CLAUDE.md et AGENTS.md), et les autres agents ont leurs propres méthodes ; l’app transmet elle-même vos consignes à chacun d’eux, donc un seul texte suffit pour tous.

Ce que vous demandez dans la conversation passe toujours en premier : si vos consignes disent « réponses courtes » et que vous demandez un rapport détaillé, vous obtenez le rapport.

## Les trois niveaux

Les consignes existent à trois niveaux, du plus général au plus précis :

1. **Pour toutes les sessions** : chaque agent, dans chaque session. À définir dans [Paramètres → Agents → Consignes des agents](/settings?s=guidelines).
2. **Pour un projet** : chaque session de ce [projet](/guide/projects). À définir dans les détails du projet (son onglet **Paramètres**), dans le champ **Consignes des agents**.
3. **Pour une session** : uniquement cette session. À définir sur la page de démarrage (**Options → Consignes**) avant son lancement, ou plus tard depuis le menu de la session (⋯) → **Paramètres de la session → Consignes**.

Un agent reçoit tous les niveaux qui s’appliquent à sa session, dans cet ordre. Quand deux niveaux se contredisent, le plus précis l’emporte : les consignes d’une session priment sur celles de son projet, et celles d’un projet priment sur celles pour toutes les sessions. (Le (i) à côté de **Pour une session** dans les Paramètres dit la même chose.)

## Rédiger les consignes pour toutes les sessions

1. Ouvrez [Paramètres → Agents → Consignes des agents](/settings?s=guidelines).
2. Sous **Pour toutes les sessions**, écrivez ce que chaque agent doit savoir sur vous et sur votre façon de travailler.
3. Cliquez sur **Enregistrer**.

Sous la zone de texte, **Partir de…** propose quelques manières toutes prêtes de faire parler les agents (**Français simple, réponses courtes, jargon expliqué**, **Chaleureux et encourageant : je débute**, **Bref et technique**). En choisir une l’ajoute sous forme de ligne (« Comment me parler : … »), que vous pouvez modifier avant d’enregistrer. **Enregistrer** reste grisé tant que vous n’avez rien changé ; **Annuler les modifications** rétablit ce qui était enregistré.

Chaque niveau accepte jusqu’à 20 000 caractères. Restez bref quand vous le pouvez : chaque session lit tout, et quelques lignes claires valent mieux que des pages.

## Donner des consignes à un projet

Chaque projet a ses propres consignes, pour le travail que vous y gardez : à qui il s’adresse, le style à employer, les règles du projet.

1. Dans la barre latérale des sessions, cliquez sur le nom du projet (**Détails du projet** s’ouvre), puis ouvrez l’onglet **Paramètres**.
2. Écrivez dans le champ **Consignes des agents : ce que suivent tous les agents du projet**.
3. Enregistrez le projet.

Vous pouvez aussi les rédiger à la création d’un projet : dans la fenêtre **Nouveau projet**, cliquez sur **Plus d’options**, puis écrivez dans **Consignes des agents**. **Paramètres → Agents → Consignes des agents → Pour un projet** liste chaque projet qui a des consignes, avec la première ligne de chacune (**Tout afficher** quand il y en a beaucoup) ; cliquez sur l’un d’eux pour ouvrir ce projet.

Dans un groupe (un projet qui rassemble plusieurs projets), ses sessions suivent les consignes propres au groupe, et lisent ce que demande chaque projet du groupe dans le cadre du travail avec ce projet.

## Consignes pour une session

### Avant son démarrage

1. Sur la page de démarrage, ouvrez **Options** (à côté de la zone de message).
2. Cliquez sur **Consignes**. Une boîte de dialogue s’ouvre sur **Cette session**.
3. Écrivez ce que cette session seule doit suivre, puis cliquez sur **Enregistrer**. La pastille Options affiche alors **Pour cette session**.

La même boîte de dialogue montre les consignes du projet (quand vous avez choisi un projet) et celles pour toutes les sessions, chacune sur son propre onglet, de sorte que vous voyez tout ce que l’agent suivra, et vous pouvez aussi les modifier. Un point sur un onglet signifie que ce niveau contient des consignes.

### Dans une session en cours

1. Ouvrez le menu de la session (⋯) → **Paramètres de la session → Consignes**.
2. Modifiez **Cette session** (ou celles du projet, ou celles de toutes les sessions), puis cliquez sur **Enregistrer**.

Une modification prend effet à partir de votre prochain message. Claude Code et Codex lisent leurs instructions à leur démarrage : quand vous envoyez votre prochain message, l’app relance donc discrètement l’agent avec les nouvelles consignes ; la conversation reprend là où elle en était. Cela attend que l’agent ait fini son tour, qu’il ne poursuive pas un objectif et qu’aucun travail ne tourne en arrière-plan : cela se produit une fois qu’il est inactif. Custom les lit de toute façon avant chaque tour. Les autres agents (Gemini CLI, OpenCode et les autres) prennent en compte les consignes modifiées à partir de leur prochaine session.

## Ce qui fait de bonnes consignes

- **Dites ce que vous voulez, simplement** : « Demande-moi avant d’installer quoi que ce soit » est plus clair que « sois prudent ».
- **Mettez ici ce qui dure, et la tâche dans le message** : les consignes servent pour ce qui reste vrai à chaque fois.
- **Utilisez le bon niveau** : la façon dont vous aimez qu’on vous parle va dans celles pour toutes les sessions ; les règles d’un projet dans son projet ; une contrainte ponctuelle dans la session.
- **Gardez-les à jour** : quand un agent continue de faire quelque chose que vous ne voulez pas, ajoutez une ligne.

Quelques exemples :

- Pour toutes les sessions : « Réponds en français simple. Explique le jargon la première fois. Demande avant de supprimer des fichiers ou d’envoyer quoi que ce soit hors de cet ordinateur. »
- Pour un projet « Thèse » : « Cite en style APA. La thèse porte sur l’élevage laitier en Grèce. Garde les brouillons dans le dossier brouillons. »
- Pour une session : « Utilise uniquement la bibliothèque standard de Python. »

## Comment les agents vous parlent

Le réglage qui s’appelait **Comment les agents vous parlent** (dans Paramètres → Capacités → Assistants, aujourd’hui Vos agents) fait désormais partie des consignes pour toutes les sessions : tout ce que vous y aviez écrit y a été déplacé, sous la forme d’une ligne qui commence par « Comment me parler : ». Modifiez-la ou supprimez-la à cet endroit.

## CLAUDE.md et AGENTS.md

Claude Code et Codex lisent aussi des fichiers d’instructions qui leur sont propres : CLAUDE.md (Claude Code) et AGENTS.md (Codex), dans votre dossier personnel pour toutes les sessions, et dans le dossier d’un projet pour les sessions qui y travaillent. Ils continuent de fonctionner comme avant. Les personnes qui gardent de tels fichiers dans un dépôt, pour les partager avec tous ceux qui y travaillent, peuvent toujours les modifier ici :

1. Ouvrez [Paramètres → Agents → Consignes des agents](/settings?s=guidelines).
2. Ouvrez **Fichiers d’instructions** dans le dernier groupe, sous **Pour une session** (son indication dit « CLAUDE.md et AGENTS.md dans le dossier d’un projet » ; son (i) explique pourquoi ils sont ici).
3. Choisissez le dossier, puis **Claude Code** ou **Codex**, et le fichier à modifier (ou **Créer** le fichier).

La liste montre chaque fichier que l’agent lit pour une session dans ce dossier, dans l’ordre où il les lit. Pour la plupart des gens, les consignes sont plus simples : elles valent pour tous les agents et n’ont besoin d’aucun fichier.

## Demander à un agent

- « Ajoute à mes consignes que tu dois toujours répondre en grec. »
- « Quelles consignes cette session suit-elle ? »
- « Donne à mon projet Thèse la consigne : citer en style APA. »
- « Retire de mes consignes la ligne sur l’orthographe rectifiée. »
- « Pour cette session uniquement, n’utilise aucune bibliothèque en dehors de la bibliothèque standard. »
