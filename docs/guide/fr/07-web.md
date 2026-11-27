# Recherche et navigateur

Les agents de l’app peuvent chercher sur le web, lire des pages et utiliser un vrai navigateur, quel que soit leur modèle. Cette rubrique présente les fournisseurs de recherche qu’ils utilisent et leur configuration, ce que montre une recherche et ses sources, puis le navigateur : le suivre en direct, prendre la main pour se connecter, passer une vérification ou payer, et ses paramètres. Elle présente aussi la page Navigateur, un navigateur à vous dans l’app de bureau (onglets, onglets privés, barre d’adresse intelligente, favoris, historique, bloqueur de publicités, traduction, mode lecture, extensions), et la façon de transmettre l’une de ses pages à un agent. Dans l’app de bureau (Mac, Windows, Linux), le navigateur s’exécute dans l’app, et les agents peuvent aussi utiliser l’ordinateur lui-même : son écran, sa souris et son clavier.

![Un agent qui a cherché sur le web, lu des pages et comparé ses trouvailles dans un tableau](images/web.webp)

## Comment les agents cherchent sur le web

Chaque agent que vous lancez ici (Claude Code, Codex, Custom et les agents qui parlent ACP) reçoit trois outils de l’app : une recherche web, un moyen de lire une page, et un moyen de trouver des images et des vidéos de choses précises. Ils fonctionnent de la même façon quel que soit le modèle : un petit modèle sur votre propre ordinateur cherche aussi bien qu’un grand.

