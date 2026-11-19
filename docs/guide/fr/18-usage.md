# Utilisation, limites et coûts

Claude Code, Codex et Grok Build fonctionnent avec des forfaits soumis à des limites d’utilisation, et chaque appel de modèle a un prix. Cette rubrique explique où voir quelle part de chaque forfait vous avez utilisée et quand elle se réinitialise, ce qui se passe à une limite (et comment faire continuer les sessions toutes seules), ce que les agents ont fait au fil du temps, et comment l’app estime les coûts, y compris avec des prix que vous définissez vous-même.

![Utilisation : la part de chaque forfait que vous avez utilisée, et quand elle se réinitialise](images/usage.webp)

## Ouvrir la page Utilisation

Ouvrez **Utilisation** dans la barre d’icônes (sur un téléphone, ouvrez d’abord la barre latérale). Une fine barre sous l’icône Utilisation montre d’un coup d’œil ce qu’il reste sur l’ensemble de vos abonnements payants Claude Code, Codex et Grok Build, chacun étant compté selon la limite dont il est le plus proche ; si vous n’avez que des abonnements gratuits, ce sont eux qui sont comptés, et si vous n’en avez aucun, la barre ne s’affiche pas. Elle devient rouge quand il ne reste plus rien. Survolez-la pour voir ce qu’il reste sur chaque abonnement.

La [page Utilisation](/usage) comporte trois onglets :

- **Limites** (`/usage`) : ce qu’il reste de chaque forfait, et quand il se réinitialise.
- **Activité** (`/stats`) : les lignes modifiées, les jetons et les sessions au fil du temps.
- **Arène** (`/arena`) : les modèles qui l’emportent sur vos propres tâches.

L’app lit votre utilisation à l’ouverture de la page, puis toutes les cinq minutes tant qu’elle est ouverte ; dans l’onglet Limites, **Actualiser** la relit tout de suite. L’utilisation de Grok Build est lue auprès de son agent à quelques minutes d’intervalle, et **Actualiser** la relit aussi immédiatement.

## Lire les limites d’un forfait

L’onglet **Limites** comporte une carte pour Claude Code, une pour Codex, une pour Grok Build (une fois que vous l’avez ajouté dans [Paramètres → Agents → Plus d’agents](/settings?s=agents)), et une pour chaque compte ajouté dans [Paramètres → Agents → Comptes](/settings?s=accounts). Sur un grand écran, elles sont disposées par deux sur une ligne ; sur un téléphone, les unes sous les autres.

Chaque carte indique l’adresse e-mail et le forfait du compte, il y a combien de temps les chiffres ont été lus, et une ligne par limite (une fenêtre de temps avec un plafond d’utilisation) :

- Claude Code : **Session en cours (5 h)**, **Hebdomadaire · tous les modèles**, et des limites hebdomadaires pour un seul modèle, comme **Hebdomadaire · Sonnet uniquement**.
- Codex : **Fenêtre de 5 heures**, **Hebdomadaire**, ou des fenêtres d’autres durées. Quand Codex a plusieurs limites, chaque ligne commence par le nom de la limite.
- Grok Build : **Hebdomadaire**, avec la date de réinitialisation. La carte indique aussi le forfait (SuperGrok, SuperGrok Plus ou SuperGrok Heavy). La connexion propre à Grok a sa carte, et chaque compte Grok que vous avez ajouté a la sienne.

Chaque ligne donne le pourcentage utilisé, une barre, le pourcentage restant, et le moment de la réinitialisation (« se réinitialise dans 2 h 15 min » ; survolez pour voir l’heure exacte). Un signe d’avertissement apparaît à partir de 90 %.

Selon le forfait, la carte affiche aussi :

