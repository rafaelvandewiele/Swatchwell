export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export type HexColor = `#${string}`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function validateRGB(rgb: RGB): void {
  for (const channel of [rgb.r, rgb.g, rgb.b]) {
    if (!Number.isFinite(channel) || channel < 0 || channel > 255) {
      throw new RangeError("RGB channels must be between 0 and 255.");
    }
  }
}

function validateHSL(hsl: HSL): void {
  if (!Number.isFinite(hsl.h) || !Number.isFinite(hsl.s) || !Number.isFinite(hsl.l)) {
    throw new RangeError("HSL values must be finite numbers.");
  }

  if (hsl.s < 0 || hsl.s > 100 || hsl.l < 0 || hsl.l > 100) {
    throw new RangeError("HSL saturation and lightness must be between 0 and 100.");
  }
}

export function isValidHex(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export function normalizeHex(value: string): HexColor {
  if (!isValidHex(value)) {
    throw new Error(`Invalid HEX color: ${value}`);
  }

  const hex = value.slice(1).toLowerCase();
  const expanded = hex.length === 3
    ? hex.split("").map((char) => char + char).join("")
    : hex;

  return `#${expanded}`;
}

export function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex).slice(1);

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function rgbToHex(rgb: RGB): HexColor {
  validateRGB(rgb);

  const channel = (value: number) =>
    Math.round(value).toString(16).padStart(2, "0");

  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

export function rgbToHsl(rgb: RGB): HSL {
  validateRGB(rgb);

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r:
        h = 60 * (((g - b) / delta) % 6);
        break;
      case g:
        h = 60 * ((b - r) / delta + 2);
        break;
      default:
        h = 60 * ((r - g) / delta + 4);
    }
  }

  return {
    h: (h + 360) % 360,
    s: s * 100,
    l: l * 100,
  };
}

export function hslToRgb(hsl: HSL): RGB {
  validateHSL(hsl);

  const h = ((hsl.h % 360) + 360) % 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: RGB): number {
  validateRGB(rgb);

  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  );
}

export function contrastRatio(first: RGB, second: RGB): number {
  const luminance1 = relativeLuminance(first);
  const luminance2 = relativeLuminance(second);

  const lighter = Math.max(luminance1, luminance2);
  const darker = Math.min(luminance1, luminance2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Calculates Euclidean distance in RGB space.
 * This is not a perceptually uniform color difference metric.
 */
export function rgbDistance(first: RGB, second: RGB): number {
  validateRGB(first);
  validateRGB(second);

  return Math.sqrt(
    (first.r - second.r) ** 2 +
    (first.g - second.g) ** 2 +
    (first.b - second.b) ** 2
  );
}
