import * as d3ScaleChromatic from 'd3-scale-chromatic';
import {range} from 'd3-array';
import chroma from 'chroma-js';
import {color as d3Color} from 'd3-color';
import {
  HexColor,
  MiniColorRange,
  ValueOf,
  CATEGORIES,
  PALETTE_TYPES,
  ColorPalette,
  CategoricalPalette,
  SequentialPalette
} from '../types/color-palette';

// ColorBrewer scheme groups
export const COLORBREWER_SCHEME = {
  [PALETTE_TYPES.SEQ]: [
    'BuGn', 'BuPu', 'GnBu', 'OrRd', 'PuBu', 'PuBuGn', 'PuRd', 'RdPu',
    'YlGn', 'YlGnBu', 'YlOrBr', 'YlOrRd', 'Blues', 'Greens', 'Greys',
    'Oranges', 'Purples', 'Reds'
  ],
  [PALETTE_TYPES.DIV]: [
    'BrBG', 'PiYG', 'PRGn', 'PuOr', 'RdBu', 'RdGy', 'RdYlBu', 'RdYlGn', 'Spectral'
  ],
  [PALETTE_TYPES.QUA]: [
    'Accent', 'Dark2', 'Paired', 'Pastel1', 'Pastel2', 'Set1', 'Set2', 'Set3'
  ]
} as const;

// D3 color scheme groups
export const D3_COLOR_CHROMATIC_SCHEME = {
  [PALETTE_TYPES.CYC]: ['Sinebow', 'Rainbow'],
  [PALETTE_TYPES.SEQ]: [
    'Turbo', 'Viridis', 'Inferno', 'Magma', 'Plasma', 'Cividis',
    'Warm', 'Cool', 'CubehelixDefault'
  ],
  [PALETTE_TYPES.QUA]: ['Tableau10']
} as const;

// Color blind safe map
const COLOR_BLIND_SAFE_MAP: Record<string, boolean> = {
  // colorbrewer
  BrBG: true, PiYG: true, PRGn: true, PuOr: true, RdBu: true,
  RdGy: false, RdYlBu: true, RdYlGn: false, Spectral: false,
  Accent: false, Dark2: true, Paired: true, Pastel1: false,
  Pastel2: false, Set1: false, Set2: true, Set3: false,
  Blues: true, BuGn: true, BuPu: true, GnBu: true,
  Greens: true, Greys: true, Oranges: true, OrRd: true,
  PuBu: true, PuBuGn: true, PuRd: true, Purples: true,
  RdPu: true, Reds: true, YlGn: true, YlGnBu: true,
  YlOrBr: true, YlOrRd: true,

  // d3 scale chromatic
  Sinebow: true, Rainbow: false, Turbo: true, Viridis: true,
  Inferno: true, Magma: true, Plasma: true, Cividis: true,
  Warm: true, Cool: false, CubehelixDefault: true, Tableau10: false
};

// Helper function to convert color to uppercase hex
function _colorToUppercase(c: string): string {
  return d3Color(c)?.formatHex().toUpperCase() || '#FFFFFF';
}

/**
 * Build Categorical color palette
 */
export function buildCategoricalPalette({
  name,
  category,
  colors,
  colorBlindSafe
}: {
  name: string;
  category: ValueOf<typeof CATEGORIES>;
  colors?: HexColor[];
  colorBlindSafe?: boolean;
}): CategoricalPalette {
  let allColors: string[];
  
  // find d3 color scheme
  const scheme = (d3ScaleChromatic as any)[`scheme${name}`];

  if (!scheme && !colors) {
    console.warn(`scheme${name} cant not be found in d3 scale chromatic, needs to provide colors`);
    allColors = ['#DDDDDD'];
  } else if (!scheme) {
    // build from colors
    allColors = colors || [];
  } else {
    allColors = scheme;
  }

  if (!allColors.length) {
    console.warn('Needs to provide valid d3 color scheme name or an array of colors');
  }

  return {
    name,
    category,
    type: 'qualitative',
    colorBlindSafe: colorBlindSafe ?? COLOR_BLIND_SAFE_MAP[name],
    maxStep: allColors.length,
    colors: numColors => {
      // if numColors > maxSteps, will return allColors
      return allColors.slice(0, numColors).map(_colorToUppercase);
    }
  };
}

/**
 * Build Sequential color palette
 */
export function buildSequentialPalette({
  name,
  type,
  category
}: {
  name: string;
  type: SequentialPalette['type'];
  category: ValueOf<typeof CATEGORIES>;
}): SequentialPalette {
  if (!Object.prototype.hasOwnProperty.call(COLOR_BLIND_SAFE_MAP, name)) {
    console.warn(`${name} does not exists in COLOR_BLIND_SAFE_MAP`);
  }
  
  const interpolator = (d3ScaleChromatic as any)[`interpolate${name}`];

  return {
    name,
    type,
    category,
    colorBlindSafe: COLOR_BLIND_SAFE_MAP[name],
    colors: numColors => {
      return range(0, numColors, 1)
        .map(d => interpolator(d / (numColors - 1)))
        .map(_colorToUppercase);
    },
    linear: () => (n: number) => interpolator(n)
  };
}

