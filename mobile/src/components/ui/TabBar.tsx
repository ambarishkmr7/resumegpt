import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, fontFamily, radius, shadow, space } from "../../theme";

const TAB_META: Record<string, { icon: string; label: string }> = {
  index: { icon: "🏠", label: "Home" },
  interview: { icon: "🎙️", label: "Interview" },
  tools: { icon: "✨", label: "AI Tools" },
  profile: { icon: "👤", label: "Profile" },
};

// Floating card tab bar with a springy active pill.
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, space.md) }]}
      pointerEvents="box-none"
    >
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_META[route.name] ?? { icon: "•", label: route.name };
          return (
            <TabItem
              key={route.key}
              icon={meta.icon}
              label={meta.label}
              focused={focused}
              testID={`tab-${route.name}`}
              onPress={() => {
                void Haptics.selectionAsync();
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  icon,
  label,
  focused,
  onPress,
  testID,
}: {
  icon: string;
  label: string;
  focused: boolean;
  onPress: () => void;
  testID: string;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.9, { damping: 16, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 240 });
      }}
      style={styles.item}
    >
      <Animated.View
        style={[styles.itemInner, focused && styles.itemActive, anim]}
      >
        <Text style={styles.icon}>{icon}</Text>
        {focused ? <Text style={styles.label}>{label}</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.line,
    padding: 6,
    gap: 2,
    marginHorizontal: space.xl,
    ...shadow.raised,
  },
  item: { borderRadius: radius.pill },
  itemInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  itemActive: { backgroundColor: color.primarySoft },
  icon: { fontSize: 19 },
  label: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
    color: color.primaryDark,
  },
});
