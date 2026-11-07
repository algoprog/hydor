// Answer UIs for media and events: galleries, videos, sounds, tracks, films and books, events, colour palettes, news.
import type { AnswerUiSpec } from './types.ts';

export const MEDIA: AnswerUiSpec[] = [
  {
    id: 'gallery',
    title: 'Photo gallery',
    group: 'media',
    use: 'Pictures in a grid or a carousel, with captions and credits; each opens large, and the user can switch between grid and carousel.',
    keywords: 'gallery photos pictures images album carousel slideshow grid lightbox what does it look like show me',
    shape: `{
  title?: string
  layout?: "grid" | "carousel" // grid unless set
  images: {
    src: image
    caption?: md
    credit?: string            // who took it, and its licence
    url?: url                  // the picture's own page
  }[]
}`,
    example: {
      title: 'Iceland’s waterfalls, along the Ring Road',
      layout: 'grid',
      images: [
        { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/2008-05-24_35_Sk%C3%B3gafoss.jpg/960px-2008-05-24_35_Sk%C3%B3gafoss.jpg', caption: '**Skógafoss**: 60 m high and 25 m wide; on a sunny day a rainbow hangs in its spray.', credit: 'Hansueli Krapf, CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:2008-05-24_35_Sk%C3%B3gafoss.jpg' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Idyllic_landscape_with_a_waterfall_%28Unsplash%29.jpg/960px-Idyllic_landscape_with_a_waterfall_%28Unsplash%29.jpg', caption: '**Seljalandsfoss**: a path runs behind the curtain of water; bring a rain jacket.', credit: 'Robert Lukeman, CC0', url: 'https://commons.wikimedia.org/wiki/File:Idyllic_landscape_with_a_waterfall_(Unsplash).jpg' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Gullfoss_from_the_Air_%28cropped%29.jpg/960px-Gullfoss_from_the_Air_%28cropped%29.jpg', caption: '**Gullfoss**: the Hvítá drops 32 m in two steps into a canyon, on the Golden Circle.', credit: 'Nickspix, CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Gullfoss_from_the_Air_(cropped).jpg' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/SvartifossWinter.jpg/960px-SvartifossWinter.jpg', caption: '**Svartifoss**, “the black fall”, framed by dark basalt columns in Skaftafell.', credit: 'Andreas Tille, CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:SvartifossWinter.jpg' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Dettifoss_TimBekaert.JPG/960px-Dettifoss_TimBekaert.JPG', caption: '**Dettifoss**: the most powerful waterfall in Europe, 44 m high and 100 m wide. Look for the person on the rim.', credit: 'Tim Bekaert, public domain', url: 'https://commons.wikimedia.org/wiki/File:Dettifoss_TimBekaert.JPG' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/1_Go%C3%B0afoss_aerial_pano_2017.jpg/960px-1_Go%C3%B0afoss_aerial_pano_2017.jpg', caption: '**Goðafoss**, the “waterfall of the gods”, 30 m wide, half an hour from Akureyri.', credit: 'Chensiyuan, CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:1_Go%C3%B0afoss_aerial_pano_2017.jpg' },
      ],
    },
  },
  {
    id: 'video',
    title: 'Videos',
    group: 'media',
    use: 'Videos that play in place, one large and the rest lined up under it, with chapters that jump to their moment.',
    keywords: 'video videos youtube watch clip tutorial lecture talk playlist chapters timestamps vimeo',
    shape: `{
  title?: string
  videos: {
    url: url                   // YouTube or Vimeo play in place, as does a video file on this computer
    title?: string
    channel?: string
    duration?: string          // "18:40"
    description?: md
    chapters?: { time: string, title: string }[]   // time: "1:23" or "1:02:03"
  }[]
}`,
    example: {
      title: 'Deep learning, visually: where to start',
      videos: [
        {
          url: 'https://www.youtube.com/watch?v=aircAruvnKk',
          title: 'But what is a neural network?',
          channel: '3Blue1Brown',
          duration: '18:40',
          description: 'Neurons, layers, weights and biases, built up from the problem of reading handwritten digits.',
          chapters: [
            { time: '0:00', title: 'Introduction example' },
            { time: '2:42', title: 'What are neurons?' },
            { time: '3:35', title: 'Introducing layers' },
            { time: '8:38', title: 'Edge detection example' },
            { time: '11:34', title: 'Counting weights and biases' },
            { time: '13:26', title: 'Notation and linear algebra' },
            { time: '17:03', title: 'ReLU vs Sigmoid' },
          ],
        },
        {
          url: 'https://www.youtube.com/watch?v=IHZwWFHWa-w',
          title: 'Gradient descent, how neural networks learn',
          channel: '3Blue1Brown',
          duration: '20:33',
          description: 'What “learning” means for a network: a cost function, and walking downhill on it.',
          chapters: [
            { time: '0:00', title: 'Introduction' },
            { time: '3:01', title: 'Cost functions' },
            { time: '6:55', title: 'Gradient descent' },
            { time: '11:18', title: 'More on gradient vectors' },
            { time: '13:01', title: 'Analyzing the network' },
          ],
        },
        {
          url: 'https://www.youtube.com/watch?v=wjZofJX0v4M',
          title: 'Transformers, the tech behind LLMs',
          channel: '3Blue1Brown',
          duration: '27:14',
          description: 'How a transformer predicts the next word: embeddings, unembedding and softmax with temperature.',
          chapters: [
            { time: '0:00', title: 'Predict, sample, repeat' },
            { time: '3:03', title: 'Inside a transformer' },
            { time: '12:27', title: 'Word embeddings' },
            { time: '20:22', title: 'Unembedding' },
            { time: '22:22', title: 'Softmax with temperature' },
          ],
        },
        {
          url: 'https://www.youtube.com/watch?v=eMlx5fFNoYc',
          title: 'Attention in transformers, step-by-step',
          channel: '3Blue1Brown',
          duration: '26:09',
          description: 'Queries, keys and values: how the words of a passage pass meaning to one another.',
          chapters: [
            { time: '0:00', title: 'Recap on embeddings' },
            { time: '4:29', title: 'The attention pattern' },
            { time: '11:08', title: 'Masking' },
            { time: '13:10', title: 'Values' },
            { time: '19:19', title: 'Multiple heads' },
          ],
        },
      ],
    },
  },
  {
    id: 'audio',
    title: 'Audio player',
    group: 'media',
    use: 'Sounds to play (recordings, narration, music, episodes): a file on this computer plays in place, a web address opens in a tab of its own.',
    keywords: 'audio sound play listen recording music track podcast episode narration voice mp3 wav player',
    shape: `{
  title?: string
  tracks: {
    src: string                // a file on this computer (a path) plays here; a web address opens in a tab
    title: string
    artist?: string
    duration?: string          // "3:04"
    image?: image
  }[]
}`,
    example: {
      title: 'Quiet piano for reading: free recordings',
      tracks: [
        { src: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg', title: 'Gymnopédie No. 1', artist: 'Erik Satie, played by Robin Alciatore', duration: '3:04', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Ericsatie.jpg/500px-Ericsatie.jpg' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Clair_de_lune_%28Claude_Debussy%29_Suite_bergamasque.ogg', title: 'Clair de lune', artist: 'Claude Debussy, played by Laurens Goedhart', duration: '5:04', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Claude_Debussy_by_Atelier_Nadar.jpg/500px-Claude_Debussy_by_Atelier_Nadar.jpg' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/0/04/Chopin_Nocturne_No._2_in_E_Flat_Major%2C_Op._9.ogg', title: 'Nocturne in E-flat major, Op. 9 No. 2', artist: 'Frédéric Chopin, played by Peter Johnston', duration: '4:19', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Frederic_Chopin_photo.jpeg/500px-Frederic_Chopin_photo.jpeg' },
        { src: 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Kimiko_Ishizaka_-_Bach_-_Well-Tempered_Clavier%2C_Book_1_-_01_Prelude_No._1_in_C_major%2C_BWV_846.ogg', title: 'Prelude in C major, BWV 846', artist: 'J. S. Bach, played by Kimiko Ishizaka', duration: '2:43', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Johann_Sebastian_Bach.jpg/500px-Johann_Sebastian_Bach.jpg' },
      ],
    },
  },
  {
    id: 'tracks',
    title: 'Songs',
    group: 'media',
    use: 'Songs to listen to, with covers, albums and why each fits, linked to YouTube, Spotify and Apple Music (a search when no link is given).',
    keywords: 'songs music tracks playlist recommendations album artist spotify youtube apple music listen mix',
    shape: `{
  title?: string
  tracks: {
    title: string
    artist: string
    album?: string
    year?: number
    cover?: image
    duration?: string          // "5:24"
    why?: md                   // why it fits
    links?: { spotify?: url, youtube?: url, apple?: url }   // a search on each is offered for those left out
  }[]
}`,
    example: {
      title: 'Jazz for a rainy evening',
      tracks: [
        { title: 'Blue in Green', artist: 'Miles Davis', album: 'Kind of Blue', year: 1959, duration: '5:27', cover: 'https://upload.wikimedia.org/wikipedia/en/1/10/Miles_Davis_-_Kind_of_Blue_album_cover.jpg', why: 'Bill Evans’s chords under Miles’s muted trumpet, as hushed as rain on a window.' },
        { title: 'Waltz for Debby', artist: 'Bill Evans Trio', album: 'Waltz for Debby', year: 1962, duration: '7:00', cover: 'https://upload.wikimedia.org/wikipedia/en/c/c9/Bill_Evans_Trio_-_Waltz_for_Debby.png', why: 'Recorded live at the Village Vanguard: you can hear the glasses clink.' },
        { title: 'Autumn Leaves', artist: 'Cannonball Adderley', album: 'Somethin’ Else', year: 1958, duration: '10:55', cover: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Somethin%E2%80%99_Else.jpg/500px-Somethin%E2%80%99_Else.jpg', why: 'Miles Davis plays on it too; the long, slow opening suits a grey evening.' },
        { title: 'Naima', artist: 'John Coltrane', album: 'Giant Steps', year: 1960, duration: '4:21', cover: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Coltrane_Giant_Steps.jpg/500px-Coltrane_Giant_Steps.jpg', why: 'A ballad for his wife, and Coltrane at his most tender.' },
        { title: 'Take Five', artist: 'The Dave Brubeck Quartet', album: 'Time Out', year: 1959, duration: '5:24', cover: 'https://upload.wikimedia.org/wikipedia/en/e/e3/TimeOutDaveBrubeckQuartet.jpg', why: 'Paul Desmond’s alto floats over a 5/4 groove you will know at once.', links: { youtube: 'https://www.youtube.com/watch?v=ryA6eHZNnXY' } },
        { title: 'Goodbye Pork Pie Hat', artist: 'Charles Mingus', album: 'Mingus Ah Um', year: 1959, duration: '5:44', cover: 'https://upload.wikimedia.org/wikipedia/en/6/65/Mingus_Ah_Um_-_Charles_Mingus.jpg', why: 'Mingus’s slow, bluesy elegy for Lester Young.' },
      ],
    },
  },
  {
    id: 'media',
    title: 'Films, books and more',
    group: 'media',
    use: 'Recommended films, shows, books, games or podcasts as poster cards with ratings, genres, why each fits and where to find it; trailers play in place.',
    keywords: 'movies films shows series books games podcasts recommendations what to watch read next posters ratings trailer',
    shape: `{
  title?: string
  kind?: "movie" | "show" | "book" | "game" | "podcast" | "album" | "anime" | "course"   // sets the poster's shape
  items: {
    title: string
    image?: image              // its poster or cover
    year?: number
    creator?: string           // the director, author, studio or host
    rating?: number            // out of 5, drawn as stars
    ratings?: { source: string, value: string }[]   // as each site writes it: "7.9/10", "94%"
    genres?: string[]
    length?: string            // "2h 30m", "412 pages", "3 seasons"
    summary?: md
    why?: md                   // why it is recommended
    where?: { name: string, url?: url }[]   // where to watch, read, play or listen
    trailer?: url              // YouTube or Vimeo: plays in place
    url?: url
  }[]
}`,
    example: {
      title: 'If you loved Arrival',
      kind: 'movie',
      items: [
        { title: 'Contact', year: 1997, creator: 'Robert Zemeckis', image: 'https://upload.wikimedia.org/wikipedia/en/7/75/Contact_ver2.jpg', ratings: [{ source: 'IMDb', value: '7.5/10' }, { source: 'Rotten Tomatoes', value: '68%' }], genres: ['Sci-fi', 'Drama'], length: '2h 30m', summary: 'A radio astronomer (Jodie Foster) picks up a signal from Vega that carries the plans for a machine.', why: 'The closest in spirit: a scientist decoding a message, and what it costs her to believe it. From Carl Sagan’s novel.', where: [{ name: 'Apple TV' }, { name: 'Prime Video' }] },
        { title: 'Annihilation', year: 2018, creator: 'Alex Garland', image: 'https://upload.wikimedia.org/wikipedia/en/f/f6/Annihilation_%28film%29.png', ratings: [{ source: 'IMDb', value: '6.8/10' }, { source: 'Rotten Tomatoes', value: '88%' }], genres: ['Sci-fi', 'Horror', 'Mystery'], length: '1h 55m', summary: 'A biologist joins an all-woman expedition into “the Shimmer”, a zone where nature mutates.', why: 'The same slow dread, and the same question: how would we meet something truly alien?', trailer: 'https://www.youtube.com/watch?v=89OP78l9oF0' },
        { title: 'Interstellar', year: 2014, creator: 'Christopher Nolan', image: 'https://upload.wikimedia.org/wikipedia/en/b/bc/Interstellar_film_poster.jpg', ratings: [{ source: 'IMDb', value: '8.7/10' }, { source: 'Rotten Tomatoes', value: '73%' }], genres: ['Sci-fi', 'Adventure', 'Drama'], length: '2h 49m', summary: 'With Earth’s crops failing, a former pilot leads a mission through a wormhole to find humanity a new home.', why: 'Like Arrival, it is about time and a parent’s love, told on a vast scale.', trailer: 'https://www.youtube.com/watch?v=zSWdZVtXT7E' },
        { title: 'Moon', year: 2009, creator: 'Duncan Jones', image: 'https://upload.wikimedia.org/wikipedia/en/a/af/Moon_%282009_film%29.jpg', ratings: [{ source: 'IMDb', value: '7.8/10' }, { source: 'Rotten Tomatoes', value: '90%' }], genres: ['Sci-fi', 'Drama', 'Mystery'], length: '1h 37m', summary: 'Near the end of three years alone mining helium-3 on the Moon, an astronaut finds something that unravels who he is.', why: 'Small, quiet and devastating: proof that big ideas need no big budget.', trailer: 'https://www.youtube.com/watch?v=M0ALUAbl4n4' },
        { title: 'Blade Runner 2049', year: 2017, creator: 'Denis Villeneuve', image: 'https://upload.wikimedia.org/wikipedia/en/9/9b/Blade_Runner_2049_poster.png', ratings: [{ source: 'IMDb', value: '8.0/10' }, { source: 'Rotten Tomatoes', value: '88%' }], genres: ['Sci-fi', 'Drama', 'Thriller'], length: '2h 44m', summary: 'A replicant blade runner unearths a secret that could plunge what is left of society into chaos.', why: 'Villeneuve again, with the same patient pace and Roger Deakins’s unforgettable images.', trailer: 'https://www.youtube.com/watch?v=gCcx85zbxz4' },
      ],
    },
  },
  {
    id: 'event',
    title: 'Events',
    group: 'media',
    use: 'Events with date tiles, times, places, prices and notes; each one, or all of them, goes into the user’s calendar as an .ics file.',
    keywords: 'events concerts shows games what’s on things to do tickets venue dates calendar ics schedule',
    shape: `{
  title?: string
  timezone?: string            // the zone the times are in ("America/New_York"); the device's own when left out
  events: {
    title: string
    start: datetime            // local time where it happens; a date alone for a whole day
    end?: datetime
    venue?: string
    address?: string
    image?: image
    price?: string             // "Free", "$35–$155"
    url?: url
    tags?: string[]
    note?: md
  }[]
}`,
    example: {
      title: 'Boston, the next four weeks',
      timezone: 'America/New_York',
      events: [
        { title: 'Creation by Osvaldo Golijov', start: '2026-11-12T19:30', venue: 'Symphony Hall', address: '301 Massachusetts Ave, Boston', image: 'https://cdn.bso.org/uploads/EJacobsen_2024cBenVanHook-02.JPG?fit=cover&gravity%5Bx%5D=0.3504&gravity%5By%5D=0.183&height=750&width=1200&s=ef4buGBd-RIBaaEC7oTnvs4st5xkr6LT0f9H6NtjFvY', url: 'https://www.bso.org/events/nov-12-14-golijov', tags: ['Classical', 'New music'], note: 'Golijov’s answer to Haydn’s *The Creation*, which the BSO plays the week before. Also on Friday 13 and Saturday 14.' },
        { title: 'Jan Lisiecki plays Mendelssohn’s Piano Concerto No. 1', start: '2026-11-19T19:30', venue: 'Symphony Hall', address: '301 Massachusetts Ave, Boston', image: 'https://cdn.bso.org/uploads/Samy-Rachid-9A5A6790-2000x1250.pg.jpg?fit=cover&gravity%5Bx%5D=0.4925&gravity%5By%5D=0.2973&height=750&width=1200&s=JyQXRiKziPVJSQnpZWZ8RxcvNQgRKr9UoG9ox0RYDsk', url: 'https://www.bso.org/events/nov-19-21-mendelssohn-schumann', tags: ['Classical'], note: 'Samy Rachid conducts, with Weber’s *Oberon* and Schumann’s *Spring* symphony.' },
        { title: 'The Game: Harvard vs. Yale', start: '2026-11-21T15:30', end: '2026-11-21T18:30', venue: 'Fenway Park', address: '4 Jersey St, Boston', image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/131023-F-PR861-033_Hanscom_participates_in_World_Series_pregame_events.jpg/500px-131023-F-PR861-033_Hanscom_participates_in_World_Series_pregame_events.jpg', url: 'https://gocrimson.com/news/2026/5/27/football-harvard-yale-at-fenway-park-set-for-3-30-pm-kickoff-on-espnu.aspx', tags: ['Football'], note: 'The 142nd meeting, at Fenway for the first time since 2018; live on ESPNU too.' },
        { title: 'Gershwin and Respighi’s *Fountains of Rome*', start: '2026-11-28T20:00', venue: 'Symphony Hall', address: '301 Massachusetts Ave, Boston', image: 'https://cdn.bso.org/uploads/JYT-%C2%A9Elisabeth-Caren-3785_Retouch.jpg?fit=cover&gravity%5Bx%5D=0.4931&gravity%5By%5D=0.3077&height=750&width=1200&s=HZ7tUjdAoWTnAg8Ex-8NSSPoZW2Q9IQuuETHTQX4aZY', url: 'https://www.bso.org/events/nov-27-28-gershwin-respighi', tags: ['Classical'], note: 'Jean-Yves Thibaudet plays Gershwin’s Concerto in F; Kazuki Yamada’s Symphony Hall debut.' },
        { title: 'Boston Common Tree Lighting', start: '2026-12-03T18:00', end: '2026-12-03T20:00', venue: 'Boston Common', address: '139 Tremont St, Boston', image: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/2010_Boston_Halifax_Christmas_tree_on_Boston_Common_USA_5273771973.jpg', price: 'Free', url: 'https://www.boston.gov/calendar/boston-common-tree-lighting', tags: ['Family'], note: 'The 85th lighting of Nova Scotia’s thank-you tree, for Boston’s help after the 1917 Halifax explosion.' },
      ],
    },
  },
  {
    id: 'color-palette',
    title: 'Colour palette',
    group: 'media',
    use: 'Named colour swatches that copy on a click, with RGB, HSL and the WCAG contrast of white and black text on each (AA, AAA).',
    keywords: 'colour color palette swatches hex rgb hsl scheme brand colours theme contrast accessibility wcag design',
    shape: `{
  name?: string
  colors: { hex: string, name?: string, role?: string }[]   // hex: "#1d3557"; role: "Primary", "Background", "Text"
  note?: md
}`,
    example: {
      name: 'Harbour at dusk',
      colors: [
        { hex: '#0B2545', name: 'Deep navy', role: 'Text and dark surfaces' },
        { hex: '#13315C', name: 'Harbour blue', role: 'Primary' },
        { hex: '#8DA9C4', name: 'Fog', role: 'Secondary' },
        { hex: '#EEF4ED', name: 'Sea salt', role: 'Background' },
        { hex: '#E4572E', name: 'Buoy orange', role: 'Accent' },
      ],
      note: 'Keep **Buoy orange** for one call to action a screen. **Deep navy** text on **Sea salt** reads at 13.8:1, well past AAA.',
    },
  },
  {
    id: 'news',
    title: 'News',
    group: 'media',
    use: 'Headlines with their pictures, sources, dates and short summaries, the first one larger: the latest on a topic at a glance.',
    keywords: 'news headlines articles latest stories press digest roundup what happened current events sources this week',
    shape: `{
  title?: string
  items: {
    title: string
    url?: url
    source?: string            // the publication
    date?: date | datetime
    image?: image
    summary?: md
    tag?: string               // a topic or section
  }[]
}`,
    example: {
      title: 'The road to COP31 in Antalya',
      items: [
        { title: 'Türkiye plans sweeping security measures for COP31 in Antalya', url: 'https://www.hurriyetdailynews.com/turkiye-plans-sweeping-security-measures-for-cop31-in-antalya-228586', source: 'Hürriyet Daily News', date: '2026-10-25', image: 'https://image.hurimg.com/i/hurriyet/75/750x422/6addea5b2818a025f780d26d.jpg', tag: 'Antalya', summary: 'About 26,000 security staff will be deployed; nearly 100 heads of state and government and some 20,000 delegates are expected for the 9–20 November summit.' },
        { title: 'Tuvalu urges global unity on climate crisis', url: 'https://islandsbusiness.com/news-break/tuvalu-urges-global-unity-on-climate-crisis/', source: 'Islands Business', date: '2026-10-12', image: 'https://islandsbusiness.com/wp-content/uploads/2026/10/Pre-COP.jpg', tag: 'Pacific', summary: 'After the Pacific Pre-COP adopted the Taku Pakasoa Declaration in Nadi, Tuvalu’s climate minister called on the world to stand with frontline nations.' },
        { title: 'Fiji pledges US$10 million as Pacific climate finance drive gains momentum ahead of COP31', url: 'https://forumsec.org/publications/release-fiji-pledges-us10-million-pacific-climate-finance-drive-gains-momentum-ahead', source: 'Pacific Islands Forum', date: '2026-10-09', tag: 'Finance', summary: 'Prime Minister Sitiveni Rabuka’s pledge to the Pacific Resilience Facility was joined by US$2.3 million from Denmark and US$1 million from the Netherlands.' },
        { title: 'Extreme heat putting pregnant women, newborns at risk: UN climate chief', url: 'https://cambodianess.com/article/extreme-heat-putting-pregnant-women-newborns-at-risk-un-climate-chief', source: 'AFP', date: '2026-10-05', image: 'https://img.cambodianess.com/uploads/article/10-2026/1791168994.jpg', tag: 'Health', summary: 'At the pre-COP in Nadi, Simon Stiell cited a survey in which more than two-thirds of health workers on five continents had seen complications caused by intense heat.' },
        { title: 'World powers gather in Pacific to chart climate battle', url: 'https://cambodianess.com/article/world-powers-gather-in-pacific-to-chart-climate-battle', source: 'AFP', date: '2026-10-02', image: 'https://img.cambodianess.com/uploads/article/10-2026/1790924713.jpg', tag: 'Pre-COP', summary: 'Ministers and negotiators meet in Nadi, Fiji, on 5–8 October to set the course for COP31, as Pacific nations press to keep 1.5 °C within reach.' },
      ],
    },
  },
];
