# Recherche approfondie, seconds avis et plusieurs agents

Quand un seul agent ne suffit pas, l’app peut en mobiliser plusieurs : une recherche approfondie qui envoie des chercheurs explorer chaque partie d’une question et rend un rapport avec ses sources citées, des sous-agents qui prennent en charge des parties d’une tâche à la place d’un agent, un essaim qui s’attaque à un problème difficile sous plusieurs angles à la fois, et une campagne qui réalise un grand changement en plusieurs parties. Vous pouvez aussi demander au modèle d’une autre entreprise de vérifier le travail d’un tour, envoyer un même prompt à plusieurs modèles pour garder la meilleure réponse, et plafonner ce qu’une session peut dépenser pour que rien de tout cela ne fasse déraper votre budget.

![Recherche approfondie sur la page de démarrage : chercheurs à la fois, tours, total des recherches et rapport](images/research.webp)

## Lancer une recherche approfondie

Une recherche approfondie sert pour les questions qui demandent beaucoup de sources : comparer des options, vérifier une affirmation, faire le tour d’un sujet, trouver ce que l’on sait d’une question. L’agent que vous démarrez la dirige. Il planifie les recherches, envoie des chercheurs sur chaque partie de la question, creuse ce qu’ils laissent ouvert, fait vérifier les affirmations clés auprès de deux sources, et remet un rapport où chaque source est citée.

### L’activer

1. Sur la page de démarrage, ouvrez **Options** (la pastille à droite de la ligne sous la zone de message) et choisissez **Recherche**.
2. Choisissez **Recherche approfondie** (« Cherche largement, vérifie les sources, les cite »). Ses réglages apparaissent en dessous.
3. Réglez les nombres et le type de rapport souhaité (voir plus bas).
4. Saisissez votre question dans la zone de message et appuyez sur **Début**.

La ligne Recherche affiche alors « Approfondie · 60 recherches » (votre budget de recherches), et la pastille Options la nomme (« Recherche approfondie »). Choisissez **Désactivé** (« Un seul agent répond, en cherchant selon ses besoins ») pour revenir à un agent seul.

Sur un téléphone, Options s’ouvre en feuille depuis le bas de l’écran, et Recherche s’ouvre par-dessus.

Une recherche approfondie et un essaim (ou une campagne) fonctionnent tous par une équipe de sous-agents Hydor : vous avez donc l’un ou l’autre, et activer l’un désactive l’autre.

La première fois que vous choisissez **Recherche approfondie**, une boîte de dialogue intitulée « Avant d’utiliser la recherche approfondie » explique ce qu’elle fait, dans quels cas elle vaut la peine, dans quels cas elle ne la vaut pas, et ce qu’elle coûte. Appuyez sur **Utiliser la recherche approfondie** pour continuer, ou sur **Annuler** pour laisser les choses en l’état. Elle ne s’affiche qu’une fois pour vous, sur tous vos appareils, où que vous choisissiez cette option (la page de démarrage, les options d’une tâche planifiée ou la boîte de dialogue d’une session), que les astuces soient activées ou non ; demander à un agent d’afficher de nouveau les astuces la fait aussi revenir.

Vous n’avez pas à décider sur la page de démarrage. Dans une session déjà en cours, ouvrez son menu (⋯) → **Paramètres de la session** → **Recherche approfondie** ; son indication affiche « Désactivé », ou le nombre de recherches (« 60 recherches »). La boîte de dialogue propose **Désactivé** et **Recherche approfondie** avec les mêmes réglages que ci-dessus (**Chercheurs à la fois**, **Tours**, **Total des recherches**, **Le rapport**) ; appuyez sur **Enregistrer** quand vous avez terminé, ou sur **Annuler**. Le changement prend effet dès votre prochain message : l’agent de la session (Claude Code ou Codex) redémarre avec les nouvelles instructions et les nouveaux outils avant ce message, et la conversation reprend là où elle en était. Activer une recherche approfondie désactive un essaim, et inversement. La pastille de la zone de message à côté du **+** (ses **Options**) comporte la même ligne **Recherche approfondie**, sous **Autorisations**.

Cette entrée n’existe pas pour une session confidentielle, ni pour une session démarrée par une autre session (un membre d’un essaim, un chercheur, un sous-agent).

Une tâche planifiée peut exécuter une recherche approfondie à chaque exécution : son éditeur propose le même réglage **Recherche** ([Tâches planifiées](/guide/tasks)).

### Ses réglages

- **Chercheurs à la fois** (de 1 à 8 ; 4 au départ) : le nombre de chercheurs qui cherchent en même temps à chaque tour, c’est-à-dire l’ampleur de chaque tour.
- **Tours** (de 1 à 5 ; 2 au départ) : le nombre de tours de recherche, chacun s’attaquant à ce que le précédent a laissé ouvert. Un tour de vérification vient après eux.
- **Total des recherches** (de 10 à 500, par pas de 10 ; 60 au départ) : les recherches web que l’ensemble de la recherche peut utiliser, celles du responsable et des chercheurs confondues.
- **Le rapport** : **Page** ou **Word**.

Ce navigateur retient les nombres pour votre prochaine recherche approfondie. Le mode lui-même n’est pas conservé : chaque nouvelle session démarre avec Recherche désactivée, car une recherche approfondie coûte plusieurs fois le prix d’une réponse.

### Ce qui se passe, étape par étape

1. **Plan.** Le responsable détermine ce que la question demande vraiment et ce que couvre une réponse complète. Il la découpe en sous-questions et rédige quelques recherches pour chacune, avec des formulations variées, dans d’autres langues quand cela aide, et visant les sources qui tranchent (données officielles, articles, documents primaires, presse de référence). Si un point crucial n’est pas clair, il vous interroge une seule fois, brièvement ; sinon il énonce ses hypothèses et poursuit.
2. **Premier tour.** Il lance jusqu’au nombre de chercheurs que vous avez fixé, un par sous-question. Chaque chercheur est un sous-agent Hydor muni de sa propre consigne : la question entière, sa partie, les recherches de départ, à peu près le nombre de recherches qui lui revient, et ce qu’il doit rapporter. Le responsable attend ensuite ; le rapport de chaque chercheur lui revient sous forme de message.
3. **Tours suivants.** Le responsable lit les rapports et envoie de nouveaux chercheurs sur les lacunes, les contradictions et les affirmations qui reposent sur une seule source. Il saute un tour quand plus rien d’important ne reste ouvert. Après chaque tour, il vous dit en une ligne ce qui a été trouvé et la suite.
4. **Vérifier.** Il dresse la liste des affirmations sur lesquelles repose la réponse. Chacune requiert deux sources indépendantes, ou est signalée comme reposant sur une seule, ou comme contestée. Un chercheur (ou le responsable lui-même) ouvre les pages citées pour confirmer que chaque affirmation et chaque chiffre clés s’y trouvent bien ; ce qui ne tient pas est corrigé ou écarté.
5. **Rapport.** Il rédige le rapport : un titre clair, d’abord la réponse en quelques phrases, puis des sections, une citation numérotée après chaque affirmation, et les sources à la fin (titre, site, date et lien). Il indique ce qui est incertain ou contesté et pourquoi, et vous donne un court résumé dans la conversation.

