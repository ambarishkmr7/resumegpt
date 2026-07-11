import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { color, radius, shadow, space } from "../../theme";
import { SpringPressable } from "./Pressable";

interface CardProps extends PropsWithChildren {
  onPress?: () => void;
  style?: ViewStyle;
  tint?: string; // soft background tint (e.g. color.primaryFaint)
  testID?: string;
}

export function Card({ children, onPress, style, tint, testID }: CardProps) {
  const base = [
    styles.card,
    tint ? { backgroundColor: tint } : null,
    style,
  ] as ViewStyle[];

  if (onPress) {
    return (
      <SpringPressable testID={testID} haptic onPress={onPress} style={base}>
        {children}
      </SpringPressable>
    );
  }
  return (
    <View testID={testID} style={base}>
      {children}
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
    ...shadow.card,
  },
});
