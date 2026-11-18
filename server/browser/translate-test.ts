// Script tests for translating pages in your own browsing: the language of a page found from its words (sentences in
// sixty languages, short and ambiguous texts, a hint that is wrong), the model's answer read back (a good one, a missing
// segment, marks lost or reordered, a line that goes on), the engine with a stand-in tab and model (the first batch small,
// batches at once up to the limit, what is remembered, a failed call once more then failed, a segment that comes back
// wrong asked again then given up on, stop, a new document ending it, content that comes later, another language, a page
// of a language you always translate and a site you never do), the routes, and the code that runs in a page in a real
// Chromium when there is one (what is found and what is left alone, a round trip that leaves the page as it was, words
// moved between the pieces of a sentence, the screen first on a long page, content that comes late or that the page
// changes, a web component's shadow root, the reader's root).
//   OUTDIR=dist/dev node scripts/build-server.mjs server/browser/translate-test.ts
//   DATA_DIR=/tmp/hydor-test-translate node dist/dev/translate-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { TRANSLATE_LANGS, type TabTranslation } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { ruleFor } from '../guide/api.ts';
import { Cdp } from './cdp.ts';
import { findChromes, launchChrome } from './chrome.ts';
import { detectLanguage, hintLang } from './langdetect.ts';
import { numbered, parseAnswer, onSite, siteOf, translateRoutes, translateSystem, PageTranslations, type LiveTab, type PageTranslationOptions, type TranslateQuestion } from './translate.ts';
import { failScript, installScript, progressScript, putScript, restoreScript, sampleScript, startScript, takeScript } from './translate-page.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

let passed = 0;
let failed = 0;
const check = async (name: string, fn: () => Promise<void> | void) => {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
    process.exitCode = 1;
  }
};

const dir = process.env.DATA_DIR!;
fs.mkdirSync(dir, { recursive: true });
let n = 0;
const fresh = () => openDb(path.join(dir, `translate-${++n}-${process.pid}.db`), { cacheMb: 8 });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (what: string, fn: () => boolean | Promise<boolean>, ms = 4000) => {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await wait(10);
  }
};

// ---- sentences ----------------------------------------------------------------------------------------------------

/** One sentence about a fox in each language. */
const FOX: Record<string, string> = {
  en: 'The quick brown fox jumps over the lazy dog, and then it goes back to the forest where it lives with all of the other animals that we have seen today.',
  de: 'Der schnelle braune Fuchs springt über den faulen Hund und läuft dann zurück in den Wald, wo er mit allen anderen Tieren lebt, die wir heute gesehen haben.',
  fr: "Le renard brun rapide saute par-dessus le chien paresseux, puis il retourne dans la forêt où il vit avec tous les autres animaux que nous avons vus aujourd'hui.",
  es: 'El rápido zorro marrón salta sobre el perro perezoso y luego vuelve al bosque donde vive con todos los demás animales que hemos visto hoy.',
  it: 'La veloce volpe marrone salta sopra il cane pigro e poi torna nella foresta dove vive con tutti gli altri animali che abbiamo visto oggi.',
  pt: 'A rápida raposa marrom pula sobre o cão preguiçoso e depois volta para a floresta onde vive com todos os outros animais que vimos hoje.',
  nl: 'De snelle bruine vos springt over de luie hond en gaat dan terug naar het bos waar hij woont met alle andere dieren die we vandaag hebben gezien.',
  sv: 'Den snabba bruna räven hoppar över den lata hunden och går sedan tillbaka till skogen där den bor med alla andra djur som vi har sett idag.',
  da: 'Den hurtige brune ræv springer over den dovne hund og går så tilbage til skoven, hvor den bor sammen med alle de andre dyr, som vi har set i dag.',
  no: 'Den raske brune reven hopper over den late hunden og går så tilbake til skogen der den bor sammen med alle de andre dyrene som vi har sett i dag.',
  fi: 'Nopea ruskea kettu hyppää laiskan koiran yli ja palaa sitten metsään, jossa se asuu kaikkien muiden eläinten kanssa, jotka olemme nähneet tänään.',
  is: 'Sá fljóti brúni refur stekkur yfir lata hundinn og fer svo aftur í skóginn þar sem hann býr með öllum hinum dýrunum sem við höfum séð í dag.',
  pl: 'Szybki brązowy lis przeskakuje nad leniwym psem, a potem wraca do lasu, w którym mieszka ze wszystkimi innymi zwierzętami, które widzieliśmy dzisiaj.',
  cs: 'Rychlá hnědá liška přeskočí líného psa a potom se vrátí do lesa, kde žije se všemi ostatními zvířaty, která jsme dnes viděli.',
  sk: 'Rýchla hnedá líška preskočí lenivého psa a potom sa vráti do lesa, kde žije so všetkými ostatnými zvieratami, ktoré sme dnes videli.',
  sl: 'Hitra rjava lisica skoči čez lenega psa in se nato vrne v gozd, kjer živi z vsemi drugimi živalmi, ki smo jih danes videli.',
  hr: 'Brza smeđa lisica preskače lijenog psa i zatim se vraća u šumu u kojoj živi sa svim ostalim životinjama koje smo danas vidjeli.',
  ro: 'Vulpea maro rapidă sare peste câinele leneș și apoi se întoarce în pădurea în care locuiește cu toate celelalte animale pe care le-am văzut astăzi.',
  hu: 'A gyors barna róka átugrik a lusta kutya felett, majd visszamegy az erdőbe, ahol az összes többi állattal él, amelyeket ma láttunk.',
  sq: 'Dhelpra e shpejtë kafe kërcen mbi qenin dembel dhe pastaj kthehet në pyllin ku jeton me të gjitha kafshët e tjera që pamë sot.',
  lt: 'Greita ruda lapė peršoka tinginį šunį ir tada grįžta į mišką, kuriame gyvena kartu su visais kitais gyvūnais, kuriuos šiandien matėme.',
  lv: 'Ātrā brūnā lapsa pārlec pāri slinkajam sunim un tad atgriežas mežā, kurā tā dzīvo kopā ar visiem pārējiem dzīvniekiem, ko mēs šodien redzējām.',
  et: 'Kiire pruun rebane hüppab üle laisa koera ja läheb siis tagasi metsa, kus ta elab koos kõigi teiste loomadega, keda me täna nägime.',
  tr: 'Hızlı kahverengi tilki tembel köpeğin üzerinden atlar ve sonra bugün gördüğümüz diğer tüm hayvanlarla birlikte yaşadığı ormana geri döner.',
  az: 'Sürətli qəhvəyi tülkü tənbəl itin üstündən tullanır və sonra bu gün gördüyümüz bütün digər heyvanlarla birlikdə yaşadığı meşəyə qayıdır.',
  id: 'Rubah cokelat yang cepat melompati anjing yang malas, lalu kembali ke hutan tempat ia tinggal bersama semua hewan lain yang kita lihat hari ini.',
  ms: 'Musang coklat yang pantas melompat ke atas anjing yang malas, kemudian kembali ke hutan tempat ia tinggal bersama semua haiwan lain yang kita lihat hari ini.',
  tl: 'Ang mabilis na kayumangging soro ay tumalon sa ibabaw ng tamad na aso at pagkatapos ay bumalik sa kagubatan kung saan siya nakatira kasama ang lahat ng iba pang mga hayop na nakita natin ngayon.',
  vi: 'Con cáo nâu nhanh nhẹn nhảy qua con chó lười biếng rồi quay trở lại khu rừng nơi nó sống cùng với tất cả những con vật khác mà chúng ta đã thấy hôm nay.',
  sw: 'Mbweha wa kahawia mwepesi anaruka juu ya mbwa mvivu na kisha anarudi msituni ambako anaishi pamoja na wanyama wengine wote ambao tumewaona leo.',
  ca: 'La ràpida guineu marró salta per sobre del gos mandrós i després torna al bosc on viu amb tots els altres animals que hem vist avui.',
  eu: 'Azeri marroi azkarrak txakur alferraren gainetik salto egiten du eta gero basora itzultzen da, bertan gaur ikusi ditugun beste animalia guztiekin bizi baita.',
  gl: 'A rápida raposa marrón salta sobre o can preguizoso e despois volve ao bosque onde vive con todos os outros animais que vimos hoxe.',
  cy: "Mae'r cadno brown cyflym yn neidio dros y ci diog ac yna mae'n mynd yn ôl i'r goedwig lle mae'n byw gyda'r holl anifeiliaid eraill a welsom heddiw.",
  ga: 'Léimeann an sionnach donn tapa thar an madra leisciúil agus ansin filleann sé ar an gcoill ina bhfuil sé ina chónaí leis na hainmhithe eile go léir a chonaic muid inniu.',
  af: 'Die vinnige bruin jakkals spring oor die lui hond en gaan dan terug na die bos waar hy saam met al die ander diere woon wat ons vandag gesien het.',
  el: 'Η γρήγορη καφέ αλεπού πηδά πάνω από τον τεμπέλη σκύλο και μετά γυρίζει στο δάσος όπου ζει με όλα τα άλλα ζώα που είδαμε σήμερα.',
  ru: 'Быстрая коричневая лиса прыгает через ленивую собаку, а затем возвращается в лес, где она живёт со всеми другими животными, которых мы видели сегодня.',
  uk: 'Швидка руда лисиця стрибає через лінивого собаку, а потім повертається до лісу, де вона живе разом з усіма іншими тваринами, яких ми бачили сьогодні.',
  bg: 'Бързата кафява лисица прескача мързеливото куче и после се връща в гората, където живее със всички други животни, които видяхме днес.',
  sr: 'Брза смеђа лисица прескаче лењог пса и затим се враћа у шуму у којој живи са свим осталим животињама које смо данас видели.',
  mk: 'Брзата кафеава лисица прескокнува мрзливо куче и потоа се враќа во шумата каде што живее со сите други животни што ги видовме денес.',
  be: 'Хуткая карычневая ліса пераскоквае праз лянівага сабаку, а потым вяртаецца ў лес, дзе яна жыве разам з усімі іншымі жывёламі, якіх мы бачылі сёння.',
  kk: 'Жылдам қоңыр түлкі жалқау итті секіріп өтеді де, содан кейін біз бүгін көрген барлық басқа жануарлармен бірге өмір сүретін орманға оралады.',
  ja: '素早い茶色のキツネは怠け者の犬を飛び越えて、それから今日私たちが見た他のすべての動物と一緒に住んでいる森に戻ります。',
  ko: '빠른 갈색 여우는 게으른 개를 뛰어넘은 다음 우리가 오늘 본 다른 모든 동물들과 함께 살고 있는 숲으로 돌아갑니다.',
  zh: '敏捷的棕色狐狸跳过了懒惰的狗，然后回到它和我们今天看到的所有其他动物一起生活的森林里。这个故事说明了很多问题。',
  'zh-TW': '敏捷的棕色狐狸跳過了懶惰的狗，然後回到牠和我們今天看到的所有其他動物一起生活的森林裡。這個故事說明了很多問題。',
  ar: 'يقفز الثعلب البني السريع فوق الكلب الكسول ثم يعود إلى الغابة حيث يعيش مع جميع الحيوانات الأخرى التي رأيناها اليوم.',
  fa: 'روباه قهوه‌ای تیزپا از روی سگ تنبل می‌پرد و سپس به جنگلی برمی‌گردد که در آن با همه حیوانات دیگری که امروز دیدیم زندگی می‌کند.',
  ur: 'تیز بھورا لومڑی سست کتے کے اوپر سے چھلانگ لگاتا ہے اور پھر جنگل میں واپس چلا جاتا ہے جہاں وہ ان تمام دوسرے جانوروں کے ساتھ رہتا ہے جنہیں ہم نے آج دیکھا۔',
  he: 'השועל החום המהיר קופץ מעל הכלב העצלן ואז חוזר ליער שבו הוא חי עם כל שאר החיות שראינו היום.',
  th: 'สุนัขจิ้งจอกสีน้ำตาลตัวเร็วกระโดดข้ามสุนัขขี้เกียจแล้วกลับเข้าไปในป่าที่มันอาศัยอยู่กับสัตว์อื่นๆ ทั้งหมดที่เราเห็นในวันนี้',
  hi: 'तेज़ भूरी लोमड़ी आलसी कुत्ते के ऊपर से कूदती है और फिर जंगल में वापस चली जाती है जहाँ वह उन सभी अन्य जानवरों के साथ रहती है जिन्हें हमने आज देखा।',
  mr: 'वेगवान तपकिरी कोल्हा आळशी कुत्र्यावरून उडी मारतो आणि मग जंगलात परत जातो जिथे तो आज आपण पाहिलेल्या सर्व इतर प्राण्यांसोबत राहतो आणि तिथे आनंदी आहे.',
  bn: 'দ্রুত বাদামী শিয়াল অলস কুকুরের উপর দিয়ে লাফ দেয় এবং তারপর বনে ফিরে যায় যেখানে সে আজ আমাদের দেখা অন্যান্য সব প্রাণীর সাথে বাস করে।',
  ta: 'வேகமான பழுப்பு நரி சோம்பேறி நாயின் மேல் குதித்து, பின்னர் இன்று நாம் பார்த்த மற்ற எல்லா விலங்குகளுடனும் வாழும் காட்டுக்குத் திரும்பிச் செல்கிறது.',
  te: 'వేగవంతమైన గోధుమ రంగు నక్క సోమరి కుక్క మీదుగా దూకి, ఆపై ఈ రోజు మనం చూసిన ఇతర జంతువులన్నిటితో నివసించే అడవికి తిరిగి వెళ్తుంది.',
  ka: 'სწრაფი ყავისფერი მელა ხტება ზარმაც ძაღლზე და შემდეგ ბრუნდება ტყეში, სადაც ის ცხოვრობს ყველა სხვა ცხოველთან ერთად, რომლებიც დღეს ვნახეთ.',
  hy: 'Արագ շագանակագույն աղվեսը թռչում է ծույլ շան վրայով և հետո վերադառնում է անտառ, որտեղ ապրում է բոլոր մյուս կենդանիների հետ, որոնց այսօր տեսանք։',
  am: 'ፈጣኑ ቡናማ ቀበሮ ሰነፉን ውሻ ዘሎ ይሄዳል ከዚያም ዛሬ ካየናቸው ሌሎች እንስሳት ሁሉ ጋር ወደሚኖርበት ጫካ ይመለሳል።',
};

