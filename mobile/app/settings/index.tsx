import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import type { PaymentRecord } from "../../src/api/types";
import { isGuest, useAuth } from "../../src/auth/store";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, Screen, SkeletonCard } from "../../src/components/ui";
import { useSubscriptionStatus } from "../../src/hooks/queries";
import { color, space, text } from "../../src/theme";

export default function Settings() {
  const user = useAuth((s) => s.user);
  const sub = useSubscriptionStatus();
  const [showPayments, setShowPayments] = useState(false);
  const payments = useQuery({
    queryKey: ["payments"],
    queryFn: api.paymentHistory,
    enabled: showPayments,
  });

  const paymentList: PaymentRecord[] = payments.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Settings" />
      <Screen scroll padded testID="settings-screen">
        <Card style={{ gap: 4, marginBottom: space.lg }}>
          <Text style={text.heading}>Account</Text>
          <Text style={text.body}>{user?.email}</Text>
          <Text style={text.caption}>
            {sub.data?.is_subscribed
              ? `⭐ ${sub.data.plan_name || "Elite"} subscriber`
              : "Free plan"}
          </Text>
        </Card>

        <View style={{ gap: space.md }}>
          {!isGuest(user) ? (
            <Button
              label="🔑 Change password"
              variant="ghost"
              onPress={() => router.push("/settings/change-password")}
            />
          ) : (
            <Button
              label="💾 Save my guest account"
              variant="cta"
              onPress={() => router.push("/(auth)/register" as never)}
            />
          )}
          <Button
            label="💳 Plans & refills"
            variant="ghost"
            onPress={() => router.push("/subscription")}
          />
          <Button
            label="📚 Help & resources"
            variant="ghost"
            onPress={() => router.push("/help")}
          />
          <Button
            label="✍️ Author login"
            variant="ghost"
            onPress={() => router.push("/author/login")}
          />
          <Button
            label={showPayments ? "Hide payment history" : "🧾 Payment history"}
            variant="ghost"
            onPress={() => setShowPayments((s) => !s)}
          />
        </View>

        {showPayments ? (
          payments.isLoading ? (
            <View style={{ marginTop: space.lg }}>
              <SkeletonCard lines={2} />
            </View>
          ) : (
            <View style={{ gap: space.md, marginTop: space.lg }}>
              {paymentList.length === 0 ? (
                <Text style={[text.caption, { textAlign: "center" }]}>
                  No payments yet.
                </Text>
              ) : (
                paymentList.map((p, i) => (
                  <Card key={p.id ?? i} style={styles.paymentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={text.bodyMedium}>{paymentLabel(p)}</Text>
                      <Text style={text.caption}>
                        {p.created_at
                          ? new Date(p.created_at).toLocaleString()
                          : ""}
                        {p.coupon_code ? ` · coupon ${p.coupon_code}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={text.heading}>
                        ₹{p.amount ?? "—"}
                      </Text>
                      <Text
                        style={[
                          text.caption,
                          { color: statusColor(p.status) },
                        ]}
                      >
                        {statusLabel(p.status)}
                      </Text>
                    </View>
                  </Card>
                ))
              )}
            </View>
          )
        ) : null}

        <Text style={[text.caption, { textAlign: "center", marginTop: space.xxl }]}>
          resumesGPT mobile · v1.0.0
        </Text>
      </Screen>
    </View>
  );
}

function paymentLabel(p: PaymentRecord): string {
  const kind = p.type === "refill" ? "Refill pack" : "Subscription";
  return p.plan ? `${kind} — ${p.plan}` : kind;
}

function statusLabel(status?: string): string {
  switch (status) {
    case "paid":
      return "✓ Paid";
    case "failed":
      return "✕ Failed";
    case "created":
      return "Pending";
    default:
      return status || "";
  }
}

function statusColor(status?: string): string {
  switch (status) {
    case "paid":
      return color.good;
    case "failed":
      return color.crit;
    default:
      return color.inkFaint;
  }
}

const styles = StyleSheet.create({
  paymentRow: { flexDirection: "row", alignItems: "center", gap: space.md },
});
