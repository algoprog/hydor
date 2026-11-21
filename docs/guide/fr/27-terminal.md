# Hydor dans un terminal

La commande `hydor` fait dans un terminal ce que vous faites dans les pages de l’app : discuter avec un agent et suivre son travail en direct, approuver ce qu’il demande et répondre à ses questions, exécuter une requête depuis un script et récupérer la réponse, et gérer tout ce que l’app conserve : vos sessions, projets, agents, Mémoire, compétences, plugins, clés, tâches planifiées, utilisation et tous les paramètres. Lorsque seule une page peut le faire (dessiner une signature, les éditeurs de diapositives et de diagrammes), la commande vous donne l’adresse de la page. Elle utilise le même Hydor que l’app : une session démarrée dans le terminal apparaît dans l’app, et une session démarrée dans l’app peut se poursuivre dans le terminal. Votre shell la complète au fur et à mesure que vous tapez.

![La commande hydor : sa boîte de bienvenue et le menu qui s’ouvre quand vous tapez une barre oblique](images/terminal.webp)

## Obtenir la commande

- **Installé avec l’installateur** (`./install.sh`) : l’installateur crée un lien `hydor` dans `~/.local/bin` lorsque ce dossier figure dans votre PATH, et vous le signale. Sinon, il indique où se trouve la commande : `bin/hydor.mjs` dans le dossier de Hydor, que vous pouvez exécuter tel quel ou lier à l’endroit où vous rangez vos commandes.
- **Avec Docker** : l’image la contient. Exécutez `docker exec -it hydor hydor` pour discuter avec un agent dans le conteneur.
- **L’app Mac** place la commande dans votre PATH toute seule, à chaque démarrage. Elle crée un lien `hydor` dans `~/.local/bin`, `~/bin`, `/usr/local/bin` ou `/opt/homebrew/bin`, le premier de ces dossiers qui figure dans votre PATH et dans lequel vous pouvez écrire. Si aucun ne convient, elle utilise `~/.local/bin` et ajoute une ligne, signalée comme appartenant à Hydor, au fichier de démarrage de votre shell (`~/.zprofile` pour zsh) afin que ce dossier soit dans votre PATH. Ouvrez ensuite une nouvelle fenêtre du Terminal. La commande utilise le Node.js propre à l’app, et lorsque l’app est fermée, `hydor` l’ouvre. Elle ne fait rien depuis l’image disque, ni avant que vous ayez déplacé l’app dans **Applications**. Dans l’app, `hydor update`, `hydor service install` et `hydor serve` indiquent simplement que l’app s’en charge elle-même.
- **Les apps de bureau Linux et Windows** font de même à chaque démarrage, sans mot de passe et sans poser de question. Sous **Linux** (l’AppImage ou le .deb), la commande est un petit fichier `hydor` placé dans `~/.local/bin`, `~/bin` ou `/usr/local/bin`, le premier de ces dossiers qui figure dans votre PATH et dans lequel vous pouvez écrire. Si aucun ne convient, elle utilise `~/.local/bin` et ajoute une ligne, signalée comme appartenant à Hydor, au fichier de démarrage de votre shell. Le `/usr/bin/hydor` du .deb ouvre la fenêtre de l’app, la commande doit donc se trouver avant lui dans votre PATH. Sous **Windows**, elle place `hydor.cmd` dans votre dossier WindowsApps, que Windows parcourt déjà ; sinon, dans `%LOCALAPPDATA%\Hydor\bin`, qu’elle ajoute à votre PATH. Ouvrez ensuite un nouveau terminal (Windows Terminal, PowerShell ou Invite de commandes). Comme sur Mac, la commande utilise le Node.js propre à l’app, `hydor` ouvre l’app lorsqu’elle est fermée, et `hydor update`, `hydor service install` et `hydor serve` indiquent simplement que l’app s’en charge elle-même. Si un autre `hydor` figure déjà dans votre PATH (le lien que crée l’installateur vers une copie issue de git), l’app ne touche à rien. Depuis une copie de Hydor sur un autre ordinateur, vous pouvez quand même utiliser le sien : voir [Utiliser le Hydor d’un autre ordinateur](#use-another-computers-hydor).

`hydor help` énumère tout ce qu’elle sait faire, par groupes, avec une ligne pour chaque commande ; `hydor help <command>` donne l’usage d’une commande, ses options et des exemples, `hydor help options` liste toutes les options, et `hydor help <command> <verb>` détaille un verbe. Les commandes de maintenance fonctionnent sous le même nom : `hydor service status`, `hydor setup-token`, `hydor update` et les autres (`node dist/server/cli.js …` fonctionne toujours aussi). Si vous faites une faute de frappe dans une commande, une option ou un verbe, elle répond « Did you mean …? ». Les erreurs s’affichent en rouge.

Un message qui commence par le nom d’une commande se met entre guillemets (`hydor "find the bug in login"`), ou après `hydor chat`, pour ne pas être pris pour la commande.

Vous n’avez pas besoin de démarrer Hydor d’abord. Lorsque rien ne répond sur cet ordinateur, la commande le démarre en arrière-plan, affiche **Starting Hydor…** et le laisse tourner une fois terminée, afin que vos sessions continuent. `hydor status` indique quel Hydor elle utilise, sa version, s’il fonctionne comme un service, et ce qui est en marche. Sur un ordinateur doté de l’app de bureau, c’est l’app fermée qui est ouverte : la commande ne démarre pas de serveur de son côté.

## Complétion par tabulation dans votre shell

Activez-la une seule fois :

```bash
hydor completion install
```

Elle configure le shell que vous utilisez (bash, zsh ou fish) : elle écrit le script là où le shell le cherche et, pour zsh et pour bash sans bash-completion, ajoute une ligne à votre `.zshrc` ou `.bashrc`. Ouvrez ensuite un nouveau terminal. La relancer ne change rien une seconde fois. `hydor completion bash` (ou `zsh`, `fish`) affiche plutôt le script, pour que vous le placiez où vous voulez : `source <(hydor completion bash)`.

Ensuite, la touche Tab complète ce que vous tapez : les commandes, leurs verbes et leurs options, ainsi que les éléments qu’elles acceptent. Après `hydor show ` ou `hydor send `, elle liste les clés de vos sessions, chacune avec son titre ; après `--model`, les modèles ; après `--as`, vos agents ; après `--cwd`, les dossiers ; et de la même façon les projets, compétences, plugins, paramètres, sujets du guide et bien d’autres, tels qu’ils existent dans ce Hydor. Si Hydor ne répond pas rapidement, la complétion propose ce qu’elle peut sans lui, et ne bloque jamais votre shell.

## Parler à un agent

Dans un dossier, exécutez `hydor`, ou `hydor` suivi de votre message (`hydor corrige le test qui échoue`). Le premier message démarre une session dans ce dossier.

Le chat s’ouvre sur un panneau d’accueil, un cadre portant **HYDΩR** et sa version sur sa bordure supérieure. À l’intérieur figurent le dossier « sur » sa branche git (aucune branche n’est affichée quand git n’en a pas à nommer) ; puis le programme qui vous répondra (**Claude Code**, **Codex** ou **Custom**), le modèle (**Automatique** quand le modèle dépend de la tâche, sur un Hydor avec des niveaux) et le mode d’autorisation, séparés par un · ; le mode s’affiche en rouge quand l’agent agit sans demander, et dans la couleur d’accent pour planifier ; enfin une ligne d’astuces : `/ commandes · @ fichiers · ! shell · ↑ historique · Ctrl+R recherche · /help`. Le cadre garde la même largeur quel que soit le nom du dossier.

Ce que vous voyez reste dans l’historique propre au terminal : vous pouvez donc remonter et copier, y compris via SSH et dans tmux :

- **Vos messages**, après un `›`.
- **Le texte de l’agent** au fur et à mesure, avec ses titres, listes, citations, tableaux, liens (l’adresse après les mots) et code (jamais remis à la ligne, pour que ce que vous copiez s’exécute).
- **Chaque étape** sur une ligne : ce qu’il a lu, cherché, modifié (avec les lignes ajoutées et supprimées), exécuté (avec la durée, et son code de sortie en cas d’échec, avec la première ligne de l’erreur en dessous).
- **Les réflexions** sur une ligne discrète, comme « Réflexion pendant 8 s ». Démarrez avec `--thinking` pour les voir en entier, et avec `-v` pour voir les premières lignes de la sortie de chaque étape.
- **Les sous-agents** : « Sous-agent démarré » quand l’agent confie une partie de son travail à un [sous-agent Hydor](/guide/research#let-an-agent-hand-work-to-subagents), et « Sous-agent terminé » (ou « Sous-agent en échec ») quand sa réponse revient. Claude Code peut aussi lancer ses propres sous-agents en arrière-plan et terminer son tour pendant qu’ils travaillent : les lignes du bas indiquent lesquels travaillent en arrière-plan, « Terminé en arrière-plan » s’affiche à la fin de chacun, et l’agent poursuit de lui-même. Une commande qu’il laisse tourner en arrière-plan, comme un serveur de développement, ne bloque rien. `/subagents` les liste tous avec ce que fait chacun (et ce qu’a coûté un sous-agent).
- **La fin de chaque tour** : sa durée, son coût, le modèle, et le nombre de sous-agents ayant travaillé (« 1 sous-agent », « 3 sous-agents »).

En bas, quelques lignes changent pendant que l’agent travaille : le texte en cours d’écriture, l’étape en cours, les sous-agents au travail, un indicateur d’activité en couleur avec le temps écoulé (un reflet traverse « Travail en cours ») et votre ligne de saisie. Appuyez sur **Esc** ou Ctrl+C pour arrêter le tour.

### La ligne de saisie

Votre saisie se place entre deux filets fins, avec une ligne d’état en dessous : le dossier sur sa branche, le modèle et le mode, et le coût jusqu’ici, avec `/help` à droite.

- **Une suggestion grise** tirée de vos messages précédents s’affiche après ce que vous tapez. **→** l’accepte, **Alt+→** en accepte un mot. **Paramètres → App → Général → Suggestions du terminal** l’active et la désactive ([Paramètres](/settings?s=general&find=Terminal%20suggestions)).
- **Ctrl+R** recherche dans vos messages précédents : tapez quelques-uns de ses mots, passez à une correspondance avec **↑** et **↓**, et **Entrée** la place dans la ligne sans l’envoyer, pour que vous puissiez la modifier d’abord. **Esc** abandonne.
- Un message peut comporter plusieurs lignes, et un texte collé arrive en entier.

### Le menu de complétion

Un menu s’ouvre sous la ligne pendant que vous tapez, et suit chaque touche :

| Saisie | Le menu liste |
| --- | --- |
| `/` | Les commandes, chacune avec ce qu’elle fait : d’abord celles du chat, puis celles du programme (les commandes et compétences de Claude Code, par exemple). |
| `/model `, `/mode `, `/effort `, `/agent `, `/subagents `, `/open ` | Les valeurs de cette commande : les modèles, modes, efforts, vos agents, les sous-agents, où ouvrir. |
| `@` et quelques lettres | Les fichiers du dossier de la session, trouvés de façon approximative : `@clits` trouve `src/cli.ts`. Terminez par `/` pour parcourir ce dossier. |

**↑** et **↓** déplacent la sélection, **Tab** complète la ligne en surbrillance, et **Entrée** la complète et l’exécute (une commande qui a besoin d’une valeur ouvre à la place les valeurs de cette commande). **Esc** ferme le menu. La correspondance est approximative, et les lettres d’une commande n’ont pas besoin d’être côte à côte : `mdl` trouve `/model`.

### Sélecteurs

`/sessions`, `/resume`, `/model`, `/effort`, `/mode` et `/agent`, tapés sans valeur, ouvrent un sélecteur : une liste avec une ligne en surbrillance. **↑** et **↓** déplacent la sélection, taper réduit la liste, **Entrée** choisit, **Esc** quitte. Un chiffre permet toujours de choisir quand la liste compte neuf lignes ou moins. `hydor resume` sans clé ouvre le même sélecteur de vos sessions.

### Commandes shell avec `!`

Commencez une ligne par `!` et le reste s’exécute comme une commande shell dans le dossier de la session : `!git status`, `!npm test`. Le chat cède le terminal pendant l’exécution, si bien que les programmes interactifs fonctionnent (`!vim notes.md`, `!htop`), et le reprend à la fin. L’invite devient jaune tant que la ligne commence par `!`. L’agent ne voit ni la commande ni ce qu’elle a affiché ; pour lui montrer quelque chose, dites-le dans un message. Cela ne fonctionne qu’avec le Hydor de cet ordinateur.

### Répondre à ce que l’agent demande

Quand l’agent a besoin de votre approbation, la demande s’affiche avec son objet (la commande, la modification d’un fichier, le plan), et ses choix en dessous :

- Appuyez sur **y** pour le premier choix qui l’autorise, sur **n** pour la refuser, ou sur le **nombre** de n’importe quel choix (comme « Toujours autoriser »).
- Pour la refuser et dire à l’agent quoi faire à la place, tapez-le et appuyez sur Entrée.

Une question affiche ses choix numérotés : appuyez sur un nombre pour en choisir un (plusieurs, pour une question qui en accepte plusieurs, puis Entrée), ou tapez votre propre réponse et appuyez sur Entrée. Esc l’ignore. Un formulaire pose ses champs un par un : tapez chaque réponse et appuyez sur Entrée, ou appuyez sur Entrée pour garder ce qui est affiché. Un fichier se demande par son chemin sur cet ordinateur.

Certaines demandes nécessitent l’app : une signature, ou une clé pour l’une de vos apps. Le terminal l’indique et donne l’adresse de la session dans l’app.

### Quand le navigateur de l’agent vous attend

Ce que le navigateur d’un agent attend de vous s’affiche sous forme de carte dans le chat, après toute approbation qui la précède, avec les mots qu’utilise l’app (voir [Le navigateur des agents](/guide/web#the-browser-agents-use)) :

- « A besoin de vous dans le navigateur : … », pour une connexion, une vérification ou tout ce dont l’agent n’est pas sûr, avec l’adresse de la page en dessous.
- « Arrêté avant de payer ou de commander : …. C’est à vous de le faire ».
- « Veut ouvrir localhost:3000, sur cette machine ou son réseau ».
- « Veut appuyer sur « Envoyer » sur mail.example.com », pour un bouton qui envoie, publie, supprime ou transfère sur un site où le navigateur est connecté (voir [Les boutons qui envoient, publient ou suppriment](/guide/web#buttons-that-send-post-or-delete)) ; la carte ajoute qu’il n’appuie dessus que si vous l’autorisez.
- La question d’une fenêtre contextuelle de la page : le site parle (ou demande s’il faut quitter), avec son message.

La carte affiche ses touches, et un appui y répond :

- Pour une adresse ou un bouton : **y** l’autorise (une adresse, pour cette session) et **n** ne l’autorise pas.
- Pour une connexion, une vérification ou un paiement, que vous seul pouvez faire dans la page : **o** ouvre dans votre navigateur la page de la session dans l’app, pour que vous preniez la main là-bas, **d** indique que vous avez terminé, et **n** indique que vous ne pouvez pas (ou pas maintenant, pour un paiement).
- Pour une question de fenêtre contextuelle : **y** vaut OK (Quitter, pour « Quitter cette page ? ») et **n** vaut Annuler (Rester). Une alerte n’a que OK. Pour une invite de texte, tapez votre réponse et appuyez sur Entrée, ou appuyez sur **y** pour garder ce qui est affiché, ou sur **n** pour annuler.

Le terminal ne peut pas afficher la page elle-même : utilisez donc **o** pour prendre la main. Une fois la demande traitée, la carte se réduit à une ligne : « Fait dans le navigateur », « Ignoré », « Autorisé » ou « Non autorisé ».

### Pendant qu’il travaille

Votre ligne de saisie reste à vous. Ce que fait Entrée pour un message envoyé pendant que l’agent travaille dépend de **Envoi pendant qu’un agent travaille** dans [Paramètres → App → Général](/settings?s=general&find=Sending%20while%20an%20agent%20works) : **Rejoindre le tour** (par défaut, comme dans l’app) l’ajoute au tour en cours, et **Attendre qu’il se termine** le met en file d’attente, pour partir à la fin du tour (il s’affiche comme **en attente**). Quel que soit le réglage, deux commandes décident pour un message :

- `/queue <message>` attend toujours la fin du tour.
- `/now <message>` rejoint toujours le tour en cours.

Les deux paramètres de l’appareil, **Envoi pendant qu’un agent travaille** et **Suggestions du terminal**, sont propres au chat : réglez-les ici, avec `hydor settings set general.sending-while-an-agent-works wait`, ou demandez à l’agent d’en changer un (voir [Paramètres](#settings)), et le chat suit aussitôt.

### Touches

- **Entrée** envoie. **Alt+Entrée**, **Ctrl+J**, ou un `\` en fin de ligne avant Entrée, ajoute une ligne. Un texte collé arrive en entier, avec ses sauts de ligne.
- **↑** et **↓** parcourent vos messages précédents (les 500 derniers sont conservés) ; dans un message de plusieurs lignes, elles se déplacent d’abord entre ses lignes. Avec le menu ouvert, elles se déplacent dans le menu.
- **←**, **→**, **Accueil**, **Fin**, **Ctrl+A** et **Ctrl+E** déplacent le curseur ; **Alt+←** et **Alt+→** le déplacent d’un mot à la fois ; **Ctrl+W** supprime le mot avant le curseur, **Ctrl+U** et **Ctrl+K** le reste de la ligne avant et après lui.
- **Tab** ouvre le menu, et accepte la ligne en surbrillance. **Ctrl+R** recherche dans les messages précédents.
- **Esc** ferme le menu, ou arrête le tour. **Ctrl+C** arrête le tour quand il y en a un en cours, efface la ligne quand elle contient du texte, et sinon quitte quand vous l’appuyez deux fois. **Ctrl+D** sur une ligne vide quitte. **Ctrl+L** efface l’écran. **Ctrl+Z** suspend le chat (`fg` le ramène).

`/keys` les liste dans le chat. Quand vous quittez, la session continue : le terminal vous indique comment y revenir.

### Commandes

Tapez-les dans la ligne de saisie (`/` les liste) :

- `/help` : les commandes, les touches, et quelques autres choses (`@`, `!`), en sections : **Commandes**, **Clés**, **Aussi**. `/keys` liste seulement les touches.
- `/new` (et un message) : une nouvelle session dans le même dossier.
- `/sessions` (ou `/resume`) : choisir une autre session à poursuivre.
- `/model`, `/effort`, `/mode` : changer le modèle, l’intensité de sa réflexion, et ce qu’il peut faire sans demander. Sans nom, chacune ouvre un sélecteur.
- `/agent` : travailler comme l’un de [vos agents](/guide/agents), à partir du message suivant.
- `/subagents` : les sous-agents, y compris ceux en arrière-plan, ce que fait chacun (et ce qu’a coûté un sous-agent) ; `/subagents 2` affiche la conversation du deuxième sous-agent.
- `/tiers`, `/usage`, `/cost` : quel modèle correspond à chaque niveau, l’utilisation et les limites de vos forfaits, et ce que coûtent cette session et ses sous-agents.
- `/copy` : copie la dernière réponse de l’agent dans le presse-papiers, y compris via SSH et dans tmux. `/clear` efface l’écran.
- `/queue` et `/now` : envoient un message pour qu’il attende ou qu’il rejoigne le tour, selon le réglage ([Pendant qu’il travaille](#while-it-works)).
- `/stop`, `/rename`, `/open`, `/quit` : arrêter le tour et les sous-agents en arrière-plan, renommer la session, afficher son adresse dans l’app, quitter.
- `/hydor <commande>` : exécuter dans le chat n’importe quelle commande des sections suivantes ([Dans le chat](#inside-the-chat)).

Toute autre `/commande` part telle quelle à l’agent, pour les commandes et compétences propres au programme.

Les couleurs sont en couleurs vraies quand le terminal les gère. `NO_COLOR` et `--no-color` les désactivent, tout comme un tube (pipe).

## Poursuivre une session

- `hydor -c` poursuit la dernière session du dossier où vous vous trouvez.
- `hydor resume` ouvre un sélecteur de vos dernières sessions ; `hydor resume 6f1e2a3b` poursuit celle-là.

Les derniers tours s’affichent d’abord, chacun avec son travail replié sur une ligne (« 3 commandes exécutées, 4 fichiers lus ») ; `hydor show` affiche tout.

## Choisir comment démarre une session

Ces options accompagnent `hydor`, `hydor run` et `hydor resume` :

- `--agent claude`, `codex`, `custom`, ou le nom d’un [autre programme d’agent](/guide/agents-models) : quel programme répond.
- `--model` (le nom d’un modèle, ou `auto` pour Automatique), `--effort`, et `--mode ask`, `edits`, `plan` ou `full` (ou le nom propre au programme pour un mode).
- `--as Researcher` : démarrer comme l’un de [vos agents](/guide/agents).
- `--cwd` (un dossier ; le dossier où vous vous trouvez si vous l’omettez), `--worktree` (une branche et un dossier à part), `--cap 2` (dépenser au plus 2 $), `--no-memory`, `--title`.

Ce que vous omettez provient du dernier choix fait sur la page de démarrage de l’app, puis des valeurs par défaut de l’app.

## Une requête depuis un script

`hydor run "…"` (ou `hydor -p "…"`) démarre une session avec votre message, la suit jusqu’à la fin du travail, affiche la dernière réponse de l’agent, puis se termine. Le travail est terminé lorsque le tour est fini, qu’aucun sous-agent ne travaille encore ni ne doit encore une réponse (y compris les sous-agents Claude Code eux-mêmes en arrière-plan, qu’ils dépendent de l’agent ou d’un sous-agent), et que rien n’attend dans la file : un agent qui termine son tour pour attendre ses sous-agents est réveillé par leurs réponses ou par leur fin, et l’exécution attend aussi ce tour-là. Une commande laissée en arrière-plan, comme un serveur de développement, ne la retient pas. En cas de `--timeout` ou de Ctrl+C, les sous-agents en arrière-plan sont arrêtés avec le tour. Si rien ne suit la commande, elle lit le message depuis ce qui lui est transmis par un tube : `git diff | hydor run "relis cette modification"`.

- Dans un terminal, de courtes lignes sur le côté indiquent ce qui se passe (chaque étape, les sous-agents qui démarrent et se terminent) ; `-q` les désactive.
- Personne n’est là pour répondre : une approbation ou une question arrête donc l’exécution, indique ce qui a été demandé, et la session vous attend dans l’app ou avec `hydor resume`. Ce que le navigateur de l’agent attend produit le même effet (une connexion, un paiement, une adresse ou un bouton à autoriser, une question dans une fenêtre contextuelle), et l’exécution l’indique : « Le navigateur de l’agent : veut appuyer sur « Supprimer » sur mail.example.com ». Avec `--mode full` (ou `-y`), l’agent ne demande rien.
- `--json` affiche un seul objet à la fin : `key`, `url`, `status`, `reply`, `model`, `costUsd` (avec ceux de ses sous-agents), `tokens`, `durationMs`, `turns`, `children` (pour chaque sous-agent Hydor : `title`, `label`, `tier`, `costUsd`, `status`) et `error` en cas d’échec. `--stream-json` affiche une ligne à chaque changement au fur et à mesure (`item`, `live`, `note`), puis cet objet comme dernière ligne.
- `--timeout 300` arrête le tour après 300 secondes.

Elle se termine par un code de sortie qu’un script peut vérifier :

| Code | Ce qui s’est passé |
| --- | --- |
| 0 | Terminé |
| 1 | La session a échoué (une erreur, ou la limite d’utilisation du forfait, qu’elle nomme), ou Hydor a refusé |
| 2 | La commande n’a pas été bien utilisée |
| 3 | Une réponse de votre part est nécessaire |
| 124 | L’exécution a duré plus longtemps que `--timeout` |
| 130 | Vous avez appuyé sur Ctrl+C (le tour a d’abord été arrêté) |

## Tout ce que fait l’app, depuis le terminal

Chaque partie de l’app a sa propre commande, avec des verbes pour ce que fait sa page. Sans verbe, la commande affiche la liste : `hydor projects` équivaut à `hydor projects list`. `hydor help` les présente regroupées comme ci-dessous, et Tab complète les verbes, les options et les éléments qu’ils acceptent.

Fonctionnement commun à toutes :

- **Désigner un élément** : partout où une commande attend un élément (une session, un projet, un agent, une compétence…), donnez son identifiant ou le début de celui-ci, ou son nom ou son titre (majuscules ou minuscules, tant qu’un seul élément correspond). S’il y a plusieurs correspondances, la commande en liste jusqu’à cinq. Dans un terminal, si vous omettez le nom, la commande propose une liste où choisir.
- **Modifier un élément** : les champs sont des options (`--description`, `--name`). Un long texte vient de `--file <chemin>`, de ce que vous envoyez par un tube avec `-` ou, dans un terminal sans aucun des deux, de votre éditeur (`$VISUAL`, `$EDITOR`) ouvert sur le texte actuel : l’enregistrer sans le modifier ne change rien.
- **Retirer un élément** pose la question `Remove “name”? [y/N]`. `-y` (ou `--yes`) répond oui. Sans terminal et sans `-y`, la commande refuse plutôt que de deviner.
- **`--json`** affiche ce que renvoie l’API de l’app, tel quel, pour les scripts.
- **Codes de sortie** : 0 quand c’est fait, 1 quand Hydor a refusé ou échoué (il dit pourquoi), 2 quand la commande a été mal employée (il dit quoi saisir).
- **Hydor d’un autre ordinateur** : toutes les commandes fonctionnent avec `--server` et `--token`.
- **Seule une page peut le faire** : la commande le dit et donne l’adresse de la page. `hydor open … --browser` l’ouvre.

### Sessions

| Commande | Ce qu’elle fait |
| --- | --- |
| `hydor sessions` | Vos dernières sessions, chacune avec une marque : ● en cours, ● a besoin de vous, ✓ terminée, ✗ erreur. Ses verbes font ce que fait le menu d’une session : `search`, `rename`, `archive` et `unarchive`, `pin` et `unpin`, `read`, `snooze`, `move` vers un projet, `fork`, `goal` (sans mots, il montre l’objectif : son état, le tour, chaque vérification, ce qu’il a dépensé et une question éventuelle ; avec des mots, il en définit un, et l’agent propose les vérifications ; `--start` appuie sur **Début** pour elles, `--answer 1,3` répond à sa question avec les numéros affichés (avec `--other "une voie à vous"` et `--note`), `--wait` met la question en attente, `--more rounds=8,usd=5,minutes=60` lui en donne plus, `--rule "…"` ajoute une règle, et `--pause`, `--resume` et `--clear` le pilotent : une action par appel, et rien ne démarre tant que vous n’avez pas appuyé sur **Début**, ici ou dans l’app), `share` (un lien en lecture seule), `changes` (les fichiers qu’elle a modifiés), `commands` (les commandes qu’elle a exécutées), `queue` (les messages en attente, avec `queue clear` et `queue remove`), `show`, `export` (la conversation en fichier Markdown, `-o -` pour l’afficher, ou `--library` pour un document dans le projet de la session), `send`, `stop` et `delete`. |
| `hydor inbox` | Ce qui attend votre réponse (approbations, questions, une clé demandée par un agent, une compétence à examiner) : `list`, et `show` pour un élément, avec l’endroit où y répondre. |
| `hydor outbox` | Les appels en attente de votre accord (les outils d’un compte connecté réglés sur Demander d’abord) : `list`, `show` pour l’un d’eux avec ses données d’entrée, `send` (tel quel, ou avec `--set NAME=value` pour modifier un champ) et `drop`. |
| `hydor away` | Ce qui s’est passé depuis votre dernière visite, comme le montre **Pendant votre absence** sur la page d’accueil : ce qui attend votre réponse, les sessions terminées ou en échec, ce qui s’est exécuté tout seul avec son coût, et ce qui s’exécute ensuite aujourd’hui. `hydor away seen` marque tout comme vu. |

`hydor show 6f1e2a3b` revient au même que `hydor sessions show 6f1e2a3b`, et il en va de même pour `send` et `stop` : les formes courtes restent.

```bash
hydor sessions search connexion      # sessions sur la connexion
hydor sessions rename 6f1e "Corriger le bug de connexion"
hydor sessions fork 6f1e "essayer plutôt avec un cache"
hydor sessions export 6f1e -o notes.md  # la conversation en Markdown
hydor sessions goal 6f1e "tous les tests passent et la PR est ouverte"  # définir un objectif : l’agent propose les vérifications
hydor sessions goal 6f1e                  # voir : état, tour, vérifications, dépenses, sa question
hydor sessions goal 6f1e --start          # appuyer sur Début : les tours commencent
hydor sessions goal 6f1e --answer 1,3    # répondre à sa question : voies 1 et 3, dans cet ordre
hydor sessions goal 6f1e --more rounds=20,usd=10  # lui en donner plus, aussi à une limite
hydor inbox
hydor away                           # ce qui s’est passé pendant votre absence
```

### Votre travail

| Commande | Ce qu’elle fait |
| --- | --- |
| `hydor projects` | `list`, `show`, `new`, `rename`, `edit` (description, consignes, l’agent avec lequel il démarre, dossiers), `sessions`, `files` (les documents qu’il lit : `files add` et `files remove`) et `remove`. |
| `hydor tasks` | Vos [tâches planifiées](/guide/tasks) et les autres travaux qui démarrent d’eux-mêmes : `list`, `show`, `new` (quand elle s’exécute : `--every 2h`, `--at 09:00 --days weekdays`, `--cron`, `--once` ; ou `--webhook`, `--watch-feed`, `--watch-page`, `--watch-folder`, ou `--watch-account` avec `--tool` pour les nouveaux éléments d’une app connectée, et `--before 30m` pour une heure avant chaque événement d’un calendrier), `edit`, `pause`, `resume`, `run` (tout de suite, même en pause), `runs` (les dernières exécutions, `--reply` pour la dernière réponse) et `remove`. Surveiller une commande ou une adresse JSON se fait sur la page. Les actualisations d’une carte de tableau de bord sont listées comme celles du tableau de bord (« Boutique · Ventes par jour : actualisation ») : `pause`, `resume` et `run` fonctionnent sur elles, et `show` indique où les modifier, dans le tableau de bord. |
| `hydor apps` | Vos [apps](/guide/apps) et les apps prêtes à l’emploi : `list`, `show`, `run` (les réponses du formulaire sous la forme `field=value`, ou `--input` en JSON ; la commande affiche la réponse et ce qu’elle a coûté), `runs`, `run-show` (une exécution) et `remove`. `hydor app …` (sans le s) crée des apps sous forme de fichiers : `new`, `folder`, `dev`, `try`, `export`, `import`. |
| `hydor files` (aussi `hydor library`) | Ce que les agents ont fait pour vous et ce que vous avez gardé, comme le montrent les **Fichiers** des projets ([pages, images, vidéos et sites](/guide/library)) : `list` (`--kind`, `--project`), `search`, `show` (le texte d’un document, les cartes d’un tableau de bord, ou ce qu’est l’élément), `export` (`--to pdf`, `docx`, `pptx`…, `-o fichier`), `open` (l’adresse de son éditeur), `remove`, `refreshes` (ce qui s’actualise sur vos tableaux de bord, quand, et à quel coût) et `refresh` (une carte d’un tableau de bord, ou toutes, tout de suite). |
| `hydor experiments` | Les exécutions d’entraînement et d’évaluation : `list`, `show` et `stop`. Lancer une exécution est réservé aux agents et à la page. |

```bash
hydor projects new Thèse
hydor projects edit these --file consignes.md
hydor tasks new --at 09:00 --days weekdays "Résume mes e-mails non lus"
hydor apps run trip-planner destination=Lisbonne days=5
hydor files export "Rapport T3" --to pdf -o t3.pdf
```

### Agents et modèles

| Commande | Ce qu’elle fait |
| --- | --- |
| `hydor models` et `hydor tiers` | Les modèles proposés par chaque programme, et le modèle que désigne chaque [niveau](/guide/agents-models#tiers-a-model-for-each-kind-of-job) (`hydor tiers set claude best opus --effort high`, `hydor tiers reset` ; `hydor tiers team off` et `hydor tiers hard off` désactivent **Diriger avec des sous-agents** et **Max pour les problèmes difficiles**, et `on` les réactive). |
| `hydor usage` | L’utilisation et les limites de chaque forfait, et le moment de leur réinitialisation. |
| `hydor agents` | [Vos agents](/guide/agents) : `list`, `show`, `new`, `edit`, `results`, `export`, `install` et `remove` (les agents intégrés peuvent être copiés, pas modifiés). La destination des résultats d’un agent se règle avec `--results-to` sur `new` et `edit`, une fois par destination : `library` (la même page, mise à jour), `library:new`, `sheet` (une ligne dans une feuille de calcul qui lui est propre), `sheet:<feuille de calcul>#<onglet>`, `email:<adresses>`, `notify`, `file:<chemin>`, `webhook:<url>`, ou `none`. Ses champs de sortie se règlent sur sa page (`hydor open agents`) ; `results` liste ce qu’il a rendu, une ligne par résultat. `export` enregistre un agent dans un fichier `.hydor-agent` (`-o` pour le nommer) et indique ce qui a été laissé de côté ; `install <fichier>` indique ce qu’apporte et exige un fichier, puis demande confirmation, et l’installe à côté de votre agent du même nom, sauf avec `--replace` (`--schedules` ajoute les planifications qu’il suggère, en pause). Voir [Partager un agent sous forme de fichier](/guide/agents#share-an-agent-as-a-file). |
| `hydor accounts` | Les connexions de Claude Code et de Codex : `list`, `show` (un compte : qui est connecté et le forfait, si les nouvelles sessions démarrent avec lui, son utilisation et ses limites, si une clé API est enregistrée (jamais la clé elle-même), et si une session change de compte à une limite), `add <programme> <nom>` (un autre compte, connecté immédiatement), `sign-in`, `sign-out`, `remove` et `use` (celui avec lequel démarrent les nouvelles sessions). La clé API pour le crédit API et les bascules à une limite d’utilisation sont des paramètres (`accounts.*`). |

```bash
hydor agents new Comptable --tools read,edit --tier standard
hydor agents edit comptable --results-to sheet --results-to email:sam@example.com
hydor agents export comptable -o ~/Desktop/comptable.hydor-agent
hydor agents install comptable.hydor-agent --schedules
hydor tiers set claude best opus --effort high
hydor accounts add claude Travail
hydor accounts use travail
```

### Ce que les agents savent et utilisent

| Commande | Ce qu’elle fait |
| --- | --- |
| `hydor memory` | Ce que les agents retiennent de vous : `list`, `search`, `show`, `add`, `edit`, `forget` (récupérable pendant 30 jours) et `restore`, ainsi que `profile` et `profile edit` pour ce que chaque agent lit en premier. `--scope`, `--project` et `--session` précisent de quelles notes il s’agit. |
| `hydor guidelines` | `show` et `edit` ce que suivent tous les agents : pour toutes les sessions, pour un projet (`--project`) ou pour une seule session (`--session`). |
| `hydor skills` | Les compétences qu’utilisent les agents : `list`, `show`, `on`, `off`, `add` (depuis un `SKILL.md` ou un dossier) et `remove`. `--agent claude` ou `--agent codex` concerne les compétences propres à ces programmes. |
| `hydor plugins` | Des modules complémentaires avec des compétences et des outils : `list`, `show`, `on`, `off`, `add` (intégré, une adresse Git, un .zip ou un dossier) et `remove`. Créer votre propre plugin se fait sur sa page (`hydor open plugins`). |
| `hydor mcp` | Les serveurs d’outils (MCP) pour Claude Code et Codex : `list`, `show` (un serveur : son programme, sa portée, sa commande ou son adresse, les noms de ses variables d’environnement et de ses en-têtes avec leurs valeurs masquées, activé ou non, et avec `--tools` le nombre d’outils qu’il a), `status` (démarre chacun et indique lesquels fonctionnent), `add`, `edit` et `remove`. |
| `hydor connections` | Les [apps connectées](/guide/connections) (Notion, GitHub, Gmail…) : `list`, `show`, `services` (ce qui peut être connecté), `connect <service>` (une clé saisie en masqué, ou une connexion dans votre navigateur que la commande attend) et `disconnect`. Les outils d’une connexion qui sont activés se règlent sur sa page. |
| `hydor keys` | Le [coffre](/guide/connections) : `list` les noms de vos clés et où chacune peut aller, `set <NAME>` et `remove <NAME>`. Une valeur est demandée avec une saisie masquée, ou lue depuis ce que vous envoyez par un tube ; elle n’est jamais saisie comme option (votre shell la conserverait) et jamais affichée. |

```bash
hydor memory add Je préfère les réponses courtes
hydor memory forget 42
hydor skills off research
hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp
hydor keys set GITHUB_TOKEN --domain github.com
hydor guidelines edit --project these
hydor connections connect notion --browser
```

### Paramètres

`hydor settings` donne accès à chaque option des [Paramètres](/settings), dans ses trois groupes (**App**, **Agents**, **Capacités**) et leurs sections. Chaque option a un identifiant, comme `general.resume-after-usage-limits` : sa section, puis ses mots. Vous pouvez la désigner par cet identifiant, par sa section et le début de ses mots (`general.resume`), ou par ses seuls mots quand un seul convient ; Tab les complète.

Dans un terminal, `hydor settings` seul ouvre un navigateur : choisissez une section, puis une option. **↑** et **↓** et la saisie permettent de les trouver, **Entrée** ouvre une section ou modifie une option (un interrupteur bascule, un choix propose ses valeurs, un nombre ou un texte se saisit, un bouton demande d’abord confirmation), et **Esc** revient en arrière. Avec un tube, il liste toutes les options. Pour les scripts et les changements rapides :

| Commande | Ce qu’elle fait |
| --- | --- |
| `hydor settings list [section]` | Toutes les options avec leur valeur, ou celles d’une section. |
| `hydor settings get <option>` | La valeur d’une option et ce qu’elle accepte. |
| `hydor settings set <option> <valeur>` | La modifie : un interrupteur prend `on` ou `off`, un choix l’une de ses valeurs, un nombre un nombre entier, une liste ses éléments séparés par des virgules (`none` la vide). Une clé ou un jeton est demandé en masqué, ou lu depuis ce que vous envoyez par un tube. Un long texte vient de `--file` ou de votre éditeur. |
| `hydor settings run <option>` | Appuie sur un bouton de la page (**Envoyer un test**, **Vérifier maintenant**…), après avoir demandé confirmation quand cela supprime ou télécharge quelque chose. |
| `hydor settings open [section]` | L’adresse d’une section ou d’une option dans l’app. |

```bash
hydor settings list memory
hydor settings get general.resume-after-usage-limits
hydor settings set general.resume-after-usage-limits on
hydor settings set search.providers duckduckgo,naget
hydor settings run notifications.send-a-test
```

Ce que l’app conserve dans chaque navigateur (le thème, la langue, le son des notifications) ne peut pas être modifié d’ici : une telle option le dit et donne l’adresse de la page. Une option que seule la page peut modifier fait de même. Les deux paramètres d’appareil qui relèvent d’un terminal, **Envoi pendant qu’un agent travaille** et **Suggestions du terminal**, sont propres au chat, et `hydor settings set` les modifie.

### Trouver, se guider, ouvrir et api

- `hydor find rate limit` cherche partout où le fait la zone de recherche (**Ctrl+K**) : pages, paramètres et leurs options, sessions, mémoire, compétences… `--in settings` cherche seulement dans les paramètres, `--urls` affiche l’adresse de chaque résultat en dessous, et `--open 2` ouvre le deuxième dans votre navigateur.
- `hydor guide` liste les sujets du guide ; `hydor guide projects` en lit un dans le terminal, et `hydor guide projects "what a project is"` une section de celui-ci. `--sections` liste les sections d’un sujet.
- `hydor open` affiche l’adresse de l’app ; `hydor open published`, `hydor open settings memory`, `hydor open project thesis`, `hydor open guide projects` ou `hydor open 6f1e2a3b` (une session) affichent celle de cette page. `--browser` l’ouvre aussi dans votre navigateur. C’est ainsi que vous accédez à ce que seule une page permet : les éditeurs de diapositives, de feuilles de calcul, d’images et de diagrammes, une signature, les couleurs d’un thème, la connexion à un service.
- `hydor api GET /api/projects` appelle n’importe quel point d’accès de l’API de l’app et affiche son JSON (`hydor api POST /api/projects -d '{"name":"Thesis"}'` ; le corps peut venir de `@fichier` ou de `-`). Les points d’accès sont décrits dans le [sujet API](/guide/api).

### Dans le chat

`/hydor <commande>` exécute n’importe quelle commande ci-dessus sans quitter la conversation : `/hydor sessions`, `/hydor memory search docker`, `/hydor settings get general.resume-after-usage-limits`. Elle figure dans le menu `/` et dans la partie **Aussi** de `/help`. Après `/hydor `, son menu liste les domaines, puis leurs verbes, puis ce que chacun accepte (vos projets, sessions, paramètres, dossiers… comme Tab les complète dans un shell) et ses options quand vous tapez un `-`. Ce que la commande affiche apparaît au-dessus de la ligne de saisie, et un mauvais usage ou une réponse que Hydor refuse s’affiche en rouge ; le chat continue. La commande pose ses questions comme dans un shell, mais dans le chat : une question (une suppression) ouvre un sélecteur dont la première ligne est **Non**, une clé ou un jeton se saisit dans la ligne de saisie, s’affiche sous forme de points et n’est jamais conservé dans votre historique, et un éditeur dont elle a besoin reçoit le terminal, comme avec `!`. Il n’y a pas d’entrée par tube dans le chat : donnez donc un long texte avec `--file <chemin>` (ou omettez-le pour l’écrire dans l’éditeur). Une commande qui a sa propre commande slash (`models` a `/model`, `tiers` a `/tiers`, `usage` a `/usage`) ou qui est destinée à un shell (`run`, `serve`) l’indique, ainsi que celle à utiliser.

## Prendre soin de votre Hydor

- `hydor status` indique si Hydor fonctionne, sa version et son adresse, où se trouvent ses données, s’il tourne comme service, et quelles sessions travaillent ou ont besoin de vous (avec les mêmes marques que `hydor sessions`).
- `hydor serve` exécute Hydor ici, au premier plan, jusqu’à Ctrl+C. `hydor service install` le maintient en marche comme service en arrière-plan, `hydor update` récupère le dernier code, le compile et redémarre, et `hydor set-password`, `hydor setup-token` et `hydor access-token` font ce que leur nom indique. Dans l’app Mac, `hydor update`, `hydor service install` et `hydor serve` indiquent que l’app s’en charge elle-même.
- `hydor open` affiche l’adresse de l’app ; `--browser` l’ouvre.
- `hydor machines phone` indique si Tailscale est installé et connecté ici, ainsi que l’adresse à laquelle l’app est servie sur votre tailnet, avec un QR code à scanner avec l’appareil photo de votre téléphone. `hydor machines phone serve` publie l’app pour vos propres appareils (`--port 8443` lorsqu’autre chose occupe l’adresse habituelle) et `hydor machines phone stop` la retire, comme le fait [Paramètres → App → Utiliser sur votre téléphone](/settings?s=phone).

## Utiliser le Hydor d’un autre ordinateur

Créez un jeton d’accès sur cet ordinateur (dans ses [Paramètres → App → Machines](/settings?s=machines&find=Access%20from%20other%20machines) → **Nouveau jeton**, ou avec `hydor access-token "my laptop"` sur place), puis indiquez-le avec son adresse :

```bash
hydor --server https://hydor.example.com --token acm_… sessions
```

ou définissez une fois pour toutes `HYDOR_URL` et `HYDOR_TOKEN`. Les dossiers sont ceux de cet ordinateur : une session démarre dans son dossier par défaut, sauf si vous donnez `--cwd` avec un dossier qui s’y trouve (une adresse sur cet ordinateur lui-même, comme `http://localhost:8790`, conserve le dossier où vous êtes). Les commandes `!` ne fonctionnent qu’avec le Hydor de cet ordinateur. Sur cet ordinateur, la commande crée son propre jeton la première fois, que [Paramètres → App → Machines](/settings?s=machines&find=Access%20from%20other%20machines) affiche sous le nom « This computer's command line ». Pour que ce Hydor affiche les sessions et les pages d’un autre ordinateur, ajoutez-le comme machine : `hydor machines` liste les machines que ce Hydor utilise et indique si elles répondent, `hydor machines add Lab --url https://lab.example.com` en ajoute une (donnez `--ssh <host>` à la place de `--url` pour l’atteindre par SSH ; son jeton d’accès se saisit sans s’afficher, ou provient de `--file -`), et `hydor machines remove lab` cesse de l’utiliser.

## Couleurs et tubes

Les couleurs sont activées dans un terminal (en vraies couleurs lorsqu’il les gère) et désactivées lorsque la sortie va vers un fichier ou un autre programme, ainsi qu’avec `NO_COLOR` défini ou `--no-color` ; `FORCE_COLOR` les active. Lorsque ce que vous saisissez est transmis par un tube (`echo "…" | hydor`), cela fonctionne comme `hydor run`. Lorsque seule la sortie est transmise par un tube, la conversation s’affiche sans couleurs ni lignes changeantes, et chaque ligne que vous saisissez est envoyée. Les listes comme `hydor sessions` affichent alors les mêmes colonnes, sans couleurs et sans couper ce qui est long, afin que les scripts puissent les lire. Dans un terminal étroit, une liste omet des colonnes entières (d’abord une description, puis d’autres comme une adresse ou une ancienneté) plutôt que de tronquer les noms et les titres. Là où les symboles ne peuvent pas s’afficher (la console Linux, une locale qui n’est pas en UTF-8, et l’ancienne console Windows), la commande dessine avec des caractères simples : `+-|` pour le cadre, `>` pour l’invite, `*`, `+` et `x` pour les marques, et HYDOR pour le logo. `HYDOR_ASCII=1` l’active partout et `HYDOR_ASCII=0` le désactive. Ce qui va vers un fichier ou un autre programme conserve ses symboles, sauf si `HYDOR_ASCII=1` est défini.

## Interroger un agent

- « Comment parler à un agent depuis mon terminal ? »
- « Active la complétion avec Tab pour la commande hydor dans mon shell. »
- « Donne-moi un script qui lance une relecture de mes modifications indexées avec hydor run et fait échouer le commit s’il trouve un bug. »
- « Que signifie le code de sortie 3 de hydor run ? »
- « Le navigateur de l’agent veut cliquer sur Envoyer sur un site : sur quelle touche dois-je appuyer dans le terminal ? »
- « Mon hydor run s’est arrêté parce que le navigateur de l’agent attend une connexion : comment continuer ? »
- « Configure la commande hydor sur mon portable pour qu’elle utilise le Hydor de cet ordinateur. »
- « Quelle commande hydor liste mes tâches planifiées, et comment en désactiver une depuis le terminal ? »
- « Quelle commande hydor enregistre la conversation d’une session dans un fichier Markdown ? »
- « Fais attendre le terminal la fin d’un tour avant d’envoyer mon message. »
- « Désactive les suggestions grises dans le terminal. »