/** A cookie notice in each of many languages: web text, not a story. */
const COOKIES: Record<string, string> = {
  da: 'Vi bruger cookies til at give dig den bedste oplevelse på vores hjemmeside. Hvis du fortsætter med at bruge siden, accepterer du, at vi gemmer oplysninger om dit besøg. Læs mere om vores privatlivspolitik.',
  no: 'Vi bruker informasjonskapsler for å gi deg den beste opplevelsen på nettsiden vår. Hvis du fortsetter å bruke siden, godtar du at vi lagrer opplysninger om besøket ditt. Les mer om personvernerklæringen vår.',
  sv: 'Vi använder cookies för att ge dig den bästa upplevelsen på vår webbplats. Om du fortsätter att använda sidan godkänner du att vi sparar information om ditt besök. Läs mer om vår integritetspolicy.',
  id: 'Kami menggunakan cookie untuk memberikan pengalaman terbaik di situs web kami. Jika Anda terus menggunakan situs ini, Anda setuju bahwa kami menyimpan informasi tentang kunjungan Anda. Baca selengkapnya tentang kebijakan privasi kami.',
  ms: 'Kami menggunakan kuki untuk memberikan anda pengalaman terbaik di laman web kami. Jika anda terus menggunakan laman ini, anda bersetuju bahawa kami menyimpan maklumat tentang lawatan anda. Baca lebih lanjut tentang dasar privasi kami.',
  nl: 'Wij gebruiken cookies om u de beste ervaring op onze website te bieden. Als u de site blijft gebruiken, gaat u ermee akkoord dat wij informatie over uw bezoek opslaan. Lees meer over ons privacybeleid.',
  af: 'Ons gebruik koekies om vir jou die beste ervaring op ons webwerf te bied. As jy die webwerf bly gebruik, stem jy in dat ons inligting oor jou besoek stoor. Lees meer oor ons privaatheidsbeleid.',
  es: 'Utilizamos cookies para ofrecerte la mejor experiencia en nuestro sitio web. Si continúas usando el sitio, aceptas que guardemos información sobre tu visita. Lee más sobre nuestra política de privacidad.',
  pt: 'Utilizamos cookies para oferecer a melhor experiência no nosso site. Se continuar a usar o site, concorda que guardemos informações sobre a sua visita. Leia mais sobre a nossa política de privacidade.',
  gl: 'Utilizamos cookies para ofrecerche a mellor experiencia no noso sitio web. Se continúas a usar o sitio, aceptas que gardemos información sobre a túa visita. Le máis sobre a nosa política de privacidade.',
  ca: 'Utilitzem galetes per oferir-te la millor experiència al nostre lloc web. Si continues utilitzant el lloc, acceptes que desem informació sobre la teva visita. Llegeix més sobre la nostra política de privadesa.',
  it: 'Utilizziamo i cookie per offrirti la migliore esperienza sul nostro sito web. Se continui a usare il sito, accetti che salviamo informazioni sulla tua visita. Leggi di più sulla nostra politica sulla privacy.',
  fr: 'Nous utilisons des cookies pour vous offrir la meilleure expérience sur notre site web. Si vous continuez à utiliser le site, vous acceptez que nous enregistrions des informations sur votre visite. En savoir plus sur notre politique de confidentialité.',
  de: 'Wir verwenden Cookies, um Ihnen die beste Erfahrung auf unserer Website zu bieten. Wenn Sie die Seite weiterhin nutzen, stimmen Sie zu, dass wir Informationen über Ihren Besuch speichern. Lesen Sie mehr in unserer Datenschutzerklärung.',
  en: 'We use cookies to give you the best experience on our website. If you continue to use the site, you agree that we store information about your visit. Read more about our privacy policy.',
  cs: 'Používáme soubory cookie, abychom vám poskytli co nejlepší zážitek na našem webu. Pokud budete web nadále používat, souhlasíte s tím, že ukládáme informace o vaší návštěvě. Přečtěte si více o našich zásadách ochrany osobních údajů.',
  sk: 'Používame súbory cookie, aby sme vám poskytli čo najlepší zážitok na našej webovej stránke. Ak budete stránku naďalej používať, súhlasíte s tým, že ukladáme informácie o vašej návšteve. Prečítajte si viac o našich zásadách ochrany osobných údajov.',
  hr: 'Koristimo kolačiće kako bismo vam pružili najbolje iskustvo na našoj web stranici. Ako nastavite koristiti stranicu, pristajete na to da spremamo informacije o vašem posjetu. Pročitajte više o našoj politici privatnosti.',
  sl: 'Uporabljamo piškotke, da vam zagotovimo najboljšo izkušnjo na naši spletni strani. Če boste stran še naprej uporabljali, se strinjate, da shranjujemo podatke o vašem obisku. Preberite več o naši politiki zasebnosti.',
  pl: 'Używamy plików cookie, aby zapewnić Ci jak najlepsze doświadczenia na naszej stronie internetowej. Jeśli będziesz nadal korzystać z witryny, zgadzasz się na zapisywanie informacji o Twojej wizycie. Przeczytaj więcej o naszej polityce prywatności.',
  tr: 'Web sitemizde size en iyi deneyimi sunmak için çerezleri kullanıyoruz. Siteyi kullanmaya devam ederseniz, ziyaretiniz hakkında bilgileri saklamamızı kabul etmiş olursunuz. Gizlilik politikamız hakkında daha fazla bilgi edinin.',
  az: 'Veb saytımızda sizə ən yaxşı təcrübəni təqdim etmək üçün çerezlərdən istifadə edirik. Saytdan istifadə etməyə davam etsəniz, ziyarətiniz haqqında məlumatları saxlamağımızla razılaşırsınız. Məxfilik siyasətimiz haqqında ətraflı oxuyun.',
  fi: 'Käytämme evästeitä parhaan mahdollisen käyttökokemuksen tarjoamiseksi verkkosivustollamme. Jos jatkat sivuston käyttöä, hyväksyt, että tallennamme tietoja vierailustasi. Lue lisää tietosuojakäytännöstämme.',
  et: 'Kasutame oma veebisaidil küpsiseid, et pakkuda sulle parimat kogemust. Kui jätkad saidi kasutamist, nõustud sellega, et salvestame teavet sinu külastuse kohta. Loe lähemalt meie privaatsuspoliitikast.',
  hu: 'Sütiket használunk, hogy a legjobb élményt nyújtsuk weboldalunkon. Ha folytatja az oldal használatát, elfogadja, hogy információkat tárolunk a látogatásáról. Olvasson többet adatvédelmi irányelveinkről.',
  ro: 'Folosim cookie-uri pentru a vă oferi cea mai bună experiență pe site-ul nostru. Dacă continuați să folosiți site-ul, sunteți de acord că stocăm informații despre vizita dumneavoastră. Citiți mai multe despre politica noastră de confidențialitate.',
  ru: 'Мы используем файлы cookie, чтобы обеспечить вам наилучший опыт работы на нашем сайте. Если вы продолжите использовать сайт, вы соглашаетесь с тем, что мы сохраняем информацию о вашем посещении.',
  uk: 'Ми використовуємо файли cookie, щоб забезпечити вам найкращий досвід роботи на нашому сайті. Якщо ви продовжите користуватися сайтом, ви погоджуєтеся з тим, що ми зберігаємо інформацію про ваш візит.',
  bg: 'Използваме бисквитки, за да ви предоставим най-доброто изживяване на нашия уебсайт. Ако продължите да използвате сайта, вие се съгласявате, че съхраняваме информация за вашето посещение.',
  ja: '当サイトでは、より良いサービスを提供するためにクッキーを使用しています。サイトを引き続きご利用いただく場合、訪問に関する情報の保存に同意したものとみなされます。',
  zh: '我们使用 Cookie 来为您提供最佳的网站体验。如果您继续使用本网站，即表示您同意我们保存有关您访问的信息。',
  'zh-TW': '我們使用 Cookie 來為您提供最佳的網站體驗。如果您繼續使用本網站，即表示您同意我們儲存有關您訪問的資訊。',
  vi: 'Chúng tôi sử dụng cookie để mang đến cho bạn trải nghiệm tốt nhất trên trang web của chúng tôi. Nếu bạn tiếp tục sử dụng trang web, bạn đồng ý rằng chúng tôi lưu trữ thông tin về lượt truy cập của bạn.',
  tl: 'Gumagamit kami ng cookies upang mabigyan ka ng pinakamahusay na karanasan sa aming website. Kung patuloy mong gagamitin ang site, sumasang-ayon ka na iniimbak namin ang impormasyon tungkol sa iyong pagbisita.',
  is: 'Við notum vafrakökur til að gefa þér bestu upplifunina á vefsíðunni okkar. Ef þú heldur áfram að nota vefsíðuna samþykkir þú að við vistum upplýsingar um heimsókn þína.',
  lt: 'Mes naudojame slapukus, kad suteiktume jums geriausią patirtį mūsų svetainėje. Jei toliau naudositės svetaine, sutinkate, kad saugotume informaciją apie jūsų apsilankymą.',
  lv: 'Mēs izmantojam sīkdatnes, lai nodrošinātu jums vislabāko pieredzi mūsu vietnē. Ja turpināsiet izmantot vietni, jūs piekrītat, ka mēs saglabājam informāciju par jūsu apmeklējumu.',
  sw: 'Tunatumia vidakuzi ili kukupa uzoefu bora zaidi kwenye tovuti yetu. Ukiendelea kutumia tovuti, unakubali kwamba tunahifadhi taarifa kuhusu ziara yako.',
  cy: "Rydym yn defnyddio cwcis i roi'r profiad gorau i chi ar ein gwefan. Os byddwch yn parhau i ddefnyddio'r wefan, rydych yn cytuno ein bod yn storio gwybodaeth am eich ymweliad.",
  sq: "Ne përdorim cookies për t'ju ofruar përvojën më të mirë në faqen tonë të internetit. Nëse vazhdoni të përdorni faqen, ju pranoni që ne ruajmë informacione për vizitën tuaj.",
};

