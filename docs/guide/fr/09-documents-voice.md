# Documents, images, vidéos et voix

Dans Hydor, les agents lisent les PDF, les fichiers Word, Excel, PowerPoint et d’autres documents, en créent de nouveaux pour vous et vous les remettent sous forme de cartes que vous ouvrez ou téléchargez. Ils peuvent aussi créer des images, des dessins, des graphiques et de courtes vidéos, trouver des photos libres de droits, modifier vos images et vos vidéos (recadrer, détourer, effacer, couper), et composer des chansons, des voix off et des sons, avec des modèles d’image, de vidéo et d’audio et des outils présents sur cet ordinateur. Vous pouvez conserver ce qu’ils produisent dans les fichiers d’un projet. Vous pouvez aussi parler au lieu de taper, faire lire les réponses à voix haute, ou parler à l’app en mains libres pendant que vous marchez.

![Un agent qui a lu un rapport et en a fait un résumé Word d’une page ainsi qu’une feuille de calcul avec un graphique](images/documents-voice.webp)

## Donner un document à lire à un agent

Tous les agents que l’app exécute savent lire des documents : Claude Code, Codex, Custom, et les agents qui parlent ACP et acceptent les serveurs MCP. Inutile de rien convertir au préalable. Donnez-lui le document de l’une de ces façons :

1. **Le joindre à votre message** : le trombone (**Joindre des fichiers**) dans la zone de message, ou bien glissez le fichier sur la zone, ou collez-le. Les images sont transmises au modèle comme des images ; tout autre fichier est enregistré sur l’ordinateur qui exécute Hydor, et son chemin est ajouté à votre message pour que l’agent puisse l’ouvrir. Un message peut contenir jusqu’à 25 Mo de fichiers.
2. **Nommer un fichier de cet ordinateur** : « Résume ~/Documents/bail.pdf ». Un chemin qui ne commence pas par `/` ou `~` part du dossier de la session.
3. **Garder les documents dans un projet ou dans les connaissances partagées**, pour que les sessions puissent y chercher et citer la page : voir [Projets et connaissances](/guide/projects).

Pendant que l’agent lit, son travail affiche **Lecture de lease.pdf**, puis **Lu lease.pdf**. Sur un écran plus large, la ligne indique aussi ce qu’est le document (son type, ses pages, feuilles ou diapositives) et quelles lignes ont été lues. Cliquez sur la ligne pour voir le texte reçu par l’agent, et sur **Ouvrir lease.pdf** pour voir le fichier lui-même.

Un long document est lu par morceaux, environ 1 200 lignes à la fois, et l’agent est prévenu quand il y a une suite. Les agents ont pour consigne de traiter le contenu d’un document comme de l’information, non comme des instructions. Rien dans un document ne s’exécute : les macros ne s’exécutent jamais, et seuls les liens web et de messagerie sont conservés.

Custom lit aussi les PDF, les documents Office et les images avec sa lecture de fichiers ordinaire : voir [Custom, l’agent propre à l’app](/guide/custom).

## Ce que les agents peuvent lire dans un document

### PDF

