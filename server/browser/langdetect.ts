// Which language a page is written in, from its words, on this computer (nothing is sent anywhere): a language of
// TRANSLATE_LANGS (shared/browser.ts), or nothing when it cannot tell. Scripts that only a few languages use are told by
// their letters (Greek, Hebrew, Thai, Hangul, Kana…), Cyrillic, Arabic, Devanagari and Han by the letters that tell their
// languages apart, and Latin writing by its most frequent short words and the letters with marks that belong to a
// language. The page's own `<html lang>` (the hint) settles what the words cannot: a short text, or two languages that
// are close.
import { isTranslateLang } from '../../shared/browser.ts';

/** The most letters of a text that are read. */
const READ = 20_000;
/** A text with fewer letters than this is "short": the hint is taken unless the words are very clear. */
const SHORT = 80;

/** A language code as a page writes it (`en-US`, `zh-Hant`, `nb`, `iw`) as a code of TRANSLATE_LANGS; nothing for one that is not. */
export function hintLang(hint: string | undefined | null): string | undefined {
  if (!hint) return undefined;
  const h = hint.trim().toLowerCase().replace(/_/g, '-');
  if (!h) return undefined;
  const [base, ...rest] = h.split('-');
  if (base === 'zh') {
    return rest.some((p) => p === 'hant' || p === 'tw' || p === 'hk' || p === 'mo') ? 'zh-TW' : 'zh';
  }
  const alias: Record<string, string> = { nb: 'no', nn: 'no', iw: 'he', in: 'id', fil: 'tl', mo: 'ro', sh: 'hr', jw: 'id' };
  const code = alias[base] ?? base;
  return isTranslateLang(code) ? code : undefined;
}

// ---- scripts ----------------------------------------------------------------------------------------------------

type Group = 'latin' | 'greek' | 'cyrillic' | 'han' | 'kana' | 'hangul' | 'arabic' | 'hebrew' | 'thai' | 'devanagari' | 'bengali' | 'tamil' | 'telugu' | 'georgian' | 'armenian' | 'ethiopic';

/** The script a character is a letter of (nothing for what is not a letter of one this knows). */
function groupOf(cp: number): Group | undefined {
  if (cp < 0x80) return (cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) ? 'latin' : undefined;
  if (cp < 0x250) return cp === 0xd7 || cp === 0xf7 || cp < 0xc0 ? undefined : 'latin';
  if (cp === 0x259 || (cp >= 0x1e00 && cp <= 0x1eff)) return 'latin';
  if ((cp >= 0x370 && cp <= 0x3ff && cp !== 0x37e && cp !== 0x387) || (cp >= 0x1f00 && cp <= 0x1fff)) return 'greek';
  if (cp >= 0x400 && cp <= 0x52f) return 'cyrillic';
  if (cp >= 0x531 && cp <= 0x587) return 'armenian';
  if (cp >= 0x5d0 && cp <= 0x5ea) return 'hebrew';
  if ((cp >= 0x620 && cp <= 0x6ff && !(cp >= 0x660 && cp <= 0x66d) && cp !== 0x6d4) || (cp >= 0x750 && cp <= 0x77f) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff)) return 'arabic';
  if (cp >= 0x904 && cp <= 0x97f && !(cp >= 0x964 && cp <= 0x96f)) return 'devanagari';
  if (cp >= 0x985 && cp <= 0x9ff && !(cp >= 0x9e6 && cp <= 0x9ef)) return 'bengali';
  if (cp >= 0xb85 && cp <= 0xbff && !(cp >= 0xbe6 && cp <= 0xbef)) return 'tamil';
  if (cp >= 0xc05 && cp <= 0xc7f && !(cp >= 0xc66 && cp <= 0xc6f)) return 'telugu';
  if (cp >= 0xe01 && cp <= 0xe5b && !(cp >= 0xe50 && cp <= 0xe59)) return 'thai';
  if ((cp >= 0x10a0 && cp <= 0x10ff) || (cp >= 0x2d00 && cp <= 0x2d2f)) return 'georgian';
  if (cp >= 0x1200 && cp <= 0x139f) return 'ethiopic';
  if ((cp >= 0x3040 && cp <= 0x30ff && cp !== 0x30fb) || (cp >= 0x31f0 && cp <= 0x31ff) || (cp >= 0xff66 && cp <= 0xff9f)) return 'kana';
  if ((cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0x20000 && cp <= 0x2ebef)) return 'han';
  if ((cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3131 && cp <= 0x318e)) return 'hangul';
  return undefined;
}

