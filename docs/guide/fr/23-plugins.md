# Plugins

Un plugin apporte aux agents tout ce dont ils ont besoin pour un type de travail, en une seule fois : des compétences, des outils, quelques lignes de consignes, des fichiers qui lui sont propres, et tout ce qu’il faut installer. Chaque agent que l’app démarre reçoit les plugins que vous activez : Claude Code, Codex, Custom et les autres, sans distinction. Cette rubrique présente les plugins fournis avec l’app, l’ajout d’autres plugins depuis un lien, un fichier ou un dossier, la création et le partage des vôtres, ainsi que les plugins propres à Claude Code et à Codex.

![Paramètres → Plugins : vos plugins et ceux fournis avec l’app](images/plugins.webp)

## Ce qu’est un plugin

Un plugin est un dossier qui peut contenir :

- **Compétences** : des méthodes rédigées que les agents chargent quand une tâche en réclame une. Elles rejoignent la [Bibliothèque de compétences](/guide/skills) tant que le plugin est activé.
- **Outils** : des serveurs d’outils (serveurs MCP) qui donnent de nouvelles capacités aux agents, comme lire le texte dans des images ou interroger une base de données. Un serveur s’exécute sur cet ordinateur, ou bien c’est un service accessible à une adresse.
- **Instructions** : quelques lignes ajoutées aux consignes propres de chaque agent tant que le plugin est activé.
- **Fichiers propres** : données, modèles, images ou scripts que ses compétences et ses outils utilisent.
- **Ce dont il a besoin** : d’autres plugins, des paquets Python ou Node, des programmes installés sur cet ordinateur, des fichiers à télécharger et des clés de votre coffre.

Les plugins suivent le format ouvert Agent Plugins, que d’autres outils (VS Code, Cursor, Codex, OpenHands…) savent lire aussi. Les plugins conçus pour Claude Code peuvent également être ajoutés ici : leurs compétences et leurs outils sont accessibles à tous les agents.

## Ouvrir la page Plugins

Allez dans **Paramètres → Agents → Plugins** ([l’ouvrir](/settings?s=plugins)). Sur un téléphone, ouvrez les Paramètres, puis touchez **Plugins** sous Agents.

