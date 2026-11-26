# Mémoire

Les agents de Hydor retiennent l’essentiel d’une session à l’autre : des faits sur vous, sur chaque projet, l’état d’avancement d’une tâche, et un profil de vous avec lequel chaque agent démarre. Cette rubrique explique ce qu’ils conservent et quand, votre profil, ce qu’un agent reçoit au départ, comment voir, corriger ou annuler ce qui a été enregistré, et tout ce qui se trouve dans Paramètres → Mémoire, y compris la recherche par le sens et le ménage qui se fait tout seul. Servez-vous-en pour que les agents ne vous posent plus deux fois les mêmes questions, et pour savoir à tout moment ce qu’ils savent.

![Paramètres → Mémoire : ce que les agents retiennent sur vous et sur vos projets](images/memory.webp)

## Ce que les agents retiennent

La mémoire comporte trois parties, qui fonctionnent ensemble :

- **Notes de la mémoire** : de courts faits avec lesquels chaque agent démarre, sur vous, sur un projet ou sur une session. Cette rubrique leur est surtout consacrée.
- **Mémoire wiki** : des articles plus longs, accompagnés de leurs sources, que les agents conservent pour chaque projet (et un ensemble partagé), rédigés à partir de ses documents, de ses conversations et de ses commits (voir [Mémoire wiki](/guide/wiki-memory)). Sans que vous ayez à le demander, les agents reçoivent une ligne pour les articles en rapport avec votre demande, ainsi que les plans en cours du projet.
- **Documents** : les fichiers eux-mêmes, que les agents recherchent et citent, mais qu’ils ne reçoivent pas d’office. Ils sont conservés dans [Connaissances partagées](/knowledge) et dans l’onglet **Mémoire** de chaque projet, avec ses notes et ses articles wiki (le filtre **Documents** ; voir [Projets et connaissances](/guide/projects)).

