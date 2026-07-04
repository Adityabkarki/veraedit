export interface CuratedFontPairing {
  id: string;
  headingFont: string;
  bodyFont: string;
  devanagariFont: string;
  /** Common web font names that map to this pairing. */
  aliases: string[];
}

export const CURATED_FONT_PAIRINGS: CuratedFontPairing[] = [
  {
    id: "inter",
    headingFont: "Inter",
    bodyFont: "Inter",
    devanagariFont: "Noto Sans Devanagari",
    aliases: ["inter", "system-ui", "arial", "helvetica", "sans-serif"],
  },
  {
    id: "montserrat",
    headingFont: "Montserrat",
    bodyFont: "Open Sans",
    devanagariFont: "Noto Sans Devanagari",
    aliases: ["montserrat", "open sans", "opensans"],
  },
  {
    id: "poppins",
    headingFont: "Poppins",
    bodyFont: "Roboto",
    devanagariFont: "Noto Sans Devanagari",
    aliases: ["poppins", "roboto"],
  },
  {
    id: "playfair",
    headingFont: "Playfair Display",
    bodyFont: "Source Sans 3",
    devanagariFont: "Noto Sans Devanagari",
    aliases: ["playfair", "playfair display", "source sans", "georgia", "serif"],
  },
];

export function mapToCuratedFont(detected: string): CuratedFontPairing {
  const lower = detected.toLowerCase().trim();
  for (const pairing of CURATED_FONT_PAIRINGS) {
    if (pairing.aliases.some((a) => lower.includes(a))) {
      return pairing;
    }
  }
  return CURATED_FONT_PAIRINGS[0];
}

export function resolveFontPairingId(id: string): CuratedFontPairing {
  return CURATED_FONT_PAIRINGS.find((p) => p.id === id) ?? CURATED_FONT_PAIRINGS[0];
}
