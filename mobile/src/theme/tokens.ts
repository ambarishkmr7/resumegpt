// Design tokens ported from frontend/src/styles/app.css and brightened for
// mobile. Warm paper background, terracotta primary, amber CTAs.
export const color = {
  bg: "#F7F3EC",
  surface: "#FFFDF8",
  surfaceSunken: "#F1ECE1",
  ink: "#1C1A17",
  inkSoft: "#57514A",
  inkFaint: "#8A8177",
  line: "#E2DCCF",
  lineStrong: "#CFC6B4",

  primary: "#C2542B",
  primaryDark: "#9C4023",
  primarySoft: "#F5DFD3",
  primaryFaint: "#FAF0E9",

  cta: "#D97706",
  ctaDark: "#B45309",
  ctaSoft: "#FCEBD2",

  good: "#16A34A",
  goodSoft: "#E3F4E9",
  warn: "#B8821A",
  warnSoft: "#F8EDD4",
  crit: "#DC2626",
  critSoft: "#FBE4E4",

  white: "#FFFFFF",
  overlay: "rgba(28, 26, 23, 0.45)",
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const shadow = {
  card: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  raised: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

export function scoreColor(score: number): string {
  if (score >= 75) return color.good;
  if (score >= 50) return color.warn;
  return color.crit;
}
