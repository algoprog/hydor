# Tous les paramètres

Chaque section des paramètres et ce qu’elle contient, dans l’ordre où l’app les affiche, avec un lien vers chacune et vers la partie de ce guide qui l’explique. Servez-vous-en pour trouver où se règle quelque chose ; les sujets expliquent comment s’en servir.

## Comment les paramètres sont organisés

Ouvrez **Paramètres** depuis la barre d’icônes. Sur un ordinateur, les paramètres ont une colonne à gauche, comme celle de la Bibliothèque, avec toutes les sections dans une liste sous trois titres : **App** (l’app elle-même), **Agents** (les agents et ce qu’ils lisent) et **Capacités** (ce que l’app ajoute à chaque agent : la recherche, le navigateur, la mémoire et le reste). Cliquez sur une section et elle occupe la page, sous son titre. **Masquer la barre latérale** (Ctrl+B) masque la colonne, et **Afficher la barre latérale**, au début du titre, la fait revenir. Sur un téléphone, les paramètres affichent toutes les sections dans une liste ; touchez-en une pour l’ouvrir, et la flèche en haut pour revenir.

Inutile de savoir où se trouve une option : tapez ce que vous voulez dans le champ de recherche (Ctrl+K, ⌘K sur un Mac), par exemple « mode sombre » ou « notifications », puis choisissez-la. L’app ouvre la bonne section et vous montre l’option. Vous pouvez aussi demander à n’importe quel agent de modifier un réglage pour vous ([Laissez les agents utiliser l’app à votre place](/guide/ask-agents)).

## App

### Général

[Paramètres → Général](/settings?s=general) : thème, et ce que fait Enter pendant qu’un agent travaille. Pour en savoir plus : [Apparence, langue et mises à jour](/guide/app).

- [**Apparence**](/settings?s=general&find=Appearance) : Sombre, clair, ou selon votre appareil ; ou un thème à vous.
- [**Nouveau thème**](/settings?s=general&find=New%20theme) : Créer votre propre thème à partir de n’importe lequel.
- [**Importer**](/settings?s=general&find=Import) : Ajouter un thème partagé par quelqu’un.
- [**Langue**](/settings?s=general&find=Language) : La langue d’affichage de l’app, et celle dans laquelle les agents écrivent.
- [**Animations**](/settings?s=general&find=Motion) : Quelle part de mouvement dans l’app : complet, calme (rien ne glisse ni ne s’estompe à l’ouverture d’une page ou d’une fenêtre), ou aucun.
- [**Taille du texte**](/settings?s=general&find=Text%20size) : Taille des messages, des pages d’Aide et de la zone de saisie sur cet appareil : par défaut, grande ou plus grande.
- [**Envoi pendant qu’un agent travaille**](/settings?s=general&find=Sending%20while%20an%20agent%20works) : Entrée rejoint le tour en cours, ou attend qu’il se termine.
- [**Suggestions du terminal**](/settings?s=general&find=Terminal%20suggestions) : Suggestions grisées après le curseur dans les terminaux.
- [**Reprendre après les limites d’utilisation**](/settings?s=general&find=Resume%20after%20usage%20limits) : Reprend une session une minute après la réinitialisation de la limite d’un forfait.
- [**Supprimer les sessions inactives**](/settings?s=general&find=Delete%20inactive%20sessions) : Supprime les sessions que personne n’a utilisées depuis un an, ou aussi longtemps que vous le choisissez ; d’ici là, toutes les conversations sont conservées.
- [**Limiter chaque session**](/settings?s=general&find=Limit%20each%20session) : La mémoire et le nombre de processeurs maximum que peuvent utiliser les programmes d’une session.
- [**Démarrer au démarrage de cet ordinateur**](/settings?s=general&find=Start%20when%20this%20computer%20starts) : Lance l’app au démarrage de l’ordinateur.
- [**Garder l’ordinateur éveillé**](/settings?s=general&find=Keep%20the%20computer%20awake) : Dans les apps de bureau, l’ordinateur ne se met pas en veille tout seul pendant que les agents travaillent et avant les tâches planifiées.
- [**Mettre à jour automatiquement**](/settings?s=general&find=Update%20automatically) : Installe les nouvelles versions tout seul : les apps de bureau dès leur sortie, après une minute de préavis ; une copie depuis git quand vous ne l’avez pas utilisée depuis un moment.
- [**Faire la visite**](/settings?s=general&find=Take%20the%20tour) : Découvrir ce que fait chaque partie de l’app.
- [**Astuces**](/settings?s=general&find=Tips) : Signale une partie de l’app la première fois que vous y accédez, après la visite de bienvenue.
- [**Idées pour démarrer**](/settings?s=general&find=Starter%20ideas) : Des exemples, vos apps et une automatisation sous la zone de message vide de la page d’accueil.
- [**Vérifier maintenant**](/settings?s=general&find=Check%20now) : Rechercher une version plus récente maintenant.

### Notifications

[Paramètres → Notifications](/settings?s=notifications) : quand une session se termine, échoue ou attend votre réponse. Pour en savoir plus : [Boîte de réception et notifications](/guide/inbox).

