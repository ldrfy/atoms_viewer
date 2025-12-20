const ATOMIC_SYMBOLS = [
  "E",
  "H",
  "He",
  "Li",
  "Be",
  "B",
  "C",
  "N",
  "O",
  "F",
  "Ne",
  "Na",
  "Mg",
  "Al",
  "Si",
  "P",
  "S",
  "Cl",
  "Ar",
  "K",
  "Ca",
  "Sc",
  "Ti",
  "V",
  "Cr",
  "Mn",
  "Fe",
  "Co",
  "Ni",
  "Cu",
  "Zn",
  "Ga",
  "Ge",
  "As",
  "Se",
  "Br",
  "Kr",
  "Rb",
  "Sr",
  "Y",
  "Zr",
  "Nb",
  "Mo",
  "Tc",
  "Ru",
  "Rh",
  "Pd",
  "Ag",
  "Cd",
  "In",
  "Sn",
  "Sb",
  "Te",
  "I",
  "Xe",
  "Cs",
  "Ba",
  "La",
  "Ce",
  "Pr",
  "Nd",
  "Pm",
  "Sm",
  "Eu",
  "Gd",
  "Tb",
  "Dy",
  "Ho",
  "Er",
  "Tm",
  "Yb",
  "Lu",
  "Hf",
  "Ta",
  "W",
  "Re",
  "Os",
  "Ir",
  "Pt",
  "Au",
  "Hg",
  "Tl",
  "Pb",
  "Bi",
  "Po",
  "At",
  "Rn",
  "Fr",
  "Ra",
  "Ac",
  "Th",
  "Pa",
  "U",
  "Np",
  "Pu",
  "Am",
  "Cm",
  "Bk",
  "Cf",
  "Es",
  "Fm",
  "Md",
  "No",
  "Lr",
] as const;

const ATOMIC_COLORS_HEX = [
  "#FFFFFF",
  "#FAF0E6",
  "#F0E68C",
  "#EE82EE",
  "#DB7093",
  "#56256e",
  "#778899",
  "#0033ff",
  "#ee0011",
  "#7fff7f",
  "#FF00FF",
  "#48D1CC",
  "#8B008B",
  "#D8BFD8",
  "#00CED1",
  "#BC043C",
  "#FFFF55",
  "#66CDAA",
  "#FF69B4",
  "#ADD8E6",
  "#5c9291",
  "#483D8B",
  "#8B708B",
  "#008080",
  "#B22222",
  "#a033a0",
  "#BC8F8F",
  "#50C878",
  "#66CDAA",
  "#D2691E",
  "#BC8F8F",
  "#F08080",
  "#E6E6FA",
  "#DAA520",
  "#e0ebaf",
  "#b44c97",
  "#00a497",
  "#b77b57",
  "#006e54",
  "#d69090",
  "#634950",
  "#44617b",
  "#E9967A",
  "#FF7F50",
  "#FFA07A",
  "#A0522D",
  "#FFE4C4",
  "#C0C0C0",
  "#BDB76B",
  "#6B8E23",
  "#556B2F",
  "#ADFF2F",
  "#008000",
  "#7a4171",
  "#7FFFD4",
  "#008080",
  "#00aaaa",
  "#999900",
  "#4682B4",
  "#4169E1",
  "#7B68EE",
  "#8A2BE2",
  "#BA55D3",
  "#800080",
  "#FF1493",
  "#c89932",
  "#5c9291",
  "#9d5b8b",
  "#eeeaec",
  "#e29676",
  "#5f6527",
  "#c70067",
  "#e9dacb",
  "#28ff93",
  "#0582ff",
  "#baff75",
  "#43676b",
  "#47585c",
  "#fde8d0",
  "#FFD700",
  "#dcd6d9",
  "#bf794e",
  "#f5b1aa",
  "#cd5e3c",
  "#95859c",
  "#71686c",
  "#203744",
  "#ec6d71",
  "#b55233",
  "#a19361",
  "#cc3399",
  "#3399cc",
  "#339966",
  "#ffff00",
  "#ccff33",
  "#cc3300",
  "#cc6600",
  "#ff0033",
  "#660066",
  "#006666",
  "#ffcc00",
  "#33cccc",
  "#99ffff",
  "#ff6666",
] as const;

const COVALENT_RADII_ANG = [
  0.2, 0.41, 0.41, 1.28, 0.96, 0.84, 0.76, 0.71, 0.66, 0.57, 0.58, 1.66, 1.41,
  1.21, 1.11, 1.07, 1.05, 1.02, 1.06, 2.03, 1.76, 1.7, 1.6, 1.53, 1.39, 1.39,
  1.32, 1.26, 1.24, 1.32, 1.22, 1.22, 1.2, 1.19, 1.2, 1.2, 1.16, 2.2, 1.95, 1.9,
  1.75, 1.64, 1.54, 1.47, 1.46, 1.42, 1.39, 1.45, 1.42, 1.42, 1.39, 1.39, 1.38,
  1.39, 1.4, 2.44, 2.15, 2.07, 2.04, 2.03, 2.01, 1.99, 1.98, 1.98, 1.96, 1.94,
  1.92, 1.92, 1.89, 1.9, 1.87, 1.87, 1.75, 1.7, 1.62, 1.51, 1.44, 1.41, 1.36,
  1.36, 1.32, 1.45, 1.46, 1.48, 1.4, 1.5, 1.5, 2.6, 2.21, 2.15, 2.06, 2.0, 1.96,
  1.9, 1.87, 1.8, 1.69, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.6,
] as const;

const SYMBOL_TO_Z = new Map<string, number>(
  ATOMIC_SYMBOLS.map((s, i) => [s.toLowerCase(), i])
);

function canonicalizeSymbol(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "E";

  // 1) 如果整列就是纯数字：按原子序数处理（例如 "6"）
  if (/^\d+$/.test(trimmed)) {
    const z = Number(trimmed);
    if (Number.isInteger(z) && z >= 0 && z < ATOMIC_SYMBOLS.length) {
      const sym = ATOMIC_SYMBOLS[z];
      if (sym) return sym; // 兼容 noUncheckedIndexedAccess
    }
    return "E";
  }

  // 2) 否则允许像 "C1" / "Si2"：去掉尾部数字
  const noTailDigits = trimmed.replace(/[0-9]+$/g, "");
  if (!noTailDigits) return "E";

  // 3) 标准化大小写：Si / si / SI
  if (noTailDigits.length === 1) return noTailDigits.toUpperCase();

  // 用 charAt 避免 s[0] 在严格索引下出现 undefined
  const first = noTailDigits.charAt(0).toUpperCase();
  const rest = noTailDigits.slice(1).toLowerCase();
  return first + rest;
}

export function getAtomicNumber(raw: string): number {
  const sym = canonicalizeSymbol(raw);
  return SYMBOL_TO_Z.get(sym.toLowerCase()) ?? 0; // 0 => E
}

export function getElementColorHex(raw: string): string {
  const z = getAtomicNumber(raw);
  return ATOMIC_COLORS_HEX[z] ?? "#CCCCCC";
}

export function getCovalentRadiusAng(raw: string): number {
  const z = getAtomicNumber(raw);
  return COVALENT_RADII_ANG[z] ?? 1.6;
}

export function normalizeElementSymbol(raw: string): string {
  return canonicalizeSymbol(raw);
}
