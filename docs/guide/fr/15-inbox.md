# Boîte de réception et notifications

Les agents travaillent seuls, mais ils ont parfois besoin de vous : une approbation, une réponse, un formulaire, une clé ou votre accord avant l’envoi de quelque chose. Cette page présente la Boîte de réception, qui rassemble au même endroit tout ce qui attend votre réponse, quelle que soit la session ou la machine. Elle présente aussi sa Boîte d’envoi, où sont retenus les appels en attente de votre accord, et les notifications qui vous préviennent quand une session se termine, échoue ou a besoin de vous, dans l’app, sur votre ordinateur ou sur un téléphone, même si l’app est fermée.

![La Boîte de réception : ce qui attend votre réponse, de toutes les sessions](images/inbox.webp)

## Ouvrir la Boîte de réception

La Boîte de réception est la tuile **Boîte de réception** de la barre d’icônes, avec l’icône de bac, juste sous **Apps** et au-dessus de **Recherche** (ces tuiles restent à leur place quand vous déplacez les autres). Un nombre sur son coin indique combien d’éléments attendent votre réponse. Sur un téléphone, ouvrez d’abord la barre latérale avec **Menu** (≡) : le bouton se trouve en haut du panneau. Vous pouvez aussi saisir « boîte de réception » dans le champ de recherche (Ctrl+K, ⌘K sur un Mac). [Ouvrir la Boîte de réception](/inbox).

Son en-tête indique combien d’éléments attendent votre réponse (« 3 en attente de votre réponse »). Les plus récents sont en haut. La liste se met à jour toute seule quand des sessions commencent ou cessent d’attendre, et elle se rafraîchit toutes les quelques secondes pendant que vous la regardez.

Quand rien n’attend, elle affiche « Rien n’attend votre réponse ».

