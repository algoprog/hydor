# Recherche : articles, écriture et labo

Hydor aide pour tout le travail autour de la recherche : suivre votre domaine, lire et organiser des articles, vérifier un article avant sa soumission, répondre aux évaluations et présenter votre travail, ainsi que les expériences et les rapports de votre labo. L’essentiel prend la forme d’apps prêtes à l’emploi sous **Recherche**, **Écriture**, **Labo** et **Travail** sur la page [Apps](/apps), que les agents exécutent aussi pour vous quand vous le demandez ; les vérifications d’un article se trouvent dans l’[éditeur LaTeX](/guide/library), et vos exécutions d’entraînement dans [Système → Expériences](/guide/experiments). Vous évaluez la soumission de quelqu’un d’autre ? Utilisez une [session confidentielle](/guide/sessions#keep-a-session-confidential).

![Les apps pour la recherche sur la page Apps](images/researchers.webp)

## Suivre votre domaine

Six apps prêtes à l’emploi vous tiennent au courant de votre domaine : elles se trouvent sur la page Apps sous **Recherche** (ouvrez [Apps](/apps) et choisissez la pastille **Recherche**). Cinq d’entre elles s’ouvrent sur leur propre page et peuvent se mettre à jour toutes seules chaque jour : **Radar des articles**, **Alertes de citations**, **Veille des nouveaux modèles**, **Radar des échéances** et **Travaux connexes vivants**. La sixième, **Détecteur de lacunes**, s’exécute à la demande, avec un formulaire, et les agents peuvent l’exécuter pour vous dans n’importe quelle session.

Elles consultent des services ouverts, avec modération : arXiv, OpenAlex, Semantic Scholar, Hugging Face, ainsi que les listes d’échéances ccfddl et ai-deadlines sur GitHub. Aucune ne demande de clé, mais deux sont utiles : une **Clé d’API OpenAlex** (gratuite : sans elle, OpenAlex n’est interrogé que deux fois au plus par mise à jour, sur un petit budget que partagent tous les utilisateurs de votre réseau) et une **Clé d’API Semantic Scholar** (gratuite sur demande : sans elle, Semantic Scholar est souvent saturé, et OpenAlex répond à sa place, sans les phrases qui vous citent). Saisissez-les dans les paramètres de l’app, les curseurs en haut de sa page, sous **Clés dont elle a besoin** : elles vont dans votre coffre, et seulement vers ces services.

Sur la page d’une app, **Mettre à jour** en haut en lance une nouvelle tout de suite, et les curseurs règlent ses paramètres : **Mise à jour quotidienne** (désactivée tant que vous ne l’activez pas), l’heure, et ses questions. Sous la page, **Plus tôt** liste les précédentes, chacune s’ouvrant telle qu’elle était. Avant la première, la page ne demande que ce dont l’app ne peut se passer (votre nom d’auteur, vos conférences et revues) ; **Créer la première** conserve vos réponses comme paramètres. Une fois qu’elle se met à jour chaque jour, Paramètres → Tâches planifiées la liste aussi (voir [Tâches planifiées](/guide/tasks)).

### Radar des articles

[Radar des articles](/apps/t/paper-radar) vous apporte chaque matin les nouveaux articles de votre domaine, classés selon ce sur quoi vous travaillez, chacun avec une ligne sur ce qu’il fait et pourquoi il compte pour vous.

- **Ce qu’il lit** : les nouveaux articles d’arXiv dans les catégories que vous suivez (quelques centaines au plus, envoyés au cours des trois derniers jours, davantage après une interruption), ceux sur vos sujets, tous domaines confondus, et ceux des personnes que vous suivez ; ceux d’OpenAlex sur vos sujets aussi (revues et actes de conférences). Un article déjà examiné lors d’une mise à jour précédente ne revient jamais.
- **Comment il classe** : selon vos projets (leurs noms, descriptions et dernières sessions), vos sujets et votre profil. Par le sens, avec le modèle d’embedding sur votre ordinateur quand la [Recherche par le sens](/settings?s=memory&find=Search%20by%20meaning) est activée, sinon par leurs mots. Les articles que vous enregistrez tirent le classement vers eux ; ceux que vous mettez de côté l’en éloignent. Les articles des personnes que vous suivez passent toujours en premier.
- **La page** : **Aujourd’hui**, les articles du jour sous le projet ou le sujet auquel chacun correspond le mieux (choisissez-en un en haut, ou **Tout**). Chaque carte indique où et quand il est paru, son titre (un lien vers l’article), ses auteurs, ce qu’il fait en une phrase et pourquoi il vous concerne, avec **☆ Enregistrer**, **Citer** (copie son BibTeX), **PDF**, **Approfondir** (un [rapport de recherche approfondie](/apps/t/deep-research) à son sujet, de quelques minutes) et **Pas pour moi** (la carte se replie, avec **Annuler**). **Articles enregistrés** liste ce que vous avez enregistré, du plus récent au plus ancien, avec **Tout copier en BibTeX**, et pour chacun **Citer**, **Ajouter à la liste de lecture**, **Approfondir** et **Retirer**.
- **Ses paramètres** : **Domaines à suivre** (les catégories d’arXiv, par nom ou par code : Information Retrieval ou cs.IR, Computation and Language ou cs.CL ; un domaine qui n’est pas une catégorie est pris comme un sujet), **Sujets** (un par ligne), **Personnes à suivre** (une par ligne, comme leurs articles impriment leurs noms) et **Combien d’articles** (15 sauf modification, entre 5 et 40). Si vous les laissez vides, l’app déduit les domaines et les sujets de votre profil et de vos projets.

Une mise à jour pose une ou deux questions rapides au modèle d’appoint (ce que chaque article signifie pour vous) et prend une minute ou deux.

### Alertes de citations

[Alertes de citations](/apps/t/citation-alerts) vous dit qui a cité vos articles depuis sa dernière consultation, avec la phrase qui vous cite et si elle s’appuie sur votre travail, le compare à un autre ou le conteste.

- **La page** : **Nouveau**, les nouvelles citations par article : comment chacune vous cite (**s’appuie sur**, **compare avec**, **conteste** ou **mentionne**, choisi d’après la phrase par le modèle d’appoint ; affichez un seul type en haut), la phrase avec la mention de votre article en évidence, un mot sur ce qu’elle dit de votre travail, et l’article qui cite (un lien), ses auteurs, où et quand, avec **Copier la phrase**. **Vos articles** liste vos articles avec leurs citations et le nombre de nouvelles.
- **Comment elle les trouve** : elle vous retrouve sur Semantic Scholar (ou OpenAlex quand il est saturé), prend vos articles qui ont des citations (les plus cités et les plus récents, trente par mise à jour), et demande qui a cité chacun récemment. Les citations déjà vues sont conservées, de sorte que chaque mise à jour n’affiche que le nouveau ; la première fois, seules celles du dernier mois comptent comme nouvelles. Un article citant sans phrase est un article que le service n’a pas lu en entier.
- **Ses paramètres** : **Vous, en tant qu’auteur** (votre nom tel que vos articles l’impriment, ou votre identifiant Semantic Scholar, des chiffres, ou OpenAlex, A suivi de chiffres) et **Seulement ces articles** (titres, DOI ou identifiants arXiv, un par ligne ; vide : tous les vôtres). Une fois par semaine suffit à la plupart des gens : activez **Mise à jour quotidienne**, ou demandez à un agent de la rendre hebdomadaire.

### Veille des nouveaux modèles

[Veille des nouveaux modèles](/apps/t/new-model-watch) surveille Hugging Face à la recherche de nouveaux modèles d’un type donné (rerankers, embedders et autres), les vérifie par rapport à vos limites, et exécute votre propre évaluation sur chacun, pour que vous n’appreniez que ceux qui battent votre meilleur.

- **Ce qu’elle regarde** : les modèles les plus récents du type (avec les mots que vous donnez dans leurs noms), une fois qu’ils ont l’âge indiqué (7 jours sauf modification) et assez de téléchargements à ce moment-là ; les huit plus téléchargés par mise à jour (les autres attendent la suivante). Les copies d’un modèle dans un autre format (GGUF, ONNX, quantifié) sont écartées, sauf si vos mots les demandent. Elle lit la page et la fiche de chacun pour sa licence, sa taille et sa nature, et écarte ceux que vos licences ou votre taille excluent.
- **Votre évaluation** : donnez une commande avec `{model}` à l’endroit où va le nom du modèle (`python eval.py --model {model}`), son dossier, le score qu’elle affiche (`ndcg@10`), si plus haut ou plus bas est meilleur, et votre meilleur score à ce jour. Chaque nouveau modèle qui vaut la peine d’être essayé s’exécute alors dans [Expériences](/system/experiments) (groupe « New-model watch », un GPU chacun, dans sa file), qui vous prévient quand l’un fait mieux que votre meilleur ; la mise à jour suivante lit le score de chaque exécution. Sans commande, elle ne fait que lister les nouveaux modèles.
- **La page** : **Modèles**, chacun avec son état (**nouveau**, **en évaluation**, **évalué**, **bat** votre meilleur, **non exécuté**, **ignoré**, **trop récent**), ce que dit sa fiche, sa taille, sa licence, ses téléchargements et ses likes, et son score ; ceux qui battent votre meilleur viennent en premier. **Votre évaluation** indique ce qui s’exécute, avec **Ouvrir Expériences**.

### Radar des échéances

[Radar des échéances](/apps/t/deadline-radar) place les échéances de vos conférences et revues sur une seule chronologie, dans votre fuseau horaire, vous les rappelle avant chacune, et renvoie vers l’appel à communications, sa limite de pages et son modèle.

- **D’où viennent les dates** : deux listes ouvertes sur GitHub, celle de ccfddl et celle d’ai-deadlines, réunies. Chaque échéance est convertie du fuseau horaire que donne son appel (la plupart indiquent AoE, Anywhere on Earth, soit UTC−12) vers le vôtre, que l’app prend dans votre navigateur.
- **La page** : **Chronologie**, chaque échéance à venir avec son jour et son heure chez vous, ce qui est à rendre, tel que l’appel l’indique, le lieu de la conférence, les liens **Appel à communications** et **Modèle** et sa limite de pages, et le temps restant (au moment où vous regardez) ; la prochaine échéance de résumé ou d’article de chaque conférence ou revue ressort. Affichez une seule conférence ou revue en haut ; **Copier les échéances** les copie sous forme de lignes ; **Show the past ones** déplie celles des derniers mois. **Conférences** présente chacune en détail, son classement, sa prochaine échéance et son site, ainsi que les noms qu’aucune des deux listes ne connaît.
- **Rappels** : chaque mise à jour vous envoie une notification pour les échéances aux jours que vous avez indiqués (14, 3 et 1 sauf modification), chaque rappel une seule fois, tous dans une seule notification. Activez **Mise à jour quotidienne** pour qu’ils arrivent à temps.
- **Ses paramètres** : **Vos conférences et revues** (comme vous les nommez, séparées par des virgules : SIGIR, ACL, EMNLP, NeurIPS, The Web Conference, KDD…) et **Me le rappeler** (jours avant, séparés par des virgules ; vide : pas de rappel). Pour trouver la limite de pages et le modèle de chaque appel, elle cherche l’appel une fois par conférence et le lit (le modèle d’appoint les note).

### Travaux connexes vivants

[Travaux connexes vivants](/apps/t/living-related-work) tient une page pour chacun de vos sujets, qui s’enrichit à mesure que des articles paraissent : chaque article résumé, situé par rapport au sujet, classé par thème, les nouveaux signalés.

- **Comment il progresse** : la première fois, il prend les meilleurs articles d’arXiv sur chaque sujet et ses plus récents de l’année écoulée, ainsi que les plus cités d’OpenAlex ; ensuite, ce qui est paru depuis. Les articles qui citent vos articles de départ arrivent pour tous les sujets. Le modèle d’appoint garde ceux qu’une section de travaux connexes devrait citer, résume chacun en une phrase, dit comment il se rattache (au sujet et à vos articles de départ) et le range dans un thème.
- **La page** : **Travaux connexes**, chaque sujet avec ses articles thème par thème, les plus récents d’abord, ceux que la dernière mise à jour a ajoutés marqués **Nouveau** (choisissez un sujet en haut). Chaque article a sa clé de citation, **BibTeX** (copie son entrée) et **Sans rapport** (il quitte définitivement le sujet). **Rédiger les travaux connexes** fait écrire par un agent la section du sujet en LaTeX, un paragraphe par thème, avec des clés `\cite` tirées de vos articles : elle s’affiche avec **Copier le LaTeX** et **Copier le .bib** une fois terminée (quelques minutes ; elle continue si vous partez). **Exporter le BibTeX** rassemble toutes les entrées du sujet à copier. **Nouveau cette fois** liste ce que la dernière mise à jour a ajouté.
- **Ses paramètres** : **Sujets** (un par ligne), **Articles de départ** (titres, identifiants arXiv ou DOI, un par ligne) et **Le plus d’articles par sujet** (80 sauf modification).

### Détecteur de lacunes

[Détecteur de lacunes](/apps/t/gap-finder) croise vos articles avec ceux du mois dans un domaine pour trouver des idées de projet, vérifie pour chacune les travaux antérieurs et la dimensionne selon la puissance de calcul dont vous disposez. Elle s’exécute depuis son formulaire, ou un agent l’exécute pour vous dans une session.

- **Ce que vous donnez** : **Vos articles** (votre nom d’auteur, qui fait venir vos articles les plus récents et les plus cités, ou leurs titres ou identifiants arXiv, un par ligne), **Le domaine** (en mots, ou une catégorie arXiv : conversational search, cs.IR), **La puissance de calcul dont vous disposez** (un GPU de 24 Go sauf indication contraire) et **Combien d’idées** (5).
- **Ce qu’elle fait** : elle lit vos articles et ceux du dernier mois dans le domaine, classe ceux du mois par rapport aux vôtres, et fait proposer par le modèle d’appoint des idées qui les croisent. Pour chaque idée, elle cherche sur arXiv et Semantic Scholar les travaux antérieurs et fait juger l’idée par le modèle d’appoint : **nouveau**, **en partie fait** ou **déjà fait**, avec l’article le plus proche ; la première expérience à mener, ce qu’elle demande sur votre puissance de calcul, et si elle **tient**, est **juste** ou est **trop grosse**.
- **La vue** : **Idées de recherche**, les nouvelles d’abord (affichez un seul verdict en haut), chacune avec ce qu’elle croise, la raison de son verdict, le travail le plus proche (un lien), la première expérience et son coût, et **Le planifier** (ouvre l’app Research sprint avec l’idée comme question), **Approfondir** (un rapport de recherche approfondie sur les travaux voisins) et **Copier**. **Ce qu’il a croisé** liste vos articles et ceux du mois utilisés.

## Lire et organiser des articles

Trois apps prêtes à l’emploi, sous **Recherche** sur [la page Apps](/apps), vous aident avec les articles que vous lisez : la **Liste de lecture** les garde, la **Matrice de littérature** en compare plusieurs dans une feuille de calcul, et **Reproduire un article** vérifie que les chiffres d’un article tiennent en exécutant son code. Ouvrez-les depuis cette page, ou demandez ce qu’elles font dans n’importe quelle session (« Ajoute 1706.03762 à ma liste de lecture »), et l’agent les exécute pour vous ([Demander à un agent d’exécuter une app pour vous](/guide/apps#have-an-agent-run-an-app-for-you)).

Elles trouvent un article quelle que soit la façon dont vous le donnez : un DOI, un identifiant arXiv, un lien (arXiv, celui d’un DOI, l’ACL Anthology, OpenReview, la page d’un éditeur ou un PDF), son titre, ou un PDF présent sur cet ordinateur. Elles ne lisent les articles que dans leurs versions en accès libre (arXiv, les copies ouvertes que connaît OpenAlex, la page de l’article lui-même), jamais derrière un accès payant : un article sans version ouverte est lu à partir de son résumé, et l’app le signale.

### Liste de lecture

[La Liste de lecture](/apps/t/reading-list) s’ouvre sur vos articles plutôt que sur un formulaire : c’est un endroit où l’on travaille.

- **Ajouter un article** : **+ Ajouter**, puis **L’article** (un DOI, un identifiant arXiv, un lien ou son titre) et, si vous le souhaitez, son **Projet**, ses **Étiquettes** (séparées par des virgules) et son **Statut**. **L’ajouter** le recherche et le conserve avec ses auteurs, son année, son lieu de publication, son résumé, des liens vers lui et vers un PDF en accès libre, et son entrée BibTeX. Un article que vous avez déjà n’est pas ajouté une seconde fois (même DOI, même identifiant arXiv ou même titre) : ce qui lui manquait est complété, et vos notes, étiquettes et statut restent tels quels. Un article que rien ne retrouve est conservé avec le titre que vous avez donné et une entrée construite à partir de celui-ci : vérifiez-le.
- **Trouver vos articles** : le haut de la page indique combien vous en avez à lire, en cours de lecture et lus (cliquez sur l’un pour n’afficher que ceux-là), et dans combien de projets. **Rechercher dans vos articles** les trouve à partir de n’importe lequel de leurs mots, et **Tout**, **À lire**, **Lecture en cours** et **Lecture terminée** affichent un seul statut. Chaque article montre ses auteurs, son lieu de publication et son année, son projet et ses étiquettes (cliquez sur une étiquette pour n’afficher que ses articles ; sa croix **✕** les affiche à nouveau tous), ainsi que **À lire**, **Lecture en cours** et **Lecture terminée**, pour changer son état d’avancement : **Lecture terminée** note la date du jour.
- **La page d’un article** : cliquez sur son titre. Elle comporte **Sa page** et **Le PDF** (ou **Ouvrir le PDF**, pour un PDF présent sur cet ordinateur), son état d’avancement, son résumé, son projet et ses étiquettes (chacun avec **Enregistrer**), vos **Notes** (**Enregistrer les notes**), son BibTeX (**Copier le BibTeX**) et **Le retirer de la liste**. **Le reproduire** ouvre [Reproduire un article](#reproduce-a-paper) avec l’article déjà renseigné.
- **Par projet** : chaque projet avec le nombre d’articles qu’il contient et le nombre que vous avez lus ; cliquez sur l’un d’eux pour afficher ses articles. Donnez le nom d’un de vos [projets](/guide/projects) et ses articles lui sont rattachés (ils le suivent quand vous le renommez), ou utilisez le nom de votre choix.
- **Plus** propose **Importer un .bib** (collez-le, ou indiquez le chemin d’un fichier .bib présent sur cet ordinateur, avec un projet et des étiquettes pour les articles qu’il ajoute : ceux que vous avez déjà sont complétés, les vôtres sont conservés), **Exporter un .bib** (**Ceux affichés**, tels que votre recherche et vos filtres les montrent, ou **Tous** : un fichier à télécharger, ou **Le copier**) et **Synchroniser avec Zotero** (voir plus bas).
- **Créer une matrice de littérature** : cochez des articles (la case à leur gauche) et une barre indique combien vous en avez choisi, avec **Créer une matrice de littérature**, qui lance la [Matrice de littérature](#literature-matrix) avec eux, et **Effacer**.

Quand un agent ajoute un article pour vous, sa carte affiche **L’article** : l’article tel que la liste le contient désormais, s’il était nouveau, **Ouvrir votre liste de lecture**, et son BibTeX à copier.

### Garder la liste synchronisée avec Zotero

**Plus** → **Synchroniser avec Zotero** → **Synchroniser maintenant** garde la liste et votre bibliothèque Zotero en phase.

1. La première fois, la page vous demande votre **Clé d’API Zotero** : **En obtenir une** ouvre la page des clés de Zotero, où vous en créez une qui peut lire votre bibliothèque (et y écrire, pour que les articles y aillent aussi). Collez-la et appuyez sur **Enregistrer** : elle va dans votre coffre, réservée à Zotero seul ([Garder les clés dans le coffre](/guide/connections#keep-keys-in-the-vault)). **ID utilisateur Zotero** peut rester vide : il est déduit de la clé (pour la bibliothèque d’un groupe, indiquez `groups/` suivi du numéro du groupe). Appuyez ensuite à nouveau sur **Synchroniser maintenant**.
2. Ce qui est dans Zotero arrive ici : les nouveaux articles sont ajoutés, et ceux que vous avez déjà sont complétés, rapprochés par DOI, identifiant arXiv ou titre. Les informations de Zotero l’emportent là où elles diffèrent, et votre statut, vos notes et votre projet restent les vôtres.
3. Les articles présents seulement ici vont dans Zotero, comme de nouveaux éléments.

Chaque synchronisation après la première ne déplace que ce qui a changé depuis la précédente. Un article que vous supprimez dans Zotero reste ici, sans lien désormais, et n’y est jamais renvoyé. Une ligne en haut de vos articles indique la date de la dernière synchronisation et ce qu’elle a fait (« 12 nouveaux depuis Zotero, 3 envoyés vers Zotero »), avec **Synchroniser à nouveau**.

### Matrice de littérature

[La Matrice de littérature](/apps/t/literature-matrix) lit plusieurs articles côte à côte et remplit une feuille de calcul : une ligne par article, une colonne pour chaque point de comparaison, et dans chaque cellule ce que dit l’article, avec l’endroit où il le dit (sa page ou sa section).

- **Les articles** : un par ligne (trente au maximum), chacun étant un DOI, un identifiant arXiv, un lien, un titre ou un PDF présent sur cet ordinateur. Ou depuis votre liste de lecture : une ligne telle que « ma liste de lecture, étiquette : dense » (ou un projet, ou un statut : « ma liste de lecture, à lire »). **Créer une matrice de littérature** dans la Liste de lecture la remplit avec les articles que vous avez choisis.
- **Les colonnes** : une par ligne ; **Tâche**, **Données**, **Méthode**, **Métriques**, **Résultats** et **Limites** tant que vous ne les changez pas.
- **Projet** : le projet à vous dans lequel sa feuille de calcul est rangée. Une ligne « ma liste de lecture » sans rien après prend alors les articles de ce projet.

Elle lit trois articles à la fois (l’article entier à partir d’une copie ouverte, ou son résumé quand il n’y en a pas), fait remplir chaque ligne par un modèle rapide, rédige ce que disent les articles ensemble, et garde la matrice sous forme de [feuille de calcul](/guide/library#spreadsheets) dans les fichiers du projet, avec une seconde feuille qui liste les articles. Sa vue comprend **La matrice** (combien d’articles ont été lus, **Ouvrir la feuille de calcul**, **Copier sous forme de tableau**, la matrice elle-même, les articles qu’elle n’a pas pu lire et pourquoi, et **Une autre colonne** : donnez-en le nom, et **Le refaire avec** la relance avec cette colonne en plus), **Articles** (chacun avec ce qu’il fait en une phrase, et la source dont il a été lu) et **Entre les articles** (où ils concordent et divergent, et ce qui reste ouvert, avec **Le copier**).

### Des articles pour appuyer une affirmation

Quand vous écrivez dans l’[éditeur LaTeX](/guide/library#latex-documents), sélectionnez une phrase qui a besoin d’une citation et choisissez **Insérer → Trouver une citation pour cela**. Le modèle d’appoint transforme l’affirmation en recherches dans OpenAlex et arXiv et lit les résumés de ce qu’elles trouvent ; la boîte de dialogue liste les articles qui appuient l’affirmation, fortement ou en partie, chacun avec la raison en une ligne, ses auteurs, son année et son lieu de publication, et son résumé. **Citer** ajoute le BibTeX de l’article à votre bibliographie (l’entrée de doi.org ou d’arXiv, sous une clé qui n’existe pas encore) et place le `\cite` après l’affirmation, un second `\cite` rejoignant le premier ; **Ajouter** se contente de l’ajouter. Seuls l’affirmation et les mots qui l’entourent sont envoyés, jamais le reste de l’article.

Le même éditeur relit votre article (**Outils → Relire avec l’IA**), réécrit les mots que vous sélectionnez en conservant chaque commande, formule, `\cite` et `\ref` (**Modifier → Réécrire avec l’IA**), écrit une équation, un tableau ou un algorithme que vous décrivez (Ctrl+K), en lit un à partir d’une image, explique et corrige les erreurs de TeX, et met en ordre la bibliographie ; voir [Documents LaTeX](/guide/library#latex-documents).

### Reproduire un article

[Reproduire un article](/apps/t/reproduce-paper) exécute le code propre à un article pour voir si ses chiffres tiennent : il trouve le code, construit son environnement, récupère ses données et ses checkpoints, exécute son évaluation, compare les chiffres avec le tableau de l’article, et dit ce qu’il a fallu.

- **L’article** (ou **Ou l’importer**), **Son code** (un lien ou un dossier sur cet ordinateur ; laissé vide, il est recherché), **Ce qu’il faut reproduire**, tel que l’article le nomme (« Tableau 2, la ligne BM25 + monoT5 sur MS MARCO dev »), **Limites** (le temps, l’espace disque et les GPU qu’il peut utiliser : « 4 heures au maximum, 100 Go de disque et 1 GPU » tant que vous ne le changez pas) et **Où travailler** (un dossier ; un nouveau à chaque exécution quand il est vide).

Il lit l’article et y cherche son code ; quand l’article n’en nomme aucun, il cherche sur GitHub et sur le web en parallèle et choisit le dépôt le plus probable. Un modèle rapide détermine le cadre exact (les données et la répartition, le modèle et le checkpoint, les réglages) et les chiffres à retrouver, tels qu’ils sont imprimés. Ensuite, un agent fait le travail comme le dit la compétence **reproduce-paper** : un environnement propre comme l’indique le dépôt (venv, conda ou Docker), les données et les checkpoints, une exécution sur un petit échantillon d’abord, puis l’exécution réelle, chaque modification étant consignée avec sa raison, et un rapport, `REPRODUCTION.md`, dans le dossier de travail. Une exécution réelle qui demande un GPU ou des heures part dans [Expériences](/guide/experiments), qui attend des GPU libres et conserve la trace et le journal de l’exécution : l’app attend la fin de ses exécutions sans occuper une session, puis un agent lit leurs chiffres et termine le rapport. Enfin, chaque chiffre est placé à côté de celui de l’article : à moins d’un demi-point sur une échelle de 0 à 100 (0,005 sur une échelle de 0 à 1), il compte comme reproduit.

Sa vue comprend **Est-ce reproductible ?** (le verdict, combien de chiffres s’en sont approchés, les heures qu’il a fallu et les corrections apportées, son dépôt, **Ouvrir le dossier**, ses exécutions dans Expériences, et **Réessayer** quand il n’a pas été reproduit ; puis les chiffres de l’article à côté des nôtres avec l’écart, ceux qui sont proches en vert, et le cadre tel que l’article le donne), **Ce qu’il a fallu** (chaque étape avec ses minutes, et chaque modification et correction) et **Rapport** (avec **Copier le rapport**).

Il exécute du code sur cet ordinateur et cela peut prendre des heures : il reste dans vos limites, et quand l’une d’elles serait dépassée, il s’arrête et rend compte de ce qu’il a. Un code qu’il ne peut pas obtenir, ou des données qui ne sont pas publiques, il le dit clairement.

**Surlignez les articles au fil de votre lecture.** Ouvrez le PDF d’un article dans Fichiers et appuyez sur **Surligner** : sélectionnez un passage, ou tracez un cadre autour d’une équation ou d’une figure, pour le surligner dans l’une des quatre couleurs et y écrire une note. **Demander** interroge un agent sur cette seule partie (« Que dit cette équation ? »), et **Notes** liste tout ce que vous avez marqué, page par page. **Garder dans un projet** place vos surlignages et vos notes dans les connaissances d’un projet sous la forme d’un document portant le nom de l’article, tenu à jour, afin que les sessions du projet les retrouvent ; **Enregistrer dans le PDF** les écrit dans le fichier pour d’autres apps. Voir [Lire et surligner un PDF](/guide/files-git#read-and-highlight-a-pdf).

## Vérifier un article avant de le soumettre

Avant qu’un article ne parte, l’éditeur LaTeX le vérifie comme le feraient le secrétariat d’une conférence et ses relecteurs : ses références, s’il vous trahit, ses pages et ses polices, les parties que la conférence demande, et les nombres de ses tableaux. Ouvrez votre article (un document LaTeX, parmi les fichiers de son projet : les détails du projet → **Fichiers**) et choisissez **Outils → Vérifier avant la soumission**.

1. Choisissez où il part : **ACL Rolling Review** (un article long ou court ; **EMNLP** et **NAACL** reçoivent des articles par ce biais), **SIGIR** (long ou court), **CIKM**, **WSDM**, **TheWebConf**, **KDD**, **NeurIPS**, **ICLR**, **ICML**, **AAAI**, **Une revue IEEE**, **Une revue ACM** ou **Autre**, avec une limite de pages et l’option **Relu de façon anonyme** de votre choix. Une ligne dessous indique ce que la conférence demande : sa limite de pages, ce qui n’y compte pas, si la relecture est anonyme et les parties requises. Les conférences changent leurs règles chaque année, c’est pourquoi la ligne renvoie aussi à l’appel à contributions. La vérification retient la conférence pour chaque article et, la première fois, choisit celle vers laquelle pointe le style de l’article.
2. **Vérifier** compile l’article, lit son PDF, recherche ses références en ligne et affiche au fur et à mesure ce qu’il trouve. Seuls les titres, les DOI et les identifiants arXiv des références sont envoyés, à Crossref, arXiv, OpenAlex, Semantic Scholar et DBLP ; ce que les services ont répondu est conservé quelques jours, et un service qui n’a pas répondu est nommé sous les résultats. OpenAlex et Semantic Scholar répondent plus volontiers aux programmes avec une clé gratuite qui vous est propre : ajoutez-la dans [Clés](/apps/connected?tab=keys) sous le nom OPENALEX_API_KEY (pour api.openalex.org) ou SEMANTIC_SCHOLAR_API_KEY (pour api.semanticscholar.org), et la vérification l’utilisera.

Ce qu’elle trouve se répartit en cinq groupes, chaque résultat étant marqué **À corriger**, **Vérifier** ou **À titre d’information** :

- **Références** : les clés citées mais absentes de toute entrée de la bibliographie (ou citées avec d’autres majuscules que celles de leur entrée), les entrées jamais citées, le même article sous deux clés, et les entrées auxquelles manque ce que leur type exige (la revue d’un article de revue, les actes d’un article de conférence, une année). Chaque entrée citée est recherchée par son DOI, son identifiant arXiv ou, à défaut, son titre, puis comparée à ce que listent les services : son titre, ses auteurs, son année et l’endroit où elle a paru. Pour un preprint, on cherche une version publiée, que les relecteurs s’attendent à voir citée. Un article introuvable est signalé comme n’existant peut-être pas : vérifiez-le vous-même, car les services peuvent aussi passer à côté de certains travaux.
- **Anonymat**, lorsque la relecture est anonyme : vos noms, quand le modèle est dans sa version finale (ceux d’ACL, de NeurIPS, d’ICML, d’ICLR et d’acmart ont une version anonyme) ; les notes **\thanks** ; une section de remerciements ; les liens qui peuvent vous nommer, vous ou votre laboratoire (votre propre dépôt, une page personnelle) ; « our previous work » à côté d’une citation ; et les champs Author et Title du PDF lui-même.
- **Format** : les pages qui comptent dans la limite (jusqu’à l’endroit où commencent les références, ou les parties que la conférence ne compte pas, comme les Limitations d’ACL), les pages des références et le total des pages lorsque la conférence le plafonne ; les polices Type 3 et les polices non incorporées ; les modifications des marges, des polices et des espacements du modèle, et les **\vspace** négatifs (à titre d’indices : certains sont autorisés) ; les références et les citations qui s’affichent en ?? ; les marques **TODO**, **XXX** et **\todo** ; les lignes qui dépassent loin dans la marge ; et les erreurs, lorsque la compilation échoue.
- **Parties requises** : un résumé, et ce que la conférence demande : la section Limitations d’ACL, la Paper Checklist de NeurIPS (et ses réponses encore à **\answerTODO**), l’Impact Statement d’ICML, la déclaration d’usage de l’IA d’ICLR, la déclaration GenAI de CIKM, les Index Terms d’IEEE, les concepts CCS et les mots-clés d’ACM.
- **Nombres** : voir [Des nombres qui correspondent à vos exécutions](#numbers-that-match-your-runs).

Le bouton qui porte le fichier et la ligne d’un résultat l’affiche dans le source. Lorsqu’une modification est sûre, **Corriger** l’effectue : l’entrée telle que les services la listent, sous la même clé, afin que vos citations restent inchangées (**L’entrée** la montre d’abord), la version publiée d’un preprint, le modèle passé à sa version anonyme, les remerciements mis en commentaire, le champ Author du PDF vidé, une note **\todo** retirée, le gras déplacé, un tableau mis à jour. Une correction est une modification de l’éditeur comme une autre : **Annuler** la reprend, et **Enregistrer** la conserve comme nouvelle version. Lorsqu’aucune modification n’est sûre, **Demander à l’agent** sollicite l’agent à côté de l’éditeur, avec le résultat dans la demande ; **Demander à l’agent de les corriger** les lui demande tous à la fois.

**Ajouter comme commentaires** place les résultats encore ouverts sur leurs mots, comme commentaires du document (voir [Documents LaTeX](/guide/library#latex-documents)), de sorte que vous, les personnes avec qui vous partagez l’article et les agents voyiez chacun chaque résultat à sa place ; un agent à qui l’on demande de répondre aux commentaires les corrige et les résout. Lancez une nouvelle vérification : elle indique combien de problèmes sont corrigés depuis la précédente, combien restent et combien sont nouveaux ; **Ajouter comme commentaires** résout alors les commentaires de ceux qui sont corrigés.

Les agents lancent la même vérification sur un article que vous avez conservé ou sur un projet LaTeX à vous : « vérifie mon article pour ACL avant que je le soumette ».

### Des nombres qui correspondent à vos exécutions

La vérification lit chaque tableau de l’article, nombre par nombre :

- **Du gras sur la meilleure valeur.** Dans chaque colonne, le gras doit marquer la meilleure valeur. Le sens du meilleur vient de l’en-tête de la colonne : perte, erreur, latence ou perplexité plus basses ; exactitude, F1, nDCG ou BLEU plus hauts ; une flèche (↓ ou ↑) le dit sans détour. Lorsque l’en-tête ne le dit pas, le plus haut est tenu pour le meilleur, et le résultat le précise. Le gras sur la meilleure valeur de chaque bloc de lignes (entre deux filets), les égalités et les tableaux dont les métriques sont en lignes ne posent pas de problème. **Déplacer le gras** le place sur la meilleure valeur.
- **Les tableaux créés par Expériences.** Un tableau que vous placez dans l’article depuis [Expériences](/system/experiments) (**Créer un tableau**, puis **Le placer dans un document LaTeX**) a au-dessus de lui une ligne `% hydor:table …`. La vérification le recalcule à partir de ses exécutions telles qu’elles sont maintenant, et signale chaque nombre qui a changé depuis, ainsi que les marques de significativité apparues ou disparues. **Mettre à jour le tableau** met en place le nouveau.
- **Les autres tableaux.** Leurs nombres sont recherchés dans les exécutions terminées du projet de l’article (ou de son dossier), arrondis comme le tableau les arrondit, et en pourcentages. Le nombre de ceux qui ont été retrouvés est donné à titre d’information, jamais comme un problème : un nombre peut venir d’un autre article, ou d’une exécution faite ailleurs.

### Le paquet arXiv

**Exporter → Paquet arXiv (.zip)**, en haut d’un document LaTeX ouvert (sur un téléphone, **Plus** (⋯) → **Télécharger au format**), crée un .zip de l’article enregistré à déposer sur arXiv, qui publie le source tel que vous l’envoyez. Ce qu’il fera est coché :

- **Retirer les commentaires**, sans risque : `\%` reste, tout comme ce que TeX prend tel quel (texte verbatim, listings, **\verb**, adresses de **\url** et de **\href**) ; les blocs `\begin{comment}` disparaissent et, avec **Retirer aussi les blocs \iffalse … \fi**, ceux-là aussi.
- **Seulement les fichiers utilisés par l’article** : les images que **\includegraphics** affiche, les fichiers qu’il lit, ses propres styles et classes.
- **Ajouter le .bbl et laisser de côté le .bib** : la bibliographie telle qu’elle a été compilée ici, celle qu’arXiv utilise. Décochez cette option pour envoyer le .bib et laisser arXiv exécuter BibTeX.
- **Insérer les fichiers \input et \include dans main.tex** et **Mettre \pdfoutput=1 en premier** (l’ancienne façon qu’a arXiv de demander pdfLaTeX), lorsque vous les cochez.

Les noms avec des espaces reçoivent des tirets, et le source suit. **Créer le paquet** compile le paquet tel quel, dans le même bac à sable que n’importe quel document, pour vérifier qu’il se construit, puis le télécharge. La boîte de dialogue indique ce qu’il contient, ce qui a été laissé de côté ou renommé, comment il a été compilé, sa taille par rapport à la limite de 50 Mo d’arXiv, et quel processeur choisir sur arXiv. Elle retient vos choix.

### Version définitive, autre modèle, et votre article dans les apps

**Outils → Votre article** propose le reste :

- **Préparer la version définitive** demande à l’agent à côté de l’éditeur la version finale, rédigée d’après les règles de la conférence : la version finale du modèle, les auteurs et leurs affiliations rétablis, les remerciements rétablis, le bloc de copyright ou de droits, ce qu’ajoute la version finale, et sa limite de pages. Donnez-lui les auteurs, leurs affiliations et les remerciements s’ils ne figurent pas dans le source.
- **Passer à un autre modèle** demande à l’agent de faire passer l’article au modèle d’une autre conférence (ou à LNCS de Springer, à celui d’Elsevier, à un article simple), en version pour relecture ou en version définitive, en conservant son texte, ses figures, ses tableaux et ses références.
- **Paquet arXiv (.zip)**, comme ci-dessus.
- **Le relire comme le feraient les relecteurs**, **Répondre aux évaluations** et **Créer une présentation orale, un poster et un fil** ouvrent ces apps avec votre article déjà renseigné (son PDF, ou, pour la présentation orale, le dossier de ses sources) : voir [Relire, répondre et présenter votre article](#review-answer-and-present-your-paper).

Ce qui n’est pas encore enregistré l’est d’abord, afin que chacun reçoive l’article tel que vous le voyez.

## Relire, répondre et présenter votre article

Quatre apps prêtes à l’emploi, sous **Écriture** sur [la page Apps](/apps), vous aident pour votre propre article : le **Simulateur de relecteurs** relit votre brouillon comme le feraient les relecteurs d’un lieu de publication, l’**Atelier de réponse aux relecteurs** rédige votre réponse aux avis reçus, **De l’article à l’exposé, au poster et au fil** produit de quoi le présenter, et le **Docteur des figures** rend ses graphiques prêts pour l’impression. Les trois premières lisent votre article à partir d’un PDF, d’un fichier .tex ou du dossier d’un projet LaTeX sur cet ordinateur, d’un lien, ou d’un document LaTeX que vous avez conservé (collez son adresse) ; **Ou l’importer** accepte un PDF à la place.

### Simulateur de relecteurs

[Le Simulateur de relecteurs](/apps/t/reviewer-simulator) relit votre brouillon avant les vrais relecteurs, sur le formulaire d’évaluation et les notes propres au lieu de publication, et liste ce qu’ils risquent de demander, le plus dangereux d’abord.

- **Votre article**, **Le lieu de publication** (**ACL Rolling Review**, **SIGIR**, **NeurIPS**, **ICLR**, **ICML**, **KDD**, **CIKM**, **WSDM**, **TheWebConf**, **Une revue** ou **Autre**, chacun avec son formulaire tel qu’il était en 2025), **Nombre de relecteurs** (de 1 à 5 ; 3 si vous ne changez rien) et **Tout ce sur quoi se concentrer**.

Il réunit les relecteurs, chacun avec son propre angle (dans l’ordre : l’expert de la méthode, l’expert du domaine, un empiriste sceptique, un lecteur attentif d’un domaine voisin et un relecteur de la reproductibilité), et chacun remplit le formulaire du lieu de publication, en parallèle. Ensuite, un area chair rédige la méta-relecture avec l’issue probable, et les faiblesses sont classées selon la probabilité qu’elles fassent échouer l’article. Les relectures viennent d’un modèle : elles repèrent les points faibles avant les vrais relecteurs, mais ne prédisent pas la décision.

Sa vue comprend **Les relectures** (le lieu de publication, l’issue probable, la note globale moyenne, puis chaque avis : son relecteur et son angle, les notes, le résumé, les points forts, les points faibles et les questions), **Méta-relecture** (avec **Le copier** et **Copier tous les avis** ; puis **Ce qui pourrait le faire échouer, le plus dangereux d’abord** : chaque faiblesse avec sa raison, sa probabilité et ce qui la corrige), **Références et ablations** (ce que les relecteurs demanderont, pourquoi, et le travail que cela représente) et **Avant de soumettre** (une liste à cocher, et **Répondre à ces avis**, qui lance l’Atelier de réponse aux relecteurs avec eux, pour répéter votre réponse).

### Atelier de réponse aux relecteurs

[L’Atelier de réponse aux relecteurs](/apps/t/rebuttal-workbench) rédige votre réponse aux avis reçus, point par point, dans la limite fixée par le lieu de publication.

- **Les relectures** (collez-les toutes, chacune sous son relecteur : « Reviewer 1 », « R2 », le « Reviewer xYz1 » d’OpenReview…), **Votre article** (ou **Ou l’importer** ; facultatif, pour que les réponses renvoient à ses sections), **La limite** (telle que le lieu de publication la fixe : en caractères ou en mots, par relecteur, par point ou au total ; « 2 500 caractères par relecteur » si vous ne changez rien) et **Tonalité** (**Courtois et ferme**, **Chaleureux et reconnaissant** ou **Bref et direct**).

Il répartit les avis par relecteur, en extrait les points de chacun en parallèle, fusionne un même point soulevé par plusieurs relecteurs, et les classe : mal lu (votre article y répond déjà), nécessite une expérience, nécessite des mots (une clarification, une justification, une citation), ou mineur. Il trouve ce que dit votre article sur chacun, rédige chaque réponse dans sa part de la limite, et assemble la réfutation, comptée par rapport à la limite. Une réponse qui exige un nouveau résultat laisse des [espaces réservés] à remplir : il n’invente jamais de résultats.

Sa vue comprend **Points soulevés** (la réfutation en une ligne ; **Tous les points**, **Mal lu**, **Nécessitent une expérience**, **Nécessitent des mots** et **Mineur** n’en montrent qu’un type ; chaque point avec la personne qui l’a soulevé, dans ses mots, sa réponse rédigée, sa longueur par rapport à sa part, et **Copier**), **À faire** (les expériences à exécuter et les modifications à apporter à l’article, à cocher) et **Réponse entière** (la réponse à chaque relecteur par rapport à la limite, et **Copier toute la réfutation**).

### De l’article à l’exposé, au poster et au fil

[De l’article à l’exposé, au poster et au fil](/apps/t/paper-to-talk) produit de quoi présenter votre article : des diapositives avec ses vraies figures et équations, chronométrées, avec ce qu’il faut dire ; un poster A0 ; des publications pour X, Bluesky et LinkedIn ; et une page de projet.

- **Votre article** (le dossier de son projet LaTeX est préférable, pour ses figures ; depuis arXiv, sa source est récupérée pour elles), **La durée de l’exposé, en minutes** (15 si vous ne changez rien), **Public** (**Chercheurs du domaine**, **Chercheurs d’autres domaines** ou **Un public général**), ce qu’il faut produire (**Diapositives**, **Un poster A0**, **Un fil (X, Bluesky, LinkedIn)** et **Une page de projet**) et **Projet** (votre projet dans lequel ranger ce qu’il produit).

Il planifie l’exposé (environ une diapositive par minute, une idée chacune, du problème à ce qu’il faut retenir), un programme répartit les minutes pour qu’elles correspondent à la durée, puis il produit ce que vous avez demandé en parallèle : les diapositives, que vous modifiez et présentez depuis les fichiers du projet ([Diapositives](/guide/library#slides)), le poster sous forme de document LaTeX ([Documents LaTeX](/guide/library#latex-documents)), les publications, et la page de projet, prête à publier ([Publier une page](/guide/library#publish-a-page)).

Sa vue comprend **Ce qui a été fait** (le message de l’exposé et une phrase d’ouverture, puis chaque élément produit, avec **L’ouvrir**), **La présentation orale** (l’exposé en une seule bande, chaque diapositive aussi large que ses minutes, puis chaque diapositive : ses minutes, son titre, ses points, sa figure, son équation et ce qu’il faut dire) et **Fil de discussion** (**X**, **Bluesky** et **LinkedIn** montrent les publications de chacun, numérotées, chacune avec **Copier**, et **Copier le fil** ; l’unique publication LinkedIn a **Copier la publication**).

### Docteur des figures

[Le Docteur des figures](/apps/t/figure-doctor) rend les graphiques de votre article prêts pour l’impression : aussi larges que la colonne, dans la police de l’article, avec des couleurs que les lecteurs daltoniens distinguent, enregistrés en PDF vectoriels avec leurs polices intégrées, le tout avec un seul fichier de style.

- **Votre code de tracé** (un script, un notebook ou un dossier de ceux-ci sur cet ordinateur, réalisés avec matplotlib ou seaborn), **Le modèle du lieu de publication** (**ACL, EMNLP, NAACL**, **ACM (SIGIR, KDD, CIKM, WSDM, TheWebConf)**, **IEEE**, **ICML**, **NeurIPS, ICLR**, **Springer LNCS** ou **Autre (indiquez la largeur)**), **Largeur** (**Une colonne** ou **Les deux colonnes**), **Ou la largeur en pouces** (pour un autre modèle) et **La police de l’article** (**Comme le modèle**, **Times New Roman**, **Computer Modern**, **Linux Libertine** ou **Helvetica**).

Un programme détermine le style (la largeur en pouces, la police et ses tailles, une palette pour les lecteurs daltoniens), et un agent modifie vos scripts sur place, après avoir copié chacun à côté de lui (name.orig.py) et conservé une image de chaque figure telle qu’elle était. Chaque script utilise ensuite un seul fichier de style, `paper.mplstyle`, placé à côté d’eux ; chaque figure est enregistrée en PDF vectoriel, et ses polices sont vérifiées : toutes intégrées, aucune de Type 3, que beaucoup de lieux de publication refusent. Il exécute vos scripts, il lui faut donc ce dont ils ont besoin sur cet ordinateur (Python, matplotlib et leurs données).

Sa vue comprend **Avant et après** (la taille, la police et les couleurs utilisées, puis chaque figure telle qu’elle était et telle qu’elle est maintenant, avec **Ouvrir le PDF** et ce qui a changé), **Fichier de style** (`paper.mplstyle`, avec **Le copier** et son mode d’emploi) et **Ce qui a changé** (chaque modification, et ce qu’a trouvé la vérification des polices).

Les agents de vos sessions connaissent aussi ces savoir-faire, grâce aux compétences livrées avec Hydor (**peer-review**, **reproduce-paper** et **figures-for-papers** : voir [Compétences](/guide/skills)) : demandez à l’un d’eux de relire un article avec vous, de répondre à un relecteur ou de corriger une seule figure, et il procède de la même façon.

## Faire tourner le travail de votre labo

Trois apps prêtes à l’emploi, sous **Labo** sur la page [Apps](/apps), aident au travail quotidien d’un labo : étiqueter des données et vérifier un modèle par rapport à vos étiquettes, tester une idée sur votre propre code, des hypothèses jusqu’au rapport, et régler les paramètres d’un modèle. Le sprint et le balayage exécutent leurs tâches dans [Expériences](/guide/experiments) ; il leur faut donc un ordinateur (ou un cluster) équipé de GPU.

### Atelier d’annotation

**Atelier d’annotation** vous fait étiqueter, avec un modèle, le même échantillon de textes, pour voir où vous n’êtes pas d’accord et jusqu’où l’on peut se fier au modèle pour le reste. Ouvrez-le depuis **Apps** et renseignez :

- **Les libellés**, séparés par des virgules : neuf au plus, un pour chaque touche de 1 à 9. **Comment étiqueter** : vos consignes, dans vos propres mots ; le modèle étiquette aussi avec elles.
- Les textes : **un fichier CSV ou JSON lines**, **un jeu de données Hugging Face** par son nom (comme stanfordnlp/imdb) ou son adresse, avec **Son découpage** quand il en a plusieurs (et sa configuration avant une barre oblique, comme plain_text/test), ou des textes collés, un par ligne. **La colonne contenant le texte** est trouvée automatiquement (une colonne nommée text, review ou sentence, sinon celle qui contient les textes les plus longs) : indiquez-la quand la déduction est fausse.
- **Nombre à étiqueter** : tirés au hasard, 100 si vous ne changez rien, 1 000 au maximum.

Il lit les textes (un jeu de données via le serveur de jeux de données de Hugging Face, quelques pages de lignes prises à des endroits aléatoires), constitue l’échantillon dans un ordre aléatoire, et fait étiqueter les textes par le modèle d’appoint, vingt à la fois, chacun avec une courte justification. La page de l’exécution est ensuite l’endroit où vous travaillez :

- **Étiquetage** : un texte à la fois, avec un grand bouton pour chaque libellé. Appuyez sur l’un d’eux, ou sur sa touche (**1** à **9**) : ce n’est qu’alors que l’étiquette du modèle apparaît, sur une ligne au-dessus du texte suivant (avec sa justification en cas de désaccord), de sorte qu’elle ne vous influence jamais. **Ignorer pour l’instant** (**S**) envoie un texte à la fin, **Variation** (**Z**) annule le dernier, et une note (**N** pour en commencer une) reste attachée à son texte. La barre montre où vous en êtes.
- **Désaccords** : chaque texte que vous et le modèle avez étiqueté différemment, votre étiquette et vos notes à côté de l’étiquette et de la justification du modèle. **Le réétiqueter** le renvoie vers **Étiquetage**.
- **Accord** : la fréquence à laquelle vous avez donné la même étiquette, le κ de Cohen (cet accord au-delà de ce que le hasard seul donnerait : 1 est parfait, 0 pas mieux que le hasard, au-dessus de 0,6 substantiel) et ce que le hasard seul donnerait, et la matrice de confusion : vos étiquettes sur le côté, celles du modèle en haut.
- **Exporter** : **CSV** ou **Lignes JSON** télécharge les textes que vous avez étiquetés, chacun avec votre étiquette, celle du modèle et sa justification, et vos notes. **Publier sur Hugging Face** y crée un jeu de données à part (privé sauf si vous choisissez **Tout le monde**), avec les données et une fiche qui explique comment l’étiquetage a été fait, avec vos consignes et le degré d’accord entre vous et le modèle. Il faut pour cela un jeton Hugging Face autorisé à écrire : l’app s’en passe sinon, donc la première fois que vous publiez, elle vous le dit ; ajoutez-le sous le formulaire de l’app (**Jeton Hugging Face**, marqué facultatif) ou dans **Apps → Apps connectées → Clés** sous le nom HF_TOKEN. **Retirer ses textes** supprime les textes et les étiquettes d’un ensemble.

Chaque ensemble est une exécution à part, et conserve ses textes et vos étiquettes comme les enregistrements de l’app : la page de l’app liste vos ensembles parmi ses dernières exécutions, et chacun s’ouvre là où vous vous êtes arrêté.

### Sprint de recherche

**Sprint de recherche** mène une question de recherche à travers un court sprint sur votre propre code, en vous laissant approuver chaque étape. Renseignez **Votre question de recherche**, **Le dépôt** (un dépôt Git sur cet ordinateur), **Ce qu’il doit savoir** (la métrique qui compte, la référence et ses chiffres, comment entraîner et évaluer, ce qu’il ne faut pas changer), **Heures de GPU qu’elle peut utiliser** (8 si vous ne changez rien, pour toutes ses exécutions ensemble) et **Nombre d’hypothèses** (de une à cinq). Ensuite :

1. Le modèle d’appoint propose des hypothèses à partir de votre question et du README du dépôt, chacune avec ce qui la soutiendrait et ce qui irait contre elle, et l’expérience qui la teste.
2. Avec **Me laisser approuver chaque étape** cochée (elle l’est sauf si vous la décochez), l’exécution vous attend : gardez-les, ou écrivez celles à tester à la place, une par ligne. La question s’affiche sur la page de l’exécution, dans votre boîte de réception et sous forme de notification.
3. Un agent crée un worktree du dépôt sur une nouvelle branche (sprint/…), à côté de votre copie de travail, qu’il ne modifie jamais. Il y écrit le plan (SPRINT.md) et le code dont les exécutions ont besoin, les valide par un commit, et dresse la liste des exécutions : une de référence et une pour chaque hypothèse, avec des graines. Celles qui dépasseraient vos heures de GPU sont écartées, et nommées.
4. Il vous attend de nouveau, avant que la moindre heure de GPU soit dépensée : lancez les exécutions, ou refusez, et le sprint s’arrête là (le plan et le code restent sur la branche).
5. Expériences les exécute, étiquetées avec le sprint, et le sprint attend qu’elles soient toutes terminées.
6. Un tableau de résultats compare chaque condition à la référence, avec la significativité ; un agent analyse les exécutions dans un notebook Jupyter, conservé dans les fichiers du projet, tranche pour chaque hypothèse (confirmée, non confirmée ou incertaine, avec ses preuves) et rédige un court rapport.

Sa vue comprend **Le sprint** (la question, son déroulement, sa branche, et chaque hypothèse avec son verdict et ses preuves), **Exécutions** (le tableau de résultats, et chaque exécution avec sa métrique) et **Rapport** (à lire et à copier, avec **Ouvrir le notebook** et ce qu’il faut essayer ensuite). Lancé depuis l’API ou une planification, personne n’est là pour approuver, donc il va jusqu’au bout sans s’arrêter.

### Planificateur de balayage

**Planificateur de balayage** planifie un balayage d’hyperparamètres d’un script d’entraînement dans les limites d’un budget, le lance, arrête tôt les mauvais essais, et rédige ce qui a compté. Renseignez **Le script ou la commande**, **Son dossier**, **La métrique** (telle que le script l’affiche ou l’écrit : des lignes metric=value, ou du JSON) et **Quel sens est le meilleur**, **Paramètres à régler** (un par ligne, avec les valeurs à essayer, comme lr: 1e-4, 3e-4, 1e-3 ; laissez vide pour qu’ils soient trouvés), le **Budget** (des exécutions ou des heures de GPU : « 20 runs », « 10 GPU hours ») et **Arrêter tôt les mauvais essais**.

- Un agent lit le script, sans l’exécuter ni le modifier : ses arguments, la durée d’une exécution et le moment où une mauvaise exécution se remarque. Il propose les paramètres et les valeurs à essayer (les vôtres, si vous les avez donnés), et un programme les ajuste au budget : toutes les combinaisons quand elles tiennent, sinon autant de tirages aléatoires que le budget le permet.
- Avec **Me laisser vérifier le plan d’abord**, l’exécution vous attend : lancez-la telle quelle, ou écrivez des modifications, un paramètre par ligne (lr: 3e-4, 1e-3 pour d’autres valeurs, drop dropout pour en exclure un).
- Expériences exécute le balayage comme une seule expérience ; avec **Arrêter tôt les mauvais essais**, une exécution nettement moins bonne que la meilleure jusque-là est arrêtée, pour économiser son temps de GPU.
- Quand les exécutions sont terminées, un programme trouve la meilleure exécution et l’importance de chaque paramètre (la part de la dispersion de la métrique entre les exécutions que ses valeurs expliquent), et le modèle d’appoint dit ce que cela signifie et ce qu’il faut essayer ensuite.

Sa vue comprend **Résultats** (les paramètres et la métrique de la meilleure exécution, ce qu’il a trouvé, ce qu’il faut essayer ensuite, et une barre pour le poids de chaque paramètre), **Par paramètre** (la métrique pour chacune des valeurs d’un paramètre, sous forme de boîtes) et **Toutes les exécutions**.

## Rapports : votre semaine et votre cahier de laboratoire

Deux apps prêtes à l’emploi, sous **Travail** dans la page [Apps](/apps), rédigent un compte rendu de ce que vous avez fait à partir de ce que Hydor sait de votre travail : vos sessions (celles d’ici, ainsi que les sessions Claude Code et Codex dans VS Code ou dans un terminal que Hydor lit), vos commits dans les dépôts Git où elles ont travaillé, vos exécutions dans Expériences, ce que vous avez créé ou conservé et les articles que vous avez marqués comme lus dans votre liste de lecture. Les sessions dont la mémoire est désactivée et les sessions confidentielles sont exclues, tout comme le travail des sessions que des agents lancent pour des parties d’une tâche (il est compté avec celui de leur session parente). Chacune s’ouvre sur sa propre page et peut se mettre à jour toute seule.

### Rapport d’avancement hebdomadaire

**Rapport d’avancement hebdomadaire** transforme votre semaine en point d’étape pour votre directeur de recherche, votre équipe ou un responsable : ce qui a été fait, les résultats avec leurs chiffres, les problèmes et ce qui vous bloque, le plan de la semaine suivante et les questions à poser. Il s’ouvre sur sa propre page avec le rapport de cette semaine (les sept jours qui précèdent le jour de sa rédaction) : son titre et son résumé, la semaine en chiffres, puis **Fait cette semaine**, **Résultats**, **Problèmes et blocages**, **Semaine suivante** et **Questions**.

- **Copier en Markdown** et **Copier sous forme d’e-mail** (un objet, puis un court message qui commence et se termine comme le vôtre) le placent dans votre presse-papiers ; **Enregistrer comme document** le conserve comme document, que vous pouvez modifier et exporter en Word ou en PDF.
- **Mettre à jour** rédige dès maintenant le rapport de cette semaine. **Plus tôt**, juste en dessous, liste les semaines précédentes, chacune à un clic.
- **Paramètres**, les curseurs en haut : **Mettre à jour automatiquement** (désactivé tant que vous ne l’activez pas) rédige un nouveau rapport chaque vendredi à 16 h ; sous l’interrupteur, choisissez d’autres jours (**Tous les jours**, **En semaine**, **Une fois par semaine le** jour de votre choix) et l’heure. C’est une [tâche planifiée](/guide/tasks), donc [Paramètres → Tâches planifiées](/settings?s=tasks) la liste aussi. Plus bas : **À qui il s’adresse** (votre directeur de recherche, votre équipe ou un responsable : le rapport est écrit pour eux), **Projets** (tous, ou certains, par leur nom) et **Ce qu’il faut inclure** (« uniquement la recherche, sans les coûts »).

### Cahier de laboratoire

**Cahier de laboratoire** tient une entrée datée pour chaque jour où vous avez travaillé : ce qui a été essayé, ce qui a été trouvé et décidé, et ce qui reste ouvert, avec des liens vers les sessions, commits, exécutions, fichiers et éléments conservés de ce jour-là. Ses entrées sont les propres enregistrements de l’app, tenus à part de la [Mémoire](/guide/memory). Il s’ouvre sur sa propre page avec elles, les plus récentes d’abord :

- **Rechercher dans le notebook** trouve des entrées par leurs mots et par leur sens (quand la [Recherche par le sens](/settings?s=memory&find=Search%20by%20meaning) est activée), les meilleures d’abord ; **Toutes les entrées** les ramène toutes.
- **Copier son lien**, sous chaque entrée, copie l’adresse de sa propre page, qui montre l’entrée telle qu’elle a été écrite : pour la citer dans un article, un rapport ou une note.
- **Mettre à jour** rédige dès maintenant l’entrée du jour, et **Écrire un jour antérieur** celle d’un jour que vous avez manqué. Un jour réécrit remplace son entrée ; un jour où vous n’avez rien fait n’en reçoit aucune.
- **Paramètres** : **Mettre à jour automatiquement** (désactivé tant que vous ne l’activez pas) rédige l’entrée du jour chaque soir à 21 h, les jours et à l’heure que vous choisissez ; **Projets** la limite à certains projets.

## Demander à un agent

- « Configure Paper radar pour suivre cs.IR et cs.CL, avec la recherche dense et la prédiction de performance des requêtes comme sujets, et mets-le à jour tous les jours à 7 h 30. »
- « Qu’est-ce que Paper radar a trouvé pour moi aujourd’hui ? Quels articles touchent à mon projet Hydor ? »
- « Active Citation alerts pour mes articles (je publie sous le nom de Chris Samarinas) et dis-moi qui a cité ProCIS récemment. »
- « Ajoute SIGIR, ACL et EMNLP à Deadline radar et rappelle-moi 21, 7 et 2 jours avant chaque date limite. »
- « Surveille Hugging Face pour de nouveaux rerankers de moins d’un milliard de paramètres sous licence Apache ou MIT, et lance mon évaluation sur chacun : python eval.py --model {model} dans ~/rerank-eval, ndcg@10, mon meilleur score est 0,512. »
- « Lance un état de l’art vivant sur la recherche parcimonieuse apprise, à partir de SPLADE et ColBERT, et rédige sa section d’état de l’art. »
- « Trouve les lacunes entre mes articles et les travaux de ce mois-ci sur la recherche conversationnelle ; j’ai un seul GPU de 24 Go. »
- « Ajoute 2104.08663 et l’article de ColBERT à ma liste de lecture, dans le projet Dense retrieval. »
- « Importe ~/papers/refs.bib dans ma liste de lecture, avec l’étiquette survey. »
- « Synchronise ma liste de lecture avec Zotero. »
- « Quels articles de ma liste de lecture restent à lire pour le projet Dense retrieval ? »
- « Fais une matrice de littérature des articles étiquetés dense dans ma liste de lecture, avec une colonne indiquant si leur code est publié. »
- « Reproduis le tableau 2 de l’article BEIR, BM25 sur SciFact, en une heure au maximum et sans GPU. »
- « Ouvre Reproduce a paper rempli pour 2104.08663, mais ne le lance pas encore. »
- « Relis mon brouillon dans ~/papers/draft comme le feraient trois relecteurs de SIGIR, et dis-moi ce qui pourrait le faire rejeter. »
- « Voici mes évaluations ARR : rédige une réponse d’au plus 2 500 caractères par relecteur. »
- « Fais un exposé de 12 minutes, un poster A0 et un fil de discussion à partir de mon article dans ~/papers/colbert, dans le projet ColBERT. »
- « Corrige les graphiques dans ~/papers/colbert/plots pour un article ACL, sur une colonne de large, en Times. »
- « Vérifie mon article pour ACL avant que je le soumette, et corrige ce que tu peux sans risque. »
- « Toutes les références de mon article LaTeX sont-elles réelles, avec les bons auteurs et les bonnes années ? Corrige celles qui ne le sont pas. »
- « Fusionne les doublons dans la bibliographie de mon article et complète ce que leurs DOI indiquent. »
- « Un préprint cité par mon article a-t-il été publié depuis ? Cite les versions publiées. »
- « Rends mon article NeurIPS anonyme pour la relecture : noms, liens, remerciements, champs propres au PDF. »
- « Mon article respecte-t-il la limite de pages d’EMNLP ? S’il la dépasse, resserre-le pour qu’il y tienne. »
- « Les chiffres de mes tableaux de résultats correspondent-ils toujours à mes exécutions ? »
- « Mon article SIGIR a été accepté : prépare la version finale. »
- « Passe mon article au modèle ICLR, comme version pour la relecture. »
- « Charge 200 textes de la partie sentiment de tweet_eval sur Hugging Face dans l’Annotation workbench, avec les étiquettes positif, négatif et neutre et ces consignes : … »
- « Dans quelle mesure suis-je d’accord avec le modèle sur mon dernier jeu d’annotations ? Quelles étiquettes confondons-nous le plus ? »
- « Lance un sprint de recherche pour savoir si un apprentissage progressif des requêtes courtes aux longues aide le retriever dans ~/code/retriever, avec 6 heures de GPU. »
- « Planifie un balayage du taux d’apprentissage et de la taille de lot de ~/code/model/train.py en 10 heures de GPU maximum ; plus val_loss est bas, mieux c’est. »
- « Active mon rapport d’avancement hebdomadaire : pour mon directeur de recherche, le vendredi à 15 h, uniquement le projet Retriever. »
- « Qu’ai-je décidé sur les négatifs difficiles la semaine dernière ? Cherche dans mon cahier de laboratoire. »
- « Écris l’entrée de mon cahier de laboratoire pour mardi dernier. »