- [**Notifier cet appareil**](/settings?s=notifications&find=Notify%20this%20device) : Une notification quand une session se termine, échoue ou attend votre réponse, même app fermée.
- [**Son**](/settings?s=notifications&find=Sound) : Un court signal sonore à chaque notification tant que l’app est ouverte.
- [**Envoyer un test**](/settings?s=notifications&find=Send%20a%20test) : Envoyer un avis à cet appareil maintenant.

### Utiliser sur votre téléphone

[Paramètres → Utiliser sur votre téléphone](/settings?s=phone) : ouvrez l’app sur votre propre téléphone, de façon privée avec Tailscale, et recevez-y ses notifications. Pour en savoir plus : [Téléphones, autres machines et partage](/guide/devices).

- [**La publier sur mes appareils**](/settings?s=phone&find=Serve%20it%20on%20my%20devices) : Publie l’app en HTTPS uniquement pour les appareils connectés à votre compte Tailscale, jamais sur l’internet public.
- [**Tailscale sur cet ordinateur**](/settings?s=phone&find=Tailscale%20on%20this%20computer) : Si Tailscale est installé et connecté ici, et le nom de cet ordinateur sur votre tailnet.
- [**Ouvrez-la sur votre téléphone**](/settings?s=phone&find=Open%20it%20on%20your%20phone) : Un QR code de l’adresse de l’app pour l’appareil photo de votre téléphone, et les étapes à suivre sur le téléphone.
- [**Arrêter la publication**](/settings?s=phone&find=Stop%20serving) : Retire l’app de votre tailnet, en annulant exactement ce qu’avait fait Servir sur mes appareils.
- [**Ajouter à l’écran d’accueil**](/settings?s=phone&find=Add%20to%20Home%20Screen) : Sur téléphone : Hydor avec sa propre icône, en plein écran ; les notifications sur iPhone en ont besoin.

### Apps de messagerie

[Paramètres → Apps de messagerie](/settings?s=chat) : parlez à vos agents depuis Telegram, Discord ou Slack : démarrez des sessions, envoyez des photos, des fichiers et des messages vocaux, recevez leurs réponses, répondez à leurs questions. Pour en savoir plus : [Téléphones, autres machines et partage](/guide/devices).

- [**Telegram**](/settings?s=chat&find=Telegram) : Un bot Telegram à vous, créé avec @BotFather, avec lequel vos discussions communiquent.
- [**Discord**](/settings?s=chat&find=Discord) : Un bot Discord à vous, créé dans le Developer Portal, avec lequel vos discussions communiquent.
- [**Slack**](/settings?s=chat&find=Slack) : Une app Slack à vous, créée à partir d’un manifeste, avec laquelle vos discussions communiquent.
- [**Lier un chat**](/settings?s=chat&find=Link%20a%20chat) : Permet à une discussion Telegram, Discord ou Slack d’utiliser vos agents, avec un code à usage unique.
- [**Ajouter le bot à un serveur**](/settings?s=chat&find=Add%20the%20bot%20to%20a%20server) : Le lien qui ajoute votre bot Discord à l’un de vos serveurs, avec les autorisations dont il a besoin.
- [**Copier le manifeste**](/settings?s=chat&find=Copy%20manifest) : Le manifeste de l’app Slack, avec Socket Mode et les scopes dont elle a besoin, à coller quand vous créez l’app.
- [**Les nouvelles sessions utilisent**](/settings?s=chat&find=New%20sessions%20use) : L’agent que démarre un message d’une discussion quand celle-ci n’est dans aucune session.
- [**Nouvelles sessions en tant que**](/settings?s=chat&find=New%20sessions%20as) : L’un de vos agents sous lequel démarre une nouvelle session depuis une discussion ; /as dans la discussion en choisit un autre.
- [**Notifications de toutes les sessions**](/settings?s=chat&find=Notices%20from%20every%20session) : Les avis de toutes les sessions dans vos discussions, pas seulement ceux des sessions lancées depuis une discussion.

### Mot de passe

[Paramètres → Mot de passe](/settings?s=security) : le mot de passe de cette app, et la déconnexion. Pour en savoir plus : [Apparence, langue et mises à jour](/guide/app).

- [**Changer le mot de passe**](/settings?s=security&find=Change%20password) : Le changer déconnecte tous les autres navigateurs.
- [**Se déconnecter de ce navigateur**](/settings?s=security&find=Sign%20out%20of%20this%20browser) : Vous aurez besoin du mot de passe pour revenir.

### Signatures

[Paramètres → Signatures](/settings?s=signatures) : votre signature et vos initiales, dessinées une fois et conservées chiffrées, pour les documents que vous signez. Pour en savoir plus : [Pages, documents et images](/guide/library).

- [**Nouvelle signature**](/settings?s=signatures&find=New%20signature) : Dessiner, saisir ou importer votre signature ou vos initiales.

### Gestion de versions

[Paramètres → Gestion de versions](/settings?s=scm) : comptes GitHub et Gitea pour ouvrir des pull requests. Pour en savoir plus : [Téléphones, autres machines et partage](/guide/devices).

- [**Ajouter un compte**](/settings?s=scm&find=Add%20an%20account) : Un compte pour ouvrir des pull requests.

### Connecter d’autres agents

[Paramètres → Connecter d’autres agents](/settings?s=connect) : laissez des agents extérieurs démarrer et piloter des sessions ici, via le serveur MCP de cette app. Pour en savoir plus : [Téléphones, autres machines et partage](/guide/devices).

