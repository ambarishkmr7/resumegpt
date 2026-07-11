import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { color, radius, space } from "../../theme";

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  round?: number;
  style?: ViewStyle;
}

// Shimmer placeholder block (pulse opacity — cheap and smooth).
export function Skeleton({
  width = "100%",
  height = 16,
  round = radius.sm,
  style,
}: SkeletonProps) {
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: round, backgroundColor: color.line },
        anim,
        style,
      ]}
    />
  );
}

// Ready-made card-shaped loading placeholder for lists.
export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <View style={styles.card}>
      <Skeleton width="55%" height={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i % 2 ? "70%" : "90%"} height={12} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.lg,
    gap: space.md,
  },
});