/** How much more a letter of these scripts says than one of Latin (a Chinese sentence is a few dozen characters). */
const DENSE: Partial<Record<Group, number>> = { han: 2.5, kana: 2.5, hangul: 2.5 };

// Simplified characters and their traditional forms, of the most common ones (those that differ and mean one thing).
const SIMPLIFIED = '这个们为来说时国学会对过发还开关么经现应动见长门问间无书买车马电网与实点机样边让种业气华员体东师题里万两产区单从听读请谢话语认记达难爱乐钱银办务报价设计讨论该';
const TRADITIONAL = '這個們為來說時國學會對過發還開關麼經現應動見長門問間無書買車馬電網與實點機樣邊讓種業氣華員體東師題裡萬兩產區單從聽讀請謝話語認記達難愛樂錢銀辦務報價設計討論該';

// ---- Cyrillic, Arabic script, Devanagari ----------------------------------------------------------------------------

const count = (t: string, set: string) => {
  let n = 0;
  for (const c of t) if (set.includes(c)) n++;
  return n;
};

/** The language of Cyrillic writing, and whether its letters told it (not only the guess that it is Russian). */
function cyrillic(t: string, letters: number): { lang: string; sure: boolean } {
  const lower = t.toLowerCase();
  const kk = count(lower, 'әғқңөұүһ');
  if (kk >= 2 && kk * 100 >= letters) return { lang: 'kk', sure: true };
  if (count(lower, 'ѓќѕ') > 0) return { lang: 'mk', sure: true };
  if (count(lower, 'ђћ') > 0) return { lang: 'sr', sure: true };
  const uk = count(lower, 'їєґ');
  if (uk > 0) return { lang: 'uk', sure: true };
  if (count(lower, 'ў') > 0) return { lang: 'be', sure: true };
  const i = count(lower, 'і');
  const ru = count(lower, 'ыэё');
  if (i > 0 && ru > 0) return { lang: 'be', sure: i + ru >= 3 };
  if (i * 100 >= letters && i >= 2) return { lang: 'uk', sure: true };
  const hard = count(lower, 'ъ');
  if (ru === 0 && hard >= 2 && hard * 100 >= letters * 1.2) return { lang: 'bg', sure: true };
  if (/[љњџј]/.test(lower)) return { lang: 'sr', sure: false };
  return { lang: 'ru', sure: ru > 0 || letters >= 120 };
}

/** The language of writing in the Arabic script. */
function arabic(t: string): { lang: string; sure: boolean } {
  if (/[ٹڈڑںےہھ]/.test(t)) return { lang: 'ur', sure: true };
  if (/[پچژگ]/.test(t)) return { lang: 'fa', sure: true };
  // Persian writes its y and k with Farsi forms; Arabic text on the web mostly has the Arabic ones.
  const fa = (t.match(/[یک]/g) ?? []).length;
  const ar = (t.match(/[يك]/g) ?? []).length;
  if (fa > ar * 2 && fa >= 3) return { lang: 'fa', sure: true };
  return { lang: 'ar', sure: true };
}

/** Han writing without kana: simplified or traditional Chinese by the characters that differ. */
function han(t: string): { lang: string; sure: boolean } {
  let simple = 0;
  let trad = 0;
  for (const c of t) {
    if (SIMPLIFIED.includes(c)) simple++;
    else if (TRADITIONAL.includes(c)) trad++;
  }
  if (trad >= 2 && trad > simple * 2) return { lang: 'zh-TW', sure: true };
  if (simple >= 1 && simple >= trad) return { lang: 'zh', sure: true };
  return { lang: 'zh', sure: false };
}

// ---- Latin ----------------------------------------------------------------------------------------------------------

