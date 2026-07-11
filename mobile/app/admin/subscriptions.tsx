import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, Chip, EmptyState, Screen, SkeletonCard, TextField, toast } from "../../src/components/ui";
import { color, space, text } from "../../src/theme";

export default function AdminSubscriptions() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const subs = useQuery({ queryKey: ["admin-subs", page], queryFn: () => api.adminSubscriptions(page) });

  const [grantEmail, setGrantEmail] = useState("");
  const [grantPlan, setGrantPlan] = useState("");
  const [granting, setGranting] = useState(false);

  const grant = async () => {
    if (!grantEmail.trim() || !grantPlan.trim()) return;
    setGranting(true);
    try {
      await api.adminGrantSubscription(grantEmail.trim(), grantPlan.trim());
      toast.success("Subscription granted");
      setGrantEmail("");
      setGrantPlan("");
      void qc.invalidateQueries({ queryKey: ["admin-subs"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setGranting(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Subscriptions" />
      <Screen scroll padded>
        <Card style={{ gap: space.sm, marginBottom: space.lg }} tint={color.warnSoft}>
          <Text style={text.label}>🎁 Grant a plan for free</Text>
          <Text style={text.caption}>Bypasses payment entirely — use sparingly.</Text>
          <TextField
            label="User email"
            value={grantEmail}
            onChangeText={setGrantEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextField label="Plan ID" value={grantPlan} onChangeText={setGrantPlan} placeholder="plan_xxx (see Billing tab)" />
          <Button label="Grant" variant="cta" size="sm" loading={granting} onPress={() => void grant()} />
        </Card>

        {subs.isLoading ? (
          <SkeletonCard lines={3} />
        ) : !subs.data?.items.length ? (
          <EmptyState emoji="📅" title="No subscriptions" message="Nothing active yet." />
        ) : (
          <View style={{ gap: space.sm }}>
            {subs.data.items.map((s) => (
              <Card key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={text.bodyMedium}>{s.user_email}</Text>
                  <Text style={text.caption}>
                    {s.plan_name || s.plan} · ₹{s.amount}/{s.interval}
                  </Text>
                </View>
                <Chip
                  label={s.status}
                  tint={s.status === "active" ? color.primaryFaint : color.surfaceSunken}
                  textColor={s.status === "active" ? color.primaryDark : color.inkSoft}
                />
              </Card>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.md }}>
              <Button label="‹ Prev" variant="ghost" size="sm" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
              <Text style={[text.caption, { alignSelf: "center" }]}>
                Page {subs.data.page} of {subs.data.pages || 1}
              </Text>
              <Button
                label="Next ›"
                variant="ghost"
                size="sm"
                disabled={page >= (subs.data.pages || 1)}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          </View>
        )}
      </Screen>
    </View>
  );
}
