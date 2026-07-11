import type { ConfigContext, ExpoConfig } from "expo/config";

// Dev builds talk to the local backend over cleartext HTTP (10.0.2.2 from the
// Android emulator). Production builds must use HTTPS only.
const IS_DEV = process.env.APP_VARIANT !== "production";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "resumesGPT",
  slug: "resumesgpt",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "resumesgpt",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.resumesgpt.app",
    infoPlist: {
      NSMicrophoneUsageDescription:
        "resumesGPT uses your microphone for live AI mock interviews.",
      NSPhotoLibraryUsageDescription:
        "resumesGPT lets you add a profile photo to your resume from your photo library.",
    },
  },
  android: {
    package: "com.resumesgpt.app",
    adaptiveIcon: {
      backgroundColor: "#F7F3EC",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    permissions: ["android.permission.RECORD_AUDIO"],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-audio",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#F7F3EC",
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          usesCleartextTraffic: IS_DEV,
          minSdkVersion: 24,
        },
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "resumesGPT lets you add a profile photo to your resume.",
      },
    ],
    "react-native-audio-api",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    apiBase: process.env.EXPO_PUBLIC_API_BASE ?? "",
  },
});