// ---- a stand-in tab -------------------------------------------------------------------------------------------------------

/** What the page code does, in miniature: segments handed out in order, on their way, done, given up on, put back. */
class FakePage {
  gen = 0;
  started = false;
  segs: { id: string; text: string; state: 0 | 1 | 2 | 3; tries: number }[] = [];
  applied = new Map<string, string>();
  restored = 0;
  failedIds: string[] = [];
  started_to: string[] = [];
  constructor(public texts: string[]) {}
  begin(to: string) {
    this.gen++;
    this.started = true;
    this.started_to.push(to);
    this.applied.clear();
    this.segs = this.texts.map((text, i) => ({ id: `${this.gen}.${i + 1}`, text, state: 0, tries: 0 }));
  }
  /** Content that came later. */
  add(texts: string[]) {
    for (const text of texts) this.segs.push({ id: `${this.gen}.${this.segs.length + 1}`, text, state: 0, tries: 0 });
  }
  take(maxChars: number, maxCount: number) {
    const out: { id: string; text: string }[] = [];
    let chars = 0;
    for (const s of this.segs) {
      if (s.state !== 0) continue;
      if (out.length >= maxCount || (out.length && chars + s.text.length > maxChars)) break;
      s.state = 1;
      chars += s.text.length;
      out.push({ id: s.id, text: s.text });
    }
    return out;
  }
  put(rs: { id: string; text: string }[]) {
    let k = 0;
    for (const r of rs) {
      const s = this.segs.find((x) => x.id === r.id);
      if (!s || s.state !== 1) continue;
      s.state = 2;
      this.applied.set(r.id, r.text);
      k++;
    }
    return k;
  }
  fail(ids: string[]) {
    this.failedIds.push(...ids);
    for (const id of ids) {
      const s = this.segs.find((x) => x.id === id);
      if (!s || s.state !== 1) continue;
      if (s.tries < 1) {
        s.tries++;
        s.state = 0;
      } else s.state = 3;
    }
    return ids.length;
  }
  progress() {
    return { done: this.segs.filter((s) => s.state >= 2).length, total: this.segs.length };
  }
  restore() {
    const k = this.applied.size;
    this.restored++;
    this.applied.clear();
    this.segs = [];
    this.started = false;
    return k;
  }
}

class FakeTab implements LiveTab {
  closed = false;
  navigating = false;
  loadedAt = 1;
  lang: string | undefined;
  translation: TabTranslation | undefined;
  changes = 0;
  samples = 0;
  owner = { changed: () => void this.changes++ };
  page: FakePage;
  sampleText = '';
  sampleLang = '';
  constructor(
    public targetId: string,
    public url: string,
    texts: string[] = [],
  ) {
    this.page = new FakePage(texts);
  }
  /** The page becomes another document: its code and what it holds are gone, and Tab.newDocument clears the rest. */
  newDocument(texts: string[] = []) {
    this.page = new FakePage(texts);
    this.lang = undefined;
    this.translation = undefined;
    this.loadedAt++;
  }
  async evaluate<T>(expression: string): Promise<T> {
    if (this.closed) throw new Error('Target closed');
    const m = /globalThis\.__hydorTr\??\.(\w+)\(([^\n]*)\)(?: \?\? null)?\s*$/.exec(expression);
    if (!m) throw new Error(`not a call: ${expression.slice(-80)}`);
    const args = JSON.parse(`[${m[2]}]`) as any[];
    const p = this.page;
    switch (m[1]) {
      case 'sample':
        this.samples++;
        return { lang: this.sampleLang, text: this.sampleText } as T;
      case 'start':
        p.begin(args[0]);
        return true as T;
    }
    if (!p.started) return null as T;
    switch (m[1]) {
      case 'take':
        return p.take(args[0], args[1]) as T;
      case 'put':
        return p.put(args[0]) as T;
      case 'fail':
        return p.fail(args[0]) as T;
      case 'progress':
        return p.progress() as T;
      case 'restore':
        return p.restore() as T;
    }
    throw new Error(`unknown call ${m[1]}`);
  }
}

const upperAnswer = (prompt: string) =>
  prompt
    .split('\n')
    .map((l) => l.replace(/^\[(\d+)\] (.*)$/, (_, k, t) => `[${k}] ${t.toUpperCase()}`))
    .join('\n');

/** An engine with stand-ins: its tabs, the questions it asked, and a model that answers in capitals unless told otherwise. */
function engine(o: Partial<PageTranslationOptions> & { answer?: (q: TranslateQuestion, call: number) => string | Promise<string> } = {}) {
  const tabs: FakeTab[] = [];
  const asks: TranslateQuestion[] = [];
  let active = 0;
  let peak = 0;
  const { answer, ...rest } = o;
  const live = new PageTranslations(fresh(), () => tabs, {
    ask: async (q) => {
      asks.push(q);
      active++;
      peak = Math.max(peak, active);
      try {
        await wait(5);
        return answer ? await answer(q, asks.length) : upperAnswer(q.prompt);
      } finally {
        active--;
      }
    },
    prefs: () => ({ translateTo: 'en', translateOffer: true, translateAlways: [], translateNever: [], translateNeverSites: [] }),
    parallel: () => 2,
    model: () => 'the fake model',
    pollMs: 15,
    retryMs: 0,
    ...rest,
  });
  return { live, tabs, asks, peak: () => peak };
}

const lines = (count: number, len = 100) => Array.from({ length: count }, (_, i) => `Segment ${i + 1} ${'x'.repeat(len - 12)}`);
const settled = (t: FakeTab, state = 'translated') => until(`state ${state}`, () => t.translation?.state === state);

// ---- the page --------------------------------------------------------------------------------------------------------

const PAGE = `<!doctype html><html lang="en"><head><title>Test page</title></head><body>
<h1>Welcome to the shop</h1>
<p id="p1">Click <a href="#x">here</a> to read more about <b>our products</b>, which are great.</p>
<div id="d1">Outer text <div id="inner">Inner block text</div> and after.</div>
<p id="no1" translate="no">Do not translate this.</p><p id="no2" class="notranslate">Nor this one.</p>
<div contenteditable="true" id="ed">Editable words</div>
<pre>code block here</pre><code style="display:block">block code</code>
<p id="p2">Use the <code>npm install</code> command, and 25 more.</p>
<p id="nums">12 34 56</p>
<input id="in1" placeholder="Search the site" title="Searching"> <input id="in2" type="submit" value="Send it"> <textarea>Typed words</textarea>
<ul><li>First item</li><li>Second item</li></ul>
<div style="display:flex"><span>Flex one</span><span>Flex two</span></div>
<div id="late"></div>
<p id="odd">Brackets ⟦like⟧ these stay.</p>
<script>setTimeout(function(){ document.getElementById('late').innerHTML = '<p>This paragraph arrived late.</p>'; }, 1500);</script>
</body></html>`;