- **Utilisation supplémentaire** (Claude) : si l’utilisation payante au-delà des limites du forfait est activée, et quelle part de sa limite mensuelle est dépensée.
- **Crédits** (Codex, Grok Build) : votre solde de crédits, ou « Illimité ».
- **Paiement à l’usage** (Grok Build) : quand le forfait le propose, ce que vous y avez dépensé ce mois-ci par rapport à son plafond (« 12,00 $ sur 50,00 $ ce mois-ci »).
- **Réinitialisations de limite** : les réinitialisations que vous pouvez utiliser maintenant (voir [Utiliser une réinitialisation de limite](#use-a-limit-reset)).
- **Cette semaine par surface** (Claude) : comment l’utilisation de cette semaine se répartit entre les endroits où vous utilisez Claude.
- **Jetons par jour** (Codex) : un graphique des 30 derniers jours, avec votre total depuis le début. Un jeton est un morceau de mot ; les modèles comptent ce qu’ils lisent et écrivent en jetons.

Quand quelque chose ne va pas, la carte l’indique :

- « Non connecté » avec **Se connecter dans les Paramètres** (pour Grok Build : « Connectez-vous pour voir l’utilisation du forfait de Grok. ») ;
- sur un forfait géré par une équipe, la carte de Grok Build indique « Les limites d’utilisation sont gérées par votre équipe. », car elle n’a pas de limites propres à afficher ;
- « Aucune limite d’utilisation signalée pour ce forfait » ;
- une erreur avec **Vérifiez la connexion dans les Paramètres** ;
- « Affichage des derniers chiffres connus : … » quand la dernière lecture a échoué.

## Que se passe-t-il quand vous atteignez une limite

Quand l’utilisation d’un forfait est épuisée, le tour de l’agent s’arrête. Pour Grok Build, il s’agit de sa limite hebdomadaire, de sa limite de crédits ou de son plafond de dépenses du paiement à l’usage ; une courte limite de débit (une rafale de requêtes) n’en est pas une et passe d’elle-même. Un avis indique de qui est la limite atteinte, de quelle limite il s’agit et quand elle se réinitialise : « Vous avez atteint la limite d’utilisation de Claude Code » (ou de Codex ou de Grok Build) avec un seul compte pour cet agent, « Tous vos comptes Claude Code ont atteint leur limite d’utilisation » quand vous en avez plusieurs et qu’aucun n’a plus d’utilisation disponible, ou le compte par son nom (« Travail a atteint sa limite d’utilisation ») quand un autre en a encore. Il s’affiche :

- sur la page de démarrage, au-dessus de la zone de message, pour l’agent (et le compte) que vous avez choisi ;
- dans une session, au-dessus de la zone de message ;
- sur la carte de ce forfait dans la page Utilisation.

L’avis propose ce que vous pouvez faire :

- **Reprendre à la réinitialisation** (dans une session, tant que **Reprendre après les limites d’utilisation** est désactivé) : la session continue toute seule une minute après la réinitialisation de la limite, avec le message « Continue là où tu t’es arrêté. » L’avis indique alors « Cette session continuera toute seule à la réinitialisation », avec **Annuler**.
- **Utiliser une réinitialisation**, quand le compte dispose d’une réinitialisation de limite utilisable maintenant (« 2 réinitialisations disponibles »).

Une fois l’utilisation revenue, si une session doit encore continuer, l’avis indique « Continue toute seule dans … », avec **Annuler**.

## Faire continuer les sessions automatiquement après une limite

Pour que chaque session qui atteint une limite continue toute seule, ouvrez [Paramètres → App → Général](/settings?s=general&find=Resume%20after%20usage%20limits) et activez **Reprendre après les limites d’utilisation** (quand un tour s’arrête parce que l’utilisation d’un forfait est épuisée, la session continue toute seule une minute après la réinitialisation de la limite). Cette option est désactivée tant que vous ne l’activez pas. Elle fonctionne même si aucun navigateur n’est ouvert. Quand elle est activée, une session n’affiche pas d’avertissement lorsqu’une limite l’arrête : une ligne au-dessus de la zone de message indique de qui est la limite atteinte (comme le fait l’avis), de quelle limite il s’agit et « Continue toute seule dans … », avec **Utiliser une réinitialisation** quand le compte en détient une, et **Annuler**.

Comment fonctionne le minutage, avec l’option activée ou avec **Reprendre à la réinitialisation** :

- La session doit reprendre une minute après la réinitialisation de la limite, telle que le fournisseur l’a signalée en dernier. L’app relit l’utilisation de temps en temps pendant qu’une session attend, plus souvent à mesure que la réinitialisation approche, et décale l’heure si le fournisseur déplace la réinitialisation.
- Si la limite est levée plus tôt (vous avez utilisé une réinitialisation, ou vous vous êtes connecté avec un autre compte), la session continue aussitôt. Si elle a été relancée plus tôt dans les 15 dernières minutes et qu’elle a de nouveau atteint la limite, elle attend la réinitialisation.
- Seul un tour réellement arrêté par la limite est relancé, pas un tour qui s’est terminé juste au moment où l’utilisation du forfait atteignait 100 %. Une reprise prévue est abandonnée quand la session continue sans elle : vous envoyez un message ou appuyez sur **Arrêter**, ou un tour se déroule normalement. Un tour que l’agent démarre de lui-même pendant l’attente (quand une tâche en arrière-plan ou un sous-agent à lui s’arrête à la même limite) ne l’abandonne pas. Une session que vous avez arrêtée avec **Arrêter** n’est jamais relancée toute seule, même si l’erreur de la limite est arrivée en premier, tant que vous ne lui avez pas envoyé de message.
- **Annuler** sur l’avis arrête une reprise prévue.

Avec plusieurs comptes pour l’agent (Claude Code, Codex ou Grok Build), [**Changer de compte à une limite**](/settings?s=accounts&find=Switch%20accounts%20at%20a%20limit) poursuit la session aussitôt avec un autre compte au lieu d’attendre, et n’attend que lorsque tous les comptes sont à leur limite (voir [Agents, comptes et modèles](/guide/agents-models#use-all-your-accounts-switch-at-a-limit)). Pour Claude Code, [**Utiliser le crédit d’API à une limite**](/settings?s=accounts&find=Use%20API%20credit%20at%20a%20limit) peut alors la poursuivre, facturée à une clé d’API Anthropic que vous avez enregistrée, au lieu d’attendre (voir [Utiliser le crédit d’API quand tous les comptes sont à leur limite](/guide/agents-models#use-api-credit-when-every-account-is-at-its-limit)).

## Utiliser une réinitialisation de limite

Certains forfaits vous donnent des réinitialisations de limite : les crédits de réinitialisation de Codex et les octrois de réinitialisation de Claude (Grok Build n’en a pas). En utiliser une efface tout de suite les limites d’utilisation du forfait, au lieu d’attendre qu’elles se réinitialisent.

Chaque carte les liste sous **Réinitialisations de limite**, avec leur nombre. Chaque réinitialisation affiche son nom (et le nombre d’utilisations restantes), « Expire dans … » (en couleur d’avertissement quand l’échéance est à moins d’un jour) ou « N’expire pas », et des remarques telles que « Fonctionne une fois la limite atteinte » ou « Pas encore utilisable ». Une réinitialisation retenue par une autre limite indique laquelle, et quand elle sera levée : « Bloquée tant que votre limite hebdomadaire est épuisée (utilisable dans …) ». Certaines réinitialisations de Claude n’effacent qu’une partie de votre quota, elles ne peuvent donc pas être utilisées tant que votre limite hebdomadaire est épuisée ; elles deviennent utilisables une fois celle-ci réinitialisée. Quand il n’y en a aucune : « Aucune réinitialisation de limite pour le moment », avec la date de la prochaine, si le forfait l’indique. L’app vérifie les réinitialisations d’un compte Claude environ toutes les dix minutes, car Anthropic refuse les vérifications plus fréquentes, et affiche entre-temps la dernière liste lue, même après un redémarrage de l’app. Une réinitialisation peut donc mettre quelques minutes à apparaître comme utilisable. Celle que vous utilisez disparaît aussitôt de la liste.

1. Cliquez sur **Utiliser** à côté d’une réinitialisation, ou sur **Utiliser une réinitialisation** dans un avis de limite (elle prend la première réinitialisation de la liste qui fonctionne maintenant).
2. Lisez la confirmation. Elle indique quelle réinitialisation sera utilisée, quand elle expire, et combien il en restera. Si vous n’êtes pas à une limite, elle vous en avertit (« Vous n’êtes pas à une limite en ce moment »).
3. Cliquez sur **Utiliser la réinitialisation**.

L’app indique comment cela s’est passé, par exemple « Les limites d’utilisation de Codex sont réinitialisées. », « Claude n’est pas à une limite d’utilisation en ce moment, rien n’a donc été réinitialisé. », « Les réinitialisations sont en pause. Réessayez plus tard. » ou « Cette réinitialisation a déjà été utilisée. » Quand cela fonctionne, une session qui attendait la limite continue aussitôt.

Les réinitialisations de Claude nécessitent Claude Code connecté avec un abonnement Claude (pas une facturation à l’API).

## Voir ce que les agents ont fait au fil du temps

L’onglet **Activité** (`/stats`) compte ce que les agents ont fait, d’après les sessions que l’app connaît sur cet ordinateur.

En haut :

- **Quotidien**, **Hebdomadaire**, **Mensuel** ou **Annuel** : la période que couvrent les chiffres, et une barre par jour, semaine, mois ou année dans les graphiques. La page retient votre choix.
- **Tout**, ou un seul agent : **Claude**, **Codex**, **Custom**, et tout autre agent qui a fait quelque chose ici (Gemini CLI, OpenCode…).
- La pastille d’un modèle, quand vous avez choisi un seul modèle dans **Par modèle** plus bas : la page ne compte alors que ce modèle. Cliquez sur la pastille (sur son **✕**) pour revoir tous les modèles.
- **Graphiques** ou **Tableau**.

La ligne à côté indique la plage couverte par les graphiques et le tableau (les 30 derniers jours, les 26 dernières semaines, les 12 derniers mois ou depuis le début de votre historique, ou toutes les années) ainsi que votre fuseau horaire. Les jours, semaines et mois suivent votre fuseau horaire, et une semaine commence le lundi.

En dessous figure la période en cours, **Aujourd’hui**, **Cette semaine**, **Ce mois-ci** ou **Cette année**, avec ses dates. Les tuiles en montrent les totaux :

- **Lignes ajoutées** et **Lignes retirées**
- **Jetons d’entrée** (ce que les modèles ont lu : neufs et en cache) et **Jetons de sortie** (ce qu’ils ont écrit)
- **Vitesse de sortie** : des jetons par seconde, pendant l’écriture des réponses
- **Coût API (est.)** : ce que les mêmes jetons coûteraient via l’API
- **Requêtes** (avec le nombre de tours), **Sessions**, **Commandes** (avec le nombre d’appels d’outils) et **Modifications de fichiers**

La petite flèche sur une tuile compare avec la période précédente, jusqu’au même point : un mercredi à 15 h, cette semaine est comparée à la semaine dernière du lundi au mercredi 15 h ; aujourd’hui à hier jusqu’à la même heure. La ligne à côté du nom de la période le précise (« par rapport à la semaine dernière jusqu’au même jour et à la même heure »). Elle est neutre : plus n’est ni mieux ni pire.

**Graphiques** montre les lignes modifiées (ajoutées vers le haut, retirées vers le bas), les jetons d’entrée (neufs et en cache), les jetons de sortie, la vitesse de sortie, et de petits graphiques pour les requêtes, les sessions, les commandes et les modifications de fichiers, une barre par jour, semaine, mois ou année sur la plage ; la dernière barre est la période en cours. **Tableau** liste les mêmes chiffres par période, de la plus récente à la plus ancienne, avec le total de toute la plage.

Plus bas, dans les deux vues, la période en cours à nouveau, comptée comme dans les tuiles :

- **Par agent** : chaque agent par son nom (Claude Code, Codex, Custom, Gemini CLI et les autres qui ont fait quelque chose), avec les sessions, les requêtes, les lignes, l’entrée et la sortie.
- **Principaux projets** : les dossiers où le plus de lignes ont été modifiées.
- **Par modèle** : les sessions, requêtes, entrée, entrée en cache, sortie et coût API de chaque modèle, les modèles de Custom (OpenRouter, Ollama, vLLM…) autant que ceux de Claude et de Codex. Cliquez sur un modèle pour voir toute la page pour lui seul. Un modèle sans prix connu affiche **définir un prix** à la place. Survolez un modèle pour voir son prix par million de jetons et d’où il vient (« votre prix » ou « grille de prix publique »).

Sur un téléphone, les tuiles sont disposées par deux sur une ligne, et certaines colonnes du tableau sont omises.

La page de démarrage résume la journée en une ligne sous la zone de message dès que les agents ont fait quelque chose aujourd’hui : « Aujourd’hui · 7 sessions · 12 modifications de fichiers · 0,84 $ », en omettant la partie qui vaut zéro. La somme est le **Coût API (est.)** du jour : avec un forfait (Claude Code, Codex), vous payez à la place l’abonnement de votre forfait, comme l’indique l’infobulle. Survolez la ligne pour voir les lignes ajoutées et retirées, les jetons d’entrée et de sortie, et les requêtes ; cliquez dessus pour ouvrir Activité.

## Comment les coûts sont estimés

Les forfaits Claude et ChatGPT sont à tarif fixe : l’app affiche donc ce que le même travail coûterait aux prix de l’API (les prix à l’usage). Cela vous indique ce que vous tirez de votre forfait, et ce que coûterait un modèle utilisé via l’API. La même estimation apparaît sur la ligne de chaque tour terminé dans une session (« ≈ 0,12 $ », avec le détail sous **Durée et coût**) et dans la ligne **Aujourd’hui** de la page de démarrage ; avec un forfait, les deux l’indiquent quand vous les survolez.

- Les prix proviennent d’une table de prix publique (celle de LiteLLM), que l’app télécharge au plus une fois par jour et conserve pour quand vous êtes hors ligne.
- Les prix que vous définissez vous-même l’emportent sur ceux de la table.
- Les tokens de chaque session sont facturés au prix de son modèle ; une session qui a changé de modèle est facturée au prix du dernier modèle utilisé.
- L’entrée en cache (le texte que le modèle a déjà lu, servi depuis son cache) est facturée au prix « en cache », ou au prix d’entrée s’il n’y en a pas.
- Les modèles sans prix connu (un simple nom de famille, comme « opus », ou un modèle absent de la table) comptent pour zéro dans les totaux et affichent **définir un prix** dans **Par modèle**.

Les modèles OpenRouter utilisent des prix récupérés automatiquement auprès d’OpenRouter, y compris les prix d’entrée en cache. Vous n’avez pas besoin de les saisir. Si OpenRouter n’a aucun prix disponible, **Par modèle** affiche un tiret au lieu de vous demander d’en définir un.

Les plafonds de dépenses utilisent les mêmes prix, mais reprennent le chiffre propre à un agent quand il en communique un : le coût de Claude Code, ou ce qu’OpenRouter indique pour chaque appel de Custom. Un modèle sur cet ordinateur ne coûte rien à ce titre.

## Définir votre propre prix pour un modèle

1. Dans l’onglet **Activité**, cliquez sur **Prix des modèles** en haut de **Par modèle**, ou sur **définir un prix** à côté d’un modèle.
2. La boîte de dialogue **Prix des modèles** liste les modèles affichés, ainsi que ceux dont vous avez déjà défini le prix. Chacun a **Entrée**, **En cache** et **Sortie**, en dollars par million de tokens. Les champs vides utilisent le prix de la table publique, affiché en gris.
3. Saisissez vos prix. L’entrée et la sortie sont toutes deux nécessaires ; le prix en cache est facultatif (il coûte alors le prix d’entrée).
4. Pour fixer le prix d’un modèle qui n’est pas listé, saisissez son ID dans **Autre ID de modèle** et cliquez sur **Ajouter**.
5. Cliquez sur **Enregistrer les prix**.

L’icône de corbeille sur une ligne (**Utiliser le prix de la table**) efface votre prix pour ce modèle. Pour qu’un modèle sur cet ordinateur compte comme gratuit, indiquez 0 pour l’entrée et la sortie.

## Chaque session est conservée

L’app conserve chaque session et ses chiffres, quoi que fasse le programme propre à l’agent. Claude Code supprime ses conversations après 30 jours sauf indication contraire ; l’app lui demande donc de les garder (dans chaque compte Claude Code dont les paramètres n’indiquent pas de durée), et elle conserve son propre lien vers chaque fichier de conversation de Claude Code et de Codex : une conversation que le programme de l’agent (ou n’importe qui) supprime revient, listée et ouvrable comme avant. Le lien est le même fichier sous un second nom, il ne prend donc aucun espace disque supplémentaire.

Ce qui disparaît, c’est ce que personne n’utilise : les sessions inactives depuis un an sont supprimées, sauf si vous changez ce réglage dans [Paramètres → Général → Supprimer les sessions inactives](/settings?s=general&find=Delete%20inactive%20sessions) (voir [Supprimer les sessions inactives](/guide/app#delete-inactive-sessions)). Leurs chiffres restent dans Activité.

Les conversations que Claude Code a supprimées avant cela, quand l’app ne les conservait pas, ne peuvent pas revenir ; l’historique d’Activité commence au moment où l’app les a comptées pour la première fois.

## Plafonner ce qu’une session dépense

Un plafond de dépenses arrête une session dès qu’elle a dépensé un montant donné aux prix de l’API, quel que soit votre forfait. Les sous-agents qu’elle démarre comptent aussi.

- Pour une nouvelle session : sur la page de démarrage, **Options** → **Plafond de dépenses**. Choisissez 1 $, 5 $, 10 $ ou 25 $, ou saisissez un montant et cliquez sur **Fixer**. **Aucun plafond** le retire.
- Pour une session en cours : le menu de la session (⋯) → **Paramètres de la session** → **Plafond de dépenses**. La boîte de dialogue montre ce qui a été dépensé jusqu’ici. Saisissez un plafond (à partir de 0,01 $) et cliquez sur **Fixer le plafond** ou **Variation** ; **Retirer le plafond** le retire.

Tant qu’un plafond est fixé, une barre au-dessus de la zone de message affiche « 1,20 $ sur 5,00 $ », avec **Variation**. Quand le plafond est atteint, l’agent s’arrête juste après l’appel au modèle qui l’a atteint, une note sous le tour indique « Arrêté au plafond de dépenses », et les nouveaux messages attendent que vous releviez le plafond (**Relever le plafond…**) ou le retiriez. Voir [Sessions](/guide/sessions) pour en savoir plus.

## L’onglet Arène

L’onglet **Arène** (`/arena`) montre quels modèles l’emportent sur vos propres tâches. Sur la page de démarrage, **Options** → **Arène** envoie aussi votre requête à un ou deux autres modèles ; vous gardez la meilleure réponse. L’onglet classe les modèles selon une note (une note Elo, qui part de 1000) calculée sur les duels que vous avez tranchés, avec la fréquence à laquelle chacun a été retenu et son taux de victoire, et liste les duels récents, tranchés ou encore ouverts. Voir [Recherche approfondie, seconds avis et plusieurs agents](/guide/research).

## Puis-je réinitialiser les chiffres ?

Il n’existe aucun bouton pour effacer Activité. Supprimer vous-même une session (son menu → **Supprimer la session**) retire aussi ses chiffres d’Activité ; les sessions supprimées pour cause d’inactivité conservent les leurs. Les limites de l’onglet Limites sont celles de vos forfaits : elles se réinitialisent selon le calendrier du fournisseur, ou avec une [réinitialisation de limite](#use-a-limit-reset).

## Demander à un agent

- « Combien me reste-t-il de mon forfait Claude cette semaine, et quand se réinitialise-t-il ? »
- « Combien me reste-t-il de mon forfait Grok cette semaine ? »
- « Active la reprise des sessions après les limites d’utilisation. »
- « Reprends ma session “Refonte de l’authentification” quand la limite de Codex se réinitialise. »
- « Combien aurait coûté le travail du mois dernier aux prix de l’API, par modèle ? »
- « Comment cette semaine se compare-t-elle à la semaine dernière jusqu’ici ? »
- « Pourquoi la ligne Aujourd’hui de ma page de démarrage affiche-t-elle 3,10 $ alors que j’ai un forfait ? »
- « Compte mes modèles Ollama comme gratuits dans les estimations de coût. »
- « Combien Custom a-t-il consommé ce mois-ci, et avec quels modèles ? »
- « Supprime les sessions après deux ans d’inactivité au lieu d’un. »
- « Affiche mon utilisation et mes coûts OpenRouter sans saisir de prix de modèles. »
