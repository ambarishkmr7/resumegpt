import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, fontFamily, space } from "../../theme";

// Compact header for pushed screens: back chevron + centered title.
export function BackHeader({
  title,
  right,
  testID,
}: {
  title: string;
  right?: React.ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: insets.top + space.sm }]} testID={testID}>
      <Pressable
        testID="back-button"
        onPress={() => router.back()}
        hitSlop={12}
        style={styles.back}
      >
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    backgroundColor: color.bg,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 26, color: color.ink, marginTop: -3 },
  title: {
    flex: 1,
    textAlign: "center",
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 16.5,
    color: color.ink,
  },
  right: { minWidth: 40, alignItems: "flex-end" },
});
