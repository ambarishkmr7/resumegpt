import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { color, fontFamily, radius, space } from "../../theme";
import { SpringPressable } from "./Pressable";

type Variant = "primary" | "cta" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "md" | "lg" | "sm";
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon,
  style,
  testID,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const height = size === "lg" ? 56 : size === "sm" ? 40 : 50;
  const fontSize = size === "lg" ? 17 : size === "sm" ? 13.5 : 15.5;

  const textColor =
    variant === "primary" || variant === "cta" || variant === "danger"
      ? color.white
      : variant === "secondary"
        ? color.primary
        : color.inkSoft;

  const inner = (
    <View style={styles.inner}>
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon}
          <Text
            style={{
              color: textColor,
              fontFamily: fontFamily.bodySemiBold,
              fontSize,
            }}
          >
            {label}
          </Text>
        </>
      )}
    </View>
  );

  return (
    <SpringPressable
      testID={testID}
      haptic
      disabled={isDisabled}
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.base,
        { height, borderRadius: radius.md },
        variant === "primary" && { backgroundColor: color.primary },
        variant === "danger" && { backgroundColor: color.crit },
        variant === "secondary" && {
          backgroundColor: color.primaryFaint,
          borderWidth: 1,
          borderColor: color.primarySoft,
        },
        variant === "ghost" && {
          backgroundColor: "transparent",
          borderWidth: 1,
          borderColor: color.line,
        },
        isDisabled && { opacity: 0.55 },
        style,
      ]}
    >
      {variant === "cta" ? (
        <LinearGradient
          colors={[color.cta, color.ctaDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius.md }]}
        />
      ) : null}
      {inner}
    </SpringPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: space.xl,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
});