// A language's frequent words, lowercase; a word marked with + tells it from the languages it is close to and counts twice.
const WORDS: Record<string, string> = {
  en: 'the+ and of+ to in is that it for with+ as was on are this be by at from or have+ an not but they which+ you his had her we their+ has been+ were one all there+ will can more if about when would+ who what out up no said its into than them other only new some could time these two may then do first any my now such like our over also your how most just those even a i',
  de: 'der die das und+ ist nicht+ ein eine+ einen einem einer zu von mit den dem auf für im auch sich+ es dass+ daß wir sie ich+ werden+ wird sind bei oder wie aus nach über noch nur um an als aber wenn kann hat dieser diese mehr schon zur zum des+ nicht',
  fr: 'le la les+ des+ du de un une+ et est en que qui pour+ dans+ pas sur au aux+ avec+ ce cette+ ces sont+ par plus nous vous+ ils elle il être+ ont fait mais ou où comme sans tout leur très aussi',
  es: 'el la los+ las+ de del y que en un una es por con para no se su al lo como más pero+ sus+ le ya+ o fue este sí porque+ esta entre cuando+ muy+ sin sobre también+ me hasta+ hay+ donde+ han',
  it: 'il lo la i gli+ le di del della+ dei+ delle+ e che è+ un una per con non sono in su da come più+ ma anche+ si al alla questo questa nel+ nella+ ha hanno essere o se quando molto tutti',
  pt: 'o a os as de do da dos+ das+ e que em um uma é para com não+ se por mais na no nas+ nos como mas foi ao à+ ele ela seu sua também+ já+ são+ tem ou ser quando muito há você+',
  nl: 'ik+ jij+ zij+ hij+ mijn+ gezien+ geweest+ hebben+ wij+ jullie+ de het+ een+ en van in is dat op te voor met zijn+ niet+ aan ook als er maar om door bij uit naar dan nog wordt+ worden+ heeft+ deze+ die je ze we wat kan over meer',
  sv: 'och+ att+ det som en är+ på för med av till den har inte+ ett om jag kan från+ så men ska+ eller också när sin hade även vid mycket+ vi vad hur någon+ något utan',
  da: 'og at det er en til på for med af+ den har ikke et om de han jeg vi kan var fra så men skal eller også når sin havde blev+ ved meget mig+ sig+ nogle+ efter+ hvad+ dig+ været+ noget+ kun+ nu hvor tilbage+ set+ nogen+ bliver+ blive+ mere+ ud+ hvem sammen fordi',
  no: 'og å+ det er en til på for med av+ den har ikke et om de han jeg vi kan var fra så men skal eller også når sin hadde+ ble+ ved veldig som hva+ meg+ seg+ noen+ etter+ ikkje+ eg+ noe+ bare+ vært+ deg+ hvor tilbake+ sett+ noen+ blir+ bli+ mer+ ut+ opp+ nå+ mye+ veldig+ hvem sammen fordi',
  fi: 'ja on ei että+ se oli hän mutta+ kun niin tai ovat joka kuin myös+ sekä+ ole olla vain jos mitä tämä+ nämä sen kuka tässä voi sitä oman kanssa+ mukaan',
  is: 'og að+ er í á ekki+ það+ sem við um til með en hún+ hann+ var þetta+ fyrir+ frá hefur eru+ af þá þeir mjög+ eða+ líka+',
  pl: 'i w nie na się+ z do to że+ jest+ jak ale po co tak za od czy+ przez+ dla+ tylko+ być+ są+ jego ich może już+ też+ lub gdy bardzo który+ która+ które+ tego+',
  cs: 'a je se na to v že s z do ne jak ale pro+ by byl+ byla+ bylo+ jsou+ být+ nebo+ také+ už když+ které+ který+ která+ tento+ jeho její+ jsem+ jako+ ve+ při aby+ ještě+',
  sk: 'a je sa+ na to v že s z do nie ako+ ale pre+ by bol+ bola+ bolo+ sú+ byť+ alebo+ tiež+ už keď+ ktoré+ ktorý+ ktorá+ tento jeho jej+ som+ vo+ pri+ však+ aby',
  sl: 'in je v na se da so+ za z ne kot+ ali pa+ bi bil bila bilo bili biti tudi+ že ko ki+ ta to njegov njen sem pri lahko+ samo kaj+ kako če+ ampak+ ni+ več+ še+ ker+ tudi zelo+ kdaj+ kje+ zakaj+ bo smo ste vam vas naš vaš kot že med skozi',
  hr: 'i je u na se da su+ za s ne kao+ ali pa bi bio+ bila bilo biti ili+ također+ već+ kad koji+ koja+ koje+ ovaj+ njegov sam pri može samo što+ kako+ bismo+ vam vas nas vaš naš ako+ nije+ jer+ te još+ vrlo+ svi mi vi kada gdje zašto tko će+ ova nakon prema između kroz',
  ro: 'și+ în de la a cu pe un o este nu că+ se din+ care+ pentru+ mai sunt sau+ dar ca au fost+ să+ lui+ ale acest+ această+ foarte+',
  hu: 'a az+ és+ hogy+ nem+ is egy+ van volt+ meg de csak+ már+ mint+ ez azt+ amely+ vagy+ el ki be még lehet+ kell+ nagyon+ ahogy által+',
  sq: 'dhe+ të+ e në që+ me një+ për+ nga është+ janë+ por si ka kanë ky kjo+ këtë+ do nuk+ edhe+ më së+ se tij+ saj',
  lt: 'ir+ yra+ kad į+ su iš+ ne tai bet kaip+ ar jis+ ji jie+ buvo+ būti+ apie+ tik+ dar+ po už nuo kuris+ kurie savo+',
  lv: 'un ir ka ar no uz+ par tas bet kā+ vai viņš+ viņa+ tika+ bija+ būt+ tikai+ vēl+ pēc+ kas kuri savu+ šis+ šī+',
  et: 'ja on ei et see+ oli ta+ kui aga+ ka või+ mis siis nii kes+ olla ning+ oma veel+ kõik+ seda+ selle+ üks+',
  tr: 've+ bir+ bu da de için+ ile+ ne çok+ daha en gibi var olarak ama ancak+ veya+ her değil olan sonra kadar ben sen biz siz onlar+ mi mı+',
  az: 'və+ bir bu da də+ üçün+ ilə+ nə+ çox+ daha ən+ kimi var olaraq amma lakin+ həm+ hər deyil olan sonra qədər+ mən+ sən+ biz siz',
  id: 'yang+ dan di ke dari untuk+ dengan+ ini itu tidak pada adalah dalam akan juga atau oleh sebagai ada saya kami kita mereka bisa+ lebih telah sudah+ karena+ aku+ tapi+ hewan+ semua bersama hari harus+ sangat bahwa+ informasi+ situs+ selengkapnya+ kunjungan+ kebijakan+ memberikan',
  ms: 'yang+ dan di ke dari untuk+ dengan+ ini itu tidak pada adalah dalam akan juga atau oleh sebagai ada saya kami kita mereka boleh+ lebih telah kerana+ daripada+ sahaja+ tak+ kepada+ serta+ pun+ haiwan+ perlu+ ialah+ beliau+ semua bersama hari sangat bahawa+ maklumat+ laman+ lanjut+ lawatan+ dasar anda',
  tl: 'ang+ ng+ sa na at ay+ mga+ ito+ ni para hindi+ ako+ ka mo niya+ kami tayo+ sila kung may+ mayroon+ din+ rin+ lang+ lamang+ pero si kay+ nang+ po+',
  vi: 'và+ của+ là có trong cho không+ được+ một+ những+ các+ này+ với+ để người+ khi đã+ từ như đến+ cũng+',
  sw: 'na ya wa+ kwa+ ni katika+ la za+ kuwa+ hii+ huo+ kama+ pia+ lakini+ yake+ yao+ hiyo+ au sana+ wote+ cha+ vya+ sisi+ ili+ zaidi+ kwenye+ yetu+ yako+ kwamba+ kuhusu+ wetu+ wako+ sasa hapa huu hizi hilo mimi wewe yeye nyinyi wao bila baada kabla tu si hakuna kuna nini vipi wapi',
  ca: 'el la els+ les de del i que en un una és+ per amb+ no es al com més+ però+ seu seva+ també+ ja són+ ha hi+ molt+ això+ aquest+ aquesta+',
  eu: 'eta+ da ez+ bat+ du+ dira+ izan+ zen+ baina+ ere+ hau+ hori+ bere+ dute+ gara+ oso+ beste edo+',
  gl: 'o a os as de do da dos das e que en un unha+ é para con non+ se por máis+ na no nas nos como pero foi ao ela seu súa+ tamén+ xa+ son ten ou ser cando moi+ hai+ noso+ nosa+ túa+ teu+ miña+ nós+ vós+ eu tes+ facer+',
  cy: 'a y yn+ i o ar ac mae+ yr+ ei ef+ hi ni nid+ am gan+ â+ fel ond sy+ wedi+ bod+ mewn+ cael+',
  ga: 'agus+ an na is ar le sa ag+ do go ach+ mar bhí+ tá+ sé+ sí+ siad+ ní nach+ seo+ sin ó+ chun+ aon mé tú',
  af: 'die en van in is dat nie+ te vir+ op met wat hy+ sy was het aan om dit ook as maar by nog sal+ kan hulle+ n+ diere+ vandag+ saam+ baie+ hierdie+ daardie+ ek+ jy+ jou+ gesien+ gehad+ gedoen+ moet',
};

