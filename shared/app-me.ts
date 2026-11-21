// About you: one fixed record of what apps would otherwise ask on every run (where you live, your units and currency,
// what you eat, the services you pay for, your research fields…), kept once on the server and written only by the
// person (Settings → Apps → About you, or "Remember for all apps" on a form). It never grows: no notes, only these
// fields. What is not set is worked out where it can be: the country from the time zone, units and currency from the
// country, the language from the one the app was last used in; a worked-out value is used like a set one.
//
// Apps read it three ways: a question that says from: "me.units" starts from it, steps and tasks write {{me.units}},
// and code steps get ctx.locale. A run from a public page gets none of it.
import { LANGS } from './i18n.ts';

export interface AboutMe {
  /** A place as they would type it: "Thessaloniki, Greece". */
  home?: string;
  /** Two letters (ISO 3166): "GR". */
  country?: string;
  /** A language tag: "el". */
  language?: string;
  units?: 'metric' | 'imperial';
  /** Three letters (ISO 4217): "EUR". */
  currency?: string;
  diet?: string;
  /** How many people live at home. */
  household?: number;
  /** Streaming services. */
  services?: string[];
  teams?: string[];
  fields?: string[];
  topics?: string[];
  venues?: string[];
  /** Their name as an author, with an id if they have one (an ORCID, or an OpenAlex author id). */
  author?: { name: string; id?: string };
  /** What they can run things on, in a line: "a laptop and one 24 GB GPU". */
  compute?: string;
}

export type MeId = keyof AboutMe;
export type MeKind = 'text' | 'number' | 'choice' | 'list';
export type MeGroup = 'You' | 'Home life' | 'Research';

export interface MeField {
  id: MeId;
  label: string;
  kind: MeKind;
  group: MeGroup;
  /** A choice's values (the pages name countries, languages and currencies in the reader's language). */
  options?: string[];
  placeholder?: string;
}

/** Where a value that was not set came from. */
export type MeSource = 'timezone' | 'country' | 'app';

// ---- the tables -------------------------------------------------------------------------------------------------

/**
 * Each country's time zones (zone.tab of the IANA time zone database, with the older names browsers still give, such
 * as Asia/Calcutta and Europe/Kiev): "GR Europe/Athens;…".
 */
