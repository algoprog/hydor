# Compétences

Les compétences sont des méthodes écrites que les agents chargent lorsqu’une tâche l’exige : comment faire des recherches sur une question, traquer un bug, planifier un projet, créer un document Word ou ranger après une tâche. Toutes les compétences que les agents peuvent utiliser se trouvent sur une seule page, [Paramètres → Compétences](/settings?s=skills) : celles fournies avec l’app, les vôtres, celles que vos plugins apportent, celles propres à Claude Code et à Codex, et celles de vos projets. Ses interrupteurs valent pour toutes les sessions ; un projet peut inverser l’état de n’importe quelle compétence pour ses propres sessions. Ce sujet couvre tout cela, ainsi que les compétences que les agents apprennent avec votre approbation et les mots-clés qui font venir une compétence pour Custom.

![Paramètres → Compétences : toutes les compétences que les agents peuvent utiliser, regroupées selon leur usage](images/skills.webp)

## Ce qu’est une compétence

Une compétence est un court guide qu’un agent suit pour un type de travail. Chacune est un dossier contenant un fichier nommé SKILL.md : un nom, une ligne indiquant quand l’utiliser, puis les étapes, les vérifications et les erreurs à éviter. Certaines compétences apportent aussi leurs propres fichiers : exemples, modèles ou petits scripts utilisés par les étapes.

Les agents ne lisent pas toutes les compétences en permanence. Au début d’une session, un agent ne voit que le nom de chaque compétence et sa ligne « quand l’utiliser ». Quand une tâche correspond à l’une d’elles, il charge cette compétence et la suit. Une salutation, une question rapide ou une petite modification claire n’en demande aucune.

## D’où viennent les compétences

La page Compétences affiche des compétences issues de cinq origines, indiquées sur chaque ligne :

