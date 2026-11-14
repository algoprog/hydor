// Answer UIs for learning: quizzes, practice problems, flashcards, worked solutions, explainers, vocabulary, translations, papers, network graphs…
import type { AnswerUiSpec } from './types.ts';

export const LEARN: AnswerUiSpec[] = [
  {
    id: 'quiz',
    title: 'Quiz',
    group: 'learn',
    use: 'Multiple-choice questions answered in place, with instant feedback, explanations and a score the user can send back.',
    keywords: 'quiz test questions multiple choice practice exam check understanding trivia self-test study',
    shape: `{
  title?: string
  questions: {
    q: md
    options: md[]              // 2 to 6
    answer: number | number[]  // the right option's index from 0 (several when more than one is right)
    explain?: md               // shown once answered
    image?: image
  }[]
  mode?: "one" | "all"         // one question at a time (the default) or all at once
}`,
    example: {
      title: 'The Solar System',
      questions: [
        { q: 'Which planet has the shortest day?', options: ['Mercury', 'Earth', 'Jupiter', 'Neptune'], answer: 2, explain: 'Jupiter turns once in about **9 h 56 min**, despite being the largest planet.' },
        { q: 'What makes Mars look red?', options: ['Iron oxide in its dust', 'Its thin atmosphere', 'Light from the Sun scattering', 'Ice on its surface'], answer: 0, explain: 'Its soil and dust are rich in iron oxide: rust.' },
        { q: 'Which of these moons have an ocean of liquid water under their ice?', options: ['Europa', 'Io', 'Enceladus', 'Phobos'], answer: [0, 2], explain: 'Europa and Enceladus both hide salty oceans; Enceladus sprays some of its water into space.' },
        { q: 'How long does sunlight take to reach Earth?', options: ['8 seconds', 'About 8 minutes', 'About 8 hours', 'A day'], answer: 1, explain: 'At $1\\,\\text{AU} \\approx 1.5\\times10^{8}$ km, light needs about **8 min 20 s**.' },
      ],
    },
  },
  {
    id: 'flashcards',
    title: 'Flashcards',
    group: 'learn',
    use: 'A deck to study: flip each card, go back and forth or shuffle, and mark it known or to see again; progress is kept.',
    keywords: 'flashcards cards deck study memorize revise review flip front back terms definitions spaced repetition practice',
    shape: `{
  title?: string
  cards: {
    front: md                  // the prompt: a term, a question
    back: md                   // the answer
    hint?: md                  // offered before the card is flipped
    image?: image              // shown on the front
  }[]
}`,
    example: {
      title: 'Ranking and evaluation in IR',
      cards: [
        { front: '**Precision@k**', back: 'The share of the top $k$ results that are relevant:\n\n$$P@k = \\frac{\\text{relevant results in the top } k}{k}$$', hint: 'It looks only at the first page of results.' },
        { front: '**Recall@k**', back: 'The share of *all* the relevant documents that make it into the top $k$:\n\n$$R@k = \\frac{\\text{relevant results in the top } k}{\\text{relevant documents in all}}$$', hint: 'It needs to know how many relevant documents there are.' },
        { front: '**MRR**, mean reciprocal rank', back: 'The mean, over queries, of $1/\\text{rank}$ of the first relevant result: a first hit at rank 3 scores $\\tfrac{1}{3}$.', hint: 'Only the first relevant result counts.' },
        { front: '**nDCG@k**', back: 'Each result’s gain, discounted by its rank and summed, then divided by the same sum for the ideal order:\n\n$$\\text{DCG@}k = \\sum_{i=1}^{k} \\frac{2^{rel_i}-1}{\\log_2(i+1)}$$', hint: 'It takes graded labels (0 to 3), not just relevant or not.' },
        { front: '**MAP**, mean average precision', back: 'For each query, the precision at every rank where a relevant document appears, averaged; then the mean over all queries.', hint: 'It rewards putting every relevant document early.' },
        { front: 'What do BM25’s $k_1$ and $b$ control?', back: '$k_1$ (about 0.9 to 1.2) caps how much a repeated term adds; $b$ (about 0.75) sets how strongly long documents are normalised.', hint: 'One saturates term frequency, the other normalises length.' },
      ],
    },
  },
  {
    id: 'solution',
    title: 'Worked solution',
    group: 'learn',
    use: 'A problem solved step by step, with the working in maths, revealed one step at a time or all at once, and the answer boxed.',
    keywords: 'solution solve worked example step by step math physics homework equation derivation proof answer show working',
    shape: `{
  problem: md
  given?: md[]                 // what is known
  find?: md                    // what is asked for
  steps: {
    text: md                   // what the step does, in words
    math?: string              // its working in LaTeX, without $ around it: shown as display maths
    note?: md                  // an aside: why it works, a common slip
  }[]
  answer: md                   // shown boxed after the last step
  check?: md                   // how to confirm the answer
  reveal?: "all" | "steps"     // all at once (the default), or one step at a time for practice
}`,
    example: {
      problem: 'A ball is thrown straight up at $20\\ \\text{m/s}$ from the edge of a cliff $15\\ \\text{m}$ above the sea. When does it hit the water? Ignore air resistance.',
      given: ['$v_0 = 20\\ \\text{m/s}$, upwards', '$h_0 = 15\\ \\text{m}$ above the water', '$g = 9.8\\ \\text{m/s}^2$, downwards'],
      find: 'The time $t$ at which the height is $0$.',
      steps: [
        { text: 'Write the height over time, taking up as positive.', math: 'h(t) = h_0 + v_0 t - \\tfrac{1}{2} g t^2' },
        { text: 'Put in the numbers and set the height to zero, the water.', math: '15 + 20t - 4.9t^2 = 0' },
        { text: 'Rearrange into the form $at^2 + bt + c = 0$.', math: '4.9t^2 - 20t - 15 = 0' },
        { text: 'Solve it with the quadratic formula.', math: 't = \\frac{20 \\pm \\sqrt{20^2 + 4 \\cdot 4.9 \\cdot 15}}{2 \\cdot 4.9} = \\frac{20 \\pm \\sqrt{694}}{9.8}' },
        { text: 'Keep the positive root.', math: 't = \\frac{20 + 26.34}{9.8} \\approx 4.73\\ \\text{s}', note: 'The other root, $t \\approx -0.65$ s, is a moment before the throw: where the same arc would have started from the water.' },
      ],
      answer: 'The ball hits the water about **4.73 s** after the throw.',
      check: 'At $t = 4.73$: $15 + 20(4.73) - 4.9(4.73)^2 = 15 + 94.6 - 109.6 \\approx 0$.',
    },
  },
  {
    id: 'explainer',
    title: 'Explainer',
    group: 'learn',
    use: 'One idea explained at several depths, from a child’s level to an expert’s, switched with a tap, with an analogy and key terms.',
    keywords: 'explain eli5 simple expert levels concept how it works why analogy key terms intuition depth beginner',
    shape: `{
  topic: string                // the idea, as a question or a name
  image?: image                // a picture or diagram of it
  levels: { label: string, text: md }[]   // the same idea from simplest to deepest, 2 to 4 ("Like I'm 10", "Simple", "Expert")
  analogy?: md
  key_terms?: { term: string, meaning: md }[]
}`,
    example: {
      topic: 'Why is the sky blue?',
      image: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Rayleigh_sunlight_scattering.png',
      levels: [
        { label: 'Like I’m 10', text: 'Sunlight looks white, but it is all the colours mixed together. When it comes into the air, the tiny bits of air bounce the blue light around much more than the red, so blue light ends up coming at you from every part of the sky.' },
        { label: 'Simple', text: 'Air molecules are far smaller than the wavelength of light, and they scatter short wavelengths much more strongly than long ones: blue light (about 450 nm) about **six times** more than red (about 700 nm). Wherever you look away from the Sun, you see that scattered blue. At sunset the light crosses so much air that most of the blue is scattered away before it reaches you, leaving the reds and oranges.' },
        { label: 'Expert', text: 'For particles much smaller than the wavelength (Rayleigh scattering), each molecule acts as an induced dipole radiating with power $\\propto \\omega^4$, so the scattering cross-section goes as $\\sigma \\propto 1/\\lambda^4$. The sky is not violet because sunlight holds less violet than blue, ozone absorbs some of it, and our cones respond weakly to it: the scattered spectrum, weighted by the eye’s response, reads as sky blue. The scattered light is also partly polarised, most strongly at 90° from the Sun.' },
      ],
      analogy: 'Think of a thin post standing in a pond: long, rolling swells pass it by, but short ripples hit it and spread out in every direction. Blue light is the ripples.',
      key_terms: [
        { term: 'Rayleigh scattering', meaning: 'Light scattered by particles much smaller than its wavelength; its strength grows as $1/\\lambda^4$.' },
        { term: 'Wavelength', meaning: 'The distance from one wave crest to the next: about 450 nm for blue light and 700 nm for red.' },
        { term: 'Mie scattering', meaning: 'Scattering by larger particles such as cloud droplets, which treats all colours alike: why clouds are white.' },
      ],
    },
  },
  {
    id: 'vocabulary',
    title: 'Vocabulary',
    group: 'learn',
    use: 'Words of another language with meanings, sounds and example sentences read aloud, and a practice mode that hides the meanings until tapped.',
    keywords: 'vocabulary words phrases language learning meaning pronunciation listen speak practice japanese greek spanish',
    shape: `{
  title?: string
  language?: string            // the words' language as a code ("el", "ja", "es"): the listen buttons speak it
  words: {
    word: string
    translation: string        // its meaning in the user's language
    phonetic?: string          // how it sounds: IPA, romaji, pinyin
    pos?: string               // "noun", "verb", "phrase"
    example?: string           // a sentence using it, in the language
    example_translation?: string
    image?: image
  }[]
}`,
    example: {
      title: 'Japanese for eating out',
      language: 'ja',
      words: [
        { word: 'すみません', phonetic: 'sumimasen', pos: 'phrase', translation: 'excuse me (to call the staff)', example: 'すみません、メニューをください。', example_translation: 'Excuse me, could I have the menu?' },
        { word: 'お水', phonetic: 'おみず · omizu', pos: 'noun', translation: 'water', example: 'お水を二つお願いします。', example_translation: 'Two glasses of water, please.' },
        { word: 'おすすめ', phonetic: 'osusume', pos: 'noun', translation: 'recommendation', example: 'おすすめは何ですか？', example_translation: 'What do you recommend?' },
        { word: '美味しい', phonetic: 'おいしい · oishii', pos: 'adjective', translation: 'delicious', example: 'このラーメン、とても美味しいです。', example_translation: 'This ramen is really good.' },
        { word: 'お会計', phonetic: 'おかいけい · okaikei', pos: 'noun', translation: 'the bill', example: 'お会計をお願いします。', example_translation: 'The bill, please.' },
        { word: 'いただきます', phonetic: 'itadakimasu', pos: 'phrase', translation: 'said before eating: “I gratefully receive”', example: 'では、いただきます！', example_translation: 'Well then, let’s eat!' },
        { word: 'ごちそうさまでした', phonetic: 'gochisōsama deshita', pos: 'phrase', translation: 'said after eating: “thank you for the meal”', example: 'ごちそうさまでした。美味しかったです。', example_translation: 'Thank you for the meal. It was delicious.' },
      ],
    },
  },
  {
    id: 'translation',
    title: 'Translation',
    group: 'learn',
    use: 'A text and its translation side by side, each read aloud or copied, with a word-for-word version, other ways to say it and notes.',
    keywords: 'translate translation language how do you say meaning literal word for word formal informal phrasing interpret',
    shape: `{
  from: string                 // the source language: a code ("en") or a name ("English")
  to: string                   // the target language, the same way
  source: string               // the text as given
  translation: string
  literal?: string             // word for word, when it differs much
  alternatives?: { text: string, note?: md }[]   // other ways to say it
  notes?: md[]                 // grammar, culture, false friends
  formality?: string           // "Formal", "Casual", "Polite"
}`,
    example: {
      from: 'en',
      to: 'el',
      source: 'Could you tell me where the nearest pharmacy is? I need something for a headache.',
      translation: 'Θα μπορούσατε να μου πείτε πού είναι το πλησιέστερο φαρμακείο; Χρειάζομαι κάτι για τον πονοκέφαλο.',
      literal: 'Would you be able to tell me where is the nearest pharmacy? I need something for the headache.',
      formality: 'Polite (plural you)',
      alternatives: [
        { text: 'Μπορείτε να μου πείτε πού είναι το πιο κοντινό φαρμακείο;', note: 'Still polite, a little plainer: *μπορείτε* is “can you” rather than “could you”.' },
        { text: 'Πού είναι το πιο κοντινό φαρμακείο;', note: 'Just “Where is the nearest pharmacy?”: fine with a *παρακαλώ* (please).' },
        { text: 'Ξέρεις πού έχει φαρμακείο εδώ κοντά;', note: 'Casual, to a friend: “Do you know where there’s a pharmacy around here?”' },
      ],
      notes: [
        'Greek writes its question mark as **;**, which looks like an English semicolon.',
        'A green cross marks a pharmacy (*φαρμακείο*); at night, each one’s door lists the nearby *εφημερεύον*, the one on duty.',
      ],
    },
  },
  {
    id: 'paper',
    title: 'Research papers',
    group: 'learn',
    use: 'Research papers as cards: authors, venue, citations, a one-line summary and findings, the abstract to unfold, PDF and code links, and BibTeX to copy.',
    keywords: 'paper papers research article publication arxiv citations bibtex abstract literature review related work scholar',
    shape: `{
  title?: string
  papers: {
    title: string
    authors?: string[]
    venue?: string             // "SIGIR", "NeurIPS"
    year?: number
    url?: url                  // its page: arXiv, ACL Anthology, a DOI
    pdf?: url
    code?: url
    citations?: number
    tldr?: md                  // the paper in a sentence
    findings?: md[]            // its main results, 2 to 4
    tags?: string[]
    abstract?: md              // folded until opened
    bibtex?: string
  }[]
}`,
    example: {
      title: 'First-stage neural retrieval: four papers to start with',
      papers: [
        {
          title: 'Dense Passage Retrieval for Open-Domain Question Answering',
          authors: ['Vladimir Karpukhin', 'Barlas Oğuz', 'Sewon Min', 'Patrick Lewis', 'Ledell Wu', 'Sergey Edunov', 'Danqi Chen', 'Wen-tau Yih'],
          venue: 'EMNLP',
          year: 2020,
          url: 'https://arxiv.org/abs/2004.04906',
          pdf: 'https://arxiv.org/pdf/2004.04906',
          code: 'https://github.com/facebookresearch/DPR',
          citations: 7815,
          tldr: 'Two BERT encoders, one for questions and one for passages, trained with in-batch negatives, retrieve better than BM25 for open-domain QA.',
          findings: ['Top-20 retrieval accuracy 9 to 19 points above Lucene BM25 across open-domain QA sets', 'A few thousand question–passage pairs are enough to train it', 'Better retrieval lifts end-to-end QA to the state of the art on several benchmarks'],
          tags: ['Dense retrieval', 'Bi-encoder', 'Open-domain QA'],
          abstract: 'Open-domain question answering relies on efficient passage retrieval to select candidate contexts, where traditional sparse vector space models, such as TF-IDF or BM25, are the de facto method. In this work, we show that retrieval can be practically implemented using dense representations alone, where embeddings are learned from a small number of questions and passages by a simple dual-encoder framework. When evaluated on a wide range of open-domain QA datasets, our dense retriever outperforms a strong Lucene-BM25 system largely by 9%-19% absolute in terms of top-20 passage retrieval accuracy, and helps our end-to-end QA system establish new state-of-the-art on multiple open-domain QA benchmarks.',
          bibtex: '@inproceedings{karpukhin-etal-2020-dense,\n  title = {Dense Passage Retrieval for Open-Domain Question Answering},\n  author = {Karpukhin, Vladimir and O{\\u{g}}uz, Barlas and Min, Sewon and Lewis, Patrick and Wu, Ledell and Edunov, Sergey and Chen, Danqi and Yih, Wen-tau},\n  booktitle = {Proceedings of the 2020 Conference on Empirical Methods in Natural Language Processing (EMNLP)},\n  pages = {6769--6781},\n  year = {2020},\n  publisher = {Association for Computational Linguistics},\n  doi = {10.18653/v1/2020.emnlp-main.550}\n}',
        },
        {
          title: 'ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT',
          authors: ['Omar Khattab', 'Matei Zaharia'],
          venue: 'SIGIR',
          year: 2020,
          url: 'https://arxiv.org/abs/2004.12832',
          pdf: 'https://arxiv.org/pdf/2004.12832',
          code: 'https://github.com/stanford-futuredata/ColBERT',
          citations: 2849,
          tldr: 'Late interaction: query and passage are encoded apart, token by token, and scored by each query token’s best match (MaxSim), so passages are indexed ahead of time.',
          findings: ['As effective as BERT re-rankers on MS MARCO, at two orders of magnitude less latency', 'Four orders of magnitude fewer FLOPs per query', 'Retrieves end to end from a vector index, not only re-ranks'],
          tags: ['Late interaction', 'Multi-vector', 'BERT'],
          bibtex: '@inproceedings{khattab2020colbert,\n  title = {ColBERT: Efficient and Effective Passage Search via Contextualized Late Interaction over BERT},\n  author = {Khattab, Omar and Zaharia, Matei},\n  booktitle = {Proceedings of the 43rd International ACM SIGIR Conference on Research and Development in Information Retrieval},\n  pages = {39--48},\n  year = {2020},\n  publisher = {ACM},\n  doi = {10.1145/3397271.3401075}\n}',
        },
        {
          title: 'SPLADE: Sparse Lexical and Expansion Model for First Stage Ranking',
          authors: ['Thibault Formal', 'Benjamin Piwowarski', 'Stéphane Clinchant'],
          venue: 'SIGIR',
          year: 2021,
          url: 'https://arxiv.org/abs/2107.05720',
          pdf: 'https://arxiv.org/pdf/2107.05720',
          code: 'https://github.com/naver/splade',
          citations: 798,
          tldr: 'BERT’s masked-language-model head turned into sparse, expanded term weights, trained with a sparsity penalty, so retrieval runs on an inverted index.',
          findings: ['Competitive with dense retrievers while keeping exact term matching', 'One regularisation weight trades effectiveness for speed', 'Trained end to end, in a single stage'],
          tags: ['Learned sparse', 'Inverted index', 'Expansion'],
          abstract: 'In neural Information Retrieval, ongoing research is directed towards improving the first retriever in ranking pipelines. Learning dense embeddings to conduct retrieval using efficient approximate nearest neighbors methods has proven to work well. Meanwhile, there has been a growing interest in learning sparse representations for documents and queries, that could inherit from the desirable properties of bag-of-words models such as the exact matching of terms and the efficiency of inverted indexes. In this work, we present a new first-stage ranker based on explicit sparsity regularization and a log-saturation effect on term weights, leading to highly sparse representations and competitive results with respect to state-of-the-art dense and sparse methods. Our approach is simple, trained end-to-end in a single stage. We also explore the trade-off between effectiveness and efficiency, by controlling the contribution of the sparsity regularization.',
          bibtex: '@inproceedings{formal2021splade,\n  title = {SPLADE: Sparse Lexical and Expansion Model for First Stage Ranking},\n  author = {Formal, Thibault and Piwowarski, Benjamin and Clinchant, St{\\\'e}phane},\n  booktitle = {Proceedings of the 44th International ACM SIGIR Conference on Research and Development in Information Retrieval},\n  pages = {2288--2292},\n  year = {2021},\n  publisher = {ACM},\n  doi = {10.1145/3404835.3463098}\n}',
        },
        {
          title: 'BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models',
          authors: ['Nandan Thakur', 'Nils Reimers', 'Andreas Rücklé', 'Abhishek Srivastava', 'Iryna Gurevych'],
          venue: 'NeurIPS Datasets and Benchmarks',
          year: 2021,
          url: 'https://arxiv.org/abs/2104.08663',
          pdf: 'https://arxiv.org/pdf/2104.08663',
          code: 'https://github.com/beir-cellar/beir',
          citations: 2266,
          tldr: '18 datasets over 9 tasks that test retrievers zero-shot, outside the domain they were trained on.',
          findings: ['BM25 stays a strong baseline out of domain', 'Re-ranking and late-interaction models generalise best, at a high computational cost', 'Dense retrievers trained on MS MARCO often fall behind BM25 on new domains'],
          tags: ['Benchmark', 'Zero-shot', 'Evaluation'],
          bibtex: '@inproceedings{thakur2021beir,\n  title = {{BEIR}: A Heterogeneous Benchmark for Zero-shot Evaluation of Information Retrieval Models},\n  author = {Thakur, Nandan and Reimers, Nils and R{\\"u}ckl{\\\'e}, Andreas and Srivastava, Abhishek and Gurevych, Iryna},\n  booktitle = {Thirty-fifth Conference on Neural Information Processing Systems Datasets and Benchmarks Track (Round 2)},\n  year = {2021},\n  url = {https://openreview.net/forum?id=wCu6T5xFjeJ}\n}',
        },
      ],
    },
  },
  {
    id: 'tree',
    title: 'Tree',
    group: 'learn',
    use: 'Nested items as an expandable tree: a folder of files with their icons, a numbered outline, an organisation or a map of topics.',
    keywords: 'tree hierarchy file tree folder structure directory project layout outline org chart nested taxonomy topics',
    shape: `{
  title?: string
  kind?: "files" | "org" | "outline" | "topics"   // files: folder and file icons; outline: numbered 1, 1.1…; org: people and roles
  root: Node | Node[]
}
Node = { name: string, note?: md, icon?: string, children?: Node[] }   // icon: one emoji, in place of the kind's own`,
    example: {
      title: 'A layout for the retrieval experiments repository',
      kind: 'files',
      root: {
        name: 'ir-baselines',
        children: [
          { name: 'README.md', note: 'How to run each baseline and rebuild the results table' },
          { name: 'pyproject.toml' },
          { name: 'configs', children: [{ name: 'bm25.yaml' }, { name: 'colbert.yaml' }, { name: 'splade.yaml' }] },
          { name: 'data', note: 'Not in git: `make data` downloads it', children: [{ name: 'msmarco' , children: [] }, { name: 'beir', children: [] }] },
          {
            name: 'src',
            children: [
              {
                name: 'ir_baselines',
                children: [
                  { name: '__init__.py' },
                  { name: 'index.py', note: 'Builds the Lucene and FAISS indexes' },
                  { name: 'retrieve.py', note: 'One entry point for every model' },
                  { name: 'evaluate.py', note: 'nDCG@10, MRR@10 and Recall@1000 with ir_measures' },
                ],
              },
            ],
          },
          { name: 'notebooks', children: [{ name: 'error-analysis.ipynb' }] },
          { name: 'tests', children: [{ name: 'test_evaluate.py' }] },
        ],
      },
    },
  },
  {
    id: 'links',
    title: 'Resources to learn from',
    group: 'learn',
    use: 'Links to learn from, each with its site, kind (course, video, book, docs, repo…), level and whether it is free, filtered by kind.',
    keywords: 'resources links learn tutorials courses books videos documentation reading list where to start study references',
    shape: `{
  title?: string
  links: {
    title: string
    url: url
    description?: md
    kind?: "article" | "video" | "course" | "tool" | "docs" | "book" | "repo" | "paper"
    free?: boolean
    level?: string             // "Beginner", "Intermediate", "Advanced"
  }[]
}`,
    example: {
      title: 'Learning Rust, from first steps to production',
      links: [
        { title: 'The Rust Programming Language', url: 'https://doc.rust-lang.org/book/', kind: 'book', free: true, level: 'Beginner', description: 'The official introduction, from ownership and borrowing to traits and concurrency, with three small projects along the way.' },
        { title: 'Rustlings', url: 'https://github.com/rust-lang/rustlings', kind: 'repo', free: true, level: 'Beginner', description: 'Small programs that will not compile until you fix them, run from your terminal; they follow the book’s chapters.' },
        { title: 'Rust by Example', url: 'https://doc.rust-lang.org/rust-by-example/', kind: 'docs', free: true, level: 'Beginner', description: 'Each feature of the language as a short example you can run and change.' },
        { title: 'Exercism: the Rust track', url: 'https://exercism.org/tracks/rust', kind: 'course', free: true, level: 'All levels', description: 'Exercises with tests, and feedback on your solutions from volunteer mentors.' },
        { title: 'Comprehensive Rust', url: 'https://google.github.io/comprehensive-rust/', kind: 'course', free: true, level: 'Intermediate', description: 'The multi-day course Google’s Android team teaches, as slides with exercises.' },
        { title: 'Crust of Rust', url: 'https://www.youtube.com/@jonhoo', kind: 'video', free: true, level: 'Advanced', description: 'Jon Gjengset’s long live-coding videos on lifetimes, iterators, smart pointers, channels and async.' },
        { title: 'Zero To Production In Rust', url: 'https://www.zero2prod.com/', kind: 'book', free: false, level: 'Intermediate', description: 'Builds a real email-newsletter backend with actix-web, from the first test to deployment.' },
        { title: 'Rust Playground', url: 'https://play.rust-lang.org/', kind: 'tool', free: true, description: 'Run, format and share snippets in the browser, with Clippy one click away.' },
      ],
    },
  },
  {
    id: 'fill-blanks',
    title: 'Fill in the blanks',
    group: 'learn',
    use: 'A cloze exercise: gaps in a text to type in or fill from a word bank, checked in place, with hints, a score and the answers.',
    keywords: 'cloze gaps blanks missing words gap fill word bank complete the sentence worksheet grammar',
    shape: `{
  title?: string
  prompt?: md                  // what to do: "Put the verbs in the past simple."
  text: md                     // the text, each blank written [[answer]], or [[answer|another accepted answer|…]]
  words?: string[]             // a word bank to tap from (shown in alphabetical order): the answers and a few that do not fit
  hints?: md[]                 // shown one at a time, when asked for
}`,
    example: {
      title: 'Photosynthesis',
      prompt: 'Complete the text with words from the list. Three of them are not needed.',
      text: 'Plants make their own food by **photosynthesis**. Inside the [[chloroplasts|chloroplast]] of their leaf cells, a green pigment called [[chlorophyll]] absorbs light energy. That energy turns [[carbon dioxide|CO2|CO₂]] from the air and [[water|H2O|H₂O]] from the soil into [[glucose]], which the plant burns for energy or stores as starch. [[Oxygen|O2|O₂]] is given off as a by-product, through tiny pores in the leaves called [[stomata|stomates]].',
      words: ['chlorophyll', 'chloroplasts', 'carbon dioxide', 'water', 'glucose', 'oxygen', 'stomata', 'nitrogen', 'roots', 'protein'],
      hints: ['The pigment and the part of the cell it sits in both start with *chloro-*, Greek for pale green.', 'The whole reaction: $6\\,\\text{CO}_2 + 6\\,\\text{H}_2\\text{O} \\rightarrow \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\,\\text{O}_2$'],
    },
  },
  {
    id: 'matching',
    title: 'Match the pairs',
    group: 'learn',
    use: 'Pairs to match (terms and meanings, countries and capitals, words and translations): tap one on each side, check, then see the score and answers.',
    keywords: 'match matching pairs connect terms meanings countries capitals words translations draw lines',
    shape: `{
  title?: string
  prompt?: md                  // what to do: "Match each word to its meaning."
  columns?: [string, string]   // headings of the two sides: ["Word", "Meaning"]
  pairs: { left: md, right: md }[]   // each left with its match: the right side is shown shuffled. 3 to 10
}`,
    example: {
      title: 'Greek roots in English',
      prompt: 'Match each root to what it means. Each one hides in hundreds of English words.',
      columns: ['Root', 'Meaning'],
      pairs: [
        { left: '**bio-**, as in *antibiotic*', right: 'life' },
        { left: '**geo-**, as in *geology*', right: 'earth' },
        { left: '**chrono-**, as in *chronic*', right: 'time' },
        { left: '**photo-**, as in *photon*', right: 'light' },
        { left: '**hydro-**, as in *dehydrated*', right: 'water' },
        { left: '**tele-**, as in *telescope*', right: 'far off' },
        { left: '**micro-**, as in *microphone*', right: 'small' },
      ],
    },
  },
  {
    id: 'ordering',
    title: 'Put in order',
    group: 'learn',
    use: 'Things to put in order (steps, events by date, numbers by size): moved up and down or dragged, checked in place, with the right order to show.',
    keywords: 'ordering sequence arrange chronological correct order put in order oldest newest smallest largest first last',
    shape: `{
  title?: string
  prompt?: md                  // what to do: "Put these in the order they happened."
  items: (md | { text: md, note?: md })[]   // in the right order: shown shuffled. 3 to 10. note: shown with the answer (a date, a size)
  ends?: [string, string]      // what the top and the bottom of the list stand for: ["Earliest", "Latest"]
}`,
    example: {
      title: 'Firsts of the space race',
      prompt: 'Put these in the order they happened.',
      ends: ['Earliest', 'Latest'],
      items: [
        { text: '**Sputnik 1**, the first artificial satellite, goes into orbit', note: '4 October 1957: its radio beeped for 21 days' },
        { text: 'The dog **Laika** becomes the first animal to orbit the Earth', note: '3 November 1957, aboard Sputnik 2' },
        { text: '**Explorer 1**, the first American satellite, is launched', note: '31 January 1958: it found the Van Allen radiation belts' },
        { text: '**Yuri Gagarin** becomes the first person in space', note: '12 April 1961: one orbit in 108 minutes' },
        { text: '**Valentina Tereshkova** becomes the first woman in space', note: '16 June 1963: 48 orbits in almost three days' },
        { text: '**Alexei Leonov** makes the first spacewalk', note: '18 March 1965: 12 minutes outside Voskhod 2' },
        { text: '**Apollo 11** lands on the Moon', note: '20 July 1969' },
      ],
    },
  },
  {
    id: 'conjugation',
    title: 'Verb conjugation',
    group: 'learn',
    use: 'A verb’s forms by tense: a tab for each tense, every person’s form read aloud, and a practice mode that hides the forms until tapped.',
    keywords: 'conjugation conjugate verb tenses forms present past future person grammar irregular spanish french german',
    shape: `{
  verb: string                 // as a dictionary gives it: "tener", "être"
  translation?: string         // "to have"
  language?: string            // its language as a code ("es", "fr", "de"): the listen buttons speak it
  kind?: string                // "irregular", "regular -ar verb"
  tenses: {
    name: string               // "Present", "Preterite"
    forms: { person: string, form: string, irregular?: boolean }[]   // irregular: marked so it stands out
  }[]
  notes?: md[]                 // how it is used, stem changes, look-alikes
}`,
    example: {
      verb: 'tener',
      translation: 'to have',
      language: 'es',
      kind: 'irregular',
      tenses: [
        {
          name: 'Present',
          forms: [
            { person: 'yo', form: 'tengo', irregular: true },
            { person: 'tú', form: 'tienes', irregular: true },
            { person: 'él, ella, usted', form: 'tiene', irregular: true },
            { person: 'nosotros, nosotras', form: 'tenemos' },
            { person: 'vosotros, vosotras', form: 'tenéis' },
            { person: 'ellos, ellas, ustedes', form: 'tienen', irregular: true },
          ],
        },
        {
          name: 'Preterite',
          forms: [
            { person: 'yo', form: 'tuve', irregular: true },
            { person: 'tú', form: 'tuviste', irregular: true },
            { person: 'él, ella, usted', form: 'tuvo', irregular: true },
            { person: 'nosotros, nosotras', form: 'tuvimos', irregular: true },
            { person: 'vosotros, vosotras', form: 'tuvisteis', irregular: true },
            { person: 'ellos, ellas, ustedes', form: 'tuvieron', irregular: true },
          ],
        },
        {
          name: 'Imperfect',
          forms: [
            { person: 'yo', form: 'tenía' },
            { person: 'tú', form: 'tenías' },
            { person: 'él, ella, usted', form: 'tenía' },
            { person: 'nosotros, nosotras', form: 'teníamos' },
            { person: 'vosotros, vosotras', form: 'teníais' },
            { person: 'ellos, ellas, ustedes', form: 'tenían' },
          ],
        },
        {
          name: 'Future',
          forms: [
            { person: 'yo', form: 'tendré', irregular: true },
            { person: 'tú', form: 'tendrás', irregular: true },
            { person: 'él, ella, usted', form: 'tendrá', irregular: true },
            { person: 'nosotros, nosotras', form: 'tendremos', irregular: true },
            { person: 'vosotros, vosotras', form: 'tendréis', irregular: true },
            { person: 'ellos, ellas, ustedes', form: 'tendrán', irregular: true },
          ],
        },
      ],
      notes: [
        '**Tener que** + an infinitive means *to have to*: *Tengo que trabajar mañana*, I have to work tomorrow.',
        'Age, hunger and fear take *tener*, not *ser*: *tengo 30 años* (I’m 30), *tengo hambre* (I’m hungry), *tengo miedo* (I’m afraid).',
        'In Latin America, **ustedes** stands in for *vosotros*: *ustedes tienen*.',
      ],
    },
  },
  {
    id: 'dialogue',
    title: 'Dialogue',
    group: 'learn',
    use: 'A conversation as chat bubbles (a language lesson, a script): listen line by line or all in turn, show the translations, or practise one part.',
    keywords: 'dialogue conversation role play roleplay chat bubbles lesson listen speak practise interview scene lines',
    shape: `{
  title?: string
  scene?: md                   // where and who: "Anna orders a coffee in Athens."
  language?: string            // the lines' language as a code ("el", "ja", "es"): the listen buttons speak it
  speakers?: { name: string, side?: "left" | "right" }[]   // the first on the left and the second on the right, unless told
  lines: {
    speaker: string            // a speaker's name
    text: string               // what they say, in the language
    phonetic?: string          // how it sounds: a transliteration, romaji, pinyin
    translation?: string       // in the user's language
    note?: md                  // grammar or culture, under the line
  }[]
}`,
    example: {
      title: 'Ordering a coffee in Greek',
      scene: 'Anna sits down at a *kafeneío* in Plaka, Athens.',
      language: 'el',
      speakers: [
        { name: 'Waiter', side: 'left' },
        { name: 'Anna', side: 'right' },
      ],
      lines: [
        { speaker: 'Waiter', text: 'Καλημέρα! Τι θα πάρετε;', phonetic: 'Kaliméra! Ti tha párete?', translation: 'Good morning! What will you have?', note: 'Greek writes its question mark as **;**' },
        { speaker: 'Anna', text: 'Καλημέρα. Έναν φρέντο εσπρέσο, παρακαλώ.', phonetic: 'Kaliméra. Énan frédo espréso, parakaló.', translation: 'Good morning. A freddo espresso, please.' },
        { speaker: 'Waiter', text: 'Γλυκό, μέτριο ή σκέτο;', phonetic: 'Glikó, métrio i skéto?', translation: 'Sweet, medium or plain?', note: 'Coffee is ordered by its sugar: *σκέτο* none, *μέτριο* a spoonful, *γλυκό* two or more.' },
        { speaker: 'Anna', text: 'Μέτριο. Και ένα νερό, παρακαλώ.', phonetic: 'Métrio. Ke éna neró, parakaló.', translation: 'Medium. And a water, please.' },
        { speaker: 'Waiter', text: 'Αμέσως!', phonetic: 'Amésos!', translation: 'Right away!' },
        { speaker: 'Anna', text: 'Τον λογαριασμό, παρακαλώ.', phonetic: 'Ton logariasmó, parakaló.', translation: 'The bill, please.' },
        { speaker: 'Waiter', text: 'Τέσσερα πενήντα.', phonetic: 'Téssera penínda.', translation: 'Four fifty.' },
        { speaker: 'Anna', text: 'Ορίστε. Ευχαριστώ πολύ!', phonetic: 'Oríste. Efcharistó polí!', translation: 'Here you are. Thank you very much!', note: '*Ορίστε* is *here you are* when you hand something over, and *pardon?* when you did not hear.' },
      ],
    },
  },
  {
    id: 'rubric',
    title: 'Grading rubric',
    group: 'learn',
    use: 'A grading rubric, criteria by levels: the levels given are marked, the weighted score worked out, and the user can pick levels to grade work too.',
    keywords: 'rubric grading marking scheme criteria levels points grade essay assignment teacher self-assessment descriptors',
    shape: `{
  title?: string
  criteria: {
    name: string
    weight?: number            // its points are multiplied by it (1 unless told)
    levels: { label: string, points: number, description: md }[]   // the same labels in each row, best first or worst first
    selected?: number          // the level given, by its index from 0 (left out: not graded yet)
    comment?: md               // why that level
  }[]
  grades?: { min: number, label: string }[]   // a grade by the share of the points, in percent: { min: 90, label: "A" }
}`,
    example: {
      title: 'Persuasive essay: “Should school start later?”',
      criteria: [
        {
          name: 'Thesis and argument',
          weight: 2,
          levels: [
            { label: 'Excellent', points: 4, description: 'A clear, arguable thesis that every paragraph moves forward; objections raised and answered.' },
            { label: 'Good', points: 3, description: 'A clear thesis that most paragraphs support; an objection is mentioned.' },
            { label: 'Developing', points: 2, description: 'The thesis is vague or only stated at the end; the argument drifts.' },
            { label: 'Beginning', points: 1, description: 'No clear position: ideas are listed rather than argued.' },
          ],
          selected: 1,
          comment: 'A strong thesis on later start times; the objection about bus timetables is raised but never answered.',
        },
        {
          name: 'Evidence',
          weight: 2,
          levels: [
            { label: 'Excellent', points: 4, description: 'Specific evidence from credible sources, cited and explained.' },
            { label: 'Good', points: 3, description: 'Relevant evidence, mostly cited; some of it left unexplained.' },
            { label: 'Developing', points: 2, description: 'Little evidence, or general claims without sources.' },
            { label: 'Beginning', points: 1, description: 'Opinion only.' },
          ],
          selected: 0,
          comment: 'The sleep guidance from paediatricians and the Seattle start-time study are used well and explained.',
        },
        {
          name: 'Organisation',
          levels: [
            { label: 'Excellent', points: 4, description: 'A logical order, clear topic sentences and transitions; the conclusion goes beyond a summary.' },
            { label: 'Good', points: 3, description: 'A logical order with topic sentences; some abrupt transitions.' },
            { label: 'Developing', points: 2, description: 'Some order, but paragraphs mix ideas.' },
            { label: 'Beginning', points: 1, description: 'No clear structure.' },
          ],
          selected: 1,
          comment: 'Paragraphs 3 and 4 would read better swapped: costs before benefits.',
        },
        {
          name: 'Style and voice',
          levels: [
            { label: 'Excellent', points: 4, description: 'Confident, varied sentences and precise words, suited to the reader.' },
            { label: 'Good', points: 3, description: 'Clear and readable, with some repetition.' },
            { label: 'Developing', points: 2, description: 'Wordy or flat in places, with informal slips.' },
            { label: 'Beginning', points: 1, description: 'Hard to follow.' },
          ],
          selected: 1,
        },
        {
          name: 'Grammar and spelling',
          levels: [
            { label: 'Excellent', points: 4, description: 'Almost no errors.' },
            { label: 'Good', points: 3, description: 'A few errors that do not get in the way.' },
            { label: 'Developing', points: 2, description: 'Frequent errors that slow the reader down.' },
            { label: 'Beginning', points: 1, description: 'Errors make it hard to read.' },
          ],
          selected: 0,
        },
      ],
      grades: [
        { min: 90, label: 'A' },
        { min: 80, label: 'B' },
        { min: 70, label: 'C' },
        { min: 60, label: 'D' },
        { min: 0, label: 'F' },
      ],
    },
  },
  {
    id: 'chess',
    title: 'Chess board',
    group: 'learn',
    use: 'Chess positions on a board, from FEN: step through the moves with their comments, arrows and marked squares, flip the board, or guess each move.',
    keywords: 'chess board position fen moves game opening puzzle analysis annotated pgn tactics checkmate',
    shape: `{
  title?: string
  event?: string               // where and when: "Paris, 1858"
  white?: string               // the players' names
  black?: string
  orientation?: "white" | "black"   // the side at the bottom (white unless told)
  positions: {
    fen: string                // the position, in FEN
    move?: string              // the move that led to it, as written: "Nf3", "13. Rxd7!", "16...Nxb8"
    comment?: md
    arrows?: { from: string, to: string, color?: "green" | "red" | "blue" | "yellow" }[]   // squares like "e2"
    highlight?: string[]       // squares to mark ("d7"); left out, the squares the move changed are marked
  }[]
}`,
    example: {
      title: 'The Opera Game: Morphy’s finish',
      event: 'Paris, 1858, in a box at the opera',
      white: 'Paul Morphy',
      black: 'Duke Karl and Count Isouard',
      positions: [
        {
          fen: '3rkb1r/p2nqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR3R w k - 3 13',
          move: '12...Rd8',
          comment: 'Morphy is a knight down for two pawns, but every piece of his is in play, while Black’s king is stuck in the middle and the knight on d7 is pinned.',
          arrows: [
            { from: 'b5', to: 'e8', color: 'red' },
            { from: 'd1', to: 'd7', color: 'green' },
          ],
        },
        { fen: '3rkb1r/p2Rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R b k - 0 13', move: '13. Rxd7!', comment: 'A whole rook for a knight, to tear the defence open.' },
        { fen: '4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2K4R w k - 0 14', move: '13...Rxd7' },
        {
          fen: '4kb1r/p2rqppp/5n2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 1 14',
          move: '14. Rd1',
          comment: 'The other rook takes over the d-file, and the rook on d7 is pinned all over again.',
          arrows: [{ from: 'd1', to: 'd7', color: 'green' }],
        },
        { fen: '4kb1r/p2r1ppp/4qn2/1B2p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 2 15', move: '14...Qe6', comment: 'Black unpins and offers to trade queens.', arrows: [{ from: 'e6', to: 'b3', color: 'yellow' }] },
        { fen: '4kb1r/p2B1ppp/4qn2/4p1B1/4P3/1Q6/PPP2PPP/2KR4 b k - 0 15', move: '15. Bxd7+' },
        { fen: '4kb1r/p2n1ppp/4q3/4p1B1/4P3/1Q6/PPP2PPP/2KR4 w k - 0 16', move: '15...Nxd7', comment: 'The knight takes back, and leaves f6: the bishop on g5 now sees all the way to d8.' },
        {
          fen: '1Q2kb1r/p2n1ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 b k - 1 16',
          move: '16. Qb8+!!',
          comment: 'The queen is given away to drag the knight off d7.',
          arrows: [{ from: 'b8', to: 'e8', color: 'red' }],
        },
        { fen: '1n2kb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2KR4 w k - 0 17', move: '16...Nxb8' },
        {
          fen: '1n1Rkb1r/p4ppp/4q3/4p1B1/4P3/8/PPP2PPP/2K5 b k - 1 17',
          move: '17. Rd8#',
          comment: 'Mate, with the last two pieces: the rook gives check and the bishop guards it.',
          arrows: [{ from: 'g5', to: 'd8', color: 'green' }],
        },
      ],
    },
  },
  {
    id: 'practice',
    title: 'Practice problems',
    group: 'learn',
    use: 'Problems to answer in your own words or numbers, checked in place: hints one at a time, the worked solution after a try, and a score; open answers go to the message box for the tutor to check.',
    keywords: 'practice problems exercises homework worksheet tutor maths physics calculation answer check hints solution score try again drill',
    shape: `{
  title?: string
  intro?: md
  problems: {
    q: md                        // the problem
    image?: image
    answer?: string | number | (string | number)[]   // the right answer, or several accepted ones; leave out for an open answer the tutor checks
    tolerance?: number           // for a number: how far off still counts (absolute)
    unit?: string                // shown after the box ("m/s")
    hints?: md[]                 // revealed one at a time
    solution?: md                // the worked solution: shown after a try, or when asked
  }[]
  mode?: "one" | "all"           // one problem at a time (the default) or all at once
}`,
    example: {
      title: 'Speed, equations and a little physics',
      intro: 'Type your answer and press **Enter** to check it. Ask for a hint when you are stuck.',
      problems: [
        {
          q: 'A train covers $150\\ \\text{km}$ in $2\\ \\text{h}\\ 30\\ \\text{min}$. What is its average speed?',
          answer: 60,
          unit: 'km/h',
          hints: ['Average speed is distance divided by time.', 'Write $2\\ \\text{h}\\ 30\\ \\text{min}$ as a number of hours first: $2.5\\ \\text{h}$.'],
          solution: '$$v = \\frac{d}{t} = \\frac{150\\ \\text{km}}{2.5\\ \\text{h}} = 60\\ \\text{km/h}$$',
        },
        {
          q: 'Solve for $x$: $\;3x - 7 = 11$',
          answer: 6,
          hints: ['Add 7 to both sides first.'],
          solution: 'Add 7 to both sides: $3x = 18$. Then divide both sides by 3: $x = 6$.',
        },
        {
          q: 'What is $\\sqrt{2}$, to two decimal places?',
          answer: 1.41,
          tolerance: 0.005,
          hints: ['It is a little more than $1.4^2 = 1.96$.'],
          solution: '$1.41^2 = 1.9881$ and $1.42^2 = 2.0164$, so $\\sqrt{2} \\approx 1.41$.',
        },
        {
          q: 'Simplify the fraction $\\tfrac{18}{24}$ to its lowest terms.',
          answer: ['3/4'],
          hints: ['Find the largest number that divides both 18 and 24.'],
          solution: 'The greatest common divisor of 18 and 24 is 6, so $\\tfrac{18 \\div 6}{24 \\div 6} = \\tfrac{3}{4}$.',
        },
        {
          q: 'In two or three sentences, explain why a hammer and a feather fall together on the Moon.',
          hints: ['Think about what is missing on the Moon that is there on Earth.'],
          solution: 'The Moon has no air, so nothing pushes back harder on the feather. Gravity speeds up every object at the same rate, whatever its mass, so both land together.',
        },
      ],
    },
  },
  {
    id: 'network',
    title: 'Network graph',
    group: 'learn',
    use: 'Things and how they connect, as a graph to explore: nodes in coloured groups joined by labelled links (a concept map, characters, ideas, dependencies); tap a node to light up its links and read its note.',
    keywords: 'network graph concept map relationships connections nodes links characters ideas dependencies social network knowledge graph web of influences',
    shape: `{
  title?: string
  nodes: {
    id: string
    label?: string               // shown on the node (its id when left out)
    group?: string               // colours it; a legend names the groups
    note?: md                    // shown when it is tapped
    size?: number                // how much it counts, 1 to 5
  }[]                            // up to 60
  links: {
    from: string                 // a node's id
    to: string
    label?: string               // what joins them ("influenced", "imports")
    directed?: boolean           // an arrow from → to
    weight?: number              // 1 to 5: a thicker line
  }[]
  directed?: boolean             // every link an arrow
}`,
    example: {
      title: 'Who influenced whom in early modern philosophy',
      directed: true,
      nodes: [
        { id: 'descartes', label: 'Descartes', group: 'Rationalists', size: 4, note: 'Began from doubt: “I think, therefore I am”, and built knowledge on reason alone.' },
        { id: 'spinoza', label: 'Spinoza', group: 'Rationalists', size: 3, note: 'Argued that God and nature are one substance, in a book laid out like geometry.' },
        { id: 'leibniz', label: 'Leibniz', group: 'Rationalists', size: 3, note: 'Held that the world is made of simple, mind-like units he called monads.' },
        { id: 'locke', label: 'Locke', group: 'Empiricists', size: 4, note: 'The mind starts as a blank slate: every idea comes from experience.' },
        { id: 'berkeley', label: 'Berkeley', group: 'Empiricists', size: 2, note: 'To be is to be perceived: matter exists only as ideas in minds.' },
        { id: 'hume', label: 'Hume', group: 'Empiricists', size: 4, note: 'Showed that cause and effect is a habit of expecting, not something we observe.' },
        { id: 'kant', label: 'Kant', group: 'Critical philosophy', size: 5, note: 'Joined the two camps: experience gives the content of knowledge, the mind gives its form.' },
        { id: 'hegel', label: 'Hegel', group: 'Idealists', size: 3, note: 'Saw history as thought unfolding itself through conflict and resolution.' },
      ],
      links: [
        { from: 'descartes', to: 'spinoza', label: 'influenced' },
        { from: 'descartes', to: 'leibniz', label: 'influenced' },
        { from: 'locke', to: 'descartes', label: 'criticised' },
        { from: 'locke', to: 'berkeley', label: 'influenced' },
        { from: 'locke', to: 'hume', label: 'influenced' },
        { from: 'berkeley', to: 'hume', label: 'influenced' },
        { from: 'hume', to: 'kant', label: 'awakened', weight: 4 },
        { from: 'leibniz', to: 'kant', label: 'influenced' },
        { from: 'kant', to: 'hegel', label: 'influenced', weight: 3 },
        { from: 'spinoza', to: 'hegel', label: 'influenced' },
      ],
    },
  },
];