const ZONES =
  'AD Europe/Andorra;AE Asia/Dubai;AF Asia/Kabul;AG America/Antigua;AI America/Anguilla;AL Europe/Tirane;AM Asia/Yerevan;AO Africa/Luanda;' +
  'AQ Antarctica/Casey Antarctica/Davis Antarctica/DumontDUrville Antarctica/Mawson Antarctica/McMurdo Antarctica/Palmer Antarctica/Rothera Antarctica/South_Pole Antarctica/Syowa Antarctica/Troll Antarctica/Vostok;' +
  'AR America/Argentina/Buenos_Aires America/Argentina/Catamarca America/Argentina/ComodRivadavia America/Argentina/Cordoba America/Argentina/Jujuy America/Argentina/La_Rioja America/Argentina/Mendoza America/Argentina/Rio_Gallegos America/Argentina/Salta America/Argentina/San_Juan America/Argentina/San_Luis America/Argentina/Tucuman America/Argentina/Ushuaia America/Buenos_Aires America/Catamarca America/Cordoba America/Jujuy America/Mendoza America/Rosario;' +
  'AS Pacific/Pago_Pago Pacific/Samoa US/Samoa;AT Europe/Vienna;' +
  'AU Antarctica/Macquarie Australia/ACT Australia/Adelaide Australia/Brisbane Australia/Broken_Hill Australia/Canberra Australia/Currie Australia/Darwin Australia/Eucla Australia/Hobart Australia/LHI Australia/Lindeman Australia/Lord_Howe Australia/Melbourne Australia/NSW Australia/North Australia/Perth Australia/Queensland Australia/South Australia/Sydney Australia/Tasmania Australia/Victoria Australia/West Australia/Yancowinna;' +
  'AW America/Aruba;AX Europe/Mariehamn;AZ Asia/Baku;BA Europe/Sarajevo;BB America/Barbados;BD Asia/Dacca Asia/Dhaka;BE Europe/Brussels;' +
  'BF Africa/Ouagadougou;BG Europe/Sofia;BH Asia/Bahrain;BI Africa/Bujumbura;BJ Africa/Porto-Novo;BL America/St_Barthelemy;BM Atlantic/Bermuda;' +
  'BN Asia/Brunei;BO America/La_Paz;BQ America/Kralendijk;' +
  'BR America/Araguaina America/Bahia America/Belem America/Boa_Vista America/Campo_Grande America/Cuiaba America/Eirunepe America/Fortaleza America/Maceio America/Manaus America/Noronha America/Porto_Acre America/Porto_Velho America/Recife America/Rio_Branco America/Santarem America/Sao_Paulo Brazil/Acre Brazil/DeNoronha Brazil/East Brazil/West;' +
  'BS America/Nassau;BT Asia/Thimbu Asia/Thimphu;BW Africa/Gaborone;BY Europe/Minsk;BZ America/Belize;' +
  'CA America/Atikokan America/Blanc-Sablon America/Cambridge_Bay America/Coral_Harbour America/Creston America/Dawson America/Dawson_Creek America/Edmonton America/Fort_Nelson America/Glace_Bay America/Goose_Bay America/Halifax America/Inuvik America/Iqaluit America/Moncton America/Montreal America/Nipigon America/Pangnirtung America/Rainy_River America/Rankin_Inlet America/Regina America/Resolute America/St_Johns America/Swift_Current America/Thunder_Bay America/Toronto America/Vancouver America/Whitehorse America/Winnipeg America/Yellowknife Canada/Atlantic Canada/Central Canada/Eastern Canada/Mountain Canada/Newfoundland Canada/Pacific Canada/Saskatchewan Canada/Yukon;' +
  'CC Indian/Cocos;CD Africa/Kinshasa Africa/Lubumbashi;CF Africa/Bangui;CG Africa/Brazzaville;CH Europe/Zurich;CI Africa/Abidjan;' +
  'CK Pacific/Rarotonga;CL America/Coyhaique America/Punta_Arenas America/Santiago Chile/Continental Chile/EasterIsland Pacific/Easter;' +
  'CM Africa/Douala;CN Asia/Chongqing Asia/Chungking Asia/Harbin Asia/Kashgar Asia/Shanghai Asia/Urumqi;CO America/Bogota;CR America/Costa_Rica;' +
  'CU America/Havana;CV Atlantic/Cape_Verde;CW America/Curacao;CX Indian/Christmas;CY Asia/Famagusta Asia/Nicosia Europe/Nicosia;' +
  'CZ Europe/Prague;DE Europe/Berlin Europe/Busingen;DJ Africa/Djibouti;DK Europe/Copenhagen;DM America/Dominica;DO America/Santo_Domingo;' +
  'DZ Africa/Algiers;EC America/Guayaquil Pacific/Galapagos;EE Europe/Tallinn;EG Africa/Cairo;EH Africa/El_Aaiun;ER Africa/Asmara Africa/Asmera;' +
  'ES Africa/Ceuta Atlantic/Canary Europe/Madrid;ET Africa/Addis_Ababa;FI Europe/Helsinki;FJ Pacific/Fiji;FK Atlantic/Stanley;' +
  'FM Pacific/Chuuk Pacific/Kosrae Pacific/Pohnpei Pacific/Ponape Pacific/Truk Pacific/Yap;FO Atlantic/Faeroe Atlantic/Faroe;FR Europe/Paris;' +
  'GA Africa/Libreville;GB Europe/Belfast Europe/London;GD America/Grenada;GE Asia/Tbilisi;GF America/Cayenne;GG Europe/Guernsey;' +
  'GH Africa/Accra;GI Europe/Gibraltar;GL America/Danmarkshavn America/Godthab America/Nuuk America/Scoresbysund America/Thule;GM Africa/Banjul;' +
  'GN Africa/Conakry;GP America/Guadeloupe;GQ Africa/Malabo;GR Europe/Athens;GS Atlantic/South_Georgia;GT America/Guatemala;GU Pacific/Guam;' +
  'GW Africa/Bissau;GY America/Guyana;HK Asia/Hong_Kong;HN America/Tegucigalpa;HR Europe/Zagreb;HT America/Port-au-Prince;HU Europe/Budapest;' +
  'ID Asia/Jakarta Asia/Jayapura Asia/Makassar Asia/Pontianak Asia/Ujung_Pandang;IE Europe/Dublin;IL Asia/Jerusalem Asia/Tel_Aviv;' +
  'IM Europe/Isle_of_Man;IN Asia/Calcutta Asia/Kolkata;IO Indian/Chagos;IQ Asia/Baghdad;IR Asia/Tehran;IS Atlantic/Reykjavik;IT Europe/Rome;' +
  'JE Europe/Jersey;JM America/Jamaica;JO Asia/Amman;JP Asia/Tokyo;KE Africa/Nairobi;KG Asia/Bishkek;KH Asia/Phnom_Penh;' +
  'KI Pacific/Enderbury Pacific/Kanton Pacific/Kiritimati Pacific/Tarawa;KM Indian/Comoro;KN America/St_Kitts;KP Asia/Pyongyang;KR Asia/Seoul;' +
  'KW Asia/Kuwait;KY America/Cayman;KZ Asia/Almaty Asia/Aqtau Asia/Aqtobe Asia/Atyrau Asia/Oral Asia/Qostanay Asia/Qyzylorda;LA Asia/Vientiane;' +
  'LB Asia/Beirut;LC America/St_Lucia;LI Europe/Vaduz;LK Asia/Colombo;LR Africa/Monrovia;LS Africa/Maseru;LT Europe/Vilnius;' +
  'LU Europe/Luxembourg;LV Europe/Riga;LY Africa/Tripoli;MA Africa/Casablanca;MC Europe/Monaco;MD Europe/Chisinau Europe/Tiraspol;' +
  'ME Europe/Podgorica;MF America/Marigot;MG Indian/Antananarivo;MH Pacific/Kwajalein Pacific/Majuro;MK Europe/Skopje;' +
  'ML Africa/Bamako Africa/Timbuktu;MM Asia/Rangoon Asia/Yangon;MN Asia/Choibalsan Asia/Hovd Asia/Ulaanbaatar Asia/Ulan_Bator;' +
  'MO Asia/Macao Asia/Macau;MP Pacific/Saipan;MQ America/Martinique;MR Africa/Nouakchott;MS America/Montserrat;MT Europe/Malta;' +
  'MU Indian/Mauritius;MV Indian/Maldives;MW Africa/Blantyre;' +
  'MX America/Bahia_Banderas America/Cancun America/Chihuahua America/Ciudad_Juarez America/Ensenada America/Hermosillo America/Matamoros America/Mazatlan America/Merida America/Mexico_City America/Monterrey America/Ojinaga America/Santa_Isabel America/Tijuana Mexico/BajaNorte Mexico/BajaSur Mexico/General;' +
  'MY Asia/Kuala_Lumpur Asia/Kuching;MZ Africa/Maputo;NA Africa/Windhoek;NC Pacific/Noumea;NE Africa/Niamey;NF Pacific/Norfolk;NG Africa/Lagos;' +
  'NI America/Managua;NL Europe/Amsterdam;NO Atlantic/Jan_Mayen Europe/Oslo;NP Asia/Kathmandu Asia/Katmandu;NR Pacific/Nauru;NU Pacific/Niue;' +
  'NZ Pacific/Auckland Pacific/Chatham;OM Asia/Muscat;PA America/Panama;PE America/Lima;PF Pacific/Gambier Pacific/Marquesas Pacific/Tahiti;' +
  'PG Pacific/Bougainville Pacific/Port_Moresby;PH Asia/Manila;PK Asia/Karachi;PL Europe/Warsaw;PM America/Miquelon;PN Pacific/Pitcairn;' +
  'PR America/Puerto_Rico;PS Asia/Gaza Asia/Hebron;PT Atlantic/Azores Atlantic/Madeira Europe/Lisbon;PW Pacific/Palau;PY America/Asuncion;' +
  'QA Asia/Qatar;RE Indian/Reunion;RO Europe/Bucharest;RS Europe/Belgrade;' +
  'RU Asia/Anadyr Asia/Barnaul Asia/Chita Asia/Irkutsk Asia/Kamchatka Asia/Khandyga Asia/Krasnoyarsk Asia/Magadan Asia/Novokuznetsk Asia/Novosibirsk Asia/Omsk Asia/Sakhalin Asia/Srednekolymsk Asia/Tomsk Asia/Ust-Nera Asia/Vladivostok Asia/Yakutsk Asia/Yekaterinburg Europe/Astrakhan Europe/Kaliningrad Europe/Kirov Europe/Moscow Europe/Samara Europe/Saratov Europe/Ulyanovsk Europe/Volgograd;' +
  'RW Africa/Kigali;SA Asia/Riyadh;SB Pacific/Guadalcanal;SC Indian/Mahe;SD Africa/Khartoum;SE Europe/Stockholm;SG Asia/Singapore;' +
  'SH Atlantic/St_Helena;SI Europe/Ljubljana;SJ Arctic/Longyearbyen;SK Europe/Bratislava;SL Africa/Freetown;SM Europe/San_Marino;' +
  'SN Africa/Dakar;SO Africa/Mogadishu;SR America/Paramaribo;SS Africa/Juba;ST Africa/Sao_Tome;SV America/El_Salvador;SX America/Lower_Princes;' +
  'SY Asia/Damascus;SZ Africa/Mbabane;TC America/Grand_Turk;TD Africa/Ndjamena;TF Indian/Kerguelen;TG Africa/Lome;TH Asia/Bangkok;' +
  'TJ Asia/Dushanbe;TK Pacific/Fakaofo;TL Asia/Dili;TM Asia/Ashgabat Asia/Ashkhabad;TN Africa/Tunis;TO Pacific/Tongatapu;' +
  'TR Asia/Istanbul Europe/Istanbul;TT America/Port_of_Spain;TV Pacific/Funafuti;TW Asia/Taipei;TZ Africa/Dar_es_Salaam;' +
  'UA Europe/Kiev Europe/Kyiv Europe/Simferopol Europe/Uzhgorod Europe/Zaporozhye;UG Africa/Kampala;UM Pacific/Midway Pacific/Wake;' +
  'US America/Adak America/Anchorage America/Atka America/Boise America/Chicago America/Denver America/Detroit America/Fort_Wayne America/Indiana/Indianapolis America/Indiana/Knox America/Indiana/Marengo America/Indiana/Petersburg America/Indiana/Tell_City America/Indiana/Vevay America/Indiana/Vincennes America/Indiana/Winamac America/Indianapolis America/Juneau America/Kentucky/Louisville America/Kentucky/Monticello America/Knox_IN America/Los_Angeles America/Louisville America/Menominee America/Metlakatla America/New_York America/Nome America/North_Dakota/Beulah America/North_Dakota/Center America/North_Dakota/New_Salem America/Phoenix America/Shiprock America/Sitka America/Yakutat Pacific/Honolulu Pacific/Johnston US/Alaska US/Aleutian US/Arizona US/Central US/East-Indiana US/Eastern US/Hawaii US/Indiana-Starke US/Michigan US/Mountain US/Pacific;' +
  'UY America/Montevideo;UZ Asia/Samarkand Asia/Tashkent;VA Europe/Vatican;VC America/St_Vincent;VE America/Caracas;VG America/Tortola;' +
  'VI America/St_Thomas America/Virgin;VN Asia/Ho_Chi_Minh Asia/Saigon;VU Pacific/Efate;WF Pacific/Wallis;WS Pacific/Apia;YE Asia/Aden;' +
  'YT Indian/Mayotte;ZA Africa/Johannesburg;ZM Africa/Lusaka;ZW Africa/Harare';

