# Agents, comptes et modèles

Hydor fait fonctionner plusieurs agents d’IA : Claude Code, Codex, Custom (l’agent propre à l’app, pour n’importe quel modèle) et d’autres agents compatibles ACP, comme Gemini CLI, OpenCode, Qwen Code, Goose ou Grok Build. Cette rubrique explique en quoi ils diffèrent, comment leurs programmes s’installent et restent à jour, comment les connecter (avec plusieurs comptes, si vous le souhaitez) et d’où viennent les modèles de Custom : OpenRouter, Ollama, modèles Hugging Face exécutés sur cet ordinateur, ou tout point d’accès compatible OpenAI.

![Choix de l’agent sur la page de démarrage : Claude Code, Codex ou Custom](images/agents-models.webp)

## Quel agent choisir ?

Un agent est le programme qui fait le travail dans une session : il lit votre message, utilise des outils (fichiers, commandes, web) et répond. Le modèle est l’IA qui se trouve derrière. Chaque agent reçoit de l’app la même aide (recherche web, Navigateur, Mémoire, Compétences, vos connexions), mais ils diffèrent par l’origine de leurs modèles.

- **Claude Code** (Anthropic). Fonctionne avec votre forfait Claude, ou facture un compte d’API Anthropic. Ses modèles sont ceux d’Anthropic (Opus, Sonnet, Haiku). Il a ses propres limites d’utilisation, que la [page Utilisation](/usage) affiche.
- **Codex** (OpenAI). Fonctionne avec votre forfait ChatGPT. Ses modèles sont ceux d’OpenAI. Il a lui aussi des limites d’utilisation, affichées sur la page Utilisation. Codex est fourni avec l’app.
- **Custom**, l’agent propre à l’app. Il exécute les modèles de vos forfaits Claude et ChatGPT (grâce aux connexions de Claude Code et de Codex), ainsi que tout modèle que vous ajoutez dans [Paramètres → Agents → Modèles](/settings?s=models) : modèles via OpenRouter, modèles sur cet ordinateur (avec Ollama ou vLLM), ou tout point d’accès compatible OpenAI. Utilisez-le pour des modèles ouverts, des modèles moins chers, ou des modèles qui ne quittent jamais votre ordinateur. Voir [Custom, l’agent propre à l’app](/guide/custom).
- **Agents compatibles ACP** : Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build (l’agent de programmation de xAI, avec ses modèles Grok) et d’autres, ou une commande de votre choix. ACP (l’Agent Client Protocol) est une manière commune pour une app de dialoguer avec un programme d’agent. Chacun se connecte une seule fois dans son propre programme et utilise ses propres modèles.

Ce que chacun peut faire dans l’app :

- Objectifs (l’agent continue de travailler jusqu’à ce qu’une condition soit remplie) et forks (une copie de la session à partir d’une réponse antérieure) : Claude Code, Codex et Custom. Pas les autres agents ACP.
- **Continuer dans…** (confier la conversation à un autre agent) : depuis Claude Code ou Codex, vers l’autre ou vers Custom.
- Effort (l’intensité de réflexion du modèle) : Claude Code, Codex et Grok Build, ainsi que tout autre agent ACP dont les modèles le proposent.
- Plusieurs comptes, limites d’utilisation du forfait et changement de compte lorsqu’une limite est atteinte : Claude Code, Codex et Grok Build.
- Réinitialisation des limites et crédit d’API lorsqu’une limite est atteinte : Claude Code et Codex uniquement.

## Choisir l’agent et le modèle d’une nouvelle session

Sur la page de démarrage (`/`), la ligne sous la zone de message indique qui fait le travail.

