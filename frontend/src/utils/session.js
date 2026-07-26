// Everything the app caches *about the signed-in person*, in one place so no
// sign-out path can forget a key.
//
// Career-counselling transcripts are private content and must not survive a
// sign-out on a shared machine; one-per-session UI flags must reset so the next
// person to sign in isn't treated as though they'd already seen things.
const USER_SCOPED_SESSION_KEYS = ["recharge_popup_shown", "pending_action"];
const USER_SCOPED_PREFIXES = ["career:"];

export function clearUserScopedStorage({ keepExpiredFlag = false } = {}) {
  try {
    localStorage.removeItem("user");
    for (const key of Object.keys(sessionStorage)) {
      if (USER_SCOPED_SESSION_KEYS.includes(key) ||
          USER_SCOPED_PREFIXES.some((p) => key.startsWith(p))) {
        sessionStorage.removeItem(key);
      }
    }
    // A deliberate sign-out shouldn't greet the user with "your session expired";
    // an involuntary 401 should, so that path keeps the flag.
    if (!keepExpiredFlag) sessionStorage.removeItem("session_expired");
  } catch (_) { /* storage disabled — nothing to clear */ }
}