En haut, trois onglets : **Tous les agents** (les plugins de cette app, pour tous les agents), **Claude Code** et **Codex** (les plugins propres à chacun de ces agents : voir [les plugins propres à Claude Code et à Codex](#claude-codes-and-codexs-own-plugins)).

Sous **Tous les agents** :

- un champ de recherche, et le bouton **Ajouter** à côté du titre de la section, avec **Créer un plugin**, **En créer un avec un agent**, **Depuis un lien**, **Depuis un fichier .zip** et **Depuis un dossier** ;
- pendant l’ajout ou la configuration d’un plugin, ses étapes, au fur et à mesure ;
- **Vos plugins** : ceux que vous avez ajoutés, chacun avec son interrupteur et un menu **⋯** (**Détails**, et **Le modifier** pour un plugin que vous avez créé ou que vous utilisez depuis un dossier) ; le (i) à côté du titre indique qu’ils fonctionnent avec tous les agents. Un plugin que vous avez créé affiche **Les vôtres**, un plugin ajouté depuis un lien, un fichier ou le dossier de quelqu’un d’autre affiche **Ajoutés par vous** ;
- **Fournis avec l’app** : les plugins intégrés pas encore ajoutés, chacun avec **Ajouter**.

Chaque plugin affiche son nom et sa version, son utilité, ce qu’il apporte (« 1 compétence · 1 serveur d’outils ») et tout ce qui l’empêche de fonctionner pleinement : échec de la configuration, programme requis manquant, clé non enregistrée. Cliquez sur le nom d’un plugin (ou sur **⋯ → Détails**) pour l’ouvrir.

Vous pouvez aussi trouver des plugins depuis le champ de recherche (Ctrl+K, ⌘K sur un Mac) : ils apparaissent sous **Plugins**.

## Ajouter un plugin fourni avec l’app

1. Sous **Fournis avec l’app**, cliquez sur **Ajouter** sur sa ligne, ou ouvrez-le et cliquez sur **Ajouter**.
2. Ses étapes s’affichent en haut de la page : l’ajout, puis la configuration (ses paquets et ses téléchargements). Il est activé dès qu’il est prêt.

Un plugin qui a besoin d’autres plugins les apporte avec lui : ils sont ajoutés en premier, et la page du plugin indique lesquels avant l’ajout.

## Les plugins fournis avec l’app

- **Audio et vidéo** : convertir, découper, assembler, compresser et inspecter de l’audio et de la vidéo, extraire le son, égaliser le volume d’un podcast, raccourcir les longues pauses, couper un enregistrement à partir d’une liste des passages à garder, créer des clips verticaux, des GIF et des miniatures, ajouter des sous-titres, et télécharger des médias dont vous avez le droit de disposer. Il nécessite ffmpeg sur cet ordinateur (sa page explique comment l’obtenir) et installe yt-dlp dans son propre environnement.
- **Livres numériques** : lire les détails, la table des matières et le texte d’un EPUB, créer un EPUB valide avec une couverture et une table des matières à partir d’un manuscrit en Markdown ou en HTML, et en vérifier ou en réparer un avant son envoi vers Kindle, Apple Books ou Kobo. Il installe les paquets Python dont il a besoin dans son propre environnement ; avec EPUBCheck sur cet ordinateur, il lance aussi la vérification qu’utilisent les boutiques, et avec pandoc, il accepte aussi les fichiers Word.
- **Documentation de bibliothèques** : la documentation à jour et des exemples de code pour les bibliothèques et frameworks de programmation, issus du service de Context7, afin que les agents écrivent du code pour la version que vous utilisez. Rien n’est installé ; les questions sont envoyées à Context7.
- **Enregistrements de réunions** : à partir de l’enregistrement d’une réunion, d’un appel ou d’un entretien, des notes : un résumé, les décisions, les actions à mener avec leurs responsables et leurs dates, les questions ouvertes et un e-mail de suivi, chacun avec l’heure à laquelle cela a été dit. Il apporte **Transcription vocale** avec lui.
- **Python pour les données** : un Python à part, avec pandas, NumPy, SciPy, Matplotlib, openpyxl et PyArrow, pour analyser des tableaux et créer des graphiques sans rien installer dans votre propre Python.
- **Transcription vocale** : les enregistrements, les notes vocales et les vidéos deviennent du texte et des sous-titres sur cet ordinateur, avec Whisper, dans une centaine de langues : sur une carte graphique NVIDIA quand il y en a une (sa configuration ajoute alors les bibliothèques CUDA de NVIDIA, environ 1,3 Go), sinon sur le processeur, et sur le processeur aussi quand la carte échoue, avec l’explication. Un Mac transcrit avec son processeur : ce Whisper ne prend pas en charge le GPU d’Apple. Il apporte **Audio et vidéo** avec lui ; ses modèles se téléchargent une seule fois, à la première utilisation de chacun.
- **Bases de données SQLite** : des outils pour explorer les bases de données SQLite, les interroger en toute sécurité, les modifier en une seule fois, et échanger des données avec des fichiers CSV. Il ne nécessite que Python 3.
- **Texte à partir d’images** : lit le texte des images, des photos de documents, des captures d’écran, des tickets de caisse et des PDF numérisés, sur cet ordinateur : sur sa carte graphique quand il y en a une (une carte NVIDIA, pour laquelle sa configuration ajoute la version GPU d’ONNX Runtime avec les bibliothèques CUDA de NVIDIA, environ 2 Go ; ou celle d’un Mac, via Core ML), sinon sur le processeur, et sur le processeur aussi quand la carte échoue, avec l’explication.

## Ouvrir un plugin

Cliquez sur un plugin. Sa fenêtre affiche :

- son origine (**Fourni avec l’app**, un lien, un fichier, **Créé ici** ou un dossier), son auteur, sa licence et son site web ;
- son interrupteur, une fois ajouté : **Activé pour tous les agents** ou **Désactivé** ;
- son utilité ;
- **Ce qu’il apporte aux agents** : ses compétences (avec le moment où chacune est utilisée), ses serveurs d’outils (ce que chacun exécute, ou où il se trouve) et ses consignes ; ainsi que les agents qui le reçoivent ;
- **Ce dont il a besoin**, chaque élément avec une coche ou une croix : d’autres plugins, des paquets Python et Node, des fichiers à télécharger, des programmes sur cet ordinateur (avec la façon d’obtenir celui qui manque) et des clés (avec **L’ajouter** pour une clé pas encore enregistrée) ;
- ses propres fichiers, les éventuels problèmes dans son dossier, et **À propos** : sa description ;
- pour un plugin que vous avez ajouté, son dossier et son dossier de données.

Un plugin que vous avez ajouté a un menu **⋯** en bas : **Le modifier** (pour les plugins que vous avez créés ou que vous utilisez depuis un dossier), **Obtenir la dernière version** (pour un plugin issu d’un lien), **Le configurer à nouveau**, **Empaqueter dans un .zip**, **Afficher son dossier**, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau ; voir [Travailler avec des fichiers et des dossiers](/guide/files-git#work-with-files-and-folders)) et **Retirer**.

## Ce dont un plugin a besoin, et sa configuration

Quand un plugin a besoin de paquets ou de téléchargements, son ajout les configure dans un dossier de données qui lui est propre, jamais pour l’ensemble de l’ordinateur :

- Les paquets Python vont dans un environnement Python à part (créé avec uv si cet ordinateur l’a, sinon avec les outils propres à Python). Sur un ordinateur doté d’un GPU NVIDIA, un plugin peut ajouter les paquets dont il a besoin pour s’y exécuter, comme les bibliothèques CUDA de NVIDIA ; si leur installation échoue, il fonctionne sur le processeur.
- Les paquets Node vont dans un dossier à part, installés sans exécuter leurs scripts d’installation.
- Les fichiers sont téléchargés dans son dossier de données, et vérifiés par rapport à leur empreinte quand le plugin en fournit une.

Les agents savent où se trouvent son Python, ses paquets et ses fichiers, et ses serveurs d’outils les trouvent en premier. Les outils d’un plugin n’atteignent les agents qu’une fois sa configuration terminée.

Si la configuration échoue, la ligne du plugin l’indique ; sa fenêtre en donne la raison, avec **Réessayer**, et **Afficher ce qui a été imprimé** affiche la sortie complète. Quand les besoins d’un plugin changent (mise à jour de l’app ou du plugin), il est configuré à nouveau : automatiquement pour les plugins intégrés, et pour les autres quand vous cliquez sur **Le configurer à nouveau**.

Les programmes dont il a besoin (comme ffmpeg) ne sont pas installés à votre place : un programme manquant s’affiche avec la façon de l’obtenir. Une clé dont il a besoin provient de votre coffre, par son nom : ajoutez-la dans [Apps → Apps connectées → Clés](/apps/connected?tab=keys). Ses serveurs d’outils reçoivent la clé ; les agents ne la voient jamais.

## Activer ou désactiver un plugin

Utilisez l’interrupteur sur sa ligne ou dans sa fenêtre. Désactivé, les agents cessent de recevoir ses compétences, ses outils et ses consignes dès leur prochaine session ; il reste ajouté, avec sa configuration, pour pouvoir le réactiver.

- Désactiver un plugin dont d’autres ont besoin désactive aussi ces derniers : l’app demande d’abord confirmation et les nomme.
- Activer un plugin active les plugins dont il a besoin.

## Ajouter un plugin depuis un lien, un fichier ou un dossier

1. Cliquez sur **Ajouter**, puis sur **Depuis un lien**, **Depuis un fichier .zip** ou **Depuis un dossier**.
2. Indiquez-le :
   - **Depuis un lien** : un dépôt Git contenant un plugin, sous la forme propriétaire/dépôt (pour GitHub) ou son adresse, ou un lien vers le dossier du plugin sur GitHub. **Une branche, ou un dossier dans le dépôt…** accepte une branche ou une étiquette, et un dossier.
   - **Depuis un fichier .zip** : un plugin empaqueté dans un .zip, ici ou ailleurs. Choisissez-le ou déposez-le sur la zone prévue.
   - **Depuis un dossier** : un dossier sur cet ordinateur. Le plugin est utilisé là où il se trouve : les modifications faites dans son dossier atteignent les nouvelles sessions, ce qui convient à un plugin que vous êtes en train de créer.
3. Cliquez sur **Le consulter**. Vous voyez ce que le plugin apporte aux agents et ce dont il a besoin, quels plugins intégrés il amène avec lui, et ceux dont il a besoin que l’app n’a pas (il ne peut alors pas être ajouté tant que vous ne les avez pas ajoutés).
4. Cliquez sur **Ajouter** (ou **La remplacer**, quand un plugin du même nom est déjà présent ; ses données sont conservées).

Ses étapes s’affichent pendant sa configuration. Un plugin portant le nom d’un plugin intégré ne peut pas être ajouté : renommez-le dans son plugin.json.

## Créer votre propre plugin

1. Cliquez sur **Ajouter**, puis sur **Créer un plugin**.
2. Donnez-lui un **Nom** et son utilité, puis cliquez sur **La créer**. Il est ajouté, activé, et son éditeur s’ouvre.
3. Remplissez ses onglets, puis cliquez sur **Enregistrer** :
   - **À propos** : le nom que les gens voient, sa version (augmentez-la quand vous partagez une nouvelle version), son utilité, son groupe et son image.
   - **Compétences** : **Rédiger une compétence** (son nom, son groupe, quand l’utiliser et ses consignes), ou **Copier l’une des vôtres** parmi vos compétences. Cliquez sur une compétence pour la modifier.
   - **Outils** : **Ajouter un serveur d’outils** : **Un programme d’ici** (le programme à lancer, ses arguments un par ligne, et son environnement sous forme de lignes NOM=valeur), ou **Une adresse** (l’adresse d’un serveur MCP, et des en-têtes). Utilisez `${PLUGIN_ROOT}` pour le dossier du plugin et `${PLUGIN_DATA}` pour son dossier de données : les arguments d’un serveur deviennent par exemple `${PLUGIN_ROOT}/files/server.py`.
   - **Besoins** : paquets Python, paquets Node, programmes, clés, autres plugins et fichiers à télécharger, un par ligne.
   - **Fichiers** : **Ajouter des fichiers** y place des fichiers (jusqu’à 50 Mo chacun, 200 Mo au total) ; l’icône de corbeille en retire un. Les fichiers sont ajoutés et retirés immédiatement, sans **Enregistrer**.
   - **Instructions** : quelques lignes que chaque agent reçoit tant que le plugin est activé.

L’enregistrement vérifie tout au préalable : une compétence doit indiquer quand l’utiliser, le programme d’un serveur d’outils doit être un seul programme (pas une ligne de shell), etc. ; l’app indique ce qu’il faut corriger. Quand ses paquets ont changé, il est configuré à nouveau.

Les plugins que vous créez sont conservés dans le dossier de données de l’app (plugins/mine). Pour en modifier un plus tard, ouvrez-le et choisissez **Le modifier** dans son menu **⋯**.

**En créer un avec un agent** ouvre une nouvelle session avec le début d’une demande (« Aide-moi à créer un plugin pour Hydor qui… ») : dites ce qu’il doit faire, et l’agent l’écrit, le vérifie et l’ajoute depuis son dossier avec votre accord.

## Partager un plugin

- **Sous forme de fichier** : ouvrez le plugin, puis **⋯ → Empaqueter dans un .zip** (ou **Empaqueter dans un .zip** dans son éditeur). Chacun peut l’ajouter avec **Ajouter → Depuis un fichier .zip**. Sa configuration n’est pas empaquetée : elle est refaite là où il est ajouté.
- **Sous forme de lien** : placez son dossier dans un dépôt Git (sur GitHub, par exemple). Chacun peut l’ajouter avec **Ajouter → Depuis un lien**, et obtient vos nouvelles versions avec **Obtenir la dernière version**.

D’autres outils qui lisent le format Agent Plugins peuvent aussi utiliser ses compétences et ses serveurs d’outils ; les éléments que seule cette app lit (ce dont il a besoin, ses consignes) sont conservés dans sa partie `com.naget.agent`, qu’ils ignorent.

## Mettre à jour ou retirer un plugin

- Les plugins intégrés sont mis à jour avec l’app.
- Un plugin issu d’un lien : **⋯ → Obtenir la dernière version** le télécharge à nouveau et le configure à nouveau si ses besoins ont changé.
- Un plugin issu d’un fichier .zip : ajoutez le fichier plus récent ; il remplace l’ancien.
- Un plugin issu d’un dossier : les modifications faites dans le dossier atteignent d’elles-mêmes les nouvelles sessions.

Pour en retirer un : **⋯ → Retirer**, puis confirmez. Les plugins qui en ont besoin sont retirés aussi (l’app les nomme d’abord). Ses paquets et ses téléchargements sont supprimés. Un plugin créé ici est supprimé avec son dossier : empaquetez-le d’abord dans un .zip pour en garder une copie. Un plugin utilisé depuis l’un de vos dossiers reste dans son dossier.

## Quels agents reçoivent un plugin

Chaque session que l’app démarre reçoit les plugins qui sont activés, configurés, et dont les plugins requis sont aussi activés :

- leurs **compétences** via la Bibliothèque de compétences, comme les autres (voir [Quels agents reçoivent quelles compétences](/guide/skills#which-agents-get-which-skills)). Une compétence dont le nom existe déjà dans la Bibliothèque est écartée : la fenêtre de son plugin indique quelle compétence les agents reçoivent à la place ;
- leurs **serveurs d’outils** en tant que serveurs MCP, lancés dans le dossier du plugin avec ses propres paquets ;
- leurs **consignes**, avec une ligne indiquant où se trouvent leurs paquets et leurs fichiers.

Un plugin peut être destiné à certains agents seulement ; sa fenêtre indique lesquels. Les sessions déjà en cours reçoivent les modifications d’un plugin à leur prochain démarrage.

## Plugins propres à Claude Code et à Codex

Claude Code et Codex ont chacun leurs propres plugins, issus de leurs places de marché, que seuls eux utilisent. Chacun a un onglet dans la page Plugins :

- **Claude Code** : **Installée** (chaque plugin avec son interrupteur et **Désinstaller**), **Parcourir** (rechercher dans les places de marché, les plus installés en premier, **Installer**) et **Places de marché** (en ajouter une par propriétaire/dépôt, une adresse Git ou un dossier ; en retirer une).
- **Codex** : **Ajouté à Codex** (chaque plugin avec **Retirer**), **En trouver d’autres** (rechercher dans les places de marché de Codex, **Ajouter**) et **Places de marché** (en ajouter, **Actualiser** ou en retirer une).

Leurs compétences apparaissent dans la page Compétences, sous les compétences propres à l’agent. Pour utiliser un plugin Claude Code avec tous les agents, ajoutez-le aux plugins de cette app avec **Ajouter → Depuis un lien**.

## Plugins et sécurité

Les serveurs d’outils d’un plugin exécutent des programmes sur cet ordinateur sous votre identité, et chaque agent reçoit ses instructions. N’ajoutez que des plugins de personnes en qui vous avez confiance, et regardez ce qu’un plugin apporte et ce dont il a besoin avant de l’ajouter : l’app l’affiche avant toute installation. Les plugins fournis avec l’app sont conçus et vérifiés avec elle.

Les clés ne sont jamais placées dans un plugin : un plugin nomme les clés dont il a besoin, et ses serveurs les obtiennent depuis votre coffre pendant leur exécution.

## Demander à un agent

- « Quels plugins ai-je, et qu’apporte chacun aux agents ? »
- « Ajoute le plugin Speech to text et transcris ~/Recordings/standup.m4a. »
- « Désactive le plugin Library docs. »
- « Crée un plugin avec les trois compétences de rédaction de notre équipe et regroupe-le dans un fichier .zip. »
- « Ajoute le plugin à l’adresse github.com/acme/agent-tools/tree/main/plugins/invoices. »
- « Pourquoi le plugin Text from pictures indique-t-il que sa configuration a échoué ? »