- [**Nouveau jeton**](/settings?s=connect&find=New%20token) : Un jeton pour qu’un agent situé ailleurs démarre et pilote des sessions ici.
- [**Ce qu’ils peuvent faire**](/settings?s=connect&find=What%20they%20can%20do) : Les outils que reçoit un agent avec un jeton.

### Machines

[Paramètres → Machines](/settings?s=machines) : d’autres machines faisant tourner Hydor, à utiliser d’ici, et l’accès à celle-ci. Pour en savoir plus : [Téléphones, autres machines et partage](/guide/devices).

- [**Ajouter une machine**](/settings?s=machines&find=Add%20a%20machine) : Une autre machine qui exécute Hydor, à utiliser d’ici.
- [**Accès depuis d’autres machines**](/settings?s=machines&find=Access%20from%20other%20machines) : Jetons que d’autres machines utilisent pour accéder à celle-ci.

## Agents

### Comptes

[Paramètres → Comptes](/settings?s=accounts) : les connexions Claude Code, Codex et Grok Build que chaque session utilise. Pour en savoir plus : [Agents, comptes et modèles](/guide/agents-models).

- [**Comptes**](/settings?s=accounts&find=Accounts) : Les connexions Claude Code, Codex et Grok Build qu’utilisent les sessions, et d’autres à ajouter.
- [**Changer de compte à une limite**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) : Une session qui n’a plus d’utilisation disponible continue avec un autre compte.
- [**Utiliser le crédit d’API à une limite**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit) : Quand tous les comptes Claude Code ont atteint leur limite, les sessions continuent, facturées sur une clé d’API Anthropic.
- [**Programmes d’agents**](/settings?s=accounts&find=Agent%20programs) : Quels programmes d’agents, dont Grok Build, sont installés, et installation des autres.
- [**Mettre à jour automatiquement**](/settings?s=accounts&find=Update%20automatically) : Garde Claude Code, Codex et les autres programmes d’agents à leur version la plus récente.

### Plus d’agents

[Paramètres → Plus d’agents](/settings?s=agents) : Gemini CLI, Grok Build, OpenCode, Goose et d’autres agents qui parlent ACP. Pour en savoir plus : [Agents, comptes et modèles](/guide/agents-models).

- [**Vos agents**](/settings?s=agents&find=Your%20agents) : Des agents qui s’affichent à côté de Claude Code et Codex.
- [**Ajouter le vôtre**](/settings?s=agents&find=Add%20your%20own) : N’importe quel agent compatible ACP, par sa commande.
- [**Agents compatibles ACP**](/settings?s=agents&find=Agents%20that%20speak%20ACP) : Gemini CLI, OpenCode, Qwen Code, Goose et Grok Build, prêts à ajouter.

### Modèles

[Paramètres → Modèles](/settings?s=models) : modèles pour Custom, l’agent propre à l’app : vos forfaits Claude et ChatGPT via Claude Code et Codex, modèles sur cet ordinateur, et OpenRouter ou d’autres fournisseurs dans le cloud. Pour en savoir plus : [Agents, comptes et modèles](/guide/agents-models).

- [**Modèle d’appoint**](/settings?s=models&find=Helper%20model) : Le modèle des petites tâches à côté des sessions.
- [**Niveaux**](/settings?s=models&find=Tiers) : Le modèle que désignent Rapide, Standard, Meilleur et Max pour chaque programme : une session mène sur Meilleur ou Max, et ses sous-agents reçoivent Standard et Rapide.
- [**Diriger avec des sous-agents**](/settings?s=models&find=Lead%20with%20subagents) : L’agent principal d’une session planifie, confie les parties claires à des sous-agents de niveaux moins chers et vérifie leur travail.
- [**Max pour les problèmes difficiles**](/settings?s=models&find=Max%20for%20hard%20problems) : Un agent principal en mode Automatique peut passer lui-même à Max quand un problème s’avère plus difficile que ce que Meilleur peut gérer.
- [**Vos abonnements**](/settings?s=models&find=Your%20subscriptions) : Les modèles de vos forfaits Claude et ChatGPT, que Custom peut utiliser via Claude Code et Codex.
- [**Sur cette machine**](/settings?s=models&find=On%20this%20machine) : Modèles installés ici, et leurs téléchargements.
- [**Ajouter un modèle depuis Hugging Face**](/settings?s=models&find=Add%20a%20model%20from%20Hugging%20Face) : Ceux suggérés pour cet ordinateur, ou cherchez, voyez comment chacun s’exécuterait ici, et installez-le.
- [**OpenRouter**](/settings?s=models&find=OpenRouter) : Modèles via OpenRouter, avec votre clé.
- [**Environnements d’exécution et points de terminaison**](/settings?s=models&find=Runtimes%20and%20endpoints) : Ollama, vLLM et autres points d’accès compatibles OpenAI.
- [**Jeton Hugging Face**](/settings?s=models&find=Hugging%20Face%20token) : Uniquement pour les modèles restreints ou privés.

### Consignes des agents

[Paramètres → Consignes des agents](/settings?s=guidelines) : ce que chaque agent suit : dans toutes les sessions, dans un projet, ou dans une seule session. Pour en savoir plus : [Consignes des agents](/guide/guidelines).

