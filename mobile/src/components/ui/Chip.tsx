import { Pressable, StyleSheet, Text, View } from "react-native";
import { color, fontFamily, radius, space } from "../../theme";

interface ChipProps {
  label: string;
  tint?: string;
  textColor?: string;
  onRemove?: () => void;
  onPress?: () => void;
  selected?: boolean;
  testID?: string;
}

export function Chip({
  label,
  tint,
  textColor,
  onRemove,
  onPress,
  selected,
  testID,
}: ChipProps) {
  const body = (
    <View
      testID={testID}
      style={[
        styles.chip,
        { backgroundColor: tint || color.surfaceSunken },
        selected && {
          backgroundColor: color.primarySoft,
          borderColor: color.primary,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: textColor || (selected ? color.primaryDark : color.inkSoft) },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={styles.x}>×</Text>
        </Pressable>
      ) : null}
    </View>
  );
  if (onPress) return <Pressable onPress={onPress}>{body}</Pressable>;
  return body;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "transparent",
    alignSelf: "flex-start",
    maxWidth: 240,
  },
  label: { fontFamily: fontFamily.bodyMedium, fontSize: 13 },
  x: { color: color.inkFaint, fontSize: 16, marginTop: -1 },
});
