# Ingénierie : CI, tickets, dépendances et incidents

Des agents peuvent veiller sur une base de code pendant que vous faites autre chose : examiner l’échec d’une exécution CI, trier chaque nouveau ticket, tenir les dépendances à jour et réagir à une alerte, chacun sous la forme d’une tâche planifiée créée à partir d’un court formulaire. La fonction **Trouver ce qui a cassé** de Git demande à un agent de retrouver le commit qui a cassé quelque chose, et une **Campagne** découpe un grand changement en parties que plusieurs agents réalisent en même temps, chacun dans son propre worktree.

![Paramètres → Tâches planifiées : les exemples d’ingénierie](images/engineering.webp)

## Fonctionnement des tâches d’ingénierie

Les quatre tâches sont des exemples dans [Paramètres → Tâches planifiées](/settings?s=tasks) (**Paramètres → Agents → Tâches planifiées**), sous **Partir d’un exemple** (cliquez sur **Afficher tous les exemples** pour les voir), à côté de [**Examiner les nouvelles pull requests**](/settings?s=tasks&find=Review%20new%20pull%20requests). Chacune ouvre un court formulaire : remplissez-le, choisissez qui l’exécute sous **Lancée par**, puis sélectionnez **Créer la tâche** (ou **Plus d’options…** pour le formulaire complet d’une tâche). Voir [Tâches planifiées](/guide/tasks) pour tout ce qu’une tâche peut faire.

Ce qu’elles ont en commun :

- **Un dossier de dépôt** : la copie du dépôt sur cet ordinateur à partir de laquelle l’agent travaille. Il la lit, et fait tout changement dans un nouveau worktree (une copie séparée sur sa propre branche), si bien que votre propre copie et sa branche restent telles quelles.
- **Une compétence chacune** : l’agent suit une méthode écrite, une compétence intégrée que vous pouvez lire et modifier dans [Paramètres → Compétences](/settings?s=skills) : **ci-doctor**, **issue-triage**, **dependency-upgrades** et **incident-response**.
- **Ce qu’elle peut faire** : des interrupteurs dans le formulaire, comme **Ouvrir une pull request en brouillon avec un correctif**. Pour tout ce que vous laissez désactivé, l’agent vous dit ce qu’il aurait fait à la place. Aucune ne pousse jamais sur la branche par défaut, ne fait de push forcé ni ne fusionne.
- **Webhooks** : Docteur CI, Tri des tickets et le répondant aux incidents démarrent quand un service appelle l’adresse propre à la tâche. Une fois la tâche créée, sa ligne dans la liste affiche l’adresse avec un bouton de copie et, en dessous, l’endroit où la coller dans ce service (« Dans le dépôt sur GitHub : Settings → Webhooks → Add webhook… »). Le formulaire dit la même chose avant la création. Un filtre sur chacune ne laisse démarrer une exécution que ce pour quoi elle est faite (une exécution échouée, un ticket qui vient d’être ouvert, une alerte qui n’est pas une notification de « résolution ») ; les autres reçoivent une réponse et ne démarrent rien. **Exécuter maintenant** dans le menu d’une tâche (ou **Exécution de test** dans son formulaire) fonctionne sans appel, pour l’essayer : Docteur CI prend la dernière exécution échouée, Tri des tickets les tickets du dernier jour qui n’ont pas d’étiquette, et le répondant aux incidents vérifie l’état du service.
- **Accès** : l’agent travaille avec GitHub par la commande gh quand elle est connectée sur cet ordinateur, et sinon par une clé de votre coffre ou une app connectée (GitHub, GitLab, Buildkite, CircleCI, Sentry, Grafana, Datadog, Better Stack : voir [Apps connectées, clés et outils](/guide/connections)). Quand il lui faut une clé qu’il n’a pas, il vous la demande.
- **Chaque exécution** rend compte de son déroulement en une ligne, dans sa notification et dans l’historique de la tâche, et garde des notes pour la suivante (les tests instables qu’elle a vus, les mises à niveau mises de côté, les incidents jusqu’ici). Une exécution qui a besoin de votre approbation l’attend, dans sa session et dans la [Boîte de réception](/guide/inbox). Il se peut que personne ne regarde quand une exécution démarre : pour ces tâches, choisissez donc, sous **Plus d’options…** → **Autorisations**, un mode qui laisse passer les étapes courantes et demande pour les étapes risquées (**Automatique**), sinon l’exécution vous attend dès sa première commande.