L’onglet **Mémoire** d’un projet affiche les trois dans une même liste, avec un champ de recherche (voir [L’onglet Mémoire d’un projet](/guide/wiki-memory#a-projects-memory-tab)). Quand un document est ajouté ou modifié, le modèle d’appoint le lit, ajoute quelques notes à la mémoire du projet et met à jour son wiki (voir [Apprendre des nouveaux documents](/guide/wiki-memory#learn-from-new-documents)).

Les notes de la mémoire sont courtes : chacune tient en une phrase ou deux, 500 caractères au plus. Tous les agents que l’app exécute les partagent : Claude Code, Codex, Custom et les agents qui parlent ACP, comme Gemini CLI. Les mémoires propres à Claude Code et à Codex sont désactivées dans les sessions que l’app exécute ; ces notes sont donc l’unique mémoire qu’ils partagent, et vous pouvez voir et annuler tout ce qu’ils conservent. Chaque note appartient à l’un de ces trois endroits :

- **À propos de vous** : des faits durables et des préférences vous concernant (« Préfère les unités métriques », « Aime les réponses courtes », « Travaille surtout en Python »). Chaque session les reçoit.
- **Un projet** : des faits sur un projet, comme ses conventions, les commandes qui le construisent et le testent, l’emplacement des choses et les décisions prises. Le projet est le dossier dans lequel travaille une session : le dossier racine de son dépôt Git quand il en a un, ou le dossier lui-même sinon. Un worktree (une copie distincte d’un dépôt, sur sa propre branche) partage les notes de son dépôt principal, si bien que les sessions de toutes les branches voient les mêmes. Une session dans votre dossier personnel lui-même n’a pas de notes de projet : elle reçoit seulement ce qui vous concerne et ce qui lui est propre.
- **Une session** : où en est une tâche, pour que cette session la reprenne quand elle continue. Ces notes disparaissent quand la session est supprimée.

Une session ne voit et ne modifie que trois ensembles de notes : celles qui vous concernent, celles de son propre projet et les siennes. Un agent qui travaille dans un projet ne voit jamais les notes d’un autre projet. Les sessions d’un [projet](/guide/projects) travaillent toutes dans le dossier du projet, elles partagent donc ses notes de projet. Une tâche qui reçoit un nouveau dossier à elle (voir [Agents](/guide/agents)) a ce dossier pour projet.

Les notes sont aussi liées au code du projet : une note de projet qui nomme des fichiers ou des dossiers est liée à eux dans le dépôt Git du projet, ainsi qu’au commit auquel elle a été écrite. Hydor peut ainsi savoir quand le code a évolué par rapport à ce que dit la note (voir [Ménage automatique](/guide/memory#tidy-up-automatically)).

Quand un endroit contient beaucoup de notes, d’autres types d’entrées y apparaissent : des **sujets**, qui résument chacun un groupe de notes liées, et, pour un projet, un **profil**, un court résumé que les agents reçoivent toujours en premier. C’est le ménage qui les rédige (voir [Ménage automatique](/guide/memory#tidy-up-automatically)), ainsi qu’un titre court pour chaque note et chaque sujet, destiné à l’index avec lequel les agents démarrent. Votre propre profil est autre chose : vous et vos agents l’écrivez (voir [Votre profil](/guide/memory#your-profile)).

La mémoire fonctionne dans les sessions que cette app exécute, pas dans celles qu’elle se contente de lister, comme une session ouverte dans un terminal ou dans VS Code.

## Comment les notes sont écrites

Les agents enregistrent des notes dans deux cas : quand vous le demandez (« Retiens que je suis végétarien », « Retiens que le serveur de test est test.example.com »), ou quand ils apprennent quelque chose de durable qu’une session ultérieure ne pourrait pas découvrir seule : ce que vous voulez, une décision et sa raison, un piège, une règle apprise à la dure. Rien n’est écrit tout seul après une réponse : les notes viennent d’agents qui choisissent de les enregistrer, de notes que vous écrivez ou modifiez vous-même, et du ménage, qui retravaille les notes déjà conservées (en les fusionnant, en les vérifiant par rapport au code, en les déplaçant vers le projet qu’elles concernent) et, quand [Apprendre à partir des conversations](/guide/memory#learn-from-conversations) est activé, retient au plus trois choses par jour qu’aucun agent n’a enregistrées.

- **L’agent choisit l’endroit** : à propos de vous, ce projet ou cette session. Quand il enregistre comme concernant vous une note qui nomme un projet (par son nom, par le nom de son dossier, ou par un fichier présent dans ce seul projet), la réponse qu’il reçoit le signale. Dans une session de ce projet, il lui est dit d’enregistrer de nouveau la note comme concernant le projet, et d’oublier la première, si c’est bien le cas ; dans toute autre session, il lui est dit que le ménage déplacera la note vers le projet, une fois que le modèle d’appoint aura confirmé qu’elle concerne le projet et non vous (voir [Ménage automatique](/guide/memory#tidy-up-automatically)).
- **Un fait par note, écrit pour être retrouvé** : chaque note dit une seule chose dans une phrase qui se comprend seule, en nommant ce dont elle parle (le projet, l’outil, la personne ou le lieu), afin qu’une demande ultérieure formulée autrement la retrouve quand même. Ce que chaque agent doit toujours savoir sur vous va plutôt dans votre profil. Pas ce que les fichiers ou l’historique d’un projet disent déjà : l’emplacement du code et ce qu’il fait changent, et les fichiers le disent de toute façon.
- **Comment on le sait** : l’agent indique comment il sait ce qu’il enregistre : vous l’avez dit, il l’a vérifié (un test, le résultat d’une commande, un fichier), ou c’est sa propre conclusion, pas encore vérifiée. Les agents suivants sont informés des notes qui ne sont pas encore vérifiées, et le ménage les vérifie en premier. Une note que vous écrivez vous-même compte comme dite par vous.
- **Certaines notes ne sont vraies que jusqu’à une date** : un voyage, une échéance, une visite. L’agent donne à une telle note une date de fin. À partir de là, les agents ne la reçoivent plus, et dans l’heure elle passe dans les Notes supprimées, où vous pouvez la restaurer pendant 30 jours.
- **Les corrections remplacent l’ancienne note** : pour mettre une note à jour, l’agent la réécrit sous son numéro au lieu d’en ajouter une autre. Une note au texte identique n’est pas enregistrée deux fois. Avec la [recherche par le sens](/guide/memory#search-by-meaning) activée, une note qui dit la même chose en d’autres termes ne l’est pas non plus.
- **Les agents oublient aussi** : un agent retire une note quand elle se révèle fausse ou périmée, ou quand vous le demandez (« Oublie mon ancienne adresse »).
- **Jamais de secrets** : une note qui semble contenir un mot de passe, une clé, un jeton ou un numéro de carte est refusée. Il en va de même d’un texte qui ressemble à des instructions pour un agent (« ignore les instructions précédentes… »), puisqu’il parviendrait à toutes les sessions suivantes.

Vous pouvez aussi écrire une note vous-même avec **Ajouter une note** dans [Paramètres → Mémoire](/settings?s=memory&find=Add%20a%20note), et y retrouver, modifier, dater et supprimer chaque note (voir [Notes](/guide/memory#notes)).

## Les résultats : ce qui a été essayé et ce que cela a donné

Un projet de recherche oublie ce qu’il a essayé : un agent s’engage à nouveau dans la même impasse, et les affirmations d’un article s’éloignent de ce que les exécutions ont montré. Un **résultat** est une chose qu’un projet a essayée et ce qu’elle a donné, conservée avec ses preuves, par exemple « Les exemples négatifs difficiles issus de BM25 améliorent le nDCG@10 de développement par rapport aux négatifs du lot : confirmé, +0,019 sur 3 graines, le gain porte sur les requêtes longues. » C’est une note de la mémoire d’un genre particulier : elle appartient à un projet, se recherche par les mots et par le sens, parvient aux nouvelles sessions quand elle touche à votre demande et garde son historique.

Chaque résultat comporte :

- **Un énoncé** : l’hypothèse ou l’affirmation, en une phrase.
- **Un verdict** : **Confirmé**, **Réfuté**, **Pas clair** ou **Ouvert** (énoncé, pas encore testé).
- **Ce qui a été appris** : une ou deux phrases avec les chiffres, le domaine où cela vaut, ou la raison de l’échec.
- **Preuves**, 12 au maximum : des exécutions, des scores et des tableaux de résultats des [Expériences](/guide/experiments), des commits, des fichiers, des articles et des sessions. Un chiffre cité dans ce qui a été appris doit être accompagné de l’exécution, du score ou du tableau dont il provient, sans quoi le résultat est refusé.

**Les agents les consignent.** Dans un projet, il est demandé aux agents de consulter ses résultats avant de proposer ou de lancer une expérience, et d’en consigner un après chaque issue, y compris quand cela n’a pas marché ou n’était pas clair. Le [sprint de recherche](/guide/researchers#research-sprint) en consigne un pour chacune de ses hypothèses, et **Essayer de le réfuter** consigne son verdict sur l’affirmation. **Les impasses sont gardées à dessein** : le rangement ne fusionne, ne résume, ne déplace ni ne retire jamais un résultat (et la construction d’un wiki à partir de l’historique du projet ne les lit pas non plus), et le retrait d’un résultat n’est jamais suggéré au motif qu’aucun agent n’en a eu besoin récemment. Deux résultats qui se contredisent sont tous deux gardés, jusqu’à ce qu’un résultat ultérieur remplace l’autre : le nouveau indique ce qu’il remplace, et l’ancien quitte la liste mais reste dans son historique.

**Où les voir.** L’onglet **Mémoire** d’un projet comporte un filtre **Résultats** à côté de **Notes**, **Wiki** et **Documents** (voir [L’onglet Mémoire d’un projet](/guide/wiki-memory#a-projects-memory-tab)), avec un filtre plus petit pour chaque verdict. Une ligne affiche l’énoncé, le verdict et son ancienneté. Ouvrez-en un pour le lire en entier : ce qui a été appris, ses preuves sous forme de liens qui ouvrent chaque exécution, commit, fichier, article ou session, qui l’a consigné et quand, et ce qu’il remplace. Quand un fichier donné comme preuve a changé depuis dans le dépôt Git du projet, la ligne indique **code modifié depuis** et le résultat précise « Le code sur lequel cela repose a changé depuis. », avec les fichiers : testez-le à nouveau avant de vous y fier. Les résultats apparaissent aussi parmi les notes du projet dans [Paramètres → Mémoire](/settings?s=memory), avec la mention **Résultat**.

**Modifier ou oublier un résultat.** Ouvrez-le et appuyez sur **Modifier** pour corriger à la main son verdict, son énoncé ou ce qui a été appris. **Oublier** le retire ; il reste dans les [notes supprimées](/guide/memory#deleted-notes) pendant 30 jours, pour être restauré. Vous pouvez aussi le demander à un agent : il consigne l’issue la plus récente à la place de l’ancienne, ou l’oublie. Désactiver la mémoire désactive aussi les résultats.

## Votre profil

En plus des notes, la mémoire conserve un profil de vous : qui vous êtes et ce que vous faites, ce que vous utilisez, comment vous aimez les réponses et ce qu’il faut éviter. Tant que la mémoire est activée, chaque agent le reçoit une fois, au début d’une session, juste après vos [Consignes des agents](/guide/guidelines), et s’en sert pour adapter sa façon de travailler avec vous ; vos consignes et ce que vous dites dans une session passent toujours avant. Les notes contiennent ce qui compte de temps à autre ; le profil contient ce que chaque agent doit toujours savoir.

- **Les agents le tiennent à jour.** Quand ce que vous dites révèle quelque chose de durable qui aidera tous les agents à mieux vous servir, comme votre travail, les outils que vous utilisez ou la façon dont vous aimez les réponses, l’agent réécrit le profil en conséquence. La plupart des messages ne changent rien. La modification apparaît sous sa réponse sous la forme **Votre profil**, avec possibilité de l’annuler (voir [Voir ce qu’un agent a enregistré après une réponse](/guide/memory#see-what-an-agent-saved-after-a-reply)). Les agents n’y mettent jamais de secrets, ne peuvent pas l’effacer et ne peuvent pas écraser une modification faite depuis le début de leur session : on leur montre le profil tel qu’il est maintenant, et ils réessaient.
- **Écrivez-le vous-même.** Dans [Paramètres → Mémoire](/settings?s=memory&find=Your%20profile), le premier groupe, **Votre profil**, l’affiche sur six lignes, avec **Tout afficher** (et **Afficher moins**) quand il est plus long. **Modifier** (ou **Le rédiger**, tant qu’il n’y en a pas), à côté du titre du groupe, l’ouvre en écriture : Enter passe à la ligne, Ctrl+Enter (⌘+Enter sur Mac) ou **Enregistrer** l’enregistre, et Escape ou **Annuler** le laisse tel qu’il était. Pendant que vous écrivez, un compteur indique combien de mots il contient, sur combien il peut en contenir.
- **Quelle longueur.** La [longueur du profil](/settings?s=memory&find=Profile%20length), dans le groupe **Ce que reçoivent les agents** plus bas dans la page, est le nombre maximal de mots : 250, 500, 1 000 (le réglage habituel) ou 2 000 mots. Les agents s’y tiennent. Un profil plus long, enregistré par vous ou resté tel quel quand vous choisissez une longueur plus courte, est conservé tel qu’il est écrit pendant que le modèle d’appoint le raccourcit en arrière-plan pour qu’il tienne (« Raccourcissement pour tenir en 1 000 mots… ») ; la version plus courte apparaît comme modifiée **par le modèle d’appoint**. Il abandonne au bout de 4 minutes au plus (« Le modèle d’appoint n’a pas répondu en 4 minutes »). Quand le modèle d’appoint n’y arrive pas, la raison s’affiche sous le profil, avec **Réessayer** ; quand c’est parce qu’un compte est déconnecté, la raison le dit (« Votre compte Claude Code « Travail » est déconnecté, et aucun autre compte ni modèle Custom n’a pu s’en charger : connectez-vous de nouveau (Paramètres → Agents → Comptes). ») et une carte vous invite à vous connecter (voir [Quand un compte est déconnecté](/guide/agents-models#when-an-account-is-signed-out)).
- **En dessous** : le nombre de mots qu’il contient, sur combien il peut en contenir, ainsi que la date de sa rédaction ou de sa dernière modification et son auteur : **par vous**, **par un agent** (avec la session d’où elle vient) ou **par le modèle d’appoint**. Le menu **⋯** (menu du profil) à côté de **Modifier** propose **Historique des modifications**, avec chaque version, son auteur et la raison, et **Effacer le profil**, qui demande d’abord confirmation. Un profil effacé reste dans les [Notes supprimées](/guide/memory#deleted-notes) pendant 30 jours, et **Restaurer** le ramène.

## Voir ce qu’un agent a enregistré après une réponse

Quand un agent enregistre, modifie ou retire des notes au cours d’un tour, une pastille apparaît sous sa réponse, par exemple **Mémoire · 1 ajoutée, 1 mise à jour**. Elle compte les modifications encore en vigueur (ajoutées, mises à jour, retirées) ; quand toutes ont été annulées, elle indique **annulée**. Plusieurs modifications au cours d’un même tour s’affichent sous une seule pastille, et une note modifiée plusieurs fois apparaît comme une seule modification, de ce qu’elle disait avant à ce qu’elle dit après.

Cliquez sur la pastille pour l’ouvrir. Chaque modification montre :

- Un badge : **Ajouté**, **Mise à jour**, **Retiré** ou **Annulée**.
- L’endroit auquel appartient la note (**À propos de vous**, **Projet ·** suivi du nom du dossier, **Cette session** ou **Une autre session** ; **Votre profil** pour une modification de votre profil), « enregistrée par l’agent », et le nombre de modifications qu’elle a subies au cours de ce tour.
- Le texte. Pour une mise à jour, les mots retirés sont barrés et les mots ajoutés sont surlignés. Quand l’essentiel a été réécrit, l’ancien texte apparaît barré au-dessus du nouveau.
- **Modifié de nouveau depuis**, quand la note a été modifiée après ce tour : cliquez dessus pour voir ce qu’elle dit maintenant.
- Une dernière ligne avec la raison donnée par l’agent, le cas échéant, et **Supprimé depuis** ou **Plus conservé** quand la note a été supprimée ou effacée après ce tour.

Les boutons de chaque modification :

- **Annuler cette modification** (ou **Annuler ces modifications**) : une note ajoutée disparaît, une note mise à jour retrouve son ancien texte, une note retirée revient.
- **Modifier** : modifiez le texte sur place. Enter enregistre, Shift+Enter passe à la ligne, Escape annule. Pour votre profil, cela ouvre Paramètres → Mémoire, où le profil dispose de la place nécessaire pour ses lignes.
- **Supprimer** : supprime la note. Elle reste dans les Notes supprimées des Paramètres pendant 30 jours. Votre profil n’a pas de bouton Supprimer ici : effacez-le dans les Paramètres.
- **Restaurer** : ramène une note qui a été supprimée depuis.

Le menu **⋯** (Options de la mémoire) en haut de la pastille ouverte propose **Mémoire de cette session**, qui désactive ou active la mémoire pour cette session, et **Toute la mémoire**, qui ouvre Paramètres → Mémoire. Cliquez sur la ligne du haut de la pastille pour la refermer.

## Ce avec quoi un agent démarre

Un agent ne reçoit pas toute la mémoire. Il démarre avec une courte explication de la mémoire, votre profil, un index de ce qui est conservé et les notes qui concernent votre demande. Ensuite, il ne reçoit plus rien, sauf quand un élément nouveau concerne ce qu’il fait, et il peut toujours chercher le reste. Ce qu’il reçoit sert de contexte : on indique à l’agent que les notes peuvent être périmées, lesquelles n’ont pas encore été vérifiées, que ce que vous dites maintenant prime toujours, et qu’il ne doit pas les mentionner si elles ne l’aident pas.

- **Au démarrage** :
  - votre profil (voir [Votre profil](/guide/memory#your-profile)) ;
  - le profil de ce projet, s’il en a un. Il place en premier les règles permanentes dont les agents ont besoin dans la plupart des sessions : comment faire un commit, compiler, tester et livrer, et les préférences durables du projet ;
  - les notes propres à cette session, quand la session se poursuit ;
  - toutes les notes d’un lieu qui n’en contient que quelques-unes (à propos de vous, ou un projet sans encore aucun sujet) ;
  - pour un lieu plus grand, les notes et les sujets qui ressortent pour votre premier message, au plus 10, sauf si vous changez cette limite avec [Notes avec lesquelles chaque agent démarre](/settings?s=memory&find=Notes%20each%20agent%20starts%20with). Rien n’est transmis juste pour remplir la place : quand moins de notes sont pertinentes, l’agent en reçoit moins, ou aucune ;
  - jusqu’à trois lignes qui nomment les articles du wiki du projet concernant votre message (« Du wiki de ce projet (wiki_read en ouvre un) » : le titre de chaque article, ce qu’il dit en une ligne, et où il se trouve ; marqué « peut être périmé » quand les fichiers qu’il cite ont changé depuis sa rédaction), ainsi que les plans en cours du projet, avec leurs points ouverts (voir [Mémoire wiki](/guide/wiki-memory#how-it-sits-beside-notes-and-documents)).
- **Comment elles arrivent** : Claude Code et Codex reçoivent l’explication, les profils, les notes d’un petit lieu et l’index dans les instructions avec lesquelles ils démarrent, et les notes concernant votre demande avec votre premier message. Ces instructions sont les mêmes pour toutes les sessions d’un projet tant que ses notes ne changent pas ; le fournisseur du modèle réutilise donc ce qu’il en a gardé d’une session à l’autre, ce qui est plus rapide et coûte moins cher. Les agents qui parlent ACP reçoivent tout avec votre premier message. [Custom](/guide/custom) reçoit tout en un seul bloc avant son premier tour et le garde pendant qu’il travaille.
- **À chaque message** : quand vous écrivez à nouveau, la mémoire est interrogée pour le nouveau message, avec un seuil plus strict qu’au démarrage. Ce qui concerne désormais ce message l’accompagne, sous « De la mémoire, nouvellement pertinent pour ce message » : au plus trois notes (1 500 caractères), jamais une note déjà transmise à la session, et au plus une ligne d’article du wiki. Le plus souvent, il n’y a rien à ajouter et rien n’est dit. Une commande, ou un message d’un ou deux mots, n’apporte aucune note. Cela vaut pour Claude Code, Codex, Custom et les agents qui parlent ACP.
- **Quand un agent ouvre ou modifie un fichier** : les notes sur ce fichier, son dossier et le dossier au-dessus arrivent aussitôt (jamais le projet entier), chaque dossier une seule fois par session, avec au plus deux notes (800 caractères). Claude Code les reçoit juste après la lecture ou la modification, par un hook que l’app lui fournit, sauf si vos propres paramètres de Claude Code désactivent les hooks ; Custom les reçoit dans la sortie de l’outil ; Codex et les autres agents qui parlent ACP les reçoivent avec votre message suivant. Une note est liée à un fichier quand elle le nomme, ou nomme son dossier, dans le dépôt du projet.
- **Quand une session se poursuit** : une session qui reprend dans l’heure (après un redémarrage de l’app, par exemple) reçoit de nouveau les mêmes instructions, avec ses propres notes et celles qui concernent votre dernier message, et rien de ce qu’elle avait déjà reçu, sauf si sa conversation a été condensée depuis. Quand Claude Code ou Codex reprend après la condensation de sa conversation, il reçoit une fois le point de contrôle de la session : où le lire, et son résumé, jusqu’à 3 000 caractères (voir [Points de contrôle](/guide/wiki-memory#checkpoints)). Custom, quand il condense une longue conversation, relit la mémoire pour votre dernier message et reçoit aussi le point de contrôle.
- **Modèles à petit contexte** (Custom) : la part du contexte du modèle que la mémoire peut occuper diminue avec lui. Un modèle de moins de 12 000 jetons reçoit un petit bloc (6 % de son contexte au plus) avec les 120 premiers mots de votre profil, au plus trois notes, sans index, sans lignes de wiki ni plans, et rien n’est ajouté avec un message ou un fichier. Un modèle jusqu’à environ 33 000 jetons reçoit un bloc d’au plus 6 % de son contexte, les 400 premiers mots de votre profil, cinq notes, un court index, une ligne de wiki et une ligne de plan, et au plus une note avec un message et une sur un fichier. Un profil tronqué l’indique, et une telle session ne peut pas le réécrire : l’agent vous dit quoi ajouter, ou vous le modifiez dans les Paramètres. Les modèles plus grands, et tous les autres agents, reçoivent tout ce qui précède (voir [Modèles à petit contexte](/guide/custom#what-the-model-reads)).
- **L’index** : pour chaque lieu plus grand, l’agent reçoit aussi les titres de ses notes et de ses sujets (Custom : de ceux qu’il n’a pas reçus), afin de savoir ce qui est conservé et de le chercher quand il en a besoin ; un sujet représente les notes qu’il résume. Ce que les agents ont le plus utilisé vient en premier (ce qui a servi une fois, puis 2 à 3 fois, puis 4 à 7, et ainsi de suite), et quand le reste ne tient pas, il est compté par zone du projet : « et par zone : server/memory (6) · web/src (4) · autres (12) ». Le rangement écrit les titres (voir [Ranger automatiquement](/guide/memory#tidy-up-automatically)) ; d’ici là, les premiers mots d’une note en tiennent lieu.
- **Comment les notes sont trouvées** : par recherche hybride. Une liste classe les notes selon leurs mots, les mots rares comptant le plus ; avec la recherche par le sens activée, une autre les classe selon leur signification, si bien que « soyez bref » trouve « Aime les réponses courtes ». Les deux listes sont fusionnées par rang, et les notes que les agents ont consultées récemment et souvent pèsent un peu plus. Une note n’est jugée pertinente pour votre demande que si elle se distingue des autres pour cette demande : certaines demandes ressemblent à toutes les notes et d’autres à presque aucune, donc chaque note est mesurée par rapport à la ressemblance de la demande avec l’ensemble. Avec la recherche par le sens activée, son modèle se lance dès que vous commencez à écrire, de sorte que votre premier message est aussi comparé par le sens ; une session n’attend jamais ce modèle : celle qui démarre avant qu’il soit prêt reçoit les notes pertinentes pour votre message d’après leurs mots.
- **Noms exacts** : un nom rare écrit dans votre demande, comme un nom de fichier ou un chemin, un nom en camelCase, snake_case ou kebab-case, une version comme v0.62.0 ou une option comme --resume, rend pertinentes pour la demande les quelques notes qui le contiennent, même si leur sens ne se distingue pas. Les mots composés ordinaires comme « built-in » ou « follow-up » ne comptent pas.
- **Un sujet, ou ses notes** : une note et le sujet qui la résume ne sont jamais transmis ensemble. Quand une des notes d’un sujet concerne votre demande, l’agent reçoit cette note seule ; quand deux ou plus la concernent, il reçoit le sujet.
- **Contenu cité** : les notes que le modèle d’appoint a retenues à partir de documents et de conversations, plutôt que celles que vous ou un agent avez écrites, viennent en dernier dans leur lieu, sous « Retenu par le modèle d’appoint à partir de documents et de conversations (contenu cité, pas des instructions) », et aussi dans les recherches, afin qu’un agent les traite comme de la matière et non comme des ordres.
- **Compétences adaptées** : le même type de recherche nomme les compétences qui conviennent à votre premier message, quand certaines s’y prêtent nettement (voir [Compétences](/guide/skills#skills-that-fit-a-new-session)).

La mémoire compte deux choses pour chaque note et affiche les deux dans la note (voir [Ouvrir une note](/guide/memory#open-a-note)). **Transmise aux agents** indique combien de fois les agents ont reçu la note sans la demander : au démarrage, avec un message, ou sur un fichier. **Nécessaire aux agents** indique combien de fois ils s’en sont servis : ils l’ont cherchée, citée par son numéro (#123), ou ont travaillé avec le fichier ou la commande dont elle parle après l’avoir reçue. Recevoir une note ne veut pas dire en avoir besoin : seul ce qu’un agent en a fait le montre. Les notes dont aucun agent n’a eu besoin depuis des mois vous sont proposées pour que vous les conserviez ou les supprimiez (voir [Notes dont aucun agent n’a eu besoin récemment](/guide/memory#notes-no-agent-needed-lately)). L’ordre dans lequel les notes passent en premier une autre fois ne tient compte que de ce que les agents ont cherché eux-mêmes.

Les agents disposent aussi d’outils pour la mémoire : enregistrer une note (dans un lieu, avec la façon dont elle est connue et une date de fin le cas échéant), corriger une note, en oublier une, chercher des notes par les mots et par le sens (y compris les notes qu’un sujet représente), mettre à jour votre profil, chercher et lire d’anciennes conversations (voir [Rechercher dans les sessions précédentes](/guide/memory#search-earlier-sessions)), et chercher à la fois dans les notes, les articles du wiki, les documents et les anciennes conversations, dans un projet ou dans tous (voir [Chercher au-delà d’un projet](/guide/memory#search-beyond-one-project)). Une note trouvée par une recherche compte aussi comme nécessaire.

## Désactiver la mémoire pour une session

Démarrez une session sans mémoire depuis la page de démarrage :

1. Sous la zone de message, ouvrez **Options**.
2. Ouvrez **Mémoire** et choisissez **Désactivée pour cette session** (« Repart de zéro et n’en garde rien »). **Activé** (« Utilise et enrichit ce dont les agents se souviennent ») est le réglage habituel.
3. La pastille Options affiche maintenant **Sans mémoire**. La page de démarrage conserve ce choix pour vos prochaines sessions aussi, jusqu’à ce que vous remettiez Activé.

**Ce dont les agents se souviennent**, en bas de ce menu, ouvre Paramètres → Mémoire. Sur un téléphone, ces menus s’ouvrent en volets depuis le bas de l’écran. L’option Mémoire n’y figure pas tant que la mémoire est désactivée pour toutes les sessions.

Pour une session déjà en cours, ouvrez le menu de la session (⋯) → **Paramètres de la session** → **Mémoire**. Son indication affiche **Activé** ou **Désactivé** ; cliquez dessus pour basculer. Le même commutateur se trouve dans le ⋯ de la pastille de mémoire, sous le nom **Mémoire de cette session**. Tant que la mémoire est désactivée pour toutes les sessions, les deux sont grisés, avec l’indication **Désactivée pour tous**.

Quand la mémoire est désactivée, une session « ne lit ni n’écrit de notes » :

- Son agent ne reçoit ni notes, ni profil, ni outils de mémoire, et rien de la session n’est enregistré.
- Les agents des autres sessions ne peuvent pas la trouver quand ils cherchent dans d’anciennes conversations, et ne peuvent pas la lire.

L’éditeur d’une tâche planifiée a la même pastille Mémoire, de sorte que ses exécutions peuvent se faire sans mémoire (voir [Tâches planifiées](/guide/tasks)). Les exécutions lancées depuis la page publique d’une app ont toujours la mémoire désactivée (voir [Apps](/guide/apps)).

## Désactiver la mémoire pour toutes les sessions

Désactivez le commutateur **Mémoire** à côté du titre de [Paramètres → Mémoire](/settings?s=memory&find=Memory), en haut à droite de la section. Une fois désactivé, un avis en haut de la page indique : « La mémoire est désactivée : les agents ne reçoivent aucune note et n’enregistrent rien de nouveau. Vos notes restent. »

Tant qu’elle est désactivée :

- Aucun agent ne reçoit de notes, votre profil ou des outils de mémoire, et rien n’est enregistré.
- Vos notes restent. Réactivez le commutateur et les agents les reçoivent de nouveau.
- L’option Mémoire disparaît de la page de démarrage, et la zone de recherche (Ctrl+K) cesse d’afficher les notes.
- **Apprendre des conversations**, **Ranger automatiquement**, la ligne **Dernier rangement** avec **Ranger maintenant**, et **Recherche par le sens** sont grisés.
- Votre profil et vos notes restent sur la page : vous pouvez toujours les lire, les modifier, en ajouter, les supprimer et les exporter.

## Paramètres → Mémoire

Tout ce qui concerne la mémoire se trouve dans [Paramètres → Capacités → Mémoire](/settings?s=memory) : « Ce dont les agents se souviennent à propos de vous, de vos projets et de chaque session, et quand cela a été écrit ». Le commutateur **Mémoire** est à côté du titre de la section, et **En savoir plus** sous le titre ouvre cette rubrique. En dessous, de haut en bas, la page comporte six groupes, et une ligne au-dessus qui nomme les trois parties de la mémoire :

- **Votre profil** : ce que chaque agent reçoit à votre sujet, avec **Modifier** et un menu **⋯** (voir [Votre profil](/guide/memory#your-profile)).
- **Notes** : toutes les notes conservées, avec **Ajouter une note**, un champ de recherche et un index des lieux (voir [Notes](/guide/memory#notes)).
- **Apprentissage** : **Apprendre des conversations**, **Ranger automatiquement**, et le **Dernier rangement** avec **Ce qui a changé** et **Ranger maintenant**.
- **Mémoire wiki** : si les projets tiennent un wiki, l’apprentissage à partir des nouveaux documents, et l’endroit où les wikis sont conservés (voir [Mémoire wiki](#wiki-memory)).
- **Ce que reçoivent les agents** : **Recherche par le sens**, **Notes avec lesquelles chaque agent démarre** et **Longueur du profil**.
- **Vos données** : **Importer…** depuis d’autres assistants, **Exporter** (Markdown, JSON) et **Tout effacer…**.

Le nom d’une ligne peut avoir à côté un bouton **(i)**, qui explique plus en détail ce que fait la ligne. Sur un téléphone, les Paramètres s’ouvrent sous forme de liste : touchez **Mémoire** pour l’ouvrir sur sa propre page. Les notes y occupent toute la largeur de l’écran, et chaque menu de la page s’ouvre en volet depuis le bas de l’écran.

### Mémoire wiki

Le groupe **Mémoire wiki** réunit les réglages des articles que les agents tiennent pour chaque projet (voir [Mémoire wiki](/guide/wiki-memory), qui explique ce qu’ils sont et comment ils fonctionnent) :

- **Mémoire wiki** : activée au départ, pour le wiki partagé et pour chaque projet, sauf si son propre onglet **Paramètres** dit le contraire.
- **Apprendre des nouveaux documents** : activé au départ. Les documents nouveaux et modifiés ajoutent des notes à la mémoire (celles du projet uniquement) et mettent à jour le wiki, avec le modèle d’appoint.
- **Dossier du wiki** : l’endroit où le wiki partagé est conservé, ainsi que les wikis de projet sauf réglage contraire ci-dessous : un chemin absolu sur l’ordinateur qui exécute Hydor, avec **Parcourir**. Le modifier quand il contient des fichiers ouvre une revue pour les conserver, les fusionner ou les déplacer (voir [Déplacer le dossier du wiki](/guide/wiki-memory#move-the-wiki-folder)).
- **Wikis de projet** : **Dans le dossier du wiki** (au départ : rien n’est écrit dans vos dossiers de projet) ou **Dans le dossier de chaque projet**. Avec la seconde option, **Dossier à l’intérieur de chaque projet** indique où, et **Exclure de Git** le tient hors du dépôt du projet.

La mémoire elle-même doit être activée pour que les nouveaux documents ajoutent quoi que ce soit, et pour les points de contrôle des sessions : quand la mémoire est désactivée pour une session ou pour toutes, aucun point de contrôle n’est enregistré et ceux qui existent restent (voir [Points de contrôle](/guide/wiki-memory#checkpoints)).

### Notes

Le groupe **Notes** liste toutes les notes conservées, avec leur nombre à côté du titre (33 notes, par exemple). **Ajouter une note**, à droite du titre, permet d’en écrire une vous-même (voir [Ajouter une note](/guide/memory#add-a-note)). Votre profil n’en fait pas partie et n’est pas compté : il a son propre groupe, au-dessus.

Sous le titre se trouvent un champ de recherche et un index des lieux. Chaque lieu ouvre sa propre page :

- **À propos de vous** : les notes qui vous concernent, avec leur nombre.
- **Chaque projet**, désigné par le nom de son dossier, avec le nombre de ses notes et le chemin du dossier, le projet modifié le plus récemment en premier. Les cinq premiers s’affichent ; **Afficher N projets de plus** affiche les autres.
- **Sessions** : les notes conservées pour une seule session chacune.
- **Pas utile récemment** : uniquement lorsque certaines notes n’ont pas servi depuis quatre mois (voir [Notes dont aucun agent n’a eu besoin récemment](/guide/memory#notes-no-agent-needed-lately)).
- **Notes supprimées** : conservées 30 jours, pour pouvoir les restaurer (voir [Notes supprimées](/guide/memory#deleted-notes)).

La page d’un lieu s’ouvre dans la section, avec le lien **Mémoire** en haut pour revenir en arrière (le bouton Retour du navigateur fonctionne aussi). Elle affiche le nom du lieu et son nombre de notes (ainsi que le chemin du dossier pour un projet), **Ajouter une note** (dans À propos de vous et dans un projet ; la note est alors créée dans ce lieu), son propre champ de recherche (« Rechercher dans ces notes »), puis ses notes : le profil d’un projet d’abord, puis ses sujets, puis ses notes, la modification la plus récente en premier, vingt à la fois, avec **Afficher plus** en dessous. Sans note, la page l’indique. L’adresse d’une page est `/settings?s=memory&notes=global`, `&notes=session`, `&notes=stale` ou `&notes=deleted`, ou `&notes=repo:` suivi du dossier du projet.

**Pour trouver une note**, saisissez votre recherche dans le champ du groupe (ou de la page d’un lieu) : « Rechercher dans 33 notes », ou « Rechercher dans 33 notes par mots ou par le sens » lorsque la recherche par le sens est prête. Elle trouve les notes contenant tous les mots saisis, le dernier étant pris comme début de mot, et, si la recherche par le sens est activée, les notes qui veulent dire la même chose. Les meilleurs résultats viennent en premier, chacun avec le lieu auquel il appartient, et **Afficher plus** donne les vingt suivants. « Aucune note ne correspond » signale qu’il n’y en a aucune. Échap ou la croix **×** efface la recherche, et l’index revient. Tant que la mémoire ne contient aucune note, le groupe l’indique, avec un bouton **Importer depuis d’autres assistants** et la ligne **Notes supprimées**.

Dans une liste, chaque note montre ses deux premières lignes (avec un badge **Sujet**, **Profil** ou **Résultat** le cas échéant ; voir [Résultats](/guide/memory#findings-what-was-tried-and-what-came-of-it)) et, en dessous, une ligne d’informations : l’emplacement, dans une liste qui en mélange plusieurs (une recherche, **Sessions**, **Pas utile récemment**, **Notes supprimées**) ; **Ajouté** ou **Modifiée** et depuis combien de temps (survolez pour voir les dates exactes) ; **pas encore vérifiée**, quand personne ne l’a confirmée ; **utile une fois** ou **utile N fois**, le nombre de fois où un agent s’en est servi (en la consultant, en la citant ou en travaillant avec le fichier ou la commande dont elle parle) ; et **jusqu’à** une date, quand elle a une date de fin. Cliquez sur une note pour l’ouvrir.

### Ouvrir une note

Un clic sur une note l’ouvre dans une boîte de dialogue intitulée **Note**, **Sujet** ou **Profil**, avec tout son texte et **Modifier** en dessous. Sous le texte :

- **Où** : **À propos de vous**, le projet (le nom et le chemin de son dossier), ou la session à laquelle elle appartient (cliquez sur son nom pour ouvrir la session).
- **Écrite** : **Ajouté** ou **Modifiée** et quand, **par vous**, **par un agent** ou **par le modèle d’appoint** (le rangement), ainsi que la session d’où elle vient, sur laquelle vous pouvez cliquer pour l’ouvrir. Survolez-la pour voir les dates exactes.
- **Comment on le sait** : **vous l’avez dit**, **vérifié** ou **pas encore vérifiée** (survolez pour voir ce que cela signifie). Les notes antérieures à la mise en place de ce suivi n’indiquent rien.
- **Nécessaire aux agents** : **Une fois**, **N fois** (avec la date de la dernière) ou **Pas encore** : le nombre de fois où un agent s’est servi de la note, en la consultant, en la citant par son numéro ou en travaillant avec le fichier ou la commande dont elle parle après l’avoir reçue. Le fait de recevoir une note ne compte pas.
- **Transmise aux agents** : **Une fois**, **N fois** (avec la date de la dernière) ou **Pas encore** : le nombre de fois où des agents ont reçu la note sans la demander, au début d’une session, avec un message ou à l’ouverture d’un fichier.
- **Dans le code**, lorsque des fichiers cités par la note ont changé dans le projet depuis son écriture : « <files> modifié(s) dans le projet depuis l’écriture de cette note (vu il y a 2 h). Le prochain rangement la vérifiera par rapport au code. » Les agents reçoivent la note marquée « peut être obsolète : <files> modifié(s) » jusque-là (voir [Ranger automatiquement](/guide/memory#tidy-up-automatically)).
- **Date de fin** : la date, ou **Aucun**, avec **Variation** (voir plus bas).
- **Résume**, pour un sujet ou un profil : le nombre de notes qu’il représente, avec **Afficher** pour les lister, les notes supprimées étant barrées.
- **Historique** : **Afficher** liste toutes les étapes de la vie de la note, la plus récente en premier : Ajoutée, Modifiée (ancien texte → nouveau texte), Déplacée (« Déplacée de À propos de vous vers le projet »), Supprimée, Restaurée, Date de fin (« Jusqu’au » une date, ou « Retirée »), Comment on le sait, chacune avec la date, l’auteur, la session concernée et le motif. **Masquer** la referme.

Les boutons :

- **Modifier** : change le texte sur place, jusqu’à 500 caractères (800 pour un sujet ou un profil). Entrée enregistre, Maj+Entrée commence une nouvelle ligne, Échap ou **Annuler** abandonne la modification. Un texte qui semble contenir un secret ne peut pas être enregistré.
- **Date de fin** → **Variation** : sous « Vrai jusqu’au », choisissez une date et appuyez sur **Enregistrer**. La note cesse d’être vraie à la fin de cette journée : de demain jusqu’à cinq ans plus tard. **Sans date de fin** retire la date de fin.
- **Supprimer**, en bas à gauche : « Supprimée. Elle reste dans Notes supprimées pendant 30 jours. » La boîte de dialogue se ferme.
- **La garder**, lorsque vous avez ouvert la note depuis **Pas utile récemment** (voir plus bas).
- **Fermer**, ou Échap, quitte la boîte de dialogue.

Une note supprimée s’ouvre avec **Restaurer** et **Effacer définitivement** à la place (voir [Notes supprimées](/guide/memory#deleted-notes)) ; elle ne peut pas être modifiée et n’a pas de date de fin.

### Ajouter une note

[Ajouter une note](/settings?s=memory&find=Add%20a%20note), à côté du titre **Notes** (et sur la page de À propos de vous ou d’un projet), ouvre une boîte de dialogue : « Que doivent retenir les agents ? Par exemple : “Je préfère les réponses courtes.” » Écrivez la note, puis **Enregistrer** ou appuyez sur Entrée. Maj+Entrée commence une nouvelle ligne ; Échap ou **Annuler** l’abandonne.

- **À quoi elle appartient** : une note vous concerne, sauf si vous choisissez un projet. La pastille placée avant les boutons (**À propos de vous**) liste les projets pour lesquels la mémoire contient des notes ; une note sur un projet ne parvient qu’aux sessions qui travaillent dans ce projet. S’il n’y a pas encore de notes de projet, la pastille n’apparaît pas et la note vous concerne. Lorsque la boîte de dialogue est ouverte depuis la page d’un projet, elle démarre sur ce projet.
- Les mêmes règles que pour les notes des agents : 500 caractères au maximum, conservée en un seul paragraphe, et jamais rien qui semble contenir un mot de passe, une clé, un jeton ou un numéro de carte.
- La note s’affiche avec **par vous**. Les sessions la reçoivent à leur démarrage (Custom avant son prochain tour), comme toutes les notes.

### Notes dont aucun agent n’a eu besoin récemment

Lorsque certaines notes n’ont pas servi depuis quatre mois, l’index comporte une ligne **Pas utile récemment**, avec leur nombre : « 3 notes dont aucun agent n’a eu besoin en quatre mois ». Une note compte comme utilisée lorsqu’un agent l’a consultée, citée ou a travaillé avec le fichier ou la commande dont elle parle ; la recevoir au démarrage ne compte pas. Pour les notes antérieures à ce suivi, c’est la dernière fois où elles ont été transmises ou consultées qui compte, puis, à partir de là, l’utilisation. Sa page indique : « Aucun agent n’a eu besoin de ces notes depuis quatre mois. Gardez celles qui comptent encore, supprimez les autres. » Elle n’a pas de champ de recherche.

Seules les notes vous concernant et celles des projets sont proposées, jamais les sujets, les profils, les notes ayant une date de fin ni les notes de sessions. Chaque ligne a deux boutons : **Garder**, qui compte la note comme nécessaire aujourd’hui, de sorte qu’elle quitte la liste, et **Supprimer**, qui la supprime. Ouvrez d’abord une note pour la lire en entier, avec sa ligne **Nécessaire aux agents** et son historique : là, **La garder** et **Supprimer** font la même chose. Quand il n’en reste plus, « Toutes les notes ont été utiles récemment » s’affiche, et la ligne quitte l’index.

### Notes supprimées

[Notes supprimées](/settings?s=memory&find=Deleted%20notes), la dernière ligne de l’index, ouvre les notes supprimées par vous, par un agent, par le rangement ou à cause de leur date de fin : « Les notes supprimées restent 30 jours, puis disparaissent définitivement. » Les notes d’une session disparaissent définitivement peu après la suppression de la session elle-même. Son champ de recherche trouve les notes supprimées par leurs mots, et le lien **Mémoire** en haut permet de revenir en arrière.

- **Restaurer**, sur la ligne de la note ou dans sa boîte de dialogue, ramène une note. Une note dont la date de fin était dépassée revient sans cette date. Un profil effacé apparaît ici sous le nom **Votre profil** : une fois restauré, il redevient votre profil, à la place de celui qui a été écrit depuis.
- Ouvrez une note et appuyez sur **Effacer définitivement** : l’app demande « Effacer cette note définitivement ? » (« Elle disparaît avec son historique, et ne pourra pas revenir. »), puis la supprime aussitôt. Son **Historique** montre ce qui lui est arrivé.

### Ranger automatiquement

[Ranger automatiquement](/settings?s=memory&find=Tidy%20up%20automatically), dans le groupe **Apprentissage**, garde la mémoire courte et à jour. Cette option est activée par défaut : son texte d’aide dit « Une fois par jour, fusionner les notes qui disent la même chose et résumer celles qui sont liées ». C’est le modèle d’appoint qui fait le travail : le petit modèle que l’app utilise pour les tâches en marge des sessions, choisi dans [Paramètres → Modèles → Modèle d’appoint](/settings?s=models&find=Helper%20model) (voir [Agents, comptes et modèles](/guide/agents-models)). Il ne lit que les notes, sauf si [Apprendre des conversations](/guide/memory#learn-from-conversations) est activé : dans ce cas, il lit d’abord les conversations depuis le dernier rangement. Il laisse tranquilles les notes propres aux sessions : elles sont peu nombreuses et disparaissent avec leur session.

Chaque rangement fait les choses suivantes :

1. **Quasi-doublons, notes erronées, dates de fin.** Chaque note ajoutée ou modifiée depuis le dernier rangement est comparée aux notes les plus proches du même lieu (par le sens lorsque la recherche par le sens est activée, sinon par les mots). Les notes qui disent la même chose, ou dont l’une met l’autre à jour, sont fusionnées en une seule qui conserve tous les faits encore vrais ; lorsqu’elles se contredisent, la plus récente l’emporte, et la note fusionnée doit être plus courte que les notes qu’elle réunit. Une note qu’une note plus récente montre comme fausse est supprimée. Une note vraie seulement jusqu’à une date qu’elle cite (« jusqu’à vendredi », « le voyage de mars ») reçoit cette date de fin. Au plus 200 notes sont vérifiées par rangement ; les autres attendent le suivant.
2. **Notes confrontées au code, au bon endroit et dans le bon fichier.** Quatre étapes, chacune dans les notes d’un projet, qui se poursuivent même si l’une d’elles échoue :
   - **Vérifiée par rapport au code.** Une note de projet qui cite des fichiers est liée à ces fichiers dans le dépôt Git du projet et au commit auquel elle a été écrite. Toutes les dix minutes, Hydor regarde si ces fichiers ont changé depuis ; si c’est le cas, la note affiche **Dans le code** dans sa boîte de dialogue et les agents la reçoivent marquée « peut être obsolète ». Le rangement lit jusqu’à 20 de ces notes avec la modification de leurs fichiers (le diff Git), et le modèle d’appoint décide : toujours vraie (la note est marquée vérifiée), mise à jour ou retirée. Un projet qui n’est pas un dépôt Git n’a pas de tels liens.
   - **Déplacée vers son projet.** Une note enregistrée comme vous concernant mais qui porte sur un seul projet (elle le nomme : le nom du projet, celui de son dossier, celui de son dépôt, ou le nom de son paquet ou de son produit) est déplacée vers les notes de ce projet une fois que le modèle d’appoint est d’accord, de sorte qu’elle n’est plus transmise à toutes les sessions de tous les projets. Une préférence valable partout reste une note qui vous concerne. Le changement apparaît sous la forme **Déplacée**, et son historique indique « Déplacée de À propos de vous vers » le projet. Votre profil n’est jamais touché.
   - **Historique de conception versé dans le wiki.** Dans un projet où la [Mémoire wiki](/guide/wiki-memory) est activée, les notes longues (350 caractères ou plus, vieilles de plus d’une semaine, qui ne viennent pas de vous) qui se lisent comme un historique de conception, avec des versions, des dates et plusieurs chemins de fichiers, sont écrites dans le wiki. Chacune est ensuite remplacée par un renvoi d’une ligne (« <titre> : voir <article> dans le wiki »), ou disparaît lorsque le renvoi n’apporterait rien. Au plus 8 par rangement.
   - **AGENTS.md.** Une note que l’`AGENTS.md` du projet (ou `CLAUDE.md`) dit déjà est retirée (« Déjà dans AGENTS.md »), et une note qu’il dit en partie est réduite à ce qui lui manque. Une convention durable du projet, utile à toute personne qui y travaille et jamais un détail privé, peut être suggérée pour le fichier : au plus trois par rangement, chacune attendant votre décision sous **Suggéré pour AGENTS.md** (voir [Ranger maintenant et annuler ses changements](/guide/memory#tidy-up-now-and-undo-its-changes)).
3. **Sujets et profil d’un projet.** Dès que les notes d’un lieu dépassent environ 2 400 caractères, les notes liées sont résumées en sujets, chacun couvrant une poignée de notes (jusqu’à 12). Les agents reçoivent alors le sujet, et peuvent toujours consulter les notes qu’il représente. Un projet reçoit aussi un court profil (700 caractères au maximum) que les agents reçoivent toujours en premier : les règles permanentes dont les agents ont besoin dans la plupart des sessions (comment faire un commit, compiler, tester et livrer, et les préférences durables pour le projet), ce qu’il est, comment le compiler, le tester et l’exécuter, et ses pièges. Un sujet ou un profil est réécrit lorsque ce qu’il résume change. Votre propre profil est laissé à vous et à vos agents (voir [Votre profil](/guide/memory#your-profile)).
4. **Titres.** Chaque note et chaque sujet vous concernant, ainsi que ceux de vos projets, reçoit un titre de quelques mots, pour l’index avec lequel les agents démarrent. Les nouvelles notes reçoivent le leur dans l’heure, et une note dont le texte change en reçoit un nouveau.

Le rangement s’exécute de lui-même environ une fois par jour, tant que l’app est ouverte, si bien qu’un ordinateur en veille la nuit en bénéficie aussi : dès que 20 heures se sont écoulées depuis le dernier rangement, qu’il y a du nouveau (un message que vous avez écrit, ou une note que vous ou un agent avez modifiée) et que vous avez fait une pause de dix minutes, de sorte qu’il ne s’exécute jamais pendant que vous écrivez. S’il n’y a rien de nouveau, il ne s’exécute pas du tout. Chaque changement qu’il fait figure dans l’historique de la note comme fait par « le modèle d’appoint », et chaque changement du dernier rangement peut être annulé (voir [Ranger maintenant et annuler ses changements](/guide/memory#tidy-up-now-and-undo-its-changes)).

### Apprendre des conversations

[Apprendre des conversations](/settings?s=memory&find=Learn%20from%20conversations), la première ligne du groupe **Apprentissage**, est activée par défaut. Son indication dit « Une fois par jour, corrige ce que les conversations montrent de faux et garde ce que les agents ont manqué », et son **(i)** ajoute : « Lors du rangement, le modèle d’appoint lit les conversations depuis le dernier (sauf celles dont la mémoire est désactivée) : il corrige les notes qu’elles montrent fausses, vérifie les notes pas encore vérifiées, et garde au plus quelques éléments par jour qu’aucun agent n’a enregistrés. » C’est la première étape de chaque rangement, qu’il se lance seul ou avec **Ranger maintenant**.

Les agents enregistrent des notes sur le moment, avant de savoir ce qui va suivre : une note peut donc être fausse dès le départ ou devenir périmée, et certaines choses durables ne sont jamais écrites. Projet par projet, le modèle d’appoint lit ce que vous avez écrit et la dernière réponse de chaque tour (jamais les fichiers que vous avez joints, le texte que vous avez collé, les étapes intermédiaires, les résultats des outils ni les pages web), avec les notes concernées par ces conversations, et :

- **corrige** une note qu’une conversation montre fausse ou périmée, ou la retire quand il ne reste rien de vrai ;
- **vérifie** une note pas encore vérifiée qu’une conversation montre exacte ; pour une telle note, il lit aussi la conversation qui l’a écrite ;
- **garde** ce dont une session ultérieure aurait besoin et qu’elle ne pourrait pas trouver dans les fichiers du projet : quelque chose que vous voulez ou avez corrigé, une décision et sa raison, un piège. Trois par jour au plus, pour que la mémoire reste petite ; le rangement les fusionne ensuite avec les quasi-doublons, comme toute nouvelle note.

Une note de projet qui nomme un fichier absent du projet lui est signalée, afin qu’il puisse la corriger.

Il ne lit jamais les sessions dont la mémoire est désactivée (les sessions confidentielles l’ont désactivée), les sous-agents Hydor (c’est un agent qui a écrit leurs requêtes) ni les exécutions planifiées, et la première fois, il remonte à trois jours. Chaque modification apparaît dans la liste du rangement avec la conversation d’où elle vient, et peut y être annulée (voir [Ranger maintenant et annuler ses modifications](/guide/memory#tidy-up-now-and-undo-its-changes)). Désactivez l’interrupteur et le rangement ne lit plus que les notes.

### Ranger maintenant et annuler ses modifications

La ligne **Dernier rangement**, sous **Ranger automatiquement**, indique le dernier rangement dans son indication :

- « Pas encore rangé »
- « Rangement en cours… » pendant son exécution.
- « Il y a 3 h : 2 ajoutées, 1 mise à jour, 3 retirées. » (ce qu’il a modifié), ou « Il y a 3 h : rien à modifier (14 notes examinées). »
- « Il a lu 12 conversations. », quand [Apprendre des conversations](/guide/memory#learn-from-conversations) en a lu ; « L’apprentissage à partir des conversations s’est arrêté : » et la raison, sur une ligne en dessous, quand cette étape a échoué (le reste du rangement a quand même été exécuté).
- Quand le dernier n’a rien trouvé mais qu’un précédent a modifié quelque chose : « Il y a 3 h : rien à modifier. Avant cela, il y a 2 j : » et les modifications de ce rangement précédent. Elles restent listées, et annulables, jusqu’à ce qu’un rangement modifie de nouveau quelque chose.
- « Certaines étapes d’entretien se sont arrêtées : » et la raison, sur une ligne en dessous, quand l’une des étapes suivant les quasi-doublons (vérification des notes par rapport au code, déplacement des notes vers leur projet, déplacement de l’historique des designs dans le wiki, comparaison avec AGENTS.md) a échoué. Les autres étapes ont quand même été exécutées, et les autres modifications du rangement restent.
- Quand il a échoué, la raison après l’heure, par exemple le modèle d’appoint qui ne répond pas.

**Ce qui a changé**, à droite de la ligne (affiché quand le dernier rangement a modifié quelque chose), ouvre « Ce que le dernier rangement a modifié ». Chaque modification affiche un badge (**Ajouté**, **Mise à jour**, **Retiré**, **Déplacée**, **Se termine**, **Sans date de fin**, **Vérifié** ou **Annulée**), **Sujet** ou **Profil** quand c’en est un, l’emplacement et la raison (« Fusionnée dans #12 », « Résume 5 notes liées », « Déjà dans AGENTS.md », « Appris de « Upload page » »), et le texte, l’ancien barré au-dessus du nouveau. Une modification **Déplacée** affiche le texte de la note et « Déplacée de À propos de vous vers » le projet. Le bouton en forme de bulle (**Ouvrir la conversation**) ouvre la conversation d’où une modification a été apprise. Le bouton en forme de flèche (**Annuler cette modification**) en annule une : ce qu’elle a ajouté disparaît, ce qu’elle a changé retrouve son ancien texte, ce qu’elle a supprimé revient, une date de fin qu’elle a définie est retirée, une note qu’elle a vérifiée n’est plus vérifiée (et, si elle l’avait été par rapport au code, est de nouveau signalée), et une note qu’elle a déplacée retourne dans À propos de vous. Fermez la boîte de dialogue quand vous avez terminé.

Sous les modifications, **Suggéré pour AGENTS.md** liste les phrases que le rangement voudrait ajouter à l’`AGENTS.md` d’un projet, une convention durable chacune, sous forme de phrase simple. Chacune indique le projet et le fichier où elle irait (`AGENTS.md`, ou `CLAUDE.md` quand le projet n’a pas d’`AGENTS.md`), ainsi que la note dont elle vient. Rien n’est écrit dans votre projet tant que vous n’avez pas appuyé sur un bouton :

- **Ajouter** ajoute la phrase à la fin du fichier sous un titre « ## Learned conventions » (créé s’il n’y en a pas), retire la note dont elle vient, et affiche « Ajouté à AGENTS.md ».
- **Ignorer** laisse le fichier et la note tels quels, et la phrase n’est plus suggérée.

La section s’affiche tant qu’une suggestion attend votre décision, même si le dernier rangement n’a rien modifié d’autre.

[Ranger maintenant](/settings?s=memory&find=Tidy%20up%20now), le bouton de la même ligne, lance un rangement immédiatement, que **Ranger automatiquement** soit activé ou non : « Rangement en cours : cela prend une minute ou deux ». La mémoire doit être activée.

### Recherche par le sens

[Recherche par le sens](/settings?s=memory&find=Search%20by%20meaning), la première ligne du groupe **Ce que reçoivent les agents**, « trouve les notes, ce que vous gardez et plus encore par leur sens autant que par leurs mots, avec un modèle qui s’exécute sur cet ordinateur » : mDenseOn de LightOn, qui lit neuf langues. Elle est activée sauf si vous la désactivez ; les notes et ce que vous gardez sont donc trouvés par une recherche hybride : par leurs mots et par leur sens, les deux listes étant fusionnées par rang. Le modèle s’exécute ici, donc vos notes ne sont envoyées à aucun service pour être recherchées. Désactivée, les notes sont trouvées par leurs mots seuls. Activée :

- Les agents démarrent avec les notes qui concernent votre demande, même si ces notes emploient d’autres mots que vous.
- Les agents qui cherchent des notes, ainsi que le champ de recherche du groupe **Notes**, les trouvent par le sens autant que par les mots.
- Une note qui dit la même chose qu’une note déjà gardée, avec d’autres mots, n’est pas enregistrée de nouveau, et le rangement regroupe les notes par le sens.
- La zone de recherche (Ctrl+K) trouve les pages, les paramètres, les sessions, les apps, ainsi que les documents, les images et le reste que vous avez gardés (par leurs titres et leurs descriptions) par leur sens, et les bases de connaissances sont elles aussi recherchées par le sens (voir [Projets et connaissances](/guide/projects)).

**Comment il se prépare**, une seule fois :

1. Une minute après le premier démarrage de l’app, celle-ci met en place un environnement Python privé dans son dossier de données, avec ONNX Runtime, le tokenizer de Hugging Face et NumPy (environ 150 Mo) ; si vous l’aviez désactivée, elle le fait dès que vous réactivez la **Recherche par le sens** (la mémoire elle-même doit être activée). La ligne sous la rangée affiche chaque étape, comme « Création d’un environnement Python privé » et « Installation d’ONNX Runtime et du tokenizer ». Un environnement créé par une version plus ancienne avec PyTorch est d’abord supprimé, ce qui libère ses gigaoctets : « Suppression de l’environnement créé par une version plus ancienne ».
2. Elle télécharge ensuite le modèle, une seule fois : « Téléchargement du modèle : 120 sur 340 Mo, une seule fois ». C’est mDenseOn en 8 bits (algoprog/mDenseOn-ONNX sur Hugging Face), un quart de la taille du modèle complet, qui trouve les mêmes notes. Chaque fichier est vérifié avant d’être utilisé, et un téléchargement interrompu reprend où il s’était arrêté la fois suivante.
3. Chaque note reçoit son vecteur (les nombres que la recherche par le sens compare) en arrière-plan, de même que tout ce que vous gardez. La ligne compte les notes : « les 120 notes sont trouvées par le sens » ou « 80 notes sur 120 trouvées par le sens (les autres bientôt) ».

**Pour la désactiver**, utilisez l’interrupteur de la ligne : le modèle s’arrête, et tout est trouvé par ses seuls mots. Un ordinateur à court d’espace disque ou de mémoire peut s’en passer. Tant que la mémoire est désactivée pour toutes les sessions, l’interrupteur est grisé.

**Ce dont il a besoin** :

- Python 3.10 ou plus récent sur cet ordinateur, sauf si l’outil uv est installé, car il apporte le sien. Si aucun des deux n’est présent, la mise en place s’arrête et le dit, avec la façon d’installer Python : sur Debian ou Ubuntu `sudo apt install python3 python3-venv`, sur Mac depuis python.org ou avec Homebrew (`brew install python`). Sur Mac, le Python d’Apple ne compte que si ses outils de développement sont installés, donc l’app ne vous demande jamais de les installer.
- Espace disque : environ 150 Mo pour l’environnement et 340 Mo pour le modèle. La mise en place s’arrête avec « Espace disque insuffisant » quand il reste moins d’environ 1 Go de libre.
- Une connexion internet, une seule fois, pour les téléchargements.
- De la mémoire libre pour démarrer le modèle : environ 1,5 Go. Tant qu’il n’y en a pas assez, il affiche « En attente de mémoire » et les notes sont trouvées par leurs mots.

**Comment il fonctionne** : sur le processeur de l’ordinateur (le CPU), via ONNX Runtime, sur quelques-uns de ses cœurs. Il ne démarre qu’en cas de besoin, utilise environ 0,6 à 1 Go de mémoire pendant son exécution, et s’arrête après quelques minutes d’inactivité : « Démarre quand il le faut et s’arrête après quelques minutes d’inactivité », et « Chargé » pendant qu’il fonctionne. Le démarrage prend une à deux secondes ; il démarre dès que vous commencez un message sur la page d’accueil (ou dans une session dont l’agent s’est arrêté), et peu avant l’exécution d’une tâche planifiée : les notes et compétences d’une nouvelle session sont alors elles aussi trouvées par le sens. Une session n’attend jamais son chargement : celle qui démarre avant qu’il soit prêt obtient ses notes et ses compétences par leurs mots. Il laisse la carte graphique tranquille, et un ordinateur avec 8 Go de mémoire suffit.

**Où il les conserve** : les vecteurs sont conservés dans la base de données de l’app, sur votre disque. Pour chercher plus vite, l’app garde aussi en mémoire ceux qu’elle utilise le plus, dans un budget unique que se partagent les notes et les bases de connaissances : au plus un 64e de la mémoire de l’ordinateur (ou de la limite de mémoire d’un conteneur, si elle est plus basse), jamais plus de 512 Mo, et jamais plus d’un huitième de la mémoire libre à cet instant. Quand la mémoire vient à manquer, elle n’en garde aucun : ce qu’elle gardait est libéré en une demi-minute, et chaque recherche lit les vecteurs sur le disque au fur et à mesure, un peu plus lentement. Ce qui a été utilisé le moins récemment part en premier. Les conversations passées et les enregistrements des apps sont toujours lus sur le disque, et la zone de recherche (Ctrl+K) ne garde que les vecteurs de ce qui existe actuellement.

Quand quelque chose ne va pas, la ligne d’état se transforme en avertissement avec la raison (par exemple « Le modèle a mis trop de temps à se charger ») et un bouton **Réessayer**. Désactiver l’interrupteur arrête le modèle ; ce qui a été mis en place reste, donc le réactiver est rapide.

### Notes avec lesquelles chaque agent démarre

[Notes avec lesquelles chaque agent démarre](/settings?s=memory&find=Notes%20each%20agent%20starts%20with), dans le groupe **Ce que reçoivent les agents**, définit le nombre maximal de notes et de sujets sur vous et sur le projet avec lesquels un agent démarre, en plus de votre profil : **5**, **10** (la valeur habituelle), **20** ou **40**, à choisir avec les boutons de la ligne. Son indication dit « En plus de votre profil : celles qui concernent ce que vous demandez », et son **(i)** dit : « Au plus ce nombre de notes sur vous et sur le projet qui concernent ce que vous demandez, trouvées par leurs mots et, si la recherche par le sens est activée, par leur sens, ainsi que les titres des autres, que les agents consultent quand ils en ont besoin. Un endroit qui n’a que quelques notes est fourni en entier. » Plus de notes laisse entrer dès le départ davantage de ce qui concerne une demande, au prix de plus à lire dans chaque session ; moins de notes garde court ce avec quoi ils démarrent. Les notes propres à cette session s’ajoutent à celles-ci. Voir [Ce avec quoi un agent démarre](/guide/memory#what-an-agent-starts-with).

La ligne en dessous, [Longueur du profil](/settings?s=memory&find=Profile%20length), choisit le nombre de mots que votre profil peut contenir (voir [Votre profil](/guide/memory#your-profile)).

### Exporter vos notes

[Exporter](/settings?s=memory&find=Export), dans le groupe **Vos données**, télécharge toutes les notes conservées. **Markdown** (« Une liste à lire ») est une liste lisible regroupée par emplacement, avec la date d’ajout et de modification de chaque note et sa date de fin. **JSON** (« Avec historiques ») contient chaque note avec son historique et, pour les sujets et les profils, les notes qu’ils résument. Les notes supprimées ne sont pas incluses.

### Importer depuis d’autres assistants

[Importer…](/settings?s=memory&find=Bring%20in%E2%80%A6), la première ligne du groupe **Vos données** (« Ce que Claude Code, Codex, ChatGPT et d’autres savent de vous, et vos compétences » ; ou le bouton **Importer depuis d’autres assistants** dans le groupe **Notes** tant que la mémoire ne contient aucune note), importe dans la mémoire ce que d’autres agents présents sur cet ordinateur savent de vous et de vos projets, sous forme de notes que vous choisissez. Rien n’est ajouté tant que vous n’avez pas fait ce choix.

1. Sous **Sur cet ordinateur**, cochez ce qu’il faut lire. Hydor repère ce que ces agents conservent et indique combien de fichiers de mémoire chacun contient :
   - **Claude Code** : la mémoire qu’il conserve pour chaque projet, et votre fichier CLAUDE.md valable pour tous les projets (ainsi que ceux des comptes présents dans Hydor).
   - **Codex** : ses souvenirs, et votre fichier AGENTS.md.
   - **Autres agents** : certains autres agents conservent des fichiers de mémoire à votre sujet (ce qu’ils savent de vous et de votre travail), et certains gardent les instructions que vous leur avez données pour chaque dossier. Hydor les lit pour savoir comment vous aimez travailler. Il ne lit jamais leurs identifiants de connexion, leurs clés ni leurs réglages. Lorsqu’un agent conserve sa mémoire dans une base en cours d’utilisation, Hydor en lit une copie, afin que cet agent puisse continuer à fonctionner.
2. Sous **Depuis un export**, **Ajouter un export** accepte le fichier .zip que ChatGPT ou Claude vous envoie par e-mail lorsque vous demandez vos données (dans ChatGPT, Paramètres → Contrôle des données → Exporter les données ; dans Claude, Paramètres → Confidentialité → Exporter les données), ou le fichier conversations.json qu’il contient. Hydor affiche ce que le fichier renferme : la mémoire de Claude ou les instructions personnalisées de ChatGPT, et le nombre de conversations, avec leurs dates de début et de fin. Dans les conversations, seul ce que vous avez écrit est lu, en commençant par le plus récent : pas les réponses, ni les fichiers que vous avez joints.
3. Cliquez sur **Lancer la lecture**. Le [modèle d’appoint](/settings?s=models&find=Helper%20model) lit une partie à la fois, avec les notes que la mémoire contient déjà, et ne retient que ce qui durera. Il écarte ce que la mémoire sait déjà (même formulé autrement), les secrets et les textes écrits pour guider des agents. Une mémoire volumineuse demande quelques minutes : vous pouvez fermer la boîte de dialogue entre-temps, et **Arrêter** interrompt la lecture.
4. Décochez ce que vous ne voulez pas conserver. Les notes sont regroupées : d’abord **À propos de vous**, puis chaque projet selon son dossier, lorsque ce qui a été lu concerne un projet dont le dossier se trouve sur cet ordinateur. **Ajouter à votre profil** liste les lignes qui seraient ajoutées à [votre profil](/guide/memory#your-profile). Cliquez sur **Ajouter N notes** ; **Abandonner** les écarte toutes.

Les compétences sont importées directement, sans le modèle d’appoint. Sous **Compétences que vous y avez créées**, Hydor liste les compétences qu’il trouve dans d’autres agents présents sur cet ordinateur (tous leurs profils et espaces de travail, y compris leurs compétences partagées et apprises), chacune avec son nom, son utilité, son origine et son nombre de fichiers. Toutes utilisent le même format que les compétences d’ici : un dossier contenant un fichier SKILL.md. Cette liste sert d’aperçu : décochez ce que vous ne voulez pas, puis cliquez sur **Copier N compétences**, et chacune est ajoutée à vos compétences avec ses fichiers (voir [D’où viennent les compétences](/guide/skills#where-skills-come-from)). Certaines figurent sous **N non proposées**, avec la raison : les compétences fournies avec un agent lui appartiennent, elles ne sont pas les vôtres ; une compétence dont le nom existe déjà parmi vos compétences (intégrée, à vous ou issue d’un plugin) n’est jamais remplacée ; et une compétence sans description, de plus de 20 000 caractères, ou contenant une clé est écartée. Les fichiers qui contiennent des clés ou des identifiants (fichiers .env, clés privées, fichiers nommés credentials, secrets ou tokens, et fichiers contenant une clé) ne sont jamais copiés, et le dossier d’une compétence est copié dans la limite de 200 fichiers, 512 Ko chacun et 2 Mo au total : **N fichiers laissés de côté** indique ce qui n’a pas été copié. Les serveurs MCP (serveurs d’outils) ne sont pas importés : ajoutez-les dans [Paramètres → Serveurs MCP](/settings?s=mcp), et placez dans le coffre toute clé dont ils ont besoin.

Une note importée l’indique dans son historique : « Importée depuis Claude Code ». Rien ne change dans les autres assistants, et un export que vous avez ajouté est supprimé une fois ses notes ajoutées. Lorsque le modèle d’appoint est sur **Automatique**, c’est Claude Haiku qui effectue la lecture, via votre forfait Claude Code.

### Tout effacer…

[Tout effacer…](/settings?s=memory&find=Clear%20all%E2%80%A6), la dernière ligne du groupe **Vos données** (**Effacer toute la mémoire**), supprime toutes les notes et leur historique, ainsi que votre profil. Une confirmation est demandée : « Effacer toute la mémoire ? Toutes les notes sur vous, vos projets et vos sessions disparaissent, avec leur historique. Cette action est irréversible ; exportez d’abord pour en garder une copie. » Cliquez sur **Tout effacer** pour continuer. Le bouton est grisé lorsqu’il n’y a aucune note (votre profil n’est pas compté).

## Rechercher dans les sessions précédentes

Outre les notes, les agents peuvent parcourir vos conversations passées, avec n’importe quel agent. Demandez « Qu’avons-nous décidé pour le lieu le mois dernier ? » et l’agent cherche les mots dans ce que vous et les agents avez écrit dans toutes les sessions (tous les mots doivent correspondre) et, lorsque la [recherche par le sens](/guide/memory#search-by-meaning) est activée, ce que vous avez demandé dans chaque session d’après son sens, de sorte qu’une question formulée autrement retrouve tout de même le résultat ; il cherche aussi les commandes exécutées et les fichiers modifiés lorsque c’est nécessaire. Chaque message que vous écrivez reçoit son vecteur en arrière-plan, quelques-uns à la fois, en commençant par les plus récents : vos propres mots, pas les fichiers que vous avez joints ni les textes que vous avez collés. Ensuite, l’agent lit la session qui contient la réponse : ses messages et les titres des étapes réalisées, du plus ancien au plus récent.

Les sessions dont la mémoire est désactivée sont exclues de cette recherche et ne peuvent pas être lues depuis une autre session. Ces outils n’existent que lorsque la mémoire est activée pour la session dans laquelle l’agent travaille.

Par défaut, la recherche porte sur les sessions de tous les projets. Demandez à un agent de se limiter à un projet (« seulement dans ce projet », ou « seulement dans Boutique ») et sa recherche prend un projet : **this** (les sessions de ce projet), **all** (tous les projets, valeur par défaut) ou le nom d’un projet. Lorsqu’une recherche dépasse le projet dans lequel l’agent travaille, chaque résultat indique le projet dont il provient.

## Rechercher au-delà d’un projet

Il arrive que ce dont un agent a besoin ait été conservé ou fait dans un autre projet : « Comment avons-nous configuré les déploiements dans mon projet Boutique ? » Pour cela, les agents disposent d’une recherche unique qui parcourt d’un coup tout ce que la mémoire conserve : notes, articles du wiki, documents et conversations passées. Elle porte sur le projet dans lequel l’agent travaille, sur tous vos projets, ou sur un seul projet désigné par son nom (son nom dans la barre latérale, le nom de son dossier ou le nom de son dépôt). Elle n’a jamais lieu sans que l’agent la demande : rien de vos autres projets n’est ajouté à ce qu’un agent reçoit au départ ou avec un message.

Chaque résultat indique d’où il provient et comment l’ouvrir : un article s’ouvre avec l’outil wiki, un document avec l’outil de connaissances, chacun en précisant dans quel projet il se trouve, et une conversation passée avec sa clé. Ce que conservent les autres projets n’est jamais que lu : un agent ne modifie jamais, depuis ici, les notes, le wiki, les documents ou les conversations d’un autre projet.

Toujours exclus de la recherche :

- La conversation dans laquelle se trouve l’agent, et les sessions dont la mémoire est désactivée.
- Un projet qui reste à part. Chaque projet dispose d’un interrupteur, **Consultable depuis d’autres projets**, dans son onglet **Paramètres** (voir [Paramètres](/guide/projects#settings)) : activé, les agents de vos autres projets peuvent trouver et lire ses notes, son wiki, ses documents et ses conversations lorsqu’ils cherchent ; désactivé, ils ne le peuvent pas, et les agents du projet lui-même peuvent toujours consulter vos autres projets. Demander un tel projet par son nom indique qu’il reste à part.
- Le wiki d’un projet dont la mémoire wiki est désactivée (voir [Mémoire wiki](/guide/wiki-memory)).

Une session hors de tout projet cherche dans tous les projets lorsqu’elle ne précise pas lequel. Les notes à votre sujet ne sont cherchées qu’une fois, quels que soient les projets parcourus.

Vous pouvez aussi rechercher vous-même dans les sessions passées avec la zone de recherche (Ctrl+K, ou ⌘K sur un Mac). Elle trouve les sessions par titre, les messages qui contiennent vos mots, et les notes de la mémoire, sous **Mémoire**. Ouvrir une note « ouvre Paramètres → Mémoire, sur cette note ».

## Demander à un agent

- « Que retiens-tu de moi ? Supprime tout ce qui concerne mon ancien travail. »
- « Qu’avons-nous déjà essayé pour les requêtes longues ? »
- « Note que l’idée du curriculum n’a rien apporté, avec les exécutions. »
- « Ajoute à mon profil que je suis infirmière et que j’aime les réponses sous forme de listes à puces. »
- « Montre-moi mon profil et raccourcis-le à environ 300 mots. »
- « Démarre chaque session avec 20 notes au lieu de 10. »
- « Garde la recherche par le sens sur le processeur, pour que la carte graphique reste libre. »
- « Range la mémoire maintenant, puis dis-moi ce que tu as fusionné et ce que tu as déplacé vers un projet. »
- « Quelles notes sont signalées parce que le code a changé ? Vérifie-les par rapport au code. »
- « Que suggère le rangement pour AGENTS.md ? Montre-moi, et ajoute la première suggestion. »
- « Quelles notes ont été souvent données aux agents sans jamais leur servir ? »
- « Cette note sur la commande de build concerne le projet Hydor, pas moi : déplace-la là-bas. »
- « Démarre chaque session avec moins de notes : seulement les 5 qui concernent ce que je demande. »
- « Désactive la mémoire wiki pour le projet Impôts 2026 et laisse-la activée pour les autres. »
- « Cherche dans tous mes projets comment nous avons configuré le workflow de publication. »
- « Comment avons-nous géré les déploiements dans mon projet Boutique ? Cherche dans son wiki et ses conversations. »
- « Lesquelles de mes conversations passées dans ce projet mentionnent le modèle de facture ? Laisse de côté les autres projets. »
- « Quelles notes n’ont servi à aucun agent depuis des mois ? Supprime celles qui concernent l’ancien site web. »
- « La note sur mon voyage à Lisbonne n’est valable que jusqu’au 12 mai : donne-lui cette date de fin. »
- « Quelles notes sur ce projet n’ont pas encore été vérifiées ? Vérifie-les par rapport au code. »
- « Arrête d’apprendre à partir des conversations, mais garde le rangement. »
- « Désactive la mémoire pour la session intitulée Déclaration d’impôts. »
- « Importe ce que Claude Code et Codex retiennent de moi, et montre-moi les notes avant de les ajouter. »
- « J’utilisais un autre agent auparavant : importe ce qu’il sait de moi et les compétences que j’ai créées, et montre-moi d’abord la liste. »
