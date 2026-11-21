# Sessions

Une session est une conversation avec un agent, dans un dossier : vous dites ce que vous voulez, l’agent travaille, et vous suivez son travail, approuvez ce qu’il veut faire et le guidez. Cette rubrique couvre tout ce qui concerne les sessions : la page de démarrage et ses options, ce que vous voyez pendant que l’agent travaille, comment lui écrire en cours de tour, et tout ce que contient le menu d’une session, du fork et des objectifs aux worktrees et au partage.

![Une session au travail : les étapes et les réponses de l’agent, et une carte demandant d’exécuter une commande](images/sessions.webp)

## Démarrer une session

**Nouvelle session** en haut de la barre latérale ouvre la page de démarrage. Écrivez ce que vous voulez obtenir dans la zone de message, vérifiez la rangée de choix en dessous, puis appuyez sur Entrée (ou sur **Début**, ou sur la flèche ronde sur un téléphone). La page de la session s’ouvre aussitôt, avec votre message et l’agent déjà à l’œuvre (**En cours**). Si la session ne peut pas démarrer, sa page en donne la raison, et **Retour à la page de démarrage** remet votre message (et ce que vous aviez joint) dans la zone.

Si la connexion est coupée avant que l’app ne réponde (votre téléphone s’est mis en veille, ou le réseau a changé), la page affiche **Reconnexion…** puis, dès que possible, demande à l’app ce qu’est devenu votre message : la session s’ouvre si elle a démarré, et une session ne démarre jamais deux fois. Si l’app reste injoignable pendant environ une minute, la page affiche **Impossible de joindre l’app** ; **Réessayer** pose la question une nouvelle fois.

Peu après le démarrage, la session reçoit son titre : quelques mots résumant votre demande (« Week-end à Lisbonne », « Corriger les tests du paiement »), que le modèle d’appoint ([Paramètres → Agents → Modèles](/settings?s=models&find=Helper%20model)) rédige en arrière-plan, sans rien afficher dans la conversation. La barre latérale, l’en-tête de la session et la zone de recherche l’affichent (dans la barre latérale, ses mots arrivent les uns après les autres à la place de ceux de votre message), et Claude Code et Codex le reçoivent aussi, pour leurs propres listes. En attendant, et quand le modèle d’appoint ne peut pas répondre, le début de votre message en tient lieu. Un titre que vous donnez vous-même à la session avec **Renommer** n’est jamais remplacé. La barre latérale liste la session dès l’envoi, en haut de **Actives** (**Démarrage**).

La rangée sous la zone de message contient **Fonctionne avec**, **Modèle**, **Dossier** (ou **Projet**), **Agent** et, à son extrémité, **Options**. Sur un téléphone, chacun s’ouvre dans une feuille qui monte du bas de l’écran.

### Choisir l’agent et son modèle

**Fonctionne avec** liste côte à côte tous les programmes que vous pouvez utiliser :

- **Claude Code** : l’agent d’Anthropic, avec un forfait Claude ou une clé d’API.
- **Codex** : l’agent d’OpenAI, avec un forfait ChatGPT ou une clé d’API.
- **Custom** : l’agent propre à l’app, pour n’importe quel modèle : d’OpenRouter, d’Ollama ou de vLLM. Voir [Custom, l’agent propre à l’app](/guide/custom).
- Tout autre agent que vous avez ajouté et qui parle ACP (Gemini CLI, OpenCode, Qwen Code, Goose…), avec sa commande sous son nom.

En bas, **Modèles pour Custom** ouvre [Paramètres → Modèles](/settings?s=models) et **Ajouter ou gérer des agents** ouvre [Paramètres → Autres agents](/settings?s=agents). Voir [Agents, comptes et modèles](/guide/agents-models).

