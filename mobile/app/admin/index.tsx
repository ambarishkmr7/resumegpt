import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Card, Screen, SkeletonCard } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

const SECTIONS = [
  { emoji: "👥", title: "Users", desc: "Search & review accounts", href: "/admin/users" },
  { emoji: "🧾", title: "Payments", desc: "All transactions", href: "/admin/payments" },
  { emoji: "💳", title: "Billing", desc: "Plans, refills & coupons", href: "/admin/billing" },
  { emoji: "📅", title: "Subscriptions", desc: "Active plans & manual grants", href: "/admin/subscriptions" },
  { emoji: "⏱️", title: "Usage", desc: "Interview minutes by user", href: "/admin/usage" },
  { emoji: "📊", title: "Analytics", desc: "LLM cost & profit/loss", href: "/admin/analytics" },
  { emoji: "📝", title: "CMS pages", desc: "Edit site content", href: "/admin/cms" },
  { emoji: "⚙️", title: "Settings", desc: "Platform-wide config", href: "/admin/settings" },
] as const;

export default function AdminDashboard() {
  const stats = useQuery({ queryKey: ["admin-dashboard"], queryFn: api.adminDashboard });
  const s = stats.data;

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Admin" />
      <Screen scroll padded>
        {stats.isLoading ? (
          <SkeletonCard lines={4} />
        ) : (
          <View style={styles.statGrid}>
            <Stat label="Users" value={s?.total_users} />
            <Stat label="Subscribers" value={s?.total_subscribers} />
            <Stat label="Elite" value={s?.elite_subscribers} />
            <Stat label="Resumes" value={s?.total_resumes} />
            <Stat label="Revenue (₹)" value={s?.total_revenue} />
            <Stat label="Free users" value={s?.users_not_subscribed} />
          </View>
        )}

        <Text style={[text.title, { marginTop: space.xl, marginBottom: space.md }]}>Manage</Text>
        <View style={{ gap: space.md }}>
          {SECTIONS.map((sec) => (
            <Card key={sec.href} testID={`admin-${sec.href.split("/").pop()}`} onPress={() => router.push(sec.href as never)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Text style={{ fontSize: 26 }}>{sec.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={text.heading}>{sec.title}</Text>
                  <Text style={text.caption}>{sec.desc}</Text>
                </View>
                <Text style={{ fontSize: 22, color: color.inkFaint }}>›</Text>
              </View>
            </Card>
          ))}
        </View>
      </Screen>
    </View>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <Card style={styles.statCard}>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={text.caption}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  statCard: { width: "31%", alignItems: "center", gap: 2, paddingVertical: space.md },
  statValue: { fontFamily: fontFamily.displayBold, fontSize: 22, color: color.ink },
});
