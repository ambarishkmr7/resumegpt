import { api } from "../api/client";
import type { AuthResponse } from "../api/types";

// Native Google Sign-In. Requires EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (must match
// the backend's GOOGLE_CLIENT_ID so the idToken audience verifies) plus an
// Android OAuth client for this package/SHA-1 in the same Google Cloud project.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

export function googleSignInAvailable(): boolean {
  return WEB_CLIENT_ID.length > 0;
}

export async function signInWithGoogle(): Promise<AuthResponse> {
  const { GoogleSignin } = await import(
    "@react-native-google-signin/google-signin"
  );
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices();
  const result = await GoogleSignin.signIn();
  const idToken =
    (result as { data?: { idToken?: string | null } }).data?.idToken ?? null;
  if (!idToken) throw new Error("Google sign-in was cancelled.");
  return api.googleLogin(idToken);
}
