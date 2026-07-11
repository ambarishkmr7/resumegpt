import { Redirect, Stack } from "expo-router";
import { ToastHost } from "../../src/components/ui";
import { useAuth } from "../../src/auth/store";
import { color } from "../../src/theme";

export default function AuthLayout() {
  const token = useAuth((s) => s.token);
  if (token) return <Redirect href="/(tabs)" />;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
          animation: "fade_from_bottom",
        }}
      />
      <ToastHost />
    </>
  );
}
