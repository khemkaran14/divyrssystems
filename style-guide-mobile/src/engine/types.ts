import type { SwapCategory } from '../content/types';

/** RGBA pixels, unpremultiplied, row-major. */
export type Pixels = { w: number; h: number; data: Uint8Array | Uint8ClampedArray };
export type Part = 'top' | 'bottom' | 'shoes';
export type BodyType = 'petite' | 'slim' | 'regular' | 'curvy' | 'plus' | 'tall';

/** A recolourable region of a look photo: a LOOKPARTS part (pid) or a flood-fill area (seed). */
export type RegionState = {
  pid?: number;
  seg?: string;
  name?: string;
  seed?: [number, number, number];
  col: string | null;
};
export type Region = RegionState & { mask: Uint8Array };

/** Current selection: a model part, a region index, or a whole garment group "g:<seg>". */
export type Selection = Part | number | `g:${string}` | null;

export type HistoryEntry =
  | ['region']
  | ['part', Part, string | undefined]
  | ['col', number, string | null]
  | ['cols', [number, string | null][]]
  | ['var', SwapCategory, string | undefined];

/** A try-on piece placed on the 683 × 1024 frame. */
export type PieceData = {
  /** RGBA of the piece image in the full frame. */
  img: Uint8Array;
  /** paste alpha (mask R) in the full frame */
  comp: Uint8Array;
  /** recolour area (mask G) in the full frame */
  rec: Uint8Array;
};

/** What a saved styled look stores (same shape as the website). */
export type SavedLook = {
  lid: string;
  bt: BodyType;
  who: string;
  parts: Partial<Record<Part, string>>;
  variant: Partial<Record<SwapCategory, string>>;
  regions: ({ pid: number; col: string } | { seed: [number, number, number]; col: string })[];
  thumb: string;
  t?: number;
};
