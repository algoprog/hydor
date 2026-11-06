// A font of this computer's for words edit_video draws over a video (the editor draws its own in the browser): one
// that has the words' letters (Chinese, Japanese, Korean, Greek, Cyrillic, Arabic, Hebrew, Devanagari, Thai or Latin),
// bold when asked. fontconfig picks it where it is (Linux, and Macs that have it), else the system's usual fonts.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { which } from '../platform.ts';

/** The language fontconfig is asked for, by the first of these scripts the words use. */
const SCRIPTS: [RegExp, string][] = [
  [/[\u3040-\u30ff\u31f0-\u31ff]/, 'ja'],
  [/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/, 'ko'],
  [/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/, 'zh-cn'],
  [/[\u0600-\u06ff\u0750-\u077f]/, 'ar'],
  [/[\u0590-\u05ff]/, 'he'],
  [/[\u0900-\u097f]/, 'hi'],
  [/[\u0e00-\u0e7f]/, 'th'],
  [/[\u0370-\u03ff\u1f00-\u1fff]/, 'el'],
  [/[\u0400-\u04ff]/, 'ru'],
];

/** The usual places of fonts with these letters, by language (Latin's for any other), bold first when asked. */
const KNOWN: Record<string, string[]> = {
  en: [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/Library/Fonts/Arial Bold.ttf',
    'C:\\Windows\\Fonts\\arialbd.ttf',
    'C:\\Windows\\Fonts\\segoeuib.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
  ],
  'zh-cn': [
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    'C:\\Windows\\Fonts\\msyhbd.ttc',
    'C:\\Windows\\Fonts\\msyh.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
  ],
  ja: ['/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc', 'C:\\Windows\\Fonts\\YuGothB.ttc', 'C:\\Windows\\Fonts\\meiryob.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'],
  ko: ['/System/Library/Fonts/AppleSDGothicNeo.ttc', 'C:\\Windows\\Fonts\\malgunbd.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'],
  ar: ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'C:\\Windows\\Fonts\\arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  he: ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'C:\\Windows\\Fonts\\arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'],
  hi: ['/System/Library/Fonts/Kohinoor.ttc', 'C:\\Windows\\Fonts\\Nirmala.ttf', '/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf'],
  th: ['/System/Library/Fonts/Thonburi.ttc', 'C:\\Windows\\Fonts\\tahomabd.ttf', '/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf'],
};

const picked = new Map<string, Promise<string | null>>();

function fcMatch(pattern: string): Promise<string | null> {
  const fc = which('fc-match');
  if (!fc) return Promise.resolve(null);
  return new Promise((resolve) =>
    execFile(fc, ['-f', '%{file}', pattern], { timeout: 10_000 }, (err, stdout) => {
      const f = String(stdout ?? '').trim();
      resolve(!err && f && /\.(ttf|otf|ttc)$/i.test(f) && fs.existsSync(f) ? f : null);
    }),
  );
}

/** A font file with the letters of `text` (bold when asked), or null when this computer has none to be found. */
export function fontFor(text: string, bold: boolean): Promise<string | null> {
  const lang = SCRIPTS.find(([re]) => re.test(text))?.[1] ?? 'en';
  const key = `${lang}${bold ? ':bold' : ''}`;
  let p = picked.get(key);
  if (!p) {
    p = (async () => {
      const fc = await fcMatch(`sans-serif${bold ? ':bold' : ''}:lang=${lang}`);
      if (fc) return fc;
      for (const f of [...(KNOWN[lang] ?? []), ...KNOWN.en]) if (fs.existsSync(f)) return f;
      return null;
    })();
    picked.set(key, p);
  }
  return p;
}