## Docteur CI

Une exécution échouée sur GitHub Actions, GitLab CI, Buildkite ou CircleCI réveille un agent. Il lit les journaux des jobs échoués et trouve la première vraie erreur, examine les exécutions récentes du même job pour distinguer un échec instable d’un échec réel, le reproduit dans un worktree, puis agit selon ce que vous avez autorisé et résume le tout en quelques lignes.

### Mise en place

1. Dans [Paramètres → Tâches planifiées](/settings?s=tasks), sélectionnez [**Docteur CI**](/settings?s=tasks&find=CI%20doctor) dans **Partir d’un exemple** (**Afficher tous les exemples**).
2. Choisissez le **Dossier du dépôt** et la **CI** : **GitHub Actions**, **GitLab CI**, **Buildkite** ou **CircleCI**.
3. Choisissez ce qu’il peut faire :
   - **Relancer les jobs qui semblent instables** (activé au départ) : une seule fois, quand les indices montrent que c’est l’exécution qui a échoué plutôt que le code (un délai dépassé, un téléchargement raté, un test connu pour passer ou échouer au hasard).
   - **Ouvrir une pull request en brouillon avec un correctif** (activé) : pour un échec réel, le plus petit correctif possible sur sa propre branche, avec le test en échec exécuté, sous forme de brouillon à examiner.
   - **Commenter le commit ou la pull request** (désactivé) : un court commentaire avec la cause et le correctif ou la prochaine étape.
4. Sélectionnez **Créer la tâche**. La tâche porte le nom de sa CI, par exemple « Docteur CI · GitHub Actions ».
5. Copiez son adresse depuis sa ligne vers la CI, comme l’indique la ligne sous l’adresse :
   - **GitHub Actions** : **Settings → Webhooks → Add webhook** du dépôt ; l’adresse comme Payload URL, application/json, et seulement **Workflow runs** sous les événements individuels.
   - **GitLab CI** : **Settings → Webhooks → Add new webhook** du projet, avec seulement **Pipeline events**.
   - **Buildkite** : **Settings → Notification Services**, **Add** sur Webhook, avec l’événement build.finished.
   - **CircleCI** : **Project Settings → Webhooks → Add Webhook** du projet, avec **Workflow Completed**.

Seule une exécution échouée la démarre (sur GitHub, une exécution de workflow dont la conclusion est failure ; sur GitLab, Buildkite et CircleCI, une dont le statut est failed). Chaque exécution reçoit l’essentiel de l’exécution (le workflow, son adresse, la branche, le commit et son message, la pull request), et son rapport d’une ligne indique instable ou réel, la cause et ce qu’elle a fait : « Instable : un délai dépassé du registre dans npm ci ; relancé », ou « Réel : l’analyseur de dates plante les années bissextiles ; pull request en brouillon n° 42 ».

## Tri des tickets

Chaque ticket ouvert sur GitHub (ou Gitea) réveille un agent qui le trie : il lit le ticket et le guide de contribution du projet, l’étiquette avec des étiquettes que le dépôt possède, cherche le même problème parmi les tickets ouverts et récemment fermés sous plusieurs formulations (en disant à quel point il en est sûr), demande à l’auteur du signalement, dans un commentaire aimable, ce qui manque (la version, les étapes, les journaux) et, quand le correctif est petit et clair, l’essaie dans un worktree et ouvre une pull request en brouillon qui renvoie au ticket.

1. Sélectionnez [**Tri des tickets**](/settings?s=tasks&find=Issue%20triage) dans **Partir d’un exemple** (**Afficher tous les exemples**).
2. Choisissez le **Dossier du dépôt**, et ce qu’il peut faire : **L’étiqueter**, **Le commenter** et **Essayer les plus simples en pull requests brouillons** (tout est activé au départ).
3. Sélectionnez **Créer la tâche**, puis copiez son adresse dans **Settings → Webhooks → Add webhook** du dépôt sur GitHub, avec seulement **Issues** sous les événements individuels (sur Gitea : Issues events).

Seul un ticket qui vient d’être ouvert démarre une exécution. L’agent ne ferme, ne verrouille, ne transfère ni ne supprime jamais un ticket (il étiquette un doublon certain et laisse un mainteneur le fermer), n’assigne jamais personne, et s’en tient à ce que le projet autorise : un projet qui refuse les pull requests faites avec l’IA n’en reçoit aucune. Un problème de sécurité signalé en public n’y est pas discuté : l’agent oriente l’auteur vers la voie de signalement privée du projet et vous prévient aussitôt.

