// What designs (shared/design.ts) need of the server, signed in:
//   POST /api/pages/design-export  {html, title?, format: png|jpg|pdf, scale?: 1–3, transparent?, board?} → the file
//   POST /api/pages/video-address  {src: "naget-video:<sha>"} → {url}: where a kept video plays in a page
//   POST /api/pages/videos/from-media {media} → {src, url, poster?, w?, h?}: a Library video kept for pages
//   GET /api/brand → {brand}, PUT /api/brand {name?, colours, fonts, logos} → {brand}: the user's brand kit
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { cleanBrand, type BrandKit } from '../../shared/design-brand.ts';
import { VIDEO } from '../../shared/slides.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { getMedia } from '../media/store.ts';
import { noteRefs, sweepAssets } from './assets.ts';
import { exportDesign, type DesignFormat } from './design-export.ts';
import { fileName } from './export.ts';
import { checkHtml } from './store.ts';
import { getVideo, keepVideoFile, videoAddress } from './videos.ts';

const BRAND_REF = 'brand-kit';

export function initBrand(db: DB) {
  db.exec('create table if not exists brand_kit (id text primary key, data text not null, updated_at integer not null)');
}

export function readBrand(db: DB): BrandKit | null {
  try {
    const r = db.prepare("select data from brand_kit where id = 'mine'").get() as { data: string } | undefined;
    return r ? cleanBrand(JSON.parse(r.data)) : null;
  } catch {
    return null;
  }
}

/** The brand kit kept: its logos kept with it (while it names them), the ones it no longer names let go. */
export function saveBrand(db: DB, v: unknown): BrandKit {
  const k = cleanBrand(v);
  db.transaction(() => {
    db.prepare("insert into brand_kit (id, data, updated_at) values ('mine', ?, ?) on conflict(id) do update set data = excluded.data, updated_at = excluded.updated_at").run(JSON.stringify(k), Date.now());
    db.prepare('delete from page_asset_refs where page_id = ?').run(BRAND_REF);
    noteRefs(db, BRAND_REF, 1, k.logos.map((l) => l.src));
  })();
  sweepAssets(db);
  return k;
}

const FORMATS: DesignFormat[] = ['png', 'jpg', 'pdf'];

export function designRoutes(app: FastifyInstance, db: DB) {
  initBrand(db);
  const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
  app.post('/api/pages/design-export', { bodyLimit: 12 * 1024 * 1024 }, async (req, reply) => {
    const b = B(req);
    const format = String(b.format ?? '') as DesignFormat;
    if (!FORMATS.includes(format)) throw new HttpError(400, 'format is png, jpg or pdf');
    const html = checkHtml(b.html);
    const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 120) : 'Design';
    const f = await exportDesign(html, { title, format, scale: Number(b.scale) || 1, transparent: b.transparent === true, board: Number.isInteger(b.board) ? (b.board as number) : undefined, name: fileName });
    if (f.note) reply.header('X-Export-Note', f.note.replace(/[^\x20-\x7e]/g, '?'));
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${f.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .type(f.type)
      .send(f.data);
  });
  app.post('/api/pages/video-address', async (req) => {
    const src = String(B(req).src ?? '');
    const sha = src.startsWith(VIDEO) ? src.slice(VIDEO.length) : '';
    if (!getVideo(db, sha)) throw new HttpError(404, 'That video is not kept here');
    return { url: videoAddress(sha) };
  });
  app.post('/api/pages/videos/from-media', async (req) => {
    const m = getMedia(db, String(B(req).media ?? ''));
    if (!m || m.kind !== 'video' || !m.file) throw new HttpError(404, 'No such video in the Library');
    let kept;
    try {
      kept = await keepVideoFile(db, m.file, '/');
    } catch (e) {
      throw new HttpError(422, `That video could not be used: ${(e as Error).message}`);
    }
    const sha = kept.src.slice(VIDEO.length);
    return { src: kept.src, url: videoAddress(sha), ...(kept.frame ? { poster: `data:image/jpeg;base64,${kept.frame.toString('base64')}` } : {}), w: kept.w ?? m.width, h: kept.h ?? m.height };
  });
  app.get('/api/brand', async () => ({ brand: readBrand(db) }));
  app.put('/api/brand', async (req) => ({ brand: saveBrand(db, req.body) }));
}