- Le texte de chaque page, mis en forme comme sur la page.
- Cela fonctionne mieux avec le programme pdftotext (dans poppler-utils). Sans lui, l’app télécharge pdf.js une seule fois (environ 35 Mo, ce qui demande Internet cette première fois), et la mise en forme n’est qu’approximative.
- Les pages numérisées n’ont pas de texte, et l’agent est prévenu lesquelles (« Les pages 3, 5–7 n’ont pas de texte »). Avec la compétence **pdf**, il regarde alors ces pages comme des images et les lit lui-même, ou leur applique la reconnaissance de texte (OCR) si tesseract est installé.
- Un PDF verrouillé par un mot de passe ne peut pas être lu. Donnez le mot de passe à l’agent, et la compétence **pdf** en fait une copie déverrouillée. Un PDF qui s’ouvre sans mot de passe mais limite les modifications (beaucoup de formulaires officiels) est lu comme n’importe quel autre.
- **Formulaires** : l’agent liste les champs de formulaire d’un PDF, chacun avec les mots imprimés à côté (qui indiquent à quoi sert un champ nommé « f1_02 »), et regarde ses pages comme des images avec les champs numérotés et une règle en points.
- **Vos surlignages et vos notes** : ce que vous avez surligné dans le lecteur de Fichiers, page par page, avec vos notes et des images des figures et des équations que vous avez choisies ([Lire et surligner un PDF](/guide/files-git#read-and-highlight-a-pdf)), pour les résumer ou les comparer à l’article. Si vous le lui demandez, il surligne aussi des mots pour vous, et ils apparaissent ensuite dans le lecteur.

### Word, Excel et PowerPoint

- **Word** (.docx, ainsi que ses variantes avec macros et modèles) : titres, paragraphes, listes numérotées et à puces, tableaux, liens, zones de texte, images par leur description, notes de bas de page, notes de fin et commentaires.
- **Excel** (.xlsx, ainsi que ses variantes avec macros et modèles) : chaque feuille sous forme de tableau avec ses numéros de ligne et ses lettres de colonne, les nombres à peu près tels qu’ils sont mis en forme (dates, pourcentages, montants), et jusqu’à 40 formules par feuille. Les feuilles masquées sont signalées. Chaque feuille fournit ses 2 000 premières lignes et ses 60 premières colonnes, et l’agent est prévenu quand il y en a davantage ; pour lire en entier une feuille plus grande, la compétence **spreadsheets** la charge autrement.
- **PowerPoint** (.pptx, ainsi que ses variantes avec macros, modèles et diaporamas) : le titre de chaque diapositive, son texte, ses tableaux, ses images (par leur description), ses graphiques (titre et séries) et les notes de l’orateur. Les diapositives masquées sont signalées. Jusqu’à 1 000 diapositives.

### OpenDocument, EPUB, CSV et RTF

- **OpenDocument** (les formats propres à LibreOffice .odt, .ods et .odp, leurs modèles, et .odg) : du texte avec titres, listes, tableaux, liens et notes de bas de page ; des feuilles telles qu’elles s’affichent ; des diapositives avec leurs titres, leur texte et leurs notes.
- Les livres **EPUB** : les chapitres dans l’ordre de lecture, avec titres, listes, tableaux et citations.
- Les tableaux **CSV** et **TSV**, et le texte **RTF**.

### Anciens fichiers Office, fichiers verrouillés et très gros fichiers

- Les anciens fichiers .doc, .xls et .ppt sont lus par LibreOffice, qui les convertit d’abord au format actuel. Sans LibreOffice, ils ne peuvent pas être lus, et l’agent est invité à vous demander le fichier enregistré en .docx, .xlsx ou .pptx, ou à faire installer LibreOffice.
- Les fichiers Word, Excel et PowerPoint verrouillés par un mot de passe ne peuvent pas être lus.
- Les fichiers jusqu’à 300 Mo sont lus. Un document fournit jusqu’à environ 1 000 000 de caractères de texte (environ 250 000 tokens) ; au-delà, il est tronqué, et l’agent en est prévenu.

## Demander à un agent de créer un document

L’app est livrée avec quatre compétences de documents que tous les agents peuvent charger : **word-documents**, **spreadsheets**, **presentations** et **pdf**. Vous les trouvez dans [Paramètres → Compétences](/settings?s=skills&find=Built%20in), sous **Documents** (voir [Compétences](/guide/skills)). Vous n’avez pas à les choisir : demandez simplement, avec vos mots (« Fais un CV d’une page à partir de mes notes, dans un document Word », « Mets ces dépenses dans une feuille de calcul avec des totaux mensuels et un graphique », « Fais 8 diapositives pour mon exposé sur les abeilles », « Fusionne ces trois PDF »), et l’agent charge la bonne compétence quand la tâche l’exige.

Chaque compétence fonctionne de la même façon :

1. L’agent commence par planifier le document : son plan, ses feuilles ou ses diapositives.
2. Il écrit le fichier avec un court script dans le dossier de la session.
3. Il examine le résultat sous forme d’images de pages, vérifie qu’aucun texte ne déborde de la page, que les tableaux tiennent et que les diapositives ne sont pas surchargées, puis corrige ce qui ne va pas.
4. Il remet le fichier sous forme de carte sous sa réponse, avec une courte légende (voir [Ouvrir ou télécharger les fichiers créés par un agent](/guide/documents-voice#open-or-download-the-files-an-agent-made)).

Quand il modifie un de vos fichiers, il enregistre le résultat sous un nouveau nom, sauf si vous lui avez demandé d’écraser le vôtre.

### Documents Word

Rapports, lettres, CV, notes de service, contrats, formulaires, supports distribués et notes, à ouvrir dans Word, Google Docs ou Pages.

- Une vraie structure : titres (qui fonctionnent dans le volet de navigation de Word et avec les lecteurs d’écran), listes à puces et numérotées, tableaux avec une ligne d’en-tête, images et sauts de page.
- Une table des matières (Word la remplit à l’ouverture du fichier), des numéros de page (« Page 1 sur 3 »), des liens et des cellules de tableau ombrées.
- A4 ou US Letter, et des polices qui s’affichent de la même façon sur tous les ordinateurs (Calibri, Arial, Cambria, Times New Roman).
- Vos propres documents modifiés sur place, en conservant leurs styles, leurs en-têtes et leur mise en page ; du texte remplacé sans perdre sa mise en forme ; des commentaires ajoutés.
- Signés avec votre signature enregistrée : à la place de {{signature}}, juste après des mots comme « Signature : », dans une cellule de tableau ou à la fin, une fois que vous l’avez autorisé sur une carte ([Signatures](/guide/library#signatures)).
- Un PDF du document aussi, via LibreOffice.

### Feuilles de calcul

Budgets, suivis, plannings, factures et tableaux de données (.xlsx).

- Vos nombres comme valeurs et les résultats comme formules, pour que vous puissiez changer un nombre et voir le reste suivre.
- Des formats de nombre pour les montants, les pourcentages et les dates ; une ligne d’en-tête en gras qui reste visible ; des largeurs de colonne ; des filtres sur les listes.
- Des graphiques en barres, en courbes et en secteurs à côté des données.
- Une vérification de chaque formule. Avec LibreOffice installé, la vérification calcule les formules et liste les erreurs éventuelles (#REF!, #DIV/0!, #NAME?), que l’agent corrige ensuite.
- Vos propres classeurs modifiés, en conservant leurs formules, leurs styles et l’essentiel de leur mise en page (les tableaux croisés dynamiques ne sont pas conservés, et les graphiques seulement quand l’agent les reconstruit). Un fichier CSV à la place, quand vous en demandez un.

### Présentations

Présentations pour convaincre, exposés, cours et synthèses (.pptx), à montrer dans PowerPoint, Keynote ou Google Slides.

- Des diapositives 16:9 soignées, avec un même style partout et la couleur de votre marque : une diapositive de titre, des puces à plusieurs niveaux, deux colonnes, des images ajustées à la diapositive, des tableaux, des graphiques (colonnes, barres, courbes, secteurs, empilés), des diapositives de section, et des notes de l’orateur pour ce que vous direz.
- Une idée par diapositive, avec des titres qui énoncent le message (« Les ventes ont progressé de 12 % »), en général de 6 à 12 diapositives pour un exposé.
- Des images venant de vous, du web, ou créées avec un modèle d’image (voir [Laisser les agents créer des images](/guide/documents-voice#let-agents-make-images)).
- Une nouvelle présentation sur votre propre modèle, ou votre présentation modifiée, en conservant son thème et ses mises en page.
- Un PDF des diapositives, via LibreOffice.

### PDF

Rapports, factures, attestations, flyers, lettres et formulaires.

- Surtout du texte, ou quelque chose que vous voudrez modifier : l’agent crée un document Word, puis un PDF à partir de celui-ci avec LibreOffice.
- Une mise en page exacte (factures, attestations, billets, formulaires) : il dessine directement le PDF.
- Des diapositives ou une feuille en PDF : créées avec leur compétence, puis converties en PDF.
- **Remplir un formulaire** : ses champs par leur nom (texte, cases cochées, choix, en grec, en chinois ou dans n’importe quelle écriture), de sorte que tout lecteur les affiche et qu’ils restent modifiables ; ou, pour un formulaire qui n’est fait que de lignes et de cases imprimées, les mots écrits sur la page à côté des mots imprimés (« Date de naissance : ») et des coches dans ses cases ; sur un formulaire numérisé, qui n’a pas de mots à repérer, là où l’agent voit les blancs sur une image de la page. L’agent vous demande ce qu’il ne sait pas, et regarde les pages avant et après. Un formulaire signé numériquement reste valide quand seuls ses champs sont remplis. Les formulaires XFA (Adobe LiveCycle) ne se remplissent que dans les apps d’Adobe : l’agent le signale, et peut quand même écrire sur leurs pages.
- **Écrire sur les pages** : des mots, des coches et des croix, des images, des cadres blancs par-dessus ce qui s’y trouve (ils ne cachent les mots qu’à l’œil : les mots restent dans le fichier, ce n’est donc pas une suppression de contenu), des contours et des lignes, ainsi que des surlignages et des commentaires propres au PDF, que les autres lecteurs listent et peuvent retirer.
- **Modifier les pages** : les faire pivoter, les supprimer, les déplacer, insérer des pages vierges, fusionner des PDF, extraire certaines pages dans un fichier à part ou découper un PDF en plusieurs. Un fichier modifié de cette façon ne peut pas conserver de signature numérique, et l’agent le signale.
- Ce que l’agent écrit va dans une copie à côté du fichier (« nom (rempli).pdf »), sauf si vous demandez de modifier le fichier lui-même ; son ancienne version va alors dans la Corbeille. Vous pouvez aussi remplir et signer un PDF vous-même : [Remplir et signer un PDF](/guide/files-git#fill-in-and-sign-a-pdf).
- De grands mots en filigrane, comme BROUILLON, sur chaque page, et une copie sans son mot de passe (vous donnez le mot de passe), avec la compétence **pdf**.
- Signé avec votre signature enregistrée, à côté de mots sur une page ou à un endroit qu’il vous montre d’abord, une fois que vous l’avez autorisé sur une carte ; ajoutée au PDF sans modifier ce qu’il contenait ([Signatures](/guide/library#signatures)).
- Des fichiers Office convertis en PDF.

### Ce dont l’ordinateur a besoin

Ces éléments concernent l’ordinateur qui exécute Hydor, et non l’appareil depuis lequel vous l’utilisez.

- **Python 3**, avec son module venv : nécessaire pour créer des documents. La première fois, les compétences installent quelques bibliothèques Python pour les fichiers Office et les PDF dans un dossier privé de l’app (environ 30 Mo, une seule fois, depuis Internet) ; rien n’est installé sur l’ensemble du système. Si Python est absent, l’agent vous indique la commande à exécuter (sous Debian ou Ubuntu `sudo apt install python3 python3-venv` ; sur un Mac `brew install python`).
- **LibreOffice** (facultatif) : aperçus sous forme de pages mises en page dans la visionneuse de fichiers, lecture des anciens fichiers .doc, .xls et .ppt, agents qui regardent les documents Office comme des pages, vérification des formules, et PDF à partir de fichiers Office. Sous Debian ou Ubuntu : `sudo apt install libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui` ; sur un Mac : `brew install --cask libreoffice`.
- **poppler-utils** (facultatif) : la meilleure lecture des PDF, et les images de pages de PDF pour les agents et pour **Remplir et signer**. Sans lui, l’app les dessine avec ce que l’ordinateur propose (la façon native de dessiner les PDF sur Mac ou Windows), ou avec le navigateur de **Paramètres → Navigateur**. Sous Debian ou Ubuntu : `sudo apt install poppler-utils` ; sur un Mac : `brew install poppler`.
- **tesseract** (facultatif) : OCR pour les PDF numérisés.

Sans LibreOffice ni poppler-utils, les agents relisent leurs fichiers sous forme de texte pour les vérifier, et gardent une mise en page simple.

## Ouvrir ou télécharger les fichiers créés par un agent

Quand un agent a créé des fichiers pour vous (un document, une feuille de calcul, des diapositives, un PDF, des images, une archive), il vous les remet sous forme de cartes sous sa réponse, jusqu’à 12 à la fois. Chaque carte comporte :

- une icône selon le type, dans sa couleur (Word en bleu, Excel en vert, PowerPoint en orange, PDF en rouge), ou une miniature pour une image ;
- le nom du fichier, sa nature et sa taille (« Document Word · 24 Ko ») ;
- la légende de l’agent (« Le budget, une feuille par trimestre ») ;
- **Ouvrir**, un bouton de téléchargement et **Plus** (⋯).

**Ouvrir** affiche le fichier dans la visionneuse de fichiers, dans une fenêtre au-dessus de la conversation, qui reste là où elle était (sur un téléphone, la fenêtre monte depuis le bas de l’écran). **Ouvrir dans Fichiers**, en haut de la fenêtre, envoie le fichier vers la page Fichiers ; la croix, ou Échap, ferme la fenêtre. Au-dessus du fichier s’affiche son chemin, comme sur la page Fichiers ([Ouvrir et modifier un fichier](/guide/files-git#open-and-edit-a-file)) ; un dossier de ce chemin s’ouvre dans la même fenêtre, avec le fichier sélectionné (elle demande d’abord ce qu’il faut faire des modifications non enregistrées), et **‹** en haut de la fenêtre ramène au fichier. Le bouton de téléchargement enregistre le fichier sur votre appareil.

**Plus** (⋯), sur une carte et en haut de la fenêtre, propose **Démarrer une session avec ce fichier** (la page de démarrage, avec le fichier dans sa zone de message), **Ajouter à un projet** (le copie dans le dossier d’un projet), **Garder une copie** (pour un notebook Jupyter, une présentation PowerPoint, un document Word ou Markdown, une feuille de calcul ou un fichier LaTeX : une copie conservée comme un document à part entière, dans son propre éditeur, dans les fichiers du projet que vous choisissez si vous avez des projets, sinon celui de la session), **Afficher dans Fichiers** (sur une carte), **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** (dans l’app de bureau ; voir [Travailler avec des fichiers et des dossiers](/guide/files-git#work-with-files-and-folders)) et **Copier le chemin**. Voir [Démarrer une session avec des fichiers](/guide/files-git#start-a-session-with-files) et [Ajouter des fichiers à un projet](/guide/files-git#add-files-to-a-project).

Un fichier supprimé ou déplacé depuis s’affiche comme **Introuvable**. Si un agent désigne un fichier qui n’existe pas, vous voyez « Impossible d’afficher les fichiers » avec la raison, et l’agent est invité à corriger.

### Les documents qu’il a créés ou modifiés, et les noms de fichiers dans sa réponse

Sous la réponse d’un agent, les documents qu’il a créés ou modifiés pendant ce tour s’affichent toujours sous forme de cartes, qu’il vous les ait remis ou non : fichiers PDF, Word, Excel, PowerPoint et OpenDocument, tableaux CSV et TSV, LaTeX, notebooks Jupyter, EPUB et Markdown. Ce sont ceux que ses modifications ont écrits, et ceux que ses commandes ont créés dans le dossier de la session pendant le tour (ceux que le tour nomme, ou qui se trouvent à côté d’un fichier qu’il a modifié : les autres sessions qui travaillent dans le même dossier n’ajoutent pas les leurs).

- Chaque carte indique **Nouveau** ou **Mise à jour**, avec son type et sa taille, et comporte **Ouvrir**, un bouton de téléchargement et **⋯**, comme les cartes ci-dessus.
- Les documents finis (un PDF, un fichier Word…) passent avant leurs sources (LaTeX, Markdown, tableaux). Les quatre premiers s’affichent ; **Afficher N documents de plus** montre le reste et **En afficher moins** les replie.
- Un fichier que l’agent a remis garde sa propre carte et sa légende, et n’est pas affiché deux fois. Un fichier qui n’existe plus est omis. Les images, le code et les fichiers de données ne sont pas affichés de cette façon (un agent remet toujours les images).

Les noms de fichiers et les chemins dans une réponse sont des liens. Un nom ou un chemin en code (`report.tex`, `docs/report.pdf`, `src/app.ts:42`, qui s’ouvre à cette ligne), un chemin absolu ou en `~/` dans le texte, et un lien vers un fichier ouvrent tous le fichier dans la fenêtre au-dessus de la conversation, comme le fait **Ouvrir** sur une carte. Un nom seul ouvre le fichier de la conversation portant ce nom ; un chemin qui ne part pas de la racine est relatif au dossier de la session.

## Afficher un aperçu d’un document dans la visionneuse de fichiers

La visionneuse de fichiers affiche les documents depuis une carte, depuis la page Fichiers ou depuis un lien dans une réponse (voir [Système : fichiers, Git, Terminal et Aperçu](/guide/files-git)).

- Les **PDF** s’affichent tels quels, dans la visionneuse PDF du navigateur, avec **Remplir et signer** pour les remplir et les signer ([Remplir et signer un PDF](/guide/files-git#fill-in-and-sign-a-pdf)).
- Les fichiers **PowerPoint** (.pptx, ainsi que ses variantes avec macros, diaporama et modèle) s’ouvrent sur **Diapositives** : « Ses diapositives, telles que l’app les dessine ». Chaque diapositive s’affiche telle qu’elle est, comme une présentation conservée (images, formes, tableaux, graphiques, arrière-plan et pied de page en place), les unes sous les autres avec leur numéro et leurs notes de l’orateur, y compris sur un téléphone. Une police utilisée par la présentation mais absente de cet ordinateur est remplacée par une autre ; quand celle-ci demande plus de place, le texte d’une zone est un peu réduit pour tenir, de sorte que rien ne soit coupé. **Texte** (« Ses mots et les notes de l’orateur ») affiche le texte des diapositives, et **Pages** les affiche mises en page par LibreOffice s’il est installé. Si les diapositives ne peuvent pas être dessinées, la visionneuse s’ouvre sur **Texte** et en donne la raison.
- Les fichiers **Word, Excel, PowerPoint, OpenDocument, EPUB et RTF** (y compris les anciens .doc, .xls et .ppt) s’affichent sous forme d’aperçu. Quand LibreOffice est installé, un sélecteur en haut propose deux vues :
  - **Pages** : « Comme LibreOffice les met en page », chaque page telle qu’elle serait imprimée. La première fois demande un instant (« Mise en page des pages… ») ; ensuite, les pages s’ouvrent aussitôt tant que le fichier ne change pas.
  - **Texte** : « Son texte, ses feuilles et ses diapositives », tels que l’app les lit. Un document texte s’affiche comme une page de papier ; un classeur comme une grille avec les lettres des colonnes, les numéros des lignes et un onglet par feuille en bas (les feuilles masquées sont marquées d’un œil barré) ; les diapositives comme des cartes, chacune avec son numéro et ses notes de l’orateur dessous. Les images s’affichent sous forme d’un cadre avec leur description. Une ligne en haut indique quand quelque chose a été laissé de côté (« Affiche les 1 000 premières lignes »).
- Sans LibreOffice, il n’y a que la vue **Texte**. Les livres EPUB s’ouvrent toujours dans cette vue.
- Sur un téléphone, l’aperçu s’ouvre sur **Texte** (un fichier PowerPoint sur **Diapositives**), qui défile et se zoome mieux sur un petit écran ; le sélecteur affiche les pages.

Si LibreOffice ne parvient pas à mettre un fichier en page, la visionneuse l’indique et son texte reste disponible sous **Texte**. Un fichier sans aperçu affiche « Aucun aperçu pour ce fichier » : téléchargez-le pour l’ouvrir sur votre appareil. Le bouton de téléchargement de la visionneuse est toujours là.

## Laisser les agents créer des images

Demandez une image à n’importe quel agent (« fais un logo pour ma boulangerie », « transforme cette photo en aquarelle ») : il la crée avec un modèle d’images via OpenRouter, l’enregistre dans le dossier de la session et l’affiche avec sa réponse. Configurez cela dans **[Paramètres → Capacités → Images, vidéo et audio](/settings?s=images)** (sur un téléphone : Paramètres, puis **Images, vidéo et audio**).

- **[Création d’images](/settings?s=images&find=Making%20images)** : l’interrupteur **Laisser les agents créer des images**, à côté du titre du groupe, donne à chaque agent ses outils pour les images : créer des images, des dessins et des graphiques, et détourer une image ou en effacer une partie. Il est activé tant que vous ne le désactivez pas ; désactivé, les agents ne se les voient pas proposer.
- **La clé OpenRouter** : les modèles d’images, de vidéo et d’audio sont accessibles via OpenRouter, et chaque image, vidéo ou son est payé avec votre clé OpenRouter. Sans clé, cette section l’indique, avec **Obtenez-en une sur openrouter.ai** et **Ajouter la clé**, qui ouvre [Paramètres → Agents → Modèles → OpenRouter](/settings?s=models&find=OpenRouter), où la clé se place (voir [Agents, comptes et modèles](/guide/agents-models)). Un agent qui en a besoin vous la demande plutôt sur une carte ([Quand un agent a besoin de la clé OpenRouter](#when-an-agent-needs-the-openrouter-key)).
- **[Pour la plupart des images (Meilleur)](/settings?s=images&find=For%20most%20pictures%20%28Best%29)** : le modèle qui crée les scènes, les photos, les personnes, le texte dans une image et les diagrammes, ainsi que toute modification d’une image. Il affiche son nom, avec son éditeur, environ ce que coûte une image (pour une image d’environ un mégapixel) et le mois où OpenRouter l’a référencé en dessous (son identifiant se trouve dans le (i)), avec des étiquettes : **Nouveau** (référencé au cours des 30 derniers jours), **Retouches** (il accepte des images à modifier ou à suivre) et **Le texte aussi** (il écrit du texte dans ses images). Tant que vous n’en choisissez pas un, c’est le choix de l’app (« Le choix de l’app, jusqu’à ce que vous en choisissiez un ») : le premier d’une courte liste qu’OpenRouter propose encore : Seedream 5.0 Pro et Flash de ByteDance, puis des modèles d’images de Google Gemini, d’OpenAI et FLUX.
- **[Pour les images simples (Rapide)](/settings?s=images&find=For%20simple%20pictures%20%28Quick%29)** : un modèle moins cher et plus rapide pour les icônes, les arrière-plans, les textures et les images simples, présenté de la même façon. Tant que vous n’en choisissez pas un, c’est le choix de l’app : le premier d’une courte liste de modèles rapides qu’OpenRouter propose encore, Seedream 5.0 Flash de ByteDance en tête, puis des modèles rapides de Google, Recraft, FLUX et OpenAI (quand OpenRouter n’en propose aucun, le modèle Meilleur crée aussi les images simples).
- **[Outils d’image sur cet ordinateur](/settings?s=images&find=Picture%20tools%20on%20this%20computer)** : détourer une image, en effacer une partie et l’agrandir sur cet ordinateur plutôt que via OpenRouter : c’est gratuit, et vos images restent ici. **Configuration** les télécharge une seule fois, la ligne dessous indique ce qu’ils font, et **⋯ → Retirer** les enlève de cet ordinateur (voir [Les outils d’image sur cet ordinateur](/guide/library#the-picture-tools-on-this-computer)).

Pour choisir le modèle Meilleur ou Rapide :

1. Cliquez sur **Variation** à côté de lui : une liste des modèles d’images d’OpenRouter s’ouvre (**Modèle d’images pour la plupart des images (Meilleur)** ou **Modèle d’images pour les images simples (Rapide)**).
2. Cherchez dedans par nom (« seedream », « flux », « gemini »), et triez-la par **Suggéré** (les suggestions de l’app d’abord), **Plus récent** ou **Le moins cher**.
3. Cliquez sur une ligne pour utiliser ce modèle. Une fois que vous en avez choisi un, le menu **⋯** de la ligne propose **Laisser plutôt l’app choisir**, qui revient au choix de l’app.

Les listes viennent d’OpenRouter et ne demandent aucune clé ; quand elles sont inaccessibles, la liste l’indique.

## Laisser les agents créer des vidéos

Les agents peuvent aussi créer de courtes vidéos (« dix secondes de vagues au crépuscule », « fais courir mon chien dans un champ à partir de cette photo »), avec un modèle vidéo via OpenRouter, dans la même section, **[Paramètres → Capacités → Images, vidéo et audio](/settings?s=images)** :

- **[Création de vidéos](/settings?s=images&find=Making%20videos)** : l’interrupteur **Laisser les agents créer des vidéos**, à côté du titre du groupe, donne à chaque agent l’outil correspondant. Il est activé tant que vous ne le désactivez pas.
- **[Modèle vidéo](/settings?s=images&find=Video%20model)** : le modèle qui les crée, présenté avec son éditeur, ce que coûte une seconde de vidéo (de sa résolution la plus basse sans son à sa plus haute avec son, par exemple « 0,03 $ à 0,08 $ la seconde »), les durées qu’il produit (« 4 à 8 s »), sa résolution maximale (« jusqu’à 1080p ») et le mois où OpenRouter l’a référencé, avec des étiquettes : **Son** (il crée du son avec l’image), **À partir d’une image** (il peut partir d’une image que vous fournissez) et **Modifie des vidéos** (il modifie une vidéo que vous lui donnez au lieu d’en créer une à partir de mots). Tant que vous n’en choisissez pas un, c’est le choix de l’app : le premier d’une courte liste de modèles avec son qu’OpenRouter propose encore : Seedance 2.5 de ByteDance, puis des modèles moins chers et plus rapides comme Google Veo 3.1 Lite. **Variation** ouvre la liste pour chercher (« seedance », « veo », « kling ») et trier par **Suggéré**, **Plus récent** ou **Le moins cher**.

- **[Utiliser la carte graphique pour les vidéos](/settings?s=images&find=Use%20the%20graphics%20card%20for%20videos)** (sous **Montage de vidéos**) : **Automatique** réalise les vidéos que vous modifiez, ainsi que les montages des agents, sur la carte graphique quand il y en a une qui fonctionne (NVIDIA, Intel, AMD ou Apple) : c’est beaucoup plus rapide, et le processeur reste libre. Elle est testée la première fois qu’une vidéo est créée, et la ligne dessous indique ce qui a été trouvé (« NVIDIA GeForce RTX 4090 · NVENC ») ; **Vérifier maintenant** la teste de nouveau. Si la carte échoue sur un montage, le processeur le refait aussitôt. **Désactivé** les réalise sur le processeur.

Les vidéos coûtent bien plus cher que les images : de quelques centimes à plusieurs dollars la seconde, et une vidéo de 8 secondes avec son d’un modèle haut de gamme peut coûter plusieurs dollars. Chacune est payée avec votre clé OpenRouter, et vous voyez son prix dans un formulaire avant que quoi que ce soit ne soit créé.

## Laisser les agents créer de l’audio

Les agents peuvent aussi créer du son : des chansons et des jingles (« un jingle de 30 secondes pour mon podcast »), des voix off et des narrations dans une voix que vous décrivez (« lis ce message de bienvenue d’une voix chaleureuse et lente ») ou dans une voix copiée d’un enregistrement que vous avez, et des effets sonores et des ambiances (« de la pluie sur un toit en tôle »). Configurez cela dans la même section, **[Paramètres → Capacités → Images, vidéo et audio](/settings?s=images)** :

- **[Création d’audio](/settings?s=images&find=Making%20audio)** : l’interrupteur **Laisser les agents créer de l’audio**, à côté du titre du groupe, donne à chaque agent l’outil correspondant. Il est activé tant que vous ne le désactivez pas.
- **[Modèle musical](/settings?s=images&find=Music%20model)** : le modèle qui crée les chansons et la musique, présenté avec son éditeur, son prix (« 0,08 $ la chanson »), la durée maximale qu’il produit (« jusqu’à 3:00 ») et le mois où OpenRouter l’a référencé, avec l’étiquette **Musique**. Tant que vous n’en choisissez pas un, c’est le choix de l’app : Lyria 3 Pro de Google, qui crée des chansons entières d’environ 3 minutes au plus, chantées ou non ; à défaut, Lyria 3 Clip, qui crée des extraits de 30 secondes.
- **[Modèle de voix et de son](/settings?s=images&find=Voice%20and%20sound%20model)** : le modèle qui parle et crée d’autres sons, présenté avec son prix (« 0,0025 $ la seconde », « 0,08 $ les 1 000 caractères », « environ 0,014 $ la minute »), la durée maximale qu’il produit et le nombre de voix qu’il propose, avec des étiquettes : **Les sons aussi** (il crée des effets sonores et des ambiances en plus des voix, à partir d’une description), **Copie des voix** (il parle avec une voix copiée à partir de courts enregistrements que vous lui donnez), **Conversations** (il fait parler plusieurs interlocuteurs, chacun avec sa propre voix) et **Dirigé** (il accepte des indications pour l’interprétation : ton, rythme, émotion). Tant que vous n’en choisissez pas un, c’est le choix de l’app : Seed Audio 1.0 de ByteDance, qui fait tout cela à partir d’une description, jusqu’à 2 minutes à la fois ; à défaut, Gemini 3.8 Flash TTS de Google, puis ElevenLabs v3.

**Variation** ouvre la liste de chaque modèle, pour chercher (« lyria » ; « seed », « elevenlabs », « gemini ») et trier par **Suggéré**, **Plus récent** ou **Le moins cher** (les voix selon ce que coûte environ une minute de parole) ; la ligne d’un modèle choisi propose **⋯ → Laisser plutôt l’app choisir** pour revenir au choix de l’app. Quand le modèle de voix que vous avez choisi ne fait que lire des mots à voix haute, un effet sonore ou une voix copiée est créé avec le choix de l’app qui en est capable, et le formulaire l’indique.

Les modèles de voix sont surtout facturés au caractère lu, Seed Audio à la seconde de son créée, Lyria à la chanson. Chacun est payé avec votre clé OpenRouter, et vous voyez son prix dans un formulaire avant que quoi que ce soit ne soit créé.

## Vérifier les paramètres avant la création

Avant qu’un agent crée une image, un dessin détaillé, une vidéo ou un son, un court formulaire s’affiche dans la conversation avec les paramètres que prend ce modèle et ce que coûte le résultat, remplis avec ce que vous avez demandé et les valeurs par défaut de l’app :

- pour une image : **Forme** (carrée, large, haute…, selon ce que prend le modèle), **Résolution** (1K, 2K, 4K…), **Qualité**, **Nombre d’images** (pour les modèles qui en créent plusieurs à la fois) et **Fond transparent** (pour un logo ou une icône) ;
- pour un dessin détaillé (par le modèle vectoriel de Recraft) : sa **Forme** ;
- pour une vidéo : **Durée de la vidéo** (les durées que le modèle peut créer, ou **Durée, en secondes**), **Forme**, **Résolution** et **Son** ;
- pour un son : pour une chanson, **Instrumental, sans chant** et, avec un modèle qui crée de longues chansons, **Durée, en secondes** (laissez vide pour que la chanson dure le temps qu’il lui faut) ; pour un effet sonore, sa **Durée, en secondes** (Seed Audio est facturé à la seconde) ; pour une voix parlée, la **Voix** (pour un modèle qui a ses propres voix) ; et le **Fichier** (**MP3, plus léger** ou **WAV, non compressé**), lorsque le modèle propose les deux.

Au-dessus des champs figurent le nom du modèle, son prix (« environ 0,08 $ l’image », « 0,03 $ à 0,08 $ la seconde, selon la résolution et le son », « 0,08 $ la chanson », « 0,0025 $ la seconde de son » ; pour une vidéo ou un son, ce que cela donne avec les paramètres affichés) et ce que l’agent va demander, en entier et dans ses propres mots. Modifiez ce que vous voulez et cliquez sur **La créer** ; **Pas maintenant** ferme le formulaire, et rien n’est créé ni dépensé. Le formulaire n’affiche que les paramètres que propose le modèle.

Le formulaire s’affiche une fois par modèle dans une session : les images, vidéos et sons suivants de cette session utilisent les paramètres que vous avez choisis (pour un son, sa voix et son fichier), sauf si vous en demandez d’autres (« maintenant une image haute »). Dites « montre-moi à nouveau les paramètres » pour afficher le formulaire, ou « vas-y, choisis pour moi » pour que l’agent crée sans formulaire. Les tâches planifiées et les exécutions des apps créent sans formulaire, avec les valeurs par défaut de l’app, puisque personne n’est là pour répondre.

## Quand un agent a besoin de la clé OpenRouter

Les images, dessins détaillés, vidéos, musiques et voix sont créés par des modèles via OpenRouter, payés avec votre clé OpenRouter. Quand un agent s’apprête à en créer un et qu’aucune clé n’est définie, une carte s’affiche d’abord dans la conversation, **Une clé OpenRouter est nécessaire**, indiquant quel modèle le créerait, à peu près ce que cela coûte, et que vous payez OpenRouter pour ce qui est créé, avec un champ pour la clé :

- Collez-la et cliquez sur **Enregistrer la clé** (ou appuyez sur Entrée). OpenRouter la vérifie d’abord ; elle va directement dans [Paramètres → Agents → Modèles → OpenRouter](/settings?s=models&find=OpenRouter), jamais dans la conversation, et l’agent poursuit (vers le formulaire des paramètres, comme d’habitude). La carte indique alors « Votre clé OpenRouter est enregistrée dans Paramètres → Modèles. »
- **Obtenir une clé** ouvre la page d’OpenRouter où vous pouvez en créer une.
- **Passer** : ce modèle ne s’exécute pas, rien n’est créé ni dépensé, et l’agent poursuit sans lui, par un autre moyen quand il n’exige aucune clé (un dessin simple qu’il écrit lui-même, les [outils d’image sur cet ordinateur](/guide/library#the-picture-tools-on-this-computer)), ou sans rien. La session ne redemande pas avant six heures.

La carte attend jusqu’à neuf minutes ; ensuite l’agent poursuit sans la clé, et l’apprend si vous l’ajoutez plus tard. Les tâches planifiées et les exécutions des apps n’affichent aucune carte, puisque personne n’est là pour répondre : elles indiquent que la clé manque (« Les images nécessitent une clé OpenRouter », avec **Ajouter une clé OpenRouter**). Les outils d’IA des éditeurs demandent la clé dans leur propre boîte de dialogue ([Créer des images, dessins, graphiques et vidéos avec l’IA](/guide/library#make-pictures-drawings-plots-and-videos-with-ai)).

## Demander une image, ou la faire modifier

Décrivez ce que vous voulez : le sujet, le décor, le style (une photo, une illustration, une aquarelle), les couleurs, la lumière, et les mots qui doivent y figurer. L’agent peut aussi :

- **modifier ou combiner vos images** : des fichiers d’image sur cet ordinateur (PNG, JPEG, WebP ou GIF, jusqu’à 20 Mo chacun ; la plupart des modèles en prennent jusqu’à 4, certains davantage), dans le dossier de la session ou par leur chemin, ou les images déjà présentes dans une présentation, un document ou une page que vous avez gardés ; dites ce qu’il faut changer. (Une image jointe à un message est transmise au modèle pour qu’il la regarde ; pour que le modèle d’image travaille à partir d’elle, elle doit être un fichier : importez-la dans la page Fichiers.) Cela demande un modèle portant l’étiquette **Retouches** ; avec un autre, on dit à l’agent de décrire la modification avec des mots ou de vous faire choisir un modèle qui retouche les images ;
- **utiliser le modèle Rapide ou le modèle Meilleur** : l’agent prend le Rapide pour les images simples (un arrière-plan, une texture, une icône) et le Meilleur pour les scènes, les photos, les mots dans une image, les diagrammes et toute retouche, ou décide d’après ce que vous demandez ; dites-le pour obtenir l’autre (« un rapide suffit », « utilise le modèle Meilleur ») ;
- **rendre l’arrière-plan transparent** (un logo, une icône) : un modèle qui ne sait pas le faire passe la main à un qui le sait, ou, si les [outils d’image](/guide/library#the-picture-tools-on-this-computer) sont installés, l’image est créée sur un fond uni et son arrière-plan est retiré sur cet ordinateur ;
- **utiliser un autre modèle** pour une image, quand vous le nommez (« crée-la avec FLUX 2 Pro »), sans modifier les Paramètres.

Les images sont enregistrées dans un dossier **images** à l’intérieur du dossier de la session, nommées d’après ce qu’elles montrent, et jamais par-dessus un fichier déjà présent.

Dans la conversation :

- Pendant que le modèle travaille, un espace réservé à la forme demandée indique « Création d’une image » avec le temps écoulé, et la description en dessous.
- Ensuite les images s’affichent avec la réponse, avec la description et le nom du modèle en dessous, et **Garder** (voir [Garder ce qu’un agent a créé](#keep-what-an-agent-made)). Cliquez sur une image pour la voir en grand : cliquez de nouveau pour la taille réelle, les flèches (ou les touches fléchées) font défiler plusieurs images, **Ouvrir dans un nouvel onglet** l’ouvre seule, **Modifier** l’ouvre dans l’éditeur d’images (ce que vous y enregistrez est conservé comme une nouvelle image : [Modifier des images et des vidéos](/guide/library#edit-pictures-and-videos)), et Échap ferme. Sur chaque image, **Afficher dans les fichiers**, **Télécharger** et **Plus** (⋯ : **Démarrer une session avec ce fichier**, **Ajouter à un projet**, **Copier le chemin** et, dans l’app de bureau, **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier**) apparaissent quand vous la pointez (sur un téléphone, ils sont toujours visibles) ; avec plusieurs images, **Garder** est aussi présent.
- Si aucune clé OpenRouter n’est définie, une carte vous en demande une d’abord ([Quand un agent a besoin de la clé OpenRouter](#when-an-agent-needs-the-openrouter-key)) ; dans une exécution que personne ne regarde (celle d’une tâche planifiée ou d’une app), vous voyez à la place « Les images nécessitent une clé OpenRouter », avec **Ajouter une clé OpenRouter**. Quand rien n’est créé (vous avez passé la clé ou fermé le formulaire, ou le modèle a refusé), vous voyez « Pas d’image cette fois » avec la raison.

## Demander un dessin ou un graphique

Certaines images sont mieux dessinées à partir de formes ou calculées à partir de chiffres que peintes par un modèle d’image :

- **Un dessin** (un SVG : des formes plutôt que des pixels, net à toutes les tailles) : une icône, un logo, un diagramme, un motif qui se répète, une forme ou une illustration à plat, dans les couleurs que vous donnez (celles d’une présentation ou d’un document, par exemple). Un dessin simple est écrit par Claude (ou par le [modèle d’appoint](/settings?s=models&find=Helper%20model) que vous avez choisi), sans modèle d’image à payer, en moins d’une minute ; un dessin détaillé (une illustration, ou quand vous demandez le meilleur) est dessiné par le modèle vectoriel de Recraft via OpenRouter, pour environ 0,08 $ le dessin, après le formulaire avec son prix. Les scripts, les liens et tout ce qu’un dessin chargerait depuis un autre endroit sont retirés de chaque dessin avant qu’il soit gardé.
- **Un graphique** de vos données ou de mathématiques, pour ce qu’un graphique de diapositive ne peut pas tracer : nuages de points, histogrammes, boîtes à moustaches, barres d’erreur, plusieurs axes ou panneaux, cartes de chaleur, fonctions, ajustements et annotations sur les points importants. Claude (ou le modèle d’appoint) l’écrit en Python avec matplotlib, il s’exécute sur cet ordinateur, et ce qui ne marche pas lui est renvoyé pour correction (jusqu’à trois essais) ; cela prend environ une demi-minute et ne coûte que cette réponse. Donnez les chiffres dans votre message ou sous forme de fichier (CSV, TSV ou JSON, jusqu’à 20 Mo), et dites ce qu’il doit démontrer (« montre que le printemps a doublé »). Il arrive sous forme de dessin (SVG ; un PNG pour un très grand nombre de points), de 960 par 540 pixels sauf si vous demandez une autre taille, avec son code Python à côté, de sorte que « maintenant avec une échelle logarithmique » modifie ce graphique ; pour une présentation web, il peut aussi arriver sous forme de graphique animé qui réagit au pointeur. Il faut Python avec matplotlib sur l’ordinateur où tourne l’app : celui des outils d’image une fois installés ([Les outils d’image sur cet ordinateur](/guide/library#the-picture-tools-on-this-computer)), ou un qui s’y trouve déjà.

Les deux sont enregistrés dans le dossier **images** à l’intérieur du dossier de la session et s’affichent avec la réponse comme les images ; pendant la création, l’espace réservé indique « Création d’un dessin » ou « Tracé du graphique ».

## Trouver des photos libres

Demandez des photos plutôt que des images créées par un modèle (« trouve deux photos des tramways de Lisbonne pour ma diapositive de titre »), et l’agent cherche des photos sous licence libre, utilisables et modifiables librement, y compris pour un usage professionnel : le catalogue d’Openverse (Flickr, Wikimedia Commons, musées et plus), ou la recherche propre de Wikimedia Commons quand Openverse ne peut pas répondre. Il enregistre quelques-unes des meilleures (4 sauf indication contraire, 10 au maximum) dans le dossier **images** de la session, avec le crédit de chacune (son titre, son auteur, sa licence et son lien) dans un fichier à côté, les regarde avant d’en utiliser une, et les crédite comme leur licence l’exige : dans les notes du présentateur de la diapositive, ou sous l’image dans un document ou une page, et pour les licences autres que CC0 et le domaine public dans une petite légende près de la photo (« Photo : “Titre” par Auteur, CC BY 2.0 »). C’est gratuit et cela prend quelques secondes ; pendant la recherche, l’espace réservé indique « Recherche de photos libres ».

## Découper, effacer et modifier

Les agents peuvent aussi modifier vos images et vos vidéos sans les faire recréer :

- **Retirer l’arrière-plan** d’une image : son sujet (une personne, un produit, un animal, un logo) sur un fond transparent, au format PNG. Sur cet ordinateur, une fois les [outils d’image](/guide/library#the-picture-tools-on-this-computer) installés, c’est gratuit et privé, les pixels du sujet sont conservés tels quels, et cela prend quelques secondes ; un détourage de mauvaise qualité est refait par un modèle d’image. Sans ces outils, c’est un modèle d’image passant par OpenRouter qui s’en charge (environ 0,01 $ à 0,04 $) : il redessine l’image sans son arrière-plan, si bien que de petits détails peuvent différer.
- **Effacer un élément** d’une image (une personne à l’arrière-plan, un panneau, un filigrane, une tache, un câble) : il est retiré et la zone est remplie en prolongeant ce qui l’entoure. L’agent indique l’endroit, ou le décrit pour qu’un modèle d’image le repère. Les petites zones sont effacées gratuitement sur cet ordinateur ; les grandes zones, celles qui traversent l’image et celles situées parmi des éléments détaillés comme du texte sont confiées à un modèle d’image (environ 0,01 $ à 0,04 $).
- **Agrandir une image** : deux ou quatre fois plus grande sur chaque côté, avec des détails redessinés nettement plutôt que flous (une petite photo pour l’impression ou une diapositive, une image ancienne). Gratuit et privé, sur cet ordinateur une fois les [outils d’image](/guide/library#the-picture-tools-on-this-computer) installés (la première fois, il télécharge son modèle, environ 5 Mo) ; une grande image demande une minute ou deux.
- **Modifier une image** : la recadrer, la faire pivoter ou la retourner, la redimensionner, changer sa lumière et ses couleurs (exposition, contraste, chaleur et le reste, ou courbes, niveaux, teinte et saturation d’une couleur, balance des couleurs, clarté, correction de la brume, réduction du bruit, grain, ou tout à la fois avec l’amélioration automatique), lui appliquer un filtre (**Vintage**, **Noir et blanc**…), y écrire du texte, y dessiner des flèches et des cadres, et en flouter ou pixelliser des parties (un visage, une plaque d’immatriculation, un nom). Gratuit, sur cet ordinateur ; une image JPEG, WebP ou GIF, ou du texte sur l’une d’elles, nécessite ffmpeg ou les outils d’image installés sur place.
- **Modifier une vidéo** : la couper au début et à la fin, en retirer des passages, la recadrer selon un format (16:9, 9:16, carré, 4:5), la faire pivoter ou la retourner en miroir, l’accélérer ou la ralentir (ou la jouer à l’envers, stabilisée), assembler plusieurs clips et images avec des transitions (fondus enchaînés, fondus par le noir, volets, glissements), donner un zoom lent à une image, l’étalonner (exposition, chaleur, contraste, un rendu comme le cinéma ou le noir et blanc, une vignette, du grain), la faire apparaître et disparaître en fondu, en retirer le son ou en changer le volume, choisir les canaux entendus (un micro-cravate placé d’un seul côté, entendu des deux), rendre certains passages silencieux, donner à la musique une courbe de volume, y superposer un logo, un filigrane ou un fond vert, y ajouter du texte (titres, sous-titres, ou sous-titres créés à partir de ce qui est dit, avec un fichier .srt à côté) et placer dessous de la musique et une voix off, avec les voix nettoyées, la musique baissée sous la parole et le volume sonore uniformisé ; ou en faire un GIF, ou en extraire une image fixe. Gratuit, avec ffmpeg sur cet ordinateur (les outils d’image en apportent un), sur la carte graphique quand il y en a une, tant que **Laisser les agents créer des vidéos** est activé.
- **Modifier un son** (un fichier audio, le son d’une vidéo ou un son que vous avez gardé) : en garder une partie, en retirer des passages ou les rendre silencieux, raccourcir les longues pauses, supprimer les mots de remplissage (« euh », « hum » : avec la reconnaissance vocale sur cet ordinateur, voir [Reconnaissance vocale sur le serveur](#speech-recognition-on-the-server)), le jouer plus vite ou plus lentement en conservant sa hauteur, changer sa hauteur, l’amplifier, l’atténuer ou le faire disparaître en fondu, fixer son pic maximal ou son volume sonore (podcast, streaming, diffusion), réduire le bruit, modifier son timbre (une voix plus claire, un téléphone, une radio), le compresser ou le limiter, ajouter de l’écho ou de la réverbération, l’inverser ou le passer en mono, et mélanger d’autres sons par-dessus à un moment précis (de la musique sous une voix, un effet sonore). Gratuit, avec ffmpeg sur cet ordinateur, tant que **Laisser les agents créer de l’audio** est activé.

Chaque outil part d’un fichier du dossier de la session, ou d’une image ou d’une vidéo déjà présente dans une présentation, un document ou une page, et enregistre le résultat dans le dossier **images** de la session (une vidéo modifiée dans **vidéos**, un son modifié dans **audio**), sans jamais écraser l’original. Une image ou un son que vous avez gardé peut aussi être modifié, puis remis à sa place ou à côté comme nouvel élément, comme le font **Enregistrer** et **Enregistrer une copie** dans les éditeurs (« éclaircis la photo du port que j’ai gardée », « règle mon son “Interview” au volume d’un podcast »). Le résultat s’affiche avec la réponse comme une image créée par l’agent, avec un espace réservé qui indique « Retrait de l’arrière-plan », « Effacement », « Agrandissement », « Modification de l’image », « Modification de la vidéo » ou « Modification du son » pendant le traitement. Pour un détourage ou un effacement, la réponse indique la méthode utilisée et pourquoi : si le résultat ne convient pas, dites « fais-le avec l’IA » et l’agent sollicite le modèle d’image. Pour le faire vous-même, ouvrez l’image, la vidéo ou le son dans son éditeur ([Modifier des images et des vidéos](/guide/library#edit-pictures-and-videos), [L’éditeur de son](/guide/library#the-sound-editor)).

## Demander une vidéo

Décrivez la scène, ce qui bouge et comment, la caméra (« un lent travelling avant », « elle suit le cycliste »), le style et la lumière, ainsi que les sons ou les paroles éventuels. L’agent peut aussi :

- **partir d’une image** : un fichier image qui sert de première image à la vidéo (« donne vie à cette photo »), et, pour certains modèles, une image de fin, pour les modèles portant l’étiquette **À partir d’une image** ;
- **suivre des images** : jusqu’à 4 images d’un personnage, d’un produit ou d’un style que la vidéo doit respecter, sans qu’elles en soient les images de départ ;
- **modifier une vidéo** : un fichier vidéo (MP4, WebM ou MOV, jusqu’à 40 Mo) à modifier, prolonger ou rendre plus net, pour un modèle portant l’étiquette **Modifie des vidéos**.

Une vidéo prend de moins d’une minute à plusieurs minutes. L’agent l’attend neuf minutes au maximum ; si cela prend plus de temps, l’app continue de la récupérer et l’enregistre quand elle est prête, et l’agent l’affiche à sa prochaine vérification. Attendre ne coûte rien de plus.

Les vidéos sont enregistrées dans un dossier **vidéos** à l’intérieur du dossier de la session, nommées d’après ce qu’elles montrent.

Dans la conversation :

- Pendant que le modèle travaille, un espace réservé à la forme de la vidéo indique « Création d’une vidéo » avec le temps écoulé.
- Ensuite, la vidéo s’affiche avec la réponse, prête à être lue (en plein écran aussi, depuis ses commandes), avec la description et le nom du modèle en dessous, et **Garder**. Par-dessus, **Modifier** (l’éditeur vidéo : ce que vous enregistrez est gardé), **Afficher dans les fichiers**, **Télécharger** et **Plus** (⋯ : comme sous une image, avec **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** dans l’app de bureau) apparaissent quand vous la survolez.
- « Création encore en cours » signifie que l’agent a cessé d’attendre avant que la vidéo soit prête : elle s’affiche à la prochaine vérification de l’agent (demandez-lui de la faire, s’il ne la fait pas). « Pas de vidéo cette fois » en donne la raison : vous avez fermé le formulaire, ou le modèle a refusé (ses propres mots disent pourquoi).

## Demander de la musique, une voix ou un son

Dites à l’agent ce que vous voulez entendre :

- **Musique** : le genre et l’ambiance, les instruments, le tempo, la voix qui chante et la manière dont elle chante (« une chanson synth-pop entraînante de 2 minutes sur les lundis matin, chantée par une femme, avec un refrain accrocheur »). Donnez vos propres paroles, ou laissez le modèle les écrire ; demandez un morceau instrumental si vous ne voulez pas de chant. Lyria 3 Clip produit toujours 30 secondes ; Lyria 3 Pro produit jusqu’à environ 3 minutes, selon ce que vous demandez. Une chanson prend une minute ou deux.
- **Une voix off** : les mots à dire, exactement, et la manière dont ils doivent sonner (« lis ce texte d’une voix calme et grave, lentement »). Avec un modèle qui propose ses propres voix, vous en choisissez une dans le formulaire ; Seed Audio crée la voix que vous décrivez. Une conversation entre plusieurs intervenants fonctionne aussi (« une courte introduction de podcast avec deux animateurs »), avec les modèles qui les font parler.
- **Une voix copiée à partir d’un enregistrement** : donnez à l’agent de 1 à 3 enregistrements de la voix, des fichiers sur cet ordinateur (WAV, MP3, M4A, OGG ou FLAC, jusqu’à 30 Mo chacun ; les 30 premières secondes de chacun sont utilisées), pour un modèle qui **Copie des voix** (Seed Audio). N’utilisez qu’une voix que vous avez le droit d’utiliser : la vôtre, ou celle d’une personne qui a donné son accord. Avec ffmpeg sur l’ordinateur, n’importe lequel de ces fichiers convient ; sans lui, seuls les fichiers WAV et MP3 fonctionnent.
- **Un effet sonore ou une ambiance** : ce que c’est, ce qui se passe et quand (« forte pluie sur un toit en tôle, tonnerre qui approche à la fin, sans voix »), et la durée.
- **Un autre modèle** pour un son en particulier, quand vous le nommez (« lis-le avec ElevenLabs v3 »), sans modifier les Paramètres.

Les sons sont enregistrés dans un dossier **audio** à l’intérieur du dossier de la session, nommés d’après ce qu’ils sont, au format MP3 (ou WAV, si vous le demandez).

Dans la conversation :

- Pendant que le modèle travaille, une carte indique « Création de musique », « Création d’une voix off » ou « Création d’un son », avec le temps écoulé.
- Ensuite, le son s’affiche avec la réponse, dans un lecteur : le bouton rond lance et met en pause la lecture (un seul son est lu à la fois), sa forme d’onde est la barre pour se déplacer (cliquez ou faites glisser), puis viennent la durée et la vitesse (**1×**, **1,25×**, **1,5×**, **2×** ou **0,75×**). Quand le lecteur a le focus, Espace ou K lance et met en pause la lecture, et ← → avancent ou reculent de 5 secondes. Son titre vient du nom du fichier, avec à côté **Modifier** (l’[éditeur de son](/guide/library#the-sound-editor) : ce que vous enregistrez est gardé), **Afficher dans les fichiers**, **Télécharger** et **Plus** (⋯ : comme sous une image, avec **Afficher dans le Finder**, **Afficher dans l’Explorateur de fichiers** ou **Afficher dans le dossier** dans l’app de bureau). En dessous se trouvent les mots à partir desquels il a été créé, le nom du modèle et **Garder** (voir [Garder ce qu’un agent a créé](#keep-what-an-agent-made)) ; les **Paroles** d’une chanson s’ouvrent sous eux.
- Sans clé OpenRouter, vous voyez « L’audio nécessite une clé OpenRouter », avec **Ajouter une clé OpenRouter**. « Pas de son cette fois » en donne la raison : vous avez fermé le formulaire, ou le modèle a refusé (ses propres mots disent pourquoi).

L’agent ne peut pas entendre ce qu’il a créé : il connaît le son d’après ce qu’il a demandé. Si le résultat ne sonne pas bien, dites ce qu’il faut changer et il en crée un autre ; ou faites-le modifier (« fais disparaître en fondu les deux dernières secondes du jingle », « place-le sous ma voix off à 0:05 »), par l’agent ou dans l’éditeur de son.

## Des images dans ce que créent les agents

Quand un agent crée ou modifie pour vous des diapositives, un document ou une page, il les illustre de lui-même là où une image apporte quelque chose (une diapositive de titre, une section, une idée ; pas chaque diapositive), dans leurs couleurs et leur style, comme le ferait un designer : une image Rapide pour un arrière-plan, une texture ou une icône, une image Meilleur pour une scène, une photo ou un diagramme, un dessin pour une icône, un logo ou un diagramme qui doit rester net, un graphique pour des chiffres, des photos libres de droits de lieux et d’objets réels, et ses images détourées, effacées ou modifiées pour s’adapter. Il travaille à partir des images déjà présentes dans ce que vous avez ouvert comme à partir de fichiers et, si vous le lui demandez, rédige une description pour chaque image d’une présentation qui n’en a pas, à l’intention des personnes qui ne peuvent pas les voir (c’est le modèle qui décrit les images que vous gardez qui s’en charge). Ce qui coûte de l’argent est chiffré dans le formulaire avant la création ([Vérifier les réglages avant toute création](#check-the-settings-before-anything-is-made)) ; dites « pas d’images » ou « seulement des photos libres de droits » si vous voulez autre chose.

Quand vous demandez un type de contenu connu par son nom (une diapositive SWOT, une présentation pour investisseurs, une lettre de motivation, un résumé exécutif, un suivi d’habitudes, un tableau de tarifs, un budget), l’agent commence par lire comment l’app réalise bien ce type de contenu : ce qu’il contient, dans quel ordre, quel aspect il a et où les images aident, comme sont réalisés les types de la galerie ([Créé avec l’IA à partir d’un type](/guide/library#made-with-ai-from-a-kind)). Cela ne coûte rien.

Dans une [session confidentielle](/guide/sessions#keep-a-session-confidential), rien de tout cela n’est disponible : son agent ne crée, ne trouve et ne modifie ni image ni vidéo.

## Garder ce qu’un agent a créé

**Garder**, sous une image, une vidéo ou un son créé par un agent, conserve une copie dans les fichiers d’un projet, où un modèle rédige un titre et une description (pour un son, à partir des mots qui ont servi à le créer, puisqu’aucun modèle ne peut l’entendre ; le modèle se choisit dans [Paramètres → Capacités → Images, vidéo et audio → Légendes de ce que vous gardez](/settings?s=images&find=Captions%20for%20what%20you%20keep)), et où il reste après le nettoyage du dossier de la session. Quand vous avez des projets, un petit menu demande où le placer (**Le garder dans**) : d’abord le projet propre à la session, puis vos autres projets, et **Aucun projet**, qui le conserve avec la conversation, où la zone de recherche (Ctrl+K) le trouve. Le bouton indique alors **Gardée** et l’ouvre. Une image que vous avez gardée apparaît parmi les fichiers de son projet (les détails du projet → **Fichiers**, sous forme d’une vignette avec son image) et, dans l’éditeur, **Garder** conserve une image modifiée comme une nouvelle image, tandis que **Enregistrer** la remet là d’où elle vient et **Enregistrer une copie** en garde une autre à côté.

## Suggestions de mots pendant la saisie

Pendant que vous écrivez, Hydor peut afficher en gris, après le curseur, la fin du mot que vous êtes en train de taper, puis le mot suivant en plus pâle. Il le fait dans la zone de message, dans les documents, dans les notes et dans d’autres zones de texte, quelle que soit la langue dans laquelle vous écrivez.

- **Tab** accepte le mot en gris. Appuyez à nouveau pour accepter le suivant.
- **→** (la flèche droite), avec le curseur à la fin du texte, accepte les deux mots d’un coup.
- **Esc** les masque jusqu’au mot suivant. Continuez à écrire et ils disparaissent d’eux-mêmes ; tapez les lettres qu’ils montrent et ils restent, raccourcis.
- Dans la zone de message, un menu `@` ou `/` ouvert garde Tab et Esc pour lui, et **Maj+Tab** change toujours le mode d’autorisation. Quand rien de gris n’est affiché, chaque touche fait ce qu’elle a toujours fait.

Rien de ce que vous tapez ne quitte votre ordinateur : les suggestions sont produites par des modèles qui s’exécutent dessus. La fonction est désactivée tant que vous ne l’activez pas.

### L’activer

Ouvrez **[Paramètres → Capacités → Suggestions de mots](/settings?s=suggest)** et activez **[Suggestions de mots](/settings?s=suggest&find=Word%20suggestions)**. La première fois, Hydor installe et télécharge ce dont il a besoin, environ 1,3 Go au total, avec une ligne sous l’interrupteur qui indique l’avancement : les bibliothèques Python sur lesquelles il repose (depuis PyPI et l’adresse de téléchargement propre à PyTorch), llama.cpp (depuis GitHub), le modèle de langage et le petit modèle (depuis Hugging Face). Rien n’est téléchargé avant que vous l’activiez, et rien de plus ensuite. Quand la ligne affiche **Prêt : les suggestions s’affichent pendant la saisie**, c’est opérationnel ; la première suggestion après une longue pause prend un peu plus de temps, le temps que les modèles se chargent, car ils sont libérés après un moment sans saisie. Désactiver la fonction les arrête ; ce qui a été téléchargé reste. Tout s’exécute sur le processeur, donc aucune carte graphique n’est nécessaire.

### Les deux modèles et la mémoire dont ils ont besoin

Deux modèles travaillent ensemble, tous deux sur votre ordinateur :

- **Le petit modèle** est l’un des modèles propres à l’app, assez petit pour fonctionner sur n’importe quel ordinateur et entraîné sur des textes en 200 langues. Il apprend aussi de ce que vous écrivez ([voir plus bas](#learn-from-what-you-write)).
- **Le modèle de langage** est Qwen3.5-0.8B, un modèle plus grand qui devine mieux, surtout dans les documents. Il demande un ordinateur avec au moins 8 Go de mémoire, dont 2,5 Go libres à ce moment-là.

**[Modèle de langage](/settings?s=suggest&find=Language%20model)** propose trois choix. **Automatique** l’utilise quand l’ordinateur a la mémoire nécessaire, et le petit modèle seul sinon ; la ligne sous l’interrupteur indique ce qui se passe, et pourquoi. **Activé** l’utilise même dans ce cas (cela peut ralentir l’ordinateur). **Désactivé** ne l’utilise jamais. Sans lui, les suggestions fonctionnent encore, un peu moins bien. **[Taille du modèle de langage](/settings?s=suggest&find=Language%20model%20size)** permet de choisir **8 bits**, qui devine un peu mieux, ou **4 bits**, qui prend moins de mémoire et se télécharge plus vite (environ 560 Mo au lieu de 830 Mo).

Changer la taille télécharge l’autre fichier la première fois. **[Choisir selon la langue](/settings?s=suggest&find=Choose%20by%20language)**, activé par défaut, laisse l’app utiliser celui des deux modèles qui est le meilleur dans la langue dans laquelle elle vous voit écrire.

### Où les suggestions s’affichent

Sous **Où**, dans la même section, chaque endroit a son interrupteur :

- **[Dans les zones de message](/settings?s=suggest&find=In%20message%20boxes)** : là où vous écrivez à un agent, sur la page d’accueil et dans une conversation.
- **[Dans les documents](/settings?s=suggest&find=In%20documents)** : pendant que vous écrivez dans Docs. L’option « Suggérer pendant la saisie » du menu **Affichage** de Docs, qui demande au modèle d’appoint comment une phrase pourrait continuer, attend tant qu’une suggestion de mot est affichée.
- **[Dans les notes](/settings?s=suggest&find=In%20notes)** : les notes de la Mémoire et votre profil.
- **[Dans les autres zones de texte](/settings?s=suggest&find=In%20other%20text%20boxes)** : les relances, la file d’attente, un prompt précédent que vous modifiez, les panneaux Demander et les autres petites zones.

Ces réglages sont définis une fois pour toute l’app. **[Afficher dans ce navigateur](/settings?s=suggest&find=Show%20in%20this%20browser)** fait exception : il est conservé par chaque navigateur, de sorte que vous pouvez désactiver les mots en gris sur un appareil et les garder sur un autre. Un agent peut aussi le modifier pour les navigateurs qui affichent sa session.

### Le degré de certitude requis

Chaque suggestion a une chance d’être juste, et elle n’est affichée que si cette chance est assez élevée. **[Certitude avant d’afficher](/settings?s=suggest&find=How%20sure%20before%20showing)** fixe le seuil : **Plus** affiche davantage de suggestions, dont plus d’erreurs ; **Équilibré** est le juste milieu, visant environ quatre suggestions justes sur dix affichées ; **Plus sûr** en affiche moins, mais davantage sont justes. Un agent peut aussi placer le seuil encore plus haut, pour ne garder que les plus sûres. **[Afficher le mot suivant](/settings?s=suggest&find=Show%20the%20next%20word)** désactive le second mot, plus pâle, de sorte que seule la fin du mot en cours de saisie s’affiche.

### Ce qu’il lit

Pour deviner, il lit les mots que vous avez tapés avant le curseur, ainsi que ce à quoi vous répondez : la dernière réponse de l’agent dans un message, ou le texte au-dessus du paragraphe dans un document.

- **[Mots de ce que vous avez saisi](/settings?s=suggest&find=Words%20of%20what%20you%20typed)** : le nombre de vos derniers mots qu’il lit, de 20 à 200 (100 au départ). Plus il y en a, plus c’est lent.
- **[Mots de la réponse ou du document](/settings?s=suggest&find=Words%20of%20the%20reply%20or%20document)** : le nombre de mots de la réponse ou du document qu’il lit, de 0 à 200 ; 0 n’en lit aucun.
- **[Apprendre de la conversation](/settings?s=suggest&find=Learn%20from%20the%20conversation)** : retient les mots et les noms employés plus tôt dans la conversation pendant que vous écrivez un message. C’est distinct de l’apprentissage décrit plus bas.
- **[Threads](/settings?s=suggest&find=Threads)** : le nombre de threads du processeur que les suggestions utilisent. **Automatique** choisit selon les cœurs de l’ordinateur.

### Apprendre de ce que vous écrivez

Par défaut, le petit modèle apprend aussi vos propres mots : les noms, les termes et la façon d’écrire que vous employez, pour que ses suggestions vous correspondent. Cela se passe sur votre ordinateur, et ce que vous avez écrit ne le quitte jamais. Le modèle appris est conservé dans le dossier de données de l’app et n’est partagé avec personne.

- **[Apprendre de ce que j’écris](/settings?s=suggest&find=Learn%20from%20what%20I%20write)** l’active ou le désactive.
- Il apprend des sources que vous laissez activées : **[De mes messages](/settings?s=suggest&find=From%20my%20messages)** (ce que vous avez tapé aux agents, mais pas dans les sessions dont la mémoire est désactivée ni dans les [sessions confidentielles](/guide/sessions#keep-a-session-confidential), ni ce que des apps, des tâches planifiées ou d’autres sessions ont écrit pour vous), **[Des réponses des agents](/settings?s=suggest&find=From%20agents'%20replies)**, **[De mes notes](/settings?s=suggest&find=From%20my%20notes)** (les notes de la Mémoire que vous avez écrites vous-même) et **[De mes documents](/settings?s=suggest&find=From%20my%20documents)** (les pages et les documents que vous avez écrits). Désactivez les réponses des agents, par exemple, pour que ses suggestions restent fidèles à votre seul style.
- **[Poids de mes propres mots](/settings?s=suggest&find=Weight%20of%20my%20own%20words)** indique combien de fois plus ce que vous avez tapé compte par rapport au reste, de 1 (à égalité) à 16 ; 4 au départ.
- **[Quand il apprend](/settings?s=suggest&find=When%20it%20learns)** : **Chaque nuit** (environ une fois par jour, quand vous n’avez rien tapé depuis dix minutes et que l’ordinateur a la mémoire nécessaire), **Toutes les semaines**, ou **Seulement à ma demande**. L’apprentissage s’exécute en arrière-plan avec la priorité la plus basse, donc votre travail n’est pas ralenti, et il reprend là où il s’était arrêté si l’ordinateur est éteint. La première fois, il lit tout ce que vous avez écrit, ce qui peut prendre des heures sur un ordinateur sans carte graphique ; les suivantes ne lisent que ce qui est nouveau et prennent quelques minutes. **[Threads pour l’apprentissage](/settings?s=suggest&find=Threads%20for%20learning)** limite le processeur qu’il peut utiliser.
- **[Réentraîner maintenant](/settings?s=suggest&find=Retrain%20now)** apprend tout de suite de ce que vous avez écrit depuis la dernière fois.
- **[Oublier ce qu’il a appris](/settings?s=suggest&find=Forget%20what%20it%20learned)** supprime le modèle construit à partir de vos écrits, après confirmation, et revient à celui livré avec l’app. Il réapprend à sa prochaine échéance, sauf si vous avez désactivé l’apprentissage.

La ligne sous l’interrupteur indique quel petit modèle est utilisé, quand il a appris pour la dernière fois, et où en est une session d’apprentissage.

## Dicter un message

Le microphone de la zone de message (sur la page d’accueil et dans chaque session) transforme ce que vous dites en texte dans votre message. Rien n’est envoyé automatiquement : vous relisez, puis vous envoyez comme d’habitude.

1. Cliquez ou appuyez sur le microphone.
2. Parlez. Un panneau au-dessus de la zone de message affiche la durée, les mots entendus jusqu’ici (ou, quand c’est le serveur qui reconnaît la parole, « Enregistrement… » avec des barres qui suivent votre voix), et la langue écoutée.
3. Cliquez sur **Terminé**, ou à nouveau sur le microphone. Les mots s’ajoutent à ce que vous avez déjà écrit (avec le serveur, « Transformation de votre voix en texte… » s’affiche un instant avant).

La pastille de langue du panneau (« DE », « PT-BR ») change la langue pendant que vous parlez ; la dictée se poursuit dans la nouvelle langue. Quand c’est le serveur qui reconnaît la parole, un enregistrement s’arrête de lui-même au bout de 10 minutes.

Le microphone ne s’affiche que là où la dictée peut fonctionner : quand le navigateur reconnaît lui-même la parole (Chrome, Edge, Safari), ou quand c’est le serveur qui le fait (voir [Reconnaissance vocale sur le serveur](/guide/documents-voice#speech-recognition-on-the-server)). Quand il ne peut pas démarrer, il indique pourquoi et quoi faire :

- **Le microphone nécessite une connexion sécurisée** : les navigateurs ne l’autorisent que sur une adresse HTTPS, ou sur localhost sur l’ordinateur lui-même. Ouvrez Hydor via une adresse HTTPS (voir [Téléphones, autres machines et partage](/guide/devices)).
- **Le microphone est bloqué pour ce site** : autorisez-le dans les paramètres de site du navigateur (sur un iPhone : **aA** dans la barre d’adresse, puis **Réglages du site web → Microphone**), puis réessayez.
- **Aucun microphone trouvé**, ou **Le microphone est occupé** (une autre app l’utilise).
- **La reconnaissance vocale est désactivée ici** : sur un iPhone, activez la dictée dans Réglages → Général → Clavier ; ou laissez le serveur reconnaître la parole.
- **Ce navigateur ne peut pas enregistrer** : utilisez une version récente de Chrome, Edge, Firefox ou Safari.

Chacune de ces notes comporte un bouton **Paramètres vocaux**, qui ouvre Paramètres → Voix.

## Configurer la voix

Tout ce qui concerne la voix se trouve dans **[Paramètres → Capacités → Voix](/settings?s=voice)** (sur un téléphone : Paramètres, puis **Voix**). Cette page comporte trois parties.

### Dictée

**[Dictée](/settings?s=voice&find=Dictation)** indique d’abord ce que ce navigateur sait faire :

- Un navigateur qui reconnaît lui-même la parole affiche vos mots pendant que vous parlez. Il peut envoyer votre voix à son éditeur pour cela (Chrome à Google, Safari à Apple). Pour garder votre voix sur votre machine, activez whisper.cpp plus bas et choisissez le serveur.
- Un navigateur qui ne sait pas reconnaître la parole lui-même dicte par l’intermédiaire du serveur, une fois la reconnaissance vocale activée sur le serveur.

Ensuite :

- **[Langue que vous parlez](/settings?s=voice&find=Language%20you%20speak)** : **Comme ce navigateur**, ou l’une des 56 langues et régions proposées. La dictée l’écoute, et le mode mains libres parle et écoute dans cette langue.
- **Reconnaître avec** : **Ce navigateur** (les mots s’affichent pendant que vous parlez) ou **Le serveur** (confidentiel avec whisper.cpp ; les mots arrivent quand vous vous arrêtez). Ce choix n’apparaît que si les deux sont possibles.

La langue et **Reconnaître avec** sont conservées dans ce navigateur : chacun de vos appareils a donc les siennes.

### Reconnaissance vocale sur le serveur

**[Reconnaissance vocale sur le serveur](/settings?s=voice&find=Speech%20recognition%20on%20the%20server)** s’adresse aux navigateurs qui ne savent pas reconnaître la parole eux-mêmes, ou à celles et ceux qui veulent garder leur voix sur leur machine. Elle est désactivée tant que vous ne l’activez pas, et rien n’est téléchargé auparavant. Elle se règle une seule fois pour l’app, sur tous les appareils. Sous **Où elle s’exécute**, choisissez l’une des trois options :

- **Désactivé**.
- **Sur cette machine** : whisper.cpp s’exécute sur l’ordinateur qui fait tourner Hydor, sur son GPU s’il en a un que whisper.cpp sait utiliser (celui d’un Mac, ou un GPU NVIDIA), sinon sur son processeur, et votre voix reste sur place.
  - **Modèle** : **Minuscule** (74 Mo ; le plus rapide, il comprend de travers un mot de temps en temps), **Base** (141 Mo ; rapide et suffisant pour la plupart des dictées, c’est le choix par défaut), **Petit** (465 Mo ; comprend mieux, quelques secondes par phrase sur un processeur) ou **Moyen** (1,4 Go ; comprend le mieux, lent sans processeur rapide).
  - **Langues** : **Toutes les langues** (il suit la langue que vous parlez) ou **Anglais uniquement** (un peu plus précis en anglais).
  - **Activer · télécharger …** indique la quantité téléchargée : le modèle, et whisper.cpp lui-même la première fois (quand tout est déjà là, choisir **Sur cette machine** l’active aussitôt). Une barre montre le téléchargement ; **Annuler** l’interrompt et désactive la reconnaissance vocale sur le serveur. Sous Linux, l’app télécharge une version de whisper.cpp déjà compilée, qui s’exécute sur le processeur ; sur un Mac, et là où la version prête à l’emploi ne fonctionne pas, elle compile whisper.cpp sur cet ordinateur, ce qui demande un compilateur C++ et CMake (sous Debian ou Ubuntu : `sudo apt install build-essential cmake` ; sur un Mac : `xcode-select --install`, puis `brew install cmake`). Sur un Mac, la compilation vise le GPU du Mac (Metal). Un whisper.cpp que vous avez vous-même installé sur l’ordinateur (compilé pour votre GPU, par exemple) est utilisé tel quel.
  - **Un GPU NVIDIA** sous Linux : whisper.cpp n’a pas de version prête à l’emploi pour lui. Une fois la dictée fonctionnelle sur le processeur, l’app en compile donc une pour le GPU en arrière-plan, avec le kit CUDA de NVIDIA (`nvcc`). Une barre indique l’avancement (cela prend de 5 à 20 minutes) ; la dictée fonctionne entre-temps sur le processeur, puis sur le GPU. Sans ce kit, une note le signale, avec **Vérifier à nouveau** pour quand vous l’aurez installé ; si la compilation échoue, la raison s’affiche avec **Réessayer**, et la dictée reste sur le processeur.
  - Quand c’est prêt : « Prêt : whisper.cpp … avec le modèle Base. Votre voix reste ici. », et en dessous, ce sur quoi il s’exécute, tel que whisper.cpp l’a indiqué lors de sa dernière exécution (il essaie une seconde de silence dès qu’il est prêt) : « Il s’exécute sur le GPU : Apple M2 Pro (Metal). » ou « Il s’exécute sur le processeur de cette machine. » Si le GPU échoue (mémoire saturée, par exemple), cet enregistrement est traité sur le processeur, la note en donne la raison, et le GPU est de nouveau essayé quelques minutes plus tard. **Tester** vérifie qu’il répond et à quelle vitesse. Si quelque chose a échoué, la raison s’affiche avec **Réessayer**.
  - Choisir un autre modèle alors que la reconnaissance est activée télécharge ce modèle.
- **Un service** : n’importe quel service doté de l’adresse de reconnaissance vocale d’OpenAI (`/audio/transcriptions`) : OpenAI lui-même, ou un serveur de votre réseau (Speaches, LocalAI, le serveur de whisper.cpp, un serveur doté d’un GPU). Les enregistrements lui sont envoyés.
  - **Configuration** (puis **Modifier**) sur la ligne du service ouvre un formulaire : **Adresse** (comme `https://api.openai.com/v1`), **Clé d’API** (la plupart des serveurs de votre réseau n’en demandent aucune) et **Modèle** (`whisper-1` sauf si vous en indiquez un autre).
  - **Enregistrer et activer** (puis **Enregistrer**) ; **Tester** sur sa ligne une fois activé ; et **Retirer la clé** dans son menu **⋯** une fois une clé enregistrée. Une fois un service enregistré, choisir de nouveau **Un service** bascule aussitôt vers lui.

Un groupe, **Sur cette machine**, avec sa taille totale, liste ce que whisper.cpp a laissé sur cet ordinateur : whisper.cpp lui-même (« compilé ici pour Metal » ou « pour CUDA » quand l’app l’a compilé pour un GPU) et chaque modèle avec sa taille, celui utilisé étant marqué « utilisé ». Le menu **⋯** d’un modèle propose **Retirer** (retirer celui qui est utilisé désactive la reconnaissance vocale sur le serveur, après confirmation). **Tout retirer**, dans le menu **⋯** du groupe lui-même, retire whisper.cpp et ses modèles ; il apparaît quand la reconnaissance vocale sur le serveur est désactivée ou utilise un service.

### Lecture à voix haute

**[Lecture à voix haute](/settings?s=voice&find=Read%20aloud)** : le haut-parleur sur une réponse vous la lit, en omettant son code. Chaque navigateur garde sa propre voix et sa propre vitesse (le (i) du groupe le précise).

- **Voix** : **Automatique** (la voix du navigateur pour la langue que vous parlez), ou n’importe quelle voix de ce navigateur, celles de votre langue en premier. Chacune indique sa langue, et « en ligne » quand elle nécessite internet.
- **Vitesse** : de 0,5× à 2×.
- **Essayer** : **Écouter un échantillon** lit une phrase avec cette voix et cette vitesse.

Si le navigateur ne sait pas lire du texte à voix haute, la section l’indique.

## Faire lire une réponse à voix haute

1. Pointez une réponse : un haut-parleur apparaît en haut à droite, à côté du bouton de copie.
2. Cliquez dessus. Une barre au-dessus de la zone de message affiche **Lecture à voix haute**, la partie en cours sur le nombre total, et les premiers mots de la réponse.
3. Mettez en pause et reprenez depuis la barre, ou arrêtez-la à cet endroit ou avec le haut-parleur.

La réponse est lue comme du texte simple : le code est omis, les liens sont lus par leurs mots, les adresses web par leur site, et les tableaux ligne par ligne. Lancer la lecture d’une autre réponse interrompt la première, et quitter la conversation l’arrête. Le haut-parleur apparaît quand vous pointez avec une souris ; sur un téléphone, le mode mains libres vous lit les réponses (« Lis-moi la réponse »).

## Parler à l’app en mains libres

Le mode mains libres sert quand vous ne pouvez pas regarder l’écran, par exemple en marchant : vous parlez, l’app agit et vous dit ce qu’elle a fait, puis elle écoute de nouveau. Elle démarre des sessions, leur transmet vos paroles, dit où elles en sont, répond à leurs demandes d’approbation et vous lit leurs résultats.

### Le démarrer et y mettre fin

- Dans une session, le bouton du casque dans la zone de message (**Mains libres**, à côté du microphone) l’ouvre, en suivant cette session.
- Sur la page de démarrage, le même bouton l’ouvre sans suivre de session en particulier.
- Dans la zone de recherche (Ctrl+K, ⌘K sur un Mac), l’action **Parler en mains libres** l’ouvre aussi.

Il occupe tout l’écran, dit « Je vous écoute », et demande à l’appareil de garder l’écran allumé tant qu’il est ouvert. En haut, vous voyez la session qu’il suit (ou « Parler à Hydor »). Le grand bouton rond indique ce qu’il fait : **Écoute…**, **Travail en cours…**, **Parole** ou **En pause : touchez pour écouter**. En dessous, vous voyez ce qu’il a entendu, entre guillemets, et sa réponse.

- Touchez le bouton rond pendant qu’il parle pour l’interrompre ; touchez-le à d’autres moments pour mettre en pause ou continuer d’écouter.
- Pour y mettre fin, dites « Au revoir » (ou « Salut », « C’est tout », « Arrête d’écouter », « Termine les mains libres », « Quitter »), ou touchez la croix en haut à droite.

### Ce que vous pouvez dire

- **Démarrer une session** : « Démarre une session pour planifier mon week-end en Crète ». Elle démarre comme depuis la page de démarrage : avec le programme, le modèle, l’effort, les autorisations, l’agent et le projet que vous y avez choisis en dernier, dans un nouveau dossier de tâche (ou dans le dossier que vous y avez choisi en dernier). Dès lors, il suit cette session.
- **Dire quelque chose à une session** : « Dis-lui d’utiliser les unités métriques ». Vos paroles sont transmises à la session qu’il suit, comme votre message.
- **Demander où en sont les choses** : « Où en sont mes sessions ? ». Il dit ce qui est en cours, ce qui a besoin de vous et ce qu’il demande, et ce qui s’est terminé récemment.
- **Entendre le résultat** : « Lis-moi la réponse ». Il énonce la dernière réponse de la session qu’il suit (ou, s’il n’en suit aucune, de la session la plus active ou la plus récente). Une longue réponse est donnée en résumé, en trois à cinq phrases ; quand l’app est affichée dans une autre langue que l’anglais, toute réponse est donnée en résumé dans cette langue.
- **Répondre à une demande d’approbation** : « Approuve » ou « Refuse », quand la session qu’il suit (ou, s’il n’en suit aucune, n’importe quelle session) attend un simple oui ou non. Une question, un plan ou un formulaire doivent être traités à l’écran, et il vous le dit.
- **Arrêter le travail** : « Stop » arrête ce que fait la session qu’il suit (cela ne met pas fin au mode mains libres).
- **Basculer** : nommez une autre session (« Parlons du voyage en Crète ») et il suit celle-là.
- Posez une question sur l’app, ou sur autre chose : il répond brièvement, ou vous interroge en retour s’il n’est pas sûr.

### Ce qu’il vous dit de lui-même

- Quand la session qu’il suit se termine : « … est terminée. Dites “lis-moi la réponse” pour l’entendre. »
- Quand une session a besoin de vous : « … a besoin de vous : … », puis « Dites approuve ou refuse » pour un simple oui ou non, ou « Répondez à l’écran ». Il suit alors cette session, de sorte que « Approuve » y répond.
- Quand une session s’arrête sur une erreur : « … s’est arrêtée sur une erreur. »

Il cesse d’écouter pour dire ces messages, puis écoute de nouveau. Les sessions de vos autres machines ne sont pas annoncées.

### Bon à savoir

- Le modèle d’appoint comprend ce que vous dites ([Paramètres → Agents → Modèles → Modèle d’appoint](/settings?s=models&find=Helper%20model)). S’il est inaccessible, les mots simples fonctionnent toujours : « état », « approuve » ou « oui », « refuse » ou « non », « stop », « lis », « démarre … » ; tout le reste est transmis à la session qu’il suit, ou démarre une nouvelle session s’il n’en suit aucune.
- Il répond dans la langue d’affichage de l’app (Paramètres → Général → Langue), et écoute dans la langue que vous parlez (Paramètres → Voix), sinon dans celle de l’app.
- Il parle avec la voix et la vitesse définies dans [Lecture à voix haute](/guide/documents-voice#read-aloud).
- Il lui faut un navigateur capable de lire à voix haute, et un moyen d’écouter : la reconnaissance vocale du navigateur (Chrome, Edge, Safari), ou la reconnaissance vocale sur le serveur. Le casque n’apparaît que là où cela peut fonctionner. Avec le serveur, chaque phrase se termine après une seconde et demie de silence (une demi-minute au maximum), et il se remet à écouter après 15 secondes de silence.
- Si le microphone n’est pas autorisé ou n’existe pas, il le dit une fois et se met en pause : autorisez-le dans le navigateur, puis touchez pour écouter.

## Demander à un agent

- « Remplis le formulaire ~/Downloads/visa-application.pdf avec mes informations de mon profil, et demande-moi le reste. »
- « Écris la date du jour et mon nom sur les lignes de ~/Documents/permission-slip.pdf, et coche Oui. »
- « Extrais les pages 3 à 5 de ~/Documents/contract.pdf dans un fichier à part. »
- « Active les suggestions de mots, et préviens-moi quand elles sont prêtes. »
- « Fais en sorte que les suggestions de mots n’affichent que celles dont tu es le plus sûr, et pas le mot suivant. »
- « Empêche les suggestions de mots d’apprendre à partir des réponses des agents, et fais-les apprendre uniquement quand je le demande. »
- « Le modèle de langage tourne-t-il pour les suggestions de mots ? Sinon, pourquoi ? »
- « Désactive les suggestions de mots dans ce navigateur uniquement. »
- « Active la reconnaissance vocale sur cet ordinateur, avec le modèle Petit. »
- « Utilise mon serveur de reconnaissance vocale à l’adresse http://192.168.1.20:8000/v1 pour la dictée, avec le modèle whisper-large-v3. »
- « Quels modèles whisper se trouvent sur cet ordinateur, et quelle place prennent-ils ? Retire ceux qui ne sont pas utilisés. »
- « La dictée s’exécute-t-elle sur mon GPU ? Sinon, pourquoi ? »
- « Quels modèles d’image les agents utilisent-ils actuellement pour la plupart des images et pour les images simples, et combien coûte à peu près une image avec chacun ? »
- « Remplace le modèle d’image pour la plupart des images par le moins cher de ceux qui savent retoucher des images. »
- « Utilise Recraft V4.1 Flash pour les images simples. »
- « Configure les outils d’image sur cet ordinateur. »
- « Les outils d’image s’exécutent-ils sur la carte graphique de cet ordinateur ? Si l’un s’exécute sur le processeur, pourquoi ? »
- « Crée une icône plate de vélo en #0f766e et #f59e0b, sous forme de dessin qui reste net. »
- « Trace ~/data/sales.csv en barres mensuelles, 2025 contre 2026, et indique la hausse du printemps. »
- « Trouve trois photos libres de droits des tramways de Lisbonne pour mes diapositives de voyage, avec leurs crédits. »
- « Retire l’arrière-plan de ~/Pictures/mug.jpg. »
- « Efface l’homme à gauche de beach.jpg ; si le résultat est baveux, fais-le faire par un modèle d’image. »
- « Recadre ~/Pictures/team.jpg en 16:9, éclaircis-la un peu et floute les visages à l’arrière-plan. »
- « Coupe demo.mp4 pour garder la partie de 0:12 à 0:40, ajoute « Notre nouvelle app » au début, et fais-en aussi un GIF. »
- « Retire les euh et les longues pauses de interview.m4a, réduis son souffle de fond et mets-le au volume d’un podcast. »
- « Empêche les agents de créer des images. »
- « Quels modèles vidéo produisent du son, et combien coûte une seconde avec chacun ? »
- « Fais utiliser Kling aux agents pour les vidéos. »
- « Empêche les agents de créer des vidéos. »
- « Quel modèle de musique les agents utilisent-ils, et combien coûte une chanson ? »
- « Utilise ElevenLabs v3 pour les voix off, avec la voix George. »
- « Empêche les agents de créer de l’audio. »