## Jardinier de dépendances

Une fois par semaine, l’agent s’occupe des dépendances du dépôt (npm, pnpm, yarn, pip, uv, poetry, cargo et go) : ce qui est périmé et ce qui fait l’objet d’avis de sécurité. Les correctifs de sécurité passent en premier ; viennent ensuite les mises à niveau de correctif, mineures et majeures, chaque groupe à part et les majeures jamais mélangées avec le reste. Chaque groupe est réalisé dans son propre worktree, avec les notes de version lues pour repérer les changements incompatibles et les tests exécutés. Une mise à niveau qui fait échouer les tests est mise de côté, avec la raison dans les notes de la tâche pour qu’elle ne soit pas reproposée chaque semaine.

1. Sélectionnez [**Jardinier de dépendances**](/settings?s=tasks&find=Dependency%20gardener) dans **Partir d’un exemple** (**Afficher tous les exemples**).
2. Choisissez le **Dossier du dépôt**, le jour sous **Activé** (lundi au départ) et l’heure sous **À** (09:00).
3. **Pull requests ouvertes** (activé) : une pull request en brouillon par groupe dont les tests passent, avec les points marquants, les avis qu’elle corrige et ce qu’il faut surveiller. Désactivé, il ne pousse rien et rend compte de chaque groupe avec les commandes qui l’appliquent.
4. Sélectionnez **Créer la tâche**.

Une semaine où tout est à jour et où aucun avis n’est ouvert reste silencieuse.

## Premier intervenant en cas d’incident

Une alerte de Sentry, Grafana, Datadog, Better Stack ou d’un autre service réveille un agent. En quelques minutes, il vous dit ce qui ne va pas, depuis quand et avec quelle gravité, par une notification. Puis il place sur une même chronologie les erreurs, les journaux, les déploiements récents et les changements depuis la dernière bonne version, trouve la cause probable avec ses preuves, et propose l’étape la plus sûre, le plus souvent un retour en arrière. Il ne revient jamais en arrière, ne redémarre ni ne déploie rien sans votre accord : il le demande sur une carte dans la session de l’exécution, et quand personne ne répond à temps, l’exécution indique qu’elle a besoin de vous, avec la commande en attente. Une fois l’incident terminé, demandez-lui le postmortem dans la même session.

1. Sélectionnez [**Premier intervenant en cas d’incident**](/settings?s=tasks&find=Incident%20first%20responder) dans **Partir d’un exemple** (**Afficher tous les exemples**).
2. Choisissez **Le dossier du dépôt du service** et d’où **Les alertes viennent de** : **Sentry**, **Grafana**, **Datadog**, **Better Stack** ou **Un autre service**.
3. **Comment revenir en arrière** (facultatif) : une commande que l’agent peut exécuter une fois que vous avez dit oui, comme `kubectl rollout undo deployment/web`. Laissé vide, il vous demande comment faire.
4. Sélectionnez **Créer la tâche**, puis dirigez les alertes du service vers son adresse, comme l’indique sa ligne :
   - **Sentry** : **Settings → Developer Settings → Create New Integration → Internal Integration**, l’adresse comme Webhook URL et **Alert Rule Action** activé ; ajoutez ensuite l’intégration aux actions de vos règles d’alerte.
   - **Grafana** : **Alerting → Contact points → Add contact point**, l’intégration Webhook avec l’adresse ; envoyez ensuite les alertes vers elle depuis une notification policy.
   - **Datadog** : **Integrations → Webhooks → New**, avec l’adresse, et `"transition": "$ALERT_TRANSITION"` ajouté à sa charge utile ; mentionnez ensuite `@webhook-` et son nom dans les messages de vos moniteurs.
   - **Better Stack** : **Incidents → Integrations → Exporting data → Outgoing webhooks → Configure**, puis **Add** sur Incident, avec seulement les événements de création ou de réouverture d’un incident.

Les notifications indiquant qu’un problème est résolu ou rétabli ne démarrent rien (celles de Sentry, de Grafana et de Datadog, par le filtre) ; celles qui passent malgré tout sont consignées dans les notes de la tâche et restent silencieuses. Avec une app connectée pour le service d’alerte, l’agent lit les erreurs et les journaux par son intermédiaire.

