import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Card, Chip, Screen, SkeletonCard } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

const RANGES = [7, 30, 90];
type Tab = "llm" | "pnl";

export default function AdminAnalytics() {
  const [tab, setTab] = useState<Tab>("llm");
  const [days, setDays] = useState(30);

  const llm = useQuery({
    queryKey: ["admin-llm-usage", days],
    queryFn: () => api.adminLlmUsageSummary(days),
    enabled: tab === "llm",
  });
  const pnl = useQuery({
    queryKey: ["admin-pnl", days],
    queryFn: () => api.adminProfitLoss(days),
    enabled: tab === "pnl",
  });

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Analytics" />
      <Screen scroll padded>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          <Chip label="LLM cost" selected={tab === "llm"} onPress={() => setTab("llm")} />
          <Chip label="Profit & loss" selected={tab === "pnl"} onPress={() => setTab("pnl")} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {RANGES.map((d) => (
            <Chip key={d} label={`${d}d`} selected={days === d} onPress={() => setDays(d)} />
          ))}
        </ScrollView>

        {tab === "llm" ? (
          llm.isLoading ? (
            <SkeletonCard lines={4} />
          ) : (
            <View style={{ gap: space.md }}>
              <View style={styles.statGrid}>
                <Stat label="Calls" value={llm.data?.total_calls} />
                <Stat label="Tokens" value={llm.data?.total_tokens} />
                <Stat label={`Cost (${llm.data?.currency || "USD"})`} value={llm.data?.total_cost_usd?.toFixed(2)} />
              </View>
              {llm.data?.by_purpose?.length ? (
                <Card style={{ gap: space.sm }}>
                  <Text style={text.title}>By purpose</Text>
                  {llm.data.by_purpose.map((p) => (
                    <Row key={p.purpose} label={p.purpose} value={`${p.calls} calls · $${p.cost_usd.toFixed(2)}`} />
                  ))}
                </Card>
              ) : null}
              {llm.data?.by_provider?.length ? (
                <Card style={{ gap: space.sm }}>
                  <Text style={text.title}>By provider</Text>
                  {llm.data.by_provider.map((p) => (
                    <Row key={p.provider} label={p.provider} value={`${p.calls} calls · $${p.cost_usd.toFixed(2)}`} />
                  ))}
                </Card>
              ) : null}
            </View>
          )
        ) : pnl.isLoading ? (
          <SkeletonCard lines={4} />
        ) : (
          <View style={{ gap: space.md }}>
            <View style={styles.statGrid}>
              <Stat label="Revenue ₹" value={pnl.data?.revenue_inr} />
              <Stat label="Cost ₹" value={pnl.data?.cost_inr?.toFixed(0)} />
              <Stat label="Margin %" value={pnl.data?.margin_pct?.toFixed(1)} />
            </View>
            <Card style={{ gap: space.sm }}>
              <Text style={text.title}>Gross profit</Text>
              <Text style={styles.bigNumber}>₹{pnl.data?.gross_profit_inr?.toFixed(0)}</Text>
            </Card>
            {pnl.data?.per_plan?.length ? (
              <Card style={{ gap: space.sm }}>
                <Text style={text.title}>By plan</Text>
                {pnl.data.per_plan.map((p) => (
                  <Row key={p.plan_id} label={p.plan_name} value={`${p.count} · ₹${p.revenue_inr}`} />
                ))}
              </Card>
            ) : null}
            {pnl.data?.suggestions?.length ? (
              <Card tint={color.primaryFaint} style={{ gap: 4 }}>
                <Text style={text.label}>💡 Suggestions</Text>
                {pnl.data.suggestions.map((s, i) => (
                  <Text key={i} style={text.caption}>
                    • {s}
                  </Text>
                ))}
              </Card>
            ) : null}
          </View>
        )}
      </Screen>
    </View>
  );
}

function Stat({ label, value }: { label: string; value?: number | string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={text.caption}>{label}</Text>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={text.body}>{label}</Text>
      <Text style={text.caption}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  statCard: { flexGrow: 1, minWidth: "30%", alignItems: "center", gap: 2, paddingVertical: space.md },
  statValue: { fontFamily: fontFamily.displayBold, fontSize: 20, color: color.ink },
  bigNumber: { fontFamily: fontFamily.displayBold, fontSize: 28, color: color.good },
});