**Modèle** s’ouvre sur **Automatique** : la session démarre avec le modèle du niveau Meilleur, son agent principal confie les parties bien délimitées à des sous-agents de niveaux moins coûteux, et il peut passer de lui-même à celui du niveau Max quand un problème se révèle trop difficile (voir [Niveaux : un modèle pour chaque type de tâche](/guide/agents-models#tiers-a-model-for-each-kind-of-job)). En dessous, le menu ne liste que les modèles propres à l’agent choisi. Le modèle par défaut de l’agent est marqué « par défaut ». Les anciennes versions d’un modèle se cachent derrière « 2 anciens modèles » ; une longue liste a un champ **Rechercher des modèles** (Entrée choisit le premier résultat). Custom liste les modèles que vous avez ajoutés dans Paramètres → Modèles ; un autre agent ACP liste les modèles qu’il a proposés lors de sa dernière exécution, et la pastille n’apparaît qu’après cette première exécution.

### Choisir un dossier, un projet ou un nouveau dossier de tâche

La pastille **Dossier** indique où l’agent travaille. Son menu (« Projet ou dossier de travail ») comporte un champ, **Cherchez un projet ou un dossier, ou saisissez un chemin**, au-dessus de deux courtes listes, chaque ligne indiquant où se trouve l’élément :

- **Projets** : vos projets par nom, les cinq sur lesquels vous avez travaillé le plus récemment (et celui qui est choisi), chacun avec son dossier. En choisir un fixe le dossier sur celui du projet, ainsi que son agent et ses consignes pour la session ; la pastille affiche alors **Projet** et le nom du projet. Un groupe de projets fonctionne de la même façon, avec tous ses projets. **Nouveau**, au bout du titre, crée un projet (sessions, fichiers et mémoire réunis) et le choisit. Voir [Projets et connaissances](/guide/projects) et [Consignes des agents](/guide/guidelines).
- **Dossiers** : le dossier en cours et les trois derniers dossiers que vous avez choisis, chacun avec le dossier qui le contient. **Parcourir**, au bout du titre, liste les dossiers de votre dossier personnel.
- **Nouveau dossier de tâche** (« un dossier tout neuf dans ~/Hydor ») : un dossier neuf pour cette tâche, nommé d’après le jour et quelques mots de votre message (par exemple `2026-11-01-plan-trip-lisbon`), dans `~/Hydor` sauf si vous avez défini un autre emplacement dans [Dossiers de tâche](/settings?s=assistants&find=Task%20folders) (Paramètres → Capacités → Vos agents).

Le dossier propre à un projet, c’est le projet : le menu ne le liste que comme projet, et une session démarrée dedans travaille dans le projet, même si la page de démarrage avait le dossier choisi plutôt que le projet.

Le menu s’ouvre au-dessus ou au-dessous de la pastille, là où il y a le plus de place, et tient sans défilement : dans une petite fenêtre, il montre moins de dossiers, puis moins de projets, et une ligne comme « 2 de plus » sous les projets rend le reste.

Saisissez du texte dans le champ pour trouver davantage :

- Un nom trouve les projets correspondants, et des dossiers parmi ceux que vous avez utilisés récemment, dans le dossier en cours et dans votre dossier personnel. Le dossier d’un projet, trouvé par son nom, s’affiche comme le projet.
- Un chemin (`~/code/`, ou `code/` depuis votre dossier personnel) liste les dossiers qui s’y trouvent, comme le fait **Parcourir**. La flèche au bout du champ remonte d’un dossier ; la croix, ou Échap, revient aux listes.
- ↑ ↓ et Entrée choisissent. Tab, ou la flèche au bout d’une ligne, liste les dossiers qu’elle contient.

Quand le dossier se trouve dans un dépôt git (et que vous n’avez pas choisi de nouveau dossier de tâche), le menu se termine par un interrupteur : **Nouveau worktree à partir de main** (ou de la branche active), « Une nouvelle branche, dans une copie du » dépôt. Une fois activé, la session travaille dans sa propre copie, sur une nouvelle branche ; la pastille affiche « · nouveau worktree ». Voir [Travailler dans un worktree](#work-in-a-worktree).

Qu’une session reçoive ou non un nouveau dossier de tâche par défaut dépend de l’agent : la plupart en démarrent un sauf si vous choisissez un dossier ; Développeur travaille dans le dossier que vous choisissez, et un agent propre à un projet dans ce projet.

### Choisir un agent

**Agent** définit en tant que qui la session travaille : **Général** (tant que vous n’en choisissez pas un autre ; dans un projet qui a son propre agent, cet agent), **Chercheur**, **Rédacteur**, **Développeur**, **Tuteur**, **Planificateur**, **Analyste**, **Créateur d’apps**, ou l’un des vôtres sous **Les vôtres** (ceux qui travaillent partout, et ceux du projet choisi). Pointez-en un pour lire ce qu’il fait, ainsi que le programme et le modèle qu’il utilise. En choisir un peut aussi définir le programme, le modèle et les autorisations qu’il suggère (le modèle de son niveau, quand il en utilise un), et activer ses apps connectées. **Créer ou modifier des agents** ouvre la [page Agents](/agents). Voir [Agents](/guide/agents).

### Options : effort, autorisations et plus

**Options** contient le reste. Sa pastille affiche « Options », ou nomme ce que vous avez réglé hors du réglage habituel, par exemple « Effort élevé · Planifier · plafond de 5,00 $ ». Sur un ordinateur, son menu se termine par un rappel : Maj+Tab dans la zone de message change les autorisations.

- **Effort** : l’intensité de réflexion du modèle. **Par défaut** utilise celle du modèle, puis viennent les niveaux que le modèle propose : **Bas** (rapide, raisonnement léger), **Moyen** (équilibré), **Élevé** (raisonnement plus poussé), **Xhigh** (raisonnement très poussé), **Max** (raisonnement maximal), et sur certains modèles **Minimal**, **Aucun** ou **Ultra**. Non proposé pour Custom et les autres agents ACP, ni pour les modèles sans niveaux.
- **Autorisations** : ce que l’agent peut faire sans vous demander d’abord. Chaque agent a ses propres modes ; voir [Ce que signifie chaque mode d’autorisation](#what-each-permissions-mode-means). Maj+Tab dans la zone de message passe au suivant.
- **Compte** : seulement si vous avez ajouté un autre compte pour Claude Code ou Codex dans [Paramètres → Agents → Comptes](/settings?s=accounts&find=Accounts). **Votre connexion** est le compte propre à l’agent ; choisissez-en un autre pour exécuter cette session avec lui. **Gérer les comptes** ouvre les Paramètres.
- **Confidentielle**, un interrupteur avec un cadenas (« Uniquement des modèles sur cet ordinateur. Rien n’en sort. ») : pour un article que vous relisez, des données de patients ou le code d’un client. **Fonctionne avec** devient **Custom** et **Modèle** le meilleur modèle installé ici. Voir [Garder une session confidentielle](#keep-a-session-confidential).
- **Mémoire** : seulement lorsque la mémoire est activée dans les Paramètres. **Activé** utilise ce dont les agents se souviennent et y ajoute des éléments ; **Désactivée pour cette session** repart de zéro et n’en conserve rien. Voir [Mémoire](/guide/memory).
- **Plafond de dépenses** : le maximum que cette session peut dépenser, aux tarifs de l’API. Saisissez un montant et appuyez sur **Fixer**, ou choisissez 1 $, 5 $, 10 $ ou 25 $ ; **Aucun plafond** le retire. La session s’arrête au plafond tant que vous ne le relevez pas. Voir [Utilisation, limites et coûts](/guide/usage).
- **Essaim** : **Désactivé** ; **Essaim** : un agent principal découpe la tâche en pistes d’attaque et lance un membre pour chacune, avec autant de membres au travail en même temps que le permet **Taille de l’essaim** ([Paramètres → Capacités → Sous-agents](/settings?s=children&find=Swarm%20size)). Les membres partagent leurs trouvailles sur un tableau de bord et s’envoient des messages. Pour les problèmes difficiles ; cela coûte plusieurs fois ce que coûte un seul agent. Ou **Campagne** (« Un gros changement en plusieurs parties, chacune dans un worktree ») : l’agent principal découpe un gros changement en parties, les membres en réalisent chacun une sur leur propre branche avec ses tests, et l’agent principal les fusionne ; le dossier doit être un dépôt git (voir [Campagnes](/guide/engineering#campaigns-a-big-change-in-many-parts)).
- **Recherche** : **Désactivé**, ou **Recherche approfondie** : l’agent planifie les recherches, envoie des chercheurs sur chaque partie, vérifie les affirmations clés auprès de deux sources et livre un rapport avec citations. Réglez **Chercheurs à la fois** (de 1 à 8), **Tours** (de 1 à 5), **Total des recherches** (de 10 à 500) et **Le rapport** (**Page** ou **Word**).
- **Arène** : **Désactivé**, ou **Comparer des modèles** : le même message part aussi vers un ou deux autres modèles que vous cochez (un champ **Trouver un modèle** aide dans une longue liste), chacun dans une session distincte dans le même dossier. Vous comparez les réponses et gardez la meilleure ; les autres sont archivées. Dans un dépôt git, activez **Nouveau worktree** dans le menu du dossier pour que chaque modèle travaille sur sa propre copie.

L’essaim (ou une campagne) et la recherche approfondie dirigent tous deux des sous-agents Hydor : en activer un désactive l’autre. **Confidentielle** désactive l’essaim, la recherche approfondie et l’arène, et activer l’un d’eux désactive Confidentielle. L’essaim, la recherche approfondie et l’arène ne sont pas conservés pour la session suivante, car ils coûtent plus cher ; les nombres de la recherche et les modèles de l’arène que vous avez choisis sont conservés dans ce navigateur pour quand vous les réactiverez. Voir [Recherche approfondie, seconds avis et plusieurs agents](/guide/research).

### Ce que signifie chaque mode d’autorisation

**Claude Code**

| Mode | Ce que l’agent peut faire |
| --- | --- |
| Demander (par défaut) | Demande avant les modifications et les commandes qui ne sont pas autorisées dans ses paramètres |
| Accepter les modifications | Modifie les fichiers librement, demande avant les autres commandes |
| Auto | Une vérification de sécurité approuve les actions courantes et vous interroge sur les actions risquées |
| Planifier | Lit et planifie uniquement, puis propose un plan que vous approuvez |
| Contourner | Ne demande jamais (accès complet) |

**Codex**

| Mode | Ce que l’agent peut faire |
| --- | --- |
| Planifier | Discute et planifie d’abord ; peut vous poser des questions de clarification |
| Lecture seule | Lit les fichiers et répond ; demande avant de changer quoi que ce soit |
| Auto (par défaut) | Modifie les fichiers et exécute des commandes dans son dossier ; demande pour en sortir |
| Revue auto | Comme Auto, mais un agent relecteur répond à ses demandes d’approbation |
| Accès complet | Ni bac à sable ni approbations |

Dans Docker, le bac à sable propre à Codex ne peut pas démarrer ; **Accès complet** y est donc le mode par défaut et le menu en donne la raison.

**Custom**

| Mode | Ce que l’agent peut faire |
| --- | --- |
| Demander (par défaut) | Demande avant de modifier des fichiers et avant d’exécuter des commandes ; l’exploration se fait librement |
| Accepter les modifications | Modifie librement les fichiers du dossier, demande avant d’exécuter des commandes |
| Auto | Les étapes courantes avancent ; une vérification rapide vous interroge sur les actions risquées |
| Accès complet | Exécute des outils et des commandes sans demande d’approbation ni bac à sable de commandes, avec les droits de votre compte sur l’ordinateur |
| Planifier | Lit et planifie uniquement : ni modifications ni commandes |

Hors Accès complet, Custom vous demande avant les commandes risquées. Dans les modes Demander, Accepter les modifications et Planifier, il demande aussi avant de lire ou de modifier des fichiers situés hors du dossier, ou des fichiers qui contiennent des clés ou des mots de passe ; en mode Auto, la vérification rapide les évalue d’abord. Voir [Custom, l’agent propre à l’app](/guide/custom).

**Les autres agents ACP** proposent leurs propres modes, listés une fois que l’agent a été exécuté.

### Garder une session confidentielle

Certains travaux ne doivent pas quitter votre ordinateur : un article qu’on vous a envoyé à relire (la plupart des conférences et des revues interdisent de confier une soumission à une IA en ligne), des dossiers de patients ou de clients, ou le code d’une entreprise sur lequel vous travaillez sous accord. Une session confidentielle s’exécute sur un modèle présent sur cet ordinateur, et rien n’en est envoyé ailleurs.

1. Sur la page de démarrage, ouvrez **Options** et activez **Confidentielle** (« Uniquement des modèles sur cet ordinateur. Rien n’en sort. »). Sa pastille affiche alors « Confidentielle ».
2. **Fonctionne avec** devient **Custom** et **Modèle** le meilleur modèle installé ici ; tant qu’elle est active, leurs menus ne proposent que ceux-là. S’il n’y en a pas encore, le menu le dit : [Paramètres → Agents → Modèles](/settings?s=models) installe en un clic ceux qui sont suggérés pour cet ordinateur.
3. Écrivez ce que vous voulez, joignez l’article ou choisissez son dossier, puis appuyez sur Entrée. Par exemple : « Relis la soumission jointe comme un relecteur de NeurIPS : résumé, points forts, points faibles, questions aux auteurs et une note. »

Les modèles sur cet ordinateur sont ceux d’Ollama et de vLLM installés ici, ainsi que les points d’accès dont l’adresse est cet ordinateur ou votre réseau privé : `localhost`, `127.0.0.1`, `::1`, `10.…`, `192.168.…`, de `172.16.…` à `172.31.…`, ou un nom se terminant par `.local` (voir [Connecter Ollama, vLLM ou un autre point d’accès](/guide/agents-models#connect-ollama-vllm-or-another-endpoint)). Les modèles cloud d’Ollama, dont le nom se termine par « cloud », s’exécutent sur ollama.com et ne comptent pas. La page de démarrage garde l’interrupteur activé pour vos prochaines sessions jusqu’à ce que vous le désactiviez.

Une session confidentielle a un cadenas à côté de son titre, dans son en-tête et dans la barre latérale, et sa zone de message a une bordure verte apaisante ; une ligne au-dessus de la zone explique ce que cela signifie jusqu’à ce que vous la fermiez. Cliquez sur le cadenas pour voir ce qui est actif et ce qui ne l’est pas.

- **Désactivé** : la recherche web et les pages web, le navigateur et votre écran, les apps connectées et vos clés, les apps, la publication, les tâches planifiées, la création, la recherche ou la modification d’images, de dessins, de graphiques, de vidéos ou de sons, les modèles hébergés ailleurs (recherche approfondie, essaim et arène ; un [second avis](/guide/research) ne peut venir que d’un modèle d’un autre éditeur présent sur cet ordinateur), la transmission de la conversation à un autre agent, l’enregistrement de quoi que ce soit dans la mémoire, et l’exportation d’une page sous forme de fichier (exportez-la vous-même depuis la page).
- **Commandes sans réseau** : les commandes de l’agent s’exécutent coupées du réseau, dans tous les modes d’autorisation, de sorte que rien ne peut être téléchargé, installé depuis internet, poussé ou envoyé. Là où c’est impossible (Windows, certains conteneurs), chaque commande vous demande d’abord, quel que soit le mode, et la note du cadenas le précise.
- **Toujours actif** : les fichiers du dossier, les documents (lus sur cet ordinateur), les pages, images et fichiers que vous avez conservés, les connaissances partagées, vos notes de mémoire et votre profil (lus, jamais enrichis), les sous-agents Hydor, eux aussi confidentiels, et les UI de réponse (sans images ni cartes venues du web).
- **Rien n’est envoyé à son sujet** : son titre vient du modèle d’appoint quand il s’exécute sur cet ordinateur, sinon des premiers mots de votre message ; les notifications disent seulement « Une session confidentielle » et si elle est terminée, a besoin de vous ou a échoué ; il n’y a ni lien en lecture seule, ni pull request depuis son menu, ni automatisation ou app créée à partir d’elle ; les agents d’autres sessions et les agents ailleurs ne peuvent pas la lire ; ses réponses n’affichent aucune image venue du web, et les pages qu’elle affiche ne chargent rien depuis l’extérieur (un graphique qui a besoin d’une bibliothèque du web ne s’affichera donc pas) ; la dictée ne fonctionne qu’avec une reconnaissance vocale sur cet ordinateur ([Paramètres → Capacités → Voix](/settings?s=voice)), et les réponses ne sont lues à voix haute qu’avec une voix de votre appareil.
- **Elle reste confidentielle** : les copies et **Modifier à partir d’ici** sont confidentiels aussi, et on ne peut pas la rendre non confidentielle, afin que ce qui a été dit reste là où c’est. Pour un travail qui peut quitter l’ordinateur, démarrez une nouvelle session.

Ce qu’elle ne peut pas promettre : Hydor vérifie où se trouve le serveur d’un modèle, pas ce que fait ce serveur ; un point d’accès que vous avez configuré sur votre réseau et qui transmet les requêtes à un service en ligne reste donc en ligne. Ce que vous copiez de la session, ou ouvrez ou envoyez vous-même depuis ailleurs (un lien dans une réponse, une page qu’elle a créée ouverte depuis les fichiers du projet, un push depuis la page Git), c’est à vous de le surveiller, tout comme ce que vous en lisez sur un autre appareil : les pages de l’app y parviennent comme d’habitude (par votre tunnel, si vous en utilisez un).

### Joindre des fichiers, désigner des fichiers, utiliser des commandes

- **Joindre des fichiers** (le **+** à gauche de la rangée du bas de la zone), déposez des fichiers sur la zone de message, ou collez-y des images et des fichiers. Un message peut porter jusqu’à 25 Mo de fichiers. Les images (PNG, JPEG, GIF, WebP) sont transmises au modèle comme images, jusqu’à 8 par message ; les autres fichiers (jusqu’à 20) sont enregistrés sur cet ordinateur et listés à la fin de votre message, pour que l’agent les ouvre. Retirez-en un avec son × avant l’envoi. Les fichiers joints attendent dans la zone jusqu’à l’envoi, même si vous allez sur une autre page (recharger la page les efface).
- **Joindre une capture d’écran** (dans le même menu **+**, sur ordinateur ; là où le navigateur ne peut pas en faire une, le **+** est un trombone qui joint des fichiers) : votre navigateur demande quel écran, quelle fenêtre ou quel onglet, et une image de celui-ci est jointe.
- **@** : saisissez @ et une partie du nom d’un fichier pour lister les fichiers correspondants du dossier ; ↑ ↓ pour se déplacer, Entrée ou Tab pour l’insérer, Échap pour fermer.
- **/** : tout au début du message, / liste les commandes et les compétences de l’agent (celles de Claude Code), avec ce que fait chacune.
- Le microphone (dicter votre message) et le casque (mode vocal Mains libres) se trouvent près du bouton d’envoi quand votre navigateur ou cet ordinateur peut reconnaître la parole. Voir [Documents, images, vidéos et voix](/guide/documents-voice).

### Ce dont la page de démarrage se souvient

La page de démarrage conserve ses choix pour chaque endroit où vous travaillez : chaque projet, chaque dossier et **Nouveau dossier de tâche**, sur tous vos appareils. Un endroit conserve son **Fonctionne avec** (le programme), le **Modèle** de chaque programme et, sous **Options**, son **Effort** et ses **Autorisations**, l’**Agent**, la **Mémoire**, le **Plafond de dépenses**, **Confidentielle** et l’interrupteur **Nouveau worktree**. Le compte (**Options → Compte**) n’est pas conservé par endroit : il reste celui que vous avez choisi, partout. Choisir un programme dans un endroit rétablit ce que vous y aviez utilisé en dernier avec lui.

Un endroit conserve ses choix dès que vous en modifiez un ou que vous y démarrez une session ; le simple fait de le regarder ne conserve rien. Choisissez un endroit dans la pastille **Dossier** (un projet, un dossier ou **Nouveau dossier de tâche**) et la zone s’ouvre avec les choix de cet endroit, tandis que ce que vous avez écrit et joint y reste. Démarrer depuis un projet (**Nouvelle session** sur sa carte ou sa page, ou le projet dans la barre latérale) ouvre la page de démarrage avec les choix de ce projet, et **Nouvelle session dans ce dossier** sur un dossier (dans Fichiers ou dans la barre latérale) l’ouvre avec les choix de ce dossier. La page s’ouvre dans l’endroit que vous aviez choisi en dernier.

Un endroit où vous n’avez encore rien choisi ni démarré s’ouvre avec les réglages par défaut : l’agent est **Général**, ou l’agent propre au projet quand il en a un (et ce que cet agent suggère s’applique, comme lorsque vous le choisissez : son programme, le modèle de son niveau et ses autorisations) ; le **Modèle** est **Automatique** là où il est proposé, sinon celui par défaut du programme ; **Effort** et **Autorisations** sont ceux habituels du programme ; la mémoire est activée ; il n’y a pas de plafond de dépenses ; **Confidentielle** et **Nouveau worktree** sont désactivés. **Fonctionne avec** reste le programme que vous avez utilisé en dernier. L’endroit que vous aviez choisi en dernier avant l’ajout de cette fonction garde les choix que vous aviez faits.

Un lien vers la page de démarrage peut la remplir, par exemple `/?prompt=Summarize%20my%20notes&agent=codex` ; on peut y ajouter `model=`, `cwd=` (le chemin d’un dossier) et `confidential=1` (Confidentielle activé). Il ne fait que remplir la zone et les choix ; il ne démarre jamais rien tout seul. Les caractères invisibles sont retirés d’un message venu d’un lien, avec un avis.

Ce que vous écrivez dans la zone y attend pendant que vous allez sur d’autres pages : le message, les fichiers joints, les options propres à cette seule tâche (**Essaim**, **Recherche approfondie**, **Arène**, **Consignes** pour cette session) et le dossier dans lequel un lien ou **Nouvelle session d’agent ici** l’a ouverte. La zone se vide au démarrage de la session : pendant que l’agent se met en route, la flèche de **Début** continue de monter ; puis la page de démarrage devient la session, la zone descendant à sa place en bas et ce que vous avez écrit remontant comme votre premier message. Le message et ces options sont conservés dans ce navigateur, ils sont donc encore là après un rechargement ; les fichiers joints, non.

## Suivre le travail dans une session

### L’en-tête

En haut d’une session :

- l’icône de l’agent et le titre (double-cliquez dessus pour le renommer), et un cadenas pour une [session confidentielle](#keep-a-session-confidential) ;
- un statut : **En cours**, **Votre intervention est requise**, **Prêt**, **Démarrage**, **Construction de la mémoire**, **Arrêt en cours**, ou « Open in VS Code » pour une session qui s’exécute ailleurs ; une fois que son agent ne tourne plus, la façon dont le travail s’est terminé : **Terminé** quand son dernier tour est fini (avec « · 2 fichiers créés » ou « · 3 fichiers modifiés » quand il a créé ou modifié des fichiers), **Arrêtées** quand vous l’avez arrêtée ou qu’elle a été coupée avant la fin, **Échec** quand elle s’est terminée par une erreur. Pointez dessus pour savoir quoi faire ensuite ;
- le dossier (cliquez dessus pour le parcourir dans Fichiers), un badge de pull request, le compte quand elle s’exécute avec un compte ajouté, et sur les écrans plus larges la branche Git et le modèle ;
- un bouton pour ce que vous pouvez faire maintenant : **Arrêter** pendant qu’un tour s’exécute, **Reprendre** quand l’agent ne tourne pas (après **Arrêtées** ou **Échec** ; plus discret après **Terminé**, puisqu’un message dans la zone de saisie poursuit de toute façon la session), ou **Continuer ici** pour une session Claude Code ouverte dans VS Code ou dans un terminal ;
- **Détails** (qui affiche les lignes ajoutées et supprimées une fois que des fichiers ont changé), qui ouvre [le panneau des détails](#the-details-panel-changes-commands-and-info) ;
- le menu de la session (⋯) : voir [Tout ce que contient le menu de la session](#everything-in-the-sessions-menu).

### Tours, étapes et réponses

La conversation se lit comme un chat. Chaque tour comprend votre message, le travail de l’agent et la réponse qui le conclut :

- **Votre message** s’affiche à droite, avec ses images et ses fichiers joints, dès que vous l’envoyez, avant même que l’agent l’ait reçu : l’agent apparaît au travail en dessous, et la zone de saisie est libre pour votre message suivant. S’il ne part pas (pas de connexion, plafond de dépenses atteint), il disparaît de la conversation et revient dans la zone de saisie, avec un avis qui en donne la raison. Un message long est replié sur ses premières lignes ; **Afficher plus** l’ouvre.
- **Le travail** se trouve sous une ligne qui le résume : « Worked for 2m 10s · 3 commands », « Thought », « Stopped after 40s » ou « Failed after 5s », avec à droite ce que le tour a coûté (« ≈ 0,12 $ ») : cliquez dessus pour voir la [durée et le coût](/guide/sessions#a-turns-time-and-cost) du tour. Avec un forfait (Claude Code, Codex), c’est ce que coûteraient ses jetons aux tarifs de l’API, pas ce que vous payez ; si le prix du modèle n’est pas connu, ce sont les jetons qui s’affichent à la place. Pendant l’exécution du tour, la ligne indique « Working · 1m 2s » (ou « Waiting for you ») et le plan du travail s’allonge au fur et à mesure ; après des tours précédents, elle ajoute depuis combien de temps la session travaille au total, tous ses tours confondus : « Working · 1m 2s (47m) ». Un tour terminé replie son travail ; cliquez sur la ligne pour l’ouvrir.
- **Le plan du travail** : chaque courte note que l’agent écrit entre ses étapes (ce qu’il a trouvé, ce qu’il fait ensuite) ouvre une partie, et les étapes qu’il accomplit ensuite s’y rangent. Une partie terminée tient en une ligne avec une coche : la note en quelques mots (« Run the checkout tests first to see what fails », « Apply the discount first and round once »), le nombre d’étapes accomplies et les lignes modifiées. Cliquez dessus pour voir la note entière et chaque étape. La partie en cours affiche la note de l’agent en entier et, en dessous, l’étape en cours, par exemple « Editing total.ts · 4 s » ; cliquez sur cette ligne pour voir les étapes de la partie jusqu’ici. Les étapes accomplies avant la première note de l’agent forment une partie nommée d’après ce qu’elles ont fait (« Ran 3 commands, read 2 files »). Un tour long affiche ses dernières parties ; **Show 12 earlier parts** affiche le reste.
- Les **étapes** sont nommées en mots simples : « Run the tests », « Read index.ts », « Searched the web », avec la commande elle-même en caractères plus discrets. Cliquez sur l’une d’elles pour voir ce qu’elle a fait. Claude Code exécute de lui-même une commande, ou une autre étape qui modifie des choses ; les étapes propres à Hydor que l’agent a demandées après celle-ci dans le même message (recherches sur le web, lectures de pages…) attendent qu’elle soit terminée. Une telle étape affiche discrètement **En attente** à la place de son chronomètre, jusqu’à ce qu’elle démarre réellement ; son chronomètre compte alors à partir de ce moment, et une étape terminée affiche le temps qu’elle a réellement pris. La ligne du plan pour l’étape en cours nomme l’étape réellement en cours d’exécution.
- Les **réflexions** s’affichent sous la forme « Thought for 12s » avec leur premier titre ; cliquez pour les lire.
- **La réponse** est ce que l’agent a écrit après sa dernière étape. Les pages que l’agent a montrées l’accompagnent. Pendant que l’agent travaille, une courte note écrite après sa dernière étape s’affiche dans le plan, comme la partie en cours ; si le tour s’arrête là, elle devient la réponse.
- **Les réponses entre deux étapes** : ce que l’agent écrit entre ses étapes et qui se lit comme une réponse (sa réponse à un message que vous avez envoyé pendant qu’il travaillait, ou ce qu’il a trouvé avant de poursuivre, en plusieurs paragraphes, une liste ou un tableau) s’affiche aussi comme une réponse, à sa place, sans être replié dans le travail. Le travail qui précède et celui qui suit se trouvent chacun sous leur propre ligne, par exemple « Worked for 20s · 2 commands ».
- **Fichiers modifiés** : sous la réponse, une carte liste chaque fichier modifié par le tour, avec les lignes ajoutées et supprimées. Cliquez sur un fichier pour voir son diff ; **Ouvrir le fichier** l’ouvre. Au-delà de cinq, les fichiers sont repliés derrière « Show 3 more files ».
- **Documents créés** : sous la réponse, les documents que l’agent a créés ou modifiés pendant le tour (PDF, Word, Excel, PowerPoint, LaTeX, notebooks, Markdown et bien d’autres) s’affichent sous forme de cartes marquées **Nouveau** ou **Mise à jour**, qu’il vous les ait remis ou non, et les noms et chemins de fichiers dans la réponse sont des liens qui ouvrent le fichier dans une fenêtre au-dessus de la conversation ([Documents qu’il a créés ou modifiés](/guide/documents-voice#documents-it-made-or-changed-and-file-names-in-its-reply)).
- **Commits** : quand l’agent a fait des commits pendant le tour, une pastille sous la réponse l’indique : **Commit effectué** · le titre du commit, ou « 3 commits » avec les branches, et les lignes ajoutées et supprimées. Cliquez dessus (s’il y en a plusieurs, puis sur un commit) pour lire le message en entier, son auteur et sa date, son hash (cliquez pour le copier) et chaque fichier modifié avec son diff. **Ouvrir dans Git** l’ouvre dans le dépôt de la session sur la [page Git](/git). Un commit que l’agent a modifié ou supprimé par un rebase dans le même tour n’est pas pris en compte.

L’agent peut aussi tenir une liste de tâches (**Plan** ou **À faire**, avec le nombre d’éléments terminés), qui se coche au fil du travail. Les notes de l’app suivent le tour dont elles parlent : ce que la mémoire a retenu, un second avis, un plafond de dépenses atteint, la carte des sous-agents lancés par un tour. Les messages d’autres sessions s’affichent sous la forme « From … », la réponse d’un sous-agent (Hydor, Claude Code ou Codex) sous la forme « Reply from … » (cliquez dessus pour la lire), et l’exécution d’une tâche planifiée commence par une ligne qui nomme la tâche.

Des lignes de jour (« Yesterday », « Today ») séparent les journées ; une conversation entièrement d’aujourd’hui n’en a pas. Les messages plus anciens se chargent quand vous remontez, ou avec **Afficher les messages précédents**. Les nouveaux messages et les réponses arrivent à la fin de la conversation, sans laisser d’espace vide en dessous. Dès qu’une réponse est assez longue pour remplir l’écran, la vue s’arrête sur sa première ligne et y reste pendant qu’elle s’allonge : vous lisez ainsi une longue réponse depuis son début ; une réponse courte se place simplement sous ce qui précède. Si vous remontez pendant que l’agent travaille, la vue reste là où vous êtes ; **Dernier** vous ramène à la fin, et s’affiche aussi quand une réponse continue de s’écrire sous l’écran.

Sous chaque réponse terminée se trouvent **Copier le message**, **Dupliquer à partir de cette réponse** et **Lire à voix haute**. **Dupliquer à partir de cette réponse** fonctionne sur n’importe quelle réponse de Claude Code, et sur la dernière réponse d’un tour terminé pour Codex et Custom, puisque ceux-ci dupliquent un tour entier. Sous chacun de vos messages, **Copier le message**, **Modifier à partir d’ici** et l’heure d’envoi sont toujours affichés, et pas seulement au survol.

### La durée et le coût d’un tour

Le coût à droite de la ligne d’un tour terminé (« ≈ 0,12 $ », ou les jetons quand aucun prix n’est connu pour le modèle) ouvre **Durée et coût**, pour comprendre pourquoi un tour a été long ou coûteux :

- **Durée** : une barre qui montre où le temps du tour est passé, chaque partie avec sa part et sa durée : **Le modèle** (lecture de ce qu’on lui a donné, réflexion et écriture), **Commandes**, **Lecture et modification de fichiers**, **Le web**, **Autres étapes** (sous-agents, outils des apps connectées), **En attente de votre réponse** (approbations, questions et formulaires, depuis l’arrivée de chaque carte jusqu’à votre réponse) et **Le reste** (démarrage et intervalles entre les étapes). Les étapes exécutées en parallèle ne comptent qu’une fois. En dessous, « First reply or step after 3 s » : le délai avant que l’agent s’y mette.
- **Jetons** : **Lu à neuf** ; **Écrit dans le cache** (lu à neuf et conservé par le fournisseur du modèle, pour que la requête suivante le lise à moindre coût) ; **Lu depuis le cache**, avec sa part de tout ce qui a été lu ; et **Généré** (réponses, réflexions et étapes).
- **Coût** : le coût du tour et, quand le prix du modèle est connu, celui de chaque catégorie, avec « The cache saved about $0.80. ». Avec un forfait (Claude Code et Codex, sauf si une session utilise du crédit d’API), il indique « At API prices: on a plan you pay your plan's fee ». Si le prix du modèle n’est pas connu, il indique que son coût n’est pas comptabilisé.

Les tours de Claude Code donnent le temps propre du modèle et la première réponse ; pour les autres agents, la part du modèle correspond à sa réflexion. Le coût et ce panneau s’affichent sur les écrans plus larges.

### Maths, diagrammes, figures et images dans les réponses

Les agents rédigent leurs réponses pour cette app, pas pour un terminal : une réponse peut donc contenir davantage que du texte. Tous les agents savent le faire, et s’en servent d’eux-mêmes quand cela rend une réponse plus claire :

- **Mise en forme** : titres, listes, tableaux, gras et code, disposés pour être lus facilement.
- **Maths** : des équations dessinées comme dans un manuel, au milieu d’une phrase ou isolées sur leur propre ligne, et des équations chimiques (2H₂ + O₂ → 2H₂O). Les nombres entre deux signes dollar (`$1$`, `$0$`) sont aussi des maths ; les prix ordinaires comme 4,70 $ restent de l’argent.
- **Diagrammes** : organigrammes, diagrammes de séquence et d’états, frises chronologiques, cartes mentales, diagrammes de Gantt et graphiques en secteurs, dessinés aux couleurs de l’app, en thème clair ou sombre. La barre au-dessus de chacun propose **Afficher le code** (ce que l’agent a écrit ; le même bouton réaffiche le diagramme), **Enregistrer en tant qu’image (SVG)**, **Plein écran** et un bouton qui copie son code. Un diagramme qui ne peut pas être dessiné affiche son code, avec la raison.
- **Figures et petits outils** : un graphique, une figure annotée, une calculatrice, une simulation avec curseurs ou un court quiz s’exécute dans la réponse, isolé de l’app et de vos fichiers comme les pages que montrent les agents. Il adopte l’apparence de l’app et s’agrandit pour s’adapter (**Tout voir** ouvre un élément très haut) ; sa barre propose **Afficher le code** (**L’afficher** permet de revenir), **Enregistrer en tant que fichier** et **Plein écran**. Les choix sur lesquels vous cliquez sont envoyés dans votre zone de saisie. Tant que la réponse s’écrit, il se construit sur place (« Writing… » tant qu’il n’a rien à montrer), et il prend vie une fois complet.
- **Images** : des photos venues du web (un lieu, un produit, une plante, une œuvre d’art) et des images présentes sur cet ordinateur, ajustées à la réponse ; cliquez sur l’une d’elles pour la voir en grand, où **Modifier** l’ouvre dans l’éditeur d’images ([Modifier des images et des vidéos](/guide/library#edit-pictures-and-videos)). Les images du web passent par le serveur de cette app, si bien que le site qui les héberge ne voit jamais votre navigateur. Une image qui ne peut pas se charger s’affiche sous forme de lien.

Pour obtenir du texte brut à la place, dites-le dans vos [Consignes des agents](/guide/guidelines) (« Réponds en texte brut, sans diagrammes ni images ») ou dans votre message. Vous pouvez aussi demander n’importe lequel de ces éléments en termes simples : « dessine les étapes sous forme d’organigramme », « montre-moi une image de ça », « donne-moi un curseur pour essayer d’autres valeurs ».

### UI de réponse : cartes, graphiques et cartes géographiques dans les réponses

Quand une partie d’une réponse est faite pour être regardée, comparée, choisie, suivie, essayée ou travaillée plutôt que lue, l’agent la présente dans l’une des UI de réponse de l’app : près de 150 cartes, tableaux, graphiques, cartes géographiques, galeries, frises chronologiques et petits outils prêts à l’emploi, remplis avec le contenu même de la réponse. La plupart des réponses de plus de quelques lignes en contiennent une partie, vous en verrez donc dans la plupart d’entre elles. Des options à comparer deviennent un tableau où la meilleure valeur de chaque ligne est signalée, une recette une carte dont les portions ajustent les quantités, des prévisions les heures et les jours à venir, des lieux une carte géographique avec des repères numérotés, un quiz ou des exercices d’entraînement des questions auxquelles vous répondez sur place. Chacune se construit au fil de la réponse, avec l’apparence de l’app, en thème clair ou sombre.

- **Ce que vous pouvez faire dans une UI** : trier et filtrer un tableau, basculer un graphique vers ses chiffres, cocher une liste, lancer les minuteurs d’une recette, retourner des cartes mémoire, associer des paires ou remplir des blancs, répondre aux questions d’un guide de dépannage, faire tourner une roue pour choisir à votre place, déplacer les curseurs d’une calculatrice ou d’un tracé de fonction, lire une vidéo. Ce que vous cochez ou ce à quoi vous répondez y est encore quand vous revenez à la conversation sur cet appareil (les réponses aux exercices aussi). Un bouton qui indique **Envoyer** (**Envoyer mon choix**, **Envoyer mon score**, **Envoyer mon résultat**, **L’envoyer** et les boutons du même genre) envoie aussitôt ce qu’il nomme comme votre message suivant, comme si vous l’aviez tapé et appuyé sur Entrée : l’option choisie, votre score au quiz, l’endroit où la roue s’est arrêtée. **Envoyé** à côté indique que c’est parti. Ce que vous êtes en train d’écrire reste dans la zone de saisie ; quand la session ne peut pas recevoir de message à cet instant (un autre est encore en route), les mots sont placés dans la zone de saisie, pour que vous les envoyiez. Certaines vont plus loin :
  - Les **Exercices d’entraînement** auxquels vous répondez avec vos propres mots ou chiffres sont vérifiés sur-le-champ (un nombre dans une marge de tolérance, des mots sans tenir compte des majuscules ; une bonne réponse dont la seule erreur est un accent le signale). **Afficher un indice** donne les indices un par un ; la solution détaillée s’affiche après un essai, ou une fois tous les indices affichés. Vous obtenez un score, et **Envoyer mes résultats** l’envoie à l’agent. Votre réponse à une question ouverte part avec **Envoyer pour vérification**, pour que l’agent la vérifie.
  - **Du code que vous pouvez exécuter et modifier** : un bac à sable exécute du JavaScript, du Python ou une petite page web sur place, isolé de l’app, avec sa sortie (et les graphiques de Python) en dessous. **Exécuter**, **Réinitialiser**, **Copier** et **Envoyer mon code** (il part chez l’agent pour qu’il le regarde) y figurent, et il peut proposer des exercices à essayer. Python est chargé depuis le web la première fois, il ne s’exécute donc pas dans une [session confidentielle](/guide/sessions#keep-a-session-confidential).
  - Un **parcours de code** explique du code comme une visite guidée : des étapes numérotées à côté du code, chacune mettant en lumière les lignes qu’elle explique pendant que le reste s’estompe. Parcourez-les avec les flèches (ou les touches **←** et **→**), ou touchez une ligne pour ouvrir l’étape qui l’explique. **Poser une question sur cette étape** met une question à son sujet dans votre zone de saisie.
  - Une **exécution de programme pas à pas** montre où en est un programme à chaque étape : la ligne en cours, ses variables (ce qui vient de changer est signalé), les appels en cours et ce qu’il a affiché jusque-là. Avancez et reculez, faites glisser le curseur ou lancez la lecture. Quand elle vous demande d’abord de prédire la sortie, saisissez votre hypothèse et appuyez sur **Vérifier**. **Poser une question sur cette étape** fonctionne ici aussi.
  - **Un graphe de réseau** montre comment les éléments sont reliés (une carte conceptuelle, les personnages d’un roman, ce qui dépend de quoi) : touchez un nœud pour mettre ses liens en évidence et lire sa note, déplacez les nœuds, consultez la légende, ou passez à la vue **Liste**.
  - Le **Texte annoté** repère des passages dans un texte : touchez-en un pour lire sa note (une correction, un commentaire, un sens) et la modification qu’elle suggère, ou **Poser une question à ce sujet**. Filtrez les notes par type, passez de **Original** à **Corrigé** et utilisez **Copier le texte corrigé**, ou écoutez le texte.
  - **Une vérification des faits** passe en revue des affirmations une à une, chacune avec son verdict, sa justification, le degré de certitude de l’agent et les éléments pour et contre, avec leurs sources. Le décompte des verdicts en haut filtre les affirmations quand vous le touchez.
  - Les **Suivis** sont deux à cinq boutons proposant les questions ou étapes suivantes à la fin d’une réponse : touchez-en un pour l’envoyer comme votre message suivant quand votre zone de saisie est vide, ou pour l’ajouter à ce que vous écrivez. Un bouton déjà utilisé reçoit une coche.
- **Images** : une entrée sans image, ou dont l’image ne peut pas se charger, s’affiche sans elle, son texte occupant la place, si bien qu’aucun cadre vide ne reste.
- **Chiffres d’une feuille de calcul ou d’un fichier** : un tableau, un graphique, des chiffres clés, un classement, un histogramme ou des valeurs sur une carte peuvent lire leurs chiffres dans l’une de vos feuilles de calcul (voir [Feuilles de calcul](/guide/library#spreadsheets)), ou dans un fichier CSV, TSV, JSON ou JSONL du dossier de la conversation ou de celui de son projet, au lieu de les contenir. Les agents le font quand les chiffres s’y trouvent, quand il y a plus de quelques dizaines de lignes, ou pour une carte que vous voudrez peut-être garder : la carte additionne, compte, regroupe, filtre et trie elle-même, rien n’est donc retapé, et elle affiche les derniers chiffres à chaque affichage (les lignes que vous ajoutez plus tard aussi, sauf si elle désigne une plage de cellules fixe). Une ligne en dessous indique leur origine (**Données de** *Shop numbers · Sales*, un lien qui ouvre la feuille de calcul ou le fichier), le moment où elles ont été lues et, quand elle n’en montre qu’une partie, combien (« 1 000 sur 12 400 affichées ») ; **Relire** les lit une nouvelle fois, et quand vous enregistrez la feuille de calcul, la carte se redessine toute seule. Si la feuille de calcul, son onglet, une colonne ou le fichier n’existe plus, la carte le dit en termes simples, avec **Réessayer**. Une carte ne lit que les fichiers des dossiers de sa conversation, pas ailleurs sur votre ordinateur, jusqu’à 50 Mo (20 Mo pour un fichier JSON) et leurs 1 000 000 premières lignes ; une feuille de calcul créée dans une [session confidentielle](/guide/sessions#keep-a-session-confidential) n’est lue que par les cartes de cette session.
- **Au survol** (ou quand vous l’atteignez au clavier), une petite barre en haut à droite : **Afficher les données** montre ce que l’agent a écrit (pour une carte qui lit une feuille de calcul ou un fichier, d’où elle lit et ce qu’elle en montre ; **L’afficher** permet de revenir), **Copier en tant que texte** la copie en texte brut, et **Plein écran** montre la carte seule au-dessus de la page, aussi large que votre fenêtre (sur un téléphone, l’écran entier), avec défilement quand elle est haute ; **Esc**, **Fermer** ou un clic à côté vous ramène. Sous **Plus** (…) : **Épingler à un tableau de bord** garde une copie de la carte sur l’un de vos tableaux de bord, un tableau existant ou un **Nouveau tableau de bord…** que vous nommez là, pour la retrouver à côté d’autres cartes (voir [Tableaux de bord](/guide/library#boards)) ; **Enregistrer en tant qu’image** enregistre un PNG de la carte telle qu’elle apparaît, dans le thème que vous voyez et à deux fois sa taille pour rester net, nommé d’après son titre, et **Copier en tant qu’image** place la même image dans le presse-papiers, pour la coller dans un message ou un document (là où votre navigateur autorise les pages à le faire). Le plein écran propose les deux mêmes en haut. Une carte contenant une carte géographique, un tracé dessiné par une bibliothèque de graphiques, un lecteur vidéo ou la sortie d’un bac à sable de code n’a pas de boutons d’image (elle peut tout de même être épinglée) : ces éléments ne peuvent pas être dessinés dans une image.
- **Quand les agents les utilisent** : les agents ont pour consigne d’en utiliser une pour chaque partie d’une réponse qui est faite pour être regardée, comparée, choisie, suivie, essayée, travaillée ou conservée, ce qui arrive la plupart du temps dans une réponse de plus de quelques lignes : des options à peser, des choses avec des images et des détails (lieux, produits, films, livres, personnes, articles, actualités), des chiffres, du temps et des plans, des choses à faire, des choses à apprendre, des textes à vérifier, des affirmations à contrôler, et les prochaines étapes que vous voudrez peut-être suivre. Ils remplissent les images, et lisent une vidéo quand regarder aide plus qu’une photo. Ce qu’une carte ne peut pas dire (le raisonnement, les conseils, les réserves) reste dans les mots de l’agent. Une conversation ordinaire, une réponse courte à une question courte et les modifications de code restent du texte. Chaque réponse, la première comme les suivantes, peut en contenir plusieurs, une pour chacune de ses parties (l’itinéraire d’un voyage, sa météo et une liste de bagages) : une conversation en rassemble donc autant que ses réponses en demandent ; une réponse ultérieure peut en montrer une à nouveau avec ses données mises à jour. L’agent trouve celles qui conviennent en une seule recherche : par leur nom pour celles qu’il connaît déjà, et avec quelques mots sur ce que montre chaque autre partie (par les mots et, quand la **Recherche par le sens** est activée dans [Paramètres → Mémoire](/settings?s=memory), par le sens aussi), si bien qu’on ne lui présente jamais toutes les UI. Les [agents intégrés](/guide/agents#the-built-in-agents) s’appuient chacun sur celles qui conviennent à leur travail.
- **Toutes les voir** : [UI de réponse](/answers) les montre toutes avec un exemple, par groupe : résumés, comparaisons, achats, lieux et voyages, cuisine, plans, travail et entreprise, chiffres et graphiques, argent, apprentissage, sciences, médias, personnes et sport, écriture, et code. **Lire pendant la diffusion** montre l’une d’elles arrivant comme le ferait une réponse.

Demandez-en une aussi en termes simples : « compare-les dans un tableau », « place-les sur une carte », « fais-moi un quiz là-dessus », « donne-moi des exercices d’entraînement sur ce sujet », « annote ma dissertation avec ce qu’il faut corriger ». Vos [Consignes des agents](/guide/guidelines) (« Réponds en texte brut, sans cartes ni graphiques ») ou votre message peuvent demander du texte brut à la place.

### Ouvrir une étape pour voir sa sortie

Cliquez sur une étape pour l’ouvrir :

- une commande : la commande, le dossier où elle s’est exécutée, son code de sortie et sa durée, un bouton de copie, et sa sortie (**Charger toute la sortie** quand elle a été tronquée) ;
- une modification de fichier : le diff (**Charger le diff complet** quand il a été tronqué) ;
- une lecture de fichier : un lien vers le fichier et ce qui a été lu ;
- une page web : son adresse et ce qui en a été lu ;
- une tâche confiée à un sous-agent : **Tâche confiée**, et ce qui est revenu ;
- tout le reste : ce que l’agent a envoyé et ce qui est revenu.

Une étape peut être marquée **en arrière-plan** (elle continue de s’exécuter), **Automatique** (le mode Auto de Custom a décidé, avec la raison au survol), ou afficher un code de sortie en rouge. Les tâches en arrière-plan (une commande laissée en cours, un moniteur, un workflow) sont listées sur une ligne au-dessus de la zone de saisie, avec les sous-agents de la session ; ouvrez une tâche pour voir sa sortie (Claude Code) et l’**Arrêter**, ce qui demande d’abord confirmation ; un sous-agent s’ouvre comme une session à part entière. Voir [Sous-agents](/guide/sessions#subagents).

## Construire la mémoire d’un projet avant que l’agent démarre

Lorsque vous démarrez une session depuis la page d’accueil dans un projet dont la [mémoire wiki](/guide/wiki-memory) est encore récente (moins de 10 articles, aucune construction à partir de l’historique déjà exécutée), et que le projet contient de quoi en construire une (conversations, messages de commit, documents, notes, un README ou un dossier docs/), la session pose d’abord la question. Une carte sous votre message indique **Construire la mémoire de <projet> d’abord ?**, avec ce qu’elle lirait et le temps approximatif nécessaire avant que l’agent démarre. La session affiche **Votre intervention est requise** (et vous recevez la notification) jusqu’à ce que vous fassiez un choix :

- **Construire la mémoire, puis démarrer** : la mémoire commence à se construire, la carte se transforme en indicateur de progression, et la session affiche **Construction de la mémoire**. Votre message attend (« Envoyé à l’agent quand la mémoire est prête ») et part vers l’agent dès que la partie la plus importante est rédigée : une vue d’ensemble du projet à partir de ses fichiers, de ses notes et des conversations les plus riches. Le reste se construit ensuite en arrière-plan, et les agents le trouvent au fur et à mesure. **Démarrer maintenant** envoie votre message tout de suite et laisse la construction se poursuivre ; **Arrêter la construction** l’interrompt (ce qui a été rédigé est conservé) et démarre l’agent. Vous pouvez fermer l’app : l’agent démarre tout seul. Si la construction échoue avant ce point, la carte l’indique, avec **Réessayer** et **Démarrer quand même**. Si l’agent s’est arrêté avant d’avoir reçu votre message (il a planté, ou l’ordinateur a redémarré pendant l’attente) et qu’il ne peut pas être relancé, la carte propose **Démarrer dans une nouvelle session** : une nouvelle session avec les mêmes paramètres reçoit votre message, reprend ce que vous avez envoyé entre-temps, et la session vide est archivée.
- **Démarrer sans mémoire** : l’agent démarre maintenant, et ce projet ne pose plus la question pendant une semaine.
- **Ne plus demander pour ce projet** : la question n’est plus jamais posée pour ce projet. **Créer le wiki à partir de l’historique…** reste dans le menu **⋯** de l’onglet **Mémoire** des détails du projet.

Tout ce que vous envoyez pendant l’attente part vers l’agent après votre premier message. La question n’est posée que lorsque vous démarrez vous-même une session depuis la page d’accueil, jamais pour les exécutions planifiées, les apps, les sous-agents ni les sessions démarrées par un agent, et pas non plus pour un projet dont la mémoire a déjà été construite.

## Approuver ou refuser ce que l’agent veut faire

Lorsque l’agent veut faire quelque chose que ses autorisations ne lui permettent pas de faire seul, il attend et demande votre accord avec une carte à la fin de la conversation : ce qu’il veut exécuter, une modification de fichier avec son diff, ou un autre outil et ses détails, avec le temps d’attente écoulé. Le point de la session passe à l’orange, la Boîte de réception le compte, et vous recevez une notification si vous les avez activées. Vous pouvez répondre depuis la carte, depuis la [Boîte de réception](/guide/inbox) ou, pour un simple oui ou non, depuis la notification elle-même lorsque le navigateur affiche des boutons.

Les boutons dépendent de l’agent :

- **Claude Code** : **Autoriser**, **Refuser**, et souvent une règle comme « Toujours autoriser Bash npm test » ou « Autoriser toutes les modifications pour cette session ».
- **Codex** : **Autoriser**, **Autoriser pour cette session**, **Toujours autoriser cette commande**, **Refuser**, **Refuser et arrêter** ; pour les modifications de fichiers, **Autoriser les modifications pour cette session** ; pour des autorisations plus larges, **Autoriser pour ce tour** et **Autoriser pour cette session**.
- **Custom** : **Autoriser**, **Toujours autoriser** suivi de ce que cela couvre exactement (uniquement la commande que vous avez approuvée, pour que rien ne puisse s’y ajouter), et **Rejeter**.
- Autres agents : les choix qu’ils proposent.

**Refuser** ouvre d’abord une zone de saisie, « Facultatif : dites à l’agent quoi faire à la place » ; appuyez de nouveau sur **Refuser** pour envoyer, avec ou sans note. (**Rejeter** de Custom et **Refuser et arrêter** de Codex répondent immédiatement.)

Un outil d’une app connectée que vous avez réglé sur **Demander d’abord** ne demande rien dans la session : l’appel est retenu dans la Boîte d’envoi et l’agent poursuit son travail. Une ligne dans la conversation indique **Attend votre accord dans la Boîte d’envoi**, puis plus tard s’il a été envoyé ou abandonné ([La Boîte d’envoi](/guide/inbox#the-outbox-calls-held-for-your-ok)).

En mode **Automatique** de Claude Code, la vérification de sécurité peut refuser carrément une commande au lieu de demander. Une carte au-dessus de la zone de message indique alors « Claude a bloqué une commande » et pourquoi. **Approuver et réessayer** passe la session en mode Demander et demande à l’agent de l’exécuter de nouveau, de sorte qu’elle vous revienne comme une approbation normale ; **Ignorer** laisse les choses en l’état.

## Répondre aux questions et approuver les plans

Lorsque l’agent vous pose une question, une carte au bord orange affiche les questions et leurs choix :

- Choisissez une option, ou plusieurs lorsqu’il est écrit « Choisissez-en plusieurs ». **Autre — saisissez votre propre réponse** permet d’écrire avec vos propres mots.
- **Joindre des fichiers** ajoute des fichiers à une réponse.
- Les touches 1 à 9 choisissent une option de la première question qui n’a pas encore de réponse.
- **Envoyer la réponse** l’envoie comme votre prochain message. Si la session s’est arrêtée pendant la question, **Reprendre et répondre** la relance avec votre réponse. Pour une session Claude Code en attente dans VS Code ou dans un terminal, **Répondre ici** y met fin et la poursuit ici avec votre réponse ; une session Codex dans ces environnements doit y recevoir sa réponse.

Lorsque la question arrive plutôt sous forme de carte d’approbation, ses boutons sont **Envoyer les réponses** et, pour Claude Code, **Passer**.

**Plans.** En mode **Plan** de Claude Code, l’agent lit et planifie, puis présente son plan dans une carte : **Approuver, accepter automatiquement les modifications** (c’est parti, il modifie sans demander), **Approuver, demander avant les modifications**, ou **Continuer à planifier** (il reste en mode Plan ; dites-lui ce qu’il faut changer). Dans le mode Plan de Codex, Codex discute et planifie d’abord, et peut vous poser des questions de précision. Le mode Plan de Custom se termine par un plan numéroté ; changez les autorisations (Shift+Tab) et répondez pour le faire exécuter.

## Remplir les formulaires demandés par un service

Lorsqu’un service que vous avez connecté a besoin de quelque chose de votre part en cours de tâche (une date, un choix, une page à approuver), son formulaire s’affiche sous forme de carte, quel que soit l’agent qui travaille : « Linear vous demande de remplir un formulaire », « … vous demande d’ouvrir une page » ou « … demande l’autorisation de continuer ». Remplissez les champs et appuyez sur **Envoyer** (ou sur **L’ouvrir**, qui ouvre la page, ou sur **Autoriser**), ou appuyez sur **Décliner** ou **Pas maintenant**. Les serveurs d’outils propres à Codex demandent de la même façon. Voir [Apps connectées, clés et outils](/guide/connections).

## Écrire à l’agent pendant qu’il travaille

Vous pouvez écrire pendant qu’un tour est en cours. L’effet de la touche Entrée dépend alors du réglage **Envoi pendant qu’un agent travaille** dans [Paramètres → App → Général](/settings?s=general&find=Sending%20while%20an%20agent%20works), pour chaque navigateur :

- **Rejoindre le tour** (par défaut) : Entrée ajoute votre message au tour en cours, et l’agent en tient compte tout de suite. Ctrl+Entrée (⌘Entrée sur Mac) le place plutôt dans la file d’attente.
- **Attendre qu’il se termine** : Entrée place votre message dans la file d’attente, pour qu’il parte à la fin du tour. Ctrl+Entrée l’ajoute plutôt au tour en cours.

La zone de message indique lequel des deux s’applique : « Envoyer un complément dans le tour en cours » ou « Mettre un message en file d’attente pour la fin de ce tour ». Sur un écran tactile, le bouton d’envoi fait ce que ferait Entrée. Custom prend en compte les compléments à l’étape suivante du modèle, une fois les outils en cours terminés ; **Envoyer maintenant** fait de même pour un message en file d’attente. Si votre session Custom était déjà en cours avant une mise à jour de l’app et ne peut pas encore recevoir de compléments en direct, votre message reste dans la file d’attente jusqu’à la fin du tour. Les autres agents ACP traitent un seul message à la fois : un message envoyé pendant qu’ils travaillent attend donc toujours dans la file d’attente. Dans Claude Code, un message arrivé pendant que l’agent travaillait affiche « envoyé pendant le travail » en dessous. La réponse de l’agent s’affiche comme une réponse sous votre message, même si l’agent poursuit ensuite son travail.

## Gérer la file d’attente

Les messages en file d’attente patientent au-dessus de la zone de message, numérotés dans l’ordre où ils partiront ; un message que vous mettez en file d’attente y apparaît dès que vous l’envoyez. Un message part à chaque fin de tour, automatiquement.

- Faites glisser un message par sa poignée pour changer l’ordre.
- **Envoyer maintenant** (la flèche) : l’envoie tout de suite, dans le tour en cours.
- **Modifier** (le crayon) : change son texte, retire des pièces jointes ou en ajoute (**Joindre**, ou collez ou déposez des fichiers). Entrée enregistre, Échap annule.
- **Retirer** (la corbeille) : le retire de la file d’attente ; ses pièces jointes sont supprimées.
- Lorsque vous arrêtez l’agent, ou que l’app redémarre, la file d’attente se met en pause : « La file d’attente est en pause (l’agent a été arrêté, ou le serveur a redémarré). » **Reprendre** permet aux messages de repartir dès que l’agent est libre. Les messages que les agents s’envoient entre eux (ceux d’une session à ses sous-agents Hydor, et leurs réponses) ne se mettent pas en pause lors d’un redémarrage : si l’agent qu’ils attendent est encore au travail, ils partent à la fin de son tour. Un plafond de dépenses atteint bloque aussi la file d’attente ; relever le plafond lui permet de continuer.

## Changer l’agent, le modèle, l’effort ou les autorisations

La zone de message d’une session reprend l’**Agent** de la page d’accueil et ses trois choix **Modèle**, **Effort** et **Autorisations**, réunis dans une seule pastille à côté du **+** (elle ouvre **Options**, une feuille qui monte du bas sur un téléphone). En dessous se trouvent les autres options de la page d’accueil pour cette session, dans le même ordre : **Compte** (un autre compte reprend la session à partir de votre prochain message ; affiché lorsque l’agent a plusieurs comptes), **Confidentielle** et **Arène** (affichées telles quelles : les deux se choisissent au démarrage d’une session, et un clic explique comment obtenir l’autre), **Mémoire**, **Plafond de dépenses**, **Essaim**, **Recherche** et **Consignes** (les mêmes choix et boîtes de dialogue que les [Paramètres de la session](/guide/research#turn-it-on) du menu de la session ; Essaim et Recherche changent à partir de votre prochain message). La pastille indique l’agent et le modèle, ainsi que l’effort et les autorisations lorsqu’ils sortent de l’ordinaire ; elle devient orange lorsque l’agent peut tout faire sans demander (**Contourner**, ou **Accès complet** pour Codex). Un autre agent s’applique à partir de votre prochain message (voir [Changer d’agent dans une session](/guide/agents#switch-agents-in-a-session)). Un changement de modèle, d’effort ou d’autorisations s’applique tout de suite à l’agent en cours et reste lié à la session. Shift+Tab passe au mode d’autorisation suivant. Le menu des modèles ne liste que les modèles de cet agent ; pour faire passer la conversation à un autre agent, utilisez [Continuer dans un autre agent](#continue-in-another-agent).

## Citer une partie d’une réponse

Sélectionnez du texte dans une réponse de l’agent, ou dans l’un de vos propres messages : un bouton **Devis** apparaît au-dessus (en dessous sur un écran tactile). Il place le texte dans la zone de message sous forme de citation, avec le curseur après celle-ci, pour que vous puissiez répondre à ce passage ou reprendre quelque chose que vous avez dit plus tôt.

## Rechercher du texte dans une session

Appuyez sur Ctrl+F (⌘F) dans une session. **Rechercher dans cette session** parcourt vos messages et ceux de l’agent, y compris les parties pas encore chargées (pas la sortie des commandes). Saisissez au moins deux lettres ; la recherche saute à la correspondance la plus récente, surligne les mots et indique « 3 sur 12 ». Entrée va à la correspondance plus ancienne, Shift+Entrée à la plus récente (ou utilisez les flèches), et Échap ferme la barre. Un long message replié s’ouvre sur ce qui a été trouvé. Un message choisi dans la zone de recherche (Ctrl+K) ouvre sa session avec cette barre déjà remplie.

## Autres fonctions de la zone de message

- ↑ dans une zone vide rappelle vos messages précédents dans cette session, du plus récent au plus ancien ; ↓ permet de revenir en avant.
- Ce que vous saisissez est conservé comme brouillon pour chaque session dans ce navigateur : il est donc toujours là à votre retour.
- Ctrl+S (⌘S) met le brouillon de côté et vide la zone ; Ctrl+S dans une zone vide le rapporte.
- Un très long texte collé (32 000 caractères ou plus) est joint sous forme de fichier texte au lieu de remplir la zone.
- Le texte indicatif vous dit ce que fera l’envoi : « Écrire à Claude… », ou « Écrire pour continuer… » lorsque l’agent n’est pas en cours d’exécution : l’envoi le relance avec toute la conversation.

## Le panneau de détails : modifications, commandes et infos

**Détails** dans l’en-tête ouvre un panneau de trois onglets. Sur un grand écran, il se place à côté de la conversation et reste ouvert quand vous passez d’une session à l’autre ; sur un écran plus étroit, il glisse par-dessus la page ; sur un téléphone, il ne s’ouvre que lorsque vous le demandez.

- **Modifications** : tous les fichiers modifiés par la session, les plus modifiés en premier, avec les lignes ajoutées et supprimées. Cliquez sur un fichier pour voir le diff de chaque modification ; **Ouvrir** ouvre le fichier.
- **Commandes** : toutes les commandes shell exécutées par l’agent, les plus récentes en premier, avec les filtres **Tout**, **Échec** et **Arrière-plan**. Cliquez sur l’une d’elles pour voir sa sortie.
- **Info** : l’agent, l’état (comme dans l’en-tête : **Terminé**, **Arrêtées**, **Échec** ou ce qu’il fait en ce moment), le dossier, la branche, le modèle et l’effort, la part du contexte utilisée, le moment du démarrage et de la dernière activité, son activité (requêtes, tours, appels d’outils, commandes), les tokens (entrée, en cache, sortie), le coût API (ce que le même travail coûterait au tarif de l’API), la vitesse de sortie, l’endroit où elle a été démarrée (Hydor, VS Code, un terminal, l’app de bureau de Claude…), et, tant que son agent tourne, **Ses programmes** : ce qu’ils consomment en ce moment (processeur, mémoire et nombre), avec les [limites](/guide/app#limit-each-session) sous lesquelles ils s’exécutent. Plus bas : ses tâches en arrière-plan (ouvrez-en une pour voir ce qu’elle a fait, ou **Arrêter**-la), et **Continuer dans un terminal** : la commande qui reprend la session dans un terminal, et l’identifiant de la session, chacun avec un bouton de copie (Claude Code et Codex).

## Lire les indicateurs : contexte, cache et vitesse

Un petit anneau accompagné d’un pourcentage, près du microphone, se remplit à mesure que la conversation consomme la fenêtre de contexte du modèle ; le reste se trouve au bas du menu de la pastille Options :

- **Contexte** : l’anneau, et la ligne **Contexte** dans Options (« 42 % utilisés »). Pointez l’anneau pour voir le nombre exact de tokens. Il devient orange au-dessus de 85 %. Cliquez sur l’anneau, ou sur **Compacter** dans Options, pour compacter la conversation (impossible pendant qu’un tour s’exécute). Dans une session Custom, pointez l’anneau pour voir les tokens et leur répartition, et la répartition se trouve sous la flèche de la ligne **Contexte** ; Custom condense tout seul, il n’y a donc pas de **Compacter** et cliquer sur l’anneau ne fait rien (voir [Longues conversations et longues sorties](/guide/custom#long-conversations-and-long-output)).
- **cache 4 min** (Claude Code) : le cache de requêtes garde la conversation prête pendant un certain temps (5 minutes ou une heure), de sorte que le message suivant coûte moins cher et arrive plus vite. Il décompte tant que vous n’envoyez rien ; un message envoyé avant la fin le réutilise et relance le décompte. **cache froid** signifie que le message suivant le reconstruira.
- **85 tok/s** : la vitesse à laquelle la dernière réponse a été écrite, en tokens par seconde.

## Arrêter un tour, arrêter l’agent ou reprendre

Le bouton Arrêter à côté de la zone de message affiche un anneau qui tourne pendant que l’agent démarre ou travaille. L’anneau se met en pause quand l’agent a besoin de vous, et reste immobile si votre appareil demande de réduire les animations. Une fois le tour terminé, le bouton Arrêter reste, avec son anneau, tant que des tâches d’arrière-plan ou des sous-agents lancés par l’agent tournent encore, comme un sous-agent Hydor, un sous-agent Claude Code, une commande laissée en cours d’exécution ou un moniteur. Le bouton d’envoi se trouve à côté, et la zone accepte vos messages comme d’habitude. Pointez Arrêter pour voir ce qu’il arrête : « Arrête ce tour, 2 sous-agents et 1 tâche d’arrière-plan », ou « Arrête 2 sous-agents ». Il arrête tout cela d’un coup : le tour, chaque sous-agent en cours, chaque tâche d’arrière-plan en cours, ainsi que celles que ceux-ci ont lancées à leur tour. Un sous-agent Hydor arrêté ainsi ne fait pas de rapport à son parent, et un rapport déjà en route attend dans la file en pause du parent au lieu de le réveiller. Appuyez sur **Reprendre** pour laisser passer la file.

- **Arrêter un tour** : appuyez sur **Arrêter** dans l’en-tête, ou sur le bouton en carré arrondi à côté de la zone de message, qui arrête aussi ce que la session a lancé (voir ci-dessus). (Échap ne l’arrête pas : il ne fait que fermer ce qui est ouvert, comme la barre de recherche ou une liste.) L’agent cesse ce qu’il fait, et le tour affiche « Arrêté après… ». La session s’affiche comme arrêtée dès que vous appuyez sur **Arrêter**, même si l’agent met quelques secondes à finir (pour terminer une commande en cours, par exemple). Si l’agent travaille encore 20 secondes plus tard, la session l’indique de nouveau comme au travail. L’agent reste prêt pour votre prochain message, et la file reste en pause jusqu’à ce que vous la repreniez.
- **Arrêter le processus de l’agent** : menu de la session (⋯) → **Plus** → **Arrêter le processus de l’agent**, quand aucun tour n’est en cours. Le programme de l’agent se termine ; la session et son historique restent, et elle indique comment son dernier tour s’est fini (**Terminé**, **Arrêtées** ou **Échec**).
- **Reprendre** : le bouton **Reprendre** de l’en-tête relance l’agent avec toute la conversation. Vous pouvez aussi simplement envoyer un message (« Message pour continuer… ») : cela le relance aussi, que ce soit pour Claude Code, Codex ou Custom. Après **Terminé**, **Reprendre** est un bouton plus discret, car votre prochain message suffit. Si la session a été modifiée il y a quelques secondes, peut-être depuis VS Code ou un terminal, l’app vous demande d’abord confirmation, car deux programmes qui écrivent dans une même session peuvent abîmer son historique.
- Un agent laissé inactif s’arrête de lui-même au bout de trois heures (quand rien ne vous attend et qu’aucune tâche d’arrière-plan ne tourne) ; votre prochain message le relance.

## Donner un objectif à la session

Un objectif garde l’agent au travail, tour après tour, jusqu’à ce qu’une condition que vous fixez soit remplie. Ouvrez le menu de la session (⋯) → **Définir un objectif**, ou saisissez `/goal` suivi de la condition dans une session Claude Code ou Codex. Dites à quoi ressemble « terminé », par exemple « npm test réussit et la page d’envoi gère les fichiers de 2 Go », puis appuyez sur **Commencer à travailler dessus** (ou Ctrl+Entrée).

- **Claude Code** continue de travailler ; après chaque tour, une vérification rapide décide si l’objectif est atteint.
- **Codex** continue de travailler jusqu’à ce qu’il juge l’objectif atteint.
- **Custom** continue de travailler ; après chaque tour, le modèle d’appoint vérifie les preuves et lui indique l’étape suivante. Il se met en pause quand il ne progresse plus, et ne fait pas plus de tours que le nombre défini dans [Paramètres → Custom → Objectifs → Tours avant la pause d’un objectif](/settings?s=custom&find=Rounds%20before%20a%20goal%20pauses).

Tant qu’un objectif est défini, une barre au-dessus de la zone de message l’affiche avec son état (au travail, en pause, bloqué : l’agent a besoin de vous, ou arrêté à une limite d’utilisation ou de jetons), le nombre de vérifications, le temps et les jetons dépensés, et le motif de la dernière vérification. **Pause** et **Reprendre** fonctionnent pour Codex et Custom ; **Effacer** cesse de travailler vers l’objectif. Une cible dans la barre latérale indique quelles sessions ont un objectif.

## Dupliquer une session

Un duplicata est une nouvelle session qui part de cette conversation, puis essaie autre chose ; cette session reste telle quelle.

1. Ouvrez le menu de la session (⋯) → **Dupliquer**, ou appuyez sur **Dupliquer à partir de cette réponse** sous une réponse (n’importe quelle réponse de Claude Code ; la dernière réponse d’un tour terminé pour Codex et Custom) pour ne garder la conversation que jusque-là.
2. Écrivez ce que le duplicata doit faire (« Que doit essayer le duplicata à la place ? »).
3. Appuyez sur **Dupliquer** (ou Ctrl+Entrée).

Le duplicata s’ouvre, intitulé « … · fork », avec les mêmes agent, modèle, effort, autorisations et compte. Une ligne en haut indique « Dupliquée à partir de … » avec **Ouvrir** (un duplicata Codex n’affiche que ce qui a suivi ; la conversation antérieure se trouve dans l’original). La duplication fonctionne pour Claude Code, Codex et Custom, mais pas pour une session ouverte dans une autre app. Une réponse de Claude Code antérieure au compactage de la conversation peut aussi être dupliquée : le duplicata part de toute la conversation jusqu’à cette réponse, telle qu’elle était avant d’être compactée.

## Modifier à partir d’ici

Revenez à l’un de vos messages et dites autre chose à la place :

1. Appuyez sur **Modifier à partir d’ici** sous votre message.
2. Changez le texte.
3. Cochez **Remettre les fichiers dans l’état précédant ce message** si les modifications faites par l’agent depuis doivent aussi être annulées.
4. Appuyez sur **Envoyer à partir d’ici** (Entrée), ou sur **Annuler** (Échap).

La conversation continue dans une copie jusqu’à juste avant ce message, qui prend le titre de cette session ; cette session est archivée. La remise des fichiers dans leur état antérieur fonctionne pour Claude Code (à partir de ses propres points de contrôle des messages envoyés depuis cette app), pour Custom (les fichiers modifiés par ses propres éditions ; ce que des commandes ont changé reste) et pour toute session dans un worktree (un instantané est pris à chaque envoi de message). Les sessions Codex ne peuvent remettre les fichiers en place que dans un worktree. Arrêtez d’abord l’agent si un tour est en cours. Modifier à partir d’ici fonctionne pour Claude Code, Codex et Custom.

## Continuer dans un autre agent

Passez la conversation à un autre agent et continuez avec lui :

1. Ouvrez le menu de la session (⋯) → **Continuer dans Codex** (ou **Continuer dans Claude Code**, ou **Continuer dans l’agent Custom** dès que Custom a un modèle).
2. Une note au-dessus de la zone de message indique que votre prochain message ira là-bas ; les choix de modèle, d’effort et d’autorisations s’appliquent désormais au nouvel agent. Appuyez sur × (« Rester ici ») pour annuler.
3. Écrivez un message, ou envoyez simplement pour continuer.

Une nouvelle session s’ouvre dans le même dossier, avec la conversation jusque-là : votre première demande, puis les messages les plus récents qui tiennent dans environ 15 000 jetons, et les fichiers modifiés. Le nouvel agent est informé de l’endroit où toute la conversation est conservée, et peut donc lire ce qui a été laissé de côté. Son premier message affiche « Suite de Claude Code », avec **Ouvrir cette session** et un bouton qui montre les messages repris ; l’ancienne session affiche « Cette conversation s’est poursuivie dans Codex » avec **Ouvrir**. Cela fonctionne depuis les sessions Claude Code et Codex.

## Compacter la conversation

Compacter remplace l’historique jusque-là par un résumé, ce qui libère de la place dans le contexte du modèle pour la suite. Utilisez le menu de la session (⋯) → **Plus** → **Compacter la conversation**, ou cliquez sur l’indicateur de contexte dans la zone de message, puis confirmez avec **Compacter**. Cela fonctionne pour Claude Code et Codex, entre deux tours. Custom condense lui-même une longue conversation.

## Renommer, épingler, reporter, clore, archiver ou supprimer

La plupart de ces actions se trouvent dans le menu de la session (⋯), et dans le menu de sa ligne dans la barre latérale : pointez la ligne et cliquez sur **⋯** à son extrémité, ou faites un clic droit dessus (sur téléphone, touchez son **⋯**).

- **Renommer** : saisissez un nouveau titre (200 caractères au maximum) ; Entrée enregistre, Échap annule. Un double-clic sur le titre dans l’en-tête ou la barre latérale, ou F2 sur une ligne sélectionnée, fait la même chose.
- **Renommer le dossier** (dans la barre latérale, pour une session qui n’est pas dans un projet) : un nom de votre choix pour le dossier dans lequel elle travaille, qu’affichent la barre latérale, les lignes de session et les menus de dossiers sur tous vos appareils ; le dossier garde son propre nom sur le disque. Laissez vide pour retrouver le nom du dossier.
- **Épingler en haut** / **Désépingler** : les sessions épinglées restent dans le groupe **Épinglées**, dans l’ordre où vous les faites glisser. Vous pouvez aussi faire glisser une session depuis les groupes en dessous (celui d’un projet ou d’un dossier, Aujourd’hui, Hier…) vers Épinglées, ou vers « Déposer ici pour épingler » quand rien n’est encore épinglé.
- **Reporter** : masque la session dans le groupe **Reportées**, en bas, jusqu’à **Pendant une heure**, **Pendant 3 heures**, **Ce soir** (tant qu’il est avant 17 h), **Demain matin**, **Semaine suivante** (lundi matin), ou **Choisir une date et une heure**. Elle revient d’elle-même, avec une notification, ou plus tôt si elle a besoin de vous. **Annuler le report** la ramène tout de suite.
- **Clore : terminé pour le moment** : pour un travail fini. L’agent s’arrête (l’option n’est pas proposée pendant un tour) et la session compte comme lue ; son historique et son éventuel worktree restent. Pour une session dans un worktree, la boîte de dialogue du worktree s’ouvre pour que vous puissiez le retirer.
- **Archive** / **Désarchiver** : retire la session de la liste ; rien n’est supprimé. Les sessions archivées se retrouvent avec la zone de recherche (Ctrl+K), marquées **Archivée** ; ouvrez-en une et choisissez **Désarchiver** dans son menu.
- **Supprimer la session** : après votre confirmation, l’historique de la session est effacé du disque, et elle disparaît donc aussi de la ligne de commande de l’agent et de VS Code. Cette action est irréversible. **Supprimer** dans le menu de sa ligne dans la barre latérale fait la même chose.

Tant que vous ne l’avez pas supprimée, l’app conserve chaque session, même quand le programme de l’agent supprime sa conversation (Claude Code le fait au bout de 30 jours, sauf réglage contraire) : elle revient, listée et ouvrable. Les sessions que personne n’a utilisées depuis un an sont supprimées automatiquement, sauf si vous les épinglez ou si vous modifiez ce réglage dans Paramètres → Général (voir [Supprimer les sessions inactives](/guide/app#delete-inactive-sessions)).

Épingler, désépingler, archiver, désarchiver et reporter affichent une notification avec **Annuler**, et Ctrl+Z les annule dans les 8 secondes.

## Partager un lien en lecture seule

Le menu de la session (⋯) → **Partager un lien en lecture seule** crée un lien que n’importe qui peut ouvrir sans votre mot de passe (pas pour une [session confidentielle](#keep-a-session-confidential)). Cette personne voit la conversation en direct (les messages, les étapes par leur nom, les modifications de fichiers et les pages que l’agent a affichées), mais ni le résultat des commandes ni la réflexion de l’agent, et elle ne peut rien saisir ni modifier. Choisissez la durée de validité (**Un jour**, **Une semaine**, **Un mois**, **Jusqu’à désactivation**) et appuyez sur **Créer un lien** ; le lien ne s’affiche qu’une fois. La même boîte de dialogue liste les liens actifs, indique combien de fois chacun a été ouvert, et permet d’en désactiver un. Voir [Téléphones, autres machines et partage](/guide/devices).

## Exporter une conversation

Le menu de la session (⋯) → **Exporter** sort la conversation du chat :

- **Exporter en Markdown** la télécharge sous forme de fichier Markdown portant le titre de la session, pour la conserver, l’envoyer ou l’ouvrir dans n’importe quelle app de notes.
- **Copier en Markdown** place le même texte dans le presse-papiers, pour le coller dans des notes, un e-mail ou une autre app.
- **Conserver comme document** en fait un document, conservé dans le projet de la session (il apparaît dans les **Fichiers** du projet ; sans projet, il reste avec cette conversation), pour le lire, le modifier, le commenter, l’imprimer et l’exporter en Word ou en PDF. Un message indique quand il est prêt ; **Ouvrir** vous y mène.

Ce qui est inclus : le titre et la date, puis chacun de vos messages et chaque réponse de l’agent, dans l’ordre, avec leur heure. Les étapes d’un tour sont omises, remplacées par une ligne telle que « A travaillé 2 min · 5 étapes ». Les fichiers remis par l’agent sont listés par leur nom. Les cartes de réponse deviennent du texte lisible, avec des tableaux sous forme de tableaux (une comparaison, un tableau de données, les chiffres d’un graphique). Les diagrammes restent sous forme de code Mermaid et les formules mathématiques en LaTeX, tels que l’agent les a écrits. Dans le document, les images que vous avez jointes à vos messages et celles que l’agent a remises figurent aussi.

Une [session confidentielle](#keep-a-session-confidential) s’exporte aussi, et son document reste sur cet ordinateur comme le reste de son travail : les images venant du web sont laissées sous forme de liens au lieu d’être téléchargées. Depuis un terminal, `hydor sessions export` fait la même chose ([Hydor dans un terminal](/guide/terminal)).

## Travailler dans un worktree

Un worktree est une copie séparée des fichiers d’un dépôt sur une nouvelle branche, afin qu’un agent puisse modifier des choses sans toucher à votre propre copie, et que plusieurs agents puissent travailler en même temps sur un même dépôt.

- **En démarrer un** : sur la page de démarrage, ouvrez **Dossier** et activez **Nouveau worktree à partir de …** (le dossier doit se trouver dans un dépôt Git). L’app crée une branche nommée `agent/` suivie de quelques mots de votre tâche, à partir de la branche active, ainsi qu’un dossier pour elle dans le dossier de données de l’app. Le réglage est conservé pour la fois suivante.
- **Instantanés** : dans un worktree, l’app conserve un instantané des fichiers à chaque envoi de message, afin que [Modifier à partir d’ici](#edit-from-here) puisse les remettre en place.
- **Le consulter** : le menu de la session (⋯) → **Dossier et code** → **Worktree : agent/…** affiche la branche et celle dont elle est issue, son dossier, le nombre de commits d’avance ou de retard, et les modifications non validées, avec **Examiner ses modifications** et **Ouvrir dans Git**.
- **Le retirer** une fois le travail terminé : dans la même boîte de dialogue, **Retirer le worktree**. Le dossier disparaît ; la session garde son historique. La branche reste, donc rien de ce qui a été validé n’est perdu, sauf si vous cochez **Supprimer aussi la branche …** (une branche sans rien de nouveau est supprimée dans tous les cas). S’il y a des modifications non validées, cochez d’abord **Abandonner les … modifications non validées**. L’agent s’arrête s’il tournait, et les duplicatas ou modifications qui partagent le worktree le perdent aussi.

## Ouvrir une pull request

À partir de la branche d’une session, le menu de la session (⋯) → **Dossier et code** → **Ouvrir une pull request** ouvre une pull request sur GitHub ou Gitea. **Rédiger pour moi** prépare le titre et la description à partir des commits et du diff ; une case permet de valider d’abord les modifications non validées ; **Brouillon** la marque comme brouillon ; la branche est poussée quand vous appuyez sur **Ouvrir la pull request**. Il vous faut un compte dans [Paramètres → Gestion de version](/settings?s=scm). **Lier une pull request existante…** associe une pull request ouverte ailleurs.

Une fois liée, son état et ses vérifications apparaissent sous forme de badge dans la barre latérale et l’en-tête, et sont mis à jour toutes les quelques minutes, avec une notification quand elle est fusionnée ou que ses vérifications se terminent. Le même élément de menu, devenu **Pull request n° 12**, propose **Ouvrir sur GitHub** (ou Gitea), **Relire les modifications**, **Vérifier maintenant** et **Dissocier**. **Relire les modifications** dans le sous-menu passe en revue ce que la branche change, fichier par fichier. Voir [Système : Fichiers, Git, Terminal et Aperçu](/guide/files-git).

## Quand une limite d’utilisation arrête une session

Quand un forfait Claude Code ou Codex n’a plus d’utilisation disponible, un bandeau au-dessus de la zone de message indique de quel compte il s’agit, quelle limite est atteinte et quand elle sera réinitialisée. Il dit « Vous avez atteint la limite d’utilisation de Claude Code » si l’agent n’a qu’un compte, « Tous vos comptes Claude Code ont atteint leur limite d’utilisation » si vous en avez plusieurs et qu’aucun n’a plus d’utilisation, ou il cite le compte par son nom (« Travail a atteint sa limite d’utilisation ») quand un autre en a encore.

Quand un autre compte de cet agent a encore de l’utilisation, aucun bandeau n’apparaît tant que **Changer de compte à une limite** est activé : la session passe sur ce compte et continue (les nouvelles sessions y démarrent). Si l’option est désactivée, le bandeau nomme ce compte et propose **Activer**.

- **Reprendre à la réinitialisation** relance la session automatiquement une minute après la réinitialisation de la limite, avec le message « Continue là où tu t’es arrêté. » Le bandeau indique alors quand, avec **Annuler**.
- **Utiliser une réinitialisation** : quand votre compte dispose de réinitialisations de limite, le bandeau en indique le nombre, et ce bouton en utilise une immédiatement.
- [Reprendre après les limites d’utilisation](/settings?s=general&find=Resume%20after%20usage%20limits), dans Paramètres → App → Général, fait cela pour toutes les sessions arrêtées par une limite. Quand l’option est activée, aucun avertissement n’apparaît dans la session : une ligne au-dessus de la zone de message indique de quel compte il s’agit (comme le bandeau), quelle limite est atteinte et quand la session reprend (« Tous vos comptes Claude Code ont atteint leur limite d’utilisation », puis « Session en cours (5 h) · Reprise automatique dans 3 h 15 min. »), avec **Utiliser une réinitialisation** si vous en avez une, et **Annuler**. Une session que vous avez arrêtée vous-même avec **Arrêter** ne reprend pas automatiquement.

L’heure suit la limite : si la réinitialisation est décalée, ou si l’utilisation revient plus tôt, la session reprend à ce moment-là. Voir [Utilisation, limites et coûts](/guide/usage).

## Sessions exécutées dans VS Code ou un terminal

Toutes les sessions Claude Code et Codex de cet ordinateur sont listées, y compris celles que vous exécutez dans VS Code, dans un terminal ou dans l’app de bureau de Claude. Tant qu’elles y tournent, la liste affiche « Travaille dans VS Code », « A besoin de vous dans le terminal » ou « Ouvrir dans VS Code » (un point gris), et vous pouvez suivre leur travail en lecture. Si l’une d’elles vous attend là-bas, l’app ne vous le signale que si elle attend encore une minute plus tard.

- **Reprendre la main sur une session Claude Code** : cliquez sur **Continuer ici** dans son en-tête, ou envoyez simplement un message (« Ouvrir dans VS Code — l’envoi la déplace ici »). L’app demande d’abord confirmation : elle met fin à la session dans l’autre app, en interrompant ce qu’elle faisait, et la reprend ici avec tout son historique. L’autre app la montre comme terminée ; vous pourrez la rouvrir là-bas plus tard.
- **Les sessions Codex** ouvertes ailleurs sont en lecture seule ici, car un seul processus Codex y sert tous ses fils. Continuez-la là-bas, ou fermez-la là-bas puis reprenez-la ici.
- La duplication n’est pas proposée tant qu’une session est ouverte dans une autre app.

## Sous-agents

Un agent peut confier des parties d’un travail à des sous-agents et récupérer leurs résultats. Il en existe deux sortes, et l’app précise laquelle :

- Un **Sous-agent Hydor** est une session à part entière que Hydor démarre, avec n’importe quel agent et n’importe quel modèle. Il a une ligne dans la carte des sous-agents de la conversation du parent, apparaît sous son parent dans la barre latérale, et vous pouvez l’ouvrir et lui parler. Il a son propre coût et sa propre part du plafond de dépenses du parent, et sa réponse revient au parent sous forme de message.
- Un **sous-agent Claude Code** (avec Codex, un « sous-agent Codex » : le nom du programme propre à la session) est un sous-agent que ce programme exécute dans la session pour une courte partie de son travail. Il s’affiche et s’ouvre comme un sous-agent Hydor : une ligne dans une carte de la conversation, une ligne dans la barre latérale et dans le plateau, et une page à lui avec toute sa conversation. Mais vous ne pouvez pas lui parler (son chef de file le peut), ce qu’il dépense compte comme la dépense de son chef de file, et il n’a aucune part de plafond de dépenses.

Dans la barre latérale, les sous-agents sont regroupés sous leur parent tant qu’ils travaillent ou vous attendent, ceux de Hydor et ceux du programme ensemble, sur une seule ligne (« 3 sous-agents · 1 a besoin de vous », « 2 sous-agents ») ; cliquez sur la ligne pour voir une ligne par sous-agent. Un sous-agent terminé quitte la barre latérale, sauf si vous le consultez, et la ligne reste ouverte tant que vous en regardez un. Les membres d’un essaim s’affichent comme « membres de l’essaim », ceux d’une campagne comme « membres de la campagne ». Dans la conversation du parent, les sous-agents lancés par un même tour s’affichent ensemble dans une carte sous ce tour : les sous-agents Hydor dans une carte, ceux du programme (Claude Code ou Codex) dans une autre. Sa ligne du haut indique combien il y en a et de quelle sorte, avec ce qu’ils ont en commun (« 6 sous-agents Claude Code · Sonnet 5.5 », « 3 sous-agents Hydor · Claude Code · Sonnet 5.5 », « 4 chercheurs » dans une recherche approfondie), et où ils en sont (« 5 au travail · 1 terminé », mais aussi « 1 a besoin de vous », « 1 arrêté », « 1 en échec »). Cliquez sur cette ligne pour replier ou déplier la carte : elle est ouverte tant qu’un sous-agent travaille ou a besoin de vous, et se replie sur cette seule ligne une fois que tous ont terminé.

En dessous, chaque sous-agent a sa ligne : un point de la couleur de son état (bleu pendant qu’il travaille, avec une légère pulsation ; ambre quand il a besoin de vous ; vert quand il a terminé ; gris quand il est arrêté ; rouge en cas d’échec), son titre, sur un grand écran ce qu’il a de différent des autres (sa sorte ou son modèle, l’agent à vous sous lequel il travaille, son niveau), et où il en est : depuis combien de temps il travaille, « A besoin de vous », quand il a terminé (« il y a 3 min »), « Arrêté » ou « En échec ». La ligne d’un sous-agent Hydor indique aussi son coût, et en pointant un sous-agent qui est monté d’un niveau, on voit « Monté depuis » son premier niveau et pourquoi. Cliquez sur une ligne pour ouvrir le sous-agent. Tant que d’autres travaillent, ceux qui ont terminé se replient sur une seule ligne, comme « 4 terminés : » suivi de leurs titres : cliquez dessus pour les voir. Ceux qui ont échoué gardent chacun leur ligne. Quand plus de six travaillent, cinq sont affichés, avec **Afficher 3 de plus**.

Un tour qui n’a lancé qu’un seul sous-agent l’affiche dans une carte d’une ligne : son icône avec un point d’état, son titre, ce qu’il est (« Sous-agent Claude Code · Explore · Sonnet 5.5 », ou « Sous-agent Hydor · Claude Code · Sonnet 5.5 », avec l’agent sous lequel il travaille et son niveau quand il en a), et où il en est.

Pour en arrêter un, pointez sa ligne (ou atteignez-la avec Tab) et **Arrêter** s’affiche à la place de sa durée ; sur un écran tactile, un petit bouton d’arrêt est toujours présent. Un sous-agent Claude Code demande d’abord confirmation (« Arrêter ce sous-agent ? »), un sous-agent Hydor s’arrête immédiatement, et un sous-agent Codex ne peut pas être arrêté individuellement d’ici. Le menu **⋯** de la carte propose **Arrêter 5 sous-agents** (avec le nombre de ceux qui peuvent être arrêtés), qui les arrête tous sans demander confirmation. L’appel qui a lancé un sous-agent reste une étape du travail replié du tour.

Quand un sous-agent qui travaillait en arrière-plan revient, la conversation du parent affiche une ligne : « Réponse de » suivi de son titre, ou « … a été arrêté », ou « … s’est arrêté avec une erreur », avec le début de ce qu’il a écrit. Cliquez dessus pour lire la réponse, et sur **Ouvrir sa session** pour y accéder. La réponse d’un sous-agent Codex est récupérée dans sa propre conversation quand vous ouvrez la ligne. Une réponse arrivée pendant que le parent travaillait encore s’affiche sur place, entre les étapes qui la précèdent et celles qui la suivent.

Dans un sous-agent Hydor, une barre au-dessus de la zone de message indique « Sous-agent de » et le titre du parent (« ses réponses y retournent »), avec **Ouvrir le parent**. Un sous-agent Claude Code ou Codex s’ouvre aussi comme une session, en lecture seule : il montre la tâche qui lui a été confiée, ses étapes et sa réponse, en direct pendant qu’il travaille, sans zone de message ni **Reprendre** ni menu de session. À la place de la zone de message, une barre indique « Sous-agent Claude Code de » et le titre du parent (« ses réponses y retournent »), avec **Ouvrir le parent**. Tant qu’un sous-agent Claude Code travaille, **Arrêter** dans son en-tête l’arrête, après confirmation. Lui envoyer un message, le reprendre, le dupliquer, le transmettre ou le supprimer est refusé : son programme l’exécute dans la session de son parent, donc adressez-vous au parent.

Un parent dont le tour est terminé alors que ses sous-agents tournent encore n’est pas terminé : son point continue de respirer en bleu, l’anneau du bouton Arrêter de la zone de message continue de tourner, son état indique « En cours · 2 sous-agents en cours », il n’affiche pas de marque « Terminé » et reste dans Actives, et vous pouvez toujours lui envoyer un message. C’est vrai pour une session Claude Code comme pour une session Codex. Un sous-agent Hydor compte aussi comme en cours tant que des sous-agents ou des tâches d’arrière-plan qu’il a lancés (une commande, un moniteur) tournent après la fin de son propre tour, de sorte que son parent apparaît comme en cours, pas terminé. Un plafond de dépenses sur le parent couvre ses sous-agents Hydor, et ce que dépense un sous-agent Claude Code ou Codex est déjà la dépense du parent. Voir [Recherche approfondie, seconds avis et plusieurs agents](/guide/research).

Au-dessus de la zone de message, une ligne résume tout ce que la session a lancé : ses sous-agents et ses tâches d’arrière-plan (commandes, moniteurs, workflows). Elle indique « 2 sous-agents et 1 tâche d’arrière-plan en cours », avec « 1 a besoin de vous » en ambre quand un sous-agent Hydor vous attend, ou « 3 sous-agents · 2 tâches d’arrière-plan · tout est terminé » quand rien ne tourne, et elle est repliée à chaque ouverture de la session. Cliquez dessus pour lister chaque élément : ce qui a besoin de vous en haut, puis ce qui tourne, puis ce qui est terminé, le plus récent en premier, avec défilement à l’intérieur après environ cinq lignes. Chaque ligne a la même forme : une icône avec un point d’état, le titre, ce que c’est (« Sous-agent Hydor · Claude Code · Sonnet 5.5 », « Sous-agent Claude Code · Explore · Haiku 5.5 », « Commande », « Moniteur », « Workflow »), où il en est (« En cours · 2 min 10 s », « A besoin de vous », « Terminé · il y a 3 min », « Arrêté », « En échec »), le coût d’un sous-agent Hydor (un sous-agent du programme n’en affiche aucun : sa dépense est celle de son parent), **Ouvrir**, et un bouton d’arrêt (un carré dans un cercle) tant qu’il tourne. Pointez ce que c’est pour voir qui l’exécute : « Hydor l’a démarré comme une session à part entière : ouvrez-la pour le suivre ou lui parler », ou « Claude Code l’exécute dans cette session : ouvrez-le pour le suivre ». **Ouvrir** vous conduit à la session d’un sous-agent Hydor ou d’un sous-agent Claude Code ou Codex ; une commande, un moniteur ou un workflow s’ouvre dans un panneau sur la droite de la page (tout l’écran sur un téléphone), avec son titre, sa sorte et son état, **Arrêter** tant qu’il tourne, et en dessous sa sortie. Elle s’actualise toutes les deux secondes et reste sur les lignes les plus récentes, sauf si vous remontez. Le bouton d’arrêt d’un sous-agent s’intitule « Arrêter ce sous-agent », celui d’une tâche « Arrêter cette tâche ». **Tout arrêter**, à droite de la ligne, arrête tout ce qui tourne, comme le bouton Arrêter près de la zone de message. Les membres d’un essaim ou d’une campagne ne sont pas listés ici : son tableau de bord les montre. Les tâches terminées restent listées jusqu’à l’arrêt du programme de l’agent ; une session ouverte dans VS Code ou un terminal liste ses tâches mais ne peut pas les arrêter.

Le nombre de sous-agents Hydor qu’une session exécute en même temps se règle dans [Paramètres → Capacités → Sous-agents](/settings?s=children) : ces réglages concernent les sous-agents Hydor, car les sous-agents propres à Claude Code et à Codex s’exécutent dans leur session. Avec [Diriger avec des sous-agents](/settings?s=models&find=Lead%20with%20subagents) activé dans Paramètres → Modèles → Niveaux, l’agent principal d’une session planifie, confie des parties claires à des sous-agents sur des niveaux moins chers et vérifie leur travail.

## Tout ce que contient le menu de la session

Le bouton ⋯ en haut à droite d’une session ouvre son menu. Certains éléments n’apparaissent que s’ils s’appliquent. Le menu d’une [session confidentielle](#keep-a-session-confidential) n’a pas **Partager un lien en lecture seule**, **Ouvrir une pull request**, **Ouvrir un navigateur**, **Comptes connectés**, **En faire une automatisation** ni **Enregistrer comme app**, et sa mémoire reste désactivée.

- **Renommer** : modifier le titre directement.
- **Épingler en haut** / **Désépingler**.
- **Reporter** (un sous-menu d’horaires), ou **Annuler le report (retour à …)** tant que la session est reportée.
- **Clore : terminé pour le moment** : arrête l’agent et marque la session comme lue (pas pendant qu’un tour est en cours).
- **Dupliquer** : une nouvelle session à partir de cette conversation (Claude Code, Codex, Custom).
- **Continuer dans Codex**, **Continuer dans Claude Code**, **Continuer dans Custom** : reprendre la conversation avec un autre agent (depuis Claude Code et Codex).
- **Définir un objectif** : continuer à travailler jusqu’à ce qu’une condition soit remplie (Claude Code, Codex, Custom ; tant qu’aucun objectif n’est défini).
- **Second avis** : le modèle d’une autre entreprise vérifie le travail d’un tour par rapport à ce que vous avez demandé, et ses constats s’affichent sous ce tour. Voir [Recherche approfondie, seconds avis et plusieurs agents](/guide/research).
- **Partager un lien en lecture seule**.
- **Exporter** (un sous-menu) : **Exporter en Markdown**, **Copier en Markdown** et **Conserver comme document**. Voir [Exporter une conversation](#export-a-conversation).
- **Dossier et code** (un sous-menu, pour les sessions avec un dossier) :
  - **Relire les modifications** : ce que la branche modifie, fichier par fichier.
  - **Ouvrir une pull request**, ou **Pull request n° 12** quand il y en a déjà une.
  - **Worktree : agent/…** : la boîte de dialogue du worktree (sessions dans un worktree).
  - **Parcourir le dossier** : ouvre Fichiers sur le dossier de la session.
  - **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** : dans l’app de bureau, le dossier de la session sélectionné dans le gestionnaire de fichiers du système (voir [Travailler avec des fichiers et des dossiers](/guide/files-git#work-with-files-and-folders)).
  - **Ouvrir un terminal ici** : un nouveau terminal dans le dossier (dans le panneau du bas sur un ordinateur, sur la page Terminal sur un téléphone).
- **Paramètres de la session** (un sous-menu) :
  - **Mémoire**, avec **Activé** ou **Désactivé** à côté : active ou désactive la mémoire pour cette session (« Désactivée pour tous » quand la mémoire est désactivée dans les Paramètres). Voir [Mémoire](/guide/memory).
  - **Plafond de dépenses**, avec le plafond à côté : le définir, le modifier ou le relever. Voir [Utilisation, limites et coûts](/guide/usage).
  - **Comptes connectés** : activer ou désactiver chaque compte connecté pour cette session seulement. Voir [Apps connectées, clés et outils](/guide/connections).
  - **Essaim**, avec **Désactivé**, **Activé** ou **Campagne** à côté : ouvre une boîte de dialogue pour activer ou désactiver un essaim ou une campagne à partir de votre prochain message. Voir [Recherche approfondie, seconds avis et plusieurs agents](/guide/research#set-a-swarm-on-a-hard-problem).
  - **Recherche approfondie**, avec **Désactivée** ou le nombre de recherches à côté : ouvre une boîte de dialogue pour activer, désactiver ou modifier une recherche approfondie à partir de votre prochain message. Voir [Recherche approfondie, seconds avis et plusieurs agents](/guide/research#turn-it-on). (Essaim et Recherche approfondie n’apparaissent pas pour une session confidentielle, ni pour une session démarrée par une autre session.)
  - **Agent**, avec son nom à côté : ouvre la page de l’agent (sessions avec un agent). Le champ de message permet d’en changer.
- **Plus** (un sous-menu) :
  - **Ouvrir un navigateur** / **Afficher le navigateur** : le navigateur des agents pour cette session, que vous pouvez regarder et dont vous pouvez prendre le contrôle. Voir [Recherche et navigateur](/guide/web).
  - **En faire une automatisation** : le modèle d’appoint lit la session et en rédige une tâche planifiée. Modifiez ce que vous voulez, essayez-la avec une exécution de test, puis enregistrez. Voir [Tâches planifiées](/guide/tasks).
  - **Enregistrer comme app** : démarre une nouvelle app à partir de cette session. Voir [Apps](/guide/apps).
  - **Compacter la conversation** (Claude Code et Codex).
  - **Copier la commande de reprise du CLI** : la commande pour poursuivre cette session dans un terminal.
  - **Arrêter le processus de l’agent** (tant que l’agent tourne et qu’aucun tour n’est en cours).
- **Archive** / **Désarchiver**.
- **Supprimer la session** : supprime son historique du disque, après confirmation.

## Demander à un agent

- « Démarre une session Claude Code dans ~/code/blog, dans un nouveau worktree, qui ajoute un flux RSS, avec un plafond de dépenses de 5 $. »
- « Quelles sessions se sont terminées depuis ce matin ? Clos celles qui sont terminées et archive celles de la semaine dernière. »
- « Pourquoi cette session indique-t-elle Échec, et que dois-je envoyer pour réessayer ? »
- « Combien a coûté le dernier tour de cette session, et quelle part revient au cache ? »
- « Reporte la session sur les formulaires d’impôts à lundi 9 h. »
- « Mets le graphique des ventes et les chiffres clés que tu viens de me montrer sur mon tableau de bord Boutique. »
- « Donne à la session « Corriger l’envoi » l’objectif : npm test réussit et les envois de fichiers de 2 Go fonctionnent. »
- « Duplique la session des notes de version et essaie une version plus courte. »
- « Passe la session « Nettoyage des données » en mode Accepter les modifications et envoie : continue avec le fichier suivant. »
- « Envoie cette correction dans ma session Custom en cours ; si elle date d’avant la mise à jour, mets-la en attente jusqu’à la fin du tour. »
- « Que signifie l’anneau qui tourne sur Arrêter ? »
- « Arrête tout ce que cette session a démarré : ses sous-agents et ses tâches en arrière-plan. »
- « Que montre la ligne au-dessus du champ de message avec les sous-agents et les tâches en arrière-plan ? »
- « Lesquels de ces sous-agents ont été démarrés par Hydor, et lesquels par Claude Code ? »
- « Ouvre le sous-agent Claude Code qui a écrit les tests. »
- « Explique le fonctionnement d’une pompe à chaleur, avec un diagramme du cycle et une image d’une pompe. »
- « Compare les trois liseuses dans un tableau et choisis-en une pour moi. »
- « Conserve notre conversation sur les vélos électriques comme document dans mon projet Thèse. »
- « Montre sur une carte les meilleurs restaurants de ramen près de la gare de Shibuya. »
- « Fais-moi un quiz sur la Révolution française : cinq questions. »
- « Donne-moi des exercices sur la résolution des équations du second degré, avec des indices. »
- « Annote ma dissertation avec ce qu’il faut corriger, et donne-moi la version corrigée. »
- « Vérifie les faits de ces cinq affirmations de l’article. »
- « Laisse-moi essayer cet extrait de code Python et le modifier. »
- « Lesquels de mes modèles peuvent exécuter une session confidentielle, et lequel serait utilisé ? »
- « Démarre une session confidentielle dans ~/relectures/4711 qui relit l’article qui s’y trouve pour ICLR. »
- « Pourquoi ma session confidentielle ne peut-elle pas faire de recherche sur le web, et que peut-elle encore faire ? »
- « Montre pourquoi les poids d’attention ont une somme égale à 1, avec les équations et un exemple numérique. »
- « Fais un graphique de l’onglet Ventes de ma feuille de calcul Chiffres boutique, par mois, une ligne par région, et garde-le à jour. »
- « Pourquoi ma nouvelle session m’a-t-elle demandé si je voulais d’abord constituer la mémoire du projet, et que se passe-t-il si je choisis Démarrer maintenant ? »
