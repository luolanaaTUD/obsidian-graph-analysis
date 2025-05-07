export type HexColor = string;

export type ValueOf<T> = T[keyof T];

export type MiniColorRange = {
  name: string;
  type: string;
  category: string;
  colors: HexColor[];
  reversed?: boolean;
};

export type GetColors = (steps: number) => HexColor[];
export type GetLinear = () => (n: number) => string;

export type CategoricalPalette = {
  name: string;
  type: 'qualitative';
  category: ValueOf<typeof CATEGORIES>;
  colorBlindSafe: boolean;
  colors: GetColors;
  maxStep: number;
};

export type SequentialPalette = {
  name: string;
  type: 'sequential' | 'diverging' | 'cyclical';
  category: ValueOf<typeof CATEGORIES>;
  colorBlindSafe: boolean;
  colors: GetColors;
  linear: GetLinear;
};

export type ColorPalette = CategoricalPalette | SequentialPalette;

export const CATEGORIES = {
  COLORBREWER: 'ColorBrewer',
  D3: 'D3',
  UBER: 'Uber',
  COLORBLIND: 'ColorBlind'
} as const;

export const PALETTE_TYPES = {
  SEQ: 'sequential',
  QUA: 'qualitative',
  DIV: 'diverging',
  CYC: 'cyclical'
} as const; 