- Une recherche est envoyée aux fournisseurs de **Paramètres → Capacités → Recherche**, dans l’ordre. Le premier qui est activé répond. Quand il ne peut pas (il lui faut une clé, son quota est épuisé, il est injoignable, ou il demande de prouver que la recherche ne vient pas d’un robot), le suivant prend le relais. La réponse indique à l’agent quel fournisseur a répondu.
- Un agent peut demander jusqu’à 100 résultats, et limiter une recherche à certains sites (ou en exclure), à des dates, à des langues, à des PDF, ou à la page d’accueil des sites (la page d’une personne, un site officiel). Naget Search peut aussi se limiter à des types de pages, comme les articles scientifiques, les prépublications, les articles biomédicaux, les brevets américains, les dépôts d’entreprises, l’actualité, la documentation ou les discussions. Quand un fournisseur ne peut pas respecter un filtre, l’agent en est informé. Quand un agent ne définit aucun filtre lui-même mais que les mots de sa recherche en énoncent (« rapports sur le climat sur nasa.gov du mois dernier », « articles sur la génération augmentée par récupération depuis 2024 »), le modèle d’appoint les lit d’abord (voir [Choisir le modèle d’appoint](/guide/agents-models#choose-the-helper-model)), puis Naget Search cherche les mots restants avec ces filtres. Cela ne se produit que pour les recherches dont les mots semblent énoncer un filtre, quelques-unes à la fois, et en 8 secondes environ. Quand le modèle d’appoint ne peut pas répondre à temps, ou que deux lectures de suite échouent (la lecture est alors suspendue pendant 10 minutes), la recherche part telle que l’agent l’a écrite, comme avec SearXNG, Brave Search et DuckDuckGo, et quand l’agent définit lui-même un filtre. Si les filtres lus ne donnent rien, Naget Search cherche les mots tels qu’ils sont écrits.
- Naget Search peut aussi fournir, pour chaque résultat, les phrases de sa page qui répondent à la recherche, au lieu d’un simple extrait. C’est plus lent : les agents le demandent donc quand ils ont besoin de faits tirés des pages. Cela fonctionne aussi sans clé.
- Pour une liste de choses à présenter (jeux, films, lieux, plats, produits, équipes), un agent peut trouver une image pour chacune : celle de son propre article Wikipédia (la jaquette d’un jeu, la photo d’un lieu, l’écusson d’une équipe), sinon celle que ses pages montrent quand elles sont partagées ; et, sur demande, une vidéo YouTube dont le titre la nomme (une bande-annonce, une recette, des temps forts). Seul ce qui nomme clairement la chose compte : certaines reviennent donc sans image. Les apps s’en servent pour montrer des images et des vidéos dans leurs réponses (voir [Apps](/guide/apps)).
- Les agents ont pour consigne de citer les pages qu’ils utilisent : un numéro entre crochets après ce que chaque page appuie, et une liste de ces seules pages à la fin de la réponse. L’app les montre sous forme de liens et de cartes (voir [Voir les sources sous une réponse](/guide/web#see-the-sources-under-a-reply)). Les agents traitent ce que disent les résultats et les pages comme des informations, jamais comme des instructions.

Un fournisseur en échec est mis au repos un moment (jusqu’au retour de son quota, par exemple), pour que les recherches suivantes ne l’attendent pas. La même recherche refaite dans les 10 minutes obtient les résultats précédents, sans nouvelle recherche.

Claude Code et Codex ont aussi leurs propres outils web. Quand une réponse cite les pages qu’ils ont trouvées, celles-ci s’affichent de la même façon.

## Choisir vos fournisseurs de recherche

Ouvrez [Paramètres → Capacités → Recherche](/settings?s=search). Sur un téléphone, Paramètres est une liste : touchez **Recherche** sous Capacités.

Sous [Fournisseurs](/settings?s=search&find=Providers) (« Interrogés à partir du haut : le premier activé répond »), chaque fournisseur a sa ligne :

- son nom, avec **Par défaut** sur le premier qui est activé, et un avertissement tel que **Nécessite une clé** ou **Nécessite l’adresse de votre instance** quand il ne peut pas répondre avec sa configuration actuelle ;
- une ligne qui le décrit ; le (i) à côté de son nom ajoute ce à quoi il peut limiter une recherche, par exemple « Jusqu’à 100 résultats · catégories · dates · pages d’accueil · les parties de pages qui répondent » ;
- un aperçu de sa clé enregistrée, s’il en a une (comme « sk-ab…12cd » : jamais la clé elle-même) ;
- sa dernière erreur, en rouge, avec le temps écoulé depuis ;
- un interrupteur à droite qui l’active ou le désactive, et un menu **⋯** avec **Ajouter une clé** (ou **Modifier la clé**), **Définir l’adresse** (ou **Modifier l’adresse**), **Tester**, **Définir par défaut** (pour un fournisseur activé mais pas premier), et **Monter** et **Descendre** pour changer sa place dans l’ordre.

Le (i) à côté de **Fournisseurs** explique que les agents peuvent chercher sur le web et lire des pages quel que soit leur modèle, et que les résultats de recherche et les pages sont des données extérieures, que les agents utilisent comme des informations, jamais comme des instructions.

**Définir par défaut** place le fournisseur en haut de la liste. Par défaut, l’ordre est Naget Search, SearXNG, Brave Search, DuckDuckGo. Naget Search et DuckDuckGo sont activés au départ ; SearXNG et Brave Search sont désactivés, jusqu’à ce que vous leur donniez ce dont ils ont besoin.

### Naget Search

[Naget Search](/settings?s=search&find=Naget%20Search) est le fournisseur par défaut : l’index propre à Naget du web, des articles, des brevets et des dépôts. Il n’a besoin d’aucune clé : les recherches sans clé puisent dans un quota gratuit quotidien. Dès qu’il a répondu, sa ligne affiche **Quota gratuit restant aujourd’hui** (combien sur le quota du jour), une barre, et le moment où il sera renouvelé. Quand le quota est épuisé, la ligne l’indique, et le fournisseur suivant répond jusqu’à son retour.

Une clé de naget.com donne droit à plus de recherches ; avec une clé, la ligne affiche **Crédits restants** à la place. Une clé permet aussi à Naget Search de choisir les parties d’une page qui répondent à une question quand les agents lisent des pages (voir [Lire des pages entières, ou seulement les parties qui répondent à une question](/guide/web#read-whole-pages-or-only-the-parts-that-answer-a-question)) ; sans clé, l’app les choisit d’après leurs mots. Les phrases qui répondent à une recherche figurent dans ses résultats sans clé. Si la ligne indique « Naget Search a besoin d’une clé pour le moment », les recherches sans clé sont refusées ; tant que vous n’en ajoutez pas une, le fournisseur suivant répond.

Son formulaire comporte aussi une **Adresse** : https://naget.com, sauf si vous en définissez une autre. Laissez-la telle quelle, sauf si on vous en a donné une autre.

### SearXNG

[SearXNG](/settings?s=search&find=SearXNG) est un moteur de recherche que vous hébergez vous-même, qui interroge de nombreux moteurs à la fois et ne garde aucune trace de vous. Il n’a besoin d’aucune clé, seulement de l’adresse de votre instance : ouvrez son menu **⋯**, choisissez **Définir l’adresse**, saisissez-la (par exemple https://searx.example.org) et appuyez sur **Enregistrer**. Lui donner une adresse l’active. Il fournit jusqu’à 100 résultats.

### Brave Search

[Brave Search](/settings?s=search&find=Brave%20Search) interroge l’index indépendant de Brave, via son API de recherche. Il a besoin d’une clé ; Brave propose une formule gratuite. **⋯ → Ajouter une clé** ouvre un formulaire avec un lien, **Obtenez-en une sur api-dashboard.search.brave.com**. Ajouter une clé l’active. Il fournit jusqu’à 100 résultats.

### DuckDuckGo

[DuckDuckGo](/settings?s=search&find=DuckDuckGo) n’a besoin d’aucune clé et est activé dès le départ, en bas de la liste comme dernier recours. Il fournit environ 10 résultats par page (30 au maximum), et il peut demander de prouver que la recherche ne vient pas d’un robot ; le fournisseur suivant répond alors, s’il y en a un.

### Ajouter ou modifier une clé ou une adresse

1. Sur la ligne du fournisseur, ouvrez le menu **⋯** et choisissez **Ajouter une clé** (ou **Modifier la clé**, **Définir l’adresse**, **Modifier l’adresse**).
2. Collez la clé sous **Clé** (elle s’affiche sous forme de points), ou saisissez l’**Adresse**. Pour Naget Search, la clé est indiquée « facultative, pour plus de recherches ».
3. Appuyez sur **Enregistrer**. **Annuler** ferme le formulaire et laisse les choses comme elles étaient.

Donner à un fournisseur la clé ou l’adresse dont il a besoin l’active. Les clés restent sur le serveur : la page n’en montre jamais qu’un aperçu. Pour supprimer une clé enregistrée, ouvrez le formulaire et appuyez sur **Retirer la clé enregistrée**.

### Tester un fournisseur

Ouvrez le menu **⋯** d’une ligne et choisissez **Tester**. L’app lance une petite recherche avec ce seul fournisseur, sans passer au suivant, et avec ce que vous avez saisi dans son formulaire, même avant d’enregistrer. Vous voyez « Ça marche : », le nombre de résultats et le temps pris, avec les trois premiers résultats sous forme de liens, ou la raison de l’échec. Tester un fournisseur tel qu’il est enregistré efface aussi son ancienne erreur dès qu’il refonctionne.

### Résultats par recherche

[Résultats par recherche](/settings?s=search&find=Results%20per%20search) définit combien de résultats une recherche fournit quand l’agent ne demande pas de nombre : **10**, **20** (par défaut), **50** ou **100**. Les agents peuvent toujours en demander plus, jusqu’à 100, pour des recherches plus poussées comme la recherche d’articles. Plus de résultats coûtent plus de lecture à un agent.

Une note en bas de la page renvoie vers la façon dont un développeur peut ajouter un autre fournisseur.

### Quand aucun fournisseur ne peut répondre

Si tous les fournisseurs activés échouent, ou si vous les avez tous désactivés, l’agent est informé de la raison pour chacun. Claude Code et Codex cherchent alors avec leur propre recherche web intégrée (WebSearch pour Claude Code, la recherche web de Codex), pour cette recherche et le reste de la tâche, et citent ses pages comme d’habitude : ils ne vous parlent de Paramètres → Recherche que si leur propre recherche échoue aussi. Les autres agents, comme Custom, n’ont pas de recherche web à eux : ils ont pour consigne de vous dire que Paramètres → Recherche permet d’ajouter une clé ou d’activer un autre fournisseur. Dans une [recherche approfondie](/guide/research), la recherche web propre aux agents est désactivée, afin que chaque recherche compte dans son budget : là aussi, on vous dit ce qu’il faut corriger.

## Voir ce qu’une recherche a trouvé

Les étapes d’un agent se replient en une ligne entre ses messages, comme « 4 recherches effectuées » (les recherches web et les pages lues y comptent comme des recherches). Ouvrez-la pour voir chaque étape. Une recherche s’affiche ainsi : « Recherche web : vélos électriques à moins de 2 000 euros », avec le fournisseur qui a répondu et le nombre de résultats à droite (sur un téléphone, seulement le nombre). Pendant son exécution, elle s’affiche « Recherche sur le web » avec un minuteur ; une recherche en échec s’affiche « Échec de la recherche web ».

Cliquez sur une recherche pour l’ouvrir :

- les filtres utilisés (un site, des dates, une catégorie…) sous forme de petites étiquettes, y compris ceux lus dans les mots de la recherche, avec une note qui nomme les mots recherchés, et « les parties qui répondent » quand l’agent a demandé les phrases qui répondent ;
- des notes, par exemple un fournisseur qui n’a pas pu répondre et celui qui l’a fait à sa place, ou un filtre que le fournisseur n’a pas pu respecter ;
- les résultats, numérotés comme l’agent les a vus : le titre (un lien), le site, la date, une étiquette pour le type de page (Article, arXiv, PubMed, Brevet, Dépôt SEC, Docs…), une étiquette PDF, et l’extrait ou les phrases qui répondent à la recherche. Chacun a un bouton d’ouverture (↗).

Les 8 premiers résultats s’affichent ; **Afficher les N résultats** montre le reste.

## Voir les sources sous une réponse

Quand un agent cite les pages qu’il a utilisées, sa réponse les montre à deux endroits, au lieu d’une liste numérotée à la fin :

- **Dans le texte** : à l’endroit où il cite une page, une petite pastille avec l’icône et le nom du site, comme **ign**. Une pastille qui représente plusieurs pages indique combien d’autres (**ign +1**). Sur un ordinateur, pointez une pastille pour voir ses pages, avec leurs titres et leurs sites ; cliquez dessus pour ouvrir sa page (l’une des pages, depuis la carte, s’il y en a plusieurs). Sur un téléphone, touchez-la pour les voir, puis touchez-en une pour l’ouvrir.
- **Sous la réponse** : une ligne **Sources** avec les icônes des premiers sites et le nombre de pages que la réponse cite. Cliquez dessus pour ouvrir une carte par page : son titre, son site et un lien.

Seules les pages que la réponse cite s’affichent, selon les numéros que l’agent leur a donnés, et non toutes les recherches qu’il a faites : ce qu’il a cherché et lu se trouve dans ses étapes (ouvrez **Travaillé pendant…** au-dessus de la réponse). **Copier le message** (sous la réponse) la copie telle que l’agent l’a écrite, avec sa liste de sources ; la lecture à voix haute omet les numéros et la liste. L’icône d’un site est récupérée auprès du site lui-même la première fois qu’elle s’affiche, puis conservée ; un site sans icône affiche sa première lettre.

## Lire des pages entières, ou seulement les parties qui répondent à une question

Quand les extraits ne suffisent pas, un agent lit la page. Il peut la lire en entier : une longue page arrive par parties d’environ 3 000 mots, et l’agent demande la partie suivante quand il en a besoin. Ou bien il pose une question à la page et ne récupère que les parties qui y répondent, ce qui est bien plus court.

- Avec Naget Search activé et sa clé ajoutée, Naget Search choisit les phrases de la page qui répondent à la question. L’étape indique combien de mots de la page ont été conservés. Contrairement aux phrases qui répondent à une recherche, cela nécessite la clé.
- Sinon, l’app choisit les paragraphes qui partagent le plus de mots avec la question, et dit à l’agent de lire la page en entier s’ils passent à côté de la réponse.

Les PDF sont lus eux aussi comme du texte. Seules les pages web publiques peuvent être lues ainsi : les adresses de cet ordinateur ou de son réseau ne le peuvent pas (le [navigateur](/guide/web#the-browser-agents-use) peut les ouvrir une fois que vous l’avez autorisé). Une page n’est récupérée qu’une fois et conservée 10 minutes : sa partie suivante arrive donc aussitôt.

Dans la conversation, une lecture s’affiche comme « Lecture » avec le titre de la page, et la question qui lui a été posée sur les écrans plus larges. Cliquez dessus pour voir l’adresse, de quelle partie il s’agissait (« partie 1 sur 3 ») ou « les parties qui répondent » à la question, et le texte que l’agent a reçu.

## Le navigateur utilisé par les agents

Certains sites demandent de cliquer, de remplir des formulaires, de se connecter ou d’exécuter des scripts, ce qu’une simple lecture ne permet pas. Pour ces cas, les agents disposent d’un navigateur à part, distinct du vôtre : il ne contient aucune des connexions du Chrome, d’Edge, de Firefox ou de Safari que vous utilisez. Vous pouvez le regarder en direct et en prendre la main à tout moment. Le navigateur utilisé dépend de l’endroit où l’app s’exécute :

- **Dans l’app de bureau** (Mac, Windows, Linux), c’est le navigateur propre à l’app, construit sur Chromium (le navigateur open source sur lequel Chrome est construit) et exécuté dans l’app. Rien n’est à installer, et l’app le choisit sauf si vous en indiquez un autre (voir [Chromium](/guide/web#chromium)). Ses pages s’affichent rapidement dans la fenêtre de l’app, vous cliquez dans l’une d’elles pour l’utiliser, et il continue de fonctionner quand la fenêtre est fermée.
- **Partout ailleurs** (l’app dans Docker ou sur un serveur, et un téléphone ou une page web qui y accède), c’est un vrai Chromium que l’app démarre sur l’ordinateur où elle s’exécute, et que vous voyez sous forme d’image en direct.

Quand le navigateur est activé, chaque agent peut :

- ouvrir une page, dans l’onglet courant ou dans un nouvel onglet, avec les scripts de la page en cours d’exécution ;
- voir la page sous forme de plan : son texte, avec des liens, des boutons et des champs numérotés ;
- cliquer, double-cliquer, pointer, saisir dans un champ (en remplaçant son contenu ou en l’complétant, puis en appuyant sur Entrée), choisir dans une liste, faire défiler, appuyer sur des touches, revenir en arrière et attendre : jusqu’à 10 étapes à la fois, avec un arrêt anticipé si la page change ;
- se connecter avec une connexion que vous avez enregistrée dans le Coffre : il saisit le mot de passe (ou une autre clé) dans la page à partir de son nom, sans le voir, et seulement sur une page des hôtes que vous avez autorisés pour cette clé (voir [Garder des clés dans le Coffre](/guide/connections#keep-keys-in-the-vault)) ;
- regarder une capture d’écran sur laquelle les numéros sont dessinés, quand son modèle voit les images et que les captures d’écran sont activées ;
- chercher du texte dans la page, lire son texte par parties, ou demander au modèle d’appoint de répondre à une question à partir d’une longue page (voir [Agents, comptes et modèles](/guide/agents-models)) ;
- lister, changer et fermer des onglets ;
- joindre des fichiers du dossier de la session au champ d’envoi d’une page (rien qui vienne d’ailleurs) ;
- vous passer la main sur le navigateur.

Certaines choses vous reviennent toujours, ou attendent votre accord :

- **Les connexions sans identifiants enregistrés, les vérifications et tout ce dont l’agent n’est pas sûr.** Les agents ont pour consigne de vous les confier plutôt que de les tenter, y compris un captcha (une vérification que vous êtes une personne) et un code qui vous est envoyé. Quand une tâche devra se connecter de nouveau sans vous, comme une tâche planifiée, l’agent peut plutôt demander la connexion sur une carte, pour la garder dans le Coffre.
- **Payer et commander.** Un agent n’appuie jamais sur un bouton qui paierait ou passerait une commande (Payer, Acheter maintenant, Passer la commande, S’abonner maintenant, Faire un don, Réserver maintenant, le bouton d’envoi d’un formulaire avec des champs de carte…). Il s’arrête, et il vous est demandé de terminer vous-même.
- **Les boutons qui envoient, publient, suppriment ou transfèrent, sur un site où le navigateur est connecté.** Avant qu’un agent en utilise un, il vous est demandé de l’autoriser (voir [Boutons qui envoient, publient ou suppriment](/guide/web#buttons-that-send-post-or-delete)). Vous pouvez désactiver cette demande dans les Paramètres.
- **Ce que vous saisissez.** Les valeurs des mots de passe, numéros de carte, codes de sécurité et codes à usage unique ne sont jamais montrées à l’agent, pas plus que ce que vous avez saisi pendant que vous aviez la main. Les parties des adresses qui ressemblent à des mots de passe lui sont aussi masquées. Un champ que l’agent a rempli depuis le Coffre affiche des points, et l’agent apprend seulement qu’il a été rempli.
- **Les questions en fenêtre contextuelle** posées par une page (voir [Répondre aux questions en fenêtre contextuelle d’une page](/guide/web#answer-a-pages-pop-up-questions)).

Chaque session a son propre navigateur. Sans profil, il démarre neuf, connecté nulle part, et ne garde rien une fois fermé. Avec un profil, il est connecté partout où le profil l’est (voir [Garder les connexions avec des profils](/guide/web#keep-sign-ins-with-profiles)). Votre propre navigateur, sur la page Navigateur, est un navigateur distinct que les agents n’utilisent jamais, sauf si vous leur confiez une de ses pages (voir [Confier une page à un agent](/guide/web#hand-a-page-to-an-agent)).

## Regarder le navigateur en direct

Tant que le navigateur d’une session est ouvert, un panneau se trouve juste au-dessus de la zone de message. Il affiche le titre de la page (ou « Page vide ») et, en dessous, ce que fait l’agent (« Clic sur « Se connecter » », « Saisie dans « Rechercher » »), le profil utilisé et le nombre d’onglets ouverts. Il indique « En attente de vous » quand quelque chose attend votre action, et « Vous avez la main : l’agent attend » pendant que vous l’utilisez.

Sur un ordinateur :

- Quand il est replié, le panneau affiche à sa gauche une petite image en direct de la page. Cliquez dessus, sur le titre ou sur la flèche (**Afficher la vue en direct**) pour déplier la vue en direct ; **Masquer la vue en direct** la replie.
- **Plein écran** affiche le navigateur sur toute l’app ; **Quitter le plein écran** vous ramène à l’affichage normal.
- **Prendre la main** vous permet d’utiliser vous-même le navigateur (voir plus bas), et **Options du navigateur** (⋯) ouvre son menu.

Sur un téléphone, touchez le panneau pour ouvrir le navigateur en plein écran ; la croix × le ferme.

Dans l’app de bureau, la vue en direct est la page elle-même, dessinée par l’app et mise à jour aussi vite que la page change, si bien que le défilement et la saisie se font comme dans n’importe quel navigateur. Ailleurs, c’est une image de la page, envoyée plusieurs fois par seconde pendant que vous regardez ; elle indique « Connexion au navigateur… » jusqu’à l’arrivée de la première.

### Voir où l’agent pointe

Le navigateur s’exécute hors de vue, c’est pourquoi la vue en direct dessine pour vous le pointeur de l’agent : une grande flèche aux couleurs de l’app, avec un halo doux et une étiquette **Agent** à côté.

- Avant que l’agent clique, saisisse ou fasse défiler, son pointeur glisse de sa position précédente jusqu’à cet endroit, en environ un tiers de seconde, pour que votre regard puisse le suivre. Pendant que vous regardez, l’agent l’attend ; quand personne ne regarde le navigateur, il n’attend pas.
- À l’endroit où il clique, un anneau se propage (deux pour un double-clic). Le champ dans lequel il saisit, ou la liste dans laquelle il choisit, est entouré un instant. Un défilement montre sa direction par des flèches à côté du pointeur, et les touches qu’il presse (Entrée, Tab, Ctrl+A) s’affichent à côté de l’étiquette.
- Le pointeur reste là où l’agent a agi en dernier. Sur la petite image du panneau replié, il apparaît sous la forme d’une petite flèche.
- Pendant que vous avez la main, le pointeur de l’agent disparaît de la vue en direct : le vôtre est le seul. Il revient quand vous rendez le navigateur.

Chaque étape que l’agent effectue dans le navigateur apparaît aussi dans la conversation, parmi ses autres étapes, sous la forme d’une ligne (« A ouvert github.com », « A cliqué sur [12] bouton "Se connecter" », « Vous a demandé : Se connecter à GitHub ») suivie d’une petite image de la page. Cliquez sur la ligne pour voir l’image en plus grand et la réponse complète de l’agent. Sur la grande image, un anneau marque l’endroit où l’étape a cliqué et un contour en pointillés le champ dans lequel elle a saisi, avec des numéros quand l’étape a fait plusieurs choses. L’app conserve les images des 400 dernières étapes de chaque session ; celles des sessions inutilisées depuis un mois disparaissent.

## Prendre la main pour se connecter, résoudre une vérification ou payer

Quand un agent a besoin de vous dans le navigateur, vous en êtes informé à plusieurs endroits à la fois :

- une ligne en haut du panneau du navigateur, avec ses boutons ;
- une carte dans la conversation, comme « A besoin de vous dans le navigateur : se connecter à GitHub », avec **Afficher** (**Ouvrir** sur un téléphone) ;
- une notification, comme lorsqu’une session attend votre réponse, et une entrée dans la [Boîte de réception](/inbox) (voir [Boîte de réception et notifications](/guide/inbox)).

Sur un ordinateur, la vue en direct se déplie d’elle-même pour une connexion, un paiement ou une question en fenêtre contextuelle, et se replie une fois la chose réglée (sauf si vous l’avez dépliée vous-même).

### Sur un ordinateur

1. Appuyez sur **Prendre la main** sur la ligne (ou sur le panneau). Le panneau indique « Vous avez la main : l’agent attend », et la vue en direct reçoit un contour coloré.
2. Utilisez la page comme dans n’importe quel navigateur : cliquez, faites défiler avec la molette, saisissez. Cliquez d’abord dans la page ; à partir de là, vos touches vont à la page (les raccourcis de l’app attendent), et ce que vous collez arrive sous forme de texte. Dans l’app de bureau, il suffit de cliquer ou de saisir dans la page pour prendre la main : le panneau passe de lui-même à « Vous avez la main : l’agent attend », et pendant que l’agent pilote, une ligne sous l’adresse indique « Cliquez dans la page pour l’utiliser vous-même ».
3. Pendant que vous avez la main, une barre au-dessus de la page propose **Retour**, **Recharger** et l’adresse : saisissez une adresse et appuyez sur Entrée pour y aller.
4. Quand vous avez fini, appuyez sur **Terminé** sur la ligne. L’app prévient l’agent que c’est fait, en lui indiquant la page que le navigateur affiche désormais, et l’agent poursuit.

### Sur un téléphone

1. Touchez **Prendre la main**. Le navigateur s’ouvre en plein écran, et la page est mise en forme pour l’écran de votre téléphone pendant que vous pilotez. La barre avec **Retour**, **Recharger** et l’adresse se trouve au-dessus.
2. Touchez pour cliquer, faites glisser pour faire défiler. **Saisir** ouvre le clavier de votre téléphone ; la rangée à côté propose Tab, Entrée, Échap, ⌫ et les flèches.
3. Touchez **Terminé** quand vous avez fini. La page retrouve sa taille habituelle, et l’agent poursuit.

### Payer et commander

Quand l’agent arrive à un bouton qui paierait ou passerait une commande, il s’arrête : « Arrêt avant de payer ou de commander : Passer la commande sur shop.example.com. C’est à vous de le faire. » Prenez la main, vérifiez la commande, payez vous-même, puis appuyez sur **Terminé**. Appuyez sur **Pas maintenant** si vous ne poursuivez pas. Dans les deux cas, l’agent est informé de votre choix.

### Autres réponses, et prise de main de votre propre initiative

- **Ne peut pas** indique à l’agent que vous n’avez pas pu faire ce qu’il demandait.
- Vous pouvez prendre la main à tout moment, pas seulement quand on vous le demande : appuyez sur **Prendre la main** sur le panneau. L’agent attend ; s’il essaie d’utiliser le navigateur entre-temps, on lui dit que vous l’avez et qu’il sera prévenu quand vous aurez fini. Appuyez sur **Rendre la main** pour rendre le navigateur ; si l’agent l’attendait, il reçoit un message avec la page affichée par le navigateur.

Les messages que l’app envoie à l’agent pour vous apparaissent dans la conversation. Si l’agent est au milieu d’un tour, ils attendent qu’il se termine.

## Boutons qui envoient, publient ou suppriment

Sur un site où le navigateur est connecté, un agent demande avant d’appuyer sur un bouton qui envoie, publie, diffuse, partage, répond, supprime, retire, transfère ou retire de l’argent. Cela concerne un navigateur qui utilise un profil (voir [Garder les connexions avec des profils](/guide/web#keep-sign-ins-with-profiles)) et une page que vous avez confiée à un agent (voir [Confier une page à un agent](/guide/web#hand-a-page-to-an-agent)). Un navigateur qui démarre neuf, connecté nulle part, n’a rien à protéger et ne demande rien. Payer et commander restent de votre seul ressort (voir plus haut).

L’agent reconnaît ces boutons à leurs mots, en anglais, allemand, grec, chinois, français et espagnol : Envoyer, Publier, Supprimer, Transférer et leurs équivalents, ainsi qu’un simple « Confirmer » ou « Oui » quand la page porte sur l’un d’eux (une fenêtre contextuelle qui demande « Supprimer cette publication ? »). « Se connecter », « Suivant », « Enregistrer le brouillon », « Annuler », un bouton de recherche et l’envoi d’un code à vous-même (Renvoyer le code) ne sont pas bloqués.

Quand il en atteint un, il s’arrête, termine son tour et attend. Vous voyez « Veut appuyer sur « Supprimer » sur mail.example.com » aux mêmes endroits que les autres questions (la ligne du panneau du navigateur et une carte dans la conversation), avec **Ne pas autoriser** et **Autoriser**. La vue en direct ne s’ouvre pas d’elle-même.

- **Autoriser** indique à l’agent qu’il peut appuyer sur le bouton maintenant. Cela laisse passer un appui sur un bouton portant les mêmes mots, sur ce site, dans les deux minutes qui suivent ; ensuite l’agent demande de nouveau.
- **Ne pas autoriser** indique à l’agent de ne pas appuyer dessus. Il poursuit sans cela, ou vous dit ce qu’il n’a pas pu faire. La carte affiche alors « Autorisé » ou « Non autorisé ».

Cette demande est activée au départ. Pour la désactiver, voir [Demander avant d’envoyer sur les sites connectés](/guide/web#ask-before-sending-on-signed-in-sites).

## Répondre aux questions en fenêtre contextuelle d’une page

Quand une page ouvre une fenêtre contextuelle (une alerte, une question oui ou non, une demande de texte, ou « Quitter cette page ? »), elle s’affiche sur la vue en direct : le site, « indique » (ou « demande s’il faut quitter la page »), puis le message. Vous seul y répondez : **OK** ou **Annuler** (avec un champ de texte pour une demande de texte), ou **Quitter** ou **Séjour**. Si c’est une étape de l’agent qui l’a ouverte, vous recevez une notification, et l’agent est informé de votre réponse.

## Laisser une session ouvrir un site sur cet ordinateur ou votre réseau

Quand [Empêcher les pages d’accéder à cette machine et à son réseau](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) est activé (comme au départ), les pages ne peuvent pas atteindre cet ordinateur ni les autres appareils de son réseau. Quand un agent en veut une, par exemple un site web que vous construisez et qui s’exécute sur cet ordinateur (un serveur de développement), il demande d’abord : « Veut ouvrir localhost:3000, sur cette machine ou son réseau », avec **Ne pas autoriser** et **Autoriser pour cette session**. L’autoriser permet au navigateur de cette session d’ouvrir cette adresse dès lors, et l’agent est invité à la rouvrir.

Une adresse de cet ordinateur ou de son réseau que vous saisissez vous-même pendant que vous avez la main est autorisée pour la session de la même façon. **Sites de cette session**, dans le menu du navigateur, liste ce que vous avez autorisé sous « Autorisé sur cette machine ou son réseau » ; la croix × à côté d’une adresse la retire. Hydor lui-même ne peut jamais être ouvert depuis le navigateur.

## Le menu du navigateur

**Options du navigateur** (⋯) sur le panneau ouvre un menu :

- **Onglets**, quand plus d’un est ouvert : choisissez-en un pour l’afficher. Quand une page ouvre un lien dans un nouvel onglet, l’agent continue dans celui-ci.
- **Enregistré dans le dossier de la session** : les derniers fichiers téléchargés par le navigateur ; choisissez-en un pour l’ouvrir.
- **Profil (en changer redémarre le navigateur)** : **Neuf, sans connexion**, ou l’un de vos profils. Il apparaît dès que vous avez créé un profil. En choisir un autre ferme le navigateur ; il s’ouvre dans le nouveau profil à sa prochaine utilisation.
- **Sites de cette session** : les sites que le navigateur de cette session peut seuls visiter (**Uniquement ces sites**, tous les sites quand la liste est vide) et les sites qu’il ne visite jamais (**Jamais ces sites**), un par ligne. Ils s’ajoutent aux listes des Paramètres → Navigateur. Appuyez sur **Enregistrer** pour les conserver.
- **Fermer le navigateur**.

## Ouvrir soi-même le navigateur

Vous pouvez ouvrir le navigateur d’une session avant l’agent, par exemple pour vous connecter à un site avant de lui demander d’y travailler. Ouvrez le menu de la session (⋯) → **Plus** → **Ouvrir un navigateur**. Le panneau apparaît au-dessus de la zone de message : appuyez sur **Prendre la main** et utilisez-le. Quand le navigateur est déjà ouvert, la même entrée s’intitule **Afficher le navigateur**. Si le navigateur est désactivé dans les Paramètres, un message vous l’indique. Pour un navigateur à vous, qui n’est lié à aucune session, consultez [Votre propre navigateur](/guide/web#your-own-browser).

## Téléchargements et envois de fichiers

Les fichiers téléchargés par une page sont enregistrés dans le dossier de la session, dans un dossier nommé downloads, et l’agent est prévenu de leur emplacement. Le menu du navigateur liste les plus récents sous **Enregistré dans le dossier de la session**.

Un agent ne peut joindre des fichiers au champ d’envoi d’une page que depuis le dossier de la session. Pour qu’il envoie un autre fichier, copiez-le d’abord dans ce dossier (voir [Fichiers, Git, Terminal et Aperçu](/guide/files-git)).

## Quand le navigateur se ferme

Le navigateur d’une session se ferme de lui-même :

- lorsque personne ne l’a utilisé ni regardé pendant 15 minutes, ou pendant deux heures s’il attend votre intervention ou si c’est vous qui le pilotez ;
- lorsque son dernier onglet se ferme ;
- lorsque l’agent de la session cesse de tourner, ou que la session est supprimée ;
- lorsque vous choisissez un autre profil pour lui, ou que vous supprimez le profil qu’il utilise.

Tout ce qui attendait encore votre action prend fin avec lui. L’agent rouvre le navigateur la prochaine fois qu’il en a besoin.

Dans l’app de bureau, le navigateur d’un agent n’a pas besoin de la fenêtre de l’app : il continue de fonctionner quand la fenêtre est fermée ou masquée, tant que l’app tourne (elle reste dans la barre des menus, la zone de notification ou la barre d’état système). Ouvrez la fenêtre et ses pages sont là, prêtes à être observées.

## Votre propre navigateur

La page **Navigateur** est un navigateur à vous dans l’app de bureau (Mac, Windows, Linux), à côté de celui que les agents utilisent : ouvrez **Navigateur** dans la barre d’icônes, ou rendez-vous sur [Navigateur](/browser). Il fait partie de l’app de bureau uniquement : l’app web dans un navigateur, et un téléphone, n’ont pas de bouton **Navigateur**, et l’adresse [Navigateur](/browser) vous le signale. Les navigateurs des agents fonctionnent partout, et vous pouvez les observer dans leurs sessions.

Il comprend une barre en haut avec une zone qui permet de rechercher, d’ouvrir, et de demander à un agent ou de lui dire quoi faire à propos de la page ; une colonne de vos onglets, avec les sites que vous avez épinglés et les agents au travail, à gauche de la page ; et, à droite, une colonne, de la largeur que vous lui donnez en la faisant glisser, pour interroger un agent sur la page ou lui dire quoi y faire, pour la conversation d’un agent, et pour l’historique, les téléchargements, les favoris, les extensions et les paramètres. Il offre retour, avance et rechargement, favoris, historique, extensions Chrome, un bloqueur de publicités et de traqueurs (avec un bouclier dans la barre d’adresse) qui masque aussi les bandeaux de cookies, la recherche dans la page, le zoom, l’impression et les téléchargements. Il propose aussi des [onglets privés](/guide/web#private-tabs) qui oublient tout à leur fermeture, la [traduction d’une page](/guide/web#translate-a-page) dans votre langue, le [mode lecture](/guide/web#reader-view) pour les articles, les [pages sombres](/guide/web#dark-pages), les [captures d’écran et l’enregistrement d’une page en PDF](/guide/web#screenshots-and-pdfs), et des sites qui ne peuvent pas jouer de son d’eux-mêmes. Quand vous pointez un lien, sa destination s’affiche dans une petite zone en bas à gauche de la page (en bas à droite quand la souris s’y trouve), comme dans Chrome. Ses onglets sont de vraies pages dans la fenêtre de l’app, avec la vitesse et les touches de tout navigateur, et ils se connectent directement aux sites, comme dans n’importe quel navigateur. Un menu ou une boîte de dialogue de l’app qui s’ouvre par-dessus la page la fait disparaître un instant (une image de la page reste affichée jusqu’à la fermeture). Il conserve vos connexions d’une visite à l’autre, dans un profil à lui qu’aucun agent ne peut choisir, et il se rouvre avec les onglets que vous aviez (jusqu’à 30 ; les onglets vides et les onglets privés sont exclus). Vos onglets peuvent aussi ouvrir des adresses de cet ordinateur et de son réseau (un site web que vous êtes en train de créer, par exemple). Si le navigateur ne peut pas démarrer, la page en donne la raison, avec **Réessayer** et **Paramètres du navigateur**, qui ouvre [Paramètres → Navigateur](/settings?s=browser).

### La barre et la zone de saisie

Une barre court en haut de la page. À sa gauche, au-dessus de la colonne des onglets, se trouvent le logo de l’app, **Nouvel onglet** (+) et **Masquer les onglets** (comme Ctrl+B), qui replie la colonne des onglets jusqu’à ce que **Afficher les onglets** la ramène. Le reste de la barre concerne la page sur laquelle vous êtes :

- **Retour**, **Suivant**, **Recharger** et **Accueil** se trouvent à gauche de la zone. Pendant le chargement d’une page, Recharger devient **Arrêter**. **Accueil** ouvre votre page d’accueil dans l’onglet actuel, comme **Nouvel onglet** le fait dans un nouvel onglet.
- La zone au milieu est la barre d’adresse. Au repos, elle affiche l’adresse de la page avec son site en évidence, le reste de l’adresse dans une couleur plus pâle, et le rappel **Ctrl+L**. Cliquez dessus, ou appuyez sur Ctrl+L, et elle affiche l’adresse entière, que vous pouvez modifier. Ce que vous y tapez reste en place pendant que vous êtes dans une autre app ; un clic dans la page remet l’adresse d’origine. Tapez une adresse, avec ou sans https:// (`example.com`, `localhost:3000`, `192.168.1.5`, une adresse `file://`), et appuyez sur Entrée pour l’ouvrir. Tout autre texte est recherché avec votre moteur de recherche (Google au départ ; voir [Paramètres du navigateur](/guide/web#browser-settings)), et un raccourci comme `yt` suivi d’une espace avant vos mots lance la recherche sur ce site à la place (voir [Suggestions](/guide/web#suggestions)). **Alt+Entrée**, ou Ctrl+Entrée (⌘+Entrée sur Mac), l’ouvre plutôt dans un nouvel onglet (un onglet privé, quand vous êtes dans un onglet privé). Ce qu’elle propose pendant que vous tapez est décrit sous [Suggestions](/guide/web#suggestions). Son cadenas est à gauche (dans un onglet privé, une pastille violette **Privé** vient en premier : voir [Onglets privés](/guide/web#private-tabs)). À droite se trouvent un bouclier qui compte les publicités et les traqueurs bloqués sur une page web (voir [Bloquer les publicités et les traqueurs](/guide/web#block-ads-and-trackers)), un bouton qui traduit la page quand elle est dans une autre langue que la vôtre (voir [Traduire une page](/guide/web#translate-a-page)), un bouton en forme de livre pour le mode lecture quand la page contient un article, avec **Aa** à côté tant qu’il est activé (voir [Mode lecture](/guide/web#reader-view)), et son étoile.
- L’étoile au bout de la zone ajoute la page aux favoris, dans la barre des favoris ; pleine, la page est en favori, et un nouvel appui retire le favori. Les sites de la barre s’affichent sous forme de vignettes en haut de la colonne des onglets.
- **Enregistrer** conserve dans un projet une copie lisible de la page, telle que l’affiche le mode lecture : le texte de l’article avec ses images et ses vidéos, sans les menus, publicités, commentaires et scripts du site. Une note indique « Enregistré dans » suivi du nom du projet (« Enregistré dans les fichiers de Thèse »), avec **Ouvrir** : la copie est une page web parmi les fichiers du projet, dans son onglet **Fichiers** (voir [Fichiers](/guide/projects#files)). Le **▾** à côté d’Enregistrer (**Choisir un projet où enregistrer**) liste les destinations possibles : **Aucun projet** et chacun de vos projets. Un projet dont le dossier contient des dossiers permet aussi d’en choisir un (**Choisir un dossier qu’il contient**), et le fichier de la copie, une page .html, va là. L’emplacement qu’utilise Enregistrer est marqué dans ce menu : celui que vous avez choisi en dernier sur cet ordinateur (**Aucun projet** au départ). Sans projet, la note indique « Enregistré. Choisissez un projet à côté d’Enregistrer pour conserver des copies dans ses fichiers. » : la copie reste sans projet, et la zone de recherche (Ctrl+K) la retrouve. Vos listes (favoris, pages à lire plus tard, téléchargements, historique et points forts) sont des panneaux de cette page, dans le **Menu** (⋯) (voir [La colonne à côté de la page](/guide/web#the-column-beside-the-page)).
- **Demander** ouvre la colonne à côté de la page, où vous interrogez un agent à son sujet ou choisissez **Agir** pour qu’un agent y travaille (voir [Demander à côté de la page](/guide/web#ask-beside-the-page)) ; il apparaît allumé tant que cette colonne est affichée.
- Les boutons des extensions que vous avez épinglées viennent ensuite, puis **Extensions** (la pièce de puzzle), qui liste toutes les extensions activées, puis, quand l’onglet ouvert est une page d’extension du Chrome Web Store, **Ajouter à Hydor** (voir [Extensions Chrome](/guide/web#chrome-extensions)).
- **Menu** (⋯) contient **Nouvel onglet privé** (voir [Onglets privés](/guide/web#private-tabs)), puis ce que vous faites avec la page : **Rechercher dans la page**, **Traduire la page…** (**Afficher l’original** tant que la page est traduite ; voir [Traduire une page](/guide/web#translate-a-page)), **Mode lecture** et **Pages sombres** (cochés quand ils sont activés ; voir [Mode lecture](/guide/web#reader-view) et [Pages sombres](/guide/web#dark-pages)), et **Zoom**, avec − et + et le niveau de zoom en pourcentage entre les deux (voir [Zoom, impression et plein écran](/guide/web#zoom-print-and-full-screen)). Puis **Imprimer…** et **Capture d’écran ou PDF**, qui affiche **Capture d’écran de ce que vous voyez**, **Capture d’écran de la page entière** et **Enregistrer en PDF…** à la place du menu (**Capture d’écran ou PDF** en haut revient en arrière ; voir [Captures d’écran et PDF](/guide/web#screenshots-and-pdfs)). Puis vos listes : **Historique**, **Téléchargements**, **Favoris**, **Lire plus tard** (avec le nombre de pages qui attendent ; voir [Lire plus tard](/guide/web#read-later)) et **Points forts** (avec le nombre de ceux que contient la page). Pour finir, le navigateur lui-même : **Extensions**, **Autorisations des sites**, **Paramètres** et **Raccourcis clavier**. Les listes, et ces éléments, s’ouvrent dans la colonne à droite de la page (voir [La colonne à côté de la page](/guide/web#the-column-beside-the-page)). Le menu reste ouvert pendant que vous appuyez sur le − et le + du zoom. Dans un onglet privé, **Demander** est grisé : les agents n’obtiennent jamais d’onglet privé.

Un lien vers `/browser?url=https://example.com` ouvre la page Navigateur avec cette adresse dans un nouvel onglet, et [/browser?private=1](/browser?private=1) ouvre un nouvel onglet privé (ajoutez `&url=https://example.com` pour y ouvrir cette adresse).

### Suggestions

Pendant que vous tapez dans la barre d’adresse, une liste en dessous propose, avec les mots que vous avez saisis en gras :

- vos onglets ouverts (« Passer à l’onglet » : choisissez-en un pour y aller au lieu de rouvrir la page ; vos onglets privés en font partie tant qu’ils sont ouverts, et rien à leur sujet n’est conservé ensuite),
- vos favoris et les pages de votre historique qui correspondent aux mots présents dans leurs titres et leurs adresses, celles que vous consultez souvent et récemment en premier (les adresses que vous avez saisies vous-même comptent le plus, et un favori compte pour vingt visites). Quand des favoris correspondent aux mots saisis, au moins deux d’entre eux figurent toujours parmi les pages proposées, à la place des dernières pages de votre historique, de sorte qu’un gros historique, comme celui importé d’un autre navigateur, ne les masque jamais,
- avec la [Recherche par le sens](/settings?s=memory&find=Search%20by%20meaning) activée, les favoris et les pages de votre historique qui traitent de ce que vous avez tapé, même si leurs titres et leurs adresses ne contiennent pas ses mots, après ceux qui les contiennent (ils s’affichent sans mots en gras). Le modèle qui les trouve s’exécute sur cet ordinateur, à partir d’un vecteur construit avec le titre et l’adresse de chaque page (sans sa chaîne de requête) et conservé dans la base de données de l’app, à part de tout le reste ; il disparaît avec la page,
- quand ce que vous avez tapé commence par l’un de vos raccourcis de recherche suivi d’une espace (`yt lofi`), tout d’abord une ligne qui recherche sur ce site les mots qui suivent (« Rechercher « lofi » sur YouTube »), ce que fait **Entrée** (voir [Paramètres du navigateur](/guide/web#browser-settings)),
- ce que vous avez tapé, comme recherche (« Rechercher avec Google ») ou, quand cela ressemble à une adresse, comme cette adresse ; avec un raccourci devant, cette ligne recherche toujours tous vos mots avec votre moteur de recherche,
- les suggestions propres au moteur de recherche, quand les [Suggestions de recherche](/guide/web#browser-settings) sont activées,
- en dessous, quand l’onglet ouvert est une page web (et non un onglet privé, que les agents n’obtiennent jamais), **Poser une question sur cette page : « … »**, qui ouvre Demander à côté de la page avec ce que vous avez tapé comme question. Tant qu’**Agir** est sélectionné dans Demander, la ligne devient **Agir sur cette page : « … »** et donne à un agent ce que vous avez tapé à faire sur la page (voir [Agir sur la page](/guide/web#do-it-on-the-page)),
- enfin, **Demander à un agent : « … »**, qui démarre une session avec ce que vous avez tapé comme premier message, avec l’agent et le modèle que la page de démarrage a utilisés en dernier, et vous y emmène.

La liste affiche autant de propositions que l’écran le permet, avec au moins deux de vos pages et deux suggestions du moteur quand il y en a autant. Quand la liste doit être raccourcie pour tenir dans une fenêtre basse, les pages de votre historique disparaissent avant vos favoris et vos onglets ouverts. Les flèches du clavier permettent de parcourir la liste et **Entrée** ouvre la proposition marquée (ce que vous avez tapé, si aucune ne l’est) ; **Alt+Entrée**, ou Ctrl+Entrée (⌘+Entrée sur Mac), l’ouvre dans un nouvel onglet (privé, si vous êtes dans un onglet privé). La barre d’adresse complète aussi sur place : quand un site que vous avez visité commence par ce que vous avez tapé, la suite s’affiche sélectionnée après votre curseur (trouvée d’après les mots saisis, jamais par le sens), et **Tab** ou **→** l’accepte. Effacer ce que vous avez tapé désactive la complétion. **Shift+Suppr** sur une suggestion de l’historique fait oublier cette page, et **Esc** ferme la liste.

### La colonne des onglets

La colonne à gauche de la page liste, de haut en bas (**Masquer les onglets**, ou Ctrl+B, la replie) :

- **Sites épinglés** : les éléments de votre barre de favoris sous forme de tuiles, cinq par ligne et deux lignes au maximum (une tuile **…** liste le reste). Cliquez sur une tuile pour l’ouvrir dans l’onglet ouvert ; Ctrl+clic (⌘+clic sur Mac) ou un clic du milieu l’ouvre dans un nouvel onglet. Un dossier ouvre la liste de son contenu. Faites un clic droit sur une tuile pour **Ouvrir**, **Ouvrir dans un nouvel onglet**, **Modifier** (**Renommer** pour un dossier) et **Supprimer**. Si la barre de favoris est vide, il n’y a pas de tuiles ; l’étoile y place la page (voir [Favoris](/guide/web#bookmarks)).
- **Agents au travail**, tant qu’un agent a un navigateur ouvert : une ligne par agent, avec son icône et un point (bleu pendant qu’il travaille, orange quand il vous attend ou que vous prenez la main), le titre de la session et ce qu’il fait. Cliquez sur une ligne pour le voir (voir [Agents au travail](/guide/web#agents-at-work)). Sa flèche replie la liste.
- **Privé**, tant que vous avez des onglets privés ouverts : une section violette avec un masque et leur nombre, puis une ligne par onglet privé (une ligne teintée, avec un petit masque sur son icône). Cliquez sur son libellé pour replier la section ; **Fermer les onglets privés** (×, quand vous pointez le libellé) les ferme tous, et **Nouvel onglet privé** à sa fin en ouvre un autre (voir [Onglets privés](/guide/web#private-tabs)). Les onglets privés ne sont dans aucun groupe et ne peuvent pas être glissés dans un groupe.
- **Onglets** : une ligne par onglet, avec son icône, son titre, **⋯** et **×** (sur l’onglet ouvert et sur celui que vous pointez). Un titre trop long pour la colonne s’estompe à la fin, puis défile pour montrer la suite quand vous pointez sa ligne. L’onglet ouvert est la ligne marquée ; cliquez sur une ligne pour afficher cet onglet, et un clic du milieu le ferme. Faites un clic droit sur une ligne, ou appuyez sur son **⋯**, pour ouvrir le menu de l’onglet (voir [Groupes d’onglets et menu de l’onglet](/guide/web#tab-groups-and-the-tab-menu)). Les onglets que vous placez dans un groupe se trouvent sous l’en-tête du groupe, et le bouton étincelles à la fin du libellé **Onglets** regroupe vos onglets avec l’IA. Un onglet qui émet du son affiche un haut-parleur : cliquez dessus pour couper le son de l’onglet, puis de nouveau pour le réentendre. Un onglet muet garde son haut-parleur. **Nouvel onglet** à la fin ouvre votre page d’accueil. Fermer le dernier onglet en laisse un vide.
- **Lire plus tard**, sous les onglets : les pages que vous avez mises de côté (voir [Lire plus tard](/guide/web#read-later)), les plus récentes en premier, chacune avec son icône et son titre, et le nombre de pages en attente. La section est repliée tant que rien n’attend ; sa flèche l’ouvre. Cliquez sur une ligne pour ouvrir cette page dans un nouvel onglet. Pointez une ligne pour **Marquer comme lu** (elle quitte la liste) et **Retirer**. **Afficher les lus** à la fin ramène les pages que vous avez lues (**Masquer les lus** les remet de côté).

### Groupes d’onglets et menu de l’onglet

Faites un clic droit sur un onglet (ou appuyez sur **⋯** sur une ligne que vous pointez, ou sur la touche de menu sur une ligne qui a le focus) pour ouvrir son menu :

- **Fermer l’onglet**, **Fermer les autres onglets** et **Fermer les onglets en dessous** (les onglets situés sous lui dans la colonne, dans l’ordre de la liste). Votre navigateur garde toujours un onglet ouvert.
- **Dupliquer** ouvre la même adresse dans un nouvel onglet à côté, dans le même groupe, et l’affiche (la copie d’un onglet privé est privée). **Recharger** recharge cet onglet, et pas seulement celui que vous avez ouvert.
- **Copier l’adresse**, **Copier comme lien Markdown**, qui copie un lien vers la page en Markdown, avec son titre comme texte, pour un document ou un message (une note indique « Lien Markdown copié »), et **Ajouter aux favoris** (**Retirer le favori** si la page est déjà dans les favoris), qui place la page dans la barre de favoris.
- **Ajouter au groupe**, qui liste vos groupes (celui de l’onglet est coché) et **Nouveau groupe…**, qui crée un groupe avec l’onglet et ouvre son nom pour que vous le saisissiez ; et **Retirer du groupe**. Le menu d’un onglet privé n’a ni l’un ni l’autre : les onglets privés ne peuvent pas être regroupés.

Un groupe réunit des onglets qui vont ensemble. Il a un nom, l’une des sept couleurs (gris, bleu, vert, ambre, orange, rouge ou violet) et il est ouvert ou replié. Dans la colonne, c’est un en-tête avec sa couleur, son nom (« Groupe sans nom » tant que vous ne lui en donnez pas) et son nombre d’onglets ; ses onglets se trouvent sous lui, avec un trait de sa couleur le long de leur côté, et les onglets qui ne sont dans aucun groupe viennent après les groupes. Cliquez sur l’en-tête pour replier le groupe ou le rouvrir ; un groupe replié masque ses onglets, sauf celui que vous avez ouvert. Double-cliquez sur le nom (ou appuyez sur F2) pour le renommer. Vous pouvez glisser un onglet sur un groupe pour l’y mettre, et sur les onglets sans groupe pour l’en sortir. Faites un clic droit sur l’en-tête, ou appuyez sur son **⋯**, pour ouvrir le menu du groupe :

- **Renommer** et **Couleur**.
- **Nouvel onglet dans le groupe** ouvre votre page d’accueil dans un nouvel onglet du groupe.
- **Dissocier** défait le groupe et laisse ses onglets où ils sont.
- **Fermer le groupe** ferme le groupe et tous ses onglets.

Un groupe sans aucun onglet disparaît. Les groupes sont conservés avec vos onglets : ils reviennent avec eux à la prochaine ouverture du navigateur. Sur un téléphone, les onglets forment une liste dans la barre, sans groupes.

### Regrouper mes onglets avec l’IA

Quand vous avez beaucoup d’onglets ouverts, le bouton étincelles à la fin du libellé **Onglets** (**Regrouper mes onglets avec l’IA** ; il apparaît quand vous pointez le libellé) trie les onglets qui ne sont dans aucun groupe selon leur usage. Il en faut au moins trois ; les onglets déjà dans un groupe restent où ils sont, et les onglets privés sont exclus : ils ne sont jamais comptés, jamais regroupés et jamais envoyés nulle part.

**Ce qui est envoyé, et à quel modèle.** Uniquement quand vous appuyez sur le bouton, le titre et l’adresse de chacun de ces onglets (jusqu’à 60) sont envoyés au modèle d’appoint de l’app, celui qui rédige les titres de session et les notes de mémoire ([Paramètres → Agents → Modèles → Modèle d’appoint](/settings?s=models&find=Helper%20model)). En Automatique, il s’agit de Claude Haiku via Claude Code, sinon de Codex, tous deux en ligne ; un modèle à vous sur cet ordinateur garde ces données ici. Une adresse est envoyée sans rien de ce qui suit un **?** ou un **#**, et l’adresse d’un fichier se réduit à son nom. Le texte et les images des pages ne sont jamais envoyés, et rien n’est envoyé à un autre moment. Si un titre est privé, n’appuyez pas sur le bouton (ou placez un modèle sur cet ordinateur comme modèle d’appoint).

Le modèle répond par des groupes d’onglets, chacun avec un nom court et une couleur, et l’app les crée aussitôt. Un message indique combien de groupes ont été créés, avec **Annuler**, qui remet les groupes comme ils étaient. Si aucun onglet ne va ensemble, il le dit et ne change rien. Les agents ne voient jamais vos onglets, et l’app ne les laisse pas utiliser cette fonction.

### La colonne à côté de la page

À droite de la page se trouve une colonne, affichée seulement quand elle a un contenu, avec l’un de ces éléments à la fois&nbsp;: **Demander** à propos de la page, ou faire faire quelque chose à un agent dans la page (voir [Demander à côté de la page](/guide/web#ask-beside-the-page))&nbsp;; la conversation d’un agent, pendant que vous regardez son onglet (voir [Agents au travail](/guide/web#agents-at-work))&nbsp;; ou le panneau **Historique**, **Téléchargements**, **Favoris**, **Lire plus tard**, **Importer les favoris et l’historique**, **Points forts**, **Extensions**, **Autorisations des sites**, **Paramètres**, **Raccourcis clavier** ou les statistiques du **Bloqueur de publicités**. Chacun a un **×** pour le fermer, et en choisir un autre le remplace. Rien n’est posé par-dessus la page&nbsp;: elle se rétrécit pour faire de la place, et s’élargit de nouveau quand la colonne se ferme. Les adresses [Historique](/browser?panel=history), [Téléchargements](/browser?panel=downloads), [Favoris](/browser?panel=bookmarks), [Lire plus tard](/browser?panel=later), [Importer les favoris et l’historique](/browser?panel=import), [Points forts](/browser?panel=highlights), [Extensions](/browser?panel=extensions), [Autorisations des sites](/browser?panel=permissions), [Paramètres](/browser?panel=settings), [Raccourcis clavier](/browser?panel=shortcuts) et [Bloqueur de publicités](/browser?panel=adblock) ouvrent la page Navigateur avec ce panneau.

Faites glisser le bord gauche de la colonne pour l’élargir ou la rétrécir (ou donnez le focus au bord et appuyez sur **←** ou **→**) ; un double-clic rétablit sa largeur habituelle, 400 px. C’est une largeur unique pour tout ce que la colonne affiche, conservée sur cet appareil, jamais inférieure à 340 px, et elle laisse toujours à la page au moins 360 px. Dans une fenêtre étroite, les onglets forment une liste dans la barre, et la colonne devient un volet posé sur la page, avec sa propre largeur.

### Demander à côté de la page

**Demander** dans la barre (ou **Poser une question sur cette page : « … »** dans la liste de la zone, ou **Demander à un agent à propos de** dans le menu du clic droit) ouvre la colonne pour l’onglet où vous êtes. En haut se trouve un sélecteur, **Demander** ou **Agir** ; votre choix est conservé sur cet appareil.

Avec **Demander**, écrivez ce que vous voulez savoir, ou appuyez sur **Résumer**, **Points clés** ou **L’expliquer simplement**, puis sur **Demander** (**Ctrl+Entrée**, ⌘+Entrée sur Mac). La ligne sous la zone indique quel agent et quel modèle répondent : ceux que la page de démarrage a utilisés en dernier. Une nouvelle session démarre sur une copie de la page telle qu’elle est maintenant (voir [Poser une question sur cette page](/guide/web#ask-about-this-page)), et sa conversation remplit la colonne, ce qui vous permet de continuer à poser des questions là. Sa note se termine par « Choisissez Agir pour qu’un agent travaille dans la page. »

Avec **Agir**, écrivez ce qu’un agent doit faire sur cette page (« remplis le formulaire avec mes coordonnées ») et appuyez sur **Le faire** (**Ctrl+Entrée**, ⌘+Entrée sur Mac). La ligne de l’agent sous la zone est un bouton qui choisit **Claude Code** ou **Custom** (les deux seuls qui peuvent être limités à un seul onglet ; celui que la page de démarrage avait en dernier, Claude Code au début, ou Custom quand vous n’êtes pas connecté à Claude Code, qui affiche alors **Non configuré**), avec le modèle que la page de démarrage avait en dernier pour cet agent. La note dit ce que l’agent obtient : un onglet à lui, avec vos connexions sur ce site et seulement le navigateur, et il demande avant d’envoyer, de publier, de supprimer ou de payer (voir [Agir sur la page](/guide/web#do-it-on-the-page)). Une fois qu’il démarre, l’onglet de l’agent s’affiche à la place de la page et sa conversation remplit la colonne, comme dans [Agents au travail](/guide/web#agents-at-work).

Dans les deux cas, les mots que vous avez sélectionnés dans la page et envoyés avec **Demander à un agent à propos de** s’affichent au-dessus de la zone et accompagnent votre demande (jusqu’à 4 000 caractères) ; il en va de même pour une image envoyée avec **Poser une question sur cette image** (voir [Menu du clic droit](/guide/web#right-click-menu)), qui s’affiche aussi au-dessus de la zone, avec des questions rapides comme **Décrire cette image** dans Demander.

Chaque onglet a sa propre conversation : changez d’onglet et la colonne affiche celle de cet onglet. **Ouvrir comme session** vous y emmène parmi vos sessions. **Nouvelle question** (**Nouvelle demande** après un Agir) oublie ici la conversation de cet onglet (la session reste) pour que vous puissiez poser une nouvelle question. Après un Agir, revenez à vos onglets et Demander pour cet onglet affiche la conversation avec **Le regarder travailler**, qui affiche de nouveau l’onglet de l’agent à la place de la page. Cela fonctionne sur les pages de sites web (Demander aussi sur les fichiers). La ligne de la page dans la barre d’adresse suit le sélecteur (voir [Suggestions](/guide/web#suggestions)).

### Raccourcis clavier

Sur la page Navigateur, y compris depuis l’intérieur d’une page, avec Ctrl sous Windows et Linux et ⌘ sur Mac :

- **Ctrl+T** ouvre un nouvel onglet, et **Ctrl+W** ferme l’onglet ouvert.
- **Ctrl+Shift+T** rouvre le dernier onglet fermé ; appuyez de nouveau pour celui d’avant (les onglets privés ne figurent pas dans cette liste).
- **Ctrl+Shift+N** ouvre un nouvel onglet privé (**⇧⌘N** sur Mac).
- **Ctrl+Tab** passe à l’onglet suivant et **Ctrl+Shift+Tab** à celui d’avant. **Ctrl+1** à **Ctrl+8** passent à cet onglet, et **Ctrl+9** au dernier.
- **Ctrl+L** passe à la barre d’adresse.
- **Ctrl+R** (**F5** aussi) recharge.
- **Alt+←** et **Alt+→** reculent et avancent (**⌘[** et **⌘]** aussi sur Mac).
- **Ctrl+F** ouvre la recherche dans la page, et **Esc** la ferme.
- **Ctrl+D** ajoute la page aux favoris.
- **Ctrl+H** ouvre l’historique, et **Ctrl+J** les téléchargements.
- **Ctrl+B** replie la colonne des onglets, et la ramène. Faites glisser son bord pour l’élargir ou la rétrécir : elle garde la largeur que toutes les colonnes de l’app partagent.
- **Ctrl+P** imprime la page.
- **Menu** (⋯) → **Raccourcis clavier** liste ces touches dans la colonne à droite de la page, par groupe : onglets, page, barre d’adresse, vos listes et agents ([Raccourcis clavier](/browser?panel=shortcuts)).
- **Ctrl+Shift+Delete** ouvre les paramètres sur **Effacer les données de navigation**.
- **Ctrl** avec **+**, **−** et **0** zoome, dézoome et revient à 100 % (voir [Zoom, impression et plein écran](/guide/web#zoom-print-and-full-screen)).

### Rechercher dans une page

**Ctrl+F**, ou **Rechercher dans la page** dans le menu, ouvre une barre sous la barre d’adresse. Saisissez votre texte, et la première occurrence est trouvée et amenée à l’écran dès que vous faites une pause. **Entrée** passe à l’occurrence suivante et **Shift+Entrée** à la précédente (les flèches aussi), et la barre indique où vous en êtes (« 3 sur 12 », « 1000+ » au-delà de mille) ou « Aucun résultat ». La casse n’compte pas, sauf si vous appuyez sur **Respecter la casse**, et la recherche reprend au début en fin de page. **Esc**, ou **×**, ferme la barre et efface ce qui a été trouvé.

### Zoom, impression et plein écran

- **Zoom** : **Ctrl** avec **+** zoome et **−** dézoome, par les paliers que Chrome utilise (25 % à 500 %). Ctrl et la molette de la souris zooment aussi, tout comme **−** et **+** dans la ligne **Zoom** de **Menu** (⋯), qui reste ouverte pendant que vous appuyez. **Ctrl+0**, le pourcentage de cette ligne, ou la pastille sous la barre ramène le zoom au **Zoom des pages** des [Paramètres du navigateur](/guide/web#browser-settings) (100 % au départ). Un site que vous zoomez vous-même garde son zoom tant que l’app tourne. Un zoom différent du zoom des pages s’affiche sous forme de pastille à la fin de la barre d’adresse, par exemple « 125 % » : cliquez dessus pour revenir en arrière (son titre indique « Revenir à 100 % », ou à votre zoom des pages).
- **Imprimer** : **Ctrl+P**, ou **Imprimer…** dans le menu ou dans le menu du clic droit, ouvre la boîte de dialogue d’impression de votre ordinateur pour la page, avec ses arrière-plans.
- **Plein écran** : quand une vidéo ou une page demande à remplir l’écran, la fenêtre de l’app passe en plein écran et la page la remplit. La sortie propre à la page (Esc) rétablit la fenêtre.

### Captures d’écran et PDF

**Menu** (⋯) → **Capture d’écran ou PDF** comporte trois éléments qui conservent sous forme de fichier la page où vous vous trouvez, qu’il s’agisse d’une page web ou d’un fichier affiché dans l’onglet :

- **Capture d’écran de ce que vous voyez** : une image de la partie de la page qui s’affiche dans l’onglet.
- **Capture d’écran de la page entière** : une image de la page de haut en bas, quelle que soit sa longueur de défilement (jusqu’à 16 384 pixels de haut ; quand c’est impossible, vous obtenez ce que vous voyez).
- **Enregistrer en PDF…** : la page au format PDF, avec ses arrière-plans, comme si vous l’imprimiez.

Une capture d’écran est un fichier PNG. Elle est enregistrée dans votre dossier Téléchargements, nommée d’après le titre de la page avec la date et l’heure (« Example 2026-11-18 at 14.30.05.png »), et placée aussi dans le presse-papiers, pour que vous puissiez la coller directement dans un message ou un document. Une note indique « Capture d’écran enregistrée dans Téléchargements et copiée », avec **Afficher dans le dossier**. Un PDF est enregistré dans Téléchargements, nommé d’après le titre de la page, avec une note « Enregistré en PDF dans Téléchargements » et **Afficher dans le dossier**. Si un nom est déjà pris, un numéro y est ajouté et rien n’est écrasé. Ces fonctions marchent aussi dans un onglet privé.

### Menu du clic droit

Un clic droit dans une page ouvre un menu avec ce qui s’applique à l’endroit où vous avez cliqué, dans l’apparence et la langue de l’app comme ses autres menus (**Esc** ou un clic à l’extérieur le ferme) :

- Dans un champ de texte : des suggestions d’orthographe pour un mot mal écrit, avec **Ajouter au dictionnaire** ; puis **Annuler**, **Rétablir**, **Couper**, **Copier**, **Coller** et **Tout sélectionner**.
- Sur un lien : **Ouvrir le lien dans un nouvel onglet**, **Ouvrir le lien dans un onglet privé** (voir [Onglets privés](/guide/web#private-tabs)), **Ouvrir le lien dans votre navigateur par défaut**, **Copier l’adresse du lien** et **Lire le lien plus tard** (voir [Lire plus tard](/guide/web#read-later)).
- Sur une image : **Ouvrir l’image dans un nouvel onglet**, **Enregistrer l’image sous…** (dans votre dossier Téléchargements), **Enregistrer l’image dans** *le projet qu’utilise Enregistrer* (simplement **Enregistrer l’image** tant qu’aucun projet n’est choisi), **Poser une question sur cette image**, **Copier l’image** et **Copier l’adresse de l’image**.
- Sur une vidéo : **Lecture** ou **Pause**, **Couper le son** ou **Réactiver le son**, **Boucle** et **Afficher les commandes** (cochés tant qu’ils sont activés), **Image dans l’image** (coché tant qu’elle s’affiche), **Ouvrir la vidéo dans un nouvel onglet**, **Enregistrer la vidéo sous…** (dans votre dossier Téléchargements) et **Copier l’adresse de la vidéo**. Un son propose les mêmes choix, sous les noms **Ouvrir l’audio dans un nouvel onglet**, **Enregistrer l’audio sous…** et **Copier l’adresse de l’audio**, sans l’image dans l’image. Un élément ne s’affiche que si cette vidéo ou ce son peut le faire.
- Avec du texte sélectionné : **Copier**, **Recherche** avec votre moteur de recherche (le résultat s’ouvre dans un nouvel onglet) et **Demander à un agent à propos de** ce texte, qui ouvre **Demander** à côté de la page avec les mots sélectionnés (jusqu’à 4 000 caractères) et l’adresse de la page prêts à accompagner votre question (voir [Poser une question à côté de la page](/guide/web#ask-beside-the-page)), **Traduire « … »**, qui affiche les mots traduits dans votre langue dans une boîte (voir [Traduire une page](/guide/web#translate-a-page)), et **Surligner**, qui marque les mots sur la page et les conserve (voir [Points forts](/guide/web#highlights)).
- Sur un de vos surlignages : **Retirer le surlignage**.
- Sur la page elle-même, en dehors d’un champ ou d’un texte sélectionné : **Retour**, **Suivant** et **Recharger**, et **Traduire en allemand** (la langue dans laquelle vous traduisez ; **Afficher l’original** quand la page est traduite).
- Toujours : **Ajouter cette page aux favoris**, **Lire cette page plus tard** (sur une page web), **Imprimer…** et **Inspecter**, qui ouvre les outils de développement de la page.

Dans un onglet privé, le menu n’a pas **Ouvrir le lien dans un onglet privé** ; **Ouvrir le lien dans un nouvel onglet** et les autres éléments « dans un nouvel onglet » ouvrent un onglet privé, et aucun des éléments **Demander** (**Demander à un agent à propos de**, **Poser une question sur cette image**) n’y figure, puisque les agents n’ont jamais accès à un onglet privé.

**Enregistrer l’image dans** *un projet* lit l’image avec les connexions propres à l’onglet, si bien qu’une image derrière une connexion fonctionne, et la conserve dans le projet (et le dossier) choisis à côté de **Enregistrer** (dans ses **Fichiers**, avec la page comme lieu d’origine), ou sans projet. Une note indique « Enregistrée dans les fichiers de Thesis » (ou « Image enregistrée »), avec **Ouvrir** (ou « Cette image est déjà enregistrée » quand vous l’aviez déjà conservée). Il accepte les images PNG, JPEG, WebP, GIF et AVIF jusqu’à 50 Mo ; une image bitmap ou une icône devient un PNG, et les autres types, comme SVG, sont refusés. L’image doit avoir une adresse http, https, data ou blob. Les agents peuvent lire ce qu’un projet conserve : ne gardez donc une image à cet endroit que si cela ne vous gêne pas. **Poser une question sur cette image** lit l’image de la même façon et ouvre **Demander** à côté de la page avec l’image prête à accompagner votre question, avec une copie de la page.

Les éléments propres à une extension ne s’affichent jamais (voir [Ce qui peut ne pas fonctionner](/guide/web#what-may-not-work)).

### Onglets privés

Un onglet privé est un onglet qui oublie. Ouvrez-en un avec **Ctrl+Shift+N** (**⇧⌘N** sur un Mac), **Menu** (⋯) → **Nouvel onglet privé**, **Nouvel onglet privé** à la fin de la section **Privé** dans la colonne des onglets, ou [/browser?private=1](/browser?private=1) (ajoutez `&url=https://example.com` pour y ouvrir cette adresse). Sur un lien, clic droit → **Ouvrir le lien dans un onglet privé** ; dans un onglet privé, cet élément n’existe pas, et **Ouvrir le lien dans un nouvel onglet** ouvre un onglet privé (comme les autres éléments « dans un nouvel onglet », **Recherche** pour des mots sélectionnés, et **Alt+Entrée** dans la barre d’adresse).

Un onglet privé se reconnaît ainsi :

- Sa ligne se trouve dans la section violette **Privé** de la colonne des onglets, qui indique combien il y en a. **Fermer les onglets privés** (le × au bout de l’intitulé) les ferme tous.
- Une pastille violette **Privé** se trouve au début de la barre d’adresse. Appuyez dessus pour voir ce qu’est un onglet privé et ce qu’il conserve, avec **Fermer les onglets privés**.

Ce qu’un onglet privé garde à part, et oublie :

- **Les connexions, cookies, données de sites et fichiers en cache** sont conservés en mémoire, séparément de vos autres onglets : un site auquel vous êtes connecté dans un onglet normal ne vous reconnaît pas dans un onglet privé, et inversement. Tout est oublié à la fermeture du dernier onglet privé, ou quand l’app se ferme.
- **Ses pages ne sont pas conservées** dans votre [historique](/guide/web#history), dans la liste **Fermés récemment** (**Ctrl+Shift+T** les ignore), ni parmi les onglets qui se rouvrent au prochain démarrage du navigateur. Les onglets que vous fermez sont perdus pour de bon.
- **Les extensions n’y fonctionnent pas.** Le bloqueur de publicités et le masquage des bannières de cookies fonctionnent comme dans n’importe quel onglet.
- **Les autorisations** qu’un site demande (caméra, position et autres) sont redemandées à chaque fois, et votre réponse est oubliée à la fermeture de l’onglet. Un site que vous avez bloqué dans vos onglets normaux reste bloqué.
- **Les téléchargements sont enregistrés** dans votre dossier Téléchargements, mais ils ne sont pas ajoutés à la liste des téléchargements que la zone de recherche (Ctrl+K) trouve.
- Ce que vous demandez explicitement reste conservé : les **favoris**, **Lire plus tard**, les **points forts** et **Enregistrer** (dans un projet). Ils restent après la disparition de l’onglet privé et montrent la page ; ne les demandez donc que si cela ne vous gêne pas.
- **La traduction** fonctionne dans un onglet privé comme dans n’importe quel onglet : les mots de la page vont donc au modèle d’appoint (voir [Traduire une page](/guide/web#translate-a-page)) ; ne traduisez pas une page privée si cela compte pour vous.
- Un onglet privé ne peut pas être mis dans un groupe, et **Regrouper mes onglets avec l’IA** ne le compte ni ne l’envoie jamais.
- **Les agents n’ont jamais accès à un onglet privé.** **Demander** est grisé, la ligne **Poser une question sur cette page** (ou **Le faire sur cette page**) de la barre d’adresse et les éléments **Demander à un agent à propos de** et **Poser une question sur cette image** du menu du clic droit n’y figurent pas, et le serveur refuse de copier sa page pour un agent (voir [Confier une page à un agent](/guide/web#hand-a-page-to-an-agent)).

Fermer le dernier onglet normal alors que des onglets privés sont ouverts ne laisse que les onglets privés ; sinon, votre navigateur garde toujours un onglet ouvert. Les onglets privés concernent la trace conservée sur cet ordinateur : les sites que vous visitez, votre fournisseur d’accès et votre réseau peuvent toujours voir où vous allez, et un site auquel vous vous connectez sait qui vous êtes.

### Traduire une page

Quand une page est dans une autre langue que celle que vous lisez, un bouton de traduction (une petite icône **Langues**) s’affiche à droite de la barre d’adresse. Il est allumé quand la page est traduite, et pulse pendant que la traduction est en cours. Appuyez dessus :

- Il indique la langue détectée pour la page (« Détectée : allemand »), que l’app détermine sur cet ordinateur à partir des mots de la page et de sa propre balise de langue.
- **Traduire en** est la langue vers laquelle traduire. C’est d’abord la langue de l’app ; en choisir une autre la conserve comme votre choix (c’est aussi **Traduire en** dans les [Paramètres du navigateur](/guide/web#browser-settings)), et une page déjà traduite est traduite de nouveau dans cette langue.
- **Traduire** lance la traduction. Pendant qu’elle s’exécute, la ligne en dessous indique « Traduction en cours… 12 parties sur 40 », et le bouton devient **Afficher l’original**, qui remet chaque mot de la page tel qu’il était. Une fois terminée, la ligne indique de quelle langue la page a été traduite et avec quel modèle. En cas d’échec, la ligne en donne la raison et le bouton affiche **Réessayer**.
- **Toujours traduire l’allemand** (pour la langue détectée) traduit les pages dans cette langue dès leur chargement, à partir de là. **Ne jamais traduire l’allemand** empêche le bouton de s’afficher pour cette langue. **Ne jamais traduire example.com** (le site de la page) fait de même pour ce site, quelle que soit sa langue.
- **Paramètres de traduction** ouvre les [Paramètres du navigateur](/guide/web#browser-settings) à la section **Traduction**.

Ce qui est à l’écran est traduit en premier, puis le reste de la page, puis tout ce qui arrive ensuite, quand vous faites défiler la page ou qu’elle se modifie d’elle-même, de sorte qu’elle reste dans votre langue. La mise en page, les liens et les images de la page restent tels quels : seuls ses mots changent, sur place. Les champs de texte, le code et les parties qu’un site marque comme à ne pas traduire sont laissés de côté. Une page très longue est traduite jusqu’à environ 150 000 caractères au-delà de ce qui est à l’écran.

Vous pouvez aussi utiliser **Menu** (⋯) → **Traduire la page…** (**Afficher l’original** quand elle est traduite), qui ouvre la même boîte sous le menu quand le bouton n’est pas affiché, par exemple pour une page déjà dans votre langue. Faites un clic droit sur la page, en dehors d’un lien, d’une image ou de mots sélectionnés, et choisissez **Traduire en allemand** (la langue dans laquelle vous traduisez) ou, quand elle est traduite, **Afficher l’original**. Sélectionnez des mots, faites un clic droit et choisissez **Traduire « … »** pour traduire seulement ceux-ci (jusqu’à 5 000 caractères) : une boîte **Traduction** les affiche avec leur traduction, un choix **Traduire en** pour essayer une autre langue, et **Copier**.

Les noms des langues, dans le bouton et les listes, sont dans la langue de l’app, avec le nom propre de chaque langue à côté.

**Ce qui est envoyé, et à quel modèle.** La traduction envoie les mots de la page, par morceaux, au modèle d’appoint de l’app, celui qui écrit les titres des sessions et les notes de mémoire ([Paramètres → Agents → Modèles → Modèle d’appoint](/settings?s=models&find=Helper%20model)) ; les mots que vous sélectionnez pour les traduire y vont aussi. Sur Automatique, il s’agit de Claude Haiku via Claude Code, sinon de Codex, tous deux en ligne ; un modèle à vous sur cet ordinateur garde les mots ici. Les images et les connexions ne sont jamais envoyées. Cela se produit quand vous appuyez sur **Traduire** ou sur les éléments de menu, et, pour une langue réglée sur **Toujours traduire**, automatiquement à chaque chargement de page : si une page contient des mots que vous voulez garder privés, ne la traduisez pas (ou mettez un modèle sur cet ordinateur comme modèle d’appoint). Les agents n’en voient rien, et leurs requêtes vers ces routes sont refusées.

Une page traduite s’affiche aussi traduite dans le [mode lecture](/guide/web#reader-view).

### Mode lecture

Sur une page qui contient un article, comme un article d’actualité, un billet de blog ou une recette, un bouton en forme de livre (**Mode lecture**) s’affiche à droite de la barre d’adresse. Appuyez dessus et l’article s’affiche seul par-dessus la page, dans une colonne épurée : le site, le titre, l’auteur, le temps de lecture (« 5 min de lecture ») et la date, puis le texte avec ses images, sans les menus, publicités et commentaires du site. Appuyez de nouveau sur le bouton (**Quitter le mode lecture**) pour revenir à la page, ou choisissez **Menu** (⋯) → **Mode lecture**, coché tant qu’il est activé. Ouvrir un lien dans ce mode le quitte, comme le fait l’accès à n’importe quelle autre page. Une page sans article à afficher n’a pas de bouton (et l’élément de menu est grisé ; si une page se révèle ne pas en avoir, une note indique « Cette page n’a pas d’article à afficher en mode lecture »).

Quand le mode lecture est activé, **Aa** (**Style du mode lecture**) ouvre les réglages de l’apparence de l’article :

- **Taille du texte**, avec **Texte plus petit** et **Texte plus grand** : de 14 à 28 (19 au départ).
- **Couleurs** : **Automatique** (suit l’apparence claire ou sombre de l’app), **Sombre**, **Clair** ou **Sépia**.
- **Police** : **Avec empattement** ou **Sans empattement**.

Un changement s’applique tout de suite et est conservé pour tous les articles. Les touches fléchées, **Page Down** et **Espace** font défiler l’article. Rien ne quitte l’onglet pour le produire : la page est lue sur place, sans aucun agent ni modèle.

### Pages sombres

**Menu** (⋯) → **Pages sombres** (coché tant qu’il est activé), ou **Pages sombres** dans les [Paramètres du navigateur](/guide/web#browser-settings), affiche les pages web en sombre. Un site qui a sa propre apparence sombre l’utilise, comme quand votre ordinateur est réglé en sombre ; une page qui n’en a pas est assombrie par le mode sombre automatique du navigateur, si bien que ses arrière-plans clairs deviennent sombres et son texte clair. Il est désactivé au départ, s’applique à tous les onglets à la fois et ne touche pas aux navigateurs des agents.

Certaines pages sont étranges une fois assombries (images, graphiques, couleurs qui avaient un sens). Pour afficher un site tel quel, cliquez sur son cadenas et désactivez **Pages sombres sur ce site** (le commutateur s’y trouve tant que Pages sombres est activé). Ces sites sont listés sous **Sites affichés tels quels** dans les paramètres du navigateur, où le × à côté de l’un d’eux l’affiche de nouveau en sombre.

### Lire plus tard

Mettez une page de côté pour plus tard : ouvrez **Menu** (⋯) → **Lire plus tard** et appuyez sur **Ajouter cette page** en haut du panneau, ou faites un clic droit sur la page et choisissez **Lire cette page plus tard**, ou faites un clic droit sur un lien et choisissez **Lire le lien plus tard**. Une note indique « Ajoutée à Lire plus tard » ; une page déjà dans la liste repasse en attente, tout en haut. Tant que la page où vous êtes attend dans la liste, le bouton du panneau affiche **Dans votre liste**. Seules les pages web (http et https) peuvent être mises de côté.

La liste s’affiche à deux endroits : dans la colonne des onglets, sous le nom **Lire plus tard** (voir [La colonne des onglets](/guide/web#the-tab-column)), et dans un panneau dédié de la colonne à côté de la page : **Menu** (⋯) → **Lire plus tard** (le menu indique combien de pages attendent), ou rendez-vous sur [Lire plus tard](/browser?panel=later). Sous son titre, le panneau comporte une zone de saisie, **Rechercher dans votre liste À lire plus tard**, qui réduit la liste aux pages dont le titre ou l’adresse contiennent vos mots. Les plus récentes en premier, chaque ligne affiche l’icône du site, le titre de la page et, en dessous, le site ainsi que la date à laquelle vous l’avez ajoutée (« Ajoutée aujourd’hui ») ou marquée comme lue. Cliquez sur une ligne, ou sur **Ouvrir**, pour ouvrir la page dans un nouvel onglet. **Marquer comme lu** la retire de la liste ; **Afficher les lus** (visible dès que vous en avez lu une) fait réapparaître les pages que vous avez lues, où **Marquer comme non lu** en remet une en attente, et **Masquer les lus** les range de nouveau. **Retirer** l’oublie. Quand rien n’est mis de côté, le panneau indique « Rien n’est mis de côté pour plus tard ».

Comme vos favoris, la liste est à vous seul : les agents ne la voient jamais, et les routes qui la fournissent leur sont refusées.

### Historique

Appuyez sur **Ctrl+H**, ou sur **Menu** (⋯) → **Historique**, ou rendez-vous sur [Historique](/browser?panel=history). Le panneau liste les pages que vous avez consultées dans votre propre navigateur, les plus récentes en premier, par jour (« Aujourd’hui », « Hier », puis la date), chacune avec son heure, l’icône du site, son titre et son adresse.

- La zone de recherche, **Rechercher dans votre historique**, trouve des pages d’après les mots de leurs titres et de leurs adresses.
- Cliquez sur une page pour l’ouvrir dans l’onglet actif, ou faites Ctrl+clic (⌘+clic sur Mac) pour l’ouvrir dans un nouvel onglet. Le bouton **×** à côté d’une page la retire de l’historique. **Afficher les plus anciens** en charge davantage.
- **Fermés récemment** (quand vous ne faites pas de recherche) liste les onglets que vous avez fermés récemment : cliquez sur l’un d’eux pour le rouvrir. **Ctrl+Shift+T** rouvre le plus récent.
- **Effacer les données de navigation…** ouvre les paramètres à cet endroit.

Votre historique reste sur cet ordinateur, dans la base de données propre à l’app, et seule votre propre navigation l’alimente : pages web et fichiers, la page sur laquelle chaque onglet aboutit, son titre une fois stabilisé. Les pages des [onglets privés](/guide/web#private-tabs) ne sont jamais ajoutées, et un onglet privé que vous fermez n’apparaît pas dans **Fermés récemment**. Les 20 000 dernières pages sont conservées ; les plus anciennes disparaissent en premier. Les agents ne le voient jamais. C’est sur lui que s’appuient les [suggestions](/guide/web#suggestions) de la barre d’adresse.

Pour importer l’historique de vos autres navigateurs, utilisez **Importer** en bas du panneau (le bouton s’affiche quand vous ne faites pas de recherche), comme dans le panneau des favoris. Il liste les navigateurs de cet ordinateur qui ont un historique, les mêmes que pour les [favoris](/guide/web#bring-in-bookmarks), avec une ligne par profil quand un navigateur en a plusieurs, chacune indiquant combien de pages seraient importées (« 8 931 pages »). Appuyez sur **Importer** et les 20 000 pages les plus récentes arrivent : chacune conserve son titre, la date de votre dernière visite, sa fréquentation et le nombre de fois où vous avez saisi son adresse, de sorte que les [suggestions](/guide/web#suggestions) de la barre d’adresse les classent comme le faisait ce navigateur. Pour les pages que vous avez déjà, la visite la plus récente et les compteurs les plus élevés sont conservés ; réimporter n’ajoute donc rien en double. Votre historique ne garde toujours que les 20 000 dernières pages, les plus anciennes partant en premier, et tout reste sur cet ordinateur : les agents ne le voient jamais. Une note indique « 8 931 pages importées » une fois l’opération terminée (ou « Votre historique contient déjà tout »), et le panneau affiche « Aucun autre navigateur avec un historique n’a été trouvé sur cet ordinateur. » quand il n’y a rien à importer.

Un navigateur qui verrouille son historique tant qu’il est ouvert affiche « Fermez Google Chrome, puis réessayez : il verrouille son historique tant qu’il est ouvert » ; fermez-le et appuyez de nouveau sur **Importer**. Firefox peut rester ouvert. Safari conserve son historique là où macOS le protège, comme pour ses favoris : tant que vous ne l’avez pas autorisé, sa ligne indique « Hydor ne peut pas lire l’historique de Safari : autorisez-le dans Réglages Système → Confidentialité et sécurité → Accès complet au disque ». Sa ligne affiche **Ouvrir les Réglages Système** à la place de **Importer** : il ouvre Réglages Système → Confidentialité et sécurité → Accès complet au disque, où vous activez Hydor (ajoutez-le avec **+** s’il n’est pas listé). Quand vous revenez dans Hydor, il vérifie de nouveau, et le nombre de pages de Safari ainsi que **Importer** s’affichent. Si Safari reste illisible, la ligne ajoute « Autorisé ? macOS peut demander de rouvrir Hydor d’abord : quittez Hydor et rouvrez-le. »

Les fichiers que votre navigateur télécharge sont aussi conservés dans une liste : le nom de chacun, l’endroit où il a été enregistré et l’adresse d’où il vient, les 5 000 derniers. **Effacer les données de navigation** avec **Historique de navigation** coché efface aussi cette liste, pour la même période (les fichiers restent là où ils ont été enregistrés), et une page, un favori ou un téléchargement qui disparaît quitte avec elle la Recherche par le sens. La zone de recherche (Ctrl+K) trouve votre historique, vos favoris et vos téléchargements, d’après leurs mots et d’après leur sujet, sous **Navigateur** dans **Rechercher dans** (voir [Tout rechercher avec Ctrl+K](/guide/start#search-everything-with-ctrlk)). Les agents ne voient rien de tout cela.

### Points forts

Marquez des mots sur une page et ils restent marqués. Sélectionnez quelques mots, faites un clic droit et choisissez **Surligner** : ils sont aussitôt marqués, d’un jaune doux qui reste lisible sur les pages sombres, et conservés. Chaque fois que vous rouvrez cette page, les mots sont retrouvés et marqués, puis de nouveau un instant plus tard pour une page qui construit son contenu après le chargement. Faites un clic droit dans un surlignage et choisissez **Retirer le surlignage** pour l’enlever. Les mots de la page ne sont pas modifiés, seulement enveloppés : copier du texte d’une page donne donc les mêmes mots.

- Une page reste la même page quoi qu’il y ait après son adresse : un `#fragment` ou des paramètres de suivi (`utm_…`, `fbclid` et autres) ne comptent pas, et `http`, `https` et `www.` comptent pour un seul. Chaque surlignage conserve ses mots, un peu du texte avant et après (pour retrouver le bon endroit quand les mêmes mots reviennent deux fois), le titre de la page, la date à laquelle vous l’avez fait et, si vous en ajoutez une, une note.
- Une page qui contient des surlignages affiche une petite marque jaune sur **Menu** (⋯), et **Menu** (⋯) → **Points forts** indique leur nombre. Cela ouvre la colonne à côté de la page avec les surlignages de cette page, ou rendez-vous sur [Points forts](/browser?panel=highlights). **Afficher sur la page** fait défiler jusqu’à l’un d’eux, **Copier** copie ses mots, **Ajouter une note** (ou **Modifier la note**) écrit une note qui s’affiche quand vous pointez le surlignage sur la page, et **Supprimer** l’enlève. **Interroger un agent à leur sujet** démarre une session avec l’adresse de la page et ses surlignages cités, avec vos notes.
- Les mots introuvables (la page a changé) restent dans la liste et ne sont simplement pas marqués. Un surlignage peut contenir jusqu’à 5 000 caractères et une page jusqu’à 500 surlignages. Les mots d’un champ de texte et les parties masquées d’une page ne sont pas marqués. Ceux d’un cadre inclus dans la page (une autre page qui y est affichée) non plus : le menu n’y propose pas **Surligner**. Les mots à l’intérieur des composants propres à une page sont marqués comme les autres.

Vos surlignages restent sur cet ordinateur, dans la base de données propre à l’app, et les agents ne les voient jamais : les routes qui les concernent leur sont refusées. Ils ne parviennent à un agent que lorsque vous appuyez sur **Interroger un agent à leur sujet**, et seuls l’adresse de cette page et ses surlignages sont alors transmis.

### Paramètres du navigateur

**Menu** (⋯) → **Paramètres**, ou [Paramètres → Navigateur → Votre propre navigation → Paramètres du navigateur](/settings?s=browser&find=Browser%20settings), ou [Paramètres du navigateur](/browser?panel=settings), ouvre un panneau avec :

- **Page d’accueil** : l’adresse web qu’ouvrent le bouton Accueil et les nouveaux onglets (https://www.google.com/ au départ). **Utiliser la page actuelle** la définit sur la page où vous êtes.
- **Moteur de recherche** : ce qu’utilise la barre d’adresse pour chercher : Google (au départ), DuckDuckGo, Bing, Brave, Ecosia, Startpage, ou **Custom**, une adresse de votre choix avec %s à l’endroit où vont vos mots, par exemple `https://example.com/search?q=%s`.
- **Raccourcis de recherche** : saisissez un raccourci, une espace et vos mots dans la barre d’adresse pour chercher sur ce site. Les raccourcis habituels sont `yt` (YouTube), `wiki` (Wikipédia), `gh` (GitHub), `scholar` (Google Scholar), `arxiv` (arXiv) et `hf` (Hugging Face). Le × sur l’un d’eux le retire. **Ajouter un raccourci** demande un **Raccourci** (un seul mot), un **Nom** et une **Adresse, avec %s à l’endroit où vont vos mots**, puis **Ajouter** (ou **Annuler**) ; il peut y en avoir 50. **Remettre les raccourcis habituels** s’affiche dès que vous avez modifié la liste. Dans la barre d’adresse, `yt lofi` propose d’abord « Rechercher « lofi » sur YouTube », et **Entrée** lance la recherche ; la ligne de ce que vous avez saisi (« Rechercher avec Google ») cherche toujours tous les mots avec votre moteur.
- **Suggestions de recherche** (activées au départ) : ce que vous saisissez dans la barre d’adresse est envoyé à votre moteur de recherche au fil de la frappe, comme dans tout navigateur, afin qu’il puisse suggérer des recherches. Startpage et une adresse personnalisée n’en donnent aucune. Désactivez cette option pour garder ce que vous saisissez sur cet ordinateur ; vos onglets ouverts, vos favoris et votre historique restent affichés.
- **Publicités** (voir [Bloquer les publicités et les traqueurs](/guide/web#block-ads-and-trackers)) :
  - **Bloquer les publicités et les traqueurs** (activé au départ).
  - **Masquer les bandeaux de cookies** (activé au départ ; il faut que **Bloquer les publicités et les traqueurs** soit activé, sans quoi l’option est grisée).
  - **Listes de filtres** : EasyList, EasyPrivacy, les listes d’uBlock Origin, la liste de Peter Lowe et l’Online Malicious URL Blocklist, tenues à jour. La ligne indique quand elles ont été mises à jour et combien de règles compte le bloqueur (« Mises à jour il y a 2 heures · 307 000 règles »), et **Mettre à jour maintenant** les récupère aussitôt.
  - **Listes pour les sites dans d’autres langues** : au départ, la liste de la langue de l’app (EasyList Germany quand l’app est en allemand, AdGuard Japanese en japonais ; aucune pour l’anglais). **Ajouter une langue** ajoute une autre liste, parmi une vingtaine de langues, et le × sur l’une d’elles la retire.
  - **Blocage renforcé** (désactivé au départ) : ajoute la liste de publicités d’AdGuard. Elle attrape plus de publicités, mais quelques sites peuvent demander que les publicités soient autorisées.
  - **Masquer les nuisances** (désactivé au départ) : ajoute la liste des nuisances d’uBlock Origin, qui masque les fenêtres surgissantes, les encarts d’infolettre, les widgets de discussion et de réseaux sociaux et les bandeaux « ouvrir dans l’app ». Certains sites peuvent ne pas fonctionner comme il faut.
  - **Sites où les publicités sont autorisées** : les sites que vous avez autorisés depuis le bouclier, chacun avec un × pour bloquer de nouveau ses publicités. Cette section ne s’affiche que s’il y en a.
  - **Statistiques** : combien de publicités et de traqueurs ont été bloqués et depuis quand, et **Afficher** ouvre les statistiques.
- **Traduction**, pour [traduire des pages](/guide/web#translate-a-page) :
  - **Traduire en** : la langue dans laquelle les pages sont traduites. C’est la langue de l’app tant que vous n’en choisissez pas une autre.
  - **Proposer de traduire les pages dans d’autres langues** (activé au départ) : affiche le bouton de traduction dans la barre d’adresse sur une page dans une autre langue. Désactivé, le bouton ne s’affiche que sur une page déjà traduite ; **Menu** (⋯) → **Traduire la page…** fonctionne toujours.
  - **Toujours traduire** : les langues dont les pages sont traduites dès leur chargement. **Ajouter une langue** en choisit une ; le × sur une langue la retire.
  - **Ne jamais traduire** : les langues pour lesquelles le bouton n’est jamais affiché. Une langue figure dans l’une de ces deux listes au plus.
  - **Ne jamais traduire ces sites** : les sites pour lesquels le bouton n’est jamais affiché et qui ne sont jamais traduits automatiquement (« Aucun site » tant que vous n’en ajoutez pas avec **Ne jamais traduire** dans la fenêtre de traduction) ; le × sur un site le retire.
  - Une note précise ce que la traduction envoie et à quel modèle.
- **Pages** :
  - **Zoom des pages** (100 % au départ ; de 50 % à 200 %) : la taille des pages, sauf si vous zoomez vous-même sur un site. Un site que vous zoomez vous-même (Ctrl avec + ou −, Ctrl et la molette, le **Zoom** du menu) garde son zoom tant que l’app tourne ; **Réinitialiser** (Ctrl+0, le pourcentage du menu, la pastille de la barre d’adresse) le remet au zoom des pages (voir [Zoom, impression et plein écran](/guide/web#zoom-print-and-full-screen)).
  - **Vérifier l’orthographe** (activé au départ) : souligne les mots mal orthographiés pendant la saisie, avec des suggestions dans le menu du clic droit.
  - **Pages sombres** (désactivé au départ) : les pages sans apparence sombre propre s’affichent dans des couleurs sombres (voir [Pages sombres](/guide/web#dark-pages)).
  - **Sites affichés tels quels** : les sites pour lesquels vous avez désactivé **Pages sombres sur ce site**, avec un × pour en afficher de nouveau un en sombre.
  - **Laisser les sites émettre du son d’eux-mêmes** (désactivé au départ) : désactivé, le son d’une page attend que vous cliquiez ou saisissiez du texte dedans, tandis que les vidéos sans son sont lues normalement ; activé, une page peut lancer son son aussitôt, comme dans les anciens navigateurs. Cela s’applique aux onglets ouverts après la modification.
- **Effacer les données de navigation** : cochez **Historique de navigation**, **Cookies et données de sites** (vous êtes déconnecté des sites) et **Fichiers en cache**, choisissez une période (**Dernière heure**, **Dernières 24 heures**, **7 derniers jours** ou **Depuis toujours**) et appuyez sur **Effacer les données**. La période ne concerne que l’historique (et la liste des téléchargements conservée avec lui) : les cookies, les données de sites et les fichiers en cache sont toujours effacés pour toute la durée.

### Bloquer les publicités et les traqueurs

Votre propre navigateur bloque les publicités et les traqueurs, comme le fait un bloqueur de publicités. Il arrête les requêtes vers les serveurs de publicité et de suivi, masque les emplacements vides qu’elles laissent et les encadrés signalés comme sponsorisés (y compris avec les règles avancées d’uBlock Origin, celles qui repèrent une publicité à ses mots ou à sa forme), et fournit à une page des substituts inoffensifs pour les scripts publicitaires qu’il bloque, afin qu’une page qui vérifie leur présence continue de fonctionner. Il exécute aussi les petits correctifs de pages d’uBlock Origin dans chaque cadre de la page, avant les scripts propres à la page : c’est ce qui supprime les publicités vidéo de YouTube et désamorce de nombreux messages du type « désactivez votre bloqueur de publicités ». Il ne bloque rien dans les navigateurs des agents, et fonctionne dans les onglets privés. **Bloquer les publicités et les traqueurs** dans les [paramètres du navigateur](/guide/web#browser-settings) le désactive.

Ses listes sont celles décrites sous **Listes de filtres** dans ces paramètres. L’app les récupère auprès de leurs auteurs au premier démarrage de votre navigateur, puis récupère chacune de nouveau quand elle indique qu’elle expire : les correctifs rapides d’uBlock Origin, où se trouvent ses correctifs pour YouTube, environ toutes les 8 heures, et les autres tous les quelques jours ; **Mettre à jour maintenant** le fait immédiatement. Lorsqu’une liste ne peut pas être récupérée, le bloqueur garde celle qu’il possède. Seules les requêtes pour les listes sont envoyées, et rien sur vous ni sur les pages que vous visitez ne les accompagne. Les listes supplémentaires (**Listes pour les sites dans d’autres langues**, **Blocage renforcé** et **Masquer les nuisances**) sont à activer par vous dans les mêmes paramètres.

**Le bouclier.** Sur une page web, un bouclier dans la barre d’adresse indique combien de publicités et de traqueurs y ont été bloqués. Cliquez dessus pour voir :

- le décompte, réparti entre publicités et traqueurs, et les hôtes qui ont été bloqués, chacun marqué **Publicité** ou **Suivi** (googleads.g.doubleclick.net, par exemple) ;
- ce qui a été bloqué au total sur ce site, depuis que le bloqueur a commencé à compter ;
- **Bloquer les publicités sur ce site**, un interrupteur. Désactivé, il autorise les publicités sur ce site et ses sous-domaines, et la page se recharge ; réactivé, il les bloque de nouveau et recharge la page. Utilisez-le quand un site remarque encore le bloqueur, ou que quelque chose y dysfonctionne ;
- **Statistiques**, qui ouvre les [statistiques du bloqueur de publicités](/browser?panel=adblock), et **Paramètres**, qui ouvre la partie **Publicités** des [paramètres du navigateur](/guide/web#browser-settings).

Lorsque le bloqueur est désactivé, l’encadré du bouclier indique **Le bloqueur de publicités est désactivé**, avec **Activer**, qui l’active et recharge la page.

**Statistiques.** [Bloqueur de publicités](/browser?panel=adblock) (depuis **Statistiques** dans le bouclier, ou **Paramètres du navigateur** → **Publicités** → **Statistiques.** → **Afficher**) affiche **Bloqué**, **Publicités**, **Suivis** et **Données économisées** (une estimation, d’après la taille habituelle de ce qui a été bloqué), la date depuis laquelle il compte, un graphique des 30 derniers jours, **Les plus bloqués** (les hôtes) et **Sites avec le plus d’éléments bloqués**. **Réinitialiser les statistiques** les efface et recommence le décompte. Elles restent sur cet ordinateur, dans les données propres à l’app de bureau, et les agents ne peuvent pas les lire. Un onglet privé compte dans les totaux mais ne laisse aucun hôte ni site, et **Effacer les données de navigation** avec **Historique de navigation** coché fait aussi oublier les sites aux statistiques.

Lorsque le bloqueur est activé, vos extensions Chrome voient toujours les requêtes de la page, mais une extension qui bloque ou modifie les requêtes (un bloqueur de publicités à vous) ne les bloque pas ; désactivez le bloqueur pour lui laisser la page.

**Masquer les bandeaux de cookies** (activé au départ, dans les paramètres du navigateur, et seulement tant que le bloqueur est activé) masque aussi les avis sur les cookies que beaucoup de sites affichent, grâce à la liste d’EasyList ajoutée aux listes ci-dessus. Il masque un avis sans y répondre à votre place : un site qui attend votre réponse peut donc retenir une partie de son contenu. Autorisez les publicités sur ce site depuis son bouclier pour revoir son avis.

### Le cadenas

Le cadenas au début de la barre d’adresse indique si la connexion au site est sécurisée (« Non sécurisé », avec un cadenas ouvert, pour une page http). Cliquez dessus pour voir le site, si sa connexion est sécurisée, et ce que vous avez autorisé ou bloqué pour lui (chaque élément avec **Oublier**, afin qu’il soit redemandé). Les publicités et les traqueurs bloqués sur la page se trouvent dans le bouclier, à droite de la barre d’adresse (voir [Bloquer les publicités et les traqueurs](/guide/web#block-ads-and-trackers)). Sur une page web, il propose aussi :

- **Pages sombres sur ce site**, un interrupteur qui s’affiche quand les [pages sombres](/guide/web#dark-pages) sont activées : désactivez-le pour afficher ce site tel quel.
- **Cookies et données de sites**, avec **Supprimer**. Il demande d’abord confirmation (« Supprimer les cookies et les données de site de example.com ? Vous en serez déconnecté. ») ; appuyer sur **Supprimer** retire les cookies et les données de site stockées de ce site, ainsi que de ses sous-domaines (pour `mail.example.com`, ceux de example.com), parmi les connexions propres à cet onglet (celles d’un onglet privé lui sont propres), et recharge la page. Une note indique ce qui a été supprimé. Les fichiers en cache restent : **Effacer les données de navigation** dans les paramètres du navigateur les efface, ainsi que tout ce qui concerne tous les sites.

### Téléchargements

Un fichier téléchargé par une page est enregistré dans le dossier Téléchargements de l’ordinateur où l’app s’exécute, et apparaît sous **Menu** (⋯) → **Téléchargements** avec la mention « Téléchargement en cours… », « Terminé » ou « Échec », accompagnée de son chemin. Un téléchargement depuis un onglet privé est enregistré de la même façon et s’affiche ici, mais il n’est pas ajouté à la liste que trouve la zone de recherche (Ctrl+K). Cliquez sur un fichier terminé pour le voir dans son dossier : l’app de bureau ouvre le gestionnaire de fichiers du système avec le fichier sélectionné (**Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier**\u00a0; voir [Travailler avec les fichiers et les dossiers](/guide/files-git#work-with-files-and-folders)).

### Quand un site demande une autorisation

Quand une page de votre propre navigateur demande à utiliser votre caméra, votre microphone, votre position, les notifications, votre presse-papiers ou autre chose du même genre, une barre au-dessus de la page l’indique (« example.com souhaite utiliser votre caméra ») avec **Ne pas autoriser** et **Autoriser**. Votre réponse est mémorisée pour ce site, qui ne demande donc qu’une seule fois\u00a0; pour voir ce que vous avez autorisé ou bloqué, ou pour qu’on vous redemande, ouvrez le cadenas, ou **Menu** (⋯) → **Autorisations des sites**, puis appuyez sur **Oublier** à côté d’une réponse. Les navigateurs des agents refusent eux-mêmes toutes ces demandes, sauf pour remplir l’écran et pour copier dans votre presse-papiers. Dans un onglet privé, la barre demande à chaque fois\u00a0: votre réponse est oubliée à la fermeture de l’onglet, et une autorisation donnée dans un onglet normal n’est pas reprise (un site que vous avez bloqué reste bloqué). La question en fenêtre contextuelle d’une page (une alerte, une question oui ou non ou une saisie de texte) s’affiche au-dessus de la page, comme dans le navigateur des agents (voir [Répondre aux questions en fenêtre contextuelle d’une page](/guide/web#answer-a-pages-pop-up-questions)).

## Favoris

Les sites de la barre de favoris sont épinglés en haut de la colonne des onglets dès que vous avez un favori dessus (sur un téléphone, il n’y a pas de colonne des onglets\u00a0; vos favoris se trouvent dans le menu). Cliquez sur l’un d’eux pour l’ouvrir dans l’onglet actif\u00a0; Ctrl+clic (⌘+clic sur un Mac) ou un clic central l’ouvre dans un nouvel onglet. Un dossier ouvre la liste de son contenu, et dix vignettes sont le maximum affiché (une vignette **…** liste le reste). Faites un clic droit sur une vignette pour **Ouvrir**, **Ouvrir dans un nouvel onglet**, **Modifier** (**Renommer** pour un dossier) et **Supprimer**.

Pour les voir tous, appuyez sur **Menu** (⋯) → **Favoris**, ou allez sur [Favoris](/browser?panel=bookmarks). Le panneau comporte deux emplacements, **Barre de favoris** et **Autres favoris**, et les dossiers qu’ils contiennent s’ouvrent et se ferment&nbsp;; chacun reste tel que vous l’avez laissé la prochaine fois que vous ouvrez le panneau.

- **Rechercher dans vos favoris** (la zone en haut) trouve un favori grâce à ses mots (voir [Rechercher dans vos favoris](/guide/web#search-your-bookmarks)).
- **Nouveau dossier** (en haut) ajoute un dossier à la barre et demande son nom.
- **Organiser avec l’IA** (le bouton d’étincelles en haut, à côté de **Nouveau dossier**) range vos favoris dans des dossiers par thème (voir [Organiser avec l’IA](/guide/web#organize-with-ai)).
- Pointez une ligne pour afficher **Monter**, **Descendre**, **Modifier** (**Renommer** pour un dossier) et **Supprimer**. Vous pouvez aussi faire glisser une ligne\u00a0: sur le milieu d’un dossier pour la placer dedans, ou entre deux lignes pour la placer à cet endroit. Un dossier ne peut pas être placé dans lui-même. La suppression d’un dossier demande d’abord confirmation, et supprime aussi son contenu.
- L’adresse d’un favori commence par http://, https://, file:// ou chrome-extension://. Vous pouvez en conserver jusqu’à 20 000.

### Rechercher dans vos favoris

En haut du panneau, la zone **Rechercher dans vos favoris** trouve les favoris à partir de chaque mot que vous saisissez, dans leurs noms et leurs adresses (les majuscules et les accents n’ont pas d’importance), et les dossiers à partir de leurs noms. Tant que la zone contient des mots, le panneau affiche **Dossiers** (jusqu’à 20) et **Favoris** (jusqu’à 200) à la place des dossiers, et chaque favori indique son site et son emplacement, par exemple « Barre de favoris › Importés de Chrome › Recherche ».

- Cliquez sur un dossier pour le voir parmi vos dossiers\u00a0: la recherche s’efface et le dossier s’ouvre.
- Cliquez sur un favori pour l’ouvrir\u00a0; Ctrl+clic (⌘+clic sur un Mac) l’ouvre dans un nouvel onglet.
- Pointez un favori pour afficher **Afficher dans le dossier**, **Modifier** et **Supprimer**.
- **Entrée** ouvre le premier favori trouvé, et **Esc** efface la recherche.

### Organiser avec l’IA

Quand vous avez beaucoup de favoris, le bouton d’étincelles **Organiser avec l’IA** en haut du panneau, à côté de **Nouveau dossier**, les range dans des dossiers par thème. Vous pouvez aussi chercher « Organiser les favoris avec l’IA » dans la zone de recherche (Ctrl+K), ou aller sur [Organiser avec l’IA](/browser?panel=bookmarks&organize=1). Cela ouvre **Organiser vos favoris avec l’IA**, où vous choisissez la méthode\u00a0:

- **Garder mes dossiers** (choisi au départ)\u00a0: vos dossiers, et les favoris qu’ils contiennent, restent tels quels. Les favoris isolés vont dans le dossier qui convient\u00a0: l’un des vôtres ou un nouveau. Isolé signifie placé dans **Autres favoris** lui-même, ou dans un dossier qui ne fait que rassembler des favoris, comme le dossier « Importés de Chrome » d’un import et les dossiers « Autres favoris » ou « Favoris mobiles » qu’il contient (le modèle d’appoint les distingue des dossiers qui sont les vôtres, dans toutes les langues). Un dossier de rassemblement que le tri vide est retiré (un dossier déjà vide reste en place)\u00a0; aucun autre dossier n’est retiré, renommé ou déplacé. Les nouveaux dossiers sont placés à la fin de **Autres favoris**, ou dans l’un de vos dossiers.
- **Recommencer**\u00a0: chaque favori est placé dans de nouveaux dossiers par thème, dans **Autres favoris**, et vos anciens dossiers sont retirés. Les nouveaux dossiers viennent en premier dans **Autres favoris**, classés par nom, avec au plus un niveau de sous-dossiers\u00a0; un dossier qui contient encore un favori que le modèle n’a pas su placer reste en place.

Dans les deux cas, les sites épinglés sur votre barre de favoris (les liens propres à la barre) restent où ils sont.

**Ce qui est envoyé, et à quel modèle.** Uniquement quand vous appuyez sur **Organiser**, les titres et les adresses de vos favoris (sans ce qui suit un **?** ou un **#**) et les noms de vos dossiers sont envoyés au modèle d’appoint de l’app, celui qui rédige les titres des sessions et les notes de mémoire ([Paramètres → Agents → Modèles → Modèle d’appoint](/settings?s=models&find=Helper%20model)). En mode Automatique, c’est Claude Haiku via Claude Code\u00a0; un modèle de votre choix sur cet ordinateur les garde ici. Rien n’est envoyé à un autre moment. Si le titre d’un favori est confidentiel, n’appuyez pas dessus (ou installez un modèle sur cet ordinateur comme modèle d’appoint).

Cela se fait en deux étapes\u00a0: l’IA détermine d’abord les dossiers, puis y range les favoris, 150 à la fois\u00a0; quelques centaines de favoris prennent une minute ou deux. Pendant le travail, le haut du panneau indique « Détermination des dossiers… », puis « Tri de vos favoris… 150 sur 412 » avec une barre, et **Arrêter**, qui ne modifie rien. Une fois terminé, il indique ce qu’il a fait, par exemple « 412 favoris triés dans 14 nouveaux dossiers. 3 dossiers vides retirés. », et les dossiers s’affichent fermés pour que les nouveaux soient repérables d’un coup d’œil. **Annuler** remet chaque favori comme il était, tant que vous n’avez pas modifié vos favoris depuis\u00a0; la croix ferme la note. En cas d’échec, rien n’est modifié, et **Réessayer** le relance.

Les agents ne peuvent pas organiser vos favoris à votre place\u00a0: votre navigation personnelle n’appartient qu’à vous. Demandez-le à l’un d’eux, et il vous indique où se trouve le bouton.

### Importer des favoris

Sous **Importer** dans le panneau, l’app liste les navigateurs de cet ordinateur qui ont des favoris, avec leur nombre\u00a0: Chrome (et Chrome Beta), Chromium, Edge, Brave, Vivaldi, Opera, Firefox, et, sur Mac uniquement, Arc et Safari. Un navigateur qui a plusieurs profils est listé une fois pour chacun, avec le nom du profil. Appuyez sur **Importer** pour l’un d’eux et ses favoris arrivent dans un nouveau dossier à la fin de la barre de favoris, appelé « Importés de Chrome » (« Importés de Chrome (Travail) » quand le navigateur a plusieurs profils). Il conserve les dossiers du navigateur\u00a0: ce qui se trouvait sur sa barre de favoris d’abord, puis ses autres favoris, les favoris mobiles et le menu de Firefox, sous forme de dossiers nommés comme ce navigateur les nomme. Les liens qui ne sont pas des pages web, comme ceux en javascript:, et les dossiers vides sont écartés. Firefox peut rester ouvert. Dans l’app de bureau, la visite de bienvenue le propose aussi, sur une page à part, **Importer vos favoris et votre historique ?**, quand Hydor trouve d’autres navigateurs sur cet ordinateur (voir [Suivre la visite guidée](/guide/app#take-the-tour)).

La première fois que vous ouvrez la page Navigateur, quand Hydor trouve d’autres navigateurs sur cet ordinateur et que l’import ne vous a pas encore été proposé (la page de la visite guidée compte), une barre au-dessus de la page demande « Importer vos favoris et votre historique depuis Google Chrome et Firefox ? », en nommant les navigateurs trouvés. **Non merci** la ferme, et **Importer…** ouvre le panneau **Importer les favoris et l’historique** ([Importer les favoris et l’historique](/browser?panel=import)). La barre ne s’affiche que lors de cette première visite\u00a0; le panneau est disponible à tout moment, à cette adresse, et la zone de recherche (Ctrl+K) le trouve. Les panneaux **Favoris** et **Historique** ont aussi **Importer** en bas. Il contient une note, « Les favoris arrivent dans un nouveau dossier à la fin de la barre de favoris, et l’historique s’ajoute au vôtre. Tout reste sur cet ordinateur. », puis les interrupteurs **Favoris** et **Historique** (tous deux activés) et une ligne pour chaque navigateur (et profil) avec son nombre de favoris et de pages d’historique, et **Importer**, qui importe ce qui est activé, comme le fait la page de la visite guidée. **Importé** s’affiche à côté de ce qui est arrivé, aux deux endroits. Si aucun navigateur n’est trouvé, le message « Aucun autre navigateur n’a été trouvé sur cet ordinateur. » s’affiche.

Safari conserve ses favoris là où macOS les protège. Tant que vous ne l’avez pas autorisé, sa ligne indique « Hydor n’a peut-être pas le droit de lire les favoris de Safari : autorisez-le dans Réglages Système → Confidentialité et sécurité → Accès complet au disque ». Sa ligne affiche **Ouvrir les Réglages Système** à la place de **Importer**\u00a0: ce bouton ouvre Réglages Système → Confidentialité et sécurité → Accès complet au disque, où vous activez Hydor (ajoutez-le avec **+** s’il n’est pas listé). Quand vous revenez dans Hydor, il vérifie de nouveau, et le nombre de favoris de Safari et **Importer** s’affichent. S’il ne peut toujours pas lire Safari, la ligne ajoute « Autorisé ? macOS peut demander de rouvrir Hydor d’abord : quittez Hydor et rouvrez-le. »

Pour importer un fichier à la place, appuyez sur **Depuis un fichier** et choisissez un fichier de favoris exporté depuis n’importe quel navigateur (un fichier .html, jusqu’à 20 Mo). Il arrive dans un dossier appelé « Favoris importés ».

### Exporter vos favoris

**Exporter**, sous **Importer**, enregistre tous vos favoris dans `bookmarks.html`, que Chrome, Firefox et Safari peuvent importer.

## Extensions Chrome

Votre propre navigateur peut exécuter des extensions Chrome : un gestionnaire de mots de passe, un mode sombre, un traducteur. Appuyez sur **Menu** (⋯) → **Extensions**, ou allez à [Extensions](/browser?panel=extensions). Les extensions s’exécutent dans le navigateur propre à l’app de bureau. Ailleurs, le panneau les conserve et l’indique (« Les extensions s’exécutent dans le navigateur propre à l’app de bureau. Elles sont conservées ici et s’exécutent là-bas. »). Une extension s’exécute avec vos connexions et peut lire les sites qu’elle demande : n’ajoutez que celles auxquelles vous faites confiance.

### Ajouter une extension

- **Depuis le Chrome Web Store** : collez le lien de l’extension (une adresse chromewebstore.google.com ou chrome.google.com/webstore) ou son identifiant (32 lettres de a à p) sous **Depuis le Chrome Web Store**, puis appuyez sur **Ajouter**. Vous pouvez aussi ouvrir la page de l’extension dans votre propre navigateur et appuyer sur **Ajouter à Hydor** dans la barre du haut. L’app la télécharge depuis le Chrome Web Store (une requête envoyée à Google) et conserve son identifiant du Web Store.
- **Depuis un dossier** : appuyez sur **Choisir un dossier** (dans l’app de bureau) ou saisissez le chemin du dossier (ailleurs : un dossier de l’ordinateur sur lequel l’app s’exécute), pour une extension non empaquetée qui contient un fichier manifest.json. Elle est utilisée là où elle se trouve, sans être copiée, si bien que les modifications d’un développeur sont prises en compte.
- **Depuis vos autres navigateurs** : les extensions installées dans Chrome, Edge, Brave et d’autres navigateurs basés sur Chromium sur cet ordinateur sont listées, chacune avec une case à cocher. Cochez celles que vous voulez et appuyez sur **Importer**. Celles qui sont déjà ici indiquent « Déjà présente », et celles qui sont désactivées dans leur navigateur indiquent « Désactivée là-bas ».

Les extensions ne se mettent pas à jour toutes seules. Ajoutez-en une à nouveau depuis le Chrome Web Store pour obtenir sa dernière version ; elle remplace l’ancienne.

### Désactiver ou retirer une extension

Chaque extension du panneau affiche son icône, son nom et sa version, ainsi qu’un interrupteur pour l’activer ou la désactiver. **Retirer** la supprime (les fichiers d’un dossier restent en place). **Options** ouvre sa page d’options dans un onglet.

Lorsqu’une extension a un bouton dans la barre d’outils, il s’affiche à droite de la barre d’adresse tant qu’elle est activée et épinglée : cliquez dessus pour ouvrir sa fenêtre contextuelle sous le bouton ; un badge, un nombre ou quelques lettres, indique ce que l’extension signale. Les extensions que vous n’avez pas épinglées n’ont pas de bouton propre et se trouvent dans le bouton **Extensions** (la pièce de puzzle), après les autres. Il s’affiche tant qu’au moins une extension est activée.

- **Utiliser une extension depuis le menu** : appuyez sur **Extensions** et cliquez sur le nom d’une extension pour l’utiliser, comme vous cliqueriez sur son bouton. Une extension sans bouton propre dans la barre d’outils est aussi listée : son nom ouvre sa page d’options si elle en a une.
- **L’épingler ou la désépingler** : l’épingle à côté d’une extension dans ce menu (**Épingler à la barre d’outils**, ou **Désépingler de la barre d’outils** lorsqu’elle est épinglée) affiche ou masque son bouton dans la barre d’outils. L’épingle est allumée lorsque l’extension est épinglée. L’épinglage ne change que la barre d’outils : l’extension continue de s’exécuter dans les deux cas.
- **Plus d’actions pour une extension** : le **⋮** à côté d’elle propose **Options** (si elle a une page d’options), **Désactiver** et **Retirer**, qui demande confirmation.
- **Gérer les extensions**, au bas du menu, ouvre le panneau.
- **Clic droit sur un bouton** de la barre d’outils : un petit menu affiche son nom, puis **Options** (si elle a une page d’options), **Désépingler**, **Retirer** et **Gérer les extensions**.
- **Épingler à la barre d’outils** est aussi un interrupteur dans le panneau, sous chaque extension activée qui a un bouton.

Une nouvelle extension commence épinglée. Les extensions que vous importez depuis Chrome gardent leurs épingles : celles que vous aviez épinglées dans Chrome le sont ici, et les autres se trouvent dans le menu **Extensions**. Un clic sur une extension qui ne s’exécute pas dans ce navigateur l’indique (« … ne s’exécute pas dans ce navigateur »).

**Aussi dans les navigateurs des agents** est désactivé au départ. Une fois activé, l’extension s’exécute aussi dans les navigateurs des agents qui conservent les connexions, c’est-à-dire ceux qui utilisent un profil (voir [Conserver les connexions avec des profils](/guide/web#keep-sign-ins-with-profiles)), et uniquement ceux-là. Les navigateurs qui démarrent à neuf ne reçoivent jamais d’extensions. (Sur un serveur, Chromium ou Chrome for Testing les charge ; Google Chrome ne le fait plus.)

### Ce qui peut ne pas fonctionner

Le navigateur de l’app de bureau offre la plupart de ce que Chrome donne aux extensions. Le contenu qu’une extension ajoute aux pages, les fenêtres contextuelles, les pages d’options, les paramètres enregistrés, les messages, les badges, les notifications (affichées comme celles du système) et les alarmes fonctionnent, de même que ce qu’une extension fait avec vos onglets : elle voit l’onglet sur lequel vous êtes, ainsi que l’adresse et le titre des pages qu’elle a le droit de lire ; elle ouvre des onglets (au premier plan, comme dans Chrome), y passe et les ferme, et détecte quand ils se chargent ou changent. Ses téléchargements sont enregistrés comme les vôtres, elle lit et définit les cookies des sites qu’elle peut utiliser, les pages d’arrière-plan qu’elle crée pour elle-même (hors écran) s’exécutent, et son panneau latéral s’ouvre sous son bouton, à la manière d’une fenêtre contextuelle. Ce qui peut ne pas fonctionner : le blocage ou la modification de requêtes (sur lesquels reposent de nombreux bloqueurs de publicités), la connexion avec un compte, l’historique et les favoris du navigateur, les groupes d’onglets, les raccourcis clavier d’une extension, et les éléments qu’une extension ajoute au menu du clic droit (acceptés, jamais affichés). La ligne de l’extension indique ce qu’elle demande, par exemple : « Certaines parties peuvent ne pas fonctionner ici : blocage ou modification de requêtes, connexion avec un compte ». Cela se base sur ce que l’extension demande ; elle peut donc très bien fonctionner malgré tout.

## Confier une page à un agent

Un agent n’a jamais accès à votre propre navigateur. Vous pouvez lui confier une seule de ses pages, de deux façons (un [onglet privé](/guide/web#private-tabs) ne peut pas être confié : **Demander** y est grisé, et l’app refuse la copie de sa page) : **Demander** lui donne une copie à lire, et **Agir** lui donne un onglet pour travailler. Les deux se trouvent dans **Demander**, dans la barre, qui ouvre la colonne à côté de la page avec un sélecteur, **Demander** ou **Agir** (voir [Poser une question à côté de la page](/guide/web#ask-beside-the-page)). Ils fonctionnent sur la page d’un site web. La zone de saisie de la barre fait les deux avec ce que vous tapez, selon le sélecteur : sa ligne **Poser une question sur cette page : « … »** devient **Le faire sur cette page : « … »** lorsque **Agir** est choisi.

### Poser une question sur cette page

L’agent reçoit une copie de la page, un fichier contenant son titre, son adresse, ce que vous y aviez sélectionné et son texte lisible (jusqu’à 200 000 caractères), et une nouvelle session démarre avec votre question, avec l’agent et le modèle que la page de démarrage a utilisés en dernier. La réponse s’affiche dans la colonne à côté de la page, et **Ouvrir comme session** vous y emmène. L’agent ne peut pas toucher à la page ni voir vos connexions : il lit la copie. Laissez d’abord la page finir de se charger, car la copie correspond à ce que l’onglet affiche à cet instant.

### Le faire sur la page

Avec **Agir** choisi dans Demander, la colonne demande « Que doit faire un agent sur cette page ? » et indique ce que l’agent reçoit. Choisissez **Claude Code** ou **Custom** avec le bouton d’agent (seuls ces deux-là peuvent être limités au navigateur ; l’app refuse les autres) et appuyez sur **Le faire**. Les mots que vous avez sélectionnés dans la page avec **Demander à un agent à propos de**, ou une image issue de **Poser une question sur cette image**, accompagnent la demande. L’agent reçoit :

- **Un onglet à lui**, dans le navigateur qui conserve vos connexions, ouvert à l’adresse de votre page : il est connecté comme vous sur ce site. Votre propre onglet reste où il est.
- **Uniquement ce site** : les pages d’autres sites ne s’ouvriront pas pour lui. Pour une page située sur cet ordinateur, seule cette adresse est accessible.
- **Uniquement le navigateur** : pas de commandes, pas de fichiers, pas de recherche web, pas d’autres apps, pas de mémoire et pas de sous-agents. Une telle session ne peut pas être poursuivie dans un autre agent, et sa copie (fork) reste limitée au navigateur.
- **Un arrêt avant l’envoi** : il demande, comme indiqué plus haut, avant d’appuyer sur un bouton qui envoie, publie, supprime ou transfère quelque chose, et on lui dit de vous demander lorsqu’il hésite (voir [Boutons qui envoient, publient ou suppriment](/guide/web#buttons-that-send-post-or-delete)). Le paiement reste de votre ressort, comme toujours.

Le premier message de l’agent lui indique que votre page est ouverte dans son navigateur et qu’il y travaille seul. Le navigateur doit être activé dans les Paramètres (**Un navigateur pour les agents**). Après avoir appuyé sur **Le faire**, l’onglet de l’agent s’affiche à la place de la page, avec sa conversation à côté (voir [Agents au travail](/guide/web#agents-at-work)). Une fois de retour dans vos onglets, Demander pour cet onglet affiche la conversation, avec **Le regarder travailler** (l’onglet de l’agent s’affiche de nouveau), **Ouvrir comme session** et **Nouvelle demande**.

### Reprendre la page

Sur un navigateur d’agent qui a reçu votre page, le panneau au-dessus de sa zone de message indique « Votre onglet de example.com » avec **Reprendre**, et la barre aussi pendant que vous le regardez. Appuyez dessus pour fermer l’onglet de l’agent et ouvrir la page comme un nouvel onglet à vous, au premier plan. L’agent reçoit le message « J’ai repris la page : elle est de nouveau à moi ». Son navigateur se ferme avec son dernier onglet, et sinon comme celui de n’importe quelle session à la fin de celle-ci (voir [Quand le navigateur se ferme](/guide/web#when-the-browser-closes)).

## Agents au travail

Tant qu’un agent a un navigateur ouvert, la colonne des onglets le liste sous **Agents au travail**, une ligne par agent, avec le titre de la session et ce qu’il fait (« Clic sur « Se connecter » », « En attente de vous », « Vous avez la main : l’agent attend »). La liste est tenue à jour, et cette section n’existe pas lorsqu’aucun agent n’a de navigateur ouvert. Cliquez sur une ligne pour voir ce navigateur à la place de la page :

- La page s’affiche avec les questions de l’agent au-dessus, comme dans [Prendre la main pour se connecter, résoudre une vérification ou payer](/guide/web#take-over-to-log-in-solve-a-check-or-pay), et un anneau autour : ambre lorsqu’elle vous attend, bleu lorsque vous avez la main. La zone de saisie affiche une pastille avec l’agent et le titre de la session (son **×**, **Retour à vos onglets**, permet de revenir) ainsi que l’adresse de l’onglet de l’agent.
- La barre propose **Arrêter** tant que l’agent travaille, **Prendre la main** (ou **Rendre la main**, lorsque c’est vous qui conduisez), **Reprendre** pour une page que vous lui avez confiée, et **Ouvrir la session**. Dans l’app de bureau, cliquez dans sa page pour l’utiliser vous-même ; l’agent attend.
- La colonne de droite affiche la conversation de la session, en direct, avec sa zone de message : regardez-le travailler, répondez-lui ou envoyez-lui un message. **Ouvrir la session** et **×** se trouvent en haut.

**Esc**, le **×** de la pastille, **Retour à vos onglets** ou un clic sur l’un de vos onglets vous ramène à vos propres onglets ; la colonne de droite affiche alors ce qu’elle affichait auparavant, ou se ferme.

## Configurer le navigateur

Ouvrez [Paramètres → Capacités → Navigateur](/settings?s=browser) (« Un navigateur web que les agents utilisent, et que vous pouvez regarder et dont vous pouvez prendre les commandes »).

### Un navigateur pour les agents

[Un navigateur pour les agents](/settings?s=browser&find=A%20browser%20for%20agents) est l’interrupteur à côté du titre de la section. Il active ou désactive le navigateur pour tous les agents. Il s’active tout seul dès qu’un Chromium est trouvé, et il ne peut pas être activé tant qu’aucun ne l’est. Lorsqu’il est désactivé, les agents n’ont pas accès aux outils du navigateur. Chaque agent a aussi son propre interrupteur **Utiliser un navigateur**, sous [Ce qu’il peut utiliser](/guide/agents#what-it-may-use) : un agent pour lequel il est désactivé n’a pas accès aux outils du navigateur, quel que soit le réglage ici.

### Chromium

[Chromium](/settings?s=browser&find=Chromium) indique celui qui est utilisé, avec sa version, et son emplacement dans une infobulle (i). L’app choisit, dans cet ordre : dans l’app de bureau, **Le navigateur intégré à l’app de bureau** ; un Chrome ou un Chromium installé sur cet ordinateur ; un navigateur qu’elle a téléchargé ; puis un navigateur installé par Playwright (un outil de test de navigateur). Lorsqu’il y en a plusieurs, un sélecteur vous permet de choisir : **Le meilleur trouvé**, ou un navigateur précis.

Le navigateur intégré à l’app de bureau n’a rien à télécharger et n’a pas de chemin à afficher. Tant qu’il est utilisé, la ligne indique « Les pages s’affichent dans la fenêtre de l’app. », et **Télécharger Chrome** et **Afficher une fenêtre** ne sont pas affichés, car ni l’un ni l’autre n’a de sens pour lui. Choisissez un autre Chromium et ils reviennent. La page Navigateur (votre propre navigation) utilise le même moteur.

Lorsqu’aucun n’est trouvé, la ligne l’indique et propose de télécharger Chrome for Testing (environ 170 Mo) dans le dossier de données de l’app : appuyez sur **Télécharger Chrome** ; une barre montre la progression et, en cas d’échec, la ligne en donne la raison. Le bouton reste affiché tant qu’aucune copie téléchargée n’existe, même si un autre Chromium a été trouvé.

Si le bac à sable de Chrome (la barrière entre les pages et le reste de l’ordinateur) ne peut pas fonctionner sur cet ordinateur, une note l’indique. Les pages ne peuvent toujours pas accéder au réseau de cette machine, mais limitez les profils aux sites dont vous avez besoin.

### Afficher une fenêtre

[Afficher une fenêtre](/settings?s=browser&find=Show%20a%20window) est désactivé au départ : le navigateur fonctionne hors de vue, et vous le regardez dans l’app. Lorsqu’il est activé, il ouvre aussi une fenêtre sur l’écran de cet ordinateur. Le shell headless de Playwright (un Chromium sans fenêtre) ne peut pas en afficher, donc l’interrupteur reste désactivé avec lui. Le changement s’applique au prochain démarrage du navigateur. L’interrupteur n’est pas affiché tant que le navigateur intégré à l’app de bureau est utilisé.

### Tenir les pages à l’écart de cette machine et de son réseau

[Tenir les pages à l’écart de cette machine et de son réseau](/settings?s=browser&find=Keep%20pages%20off%20this%20machine%20and%20its%20network) est activé au départ. Les pages ne peuvent pas accéder à cet ordinateur ni aux adresses privées de son réseau (routeurs, imprimantes, cette app), que ce soit par une connexion directe ou par un nom de site qui mène ensuite à une telle adresse : chaque connexion passe par un point de contrôle de l’app. Une session peut tout de même ouvrir son propre serveur de développement une fois que vous l’y avez autorisée (voir [Laisser une session ouvrir un site sur cet ordinateur ou votre réseau](/guide/web#let-a-session-open-a-site-on-this-computer-or-your-network)). Lorsque l’option est désactivée, les pages peuvent accéder à votre réseau, mais Hydor lui-même reste inaccessible.

### Captures d’écran pour les modèles qui voient les images

[Captures d’écran pour les modèles qui voient les images](/settings?s=browser&find=Screenshots%20for%20models%20that%20see%20images) est activé au départ : les agents dont le modèle voit les images peuvent regarder la page, sur laquelle sont dessinés des cadres numérotés. Les modèles qui ne lisent que du texte reçoivent toujours la page sous forme de texte ; lorsque l’option est désactivée, tous les modèles la reçoivent ainsi.

### Demander avant d’envoyer sur les sites connectés

[Demander avant d’envoyer sur les sites connectés](/settings?s=browser&find=Ask%20before%20sending%20on%20signed-in%20sites) est activé au départ. Avant qu’un agent n’envoie, ne publie, ne supprime ou ne transfère quoi que ce soit sur un site où il est connecté, on vous le demande (voir [Les boutons qui envoient, publient ou suppriment](/guide/web#buttons-that-send-post-or-delete)). Lorsque l’option est désactivée, les agents appuient sur ces boutons sans demander, sur les sites où un profil est connecté et sur une page que vous leur avez confiée. Les paiements restent bloqués dans les deux cas.

### Sites : uniquement ceux-ci, jamais ceux-là

Sous [Sites](/settings?s=browser&find=Sites), deux listes s’appliquent au navigateur de chaque session, un site par ligne, comme example.com (ses sous-domaines comptent aussi) :

- **Uniquement ces sites** : lorsqu’elle contient des sites, le navigateur n’ouvre des pages que sur ceux-ci. Vide, elle signifie n’importe quel site.
- **Jamais ces sites** : rien de ces sites n’est chargé.

**Enregistrer les sites** apparaît à côté du titre du groupe dès que vous modifiez les listes : appuyez dessus. Vous pouvez coller des adresses entières : l’app ne garde que le site (« https://www.example.com/page » devient example.com). Chaque session peut ajouter les siens dans le menu de son navigateur (**Sites de cette session**).

### Conserver les connexions avec des profils

Un profil est un dossier de navigateur à part, qui conserve les connexions d’une session à l’autre, afin que les agents puissent travailler sur des sites où vous êtes connecté sans que votre mot de passe ne leur parvienne jamais. Votre propre profil Chrome n’est jamais utilisé. Sous [Profils](/settings?s=browser&find=Profiles) :

1. Appuyez sur **Nouveau profil**, donnez-lui un nom (comme Travail ou Achats), puis appuyez sur **Ajouter**.
2. Une fenêtre s’ouvre, « Se connecter à des sites · Travail ». Saisissez un site auquel vous connecter, comme github.com/login, puis appuyez sur **Ouvrir**.
3. Cliquez et saisissez dans la page comme dans n’importe quel navigateur (sur un téléphone, **Clavier** ouvre votre clavier), puis connectez-vous. Ouvrez d’autres sites de la même façon.
4. Fermez la fenêtre quand vous avez terminé. Les connexions restent dans le profil.

Pour l’utiliser, ouvrez le navigateur d’une session, puis **Options du navigateur** (⋯) → choisissez le profil sous **Profil**. Le choisir ferme le navigateur ; il se rouvre, connecté, la prochaine fois que l’agent ou vous l’ouvrez, et le panneau affiche le nom du profil. Les sessions qui utilisent le même profil partagent ses connexions.

Chaque profil de la liste a **Se connecter à des sites** (pour vous connecter à d’autres sites) et un menu **⋯** avec **Renommer** et **Supprimer**, qui supprime aussi ses connexions et tout ce que le navigateur a conservé pour lui, et ferme les navigateurs qui l’utilisent. Tant qu’il n’y a aucun profil, la liste indique que le navigateur de chaque session démarre à neuf, connecté nulle part.

### Votre propre navigation

Dans l’app de bureau, [Paramètres → Navigateur](/settings?s=browser) comporte aussi un groupe **Votre propre navigation** (« La page Navigateur : les pages que vous utilisez vous-même, auxquelles les agents n’ont jamais accès »), avec trois lignes qui ouvrent les panneaux de la page Navigateur : [Favoris](/settings?s=browser&find=Bookmarks) (« Les vôtres, avec ceux des autres navigateurs de cet ordinateur »), [Extensions](/settings?s=browser&find=Extensions) (« Extensions Chrome, dans l’app de bureau ») et [Paramètres du navigateur](/settings?s=browser&find=Browser%20settings) (« Page d’accueil, moteur de recherche, traduction, pages sombres, bloqueur de publicités, historique et effacement de ce qu’il a conservé »). Ailleurs, le groupe n’est pas affiché. Voir [Favoris](/guide/web#bookmarks), [Extensions Chrome](/guide/web#chrome-extensions) et [Paramètres du navigateur](/guide/web#browser-settings).

## Laisser les agents utiliser votre ordinateur

Dans l’app de bureau, sur Mac, sous Windows et sous Linux, les agents peuvent aussi utiliser l’ordinateur lui-même, comme une personne devant lui : ils voient son écran et utilisent sa souris et son clavier, dans n’importe quelle app (Notes ou Calendrier sur Mac, Bloc-notes ou Excel sous Windows, Fichiers sous Linux, une app que le navigateur ne peut pas atteindre). Pour les sites web, ils s’en tiennent au navigateur, qui est plus rapide et plus sûr. L’utilisation de l’ordinateur est désactivée au départ. Chaque agent a aussi son propre interrupteur **Utiliser l’ordinateur**, sous [Ce qu’il peut utiliser](/guide/agents#what-it-may-use) : un agent pour lequel il est désactivé ne peut pas utiliser l’ordinateur, même si l’option Utilisation de l’ordinateur est activée.

### Activer l’utilisation de l’ordinateur

Ouvrez [Paramètres → Capacités → Utilisation de l’ordinateur](/settings?s=computer) (« Les agents voient votre écran et utilisent la souris et le clavier, dans l’app de bureau ») et activez l’interrupteur [**Utilisation de l’ordinateur**](/settings?s=computer&find=Computer%20use) à côté du titre de la section. Ensuite, selon votre système :

- **Sur Mac**, accordez à Hydor les deux autorisations de macOS. À côté de [**Accessibilité**](/settings?s=computer&find=Accessibility), l’autorisation de macOS pour utiliser la souris et le clavier, appuyez sur **Autoriser…**. macOS demande si Hydor peut contrôler cet ordinateur, et ses Réglages Système s’ouvrent sur **Confidentialité et sécurité → Accessibilité** : activez-y **Hydor**. À côté de [**Enregistrement de l’écran**](/settings?s=computer&find=Screen%20Recording), l’autorisation de macOS pour voir l’écran, appuyez sur **Autoriser…**, puis activez **Hydor** sous **Enregistrement de l’écran** (**Enregistrement de l’écran et de l’audio système** sur macOS 15). Si macOS demande de quitter et de rouvrir Hydor, faites-le : les agents en cours continuent. Une autorisation accordée par macOS s’affiche avec **Autorisé** et se conserve lors des mises à jour de l’app. Si les Réglages Système indiquent **Hydor** activé mais que les Paramètres affichent toujours **Autoriser…**, cette autorisation date d’une version antérieure (avant la 0.28.1, chaque mise à jour exigeait de redonner les autorisations) : appuyez sur **Autoriser…**, ce qui l’efface, puis activez de nouveau **Hydor**.
- **Sous Windows**, il n’y a rien à autoriser. Les programmes exécutés en tant qu’administrateur sont hors de portée de l’agent, de même que l’écran lorsqu’il est verrouillé.
- **Sous Linux**, cela fonctionne sur un bureau X11 (Xorg) avec Python 3, que presque tous les systèmes ont. Un bureau sous Wayland, comme le sont GNOME et KDE sur la plupart des systèmes aujourd’hui, ne laisse aucune app voir l’écran ni utiliser la souris et le clavier des autres : la section l’indique, ainsi que la façon d’ouvrir plutôt une session X11 (sur Ubuntu, la roue dentée de l’écran de connexion → **Ubuntu on Xorg**).

Lorsque quelque chose empêche l’utilisation de l’ordinateur de fonctionner sur cette machine, la section indique quoi, dans un encadré jaune en haut (lorsque l’interrupteur est désactivé, une note indique que les agents ne peuvent pas utiliser cet ordinateur). La section figure dans les Paramètres partout, mais seule l’app de bureau peut le faire : ailleurs, elle l’indique.

### Ce que font les agents sur votre ordinateur

La première fois qu’un agent d’une session veut utiliser l’ordinateur, une carte dans la conversation demande : « Laisser l’agent utiliser votre Mac ? » (« votre PC » sous Windows, « votre ordinateur » sous Linux), avec **Autoriser pour cette session** et **Pas maintenant**. La session attend votre réponse, et vous recevez une notification. Une fois l’autorisation donnée, l’agent peut :

- regarder l’écran (l’écran principal, réduit ; les autres écrans ne sont pas montrés) ;
- cliquer, double-cliquer, faire un clic droit, faire glisser, faire défiler et déplacer le pointeur ;
- saisir du texte, dans n’importe quelle langue, et appuyer sur des touches et des raccourcis comme ⌘C sur Mac ou Ctrl+C sous Windows et Linux ;
- ouvrir une app par son nom, tel que le menu Démarrer ou le menu des applications l’affiche.

Pendant qu’un agent travaille, une lueur borde les bords de votre écran, sur chaque écran, et une note en bas indique « Un agent utilise votre Mac » (votre PC, votre ordinateur) et « Appuyez sur Échap pour arrêter ». Les clics la traversent, et elle ne prend jamais le clavier. Elle est réservée à vous : les captures d’écran de l’agent ne la montrent jamais (elle est masquée le temps d’une capture, puis revient). Sous Linux, elle nécessite un bureau qui compose ses fenêtres, comme GNOME, KDE, Xfce, Cinnamon et MATE le font ; sans cela, il n’y a pas de lueur, et l’icône de la zone de notification indique toujours qu’un agent travaille.

### Voir où l’agent pointe sur votre écran

L’agent déplace votre propre pointeur de souris, qui est petit et facile à perdre. Ainsi, pendant qu’il travaille, un grand anneau avec un halo doux, aux couleurs de la lueur, entoure le pointeur, avec une étiquette **Agent** à côté :

- le pointeur glisse vers chaque endroit en un quart de seconde au lieu d’y sauter, et l’anneau l’accompagne, afin que votre regard puisse suivre ;
- là où il clique, une ondulation se propage (en pointillés pour un clic droit, deux pour un double clic), et tant qu’il maintient le bouton enfoncé (un glissement), l’anneau se resserre et suit le mouvement ;
- les mots qu’il saisit et les touches qu’il presse (Ctrl+S, Entrée) s’affichent un instant à côté de l’étiquette, et un défilement montre son sens par des flèches.

L’anneau fait partie de la lueur : les clics le traversent, il ne prend jamais le clavier, les captures d’écran de l’agent ne le montrent jamais, et sous Linux il nécessite un bureau qui compose ses fenêtres.

Chaque étape s’affiche dans la conversation sous la forme d’une ligne suivie d’une petite image de l’écran après l’action : cliquez sur l’image pour la voir en grand, ainsi que la ligne de la réponse complète de l’agent. Une fois ouverte, l’image marque l’endroit où l’étape a agi : un anneau là où elle a cliqué (deux pour un double clic, en pointillés pour un clic droit), une ligne le long d’un glissement, une flèche là où elle a fait défiler, numérotés lorsque l’étape a fait plusieurs choses. L’app conserve les images des 200 dernières étapes de chaque session ; celles des sessions inactives depuis un mois sont supprimées.

Les agents ont pour consigne de regarder avant d’agir, d’utiliser le navigateur pour les sites web, et de ne jamais saisir de mots de passe, de numéros de carte ou de codes, ni de payer, d’acheter ou d’envoyer de l’argent : dans ces cas, ils s’arrêtent et vous demandent de le faire vous-même. Une seule session utilise l’ordinateur à la fois.

### Empêcher un agent d’utiliser votre ordinateur

Pendant qu’un agent utilise l’ordinateur, la lueur et sa note s’affichent, l’icône de l’app l’indique (sur Mac, « Agent using your Mac » à côté, dans la barre des menus), et sa session affiche « L’agent utilise votre Mac » (votre PC, votre ordinateur) au-dessus de la zone de message. Pour l’arrêter immédiatement :

- appuyez sur **Esc**, dans n’importe quelle app (sur Mac, **⌘⇧Esc** fonctionne aussi). Esc n’arrête l’agent que lorsqu’il est en train de travailler, et si l’agent appuie lui-même sur Échap, pour fermer une boîte de dialogue par exemple, cela ne l’arrête pas ;
- choisissez **Arrêter** dans le menu de l’icône de l’app : dans la barre des menus sur Mac, la zone de notification sous Windows, la zone de notification système sous Linux ;
- ou appuyez sur **Arrêter** au-dessus de la zone de message de la session, ou dans Paramètres → Utilisation de l’ordinateur.

L’arrêt met fin à ce que fait l’agent et retire l’autorisation de toutes les sessions : un agent qui veut de nouveau utiliser l’ordinateur le redemande sur la carte (« Vous avez empêché l’agent d’utiliser votre Mac. Le laisser continuer ? »). Désactiver **Utilisation de l’ordinateur** produit le même effet.

## Demander à un agent

- « Active SearXNG sur https://searx.example.org, place-le en premier parmi les fournisseurs de recherche et teste-le. »
- « Désactive DuckDuckGo pour la recherche sur le web. »
- « Donne 50 résultats de recherche par défaut aux agents. »
- « N’autorise jamais le navigateur à ouvrir facebook.com ou tiktok.com. »
- « Affiche le navigateur dans une fenêtre sur cet ordinateur et désactive ses captures d’écran. »
- « Crée un profil de navigateur nommé Achats. » (Se connecter aux sites dans ce profil, c’est à vous de le faire, dans Paramètres → Navigateur.)
- « Arrête de me demander confirmation avant que les agents appuient sur Envoyer ou Supprimer sur les sites où ils sont connectés. » (c’est Paramètres → Navigateur → Demander avant d’envoyer sur les sites connectés ; pour le réactiver, procédez de la même manière)
- « Le navigateur de mes agents est-il celui de l’app de bureau ou un Chromium ? »
- « Comment donner à un agent la page que je consulte dans la page Navigateur ? » (**Interroger à propos de cette page** lui en donne une copie ; **Agir** dans Demander lui donne un onglet à lui, ouvert sur la page)
- « Demande à un agent de remplir le formulaire de cette page à ma place. » (**Demander** dans la barre, puis **Agir** ; il obtient un onglet à lui, connecté comme vous sur ce site, et demande confirmation avant d’envoyer)
- « Comment faire une recherche sur YouTube ou Wikipédia directement depuis la barre d’adresse ? » (un raccourci de recherche : saisissez `yt` ou `wiki`, une espace, puis vos mots ; **Paramètres du navigateur** → **Raccourcis de recherche** permet d’ajouter les vôtres)
- « Affiche les pages web en plus grand par défaut et désactive le correcteur orthographique. » (**Paramètres du navigateur** → **Pages** → **Zoom des pages** et **Vérifier l’orthographe**)
- « Élargis la colonne à côté de la page. » (faites glisser son bord gauche ; un double-clic rétablit sa largeur)
- « À quelles touches mon navigateur répond-il ? » (**Menu** → **Raccourcis clavier**)
- « Ajoute example.org/reports à ma barre de favoris, dans un dossier nommé Travail. »
- « Comment changer le moteur de recherche ou la page d’accueil de mon navigateur ? » (c’est **Menu** → **Paramètres** sur la page Navigateur : c’est à vous de les modifier, les agents ne peuvent pas)
- « Comment autoriser les publicités sur un seul site dans mon navigateur ? » (l’interrupteur **Bloquer les publicités sur ce site** du bouclier, désactivé)
- « Comment effacer mon historique de navigation et mes cookies ? » (**Paramètres du navigateur** → **Effacer les données de navigation** ; la période choisie s’applique à l’historique, et à la liste des téléchargements qui y est associée, uniquement)
- « Pourquoi la barre d’adresse me suggère-t-elle une page que j’ai visitée et qui ne contient aucun des mots que j’ai saisis ? » (lorsque la recherche par le sens est activée, elle propose aussi des pages qui traitent de ce que vous avez saisi)
- « Comment regrouper mes onglets, et qu’envoie Grouper mes onglets avec l’IA ? » (clic droit sur un onglet → **Ajouter au groupe** ; le bouton IA envoie les titres et les adresses des onglets, sans ce qui suit un ? ou un #, au modèle d’appoint, uniquement lorsque vous appuyez dessus)
- « Comment rouvrir un onglet que j’ai fermé ? » (**Ctrl+Shift+T**, ou **Fermés récemment** dans l’historique)
- « Comment surligner des mots sur une page et les retrouver ? » (sélectionnez-les, faites un clic droit, puis **Surligner** ; ils se trouvent dans **Menu** → **Points forts**)
- « Mon navigateur bloque-t-il les publicités de YouTube ? » (oui, avec **Bloquer les publicités et les traqueurs** activé : les correctifs de page d’uBlock Origin suppriment les publicités vidéo de YouTube et sont mis à jour environ toutes les 8 heures)
- « D’où viennent les listes du bloqueur de publicités, et à quelle fréquence sont-elles mises à jour ? » (de leurs auteurs, chacune étant récupérée de nouveau à son expiration : les correctifs rapides d’uBlock Origin environ toutes les 8 heures, les autres tous les quelques jours ; **Mettre à jour maintenant** sous **Paramètres du navigateur** → **Publicités** les récupère aussitôt)
- « Pourquoi un site dit-il que j’utilise un bloqueur de publicités, et que puis-je faire ? » (certains sites le repèrent ; autorisez ses publicités avec l’interrupteur **Bloquer les publicités sur ce site** du bouclier, désactivé, et la page se recharge)
- « Comment voir combien de publicités mon navigateur a bloquées ? » (le nombre sur le bouclier concerne cette page ; cliquez dessus pour voir tout ce qui a été bloqué sur le site, ou sur **Statistiques** pour ouvrir le panneau **Bloqueur de publicités** avec les 30 derniers jours)
- « Que conserve un onglet privé, et que oublie-t-il ? » (les connexions, les cookies et les données des sites sont conservés à part et oubliés à la fermeture du dernier onglet privé ; ses pages ne figurent pas dans l’historique ; les téléchargements, les favoris et ce que vous enregistrez sont en revanche conservés)
- « Traduis cette page en français et traduis toujours les pages en japonais. » (le bouton de traduction dans la barre d’adresse ; **Toujours traduire** se trouve dans **Paramètres du navigateur** → **Traduction** ; les mots de la page sont envoyés au modèle d’appoint)
- « Comment lire un article sans ce qui encombre la page, dans une police plus grande ? » (le bouton en forme de livre dans la barre d’adresse, puis **Aa**)
- « Affiche les pages web en sombre, sauf pour un site. » (**Menu** → **Pages sombres**, puis le cadenas de ce site → **Pages sombres sur ce site**)
- « Comment enregistrer une page web entière sous forme d’image ou de PDF ? » (**Menu** → **Capture d’écran ou PDF** → **Capture d’écran de la page entière** ou **Enregistrer en PDF…** ; les deux vont dans Téléchargements)
- « Comment classer mes favoris dans des dossiers avec l’IA, et qu’est-ce qui est envoyé ? » (**Organiser avec l’IA** dans le panneau Favoris ; les titres et les adresses de vos favoris, sans ce qui suit un ? ou un #, ainsi que les noms de vos dossiers sont envoyés au modèle d’appoint, uniquement lorsque vous appuyez sur **Organiser** ; **Annuler** les remet en place)
- « Comment retrouver un favori ? » (**Rechercher dans vos favoris**, en haut du panneau Favoris)
- « Comment garder une page à lire plus tard, et où trouver la liste ? » (**Menu** → **Lire plus tard** → **Ajouter cette page**, ou clic droit → **Lire cette page plus tard** ; la liste se trouve dans ce panneau et sous les onglets)
- « Enregistre cette page dans mon projet Thèse. » (**Enregistrer**, avec **Thèse** choisi dans le **▾** à côté ; la copie se trouve dans les **Fichiers** du projet)
- « Importe mes favoris de Chrome et de Firefox dans la page Navigateur. » (ou : « Pourquoi ne puis-je pas importer mes favoris de Safari ? »)
- « Importe mon historique de Chrome dans la page Navigateur. » (ou : « Pourquoi ne puis-je pas importer mon historique de Safari ? »)
- « Quelles extensions Chrome sont dans mon navigateur, et lesquelles fonctionnent aussi dans les navigateurs des agents ? »
- « Ajoute à mon navigateur l’extension à l’adresse https://chromewebstore.google.com/detail/… » (l’app vous demande d’abord, à chaque fois)
- « Garde uniquement mon gestionnaire de mots de passe dans la barre d’outils, et les autres extensions dans le menu Extensions. » (l’épingle à côté de chaque extension dans le menu du bouton **Extensions**)
- « Remplis à ma place le formulaire de la carte de bibliothèque sur riverside.example.org ; je regarde. » (son pointeur s’affiche dans la vue en direct à l’endroit où il clique et saisit du texte)
- « Ouvre Notes sur mon Mac et commence une note avec la liste de courses du jour. »
- « Ouvre le Bloc-notes et note la liste de courses du jour. » (sous Windows ; la lueur autour de l’écran s’affiche pendant qu’il travaille, son anneau indique où il pointe, et Échap l’arrête)