- [**Pour toutes les sessions**](/settings?s=guidelines&find=For%20every%20session) : Ce que chaque agent respecte, dans toutes les sessions.
- [**Pour un projet**](/settings?s=guidelines&find=For%20a%20project) : Consignes que suivent les sessions d’un projet.
- [**Pour une session**](/settings?s=guidelines&find=For%20one%20session) : Consignes d’une session, depuis la page d’accueil ou le menu de la session.
- [**Fichiers d’instructions**](/settings?s=guidelines&find=Instruction%20files) : CLAUDE.md et AGENTS.md, que Claude Code et Codex lisent d’eux-mêmes.

### Serveurs MCP

[Paramètres → Serveurs MCP](/settings?s=mcp) : les outils que les agents peuvent appeler. Pour en savoir plus : [Apps connectées, clés et outils](/guide/connections).

- [**Ajouter le serveur**](/settings?s=mcp&find=Add%20server) : Un serveur d’outils pour Claude Code ou Codex.
- [**Vérifier les connexions**](/settings?s=mcp&find=Check%20connections) : Voir si chaque serveur MCP répond.

### Compétences

[Paramètres → Compétences](/settings?s=skills) : des méthodes écrites que les agents chargent quand une tâche l’exige : intégrées, les vôtres, celles des plugins et celles des agents eux-mêmes. Pour en savoir plus : [Compétences](/guide/skills).

- [**Nouvelle compétence**](/settings?s=skills&find=New%20skill) : Rédiger une compétence pour tous les agents, ou pour Claude Code ou Codex seulement.
- [**Intégré**](/settings?s=skills&find=Built%20in) : Les compétences fournies avec l’app.
- [**Les vôtres**](/settings?s=skills&find=Yours) : Compétences que vous avez écrites, ou approuvées quand un agent les a suggérées.
- [**Des plugins**](/settings?s=skills&find=From%20plugins) : Compétences apportées par vos plugins.
- [**Claude Code et Codex**](/settings?s=skills&find=Claude%20Code%20and%20Codex) : Les compétences propres aux agents, que seuls eux reçoivent.
- [**Suggérer les compétences adaptées**](/settings?s=skills&find=Suggest%20skills%20that%20fit) : L’agent d’une nouvelle session sait quelles compétences conviennent à son premier message.
- [**Amener des compétences par mots-clés**](/settings?s=skills&find=Bring%20skills%20in%20by%20keywords) : Des mots-clés dans un message chargent des compétences tout seuls.
- [**Créer ma propre version**](/settings?s=skills&find=Make%20my%20own%20version) : Modifier une compétence intégrée : votre version prend sa place.

### Plugins

[Paramètres → Plugins](/settings?s=plugins) : des extensions qui apportent compétences, outils et instructions à chaque agent. Pour en savoir plus : [Apps connectées, clés et outils](/guide/connections).

- [**Vos plugins**](/settings?s=plugins&find=Your%20plugins) : Les plugins que vous avez ajoutés, activés ou désactivés pour chaque agent.
- [**Fournis avec l’app**](/settings?s=plugins&find=Come%20with%20the%20app) : Plugins fournis avec l’app, prêts à ajouter.
- [**Créer un plugin**](/settings?s=plugins&find=Make%20a%20plugin) : Regrouper vos propres compétences, outils, instructions et fichiers dans un plugin.
- [**Depuis un lien**](/settings?s=plugins&find=From%20a%20link) : Ajouter un plugin depuis GitHub ou une autre adresse Git.
- [**Depuis un fichier .zip**](/settings?s=plugins&find=From%20a%20.zip%20file) : Ajouter un plugin empaqueté dans un .zip.
- [**Empaqueter dans un .zip**](/settings?s=plugins&find=Pack%20into%20a%20.zip) : Un plugin en un seul fichier à partager.
- [**Claude Code**](/settings?s=plugins&find=Claude%20Code) : Les plugins et places de marché propres à Claude Code.
- [**Codex**](/settings?s=plugins&find=Codex) : Les plugins et places de marché propres à Codex.

### Tâches planifiées

[Paramètres → Tâches planifiées](/settings?s=tasks) : du travail d’agent qui démarre tout seul : selon un calendrier, une seule fois, ou quand un webhook est appelé. Pour en savoir plus : [Tâches planifiées](/guide/tasks).

