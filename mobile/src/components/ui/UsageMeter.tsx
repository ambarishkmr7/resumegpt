import { StyleSheet, Text, View } from "react-native";
import type { UsageSummary } from "../../api/types";
import { color, fontFamily, radius, space, text } from "../../theme";

// Interview-minute balance pill (mirrors the web usage meter).
export function UsageMeter({ usage, testID }: { usage: UsageSummary; testID?: string }) {
  const available = usage.available_seconds || 0;
  const total = Math.max(
    1,
    (usage.allowance_seconds || 0) + (usage.refill_seconds || 0),
  );
  const pct = Math.min(100, (available / total) * 100);
  const empty = available <= 0;
  const barColor = empty ? color.crit : color.good;

  return (
    <View
      testID={testID}
      style={[
        styles.wrap,
        { backgroundColor: empty ? color.critSoft : color.goodSoft },
      ]}
    >
      <View style={styles.row}>
        <Text style={text.label}>⏱️ Interview balance</Text>
        <Text style={[styles.minutes, { color: empty ? color.crit : color.good }]}>
          {usage.available_minutes ?? Math.floor(available / 60)} min left
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={text.caption}>
        {usage.plan_name ? `Plan: ${usage.plan_name}` : "Free trial"}
        {usage.cycle_end
          ? ` · resets ${new Date(usage.cycle_end).toLocaleDateString()}`
          : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.md,
    gap: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  minutes: { fontFamily: fontFamily.bodySemiBold, fontSize: 15 },
  track: {
    height: 6,
    backgroundColor: color.line,
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 4 },
});
