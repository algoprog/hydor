# Tâches planifiées

Une tâche planifiée est un travail d’agent qui démarre tout seul : à une heure du jour, toutes les quelques minutes ou heures, une seule fois, quand un autre service appelle son webhook, quand quelque chose que vous surveillez change, quand un nouvel e-mail ou un nouvel enregistrement arrive dans une app connectée, ou un certain temps avant chaque événement de votre agenda. Servez-vous-en pour un résumé du matin, un rappel, un prix ou une page à garder à l’œil, un rapport hebdomadaire, chaque nouvelle facture reçue par e-mail, une première réponse à chaque nouveau prospect, un brief avant chaque appel client, une relecture de chaque nouvelle pull request ou un examen de chaque exécution de CI en échec : le résultat vous parvient sans que vous ayez à démarrer une session.

![Paramètres → Tâches planifiées : le travail qui démarre tout seul](images/tasks.webp)

## Ce qu’est une tâche planifiée

Une tâche planifiée est un prompt associé à un déclencheur. Chaque fois que le déclencheur se produit, l’app lance une exécution : une nouvelle session avec l’agent, le modèle et le dossier de la tâche, dont le premier message est le prompt de la tâche (ou, si vous le choisissez, le prompt est envoyé dans une session que vous avez déjà). L’agent travaille comme dans n’importe quelle session. À la fin, il indique en une ligne comment cela s’est passé, et l’historique de la tâche conserve cette ligne, le coût et un lien vers la session.

Une tâche peut démarrer :

- **À une heure précise** : une heure du jour, les jours de la semaine que vous choisissez, ou selon une expression cron.
- **Répétition** : toutes les tant de minutes (au moins 5) ou d’heures.
- **Une fois** : à une date et une heure données.
- **Suivre** : quand une surveillance repère un changement dans un flux, une page web, une valeur dans du JSON, un dossier ou la sortie d’une commande, un nouvel e-mail dans l’un de vos comptes de messagerie, ou du nouveau dans une app connectée (une affaire, un fichier, un ticket, un paiement), ou un certain temps avant chaque événement d’un agenda connecté. Une surveillance regarde sans modèle, donc ses vérifications ne coûtent aucun token ; l’agent ne se réveille que si quelque chose a changé.
- **Webhook** : quand un autre service (GitHub, Gitea, un formulaire, un de vos scripts) appelle l’adresse propre à la tâche.