- **Intégré** : les compétences fournies avec l’app (plus de soixante). Elles se mettent à jour avec l’app.
- **Les vôtres** : les compétences que vous avez écrites sur cette page, approuvées quand un agent les a suggérées, copiées depuis d’autres agents présents sur cet ordinateur (voir [Reprendre depuis d’autres assistants](/guide/memory#bring-in-from-other-assistants)), ou placées vous-même dans votre dossier de compétences.
- **Des plugins** : les compétences des [plugins](/guide/plugins) que vous avez activés. Elles vont et viennent avec leur plugin.
- **Claude Code et Codex** : les compétences propres à ces agents, dans leurs propres dossiers. Seuls l’agent concerné et [Custom](/guide/custom) les reçoivent.
- **Dans les projets** : les compétences propres à un projet, que seules ses sessions reçoivent. Vous les modifiez dans l’onglet **Compétences** du projet : voir [Donner à un projet ses propres compétences](/guide/projects#give-a-project-skills-of-its-own).

Les trois premières forment la bibliothèque de compétences, que reçoit chaque agent démarré par l’app. Un agent peut aussi désigner des compétences qu’il privilégie : quand l’une d’elles convient à la tâche, il la charge avant de commencer. Voir [Agents](/guide/agents).

## Quels agents reçoivent quelles compétences

Chaque session démarrée par l’app reçoit la bibliothèque de compétences :

- **Claude Code** la reçoit sous forme d’un plugin nommé « hydor » ; ses compétences s’affichent donc avec ce nom devant : hydor:research, hydor:writing, etc.
- **Codex** la reçoit sous forme d’un dossier de compétences supplémentaire.
- **Custom**, l’agent propre à l’app, reçoit ses compétences par nom, en groupes, et peut aussi en chercher une selon la nature du travail. Voir [Custom](/guide/custom).
- **Autres agents** (Gemini CLI, OpenCode et les autres) reçoivent la liste des compétences, chacune avec le fichier à lire quand elle convient.

Les sessions démarrées en dehors de l’app, dans un terminal ou dans VS Code, ne voient pas la bibliothèque. Rien n’en est écrit dans vos paramètres Claude Code ou Codex.

Une session dans un projet reçoit les compétences propres au projet avec celles de la bibliothèque, chacune selon l’état que le projet lui donne (voir [Activer ou désactiver une compétence pour ce projet](/guide/projects#turn-a-skill-on-or-off-for-this-project)). Une compétence de projet portant le nom d’une compétence de la bibliothèque la remplace dans les sessions de ce projet.

Vos propres compétences passent avant les compétences intégrées : l’une des vôtres portant le nom d’une compétence intégrée la remplace. Une compétence de plugin dont le nom existe déjà dans la bibliothèque est écartée, et la page de son plugin indique quelle compétence les agents reçoivent à la place.

Custom lit les compétences dans plusieurs dossiers, dans cet ordre : les compétences propres au projet (dans ses dossiers `.claude/skills` et `.agents/skills`), celles de Claude Code et de Codex dans votre dossier personnel, puis la bibliothèque. Quand deux compétences portent le même nom, la première trouvée l’emporte. Une compétence que vous écrivez pour Claude Code ou pour Codex parvient donc aussi à Custom, tant que son [interrupteur](#turn-a-skill-on-or-off) est activé. Custom prend jusqu’à 200 compétences, dont au plus 40 pour celles du projet et les vôtres ; ses instructions les nomment par groupe (celles du projet, les vôtres, puis les groupes de la bibliothèque comme Programmation ou Documents) plutôt que de les lister une à une.

## Voir quand un agent utilise une compétence

Quand un agent charge une compétence, une petite pastille s’affiche dans la conversation : **Utilisation de la compétence research**, avec un indicateur de chargement pendant que l’agent la lit. Cela fonctionne de la même façon pour Claude Code, Codex et Custom.

Cliquez sur la pastille pour lire la compétence : ce qu’elle dit, quand elle s’applique et son historique. Si la compétence ne fait pas partie de la bibliothèque de l’app, la fenêtre l’indique : elle vient du dossier de compétences propre à l’agent, ou de celui du projet. Dans un projet, la pastille ouvre la compétence propre au projet quand c’est celle que l’agent a utilisée : le badge de la fenêtre affiche le nom du projet, et **Compétences du projet** ouvre son onglet Compétences.

Quand vos propres mots ont fait venir une compétence dans une session Custom, la pastille indique quels mots l’ont fait : « amenée par « research » dans votre message ». Voir [Amener des compétences par mots-clés](#bring-skills-in-by-keywords).

Chaque chargement d’une compétence par un agent compte comme une utilisation. La ligne d’une compétence de la bibliothèque indique combien de fois elle a été utilisée, et la dernière fois.

## Ouvrir la page Compétences

Allez dans **Paramètres → Agents → Compétences** ([l’ouvrir](/settings?s=skills)). Sur un téléphone, ouvrez Paramètres, puis touchez **Compétences** sous Agents.

De haut en bas, la page comprend :

- à côté du titre de la page, **Nouvelle compétence** et le menu **⋯** : **Suggérer les compétences adaptées**, **Amener des compétences par mots-clés**, **Votre dossier de compétences** (l’ouvre dans Fichiers), **En obtenir plus avec les plugins** (ouvre [Paramètres → Plugins](/settings?s=plugins)) et **Comment les agents reçoivent les compétences** ;
- un groupe avec les compétences suggérées par les agents, quand il y en a (voir [Approuver, modifier ou écarter une compétence proposée](#approve-edit-or-dismiss-a-proposed-skill)) ; son (i) indique que rien n’est enregistré tant que vous n’avez pas approuvé ;
- une zone de recherche et une rangée de filtres : **Tout**, **Intégré**, **Les vôtres**, **Des plugins**, **Claude Code et Codex** et **Dans les projets**. Seuls ceux qui contiennent des compétences s’affichent ;
- les compétences, en groupes selon leur usage (le titre de chaque groupe indique combien il en contient, et un long groupe affiche ses huit premières avec **Tout afficher**) : **Façons de travailler**, **Écriture**, **Documents**, **Recherche et web**, **Planification et décisions**, **Données et chiffres**, **Design et images**, **Programmation**, **Modèles d’IA** et **Cette app** ; puis **Propres à Claude Code**, **Propres à Codex**, et un groupe pour chaque projet ayant ses propres compétences ;
- en bas, les compétences que vous avez retirées, à rétablir.

Chaque compétence est une ligne : son nom (cliquez dessus pour l’ouvrir), son usage en une ligne, son interrupteur, et un (i) qui indique d’où elle vient et combien de fois elle a été utilisée. Les compétences propres à Claude Code et à Codex sont listées telles que chaque dossier les contient : les vôtres, et celles fournies avec les agents. Celles du dossier d’un projet (dans son `.claude/skills`) se trouvent dans l’onglet **Compétences** de ce projet.

## Trouver une compétence

Saisissez du texte dans la zone de recherche : il est comparé aux noms des compétences, à leur usage, et au nom de leur plugin ou de leur projet. Appuyez sur Échap, ou sur la croix, pour l’effacer. Choisissez un filtre pour ne voir que les compétences d’un seul type.

Vous pouvez aussi trouver une compétence depuis la recherche de l’app (Ctrl+K, ⌘K sur un Mac) : saisissez son nom ou son usage. Les compétences s’affichent sous **Compétences**, et en choisir une ouvre cette page à son niveau.

## Activer ou désactiver une compétence

Chaque compétence de la bibliothèque, de Claude Code et de Codex a un interrupteur à la fin de sa ligne. Une compétence désactivée reste à sa place, mais les agents ne la reçoivent plus ; son nom est grisé et un badge indique **Désactivé**. Réactivez-la avec le même interrupteur. Vous pouvez aussi l’actionner dans sa fenêtre.

- Une compétence de la bibliothèque (intégrée, la vôtre ou celle d’un plugin) désactivée est écartée pour tous les agents, dans tous les projets qui ne l’activent pas pour eux-mêmes.
- Claude Code conserve son propre choix dans ses paramètres, selon le nom de la compétence ; Codex le conserve dans sa propre configuration.
- Custom suit aussi ces interrupteurs. Il lit les dossiers des deux agents, et n’y dispose d’une compétence que tant qu’elle est activée pour l’agent auquel appartient le dossier : Claude Code pour `.claude/skills`, Codex pour `.codex/skills` et `.agents/skills`. Une compétence désactivée ne figure pas dans sa liste, n’est pas désignée comme pouvant convenir et n’est pas amenée par des mots-clés. Le réglage d’un projet compte en premier. Une session Custom déjà en cours garde sa liste jusqu’au redémarrage de son agent. Un interrupteur que vous changez dans Codex lui-même, et non ici, est pris en compte en arrière-plan : la première session que vous démarrez après le changement peut donc ne pas encore en tenir compte.

Les interrupteurs de cette page valent pour toutes les sessions. Un projet peut inverser l’état de n’importe quelle compétence pour ses propres sessions, dans son onglet **Compétences** : voir [Activer ou désactiver une compétence pour ce projet](/guide/projects#turn-a-skill-on-or-off-for-this-project). La ligne de la compétence ici l’indique alors : « Désactivée dans Thèse » ou « Activée dans 2 projets ».

Les compétences propres à un projet n’ont pas d’interrupteur ici : modifiez-les dans l’onglet **Compétences** du projet.

## Lire une compétence et son historique

Cliquez sur le nom d’une compétence, ou sur une pastille **Utilisation de la compétence** dans une conversation. Une fenêtre s’ouvre avec :

- son origine, son groupe, et combien de fois les agents l’ont utilisée ;
- son interrupteur : **Les agents la reçoivent**, ou **Désactivée : les agents ne la reçoivent pas** ;
- les projets qui inversent son état pour leurs sessions, chacun avec **Activé** ou **Désactivé** : cliquez sur l’un d’eux pour ouvrir son onglet Compétences ;
- quand l’utiliser, et ses mots-clés, s’il y en a (« Custom l’amène quand vous dites » suivi des mots) ;
- les instructions, telles que les agents les lisent ;
- **Historique**, quand elle a connu des changements : chaque changement, du plus récent au plus ancien, **Enregistré**, **Modifiée**, **Retiré** ou **Rétablie**, il y a combien de temps, et combien de lignes ont été ajoutées et supprimées. Cliquez sur un changement pour le voir ligne par ligne ;
- en bas, l’emplacement de son fichier : cliquez dessus pour l’afficher dans Fichiers ; dans l’app de bureau, un bouton à côté (**Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier**) l’affiche dans le gestionnaire de fichiers du système.

Les boutons en bas dépendent de la compétence :

- Intégrée : **Créer ma propre version** (voir [Modifier une compétence intégrée](#change-a-built-in-skill)).
- La vôtre : **Variation** et **Retirer**.
- Celle d’un plugin : **Son plugin** (ouvre le plugin) et **Créer ma propre version**.
- Celle de Claude Code ou de Codex : **Variation** (ou **Ouvrir**, pour les compétences que vous ne pouvez pas supprimer), qui ouvre son SKILL.md dans un éditeur, et **Supprimer**.
- Celle d’un projet : **Compétences du projet**.

Sur un téléphone, la fenêtre s’ouvre sous forme de feuille depuis le bas de l’écran. **Fermer** la referme.

## Les compétences intégrées

L’app est livrée avec ces compétences, dans les groupes où la page les présente. Ouvrez-en une pour la lire en entier.

**Façons de travailler**

- **clarify-first** : pour une demande vaste ou ouverte (un site web, un voyage, une rénovation, un exposé, un business plan). L’agent commence par lire ce qui existe déjà, pose une question à la fois en disant pourquoi, reformule ce qu’il a compris, propose deux ou trois façons de s’y prendre, puis rédige un court brief que vous approuvez avant de rien construire.
- **clean-up** : à la fin d’une tâche. L’agent liste ce qu’il a créé en chemin, retire ce qui ne sert plus (fichiers temporaires, données de test, dossiers provisoires, branches fusionnées ou abandonnées, worktrees, processus qu’il a lancés), ne retire jamais ce qu’il n’a pas créé, demande d’abord confirmation pour tout ce qui est volumineux ou partagé, et indique en une ligne ce qu’il a retiré et ce qu’il a laissé. Tant que **Nettoyer après une tâche** est activé dans [Paramètres → Vos agents](/settings?s=assistants&find=Clean%20up%20after%20a%20task) (c’est le cas par défaut), chaque agent reçoit la consigne de le faire à la fin d’une tâche.
- **decisions-log** : pour un travail effectué sans vous (un objectif, une tâche planifiée, « ne m’attendez pas »). L’agent tranche lui-même les questions courantes, note chaque décision avec sa raison et ce qu’elle coûterait si elle était mauvaise, puis poursuit. Il ne s’arrête qu’avant les actions irréversibles (envoyer, payer, supprimer, publier), tout ce qui touche aux mots de passe ou aux accès, ou tout ce qui sort du cadre du travail ; son message final liste toutes les décisions prises.
- **evidence-before-done** : avant que l’agent annonce que quelque chose est terminé, corrigé, enregistré, envoyé ou vrai. Il nomme la vérification qui le prouverait, l’exécute, lit le résultat, puis présente l’affirmation avec sa preuve, ou dit clairement ce qu’il n’a pas pu vérifier.
- **troubleshooting** : pour tout ce qui ne fonctionne pas comme prévu (une erreur, un appareil, un réseau domestique, une formule, une recette). L’agent provoque le problème exprès, rassemble des faits, teste une idée à la fois, corrige la cause et montre que c’est réglé.

**Écriture**

- **writing** : pour tout ce que des gens vont lire (un rapport, un article, une lettre, un discours). L’agent détermine qui lira le texte et dans quel but, fait un plan avant de rédiger, et relit en plusieurs passes distinctes.
- **summaries** : pour un résumé, une réponse ou une réflexion de quelques phrases, comme un article résumé pour un cours. L’agent respecte la longueur demandée, dit ce que montre la source et pourquoi, et la relie au cours par un cas tiré de la source plutôt que par des définitions.
- **creative-writing** : histoires, romans, mémoires, poèmes et scénarios : trouver l’histoire, planifier, rédiger sans rester bloqué, se débloquer, réviser dans l’ordre, recueillir des avis et se faire publier (lettres de présentation, synopsis, agents littéraires, autoédition et pièges à éviter), en laissant à l’auteur sa propre voix.
- **email** : trie une boîte de réception (ce qui demande une réponse, ce qui peut attendre, ce qu’il faut archiver) et rédige les e-mails délicats : réponses, relances, excuses, refus, avec la bonne longueur et le bon ton.
- **plain-language** : réécrit un texte existant pour qu’il se lise clairement et naturellement, sans jargon, sans remplissage ni formulations raides qui sentent l’IA, au bon niveau de lecture, en conservant son contenu.
- **translation** : traduit documents, messages, pages, textes d’app et sous-titres de façon fidèle et naturelle, avec un glossaire pour les termes et les noms, les nombres et les dates adaptés au pays visé, et une vérification du résultat.
- **social-media** : prévoit et rédige des publications pour chaque plateforme (LinkedIn, X, Instagram, Mastodon, Bluesky…), adapte un même message à plusieurs d’entre elles et tient un calendrier de contenus.
- **seo** : faire trouver un site web, une boutique ou un blog dans les moteurs de recherche et dans les réponses des IA : un contrôle de ses pages, titres et descriptions, de l’indexation, des données structurées et des robots d’IA, et une mesure honnête, sans promesse de classement.
- **release-notes** : rédige des notes de version et des entrées de journal des modifications à partir des commits et des pull requests, pour ceux qui les liront, et choisit le prochain numéro de version.

**Documents**

- **pdf** : crée des PDF (rapports, factures, certificats, flyers, formulaires), les fusionne, les découpe, les pivote, les remplit ou les tamponne, convertit des fichiers Office en PDF et lit les PDF, y compris les pages numérisées.
- **presentations** : crée ou modifie des diapositives (.pptx) avec une apparence homogène, des graphiques, des tableaux et des notes de l’orateur, les regarde sous forme d’images avant de les remettre, et lit les fichiers .pptx, .ppt et .odp.
- **spreadsheets** : crée ou modifie des classeurs (.xlsx) avec des formules, des formats de nombres et des graphiques, vérifie qu’il n’y a pas d’erreurs dans les formules, et lit les fichiers .xlsx, .xls, .ods et .csv.
- **word-documents** : crée ou modifie des documents Word (.docx) avec de vrais titres, listes et tableaux, regarde les pages avant de les remettre, et lit les fichiers .docx, .doc et .odt.

**Recherche et web**

- **research** : planifie les recherches qu’exige une question, cherche d’abord large puis plus précis (articles, brevets, actualités, dépôts réglementaires), vérifie chaque affirmation clé auprès de deux sources indépendantes ou d’une source primaire, et répond avec des citations, en indiquant ce qu’il n’a pas pu confirmer.
- **spin-check** : pour savoir si une publicité, une publication virale, un argumentaire ou une affirmation est vrai, trompeur ou une arnaque : affirmation par affirmation, chacune vérifiée auprès de la source capable de trancher, avec les procédés de persuasion nommés et un verdict pour chacune.
- **papers** : travaille de près sur les articles scientifiques : qui en cite un, un texte intégral légalement accessible, lecture et résumé, un tableau comparant des études, évaluation de la qualité d’une étude et citation correcte.
- **peer-review** : relit un article (votre brouillon avant soumission, ou un article que l’on vous a demandé d’évaluer) sur le formulaire et les notes propres à la conférence ou à la revue, en vérifiant un par un les défauts qui font rejeter les articles, et répond aux évaluations : une réponse aux relecteurs, point par point dans la limite imposée, sans jamais promettre des résultats qu’elle n’a pas.
- **reproduce-paper** : reproduit les résultats d’un article : le chiffre exact à retrouver, son code et son cadre expérimental, un environnement propre, les données et les checkpoints, un petit essai avant l’exécution réelle (pour les longues, voir [Expériences](/guide/experiments)), des chiffres comparés dans les mêmes conditions, et chaque modification consignée dans un rapport.
- **break-the-result** : vérifie un résultat avant qu’il compte, par exemple un gain par rapport à une référence. L’agent énonce précisément l’affirmation, liste ce qui pourrait l’expliquer autrement (des graines chanceuses, une comparaison inégale, une fuite de données, un bogue dans la métrique, un gain limité à quelques exemples), lance des contrôles dans Expériences, ne répare rien et dit si le résultat tient, tient en partie ou ne tient pas. **Essayer de le réfuter**, là où vous comparez des exécutions dans Expériences, lance cette compétence.
- **lean-proofs** : démontre à l’aide du vérificateur de preuves Lean (voir [Les preuves : les vérifier avec Lean](/guide/researchers#proofs-checking-them-with-lean)). L’énoncé est d’abord écrit en Lean, essayé sur de petites valeurs quand c’est possible, reformulé pour vous en mathématiques ordinaires avec chaque différence par rapport à votre demande, et approuvé avec vous avant toute démonstration (si vous avez déjà dit ce qu’il doit être, l’agent compare avec cela, continue et vous signale toute différence). L’empreinte de l’énoncé convenu est notée et la preuve vérifiée par rapport à elle ; elle est construite par petites étapes vérifiées, sans trou restant ni nouvelle hypothèse, et le verdict est rapporté tel quel, puis conservé comme résultat dans un projet qui garde les résultats. Pour une chaîne de lemmes, l’agent tient un tableau, chaque énoncé étant d’abord convenu.
- **explore-conjecture** : détermine si une intuition ou un motif en mathématiques vaut votre temps : l’énonce exactement, cherche d’abord un contre-exemple, en arithmétique exacte, calcule les petits cas, recherche les nombres (les suites de nombres entiers dans l’OEIS), vérifie si cela a déjà été fait, et dit si c’est faux, connu ou, pour autant qu’on puisse le savoir, ouvert (voir [Les preuves : les vérifier avec Lean](/guide/researchers#proofs-checking-them-with-lean)).
- **proof-check** : vérifie une preuve rédigée en toutes lettres (tirée d’un article, écrite par un étudiant ou par l’agent lui-même) : chaque étape est justifiée ou signalée comme une lacune, les erreurs habituelles sont recherchées, de petits cas sont essayés, puis vient le verdict : la preuve tient, elle tient une fois ces lacunes comblées, ou elle échoue à telle étape.
- **figures-for-papers** : rend les graphiques d’un article prêts pour l’impression : de la largeur de la colonne du modèle de la conférence ou de la revue, dans la police de l’article, avec des couleurs que les lecteurs daltoniens distinguent, en PDF vectoriels avec leurs polices intégrées (aucune de type 3), le tout avec un seul fichier de style.
- **blocked-pages** : quand une page ne se charge pas ou ne se lit pas (une erreur, un accès payant, un mur de cookies ou une vérification anti-robot, une page qui exige JavaScript), elle essaie dans l’ordre les autres moyens d’accéder à son contenu, et ne contourne jamais ce que vous n’avez pas le droit de contourner.
- **web-scraping** : collecte des données structurées sur des sites web (annonces, tableaux, prix, catalogue) dans un CSV ou un JSON, de façon courtoise et fiable, et les vérifie.
- **maps-and-places** : les lieux sans services cartographiques payants : les coordonnées d’une adresse, ce qui se trouve à proximité, les distances, les itinéraires et les temps de trajet, les fuseaux horaires, les horaires d’ouverture, et une carte dans une page.
- **watch-and-alert** : surveille quelque chose pendant des jours ou des semaines (un prix, un produit de nouveau en stock, l’actualité d’une entreprise, une page qui change, une nouvelle version) avec une tâche planifiée, et ne vous prévient que lorsque c’est important.

**Planification et décisions**

- **decision-brief** : vous aide à choisir : les options (dont ne rien faire, quand c’est réellement possible), ce qui compte et dans quelle mesure, les compromis et les risques, et une recommandation claire, sur une seule page.
- **project-plan** : planifie un projet de toute nature (un événement, un déménagement, un lancement, une rénovation) : jalons, tâches avec responsables et dates, dépendances, risques, et un calendrier à tenir à jour.
- **meetings** : faut-il seulement se réunir, un ordre du jour rédigé sous forme de questions, qui inviter, comment animer la réunion, les entretiens en tête-à-tête et le suivi, et comment se préparer à une réunion animée par quelqu’un d’autre.
- **weekly-review** : une remise à plat hebdomadaire : ce qui est en cours et promis, ce qui a calé, et les priorités et le temps de la semaine suivante.
- **brainstorming** : beaucoup d’idées grâce à des méthodes nommées (renversement, contraintes, analogies, la pire idée…), puis leur tri et le choix de quelques-unes à essayer.
- **study-coach** : apprendre un sujet ou une compétence : ce que vous savez déjà, un plan, des explications à votre niveau, des questions d’entraînement et des fiches à réviser.
- **job-interviews** : se préparer à un entretien d’embauche : ce que demande le poste, une réserve d’exemples vrais, des simulations d’entretien question par question avec des retours honnêtes, les questions difficiles, et un bilan de la façon dont un entretien s’est passé ; utile aussi pour ceux qui mènent les entretiens.
- **solo-business** : une activité à vous (freelance, un service, un produit, une activité d’appoint) : ce que vous en attendez, une offre testée auprès de clients payants avant de beaucoup construire, des prix qui rémunèrent votre temps, et le moment de changer de cap ou d’arrêter.

**Données et chiffres**

- **data-analysis** : répond à des questions à partir de données (un CSV, une feuille Excel, un export) : les vérifie et les nettoie, fait les calculs d’une manière vérifiable, et dit sur quoi repose la réponse.
- **dashboards** : le bon graphique pour la question, et des **tableaux de bord** à retrouver sous forme de page conservée, avec leurs données conservées ou récupérées en direct.
- **notebooks** : des **notebooks** Jupyter qui se lisent bien et se réexécutent : une cellule de texte avant chaque section, de petites cellules, un environnement où les exécuter (créé à côté du notebook quand aucun ne convient), une exécution complète depuis le début avant de le remettre, et une carte qui l’ouvre dans la page de notebook de l’app.
- **financial-model** : les chiffres d’une entreprise dans une feuille de calcul (chiffre d’affaires, coûts, trésorerie, seuil de rentabilité, scénarios), avec les hypothèses sur une feuille à part et des formules faciles à suivre.
- **sql-and-databases** : du SQL correct et sûr, des modifications de schéma et des migrations sans danger sur des données en production, des index, et une sauvegarde avant toute opération risquée.

**Design et images**

- **image-prompts** : créer des images (et de courtes vidéos) avec les modèles d’images de l’app : quoi décrire, les tailles, le texte dans les images, garder le même personnage ou le même style d’une image à l’autre, et retoucher une image.
- **diagrams** : organigrammes, chronologies, schémas d’organisation, cartes mentales et diagrammes d’architecture lisibles, affichés dans la conversation ou conservés sous forme de page.
- **infographics** : des explications visuelles d’une page (une infographie, une affiche comparant des options, un graphique de processus ou de chronologie) : d’abord le message et des faits sourcés, puis la structure qui leur convient, un style, puis l’export réel vérifié à la taille à laquelle les gens le verront.
- **ui-mockups** : avant de construire un écran ou une page, deux ou trois maquettes rapides et nettement différentes, montrées dans la conversation pour les comparer et choisir.
- **brand-kit** : une marque pour une petite entreprise, un club ou un projet : à qui elle s’adresse, sa voix, des couleurs dont le contraste est vérifié, des polices libres, des idées de logo, ainsi qu’une fiche et un guide de marque, mis en pratique sur des profils et des cartes.
- **youtube-thumbnails** : une miniature et un titre qui font une seule promesse honnête : trois idées différentes, lisibles même en tout petit, prévisualisées à côté d’autres vidéos et testées avec Test & Compare de YouTube.

**Programmation**

- **debugging-code** : la cause profonde d’un bug : d’abord un test qui échoue, la trace d’appels, une recherche qui se resserre (journaux, débogueur, git bisect), le correctif et un test qui garantit qu’il le reste.
- **test-first** : les tests avant le code, pour un nouveau comportement et pour les corrections de bugs, au bon niveau, en précisant ce qu’il faut simuler et ce qu’il ne faut pas simuler.
- **code-review** : relire une modification, ou le propre travail de l’agent avant de le remettre : d’abord la justesse, puis la sécurité, les tests et la clarté, chaque remarque indiquant où, pourquoi et comment corriger.
- **refactoring** : modifier la structure du code sans changer ce qu’il fait, par petites étapes, tests au vert.
- **codebase-tour** : s’orienter dans un code inconnu : comment le compiler, l’exécuter et le tester, ses parties et où se trouvent les choses, avec un court aperçu et un diagramme.
- **git-rescue** : se sortir d’un problème avec Git en toute sécurité : annuler des commits, retrouver du travail perdu, résoudre des conflits, un secret commité par erreur, toujours avec une sauvegarde d’abord.
- **github** : pull requests, revues, vérifications et leurs journaux, tickets et versions sur GitHub, avec la commande gh ou son API.
- **api-requests** : appeler et déboguer des API web : connexions avec vos clés enregistrées, réponses d’erreur, résultats paginés, limites de débit et nouvelles tentatives.
- **frontend-polish** : donner à une page web une apparence et une sensation de produit fini : mise en page, espacement, typographie, couleur et contraste, tous les états, téléphones, clavier, le tout vérifié sur de vraies captures d’écran.
- **web-accessibility** : des sites web et des applications web utilisables par tous (clavier, lecteurs d’écran, zoom, contraste, sous-titres, formulaires et boîtes de dialogue), vérifiés avec des outils et à la main, avec un rapport honnête.
- **web-app-qa** : tester une application web comme un utilisateur exigeant, dans le navigateur, et rédiger les bugs trouvés avec les étapes et les preuves.
- **docker** : Dockerfiles et fichiers compose, construction et débogage de conteneurs, et nettoyage soigneux.
- **servers** : s’occuper d’un serveur ou d’un autre ordinateur par SSH (mises à jour, service défaillant, disque plein, utilisateurs et clés, pare-feu, sauvegardes), toujours avec un moyen de revenir avant de toucher aux accès, une machine d’abord et une vérification après chaque modification.
- **security-check** : une revue de sécurité pratique : secrets, injections, qui peut faire quoi, paquets obsolètes, chaque problème signalé selon sa gravité.
- **performance** : rendre un logiciel plus rapide en mesurant d’abord, en trouvant le coût principal, en le corrigeant puis en mesurant à nouveau.
- **mcp-servers** : créer un serveur MCP pour donner de nouveaux outils aux agents, bien concevoir ses outils, le tester et l’ajouter à un agent.
- **ci-doctor** : une exécution de CI en échec (GitHub Actions, GitLab CI, Buildkite, CircleCI) : la première vraie erreur dans les journaux, instable ou réelle selon les preuves, reproduite dans un worktree, puis relancée une fois, corrigée dans une pull request en brouillon ou signalée, selon ce qui est autorisé.
- **issue-triage** : un nouveau ticket étiqueté avec les propres étiquettes du projet, les doublons retrouvés sous plusieurs formulations (avec le degré de certitude), une demande aimable de ce qui manque au signalement, et un petit correctif tenté dans une pull request en brouillon.
- **dependency-upgrades** : ce qui est obsolète et quelles dépendances ont des avis de sécurité, mises à jour selon le risque (correctifs de sécurité, correctifs, versions mineures, versions majeures à part) dans des worktrees, avec les tests exécutés et les notes de version lues, une pull request par groupe.
- **incident-response** : une alerte ou une panne : vous êtes prévenu tout de suite, puis une chronologie des erreurs, des déploiements et des changements, la cause probable avec ses preuves, un retour arrière proposé et soumis d’abord à votre accord, et un postmortem sans recherche de coupable ensuite.
- **git-bisect** : retrouver le commit qui a tout cassé avec un script de vérification et git bisect run dans un worktree à part, et comprendre pourquoi il a tout cassé (voir [Trouver ce qui a cassé](/guide/engineering#find-what-broke-it)).

**Modèles d’IA**

- **hugging-face** : publier et utiliser des modèles et des jeux de données sur le Hugging Face Hub : envois, fiches de modèle et de jeu de données, dépôts à accès restreint, vérification d’un envoi.
- **fine-tuning** : le fine-tuning d’un modèle de langage en vaut-il la peine, et comment s’y prendre : les données d’entraînement, LoRA et QLoRA, les réglages, la mémoire nécessaire et une évaluation honnête.
- **model-evaluation** : évaluer des modèles équitablement : les bons jeux de test et les bonnes mesures, les benchmarks, un modèle utilisé comme juge avec prudence, et le degré de confiance à accorder aux résultats.
- **local-models** : faire tourner des modèles ouverts sur votre propre ordinateur : quel modèle et quelle taille conviennent, la mémoire qu’ils exigent, la quantification, et Ollama, llama.cpp ou vLLM.

**Cette app**

- **everyday-help** : pour « que pouvez-vous faire pour moi ? » : une courte conversation sur vos journées, une question à la fois, puis une ou deux idées adaptées à ce que l’app sait réellement faire, et une petite chose mise en place si vous dites oui.
- **app-builder** : pour créer ou modifier une de vos apps. L’agent précise ce qui entre et ce qui sort, choisit l’étape la moins coûteuse pour chaque partie, donne à l’app des exemples avec des vérifications et les essaie avant de la remettre, en indiquant ce que coûte une exécution.
- **skill-authoring** : écrire une bonne compétence : quand cela vaut la peine, la ligne qui dit quand l’utiliser, sa structure et ses vérifications, et son amélioration après usage.
- **plugin-authoring** : créer, empaqueter et partager un plugin (voir [Plugins](/guide/plugins)) : ce qu’il contient, son format, sa vérification et son ajout.

Les compétences de documents (pdf, presentations, spreadsheets, word-documents) créent des fichiers avec de petits scripts Python. Elles ont besoin de Python 3 sur cet ordinateur. La première fois que l’une d’elles est nécessaire, les bibliothèques qu’elles utilisent sont téléchargées dans un dossier privé, à l’intérieur du dossier de données de l’app (environ 30 Mo, une seule fois) ; rien n’est installé pour l’ensemble du système. Si Python est absent, l’agent vous indique la commande qui l’installe. Pour regarder les pages sous forme d’images avant de remettre un fichier, elles utilisent LibreOffice et Poppler quand cet ordinateur les a. Voir [Documents, images, vidéos et voix](/guide/documents-voice).

Les compétences intégrées ne peuvent pas être retirées, mais vous pouvez désactiver n’importe laquelle, ou en modifier une : votre version prend alors sa place.

## Écrire une compétence

1. Cliquez sur **Nouvelle compétence** ([l’ouvrir](/settings?s=skills&find=New%20skill)).
2. Saisissez un **Nom** : court, avec des tirets. « Vérification de factures » est enregistré sous la forme verification-de-factures.
3. Sous **Quand l’utiliser**, écrivez une ligne, par exemple « À utiliser pour vérifier la facture d’un fournisseur avant son paiement ». Les agents voient cette ligne dans chaque session et ne lisent le reste que lorsqu’elle correspond.
4. Sous **Instructions**, décrivez la méthode : les étapes dans l’ordre, les vérifications, les erreurs à éviter. Le Markdown fonctionne.
5. Si vous le souhaitez, choisissez son **Groupe**, ainsi que les **Mots qui l’amènent** : des mots d’une demande qui font entrer la compétence d’eux-mêmes dans le tour de Custom, séparés par des virgules (voir [Amener des compétences par mots-clés](#bring-skills-in-by-keywords)).
6. Sous **Qui la reçoit**, laissez **Tous les agents**, ou choisissez **Claude Code** ou **Codex** pour une compétence que seul cet agent reçoit.
7. Cliquez sur **Ajouter la compétence**.

Une compétence pour tous les agents est enregistrée dans votre dossier de compétences (dans le dossier de données de l’app, `~/.hydor/skills` sauf si votre installation garde ses données ailleurs) et apparaît sous **Les vôtres**. Une compétence Claude Code va dans `~/.claude/skills`, une compétence Codex dans `~/.agents/skills`, que chacun lit dans tous les dossiers. Si une compétence de ce nom existe déjà, l’app le signale et n’enregistre rien. Une compétence pour un seul projet s’écrit dans l’onglet **Compétences** de ce projet : voir [Donner à un projet ses propres compétences](/guide/projects#give-a-project-skills-of-its-own).

Pour modifier l’une des vôtres, ouvrez-la et cliquez sur **Variation** : les mêmes champs s’affichent, et vous enregistrez avec **Enregistrer**. Chaque modification est conservée dans son historique. Vous pouvez aussi déposer vous-même des compétences dans votre dossier de compétences : un dossier par compétence, nommé avec des lettres minuscules, des chiffres et des tirets, avec son fichier SKILL.md à l’intérieur. Elles apparaissent sous **Les vôtres**.

## Modifier une compétence intégrée

Ouvrez la compétence et cliquez sur **Créer ma propre version**. Les mêmes champs s’ouvrent avec son texte ; modifiez ce que vous voulez et cliquez sur **Enregistrer**. Votre version commence comme une copie de tout le dossier de la compétence intégrée (avec ses exemples et ses scripts), avec votre modification en plus.

À partir de là, les agents utilisent votre version à la place de la version intégrée, même après une mise à jour de la compétence intégrée par l’app. Elle apparaît sous **Les vôtres** avec la mention « Votre version d’une compétence intégrée ». Pour revenir à la compétence intégrée, retirez votre version (voir [Retirer une compétence et la récupérer](#remove-a-skill-and-bring-it-back)).

Lorsque vous approuvez l’amélioration d’une compétence intégrée proposée par un agent, elle est enregistrée de la même façon comme votre version : la carte le précise avant que vous approuviez.

## Retirer une compétence et la récupérer

1. Ouvrez l’une de vos compétences et cliquez sur **Retirer**.
2. Confirmez avec **Retirer**.

Les agents cessent de la recevoir. S’il s’agissait de votre version d’une compétence intégrée, les agents reviennent à la compétence intégrée. Le texte reste dans l’historique de la compétence, vous pouvez donc la récupérer : vos compétences retirées sont listées en bas de la page, après **Retirée :**. Cliquez sur un nom (survolez-le pour voir la date du retrait) et la compétence revient telle qu’elle était.

Compétences propres à Claude Code et à Codex : **Supprimer**, dans leur fenêtre, supprime le dossier de la compétence du disque, avec tous ses fichiers, après confirmation. Cette action est prévue pour vos propres compétences et, dans l’onglet Compétences d’un projet pour Claude Code, pour celles du dossier du projet. Les compétences intégrées, d’administrateur et de plugin de ces agents ne peuvent pas être supprimées : désactivez-les plutôt. Une compétence supprimée ne peut pas être récupérée depuis l’app.

## Approuver, modifier ou ignorer une compétence proposée

Après une tâche qui a demandé un vrai effort, un agent peut proposer de garder sa méthode sous forme de compétence : une solution trouvée après plusieurs essais, un fonctionnement que vous avez dû expliquer, un processus dont les étapes sont faciles à rater. Il peut aussi proposer une amélioration d’une compétence qu’il a suivie, lorsqu’il a trouvé une étape manquante, fausse ou peu claire. Les agents ont pour consigne de ne proposer ni faits ponctuels, ni informations personnelles vous concernant, ni rien de secret.

Rien n’est enregistré tant que vous n’avez pas approuvé. Pendant ce temps, l’agent poursuit son travail, et votre réponse lui parvient sous forme de message.

### Ce que montre la carte

La proposition s’affiche sous forme de carte dans la conversation, en dehors des étapes repliées, pendant que l’agent continue. En haut, elle demande **Garder ceci comme compétence ?**, **Améliorer cette compétence ?** ou **Améliorer cette compétence intégrée ?**, avec le nom de la compétence et un badge : **En attente de votre réponse**, **Enregistré**, **Ignorée** ou **Remplacée**.

En dessous :

- **Pourquoi** : ce qui s’est passé pendant cette tâche et qui justifie de la garder, dans les mots de l’agent.
- **Quand elle s’applique** : la ligne que les agents lisent pour décider quand l’utiliser. Pour une amélioration qui la modifie, l’ancienne ligne apparaît barrée.
- Ses mots-clés pour Custom, s’il y en a : « Custom l’amène quand vous dites » suivi des mots.
- Les avertissements, le cas échéant (voir [Avertissements sur la carte](#warnings-on-the-card)).
- Le texte, avec un sélecteur entre **Texte** (pour une nouvelle compétence) ou **Modifications** (pour une amélioration, ligne par ligne) et **Compétence** (le guide tel qu’il se lit), ainsi que le nombre de lignes ajoutées et retirées.
- Dans un projet, **La garder pour** : **Toutes les sessions** ou le nom du projet (voir [Compétences proposées par les agents dans un projet](/guide/projects#skills-agents-propose-in-a-project)).

### L’approuver

Cliquez sur **Approuver**. La compétence est enregistrée dans votre bibliothèque, et la carte indique qu’elle est dans votre bibliothèque de compétences : tous les agents peuvent l’utiliser. Un lien **Vos compétences** vous mène à [Paramètres → Compétences](/settings?s=skills).

Si vous avez choisi le nom du projet sous **La garder pour**, elle est enregistrée à la place dans les compétences du projet : la carte indique qu’elle s’y trouve, et **Les compétences du projet** vous y mène.

Custom dispose de la compétence dès son prochain tour ; Claude Code et Codex dès leurs prochaines sessions.

### La modifier d’abord

1. Cliquez sur **Modifier…**. Une fenêtre s’ouvre avec toute la compétence sous forme de texte.
2. Modifiez ce que vous voulez. Les lignes du haut (entre les lignes `---`) contiennent son nom, qui doit rester, et la ligne indiquant quand l’utiliser. Tout ce qui se trouve en dessous est le guide que suivent les agents.
3. Cliquez sur **Enregistrer et approuver**.

La carte indique alors que vous l’avez modifiée avant de l’enregistrer, et affiche la version enregistrée. L’app vérifie le texte modifié comme celui de l’agent : il faut une ligne indiquant quand l’utiliser, de vraies étapes, et aucun secret.

### L’ignorer

1. Cliquez sur **Ignorer…**.
2. Si vous le souhaitez, dites à l’agent pourquoi dans la zone qui s’ouvre.
3. Cliquez sur **Ignorer** (ou sur **Annuler** pour revenir en arrière).

Rien n’est enregistré. L’agent apprend que vous avez ignoré la proposition, avec votre note, et il lui est demandé de ne plus la proposer, sauf si vous le demandez.

### Avertissements sur la carte

Les compétences sont des fichiers que tous les agents lisent ; l’app vérifie donc chaque proposition avant que vous la voyiez :

- **Un secret l’arrête.** Une proposition contenant quelque chose qui ressemble à un mot de passe, une clé ou un jeton (une clé d’API, une clé privée, un mot de passe écrit en clair ou à l’intérieur d’une adresse) ne vous parvient jamais sous forme de carte. L’agent reçoit pour consigne de le retirer et d’indiquer à la place où le secret est conservé.
- **Le texte qui cherche à orienter les agents est signalé.** La carte affiche **Relisez ces lignes avant d’approuver**, avec le numéro de ligne et le texte, lorsqu’une ligne ajoutée par la proposition : demande aux agents d’ignorer leurs instructions, cherche à remplacer l’identité de l’agent, demande aux agents de vous cacher quelque chose, cherche à contourner les approbations, envoie des clés ou des fichiers privés ailleurs, exécute un script pris directement sur internet, modifie les paramètres ou les fichiers de démarrage d’un agent, supprime ou écrase des éléments bien en dehors d’un projet, cache des instructions dans un commentaire HTML, ou contient des caractères invisibles.

Approuver une proposition qui comporte des avertissements demande une confirmation de plus : **L’enregistrer malgré ces avertissements ?** Cliquez sur **L’enregistrer** seulement si les lignes signalées sont bien ce que vous voulez que les agents suivent.

### Répondre depuis les Paramètres ou la boîte de réception

Une proposition attend à trois endroits, et une réponse donnée à l’un d’eux s’affiche partout, sur tous les appareils :

- la carte dans sa conversation ;
- le groupe en haut de [Paramètres → Compétences](/settings?s=skills), « Un agent suggère une compétence » (ou le nombre de suggestions). Chaque ligne indique **Nouvelle compétence :** ou **Remplacer par** et le nom, il y a combien de temps, de quelle conversation elle vient (cliquez pour l’ouvrir), et « comporte des avertissements » le cas échéant. **Relecture** ouvre la même carte dans une fenêtre ;
- la [Boîte de réception](/inbox), sous la forme « Suggère une nouvelle compétence : … » ou « Suggère une modification de la compétence … ». **Ouvrir** vous mène à sa conversation, où se trouve la carte. Voir [Boîte de réception et notifications](/guide/inbox).

### Limites

- Une proposition contient au maximum 20 000 caractères. Les guides plus longs sont refusés, et l’agent doit conserver les étapes principales.
- Une nouvelle compétence a besoin d’un nom non utilisé. Le nom est composé de mots courts en minuscules reliés par des tirets, comme release-notes.
- Au plus cinq propositions d’une même conversation attendent votre réponse en même temps.
- Lorsque l’agent propose de nouveau la même compétence avant que vous ayez répondu, la nouvelle proposition prend la place de l’ancienne, qui affiche **Remplacée**.
- Si une compétence de ce nom a été enregistrée, ou si la compétence a changé, après la proposition, l’approbation échoue avec un message. Ignorez-la et demandez de nouveau à l’agent.
- Les agents ne peuvent améliorer que les compétences de la bibliothèque de l’app et celles propres à un projet. Les compétences propres à Claude Code et à Codex ne sont pas modifiées de cette façon : modifiez-les dans [Paramètres → Compétences](/settings?s=skills).
- Les propositions auxquelles vous avez répondu restent sur leurs cartes dans les anciennes conversations pendant six mois.

## Compétences adaptées à une nouvelle session

Lorsqu’une session démarre avec un message, son agent est aussi informé des compétences qui conviennent à ce message, si certaines conviennent clairement : jusqu’à trois, chacune avec son utilité et la façon dont cet agent en charge une (Claude Code avec son outil Skill, Codex et les autres agents en lisant son SKILL.md, Custom avec son outil de compétences, qui peut aussi trouver une compétence d’après la nature du travail, en quelques mots). L’agent charge celle qui convient avant de commencer, ou poursuit si aucune ne convient. Il en est informé une seule fois, avec votre premier message, et non à chaque message (pour Custom, dans les instructions avec lesquelles il travaille).

Les compétences sont trouvées comme la mémoire retrouve des notes (voir [Ce avec quoi un agent démarre](/guide/memory#what-an-agent-starts-with)) : par leurs mots, le nom d’une compétence comptant le plus, puis ses mots-clés et son utilité ; et, avec la recherche par le sens activée dans [Paramètres → Mémoire](/settings?s=memory&find=Search%20by%20meaning), par leur sens, de sorte qu’une demande formulée autrement, ou dans une autre langue, retrouve quand même sa compétence. Seules les correspondances nettes comptent : par les mots, au moins deux des vôtres et bien devant les autres ; par le sens, la compétence la plus proche seule, lorsqu’elle est assez semblable. Les mots courants d’une demande, comme « aide », « besoin » ou « après », ne comptent pas dans une correspondance. Les bavardages, les réponses brèves et les demandes qu’aucune compétence ne couvre n’en reçoivent aucune.

Cette option se trouve dans le menu **⋯** de [Paramètres → Compétences](/settings?s=skills&find=Suggest%20skills%20that%20fit) : **Suggérer les compétences adaptées**, coché tant qu’elle est activée. Elle est activée sauf si vous la désactivez. Elle ne s’applique pas à une session qui se poursuit, ni aux exécutions d’une app.

## Amener des compétences par mots-clés

Certains modèles chargent rarement une compétence d’eux-mêmes. Pour eux, Custom peut amener une compétence lorsque votre message utilise ses mots-clés : le texte de la compétence accompagne votre message, et l’agent le suit là où il convient.

Cette option se trouve dans le menu **⋯** de [Paramètres → Compétences](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords) : **Amener des compétences par mots-clés**, coché tant qu’elle est activée. Elle est activée sauf si vous la désactivez. Elle ne concerne que Custom ; Claude Code et Codex chargent eux-mêmes leurs compétences. Désactivée, Custom voit toujours sa liste de compétences et en charge une lorsqu’une tâche convient.

Lorsque des mots-clés amènent une compétence, une pastille s’affiche dans la conversation sous votre message : **Compétence research utilisée**, « amenée par “research” dans votre message ». Cliquez dessus pour lire la compétence.

### Comment les mots-clés correspondent

- Un mot-clé correspond à des mots entiers, quelle que soit la casse : « research » ne correspond pas à « researchers ».
- Un mot-clé qui se termine par * correspond aussi à des mots plus longs : « renovat* » correspond à renovate et renovation ; « debug* » correspond à debugging.
- Les messages de moins de quatre mots n’amènent rien, si bien que « ok, go on » ne charge jamais de compétence.
- Au plus deux compétences sont amenées à la fois : celles qui ont le plus de mots-clés dans votre message passent en premier.
- Une compétence amenée reste pour ce message et les deux suivants, afin qu’un processus comme demander d’abord ou faire des recherches puisse se dérouler sur plusieurs tours. Les compétences d’un message plus récent remplacent les plus anciennes.
- Une compétence longue est coupée pour tenir dans ce que le modèle peut accepter ; l’agent doit charger lui-même le reste.

Les compétences intégrées avec mots-clés sont app-builder (« make a template », « make an app », « automate »…), clarify-first (« plan a trip », « business plan », « renovat* »…), clean-up (« clean up after », « leftover files »…), decisions-log (« while I'm away », « overnight »…), evidence-before-done (« double-check », « verify »…), research (« research », « find sources », « literature review »…), troubleshooting (« not working », « keeps crashing », « debug* »…) et writing (« draft a », « proofread », « cover letter »…). La plupart des autres en ont aussi quelques-uns, et les compétences de documents n’en ont aucun : Custom les charge lorsqu’une tâche convient. Vous voyez les mots-clés d’une compétence en l’ouvrant.

### Donner des mots-clés à une compétence

Les mots-clés d’une compétence forment une liste dans les lignes du haut de son SKILL.md, par exemple `triggers: [weekly report, status update, standup]`. Un agent peut proposer jusqu’à 12 mots-clés avec une nouvelle compétence, de 3 à 40 caractères chacun. Custom utilise aussi les mots-clés des compétences de vos propres dossiers et de ceux d’un projet, puisqu’il les lit aussi.

## Compétences propres à Claude Code et à Codex

Claude Code et Codex lisent aussi des compétences dans leurs propres dossiers : les vôtres, qu’ils lisent dans tous les dossiers, et celles d’un projet, qu’ils lisent seulement dans ce projet. Elles apparaissent sur la page Compétences sous **Propres à Claude Code** et **Propres à Codex** (le filtre **Claude Code et Codex** n’affiche qu’elles). Chaque ligne indique d’où vient la compétence :

- **ce dossier** : les compétences propres à un dossier de projet, dans l’onglet Compétences de ce projet.
- **ce dépôt** : les compétences Codex fournies avec le dépôt.
- **tous les dossiers** : vos propres compétences, pour tous les dossiers.
- **un plugin** : les compétences fournies avec l’un des plugins de l’agent (voir [Plugins propres à Claude Code et à Codex](/guide/plugins#claude-codes-and-codexs-own-plugins)).
- **intégrée** : les compétences fournies avec Codex.
- **défini par un administrateur** : les compétences qu’un administrateur a configurées pour Codex.

Pour Claude Code, Paramètres → Compétences liste vos compétences (dans `~/.claude/skills`) ; pour Codex, ce que Codex lui-même indique pour tous les dossiers. L’onglet **Compétences** d’un projet liste aussi celles du dossier du projet, avec des interrupteurs valables pour ce seul projet. Lorsque certaines n’ont pas pu être lues (Codex ne répond pas, fichier de compétence illisible), une ligne sous la liste le signale.

Écrivez-en une avec **Nouvelle compétence**, en choisissant **Claude Code** ou **Codex** sous **Qui la reçoit** (voir [Écrire une compétence](#write-a-skill-of-your-own)). Ouvrez-en une pour la lire ; **Variation** ouvre son SKILL.md dans un éditeur : modifiez-le, cliquez sur **Enregistrer**, puis sur **Terminé**. **Ouvrir le dossier dans Fichiers** affiche le dossier de la compétence, avec les autres fichiers qu’il contient.

## Demander à un agent

- « Quelles compétences de la Bibliothèque les agents ont-ils utilisées, et à quelle fréquence ? »
- « Montre-moi les propositions de compétences qui m’attendent, et ce que chacune modifierait. »
- « Désactive la compétence e-mail pour tous les agents. »
- « Rédige une compétence pour tous les agents sur notre façon de vérifier les factures, à partir de ces trois exemples. »
- « Crée ma propre version de la compétence de recherche qui cite toujours les numéros de page. »
- « Retire ma compétence invoice-checks », ou « Rétablis la compétence que j’ai retirée hier. »
- « Copie dans mes compétences celles que j’ai créées dans d’autres agents, et dresse-m’en d’abord la liste. »
- « Désactive l’ajout de compétences par mots-clés pour Custom. »
- « Arrête de me suggérer des compétences au début des nouvelles sessions. »
- « Dans mon projet Shop website, désactive la compétence de déploiement de Claude Code, et active la compétence docker uniquement là. »
