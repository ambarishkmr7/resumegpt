import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, Chip, EmptyState, Screen, SkeletonCard } from "../../src/components/ui";
import { color, space, text } from "../../src/theme";

const STATUSES = ["All", "paid", "created", "failed"];

export default function AdminPayments() {
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);

  const payments = useQuery({
    queryKey: ["admin-payments", page, status],
    queryFn: () => api.adminPayments(page, status === "All" ? undefined : status),
  });

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Payments" />
      <Screen scroll padded>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}
        >
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={s}
              selected={status === s}
              onPress={() => {
                setStatus(s);
                setPage(1);
              }}
            />
          ))}
        </ScrollView>

        {payments.isLoading ? (
          <SkeletonCard lines={4} />
        ) : !payments.data?.items.length ? (
          <EmptyState emoji="🧾" title="No payments" message="Nothing matches this filter." />
        ) : (
          <View style={{ gap: space.sm }}>
            {payments.data.items.map((p) => (
              <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={text.bodyMedium}>{p.plan || "—"}</Text>
                  <Text style={text.caption}>{p.user_email}</Text>
                  <Text style={text.caption}>{p.created_at ? new Date(p.created_at).toLocaleString() : ""}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={text.heading}>
                    {p.currency === "INR" ? "₹" : p.currency + " "}
                    {p.amount}
                  </Text>
                  <Text
                    style={[
                      text.caption,
                      { color: p.status === "paid" ? color.good : p.status === "failed" ? color.crit : color.inkFaint },
                    ]}
                  >
                    {p.status}
                  </Text>
                </View>
              </Card>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.md }}>
              <Button label="‹ Prev" variant="ghost" size="sm" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
              <Text style={[text.caption, { alignSelf: "center" }]}>
                Page {payments.data.page} of {payments.data.pages || 1}
              </Text>
              <Button
                label="Next ›"
                variant="ghost"
                size="sm"
                disabled={page >= (payments.data.pages || 1)}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          </View>
        )}
      </Screen>
    </View>
  );
}
