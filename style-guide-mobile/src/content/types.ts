// Content types. Generated JSON in this folder is written by tools/extract-content.ts.
export type Category = 'ethnic' | 'fusion' | 'western';
export type Mood = 'easy' | 'classic' | 'bold';

export type Look = {
  id: string;
  name: string;
  category: Category;
  region: string;
  type: string;
  palette: string[];
  occasions: string[];
  mood: Mood;
  colourName: string;
  description: string;
  pieces: string[];
  footwear: string;
  accessories: string;
  tip: string;
  pattern?: string;
  photo: string; // key into LOOK_IMAGES
  photoFit?: 'contain';
};

export type Occasion = {
  id: string;
  name: string;
  subtitle: string;
  colour: string;
  dressing: string;
  whatToWear: string;
  avoid: string;
  colours: string;
};

export type ColourCombo = { name: string; a: string; b: string; usedFor: string; lookId: string };
export type Rule = { title: string; body: string };

export type SwapCategory =
  | 'top' | 'bottom' | 'shoes' | 'bag' | 'jewellery' | 'earrings' | 'necklace'
  | 'wrist' | 'rings' | 'head' | 'eyewear' | 'belt' | 'scarf';

export type TryOnPiece = {
  id: string;
  name: string;
  category: SwapCategory;
  x: number; y: number; w: number; h: number;
  desc: string;   // short description used in prompts
  prompt: string; // full Gemini prompt that made this piece
};

export type LookPart = { id: number; seg: string; name: string; share: number };
export type LookParts = { parts: LookPart[]; map: string };

export type PaletteColour = { hex: string; name: string };

export type BaseInfo = { w: number; h: number; means: number[]; bodyCentreX: number };

export type SiteConfig = { announce: string; announceOn: boolean; featured: string[]; hidden: string[] };