/** Currencies that several countries share, then each other country's own (ISO 4217). */
const CURRENCIES =
  'EUR AD AT AX BE BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM TF VA XK YT;' +
  'USD AS BQ EC FM GU IO MH MP PR PW SV TC TL UM US VG VI;XCD AG AI DM GD KN LC MS VC;XOF BF BJ CI GW ML NE SN TG;' +
  'XAF CF CG CM GA GQ TD;XPF NC PF WF;AUD AU CC CX HM KI NF NR TV;NZD CK NU NZ PN TK;GBP GB GG GS IM JE;NOK BV NO SJ;' +
  'DKK DK FO GL;CHF CH LI;ANG CW SX;MAD EH MA;ILS IL PS;INR IN;' +
  'AED AE;AFN AF;ALL AL;AMD AM;AOA AO;ARS AR;AWG AW;AZN AZ;BAM BA;BBD BB;BDT BD;BGN BG;BHD BH;BIF BI;BMD BM;BND BN;' +
  'BOB BO;BRL BR;BSD BS;BTN BT;BWP BW;BYN BY;BZD BZ;CAD CA;CDF CD;CLP CL;CNY CN;COP CO;CRC CR;CUP CU;CVE CV;CZK CZ;' +
  'DJF DJ;DOP DO;DZD DZ;EGP EG;ERN ER;ETB ET;FJD FJ;FKP FK;GEL GE;GHS GH;GIP GI;GMD GM;GNF GN;GTQ GT;GYD GY;HKD HK;' +
  'HNL HN;HTG HT;HUF HU;IDR ID;IQD IQ;IRR IR;ISK IS;JMD JM;JOD JO;JPY JP;KES KE;KGS KG;KHR KH;KMF KM;KPW KP;KRW KR;' +
  'KWD KW;KYD KY;KZT KZ;LAK LA;LBP LB;LKR LK;LRD LR;LSL LS;LYD LY;MDL MD;MGA MG;MKD MK;MMK MM;MNT MN;MOP MO;MRU MR;' +
  'MUR MU;MVR MV;MWK MW;MXN MX;MYR MY;MZN MZ;NAD NA;NGN NG;NIO NI;NPR NP;OMR OM;PAB PA;PEN PE;PGK PG;PHP PH;PKR PK;' +
  'PLN PL;PYG PY;QAR QA;RON RO;RSD RS;RUB RU;RWF RW;SAR SA;SBD SB;SCR SC;SDG SD;SEK SE;SGD SG;SHP SH;SLE SL;SOS SO;' +
  'SRD SR;SSP SS;STN ST;SYP SY;SZL SZ;THB TH;TJS TJ;TMT TM;TND TN;TOP TO;TRY TR;TTD TT;TWD TW;TZS TZ;UAH UA;UGX UG;' +
  'UYU UY;UZS UZ;VES VE;VND VN;VUV VU;WST WS;YER YE;ZAR ZA;ZMW ZM;ZWL ZW';

