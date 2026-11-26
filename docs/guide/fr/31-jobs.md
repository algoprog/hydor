# Jobs

La page Jobs réunit au même endroit les longs traitements que vos sessions exécutent en arrière-plan, triés par des étiquettes qui disent de quel type de travail il s’agit, comme les expériences, la collecte de données ou les builds : entraînements, indexation, téléchargements et sous-agents. Pour chacun, vous voyez depuis combien de temps il tourne, où il en est et combien de temps il lui reste à peu près, ce qui attend de démarrer et ce qu’il attend, et comment les traitements terminés se sont achevés. Vous pouvez lire la sortie d’un traitement et l’arrêter depuis cette page, et vous pouvez demander à un agent d’exécuter une chose après l’autre.

![La page Jobs : quatre tuiles qui résument la situation, une pastille par étiquette, et les traitements en activité regroupés par étiquette avec leur avancement et le temps restant](images/jobs.webp)

## Ce que montre Jobs

Cliquez sur **Jobs** dans la barre d’icônes, ou allez sur [Jobs](/jobs). Sur un téléphone, la page figure parmi les outils en bas du tiroir. Un nombre sur son icône indique combien de traitements sont en cours d’exécution.

Un traitement peut être l’un de ces éléments :

- une tâche en arrière-plan de l’une de vos sessions : une commande, un moniteur (une surveillance d’un journal ou d’un programme) ou un sous-agent du programme propre à l’agent, comme celui de Claude Code. Les sessions que vous exécutez en dehors de Hydor, dans VS Code ou un terminal, montrent aussi les leurs ;
- un travail qu’un agent a lancé comme traitement (voir [Comment les agents placent du travail ici](#how-agents-put-work-here)) ;
- une exécution d’[Expériences](/guide/experiments) en cours ou en attente dans sa file ;
- un sous-agent Hydor, c’est-à-dire une session qu’une autre session a démarrée pour une partie de sa tâche, pendant qu’il travaille (voir [Sous-agents](/guide/sessions#subagents)).

Quatre tuiles en haut résument la situation :

- **En cours d’exécution** et **En file d’attente** : combien de traitements tournent et combien attendent ;
- **Tout est terminé** : le moment où tout ce travail devrait être fini, par exemple « dans environ 2 h 10 min ». Un tiret s’affiche tant que chaque traitement n’a pas une estimation à venir, sans compter les sous-agents, qui n’en ont jamais ;
- **Terminés aujourd’hui** : combien se sont achevés aujourd’hui. À côté, « 1 en échec » (ou le nombre correspondant) vous y conduit.

Sous les tuiles se trouvent une pastille par [étiquette](#tags), le menu des projets (**Tous les projets**, voir [Voir les traitements d’un projet](#see-one-projects-jobs)) et le champ **Filtrer les traitements**. Saisissez des mots dans ce champ pour ne voir que les traitements dont le nom, la commande, la session, le projet ou les étiquettes les contiennent ; **Afficher tous les traitements** ramène tout quand rien ne correspond. Viennent ensuite **En activité**, **Serveurs** et **Terminées**, chacune présente quand elle a quelque chose à montrer. Les tuiles ne comptent que ce que laissent l’étiquette, le projet et le filtre. Les serveurs en cours d’exécution ne sont comptés ni dans les tuiles ni dans le nombre affiché sur la barre d’icônes. La page se met à jour toute seule.

Quand rien ne tourne ni n’attend, vous lisez « Rien ne tourne en arrière-plan pour le moment. »

## En activité

**En activité** regroupe les traitements qui tournent et ceux qui attendent, dans une carte par étiquette ; les traitements sans étiquette se trouvent dans la dernière, **Sans étiquette**. Le haut d’une carte indique l’étiquette, combien de ses traitements tournent et attendent (par exemple « 3 en cours · 1 en file ») et, quand chacun a une estimation, quand ils devraient être terminés (« terminé dans environ 34 min »). Quand tout le travail d’une carte vient d’une seule session, cette session et son projet y sont aussi nommés, et ses lignes ne les répètent pas. Cliquez sur le haut d’une carte pour la replier ou la rouvrir ; l’app s’en souvient dans ce navigateur. Tant que vous filtrez ou qu’une étiquette est choisie, rien n’est replié. Tant qu’aucun traitement n’a d’étiquette, les traitements sont simplement listés, sans cartes par étiquette.

Chaque traitement occupe une ligne. Son icône indique de quel type il s’agit (survolez-la pour lire **Commande**, **Moniteur**, **Sous-agent Claude Code**, **Sous-agent Hydor**, **Exécution d’expérience** ou **Poste**), et le point sur l’icône indique son état. À côté du nom figurent d’éventuelles autres étiquettes ; survolez le nom pour voir sa commande. Dessous apparaissent où il en est, la session qui l’a démarré et son [projet](#see-one-projects-jobs), chacun sous forme de lien, ainsi que la dernière chose qu’il a affichée.

Cliquez sur une ligne pour ouvrir [le panneau du traitement](#a-jobs-panel-and-stop). Son menu **⋯** propose **Détails et sortie**, **Ouvrir la session** (**Ouvrir l’exécution** pour une exécution d’Expériences), **Modifier les étiquettes…** et **Arrêter**.

## En cours d’exécution

Un traitement en cours indique depuis combien de temps il tourne (« en cours depuis 12 min 05 s »). Quand le traitement indique où il en est, une barre de progression s’affiche avec un pourcentage ; survolez la barre pour voir le décompte propre au traitement, par exemple « étape 120/500 ». Quand il n’y a pas de temps restant à afficher, ce décompte se trouve sous la barre.

### Temps restant

Quand il y a de quoi se baser, la ligne indique « environ 1 h 12 min restantes ». L’app retient la première de ces sources dont elle dispose :

1. le temps restant que le traitement a lui-même affiché, comme le font beaucoup de barres de progression ;
2. la vitesse à laquelle sa progression a avancé jusqu’ici ;
3. l’estimation donnée par l’agent au démarrage du traitement ;
4. la durée de la même commande dans le même dossier auparavant, si elle s’est bien terminée au cours de la dernière semaine.

Survolez le temps pour voir laquelle est utilisée ; le panneau du traitement l’indique aussi. **(une supposition)** à côté signifie que l’estimation est approximative : une seule lecture de progression, l’estimation de l’agent ou une exécution précédente. Quand un traitement a duré plus longtemps que prévu, il affiche **estimation dépassée** à la place. Sans rien pour se baser, aucun temps n’est affiché.

## En file d’attente

Un traitement en file d’attente n’a pas encore démarré. Sa ligne dit pourquoi :

- **Attend** et les noms d’autres traitements : il démarre quand tous ceux-ci se sont bien terminés. Cliquez sur un nom pour trouver sa ligne. Les traitements que d’autres attendent affichent **Ensuite :** et qui vient après ;
- **Suivant dans la file** et le nom de la file, ou sa place, par exemple « 3e dans la file gpu » : une file exécute un traitement à la fois, dans l’ordre d’arrivée, pour l’ensemble de vos sessions. Le premier de la file peut encore attendre un autre traitement, et ceux qui le suivent attendent aussi ;
- **En attente d’un GPU libre** ou **En attente d’un emplacement libre** : une exécution d’Expériences attend de la place (voir [Comment la file choisit](/guide/experiments#how-the-queue-chooses)).

Quand les traitements qui la précèdent ont des estimations, la ligne indique aussi quand il devrait démarrer, par exemple « démarre dans environ 40 min ».

**Arrêter** un traitement en file d’attente signifie qu’il ne démarrera jamais, pas plus que ceux qui l’attendent. Si un traitement qu’un autre attend échoue ou est arrêté, celui qui attend ne démarre jamais non plus.

## Serveurs

Certaines commandes ne se terminent jamais d’elles-mêmes : un serveur de développement, un serveur web ou d’API, un notebook ou un serveur de modèle qu’une session a laissé tourner en arrière-plan. Jobs les distingue grâce à leur commande et les liste sous **Serveurs**, avec la durée d’exécution de chacun et sans temps restant. Ils tournent jusqu’à ce que vous les arrêtiez, avec **Arrêter** comme pour toute autre commande. Ils ne sont pas comptés parmi les traitements en cours, et la vue **Chronologie** les laisse de côté. Quand l’un d’eux s’achève, il passe sous **Terminées**.

## Terminées

**Terminées** conserve ce qui s’est achevé au cours des 7 derniers jours, le plus récent d’abord, sous un titre par jour : **Aujourd’hui**, **Hier**, puis la date. Vous voyez les dix derniers, et **Tout afficher** apporte le reste. Chacun indique comment il s’est achevé, quand, et combien de temps il a duré :

- **Terminé** : il s’est bien déroulé ;
- **Échec**, avec son code de sortie quand il y en a un (le nombre par lequel un programme se termine ; tout sauf 0 signifie que quelque chose s’est mal passé) ;
- **Arrêtées** : vous ou un agent l’avez arrêté ;
- **Jamais démarré**, et la raison, par exemple un traitement qu’il attendait et qui a échoué ;
- **Terminée** : un travail qui tournait déjà quand il a été ajouté à Jobs s’est achevé, et personne n’a vu s’il s’était bien passé.

Quand quelque chose a échoué, passez de **Tout** à **Échec** pour ne voir que ces cas. **Retirer de cette liste**, dans le menu **⋯** d’une ligne, en retire un, et **Effacer** les retire tous après confirmation, y compris ceux que masque une étiquette, le menu des projets ou le filtre. Cela ne fait que ranger la liste : vos sessions et les exécutions d’Expériences restent.

## Étiquettes

Une étiquette indique de quel type de travail relève un travail, comme `experiments` ou `data-collection`, afin que vous voyiez d’un coup d’œil ce qui tourne et puissiez regarder un seul type de travail à la fois. Les étiquettes ne nomment jamais un projet ni un sujet ; vos sessions et vos projets figurent déjà à côté de chaque traitement. Un traitement a jusqu’à 3 étiquettes, en minuscules avec des traits d’union entre les mots : « Data collection » est conservé sous la forme `data-collection`. La première indique où il est listé.

Il existe neuf grands types de travail, et presque tout rentre dans l’un d’eux :

- `experiments` : entraînement, évaluation, balayages de paramètres et benchmarks ;
- `data-collection` : exploration du web, scraping, téléchargement, interrogation de services, annotation ou génération de données ;
- `data-processing` : nettoyage, conversion, indexation et vectorisation de données ;
- `development` : écriture ou modification de code, de documents ou de traductions, et leur relecture ;
- `builds` : construction, compilation et empaquetage ;
- `tests` : suites de tests, vérifications de types et linting ;
- `deployment` : livraison, publication et exécution de serveurs ;
- `analysis` : recherche, rapports, graphiques et statistiques ;
- `maintenance` : sauvegardes, nettoyage et mises à jour.

Chaque travail est étiqueté séparément : il ne reprend jamais l’étiquette de sa session, de sorte que le build, les tests et le téléchargement d’une même session se retrouvent chacun sous leur propre type. Vous n’avez rien à étiqueter vous-même :

- l’agent qui démarre un traitement l’étiquette, et utilise une étiquette déjà en usage chaque fois que le travail y correspond, afin qu’un même type de travail reste sous un seul nom. Dites quelle étiquette vous voulez et l’agent l’utilise ;
- une exécution d’[Expériences](/guide/experiments) est toujours étiquetée `experiments` ;
- tout autre travail sans étiquette (les commandes en arrière-plan d’une session, ses sous-agents et ses serveurs, un traitement démarré sans étiquette) est étiqueté par le [modèle d’appoint](/settings?s=models&find=Helper%20model), qui examine le nom, le type et la commande de ce travail et choisit parmi les mêmes étiquettes. Il le fait en arrière-plan, si bien qu’une telle étiquette peut apparaître un instant après le travail. Il n’est jamais sollicité pour une [session confidentielle](/guide/sessions#keep-a-session-confidential), et la variable d’environnement `HYDOR_JOBS_TAGGER=0` le désactive.

Les grandes étiquettes ont chacune leur couleur, la même partout où elles apparaissent.

### Modifier les étiquettes

Vous pouvez modifier les étiquettes de n’importe quel traitement, quel que soit celui qui l’a étiqueté. Choisissez **Modifier les étiquettes…** dans le menu **⋯** du traitement, ou cliquez sur le crayon à côté des étiquettes dans son panneau. Saisissez les étiquettes en les séparant par des virgules, ou cliquez sur celles qui se trouvent sous **Tags au choix** (les étiquettes en usage, puis les grandes), puis sur **Enregistrer**. La boîte de dialogue indique qui a étiqueté le traitement jusqu’ici : « L’agent qui l’a démarré l’a étiqueté. », « Vous l’avez étiqueté. », « Le modèle d’appoint l’a étiqueté. Modifiez-le s’il se trompe. » ou, pour une exécution d’Expériences, « Les exécutions d’Expériences sont étiquetées experiments. »

Enregistrez un champ vide pour retirer ce que vous aviez défini. Le traitement n’a alors plus d’étiquette propre, et le modèle d’appoint peut l’étiqueter de nouveau, comme expliqué plus haut.

### Voir une étiquette

Cliquez sur la pastille d’une étiquette pour ne voir que le travail qui y est listé : les tuiles, **En activité**, **Serveurs**, **Terminées** et la chronologie suivent toutes. Le nombre sur une pastille est le nombre de ses traitements en cours ou en attente. Cliquez sur **Tout** pour tout revoir ; la pastille **Sans étiquette** montre [le travail sans étiquette](/jobs?untagged=1).

L’étiquette que vous choisissez fait partie de l’adresse de la page (elle se termine par `?tag=` et le nom de l’étiquette), si bien que vous pouvez l’ajouter à vos favoris ou l’envoyer sur votre téléphone. Une pastille correspond à la première étiquette de chaque traitement ; pour trouver un traitement par une autre de ses étiquettes, saisissez-la dans **Filtrer les traitements**.

## Voir les traitements d’un projet

Le menu des projets se trouve à côté de **Filtrer les traitements**. Il indique **Tous les projets**, ou le nom du projet que vous avez choisi, avec sa marque. Ouvrez-le pour choisir :

- **Tous les projets** : tous les traitements ;
- un projet qui a des traitements ici ; le nombre à côté indique combien tournent ou attendent ;
- **Aucun projet** : les traitements qui n’appartiennent à aucun.

Les tuiles, **En activité**, **Serveurs**, **Terminées** et la chronologie ne montrent alors que ces traitements. Choisir un projet vous ramène à la pastille **Tout**, et les pastilles et leurs nombres ne couvrent que ses traitements ; cliquez sur l’une d’elles pour voir cette étiquette au sein du projet. Tant qu’un projet est choisi, les lignes n’en répètent pas le nom. Le menu s’affiche dès qu’un traitement appartient à un projet.

Le projet que vous choisissez fait aussi partie de l’adresse de la page (`?project=` et son identifiant, ou `?project=none`), de sorte que vous pouvez l’ajouter à vos favoris. Les traitements d’un [groupe](/guide/projects#bring-projects-together-in-a-group) incluent ceux des projets qu’il réunit. Tant qu’un projet a des traitements en cours ou en attente, ou des serveurs laissés en marche, sa propre page les montre sous [Vue d’ensemble](/guide/projects#overview).

Un traitement appartient au projet de sa session. Quand il n’y en a pas (sa session n’est dans aucun projet, ou il n’a pas de session, comme un traitement que vous avez lancé depuis votre propre terminal ou une exécution lancée depuis la page Expériences), il appartient au projet dans le dossier duquel il s’exécute. Quand le dossier d’un projet se trouve à l’intérieur de celui d’un autre, le projet intérieur l’emporte. Un groupe, et un projet dont le dossier est votre dossier personnel ou un disque entier, ne reçoivent jamais de traitements de cette façon. Le panneau d’un traitement nomme son **Projet**.

## La vue Chronologie

Basculez entre **Liste** et **Chronologie** en haut à droite ; l’app retient votre choix dans ce navigateur. La chronologie dessine une barre pour chaque traitement qui tourne ou attend, le long de l’horloge, avec un point de la couleur de son étiquette avant son nom. Les pastilles d’étiquettes, le menu des projets et **Filtrer les traitements** la restreignent comme ils le font pour la liste :

- **Exécution jusqu’ici** est pleine, et **Estimation** est la partie hachurée au-delà ;
- les traitements **En file d’attente** sont en pointillés, à l’endroit où ils devraient démarrer ;
- une barre **Aucune estimation** s’estompe ;
- la ligne marquée **Maintenant** est le présent, et de fines lignes relient un traitement à ceux qui l’attendent.

Un traitement qui dépasse son estimation devient ambre. Survolez une barre pour lire son état et ses heures, et cliquez dessus pour ouvrir le panneau du traitement. Sur un écran étroit, le graphique défile latéralement et les noms restent en place. Les traitements terminés sont listés dessous.

## Le panneau d’un job et Arrêter

Le panneau s’ouvre sur le côté droit de la page (sur tout l’écran d’un téléphone). En haut se trouvent le nom du job, son état, ses étiquettes, **Ouvrir la session** (ou **Ouvrir l’exécution**) et **Arrêter**. Dessous figure ce que l’on sait du job, par exemple sa session, son projet et son dossier, son heure de démarrage, le temps qu’il lui reste et la raison de cette estimation, ce qu’il attend et comment il s’est terminé. Vient ensuite sa commande, avec un bouton qui la copie.

**Sortie** affiche la fin de ce que le job a écrit, actualisée toutes les quelques secondes pendant son exécution ; les lignes les plus récentes restent visibles, sauf si vous faites défiler vers le haut. Pour un sous-agent, elle liste ses étapes. Certains jobs, comme les sous-agents Hydor et les tâches en arrière-plan de Codex, n’ont pas de sortie ici : utilisez **Ouvrir la session**.

**Arrêter** demande d’abord confirmation, puis met fin au job : un job ou une commande s’arrête, une exécution d’Expériences est arrêtée comme sur sa propre page, et la session d’un sous-agent Hydor est arrêtée. Ce que le job a déjà fait est conservé. Le travail exécuté dans une session en dehors de Hydor, ainsi que les tâches en arrière-plan de Codex, ne peut pas être arrêté d’ici : il n’y a donc pas de bouton **Arrêter**.

## Comment les agents placent du travail ici

Vous n’avez rien à configurer. Une tâche en arrière-plan lancée par une session s’affiche ici automatiquement. Chaque session démarrée par l’app dispose aussi d’une commande appelée `job`, et les agents ont pour consigne de l’utiliser pour les longs travaux (tout ce qui dépasse environ dix minutes), afin qu’ils apparaissent ici avec un nom, une étiquette pour leur type de travail, leur progression et leur temps restant (voir [Quatre commandes dont dispose chaque agent](/guide/agents#four-commands-every-agent-has)).

Dites ce que vous voulez avec vos propres mots, et l’agent s’occupe du reste :

- **L’un après l’autre** : « lance l’évaluation après la fin de la construction de l’index ». Le second job attend le premier, et ne démarre jamais si le premier échoue ;
- **Un à la fois** : « mets ces balayages dans une file d’attente ». Les jobs portant le même nom de file passent à tour de rôle ;
- **La durée prévue** : un agent peut donner sa propre estimation, utilisée jusqu’à ce que la progression du job en dise davantage ;
- **Le type de travail** : « étiquette le crawl comme data-collection ». Les agents peuvent aussi lister les étiquettes utilisées et les étiquettes générales pas encore utilisées, puis modifier ensuite celles de n’importe quel job ;
- **Un travail déjà en cours** : « affiche dans Jobs l’entraînement que tu as lancé tout à l’heure ». L’agent l’ajoute sans le relancer (`job adopt`) ; cela n’est pas disponible sous Windows. Quand il se termine, il est indiqué comme **Terminée**, puisque personne ne peut savoir comment il s’est déroulé.

Tant qu’un job lancé par une session attend ou s’exécute (un job qu’elle a lancé avec `job`, ou une exécution d’Expériences qu’elle a démarrée), cette session n’est pas terminée : son point continue de « respirer » en bleu et son statut indique « En cours · 1 en arrière-plan », même après l’arrêt de son agent, et sa notification **Terminées** n’arrive qu’une fois le job terminé. Le bouton Arrêter près de sa zone de message laisse ces jobs en cours : arrêtez-les ici.

Si l’app est injoignable quand un agent lance un job, la commande s’exécute quand même ; elle n’apparaît simplement pas ici.

## Demander à un agent

- « Lance l’évaluation comme un job après la fin de la construction de l’index. »
- « Étiquette le crawl comme data-collection. »
- « Montre-moi uniquement les expériences en cours d’exécution. »
- « Qu’est-ce qui tourne dans mon projet Thèse ? »
- « Affiche dans Jobs l’entraînement que tu as lancé tout à l’heure. »
- « Lance ces trois balayages un à la fois dans une file d’attente. »
- « Qu’est-ce qui tourne encore, et quand sera-ce terminé ? »
- « Arrête le téléchargement et lance plutôt les tests comme un job. »
- « Pourquoi la dernière construction a-t-elle échoué ? Regarde la sortie de son job. »