const LATIN_LANGS = Object.keys(WORDS);

const WORD_WEIGHT = new Map<string, Map<string, number>>();
for (const [lang, list] of Object.entries(WORDS)) {
  for (const w of list.split(/\s+/)) {
    const plus = w.endsWith('+');
    const word = plus ? w.slice(0, -1) : w;
    let m = WORD_WEIGHT.get(word);
    if (!m) WORD_WEIGHT.set(word, (m = new Map()));
    m.set(lang, Math.max(m.get(lang) ?? 0, plus ? 2 : 1));
  }
}

// Letters that belong to some languages: what each adds to them for every time it is seen (a letter with a mark rarely
// stands in a language that does not use it).
const MARKS: [string, string, number][] = [
  ['ß', 'de', 2.5],
  ['äöü', 'de', 0.6],
  ['äö', 'sv fi et', 0.6],
  ['å', 'sv', 1],
  ['åæø', 'da no', 1.2],
  ['æ', 'is', 1],
  ['ø', 'da no', 1],
  ['ñ', 'es', 1.5],
  ['ñ', 'gl eu', 0.7],
  ['ãõ', 'pt', 1.5],
  ['õ', 'et', 1.2],
  ['ç', 'fr pt ca', 0.8],
  ['ç', 'tr az sq', 0.5],
  ['œ', 'fr', 2],
  ['éèêàùâîôû', 'fr', 0.5],
  ['ë', 'sq', 1.5],
  ['ë', 'nl af fr', 0.5],
  ['èìò', 'it', 0.8],
  ['ù', 'it', 0.6],
  ['àèéíòóú', 'ca', 0.6],
  ['áíóúü', 'es', 0.5],
  ['é', 'es it pt', 0.4],
  ['¿¡', 'es', 3],
  ['ł', 'pl', 3],
  ['ąęśźżćń', 'pl', 1.5],
  ['ó', 'pl', 0.6],
  ['ěřů', 'cs', 2.5],
  ['ýáíéú', 'cs sk', 0.5],
  ['č', 'cs sk sl hr lt lv', 0.6],
  ['šž', 'cs sk sl hr lt lv et fi', 0.6],
  ['ďťľĺŕô', 'sk', 2],
  ['ň', 'cs sk', 1],
  ['ä', 'sk', 0.5],
  ['đ', 'hr', 2],
  ['ć', 'hr', 1.5],
  ['ăș', 'ro', 1.5],
  ['ț', 'ro', 1.5],
  ['şţ', 'ro tr az', 0.8],
  ['âî', 'ro', 0.8],
  ['őű', 'hu', 3],
  ['áéíóúöü', 'hu', 0.4],
  ['ğı', 'tr', 2.5],
  ['ğı', 'az', 1],
  ['ş', 'tr az', 0.8],
  ['öüç', 'tr az', 0.5],
  ['ə', 'az', 3],
  ['ėįų', 'lt', 2.5],
  ['ū', 'lt lv', 1.2],
  ['ā', 'lv', 2.5],
  ['ēī', 'lv', 2.5],
  ['ķļņģ', 'lv', 3],
  ['þð', 'is', 3],
  ['áéíóúý', 'is', 0.6],
  ['đ', 'vi', 2],
  ['ơư', 'vi', 3],
  ['ăâêô', 'vi', 0.8],
  ['ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ', 'vi', 3],
  ['ŵŷ', 'cy', 3],
  ['âêîôû', 'cy', 0.6],
  ['áéíóú', 'ga', 0.6],
  ['êôûî', 'af', 0.8],
];

