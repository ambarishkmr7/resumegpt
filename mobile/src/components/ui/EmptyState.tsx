import { StyleSheet, Text, View } from "react-native";
import { space, text } from "../../theme";
import { Button } from "./Button";

interface EmptyStateProps {
  emoji?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  emoji = "📄",
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[text.heading, { textAlign: "center" }]}>{title}</Text>
      {message ? (
        <Text style={[text.caption, { textAlign: "center" }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: space.md }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  emoji: { fontSize: 44 },
});
