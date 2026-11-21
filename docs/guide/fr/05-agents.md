# Agents

Un agent est celui sous l’identité duquel une session travaille : ses instructions, ce qu’il peut utiliser, où et quand il travaille, le niveau de modèle avec lequel il réfléchit, les autres agents auxquels il confie du travail, et ce qu’il peut dépenser en un mois. Cette rubrique couvre la page Agents, les agents fournis avec l’app, la création du vôtre en disant ce qu’il doit faire, la modification d’un agent, l’endroit où un agent travaille, ses planifications, les niveaux, les agents qui confient du travail à d’autres agents, un budget mensuel, les versions d’un agent et les exemples qui le vérifient, le démarrage et le changement de session avec un agent, le partage d’un agent sous forme de fichier, l’import des fichiers d’agent de Claude Code, les dossiers de tâche qu’une session reçoit quand vous ne choisissez aucun dossier, et le nettoyage par les agents après une tâche.

![La page Agents : vos agents, chacun dans une carte indiquant où il en est, et les agents intégrés en dessous](images/agents.webp)

## Ce qu’est un agent

Quand vous démarrez une session, vous choisissez un agent sur la page de démarrage, et vous pouvez faire passer la session à un autre plus tard, dans sa zone de message. Ses instructions s’ajoutent à celles du programme lui-même : ainsi, le même programme travaille comme un chercheur rigoureux dans une session et comme un tuteur patient dans la suivante. Un agent fonctionne avec tous les programmes : Claude Code, Codex, Custom (l’agent propre à l’app) et les agents qui parlent ACP (l’Agent Client Protocol), comme Gemini CLI ou OpenCode.

Un agent peut contenir :

