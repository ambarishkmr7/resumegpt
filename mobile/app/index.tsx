import AsyncStorage from "@react-native-async-storage/async-storage";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { useAuth } from "../src/auth/store";

// Splash router: onboarding on first launch, login when logged out,
// tabs otherwise. RootLayout guarantees the auth store is hydrated.
export default function Index() {
  const token = useAuth((s) => s.token);
  const [seenOnboarding, setSeenOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("seen_onboarding")
      .then((v) => setSeenOnboarding(v === "1"))
      .catch(() => setSeenOnboarding(true));
  }, []);

  if (seenOnboarding === null) return null;
  if (token) return <Redirect href="/(tabs)" />;
  if (!seenOnboarding) return <Redirect href="/onboarding" />;
  return <Redirect href="/(auth)/login" />;
}
