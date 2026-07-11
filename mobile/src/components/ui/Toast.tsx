import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, fontFamily, radius, shadow, space } from "../../theme";

type ToastKind = "info" | "success" | "error";
interface ToastMsg {
  id: number;
  kind: ToastKind;
  message: string;
}

let counter = 0;
let listener: ((t: ToastMsg) => void) | null = null;

// Imperative toast API — call from anywhere: toast.error("…").
export const toast = {
  show(message: string, kind: ToastKind = "info") {
    listener?.({ id: ++counter, kind, message });
  },
  success(message: string) {
    toast.show(message, "success");
  },
  error(message: string) {
    toast.show(message, "error");
  },
};

// Mount once near the root. Renders the latest toast for ~2.6 s.
export function ToastHost() {
  const [current, setCurrent] = useState<ToastMsg | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    listener = (t) => setCurrent(t);
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), 2600);
    return () => clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  const bg =
    current.kind === "error"
      ? color.crit
      : current.kind === "success"
        ? color.good
        : color.ink;

  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={FadeOutDown}
      pointerEvents="none"
      style={[styles.toast, { bottom: insets.bottom + 90, backgroundColor: bg }]}
    >
      <Text style={styles.text} numberOfLines={2} testID="toast-message">
        {current.message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: space.xl,
    right: space.xl,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 13,
    ...shadow.raised,
  },
  text: {
    color: color.white,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14,
    textAlign: "center",
  },
});