## Trouver ce qui a cassé

Quand quelque chose fonctionnait dans une version antérieure et est cassé maintenant, un agent peut retrouver le commit qui l’a cassé : il essaie les commits intermédiaires avec git bisect, en les divisant par deux à chaque fois (mille commits demandent environ dix essais), désigne le premier mauvais, et explique ce qui, dans son changement, a tout cassé et pourquoi.

1. Sur la [page Git](/git), ouvrez le dépôt et son **Historique**.
2. Ouvrez le commit où cela fonctionnait pour la dernière fois et choisissez **Trouver ce qui a cassé** dans son menu ⋯, ou sélectionnez le bouton **Trouver ce qui a cassé** à côté de **Rechercher un commit** en haut de la liste.
3. Dans le formulaire **Trouver ce qui a cassé** :
   - **Fonctionnait à** : le commit à partir duquel vous l’avez ouvert (par son tag s’il en a un), sinon le dernier tag. Saisissez n’importe quel tag, branche ou commit ; les derniers tags sont suggérés pendant la saisie. En dessous s’affiche le commit correspondant, avec son message et son ancienneté, ou « Aucun commit ni tag de ce nom ».
   - **Cassé à** : `HEAD` au départ (le dernier commit de la branche sur laquelle vous êtes).
   - **Ce qui est cassé** : dans vos propres mots, aussi précisément que possible (« L’export d’un document avec des images en PDF échoue avec “image trop grande” »).
   - **Comment vérifier (facultatif)** : une commande qui échoue tant que c’est cassé, comme `npm test -- export`. Sans commande, l’agent écrit une vérification de son cru.
   - **Lancée par** : l’agent, avec le modèle et les autorisations que vous avez utilisés en dernier avec lui sur la page de démarrage.
4. Sélectionnez **Début**. Le bouton reste inactif tant que les deux extrémités ne sont pas des commits distincts et que **Ce qui est cassé** n’est pas rempli.