const MARK_OF = new Map<string, [string, number][]>();
for (const [chars, langs, w] of MARKS) {
  for (const c of chars) {
    let m = MARK_OF.get(c);
    if (!m) MARK_OF.set(c, (m = []));
    for (const l of langs.split(' ')) m.push([l, w]);
  }
}

// Endings of long words that belong to a language (Finnish cases, Turkish plurals, Hungarian cases, Indonesian -nya, Dutch ij).
const ENDINGS: [string, RegExp, number][] = [
  ['fi', /(ssa|ssä|lla|llä|sta|stä|ksi|nen|aan|ään|tta|ttä|lle|ltä|ita|itä|ien|jen)$/, 0.5],
  ['tr', /(lar|ler|ları|leri|ında|inde|dır|dir|yor|mış|miş)$/, 0.7],
  ['hu', /(ban|ben|nak|nek|ból|ből|ját|jét|kor|ött|ért)$/, 0.5],
  ['id', /nya$/, 0.7],
  ['nl', /ij/, 0.4],
];

/** Latin writing: each language's score (its words and letters over the words there are), sorted, best first. */
function latin(text: string): { lang: string; score: number }[] {
  const lower = text.toLowerCase().replace(/[’‘`´]/g, "'");
  const words = lower.match(/\p{L}[\p{L}\p{M}]*|\p{L}/gu) ?? [];
  const score: Record<string, number> = {};
  for (const l of LATIN_LANGS) score[l] = 0;
  for (const w of words) {
    const m = WORD_WEIGHT.get(w);
    if (m) for (const [l, v] of m) score[l] += v;
    if (w.length >= 5) for (const [l, re, v] of ENDINGS) if (re.test(w)) score[l] += v;
  }
  for (const c of lower) {
    const m = MARK_OF.get(c);
    if (m) for (const [l, v] of m) score[l] += v;
  }
  // The Afrikaans article 'n comes after an apostrophe.
  const af = lower.match(/(^|\s)'n\s/g);
  if (af) score.af += af.length * 2;
  const n = Math.max(1, words.length);
  return LATIN_LANGS.map((l) => ({ lang: l, score: score[l] / n })).sort((a, b) => b.score - a.score);
}

// ---- the answer -------------------------------------------------------------------------------------------------------

/**
 * The language a text is written in (a code of TRANSLATE_LANGS), or nothing when it cannot be told: too little text,
 * or two languages as likely. `hint` is the page's own `<html lang>`: it settles a short text or a close call, and is
 * not trusted over words that clearly say another language.
 */
export function detectLanguage(text: string, hint?: string): string | undefined {
  const h = hintLang(hint);
  const sample = text.length > READ * 2 ? text.slice(0, READ * 2) : text;
  const counts: Partial<Record<Group, number>> = {};
  let total = 0;
  for (const ch of sample) {
    const g = groupOf(ch.codePointAt(0)!);
    if (!g) continue;
    counts[g] = (counts[g] ?? 0) + 1;
    total++;
    if (total >= READ) break;
  }
  if (!total) return h;

  // The script with the most letters, those that say more counting more.
  const weighted = (g: Group) => (counts[g] ?? 0) * (DENSE[g] ?? 1);
  const cjk = (counts.han ?? 0) + (counts.kana ?? 0) + (counts.hangul ?? 0);
  const groups: (Group | 'cjk')[] = ['latin', 'greek', 'cyrillic', 'arabic', 'hebrew', 'thai', 'devanagari', 'bengali', 'tamil', 'telugu', 'georgian', 'armenian', 'ethiopic'];
  let top: Group | 'cjk' = 'latin';
  let best = -1;
  for (const g of groups) {
    const w = weighted(g as Group);
    if (w > best) {
      best = w;
      top = g;
    }
  }
  if (cjk > 0 && cjk * 2.5 > best) top = 'cjk';
  if (best <= 0 && !cjk) return h;

  const inGroup = (re: RegExp) => (sample.match(re) ?? []).join('');

  if (top === 'cjk') {
    const kana = counts.kana ?? 0;
    const hanN = counts.han ?? 0;
    const hangul = counts.hangul ?? 0;
    if (hangul >= (hanN + kana) * 0.3 && hangul >= 2) return 'ko';
    if (kana >= 2 && kana * 20 >= hanN + kana) return 'ja';
    if (kana > 0 && kana >= hanN * 0.5) return 'ja';
    if (hanN + kana < 2) return h;
    const r = han(inGroup(/\p{Script=Han}/gu));
    // Han alone can be Japanese kanji too: a hint that says so is believed when the characters do not tell.
    if (!r.sure && (h === 'ja' || h === 'zh' || h === 'zh-TW')) return h;
    if (r.lang === 'zh' && h === 'zh-TW' && r.sure === false) return h;
    if (h === 'ja' && cjk < 12) return h;
    return r.lang;
  }

  const n = counts[top as Group] ?? 0;
  switch (top) {
    case 'greek':
      return 'el';
    case 'hebrew':
      return 'he';
    case 'thai':
      return 'th';
    case 'bengali':
      return 'bn';
    case 'tamil':
      return 'ta';
    case 'telugu':
      return 'te';
    case 'georgian':
      return 'ka';
    case 'armenian':
      return 'hy';
    case 'ethiopic':
      return 'am';
    case 'devanagari': {
      const t = inGroup(/[ऀ-ॿ]+/g);
      if (/ळ|आहे|आणि|नाही|मध्ये/.test(t)) return 'mr';
      return h === 'mr' ? 'mr' : 'hi';
    }
    case 'arabic': {
      const r = arabic(inGroup(/[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g));
      if (!r.sure && h && ['ar', 'fa', 'ur'].includes(h)) return h;
      // A hint of a language of this script, when the letters do not rule it out (Arabic has no letters Persian lacks).
      if (r.lang === 'ar' && (h === 'fa' || h === 'ur') && n < 200) return h;
      return r.lang;
    }
    case 'cyrillic': {
      const r = cyrillic(inGroup(/[Ѐ-ԯ]+/g), n);
      const family = ['ru', 'uk', 'bg', 'sr', 'mk', 'be', 'kk'];
      if (!r.sure && h && family.includes(h)) return h;
      if (!r.sure && n < 20) return h && family.includes(h) ? h : undefined;
      return r.lang;
    }
  }

  // Latin script.
  const ranked = latin(sample);
  const [a, b] = ranked;
  const tokens = (sample.match(/\p{L}+/gu) ?? []).length;
  const short = n < SHORT;
  const margin = a.score - b.score;
  // Clear: it uses its frequent words, and leads the next by enough (the more, the closer they are in size).
  const clear = a.score >= 0.1 && margin >= Math.max(0.03, a.score * 0.12) && tokens >= 4;
  const veryClear = a.score >= 0.25 && margin >= Math.max(0.08, a.score * 0.25) && tokens >= 12;
  // Serbian in Latin letters reads as Croatian: the page says which it is.
  if (h === 'sr' && a.lang === 'hr') return h;
  if (short) {
    if (h && (!veryClear || a.lang === h)) return h;
    return veryClear || (clear && n >= 30) ? a.lang : h;
  }
  // Two languages close in what they score (Danish and Norwegian, Indonesian and Malay): the page's own word decides.
  if (h && h !== a.lang) {
    const hs = ranked.find((x) => x.lang === h)?.score ?? 0;
    if (hs > 0 && hs >= a.score * 0.8 && a.score - hs < 0.08) return h;
  }
  if (clear) return a.lang;
  // Unsure: the page's word, else the language that stands alone at the top, else nothing.
  if (h) return h;
  const near = ranked.filter((x) => x.score >= a.score * 0.9);
  return a.score >= 0.1 && near.length === 1 ? a.lang : undefined;
}