const LONG = `<!doctype html><html lang="en"><body style="margin:0">${Array.from(
  { length: 400 },
  (_, i) => `<p id="q${i}" style="height:100px;margin:0;overflow:hidden">Paragraph ${i} ${'word '.repeat(190)}</p>`,
).join('')}</body></html>`;

const COMPONENTS = `<!doctype html><html lang="en"><body>
<p id="light">Light words here.</p>
<div id="host"></div>
<script>var sr = document.getElementById('host').attachShadow({ mode: 'open' }); sr.innerHTML = '<p id="sp">Shadow words inside.</p><p>Second shadow words.</p>';</script>
<div id="rd"></div>
</body></html>`;

async function main() {
  // ---- finding the language -----------------------------------------------------------------------------------------

  await check('language: a sentence in each of 61 languages (every language of the list that has one)', () => {
    const wrong: string[] = [];
    for (const [lang, text] of Object.entries(FOX)) if (detectLanguage(text) !== lang) wrong.push(`${lang} → ${detectLanguage(text)}`);
    assert.deepEqual(wrong, []);
    assert.ok(Object.keys(FOX).length >= 60);
  });

  await check('language: a cookie notice, as web text is, in 40 languages (the close ones too: Danish and Norwegian, Indonesian and Malay, Galician)', () => {
    const wrong: string[] = [];
    for (const [lang, text] of Object.entries(COOKIES)) if (detectLanguage(text) !== lang) wrong.push(`${lang} → ${detectLanguage(text)}`);
    assert.deepEqual(wrong, []);
  });

  await check('language: every code it answers with is one the browser translates', () => {
    const codes = new Set(TRANSLATE_LANGS.map((l) => l.code));
    for (const t of [...Object.values(FOX), ...Object.values(COOKIES)]) assert.ok(codes.has(detectLanguage(t)!), t);
  });

  await check('language: the page’s own word (en-US, zh-Hant, zh-HK, nb, nn, iw, in, fil) is read as a code of the list', () => {
    assert.equal(hintLang('en-US'), 'en');
    assert.equal(hintLang('EN_gb'), 'en');
    assert.equal(hintLang('pt-BR'), 'pt');
    assert.equal(hintLang('zh-Hant'), 'zh-TW');
    assert.equal(hintLang('zh-Hant-TW'), 'zh-TW');
    assert.equal(hintLang('zh-TW'), 'zh-TW');
    assert.equal(hintLang('zh-HK'), 'zh-TW');
    assert.equal(hintLang('zh-Hans'), 'zh');
    assert.equal(hintLang('zh-CN'), 'zh');
    assert.equal(hintLang('zh'), 'zh');
    assert.equal(hintLang('nb'), 'no');
    assert.equal(hintLang('nn-NO'), 'no');
    assert.equal(hintLang('iw'), 'he');
    assert.equal(hintLang('in'), 'id');
    assert.equal(hintLang('fil'), 'tl');
    for (const bad of ['', '  ', 'x-default', 'tlh', 'mul', undefined, null]) assert.equal(hintLang(bad as any), undefined, String(bad));
  });

  await check('language: too little text is the page’s word, or nothing', () => {
    assert.equal(detectLanguage(''), undefined);
    assert.equal(detectLanguage('', 'fr'), 'fr');
    assert.equal(detectLanguage('   123 456 !!', 'de-AT'), 'de');
    assert.equal(detectLanguage('Welcome to our shop'), undefined);
    assert.equal(detectLanguage('Welcome to our shop', 'de'), 'de', 'a short text: the hint');
    assert.equal(detectLanguage('iPhone 15 Pro Max 256 GB Apple', 'fr'), 'fr', 'names say nothing: the hint');
    assert.equal(detectLanguage('iPhone 15 Pro Max 256 GB Apple'), undefined);
    assert.equal(detectLanguage('Начало', 'bg'), 'bg', 'Cyrillic without a letter of its own: the hint');
    assert.equal(detectLanguage('Начало'), undefined);
  });

  await check('language: words that clearly say a language beat a wrong hint; a hint decides a close call', () => {
    assert.equal(detectLanguage(FOX.de, 'en'), 'de');
    assert.equal(detectLanguage(COOKIES.fr, 'en-US'), 'fr');
    assert.equal(detectLanguage(FOX.ru, 'en'), 'ru');
    assert.equal(detectLanguage(FOX.ja, 'zh'), 'ja', 'kana is Japanese');
    assert.equal(detectLanguage(FOX.no, 'da'), 'no');
    assert.equal(detectLanguage(FOX.en, 'en-GB'), 'en');
    assert.equal(detectLanguage(FOX.hr, 'sr'), 'sr', 'Serbian in Latin letters reads as Croatian: the page says which');
    assert.equal(detectLanguage(FOX.zh, 'zh-TW'), 'zh', 'simplified characters beat a hint of traditional ones');
    assert.equal(detectLanguage(FOX['zh-TW'], 'zh'), 'zh-TW');
  });

  await check('language: Chinese and Japanese: Han alone, mixed with Latin menus, a hint for what the characters do not tell', () => {
    assert.equal(detectLanguage('日本語の勉強は楽しいです'), 'ja');
    assert.equal(detectLanguage('新闻中心 | 关于我们 | 联系我们', undefined), 'zh');
    assert.equal(detectLanguage('新聞中心'), 'zh', 'nothing tells it from simplified');
    assert.equal(detectLanguage('新聞中心', 'zh-Hant'), 'zh-TW');
    assert.equal(detectLanguage('東京都', 'ja'), 'ja');
    assert.equal(detectLanguage(`Home | About | Contact | Shop | Blog\n${FOX.ja}`), 'ja', 'a Japanese page with an English menu');
    assert.equal(detectLanguage(`Home About Contact Shop Blog Login Search\n${FOX.zh}`), 'zh');
    assert.equal(detectLanguage(`${FOX.en}\nEnglish text with 日本 two words`), 'en', 'an English page with two Japanese words');
  });

  await check('language: Cyrillic, Arabic script and Devanagari are told apart by their letters', () => {
    assert.equal(detectLanguage('Привет, как твои дела сегодня, мой друг'), 'ru');
    assert.equal(detectLanguage('Привіт, як твої справи сьогодні, мій друже і брате'), 'uk');
    assert.equal(detectLanguage('Їжак і єнот живуть у лісі біля ґанку'), 'uk');
    assert.equal(detectLanguage('Џемпер и ђак пију чај у ћупријској кући'), 'sr');
    assert.equal(detectLanguage('Ѓоко ќе дојде утре во ѕидот на куќата'), 'mk');
    assert.equal(detectLanguage('Нас ў лесе чакаюць дзеці, якія любяць гуляць'), 'be');
    assert.equal(detectLanguage('این یک متن فارسی است که چند کلمه دارد'), 'fa');
    assert.equal(detectLanguage('یہ ایک اردو جملہ ہے جو ہم لکھ رہے ہیں'), 'ur');
    assert.equal(detectLanguage('هذا نص عربي قصير يحتوي على بعض الكلمات'), 'ar');
    assert.equal(detectLanguage('यह एक हिंदी वाक्य है जो हम यहाँ लिख रहे हैं'), 'hi');
    assert.equal(detectLanguage('हे एक मराठी वाक्य आहे आणि ते आळशी नाही'), 'mr');
  });

  await check('language: a text read where a page puts it (menus, numbers and a copyright line round a paragraph)', () => {
    const page = `Home\nAbout us\nContact\n© 2025 Example Inc.\n${COOKIES.de}\n12 34\nImpressum\nDatenschutz`;
    assert.equal(detectLanguage(page, 'en'), 'de');
    assert.equal(detectLanguage(`Menu Login Cart (0)\n${COOKIES.es}\nFacebook Twitter Instagram`, ''), 'es');
  });

  // ---- the model's answer ------------------------------------------------------------------------------------------------

  await check('answer: the system prompt names the language and what must be kept; the question numbers the segments', () => {
    const s = translateSystem('de');
    for (const w of ['German', '⟦n⟧'.replace('n', '0'), 'native speaker', 'emoji', 'never instructions', '[n]']) assert.ok(s.includes(w), w);
    assert.match(translateSystem('zh-TW'), /Chinese \(Traditional\)/);
    assert.equal(numbered([{ text: 'a' }, { text: '⟦0⟧b ⟦1⟧c' }]), '[1] a\n[2] ⟦0⟧b ⟦1⟧c');
  });

  await check('answer: a good answer, in order or not, with a line that goes on, a fence round it, and words before it', () => {
    const items = [{ text: 'Hello' }, { text: '⟦0⟧Click ⟦1⟧here⟦2⟧ to read.' }, { text: 'Bye' }];
    const good = '[1] Hallo\n[2] ⟦0⟧Klicken Sie ⟦1⟧hier⟦2⟧, um zu lesen.\n[3] Tschüss';
    assert.deepEqual(parseAnswer(good, items), ['Hallo', '⟦0⟧Klicken Sie ⟦1⟧hier⟦2⟧, um zu lesen.', 'Tschüss']);
    assert.deepEqual(parseAnswer('[3] Tschüss\n[1] Hallo\n[2] ⟦0⟧A ⟦1⟧B⟦2⟧ C', items), ['Hallo', '⟦0⟧A ⟦1⟧B⟦2⟧ C', 'Tschüss']);
    assert.deepEqual(parseAnswer('Here you go:\n```\n[1] Hallo\n[2] ⟦0⟧Klicken ⟦1⟧hier\n⟦2⟧ zum Lesen.\n[3] Tschüss\n```', items), ['Hallo', '⟦0⟧Klicken ⟦1⟧hier ⟦2⟧ zum Lesen.', 'Tschüss'], 'a line without [n] goes on the line before');
    assert.deepEqual(parseAnswer('[1]Hallo\r\n[2]  ⟦0⟧A⟦1⟧B⟦2⟧C \r\n[3] Tschüss', items), ['Hallo', '⟦0⟧A⟦1⟧B⟦2⟧C', 'Tschüss']);
  });

  await check('answer: a missing segment, a segment with its marks lost, doubled or reordered, an empty one, and extra numbers are each left out', () => {
    const items = [{ text: 'One' }, { text: '⟦0⟧A ⟦1⟧B⟦2⟧ C' }, { text: '⟦0⟧D ⟦1⟧E' }, { text: 'Four' }];
    assert.deepEqual(parseAnswer('[1] Eins\n[3] ⟦0⟧D ⟦1⟧E', items), ['Eins', undefined, '⟦0⟧D ⟦1⟧E', undefined], 'missing');
    assert.deepEqual(parseAnswer('[1] Eins\n[2] ⟦0⟧A ⟦1⟧B C\n[3] ⟦0⟧D\n[4] Vier', items), ['Eins', undefined, undefined, 'Vier'], 'a mark lost');
    assert.deepEqual(parseAnswer('[1] Eins\n[2] ⟦0⟧A ⟦1⟧B⟦1⟧ C\n[3] ⟦1⟧E ⟦0⟧D\n[4] Vier', items), ['Eins', undefined, undefined, 'Vier'], 'doubled, reordered');
    assert.deepEqual(parseAnswer('[1] Eins\n[2] extra ⟦0⟧A ⟦1⟧B⟦2⟧ C\n[3] ⟦0⟧D ⟦1⟧\n[4] ', items), ['Eins', undefined, '⟦0⟧D ⟦1⟧', undefined], 'words before the first mark; a piece may be empty; an empty segment');
    assert.deepEqual(parseAnswer('[1] Eins\n[1] Zwei\n[9] Neun\n[0] Null\n[4] Vier', items), ['Eins', undefined, undefined, 'Vier'], 'the first of two with one number; numbers not asked for');
    assert.deepEqual(parseAnswer('[1] Eins ⟦0⟧\n[2] x', [{ text: 'One' }, { text: 'Two' }]), ['Eins', 'x'], 'a stray mark in a one-piece segment');
    assert.deepEqual(parseAnswer('', items), [undefined, undefined, undefined, undefined]);
  });

  await check('sites: a site is its host without www., and covers its subdomains', () => {
    assert.equal(siteOf('https://www.Example.com/a?b#c'), 'example.com');
    assert.equal(siteOf('http://localhost:3000/x'), 'localhost');
    assert.equal(siteOf('file:///a/b.html'), null);
    assert.equal(siteOf('about:blank'), null);
    assert.equal(siteOf('not a url'), null);
    assert.equal(onSite('https://example.com/', ['example.com']), true);
    assert.equal(onSite('https://blog.shop.example.com/', ['example.com']), true);
    assert.equal(onSite('https://notexample.com/', ['example.com']), false);
    assert.equal(onSite('https://example.org/', ['example.com']), false);
    assert.equal(onSite('about:blank', ['example.com']), false);
  });

  // ---- the engine ------------------------------------------------------------------------------------------------------------

  await check('engine: the first batch is small, the rest go in batches up to the limit, two at once; the page shows done and total and ends translated', async () => {
    const { live, tabs, asks, peak } = engine();
    const t = new FakeTab('t1', 'https://a.example/', lines(150, 100));
    t.lang = 'de';
    tabs.push(t);
    void live.start(t, 'en');
    // At once the tab says it is translating, with the model and the language the page was in.
    assert.deepEqual(t.translation, { state: 'translating', to: 'en', from: 'de', done: 0, total: 0, model: 'the fake model' });
    await settled(t);
    assert.deepEqual([t.translation!.done, t.translation!.total], [150, 150]);
    assert.equal(t.page.applied.size, 150);
    for (const [id, text] of t.page.applied) assert.equal(text, t.page.segs.find((s) => s.id === id)!.text.toUpperCase());
    const sizes = asks.map((q) => q.prompt.length);
    assert.ok(asks[0].prompt.split('\n').length <= 12, `the first batch is small: ${asks[0].prompt.split('\n').length} segments`);
    assert.ok(asks[0].prompt.length <= 1400, `${asks[0].prompt.length}`);
    for (const q of asks.slice(1)) {
      assert.ok(q.prompt.split('\n').length <= 40, 'at most 40 segments');
      assert.ok(q.prompt.length <= 3500 + 40 * 6, `a batch is ${q.prompt.length}`);
    }
    assert.ok(Math.max(...sizes.slice(1)) > 2500, 'later batches are bigger');
    assert.equal(peak(), 2, 'two at once, no more');
    assert.match(asks[0].system, /English/);
    assert.equal(asks[0].prompt.split('\n')[0].slice(0, 4), '[1] ');
    await live.stop(t);
    live.close();
  });

  await check('engine: what a page repeats is asked once in a batch, and what was translated before comes at once from the memory (another page, same site)', async () => {
    const { live, tabs, asks } = engine();
    const menu = ['Home', 'About us', 'Contact', 'Home', 'Home', 'Privacy', 'About us'];
    const a = new FakeTab('a', 'https://s.example/1', [...menu, 'Only on page one']);
    const b = new FakeTab('b', 'https://s.example/2', [...menu, 'Only on page two']);
    tabs.push(a, b);
    void live.start(a, 'de');
    await settled(a);
    assert.equal(asks.length, 1, 'one batch');
    const first = asks[0].prompt.split('\n').map((l) => l.replace(/^\[\d+\] /, ''));
    assert.deepEqual(first, ['Home', 'About us', 'Contact', 'Privacy', 'Only on page one'], 'each words once');
    assert.equal(a.page.applied.size, 8, 'every segment, the same words alike');
    assert.equal(live.cached, 5);
    void live.start(b, 'de');
    await settled(b);
    assert.equal(asks.length, 2);
    assert.deepEqual(asks[1].prompt, '[1] Only on page two', 'only what is new is asked');
    assert.equal(b.page.applied.size, 8);
    // Another language is another memory.
    const c = new FakeTab('c', 'https://s.example/3', ['Home']);
    tabs.push(c);
    void live.start(c, 'fr');
    await settled(c);
    assert.equal(asks.length, 3);
    assert.match(asks[2].system, /French/);
    live.close();
  });

  await check('engine: a call that fails is made once more; two failures end it as failed with the model’s own message, and what was translated stays', async () => {
    let calls = 0;
    const { live, tabs, asks } = engine({
      answer: (q, call) => {
        calls++;
        if (call === 1) throw new HttpError(502, 'Your Claude Code account is signed out: sign in again (Settings → Agents → Accounts).');
        return upperAnswer(q.prompt);
      },
    });
    const t = new FakeTab('t', 'https://a.example/', lines(5));
    tabs.push(t);
    void live.start(t, 'en');
    await settled(t);
    // The second try worked: translated, the loop goes on looking.
    assert.equal(calls >= 2, true);
    assert.equal(t.translation?.state, 'translated');
    assert.equal(t.page.applied.size, 5);
    await live.stop(t);

    // Always failing.
    let n2 = 0;
    const e2 = engine({
      answer: (q, call) => {
        n2++;
        if (call <= 2) return upperAnswer(q.prompt);
        throw new HttpError(502, 'Your Claude Code account is signed out: sign in again.');
      },
      parallel: () => 1,
    });
    const u = new FakeTab('u', 'https://a.example/', lines(60, 100));
    e2.tabs.push(u);
    const done = e2.live.start(u, 'en');
    await done;
    assert.equal(u.translation?.state, 'failed');
    assert.match(u.translation!.error!, /signed out/);
    assert.ok(u.page.applied.size > 0 && u.page.applied.size < 60, `what was translated stays: ${u.page.applied.size}`);
    assert.equal(e2.live.translating(u), false, 'the loop ended');
    assert.equal(n2, 4, 'a call and one more try, for each of the two that failed');
    const c = u.changes;
    await wait(80);
    assert.equal(u.changes, c, 'nothing goes on');
    void asks;
    e2.live.close();
    live.close();
  });

  await check('engine: a segment that comes back wrong is asked once more in a batch of its own, then given up on; the others are written at once', async () => {
    const BAD = 'The word that the model cannot translate.';
    const texts = ['One', BAD, '⟦0⟧Click ⟦1⟧here⟦2⟧ please.', 'Four'];
    const seen: string[] = [];
    const { live, tabs, asks } = engine({
      answer: (q) => {
        seen.push(q.prompt);
        return upperAnswer(q.prompt)
          .split('\n')
          .filter((l) => !l.toUpperCase().includes('CANNOT TRANSLATE'))
          .join('\n');
      },
    });
    const t = new FakeTab('t', 'https://a.example/', texts);
    tabs.push(t);
    void live.start(t, 'en');
    await settled(t);
    assert.equal(t.page.applied.size, 3, 'three written');
    assert.deepEqual(
      [...t.page.applied.values()].sort(),
      ['FOUR', 'ONE', '⟦0⟧CLICK ⟦1⟧HERE⟦2⟧ PLEASE.'].sort(),
    );
    // The first batch holds all four; the one that is missing is asked on its own, then fails twice: given up on.
    assert.equal(seen[0].split('\n').length, 4);
    assert.deepEqual(seen.slice(1), Array(3).fill(`[1] ${BAD}`), 'on its own, twice, and once more after the page’s one more try');
    assert.equal(t.page.failedIds.length, 2, 'told the page twice: one more try, then given up');
    assert.equal(t.page.segs.find((s) => s.text === BAD)!.state, 3);
    assert.deepEqual([t.translation!.done, t.translation!.total], [4, 4], 'given up on counts as done');
    assert.equal(asks.length, seen.length);
    live.close();
  });

  await check('engine: marks lost, doubled or reordered by the model fail the segment, which is asked again and fixed when the model gets it right', async () => {
    const texts = ['⟦0⟧Click ⟦1⟧here⟦2⟧ please.', '⟦0⟧A ⟦1⟧B'];
    const answers = ['[1] ⟦1⟧HIER ⟦0⟧KLICK⟦2⟧ BITTE.\n[2] ⟦0⟧A', '[1] ⟦0⟧KLICKEN SIE ⟦1⟧HIER⟦2⟧ BITTE.\n[2] ⟦0⟧A ⟦1⟧B⟦1⟧'];
    const { live, tabs, asks } = engine({ answer: (q, call) => (call <= 2 ? answers[call - 1] : upperAnswer(q.prompt)) });
    const t = new FakeTab('t', 'https://a.example/', texts);
    tabs.push(t);
    void live.start(t, 'de');
    await settled(t);
    assert.equal(asks.length >= 3, true);
    assert.equal(t.page.applied.size, 2);
    assert.equal(t.page.failedIds.length, 1, 'the one that failed twice was told to the page, which gave it one more try');
    live.close();
  });

  await check('engine: stop puts the page back, clears the translation and ends the loop; nothing is written after', async () => {
    const { live, tabs } = engine({ answer: async (q) => (await wait(60), upperAnswer(q.prompt)) });
    const t = new FakeTab('t', 'https://a.example/', lines(100));
    tabs.push(t);
    const done = live.start(t, 'en');
    await until('a first batch written', () => t.page.applied.size > 0);
    await live.stop(t);
    assert.equal(t.translation, undefined);
    assert.equal(t.page.restored, 1);
    assert.equal(t.page.applied.size, 0);
    await done;
    assert.equal(live.translating(t), false);
    await wait(150);
    assert.equal(t.page.applied.size, 0, 'what was on its way is not written into the page that has its own words again');
    live.close();
  });

  await check('engine: a new document ends the loop by itself (its translation is cleared), a closed tab too', async () => {
    const { live, tabs } = engine();
    const t = new FakeTab('t', 'https://a.example/', lines(10));
    tabs.push(t);
    const done = live.start(t, 'en');
    await settled(t);
    t.newDocument(lines(3));
    await done;
    assert.equal(live.translating(t), false);
    assert.equal(t.translation, undefined);
    assert.equal(t.page.applied.size, 0, 'the new page is as it came');
    const u = new FakeTab('u', 'https://a.example/', lines(10));
    tabs.push(u);
    const d2 = live.start(u, 'en');
    await settled(u);
    u.closed = true;
    await d2;
    assert.equal(live.translating(u), false);
    assert.notEqual(u.translation?.state, 'failed');
    live.close();
  });

  await check('engine: a page that went away under a call ends quietly, not as failed', async () => {
    const { live, tabs } = engine({ answer: async (q) => (await wait(40), upperAnswer(q.prompt)) });
    const t = new FakeTab('t', 'https://a.example/', lines(30));
    tabs.push(t);
    const done = live.start(t, 'en');
    await wait(15);
    t.navigating = true;
    t.closed = true;
    await done;
    assert.notEqual(t.translation?.state, 'failed');
    live.close();
  });

  await check('engine: content that comes later is found, translated, and the state goes translating → translated again', async () => {
    const { live, tabs } = engine();
    const t = new FakeTab('t', 'https://a.example/', lines(3));
    tabs.push(t);
    void live.start(t, 'en');
    await settled(t);
    t.page.add(['Later words one', 'Later words two']);
    await until('translating again', () => t.page.applied.size === 5);
    await settled(t);
    assert.deepEqual([t.translation!.done, t.translation!.total], [5, 5]);
    live.close();
  });

  await check('engine: translating again in another language puts the page back first and asks in the new one', async () => {
    const { live, tabs, asks } = engine();
    const t = new FakeTab('t', 'https://a.example/', ['Hello world', 'Goodbye']);
    tabs.push(t);
    const first = live.start(t, 'de');
    await settled(t);
    const old = t.translation!;
    const second = live.start(t, 'ja');
    assert.notEqual(t.translation, old);
    assert.equal(t.translation!.to, 'ja');
    await first;
    await until('the second translation', () => t.translation?.state === 'translated' && t.page.applied.size === 2);
    assert.deepEqual(t.page.started_to, ['de', 'ja']);
    assert.match(asks.at(-1)!.system, /Japanese/);
    assert.equal(t.translation!.to, 'ja');
    await live.stop(t);
    await second;
    live.close();
  });

  // ---- finding a page's language when it has loaded, and starting by itself ---------------------------------------------

  await check('seen: a page that has loaded gets its language (once for each load), others are left alone, nothing runs when offering is off', async () => {
    const prefs = { translateTo: 'en', translateOffer: true, translateAlways: [] as string[], translateNever: [], translateNeverSites: [] as string[] };
    const { live, tabs } = engine({ prefs: () => prefs });
    const t = new FakeTab('t', 'https://www.shop.example/de', []);
    t.sampleText = FOX.de;
    t.sampleLang = 'en';
    const file = new FakeTab('f', 'file:///home/me/a.html', []);
    file.sampleText = FOX.de;
    const blank = new FakeTab('b', 'about:blank', []);
    tabs.push(t, file, blank);
    const view = (loading = false) => ({ open: true, tabs: tabs.map((x) => ({ id: x.targetId, url: x.url, loading, loadedAt: x.loadedAt })) });
    live.seen(view(true));
    await wait(30);
    assert.equal(t.samples, 0, 'not while it loads');
    live.seen(view());
    await until('its language', () => t.lang === 'de');
    assert.equal(t.translation, undefined, 'only found, not translated');
    assert.ok(t.changes > 0, 'the view is told');
    assert.equal(file.samples + blank.samples, 0, 'only web pages');
    live.seen(view());
    live.seen(view());
    await wait(30);
    assert.equal(t.samples, 1, 'once for a load');
    t.loadedAt++;
    t.sampleText = FOX.fr;
    live.seen(view());
    await until('its new language', () => t.lang === 'fr');
    assert.equal(t.samples, 2);
    // Offering off and nothing always translated: nothing is looked at.
    prefs.translateOffer = false;
    const u = new FakeTab('u', 'https://u.example/', []);
    u.sampleText = FOX.de;
    tabs.push(u);
    live.seen(view());
    await wait(30);
    assert.equal(u.samples, 0);
    assert.equal(u.lang, undefined);
    live.close();
  });

  await check('seen: a language you always translate starts by itself into your language, unless it is yours already or the site is one you never translate (its subdomains too)', async () => {
    const prefs = { translateTo: 'en', translateOffer: true, translateAlways: ['de', 'ja'], translateNever: [] as string[], translateNeverSites: ['example.org'] };
    const { live, tabs } = engine({ prefs: () => prefs });
    const mk = (id: string, url: string, text: string, lang = '') => {
      const t = new FakeTab(id, url, ['Eins', 'Zwei']);
      t.sampleText = text;
      t.sampleLang = lang;
      tabs.push(t);
      return t;
    };
    const de = mk('de', 'https://www.example.com/a', FOX.de);
    const never = mk('never', 'https://blog.example.org/a', FOX.de);
    const en = mk('en', 'https://en.example.com/', FOX.en);
    const fr = mk('fr', 'https://fr.example.com/', FOX.fr);
    const ja = mk('ja', 'https://ja.example.com/', FOX.ja);
    const hinted = mk('hinted', 'https://h.example.com/', '', 'de-CH');
    live.seen({ open: true, tabs: tabs.map((x) => ({ id: x.targetId, url: x.url, loadedAt: x.loadedAt })) });
    await until('the German page translating', () => de.translation?.state === 'translated');
    assert.equal(de.translation!.to, 'en');
    assert.equal(de.translation!.from, 'de');
    assert.equal(de.page.applied.size, 2);
    await until('the Japanese page', () => ja.translation?.state === 'translated');
    await until('the hinted page', () => hinted.translation?.state === 'translated');
    await wait(60);
    assert.equal(never.lang, 'de', 'its language is found');
    assert.equal(never.translation, undefined, 'but a site you never translate is left');
    assert.equal(en.lang, 'en');
    assert.equal(en.translation, undefined, 'your own language');
    assert.equal(fr.lang, 'fr');
    assert.equal(fr.translation, undefined, 'not one you always translate');
    live.close();
  });

  await check('seen: a page whose language could not be told is looked at once more a moment later', async () => {
    const { live, tabs } = engine({ retryMs: 30 });
    const t = new FakeTab('t', 'https://a.example/', []);
    t.sampleText = 'Loading';
    tabs.push(t);
    live.seen({ open: true, tabs: [{ id: 't', url: t.url, loadedAt: t.loadedAt }] });
    await until('a second look', () => t.samples === 2);
    assert.equal(t.lang, undefined);
    await wait(80);
    assert.equal(t.samples, 2, 'once more only');
    live.close();
  });

  // ---- words picked on a page, the routes ------------------------------------------------------------------------------

  await check('picked words: translated in one call, the language they were in found, the model named; a failed call is made once more; no answer is an error', async () => {
    let calls = 0;
    const qs: TranslateQuestion[] = [];
    const live = new PageTranslations(fresh(), () => [], {
      ask: async (q) => {
        qs.push(q);
        if (++calls === 1) throw new Error('boom');
        return '```\nHello, how are you today?\nSecond line\n```';
      },
      model: () => 'the fake model',
    });
    const r = await live.translateText(`${FOX.de}\r\nZweite Zeile`, 'en');
    assert.deepEqual(r, { text: 'Hello, how are you today?\nSecond line', from: 'de', model: 'the fake model' });
    assert.equal(calls, 2);
    assert.match(qs[0].system, /English/);
    assert.match(qs[0].system, /line breaks/);
    assert.equal(qs[0].prompt, `${FOX.de}\nZweite Zeile`);
    const long = await new PageTranslations(fresh(), () => [], { ask: async (q) => q.prompt.slice(0, 30), model: () => 'm' }).translateText('x'.repeat(9000), 'de');
    assert.equal(long.text, 'x'.repeat(30));
    assert.equal(long.from, undefined);
    await assert.rejects(new PageTranslations(fresh(), () => [], { ask: async () => '  ', model: () => 'm' }).translateText('Hallo Welt', 'en'), /did not answer/);
    await assert.rejects(new PageTranslations(fresh(), () => [], { ask: async () => Promise.reject(new HttpError(502, 'signed out')), model: () => 'm' }).translateText('Hallo Welt', 'en'), /signed out/);
  });

  await check('routes: no such tab is 404, no words 400, a language that is not one 400, and the words come back translated; agents are refused all of them', async () => {
    const live = new PageTranslations(fresh(), () => [], { ask: async (q) => `Hello (${q.prompt.length})`, model: () => 'the fake model', prefs: () => ({ translateTo: 'fr', translateOffer: true, translateAlways: [], translateNever: [], translateNeverSites: [] }) });
    const app = Fastify();
    app.setErrorHandler((err: Error, _req, reply) => {
      reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
    });
    translateRoutes({ app, db: fresh() } as unknown as Deps, live);
    await app.ready();
    const call = async (method: 'POST' | 'DELETE', url: string, payload?: object) => {
      const r = await app.inject({ method, url, payload });
      return { status: r.statusCode, body: r.json() as any };
    };
    assert.equal((await call('POST', '/api/browser/browsing/tabs/nope/translate', {})).status, 404);
    assert.equal((await call('DELETE', '/api/browser/browsing/tabs/nope/translate')).status, 404);
    assert.equal((await call('POST', '/api/browser/browsing/translate', {})).status, 400);
    assert.equal((await call('POST', '/api/browser/browsing/translate', { text: '   ' })).status, 400);
    assert.equal((await call('POST', '/api/browser/browsing/translate', { text: 'Hallo', to: 'xx' })).status, 400);
    assert.equal((await call('POST', '/api/browser/browsing/translate', { text: 'Hallo', to: 7 })).status, 400);
    const ok = await call('POST', '/api/browser/browsing/translate', { text: 'Hallo Welt', to: 'en' });
    assert.deepEqual(ok, { status: 200, body: { text: 'Hello (10)', model: 'the fake model' } });
    const dflt = await call('POST', '/api/browser/browsing/translate', { text: 'Hallo Welt' });
    assert.equal(dflt.status, 200);
    for (const [m, p] of [
      ['POST', '/api/browser/browsing/tabs/abc/translate'],
      ['DELETE', '/api/browser/browsing/tabs/abc/translate'],
      ['POST', '/api/browser/browsing/translate'],
    ])
      assert.equal(ruleFor(m, p).level, 'refuse', `${m} ${p}`);
    await app.close();
  });

  await pageScript();
  console.log(`${passed} passed, ${failed} failed`);
}