Une nouvelle session s’ouvre aussitôt, dans un nouveau worktree du dépôt, si bien que votre propre copie reste telle quelle. Son agent suit la compétence **git-bisect** : il écrit un petit script de vérification (il se termine par 0 quand cela fonctionne, 1 quand c’est cassé, 125 pour un commit qu’il ne peut pas tester, par exemple un commit qui ne compile pas), l’essaie d’abord aux deux extrémités, exécute `git bisect run` avec lui, puis montre le premier mauvais commit et la partie de son changement qui a tout cassé, le prouve en annulant uniquement ce commit, et suggère un correctif. Il ne modifie rien sur vos branches. Quand vous avez terminé, le menu de la session → **Clore : terminé pour le moment** propose de retirer son worktree (voir [Travailler dans un worktree](/guide/sessions#work-in-a-worktree)).

La zone de recherche (Ctrl+K) trouve aussi **Trouver ce qui a cassé** : elle ouvre le formulaire pour le dépôt que vous avez utilisé en dernier.

## Campagnes : un grand changement en plusieurs parties

Une campagne réalise un grand changement, surtout mécanique, dans une base de code (faire passer tous les paquets à un nouveau logger, mettre à jour un framework, renommer une API partout) avec plusieurs agents à la fois. Un agent responsable découpe le changement en parties (paquets, modules, dossiers), et chaque membre réalise une partie dans son propre worktree, avec ses tests. C’est le second type d’[Essaim](/guide/research#set-a-swarm-on-a-hard-problem) : un seul réglage, **Taille de l’essaim**, indique combien d’agents travaillent en même temps pour les deux.

### En lancer une

1. Sur la page de démarrage, choisissez le dossier du dépôt. Une campagne nécessite un dépôt git.
2. Ouvrez **Options**, choisissez **Essaim**, puis **Campagne** (« Un grand changement en parties, chacune dans un worktree »).
3. Décrivez le changement et la façon de le vérifier (« Faire passer tous les paquets de Jest à Vitest ; npm test doit réussir dans chacun »), puis appuyez sur **Début**.

La ligne Essaim affiche « Campagne · 5 à la fois » (la taille de votre essaim). Comme pour un essaim, ce choix n’est pas conservé pour votre prochaine session, et une recherche approfondie et une campagne ne peuvent pas être actives en même temps. Un plafond de dépenses défini dans le même menu couvre le responsable et chaque membre. L’éditeur d’une tâche planifiée propose le même choix.

### Fonctionnement

1. Le responsable analyse le changement et la façon de le vérifier, puis le découpe en parties qui peuvent chacune être réalisées et testées séparément. Il publie le plan sur le tableau de bord : les parties, par nom, dans l’ordre où les traiter (le code partagé d’abord).
2. Il démarre un membre pour chaque partie, au maximum la taille de votre essaim à la fois, le suivant dès que d’autres terminent. Chaque membre travaille sur sa propre branche, dans un nouveau worktree créé à partir de la branche sur laquelle se trouve le dossier du responsable.
3. Un membre ne modifie que sa partie, exécute ses vérifications, fait un commit sur sa branche, puis publie sa partie comme terminée (avec la branche et les vérifications) ou en échec (avec ce qui a mal tourné).
4. Une partie en échec bénéficie d’un nouvel essai, en tenant compte de ce qui a été appris. Si elle échoue de nouveau, elle reste en échec.
5. Le responsable fusionne les branches terminées dans la branche sur laquelle il travaille, une à la fois dans un ordre judicieux, en exécutant les vérifications après chacune, et retire le worktree de chaque partie fusionnée. Si vous demandez des pull requests dans votre message, il en ouvre une par partie à la place et ne fusionne rien. Il ne pousse jamais vers la branche par défaut.
6. À la fin, il indique ce qui a changé, ce qui a échoué et pourquoi, et ce qu’il reste à faire à la main.

Pour garder tout le changement sur une branche à part, activez aussi **Nouveau worktree** dans le menu du dossier pour le responsable : les membres créent alors leur branche à partir de celle du responsable, et les fusions s’y font.

### Suivre l’avancement : la barre et le tableau de bord

La session du responsable a une barre au-dessus de la zone de message : **Campagne** · « planifie ses parties » au début, puis « 12 parties sur 40 terminées · 2 en échec · 3 en cours », et **Tableau de bord**. La session de chaque membre a aussi une barre : « Dans la campagne de » suivi du titre du responsable, avec **Tableau de bord** et **Responsable**. Dans la barre latérale, les membres sont placés sous le responsable, regroupés sur une ligne comme « 40 membres de la campagne · 3 en cours ».

**Tableau de bord** ouvre le **Tableau de bord de la campagne** (depuis le bas de l’écran sur un téléphone) :

- **Parties** : combien sont terminées et en échec, puis chaque partie dans l’ordre du plan avec son état (**En attente**, **En cours**, **Terminé**, **Échec**, **Nouvel essai** ou **Échec 2 fois**) et le dernier message à son sujet, ou ce que fait son membre en ce moment. Cliquez sur une partie pour ouvrir la session de son membre. **Tout arrêter**, présent tant que des membres travaillent, arrête tous les membres encore en cours.
- **En cours** : les membres au travail, au maximum la taille de votre essaim.
- **Publications**, à côté des parties sur un grand écran : tout ce qui a été publié, le plus récent en premier, chacune avec son type (**Plan**, **Progression**, **Terminé**, **Échec**, **Résultat**, **Question**, **Note**) et la partie concernée.

Les publications adressées à tous ne réveillent pas les membres dans une campagne (un membre dont la partie est terminée le reste) ; un message adressé à un seul membre le réveille.

## Demander à un agent

- « Mets en place un médecin de CI pour ~/code/shop sur GitHub Actions : il peut relancer les jobs instables, mais pas de pull requests. »
- « Pourquoi la dernière exécution de CI sur main a-t-elle échoué dans acme/shop ? Était-elle instable ? »
- « Fais le tri des tickets ouverts dans acme/shop cette semaine : étiquette-les et trouve les doublons. »
- « Chaque lundi à 9 h, occupe-toi des dépendances de ~/code/api et ouvre des pull requests pour celles qui passent les tests. »
- « Mets en place un intervenant d’incident pour les alertes Grafana de checkout, avec un retour arrière via kubectl rollout undo deployment/checkout. »
- « Rédige le postmortem de la panne de checkout d’hier. »
- « Ça fonctionnait en v1.2.0 : trouve ce qui a cassé l’export PDF dans ~/code/docs. »
- « Lance une campagne dans ~/code/shop qui fait passer tous les paquets de Jest à Vitest, avec une pull request pour chaque paquet. »