let zoneCountry: Map<string, string> | null = null;
let countryCurrency: Map<string, string> | null = null;

/** The tables as maps, made once. */
function tables() {
  if (!zoneCountry || !countryCurrency) {
    zoneCountry = new Map();
    countryCurrency = new Map();
    for (const part of ZONES.split(';')) {
      const [cc, ...zones] = part.split(' ');
      for (const z of zones) zoneCountry.set(z, cc);
    }
    for (const part of CURRENCIES.split(';')) {
      const [cur, ...ccs] = part.split(' ');
      for (const cc of ccs) countryCurrency.set(cc, cur);
    }
  }
  return { zoneCountry, countryCurrency };
}

/** The country a time zone is in ("Europe/Athens" → "GR"); undefined for one of no country (UTC). */
export const countryOfTimezone = (tz: string | undefined): string | undefined => (tz ? tables().zoneCountry.get(tz.trim()) : undefined);

/** A country's currency ("GR" → "EUR"). */
export const currencyOfCountry = (cc: string | undefined): string | undefined => (cc ? tables().countryCurrency.get(cc.trim().toUpperCase()) : undefined);

/** Miles, pounds and Fahrenheit in the United States, Liberia and Myanmar; metric everywhere else. */
export const unitsOfCountry = (cc: string | undefined): AboutMe['units'] | undefined => (cc ? (['US', 'LR', 'MM'].includes(cc.trim().toUpperCase()) ? 'imperial' : 'metric') : undefined);