// ---- the page code in a real Chromium --------------------------------------------------------------------------------------------

async function pageScript() {
  const chrome = findChromes().find((c) => c.source !== 'desktop');
  if (!chrome) {
    console.log('skip the page code in a real Chromium: none found');
    return;
  }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-translate-'));
  const { proc, wsUrl } = await launchChrome(chrome, { userDataDir, headless: true });
  const cdp = await Cdp.connect(wsUrl);
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m: string, p: object = {}) => cdp.send(m, p, sessionId);
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
    const load = async (html: string, ms = 500) => {
      await send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
      await wait(ms);
    };
    const ev = async <T>(expression: string): Promise<T> => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value as T;
    };
    type Seg = { id: string; text: string };
    const take = (chars = 100_000, count = 1000) => ev<Seg[]>(takeScript(chars, count));
    const upper = (segs: Seg[]) => segs.map((s) => ({ id: s.id, text: s.text.replace(/[^\s⟦⟧\d.,]+/g, (w) => w.toUpperCase()) }));
    const html = () => ev<string>('document.body.innerHTML');
    const text = (sel: string) => ev<string>(`document.querySelector(${JSON.stringify(sel)}).textContent`);
    const numOf = (segs: Seg[]) => segs.map((s) => Number(/Paragraph (\d+) /.exec(s.text)![1]));
    const LATE = '<div id="late"><p>This paragraph arrived late.</p></div>';

    await load(PAGE, 700);
    const html0 = await html();
    assert.ok(html0.includes('<div id="late"></div>'), 'the late paragraph has not come yet');

    await check('page: it reads the page’s language word and some of its visible text, and installs itself once', async () => {
      const s = await ev<{ lang: string; text: string }>(sampleScript());
      assert.equal(s.lang, 'en');
      assert.match(s.text, /^Test page\nWelcome to the shop\nClick here to read more about our products, which are great\./);
      assert.ok(s.text.length <= 4000);
      assert.equal(await ev(installScript()), false, 'it is in the page now: installing again does nothing');
      assert.equal(detectLanguage(s.text, s.lang), 'en', 'a short page: its word');
    });

    let first: Seg[] = [];
    await check('page: segments are sentences cut by inline markup into pieces with marks; blocks, translate=no, notranslate, editable, pre, block code, scripts and form words stay out', async () => {
      assert.equal(await ev(startScript('de')), true);
      first = await take();
      assert.deepEqual(
        first.map((s) => s.text),
        [
          'Welcome to the shop',
          '⟦0⟧Click ⟦1⟧here⟦2⟧ to read more about ⟦3⟧our products⟦4⟧, which are great.',
          'Outer text',
          'Inner block text',
          'and after.',
          '⟦0⟧Use the ⟦1⟧npm install⟦2⟧ command, and 25 more.',
          'Search the site',
          'Searching',
          'Send it',
          'First item',
          'Second item',
          'Flex one',
          'Flex two',
          'Brackets [like] these stay.',
        ],
      );
      assert.deepEqual(await take(), [], 'what was handed out is not handed out again');
      assert.equal(new Set(first.map((s) => s.id)).size, first.length);
      assert.match(first[0].id, /^\d+\.\d+$/);
    });

    await check('page: a translation is written into the same text nodes: links and bold keep their place and words, white space is the node’s own', async () => {
      assert.equal(await ev(putScript(upper(first))), first.length);
      assert.equal(await text('h1'), 'WELCOME TO THE SHOP');
      assert.equal(await text('#p1'), 'CLICK HERE TO READ MORE ABOUT OUR PRODUCTS, WHICH ARE GREAT.');
      assert.equal(await ev(`document.querySelector('#p1 a').textContent`), 'HERE');
      assert.equal(await ev(`document.querySelector('#p1 a').getAttribute('href')`), '#x');
      assert.equal(await ev(`document.querySelector('#p1').firstChild.nodeValue`), 'CLICK ');
      assert.equal(await ev(`document.querySelector('#p1 b').textContent`), 'OUR PRODUCTS');
      assert.equal(await text('#d1'), 'OUTER TEXT INNER BLOCK TEXT AND AFTER.');
      assert.equal(await text('#p2'), 'USE THE NPM INSTALL COMMAND, AND 25 MORE.', 'inline code is in the sentence');
      assert.equal(await text('#no1'), 'Do not translate this.');
      assert.equal(await text('#no2'), 'Nor this one.');
      assert.equal(await text('#ed'), 'Editable words');
      assert.equal(await text('pre'), 'code block here');
      assert.equal(await text('code[style]'), 'block code');
      assert.equal(await text('textarea'), 'Typed words');
      assert.equal(await text('#nums'), '12 34 56');
      assert.equal(await ev(`document.getElementById('in1').placeholder`), 'SEARCH THE SITE');
      assert.equal(await ev(`document.getElementById('in1').title`), 'SEARCHING');
      assert.equal(await ev(`document.getElementById('in2').value`), 'SEND IT');
      assert.equal(await text('#odd'), 'BRACKETS [LIKE] THESE STAY.');
      assert.deepEqual(await ev(progressScript()), { done: first.length, total: first.length });
    });

    await check('page: content the page adds later is found; our own writes are not taken for the page’s changes', async () => {
      await until('the late paragraph', async () => (await text('#late')) !== '', 4000);
      await wait(500);
      const later = await take();
      assert.deepEqual(
        later.map((s) => s.text),
        ['This paragraph arrived late.'],
        'only what the page added after the start',
      );
      assert.equal(await ev(putScript(upper(later))), 1);
      await wait(500);
      assert.deepEqual(await take(), [], 'nothing new after our own writes');
      assert.equal(await text('#late'), 'THIS PARAGRAPH ARRIVED LATE.');
    });

    let html1 = '';
    await check('page: restoring puts every word back exactly: the markup is the same, to the character', async () => {
      const n = await ev<number>(restoreScript());
      assert.ok(n >= first.length, `${n} put back`);
      html1 = await html();
      assert.equal(html1, html0.replace('<div id="late"></div>', LATE));
      assert.equal(await ev(`document.getElementById('in1').placeholder`), 'Search the site');
      assert.equal(await ev(`document.getElementById('in2').value`), 'Send it');
      assert.equal(await ev(`document.getElementById('in1').title`), 'Searching');
      assert.equal(await ev(restoreScript()), 0, 'again: nothing');
      assert.deepEqual(await take(), [], 'nothing is watched any more');
    });

    await check('page: words may move between the pieces: marks in order are written; white space is made where the language needs it and not before a comma', async () => {
      await ev(startScript('de'));
      const segs = await take();
      const p1 = segs.find((s) => s.text.startsWith('⟦0⟧Click'))!;
      assert.equal(await ev(putScript([{ id: p1.id, text: '⟦0⟧Klicken Sie ⟦1⟧hier⟦2⟧, um mehr über ⟦3⟧unsere Produkte⟦4⟧ zu erfahren, die großartig sind.' }])), 1);
      assert.equal(await text('#p1'), 'Klicken Sie hier, um mehr über unsere Produkte zu erfahren, die großartig sind.');
      assert.equal(await ev(`document.querySelector('#p1 a').textContent`), 'hier');
      assert.equal(await ev(`document.querySelector('#p1 b').textContent`), 'unsere Produkte');
      // French puts a space before a colon; a piece may be empty.
      const p2 = segs.find((s) => s.text.startsWith('⟦0⟧Use'))!;
      assert.equal(await ev(putScript([{ id: p2.id, text: '⟦0⟧Utilisez la commande⟦1⟧⟦2⟧ : npm install' }])), 1);
      assert.equal(await text('#p2'), 'Utilisez la commande : npm install');
      assert.equal(await ev(`document.querySelector('#p2 code').textContent.trim()`), '');
      // Chinese has no spaces: the page's own are not put round its words.
      const q = segs.find((s) => s.text === 'First item')!;
      await ev(putScript([{ id: q.id, text: '第一项' }]));
      assert.equal(await text('li'), '第一项');
      await ev(restoreScript());
      assert.equal(await html(), html1);
    });

    await check('page: a translation whose marks are lost, doubled or reordered is not written; fail() gives the segment one more try and then leaves it as it is', async () => {
      await ev(startScript('de'));
      const segs = await take();
      const p1 = segs.find((s) => s.text.startsWith('⟦0⟧Click'))!;
      const bad = ['⟦0⟧Klick ⟦1⟧hier', '⟦1⟧hier ⟦0⟧Klick⟦2⟧ a ⟦3⟧b⟦4⟧', '⟦0⟧A ⟦0⟧B⟦2⟧ a ⟦3⟧b⟦4⟧', 'no marks at all', 'x ⟦0⟧a ⟦1⟧b⟦2⟧ c ⟦3⟧d⟦4⟧'];
      let given = false;
      for (const b of bad) {
        assert.equal(await ev(putScript([{ id: p1.id, text: b }])), 0, b);
        // A wrong one counts as a failure of the segment: it is on its way again once, then given up on.
        const again = await take();
        if (again.some((s) => s.id === p1.id)) await ev(failScript([p1.id]));
        else given = true;
      }
      assert.equal(given, true, 'given up on after one more try');
      assert.equal(await text('#p1'), 'Click here to read more about our products, which are great.');
      // A segment put twice is written once; an id the page does not know is ignored.
      const q = segs.find((s) => s.text === 'First item')!;
      assert.equal(await ev(putScript([{ id: q.id, text: 'Erstens' }, { id: q.id, text: 'Zweitens' }, { id: '9.99', text: 'x' }])), 1);
      assert.equal(await text('li'), 'Erstens');
      await ev(restoreScript());
      assert.equal(await html(), html1);
    });

    await check('page: fail() on a segment on its way gives it one more try; a second fail() gives it up', async () => {
      await ev(startScript('de'));
      const segs = await take();
      const h1 = segs.find((s) => s.text === 'Welcome to the shop')!;
      await ev(failScript([h1.id]));
      assert.deepEqual((await take()).map((s) => s.id), [h1.id], 'back, once');
      await ev(failScript([h1.id]));
      assert.deepEqual(await take(), [], 'given up on');
      assert.equal(await text('h1'), 'Welcome to the shop');
      const prog = await ev<{ done: number; total: number }>(progressScript());
      assert.equal(prog.done, 1, 'given up on counts as done');
      await ev(restoreScript());
    });

    await check('page: what the page changes after it was translated is the new original and is translated again; new elements are found; restore does not put the old words over the page’s', async () => {
      await ev(startScript('de'));
      const segs = await take();
      await ev(putScript(upper(segs)));
      await wait(100);
      assert.deepEqual(await take(), []);
      await ev(`document.querySelector('li').firstChild.nodeValue = 'Changed by the page'`);
      await ev(`document.getElementById('d1').appendChild(document.createElement('p')).textContent = 'A new paragraph'`);
      await wait(700);
      const next = await take();
      assert.deepEqual(next.map((s) => s.text).sort(), ['A new paragraph', 'Changed by the page']);
      await ev(putScript(upper(next)));
      assert.equal(await text('li'), 'CHANGED BY THE PAGE');
      // The page changes a translated word again, in the middle of its being translated.
      await ev(`document.querySelectorAll('li')[1].firstChild.nodeValue = 'Changed twice'`);
      await wait(700);
      await ev(restoreScript());
      assert.equal(await text('li'), 'Changed by the page', 'the page’s own newer words');
      assert.equal(await text('#d1 p:last-child'), 'A new paragraph');
      assert.equal(await ev(`document.querySelectorAll('li')[1].textContent`), 'Changed twice');
      await ev(`document.querySelector('li').firstChild.nodeValue = 'First item'; document.querySelectorAll('li')[1].firstChild.nodeValue = 'Second item'; document.querySelector('#d1 p:last-child').remove()`);
      assert.equal(await html(), html1);
    });

    await check('page: starting again in another language puts the page back first; segments on their way from before mean nothing now', async () => {
      await ev(startScript('de'));
      const a = await take();
      await ev(putScript(upper(a.slice(0, 3))));
      await ev(startScript('fr'));
      assert.equal(await html(), html1, 'put back');
      assert.equal(await ev(putScript(upper(a))), 0, 'ids from the first start mean nothing now');
      assert.equal(await html(), html1);
      const b = await take();
      assert.ok(b.length > 0);
      assert.notEqual(b[0].id, a[0].id);
      await ev(restoreScript());
      assert.equal(await html(), html1);
    });

    // A long page: the screen first, one screen round it next, then the rest in order up to a limit; scrolling brings the part you scroll to.
    await load(LONG, 400);
    const longHtml0 = await html();
    await check('page: a long page hands out what is on the screen first, then what is nearest to it, then the rest in order, and no more than a limit beyond that', async () => {
      await ev(startScript('de'));
      let got: number[] = [];
      let chars = 0;
      for (let i = 0; i < 400; i++) {
        const more = await take(2500, 100);
        if (!more.length) break;
        chars += more.reduce((a, s) => a + s.text.length, 0);
        got = got.concat(numOf(more));
      }
      assert.deepEqual(got.slice(0, 14), Array.from({ length: 14 }, (_, i) => i), 'the screen (seven paragraphs) and the screen below it, in order');
      assert.deepEqual(got.slice(0, 40), Array.from({ length: 40 }, (_, i) => i), 'then the rest in order');
      assert.ok(chars >= 150_000 && chars <= 150_000 + 14 * 1000 + 3000, `${chars} characters`);
      assert.ok(got.length > 140 && got.length < 250, `not the whole page: ${got.length} of 400 paragraphs`);
      const prog = await ev<{ done: number; total: number }>(progressScript());
      assert.ok(prog.total >= got.length && prog.total < 260, `what is held back is not counted: ${prog.total}`);
      // Scroll to the end: the last paragraphs come first, though the limit is reached.
      await ev(`window.scrollTo(0, document.body.scrollHeight)`);
      await wait(600);
      const last = numOf(await take(12_000, 100));
      assert.deepEqual(last.slice(0, 7), [393, 394, 395, 396, 397, 398, 399], 'the end of the page, on the screen now');
      assert.equal(last[7], 392, 'then nearest first');
      await ev(restoreScript());
      assert.equal(await html(), longHtml0);
    });

    await check('page: scrolling to the middle brings the middle first, whatever came before', async () => {
      await ev(startScript('de'));
      await ev(`window.scrollTo(0, 20000)`);
      await wait(600);
      const mid = numOf(await take(12_000, 100));
      assert.ok(mid.length >= 10, `${mid.length}`);
      assert.ok(Math.min(...mid.slice(0, 7)) >= 198 && Math.max(...mid.slice(0, 7)) <= 207, `the screen: ${mid.slice(0, 7)}`);
      assert.ok(mid.slice(7, 12).every((n) => n >= 190 && n <= 215), `then round it: ${mid.slice(7, 12)}`);
      await ev(restoreScript());
      await ev(`window.scrollTo(0, 0)`);
    });

    // Components: shadow roots, the reader's root.
    await load(COMPONENTS, 400);
    const comp0 = await html();
    const shadow0 = await ev<string>(`document.getElementById('host').shadowRoot.innerHTML`);
    await check('page: words inside a web component’s open shadow root, and in the reader’s root, are found and written, found when added later, and put back', async () => {
      await ev(`(() => { const sr = document.getElementById('rd').attachShadow({ mode: 'open' }); sr.innerHTML = '<article><p>Reader view words.</p></article>'; globalThis.__hydorReader = { root: sr }; })()`);
      const rd0 = await ev<string>(`document.getElementById('rd').shadowRoot.innerHTML`);
      await ev(startScript('de'));
      const segs = await take();
      assert.deepEqual(segs.map((s) => s.text).sort(), ['Light words here.', 'Reader view words.', 'Second shadow words.', 'Shadow words inside.']);
      await ev(putScript(upper(segs)));
      assert.equal(await ev(`document.getElementById('host').shadowRoot.getElementById('sp').textContent`), 'SHADOW WORDS INSIDE.');
      assert.equal(await ev(`document.getElementById('rd').shadowRoot.querySelector('p').textContent`), 'READER VIEW WORDS.');
      await ev(`document.getElementById('host').shadowRoot.appendChild(document.createElement('p')).textContent = 'Added in shadow'`);
      await wait(700);
      assert.deepEqual((await take()).map((s) => s.text), ['Added in shadow']);
      await ev(restoreScript());
      await ev(`document.getElementById('host').shadowRoot.lastElementChild.remove()`);
      assert.equal(await html(), comp0);
      assert.equal(await ev(`document.getElementById('rd').shadowRoot.innerHTML`), rd0);
      assert.equal(await ev(`document.getElementById('host').shadowRoot.innerHTML`), shadow0);
      await ev(`delete globalThis.__hydorReader`);
    });

    // The engine and the page code together: a tab whose evaluate is this page, a model that answers in capitals.
    await check('together: the engine translates a real page, what the page adds and changes, and shows its own words again when stopped', async () => {
      await load(PAGE, 700);
      const h0 = await html();
      const tab: LiveTab = { targetId: 'real', url: 'https://real.example/', loadedAt: 1, lang: 'en', translation: undefined, owner: { changed() {} }, evaluate: ev };
      const live = new PageTranslations(fresh(), () => [tab], {
        ask: async (q) => upperAnswer(q.prompt),
        prefs: () => ({ translateTo: 'de', translateOffer: true, translateAlways: [], translateNever: [], translateNeverSites: [] }),
        parallel: () => 2,
        model: () => 'the fake model',
        pollMs: 50,
      });
      const done = live.start(tab, 'de');
      await until('the page translated', async () => (await text('#p1')).startsWith('CLICK HERE'), 5000);
      assert.equal(await text('#p1'), 'CLICK HERE TO READ MORE ABOUT OUR PRODUCTS, WHICH ARE GREAT.');
      assert.equal(await text('#no1'), 'Do not translate this.');
      assert.equal(await ev(`document.getElementById('in1').placeholder`), 'SEARCH THE SITE');
      await until('the late paragraph translated', async () => (await text('#late')) === 'THIS PARAGRAPH ARRIVED LATE.', 8000);
      await until('translated', () => tab.translation?.state === 'translated');
      assert.ok(tab.translation!.total >= 15, `${tab.translation!.total} segments`);
      assert.equal(tab.translation!.done, tab.translation!.total);
      // The page adds a paragraph.
      await ev(`document.body.appendChild(document.createElement('p')).textContent = 'One more paragraph'`);
      await until('the new one translated', async () => (await ev<string>(`document.body.lastElementChild.textContent`)) === 'ONE MORE PARAGRAPH', 5000);
      await live.stop(tab);
      await done;
      assert.equal(tab.translation, undefined);
      assert.equal(await ev<string>(`document.body.lastElementChild.textContent`), 'One more paragraph', 'its own words again');
      await ev(`document.body.lastElementChild.remove()`);
      assert.equal(await html(), h0.replace('<div id="late"></div>', LATE));
      live.close();
    });
  } finally {
    cdp.close();
    try {
      proc.kill('SIGKILL');
    } catch {}
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

void main().then(() => process.exit(process.exitCode ?? 0));
