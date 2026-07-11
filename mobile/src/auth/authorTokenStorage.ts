import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthorProfile } from "../api/adminTypes";

// Deliberately separate keys from tokenStorage.ts — author tokens (sub:
// "author:<id>") are never interchangeable with user tokens, so they must
// never share storage and risk being sent to the wrong auth dependency.
const TOKEN_KEY = "resumesgpt_author_token";
const AUTHOR_KEY = "resumesgpt_author_profile";

export async function loadAuthorToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveAuthorToken(token: string | null): Promise<void> {
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* keychain unavailable — session lives in memory only */
  }
}

export async function loadCachedAuthor(): Promise<AuthorProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTHOR_KEY);
    return raw ? (JSON.parse(raw) as AuthorProfile) : null;
  } catch {
    return null;
  }
}

export async function saveCachedAuthor(author: AuthorProfile | null): Promise<void> {
  try {
    if (author) await AsyncStorage.setItem(AUTHOR_KEY, JSON.stringify(author));
    else await AsyncStorage.removeItem(AUTHOR_KEY);
  } catch {
    /* best-effort cache */
  }
}
