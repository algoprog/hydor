// Commits an agent made in a turn: a note under the turn's reply lists them, and each opens to its diff.

export interface TurnCommit {
  hash: string;
  subject: string;
  /** The branch it went on, as git said when it made it ("main", "detached HEAD"). */
  branch?: string;
  /** The repository's folder. */
  repo: string;
  /** The session's own repository: the Git page has it. */
  own?: boolean;
  author?: string;
  at: number;
  files: number;
  added: number;
  removed: number;
}

export interface CommitsNote {
  commits: TurnCommit[];
}
