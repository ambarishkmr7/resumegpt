import { Redirect, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { useAuthorAuth } from "../../../src/auth/authorStore";
import { color } from "../../../src/theme";

// Author auth is hydrated lazily (only when someone actually opens this
// section) rather than blocking every user's app boot for a rarely-used
// editorial-team feature — see src/auth/authorStore.ts.
export default function AuthorDashLayout() {
  const hydrate = useAuthorAuth((s) => s.hydrate);
  const hydrated = useAuthorAuth((s) => s.hydrated);
  const token = useAuthorAuth((s) => s.token);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) {
      setStarted(true);
      void hydrate();
    }
  }, [started, hydrate]);

  if (!hydrated) return null;
  if (!token) return <Redirect href="/author/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.bg },
        animation: "slide_from_right",
      }}
    />
  );
}
