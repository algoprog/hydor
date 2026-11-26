# Fichiers, Git, Terminal et Aperçu

**Fichiers**, **Git** et **Système** dans la barre d’icônes sont votre accès à cet ordinateur : parcourir, trouver, ouvrir et modifier ses fichiers, les ajouter aux projets et aux nouvelles sessions, chercher dedans, exécuter des notebooks Jupyter, faire des commits et des push avec Git, ouvrir des pull requests et examiner ce qu’une branche modifie. Vous y trouvez aussi des terminaux, des aperçus des apps web qui tournent ici, des captures d’écran avant et après les modifications d’un agent, et une vue en direct de l’état de l’ordinateur (**Moniteur**), pour que vous puissiez vérifier et terminer le travail d’un agent sans quitter l’app.

![La page Git : les modifications d’un dépôt à côté du diff d’un fichier, la zone de commit et la synchronisation](images/files-git.webp)

## Ouvrir Système

Cliquez sur **Système** dans la barre d’icônes, ou allez à [Système](/system). Une rangée d’onglets sous son titre vous mène à chaque partie, et chacune a sa propre adresse :

- **Vue d’ensemble** ([l’ouvrir](/system)) : l’ordinateur en un coup d’œil, et ce que contiennent ses outils en ce moment (voir [La vue d’ensemble](#the-overview)).
- **Terminal** ([l’ouvrir](/terminal)) : les shells de cet ordinateur (voir [Utiliser le terminal](#use-the-terminal)).
- **Aperçu** ([l’ouvrir](/preview)) : les apps web qui tournent ici (voir [Examiner un serveur de développement avec Aperçu](#look-at-a-dev-server-with-preview)). Il n’apparaît que sur les pages de cette machine, pas quand vous regardez une autre machine.
- **Moniteur** ([l’ouvrir](/system/monitor)) : le niveau d’activité de l’ordinateur (voir [Surveiller cet ordinateur dans Moniteur](#watch-this-computer-in-monitor)).

Sur un téléphone, le titre nomme la partie où vous êtes (**Système / Moniteur**) : touchez-le pour afficher toutes les parties de Système, quatre par rangée, puis touchez-en une pour y aller. Les boutons propres à un onglet (comme l’actualisation pour Aperçu) se trouvent à droite du titre.

**Fichiers** et **Git** ne font pas partie de Système : chacun a sa propre icône dans la barre d’icônes (sur un téléphone, parmi les outils du tiroir). Cliquez dessus, ou allez à [Fichiers](/files) (voir [Ouvrir la page Fichiers](#open-the-files-page)) ou à [Git](/git) (voir [Voir vos dépôts dans la page Git](#see-your-repositories-on-the-git-page)). Expériences a aussi sa propre icône (voir [Expériences](/guide/experiments)).

## La vue d’ensemble

**Vue d’ensemble** affiche en haut le nom de l’ordinateur, son système et la durée depuis laquelle il est allumé, avec quatre jauges : **Processeur**, **Mémoire**, **Disque** (le disque principal, avec son espace libre) et **Carte graphique** (quand il a des cartes graphiques NVIDIA). Une jauge devient rouge quand elle approche du plein. Cliquez dessus pour ouvrir **Moniteur**.

Plus bas, une carte par outil ; son titre, ou **Ouvrir**, ouvre son onglet :

- **Terminal** : les shells en cours, et **Nouveau** pour en ouvrir un autre.
- **Aperçu** : les apps web qui tournent ici, chacune avec son port. Cliquez sur l’une d’elles pour la regarder.

## Ouvrir la page Fichiers

Cliquez sur **Fichiers** dans la barre d’icônes, ou allez à [Fichiers](/files). Sur un ordinateur, la page comporte deux parties :

- À gauche, les **endroits** : les fichiers ouverts récemment, votre dossier personnel, les dossiers épinglés, les dossiers de vos projets, les dossiers où des sessions ont travaillé, et la corbeille (voir [Emplacements](/guide/files-git#places)).
- À droite, le dossier où vous êtes, avec son contenu (voir [Parcourir un dossier](/guide/files-git#browse-a-folder)). Les fichiers que vous ouvrez s’y affichent aussi, chacun dans un onglet : le premier onglet ramène au dossier.

Dans une petite fenêtre, les endroits se replient en un bouton à droite du titre : il porte le nom du dossier où vous êtes, et un clic dessus affiche la liste des endroits.

Sur un téléphone, le dossier remplit l’écran. Son nom, en haut à droite, ouvre les endroits depuis le bas de l’écran ; **‹** avec le nom du dossier parent, sous le titre, remonte d’un dossier, et le bouton Retour de votre téléphone ramène au dossier où vous étiez avant. Un fichier s’ouvre sur une page à part, avec **Retour**.

Autres façons d’y accéder :

- Cliquez sur le dossier sous le titre d’une session, ou utilisez le menu de la session (⋯) → **Dossier et code** → **Parcourir le dossier** : Fichiers s’ouvre sur ce dossier.
- Un fichier modifié par un agent ou qu’il vous a remis, ou un lien vers un fichier dans sa réponse, s’ouvre dans une fenêtre au-dessus de la conversation, ce qui vous permet de garder votre place. **Ouvrir dans Fichiers** le déplace vers la page Fichiers ; **Plein écran** (l’icône des flèches) étend la fenêtre à toute l’app, et **Quitter le plein écran** la ramène à sa taille (le fichier suivant s’ouvre comme vous avez laissé le dernier, dans ce navigateur) ; ✕ ou Échap ferme la fenêtre (si vous avez modifié le fichier sans l’enregistrer, elle demande d’abord « Abandonner vos modifications ? »). Le chemin du fichier s’affiche au-dessus, comme sur la page Fichiers ; un dossier qui s’y trouve s’ouvre dans la même fenêtre, avec le fichier sélectionné (elle demande d’abord ce qu’il en est des modifications non enregistrées), et **‹** en haut de la fenêtre ramène au fichier. Voir [Les documents qu’il a créés ou modifiés](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply).
- L’onglet **Fichiers** d’un projet affiche les dossiers propres au projet (voir [Projets et connaissances](/guide/projects)).

## Emplacements

- **Aller à un dossier** : trouvez un dossier par son nom, ou saisissez son chemin (`~/code/shop`) ; les projets et les dossiers épinglés viennent en premier. La touche Tab, ou la flèche au bout d’une ligne, liste les dossiers qu’il contient.
- **Fichiers récents** : les fichiers ouverts récemment dans ce navigateur, le plus récent en premier, chacun avec son dossier. Ceux qui n’existent plus le signalent ; **Effacer ceux qui n’existent plus** les retire de la liste.
- **Dossier personnel** : votre propre dossier, où se trouvent vos fichiers. Le dossier dans lequel démarrent les nouvelles sessions s’affiche en dessous quand ce n’est pas votre dossier personnel.
- **Épinglées** : les dossiers que vous avez épinglés, les mêmes sur tous vos appareils. Pour en épingler un, utilisez son menu ou le ⋯ du dossier → **Épingler aux Emplacements** ; pour le désépingler, pointez-le et cliquez sur ✕, ou utilisez **Désépingler des Emplacements**.
- **Projets** : le dossier propre à chaque projet.
- **Sessions travaillées dans** : les dossiers où des sessions ont travaillé récemment.
- **Corbeille** : ce que vous avez supprimé (voir [Supprimer et remettre en place](/guide/files-git#delete-and-put-back)).

Sur un ordinateur, déposez des fichiers ou des lignes sur un dossier parmi les endroits pour les y placer.

## Parcourir un dossier

La barre au-dessus du dossier contient, en partant de la gauche :

- **Le dossier parent** (la flèche vers le haut).
- Le chemin du dossier, étape par étape : une maison pour votre dossier personnel, puis **code › shop** ; un dossier situé hors de votre dossier personnel part de **Ordinateur** (`/`). Cliquez sur une étape pour y aller, ou déposez des lignes dessus pour les y déplacer. Un chemin long replie son milieu en **…**, qui liste les dossiers intermédiaires. La dernière étape, ou la petite flèche à côté, ouvre **Aller à un dossier**.
- **Rechercher dans** *le dossier* : réduit la liste aux noms qui contiennent ce que vous saisissez, au fur et à mesure. Entrée, ou la ligne **Rechercher partout dans … « … », y compris dans les fichiers** en haut de la liste, lance la recherche dans tous les dossiers situés sous celui-ci, dans les noms de fichiers et dans leur contenu (voir [Rechercher des fichiers](/guide/files-git#search-files)).
- **Importer** : importe des fichiers dans le dossier où vous êtes (voir [Importer des fichiers et des dossiers](#upload-files-and-folders)). Sa flèche (**Autres façons de téléverser**) propose **Importer des fichiers** et **Importer un dossier**.
- **Nouveau** : **Nouveau dossier**, **Nouveau fichier**, **Nouveau notebook**, **Importer des fichiers** et **Importer un dossier**. Dans l’onglet **Fichiers** d’un projet, il crée aussi ce que l’app crée, dans le projet (voir [Fichiers](/guide/projects#files)).
- **En liste** ou **En vignettes, avec images** : le commutateur entre les deux façons d’afficher un dossier. Les dossiers s’affichent d’abord en vignettes, jusqu’à ce que vous choisissiez vous-même la liste ; le navigateur retient votre choix.
- **Plus** (⋯) : **Trier par** (**Nom**, **Date de modification**, **Taille** ou **Type**, et **Dans l’autre sens**), **Afficher les fichiers masqués**, **Épingler aux Emplacements**, **Nouvelle session dans ce dossier**, **Ouvrir un terminal ici**, **Copier le chemin**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau ; voir [Travailler avec des fichiers et des dossiers](/guide/files-git#work-with-files-and-folders)), **Télécharger en .zip** et **Actualiser**.

Les **vignettes** sont la façon dont les dossiers s’affichent au départ. Chaque vignette montre en haut une image du fichier (en 4:3), un petit badge indiquant son type pour les documents et assimilés (PDF, Word, Sheet, CSV, Slides, Notebook, LaTeX, HTML, Markdown, JSON, E-book, Archive, SVG, GIF, Video, Audio), son nom et la date de sa modification (« Modifié il y a 2 h »), ainsi qu’un ⋯ qui apparaît quand vous la pointez. Un dossier est une vignette de dossier. L’image est :

- pour les images, l’image elle-même ; pour les vidéos, une image extraite de la vidéo ;
- pour les PDF, la première page ; pour les fichiers Word, PowerPoint, Excel et OpenDocument, leur première page, diapositive ou cellules (ou l’image que porte le fichier) ;
- pour les fichiers HTML et les notebooks Jupyter, leur aspect une fois ouverts ;
- pour les fichiers texte, Markdown, code, CSV et JSON, leurs premières lignes sur une vignette qui ressemble à du papier ;
- pour tout le reste, l’icône de son type.

L’app dessine ces images sur cet ordinateur avec ce dont elle dispose : ffmpeg pour les vidéos et les images, poppler pour les PDF, son propre navigateur pour les documents et les pages, et Quick Look sur un Mac. Un fichier qu’elle ne peut pas dessiner (un type qu’elle ne connaît pas, aucun outil disponible ici, un fichier trop gros, ou un échec) affiche l’icône de son type, ou ses premières lignes. Les images sont conservées 30 jours dans le dossier de données de l’app, si bien qu’un dossier où vous revenez les affiche aussitôt ; un fichier modifié reçoit une nouvelle image.

**La liste** place les dossiers en premier. Dans la liste, les images affichent une petite miniature à la place de leur icône. Pour chaque élément, elle indique son nom, la date de sa modification (« à l’instant », « il y a 5 min », l’heure pour aujourd’hui, « Hier », ou la date) et sa taille. Cliquez sur le titre d’une colonne pour trier selon elle, et de nouveau pour inverser l’ordre. Dans une fenêtre étroite, la barre range le champ derrière un bouton de recherche, et **En liste** et **En vignettes, avec images** passent sous **Plus** ; les colonnes de date et de taille s’effacent au profit des noms.

- Cliquez sur un dossier pour y entrer, ou sur sa flèche pour l’ouvrir sur place, comme dans une arborescence ; le dossier se souvient de ceux de ses sous-dossiers qui étaient ouverts.
- Cliquez sur un fichier pour l’ouvrir.
- La ligne du bas compte les dossiers et les fichiers et additionne leur taille.
- La liste s’actualise toutes les 5 secondes pendant que vous la regardez, si bien que les fichiers créés par les agents apparaissent d’eux-mêmes.

Sur un téléphone, chaque ligne affiche la taille et la date sous le nom ; le bouton de recherche ouvre le champ, **Plus** contient aussi **En liste**, **En vignettes, avec images** et **En choisir plusieurs**, et le bouton **+** en bas à droite permet d’ajouter un dossier, un fichier ou d’importer.

Chaque dossier a sa propre adresse, si bien que le bouton Retour du navigateur ramène au dossier où vous étiez. Le dossier affiché est aussi celui que les autres parties de l’app désignent par « le dossier ouvert dans Fichiers ». Il est conservé dans ce navigateur, séparément pour chaque machine que vous utilisez (voir [Autres machines](/guide/devices#use-other-machines-from-one-app)).

### Ce que signifient les lettres à côté des fichiers

Dans un dépôt git (un dossier dont git garde l’historique), les fichiers modifiés depuis le dernier commit portent une lettre et une couleur :

- **M** : modifié.
- **A** : nouveau, et déjà ajouté à git.
- **U** : nouveau, et pas encore dans git.
- **D** : supprimé.
- **R** : renommé.
- **C** : un conflit à résoudre.
- **•** sur un dossier : quelque chose a changé à l’intérieur.

## Travailler avec les fichiers et les dossiers

Chaque ligne a un menu. Pointez la ligne et cliquez sur **Plus** (⋯) à son extrémité, ou faites un clic droit ; sur un téléphone, appuyez sur son ⋯. Il contient :

- **Ouvrir**.
- **Modifier l’image** ou **Modifier la vidéo** (une image ou une vidéo) : le fichier s’ouvre dans l’éditeur d’images ou de vidéos, où **Enregistrer** écrase le fichier (son ancienne version va dans la Corbeille) et **Enregistrer une copie** ajoute « nom (edited) » à côté (voir [Modifier des images et des vidéos](/guide/library#edit-pictures-and-videos)).
- **Démarrer une session avec ce fichier** (un fichier ; voir [Démarrer une session avec des fichiers](/guide/files-git#start-a-session-with-files)), ou **Nouvelle session dans ce dossier** (un dossier : la page de démarrage s’ouvre, avec ce dossier choisi).
- **Ajouter à un projet** (voir [Ajouter des fichiers à un projet](/guide/files-git#add-files-to-a-project)).
- **Épingler aux Emplacements** ou **Désépingler des Emplacements** (un dossier).
- **Renommer** (F2), **Dupliquer**, **Déplacer vers** et **Copier vers**.
- **Ouvrir un terminal ici** (un dossier) : un nouveau shell dans ce dossier, dans le panneau du bas sur un ordinateur ou sur la page Terminal sur un téléphone.
- **Copier le chemin** : le chemin complet, à coller où vous voulez.
- **Afficher dans le Finder** (Mac), **Afficher dans l’Explorateur de fichiers** (Windows) ou **Afficher dans le dossier** (Linux) : dans l’app de bureau, pour un fichier ou un dossier de cet ordinateur, ouvre le gestionnaire de fichiers du système avec l’élément sélectionné. Son nom indique celui de votre système. Cette option n’existe pas dans l’app web, ni pour les fichiers d’une autre machine.
- **Télécharger**, ou **Télécharger en .zip** pour un dossier.
- **Supprimer** (la touche Suppr).

### En choisir plusieurs

Pour agir sur plusieurs éléments à la fois, sélectionnez-les :

- Sur un ordinateur, cliquez sur la case au début d’une ligne (elle apparaît quand vous pointez la ligne), faites Ctrl+clic (⌘+clic sur un Mac) pour en ajouter une, Maj+clic pour tout sélectionner depuis la dernière ligne choisie, ou appuyez sur Ctrl+A pour tout sélectionner.
- Sur un téléphone, appuyez longuement sur une ligne, puis touchez les autres ; ou **Plus** → **En choisir plusieurs**.

La barre indique alors combien d’éléments sont sélectionnés, avec **Démarrer une session**, **Ajouter à un projet**, **Déplacer vers**, **Supprimer**, et **Plus** (⋯) pour le reste du menu : **Copier vers**, **Copier les chemins**, **Télécharger en .zip**, etc. ✕ (ou Échap) désélectionne tout.

### Utiliser le clavier

Quand la liste est active (cliquez d’abord dessus), sur un ordinateur :

| Touches | Effet |
| --- | --- |
| ↑ ↓ | Aller à la ligne du dessus ou du dessous (Maj sélectionne au passage) |
| → ← | Ouvrir ou fermer un dossier sur place ; en mosaïque, la vignette voisine |
| Entrée | Ouvrir |
| Espace | Sélectionner ou désélectionner |
| Retour arrière | Le dossier parent |
| Suppr | Supprimer |
| F2 | Renommer |
| Ctrl+A | Tout sélectionner |
| Échap | Tout désélectionner, puis vider le champ |

Taper une lettre lance **Find in** avec cette lettre.

### Créer un fichier ou un dossier

1. Cliquez sur **Nouveau** → **Nouveau dossier**, **Nouveau fichier** ou **Nouveau notebook** (sur un téléphone, le bouton **+**).
2. Saisissez le nom dans le champ qui apparaît dans la liste et appuyez sur Entrée. Échap annule.

Un nouveau fichier est vide et s’ouvre aussitôt dans l’éditeur. Un nouveau notebook s’appelle `Untitled.ipynb` (`Untitled 2.ipynb` si ce nom est pris) tant que vous ne saisissez pas un autre nom ; il commence par une cellule de code vide et s’ouvre comme un notebook. Un nouveau fichier dont le nom se termine par `.ipynb` démarre lui aussi comme un notebook vide. Si le nom est déjà pris, l’app vous le dit et ne crée rien.

### Renommer ou déplacer

- **Renommer** transforme le nom en champ de saisie. Entrée conserve le nouveau nom, Échap le laisse tel qu’il était.
- **Déplacer vers** liste d’abord vos projets et vos dossiers épinglés, puis les dossiers utilisés récemment, avec un champ pour trouver n’importe quel dossier par son nom ou saisir son chemin. Choisissez-en un, et le fichier ou le dossier s’y déplace. Un message indique où il est allé, avec **Annuler**.
- Sur un ordinateur, faites glisser des lignes sur un dossier (dans la liste, sur une étape du chemin ou parmi les emplacements) pour les y déplacer ; les fichiers sélectionnés ensemble se déplacent ensemble. Maintenez Alt (Option sur un Mac) en les déposant pour les copier à la place.

Un dossier ne peut pas être placé dans lui-même, et un déplacement ne remplace rien : si la destination contient déjà un élément portant ce nom, le déplacement s’arrête.

### Dupliquer et copier

- **Dupliquer** crée une copie à côté de l’original, dont le nom est suivi de « copy » (`report copy.pdf`, puis `report copy 2.pdf`).
- **Copier vers** copie dans un autre dossier, choisi comme pour **Déplacer vers**. Si le nom est déjà pris à cet endroit, la copie est nommée de la même façon. **Afficher** dans le message ouvre ce dossier.

### Supprimer et remettre

**Supprimer** place aussitôt le fichier, ou le dossier avec tout son contenu, dans la corbeille, et un message l’indique avec **Annuler**. Rien n’est perdu tant que vous ne videz pas la corbeille.

**Corbeille**, parmi les emplacements, liste ce que vous avez supprimé, le plus récent en premier : chaque élément avec son emplacement d’origine, le moment de sa suppression et sa taille.

- **Remettre** le replace là où il se trouvait. Si autre chose a pris sa place entre-temps, il revient à côté avec « copy » après son nom. Les éléments supprimés avant que l’app ne conserve leur origine demandent plutôt un dossier.
- Son menu **Plus** (⋯) propose **Le mettre dans un autre dossier** et **Supprimer définitivement**.
- **Vider la corbeille** supprime définitivement tout son contenu, une fois que vous avez confirmé.

La corbeille est un dossier situé dans le dossier de données de l’app (par exemple `~/.hydor/trash`) ; sa page indique où. Votre dossier personnel et le dossier racine (`/`) ne peuvent pas être supprimés. Un élément situé sur un autre disque que le dossier de données de l’app ne peut pas aller dans la corbeille : l’app demande d’abord « Supprimer … définitivement ? ».

### Télécharger

Un fichier se télécharge tel quel. Un dossier, ou plusieurs éléments sélectionnés ensemble, se téléchargent sous la forme d’un seul fichier .zip, créé pendant le téléchargement. Un .zip exclut les dossiers `.git` et `node_modules`, et peut contenir jusqu’à 4 Go et 65 000 fichiers.

## Ajouter des fichiers à un projet

Un projet conserve ses fichiers dans son dossier, et peut aussi travailler avec d’autres de vos dossiers là où ils se trouvent (voir [Projets et connaissances](/guide/projects)). Pour en ajouter :

1. Ouvrez le menu d’un fichier ou d’un dossier (ou sélectionnez-en plusieurs), puis cliquez sur **Ajouter à un projet**.
2. Choisissez le projet, ou **Nouveau projet** pour en créer un d’abord pour eux.

Un fichier est copié dans le dossier du projet. Un dossier n’est pas copié : il rejoint les dossiers avec lesquels le projet travaille, là où il se trouve. Un message indique ce qui a été ajouté, avec **Afficher**, qui ouvre l’onglet **Fichiers** du projet. Ce qui se trouve déjà dans le projet reste tel quel.

**Ajouter à un projet** figure aussi dans **Plus** (⋯) d’un fichier dans l’éditeur, dans la fenêtre où un fichier s’ouvre au-dessus d’une session, sur les cartes des fichiers qu’un agent vous a remis, et sur les images créées par un agent.

Les sessions que vous démarrez dans le projet y retrouvent ensuite les fichiers : chacune est informée de ce que contient le dossier du projet et des autres dossiers avec lesquels il travaille.

## Démarrer une session avec des fichiers

Pour qu’une nouvelle session démarre avec des fichiers :

1. Ouvrez le menu d’un fichier (ou sélectionnez-en plusieurs) et cliquez sur **Démarrer une session avec ce fichier** (ou sur **Démarrer une session**, dans la barre des éléments sélectionnés).
2. La page de démarrage s’ouvre avec les fichiers dans la zone de message, chacun marqué « sur cet ordinateur ». Retirez-en un avec son ✕, ajoutez des fichiers de votre appareil avec le trombone, choisissez l’agent et le dossier comme d’habitude.
3. Saisissez ce qu’il faut en faire et appuyez sur **Début**.

Rien n’est téléversé : le message désigne chaque fichier par son chemin, si bien que l’agent l’ouvre là où il se trouve, et les images (PNG, JPEG, GIF et WebP jusqu’à 5 Mo) sont aussi envoyées au modèle pour qu’il les regarde. Jusqu’à 20 fichiers peuvent accompagner un message.

Pour un dossier, **Nouvelle session dans ce dossier** ouvre la page de démarrage avec la session configurée pour travailler dedans.

**Démarrer une session avec ce fichier** figure aussi dans **Plus** (⋯) d’un fichier dans l’éditeur, dans la fenêtre où un fichier s’ouvre au-dessus d’une session, sur les cartes des fichiers qu’un agent vous a remis, et sur les images créées par un agent.

## Importer des fichiers et des dossiers

- **Importer** dans la barre importe des fichiers dans le dossier où vous vous trouvez ; sa flèche (**Autres façons de téléverser**) et **Nouveau** proposent **Importer des fichiers** et **Importer un dossier**. Sur un téléphone, le bouton **+** → **Importer des fichiers** permet de choisir des fichiers ou des photos du téléphone.
- Sur un ordinateur, faites glisser des fichiers ou des dossiers entiers depuis votre bureau sur le dossier, sur un dossier qu’il contient, ou sur un emplacement (« Drop files here to upload them »). Les dossiers vides sont aussi importés.

Les imports s’affichent dans le panneau **Imports** en bas à droite : la quantité déjà envoyée, fichier par fichier. **Annuler** en arrête un, et ✕ retire du panneau un import terminé. Les gros fichiers sont envoyés par blocs de 32 Mo.

Avant tout envoi, l’app vérifie s’il existe des fichiers portant les mêmes noms dans ce dossier. Si certains existent, le panneau les liste (« 3 already exist ») avec trois choix :

- **Remplacer** : les envoyer par-dessus les fichiers existants.
- **Ignorer les existants** : n’envoyer que les nouveaux.
- **Annuler** : ne rien envoyer.

## Ouvrir et modifier un fichier

Cliquez sur un fichier dans le dossier. Il s’ouvre dans l’éditeur, dans son propre onglet. Le premier onglet ramène au dossier (ou à la recherche, aux fichiers récents ou à la corbeille) d’où vous l’avez ouvert. Les 12 derniers fichiers ouverts restent sous forme d’onglets : cliquez sur l’un d’eux pour y revenir, et fermez-le avec son ✕ ou d’un clic central. **Fichiers récents**, parmi les emplacements, liste ceux que vous avez ouverts récemment.

Au-dessus du fichier s’affiche son chemin : une maison pour votre dossier personnel (ou **Ordinateur**, pour un fichier situé en dehors), puis les dossiers, puis le nom du fichier. Chaque dossier mène à ce dossier dans la page Fichiers, avec l’étape suivante du chemin sélectionnée ; « … » liste les dossiers intermédiaires quand le chemin est long (**Les dossiers intermédiaires**) ; le nom du fichier l’affiche dans son dossier, sélectionné (**Afficher dans son dossier**). Sur un téléphone, la ligne du dossier sous le nom du fichier ouvre **Aller à un dossier** : chaque dossier du chemin, puis **Afficher dans son dossier**. Le même chemin s’affiche au-dessus des fichiers dans les éditeurs de [fichiers Word, Excel, CSV et LaTeX](#edit-word-excel-csv-and-latex-files).

L’éditeur numérote les lignes, colore le texte selon le langage du fichier, repère les parenthèses et crochets associés et, sur un ordinateur, replie les blocs et suggère des complétions pendant la saisie. La touche Tab indente.

Pour enregistrer, cliquez sur **Enregistrer** (le bouton s’allume dès que vous modifiez quelque chose) ou appuyez sur Ctrl+S (⌘S sur un Mac). Un point à côté du nom du fichier signale des modifications non enregistrées. L’app les conserve tant qu’elle est ouverte : passez à l’onglet d’un autre fichier puis revenez, et le fichier est tel que vous l’avez laissé, avec son historique d’annulation, son curseur et sa position. Un point sur l’onglet du fichier indique des modifications non enregistrées ; fermer un tel onglet (avec son ✕ ou d’un clic central), ou quitter le fichier avec **Retour** sur un téléphone, affiche **Enregistrer les modifications ?** : **Enregistrer**, **Ne pas enregistrer** ou **Annuler**. Recharger ou fermer la page fait perdre ce qui n’est pas enregistré, et le navigateur demande d’abord confirmation. Un fichier dont les lignes se terminent à la manière de Windows (CRLF) est enregistré de la même façon, sans être converti à l’autre convention.

### Les outils de l’éditeur

Sur un ordinateur, la barre au-dessus du fichier affiche son chemin et ces boutons :

- **Aperçu** (fichiers Markdown) : le fichier tel qu’il se lit, avec ses titres, ses tableaux, ses propres images (situées à côté du fichier) et ses liens vers d’autres fichiers. Cliquez à nouveau pour modifier. Les fichiers Markdown s’ouvrent d’abord en aperçu.
- **Afficher comme une page** (fichiers HTML) : exécute la page dans un cadre isolé de l’app, capable de charger les fichiers situés à côté. Les fichiers HTML s’ouvrent d’abord comme une page. Le lien de la page dure une heure ; passé ce délai, rouvrez le fichier.
- **Modifications depuis le dernier commit** : les différences du fichier par rapport à son dernier commit, lignes ajoutées en vert et lignes supprimées en rouge. Le message « Aucune modification » s’affiche quand le fichier correspond à son dernier commit ou ne se trouve pas dans un dépôt Git. Passer à **Aperçu** ou à **Modifications** puis revenir laisse le texte tel qu’il était, avec son historique d’annulation, son curseur et sa position.
- **Retour à la ligne automatique** : replie les longues lignes au lieu de faire défiler l’écran sur le côté. Votre choix est mémorisé.
- **Demander** : demande à un agent de modifier le fichier, ou de répondre à une question à son sujet ([ci-dessous](#ask-an-agent-about-the-file)).
- **Terminal dans ce dossier** : un nouveau shell dans le dossier du fichier.
- **Télécharger**.
- **Plus** (⋯) : **Trouver**, **Remplacer**, **Aller à la ligne**, **Poser une question sur la sélection** et **Raccourcis clavier**, puis **Démarrer une session avec ce fichier**, **Ajouter à un projet**, **Afficher dans son dossier**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau) et **Copier le chemin**.
- **Enregistrer**.

Pour chercher du texte dans le fichier, appuyez sur Ctrl+F (⌘F sur un Mac) pendant que le curseur s’y trouve : une barre de recherche s’ouvre en haut, avec le remplacement (Ctrl+H, ou ⌘⌥F sur un Mac). Ctrl+G (⌘⌥G sur un Mac) permet d’aller à une ligne.

Faites un clic droit dans le texte (ou appuyez sur la touche menu ou sur Maj+F10 pour afficher le menu au niveau du curseur) pour accéder à **Couper**, **Copier**, **Coller**, **Tout sélectionner**, **Trouver**, **Remplacer**, **Aller à la ligne** et **Poser une question sur la sélection**, qui ouvre [Demander](#ask-an-agent-about-the-file) avec les lignes sélectionnées citées. **Plus** → **Raccourcis clavier** liste toutes les touches.

La bande sous le texte indique la position du curseur (**Lg 12, Col 5**, avec le nombre de caractères sélectionnés ; cliquez dessus pour aller à une ligne), le langage du fichier, son indentation (**Espaces : 2**, **Espaces : 4**, **Onglets** : lue dans le fichier ; cliquez pour en choisir une autre pour ce que vous saisirez ensuite), **LF** ou **CRLF** (la façon dont les lignes du fichier se terminent ; cliquez pour l’enregistrer avec l’autre) et **Retour à la ligne** ou **Sans retour à la ligne** (cliquez pour basculer).

Sur un téléphone, la barre affiche **Retour**, le nom du fichier au-dessus de son dossier, **Aperçu** ou **Afficher comme une page**, **Demander à un agent** (✨), **Enregistrer** (dès que vous modifiez quelque chose) et **Plus** (⋯), qui contient **Trouver**, **Aller à la ligne**, **Poser une question sur la sélection**, **Retour à la ligne automatique**, **Modifications depuis le dernier commit**, **Terminal dans ce dossier**, **Télécharger**, **Démarrer une session avec ce fichier**, **Ajouter à un projet**, **Afficher dans son dossier**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau) et **Copier le chemin**. Les téléphones replient les longues lignes, sauf si vous désactivez **Retour à la ligne automatique**.

### Interroger un agent sur le fichier

Cliquez sur **Demander** dans la barre de l’éditeur (✨ sur un téléphone) et dites ce qui doit changer (« Trouve et corrige les bugs », « Ajoute un résumé en haut »), ou posez une question sur le fichier. Le panneau s’ouvre à côté du fichier (par-dessus sur un écran étroit), avec des exemples pour démarrer, et affiche l’agent et le modèle que vous avez choisis en dernier sur la page de démarrage.

- Les modifications non enregistrées sont d’abord enregistrées, afin que l’agent travaille dessus.
- L’agent démarre dans le dossier du fichier, sait de quel fichier vous parlez et modifie lui-même ce fichier. Vous voyez chaque modification arriver dans l’éditeur dès qu’elle est écrite, les lignes modifiées étant teintées un instant, sans que votre position dans le fichier change.
- La conversation se poursuit dans le panneau : répondez pour demander autre chose. **Une nouvelle demande** repart de zéro, et **Ouvrir comme session** l’ouvre en entier ; elle figure aussi dans vos sessions. Sur un téléphone, **Voir le fichier** replie le panneau pour regarder le fichier, et la barre en bas le rouvre.
- Le panneau reste ouvert quand vous passez d’un onglet de fichier à l’autre, chacun avec sa propre conversation. Il fonctionne de la même façon dans les éditeurs Word, Excel, CSV et LaTeX, et dans les notebooks, où l’agent modifie les cellules et conserve les sorties des autres. Sur un PDF, l’agent le lit et répond, et vous pouvez l’interroger sur un passage, une équation ou une figure que vous y avez sélectionnés ([Poser une question sur une partie d’un PDF](#ask-about-a-part-of-a-pdf)). Comme pour [une demande faite depuis un éditeur](/guide/library#change-it-by-asking-an-agent), le modèle mémorisé de l’agent et ses autorisations restent inchangés.

### Quand le fichier change alors que vous l’avez ouvert

Les agents et les terminaux modifient les fichiers en permanence. Toutes les quelques secondes (chaque seconde pendant qu’un agent travaille), l’éditeur vérifie le fichier :

- Si rien n’est en attente d’enregistrement, il intègre lui-même la nouvelle version, là où vous lisez : seules les lignes modifiées changent, teintées un instant.
- Si vous avez des modifications non enregistrées, une barre indique « Le fichier a changé sur le disque depuis que vous l’avez ouvert. » Choisissez **Recharger (abandonner ma version)** pour prendre la nouvelle version, ou **Écraser avec ma version** pour enregistrer la vôtre par-dessus.

L’enregistrement n’écrase jamais une version plus récente sans cette question.

### Les fichiers que l’éditeur ne modifie pas

- Fichiers de plus de 10 Mo : « Fichier trop volumineux pour être modifié ici ». Téléchargez-le, ou ouvrez-le dans un terminal. (Les notebooks peuvent atteindre 40 Mo.)
- Fichiers binaires (tout ce qui n’est pas du texte) : « Fichier binaire ». Téléchargez-le pour l’ouvrir sur votre appareil.
- Les fichiers Word, Excel, CSV et LaTeX s’ouvrent dans leurs propres éditeurs (section suivante) ; les images, les PDF, les vidéos, les fichiers audio et les autres documents Office s’affichent sous forme d’aperçus (celle d’après).

## Modifier des fichiers Word, Excel, CSV et LaTeX

Ces fichiers s’ouvrent dans les éditeurs de l’app qui leur correspondent (l’[éditeur de documents](/guide/library#documents) et ses semblables), et l’enregistrement réécrit le même fichier, dans son propre format :

- Les **documents Word** (.docx) s’ouvrent dans l’éditeur de documents, comme dans Word ou Google Docs, sur une feuille à leur format de papier.
- Les **fichiers Excel** (.xlsx), **CSV** et **TSV** s’ouvrent dans l’éditeur de feuilles de calcul, avec leurs feuilles et leurs formules qui fonctionnent (ainsi que les filtres, la mise en forme conditionnelle, les listes déroulantes et cases à cocher, les cellules fusionnées, les notes et les graphiques d’un fichier Excel).
- Les **fichiers LaTeX** (.tex) s’ouvrent dans l’éditeur LaTeX, avec la source à côté de ses pages composées. Les fichiers que le document lit (les chapitres qu’il inclut avec `\input`, sa bibliographie) s’ouvrent avec lui, et il est composé parmi le reste de son dossier (ses images, ses styles et ses données), que TeX lit mais ne modifie jamais. Un chapitre ouvre le document auquel il appartient (celui qu’il désigne avec `% !TEX root = …` ou comme document principal d’un sous-fichier, sinon celui de son dossier, ou d’un ou deux dossiers au-dessus, qui le lit), avec le chapitre ouvert et les fichiers du document dans l’[arborescence des fichiers](/guide/library#the-files-tree) : les fichiers qu’il lit, dans leurs dossiers, et, en grisé, ce que TeX prend dans le dossier tel quel (ses images, styles et classes, données), à consulter ; modifiez-les dans Fichiers. Sur un écran étroit, **Fichiers** au-dessus de la source ouvre l’arborescence. Les commentaires fonctionnent comme dans les [documents LaTeX](/guide/library#latex-documents) : un fichier ne conserve que son texte, donc l’app garde ses commentaires à côté, d’après le chemin du fichier, enregistrés avec **Enregistrer** ; ils suivent quand vous renommez ou déplacez le fichier (ou son dossier) ici, et un agent [interrogé sur le fichier](#ask-an-agent-about-the-file) les lit, y répond et les résout, ses réponses s’affichant au fur et à mesure. **Résoudre avec l’IA**, sur un commentaire ou en haut de **Commentaires**, les envoie aussitôt à cet agent ([Résoudre les commentaires avec l’IA](/guide/library#resolve-comments-with-ai)). **Comparer les versions** s’applique aux documents LaTeX que l’app conserve (créés avec **Nouveau** → **LaTeX**, ou par un agent), pas à un fichier .tex dans un dossier.

Modifiez comme dans [l’éditeur de documents](/guide/library#documents), puis cliquez sur **Enregistrer** dans la barre du bas, ou appuyez sur Ctrl+S (⌘S sur un Mac) ; **Abandonner** revient au fichier tel qu’il était. La barre du haut contient le chemin du fichier, **Demander** ([demander à un agent](#ask-an-agent-about-the-file)), **Télécharger** et **Plus** (⋯) : **Modifier comme du texte** (fichiers CSV, TSV et LaTeX) ou **Afficher comme un aperçu** (fichiers Word et Excel) affiche le fichier comme avant, avec un bouton dans la barre pour revenir à l’éditeur, ainsi que les commandes de la page Fichiers : **Démarrer une session avec ce fichier**, **Ajouter à un projet**, **Afficher dans son dossier**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau) et **Copier le chemin**. Un fichier ouvert à une ligne précise, depuis une recherche, s’ouvre en texte.

Ce que l’enregistrement conserve du fichier :

- **CSV et TSV** : les lignes et les cellules que vous n’avez pas modifiées gardent exactement leur texte, et le fichier garde son séparateur, ses guillemets et ses fins de ligne. Un fichier CSV contient les valeurs d’une seule feuille : si vous avez ajouté des formules, des feuilles ou une mise en forme, le premier enregistrement demande d’abord confirmation, et les formules sont enregistrées sous la forme des valeurs qu’elles donnent.
- **LaTeX** : seuls les fichiers que vous avez modifiés sont écrits, chacun avec ses propres fins de ligne. Un fichier que vous ajoutez dans l’éditeur va dans le dossier ; un fichier que vous supprimez va dans la [Corbeille](#delete-and-put-back).
- Les fichiers **Word et Excel** sont réécrits à partir de ce que contient l’éditeur : les commentaires, les modifications suivies, les équations, la table des matières, l’en-tête et le pied de page d’un fichier Word sont conservés, de même que les filtres, la mise en forme conditionnelle, les listes déroulantes et cases à cocher, les cellules fusionnées, les notes, les commentaires et les graphiques d’un fichier Excel. Lorsqu’un fichier contient des éléments que l’éditeur ne conserve pas (les notes de bas de page, les graphiques ou un en-tête avec une image ou un tableau pour un fichier Word ; les images, les formes, les tableaux croisés dynamiques, les tableaux mis en forme, les liens hypertextes, les plages nommées, les macros ou les lignes groupées pour un fichier Excel), une barre au-dessus l’indique : « L’enregistrement remplace le fichier sans ce que cet éditeur ne conserve pas », avec le détail. Le premier enregistrement demande confirmation avant de remplacer le fichier, et **Enregistrer une copie**, dans cette barre, écrit plutôt vos modifications dans un nouveau fichier à côté (« rapport (modifié).docx »). La première fois que vous enregistrez un fichier Word ou Excel, le fichier tel qu’il était va dans la [Corbeille](#delete-and-put-back), où **Remettre** le ramène à côté du nouveau.
- Un fichier trop long pour l’éditeur affiche son début, en lecture seule : **Modifier comme du texte** ou **Afficher comme un aperçu** l’affiche en entier.

Quand un agent ou un terminal modifie le fichier alors qu’il est ouvert, l’éditeur prend la nouvelle version si vous n’avez rien modifié, ou pose la question, comme l’éditeur de texte : **Recharger (abandonner ma version)** ou **Écraser avec ma version**.

Les fichiers PowerPoint, les anciens fichiers Office (.doc, .xls, .ppt), les fichiers OpenDocument, RTF et EPUB s’affichent sous forme d’aperçu, comme l’explique la section suivante.

## Voir des images, des PDF, des documents et des pages web

Le visualiseur de fichiers affiche les fichiers tels qu’ils apparaissent :

- **Images** (PNG, JPEG, GIF, WebP, SVG, ICO, BMP, AVIF) : affichées en entier, sur un damier là où elles sont transparentes. **Modifier** en haut en ouvre une dans l’éditeur d’images ([Modifier des images et des vidéos](/guide/library#edit-pictures-and-videos)).
- **PDF** : dans le lecteur PDF de votre navigateur, avec **Surligner** en haut pour les lire dans le lecteur de l’app, les surligner et garder des notes à côté (voir [Lire et surligner un PDF](#read-and-highlight-a-pdf)), et **Remplir et signer** pour les remplir et les signer (voir [Remplir et signer un PDF](#fill-in-and-sign-a-pdf)). Un PDF que vous avez surligné s’ouvre dans le lecteur.
- **Vidéo** (MP4, WebM, MOV et M4V ; MKV et OGV là où votre navigateur les lit) : dans le lecteur de l’app (voir [Regarder une vidéo](#watch-a-video) ci-dessous) ; **Modifier** en haut ouvre une vidéo MP4, MOV, M4V ou WebM dans l’éditeur vidéo. **Audio** (MP3, WAV, OGG) se lit sur place.
- **Documents Office** : PowerPoint (.pptx, .ppt), anciens fichiers Word et Excel (.doc, .xls et similaires), OpenDocument (.odt, .ods, .odp), RTF et EPUB ; ainsi que les fichiers Word (.docx) et Excel (.xlsx) depuis **Plus** (⋯) → **Afficher comme un aperçu** dans leurs éditeurs. Un sélecteur en haut choisit l’affichage :
  - **Diapositives** (fichiers PowerPoint : .pptx et ses variantes avec macros, diaporama et modèle) : chaque diapositive telle qu’elle apparaît, dessinée comme l’éditeur de diapositives les dessine, avec ses images, formes, tableaux, graphiques et son arrière-plan en place, son numéro au-dessus et ses notes de l’intervenant en dessous. Quand cet ordinateur n’a pas une police utilisée par la présentation, le texte d’une zone qui a besoin de plus de place qu’elle n’en a est un peu réduit, pour que rien ne soit coupé.
  - **Pages** : le document tel que LibreOffice le met en page, page par page (« Mise en page des pages… » la première fois). Cet affichage n’existe que si LibreOffice est installé sur cet ordinateur, et pas pour les livres EPUB.
  - **Texte** : son texte, ses feuilles et ses diapositives tels que l’app les lit.

  Un fichier PowerPoint s’ouvre sur **Diapositives**, y compris sur un téléphone. Les autres documents s’ouvrent sur **Pages** quand LibreOffice est installé, mais les téléphones démarrent sur **Texte**, qui défile et zoome mieux sur ces appareils. Si les diapositives d’une présentation ne peuvent pas être dessinées, elle s’ouvre sur **Texte** et en indique la raison. Si un document ne peut pas être lu, il affiche « Aucun aperçu pour ce fichier » : téléchargez-le plutôt.
- **Markdown** et **HTML** : voir **Aperçu** et **Afficher comme une page** ci-dessus.

**Télécharger** est toujours dans la barre.

### Regarder une vidéo

Une vidéo s’ouvre dans le lecteur de l’app, qui remplit le visualiseur :

- **Lecture et pause** : le bouton rond au milieu, le bouton en bas à gauche, un clic sur l’image, ou la barre d’espace (K fonctionne aussi). Un double-clic sur l’image passe en plein écran.
- **Se déplacer dans la vidéo** : faites glisser le long de la barre en bas, ou cliquez sur un point de celle-ci ; en laissant le pointeur sur la barre, vous voyez l’heure correspondante, et sa partie plus claire est ce qui est chargé. ← et → avancent ou reculent de 5 secondes, J et L de 10 secondes, Début et Fin vont au début et à la fin, 0 à 9 sautent à ce dixième de la vidéo, et , et . avancent ou reculent d’une image en pause.
- **Son** : le haut-parleur coupe et rétablit le son (M). Sur un ordinateur, laissez le pointeur sur le haut-parleur pour afficher un curseur de volume ; ↑ et ↓ changent aussi le volume.
- **Vitesse** : le bouton **1×** propose de 0,5× à 2× (**Normal** correspond à 1×).
- **Boucle** relit la vidéo depuis le début à chaque fin, **Image dans l’image** la garde en lecture dans une petite fenêtre au-dessus de tout le reste (là où votre navigateur le permet), **Télécharger** enregistre le fichier, et **Plein écran** (F) remplit l’écran ; le même bouton, ou Échap, fait revenir.
- Les commandes s’estompent pendant la lecture et reviennent quand vous bougez le pointeur. Le lecteur se souvient de votre volume et de votre vitesse pour la vidéo suivante.
- **Sur un téléphone** : touchez l’image pour afficher ou masquer les commandes, et touchez deux fois son côté gauche ou droit pour reculer ou avancer de 10 secondes. Sur un iPhone, le plein écran utilise le lecteur vidéo du téléphone.
- Une vidéo que votre navigateur ne peut pas lire (les fichiers MKV et AVI utilisent souvent des codecs que les navigateurs ne prennent pas en charge) affiche « Cette vidéo ne peut pas être lue ici », avec **Télécharger** pour la regarder dans une app vidéo.

## Remplir et signer un PDF

Ouvrez un PDF et appuyez sur **Remplir et signer** en haut (sur un téléphone, le stylo à côté de son nom). Ses pages s’affichent comme du papier, avec les champs de son formulaire en bleu clair par-dessus :

- **Champs** : saisissez du texte dans une zone de texte, cochez une case, choisissez un bouton radio, le choix d’une liste déroulante ou les choix d’une liste. Un champ verrouillé par le formulaire (en lecture seule, ou verrouillé par une signature numérique déjà présente dans le fichier) ne peut pas être modifié.
- **Un clic sur une page** y place ce que contient la barre d’outils : **Texte** (une zone où saisir, le choix habituel), **Coche**, **Croix** ou **Date** (la date du jour, que vous pouvez changer). Cliquez sur chaque blanc l’un après l’autre : chaque clic démarre le suivant. C’est ainsi que vous remplissez un formulaire qui n’est que des lignes et des cases imprimées, ou un formulaire numérisé.
- **Signature** place sur la page l’une de vos signatures enregistrées d’un seul geste, ou une signature que vous dessinez, saisissez ou importez à cet endroit (cochez **La garder pour plus tard** pour l’enregistrer ; voir [Signatures](/guide/library#signatures)). Le champ de signature d’un formulaire indique **Signer ici** : touchez-le, et la signature se place dans sa case.
- **Déplacer et redimensionner** : faites glisser une coche, une croix ou une signature pour la déplacer, et son coin bleu pour la redimensionner. Une zone de texte se déplace par la poignée à sa gauche, et **A−** et **A+** au-dessus rendent ses mots plus petits ou plus grands. La corbeille au-dessus de chacun, ou Suppr, l’enlève.
- **Zoom** : pincez sur un téléphone ou une tablette ; sur un ordinateur, Ctrl avec la molette de la souris, ou Ctrl+= et Ctrl+−. **Ajuster à la largeur** (ou Ctrl+0) revient à l’affichage d’origine.

**Enregistrer** écrit une copie à côté du fichier, « nom (rempli).pdf », et l’ouvre. La flèche à côté propose **Enregistrer une copie à côté** et **Remplacer le fichier**, dont l’ancienne version va dans la [Corbeille](#delete-and-put-back). **Fermer** quitte sans enregistrer, en demandant d’abord confirmation si vous avez modifié quelque chose.

Les champs gardent vos valeurs comme les champs propres d’un formulaire : n’importe quel lecteur PDF les affiche et ils peuvent encore y être modifiés, dans des polices qui contiennent vos mots (grec et chinois aussi). Ce que vous avez placé est dessiné sur les pages. Les octets d’origine du fichier restent tels quels, avec les modifications ajoutées après eux, donc :

- un PDF **signé numériquement** reste valide quand vous ne faites que remplir ses champs. Du texte, des coches ou une signature placés sur ses pages apparaissent dans les autres lecteurs comme une modification faite après la signature ;
- un PDF **protégé** par son propriétaire (il s’ouvre sans mot de passe mais limite les modifications) n’est rempli que dans la mesure où il le permet. Un PDF qui demande un mot de passe pour s’ouvrir ne peut pas être rempli ici.

Ce qu’il ne peut pas faire :

- **Les formulaires XFA** (créés avec Adobe LiveCycle Designer, souvent par des administrations) : leurs champs ne se remplissent que dans Adobe Acrobat ou Reader. Vous pouvez tout de même saisir du texte et signer sur leurs pages.
- **Les formulaires numérisés** n’ont ni champs ni mots à trouver : votre texte et vos coches vont là où vous cliquez.
- Une signature dessinée est une image de votre signature, pas une signature numérique qui prouve qui a signé.
- Rien ici ne retire définitivement des mots d’un PDF. Les zones blanches que les agents peuvent placer sur des mots ne les cachent qu’à l’œil : les mots restent dans le fichier.

Les agents remplissent, annotent et modifient aussi les PDF, avec leurs propres outils : voir [Documents, images, vidéos et voix](/guide/documents-voice#pdfs).

## Lire et surligner un PDF

Ouvrez un PDF et appuyez sur **Surligner** en haut (sur un téléphone, le surligneur à côté de son nom). Ses pages s’affichent comme du papier, dessinées par l’app, avec leurs mots par-dessus à sélectionner comme dans n’importe quel lecteur. Un PDF que vous avez surligné s’ouvre ainsi de lui-même, pour que vos notes soient là à votre retour ; **Fermer** revient au lecteur de votre navigateur.

- **Surligner des mots** : sélectionnez-les avec la souris, ou sur un téléphone, appuyez longuement sur un mot et faites glisser les poignées. Une petite barre apparaît : l’une de ses quatre couleurs (jaune, vert, bleu ou rose) les surligne, **Note** les surligne et ouvre une note à écrire, **Demander** interroge un agent à leur sujet ([ci-dessous](#ask-about-a-part-of-a-pdf)), et **Copier** les copie, un mot coupé en fin de ligne étant recollé. Une sélection passe d’une colonne d’un article à la suivante, dans l’ordre de lecture.
- **Surligner une figure ou une équation** : appuyez sur **Sélectionner une zone** et faites glisser un cadre autour ; sur un ordinateur, maintenez Alt et faites glisser, sans le bouton. La même barre apparaît pour cette partie de la page, qui est conservée comme une image de celle-ci (**Copier** copie l’image, ou ses mots là où le navigateur ne permet pas à une page de copier des images).
- **Modifier un surlignage** : cliquez dessus pour afficher sa barre, afin de choisir une autre couleur, **Modifier la note**, **Demander**, **Copier** ou le supprimer (la corbeille, ou Suppr ; **Annuler** dans le message qui suit le rétablit). Laisser le pointeur sur un surlignage affiche sa note, et un petit point signale ceux qui en ont une. Surligner de nouveau les mêmes mots change leur couleur.
- **Zoom** : pincez sur un téléphone ou une tablette ; sur un ordinateur, Ctrl avec la molette de la souris, ou Ctrl+= et Ctrl+−. **Ajuster à la largeur** (ou Ctrl+0) revient à l’affichage d’origine. Les surlignages restent sur leurs mots à toutes les tailles.

Une page qui n’est qu’une image (un scan) n’a pas de mots à sélectionner : surlignez-en des parties avec **Sélectionner une zone**. Les mots qui courent de haut en bas d’une page (une page tournée sur le côté) ne peuvent pas non plus être sélectionnés. Les surlignages enregistrés par d’autres apps dans un PDF s’affichent sur ses pages, mais pas dans **Notes**.

### Vos notes

**Notes** liste vos surlignages à côté des pages (sous forme de feuille depuis le bas sur un téléphone), page par page : les mots de chacun ou l’image de sa zone, sa note, que vous écrivez ou modifiez directement là, et sa couleur. Cliquez sur l’un pour aller à son emplacement sur la page ; la corbeille le supprime, et ✨ interroge un agent à son sujet.

L’app conserve vos surlignages et vos notes à côté du fichier, selon son chemin : le PDF lui-même ne change pas. Ils suivent quand vous renommez ou déplacez le fichier (ou son dossier) ici, et un fichier déplacé autrement (dans un terminal, par un agent) retrouve ses notes grâce à son contenu quand vous l’ouvrez. Quand le fichier lui-même change (un article recomposé), chaque surlignage est retrouvé grâce à ses mots, y compris sur une autre page ; celui dont les mots n’y figurent plus reste où il était, avec la mention « Le fichier a changé, et ces mots n’y sont plus ».

**Plus** (⋯) dans Notes propose :

- **Garder dans un projet** : vos surlignages et vos notes vont dans les [connaissances](/guide/projects#memory) d’un projet sous la forme d’un document portant le nom de l’article (« Sparse Retrieval with Learned Term Weights (notes).md », par exemple) : le titre de l’article, puis les mots de chaque surlignage (une ligne pour une zone) et votre note, page par page, afin que les sessions du projet les trouvent quand elles cherchent dans ses documents. Le projet dont le dossier contient le PDF vient en premier. Le document suit chaque modification que vous faites aux notes ; **Ouvrir les connaissances du projet** l’y affiche, et **Ne plus les garder là** l’en retire.
- **Enregistrer dans le PDF** : écrit les surlignages dans le fichier comme les siens, chaque note comme commentaire de son surlignage, afin que d’autres apps PDF les affichent. **Enregistrer une copie à côté** écrit « nom (surligné).pdf », qui garde aussi vos notes ; **Remplacer le fichier** écrit par-dessus, son ancienne version allant dans la [Corbeille](#delete-and-put-back). Enregistrer de nouveau les met tels qu’ils sont alors, à la place de ceux enregistrés avant. Un fichier dont le propriétaire interdit les commentaires, ou un fichier certifié contre eux, ne peut pas les accepter : ils restent à côté.
- **Tout copier** : les notes sous forme de texte, à coller ailleurs.

### Interroger un agent sur une partie d’un PDF

**Demander** dans la barre ouvre [Interroger un agent sur le fichier](#ask-an-agent-about-the-file) à côté du PDF (par-dessus sur un écran étroit) avec ce que vous avez choisi : les mots, ou une image de la zone, et sa page. Choisissez un exemple (« Explique ce passage », « Que dit cette équation ? », « Comment cela se compare-t-il à mon approche ? », « Résume cette section ») ou écrivez votre propre question ; l’agent peut aussi lire tout le PDF. Pendant qu’une conversation sur le fichier est en cours, **Demander** place la partie dans sa zone de message à la place, pour que vous l’interrogiez ensuite à son sujet. Les agents lisent aussi vos surlignages et vos notes d’un PDF quand vous le leur demandez (« résume mes surlignages de cet article »).

## Trouver un fichier par son nom

Appuyez sur Ctrl+P (⌘P sur un Mac) sur n’importe quelle page. « Aller au fichier dans … » cherche par nom dans le dossier ouvert dans Fichiers : saisissez quelques lettres du nom dans l’ordre (`invq3` trouve `invoices/q3-report.xlsx`). Les fichiers dont le nom contient ce que vous avez saisi viennent en premier. Déplacez-vous avec ↑ et ↓, ouvrez avec Entrée ou un clic. Il liste jusqu’à 60 fichiers, y compris les fichiers masqués.

La zone de recherche (Ctrl+K, ⌘K sur un Mac) trouve aussi des fichiers par nom, dans le même dossier, dès que vous saisissez deux lettres.

## Rechercher des fichiers

Une seule recherche trouve les fichiers par leur nom et par le texte qu’ils contiennent, partout dans un dossier. Saisissez votre recherche dans le champ **Rechercher dans** d’un dossier et appuyez sur Entrée, ou allez à [Recherche dans les fichiers](/search).

1. Saisissez ce que vous cherchez dans « Rechercher dans les noms et le texte des fichiers ». Les résultats arrivent au fur et à mesure de la saisie.
2. Sous le champ, **Dans** indique où porte la recherche : au départ, le dossier d’où vous venez. Cliquez dessus pour chercher ailleurs : le dossier d’un projet, un dossier épinglé, un dossier où des sessions ont travaillé, votre **Dossier personnel**, ou n’importe quel dossier que vous trouvez par son nom ou dont vous saisissez le chemin.
3. Affinez la recherche si vous le souhaitez :
   - **Tous les types de fichiers** permet de choisir le type : **Texte et notes**, **Code**, **Données et paramètres**, **Pages web** ou **Notebooks**. Vous pouvez aussi saisir dans le même menu des noms comme ceux-ci, séparés par des virgules (`*.md, *.py`) ; un `!` devant en exclut certains (`!dist/**`).
   - **Fichiers masqués inclus** cherche aussi dans les fichiers et dossiers dont le nom commence par un point.
   - Dans le champ, **Respecter la casse** fait correspondre exactement les majuscules (sans cette option, une recherche en minuscules ignore la casse, et une recherche contenant une majuscule la respecte), et **Expression régulière** interprète votre saisie comme un motif (`colou?r`) plutôt que comme du texte simple.

Les résultats se présentent en deux parties :

- **Fichiers portant ce nom** : jusqu’à 30 fichiers dont le nom contient ce que vous avez saisi, chacun avec son dossier.
- **Dans les fichiers** : les lignes correspondantes, regroupées par fichier, chaque fichier avec son nombre de correspondances. Cliquez sur une ligne pour ouvrir le fichier à cette ligne, ou sur le nom d’un fichier pour l’ouvrir.

Le menu **Plus** (⋯) de chaque résultat propose **Afficher dans son dossier**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau), **Démarrer une session avec ce fichier**, **Ajouter à un projet** et le reste du menu d’un fichier.

La recherche est conservée dans l’adresse de la page : le bouton Retour et le rechargement la gardent. Elle ignore les fichiers que le `.gitignore` du dossier exclut et les fichiers de plus de 4 Mo. Elle s’arrête à 50 correspondances dans un fichier et à 1 000 au total, ou après 15 secondes, et affiche les 30 premières lignes correspondantes de chaque fichier. Les PDF, les documents Word et autres documents sont trouvés par leur nom, pas par le texte qu’ils contiennent ; pour que les agents puissent chercher à l’intérieur, ajoutez-les aux [connaissances](/guide/projects#shared-knowledge-documents-every-session-can-search).

## Exécuter un notebook Jupyter

Un notebook (`.ipynb`) s’ouvre comme un notebook : ses cellules, chacune avec sa sortie. La barre du haut contient le bouton du noyau, **Exécuter toutes les cellules**, **Interrompre (I, I)**, **Redémarrer le noyau (0, 0)**, **Effacer toutes les sorties**, **Voir le fichier du notebook (JSON)**, **Télécharger**, **Demander** (voir [Interroger un agent sur le fichier](#ask-an-agent-about-the-file)) et **Enregistrer**. Sur un téléphone, les moins utilisés se trouvent sous **Plus** : **Redémarrer le noyau**, **Redémarrer et tout exécuter**, **Effacer toutes les sorties**, **Voir le fichier (JSON)** et **Télécharger**.

Créez-en un avec **Nouveau** → **Nouveau notebook** dans un dossier (voir [Créer un fichier ou un dossier](/guide/files-git#make-a-file-or-folder)), ou demandez-en un à un agent : il écrit le notebook, l’exécute depuis le début pour que ses sorties soient présentes, prépare un environnement où l’exécuter si aucun ne convient, et vous le remet sous forme de carte qui l’ouvre ici.

### Choisir où le code s’exécute

Le bouton du noyau (un point et un nom, ou « Aucun noyau ») ouvre **Exécuter ce notebook avec** : les environnements Python de cet ordinateur. Il liste les environnements virtuels nommés `.venv`, `venv` ou `env` dans le dossier du notebook ou les dossiers au-dessus, les environnements conda, le Python du système et les noyaux Jupyter enregistrés ici (d’autres langages aussi). Chacun affiche sa version, et celui que demande le notebook (ou un environnement virtuel à côté de lui) est marqué **suggéré**.

- Un environnement marqué « ipykernel requis » a un bouton **Installer** : il exécute `pip install ipykernel` dans cet environnement, après votre confirmation, sans rien changer d’autre.
- Exécuter une cellule alors qu’aucun noyau n’est démarré en lance un dans l’environnement suggéré. Si cela échoue, la liste s’ouvre pour que vous en choisissiez un autre.
- Quand un noyau tourne, le menu du bouton indique son état (Démarrage, Inactif, En cours d’exécution, Redémarrage ou Arrêté), son heure de démarrage, ainsi que **Interrompre**, **Redémarrer** et **Arrêter**. Choisir un autre environnement demande d’abord confirmation, car les variables du noyau en cours sont perdues.

Les noyaux continuent de tourner après la fermeture du notebook et à travers les redémarrages de l’app : rouvrez-le, et les sorties de ce qui s’est exécuté entre-temps sont là. Arrêtez un noyau depuis son menu, ou depuis la page [Système](/system), où les noyaux en cours sont listés.

### Écrire et exécuter des cellules

Une cellule est de type **Code**, **Texte** (Markdown) ou **Brute**. Cliquez sur une cellule de code pour la modifier, ou double-cliquez sur une cellule de texte. Pendant l’exécution d’une cellule, elle affiche `[*]` et un chronomètre ; ensuite, son numéro d’exécution, `[3]`.

- Pointez une cellule de code : un bouton d’exécution remplace son numéro (« Exécuter (Maj+Entrée) » : il exécute la cellule et passe à la suivante ; pendant l’exécution de la cellule, il interrompt le noyau). Ses outils s’affichent dans le coin : **Modifier** (cellules de texte), le type de cellule, **Monter**, **Descendre**, **Ajouter une cellule en dessous**, **Supprimer la cellule** et **Plus d’options pour cette cellule** (⋯, le menu de la cellule, ci-dessous). Sur un téléphone, touchez une cellule : ses outils s’affichent au-dessus, **Exécuter** compris.
- Sur un ordinateur, pointer entre deux cellules affiche **+ Code** et **+ Texte**. Les deux mêmes boutons se trouvent sous la dernière cellule.
- **Le menu de la cellule** : faites un clic droit sur une cellule (ou sur son ⋯ dans le coin, ce qui l’ouvre sur un téléphone). Il propose **Exécuter cette cellule**, **Exécuter tout ce qui est au-dessus**, **Exécuter celle-ci et les suivantes** et **Exécuter tout ce qui est en dessous** (seules les cellules de code s’exécutent), **Couper**, **Copier**, **Coller en dessous**, **Coller au-dessus**, **Dupliquer**, **Scinder au curseur** (pendant que vous modifiez la cellule, avec le curseur à l’endroit de la coupure), **Fusionner avec la cellule suivante**, **Ajouter une cellule au-dessus** et **en dessous**, **Monter** et **descendre** (**bas**), **Type de cellule**, **Effacer la sortie**, **Replier la sortie** ou **Afficher la sortie**, et **Supprimer la cellule**, chacun avec sa touche. Les cellules coupées, copiées et dupliquées gardent leurs sorties ; un collage peut se faire dans un autre notebook tant que l’app est ouverte. Scinder ou fusionner efface les sorties des cellules créées.
- **Plusieurs cellules à la fois** : Maj+↑ / Maj+↓ (ou Maj+clic) sélectionne les cellules entre votre point de départ et votre position, affichées teintées ; le menu, **Copier**, **Couper**, **Dupliquer**, **Fusionner** et D, D agissent alors sur toutes. Échap relâche la sélection.
- **Replier une sortie** : les petites flèches près du numéro d’une cellule (ou **Replier la sortie** dans son menu) masquent sa sortie derrière « Sortie masquée » ; cliquez dessus pour la réafficher. Cet état est conservé dans le fichier du notebook (comme le fait Jupyter), si bien qu’elle reste repliée à la réouverture.
- Quand le code demande une saisie (le `input()` de Python), un champ apparaît sous la cellule : « Saisissez, puis Entrée ». Les mots de passe restent masqués.
- Pendant que vous modifiez du code, la touche Tab après un nom demande au noyau en cours des suggestions de complétion.

Les sorties affichent du texte, des erreurs en couleur, des images et des graphiques, des tableaux, du HTML (dans un cadre isolé), du Markdown et des formules. « Les widgets interactifs ne fonctionnent pas ici », pas plus que les sorties JavaScript. Les barres de progression s’affichent dans leur dernier état, et le texte qu’une cellule imprime petit à petit s’affiche en un seul bloc, comme dans Jupyter.

### Touches

Pendant que vous modifiez une cellule :

- Maj+Entrée : l’exécuter et passer à la cellule suivante (une nouvelle après la dernière).
- Ctrl+Entrée (⌘Entrée sur Mac) : l’exécuter et rester dessus.
- Alt+Entrée : l’exécuter et ajouter une cellule en dessous.
- Ctrl+Maj+Entrée : l’exécuter ainsi que les cellules en dessous.
- Ctrl+Maj+- (⌘⇧-) : scinder la cellule au curseur.
- Échap : arrêter la modification.

Quand aucune cellule n’est en cours de modification :

- Entrée : modifier la cellule sélectionnée. ↑ / ↓ (ou K / J) : passer d’une cellule à l’autre. Maj+↑ / ↓ : en sélectionner plusieurs.
- A / B : ajouter une cellule au-dessus / en dessous. D, D : supprimer la cellule (ou les cellules sélectionnées). Z : rétablir les dernières cellules supprimées ; appuyez à nouveau pour celles d’avant.
- C / X : copier / couper la cellule (ou les cellules sélectionnées). V / Maj+V : coller en dessous / au-dessus. Maj+M : fusionner la cellule avec la suivante (ou les cellules sélectionnées ensemble). Ctrl+Maj+Entrée : exécuter cette cellule et celles en dessous.
- M, Y, R : passer la cellule en Texte, Code ou Brute.
- I, I : interrompre le noyau. 0, 0 : le redémarrer.

Le menu **Plus** (⋯) dans la barre au-dessus du notebook propose **Exécuter toutes les cellules**, **Exécuter tout ce qui est au-dessus**, **Exécuter celle-ci et les suivantes** et **Exécuter tout ce qui est en dessous** (ces trois derniers pour la cellule sélectionnée), **Redémarrer le noyau**, **Redémarrer et tout exécuter**, **Effacer toutes les sorties**, **Contour** et **Raccourcis clavier**. **Contour** affiche les titres des cellules de texte (les lignes qui commencent par #) dans une liste à côté des cellules (une feuille sur un téléphone) : cliquez sur l’un d’eux pour aller à sa cellule. **Raccourcis clavier** liste toutes les touches. Une cellule exécutée alors que le noyau démarre encore l’attend, puis s’exécute quand il est prêt.

Ctrl+S (⌘S sur Mac) enregistre. Comme pour les autres fichiers, si le notebook change sur le disque alors que vous avez des modifications non enregistrées, une barre propose **Recharger (abandonner ma version)** ou **Écraser avec ma version**. **Voir le fichier du notebook (JSON)** affiche le fichier sous forme de texte dans l’éditeur ; **Ouvrir comme notebook** permet de revenir.

## Voir vos dépôts dans la page Git

Cliquez sur **Git** dans la barre d’icônes, ou allez à [Git](/git). À gauche, la page liste vos dépôts git, le plus récemment utilisé en premier : ceux où vos sessions ont travaillé (le dossier d’une session, ou un fichier qu’une session a modifié ; les emplacements temporaires comme `/tmp` sont écartés) et ceux que vous avez ajoutés vous-même. Au-delà de six, un champ en haut permet d’en trouver un par son nom.

La première fois que vous ouvrez la page Git, une courte visite conçue pour les personnes qui découvrent Git vous la fait découvrir. Elle apparaît tant que les astuces sont activées, après la visite de bienvenue. Une carte explique en mots simples ce qu’est Git (des points de sauvegarde pour un dossier : des commits, dans un dépôt), puis chaque partie de la page s’éclaire à son tour avec sa propre carte : vos dépôts, **Modifications**, **Commit**, la conservation d’une copie en ligne (**Pousser** et **Tirer**), **Historique**, **Branches**, et le fait que vous pouvez simplement demander à un agent. Avancez et revenez avec **Suivant** et **Retour** ; **Terminé** y met fin, et **Passer** ou Esc la ferme plus tôt. **Faire la visite** (le bouton boussole en haut à droite de la page) la relance à tout moment.

Chaque dépôt affiche son nom et sa branche, et de petites marques quand il y a quelque chose à faire :

- **● 3** : trois fichiers modifiés et pas encore commités.
- **↑ 2** : deux commits à pousser. **↓ 1** : un commit à tirer.
- **Fusion en cours** ou **Rebase en cours** : une fusion s’est arrêtée sur des fichiers en conflit (voir [Quand une fusion s’arrête sur des conflits](/guide/files-git#when-a-merge-stops-on-conflicts)).
- À droite, depuis combien de temps le dernier commit a été fait.

En haut de la page, **Récupérer les dépôts distants de tous les dépôts** (le nuage) demande à chaque dépôt distant ce qui est nouveau, et **Actualiser** relit la liste.

Cliquez sur un dépôt pour l’ouvrir à côté de la liste. En haut : son nom et son dossier, la branche sur laquelle vous êtes, une ligne indiquant où il en est par rapport au dépôt distant, **Synchroniser** et un menu ⋯. En dessous, quatre onglets : **Modifications**, **Historique**, **Branches** et **Remises**. Sur un ordinateur, le dépôt que vous avez utilisé en dernier s’ouvre quand vous arrivez sur la page. Dans une petite fenêtre, la liste se replie dans le titre de la page (cliquez sur le nom du dépôt pour en choisir un autre) ; sur un téléphone, la liste est une page à part, et un dépôt s’ouvre par-dessus avec une flèche de retour.

### Ajouter un dépôt

**Ajouter** en haut de la page propose deux façons :

- **Ajouter un dossier de cet ordinateur** : saisissez ou choisissez le dossier d’un projet et cliquez sur **Ajouter**. Un dossier à l’intérieur d’un dépôt ajoute ce dépôt. Un dossier que git ne suit pas encore peut devenir un dépôt à part entière : **Démarrer un dépôt ici** (le `git init` de git).
- **Cloner depuis un lien** : collez l’adresse d’un dépôt sur GitHub, GitLab ou un autre serveur git (`https://…`, `ssh://…` ou `git@host:owner/project`). **Destination** suggère un dossier à part (dans `~/code` si vous en avez un) ; il ne doit pas exister encore, ou doit être vide. **Cloner** montre l’avancement ; vous pouvez fermer la boîte de dialogue, l’opération continue. Le dépôt s’ouvre une fois terminé.

Ce que vous ajoutez reste dans la liste jusqu’à ce que vous le retiriez : ⋯ → **Retirer de la liste**. Son dossier reste tel quel.

## Synchroniser avec le dépôt distant

Le dépôt distant est l’endroit où le dépôt est partagé, par exemple GitHub. La ligne sous la branche indique où en est la vôtre : « 2 à pousser · 1 à tirer · récupéré il y a 5 min », **À jour**, **Pas encore sur le dépôt distant** ou **Aucun dépôt distant**.

**Synchroniser** fait le nécessaire en un clic : il demande au dépôt distant ce qui est nouveau, intègre ces commits, puis envoie les vôtres. Ses flèches indiquent combien partent dans chaque sens (**Synchroniser ↑2 ↓1**). Une branche que le dépôt distant n’a pas encore affiche à la place **Publier la branche** : elle y met la branche et garde ensuite les deux alignées.

Quand votre branche et celle du dépôt distant ont chacune avancé, Synchroniser ne change encore rien et demande comment les réunir :

- **Placer mes commits par-dessus** : vos commits passent après ceux du dépôt distant, comme si vous les aviez faits plus tard, de sorte que l’historique reste une ligne droite (git appelle cela un rebase).
- **Fusionner** : un commit de fusion joint les deux lignes ; chaque commit reste tel quel.

Ensuite, Synchroniser envoie les vôtres. Si les deux côtés ont modifié les mêmes lignes, il s’arrête pour que vous les régliez (voir [Quand une fusion s’arrête sur des conflits](/guide/files-git#when-a-merge-stops-on-conflicts)). Si vos modifications non commitées touchent des fichiers qui ont changé sur le dépôt distant, il le signale : commitez-les d’abord ou mettez-les de côté dans une remise.

Le menu ⋯ propose les étapes une à une, et le reste :

- **Récupérer** demande au dépôt distant ce qui est nouveau sans rien changer ici. **Tirer** l’intègre (quand les deux côtés ont avancé, il pose la même question). **Pousser** envoie vos commits.
- **Ouvrir un terminal ici**, **Afficher dans Fichiers**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau) et **Copier le chemin**.
- **Dépôts distants** : les dépôts distants du dépôt et leurs adresses. Un dépôt sans dépôt distant affiche **Aucun dépôt distant · En ajouter un** : collez une adresse et cliquez sur **Ajouter le dépôt distant** (il s’appelle origin), puis sur **Publier la branche**.
- **Pousser les tags**, quand le dépôt a des tags.

Quand quelque chose ne passe pas, un encadré rouge dit ce qui s’est produit, en termes simples quand c’est possible, avec **Ce qu’a dit git** pour le message propre à git. Le git de l’app ne demande jamais de mot de passe : pousser et tirer utilisent les clés SSH de cet ordinateur ou les identifiants git enregistrés, et le signalent quand ceux-ci ne fonctionnent pas sans invite.

## Valider des modifications

**Modifications** liste tous les fichiers modifiés depuis le dernier commit, avec les lettres que la page Fichiers utilise (voir [Ce que signifient les lettres à côté des fichiers](/guide/files-git#what-the-letters-beside-files-mean)), leur nom en gras suivi de leur dossier, et les lignes ajoutées et supprimées. Cliquez sur un fichier pour voir ses modifications à côté de la liste (sur un téléphone, sur une page à part). Quand la place le permet, **Unifié** et **Côte à côte** affichent les anciennes et les nouvelles lignes l’une sous l’autre ou l’une à côté de l’autre.

Il n’y a pas d’étape d’indexation distincte : chaque fichier a une case qui l’ajoute au prochain commit (tous au départ), et la case en haut les coche ou les décoche tous (« 3 sur 4 dans le commit »).

- **Annuler cette partie**, en haut de chaque partie des modifications d’un fichier, remet uniquement ces lignes comme elles étaient dans le dernier commit (après confirmation).
- Le menu ⋯ d’un fichier : **Ouvrir le fichier**, **Afficher dans Fichiers**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau), **Annuler les modifications** (pour un nouveau fichier, **Supprimer le nouveau fichier** ; les deux demandent confirmation et sont irréversibles), et **L’ignorer** (un nouveau fichier) ou **Ne plus suivre et ignorer** (un fichier que git suit : le prochain commit le retire du dépôt, et il reste sur cet ordinateur). Les deux l’ajoutent à `.gitignore`.
- L’icône de boîte en haut de la liste met toutes les modifications de côté dans une remise (voir [Mettre des modifications de côté avec une remise](/guide/files-git#put-changes-aside-with-a-stash)).

Pour commiter, en bas de la liste :

1. Rédigez un résumé de la modification, et une description si elle en a besoin. Ou cliquez sur **Rédiger le message** : un modèle lit les modifications que vous avez cochées et rédige les deux, dans le style des derniers commits du dépôt (Claude quand Claude Code est connecté, Codex sinon).
2. Cliquez sur **Commit**, ou sur **Commiter et pousser** pour l’envoyer tout de suite au serveur distant (cela publie la branche si le serveur distant ne l’a pas encore). Ctrl+Entrée valide aussi le commit.

Seuls les fichiers cochés sont inclus, même si d’autres avaient été indexés ailleurs.

**Amender le dernier commit** s’affiche tant qu’aucun serveur distant n’a le dernier commit : cochez-le pour modifier ce commit au lieu d’en créer un nouveau. Son message se remplit pour que vous le modifiiez, les fichiers que vous cochez s’y ajoutent, et les boutons deviennent **Amender** et **Amender et pousser**.

Quand tout est commité, Modifications affiche **Rien à commiter** et montre le dernier commit : cliquez dessus pour l’ouvrir dans l’Historique.

## Quand une fusion s’arrête sur des conflits

Quand les deux côtés ont modifié les mêmes lignes (une synchronisation qui apporte des commits, la fusion d’une branche, l’inversion d’un commit), git s’arrête en cours de route, et le dépôt le signale au-dessus de ses onglets : « La fusion de origin/main dans main s’est arrêtée : 1 fichier est en conflit ». Les fichiers en conflit y sont listés et marqués **C** dans Modifications ; cliquez sur l’un d’eux pour le voir.

Dans chacun de ces fichiers, git a placé les deux versions entre des marqueurs : `<<<<<<<` et la vôtre, `=======`, puis l’autre jusqu’à `>>>>>>>`. Ouvrez le fichier, gardez ce qui doit rester et supprimez les marqueurs. Un fichier apparaît comme résolu, avec une coche, dès qu’il ne reste plus de marqueurs. Ensuite :

- **Demander à un agent de les résoudre** ouvre la page de démarrage avec une consigne pour ce dépôt : un agent règle les fichiers, vérifie qu’ils fonctionnent toujours et vous dit ce qu’il a choisi. Rien ne démarre tant que vous ne l’avez pas envoyée.
- **Continuer**, une fois tous les fichiers résolus, termine ce qui s’était arrêté (le commit de la fusion, ou le reste de vos commits placés par-dessus).
- **Arrêter la fusion** (ou **Arrêter le placement**, **Arrêter l’inversion**) remet tout comme avant le début de l’opération, après confirmation. Ce que vous avez modifié pour résoudre les fichiers est perdu.

D’ici là, la synchronisation et la zone de commit restent en attente : Continuer crée le commit.

## Parcourir l’historique

**Historique** liste les commits, du plus récent au plus ancien, avec à gauche un graphe de la façon dont les branches se séparent et se rejoignent : chaque ligne est une branche et chaque point un commit ; un anneau est un commit que le serveur distant n’a pas encore. Des étiquettes indiquent les branches (les vôtres en contour), les branches du serveur distant (avec un nuage) et les tags de chaque commit, puis son message, son auteur et sa date.

- **Cette branche** affiche l’historique qui a mené à la branche sur laquelle vous êtes ; **Toutes les branches** affiche celui de toutes les branches, y compris celles du serveur distant.
- **Rechercher un commit** trouve des commits par des mots de leur message, le nom ou l’adresse de leur auteur, ou leur hash.
- **Trouver ce qui a cassé**, le bouton à côté, demande à un agent de trouver le commit qui a cassé quelque chose (voir [Trouver ce qui a cassé](#find-what-broke-it)).
- **Charger plus**, à la fin, affiche des commits plus anciens.

Cliquez sur un commit pour l’ouvrir à côté de la liste (sur un téléphone, sur une page à part) : son message complet, son auteur, sa date et son hash (cliquez sur le hash pour le copier), les branches et les tags qu’il porte, et les fichiers qu’il a modifiés, chacun s’ouvrant sur ses différences. Une fusion indique quels commits elle a réunis.

- **Expliquer** ouvre la page de démarrage avec une consigne qui demande à un agent d’expliquer le commit en termes simples.
- **Défaire ce commit** s’affiche sur le dernier commit tant qu’aucun serveur distant ne l’a : le commit disparaît, et ce qu’il avait modifié retourne dans Modifications, prêt à être commité de nouveau.
- Le menu ⋯ propose aussi **Copier le hash**, **Trouver ce qui a cassé** (à partir de ce commit, comme dernier point où cela fonctionnait), **Nouvelle branche à partir d’ici** (une branche qui démarre à ce commit ; vous basculez dessus), **Taguer ce commit** (un nom tel que `v1.2.0` et, si vous le souhaitez, un message ; **Pousser les tags** dans le menu ⋯ du dépôt envoie les tags au serveur distant) et **Inverser ce commit** : un nouveau commit qui annule ce que celui-ci avait modifié, après confirmation. Le commit lui-même reste dans l’historique.

### Trouver ce qui a cassé

Quand quelque chose fonctionnait dans une version antérieure et ne fonctionne plus, ouvrez le commit où cela fonctionnait pour la dernière fois et choisissez **Trouver ce qui a cassé** dans son menu ⋯, ou sélectionnez le bouton **Trouver ce qui a cassé** à côté de **Rechercher un commit**. Son formulaire demande :

- **Fonctionnait à** : ce commit (par son tag s’il en a un), ou sinon le dernier tag ; n’importe quel tag, branche ou commit convient, et le commit correspondant s’affiche en dessous.
- **Cassé à** : `HEAD` pour commencer.
- **Ce qui est cassé**, dans vos mots, et **Comment vérifier (facultatif)** : une commande qui échoue tant que c’est cassé.
- **Lancée par** : l’agent qui s’en charge.

**Début** ouvre une nouvelle session dans un worktree du dépôt, pour que votre propre copie reste inchangée. Son agent écrit une vérification, l’essaie aux deux extrémités, exécute git bisect pour trouver le premier commit où cela a cassé, puis explique ce qui, dans ce commit, a cassé la fonctionnalité et pourquoi, avec une correction à proposer. Voir [Trouver ce qui a cassé](/guide/engineering#find-what-broke-it).

## Travailler avec les branches

Cliquez sur le nom de la branche sous celui du dépôt pour basculer : les branches locales viennent d’abord, de la plus récente à la plus ancienne, avec ↑↓ par rapport à leur branche sur le serveur distant, puis celles **Uniquement sur le serveur distant**. Tapez pour en trouver une ; un nom qui n’est pas encore une branche propose **Nouvelle branche « … » à partir d’ici**. S’il y a des modifications non commitées, l’app demande d’abord : elles vous suivent, et si elles entrent en conflit avec cette branche, git refuse et rien ne change. Une branche présente uniquement sur le serveur distant devient une branche locale qui la suit.

**Branches** affiche d’abord la branche sur laquelle vous êtes, puis les autres, chacune avec son dernier commit et des marques : **fusionnée** (son travail est déjà dans votre branche), **uniquement ici** (absente du serveur distant), **disparue du serveur distant**, et ↑↓ par rapport à sa branche sur le serveur distant. **Nouvelle branche** en crée une à partir de l’endroit où vous êtes et bascule dessus. Chaque branche a **Basculer** et un menu ⋯ :

- **Merge into** *votre branche* : son travail rejoint le vôtre. Si les deux ont modifié les mêmes lignes, la fusion s’arrête pour que vous les résolviez.
- **Comparer avec** *votre branche* : les commits que chacune a et que l’autre n’a pas. Cliquez sur l’un d’eux pour l’ouvrir.
- **Publier** envoie sur le serveur distant une branche qui n’existe qu’ici.
- **Renommer** : sa branche sur le serveur distant garde son nom.
- **Supprimer** : une branche fusionnée disparaît aussitôt, puisque rien n’est perdu. Pour une branche non fusionnée, la question liste les commits qu’aucune autre branche n’a, et **Supprimer quand même** la supprime avec eux.

Repliées sous **Uniquement sur le serveur distant**, les branches du serveur distant qui n’ont pas d’équivalent ici : **Basculer sur** en crée une ici qui la suit, et bascule dessus.

## Mettre des modifications de côté avec une remise

Une remise met vos modifications non commitées de côté, pour que vous puissiez travailler sur autre chose et les récupérer plus tard. **Remiser les modifications** (dans l’onglet **Remises**, ou l’icône de boîte en haut de Modifications) demande ce que sont les modifications et si vous voulez **Inclure aussi les nouveaux fichiers** ; les fichiers reviennent ensuite à leur état du dernier commit.

**Remises** les liste avec leur message, la branche sur laquelle elles ont été créées, la date et le nombre de fichiers. Cliquez sur l’une d’elles pour voir ce qu’elle contient, fichier par fichier :

- **Appliquer et retirer** rétablit les modifications et retire la remise de la liste.
- **Postuler** les rétablit et conserve la remise.
- La corbeille la supprime, après confirmation. Cette action est irréversible.

Si les modifications entrent en conflit avec le contenu actuel des fichiers, les fichiers en conflit sont marqués **C** dans Modifications : résolvez-les comme après une fusion, puis commitez.

## Ouvrir une pull request depuis une session

Une pull request demande aux personnes qui s’occupent d’un dépôt d’intégrer les modifications d’une branche. Vous pouvez en ouvrir une sur GitHub ou Gitea directement depuis la session qui a fait les modifications.

Ce qu’il faut :

- Un compte GitHub ou Gitea dans [Paramètres → App → Source control](/settings?s=scm) pour le serveur où se trouve le dépôt (voir [Ajouter un compte GitHub ou Gitea](/guide/devices#add-a-github-or-gitea-account)).
- Le dossier de la session se trouve dans un dépôt git avec un serveur distant, sur une branche qui lui est propre. Une session qui travaille sur la branche principale elle-même ne peut pas en ouvrir : démarrez la session dans un worktree (une copie distincte du dépôt sur une nouvelle branche), ou basculez d’abord sur une nouvelle branche.

Pour en ouvrir une :

1. Dans le menu de la session (⋯), choisissez **Dossier et code** → **Ouvrir une pull request**.
2. La boîte de dialogue affiche la branche et sa destination (`my-branch → main on owner/repo`), le nombre de commits et de fichiers qu’elle contient, et si la branche est poussée (« la branche est poussée à l’ouverture » si ce n’est pas le cas).
3. S’il y a des modifications non commitées, cochez **Commit the … uncommitted changes first, with the title as the message** pour les inclure. Sinon, elles restent à l’écart. (La case est cochée d’office quand la branche n’a encore aucun commit.)
4. Rédigez un titre et une description (en Markdown), ou cliquez sur **Rédiger pour moi** : un modèle lit les commits, les modifications et la tâche confiée à la session, et rédige les deux. Il faut au moins un commit.
5. Cochez **Brouillon** pour l’ouvrir comme brouillon. (Gitea marque un brouillon avec « WIP: » avant le titre.)
6. Cliquez sur **Ouvrir la pull request**. L’app pousse la branche, ouvre la pull request, la lie à la session et l’ouvre dans un nouvel onglet.

Si la branche a déjà une pull request ouverte, la boîte de dialogue l’indique et propose **La lier à cette session**. Pour en lier une autre, cliquez sur **Lier une pull request existante…**, collez son adresse et cliquez sur **Lien**.

### Suivre une pull request

Une fois liée, le numéro de la pull request s’affiche à côté de la session dans la barre latérale et dans l’en-tête de la session, avec une icône pour son état (ouverte, brouillon, fusionnée ou fermée) et un point pour ses vérifications (les tests que le serveur exécute dessus : en cours, réussis ou échoués). L’app vérifie toutes les quelques minutes, et vous prévient quand elle est fusionnée ou que ses vérifications se terminent.

Cliquez sur le numéro dans l’en-tête (ou sur **Pull request #12** dans le menu de la session → **Dossier et code**) pour ouvrir sa boîte de dialogue :

- **Open on GitHub** (ou Gitea).
- **Relire les modifications** : la page de relecture, ci-dessous.
- **Vérifier maintenant** : demande tout de suite son état et ses vérifications.
- **Dissocier** : la retire de la session (la pull request elle-même reste).

## Relire ce qu’une branche modifie

La page de relecture affiche tout ce que la branche d’une session modifie depuis qu’elle a quitté sa branche de base, commité ou non, nouveaux fichiers compris. Ouvrez-la depuis le menu de la session (⋯) → **Dossier et code** → **Relire les modifications**, depuis la boîte de dialogue d’une pull request, ou depuis celle d’un worktree (**Examiner ses modifications**).

En haut : « Relecture : » et le titre de la session, la branche et sa base, le nombre de fichiers et combien sont « non commités », un lien vers la pull request s’il y en a une, et **Session** pour revenir.

Chaque fichier modifié affiche sa lettre d’état (A ajouté, M modifié, D supprimé, R renommé), son chemin, une étiquette « non commité » le cas échéant, les lignes ajoutées et supprimées, et ses modifications en dessous.

- Cochez **Vu** sur un fichier que vous avez lu : il se replie et compte dans « … sur … vus ». La marque dure jusqu’à ce que le fichier change de nouveau, et elle est conservée dans ce navigateur.
- Sur un grand écran, une liste des fichiers s’affiche à gauche avec une barre de progression : cliquez sur un fichier pour y aller.
- **Guidez-moi** : un modèle lit les modifications et rédige un court résumé, un ordre facile à suivre (l’idée centrale d’abord, puis ce qui l’utilise, les tests et la documentation en dernier) et une note sur chaque fichier indiquant ce qui a changé et ce qu’il faut examiner de près. Ensuite, **Ordre guidé** et **Par chemin** permettent de passer de cet ordre aux fichiers classés par nom. Le guide est conservé pour ces modifications précises : il est donc là la prochaine fois, jusqu’à ce que la branche change.
- **Recharger** relit les modifications.

Les nouveaux fichiers que git ne suit pas encore sont affichés lorsqu’il s’agit de petits fichiers texte. Les fichiers binaires indiquent « Fichier binaire : aucune modification de texte à afficher. »

## Utiliser le terminal

Cliquez sur **Système**, puis sur **Terminal**, ou allez à [Terminal](/terminal) : de vrais shells sur cet ordinateur. Si aucun n’est ouvert, un shell démarre dans votre dossier personnel.

- Chaque terminal est un onglet, nommé d’après son dossier et le programme qui s’y exécute. **Nouveau terminal** (+) en ouvre un autre, lui aussi dans votre dossier personnel.
- Double-cliquez sur un onglet pour le renommer.
- ✕ ferme un terminal. Si un programme s’y exécute encore, l’app demande d’abord confirmation, car fermer le terminal met fin au shell et à tout ce qu’il exécute.
- Les liens dans la sortie s’ouvrent dans un nouvel onglet.

Les terminaux s’exécutent dans le serveur tmux privé de l’app : ils continuent donc de tourner quand vous quittez la page, la rechargez ou fermez le navigateur, ainsi qu’à travers les redémarrages de l’app. Revenez, et ils sont dans l’état où vous les avez laissés.

Pour en ouvrir un dans un autre dossier, lancez-le depuis ce dossier : sur la page Fichiers, depuis le menu d’un dossier ou **Plus** (⋯) pour le dossier où vous êtes (**Ouvrir un terminal ici**), depuis l’éditeur (**Terminal dans ce dossier**), depuis un dépôt sur la page Git (**Ouvrir un terminal ici**) et depuis le menu de la session → **Dossier et code** → **Ouvrir un terminal ici**.

### Le panneau du terminal

Sur ordinateur, `` Ctrl+` `` (aussi sur Mac) affiche ou masque un panneau de terminal en bas de n’importe quelle page, avec les mêmes terminaux que la page Terminal. Faites glisser son bord supérieur pour l’agrandir ou le réduire, et cliquez sur **Masquer le panneau** pour le fermer. L’option **Afficher ou masquer le panneau du terminal** de la zone de recherche fait la même chose. Les terminaux ouverts depuis d’autres pages apparaissent dans ce panneau.

### Suggestions en gris

Tant qu’un shell attend une commande, la suite la plus probable de ce que vous tapez s’affiche en gris après le curseur :

- → ou Fin en prend la totalité ; Ctrl+→ (ou Alt+→) prend le mot suivant.
- Les suggestions viennent des commandes que vous avez déjà tapées (celles exécutées dans le même dossier d’abord, puis les récentes et les fréquentes avant les anciennes), de l’historique propre à votre shell et des commandes que des agents ont exécutées récemment.

Ctrl+Espace (aussi sur Mac), ou **Suggestions** dans la barre d’onglets, ouvre une liste plus complète :

- les commandes précédentes qui commencent par ce que vous avez tapé ;
- ce qui convient au mot en cours : commandes et branches git, scripts du projet (`npm run …`), cibles make, hôtes SSH, dossiers et fichiers ;
- dès que vous avez tapé quelques lettres, **Écrire une commande pour « … »**, en dessous.

↑ et ↓ permettent de choisir, Entrée ou un clic place la commande sur la ligne, et Échap ferme la liste. Rien ne s’exécute jamais tout seul : vous appuyez toujours sur Entrée dans le shell.

Les suggestions ne fonctionnent qu’à l’invite d’un shell, pas dans un programme comme un éditeur ou Python. Les commandes qui commencent par une espace, et celles qui semblent contenir un mot de passe ou une clé, ne sont pas mémorisées. Désactivez le texte gris dans [Paramètres → App → Général → Suggestions du terminal](/settings?s=general&find=Terminal%20suggestions) ; la liste Ctrl+Espace fonctionne dans les deux cas.

### Demander une commande avec des mots

Tapez ce que vous voulez en langage courant à l’invite, par exemple `trouver les fichiers les plus gros ici`, appuyez sur Ctrl+Espace et choisissez **Écrire une commande pour « trouver les fichiers les plus gros ici »**. Un modèle (Claude quand Claude Code est connecté, Codex sinon) écrit jusqu’à trois commandes adaptées à votre shell et à votre dossier, chacune accompagnée d’une courte note sur ce qu’elle fait. Choisissez-en une pour la placer sur la ligne, lisez-la, puis appuyez vous-même sur Entrée pour l’exécuter.

### Sur téléphone

La page Terminal ajoute une rangée de touches qui manquent aux téléphones : **Ctrl** et **Alt** (elles s’appliquent à la touche suivante que vous tapez), **Suggestions**, ^C, ^D, ^Z, ^L, ^R, Échap, Tab, les flèches, `|`, `/`, `-`, `~`, Début et Fin. Il n’y a pas de panneau inférieur sur téléphone : les terminaux ouverts depuis d’autres pages s’ouvrent sur la page Terminal.

## Consulter un serveur de développement avec Aperçu

Quand vous ou un agent exécutez ici le serveur de développement d’une app web (`npm run dev`, un serveur Python), Aperçu l’affiche, sur cet ordinateur ou sur tout autre appareil qui accède à l’app. Cliquez sur **Système**, puis sur **Aperçu**, ou allez à [Aperçu](/preview).

À gauche, **Apps web** liste les serveurs de cet ordinateur qui répondent par une page web : chacun avec le nom de son projet (celui de son paquet, sinon celui de son dossier), son port, le titre de la page, ce qui la sert quand l’app peut le savoir (Vite, Next.js, Python…) et son dossier. **Autres serveurs**, replié, liste le reste : API, bases de données et autres. **Un autre port** en ouvre un qui n’est pas listé. La liste s’actualise toutes les 5 secondes ; le bouton d’actualisation la relit immédiatement.

Cliquez sur une app web pour l’afficher à droite. Sur ordinateur, la première s’affiche tout de suite ; sur téléphone, elle occupe tout l’écran, avec **Tous les serveurs** pour revenir. Au-dessus :

- **Retour**, **Suivant** et **Recharger**, ainsi que la barre d’adresse avec le port et le chemin de la page. Elle suit les liens sur lesquels vous cliquez dans l’app ; saisissez un autre chemin et appuyez sur Entrée pour y aller.
- **Ordinateur**, **Tablette** et **Téléphone** : l’app à la largeur de cet écran (390 pixels pour un téléphone), réduite pour tenir.
- **Plus** (⋯) : **Ouvrir dans un onglet séparé**, **Interroger un agent sur cet écran** (la page de démarrage s’ouvre avec une image de l’écran jointe, réglée pour travailler dans le dossier de l’app, et « À propos de cet écran de … » à compléter), **Enregistrer une image**, et **Afficher sous forme d’image** ou **Afficher en direct**.

### En direct, ou sous forme d’images

Aperçu affiche un serveur de développement en direct via le port d’aperçu de l’app (8791 sauf si votre installation en a défini un autre), ce qui sépare le serveur de développement de l’app : votre connexion ne l’atteint jamais, et le rechargement à chaud fonctionne. Un navigateur n’affiche qu’un serveur à la fois : en afficher un autre déplace le port d’aperçu vers lui.

Quand votre navigateur ne peut pas atteindre le port d’aperçu (vous accédez à l’app par un tunnel ou un proxy avec un seul nom d’hôte, par exemple), la page s’ouvre à la place dans un navigateur sur cet ordinateur, à la taille choisie, et est diffusée en direct dans Aperçu : cliquez, saisissez, faites défiler et collez comme dans n’importe quelle page, et le rechargement à chaud s’y voit aussi. Sur téléphone, touchez et faites glisser ; **Saisir** sous la page fait apparaître le clavier, à côté des touches qui manquent aux téléphones (Tab, Entrée, Échap, les flèches). La page n’atteint que ce serveur de développement, pas les autres serveurs de cet ordinateur. Quand vous revenez dans Aperçu, la page est là où vous l’avez laissée ; après 15 minutes sans que personne ne regarde, elle se ferme, et se rouvre quand vous revenez. **Enregistrer une image** et **Interroger un agent sur cet écran** prennent la page telle qu’elle est affichée à l’écran.

Pour avoir la page elle-même dans votre navigateur plutôt que diffusée :

- sur le même réseau, ou via un VPN comme Tailscale ou WireGuard, ouvrez l’app à l’adresse propre de cet ordinateur : le port fonctionne directement ;
- derrière un tunnel ou un proxy, donnez au port d’aperçu son propre nom d’hôte (preview.example.com → localhost:8791) et démarrez l’app avec `PREVIEW_ORIGIN` défini sur ce nom.

**Afficher sous forme d’image** dans **Plus** (⋯) affiche à la place des images fixes prises sur cet ordinateur ; **Recharger** en prend alors une nouvelle. La diffusion et les images nécessitent un Chromium sur cet ordinateur : celui qu’utilise le navigateur ([Paramètres → Capacités → Navigateur](/settings?s=browser) peut en télécharger un). « Les aperçus sont désactivés » signifie que l’app a été démarrée avec `PREVIEW_PORT=0`. Aperçu n’existe que pour la machine sur laquelle vous avez ouvert l’app, pas pour les autres machines vers lesquelles vous basculez.

## Relire les modifications d’un agent sur une app web

Quand un agent modifie l’apparence ou le fonctionnement d’une app web (un site ou une app avec un serveur de développement, ou des fichiers HTML), il vous montre des captures d’écran à relire : avant sa première modification, une image de chaque écran qu’il va changer, puis, quand il a terminé, les mêmes écrans à nouveau. Il démarre d’abord le serveur de développement de l’app s’il ne tourne pas.

Un agent qui a des captures d’écran sous forme de fichiers (il les a prises avec un script, dans un autre navigateur, ou on les lui a données) les montre de la même façon, dans une seule carte au lieu d’images collées dans sa réponse. Cela ne demande pas de Chromium sur cet ordinateur, et cela fonctionne aussi dans une [session confidentielle](/guide/sessions#keep-a-session-confidential).

- Les captures d’une même réponse s’affichent ensemble, dans une seule carte de petites images, une par écran. L’agent peut regrouper les écrans sous des titres de son choix (« Ajouter un serveur », « Paramètres »). Une carte **Avant** montre les écrans tels qu’ils étaient ; dans une carte **Avant et après**, la paire d’un écran est signalée par **Avant → après**, avec son avant et son après séparés au milieu.
- Les autres versions d’un écran font partie de son image, ce ne sont pas des images en plus : un symbole de téléphone signale un écran que l’agent a aussi pris à la taille d’un téléphone, et un symbole de soleil et de lune un écran qu’il a aussi pris avec les thèmes sombre et clair (quand seuls certains écrans ont les deux). Quand une réponse contient plus d’écrans que n’en tient une rangée, la carte montre la première rangée avec **Tout afficher** en dessous (**En afficher moins** les replie).
- Cliquez sur une image pour la relire : sur un écran large, elle s’ouvre à côté de la conversation, comme les pages ; dans une fenêtre plus étroite ou sur téléphone, par-dessus l’app. Les flèches en haut permettent d’aller aux autres écrans de la réponse. Si l’agent a écrit une note sur l’écran, elle s’affiche en haut.
- Les boutons ordinateur et téléphone permettent de passer d’une taille à l’autre, et les boutons lune et soleil du thème sombre au thème clair, quand l’agent a pris les deux. **Les voir en grand** ouvre les images par-dessus l’app.
- Quand l’agent a fourni une image avant pour un écran, son avant et son après s’affichent l’un sur l’autre : faites glisser le curseur (ou appuyez sur ← et →) pour passer de l’un à l’autre, ou choisissez **Côte à côte**.
- **Semble correct** et **Modifier quelque chose** placent une ligne sur l’écran dans la zone de message, que vous complétez et envoyez.
- Sur un écran large, l’après d’un écran s’ouvre tout seul à côté de la conversation dès qu’il arrive.
- Une image après sans image avant s’affiche seule, avec « Aucune image avant à comparer » ; l’agent est invité à prendre d’abord l’image avant la prochaine fois.

Vous pouvez aussi demander une capture d’écran à tout moment : « montre-moi la page des paramètres sur un téléphone », ou « avec le thème sombre » (un site qui suit le mode clair ou sombre de votre ordinateur s’affiche dans celui que vous nommez, et en clair sinon). Une page qu’un agent a créée pour la conversation ou conservée dans un projet (une maquette, un rapport) est capturée telle que l’app l’affiche, en thème sombre sauf si le thème clair est demandé, afin que l’agent voie ce qui se lirait mal avant vous. Les images que l’app prend d’une app web sont prises sur cet ordinateur par un Chromium ([Paramètres → Capacités → Navigateur](/settings?s=browser)) ; celles qu’un agent montre à partir de fichiers sont copiées dans l’app. Dans les deux cas, elles sont conservées avec leur session, et restent donc quand l’agent range ses propres fichiers : elles disparaissent quand la session est supprimée, et les plus anciennes partent en premier au-delà de 500 Mo au total.

## Surveiller cet ordinateur dans Moniteur

Cliquez sur **Système**, puis sur **Moniteur**, ou allez à [Moniteur](/system/monitor). En haut : le nom de l’ordinateur, son processeur, son nombre de threads, depuis combien de temps il est allumé et son système d’exploitation.

Les tuiles du haut affichent, avec un petit graphique des deux dernières minutes :

- **CPU** : le taux d’occupation du processeur et les charges moyennes.
- **Mémoire** : la quantité utilisée, sur combien au total.
- **GPU × n** (quand il y a des GPU NVIDIA) : l’utilisation moyenne et la mémoire graphique utilisée.
- **Réseau** : les données entrantes et sortantes par seconde.
- **E/S disque** : les données lues et écrites par seconde.

Plus bas, plus en détail :

- **CPU** : un graphique, la charge de chaque cœur et la température quand elle est connue.
- **Mémoire** : un graphique, la RAM utilisée avec le cache et les tampons, le swap et la quantité disponible.
- Une carte par **GPU** : utilisation, mémoire graphique, consommation par rapport à sa limite, température, ventilateur, état de performance et fréquence (sur téléphone, sans son graphique).
- **Réseau** : téléchargement et envoi, et chaque connexion réseau.
- **Stockage** : lectures et écritures, et chaque disque avec son espace libre, son système de fichiers et son taux de remplissage.
- **Capteurs** : les températures, en rouge à partir de 85 °C.
- **Noyaux de notebook** (tant que certains s’exécutent) : chacun avec son environnement, son état, sa mémoire, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau) pour son notebook, et **Arrêter**.
- **Sessions** (tant que certaines s’exécutent, sous Linux et sur Mac) : les programmes de chaque session active (ceux de son agent, les commandes qu’elle exécute, les serveurs qu’elle a démarrés), ceux qui utilisent le plus de mémoire en premier, avec leur nombre, leur CPU et leur mémoire. À droite, les limites sous lesquelles les sessions s’exécutent : cliquez dessus pour les modifier ([Limiter chaque session](/guide/app#limit-each-session)). Cliquez sur une session pour l’ouvrir.
- **Processus** : les 12 programmes les plus actifs selon le **CPU** ou la **Mémoire** (ou le **GPU**, pour ceux qui en utilisent un), avec l’identifiant du processus, l’utilisateur, le CPU et la mémoire. Pointez une ligne pour voir sa commande complète.

Une mesure est prise toutes les 2 secondes tant que la page est ouverte, et les 10 dernières minutes sont conservées.

## Interroger un agent

- « Dans le fichier que j’ai ouvert, ajoute un commentaire au-dessus de chaque fonction pour dire ce qu’elle fait. »
- « Copie les PDF de ~/Downloads de cette semaine dans mon projet Impôts 2026. »
- « Remplis ~/Downloads/rental-application.pdf avec mes informations, et demande-moi tout ce que tu ne sais pas. »
- « Résume mes surlignages de ~/Papers/sparse-retrieval.pdf, page par page, avec mes notes. »
- « Parmi mes notes sur l’article que j’ai ouvert, lesquelles contredisent ce que dit l’article ? »
- « Garde mes notes sur ~/Papers/attention.pdf dans mon projet Thèse. »
- « Surligne en vert chaque phrase de ~/Papers/sparse-retrieval.pdf qui énonce un résultat, avec une note indiquant de quelle expérience il provient. »
- « Fusionne les PDF de ~/Documents/Scans en un seul fichier, la couverture en premier, et remets d’aplomb les pages tournées sur le côté. »
- « Quels fichiers de ~/code/shop mentionnent le paiement, et que fait chacun avec ? »
- « Ajoute à ~/Documents/people.csv une colonne avec la part de chaque personne dans le total. »
- « Crée dans ~/code/ml un notebook qui entraîne un petit classificateur d’images, exécute-le, et prépare un environnement dans lequel je pourrai l’exécuter. »
- « Ouvre une pull request pour la branche de cette session, avec un titre et une description rédigés à partir des commits. »
- « Associe https://github.com/acme/site/pull/42 à cette session. »
- « Les vérifications de la pull request de cette session sont-elles déjà passées ? »
- « Rédige un guide de lecture pour ce que cette branche modifie. »
- « Résous les conflits de fusion dans ~/code/shop-api : garde l’intention de chaque côté, puis dis-moi ce que tu as choisi. »
- « Qu’est-ce qui a changé dans ~/code/shop-api cette semaine ? Résume les commits en langage simple. »
- « La recherche est devenue lente après la v2.3 dans ~/code/shop-api : trouve le commit qui l’a ralentie. »
- « Quels serveurs de développement tournent sur cet ordinateur en ce moment ? »
- « Agrandis le bouton de la page de paiement, et montre-moi l’avant et l’après sur un téléphone, avec le thème sombre. »
- « Lance les tests Playwright qui prennent des captures de chaque page, puis montre-les-moi sous un titre pour chaque partie de l’app, avec celles du téléphone à côté de celles de l’ordinateur. »
- « Qu’est-ce qui utilise le plus de mémoire sur cet ordinateur ? »
