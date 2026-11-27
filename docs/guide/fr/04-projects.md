# Projets et connaissances

Un projet réunit un travail en un seul endroit : ses sessions, un dossier pour ses fichiers (et d’autres dossiers à vous avec lesquels il travaille), ce dont les agents se souviennent à son sujet (des notes, un wiki et des documents qui lui sont propres), les consignes que tout agent du projet suit, ses propres compétences, l’agent avec lequel ses sessions démarrent, et des agents qui lui sont propres. Les Connaissances partagées regroupent les documents et les dossiers que vous ajoutez une seule fois pour que toutes les sessions puissent les consulter et citer le fichier et la page lus. Cette rubrique explique la page Projets, comment ouvrir les détails d’un projet, créer et utiliser des projets et des groupes de projets, donner à un projet des compétences qui lui sont propres, partager un projet avec d’autres personnes, et ajouter, rechercher et gérer les documents que les agents consultent.

![La page d’un projet : ses sessions, ses fichiers les plus récents et ce que reçoit chacune de ses sessions, sous ses onglets](images/projects.webp)

## Ce qu’est un projet

Un projet est un travail avec tout ce qui s’y rattache, comme les Projets dans ChatGPT ou Claude. Une déclaration d’impôts, une thèse, un jardin, un site web : chacun peut être un projet. Sur la page de démarrage, vous choisissez un projet par son nom plutôt qu’un dossier, et chaque session que vous y démarrez :