/**
 * Build Custom color palette
 */
export function buildCustomPalette({
  colors,
  colors2 = [],
  correctLightness = true,
  bezier = false,
  diverging = false,
  mode = 'lch',
  name,
  type,
  category,
  colorBlindSafe
}: {
  colors: HexColor[];
  colors2?: HexColor[];
  correctLightness?: boolean;
  bezier?: boolean;
  diverging?: boolean;
  mode?: 'rgb' | 'lab' | 'lch' | 'hsl' | 'lrgb';
  name: string;
  type: SequentialPalette['type'];
  category: ValueOf<typeof CATEGORIES>;
  colorBlindSafe: boolean;
}): SequentialPalette | undefined {
  const palette: SequentialPalette = {
    name,
    type,
    category,
    colorBlindSafe,
    colors: () => [],
    linear: () => () => ''
  };

  if (!colors.length) {
    console.error('colors has to be an array of colors');
    return;
  }

  const scaleLeft = chroma
    .scale(colors)
    .mode(mode)
    .correctLightness(correctLightness);

  let scaleRight: chroma.Scale | undefined;
  let scaleFull: chroma.Scale | undefined;

  if (diverging) {
    if (!colors2.length) {
      console.error('colors2 has to be an array of colors when diverging = true');
      return;
    }
    scaleRight = chroma
      .scale(colors2)
      .mode(mode)
      .correctLightness(correctLightness);

    scaleFull = chroma
      .scale(colors.concat(colors2))
      .mode(mode)
      .correctLightness(correctLightness);
  }

  // given number of colors return color steps
  palette.colors = numColors => {
    if (diverging && scaleRight) {
      const even = numColors % 2 === 0;

      const numColorsLeft = Math.ceil(numColors / 2) + (even ? 1 : 0);
      const numColorsRight = Math.ceil(numColors / 2) + (even ? 1 : 0);

      const colorsLeft = scaleLeft ? scaleLeft.colors(numColorsLeft) : [];
      const colorsRight = scaleRight ? scaleRight.colors(numColorsRight) : [];
      const steps = (even ? colorsLeft.slice(0, colorsLeft.length - 1) : colorsLeft)
        .concat(colorsRight.slice(1))
        .map(_colorToUppercase);

      return steps;
    }

    return scaleLeft ? scaleLeft.colors(numColors).map(_colorToUppercase) : [];
  };

  palette.linear = () => (n: number) => {
    const scale = diverging && scaleFull ? scaleFull : scaleLeft;
    return scale(n).hex();
  };

  return palette;
}

/**
 * Build palettes by scheme groups
 */
function buildPaletteBySchemeGroups(
  schemeGroups: typeof COLORBREWER_SCHEME | typeof D3_COLOR_CHROMATIC_SCHEME,
  category: ValueOf<typeof CATEGORIES>
): ColorPalette[] {
  return Object.entries(schemeGroups).reduce((accu, [type, palettes]) => {
    return [
      ...accu,
      ...palettes.reduce((group: ColorPalette[], name: string) => {
        const colorPalette =
          type === PALETTE_TYPES.QUA
            ? buildCategoricalPalette({name, category})
            : buildSequentialPalette({name, type: type as SequentialPalette['type'], category});
        group.push(colorPalette);
        return group;
      }, [])
    ];
  }, [] as ColorPalette[]);
}

// Build all available palettes
const COLORBREWER_PALETTES = buildPaletteBySchemeGroups(COLORBREWER_SCHEME, CATEGORIES.COLORBREWER);
const D3_COLOR_PALETTES = buildPaletteBySchemeGroups(D3_COLOR_CHROMATIC_SCHEME, CATEGORIES.D3);

// Export all available color palettes
export const KEPLER_COLOR_PALETTES: ColorPalette[] = [
  ...COLORBREWER_PALETTES,
  ...D3_COLOR_PALETTES
];

/**
 * Create color range from palette
 */
export function colorPaletteToColorRange(
  colorPalette: ColorPalette,
  colorConfig: {
    reversed: boolean;
    steps: number;
  }
): MiniColorRange {
  const {steps, reversed} = colorConfig;
  const colors = colorPalette.colors(steps).slice();
  if (reversed) {
    colors.reverse();
  }

  return {
    name: colorPalette.name,
    type: colorPalette.type,
    category: colorPalette.category,
    colors,
    ...(reversed ? {reversed} : {})
  };
} 