Une tâche peut aussi exécuter l’une de vos apps à la place d’un prompt : chaque fois que son déclencheur se produit, l’app s’exécute avec les réponses que vous avez définies, et l’historique de la tâche renvoie vers cette exécution (voir [Exécuter une app toute seule](/guide/apps#run-an-app-by-itself)).

Les heures sont exprimées dans votre fuseau horaire, que l’app prend dans votre navigateur. Une exécution qui n’a pas pu démarrer à l’heure prévue, parce que l’ordinateur était éteint ou en veille ou que l’app n’était pas lancée, s’exécute à la première occasion.

Vos tâches se trouvent dans [Paramètres → Tâches planifiées](/settings?s=tasks) (**Paramètres → Agents → Tâches planifiées**). La zone de recherche (Ctrl+K, ⌘K sur Mac) retrouve aussi une tâche par son nom et l’ouvre à cet endroit. Il y a cinq façons d’en créer une :

- **Nouvelle tâche** dans les Paramètres, où vous réglez vous-même chaque élément.
- **Partir d’un exemple** : un court formulaire pour une tâche courante.
- Demander à un agent dans n’importe quelle conversation (« rappelle-moi vendredi à 9 h ») : il affiche une carte que vous confirmez.
- **En faire une automatisation** dans le menu d’une session : cela prépare le brouillon d’une tâche à partir d’une session qui a bien fonctionné.
- **Ajouter une planification** dans les **Exécutions** d’une app : une tâche qui exécute cette app.

Reprendre une session toute seule une fois la limite d’utilisation d’un forfait réinitialisée est un réglage à part : [Paramètres → Général → Reprendre après les limites d’utilisation](/settings?s=general&find=Resume%20after%20usage%20limits) (voir [Utilisation, limites et coûts](/guide/usage)).

## Voir vos tâches planifiées

[Paramètres → Tâches planifiées](/settings?s=tasks) comporte un groupe, **Vos tâches**, dont la ligne indique votre fuseau horaire (son (i) précise qu’une exécution qui n’a pas pu démarrer, parce que l’ordinateur était éteint, s’exécute à la première occasion), et qui liste vos tâches, les plus anciennes en premier. La liste se met à jour toute seule au fil des exécutions. **Vue de la semaine**, à côté de **Nouvelle tâche**, les affiche toutes sur un calendrier (voir [Voir la semaine : ce qui a tourné et ce qui tourne ensuite](#see-the-week-what-ran-and-what-runs-next)). Chaque ligne affiche :

- Une icône pour le déclencheur (un calendrier, un œil pour une surveillance, un symbole de webhook), le nom de la tâche et l’icône de son agent.
- Quand elle s’exécute et où, par exemple « Jours ouvrés à 09:00 · nouvelle session dans reports · prochaine dans 14 h 20 min », ou « publie dans une session ».
- Pour une surveillance, son dernier coup d’œil : « Vérifié il y a 5 min : 12 éléments, 2 nouveaux » (en orange quand la vérification a échoué).
- Quand la tâche s’est mise en pause toute seule, la raison, avec « Activez-la pour réessayer. »
- Des points pour ses dernières exécutions (jusqu’à six, les plus anciennes en premier : vert pour terminé, orange pour partiellement terminé ou bloqué, rouge pour échec ou erreur, gris pour rien de nouveau) avec **Historique** à côté ; **Dernière exécution il y a 3 h** (en rouge, avec la raison, quand la dernière exécution n’a pas pu démarrer) ; et **Ouvrir**, qui ouvre la session de la dernière exécution.
- Pour une tâche webhook, son adresse avec un bouton de copie et, pour une tâche créée à partir d’un exemple, l’endroit où la coller dans le service qui l’appelle.

À droite de chaque ligne se trouvent un interrupteur qui met la tâche en pause ou l’active, et le menu de la tâche (⋯) : **Exécuter maintenant**, **Tester sans envoyer**, **Modifier**, **Historique**, **Dupliquer**, **Nouvelle adresse** (tâches webhook uniquement) et **Supprimer**.

Une carte de tableau de bord qui se tient à jour toute seule figure aussi dans la liste, au nom du tableau de bord : « Boutique · Ventes par jour : actualisation ». Sa ligne comporte son interrupteur, **Actualiser maintenant** et **Ouvrir le tableau de bord**, qui ouvre les réglages de la carte sur le tableau de bord : sa question, sa planification et son niveau s’y modifient, et **Arrêter l’actualisation** (ou retirer la carte, ou supprimer le tableau de bord) la retire de cette liste ([Garder les cartes à jour](/guide/library#keep-cards-up-to-date)).

Quand il n’y a encore aucune tâche, la liste indique « Aucune tâche planifiée pour l’instant : partez d’un exemple ci-dessous, ou demandez à un agent d’en créer une ».

## Voir la semaine : ce qui a tourné et ce qui tourne ensuite

Tout ce qui s’exécute tout seul est au même endroit : [Agents → Planifications](/agents/schedules), l’entrée **Planifications** dans la colonne de la page Agents (un onglet en haut sur téléphone). **Vue de la semaine** dans Paramètres → Tâches planifiées l’ouvre aussi, tout comme la zone de recherche. Elle réunit vos tâches planifiées, les planifications de vos agents, celles de vos apps (y compris **Mettre à jour automatiquement**), les cartes de tableau de bord qui se tiennent à jour, les surveillances et les webhooks, pour que vous voyiez ce qui tourne demain, pourquoi plusieurs tâches ont démarré à 08:00, et comment la semaine dernière s’est passée.

- **La semaine** : sept jours côte à côte, du lundi au dimanche, les heures sur le côté et le jour courant marqué, avec une ligne à l’heure actuelle. Chaque exécution passée est un bloc à son heure, coloré selon son résultat : vert pour **Terminé**, gris pour **Rien de nouveau**, orange pour **Votre intervention est requise** (partiellement terminé ou bloqué), rouge pour **Échec** (ou une erreur). Les exécutions à venir sont dessinées en pâle, avec un bord en pointillés et leur nom. Quand plus de trois démarrent en même temps, deux s’affichent et un bloc **+2** (ou plus) liste les autres.
- **La colonne de chaque jour** indique ce que ses exécutions ont coûté et combien ont échoué.
- **Toutes les quelques minutes, surveillances et webhooks** : ce qui s’exécute plus de huit fois par jour, les surveillances et les webhooks apparaissent sous forme d’une bande par tâche au-dessus des heures, plutôt que d’un bloc par exécution. Chaque jour a une barre du résultat de ses exécutions, le nombre d’exécutions, et **+48** (par exemple) pour celles à venir. Cliquez sur la ligne pour les replier.
- **Cliquez sur un bloc** pour afficher sa carte : comment cela s’est passé, quand, combien de temps cela a pris et ce que cela a coûté, ce qui l’a démarrée (quand ce n’était pas sa planification), le résumé en une ligne de l’agent, **Ouvrir sa session** (ou **Ouvrir son exécution**, pour une app), **Modifier**, **Pause** (ou **Activer**) et **Supprimer**. Une exécution à venir indique quand elle s’exécutera, avec les mêmes trois boutons. Pour une bande, le jour compte ses exécutions selon leur déroulement, avec **Ouvrir la dernière** quand il y a une session, et les mêmes trois boutons. L’actualisation d’une carte de tableau de bord n’a pas de **Supprimer** : on l’arrête sur son tableau de bord.
- **Clic droit sur une entrée** (un bloc, une exécution à venir ou le jour d’une bande) ou sur une ligne de la liste pour un menu : **Modifier**, **Pause** (ou **Activer**) et **Supprimer…**, qui demande d’abord « Supprimer *nom* ? ». Pour l’actualisation d’une carte de tableau de bord, le menu propose à la place **L’arrêter sur son tableau de bord** et vous y emmène. Au clavier, la touche de menu ou Maj+F10 sur une entrée sélectionnée l’ouvre et Échap la ferme. Là où il n’y a pas de clic droit (téléphone ou tablette), appuyez sur l’entrée : sa carte propose les mêmes boutons.
- **‹** et **›** vont à la semaine précédente ou suivante, et **Aujourd’hui** revient au jour courant. **Semaine** et **Mois**, en haut à droite, basculent vers un mois : chaque jour avec une barre du résultat de ses exécutions, combien ont tourné et échoué, combien sont à venir (et **+48 répétitions** pour ce qui s’exécute toutes les quelques minutes), et son coût. Cliquez sur un jour pour ouvrir sa semaine.
- La ligne au-dessus du calendrier additionne ce qui est affiché : combien ont tourné, combien ont échoué, ce qu’elles ont coûté et combien sont à venir, puis la signification des couleurs et votre fuseau horaire.
- **Les pastilles** en haut (**Tout**, **Tâches**, **Agents**, **Apps**, **Tableaux de bord**, **Surveillances**, **Webhooks**, **En pause**, chacune avec son nombre) ne montrent que ces éléments : sur le calendrier, dans ses totaux et dans la liste.

Sous le calendrier, **Tout ce qui s’exécute tout seul** liste chaque élément : d’abord ce qui s’exécute en premier, puis les surveillances et les webhooks, puis ce qui est en pause. Une ligne indique son nom et à qui elle appartient (**Agent ·** et l’agent, **App ·** et l’app, **Tableau de bord ·** et le tableau de bord, ou **Tâche**), quand elle s’exécute et quand aura lieu la prochaine exécution, pourquoi elle s’est mise en pause toute seule, des points pour ses dernières exécutions avec **Dernière exécution il y a 3 h :** et son déroulement, le résumé de l’agent et **Ouvrir**. L’interrupteur la met en pause ou l’active, et la corbeille la supprime après confirmation (pas pour l’actualisation d’une carte de tableau de bord). Le crayon l’ouvre là où vous la modifiez : la planification d’un agent sur la page de l’agent, celle d’une app dans les **Exécutions** de l’app (ou dans les **Paramètres** de sa page, pour **Mettre à jour automatiquement**), les actualisations d’une carte de tableau de bord sur son tableau de bord (son bouton **La tenir à jour…** : [Tenir les cartes à jour](/guide/library#keep-cards-up-to-date)), toute autre tâche ici dans Paramètres → Tâches planifiées, avec son formulaire ouvert.

Les heures sont exprimées dans votre fuseau horaire. Sur téléphone, Planifications affiche un seul jour à la fois : **‹** et **›**, ou un balayage sur le côté, passent au jour précédent ou suivant.

## Créer une nouvelle tâche

1. Ouvrez [Paramètres → Tâches planifiées](/settings?s=tasks) et sélectionnez [**Nouvelle tâche**](/settings?s=tasks&find=New%20task), le bouton à côté du titre de la page. Le formulaire **Nouvelle tâche planifiée** s’ouvre.
2. Saisissez un nom, choisissez l’agent et le dossier, puis rédigez la consigne.
3. Sous **Quand**, choisissez quand la tâche s’exécute.
4. Sous **Chaque exécution**, choisissez où va chaque exécution et ses limites.
5. Si vous le souhaitez, sélectionnez **Exécution de test** pour l’essayer une fois sans l’enregistrer (voir [Essayer une tâche avec une exécution de test](/guide/tasks#try-a-task-with-a-test-run)).
6. Sélectionnez **Créer la tâche**.

**Créer la tâche** et **Exécution de test** restent indisponibles tant que la tâche n’a pas de nom ni de consigne. Une nouvelle tâche est réglée pour s’exécuter à 09:00 en semaine, avec l’agent que vous avez choisi en dernier sur la page de démarrage, dans le dossier par défaut de l’app (en général votre dossier personnel).

### Nom, agent et dossier

- **Nom** (le champ qui indique « Nom, p. ex. Résumé CI du matin ») : la façon dont la tâche apparaît dans la liste, dans les notifications et dans les titres des sessions de ses exécutions (« Morning brief · 3 nov., 07:30 »). 120 caractères au maximum.
- La pastille de l’agent : qui exécute la tâche. Claude Code, Codex, Custom ou un autre agent que vous avez ajouté (voir [Agents, comptes et modèles](/guide/agents-models)). Choisir un autre agent efface le modèle et l’effort, et applique les autorisations habituelles de cet agent.
- La pastille du dossier : le dossier dans lequel travaille chaque exécution. Saisissez un chemin ou choisissez-en un, puis sélectionnez **Utiliser ce dossier**. Le dossier doit exister.

### Modèle, effort, autorisations et autres options

La rangée située en dessous reprend les sélecteurs de la page de démarrage :

- **Modèle** et **Effort** : le modèle et l’intensité de sa réflexion. **Automatique** est le premier choix du menu **Modèle**, comme sur la page de démarrage : les sessions de la tâche démarrent au niveau Meilleur, et leur agent principal peut passer de lui-même à Max quand un problème se révèle trop difficile (voir [Niveaux : un modèle pour chaque type de travail](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). Ce choix est proposé quand [**Diriger avec des sous-agents**](/settings?s=models&find=Lead%20with%20subagents) est activé et que le programme a des niveaux (pour Custom, dès que son niveau Meilleur désigne un modèle), mais pas pour une tâche confidentielle. Une nouvelle tâche démarre sur Automatique partout où ce choix est proposé ; une tâche enregistrée auparavant garde son modèle, et vous pouvez le changer ici à tout moment. Dans un terminal, `hydor tasks new … --model auto` fait la même chose (voir [Hydor dans un terminal](/guide/terminal)). Un modèle choisi par son nom est utilisé tel quel. Sinon, ce sont les valeurs par défaut de l’agent qui s’appliquent.
- **Autorisations** : ce que l’agent peut faire sans vous demander. Une nouvelle tâche démarre sur **Demander** pour Claude Code, **Automatique** pour Codex et **Automatique** pour Custom (les étapes courantes se déroulent, les étapes risquées demandent votre accord). Personne n’est forcément là quand une exécution a lieu : une exécution qui a besoin de votre approbation l’attend, dans sa session et dans la [boîte de réception](/guide/inbox).
- **Agent**, **Mémoire** (quand la mémoire est activée), **Plafond de dépenses**, **Essaim** et **Recherche** : la nouvelle session de chaque exécution démarre avec ces réglages, comme une session lancée depuis la page de démarrage (voir [Sessions](/guide/sessions), [Agents](/guide/agents) et [Mémoire](/guide/memory)). Une tâche exécutée par l’un de vos agents fait partie des planifications de cet agent : elle apparaît sur la page de l’agent, ses exécutions reçoivent le niveau de l’agent et comptent dans son budget mensuel. Une exécution qui échoue ou s’arrête avec une erreur au niveau de l’agent est relancée un niveau plus haut, jusqu’à Meilleur, sauf si l’option **Monter d’un niveau quand une vérification échoue** de l’agent est désactivée. Un agent qui réfléchit avec un niveau continue de s’exécuter à son niveau, quel que soit le modèle de la tâche. Quand l’agent garde une conversation à lui, chaque exécution publie dans cette conversation au lieu de démarrer une nouvelle session.

### La consigne

Ce que l’agent doit faire à chaque fois. Rédigez-la comme des instructions complètes : une exécution démarre de zéro et ne voit pas la conversation où l’idée vous est venue. Elle peut compter jusqu’à 50 000 caractères.

Le premier message de chaque exécution contient plus que votre consigne : une ligne qui indique le nom de la tâche, sa fréquence, la raison du déclenchement de cette exécution et l’heure actuelle ; une demande de rendre compte du déroulement ; et les notes de la tâche issues des exécutions précédentes. Dans la session de l’exécution, tout cela s’affiche sur une seule ligne, par exemple « Tâche planifiée Morning brief · En semaine à 07:30 ». Sélectionnez-la pour lire la consigne et, sous « Ajouté par l’app pour cette exécution », le reste.

### Quand la tâche s’exécute

**Quand** propose cinq choix : **À une heure précise**, **Répétition**, **Une fois**, **Suivre** et **Webhook**. Pour les trois premiers, une ligne en dessous (« Prochaine : … ») indique les prochaines exécutions, trois au maximum, dans votre fuseau horaire.

- **À une heure précise** : une heure de la journée et les jours de la semaine (L M M J V S D). Sélectionnez un jour pour l’activer ou le désactiver ; les sept jours signifient tous les jours, et au moins un reste toujours activé.
- **Expression cron…** (sous **À une heure précise**) transforme l’heure et les jours en une expression cron, une manière standard d’écrire des planifications, que vous pouvez ensuite modifier ; **Plutôt une heure de la journée** revient en arrière. Elle comporte cinq champs : minute, heure, jour du mois, mois et jour de la semaine (0 ou 7 pour dimanche), dans votre fuseau horaire. `*/15 9-17 * * 1-5` s’exécute toutes les 15 minutes de 09:00 à 17:45 en semaine. Les noms de mois et de jours (`jan`, `mon`) et les raccourcis `@hourly`, `@daily`, `@weekly`, `@monthly` et `@yearly` fonctionnent aussi. Une expression qui ne fonctionne pas est refusée, avec la raison, à l’enregistrement.
- **Répétition** : « Toutes les [nombre] minutes » ou « heures ». L’intervalle le plus court est de 5 minutes ; une nouvelle tâche répétée s’exécute toutes les heures. La première exécution a lieu un intervalle après l’enregistrement.
- **Une fois** : une date et une heure (une heure plus tard au départ). Après une exécution réussie (**Terminé** ou **Rien de nouveau**), la tâche est supprimée, puisqu’il ne lui reste rien à faire. Après une exécution qui a échoué ou qui a besoin de vous, elle se désactive d’elle-même et reste dans la liste, pour que vous voyiez pourquoi et que vous puissiez la relancer avec **Exécuter maintenant**.
- **Suivre** : voir [Surveiller un changement](/guide/tasks#watch-for-a-change).
- **Webhook** : voir [Lancer des exécutions depuis un autre service avec un webhook](/guide/tasks#start-runs-from-another-service-with-a-webhook).

Dans les apps de bureau, l’ordinateur ne se met pas en veille de lui-même depuis quelques minutes avant une exécution prévue jusqu’à son démarrage, ni pendant qu’elle travaille (voir [Garder l’ordinateur éveillé](/guide/app#keep-the-computer-awake)) ; les vérifications d’un suivi ne le maintiennent pas éveillé. Fermer le capot d’un ordinateur portable le met tout de même en veille, et un ordinateur en veille à l’heure prévue exécute la tâche à son réveil. Pour des exécutions qui doivent avoir lieu à toute heure, utilisez un ordinateur qui reste allumé.

### Chaque exécution

- **Démarre une nouvelle session** (par défaut), ou **Publie dans :** l’une de vos sessions récentes avec le même agent (les 40 plus récentes qui ne sont pas archivées). Publier dans une session garde toutes les exécutions dans une seule conversation, qui utilise son propre modèle et ses propres réglages. Quand l’agent y est occupé, le message de l’exécution attend dans sa file jusqu’à la fin du tour, et le coût de l’exécution ne compte que sa propre part.
- **S’arrête au-delà de $** : un plafond de dépenses pour chaque exécution, aux tarifs de l’API. La session de l’exécution s’arrête dès qu’elle a dépensé ce montant (vérifié après chaque appel au modèle). Vide signifie aucun plafond. C’est le même plafond que la pastille **Plafond de dépenses** ci-dessus et, comme elle, il s’applique aux nouvelles sessions.
- **Mettre en pause après [3] échecs de suite** : la tâche se met elle-même en pause après ce nombre d’exécutions échouées d’affilée, et vous en explique la raison. 0 signifie que les échecs ne la mettent jamais en pause ; le maximum est 50.

La ligne en dessous résume : « Une exécution vous dit comment elle s’est passée ; celle qui n’a rien à signaler reste silencieuse, et les échecs notifient toujours. »

## Surveiller un changement

Un suivi est une vérification légère qui s’exécute toutes les quelques minutes sans modèle et ne réveille l’agent que lorsque quelque chose a changé. Choisissez **Suivre** sous **Quand**, puis ce qu’il faut observer :

- **Flux** : l’**Adresse** d’un flux RSS ou Atom (la liste des nouvelles publications que proposent de nombreux sites, blogs et plateformes de code). Chaque nouvel élément réveille l’agent, avec son titre, son lien, sa date et son résumé (jusqu’à 25 à la fois).
- **Page** : l’**Adresse** d’une page web, et ce que précise **Quelle partie** :
  - **Page entière** : toute modification de son texte lisible.
  - **Près d’un texte** : seulement les lignes contenant ce texte, ainsi que la ligne qui précède et celle qui suit chacune (pour un prix, « Prix »).
  - **Sélecteur** : la partie que désigne un sélecteur CSS simple (les noms qu’une page web donne à ses parties) : une balise, `#id`, `.class` ou `[attribute=value]`, combinés ou imbriqués, comme `main .price`.

  L’exécution reçoit les lignes apparues et les lignes disparues. Le suivi lit la page telle que le serveur la reçoit, sans exécuter les scripts de la page ; utilisez donc **Tester** pour vérifier qu’il voit ce que vous voyez.
- **JSON** : l’**Adresse** d’une réponse JSON (le format de données que fournissent les API de nombreux services), **Valeur à** un chemin comme `data.price` ou `data.items[0].price`, et **Réveiller quand il** change, est égal à, n’est pas, est supérieur à, est inférieur à ou contient une **Valeur**. Les nombres se comparent comme des nombres. Une condition réveille l’agent quand elle commence à être vraie, et non à chaque vérification tant qu’elle l’est.
- **Dossier** : un **Dossier** sur cet ordinateur et, si vous le souhaitez, **Seulement les fichiers comme** un motif tel que `*.pdf` (`*` représente n’importe quel texte, `?` un seul caractère). Les nouveaux fichiers réveillent l’agent, avec leurs noms, tailles et dates. Les fichiers cachés et les sous-dossiers sont ignorés.
- **Commande** : une **Commande** qui s’exécute avec votre shell dans le dossier de la tâche à chaque vérification, une minute au plus, et le choix de réveiller l’agent **Quand sa sortie change** ou **Quand son code de sortie change** (le nombre par lequel se termine une commande : 0 signifie en général que tout s’est bien passé). L’exécution reçoit la sortie et ce qui y a changé.
- **E-mail** : les nouveaux e-mails d’un compte de messagerie que vous avez connecté (voir [Connecter votre messagerie](/guide/connections#connect-your-email)). Choisissez le **Compte** et le **Dossier** (la boîte de réception sauf si vous en choisissez un autre) et, si vous le souhaitez, seulement les e-mails dont **L’expéditeur contient** ou **L’objet contient** un certain texte, ou **Seulement les e-mails encore non lus**. Chaque nouvel e-mail lance sa propre exécution, 10 au maximum par vérification : qui l’a envoyé et à qui, la date, l’objet et le texte, comme données externes, avec ses pièces jointes enregistrées dans le dossier de la tâche sous email-attachments. Quand plus de 10 e-mails arrivent entre deux vérifications, les 10 plus récents lancent chacun une exécution et la première exécution mentionne les plus anciens en une ligne. Un e-mail ne lance jamais deux exécutions, même après un redémarrage de l’app.
- **App connectée** : quelque chose de nouveau dans l’une des apps que vous avez connectées (voir [Apps connectées](/guide/connections)), comme une nouvelle affaire ou un nouveau contact dans un CRM, un nouveau fichier dans un stockage en ligne, un nouveau ticket ou un nouveau paiement. Choisissez le **Compte**, puis l’**Outil** qu’elle appelle à chaque vérification : seuls ses outils qui consultent (lister ou rechercher) sont proposés, jamais un outil qui envoie, modifie, supprime ou paie, et seulement ceux qui sont activés pour elle. **Partir de** propose des points de départ prêts à l’emploi quand l’app contient ce genre d’éléments (**Nouveaux fichiers**, **Nouveaux contacts**, **Nouvelles affaires**, **Nouveaux tickets**, **Nouveaux paiements** et d’autres) : chacun choisit l’un des outils du compte et remplit ses champs. Remplissez les champs de l’outil comme vous le souhaitez ; dans un champ, `{{now}}` représente l’heure de chaque vérification et `{{now+2d}}` l’heure deux jours plus tard (`{{today}}` et `{{tomorrow}}` aussi). **Essayer** appelle l’outil une fois et montre ce qui est revenu : l’endroit de sa réponse où se trouvent les éléments (**Les éléments sont dans**), le champ qui les distingue (**Distingués par**, comme un identifiant ou une adresse), les premiers éléments, et **Ce qu’il a répondu** en entier. Choisissez-y une autre liste ou un autre champ si ceux qu’il a trouvés ne conviennent pas. Chaque nouvel élément lance ensuite sa propre exécution, 10 au maximum par vérification, avec l’élément comme données externes ; quand davantage arrivent d’un coup, la première exécution nomme les autres en une ligne. Un élément ne lance jamais deux exécutions, même après un redémarrage de l’app. Demandez à l’outil les plus récents d’abord, et en nombre suffisant, là où ses champs le permettent.
  - **Avant chaque événement** : pour un agenda connecté, une exécution à un moment fixé avant chacun de ses événements plutôt qu’une pour chaque nouvel élément. **Lancer une exécution** **15 min**, **30 min** ou **1 heure** avant chaque événement, ou **La veille au soir** **À** une heure de votre choix, et si vous le souhaitez seulement les événements dont **Le titre contient** un texte, ou **Seulement les événements avec d’autres personnes**. Utilisez l’outil qui liste vos événements, avec des champs allant de `{{now}}` à `{{now+2d}}` environ, et choisissez le champ qui contient le début de chaque événement sous **Heure de début en** après **Essayer**. Le suivi lit les événements à venir à chaque vérification, puis une fois de plus au moment de chaque événement. Un événement qui est déplacé a son exécution avant sa nouvelle heure ; un événement annulé n’en a aucune.

Ensuite :

- **Vérifier toutes les [nombre] minutes** : la fréquence des vérifications, de 1 minute à une semaine. Un nouveau suivi vérifie toutes les 15 minutes.
- **Autoriser les adresses de cet ordinateur ou de son réseau** (flux, pages et JSON) : désactivé sauf si vous le cochez, de sorte qu’un suivi n’atteint que des sites publics. Vous seul pouvez l’autoriser, ici dans le formulaire ; un suivi proposé par un agent n’atteint jamais votre propre réseau.
- **Tester** : montre ce que le suivi voit maintenant, avec une ligne comme « 12 éléments (premier regard) » et un échantillon de ce qu’il a lu, ou ce qui s’est mal passé.

Comportement d’un suivi :

- Son premier regard après l’enregistrement ne fait que prendre note ; les changements ultérieurs réveillent l’agent. Modifier ce qu’une tâche surveille la fait repartir de zéro.
- Ce qu’il a lu parvient à l’agent marqué comme données externes, à exploiter et jamais à suivre comme des instructions.
- Un changement qui survient pendant que l’exécution du précédent est encore en cours attend le regard suivant. Les nouveaux e-mails, les nouveaux éléments d’une app connectée et les événements d’agenda font exception : chacun lance sa propre exécution.
- Quand un regard échoue (le site est en panne, le texte n’est plus sur la page, une app connectée est déconnectée ou sa réponse a changé), la ligne l’indique, et aucune exécution ne démarre sur ce qui n’a pas pu être lu. Après autant de regards échoués de suite que l’autorise **Mettre en pause après … échecs de suite**, la tâche se met en pause : « Mise en pause après 3 échecs de suite de sa vérification : … ».
- **Exécuter maintenant** sur une tâche de suivi exécute l’agent avec ce que le suivi voit maintenant, plutôt qu’avec un changement.

## Démarrer des exécutions depuis un autre service avec un webhook

Un webhook est une adresse qu’un autre service appelle quand quelque chose se produit : GitHub quand une pull request s’ouvre, un formulaire quand quelqu’un l’envoie, un script à vous. Choisissez **Webhook** sous **Quand** et enregistrez la tâche pour obtenir son adresse (« Enregistrez la tâche pour obtenir son adresse ; chaque appel à cette adresse démarre une exécution »). Elle s’affiche dans la ligne de la tâche, avec un bouton de copie. L’adresse fonctionne sans se connecter à l’app, car sa partie secrète fait office d’autorisation : gardez-la privée, et préférez un mode d’autorisation qui demande avant de modifier quoi que ce soit. Le service doit pouvoir joindre cette app à cette adresse.

Des éléments de l’appel peuvent être insérés dans la consigne :

- `{{body.path.to.field}}` : une valeur issue de ce que le service a envoyé (JSON, formulaire ou texte brut), par exemple `{{body.pull_request.html_url}}`.
- `{{headers.name}}` : l’un des en-têtes de l’appel. Les en-têtes qui contiennent des identifiants (Authorization, cookies, signatures, jetons) ne sont jamais renseignés.
- `{{query.name}}` : une valeur de la requête de l’adresse (la partie après `?`).
- `{{body}}` pour tout le corps, `{{request}}` pour le corps, les en-têtes et la requête réunis.

Ils parviennent à l’agent marqués comme données extérieures. **Exécuter maintenant** sur une tâche webhook envoie sa consigne telle qu’elle est écrite, sans aucun appel pour la compléter.

Les options sous l’adresse :

- **Secret de signature (facultatif)** : saisissez-en un ou sélectionnez **Générer**, puis donnez le même secret au service. Les appels doivent alors porter une signature HMAC-SHA256 de leur corps, calculée avec ce secret (un code que seule une personne connaissant le secret peut produire), comme l’envoient GitHub, Gitea et d’autres ; l’en-tête de jeton de GitLab fonctionne aussi. Les appels sans signature sont refusés.
- **En-tête de signature** : s’affiche dès qu’il y a un secret. Laissez-le vide pour les en-têtes usuels (X-Hub-Signature-256, X-Gitea-Signature, X-Signature-256…), ou indiquez celui que votre service utilise.
- **Filtre (facultatif)** : **Exécuter seulement quand** ou **Ignorer quand** un chemin dans l’appel **est** une valeur : `body.action` **est** `opened`, `headers.x-github-event` **est** `push`, `query.kind` **est** `daily`. Un chemin sans `body.`, `headers.` ni `query.` lit le corps. Un appel que le filtre écarte reçoit une réponse et ne démarre rien.

Ce que fait l’adresse des appels :

- Une livraison renvoyée avec le même Idempotency-Key ou le même identifiant de livraison (GitHub, Gitea et GitLab en donnent un à chaque livraison) ne s’exécute qu’une fois. Les identifiants sont conservés une semaine.
- Un appel reçu moins de cinq secondes après la dernière exécution de la tâche est écarté, de sorte qu’une rafale d’appels ne démarre qu’une exécution.
- Une tâche en pause refuse les appels. Un appel peut peser jusqu’à 2 Mo.
- L’appel reçoit une réponse immédiate, avec un lien vers la session de l’exécution. Ajoutez `?wait=60` à l’adresse pour attendre jusqu’à 60 secondes la réponse de l’agent dans la réponse (jusqu’à 300) ; une exécution encore en cours à ce moment-là répond avec un lien vers elle.

## Donner une nouvelle adresse à une tâche webhook

Si l’adresse a fuité, ou si un service doit cesser de l’appeler : menu de la tâche (⋯) → **Nouvelle adresse**, puis confirmez **Nouvelle adresse** (« L’adresse actuelle cesse de fonctionner. Mettez à jour les services qui l’appellent. »). Modifier une tâche webhook conserve son adresse ; un doublon reçoit sa propre adresse.

## Partir d’un exemple

Sous la liste, [**Partir d’un exemple**](/settings?s=tasks&find=Start%20from%20an%20example) (« Un court formulaire pour chacun ; modifiez ce que vous voulez ensuite ») réunit des tâches prêtes à l’emploi sous forme de lignes, les quatre premières visibles et les autres derrière **Afficher tous les exemples** (**Afficher moins d’exemples** les replie). Les voici en trois groupes : **Au quotidien**, **Suivre** et **Ingénierie**. Sélectionnez-en un pour ouvrir son court formulaire, remplissez-le, choisissez qui l’exécute sous **Lancée par**, puis sélectionnez **Créer la tâche**. **Plus d’options…** ouvre à la place le formulaire complet de la tâche, déjà rempli. Les champs marqués (facultatif) peuvent rester vides ; les autres sont obligatoires. Les interrupteurs (comme **Pull requests ouvertes**) indiquent ce que l’agent a le droit de faire : activés ou désactivés, comme vous voulez.

**Au quotidien**

- [**Brief du matin**](/settings?s=tasks&find=Morning%20brief) : la météo, les actualités sur ce que vous suivez et votre journée, chaque matin. Vous indiquez l’heure (07:30 au départ), les jours, la ville pour la météo et les sujets pour les actualités ; l’agent ajoute les événements du jour et les e-mails urgents quand un compte de calendrier ou de messagerie est connecté.
- [**Actualités sur un sujet**](/settings?s=tasks&find=News%20on%20a%20topic) : ce qui est réellement nouveau sur un sujet, avec les sources, à l’heure et aux jours que vous choisissez (tous les jours à 09:00 au départ) ; silencieuse quand il n’y a rien.
- [**Rapport hebdomadaire à partir d’un dossier**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder) : un jour de la semaine (vendredi à 16:00 au départ), ce qui a changé dans un dossier ou un dépôt au cours des sept derniers jours et ce qui semble inachevé, avec trois suggestions pour la semaine suivante. Elle ne modifie aucun fichier.
- [**Résumé de la boîte de réception**](/settings?s=tasks&find=Inbox%20digest) : ce qui est arrivé dans votre messagerie depuis la dernière exécution, avec en premier les messages qui vous concernent. Elle ne fait que lire, et elle a besoin d’un compte de messagerie connecté (voir [Apps connectées, clés et outils](/guide/connections)).
- [**Point d’étape d’habitude**](/settings?s=tasks&find=Habit%20check-in) : une question amicale sur une habitude à l’heure que vous choisissez (tous les jours à 20:00 au départ), avec votre série conservée dans les notes de la tâche.
- [**Rappel**](/settings?s=tasks&find=Reminder) : un coup de pouce à une heure précise, aux jours que vous choisissez (en semaine à 09:00 au départ). Pour un rappel unique, voir [Rappels](/guide/tasks#reminders).

**Suivre**

- [**Suivi de prix**](/settings?s=tasks&find=Price%20watch) : surveille la page d’un produit toutes les 60 minutes (seulement près d’un texte comme « Prix », si vous en donnez un) et vous prévient quand le prix change, ou quand il atteint ou passe sous l’objectif que vous fixez.
- [**Alerte de changement de page**](/settings?s=tasks&find=Page%20change%20alert) : surveille une page, ou la partie proche d’un texte, toutes les 30 minutes, et dit ce qui a changé et si cela compte ; les changements anodins restent silencieux.
- [**Nouvelles versions**](/settings?s=tasks&find=New%20releases) : surveille les versions publiées d’un dépôt GitHub (propriétaire/nom) toutes les 6 heures et résume ce qui est nouveau et ce qui pourrait casser.
- [**Vérification de disponibilité du site**](/settings?s=tasks&find=Site%20up%20check) : vérifie une adresse toutes les 10 minutes. Quand le site tombe, l’agent cherche pourquoi (DNS, certificat, statut HTTP, délai dépassé) ; quand il revient, il le dit en une ligne.
- [**Alerte d’espace disque**](/settings?s=tasks&find=Disk%20space%20alert) : vérifie un disque (`/` au départ) toutes les 30 minutes. Quand il dépasse un seuil (90 %), l’agent cherche ce qui occupe la place et suggère ce qu’on peut nettoyer, sans rien supprimer.
- [**Nouveaux fichiers dans un dossier**](/settings?s=tasks&find=New%20files%20in%20a%20folder) : surveille un dossier toutes les 15 minutes (seulement les fichiers comme `*.pdf`, si vous le précisez) et fait ce que vous écrivez sous **Ensuite** avec chaque nouveau fichier, ou vous dit en une ligne ce qu’est chacun.

**Ingénierie** (plus dans [Ingénierie](/guide/engineering))

- [**Examiner les nouvelles pull requests**](/settings?s=tasks&find=Review%20new%20pull%20requests) : une tâche webhook dans un dossier de dépôt, que GitHub ou Gitea appelle pour chaque nouvelle pull request (elle ne s’exécute que lorsque l’appel indique `opened`). L’agent examine la modification et suggère des corrections, sans pousser ni fusionner. Une fois la tâche enregistrée, copiez son adresse dans les paramètres de webhook du dépôt, comme l’indique sa ligne (seulement **Pull requests** dans les événements individuels).
- [**Docteur CI**](/settings?s=tasks&find=CI%20doctor) : une exécution échouée sur GitHub Actions, GitLab CI, Buildkite ou CircleCI réveille un agent qui lit les journaux, distingue l’instable du réel, la relance ou ouvre une pull request en brouillon avec un correctif, selon ce que vous autorisez, et en fait le résumé. Voir [Docteur CI](/guide/engineering#ci-doctor).
- [**Tri des tickets**](/settings?s=tasks&find=Issue%20triage) : chaque nouveau ticket reçoit une étiquette, est vérifié pour les doublons, reçoit une réponse aimable demandant ce qui manque et, quand la correction est petite, est essayé sous forme de pull request en brouillon. Voir [Tri des tickets](/guide/engineering#issue-triage).
- [**Jardinier de dépendances**](/settings?s=tasks&find=Dependency%20gardener) : une fois par semaine (le lundi à 09:00 au départ), met à niveau dans des worktrees en exécutant les tests, correctifs de sécurité en premier, une pull request par niveau de risque, ou un rapport. Voir [Jardinier de dépendances](/guide/engineering#dependency-gardener).
- [**Premier intervenant en cas d’incident**](/settings?s=tasks&find=Incident%20first%20responder) : une alerte de Sentry, Grafana, Datadog, Better Stack ou d’un autre service réveille un agent qui vous prévient aussitôt, trouve la cause probable et demande avant tout retour en arrière. Voir [Premier intervenant en cas d’incident](/guide/engineering#incident-first-responder).

Le formulaire d’un exemple webhook indique, sous ses champs, où ira son adresse ; une fois la tâche créée, sa ligne le répète sous l’adresse.

## Essayer une tâche avec une exécution de test

**Exécution de test**, dans le pied du formulaire, exécute la tâche une fois maintenant, telle que le formulaire la décrit, sans l’enregistrer. Elle se déroule comme une vraie exécution, dans une session à part intitulée « Test : <nom> · <heure> », et un bandeau du formulaire affiche **Exécution de test** avec son déroulement une fois terminée, et **Ouvrir sa session**. Une exécution de test ne compte jamais parmi les échecs qui mettent une tâche en pause. Tester une tâche que vous modifiez lit ses notes et apparaît dans son historique comme une **Exécution de test** ; une nouvelle tâche n’a pas encore de notes.

Pour essayer une tâche qui envoie, publie ou supprime sans que rien ne parte, ouvrez le menu à côté de **Exécution de test** (**Plus de façons de tester**) et choisissez **Tester sans envoyer**, ou choisissez **Tester sans envoyer** dans le menu (⋯) d’une tâche enregistrée. Elle s’exécute de la même façon, mais chaque appel à l’outil d’un compte connecté qui agit à l’extérieur (envoie, publie, diffuse, répond, invite, partage, supprime ou paie), et chaque appel à un outil réglé sur Demander, est conservé comme « aurait été envoyé » et n’est jamais effectué. L’agent en est informé et continue comme si l’action avait eu lieu. Son bandeau, son exécution dans **Historique** et sa session listent ce qui **Aurait été envoyé**, et rien n’attend ensuite dans la Boîte d’envoi. La lecture fonctionne comme d’habitude. Voir [Apps connectées, clés et outils](/guide/connections#ask-first-calls-that-wait-for-your-ok).

## Exécuter une tâche maintenant

Menu de la tâche (⋯) → **Exécuter maintenant** démarre aussitôt une exécution, que la tâche soit activée ou en pause, et ouvre sa session.

## Voir comment se sont passées les exécutions

Menu de la tâche (⋯) → **Historique**, ou **Historique** à côté des points, ouvre les exécutions de la tâche, de la plus récente à la plus ancienne (les 50 dernières s’affichent ; l’app en garde 100 par tâche). Chaque exécution indique :

- Comment elle s’est passée : **En cours d’exécution**, **Terminé**, **Partiellement terminé**, **Bloqué** (l’agent a besoin de vous : un accès ou une décision), **Échec**, **Rien de nouveau** ou **Erreur** (elle n’a pas pu démarrer, ou son tour s’est arrêté sur une erreur).
- Quand elle a démarré, ce qui l’a déclenchée (**Selon un calendrier**, **Webhook**, **Observateur**, **Exécuter maintenant**, **Réexécuter**, **Exécution de test** ou **Tester sans envoyer**), combien de temps elle a duré et ce qu’elle a coûté.
- Pour un test sans envoi, ce qui **Aurait été envoyé** : chaque appel, avec le compte, l’outil et le destinataire.
- Le résumé en une ligne de l’agent. Sélectionnez un résumé long pour lire toute la dernière réponse de l’agent.
- **Ouvrir sa session**, et **Réexécuter avec la même entrée**, qui exécute de nouveau la tâche avec ce que cette exécution a reçu : le même appel de webhook, ou le même changement qu’un observateur avait vu.

Le résultat est ce que l’agent a signalé à la fin. Quand il n’a rien signalé, l’app décide : **Erreur** si le tour s’est arrêté sur une erreur, **Rien de nouveau** si la réponse commence par [SILENT] ou dit seulement qu’il n’y a rien à signaler, et **Terminé** dans les autres cas. Dans la session de l’exécution, le rapport de l’agent apparaît comme une étape : « Signalé terminé : … ».

## Notes gardées par une tâche entre ses exécutions

Sous l’historique se trouve le bloc-notes de la tâche, **Notes gardées par ses exécutions** : ce que la prochaine exécution doit savoir, comme ce qui a déjà été signalé, un total courant ou l’endroit où elle s’est arrêtée. Chaque exécution le lit au début, et l’agent y ajoute des éléments ou le réécrit. Sélectionnez **Modifier** pour le changer vous-même, puis **Enregistrer** (ou **Annuler**). Il contient jusqu’à 8 000 caractères ; au-delà, les lignes les plus anciennes disparaissent.

## Notifications d’une tâche

Une exécution vous dit comment elle s’est passée par la notification habituelle de sa session, intitulée du nom de la session et reprenant le résumé en une ligne de l’agent. Elle suit vos paramètres de notification (voir [Boîte de réception et notifications](/guide/inbox)).

- Une exécution sans rien à signaler n’envoie rien.
- Une exécution en échec, ou terminée sur une erreur, envoie toujours un avis d’échec.
- Une exécution bloquée envoie un avis indiquant qu’elle a besoin de vous, commençant par « Bloqué : ».
- Une exécution qui n’a pas pu démarrer (son dossier a disparu, la session dans laquelle elle publie a été supprimée) envoie un avis d’échec, « Impossible de démarrer : … ».
- Une tâche qui se met elle-même en pause envoie un avis qui en donne la raison.
- Une exécution qui met fin à sa tâche le dit : « Sa mission est accomplie, son calendrier a donc été supprimé. »
- Une exécution qui publie dans l’une de vos conversations laisse inchangées les notifications de cette conversation.

Un agent peut aussi vous envoyer une notification pendant qu’il travaille (son outil `notify_user`), pour quelque chose qui ne peut pas attendre la fin de l’exécution ; tout agent le peut, de même que l’étape d’une app.

## Mettre en pause, activer, modifier, dupliquer ou supprimer une tâche

- **Mettre en pause ou activer** : l’interrupteur sur la ligne de la tâche. Une tâche en pause ne s’exécute pas et ne surveille rien, et son webhook refuse les appels. Réactiver une tâche remet à zéro son compte d’échecs et la raison de sa pause.
- **Pause automatique** : après le nombre d’échecs consécutifs défini, la tâche se met en pause et sa ligne en donne la raison (« En pause après 3 exécutions échouées d’affilée. La dernière : … »).
- **Modifier** : menu de la tâche (⋯) → **Modifier** ouvre le formulaire sous le titre **Modifier la tâche** ; sélectionnez **Enregistrer**. Le formulaire d’une tâche enregistrée a aussi **Supprimer** dans son pied, avec la même question au préalable.
- **Dupliquer** : ouvre un nouveau formulaire de tâche avec une copie nommée « <nom> (copie) », à modifier puis à enregistrer.
- **Supprimer** : demande d’abord confirmation : « Elle cesse de s’exécuter et son historique disparaît. Les sessions qu’elle a démarrées restent. »
- **Suppression automatique** : une tâche devenue inutile disparaît d’elle-même, environ une minute après la fin de sa dernière exécution : une tâche ponctuelle après une exécution réussie, et une tâche dont l’exécution a constaté que sa mission était accomplie, parce que ce qu’elle attendait ou surveillait s’est produit et que sa consigne disait de s’arrêter alors (la notification de l’exécution le précise). Les calendriers d’un agent sont supprimés avec l’agent.

## Laisser un agent configurer une tâche

Demandez-le dans n’importe quelle conversation, avec vos propres mots : « rappelle-moi vendredi à 9 h d’appeler le dentiste », « chaque lundi matin, résume les tickets de la semaine dernière », « préviens-moi quand cette page change ». L’agent propose la tâche, et une carte la présente dans la conversation. Rien n’est enregistré tant que vous n’avez pas répondu.

La carte demande **Planifier cette tâche ?**, avec le nom de la tâche et **En attente de votre réponse**, et affiche :

- **Quand** : la planification en toutes lettres, avec les prochaines exécutions dans votre fuseau horaire. Pour une surveillance, ce qui est surveillé et à quelle fréquence, avec l’adresse, la commande ou l’outil d’une app connectée, et « Elle semble correcte après votre confirmation, et l’agent ne se réveille que lorsque quelque chose a changé. »
- **Action** : le prompt (**Tout** ouvre un prompt long).
- **Exécutions** : l’agent, son modèle (**Automatique** quand la conversation l’utilise), et l’endroit : une nouvelle session dans un dossier, ou dans cette conversation.

Choisissez ensuite :

- **La planifier** : enregistre la tâche et l’active.
- **Modifier…** : ouvre le formulaire de la tâche, déjà rempli, pour changer d’abord ce que vous voulez ; son bouton indique aussi **La planifier**.
- **Pas maintenant** : refuse la proposition.

L’agent reçoit votre réponse sous forme de message, y compris les parties que vous avez modifiées, il est donc inutile de la lui indiquer. La carte reste dans la conversation avec le résultat (« Planifiée », « Prochaine exécution … », un lien vers **Tâches planifiées**), et affiche la même chose sur vos autres appareils.

Sauf demande contraire, la tâche s’exécute avec l’agent, le modèle, les autorisations et le dossier de la conversation (une conversation sur **Automatique** crée une tâche qui démarre aussi sur Automatique), et la session de chaque exécution démarre avec les réglages de la conversation : son agent, sa mémoire, son plafond de dépenses, ses comptes connectés et son projet. Demandez que les exécutions publient ici, et chacune publiera dans cette conversation au lieu de démarrer une nouvelle session.

Les agents peuvent aussi modifier, mettre en pause, réactiver ou supprimer vos tâches, toujours avec une carte au préalable : **Modifier cette tâche ?** (les parties modifiées, l’ancienne valeur barrée au-dessus de la nouvelle), **Mettre cette tâche en pause ?**, **Réactiver cette tâche ?** ou **Supprimer cette tâche ?**, chacune avec son oui et son non (**Le modifier** ou **La garder telle quelle**, **Mettre en pause** ou **La laisser active**, **L’activer** ou **La laisser en pause**, **Supprimer** ou **La garder**). Ils peuvent aussi lister vos tâches avec la prochaine exécution de chacune et le déroulement de la dernière.

Les agents suppriment une tâche devenue inutile plutôt que de la mettre en pause. Pour une tâche qui doit s’arrêter quand quelque chose se produit (« jusqu’à la sortie de la nouvelle version », « une fois mon colis arrivé »), ils l’indiquent dans son prompt, et l’exécution qui constate l’événement met fin à la tâche.

Quelques limites encadrent tout cela :

- Une conversation peut avoir jusqu’à cinq propositions en attente de votre réponse.
- Un agent ne peut plus proposer de nouvelle tâche dès que vous en avez 100.
- Une exécution planifiée ne peut ni planifier ni modifier de tâches ; il lui est demandé de plutôt en suggérer une dans son résumé. Elle peut seulement terminer sa propre tâche, une fois son travail accompli.
- Une surveillance proposée par un agent n’atteint jamais les adresses de votre propre ordinateur ou réseau.

## Transformer une session en tâche

Quand une session a fait quelque chose que vous voulez refaire : menu de la session (⋯) → **Plus** → **En faire une automatisation**. Le [modèle d’appoint](/settings?s=models&find=Helper%20model) lit la conversation et rédige une tâche : un prompt qui peut s’exécuter de nouveau tout seul (sans les détails ponctuels de cette fois, avec vos corrections intégrées) et un déclencheur adapté. L’agent, le modèle, l’effort, les autorisations, le dossier et les réglages de la session viennent de la session (une session sur **Automatique** donne une tâche qui démarre sur Automatique) ; une session dans un worktree s’exécute dans le dépôt dont elle provient.

Le formulaire s’ouvre sous le titre **Nouvelle automatisation à partir de cette session**, avec une ligne expliquant pourquoi ce déclencheur a été choisi. Modifiez ce que vous voulez, essayez une exécution de test, puis enregistrez ; la tâche se trouve ensuite dans [Paramètres → Tâches planifiées](/settings?s=tasks). Une session sans message de votre part ne peut pas être transformée en tâche.

## Rappels

Un rappel est une tâche dont l’exécution vous signale quelque chose à une heure donnée, sous forme de notification et dans sa session. Trois façons d’en créer un :

- Demandez à un agent : « rappelle-moi demain à 8 h de sortir les poubelles ». Il propose une tâche qui s’exécute une seule fois, et vous la confirmez sur la carte.
- Utilisez l’exemple [**Rappel**](/settings?s=tasks&find=Reminder) pour un rappel qui se répète les jours que vous choisissez.
- Créez une **Nouvelle tâche** avec **Une fois** sous **Quand**, et un prompt tel que « Rappelle-moi, en une phrase aimable, d’appeler le dentiste. »

## Sur un téléphone

[Paramètres → Tâches planifiées](/settings?s=tasks) fonctionne de la même façon sur un téléphone, et [Planifications](/agents/schedules) affiche un jour à la fois. Le formulaire de tâche, ceux des exemples et les confirmations (avant **Supprimer** ou **Nouvelle adresse**) s’ouvrent sous forme de feuilles depuis le bas de l’écran. Les choix sous **Quand** et les types de surveillance défilent latéralement lorsqu’ils ne tiennent pas à l’écran, et les exemples forment une seule colonne de lignes. Pour être informé de vos tâches lorsque l’app est fermée, activez les notifications sur le téléphone (voir [Boîte de réception et notifications](/guide/inbox)).

## Demander à un agent

- « Chaque jour de la semaine à 7 h 30, donne-moi la météo d’Athènes et les actualités de l’IA depuis hier. »
- « Rappelle-moi vendredi à 9 h d’appeler le dentiste. »
- « Fais en sorte que mon brief du matin s’exécute sur Automatique. »
- « Surveille cette page produit et préviens-moi quand le prix passe sous 99 €. »
- « Chaque fois qu’un e-mail contenant une facture arrive de mon comptable, enregistre le PDF dans ~/Invoices et ajoute une ligne à ma feuille de calcul de dépenses. »
- « Démarre une tâche quand une nouvelle affaire arrive dans HubSpot : recherche l’entreprise et rédige une première réponse à son contact. »
- « Trente minutes avant chaque appel client dans mon Google Agenda, fais-moi un point sur la personne que je rencontre et sur ce dont nous avons parlé la dernière fois. »
- « Lesquelles de mes tâches planifiées ont échoué cette semaine, et pourquoi ? »
- « Qu’est-ce qui s’actualise demain matin sur mes tableaux de bord, et combien ces actualisations coûtent-elles par mois ? »
- « Qu’est-ce qui s’exécute tout seul demain, et à quelle heure ? »
- « Pourquoi autant de mes tâches ont-elles démarré à 8 h 00 lundi ? Étale-les. »
- « Mets en pause mon Morning brief », ou « Exécute le rapport hebdomadaire maintenant. »
- « Supprime la planification hebdomadaire que j’ai mise par erreur sur le Chercheur. »
- « Vérifie toutes les 30 minutes si mon colis a été livré, préviens-moi quand c’est le cas, puis arrête-toi. »
- « Lesquelles de mes tâches planifiées ne sont plus utiles ? Supprime-les. »
- « Teste mes rappels de factures sans rien envoyer, et montre-moi les e-mails qui auraient été envoyés. »
- « Transforme cette conversation en une tâche qui s’exécute chaque lundi à 9 h. »
- « Exécute mon app Reading list chaque fois que ce flux a un nouvel article, avec le lien de l’article. »
- « Configure un CI doctor pour ~/code/shop sur GitHub Actions qui peut relancer les jobs instables. »
