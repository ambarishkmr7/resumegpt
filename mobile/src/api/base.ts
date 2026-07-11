import { Platform } from "react-native";

// The Android emulator reaches the host machine's localhost via 10.0.2.2.
// Point EXPO_PUBLIC_API_BASE at the deployed backend for production builds.
const DEV_DEFAULT =
  Platform.OS === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";

export const BASE: string =
  process.env.EXPO_PUBLIC_API_BASE && process.env.EXPO_PUBLIC_API_BASE.length > 0
    ? process.env.EXPO_PUBLIC_API_BASE
    : DEV_DEFAULT;

export function wsBase(): string {
  return BASE.replace(/^http/, "ws");
}