Les chercheurs cherchent avec la recherche web propre à l’app et lisent les pages avec son lecteur de pages ([Recherche et navigateur](/guide/web)). Pour que chaque recherche soit décomptée du budget, la recherche web intégrée de Claude Code et de Codex est désactivée dans une recherche approfondie. Quand le budget est épuisé, une recherche est refusée et l’agent reçoit pour consigne de rédiger son rapport avec ce qu’il a. De la même façon, une fois terminés les tours que vous avez fixés et le tour de vérification, le responsable ne peut plus lancer de chercheurs.

### La suivre dans la session

Une barre au-dessus de la zone de message de la session du responsable montre ce que fait la recherche : **Recherche approfondie** · « Planification », puis « Tour 1 sur 2 · 4 chercheurs au travail », « Lecture des rapports » entre les tours, « Vérification des sources » pendant que les chercheurs vérifient les affirmations clés, « Rédaction du rapport », et à la fin « Rapport prêt » · ainsi que la part du budget utilisée (« 12 recherches sur 60 »). Une fois le rapport prêt, **Ouvrir le rapport**, à droite de la barre, l’ouvre : la page, ou le document Word. Pointez la barre pour voir les réglages de la recherche et ce que sera le rapport.

Chaque chercheur a une ligne dans l’unique carte que les chercheurs partagent dans la conversation du responsable (« 4 chercheurs ») et apparaît sous le responsable dans la barre latérale, comme n’importe quel [sous-agent Hydor](/guide/research#follow-subagents). Ce que chacun rapporte s’affiche sous forme d’une ligne, « Réponse de » suivie de son titre, avec le début de ce qu’il a trouvé : cliquez sur la ligne pour la lire. Ouvrez un chercheur pour le voir travailler : sa barre indique « Recherche pour » et le titre du responsable, avec **Responsable** pour revenir.

### Le rapport

- **Page** : le rapport est enregistré comme une page que vous conservez. Il s’affiche dans la conversation et est conservé dans les fichiers du projet de la session (ses détails → **Fichiers**), ou reste avec la conversation quand la session n’a pas de projet ([Pages, documents et images](/guide/library)).
- **Word** : le rapport est un document Word (.docx) dans le dossier de la session, réalisé avec la compétence **word-documents** de l’app, et s’affiche comme une carte de fichier que vous pouvez ouvrir ou télécharger ([Documents, images, vidéos et voix](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Une recherche approfondie fait travailler de nombreux agents à la fois. Fixez un plafond de dépenses dans ce même menu Options avant de commencer : il couvre le responsable et tous ses chercheurs ([Plafonner les dépenses d’une session](/guide/research#put-a-spending-cap-on-a-session)).

## Confier du travail à des sous-agents

Tout agent peut confier une partie autonome de son travail à un sous-agent, qui s’en occupe en même temps et fait son rapport ensuite. Dans les sessions que Hydor exécute, chaque sous-agent est un **sous-agent Hydor** : une session à part entière que Hydor démarre, avec n’importe quel agent et n’importe quel modèle. Il a une ligne dans la carte des sous-agents de la conversation, se place sous son parent dans la barre latérale, a son propre coût et sa propre part du plafond de dépenses, vous pouvez l’ouvrir et lui parler, et sa réponse revient au parent sous forme de message. Les programmes des agents ne peuvent pas y démarrer leurs propres sous-agents : Hydor désactive l’outil Agent de Claude Code, ses workflows et ses agents cloud, ainsi que les sous-agents de Codex, pour que chaque partie d’un travail s’affiche, se compte et s’arrête de la même façon, et les autres agents reçoivent pour consigne d’utiliser ceux de Hydor. Un **sous-agent Claude Code** (ou un « sous-agent Codex ») s’affiche toujours quand il a été démarré par une session qui s’exécute dans VS Code ou dans un terminal, ou par une session antérieure : il a une ligne dans la carte et une page à lui que vous pouvez lire, mais vous ne pouvez pas lui parler, et ce qu’il dépense est compté dans les dépenses de la session ([Sous-agents](/guide/sessions#subagents)).

Il n’y a rien à activer : demandez simplement avec vos mots (« demande à trois sous-agents de chercher chacun un fournisseur », « laisse Codex écrire les tests pendant que tu t’occupes de la documentation »), ou laissez l’agent décider quand un travail se découpe bien. L’agent principal d’une session reçoit de lui-même la consigne de travailler ainsi : il garde la planification et la vérification, et confie des parties claires à des sous-agents sur des niveaux moins chers, ce qui réduit le coût du travail (voir [Niveaux : un modèle pour chaque type de travail](/guide/agents-models#tiers-a-model-for-each-kind-of-job) ; **Diriger avec des sous-agents** permet de le désactiver).

Pour chaque sous-agent Hydor, l’agent choisit :

- **L’agent et le modèle** : Custom avec n’importe lequel de ses modèles (depuis [Paramètres → Modèles](/settings?s=models)), Claude Code, Codex, ou un autre agent que vous avez ajouté (Gemini CLI, OpenCode…). Par défaut, un sous-agent Hydor exécute le même agent que la session qui l’a démarré. Un modèle moins cher ou local convient au travail en volume ; Claude Code ou Codex convient à une partie difficile. Un agent ne se voit proposer que les programmes auxquels vous êtes connecté. S’il demande un Claude Code ou un Codex auquel vous n’êtes pas connecté (par son nom, ou en tant que l’un de vos agents qui fonctionne avec lui), il en est informé, et apprend que Custom fonctionne, au lieu d’obtenir un autre programme sans en être averti.
- **Un niveau** pour sa partie : **Rapide** pour un petit travail très clair, **Standard** pour une tâche claire de taille moyenne (ce que reçoit un sous-agent Hydor quand aucun n’est demandé), **Meilleur** pour une partie difficile qui se suffit à elle-même ; le modèle du niveau pour ce programme provient de [Paramètres → Modèles → Niveaux](/settings?s=models&find=Tiers). Un sous-agent Hydor ne réfléchit jamais avec un niveau supérieur à celui de son parent, et l’un de vos agents peut plafonner plus bas le niveau de ses sous-agents.
- **Un de vos agents**, par son nom, au lieu d’un sous-agent simple : il travaille avec ses propres instructions, ses outils et son niveau (voir [Des agents qui confient du travail à d’autres agents](/guide/agents#agents-that-hand-work-to-other-agents)). Un agent qui garde une conversation à lui reçoit le travail dans sa boîte de réception, et sa réponse revient quand il s’en occupe.
- **Le dossier** : celui du parent, sauf si un autre est indiqué.
- **Un worktree** s’il en veut un : une copie séparée du dépôt Git du dossier sur une nouvelle branche, afin que les modifications du sous-agent ne se mélangent pas à celles des autres.
- **Un titre court**, qui est le nom que vous voyez.

Un sous-agent Hydor ne voit rien de la conversation du parent, donc l’agent lui rédige un brief avec tout ce dont il a besoin. Personne ne le surveille pendant qu’il travaille : il tranche lui-même les petites questions, dit ce qu’il a décidé, et ne s’arrête pour demander que s’il ne peut pas continuer.

### Comment les réponses reviennent

Quand le tour d’un sous-agent Hydor se termine, sa réponse retourne au parent sous forme de message, ce qui réveille le parent. Si le parent est occupé, le message attend dans sa file jusqu’à la fin de son tour.

Dans la conversation du parent, la réponse s’affiche sur une seule ligne : « Réponse de », le titre du sous-agent et le début de ce qu’il a écrit. Cliquez sur la ligne pour lire la réponse (son résumé, si elle était longue), puis **Ouvrir sa session** ou **Lire toute la réponse** pour accéder au sous-agent. Un sous-agent arrêté avant d’avoir fini s’affiche comme « … a été arrêté », et un sous-agent en échec comme « … s’est arrêté sur une erreur ». Un sous-agent qui a atteint une limite d’utilisation et qui poursuit s’affiche comme « … poursuit après une limite d’utilisation », avec la manière dont il poursuit.

Un sous-agent Claude Code ou Codex qui a travaillé en arrière-plan revient de la même façon : une seule ligne, « Réponse de » et son titre (ou « … a été arrêté », « … s’est arrêté sur une erreur »), avec le début de ce qu’il a écrit ; cliquez dessus pour lire la réponse, puis **Ouvrir sa session** pour y accéder. La réponse d’un sous-agent Codex est récupérée dans sa propre conversation quand vous ouvrez la ligne (« Chargement de sa réponse »). Une réponse arrivée pendant que le parent travaillait encore s’affiche sur place, entre les étapes qui la précèdent et celles qui la suivent.

- Une réponse de plus de 4 000 caractères environ arrive sous forme d’un court résumé rédigé par le modèle d’appoint ([Agents, comptes et modèles](/guide/agents-models)) ; le parent peut toujours la lire en entier.
- Si un sous-agent Hydor s’arrête sur une erreur, ou est arrêté avant d’avoir fini, le parent en est informé aussi.
- Si une limite d’utilisation interrompt le tour d’un sous-agent Hydor et qu’il poursuit (avec un autre compte, avec du crédit d’API, ou de lui-même une fois la limite réinitialisée), le parent en est informé à la place d’une erreur, afin qu’il ne recommence pas le travail : la réponse du sous-agent arrive quand il a terminé. Seul un sous-agent qui reste arrêté est signalé comme une erreur. Plus de détails dans [Utiliser tous vos comptes : basculer à la limite](/guide/agents-models#use-all-your-accounts-switch-at-a-limit).
- Un sous-agent Hydor démarré en Rapide ou Standard dont la réponse ne passe pas une vérification rapide (le modèle d’appoint lit son brief et sa réponse), ou qui s’arrête sur une erreur, est exécuté de nouveau un niveau plus haut, jusqu’à Meilleur et jamais au-dessus du plus haut que permet son responsable ; le parent est informé que cela s’est produit et pourquoi. Seule la réponse à son brief est vérifiée, pas ses réponses ultérieures à des messages. L’un de vos agents peut désactiver cela (**Monter d’un niveau quand une vérification échoue**). Le parent peut aussi faire monter lui-même un sous-agent d’un niveau quand il juge son résultat insuffisant.
- Le parent peut consulter ses sous-agents Hydor à tout moment (ce que fait chacun, son agent et son modèle, ce qu’il a dépensé, le début de sa dernière réponse) et en charger un de travail supplémentaire.
- Les réponses des tours qui se sont terminés pendant que l’app était arrêtée sont transmises au redémarrage.

Vous pouvez ouvrir un sous-agent Hydor et lui parler comme à n’importe quelle autre session. Ce qu’il répond à la fin d’un tour retourne aussi au parent.

### Suivre les sous-agents

- **Dans la conversation du parent** : les sous-agents démarrés par un tour s’affichent ensemble dans une seule carte sous ce tour, les sous-agents Hydor dans une carte et ceux du programme dans une autre. Sa ligne du haut indique combien il y en a et de quel type, avec ce qu’ils ont en commun (« 3 sous-agents Hydor · Claude Code · Sonnet 5.5 », « 6 sous-agents Claude Code · Sonnet 5.5 », « 4 chercheurs » dans une recherche approfondie), et où ils en sont (« 5 en cours · 1 terminé », et aussi « 1 a besoin de vous », « 1 arrêté », « 1 en échec ») ; cliquez dessus pour replier ou déplier la carte. Elle est ouverte tant que l’un d’eux travaille ou a besoin de vous, et se replie sur cette ligne une fois qu’ils ont tous terminé. En dessous, chaque sous-agent a une ligne : un point de la couleur de son état (bleu pendant qu’il travaille, ambre quand il a besoin de vous, vert terminé, gris arrêté, rouge en échec), son titre, sur un grand écran ce qu’il a de particulier par rapport aux autres (son type ou son modèle, l’agent à vous sous lequel il travaille, son niveau), et où il en est (depuis combien de temps il travaille, « A besoin de vous », « Il y a 3 min » quand il a terminé, « Arrêté », « En échec »). La ligne d’un sous-agent Hydor indique aussi ce qu’il a dépensé, et survoler un sous-agent qui est monté d’un niveau affiche « Monté depuis » son premier niveau et pourquoi ; un sous-agent Claude Code ou Codex n’a pas de coût propre. Cliquez sur une ligne pour ouvrir le sous-agent. Tant que d’autres travaillent, ceux qui ont terminé se replient sur une seule ligne (« 4 terminés : » et leurs titres ; cliquez dessus pour les voir), ceux en échec restent sur des lignes à part, et quand plus de six travaillent, cinq s’affichent, avec **Afficher 3 de plus**. Un tour qui n’a démarré qu’un seul sous-agent l’affiche sous forme d’une carte d’une ligne avec son type (« Sous-agent Claude Code · Explore · Sonnet 5.5 »). Pour en arrêter un, survolez sa ligne (ou atteignez-la avec Tab) et **Arrêter** s’affiche à la place de sa durée (sur un écran tactile, un petit bouton d’arrêt est toujours présent) : un sous-agent Hydor s’arrête immédiatement, un sous-agent Claude Code demande d’abord confirmation (« Arrêter ce sous-agent ? »), et un sous-agent Codex ne peut pas être arrêté individuellement depuis ici. Le menu **⋯** de la carte propose **Arrêter 5 sous-agents** (avec le nombre de ceux qui peuvent l’être), qui les arrête tous sans demander.
- **Dans la barre latérale** : les sous-agents se placent sous leur parent, repliés sur une seule ligne telle que « 3 sous-agents · 1 a besoin de vous · 2 en cours », ou « 5 sous-agents · 1 en cours » quand certains sont ceux d’un programme. Cliquez sur la ligne pour les déplier (la ligne d’un sous-agent de programme n’a pas de menu ⋯) ; elle reste ouverte tant que vous êtes dans l’un d’eux. Sur un téléphone, où la barre latérale est un tiroir, toucher la ligne la déplie sans fermer le tiroir.
- **Dans le sous-agent** : une barre au-dessus de la zone de message indique « Sous-agent de » et le titre du parent (« ses réponses y retournent »), avec **Ouvrir le parent**. La page d’un sous-agent Claude Code ou Codex est en lecture seule : elle montre la tâche qui lui a été confiée, ses étapes et sa réponse, en direct pendant qu’il travaille, avec une barre qui indique « Sous-agent Claude Code de » et le titre du parent à la place de la zone de message, avec **Ouvrir le parent**, et sans **Reprendre** ni menu de session. Pendant qu’un sous-agent Claude Code travaille, **Arrêter** dans son en-tête l’arrête, après confirmation. Lui envoyer un message, le reprendre, le dupliquer, le transmettre ou le supprimer est refusé : son programme l’exécute à l’intérieur de la session du parent, donc parlez au parent.

Un sous-agent Hydor qui a besoin de votre approbation ou d’une réponse vous attend comme n’importe quelle session, et s’affiche dans la Boîte de réception ([Boîte de réception et notifications](/guide/inbox)).

### Ce que les sous-agents Hydor peuvent et ne peuvent pas faire

- **Un seul niveau.** Un sous-agent Hydor ne peut pas démarrer de sous-agents Hydor à lui : il fait la partie lui-même et indique ce qu’il faut d’autre.
- **Jamais plus d’autorisations.** Un sous-agent Hydor n’obtient jamais d’autorisations plus larges que la session qui l’a démarré. Quand il exécute un autre agent parmi Claude Code, Codex et Custom, il obtient les autorisations les plus larges de cet agent qui ne dépassent pas celles du parent ; les autres agents (Gemini CLI et similaires) démarrent avec leur propre réglage par défaut.
- **Une part du plafond.** Si le parent a un plafond de dépenses, chaque nouveau sous-agent Hydor reçoit une part de ce qui en reste, et le plafond du parent les couvre tous ([Plafonds pour les sous-agents](/guide/research#caps-for-subagents)).
- **Le même compte.** Un sous-agent Hydor qui exécute le même agent que son parent (Claude Code ou Codex) utilise le compte du parent.
- **Quelques-uns à la fois.** Seul un certain nombre de sous-agents Hydor d’une même session travaillent en même temps ; l’agent attend qu’un sous-agent ait fini avant d’en démarrer un autre.

### Régler combien travaillent en même temps

Dans [Paramètres → Capacités → Sous-agents](/settings?s=children), réglez **En cours en même temps, par session** avec − et + (dans le groupe **Sous-agents** ; son (i) liste les limites qui s’appliquent aux sous-agents Hydor) ([y aller](/settings?s=children&find=Working%20at%20once%2C%20per%20session)) : de 1 à 12, 4 au départ. Chaque session compte ses sous-agents Hydor séparément, et non pour toute l’app. Une recherche approfondie utilise à la place ses propres **Chercheurs à la fois**, et un essaim sa **Taille de l’essaim**.

## Lancer un essaim sur un problème difficile

Un essaim met une équipe d’agents sur un même problème. Un agent principal le découpe en angles d’attaque réellement différents (méthodes, hypothèses ou façons de l’aborder différentes) et démarre un membre pour chacun. Les membres publient ce qu’ils essaient et ce qu’ils trouvent sur un tableau de bord partagé, lisent les publications des autres et s’écrivent entre eux. L’agent principal pilote le travail, démarre d’autres membres à mesure que certains terminent, et fait vérifier la réponse avant de vous la donner.

Il est conçu pour les problèmes difficiles qui offrent de nombreuses pistes : une démonstration, un bug tenace, une question dont personne ne voit clairement comment l’aborder. Il coûte plusieurs fois ce que coûte un seul agent.

### Démarrer un essaim

1. Sur la page de démarrage, ouvrez **Options** et choisissez **Essaim**.
2. Choisissez **Essaim** (« Jusqu’à 5 agents à la fois, chacun sous son propre angle » ; ce nombre est la taille de votre essaim).
3. Saisissez la tâche et appuyez sur **Début**.

La ligne Essaim indique « Activé · 5 à la fois », et la pastille Options le mentionne. **Taille de l’essaim**, en bas de ce menu, vous mène à son réglage. Comme pour une recherche approfondie, le mode n’est pas conservé pour votre prochaine session, et un seul des deux peut être activé. Un plafond de dépenses défini dans ce même menu Options couvre l’agent principal et chaque membre. L’éditeur d’une tâche planifiée propose le même réglage **Essaim**, pour lancer un essaim à chaque exécution.

La première fois que vous choisissez **Essaim** (ou **Campagne**), une boîte de dialogue intitulée « Avant d’utiliser l’essaim » explique ce qu’il fait, dans quels cas il vaut la peine, dans quels cas il n’en vaut pas la peine et ce qu’il coûte. Appuyez sur **Utiliser l’essaim** pour continuer, ou sur **Annuler** pour le laisser désactivé. Elle ne s’affiche qu’une fois pour chaque mode, pour vous, sur tous vos appareils, que les astuces soient activées ou non ; demander à un agent de réafficher les astuces la fait aussi revenir.

Vous pouvez aussi activer ou désactiver un essaim, ou le changer en campagne, au sein d’une session : ouvrez son menu (⋯) → **Paramètres de la session** → **Essaim** (son indication affiche **Désactivé**, **Activé** ou **Campagne**) et choisissez **Désactivé**, **Essaim** ou **Campagne**. Le changement prend effet à partir de votre prochain message : l’agent de la session (Claude Code ou Codex) redémarre avec les nouvelles instructions et les nouveaux outils avant ce message, et la conversation se poursuit. Activer un essaim désactive une recherche approfondie, et inversement. Cette entrée n’existe pas pour une session confidentielle, ni pour une session démarrée par une autre session (un membre, un chercheur, un sous-agent). La pastille de la zone de message à côté du **+** (ses **Options**) propose la même ligne **Essaim**, sous **Autorisations**.

### Comment fonctionne un essaim

1. L’agent principal détermine ce que demande la tâche et à quoi ressemble une réponse vérifiée, puis choisit jusqu’à la taille de votre essaim en angles différents (pour une démonstration : un argument direct, la contradiction, la récurrence, les petits cas et une recherche par ordinateur, les résultats connus).
2. Il démarre un membre par angle. Chaque membre est un sous-agent Hydor muni d’une consigne : le problème entier, son angle, ce qui compte comme terminé et comment le vérifier, avec pour titre son angle. Les membres utilisent le modèle et l’effort de l’agent principal, sauf si celui-ci en choisit d’autres.
3. Les membres publient sur le tableau de bord au fil de leur travail : **Progression** (ce qu’ils ont essayé et où ils en sont), **Résultat** (un résultat que les autres peuvent utiliser tout de suite), **Question** (quelque chose dont ils ont besoin d’une réponse) et **Note**. Ils lisent le tableau toutes les quelques étapes, s’appuient sur les résultats des autres, évitent ce que quelqu’un a écarté et répondent aux questions qui leur sont posées.
4. L’agent principal prend connaissance du tableau par lots : un résultat, une question ou un message qui lui est destiné lui parvient en environ une minute ; la progression seule, toutes les quelques minutes. Il transmet les résultats utiles, réoriente vers un nouvel angle un membre bloqué ou qui répète un autre, demande à un membre de vérifier le résultat d’un autre, et démarre des membres pour des idées que personne n’a essayées à mesure que d’autres terminent.
5. Avant de conclure, l’agent principal fait vérifier la réponse de façon indépendante : par un autre membre, par un calcul, ou par sa propre vérification minutieuse.
6. Quand le problème est résolu ou que les angles sont épuisés, il arrête les membres encore au travail et vous donne la réponse : le résultat, comment il a été trouvé et vérifié, et quels angles ont échoué et pourquoi.

Un membre qui termine son angle envoie son rapport à l’agent principal. Un message destiné à un membre qui ne travaille pas le réveille.

**Un essaim avec un objectif** : une session qui dirige un essaim peut avoir un objectif que l’app vérifie. Chaque tour est alors le travail de tout l’essaim, et c’est l’app, et non l’agent principal, qui décide quand c’est terminé. Voir [Un objectif pour un essaim](/guide/goals#a-goal-for-a-swarm).

### Suivre l’essaim : la barre et le tableau de bord

La session de l’agent principal affiche une barre au-dessus de la zone de message : **Essaim** · « choix des angles » au début, puis quelque chose comme « 3 au travail · 2 terminés · 14 publications », et **Tableau de bord**. La session de chaque membre a aussi une barre : « Dans l’essaim de » suivi du titre de l’agent principal (« ses publications et son rapport vont là »), avec **Tableau de bord** et **Responsable**. Dans la barre latérale, les membres figurent sous l’agent principal, regroupés sur une ligne comme « 5 membres de l’essaim · 3 au travail ».

**Tableau de bord** ouvre le tableau de bord de l’essaim (depuis le bas de l’écran sur un téléphone) :

- **Membres** : combien travaillent et combien peuvent travailler en même temps, puis chaque membre avec ce qu’il fait en ce moment, ou « Tour terminé », « Arrêté » ou « Arrêté avec une erreur ». Cliquez sur un membre pour ouvrir sa session ; **Ouvrir l’agent principal** mène à l’agent principal. Tant que l’agent principal n’a pas choisi ses angles, la liste indique qu’aucun n’a encore démarré.
- **Publications** : tout ce qui a été publié, les plus récentes en premier. Chaque publication indique qui l’a écrite (Responsable, ou le titre du membre), à qui elle était destinée lorsqu’elle allait à un seul membre ou à l’agent principal, son type (Progression, Résultat, Question, Note) et il y a combien de temps. Basculez entre **Tout**, **Résultats** et **Questions**. Les nouvelles publications apparaissent au fur et à mesure.

### Arrêter les membres

**Tout arrêter** sur le tableau de bord (présent tant que des membres travaillent) arrête tous les membres encore au travail. Les membres arrêtés conservent ce qu’ils ont fait, et les nouvelles publications ne les réveillent plus. L’agent principal est informé que vous les avez arrêtés, et il peut encore donner du travail supplémentaire à l’un d’eux. L’agent principal arrête lui-même les membres une fois le problème résolu.

### Régler la taille de l’essaim

Dans [Paramètres → Capacités → Sous-agents](/settings?s=children), **Taille de l’essaim** (dans le groupe **Essaim** ; [y aller](/settings?s=children&find=Swarm%20size)) définit combien de membres d’un même essaim ou d’une même campagne travaillent en même temps : de 1 à 16, 5 au départ. Chaque membre coûte à peu près ce que coûte un agent ; l’agent principal en démarre d’autres à mesure que certains terminent.

## Réaliser un grand changement avec une campagne

Une campagne est l’autre type d’essaim, conçue pour un grand changement dans une base de code plutôt que pour un problème difficile : une migration, une mise à niveau de framework, un renommage partout. Choisissez-la au même endroit, **Options** → **Essaim** → **Campagne** (« Un grand changement en plusieurs parties, chacune dans un worktree »), dans un dossier qui est un dépôt Git. La ligne Essaim indique alors « Campagne · 5 à la fois ». Dans une session déjà en cours, son menu (⋯) → **Paramètres de la session** → **Essaim** → **Campagne** fait la même chose à partir de votre prochain message.

L’agent principal découpe le changement en parties (paquets, modules, dossiers) et les publie comme son plan. Un membre réalise chaque partie sur une branche à elle dans un nouveau worktree, au plus la taille de votre essaim à la fois, exécute ses vérifications et publie la partie comme terminée ou échouée ; une partie échouée a droit à un nouvel essai. L’agent principal fusionne les parties terminées une par une, en exécutant les vérifications après chacune (ou ouvre une pull request pour chacune, si vous l’avez demandé), puis rend compte de ce qui a changé et de ce qui a échoué. Sa barre indique « Campagne · 12 parties sur 40 terminées · 2 échouées », et son tableau de bord montre les parties et l’état de chacune à côté des publications. Voir [Campagnes : un grand changement en plusieurs parties](/guide/engineering#campaigns-a-big-change-in-many-parts).

## Obtenir un second avis sur un tour

Un second avis fait vérifier par le modèle d’une autre société ce qu’un agent a fait pendant un tour par rapport à ce que vous avez demandé : les fichiers qu’il a modifiés, les commandes qu’il a exécutées et sa réponse. Le relecteur cherche ce qui manque (demandé mais non fait, ou annoncé mais non fait), ce qui est faux (bugs, faits ou chiffres erronés, demande mal comprise), ce qui est risqué (modifications susceptibles de casser quelque chose, de perdre des données ou de divulguer des secrets) et ce qui est en trop (modifications que personne n’a demandées et qui gênent). Il traite la réponse de l’agent comme des affirmations à vérifier, non comme des preuves.

### En demander un

1. Ouvrez le menu de la session (⋯) et choisissez **Second avis**.
2. Sous **Qui vérifie**, choisissez le relecteur. Celui qui est suggéré vient en premier.
3. Sous **Quel tour**, choisissez le tour à vérifier. Le dernier tour terminé est présélectionné ; jusqu’à 12 tours récents sont listés, chacun avec sa date et le nombre de fichiers qu’il a modifiés.
4. Appuyez sur **Demander** (le bouton mentionne le relecteur : **Demander à Codex**, par exemple).

Une carte s’affiche aussitôt sous ce tour et se remplit quand le relecteur répond, généralement en une ou deux minutes. Un tour encore en cours ne peut pas être vérifié avant sa fin. Sur un téléphone, la boîte de dialogue s’ouvre depuis le bas de l’écran.

### Qui peut vérifier le travail

Uniquement un modèle d’une société différente de celle dont le modèle a fait le travail, afin que personne ne vérifie son propre travail :

- Une session **Claude Code**, ou toute session exécutant un modèle Anthropic, peut être vérifiée par **Codex** (via le programme Codex) ou par l’un des modèles de Custom qui n’est pas d’Anthropic.
- Une session **Codex**, ou toute session exécutant un modèle OpenAI, peut être vérifiée par **Claude** (Sonnet, via Claude Code) ou par l’un des modèles de Custom qui n’est pas d’OpenAI.
- Toute autre session (Custom ou un autre agent avec le modèle d’un autre éditeur) peut être vérifiée par Claude, Codex, ou l’un des modèles de Custom d’un éditeur différent de celui du modèle de la session.

Claude et Codex ne sont proposés que lorsque vous y êtes connecté (de même que les modèles de leurs forfaits). Sans l’autre programme, le relecteur suggéré est l’un de vos modèles Custom d’un autre éditeur : un modèle que désigne le niveau **Meilleur**, **Max** ou **Standard** de Custom, lorsqu’il y en a un. S’il n’y a pas non plus de modèle d’un autre éditeur, ajoutez-en un dans [Paramètres → Modèles](/settings?s=models).

Les modèles de Custom sont ceux que vous avez ajoutés dans [Paramètres → Modèles](/settings?s=models). Le relecteur ne fait que lire : Claude et Codex peuvent ouvrir des fichiers du dossier de la session pour vérifier un point précis, mais ils ne modifient rien. Outre le tour lui-même, le relecteur voit votre premier message dans la session et votre message précédant ce tour, pour le contexte. Quand les modifications sont trop volumineuses pour être montrées en entier, une partie est omise, et la carte l’indique.

### Ce que montre la carte

Le titre de la carte affiche **Second avis** et le nom du relecteur, puis :

- Pendant son travail : « Vérification du travail » et le temps écoulé, avec une ligne indiquant ce que le relecteur est en train de lire.
- Une fois terminé : les résultats par gravité (« 1 critique · 2 importants »), **Semble correct** (avec le nombre de points mineurs, le cas échéant), ou **Pas de verdict clair** quand la réponse n’a pas pu être lue comme une liste de résultats.
- En cas d’échec : **Aucune réponse**, avec la raison (le programme du relecteur n’est pas installé ici, il n’a donné aucune réponse en 8 minutes, ou l’app a redémarré entre-temps) et **Réessayer**.

Cliquez sur le titre pour ouvrir ou replier la carte. À l’intérieur se trouvent le résumé du relecteur et ses résultats, les plus graves en premier. Chaque résultat comporte :

- sa gravité : **Critique** (faux, cassé ou dangereux en l’état), **Important** (à corriger avant de se fier au travail) ou **Mineur** (mérite un coup d’œil, peut être laissé tel quel) ;
- un titre court, ainsi que le fichier et la ligne concernés (cliquez dessus pour ouvrir le fichier à cet endroit) ;
- ce qui ne va pas, pourquoi c’est important et comment le corriger.

Quand il y a des résultats plus graves, les mineurs se replient sous **Afficher N mineurs** (**Masquer les points mineurs** les replie de nouveau). La croix × ferme la carte.

### Envoyer ses points à l’agent

- Le bouton d’envoi à côté d’un résultat (un avion en papier : **Envoyer à l’agent**) le place dans la zone de message, prêt à être envoyé ou modifié.
- **Tout envoyer à l’agent** place d’un coup tous les résultats affichés dans la zone de message.
- Pendant que l’agent travaille, **Tout mettre en file** (ou **Mettre en file**) les ajoute à la file d’attente de la session, pour qu’ils soient transmis à l’agent à la fin de son tour.

Le message nomme le relecteur, liste chaque point avec sa gravité et son fichier, et demande à l’agent de vérifier chacun d’eux par rapport à son travail, de corriger ce qui tient la route et d’indiquer ce qu’il laisse et pourquoi.

## Comparer des modèles dans l’arène

L’arène des modèles envoie la même demande à deux ou trois modèles à la fois, pour que vous puissiez comparer leurs réponses côte à côte et garder la meilleure. Un Claude Code ou un Codex auquel vous n’êtes pas connecté n’est pas proposé. Chaque réponse que vous gardez compte pour une note qui montre quels modèles gagnent sur vos propres tâches.

### Démarrer un match

1. Sur la page de démarrage, choisissez l’agent et le modèle comme d’habitude : c’est le premier modèle du match.
2. Ouvrez **Options** → **Arène** et choisissez **Comparer des modèles** (« La même demande à d’autres modèles, côte à côte »).
3. Sous « En plus du modèle choisi, interroger aussi (jusqu’à 2) », cochez un ou deux modèles supplémentaires. La liste propose quelques modèles de Claude Code, de Codex et de Custom, ainsi que des autres agents que vous avez ajoutés ; quand elle est longue, un champ **Trouver un modèle** permet de la filtrer.
4. Saisissez la demande et appuyez sur **Début**.

La ligne Arène indique « +1 modèle » ou « +2 modèles », et la pastille Options la mentionne. Ce navigateur se souvient de vos derniers choix, mais l’arène n’est pas conservée pour votre prochaine session.

La première fois que vous choisissez **Comparer des modèles**, une boîte de dialogue intitulée « Avant d’utiliser l’Arène » explique ce qu’elle fait, dans quels cas elle vaut le coup, dans quels cas elle ne le vaut pas et ce qu’elle coûte ; appuyez sur **Utiliser l’Arène** pour continuer, ou sur **Annuler**. Elle ne s’affiche qu’une seule fois pour vous, sur tous vos appareils, que les astuces soient activées ou non. Contrairement à une recherche approfondie ou à un essaim, l’arène se choisit uniquement depuis la page de démarrage : elle envoie votre premier message aux autres modèles, on ne peut donc pas l’ajouter à une session déjà en cours.

Chaque modèle travaille dans sa propre session, avec la même demande, les mêmes pièces jointes, le même dossier et les mêmes paramètres de session (agent, mémoire, plafond de dépenses), ainsi que l’effort et les autorisations habituels de son agent. Dans un dépôt Git, activez **Nouveau worktree** dans le menu du dossier pour que chaque modèle ait sa propre copie du code, au lieu de modifier tous le même dossier. Si un modèle ne peut pas démarrer, l’app le signale et le match continue sans lui.

### Comparer les réponses et garder la meilleure

Chaque session d’un match a une barre au-dessus de la zone de message : **Arène** · « la même demande est partie vers d’autres modèles », avec **Comparer les réponses**. Elle ouvre la page de comparaison : la demande en haut, puis une colonne par modèle avec sa dernière réponse, qui se complète au fur et à mesure. Les colonnes sont côte à côte sur un grand écran et les unes sous les autres sur un téléphone.

- **Garder celle-ci** (une fois que ce modèle a répondu) garde sa réponse. Sa session remporte le match, et les autres sessions sont archivées : elles disparaissent de votre liste de sessions, mais restent disponibles pour être ouvertes. Les colonnes indiquent alors **Gardée** et **Archivée**.
- **Ouvrir** ouvre la session d’un modèle. Sur celui qui est gardé, le bouton indique **Continuer ici**, pour poursuivre la conversation avec le gagnant.
- **Quels modèles gagnent** (**Tableau de bord** sur un téléphone) ouvre Utilisation → Arène.

### Voir quels modèles gagnent

[Utilisation → Arène](/arena) (dans la zone de recherche, Ctrl+K, elle s’appelle « Arène des modèles ») affiche **Quels modèles gagnent sur vos tâches** : chaque modèle avec sa **Note**, le nombre de fois où il a été **Gardée** sur les matchs disputés, et son **Taux de victoire** (non affiché sur un téléphone). La note est une note Elo, du type de celle qui sert à classer les joueurs d’échecs, qui part de 1000 : dans chaque match que vous avez tranché, la réponse que vous avez gardée l’emporte sur chacune des autres.

En dessous, **Matchs** liste vos derniers matchs (jusqu’à 100) : la demande, les modèles et la date, avec le gagnant indiqué, ou **Ouvrir** pour un match que vous n’avez pas tranché. Cliquez sur l’un d’eux pour comparer ses réponses.

## Fixer un plafond de dépenses pour une session

Un plafond de dépenses est le maximum qu’une session peut dépenser, aux tarifs de l’API : ce que coûteraient ses jetons via l’API, quel que soit l’abonnement que vous payez réellement. Quand elle l’atteint, l’agent s’arrête jusqu’à ce que vous releviez le plafond. C’est un bon complément à tout ce qui fait travailler beaucoup d’agents : une recherche approfondie, un essaim, des sous-agents, un match d’arène.

### Ce qui compte

- Les appels de la session à ses propres modèles, y compris les sous-agents de son agent (les sous-agents Claude Code, par exemple).
- Les sous-agents Hydor qu’elle a démarrés : son plafond les couvre aussi.
- Les modèles sur cet ordinateur (via Ollama ou vLLM) ne coûtent rien.
- Les jetons dont le prix est inconnu ne peuvent pas être comptés. La boîte de dialogue du plafond l’indique lorsque la session a pu dépenser davantage pour cette raison.

Consultez [Utilisation, limites et coûts](/guide/usage) pour savoir ce que coûtent les sessions au total.

### Fixer un plafond au démarrage

Sur la page de démarrage, ouvrez **Options** → **Plafond de dépenses**. Saisissez un montant en dollars et appuyez sur **Fixer** (ou sur Entrée), ou choisissez 1,00 $, 5,00 $, 10,00 $ ou 25,00 $. **Aucun plafond** le supprime. La pastille Options indique alors le plafond (« plafond de 5,00 $ »).

Contrairement à une recherche approfondie, à un essaim ou à l’arène, le plafond que vous choisissez est conservé : vos prochaines sessions démarrent avec lui, sur tous vos appareils, jusqu’à ce que vous le changiez.

### Fixer ou modifier le plafond d’une session

Ouvrez le menu de la session (⋯) → **Paramètres de la session** → **Plafond de dépenses** (le plafond actuel s’affiche à côté). La boîte de dialogue indique **Dépensé jusqu’ici**, réparti entre cette session et ses sous-agents Hydor s’il y en a (« Cette session 1,20 $, ses sous-agents Hydor 0,80 $ » ; la boîte de dialogue ajoute « Les sous-agents qu’elle démarre comptent aussi. »), et, pour un sous-agent Hydor, la part déjà dépensée du plafond de son parent. Saisissez un montant dans **Plafond** ou choisissez 1,00 $, 5,00 $, 10,00 $ ou 25,00 $, puis appuyez sur **Fixer le plafond** (ou **Variation**). **Retirer le plafond** le supprime.

Un plafond peut aller de 0,01 $ à 100 000 $. S’il n’est pas supérieur à ce que la session a déjà dépensé, la boîte de dialogue prévient que la session reste arrêtée. Sur un téléphone, la boîte de dialogue s’ouvre depuis le bas de l’écran.

### La barre au-dessus de la zone de message

Tant qu’une session a un plafond, une barre au-dessus de sa zone de message indique ce qu’elle en a dépensé (« 1,20 $ sur 5,00 $ ») avec une ligne qui se remplit : orange à partir de 80 %, rouge au plafond, où elle indique **Plafond atteint**. Quand des sous-agents Hydor en ont dépensé une partie, elle ajoute « avec les sous-agents » (sur un écran plus large) ; pointez les montants pour voir la répartition. **Variation** (ou **Relever**, une fois le plafond atteint) ouvre la boîte de dialogue du plafond.

### Ce qui se passe au plafond

Le plafond est vérifié après chaque appel au modèle : un tour s’arrête donc juste après l’appel qui l’atteint (le total peut finir un peu au-dessus du plafond) :

- L’agent s’arrête, et une note sous le tour indique « Arrêté au plafond de dépenses » avec ce qui a été dépensé du plafond, et **Relever le plafond…**. Une notification nomme la session qui s’est arrêtée.
- Ses sous-agents Hydor en cours d’exécution s’arrêtent aussi. Leur note indique que la session qui les a démarrés a atteint son plafond de dépenses, avec **L’ouvrir** pour y aller.
- Les nouveaux messages attendent. Un message que vous envoyez n’est pas envoyé : une notification indique que le plafond est atteint, et votre texte revient dans la zone de message. Les messages de la file d’attente sont retenus (« La file d’attente est suspendue ») jusqu’à ce que vous releviez ou retiriez le plafond.

### Relever ou retirer le plafond

Cliquez sur **Relever** dans la barre ou sur **Relever le plafond…** dans la note (ou utilisez le menu de la session), puis fixez un plafond supérieur à ce que la session a dépensé, ou retirez-le. Les messages retenus dans sa file d’attente partent alors. Un sous-agent Hydor arrêté par le plafond de son parent accepte de nouveau des messages une fois le plafond du parent relevé.

### Plafonds des sous-agents

Chaque nouveau sous-agent Hydor reçoit son propre plafond : une part égale de ce qu’il reste du plafond du parent, répartie entre le parent et tous les sous-agents Hydor qui peuvent travailler en même temps. Le plafond du parent les couvre toujours tous : quand il est atteint, tous s’arrêtent. Quand il n’en reste plus rien, l’agent ne peut plus démarrer de sous-agents Hydor et il lui est demandé de terminer avec ce qu’il a.

### Plafonds des tâches planifiées et des apps

- **Tâches planifiées** : l’éditeur d’une tâche ([Paramètres → Tâches planifiées](/settings?s=tasks), **Nouvelle tâche**, ou le menu d’une tâche → **Modifier**) contient le **Plafond de dépenses** de la page de démarrage dans sa rangée de paramètres, et **S’arrête au-delà de $** sous **Chaque exécution** fixe le même plafond ; laissez le champ vide pour ne pas avoir de plafond. La session de chaque exécution s’arrête à ce plafond. Il s’applique aux exécutions qui démarrent une nouvelle session ; une exécution qui publie dans une session existante respecte le plafond propre à cette session. Une tâche qu’un agent configure pour vous à partir d’une conversation démarre chaque exécution avec les paramètres de cette conversation, plafond compris. Consultez [Tâches planifiées](/guide/tasks).
- **Apps** : les **Limites** d’une app comprennent **Dépense maximale d’une exécution (US$)**. Consultez [Apps](/guide/apps).

## Demander à un agent

- « Lance une recherche approfondie sur les pompes à chaleur pour une maison des années 1930, avec 6 chercheurs à la fois, un rapport Word et un plafond de 10 $. »
- « Où en est la recherche approfondie dans ma session “Bornes de recharge comparées” ? »
- « Dans ma session “Bornes de recharge comparées”, active la recherche approfondie avec 6 chercheurs et un rapport Word, à partir de mon prochain message. »
- « Passe ma session “Tests instables” en essaim, puis remets un seul agent quand je te le dirai. »
- « Mets un plafond de dépenses de 5 $ sur cette session, et dis-moi ce qu’elle a dépensé jusqu’ici. »
- « Autorise jusqu’à 6 sous-agents à travailler en même temps par session, et fixe les essaims à 8 agents. »
- « Parmi ces sous-agents, lesquels Hydor a-t-il démarrés, et lesquels Claude Code ? »
- « Demande un deuxième avis sur le dernier tour de ma session “Refonte de la facturation”, et dis-moi ce qu’il a trouvé. »
- « Quels modèles gagnent dans mon arène ? Dans le dernier match, garde la réponse de Claude Code. »
