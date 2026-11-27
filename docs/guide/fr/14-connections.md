# Apps connectées, clés et outils

Connectez une fois les services que vous utilisez (votre messagerie, Notion, GitHub, Stripe, un dossier de cet ordinateur…) dans **Apps connectées** de la page Apps, et chaque agent et chaque app pourra travailler avec eux. Conservez vos clés d’API et vos connexions dans un coffre chiffré que les agents utilisent sans jamais les voir, ajoutez des serveurs d’outils à Claude Code et à Codex, et des plugins à Claude Code. Utilisez cette page lorsque vous voulez que les agents agissent dans vos propres comptes, appellent un service avec votre clé, ou disposent d’outils qu’ils n’ont pas d’origine.

![Apps → Apps connectées : les services que vous avez connectés, le marketplace et vos clés](images/connections.webp)

## Ce que sont les connexions, les clés et les outils

Les agents peuvent faire davantage quand vous leur donnez des outils. Il y a trois endroits pour cela :

- **Apps connectées** ([Apps → Apps connectées](/apps/connected)) : des services issus d’un marketplace, connectés une seule fois pour tous les agents : Claude Code, Codex, Custom et les agents qui parlent ACP, ainsi que les apps qu’ils exécutent. Chaque compte connecté donne ses outils aux agents.
- **Le coffre** (l’onglet **Clés** de la même page) : clés d’API, jetons et mots de passe de connexion. Une clé d’API est un mot de passe que fournit un service pour que des programmes puissent utiliser votre compte. Les agents s’en servent pour appeler un service, se connecter à un site ou exécuter un programme, mais ne les voient jamais.
- **Serveurs MCP et plugins** ([Paramètres → Serveurs MCP](/settings?s=mcp) et [Paramètres → Plugins](/settings?s=plugins)) : des serveurs d’outils que vous configurez vous-même, pour Claude Code, Codex ou Custom, et des plugins qui apportent des compétences et des outils à tous les agents (voir [Plugins](/guide/plugins)).

MCP (Model Context Protocol) est la manière commune dont un service propose des outils aux agents. Un compte connecté est un serveur MCP que Hydor configure et auquel il se connecte pour chaque agent. Les serveurs MCP de Paramètres → Agents sont ceux que vous configurez à la main, avec une commande ou une adresse.

## Ouvrir Apps connectées

Ouvrez **Apps** depuis la barre d’icônes et choisissez **Apps connectées** dans sa colonne (sur un téléphone, son onglet **Apps connectées**), ou allez dans [Apps → Apps connectées](/apps/connected). (Elles se trouvaient auparavant dans les Paramètres, sous le nom de Connexions : un ancien lien vers elles mène ici.) Sous une ligne qui explique à quoi elles servent, avec **Connecter un service**, la page comporte trois onglets :

- **Connecté** : les comptes que vous avez connectés, et leur état. Le nombre sur l’onglet les compte ; **Apps connectées** dans la colonne (ou son onglet sur un téléphone) les compte aussi.
- **Marketplace** : tous les services que vous pouvez connecter.
- **Clés** : le coffre. Le nombre sur l’onglet compte vos clés.

La page s’ouvre sur **Connecté** quand vous avez déjà connecté quelque chose, et sur **Marketplace** dans le cas contraire ; chaque onglet a sa propre adresse (`/apps/connected?tab=market`, `?tab=keys`). Sur un téléphone, les onglets défilent latéralement, et les boîtes de dialogue montent depuis le bas de l’écran.

## Trouver un service dans le marketplace

Ouvrez [l’onglet Marketplace](/apps/connected?tab=market).

- La zone de recherche (« Rechercher … des services : e-mail, Notion, factures… ») cherche dans les noms, les descriptions, les mots-clés et les catégories. Chaque mot saisi doit correspondre.
- Les catégories, chacune avec son nombre de services, s’affichent une à la fois : **Tous les services** (**Tout** sous forme de pastille), **Notes et documents**, **Tâches et projets**, **E-mails, discussions et réunions**, **Agenda et planification**, **Fichiers et stockage**, **Design et médias**, **Outils de développement**, **Cloud et hébergement**, **Bases de données et données**, **Analyses et suivi**, **Ventes, marketing et assistance**, **Paiements et finance**, **Sites web et boutiques**, **Recherche et web**, **IA et automatisation**, **Voyages et vie quotidienne** et **Sur cet ordinateur**. Sur un ordinateur, elles forment une liste à côté des services ; sur un écran plus étroit, des pastilles sous la zone de recherche qui défilent latéralement.
- **À la une** : une rangée de cartes plus grandes pour des services connus (Notion, Linear, GitHub, Figma, Stripe, Zapier…). Elle s’affiche tant que vous n’avez rien recherché ni choisi de catégorie ; sur un ordinateur, ses flèches la font défiler. Les services suivent sous **Tous les services** (ou sous la catégorie choisie, ou **Trouvé** quand vous faites une recherche), avec leur nombre. Sur un téléphone, ce sont les lignes d’une seule liste.

Chaque carte indique le nom du service, ce qu’un agent peut en faire et la manière dont il se connecte :

- **Connexion par le navigateur** : vous vous connectez à votre compte dans le navigateur.
- **Clé d’API** : vous collez une clé que le service vous donne.
- **Sans connexion** : il n’y a rien à saisir.
- **S’exécute sur cet ordinateur** : un programme que Hydor lance ici quand un agent en a besoin.
- **S’exécute ici, avec une clé** : la même chose, avec une clé que vous lui fournissez.
- **Adresse et mot de passe d’app** : votre adresse e-mail et un mot de passe créé pour les programmes de messagerie (E-mail).

Une coche à côté du nom signifie que quelqu’un a vérifié que le serveur du service répond comme l’indique sa fiche. **non vérifié** signifie que personne ne l’a encore fait. Les services que vous avez connectés affichent **Connecté** (ou **Se reconnecter**) là où les autres affichent **Connecter**.

Quelques exemples de ce que vous y trouverez :

- **Notes, tâches et projets** : Notion, Craft, Linear, Asana, Atlassian (Jira et Confluence), ClickUp, monday.com, Todoist.
- **E-mails, discussions et agendas** : E-mail (tout compte de messagerie, avec un mot de passe d’app), Gmail, Slack, Fireflies, Granola, Google Calendar, Calendly.
- **Fichiers et design** : Google Drive, Dropbox, Box, Figma, Canva, Miro, Gamma, Cloudinary.
- **Outils de développement et hébergement** : GitHub, GitLab, Sentry, CircleCI, Postman, Cloudflare, Vercel, Netlify, Railway, Context7, DeepWiki.
- **Données et analyses** : Airtable, Supabase, Neon, PostgreSQL, MongoDB, SQLite, PostHog, Mixpanel, Amplitude, Datadog.
- **Entreprise** : Stripe, PayPal, Plaid, Square, HubSpot, Intercom, Attio, Klaviyo, Webflow, Wix, WordPress.com.
- **Recherche et web** : Exa, Perplexity, Tavily, Brave Search, Firecrawl, Wolfram, un navigateur Playwright.
- **IA et vie quotidienne** : Hugging Face, Zapier, AllTrails, Kiwi.com, trivago, Strava.
- **Sur cet ordinateur** : Fichiers sur cet ordinateur (les dossiers que vous choisissez), Git, Time et un graphe de mémoire.