- [**Nouvelle tâche**](/settings?s=tasks&find=New%20task) : Travail d’agent qui démarre tout seul.
- [**Vue de la semaine**](/settings?s=tasks&find=Week%20view) : Tout ce qui s’exécute tout seul, sur une semaine : ce qui s’est exécuté et ce qui s’exécutera ensuite.
- [**Partir d’un exemple**](/settings?s=tasks&find=Start%20from%20an%20example) : Tâches planifiées prêtes à l’emploi.
- [**Brief du matin**](/settings?s=tasks&find=Morning%20brief) : Une tâche planifiée toute prête.
- [**Actualités sur un sujet**](/settings?s=tasks&find=News%20on%20a%20topic) : Une tâche planifiée toute prête.
- [**Suivi de prix**](/settings?s=tasks&find=Price%20watch) : Une tâche planifiée toute prête.
- [**Alerte de changement de page**](/settings?s=tasks&find=Page%20change%20alert) : Une tâche planifiée toute prête.
- [**Rapport hebdomadaire à partir d’un dossier**](/settings?s=tasks&find=Weekly%20report%20from%20a%20folder) : Une tâche planifiée toute prête.
- [**Résumé de la boîte de réception**](/settings?s=tasks&find=Inbox%20digest) : Une tâche planifiée toute prête.
- [**Point d’étape d’habitude**](/settings?s=tasks&find=Habit%20check-in) : Une tâche planifiée toute prête.
- [**Nouvelles versions**](/settings?s=tasks&find=New%20releases) : Une tâche planifiée toute prête.
- [**Vérification de disponibilité du site**](/settings?s=tasks&find=Site%20up%20check) : Une tâche planifiée toute prête.
- [**Alerte d’espace disque**](/settings?s=tasks&find=Disk%20space%20alert) : Une tâche planifiée toute prête.
- [**Examiner les nouvelles pull requests**](/settings?s=tasks&find=Review%20new%20pull%20requests) : Une tâche planifiée toute prête.
- [**Docteur CI**](/settings?s=tasks&find=CI%20doctor) : Une tâche planifiée toute prête.
- [**Tri des tickets**](/settings?s=tasks&find=Issue%20triage) : Une tâche planifiée toute prête.
- [**Jardinier de dépendances**](/settings?s=tasks&find=Dependency%20gardener) : Une tâche planifiée toute prête.
- [**Premier intervenant en cas d’incident**](/settings?s=tasks&find=Incident%20first%20responder) : Une tâche planifiée toute prête.
- [**Nouveaux fichiers dans un dossier**](/settings?s=tasks&find=New%20files%20in%20a%20folder) : Une tâche planifiée toute prête.
- [**Rappel**](/settings?s=tasks&find=Reminder) : Une tâche planifiée toute prête.

## Capacités

### Recherche

[Paramètres → Recherche](/settings?s=search) : comment les agents cherchent sur le web : Naget Search et d’autres fournisseurs. Pour en savoir plus : [Recherche et navigateur](/guide/web).

- [**Fournisseurs**](/settings?s=search&find=Providers) : Quels fournisseurs de recherche les agents utilisent, et dans quel ordre.
- [**Recherche Naget**](/settings?s=search&find=Naget%20Search) : La recherche web propre à l’app.
- [**SearXNG**](/settings?s=search&find=SearXNG) : Un moteur de recherche que vous hébergez vous-même.
- [**Brave Search**](/settings?s=search&find=Brave%20Search) : Recherche web avec une clé Brave.
- [**DuckDuckGo**](/settings?s=search&find=DuckDuckGo) : Recherche web sans clé.
- [**Résultats par recherche**](/settings?s=search&find=Results%20per%20search) : Combien de résultats donne une recherche.

### Navigateur

[Paramètres → Navigateur](/settings?s=browser) : un navigateur web que les agents utilisent, et que vous pouvez suivre et reprendre en main. Pour en savoir plus : [Recherche et navigateur](/guide/web).

- [**Un navigateur pour les agents**](/settings?s=browser&find=A%20browser%20for%20agents) : Les agents ouvrent des sites, cliquent, saisissent du texte et lisent des pages.
- [**Chromium**](/settings?s=browser&find=Chromium) : Quel Chromium utilise le navigateur.
- [**Afficher une fenêtre**](/settings?s=browser&find=Show%20a%20window) : Exécuter le navigateur dans une fenêtre visible.
- [**Tenir les pages à l’écart de cette machine et de son réseau**](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) : Les sites de cet ordinateur et de son réseau restent interdits.
- [**Captures d’écran pour les modèles qui voient les images**](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images) : Les modèles qui voient les images reçoivent des captures d’écran de la page.
- [**Sites**](/settings?s=browser&find=Sites) : Seulement ces sites, ou jamais ceux-là.
- [**Profils**](/settings?s=browser&find=Profiles) : Connexions séparées pour le navigateur.
- [**Demander avant d’envoyer sur les sites connectés**](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites) : Avant qu’un agent n’envoie, ne publie, ne supprime ou ne transfère quoi que ce soit sur un site où il est connecté.
- [**Favoris**](/settings?s=browser&find=Bookmarks) : Les vôtres, avec ceux des autres navigateurs de cet ordinateur.
- [**Extensions**](/settings?s=browser&find=Extensions) : Extensions Chrome, dans l’app de bureau.
- [**Paramètres du navigateur**](/settings?s=browser&find=Browser%20settings) : Home page, search engine, search shortcuts, page zoom, spell checking, translation, dark pages, ad blocker with its filter lists, languages and sites where ads are allowed, history and clearing what it kept.

### Utilisation de l’ordinateur

[Paramètres → Utilisation de l’ordinateur](/settings?s=computer) : les agents voient votre écran et utilisent la souris et le clavier, dans l’app de bureau. Pour en savoir plus : [Recherche et navigateur](/guide/web).

- [**Utilisation de l’ordinateur**](/settings?s=computer&find=Computer%20use) : Les agents voient l’écran et utilisent la souris et le clavier, dans n’importe quelle app (pour les sites web, ils restent dans le navigateur). Chaque session vous demande d’abord.
- [**Accessibilité**](/settings?s=computer&find=Accessibility) : Autorisation de macOS pour que Hydor utilise la souris et le clavier.
- [**Enregistrement de l’écran**](/settings?s=computer&find=Screen%20Recording) : Autorisation de macOS pour que Hydor voie l’écran.

