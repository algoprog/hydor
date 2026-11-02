// Pictures for slides and documents: one from the device (made no larger than it needs to be, a PNG keeping its
// see-through parts) or from a web address, kept by the app as "naget-asset:<sha>" (POST /api/pages/assets).
import { post } from '../../lib/api';

/** A picture from the device, made no larger than it needs to be, and kept by the app: its source and size. */
export async function uploadPicture(file: Blob): Promise<{ src: string; w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That file is not a picture this browser can show'));
      i.src = url;
    });
    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 600;
    const svg = file.type === 'image/svg+xml';
    const gif = file.type === 'image/gif';
    let data: string;
    let w = nw;
    let h = nh;
    if (svg || gif || (file.size < 600_000 && Math.max(nw, nh) <= 2400)) {
      data = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result));
        r.onerror = () => fail(new Error('The picture could not be read'));
        r.readAsDataURL(file);
      });
    } else {
      // Smaller, keeping its shape; a PNG keeps its see-through parts.
      const k = Math.min(1, 2400 / Math.max(nw, nh));
      w = Math.round(nw * k);
      h = Math.round(nh * k);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      data = file.type === 'image/png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
    }
    const r = await post<{ src: string }>('/api/pages/assets', { data });
    return { src: r.src, w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Asks for a picture file; null when none was picked. */
export function choosePicture(): Promise<File | null> {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
    input.onchange = () => ok(input.files?.[0] ?? null);
    input.oncancel = () => ok(null);
    input.click();
  });
}


/** A picture at a web address, fetched and kept by the app: its source and size. */
export async function pictureFromUrl(url: string): Promise<{ src: string; w: number; h: number }> {
  const r = await post<{ src: string }>('/api/pages/assets', { url: /^https?:\/\//i.test(url) ? url : `https://${url}` });
  const size = await new Promise<{ w: number; h: number }>((ok) => {
    const i = new Image();
    i.onload = () => ok({ w: i.naturalWidth || 800, h: i.naturalHeight || 600 });
    i.onerror = () => ok({ w: 800, h: 600 });
    i.src = `/api/pages/assets/${r.src.slice('naget-asset:'.length)}`;
  });
  return { src: r.src, ...size };
}