1. Cliquez sur **Fonctionne avec**. La liste affiche **Claude Code** (« Anthropic · forfait Claude ou clé d’API »), **Codex** (« OpenAI · forfait ChatGPT ou clé d’API »), **Custom** (« Tous les modèles : OpenRouter, Ollama, vLLM ») et chaque agent ajouté dans Paramètres → Autres agents (« Agent ACP · » suivi de sa commande). En bas, **Modèles pour Custom** ouvre Paramètres → Modèles, et **Ajouter ou gérer des agents** ouvre Paramètres → Autres agents.
2. Cliquez sur **Modèle** et choisissez-en un. **Automatique**, tout en haut et sélectionné au départ, laisse les niveaux choisir : Meilleur, et Max si le problème se révèle trop difficile (voir [Niveaux : un modèle pour chaque type de tâche](#tiers-a-model-for-each-kind-of-job)). En dessous, la liste n’affiche que les modèles propres à cet agent. Le modèle par défaut de l’agent est marqué « par défaut ». Les anciennes versions d’un modèle se cachent derrière une ligne du type « 2 anciens modèles » ; cliquez dessus pour les voir. Lorsqu’il y a plus de huit modèles, une zone **Rechercher des modèles** apparaît en haut : saisissez quelques lettres et appuyez sur Entrée pour prendre le premier résultat. Lorsque l’agent n’a pas démarré comme l’app le lui demandait pour ses modèles, le menu l’indique, avec les propres mots de l’agent pour expliquer pourquoi, et **Réessayer** refait la demande.
3. Sous **Options**, vous trouvez **Effort** (pour les agents et les modèles qui en ont un : Par défaut, Bas, Moyen, Élevé, etc. ; pour Grok Build, voir [Effort pour Grok Build](#effort-for-grok-build)) et **Autorisations** (ce que l’agent peut faire sans vous demander). Maj+Tab dans la zone de message change aussi les autorisations.

La page de démarrage retient ce que vous avez choisi pour chaque lieu de travail (chaque projet, chaque dossier et **Nouveau dossier de tâche**), sur tous vos appareils : le modèle, l’effort et les autorisations de chaque programme y reviennent tels que vous les aviez laissés (voir [Ce que la page de démarrage retient](/guide/sessions#what-the-start-page-remembers)).

Un agent ACP autre que Custom n’affiche ses choix de **Modèle** et d’**Autorisations** qu’après sa première session : ils listent ce que l’agent proposait lors de sa dernière exécution. Grok Build fait exception : ses modèles, avec les efforts que chacun accepte, s’affichent dès qu’il est ajouté, car l’app les demande à Grok.

Avec **Options** → **Confidentielle** activé, **Fonctionne avec** passe sur **Custom** et **Modèle** ne liste que les modèles présents sur cet ordinateur ou sur votre réseau privé, le meilleur étant sélectionné en premier : voir [Garder une session confidentielle](/guide/sessions#keep-a-session-confidential).

Sur un téléphone, chacun de ces menus s’ouvre sous forme de feuille depuis le bas de l’écran.

## Changer de modèle en cours de session

Dans une session, le modèle, l’effort et les autorisations se trouvent sous la zone de message. Ils forment une seule pastille qui se lit par exemple « Opus 5.5 · Élevé · Planifier » : cliquez dessus pour accéder à **Modèle**, **Effort** et **Autorisations**.

Choisissez un autre modèle et la session continue avec lui :

- Claude Code change immédiatement.
- Codex utilise le nouveau modèle à partir de son prochain tour.
- Custom l’utilise à partir de sa prochaine étape, même en plein milieu d’un tour.
- Un autre agent ACP change s’il propose un choix de modèles.

L’**Effort** de la session fonctionne de la même façon. Choisissez-en un et l’agent en cours l’utilise à partir de son prochain tour. Si le modèle vers lequel vous passez n’accepte pas l’effort que vous aviez, le sélecteur affiche l’effort par défaut de ce modèle, et c’est avec lui que le modèle fonctionne.

Le menu des modèles ne liste que les modèles de l’agent de la session ; pour une session confidentielle, seulement ceux présents sur cet ordinateur ou sur votre réseau privé. Pour transférer une conversation vers un autre agent, utilisez le menu de la session (⋯) → **Continuer dans Codex**, **Continuer dans Claude Code** ou **Continuer dans Custom** (depuis les sessions Claude Code et Codex ; Custom apparaît dès qu’il a un modèle). Votre message suivant démarre alors une nouvelle session de cet agent dans le même dossier, avec la conversation jusque-là. Une session arrêtée reprend avec le dernier modèle utilisé, sauf si vous en choisissez un autre avant d’envoyer.

## Effort pour Grok Build

Les modèles de Grok acceptent un effort de raisonnement, le même choix que celui proposé par Claude Code et Codex :

- Grok 4.6 (et les modèles plus récents qui offrent la même chose) : **xhigh**, **élevé**, **moyen** ou **bas**. **Élevé** est la valeur par défaut.
- Grok 4.5 : **élevé**, **moyen** ou **bas**.

Sur la page de démarrage, choisissez **Grok Build** sous **Fonctionne avec**, puis **Options** → **Effort** : la liste affiche les efforts du modèle choisi, avec **Par défaut**. Ils s’affichent dès que Grok Build est ajouté, même avant sa première session. Une session Grok Build en cours change son effort dans son propre sélecteur **Effort** (la pastille sous la zone de message), et l’exécution d’une [app](/guide/apps) en accepte un aussi. Lorsque vous faites passer une session sur un modèle qui n’accepte pas l’effort que vous aviez (xhigh sur Grok 4.5), le sélecteur affiche l’effort par défaut de ce modèle, et c’est avec lui que le modèle fonctionne.

Cela ne concerne pas que Grok : tout autre agent compatible ACP dont les modèles proposent des efforts reçoit le même choix **Effort**.

## Niveaux : un modèle pour chaque type de tâche

Les agents choisissent leurs modèles par niveau plutôt que par nom : **Rapide** pour les petites tâches très claires dont le résultat peut être vérifié, **Standard** pour les tâches claires de taille moyenne, **Meilleur** pour l’agent principal d’une session, qui planifie, dirige les sous-agents et vérifie leur travail, et **Max** pour les problèmes les plus difficiles. L’essentiel d’un travail se compose de parties claires qu’un modèle moins coûteux traite bien : une session coûte donc moins cher ainsi, sans que le résultat en pâtisse, car le modèle le plus fort de l’équipe planifie quand même le travail et le vérifie.

Sur la page de démarrage, **Modèle** s’ouvre sur **Automatique** : la session démarre sur Meilleur. Son agent principal confie les parties claires à des sous-agents sur Standard et Rapide, et peut passer lui-même sur Max lorsqu’un problème se révèle plus difficile que ce que Meilleur peut gérer (un correctif qui a échoué deux fois, une cause introuvable, une démonstration) ; une ligne dans la conversation l’indique, avec la raison. Une demande n’est pas envoyée à Max sur la seule base de sa formulation : Meilleur résout la plupart de ce qui semble difficile, pour moins cher. Choisissez plutôt un modèle par son nom et la session réfléchit avec celui-là ; ses sous-agents reçoivent toujours des niveaux. Un de vos agents peut réfléchir avec un seul niveau (voir [Avec quoi un agent réfléchit : les niveaux](/guide/agents#what-an-agent-thinks-with-tiers)).

[Paramètres → Agents → Modèles → Niveaux](/settings?s=models&find=Tiers) indique ce que signifie chaque niveau pour chaque programme : une ligne par niveau, avec un interrupteur à côté du titre du groupe pour choisir le programme (**Claude Code**, **Codex** ou **Custom**), et dans chaque ligne un modèle et, pour Claude Code et Codex, un effort. Le (i) d’un niveau en dit plus à son sujet. Au départ, pour Claude Code, Rapide est Haiku, Standard est Sonnet, Meilleur est Opus et Max est le dernier Fable ; pour Codex, Rapide est Luna, Standard est Terra, Meilleur est Sol et Max est Astra (avec un forfait qui n’en inclut pas un, c’est le plus proche qu’il propose, avec plus d’effort pour le niveau supérieur lorsque deux niveaux partagent un modèle) ; Custom n’en a aucun, donc ses sessions gardent le modèle choisi jusqu’à ce que vous choisissiez l’un de ses modèles (un modèle sur cet ordinateur rend Rapide gratuit). Sur l’onglet **Custom**, un niveau peut aussi désigner un modèle de votre forfait Claude ou ChatGPT (voir [D’où viennent les modèles de Custom](#where-customs-models-come-from)). Un niveau que vous laissez tel quel suit le modèle le plus récent de son programme dans cette catégorie. **Revenir aux valeurs par défaut**, dans le menu **⋯** à côté du titre, les remet tous.

Deux interrupteurs du groupe **Niveaux dans les sessions**, sous les niveaux, déterminent comment les sessions les utilisent :

- **Diriger avec des sous-agents** (activé au départ) : l’agent principal d’une session reçoit pour consigne de planifier, de confier les parties claires à des sous-agents sur des niveaux moins coûteux et de vérifier leur travail ; un sous-agent demandé sans niveau reçoit Standard. Désactivé, les agents travaillent seuls sauf s’ils en décident autrement, et la page de démarrage n’a pas d’Automatique.
- **Max pour les problèmes difficiles** (activé au départ) : un agent principal sur Automatique peut passer lui-même sur Max lorsqu’un problème se révèle trop difficile pour Meilleur. Désactivé, les sessions sur Automatique restent sur Meilleur.

## Les programmes d’agents s’installent et se mettent à jour tout seuls

Claude Code, Codex, Gemini CLI, Grok Build et les autres sont des programmes présents sur cet ordinateur. Vous n’avez pas à les installer à la main.

Ouvrez [Paramètres → Agents → Comptes](/settings?s=accounts&find=Agent%20programs) et regardez le groupe **Programmes d’agents**. Il liste Claude Code, Codex, Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build (une fois ajouté) et les agents qui ont besoin d’un adaptateur ACP, chacun avec la version qu’exécutent les sessions et son origine :

- **votre propre installation** : vous l’avez installé vous-même (pour Grok Build, aussi avec l’installateur de xAI, qui le place dans `~/.grok/bin`).
- **installé par l’app** : l’app l’a installé dans son propre dossier.
- **fourni avec l’app** : Codex est livré avec l’app.
- **Absent : s’installe tout seul à la première utilisation** : le programme est manquant. Cliquez sur **Installer** pour l’obtenir tout de suite.

Une ligne indique aussi « … est disponible » lorsqu’une version plus récente existe. La ligne de Codex ajoute « le vôtre dans le terminal : … » lorsque vous avez aussi un Codex à vous : les sessions exécutent celui de l’app, et un terminal exécute le vôtre.

Un programme manquant s’installe aussi tout seul la première fois qu’il est nécessaire : Claude Code lorsque vous vous y connectez ou démarrez une session Claude Code, un agent ACP lorsque vous l’ajoutez dans Paramètres → Agents → Autres agents ou démarrez une session avec lui. L’app les installe avec npm dans son propre dossier, vous n’avez donc besoin d’aucun droit d’administrateur.

Goose, Kimi CLI et quelques autres agents ne figurent pas dans cette liste : installez-les vous-même (Paramètres → Agents → Autres agents indique où les obtenir). Un agent qui a besoin d’un adaptateur ACP s’installe en deux parties, l’adaptateur et l’agent lui-même ; la liste n’affiche qu’une seule ligne pour les deux.

## Garder les programmes d’agents à jour

Quand [**Mettre à jour automatiquement**](/settings?s=accounts&find=Update%20automatically) est activé, dernière ligne de **Programmes d’agents** (il l’est tant que vous ne le désactivez pas), l’app met chaque programme d’agent à sa version la plus récente une fois par jour. La première exécution a lieu environ dix minutes après le démarrage de l’app.

- Les copies installées par l’app se mettent à jour avec npm, dans son propre dossier. Codex passe à une copie plus récente que celle fournie avec l’app.
- Vos propres installations se mettent à jour avec leur propre outil : `claude update` pour Claude Code, `codex update` pour Codex (celui que lance votre terminal), `opencode upgrade` pour OpenCode, `grok update` pour Grok Build.
- Gemini CLI, Qwen Code, Auggie, Grok Build ou un agent avec un adaptateur ACP que vous avez installé avec `npm install -g` se mettent à jour avec npm, si votre utilisateur peut écrire dans ce dossier. Tout ce qui a été installé autrement est à mettre à jour par vous, de la façon dont vous l’avez installé.
- Claude Code suit sa propre ligne de versions : la version stable quand ses paramètres indiquent `"autoUpdatesChannel": "stable"`, sinon la dernière.
- Si vous avez désactivé les mises à jour propres à Claude Code avec `DISABLE_AUTOUPDATER=1` (c’est le cas de l’image Docker), l’app ne met pas non plus à jour votre Claude Code d’elle-même. **Mettre à jour maintenant** le fait quand même.

L’app ne conserve une nouvelle version que lorsqu’elle fonctionne comme les sessions l’utilisent. Claude Code doit répondre au démarrage d’une session et lister ses modèles, Codex doit démarrer son serveur d’app et lister ses modèles, et les autres doivent démarrer et indiquer leur version. Rien de tout cela ne demande de connexion ni n’utilise votre forfait. Chacun dispose d’une minute pour répondre, et seul le temps où l’ordinateur est éveillé compte : un Mac qui se met en veille au milieu de la vérification ne consomme donc pas la minute. Un programme lent à répondre la première fois (un Mac examine un nouveau programme avant de l’exécuter pour la première fois) est relancé avec deux minutes de plus, et n’échoue que s’il ne répond pas non plus cette fois-là. Une version qui échoue est annulée :

- Une copie installée par l’app, ou l’une des vôtres qu’elle a mise à jour avec npm, revient à la version précédente.
- Pour votre propre Claude Code, les sessions continuent d’utiliser la version précédente, que l’installeur de Claude Code conserve à côté de la nouvelle. La commande `claude` dans un terminal reste sur la nouvelle. La ligne indique « … n’a pas fonctionné ici ».
- Une version qui a échoué n’est pas retentée automatiquement, mais la suivante l’est, et **Mettre à jour maintenant** la retente.

Sous cette ligne, l’app indique quand elle a regardé pour la dernière fois, par exemple « À jour · vérifié il y a 2 h », avec **Vérifier maintenant** pour regarder à nouveau. Quand des versions plus récentes sont disponibles, elle le dit, avec **Mettre à jour maintenant** pour toutes les installer d’un coup (il n’y a pas de bouton par programme) ; elle indique quel programme est en cours de mise à jour. Les lignes en dessous disent ce que la dernière mise à jour a changé, par exemple « Claude Code 2.1.308 → 2.1.316 », ou pourquoi une version n’a pas pu être installée.

Les sessions en cours continuent avec la version avec laquelle elles ont démarré ; les nouvelles sessions utilisent la nouvelle. Quand **Mettre à jour automatiquement** est désactivé, l’app regarde toujours une fois par jour et affiche ce qui est disponible, mais n’installe rien tant que vous ne cliquez pas sur **Mettre à jour maintenant**.

## Connecter Claude Code, Codex et Grok Build

Claude Code et Codex ont besoin d’une connexion pour fonctionner, tout comme Grok Build une fois que vous l’avez ajouté (voir [Ajouter Gemini CLI, OpenCode et d’autres agents ACP](#add-gemini-cli-opencode-and-other-acp-agents)). Ouvrez [Paramètres → Agents → Comptes](/settings?s=accounts) (sur un téléphone, les Paramètres sont une liste de sections : touchez **Comptes** sous Agents ; le titre en haut permet de revenir en arrière). Le groupe **Comptes** (son (i) explique qu’il s’agit des connexions à Claude Code, Codex et Grok Build que vos sessions utilisent, que vous pouvez ajouter un autre abonnement, par exemple un professionnel et un personnel, et en choisir un au démarrage d’une session) liste d’abord la connexion propre à chaque agent, puis les comptes que vous avez ajoutés pour lui. La connexion propre à Grok Build a aussi sa ligne, **Grok Build**, qui s’affiche une fois qu’il est ajouté. Chacune affiche une coche verte avec l’e-mail, le forfait et la méthode de connexion, ou une croix rouge avec « Non connecté » ou la nature du problème.

Pour vous connecter :

1. Cliquez sur **Se connecter** à côté de l’agent.
2. Choisissez la méthode :
   - Claude Code : **Abonnement Claude** (votre forfait Claude) ou **Console (facturation API)** (un compte API Anthropic).
   - Codex : **Code d’appareil** ou **Redirection du navigateur**.
   - Grok Build : rien à choisir, la connexion se fait toujours avec un code.
3. Cliquez sur **Obtenir le lien de connexion**.
4. Suivez les étapes affichées par la boîte de dialogue :
   - Claude Code : ouvrez le lien (**Ouvrir la page de connexion**), autorisez l’accès dans votre navigateur, puis collez le code affiché sur la page dans **Collez le code affiché sur la page** et cliquez sur **Terminer la connexion**.
   - Codex, Code d’appareil : ouvrez le lien sur n’importe quel appareil, connectez-vous à ChatGPT et saisissez le code à usage unique affiché dans la boîte de dialogue. La boîte de dialogue détecte d’elle-même que vous avez terminé.
   - Codex, Redirection du navigateur : après votre connexion, votre navigateur tente d’ouvrir une page « localhost » et échoue. Copiez l’adresse de cette page, collez-la dans **Collez l’adresse localhost de votre navigateur** et cliquez sur **Terminer la connexion**.
   - Grok Build : vous obtenez un lien et un code à usage unique. Ouvrez le lien sur n’importe quel appareil, connectez-vous avec votre compte Grok et confirmez le code (**2. Confirmez ce code**). Rien n’est à recoller : la boîte de dialogue détecte d’elle-même que vous avez terminé.

Quand tout fonctionne, vous voyez « Claude Code est connecté » (ou Codex, ou Grok Build). En cas d’échec, la boîte de dialogue en donne la raison ; cliquez sur **Réessayer**.

Une fois connecté, le bouton devient **Changer de compte** : il lance la même connexion pour un autre compte (pour Grok Build, un nouveau code). **Se déconnecter** se trouve dans le menu **⋯** de la ligne : il déconnecte le programme sur cet ordinateur, pour tous les terminaux et éditeurs qui l’utilisent, après confirmation.

Si vous démarrez une session Grok Build alors que vous êtes déconnecté, la session s’arrête avec le message « Grok Build n’est pas connecté : connectez-vous avec votre compte Grok dans Paramètres → Agents → Comptes, puis réessayez. » Connectez-vous à cet endroit et renvoyez votre message. Une clé d’API xAI dans `XAI_API_KEY`, dans l’environnement des agents, fonctionne pour Grok Build à la place d’un abonnement.

La visite de bienvenue (depuis **Aide** dans la barre d’icônes) demande quels agents et modèles vous voulez utiliser et vous guide aussi dans ces connexions.

## Ajouter un deuxième compte (professionnel et personnel)

Vous pouvez connecter plusieurs comptes Claude Code, Codex ou Grok Build, par exemple un forfait professionnel et un forfait personnel, et en choisir un par session.

1. Ouvrez [Paramètres → Agents → Comptes](/settings?s=accounts&find=Accounts).
2. Cliquez sur **Ajouter un compte**, à côté du titre du groupe **Comptes**.
3. Choisissez **Claude Code**, **Codex** ou **Grok Build** (il est proposé une fois Grok Build configuré), saisissez un nom (40 caractères au maximum, par exemple « Pro » ou « Perso ») et cliquez sur **Ajouter et se connecter**.
4. La boîte de dialogue de connexion s’ouvre pour le nouveau compte. Connectez-vous comme décrit plus haut.

Chaque compte ajouté se connecte séparément et garde son propre historique de sessions. Vos paramètres, instructions, compétences et plugins sont partagés avec la connexion principale de l’agent : les modifications s’appliquent donc aux deux. Pour Claude Code, un dossier auquel vous avez accordé votre confiance avec la connexion principale l’est aussi avec un compte ajouté ; les règles d’autorisation propres au dossier s’appliquent donc dans ses sessions. Deux comptes du même agent ne peuvent pas porter le même nom.

Un compte Grok Build ajouté a son propre dossier avec sa connexion et l’historique de sessions propre à Grok. Il partage avec votre connexion principale les paramètres propres à la CLI de Grok : sa configuration, ses règles (`AGENTS.md`), ses compétences, ses plugins et ses connexions MCP.

Chaque compte ajouté a sa propre ligne, sous la connexion propre à l’agent, avec **Se connecter** ou **Changer de compte** ; son menu **⋯** propose **Se déconnecter**, **Renommer** et **Retirer** :

- **Renommer** demande un nouveau nom.
- **Se déconnecter** empêche les sessions qui s’exécutent avec ce compte de fonctionner jusqu’à ce qu’il se reconnecte.
- **Retirer** enlève le compte de l’app. Ses sessions disparaissent de la liste, mais leur historique reste sur le disque, sauf si vous cochez aussi **Supprimer aussi sa connexion et l’historique de ses sessions**. Vous ne pouvez pas retirer un compte tant que des sessions s’exécutent avec lui : arrêtez-les d’abord.

La [page Utilisation](/usage) affiche une carte pour chaque compte Claude Code, Codex ou Grok Build ajouté, avec ses propres limites.

## Choisir le compte avec lequel une session s’exécute

Quand l’agent que vous avez choisi a des comptes ajoutés (pour Grok Build, une fois que vous en avez ajouté un), les **Options** de la page de démarrage affichent une ligne **Compte**. Cliquez dessus :

- **Votre connexion** est le compte propre au programme (le premier de cet agent dans **Comptes** ; pour Grok Build, « Le compte propre à la CLI Grok Build »).
- Chaque compte ajouté est listé par son nom.
- **Gérer les comptes** ouvre Paramètres → Agents → Comptes.

La page de démarrage mémorise votre choix pour cet agent, partout de la même façon. Une session qui s’exécute avec un compte ajouté affiche le nom de ce compte, avec une icône de personne, en haut de la session. Si ce compte atteint une limite d’utilisation, l’avis de limite au-dessus de la zone de message concerne ce compte. Le compte est défini au démarrage de la session. Il ne change de lui-même qu’avec **Changer de compte à une limite** (ci-dessous).

Pour faire passer vous-même une session à un autre compte, cliquez sur la pastille **Compte** de la session et choisissez-en un. Cela fonctionne pour les sessions Claude Code, Codex et Grok Build, et prend effet à partir de votre prochain message. L’historique Grok d’une session Grok Build la suit ; si Grok ne peut pas la rouvrir avec l’autre compte, elle repart de zéro avec ce compte, avec une note.

## Utiliser tous vos comptes : changer à une limite

Avec deux comptes ou plus pour le même agent, l’app peut tous les utiliser : quand l’un n’a plus d’utilisation disponible, votre travail se poursuit avec un autre. Ouvrez [Paramètres → Agents → Comptes](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) et trouvez **Changer de compte à une limite**, dans le groupe **À une limite d’utilisation** sous **Comptes**, qui s’affiche dès que vous avez ajouté un compte, y compris pour Grok Build (son (i) explique que lorsque le compte d’une session n’a plus d’utilisation disponible, la session passe à un autre compte de cet agent qui en a encore et continue, et que les nouvelles sessions évitent un compte arrivé à sa limite). Il est activé dès le départ (désactivez-le à cet endroit si vous préférez choisir le compte vous-même), et il fonctionne même quand aucun navigateur n’est ouvert.

- Quand un tour s’arrête parce que le compte de la session a atteint sa limite d’utilisation, l’app choisit un autre compte connecté du même agent qui a encore de l’utilisation (le moins utilisé), y déplace la session avec tout son historique, et envoie « … a atteint sa limite d’utilisation, cette session s’exécute donc maintenant sur …. Continuez là où vous vous étiez arrêté. » Une courte note en bas de l’écran indique sur quel compte elle est passée.
- Les sous-agents qu’une session Claude Code exécute en arrière-plan continuent aussi. Ceux qui travaillent encore quand la limite est atteinte s’arrêtent à leur étape suivante, leur travail conservé, et l’app les attend (deux minutes au maximum) avant de déplacer la session. Le message les nomme alors, et l’agent reprend chacun là où il s’était arrêté. Si seuls les sous-agents atteignent une limite (une limite propre à leur modèle, par exemple), la session est déplacée une fois son tour terminé et quand aucun d’eux ne travaille plus.
- Les sous-agents Hydor (les sessions qu’un agent démarre pour effectuer une partie de son travail) sont des sessions à part entière : chacun change donc de compte de lui-même quand une limite interrompt son tour. L’agent qui l’a démarré apprend qu’il continue, et non qu’il a échoué, et reçoit sa réponse quand il termine.
- Votre connexion principale et chaque compte ajouté comptent tous. Les comptes Claude Code prennent le relais des comptes Claude Code, ceux de Codex de ceux de Codex, ceux de Grok Build de ceux de Grok Build.
- Un compte Grok Build est à sa limite quand il atteint sa limite hebdomadaire, sa limite de crédit ou son plafond de dépenses à l’usage. La session passe alors à un autre compte Grok connecté qui a encore de l’utilisation (le moins utilisé) et continue avec « … a atteint sa limite d’utilisation, cette session s’exécute donc maintenant sur … ». Une courte limite de débit (une rafale de requêtes) ne déplace rien : elle passe d’elle-même. L’avis de limite au-dessus de la zone de message s’affiche aussi pour les sessions Grok.
- Un objectif Codex suit la session et continue.
- Quand tous les comptes sont à leur limite, rien ne bouge (sauf si **Utiliser le crédit d’API à une limite** est activé, voir plus bas, pour Claude Code). Avec **Reprendre après les limites d’utilisation** activé, la session continue quand le premier compte se réinitialise, avec ce compte. Cela vaut aussi pour les sessions Grok Build. Plus de détails dans [Utilisation, limites et coûts](/guide/usage#continue-sessions-automatically-after-a-limit).
- Une nouvelle session démarrée avec un compte arrivé à sa limite démarre plutôt avec un compte qui a encore de l’utilisation, et un message que vous envoyez à une session dont le compte est à sa limite déplace d’abord la session, pour que le message ne soit pas rejeté. Avec votre message, l’agent apprend qu’il s’exécute maintenant avec un compte qui a encore de l’utilisation, afin de ne pas attendre la réinitialisation de l’ancien compte, et lesquels de ses sous-agents peuvent continuer.
- Les sessions ouvertes dans VS Code ou dans un terminal restent sur leur compte.
- Les réinitialisations de limites (crédits de réinitialisation Codex, avoirs de réinitialisation Claude) et le crédit d’API ne concernent encore que Claude Code et Codex.
- Les petites questions de l’app elle-même à Claude Code ou à Codex (le modèle d’appoint sur **Automatique**, les étapes de modèle rapide d’une app, les descriptions de pull request, les suggestions de commandes) passent de la même façon à votre prochain compte connecté quand l’un est à sa limite ou déconnecté. Quand ni Claude Code ni Codex ne peut répondre, l’un de vos modèles Custom prend le relais (voir [Quand un compte est déconnecté](#when-an-account-is-signed-out)).

## Quand un compte est déconnecté

Un compte Claude Code, Codex ou Grok Build peut être déconnecté : sa connexion a pris fin ou a été révoquée, et le programme affiche « Not logged in · Please run /login » ou « 401 Unauthorized ». L’app contourne le problème quand elle le peut, et ne vous demande de vous reconnecter que si rien d’autre ne peut faire le travail.

- **Vos sessions.** Quand le tour d’une session est refusé parce que son compte est déconnecté, et que [Changer de compte à une limite](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) est activé (il l’est dès le départ), la session passe, avec tout son historique, sur un autre compte connecté du même agent qui a encore de l’utilisation disponible, et continue. Une courte note en bas de l’écran indique « <session> : <compte> est déconnecté, elle continue donc sur <autre compte> », et l’agent reçoit le message « … est déconnecté, cette session s’exécute donc maintenant sur …. Reprenez là où vous en étiez. » Un message envoyé à une session dont le compte a été constaté déconnecté peu de temps auparavant la fait d’abord changer de compte de la même façon, pour que le message ne soit pas refusé.
- **Quand une session ne peut pas changer de compte.** Si **Changer de compte à une limite** est désactivé, ou si aucun autre compte de cet agent n’a d’utilisation disponible, la session s’arrête. Une bannière au-dessus de sa zone de message indique « <compte> est déconnecté » et « Cette session continuera dès que vous vous serez reconnecté. », avec un bouton **Se connecter**. Une fois que vous vous êtes reconnecté, ici ou dans un terminal, la session reprend toute seule, et l’agent reçoit le message « Reconnecté. Reprenez là où vous en étiez. »
- **Travail en arrière-plan.** Les petites tâches du [modèle d’appoint](/settings?s=models&find=Helper%20model) réglé sur **Automatique** (titres de sessions, notes de mémoire, raccourcissement de [votre profil](/guide/memory#your-profile), étapes rapides d’une app, descriptions de pull request…) ignorent un compte déconnecté pendant 15 minutes, puis le réessaient, de sorte qu’une connexion faite dans un terminal est repérée. Le compte connecté suivant répond, puis Codex. Quand ni Claude Code ni Codex ne peuvent répondre (déconnectés, à une limite ou non installés), l’un de vos modèles **Custom** fait le travail : celui que le niveau **Rapide** de Custom désigne dans [Paramètres → Agents → Modèles → Niveaux](/settings?s=models&find=Tiers) (puis **Standard**, et pour les rares tâches plus lourdes **Meilleur**, puis **Max**), ou à défaut le modèle le moins cher que vous avez ajouté (un modèle sur cet ordinateur compte comme gratuit). Deux au maximum sont essayés. Le coût est comptabilisé comme l’utilisation de n’importe quel modèle Custom.
- **L’invitation à se connecter.** Uniquement quand rien n’a pu faire le travail et qu’un compte était déconnecté, une carte s’affiche sur toutes les pages, en bas à droite (au-dessus de la zone de message sur un téléphone). Son titre est « Reconnectez-vous à Claude Code » (ou Codex, ou Grok Build), avec en dessous « <compte> est déconnecté. », puis la raison de la demande : « Le travail en arrière-plan en a besoin (raccourcissement de votre profil), et aucun autre compte ni modèle Custom n’a pu le faire. » ou, pour une session qu’elle a arrêtée, « … continuera dès que vous vous serez reconnecté. » **Se connecter** ouvre la même boîte de dialogue de connexion que [Paramètres → Agents → Comptes](/settings?s=accounts). **Pas maintenant** masque la carte pendant une heure ; une session qui s’arrête à cause de cela fait réapparaître la carte, et la bannière de cette session reste. Deux cartes au maximum s’affichent en même temps, puis « +N de plus » vous mène à Paramètres → Agents → Comptes. Une carte disparaît dès que le compte est reconnecté, depuis la carte, depuis les Paramètres ou dans un terminal (l’app s’en aperçoit à son prochain appel qui aboutit). Elle disparaît aussi quand le travail en arrière-plan est de nouveau effectué autrement (un autre compte ou un modèle Custom répond). Quand Claude Code et Codex sont tous deux déconnectés, seul Claude Code, qui répond en premier, fait l’objet de la demande.

Votre profil l’indique aussi : quand son raccourcissement a échoué parce qu’un compte est déconnecté, la raison affichée en dessous le dit (« Votre compte Claude Code « Work » est déconnecté, et aucun autre compte ni modèle Custom n’a pu faire ce travail : reconnectez-vous (Paramètres → Agents → Comptes). ») et la carte apparaît.

## Utiliser le crédit d’API quand tous les comptes ont atteint leur limite

Si vous avez une clé d’API Anthropic (sur [console.anthropic.com](https://console.anthropic.com) → API keys), vos sessions Claude Code peuvent continuer avec elle quand tous les comptes Claude Code ont atteint leur limite d’utilisation, au lieu de s’arrêter. Cela coûte de l’argent : la session est facturée par Anthropic au tarif de l’API tant qu’elle fonctionne ainsi, sans être couverte par votre abonnement.

1. Ouvrez [Paramètres → Agents → Comptes](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit). Sur la ligne d’un compte Claude Code dans **Comptes** (votre connexion principale, ou un compte que vous avez ajouté), cliquez sur **⋯** puis sur **Ajouter une clé d’API…**.
2. Collez la clé dans **Clé d’API Anthropic** et cliquez sur **Enregistrer la clé**. L’app la vérifie auprès d’Anthropic et la conserve chiffrée sur cet ordinateur. La ligne affiche alors une étiquette **Crédit API**. **Modifier la clé d’API…** la remplace et **Retirer la clé d’API** la supprime.
3. Activez **Utiliser le crédit d’API à une limite**, dans le groupe **À une limite d’utilisation** (son (i) explique que, quand tous les comptes Claude Code ont atteint leur limite d’utilisation, les sessions continuent facturées sur la clé d’API Anthropic d’un compte au lieu de s’arrêter, et que ce réglage est désactivé tant que vous ne l’activez pas). Il apparaît dès que Claude Code est connecté ou que vous avez ajouté un compte Claude Code.

Voici ce qui se passe ensuite :

- Quand le compte d’une session Claude Code atteint sa limite d’utilisation, l’app essaie d’abord ce que fait **Changer de compte à une limite** : un autre compte qui a encore de l’utilisation disponible. Ce n’est que si aucun n’en a plus, et que le réglage est activé, que la session continue facturée sur la clé d’API.
- La session reste sur son propre compte, son historique ne se déplace donc pas. Si ce compte n’a pas de clé, la clé d’un autre compte Claude Code est utilisée.
- La session affiche une étiquette **Crédit API** à côté de son compte, en haut. Survolez-la pour voir pourquoi.
- Quand un forfait a de nouveau de l’utilisation disponible, la session y revient à la fin de son tour suivant : sur son propre compte, ou sur un autre qui a de l’utilisation disponible. Vous n’avez rien à faire.
- Si l’app ne peut pas lire l’utilisation d’un compte, elle ne bascule jamais votre travail vers la facturation à l’API.
- Codex n’est pas concerné : il n’a pas de crédit API.

## Ajouter Gemini CLI, OpenCode et d’autres agents ACP

Ouvrez [Paramètres → Agents → Plus d’agents](/settings?s=agents&find=Agents%20that%20speak%20ACP).

- **Vos agents** (ils s’affichent à côté de Claude Code et de Codex quand vous démarrez une session) liste Custom en premier, puis les agents que vous avez ajoutés. Chacun affiche une coche quand son programme est installé ici, ou une croix et « non installé ».
- **Agents compatibles ACP** (installez-en un, connectez-vous une fois dans son propre CLI, puis ajoutez-le ici) liste les agents connus que vous n’avez pas encore ajoutés : Gemini CLI, OpenCode, Qwen Code, Goose, Kimi CLI, Auggie, Grok Build et d’autres. Les agents installés viennent en premier. Une ligne qui indique « Non installé » explique comment l’obtenir. La liste montre les premiers agents non installés ; **Tout afficher** montre les autres.

Pour en ajouter un :

1. Cliquez sur **Ajouter** à la fin de sa ligne. Le bouton est mis en évidence quand le programme est déjà installé.
2. Si l’app sait l’installer (Gemini CLI, OpenCode, Qwen Code, Auggie, Grok Build et les agents qui ont besoin d’un adaptateur ACP), elle l’installe tout de suite, en arrière-plan. Goose, Kimi CLI et les autres, vous les installez vous-même, avec la commande ou l’adresse indiquée sur leur ligne.
3. Connectez-vous une fois dans le programme propre à l’agent : ouvrez le [Terminal](/terminal), exécutez sa commande (par exemple `gemini`) et suivez sa procédure de connexion. Si vous l’omettez, une session vous le signale : « Gemini CLI n’est pas connecté. Exécutez gemini une fois dans un terminal et connectez-vous-y, puis réessayez. »

L’agent apparaît maintenant dans la liste **Fonctionne avec** de la page de démarrage.

Pour modifier un agent ajouté, cliquez sur **Modifier**. Pour le retirer, ouvrez son menu **⋯**, choisissez **Retirer** et confirmez : ses sessions restent listées, mais pour les poursuivre il faudra configurer à nouveau l’agent. Custom est intégré : sa ligne indique « Intégré : modèles d’OpenRouter, d’Ollama et de vLLM, dans Paramètres → Modèles » et comporte un bouton **Modèles** à la place de Modifier et Retirer.

### Grok Build

**Grok Build** est l’agent de code de xAI (le programme `grok`). Cliquez sur **Ajouter** sur sa ligne, et c’est tout : l’app l’installe depuis npm (`@xai-official/grok`) la première fois qu’elle en a besoin, ou utilise une version déjà présente, y compris celle de l’installateur de xAI dans `~/.grok/bin`. Il apparaît ensuite sous **Programmes d’agents** et est tenu à jour avec les autres. Hydor l’exécute via ACP, avec les outils de l’app, ses cartes d’approbation et les modèles de Grok.

Sa connexion diffère de celle des autres agents ACP : elle ne se fait pas dans le Terminal, mais dans [Paramètres → Agents → Comptes](/settings?s=accounts), où une ligne **Grok Build** apparaît dès qu’il est ajouté (voir [Connecter Claude Code, Codex et Grok Build](#sign-claude-code-codex-and-grok-build-in)). Vous pouvez aussi y ajouter d’autres comptes Grok.

### Ajouter un agent de votre choix

Tout programme compatible ACP peut fonctionner ici.

1. Cliquez sur **Ajouter le vôtre**, à côté du titre **Vos agents**.
2. Renseignez :
   - **Nom** : comment il s’affiche dans les listes, par exemple « Gemini CLI ».
   - **Commande** : le programme à démarrer, par exemple `gemini`, ou un chemin complet.
   - **Arguments** : ce qui le démarre en mode ACP, par exemple `--experimental-acp`.
   - **Environnement (facultatif, NOM=valeur par ligne)** : les réglages dont le programme a besoin, comme une variable de clé d’API.
3. Cliquez sur **Enregistrer**.

La commande doit démarrer l’agent en mode ACP, en communiquant par son entrée et sa sortie standard.

### Agents que vous configurez dans leur propre programme

Certains agents de la liste sont des programmes que vous configurez vous-même, et quelques points diffèrent de ceux que l’app installe pour vous :

- Leur ligne dans **Plus d’agents** indique la commande ou l’adresse pour les installer. L’app n’exécute pas de script venu du web à votre place : installez-le vous-même, dans le [Terminal](/terminal) ou de la façon indiquée sur la ligne.
- Connectez-vous une fois dans le programme propre à l’agent, également dans le Terminal (par exemple, exécutez sa commande et suivez sa procédure de connexion, ou choisissez-y son modèle). L’app le démarre ensuite. Il conserve ses propres sessions et sa propre mémoire dans son propre dossier, et ses cartes d’approbation sont celles qu’il propose.
- L’un d’eux se connecte à une passerelle qui lui est propre : configurez-la d’abord, avec la commande de configuration de l’agent, et laissez la passerelle en marche.
- Quand un agent n’est pas lui-même compatible ACP, il a besoin d’un adaptateur ACP. L’app installe l’adaptateur en même temps que l’agent, tous deux avec npm dans son propre dossier, sans exécuter leurs scripts d’installation. Un agent que vous avez installé vous-même est utilisé s’il se trouve dans le PATH.
- Un agent qui n’accepte aucun serveur MCP fonctionne avec ses seuls outils : les outils de l’app (pages, recherche…) ne l’atteignent pas, et la session le signale à son démarrage. Il reçoit tout de même les consignes de l’app, les notes de mémoire et les compétences avec le premier message.

### Ce que les agents ACP peuvent et ne peuvent pas faire ici

L’app ouvre une session dans le dossier que vous choisissez, affiche les messages et les étapes de l’agent, et vous interroge chaque fois que l’agent demande une autorisation. Certaines choses fonctionnent différemment de Claude Code et de Codex :

- Il traite un message à la fois. Un message envoyé pendant qu’il travaille attend dans la file au-dessus de la zone de message et part à la fin du tour. (Custom fonctionne aussi ainsi.)
- Un agent qui ne peut pas rouvrir d’anciennes sessions repart de zéro quand vous en poursuivez une, sans la conversation précédente. La session le signale. Il en va de même quand un agent pouvait auparavant rouvrir une session mais ne le peut plus : il continue de zéro, avec une note, au lieu d’échouer.
- Les images que vous joignez ne lui parviennent que s’il accepte les images.
- Les objectifs, les forks et les transferts ne sont pas disponibles (Custom a les objectifs et les forks).
- Les outils de l’app (pages, recherche, mémoire…) parviennent à un agent comme un serveur MCP : par adresse quand l’agent l’accepte, sinon par un petit programme que l’app démarre pour lui. Un agent qui n’en accepte aucun fonctionne avec ses seuls outils, mais reçoit tout de même les consignes, les notes de mémoire et les compétences.

## D’où viennent les modèles de Custom

Custom exécute les modèles de vos forfaits Claude et ChatGPT, des modèles sur cet ordinateur et des modèles dans le cloud, avec les mêmes outils, compétences et serveurs MCP que les autres agents. Choisissez Custom sur la page de démarrage, puis le modèle. Ils viennent de trois endroits :

- **Vos abonnements** : les modèles de vos forfaits Claude et ChatGPT, via les connexions de Claude Code et de Codex sur cet ordinateur. Il n’y a rien à configurer : quand Claude Code est connecté, le menu **Modèle** de Custom propose Claude Opus, Fable, Sonnet et Haiku (toujours les plus récents de chaque famille), et quand Codex est connecté avec ChatGPT, il propose les modèles que votre forfait ChatGPT liste (par exemple GPT-6 Luna). Un programme que l’on trouve déconnecté perd ses modèles dans le menu jusqu’à ce que vous vous reconnectiez, et Codex connecté avec une clé d’API au lieu de ChatGPT n’en prête aucun. Ils consomment l’utilisation de votre forfait, pas une clé d’API et pas d’argent au jeton : une session Custom sur l’un d’eux affiche donc 0 $ pour ces étapes. Chaque compte du programme est essayé à tour de rôle, comme pour les autres tâches ponctuelles : un compte à sa limite d’utilisation ou déconnecté passe l’étape à votre compte suivant (avec **Changer de compte à une limite** activé). Une [session confidentielle](/guide/sessions#keep-a-session-confidential) ne les utilise jamais, car ils tournent sur les serveurs d’Anthropic ou d’OpenAI. Voir [Custom](/guide/custom#what-custom-is-and-when-to-use-it) pour la façon dont ils répondent.
- **Sur cet ordinateur** : les modèles installés ici (Ollama, vLLM) et les points de terminaison de votre réseau.
- **Dans le cloud** : OpenRouter, les points de terminaison ailleurs et les modèles cloud d’Ollama.

Vous pouvez les choisir partout où l’on peut choisir les modèles de Custom : la page de démarrage, le menu de modèles d’une session, les niveaux de Custom, le modèle d’appoint, et le modèle d’un agent ou d’une app.

[Paramètres → Agents → Modèles](/settings?s=models) réunit tout ce dont les modèles de Custom ont besoin. La page compte sept parties, de haut en bas :

- **Modèle d’appoint** : le modèle pour les petites tâches de l’app.
- **Niveaux** : un modèle pour chaque type de tâche (voir [Niveaux : un modèle pour chaque type de tâche](#tiers-a-model-for-each-kind-of-job)).
- **Vos abonnements** : une ligne pour Claude Code et une pour Codex, avec les modèles qu’ils prêtent à Custom. Une ligne indique « Déconnecté : reconnectez-vous pour utiliser ces modèles » avec un lien vers **Comptes**, ou « Non installé sur cet ordinateur ».
- **Sur cette machine** : ce que cet ordinateur possède, et les modèles installés ici.
- **Ajouter un modèle depuis Hugging Face** : chercher, vérifier et installer des modèles ouverts.
- **OpenRouter** : des centaines de modèles avec une seule clé, en trois groupes : votre clé, les modèles que vous avez ajoutés et une recherche pour en ajouter d’autres.
- **Environnements d’exécution et points de terminaison** : Ollama, vLLM, les autres serveurs compatibles OpenAI et un jeton Hugging Face.

Dans le menu **Modèle** de Custom, les modèles sont regroupés sous **Vos abonnements**, **Sur cet ordinateur** et **Dans le cloud**, et chaque ligne indique par où il passe : « Claude Code », « Codex », « OpenRouter », « Ollama », « vLLM » ou le nom d’un point de terminaison. Survolez un modèle pour voir où il tourne et la quantité qu’il lit d’un coup, par exemple « OpenRouter · contexte de 128K » ou « vLLM, sur cette machine · contexte de 32K · démarre à l’usage ». Les listes s’actualisent toutes seules chaque minute.

## Choisir le modèle d’appoint

Le modèle d’appoint effectue de petites tâches à côté de vos sessions, en dehors de toute conversation :

- nommer chaque nouvelle session à partir de votre demande (son titre dans la barre latérale) ;
- vérifier les étapes en mode Auto de Custom, et vérifier un objectif Custom après chaque tour ;
- ranger la mémoire environ une fois par jour, apprendre des conversations depuis, et titrer les notes de l’index par lequel les agents commencent ;
- répondre à une question sur une page web ouverte dans le navigateur ;
- lire les filtres (sites, dates, types de pages, langues) qu’énoncent les mots d’une recherche web, avant que Naget Search ne lance sa recherche (voir [Comment les agents cherchent sur le web](/guide/web#how-agents-search-the-web)) ;
- décrire des images pour un modèle Custom qui ne peut pas les voir ;
- résumer une longue réponse d’un sous-agent Hydor ;
- rédiger le brouillon d’une app ou d’une tâche planifiée à partir d’une session ;
- le mode vocal Mains libres.

Ouvrez [Paramètres → Agents → Modèles](/settings?s=models&find=Helper%20model) et cliquez sur le menu **Modèle** du groupe **Modèle d’appoint** (son (i) liste les petites tâches) :

- **Automatique** (par défaut) : Claude Haiku via Claude Code, ou Codex quand Claude Code ne peut pas répondre. Un compte à sa limite d’utilisation passe d’abord la question à votre compte connecté suivant (avec **Changer de compte à une limite** activé), et un compte déconnecté est ignoré. Quand aucun des deux programmes ne peut répondre, l’un de vos modèles Custom s’en charge (celui que le niveau **Rapide** de Custom désigne, sinon le moins cher que vous avez ajouté ; les modèles de vos forfaits sont écartés ici, puisqu’ils passent par les deux mêmes programmes), et ce n’est que lorsque rien ne peut le faire qu’une carte vous demande de vous connecter (voir [Quand un compte est déconnecté](#when-an-account-is-signed-out)). Quand rien ne répond, l’erreur en donne la raison pour chacun : « You’ve hit your weekly limit », un modèle que votre forfait Codex ne propose pas…
- N’importe lequel des modèles de Custom, regroupés comme dans le menu **Modèle** de Custom (**Vos abonnements**, **Sur cet ordinateur** et **Dans le cloud**), avec ce par quoi il passe (Claude Code, Codex, OpenRouter, Ollama, vLLM ou le nom d’un point de terminaison) et « voit les images » pour ceux qui en sont capables. Un modèle de votre forfait Claude ou ChatGPT peut aussi servir de modèle d’appoint : il répond via Claude Code ou Codex sur l’utilisation de votre forfait.

Automatique ne sait pas regarder les images. Si vous utilisez Custom avec un modèle qui ne voit pas les images, choisissez un modèle d’appoint qui les voit, sinon Custom ne peut pas faire décrire vos images.

## Voir ce que cet ordinateur peut exécuter

La section **Sur cette machine** de [Paramètres → Agents → Modèles](/settings?s=models&find=On%20this%20machine) commence par un résumé de cet ordinateur :

- **Carte graphique** : les cartes graphiques (GPU) et leur mémoire ; sur un Mac avec puce Apple, sa puce (« Apple M3 Max », dont la partie graphique partage la mémoire de l’ordinateur) ; ou « Pas de GPU » (les modèles tournent alors sur le processeur).
- **Mémoire et disque** : la mémoire de l’ordinateur, totale et libre, et l’espace libre du disque avec la place que prennent les modèles installés.
- **Tourne avec** : si **Ollama** et **vLLM** sont installés, avec leurs versions, ou un lien pour les installer.
- Avec une carte graphique, la taille de modèle qui tient : « Tient environ 30 milliards de paramètres en 4 bits sur un GPU » (sur un Mac : « Tient environ 40 milliards de paramètres en 4 bits »). Les paramètres mesurent la taille d’un modèle ; le 4 bits est une forme compressée courante qui demande environ un quart de la mémoire.

En dessous :

- **Téléchargements en cours**, chacun avec une barre de progression, la quantité déjà faite et s’il est destiné à Ollama ou à vLLM. **Annuler** en arrête un. Un téléchargement échoué ou annulé en indique la raison, avec **Ignorer**.
- **Modèles installés** (les premiers, puis **Tout afficher**), chacun avec son environnement d’exécution (Ollama ou vLLM), sa taille, des détails (comme sa taille et sa compression pour les modèles Ollama), « voit les images » lorsque c’est le cas, et s’il est en cours d’exécution.
  - Un modèle vLLM a **Début** et **Arrêter**. Il démarre tout seul quand une session l’utilise pour la première fois (le premier démarrage prend une minute ou deux), sur la carte graphique qui a le plus de mémoire libre (en 8 bits s’il n’y tiendrait pas tel quel), ou réparti sur 2, 4 ou 8 cartes quand aucune carte seule n’a la place (« tourne sur les GPU 1, 2 ») ; sur un Mac, sur sa puce Apple. Il continue de tourner, même quand l’app redémarre, jusqu’à ce que vous cliquiez sur **Arrêter**. S’il ne peut pas démarrer, la raison s’affiche en dessous.
  - **Retirer**, dans le menu **⋯** du modèle, supprime les fichiers du modèle de cet ordinateur, après confirmation. Vous pourrez le réinstaller plus tard.

Quand il n’y en a encore aucun : « Pas encore de modèle ici : ajoutez-en un depuis Hugging Face ci-dessous. »

## Ajouter un modèle depuis Hugging Face

Hugging Face est le principal site de modèles ouverts. Le groupe [Ajouter un modèle depuis Hugging Face](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) (suggestions pour cet ordinateur, ou recherche dans tout le site) en suggère quelques-uns, permet de chercher, et vous dit, avant tout téléchargement, comment chaque modèle tournerait sur cet ordinateur.

### Suggestions pour cet ordinateur

Avant que vous ne cherchiez, le groupe liste les modèles que l’app recommande et qui tournent sur cet ordinateur, selon ce qu’il possède :

- **LFM3-VL 2B** (Liquid AI) : petit et rapide, il lit les images. Tourne sur presque tous les ordinateurs.
- **Gemma 4 12B** (Google) : un polyvalent capable qui lit les images, pour un ordinateur doté d’une bonne carte graphique.
- **Flint** (Recursive) : conçu pour les agents de code, pour un Mac avec puce Apple et 32 Go ou plus.
- **GLM-5.3 Flash** (Z.ai) : parmi les modèles ouverts les plus puissants, pour un serveur avec plusieurs grosses cartes graphiques.

Chacun indique s’il tourne bien ou lentement ici, comment il tournerait (« vLLM en 8 bits, sur le GPU 0 », « vLLM, réparti sur 2 GPU », « vLLM, sur puce Apple »), sa taille de téléchargement, et **Installer**. **Le meilleur ici** marque le plus puissant de ceux qui tournent bien. Ils tournent avec vLLM par défaut ; un ordinateur qui n’a ni carte graphique NVIDIA ni puce Apple reçoit à la place la version du petit modèle pour Ollama. Un avertissement suit quand ce qui les exécute n’est pas encore configuré (« vLLM n’est pas configuré », « Ollama ne tourne pas ») : voir [Connecter Ollama, vLLM ou un autre point de terminaison](#connect-ollama-vllm-or-another-endpoint). La ligne **2 de plus pour les ordinateurs plus puissants** (ou le nombre qui convient) affiche les autres, avec ce dont chacun a besoin. La visite de bienvenue suggère les mêmes.

### Chercher et filtrer

1. Saisissez dans **Cherchez sur Hugging Face, ou collez org/name** : un nom comme `qwen3`, ou le nom complet d’un modèle (`org/name`) ou son adresse huggingface.co. Avant que vous ne saisissiez quoi que ce soit, il suggère quelques noms, ou **voir les plus téléchargés**.
2. Affinez la liste avec les filtres (vous pouvez les combiner) :
   - **Tourne bien ici** : uniquement les modèles qui tourneraient bien sur cet ordinateur.
   - **GGUF · Ollama** : les modèles au format GGUF, qu’exécute Ollama.
   - **vLLM** : les modèles au format safetensors, que vLLM exécute sur une carte graphique.
   - **Voit les images** : les modèles qui lisent aussi les images.
3. Changez l’ordre avec le menu à droite : **Les plus téléchargés**, **Tendances**, **Les plus aimés** ou **Plus récent**.

Vous obtenez jusqu’à 40 modèles, les huit premiers d’abord et **Tout afficher** pour le reste. Un modèle que vous avez nommé en entier s’affiche en premier, même si la recherche ne le liste pas, et appuyer sur Entrée le vérifie aussitôt.

Chaque ligne indique le créateur et le nom, son format (**GGUF** ou **vLLM**), **Images** s’il voit les images, **Restreint** si son créateur vous demande d’accepter d’abord des conditions, sa taille en paramètres, les téléchargements des 30 derniers jours, les mentions J’aime et la date de sa dernière modification.

### Le premier verdict

Sous chaque modèle, une étiquette colorée donne une première estimation d’après sa seule taille :

- **Tourne bien avec vLLM** ou **Tourne bien avec Ollama**, avec une vitesse approximative (« environ 40 jetons/s » ; un jeton est un morceau de mot) : il tient dans la mémoire de votre carte graphique.
- **Sur le processeur, lentement** ou **Sur le processeur, très lentement** : il ne tient que dans la mémoire de l’ordinateur, donc il tourne sur le processeur. Seul Ollama peut le faire.
- **Trop volumineux pour cet ordinateur** : il ne tient pas, ou le téléchargement ne tient pas sur le disque.
- **En 4 bits avec Ollama : tourne bien…** : le modèle tel qu’il est stocké est trop gros, mais sa version compressée en 4 bits tournerait bien avec Ollama.

Survolez l’étiquette pour voir les chiffres qui la justifient.

### Vérifier avant de télécharger

Cliquez sur **Vérifier** sur un modèle pour voir exactement comment il tournerait ici. Le panneau indique sa taille, la quantité qu’il lit d’un coup (son contexte), s’il voit les images, puis :

- Pour un modèle GGUF : « Tourne avec Ollama », et chaque taille disponible (les fichiers plus petits sacrifient un peu de qualité contre de la vitesse et de la mémoire), de la plus petite à la plus grande. Chaque ligne donne son verdict, la mémoire dont il a besoin, la vitesse approximative, et la taille du téléchargement, avec un bouton **Installer**. **Installer** est grisé tant qu’Ollama ne tourne pas ici, ou pour une taille trop grande.
- Pour un modèle vLLM : « Tourne avec vLLM, qui le démarre sur un GPU quand une session l’utilise », les mêmes chiffres, des remarques sur la carte graphique qu’il utiliserait, et un bouton **Télécharger**. Si vLLM n’est pas installé, ou si votre vLLM ne sait pas encore exécuter ce type de modèle, c’est indiqué, et quand une version GGUF existe, il propose de **vérifier** celle-ci à la place.
- Pour tout le reste : « Aucun poids que cette app puisse exécuter (safetensors pour vLLM, GGUF pour Ollama). »

Les chiffres supposent une conversation allant jusqu’à environ 32 000 jetons, la longueur donnée à un modèle sur cet ordinateur. **Fermer** replie le panneau.

### Installer, et ce qui se passe ensuite

Cliquez sur **Installer** (Ollama) ou **Télécharger** (vLLM). Le téléchargement s’affiche dans **Sur cette machine** avec sa progression. Quand il se termine, le modèle apparaît dans le menu **Modèle** de Custom. Un téléchargement vLLM interrompu reprend où il s’était arrêté quand vous réessayez. Un modèle vLLM trop gros pour une seule carte graphique est stocké en 8 bits (FP8) au démarrage, ce qui divise par deux la mémoire que prennent ses poids pour une faible perte (cartes de la série RTX 30 de NVIDIA et A100 et suivantes) ; s’il ne tient toujours pas, il est réparti sur plusieurs cartes, si elles ont ensemble la place nécessaire.

### Modèles restreints et privés

Certains créateurs demandent d’abord d’accepter leurs conditions ; leurs modèles affichent **Restreint**. Acceptez les conditions sur la page du modèle sur huggingface.co, puis ajoutez un jeton Hugging Face (voir [Jeton Hugging Face](#hugging-face-token)). Les modèles privés exigent aussi le jeton.

## Utiliser des modèles via OpenRouter

OpenRouter (openrouter.ai) vous donne accès à des centaines de modèles de nombreux éditeurs avec une seule clé, payée à l’usage.

### Ajouter votre clé

1. Obtenez une clé sur openrouter.ai (la section y renvoie).
2. Dans [Paramètres → Agents → Modèles](/settings?s=models&find=OpenRouter), cliquez sur **Ajouter la clé** dans la ligne **Votre clé OpenRouter**, collez-la dans **Votre clé OpenRouter : sk-or-…** dans la boîte de dialogue, puis cliquez sur **Enregistrer**.

La ligne affiche alors **Connecté à OpenRouter** avec le début et la fin de votre clé. **Retirer la clé**, dans son menu **⋯**, fait oublier la clé. La clé reste sur le serveur et n’est plus jamais affichée.

Vous pouvez aussi l’ajouter au moment où elle devient nécessaire : un agent qui s’apprête à créer une image, un dessin, une vidéo ou un son sans clé vous la demande sur une carte dans la conversation ([Quand un agent a besoin de la clé OpenRouter](/guide/documents-voice#when-an-agent-needs-the-openrouter-key)), et les outils d’IA des éditeurs la demandent dans leur boîte de dialogue. Dans les deux cas, elle est conservée ici.

### Modèles suggérés

Avant toute recherche, **Suggéré**, dans le groupe **Ajouter des modèles OpenRouter**, liste quatre modèles pour Custom, chacun avec sa raison : **GPT-6 Luna** (rapide et économique), **Grok 4.7** (bon, avec moins de refus), **GPT-6.1 Sol** (meilleur) et **Claude Opus 5.5** (le meilleur dans l’ensemble). **Ajouter** place un modèle dans les sélecteurs. Pour les images, la musique, les voix et les vidéos, les choix de l’app sont Seedream 5.0 Pro (et Flash, plus rapide et moins cher), Lyria 3 Pro, Seed Audio 1.0 et Seedance 2.5 : voir [Paramètres → Capacités → Images, vidéo et audio](/settings?s=images).

### Chercher dans le catalogue

Dans le même groupe, saisissez votre recherche dans **Chercher sur OpenRouter : deepseek, qwen, claude…**, ou cliquez sur l’un des noms suggérés, ou sur **voir les plus récents**. Filtres :

- **Appels d’outils** : les modèles qui appellent nativement des outils, comme Custom les utilise le mieux (**Meilleure correspondance** les place en premier).
- **Voit les images**
- **Raisonnement** : les modèles qui réfléchissent avant de répondre.
- **Libre**

Le menu à droite trie les résultats : **Meilleure correspondance** (pendant que vous cherchez par nom), **Plus récent**, **Le moins cher** ou **Contexte maximal**. Vous obtenez jusqu’à 50 modèles, les huit premiers au départ, et **Tout afficher** pour le reste.

Chaque modèle affiche son éditeur, son nom et ses étiquettes : **Dernier** (toujours la version la plus récente de l’éditeur), **Nouveau** (référencé au cours des trois dernières semaines), **Libre**, **Raisonnement**, **Images**, et **Pas d’outils natifs** (Custom décrit alors ses outils dans les instructions et lit ses appels dans son texte). Viennent ensuite : la quantité qu’il lit d’un coup (« contexte de 128K »), sa réponse la plus longue (« 16K en sortie »), son prix par million de jetons en entrée et en sortie, le mois de son référencement, une courte description et son nom OpenRouter.

### Ajouter des modèles aux sélecteurs

Cliquez sur **Ajouter** sur un modèle. Sa ligne indique alors **Ajouté**, et le modèle apparaît dans le groupe **Vos modèles OpenRouter** (« Dans les sélecteurs de modèles ») au-dessus de la recherche, ainsi que dans le menu **Modèle** de Custom. Cliquez sur le × d’un modèle pour le retirer des menus. Tant que vous n’en avez pas ajouté au moins un, OpenRouter ne propose aucun modèle (« Ajoutez au moins un modèle pour utiliser OpenRouter. »).

## Connecter Ollama, vLLM ou un autre point de terminaison

Le groupe **Environnements d’exécution et points de terminaison** connecte les programmes qui font tourner des modèles. Ouvrez-le dans [Paramètres → Agents → Modèles](/settings?s=models&find=Runtimes%20and%20endpoints).

### Ollama

Ollama est un programme gratuit qui fait tourner des modèles sur votre ordinateur, sur la carte graphique ou sur le processeur. Sa ligne indique « en cours d’exécution » avec sa version, ou « pas en cours d’exécution à cette adresse » avec un lien **Installer Ollama**. Son adresse est `http://127.0.0.1:11434` sauf si vous la changez : saisissez-en une autre dans le champ, et **Enregistrer** s’affiche à côté. Tous les modèles de cet Ollama apparaissent dans la liste des modèles de Custom, y compris ceux que vous avez téléchargés en dehors de l’app.

### vLLM

vLLM est un serveur rapide pour les modèles sur cartes graphiques NVIDIA, et la manière dont les modèles de Hugging Face s’exécutent ici par défaut. Un modèle trop gros pour une seule carte y tourne en 8 bits, ou réparti sur 2, 4 ou 8 cartes. Sur un Mac, vLLM fonctionne sur Apple silicon avec son plugin Metal (vllm-metal). L’app le trouve toute seule dans le PATH ou dans un environnement conda ou venv, et affiche sa version et son emplacement. S’il est indiqué « introuvable (pip install vllm), ou indiquez sa commande », installez-le, ou saisissez le chemin complet de sa commande `vllm` dans le champ et cliquez sur **Enregistrer** (le bouton s’affiche dès que vous saisissez quelque chose). Laissez le champ vide pour que l’app cherche elle-même.

### Autres points de terminaison compatibles OpenAI

De nombreux programmes et services répondent comme l’API d’OpenAI : LM Studio, le serveur de llama.cpp, d’autres fournisseurs. Pour en ajouter un :

1. Cliquez sur **Ajouter le point de terminaison**, à côté du titre du groupe.
2. Dans la boîte de dialogue, saisissez un **Nom**, son adresse (comme `http://localhost:1234/v1`) et une **Clé (facultatif)**.
3. Cliquez sur **Ajouter**.

Le point de terminaison s’affiche sous forme de ligne avec son adresse et le nombre de modèles qu’il propose. Ses modèles apparaissent dans la liste de Custom sous la forme « modèle (nom) ». Le × le retire. Ajouter un autre point de terminaison portant le même nom remplace le premier.

Une [session confidentielle](/guide/sessions#keep-a-session-confidential) peut utiliser un point de terminaison dont l’adresse est cet ordinateur ou votre réseau privé : `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, `172.16.…` à `172.31.…`, ou un nom se terminant par `.local`. Toute autre adresse compte comme en ligne, même si elle mène à votre propre serveur : utilisez plutôt son adresse privée. Il en va de même pour l’adresse d’Ollama, et les modèles cloud d’Ollama (leurs noms se terminent par « cloud ») comptent toujours comme en ligne.

### Jeton Hugging Face

Un [jeton Hugging Face](/settings?s=models&find=Hugging%20Face%20token) permet à l’app de télécharger des modèles à accès restreint ou privés (la ligne indique « Uniquement pour les modèles à accès restreint ou privés »). Créez-en un dans les paramètres de votre compte Hugging Face, cliquez sur **Ajouter le jeton**, collez-le dans la boîte de dialogue (il commence par `hf_`) et cliquez sur **Enregistrer**. La ligne affiche alors son début et sa fin, avec **Retirer le jeton** dans son menu **⋯**.

## Demander à un agent

- « Quels programmes d’agents sont installés ici ? Installe Gemini CLI. »
- « Claude Code et Codex sont-ils à jour ? Mets-les à jour maintenant. »
- « Ajoute OpenCode à mes agents. »
- « Ajoute Grok Build à mes agents et connecte-le avec mon abonnement Grok. »
- « Ajoute un deuxième compte Grok pour le travail, et démarre ma prochaine session avec lui. »
- « Démarre ma prochaine session Grok avec un effort xhigh. »
- « Combien me reste-t-il de mon forfait Grok cette semaine ? »
- « Utilise tous mes comptes Grok : quand l’un atteint sa limite, continue avec un autre. »
- « Ajoute Gemini CLI et Goose à mes agents, et dis-moi ce qu’il me reste à installer. »
- « Trouve sur Hugging Face un modèle qui fonctionne bien sur cet ordinateur et qui voit les images, vérifie-le, et installe la meilleure taille. »
- « Ajoute le dernier modèle DeepSeek d’OpenRouter à mes modèles. » (une fois votre clé OpenRouter configurée)
- « Choisis comme modèle d’appoint un modèle qui voit les images. »
- « Utilise le Sonnet de mon forfait Claude dans une session Custom, et montre-moi ce que cela coûte. »
- « Arrête le modèle vLLM qui tourne, pour libérer la carte graphique. »
- « Utilise tous mes comptes Claude : quand l’un atteint sa limite, continue avec un autre. »
- « Quand tous mes comptes Claude sont épuisés, continue avec mon crédit API. »
- « Quel modèle chaque niveau utilise-t-il pour Claude Code et Codex ? Fais en sorte que Max signifie Opus pour Claude Code. »
- « Pourquoi Hydor me demande-t-il de me connecter de nouveau à Claude Code ? »
- « Mon compte Claude Code est déconnecté : lesquelles de mes sessions l’attendent, et peuvent-elles continuer avec un autre compte ? »