/** Every country the tables know, by its two letters. */
export const COUNTRIES = (): string[] => [...tables().countryCurrency.keys()].sort();

/** A language tag as the record keeps it ("pt-br" → "pt-BR"); undefined when it is not one. */
export function cleanLang(v: unknown): string | undefined {
  if (typeof v !== 'string' || !/^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*$/.test(v.trim())) return undefined;
  try {
    return Intl.getCanonicalLocales(v.trim().replace(/_/g, '-'))[0]?.slice(0, 35);
  } catch {
    return undefined;
  }
}

/** A language from a tag, or from the name of one of the app's languages ("Greek", "Ελληνικά"); undefined otherwise. */
export function langOf(v: unknown): string | undefined {
  const tag = cleanLang(v);
  if (tag || typeof v !== 'string') return tag;
  const w = v.trim().toLowerCase();
  return LANGS.find((l) => [l.english, l.name, l.english.split(' (')[0]].some((n) => n.toLowerCase() === w))?.id;
}

/** A language's English name ("el" → "Greek"): the app's own names for its languages, else Intl's; the tag when neither knows it. */
export function languageName(tag: string | undefined): string {
  const t = cleanLang(tag) ?? 'en';
  const own = LANGS.find((l) => l.id === t);
  if (own) return own.english;
  try {
    return new Intl.DisplayNames('en', { type: 'language' }).of(t) || t;
  } catch {
    return t;
  }
}

