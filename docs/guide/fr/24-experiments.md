# Expériences

Expériences exécute pour vous vos tâches d’entraînement et d’évaluation. Une tâche attend un GPU avec assez de mémoire libre sur l’une de vos machines (ou attend son tour dans la file d’un cluster), s’exécute toute seule et est conservée comme un enregistrement : son code, ses hyperparamètres, son environnement, son journal et ses métriques, ainsi que ce que l’agent d’astreinte a fait quand quelque chose s’est mal passé. Chaque expérience (les exécutions que vous comparez ensemble) a un titre, une description et une catégorie, et sa page présente les exécutions sous forme de tableau, leurs métriques sous forme de graphiques et les hyperparamètres qui comptent. Comparez des exécutions, ou créez un tableau de résultats avec des tests de significativité pour votre article. Les agents l’utilisent aussi : demandez à n’importe quel agent d’entraîner quelque chose sur un GPU libre, et il démarre une exécution ici.

![La page Expériences : les expériences par catégorie à gauche, et l’onglet Graphiques d’un balayage : les courbes de ses six exécutions sur des graphiques partagés, chaque exécution dans sa propre couleur](images/experiments.webp)

## Ouvrir Expériences

Cliquez sur **Expériences** dans la barre d’icônes, ou allez à [Expériences](/experiments).

La première fois que vous ouvrez la page, une courte visite conçue pour les personnes qui découvrent les expériences vous la fait découvrir. Elle apparaît tant que les astuces sont activées, après la visite de bienvenue. Une carte explique en mots simples ce que sont une expérience et une exécution, puis chaque partie de la page s’éclaire à son tour avec sa propre carte : **Nouvelle exécution**, la file d’attente et les GPU, vos expériences par catégorie, le suivi d’une exécution en direct, la comparaison d’exécutions et les tableaux de résultats, et le fait de laisser un agent faire le travail. Avancez et revenez avec **Suivant** et **Retour** ; **Terminé** y met fin, et **Passer** ou Esc la ferme plus tôt. **Faire la visite** (le bouton boussole en haut à droite de la page) la relance à tout moment.

Sur un ordinateur, une colonne à gauche reste à côté de tout ce que vous ouvrez ici :

