# Jobs

La page Jobs réunit au même endroit les travaux de longue durée que vos sessions exécutent en arrière-plan, classés par étiquettes qui indiquent de quel ensemble chacun fait partie : compilations, entraînements, indexations, téléchargements et sous-agents. Pour chacun, vous voyez depuis combien de temps il tourne, où il en est et combien de temps il lui reste environ, ce qui attend de démarrer et pourquoi, et comment les traitements finis se sont terminés. Vous pouvez y lire la sortie d’un traitement et l’arrêter, et vous pouvez demander à un agent d’exécuter les choses l’une après l’autre.

![La page Jobs : quatre cases qui la résument, une pastille par étiquette, et les traitements en activité regroupés par étiquette avec leur avancement et le temps restant](images/jobs.webp)

## Ce que montre la page Jobs

Cliquez sur **Jobs** dans la barre d’icônes, ou allez dans [Jobs](/jobs). Sur un téléphone, la page se trouve parmi les outils en bas du tiroir. Un nombre sur son icône indique combien de traitements sont en cours.

Un traitement peut être :

- une tâche d’arrière-plan de l’une de vos sessions : une commande, un moniteur (la surveillance d’un journal ou d’un programme) ou un sous-agent du programme de l’agent lui-même, par exemple celui de Claude Code. Les sessions que vous exécutez en dehors d’Hydor, dans VS Code ou un terminal, affichent aussi les leurs ;
- un travail qu’un agent a lancé sous forme de traitement (voir [Comment les agents ajoutent du travail ici](#how-agents-put-work-here)) ;
- une exécution des [Expériences](/guide/experiments) en cours ou en attente dans sa file ;
- un sous-agent Hydor, c’est-à-dire une session qu’une autre session a démarrée pour une partie de son travail, tant qu’il travaille (voir [Sous-agents](/guide/sessions#subagents)).

Quatre cases en haut résument la situation :

- **En cours d’exécution** et **En file d’attente** : combien de traitements tournent et combien attendent ;
- **Tout est terminé** : quand l’ensemble de ce travail devrait être fini, par exemple « dans environ 2 h 10 min ». La case affiche un tiret tant que chaque traitement n’a pas une estimation encore à venir, sans compter les sous-agents, qui n’en ont jamais ;
- **Terminés aujourd’hui** : combien se sont terminés aujourd’hui. À côté, « 1 en échec » (ou le nombre en question) vous y conduit.

Sous les cases se trouvent une pastille pour chaque [étiquette](#tags), le menu des projets (**Tous les projets**, voir [Voir les traitements d’un projet](#see-one-projects-jobs)) et le champ **Filtrer les traitements**. Saisissez du texte dans ce champ pour ne voir que les traitements dont le nom, la commande, la session, le projet ou les étiquettes contiennent ces mots ; **Afficher tous les traitements** fait tout réapparaître quand rien ne correspond. En dessous viennent **En activité**, **Serveurs** et **Terminés**, chacune présente quand elle a quelque chose à montrer. Les cases ne comptent que ce que l’étiquette, le projet et le filtre laissent affiché. Les serveurs en marche ne sont comptés ni dans les cases ni dans le nombre de la barre d’icônes. La page se met à jour toute seule.

Quand rien ne tourne ni n’attend, vous lisez « Rien ne tourne en arrière-plan pour le moment. »

## En activité

**En activité** regroupe les traitements en cours et ceux qui attendent, dans une carte par étiquette ; les traitements sans étiquette sont dans la dernière, **Sans étiquette**. Le haut d’une carte montre l’étiquette, combien de ses traitements tournent et attendent (par exemple « 3 en cours · 1 en attente ») et, quand chacun d’eux a une estimation, quand ils devraient être finis (« terminé dans environ 34 min »). Quand tout le travail d’une carte vient d’une seule session, cette session et son projet y sont aussi indiqués, et les lignes ne les répètent pas. Cliquez sur le haut d’une carte pour la replier ou la rouvrir ; l’application s’en souvient dans ce navigateur. Pendant que vous filtrez ou qu’une étiquette est choisie, rien n’est replié. Tant qu’aucun traitement n’a d’étiquette, ils sont simplement listés, sans cartes par étiquette.

Chaque traitement occupe une ligne. Son icône indique de quel type il est (survolez-la pour lire **Commande**, **Surveillance**, **Sous-agent Claude Code**, **Sous-agent Hydor**, **Exécution d’expérience** ou **Traitement**), et le point sur l’icône indique son état. À côté du nom figurent les éventuelles autres étiquettes ; survolez le nom pour voir sa commande. En dessous se trouvent sa situation, la session qui l’a démarré et son [projet](#see-one-projects-jobs) (chacun étant un lien), puis la dernière chose qu’il a affichée.

Cliquez sur une ligne pour ouvrir [le panneau du traitement](#a-jobs-panel-and-stop). Son menu **⋯** propose **Détails et sortie**, **Ouvrir la session** (**Ouvrir l’exécution** pour une exécution des Expériences), **Modifier les étiquettes…** et **Arrêter**.

## En cours d’exécution

Un traitement en cours indique depuis combien de temps il tourne (« en cours depuis 12 min 05 s »). Quand le traitement indique où il en est, une barre de progression affiche un pourcentage ; survolez la barre pour voir le décompte propre au traitement, par exemple « étape 120/500 ». Quand il n’y a pas de temps restant à afficher, ce décompte figure sous la barre.

### Temps restant

Quand il existe des éléments pour le calculer, la ligne indique « environ 1 h 12 min restantes ». L’application prend le premier de ces éléments dont elle dispose :

1. le temps restant affiché par le traitement lui-même, comme le font de nombreuses barres de progression ;
2. la vitesse à laquelle il a avancé jusqu’ici ;
3. l’estimation donnée par l’agent au moment de lancer le traitement ;
4. la durée qu’a prise auparavant la même commande dans le même dossier, quand elle s’est bien terminée au cours de la dernière semaine.

Survolez le temps pour voir de quel élément il s’agit ; le panneau du traitement l’indique aussi. La mention **(une supposition)** à côté signifie que l’estimation est approximative : un seul relevé de progression, l’estimation de l’agent ou une exécution antérieure. Quand un traitement a duré plus longtemps que prévu, la ligne indique **estimation dépassée** à la place. Faute d’élément, aucun temps n’est affiché.

## En file d’attente

Un traitement en file d’attente n’a pas encore démarré. Sa ligne dit pourquoi :

- **Attend**, suivi du nom d’autres traitements : il démarre une fois que tous se sont bien terminés. Cliquez sur un nom pour trouver sa ligne. Les traitements que d’autres attendent indiquent **Ensuite :** et ce qui vient après ;
- **Prochain dans la file** et le nom de la file, ou sa place, par exemple « 3e dans la file gpu » : une file exécute un traitement à la fois, dans l’ordre d’arrivée, toutes sessions confondues. Le premier de la file peut encore attendre un autre traitement, et ceux qui le suivent attendent aussi ;
- **En attente d’un GPU libre** ou **En attente d’un emplacement libre** : une exécution des Expériences attend qu’il y ait de la place (voir [Comment la file choisit](/guide/experiments#how-the-queue-chooses)).

Quand les traitements qui le précèdent ont des estimations, la ligne indique aussi quand il devrait démarrer, par exemple « démarre dans environ 40 min ».

**Arrêter** sur un traitement en file d’attente signifie qu’il ne démarrera jamais, pas plus que les traitements qui l’attendent. Si un traitement qu’un autre attend échoue ou est arrêté, celui qui attendait ne démarre jamais non plus.

## Serveurs

Certaines commandes ne se terminent jamais d’elles-mêmes : un serveur de développement, un serveur web ou d’API, un serveur de notebooks ou de modèles qu’une session a laissé tourner en arrière-plan. La page Jobs les reconnaît à leur commande et les liste sous **Serveurs**, avec la durée de fonctionnement de chacun et sans temps restant. Ils tournent jusqu’à ce que vous les arrêtiez, avec **Arrêter** comme pour toute autre commande. Ils ne sont pas comptés parmi les traitements en cours, et la vue **Chronologie** les laisse de côté. Une fois qu’un serveur s’arrête, il passe dans **Terminés**.

## Terminés

**Terminés** conserve ce qui s’est terminé au cours des 7 derniers jours, du plus récent au plus ancien, sous un titre pour chaque jour : **Aujourd’hui**, **Hier**, puis la date. Vous voyez les dix derniers, et **Tout afficher** fait apparaître le reste. Chacun indique comment il s’est terminé, quand, et combien de temps il a pris :

- **Réussi** : il s’est bien terminé ;
- **Échec**, avec son code de sortie quand il y en a un (le nombre par lequel un programme se termine ; toute valeur autre que 0 signifie qu’un problème est survenu) ;
- **Arrêté** : vous ou un agent l’avez arrêté ;
- **Jamais démarré**, avec la raison, par exemple l’échec d’un traitement qu’il attendait ;
- **Terminé** : un travail qui tournait déjà quand il a été ajouté à la page Jobs s’est terminé, et personne n’a vu s’il s’était bien passé.

Quand quelque chose a échoué, passez de **Tout** à **Échec** pour ne voir que ces cas. **Retirer de cette liste**, dans le menu **⋯** d’une ligne, en enlève un, et **Effacer** les enlève tous après confirmation, y compris ceux qu’une étiquette, le menu des projets ou le filtre masque. Cela ne fait que ranger la liste : vos sessions et les exécutions des Expériences restent.

## Étiquettes

Une étiquette indique de quel ensemble un travail fait partie, par exemple `intent-data` ou `search-index`, pour que vous puissiez voir à quoi sert chaque chose en cours et examiner un ensemble à la fois. Un traitement en a jusqu’à 3, en minuscules avec des traits d’union entre les mots : « Intent data » est conservée sous la forme `intent-data`. La première détermine où il est listé.

Vous n’avez rien à étiqueter vous-même :

- les agents étiquettent chaque traitement qu’ils lancent et reprennent une étiquette existante chaque fois que le travail en relève, pour qu’un même ensemble reste sous un seul nom. Indiquez l’étiquette voulue et l’agent l’utilise ;
- un travail sans étiquette propre (les commandes d’arrière-plan d’une session, ses sous-agents et ses exécutions des Expériences, un traitement lancé sans étiquette) prend celle de sa session. Il s’agit de celle que vous avez définie ici pour la session ; sinon, de l’étiquette la plus fréquente parmi ses traitements de la dernière semaine ; sinon, d’une étiquette que le [modèle d’appoint](/settings?s=models&find=Helper%20model) choisit pour la session, en reprenant une étiquette déjà utilisée quand elle convient.

Le modèle d’appoint choisit en arrière-plan, si bien qu’une telle étiquette peut apparaître un instant après le travail. Pour choisir, il lit le titre de la session, son projet et le nom d’une partie de son travail. Il n’est jamais consulté au sujet d’une [session confidentielle](/guide/sessions#keep-a-session-confidential).

### Modifier les étiquettes

Choisissez **Modifier les étiquettes…** dans le menu **⋯** d’un traitement, ou cliquez sur le crayon à côté des étiquettes dans son panneau. Saisissez les étiquettes en les séparant par des virgules, ou cliquez sur celles proposées sous **Étiquettes utilisées**, puis sur **Enregistrer**.

Pour un travail qu’un agent a lancé sous forme de traitement, il s’agit des étiquettes de ce traitement. Pour les autres travaux, ce sont celles de leur session : tout le travail de cette session sans étiquette propre les prend donc. Enregistrez un champ vide pour retirer ce que vous avez défini : l’étiquette est alors de nouveau choisie pour vous, comme ci-dessus. Un travail qui n’appartient à aucune session ne peut pas être étiqueté, sauf s’il s’agit d’un traitement.

### Afficher une seule étiquette

Cliquez sur la pastille d’une étiquette pour ne voir que le travail listé sous elle : les cases, **En activité**, **Serveurs**, **Terminés** et la chronologie suivent toutes. Le nombre sur une pastille indique combien de ses traitements tournent ou attendent. Cliquez sur **Tout** pour tout revoir ; la pastille **Sans étiquette** montre [le travail sans étiquette](/jobs?untagged=1).

L’étiquette choisie fait partie de l’adresse de la page (qui se termine par `?tag=` suivi du nom de l’étiquette) : vous pouvez donc l’ajouter à vos favoris ou l’envoyer sur votre téléphone. Une pastille se fonde sur la première étiquette de chaque traitement ; pour trouver un traitement par une autre de ses étiquettes, saisissez celle-ci dans **Filtrer les traitements**.

## Voir les traitements d’un projet

Le menu des projets se trouve à côté de **Filtrer les traitements**. Il affiche **Tous les projets**, ou le nom du projet choisi, avec sa marque. Ouvrez-le pour choisir :

- **Tous les projets** : tous les traitements ;
- un projet qui a des traitements ici ; le nombre à côté indique combien d’entre eux tournent ou attendent ;
- **Aucun projet** : les traitements qui n’appartiennent à aucun.

Les cases, **En activité**, **Serveurs**, **Terminés** et la chronologie ne montrent alors que ces traitements. Choisir un projet vous ramène à la pastille **Tout**, et les pastilles et leurs nombres ne portent que sur ses traitements ; cliquez sur l’une d’elles pour voir cette étiquette au sein du projet. Tant qu’un seul projet est choisi, les lignes n’indiquent pas son nom. Le menu apparaît dès qu’un traitement appartient à un projet.

Le projet choisi fait lui aussi partie de l’adresse de la page (`?project=` suivi de son identifiant, ou `?project=none`) : vous pouvez donc l’ajouter à vos favoris. Les traitements d’un [groupe](/guide/projects#bring-projects-together-in-a-group) comprennent ceux des projets qu’il réunit. Tant qu’un projet a des traitements en cours ou en attente, ou des serveurs restés en marche, sa propre page les montre sous [Vue d’ensemble](/guide/projects#overview).

Un traitement appartient au projet de sa session. Quand il n’y en a pas (sa session n’est dans aucun projet, ou il n’a pas de session, comme un traitement lancé depuis votre propre terminal ou une exécution lancée sur la page Expériences), il appartient au projet dans le dossier duquel il s’exécute. Quand le dossier d’un projet se trouve dans celui d’un autre, c’est le projet intérieur qui le reçoit. Un groupe, de même qu’un projet dont le dossier est votre dossier personnel ou un disque entier, ne reçoit jamais de traitements de cette façon. Le panneau d’un traitement indique son **Projet**.

## La vue Chronologie

Passez de **Liste** à **Chronologie** en haut à droite ; l’application retient votre choix dans ce navigateur. La chronologie trace, le long des heures, une barre pour chaque traitement en cours ou en attente, avec un point de la couleur de son étiquette devant son nom. Les pastilles d’étiquettes, le menu des projets et **Filtrer les traitements** la restreignent comme la liste :

- **Exécution jusqu’ici** correspond à la partie pleine, et **Estimation** à la partie rayée au-delà ;
- les traitements **En file d’attente** sont en pointillés, à l’endroit où ils devraient démarrer ;
- une barre avec la mention **Aucune estimation** s’estompe ;
- la ligne marquée **Maintenant** représente le présent, et de fines lignes relient un traitement à ceux qui l’attendent.

Un traitement qui dépasse son estimation devient orange. Survolez une barre pour lire son état et ses horaires, et cliquez dessus pour ouvrir le panneau du traitement. Sur un écran étroit, le graphique défile horizontalement et les noms restent en place. Les traitements terminés sont listés en dessous.

## Le panneau d’un traitement et le bouton Arrêter

Le panneau s’ouvre sur le côté droit de la page (sur tout l’écran sur un téléphone). En haut figurent le nom du traitement, son état, ses étiquettes, **Ouvrir la session** (ou **Ouvrir l’exécution**) et **Arrêter**. En dessous se trouve ce que l’on sait de lui : sa session, son projet et son dossier, l’heure de son démarrage, le temps qu’il lui reste et l’origine de cette estimation, ce qu’il attend et comment il s’est terminé. Vient ensuite sa commande, avec un bouton pour la copier.

**Sortie** montre la fin de ce que le traitement a affiché, actualisée toutes les quelques secondes tant qu’il tourne ; les lignes les plus récentes restent visibles, sauf si vous remontez. Pour un sous-agent, cette partie liste ses étapes. Certains traitements, comme les sous-agents Hydor et les tâches d’arrière-plan de Codex, n’ont pas de sortie ici : utilisez **Ouvrir la session**.

**Arrêter** demande d’abord confirmation, puis met fin au traitement : un traitement ou une commande s’arrête, une exécution des Expériences est arrêtée comme depuis sa propre page, et la session d’un sous-agent Hydor est arrêtée. Ce que le traitement a déjà fait est conservé. Les travaux qui s’exécutent dans une session en dehors d’Hydor et les tâches d’arrière-plan de Codex ne peuvent pas être arrêtés d’ici : ils n’ont donc pas de bouton **Arrêter**.

## Comment les agents ajoutent du travail ici

Vous n’avez rien à configurer. Une tâche d’arrière-plan lancée par une session apparaît ici d’elle-même. Chaque session démarrée par l’application dispose aussi d’une commande appelée `job`, et les agents ont pour consigne de l’utiliser pour les travaux longs (tout ce qui dépasse une dizaine de minutes), afin qu’ils apparaissent ici avec un nom, une étiquette, leur avancement et le temps restant (voir [Quatre commandes dont dispose chaque agent](/guide/agents#four-commands-every-agent-has)).

Dites ce que vous voulez avec des mots simples, et l’agent s’occupe du reste :

- **L’un après l’autre** : « lance l’évaluation quand la construction de l’index sera terminée ». Le second traitement attend le premier, et ne démarre jamais si le premier échoue ;
- **Un à la fois** : « mets ces balayages dans une file d’attente ». Les traitements qui portent le même nom de file passent chacun leur tour ;
- **La durée prévue** : un agent peut donner sa propre estimation, utilisée jusqu’à ce que l’avancement du traitement en dise davantage ;
- **L’ensemble dont il fait partie** : « étiquette la construction de l’index avec search-index ». Les agents peuvent aussi lister les étiquettes utilisées et modifier ensuite celles d’un traitement ;
- **Un travail déjà en cours** : « affiche dans Jobs l’entraînement que tu as lancé tout à l’heure ». L’agent l’ajoute sans le redémarrer (`job adopt`) ; cette possibilité n’existe pas sous Windows. Quand il se termine, il indique **Terminé**, car personne ne peut savoir comment cela s’est passé.

Tant qu’un traitement démarré par une session attend ou tourne encore (lancé avec `job`, ou une exécution des Expériences qu’elle a démarrée), cette session n’est pas finie : son point continue de pulser en bleu et son état indique « En cours · 1 en arrière-plan », même après l’arrêt de son agent, et sa notification **Terminées** n’arrive qu’à la fin du traitement. Le bouton « Arrêter » à côté de sa zone de message laisse ces traitements tourner : arrêtez-les ici.

Si l’application est injoignable au moment où un agent lance un traitement, la commande s’exécute quand même ; elle n’apparaît simplement pas ici.

## Demander à un agent

- « Lance l’évaluation sous forme de traitement une fois la construction de l’index terminée. »
- « Ajoute l’étiquette search-index à la construction de l’index. »
- « Qu’est-ce qui tourne encore pour intent-data ? »
- « Qu’est-ce qui tourne dans mon projet Thèse ? »
- « Montre dans Jobs l’entraînement que tu as lancé tout à l’heure. »
- « Exécute ces trois balayages un par un dans une file d’attente. »
- « Qu’est-ce qui tourne encore, et quand est-ce que ce sera fini ? »
- « Arrête le téléchargement et lance plutôt les tests sous forme de traitement. »
- « Pourquoi la dernière construction a-t-elle échoué ? Regarde la sortie de son traitement. »