/** Whether a tag is English, in which runs write without being told. */
export const isEnglish = (tag: string | undefined) => !tag || /^en(?:-|$)/i.test(tag);

/** Languages offered first in the record's picker (any other tag is kept too). */
const LANGUAGE_OPTIONS = ['en', 'de', 'es', 'fr', 'pt', 'el', 'ja', 'zh', 'it', 'nl', 'pl', 'ru', 'uk', 'tr', 'ar', 'he', 'hi', 'ko', 'id', 'vi', 'th', 'sv', 'da', 'no', 'fi', 'cs', 'hu', 'ro', 'bg', 'hr', 'sr', 'ca'];

/** Currencies by their three letters, the record's picker's options. */
const currencyOptions = () => [...new Set(tables().countryCurrency.values())].sort();

// ---- the fields -------------------------------------------------------------------------------------------------

/** The record's fields, in the order Settings shows them, by group. */
export const ME_FIELDS: MeField[] = [
  { id: 'home', label: 'Where you live', kind: 'text', group: 'You', placeholder: 'Thessaloniki, Greece' },
  { id: 'country', label: 'Country', kind: 'choice', group: 'You', options: COUNTRIES() },
  { id: 'language', label: 'Language', kind: 'choice', group: 'You', options: LANGUAGE_OPTIONS },
  { id: 'units', label: 'Units', kind: 'choice', group: 'You', options: ['metric', 'imperial'] },
  { id: 'currency', label: 'Currency', kind: 'choice', group: 'You', options: currencyOptions() },
  { id: 'diet', label: 'What you eat', kind: 'text', group: 'Home life', placeholder: 'Vegetarian, no nuts' },
  { id: 'household', label: 'People at home', kind: 'number', group: 'Home life', placeholder: '2' },
  { id: 'services', label: 'Streaming services', kind: 'list', group: 'Home life', placeholder: 'Netflix, Disney+' },
  { id: 'teams', label: 'Teams you follow', kind: 'list', group: 'Home life', placeholder: 'Real Madrid, Boston Celtics' },
  { id: 'fields', label: 'Your fields', kind: 'list', group: 'Research', placeholder: 'Information retrieval, NLP' },
  { id: 'topics', label: 'Topics you follow', kind: 'list', group: 'Research', placeholder: 'Retrieval-augmented generation' },
  { id: 'venues', label: 'Venues you read', kind: 'list', group: 'Research', placeholder: 'SIGIR, ACL, TOIS' },
  { id: 'author', label: 'You as an author', kind: 'text', group: 'Research', placeholder: 'Your name as on your papers' },
  { id: 'compute', label: 'What you can run on', kind: 'text', group: 'Research', placeholder: 'A laptop and one 24 GB GPU' },
];

