# Laissez les agents utiliser l’app à votre place

Chaque agent connaît ce guide et peut utiliser l’app à votre place. Demandez-lui comment fonctionne quelque chose : il répond à partir du guide, avec un lien vers le bon endroit. Demandez-lui de modifier un paramètre ou de configurer quelque chose (un projet, un agent, une tâche planifiée) : il le fait, une fois que vous avez confirmé sur une carte. Quand il a besoin de précisions de votre part, il affiche un formulaire à remplir.

![Un agent qui modifie un paramètre pour vous : la carte montre la modification avant qu’elle soit effectuée](images/ask-agents.webp)

## Demander comment faire quelque chose

Dans n’importe quelle session, avec n’importe quel agent, posez vos questions sur l’app comme vous les poseriez à une personne : « Comment partager cette session avec un collègue ? », « Où activer les notifications sur mon téléphone ? », « Que fait le mode Automatique ? ». L’agent cherche la réponse dans ce guide : il décrit donc l’app telle qu’elle est aujourd’hui, et ses liens ouvrent l’endroit qu’il cite.

Vous pouvez aussi lire le guide vous-même : **Aide** dans la barre d’icônes, ou cherchez-y depuis la zone de recherche (Ctrl+K, ⌘K sur Mac), où ses sections apparaissent sous **Guide**. Dans l’Aide, une question saisie dans la zone en haut de la page est envoyée à un agent quand vous appuyez sur Entrée, et la réponse s’affiche à côté du guide (voir [Obtenir de l’aide](/guide/start#get-help)).

## Demander à un agent de modifier un paramètre ou de configurer quelque chose

Les agents peuvent faire dans l’app ce que vous pourriez faire dans ses pages. Voici quelques exemples de demandes :

- « Active la recherche par le sens. »
- « Crée un projet nommé Thèse pour mon mémoire, avec l’agent Chercheur. »
- « Crée-moi un agent qui résume mes newsletters non lues chaque vendredi à 17 h. »
- « Chaque jour de la semaine à 8 h, fais-moi une revue de presse sur les énergies renouvelables. »
- « Ajoute à mes consignes que les réponses doivent être courtes. »
- « Utilise Brave Search avant DuckDuckGo. »
- « Supprime les notes de la Mémoire sur mon ancien travail. »
- « Quelles apps ai-je ? Exécute le planificateur de voyage pour un long week-end à Lisbonne. »
- « Passe cet appareil au thème Clair. »
- « Utilise Opus pour cette session et réfléchis davantage. » « Quitte le mode Planifier et vas-y. »

L’agent commence par lire l’état actuel, puis vous demande de confirmer la modification sur une carte dans la conversation. La lecture ne demande jamais de confirmation : un agent peut toujours consulter vos paramètres, vos projets, vos tâches et le reste pour vous répondre.

## Demander à un agent de faire ce que fait un éditeur

Les agents modifient ce que vous conservez comme vous le feriez dans les éditeurs : ils rédigent des diapositives, des documents, des feuilles de calcul, des documents LaTeX, des notebooks et des diagrammes, et font en une seule fois ce qu’un éditeur fait sur l’ensemble d’un élément en un clic :

- **Diapositives** : animer chaque diapositive (**Discret**, **Dynamique** ou **Marquant**, ou retirer toutes les animations), corriger ce que **Vérifier l’accessibilité** détecte, décrire les images qui n’ont pas de description, rendre la présentation compatible avec PowerPoint ou la remettre au format web, lui appliquer un thème prêt à l’emploi ou l’un des vôtres, passer les diapositives en format large ou standard, importer des diapositives d’une autre présentation et mettre à jour les graphiques créés à partir d’une feuille de calcul.
- **Documents** : accepter ou rejeter les modifications suggérées, changer la mise en page, et ajouter un en-tête, un pied de page et des numéros de page.
- **Feuilles de calcul** : trier un tableau, en supprimer les doublons, recopier vers le bas ou vers la droite, effacer des cellules, supprimer les espaces superflus, répartir des mots en colonnes, résumer un tableau sur une nouvelle feuille (comme le fait **Données → Résumer par**), insérer ou supprimer des lignes et des colonnes, et renommer, copier, déplacer ou supprimer des feuilles ; les formules suivent, comme dans l’éditeur.
- **Documents LaTeX** : renommer ou déplacer des fichiers, des images et des dossiers, les lignes qui les citent étant mises à jour.
- **Notebooks** : effacer les sorties.
- **Diagrammes** : réorganiser une page (ou toutes les pages), sous forme d’organigramme vertical ou horizontal, d’arbre, de carte mentale, d’anneaux, de cercle ou de grille, et donner à toutes les formes le même aspect, à tous leurs textes la même police, ou à l’ensemble du diagramme l’apparence d’un dessin à la main.
- **N’importe lequel** : une copie conservée comme nouvel élément, ou un autre type d’élément créé à partir de celui-ci (**Transformer en**).

Chacun conserve une nouvelle version (la précédente reste parmi les versions), l’éditeur ouvert dessus l’affiche aussitôt, et vos propres modifications et commentaires sont conservés. Ces opérations sont gratuites et instantanées, sauf la description des images, qui est faite par un modèle. L’agent à côté d’une page ([Modifier en le demandant à un agent](/guide/library#change-it-by-asking-an-agent)) les connaît toutes, ainsi que ce que vous avez sélectionné précisément. Par exemple :

- « Anime chaque diapositive de ma présentation “Plan de lancement”, en mode dynamique, et corrige ce que la vérification d’accessibilité détecte. »
- « Rends ma présentation “Plan de lancement” compatible avec PowerPoint. »
- « Accepte les suggestions de Maria dans le document “Budget” et rejette les autres. »
- « Dans ma feuille de calcul “Ventes”, trie le tableau par chiffre d’affaires, du plus élevé au plus faible, et supprime les doublons. »
- « Dans ma thèse LaTeX, déplace les images de figures/ vers img/. »
- « Organise mon diagramme “Parcours de paiement” de gauche à droite et mets toutes les formes en bleu. »

## La carte : confirmer une modification

Avant qu’un agent ne modifie quoi que ce soit, une carte s’affiche dans la conversation (et dans votre [Boîte de réception](/inbox), avec une notification si vous êtes absent). Elle indique :

- **En quoi consiste la modification**, avec les mots de l’agent : « Créer le projet “Thèse” ».
- **Ce qui change**, champ par champ : un paramètre tel qu’il est maintenant et tel qu’il sera (« **Résultats** : 10 → 20 »), ou ce avec quoi un nouvel élément sera créé.
- **L’appel lui-même**, en petits caractères (par exemple `PUT /api/search/settings`), pour que vous voyiez exactement ce qui va se passer, quoi que dise l’agent. Une carte concernant l’un de vos agents montre plutôt l’agent : ce qu’il sera, ou ce qui change, en phrases, et le moment où chacune de ses planifications s’exécute.

Vous choisissez ensuite :

- **Autoriser** effectue la modification.
- **Autoriser pour cette session** l’effectue, et permet à cette session d’effectuer d’autres modifications du même type courant sans redemander. Les modifications qui demandent toujours confirmation (voir ci-dessous) la demandent encore.
- **Ne pas** (ou **Décliner**) ne change rien. Vous pouvez dire pourquoi, ou ce qu’il faut faire à la place, et l’agent le lit.

Certaines modifications demandent confirmation à chaque fois, même après **Autoriser pour cette session** : supprimer quoi que ce soit, démarrer une session ou l’exécution d’une tâche planifiée, ajouter, modifier ou retirer les planifications d’un agent, envoyer un message à une autre session, ajouter un serveur MCP, ajouter, activer ou modifier un plugin, modifier ce que les agents peuvent faire dans Custom ou dans le Navigateur, ajouter une machine ou un compte, télécharger un modèle, installer les outils d’image sur cet ordinateur, mettre à jour l’app. Pour une suppression, le bouton indique **Supprimer** ; pour un nouvel agent, **Créer l’agent**, et pour une modification d’un agent, **Enregistrer**.

Donner l’**Accès complet** à l’un de vos agents (il ne demande jamais) demande confirmation à chaque fois, même avec l’Accès complet dans cette session, comme pour les autorisations propres à une session.

Une carte attend environ neuf minutes. Si vous ne répondez pas dans ce délai, elle disparaît et l’agent vous pose la question dans sa réponse.

## Quand un agent a besoin de précisions : les formulaires

Quand un agent a besoin de plusieurs informations de votre part, il peut afficher un formulaire dans la conversation au lieu d’une liste de questions : les dates et le budget d’un voyage, le nom et les champs d’une nouvelle app. Remplissez-le et cliquez sur le bouton (**Envoyer**, ou le nom que l’agent lui a donné) ; **Pas maintenant** le ferme, et l’agent continue sans lui ou pose la question par écrit.

Un formulaire attend aussi longtemps qu’il le faut. Si vous n’avez pas répondu au bout d’environ neuf minutes, l’agent termine là son tour et le formulaire reste dans la conversation, même si l’agent s’arrête ou si l’app redémarre. Quand vous le remplissez, vos réponses sont transmises à l’agent comme votre message suivant (« Mes réponses à … »), et il reprend à partir de là ; si elles ne l’atteignent pas, le formulaire reste disponible pour que vous le renvoyiez. Un formulaire plus haut que l’écran s’ouvre sur son début, avec **Dernier** pour aller jusqu’à la fin.

Une carte de modification peut aussi contenir un formulaire : « Créer un projet » peut afficher le nom, la description et les consignes que l’agent a devinés, afin que vous les corrigiez avant de cliquer sur **Enregistrer**.

## Ce que les agents ne peuvent pas faire dans l’app

Certaines choses restent de votre ressort. Un agent qui essaie est renvoyé vers l’endroit où vous pouvez le faire :

- votre mot de passe, ainsi que la connexion et la déconnexion ([Paramètres → Mot de passe](/settings?s=security), [Comptes](/settings?s=accounts)) ;
- les valeurs des clés et des connexions : un agent les demande au moyen d’une carte où vous les saisissez dans le Coffre, et ne les voit jamais ([Apps connectées, clés et outils](/guide/connections)) ; la clé OpenRouter a sa propre carte, qui l’enregistre directement dans Paramètres → Modèles ([Quand un agent a besoin de la clé OpenRouter](/guide/documents-voice#when-an-agent-needs-the-openrouter-key)) ;
- la création de jetons d’accès pour d’autres machines ou agents, et des clés d’API d’une app ;
- la réponse aux cartes d’approbation, les siennes ou celles d’une autre session, et les décisions sur les cartes qui vous sont adressées (une compétence proposée, une tâche planifiée, une publication) ;
- les fichiers, les commandes, les terminaux et git via l’app : les agents utilisent pour cela leurs propres outils, qui vous demandent confirmation selon les autorisations de la session ;
- les outils d’IA propres aux éditeurs et les éditeurs d’images et de vidéos : les agents créent, trouvent, modifient et retouchent des images, des dessins, des graphiques et des vidéos avec leurs propres outils, qui enregistrent leurs productions dans le dossier de la session ([Documents, images, vidéos et voix](/guide/documents-voice)), et ils commentent les diapositives avec une voix off lisant les notes de chacune.

## Autorisations et cartes

Ce que les autorisations d’une session permettent détermine dans quelle mesure les cartes demandent confirmation :

- **Plan** (et **Lecture seule** pour Codex) : l’agent peut lire les paramètres de l’app et répondre aux questions, mais ne change rien. Il vous dit ce qu’il modifierait. Une exception : les paramètres de sa propre session. Demandez-lui de quitter le mode Planifier, d’utiliser un autre modèle ou de réfléchir davantage, et il vous le demande sur une carte.
- **Demander**, **Accepter les modifications**, **Automatique** et les modes similaires : les modifications demandent confirmation sur une carte, comme décrit plus haut.
- **Contourner** (Claude Code) et **Accès complet** (Codex) : pas de cartes ; l’agent effectue les modifications que vous demandez. Un formulaire s’affiche tout de même quand l’agent a besoin de précisions.
- **Accès complet** de Custom : pas de cartes d’approbation, y compris pour les modifications qui demandent normalement confirmation à chaque fois. Un formulaire s’affiche tout de même quand des précisions sont nécessaires.

Quelles que soient les autorisations, une modification des autorisations d’une session ou de son plafond de dépenses demande toujours confirmation sur une carte, sans **Autoriser pour cette session** : « Passer cette session en mode Contourner », « Relever le plafond à 20 $ ». Vous pouvez les demander dans l’app comme dans le terminal ; le terminal affiche la même carte, et **y** ou **n** y répond.

## Paramètres propres à chaque appareil

Quelques paramètres appartiennent à chaque appareil plutôt qu’à l’app : le thème, la langue, le son des notifications, ce que fait Entrée pendant qu’un agent travaille, les suggestions du terminal et l’affichage de la Barre latérale. Un agent peut les modifier sur l’appareil depuis lequel vous lui parlez (les pages qui affichent cette session), sans carte : « Passe au thème Sombre », « Utilise le thème Sage », « Affiche l’app en grec ». Vos autres appareils conservent leurs propres paramètres.

## Demander à un agent

- « Comment recevoir des notifications sur mon téléphone ? »
- « Crée un projet pour mes projets de jardin et donne-lui cette consigne : nous vivons dans un climat froid. »
- « Désactive les captures d’écran du Navigateur. »
- « Montre-moi les tâches planifiées que j’ai et désactive la surveillance des prix. »
- « Passe cet appareil au thème Clair. »
- « Passe cette session à Sonnet avec un effort faible. »
