import type { PropsWithChildren, ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, space, text } from "../../theme";

interface ScreenProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: ViewStyle;
  testID?: string;
}

// Base screen wrapper: safe-area top inset, warm paper background, optional
// big Fraunces title header and pull-to-refresh.
export function Screen({
  title,
  subtitle,
  headerRight,
  scroll = true,
  padded = true,
  refreshing,
  onRefresh,
  style,
  testID,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={text.hero}>{title}</Text>
        {subtitle ? (
          <Text style={[text.caption, { marginTop: 2 }]}>{subtitle}</Text>
        ) : null}
      </View>
      {headerRight}
    </View>
  ) : null;

  if (!scroll) {
    return (
      <View
        testID={testID}
        style={[
          styles.root,
          { paddingTop: insets.top + space.md },
          padded && styles.padded,
          style,
        ]}
      >
        {header}
        {children}
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={styles.root}
      contentContainerStyle={[
        { paddingTop: insets.top + space.md, paddingBottom: 120 },
        padded && styles.padded,
        style,
      ]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={color.primary}
            colors={[color.primary]}
          />
        ) : undefined
      }
    >
      {header}
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  padded: { paddingHorizontal: space.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: space.xl,
    gap: space.md,
  },
});
