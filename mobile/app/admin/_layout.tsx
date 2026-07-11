import { Redirect, Stack } from "expo-router";
import { useAuth } from "../../src/auth/store";
import { color } from "../../src/theme";

// Every screen under app/admin/* requires user.is_admin — gated once here
// rather than per-screen so a new admin route can't accidentally ship unguarded.
export default function AdminLayout() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  if (!token) return <Redirect href="/(auth)/login" />;
  if (!user?.is_admin) return <Redirect href="/(tabs)/profile" />;

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