### Mémoire

[Paramètres → Mémoire](/settings?s=memory) : ce dont les agents se souviennent à propos de vous, de vos projets et de chaque session, et quand cela a été écrit. Pour en savoir plus : [Mémoire](/guide/memory).

- [**Mémoire**](/settings?s=memory&find=Memory) : Les agents démarrent avec ce que les sessions précédentes ont retenu, et enregistrent des notes à votre demande.
- [**Mémoire wiki**](/settings?s=memory&find=Wiki%20memory) : Des articles que les agents gardent pour chaque projet, à partir de ses documents et de son travail : activés pour tous les projets, sauf si les paramètres propres à un projet disent le contraire.
- [**Apprendre des nouveaux documents**](/settings?s=memory&find=Learn%20from%20new%20documents) : Les documents nouveaux et modifiés ajoutent des notes à la mémoire et mettent à jour le wiki, avec le modèle d’appoint.
- [**Nombre maximal de documents à lire dans le wiki**](/settings?s=memory&find=Most%20documents%20to%20read%20into%20the%20wiki) : Au-delà de ce nombre de documents, le wiki d’un projet lit les documents épinglés, les plus utilisés et les plus récents : les agents les consultent tous.
- [**Dossier du wiki**](/settings?s=memory&find=Wiki%20folder) : Où est conservé le wiki partagé, ainsi que les wikis de projet sauf réglage ci-dessous.
- [**Wikis de projet**](/settings?s=memory&find=Project%20wikis) : Où est conservé le wiki de chaque projet : dans le dossier wiki ou dans le dossier de chaque projet.
- [**Dossier à l’intérieur de chaque projet**](/settings?s=memory&find=Folder%20inside%20each%20project) : Où, dans son dossier, chaque projet conserve son wiki.
- [**Exclure de Git**](/settings?s=memory&find=Leave%20it%20out%20of%20Git) : Ajoute le dossier wiki du projet à son .gitignore, dans les dépôts Git uniquement.
- [**Recherche par le sens**](/settings?s=memory&find=Search%20by%20meaning) : Trouve les notes, et tout ce qui figure dans cette recherche, par le sens.
- [**Notes avec lesquelles chaque agent démarre**](/settings?s=memory&find=Notes%20each%20agent%20starts%20with) : En plus de votre profil : au plus ce nombre de notes en rapport avec votre demande, et les titres des autres.
- [**Ranger automatiquement**](/settings?s=memory&find=Tidy%20up%20automatically) : Environ une fois par jour, après une nouveauté : fusionne les notes qui disent la même chose, résume celles qui sont liées et leur donne un titre.
- [**Apprendre des conversations**](/settings?s=memory&find=Learn%20from%20conversations) : Avec le rangement : corrige les notes que les conversations montrent erronées, vérifie celles qui ne le sont pas, garde quelques nouveautés.
- [**Ranger maintenant**](/settings?s=memory&find=Tidy%20up%20now) : Range la mémoire tout de suite.
- [**Votre profil**](/settings?s=memory&find=Your%20profile) : Ce que chaque agent sait de vous au début d’une session ; les agents le tiennent à jour.
- [**Longueur du profil**](/settings?s=memory&find=Profile%20length) : Le nombre maximal de mots de votre profil ; au-delà, le modèle d’appoint le raccourcit.
- [**Notes**](/settings?s=memory&find=Notes) : Toutes les notes conservées, par emplacement.
- [**Ajouter une note**](/settings?s=memory&find=Add%20a%20note) : Rédiger une note que les agents retiendront, sur vous ou sur un projet.
- [**Notes supprimées**](/settings?s=memory&find=Deleted%20notes) : Notes supprimées au cours des 30 derniers jours, à restaurer.
- [**Importer…**](/settings?s=memory&find=Bring%20in%E2%80%A6) : Notes issues de ce que d’autres assistants savent de vous, et les compétences que vous y avez créées : Claude Code, Codex, d’autres agents, ou un export ChatGPT ou Claude.
- [**Exporter**](/settings?s=memory&find=Export) : Toutes les notes en Markdown pour lire, ou en JSON avec leurs historiques.
- [**Tout effacer…**](/settings?s=memory&find=Clear%20all%E2%80%A6) : Supprime chaque note et son historique.

### Sous-agents

[Paramètres → Sous-agents](/settings?s=children) : des agents qui confient des parties d’un travail à des sous-agents, et des essaims pour les problèmes difficiles. Pour en savoir plus : [Recherche approfondie, seconds avis et plusieurs agents](/guide/research).

- [**En cours en même temps, par session**](/settings?s=children&find=Working%20at%20once%2C%20per%20session) : Combien de sous-agents Hydor une session exécute en même temps.
- [**Taille de l’essaim**](/settings?s=children&find=Swarm%20size) : Combien d’agents d’un essaim ou d’une campagne travaillent en même temps.

### Objectifs

[Paramètres → Objectifs](/settings?s=goals) : point de départ d’un nouvel objectif : ses tours, la fréquence de ses questions et le moment où il poursuit avec son propre choix. Pour en savoir plus : [Sessions](/guide/sessions).