- **travaille dans le dossier du projet**. L’agent sait que ce dossier contient les fichiers du projet et qu’il doit y ranger ce qu’il produit pour le projet ; avec votre premier message, il reçoit aussi le contenu actuel du dossier (le plus récemment modifié en premier). Il travaille aussi avec les autres dossiers du projet, là où ils se trouvent : Claude Code y travaille comme dans son propre dossier, et les autres agents savent où ils sont ;
- **suit les consignes du projet** : ce que tout agent du projet doit savoir, par exemple pour qui est le travail, comment travailler et ce qu’il faut garder en tête (voir [Consignes des agents](/guide/guidelines)) ;
- **reçoit les compétences propres du projet** en plus de votre bibliothèque de compétences : des méthodes écrites pour réaliser son travail, que les agents chargent quand une tâche l’exige (voir [Donner à un projet des compétences qui lui sont propres](#give-a-project-skills-of-its-own)) ;
- **démarre avec l’agent du projet**, si le projet en a un (voir [Agents](/guide/agents)) ;
- **se souvient de ce que les sessions précédentes du projet ont appris** : les agents gardent des notes sur un projet d’après son dossier, si bien que les sessions d’un projet les partagent (voir [Mémoire](/guide/memory)) ;
- **consulte les documents propres du projet**, ainsi que les connaissances partagées, sauf si le projet les désactive (voir [Quelles sessions consultent quelles connaissances](#which-sessions-search-which-knowledge)).

Les sessions appartiennent à un projet selon l’endroit où elles travaillent. Toute session qui travaille dans le dossier du projet, ou dans un dossier qu’il contient, fait partie du projet, où qu’elle ait été démarrée : dans Hydor, dans Claude Code ou dans Codex. Quand le dossier d’un projet est à l’intérieur de celui d’un autre, c’est le projet intérieur qui la reçoit. Une session dans un worktree compte pour le dossier à partir duquel le worktree a été créé, et un projet dont le dossier est votre dossier personnel ne reçoit que les sessions situées dans le dossier personnel lui-même. Ainsi, créer un projet pour un dossier dans lequel vous travaillez déjà y fait entrer aussitôt ses sessions précédentes (la barre latérale les affiche sous le projet, et non dans un groupe de dossier), et une session que Hydor démarre dans le dossier d’un projet (depuis la page de démarrage, une tâche planifiée, une app ou l’API) démarre dans le projet, avec ses consignes, ses compétences et ses connaissances dès son premier tour.

Un projet peut aussi réunir d’autres projets. C’est un **groupe** : voir [Réunir des projets dans un groupe](#bring-projects-together-in-a-group).

## Ouvrir les détails d’un projet

L’endroit où s’affichent les détails d’un projet dépend de l’endroit où vous êtes. Dans la section **Projets** (la page Projets ou la page d’un projet), ils constituent la page même du projet, à la place de la liste. Depuis n’importe quel autre endroit (une session, les Paramètres…), ils s’ouvrent dans une fenêtre par-dessus la page où vous êtes, qui reste derrière, assombrie. Il existe plusieurs façons d’y accéder :

- **Depuis la page Projets** : cliquez sur la carte d’un projet (voir [Retrouver tous vos projets](#find-all-your-projects)). La page du projet s’ouvre.
- **Depuis la barre latérale** : dans la liste des sessions, cliquez sur le nom du projet dans son en-tête (sur un téléphone, ouvrez d’abord la barre latérale, car c’est un tiroir, puis touchez le nom ; le tiroir se ferme et les détails occupent l’écran). Son menu ⋯ propose aussi **Détails du projet**, en premier élément. La petite flèche à côté du nom replie ou déplie les sessions du projet.
- **Depuis le champ de recherche** : saisissez le nom du projet dans le champ de recherche (Ctrl+K, ou ⌘K sur un Mac) et choisissez-le. Dans la section Projets, sa page s’ouvre ; ailleurs, c’est la fenêtre. Un projet qui n’a pas encore de session n’a pas d’en-tête dans la barre latérale : ce champ et la page Projets sont donc les moyens d’y accéder (un projet que vous venez de créer s’ouvre tout seul).
- **Depuis un lien** : un lien vers un projet dans une notification ou dans la réponse d’un agent, suivi depuis une autre page, ouvre lui aussi la fenêtre par-dessus cette page.
- **Par son adresse** : saisir ou recharger `/projects/<id>`, suivi éventuellement d’un onglet, ouvre la page du projet.

La page et la fenêtre affichent les mêmes éléments :

- **L’en-tête**, à la couleur du projet : sur la page du projet, une flèche en haut à gauche (**Tous les projets**) ; puis son symbole et son nom, et en dessous ce sur quoi il porte (son dossier quand il n’a pas de description ; un groupe indique les noms des projets qu’il rassemble). À droite, **Nouvelle session** démarre une session dans le projet (sur un téléphone, le stylo) et **Plus** (⋯) contient le menu du projet (voir [Le menu du projet](#the-projects-menu)). La fenêtre comporte aussi ✕, qui la ferme.
- **Ses onglets** : **Vue d’ensemble**, **Fichiers**, **Mémoire**, **Compétences**, **Agents** et **Paramètres** (voir [Les détails d’un projet](#a-projects-details)).

**Sur la page du projet**, la flèche ramène à la page Projets, tout comme le bouton Précédent du navigateur ; il n’y a pas de ✕. L’onglet où vous êtes figure dans l’adresse de la page (`/projects/<id>/files`, `/projects/<id>/memory`…) : un rechargement ou un lien le conserve donc. Il en va de même pour un dossier que vous ouvrez dans l’onglet **Fichiers**, et Précédent permet d’en ressortir. Un lien qui y mène vers un autre projet (qu’un groupe rassemble) ouvre la page de ce projet. Supprimer le projet vous ramène à la page Projets.

**La fenêtre** se ferme avec ✕, avec Échap ou d’un clic sur la page assombrie à l’extérieur. Passer à une autre page la ferme aussi : ouvrir un document depuis l’onglet **Fichiers**, par exemple, ou suivre un lien. Sur un téléphone, la fenêtre remplit l’écran. Échap ferme d’abord un menu ou une boîte de dialogue placés par-dessus la fenêtre, puis la fenêtre.

## Retrouver tous vos projets

**Projets** dans la barre d’icônes (juste avant **Fichiers** ; sur un téléphone, dans la grille d’outils du tiroir de la barre latérale) ouvre la page Projets, ou rendez-vous sur [/projects](/projects). Elle liste chaque projet sous forme de carte, sur toute la largeur de la page, sans colonne à côté de la barre d’icônes. Le titre indique combien il y en a.

- **Nouveau projet** en crée un (voir [Créer un projet](#make-a-project)). Son ▾ propose **Nouveau projet** et **Nouveau groupe de projets…**, qui demande deux projets à réunir (voir [Créer un groupe](#make-a-group)).
- **Rechercher un projet** filtre les cartes au fil de la saisie, par nom, description et dossier.
- Le bouton à côté les trie : **Activité récente** (le projet qui a travaillé le plus récemment en premier, l’ordre habituel), **Nom** ou **Plus de sessions**. Ce navigateur garde votre choix.

Chaque carte affiche :

- un bandeau à la couleur du projet avec son repère, et des pastilles : **Groupe** pour un groupe, et **Depuis Claude Code** ou **Depuis Codex** pour un projet que Hydor a trouvé (voir [Projets trouvés dans Claude Code et Codex](#projects-found-in-claude-code-and-codex)) ;
- son nom, de quoi il s’agit (un groupe indique « Réunit » suivi des noms de ses projets), et son dossier ;
- ce qu’il contient : ses sessions, documents, compétences et fichiers conservés, et « Partagé avec 2 personnes » une fois que vous le partagez ;
- « 2 en cours » tant que ses sessions travaillent, et un point quand une session s’est terminée depuis votre dernier passage ;
- quand il a travaillé pour la dernière fois, et de petites barres pour les messages de ses quatre dernières semaines.

Pointez une carte (sur un écran tactile, ces boutons sont toujours visibles) : **Nouvelle session** démarre une session dans le projet, et **Plus** (⋯) contient le menu du projet : **Ouvrir son dossier dans Fichiers**, dans l’app de bureau **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier**, **Seulement ses sessions dans la barre latérale**, **Partager avec des personnes** et **Supprimer le projet** (voir [Le menu du projet](#the-projects-menu)). Cliquez ailleurs sur une carte pour ouvrir la page du projet, avec une flèche pour revenir à tous les projets (voir [Ouvrir les détails d’un projet](#open-a-projects-details)). Déposez des fichiers de votre ordinateur sur une carte pour les placer dans le dossier du projet.

Sous les cartes, **Dossiers dans lesquels vous travaillez** liste les dossiers dans lesquels vos sessions ont travaillé récemment et qu’aucun projet n’a encore (voir [Dossiers dans lesquels vous travaillez, pas encore dans un projet](#folders-you-work-in-not-in-a-project-yet)). **Créer un projet** sur l’un d’eux ouvre la fenêtre **Nouveau projet** avec ce dossier choisi ; ✕ (**Pas un projet : ne plus le suggérer**) le retire définitivement de la liste. La liste est omise pendant une recherche.

Sans projet pour l’instant, la page explique ce qu’est un projet et propose **Nouveau projet**. Une recherche sans résultat l’indique.

## Créer un projet

1. Sur la page Projets, cliquez sur **Nouveau projet** (voir [Retrouver tous vos projets](#find-all-your-projects)). Ou cliquez sur le **+** à la fin de l’en-tête **Projets** de la barre latérale (il apparaît quand vous pointez l’en-tête, et il est toujours visible sur un écran tactile) et choisissez **Nouveau projet…**. Le bouton de filtre de la barre latérale (**Filtrer et regrouper les sessions**) propose aussi **Nouveau projet…**, tout comme le menu des dossiers de la page de démarrage, à côté de son en-tête **Projets** (voir [Démarrer une session dans un projet](#start-a-session-in-a-project)). L’en-tête d’un dossier dans la barre latérale propose **En faire un projet**, tout comme chaque dossier sous **Dossiers dans lesquels vous travaillez** sur la page Projets (voir [Dossiers dans lesquels vous travaillez, pas encore dans un projet](#folders-you-work-in-not-in-a-project-yet)).
2. Remplissez la fenêtre :
   - **Nom** : le nom que vous donnez au projet, par exemple « Impôts 2026 », « Le jardin » ou « Thèse ». 60 caractères au maximum. C’est le seul champ obligatoire. Le carré à côté est le repère du projet, dans la couleur qu’il recevra : cliquez dessus pour en choisir une autre parmi les huit couleurs (ambre, bleu, vert, rose, violet, turquoise, orange, ardoise). Si vous n’en choisissez aucune, les projets prennent les couleurs à tour de rôle.
   - **Où vont ses fichiers** : choisissez l’une des deux options.
     - **Dans un nouveau dossier** (le choix habituel) : l’app crée pour le projet un dossier à lui, qui porte son nom.
     - **Dans un dossier existant** : un projet ou un dossier de documents sur cet ordinateur, qui reste où il est. En dessous, **Utilisés récemment, dans aucun projet** affiche des dossiers dans lesquels vos sessions ont travaillé récemment, à choisir d’une seule touche ; ou cliquez sur **Choisir un dossier…** et cherchez-en un par son nom ou saisissez son chemin. Si vous le choisissez alors que le nom est encore vide, le nom du dossier devient celui du projet. **Variation** en choisit un autre.
3. Si vous le souhaitez, cliquez sur **Plus d’options** pour le reste (un point à côté signifie que quelque chose y est renseigné) :
   - **De quoi il s’agit** : une ligne affichée sous le nom. 300 caractères au maximum.
   - **Consignes des agents** : ce que tout agent du projet doit suivre, par exemple pour qui est le travail, comment travailler et ce qu’il faut garder en tête : « Montants en EUR. Je suis indépendant en Grèce. » 20 000 caractères au maximum. Voir [Consignes des agents](/guide/guidelines).
   - **Autres dossiers qu’il utilise** : d’autres dossiers à vous avec lesquels ses agents travaillent, là où ils se trouvent ; rien n’est copié. **Ajouter un dossier** en ajoute un, jusqu’à 12 ; ✕ en retire un.
4. Laissez activé **Un agent pour lui** pour qu’un agent soit créé pour le projet (voir [Agents](#agents)), ou désactivez-le.
5. Cliquez sur **Créer le projet**, ou appuyez sur Entrée dans le champ du nom.

Un nouveau dossier est placé dans un dossier **Projects**, à l’endroit où vont les dossiers de tâche : « Impôts 2026 » obtient `~/Hydor/Projects/taxes-2026`, sauf si vous avez déplacé les dossiers de tâche ailleurs (voir [Déplacer les dossiers de tâche](/guide/agents#move-task-folders)). Si ce nom est déjà pris, l’app ajoute `-2`, `-3` et ainsi de suite. Si le projet est créé depuis la page Projets, la page du nouveau projet s’ouvre. S’il est créé depuis la barre latérale, ses détails s’ouvrent dans une fenêtre par-dessus la page où vous êtes. S’il est créé depuis la page de démarrage, le nouveau projet est sélectionné pour la session que vous vous apprêtez à démarrer.

Deux autres réglages se font ensuite dans l’onglet **Paramètres** du projet : l’agent avec lequel ses sessions démarrent, et les projets qu’il réunit. Ses notes, son wiki et ses documents se trouvent dans son onglet **Mémoire**, ses compétences dans son onglet **Compétences**, et d’autres dossiers dans son onglet **Fichiers** (voir [Les détails d’un projet](#a-projects-details)).

### Un projet pour un dossier existant

Dans la fenêtre **Nouveau projet**, choisissez **Dans un dossier existant** sous **Où vont ses fichiers**, puis le dossier : le projet y travaille, et aucun nouveau dossier n’est créé. Un agent peut aussi le faire : « Crée un projet nommé Boutique pour ~/code/shop ». Le dossier propre d’un projet ne peut plus être changé une fois le projet créé, mais les dossiers avec lesquels il travaille le peuvent : voir [Fichiers](#files). Les sessions qui travaillaient déjà dans ce dossier rejoignent aussitôt le projet. Si Hydor a déjà fait un projet de ce dossier (voir [Projets trouvés dans Claude Code et Codex](#projects-found-in-claude-code-and-codex)), en créer un vous-même fait de ce projet le vôtre au moment où vous le créez, avec votre nom, votre couleur, votre description et vos consignes. C’est le même projet avec ses sessions, et il n’indique plus où il a été trouvé.

### Projets trouvés dans Claude Code et Codex

Hydor liste les sessions que vous aviez dans Claude Code et Codex en dehors de Hydor : dans un terminal, VS Code, l’app de bureau de Claude ou l’app Codex (voir [La liste des sessions](/guide/start#the-session-list)). Les dossiers dans lesquels vous travaillez avec eux deviennent désormais d’eux-mêmes des projets Hydor : votre travail vous y attend comme un projet, avec ses sessions.

- **Quand un dossier devient un projet** : dès qu’au moins deux sessions que vous avez démarrées vous-même dans Claude Code ou Codex y ont travaillé, dans un terminal, VS Code, l’app de bureau de Claude ou l’app Codex. Les sessions qu’un script ou un autre programme a exécutées (comme `codex exec` ou l’Agent SDK), les sessions qu’un agent a démarrées pour une partie de son travail (des sous-agents) et les sessions propres à Hydor ne comptent pas. Une session dans un sous-dossier d’un dépôt Git compte pour le dépôt entier.
- **Les projets propres à Codex** : les projets que vous gardez dans l’app Codex, y compris les dossiers qu’elle garde pour vos projets ChatGPT, deviennent des projets dès qu’une session a travaillé dans l’un de leurs dossiers. Le projet reprend le nom que Codex lui donne, son premier dossier comme dossier propre du projet, et ses autres dossiers comme dossiers avec lesquels le projet travaille.
- **Ce qui est écarté** : votre dossier personnel ; les dossiers cachés (hors dossiers des projets propres à Codex) ; les dossiers temporaires ; les dossiers que l’app crée pour elle-même (dossiers de tâches, exécutions des apps, worktrees et ses données) ; les dossiers que vous avez marqués **Pas un projet** ; et les dossiers qu’un projet a déjà : son dossier propre, un dossier avec lequel il travaille, ou un dossier situé à l’intérieur de ceux-ci.
- **Quand** : une fois que Hydor a lu vos sessions après son démarrage, puis dans la minute environ qui suit l’arrivée de nouvelles sessions.
- **Son nom** : le nom que vous avez donné au dossier dans la barre latérale (**Renommer**), sinon le nom du projet Codex, sinon le nom du dossier lui-même. Si un projet porte déjà ce nom, le nom du dossier parent est placé devant (« client/app »), puis un numéro.
- **Dans la barre latérale** : son groupe est celui du projet, avec sa marque et son nom et, après le nom, les marques des programmes dans lesquels il a été trouvé. Pointez le nom, ou ouvrez le **⋯** de l’en-tête, pour voir d’où viennent ses sessions (**Démarrée en dehors de Hydor**), comme pour le groupe d’un dossier. Ses détails s’ouvrent comme ceux de n’importe quel projet (voir [Ouvrir les détails d’un projet](#open-a-projects-details)) ; ils n’indiquent pas où le projet a été trouvé.
- **Un projet comme les autres** : son dossier propre est le dossier où ces sessions ont tourné, et rien n’est déplacé ni copié. Il a des documents, des compétences, des consignes, un agent, des fichiers et un partage comme tout projet, et vous pouvez le renommer, le décrire ou le supprimer. Les compétences propres à Claude Code dans le dossier `.claude/skills` apparaissent dans son onglet **Compétences** comme avant, et le fichier CLAUDE.md ou AGENTS.md du dossier est toujours lu par les agents comme avant.
- **Si vous le supprimez**, Hydor ne le recrée pas, et vous pouvez toujours créer vous-même un projet pour ce dossier (voir [Supprimer un projet](#delete-a-project)).

Pour voir quels projets sont venus ainsi, repérez les repères de programmes après le nom d’un projet dans la barre latérale, ou demandez à un agent.

### Dossiers dans lesquels vous travaillez, pas encore dans un projet

Un dossier dans lequel travaillent au moins deux de vos sessions, et qu’aucun projet n’a encore, a son propre groupe dans la barre latérale, sous **Projets**, avec le nom du dossier. Pointez son en-tête et ouvrez son **⋯** pour trouver **En faire un projet** : la fenêtre **Nouveau projet** s’ouvre avec ce dossier choisi et son nom déjà rempli. Le même menu propose **Renommer**, **Utiliser le nom du dossier** (une fois que vous l’avez renommé) et **Ouvrir dans Fichiers**.

Quand vous créez vous-même un projet pour un dossier (ou depuis la fenêtre **Nouveau projet**), les dossiers dans lesquels vos sessions ont travaillé récemment, au cours des 90 derniers jours, ou dont elles ont modifié des fichiers en travaillant ailleurs, et qu’aucun projet n’a encore, apparaissent sous **Utilisés récemment, dans aucun projet**, si bien qu’une seule touche suffit à en choisir un (voir [Créer un projet](#make-a-project)). La page Projets liste les mêmes dossiers sous ses cartes, sous le titre **Dossiers dans lesquels vous travaillez**, chacun avec **Créer un projet** (voir [Retrouver tous vos projets](#find-all-your-projects)). Les plus utilisés, et les plus récents, viennent en premier. Un dossier à l’intérieur d’un projet géré avec Git compte pour le projet entier.

Les dossiers dans lesquels vous travaillez avec Claude Code et Codex deviennent d’eux-mêmes des projets ; il s’agit donc surtout de dossiers dans lesquels vous avez travaillé depuis Hydor. Votre dossier personnel, les dossiers cachés, les dossiers temporaires et les dossiers que l’app crée pour elle-même (dossiers de tâches, exécutions des apps, worktrees) ne sont jamais suggérés. Dès qu’un projet a un dossier, comme dossier propre ou comme l’un de ceux avec lesquels il travaille, le dossier sort de cette liste. Pour empêcher Hydor de faire de lui-même un projet d’un dossier, demandez à un agent : il tient une liste de dossiers qui ne sont pas des projets, et supprimer un projet y ajoute son dossier (voir [Supprimer un projet](#delete-a-project)).

## Démarrer une session dans un projet

Il y a deux façons de faire :

- **Depuis le projet** : cliquez sur le stylo au bout de son en-tête dans la barre latérale, ou sur **Nouvelle session** en haut de ses détails (sur un téléphone, le stylo). La page de démarrage s’ouvre avec le projet sélectionné et avec ce que vous y aviez choisi auparavant ; si vous n’y avez encore rien choisi, avec son agent s’il en a un.
- **Depuis la page de démarrage** : ouvrez la pastille du dossier dans la rangée située sous la zone de message. Son menu comporte deux courtes listes : **Projets**, les cinq sur lesquels vous avez travaillé le plus récemment (et celui qui est sélectionné, s’il n’en fait pas partie), chacun avec son repère, son nom et son dossier ; puis **Dossiers**, le dossier en cours d’utilisation et ceux que vous avez utilisés en dernier ; puis **Nouveau dossier de tâche**. **Nouveau**, à côté du titre **Projets**, crée un projet et le sélectionne. Saisissez une partie d’un nom dans le champ en haut pour trouver n’importe quel projet ou dossier. Le dossier propre à un projet n’est jamais listé comme un dossier : trouvé par son nom ou son chemin, ou sélectionné auparavant sur la page de démarrage comme dossier, c’est le projet, et la session travaille dans le projet.

Lorsque vous sélectionnez un projet, la pastille affiche son repère et son nom à la place d’un dossier, et la session travaillera dans le dossier du projet. Dans un projet où vous n’avez encore rien sélectionné, la pastille **Agent** affiche l’agent propre au projet lorsqu’il en a un, avec le programme, le modèle et les autorisations que cet agent suggère, sinon **Général** ; dans un projet où vous avez déjà fait des choix, elle affiche ce que vous y avez sélectionné. Vous pouvez encore modifier chacun de ces éléments avant de démarrer. Saisissez ensuite votre message et cliquez sur **Début**.

Chaque projet conserve ses propres choix sur la page de démarrage : son programme, son modèle, son effort, ses autorisations, son agent, sa mémoire, son plafond de dépenses, **Confidentielle** et **Nouveau worktree** (voir [Ce dont se souvient la page de démarrage](/guide/sessions#what-the-start-page-remembers)). La page de démarrage retient le projet pour votre prochaine session, sur tous les appareils que vous utilisez. Pour retravailler en dehors d’un projet, sélectionnez un dossier ou **Nouveau dossier de tâche** dans le même menu. Si un projet que vous aviez sélectionné est supprimé, la page de démarrage conserve son dossier mais plus le projet.

Sur téléphone, le menu s’ouvre sous forme de feuille depuis le bas de l’écran, intitulée « Projet ou dossier où travailler », et le clavier attend que vous touchiez le champ.

Lorsque le dossier du projet est un dépôt Git, le bas du menu propose **Nouveau worktree**, comme pour tout dossier d’un dépôt : la session travaille alors sur sa propre branche, dans une copie séparée du dépôt (voir [Sessions](/guide/sessions)). Les sessions que vous démarrez à la voix en mode mains libres démarrent à l’endroit sélectionné en dernier sur la page de démarrage, avec ses choix (voir [Documents, images, vidéos et voix](/guide/documents-voice)).

## Les détails d’un projet

Ouvrez-les comme décrit dans [Ouvrir les détails d’un projet](#open-a-projects-details). Leurs onglets sont **Vue d’ensemble**, **Fichiers**, **Mémoire**, **Recherche** (seulement dans un projet qui contient de la recherche : voir ci-dessous), **Compétences**, **Agents** et **Paramètres**. **Mémoire** et **Compétences** affichent un nombre, sauf sur un téléphone, où les onglets n’en affichent pas. Sur un téléphone (ou dans une fenêtre étroite), les onglets qui ne tiennent pas se trouvent sous **Plus**, au bout de la rangée : touchez-le pour en afficher le menu. Quand l’un d’eux est ouvert, son nom s’affiche à cet endroit au lieu de **Plus**. Chaque onglet s’affiche immédiatement.

### Le menu du projet

**Plus** (⋯), dans l’en-tête, propose :

- **Ouvrir son dossier dans Fichiers** : le dossier du projet sur la page Fichiers.
- **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** : dans l’app de bureau, le dossier du projet sélectionné dans le gestionnaire de fichiers du système (voir [Travailler avec des fichiers et des dossiers](/guide/files-git#work-with-files-and-folders)).
- **Seulement ses sessions dans la barre latérale** : la liste des sessions n’affiche que les sessions du projet, comme le filtre propre à la barre latérale (voir [Afficher les sessions d’un seul projet dans la barre latérale](#show-one-projects-sessions-in-the-sidebar)). Choisissez-le de nouveau pour voir toutes les sessions.
- **Partager avec des personnes** : invitez quelqu’un (un directeur de recherche, un étudiant) à voir le projet et à commenter ses documents via un lien qui lui est propre (voir [Partager un projet avec des personnes](#share-a-project-with-people)).
- **Supprimer le projet** (voir [Supprimer un projet](#delete-a-project)).

### Vue d’ensemble

Le projet en un coup d’œil, sous forme de cartes :

- **Jobs**, en haut, seulement tant que le projet a des [traitements](/guide/jobs) en cours ou en attente, ou des serveurs restés en marche : jusqu’à six d’entre eux (trois sur un téléphone), avec leur progression, le temps restant et ce qu’ils attendent. Cliquez sur l’un d’eux pour ouvrir son panneau, avec ses détails et sa sortie ; son menu ⋯ propose **Détails et sortie**, **Ouvrir la session** (**Ouvrir l’exécution** pour une exécution d’Expériences), **Modifier les étiquettes…** et **Arrêter**. **Tous les traitements** (**Tous** suivi de leur nombre, quand il y en a plus que la carte n’en montre) ouvre Jobs avec les seuls traitements de ce projet (voir [Voir les traitements d’un projet](/guide/jobs#see-one-projects-jobs)). La carte d’un groupe réunit aussi les traitements de ses projets.
- **Sessions** : les sessions du projet (démarrées dans celui-ci, ou travaillant dans son dossier, dans Hydor, Claude Code ou Codex), celle qui a travaillé le plus récemment en premier, chacune avec l’icône de son agent, son titre, ce qu’elle fait pendant son exécution (**En cours**, **Votre intervention est requise**, **Prêt** ; pas sur téléphone) et le temps écoulé depuis son dernier travail. Cliquez sur l’une d’elles pour l’ouvrir. Au-delà de six, **Tout** affiche le reste. Si le projet n’en a encore aucune, la carte indique qu’une nouvelle session travaille dans le dossier du projet, avec ses consignes, ses documents et ses compétences, et propose **Nouvelle session**.
- **Fichiers** : les fichiers les plus récents du projet, six au maximum, sous forme de vignettes avec leurs images : ce qui a été conservé dans le projet (pages, documents, diapositives, images…) et les fichiers placés à la racine de son dossier, le dernier modifié en premier (le fichier propre d’un élément conservé qui s’y trouve apparaît une seule fois, comme cet élément). Cliquez sur l’un d’eux pour l’ouvrir. **Tous les fichiers** ouvre l’onglet **Fichiers**. La carte ne s’affiche que si le projet contient des fichiers.
- **Partagé avec** (à côté d’elles, en dessous sur téléphone), une fois le projet partagé avec quelqu’un : chaque personne, avec ses initiales et sa dernière action (« A commenté « Chapitre 3 » · il y a 2 h », « Pas encore ouvert »). Cliquez sur l’une d’elles, ou sur **Part**, pour voir et modifier les personnes avec lesquelles il est partagé (voir [Partager un projet avec des personnes](#share-a-project-with-people)).
- **Toutes les sessions d’ici** (à côté d’elles, en dessous sur téléphone) : ce que reçoit chaque session du projet. **Dossier** (son dossier, et le nombre d’autres dossiers avec lesquels il travaille : cliquez pour l’onglet **Fichiers**), **Consignes** (le début de ses consignes : cliquez pour **Paramètres**), **Mémoire** (ce dont il se souvient, en une ligne : « 12 notes · 8 articles · 5 documents », les articles n’apparaissant que si sa mémoire wiki est activée ; cliquez pour l’onglet **Mémoire**), **Compétences** (le nombre de compétences qui lui sont propres) et **Démarre comme** (son agent).
- **Les projets qu’il réunit**, pour un groupe : chacun de ses projets, avec son nombre de sessions. Cliquez sur l’un d’eux pour l’ouvrir.

### Fichiers

Les fichiers du projet : ce qui y est conservé, son dossier et les autres dossiers avec lesquels il travaille. L’onglet affiche un dossier comme le fait la [page Fichiers](/guide/files-git#browse-a-folder) : ouvrir, sélectionner plusieurs éléments, glisser, et le menu de chaque vignette ou ligne. Un fichier s’ouvre dans une fenêtre superposée à la page.

- Au-dessus du dossier, une pastille pour chacun : le dossier propre du projet, au nom du projet, et chaque dossier avec lequel il travaille, à son nom. Cliquez sur l’une d’elles pour l’afficher.
- **Joindre un dossier** ajoute un de vos dossiers avec lequel le projet peut travailler, là où il se trouve : cherchez-le par son nom ou saisissez son chemin. Rien n’est copié. Jusqu’à 12.
- ✕ sur la pastille d’un dossier l’écarte du projet ; le dossier lui-même reste tel quel. Le message propose **Annuler**.
- **Ouvrir dans Fichiers** ouvre le dossier sur la page Fichiers. Dans l’app de bureau, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans le menu du projet) l’affiche dans le gestionnaire de fichiers du système.

**Vignettes et liste.** Les fichiers s’affichent sous forme de vignettes avec leurs images, sauf si vous avez choisi vous-même **En liste** (le commutateur au bout de la barre mémorise votre choix sur ce navigateur). Chaque vignette comporte une image en haut, un petit badge indiquant son type pour les documents et assimilés (PDF, Word, Sheet, Slides, Notebook…), son nom et le moment de sa modification (« Modifié il y a 2 h ») ; son ⋯ apparaît quand vous la pointez. L’image est l’image elle-même pour les images, une image extraite pour les vidéos, la première page pour les PDF, la première page, diapositive ou les premières cellules pour les fichiers Word, PowerPoint, Excel et OpenDocument, l’aperçu de leur affichage pour les pages web et les notebooks, et les premières lignes pour les fichiers texte, Markdown, code, CSV et JSON. Tout le reste affiche l’icône de son type. La liste affiche les images sous forme de petites miniatures à la place des icônes (voir [Parcourir un dossier](/guide/files-git#browse-a-folder)).

**Ce que le projet conserve.** Chaque élément conservé dans le projet est aussi un fichier à lui dans le dossier du projet, nommé d’après son titre : les pages, designs, diapositives, documents, feuilles de calcul, documents LaTeX, notebooks et diagrammes que des agents ont créés et que vous avez conservés, les pages web enregistrées, ainsi que les images, vidéos et sons que vous avez conservés. Il apparaît dans la grille parmi les autres fichiers, dans le dossier où se trouve son fichier, avec un badge disant ce que c’est, et un clic l’ouvre dans son propre éditeur ou visualiseur (voir [Ce que vous conservez est aussi un fichier](/guide/files-git#kept-things-are-files-too)). Les tableaux de bord, dont les cartes sont en direct, et tout ce qui n’a pas de fichier à soi apparaissent en haut du dossier propre du projet (pas dans ses sous-dossiers, ni dans les dossiers avec lesquels il travaille), après les dossiers et avant les fichiers, le plus récent en premier : chacun affiche son image et son type, et son menu ⋯ propose ce qui lui convient, comme **Modifier**, **Renommer**, **Partager avec des personnes**, **Déplacer vers un autre projet**, **Dupliquer** et **Supprimer**. Le champ **Rechercher dans** au-dessus les filtre avec les fichiers. Ce que vous conservez dans une session sans projet reste avec cette conversation (voir [Conserver une page](/guide/library#keep-a-page)).

**Ajouter des fichiers.**

- **Importer** dans la barre importe des fichiers tels quels dans le dossier affiché ; sa flèche (**Autres façons de téléverser**) propose **Importer des fichiers** et **Importer un dossier**, qui amène le dossier avec ses fichiers. Un fichier Word, une feuille de calcul ou un fichier LaTeX s’ouvre dans les éditeurs de l’app, comme sur la page Fichiers.
- Déposez des fichiers ou des dossiers depuis votre ordinateur n’importe où sur l’onglet : « Déposer pour ajouter à « Thèse » » s’affiche tant qu’ils sont au-dessus. Sur téléphone, le **+** rond en bas (**Ajouter à ce dossier**) propose les mêmes éléments.
- **Nouveau** propose **Nouveau dossier**, **Nouveau fichier** et **Nouveau notebook**, **Importer des fichiers** et **Importer un dossier**, et en dessous les éléments que l’app crée : **Document**, **Diapositives**, **Feuille de calcul**, **Page**, **Design**, **LaTeX**, **Diagramme**, **Tableau de bord** et **Image**. Chacun ouvre la boîte de dialogue Nouveau correspondant à ce type, avec ce projet sélectionné (voir [Créer une page](/guide/library#make-a-page)). Quand un dossier situé dans celui du projet est ouvert, le nouvel élément est créé dans ce dossier.

Pour ajouter des fichiers depuis un autre endroit de l’app, utilisez **Ajouter à un projet** sur la page Fichiers, dans la fenêtre d’un fichier ou sur les cartes de fichiers d’un agent : un fichier est copié dans le dossier du projet (ou dans un dossier que vous choisissez à l’intérieur), un dossier rejoint ceux avec lesquels il travaille (voir [Ajouter des fichiers à un projet](/guide/files-git#add-files-to-a-project)).

### Mémoire

Ce que le projet retient, dans une seule liste : ses notes, les articles de son wiki, ses documents et ses résultats. Un champ de recherche en haut les parcourt tous à la fois, **Ajouter** permet d’ajouter une note, des fichiers ou un dossier à tenir à jour, et les pastilles **Tout**, **Notes**, **Wiki**, **Documents** et **Résultats** restreignent la liste. Cliquez sur une ligne pour l’ouvrir à droite (sur un téléphone, elle prend la place de la liste). Un lien vers une pastille ouvre le projet sur celle-ci, tout comme les adresses des anciens onglets Knowledge et LLM Wiki.

- **Notes** : les notes de mémoire que des agents ont conservées sur le projet, telles que les liste [Paramètres → Mémoire](/settings?s=memory), avec le profil du projet en premier. Ce sont les faits brefs avec lesquels démarre chaque session du projet (voir [Mémoire](/guide/memory)).
- **Wiki** : les articles et les sources de la mémoire wiki du projet, à lire. Les agents l’écrivent ; vous le lisez ici. Le menu **⋯** propose ses tâches et **Mises à jour du wiki…** (voir [Mémoire wiki](/guide/wiki-memory#a-projects-memory-tab)).
- **Documents** : les documents propres au projet, que seules ses sessions consultent, et les dossiers qu’il tient à jour. Voir [Donner des documents en propre à un projet](#give-a-project-documents-of-its-own). Les documents nouveaux et modifiés mettent aussi à jour les notes et le wiki du projet tant que la mémoire wiki et **Apprendre des nouveaux documents** sont activées (voir [Apprendre des nouveaux documents](/guide/wiki-memory#learn-from-new-documents)). Lorsqu’un projet compte plus de documents que son wiki n’en lit (100 au départ), le wiki lit les documents épinglés, ceux que les agents ont le plus utilisés et les plus récents, jusqu’à ce nombre, et la pastille l’indique : « Son wiki lit 100 de ses 240 documents : les épinglés, les plus utilisés et les plus récents. Les agents les parcourent tous. » Cliquez sur un document et activez **Lire dans la mémoire wiki** pour l’épingler (voir [Quand un projet a trop de documents](/guide/wiki-memory#when-a-project-has-too-many-documents)).
- **Résultats** : ce que le projet a essayé et ce que cela a donné, impasses comprises, chaque résultat avec son verdict et ses preuves (voir [Résultats](/guide/memory#findings-what-was-tried-and-what-came-of-it)).

### Recherche

Un projet qui contient de la recherche a cet onglet, après **Mémoire**, dès qu’il en a (les essais d’une commande ne comptent pas) : des exécutions d’[Expériences](/guide/experiments) lancées dans son dossier ou en dessous, un [résultat](/guide/memory#findings-what-was-tried-and-what-came-of-it) du projet, ou une [évaluation](/guide/experiments#evaluations-keeping-score-the-same-way) dans son dossier (une évolution appartient à son évaluation). C’est un point du matin sur ce que vos agents ont fait et ce qui requiert votre attention, de haut en bas. Il s’actualise tout seul pendant que vous le consultez, quand des exécutions changent et toutes les demi-minutes.

- **En attente de votre réponse** : des cartes, trois au maximum, puis **N de plus** ; s’il n’y a rien, « Rien n’attend votre intervention. » Ce qui bloque des exécutions (les exécutions retenues à votre limite d’heures GPU des agents, puis des fichiers scellés qui diffèrent) vient en premier, puis le reste, du plus récent au plus ancien.
  - **Les exécutions retenues à votre [limite d’heures GPU pour les agents](/guide/experiments#what-agents-may-use-gpu-hours)** : « 3 exécutions attendent : les agents ont utilisé les 100 h GPU que vous autorisez sur sept jours », avec **Les laisser s’exécuter** (ces exécutions, au-delà de la limite) et **Modifier la limite…**. Une recherche retenue à cette limite a sa propre carte, avec **La laisser s’exécuter** (toute la recherche) et **L’ouvrir**.
  - Une question, une approbation ou un formulaire qu’un agent du projet a soumis : la question, quand elle a été posée et dans quelle session. Une question à quelques choix uniques les présente sous forme de boutons qui y répondent immédiatement ; **Répondre dans la session** ouvre la session pour tout le reste.
  - Un objectif qui vous attend (ses vérifications à valider, quelque chose que vous seul pouvez fournir, une pause, une question) : **Répondre dans la session** ou **Ouvrir la session**.
  - **Les fichiers scellés d’une évaluation diffèrent** : le nombre de fichiers, avec **Voir ce qui a changé** (la liste des modifications de l’évaluation, où vous pouvez les rétablir ou les sceller de nouveau).
  - **Mesurer la référence d’une évaluation** qui n’en a pas : **Mesurer la référence** met ses exécutions en file d’attente, comme sur la page de l’évaluation ; **L’ouvrir** affiche l’évaluation.
  - **Exécuter le test final ?** quand un objectif a atteint son score et que le test final de l’évaluation n’a pas été exécuté depuis : **Exécuter le test final…** vous demande confirmation, comme la page de l’évaluation, avant que quoi que ce soit ne démarre ; **Pas encore** masque la carte jusqu’à ce que l’évaluation ait un nouveau meilleur score. Les agents n’exécutent jamais le test final et ne voient jamais ses chiffres.
  - **Une recherche que l’application a mise en pause** (une évolution, avec sa raison) : **Reprendre** la poursuit, **L’ouvrir** affiche la recherche.
- **Depuis votre dernière visite**, avec la date de celle-ci à droite ; à la première visite, **Les sept derniers jours**. Du plus récent au plus ancien, six lignes, puis **Afficher N de plus**, sous le nom des jours quand la période en couvre plusieurs. Les résultats enregistrés depuis (avec leur verdict comme dans Mémoire ; cliquez sur l’un d’eux pour le lire à cet endroit), les exécutions terminées depuis (une ligne par expérience, désignée par son titre quand elle en a un ; et une de plus, avec **Voir les exécutions**, quand plusieurs ont échoué pour la même raison : « 4 exécutions en échec faute de mémoire avec des lots de 4096, le même réglage à chaque fois »), les recherches qui ont essayé d’autres versions, les tours terminés par un objectif et un nouveau meilleur score. Une exécution en échec relancée par une tentative qui s’est ensuite terminée n’a pas besoin d’un coup d’œil : la ligne de son expérience dit « 2 ont échoué et ont été relancées », et elle ne figure pas parmi les échecs. Les exécutions archivées sont laissées de côté ici et dans le reste de l’onglet. Les nouveautés restent signalées pendant cette visite ; votre prochaine visite repartira de maintenant.
- **Où en est-on**, pour chaque évaluation du projet (des pastilles permettent de passer de l’une à l’autre, la dernière notée en premier) : la position de son meilleur score par rapport à la référence, dans les termes de l’évaluation, et si le test final a été exécuté, puis un graphique de tous les scores au fil du temps : un point par score, le meilleur à ce jour en ligne en escalier, la référence en pointillés, les scores en échec en petites marques rouges en bas, chaque palier nommé d’après ce qui a été mesuré (le titre du commit, sinon la branche ; sur un téléphone, seulement le meilleur actuel). Cliquez sur un point pour voir ce score. Un palier n’est nommé que lorsqu’il y a la place pour son nom, et un nom long est coupé. En dessous : **Meilleur**, **Référence**, **Scores** et **Résultats** (cliquez dessus pour les ouvrir dans Mémoire). Un projet sans évaluation affiche « Ce projet n’a pas encore de moyen de noter les résultats », avec **Nouvelle évaluation…** (l’éditeur d’évaluation, pour ce dossier) et **Demander à un agent d’en mettre une en place** (une nouvelle session dans le projet avec la demande rédigée, mais non envoyée).
- **En cours et en attente**, avec un lien vers **Expériences** : les exécutions du projet en cours (leur avancement, et le temps restant approximatif quand l’application le connaît) et en attente (d’un GPU, d’une place libre, de la file du cluster ou de la nuit ; « démarre vers 14:20 » quand l’application peut le prévoir), ainsi que les recherches et les objectifs au travail. Au-delà de quatre lignes, elles sont regroupées en décomptes tels que « 9 exécutions attendent un GPU ».
- **Cette semaine** : les heures GPU des exécutions du projet au cours des sept derniers jours (nombre de GPU multiplié par les heures d’exécution), et le coût des modèles de ses sessions aux tarifs de l’API, avec le nombre de sessions. Quand vous [limitez les heures GPU des agents](/guide/experiments#what-agents-may-use-gpu-hours), les heures affichées sont à la place ce que toutes les exécutions des agents sur cet ordinateur ont utilisé de cette limite (« 61 sur 100 h GPU »), avec une barre fine.

### Compétences

Toutes les compétences que reçoivent les sessions du projet : les siennes, celles de votre bibliothèque de compétences, et celles propres à Claude Code et à Codex, chacune avec un commutateur valable pour ce projet seulement. Voir [Donner des compétences propres à un projet](#give-a-project-skills-of-its-own).

### Agents

Les agents qui travaillent uniquement dans ce projet, en équipe : pour chacun, ce qui le déclenche (**Vous demandez**, et ses planifications avec leur prochaine exécution) et, en dessous, les agents auxquels il confie du travail, reliés par des lignes. Cliquez sur un agent pour le voir à côté du tableau : où il travaille, avec quoi il réfléchit, ce qu’il peut faire, qui le sollicite et ce qu’il a dépensé ce mois-ci, avec **Démarrer une session** (dans ce projet) et **Ouvrir** (sa page). Sous le tableau, **Également proposés ici, depuis Partout** liste les agents qui travaillent partout. **Nouvel agent ici** en crée un qui travaille dans ce projet (voir [Agents](/guide/agents)).

Un projet peut avoir un agent créé pour lui, avec **Un agent pour lui** quand vous créez le projet, ou **En créer un pour ce projet** sur cet onglet tant qu’il n’en a pas :

- Quand le projet en dit assez sur lui-même (de quoi il s’agit et ses consignes, ou un README ou des notes d’agent dans son dossier), le modèle d’appoint rédige un agent adapté, à partir du modèle correspondant à son type.
- Quand il en dit peu, l’agent est le modèle correspondant à son type, d’après le contenu de son dossier ou les mots avec lesquels il a été décrit : un ingénieur pour un logiciel, un développeur web pour un site web, un chercheur en ML pour des expériences d’apprentissage automatique, un analyste pour des données, un rédacteur d’article pour un article en LaTeX, un chercheur pour des articles et des rapports à lire, un rédacteur pour des documents, un designer pour des images et des vidéos, ou un présentateur pour des diapositives.
- Sans rien pour s’appuyer, c’est l’agent de projet par défaut.

Il porte le nom du projet (« Ingénieur Boutique »), travaille uniquement dans le projet et dans son dossier, et, sauf si le projet désigne un autre agent, les sessions du projet démarrent avec lui. Modifiez-le comme n’importe lequel de vos agents. Quand vous créez un projet depuis la page de démarrage, sa pastille **Agent** bascule sur cet agent dès qu’il est prêt, sauf si vous avez choisi un autre agent entre-temps.

### Paramètres

Tout ce qui concerne le projet lui-même, en six parties, chacune accompagnée d’une ligne sur son rôle :

- **Le projet** : son **Nom** (à côté de sa marque, dans la couleur choisie), **De quoi il s’agit** et **Sa couleur**.
- **Ce que suivent tous ses agents** : ses **Consignes des agents**, comme lors de sa création.
- **Comment ses sessions démarrent** : sous **Ses sessions démarrent comme**, un choix à toucher : **L’agent choisi sur la page de démarrage** (par défaut : la page de démarrage conserve l’agent que vous avez choisi dans le projet, Général tant que vous n’en choisissez pas un autre), ou l’un de vos agents, intégré ou personnel. Un projet où vous n’avez encore rien choisi s’ouvre alors sur la page de démarrage avec cet agent.
- **Mémoire wiki** : si le projet tient un wiki d’articles issus de ses documents et de son travail : **Comme dans les Paramètres (Activé)** (ou **(Désactivé)**, selon la valeur par défaut actuelle), **Activé** ou **Désactivé**. L’enregistrement est immédiat. [Paramètres → Mémoire](/settings?s=memory&find=Wiki%20memory) contient la valeur par défaut de tous les projets (voir [Mémoire wiki](/guide/wiki-memory#turn-it-on-or-off)). En dessous, **Documents les plus lus pour sa mémoire wiki** vaut **Comme dans les Paramètres (100)** ou **Un nombre propre** : un projet qui a plus de documents que ce nombre n’en fait lire que ce nombre à son wiki (les épinglés, les plus utilisés et les plus récents), et les agents les consultent tous (voir [Quand un projet a trop de documents](/guide/wiki-memory#when-a-project-has-too-many-documents)).
- **Consultable depuis d’autres projets** : un commutateur, activé par défaut, affiché pour un projet, pas pour un groupe. Activé, les agents de vos autres projets peuvent trouver et lire les notes, le wiki, les documents et les conversations de ce projet quand ils les cherchent (sans jamais les modifier) ; désactivé, le projet reste pour lui-même et ils ne le peuvent pas. Ses propres sessions ne sont pas concernées et peuvent toujours consulter vos autres projets. L’enregistrement est immédiat (voir [Chercher au-delà d’un seul projet](/guide/memory#search-beyond-one-project)).
- **Les projets qu’il réunit** : choisissez ici des projets pour transformer ce projet en groupe (voir [Réunir des projets dans un groupe](#bring-projects-together-in-a-group)).

Dès que vous modifiez quelque chose, une barre indique **Modifications non enregistrées**, avec **Annuler les modifications** et **Enregistrer** ; elle reste visible pendant le défilement. Tout en bas, **Supprimer le projet** indique ce qui reste, avec son bouton.

## Donner à un projet ses propres compétences

Les compétences sont des méthodes écrites que les agents chargent quand une tâche l’exige (voir [Compétences](/guide/skills)). Votre bibliothèque de compétences est accessible à toutes les sessions ; un projet peut aussi avoir ses propres compétences, que seules ses sessions reçoivent : la façon dont son travail se fait, étape par étape. « Citer en APA 7 et vérifier chaque DOI » pour une thèse, par exemple, ou « ingrédients en grammes, puis étapes numérotées » pour un livre de cuisine familial. Un projet peut aussi activer ou désactiver n’importe quelle compétence pour ses propres sessions. Les deux se trouvent dans l’onglet **Compétences** du projet.

L’onglet liste toutes les compétences que reçoivent les sessions du projet, en groupes comme dans [Paramètres → Compétences](/settings?s=skills), avec une zone de recherche, **Nouvelle compétence**, le menu **⋯** et des filtres : **Tout**, **Le sien**, **Intégré**, **Les vôtres**, **Des plugins**, **Claude Code et Codex** et **Modifiée ici**. Les compétences propres au projet viennent en premier, sous **Le sien** ; tant qu’il n’y en a pas, ce groupe explique à quoi elles servent, avec **Nouvelle compétence**.

**Nouvelle compétence** ouvre une fenêtre avec trois champs, puis **Ajouter la compétence** :

- **Nom** : des mots en minuscules séparés par des tirets, comme `citation-style`. Les espaces et les majuscules sont convertis ainsi quand vous quittez le champ. Les agents connaissent la compétence par ce nom.
- **Quand l’utiliser** : une ligne, par exemple « À utiliser pour citer une source dans la thèse ». Les agents la voient dans chaque session du projet et ne lisent le reste de la compétence que lorsqu’une tâche s’y prête.
- **La compétence** : les étapes dans l’ordre, les vérifications et les erreurs à éviter, en Markdown.

Pour modifier une compétence de votre bibliothèque pour ce projet seulement, ouvrez-la dans l’onglet et cliquez sur **Modifier pour ce projet** : elle est copiée dans le projet avec ses autres fichiers (exemples, scripts), et la fenêtre de modification s’ouvre. Celle de la bibliothèque reste telle quelle pour toutes les autres sessions.

Une compétence demande un nom de 2 à 64 caractères, une ligne sur le moment de l’utiliser d’au moins 10 caractères et des étapes de plus de quelques mots ; la compétence entière contient au plus 20 000 caractères. Une compétence qui semble contenir un mot de passe, une clé ou un jeton est refusée : indiquez plutôt où le secret est conservé.

### Activer ou désactiver une compétence pour ce projet

Chaque compétence de l’onglet a un interrupteur au bout de sa ligne : celles de votre bibliothèque (intégrées, les vôtres et celles de vos plugins), celles du projet, et celles propres à Claude Code et à Codex. Un interrupteur ici ne concerne que les sessions de ce projet ; ceux de [Paramètres → Compétences](/settings?s=skills) concernent toutes les autres sessions.

- Une compétence réglée à l’inverse des Paramètres affiche **Activée ici** ou **Désactivée ici**, et le filtre **Modifiée ici** n’affiche que celles-là. Une compétence désactivée dans les Paramètres apparaît comme **Désactivé** : activez-la pour l’avoir dans ce projet seulement.
- Dans sa fenêtre, une compétence modifiée ici indique ce que les Paramètres prévoient pour toutes les autres sessions, et **Suivre les Paramètres** y revient. La remettre à la main dans l’autre sens fait la même chose.
- Dans le menu **⋯**, **Activer toutes les compétences** et **Désactiver toutes les compétences** activent ou désactivent, après confirmation, toutes les compétences que l’onglet liste pour ce projet, et **Suivre les réglages par défaut pour toutes les compétences** remet, après confirmation, chaque compétence selon les Paramètres. **Modifier les réglages par défaut des compétences pour tous les projets** ouvre Paramètres → Compétences. Tout activer ou tout désactiver concerne toutes les compétences de l’onglet, y compris celles que les filtres masquent ; les compétences ajoutées plus tard suivent leur réglage habituel, et les sessions déjà en cours gardent le leur jusqu’à ce qu’elles redémarrent. Si les compétences propres à Codex n’ont pas pu être lues, la confirmation le signale, et elles restent telles quelles.

Une nouvelle session du projet reçoit les interrupteurs tels qu’ils sont à son démarrage ; une session déjà en cours garde ce avec quoi elle a démarré, bien que Custom prenne en compte dès son tour suivant un changement touchant les compétences de la bibliothèque et celles du projet. Les compétences propres à Claude Code et à Codex sont activées ou désactivées pour les sessions du projet sans modifier les réglages propres à ces agents, et Custom suit aussi ces interrupteurs pour elles. Dans Paramètres → Compétences, une compétence qu’un projet règle à l’inverse l’indique sur sa ligne (« Désactivée dans Thèse »).

### La liste des compétences d’un projet

Chaque compétence propre au projet apparaît sous forme de ligne : son nom, quand l’utiliser, et combien de fois les agents du projet (et des groupes qui l’intègrent) l’ont utilisée. Une compétence qui porte le nom de l’une de votre bibliothèque de compétences a le badge **À la place de celle de la bibliothèque** : les sessions du projet reçoivent celle-ci à la place de celle de la bibliothèque.

- Cliquez dessus pour lire la compétence et son **Historique** de modifications. **Variation**, en bas de cette fenêtre, modifie son nom, quand l’utiliser et son texte : un nouveau nom conserve ses autres fichiers, son historique et son interrupteur.
- **Retirer**, dans la même fenêtre, la retire après confirmation. Les sessions du projet ne la voient plus, ou retrouvent la compétence de la bibliothèque portant ce nom. Les compétences retirées sont listées sous la liste, après **Retirée :** : cliquez sur l’une d’elles pour la rétablir telle qu’elle était.

Dans un groupe, les compétences propres à chaque projet qu’il réunit suivent, sous le nom de ce projet : les sessions du groupe les reçoivent aussi. Modifiez-les dans les détails de ce projet. Les compétences propres à Claude Code et à Codex sont listées pour le dossier du projet : les vôtres, et celles qui se trouvent dans ce dossier (celles de Claude Code dans son `.claude/skills`).

### Comment les agents les reçoivent

Chaque session Claude Code, Codex et Custom démarrée dans le projet reçoit ses compétences avec votre bibliothèque de compétences, selon les interrupteurs du projet : Claude Code dans le même plugin nommé « hydor » (hydor:citation-style), Codex dans le même dossier supplémentaire de compétences, Custom dans sa liste de compétences. L’agent est aussi informé des compétences propres au projet, et de l’utiliser quand elle convient à la tâche. Custom prend une compétence que vous ajoutez ou modifiez dès son tour suivant ; Claude Code et Codex dès leur prochaine session.

Les compétences sont conservées dans le dossier de données de l’app, et non dans le dossier du projet : vos fichiers restent donc tels quels. Les sessions d’un groupe reçoivent aussi les compétences des projets qu’il réunit (voir [Ce que reçoivent les sessions d’un groupe](#what-sessions-in-a-group-get)).

### Compétences proposées par les agents dans un projet

Après une tâche qui a demandé un réel effort, un agent peut proposer de conserver sa méthode sous forme de compétence, ou d’améliorer une compétence qu’il a suivie, et vous l’approuvez, la modifiez ou l’écartez (voir [Approuver, modifier ou écarter une compétence proposée](/guide/skills#approve-edit-or-dismiss-a-proposed-skill)). Quand la session se déroule dans un projet, la carte demande où la conserver, sous **La garder pour** :

- **Toutes les sessions** : dans votre bibliothèque de compétences, comme en dehors d’un projet ;
- le nom du projet : dans les compétences du projet seulement. Pour une amélioration d’une compétence de la bibliothèque, le projet reçoit sa propre version avec la modification, et celle de la bibliothèque reste comme elle était.

L’agent suggère l’un des deux ; vous choisissez avant d’approuver. Une amélioration d’une compétence propre au projet n’offre aucun choix : elle reste celle du projet.

## Modifier un projet

Ouvrez les détails du projet, allez dans son onglet **Paramètres**, modifiez ce que vous voulez et cliquez sur **Enregistrer**. Les sessions que vous démarrez ensuite dans le projet reçoivent le nouveau nom, la nouvelle description et les nouvelles consignes. Un nouvel agent les applique la prochaine fois que vous choisissez le projet sur la page de démarrage, ou que vous cliquez sur **Nouvelle session** dans ses détails. Le dossier du projet ne change pas : il ne peut pas être déplacé vers un autre dossier.

## Supprimer un projet

1. Ouvrez les détails du projet, puis cliquez sur **Plus** (⋯) en haut, ou allez dans son onglet **Paramètres**.
2. Cliquez sur **Supprimer le projet**.
3. L’app demande « Supprimer le projet *nom* ? » Cliquez sur **Supprimer**. Pour un projet trouvé par Hydor, elle ajoute « Hydor l’a trouvé dans les sessions de Claude Code et ne le recréera pas. » (ou de Codex, ou de Claude Code et de Codex).

Supprimer un projet conserve tout ce qu’il contenait :

- **Son dossier** et les fichiers qu’il contient restent là où ils sont, tout comme les dossiers avec lesquels il travaillait.
- **Son dossier est placé dans la liste Pas un projet** : Hydor ne le proposera plus et n’en refera pas un projet de lui-même. Vous pouvez toujours créer vous-même un projet pour lui (**Nouveau projet** → **Dans un dossier existant**).
- **Ses sessions** restent, et n’appartiennent plus à aucun projet.
- **Ce qu’il a conservé** (pages, designs, documents, images…) reste, sans projet : avec la conversation qui l’a produit, et la zone de recherche (Ctrl+K) le trouve toujours. Sa propre page propose **Déplacer vers un projet** pour le ranger dans un autre. Les fichiers qu’ils avaient dans le dossier du projet y restent comme de simples fichiers.
- **Ses documents** passent dans les connaissances partagées, afin que toutes les sessions puissent y chercher désormais. Pour les garder à part, déplacez leur base de connaissances dans un autre projet (voir [Renommer, déplacer, relire ou supprimer une base de connaissances](#rename-move-read-again-or-delete-a-knowledge-base)).
- **Ses compétences** passent dans votre bibliothèque de compétences, afin que toutes les sessions les reçoivent désormais. Celle dont le nom est déjà celui d’une compétence de la bibliothèque prend le nom du projet après le sien : la compétence `research` du projet Thèse devient `research-thesis`.
- **Ce dont les agents se souviennent** à propos de son dossier reste : les notes appartiennent au dossier, pas au projet.
- Il quitte les groupes dont il faisait partie. Un groupe qui n’a plus aucun de ses projets devient un simple projet.

## Réunir des projets dans un groupe

Un groupe est un projet qui réunit plusieurs projets, pour un travail qui les traverse : « Tout pour la thèse » réunissant « Thèse » et « Notes de lecture », par exemple. Il a tout ce qu’a un projet : un nom, un dossier à lui, des consignes, des documents, des compétences et un agent. Ses sessions travaillent aussi avec chacun des projets qu’il réunit.

### Ce que reçoivent les sessions d’un groupe

- **Les dossiers des projets** : Claude Code peut travailler dans chacun d’eux comme dans son propre dossier ; les autres agents savent où se trouve chacun. Ce qu’une session produit va dans le dossier du groupe, sauf indication contraire.
- **Les consignes des projets** : après celles du groupe, le nom de chaque projet, de quoi il s’agit, son dossier et ses consignes.
- **Les documents des projets** : recherchés avec les documents du groupe et les connaissances partagées (sauf si le groupe désactive les connaissances partagées). L’agent sait de quel projet vient chaque base de connaissances.
- **Les compétences des projets**, avec celles du groupe et votre bibliothèque de compétences. Quand deux compétences portent le même nom, celle du groupe passe en premier, puis celle du projet réuni en premier.
- **La Mémoire** vient du dossier du groupe. Les notes que les agents ont conservées dans chaque projet restent avec ce projet.

### Créer un groupe

1. Sur la page Projets, ouvrez le ▾ à côté de **Nouveau projet** et choisissez **Nouveau groupe de projets…** (il faut deux projets). Ou, dans la barre latérale, cliquez sur le **+** au bout du titre **Projets** et choisissez **Nouveau groupe de projets…**. Il faut au moins un projet à réunir.
2. Dans **Nouveau groupe de projets**, donnez-lui un **Nom**, comme « Travail » ou « Tout pour la thèse ».
3. Sous **Les projets qu’il réunit**, touchez chaque projet à réunir ; touchez-le de nouveau pour le retirer. Choisissez-en au moins un.
4. Si vous le souhaitez, remplissez **De quoi il s’agit** et les **Consignes des agents**, et choisissez une couleur.
5. Cliquez sur **Créer le groupe**. Comme un projet, il reçoit un dossier à lui pour ce qui y est produit, et ses détails s’ouvrent.

Vous pouvez aussi transformer un projet existant en groupe : dans son onglet **Paramètres**, choisissez des projets sous **Les projets qu’il réunit** et cliquez sur **Enregistrer**. Modifiez les projets d’un groupe de la même façon. Retirez-les tous et il redevient un simple projet.

L’onglet **Mémoire** d’un groupe, sous sa pastille **Documents**, liste aussi **Également consultés :** chacun des projets qu’il réunit, avec son nombre de documents. Cliquez sur l’un d’eux pour ouvrir les documents de ce projet. Son onglet **Compétences** affiche de la même façon **Aussi les compétences des projets qu’il réunit**.

### Limites

- Un groupe réunit de simples projets, pas d’autres groupes : les groupes n’ont qu’un niveau de profondeur. Un projet qui fait partie d’un groupe ne peut pas réunir lui-même d’autres projets ; son onglet Paramètres indique à la place de quel groupe il fait partie.
- Un projet peut faire partie de plusieurs groupes.
- Un groupe réunit au plus 12 projets. Une fois 12 projets choisis, on ne peut plus toucher les autres.

## Afficher les sessions d’un seul projet dans la barre latérale

La barre latérale attribue à chaque projet son propre groupe, sous son nom et sa marque, avec ses sessions les plus récentes ; le stylo au bout du titre du groupe démarre une nouvelle session dans le projet. Voir [La liste des sessions](/guide/start#the-session-list). Un projet peut y avoir ses propres dossiers pour trier ses sessions : son menu **⋯** → **Nouveau dossier**, et ils apparaissent sous son titre, avant ses autres sessions. Voir [Trier les sessions dans des dossiers](/guide/start#sort-sessions-into-folders). La suppression d’un projet supprime ses dossiers ; ses sessions restent.

Pour ne lister que les sessions d’un projet :

1. En haut de la barre latérale, cliquez sur le bouton de filtre (**Filtrer et regrouper les sessions**).
2. Sous **Projet**, le menu liste **Tous les projets** et jusqu’à huit de vos projets (au-dessus se trouvent **Agent** et **Fonctionne avec** ; **Nouveau projet…** et **Regrouper par dossier ou par projet** sont en dessous). Choisissez un projet.

La liste des sessions n’affiche alors que les sessions de ce projet, par jour, le bouton de filtre est coloré tant qu’un filtre est actif, et une pastille portant le nom du projet apparaît sous **Nouvelle session** : cliquez sur sa croix × pour revoir toutes les sessions. Vous pouvez aussi choisir **Tous les projets**. Les autres filtres fonctionnent en même temps : choisissez un agent sous **Agent** (ou un programme sous **Fonctionne avec**) pour n’afficher que ses sessions dans le projet. Si le projet est supprimé, la liste affiche de nouveau toutes les sessions.

Dans les détails du projet, **Plus** (⋯) → **Seulement ses sessions dans la barre latérale** fait la même chose, avec une coche tant que c’est actif ; choisissez-le de nouveau pour revoir toutes les sessions.

Sur un téléphone, ouvrez d’abord la barre latérale (un tiroir).

## Partager un projet avec des personnes

Vous pouvez inviter des personnes dans un projet, comme un directeur de thèse et les étudiants qui travaillent avec vous, chacune avec son propre lien. Sans votre mot de passe, elles voient les documents du projet, ses sessions et, quand il en a, ses exécutions et sa liste de lecture. Elles commentent ses documents sous leur propre nom et, si vous l’autorisez, elles modifient aussi ses documents. Elles n’accèdent jamais à vos agents, à vos fichiers, à vos paramètres ni à vos autres projets. Pour partager un seul élément (un document, une page, une image, une vidéo…), voir [Partager avec des personnes](/guide/library#share-with-people).

### Inviter quelqu’un

1. Ouvrez les détails du projet et cliquez sur **Plus** (⋯) en haut, puis sur **Partager avec des personnes**.
2. Sous **Inviter quelqu’un**, saisissez **Son nom**. Ses commentaires et ses modifications apparaissent sous ce nom.
3. Choisissez ce que la personne peut faire :
   - **Consulter et commenter** : elle lit tout ce que le projet partage et commente ses documents, ses documents LaTeX, ses diapositives, ses feuilles de calcul et ses pages.
   - **Modifier les documents** : elle modifie aussi ses documents, ses feuilles de calcul, ses diapositives, ses pages et ses designs, dans les éditeurs de l’app (les mots, les images et la mise en page d’une page, jamais son code), ainsi que ses documents LaTeX lorsque cet ordinateur les compile en environnement isolé (voir [Ce qui n’est jamais partagé](#what-is-never-shared)).
4. Choisissez la durée de validité du lien : **Une semaine**, **Un mois** ou **Jusqu’à ce que vous l’arrêtiez**.
5. Cliquez sur **Créer son lien**. Copiez-le avec le bouton de copie et envoyez-le à la personne, ou cliquez sur le bouton du code QR pour l’afficher sous forme de code QR que la caméra de son téléphone peut lire. Le lien n’est affiché qu’à ce moment-là : l’app n’en conserve qu’une empreinte et ne peut donc plus le montrer. Vous pouvez toujours en créer un nouveau.

Un agent peut aussi créer un lien, avec votre accord à chaque fois : « Partage mon projet Thèse avec Maria pour qu’elle puisse commenter, pendant un mois. »

### Ce qu’elles voient

Son lien ouvre le projet seul, dans l’apparence de l’app, sans rien d’autre de vos données autour :

- En haut, la marque du projet, son nom et son sujet. À droite, le nom de la personne : son menu indique ce qu’elle peut faire et jusqu’à quand, et qui a partagé le projet avec elle ; il propose aussi **Langue** (English, Deutsch, 中文, Ελληνικά) et **Thème** (**Clair**, **Sombre** ou **Comme cet appareil**) pour son navigateur.
- **Documents** : les pages, documents, diapositives, feuilles de calcul, documents LaTeX et notebooks du projet, chacun avec son image. Un élément s’ouvre en lecture, tel que son propre adresse le montre (un document LaTeX composé en pages, avec sa source à un clic), avec **Télécharger** pour ses fichiers : un PDF, un document Word, le projet LaTeX, etc. Avec **Modifier les documents**, les documents, feuilles de calcul, diapositives, pages et designs s’ouvrent plutôt dans leur éditeur.
- **Sessions** : les sessions du projet, telles qu’un [lien en lecture seule](/guide/devices#share-a-session-with-a-read-only-link) montre une session : la conversation, les étapes par leur nom, les modifications de fichiers et les pages que l’agent a montrées, avec un suivi en direct pendant qu’un agent travaille. Jamais la sortie des commandes, le raisonnement de l’agent ni ce qui a été donné à une étape. Une session confidentielle n’apparaît jamais.
- **Exécutions**, quand le projet a des expériences : le nom de chaque exécution, son déroulement et sa date, ses métriques et ses paramètres. Jamais sa commande, son dossier, son journal ni la machine sur laquelle elle a tourné.
- **Liste de lecture**, quand votre app Liste de lecture contient des articles pour le projet : le titre de chaque article (un lien vers celui-ci), ses auteurs, sa publication et son année, s’il est lu, et ses étiquettes. Jamais vos notes à son sujet ni ses fichiers.

La page se met à jour toute seule, chaque minute, tant qu’elle est ouverte. Les agents qui travaillent dans le projet savent avec qui il est partagé et que ces personnes lisent ses sessions ; ils y évitent donc les clés, les mots de passe et les détails privés.

### Commentaires sous son nom

Sur un document, un document LaTeX, des diapositives, une feuille de calcul ou une page, **Commentaires** (à côté, ou par-dessus sur un téléphone) liste les commentaires et leurs réponses, chacun sous le nom de son auteur : les siens sous **Vous**, ceux d’un agent sous **Agent**, et les vôtres sous votre nom. En bas de la boîte de dialogue de partage, **Elle voit vos commentaires sous le nom** indique ce nom (« Propriétaire » tant que vous ne le changez pas) ; **Variation** permet d’en définir un autre.

Pour commenter, la personne clique sur **Ajouter un commentaire**, puis colle les mots concernés, copiés depuis le document, ou les omet pour commenter le document entier ; sur des diapositives, elle choisit la diapositive, et sur une feuille de calcul, la feuille et la cellule (comme B4). Elle peut répondre à n’importe quel commentaire et résoudre ou rouvrir un commentaire, mais ne modifie ou ne supprime que les siens. Avec **Modifier les documents**, elle commente dans l’éditeur lui-même, comme vous.

Dans votre propre éditeur, ses commentaires apparaissent sous son nom, et les agents les lisent et y répondent comme aux vôtres : « Réponds aux commentaires de Maria sur le chapitre 3. » Les agents ont pour consigne de ne prendre ses commentaires que comme des demandes concernant le document, et de ne rien faire d’autre de ce qu’elle demande (exécuter une commande, ouvrir un fichier, écrire à quelqu’un) sauf si vous le leur demandez. Quand quelqu’un commente ou répond, vous recevez une notification (« Maria a commenté : … ») et une ligne dans votre [boîte de réception](/inbox) (« Maria a commenté « Thèse, chapitre 3 » »), qui y reste jusqu’à ce que vous ou un agent répondiez, ou que le commentaire soit résolu.

Chaque commentaire est enregistré comme une nouvelle version du document ; une série de commentaires consécutifs est conservée comme une seule version. Si vous enregistrez le document dans son éditeur pendant que des commentaires arrivent, ils sont conservés, sur les mots qu’ils concernaient.

### Modifications sous son nom

Avec **Modifier les documents**, ce que la personne enregistre devient une nouvelle version du document, avec son nom dans la liste **Versions**, et les agents savent qui l’a modifié en dernier. Elle ne peut ni changer l’auteur des commentaires des autres, ni les supprimer. Si le document a changé depuis qu’elle l’a ouvert, une confirmation lui est demandée avant d’enregistrer sa version par-dessus (l’autre version reste parmi les versions).

### Modifier ou arrêter le partage

Dans la boîte de dialogue de partage, **Partagé avec** liste chaque personne, avec ce qu’elle peut faire, jusqu’à quand, et sa dernière action. Son menu **Plus** (⋯) propose :

- **Consulter et commenter** ou **Modifier les documents** : ce qu’elle peut faire, dès son prochain clic.
- **Pendant une semaine à partir de maintenant**, **Pendant un mois à partir de maintenant** ou **Jusqu’à ce que vous l’arrêtiez**.
- **Créer un nouveau lien** : son lien s’arrête aussitôt ; envoyez-lui le nouveau. Elle reste la même personne et ses commentaires restent les siens.
- **Arrêter le partage** : son lien s’arrête aussitôt. Ce qu’elle a écrit reste, sous son nom.

Un lien expiré, arrêté ou recréé l’indique à l’ouverture (« Ce lien a expiré », « Ce lien a été désactivé »), et la personne peut vous en demander un nouveau.

### Ce qui n’est jamais partagé

- **Vos agents** : les personnes ne peuvent ni démarrer ni piloter une session, ni poser une question à un agent. Elles lisent des sessions et commentent des documents.
- **Vos fichiers** : ni le dossier du projet, ni aucun de vos dossiers. Seul ce que le projet conserve (ses pages, documents, images et éléments semblables) est montré, ainsi que ses sessions sous forme de liens en lecture seule.
- **Vos paramètres, vos autres projets** et tout le reste de l’app. Le lien d’un groupe montre les éléments propres au groupe, pas ceux des projets qu’il rassemble.
- **Toute exécution de code** : une page HTML (une petite app, un outil de suivi) s’affiche avec ses données telles quelles, et ce qu’elle modifie n’est pas conservé ; avec **Modifier les documents**, la personne modifie ses mots, ses images et sa mise en page, jamais son code (ses scripts, et ce qui s’exécute quand on clique sur quelque chose) ; un notebook affiche ses cellules et ses résultats sans jamais s’exécuter. Les documents LaTeX ne se modifient par un lien que là où TeX s’exécute en environnement isolé par bubblewrap (Linux) ; ailleurs, les personnes les lisent et les commentent.

Chaque lien est un long code aléatoire qui ouvre un projet pour une personne. Un code qui n’ouvre rien compte comme un mot de passe erroné de la part de l’adresse d’où il vient : après dix essais en une heure, cette adresse ne peut plus ouvrir de liens ni se connecter pendant une heure (voir [Accéder à l’app depuis un autre appareil](/guide/devices#reach-the-app-from-another-device)).

## Connaissances partagées : des documents que chaque session peut consulter

Les agents peuvent rechercher dans des documents que vous ajoutez une seule fois : contrats, manuels, notes, articles, un dossier entier. Ils trouvent des passages d’après leurs mots ou leur sens, et citent le fichier et la page qu’ils ont lus. Les documents sont conservés dans des **bases de connaissances** : des collections nommées de fichiers que vous y avez déposés et de dossiers de cet ordinateur.

- **Connaissances partagées** ([la page Connaissances partagées](/knowledge)) : chaque session y cherche, y compris dans un projet, sauf si le projet le désactive.
- **Les connaissances propres à un projet**, dans son onglet **Mémoire** (la pastille **Documents**) : seules les sessions de ce projet les consultent, ainsi que celles d’un groupe qui réunit ce projet.

Les Connaissances partagées forment une page à part, sans colonne de projets à côté. Pour l’ouvrir, cliquez sur **Connaissances partagées** dans le texte en haut de [Paramètres → Mémoire](/settings?s=memory), ou saisissez « connaissances partagées » dans la zone de recherche (Ctrl+K).

## Ajouter des documents

Tant qu’il n’y a pas de connaissances partagées, la page affiche « Ajoutez vos documents une fois » au-dessus d’une grande zone où déposer des documents. Déposez-y des fichiers ou un dossier, et une base de connaissances appelée « Mes documents » est créée pour eux. **Commencer plutôt par un dossier de cet ordinateur** crée une base « Mes documents » vide, à laquelle vous ajoutez ensuite un dossier.

Chaque base de connaissances a sa propre zone de dépôt et son propre bouton **Ajouter un dossier de cet ordinateur**. Pour créer une autre base, cliquez sur **Nouvelle base de connaissances** en haut de la page (**Nouveau** sur un téléphone). Des bases séparées gardent les choses distinctes, et un agent peut chercher dans une base d’après son nom, mais une seule suffit pour commencer.

### Déposer ou choisir des fichiers

Faites glisser des documents ou un dossier sur la zone d’une base de connaissances (« Déposez des documents ou un dossier ici »), ou cliquez sur **choisir des fichiers**, ou sur **dossier** pour sélectionner un dossier entier. Les fichiers sont copiés dans le dossier de données de l’app et lus dès qu’ils y sont, de sorte que les modifications ultérieures de vos originaux n’atteignent pas la base. Un petit panneau affiche l’envoi. Si un fichier du même nom se trouve déjà dans la base, le panneau vous demande si vous voulez le **Remplacer**, **Ignorer les existants** ou **Annuler**.

Les fichiers viennent de l’appareil que vous utilisez. Sur un téléphone, **choisir des fichiers** ouvre le sélecteur de fichiers du téléphone ; la sélection d’un dossier entier n’est proposée que sur un ordinateur.

### Ajouter un dossier de cet ordinateur

1. Sur une base de connaissances, cliquez sur **Ajouter un dossier de cet ordinateur**.
2. Dans le menu qui s’ouvre (« Un dossier à lire et à garder à jour »), saisissez le nom d’un dossier pour le trouver parmi ceux que vous avez utilisés récemment et ceux de votre dossier personnel, ou saisissez son chemin, par exemple `~/Documents/Manuals`. Sélectionnez-le.

Le dossier est lu là où il se trouve : rien n’est copié. Il apparaît sous forme de pastille sur la base, et la base le suit. Une minute après le démarrage de l’app, puis toutes les heures, l’app lit ce qui est nouveau ou modifié dans le dossier et retire ce qui a été supprimé ; après un démarrage, elle retente aussi les documents qui n’avaient pas pu être lus, qu’une version plus récente peut savoir lire. Pour le lire tout de suite, choisissez **Relire maintenant** dans le menu de la base.

« Cet ordinateur » est celui sur lequel Hydor s’exécute, qui n’est pas forcément l’appareil que vous avez sous les yeux.

Pour arrêter de lire un dossier, cliquez sur le × de sa pastille. Ses documents quittent la base ; le dossier et ses fichiers ne sont pas touchés.

### Ce qui peut être lu

- **Documents** : PDF, Word, Excel, PowerPoint, OpenDocument, EPUB, CSV et RTF ; les anciens fichiers .doc, .xls et .ppt aussi, quand LibreOffice est installé sur cet ordinateur.
- **Texte** : texte brut et Markdown, pages web (leur texte, sans le balisage), et fichiers de code et de données comme JSON, YAML, Python ou JavaScript.

Sont exclus : les images ; les fichiers et dossiers dont le nom commence par un point (les cachés) ; et les dossiers créés par des outils, comme `node_modules`, `.git`, `dist`, `build`, `target` et `venv`. Un dossier est lu jusqu’à 20 000 fichiers et 12 niveaux de profondeur. D’un fichier texte de plus de 4 Mo, comme un gros journal ou un gros fichier de données, les 4 premiers Mo sont lus, et son dernier passage indique où il a été coupé. Les documents de plus de 300 Mo ne sont pas lus. Un PDF numérisé sans couche de texte n’a aucun texte à rechercher.

Chaque document est découpé en passages d’environ 1 400 caractères au plus, chacun gardant la page, la diapositive, la feuille ou le titre dont il provient, afin que les agents puissent le citer.

## Voir ce que contient une base de connaissances

Chaque base de connaissances est une carte. Sous son nom, une ligne indique ce qu’elle contient : ses documents et ses passages, la part prête pour la recherche par le sens (quand elle est activée : « prêt pour la recherche par le sens », ou un pourcentage pendant la préparation, qui augmente au fur et à mesure), et la date de la dernière lecture (« lu il y a 25 min »). Pendant la lecture, la ligne commence par « Lecture de 12 sur 40… ».

Tant que la recherche par le sens est activée mais ne peut pas préparer les passages pour le moment, une ligne au-dessus des bases de connaissances en donne la raison, et les agents trouvent les passages d’après leurs mots en attendant :

- **La recherche par le sens s’installe sur cet ordinateur**, avec ce qu’elle fait (installer PyTorch, par exemple) : une seule fois, la première fois.
- **La recherche par le sens démarre** : chargement de son modèle (téléchargement, la première fois).
- **La recherche par le sens attend de la mémoire**, avec la quantité disponible et celle dont elle a besoin. Elle réessaie toutes les quelques minutes ; fermer quelques programmes aide.
- **La recherche par le sens s’est arrêtée**, avec la raison. Cliquez sur **Réessayer** une fois le problème réglé (Python installé, par exemple), ou réessayez dans [Paramètres → Mémoire](/settings?s=memory&find=Search%20by%20meaning).

- **Afficher les documents** liste chaque document : son nom ou son chemin, puis son nombre de passages et sa taille. Une épingle marque un document que vous avez épinglé pour la mémoire wiki et, quand la mémoire wiki est activée, le menu **Plus** de sa ligne propose **Lire dans la mémoire wiki** (l’épingler) ou **Ne pas lire dans la mémoire wiki** (voir [Quand un projet a trop de documents](/guide/wiki-memory#when-a-project-has-too-many-documents)). **aucun texte** marque un document sans rien à lire, et **lecture impossible** un document dont la lecture a échoué ; pointez-le pour en voir la raison. Cliquez sur un document pour l’ouvrir. **Masquer les documents** replie la liste.
- Quand certains documents n’ont pas pu être lus, une ligne rouge indique leur nombre, avec les premiers et la raison de chacun.
- Un fichier que vous avez déposé peut être retiré avec le × au bout de sa ligne (sur un ordinateur, il apparaît quand vous pointez la ligne). Cela supprime la copie de la base. Un document issu d’un dossier de cet ordinateur n’a pas de × : retirez-le du dossier lui-même, ou arrêtez de lire le dossier.

## Renommer, déplacer, relire ou supprimer une base de connaissances

Le bouton ⋯ (**Plus**) en haut à droite d’une base de connaissances ouvre son menu :

- **Relire maintenant** : relit aussitôt ses fichiers et ses dossiers, pour des fichiers qui viennent d’être ajoutés ou un dossier qui a changé, et réessaie les documents qui n’ont pas pu être lus.
- **Renommer** : ouvre **Renommer la base de connaissances**. Saisissez le nouveau nom (60 caractères au maximum) et cliquez sur **Enregistrer**.
- **Déplacer vers** : **Connaissances partagées**, ou l’un de vos projets ; une coche indique où se trouve la base actuellement. Dans un projet, seules les sessions de ce projet la consultent ; dans les connaissances partagées, toutes les sessions la consultent. Cet élément apparaît dès que vous avez des projets.
- **Supprimer** : demande « Supprimer *nom* ? » Ses passages disparaissent, ainsi que les fichiers qui y ont été déposés ; les dossiers de cet ordinateur restent tels quels. Cliquez sur **Supprimer** pour confirmer.

## Donner à un projet ses propres documents

Ouvrez les détails du projet, allez dans son onglet **Mémoire** et choisissez la pastille **Documents**.

- Ajoutez des documents avec **Ajouter** → **Fichiers…**, ou déposez des fichiers ou un dossier n’importe où dans l’onglet : une base de connaissances portant le nom du projet est créée pour eux, et les documents rejoignent la liste. **Ajouter** → **Un dossier à garder à jour…** (ou **Ajouter un dossier** sous la pastille) lit un dossier de cet ordinateur à l’endroit où il se trouve, comme dans [Ajouter un dossier sur cet ordinateur](#add-a-folder-on-this-computer) ; un × à côté d’un dossier arrête sa lecture, après confirmation. Tant qu’il n’y a aucun document, la pastille sert de zone de dépôt, avec **Ajouter un dossier à garder à jour** en dessous.
- Chaque document est une ligne (« Document · 12 passages · 2,1 Mo · lu hier »). Cliquez dessus pour voir d’où il vient, son format, sa taille et ses passages, la date de sa lecture, ainsi que **Ouvrir**, **Retirer** (pour un fichier que vous avez ajouté : cela supprime la copie conservée par Hydor) et **Lire dans la mémoire wiki**. **Relire les documents**, dans le menu **⋯**, relit aussitôt les fichiers et les dossiers.
- Le champ de recherche au-dessus de la liste explore les documents en même temps que les notes et le wiki du projet (voir [Essayer une recherche vous-même](#try-a-search-yourself)).
- Le fait que les sessions du projet consultent aussi les connaissances partagées se règle par un interrupteur de son onglet **Paramètres**, **Rechercher aussi dans les connaissances partagées**, activé tant que vous ne le désactivez pas : désactivé, elles ne consultent que les documents propres au projet (et, dans un groupe, ceux de ses projets). La ligne en dessous indique combien de documents partagés existent, avec un lien **Connaissances partagées**.

Une base de connaissances peut être déplacée dans un projet depuis son menu sur la page Connaissances partagées (**Déplacer vers**), et inversement. L’index de recherche propre au wiki, une base appelée « Wiki du projet », n’apparaît pas parmi les documents d’un projet.

## Comment les agents recherchent dans vos documents

Dès qu’il existe au moins une base de connaissances, les agents disposent d’outils pour rechercher dans les documents que leur session peut consulter, pour lire davantage d’un document autour d’un passage et pour lister le contenu des bases de connaissances. Claude Code, Codex, Custom et les agents qui parlent ACP et acceptent les serveurs MCP (serveurs d’outils) les reçoivent tous.

Au début d’une session, l’agent est informé des bases de connaissances qu’il peut consulter et du nombre de documents que contient chacune ; dans un projet, il sait aussi si chacune appartient au projet, est partagée, ou provient d’un projet que son groupe réunit. On lui demande de chercher d’abord là, avant le web ou la mémoire, quand une question peut y trouver sa réponse ; de répondre d’après ce que disent les passages ; de citer chaque passage utilisé avec son fichier, sa page ou sa partie, et son chemin ; et de le dire quand les documents ne répondent pas à la question.

Dans la conversation, une recherche apparaît sous forme d’étape : **Documents explorés**, ce qui a été cherché, et le nombre de passages trouvés, ou « aucun résultat ». Cliquez dessus pour voir les passages, chacun avec son fichier, sa page et sa base de connaissances. Cliquez sur un passage pour ouvrir le fichier.

### Par les mots, par le sens, ou le texte exact

Les agents recherchent de trois façons :

- **Par les mots** : les passages qui contiennent les mots de la question, les meilleurs résultats en premier. Toujours disponible.
- **Par le sens** : les passages qui signifient ce que demande la question, même avec d’autres mots ou dans une autre langue. Cela nécessite **Recherche par le sens**, activée par défaut sauf si vous la désactivez dans [Paramètres → Mémoire](/settings?s=memory&find=Search%20by%20meaning). Elle s’exécute sur cet ordinateur et, tant qu’elle est activée, chaque base se prépare en arrière-plan (voir [Mémoire](/guide/memory#search-by-meaning)). Quand elle est désactivée, la page Connaissances partagées et l’onglet Connaissances de chaque projet indiquent où l’activer, et les agents trouvent les passages par leurs mots.
- **Le texte exact** : une expression entre guillemets (« délai de préavis ») ou un motif entre barres obliques (une expression régulière, comme `/INV-\d+/`), trouvé comme le ferait la commande grep : pour les noms, les nombres et les codes. Ces passages arrivent dans l’ordre où ils figurent dans les documents.

Un agent recherche par les mots et par le sens ensemble, sauf s’il en demande un seul, et une question entre guillemets ou entre barres obliques est recherchée à l’identique. Il reçoit 8 passages à la fois, sauf s’il en demande davantage (jusqu’à 25), et il peut rechercher dans une base de connaissances à partir de son nom.

### Faire une recherche vous-même

Sur la page Connaissances partagées, au-dessus des bases de connaissances, un champ indique « Essayez une recherche, comme le font les agents : une question, ou des « mots exacts » entre guillemets ». Saisissez votre recherche et appuyez sur Entrée. Jusqu’à 10 passages reviennent, chacun avec son fichier et sa page, sa base de connaissances et la façon dont il a été trouvé : **par les mots**, **par le sens**, ou les deux, ou **par texte exact** pour un texte exact. Cliquez sur l’un d’eux pour ouvrir le fichier.

Sur la page Connaissances partagées, ce champ cherche ce que cherche une session extérieure à tout projet. Dans un projet, le champ de recherche de son onglet **Mémoire** cherche ensemble dans les notes, le wiki et les documents du projet, et jamais dans les connaissances partagées.

## Quelles sessions recherchent dans quelles connaissances

| Une session… | recherche dans |
|---|---|
| hors de tout projet | les connaissances partagées |
| dans un projet | les documents propres au projet, et les connaissances partagées sauf si le projet les désactive |
| dans un groupe | les documents propres au groupe, les documents de chaque projet qu’il réunit, et les connaissances partagées sauf si le groupe les désactive |
| démarrée par une autre session (un sous-agent Hydor) | ce que recherche la session qui l’a démarrée |

Les outils de connaissances ne font jamais apparaître les documents d’un autre projet, même quand un agent demande un fichier par son chemin. Une base de connaissances dont le projet a été supprimé devient partagée.

## Demander à un agent

- « Crée un projet appelé Impôts 2026 pour mes justificatifs et ma déclaration de revenus. Ses sessions doivent démarrer avec le Chercheur, et chaque agent du projet doit savoir que les montants sont en EUR. »
- « Crée un projet appelé Boutique pour mon code dans ~/code/shop. »
- « Que contient le dossier de mon projet Thèse dans ses fichiers ? Déplace-y le suivi de lectures. »
- « Enregistre ce rapport dans mon projet Thèse, dans son dossier reports. »
- « Dans quels dossiers ai-je travaillé sans qu’ils soient encore dans un projet ? Crée des projets pour les deux que j’utilise le plus. »
- « Lesquels de mes projets viennent de Claude Code ou de Codex ? »
- « Ouvre la page Projets et trie mes projets par nombre de sessions. »
- « Lequel de mes projets n’a eu aucune session depuis un mois ? »
- « Qu’est-ce qui attend une action de ma part dans mon projet Recherche dense ? »
- « Que s’est-il passé dans mon projet Recherche dense depuis ma dernière visite ? »
- « Ne crée pas de projet pour ~/code/scratch à lui seul. »
- « Copie ~/Downloads/contract.pdf dans mon projet Impôts 2026, et fais-le travailler aussi avec ~/Documents/Receipts. »
- « Regroupe mes projets Thèse et Notes de lecture en un seul appelé Tout pour la thèse. »
- « Donne une compétence à mon projet Thèse : citer en APA 7, et vérifier que chaque DOI fonctionne avant que je rende un chapitre. »
- « Copie la compétence de rédaction dans mon projet Jardin, et modifie-la là-bas pour employer des mots simples destinés aux enfants. »
- « Dans mon projet Site de la boutique, active la compétence docker et désactive la compétence de déploiement de Claude Code, pour ce projet uniquement. »
- « Ajoute le dossier ~/Documents/Manuals à mes connaissances partagées. »
- « Rends mon projet Impôts 2026 privé : les autres projets ne doivent pas pouvoir y faire de recherche. »
- « Déplace la base de connaissances Contrats dans le projet Impôts 2026, et empêche ce projet de rechercher dans les connaissances partagées. »
- « Quelles bases de connaissances ai-je, et quels documents n’ont pas pu être lus ? »
- « Partage mon projet Thèse avec Maria pour qu’elle puisse commenter, pendant un mois, et avec Nikos pour qu’il puisse modifier les documents. »
- « Avec qui mon projet Thèse est-il partagé, et qu’a fait chacun en dernier ? »
- « Réponds aux commentaires de Maria sur le chapitre 3, puis résous ceux que tu as traités. »
- « Arrête de partager mon projet Thèse avec Nikos. »
