# Documents, images, vidéos et voix

Les agents de Hydor lisent les PDF, Word, Excel, PowerPoint et d’autres documents, en créent de nouveaux pour vous et vous les remettent sous forme de cartes que vous ouvrez ou téléchargez. Ils peuvent aussi créer des images, des dessins, des graphiques et de courtes vidéos, trouver des photos libres de droits, modifier vos images et vos vidéos (recadrer, détourer, effacer, couper), et composer des chansons, des voix off et des sons, avec des modèles d’image, de vidéo et d’audio et des outils présents sur cet ordinateur. Vous pouvez conserver ce qu’ils créent dans les fichiers d’un projet. Vous pouvez aussi dicter au lieu de taper, faire lire les réponses à voix haute, ou parler à l’app en mains libres pendant que vous marchez.

![Un agent qui a lu un rapport et créé une synthèse Word d’une page ainsi qu’une feuille de calcul avec un graphique](images/documents-voice.webp)

## Donner un document à lire à un agent

Tous les agents que l’app exécute savent lire des documents : Claude Code, Codex, Custom, et les agents qui parlent ACP et acceptent les serveurs MCP. Vous n’avez rien à convertir au préalable. Donnez-lui le document de l’une de ces façons :

1. **Le joindre à votre message** : le trombone (**Joindre des fichiers**) dans la zone de message, ou bien glissez le fichier sur la zone, ou collez-le. Les images sont transmises au modèle comme des images ; tout autre fichier est enregistré sur l’ordinateur qui exécute Hydor, et son chemin est ajouté à votre message pour que l’agent puisse l’ouvrir. Un message peut contenir jusqu’à 25 Mo de fichiers.
2. **Nommer un fichier de cet ordinateur** : « Résume ~/Documents/bail.pdf ». Un chemin qui ne commence ni par `/` ni par `~` part du dossier de la session.
3. **Conserver les documents dans un projet ou dans les connaissances partagées**, afin que les sessions puissent y chercher et citer la page : voir [Projets et connaissances](/guide/projects).

Pendant que l’agent lit, son travail affiche **Lecture de bail.pdf**, puis **Lu bail.pdf**. Sur un écran plus large, la ligne indique aussi de quoi il s’agit (le type, ses pages, feuilles ou diapositives) et quelles lignes ont été lues. Cliquez sur la ligne pour voir le texte reçu par l’agent, et sur **Ouvrir bail.pdf** pour voir le fichier lui-même.

Un long document est lu par morceaux, d’environ 1 200 lignes à la fois, et l’agent est prévenu quand il y en a davantage. On demande aux agents de traiter le contenu d’un document comme de l’information, et non comme des instructions. Rien dans un document ne s’exécute : les macros ne s’exécutent jamais, et seuls les liens web et de messagerie sont conservés.

Custom lit aussi les PDF, les documents Office et les images avec sa lecture de fichiers ordinaire : voir [Custom, l’agent propre à l’app](/guide/custom).

## Ce que les agents peuvent lire dans un document

### PDF