- **Instructions** : qui il est et comment il travaille. Il a pour consigne de travailler ainsi tout du long, mais ce que vous demandez dans la conversation passe en premier.
- **Où il travaille** : partout, ou seulement dans certains de vos projets (voir [Où travaille un agent](#where-an-agent-works)).
- **Quand il travaille** : quand vous ou un autre agent le demandez, et selon ses propres planifications (voir [Quand travaille un agent : les planifications](#when-an-agent-works-schedules)).
- **Avec quoi il réfléchit** : Automatique, ou un niveau (Rapide, Standard, Meilleur ou Max) dont vous définissez le modèle une fois pour chaque programme (voir [Avec quoi réfléchit un agent : les niveaux](#what-an-agent-thinks-with-tiers)).
- **Son équipe** : les autres agents auxquels il peut confier une partie de son travail, et si d’autres agents peuvent lui en confier (voir [Les agents qui confient du travail à d’autres agents](#agents-that-hand-work-to-other-agents)).
- **Un budget mensuel** : ce que ses sessions peuvent dépenser en un mois (voir [Un budget mensuel](#a-monthly-budget)).
- **Ce qu’il rend** : les champs de chaque résultat, vérifiés, et la destination de chacun : une page conservée, une ligne dans une feuille de calcul, un e-mail à des personnes, une notification, un fichier, un webhook (voir [Ce qu’un agent rend](#what-an-agent-hands-back)).
- **Une conversation à lui** : il peut garder une conversation, avec une boîte de réception pour les messages venant de vous et d’autres agents, où ses exécutions planifiées publient aussi (voir [Un agent avec sa propre conversation](#an-agent-with-a-conversation-of-its-own)).
- **Ce qu’il peut utiliser** : lire des fichiers, créer et modifier des fichiers, exécuter des commandes, utiliser le web, utiliser un navigateur, utiliser l’ordinateur (son écran, sa souris et son clavier, dans les apps de bureau avec Computer use activé), et d’autres outils. Laissez-les tous activés, ou désactivez-en certains.
- **Compétences à privilégier** : des compétences qu’il charge avant de commencer quand elles conviennent à la tâche (voir [Compétences](/guide/skills)).
- **Apps connectées** : des comptes connectés à activer dans ses sessions (voir [Apps connectées, clés et outils](/guide/connections)).
- **Un programme, un modèle et un mode d’autorisation** à suggérer : ils sont sélectionnés avec lui sur la page de démarrage, et vous pouvez encore les changer avant de commencer.
- **Où démarrent ses sessions** quand vous ne choisissez aucun dossier : un nouveau dossier de tâche qui leur est propre, ou le dossier affiché sur la page de démarrage.

Un agent est un rôle qu’une session endosse. Le texte que tous les agents doivent suivre dans chaque session, dans un projet ou dans une session, par exemple la manière dont vous aimez qu’ils vous parlent, relève plutôt des [Consignes des agents](/guide/guidelines). Les agents s’appelaient des assistants avant la version 0.37.0 ; ce sont les mêmes, avec davantage de possibilités.

## La page Agents

Ouvrez **Agents** dans la barre d’icônes, ou allez à [/agents](/agents). Sur un téléphone, la barre latérale est un tiroir : ouvrez-le d’abord. [Paramètres → Capacités → Vos agents](/settings?s=assistants&find=Your%20agents) comporte une ligne **Vos agents** qui ouvre aussi cette page (elle indique combien d’agents sont les vôtres) ; le reste de cette section concerne les dossiers de tâche et le nettoyage, plus bas.

- Sur un ordinateur, la page comporte une colonne à côté de la barre d’icônes, comme Apps et Paramètres : le logo, **Nouveau** et **Masquer la barre latérale** (Ctrl+B, ⌘B sur Mac) en haut, et les emplacements en dessous. **Nouveau** ouvre un menu : **Nouvel agent** en crée un (voir [Créer un agent](#make-an-agent)) ; **Installer un agent depuis un fichier** installe un agent à partir d’un fichier que quelqu’un vous a donné (voir [Partager un agent sous forme de fichier](#share-an-agent-as-a-file)) ; **Importer des fichiers d’agent Claude Code** importe les fichiers d’agent de Claude Code (voir [Importer les fichiers d’agent de Claude Code](#import-claude-codes-agent-files)).
- Les emplacements : **Tous les agents** (les vôtres sous forme de cartes, et les agents intégrés en dessous quand la colonne est masquée, puisque la colonne les liste), **Vos agents** (seulement les vôtres), **Votre intervention est requise** et **Sur planification** (chacun s’affiche tant que certains des vôtres sont concernés), et, sous **Où ils travaillent**, **Partout** et chaque projet qui a ses propres agents. Chacun indique combien d’agents il contient. Sous **Intégré**, il y a une ligne pour chaque agent fourni avec l’app, avec son icône, qui ouvre la page propre à cet agent. Après un séparateur, **Planifications** montre tout ce qui s’exécute tout seul sur une semaine : les planifications de vos agents avec vos autres tâches planifiées, les planifications de vos apps, les surveillances et les webhooks, chaque exécution colorée selon son déroulement, ce qui s’exécute ensuite, et une liste de tout cela avec un interrupteur pour mettre chacun en pause (voir [Voir la semaine : ce qui s’est exécuté et ce qui s’exécute ensuite](/guide/tasks#see-the-week-what-ran-and-what-runs-next)). L’emplacement ouvert est marqué, et l’adresse le conserve (`/agents?place=mine`, `/agents/schedules`), de sorte qu’un lien l’ouvre.
- En haut de la page, le nom de l’emplacement est à gauche et la zone de recherche à droite : **Trouver un agent** réduit les cartes, ainsi que les agents intégrés, à ceux dont le nom ou la ligne contient ce que vous saisissez.
- Vos agents s’affichent sous forme de cartes. Chaque carte indique le nom de l’agent, sa ligne, où il en est (**En cours**, **Votre intervention est requise** quand une de ses sessions attend votre réponse, **Budget épuisé**, ou **Inactif**), les projets dans lesquels il travaille (ou **Partout**), son niveau, quand il s’exécute ensuite, combien de messages attendent dans sa boîte de réception, et ce qu’il a dépensé **Ce mois-ci**.
- Sur un téléphone et dans une fenêtre étroite, il n’y a pas de colonne : la page garde son titre, avec **Nouvel agent**, **Importer** et **Installer** à droite, deux onglets en dessous (**Vos agents** et **Planifications**), et des pastilles au-dessus des cartes qui affichent **Tout**, **Partout**, chaque projet qui a ses propres agents, **Sur planification** et **Votre intervention est requise**. Les agents fournis avec l’app se trouvent sous **Intégré**.

Cliquez sur une carte pour ouvrir la page propre à l’agent, qui garde la colonne à côté avec cet agent marqué (**Vos agents** pour l’un des vôtres) :

- Ses paramètres en quelques phrases, par exemple « Il travaille partout, chaque jour de la semaine à 09:00, et réfléchit avec Rapide. » Cliquez sur n’importe quel mot souligné pour le modifier à cet endroit (voir [Modifier un agent](#change-an-agent)).
- **Démarrer une session** ouvre la page de démarrage avec l’agent sélectionné (et son projet, quand il travaille dans un projet).
- **Tous les paramètres** ouvre tous les paramètres de l’agent dans une fenêtre (voir [Tous les paramètres](#all-settings)). **Dupliquer** crée une copie à modifier ; **Supprimer** supprime l’un des vôtres.
- **Plus** (⋯) : **Versions**, pour l’un des vôtres, liste ce qu’il était avant chaque modification, pour comparer et rétablir (voir [Versions : revenir à une version antérieure](#versions-go-back-to-an-earlier-one)) ; **Télécharger comme fichier** l’enregistre sous forme de fichier à conserver ou à donner (voir [Partager un agent sous forme de fichier](#share-an-agent-as-a-file)).
- **Exemples**, pour l’un des vôtres : des messages pour l’essayer et ce que sa réponse doit accomplir, avec **Essayer les exemples** (voir [Les exemples qui le vérifient](#examples-that-check-it)).
- **Planifications** liste les tâches planifiées qui s’exécutent sous son identité, avec **Ajouter une planification**.
- **Boîte de réception**, pour un agent qui garde une conversation à lui : ses messages et leurs réponses, une zone pour lui en envoyer un, et **Sa conversation** (voir [Un agent avec sa propre conversation](#an-agent-with-a-conversation-of-its-own)).
- **Ce qu’il a rendu**, pour un agent qui a des champs ou des destinations pour ses résultats : un tableau de ses résultats, une ligne pour chacun, avec la destination de chacun (voir [Ce qu’un agent rend](#what-an-agent-hands-back)).
- **Ce mois-ci** : combien de sessions ont démarré sous son identité et ce qu’elles ont dépensé, par rapport à son budget quand il en a un ; et ses **Sessions récentes**, chacune ouvrant sa conversation, avec **Afficher les 23 dans la barre latérale** à côté (voir [Retrouver les sessions d’un agent](#find-an-agents-sessions)).

## Les agents intégrés

Huit agents sont fournis avec l’app. Aucun ne suggère de programme, de modèle, de niveau ni de mode d’autorisation : ils gardent donc ce que vous avez choisi sur la page de démarrage, et aucun ne limite ce qu’il peut utiliser ni ne dépense de lui-même. Tous sauf Développeur démarrent une session sans dossier dans un nouveau dossier de tâche (voir [Dossiers de tâche](#task-folders-where-a-task-without-a-folder-works)). Vous ne pouvez ni les modifier ni les supprimer, mais vous pouvez en dupliquer un et modifier la copie (voir [Dupliquer ou supprimer un agent](#duplicate-or-delete-an-agent)).

Chacun s’appuie sur les [UI de réponse](/guide/sessions#answer-uis-cards-charts-and-maps-in-replies) adaptées à son travail (une vérification des faits, des exercices auxquels vous répondez sur place, un itinéraire avec une carte, des chiffres clés et des graphiques). Ce qui se voit mieux qu’il ne se lit arrive donc sous une forme à regarder, à comparer, à cocher ou à essayer.

### Général

« Aide pour tout : questions, rédaction, planification, fichiers. » La page de démarrage choisit Général tant que vous n’en choisissez pas un autre à cet endroit (l’agent propre à un projet passe en premier). Il est écrit pour des personnes qui ne sont pas forcément programmeuses.

- Il comprend ce que vous voulez et le fait. Il ne pose une brève question que lorsque la demande est floue d’une manière qui change le résultat, avec les réponses probables sous forme de boutons à cliquer quand il y en a quelques-unes ; sinon, il fait un choix raisonnable et indique lequel.
- Il commence par la réponse, puis donne le détail qui compte, en mots simples, et explique tout terme technique qu’il ne peut pas éviter.
- Il rend chaque réponse facile à saisir et à utiliser : ce qui se voit mieux qu’il ne se lit (options côte à côte, lieux sur une carte, étapes à cocher, chiffres sous forme de graphique, éléments accompagnés de leurs images) prend la forme d’une UI de réponse, avec une image ou une vidéo quand voir aide, et ses propres mots portent le raisonnement et les conseils.
- Il cherche sur le web tout ce qui est d’actualité ou dont il n’est pas sûr, lit les fichiers que vous lui indiquez, et enregistre le travail que vous voudrez garder sous forme de fichiers dans le dossier de la session, ou le conserve dans les fichiers du projet (ses détails → **Fichiers**) quand il s’agit d’une page que vous réutiliserez, comme un outil de suivi ou une calculatrice.
- Quand une réponse ouvre des suites naturelles (approfondir, comparer, planifier, en tirer quelque chose), il termine par deux à quatre d’entre elles sous forme de boutons à toucher, mais pas après chaque réponse.
- Quand il a créé ou modifié des fichiers, il termine en disant lesquels et où ils se trouvent.

### Chercheur

« Trouve et vérifie des sources, et les cite. »

1. Il reformule votre question en une ligne, et décompose une question large en quelques sous-questions qui appellent une réponse.
2. Il cherche largement avant de conclure : plusieurs recherches sur le web avec des formulations différentes, dans les catégories de recherche adaptées (articles, actualités, brevets, documents d’entreprises, jeux de données), avec plus de résultats quand il couvre largement un sujet.
3. Il lit les sources importantes au lieu de répondre à partir d’extraits, et privilégie les sources primaires et faisant autorité : articles et données d’origine, sites officiels, experts et médias reconnus. Il note la date de chaque source, et indique à quel point la réponse est à jour quand les faits évoluent avec le temps.
4. Quand les sources se contredisent, il le dit et les pondère selon leur qualité et leur actualité, et distingue ce qui est établi, ce qui est contesté et ce qui est inconnu.
5. Il cite au fur et à mesure : un repère numéroté après chaque affirmation, comme [1], et les sources à la fin avec le titre, l’auteur ou l’éditeur, la date et le lien. Il n’invente jamais une source, une citation, un chiffre ni un lien, et dit quand il n’a pas pu vérifier quelque chose.
6. Il commence par les résultats : la réponse en une ligne et les quelques points qui comptent, puis le détail, puis ce qui reste incertain.
7. Il met en forme ce qui a sa propre forme au lieu de l’enfouir dans des paragraphes : des affirmations confrontées aux preuves sous forme de vérification des faits, des options ou des études côte à côte, le déroulement d’un événement sur une chronologie, les chiffres clés, les articles à lire, et les liens entre des personnes, des idées ou des organisations sous forme de graphe de réseau.
8. Un long rapport est aussi conservé dans les fichiers du projet sous forme de document que vous pouvez lire, commenter et exporter, ou sous forme de fichier Markdown dans le dossier de la session quand vous voulez un fichier.

Pour une grande question qui demande de nombreuses recherches, voir la recherche approfondie dans [Recherche approfondie, seconds avis et plusieurs agents](/guide/research).

### Rédacteur

« Rédige, corrige et peaufine vos textes » : e-mails, lettres, publications, essais, rapports, récits et discours.

- Avant un texte long, il s’assure du public, de l’objectif, du ton et de la longueur. Il pose une brève question quand l’un d’eux est flou et important (dans un formulaire quand il y en a plusieurs) ; sinon, il énonce ses hypothèses en une ligne et écrit.
- Il écrit de façon simple et précise : des mots concrets, l’idée principale dès le début, des phrases variées, sans remplissage ni clichés.
- Il adopte le ton que vous demandez, ou le vôtre quand vous partagez des textes que vous avez déjà écrits.
- Quand il corrige votre texte, il garde votre sens et votre voix : il corrige ce qui est faux, resserre ce qui est lâche, laisse ce qui fonctionne. Il montre les modifications pour que vous puissiez les suivre : votre texte avec chaque changement marqué et expliqué quand vous voulez un retour, ou ce qui a changé entre les versions pour une réécriture, puis le texte propre.
- Il remet les textes courts prêts à l’emploi : un e-mail en plusieurs versions entre lesquelles basculer, ouvert dans votre application de messagerie avec tout rempli ; des publications, chacune vérifiée par rapport à la limite de longueur de sa plateforme ; une référence dans le style voulu.
- Quand un choix compte (un objet de message, un titre, une accroche, un nom), il propose deux à quatre options, chacune avec une note, pour que vous choisissiez.
- Tout ce qui dépasse quelques paragraphes est conservé sous forme de document (dans les fichiers du projet), où vous pouvez le modifier, le commenter et l’exporter, et il vous le signale ; il crée un fichier dans le dossier de la session (Markdown sauf si vous voulez un autre format) quand vous demandez un fichier.

### Développeur

« Crée, corrige et explique des logiciels. » Développeur est un ingénieur logiciel qui travaille dans votre projet : contrairement aux autres agents intégrés, il travaille donc dans le dossier que vous choisissez sur la page de démarrage, et non dans un nouveau dossier de tâche.

- Il lit le code autour d’une modification avant de la faire, et respecte les conventions et les outils du projet.
- Il limite les modifications à ce que vous avez demandé, et signale les autres problèmes qu’il remarque au lieu de les corriger sans qu’on le lui demande.
- Après avoir modifié du code, il exécute les tests, la compilation ou le linter du projet quand il en a, et corrige ce qui échoue.
- Si vous semblez débutant en programmation, il explique ce qu’il a fait et comment l’exécuter, en mots simples : des commandes à exécuter, chacune avec un bouton de copie et ce qu’elle fait, et un extrait que vous pouvez essayer dans un bac à sable.
- Quand il explique du code au lieu de le modifier, il met en forme ce qui a sa propre forme au lieu d’un mur de texte : une erreur avec ses causes probables et ses corrections, une exécution de tests, les fichiers d’un projet sous forme d’arborescence, un point d’accès, du code expliqué pas à pas à côté de ses lignes, l’exécution d’un programme ligne par ligne avec ses variables, des approches à peser côte à côte, et un diagramme pour un flux ou une architecture.
- Il termine par un court résumé : ce qui a changé, comment il l’a vérifié, et ce qui reste à faire.

### Tuteur

« Enseigne pas à pas et vérifie que vous suivez. » L’objectif est que vous compreniez et que vous sachiez le faire vous-même, pas seulement que vous obteniez une réponse.

- Si votre niveau ou votre objectif est flou, il pose d’abord une question rapide, avec les réponses probables sous forme de boutons à cliquer (débutant, connaissances de base, révision d’examen).
- Il enseigne une étape à la fois, en mots simples, avec un exemple concret pour chaque nouvelle idée, du plus simple au plus difficile.
- Il fait de chaque étape quelque chose à voir ou à essayer, pas seulement à lire : un diagramme, une image, une fiche de formule, le graphique d’une fonction avec des curseurs, une carte des liens entre les idées, une explication dont vous pouvez changer la profondeur, un exemple résolu révélé une étape à la fois, du code que vous pouvez exécuter et modifier, du code expliqué ligne par ligne, un programme exécuté pas à pas après que vous avez prédit ce qu’il affiche, une petite simulation ; des mathématiques écrites comme dans un manuel.
- Après chaque étape, il vérifie avec quelque chose à quoi vous répondez sur place, et attend avant de continuer : un court quiz, des exercices auxquels vous répondez avec vos propres mots ou chiffres (vérifiés au fur et à mesure, avec des indices et la solution après un essai), des textes à trous, des associations ou des éléments à remettre dans l’ordre. Il lit le score et les réponses que vous renvoyez.
- Quand vous répondez, il dit ce qui était juste, corrige avec bienveillance et précision ce qui ne l’était pas, et s’adapte : une autre explication ou un autre exemple quand vous bloquez, une étape plus difficile quand vous avancez bien.
- Pour des devoirs ou des exercices, il vous guide avec des indices et des questions, et ne donne la solution complète que si vous la demandez ou si vous bloquez encore après avoir essayé.
- Pour une langue, il vous donne des mots à écouter et à pratiquer, des formes verbales, des conversations, et vos propres phrases corrigées avec chaque erreur marquée et expliquée.
- Il clôt un sujet par un court récapitulatif et des cartes mémoire de ce qu’il faut retenir, et propose la suite à apprendre sous forme de boutons à toucher. Pour un cours plus long, il tient une feuille de route des sujets et de votre progression.

### Planificateur

« Planifie des voyages, des événements et des projets », ainsi que des déménagements et des routines.

- Il commence par cerner ce qui façonne le plan : l’objectif, les dates et les échéances, le budget, les personnes concernées et les contraintes strictes. Il demande les quelques éléments manquants qui comptent (dans un formulaire quand il y en a plusieurs), et suppose des valeurs par défaut raisonnables pour le reste, en disant ce qu’il a supposé.
- Il vérifie sur le web les faits dont le plan dépend (horaires d’ouverture, durées de trajet, prix, disponibilités, règles, météo), et dit quand quelque chose n’a pas pu être vérifié ou peut changer.
- Il rend le plan concret : horaires, lieux, coûts et qui fait quoi, de la marge pour les imprévus, et ce qu’il faut réserver ou décider en premier.
- Il présente le plan pour que vous le suiviez d’un coup d’œil, dans les UI de réponse conçues pour les plans : un voyage jour par jour avec ses lieux sur une carte, le programme d’une journée, des dates sur un calendrier ou un compte à rebours, un projet par phases ou par semaines, ce qu’il faut réserver ou emporter sous forme de liste à cocher, les prévisions météo, et les coûts sous forme de budget avec un total.
- Quand un choix compte, il propose deux ou trois options côte à côte avec leurs avantages et inconvénients (vols et hébergements pour un voyage).
- Il conserve le plan dans les fichiers du projet, où vous pouvez le modifier : un document, et une feuille de calcul pour les budgets et les calendriers avec des totaux. Il propose de l’ajuster, avec les modifications probables sous forme de boutons à toucher. Il crée plutôt des fichiers dans le dossier de la session quand vous demandez des fichiers.

### Analyste

« Donne du sens aux données et aux feuilles de calcul, avec des graphiques » : feuilles de calcul, fichiers CSV, exports et chiffres.

- Il examine les données avant de les analyser (colonnes, taille, types et lacunes) et signale les problèmes comme les valeurs manquantes, les doublons ou les formats inhabituels avant de tirer des conclusions.
- Il calcule avec du code (un court script Python ou JavaScript, ou une formule), jamais en estimant à l’œil, et garde les scripts dans le dossier de la session pour que le travail puisse être répété.
- Il répond d’abord à la question, en mots simples avec les chiffres clés, puis montre comment il y est arrivé. Il énonce ses hypothèses et ses limites, et ne prétend pas établir des causes que les données ne peuvent pas montrer.
- Il présente les résultats dans les UI de réponse conçues pour les chiffres : les chiffres clés, un graphique (le plus simple qui convient : barres pour comparer, lignes dans le temps), un tableau que vous pouvez trier et filtrer, la répartition des valeurs, les parts d’un tout, l’évolution d’un total, les flux, les valeurs selon deux dimensions sous forme de carte de chaleur, des chiffres localisés sur une carte, et une calculatrice quand vous voudrez essayer d’autres valeurs. Un graphique qu’aucune d’elles ne dessine va dans une figure dynamique dans la réponse, ou dans une page quand il y en a plusieurs ; les axes et les unités sont étiquetés, et le tout se lit sur un téléphone.
- Il enregistre les données nettoyées et les résultats sous forme de fichiers (CSV, ou XLSX si vous le demandez) quand vous voudrez les garder. Un tableau que vous consulterez et modifierez est conservé sous forme de feuille de calcul avec ses formules, et un tableau de bord auquel vous reviendrez sous forme de page.

### Créateur d’apps

« Crée vos propres apps : un formulaire, des étapes, des données et un écran » (voir [Apps](/guide/apps)).

- Il cerne ce qui entre, ce qui sort et à quoi ressemble une bonne exécution, ne demande que ce qui change la conception, et dit ce qu’il a supposé.
- Il construit l’app avec ses propres outils, en choisissant l’étape la moins coûteuse pour chaque partie (un outil, une réponse rapide d’un modèle, une règle, du code) et un agent là où il faut du jugement.
- Il donne à l’app deux à quatre exemples avec des vérifications, les essaie, et corrige ce qui échoue avant de la remettre, en indiquant ce que coûte une exécution et combien de temps elle prend.
- Quand vous modifiez vous-même l’app, il s’appuie sur votre modification.
- Il utilise la compétence app-builder.

## Créer un agent

### Dire ce qu’il doit faire

1. Sur la [page Agents](/agents), cliquez sur **Nouveau** en haut de la colonne, puis sur **Nouvel agent** (sur un téléphone, **Nouvel agent** en haut de la page). La fenêtre **Nouvel agent** s’ouvre en deux étapes, indiquées en haut : **1 Décrire** et **2 Configuration**.
2. Sous « Que doit faire votre agent ? », dites-le avec vos propres mots, et précisez quand il doit travailler tout seul, le cas échéant : « Chaque vendredi après-midi, rédige mon rapport d’avancement hebdomadaire à partir de mes commits et de mes notes, et laisse-moi le relire avant l’envoi. » Sous **Ou partez d’une idée**, **Veille d’articles**, **Rapport hebdomadaire**, **Relecteur de modifications** et **Traducteur** placent une phrase dans la zone de saisie lorsque vous cliquez dessus, que vous pouvez modifier.
3. Cliquez sur **Rédiger mon agent** (ou appuyez sur Ctrl+Entrée, ⌘+Entrée sur Mac). Le modèle d’appoint (Paramètres → Modèles → Modèle d’appoint) rédige l’agent : son nom, son icône, sa ligne de présentation, ses instructions, ce qu’il peut utiliser, le niveau avec lequel il réfléchit, et une planification si vous en avez demandé une. La fenêtre passe à **Configuration**.
4. Relisez le brouillon et modifiez ce que vous voulez (voir [Tous les paramètres](#all-settings)). **Retour** ramène à **Décrire** : ce que vous avez écrit est conservé, et rédiger à nouveau remplace le brouillon.
5. Cliquez sur **Créer l’agent**. L’app affiche « *nom* est prêt » et ouvre sa page ; sa planification, s’il en a une, est une tâche planifiée exécutée sous son nom.

Si vous fermez la fenêtre (✕, Échap ou un clic en dehors) après avoir saisi ou modifié quelque chose, elle demande d’abord **Abandonner cet agent ?**. L’onglet **Agents** d’un projet propose **Nouvel agent ici**, qui crée un agent travaillant dans ce projet et, tant que le projet n’en a aucun, **En créer un pour ce projet**, qui en crée un à partir de ce que le projet dit de lui-même ou à partir du modèle correspondant à son type ; un nouveau projet peut en recevoir un dès sa création (voir [Projets](/guide/projects)).

### Le configurer vous-même

**Le configurer moi-même**, sous la zone de saisie, ignore le brouillon et ouvre **Configuration** sans rien de rempli, hormis l’icône (voir [Tous les paramètres](#all-settings)). Vous pouvez conserver jusqu’à 200 agents à vous.

### Demander à un agent d’en créer un

Dans n’importe quelle session, demandez avec vos propres mots : « Crée-moi un agent qui résume mes newsletters non lues chaque vendredi à 17 h. » L’agent auquel vous parlez, quel que soit le programme sur lequel il fonctionne (Claude Code, Codex, Custom ou un autre), le crée pour vous : son nom, sa ligne de présentation, ses instructions, ce qu’il peut utiliser, son niveau et le reste, ainsi que ses planifications lorsqu’il doit travailler tout seul. Une carte s’affiche d’abord dans la conversation : elle présente l’agent et les moments où ses planifications s’exécutent, avec **Créer l’agent** et **Ne pas** ; rien n’est enregistré tant que vous n’avez pas répondu (voir [La carte : confirmer une modification](/guide/ask-agents#the-card-confirming-a-change)).

De la même manière, un agent peut modifier l’un de vos agents (seul ce que vous demandez change, et le résultat est conservé comme une nouvelle version par **Un agent**), lui donner une planification, en modifier une, en retirer une devenue inutile, ou supprimer un agent avec ses planifications. Une modification qui ajoute, modifie ou retire des planifications, ainsi que toute suppression, demande votre accord à chaque fois, sauf si la session est en **Accès complet**. Donner **Accès complet** à un agent (il ne demande jamais) demande aussi votre accord à chaque fois.

### Tous les paramètres

**Configuration** est la deuxième étape de **Nouvel agent**, et c’est aussi ce qu’ouvre **Tous les paramètres** sur la page d’un agent, pour cet agent, sans l’étape **Décrire**. Sur un téléphone, la fenêtre occupe tout l’écran. En haut se trouvent l’icône (cliquez dessus pour en choisir une parmi 30 : un télescope, un stylo, une toque de chef, un avion, un portefeuille, etc.) et le nom, de 60 caractères au maximum, comme « Comptable » ou « Agent de voyages ». Seul le nom est obligatoire.

Sur ordinateur, une colonne à gauche liste sept sections, chacune avec son réglage actuel sous son nom, pour que l’ensemble de l’agent se voie d’un coup d’œil ; cliquez sur l’une d’elles pour afficher ses paramètres à côté. Lorsqu’une section est plus longue que la fenêtre, un bouton **Suite plus bas** indique qu’il y a une suite. Sur un téléphone, **Configuration** liste les sections avec le réglage de chacune ; touchez-en une pour l’ouvrir, et **‹ Tous les paramètres** permet de revenir en arrière.

- **À propos** :
  - **Une ligne à son sujet** : 160 caractères au maximum, affichée sur sa carte et dans le menu de la page de démarrage, par exemple « Tient les comptes du foyer en ordre ».
  - **Instructions** : qui il est et comment il travaille, 20 000 caractères au maximum. Il les lit au début de chaque session. Rédigez-les comme les agents intégrés : « Tu es le comptable de l’utilisateur pour cette session », puis quelques lignes sur sa façon de travailler (« Demande les relevés dont tu as besoin », « Garde les totaux dans une feuille de calcul dans le dossier de travail »).
- **Où et quand** :
  - **Où il travaille** : **Partout**, ou **Seulement dans certains projets** avec un interrupteur pour chaque projet (voir [Où travaille un agent](#where-an-agent-works)).
  - **Quand il travaille** : pour un nouvel agent, **Sur demande**, **À une heure précise** (des jours et une heure) ou **Tous les…** (un intervalle), et **Chaque exécution commence par**, le message par lequel commence chaque exécution planifiée. Pour un agent que vous avez déjà, ses planifications sont listées ici ; vous les ajoutez et les modifiez sur sa page, sous **Planifications** (voir [Quand un agent travaille : les planifications](#when-an-agent-works-schedules)).
  - **Garde une seule conversation, avec une Boîte de réception** (voir [Un agent avec sa propre conversation](#an-agent-with-a-conversation-of-its-own)).
  - **Où démarrent ses sessions**, lorsqu’aucun dossier n’est choisi sur la page de démarrage :
    - **Un nouveau dossier de tâche** (par défaut) : chaque session reçoit un dossier neuf qui lui est propre (voir [Dossiers de tâche](#task-folders-where-a-task-without-a-folder-works)).
    - **Le dossier de la page de démarrage** : les sessions travaillent dans le dossier affiché à cet endroit, comme Développeur. Choisissez cette option pour les agents qui travaillent dans un projet.
- **Modèle** :
  - **Réfléchit avec** : **Automatique**, **Rapide**, **Standard**, **Meilleur** ou **Max**, chacun accompagné d’une ligne sur son usage (voir [Avec quoi un agent réfléchit : les niveaux](#what-an-agent-thinks-with-tiers)).
  - **Fonctionne avec** : le programme qu’il suggère, choisi avec lui sur la page de démarrage.
    - **N’importe quel agent** (par défaut) conserve le programme choisi sur la page de démarrage.
    - **Claude Code**, **Codex**, **Custom** (« n’importe quel modèle »), ou tout agent que vous avez ajouté dans [Paramètres → Agents → Plus d’agents](/settings?s=agents).
    - Une fois un programme choisi, un menu de modèles apparaît à côté avec les modèles de ce programme (pour les programmes qui proposent un choix) ; si vous n’y touchez pas, c’est le modèle par défaut du programme. Un niveau choisi plus haut sélectionne le modèle à la place.
  - **Mode d’autorisation** : quand il vous demande d’abord.
    - **Selon le choix** (par défaut) : conserve le mode choisi sur la page de démarrage.
    - **Demander** : demande avant de modifier des fichiers et d’exécuter des commandes.
    - **Accepter les modifications** : modifie les fichiers librement, demande avant les commandes.
    - **Accès complet** : ne demande jamais.
    - **Plan** : lit et planifie seulement, jusqu’à votre approbation.

    Claude Code, Codex et Custom ont chacun un mode correspondant. Les autres agents (Gemini CLI, OpenCode…) conservent les leurs.
  - **Sous-agents qu’il démarre** : **Tous**, ou jamais au-dessus d’un niveau.
  - **Monter d’un niveau quand une vérification échoue** : activé sauf si vous le désactivez.
- **Outils** : **Ce qu’il peut utiliser** (sept interrupteurs, tous activés pour un nouvel agent, avec **Tout activer** lorsque certains sont désactivés ; voir plus bas), **Compétences à privilégier** (voir plus bas) et **Apps connectées**, affichées lorsque vous avez des comptes connectés (voir plus bas).
- **Équipe** : **Les autres agents peuvent lui confier du travail**, et **Il peut confier du travail à** avec un interrupteur pour chaque autre agent (voir [Les agents qui confient du travail à d’autres agents](#agents-that-hand-work-to-other-agents)).
- **Résultats** : ce qu’il rend : les champs de chaque résultat et la destination de chacun (voir [Ce qu’un agent rend](#what-an-agent-hands-back)).
- **Budget** : **Aucune limite**, ou **Une limite mensuelle** en dollars ; pour un agent que vous avez déjà, la page indique ce qu’il a dépensé ce mois-ci (voir [Un budget mensuel](#a-monthly-budget)).

**Créer l’agent** crée un nouvel agent. Pour un agent existant, **Enregistrer** conserve vos modifications (« *nom* est enregistré ») et **Annuler** ferme la fenêtre sans enregistrer ; la fermer après une modification demande **Abandonner vos modifications ?**.

### Ce qu’il peut utiliser

Chaque interrupteur couvre un type d’outil :

- **Lire des fichiers** : ouvrir, lister et rechercher des fichiers et des dossiers.
- **Créer et modifier des fichiers** : écrire de nouveaux fichiers et modifier des fichiers existants.
- **Exécuter des commandes** : des programmes et des scripts sur cet ordinateur.
- **Utiliser le web** : rechercher et lire des pages web.
- **Utiliser un navigateur** : ouvrir des sites web, cliquer et remplir des formulaires dans un vrai navigateur.
- **Utiliser l’ordinateur** : voir l’écran et utiliser la souris et le clavier dans n’importe quelle app (les apps de bureau, avec l’utilisation de l’ordinateur activée).
- **Autres outils** : les serveurs MCP (serveurs d’outils) et les plugins configurés pour les agents.

Ce qui arrive aux outils que vous désactivez dépend du programme :

- **Claude Code et Custom** voient ces outils désactivés. Avec **Autres outils** désactivé, Claude Code n’obtient que les outils propres à l’app et vos comptes connectés, aucun des serveurs MCP que vous avez configurés vous-même.
- **Codex** reçoit la consigne de ne pas les utiliser. Avec **Utiliser le web** désactivé, sa propre recherche web est aussi désactivée. Avec **Exécuter des commandes** désactivé mais **Lire des fichiers** activé, Codex reçoit la consigne de n’utiliser son shell que pour lire et rechercher des fichiers, puisqu’il lit les fichiers par le shell.
- **Claude Code, Codex et Custom** voient aussi les outils du navigateur et de l’ordinateur désactivés lorsque **Utiliser un navigateur** ou **Utiliser l’ordinateur** est désactivé.
- **Les autres agents** reçoivent la consigne de ne pas les utiliser.

Les outils propres à l’app (pages, mémoire et autres) restent activés, sauf ceux qui relèvent d’un interrupteur que vous avez désactivé : avec **Utiliser le web** désactivé, la recherche web et la lecture de pages de l’app disparaissent aussi ; avec **Utiliser un navigateur** désactivé, son navigateur disparaît ; avec **Utiliser l’ordinateur** désactivé, ses outils d’écran, de souris et de clavier disparaissent ; avec **Lire des fichiers** désactivé, son lecteur de documents disparaît. Les comptes connectés ne font pas partie des « autres outils » : ce sont les **Apps connectées** ci-dessous qui en décident. Lorsqu’une tâche exige quelque chose que l’agent ne peut pas utiliser, il reçoit la consigne de le dire plutôt que de le contourner.

### Compétences à privilégier

Dans **Outils**, saisissez le nom d’une compétence et appuyez sur Entrée (ou tapez une virgule) pour l’ajouter. Le champ suggère les compétences propres à Claude Code et à Codex, telles que [Paramètres → Agents → Compétences](/settings?s=skills) les liste pour le dossier ouvert dans Fichiers ; vous pouvez aussi saisir le nom d’une compétence de la bibliothèque de compétences, comme research. Cliquez sur la corbeille à côté d’un nom pour le retirer. Jusqu’à 30. Lorsqu’une de ces compétences convient à la tâche, l’agent la charge avant de commencer et la suit. Voir [Compétences](/guide/skills) pour les compétences fournies avec l’app et la façon d’en ajouter d’autres.

### Connexions

**Apps connectées**, dans **Outils**, ne s’affichent que lorsque vous avez des comptes connectés (configurés dans [Apps → Apps connectées](/apps/connected)). Chacune a un interrupteur : activé, elle l’est dans les sessions de cet agent. Une app déjà activée pour toutes les sessions indique plutôt « Activée pour toutes les sessions ». Si un compte nommé par l’agent n’est plus connecté, il apparaît avec « Non connecté » sous son nom et un bouton pour le retirer. Voir [Apps connectées, clés et outils](/guide/connections).

## Modifier un agent

Sur la page d’un agent, ses paramètres se lisent comme des phrases : ce qu’il fait, « Il travaille *partout*, *chaque jour de la semaine à 09:00*, et réfléchit avec *Rapide*. Il peut *lire des fichiers et utiliser le web*, et ne demande d’aide à *aucun autre agent*. Il rend *sa réponse*. Il dépense au plus *3 $* par mois. » Chaque partie soulignée ouvre ce qui la modifie, et la modification est enregistrée aussitôt :

- **Où il travaille** : **Partout**, ou un interrupteur pour chaque projet.
- **Quand il travaille** : ses planifications, chacune ouvrant son éditeur, **Ajouter une planification**, et **Garde une seule conversation, avec une Boîte de réception**.
- **Avec quoi il réfléchit** : Automatique ou un niveau, **Sous-agents qu’il démarre, jamais au-dessus de**, et **Monter d’un niveau quand une vérification échoue**.
- **Ce qu’il peut utiliser** : les sept interrupteurs.
- **À qui il demande de l’aide** : un interrupteur pour chaque autre agent, et **Les autres agents peuvent lui confier du travail**.
- **Ce qu’il rend** : ses champs et la destination de chaque résultat.
- **Son budget mensuel** : des dollars par mois, ou aucun.

**Tous les paramètres** contient le reste (voir [Tous les paramètres](#all-settings)). Chaque modification est conservée comme une version, ce qui permet de revenir en arrière (voir [Versions : revenir à une version antérieure](#versions-go-back-to-an-earlier-one)). Les sessions que vous démarrez ensuite utilisent la nouvelle version, tout comme les sessions avec lui déjà en cours, à partir de votre prochain message : Custom la relit avant chaque tour, et Claude Code et Codex repartent de zéro dès qu’ils sont libres (la conversation continue).

## Versions : revenir à une version antérieure

Chaque enregistrement qui change ce qu’est l’un de vos agents conserve une version : une modification sur sa page, dans **Tous les paramètres**, depuis la ligne de commande, par un agent à qui vous l’avez demandé (via l’API de l’app), ainsi que le brouillon ou le fichier qui l’a créé. Ouvrez sa page, puis **Plus** (⋯) → **Versions** :

- La liste montre chaque version, la plus récente en premier : **v1**, **v2**…, ce qui a changé en quelques phrases (« Il réfléchit maintenant avec Meilleur (c’était Rapide). Son budget mensuel est maintenant de 5 $ (c’était 3 $). ») ou ce que l’agent qui l’a modifié a dit avoir fait, qui l’a enregistrée (**Vous**, **Un agent**, **Brouillon**, **Installée**, **Importé**) et quand ; **Maintenant** marque la version actuelle. Une version avec laquelle ses exemples ont été essayés indique combien ont réussi (« Exemples : 2 sur 3 réussis »), pour que vous voyiez si une modification l’a amélioré.
- Cliquez sur une version pour la comparer à la précédente, ou choisissez-en deux dans **Comparer** … **avec** … : ce qui a changé entre elles, en phrases, et ses **Instructions** côte à côte, les lignes retirées en rouge et les lignes ajoutées en vert.
- **La rétablir** redonne à la version choisie le statut de version actuelle. Elle est enregistrée comme une nouvelle version qui indique « Version 3 rétablie. », de sorte que celle qu’il avait reste dans la liste, pour y revenir. Les agents auxquels il avait confié du travail et les projets disparus depuis sont écartés.

Un agent conserve ses 50 dernières versions ; elles disparaissent lorsque vous le supprimez. Ses exemples ne font pas partie d’une version : rétablir une ancienne version conserve les exemples qu’il a actuellement. Un agent créé avant que les versions soient conservées reçoit son état d’alors comme première version (« Avant la conservation des versions ») à sa première modification.

## Exemples qui vérifient

Les exemples vous permettent de vérifier qu’un de vos agents fait toujours son travail après une modification, comme les exemples d’une app. Chacun est un message pour l’essayer et ce que sa réponse doit remplir. Sur la page de l’agent, sous **Exemples** :

1. **Ajouter un exemple** : donnez-lui un nom si vous le souhaitez, écrivez **Le message pour l’essayer** comme vous l’écririez à l’agent, puis ajoutez une vérification pour chaque chose que fait une bonne réponse. Une vérification est une phrase simple, comme « Il nomme les deux pull requests » ou « Il dit clairement quand il n’a rien trouvé de nouveau », à laquelle le modèle d’appoint compare sa réponse ; ou une règle sur ce qu’il a rendu, comme la vérification d’une app : `{{reply}} contains Lisbon` ou, pour un agent qui renvoie des résultats, `{{result.count}} > 0` sur l’un de ses champs. **Enregistrer l’exemple**. Un agent peut avoir jusqu’à 10 exemples, chacun avec jusqu’à 8 vérifications.
2. **Essayer les exemples** (ou le bouton en forme de fiole à côté d’un exemple, pour celui-là seul) commence par indiquer ce qu’il va faire et coûter : combien de sessions il démarre en tant qu’agent et sur quel niveau, à peu près combien cela coûte (d’après le coût de ses derniers essais, ou le coût de ses sessions ce mois-ci ; rien sur quoi s’appuyer avant son premier essai), et ce qui reste de son budget mensuel, auquel les essais sont imputés. Appuyez sur **Les essayer**.
3. Chaque exemple s’exécute dans une session à part, démarrée en tant qu’agent sur son niveau, dans un dossier vide qui lui est propre (supprimé une fois son résultat conservé ; sa conversation reste), et tenue à l’écart de votre liste de sessions. Il n’envoie rien : ce qu’il enverrait par vos apps connectées est conservé comme ce qu’il aurait envoyé, et ce qu’il renvoie ne va nulle part ailleurs que dans l’essai. Une fois terminé, ses vérifications sont lues. Un agent qui a des champs à renvoyer doit aussi renvoyer un résultat.

Chaque exemple indique ensuite comment s’est passé son dernier essai : **Réussi**, le nombre de vérifications échouées, **Non terminé**, ou **En attente de votre réponse** (sa session vous pose une question : ouvrez-la), avec la date et le coût. Cliquez sur un exemple pour voir son message, chaque vérification avec ce qui a été constaté (✓ ou ✗), ce qu’il a renvoyé, sa réponse et **Ouvrir sa session**. Quand vous modifiez l’agent après le dernier essai de ses exemples, la page le signale avec **Les réessayer**. Les exemples ne s’exécutent jamais d’eux-mêmes.

## Où travaille un agent

Un agent travaille **Partout** tant que vous ne choisissez pas de projets pour lui. Un agent qui travaille dans certains projets :

- n’est proposé que là : le menu des agents de la page de démarrage le liste quand l’un de ses projets est choisi, et les autres agents ne peuvent lui confier du travail que dans les sessions de ses projets ;
- travaille dans le dossier du projet quand il travaille dans un seul projet, avec les connaissances, la mémoire, les consignes et les compétences du projet ;
- apparaît dans l’onglet **Agents** de chacun de ses projets (voir [Projets](/guide/projects)).

Si vous choisissez sur la page de démarrage un projet où l’agent choisi ne travaille pas, la page de démarrage choisit à la place l’agent propre au projet, sinon Général.

## Quand un agent travaille : les planifications

Un agent travaille quand vous démarrez une session avec lui, quand un autre agent lui confie du travail, et selon ses planifications. Une planification est une tâche planifiée qui s’exécute en tant qu’agent : à une heure donnée, à intervalle régulier, une seule fois, quand une page ou un flux change, ou quand un autre service appelle son webhook (voir [Tâches planifiées](/guide/tasks)).

- Sur la page de l’agent, **Ajouter une planification** ouvre l’éditeur de tâche avec l’agent choisi et une heure préremplie : donnez-lui un nom et le message que démarre chaque exécution, puis enregistrez.
- Cliquez sur une planification dans la liste pour la modifier, la mettre en pause ou l’exécuter maintenant.
- Une planification rédigée avec un nouvel agent est créée avec lui.
- Une planification qu’un agent ajoute à l’un de vos agents démarre sur **Automatique** là où c’est proposé (voir [Tâches planifiées](/guide/tasks#model-effort-permissions-and-other-options)), sauf si cet agent indique son propre modèle. Un agent qui réfléchit avec un niveau s’exécute quand même sur son niveau.
- Un agent, dans n’importe quelle session, peut ajouter, modifier ou retirer pour vous les planifications d’un agent (voir [Demander à un agent d’en créer une](#ask-an-agent-to-make-one)).
- Une planification devenue inutile disparaît d’elle-même : une planification ponctuelle après une exécution réussie, et une planification dont l’exécution constate que le travail est fait (ce qu’elle attendait ou surveillait s’est produit, comme son message le demandait pour s’arrêter alors), ce que la notification de l’exécution indique. Les planifications d’un agent sont supprimées avec lui.

Chaque planification figure aussi dans [Paramètres → Agents → Tâches planifiées](/settings?s=tasks), avec toutes les autres ; l’option **Agent** d’une tâche est l’agent en tant que lequel ses exécutions travaillent. L’espace [**Planifications**](/agents/schedules) de la colonne de la page Agents (un onglet en haut sur téléphone) les montre sur une semaine avec toutes les autres tâches : ce qui s’est exécuté, comment cela s’est passé et ce qui s’exécute ensuite, avec **Agent ·** et le nom de l’agent sur chacune dans sa liste ; son crayon ouvre la page de l’agent.

## Avec quoi un agent réfléchit : les niveaux

Les niveaux choisissent un modèle selon le travail plutôt que selon son nom :

- **Rapide** : le moins cher, pour les petits travaux très clairs dont le résultat peut être vérifié, comme une modification ciblée, l’extraction de faits, le tri, la mise en forme et les résumés courts.
- **Standard** : les tâches claires de taille moyenne : une modification bien précisée, des tests, une recherche sur une question définie, un brouillon à partir d’un plan.
- **Meilleur** : l’agent principal d’une session. Il détermine ce qui est demandé, planifie, dirige les sous-agents et vérifie leur travail.
- **Max** : le plus puissant, pour les problèmes les plus difficiles : bugs tenaces, démonstrations, designs avec de nombreuses contraintes.

Un agent réglé sur un niveau démarre sur le modèle de ce niveau pour le programme qu’il utilise, sauf si un modèle a été choisi pour la session ; réglé sur **Automatique** (la valeur par défaut), il utilise le modèle choisi là où il démarre : la page de démarrage, la tâche planifiée (qui peut elle-même être sur **Automatique**), ou l’agent qui lui confie du travail. Sur la page de démarrage, ce choix peut lui-même être **Automatique** : Meilleur, en passant à Max si le problème s’avère trop difficile (voir [Niveaux : un modèle pour chaque type de travail](/guide/agents-models#tiers-a-model-for-each-kind-of-job)).

[Paramètres → Agents → Modèles → Niveaux](/settings?s=models&find=Tiers) indique ce que signifie chaque niveau, dans un tableau avec une colonne par programme : pour **Claude Code**, un modèle (Haiku, Sonnet, Opus et le tout récent Fable pour commencer) et un effort ; pour **Codex**, un modèle et un effort (Luna, Terra, Sol et Astra pour commencer ; avec une formule qui n’en comprend pas un, le plus proche qu’elle propose, avec plus d’effort pour le niveau supérieur quand deux partagent un modèle) ; pour **Custom**, l’un de vos modèles Custom : un niveau que vous ne touchez pas prend le modèle le plus récent de son type parmi ceux dont dispose Custom (voir [Niveaux : un modèle pour chaque type de travail](/guide/agents-models#tiers-a-model-for-each-kind-of-job)), et avec seulement des modèles petits ou locaux, il reste vide, ce qui conserve le modèle choisi par la session. Un niveau que vous ne touchez pas suit le modèle le plus récent de ce type pour son programme. **Revenir aux valeurs par défaut** les remet en place.

**Sous-agents qu’il démarre, jamais au-dessus de** plafonne les niveaux des sous-agents Hydor qu’un agent démarre : si un niveau plus élevé est demandé, le sous-agent reçoit celui-ci. Un sous-agent ne réfléchit jamais non plus avec un niveau supérieur à celui de son responsable. Un modèle nommé explicitement est utilisé tel quel.

**Monter d’un niveau quand une vérification échoue** (activé sauf si vous le désactivez) : un sous-agent Hydor que l’agent démarre sur un niveau, dont la réponse ne passe pas une vérification rapide (le modèle d’appoint lit son brief et sa réponse) ou qui s’arrête sur une erreur, s’exécute de nouveau un niveau au-dessus, jusqu’à Meilleur et jamais au-dessus du plus haut que l’agent autorise. Seule sa réponse au brief est vérifiée : une réponse ultérieure, à un message de son responsable ou de vous, ne relance jamais tout le travail. Le responsable est informé que cela s’est produit et pourquoi, et le nouveau sous-agent apprend pourquoi le premier n’a pas suffi. Une exécution planifiée de l’agent qui échoue sur son niveau s’exécute aussi de nouveau un niveau au-dessus, jusqu’à Meilleur. Un responsable peut aussi faire monter lui-même un sous-agent d’un niveau quand il juge le résultat insuffisant.

## Les agents qui confient du travail à d’autres agents

Un agent peut confier une partie de son travail à une nouvelle session qui s’en occupe à ses côtés : un sous-agent Hydor (voir [Recherche approfondie, seconds avis et plusieurs agents](/guide/research)). Il peut démarrer :

- **un sous-agent simple**, avec un niveau pour sa partie : Rapide pour un petit travail très clair, Standard pour une tâche claire de taille moyenne (ce que reçoit un sous-agent quand aucun n’est demandé), Meilleur pour une partie difficile qui se suffit à elle-même ;
- **l’un de vos agents**, par son nom : il travaille avec ses propres instructions, outils, connexions, mode et niveau, et sa réponse revient à l’agent qui l’a demandé.

Qui peut confier du travail à qui :

- Une session qui travaille en tant qu’agent intégré (ou sans agent) peut confier du travail à n’importe lequel de vos agents qui y travaille.
- Un de vos agents ne peut confier du travail qu’aux agents que liste son **Équipe**.
- Un agent dont **Les autres agents peuvent lui confier du travail** est désactivé n’en reçoit de personne.
- Un agent nommé ne travaille que dans ses propres projets, et jamais avec un mode d’autorisation plus libre que celui de la session qui l’a demandé.

Dans la conversation, les sous-agents Hydor démarrés par un tour s’affichent ensemble sous la forme d’une carte sous ce tour, avec une ligne pour chacun : son titre, l’agent en tant que lequel il travaille (ou « sous-agent Hydor »), son niveau, son programme et son modèle, où il en est, ce qu’il a coûté et, quand il est monté d’un niveau, depuis quel niveau et pourquoi (pointez la ligne) ; cliquez sur une ligne pour ouvrir sa conversation. Voir [Sous-agents](/guide/sessions#subagents). L’onglet **Agents** d’un projet montre quels agents du projet confient du travail à quels autres.

Un agent qui garde une conversation à lui reçoit le travail dans sa boîte de réception au lieu d’une nouvelle session, et sa réponse revient quand il s’en occupe (voir [Un agent avec sa propre conversation](#an-agent-with-a-conversation-of-its-own)).

## Un budget mensuel

La limite mensuelle d’un agent (**Budget** dans **Tous les paramètres**, ou sa phrase sur sa page) plafonne ce que ses sessions dépensent en un mois (à partir du premier du mois, à l’heure de cet ordinateur) :

- Chaque session démarrée en tant que lui reçoit un plafond de dépenses égal à ce qui reste du budget (le plus bas des deux, quand la session a son propre plafond).
- Ce que dépensent ses sous-agents simples est imputé à son budget ; le travail d’un agent nommé est imputé au budget propre de cet agent.
- Une fois le budget épuisé, aucune session ne démarre en tant que lui avant le mois suivant : une exécution planifiée indique pourquoi elle n’a pas pu démarrer, et sa carte affiche **Budget épuisé**.

Ce que dépense chaque session est calculé comme dans [Utilisation et coûts](/guide/usage). Laissez **Aucune limite** pour ne pas en fixer.

## Ce qu’un agent rend

Sans réglage particulier, un agent rend sa réponse dans la conversation. Donnez-lui des champs et des destinations dans **Résultats** (dans **Tous les paramètres**, ou depuis sa phrase « Il rend *sa réponse* »), et à la fin de chaque tâche il rend un résultat avec ces champs, vérifié avant d’être envoyé où que ce soit :

- **Champs de chaque résultat** : un nom et un type pour chacun (texte, texte long, nombre, oui ou non, date, lien, liste, ou tableau avec ses colonnes), et s’il est obligatoire. L’agent les remplit avec son outil hand_back ; un résultat qui ne convient pas lui est renvoyé avec ce qu’il faut corriger.
- **Où va chaque résultat**, en plus de la conversation :
  - **Une page conservée** : **La même page, mise à jour** (le choix proposé aux nouveaux agents) : sa première exécution crée une page portant le nom de l’agent, dans son projet quand il travaille dans un projet, et chaque exécution suivante y ajoute une nouvelle version, de sorte que vous ouvrez toujours la dernière et que les précédentes restent dans ses versions. Une page que vous renommez garde son nom. Choisissez plutôt **Une nouvelle page à chaque exécution** pour obtenir à chaque fois une page distincte, nommée d’après l’agent et le jour (les agents créés avant ce choix continuent de fonctionner ainsi).
  - **Une ligne dans une feuille de calcul** : chaque exécution ajoute une ligne à la même feuille de calcul : une colonne **Date** pour le moment de l’exécution, puis une colonne par champ, dans l’ordre des champs. Les nombres sont saisis comme des nombres, les dates comme des dates et les liens comme des liens, si bien que les totaux, les formules et les graphiques fonctionnent avec eux ; une liste ou un tableau tient dans une seule cellule sous forme de texte lisible (« lait ; œufs »). Laissez la feuille de calcul sur **Une nouvelle** et la première exécution en crée une portant le nom de l’agent, ou choisissez une des vôtres et l’onglet où les lignes iront (un onglet inexistant est ajouté). Voir [Une ligne dans une feuille de calcul](#a-row-in-a-spreadsheet).
  - **Un e-mail** : le résultat envoyé par e-mail aux personnes que vous indiquez (une adresse ou plusieurs), avec un objet (`{date}`, `{time}` et `{agent}` sont remplacés ; s’il est vide, le nom de l’agent et le jour), depuis l’un de vos comptes de messagerie connectés (**De** ; le premier si vous n’en choisissez aucun ; voir [Apps connectées, clés et outils](/guide/connections#connect-your-email)). Il s’affiche correctement dans n’importe quel programme de messagerie, chaque champ sous son nom, les tableaux sous forme de tableaux. Comme vous avez choisi vous-même les destinataires ici, il part dès que chaque résultat est prêt, sans attendre dans la Boîte d’envoi.
  - **Une notification**, avec la première ligne du résultat ;
  - **Un fichier dans le dossier où il travaille**, par exemple `reports/{date}.md` : `{date}`, `{time}` et `{agent}` sont remplacés, un nom se terminant par `.json` reçoit les champs au format JSON et tout autre nom du Markdown, et un chemin ne sort jamais du dossier ;
  - **Un webhook** : le résultat en JSON dans une requête POST vers une adresse https, signée avec une clé du Coffre si vous en indiquez une, et uniquement vers les hôtes autorisés pour cette clé (voir [Apps connectées, clés et outils](/guide/connections)).

Ce que vous saisissez dans ces champs est pris en compte quand vous quittez le champ ou appuyez sur Entrée. Les paramètres affichent la page et la feuille de calcul créées par la première exécution, avec un lien pour les ouvrir.

### Une ligne dans une feuille de calcul

Les colonnes sont repérées par leurs en-têtes dans la première ligne du tableau, de sorte que la feuille de calcul reste à vous pour l’organiser : déplacez les colonnes, changez leur mise en forme (une colonne que vous mettez en euros reste en euros) et ajoutez vos propres colonnes à côté. Une formule placée dans une colonne qui est la vôtre (un cumul, par exemple) est reportée sur chaque nouvelle ligne, comme dans le tableau d’une feuille de calcul, et un graphique qui lit les lignes existantes intègre aussi la nouvelle. Les totaux placés sous le tableau gênent l’ajout de lignes : mettez-les dans une colonne à part ou sur un autre onglet, sur des colonnes entières (`=SUM(B:B)`). Quand vous ajoutez plus tard un champ à l’agent, il obtient une nouvelle colonne à la fin, et les anciennes ne bougent pas ; un en-tête que vous renommez ne correspond plus à son champ, qui obtient alors une nouvelle colonne (donnez au champ le même nom pour les garder ensemble). La ligne de chaque exécution est une nouvelle version de la feuille de calcul, comme toute modification, de sorte que ses formules, ses graphiques et ses commentaires restent intacts.

### L’historique de ses résultats

La page de l’agent affiche **Ce qu’il a rendu** sous forme de tableau : une ligne par résultat, le plus récent en premier, avec le moment où il est arrivé, une colonne par champ, et sa destination (**Envoyé vers** : une pastille par destination, en rouge quand l’envoi n’a pas pu se faire ; pointez-en une pour voir ce qui s’est passé, cliquez sur une page conservée pour l’ouvrir). Cliquez sur une ligne pour voir le résultat complet, chaque champ en entier, avec **Ouvrir sa session**. Le tableau défile, et **Afficher les plus anciens** ramène les résultats plus anciens. Un agent conserve ses résultats pendant un an, dans la limite de 500 (un agent quotidien garde toute une année ; un agent qui s’exécute toutes les heures, environ trois semaines) ; un champ trop long pour être conservé ici le signale, et il est complet aux endroits où il a été envoyé. La page et la feuille de calcul qu’il remplit apparaissent sous forme de liens au-dessus du tableau.

## Un agent avec sa propre conversation

La plupart des agents démarrent une nouvelle session à chaque fois. Activez **Garde une seule conversation, avec une Boîte de réception** (dans **Tous les paramètres** sous **Où et quand**, ou dans la partie « quand » de sa phrase), et l’agent garde alors une seule conversation à lui, créée la première fois qu’elle est nécessaire, dans le dossier de son projet quand il travaille dans un seul projet :

- Les messages qui lui sont destinés attendent dans sa **Boîte de réception** et entrent dans sa conversation un par un, chacun quand le précédent a reçu sa réponse : ce que vous envoyez depuis sa page et ce que d’autres agents lui confient.
- Ses exécutions planifiées publient dans la même conversation, en attendant la fin du tour en cours ; chacune apparaît dans l’historique de sa planification, comme toute exécution.
- Chaque réponse retourne à celui qui l’a envoyée : un autre agent la reçoit comme un message, et vous recevez une notification pour les vôtres.
- Il se souvient de ce qui précède, comme toute conversation.
- Son budget mensuel est vérifié à chaque message qui entre.

Sur sa page, **Boîte de réception** liste les messages, chacun avec son état (**En attente de son tour**, **Avec lui maintenant**, **Répondu**, **Aucune réponse**) et sa réponse, avec un champ pour lui en envoyer un, ainsi que **Sa conversation**, qui l’ouvre.

## Démarrer une session en tant qu’agent

1. Ouvrez la [page de démarrage](/). Sous le champ de message, une rangée indique qui fait le travail : le programme, le modèle, le dossier et la pastille **Agent**, qui nomme l’agent choisi actuellement.
2. Cliquez sur **Agent**. Sous **Démarrer en tant que**, les agents intégrés viennent en premier, puis les vôtres sous **Les vôtres** : ceux qui fonctionnent partout et dans le projet choisi.
   - Sur ordinateur, les noms sont disposés en grille, deux par ligne. Pointez-en un pour voir sa ligne sous la grille : sa description et, quand il suggère un programme, « Utilise » suivi de ce programme et de son modèle.
   - Sur téléphone, le menu s’ouvre comme une feuille depuis le bas de l’écran et liste chaque agent avec sa ligne.
3. Choisissez-en un. Saisissez ensuite votre tâche, puis appuyez sur Entrée ou sur **Début**.

**Créer ou modifier des agents**, à la fin du menu, ouvre la [page Agents](/agents). **Démarrer une session** sur la page d’un agent ouvre la page de démarrage avec cet agent choisi.

Ce que fait le choix d’un agent sur la page de démarrage :

- **Programme, modèle et autorisations** : si l’agent suggère un programme, la page de démarrage passe à celui-ci, avec le modèle de son niveau quand il en utilise un, sinon le modèle de l’agent quand il en indique un. S’il a un mode d’autorisation, les **Autorisations** de la page de démarrage (sous **Options**) passent au mode correspondant de ce programme. Vous pouvez toujours modifier chacun d’eux avant de démarrer.
- **Connexions** : les comptes connectés que l’agent active sont activés pour la nouvelle session.
- **Dossier** : sauf si vous avez choisi un dossier vous-même, c’est l’agent qui décide. La plupart des agents démarrent dans **Nouveau dossier de tâche** ; Développeur, ainsi que les agents réglés sur « Le dossier de la page de démarrage », utilisent le dossier affiché. Dans un projet, choisir un agent ne vous en fait jamais sortir. Quand l’agent change le dossier, le champ affiche les choix conservés pour cet endroit, avec l’agent que vous avez choisi.

La page de démarrage conserve l’agent pour chaque endroit (chaque projet, chaque dossier et **Nouveau dossier de tâche**), sur tous les appareils que vous utilisez, avec les autres choix de cet endroit. Un endroit où vous n’avez encore rien choisi s’ouvre avec l’agent propre du projet quand il en a un, sinon Général. Un agent qui n’existe plus, ou qui ne fonctionne pas dans le projet choisi, cède aussi la place à cette valeur par défaut.

Choisir un projet dans le menu des dossiers ouvre le champ avec les choix de ce projet ; dans un projet où vous n’avez encore rien choisi, cela inclut l’agent avec lequel le projet démarre ses sessions, quand il en a un (voir [Projets](/guide/projects)).

## Changer d’agent dans une session

Le champ de message d’une session affiche l’agent avec lequel elle travaille, et vous pouvez passer à un autre à tout moment : de **Chercheur** à **Rédacteur** une fois les faits réunis, par exemple.

1. C’est la première ligne de la pastille sous le champ de message qui ouvre **Options**, et cette pastille le nomme en premier, par exemple « Chercheur · Opus 5.5 ».
2. Cliquez dessus. Sous **Passer à**, choisissez-en un autre : le même menu que sur la page de démarrage, une grille sur ordinateur et une feuille depuis le bas sur téléphone.
3. L’app indique « L’agent travaille en tant que *nom* à partir de votre prochain message ».

À partir de votre prochain message, la session travaille avec le nouvel agent, et la conversation continue :

- Le programme est informé du changement avec votre message (la conversation ne l’affiche pas).
- **Claude Code et Codex** lisent leurs instructions au démarrage ; ainsi, quand la session est libre, son programme redémarre avant votre message, avec les instructions et les limites du nouvel agent ; ce message prend un peu plus de temps. Au milieu d’un tour, ou pendant qu’elle travaille vers un objectif ou qu’elle a du travail en arrière-plan, elle reçoit à la place les nouvelles instructions avec votre message, et redémarre à un message ultérieur, une fois libre.
- **Custom** lit ses instructions avant chaque tour. Les autres agents (Gemini CLI, OpenCode…) reçoivent les instructions du nouvel agent avec votre message.
- Les comptes connectés que le nouvel agent active sont activés dans la session, à la place de ceux du précédent ; ce que vous avez activé ou désactivé vous-même pour la session reste tel quel. S’il a un mode d’autorisation, la session passe au mode correspondant, et à son modèle quand il suggère le programme de la session elle-même. Le programme lui-même reste le même : pour déplacer la conversation vers un autre, voir [Continuer dans un autre agent](/guide/sessions#continue-in-another-agent).

Une session démarrée sans agent (dans VS Code ou un terminal, ou avant l’arrivée des agents dans l’app) affiche **Aucun agent** à cet endroit : choisissez-en un pour lui en donner un. Le menu de la session (⋯) → **Paramètres de la session** → **Agent** le nomme aussi ; un clic dessus ouvre la page de l’agent.

## Retrouver les sessions d’un agent

Une session démarrée avec un agent autre que l’agent habituel l’indique dans la barre latérale : la deuxième ligne de son entrée commence par l’icône et le nom de l’agent (« Planificateur · web-agent · 5 j », ou « Chercheur · En cours · 2 min 10 s » pendant qu’il travaille). L’agent habituel est l’agent propre du projet pour une session dans un projet qui en a un (**Ses sessions démarrent comme**, dans les détails du projet), et Général pour toutes les autres sessions. Les sessions démarrées en dehors de Hydor et celles d’un agent supprimé depuis ne sont pas nommées non plus. Le filtre et la recherche se basent sur l’agent avec lequel chaque session a réellement démarré, y compris l’agent habituel. Pour ne voir que les sessions d’un agent :

- Cliquez sur le bouton de filtre en haut de la barre latérale (**Filtrer et regrouper les sessions**) et choisissez l’agent sous **Agent**. La liste présente les agents avec lesquels vos sessions ont démarré, les plus utilisés en premier (jusqu’à huit), chacun avec son nombre de sessions ; **Tous les agents** réaffiche toutes les sessions. La section apparaît dès qu’une session a été démarrée avec un agent.
- Ou ouvrez la page de l’agent et cliquez sur **Afficher les 23 dans la barre latérale** à côté de **Sessions récentes** (le bouton indique **Les afficher dans la barre latérale** quand l’agent a huit sessions ou moins). Cela ouvre la page de démarrage avec la barre latérale n’affichant que les sessions de cet agent, les autres filtres étant effacés ; sur téléphone, le menu s’ouvre.
- Ou saisissez le nom de l’agent dans le champ de recherche (Ctrl+K) : « Tuteur » trouve les sessions démarrées avec Tuteur. Général est exclu de cette recherche, puisque la plupart des sessions le sont. L’aperçu d’une session y indique son **Agent**.

Tant qu’un filtre est actif, une pastille sous **Nouvelle session** le nomme, avec son icône : cliquez sur sa croix × pour réafficher toutes les sessions. Le filtre par agent se combine avec les autres (**Fonctionne avec** et **Projet**), par exemple les sessions d’un agent dans un projet. Si l’agent est supprimé, la liste réaffiche toutes les sessions. Voir [La barre latérale](/guide/start#the-sidebar).

## Dupliquer ou supprimer un agent

Sur la page d’un agent :

- **Dupliquer** (sur tous les agents) : ouvre la fenêtre à **Configuration** comme un nouvel agent avec tout rempli et le nom « *nom* (copie) ». Modifiez ce que vous voulez et cliquez sur **Créer l’agent** ; sa page s’ouvre. C’est ainsi que vous créez votre propre version d’un agent intégré.
- **Supprimer** (uniquement les vôtres) : demande d’abord « Supprimer *nom* ? ». Les sessions démarrées avec lui continuent sans ses instructions ; ses planifications sont supprimées avec lui, puisqu’elles avaient été écrites pour lui ; les agents qui pouvaient lui confier du travail ne le listent plus. Les projets qui démarraient leurs sessions avec lui en sont débarrassés : leurs sessions démarrent de nouveau comme Général (ou l’agent que vous choisissez). Son historique de résultats disparaît avec lui ; les pages et les feuilles de calcul qu’il a remplies restent là où elles étaient conservées.

Le champ de recherche (Ctrl+K, ⌘K sur Mac) trouve aussi les agents par leur nom et leur description ; en choisir un ouvre sa page.

## Partager un agent sous forme de fichier

Un de vos agents peut voyager sous la forme d’un seul fichier, à conserver ou à donner à un collègue, qui l’installe sur son Hydor.

- **Pour en télécharger un** : ouvrez sa page, puis **Plus** (⋯) → **Télécharger comme fichier**. Les agents intégrés se téléchargent aussi, pour être installés comme agents personnels. Le fichier (`.hydor-agent`) contient ses instructions, ce qu’il peut utiliser, son niveau, son programme et son modèle, les compétences qu’il privilégie, son mode d’autorisation, son budget et ses autres paramètres, les agents auxquels il confie du travail (par leur nom), ce qu’il rend et les types d’endroits où vont ses résultats, ses planifications qui s’exécutent à heure fixe (comme suggestions) et ses exemples. Rien de personnel n’y figure : les projets dans lesquels il travaille, les comptes connectés qu’il utilise, la page et la feuille de calcul où allaient ses résultats, les destinataires de ses résultats par e-mail et le compte d’envoi, ainsi que l’adresse et la clé de son webhook sont exclus, et ses planifications qui se déclenchent sur une surveillance, un webhook ou une date restent ici. Le fichier liste en toutes lettres ce qui a été laissé de côté, pour que vous le configuriez à nouveau.
- **Pour en installer un** : sur la [page Agents](/agents), ouvrez **Nouveau** et choisissez **Installer un agent depuis un fichier** (sur téléphone, appuyez sur **Installer**), puis **Choisir un fichier** et sélectionnez un fichier `.hydor-agent` (ou déposez-le à cet endroit). Avant que quoi que ce soit soit enregistré, une fiche le présente : son nom et sa ligne de description, **Ce qu’il apporte** (ses instructions, ce qu’il peut utiliser, son niveau, ce qu’il rend, ses exemples, ses planifications suggérées), **Ce qu’il attend de vous** (ce qui a été laissé de côté, et les agents auxquels il confie du travail que vous n’avez pas) et **Ses instructions** à lire. Un de vos agents portant le même nom n’est pas modifié : le nouveau s’installe à côté sous le nom « Nom (2) », sauf si vous choisissez **Remplacer le mien**, ce qui transforme le vôtre en cet agent, sous forme de nouvelle version (l’ancien état reste dans ses **Versions**, et vos exemples restent, après ceux du fichier). **Ajouter les planifications suggérées, en pause** ajoute ses planifications, désactivées jusqu’à ce que vous les activiez. Appuyez sur **Installer**, et sa page s’ouvre.

Certaines choses changent à l’arrivée, et la fiche vous le dit : un agent qui ne demandait jamais avant d’agir (**Accès complet**) démarre avec **Accepter les modifications**, un programme non configuré ici cède la place à celui choisi sur la page de démarrage, et un fichier issu d’un Hydor plus récent apporte ce que celui-ci sait lire (mettez Hydor à jour pour le reste). Un fichier qui n’est pas un fichier d’agent, ou qui est endommagé, est refusé avec l’indication du problème ; le fichier d’une app s’installe plutôt sur la [page Apps](/guide/apps#share-an-app-as-a-file), et les fichiers d’agent de Claude Code s’importent avec **Importer** (ci-dessous).

## Importer les fichiers d’agent de Claude Code

Claude Code peut conserver ses propres agents sous forme de fichiers Markdown dans un dossier `.claude/agents` : un court en-tête avec le nom, la description, le modèle et les outils de l’agent, puis ses instructions en dessous. L’app transforme ces fichiers en agents à vous, de sorte que tous les programmes d’ici puissent fonctionner ainsi.

1. Ouvrez la [page Agents](/agents), puis **Nouveau** et **Importer des fichiers d’agent Claude Code** (sur téléphone, cliquez sur **Importer** en haut).
2. **Importer des agents Claude Code** liste les fichiers d’agent trouvés : les vôtres dans `~/.claude/agents` (marqués **Les vôtres**) et ceux du dossier `.claude/agents` du dossier ouvert dans [Fichiers](/files) (marqués **Ce dossier**). Pour voir les agents propres à un projet, ouvrez d’abord ce projet dans Fichiers.
3. Cliquez sur **Importer** à côté d’un fichier. Son agent est prêt sur la page Agents et dans le menu des agents de la page de démarrage.
4. Pour un fichier situé ailleurs, cliquez sur **Choisir un fichier** (« Ou un fichier d’agent depuis cet appareil ») et sélectionnez le fichier `.md`.

Le fichier doit être au format Markdown (`.md`) et peser 256 Ko au maximum. Voici ce que l’app en retire :

| Dans le fichier d’agent | Dans l’agent |
|---|---|
| `name` (ou le nom du fichier s’il n’y en a pas) | **Nom** : « code-reviewer » devient « Code reviewer » |
| `description` | **Une ligne à son sujet** : sa première phrase, sans les exemples |
| `model` | **Fonctionne avec** : Claude Code avec ce modèle (« inherit » conserve celui de la page de démarrage) |
| `tools` | **Ce qu’il peut utiliser**, par type ; un fichier sans ligne tools peut tout utiliser |
| `permissionMode` | **Mode d’autorisation** : default → Demander, acceptEdits → Accepter les modifications, bypassPermissions → Accès complet, plan → Planifier |
| `skills` | **Compétences à privilégier** |
| Le texte sous l’en-tête | **Instructions** |

L’icône est choisie d’après le nom et la description de l’agent (un télescope pour la recherche, un stylo pour la rédaction, du code pour la relecture et les tests, etc.). Les agents importés travaillent dans le dossier de la page de démarrage, comme les agents de Claude Code travaillent dans un projet.

Un fichier déjà importé affiche **Mettre à jour** au lieu de **Importer** dans la liste. **Mettre à jour** relit le fichier dans le même agent : ses champs redeviennent ceux du fichier, et seule l’icône que vous avez choisie reste. Choisir un fichier depuis votre appareil crée toujours un nouvel agent.

## Dossiers de tâche : où travaille une tâche sans dossier

Beaucoup de tâches n’appartiennent à aucun dossier : un plan de voyage, une lettre, une question. Pour celles-ci, la pastille de dossier de la page de démarrage affiche **Nouveau dossier de tâche**, et quand vous appuyez sur **Début**, l’app crée un dossier neuf pour la session, nommé d’après le jour et quelques mots de votre message, par exemple `~/Hydor/2026-10-31-plan-trip-lisbon`. L’agent y enregistre son travail, et vous le retrouvez dans [Fichiers](/files).

Comment le nom est formé :

- La date, dans votre fuseau horaire.
- Jusqu’à cinq mots de votre message, sans les petits mots (un, le, s’il vous plaît, aide, moi…), les liens ni une éventuelle `/commande` en tête, sans accents, avec 40 caractères au maximum. S’il ne reste aucun mot, le nom est `task`.
- Si ce nom est déjà pris, `-2`, `-3`, etc. sont ajoutés.

### Choisir un dossier de tâche ou un dossier à vous

Ouvrez la pastille de dossier de la page de démarrage :

- **Nouveau dossier de tâche** (« un dossier neuf dans ~/Hydor ») crée un dossier neuf pour chaque session.
- Choisissez un projet, un dossier utilisé récemment, ou n’importe quel dossier trouvé avec **Parcourir** ou en saisissant son nom ou son chemin, et la session travaille alors dans ce dossier (voir [Projets](/guide/projects) et [Sessions](/guide/sessions)).

Tant que vous n’avez pas choisi, c’est l’agent qui décide : les agents intégrés autres que Développeur, et les vôtres réglés sur « Un nouveau dossier de tâche », utilisent un dossier de tâche ; Développeur et les agents réglés sur « Le dossier de la page de démarrage » utilisent le dossier affiché, et un agent qui travaille dans un seul projet utilise ce projet. La page de démarrage retient votre choix. Choisir un autre agent lui rend la décision, sauf si vous avez choisi un dossier depuis l’ouverture de la page ou si vous êtes dans un projet. Quand il change le dossier, la zone de saisie affiche les choix conservés pour cet endroit, avec l’agent que vous avez choisi.

Les dossiers de tâche n’encombrent pas le menu des dossiers : les dossiers récemment utilisés qu’il liste les excluent. Les sessions démarrées à la voix en mode Mains libres obtiennent aussi un dossier de tâche, sauf si la page de démarrage a été réglée en dernier sur un dossier ou un projet (voir [Documents, images, vidéos et voix](/guide/documents-voice)).

### Déplacer les dossiers de tâche

1. Dans [Paramètres → Capacités → Vos agents](/settings?s=assistants&find=Task%20folders), repérez **Dossiers de tâche** dans le groupe **Tâches** (son (i) explique qu’une session démarrée sans dossier en reçoit un nouveau ici, nommé d’après le jour et la tâche, et que Développeur travaille plutôt dans le dossier que vous choisissez).
2. Cliquez sur le nom du dossier. Sous **Dossier de travail**, saisissez un chemin (des dossiers sont suggérés pendant la saisie, ainsi que ceux utilisés récemment) et cliquez sur **Utiliser ce dossier**. Donnez un chemin complet, ou commençant par `~` pour votre dossier personnel.

Les nouveaux dossiers de tâche iront désormais à cet endroit ; les dossiers déjà créés restent où ils sont. **Retour à ~/Hydor** apparaît une fois le réglage modifié, pour revenir à la valeur par défaut. La ligne en dessous montre à quoi ressemblent les nouveaux. Les nouveaux projets qui reçoivent un dossier à eux le reçoivent aussi ici, dans un dossier **Projets** à l’intérieur (voir [Projets](/guide/projects)).

## Nettoyer après une tâche

[Paramètres → Capacités → Vos agents](/settings?s=assistants&find=Clean%20up%20after%20a%20task) propose un interrupteur dans le groupe **Tâches** : **Nettoyer après une tâche** (son (i) explique ce que l’agent supprime). Il est activé tant que vous ne le désactivez pas, et il s’applique à chaque session, quel que soit l’agent avec lequel elle travaille.

Quand il est activé, la dernière étape d’un agent dans une tâche consiste à supprimer ce qu’il a créé en chemin et dont il n’a plus besoin :

- les fichiers brouillons et de test, les dossiers et données temporaires, les sorties de débogage et les captures d’écran ;
- les branches git, les worktrees (copies supplémentaires d’un dépôt, chacune sur sa propre branche) et les stashes qu’il a créés, fusionnés ou abandonnés ;
- les processus, serveurs ou conteneurs qu’il a lancés, sauf si vous voulez les garder en fonctionnement.

Il conserve ce que vous avez demandé et le travail que quelqu’un doit encore relire ou fusionner (comme une branche contenant des commits non fusionnés), ne supprime jamais rien qu’il n’a pas créé, et vous demande d’abord confirmation quand quelque chose est volumineux ou incertain (un gros téléchargement, tout ce qui est partagé). Il nomme chaque élément qu’il supprime au lieu de supprimer selon un motif, et indique en une ligne ce qu’il a supprimé et ce qu’il a laissé. La compétence de nettoyage fournie avec l’app détaille la méthode (voir [Compétences](/guide/skills)).

Désactivez-le, et les agents laissent en place ce qu’ils ont créé. Dans les deux cas, les agents prennent en compte le changement dès leur prochaine session (Custom dès son prochain message).

## Où interviennent encore les agents

- **Projets** : un projet peut indiquer avec quel agent démarrent ses sessions (« Ses sessions démarrent avec ») ; choisir le projet sur la page de démarrage choisit cet agent. Son onglet **Agents** montre les agents qui y travaillent. Voir [Projets](/guide/projects).
- **Apps** : une app peut désigner un **Agent**, et ses exécutions démarrent avec lui (celles lancées depuis une page publique non) ; les étapes d’agent d’une app peuvent chacune en désigner un. Voir [Apps](/guide/apps).
- **Tâches planifiées** : une tâche s’exécute avec l’agent que désigne son option **Agent** ; une tâche qu’un agent met en place pour vous depuis une session s’exécute comme cette session. Voir [Tâches planifiées](/guide/tasks).
- **Voix en mode Mains libres** : les sessions que vous démarrez à la voix démarrent à l’endroit choisi en dernier sur la page de démarrage, avec ses choix, avec l’agent choisi là (sinon l’agent propre au projet, sinon Général).

## Demander à un agent

- « Crée-moi un agent nommé Paper scout qui trouve chaque jour de semaine à 8 h les nouveaux articles sur mes sujets de recherche et garde les cinq meilleurs dans une page, en réfléchissant avec Rapide. »
- « Crée un agent nommé Comptable qui tient mes comptes du foyer dans une feuille de calcul, ne peut pas exécuter de commandes et ne peut pas dépenser plus de 5 $ par mois. »
- « Crée un agent qui vérifie toutes les heures si Python 3.15 est sorti, me prévient quand c’est le cas, puis s’arrête. »
- « La planification du samedi de mon Paper scout ne sert plus : retire-la. » « Supprime mon agent Comptable. »
- « Permets à mon agent Release manager de confier du travail à Traducteur et Testeur. »
- « Fais en sorte que mon agent Traducteur travaille uniquement dans le projet Hydor. »
- « Fais en sorte que Rapide signifie Haiku pour Claude Code et mon modèle Qwen local pour Custom. »
- « Désactive Max pour les problèmes difficiles, afin que les sessions en Automatique restent sur Meilleur. »
- « Importe mon fichier d’agent Claude Code ~/.claude/agents/code-reviewer.md comme agent. »
- « Quels agents ai-je, avec quoi réfléchit chacun, et combien ont-ils dépensé ce mois-ci ? »
- « Fais en sorte que mon Paper scout rende une liste d’articles, chacun avec un titre, un lien et pourquoi il compte, sous forme de page conservée et de notification. »
- « Fais en sorte que mon Comptable ajoute chaque vendredi à ma feuille de calcul Budget du foyer une ligne avec les dépenses de la semaine et leurs principaux postes. »
- « Fais envoyer par mon agent Rapport hebdomadaire son rapport par e-mail à maria@example.com chaque lundi, avec l’objet Rapport hebdomadaire {date}. »
- « Qu’a rendu mon Comptable ce mois-ci, et à combien cela s’élève-t-il ? »
- « Lesquels de mes agents s’exécutent seuls demain matin, et à quelle heure ? »
- « Permets à mon Docs keeper de garder une conversation à lui, et envoie-lui : mets à jour le guide pour la nouvelle page Agents. »
- « Passe ma session sur le voyage à Lisbonne à l’agent Planificateur. »
- « Qu’est-ce qui a changé dans mon Paper scout cette semaine ? Rétablis la version d’avant lundi si ses exemples étaient meilleurs à ce moment-là. »
- « Donne deux exemples à mon agent Rapport hebdomadaire, un pour une semaine calme et un pour une semaine chargée, avec ce qu’un bon rapport doit dire, et essaie-les. »
- « Télécharge mon agent Comptable comme fichier, et dis-moi ce que je devrai configurer à nouveau sur mon portable. »
- « Mets désormais les nouveaux dossiers de tâche dans ~/Documents/Tasks. »
