// The saved signatures as the app's pages see them: the list (names, kinds, sizes), kept fresh when one changes
// anywhere (the server says so), and each one's picture, which only the app's own pages load.
import { useCallback, useEffect, useState } from 'react';
import type { SignatureKind, SignatureView } from '@shared/signatures';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { mu } from '../../lib/machine';
import type { SignaturePicture } from './picture';

/** The saved signatures (null while they load), and a way to load them again. */
export function useSignatures(): [SignatureView[] | null, () => void] {
  const [list, setList] = useState<SignatureView[] | null>(null);
  const load = useCallback(() => {
    api<{ signatures: SignatureView[] }>('/api/signatures')
      .then((r) => setList(r.signatures))
      .catch(() => setList((l) => l ?? []));
  }, []);
  useEffect(load, [load]);
  useFeatureEvent('signatures', load);
  return [list, load];
}

/** Where a saved signature's picture shows from (its last change in the address, so a new drawing shows at once). */
export const signatureSrc = (s: Pick<SignatureView, 'id' | 'updatedAt'>) => mu(`/api/signatures/${enc(s.id)}/image?v=${s.updatedAt}`);

/** Keeps a signature made on the pad. `keep: false` keeps it only for a day (one given to an agent for now). */
export const saveSignature = (o: { name: string; kind: SignatureKind; picture: SignaturePicture; keep?: boolean }) =>
  post<{ signature: SignatureView }>('/api/signatures', { name: o.name, kind: o.kind, image: o.picture.png, keep: o.keep }).then((r) => r.signature);