export const ME_GROUPS: MeGroup[] = ['You', 'Home life', 'Research'];

/** The fields a question may start from (`from: "me.<id>"`): all but the language, which is the run's. */
export const FROM_FIELDS = ME_FIELDS.filter((f) => f.id !== 'language');

/** What {{me.…}} names: the record's fields but the language (the run's is {{language}}), and the author's id apart. */
export const ME_REFS = ['home', 'country', 'units', 'currency', 'diet', 'household', 'services', 'teams', 'fields', 'topics', 'venues', 'author', 'author_id', 'compute'] as const;

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

/** A list from a list or a text of lines or commas, each short, without repeats, at most 30. */
function list(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,;]/) : [];
  const out: string[] = [];
  for (const x of raw) {
    const s = text(x, 120);
    if (s && !out.some((y) => y.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 30);
}

/** One field's value from anything, or undefined (not set). */
function cleanOne(id: MeId, v: unknown): AboutMe[MeId] | undefined {
  switch (id) {
    case 'country': {
      const cc = text(v, 2).toUpperCase();
      return currencyOfCountry(cc) || cc === 'AQ' ? cc : undefined;
    }
    case 'language':
      return cleanLang(v);
    case 'units': {
      const u = text(v, 20).toLowerCase();
      return u === 'metric' || u === 'imperial' ? u : undefined;
    }
    case 'currency': {
      const c = text(v, 3).toUpperCase();
      return /^[A-Z]{3}$/.test(c) ? c : undefined;
    }
    case 'household': {
      const n = typeof v === 'number' ? v : Number(text(v, 6));
      return Number.isInteger(n) && n >= 1 && n <= 50 ? n : undefined;
    }
    case 'services':
    case 'teams':
    case 'fields':
    case 'topics':
    case 'venues': {
      const l = list(v);
      return l.length ? l : undefined;
    }
    case 'author': {
      const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { name: v };
      const name = text(o.name, 120);
      const aid = text(o.id, 80);
      return name ? { name, ...(aid ? { id: aid } : {}) } : undefined;
    }
    case 'home':
      return text(v, 160) || undefined;
    case 'diet':
      return text(v, 300) || undefined;
    case 'compute':
      return text(v, 300) || undefined;
  }
}

/** The record from anything: its known fields only, each within bounds; what is empty or wrong is left out. */
export function cleanMe(raw: unknown): AboutMe {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const f of ME_FIELDS) {
    const v = cleanOne(f.id, r[f.id]);
    if (v !== undefined) out[f.id] = v;
  }
  return out as AboutMe;
}

/** The record with a change: the fields given take their new value, and a field given as null or empty is cleared. */
export function changeMe(prev: AboutMe, patch: unknown): AboutMe {
  const p = patch && typeof patch === 'object' && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {};
  const next: Record<string, unknown> = { ...prev };
  for (const f of ME_FIELDS) {
    if (!(f.id in p)) continue;
    const v = cleanOne(f.id, p[f.id]);
    if (v === undefined) delete next[f.id];
    else next[f.id] = v;
  }
  return cleanMe(next);
}

/**
 * The record with what is not set worked out: the country from the time zone, units and currency from the country,
 * the language from the one the app was last used in. `derived` says which were worked out, and from what.
 */