- La ligne de la file d’attente en haut indique ce qui se passe (« 2 en cours · 1 en attente », ou « Rien en cours »). En dessous, les GPU de cet ordinateur sous forme de petits indicateurs : la mémoire utilisée par chacun, dans la couleur d’accent quand l’une de vos exécutions l’occupe (pointez-en un pour voir à quel point il est occupé et quelle exécution l’occupe ; cliquez dessus pour ouvrir cette exécution).
- **Rechercher une expérience** filtre la liste selon ce que vous tapez : le titre, la description, la catégorie et le nom d’une expérience, ainsi que les noms et les commandes de ses exécutions. Une expérience qui ne correspond que par ses exécutions indique leur nombre (« 3 exécutions correspondent »).
- **Vue d’ensemble** vous ramène à la page décrite ci-dessous.
- **Évaluations**, quand vous en avez, avec leurs derniers scores ([Évaluations](#evaluations-keeping-score-the-same-way)).
- Viennent ensuite les expériences, regroupées par catégorie (un petit titre pour chacune, la catégorie dont l’exécution est la plus récente en premier ; les expériences sans catégorie figurent sous **Autres expériences**, et il n’y a aucun titre tant qu’aucune n’a de catégorie). Chacune affiche son titre et, en dessous, son nombre d’exécutions et combien sont en cours (« 6 exécutions · 1 en cours »), ou la date de sa dernière exécution (« 23 exécutions · il y a 2 h »). Dans une catégorie, l’expérience dont l’exécution est la plus récente vient en premier. **Exécutions sans expérience** est la dernière entrée, quand de telles exécutions existent.

La **Vue d’ensemble** affiche :

- **En cours d’exécution**, quand quelque chose s’exécute ou attend : une carte pour chaque exécution avec son statut, son nom, son expérience, son avancement (« 54 % · environ 41 min restantes »), sa métrique principale avec une petite courbe, et ses GPU. Une exécution en attente en indique la raison. Cliquez sur une carte pour ouvrir l’exécution. Quand plus de 12 sont en cours, **Tout afficher (N)** les affiche toutes.
- **Expériences** : une carte pour chacune, avec sa catégorie, son titre et sa description, son nombre d’exécutions, combien sont en cours et la date de la dernière, ainsi que la meilleure valeur de sa métrique principale (« Meilleur dev_bpb 1,599 »). Cliquez sur l’une d’elles pour l’ouvrir.
- **Dernières exécutions** : un tableau des 10 dernières exécutions de l’ensemble de vos expériences. **Afficher les N exécutions** les affiche toutes, avec **Rechercher une exécution** au-dessus.

Sur un écran étroit, il n’y a pas de colonne : la Vue d’ensemble elle-même commence par la ligne de la file d’attente, les GPU et **Rechercher une expérience**, et présente les expériences sous forme de cartes.

Tant qu’il n’y a aucune exécution, la page explique ce qu’est Expériences, avec **Nouvelle exécution**, ou « demandez à n’importe quel agent : “entraîne ça sur un GPU libre et préviens-moi quand c’est terminé” ».

## La page d’une expérience

Cliquez sur une expérience dans la colonne ou sur la Vue d’ensemble. En haut :

- Sa catégorie et son nom (le nom que portent ses exécutions, tel que vous l’avez saisi dans **Expérience**), puis son titre en grandes lettres, et sa description. Une description de plus de trois lignes comporte **Plus**.
- Une ligne de compteurs : « 23 exécutions · 1 en cours · 2 en attente · 9 terminées · 6 échouées · dernière exécution il y a 2 h » (uniquement ce qui dépasse zéro).
- À droite, un menu ⋯, **Cette expérience** : **Modifier le titre et la description** et **Les réécrire** (voir [Titres, descriptions et catégories](#titles-descriptions-and-categories)), **Nouvelle exécution dans cette expérience**, **Nouveau balayage dans cette expérience**, **Créer un tableau** (de ses exécutions terminées : voir [Tableaux de résultats pour votre article](#results-tables-for-your-paper)), **Comparer les 6 dernières** et **Tout sélectionner** (coche toutes les exécutions). Sur un téléphone, une flèche à gauche du titre permet de revenir en arrière.

En dessous se trouvent trois onglets : **Exécutions** (avec leur nombre), **Graphiques** et **Hyperparamètres** (dès que l’expérience compte au moins deux exécutions qui diffèrent par un hyperparamètre). L’onglet choisi en dernier s’ouvre en premier la fois suivante, sur cet appareil.

### Le tableau des exécutions

L’onglet **Exécutions** liste les exécutions de l’expérience sous forme de tableau, une ligne chacune : son nom, son statut (« En cours 54 % », « Terminé », « Échouée », « En attente d’un GPU » ; pointez un statut d’attente pour en voir la raison), une colonne pour chaque métrique (sa dernière valeur ; la meilleure de chaque colonne en gras) et pour chaque hyperparamètre, puis **Temps d’exécution** et **Démarrée**. Quand les exécutions de l’expérience se trouvent à plusieurs endroits, une colonne **Où** indique où. Les exécutions en cours viennent en premier, puis celles en attente, dans l’ordre où elles démarreront, puis celles qui sont terminées, les plus récentes d’abord. Cliquez sur le nom d’une colonne pour trier selon celle-ci (pour une métrique, le premier clic place la meilleure en premier ; cliquez à nouveau pour inverser l’ordre, et une troisième fois pour revenir à l’ordre initial). Le tableau défile horizontalement, et la case à cocher et le nom de chaque exécution restent visibles.

Au-dessus du tableau :

- **Rechercher une exécution** cherche dans les noms, les commandes et les étiquettes des exécutions.
- **Filtrer** : par **Statut** (**Toutes les exécutions**, **En cours et en attente**, **Terminé**, **Échouées ou perdues**, **Arrêtées**) et, quand des exécutions se trouvent à plusieurs endroits, par **Où**. Tant qu’une recherche ou un filtre est actif, **× N affichées** l’efface.
- **Colonnes** : cochez les métriques et les hyperparamètres à afficher (une zone de recherche permet d’en trouver un ; un hyperparamètre qui diffère d’une exécution à l’autre indique **Différences**). **Réinitialiser** revient à ceux choisis par la page : les métriques qui en disent le plus sur les exécutions et les hyperparamètres qui diffèrent. Chaque expérience conserve ses propres colonnes sur cet appareil.

Cliquez sur une ligne pour ouvrir l’exécution. Cochez les cases pour comparer des exécutions (voir [Comparer des exécutions](#compare-runs)). Le tableau affiche 50 lignes ; **Afficher N de plus** affiche le reste.

### Graphiques

L’onglet **Graphiques** trace chaque métrique que les exécutions impriment au fil des étapes, un graphique chacune, avec une ligne pour chaque exécution. À gauche (au-dessus des graphiques, sur un téléphone) se trouvent les exécutions présentes sur les graphiques : **Sur les graphiques** avec leur nombre (« 6 sur 23 »), puis chaque exécution de l’expérience, avec un point coloré quand elle est affichée et un anneau vide quand elle ne l’est pas. Cliquez sur une exécution pour l’afficher ou la masquer. Jusqu’à 8 exécutions s’affichent à la fois (« Jusqu’à 8 exécutions s’affichent à la fois : masquez-en une d’abord »). Une exécution garde sa couleur tant qu’elle est affichée, quoi que vous masquiez ou affichiez d’autre, de sorte que vous pouvez suivre une exécution au fil de vos modifications ; la même couleur la repère dans le tableau des exécutions. Le menu ⋯ (**Exécutions affichées**) propose **Afficher les 8 dernières**, **Afficher les 8 meilleures** (selon la métrique principale de l’expérience), **Afficher les exécutions choisies** (celles que vous avez cochées dans le tableau) et **Tout masquer**. Au départ, les 8 premières exécutions qui ont des courbes s’affichent. Chaque expérience conserve votre choix sur cet appareil.

Les graphiques sont répartis en sections selon le début du nom d’une métrique : **dev** (ou val, validation, eval, test…), **train**, tout autre préfixe que deux métriques ou plus partagent avant une barre oblique (`eval/…`), puis **Métriques** pour celles qui disent comment se comporte une exécution, et **Autre** pour le reste (repliée jusqu’à ce que vous l’ouvriez). Cliquez sur le nom d’une section pour la replier ou l’ouvrir. Au-dessus des graphiques :

- **Rechercher une métrique** n’affiche que les graphiques dont le nom contient ce que vous tapez, dans toutes les sections.
- **Lissage** : un curseur de 0 (les courbes telles quelles) à 0,99, une moyenne mobile comme la tracent TensorBoard et Weights & Biases ; la courbe brute reste en filigrane derrière.
- **Options du graphique** (le bouton à curseurs) : **Axe X** (**Étape**, ou une autre métrique qui ne fait que croître, comme les jetons ou le temps), **Échelle logarithmique** et **Ignorer les valeurs aberrantes** (la plage d’un graphique suit la majorité des valeurs plutôt qu’un seul pic). Elles sont conservées sur cet appareil, pour tous les graphiques.

Pointez un graphique pour lire la valeur de chaque exécution à cette étape. Avec une souris, faites glisser sur un graphique pour zoomer ; double-cliquez dessus (ou utilisez **Réinitialiser le zoom**) pour revenir en arrière. Sur un écran tactile, un appui ou un glissement affiche les valeurs. **Agrandir**, en haut à droite d’un graphique, l’ouvre en grand, avec un tableau des valeurs **Dernier**, **Meilleur**, **Min** et **Max** de chaque exécution.

### Hyperparamètres

L’onglet **Hyperparamètres** montre comment les hyperparamètres des exécutions évoluent avec une métrique, ce qui permet de lire un balayage. Choisissez la métrique (la principale au départ) et si chaque exécution compte selon sa valeur **Dernier** ou **Meilleur** ; la page indique si une valeur plus basse ou plus haute est préférable pour elle. Quand les exécutions forment un balayage, une ligne l’indique : « Un balayage de 12 exécutions · toutes les combinaisons · 9 terminées · 2 en cours · 1 arrêtée en avance · arrêtée en avance sur dev_loss ». En dessous :

- Meilleure exécution (**Meilleur**) : « Meilleur dev_bpb », sa valeur, l’exécution et les valeurs des hyperparamètres qui diffèrent. Cliquez dessus pour ouvrir l’exécution.
- **Coordonnées parallèles** : une ligne pour chaque exécution à travers les hyperparamètres (ceux qui comptent le plus d’abord, jusqu’à 8) et, en dernier, la métrique. Plus la ligne est marquée, meilleure est l’exécution. Pointez une ligne pour voir de quelle exécution il s’agit ; cliquez dessus pour ouvrir l’exécution.
- **Les hyperparamètres qui comptent** : une barre pour chaque hyperparamètre qui diffère, le plus fort d’abord. Pour un nombre, ρ (de −1 à 1) indique comment son ordre va avec celui de la métrique : une barre à gauche du milieu signifie qu’une valeur plus haute va avec une métrique plus basse, et les mots disent « plus haut est meilleur » ou « plus bas est meilleur ». Pour les autres valeurs (un nom, vrai ou faux), η (de 0 à 1) indique à quel point les groupes diffèrent, avec « meilleur : » et la valeur dont les exécutions ont obtenu en moyenne les meilleurs résultats. En dessous, le nombre d’exécutions à partir desquelles le calcul a été fait. C’est une corrélation, pas la preuve d’une cause : d’autres hyperparamètres changent en même temps, et avec peu d’exécutions, une barre peut apparaître par hasard. Un hyperparamètre identique dans toutes les exécutions, ou que moins de 3 exécutions possèdent, est écarté.
- **Chaque hyperparamètre face à** la métrique : un graphique pour chacun, un point par exécution, la meilleure entourée (en échelle logarithmique quand les valeurs couvrent un large intervalle, comme les taux d’apprentissage).

À la fin, **Créer un tableau** et **Comparer les 6 meilleures**.

## Démarrer une exécution

1. Cliquez sur [**Nouvelle exécution**](/experiments?new=1) en haut à droite.
2. Saisissez la **Commande**, comme vous le feriez dans son dossier : `python train.py --lr 3e-4`.
3. Choisissez le **Dossier** dans lequel elle s’exécute, et **Où elle s’exécute** : **Cet ordinateur**, l’une de vos autres machines, ou un cluster (voir [Où vont les exécutions](#where-runs-go)).
4. Réglez les **GPUs** dont elle a besoin (0 l’exécute sans GPU) et **Mémoire libre chacun (Go)**. Si ce champ reste vide, elle attend un GPU que personne n’utilise.
5. Donnez-lui un **Nom** si vous le souhaitez (sinon, le nom de son script) et une **Expérience** : les exécutions d’une même expérience sont listées, représentées en graphiques et comparées ensemble (la zone propose celles que vous avez déjà).
6. Cliquez sur **Début**.

**Plus d’options** contient le reste :

- **Hyperparamètres** : des lignes nom=valeur (`lr=3e-4`), conservées avec l’exécution, affichées en colonnes dans le tableau des exécutions de son expérience et comparées dans les tableaux. Les hyperparamètres présents dans la commande elle-même sont lus automatiquement : `--name value`, `--name=value`, et les mots `name=value` après le programme (comme Hydra les prend). `{name}` dans la commande prend la valeur d’un hyperparamètre.
- **Graine** (`{seed}` dans la commande la prend ; `--seed` dans la commande est lu aussi), **Priorité** (la plus haute passe en premier) et **Limite de durée (heures)** (l’exécution est arrêtée après cette durée).
- **Fichier de métriques** : un fichier dans lequel l’exécution écrit des métriques au format JSON lines, en plus de ce qu’elle imprime. **Scores par exemple** : un fichier de scores par exemple (voir [Tableaux de résultats pour votre article](#results-tables-for-your-paper)).
- **Me prévenir** : **Quand c’est terminé** et **En cas d’échec** (tous deux activés sauf si vous les décochez), et **Quand une métrique franchit une valeur** (« val_acc > 0.9 »).
- **Agent d’astreinte** : voir [L’agent d’astreinte](#the-agent-on-call).
- Sur un cluster SLURM : **Processeurs**, **Mémoire (Go)** et **Partition**.

La nouvelle exécution s’ouvre, pour que vous puissiez la voir démarrer. Pour ajouter une exécution à une expérience que vous consultez, utilisez **Nouvelle exécution dans cette expérience** dans son menu ⋯ : **Expérience** est déjà rempli. Peu après la première exécution d’une expérience, le modèle d’appoint lui donne un titre, une description et une catégorie (voir [Titres, descriptions et catégories](#titles-descriptions-and-categories)).

## Comment la file d’attente choisit

- Les tâches passent par priorité, puis par ancienneté. Une tâche qui a besoin de GPU prend ceux qui ont au moins sa mémoire libre et qu’aucune autre de vos exécutions n’occupe, les plus libres d’abord. Tant qu’il n’y en a pas assez de libres, elle attend et en indique la raison : « En attente de 1 GPU avec 20 Go libres : le plus libre actuellement a 12 Go, le GPU 2 ; vos autres exécutions occupent le GPU 0 ». Une tâche plus petite derrière elle peut démarrer en premier, quand ce dont elle a besoin est libre.
- Les tâches sans GPU démarrent aussitôt, quelques-unes à la fois ; leur nombre se règle dans [Où vont les exécutions](#where-runs-go) (au départ, un quart des threads de l’ordinateur, de 1 à 4).
- Une tâche qui demande plus de GPU que l’ordinateur n’en a, ou un GPU sur un ordinateur sans GPU NVIDIA, échoue aussitôt et le dit.
- Une exécution ne voit que ses propres GPU (CUDA_VISIBLE_DEVICES) ; une exécution sans GPU n’en voit aucun. Elle reçoit aussi HYDOR_RUN (son identifiant), HYDOR_RUN_DIR (son dossier) et HYDOR_SEED, et Python imprime immédiatement (PYTHONUNBUFFERED), de sorte que son journal suit au fur et à mesure.
- Les exécutions continuent dans tmux (ou en arrière-plan, là où il n’y a pas de tmux) quand l’app redémarre ou se met à jour. Quand l’app revient, elle les retrouve, lit ce qu’elles ont imprimé entre-temps et constate lesquelles se sont terminées ; une exécution dont le processus a disparu est marquée **Disparu**.

## Ce qu’enregistre une exécution

- **Son code** : au démarrage, le commit et la branche du dépôt Git de son dossier, et la présence ou non de modifications sans commit ; s’il y en avait, un patch de ces modifications (fichiers binaires exclus, 2 Mo au maximum), et le nombre de fichiers que Git ne suit pas. Sur cet ordinateur, les fichiers nommés dans sa commande que Git ne suit pas ou ignore (un script sans commit, un petit fichier de réglages) sont copiés dans son dossier, sous `untracked/`, pour que vous puissiez la relancer plus tard : 1 Mo au maximum par fichier et 5 Mo en tout, et jamais un fichier qui semble contenir une clé ou un mot de passe. Sa trace indique « Absents de git, conservés avec l’exécution », et quels fichiers étaient trop volumineux pour être gardés.
- **Son environnement** : l’ordinateur ; le Python avec lequel la commande s’exécute et les versions de PyTorch, Transformers, JAX, TensorFlow et NumPy qui s’y trouvent (lues depuis les paquets, rien n’est importé) ; avec des GPU, les versions de CUDA et du pilote et les noms des GPU.
- **Ses hyperparamètres et sa graine**, son **journal**, son **code de sortie**, et son propre dossier dans les données de l’app (son journal, son patch, son code de sortie et ses métriques).
- **Ses métriques**, lues dans sa sortie à mesure qu’elle grandit : des paires `key=value` (`loss=0.42`, comme les affichent les barres de progression de Lightning), un objet JSON sur une ligne (`{"step": 100, "loss": 0.42}`), les dictionnaires affichés par Python (comme le fait le Trainer de Hugging Face), le « loss: 0.41 - accuracy: 0.87 » de Keras, et le fichier de métriques. L’étape est lue dans `step`, `global_step`, `iter` ou `epoch`. Pour chaque métrique, elle garde la dernière valeur, la meilleure (plus bas est mieux pour les pertes, les erreurs, la perplexité et les métriques semblables d’après leur nom, plus haut pour les autres) et une série pour les graphiques. Une métrique affichée à répétition forme une courbe ; un nombre affiché une seule fois est une valeur (ses hyperparamètres au début, ses résultats à la fin). Elle conserve jusqu’à 100 métriques : quand une exécution en affiche davantage, ses courbes sont gardées avant les nombres affichés une seule fois.
- **Où elle en est**, quand sa sortie le dit : une barre de progression (celle de tqdm, comme la dessine le Trainer de Hugging Face, ou une barre nommée d’après l’entraînement ou les étapes), « step 120/1000 », ou un total d’étapes qu’elle affiche (`total_steps`, `max_steps`, `num_training_steps`…) à côté de ses étapes.

## La page d’une exécution

Cliquez sur une exécution (dans un tableau, sur une carte, ou sur la jauge d’un GPU). Sur un ordinateur, elle s’ouvre à la place de l’expérience, la colonne restant à gauche ; sur un écran étroit, elle occupe tout l’écran, avec une flèche de retour. Le chemin du retour est le lien en haut à gauche, qui porte le nom de l’expérience de l’exécution (**Vue d’ensemble** pour une exécution sans expérience).

- L’en-tête : le nom de l’exécution ; **Arrêter** tant qu’elle s’exécute ou attend (« Arrêt en cours » pendant l’arrêt) ; **Exécuter de nouveau**, qui ouvre « Nouvelle exécution » préremplie avec ses hyperparamètres, à modifier avant de la lancer ; et **Plus** (⋯) : **Copier la commande**, **Son dossier dans Fichiers**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau ; voir [Travailler avec les fichiers et les dossiers](/guide/files-git#work-with-files-and-folders)), et, une fois terminée, **Supprimer la trace** (sa trace, son journal, son patch et ses métriques disparaissent ; les fichiers que la tâche a créés dans son propre dossier restent). Sur un téléphone, **Exécuter de nouveau** se trouve dans le menu ⋯.
- La ligne d’état : son état, avec la durée qu’elle a prise une fois terminée, son code de sortie quand il est différent de 0, l’endroit où elle s’exécute, ses GPU et l’heure de son démarrage. Tant qu’elle s’exécute et que sa sortie indique où elle en est : une barre, les étapes faites sur le total (« 9 120 sur 10 878 · 84 % ») et le temps restant approximatif, calculé d’après le temps écoulé jusque-là. Une exécution qui attend ou qui a échoué en dit la raison.
- Trois onglets : **Vue d’ensemble**, **Graphiques** (avec son nombre de courbes) et **Journal**.

La **Vue d’ensemble** contient :

- **Comment elle s’est terminée**, en premier, pour une exécution qui a échoué ou disparu : les dernières lignes de son journal, et **Ouvrir le journal**.
- **Métriques clés** : une tuile pour chacune des six métriques au plus qui disent à quel point elle réussit (jamais de données annexes comme le taux d’apprentissage ou le nombre de jetons), avec la dernière valeur, la meilleure quand elle diffère, et une petite courbe. Cliquez sur une tuile pour ouvrir l’onglet **Graphiques** sur cette métrique.
- **Hyperparamètres** : ceux qui lui ont été donnés ou qui ont été lus dans sa commande (un champ permet d’en trouver un quand il y en a beaucoup).
- **Valeurs** : les nombres affichés une seule fois, par nom : ses hyperparamètres au début, ses résultats à la fin. **Tous les N** en affiche plus de douze, avec un champ pour en trouver une.
- **Détails** : son expérience (un lien vers elle), son état, son heure de début et de fin, sa durée, l’endroit où elle s’exécute, ses GPU, sa graine, sa priorité, la session qui l’a lancée et l’exécution dont elle est une nouvelle exécution.
- **Code** : le commit et la branche, **Voir les modifications** pour le patch (ou « Rien n’a changé depuis »), le nombre de fichiers que Git ne suit pas, et les noms de ceux utilisés par la commande qui ont été gardés avec l’exécution ou qui étaient trop volumineux pour l’être.
- **Commande** : la commande et le dossier, avec **Son dossier dans Fichiers**. **Environnement** : l’ordinateur, Python, les paquets et les GPU.
- **Ce qui s’est passé** : ses événements, avec leur heure : quand elle a attendu, démarré et terminé, et ce que l’agent d’astreinte a vu et fait, avec **Ouvrir sa session**.

**Graphiques** dessine les courbes de l’exécution comme le fait l’onglet d’une expérience (voir [Graphiques](#charts)), pour cette seule exécution, et les relit toutes les quelques secondes tant qu’elle s’exécute. **Journal** affiche sa sortie, la plus récente en bas. Tant qu’elle s’exécute, **Suivre** garde le plus récent à l’écran ; faites défiler vers le haut pour lire et le suivi s’arrête. **Rechercher dans le journal** n’affiche que les lignes qui correspondent (« 12 lignes correspondent »), et le suivi est suspendu pendant ce temps.

**Arrêter** envoie Ctrl-C aux programmes de l’exécution, puis les arrête plus brutalement s’ils ne sont pas terminés au bout de 10 secondes. Une exécution qui était seulement en attente est retirée de la file immédiatement.

## L’agent d’astreinte

Sous **Plus d’options** → **Agent d’astreinte** :

- **Désactivé** (par défaut) : ce qui tourne mal est tout de même noté sur la page de l’exécution.
- **Me prévenir** : une notification quand cela arrive.
- **Un agent s’en occupe** : un agent démarre une session dans le dossier de l’exécution avec ce qui s’est passé, la fin du journal, la trace de l’exécution et **Ce que l’agent peut faire**, vos règles pour lui. Il agit dans ces limites, puis vous dit en quelques lignes ce qui s’est passé et ce qu’il a fait. La page de l’exécution renvoie vers sa session.

Il surveille (tout, sauf si vous décochez certains éléments) : **NaN** (une métrique qui devient NaN ou infinie, ou une perte NaN dans le journal), **Mémoire insuffisante** (les messages de CUDA, `OutOfMemoryError`, ou le programme tué avec le code de sortie 137), **Un blocage** (aucune nouvelle sortie pendant 30 minutes, ou le nombre de minutes que vous avez défini), **Un plantage** (un code de sortie différent de 0, ou un processus mort) et **Divergence** (une perte plus de deux fois supérieure à sa meilleure valeur, cinq mesures de suite).

Si elles sont laissées vides, les règles sont : « Read the log and the code. If a fix is clear and safe, run it again with experiment_run (from the last checkpoint if there is one), changing as little as possible. Never delete files or checkpoints. Then tell the user in a few lines what happened and what you did. » (« Lis le journal et le code. Si une correction est claire et sûre, relance l’exécution avec experiment_run (depuis le dernier point de contrôle s’il y en a un), en changeant le moins possible. Ne supprime jamais de fichiers ni de points de contrôle. Puis dis à l’utilisateur en quelques lignes ce qui s’est passé et ce que tu as fait. ») L’agent est celui qui a lancé l’exécution (quand c’est un agent), sinon l’agent et le modèle que vous avez choisis en dernier sur la page de démarrage. Un seul agent s’occupe d’une exécution à la fois, et trois agents au plus passent d’astreinte en une heure : au-delà, vous en êtes simplement informé.

## Notifications

Vous êtes prévenu quand une exécution se termine ou échoue (sauf si vous décochez ces options), quand une métrique franchit la valeur que vous avez fixée, et par l’agent d’astreinte. Une notification ouvre la page de l’exécution. Un balayage vous prévient une seule fois, quand toutes ses exécutions sont terminées, avec sa meilleure exécution ; sa notification ouvre l’expérience du balayage sur son onglet **Hyperparamètres**. Huit notifications au plus concernant des exécutions arrivent en dix minutes ; au-delà, une seule vous indique combien il y en a eu d’autres.

Une exécution qu’un agent a démarrée avec « tell me when it ends » (report) envoie aussi un message à cette session quand elle se termine, pour que son agent puisse reprendre à partir de là. Les exécutions d’une même session qui se terminent à peu d’intervalle, ou pendant que son agent travaille, sont annoncées dans un seul message, une ligne chacune avec les nombres les plus importants, et une exécution que l’agent a lue depuis sa fin est omise ; dans la conversation, ce message apparaît sur une seule ligne, **Expériences · Exécutions terminées**, qui s’ouvre d’un clic.

## Titres, descriptions et catégories

Chaque expérience a un titre (quelques mots simples : ce qui est entraîné ou évalué, sur quoi, et ce qui varie), une description (une à trois phrases) et une catégorie (un à trois mots qui nomment le domaine ou la tâche, comme « Modélisation du langage »). Ils s’affichent sur sa page, dans la colonne et sur les cartes de la Vue d’ensemble, de sorte qu’un nom comme `e7-pretrain` devient une ligne compréhensible, et que le champ de recherche (Ctrl+K) et **Rechercher une expérience** trouvent une expérience grâce à eux.

Qui les écrit :

- **Le modèle d’appoint** ([Paramètres → Agents → Modèles](/settings?s=models&find=Helper%20model)) les écrit pour une expérience qui n’en a pas, peu après sa première exécution (et pour vos anciennes expériences, un peu après le démarrage de l’app). Il lit les noms, les commandes, les hyperparamètres et les noms de métriques de certaines de ses exécutions. Quand il les a écrits et que l’expérience a doublé son nombre d’exécutions (4 au moins), il les écrit de nouveau, une fois toutes les six heures au plus.
- **Un agent** qui lance des exécutions donne à l’expérience un titre, une description et une catégorie quand il lance les premières exécutions, puis de nouveau quand ce qu’il teste change (l’outil experiment_describe).
- **Vous** : **Modifier le titre et la description** dans le menu ⋯ de l’expérience ouvre une fenêtre avec **Titre**, **Description** et **Catégorie** (elle propose les catégories déjà utilisées). **Les réécrire** demande une nouvelle version au modèle d’appoint, qui remplace ce qui s’y trouve.

Ce que vous ou un agent avez écrit n’est jamais écrasé automatiquement ; seul **Les réécrire** le fait. Les exécutions d’une [session confidentielle](/guide/sessions#keep-a-session-confidential) ne sont lues que par un modèle d’appoint qui s’exécute sur cet ordinateur ; s’il n’y en a pas, leur expérience reste telle quelle.

## Comparer des exécutions

Cochez la case de chaque exécution voulue dans un tableau d’exécutions (la case de l’en-tête du tableau coche toutes les exécutions affichées). Une barre en bas indique « 3 sélectionnées » et propose **Comparer** (pour 2 exécutions ou plus, jusqu’à 8), **Créer un tableau** et × pour tout décocher. Les exécutions cochées le restent quand vous passez d’une expérience à l’autre, ce qui permet de comparer des exécutions d’expériences différentes. **Comparer** ouvre une fenêtre, « Comparer 3 exécutions », avec :

- Les exécutions, chacune avec la couleur de sa ligne.
- **Métriques** : toutes les métriques que l’une d’elles possède, une colonne par exécution, la meilleure valeur de chaque ligne en gras. Les 15 premières s’affichent ; **Tous les N** affiche le reste.
- **Hyperparamètres** : l’expérience, la commande, le dossier, l’endroit où elle s’est exécutée, le commit, la graine et les GPU, ainsi que chaque hyperparamètre, côte à côte. **Uniquement les différences** (activé par défaut) masque les lignes identiques dans toutes les exécutions ; une différence est signalée.
- **Graphiques** : les courbes des exécutions, un graphique par métrique, une ligne par exécution.

Le menu ⋯ d’une expérience propose aussi **Comparer les 6 dernières**, et son onglet **Hyperparamètres** **Comparer les 6 meilleures**.

Avant de vous fier à un gain, utilisez **Essayer de le réfuter**, en bas de cette fenêtre : un agent qui n’a participé en rien au travail tente alors d’expliquer ce gain autrement. Vérifiez **Le résultat à tester** (une phrase, préremplie d’après les exécutions sélectionnées : modifiez-la pour exprimer ce que vous voulez dire), choisissez la **Référence** et qui s’en charge (**Exécuté par**), puis cliquez sur **Démarrer**. L’agent cherche d’autres explications (des graines chanceuses, une référence mal réglée, une fuite de données, un bogue dans une métrique), lance des contrôles dans une expérience distincte, sur une copie de votre code et en demandant votre accord avant d’utiliser beaucoup de temps GPU, ne répare rien, et conclut par « Il tient », « Il tient en partie » ou « Il ne tient pas », en précisant ce qu’il a essayé (les exécutions sur d’autres machines sont laissées de côté).

## Évaluations : toujours noter de la même façon

Une évaluation est la façon dont un projet tient ses scores : une commande et un nombre, scellés, pour que chaque exécution et chaque agent soient notés de la même manière. Les fichiers qui composent le programme de notation et les données sur lesquelles il note sont scellés, aucun score n’est donné tant qu’ils diffèrent, et chaque score est calculé par l’app à partir de sa propre exécution de la commande scellée. Deux nombres peuvent ainsi être comparés sans se demander comment chacun a été obtenu.

Sur ordinateur, la colonne les liste sous **Évaluations**, au-dessus des expériences, chacune avec son dernier score et sa position par rapport à la référence (« 0.431 · 0.019 de mieux »), « Pas encore de score », « Calcul du score… » pendant qu’un calcul est en cours, « Évolution en cours · 37 sur 200 » pendant qu’[Faire évoluer](#evolve-searching-for-a-better-version) y travaille, ou « modifié » avec une marque orange quand ses fichiers diffèrent. Sur téléphone, ce sont des cartes en haut de la vue d’ensemble.

### En mettre une en place

Cliquez sur **Plus** (⋯) en haut, puis sur [**Nouvelle évaluation**](/experiments?new=evaluation). La fenêtre comporte quatre parties :

- **Ce qu’elle note** : son **Nom**, le **Dossier** (un projet, généralement un dépôt git), la **Commande qui calcule le score** (par exemple `python eval.py --split dev --seed {seed}` : écrivez `{seed}` à l’emplacement de la graine, pour calculer le score avec plusieurs graines), **Le nombre qui compte** tel que la commande l’affiche (`ndcg@10` pour `ndcg@10=0.412`), et **Plus c’est élevé, mieux c’est** ou **Plus c’est bas, mieux c’est**.
- **Ce qui ne doit pas changer** : les fichiers et dossiers qui composent le programme de notation et ses données. Saisissez-en un et cliquez sur **Ajouter**, ou touchez ceux des **Suggestions tirées de votre commande**. Si la commande contient `{seed}`, **Graines** indique lesquelles (1, 2, 3 si vous ne les changez pas).
- **Test final** (facultatif) : sa propre commande, et un **Dossier réservé** situé hors du projet, que seul le test final reçoit : les agents qui travaillent dans le projet ne l’y voient pas. La commande le trouve dans `$HYDOR_HELD_OUT`.
- **Où elle s’exécute** : les GPU dont chaque exécution a besoin, leur mémoire libre et une durée maximale. Ses exécutions attendent leur tour sur cet ordinateur comme toutes les autres.

**Créer et sceller** scelle les fichiers (les gros dossiers prennent un moment) et ouvre la page de l’évaluation. Vous ne savez pas quoi indiquer ? **La configurer avec un agent**, en haut de la fenêtre, lance une demande dans ce dossier : l’agent lit la façon dont vous entraînez et évaluez vos modèles et propose l’évaluation, qui n’est créée que si vous acceptez.

### La page de l’évaluation

Sous son nom figurent le nombre, le sens dans lequel il est meilleur, les graines et la commande (touchez-la pour la voir en entier), puis « Scellée le 24 nov. : 4 fichiers, sans aucun changement ». Viennent ensuite trois cases :

- **Référence** : le score auquel les autres sont comparés. Au début, il est indiqué « Pas encore mesurée » : cliquez sur **Mesurer la référence**. **Mesurer à nouveau** se trouve dans son menu.
- **Dernier score** : son nombre, sa branche et sa position par rapport à la référence (« 0.019 de mieux que la référence » ; « Identique à la référence, au bruit près » quand l’écart pourrait facilement être dû au hasard), avec la fréquence à laquelle le hasard seul produirait un tel écart.
- **Test final** : **En ajouter un**, **Exécuter le test final…**, ou son nombre et le nombre de fois où il a été exécuté depuis le scellement.

À partir de deux scores, un graphique montre chacun d’eux au fil du temps, avec sa dispersion entre les graines et la référence en pointillés. **Faire évoluer…**, dans le menu ⋯ de la page, lance la recherche d’une meilleure version ([Faire évoluer](#evolve-searching-for-a-better-version)) et, dès qu’il y en a une, **Faire évoluer** les liste entre le graphique et les scores. **Scores** liste ces derniers, du plus récent au plus ancien : quand, où (branche et commit, « avec des modifications sans commit » le cas échéant), qui l’a demandé, le score et la comparaison. Le menu d’un score ouvre ses exécutions, l’utilise comme référence (**Utiliser comme référence**), l’arrête ou le supprime. Quand un score a échoué parce que la commande n’a pas affiché le nombre, les noms qu’elle a bien affichés sont montrés : touchez-en un pour l’utiliser à la place (l’évaluation est alors scellée à nouveau).

**Calculer le score maintenant** note le dossier. Quand le dépôt a des worktrees git, l’app demande « Calculer le score du contenu de quel dossier ? » : le dossier lui-même ou l’un des worktrees, désigné par sa branche. Une évaluation peut noter son propre dossier, un dossier situé à l’intérieur, ou un worktree git du même dépôt.

### Quand les fichiers scellés changent

Si un fichier scellé diffère, un avis orange indique lequel, et les scores attendent que les fichiers soient rétablis :

- **Voir ce qui a changé** : chaque fichier est marqué Changed, Missing ou New file, avec ce qui y a changé.
- **Les rétablir** : écrit les copies scellées par-dessus, et indique ce qui n’a pas pu être rétabli et pourquoi (les fichiers ajoutés depuis restent en place).
- **Sceller à nouveau…** : accepte les fichiers dans leur état actuel. Les anciens scores ne sont plus comparés aux nouveaux (ils sont conservés, repliés sous **Avant le nouveau scellement**), et la référence doit être mesurée à nouveau. Changer la commande, le nombre ou les fichiers scellés avec **Modifier…** scelle aussi à nouveau.

### Le test final

**Exécuter le test final…** (sur sa case ou dans le menu de la page) indique la qualité réelle de votre travail sur des données qui n’ont servi à aucun réglage. Chaque consultation vous en apprend un peu moins : exécutez-le quand vous pensez avoir terminé. La fenêtre indique combien de fois il a été exécuté depuis le scellement. Quand il existe des worktrees git, elle demande aussi sur lequel l’exécuter (**Sur le contenu de**).

### Ce que les agents peuvent faire

Les agents peuvent lire les évaluations, demander le score de leur dossier (l’app exécute elle-même la commande scellée ; ils rapportent ce nombre, pas le leur), proposer une nouvelle évaluation (vous en voyez chaque partie sur une carte et elle n’est créée que si vous acceptez) et rétablir les fichiers scellés. Ils ne peuvent pas en créer ni en sceller eux-mêmes, définir la référence, ni exécuter ou lire le test final.

Les exécutions lancées dans le dossier d’une évaluation indiquent sur leur page si ses fichiers étaient conformes au scellement au moment du lancement, et un tableau des exécutions signale d’une marque orange celles où ils ne l’étaient pas. Une exécution qui a servi à calculer le score d’une évaluation renvoie vers celle-ci.

## Faire évoluer : chercher une meilleure version

La fonction Faire évoluer essaie de nombreuses petites modifications des fichiers que vous désignez, note chacune avec l’évaluation et garde la meilleure. Vos propres fichiers ne sont pas touchés : chaque modification est essayée dans une copie propre à l’app, créée à partir de votre dernier commit. Elle utilise le [modèle d’appoint](/guide/agents-models#choose-the-helper-model) de l’app pour écrire les modifications, en partant à chaque fois de l’une des meilleures versions trouvées jusque-là.

Elle vaut la peine pour un fichier dont l’évaluation peut bien mesurer la qualité : une heuristique, une fonction de score, un prompt, une routine lente. Ce n’est pas le cas quand l’évaluation est faible (peu d’exemples, un nombre facile à manipuler) : une recherche trouve les points faibles de ce qui la note. Prévoyez donc un [test final](#the-final-test) sur des données que la recherche ne voit jamais.

### En lancer une

Ouvrez la page de l’évaluation, cliquez sur ⋯ puis sur **Faire évoluer…**. La fenêtre demande :

- **Que peut-elle modifier ?** Saisissez un fichier et cliquez sur **Ajouter**, ou touchez ceux sous **Suggéré** : jusqu’à 8 fichiers texte inclus dans un commit et sans modification depuis. Un fichier protégé par l’évaluation ne peut pas être modifié : l’app vous le signale.
- **Que doit-elle essayer ?** (facultatif) : quelques lignes, par exemple « Rends le reranker plus rapide sans perdre de nDCG@10 ».
- **Combien d’essais** : 50, 100, 200, ou **Autre** pour choisir votre propre nombre (de 10 à 2 000).
- Sous **Plus** : **Arrêter au bout de (heures)**, **Combien à la fois** (de 1 à 4) et **Arrêter quand ce nombre d’essais d’affilée n’a rien apporté de mieux** (40 sauf si vous le modifiez).

Cliquez sur **Démarrer**. L’app note d’abord votre point de départ, avec toutes les graines de l’évaluation, puis commence. Une évaluation sans référence affiche **Mesurer la référence** à la place de **Démarrer**.

### Lire sa page

Sa ligne sous **Faire évoluer**, sur la page de l’évaluation, indique « En cours · 37 sur 200 essayés », « Terminé · 0.035 de mieux qu’au départ » ou « Arrêtées » ; cliquez dessus pour l’ouvrir. En haut figurent son but, son état (par exemple « Terminé : aucun nouveau meilleur résultat parmi les 40 derniers essais ») et **Pause** ou **Reprendre**, **Arrêter** (elle ne pourra plus être reprise ensuite) et ⋯ avec **Supprimer…** (ses essais, leurs scores et leurs copies de travail sont supprimés ; une branche que vous avez retenue reste). Viennent ensuite trois tuiles :

- **Départ** : le score de votre version.
- **Meilleur résultat jusqu’ici** : le meilleur score, son avance sur le point de départ, une ligne sur ce qu’il a modifié et **Voir la modification**.
- **Essayés** : combien d’essais sur combien, combien ont échoué et combien de fois un modèle a été sollicité.

Un graphique montre chaque essai dans l’ordre : un premier score rapide (**Première graine seulement**) apparaît plus clair qu’un score vérifié avec **Toutes les graines**, les essais échoués sont des marques en bas, le **Meilleur résultat jusqu’ici** est une ligne en escalier et le **Départ** une ligne en pointillés. Cliquez sur un point pour ouvrir l’essai correspondant.

**Ce qu’elle a essayé** les liste, du plus récent au plus ancien : ce que chacun a modifié, son score (ou la raison de son échec), sa position par rapport au point de départ, la version sur laquelle il était **Basé sur** et le **Modèle** qui l’a écrit (**Rapide**, ou de temps en temps **Puissant**). Un essai reçoit d’abord un score rapide, sur une graine ; seul celui qui bat le meilleur de sa lignée est vérifié avec toutes les graines, et seul ce score complet peut en faire le meilleur. **Nouveau meilleur résultat** signale ceux qui étaient les meilleurs au moment de leur notation, **Meilleur** le meilleur actuel. Ouvrez un essai pour voir sa modification, fichier par fichier, et **Retenir celui-ci**.

### Retenir la meilleure version

**Retenir la meilleure version** (comme **Retenir celui-ci**) demande d’abord confirmation, puis crée dans votre dépôt une branche contenant cette version : les fichiers de votre copie de travail actuelle ne sont pas touchés. La page conserve la mention « Retenu sous le nom <branch> », qui ouvre la branche sur la [page Git](/git). Retenir à nouveau ajoute un commit à la même branche.

Le test final n’a pas vu la version que vous avez retenue. Pour la vérifier avec lui, faites passer votre dossier sur la branche (ou créez-en un worktree git) et cliquez sur **Exécuter le test final…** sur la page de l’évaluation.

### Ce que cela coûte

Chaque essai exécute l’évaluation (une graine, puis toutes s’il est prometteur) et sollicite un modèle une fois, ou deux quand sa première réponse est inutilisable. Avec des GPU, ses exécutions attendent leur tour comme les autres. **Pause** interrompt les nouveaux essais, et **Arrêter au bout de (heures)** ainsi que la limite d’essais d’affilée sans amélioration évitent qu’elle continue pour rien.

Les agents peuvent en lancer une avec votre accord donné sur une carte, et suivre son déroulement. Ils ne peuvent pas en supprimer.

## Tableaux de résultats pour votre article

**Créer un tableau** (à partir d’exécutions cochées, du menu ⋯ d’une expérience ou de son onglet **Hyperparamètres**) affiche le tableau selon vos choix :

- **Colonnes** : les métriques. Cliquez sur l’une d’elles pour l’ajouter ou la retirer, et sur sa flèche pour changer le sens du meilleur.
- **Lignes** : **Une ligne par expérience**, ou une ligne par valeur d’un hyperparamètre qui diffère entre les exécutions (**Une ligne par valeur de lr**).
- **Référence** : la ligne par rapport à laquelle les autres sont testées (la première ligne, sauf si vous en choisissez une).
- **Test par rapport à la référence** : **Choisir pour moi** (apparié sur les exemples quand les exécutions ont conservé des scores par exemple, sinon apparié sur les graines quand les exécutions des lignes partagent leurs graines, sinon test t de Welch sur les graines), **Test t de Welch sur les graines**, **Test t apparié (par graine ou par exemple)**, **Bootstrap apparié sur les exemples** ou **Aucun test**.
- **Légende**.

Chaque cellule est la moyenne ± l’écart type sur les exécutions de la ligne (ses graines) ; la meilleure valeur de chaque colonne est en gras ; une dague (†) signale une cellule meilleure que la référence avec p < 0,05, après correction de Holm pour le test de plusieurs lignes, et une double dague (‡) une cellule moins bonne. Quand les graines changent à peine un nombre (il est identique, ou presque, pour toutes les graines) et que les exécutions n’ont pas conservé de scores par exemple, la comparaison ne reçoit aucune marque : une note sous le tableau indique qu’un test sur les graines n’apprend pas grand-chose, et qu’il vaut mieux comparer exemple par exemple. Survolez une cellule pour voir ses valeurs p. Une ligne sous le tableau indique quel test a été fait, et ce qui a été écarté (les exécutions non terminées, ou sans ces métriques).

Ensuite :

- **Copier le LaTeX** : un `table` avec les filets de booktabs (ajoutez `\usepackage{booktabs}` à votre préambule), la meilleure valeur en `\textbf`, `$\pm$`, les dagues et les doubles dagues, et une légende qui explique comment lire les cellules.
- **Copier le Markdown** et **Télécharger le CSV** (moyenne, écart type, nombre d’exécutions et valeurs p de chaque métrique).
- **Le placer dans un document LaTeX** : choisissez l’un de vos documents LaTeX (conservé dans les fichiers d’un projet, ou avec sa conversation), puis l’un de ses fichiers. Le tableau est placé avant `\end{document}` (ou à la fin d’un fichier qui n’en a pas), ou à la place du tableau qu’il y avait créé auparavant, en conservant votre propre légende et votre étiquette. Il est enregistré comme une nouvelle version du document, comme vos propres modifications.

Un tableau est conservé quand vous le copiez ou le placez dans un document. Son LaTeX porte une ligne `% hydor:table <id>` juste au-dessus de son tabular : laissez-la là, pour que la vérification avant votre soumission puisse recalculer les chiffres à partir des exécutions et dire lesquels ont changé. **Tableaux de résultats**, dans le menu (⋯) en haut de la page, liste les tableaux conservés : ouvrez-en un pour le copier ou le replacer, ou pour le **Recalculer** à partir de ses exécutions dans leur état actuel.

Pour les tests appariés sur des exemples (requêtes en recherche d’information, phrases en traduction), une exécution écrit un fichier de scores par exemple et l’indique sous **Scores par exemple** : des lignes JSON avec un `id` (ou `qid`, `query`, `example`) et un nombre par métrique, comme `{"id": "q12", "ndcg@10": 0.53}`, ou les lignes de trec_eval -q. Le chemin peut contenir des emplacements `{name}`, comme la commande (`{run}` est l’identifiant de l’exécution), et peut commencer par `$HYDOR_RUN_DIR/`, le dossier propre à l’exécution ; le fichier est conservé avec l’exécution quand elle se termine. Une exécution qui écrit `scores.jsonl` dans `$HYDOR_RUN_DIR` n’a pas du tout besoin de le nommer : les exécutions d’un balayage conservent ainsi chacune le leur.

## Balayages

Un balayage est une commande avec un paramètre pour chaque hyperparamètre, exécutée une fois pour chaque combinaison de leurs valeurs. Cliquez sur **Plus** (⋯) en haut, puis sur [**Nouveau balayage**](/experiments?new=sweep) (ou **Nouveau balayage dans cette expérience** dans le menu d’une expérience, ou **Un balayage** dans « Nouvelle exécution ») :

1. Saisissez la commande avec `{name}` à l’endroit où va la valeur de chaque hyperparamètre : `python train.py --lr {lr} --batch {batch}`.
2. Sous **Hyperparamètres et leurs valeurs**, donnez ses valeurs à chaque hyperparamètre : `lr` et `0.001, 0.0003, 0.0001`. **Ajouter un hyperparamètre** pour en ajouter un autre.
3. Choisissez **Toutes les combinaisons**, ou **Un échantillon aléatoire** d’entre elles (**au plus** N exécutions).
4. Pour arrêter les exécutions qui ne gagneront pas, définissez **Arrêter les exécutions plus tôt en cas de** une métrique et le sens du meilleur : une exécution dont la métrique à une étape est pire que la médiane des autres exécutions à cette étape est arrêtée (**Arrêtée en avance**), une fois que trois autres ont atteint cette étape.
5. Donnez un nom à son **Expérience**, puis cliquez sur **Lancer N exécutions**.

Les exécutions du balayage forment une expérience comme les autres : son tableau d’exécutions a une colonne pour chaque hyperparamètre, son onglet **Graphiques** dessine les courbes, et son onglet **Hyperparamètres** montre comment le balayage s’est déroulé : sa meilleure exécution (selon la métrique que vous choisissez, la meilleure ou la dernière valeur de chaque exécution), les hyperparamètres qui comptent le plus et chacun d’eux face à la métrique. De là, **Créer un tableau** ou **Comparer les 6 meilleures**. La notification qui annonce la fin d’un balayage ouvre cet onglet.

## Où vont les exécutions

**Plus** (⋯) en haut → [**Où vont les exécutions**](/experiments?places=1) :

- **Cet ordinateur** : ses GPU, et **Jobs without a GPU: at most N at once**.
- **Autres machines** : celles de [Paramètres → Machines](/settings?s=machines) qui sont connectées. Une exécution envoyée vers l’une d’elles y est conservée et surveillée : son agent d’astreinte et ses notifications sont ceux de cette machine (ses notifications vous parviennent ici, comme toutes celles de cette machine), et cette page la suit. La liste affichée ici montre aussi les exécutions de chaque machine connectée, avec l’endroit où elles tournent ; en ouvrir une la lit sur place, et **Arrêter** l’arrête sur place.
- **Clusters** : des ordinateurs auxquels vous accédez par SSH, sur lesquels il n’y a rien à installer.

### Ajouter un cluster

Cliquez sur [**Ajouter un cluster**](/experiments?cluster=new) et renseignez :

- **Nom**, et **Hôte SSH** : tel que vous le saisiriez après `ssh`, une entrée de votre `~/.ssh/config` ou `me@login.cluster.edu`. Le serveur de l’app se connecte avec ses propres clés SSH et ne demande jamais de mot de passe : il lui faut donc une clé qui fonctionne sans mot de passe sur place (`ssh-copy-id`), et la clé d’hôte du cluster doit être connue (connectez-vous une fois avec `ssh` depuis un terminal).
- **SLURM** ou **SSH simple**.
- **Dossier sur place pour les journaux des exécutions** (`~/hydor-runs` pour commencer) et, pour SLURM, sa **Partition** et son **Compte**.
- **Lignes de configuration**, exécutées avant chaque job sur place : `module load cuda/12.1`, `source ~/venvs/ml/bin/activate`.

**Vérifier** essaie `ssh host true`, puis `sinfo` (qui liste les partitions) pour SLURM, ou `nvidia-smi` et tmux pour le SSH simple. **Ajouter** le conserve ; dans la liste, chaque cluster a **Vérifier** et **Retirer**.

Un job destiné à un cluster s’exécute dans un dossier sur place (le code doit déjà s’y trouver : clonez-le là-bas). Avec **SLURM**, l’app écrit un script batch avec les besoins du job (ses GPU avec `--gres=gpu:N`, les processeurs, la mémoire, les heures avec `--time`, la partition et le compte), vos lignes de configuration et la commande, puis le soumet avec sbatch. Pendant qu’il attend, son statut en donne la raison, avec le terme de SLURM et en mots simples (« d’autres jobs passent avant (Priority) »). L’app le suit avec squeue et sacct, copie son journal ici au fur et à mesure qu’il grandit, et **Arrêter** l’annule avec scancel. Avec le **SSH simple**, les GPU sont choisis sur place comme ici, et l’exécution est lancée dans tmux sur place. Une connexion SSH par cluster reste ouverte, ce qui rend le suivi des exécutions très économe.

## Sur un téléphone

Il n’y a pas de colonne : la vue d’ensemble commence par la file d’attente, les GPU et **Rechercher une expérience**, puis liste les évaluations (quand vous en avez) et les expériences sous forme de cartes. Une expérience, une évaluation et une exécution s’ouvrent à sa place, avec une flèche de retour. Un tableau des exécutions défile horizontalement, la case à cocher et le nom de chaque exécution restant visibles ; les exécutions affichées sur les graphiques forment une rangée de pastilles au-dessus de ceux-ci, et **Lissage** se trouve dans le menu **Options du graphique**. Le journal d’une exécution revient à la ligne selon la largeur de l’écran, et **Suivre** fonctionne comme sur un ordinateur. La nouvelle exécution, la comparaison et les tableaux s’ouvrent depuis le bas de l’écran.

## Demander à un agent

- « Entraîne ça sur un GPU libre et préviens-moi quand c’est terminé. »
- « Exécute eval.py sur le cluster Unity avec 2 GPU pendant 4 heures. »
- « Balaie le taux d’apprentissage sur 1e-4, 3e-4 et 1e-3 avec les graines 1, 2 et 3, et arrête tôt les mauvaises exécutions. »
- « Pourquoi ma dernière exécution a-t-elle échoué ? Si la correction est évidente, relance-la. »
- « Mets un agent d’astreinte sur cet entraînement : s’il manque de mémoire, divise la taille de lot par deux et reprends au dernier point de contrôle. »
- « Fais un tableau LaTeX des expériences lora : exactitude et F1 par rapport à la référence, avec la significativité, et mets-le dans mon article. »
- « Parmi mes exécutions de cette semaine, laquelle a la meilleure perte de validation, et quels étaient ses hyperparamètres ? »
- « Essaie de mettre en défaut le résultat selon lequel la nouvelle fonction de perte bat la référence sur ndcg@10. »
- « Donne des titres et des descriptions plus clairs à mes expériences, et range-les par catégories. »
- « Dans mon balayage du taux d’apprentissage, quels hyperparamètres comptent le plus pour la perte de dev ? »
- « Montre-moi les courbes des 5 meilleures exécutions de l’expérience lora. »
- « Mets en place une évaluation pour ce dépôt. »
- « Calcule le score de ma branche par rapport à la référence. »
- « Pourquoi mon évaluation indique-t-elle que des fichiers ont changé ? »
- « Fais évoluer la fonction de score de rank.py par rapport à mon évaluation, en 100 essais. »
- « Où en est l’évolution ? »
