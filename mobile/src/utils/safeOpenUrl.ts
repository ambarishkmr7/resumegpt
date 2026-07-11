import { Linking } from "react-native";

// Job listings and reference links can originate from AI-generated content
// (job-listings/agent-chat) or external data — never pass them to
// Linking.openURL unvalidated. Only http(s) is allowed; anything else
// (javascript:, intent:, data:, etc.) is silently refused.
export function safeOpenUrl(url: string | undefined | null): void {
  if (!url) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  void Linking.openURL(url);
}