- Le texte de chaque page, mis en forme comme sur la page.
- Cela fonctionne mieux avec le programme pdftotext (dans poppler-utils). Sans lui, l’app télécharge pdf.js une seule fois (environ 35 Mo, ce qui demande une connexion internet cette première fois), et la mise en forme n’est qu’approximative.
- Les pages numérisées n’ont pas de texte, et l’agent est prévenu lesquelles (« Les pages 3, 5–7 n’ont pas de texte »). Avec la compétence **pdf**, il regarde alors ces pages comme des images et les lit lui-même, ou lance une reconnaissance de texte (OCR) dessus si tesseract est installé.
- Un PDF protégé par un mot de passe ne peut pas être lu. Donnez le mot de passe à l’agent, et la compétence **pdf** crée une copie déverrouillée. Un PDF qui s’ouvre sans mot de passe mais limite les modifications (beaucoup de formulaires officiels) est lu comme n’importe quel autre.
- **Formulaires** : l’agent liste les champs d’un formulaire PDF, chacun avec les mots imprimés à côté (qui disent à quoi sert un champ nommé « f1_02 »), et regarde ses pages comme des images avec les champs numérotés et une règle en points.
- **Vos surlignages et notes** : ce que vous avez surligné dans le lecteur de Fichiers, page par page, avec vos notes et des images des figures et des équations que vous avez choisies ([Lire et surligner un PDF](/guide/files-git#read-and-highlight-a-pdf)), pour les résumer ou les comparer à l’article. Sur demande, il surligne aussi des mots pour vous, qui apparaissent ensuite dans le lecteur.

### Word, Excel et PowerPoint

- **Word** (.docx, et ses variantes avec macros et modèles) : titres, paragraphes, listes numérotées et à puces, tableaux, liens, zones de texte, images d’après leur description, notes de bas de page, notes de fin et commentaires.
- **Excel** (.xlsx, et ses variantes avec macros et modèles) : chaque feuille sous forme de tableau avec ses numéros de ligne et ses lettres de colonne, les nombres à peu près tels qu’ils sont mis en forme (dates, pourcentages, sommes d’argent), et jusqu’à 40 formules par feuille. Les feuilles masquées sont signalées. Chaque feuille fournit ses 2 000 premières lignes et 60 premières colonnes, et l’agent est prévenu quand il y en a davantage ; pour lire une feuille plus grande en entier, la compétence **spreadsheets** la charge autrement.
- **PowerPoint** (.pptx, et ses variantes avec macros, modèles et diaporamas) : le titre, le texte, les tableaux, les images (d’après leur description), les graphiques (leur titre et leurs séries) et les notes du présentateur de chaque diapositive. Les diapositives masquées sont signalées. Jusqu’à 1 000 diapositives.

### OpenDocument, EPUB, CSV et RTF

- **OpenDocument** (les formats propres à LibreOffice .odt, .ods et .odp, leurs modèles, et .odg) : texte avec titres, listes, tableaux, liens et notes de bas de page ; feuilles telles qu’elles s’affichent ; diapositives avec leurs titres, leur texte et leurs notes.
- Livres **EPUB** : les chapitres dans l’ordre de lecture, avec titres, listes, tableaux et citations.
- Tableaux **CSV** et **TSV**, et texte **RTF**.

### Anciens fichiers Office, fichiers protégés et très gros fichiers

- Les anciens fichiers .doc, .xls et .ppt sont lus via LibreOffice, qui les convertit d’abord au format actuel. Sans LibreOffice, ils ne peuvent pas être lus, et l’agent vous demande le fichier enregistré en .docx, .xlsx ou .pptx, ou d’installer LibreOffice.
- Les fichiers Word, Excel et PowerPoint protégés par un mot de passe ne peuvent pas être lus.
- Les fichiers jusqu’à 300 Mo sont lus. Un document fournit jusqu’à environ 1 000 000 de caractères de texte (environ 250 000 tokens) ; au-delà, il est tronqué, et l’agent est prévenu.

## Faire créer un document par un agent

L’app est fournie avec quatre compétences de documents que tout agent peut charger : **word-documents**, **spreadsheets**, **presentations** et **pdf**. Vous les trouvez dans [Paramètres → Compétences](/settings?s=skills&find=Built%20in), sous **Documents** (voir [Compétences](/guide/skills)). Vous n’avez pas à les choisir : demandez simplement, avec vos mots (« Crée un CV d’une page à partir de mes notes, dans un document Word », « Mets ces dépenses dans une feuille de calcul avec les totaux mensuels et un graphique », « Fais 8 diapositives pour mon exposé sur les abeilles », « Fusionne ces trois PDF »), et l’agent charge la bonne compétence quand la tâche l’exige.

Chaque compétence fonctionne de la même façon :

1. L’agent planifie d’abord le document : son plan, ses feuilles ou ses diapositives.
2. Il écrit le fichier avec un court script dans le dossier de la session.
3. Il examine le résultat sous forme d’images de pages, vérifie que le texte ne déborde pas, que les tableaux tiennent dans la page et que les diapositives ne sont pas surchargées, puis corrige ce qui ne va pas.
4. Il remet le fichier sous forme de carte sous sa réponse, avec une courte légende (voir [Ouvrir ou télécharger les fichiers créés par un agent](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Quand il modifie un de vos fichiers, il enregistre le résultat sous un nouveau nom, sauf si vous lui avez demandé d’écraser le vôtre.

### Documents Word

Rapports, lettres, CV, notes de service, contrats, formulaires, polycopiés et notes, à ouvrir dans Word, Google Docs ou Pages.

- Une vraie structure : titres (qui fonctionnent dans le volet de navigation de Word et avec les lecteurs d’écran), listes à puces et numérotées, tableaux avec ligne d’en-tête, images et sauts de page.
- Une table des matières (Word la remplit à l’ouverture du fichier), des numéros de page (« Page 1 sur 3 »), des liens et des cellules de tableau ombrées.
- A4 ou US Letter, et des polices qui s’affichent de la même façon sur n’importe quel ordinateur (Calibri, Arial, Cambria, Times New Roman).
- Vos propres documents modifiés sur place, en conservant leurs styles, leurs en-têtes et leur mise en page ; texte remplacé sans perdre sa mise en forme ; commentaires ajoutés.
- Signés avec votre signature enregistrée : à la place de {{signature}}, juste après des mots comme « Signature : », dans une cellule de tableau ou à la fin, une fois que vous l’avez autorisé sur une carte ([Signatures](/guide/library#signatures)).
- Un PDF du document aussi, via LibreOffice.

### Feuilles de calcul

Budgets, suivis, plannings, factures et tableaux de données (.xlsx).

- Vos nombres comme valeurs et les résultats comme formules, pour que vous puissiez modifier un nombre et voir le reste suivre.
- Formats de nombre pour les sommes d’argent, les pourcentages et les dates ; une ligne d’en-tête en gras qui reste visible ; des largeurs de colonne ; des filtres sur les listes.
- Des graphiques en barres, en courbes et en secteurs à côté des données.
- Une vérification de chaque formule. Si LibreOffice est installé, la vérification calcule les formules et liste les erreurs (#REF!, #DIV/0!, #NAME?), que l’agent corrige ensuite.
- Vos propres classeurs modifiés, en conservant leurs formules, leurs styles et l’essentiel de leur mise en page (les tableaux croisés dynamiques ne sont pas conservés, et les graphiques seulement quand l’agent les reconstruit). Un fichier CSV à la place, quand vous en demandez un.

### Présentations

Présentations commerciales, exposés, cours et synthèses (.pptx), à projeter dans PowerPoint, Keynote ou Google Slides.

- Des diapositives 16:9 soignées, avec une apparence unifiée et la couleur de votre marque : une diapositive de titre, des puces à plusieurs niveaux, deux colonnes, des images ajustées à la diapositive, des tableaux, des graphiques (colonnes, barres, courbes, secteurs, empilés), des diapositives de section, et des notes du présentateur pour ce que vous direz.
- Une idée par diapositive, avec des titres qui énoncent le message (« Les ventes ont progressé de 12 % »), généralement de 6 à 12 diapositives pour un exposé.
- Des images fournies par vous, venues du web, ou créées avec un modèle d’image (voir [Laisser les agents créer des images](/guide/documents-voice#let-agents-make-images)).
- Une nouvelle présentation sur votre propre modèle, ou votre présentation modifiée, en conservant son thème et ses mises en page.
- Un PDF des diapositives, via LibreOffice.

### PDF

Rapports, factures, attestations, flyers, lettres et formulaires.

- Surtout du texte, ou quelque chose que vous voudrez modifier : l’agent crée un document Word, puis un PDF à partir de celui-ci avec LibreOffice.
- Mise en page exacte (factures, attestations, billets, formulaires) : il dessine directement le PDF.
- Diapositives ou feuille en PDF : créées avec leur compétence, puis converties en PDF.
- **Remplir un formulaire** : ses champs par leur nom (texte, cases cochées, choix, en grec, en chinois ou dans n’importe quelle écriture), pour que tout lecteur les affiche et qu’ils restent modifiables ; ou, pour un formulaire fait seulement de lignes et de cases imprimées, les mots écrits sur la page à côté des mots imprimés (« Date de naissance : ») et des croix dans ses cases ; sur un formulaire numérisé, qui n’a pas de mots à repérer, là où l’agent voit les espaces vides sur une image de la page. L’agent vous demande ce qu’il ne sait pas, et regarde les pages avant et après. Un formulaire signé numériquement reste valide quand seuls ses champs sont remplis. Les formulaires XFA (Adobe LiveCycle) ne se remplissent que dans les apps d’Adobe : l’agent vous le dit, et peut tout de même écrire sur leurs pages.
- **Écrire sur les pages** : des mots, des croix et des coches, des images, des cadres blancs par-dessus ce qui est là (ils ne cachent les mots qu’à l’œil : les mots restent dans le fichier, ce n’est donc pas une vraie censure), des contours et des lignes, ainsi que des surlignages et des commentaires propres au PDF, que les autres lecteurs listent et peuvent retirer.
- **Modifier les pages** : les faire pivoter, les supprimer, les déplacer, insérer des pages blanches, fusionner des PDF, extraire certaines pages dans un fichier à part ou scinder un PDF en plusieurs. Un fichier modifié ainsi ne peut pas conserver de signature numérique, et l’agent vous le dit.
- Ce que l’agent écrit va dans une copie à côté du fichier (« nom (rempli).pdf »), sauf si vous demandez que le fichier lui-même soit modifié ; son ancienne version va alors dans la Corbeille. Vous pouvez aussi remplir et signer vous-même un PDF : [Remplir et signer un PDF](/guide/files-git#fill-in-and-sign-a-pdf).
- De grands mots pâles comme BROUILLON sur chaque page, et une copie sans son mot de passe (vous donnez le mot de passe), avec la compétence **pdf**.
- Signés avec votre signature enregistrée, à côté de mots sur une page ou à un endroit qu’il vous montre d’abord, une fois que vous l’avez autorisé sur une carte ; ajoutée au PDF sans changer ce qu’il contenait ([Signatures](/guide/library#signatures)).
- Fichiers Office convertis en PDF.

### Ce dont l’ordinateur a besoin

Cela concerne l’ordinateur qui exécute Hydor, et non l’appareil depuis lequel vous l’utilisez.

- **Python 3**, avec son module venv : nécessaire pour créer des documents. La première fois, les compétences installent quelques bibliothèques Python pour les fichiers Office et les PDF dans un dossier privé de l’app (environ 30 Mo, une seule fois, depuis internet) ; rien n’est installé sur l’ensemble du système. Si Python est absent, l’agent vous indique la commande à lancer (sur Debian ou Ubuntu `sudo apt install python3 python3-venv` ; sur Mac `brew install python`).
- **LibreOffice** (facultatif) : aperçus sous forme de pages mises en forme dans la visionneuse de fichiers, lecture des anciens fichiers .doc, .xls et .ppt, agents qui regardent les documents Office comme des pages, vérification des formules, et PDF créés à partir de fichiers Office. Sur Debian ou Ubuntu : `sudo apt install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui` ; sur Mac : `brew install --cask libreoffice`.
- **poppler-utils** (facultatif) : la meilleure lecture des PDF, et les images des pages de PDF pour les agents et pour **Remplir et signer**. Sans lui, l’app les dessine avec ce que l’ordinateur propose (le moteur de rendu PDF de Mac ou de Windows), ou avec le navigateur de **Paramètres → Navigateur**. Sur Debian ou Ubuntu : `sudo apt install poppler-utils` ; sur Mac : `brew install poppler`.
- **tesseract** (facultatif) : OCR pour les PDF numérisés.

Sans LibreOffice ni poppler-utils, les agents relisent leurs fichiers sous forme de texte pour les vérifier, et gardent une mise en page simple.

## Ouvrir ou télécharger les fichiers créés par un agent

Quand un agent a créé des fichiers pour vous (un document, une feuille de calcul, des diapositives, un PDF, des images, une archive), il vous les remet sous forme de cartes sous sa réponse, 12 au maximum à la fois. Chaque carte comporte :

- une icône selon le type, dans sa couleur (bleu pour Word, vert pour Excel, orange pour PowerPoint, rouge pour PDF), ou une miniature pour une image ;
- le nom du fichier, sa nature et sa taille (« Document Word · 24 Ko ») ;
- la légende de l’agent (« Le budget, une feuille par trimestre ») ;
- **Ouvrir**, un bouton de téléchargement et **Plus** (⋯).

**Ouvrir** affiche le fichier dans la visionneuse de fichiers, dans une fenêtre par-dessus la conversation, qui reste là où elle en était (sur téléphone, la fenêtre remonte du bas de l’écran). **Ouvrir dans Fichiers**, en haut de la fenêtre, emmène le fichier vers la page Fichiers ; la croix, ou Échap, ferme la fenêtre. Au-dessus du fichier s’affiche son chemin, comme sur la page Fichiers ([Ouvrir et modifier un fichier](/guide/files-git#open-and-edit-a-file)) ; un dossier qui s’y trouve s’ouvre dans la même fenêtre, avec le fichier sélectionné (l’app vous demande d’abord ce qu’il faut faire des modifications non enregistrées), et **‹** en haut de la fenêtre ramène au fichier. Le bouton de téléchargement enregistre le fichier sur votre appareil.

**Plus** (⋯), sur une carte et en haut de la fenêtre, propose **Démarrer une session avec ce fichier** (la page de démarrage, avec le fichier dans sa zone de message), **Ajouter à un projet** (le copie dans le dossier d’un projet), **Garder une copie** (pour un notebook Jupyter, une présentation PowerPoint, un document Word ou Markdown, une feuille de calcul ou un fichier LaTeX : une copie conservée comme un document à part entière, dans son éditeur, dans les fichiers du projet que vous choisissez si vous en avez, sinon dans ceux de la session), **Afficher dans Fichiers** (sur une carte), **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau ; voir [Travailler avec des fichiers et des dossiers](/guide/files-git#work-with-files-and-folders)) et **Copier le chemin**. Voir [Démarrer une session avec des fichiers](/guide/files-git#start-a-session-with-files) et [Ajouter des fichiers à un projet](/guide/files-git#add-files-to-a-project).

Un fichier supprimé ou déplacé depuis s’affiche avec la mention **Introuvable**. Si un agent mentionne un fichier qui n’existe pas, vous voyez « Impossible d’afficher les fichiers » avec la raison, et l’agent est invité à corriger le problème.

### Les documents qu’il a créés ou modifiés, et les noms de fichiers dans sa réponse

Sous la réponse d’un agent, les documents qu’il a créés ou modifiés pendant ce tour s’affichent toujours sous forme de cartes, qu’il vous les ait remis ou non : fichiers PDF, Word, Excel, PowerPoint et OpenDocument, tableaux CSV et TSV, LaTeX, notebooks Jupyter, EPUB et Markdown. Ce sont ceux que ses modifications ont écrits, et ceux que ses commandes ont produits dans le dossier de la session pendant le tour (ceux que le tour nomme, ou qui se trouvent à côté d’un fichier qu’il a modifié : les autres sessions qui travaillent dans le même dossier n’ajoutent pas les leurs).

- Chaque carte indique **Nouveau** ou **Mise à jour**, avec son type et sa taille, et propose **Ouvrir**, un bouton de téléchargement et **⋯**, comme les cartes ci-dessus.
- Les documents finis (un PDF, un fichier Word…) passent avant leurs sources (LaTeX, Markdown, tableaux). Les quatre premiers sont affichés ; **Afficher N documents de plus** montre les autres et **En afficher moins** les replie.
- Un fichier que l’agent a remis garde sa propre carte et sa légende, et n’est pas affiché deux fois. Un fichier introuvable est laissé de côté. Les images, le code et les fichiers de données ne sont pas affichés de cette façon (un agent remet toujours les images lui-même).

Les noms de fichiers et les chemins dans une réponse sont des liens. Un nom ou un chemin en code (`report.tex`, `docs/report.pdf`, `src/app.ts:42`, qui s’ouvre à cette ligne), un chemin absolu ou commençant par `~/` dans le texte, et un lien vers un fichier ouvrent tous le fichier dans la fenêtre par-dessus la conversation, comme le fait **Ouvrir** sur une carte. Un nom seul ouvre le fichier de la conversation portant ce nom ; un chemin qui ne part pas de la racine est relatif au dossier de la session.

## Prévisualiser un document dans la visionneuse de fichiers

La visionneuse de fichiers affiche les documents depuis une carte, depuis la page Fichiers ou depuis un lien dans une réponse (voir [Système : fichiers, Git, Terminal et aperçu](/guide/files-git)).

- Les **PDF** s’affichent tels quels, dans la visionneuse PDF du navigateur, avec **Remplir et signer** pour les remplir et les signer ([Remplir et signer un PDF](/guide/files-git#fill-in-and-sign-a-pdf)).
- Les fichiers **PowerPoint** (.pptx, et ses variantes avec macros, diaporama et modèle) s’ouvrent sur **Diapositives** : « Ses diapositives, telles que l’app les dessine ». Chaque diapositive s’affiche telle qu’elle est, comme dans une présentation conservée (ses images, formes, tableaux, graphiques, arrière-plan et pied de page en place), les unes sous les autres avec leur numéro et leurs notes du présentateur, y compris sur téléphone. Une police utilisée par la présentation et absente de cet ordinateur est remplacée par une autre ; quand celle-ci demande plus de place, le texte d’une zone est légèrement réduit pour tenir, afin que rien ne soit coupé. **Texte** (« Ses mots et les notes du présentateur ») affiche le texte des diapositives, et **Pages** les montre mises en page par LibreOffice s’il est installé. Si les diapositives ne peuvent pas être dessinées, la visionneuse s’ouvre sur **Texte** et en donne la raison.
- Les fichiers **Word, Excel, PowerPoint, OpenDocument, EPUB et RTF** (y compris les anciens .doc, .xls et .ppt) s’affichent sous forme d’aperçu. Quand LibreOffice est installé, un sélecteur en haut propose deux vues :
  - **Pages** : « Comme LibreOffice les met en page », chaque page telle qu’elle serait imprimée. La première fois demande un instant (« Mise en page des pages… ») ; ensuite les pages s’ouvrent aussitôt, tant que le fichier ne change pas.
  - **Texte** : « Son texte, ses feuilles et ses diapositives », tels que l’app les lit. Un document texte s’affiche comme une page de papier ; un classeur comme une grille avec des lettres de colonnes, des numéros de lignes et un onglet par feuille en bas (les feuilles masquées sont signalées par un œil barré) ; les diapositives comme des cartes, chacune avec son numéro et ses notes du présentateur dessous. Les images s’affichent comme un cadre contenant leur description. Une ligne en haut indique quand quelque chose a été omis (« Affiche les 1 000 premières lignes »).
- Sans LibreOffice, il n’y a que la vue **Texte**. Les livres EPUB s’ouvrent toujours dans cette vue.
- Sur téléphone, l’aperçu s’ouvre sur **Texte** (un fichier PowerPoint sur **Diapositives**), qui défile et se zoome mieux sur un petit écran ; le sélecteur permet d’afficher les pages.

Si LibreOffice ne parvient pas à mettre un fichier en page, la visionneuse le signale et son texte reste disponible sous **Texte**. Un fichier sans aperçu affiche « Aucun aperçu pour ce fichier » : téléchargez-le pour l’ouvrir sur votre appareil. Le bouton de téléchargement de la visionneuse est toujours là.

## Laisser les agents créer des images

Demandez une image à n’importe quel agent (« crée un logo pour ma boulangerie », « transforme cette photo en aquarelle ») : il la crée avec un modèle d’images via OpenRouter, l’enregistre dans le dossier de la session et l’affiche avec sa réponse. Configurez cela dans **[Paramètres → Capacités → Images, vidéo et audio](/settings?s=images)** (sur téléphone : Paramètres, puis **Images, vidéo et audio**).

- **[Création d’images](/settings?s=images&find=Making%20images)** : l’interrupteur **Laisser les agents créer des images**, à côté du titre du groupe, donne à chaque agent ses outils pour les images : créer des images, des dessins et des graphiques, retirer l’arrière-plan d’une image ou en effacer une partie. Il est activé tant que vous ne le désactivez pas ; désactivé, les agents ne disposent plus de ces outils.
- **La clé OpenRouter** : les modèles d’images, de vidéo et d’audio sont accessibles via OpenRouter, et chaque image, vidéo ou son est payé avec votre clé OpenRouter. Sans clé, cette section l’indique, avec **Obtenez-en une sur openrouter.ai** et **Ajouter la clé**, qui ouvre [Paramètres → Agents → Modèles → OpenRouter](/settings?s=models&find=OpenRouter) où l’on saisit la clé (voir [Agents, comptes et modèles](/guide/agents-models)). Un agent qui en a besoin vous la demande plutôt sur une carte ([Quand un agent a besoin de la clé OpenRouter](#when-an-agent-needs-the-openrouter-key)).
- **[Pour la plupart des images (Meilleur)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)** : le modèle qui crée des scènes, des photos, des personnes, du texte dans une image et des diagrammes, ainsi que chaque retouche d’une image. Il affiche son nom, avec son éditeur, environ ce que coûte une image (pour une image d’environ un mégapixel) et le mois où OpenRouter l’a référencé en dessous (son identifiant se trouve dans le (i)), avec des étiquettes : **Nouveau** (référencé au cours des 30 derniers jours), **Retouches** (il accepte des images à modifier ou à suivre) et **Le texte aussi** (il écrit du texte avec ses images). Tant que vous n’en choisissez pas, c’est le choix de l’app (« Le choix de l’app, tant que vous n’en choisissez pas ») : le premier d’une courte liste que OpenRouter propose encore : Seedream 5.0 Pro et Flash de ByteDance, puis les modèles d’images de Google Gemini, d’OpenAI et FLUX.
- **[Pour les images simples (Rapide)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)** : un modèle moins cher et plus rapide pour les icônes, les arrière-plans, les textures et les images simples, présenté de la même façon. Tant que vous n’en choisissez pas, c’est le choix de l’app : le premier d’une courte liste de modèles rapides que OpenRouter propose encore, Seedream 5.0 Flash de ByteDance en tête, puis des modèles rapides de Google, Recraft, FLUX et OpenAI (quand OpenRouter n’en propose aucun, le modèle Meilleur crée aussi les images simples).
- **[Outils d’images sur cet ordinateur](/settings?s=images&find=Picture%20tools%20on%20this%20computer)** : retirer l’arrière-plan d’une image, en effacer une partie et l’agrandir sur cet ordinateur plutôt que via OpenRouter : c’est gratuit, et vos images restent ici. **Configuration** les télécharge une seule fois, la ligne en dessous indique ce qu’ils font, et **⋯ → Retirer** les retire de cet ordinateur (voir [Les outils d’images sur cet ordinateur](/guide/library#the-picture-tools-on-this-computer)).

Pour choisir le modèle Meilleur ou Rapide :

1. Cliquez sur **Variation** à côté de lui : une liste des modèles d’images d’OpenRouter s’ouvre (**Modèle d’images pour la plupart des images (Meilleur)** ou **Modèle d’images pour les images simples (Rapide)**).
2. Cherchez par nom (« seedream », « flux », « gemini ») et triez par **Suggéré** (les suggestions de l’app d’abord), **Plus récent** ou **Le moins cher**.
3. Cliquez sur une ligne pour utiliser ce modèle. Une fois que vous en avez choisi un, le menu **⋯** de la ligne propose **Laisser plutôt l’app choisir**, qui revient au choix de l’app.

Les listes viennent d’OpenRouter et ne demandent aucune clé ; quand elles sont inaccessibles, la liste l’indique.

## Laisser les agents créer des vidéos

Les agents peuvent aussi créer de courtes vidéos (« dix secondes de vagues au crépuscule », « fais courir mon chien dans un champ sur cette photo »), avec un modèle vidéo via OpenRouter, dans la même section, **[Paramètres → Capacités → Images, vidéo et audio](/settings?s=images)** :

- **[Création de vidéos](/settings?s=images&find=Making%20videos)** : l’interrupteur **Laisser les agents créer des vidéos**, à côté du titre du groupe, donne à chaque agent l’outil correspondant. Il est activé tant que vous ne le désactivez pas.
- **[Modèle vidéo](/settings?s=images&find=Video%20model)** : le modèle qui les crée, affiché avec son éditeur, le prix d’une seconde de vidéo (de sa résolution la plus basse sans son à la plus haute avec son, par exemple « 0,03 $ à 0,08 $ la seconde »), les durées qu’il produit (« 4 à 8 s »), sa résolution maximale (« jusqu’à 1080p ») et le mois où OpenRouter l’a référencé, avec des étiquettes : **Son** (il crée du son avec l’image), **À partir d’une image** (il peut partir d’une image que vous fournissez) et **Modifie des vidéos** (il modifie une vidéo que vous lui donnez au lieu d’en créer une à partir de mots). Tant que vous n’en choisissez pas, c’est le choix de l’app : le premier d’une courte liste de modèles avec son que OpenRouter propose encore : Seedance 2.5 de ByteDance, puis des modèles moins chers et plus rapides comme Google Veo 3.1 Lite. **Variation** ouvre la liste pour chercher (« seedance », « veo », « kling ») et trier par **Suggéré**, **Plus récent** ou **Le moins cher**.

- **[Utiliser la carte graphique pour les vidéos](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** (sous **Montage de vidéos**) : **Automatique** crée les vidéos que vous montez, ainsi que les montages des agents, sur la carte graphique quand il y en a une qui fonctionne (NVIDIA, Intel, AMD ou Apple) : c’est beaucoup plus rapide, et le processeur reste libre. Elle est testée la première fois qu’une vidéo est créée, et la ligne en dessous indique ce qui a été trouvé (« NVIDIA GeForce RTX 4090 · NVENC ») ; **Vérifier maintenant** la teste de nouveau. Si la carte échoue sur un montage, le processeur le refait aussitôt. **Désactivé** les fait sur le processeur.

Les vidéos coûtent beaucoup plus cher que les images : de quelques centimes à plusieurs dollars la seconde, et une vidéo de 8 secondes avec son d’un modèle haut de gamme peut coûter plusieurs dollars. Chacune est payée avec votre clé OpenRouter, et vous voyez son prix sur un formulaire avant que quoi que ce soit ne soit créé.

## Laisser les agents créer de l’audio

Les agents peuvent aussi créer du son : chansons et jingles (« un jingle de 30 secondes pour mon podcast »), voix off et narration dans une voix que vous décrivez (« lis ce message de bienvenue d’une voix chaleureuse et lente ») ou dans une voix copiée d’un enregistrement que vous avez, ainsi que bruitages et ambiances (« de la pluie sur un toit en tôle »). Configurez cela dans la même section, **[Paramètres → Capacités → Images, vidéo et audio](/settings?s=images)** :

- **[Création d’audio](/settings?s=images&find=Making%20audio)** : l’interrupteur **Laisser les agents créer de l’audio**, à côté du titre du groupe, donne à chaque agent l’outil correspondant. Il est activé tant que vous ne le désactivez pas.
- **[Modèle musical](/settings?s=images&find=Music%20model)** : le modèle qui crée les chansons et la musique, affiché avec son éditeur, son prix (« 0,08 $ la chanson »), la durée maximale qu’il produit (« jusqu’à 3:00 ») et le mois où OpenRouter l’a référencé, avec l’étiquette **Musique**. Tant que vous n’en choisissez pas, c’est le choix de l’app : Lyria 3 Pro de Google, qui crée des chansons entières d’environ 3 minutes au plus, chantées ou non ; à défaut, Lyria 3 Clip, qui crée des extraits de 30 secondes.
- **[Modèle de voix et de sons](/settings?s=images&find=Voice%20and%20sound%20model)** : le modèle qui parle et crée d’autres sons, affiché avec son prix (« 0,0025 $ la seconde », « 0,08 $ pour 1 000 caractères », « environ 0,014 $ la minute »), la durée maximale qu’il produit et le nombre de voix dont il dispose, avec des étiquettes : **Les sons aussi** (il crée des bruitages et des ambiances en plus des voix, à partir d’une description), **Copie des voix** (il parle dans une voix copiée de courts enregistrements que vous lui donnez), **Conversations** (il fait parler plusieurs personnages, chacun avec sa propre voix) et **Dirigé** (il accepte des indications d’interprétation : ton, rythme, émotion). Tant que vous n’en choisissez pas, c’est le choix de l’app : Seed Audio 1.0 de ByteDance, qui fait tout cela à partir d’une description, jusqu’à 2 minutes à la fois ; à défaut, Gemini 3.8 Flash TTS de Google, puis ElevenLabs v3.

**Variation** ouvre la liste de chaque modèle, pour chercher (« lyria » ; « seed », « elevenlabs », « gemini ») et trier par **Suggéré**, **Plus récent** ou **Le moins cher** (les voix selon ce que coûte environ une minute de parole) ; la ligne d’un modèle choisi propose **⋯ → Laisser plutôt l’app choisir** pour revenir au choix de l’app. Quand le modèle de voix que vous avez choisi se contente de lire des mots à voix haute, un bruitage ou une voix copiée est créé avec le choix de l’app qui en est capable, et le formulaire le précise.

Les modèles de voix sont surtout facturés au caractère lu, Seed Audio à la seconde de son créé, Lyria à la chanson. Chacun est payé avec votre clé OpenRouter, et vous voyez son prix sur un formulaire avant que quoi que ce soit ne soit créé.

## Vérifier les paramètres avant toute création

Avant qu’un agent crée une image, un dessin détaillé, une vidéo ou un son, un court formulaire s’affiche dans la conversation avec les paramètres que ce modèle accepte et le coût du résultat, pré-rempli avec ce que vous avez demandé et les valeurs par défaut de l’app :

- pour une image : **Forme** (carrée, large, haute…, selon ce que le modèle accepte), **Résolution** (1K, 2K, 4K…), **Qualité**, **Nombre d’images** (pour les modèles qui en créent plusieurs à la fois) et **Fond transparent** (pour un logo ou une icône) ;
- pour un dessin détaillé (par le modèle vectoriel de Recraft) : sa **Forme** ;
- pour une vidéo : **Durée de la vidéo** (les durées que le modèle sait créer, ou **Durée, en secondes**), **Forme**, **Résolution** et **Son** ;
- pour un son : pour une chanson, **Instrumental, sans chant** et, avec un modèle qui crée de longues chansons, **Durée, en secondes** (laissez vide pour que la chanson dure le temps qu’il lui faut) ; pour un effet sonore, sa **Durée, en secondes** (Seed Audio est facturé à la seconde) ; pour une voix parlée, la **Voix** (pour un modèle qui a ses propres voix) ; et le **Fichier** (**MP3, plus léger** ou **WAV, non compressé**), quand le modèle propose les deux.

Au-dessus des champs figurent le nom du modèle, son prix (« environ 0,08 $ l’image », « de 0,03 $ à 0,08 $ la seconde, selon la résolution et le son », « 0,08 $ la chanson », « 0,0025 $ la seconde de son » ; pour une vidéo ou un son, ce que cela donne avec les paramètres affichés) et ce que l’agent va demander, en entier et avec ses propres mots. Modifiez ce que vous voulez, puis cliquez sur **La créer** ; **Pas maintenant** ferme le formulaire, et rien n’est créé ni dépensé. Le formulaire n’affiche que les paramètres que le modèle propose.

Le formulaire apparaît une fois par modèle dans une session : les images, vidéos et sons suivants de cette session reprennent les paramètres que vous avez choisis (pour un son, sa voix et son fichier), sauf si vous en demandez d’autres (« maintenant une image en hauteur »). Dites « montre-moi à nouveau les paramètres » pour afficher le formulaire, ou « vas-y, choisis pour moi » pour que l’agent crée sans formulaire. Les tâches planifiées et les exécutions des apps créent sans formulaire, avec les valeurs par défaut de l’app, puisque personne n’est là pour répondre.

## Quand un agent a besoin de la clé OpenRouter

Les images, dessins détaillés, vidéos, musiques et voix sont créés par des modèles via OpenRouter, avec paiement au moyen de votre clé OpenRouter. Lorsqu’un agent s’apprête à en créer un et qu’aucune clé n’est définie, une carte s’affiche d’abord dans la conversation, **Une clé OpenRouter est nécessaire**, indiquant quel modèle le créerait, environ combien cela coûte, et que vous payez OpenRouter pour ce qui est créé, avec un champ pour la clé :

- Collez-la et cliquez sur **Enregistrer la clé** (ou appuyez sur Entrée). OpenRouter la vérifie d’abord ; elle va directement dans [Paramètres → Agents → Modèles → OpenRouter](/settings?s=models&find=OpenRouter), jamais dans la conversation, et l’agent poursuit (vers le formulaire des paramètres, comme d’habitude). La carte indique alors « Votre clé OpenRouter est enregistrée dans Paramètres → Modèles. »
- **Obtenir une clé** ouvre la page d’OpenRouter où vous pouvez en créer une.
- **Passer** : ce modèle ne s’exécute pas, rien n’est créé ni dépensé, et l’agent poursuit sans lui, autrement lorsqu’il n’y a pas besoin de clé (un dessin simple qu’il écrit, les [outils d’image sur cet ordinateur](/guide/library#the-picture-tools-on-this-computer)), ou sans rien. La session ne redemande pas avant six heures.

La carte attend jusqu’à neuf minutes ; ensuite l’agent poursuit sans la clé, et il en est informé si vous l’ajoutez plus tard. Les tâches planifiées et les exécutions des apps n’affichent pas de carte, puisque personne n’est là pour répondre : elles signalent que la clé manque (« Les images nécessitent une clé OpenRouter », avec **Ajouter une clé OpenRouter**). Les outils d’IA des éditeurs demandent la clé dans leur propre boîte de dialogue ([Créer des images, des dessins, des graphiques et des vidéos avec l’IA](/guide/library#make-pictures-drawings-plots-and-videos-with-ai)).

## Demander une image, ou la faire modifier

Décrivez ce que vous voulez : le sujet, le décor, le style (une photo, une illustration, une aquarelle), les couleurs, la lumière et les mots qui doivent y figurer. L’agent peut aussi :

- **modifier ou combiner vos images** : des fichiers d’image sur cet ordinateur (PNG, JPEG, WebP ou GIF, jusqu’à 20 Mo chacun ; la plupart des modèles en acceptent jusqu’à 4, certains plus), dans le dossier de la session ou par leur chemin, ou les images déjà présentes dans une présentation, un document ou une page que vous avez gardés ; dites ce qu’il faut changer. (Une image jointe à un message est transmise au modèle pour qu’il la regarde ; pour que le modèle d’image travaille à partir d’elle, il faut que ce soit un fichier : importez-la depuis la page Fichiers.) Cela demande un modèle portant l’étiquette **Retouches** ; avec un autre, l’agent doit décrire la modification avec des mots ou vous demander de choisir un modèle qui retouche les images ;
- **utiliser le modèle Rapide ou le Meilleur** : l’agent prend le Rapide pour les images simples (un arrière-plan, une texture, une icône) et le Meilleur pour les scènes, les photos, les mots dans une image, les diagrammes et toutes les retouches, ou il décide d’après votre demande ; dites-le pour obtenir l’autre (« un modèle rapide suffit », « utilise le modèle Meilleur ») ;
- **rendre l’arrière-plan transparent** (un logo, une icône) : un modèle qui ne sait pas le faire passe la main à un modèle qui le peut ou, si les [outils d’image](/guide/library#the-picture-tools-on-this-computer) sont installés, l’image est créée sur un fond uni et son arrière-plan est retiré sur cet ordinateur ;
- **utiliser un autre modèle** pour une seule image, quand vous le nommez (« fais-la avec FLUX 2 Pro »), sans modifier les Paramètres.

Les images sont enregistrées dans un dossier **images** à l’intérieur du dossier de la session, nommées d’après ce qu’elles montrent, et jamais par-dessus un fichier existant.

Dans la conversation :

- Pendant que le modèle travaille, un espace réservé de la forme demandée indique « Création d’une image » avec le temps écoulé, et la description en dessous.
- Ensuite, les images s’affichent avec la réponse, avec la description et le nom du modèle en dessous, ainsi que **Garder** (voir [Garder ce qu’un agent a créé](#keep-what-an-agent-made)). Cliquez sur l’une d’elles pour la voir en grand : cliquez à nouveau pour la taille réelle, les flèches (ou les touches fléchées) font défiler plusieurs images, **Ouvrir dans un nouvel onglet** l’ouvre seule, **Modifier** l’ouvre dans l’éditeur d’images (ce que vous y enregistrez est conservé comme une nouvelle image : [Modifier des images et des vidéos](/guide/library#edit-pictures-and-videos)), et Échap ferme. Sur chaque image, **Afficher dans les fichiers**, **Télécharger** et **Plus** (⋯ : **Démarrer une session avec ce fichier**, **Ajouter à un projet**, **Copier le chemin** et, dans l’app de bureau, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier**) apparaissent quand vous la survolez (sur téléphone, ils sont toujours visibles) ; avec plusieurs images, **Garder** est aussi présent.
- Sans clé OpenRouter définie, une carte vous en demande d’abord une ([Quand un agent a besoin de la clé OpenRouter](#when-an-agent-needs-the-openrouter-key)) ; dans une exécution que personne ne surveille (celle d’une tâche planifiée ou d’une app), vous voyez à la place « Les images nécessitent une clé OpenRouter », avec **Ajouter une clé OpenRouter**. Quand rien n’est créé (vous avez passé la clé ou fermé le formulaire, ou le modèle a refusé), vous voyez « Pas d’image cette fois » avec la raison.

## Demander un dessin ou un graphique

Certaines images sont mieux dessinées à partir de formes ou calculées à partir de nombres que peintes par un modèle d’image :

- **Un dessin** (un SVG : des formes plutôt que des pixels, net à toutes les tailles) : une icône, un logo, un diagramme, un motif qui se répète, une forme ou une illustration à plat, dans les couleurs que vous indiquez (celles d’une présentation ou d’un document, par exemple). Un dessin simple est écrit par Claude (ou par le [modèle d’appoint](/settings?s=models&find=Helper%20model) que vous avez choisi), sans modèle d’image à payer, en moins d’une minute ; un dessin détaillé (une illustration, ou quand vous demandez le meilleur) est dessiné par le modèle vectoriel de Recraft via OpenRouter, environ 0,08 $ le dessin, après le formulaire indiquant son prix. Les scripts, les liens et tout ce qu’un dessin chargerait depuis un autre endroit sont retirés de chaque dessin avant qu’il soit conservé.
- **Un graphique** de vos données ou de calculs mathématiques, pour ce qu’un graphique de diapositive ne sait pas tracer : nuages de points, histogrammes, boîtes à moustaches, barres d’erreur, plusieurs axes ou panneaux, cartes de chaleur, fonctions, ajustements et annotations sur les points importants. Claude (ou le modèle d’appoint) l’écrit en Python avec matplotlib, il s’exécute sur cet ordinateur, et ce qui échoue lui est renvoyé pour correction (jusqu’à trois essais) ; cela prend environ une demi-minute et ne coûte que cette réponse. Donnez les chiffres dans votre message ou sous forme de fichier (CSV, TSV ou JSON, jusqu’à 20 Mo), et dites ce qu’il doit montrer (« montre que le printemps a doublé »). Il arrive sous forme de dessin (SVG ; un PNG pour un très grand nombre de points), de 960 par 540 pixels sauf si vous demandez une autre taille, avec son code Python à côté, de sorte que « maintenant avec une échelle logarithmique » modifie ce graphique ; pour une présentation web, il peut aussi arriver sous forme de graphique animé qui réagit au pointeur. Il faut Python avec matplotlib sur l’ordinateur où tourne l’app : celui des outils d’image une fois installés ([Les outils d’image sur cet ordinateur](/guide/library#the-picture-tools-on-this-computer)), ou un autre déjà présent.

Les deux sont enregistrés dans le dossier **images** à l’intérieur du dossier de la session et s’affichent avec la réponse comme les images ; pendant la création, l’espace réservé indique « Création d’un dessin » ou « Tracé du graphique ».

## Trouver des photos libres

Demandez des photos plutôt que des images créées par un modèle (« trouve deux photos des tramways de Lisbonne pour ma diapositive de titre »), et l’agent recherche des photos sous licence ouverte, libres d’utilisation et de modification, y compris pour un usage professionnel : le catalogue d’Openverse (Flickr, Wikimedia Commons, des musées et d’autres), ou la recherche de Wikimedia Commons lui-même quand Openverse ne peut pas répondre. Il enregistre quelques-unes des meilleures (4 sauf indication contraire, 10 au maximum) dans le dossier **images** de la session, avec le crédit de chacune (son titre, son auteur, sa licence et son lien) dans un fichier à côté, les examine avant d’en utiliser une, et les crédite comme l’exige leur licence : dans les notes du présentateur de la diapositive, ou sous l’image dans un document ou une page, et, pour les licences autres que CC0 et le domaine public, dans une petite légende près de la photo (« Photo : “Titre” par Auteur, CC BY 2.0 »). C’est gratuit et cela prend quelques secondes ; pendant la recherche, l’espace réservé indique « Recherche de photos libres ».

## Détourer, effacer et modifier

Les agents peuvent aussi modifier vos images et vos vidéos sans les faire recréer :

- **Retirer l’arrière-plan** d’une image : son sujet (une personne, un produit, un animal, un logo) sur un fond transparent, au format PNG. Sur cet ordinateur, une fois les [outils d’image](/guide/library#the-picture-tools-on-this-computer) installés, c’est gratuit et privé, les pixels du sujet sont conservés et cela prend quelques secondes ; un détourage de mauvaise qualité est refait par un modèle d’image. Sans ces outils, c’est un modèle d’image, via OpenRouter, qui s’en charge (environ 0,01 à 0,04 $), en redessinant l’image sans son arrière-plan, de sorte que de petits détails peuvent différer.
- **Effacer un élément** d’une image (une personne à l’arrière-plan, un panneau, un filigrane, une tache, un câble) : il est retiré et le vide est comblé en prolongeant ce qui l’entoure. L’agent marque l’endroit, ou le décrit pour qu’un modèle d’image le repère. Les petites zones sont effacées gratuitement sur cet ordinateur ; les grandes, celles qui traversent l’image et celles situées parmi des éléments détaillés comme du texte sont confiées à un modèle d’image (environ 0,01 à 0,04 $).
- **Agrandir une image** : deux ou quatre fois plus grande sur chaque côté, avec des détails redessinés nettement plutôt que floutés (une petite photo pour l’impression ou une diapositive, une ancienne image). Gratuit et privé, sur cet ordinateur une fois les [outils d’image](/guide/library#the-picture-tools-on-this-computer) installés (la première fois, il télécharge son modèle, environ 5 Mo) ; une grande image prend une minute ou deux.
- **Modifier une image** : la recadrer, la faire pivoter ou la retourner, la redimensionner, changer sa lumière et ses couleurs (exposition, contraste, chaleur et le reste, ou courbes, niveaux, teinte et saturation d’une couleur, balance des couleurs, clarté, correction de la brume, réduction du bruit, grain, ou tout à la fois avec l’amélioration automatique), lui appliquer un filtre (**Vintage**, **Noir et blanc**…), y écrire du texte, y dessiner des flèches et des cadres, et flouter ou pixelliser certaines parties (un visage, une plaque d’immatriculation, un nom). Gratuit, sur cet ordinateur ; une image JPEG, WebP ou GIF, ou du texte sur l’une d’elles, nécessite ffmpeg ou les outils d’image.
- **Modifier une vidéo** : la couper au début ou à la fin, en retirer des passages, la recadrer à un format (16:9, 9:16, carré, 4:5), la faire pivoter ou la retourner en miroir, l’accélérer ou la ralentir (ou la lire à l’envers, stabilisée), assembler plusieurs clips et images avec des transitions (fondus enchaînés, fondus par le noir, volets, glissements), donner un lent zoom à une image, l’étalonner (exposition, chaleur, contraste, un rendu comme cinéma ou noir et blanc, une vignette, du grain), la faire apparaître et disparaître en fondu, retirer son son ou en changer le volume, choisir les canaux que l’on entend (un micro-cravate d’un seul côté entendu des deux), rendre certains passages silencieux, donner une courbe de volume à la musique, y superposer un logo, un filigrane ou un fond vert, y ajouter du texte (titres, sous-titres, ou sous-titres générés à partir de ce qui est dit, avec un fichier .srt à côté) et placer dessous de la musique et une voix off, avec les voix nettoyées, la musique baissée pendant la parole et le volume sonore uniformisé ; ou en faire un GIF, ou en extraire une image fixe. Gratuit, avec ffmpeg sur cet ordinateur (les outils d’image en apportent un), sur la carte graphique quand il y en a une, tant que **Laisser les agents créer des vidéos** est activé.
- **Modifier un son** (un fichier son, le son d’une vidéo ou un son que vous avez gardé) : conserver une partie, en retirer ou les rendre silencieuses, raccourcir les longues pauses, retirer les mots de remplissage (« euh » : avec la reconnaissance vocale sur cet ordinateur, voir [Reconnaissance vocale sur le serveur](#speech-recognition-on-the-server)), le lire plus vite ou plus lentement en conservant sa hauteur, changer sa hauteur, l’amplifier ou l’atténuer ou ajouter un fondu, régler son pic maximal ou son volume sonore (podcast, streaming, diffusion), réduire le bruit, changer son timbre (une voix plus claire, un téléphone, une radio), le compresser ou le limiter, ajouter de l’écho ou de la réverbération, l’inverser ou le passer en mono, et mixer d’autres sons par-dessus à un endroit précis (de la musique sous une voix, un effet sonore). Gratuit, avec ffmpeg sur cet ordinateur, tant que **Laisser les agents créer de l’audio** est activé.

Chaque opération part d’un fichier du dossier de la session, ou d’une image ou d’une vidéo déjà présente dans une présentation, un document ou une page, et enregistre son résultat dans le dossier **images** de la session (une vidéo modifiée dans **vidéos**, un son modifié dans **audio**), sans jamais écraser l’original. Une image ou un son que vous avez gardé peut aussi être modifié, puis remis à sa place ou à côté comme un nouvel élément, comme le font **Enregistrer** et **Enregistrer une copie** dans les éditeurs (« éclaircis la photo du port que j’ai gardée », « mets mon son “Interview” au volume d’un podcast »). Il s’affiche avec la réponse comme une image créée par l’agent, avec un espace réservé indiquant « Détourage en cours », « Effacement en cours », « Agrandissement en cours », « Modification de l’image en cours », « Modification de la vidéo en cours » ou « Modification du son en cours » pendant le travail. Pour un détourage ou un effacement, la réponse précise la méthode utilisée et pourquoi : si le résultat ne convient pas, dites « fais-le avec l’IA » et l’agent sollicite le modèle d’image. Pour le faire vous-même, ouvrez l’image, la vidéo ou le son dans son éditeur ([Modifier des images et des vidéos](/guide/library#edit-pictures-and-videos), [L’éditeur de son](/guide/library#the-sound-editor)).

## Demander une vidéo

Décrivez la scène, ce qui bouge et comment, la caméra (« un lent travelling avant », « elle suit le cycliste »), le style et la lumière, ainsi que les sons ou les paroles éventuels. L’agent peut aussi :

- **partir d’une image** : un fichier image qui sert de première image à la vidéo (« donne vie à cette photo »), et pour certains modèles une image sur laquelle terminer, pour les modèles portant l’étiquette **À partir d’une image** ;
- **suivre des images** : jusqu’à 4 images d’un personnage, d’un produit ou d’un style que la vidéo doit respecter, sans qu’elles en soient les images de départ ;
- **modifier une vidéo** : un fichier vidéo (MP4, WebM ou MOV, jusqu’à 40 Mo) à modifier, prolonger ou rendre plus net, pour un modèle portant l’étiquette **Modifie des vidéos**.

Une vidéo prend de moins d’une minute à plusieurs minutes. L’agent attend environ neuf minutes au maximum ; si cela dure plus longtemps, l’app continue la génération et l’enregistre quand elle est prête, et l’agent la montre à sa prochaine vérification. Attendre ne coûte rien de plus.

Les vidéos sont enregistrées dans un dossier **vidéos** à l’intérieur du dossier de la session, avec un nom qui reprend ce qu’elles montrent.

Dans la conversation :

- Pendant que le modèle travaille, un espace réservé à la forme de la vidéo indique « Création d’une vidéo » avec le temps écoulé.
- Ensuite, la vidéo s’affiche avec la réponse, prête à être lue (en plein écran aussi, depuis ses commandes), avec la description et le nom du modèle en dessous, et **Garder**. Par-dessus, **Modifier** (l’éditeur vidéo : ce que vous enregistrez est gardé), **Afficher dans les fichiers**, **Télécharger** et **Plus** (⋯ : la même chose que sous une image, avec **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** dans l’app de bureau) apparaissent quand vous la survolez.
- « Création en cours » signifie que l’agent a cessé d’attendre avant que la vidéo soit prête : elle s’affiche quand l’agent vérifie à nouveau (demandez-le-lui, s’il ne le fait pas). « Pas de vidéo cette fois » donne la raison : vous avez fermé le formulaire, ou le modèle a refusé (ses mots expliquent pourquoi).

## Demander une musique, une voix ou un son

Dites à l’agent ce que vous voulez entendre :

- **Musique** : le genre et l’ambiance, les instruments, le tempo, la voix qui chante et le déroulement (« une chanson synth-pop entraînante de 2 minutes sur les lundis matin, avec une femme qui chante et un refrain accrocheur »). Donnez vos propres paroles, ou laissez le modèle les écrire ; demandez un morceau instrumental si vous ne voulez pas de chant. Lyria 3 Clip produit toujours 30 secondes ; Lyria 3 Pro peut aller jusqu’à environ 3 minutes, selon ce que vous demandez. Une chanson prend une minute ou deux.
- **Une voix off** : les mots à dire, exactement, et la façon dont ils doivent sonner (« lis ce texte d’une voix calme et grave, lentement »). Avec un modèle qui a ses propres voix, vous en choisissez une dans le formulaire ; Seed Audio crée la voix que vous décrivez. Une conversation entre plusieurs intervenants fonctionne aussi (« une courte introduction de podcast avec deux animateurs »), avec les modèles qui savent les faire parler.
- **Une voix copiée à partir d’un enregistrement** : donnez à l’agent de 1 à 3 enregistrements de la voix, des fichiers sur cet ordinateur (WAV, MP3, M4A, OGG ou FLAC, jusqu’à 30 Mo chacun ; les 30 premières secondes de chacun sont utilisées), pour un modèle qui **Copie des voix** (Seed Audio). N’utilisez qu’une voix que vous avez le droit d’utiliser : la vôtre, ou celle d’une personne qui a donné son accord. Avec ffmpeg sur l’ordinateur, n’importe lequel de ces fichiers convient ; sans lui, seulement WAV et MP3.
- **Un effet sonore ou une ambiance** : ce que c’est, ce qui se passe et quand (« forte pluie sur un toit de tôle, un orage qui gronde à la fin, sans voix »), et la durée.
- **Un autre modèle** pour un son en particulier, quand vous le nommez (« lis-le avec ElevenLabs v3 »), sans changer les Paramètres.

Les sons sont enregistrés dans un dossier **audio** à l’intérieur du dossier de la session, avec un nom qui reprend ce qu’ils sont, au format MP3 (ou WAV, si vous le demandez).

Dans la conversation :

- Pendant que le modèle travaille, une carte indique « Création d’une musique », « Création d’une voix off » ou « Création d’un son », avec le temps écoulé.
- Ensuite, le son s’affiche avec la réponse, dans un lecteur : le bouton rond lance et met en pause la lecture (un seul son est lu à la fois), sa forme est la barre de progression (cliquez ou faites glisser), puis viennent la durée et la vitesse (**1×**, **1.25×**, **1.5×**, **2×** ou **0.75×**). Quand le lecteur a le focus, Espace ou K lance et met en pause, et ← → avancent ou reculent de 5 secondes. Son titre vient du nom du fichier, avec **Modifier** (l’[éditeur de son](/guide/library#the-sound-editor) : ce que vous enregistrez est gardé), **Afficher dans les fichiers**, **Télécharger** et **Plus** (⋯ : la même chose que sous une image, avec **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** dans l’app de bureau) à côté. En dessous figurent le texte à partir duquel il a été créé, le nom du modèle et **Garder** (voir [Garder ce qu’un agent a créé](#keep-what-an-agent-made)) ; les **Paroles** d’une chanson s’ouvrent juste après.
- Sans clé OpenRouter, vous voyez « L’audio nécessite une clé OpenRouter », avec **Ajouter une clé OpenRouter**. « Pas de son cette fois » donne la raison : vous avez fermé le formulaire, ou le modèle a refusé (ses mots expliquent pourquoi).

L’agent ne peut pas entendre ce qu’il a créé : il connaît le son par ce qu’il a demandé. Si le résultat ne vous convient pas, dites ce qu’il faut changer et il en crée un autre ; ou faites-le modifier (« ajoute un fondu sur les deux dernières secondes du jingle », « place-le sous ma voix off à 0:05 »), par l’agent ou dans l’éditeur de son.

## Des images dans ce que créent les agents

Quand un agent crée ou modifie pour vous des diapositives, un document ou une page, il les illustre de lui-même là où une image apporte quelque chose (une diapositive de titre, une section, une idée ; pas chaque diapositive), aux couleurs et dans le style du contenu, comme le ferait un designer : une image Rapide pour un arrière-plan, une texture ou une icône, une image Meilleur pour une scène, une photo ou un diagramme, un dessin pour une icône, un logo ou un diagramme qui doit rester net, un graphique pour des chiffres, des photos libres de lieux et d’objets réels, et ses images détourées, effacées ou modifiées pour s’y adapter. Il travaille à partir des images déjà présentes dans ce que vous avez ouvert comme à partir de fichiers et, si vous le lui demandez, rédige une description pour chaque image d’une présentation qui n’en a pas, à l’intention des personnes qui ne peuvent pas les voir (le modèle qui décrit les images que vous gardez s’en charge). Ce qui est payant est chiffré dans le formulaire avant d’être créé ([Vérifier les paramètres avant toute création](#check-the-settings-before-anything-is-made)) ; dites « pas d’images », ou « seulement des photos libres », si vous voulez qu’il en soit autrement.

Quand vous demandez un type de contenu connu par son nom (une diapositive SWOT, une présentation de pitch, une lettre de motivation, un résumé exécutif, un suivi d’habitudes, un tableau de tarifs, un budget), l’agent commence par lire comment l’app réalise bien ce type de contenu : ce qu’il contient, dans quel ordre, son aspect et les endroits où les images aident, comme pour les types de la galerie ([Créé avec l’IA à partir d’un type](/guide/library#made-with-ai-from-a-kind)). Cela ne coûte rien.

Dans une [session confidentielle](/guide/sessions#keep-a-session-confidential), rien de tout cela n’est disponible : son agent ne crée, ne cherche et ne modifie ni image ni vidéo.

## Garder ce qu’un agent a créé

**Garder**, sous une image, une vidéo ou un son créé par un agent, en conserve une copie dans les fichiers d’un projet, où un modèle rédige un titre et une description (pour un son, à partir du texte qui a servi à le créer, puisqu’aucun modèle ne peut l’entendre ; le modèle se choisit dans [Paramètres → Capacités → Images, vidéo et audio → Légendes de ce que vous gardez](/settings?s=images&find=Captions%20for%20what%20you%20keep)), et où elle reste après le nettoyage du dossier de la session. Quand vous avez des projets, un court menu demande où la placer (**Le garder dans**) : d’abord le projet de la session, puis vos autres projets, et **Aucun projet**, qui la conserve avec la conversation, où la zone de recherche (Ctrl+K) la retrouve. Le bouton indique alors **Gardée** et l’ouvre. Une image que vous avez gardée apparaît parmi les fichiers de son projet (dans les détails du projet → **Fichiers**, sous forme de vignette avec son image), et dans l’éditeur, **Garder** conserve une image modifiée comme une nouvelle image, tandis que **Enregistrer** la remet là d’où elle vient et **Enregistrer une copie** en conserve une autre à côté.

## Dicter un message

Le microphone de la zone de message (sur la page de démarrage et dans chaque session) transforme ce que vous dites en texte dans votre message. Rien n’est envoyé automatiquement : vous relisez le texte, puis vous l’envoyez comme d’habitude.

1. Cliquez sur le microphone ou touchez-le.
2. Parlez. Un panneau au-dessus de la zone de message affiche la durée, les mots entendus jusqu’ici (ou, quand c’est le serveur qui reconnaît la parole, « Enregistrement… » avec des barres qui suivent votre voix), et la langue écoutée.
3. Cliquez sur **Terminé**, ou de nouveau sur le microphone. Les mots s’ajoutent à ce que vous avez déjà écrit (avec le serveur, « Transformation de votre voix en texte… » s’affiche un instant avant).

La pastille de langue du panneau (« DE », « PT-BR ») permet de changer de langue pendant que vous parlez ; la dictée se poursuit dans la nouvelle langue. Quand c’est le serveur qui reconnaît la parole, un enregistrement s’arrête de lui-même au bout de 10 minutes.

Le microphone n’apparaît que là où la dictée peut fonctionner : quand le navigateur reconnaît lui-même la parole (Chrome, Edge, Safari), ou quand c’est le serveur qui le fait (voir [Reconnaissance vocale sur le serveur](/guide/documents-voice#speech-recognition-on-the-server)). Quand il ne peut pas démarrer, il indique pourquoi et quoi faire :

- **Le microphone nécessite une connexion sécurisée** : les navigateurs ne l’autorisent que sur une adresse HTTPS, ou sur localhost depuis l’ordinateur lui-même. Ouvrez Hydor via une adresse HTTPS (voir [Téléphones, autres machines et partage](/guide/devices)).
- **Le microphone est bloqué pour ce site** : autorisez-le dans les paramètres de site du navigateur (sur un iPhone : **aA** dans la barre d’adresse, puis **Réglages du site web → Microphone**), puis réessayez.
- **Aucun microphone trouvé**, ou **Le microphone est occupé** (une autre app l’utilise).
- **La reconnaissance vocale est désactivée ici** : sur un iPhone, activez la dictée dans Réglages → Général → Clavier ; ou laissez le serveur reconnaître la parole.
- **Ce navigateur ne peut pas enregistrer** : utilisez une version récente de Chrome, Edge, Firefox ou Safari.

Chacune de ces notes comporte un bouton **Paramètres vocaux**, qui ouvre Paramètres → Voix.

## Configurer la voix

Tout ce qui concerne la voix se trouve dans **[Paramètres → Capacités → Voix](/settings?s=voice)** (sur un téléphone : Paramètres, puis **Voix**). Cette section comporte trois parties.

### Dictée

**[Dictée](/settings?s=voice&find=Dictation)** indique d’abord ce que ce navigateur sait faire :

- Un navigateur qui reconnaît lui-même la parole affiche vos mots pendant que vous parlez. Il peut envoyer votre voix à son éditeur pour le faire (Chrome à Google, Safari à Apple). Pour garder votre voix sur votre machine, activez whisper.cpp plus bas et choisissez le serveur.
- Un navigateur qui ne sait pas reconnaître la parole lui-même dicte via le serveur, une fois la reconnaissance vocale sur le serveur activée.

Ensuite :

- **[Langue que vous parlez](/settings?s=voice&find=Language%20you%20speak)** : **Comme ce navigateur**, ou l’une des 56 langues et régions. La dictée l’écoute, et le mode mains libres parle et écoute dans cette langue.
- **Reconnaître avec** : **Ce navigateur** (les mots s’affichent pendant que vous parlez) ou **Le serveur** (privé avec whisper.cpp ; les mots arrivent quand vous vous arrêtez). Cette option n’apparaît que lorsque les deux sont possibles.

La langue et **Reconnaître avec** sont conservées dans ce navigateur : chacun de vos appareils a donc les siennes.

### Reconnaissance vocale sur le serveur

**[Reconnaissance vocale sur le serveur](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** s’adresse aux navigateurs qui ne savent pas reconnaître la parole eux-mêmes, ou à celles et ceux qui veulent garder leur voix sur leur machine. Elle est désactivée tant que vous ne l’activez pas, et rien n’est téléchargé auparavant. Elle se règle une fois pour toute l’app, sur tous les appareils. Sous **Où elle s’exécute**, choisissez l’une des trois options :

- **Désactivé**.
- **Sur cette machine** : whisper.cpp s’exécute sur l’ordinateur qui fait tourner Hydor, sur son GPU quand il en a un que whisper.cpp peut utiliser (celui d’un Mac, ou un GPU NVIDIA), sinon sur son processeur, et votre voix y reste.
  - **Modèle** : **Minuscule** (74 Mo ; le plus rapide, il comprend de travers un mot de temps en temps), **Base** (141 Mo ; rapide et suffisant pour la plupart des dictées, c’est le choix par défaut), **Petit** (465 Mo ; comprend mieux, quelques secondes par phrase sur un processeur) ou **Moyen** (1,4 Go ; comprend le mieux, lent sans processeur rapide).
  - **Langues** : **Toutes les langues** (il suit la langue que vous parlez) ou **Anglais uniquement** (un peu plus précis en anglais).
  - **Activer · télécharger …** indique la quantité à télécharger : le modèle, et whisper.cpp lui-même la première fois (quand tout est déjà là, choisir **Sur cette machine** l’active aussitôt). Une barre montre le téléchargement ; **Annuler** l’interrompt et désactive la reconnaissance vocale sur le serveur. Sous Linux, l’app télécharge un whisper.cpp prêt à l’emploi, qui s’exécute sur le processeur ; sur un Mac, et là où la version prête à l’emploi ne fonctionne pas, elle compile whisper.cpp sur cet ordinateur, ce qui demande un compilateur C++ et CMake (sous Debian ou Ubuntu : `sudo apt install build-essential cmake` ; sur un Mac : `xcode-select --install`, puis `brew install cmake`). Sur un Mac, il est compilé pour le GPU du Mac (Metal). Un whisper.cpp que vous avez installé vous-même sur l’ordinateur (compilé pour votre GPU, par exemple) est utilisé tel quel.
  - **Un GPU NVIDIA** sous Linux : whisper.cpp n’a pas de version prête à l’emploi pour lui ; une fois que la dictée fonctionne sur le processeur, l’app en compile donc une pour le GPU en arrière-plan, avec le kit CUDA de NVIDIA (`nvcc`). Une barre montre l’avancement (comptez de 5 à 20 minutes) ; entre-temps, la dictée fonctionne sur le processeur, puis sur le GPU ensuite. Sans le kit, une note le signale, avec **Vérifier à nouveau** pour quand vous l’aurez installé ; si la compilation échoue, la raison s’affiche avec **Réessayer**, et la dictée reste sur le processeur.
  - Quand tout est prêt : « Prêt : whisper.cpp … avec le modèle Base. Votre voix reste ici. », et en dessous ce sur quoi il s’exécute, tel que whisper.cpp l’a indiqué la dernière fois (il essaie une seconde de silence dès qu’il est prêt) : « Il s’exécute sur le GPU : Apple M2 Pro (Metal). » ou « Il s’exécute sur le processeur de cette machine. » Si le GPU échoue (mémoire saturée, par exemple), cet enregistrement est traité par le processeur, la note en donne la raison, et le GPU est réessayé quelques minutes plus tard. **Tester** vérifie qu’il répond et à quelle vitesse. Si quelque chose a échoué, la raison s’affiche avec **Réessayer**.
  - Choisir un autre modèle pendant qu’elle est activée télécharge ce modèle.
- **Un service** : tout service doté de l’adresse de reconnaissance vocale d’OpenAI (`/audio/transcriptions`) : OpenAI lui-même, ou un serveur de votre réseau (Speaches, LocalAI, le serveur de whisper.cpp, un serveur doté d’un GPU). Les enregistrements lui sont envoyés.
  - **Configuration** (puis **Modifier**) sur la ligne du service ouvre un formulaire : **Adresse** (comme `https://api.openai.com/v1`), **Clé d’API** (la plupart des serveurs de votre réseau n’en demandent aucune) et **Modèle** (`whisper-1` si vous n’en indiquez pas d’autre).
  - **Enregistrer et activer** (puis **Enregistrer**) ; **Tester** sur sa ligne une fois qu’il est activé ; et **Retirer la clé** dans son menu **⋯** une fois qu’une clé est enregistrée. Une fois un service enregistré, choisir de nouveau **Un service** bascule aussitôt vers lui.

Un groupe, **Sur cette machine**, avec sa taille totale, liste ce que whisper.cpp a laissé sur cet ordinateur : whisper.cpp lui-même (« compilé ici pour Metal » ou « pour CUDA » quand l’app l’a compilé pour un GPU) et chaque modèle avec sa taille, celui utilisé étant marqué « utilisé ». Le menu **⋯** d’un modèle propose **Retirer** (retirer celui qui est utilisé désactive la reconnaissance vocale sur le serveur, après confirmation). **Tout retirer**, dans le menu **⋯** du groupe lui-même, retire whisper.cpp et ses modèles ; il s’affiche quand la reconnaissance vocale sur le serveur est désactivée ou utilise un service.

### Lecture à voix haute

**[Lecture à voix haute](/settings?s=voice&find=Read%20aloud)** : le haut-parleur d’une réponse vous la lit, sans son code. Chaque navigateur garde sa propre voix et sa propre vitesse (le (i) du groupe le précise).

- **Voix** : **Automatique** (la voix du navigateur pour la langue que vous parlez), ou n’importe quelle voix de ce navigateur, celles de votre langue en premier. Chacune indique sa langue, et « en ligne » quand elle a besoin d’internet.
- **Vitesse** : de 0,5× à 2×.
- **Essayer** : **Écouter un échantillon** lit une phrase avec cette voix et cette vitesse.

Si le navigateur ne peut pas lire du texte à voix haute, la section l’indique.

## Faire lire une réponse à voix haute

1. Pointez une réponse : un haut-parleur apparaît en haut à droite, à côté du bouton de copie.
2. Cliquez dessus. Une barre au-dessus de la zone de message affiche **Lecture à voix haute**, la partie en cours sur combien, et les premiers mots de la réponse.
3. Mettez en pause et reprenez depuis la barre, ou arrêtez la lecture là ou avec le haut-parleur.

La réponse est lue comme de simples mots : le code est omis, les liens sont lus par leurs mots, les adresses web par leur site, et les tableaux ligne par ligne. Lancer la lecture d’une autre réponse arrête la première, et quitter la conversation l’arrête. Le haut-parleur s’affiche quand vous pointez avec une souris ; sur un téléphone, le mode mains libres vous lit les réponses (« Lis-moi la réponse »).

## Parler à l’app en mains libres

Le mode mains libres sert quand vous ne pouvez pas regarder l’écran, par exemple en marchant : vous parlez, l’app agit et dit ce qu’elle a fait, puis elle écoute de nouveau. Elle démarre des sessions, leur transmet vos paroles, dit où elles en sont, répond à leurs demandes d’approbation et vous lit leurs résultats.

### Le démarrer et y mettre fin

- Dans une session, le bouton en forme de casque dans la zone de message (**Mains libres**, à côté du microphone) l’ouvre, en suivant cette session.
- Sur la page de démarrage, le même bouton l’ouvre sans suivre de session en particulier.
- Dans la zone de recherche (Ctrl+K, ⌘K sur un Mac), l’action **Parler en mains libres** l’ouvre aussi.

Il occupe tout l’écran, dit « Je vous écoute », et demande à l’appareil de garder l’écran allumé tant qu’il est ouvert. En haut, vous voyez la session qu’il suit (ou « Parler à Hydor »). Le grand bouton rond indique ce qu’il fait : **Écoute…**, **Travail en cours…**, **Parole** ou **En pause : touchez pour écouter**. En dessous, vous voyez ce qu’il a entendu, entre guillemets, et sa réponse.

- Touchez le bouton rond pendant qu’il parle pour l’interrompre ; touchez-le à d’autres moments pour mettre en pause ou continuer à écouter.
- Pour y mettre fin, dites « Au revoir » (ou « Salut », « C’est tout », « Arrête d’écouter », « Fin des mains libres », « Quitter »), ou touchez la croix en haut à droite.

### Ce que vous pouvez dire

- **Démarrer une session** : « Démarre une session pour planifier mon week-end en Crète ». Elle démarre comme depuis la page de démarrage : avec le programme, le modèle, l’effort, les autorisations, l’agent et le projet que vous y avez choisis en dernier, dans un nouveau dossier de tâche (ou dans le dossier que vous y avez choisi en dernier). Dès lors, il suit cette session.
- **Dire quelque chose à une session** : « Dis-lui d’utiliser les unités métriques ». Vos paroles sont transmises à la session qu’il suit, comme votre message.
- **Demander où en sont les choses** : « Où en sont mes sessions ? ». Il dit ce qui est en cours, ce qui a besoin de vous et ce qui est demandé, et ce qui s’est terminé récemment.
- **Écouter le résultat** : « Lis-moi la réponse ». Il lit la dernière réponse de la session qu’il suit (ou, s’il n’en suit aucune, de la plus active ou de la plus récente). Une longue réponse vient sous forme de résumé, en trois à cinq phrases ; quand l’app est affichée dans une autre langue que l’anglais, chaque réponse vient sous forme de résumé dans cette langue.
- **Répondre à une demande d’approbation** : « Approuve » ou « Refuse », quand la session qu’il suit (ou, s’il n’en suit aucune, n’importe quelle session) attend un simple oui ou non. Une question, un plan ou un formulaire doivent être traités à l’écran, et il vous le dit.
- **Arrêter le travail** : « Stop » arrête ce que fait la session qu’il suit (cela ne met pas fin au mode mains libres).
- **Basculer** : nommez une autre session (« Parlons du voyage en Crète ») et il suit celle-là.
- Posez une question sur l’app, ou sur n’importe quoi d’autre : il répond brièvement, ou vous interroge en retour quand il n’est pas sûr.

### Ce qu’il vous dit de lui-même

- Quand la session qu’il suit se termine : « … est terminée. Dites “lis-la” pour entendre la réponse. »
- Quand une session a besoin de vous : « … a besoin de vous : … », puis « Dites approuve ou refuse » pour un simple oui ou non, ou « Répondez à l’écran ». Il suit alors cette session, de sorte que « Approuve » y répond.
- Quand une session s’arrête sur une erreur : « … s’est arrêtée sur une erreur. »

Il cesse d’écouter pour dire ces messages, puis écoute de nouveau. Les sessions de vos autres machines ne sont pas annoncées.

### Bon à savoir

- Le modèle d’appoint comprend ce que vous dites ([Paramètres → Agents → Modèles → Modèle d’appoint](/settings?s=models&find=Helper%20model)). S’il est injoignable, les mots simples fonctionnent encore : « état », « approuve » ou « oui », « refuse » ou « non », « stop », « lis », « démarre … » ; tout le reste est transmis à la session qu’il suit, ou démarre une nouvelle session quand il n’en suit aucune.
- Il répond dans la langue d’affichage de l’app (Paramètres → Général → Langue), et écoute dans la langue que vous parlez (Paramètres → Voix), sinon dans celle de l’app.
- Il parle avec la voix et la vitesse définies dans [Lecture à voix haute](/guide/documents-voice#read-aloud).
- Il lui faut un navigateur capable de lire à voix haute, et un moyen d’écouter : la reconnaissance vocale du navigateur lui-même (Chrome, Edge, Safari), ou la reconnaissance vocale sur le serveur. Le casque n’apparaît que là où le mode peut fonctionner. Avec le serveur, chaque phrase se termine après une seconde et demie de silence (une demi-minute au maximum), et il se remet à écouter après 15 secondes de silence.
- Si le microphone n’est pas autorisé ou n’existe pas, il le dit une fois et se met en pause : autorisez-le dans le navigateur, puis touchez pour écouter.

## Demander à un agent

- « Remplis le formulaire ~/Downloads/visa-application.pdf avec mes informations de profil, et demande-moi le reste. »
- « Écris la date du jour et mon nom sur les lignes de ~/Documents/permission-slip.pdf, et coche Oui. »
- « Extrais les pages 3 à 5 de ~/Documents/contract.pdf dans un fichier à part. »
- « Active la reconnaissance vocale sur cet ordinateur, avec le modèle Small. »
- « Utilise mon serveur de reconnaissance vocale à l’adresse http://192.168.1.20:8000/v1 pour la dictée, avec le modèle whisper-large-v3. »
- « Quels modèles whisper sont installés sur cet ordinateur, et quelle place prennent-ils ? Retire ceux qui ne servent pas. »
- « La dictée fonctionne-t-elle sur mon GPU ? Si ce n’est pas le cas, pourquoi ? »
- « Quels modèles d’image les agents utilisent-ils actuellement pour la plupart des images et pour les images simples, et combien coûte environ une image avec chacun ? »
- « Remplace le modèle d’image utilisé pour la plupart des images par le moins cher de ceux qui savent modifier des images. »
- « Utilise Recraft V4.1 Flash pour les images simples. »
- « Installe les outils d’image sur cet ordinateur. »
- « Les outils d’image fonctionnent-ils sur la carte graphique de cet ordinateur ? Si l’un d’eux tourne sur le processeur, pourquoi ? »
- « Crée une icône plate de vélo en #0f766e et #f59e0b, sous forme de dessin qui reste net à toutes les tailles. »
- « Trace ~/data/sales.csv en barres mensuelles, 2025 contre 2026, et indique le bond du printemps. »
- « Trouve trois photos libres de droits des tramways de Lisbonne pour mes diapositives de voyage, avec leurs crédits. »
- « Supprime l’arrière-plan de ~/Pictures/mug.jpg. »
- « Efface l’homme à gauche sur beach.jpg ; si le résultat paraît baveux, fais-le faire par un modèle d’image. »
- « Recadre ~/Pictures/team.jpg en 16:9, éclaircis-la un peu et floute les visages à l’arrière-plan. »
- « Coupe demo.mp4 pour ne garder que la partie de 0:12 à 0:40, ajoute « Notre nouvelle app » au début, et fais-en aussi un GIF. »
- « Retire les euh et les longues pauses de interview.m4a, réduis son souffle de fond et mets-le au même volume qu’un podcast. »
- « Empêche les agents de créer des images. »
- « Quels modèles vidéo produisent du son, et combien coûte une seconde avec chacun ? »
- « Fais utiliser Kling aux agents pour les vidéos. »
- « Empêche les agents de créer des vidéos. »
- « Quel modèle de musique les agents utilisent-ils, et combien coûte une chanson ? »
- « Utilise ElevenLabs v3 pour les voix off, avec la voix George. »
- « Empêche les agents de créer de l’audio. »