export function meOf(record: AboutMe, o: { timezone?: string; lastLanguage?: string } = {}): { values: AboutMe; derived: Partial<Record<MeId, MeSource>> } {
  const values: AboutMe = { ...cleanMe(record) };
  const derived: Partial<Record<MeId, MeSource>> = {};
  if (!values.country) {
    const cc = countryOfTimezone(o.timezone);
    if (cc) (values.country = cc), (derived.country = 'timezone');
  }
  if (!values.units && values.country) (values.units = unitsOfCountry(values.country)), (derived.units = 'country');
  if (!values.currency) {
    const cur = currencyOfCountry(values.country);
    if (cur) (values.currency = cur), (derived.currency = 'country');
  }
  if (!values.language) {
    const lang = cleanLang(o.lastLanguage);
    if (lang) (values.language = lang), (derived.language = 'app');
  }
  return { values, derived };
}

/** What {{me.…}} gives: each name there, lists as lists, empty when there is nothing (a public run gets this of an empty record). */
export function meVars(values: AboutMe): Record<(typeof ME_REFS)[number], string | number | string[]> {
  return {
    home: values.home ?? '',
    country: values.country ?? '',
    units: values.units ?? '',
    currency: values.currency ?? '',
    diet: values.diet ?? '',
    household: values.household ?? '',
    services: values.services ?? [],
    teams: values.teams ?? [],
    fields: values.fields ?? [],
    topics: values.topics ?? [],
    venues: values.venues ?? [],
    author: values.author?.name ?? '',
    author_id: values.author?.id ?? '',
    compute: values.compute ?? '',
  };
}

/** What a code step gets as ctx.locale: the run's language, and the person's country, time zone, currency and units. */
export interface RunLocale {
  /** The tag: "el". */
  lang: string;
  /** Its English name: "Greek". */
  language: string;
  country: string;
  timeZone: string;
  currency: string;
  units: string;
}

export function localeOf(lang: string, values: AboutMe, timeZone: string): RunLocale {
  return { lang, language: languageName(lang), country: values.country ?? '', timeZone, currency: values.currency ?? '', units: values.units ?? '' };
}

/**
 * The line a model or agent step (or a one-task app's agent) gets after its instructions when its app answers in the
 * person's language (language: "person"); none for English.
 */
export function languageLine(lang: string | undefined): string {
  if (isEnglish(lang)) return '';
  return `Write everything people will read in ${languageName(lang)}. Keep the names of fields, the choices you were given, codes and numbers exactly as they are written.`;
}

/** The field a question's `from` names ("me.units" → "units"), or undefined. */
export function fromField(from: unknown): MeId | undefined {
  const m = typeof from === 'string' ? /^me\.([a-z]+)$/.exec(from.trim()) : null;
  return m && FROM_FIELDS.some((f) => f.id === m[1]) ? (m[1] as MeId) : undefined;
}

/**
 * The answer a question starts from with a field of the record, as the form takes it: a choice as one of its options
 * (any case), several as those of its options the list has, a list as one line, the author by name; undefined when
 * the record has nothing for it, or nothing the question can take.
 */
export function startFrom(f: { type: string; options?: string[]; multi?: boolean }, id: MeId, values: AboutMe): string | undefined {
  const v = values[id];
  if (v === undefined || v === null || f.type === 'file' || f.type === 'date' || f.type === 'yesno') return undefined;
  const items = Array.isArray(v) ? v : [typeof v === 'object' ? v.name : String(v)];
  if (!items.length) return undefined;
  if (f.type === 'choice') {
    const opts = f.options ?? [];
    const hit = (x: string) => opts.find((o) => o.toLowerCase() === x.toLowerCase());
    if (f.multi) {
      const picked = opts.filter((o) => items.some((x) => hit(x) === o));
      return picked.length ? picked.join('\n') : undefined;
    }
    return items.map(hit).find(Boolean);
  }
  if (f.type === 'number') return typeof v === 'number' ? String(v) : undefined;
  return items.join(', ');
}
