// Commits an agent made in a turn, as a note under its reply (server/commits).
import type { WebFeature } from '../registry';
import { CommitsNote } from './CommitsNote';

export const commitsFeature: WebFeature = {
  id: 'commits',
  noteViews: { commits: CommitsNote },
};
