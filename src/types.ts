export type Phase = 'boot' | 'intro' | 'battle' | 'champion';

export interface Country {
  code: string;
  name: string;
}

export interface EliminationEntry {
  code: string;
  name: string;
  /** Final placement: 195 = first eliminated, 2 = last eliminated, 1 = champion. */
  place: number;
}

export interface GameOptions {
  seed: number;
  debug: boolean;
}
