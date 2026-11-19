# Téléphones, autres machines et partage

Hydor fonctionne depuis n’importe quel navigateur : sur votre téléphone, sur un autre ordinateur, et sur plusieurs machines qui l’exécutent chacune. Ce sujet couvre l’utilisation sur un téléphone (atteint de façon privée via Tailscale, configuré en quelques clics), l’accès sécurisé depuis l’extérieur, le travail avec d’autres machines depuis une seule app, le partage d’une session avec un lien en lecture seule, la possibilité pour des agents situés ailleurs de démarrer et de piloter des sessions ici, et l’ajout des comptes GitHub ou Gitea avec lesquels les pull requests sont ouvertes.

![L’app sur un téléphone : une session qui a besoin de vous](images/devices.webp)

## Utiliser l’app sur un téléphone

L’app sur un téléphone est la même que sur un ordinateur, disposée pour un petit écran (une fenêtre étroite sur un ordinateur obtient aussi cette disposition). Ce qui change :

- **La barre latérale devient un tiroir.** Touchez **Menu** (≡) en haut à gauche d’une page ou d’une session pour l’ouvrir. Elle remplit l’écran, avec vos sessions, la Boîte de réception et les outils ; touchez une session ou un outil pour y aller, ou **Fermer le menu** (✕) pour revenir.
- **Les sélecteurs s’ouvrent en feuilles.** Sur la page de démarrage, les menus du programme, du modèle, du dossier, de l’agent et **Options** montent depuis le bas de l’écran, au-dessus du clavier, la page étant assombrie derrière ; un paramètre sous **Options** s’ouvre par-dessus sa feuille. Dans une session, la pastille du modèle (et de son effort et de ses autorisations) dans la zone de message ouvre une feuille de la même façon. Les boîtes de dialogue montent aussi depuis le bas.
- **Une chose à la fois.** Les Paramètres forment une liste, chaque section ayant sa propre page. Fichiers montre un seul dossier, nommé en haut (touchez le nom pour accéder aux emplacements, **‹** pour le dossier parent), puis un fichier sur sa propre page avec **Retour**. La page Git liste vos dépôts, puis en ouvre un avec une flèche de retour.
- **Le toucher à la place de la souris.** Dans Fichiers, le ⋯ d’une ligne ouvre son menu, et un appui long sur une ligne la sélectionne, pour agir sur plusieurs à la fois. L’éditeur renvoie les longues lignes à la ligne. La page Terminal ajoute une rangée de touches qui manquent aux téléphones (Ctrl, Alt, Échap, Tab, les flèches et d’autres).

Pour accéder à l’app sur votre téléphone, elle doit d’abord être accessible depuis l’extérieur de cet ordinateur. [Paramètres → App → Utiliser sur votre téléphone](/settings?s=phone) le fait en quelques clics, de façon privée, avec Tailscale : voir [Utiliser l’app sur votre téléphone avec Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale).

### L’ajouter à votre écran d’accueil

Installée sur votre écran d’accueil, l’app s’ouvre en plein écran avec sa propre icône, comme n’importe quelle autre app. Pour cela, l’app doit être servie en HTTPS, ce que fait Utiliser sur votre téléphone. Ouvert sur le téléphone, [Utiliser sur votre téléphone](/settings?s=phone&find=Add%20to%20Home%20Screen) affiche les étapes pour le téléphone que vous tenez en main sous **Sur ce téléphone → Ajouter à l’écran d’accueil**, avec un bouton **Installer** lorsque le navigateur en propose un.

- **iPhone ou iPad** : ouvrez l’app dans le navigateur, touchez **Part**, puis **Ajouter à l’écran d’accueil**. Ouvrez ensuite Hydor depuis sa nouvelle icône.
- **Android** : ouvrez l’app dans votre navigateur et utilisez l’option de son menu pour installer l’app ou l’ajouter à l’écran d’accueil.

### Partager vers Hydor depuis d’autres apps

Une fois installé, Hydor apparaît dans la feuille de partage de votre téléphone ou de votre ordinateur, comme une app de messagerie. Partagez une photo, un PDF, une page web ou quelques lignes de texte depuis n’importe quelle autre app, choisissez **Hydor**, et la page de démarrage s’ouvre avec ce que vous avez partagé déjà dans sa zone de message : les mots et le lien en texte, les fichiers en pièces jointes. Ajoutez un mot sur ce qu’il faut en faire, choisissez l’agent si vous le souhaitez, et envoyez.