Quand aucun service ne correspond, la page affiche **Aucun service ne correspond**. Vous pouvez ajouter le service vous-même : voir [Ajouter un service au marketplace](/guide/connections#add-a-service-to-the-marketplace). De nouveaux services arrivent avec les mises à jour de l’app.

## Connecter un service

1. Cliquez sur la carte du service. Une boîte de dialogue indique ce qu’il fait, sa catégorie, la manière dont il se connecte, et **Vérifié** avec une date (ou **Adresse pas encore vérifiée**). **Site web** et **Documentation** renvoient vers le service. Un encadré indique où il s’exécute : l’adresse du serveur, ou la commande exécutée ici. Il précise aussi que chaque agent reçoit les outils du service sous son nom court (ceux de Notion sous « notion »), et que vous pouvez le désactiver session par session.
2. Lisez la note de l’encadré jaune, s’il y en a une. Elle indique ce qu’il faut savoir d’abord, comme « Nécessite uv (uvx) sur cet ordinateur. » ou qu’un service a besoin de votre propre client de connexion.
3. Remplissez ce que la boîte de dialogue demande, puis cliquez sur **Connecter**, ou sur **Se connecter à** suivi du nom du service.

Une fois la connexion établie, le service passe dans l’onglet **Connecté** et est testé en arrière-plan. Ce que demande la boîte de dialogue dépend du service.

### Services sans rien à saisir

Cliquez sur **Connecter**. Certains demandent d’abord un réglage. GitLab demande son adresse (gitlab.com, sauf si vous hébergez le vôtre). Fichiers sur cet ordinateur demande les dossiers qu’il peut utiliser, sous forme de chemins complets, un par ligne ; il ne peut lire et modifier des fichiers qu’à l’intérieur de ceux-ci. SQLite demande le fichier de base de données. Les champs marqués **facultatif** peuvent rester vides. **En obtenir une** à côté d’un champ renvoie vers l’endroit où vous obtenez cette valeur.

### Services qui demandent une clé

Un service en ligne comporte un champ **Clé**, avec **Obtenir une clé** qui renvoie vers la page où il en crée une. Un service qui s’exécute ici demande sa clé dans un ou plusieurs champs qui lui sont propres (un jeton, une chaîne de connexion). Collez la clé et cliquez sur **Connecter**.

La clé est placée dans le coffre, chiffrée. Ensuite, vous n’en voyez plus que les derniers caractères. GitHub, par exemple, utilise un jeton d’accès personnel à granularité fine : une clé que vous pouvez limiter aux dépôts et aux autorisations que vous voulez donner aux agents.

### Services auxquels vous vous connectez dans le navigateur

1. Cliquez sur **Se connecter à** suivi du nom du service.
2. Sur un ordinateur, une petite fenêtre s’ouvre. Sur un téléphone, c’est la page de connexion du service qui s’ouvre dans le même onglet.
3. Connectez-vous et autorisez l’accès. Pendant ce temps, la boîte de dialogue affiche « En attente de la fin de votre connexion… ».
4. Une fois terminé, une notification indique que le compte est connecté. Sur un téléphone, vous revenez à Apps → Apps connectées.

Les jetons restent chiffrés sur cet ordinateur et se renouvellent d’eux-mêmes ; les agents ne les voient jamais. Une connexion doit être terminée en 15 minutes ; passé ce délai, recommencez. Si vous refusez l’accès, le message « Vous n’avez pas autorisé l’accès » s’affiche.

Certains services ne permettent la connexion que par un client de connexion (une app OAuth) qui vous appartient : Asana, Box, HubSpot, Slack et les apps de Google, par exemple. Leur boîte de dialogue ouvre **Votre propre ID client (ce service en exige un)**, avec la marche à suivre. D’autres connexions par le navigateur proposent la même chose sous le nom **Utiliser votre propre ID client (facultatif)**, qui s’ouvre aussi tout seul quand un service se révèle ne pas permettre aux apps de s’enregistrer d’elles-mêmes.

1. Créez le client dans les paramètres développeur du service.
2. Donnez-lui l’adresse indiquée sous **Adresse de rappel à lui donner** (elle a un bouton de copie).
3. Collez son **ID client**, et son **Secret client** s’il en a un.
4. Cliquez sur **Se connecter à** suivi du nom du service.

### Services qui s’exécutent sur cet ordinateur

Ils lancent un programme ici (avec npx ou uvx) pour l’agent de chaque session. Le premier test peut prendre un moment si le programme doit d’abord être téléchargé. Une clé dont un tel service a besoin est placée dans son environnement depuis le coffre au démarrage. Elle n’apparaît jamais sur une ligne de commande, où d’autres programmes pourraient la lire.

## Connecter votre messagerie

Les agents peuvent lire, rechercher, trier, rédiger des brouillons et envoyer vos e-mails dès que vous connectez votre compte de messagerie avec son adresse et un mot de passe d’app. Cela fonctionne avec Gmail, iCloud Mail, Fastmail, Yahoo, AOL, GMX, WEB.DE, Zoho, Posteo, mailbox.org, Proton Mail (via Proton Mail Bridge) et la plupart des messageries professionnelles et scolaires.

1. Ouvrez [l’onglet Marketplace](/apps/connected?tab=market) et cliquez sur **E-mail** (sous **E-mails, discussions et réunions**, ou recherchez « e-mail »).
2. Saisissez votre **Adresse e-mail**. Hydor trouve seul vos serveurs de messagerie. Pour un fournisseur qu’il connaît, il explique comment y créer un mot de passe d’app, et **Comment en créer un** ouvre la page d’aide du fournisseur.
3. Créez un mot de passe d’app (voir ci-dessous) et collez-le dans **Mot de passe d’app**.
4. Si vous le souhaitez, saisissez **Votre nom**, tel que les gens le voient sur les e-mails que vous envoyez.
5. Cliquez sur **Connecter**. Hydor se connecte pour lire et pour envoyer avant d’enregistrer quoi que ce soit. En cas d’échec, il en donne la raison : mot de passe ou nom d’utilisateur incorrect, fournisseur qui exige un mot de passe d’app plutôt que votre mot de passe habituel, ou serveur qui n’a pas répondu.

Le mot de passe d’app est conservé chiffré dans le coffre de cet ordinateur ; les agents ne le voient jamais. Pour connecter un autre compte, rouvrez **E-mail** et cliquez sur **Ajouter un autre compte**.

### Créer un mot de passe d’app

Un mot de passe d’app est un mot de passe distinct pour les programmes de messagerie, créé dans les paramètres de sécurité de votre compte, et utilisé à la place du mot de passe avec lequel vous vous connectez sur le web. La plupart des fournisseurs demandent d’activer d’abord la validation en deux étapes.

- **Gmail** : activez la validation en deux étapes dans votre compte Google, puis ouvrez **Sécurité → Mots de passe d’application**. Les comptes professionnels et scolaires ont besoin que leur administrateur l’autorise.
- **iCloud Mail** : sur account.apple.com, ouvrez **Connexion et sécurité → Mots de passe spécifiques à l’app**.
- **Fastmail** : **Paramètres → Confidentialité et sécurité → Gérer les mots de passe d’app**.
- **Yahoo** et **AOL** : **Sécurité du compte → Générer un mot de passe d’app**.
- **GMX**, **WEB.DE** et **Zoho** : activez d’abord IMAP dans les paramètres de la boîte aux lettres.
- **Proton Mail** : installez Proton Mail Bridge et connectez-vous-y sur cet ordinateur, puis utilisez le mot de passe que Bridge affiche pour votre adresse.

### Quand vos serveurs sont introuvables

Pour un fournisseur que Hydor ne connaît pas, il lit les réglages que votre fournisseur publie pour les programmes de messagerie. Pour les trouver, il interroge l’annuaire public de fournisseurs de messagerie de Mozilla à propos de votre domaine (jamais de votre adresse complète). S’il n’y en a aucun, il essaie imap. et smtp. devant votre domaine et laisse la connexion les vérifier.

Si cela échoue, ouvrez **Serveurs et nom d’utilisateur** et saisissez les serveurs entrant (IMAP) et sortant (SMTP), leurs ports et leur sécurité (**SSL/TLS** ou **STARTTLS**), tels que les donnent les pages d’aide de votre fournisseur, ainsi que le nom d’utilisateur s’il ne s’agit pas de votre adresse complète. Une connexion sans chiffrement n’est autorisée que vers cet ordinateur (un pont tel que Proton Mail Bridge).

### Outlook.com et Microsoft 365

Les comptes Outlook.com, Hotmail et Live, ainsi que les comptes professionnels ou scolaires sur Microsoft 365, ne peuvent pas encore se connecter de cette façon. Microsoft a désactivé les mots de passe d’app pour eux : ils nécessitent donc une connexion Microsoft, que Hydor ne propose pas encore. La boîte de dialogue E-mail le signale quand vous saisissez une telle adresse.

### Vos comptes de messagerie

Dans l’onglet **Connecté**, la ligne d’E-mail liste vos comptes par adresse. **Tester** se connecte à chacun. **Comptes** ouvre la boîte de dialogue, où chaque compte a **Tester**, **Variation** (un nouveau mot de passe d’app, un nouveau nom ou d’autres serveurs) et **Retirer** : son mot de passe d’app est supprimé ici, et rien ne change dans la boîte aux lettres. Retirer le dernier compte déconnecte E-mail ; **Déconnecter** les retire tous.

### Ce que les agents peuvent faire avec vos e-mails

Les agents reçoivent ces outils sous « email ». Chacun prend l’adresse du compte quand vous en avez plusieurs ; sans elle, ils utilisent le premier.

- **list_folders**, **search_email** (par expéditeur, destinataire, objet, mots, dates, non lus, marqués d’un indicateur ou avec pièces jointes, du plus récent au plus ancien) et **read_email** (qui l’a envoyé et à qui, son texte, ainsi que les noms et tailles de ses pièces jointes). La lecture ne marque pas un e-mail comme lu.
- **save_attachments** enregistre les pièces jointes d’un e-mail dans le dossier de la session.
- **mark_email** marque des e-mails comme lus ou non lus, avec ou sans indicateur. **move_email** les déplace vers un autre dossier, jamais vers la corbeille.
- **save_draft** place un e-mail dans votre dossier Brouillons pour que vous l’envoyiez vous-même. Rien n’est envoyé.
- **send_email** envoie un e-mail immédiatement, comme nouvel e-mail ou comme réponse dans son fil, avec des fichiers du dossier de la session en pièces jointes, et en garde une copie dans les Envoyés.
- **delete_email** déplace des e-mails vers la corbeille, ou les supprime définitivement.

Pour empêcher les agents d’envoyer ou de supprimer, désactivez **send_email** et **delete_email** sous **Outils** (voir [Désactiver un compte ou certains de ses outils](/guide/connections#turn-an-account-or-some-of-its-tools-off)). Ce que dit un e-mail parvient aux agents comme une donnée extérieure, qu’on leur dit de ne jamais suivre comme des instructions. Une tâche planifiée peut démarrer pour chaque nouvel e-mail : voir [Surveiller un changement](/guide/tasks#watch-for-a-change).

## Vérifier qu’un compte connecté fonctionne

Dans l’onglet **Connecté**, chaque compte indique son état :

- **En cours**, la date de la dernière vérification, le nombre de ses outils activés (« 12 outils sur 14 activés ») et combien d’entre eux demandent d’abord votre accord (« 3 demandent d’abord »).
- **Pas encore testé**.
- **Nécessite une nouvelle connexion** : sa connexion a pris fin et n’a pas pu être renouvelée.
- **Ne fonctionne pas**, avec la raison.

**Tester** se connecte au service comme le feront les agents et en liste les outils. Un message indique que le compte fonctionne et combien d’outils il compte, ou ce qui s’est mal passé : « La clé a été refusée » ou « La connexion a été refusée : reconnectez-vous » (le compte affiche alors **Nécessite une nouvelle connexion**). Les comptes sont testés automatiquement juste après leur connexion.

## Désactiver un compte ou certains de ses outils

- **Toutes les sessions** (sur téléphone, uniquement l’interrupteur) : lorsqu’il est activé, l’agent de chaque session reçoit le compte, sauf si une session le désactive. Lorsqu’il est désactivé, aucune session ne le reçoit, sauf si cette session l’active. Un compte nouvellement connecté démarre activé.
- **Outils** : une fois qu’un test a listé les outils d’un compte, ce bouton les ouvre, chacun avec sa fonction et trois choix : **Activé** (les agents l’utilisent librement), **Demander d’abord** (chaque appel attend dans votre Boîte d’envoi que vous l’envoyiez : voir ci-dessous) et **Désactivé** (les agents ne le reçoivent pas). Les outils qui envoient, publient, répondent, invitent, partagent, suppriment, retirent, paient, transfèrent ou remboursent sont marqués **agit à l’extérieur**. Un agent qui essaie un outil que vous avez désactivé est informé qu’il est désactivé.

## Demander d’abord : des appels qui attendent votre accord

Un outil réglé sur **Demander d’abord** n’est jamais appelé immédiatement. Lorsqu’un agent l’appelle (Claude Code, Codex, Custom, un autre agent, l’exécution d’une tâche planifiée ou l’une de vos apps), Hydor retient l’appel. L’agent est informé tout de suite que l’appel attend votre accord ; il poursuit le reste de son travail ou termine son tour en le signalant : il n’attend pas, et on lui dit de ne pas réessayer autrement. L’appel attend dans la **Boîte d’envoi**, en haut de la [Boîte de réception](/inbox), sous forme de brouillon que vous pouvez modifier avant de l’**Envoyer** ou de le **Supprimer** ([La Boîte d’envoi](/guide/inbox#the-outbox-calls-held-for-your-ok)).

- Les comptes que vous connecterez désormais démarrent avec tous les outils qui agissent à l’extérieur sur **Demander d’abord**, et les autres sur **Activé**. Modifiez-les dans **Outils**.
- Les comptes que vous aviez connectés auparavant conservent leurs outils tels quels, afin que ce qui les utilise déjà continue de fonctionner. Leur carte propose une ligne, par exemple **Demander d’abord pour les 3 outils qui envoient, publient, suppriment ou paient** : cliquez dessus pour tous les régler d’un coup sur Demander d’abord. Elle s’affiche tant que de tels outils sont activés sans que vous l’ayez choisi.
- Demander d’abord est votre propre réglage pour le compte : il s’applique donc dans toutes les sessions et dans tous les modes d’autorisation, **Accès complet** compris. Les agents ne peuvent pas le modifier sans vous le demander sur une carte, et ne peuvent pas envoyer eux-mêmes un appel retenu. Lorsqu’un agent demanderait aussi avant d’utiliser l’outil (la carte propre à Claude Code ou à Custom), il ne le fait pas : vous dites oui une seule fois, dans la Boîte d’envoi.
- La question de savoir si un outil agit à l’extérieur est jugée d’après son nom, sa description et les indications que donne son service (comme « lecture seule » ou « supprime »). Regardez les marques, et réglez vous-même tout autre outil sur Demander d’abord.

Pour essayer une tâche planifiée sans que rien ne parte, utilisez **Tester sans envoyer** ([Tâches planifiées](/guide/tasks#try-a-task-with-a-test-run)).

## Modifier une connexion ou se reconnecter

- **Variation** (pour les comptes avec une clé ou des paramètres) rouvre la boîte de dialogue avec ce que vous avez saisi. Les paramètres conservent leurs valeurs. Les champs de clé et de secret indiquent « Enregistré : laissez vide pour le conserver » : saisissez-en un nouveau pour le remplacer, puis cliquez sur **Enregistrer**.
- **Se reconnecter** (pour les connexions par navigateur) vous reconnecte à neuf. Lorsqu’un compte affiche **Nécessite une nouvelle connexion**, les agents cessent de le recevoir tant que vous ne l’avez pas fait.

Si la place de marché modifie l’adresse d’un service ou sa méthode de connexion après que vous l’avez connecté, le compte indique : « Le catalogue a une nouvelle adresse ou une nouvelle connexion pour ce service. Il continue d’utiliser l’ancienne jusqu’à ce que vous vous reconnectiez. » Votre clé ou votre connexion n’est jamais envoyée à une nouvelle adresse tant que vous ne vous êtes pas reconnecté vous-même.

## Déconnecter un compte

Cliquez sur **Déconnecter** (une icône de prise débranchée sur téléphone) et confirmez. La connexion ou la clé du compte est supprimée ici, et les agents cessent de recevoir ses outils. Pour une connexion par navigateur, Hydor indique aussi au service que les jetons ne sont plus nécessaires, lorsque le service propose un moyen de le faire.

## Choisir les comptes utilisés par une session

Chaque session reçoit les comptes connectés dont l’interrupteur **Toutes les sessions** est activé. Pour modifier cela pour une seule session :

1. Ouvrez le menu de la session (⋯) → **Paramètres de la session** → **Comptes connectés**.
2. Activez ou désactivez des comptes pour cette session. Chacun indique sa situation : « Activé, comme dans toutes les sessions », « Désactivé, comme dans toutes les sessions », « Activé ici uniquement » ou « Désactivé ici uniquement ».
3. Cliquez sur **Terminé**.

Les services sur internet suivent la modification immédiatement. Ceux qui s’exécutent sur cet ordinateur la suivent au prochain démarrage de l’agent. Tant que rien n’est connecté, la boîte de dialogue propose **Ouvrir les Apps connectées**.

Un agent peut aussi activer des comptes pour les sessions qui démarrent sous son nom : voir [Agents](/guide/agents).

## Comment les agents utilisent les comptes connectés

- Tous les types d’agents reçoivent un compte connecté de la même façon : Claude Code, Codex, Custom et les agents ACP reçoivent ses outils sous le nom court du service.
- Au début d’une session, l’agent est informé des comptes que vous avez connectés et invité à les utiliser quand une tâche les concerne. Il peut aussi lister ce qui est connecté et les clés enregistrées, par leur nom uniquement.
- Un agent ne reçoit que les comptes activés pour sa session et connectés. Les connexions se renouvellent en arrière-plan, même pour les comptes qu’aucune session n’utilise, afin que les longues sessions continuent de fonctionner.
- Les clés et les jetons ne figurent jamais dans les paramètres ni dans la ligne de commande d’un agent. Les valeurs de clés connues sont masquées dans tout ce que renvoient les outils du service.
- Un outil réglé sur Demander d’abord l’indique dans sa description, et l’agent est informé qu’un appel à cet outil attend votre accord. Une fois l’appel envoyé ou supprimé, la session montre ce qui s’est passé, et son agent l’apprend avec votre message suivant.
- Une tâche planifiée peut démarrer lorsqu’un élément nouveau apparaît dans un compte (une nouvelle affaire, un fichier, un ticket ou un paiement), ou un certain temps avant chaque événement d’un calendrier connecté. À chaque vérification, Hydor appelle lui-même, sans modèle, l’un des outils du compte qui se contente de consulter, et jamais un outil qui envoie, modifie, supprime ou paie (voir [Surveiller un changement](/guide/tasks#watch-for-a-change)).
- La zone de recherche (Ctrl+K, ⌘K sur Mac) trouve aussi vos comptes connectés.

## Ajouter un service à la place de marché

Tout le monde peut ajouter un service à la place de marché, ou en corriger un, avec une pull request sur le dépôt GitHub de Hydor. **Comment en ajouter un**, en bas de l’onglet Place de marché, ouvre le guide correspondant.

1. Écrivez un petit fichier JSON pour le service dans le dossier `catalog/` du dépôt, comme le décrit le guide qui s’y trouve. Il contient le nom du service, une phrase simple sur ce qu’un agent peut en faire, sa catégorie, son icône et sa couleur, sa page d’accueil et sa documentation, son serveur (une adresse, ou une commande qui s’exécute ici) et sa méthode de connexion (aucune, une connexion par navigateur, ou une clé), ainsi que les éventuels champs que les utilisateurs remplissent.
2. Utilisez le serveur MCP du service lui-même, à son adresse documentée, lorsqu’il en existe un. Un programme qui s’exécute ici est le bienvenu quand il n’existe pas de tel serveur, ou pour ce que seul un serveur local peut faire, comme les fichiers de cet ordinateur.
3. N’y mettez ni clés ni jetons. Chacun saisit les siens, dans le coffre.
4. Lancez la vérification décrite par le guide. Elle teste le fichier par rapport aux règles et peut demander au serveur comment il répond.
5. Envoyez la pull request. Une fois fusionnée, le service arrive dans la place de marché de tout le monde avec la prochaine mise à jour.

## Garder les clés dans le coffre

Ouvrez [l’onglet Clés](/apps/connected?tab=keys). Le coffre contient les clés d’API, les jetons et les mots de passe des connexions, que les agents utilisent sans les voir. Ils sont chiffrés sur cet ordinateur et ne s’affichent plus jamais, ni ici ni pour un agent : seuls leurs derniers caractères apparaissent.

Les agents les utilisent par l’intermédiaire des outils propres à Hydor : son outil de requête web, son navigateur, et les commandes sur cet ordinateur là où vous l’autorisez. L’app insère elle-même la clé, et uniquement là où vous l’autorisez.

Chaque clé de la liste affiche :

- son nom et un indice masqué de la valeur (comme « …f3a9 ») ;
- sa note ;
- les hôtes auxquels elle peut être envoyée, et **dans les commandes** lorsque les commandes sur cet ordinateur peuvent l’utiliser (**Aucun hôte autorisé pour l’instant** si ni l’un ni l’autre) ;
- sa dernière utilisation (« pas encore utilisée » jusque-là), et la date de son ajout ou du dernier changement de sa valeur.

Tant qu’il n’y a aucune clé, l’onglet indique que vous pouvez en ajouter une ici ou laisser un agent en demander une.

Les apps peuvent aussi avoir besoin de clés (celle d’un service météo, d’un fournisseur de cartes) : une app nomme les clés dont elle a besoin, et vous donnez chacune sur sa page, sur la carte qui l’installe, ou sur sa carte dans une session ([Lui donner les clés dont elle a besoin](/guide/apps#give-it-the-keys-it-needs)). Elles sont conservées ici, sous les noms que l’app leur donne, avec les hôtes qu’elle indique, et la note nomme l’app.

### Ajouter une clé

1. Cliquez sur **Ajouter une clé**.
2. **Nom** : le nom que les agents lui donnent, comme WEATHER_API_KEY : majuscules, chiffres et tirets bas, de 2 à 64 caractères, en commençant par une lettre. Ce que vous saisissez est converti en un tel nom (« github token » devient GITHUB_TOKEN), et le champ l’indique.
3. **Valeur** : collez la clé. Elle doit tenir sur une seule ligne, sauf s’il s’agit d’un bloc qui commence par -----BEGIN (un certificat ou une clé privée).
4. **Hôtes auxquels elle peut être envoyée** : les adresses du service, séparées par des virgules, comme api.example.com (jusqu’à 20). La clé n’est envoyée qu’à ces hôtes et à leurs sous-domaines, en https. Tant que vous n’en ajoutez pas, les agents ne peuvent pas utiliser la clé.
5. **Les commandes sur cet ordinateur peuvent l’utiliser** (désactivé au départ) : activez-le pour une clé dont un programme d’ici a besoin, comme le mot de passe d’une base de données ou un jeton pour git. Voir [Les commandes qui utilisent une clé](/guide/connections#commands-that-use-a-key).
6. **Note** : à quoi sert la clé. Les agents voient cette note.
7. **Mode d’envoi** (facultatif) : par défaut, la clé est placée dans l’en-tête Authorization, après « Bearer ». Vous pouvez modifier l’**En-tête** (comme X-Api-Key) et ce qui se place **Avant la clé** (rien, pour les autres en-têtes), ou l’envoyer plutôt **Ou comme paramètre de requête** (comme api_key).
8. Cliquez sur **Enregistrer**.

Un nom déjà présent dans le coffre est refusé : donnez plutôt une nouvelle valeur à cette clé.

### Donner une nouvelle valeur à une clé

Cliquez sur la flèche circulaire (**Nouvelle valeur**) à côté de la clé, collez la nouvelle valeur dans **Nouvelle valeur**, puis cliquez sur **La remplacer**. Les hôtes, la note et le mode d’envoi restent inchangés.

### Modifier les destinations autorisées d’une clé

Cliquez sur le crayon (**Hôtes, note et mode d’envoi**), modifiez les hôtes, l’autorisation d’utilisation par les commandes, la note ou le mode d’envoi, puis cliquez sur **Enregistrer**. La valeur reste la même.

### Supprimer une clé

Cliquez sur la corbeille (**Supprimer**) et confirmez. Les agents ne peuvent plus utiliser la clé, et sa valeur est définitivement perdue. La question nomme d’abord les apps qui l’utilisent, et les applis web qui ont leur propre valeur sous ce nom (la leur reste).

### Ce que les agents peuvent et ne peuvent pas faire avec une clé

- Appeler un service avec elle, par son nom. L’app insère la clé dans la requête : là où elle est configurée pour aller, ou là où l’agent écrit son nom entre doubles accolades (comme {{GITHUB_TOKEN}}) dans l’adresse, un en-tête ou le corps, ou comme nom d’utilisateur et mot de passe d’une connexion de base.
- La saisir, par son nom, dans la page de connexion d’un site dans son navigateur : uniquement dans un champ d’une seule ligne, sur une page de l’un des hôtes de la clé, en https (ou sur cet ordinateur). Le champ affiche alors des points, et l’agent voit seulement qu’il a été rempli depuis le coffre.
- La donner à une commande sur cet ordinateur, lorsque vous avez activé **Les commandes sur cet ordinateur peuvent l’utiliser**, et seulement après que vous avez autorisé la commande (voir [Les commandes qui utilisent une clé](/guide/connections#commands-that-use-a-key)).
- Sur le web, uniquement vers les hôtes que vous avez autorisés et leurs sous-domaines, uniquement en https, et jamais vers cet ordinateur ou son réseau local. Une redirection vers un hôte auquel la clé n’a pas le droit d’aller n’est pas suivie.
- Modifier, pour un seul appel, l’en-tête ou le paramètre de requête dans lequel la clé est placée.
- Voir les noms, les hôtes et les notes des clés. Jamais leurs valeurs : les réponses, les pages et ce que impriment les commandes reviennent avec la clé masquée.

## Quand un agent demande une clé

Les agents ont pour consigne de ne jamais vous demander de saisir un mot de passe, un jeton ou une clé dans la conversation. Quand une tâche a besoin d’une clé qui n’est pas enregistrée, l’agent affiche à la place une carte dans la conversation : **L’agent demande une clé**, avec le nom de la clé et la raison pour laquelle il en a besoin (souvent, où l’obtenir).

1. Collez la clé dans le champ.
2. Vérifiez **Envoyée uniquement à** : les hôtes suggérés par l’agent. Modifiez-les si nécessaire. Sans hôte, les agents ne peuvent pas utiliser la clé.
3. Cliquez sur **Enregistrer dans le coffre**.

La clé va directement dans le coffre chiffré, jamais dans la conversation. La carte se transforme en une note indiquant que la clé est enregistrée, et l’agent reçoit un message lui disant qu’elle est disponible (sans jamais lui dire de quoi il s’agit), pour qu’il puisse continuer.

- **Pas maintenant** refuse la demande. L’agent est informé que vous préférez ne pas la fournir pour l’instant, et qu’il doit continuer sans elle ou dire ce qui pourrait convenir d’autre. La carte indique alors que vous ne l’avez pas fournie, avec **La saisir finalement** au cas où vous changeriez d’avis.
- Tant qu’une carte est en attente, elle apparaît aussi dans la [Boîte de réception](/guide/inbox) sous la forme « Demande une clé » avec le nom de la clé. **Ouvrir** vous amène à la session.
- Si une clé portant ce nom se trouve déjà dans le coffre, l’agent est invité à l’utiliser, et la carte indique seulement qu’elle est dans le coffre. Lorsqu’une clé enregistrée ne fonctionne plus, l’agent peut la redemander : le champ précise alors qu’elle remplace celle qui est enregistrée.
- Quand l’agent a besoin de la clé dans des commandes sur cet ordinateur, la carte comporte aussi **Les commandes sur cet ordinateur peuvent l’utiliser**, activé au départ. Désactivez-le si vous préférez ne pas l’autoriser ; l’agent peut toujours utiliser la clé sur ses hôtes. Pour une clé déjà enregistrée, la carte affiche **L’agent demande à utiliser une clé dans des commandes** : laissez le champ vide pour conserver la valeur, puis cliquez sur **Enregistrer dans le coffre**.

### Une connexion en plusieurs champs

Pour se connecter à un site ou à un service, un agent demande tout en une fois : **L’agent demande une connexion**, avec un champ pour chaque élément, comme une adresse e-mail et un mot de passe, ou l’adresse, l’utilisateur et le mot de passe d’une base de données. Les mots de passe et autres secrets sont masqués pendant la saisie ; l’œil permet de les afficher.

1. Remplissez les champs. Un champ marqué **facultatif** peut rester vide.
2. Vérifiez **Envoyée uniquement à** : les hôtes auxquels la connexion est destinée.
3. Cliquez sur **Enregistrer dans le coffre**.

Chaque secret est enregistré dans le coffre comme une clé à part entière, nommée d’après la connexion (un mot de passe Voltaro devient VOLTARO_PASSWORD). Un champ marqué **L’agent voit celle-ci** est une information qui n’est pas secrète, comme l’adresse d’un serveur : l’agent reçoit ce que vous y saisissez, et cela n’est pas conservé dans le coffre. Un champ que le coffre contient déjà le signale : laissez-le vide pour conserver la valeur enregistrée. Une fois la connexion enregistrée, la carte liste les clés, et l’agent peut se connecter avec elles dans son navigateur, uniquement sur ces hôtes, sans les voir.

### Plusieurs clés sur une seule carte, avec comment les obtenir

Quand une tâche a besoin de plus d’une clé, ou que l’agent peut vous dire comment en obtenir une, il les met sur une seule carte : un onglet pour chacune (sur un téléphone, une ligne qui s’ouvre). Chacun dit qui donne la clé et pourquoi elle est nécessaire, liste sous **How to get it** de courtes étapes numérotées, renvoie à la page du fournisseur (elle s’ouvre dans un nouvel onglet) et a ses champs.

1. Suivez les étapes et collez chaque valeur dans son champ. Elle est masquée pendant la saisie ; l’œil l’affiche. La ligne sous un champ dit à quoi ressemble une valeur correcte, et prévient quand ce que vous avez collé n’en est manifestement pas une (elle ne vous bloque jamais).
2. Cliquez sur **Enregistrer** dans cet onglet, ou sur **Ignorer pour l’instant** quand c’est proposé.
3. Passez au suivant. Les marques des onglets disent ce qui est enregistré, ignoré ou à faire, et le coin les compte.

- Une clé que le coffre a déjà n’est jamais affichée : choisissez **Use the one saved on** (avec la date) ou **Remplacer**.
- L’agent est informé dès que chaque clé nécessaire est enregistrée, ou quand vous appuyez sur **Close without the rest** : pour chacune, enregistrée, ignorée ou restante, et rien de sa valeur. Une clé facultative ajoutée ensuite lui est signalée aussi.
- Pour une appli qui tourne dans Hydor, les paiements n’acceptent qu’une clé de test (elle commence par sk_test_) : une clé réelle y est refusée.
- Pour une appli web, la carte signale un collage qui est manifestement autre chose (une clé publique là où va la secrète).
- Un champ marqué **L’agent voit celle-ci** est transmis à l’agent tel que vous l’avez saisi, comme sur la carte d’une connexion.

## Commandes qui utilisent une clé

Certaines tâches nécessitent un mot de passe ou un jeton dans un programme sur cet ordinateur : envoyer des modifications vers GitHub avec un jeton, lire une base de données avec son mot de passe, un script qui appelle un service. Pour cela, les agents disposent d’un outil qui exécute une commande avec des clés du coffre dans son environnement, chacune sous son propre nom. Ce que la commande affiche revient à l’agent avec les clés masquées.

- Seules les clés pour lesquelles **Les commandes sur cet ordinateur peuvent l’utiliser** est activé peuvent être transmises à une commande. Activez-le dans la boîte de dialogue du crayon de la clé, ou sur la carte quand un agent la demande.
- Avant l’exécution d’une telle commande, une carte l’affiche : **Exécuter une commande avec** les noms des clés, puis la commande, avec son objectif. **Autoriser** l’exécute une seule fois. **Autoriser pour cette session** permet aussi aux commandes suivantes de cette session avec les mêmes clés de s’exécuter sans demander, jusqu’au redémarrage de l’app. **Ne pas** l’arrête, et vous pouvez dire à l’agent quoi faire à la place.
- Une session en accès complet exécute ces commandes sans demander, comme ses autres commandes. En mode Planifier, aucune ne s’exécute.
- Une commande peut faire tout ce qu’un programme peut faire, y compris envoyer la clé ailleurs : n’autorisez que des commandes que vous comprenez, et n’activez cette option que pour les clés dont un programme d’ici a besoin.
- Une commande s’arrête au bout de deux minutes, sauf si l’agent lui accorde plus de temps (jusqu’à dix minutes).

## Remplir un formulaire demandé par un service

Certains services ont besoin de quelque chose de votre part en cours de tâche : une date, un choix, un oui ou un non, ou une page à ouvrir. Quel que soit l’agent au travail, la demande s’affiche sous forme de carte dans la session, à côté des approbations de l’agent lui-même, et dans la [Boîte de réception](/guide/inbox). Le titre de la carte indique ce que le service veut :

- **… vous demande de remplir un formulaire** : le message du service, puis ses champs, sous forme de formulaire. On y trouve des zones de texte, des textes plus longs, des nombres, des dates, un interrupteur pour oui ou non, et des pastilles ou une liste où choisir (des pastilles où vous pouvez en choisir plusieurs, quand le service l’autorise). Cliquez sur **Envoyer**. Les champs vides dont il a besoin (« Obligatoire ») et les nombres qui n’en sont pas sont signalés avant tout envoi. Une réponse que le service ne peut pas accepter (trop longue, pas une adresse e-mail, trop peu de choix) est refusée avec ce qu’il faut corriger, et la carte reste affichée.
- **… vous demande d’ouvrir une page** : un lien. **L’ouvrir** ouvre la page dans un nouvel onglet (pour approuver quelque chose ou s’y connecter) et indique au service que vous l’avez fait.
- **… demande l’autorisation de continuer** : un simple oui ou non. **Autoriser** vaut pour oui.

**Décliner** vaut pour non. **Pas maintenant** annule pour cette fois. La carte d’un service attend jusqu’à une heure ; si le tour de l’agent se termine avant, la demande est annulée. Les serveurs MCP que vous configurez pour Codex demandent par le même type de carte.

## Configurer des serveurs MCP pour Claude Code, Codex et Custom

Ouvrez [Paramètres → Agents → Serveurs MCP](/settings?s=mcp). Ce sont des serveurs d’outils que vous configurez vous-même, pour des outils que la place de marché n’a pas ou des serveurs que vous exécutez vous-même. Ceux de Claude Code et de Codex sont conservés dans leurs propres paramètres ; ceux de Custom sont conservés par Hydor, vous pouvez donc les ajouter sans avoir aucun des deux programmes. Custom, l’agent propre à l’app, les utilise tous (voir [Custom](/guide/custom)). Les nouvelles sessions les chargent ; les sessions déjà en cours prennent en compte les changements à leur redémarrage.

La page liste les serveurs en trois groupes, **Claude Code**, **Codex** et **Custom**, et **Ajouter le serveur** se trouve à côté du titre de la page. Un groupe Claude Code ou Codex qui n’est pas configuré et n’a aucun serveur n’apparaît pas. La pastille **Dossier** en haut choisit le dossier dont vous voyez les serveurs, car Claude Code peut conserver des serveurs pour un dossier précis comme pour tous. Le (i) à côté du nom de chaque groupe indique quand les changements prennent effet.

Chaque serveur affiche :

- son nom et son type : **Commande** (un programme que cette machine exécute), ou **HTTP** ou **SSE** (un serveur à une adresse ; SSE est l’ancien type) ;
- pour Claude Code, là où il s’applique : **Tous les dossiers**, **Ce dossier, vous seul** ou **Ce dossier, partagé** ;
- **Désactivé**, pour un serveur Codex désactivé dans les paramètres propres de Codex ;
- dans le groupe **Custom**, **Depuis Claude Code**, **Depuis Codex** ou **Depuis .mcp.json** pour un serveur que Custom lit à cet endroit, et **Connecté** ou **Se reconnecter** pour un serveur qui se connecte dans le navigateur ;
- sa commande ou son adresse, et les noms de ses variables d’environnement, de ses en-têtes ou de sa variable de jeton Bearer. Leurs valeurs restent sur le serveur et ne sont jamais affichées ;
- après une vérification, l’état du serveur (un badge à la fin de sa ligne).

### Ajouter un serveur

Cliquez sur [Ajouter le serveur](/settings?s=mcp&find=Add%20server). La boîte de dialogue **Ajouter un serveur MCP** demande :

- **Ajouter à** : Claude Code, Codex, Custom, ou plusieurs d’entre eux. Au départ, ce sont Claude Code et Codex lorsqu’ils sont configurés, sinon Custom. Un programme non configuré ne peut pas être choisi, et la boîte de dialogue en donne la raison. Custom utilise aussi les serveurs de Claude Code et de Codex : ajoutez à Custom un serveur que lui seul doit avoir, ou quand vous n’avez aucun des deux programmes.
- **Nom** : des lettres, chiffres, points, tirets ou tirets bas, 64 au maximum, en commençant par une lettre ou un chiffre. Les agents présentent ses outils sous la forme du nom, d’une barre oblique et de l’outil.
- **Saisir** : **Commande**, **HTTP** ou **SSE**. Codex ne prend pas en charge SSE, donc choisir SSE exclut Codex.
- Pour une commande :
  - **Commande** : la ligne de commande complète, comme `npx -y @modelcontextprotocol/server-github`. Elle s’exécute sur cette machine au démarrage d’une session. Mettez entre guillemets les arguments qui contiennent des espaces. Un ~ au début d’un argument désigne votre dossier personnel.
  - **Environnement** : un CLÉ=valeur par ligne (les lignes commençant par # sont ignorées). Les valeurs vont dans les fichiers de configuration des agents (pour Custom, un fichier que Hydor conserve sur cet ordinateur) et ne sont plus jamais affichées ici.
- Pour HTTP ou SSE :
  - **URL** : l’adresse du serveur, commençant par http:// ou https://.
  - **En-têtes** (pour Claude Code et Custom) : un « Nom : valeur » par ligne, pour les serveurs qui acceptent une clé d’API. Les serveurs qui utilisent une connexion dans le navigateur (OAuth) n’en ont pas besoin : connectez-vous depuis la liste après l’ajout.
  - **Variable du jeton Bearer** (pour Codex, **facultatif**) : le nom d’une variable d’environnement dont la valeur est envoyée par Codex comme jeton Bearer.
- **Où Claude Code l’utilise** (**Où il est utilisé** quand seul Claude Code est choisi) :
  - **Tous les dossiers** : toutes les sessions Claude Code sur cette machine. C’est la valeur par défaut.
  - **Ce dossier** : uniquement les sessions du dossier choisi en haut, conservé dans vos propres paramètres Claude Code.
  - **.mcp.json partagé** : enregistré dans un fichier .mcp.json de ce dossier, pour que tous ceux qui travaillent dans le dépôt l’obtiennent.

  Les serveurs de Codex et de Custom s’appliquent toujours à tous les dossiers.

Cliquez sur **Ajouter le serveur** dans la boîte de dialogue. Hydor l’ajoute à Claude Code et à Codex via la commande propre à chaque programme, afin que leurs paramètres restent tels qu’ils les attendent, et conserve lui-même celui de Custom. Si un agent refuse, la boîte de dialogue indique qu’il n’a pas ajouté le serveur, avec ce que l’agent a répondu. Corrigez ce qui ne va pas et cliquez de nouveau sur **Ajouter le serveur** : seuls les agents qui ont échoué sont réessayés. Un serveur portant le même nom qu’un serveur que Custom lit déjà dans Claude Code ou Codex le remplace pour Custom.

Pour modifier un serveur de Custom, ouvrez son menu **⋯** et choisissez **Modifier**. Les variables et les en-têtes sont listés avec des valeurs vides : laissez-en une vide pour garder la valeur enregistrée, ou supprimez sa ligne pour la retirer. Si vous changez la commande, ou le site de l’adresse, saisissez de nouveau les valeurs.

### Vérifier quels serveurs se connectent

[Vérifier les connexions](/settings?s=mcp&find=Check%20connections), à la fin du titre d’un groupe, démarre chaque serveur comme le ferait une nouvelle session et montre comment chacun s’en sort. Dans le groupe **Custom**, tout ce que Custom charge est vérifié : après une vérification, les serveurs qu’il lit dans Claude Code, Codex et le .mcp.json du dossier y figurent aussi :

- **Connecté**, avec son nombre d’outils ;
- **Connexion requise** ; pour Custom, un serveur qui demande une connexion dans le navigateur (OAuth) ;
- **Se reconnecter**, pour Custom, quand une connexion a pris fin et n’a pas pu être renouvelée ;
- **Connexion en cours** ;
- **Échec**, avec la raison (« Le serveur n’a pas démarré ou n’a pas répondu. » quand il n’y en a pas) ;
- **Désactivé**.

Aucun modèle n’est utilisé. Cela peut prendre jusqu’à une minute ou deux. Pour Claude Code, la vérification s’exécute dans le dossier choisi en haut, de sorte que les serveurs propres à ce dossier sont pris en compte.

### Se connecter à un serveur

Un serveur à une adresse qui se connecte par OAuth demande une connexion unique.

Pour **Claude Code** et **Codex**, cliquez sur **Se connecter** (affiché quand une vérification indique qu’une connexion est requise), ou ouvrez le menu **⋯** du serveur et choisissez **Se connecter (OAuth) dans un terminal**. Un terminal s’ouvre dans l’app et exécute la connexion propre au programme pour ce serveur : suivez-y les étapes.

Pour **Custom** (serveurs HTTP, les siens et ceux qu’il lit dans les programmes), cliquez sur **Se connecter**, puis sur **Se connecter** dans la boîte de dialogue : vous vous connectez sur la page du service, dans une petite fenêtre (un téléphone reste dans son onglet), comme pour les [comptes connectés](#services-you-sign-in-to-in-the-browser). La plupart des serveurs laissent Hydor s’enregistrer tout seul ; sinon, la boîte de dialogue demande un ID client que vous créez dans les paramètres développeur du service, et affiche l’adresse de rappel à lui indiquer. Les jetons sont conservés chiffrés dans le coffre, envoyés uniquement à ce serveur et renouvelés tout seuls : Custom ne les voit jamais. **Se reconnecter** n’apparaît que si le renouvellement échoue. **Se déconnecter**, dans le menu **⋯**, oublie la connexion.

### Retirer un serveur

Ouvrez le menu **⋯** du serveur, choisissez **Retirer**, puis confirmez avec **Retirer**. L’agent cesse de le charger. Les sessions déjà en cours le conservent jusqu’à leur redémarrage. Retirer un serveur de Custom oublie aussi sa connexion, si aucun autre serveur n’utilise cette adresse.

## Ajouter des plugins à Claude Code

Claude Code a ses propres plugins : des extensions qui regroupent des compétences, des commandes, des agents, des hooks et des serveurs MCP, issues de places de marché (des catalogues de plugins, conservés dans un dépôt GitHub, un autre dépôt git ou un dossier). Ils ne fonctionnent que pour Claude Code. Ils se trouvent dans l’onglet **Claude Code** de [Paramètres → Agents → Plugins](/settings?s=plugins&find=Claude%20Code) ; les plugins propres à Codex se trouvent dans son onglet **Codex**. Les plugins pour tous les agents se trouvent dans l’onglet **Tous les agents** : voir [Plugins](/guide/plugins).

### Plugins installés

**Installée** liste les plugins de Claude Code sur cette machine. Les nouvelles sessions Claude Code les chargent. Chacun affiche son nom, sa place de marché, sa version et ce qu’il fait.

- L’interrupteur désactive ou active un plugin sans le retirer.
- Son menu **⋯** propose **Désinstaller**, après confirmation. Les nouvelles sessions Claude Code cessent de charger ses compétences, ses commandes et ses serveurs.

### Trouver et installer un plugin

**Parcourir** liste tous les plugins que vous pouvez installer depuis vos places de marché, les plus installés en premier, avec le nombre d’installations de chacun. **Rechercher des plugins** restreint la liste. Elle en affiche 40 à la fois : **Afficher plus** en ajoute 40 de plus.

Cliquez sur **Installer** et confirmez. Le plugin s’installe pour toutes les sessions Claude Code. Les plugins peuvent ajouter des hooks et des serveurs qui exécutent des commandes sur cette machine : n’installez que des plugins de confiance.

Hydor demande à Claude Code la liste des plugins au plus toutes les 10 minutes, et de nouveau après chaque changement. La première fois peut prendre un moment.

### Places de marché de plugins

**Places de marché** liste les catalogues depuis lesquels Claude Code installe des plugins.

- Pour en ajouter une, cliquez sur **Ajouter** dans le titre du groupe, saisissez dans la boîte de dialogue un propriétaire/dépôt GitHub, une URL git ou un dossier, puis cliquez sur **Ajouter**.
- Pour en retirer une, cliquez sur la corbeille sur sa ligne et confirmez. Les plugins installés depuis elle sont aussi désinstallés.

## Demander à un agent

Les agents peuvent faire tout cela pour vous, avec votre accord sur une carte. Ils ne saisissent jamais la valeur d’une clé dans l’app : pour une clé ou une connexion, ils affichent la carte où vous la saisissez.

- « Quels comptes sont connectés ? Teste Notion et dis-moi si ça marche. »
- « Trouve les e-mails non lus de cette semaine de mon propriétaire et résume-les. »
- « Rédige une réponse au dernier e-mail d’Anna en disant que je peux la rencontrer jeudi, et enregistre-la dans mes Brouillons. »
- « Enregistre dans ce dossier les pièces jointes des factures reçues ce mois-ci. »
- « Connecte Context7 pour que les agents puissent consulter la documentation des bibliothèques. »
- « Désactive Gmail pour toutes les sessions, mais garde-le activé dans celle-ci. »
- « Montre-moi les outils de Notion et désactive ceux qui suppriment des pages. »
- « Règle les outils de Gmail qui envoient ou suppriment sur Demander d’abord, et laisse les autres activés. »
- « Ajoute un serveur MCP pour Claude Code et Codex qui exécute npx -y @modelcontextprotocol/server-memory, puis vérifie qu’il se connecte. »
- « Ajoute à Custom le serveur MCP HTTP à l’adresse https://mcp.example.com/mcp et dis-moi quand je dois appuyer sur Se connecter. »
- « Montre-moi les plugins Claude Code les plus installés, puis installe celui que je choisis. »
- « Connecte-toi à mon compte Voltaro et télécharge les factures de cette année dans ce dossier. » (La première fois, il demande la connexion sur une carte.)
- « Envoie cette branche vers GitHub avec le jeton du coffre. »
- « Demande-moi les clés dont ma boutique a besoin, toutes sur une carte, et dis-moi comment obtenir chacune. »
