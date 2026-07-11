import { Redirect, Tabs } from "expo-router";
import { TabBar } from "../../src/components/ui/TabBar";
import { ToastHost } from "../../src/components/ui";
import { useAuth } from "../../src/auth/store";
import { color } from "../../src/theme";

export default function TabsLayout() {
  const token = useAuth((s) => s.token);
  if (!token) return <Redirect href="/(auth)/login" />;

  return (
    <>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: color.bg },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="interview" />
        <Tabs.Screen name="tools" />
        <Tabs.Screen name="profile" />
      </Tabs>
      <ToastHost />
    </>
  );
}