- [**Tours qu’un objectif peut exécuter**](/settings?s=goals&find=Rounds%20a%20goal%20may%20run) : Nombre de tours accordés à un nouvel objectif avant qu’il s’arrête à sa limite, sauf si l’agent en propose moins ou si vous le modifiez en l’approuvant.
- [**Fréquence des questions posées par un objectif**](/settings?s=goals&find=How%20much%20a%20goal%20asks%20you) : Indique si un nouvel objectif travaille seul, vous demande votre avis aux tournants ou à chaque tour.
- [**Poursuit avec son propre choix après**](/settings?s=goals&find=Goes%20on%20with%20its%20own%20pick%20after) : Durée pendant laquelle un nouvel objectif attend votre réponse à une question avant de poursuivre avec son propre choix ; 0 pour vous attendre.

### Images, vidéo et audio

[Paramètres → Images, vidéo et audio](/settings?s=images) : images, vidéos, musiques et voix que les agents créent pour vous via OpenRouter, et qui rédige leurs légendes. Pour en savoir plus : [Documents, images, vidéos et voix](/guide/documents-voice).

- [**Création d’images**](/settings?s=images&find=Making%20images) : Laisser les agents créer des images.
- [**Pour la plupart des images (Meilleur)**](/settings?s=images&find=For%20most%20pictures%20%28Best%29) : Le modèle qui crée la plupart des images, et chaque modification d’une image.
- [**Pour les images simples (Rapide)**](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29) : Un modèle plus économique et plus rapide pour les icônes, arrière-plans, textures et images simples.
- [**Outils d’image sur cet ordinateur**](/settings?s=images&find=Picture%20tools%20on%20this%20computer) : Retirez l’arrière-plan d’une image, effacez-en une partie ou agrandissez-la, ici : gratuit, et vos images restent sur cet ordinateur.
- [**Création de vidéos**](/settings?s=images&find=Making%20videos) : Laisser les agents créer des vidéos.
- [**Modèle vidéo**](/settings?s=images&find=Video%20model) : Le modèle qui crée les vidéos.
- [**Utiliser la carte graphique pour les vidéos**](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos) : Réaliser les vidéos montées sur la carte graphique quand il y en a une : plus rapide, processeur libre.
- [**Création d’audio**](/settings?s=images&find=Making%20audio) : Laisser les agents créer de l’audio.
- [**Modèle de musique**](/settings?s=images&find=Music%20model) : Le modèle qui crée la musique.
- [**Modèle de voix et de son**](/settings?s=images&find=Voice%20and%20sound%20model) : Le modèle qui crée les voix et les sons.
- [**Légendes pour ce que vous gardez**](/settings?s=images&find=Captions%20for%20what%20you%20keep) : Le modèle qui écrit les titres et les descriptions des images, vidéos et audios que vous conservez.

### Voix

[Paramètres → Voix](/settings?s=voice) : dictez vos messages et faites lire les réponses à voix haute. Pour en savoir plus : [Documents, images, vidéos et voix](/guide/documents-voice).

- [**Dictée**](/settings?s=voice&find=Dictation) : Dicter un message au lieu de le taper.
- [**Langue que vous parlez**](/settings?s=voice&find=Language%20you%20speak) : La langue que la dictée écoute.
- [**Reconnaissance vocale sur le serveur**](/settings?s=voice&find=Speech%20recognition%20on%20the%20server) : Reconnaître la voix sur cet ordinateur ou avec un service.
- [**Lire à voix haute**](/settings?s=voice&find=Read%20aloud) : Faire lire les réponses à voix haute.

### Suggestions de mots

[Paramètres → Suggestions de mots](/settings?s=suggest) : la fin du mot que vous tapez en gris, et le mot suivant, grâce à un petit modèle qui apprend de votre écriture. Pour en savoir plus : [Documents, images, vidéos et voix](/guide/documents-voice).

