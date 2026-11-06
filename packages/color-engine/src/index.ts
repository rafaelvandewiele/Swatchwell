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

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export function rgbToLab(rgb: RGB): Lab {
  validateRGB(rgb);

  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);

  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const f = (value: number) => {
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    return value > epsilon
      ? Math.cbrt(value)
      : (kappa * value + 16) / 116;
  };

  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function hueAngle(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const angle = radiansToDegrees(Math.atan2(b, a));
  return (angle + 360) % 360;
}

export function deltaE2000(first: Lab, second: Lab): number {
  const values = [first.l, first.a, first.b, second.l, second.a, second.b];

  if (!values.every(Number.isFinite)) {
    throw new RangeError("Lab values must be finite numbers.");
  }

  const { l: l1, a: a1, b: b1 } = first;
  const { l: l2, a: a2, b: b2 } = second;

  const c1 = Math.hypot(a1, b1);
  const c2 = Math.hypot(a2, b2);
  const cBar = (c1 + c2) / 2;

  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + 25 ** 7)));

  const a1Prime = (1 + g) * a1;
  const a2Prime = (1 + g) * a2;

  const c1Prime = Math.hypot(a1Prime, b1);
  const c2Prime = Math.hypot(a2Prime, b2);

  const h1Prime = hueAngle(a1Prime, b1);
  const h2Prime = hueAngle(a2Prime, b2);

  const deltaL = l2 - l1;
  const deltaC = c2Prime - c1Prime;

  let deltaHue = h2Prime - h1Prime;

  if (c1Prime * c2Prime === 0) {
    deltaHue = 0;
  } else if (deltaHue > 180) {
    deltaHue -= 360;
  } else if (deltaHue < -180) {
    deltaHue += 360;
  }

  const deltaH = 2 * Math.sqrt(c1Prime * c2Prime) *
    Math.sin(degreesToRadians(deltaHue / 2));

  const lBar = (l1 + l2) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;

  let hBar = h1Prime + h2Prime;

  if (c1Prime * c2Prime === 0) {
    hBar = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    hBar /= 2;
  } else if (h1Prime + h2Prime < 360) {
    hBar = (hBar + 360) / 2;
  } else {
    hBar = (hBar - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(degreesToRadians(hBar - 30)) +
    0.24 * Math.cos(degreesToRadians(2 * hBar)) +
    0.32 * Math.cos(degreesToRadians(3 * hBar + 6)) -
    0.20 * Math.cos(degreesToRadians(4 * hBar - 63));

  const deltaTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const cBarPrime7 = cBarPrime ** 7;
  const rC = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + 25 ** 7));

  const sL =
    1 +
    (0.015 * (lBar - 50) ** 2) /
      Math.sqrt(20 + (lBar - 50) ** 2);

  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;

  const rT = -Math.sin(degreesToRadians(2 * deltaTheta)) * rC;

  const lTerm = deltaL / sL;
  const cTerm = deltaC / sC;
  const hTerm = deltaH / sH;

  return Math.sqrt(
    lTerm ** 2 +
    cTerm ** 2 +
    hTerm ** 2 +
    rT * cTerm * hTerm
  );
}

export type ColorPalette = HexColor[];

function rotateHue(hsl: HSL, degrees: number): HSL {
  return {
    ...hsl,
    h: (hsl.h + degrees + 360) % 360,
  };
}

function hslToHex(hsl: HSL): HexColor {
  return rgbToHex(hslToRgb(hsl));
}

export function generateComplementary(hex: string): ColorPalette {
  const base = rgbToHsl(hexToRgb(hex));

  return [
    normalizeHex(hex),
    hslToHex(rotateHue(base, 180)),
  ];
}

export function generateAnalogous(
  hex: string,
  angle = 30,
): ColorPalette {
  if (!Number.isFinite(angle) || angle <= 0 || angle > 180) {
    throw new RangeError("Analogous angle must be between 0 and 180.");
  }

  const base = rgbToHsl(hexToRgb(hex));

  return [
    hslToHex(rotateHue(base, -angle)),
    normalizeHex(hex),
    hslToHex(rotateHue(base, angle)),
  ];
}

export function generateTriadic(hex: string): ColorPalette {
  const base = rgbToHsl(hexToRgb(hex));

  return [
    normalizeHex(hex),
    hslToHex(rotateHue(base, 120)),
    hslToHex(rotateHue(base, 240)),
  ];
}

export function generateSplitComplementary(hex: string): ColorPalette {
  const base = rgbToHsl(hexToRgb(hex));

  return [
    normalizeHex(hex),
    hslToHex(rotateHue(base, 150)),
    hslToHex(rotateHue(base, 210)),
  ];
}

export function generateMonochromatic(
  hex: string,
  variations = 5,
): ColorPalette {
  if (!Number.isInteger(variations) || variations < 2 || variations > 10) {
    throw new RangeError("Variations must be an integer between 2 and 10.");
  }

  const base = rgbToHsl(hexToRgb(hex));

  return Array.from({ length: variations }, (_, index) => {
    const lightness = 10 + (80 * index) / (variations - 1);

    return hslToHex({
      ...base,
      l: lightness,
    });
  });
}

export * from "./seasonal-analysis";
export * from "./seasonal-palettes";
export * from "./color-compatibility";
