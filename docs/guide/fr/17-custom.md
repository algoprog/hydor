# Custom, l’agent propre à l’app

Custom est l’agent propre à Hydor : il exécute les modèles de vos forfaits Claude et ChatGPT, ainsi que tout modèle que vous ajoutez, depuis OpenRouter, Ollama, vLLM ou un autre serveur compatible OpenAI, avec les mêmes outils, compétences et connexions que Claude Code et Codex. Cette rubrique présente ce qu’il sait faire, ses modes d’autorisation et la façon dont il vérifie les commandes, le mode automatique, le bac à sable des commandes, les objectifs, la manière dont il gère les longues tâches et les modèles moins performants, ainsi que ses paramètres.

![Paramètres → Modèles : le modèle d’appoint et les modèles sur cet ordinateur](images/custom.webp)

## Ce qu’est Custom, et quand l’utiliser

Claude Code n’exécute que les modèles d’Anthropic, et Codex que ceux d’OpenAI. Custom exécute aussi les modèles de vos forfaits Claude et ChatGPT, grâce aux connexions de Claude Code et de Codex sur cet ordinateur, ainsi que tout modèle que vous configurez dans [Paramètres → Agents → Modèles](/settings?s=models) : des modèles ouverts sur votre propre ordinateur, des modèles bon marché ou gratuits via OpenRouter, ou un serveur à vous. Il n’y a rien à configurer pour les modèles de vos forfaits : une fois Claude Code connecté, le menu **Modèle** de Custom propose Claude Opus, Fable, Sonnet et Haiku, et une fois Codex connecté avec ChatGPT, les modèles que votre forfait ChatGPT recense, le tout sous **Vos abonnements**. Ils consomment l’utilisation de votre forfait, pas une clé d’API. Voir [Agents, comptes et modèles](/guide/agents-models#where-customs-models-come-from) pour savoir d’où viennent les modèles de Custom et comment en ajouter.

Utilisez Custom si vous voulez :

- un modèle qui ne quitte jamais votre ordinateur (Ollama ou vLLM), ou une session entière qui ne le quitte pas : une [session confidentielle](/guide/sessions#keep-a-session-confidential) s’exécute toujours sur Custom et n’utilise que des modèles présents sur cet ordinateur ou sur votre propre réseau (jamais ceux de vos forfaits, qui tournent sur les serveurs d’Anthropic ou d’OpenAI) ;
- un modèle particulier, comme DeepSeek, Qwen, GLM ou Kimi ;
- les outils et les règles de Custom avec un modèle de votre forfait Claude ou ChatGPT, ou limiter les coûts, ou continuer à travailler lorsque votre forfait Claude ou ChatGPT est épuisé (avec un modèle d’ailleurs).

Il vous aide pour tout : recherche, rédaction, documents et tâches du quotidien. Dans un projet de code (un dossier contenant un `package.json`, un `Cargo.toml`, un dépôt git, etc.), il travaille comme un ingénieur soigneux : il lit avant de modifier, suit les instructions propres au projet, et exécute les tests et les vérifications du projet avant de dire que c’est terminé.

Custom lit les fichiers `AGENTS.md` ou `CLAUDE.md` du projet et suit vos [Consignes des agents](/guide/guidelines), comme les autres agents.

## Démarrer une session Custom

1. Sur la page de démarrage, cliquez sur **Agent** et choisissez **Custom** (« Any model: OpenRouter, Ollama, vLLM »).
2. Cliquez sur **Modèle** et choisissez l’un de vos modèles, ou **Automatique** quand le menu le propose : les niveaux de Custom se remplissent d’eux-mêmes à partir des modèles dont il dispose (d’abord ceux de votre forfait Claude, puis ceux de votre forfait ChatGPT, puis ceux que vous avez ajoutés et qui ne sont pas sur cet ordinateur). Dès que son niveau Meilleur désigne un modèle, une session en mode Automatique démarre avec lui et dirige les sous-agents (voir [Niveaux : un modèle pour chaque type de tâche](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Si la liste est vide, ajoutez d’abord un modèle : **Agent** → **Modèles pour Custom**.
3. Sous **Options**, choisissez les **Autorisations** (voir [Choisir ce que Custom peut faire sans demander](#choose-what-custom-may-do-without-asking)). Custom n’a pas de réglage Effort.
4. Saisissez la tâche et appuyez sur Entrée.

Un modèle sur cet ordinateur servi par vLLM démarre la première fois qu’une session l’utilise ; la session affiche « Starting … with vLLM (the first time takes a minute or two)… ».

Custom traite un message à la fois. Un message envoyé pendant qu’il travaille attend dans la file au-dessus de la zone de message et part à la fin du tour.

Vous pouvez changer de modèle en cours de session depuis le menu sous la zone de message. Custom utilise le nouveau modèle dès son étape suivante, même au milieu d’un tour.

## Ce que Custom sait faire

- **Fichiers** : les lire (le texte avec numéros de ligne, une partie d’un long fichier à la fois, le contenu d’un dossier), en créer, les réécrire et les modifier, lister des dossiers, et trouver des fichiers par leur nom ou par leur contenu. Avant de réécrire un fichier entier qu’il n’a pas lu dans cette session, il doit d’abord le lire.
- **Documents** : les fichiers PDF, Word, Excel, PowerPoint, OpenDocument, RTF et EPUB sont lus comme du texte.
- **Images** : les images que vous joignez, les fichiers image qu’il ouvre, et les images issues de pages web ou d’outils. Un modèle qui voit les images reçoit l’image ; pour un modèle qui ne les voit pas, le modèle d’appoint la décrit (voir [Images pour les modèles qui ne voient pas](#images-for-models-that-dont-see)).
- **Commandes** : exécuter des commandes shell dans le dossier de la session, pendant deux minutes par défaut et dix au maximum. Les serveurs, les watchers et les autres commandes qui continuent de tourner passent en arrière-plan : Custom lit leur sortie quand il en a besoin et peut les arrêter. Elles s’arrêtent aussi quand Custom se ferme, et son tour suivant est informé de celles qui tournent encore.
- **Pages web** : récupérer une page sous forme de texte propre, avec ses titres, liens, listes et tableaux ; les PDF et les fichiers Office en ligne sont lus comme du texte. Il n’accède qu’aux adresses publiques ; pour cet ordinateur ou son réseau, il utilise une commande comme `curl`.
- **Un plan** : pour un travail en plusieurs étapes, il tient une liste de contrôle, affichée dans la session, et coche les éléments au fur et à mesure.
- **Compétences** : il charge les compétences adaptées à la tâche : celles du projet, les vôtres (les dossiers de compétences de Claude Code et de Codex) et la [bibliothèque de compétences](/guide/skills) de l’app. Il les connaît par groupe et par nom, et peut aussi en chercher une d’après la nature du travail, en quelques mots.
- **Serveurs MCP** : les serveurs d’outils que vous configurez pour Claude Code (pour tous les dossiers et pour ce dossier), le `.mcp.json` du projet, et ceux de Codex.
- **Les outils propres à l’app** : recherche web, navigateur, mémoire, pages, vos [connexions](/guide/connections) et le reste, comme tous les agents ici en disposent.

Chaque étape s’affiche dans la session avec un nom clair (« Read index.ts », « Edit README.md », « Fetch https://… »), son diff ou sa sortie étant à un clic.

## Choisir ce que Custom peut faire sans demander

Le réglage **Autorisations** (sous **Options** sur la page de démarrage, ou dans le menu sous la zone de message d’une session) détermine ce que Custom fait de lui-même. Maj+Tab dans la zone de message passe au mode suivant.

- **Demander** (par défaut) : demande avant de modifier des fichiers et avant d’exécuter des commandes. Les commandes qui ne font que consulter (`ls`, `cat`, `git status`, etc.) s’exécutent librement.
- **Accepter les modifications** : modifie librement les fichiers du dossier de la session ; demande avant d’exécuter des commandes (sauf celles qui ne font que consulter) et avant toute action hors du dossier.
- **Automatique** : les étapes courantes avancent ; une vérification rapide vous interroge sur les étapes risquées. Voir [Mode automatique](#auto-mode).
- **Accès complet** : les outils et les commandes s’exécutent sans demande d’approbation ni [bac à sable](#the-sandbox-for-commands) pour les commandes, y compris les commandes d’administrateur et les modifications hors du dossier. Ils utilisent les droits de votre compte sur l’ordinateur : cela n’accorde pas un accès administrateur que votre compte n’a pas. Les sessions confidentielles conservent leurs restrictions réseau.
- **Plan** : lit et planifie uniquement. Custom ne peut ni modifier de fichiers ni exécuter de commandes, et n’utilise que des outils de lecture. Il termine par un plan numéroté. Pour l’exécuter, passez à un autre mode et dites-lui de continuer.

En dehors d’Accès complet, certaines commandes demandent toujours : voir [Les commandes qui demandent toujours](#commands-that-always-ask).

## Approuver ou refuser ce que Custom veut faire

Quand Custom a besoin de votre accord, une carte apparaît dans la session (et dans la [boîte de réception](/guide/inbox)). Son titre indique ce que fait l’étape et pourquoi elle demande, par exemple « Edit /home/you/notes/plan.md — it changes files outside the session folder ». Pour une commande, la carte affiche la commande entière.

- **Autoriser** laisse cette étape s’exécuter, une seule fois.
- **Always allow …** la laisse s’exécuter, ainsi que les étapes similaires, sans demander à partir de maintenant dans cette session. Le bouton indique ce qu’il couvre : « Always allow npm run build … », « Allow all edits », « Always allow reading in ~/data », « Always allow changes in ~/site ».
- **Rejeter** arrête cette étape. Custom est informé que vous avez refusé et de ne pas réessayer.

Fonctionnement de **Always allow** pour les commandes : Custom découpe une commande en ses parties (à `&&`, `;`, `|`, etc.) et vérifie chacune. Une règle couvre la commande pour laquelle elle a été créée, d’après ses premiers mots (`git status`, `npm run build`, `docker compose up`), de sorte que rien ne peut se glisser derrière `&&`. Les commandes qui ne font que consulter n’ont jamais besoin de règle.

**Always allow** n’est pas proposé quand il ne peut pas être sûr :

- pour du code fourni directement dans la commande (comme `python -c "…"`) ;
- pour un fichier dont le nom ne peut pas être connu à l’avance ;
- pour une commande qui ne peut pas être lue avec certitude ;
- pour les commandes risquées, qui demandent à chaque fois.

## Les commandes qui demandent toujours

En dehors d’Accès complet, ces étapes vous demandent à chaque fois, y compris en mode Automatique, quoi que vous ayez autorisé auparavant :

- l’exécution en tant qu’administrateur (`sudo` et similaires) ;
- la suppression de fichiers hors du dossier de la session, la suppression du dossier de la session lui-même, ou la suppression de fichiers qu’il ne peut pas nommer à l’avance ;
- l’envoi direct d’un téléchargement dans un shell, ou l’exécution immédiate d’un téléchargement ;
- l’écriture de données brutes sur un disque, le formatage ou le repartitionnement d’un disque ;
- l’arrêt ou le redémarrage de l’ordinateur ;
- la modification des tâches planifiées (`crontab`) ;
- la modification des permissions ou des propriétaires de toute une arborescence de dossiers ;
- la modification des clés SSH, ou des paramètres et fichiers de démarrage de votre dossier personnel (comme `.bashrc` ou `~/.config`), sauf si la session travaille dans ce dossier.

## Fichiers hors du dossier et fichiers contenant des clés

En modes Demander, Accepter les modifications et Plan, Custom demande avant de lire ou de modifier des fichiers hors du dossier de la session (le dossier temporaire ne compte pas). **Always allow** couvre alors ce dossier, en lecture ou en modification.

Les fichiers qui contiennent des clés ou des mots de passe demandent avant d’être lus ou modifiés, y compris dans le dossier : les fichiers `.env` (pas les exemples), les clés privées SSH et autres, `.netrc`, `.npmrc`, les fichiers d’identifiants, vos dossiers cloud et de gestionnaire de mots de passe, les connexions propres aux agents, et les données propres à l’app. Les modifications des paramètres et des hooks propres à git demandent aussi. **Always allow** ne couvre alors que ce fichier.

En mode Automatique, ce sont les règles d’Automatique et sa vérification rapide qui en décident. En Accès complet, rien n’est demandé.

## Mode automatique

Le mode automatique laisse le travail courant avancer sans vous interrompre, et vous interroge sur le reste. Choisissez **Automatique** sous **Autorisations**.

Chaque étape qui demanderait passe par ces vérifications, dans l’ordre :

1. **Des règles fixes**, qui ne nécessitent aucun modèle :
   - Elles laissent passer : les modifications dans le dossier de la session ; les nouveaux fichiers brouillons dans le dossier temporaire ; les commandes qui ne font que lire dans le dossier ; les tests, les builds, les linters et les vérifications de types du projet.
   - Elles vous demandent : l’écrasement d’un fichier hors du dossier ; tout ce qui figure sur la [liste des demandes systématiques](#commands-that-always-ask) ; le push forcé avec git ; l’écriture, le déplacement ou la suppression de fichiers hors du dossier ; les commandes qui appellent un service de paiement ; les outils d’un compte connecté ou d’un serveur MCP qui envoient ou publient quelque chose, ou qui dépensent de l’argent.
2. **Une vérification rapide** pour tout le reste, par le [modèle d’appoint](/guide/agents-models#choose-the-helper-model). Elle répond de l’une des trois façons suivantes :
   - **autoriser** : l’étape sert clairement ce que vous avez demandé, reste dans votre dossier (ou ne fait que lire), et se défait facilement ;
   - **demander** : l’étape pourrait causer un dommage durable ou va plus loin (suppression de données, installation de logiciels pour tout le système, modification de paramètres, utilisation de mots de passe ou de clés, envoi ou publication de quoi que ce soit, dépense d’argent, ou quelque chose que vous n’avez pas demandé) ;
   - **refuser** : l’étape est clairement nuisible ou contraire à ce que vous voulez. Elle ne s’exécute pas ; Custom en est informé avec la raison et doit trouver une autre voie.

La vérification rapide ne voit que vos propres messages dans la session (le premier et les dix derniers), l’objectif si vous en avez défini un, le dossier et l’étape elle-même (pour une modification, le début du nouveau texte). Elle ne voit jamais ce que Custom a lu : une page web ou un fichier ne peut donc pas la convaincre de quoi que ce soit. Si la vérification échoue ou dépasse 45 secondes, c’est vous qui décidez. Au sein d’un même tour, une même étape reçoit la même réponse. Dans une [session confidentielle](/guide/sessions#keep-a-session-confidential), la vérification reste sur cet ordinateur : c’est le modèle d’appoint qui s’en charge s’il tourne ici, sinon le modèle de la session.

Dans la session, une étape que le mode Automatique a laissée passer porte une petite étiquette **Automatique** ; survolez-la pour en connaître la raison. Une étape que le mode Automatique a arrêtée affiche l’étiquette en rouge ; survolez-la pour lire « Auto stopped this: … » et la raison. Une carte que le mode Automatique vous envoie commence par « Auto: » et la raison.

[Paramètres → Capacités → Custom](/settings?s=custom&find=Auto%20mode) comporte une ligne **Mode automatique** dont le (i) décrit le mode automatique dans les mêmes termes ; il n’y a rien à activer là.

## Le bac à sable pour les commandes

En mode Automatique, les commandes de Custom peuvent s’exécuter dans un bac à sable : elles ne peuvent modifier des fichiers que dans le dossier de la session et dans les dossiers temporaires, et tout le reste de l’ordinateur est en lecture seule. Elles peuvent toujours utiliser le réseau. Quand la session travaille dans un worktree git ou dans un sous-dossier d’un dépôt, le dossier propre du dépôt reste lui aussi accessible en écriture, pour que git puisse faire des commits. Les caches des gestionnaires de paquets sont déplacés dans un dossier temporaire. La façon dont le bac à sable est construit dépend de votre ordinateur :

- **Linux** : il utilise bubblewrap. Les commandes peuvent modifier des fichiers dans le dossier de la session, dans le dossier temporaire (`/tmp`) et dans le dossier propre du dépôt.
- **Mac** : il utilise Seatbelt, le bac à sable fourni avec macOS. La règle est la même : le dossier de la session, les dossiers temporaires et le dossier propre du dépôt.
- **Windows** : les commandes s’exécutent en intégrité basse, une protection de Windows : elles peuvent tout lire, mais ne modifient des fichiers que dans les dossiers prévus à cet effet. La première fois, Hydor marque le dossier de la session (et le dossier propre du dépôt), et ce marquage reste. Les commandes disposent d’un dossier temporaire à elles, dans `AppData\LocalLow\Hydor`, pour les fichiers temporaires et les caches de paquets. Votre dossier personnel, un disque entier, Windows, Program Files et les dossiers de données d’applications ne sont jamais marqués : dans un tel dossier, les commandes s’exécutent sans bac à sable. Le bash de Git ne peut pas partager son fonctionnement avec vos fenêtres bash ordinaires en intégrité basse. La première fois, Hydor fait donc aussi une copie des programmes de Git pour les commandes en bac à sable, dans `AppData\Local\Hydor\sandbox` (faite de liens vers les mêmes fichiers, elle ne prend donc aucune place quand Git est sur le même disque).

Quand une commande se heurte aux murs du bac à sable, Custom est informé qu’elle s’est exécutée dans un bac à sable, et il s’y adapte ou vous dit ce qu’il faut faire ailleurs.

Pour l’activer ou le désactiver, ouvrez [Paramètres → Capacités → Custom](/settings?s=custom&find=Sandbox%20for%20commands) et utilisez l’interrupteur de **Bac à sable pour les commandes**. Il est activé par défaut. Désactivez-le si un outil doit écrire ailleurs, par exemple pour installer quelque chose pour tout le système. Le changement s’applique aux sessions en cours en une quinzaine de secondes environ.

Si le bac à sable ne peut pas fonctionner, l’interrupteur est grisé et la ligne en donne la raison ; les commandes s’exécutent alors sans bac à sable. Sous Linux, cela signifie que bubblewrap n’est pas installé ou ne peut pas s’exécuter (comme dans certains conteneurs). Sur un Mac, cela signifie que Seatbelt n’a pas pu démarrer. Sous Windows, Hydor construit la première fois un petit utilitaire avec le .NET Framework fourni avec Windows, et il a aussi besoin de Git pour Windows (dont les commandes ont de toute façon besoin) : la ligne l’indique quand l’un des deux manque ou que l’utilitaire ne peut pas démarrer. Dans les modes Demander et Accepter les modifications, les commandes n’utilisent pas le bac à sable : là, chaque commande qui fait plus que regarder autour d’elle attend votre accord, ou une règle que vous avez enregistrée avec **Toujours autoriser**.

Dans une [session confidentielle](/guide/sessions#keep-a-session-confidential), chaque commande s’exécute sans réseau, dans tous les modes et quel que soit l’état de cet interrupteur : elle ne peut donc atteindre ni internet, ni vos autres ordinateurs, ni les serveurs de celui-ci. Ses fichiers restent tels que le mode les définit. Cela fonctionne sous Linux (bubblewrap) et sur un Mac (Seatbelt). Windows ne peut pas couper le réseau de cette façon : là, comme partout où le bac à sable ne peut pas fonctionner, chaque commande vous demande d’abord, dans tous les modes, sans **Toujours autoriser**. Custom en est informé, et une commande qui tente d’utiliser le réseau apprend pourquoi elle a échoué.

## Donner un objectif à Custom

Custom a les mêmes objectifs que tous les autres agents : la boucle propre à l’app le pilote, tour après tour, jusqu’à ce que les vérifications sur lesquelles vous vous êtes accordé soient satisfaites. Ouvrez le menu de la session (⋯) → **Définir un objectif**, ou activez **Options** → **Objectif** sur la page de démarrage, et l’agent propose les vérifications que vous validerez. À chaque tour, l’app exécute elle-même les vérifications, garde le tour ou l’annule (dans un worktree), vous demande quelle direction prendre aux points décisifs, et s’arrête quand toutes les vérifications sont satisfaites, quand vous l’arrêtez, ou quand une limite est atteinte. Toute l’histoire, avec les écrans, se trouve dans [Donner un objectif à la session](/guide/sessions#give-the-session-a-goal).

Ce qui est désormais identique pour tous les agents : la carte d’accord, les vérifications, la liste des tours, les questions, vos règles et **Votre avis**, et le rapport. Saisir `/goal` dans une session Custom n’a plus rien de spécial : c’est du texte ordinaire. Deux points concernent Custom :

- Une vérification **Relecteur**, ainsi que la vérification finale, sont jugées par un modèle qui n’a fait aucun des travaux. Dans une [session confidentielle](/guide/sessions#keep-a-session-confidential), c’est un modèle présent sur cet ordinateur ; sans modèle de ce type, la vérification ne peut pas s’exécuter.
- Les commandes de vérification s’exécutent comme les commandes propres à Custom : en mode Automatique avec **Bac à sable pour les commandes** activé, dans le bac à sable, limitées au dossier de la session ; dans ses autres modes, comme s’exécutent ses propres commandes ; dans une session confidentielle, toujours dans le bac à sable sans réseau.
- Le nombre de tours accordés à un nouvel objectif vient de **Tours qu’un objectif peut exécuter** dans [Paramètres → Capacités → Objectifs](/settings?s=goals). Il s’applique aux objectifs de tous les agents, pas seulement à ceux de Custom.

Les objectifs que Custom avait en cours avant cette version ne sont pas repris : définissez-en un nouveau.

Pour changer le nombre de tours d’un nouvel objectif, ouvrez [Paramètres → Capacités → Objectifs](/settings?s=goals&find=Rounds%20a%20goal%20may%20run) et choisissez **10**, **30** ou **100** dans la ligne **Tours qu’un objectif peut exécuter**. Vous pouvez indiquer un autre nombre sur la carte d’accord, et l’agent peut en proposer un.

## Longues conversations et longues sorties

Chaque modèle ne peut lire qu’une quantité limitée à la fois (son contexte). Custom garde lui-même chaque conversation dans cette limite : il n’y a donc pas de bouton Compacter pour les sessions Custom :

1. Quand la conversation approche de la limite (en gardant de la place pour la réponse), Custom commence par effacer les anciennes sorties d’outils. La session note : « Cleared old tool output to keep within the model’s context. »
2. Si cela ne suffit pas, le modèle résume la première partie en notes à partir desquelles le travail continue (« Summarizing the earlier conversation to keep within the model’s context… »). La fois suivante, il met à jour ces notes au lieu de repartir de zéro. Votre plan et les compétences en cours d’utilisation sont conservés dans les deux cas.

Si le serveur d’un modèle indique que la conversation est trop longue, Custom apprend la vraie limite de ce modèle et condense aussitôt. Seules les dernières images accompagnent chaque requête.

Ce que la mémoire a fourni à Custom au départ reste identique pendant qu’il travaille, afin que le serveur du modèle puisse réutiliser ce qu’il a gardé de la conversation, ce qui est plus rapide et coûte moins cher. À chaque condensation, il relit la mémoire, pour votre dernier message (voir [Ce que reçoit un agent au départ](/guide/memory#what-an-agent-starts-with)).

L’anneau à côté de la zone de message indique en pourcentage le degré de remplissage du contexte du modèle ; pointez-le pour voir les tokens et à quoi ils servent. Sous **Options** (la pastille sous la zone de message), la ligne **Contexte** indique « 42 % utilisé », avec une petite flèche : cliquez dessus pour afficher (ou masquer) la répartition, d’abord repliée : **Instructions**, **Instructions du projet**, **Mémoire**, **Fonctionnalités de l’app**, **Compétences**, **Outils** et **Conversation**, chacune avec ses tokens et une fine barre pour sa part. Une partie vide est omise. Les chiffres sont estimés à partir du texte et ajustés à ce que le serveur du modèle a compté. Cliquer sur l’anneau ne fait rien dans une session Custom, puisque Custom condense de lui-même ; les sessions Claude Code et Codex gardent leur anneau et **Compacter** (voir [Lire les indicateurs](/guide/sessions#read-the-meters-context-cache-and-speed)).

Les longues sorties ne remplissent pas non plus la conversation. Quand une commande, une page ou un outil renvoie plus qu’une part du contexte du modèle, Custom en garde la totalité dans un fichier du dossier propre à la session. Le modèle reçoit le début et la fin (pour une commande, surtout la fin, où apparaissent les erreurs) ainsi que l’emplacement du fichier, et lit le reste par morceaux ou y fait des recherches. Ces fichiers sont supprimés au bout d’une semaine.

## Ce que lit le modèle

Avant votre message, le modèle reçoit, dans cet ordre :

- les règles propres à Custom (comment travailler, le mode, le dossier), les instructions de l’agent et vos Consignes des agents : **Instructions** dans la répartition ;
- les instructions du projet, son `AGENTS.md` ou `CLAUDE.md` : **Instructions du projet** ;
- ce que la [mémoire](/guide/memory#what-an-agent-starts-with) a pour votre demande : **Mémoire** ;
- ce que disent les fonctionnalités de l’app : l’aspect des réponses, comment garder les clés et les mots de passe hors du chat, comment faire le ménage, et comment utiliser pleinement les outils dont il dispose (images, apps, navigateur, documents, etc.) : **Fonctionnalités de l’app** ;
- ses compétences (**Compétences**), nommées par groupe : celles du projet, les vôtres, puis les groupes de la Bibliothèque comme Développement ou Documents. Custom peut en charger une par son nom, ou en chercher une selon la nature du travail. Custom accepte jusqu’à 200 compétences, dont au plus 40 pour celles du projet et les vôtres. Les compétences qui correspondent à votre premier message arrivent avec l’usage de chacune ;
- ses outils, ceux dont il dispose en entier et une courte liste des autres : **Outils**.

Les instructions d’une fonctionnalité sur ses propres outils arrivent avec ces outils. Tant qu’un outil attend dans la courte liste d’outils de Custom, ses instructions attendent aussi ; elles sont ajoutées quand le modèle recherche l’outil ou l’utilise. Les règles qui valent quels que soient les outils utilisés restent toujours. Claude Code et Codex reçoivent dès le départ toutes les instructions de l’app, comme avant.

Un premier message à un modèle à petit contexte est donc plus court qu’auparavant, et ce que prend chaque partie figure dans la répartition sous **Options** : voir [Longues conversations et longues sorties](#long-conversations-and-long-output).

**La mémoire est dimensionnée selon le contexte du modèle.** Un modèle à petit contexte ne pourrait pas faire son travail si la mémoire prenait une place fixe : la part de la mémoire diminue donc avec la fenêtre (la ligne **Mémoire** de la répartition montre ce qu’elle prend) :

- **Moins de 12 000 tokens** : un petit bloc, d’au plus 6 % du contexte, avec les 120 premiers mots de votre profil (il précise que ce n’est que le début), au plus trois notes, et pas d’index. La mémoire n’ajoute rien à vos messages ni quand le modèle lit ou modifie un fichier, et ne fournit ni lignes d’articles wiki ni plans. Le modèle est informé qu’il peut chercher des notes avec l’outil de mémoire.
- **Jusqu’à environ 33 000 tokens** (hors OpenRouter) : un bloc d’au plus 6 % du contexte, les 400 premiers mots de votre profil, au plus cinq notes, un court index, une ligne d’article wiki et une ligne de plan, et au plus une note avec un message (600 caractères) et une quand un fichier est lu ou modifié (350).
- **Modèles plus grands** : tout ce que [la mémoire donne à un agent](/guide/memory#what-an-agent-starts-with), ce qui représente une petite part de leur contexte.

À titre indicatif, le bloc de la mémoire fait environ 1 700 caractères pour un modèle de 8 000 tokens, 3 800 pour 32 000 et 7 300 pour 200 000. Une session qui n’a reçu que le début de votre profil ne peut pas le réécrire : le modèle vous dit quoi ajouter, ou vous le modifiez dans [Paramètres → Mémoire](/settings?s=memory&find=Your%20profile). Les instructions du wiki sont elles aussi raccourcies : Custom reçoit toujours un court paragraphe sur la Mémoire wiki, et la façon de conserver les sources, de vérifier le wiki et d’adopter des plans n’arrive que tant que les outils correspondants sont proposés. Après que Custom a condensé sa conversation, le point de contrôle de la session (voir [Points de contrôle](/guide/wiki-memory#checkpoints)) est ramené à 8 % du contexte, au plus 16 000 caractères, avec l’indication de l’endroit où lire le reste.

## Comment Custom s’accommode des modèles plus faibles

Tous les modèles ne maîtrisent pas les outils aussi bien que Claude ou GPT. Custom rattrape les erreurs courantes et remet le modèle sur la bonne voie :

- **Répétitions** : la même étape, sans rien de changé depuis, n’est pas exécutée une troisième fois (on dit au modèle d’utiliser le résultat précédent) ; à la cinquième fois, le tour s’arrête.
- **Étapes en échec** : après quatre étapes en échec d’affilée, on dit au modèle de s’arrêter et de reconsidérer ; après huit, le tour s’arrête.
- **Boucles** : les étapes qui tournent en rond reçoivent une note l’invitant à essayer autre chose.
- **Travail inachevé** : un modèle qui dit « laissez-moi… » sans le faire, ou qui s’arrête alors que des éléments de son plan sont encore ouverts, est renvoyé au travail, une fois pour chaque cas. S’il a modifié du code sans exécuter les vérifications du projet, on lui demande de les exécuter avant de terminer.
- **Longueur** : un tour compte au plus 200 étapes ; à 150, on dit au modèle de terminer la partie la plus importante. Une réponse coupée par la limite de longueur du modèle est poursuivie en étapes plus courtes.
- **Appels d’outils défectueux** : les appels écrits sous forme de texte sont lus et exécutés, les appels dont les arguments sont presque corrects sont réparés, et un nom d’outil mal orthographié est associé au bon ou reçoit en réponse la liste des outils. Une réponse qui écrit ses appels sous forme de texte s’arrête là où ses appels s’arrêtent : ce que le modèle écrit après eux (des résultats imaginés, d’autres appels par-dessus, le même appel encore) n’est ni exécuté ni conservé, et au plus six appels sont exécutés pour une même réponse.
- **Modèles sans appel d’outils** : quand le serveur d’un modèle n’accepte pas d’outils, Custom les décrit dans les instructions et lit les appels du modèle dans ce qu’il écrit.
- **Claude via Claude Code** : Anthropic ne laisse que ses propres programmes utiliser la connexion d’un forfait ; un modèle Claude de votre forfait répond donc par Claude Code lui-même, une étape à la fois. Les outils de Custom sont décrits dans ses instructions et Claude écrit ses appels d’outils sous forme de texte, comme pour un modèle sans appel d’outils, et chaque étape réutilise le cache de la précédente. Claude Code ne peut pas terminer une réponse à ses appels d’outils : Custom la termine donc lui-même à cet endroit et arrête le programme, avant que Claude puisse écrire des résultats imaginés. Les modèles de Codex sont différents : ils sont interrogés directement sur votre forfait ChatGPT, avec les outils de Custom comme de vrais outils.
- **Aléas** : quand la connexion se coupe en pleine réponse, ou que le serveur est occupé, Custom attend et réessaie quelques fois. Quand l’app redémarre (une mise à jour) alors qu’une étape attend un modèle de votre forfait, l’étape est redemandée une fois l’app revenue ; un tour qui s’est terminé à cause du redémarrage le signale, et un message le fait reprendre.
- **Nombreux outils** : quand ils sont nombreux (venant de serveurs MCP et de connexions), le modèle voit une courte liste et recherche la description complète de ceux dont il a besoin ; les instructions d’une fonctionnalité sur un outil arrivent avec lui, quand le modèle le recherche ou l’utilise (voir [Ce que lit le modèle](#what-the-model-reads)). Un modèle à contexte court (environ 32 000 tokens ou moins, hors OpenRouter) reçoit un ensemble allégé : pas de conseils sur les UI de réponse, une liste d’outils par leur seul nom, et moins d’outils en entier (celui qui affiche une page HTML attend lui aussi dans la liste). On lui demande aussi d’avancer à petits pas.
- **Chaque famille de modèles** reçoit les réglages recommandés par son éditeur, le format de modification sur lequel elle a été entraînée, et un niveau d’effort de raisonnement quand elle en a un. Les étapes qui ne font que lire s’exécutent en même temps, pour éviter d’attendre.

Quand Custom arrête un tour pour l’une de ces raisons, la réponse se termine par « (Stopped: …) ».

## Images pour les modèles qui ne voient pas

Un modèle qui voit les images reçoit directement vos images. Elles sont d’abord réduites lorsque cet ordinateur dispose de ffmpeg ou d’ImageMagick.

Pour un modèle qui ne voit pas les images, le modèle d’appoint décrit chaque image avec des mots : ce qu’elle montre, où se trouvent les éléments, et le texte qu’elle contient, recopié exactement. Cela demande un modèle d’appoint qui voit les images : ouvrez [Paramètres → Agents → Modèles](/settings?s=models&find=Helper%20model) et choisissez-en un marqué « voit les images » dans le menu **Modèle** du groupe **Modèle d’appoint**. « Automatique » ne le peut pas. Sans modèle de ce type, Custom indique au modèle qu’il y a une image qu’il ne peut pas voir. Dans une session confidentielle, seul un modèle d’appoint présent sur cet ordinateur décrit les images (un modèle de vos abonnements ne le fait jamais).

## Dupliquer et Modifier à partir d’ici

Les sessions Custom peuvent être dupliquées comme les sessions Claude Code et Codex : menu de la session (⋯) → **Dupliquer**. Vous pouvez aussi modifier un de vos messages précédents avec **Modifier à partir d’ici** : la conversation continue dans une copie à partir de juste avant ce message, et l’ancienne est archivée. Cochez **Remettre les fichiers dans l’état précédant ce message** pour annuler les modifications de fichiers effectuées depuis. Pour Custom, cela concerne les fichiers modifiés par ses propres éditions ; ce que les commandes ont changé reste tel quel.

Custom conserve chaque conversation sur le disque, elle continue donc après le redémarrage de l’app.

## Ce que coûte Custom

- Modèles via OpenRouter : OpenRouter indique ce que chaque appel a coûté, et les dépenses de la session s’appuient sur ce montant. On demande aux modèles Claude d’y garder la conversation dans leur cache, comme les autres le font d’eux-mêmes, de sorte que chaque étape la relit pour environ un dixième du prix ; et les outils proposés à Custom ne changent qu’une fois au plus au cours d’une session (les outils pour les commandes exécutées en arrière-plan restent dès qu’une commande a été lancée), afin que ce cache soit conservé.
- Modèles de votre forfait Claude ou ChatGPT (sous **Vos abonnements**) : c’est l’utilisation de votre forfait, et non de l’argent par jeton, donc une session affiche 0 $ pour ces étapes. Un compte qui a atteint sa limite d’utilisation ou qui est déconnecté confie l’étape à votre compte suivant du même programme (avec **Changer de compte à une limite** activé).
- Modèles sur cet ordinateur (Ollama, vLLM) : rien.
- Autres points d’accès : les jetons sont facturés comme ceux des autres agents (voir [Utilisation, limites et coûts](/guide/usage)).

La session affiche le coût de l’API ainsi que les jetons d’entrée, en cache et de sortie au-dessus de la zone de message, même sans plafond de dépenses. Les montants proviennent de la réponse d’OpenRouter, ou de son enregistrement de génération si le montant diffusé en continu est absent ; les prix de son propre catalogue servent de solution de repli. Aucun prix à saisir manuellement.

Un [plafond de dépenses](/guide/usage#cap-what-a-session-spends) fonctionne aussi pour les sessions Custom.

## Paramètres → Capacités → Custom

[Paramètres → Capacités → Custom](/settings?s=custom) (« Mode automatique et bac à sable pour les commandes ») comporte deux lignes :

- **Mode automatique** (l’un des modes de Custom, avec Demander, Accepter les modifications, Accès complet et Planifier) : son (i) indique ce que le mode automatique laisse passer, ce qui demande toujours une confirmation, et que c’est le modèle d’appoint qui effectue la vérification. Rien à activer : vous choisissez le mode automatique pour chaque session sous **Autorisations**.
- **Bac à sable pour les commandes** (en mode automatique, les commandes ne modifient des fichiers que dans le dossier de la session et dans /tmp sous Linux, dans les dossiers temporaires sur un Mac, ou dans un dossier temporaire qui leur est propre sous Windows ; Accès complet s’exécute sans ce bac à sable ni demandes d’approbation) : un interrupteur, activé par défaut. Il est grisé lorsque le bac à sable ne peut pas fonctionner ici (bubblewrap sous Linux, Seatbelt sur un Mac, Git for Windows et .NET Framework sous Windows), et la ligne en indique la raison.

Les modèles de Custom se trouvent dans [Paramètres → Agents → Modèles](/settings?s=models), et le modèle qui effectue les vérifications y est le **Modèle d’appoint**.

## Demander à un agent

- « Désactive le bac à sable pour les commandes du mode automatique de Custom. »
- « Accorde jusqu’à 100 tours aux nouveaux objectifs. »
- « Fixe un objectif sur ma session Custom "Page de téléversement" : npm test réussit et les téléversements de 2 Go fonctionnent, et ne me sollicite que si tu es bloqué. »
- « Quel modèle d’appoint le mode automatique utilise-t-il, et voit-il les images ? »
- « Cet ordinateur peut-il exécuter les commandes de mes sessions confidentielles sans réseau ? »
- « Ajoute Qwen3 Coder depuis OpenRouter pour que je puisse l’utiliser avec Custom. » (une fois votre clé OpenRouter définie)
- « Affiche mon utilisation et mes coûts OpenRouter sans que j’aie à saisir les prix des modèles. »
- « Pourquoi mon premier message à Custom est-il si long pour un modèle local ? »
- « Quel est le taux de remplissage du contexte de ma session Custom, et qu’est-ce qui en occupe le plus ? »
- « Exécute ma session Custom avec le Sonnet de mon forfait Claude plutôt qu’avec OpenRouter. »
- « Quel modèle correspond à Meilleur pour Custom, et mes sessions Custom peuvent-elles démarrer en Automatique ? »
