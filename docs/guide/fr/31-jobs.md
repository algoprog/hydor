# Jobs

Jobs rassemble au même endroit les travaux longs que vos sessions exécutent en arrière-plan : compilations, entraînements, indexations, téléchargements et sous-agents. Pour chacun, vous voyez depuis combien de temps il tourne, où il en est et combien de temps il lui reste environ, ce qui attend de démarrer et ce qu’il attend, et comment se sont terminés ceux qui sont finis. Vous pouvez y lire la sortie d’un job et l’arrêter, et vous pouvez demander à un agent d’exécuter une chose après l’autre.

![La page Jobs : les jobs en cours avec leur progression et le temps restant, ceux qui attendent leur tour et ceux qui sont terminés](images/jobs.webp)

## Ce que montre Jobs

Cliquez sur **Jobs** dans la barre d’icônes, ou allez à [Jobs](/jobs). Sur un téléphone, il se trouve parmi les outils au bas du tiroir. Un nombre sur son icône indique combien de jobs sont en cours d’exécution.

Un job peut être :

- une tâche en arrière-plan de l’une de vos sessions : une commande, un moniteur (la surveillance d’un journal ou d’un programme) ou un sous-agent du programme propre à l’agent, par exemple celui de Claude Code. Les sessions que vous exécutez en dehors de Hydor, dans VS Code ou un terminal, affichent aussi les leurs ;
- un travail qu’un agent a lancé comme job (voir [Comment les agents placent des travaux ici](#how-agents-put-work-here)) ;
- une exécution d’[Expériences](/guide/experiments) en cours ou dans sa file d’attente ;
- un sous-agent Hydor, c’est-à-dire une session qu’une autre session a démarrée pour une partie de son travail, tant qu’il travaille (voir [Sous-agents](/guide/sessions#subagents)).

La ligne du haut résume la situation, par exemple « 3 en cours · 2 en attente · tout sera terminé dans environ 2 h 10 min ». L’heure de fin n’apparaît que lorsque chaque job a une estimation ; les sous-agents, qui n’en ont jamais, ne comptent pas. En dessous se trouvent les sections **En cours d’exécution**, **En file d’attente**, **Serveurs** et **Terminés**, chacune présente quand elle a quelque chose à montrer. Le nombre de la barre d’icônes, la ligne du haut et l’heure de fin ne comptent pas les serveurs. La page se met à jour toute seule.

Chaque ligne comporte une icône avec un point indiquant son état, et le nom du job ; placez le pointeur sur le nom pour voir sa commande. En dessous figurent sa nature (**Commande**, **Surveillance**, **Sous-agent Claude Code**, **Sous-agent Hydor**, **Exécution d’expérience**, **Traitement** ou **Serveur**), la session qui l’a lancé et son projet, chacun sous forme de lien. À droite, **Sortie** montre ce qu’il affiche, **Ouvrir** mène à son exécution ou à sa session, et **Arrêter** y met fin.

Quand rien ne tourne ni n’attend, vous lisez « Rien ne tourne en arrière-plan pour le moment. »

## En cours d’exécution

Un job en cours indique depuis combien de temps il tourne (« en cours depuis 12 min 05 s »). Quand le job indique où il en est, une barre de progression s’affiche avec un pourcentage, et souvent le décompte propre au job à côté, par exemple « step 120/500 ». La ligne grisée en dessous est la dernière chose qu’il a affichée.

### Temps restant

Quand il existe un élément sur lequel s’appuyer, la ligne indique « environ 1 h 12 min restantes ». L’app prend le premier de ces éléments dont elle dispose :

1. le temps restant que le job a lui-même affiché, comme le font de nombreuses barres de progression ;
2. la vitesse à laquelle sa progression a avancé jusqu’ici ;
3. l’estimation donnée par l’agent au lancement du job ;
4. la durée qu’a prise la même commande dans le même dossier auparavant, quand elle s’est bien terminée au cours de la dernière semaine.

Placez le pointeur sur le temps pour voir de quel cas il s’agit. La mention **(une supposition)** à côté signifie que l’estimation est approximative : un seul relevé de progression, l’estimation de l’agent ou une exécution antérieure. Quand un job a tourné plus longtemps que prévu, la ligne indique **estimation dépassée** à la place. Sans aucun élément sur lequel s’appuyer, aucun temps n’est affiché.

## En file d’attente

Un job en file d’attente n’a pas encore démarré. Sa ligne indique pourquoi :

- **Attend** suivi des noms d’autres jobs : il démarre une fois qu’ils se sont tous bien terminés. Cliquez sur un nom pour trouver sa ligne. Les jobs que d’autres attendent indiquent **Ensuite :** puis qui vient après ;
- **Prochain dans la file** et le nom de la file, ou sa place, par exemple « 3e dans la file gpu » : une file exécute un job à la fois, dans leur ordre d’arrivée, toutes sessions confondues. Le premier de la file peut encore attendre un autre job, et ceux qui le suivent attendent aussi ;
- **En attente d’un GPU libre** ou **En attente d’un emplacement libre** : une exécution d’Expériences attend qu’une place se libère (voir [Comment la file d’attente choisit](/guide/experiments#how-the-queue-chooses)).

Quand les jobs qui le précèdent ont des estimations, la ligne indique aussi quand il devrait démarrer, par exemple « démarre dans environ 40 min ».

Avec **Arrêter** sur un job en file d’attente, il ne démarre jamais, pas plus que les jobs qui l’attendent. Si un job qu’un autre attend échoue ou est arrêté, celui qui attend ne démarre jamais non plus.

## Serveurs

Certaines commandes ne se terminent jamais d’elles-mêmes : un serveur de développement, un serveur web ou d’API, un notebook ou un serveur de modèles qu’une session a laissé tourner en arrière-plan. Jobs les reconnaît à leur commande et les liste à part sous **Serveurs**, avec depuis combien de temps chacun tourne et sans temps restant. Ils tournent jusqu’à ce que vous les arrêtiez, avec **Arrêter** comme pour toute autre commande. Ils ne comptent pas parmi les jobs en cours, et la vue **Chronologie** ne les dessine pas. Une fois l’un d’eux terminé, il passe dans **Terminés**.

## Terminés

**Terminés** conserve ce qui s’est achevé au cours des 7 derniers jours, du plus récent au plus ancien : les dix derniers, et **Tout afficher** pour le reste. Chacun indique comment il s’est terminé, quand, et combien de temps il a pris :

- **Réussi** : il s’est bien terminé ;
- **Échec**, avec son code de sortie s’il y en a un (le nombre avec lequel un programme se termine ; toute valeur autre que 0 signifie qu’un problème est survenu) ;
- **Arrêté** : vous ou un agent l’avez arrêté ;
- **Jamais démarré**, suivi de la raison, par exemple l’échec d’un job qu’il attendait ;
- **Terminé** : un travail qui tournait déjà au moment de son ajout à Jobs s’est achevé, et personne n’a vu s’il s’était bien passé.

Le × au bout d’une ligne (**Retirer de cette liste**) en retire un, et **Effacer** les retire tous après confirmation. Cela ne fait que ranger la liste : vos sessions et les exécutions d’Expériences sont conservées.

## La vue Chronologie

Passez de **Liste** à **Chronologie** et inversement en haut à droite ; l’app mémorise votre choix dans ce navigateur. La chronologie trace une barre pour chaque job en cours ou en attente, le long de l’horloge :

- **Exécution jusqu’ici** est en trait plein, et **Estimation** est la partie rayée au-delà ;
- les jobs **En file d’attente** sont en pointillés, à l’endroit où ils devraient démarrer ;
- une barre avec **Aucune estimation** s’estompe ;
- la ligne marquée **Maintenant** correspond au présent, et de fines lignes relient un job à ceux qui l’attendent.

Un job qui dépasse son estimation devient orange. Placez le pointeur sur une barre pour lire son état et ses horaires, et cliquez dessus pour voir sa sortie, ou pour l’ouvrir s’il n’en a aucune à montrer. Sur un écran étroit, le graphique défile horizontalement et les noms restent en place. Les jobs terminés sont listés en dessous.

## Sortie et arrêt

**Sortie** ouvre un panneau avec la fin de ce que le job a affiché, actualisé toutes les quelques secondes tant qu’il tourne ; les lignes les plus récentes restent visibles, sauf si vous remontez. Pour un sous-agent, il liste ses étapes. Certains jobs, comme les sous-agents Hydor et les tâches en arrière-plan de Codex, n’ont pas de sortie ici : utilisez **Ouvrir**.

**Arrêter** demande d’abord confirmation, puis met fin au job : un job ou une commande s’arrête, une exécution d’Expériences est arrêtée comme depuis sa propre page, et la session d’un sous-agent Hydor est arrêtée. Ce que le job a fait jusque-là est conservé. Les travaux qui tournent dans une session en dehors de Hydor, ainsi que les tâches en arrière-plan de Codex, ne peuvent pas être arrêtés d’ici ; ils n’ont donc pas de bouton **Arrêter**.

## Comment les agents placent des travaux ici

Vous n’avez rien à configurer. Une tâche en arrière-plan lancée par une session apparaît ici d’elle-même. Chaque session démarrée par l’app dispose aussi d’une commande appelée `job`, et les agents ont pour consigne de l’utiliser pour les travaux longs (tout ce qui dépasse une dizaine de minutes), afin qu’ils apparaissent ici avec un nom, leur progression et le temps restant (voir [Quatre commandes dont dispose chaque agent](/guide/agents#four-commands-every-agent-has)).

Dites ce que vous voulez avec des mots simples, et l’agent fait le reste :

- **L’un après l’autre** : « lance l’évaluation une fois la construction de l’index terminée ». Le second job attend le premier, et ne démarre jamais si le premier échoue ;
- **Un à la fois** : « mets ces balayages dans une file d’attente ». Les jobs portant le même nom de file passent chacun leur tour ;
- **La durée prévue** : un agent peut donner sa propre estimation, utilisée jusqu’à ce que la progression du job en dise davantage ;
- **Les travaux déjà en cours** : « affiche dans Jobs l’entraînement que tu as lancé tout à l’heure ». L’agent l’ajoute sans le redémarrer (`job adopt`) ; ce n’est pas possible sous Windows. Quand il s’achève, il indique **Terminé**, car personne ne peut savoir comment il s’est passé.

Si l’app est injoignable au moment où un agent lance un job, la commande s’exécute quand même ; elle n’apparaît simplement pas ici.

## Demander à un agent

- « Exécute l’évaluation comme un job une fois la construction de l’index terminée. »
- « Affiche dans Jobs l’entraînement que tu as lancé tout à l’heure. »
- « Exécute ces trois balayages un à la fois dans une file d’attente. »
- « Qu’est-ce qui tourne encore, et quand est-ce que ce sera fini ? »
- « Arrête le téléchargement et lance plutôt les tests comme un job. »
- « Pourquoi la dernière compilation a-t-elle échoué ? Regarde la sortie de son job. »