- [**Suggestions de mots**](/settings?s=suggest&find=Word%20suggestions) : La fin du mot que vous tapez et le suivant, en gris après le curseur, grâce à des modèles qui s’exécutent sur cet ordinateur ; la première fois, il télécharge environ 1,3 Go.
- [**Afficher dans ce navigateur**](/settings?s=suggest&find=Show%20in%20this%20browser) : Indique si ce navigateur affiche les suggestions de mots (chaque navigateur garde les siennes).
- [**Modèle de langage**](/settings?s=suggest&find=Language%20model) : Qwen3.5 en plus du petit modèle : automatiquement quand l’ordinateur a assez de mémoire, toujours, ou jamais.
- [**Taille du modèle de langage**](/settings?s=suggest&find=Language%20model%20size) : Le modèle de langage en 8 bits (meilleur) ou en 4 bits (plus petit, un peu moins bon).
- [**Certitude avant d’afficher**](/settings?s=suggest&find=How%20sure%20before%20showing) : Niveau de certitude requis pour afficher une suggestion : plus de suggestions, ou moins mais plus souvent justes.
- [**Afficher le mot suivant**](/settings?s=suggest&find=Show%20the%20next%20word) : Affiche aussi le mot suivant, en plus pâle.
- [**Réinitialiser les chiffres**](/settings?s=suggest&find=Reset%20the%20numbers) : Recommence à compter de zéro les frappes économisées et les suggestions qui étaient justes.
- [**Dans les zones de message**](/settings?s=suggest&find=In%20message%20boxes) : Suggestions dans la zone où vous écrivez un message à un agent.
- [**Dans les documents**](/settings?s=suggest&find=In%20documents) : Suggestions pendant que vous écrivez dans un document.
- [**Dans les notes**](/settings?s=suggest&find=In%20notes) : Suggestions dans les notes.
- [**Dans les autres zones de texte**](/settings?s=suggest&find=In%20other%20text%20boxes) : Suggestions aux autres endroits où vous écrivez : suivis, file d’attente, un message précédent, panneaux Demander.
- [**Mots de ce que vous avez saisi**](/settings?s=suggest&find=Words%20of%20what%20you%20typed) : Combien des mots que vous avez saisis avant le curseur il lit.
- [**Mots de la réponse ou du document**](/settings?s=suggest&find=Words%20of%20the%20reply%20or%20document) : Combien de mots de la dernière réponse de l’agent, ou du document avant le paragraphe, il lit.
- [**Choisir selon la langue**](/settings?s=suggest&find=Choose%20by%20language) : Choisit le modèle le plus performant pour la langue de ce que vous écrivez.
- [**Apprendre de la conversation**](/settings?s=suggest&find=Learn%20from%20the%20conversation) : Utilise les mots employés plus tôt dans la conversation pendant que vous écrivez un message.
- [**Threads**](/settings?s=suggest&find=Threads) : Threads de processeur pour les suggestions (automatique par défaut).
- [**Apprendre de ce que j’écris**](/settings?s=suggest&find=Learn%20from%20what%20I%20write) : Le petit modèle apprend de ce que vous écrivez, sur cet ordinateur, en arrière-plan.
- [**Quand il apprend**](/settings?s=suggest&find=When%20it%20learns) : Chaque nuit, chaque semaine, ou seulement quand vous appuyez sur « Réentraîner maintenant » ; il attend que vous n’ayez rien tapé depuis dix minutes.
- [**De mes messages**](/settings?s=suggest&find=From%20my%20messages) : Apprendre à partir des messages que vous avez écrits aux agents.
- [**Des réponses des agents**](/settings?s=suggest&find=From%20agents'%20replies) : Apprendre à partir de ce que les agents vous ont répondu.
- [**De mes notes**](/settings?s=suggest&find=From%20my%20notes) : Apprendre à partir des notes de mémoire que vous avez écrites.
- [**De mes documents**](/settings?s=suggest&find=From%20my%20documents) : Apprendre à partir des documents et des pages que vous avez écrits.
- [**Poids de mes propres mots**](/settings?s=suggest&find=Weight%20of%20my%20own%20words) : Combien les mots que vous avez saisis comptent de plus que le reste de ce qu’il apprend.
- [**Threads pour l’apprentissage**](/settings?s=suggest&find=Threads%20for%20learning) : Threads de processeur pour l’apprentissage (automatique par défaut).
- [**Réentraîner maintenant**](/settings?s=suggest&find=Retrain%20now) : Apprend maintenant, en arrière-plan, de ce que vous avez écrit depuis la dernière fois.
- [**Oublier ce qu’il a appris**](/settings?s=suggest&find=Forget%20what%20it%20learned) : Supprime le modèle qui a appris de vous ; celui fourni avec l’app est de nouveau utilisé.

### Vos agents

[Paramètres → Vos agents](/settings?s=assistants) : où vont les dossiers de tâche, et le nettoyage après une tâche ; vos agents eux-mêmes sont sur la page Agents. Pour en savoir plus : [Agents](/guide/agents).

- [**Vos agents**](/settings?s=assistants&find=Your%20agents) : Vos agents se trouvent sur la page Agents.
- [**Nettoyer après une tâche**](/settings?s=assistants&find=Clean%20up%20after%20a%20task) : Les agents suppriment ce qu’ils ont créé en cours de route et dont ils n’ont plus besoin.
- [**Dossiers de tâche**](/settings?s=assistants&find=Task%20folders) : Où vont les nouveaux dossiers de tâches, pour les sessions démarrées sans dossier.

### Apps

[Paramètres → Apps](/settings?s=apps) : ce que les apps savent de vous, et lesquelles s’exécutent sans rien demander. Pour en savoir plus : [Apps](/guide/apps).

- [**À propos de vous**](/settings?s=apps&find=About%20you) : Ce à partir de quoi les apps commencent leurs questions, pour ne pas les poser à chaque fois.
- [**Exécuter sans demander**](/settings?s=apps&find=Run%20without%20asking) : Les apps que les agents exécutent pour vous sans demander d’abord ; retirez-en une pour qu’on vous redemande.

### Custom

[Paramètres → Custom](/settings?s=custom) : mode automatique et bac à sable pour les commandes. Pour en savoir plus : [Custom, l’agent propre à l’app](/guide/custom).

- [**Mode automatique**](/settings?s=custom&find=Auto%20mode) : Custom approuve lui-même les étapes sûres.
- [**Bac à sable pour les commandes**](/settings?s=custom&find=Sandbox%20for%20commands) : Les commandes du mode Auto s’exécutent dans un bac à sable ; l’Accès complet s’exécute sans.

## Demander à un agent

- « Où changer ce que fait Entrée pendant qu’un agent travaille ? »
- « Active le son des notifications. »
- « Montre-moi mes réglages de recherche. »
- « Choisis le modèle d’appoint le moins cher. »
- « Désactive la mémoire pour les nouvelles sessions. »