- **Android** : fonctionne dans Chrome, Edge et les autres navigateurs fondés sur Chromium, une fois l’app installée depuis le menu du navigateur (**Installer l’application** ou **Ajouter à l’écran d’accueil**).
- **Un ordinateur** : fonctionne dans Chrome et Edge une fois l’app installée (le bouton d’installation dans la barre d’adresse, ou le menu du navigateur → **Installer Hydor**), depuis les apps qui partagent via la feuille de partage du système.
- **iPhone et iPad** : Safari ne permet pas aux apps web de recevoir des partages. Envoyez plutôt une photo ou un fichier à vos agents depuis une app de discussion (voir [Ce que peut faire une discussion](/guide/devices#what-a-chat-can-do)). Pour du texte et des liens, un raccourci fait l’affaire : dans l’app Raccourcis, créez-en un qui apparaît dans la feuille de partage et accepte du texte et des URL, ajoutez **Encoder l’URL** pour son entrée, puis **Ouvrir les URL** avec l’adresse de votre app suivie de `/?prompt=` et du texte encodé (comme `https://hydor.example.com/?prompt=` et le résultat). Il ouvre la page de démarrage dans Safari avec le texte dans la zone.

Un partage exige que vous soyez connecté sur cet appareil : un partage effectué en étant déconnecté n’arrive pas jusqu’à Hydor, et la page de démarrage le signale. Jusqu’à 25 Mo de fichiers accompagnent un partage, comme avec la zone de message, enregistrés là où la zone de message conserve ses pièces jointes.

### Recevoir des notifications sur votre téléphone

Une notification peut arriver sur votre téléphone lorsqu’une session se termine, échoue ou attend votre réponse, même si l’app est fermée.

1. Sur le téléphone, ouvrez [Paramètres → App → Notifications](/settings?s=notifications&find=Notify%20this%20device).
2. Activez **Notifier cet appareil** et autorisez les notifications lorsque le navigateur le demande. Chaque appareil l’active pour lui-même.
3. **Envoyer un test** vérifie que cela fonctionne (il s’affiche lorsque l’app n’est pas à l’écran).

Ouvert sur le téléphone, [Utiliser sur votre téléphone](/settings?s=phone) propose le même interrupteur **Notifier cet appareil** sous **Sur ce téléphone**, après **Ajouter à l’écran d’accueil**, et son **Envoyer un test** ne va qu’à ce téléphone.

Sur un iPhone ou un iPad, ajoutez d’abord l’app à votre écran d’accueil et ouvrez-la depuis là : sinon, le navigateur ne peut pas les recevoir. Si les notifications sont bloquées pour le site, autorisez-les d’abord dans les paramètres du navigateur. Une approbation simple par oui ou non s’accompagne de **Approuver** et **Refuser** sur la notification elle-même, lorsque le téléphone affiche des boutons. Plus de détails dans [Boîte de réception et notifications](/guide/inbox).

## Parler à vos agents depuis Telegram, Discord et Slack

Depuis une discussion dans Telegram, Discord ou Slack, sur n’importe quel téléphone ou ordinateur, vous pouvez démarrer des sessions (y compris avec l’un de vos propres agents), leur envoyer des photos, des fichiers et des messages vocaux, lire leurs réponses et répondre à ce que les agents demandent. Chacun passe par un bot ou une app à vous, configuré dans [Paramètres → App → Apps de discussion](/settings?s=chat). Hydor s’y connecte de lui-même (il demande à Telegram les nouveaux messages, et ouvre un WebSocket vers la Gateway de Discord et vers le Socket Mode de Slack), si bien qu’aucun d’eux n’a besoin que l’app ait une adresse sur internet.

### Connecter un bot ou une app

Ouvrez [Apps de discussion](/settings?s=chat) et appuyez sur la ligne de celui que vous voulez dans le groupe **Bots** (elle indique **Configuration** tant qu’il n’est pas connecté) : ses étapes s’ouvrent en dessous. Ce que vous collez est conservé dans le Coffre, chiffré, et n’apparaît plus jamais dans l’app.

- **Telegram** : dans Telegram, ouvrez @BotFather, envoyez `/newbot` et donnez un nom et un nom d’utilisateur au bot. Collez le jeton qu’il vous répond, du type `123456789:AA…`, dans la zone de la ligne [Telegram](/settings?s=chat&find=Telegram), et appuyez sur **Connecter**.
- **Discord** : dans le Developer Portal (discord.com/developers/applications), créez une **New Application**. Sous **Bot**, appuyez sur **Reset Token** et copiez-le, puis activez **Message Content Intent** pour que le bot puisse lire ce que vous écrivez. Collez le jeton dans la ligne [Discord](/settings?s=chat&find=Discord) et appuyez sur **Connecter**. Ajoutez ensuite le bot à l’un de vos serveurs avec sa ligne **Ajouter le bot à un serveur** (Discord ne vous laisse écrire qu’à un bot avec lequel vous partagez un serveur, un petit serveur à vous suffit donc). L’invitation demande View Channels, Send Messages et Read Message History, et Hydor fait connaître ses commandes slash.
- **Slack** : sur api.slack.com/apps, choisissez **Create New App → From a manifest**, sélectionnez votre espace de travail et collez le manifeste que copie **Copier le manifeste** (dans les étapes de la ligne [Slack](/settings?s=chat&find=Slack), et dans une ligne à part une fois connecté) : il active Socket Mode, s’abonne aux messages directs et aux mentions, ajoute la commande `/hydor` et demande les scopes de bot `app_mentions:read`, `chat:write`, `commands`, `files:read` (pour les fichiers que vous lui envoyez), `im:history`, `reactions:write` et `users:read`. Sous **Basic Information → App-Level Tokens**, générez un jeton avec le scope `connections:write` (il commence par `xapp-`) ; sous **Install App**, installez l’app dans votre espace de travail et copiez le Bot User OAuth Token (il commence par `xoxb-`). Collez les deux et appuyez sur **Connecter**.

Une fois connecté, la première ligne en dessous indique le nom du bot et ce qu’il fait (« Listening for messages », ou ce qui ne va pas : Message Content Intent désactivé sur Discord, un scope manquant à l’app Slack). **Connecter** ne rejette un jeton que lorsque le service lui-même le refuse : quand Telegram, Discord ou Slack tarde à répondre ou est injoignable sur le moment (ce qui peut arriver dans les premières minutes d’un nouveau bot), Hydor garde le jeton, la ligne indique **Connexion…** et pourquoi, et le bot se connecte tout seul dès que le service répond. Un bot Telegram ne reçoit ses messages qu’à un seul endroit : lorsqu’une autre copie de Hydor ou un autre programme utilise le même bot, la ligne le signale. Le menu **⋯** de la ligne propose **Changer le jeton** (**Changer les jetons** pour Slack), qui en saisit d’autres (les discussions d’un autre bot sont à associer de nouveau), et **Déconnecter**, qui le retire de Hydor, le bot ou l’app restant à vous.

### Associer une discussion

Seules les discussions que vous associez peuvent utiliser le bot : toute autre personne qui le trouve se voit répondre qu’il appartient à quelqu’un.

1. Ouvrez la ligne et appuyez sur sa ligne [Associer une discussion](/settings?s=chat&find=Link%20a%20chat). Elle affiche un code qui ne fonctionne qu’une fois, pendant dix minutes.
2. Dans Telegram, appuyez sur **Ouvrir dans Telegram** puis sur **Début** dans la discussion qui s’ouvre, ou envoyez le code au bot. Dans Discord et Slack, envoyez le code au bot ou à l’app dans un message direct, ou mentionnez-le avec le code dans un canal. La discussion apparaît dans la ligne avec son nom.

Un canal est associé à la personne qui a envoyé le code : seule elle y est entendue, et seulement lorsqu’elle mentionne le bot. Le bouton corbeille (**Dissocier**) à côté d’une discussion lui retire l’usage de vos agents.

### Ce que peut faire une discussion

- **Envoyer ce que vous voulez faire** : cela va dans la session où se trouve la discussion, ou en démarre une nouvelle, dans un dossier de tâche à elle comme le fait la page de démarrage, avec l’agent défini dans la ligne **Les nouvelles sessions utilisent** (**Claude Code** ou **Codex**), en tant qu’agent à vous dans la ligne **Nouvelles sessions en tant que** si vous en avez choisi un. Ce que vous envoyez pendant que l’agent travaille attend dans la file de la session.
- **Photos, fichiers et messages vocaux** : envoyez-les comme à une personne, avec une légende si vous le souhaitez : la légende les accompagne, et plusieurs envoyés d’un coup (un album) arrivent ensemble. Chacun est enregistré dans le dossier de la session à laquelle il va, sous son propre nom (les photos et les messages vocaux sont nommés d’après le moment où ils sont arrivés, comme `photo-2026-11-15-0930.jpg`), et parvient à l’agent comme les pièces jointes de la zone de message : les images à regarder, les autres fichiers à ouvrir. Un message vocal parvient à l’agent sous forme de texte lorsque [Reconnaissance vocale sur le serveur](/settings?s=voice&find=Speech%20recognition%20on%20the%20server) est activée dans Paramètres → Capacités → Voix, et son enregistrement reste dans le dossier ; sans elle, l’enregistrement part comme fichier audio, et la discussion explique comment l’activer. Telegram permet aux bots de récupérer des fichiers allant jusqu’à 20 Mo, et Hydor accepte des fichiers allant jusqu’à 25 Mo depuis Discord et Slack : la discussion signale quand l’un est trop gros. Ce que contiennent les fichiers, ainsi que les messages transférés de quelqu’un d’autre, parviennent à l’agent marqués comme données extérieures, avec lesquelles travailler, jamais comme des instructions. Dans Slack, les fichiers nécessitent le scope `files:read` : une app créée à partir d’un ancien manifeste doit l’ajouter sous **OAuth & Permissions**, puis être installée de nouveau (la discussion l’indique lorsqu’un fichier ne peut pas passer).
- **Vos propres agents** : `/as` suivi du nom d’un agent démarre une nouvelle session en tant que l’un de vos [agents](/agents), comme `/as Comptable ajoute ceci à octobre` avec la photo d’un reçu. `/as` et le nom seuls font démarrer la prochaine nouvelle session de la discussion avec cet agent, et `/agents` (ou `/as` seul) les liste avec un bouton chacun, les vôtres en premier. Un agent qui garde une conversation à lui y fait entrer la discussion. Discord complète le nom de l’agent pendant que vous tapez `/as` ; dans Slack, écrivez `/hydor as Comptable …`. La ligne [Nouvelles sessions en tant que](/settings?s=chat&find=New%20sessions%20as) fait démarrer chaque nouvelle session de cette app de discussion avec l’un de vos agents.
- **La réponse** revient quand le tour de l’agent se termine, mise en forme pour l’app (la mise en forme de Telegram ; le Markdown de Discord, en messages de 2 000 caractères ; le mrkdwn de Slack, en blocs), en dix messages au plus lorsqu’elle est longue (le reste demeure dans la session). Telegram et Discord affichent « typing… » pendant que l’agent travaille ; Slack met un sablier sur votre message. **Ouvrir dans Hydor** ouvre la session dans l’app, lorsque l’app a une adresse sur internet ou est servie sur votre tailnet (voir [Utiliser l’app sur votre téléphone avec Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale)).
- **Ce que demande un agent** : une simple question oui ou non s’accompagne de boutons pour y répondre ; tout ce qui est plus complexe (un formulaire, un plan) s’accompagne d’un lien pour y répondre dans l’app.
- **Commandes** : `/new` démarre une nouvelle session (`/new` suivi de ce qu’elle doit faire la démarre aussitôt), `/as` et `/agents` en démarrent une avec l’un de vos agents (voir plus haut), `/sessions` liste les dernières pour en reprendre une, `/stop` arrête l’agent, `/status` indique dans quelle session se trouve la discussion et ce qu’elle fait, et `/help` les liste. Telegram les montre dans son menu de commandes, et Discord comme commandes slash ; dans Slack, elles viennent après `/hydor` (`/hydor new`, et `/hydor` avec d’autres mots est un message à la session) ; dans Discord et Slack, `!new`, `!as`, `!status` et les autres fonctionnent aussi tapées comme un message.
- **Notifications** : avec la ligne **Notifications de toutes les sessions** activée, comme c’est le cas par défaut, chaque session qui se termine, échoue ou a besoin de vous le signale dans vos discussions, pas seulement celles qu’une discussion a démarrées.

Les autocollants, les sondages et les positions n’arrivent pas jusqu’aux agents : la discussion demande plutôt des mots, des photos, des fichiers ou des messages vocaux.

## Accéder à l’app depuis un autre appareil

Par défaut, l’app ne répond que sur l’ordinateur où elle s’exécute (port 8790 de `127.0.0.1`). Quiconque peut l’atteindre et connaît le mot de passe peut y exécuter n’importe quelle commande en tant que votre utilisateur : traitez donc l’accès à l’app comme un accès SSH à l’ordinateur. Pour l’utiliser depuis votre téléphone ou un autre ordinateur, placez-la derrière HTTPS plutôt que d’ouvrir le port au réseau. Le moyen le plus simple est intégré : [Utiliser l’app sur votre téléphone avec Tailscale](/guide/devices#use-it-on-your-phone-with-tailscale), ci-dessous. HTTPS est aussi ce dont les téléphones ont besoin pour installer l’app et recevoir des notifications push.

### Utiliser l’app sur votre téléphone avec Tailscale

Tailscale est une app gratuite qui relie vos propres appareils dans un réseau privé qui leur est réservé, appelé tailnet. [Paramètres → App → Utiliser sur votre téléphone](/settings?s=phone) publie Hydor sur ce réseau, à une adresse du type `https://laptop.tail1234.ts.net`. Seuls les téléphones et ordinateurs connectés à votre compte Tailscale peuvent ouvrir cette adresse, jamais l’internet public, et l’app demande toujours son mot de passe. Elle n’active jamais Tailscale Funnel, qui rendrait l’app publique.

1. Installez Tailscale sur cet ordinateur et connectez-vous ([tailscale.com/download](https://tailscale.com/download)). La ligne **Tailscale sur cet ordinateur** de la section indique quand tout est prêt (« Connecté. Cet ordinateur est laptop sur you@example.com. »). Tant que ce n’est pas le cas, elle indique ce qui manque (non installé, non lancé, non connecté, désactivé) avec **Obtenir Tailscale** ou la seule chose à faire, ainsi que **Vérifier à nouveau**.
2. Appuyez sur [**La publier sur mes appareils**](/settings?s=phone&find=Serve%20it%20on%20my%20devices). La ligne **Adresse** affiche l’adresse de l’app, avec **Copier** et **Ouvrir**. L’app accepte cette adresse d’elle-même : il n’y a aucun fichier à modifier.
3. Installez aussi Tailscale sur votre téléphone, connecté au même compte.
4. Scannez le code QR sous [**Ouvrez-la sur votre téléphone**](/settings?s=phone&find=Open%20it%20on%20your%20phone) avec l’appareil photo du téléphone (ou saisissez l’adresse), puis connectez-vous avec le mot de passe de l’app.
5. Le téléphone s’ouvre sur **Utiliser sur votre téléphone**, avec **Sur ce téléphone** : **Ajouter à l’écran d’accueil** (sur un iPhone, dans Safari : Partager → **Ajouter à l’écran d’accueil**, ce dont les notifications ont besoin sur cet appareil ; sur Android, **Installer**, ou le menu de Chrome → **Installer l’application**), puis **Notifier cet appareil**, et **Envoyer un test**, qui envoie une notification à ce téléphone uniquement.

**Arrêter la publication** retire l’app de votre tailnet. Cela annule exactement ce qu’a fait **La publier sur mes appareils** : l’unique adresse publiée, et l’adresse ajoutée à celles que l’app accepte. Tout le reste de ce que vous publiez avec Tailscale reste inchangé. Si vous aviez déjà publié l’app avec Tailscale à la main, la section l’indique (« Configuré en dehors de cette page, avec Tailscale lui-même »), et **Arrêter la publication** la désactive aussi.

Tant que l’app est publiée, les liens qu’elle fournit commencent par cette adresse, et s’ouvrent donc aussi sur votre téléphone : le lien **Open in Hydor** d’une session dans une app de discussion, et les liens que les agents vous donnent vers des sessions et des pages conservées. Si `ALLOWED_ORIGINS` indique une adresse propre (voir [Autres moyens de l’atteindre](/guide/devices#other-ways-to-reach-it)), les liens continuent d’utiliser celle-ci.

Dans un terminal, `hydor machines phone` affiche les mêmes informations et dessine le code QR ; `hydor machines phone serve` et `hydor machines phone stop` font le reste (voir [Le terminal](/guide/terminal)).

### Quand quelque chose bloque

La section explique ce qui s’est passé en une phrase, avec la seule chose à faire :

- **Serve et les certificats HTTPS ne sont pas encore activés dans votre tailnet.** Tailscale fournit un lien qui les active : **Les activer** l’ouvre (vous vous connectez à Tailscale et confirmez une seule fois), puis **Réessayer**.
- **Sous Linux, Tailscale ne laisse que son opérateur modifier ce qu’il publie.** Exécutez une fois la commande indiquée dans un terminal (`sudo tailscale set --operator=$USER`, avec votre nom d’utilisateur), puis **Réessayer**.
- **Autre chose est déjà publié à cette adresse.** Hydor ne le remplace jamais : **Serve on port 8443** publie plutôt l’app à l’adresse `https://laptop.tail1234.ts.net:8443`.
- **Funnel est activé pour cette adresse.** Tailscale Funnel a été activé à la main, si bien que n’importe qui sur internet peut l’atteindre : la section le signale, avec la commande qui le désactive.
- **Les certificats HTTPS sont désactivés dans votre tailnet.** **Les activer** ouvre les paramètres DNS de Tailscale, où vous activez MagicDNS et les certificats HTTPS.

### Autres moyens de l’atteindre

Pour la configurer vous-même, tous ces moyens fonctionnent aussi :

- **Tailscale à la main** : sur cet ordinateur, `tailscale serve --bg 8790` publie l’app à l’adresse `https://<machine>.<tailnet>.ts.net`, accessible uniquement depuis vos propres appareils.
- **Cloudflare Tunnel** : dirigez un tunnel vers `http://localhost:8790`. Cloudflare Access peut ajouter une seconde connexion devant.
- **Votre propre reverse proxy**, tel que Caddy, qui envoie un nom d’hôte à vous vers `127.0.0.1:8790`.

Si le proxy modifie l’en-tête `Host`, indiquez à l’app l’adresse à laquelle les gens l’ouvrent : `ALLOWED_ORIGINS=https://agents.example.com`. Les réglages de ce type se placent dans `~/.config/hydor.env` (un `NOM=valeur` par ligne) pour une app installée comme service, ou dans `.env` pour Docker Compose ; redémarrez ensuite l’app.

Les aperçus de serveurs de développement utilisent un port à part (8791) ; voir [Voir un serveur de développement avec Preview](/guide/files-git#look-at-a-dev-server-with-preview).

### Le mot de passe protège tout

Le mot de passe protège tout. Un navigateur reste connecté pendant 30 jours après votre connexion. Les mots de passe erronés sont comptés par adresse d’origine, sur la dernière heure :

- Après trois, la page de connexion affiche aussi une image de cinq caractères à saisir dans **Caractères de l’image**, pour qu’un programme ne puisse pas continuer à deviner. Se tromper en les saisissant ne coûte rien, et **Nouvelle image** (la flèche ronde à côté) en affiche une autre.
- Après dix, cette adresse ne peut plus se connecter pendant une heure, même avec le bon mot de passe. La page indique le temps restant.
- Après dix depuis n’importe quelle adresse, tout le monde reçoit l’image ; après soixante, plus personne ne peut se connecter avant la fin de l’heure.

Derrière l’un des proxys ci-dessus, l’adresse comptée est celle du visiteur lui-même, telle que le proxy la transmet. Si vous vous bloquez vous-même, connectez-vous depuis un autre réseau (les données mobiles d’un téléphone, par exemple), attendez, ou définissez un nouveau mot de passe sur l’ordinateur lui-même, ce qui lève toutes les pauses. Voir [Changer votre mot de passe](/guide/app#change-your-password).

## Utiliser d’autres machines depuis une seule app

Si Hydor s’exécute sur plusieurs machines (un ordinateur de bureau, un serveur GPU, un ordinateur dans le cloud), vous pouvez toutes les utiliser depuis l’une d’elles. Chaque machine garde ses propres sessions, fichiers, terminaux, connexions et paramètres ; l’app que vous ouvrez affiche une machine à la fois, et la barre latérale permet de passer de l’une à l’autre.

Cela se configure dans [Paramètres → App → Machines](/settings?s=machines). Son groupe **Machines** (avec **Ajouter une machine** à côté de son titre) commence par cette machine (« This server », avec sa version), suivie de celles que vous avez ajoutées, chacune avec :

- un point : vert quand elle répond, gris pendant la connexion, rouge quand elle ne répond pas ;
- la manière de l’atteindre (`ssh gpu-box` ou son adresse) et son état : « Online », « 2 need you · 1 working », « Connecting… » ou « Not reachable » (avec la raison) ;
- **Ouvrir** (ses pages), et un menu **⋯** avec **Modifier** et **Retirer**. Une machine qui ne répond pas a aussi un bouton **Réessayer maintenant**.

### Ajouter une machine

1. **Sur l’autre machine**, installez Hydor et créez un jeton d’accès pour celle-ci : dans ses propres [Paramètres → App → Machines](/settings?s=machines&find=Access%20from%20other%20machines) → **Nouveau jeton**, ou en exécutant `node dist/server/cli.js access-token "my laptop"` dans son dossier Hydor. Copiez le jeton (il commence par `acm_`).
2. **Ici**, ouvrez [Paramètres → App → Machines](/settings?s=machines&find=Add%20a%20machine) et cliquez sur **Ajouter une machine**.
3. Donnez-lui un **Nom** (« GPU box »).
4. Sous **L’atteindre**, choisissez comment cette machine s’y connecte :
   - **Via SSH**, le plus simple : l’**Hôte SSH** (un nom de votre `~/.ssh/config`, ou `user@host`) et **Son port**, le port sur lequel Hydor écoute là-bas (8790). Cette machine ouvre la connexion avec ses propres clés SSH, qui doivent fonctionner sans demande de phrase secrète. L’autre machine continue d’écouter uniquement sur son propre `127.0.0.1` : rien n’y a besoin d’être ouvert.
   - **Par son adresse**, sur un réseau privé, un VPN comme Tailscale ou WireGuard, ou derrière HTTPS : par exemple `http://100.64.0.5:8790`. L’app de l’autre machine doit écouter là où cette machine peut l’atteindre (son réglage `HOST`).
5. Collez le **Jeton d’accès** et cliquez sur **Connecter**.

L’app vérifie que la machine répond avant de la conserver. Si ce n’est pas le cas, la boîte de dialogue en donne la raison (« Could not use GPU box: … ») et rien n’est ajouté.

### Passer d’une machine à l’autre

Une fois une machine ajoutée, une ligne portant le nom de la machine actuelle apparaît en haut de la barre latérale, au-dessus de **Nouvelle session**. Cliquez dessus pour voir toutes les machines avec leur état et une coche sur celle qui est affichée ; choisissez-en une pour passer à ses pages. **Ajouter ou modifier des machines** ouvre Paramètres → Machines.

Sur les pages d’une autre machine, la ligne est mise en évidence pour que vous sachiez où vous êtes. La ligne indique aussi ce qui s’est passé sur les machines que vous ne regardez pas, et sur la vôtre aussi quand vous êtes sur les pages d’une autre :

- Un nombre sur une pastille d’accent compte les sessions qui s’y sont terminées depuis la dernière fois que vous avez regardé ces machines. Pointez-le et il indique « 3 terminées sur d’autres machines ».
- Un point orange signifie que des sessions vous y attendent.

« Depuis la dernière fois que vous avez regardé » fonctionne machine par machine. Tant qu’une page affiche une machine, rien de ce qui s’y passe ne compte. Quand vous la quittez, les sessions qui s’y terminent ensuite comptent, jusqu’à ce que vous y regardiez de nouveau : en ouvrant l’une d’elles, ou simplement en passant à cette machine.

Dans le menu, chaque machine a une ligne comme « 2 terminées · 1 a besoin de vous · 3 en cours » (celle de votre propre machine aussi, quand vous êtes sur une autre). En dessous se trouvent les sessions qui s’y sont terminées, trois au maximum, chacune avec une coche, ou une croix si elle a échoué, et l’heure. Cliquez sur l’une d’elles pour ouvrir cette session sur sa machine. [Paramètres → Machines](/settings?s=machines) affiche les mêmes lignes.

Pendant qu’une machine se met à jour, sa ligne indique « Mise à jour · 45 % », ou l’étape où elle en est. Une machine qui redémarre dans la nouvelle version indique « Redémarrage… », avec un point orange qui pulse, au lieu de « Injoignable », et revient d’elle-même. Si une machine ne répond pas pour une autre raison, une page indique « … is not reachable » avec **Réessayer**, un bouton pour revenir à votre propre machine, et **Paramètres → Machines**.

Quand la barre latérale qui contient la ligne est masquée, la vignette **Sessions** de la barre d’icônes porte à la place un petit point : de la couleur d’accent quand quelque chose s’est terminé sur une autre machine, orange quand quelque chose vous y attend.

### Quand une machine a un Hydor plus ancien

L’app que vous ouvrez affiche les pages d’une autre machine dans sa propre version, quel que soit le Hydor que cette machine exécute. Une machine dotée d’un Hydor plus ancien peut manquer de ce dont ses pages ont besoin, et certaines peuvent cesser de fonctionner. Ainsi, quand vous choisissez une machine dont le Hydor est plus ancien que celui de cette app, une page s’affiche d’abord : « … has an older Hydor ». Elle indique les deux versions, que ses pages s’ouvrent ici dans la version de cette app, et que certaines peuvent cesser de fonctionner avec une version plus ancienne. Elle propose trois boutons :

- **Mettre à jour…** (avec le nom de la machine) met à jour cette machine depuis ici, comme le fait le bouton **Mettre à jour maintenant** de sa ligne de version dans [Paramètres → App → Général](/settings?s=general&find=Check%20now) (voir [Garder l’app à jour](/guide/app#keep-the-app-up-to-date)) : une copie installée depuis git, ou l’image Docker, récupère la nouvelle version, la compile et redémarre ; une app de bureau télécharge la nouvelle version et redémarre dessus. Cela prend quelques minutes, et les agents qui travaillent là-bas continuent. La page affiche chaque étape (« Getting the new version », « Installing packages », « Building », « Restarting, this page reconnects by itself »), et, pour une copie git, où elle en est : un pourcentage, une barre qui se remplit d’eau et une ligne comme « Étape 2 sur 3 · environ 2 min restantes » (pour une app de bureau, la part de la nouvelle version déjà téléchargée, avec une barre). Une machine qui fait encore tourner un Hydor plus ancien ne peut pas dire où elle en est : la page l’estime donc d’après l’étape en cours et le temps qu’elle a pris, et n’indique un temps restant que quand elle le peut ; la ligne de la machine affiche le même « Mise à jour · 45 % » et ouvre d’elle-même les pages de cette machine dès qu’elle est de retour. Une copie git ou Docker antérieure à 0.78.0 ne peut pas se mettre à jour toute seule au-delà de l’historique réécrit de Hydor (« Not possible to fast-forward, aborting. ») : la page le dit alors, avec la commande à exécuter une fois sur cette machine (voir [Mettre à jour à la main une copie plus ancienne](/guide/app#update-an-older-copy-by-hand)).
- **Ouvrir quand même** ouvre ses pages telles quelles. Cet onglet du navigateur ne redemande pas pour cette version.
- **Ouvrir** suivi du nom de votre propre machine revient à votre propre machine.

Quand la mise à jour est impossible depuis ici, la page en donne la raison : une app de bureau qui ne peut pas se remplacer là où elle se trouve (« Move Hydor to your Applications folder to update it. »), une copie sans source de mise à jour (« … has nowhere to update from by itself (it was not installed from git with an upstream): update Hydor there, or open it anyway. »), une mise à jour qui a échoué (« The update did not work: … »), une qui doit d’abord redémarrer (« It has the new version: restart Hydor on … to use it. »), ou une machine déjà aussi à jour que sa source.

Si une page d’une autre machine ne parvient pas à s’afficher, vous voyez « This page stopped working » avec ce qui a échoué, **Recharger**, et **Ouvrir** votre propre machine, au lieu d’une fenêtre vide. La barre latérale reste, et passer à une autre page réessaie. Sur une machine dotée d’un Hydor plus ancien, la page propose **Mettre à jour…** comme ci-dessus ; sur une machine dotée d’un Hydor plus récent que cette app, elle indique de mettre à jour cette app, puis de rouvrir la machine.

### Ce qui fonctionne d’une machine à l’autre

- **Tout ce qui figure sur les pages d’une machine lui appartient** : ses sessions, dossiers et fichiers, Git, terminaux, connexions des agents, modèles et paramètres.
- **Certaines choses viennent toujours de la machine sur laquelle vous avez ouvert l’app** : votre mot de passe et votre connexion, la liste des machines, les notifications, les thèmes que vous avez créés, ainsi que la visite de bienvenue et ses astuces.
- **Les avis de toutes les machines vous parviennent.** Un avis d’une autre machine la nomme, les notifications push passent par votre propre machine, et la [Boîte de réception](/guide/inbox) liste ce qui vous attend sur toutes les machines. Le compteur de la **Boîte de réception** dans la barre d’icônes les inclut. La ligne de machine dans la barre latérale vous indique aussi lesquelles des autres machines ont des sessions terminées depuis la dernière fois que vous y avez regardé (voir [Passer d’une machine à l’autre](#switch-between-machines)).
- **Les liens en lecture seule** fonctionnent aussi pour les sessions d’autres machines (voir [Partager une session avec un lien en lecture seule](/guide/devices#share-a-session-with-a-read-only-link)).
- **Pas sur les autres machines** : Preview, qui ouvre les serveurs de développement uniquement sur la machine que vous avez ouverte, et Connecter d’autres agents, puisque le serveur de chaque machine s’atteint à sa propre adresse.
- Votre navigateur mémorise, pour chaque machine séparément, le dossier de la page Fichiers, les fichiers ouverts et le dernier terminal utilisé.

### Modifier ou retirer une machine

- **Modifier** change le nom, la manière de l’atteindre ou le jeton d’accès. Laissez le jeton vide pour conserver celui qu’elle a. Une modification de la manière de l’atteindre est revérifiée avant d’être conservée.
- **Retirer** demande d’abord confirmation. Les sessions de la machine restent sur cette machine ; cette app cesse simplement de les afficher.

### Laisser d’autres machines utiliser celle-ci

Dans le groupe **Accès depuis d’autres machines** (sur les pages d’une autre machine : **Access to** cette machine), vous créez les jetons que d’autres machines utilisent pour atteindre celle-ci. Un autre Hydor muni d’un de ces jetons peut faire tout ce que vous pouvez faire ici, y compris exécuter des commandes : créez-en donc un pour chaque machine qui se connecte.

1. Cliquez sur **Nouveau jeton** à côté du titre du groupe.
2. Indiquez **Quelle machine l’utilisera ?** (« My laptop ») et cliquez sur **Créer le jeton**.
3. Copiez le jeton et collez-le dans les Paramètres → Machines de l’autre machine. Il n’est affiché que maintenant.

Chaque jeton indique quand il a été créé et utilisé pour la dernière fois. **Révoquer**, dans son menu **⋯** (après confirmation), coupe l’accès de cette machine immédiatement.

## Partager une session avec un lien en lecture seule

Un lien en lecture seule permet à quelqu’un qui n’a pas votre mot de passe de suivre une session en direct. Ouvrez le menu de la session (⋯) → **Partager un lien en lecture seule**. Pour partager plutôt un projet entier avec quelqu’un (ses documents, ses sessions, ses exécutions et sa liste de lecture, avec des commentaires sous leur nom), consultez [Partager un projet avec d’autres personnes](/guide/projects#share-a-project-with-people) ; pour partager un élément conservé (un document, une page, une image, une vidéo…) afin qu’il soit commenté ou modifié, consultez [Partager avec d’autres personnes](/guide/library#share-with-people).

1. Sous **Valable**, choisissez **Un jour**, **Une semaine**, **Un mois** ou **Jusqu’à désactivation**.
2. Cliquez sur **Créer un lien**.
3. Copiez le lien et envoyez-le. Il n’est affiché qu’une fois ; vous pouvez en créer un autre à tout moment.

**Liens actifs** liste les liens en cours de la session, chacun avec sa date de création, sa date de fin (« sans fin » pour ceux qui durent jusqu’à désactivation), le nombre de fois où il a été ouvert, et la dernière ouverture. **Désactiver** (la corbeille) arrête immédiatement un lien.

### Ce que voit la personne

Le lien ouvre la session seule, sans la barre latérale ni rien à saisir. Il affiche le titre de la session, l’agent qui y travaille, « lecture seule, partagé depuis Hydor », et « en cours » tant que l’agent travaille. En dessous se trouve la conversation : vos messages, les réponses de l’agent, ses étapes par leur nom (avec le nombre de lignes ajoutées et supprimées pour chaque modification de fichier, et les modifications elles-mêmes à un clic), et les pages que l’agent a présentées. Elle se met à jour toute seule, toutes les quelques secondes tant que l’agent travaille.

Cette personne ne voit ni la sortie des commandes, ni la réflexion de l’agent, ni les images que vous avez jointes (seulement qu’il y en avait), ni rien d’autre dans l’app, et elle ne peut rien saisir ni modifier. Un lien arrivé à échéance ou désactivé affiche « Ce lien a expiré ou a été désactivé ».

## Connecter d’autres agents à cette app

Les agents qui s’exécutent ailleurs (Claude Code sur votre portable, Codex, Cursor ou tout client qui parle MCP, le protocole que les agents utilisent pour appeler des outils) peuvent lister, lire, démarrer et piloter des sessions sur cette machine grâce au serveur MCP de l’app. Chacun a besoin d’un jeton, créé dans [Paramètres → App → Connecter d’autres agents](/settings?s=connect). Un agent muni d’un jeton peut démarrer et piloter des sessions ici, comme vous.

1. Cliquez sur [**Nouveau jeton**](/settings?s=connect&find=New%20token), à côté du titre du groupe **Jetons**.
2. Sous **Nommez-le d’après sa destination**, saisissez par exemple « Claude Code sur mon portable » et cliquez sur **Créer le jeton**.
3. Copiez maintenant ce dont vous avez besoin (il ne sera plus affiché) :
   - **Jeton**, le jeton lui-même.
   - **Claude Code** : une commande qui ajoute le serveur, `claude mcp add --transport http hydor <address>/mcp --header "Authorization: Bearer <token>"`.
   - **Codex** : des lignes pour `~/.codex/config.toml`, avec le jeton dans la variable d’environnement `HYDOR_TOKEN`.
   - **Autres clients (JSON)** : l’entrée de serveur MCP habituelle.

L’adresse est celle que votre navigateur a ouverte ; un agent situé sur une autre machine doit donc joindre l’app de la même manière que votre navigateur (voir [Accéder à l’app depuis un autre appareil](/guide/devices#reach-the-app-from-another-device)).

La liste **Jetons** indique le nom de chaque jeton, sa date de création et sa dernière utilisation. Créez-en un pour chaque agent ou machine, afin de pouvoir les **Révoquer** un par un (dans le menu **⋯** d’un jeton) ; révoquer un jeton coupe immédiatement l’accès de cet agent.

### Ce qu’ils peuvent faire

La ligne [**Ce qu’ils peuvent faire**](/settings?s=connect&find=What%20they%20can%20do), sous les jetons, comporte un (i) qui liste les outils dont dispose un agent muni d’un jeton :

- **list_sessions** et **read_session** : trouver une session et se mettre à jour (ses messages et ses étapes par leur nom).
- **start_session** : une nouvelle session Claude Code ou Codex avec un premier message, dans n’importe quel dossier, éventuellement dans un worktree dédié. Elle répond avec un lien que vous pouvez ouvrir.
- **send_message** : piloter une session. Si son agent est occupé, le message attend dans la file de la session jusqu’à la fin du tour.
- **list_models** : les modèles qu’une nouvelle session peut utiliser.

Les apps que vous proposez à d’autres agents (l’interrupteur **Proposer à d’autres agents** de l’app, voir [Apps](/guide/apps)) sont aussi fournies comme outils, et exécutent l’app avec les champs de son formulaire.

Les sessions démarrées dans cette app n’ont besoin de rien de tout cela. La section ne s’affiche que sur la machine où vous avez ouvert l’app, pas sur les pages des autres machines.

## Ajouter un compte GitHub ou Gitea

Les pull requests s’ouvrent avec un compte dans [Paramètres → App → Gestion de code source](/settings?s=scm). Chaque compte couvre les dépôts de son serveur : GitHub, un serveur GitHub Enterprise ou un serveur Gitea. Le push lui-même utilise la configuration git de cet ordinateur (ses clés SSH ou ses identifiants enregistrés) ; le compte sert à ouvrir la pull request et à suivre ses vérifications.

1. Cliquez sur [**Ajouter un compte**](/settings?s=scm&find=Add%20an%20account), à côté du titre du groupe **Comptes**. Une boîte de dialogue s’ouvre.
2. Choisissez **GitHub** ou **Gitea**.
3. Pour GitHub : si la CLI GitHub de cet ordinateur est connectée, **Utiliser sa connexion** ajoute le compte en un clic et c’est terminé. Sinon, collez un **Jeton d’accès** : un jeton à granularité fine avec Pull requests (lecture et écriture), Contents (lecture) et Commit statuses (lecture) sur vos dépôts (**En créer un** ouvre la page sur GitHub). Renseignez l’**Adresse du serveur** uniquement pour GitHub Enterprise.
4. Pour Gitea : l’**Adresse du serveur** (`https://gitea.example.com`) et un **Jeton d’accès** créé dans Gitea sous Settings → Applications → Generate token, avec lecture et écriture sur les dépôts.
5. Cliquez sur **Ajouter**. L’app vérifie le jeton en demandant au serveur à qui il appartient, puis liste le compte sous ce nom d’utilisateur.

Un second compte pour le même serveur remplace le premier. Chaque compte est une ligne avec son nom d’utilisateur, le serveur et « via la CLI GitHub » le cas échéant. Son menu **⋯** propose **Ouvrir le serveur** et **Retirer**, qui demande d’abord confirmation : les pull requests déjà liées à des sessions restent liées, mais leur état cesse d’être mis à jour.

Pour savoir comment les pull requests sont ouvertes et suivies : [Ouvrir une pull request depuis une session](/guide/files-git#open-a-pull-request-from-a-session).

## Demander à un agent

- « Rends cette app accessible depuis mon téléphone avec Tailscale. »
- « Quelle est l’adresse de cette app sur mon tailnet ? Est-ce que quelque chose empêche mon téléphone de l’ouvrir ? »
- « Arrête de servir l’app sur mon tailnet. »
- « Crée un lien en lecture seule vers cette session, valable une semaine. »
- « Désactive tous les liens de partage de cette session. »
- « Lesquelles de mes machines sont hors ligne ? Essaie de les reconnecter. »
- « Renomme la machine nommée gpu-box en Studio GPU. »
- « Quelles sessions se sont terminées sur mes autres machines pendant mon absence ? »
- « Liste les jetons que d’autres agents utilisent pour accéder à cette app, et révoque celui qui s’appelle old laptop. »
- « Ajoute mon compte GitHub avec la connexion de la CLI GitHub. »
- « Envoie à mes conversations Telegram, Discord et Slack les notifications de toutes les sessions, pas seulement de celles qu’elles ont démarrées. »
- « Quelles conversations sont liées à cette app, dans chaque application de messagerie ? »
- « Fais en sorte que les nouvelles sessions depuis ma conversation Discord utilisent Codex. »
- « Fais en sorte que les nouvelles sessions depuis ma conversation Telegram démarrent avec mon agent Comptable. »
- « Déconnecte l’app Slack. »