La page d’accueil montre aussi ce qui attend votre réponse, en premier dans **Pendant votre absence**, sous la zone de message, avec ce qui s’est terminé et ce qui s’est exécuté tout seul depuis votre dernière visite (voir [Pendant votre absence](/guide/start#while-you-were-away)).

## Ce qui apparaît dans la Boîte de réception

Tout ce pour quoi un agent attend votre réponse, de toutes les sessions de cette machine, y compris celles que démarrent les tâches planifiées et les apps, ainsi que celles de vos autres machines :

- **Les approbations** : une commande que l’agent veut exécuter, un fichier qu’il veut modifier, un outil qu’il veut utiliser.
- **Les questions** que l’agent vous pose, et les **plans** en attente de votre approbation.
- **Les formulaires** qu’un service vous demande de remplir en cours de route (« Notion vous demande de remplir un formulaire »), ou une page qu’il vous demande d’ouvrir.
- **Un navigateur qui a besoin de vous** : « A besoin de vous dans le navigateur : … » (pour se connecter ou passer une vérification), « Arrêté avant de payer ou de commander : … », ou « Veut ouvrir …, sur cette machine ou son réseau ».
- **Une clé demandée par un agent** : « Demande une clé : OPENWEATHER_KEY », avec la raison pour laquelle il en a besoin.
- **Une compétence suggérée par un agent** : « Suggère une nouvelle compétence : … » ou « Suggère une modification de la compétence … », avec sa raison.
- **Une session qui vous attend ailleurs** : « Vous attend dans VS Code » (ou dans un terminal), pour les sessions exécutées hors de l’app.
- **Une question d’app** : une exécution de l’une de vos apps en attente à une étape **Interroger une personne**.
- **Un commentaire de quelqu’un avec qui vous avez partagé un projet ou un élément** : « Maria a commenté « Thèse, chapitre 3 » », avec ce qu’elle a écrit, jusqu’à ce que vous ou un agent répondiez, ou que le commentaire soit résolu. **Ouvrir** ouvre le document, l’image, la vidéo ou le son.
- **Les appels retenus dans la Boîte d’envoi** : un agent a appelé l’outil d’un compte connecté que vous avez réglé sur Demander d’abord, par exemple un outil qui envoie un e-mail. Ils passent en premier, sous **Boîte d’envoi**.

Chaque élément indique dans quelle session il attend (avec l’icône de l’agent) et depuis combien de temps.

## Répondre aux approbations, questions et formulaires directement dans la Boîte de réception

Les approbations, les questions et les formulaires s’affichent sous la même carte que dans la session, vous pouvez donc y répondre sans l’ouvrir. Au-dessus de chaque carte figure le nom de la session ; cliquez dessus pour l’ouvrir. La première ligne de la carte indique ce qui est demandé et depuis combien de temps cela attend.

- **Une approbation** montre ce que l’agent veut faire : la commande, la modification d’un fichier (sous forme de différences) ou les données d’entrée de l’outil. Cliquez sur l’un des boutons : **Autoriser**, un choix « toujours » quand l’agent en propose un (comme **Autoriser toutes les modifications pour cette session** ou **Autoriser pour cette session**), ou **Refuser**. Cliquer sur **Refuser…** ouvre d’abord une zone, « Facultatif : dites à l’agent quoi faire à la place » ; écrivez un mot à l’agent si vous le souhaitez, puis cliquez sur **Refuser**.
- **Un plan** (de Claude Code) montre le plan avec **Approuver, accepter automatiquement les modifications**, **Approuver, demander avant les modifications** et **Continuer à planifier**.
- **Une question** montre ses choix : choisissez-en un (ou plusieurs, quand c’est permis), ou saisissez votre propre réponse sous **Autre — saisissez votre propre réponse** ; vous pouvez joindre un fichier à une réponse. Cliquez ensuite sur **Envoyer les réponses**, ou sur **Passer**.
- **Un formulaire d’un service** montre le message du service et ses champs. Remplissez-les, puis cliquez sur **Envoyer**, ou sur **Décliner**, ou sur **Pas maintenant**. Un formulaire sans rien à remplir demande **Autoriser** au lieu de **Envoyer**. Quand le service vous demande d’ouvrir une page, **L’ouvrir** l’ouvre dans un nouvel onglet.

Une fois la réponse donnée, l’élément quitte la Boîte de réception et l’agent poursuit son travail. Le sens de chaque choix est expliqué dans [Approuver ou refuser ce que l’agent veut faire](/guide/sessions#approve-or-deny-what-the-agent-wants-to-do) et [Répondre aux questions et approuver les plans](/guide/sessions#answer-questions-and-approve-plans).

## La Boîte d’envoi : les appels en attente de votre accord

Quand un agent appelle l’outil d’un compte connecté que vous avez réglé sur **Demander d’abord** ([Apps connectées, clés et outils](/guide/connections#ask-first-calls-that-wait-for-your-ok)), l’appel n’est pas effectué. Il attend en haut de la Boîte de réception, sous **Boîte d’envoi**, avec une carte par appel, jusqu’à ce que vous l’envoyiez ou le supprimiez. L’agent ne vous a pas attendu : on lui a immédiatement indiqué que l’appel attend votre accord.

Chaque carte montre :

- le compte et l’outil (« Gmail · send_email »), et depuis combien de temps l’appel attend ;
- **En attente de votre accord**, l’icône de l’agent et la session d’où vient l’appel (cliquez sur le nom de la session pour l’ouvrir), ainsi que la tâche planifiée, quand c’est l’exécution d’une tâche qui a fait l’appel ;
- ce que fait l’outil, dans les mots du service ;
- l’appel sous forme de formulaire que vous pouvez modifier. Un e-mail affiche **À**, **Cc**, **Objet** et **Corps** ; un message de discussion, sa destination et son **Texte** ; une publication, son **Texte**. Les autres outils montrent leurs propres champs, avec un * rouge sur ceux dont l’outil a besoin. Plusieurs adresses se saisissent dans un seul champ, séparées par des virgules.

Ensuite :

- **Envoyer** effectue l’appel avec le contenu actuel du formulaire. Hydor l’effectue lui-même, même si l’agent a terminé depuis longtemps. La carte quitte la Boîte de réception et un message indique que l’appel a été envoyé.
- **Supprimer** jette l’appel : il n’est jamais effectué.
- **Tout envoyer**, au-dessus des cartes d’une session quand elle en contient plusieurs, les envoie toutes telles quelles, dans l’ordre où elles ont été retenues.

Si le service répond par une erreur, la carte reste, avec **Il n’est pas parti :** et la raison, ainsi que **Renvoyer**. Les appels retenus patientent à travers les redémarrages et sont conservés 30 jours.

Dans la session, une ligne marque l’endroit où l’appel a été retenu : **Attend votre accord dans la Boîte d’envoi**, avec **Ouvrir la Boîte d’envoi**. Une fois votre décision prise, elle indique **Envoyé avec votre accord**, avec le début de la réponse du service, ou **Abandonné : non envoyé**. Quand vous écrivez de nouveau à la session, son agent apprend ce qu’il est advenu de ses appels.

Un appel retenu vous notifie comme une approbation, dans l’app, sur votre ordinateur et sur votre téléphone : « Attend votre accord dans la Boîte d’envoi : … ». Touchez la notification pour ouvrir la Boîte de réception, où vous pouvez lire le brouillon, le modifier et l’envoyer depuis le téléphone.

## Ouvrir le reste là où il attend

Les autres éléments se traitent là où ils attendent. Chacun a une icône, ce qui est demandé, une ligne de détail, la session et l’heure, ainsi que **Ouvrir**, qui vous y emmène :

- **Un navigateur qui a besoin de vous** ouvre la session, où son navigateur s’affiche au-dessus de la zone de message pour que vous en preniez le contrôle ([Recherche et navigateur](/guide/web)).
- **Une clé** ou **une connexion** ouvre la session avec la carte où vous la saisissez ([Apps connectées, clés et outils](/guide/connections)).
- **Une suggestion de compétence** ouvre la session avec sa carte à approuver ou à décliner, ou **Paramètres → Bibliothèque de compétences** quand cette session n’existe plus ([Compétences](/guide/skills)).
- **Une session en attente dans VS Code ou un terminal** s’ouvre ici pour que vous voyiez ce qu’elle attend ; répondez-y dans le programme où elle s’exécute.
- **Une question d’app** ouvre son exécution, où une carte la pose : **Oui** ou **Non**, ou son formulaire et **Envoyer la réponse** ([Apps](/guide/apps#apps-with-steps)).

## Ce qui attend sur vos autres machines

Si vous avez ajouté d’autres machines exécutant Hydor ([Utiliser d’autres machines depuis une seule app](/guide/devices#use-other-machines-from-one-app)), la Boîte de réception interroge chacune de celles qui sont en ligne et liste aussi ce qui y attend. La liste est alors regroupée par machine, sous le nom de chacune ; **affichée maintenant** marque la machine que l’app affiche en ce moment. Vous répondez aux approbations, aux questions et aux formulaires d’une autre machine directement ici, comme pour celle-ci.

Une machine qui ne peut pas envoyer sa liste (une machine qui exécute une version plus ancienne, par exemple) s’affiche sur une seule ligne, « 2 sessions vous attendent là-bas », avec **Ouvrir** pour aller sur cette machine.

## Le nombre sur le bouton de la Boîte de réception

Un petit nombre sur le coin du bouton de la Boîte de réception compte les sessions qui attendent votre approbation ou votre réponse : sur cette machine, et sur vos autres machines en ligne. Au-delà de 99, il affiche **99+**. Pointez le bouton pour lire « Boîte de réception : 3 en attente de votre réponse ».

Le nombre compte des sessions, pas des éléments : une session avec deux approbations ne compte qu’une fois. Les appels retenus dans la Boîte d’envoi ajoutent chacun un. Certains éléments de la Boîte de réception ne s’y ajoutent pas : une clé demandée, un navigateur qui a besoin de vous, une compétence à examiner.

## Le nombre dans l’onglet du navigateur

Tant que des sessions de la machine affichée par l’app attendent votre approbation ou votre réponse, le titre de l’onglet du navigateur commence par leur nombre : « (2) Hydor ». Vous le voyez depuis d’autres onglets, sans avoir à revenir.

## Comment l’app vous prévient

Quand une session se termine, échoue ou a besoin de vous, l’app vous prévient de la manière qui convient à l’endroit où vous êtes :

- **L’app est affichée** : une petite carte glisse en bas de l’écran (en bas à droite sur un ordinateur). Elle montre l’icône de l’agent avec un point de couleur (vert quand c’est terminé, ambre quand l’agent a besoin de vous, rouge en cas d’échec), le nom de la session, et l’état avec le début de la réponse. Cliquez dessus pour ouvrir la session, ou sur ✕ pour la fermer. Elle disparaît au bout de quelques secondes, mais reste tant que le pointeur est dessus. Un nouvel avis sur la même session remplace l’ancienne carte.
- **L’app est ouverte dans un onglet que vous ne regardez pas** : une notification de votre système, une fois que vous avez activé **Notifier cet appareil**.
- **L’app est fermée**, ou le téléphone est dans votre poche : une notification push, une fois que vous avez activé **Notifier cet appareil** sur cet appareil.
- **Une app de bureau (Mac, Windows, Linux)** : la notification propre à votre ordinateur (sur un Mac, dans le Centre de notifications), que la fenêtre de l’app soit au premier plan, derrière d’autres fenêtres ou fermée (l’app reste dans la barre des menus, la zone de notification ou la barre d’état système), et même quand l’app a démarré à l’ouverture de session sans ouvrir sa fenêtre. Cliquez dessus pour ouvrir cette session dans la fenêtre de l’app. Une nouvelle notification sur la même session remplace l’ancienne. Les petites cartes dans la fenêtre ne s’affichent que lorsque votre système n’affiche pas les notifications de l’app. Quand la fenêtre n’est pas visible (fermée, masquée, réduite ou derrière une autre app), l’icône de l’app compte aussi les sessions qui ont de nouveaux avis, chacune une seule fois : un nombre sur l’icône du Dock sur un Mac, sur le bouton de la barre des tâches sous Windows (tant que la fenêtre est ouverte : fermée dans la zone de notification, il n’y a pas de bouton dans la barre des tâches), et sur le lanceur des bureaux Linux qui affichent des compteurs (comme le dock d’Ubuntu et KDE). Il s’affiche même avec Ne pas déranger ou un Mode de concentration activé, et disparaît dès que vous mettez la fenêtre au premier plan. Sur un Mac, il s’affiche tant que Hydor peut mettre une pastille sur son icône : **Réglages Système → Notifications → Hydor → Pastille sur l’icône de l’app** (activé par défaut une fois que vous avez autorisé les notifications de Hydor).

Vous ne recevez aucun avis pour la session que vous regardez en ce moment. Une session n’est terminée que lorsque plus rien de ce qu’elle a lancé ne tourne : tant que ses tâches d’arrière-plan (une commande comme un serveur de développement, un moniteur) ou ses sous-agents travaillent encore, l’avis attend, et il arrive quand ils se terminent. Une session mise en veille qui a besoin de vous revient de sa veille immédiatement. En mode Mains libres, l’app dit aussi à voix haute quand la session qu’elle suit se termine ou a besoin de vous ([Documents, images, vidéos et voix](/guide/documents-voice)).

## Ce que dit chaque notification

Le titre d’une notification est le nom de la session (abrégé s’il est long). Son texte dit ce qui s’est passé :

- **Terminées**, puis le début de la dernière réponse de l’agent. Elle arrive après un tour qui a duré au moins dix secondes, de sorte qu’un échange rapide reste silencieux.
- Quand la session a besoin de vous, ce dont elle a besoin :
  - pour une simple approbation par oui ou par non, ce que l’agent veut faire, avec sa première ligne (« Exécuter une commande : npm test ») ;
  - sinon « A besoin de votre approbation » ou « A une question pour vous » ;
  - pour son navigateur, ce dont le navigateur a besoin : « A besoin de vous dans le navigateur : … », « Arrêtée avant de payer : … », « Demande d’ouvrir … » ou « La page demande : … » ;
  - pour une session dans VS Code ou un terminal, « Vous attend dans VS Code », envoyée seulement si elle attend encore une minute plus tard (vous êtes probablement juste à côté) ;
  - pour un appel retenu dans la Boîte d’envoi, « Attend votre accord dans la Boîte d’envoi : », le compte et l’outil, et le destinataire. Toucher la notification ouvre la Boîte de réception.
- **Échec**, puis l’erreur.

Une session qui travaille sur un objectif envoie une seule notification pour chaque chose qui a besoin de vous ou qui y met fin, au lieu d’une notification « Terminées » après chaque tour ([Objectifs](/guide/goals)). Les notifications « Terminées » ne sont retenues que pendant que l’objectif est en cours de travail, pas pendant qu’il vous attend :

- « Les vérifications de l’objectif sont prêtes pour vous », quand l’agent a proposé les vérifications et attend votre clic sur **Début**, et « Une vérification n’a pas pu s’exécuter : … », avec laquelle et pourquoi, quand le clic sur **Début** a trouvé une vérification impossible à exécuter ;
- la question de l’agent, quand il demande dans quelle direction continuer ; « L’objectif a besoin de vous : … », quand il est bloqué par quelque chose que vous seul pouvez fournir ; et « L’objectif a besoin de vous : “ … ” est-il respecté ? », pour une vérification que vous seul pouvez confirmer ;
- « L’objectif attend : la file d’attente de la session est en pause : appuyez sur Reprendre dans la session », quand des messages attendent dans une file suspendue ;
- « Objectif en pause : … » avec la raison. Ces cas mettent l’objectif en pause avec une notification : son message n’a pas pu être envoyé ; les fichiers n’ont pas pu être enregistrés (avant la mesure, avant les vérifications d’un tour ou avant de les remettre en place : « … le tour 4 n’a donc pas été annulé. Reprenez pour le vérifier à nouveau. ») ; la remise en place des fichiers d’un tour ne s’est pas terminée (« La remise en place des fichiers du tour 4 ne s’est pas terminée, les fichiers peuvent donc être remis en place en partie. Tout ce qui était dans le dossier est enregistré : Garder quand même… sur le tour 4 le ramène. Reprendre continue à partir des fichiers tels qu’ils sont. ») ; un tour n’a pas pu être vérifié parce que la session a continué à travailler dans le dossier pendant l’exécution de ses vérifications, trois fois de suite (« Le tour 4 n’a pas pu être vérifié : … Reprenez pour le vérifier à nouveau. ») ; une vérification qui était satisfaite ne peut plus s’exécuter (« “Les tests passent” n’a pas pu s’exécuter : … ») ; la vérification finale n’a pas pu s’exécuter (« Le relecteur n’a pas pu être joint, la vérification finale ne s’est donc pas exécutée. Reprenez pour réessayer. ») ; l’agent s’est arrêté à la limite d’utilisation de votre forfait et l’app ne le relancera pas d’elle-même ; un redémarrage de l’app a interrompu le tour de l’agent une deuxième fois ; ou l’app a redémarré pendant l’envoi d’un message de la boucle et un nouvel envoi n’a rien changé (« Le message de la boucle n’est pas parvenu à l’agent… »). Une pause que vous déclenchez vous-même, une après l’arrêt de l’agent (« Vous avez arrêté l’agent. ») et une après un tour en échec s’affichent dans la barre sans notification ;
- « Objectif arrêté à sa limite : … », avec la limite (« Il a utilisé ses 12 tours », « Il a dépensé 10,00 $ sur 10,00 $ ») ;
- « Objectif atteint : … », avec l’objectif ;
- « L’objectif n’a pas été défini : … », quand une session que vous avez démarrée avec **But** n’a pas pu en avoir un (un sous-agent Hydor, le mode Planifier, aucun message à prendre comme objectif).

L’exécution d’une tâche planifiée dit comment elle s’est passée, en une ligne écrite par l’agent. Une exécution sans rien de nouveau à signaler reste silencieuse, une exécution en échec vous le dit toujours, une exécution bloquée affiche « Bloquée : … », et une tâche mise en pause après plusieurs échecs de suite le dit aussi ([Tâches planifiées](/guide/tasks)).

Les notifications de vos autres machines passent par celle-ci, si bien qu’un seul appareil vous prévient pour toutes : le texte de la notification commence par le nom de la machine, et la carte dans l’app indique « sur » cette machine.

## Activer les notifications pour cet appareil

[Paramètres → App → Notifications](/settings?s=notifications) propose, dans son groupe **Cet appareil**, deux interrupteurs, réglés sur chaque appareil (chaque navigateur) pour lui-même, et un test :

- [**Notifier cet appareil**](/settings?s=notifications&find=Notify%20this%20device) : une notification quand une session se termine, échoue ou attend votre réponse, même avec l’app fermée. L’activer demande au navigateur l’autorisation d’afficher des notifications. Chaque appareil l’active pour lui-même : votre téléphone et votre ordinateur séparément. Dans une app de bureau (Mac, Windows, Linux), c’est toujours activé : les notifications arrivent comme des notifications Mac, Windows ou de votre bureau tant que l’app tourne, même avec sa fenêtre fermée. Sur un Mac, macOS demande une fois si Hydor peut envoyer des notifications : autorisez-le, puis utilisez **Réglages Système → Notifications → Hydor** pour choisir leur affichage. Quand le système ne les affiche pas, la ligne le dit, et en attendant elles s’affichent dans l’app ; son **(i)** indique où les autoriser (sous Windows, **Paramètres → Système → Notifications**). Activez l’interrupteur pour les autoriser : les Réglages Système s’ouvrent sur les notifications de Hydor (sous Windows, Paramètres → Système → Notifications), et quand vous revenez dans l’app, une notification de test montre qu’elles fonctionnent.
- [**Son**](/settings?s=notifications&find=Sound) : un court carillon à chaque notification pendant que l’app est ouverte, ascendant quand une session se termine et descendant quand elle a besoin de vous ou a échoué. Désactivé au départ ; l’activer joue le carillon une fois. Dans une app de bureau, le carillon ne retentit qu’avec les notifications que l’app affiche dans sa fenêtre ; les notifications du système font leur propre son.
- [**Envoyer un test**](/settings?s=notifications&find=Send%20a%20test) (la ligne **Essayer**, affichée une fois **Notifier cet appareil** activé) : envoie une notification à chaque appareil qui a activé les notifications. Elle dit « Les notifications fonctionnent sur cet appareil. » et s’affiche quand l’app n’est pas à l’écran, donc passez à une autre fenêtre pour la voir. Un message vous indique à combien d’appareils elle a été envoyée, ou « Aucun appareil ne l’a reçue. » Dans une app de bureau, **Essayer** s’affiche dès le départ : **Envoyer un test** affiche aussitôt une notification sur cet ordinateur, même avec l’app au premier plan. Si le système ne l’affiche pas, un message dit « Elle ne s’est pas affichée. Autorisez les notifications pour Hydor dans les paramètres du système. »

Pour la configurer sur un téléphone :

1. Ouvrez l’app sur le téléphone. Elle doit pour cela être servie en HTTPS : [Paramètres → App → Utiliser sur votre téléphone](/settings?s=phone) le fait de façon privée avec Tailscale, et son code QR ouvre l’app sur le téléphone pour les étapes ci-dessous ([Utiliser Hydor sur votre téléphone avec Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale)).
2. Sur un iPhone ou un iPad, ajoutez d’abord l’app à votre écran d’accueil (**Part** → **Ajouter à l’écran d’accueil**) et ouvrez-la à partir de là. Tant que ce n’est pas fait, le réglage l’indique et ne peut pas être activé.
3. Ouvrez **Paramètres → App → Notifications** et activez **Notifier cet appareil**. Autorisez les notifications quand le téléphone le demande.
4. Touchez **Envoyer un test**, puis quittez l’app pour la voir arriver.

Si le réglage indique que les notifications sont « Bloquées pour ce site dans les paramètres du navigateur », autorisez-les d’abord pour l’adresse de l’app dans les paramètres du navigateur, puis activez-les. S’il indique « Ce navigateur ne peut pas recevoir de notifications ici », c’est que le navigateur ne peut pas les recevoir à cette adresse, souvent parce que l’app est ouverte en HTTP simple plutôt qu’en HTTPS.

Si l’interrupteur se désactive un jour, c’est que le service push du navigateur a abandonné cet appareil : réactivez-le. Quand un téléphone est éteint ou hors ligne, une notification l’attend pendant un jour au maximum. Une notification plus récente à propos de la même session remplace une plus ancienne sur l’appareil.

Pour les arrêter, désactivez **Notifier cet appareil** sur cet appareil.

## Approuver ou refuser depuis la notification

Quand une session attend une simple approbation par oui ou par non (une commande, une modification de fichier ou un outil ; pas une question, un formulaire ou un plan), sa notification comporte deux boutons avec les mots propres à la carte, par exemple **Autoriser** et **Refuser**, là où le navigateur affiche des boutons sur les notifications.

- Touchez-en un pour répondre sans ouvrir l’app. Une notification discrète le confirme, par exemple « Autoriser : Exécuter une commande ».
- Si la réponse ne peut pas aboutir (le navigateur a été déconnecté, ou vous avez déjà répondu ailleurs), la session s’ouvre pour que vous y répondiez.
- Touchez la notification elle-même pour ouvrir la session, dans une fenêtre de l’app déjà ouverte s’il y en a une.
- Les notifications d’une app de bureau n’ont pas de boutons : cliquez sur l’une d’elles pour ouvrir la session, et répondez-y.
- Un appel retenu dans la Boîte d’envoi n’a pas de boutons non plus, afin que vous lisiez d’abord ce qui partirait : touchez la notification et envoyez-le depuis la Boîte de réception.

Les approbations de vos autres machines peuvent être traitées de la même façon : la réponse part vers cette machine en passant par celle-ci.

## Demander à un agent

Les agents peuvent lire ce qui vous attend et envoyer une notification de test. Ils ne peuvent pas répondre à votre place aux approbations des autres sessions. Quelques idées à essayer :

- « Qu’est-ce qui m’attend en ce moment ? Le plus urgent d’abord. »
- « Quelles sessions me demandent une clé, et pour quoi faire ? »
- « Qu’y a-t-il dans ma Boîte d’envoi ? Lis-moi les e-mails avant que je les envoie. »
- « Résume ce que chaque session en attente me demande, en une ligne chacune. »
- « Envoie une notification de test pour que je vérifie que mon téléphone les reçoit. »
