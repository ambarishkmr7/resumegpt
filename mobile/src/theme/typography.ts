import { color } from "./tokens";

// Fraunces = display serif (titles, scores, prices), Spline Sans = body.
export const fontFamily = {
  display: "Fraunces_600SemiBold",
  displayBold: "Fraunces_700Bold",
  body: "SplineSans_400Regular",
  bodyMedium: "SplineSans_500Medium",
  bodySemiBold: "SplineSans_600SemiBold",
} as const;

export const text = {
  hero: {
    fontFamily: fontFamily.displayBold,
    fontSize: 32,
    lineHeight: 38,
    color: color.ink,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    color: color.ink,
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 18,
    lineHeight: 24,
    color: color.ink,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    color: color.ink,
  },
  bodyMedium: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    color: color.ink,
  },
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: color.ink,
  },
  caption: {
    fontFamily: fontFamily.body,
    fontSize: 12.5,
    lineHeight: 17,
    color: color.inkSoft,
  },
  micro: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    color: color.inkFaint,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
} as const;
