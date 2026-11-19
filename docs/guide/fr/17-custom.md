# Custom, l’agent propre à l’app

Custom est l’agent propre à Hydor : il exécute les modèles de vos forfaits Claude et ChatGPT, ainsi que tout modèle que vous ajoutez, depuis OpenRouter, Ollama, vLLM ou un autre serveur compatible OpenAI, avec les mêmes outils, compétences et connexions que Claude Code et Codex. Ce sujet présente ce qu’il sait faire, ses modes d’autorisation et la façon dont il vérifie les commandes, le mode automatique, le bac à sable pour les commandes, les objectifs, la manière dont il gère les longues tâches et les modèles plus faibles, ainsi que ses paramètres.

![Paramètres → Modèles : le modèle d’appoint et les modèles sur cet ordinateur](images/custom.webp)

## Ce qu’est Custom et quand l’utiliser

Claude Code n’exécute que les modèles d’Anthropic, et Codex que ceux d’OpenAI. Custom exécute aussi les modèles de vos forfaits Claude et ChatGPT, grâce aux connexions de Claude Code et de Codex sur cet ordinateur, ainsi que tout modèle que vous configurez dans [Paramètres → Agents → Modèles](/settings?s=models) : des modèles ouverts sur votre propre ordinateur, des modèles bon marché ou gratuits via OpenRouter, ou un serveur à vous. Il n’y a rien à configurer pour les modèles de vos forfaits : dès que Claude Code est connecté, le menu **Modèle** de Custom propose Claude Opus, Fable, Sonnet et Haiku, et dès que Codex est connecté avec ChatGPT, les modèles que liste votre forfait ChatGPT, tous sous **Vos abonnements**. Ils consomment l’utilisation de votre forfait, pas une clé d’API. Voir [Agents, comptes et modèles](/guide/agents-models#where-customs-models-come-from) pour savoir d’où viennent les modèles de Custom et comment en ajouter.

Utilisez Custom si vous voulez :

- un modèle qui ne quitte jamais votre ordinateur (Ollama ou vLLM), ou une session entière qui ne le quitte pas : une [session confidentielle](/guide/sessions#keep-a-session-confidential) s’exécute toujours sur Custom et n’utilise que des modèles présents sur cet ordinateur ou sur votre propre réseau (jamais les modèles de vos forfaits, qui tournent sur les serveurs d’Anthropic ou d’OpenAI) ;
- un modèle en particulier, comme DeepSeek, Qwen, GLM ou Kimi ;
- les outils et les règles de Custom avec un modèle de votre forfait Claude ou ChatGPT, ou limiter les coûts, ou continuer à travailler quand votre forfait Claude ou ChatGPT est épuisé (avec un modèle d’ailleurs).

Il aide pour tout : recherche, rédaction, documents et tâches du quotidien. Dans un projet de code (un dossier contenant un `package.json`, un `Cargo.toml`, un dépôt git, etc.), il travaille comme un ingénieur soigneux : il lit avant de modifier, suit les instructions propres au projet, et exécute les tests et les vérifications du projet avant de dire que c’est terminé.

Custom lit les fichiers `AGENTS.md` ou `CLAUDE.md` du projet et suit vos [Consignes des agents](/guide/guidelines), comme les autres agents.

## Démarrer une session Custom

1. Sur la page de démarrage, cliquez sur **Agent** et choisissez **Custom** (« Any model: OpenRouter, Ollama, vLLM »).
2. Cliquez sur **Modèle** et choisissez l’un de vos modèles. Si la liste est vide, ajoutez d’abord un modèle : **Agent** → **Modèles pour Custom**.
3. Sous **Options**, choisissez **Autorisations** (voir [Choisir ce que Custom peut faire sans demander](#choose-what-custom-may-do-without-asking)). Custom n’a pas de réglage d’Effort.
4. Saisissez la tâche et appuyez sur Entrée.

Un modèle sur cet ordinateur servi par vLLM démarre la première fois qu’une session l’utilise ; la session affiche « Starting … with vLLM (the first time takes a minute or two)… ».

Custom traite un message à la fois. Un message envoyé pendant qu’il travaille attend dans la file au-dessus de la zone de saisie et part à la fin du tour.

Vous pouvez changer de modèle pendant une session depuis le menu sous la zone de saisie. Custom utilise le nouveau modèle dès son étape suivante, même au milieu d’un tour.

## Ce que Custom sait faire

- **Fichiers** : les lire (le texte avec les numéros de ligne, une partie d’un long fichier à la fois, le contenu d’un dossier), les créer, les réécrire et les modifier, lister les dossiers, et trouver des fichiers par leur nom ou par leur contenu. Avant de réécrire entièrement un fichier qu’il n’a pas lu dans cette session, il doit d’abord le lire.
- **Documents** : les fichiers PDF, Word, Excel, PowerPoint, OpenDocument, RTF et EPUB sont lus comme du texte.
- **Images** : les images que vous joignez, les fichiers image qu’il ouvre, et les images provenant de pages web ou d’outils. Un modèle qui voit les images reçoit l’image ; pour un modèle qui n’en voit pas, le modèle d’appoint la décrit (voir [Images pour les modèles qui ne voient pas](#images-for-models-that-dont-see)).
- **Commandes** : exécuter des commandes shell dans le dossier de la session, jusqu’à deux minutes par défaut et dix au maximum. Les serveurs, les observateurs et les autres commandes qui continuent de tourner passent en arrière-plan : Custom lit leur sortie quand il en a besoin et peut les arrêter. Elles s’arrêtent aussi quand Custom se ferme, et son tour suivant est informé de celles qui tournent encore.
- **Pages web** : récupérer une page sous forme de texte propre avec ses titres, liens, listes et tableaux ; les PDF et les fichiers Office en ligne sont lus comme du texte. Il n’atteint que des adresses publiques ; pour cet ordinateur ou son réseau, il utilise une commande comme `curl`.
- **Un plan** : pour un travail en plusieurs étapes, il tient une liste de contrôle, affichée dans la session, et coche les éléments au fur et à mesure.
- **Compétences** : il charge les compétences adaptées à la tâche : celles du projet, les vôtres (les dossiers de compétences de Claude Code et de Codex) et la [bibliothèque de compétences](/guide/skills) de l’app. Il les connaît par groupe et par nom, et peut aussi en chercher une d’après la nature du travail, en quelques mots.
- **Serveurs MCP** : les serveurs d’outils que vous configurez pour Claude Code (pour tous les dossiers et pour ce dossier), le fichier `.mcp.json` du projet, et ceux de Codex.
- **Les outils propres à l’app** : recherche sur le web, navigateur, mémoire, pages, vos [connexions](/guide/connections) et le reste, comme tous les agents ici les reçoivent.

Chaque étape apparaît dans la session avec un nom simple (« Read index.ts », « Edit README.md », « Fetch https://… »), son diff ou sa sortie à un clic.

## Choisir ce que Custom peut faire sans demander

Le paramètre **Autorisations** (sous **Options** sur la page de démarrage, ou dans le menu sous la zone de saisie d’une session) détermine ce que Custom fait de lui-même. Maj+Tab dans la zone de saisie passe au mode suivant.

- **Demander** (par défaut) : demande avant de modifier des fichiers et avant d’exécuter des commandes. Les commandes qui ne font que regarder (`ls`, `cat`, `git status`, etc.) s’exécutent librement.
- **Accepter les modifications** : modifie librement les fichiers du dossier de la session ; demande avant d’exécuter des commandes (sauf celles qui ne font que regarder) et avant tout ce qui sort du dossier.
- **Automatique** : les étapes courantes avancent ; une vérification rapide vous interroge sur les étapes risquées. Voir [Mode automatique](#auto-mode).
- **Accès complet** : les outils et les commandes s’exécutent sans demande d’approbation ni [bac à sable](#the-sandbox-for-commands) pour les commandes, y compris les commandes d’administrateur et les modifications hors du dossier. Ils utilisent les droits du compte de votre ordinateur : cela n’accorde pas un accès administrateur que votre compte n’a pas. Les sessions confidentielles gardent leurs restrictions réseau.
- **Plan** : lit et planifie seulement. Custom ne peut ni modifier de fichiers ni exécuter de commandes, et n’utilise que des outils de lecture. Il termine par un plan numéroté. Pour l’exécuter, passez à un autre mode et dites-lui de continuer.

En dehors d’Accès complet, certaines commandes demandent toujours : voir [Commandes qui demandent toujours](#commands-that-always-ask).

## Approuver ou refuser ce que Custom veut faire

Quand Custom a besoin de votre accord, une carte apparaît dans la session (et dans la [boîte de réception](/guide/inbox)). Son titre indique ce que fait l’étape et pourquoi elle demande, par exemple « Edit /home/you/notes/plan.md — it changes files outside the session folder ». Pour une commande, la carte affiche la commande entière.

- **Autoriser** laisse s’exécuter cette seule étape.
- **Always allow …** la laisse s’exécuter, ainsi que les étapes similaires, dès maintenant et pour le reste de cette session, sans demander. Le bouton indique ce qu’il couvre : « Always allow npm run build … », « Allow all edits », « Always allow reading in ~/data », « Always allow changes in ~/site ».
- **Rejeter** arrête cette étape. Custom est informé que vous avez refusé, et de ne pas réessayer.

Fonctionnement de **Always allow** pour les commandes : Custom découpe une commande en ses parties (au niveau de `&&`, `;`, `|`, etc.) et vérifie chacune. Une règle couvre la commande pour laquelle elle a été créée, d’après ses premiers mots (`git status`, `npm run build`, `docker compose up`), si bien que rien ne peut se glisser après `&&`. Les commandes qui ne font que regarder n’ont jamais besoin de règle.

**Always allow** n’est pas proposé quand il ne peut pas être sûr :

- pour du code donné directement dans la commande (comme `python -c "…"`) ;
- pour un fichier dont le nom ne peut pas être connu à l’avance ;
- pour une commande qui ne peut pas être lue avec certitude ;
- pour les commandes risquées, qui demandent à chaque fois.

## Commandes qui demandent toujours

En dehors d’Accès complet, ces étapes demandent votre accord à chaque fois, y compris en mode Automatique, quoi que vous ayez autorisé auparavant :

- l’exécution en tant qu’administrateur (`sudo` et similaires) ;
- la suppression de fichiers hors du dossier de la session, la suppression du dossier de la session lui-même, ou la suppression de fichiers qu’il ne peut pas nommer à l’avance ;
- le passage direct d’un téléchargement à un shell, ou l’exécution immédiate d’un téléchargement ;
- l’écriture de données brutes sur un disque, le formatage ou le repartitionnement d’un disque ;
- l’arrêt ou le redémarrage de l’ordinateur ;
- la modification des tâches planifiées (`crontab`) ;
- la modification des droits ou des propriétaires d’une arborescence entière de dossiers ;
- la modification des clés SSH, ou des paramètres et fichiers de démarrage de votre dossier personnel (comme `.bashrc` ou `~/.config`), sauf si la session travaille dans ce dossier.

## Fichiers hors du dossier et fichiers contenant des clés

Dans les modes Demander, Accepter les modifications et Plan, Custom demande avant de lire ou de modifier des fichiers hors du dossier de la session (le dossier temporaire ne compte pas). **Always allow** couvre alors ce dossier, en lecture ou en modification.

Les fichiers qui contiennent des clés ou des mots de passe demandent avant d’être lus ou modifiés, même dans le dossier : les fichiers `.env` (pas les exemples), les clés privées SSH et autres, `.netrc`, `.npmrc`, les fichiers d’identifiants, vos dossiers cloud et de gestionnaire de mots de passe, les connexions propres aux agents, et les données propres à l’app. Les modifications des paramètres et des hooks propres à git demandent aussi. **Always allow** couvre alors ce seul fichier.

En mode automatique, ce sont les règles d’Automatique et sa vérification rapide qui décident à leur place. En Accès complet, ils ne demandent pas.

## Mode automatique

Le mode automatique laisse le travail courant avancer sans vous arrêter, et vous interroge sur le reste. Choisissez **Automatique** sous **Autorisations**.

Chaque étape qui demanderait passe par ces vérifications, dans l’ordre :

1. **Règles fixes** qui ne nécessitent aucun modèle :
   - Passent : les modifications dans le dossier de la session ; les nouveaux fichiers brouillons dans le dossier temporaire ; les commandes qui ne font que lire dans le dossier ; les tests, builds, linters et vérifications de types propres au projet.
   - Vous sont soumises : l’écrasement d’un fichier hors du dossier ; tout ce qui figure dans la [liste des commandes qui demandent toujours](#commands-that-always-ask) ; le force-push avec git ; l’écriture, le déplacement ou la suppression de fichiers hors du dossier ; les commandes qui appellent un service de paiement ; les outils d’un compte connecté ou d’un serveur MCP qui envoient ou publient quelque chose, ou qui dépensent de l’argent.
2. **Une vérification rapide** pour tout le reste, par le [modèle d’appoint](/guide/agents-models#choose-the-helper-model). Elle répond de l’une de ces trois façons :
   - **autoriser** : l’étape sert clairement ce que vous avez demandé, reste dans votre dossier (ou ne fait que lire), et est facile à annuler ;
   - **demander** : l’étape pourrait causer un dommage durable ou va plus loin (suppression de données, installation de logiciels pour tout le système, modification de paramètres, utilisation de mots de passe ou de clés, envoi ou publication de quoi que ce soit, dépense d’argent, ou quelque chose que vous n’avez pas demandé) ;
   - **refuser** : l’étape est clairement nuisible ou contraire à ce que vous voulez. Elle ne s’exécute pas ; Custom est informé de la raison et doit trouver un autre moyen.

La vérification rapide ne voit que vos propres messages dans la session (le premier et les dix derniers), l’objectif si vous en avez défini un, le dossier et l’étape elle-même (pour une modification, le début du nouveau texte). Elle ne voit jamais ce que Custom a lu, de sorte qu’une page web ou un fichier ne peut pas la convaincre de quoi que ce soit. Si la vérification échoue ou prend plus de 45 secondes, c’est vous qui décidez. Au sein d’un même tour, la même étape reçoit la même réponse. Dans une [session confidentielle](/guide/sessions#keep-a-session-confidential), la vérification reste sur cet ordinateur : le modèle d’appoint l’effectue s’il tourne ici, sinon le modèle propre à la session.

Dans la session, une étape que le mode automatique a laissée passer porte une petite étiquette **Automatique** ; passez la souris dessus pour en voir la raison. Une étape que le mode automatique a arrêtée affiche l’étiquette en rouge ; passez la souris dessus pour voir « Auto stopped this: … » et la raison. Une carte que le mode automatique vous envoie commence par « Auto: » et la raison.

[Paramètres → Capacités → Custom](/settings?s=custom&find=Auto%20mode) comporte une ligne **Mode automatique** dont le (i) décrit le mode automatique dans les mêmes termes ; il n’y a rien à activer là.

## Le bac à sable pour les commandes

En mode Automatique, les commandes de Custom peuvent s’exécuter dans un bac à sable : elles ne peuvent modifier des fichiers que dans le dossier de la session et dans les dossiers temporaires, et tout le reste de l’ordinateur est en lecture seule. Elles peuvent toujours utiliser le réseau. Quand la session travaille dans un worktree git ou dans un sous-dossier d’un dépôt, le dossier propre du dépôt reste lui aussi modifiable, pour que git puisse faire des commits. Les caches des gestionnaires de paquets sont déplacés dans un dossier temporaire. La façon dont le bac à sable est réalisé dépend de votre ordinateur :

- **Linux** : il utilise bubblewrap. Les commandes peuvent modifier des fichiers dans le dossier de la session, dans le dossier temporaire (`/tmp`) et dans le dossier propre du dépôt.
- **Mac** : il utilise Seatbelt, le bac à sable fourni avec macOS. La règle est la même : le dossier de la session, les dossiers temporaires et le dossier propre du dépôt.
- **Windows** : les commandes s’exécutent en intégrité faible, une protection de Windows : elles peuvent tout lire, mais ne modifient des fichiers que dans les dossiers marqués à cet effet. La première fois, Hydor marque le dossier de la session (et le dossier propre du dépôt), et ce marquage reste. Les commandes disposent d’un dossier temporaire à elles, dans `AppData\LocalLow\Hydor`, pour les fichiers temporaires et les caches de paquets. Votre dossier personnel, un disque entier, Windows, Program Files et les dossiers de données d’applications ne sont jamais marqués : dans un tel dossier, les commandes s’exécutent sans le bac à sable. Le bash de Git ne peut pas partager son fonctionnement avec vos fenêtres bash ordinaires en intégrité faible ; la première fois, Hydor fait donc aussi une copie des programmes de Git pour les commandes en bac à sable, dans `AppData\Local\Hydor\sandbox` (faite de liens vers les mêmes fichiers, elle ne prend donc pas de place quand Git se trouve sur le même disque).

Quand une commande se heurte aux limites du bac à sable, Custom est informé qu’elle s’est exécutée dans un bac à sable, et il s’en accommode ou vous dit ce qu’il faut faire ailleurs.

Pour l’activer ou le désactiver, ouvrez [Paramètres → Capacités → Custom](/settings?s=custom&find=Sandbox%20for%20commands) et utilisez l’interrupteur à côté de **Bac à sable pour les commandes**. Il est activé par défaut. Désactivez-le si un outil doit écrire ailleurs, par exemple pour installer quelque chose pour tout le système. La modification s’applique aux sessions en cours en 15 secondes environ.

Si le bac à sable ne peut pas fonctionner, l’interrupteur est grisé et la ligne en indique la raison ; les commandes s’exécutent alors sans bac à sable. Sous Linux, cela signifie que bubblewrap n’est pas installé ou ne peut pas s’exécuter (comme dans certains conteneurs). Sur un Mac, cela signifie que Seatbelt n’a pas pu démarrer. Sous Windows, la première fois, Hydor construit un petit utilitaire avec le .NET Framework fourni avec Windows, et il a aussi besoin de Git pour Windows (dont les commandes ont de toute façon besoin) : la ligne l’indique quand l’un des deux manque ou que l’utilitaire ne peut pas démarrer. Dans les modes Demander et Accepter les modifications, les commandes n’utilisent pas le bac à sable : là, chaque commande qui fait plus que regarder attend votre accord, ou une règle que vous avez enregistrée avec **Toujours autoriser**.

Dans une [session confidentielle](/guide/sessions#keep-a-session-confidential), chaque commande s’exécute sans réseau, dans tous les modes et quel que soit l’état de cet interrupteur : elle ne peut donc pas atteindre internet, vos autres ordinateurs ni les serveurs de celui-ci. Ses fichiers restent tels que le mode les définit. Cela fonctionne sous Linux (bubblewrap) et sur un Mac (Seatbelt). Windows ne peut pas couper le réseau de cette façon ; là, et partout où le bac à sable ne peut pas fonctionner, chaque commande vous demande d’abord, dans tous les modes, sans **Toujours autoriser**. Custom en est informé, et une commande qui essaie d’utiliser le réseau apprend pourquoi elle a échoué.

## Donner un objectif à Custom

Un objectif garde Custom au travail, tour après tour, jusqu’à ce qu’une condition soit remplie : « npm test réussit et la page d’envoi gère les fichiers de 2 Go ».

1. Ouvrez le menu de la session (⋯) → **Définir un objectif**.
2. Décrivez ce que « terminé » signifie, sous la forme d’une condition vraie quand le travail est fini.
3. Cliquez sur **Commencer à travailler dessus** (ou appuyez sur Ctrl+Entrée, ⌘Entrée sur un Mac).

Custom s’y met aussitôt ; si un tour est en cours, l’objectif est vérifié à la fin de ce tour.

Après chaque tour, le modèle d’appoint vérifie l’objectif d’après les preuves : ce que les étapes ont fait et montré (sortie des commandes, résultats des tests, fichiers, pages lues). Le fait que Custom dise avoir terminé ne suffit pas. Ensuite :

- **Terminé** : l’objectif est effacé et vous recevez une notification, « Objectif atteint ».
- **Pas encore** : la vérification rédige l’étape suivante et l’envoie comme message suivant (« Vérification de l’objectif 3 : pas encore… »).
- **Votre intervention est requise** : l’objectif affiche « bloqué : l’agent a besoin de vous » avec la question, et vous recevez une notification. Répondez dans la session.
- **En attente** de quelque chose d’extérieur (un déploiement, un téléchargement) : la vérification regarde de nouveau dans trois minutes.

Vos propres messages passent en premier : une vérification attend que la file soit vide.

L’objectif se met en pause, et vous en dit la raison, quand :

- il a envoyé autant d’étapes suivantes que le permet **Tours avant la pause d’un objectif** dans les Paramètres (30 sauf si vous le modifiez) ;
- trois tours de suite n’ont fait aucun progrès ;
- vous avez arrêté l’agent, un tour a échoué, l’agent n’était pas en cours d’exécution, ou la vérification elle-même a échoué.

La barre d’objectif au-dessus de la zone de message affiche l’objectif, où il en est (« en cours », « en pause », « bloqué : l’agent a besoin de vous »), combien de fois il a été vérifié et pendant combien de temps, ainsi que la raison de la dernière vérification. **Pause** n’envoie plus d’étapes suivantes (un tour déjà en cours se termine), **Reprendre** repart de la dernière étape suivante (le compte des tours repart de zéro) et **Effacer** arrête de travailler à l’objectif. Pendant qu’un objectif est en cours, vous recevez une seule notification quand il est atteint, plutôt qu’une après chaque tour.

Pour modifier le nombre de tours qu’un objectif peut exécuter, ouvrez [Paramètres → Capacités → Custom](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses) et choisissez **10**, **30** ou **100** dans la ligne **Tours avant la pause d’un objectif** du groupe **Objectifs**.

## Longues conversations et longues sorties

Chaque modèle ne peut lire qu’une quantité limitée à la fois (son contexte). Custom garde chaque conversation dans cette limite tout seul ; il n’y a donc pas de bouton Compacter pour les sessions Custom :

1. Quand la conversation approche de la limite (en gardant de la place pour la réponse), Custom commence par effacer les anciennes sorties d’outils. La session indique : « Anciennes sorties d’outils effacées pour rester dans le contexte du modèle. »
2. Si cela ne suffit pas, le modèle résume la partie précédente en notes à partir desquelles le travail continue (« Résumé de la conversation précédente pour rester dans le contexte du modèle… »). La fois suivante, il met à jour ces notes au lieu de repartir de zéro. Votre plan et les compétences utilisées sont conservés dans les deux cas.

Si le serveur d’un modèle indique que la conversation est trop longue, Custom apprend la vraie limite de ce modèle et condense aussitôt. Seules les dernières images accompagnent chaque requête.

Ce que la mémoire a donné à Custom au départ reste identique pendant le travail, afin que le serveur du modèle puisse réutiliser ce qu’il a gardé de la conversation, ce qui est plus rapide et coûte moins cher. À chaque condensation, Custom relit la mémoire, pour votre dernier message (voir [Ce avec quoi un agent démarre](/guide/memory#what-an-agent-starts-with)).

L’anneau à côté de la zone de message indique le remplissage du contexte du modèle, en pourcentage ; pointez-le pour voir les tokens et à quoi ils servent. Sous **Options** (la pastille sous la zone de message), la ligne **Contexte** indique « 42 % utilisés », avec une petite flèche : cliquez dessus pour afficher (ou masquer) le détail, qui est replié au départ : **Instructions**, **Instructions du projet**, **Mémoire**, **Fonctionnalités de l’app**, **Compétences**, **Outils** et **Conversation**, chacun avec ses tokens et une fine barre pour sa part. Une partie vide est omise. Les chiffres sont estimés à partir du texte et ajustés à ce que le serveur du modèle a compté. Cliquer sur l’anneau ne fait rien dans une session Custom, puisque Custom condense tout seul ; les sessions Claude Code et Codex gardent leur anneau et **Compacter** (voir [Lire les indicateurs](/guide/sessions#read-the-meters-context-cache-and-speed)).

Les longues sorties ne remplissent pas non plus la conversation. Quand une commande, une page ou un outil renvoie plus qu’une part du contexte du modèle, Custom en garde l’intégralité dans un fichier du dossier propre de la session. Le modèle reçoit le début et la fin (pour une commande, surtout la fin, là où apparaissent les erreurs) ainsi que l’emplacement du fichier, et lit le reste par morceaux ou y fait des recherches. Ces fichiers sont supprimés au bout d’une semaine.

## Ce que le modèle lit

Avant votre message, le modèle reçoit, dans cet ordre :

- les règles propres de Custom (comment travailler, le mode, le dossier), les instructions de l’agent et vos Consignes des agents : **Instructions** dans le détail ;
- les instructions du projet, son `AGENTS.md` ou `CLAUDE.md` : **Instructions du projet** ;
- ce que la [mémoire](/guide/memory#what-an-agent-starts-with) a pour votre demande : **Mémoire** ;
- ce que disent les fonctionnalités de l’app : l’aspect des réponses, comment garder les clés et les mots de passe hors de la conversation, le nettoyage, et comment utiliser en détail les outils dont il dispose (images, apps, navigateur, documents, etc.) : **Fonctionnalités de l’app** ;
- ses compétences (**Compétences**), nommées par groupe : celles du projet, les vôtres, puis les groupes de la Bibliothèque comme Coding ou Documents. Custom peut en charger une par son nom, ou en chercher une d’après la nature du travail. Custom prend jusqu’à 200 compétences, dont au plus 40 pour celles du projet et les vôtres. Les compétences qui correspondent à votre premier message arrivent avec l’usage de chacune ;
- ses outils, ceux dont il dispose en détail et une courte liste des autres : **Outils**.

Les instructions d’une fonctionnalité sur ses propres outils arrivent avec ces outils. Tant qu’un outil reste dans la courte liste de Custom, ses instructions attendent aussi ; elles sont ajoutées quand le modèle cherche l’outil ou l’utilise. Les règles qui valent quels que soient les outils utilisés restent toujours. Claude Code et Codex reçoivent toutes les instructions de l’app au départ, comme avant.

Ainsi, un premier message à un modèle au petit contexte est plus court qu’avant, et ce que prend chaque partie figure dans le détail sous **Options** : voir [Longues conversations et longues sorties](#long-conversations-and-long-output).

**La mémoire est dimensionnée selon le contexte du modèle.** Un modèle au petit contexte ne pourrait pas faire son travail si la mémoire prenait une quantité fixe ; la part de la mémoire diminue donc avec la fenêtre (la ligne **Mémoire** du détail montre ce qu’elle prend) :

- **Moins de 12 000 tokens** : un petit bloc, d’au plus 6 % du contexte, avec les 120 premiers mots de votre profil (il précise que ce n’est que le début), au plus trois notes, et pas d’index. La mémoire n’ajoute rien à vos messages ni quand le modèle lit ou modifie un fichier, et ne donne ni lignes d’articles du wiki ni plans. Le modèle est informé qu’il peut chercher des notes avec l’outil de mémoire.
- **Jusqu’à environ 33 000 tokens** (hors OpenRouter) : un bloc d’au plus 6 % du contexte, les 400 premiers mots de votre profil, au plus cinq notes, un court index, une ligne d’article du wiki et une ligne de plan, et au plus une note avec un message (600 caractères) et une quand un fichier est lu ou modifié (350).
- **Modèles plus grands** : tout ce que [la mémoire donne à un agent](/guide/memory#what-an-agent-starts-with), ce qui représente une petite part de leur contexte.

À titre indicatif, le bloc de la mémoire fait environ 1 700 caractères pour un modèle de 8 000 tokens, 3 800 pour 32 000 et 7 300 pour 200 000. Une session qui n’a reçu que le début de votre profil ne peut pas le réécrire : le modèle vous dit quoi ajouter, ou vous le modifiez dans [Paramètres → Mémoire](/settings?s=memory&find=Your%20profile). Les instructions du wiki sont elles aussi raccourcies : Custom reçoit toujours un court paragraphe sur la Mémoire wiki, et la manière de conserver les sources, de vérifier le wiki et d’adopter des plans n’arrive que tant que les outils correspondants sont proposés. Après que Custom a condensé sa conversation, le point de contrôle de la session (voir [Points de contrôle](/guide/wiki-memory#checkpoints)) est ramené à 8 % du contexte, au plus 16 000 caractères, avec l’indication d’où lire le reste.

## Comment Custom gère les modèles moins performants

Tous les modèles ne maîtrisent pas les outils aussi bien que Claude ou GPT. Custom repère les erreurs courantes et remet le modèle sur la bonne voie :

- **Répétitions** : une même étape dont rien n’a changé depuis n’est pas exécutée une troisième fois (on indique au modèle d’utiliser le résultat précédent) ; à la cinquième fois, le tour s’arrête.
- **Étapes qui échouent** : après quatre étapes échouées d’affilée, on demande au modèle de s’arrêter et de reconsidérer son approche ; après huit, le tour s’arrête.
- **Boucles** : lorsque des étapes tournent en rond, le modèle reçoit une note l’invitant à essayer autre chose.
- **Travail inachevé** : un modèle qui dit « laissez-moi… » sans passer à l’acte, ou qui s’arrête alors que des points de son plan restent ouverts, est renvoyé au travail, une fois dans chaque cas. S’il a modifié du code sans lancer les vérifications du projet, on lui demande de les lancer avant de terminer.
- **Longueur** : un tour comporte au plus 200 étapes ; à 150, on demande au modèle de terminer la partie la plus importante. Une réponse coupée par la limite de longueur du modèle se poursuit en étapes plus courtes.
- **Appels d’outils défaillants** : les appels écrits sous forme de texte sont lus et exécutés, les appels dont les arguments sont presque corrects sont réparés, et un nom d’outil mal orthographié est associé au bon outil ou reçoit en réponse la liste des outils. Une réponse qui écrit ses appels sous forme de texte s’arrête là où ses appels s’arrêtent : ce que le modèle écrit après (des résultats imaginés, d’autres appels à la suite, le même appel répété) n’est ni exécuté ni conservé, et six appels au plus sont exécutés pour une même réponse.
- **Modèles sans appel d’outils** : lorsque le serveur d’un modèle n’accepte aucun outil, Custom les décrit dans les instructions et lit les appels du modèle dans ce qu’il écrit.
- **Claude via Claude Code** : Anthropic réserve à ses propres programmes l’usage de la connexion d’un abonnement ; un modèle Claude de votre abonnement répond donc par Claude Code lui-même, une étape à la fois. Les outils de Custom sont décrits dans ses instructions et Claude écrit ses appels d’outils sous forme de texte, comme un modèle sans appel d’outils, et chaque étape réutilise le cache de la précédente. Claude Code ne peut pas terminer une réponse à ses appels d’outils ; Custom la termine donc lui-même à cet endroit et arrête le programme, avant que Claude puisse écrire des résultats imaginés. Les modèles de Codex sont différents : ils sont sollicités directement sur votre abonnement ChatGPT, avec les outils de Custom comme de vrais outils.
- **Aléas** : lorsque la connexion se coupe en pleine réponse, ou que le serveur est occupé, Custom patiente et réessaie plusieurs fois. Lorsque l’app redémarre (une mise à jour) pendant qu’une étape attend un modèle de votre abonnement, l’étape est redemandée au retour de l’app ; un tour interrompu par le redémarrage l’indique, et un message permet de le poursuivre.
- **Nombreux outils** : lorsqu’il y en a beaucoup (issus de serveurs MCP et de connexions), le modèle voit une courte liste et consulte la description complète de ceux dont il a besoin ; les instructions d’une fonctionnalité concernant un outil l’accompagnent, quand le modèle le consulte ou l’utilise (voir [Ce que lit le modèle](#what-the-model-reads)). Un modèle à contexte court (environ 32 000 jetons ou moins, hors OpenRouter) reçoit un ensemble allégé : pas de conseils sur les UI de réponse, une liste d’outils par leur seul nom, et moins d’outils en version complète (celui qui affiche une page HTML reste lui aussi dans la liste). On lui demande aussi d’avancer par petites étapes.
- **Chaque famille de modèles** reçoit les réglages recommandés par son éditeur, le format de modification sur lequel elle a été entraînée, et un niveau d’effort de raisonnement lorsqu’elle en a un. Les étapes qui se contentent de lire s’exécutent en parallèle, pour éviter d’attendre.

Lorsque Custom arrête un tour pour l’une de ces raisons, la réponse se termine par « (Stopped: …) ».

## Les images pour les modèles qui ne voient pas

Un modèle qui voit les images reçoit directement vos images. Elles sont d’abord réduites lorsque cet ordinateur dispose de ffmpeg ou d’ImageMagick.

Pour un modèle qui ne voit pas les images, le modèle d’appoint décrit chaque image avec des mots : ce qu’elle montre, où se trouvent les éléments, et le texte qu’elle contient, recopié à l’identique. Cela demande un modèle d’appoint qui voit les images : ouvrez [Paramètres → Agents → Modèles](/settings?s=models&find=Helper%20model) et choisissez-en un marqué « sees images » dans le menu **Modèle** du groupe **Modèle d’appoint**. « Automatique » ne convient pas. Sans modèle de ce type, Custom indique au modèle qu’il y a une image qu’il ne peut pas voir. Dans une session confidentielle, seul un modèle d’appoint présent sur cet ordinateur décrit les images (un modèle de vos abonnements ne le fait jamais).

## Dupliquer et Modifier à partir d’ici

Les sessions Custom peuvent être dupliquées comme les sessions Claude Code et Codex : menu de la session (⋯) → **Dupliquer**. Vous pouvez aussi modifier un de vos messages précédents avec **Modifier à partir d’ici** : la conversation se poursuit dans une copie, à partir de juste avant ce message, et l’ancienne est archivée. Cochez **Remettre les fichiers dans l’état précédant ce message** pour annuler les modifications de fichiers survenues depuis. Pour Custom, cela concerne les fichiers modifiés par ses propres modifications ; ce que les commandes ont changé reste tel quel.

Custom conserve chaque conversation sur le disque, qui se poursuit donc après le redémarrage de l’app.

## Ce que coûte Custom

- Modèles via OpenRouter : OpenRouter indique ce que chaque appel a coûté, et les dépenses de la session s’appuient là-dessus. On demande aux modèles Claude de cet service de garder la conversation dans leur cache, comme le font d’eux-mêmes les autres, si bien que chaque étape la relit pour environ un dixième du prix ; et les outils proposés à Custom ne changent qu’une fois au plus dans une session (les outils pour les commandes exécutées en arrière-plan restent dès qu’une commande a été lancée), afin que ce cache tienne.
- Modèles de votre abonnement Claude ou ChatGPT (sous **Vos abonnements**) : c’est l’utilisation de votre abonnement qui est consommée, pas de l’argent au jeton, de sorte qu’une session affiche 0 $ pour ces étapes. Un compte qui a atteint sa limite d’utilisation ou qui est déconnecté confie l’étape à votre compte suivant de ce programme (avec **Changer de compte à une limite** activé).
- Modèles sur cet ordinateur (Ollama, vLLM) : rien.
- Autres points de terminaison : les jetons sont facturés comme ceux des autres agents (voir [Utilisation, limites et coûts](/guide/usage)).

La session affiche le coût d’API ainsi que les jetons d’entrée, en cache et de sortie au-dessus de la zone de message, même sans plafond de dépenses. Les frais proviennent de la réponse d’OpenRouter, ou de son enregistrement de génération si les frais en flux sont absents ; les prix de son propre catalogue servent de solution de repli. Aucun prix n’est à saisir manuellement.

Un [plafond de dépenses](/guide/usage#cap-what-a-session-spends) fonctionne aussi pour les sessions Custom.

## Paramètres → Capacités → Custom

[Paramètres → Capacités → Custom](/settings?s=custom) (« Mode automatique, bac à sable pour les commandes et durée d’exécution des objectifs ») comporte trois lignes :

- **Mode automatique** (l’un des modes de Custom, avec Demander, Accepter les modifications, Accès complet et Planifier) : son (i) indique ce que le mode automatique laisse passer, ce qui demande toujours une confirmation, et que c’est le modèle d’appoint qui fait la vérification. Rien à activer : vous choisissez le mode automatique session par session sous **Autorisations**.
- **Bac à sable pour les commandes** (en mode automatique, les commandes ne modifient des fichiers que dans le dossier de la session et dans /tmp sous Linux, les dossiers temporaires sur un Mac, ou un dossier temporaire qui leur est propre sous Windows ; l’Accès complet s’exécute sans ce bac à sable ni demandes d’approbation) : un interrupteur, activé par défaut. Il est grisé lorsque le bac à sable ne peut pas fonctionner ici (bubblewrap sous Linux, Seatbelt sur Mac, Git for Windows et .NET Framework sous Windows), et la ligne en indique la raison.
- **Tours avant la pause d’un objectif**, dans le groupe **Objectifs** (avec /goal, Custom travaille tour après tour jusqu’à ce que l’objectif soit atteint ; après ce nombre de tours, il se met en pause pour vous attendre) : **10**, **30** (par défaut) ou **100** tours. Il se met aussi en pause après trois tours sans progrès.

Les modèles de Custom se trouvent dans [Paramètres → Agents → Modèles](/settings?s=models), et le modèle qui fait les vérifications y est le **Modèle d’appoint**.

## Demander à un agent

- « Désactive le bac à sable pour les commandes du mode automatique de Custom. »
- « Laisse les objectifs de Custom s’exécuter jusqu’à 100 tours. »
- « Fixe un objectif à ma session Custom “Page de téléversement” : npm test réussit et les envois de 2 Go fonctionnent. »
- « Quel modèle d’appoint le mode automatique utilise-t-il, et peut-il voir les images ? »
- « Cet ordinateur peut-il exécuter les commandes de mes sessions confidentielles sans réseau ? »
- « Ajoute Qwen3 Coder depuis OpenRouter pour que je puisse l’utiliser avec Custom. » (une fois votre clé OpenRouter définie)
- « Affiche mon utilisation et mes coûts OpenRouter sans saisir de prix de modèles. »
- « Pourquoi mon premier message à Custom est-il si long pour un modèle local ? »
- « Quel est le taux de remplissage du contexte de ma session Custom, et qu’est-ce qui en occupe le plus ? »
- « Exécute ma session Custom sur le Sonnet de mon abonnement Claude plutôt que sur OpenRouter. »
