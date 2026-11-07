// Answer UIs for learning: quizzes, flashcards, worked solutions, explainers, vocabulary, translations, papers…
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
];
